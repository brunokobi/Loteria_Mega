"""Atualizacao do CSV com os concursos mais recentes (API publica da Caixa)."""
import json
import time
import urllib.request
from datetime import datetime

from .data import DEFAULT_CSV

API_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/'
HEADERS = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}


class DrawDataError(ValueError):
    """Resposta da API com dados invalidos."""


def fetch_draw(number=None, timeout=15, retries=3):
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


def parse_draw(data, expected_number=None):
    """Converte o JSON da API em (numero, 'YYYY-MM-DD 00:00:00', [6 dezenas ordenadas])."""
    number = int(data['numero'])
    if expected_number is not None and number != expected_number:
        raise DrawDataError(f"concurso {number} recebido, esperado {expected_number}")
    balls = sorted(int(d) for d in data['listaDezenas'])
    if len(balls) != 6 or len(set(balls)) != 6 or not all(1 <= b <= 60 for b in balls):
        raise DrawDataError(f"dezenas invalidas no concurso {number}: {data['listaDezenas']}")
    date = datetime.strptime(data['dataApuracao'], '%d/%m/%Y').strftime('%Y-%m-%d 00:00:00')
    return number, date, balls


def _read_last(path):
    """(ultimo indice, ultimo DrawNumber) do CSV."""
    with open(path, encoding='utf-8') as f:
        last_line = [line for line in f if line.strip()][-1]
    idx, number = last_line.split(',')[:2]
    return int(idx), int(number)


def update_csv(path=DEFAULT_CSV, fetch=fetch_draw, delay=0.2, log=print):
    """
    Acrescenta ao CSV os concursos que faltam ate o mais recente.
    Nunca quebra: em caso de falha mantem o que ja foi gravado e devolve o total adicionado.
    """
    last_idx, last_number = _read_last(path)
    try:
        latest = int(fetch(None)['numero'])
    except Exception as exc:
        log(f"Aviso: nao foi possivel consultar o ultimo concurso ({exc}). CSV mantido.")
        return 0

    if latest <= last_number:
        log(f"Dataset ja atualizado (concurso {last_number}).")
        return 0

    log(f"Buscando concursos {last_number + 1} a {latest}...")
    added = 0
    with open(path, 'a', encoding='utf-8') as f:
        for number in range(last_number + 1, latest + 1):
            try:
                n, date, balls = parse_draw(fetch(number), expected_number=number)
            except Exception as exc:
                log(f"Aviso: falha no concurso {number} ({exc}). Parando aqui.")
                break
            last_idx += 1
            f.write(','.join(map(str, [last_idx, n, date, *balls])) + '\n')
            f.flush()
            added += 1
            if delay:
                time.sleep(delay)

    log(f"{added} concurso(s) adicionado(s); ultimo: {last_number + added}.")
    return added
