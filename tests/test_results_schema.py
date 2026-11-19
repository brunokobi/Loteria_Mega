import json

import pytest

from megasena.model import METRICS, PREDICTORS
from megasena.results import build_results


@pytest.fixture(scope='module')
def results():
    from tests.conftest import make_draws
    return build_results(make_draws(), n_estimators=5, n_folds=3, n_test_strategies=50)


def test_serializable(results):
    json.dumps(results)


def test_top_level_keys(results):
    assert set(results) == {
        'meta', 'combinations', 'numbers', 'even_odd', 'decades', 'sum_stats',
        'consecutive', 'validation', 'balanced_combinations', 'strategies',
    }
    assert results['meta']['total_draws'] == 250


def test_numbers_and_combinations(results):
    assert [n['n'] for n in results['numbers']] == list(range(1, 61))
    assert all({'freq', 'pct', 'prob', 'delay'} <= set(n) for n in results['numbers'])
    assert len(results['combinations']) == 10
    assert all(len(c['numbers']) == 6 for c in results['combinations'])
    assert len(results['balanced_combinations']) == 10
    assert len(results['decades']) == 6


def test_validation_legacy_fields(results):
    v = results['validation']
    for key in ('auc_model', 'auc_baseline', 'train_draws', 'test_draws', 'feature_importance'):
        assert key in v
    assert v['train_draws'] + v['test_draws'] == 250


def test_validation_new_fields(results):
    v = results['validation']
    for name in PREDICTORS:
        assert set(v['holdout'][name]) == set(METRICS)
    wf = v['walk_forward']
    assert wf['n_folds'] == len(wf['folds']) == 3
    assert sum(f['test_draws'] for f in wf['folds']) == 250 - 125
    for name in PREDICTORS:
        for m in METRICS:
            assert set(wf['summary'][name][m]) == {'mean', 'std'}


def test_strategies_fields(results):
    st = results['strategies']
    assert st['draws_tested'] == 50
    assert st['expected']['mean_hits'] == pytest.approx(0.6)
    assert set(st['expected']['expected_counts']) == {'tres', 'quadra', 'quina', 'sena'}
    for r in st['results'].values():
        assert {'tres', 'quadra', 'quina', 'sena', 'avg_hits', 'std_hits', 'ci95'} <= set(r)
