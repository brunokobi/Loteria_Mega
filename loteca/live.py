"""
Jogos dos proximos dias com odds da Pinnacle (OddsPapi), para a aba da Loteca.

Usa 2 requisicoes por execucao (participantes + odds). A chave vem da variavel de
ambiente ODDSPAPI_KEY; sem ela (ou se a API falhar) devolve lista vazia e o site
segue so com o Elo.
"""
import json
import os
import time
import urllib.parse
import urllib.request

from .data import RESERVE_TOKENS, normalize_name
from .matching import BR_STATES, _clean, similarity

API = 'https://api.oddspapi.io/v4/'
BOOKMAKER = 'pinnacle'
MARKET_1X2, OUT_HOME, OUT_DRAW, OUT_AWAY = '101', '101', '102', '103'
MAX_TOURNAMENTS_PER_REQUEST = 5  # limite da API em odds-by-tournaments

# torneios que costumam aparecer na Loteca -> (nome exibido, pais para casar com o Elo)
TOURNAMENTS = {
    325: ('Brasileirão Série A', 'BRA'), 390: ('Brasileirão Série B', 'BRA'),
    1281: ('Brasileirão Série C', 'BRA'), 373: ('Copa do Brasil', 'BRA'),
    1596: ('Copa do Nordeste', 'BRA'), 372: ('Paulista', 'BRA'), 92: ('Carioca', 'BRA'),
    379: ('Mineiro', 'BRA'), 377: ('Gaúcho', 'BRA'), 382: ('Paranaense', 'BRA'),
    376: ('Catarinense', 'BRA'), 374: ('Baiano', 'BRA'), 380: ('Pernambucano', 'BRA'),
    378: ('Cearense', 'BRA'), 381: ('Goiano', 'BRA'),
    384: ('Libertadores', None), 480: ('Sul-Americana', None),
    17: ('Premier League', 'ING'), 18: ('Championship', 'ING'), 8: ('La Liga', 'ESP'),
    54: ('La Liga 2', 'ESP'), 23: ('Serie A (Itália)', 'ITA'), 34: ('Ligue 1', 'FRA'),
    35: ('Bundesliga', 'DEU'), 44: ('2. Bundesliga', 'DEU'),
    7: ('Champions League', None), 679: ('Europa League', None),
    11: ('Eliminatórias UEFA', None), 295: ('Eliminatórias CONMEBOL', None),
    23755: ('Nations League', None), 851: ('Amistosos de seleções', None),
}


