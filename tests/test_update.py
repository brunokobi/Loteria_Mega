import pytest

from megasena.data import load_draws
from megasena.update import DrawDataError, parse_draw, update_csv

HEADER = ',DrawNumber,DrawDate,Ball1,Ball2,Ball3,Ball4,Ball5,Ball6\n'


def api(number, balls=('25', '06', '50', '10', '48', '23'), date='17/11/2026'):
    return {'numero': number, 'dataApuracao': date, 'listaDezenas': list(balls)}


@pytest.fixture
def csv_path(tmp_path):
    path = tmp_path / 'draws.csv'
    path.write_text(HEADER
                    + '0,1,1996-03-11 00:00:00,4,5,30,33,41,52\n'
                    + '1,2,1996-03-18 00:00:00,9,37,39,41,43,49\n')
    return path


def fake_api(latest, bad=None):
    def fetch(number=None):
        if number is None:
            return api(latest)
        if number == bad:
            raise OSError('timeout')
        return api(number)
    return fetch


def test_parse_draw():
    assert parse_draw(api(3087)) == (3087, '2026-11-17 00:00:00', [6, 10, 23, 25, 48, 50])


@pytest.mark.parametrize('balls', [
    ('1', '2', '3', '4', '5'),          # 5 dezenas
    ('1', '1', '2', '3', '4', '5'),     # repetida
    ('0', '2', '3', '4', '5', '6'),     # fora de 1-60
    ('1', '2', '3', '4', '5', '61'),
])
def test_parse_draw_rejects_invalid(balls):
    with pytest.raises(DrawDataError):
        parse_draw(api(10, balls))


def test_parse_draw_rejects_wrong_number():
    with pytest.raises(DrawDataError):
        parse_draw(api(11), expected_number=10)


def test_update_appends_missing_draws(csv_path):
    added = update_csv(csv_path, fetch=fake_api(5), delay=0, log=lambda *_: None)
    assert added == 3
    df = load_draws(csv_path)
    assert df['DrawNumber'].tolist() == [1, 2, 3, 4, 5]
    assert df['Unnamed: 0'].tolist() == [0, 1, 2, 3, 4]
    assert df.iloc[-1][['Ball1', 'Ball6']].tolist() == [6, 50]


def test_update_noop_when_current(csv_path):
    before = csv_path.read_text()
    assert update_csv(csv_path, fetch=fake_api(2), delay=0, log=lambda *_: None) == 0
    assert csv_path.read_text() == before


def test_update_keeps_progress_on_failure(csv_path):
    added = update_csv(csv_path, fetch=fake_api(6, bad=5), delay=0, log=lambda *_: None)
    assert added == 2
    assert load_draws(csv_path)['DrawNumber'].tolist() == [1, 2, 3, 4]


def test_update_survives_api_down(csv_path):
    def down(number=None):
        raise OSError('offline')
    before = csv_path.read_text()
    assert update_csv(csv_path, fetch=down, delay=0, log=lambda *_: None) == 0
    assert csv_path.read_text() == before


def test_mirror_to_caixa_format():
    from megasena.update import mirror_to_caixa
    raw = {'concurso': 3087, 'data': '17/11/2026', 'dezenas': ['06', '10', '23', '25', '48', '50'],
           'proximoConcurso': 3088, 'dataProximoConcurso': '19/11/2026'}
    converted = mirror_to_caixa(raw)
    assert parse_draw(converted, expected_number=3087) == \
        (3087, '2026-11-17 00:00:00', [6, 10, 23, 25, 48, 50])
    assert converted['numeroConcursoProximo'] == 3088 and converted['fonte'] == 'espelho'


def test_fetch_draw_falls_back_to_mirror(monkeypatch):
    import urllib.error

    from megasena import update

    def fake(url, timeout, retries):
        if 'caixa.gov.br' in url:
            raise urllib.error.HTTPError(url, 403, 'Forbidden', None, None)
        return {'concurso': 10, 'data': '01/01/2026', 'dezenas': ['1', '2', '3', '4', '5', '6']}

    monkeypatch.setattr(update, '_get_json', fake)
    assert update.fetch_draw(10)['fonte'] == 'espelho'


def test_fetch_draw_raises_when_both_fail(monkeypatch):
    import urllib.error

    from megasena import update

    def fail(url, timeout, retries):
        raise urllib.error.HTTPError(url, 403, 'Forbidden', None, None)

    monkeypatch.setattr(update, '_get_json', fail)
    with pytest.raises(urllib.error.HTTPError):
        update.fetch_draw(None)
