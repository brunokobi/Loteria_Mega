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
    'BRASIL DE PELOTAS': 'BRASIL PELOTAS',
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


# times reserva / de base: nunca sao o time principal
RESERVE_TOKENS = {'B', 'II', 'SUB', 'U17', 'U20', 'U23', 'JUNIOR', 'JUNIORES', 'FEM', 'FEMININO'}

# palavras que nao identificam o clube: 'BOLOGNA' = 'BOLOGNA FC', 'CUIABA' = 'CUIABA ESPORTE CL'.
# Cidades e siglas ficam de fora de proposito ('PORTUGUESA' != 'PORTUGUESA SANTISTA').
GENERIC_TOKENS = {'CLUBE', 'CLUB', 'CL', 'ESPORTE', 'ESPORTIVO', 'ATLETIC', 'CALCIO',
                  'OLYMPIQUE', 'RECIFE', 'GAMA', 'FRA', 'ES', 'BSB'}


def merge_name_variants(df):
    """
    Unifica grafias diferentes do mesmo clube ('VASCO' e 'VASCO DA GAMA', 'ATH BILBAO' e
    'ATHLETIC BILBAO'). Dentro da mesma UF/pais, junta dois nomes quando as palavras de um
    estao contidas nas do outro (apos limpar artigos e apelidos) E os dois nunca aparecem no
    mesmo concurso: clubes diferentes do mesmo estado acabam se enfrentando em algum momento.
    Devolve {chave: chave canonica} (a grafia com mais jogos).
    """
    from .matching import _clean  # import local: matching importa este modulo

    rounds, games = {}, {}
    for side in ('home', 'away'):
        for key, rnd in zip(df[side], df['concurso']):
            rounds.setdefault(key, set()).add(rnd)
            games[key] = games.get(key, 0) + 1

    parent = {k: k for k in rounds}
    group_rounds = {k: set(r) for k, r in rounds.items()}

    def find(k):
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    by_uf = {}
    for key in rounds:
        name, _, uf = key.rpartition('/')
        tokens = tuple(_clean(name or key).split())
        if tokens:
            by_uf.setdefault(uf, []).append((key, tokens))

    def compatible(ta, tb):
        """Mesmo nome, ou o longo so acrescenta palavras genericas ('VASCO' / 'VASCO GAMA')."""
        if set(ta) == set(tb):
            return True
        short, long_ = (ta, tb) if len(ta) < len(tb) else (tb, ta)
        extra = set(long_) - set(short)
        return set(short) <= set(long_) and extra <= GENERIC_TOKENS

    for items in by_uf.values():
        token_of = dict(items)
        pairs = [(a, b) for i, (a, ta) in enumerate(items) for b, tb in items[i + 1:]
                 if compatible(ta, tb)]
        # pares com nomes identicos (apos limpeza) primeiro, depois os de nome contido
        pairs.sort(key=lambda p: set(token_of[p[0]]) != set(token_of[p[1]]))
        for a, b in pairs:
            ra, rb = find(a), find(b)
            if ra != rb and not (group_rounds[ra] & group_rounds[rb]):
                keep, drop = (ra, rb) if games[ra] >= games[rb] else (rb, ra)
                parent[drop] = keep
                group_rounds[keep] |= group_rounds.pop(drop)
                games[keep] += games[drop]
    return {k: find(k) for k in rounds}


def load_games(path=DEFAULT_CSV, merge_variants=True):
    """DataFrame dos jogos em ordem cronologica, com chaves dos times e resultado 1/X/2."""
    df = pd.read_csv(path, keep_default_na=False)
    df = df.sort_values(['concurso', 'jogo']).reset_index(drop=True)
    df['home'] = [team_key(n, u) for n, u in zip(df['mandante'], df['uf_mandante'])]
    df['away'] = [team_key(n, u) for n, u in zip(df['visitante'], df['uf_visitante'])]
    if merge_variants:
        canon = merge_name_variants(df)
        df['home'] = df['home'].map(canon)
        df['away'] = df['away'].map(canon)
    diff = df['gols_mandante'] - df['gols_visitante']
    df['result'] = np.select([diff > 0, diff == 0], ['1', 'X'], '2')
    df['y'] = df['result'].map({o: i for i, o in enumerate(OUTCOMES)})
    return df
