"""Estatisticas descritivas do historico de sorteios."""
from collections import Counter

from .data import COLS, N_NUMBERS

DECADE_RANGES = [(1, 10), (11, 20), (21, 30), (31, 40), (41, 50), (51, 60)]


def count_consecutive(numbers):
    """Quantidade de pares de numeros consecutivos em um jogo."""
    nums = sorted(numbers)
    return sum(1 for i in range(len(nums) - 1) if nums[i + 1] - nums[i] == 1)


def descriptive_stats(df):
    """Frequencias, par/impar, decadas, soma e consecutivos de todo o historico."""
    n_draws = len(df)
    balls = df[COLS].to_numpy()
    all_numbers = [int(n) for n in balls.ravel()]
    total = len(all_numbers)
    freq = Counter(all_numbers)

    numbers = [
        {"n": n, "freq": freq.get(n, 0), "pct": round(freq.get(n, 0) / n_draws * 100, 2)}
        for n in range(1, N_NUMBERS + 1)
    ]

    even = sum(1 for n in all_numbers if n % 2 == 0)

    decades = []
    for a, b in DECADE_RANGES:
        count = sum(1 for n in all_numbers if a <= n <= b)
        decades.append({
            "label": f"{a:02d}-{b:02d}",
            "count": count,
            "pct": round(count / total * 100, 1),
        })

    sums = df[COLS].sum(axis=1)
    consec = df[COLS].apply(count_consecutive, axis=1)

    return {
        "numbers": numbers,
        "even_odd": {
            "even": even,
            "odd": total - even,
            "even_pct": round(even / total * 100, 1),
            "odd_pct": round((total - even) / total * 100, 1),
        },
        "decades": decades,
        "sum_stats": {
            "min": int(sums.min()),
            "mean": round(float(sums.mean()), 1),
            "max": int(sums.max()),
            "std": round(float(sums.std()), 1),
        },
        "consecutive": {
            "mean": round(float(consec.mean()), 2),
            "max": int(consec.max()),
            "none_pct": round(float((consec == 0).mean() * 100), 1),
        },
    }
