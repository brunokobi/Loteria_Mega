"""Download do historico da Loteca (API publica da Caixa) para loteca.csv."""
import csv
import json
import time
import urllib.request
from pathlib import Path

API_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca/'
HEADERS = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}
DEFAULT_CSV = Path(__file__).resolve().parent.parent / 'loteca.csv'
PROBE_AHEAD = 2  # concursos alem do 'ultimo' informado pela Caixa
COLUMNS = ['concurso', 'jogo', 'data', 'campeonato', 'mandante', 'uf_mandante',
           'visitante', 'uf_visitante', 'gols_mandante', 'gols_visitante', 'sorteado']


class RoundDataError(ValueError):
    """Resposta da API com dados invalidos."""


def fetch_round(number=None, timeout=15, retries=3):
    """JSON de um concurso (ou do ultimo, se number=None), com novas tentativas."""
    url = API_URL + ('' if number is None else str(number))
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)


def parse_round(data, expected_number=None):
    """Converte o JSON da API em 14 linhas (dicts com COLUMNS)."""
    number = int(data['numero'])
    if expected_number is not None and number != expected_number:
        raise RoundDataError(f"concurso {number} recebido, esperado {expected_number}")
    if not data.get('dataApuracao'):  # concurso ainda nao apurado
        raise RoundDataError(f"concurso {number} sem data de apuracao")
    games = sorted(data.get('listaResultadoEquipeEsportiva') or [], key=lambda g: g['nuSequencial'])
    seqs = [int(g['nuSequencial']) for g in games]
    # a API da Caixa tem concursos antigos com jogos faltando (ex.: 244 sem o jogo 11):
    # aceita 1 a 14 jogos distintos; o teste no passado ignora concursos incompletos
    if not games or len(set(seqs)) != len(seqs) or not all(1 <= s <= 14 for s in seqs):
        raise RoundDataError(f"concurso {number} com jogos invalidos: {seqs}")
    rows = []
    for g in games:
        # jogo nao realizado (resultado sorteado) vem sem data: usa a data de apuracao
        d, m, y = (g.get('dtJogo') or data['dataApuracao']).split('/')
        rows.append({
            'concurso': number,
            'jogo': int(g['nuSequencial']),
            'data': f'{y}-{m}-{d}',
            'campeonato': (g.get('nomeCampeonato') or '').strip(),
            'mandante': g['nomeEquipeUm'].strip(),
            'uf_mandante': (g.get('siglaUFUm') or g.get('siglaPaisUm') or '').strip(),
            'visitante': g['nomeEquipeDois'].strip(),
            'uf_visitante': (g.get('siglaUFDois') or g.get('siglaPaisDois') or '').strip(),
            'gols_mandante': int(g['nuGolEquipeUm']),
            'gols_visitante': int(g['nuGolEquipeDois']),
            # 1 = jogo nao realizado e resultado definido por sorteio da Caixa
            'sorteado': int(g.get('icSorteioResultado') or 0),
        })
    return rows


def _last_round(path):
    if not Path(path).exists():
        return 0
    with open(path, encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    return int(rows[-1]['concurso']) if rows else 0


def update_csv(path=DEFAULT_CSV, fetch=fetch_round, delay=0.2, log=print):
    """
    Acrescenta ao CSV os concursos que faltam ate o mais recente.
    Nunca quebra: em caso de falha mantem o que ja foi gravado e devolve o total adicionado.
    """
    last = _last_round(path)
    try:
        latest = int(fetch(None)['numero'])
    except Exception as exc:
        log(f"Aviso: nao foi possivel consultar o ultimo concurso da Loteca ({exc}). CSV mantido.")
        return 0
    # o "ultimo concurso" da Caixa demora a mudar depois da apuracao, mas o concurso novo
    # ja responde pelo numero: tenta tambem os PROBE_AHEAD seguintes
    target = max(latest, last) + PROBE_AHEAD
    log(f"Loteca: buscando concursos {last + 1} a {max(latest, last + 1)}...")
    new_file = not Path(path).exists()
    added = 0
    with open(path, 'a', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        if new_file:
            writer.writeheader()
        for number in range(last + 1, target + 1):
            try:
                rows = parse_round(fetch(number), expected_number=number)
            except Exception as exc:
                if number <= latest:
                    log(f"Aviso: falha no concurso {number} da Loteca ({exc}). Parando aqui.")
                break  # alem do ultimo anunciado: ainda nao apurado
            writer.writerows(rows)
            f.flush()
            added += 1
            if delay:
                time.sleep(delay)
            if added % 100 == 0:
                log(f"  ... {added} concursos")
    log(f"Loteca: {added} concurso(s) adicionado(s); ultimo: {last + added}.")
    return added


if __name__ == '__main__':
    update_csv()
