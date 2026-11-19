"""Geracao de jogos: ponderados pelo modelo e balanceados por criterios estatisticos."""
import numpy as np

from .data import N_NUMBERS
from .stats import count_consecutive


def generate_model_combinations(probs, n_games=100, seed=42):
    """
    Gera n_games jogos unicos sorteando 6 numeros ponderados por probs (indice 0 = numero 1).
    Devolve lista de (numeros, score) em ordem decrescente de score; score = media das probs.
    """
    rng = np.random.RandomState(seed)
    p = probs / probs.sum()
    nums_arr = np.arange(1, N_NUMBERS + 1)
    games, seen = [], set()

    while len(games) < n_games:
        chosen = rng.choice(nums_arr, size=6, replace=False, p=p)
        chosen.sort()
        key = tuple(chosen)
        if key not in seen:
            seen.add(key)
            games.append(([int(n) for n in chosen], float(np.mean(probs[chosen - 1]))))

    # ordena pelo score arredondado (4 casas, como exibido); empates mantem a ordem de geracao
    games.sort(key=lambda g: -round(g[1], 4))
    return games


def generate_balanced_game(rng, attempts=800):
    """
    Gera um jogo balanceado:
      - soma entre 110 e 230 (media historica ~183)
      - 2 a 4 numeros pares
      - no maximo 1 par consecutivo
      - pelo menos 3 decadas diferentes
    Se nenhuma tentativa passar, devolve um jogo aleatorio.
    """
    for _ in range(attempts):
        nums = sorted(rng.choice(range(1, 61), size=6, replace=False).tolist())
        s = sum(nums)
        evens = sum(1 for n in nums if n % 2 == 0)
        consec = sum(1 for i in range(5) if nums[i + 1] - nums[i] == 1)
        decades = len(set((n - 1) // 10 for n in nums))
        if 110 <= s <= 230 and 2 <= evens <= 4 and consec <= 1 and decades >= 3:
            return nums
    return sorted(rng.choice(range(1, 61), size=6, replace=False).tolist())


def balanced_samples(n_games=10, seed=99):
    """n_games jogos balanceados unicos, com suas caracteristicas."""
    rng = np.random.RandomState(seed)
    games, seen = [], set()
    while len(games) < n_games:
        game = generate_balanced_game(rng)
        key = tuple(game)
        if key in seen:
            continue
        seen.add(key)
        evens = sum(1 for n in game if n % 2 == 0)
        games.append({
            "numbers": game,
            "sum": sum(game),
            "even": evens,
            "odd": 6 - evens,
            "decades": len(set((n - 1) // 10 for n in game)),
            "consecutive": count_consecutive(game),
        })
    return games
