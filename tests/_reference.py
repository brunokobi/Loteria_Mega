"""Oraculo: build_dataset original (lento, baseado em iloc), copiado verbatim de
generate_results.py. Usado apenas para provar equivalencia com a versao vetorizada."""
import numpy as np

COLS_BOLAS = ['Ball1', 'Ball2', 'Ball3', 'Ball4', 'Ball5', 'Ball6']
N_ULTIMOS = 20


def build_dataset(df):
    n = len(df)
    atrasos = {num: 0 for num in range(1, 61)}
    contagem = {num: 0 for num in range(1, 61)}
    hist_recente = {num: 0 for num in range(1, 61)}
    janela = []
    X, y = [], []

    for i in range(n):
        nums = set(int(v) for v in df.iloc[i][COLS_BOLAS].values)

        for num in range(1, 61):
            X.append([
                atrasos[num],
                1 if num % 2 == 0 else 0,
                contagem[num] / max(i, 1),
                (num - 1) // 10,
                hist_recente[num],
            ])
            y.append(1 if num in nums else 0)

        if len(janela) >= N_ULTIMOS:
            saindo = janela.pop(0)
            for num in saindo:
                hist_recente[num] -= 1
        janela.append(nums)

        for num in range(1, 61):
            if num in nums:
                hist_recente[num] += 1
                contagem[num] += 1
                atrasos[num] = 0
            else:
                atrasos[num] += 1

    return np.array(X), np.array(y), atrasos, contagem, hist_recente
