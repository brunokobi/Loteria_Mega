import pandas as pd
import numpy as np
from collections import Counter
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score
import warnings
warnings.filterwarnings('ignore')

# ============================================================
# MEGA-SENA IA - Versao com Validacao e Analise Estatistica
# ============================================================

# --- 1. Carregar e Preparar Dados ---
nome_arquivo = 'lottery-br-mega-sena.csv'
df = pd.read_csv(nome_arquivo)
df = df.sort_values(by='DrawDate').reset_index(drop=True)
cols_bolas = ['Ball1', 'Ball2', 'Ball3', 'Ball4', 'Ball5', 'Ball6']
N = len(df)

data_inicio = str(df['DrawDate'].iloc[0])[:10]
data_fim = str(df['DrawDate'].iloc[-1])[:10]
print(f"Dataset carregado: {N} sorteios ({data_inicio} -> {data_fim})\n")

# ============================================================
# 2. ANALISE ESTATISTICA DESCRITIVA
# ============================================================

print("=" * 60)
print("ANALISE ESTATISTICA DESCRITIVA")
print("=" * 60)

todos_numeros = df[cols_bolas].values.flatten()
freq_counter = Counter(int(n) for n in todos_numeros)
freq_df = pd.DataFrame({
    'Numero': list(freq_counter.keys()),
    'Frequencia': list(freq_counter.values())
}).sort_values('Frequencia', ascending=False).reset_index(drop=True)
freq_df['Freq_%'] = (freq_df['Frequencia'] / N * 100).round(2)

print("\nTop 10 Numeros Mais Frequentes:")
for _, row in freq_df.head(10).iterrows():
    bar = '#' * int(row['Freq_%'] * 2)
    print(f"  {int(row['Numero']):>3} | {bar:<20} {row['Frequencia']}x ({row['Freq_%']}%)")

print("\nTop 10 Numeros Menos Frequentes:")
for _, row in freq_df.tail(10).iterrows():
    bar = '#' * int(row['Freq_%'] * 2)
    print(f"  {int(row['Numero']):>3} | {bar:<20} {row['Frequencia']}x ({row['Freq_%']}%)")

# Par / Impar
total = len(todos_numeros)
pares = sum(1 for n in todos_numeros if int(n) % 2 == 0)
impares = total - pares
print(f"\nPar/Impar:")
print(f"  Pares:   {pares:6d} ({pares/total*100:.1f}%)")
print(f"  Impares: {impares:6d} ({impares/total*100:.1f}%)")
print(f"  Esperado aleatorio: ~50% / ~50%")

# Decadas
print(f"\nDistribuicao por Decadas:")
decadas = [(1, 10), (11, 20), (21, 30), (31, 40), (41, 50), (51, 60)]
esperado = total / 6
for a, b in decadas:
    count = sum(1 for n in todos_numeros if a <= int(n) <= b)
    diff = count - esperado
    sinal = '+' if diff >= 0 else ''
    print(f"  {a:02d}-{b:02d}: {count:5d} ({count/total*100:.1f}%)  desvio do esperado: {sinal}{diff:.0f}")

# Soma dos sorteios
somas = df[cols_bolas].sum(axis=1)
print(f"\nSoma dos 6 numeros por sorteio:")
print(f"  Min={somas.min():.0f}  Media={somas.mean():.1f}  Max={somas.max():.0f}  Desvio={somas.std():.1f}")

# Pares consecutivos por sorteio
def count_consecutivos(row):
    nums = sorted(row)
    return sum(1 for i in range(len(nums) - 1) if nums[i + 1] - nums[i] == 1)

consecutivos = df[cols_bolas].apply(count_consecutivos, axis=1)
print(f"\nPares consecutivos por sorteio:")
print(f"  Media={consecutivos.mean():.2f}  Max={consecutivos.max():.0f}")
print(f"  Sorteios sem nenhum consecutivo: {(consecutivos == 0).sum()} ({(consecutivos == 0).mean()*100:.1f}%)")


# ============================================================
# 3. FEATURE ENGINEERING + BUILD DATASET
# ============================================================

def build_dataset(df, cols_bolas, n_ultimos=20):
    """
    Constroi dataset com 5 features por numero em cada sorteio.
    Features sao computadas com estado ANTERIOR ao sorteio (sem data leakage).

    Features:
      - atraso         : sorteios desde a ultima aparicao
      - paridade       : 1=par, 0=impar
      - freq_relativa  : frequencia acumulada ate o sorteio anterior
      - decada         : faixa 0-5  (ex: 1-10=0, 11-20=1, ...)
      - freq_recente   : aparicoes nas ultimas n_ultimos jogadas
    """
    n = len(df)
    atrasos = {num: 0 for num in range(1, 61)}
    contagem = {num: 0 for num in range(1, 61)}
    hist_recente = {num: 0 for num in range(1, 61)}
    janela = []

    X, y = [], []

    for i in range(n):
        numeros_sorteados = set(int(v) for v in df.iloc[i][cols_bolas].values)

        # Registrar features com estado ANTES deste sorteio
        for num in range(1, 61):
            X.append([
                atrasos[num],
                1 if num % 2 == 0 else 0,
                contagem[num] / max(i, 1),
                (num - 1) // 10,
                hist_recente[num],
            ])
            y.append(1 if num in numeros_sorteados else 0)

        # Atualizar estado APOS registrar as features
        if len(janela) >= n_ultimos:
            saindo = janela.pop(0)
            for num in saindo:
                hist_recente[num] -= 1
        janela.append(numeros_sorteados)

        for num in range(1, 61):
            if num in numeros_sorteados:
                hist_recente[num] += 1
                contagem[num] += 1
                atrasos[num] = 0
            else:
                atrasos[num] += 1

    return np.array(X), np.array(y), atrasos, contagem, hist_recente


