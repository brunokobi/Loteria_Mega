"""Monta o loteca.json consumido pela aba Loteca do site."""
import json
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np

from .backtest import _split, run_backtest, run_odds_comparison, tune
from .data import OUTCOMES, load_games, merge_name_variants
from .elo import run_elo
from .live import (
    build_team_lookup,
    fetch_programacao,
    fetch_upcoming,
    match_fixture,
    resolve_team,
)
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
        dd, mm, yy = (d.get('dataProximoConcurso') or '//').split('/')
        return {"number": d.get('numeroConcursoProximo'), "date": f"{yy}-{mm}-{dd}" if yy else None}
    except Exception as exc:
        log(f"Aviso: nao foi possivel consultar o proximo concurso da Loteca ({exc}).")
        return None


def _previous_rounds(site_url, log):
    """Programacao publicada no deploy anterior (se a Caixa falhar neste build)."""
    if not site_url:
        return []
    try:
        req = urllib.request.Request(site_url.rstrip('/') + '/loteca.json',
                                     headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=20) as resp:
            rounds = json.load(resp).get('rounds') or []
        today = datetime.now(TIMEZONE).date().isoformat()
        rounds = [r for r in rounds if (r.get('bets_until') or '') >= today]
        log(f"Loteca: usando a programacao do deploy anterior ({len(rounds)} concurso(s)).")
        return rounds
    except Exception as exc:
        log(f"Aviso: programacao do deploy anterior indisponivel ({exc}).")
        return []


def build_loteca(log=print, fetch_live=True, site_url=None):
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

    def elo_probs(h, a):
        d = np.array([ratings[h] + params['home_adv'] - ratings[a]])
        m = np.array([min(played.get(h, 0), played.get(a, 0))])
        return predict_proba(model, d, m)[0].round(4).tolist()

    upcoming = fetch_upcoming(ratings, days=14, log=log) if fetch_live else []
    for g in upcoming:
        h, a = g['home_key'], g['away_key']
        if h and a:
            g['elo'] = elo_probs(h, a)

    # os 14 jogos de cada concurso aberto (programacao oficial da Caixa)
    raw = load_games(merge_variants=False)
    lookup = build_team_lookup(set(raw['home']) | set(raw['away']),
                               merge_name_variants(raw), ratings, played)
    open_rounds = fetch_programacao(log=log) if fetch_live else []
    if not open_rounds and fetch_live:
        open_rounds = _previous_rounds(site_url, log)
    for rnd in open_rounds:
        for g in rnd['games']:
            g['home_key'] = resolve_team(g['home'], g['home_uf'], lookup)
            g['away_key'] = resolve_team(g['away'], g['away_uf'], lookup)
            g['elo'] = elo_probs(g['home_key'], g['away_key']) \
                if g['home_key'] and g['away_key'] else None
            fx = match_fixture(g, upcoming)
            g['odds'] = fx['odds'] if fx else None
            g['odds_tournament'] = fx['tournament'] if fx else None
            g['kickoff'] = fx['start'] if fx else None
        with_odds = sum(1 for g in rnd['games'] if g['odds'])
        log(f"Loteca: concurso {rnd['number']}: {len(rnd['games'])} jogos, {with_odds} com odds.")

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
            "next_round": ({"number": open_rounds[0]['number'], "date": open_rounds[0]['date'],
                            "bets_until": open_rounds[0]['bets_until'],
                            "bets_until_hour": open_rounds[0]['bets_until_hour']}
                           if open_rounds else (_next_round(log) if fetch_live else None)),
        },
        "model": {
            "outcomes": OUTCOMES,
            "k": params['k'], "home_adv": params['home_adv'],
            "new_team_games": NEW_TEAM_GAMES,
            "coef": coef.round(6).tolist(), "intercept": intercept.round(6).tolist(),
        },
        "backtest": backtest,
        "odds_comparison": odds_cmp,
        "rounds": open_rounds,
        "upcoming": upcoming,
        "team_lookup": lookup,
        "teams": teams,
        "pricing": PRICING,
    }
