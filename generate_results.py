"""
Gera results.json com a analise completa da Mega-Sena.
Executado pelo Netlify durante o build. Resultado consumido pelo index.html.
"""
import json
import warnings
from pathlib import Path

from megasena.data import load_draws
from megasena.results import build_results

OUTPUT = Path(__file__).resolve().parent / 'results.json'


def main():
    warnings.filterwarnings('ignore')
    print("Carregando dados...")
    results = build_results(load_draws(), log=print)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("results.json gerado com sucesso!")


if __name__ == '__main__':
    main()
