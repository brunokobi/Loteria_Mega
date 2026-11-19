"""Rating Elo dos times, calculado em ordem cronologica (sem olhar o futuro)."""
from collections import defaultdict

import numpy as np

BASE_RATING = 1500.0


def goal_multiplier(goal_diff):
    """Peso pela diferenca de gols (formula do World Football Elo)."""
    n = abs(goal_diff)
    if n <= 1:
        return 1.0
    if n == 2:
        return 1.5
    return (11 + n) / 8


def run_elo(games, k=20.0, home_adv=60.0, use_goals=True):
    """
    Percorre os jogos em ordem e devolve, para cada jogo, o estado ANTES dele:
      - diff: rating do mandante + vantagem de mando - rating do visitante
      - min_games: jogos anteriores do time com menos historico
    e os ratings finais. Jogos com resultado sorteado pela Caixa nao atualizam o rating.
    """
    ratings = defaultdict(lambda: BASE_RATING)
    played = defaultdict(int)
    n = len(games)
    diff = np.empty(n)
    min_games = np.empty(n, dtype=int)

    home = games['home'].to_numpy()
    away = games['away'].to_numpy()
    gh = games['gols_mandante'].to_numpy()
    ga = games['gols_visitante'].to_numpy()
    drawn = games['sorteado'].to_numpy()

    for i in range(n):
        h, a = home[i], away[i]
        d = ratings[h] + home_adv - ratings[a]
        diff[i] = d
        min_games[i] = min(played[h], played[a])
        if drawn[i]:
            continue
        expected = 1 / (1 + 10 ** (-d / 400))
        score = 1.0 if gh[i] > ga[i] else 0.5 if gh[i] == ga[i] else 0.0
        delta = k * (goal_multiplier(gh[i] - ga[i]) if use_goals else 1.0) * (score - expected)
        ratings[h] += delta
        ratings[a] -= delta
        played[h] += 1
        played[a] += 1

    return diff, min_games, dict(ratings), dict(played)
