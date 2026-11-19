import numpy as np

from megasena.data import COLS, draw_matrix
from megasena.features import FEATURE_NAMES, build_dataset
from tests._reference import build_dataset as reference_build_dataset


def test_shapes(draws):
    X, y, final_state = build_dataset(draws)
    n = len(draws)
    assert X.shape == (n * 60, len(FEATURE_NAMES))
    assert y.shape == (n * 60,)
    assert final_state.shape == (60, len(FEATURE_NAMES))
    assert y.reshape(n, 60).sum(axis=1).tolist() == [6] * n


def test_matches_reference_implementation(draws):
    X, y, final_state = build_dataset(draws)
    X_ref, y_ref, delays, counts, recent = reference_build_dataset(draws)
    n = len(draws)
    final_ref = np.array([
        [delays[k], k % 2 == 0, counts[k] / n, (k - 1) // 10, recent[k]] for k in range(1, 61)
    ], dtype=float)
    assert np.array_equal(X, X_ref)
    assert np.array_equal(y, y_ref)
    assert np.array_equal(final_state, final_ref)


def test_no_future_leakage(draws):
    """As features do sorteio i so podem depender dos sorteios anteriores a i."""
    cut = 120
    X, _, _ = build_dataset(draws)

    changed = draws.copy()
    rng = np.random.RandomState(123)
    changed.loc[cut:, COLS] = np.array([
        np.sort(rng.choice(np.arange(1, 61), 6, replace=False)) for _ in range(len(draws) - cut)
    ])
    X_changed, _, _ = build_dataset(changed)

    assert np.array_equal(X[:cut * 60], X_changed[:cut * 60])
    assert not np.array_equal(X[(cut + 1) * 60:], X_changed[(cut + 1) * 60:])


def test_draw_matrix(draws):
    m = draw_matrix(draws)
    first = draws.loc[0, COLS].tolist()
    assert m.shape == (len(draws), 60)
    assert sorted(np.flatnonzero(m[0]) + 1) == sorted(first)
