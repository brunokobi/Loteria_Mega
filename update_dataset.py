"""
Atualiza lottery-br-mega-sena.csv com os concursos mais recentes da Mega-Sena.
Roda no build do Netlify antes de generate_results.py. Se a API falhar, o CSV
atual e mantido e o build segue normalmente.
"""
from megasena.update import update_csv

if __name__ == '__main__':
    update_csv()
