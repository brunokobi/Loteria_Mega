"""Carga do historico da Loteca e normalizacao dos nomes dos times."""
import re
import unicodedata

import numpy as np
import pandas as pd

from .update import DEFAULT_CSV

OUTCOMES = ['1', 'X', '2']  # vitoria do mandante, empate, vitoria do visitante

# grafias diferentes do mesmo time no historico da Caixa (chave ja normalizada)
ALIASES = {
    'S PAULO': 'SAO PAULO',
    'S CAETANO': 'SAO CAETANO',
}


def normalize_name(name):
    """'São  Caetano' -> 'SAO CAETANO': sem acento, maiusculo, sem pontuacao e espacos extras."""
    s = unicodedata.normalize('NFKD', str(name)).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^A-Z0-9 ]', ' ', s.upper())
    s = re.sub(r'\s+', ' ', s).strip()
    return ALIASES.get(s, s)


def team_key(name, uf):
    """Chave unica do time: nome normalizado + UF/pais (separa Atletico/MG de Atletico/PR)."""
    uf = normalize_name(uf) if isinstance(uf, str) else ''
    return f"{normalize_name(name)}/{uf}" if uf else normalize_name(name)


def load_games(path=DEFAULT_CSV):
    """DataFrame dos jogos em ordem cronologica, com chaves dos times e resultado 1/X/2."""
    df = pd.read_csv(path, keep_default_na=False)
    df = df.sort_values(['concurso', 'jogo']).reset_index(drop=True)
    df['home'] = [team_key(n, u) for n, u in zip(df['mandante'], df['uf_mandante'])]
    df['away'] = [team_key(n, u) for n, u in zip(df['visitante'], df['uf_visitante'])]
    diff = df['gols_mandante'] - df['gols_visitante']
    df['result'] = np.select([diff > 0, diff == 0], ['1', 'X'], '2')
    df['y'] = df['result'].map({o: i for i, o in enumerate(OUTCOMES)})
    return df