def _get(endpoint, params, key, timeout=60):
    query = urllib.parse.urlencode({**params, 'apiKey': key})
    req = urllib.request.Request(f"{API}{endpoint}?{query}", headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def _probs_from_market(market):
    """Probabilidades sem margem a partir das odds 1X2 da Pinnacle (ou None)."""
    try:
        outs = market['outcomes']
        prices = [outs[o]['players']['0']['price'] for o in (OUT_HOME, OUT_DRAW, OUT_AWAY)]
    except (KeyError, TypeError):
        return None
    if not all(isinstance(p, (int, float)) and p > 1 for p in prices):
        return None
    inv = [1 / p for p in prices]
    return [round(v / sum(inv), 4) for v in inv]


def split_name(name, country):
    """'CR Flamengo RJ' -> ('CR FLAMENGO', 'RJ') para times brasileiros."""
    n = normalize_name(name)
    parts = n.split()
    if country == 'BRA' and len(parts) > 1 and parts[-1] in BR_STATES:
        return ' '.join(parts[:-1]), parts[-1]
    return n, country


def build_team_index(ratings):
    """Elo keys ('NOME/UF') agrupadas por UF/pais, com o nome ja limpo para comparar."""
    index = {}
    for key in ratings:
        name, _, uf = key.rpartition('/')
        if not name:
            name, uf = key, ''
        index.setdefault(uf, []).append((_clean(name), key))
    return index


def match_team(name, country, index, threshold=0.75):
    """Chave do Elo para um time da OddsPapi, ou None se nao houver casamento seguro."""
    base, uf = split_name(name, country)
    target = _clean(base)
    if uf:
        pool = index.get(uf, [])
    else:  # competicoes internacionais: qualquer time de fora do Brasil
        pool = [t for u, items in index.items() if u not in BR_STATES for t in items]
    # times B / sub-20 nunca sao o time principal
    pool = [(c, k) for c, k in pool if not set(c.split()) & RESERVE_TOKENS]
    scored = sorted(((similarity(target, c), k) for c, k in pool), reverse=True)
    if not scored or scored[0][0] < threshold:
        return None
    best = scored[0][0]
    second = scored[1][0] if len(scored) > 1 else 0
    # nome identico vence; senao exige folga sobre o segundo colocado
    if (best == 1.0 and second < 1.0) or second <= best - 0.1:
        return scored[0][1]
    return None


def fetch_upcoming(ratings, key=None, days=10, log=print):
    """Lista de jogos futuros com odds e, quando possivel, a chave do Elo de cada time."""
    key = key or os.environ.get('ODDSPAPI_KEY')
    if not key:
        log("ODDSPAPI_KEY nao definida: aba da Loteca sem odds da semana (so Elo).")
        return []
    try:
        # 1 requisicao para saber quais torneios tem jogos futuros (economiza a cota)
        active = [t['tournamentId'] for t in _get('tournaments', {'sportId': 10}, key)
                  if t['tournamentId'] in TOURNAMENTS
                  and (t.get('futureFixtures') or 0) + (t.get('upcomingFixtures') or 0) > 0]
        if not active:
            log("Loteca: nenhum torneio acompanhado com jogos futuros.")
            return []
        time.sleep(1)
        names = _get('participants', {'sportId': 10}, key)
        events = []
        for i in range(0, len(active), MAX_TOURNAMENTS_PER_REQUEST):
            time.sleep(1)
            events += _get('odds-by-tournaments', {
                'bookmaker': BOOKMAKER, 'oddsFormat': 'decimal',
                'tournamentIds': ','.join(map(str, active[i:i + MAX_TOURNAMENTS_PER_REQUEST])),
            }, key)
        log(f"Loteca: odds de {len(active)} torneios em "
            f"{2 + -(-len(active) // MAX_TOURNAMENTS_PER_REQUEST)} requisicoes a OddsPapi.")
    except Exception as exc:
        log(f"Aviso: falha ao buscar odds na OddsPapi ({exc}). Seguindo so com o Elo.")
        return []

    index = build_team_index(ratings)
    now = time.time()
    horizon = now + days * 86400
    games = []
    for ev in events:
        start = ev.get('startTime') or ''
        try:
            ts = time.mktime(time.strptime(start[:19], '%Y-%m-%dT%H:%M:%S')) - time.timezone
        except ValueError:
            continue
        if not (now - 3 * 3600 <= ts <= horizon) or ev.get('statusId') not in (0, None):
            continue
        market = (ev.get('bookmakerOdds', {}).get(BOOKMAKER, {}).get('markets', {})
                  .get(MARKET_1X2))
        probs = _probs_from_market(market) if market else None
        if not probs:
            continue
        tname, country = TOURNAMENTS.get(ev['tournamentId'], ('', None))
        home = names.get(str(ev['participant1Id']), '?')
        away = names.get(str(ev['participant2Id']), '?')
        games.append({
            'start': start[:16] + 'Z', 'tournament': tname,
            'home': home, 'away': away, 'odds': probs,
            'home_key': match_team(home, country, index),
            'away_key': match_team(away, country, index),
        })
    games.sort(key=lambda g: (g['start'], g['tournament']))
    log(f"Loteca: {len(games)} jogos com odds nos proximos {days} dias.")
    return games


# ── programacao oficial do proximo concurso (Caixa) ────────────────
PROGRAMACAO_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca/programacao'


def _br_date(s):
    """'21/11/2026' ou '21/11/2026 00:00:00' -> '2026-11-21' (ou None)."""
    try:
        d, m, y = (s or '').split()[0].split('/')
        return f"{y}-{m}-{d}"
    except ValueError:
        return None


def parse_programacao(data):
    """Lista de concursos com os 14 jogos, a partir do JSON de loteca/programacao."""
    rounds = []
    for c in data or []:
        games = next((v for v in c.values() if isinstance(v, list)), [])
        games = sorted(games, key=lambda g: g.get('nuSequencial', 0))
        rounds.append({
            "number": int(c['nuConcurso']),
            "date": _br_date(c.get('dataProximoConcurso')),
            "weekday": c.get('diaSemana'),
            "bets_until": _br_date(c.get('dataFimApostas')),
            "bets_until_hour": c.get('horarioFimApostas'),
            "estimated_prize": c.get('valorEstimadoProximoConcurso'),
            "games": [{
                "seq": int(g['nuSequencial']),
                "date": _br_date(g.get('dtJogo')),
                "weekday": g.get('diaSemana'),
                "home": g['nomeEquipeUm'].strip(),
                "home_uf": (g.get('siglaUFUm') or g.get('siglaPaisUm') or '').strip(),
                "away": g['nomeEquipeDois'].strip(),
                "away_uf": (g.get('siglaUFDois') or g.get('siglaPaisDois') or '').strip(),
            } for g in games],
        })
    return sorted(rounds, key=lambda r: r['number'])


def fetch_programacao(timeout=20, log=print):
    try:
        req = urllib.request.Request(PROGRAMACAO_URL, headers={
            'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return parse_programacao(json.load(resp))
    except Exception as exc:
        log(f"Aviso: programacao da Loteca indisponivel na Caixa ({exc}).")
        return []


def build_team_lookup(raw_keys, canon, ratings, played):
    """
    Tabelas para achar o time do Elo a partir do nome da Caixa:
      - by_key: 'NOME/UF' (como a Caixa grava) -> chave canonica do Elo
      - by_name: 'NOME' (times de fora do Brasil, que a programacao manda sem pais)
        -> chave com mais jogos entre as de fora do Brasil
    """
    by_key = {k: canon.get(k, k) for k in raw_keys if canon.get(k, k) in ratings}
    by_name = {}
    for key in ratings:
        name, _, uf = key.rpartition('/')
        if not name or uf in BR_STATES:
            continue
        best = by_name.get(name)
        if best is None or played.get(key, 0) > played.get(best, 0):
            by_name[name] = key
    return {"by_key": by_key, "by_name": by_name}


def resolve_team(name, uf, lookup):
    from .data import team_key
    if uf:
        return lookup['by_key'].get(team_key(name, uf))
    return lookup['by_name'].get(normalize_name(name))


def _fixture_name(name):
    """Nome da OddsPapi sem a UF final ('CR Flamengo RJ' -> 'FLAMENGO')."""
    parts = normalize_name(name).split()
    if len(parts) > 1 and parts[-1] in BR_STATES:
        parts = parts[:-1]
    return _clean(' '.join(parts))


def match_fixture(game, upcoming, threshold=0.6):
    """Jogo da OddsPapi correspondente a um jogo da programacao (mesmos times, data +-1 dia)."""
    from datetime import date, timedelta
    try:
        d = date.fromisoformat(game['date'])
    except (TypeError, ValueError):
        return None
    days = {(d + timedelta(days=k)).isoformat() for k in (-1, 0, 1)}
    hc, ac = _clean(game['home']), _clean(game['away'])
    best, best_score, second = None, 0.0, 0.0
    for f in upcoming:
        if f['start'][:10] not in days:
            continue
        if game.get('home_key') and f.get('home_key') == game['home_key'] \
                and game.get('away_key') and f.get('away_key') == game['away_key']:
            return f
        score = min(similarity(hc, _fixture_name(f['home'])),
                    similarity(ac, _fixture_name(f['away'])))
        if score > best_score:
            best, best_score, second = f, score, best_score
        elif score > second:
            second = score
    if best_score >= threshold and second <= best_score - 0.1:
        return best
    return None
