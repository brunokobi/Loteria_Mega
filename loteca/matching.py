"""
Casa os jogos da Loteca com os jogos do football-data.co.uk (outra grafia dos times).

Criterio, por jogo da Loteca:
  - candidatos: mesmo pais, data entre -1 e +1 dia (fuso horario)
  - similaridade dos nomes do mandante e do visitante (com apelidos e traducoes)
  - o placar precisa ser identico nas duas fontes (confirma que e o mesmo jogo)
"""
from difflib import SequenceMatcher

import numpy as np
import pandas as pd

from .data import normalize_name

BR_STATES = {
    'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB',
    'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
}
COUNTRY = {'ING': 'ING', 'ITA': 'ITA', 'ESP': 'ESP', 'FRA': 'FRA', 'DEU': 'DEU', 'ALE': 'DEU',
           'NLD': 'NLD', 'HOL': 'NLD', 'PRT': 'PRT', 'POR': 'PRT'}

STOPWORDS = {
    'FC', 'CF', 'AC', 'SC', 'EC', 'CA', 'CD', 'UD', 'SD', 'RCD', 'AFC', 'SE', 'US', 'AS', 'SS',
    'OGC', 'RC', 'CLUBE', 'CLUB', 'DE', 'DA', 'DO', 'DI', 'THE', 'CALCIO', 'FUTEBOL', 'FOOTBALL',
} | BR_STATES

# grafia da Caixa (normalizada) -> grafia do football-data (normalizada)
ALIASES = {
    'INTER DE MILAO': 'INTER', 'INTER MILAO': 'INTER', 'INTERNAZIONALE': 'INTER',
    'MILAN': 'MILAN', 'AC MILAN': 'MILAN',
    'MANCHESTER UNITED': 'MAN UNITED', 'MANCHESTER UTD': 'MAN UNITED',
    'MANCHESTER CITY': 'MAN CITY',
    'ATLETICO MADRID': 'ATH MADRID', 'ATLETICO DE MADRID': 'ATH MADRID',
    'ATHLETIC BILBAO': 'ATH BILBAO', 'ATH BILBAO': 'ATH BILBAO',
    'BAYERN DE MUNIQUE': 'BAYERN MUNICH', 'BAYERN MUNIQUE': 'BAYERN MUNICH',
    'BORUSSIA DORTMUND': 'DORTMUND', 'BORUSSIA M GLADBACH': 'M GLADBACH',
    'BAYER LEVERKUSEN': 'LEVERKUSEN',
    'PARIS SAINT GERMAIN': 'PARIS SG', 'PARIS ST GERMAIN': 'PARIS SG', 'PSG': 'PARIS SG',
    'BRESTOIS': 'BREST', 'OLYMPIQUE MARSELHA': 'MARSEILLE', 'MARSELHA': 'MARSEILLE',
    'OLYMPIQUE LYON': 'LYON', 'LYONNAIS': 'LYON',
    'ATALANTA BERGAMAS': 'ATALANTA', 'AS ROMA': 'ROMA', 'NAPOLES': 'NAPOLI',
    'NOTTINGHAM FOREST': 'NOTT M FOREST', 'WOLVERHAMPTON': 'WOLVES',
    'TOTTENHAM HOTSPUR': 'TOTTENHAM', 'WEST HAM UNITED': 'WEST HAM',
    'REAL SOCIEDAD': 'SOCIEDAD', 'CELTA DE VIGO': 'CELTA', 'CELTA VIGO': 'CELTA',
    'REAL BETIS': 'BETIS', 'DEPORTIVO LA CORUNA': 'LA CORUNA', 'DEPORTIVO': 'LA CORUNA',
    'ESPANYOL': 'ESPANOL', 'RAYO VALLECANO': 'VALLECANO',
    'LISBOA BENFICA': 'BENFICA', 'SPORTING LISBOA': 'SP LISBON', 'FC PORTO': 'PORTO',
    'PSV EINDHOVEN': 'PSV EINDHOVEN',
    'VASCO DA GAMA': 'VASCO', 'S PAULO': 'SAO PAULO', 'SAO PAULO': 'SAO PAULO',
    'ATHLETICO': 'ATHLETICO PR', 'ATLETICO PR': 'ATHLETICO PR',
    'ATLETICO PARANAENSE': 'ATHLETICO PR',
    'ATLETICO': 'ATLETICO MG', 'ATLETICO MINEIRO': 'ATLETICO MG',
    'BRAGANTINO': 'BRAGANTINO', 'RED BULL BRAGANTINO': 'BRAGANTINO',
}


def country_of(uf):
    uf = (uf or '').strip().upper()
    if uf in BR_STATES:
        return 'BRA'
    return COUNTRY.get(uf)


def _clean(name, extra_alias=None):
    n = normalize_name(name)
    n = ALIASES.get(n, n)
    tokens = [t for t in n.split() if t not in STOPWORDS]
    return ' '.join(tokens) or n


def similarity(a, b):
    """0 a 1; nomes ja limpos. Prefixo comum ou palavra longa compartilhada contam muito."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    ratio = SequenceMatcher(None, a, b).ratio()
    ta, tb = set(a.split()), set(b.split())
    shared = {t for t in ta & tb if len(t) >= 4}
    if shared:
        ratio = max(ratio, 0.85)
    if a.startswith(b) or b.startswith(a):
        ratio = max(ratio, 0.85)
    return ratio


def match_games(loteca, odds, threshold=0.6):
    """
    Para cada jogo da Loteca, devolve as probabilidades das odds (p1, px, p2) ou NaN.
    Colunas extras: odds_match_score e odds_league.
    """
    odds = odds.copy()
    odds['home_c'] = [_clean(x) for x in odds['home']]
    odds['away_c'] = [_clean(x) for x in odds['away']]
    odds['d'] = pd.to_datetime(odds['date'])
    by_key = {k: g for k, g in odds.groupby(['country', 'd'])}

    n = len(loteca)
    probs = np.full((n, 3), np.nan)
    scores = np.zeros(n)
    leagues = np.full(n, '', dtype=object)
    dates = pd.to_datetime(loteca['data'])

    for i, row in enumerate(loteca.itertuples(index=False)):
        country = country_of(row.uf_mandante) or country_of(row.uf_visitante)
        if not country:
            continue
        hc, ac = _clean(row.mandante), _clean(row.visitante)
        cands = [by_key.get((country, dates.iloc[i] + pd.Timedelta(days=dd))) for dd in (0, -1, 1)]
        cands = [c for c in cands if c is not None]
        if not cands:
            continue
        cand = pd.concat(cands)
        same_score = (cand['hg'] == row.gols_mandante) & (cand['ag'] == row.gols_visitante)
        cand = cand[same_score]
        if cand.empty:
            continue
        s = np.array([min(similarity(hc, h), similarity(ac, a))
                      for h, a in zip(cand['home_c'], cand['away_c'])])
        best = int(s.argmax())
        if s[best] < threshold:
            continue
        if (np.sort(s)[-2] if len(s) > 1 else 0) > s[best] - 0.1:  # ambiguo
            continue
        c = cand.iloc[best]
        probs[i] = [c['p1'], c['px'], c['p2']]
        scores[i] = s[best]
        leagues[i] = c['league']

    out = loteca.copy()
    out['odds_p1'], out['odds_px'], out['odds_p2'] = probs.T
    out['odds_match_score'] = scores
    out['odds_league'] = leagues
    return out
