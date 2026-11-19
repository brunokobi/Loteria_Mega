from datetime import datetime

import pandas as pd

from loteca.registry import TIMEZONE, deadline_of, record_rounds, score_rounds, summarize


def make_round(number=10, odds=(0.6, 0.25, 0.15)):
    return {
        'number': number, 'date': '2026-11-21', 'bets_until': '2026-11-21', 'bets_until_hour': '15',
        'games': [
            {'seq': 1, 'home': 'A', 'away': 'B', 'date': '2026-11-21', 'odds': list(odds),
             'elo': None},
            {'seq': 2, 'home': 'C', 'away': 'D', 'date': '2026-11-22', 'odds': None,
             'elo': [0.2, 0.3, 0.5]},
        ],
    }


def at(day, hour):
    return datetime(2026, 11, day, hour, 0, tzinfo=TIMEZONE)


def test_deadline():
    assert deadline_of(make_round()) == at(21, 15)


def test_record_updates_until_deadline_then_freezes():
    reg = {'rounds': []}
    record_rounds(reg, [make_round()], now=at(19, 10))
    first = reg['rounds'][0]
    assert first['games'][0]['pick'] == '1' and first['games'][1]['pick'] == '2'
    assert first['games'][0]['source'] == 'odds' and first['games'][1]['source'] == 'elo'
    # antes do prazo: odds mudaram -> atualiza, mantendo a data do primeiro registro
    record_rounds(reg, [make_round(odds=(0.2, 0.3, 0.5))], now=at(21, 9))
    assert reg['rounds'][0]['games'][0]['pick'] == '2'
    assert reg['rounds'][0]['first_registered_at'] == '2026-11-19 10:00'
    # depois do prazo: congelado
    record_rounds(reg, [make_round(odds=(0.9, 0.05, 0.05))], now=at(21, 16))
    assert reg['rounds'][0]['games'][0]['pick'] == '2'


def test_round_without_predictions_for_all_games_is_skipped():
    rnd = make_round()
    rnd['games'][1]['elo'] = None
    reg = record_rounds({'rounds': []}, [rnd], now=at(19, 10))
    assert reg['rounds'] == []


def test_score_and_summary():
    reg = record_rounds({'rounds': []}, [make_round()], now=at(19, 10))
    df = pd.DataFrame({'concurso': [10, 10], 'jogo': [1, 2], 'result': ['1', 'X']})
    score_rounds(reg, df)
    res = reg['rounds'][0]['result']
    assert res['hits'] == 1 and res['games'] == 2 and res['pct'] == 0.5
    assert res['hits_odds'] == 1 and res['games_odds'] == 1
    assert reg['rounds'][0]['games'][1]['outcome'] == 'X'
    s = summarize(reg)
    assert s['rounds'] == 1 and s['pct'] == 0.5
    # nao confere de novo nem muda depois de conferido
    record_rounds(reg, [make_round(odds=(0.1, 0.1, 0.8))], now=at(19, 11))
    assert reg['rounds'][0]['games'][0]['pick'] == '1'


def test_unscored_round_stays_pending():
    reg = record_rounds({'rounds': []}, [make_round()], now=at(19, 10))
    score_rounds(reg, pd.DataFrame({'concurso': [9], 'jogo': [1], 'result': ['1']}))
    assert reg['rounds'][0]['result'] is None and summarize(reg) is None
