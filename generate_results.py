"""
Gera results.json com a analise completa da Mega-Sena e predicoes.json com o registro
das top 10 de cada concurso. Executado pelo Netlify durante o build.
"""
import json
import os
import warnings
from pathlib import Path

from megasena.data import load_draws
from megasena.history import load_previous_log, update_log
from megasena.results import build_results
from megasena.schedule import next_draw_info

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / 'results.json'
LOG_OUTPUT = ROOT / 'predicoes.json'
STATUS_FILE = ROOT / 'update_status.json'
# o Netlify define URL no build; localmente usa o site publicado
SITE_URL = os.environ.get('URL', 'https://loteriabruno.netlify.app')


def _read_status():
    try:
        return json.loads(STATUS_FILE.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def main():
    warnings.filterwarnings('ignore')
    print("Carregando dados...")
    df = load_draws()
    results = build_results(df, log=print)

    status = _read_status()
    last_number = int(df['DrawNumber'].max())
    results['meta']['next_draw'] = next_draw_info(last_number, results['meta']['date_end'], status)
    keys = ('status', 'added', 'checked_at', 'messages')
    results['meta']['data_update'] = {k: status.get(k) for k in keys} if status else None

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("results.json gerado com sucesso!")

    # registro das previsoes: carrega o do deploy anterior, acrescenta e confere
    previous = load_previous_log(SITE_URL)
    combos = [c['numbers'] for c in results['combinations']]
    new_log = update_log(previous, df, combos)
    new_log['next_draw'] = results['meta']['next_draw']
    with open(LOG_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(new_log, f, ensure_ascii=False, separators=(',', ':'))
    print(f"predicoes.json: {len(new_log['entries'])} concurso(s) registrado(s).")


if __name__ == '__main__':
    main()