# ============================================================
# 4. VALIDACAO TEMPORAL
# ============================================================

print("\n" + "=" * 60)
print("VALIDACAO TEMPORAL (Train 80% / Test 20%)")
print("=" * 60)

split = int(N * 0.8)
print(f"Treino: {split} sorteios | Teste: {N - split} sorteios")
print("Construindo dataset completo...")

X_full, y_full, atrasos_final, contagem_final, hist_final = build_dataset(df, cols_bolas)

# Split temporal: cada sorteio gera 60 registros (um por numero)
idx_split = split * 60
X_train_v, y_train_v = X_full[:idx_split], y_full[:idx_split]
X_test_v, y_test_v = X_full[idx_split:], y_full[idx_split:]

print(f"Treinando modelo de validacao ({len(X_train_v)} registros treino)...")
clf_val = GradientBoostingClassifier(
    n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42
)
clf_val.fit(X_train_v, y_train_v)
probs_val = clf_val.predict_proba(X_test_v)[:, 1]

auc_modelo = roc_auc_score(y_test_v, probs_val)
# Baseline: probabilidade constante 6/60 = 10% para todos os numeros
baseline_probs = np.full(len(y_test_v), 6.0 / 60.0)
auc_baseline = roc_auc_score(y_test_v, baseline_probs)

print(f"\nResultados da Validacao:")
print(f"  AUC-ROC Modelo GradientBoosting: {auc_modelo:.4f}")
print(f"  AUC-ROC Baseline (prob. 6/60):   {auc_baseline:.4f}")
diff = auc_modelo - auc_baseline
print(f"  Diferenca:                       {diff:+.4f}")

if diff > 0.01:
    print(f"\n  Modelo levemente acima do baseline.")
else:
    print(f"\n  CONCLUSAO: Modelo NAO supera o baseline de forma significativa.")
    print(f"  AUC proximo de 0.5 e esperado para processos verdadeiramente aleatorios.")
    print(f"  Isso confirma a natureza aleatoria da Mega-Sena.")

# Importancia das features
feature_names = ['atraso', 'paridade', 'freq_relativa', 'decada', 'freq_recente']
importancias = clf_val.feature_importances_
print(f"\nImportancia das Features (modelo de validacao):")
for nome, imp in sorted(zip(feature_names, importancias), key=lambda x: -x[1]):
    bar = '#' * int(imp * 100)
    print(f"  {nome:<15} {bar:<30} {imp:.4f}")


# ============================================================
# 5. TREINAMENTO FINAL COM TODO O HISTORICO
# ============================================================

print("\n" + "=" * 60)
print("TREINAMENTO FINAL COM HISTORICO COMPLETO")
print("=" * 60)
print(f"Total de registros: {len(X_full)}")

clf = GradientBoostingClassifier(
    n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42
)
clf.fit(X_full, y_full)
print("Modelo treinado com sucesso.")

# Estado atual para predicao do proximo sorteio
freq_atual = {n: contagem_final[n] / N for n in range(1, 61)}
estado_atual = np.array([
    [
        atrasos_final[n],
        1 if n % 2 == 0 else 0,
        freq_atual[n],
        (n - 1) // 10,
        hist_final[n],
    ]
    for n in range(1, 61)
])

probs = clf.predict_proba(estado_atual)[:, 1]
df_probs = pd.DataFrame({'Numero': range(1, 61), 'Probabilidade': probs})

print("\nTop 10 numeros por probabilidade estimada:")
top_nums = df_probs.sort_values('Probabilidade', ascending=False).head(10)
for _, row in top_nums.iterrows():
    print(f"  Numero {int(row['Numero']):>3}: {row['Probabilidade']:.4f}")


# ============================================================
# 6. GERAR COMBINACOES
# ============================================================

todas_combinacoes = []
seen = set()
rng = np.random.RandomState(42)

p = df_probs['Probabilidade'].values.copy()
p = p / p.sum()

while len(todas_combinacoes) < 100:
    escolhidos = rng.choice(df_probs['Numero'].values, size=6, replace=False, p=p)
    escolhidos.sort()
    key = tuple(escolhidos)
    if key not in seen:
        seen.add(key)
        score = df_probs[df_probs['Numero'].isin(escolhidos)]['Probabilidade'].mean()
        todas_combinacoes.append(([int(n) for n in escolhidos], score))

todas_combinacoes.sort(key=lambda x: x[1], reverse=True)
top_10 = todas_combinacoes[:10]

print("\n" + "=" * 60)
print("TOP 10 COMBINACOES GERADAS")
print("-" * 60)
for i, (jogo, score) in enumerate(top_10, 1):
    print(f"#{i:<4} | {str(jogo):<34} | score: {score:.4f}")
print("=" * 60)

print("\nLEMBRETE: Este e um projeto educacional.")
print("AUC ~ 0.5 confirma: loterias sao aleatorias por design.")
print("Nenhum modelo pode prever resultados futuros com confiabilidade.\n")
