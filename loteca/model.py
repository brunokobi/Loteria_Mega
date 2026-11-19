"""Probabilidades 1/X/2 a partir do Elo e preditores de referencia."""
import numpy as np
from sklearn.linear_model import LogisticRegression

NEW_TEAM_GAMES = 10  # abaixo disso o rating ainda e pouco confiavel
_EPS = 1e-9


def features(diff, min_games):
    """[diferenca de Elo, time novo, interacao]: o modelo confia menos em times novos."""
    d = np.asarray(diff) / 400
    new = (np.asarray(min_games) < NEW_TEAM_GAMES).astype(float)
    return np.column_stack([d, new, d * new])


def fit_outcome_model(diff, min_games, y):
    model = LogisticRegression(C=1.0, max_iter=1000)
    model.fit(features(diff, min_games), y)
    return model


def predict_proba(model, diff, min_games):
    """Matriz (n, 3) com P(1), P(X), P(2)."""
    probs = np.zeros((len(diff), 3))
    probs[:, model.classes_] = model.predict_proba(features(diff, min_games))
    return probs


def base_rate_proba(y_train, n):
    """Frequencia historica de 1/X/2 no periodo de treino, igual para todos os jogos."""
    freq = np.bincount(y_train, minlength=3) / len(y_train)
    return np.tile(freq, (n, 1))


def uniform_proba(n):
    return np.full((n, 3), 1 / 3)


def home_always_proba(n):
    """'Sempre o mandante': probabilidade quase toda no 1 (so para contar acertos)."""
    p = np.full((n, 3), 0.0)
    p[:, 0] = 1.0
    return p


def log_loss(y, probs):
    return float(-np.mean(np.log(np.clip(probs[np.arange(len(y)), y], _EPS, 1))))


def brier(y, probs):
    onehot = np.eye(3)[y]
    return float(np.mean(np.sum((probs - onehot) ** 2, axis=1)))
