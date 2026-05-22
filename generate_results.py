"""
Gera results.json com a analise completa da Mega-Sena.
Executado pelo Netlify durante o build. Resultado consumido pelo index.html.
"""
import json
import warnings
from collections import Counter
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score

warnings.filterwarnings('ignore')

ARQUIVO = 'lottery-br-mega-sena.csv'
COLS_BOLAS = ['Ball1', 'Ball2', 'Ball3', 'Ball4', 'Ball5', 'Ball6']
N_ULTIMOS = 20


def build_dataset(df):
    n = len(df)
    atrasos = {num: 0 for num in range(1, 61)}
    contagem = {num: 0 for num in range(1, 61)}
    hist_recente = {num: 0 for num in range(1, 61)}
    janela = []
    X, y = [], []

    for i in range(n):
        nums = set(int(v) for v in df.iloc[i][COLS_BOLAS].values)

        for num in range(1, 61):
            X.append([
                atrasos[num],
                1 if num % 2 == 0 else 0,
                contagem[num] / max(i, 1),
                (num - 1) // 10,
                hist_recente[num],
            ])
            y.append(1 if num in nums else 0)

        if len(janela) >= N_ULTIMOS:
            saindo = janela.pop(0)
            for num in saindo:
                hist_recente[num] -= 1
        janela.append(nums)

        for num in range(1, 61):
            if num in nums:
                hist_recente[num] += 1
                contagem[num] += 1
                atrasos[num] = 0
            else:
                atrasos[num] += 1

    return np.array(X), np.array(y), atrasos, contagem, hist_recente


