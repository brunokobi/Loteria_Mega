"""Carga dos sorteios e matriz de ocorrencias."""
from pathlib import Path

import numpy as np
import pandas as pd

COLS = ['Ball1', 'Ball2', 'Ball3', 'Ball4', 'Ball5', 'Ball6']
N_NUMBERS = 60
DEFAULT_CSV = Path(__file__).resolve().parent.parent / 'lottery-br-mega-sena.csv'


def load_draws(path=DEFAULT_CSV):
    """Le o CSV e devolve o DataFrame ordenado por DrawDate, com indice 0..N-1."""
    df = pd.read_csv(path)
    return df.sort_values(by='DrawDate').reset_index(drop=True)


def draw_matrix(df):
    """Matriz N x 60 de 0/1: linha i, coluna num-1 = 1 se num saiu no sorteio i."""
    balls = df[COLS].to_numpy(dtype=np.int64)
    matrix = np.zeros((len(balls), N_NUMBERS), dtype=np.int64)
    rows = np.repeat(np.arange(len(balls)), balls.shape[1])
    matrix[rows, (balls - 1).ravel()] = 1
    return matrix
