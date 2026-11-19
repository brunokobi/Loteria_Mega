from datetime import date

import pytest

from megasena.history import _summary, retro_history, update_log
from megasena.schedule import estimate_next_draw, next_draw_info
from tests.conftest import make_draws


def draws_with_numbers(n=120):
    df = make_draws(n)
    df.insert(0, 'DrawNumber', range(1, n + 1))
    return df


def test_estimate_next_draw_follows_tue_thu_sat():
    # 17/11/2026 e terca -> proximo quinta 19/11; quinta -> sabado; sabado -> terca
    assert estimate_next_draw('2026-11-17', today=date(2026, 11, 17)) == '2026-11-19'
    assert estimate_next_draw('2026-11-19', today=date(2026, 11, 19)) == '2026-11-21'
    assert estimate_next_draw('2026-11-21', today=date(2026, 11, 21)) == '2026-11-24'


def test_estimate_next_draw_never_in_the_past():
    assert estimate_next_draw('2026-01-01', today=date(2026, 11, 18)) >= '2026-11-18'


def test_next_draw_info_prefers_caixa_and_falls_back():
    today = date(2026, 11, 18)
    api = {'next_draw': {'number': 3088, 'date': '19/11/2026'}}
    assert next_draw_info(3087, '2026-11-17', api, today) == \
        {'number': 3088, 'date': '2026-11-19', 'source': 'caixa'}
    est = next_draw_info(3087, '2026-11-17', None, today)
    assert est['source'] == 'estimado' and est['number'] == 3088
    stale = {'next_draw': {'number': 3080, 'date': '01/11/2026'}}  # resposta antiga: ignora
    assert next_draw_info(3087, '2026-11-17', stale, today)['source'] == 'estimado'


def test_update_log_registers_once_and_scores_later():
    df = draws_with_numbers()
    log1 = update_log({'entries': []}, df.iloc[:-1], [[1, 2, 3, 4, 5, 6]] * 10)
    target = int(df['DrawNumber'].iloc[-1])
    assert log1['next'] == target and log1['entries'][0]['result'] is None
    # novo build antes do sorteio: a primeira previsao registrada continua valendo
    log2 = update_log(log1, df.iloc[:-1], [[7, 8, 9, 10, 11, 12]] * 10)
    assert log2['entries'][0]['combinations'][0] == [1, 2, 3, 4, 5, 6]
    # depois do sorteio: confere e registra o proximo
    log3 = update_log(log2, df, [[7, 8, 9, 10, 11, 12]] * 10)
    scored = next(e for e in log3['entries'] if e['concurso'] == target)
    actual = set(df.iloc[-1][['Ball1', 'Ball2', 'Ball3', 'Ball4', 'Ball5', 'Ball6']].astype(int))
    assert scored['hits'][0] == len(actual & {1, 2, 3, 4, 5, 6})
    assert log3['next'] == target + 1 and log3['summary']['games'] == 10


def test_summary_counts():
    s = _summary([[0, 1, 3], [2, 2, 0]])
    assert s['games'] == 6 and s['hits_distribution']['2'] == 2
    assert s['draws_with_terno_or_better'] == 1


def test_retro_history_small():
    df = draws_with_numbers(120)
    r = retro_history(df, n_draws=20, retrain_every=10, n_estimators=5, log=lambda *_: None)
    assert r['draws'] == 20 and len(r['rows']) == 20 and r['model']['games'] == 200
    assert r['first'] == 101 and r['last'] == 120
    assert r['expected']['mean_hits'] == pytest.approx(0.6)
    assert all(len(row['hits']) == 10 for row in r['rows'])
