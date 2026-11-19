"""
Odds historicas gratuitas do football-data.co.uk (CSV, sem cadastro), usadas para
treinar e testar a combinacao Elo + odds. Junta tudo em loteca_odds.csv com a
melhor odd disponivel de cada jogo, convertida em probabilidade sem a margem da casa.
"""
import io
import time
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

BASE = 'https://www.football-data.co.uk'
HEADERS = {'User-Agent': 'Mozilla/5.0'}
DEFAULT_CSV = Path(__file__).resolve().parent.parent / 'loteca_odds.csv'

# divisoes que aparecem na Loteca -> pais (football-data: mmz4281/{temporada}/{div}.csv)
DIVISIONS = {
    'E0': 'ING', 'E1': 'ING', 'SP1': 'ESP', 'SP2': 'ESP', 'I1': 'ITA', 'I2': 'ITA',
    'F1': 'FRA', 'D1': 'DEU', 'D2': 'DEU', 'N1': 'NLD', 'P1': 'PRT',
}
FIRST_SEASON = 2002

# colunas de odds por ordem de preferencia: Pinnacle fechamento, Pinnacle, media, Bet365
ODDS_PREFERENCE = [
    ('PSCH', 'PSCD', 'PSCA'), ('PSH', 'PSD', 'PSA'), ('AvgCH', 'AvgCD', 'AvgCA'),
    ('AvgH', 'AvgD', 'AvgA'), ('BbAvH', 'BbAvD', 'BbAvA'), ('B365CH', 'B365CD', 'B365CA'),
    ('B365H', 'B365D', 'B365A'),
]


def _get(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode('latin-1')
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)


def implied_probs(df):
    """Probabilidades 1/X/2 sem margem a partir da melhor coluna de odds disponivel por jogo."""
    probs = np.full((len(df), 3), np.nan)
    source = np.full(len(df), '', dtype=object)
    for cols in ODDS_PREFERENCE:
        if not all(c in df.columns for c in cols):
            continue
        odds = df[list(cols)].apply(pd.to_numeric, errors='coerce').to_numpy()
        ok = np.isnan(probs[:, 0]) & np.all(odds > 1, axis=1)
        inv = 1 / odds[ok]
        probs[ok] = inv / inv.sum(axis=1, keepdims=True)
        source[ok] = cols[0]
    return probs, source


def _normalize_frame(raw, country, league):
    df = raw.rename(columns={'HomeTeam': 'Home', 'AwayTeam': 'Away', 'FTHG': 'HG', 'FTAG': 'AG'})
    df = df.dropna(subset=['Home', 'Away', 'Date'])
    probs, source = implied_probs(df)
    out = pd.DataFrame({
        'date': pd.to_datetime(df['Date'], dayfirst=True, errors='coerce').dt.strftime('%Y-%m-%d'),
        'country': country, 'league': league,
        'home': df['Home'].str.strip(), 'away': df['Away'].str.strip(),
        'hg': pd.to_numeric(df.get('HG'), errors='coerce'),
        'ag': pd.to_numeric(df.get('AG'), errors='coerce'),
        'p1': probs[:, 0].round(4), 'px': probs[:, 1].round(4), 'p2': probs[:, 2].round(4),
        'odds_source': source,
    })
    return out.dropna(subset=['date', 'p1'])


def download(path=DEFAULT_CSV, last_season=None, delay=0.5, log=print):
    """Baixa todas as temporadas/divisoes e grava o CSV consolidado."""
    last_season = last_season or pd.Timestamp.today().year
    frames = []
    for start in range(FIRST_SEASON, last_season + 1):
        season = f"{start % 100:02d}{(start + 1) % 100:02d}"
        for div, country in DIVISIONS.items():
            try:
                text = _get(f"{BASE}/mmz4281/{season}/{div}.csv")
                frames.append(_normalize_frame(pd.read_csv(io.StringIO(text), on_bad_lines='skip'),
                                               country, div))
            except Exception as exc:
                log(f"  sem {season}/{div}: {exc}")
            time.sleep(delay)
        log(f"temporada {season} ok")
    text = _get(f"{BASE}/new/BRA.csv")
    bra = pd.read_csv(io.StringIO(text), on_bad_lines='skip')
    frames.append(_normalize_frame(bra, 'BRA', 'BRA1'))
    df = pd.concat(frames, ignore_index=True).drop_duplicates(['date', 'home', 'away'])
    df.sort_values(['date', 'country', 'home']).to_csv(path, index=False)
    log(f"{len(df)} jogos com odds gravados em {Path(path).name}")
    return df


if __name__ == '__main__':
    download()
