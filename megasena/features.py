"""Features por numero e sorteio, calculadas apenas com o estado anterior ao sorteio."""
import numpy as np

from .data import N_NUMBERS, draw_matrix

FEATURE_NAMES = ['atraso', 'paridade', 'freq_relativa', 'decada', 'freq_recente']


def build_dataset(df, window=20):
    """
    Constroi o dataset com 5 features por numero em cada sorteio (sem data leakage).

    Retorna (X, y, final_state):
      - X: (N*60, 5) float64, linha i*60 + (num-1); colunas = FEATURE_NAMES
      - y: (N*60,) int, 1 se o numero saiu no sorteio i
      - final_state: (60, 5) com o estado apos todos os sorteios (pronto para predict_proba);
        final_state[:, 0] e o atraso atual.

    Features:
      - atraso        : sorteios desde a ultima aparicao (i se nunca saiu)
      - paridade      : 1=par, 0=impar
      - freq_relativa : aparicoes ate o sorteio anterior / max(i, 1)
      - decada        : 0-5 (1-10=0, 11-20=1, ...)
      - freq_recente  : aparicoes nos min(i, window) sorteios imediatamente anteriores
    """
    matrix = draw_matrix(df)
    n = len(matrix)
    idx = np.arange(n + 1)[:, None]  # linha n = estado final

    # contagem exclusiva: cum[i] = aparicoes nos sorteios [0, i)
    cum = np.zeros((n + 1, N_NUMBERS), dtype=np.int64)
    np.cumsum(matrix, axis=0, out=cum[1:])

    # ultimo sorteio j < i em que o numero saiu (-1 se nunca)
    last_in = np.maximum.accumulate(np.where(matrix == 1, np.arange(n)[:, None], -1), axis=0)
    last_before = np.vstack([np.full((1, N_NUMBERS), -1, dtype=np.int64), last_in])
    delay = idx - 1 - last_before  # nunca saiu: i - 1 - (-1) = i

    recent = cum[idx[:, 0]] - cum[np.maximum(idx[:, 0] - window, 0)]
    freq = cum / np.maximum(idx, 1)

    nums = np.arange(1, N_NUMBERS + 1)
    parity = np.broadcast_to((nums % 2 == 0).astype(np.int64), (n + 1, N_NUMBERS))
    decade = np.broadcast_to((nums - 1) // 10, (n + 1, N_NUMBERS))

    features = np.stack([delay, parity, freq, decade, recent], axis=2).astype(np.float64)
    X = features[:n].reshape(n * N_NUMBERS, len(FEATURE_NAMES))
    y = matrix.reshape(n * N_NUMBERS)
    return X, y, features[n].copy()