def generate_balanced_game(rng, attempts=800):
    """
    Gera um jogo balanceado com criterios estatisticos:
      - Soma entre 110 e 230 (media historica: 183)
      - 2 a 4 numeros pares
      - No maximo 1 par consecutivo
      - Pelo menos 3 decadas diferentes cobertas
    """
    for _ in range(attempts):
        nums = sorted(rng.choice(range(1, 61), size=6, replace=False).tolist())
        s      = sum(nums)
        evens  = sum(1 for n in nums if n % 2 == 0)
        consec = sum(1 for i in range(5) if nums[i + 1] - nums[i] == 1)
        decades = len(set((n - 1) // 10 for n in nums))
        if 110 <= s <= 230 and 2 <= evens <= 4 and consec <= 1 and decades >= 3:
            return nums
    return sorted(rng.choice(range(1, 61), size=6, replace=False).tolist())


def compare_strategies(df, cols_bolas, n_test=500):
    """
    Simula 4 estrategias nos ultimos n_test sorteios e conta acertos reais.
    Usa apenas dados historicos anteriores a cada sorteio (sem data leakage).

    Estrategias:
      - Aleatoria  : 6 numeros aleatorios
      - Quentes    : os 6 numeros mais frequentes historicamente
      - Frias      : os 6 numeros menos frequentes historicamente
      - Balanceada : jogo com criterios estatisticos
    """
    N = len(df)
    n_train = N - n_test

    hist_nums = df.iloc[:n_train][cols_bolas].values.flatten()
    freq = Counter(int(n) for n in hist_nums)
    freq_sorted = sorted(range(1, 61), key=lambda n: -freq.get(n, 0))

    hot_pick  = set(freq_sorted[:6])
    cold_pick = set(freq_sorted[-6:])

    counts      = {s: {3: 0, 4: 0, 5: 0, 6: 0} for s in ['Aleatoria', 'Quentes', 'Frias', 'Balanceada']}
    total_hits  = {s: 0 for s in counts}
    rng = np.random.RandomState(42)

    for i in range(n_test):
        actual = set(int(v) for v in df.iloc[n_train + i][cols_bolas].values)
        random_pick   = set(rng.choice(range(1, 61), size=6, replace=False).tolist())
        balanced_pick = set(generate_balanced_game(rng))

        for name, pick in [('Aleatoria', random_pick), ('Quentes', hot_pick),
                            ('Frias', cold_pick), ('Balanceada', balanced_pick)]:
            m = len(actual & pick)
            total_hits[name] += m
            if m in counts[name]:
                counts[name][m] += 1

    results = {}
    for name, c in counts.items():
        results[name] = {
            'tres':    c[3],
            'quadra':  c[4],
            'quina':   c[5],
            'sena':    c[6],
            'avg_hits': round(total_hits[name] / n_test, 3)
        }
    return results


def main():
    print("Carregando dados...")
    df = pd.read_csv(ARQUIVO)
    df = df.sort_values(by='DrawDate').reset_index(drop=True)
    N = len(df)
    data_inicio = str(df['DrawDate'].iloc[0])[:10]
    data_fim = str(df['DrawDate'].iloc[-1])[:10]
    print(f"{N} sorteios ({data_inicio} -> {data_fim})")

    # --- Estatisticas descritivas ---
    todos = df[COLS_BOLAS].values.flatten()
    freq_c = Counter(int(n) for n in todos)
    total = len(todos)

    numbers_data = [
        {"n": n, "freq": freq_c.get(n, 0), "pct": round(freq_c.get(n, 0) / N * 100, 2)}
        for n in range(1, 61)
    ]

    pares = sum(1 for n in todos if int(n) % 2 == 0)

    decadas = []
    for a, b in [(1, 10), (11, 20), (21, 30), (31, 40), (41, 50), (51, 60)]:
        count = sum(1 for n in todos if a <= int(n) <= b)
        decadas.append({"label": f"{a:02d}-{b:02d}", "count": count, "pct": round(count / total * 100, 1)})

    somas = df[COLS_BOLAS].sum(axis=1)

    def count_consec(row):
        nums = sorted(row)
        return sum(1 for i in range(len(nums) - 1) if nums[i + 1] - nums[i] == 1)

    consec = df[COLS_BOLAS].apply(count_consec, axis=1)

    # --- Build dataset completo ---
    print("Construindo dataset...")
    X_full, y_full, atrasos_f, contagem_f, hist_f = build_dataset(df)

    # --- Validacao temporal ---
    print("Validando modelo (train 80% / test 20%)...")
    split = int(N * 0.8)
    idx_split = split * 60
    clf_val = GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42)
    clf_val.fit(X_full[:idx_split], y_full[:idx_split])
    probs_val = clf_val.predict_proba(X_full[idx_split:])[:, 1]

    auc_model = float(roc_auc_score(y_full[idx_split:], probs_val))
    auc_baseline = float(roc_auc_score(y_full[idx_split:], np.full(len(y_full) - idx_split, 6.0 / 60.0)))

    feature_names = ['atraso', 'paridade', 'freq_relativa', 'decada', 'freq_recente']
    feat_imp = sorted(
        [{"name": n, "value": round(float(v), 4)} for n, v in zip(feature_names, clf_val.feature_importances_)],
        key=lambda x: -x['value']
    )

    # --- Modelo final com todo o historico ---
    print("Treinando modelo final...")
    clf = GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42)
    clf.fit(X_full, y_full)

    estado = np.array([
        [atrasos_f[n], 1 if n % 2 == 0 else 0, contagem_f[n] / N, (n - 1) // 10, hist_f[n]]
        for n in range(1, 61)
    ])
    probs = clf.predict_proba(estado)[:, 1]

    for item in numbers_data:
        item['prob'] = round(float(probs[item['n'] - 1]), 4)
        item['delay'] = atrasos_f[item['n']]

    # --- Gerar combinacoes ---
    print("Gerando combinacoes...")
    todas = []
    seen = set()
    rng = np.random.RandomState(42)
    p = probs / probs.sum()
    nums_arr = np.arange(1, 61)

    while len(todas) < 100:
        escolhidos = rng.choice(nums_arr, size=6, replace=False, p=p)
        escolhidos.sort()
        key = tuple(escolhidos)
        if key not in seen:
            seen.add(key)
            score = float(np.mean(probs[escolhidos - 1]))
            todas.append({"numbers": [int(n) for n in escolhidos], "score": round(score, 4)})

    todas.sort(key=lambda x: -x['score'])

    # --- Combinacoes balanceadas ---
    print("Gerando combinacoes balanceadas...")
    balanced_combos = []
    seen_b = set()
    b_rng = np.random.RandomState(99)
    while len(balanced_combos) < 10:
        game = generate_balanced_game(b_rng)
        key = tuple(game)
        if key not in seen_b:
            seen_b.add(key)
            evens   = sum(1 for n in game if n % 2 == 0)
            decades = len(set((n - 1) // 10 for n in game))
            n_consec = sum(1 for i in range(5) if game[i + 1] - game[i] == 1)
            balanced_combos.append({
                "numbers": game,
                "sum": sum(game),
                "even": evens,
                "odd": 6 - evens,
                "decades": decades,
                "consecutive": n_consec
            })

    # --- Comparacao de estrategias ---
    print("Comparando estrategias (ultimos 500 sorteios)...")
    strategies = compare_strategies(df, COLS_BOLAS)

    # --- Montar JSON final ---
    results = {
        "meta": {
            "total_draws": N,
            "date_start": data_inicio,
            "date_end": data_fim,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M")
        },
        "combinations": todas[:10],
        "numbers": numbers_data,
        "even_odd": {
            "even_pct": round(pares / total * 100, 1),
            "odd_pct": round((total - pares) / total * 100, 1)
        },
        "decades": decadas,
        "sum_stats": {
            "min": int(somas.min()),
            "mean": round(float(somas.mean()), 1),
            "max": int(somas.max()),
            "std": round(float(somas.std()), 1)
        },
        "consecutive": {
            "mean": round(float(consec.mean()), 2),
            "none_pct": round(float((consec == 0).mean() * 100), 1)
        },
        "validation": {
            "auc_model": round(auc_model, 4),
            "auc_baseline": round(auc_baseline, 4),
            "train_draws": split,
            "test_draws": N - split,
            "feature_importance": feat_imp
        },
        "balanced_combinations": balanced_combos,
        "strategies": {
            "draws_tested": 500,
            "results": strategies
        }
    }

    with open('results.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("results.json gerado com sucesso!")


if __name__ == '__main__':
    main()
