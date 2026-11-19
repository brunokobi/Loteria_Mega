"""
Atualizacao do CSV com os concursos mais recentes.

Fonte principal: API publica da Caixa. Ela bloqueia servidores fora do Brasil (HTTP 403
no build do Netlify), entao, se falhar, usa o espelho comunitario loteriascaixa-api
(github.com/guto-alves/loterias-api), convertido para o mesmo formato e validado igual.
"""
import json
import time
import urllib.error
import urllib.request
from datetime import datetime

from .data import DEFAULT_CSV

API_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/'
HEADERS = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}


class DrawDataError(ValueError):
    """Resposta da API com dados invalidos."""


MIRROR_URL = 'https://loteriascaixa-api.herokuapp.com/api/megasena/'


def _get_json(url, timeout, retries):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            if exc.code in (403, 404) or attempt == retries - 1:
                raise  # bloqueio ou concurso inexistente: nao adianta repetir
            time.sleep(2 ** attempt)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)


def mirror_to_caixa(data):
    """Formato do espelho -> formato da API da Caixa (so os campos usados aqui)."""
    return {
        'numero': data['concurso'],
        'dataApuracao': data['data'],
        'listaDezenas': data['dezenas'],
        'numeroConcursoProximo': data.get('proximoConcurso'),
        'dataProximoConcurso': data.get('dataProximoConcurso'),
        'fonte': 'espelho',
    }


def fetch_draw(number=None, timeout=15, retries=3):
    """JSON de um concurso (ou do ultimo, se number=None): Caixa e, se falhar, o espelho."""
    suffix = '' if number is None else str(number)
    try:
        return _get_json(API_URL + suffix, timeout, retries)
    except Exception as caixa_exc:
        try:
            return mirror_to_caixa(_get_json(MIRROR_URL + (suffix or 'latest'), timeout, retries))
        except Exception:
            raise caixa_exc from None


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
