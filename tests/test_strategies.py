import numpy as np
import pytest

from megasena import strategies
from megasena.data import draw_matrix


def test_hypergeom_probs():
    probs = strategies.hypergeom_probs()
    assert sum(probs) == pytest.approx(1.0)
    assert sum(k * p for k, p in enumerate(probs)) == pytest.approx(0.6)
    assert probs[3] == pytest.approx(0.009908, rel=1e-3)
    assert probs[4] == pytest.approx(4.29e-4, rel=1e-2)
    assert probs[6] == pytest.approx(1 / 50_063_860)


def test_hypergeom_expected_counts():
    exp = strategies.hypergeom_expected(500)
    assert exp['mean_hits'] == pytest.approx(0.6)
    assert exp['expected_counts']['tres'] == pytest.approx(4.954, rel=1e-3)


def test_hot_cold_picks_tiebreak():
    counts = np.zeros(60, dtype=int)
    counts[[9, 19, 29]] = 5  # numeros 10, 20, 30
    hot, cold = strategies.hot_cold_picks(counts)
    assert hot == {10, 20, 30, 1, 2, 3}
    assert cold == {1, 2, 3, 4, 5, 6}


def test_hot_cold_use_only_past_draws(draws, monkeypatch):
    seen = []
    original = strategies.hot_cold_picks

    def spy(counts):
        seen.append(counts.copy())
        return original(counts)

    monkeypatch.setattr(strategies, 'hot_cold_picks', spy)
    n_test = 40
    strategies.compare_strategies(draws, n_test=n_test)

    matrix = draw_matrix(draws)
    n_train = len(draws) - n_test
    assert len(seen) == n_test
    for i, counts in enumerate(seen):
        assert np.array_equal(counts, matrix[:n_train + i].sum(axis=0))


def test_compare_strategies_output(draws):
    res = strategies.compare_strategies(draws, n_test=50)
    assert set(res) == set(strategies.STRATEGIES)
    for r in res.values():
        lo, hi = r['ci95']
        assert lo <= r['avg_hits'] <= hi
        assert r['tres'] + r['quadra'] + r['quina'] + r['sena'] <= 50
