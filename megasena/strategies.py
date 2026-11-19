"""Comparacao de estrategias de aposta contra o valor teorico (hipergeometrica)."""
from math import comb, sqrt

import numpy as np

from .combinations import generate_balanced_game
from .data import N_NUMBERS, draw_matrix

STRATEGIES = ['Aleatoria', 'Quentes', 'Frias', 'Balanceada']
PRIZE_KEYS = {3: 'tres', 4: 'quadra', 5: 'quina', 6: 'sena'}


def hypergeom_probs():
    """P(k acertos) para um jogo de 6 numeros entre 60, k = 0..6."""
    total = comb(N_NUMBERS, 6)
    return [comb(6, k) * comb(N_NUMBERS - 6, 6 - k) / total for k in range(7)]


def hypergeom_expected(n_test):
    """Valores teoricos: media e desvio de acertos por jogo e contagens esperadas de premios."""
    probs = hypergeom_probs()
    mean = sum(k * p for k, p in enumerate(probs))
    var = sum((k - mean) ** 2 * p for k, p in enumerate(probs))
    return {
        "mean_hits": round(mean, 6),
        "std_hits": round(sqrt(var), 6),
        "probs": {key: probs[k] for k, key in PRIZE_KEYS.items()},
        "expected_counts": {key: probs[k] * n_test for k, key in PRIZE_KEYS.items()},
    }


def hot_cold_picks(counts):
    """
    6 numeros mais (Quentes) e menos (Frias) sorteados dado um vetor de contagens
    (indice 0 = numero 1). Empate: menor numero primeiro.
    """
    nums = np.arange(1, N_NUMBERS + 1)
    hot = nums[np.lexsort((nums, -counts))][:6]
    cold = nums[np.lexsort((nums, counts))][:6]
    return {int(n) for n in hot}, {int(n) for n in cold}


def compare_strategies(df, n_test=500, seed=42):
    """
    Simula 4 estrategias nos ultimos n_test sorteios e conta acertos reais.
    Cada aposta usa apenas sorteios anteriores (Quentes/Frias recalculadas a cada sorteio).
      - Aleatoria  : 6 numeros aleatorios
      - Quentes    : 6 mais frequentes ate o sorteio anterior
      - Frias      : 6 menos frequentes ate o sorteio anterior
      - Balanceada : jogo com criterios estatisticos
    """
    matrix = draw_matrix(df)
    n_train = len(matrix) - n_test
    counts = matrix[:n_train].sum(axis=0)
    rng = np.random.RandomState(seed)
    hits = {s: [] for s in STRATEGIES}

    for i in range(n_train, len(matrix)):
        actual = set((np.flatnonzero(matrix[i]) + 1).tolist())
        hot, cold = hot_cold_picks(counts)
        # ordem de consumo do rng: aleatoria e depois balanceada
        picks = {
            'Aleatoria': set(rng.choice(range(1, 61), size=6, replace=False).tolist()),
            'Balanceada': None,
            'Quentes': hot,
            'Frias': cold,
        }
        picks['Balanceada'] = set(generate_balanced_game(rng))
        for name in STRATEGIES:
            hits[name].append(len(actual & picks[name]))
        counts = counts + matrix[i]

    results = {}
    for name in STRATEGIES:
        h = np.array(hits[name])
        mean = float(h.mean())
        std = float(h.std(ddof=1))
        half = 1.96 * std / sqrt(n_test)
        results[name] = {
            **{key: int((h == k).sum()) for k, key in PRIZE_KEYS.items()},
            "avg_hits": round(mean, 3),
            "std_hits": round(std, 3),
            "ci95": [round(mean - half, 3), round(mean + half, 3)],
        }
    return results
