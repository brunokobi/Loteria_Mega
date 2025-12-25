import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier

# --- 1. Carregar e Preparar Dados ---
nome_arquivo = 'lottery-br-mega-sena.csv'
df = pd.read_csv(nome_arquivo)
df = df.sort_values(by='DrawDate').reset_index(drop=True)
cols_bolas = ['Ball1', 'Ball2', 'Ball3', 'Ball4', 'Ball5', 'Ball6']

print(f"⚙️ Iniciando treinamento com TODO o dataset ({len(df)} sorteios)...")

# --- 2. Treinar Modelo (Gradient Boosting) ---
atrasos = {n: 0 for n in range(1, 61)}
dataset_X, dataset_y = [], []

# Percorrer TODOS os sorteios da história para treinar a IA
for i in range(len(df)):
    numeros_sorteados = set(df.iloc[i][cols_bolas].values)
    for num in range(1, 61):
        # Features: Atraso atual e se é par
        dataset_X.append([atrasos[num], 1 if num % 2 == 0 else 0])
        
        if num in numeros_sorteados:
            dataset_y.append(1)
            atrasos[num] = 0
        else:
            dataset_y.append(0)
            atrasos[num] += 1

X_train = np.array(dataset_X)
y_train = np.array(dataset_y)

print(f"📊 Dataset de treino criado com {len(X_train)} registros.")
clf = GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42)
clf.fit(X_train, y_train)

# --- 3. Calcular Probabilidades ---
estado_atual_X = np.array([[atrasos[num], 1 if num % 2 == 0 else 0] for num in range(1, 61)])
probs = clf.predict_proba(estado_atual_X)[:, 1]
df_probs = pd.DataFrame({'Numero': range(1, 61), 'Probabilidade': probs})

# --- 4. Gerar 100 combinações e Selecionar 10 Melhores ---
todas_combinacoes = []
seen = set()

while len(todas_combinacoes) < 100:
    escolhidos = np.random.choice(
        df_probs['Numero'].values, 
        size=6, 
        replace=False, 
        p=df_probs['Probabilidade'].values / df_probs['Probabilidade'].values.sum()
    )
    escolhidos.sort()
    if tuple(escolhidos) not in seen:
        seen.add(tuple(escolhidos))
        score = df_probs[df_probs['Numero'].isin(escolhidos)]['Probabilidade'].mean()
        todas_combinacoes.append(([int(n) for n in escolhidos], score))

todas_combinacoes.sort(key=lambda x: x[1], reverse=True)
top_10 = todas_combinacoes[:10]

# --- 5. Exibir Resultado ---
print("\n" + "="*60)
print("🤖 IA TREINADA COM HISTÓRICO COMPLETO")
print("-" * 60)
for i, (jogo, score) in enumerate(top_10, 1):
    print(f"#{i:<4} | {str(jogo):<30} | {score:.4f}")
print("="*60)