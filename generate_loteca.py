"""
Gera loteca.json para a aba Loteca (loteca.html).
Roda no build do Netlify depois de generate_results.py. Nunca quebra o build:
se algo falhar, a aba da Loteca mostra um aviso e o resto do site segue normal.
"""
import json
import os
import warnings
from pathlib import Path

from loteca.results import build_loteca
from loteca.update import update_csv

OUTPUT = Path(__file__).resolve().parent / 'loteca.json'


def main():
    warnings.filterwarnings('ignore')
    try:
        update_csv()
        data = build_loteca(site_url=os.environ.get('URL', 'https://loteriabruno.netlify.app'))
    except Exception as exc:
        print(f"Aviso: loteca.json nao gerado ({exc}).")
        return
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f"loteca.json gerado ({OUTPUT.stat().st_size // 1024} KB).")


if __name__ == '__main__':
    main()
