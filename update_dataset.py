"""
Atualiza lottery-br-mega-sena.csv com os concursos mais recentes da Mega-Sena.
Roda no build do Netlify antes de generate_results.py. Se a API falhar, o CSV
atual e mantido e o build segue normalmente.

Grava update_status.json com o resultado da tentativa (ok / sem novos / falha),
que generate_results.py inclui no results.json para diagnostico.
"""
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from megasena.update import fetch_draw, update_csv

STATUS_FILE = Path(__file__).resolve().parent / 'update_status.json'


def main():
    messages = []

    def log(msg):
        print(msg)
        messages.append(msg)

    added = update_csv(log=log)
    failed = any(m.startswith('Aviso') for m in messages)
    status = 'falha' if failed and not added else 'ok' if added else 'sem_novos'

    next_draw, source = None, None
    try:  # data do proximo sorteio (Caixa ou, se bloqueada, o espelho)
        latest = fetch_draw(None)
        source = latest.get('fonte', 'caixa')
        next_draw = {'number': latest.get('numeroConcursoProximo'),
                     'date': latest.get('dataProximoConcurso')}
    except Exception as exc:
        log(f"Aviso: proximo sorteio indisponivel ({exc}); sera estimado.")

    STATUS_FILE.write_text(json.dumps({
        'status': status,
        'added': added,
        'checked_at': datetime.now(ZoneInfo('America/Sao_Paulo')).strftime('%Y-%m-%d %H:%M'),
        'next_draw': next_draw,
        'source': source,
        'messages': messages[-3:],
    }, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
