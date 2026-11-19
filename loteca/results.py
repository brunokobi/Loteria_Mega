"""Monta o loteca.json consumido pela aba Loteca do site."""
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np

from .backtest import _split, run_backtest, run_odds_comparison, tune
from .data import OUTCOMES, load_games
from .elo import run_elo
from .live import fetch_upcoming
from .model import NEW_TEAM_GAMES, fit_outcome_model, predict_proba
from .update import fetch_round

TIMEZONE = ZoneInfo('America/Sao_Paulo')
MIN_TEAM_GAMES = 3  # times com menos jogos ficam fora da lista de busca do site

# regras de preco da Loteca (confirmar na Caixa: valores podem mudar)
PRICING = {
    "price_per_combination": 2.0,  # aposta minima R$ 4,00 = 1 duplo = 2 combinacoes
    "min_combinations": 2,
    "max_doubles": 5,
    "max_triples": 3,
}


def _display(key):
    name, _, uf = key.rpartition('/')
    name = name or key
    return {"name": name.title(), "uf": uf}


def _next_round(log):
    try:
        d = fetch_round(None)
        return {"number": d.get('numeroConcursoProximo'), "date": d.get('dataProximoConcurso')}
    except Exception as exc:
        log(f"Aviso: nao foi possivel consultar o proximo concurso da Loteca ({exc}).")
        return None


def build_loteca(log=print, fetch_live=True):
    games = load_games()
    warm, cut = _split(games)
    log("Loteca: ajustando o Elo...")
    params = tune(games, warm, cut)

    log("Loteca: teste no passado...")
    backtest = run_backtest(games, params=params)
    odds_cmp = run_odds_comparison(games, params=params)

    # modelo final com todo o historico (depois do aquecimento) para os jogos da semana
    diff, ming, ratings, played = run_elo(games, k=params['k'], home_adv=params['home_adv'])
    rounds = games['concurso'].to_numpy()
    mask = rounds >= warm
    model = fit_outcome_model(diff[mask], ming[mask], games['y'].to_numpy()[mask])

    upcoming = fetch_upcoming(ratings, log=log) if fetch_live else []
    for g in upcoming:
        h, a = g['home_key'], g['away_key']
        if h and a:
            d = np.array([ratings[h] + params['home_adv'] - ratings[a]])
            m = np.array([min(played.get(h, 0), played.get(a, 0))])
            g['elo'] = predict_proba(model, d, m)[0].round(4).tolist()
        for side in ('home_key', 'away_key'):
            if g[side]:
                g[side.replace('_key', '_rating')] = round(ratings[g[side]], 1)

    last_round = games[games['concurso'] == rounds.max()]
    teams = sorted(
        ({"key": k, **_display(k), "rating": round(r, 1), "games": played.get(k, 0)}
         for k, r in ratings.items() if played.get(k, 0) >= MIN_TEAM_GAMES),
        key=lambda t: (t['name'], t['uf']),
    )
    coef = np.zeros((3, model.coef_.shape[1]))
    intercept = np.zeros(3)
    coef[model.classes_] = model.coef_
    intercept[model.classes_] = model.intercept_

    return {
        "meta": {
            "generated_at": datetime.now(TIMEZONE).strftime("%Y-%m-%d %H:%M"),
            "rounds": int(rounds.max()),
            "games": int(len(games)),
            "last_round_date": str(last_round['data'].max()),
            "next_round": _next_round(log) if fetch_live else None,
        },
        "model": {
            "outcomes": OUTCOMES,
            "k": params['k'], "home_adv": params['home_adv'],
            "new_team_games": NEW_TEAM_GAMES,
            "coef": coef.round(6).tolist(), "intercept": intercept.round(6).tolist(),
        },
        "backtest": backtest,
        "odds_comparison": odds_cmp,
        "upcoming": upcoming,
        "teams": teams,
        "pricing": PRICING,
    }
