"""Modelo, metricas e validacao temporal (holdout e walk-forward)."""
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

from .data import N_NUMBERS
from .features import FEATURE_NAMES

BASE_RATE = 6 / N_NUMBERS  # 0.1: chance de cada numero em um sorteio
PREDICTORS = ['model', 'baseline_constant', 'baseline_frequency']
METRICS = ['auc', 'log_loss', 'brier']
_EPS = 1e-6
_FREQ_COL = FEATURE_NAMES.index('freq_relativa')


def make_model(n_estimators=100):
    return GradientBoostingClassifier(
        n_estimators=n_estimators, learning_rate=0.1, max_depth=3, random_state=42
    )


def score(y_true, probs):
    """AUC, log loss e Brier de um vetor de probabilidades."""
    p = np.clip(probs, _EPS, 1 - _EPS)
    return {
        "auc": float(roc_auc_score(y_true, probs)),
        "log_loss": float(log_loss(y_true, p, labels=[0, 1])),
        "brier": float(brier_score_loss(y_true, probs)),
    }


def evaluate_split(X, y, train_draws, test_end, n_estimators=100):
    """
    Treina nos sorteios [0, train_draws) e avalia em [train_draws, test_end).
    Compara o modelo com dois baselines:
      - constante: p = 6/60 para todo numero
      - frequencia: p = frequencia acumulada do numero ate o sorteio anterior
    """
    a, b = train_draws * N_NUMBERS, test_end * N_NUMBERS
    clf = make_model(n_estimators)
    clf.fit(X[:a], y[:a])
    y_test = y[a:b]
    probs = {
        "model": clf.predict_proba(X[a:b])[:, 1],
        "baseline_constant": np.full(len(y_test), BASE_RATE),
        "baseline_frequency": X[a:b, _FREQ_COL],
    }
    return clf, {name: score(y_test, p) for name, p in probs.items()}


def holdout_validation(X, y, n_draws, train_frac=0.8, n_estimators=100):
    """Split temporal unico (padrao 80/20)."""
    split = int(n_draws * train_frac)
    clf, metrics = evaluate_split(X, y, split, n_draws, n_estimators)
    importance = sorted(
        [{"name": n, "value": round(float(v), 4)}
         for n, v in zip(FEATURE_NAMES, clf.feature_importances_)],
        key=lambda f: -f['value'],
    )
    return {
        "train_draws": split,
        "test_draws": n_draws - split,
        "metrics": metrics,
        "feature_importance": importance,
    }


def walk_forward(X, y, n_draws, n_folds=5, start_frac=0.5, n_estimators=100):
    """
    Validacao walk-forward com janela expansiva: os sorteios a partir de start_frac
    sao divididos em n_folds blocos; cada fold treina em todo o passado e testa no bloco.
    """
    start = int(n_draws * start_frac)
    block = (n_draws - start) // n_folds
    folds = []
    for k in range(n_folds):
        train_end = start + k * block
        test_end = n_draws if k == n_folds - 1 else train_end + block
        _, metrics = evaluate_split(X, y, train_end, test_end, n_estimators)
        folds.append({"train_draws": train_end, "test_draws": test_end - train_end, **metrics})

    summary = {
        name: {
            m: {
                "mean": float(np.mean([f[name][m] for f in folds])),
                "std": float(np.std([f[name][m] for f in folds], ddof=1)) if n_folds > 1 else 0.0,
            }
            for m in METRICS
        }
        for name in PREDICTORS
    }
    return {"n_folds": n_folds, "folds": folds, "summary": summary}
