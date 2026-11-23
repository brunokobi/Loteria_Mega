import numpy as np
import pandas as pd
import pytest

from loteca.data import load_games, normalize_name, team_key
from loteca.elo import goal_multiplier, run_elo
from loteca.model import brier, fit_outcome_model, log_loss, predict_proba, uniform_proba
from loteca.update import RoundDataError, parse_round, update_csv


def api_game(seq, home='FLAMENGO', away='VASCO', gh=1, ga=0, date='17/02/2002', drawn=0):
    return {'nuSequencial': seq, 'dtJogo': date, 'nomeCampeonato': '', 'nomeEquipeUm': home,
            'siglaUFUm': 'RJ', 'nomeEquipeDois': away, 'siglaUFDois': 'RJ',
            'nuGolEquipeUm': gh, 'nuGolEquipeDois': ga, 'icSorteioResultado': drawn}


def api_round(number, n_games=14, **kw):
    return {'numero': number, 'dataApuracao': '18/02/2002',
            'listaResultadoEquipeEsportiva': [api_game(i, **kw) for i in range(1, n_games + 1)]}


def test_parse_round():
    rows = parse_round(api_round(1))
    assert len(rows) == 14
    assert rows[0]['data'] == '2002-02-17'
    assert rows[0]['gols_mandante'] == 1 and rows[0]['sorteado'] == 0


def test_parse_round_without_date_uses_apuracao():
    rows = parse_round(api_round(1, date='', drawn=1))
    assert rows[0]['data'] == '2002-02-18' and rows[0]['sorteado'] == 1


def test_parse_round_accepts_incomplete_round():
    assert len(parse_round(api_round(1, n_games=13))) == 13


def test_parse_round_rejects_bad_data():
    with pytest.raises(RoundDataError):
        parse_round(api_round(1, n_games=0))
    bad = api_round(1)
    bad['listaResultadoEquipeEsportiva'][1]['nuSequencial'] = 1  # duplicado
    with pytest.raises(RoundDataError):
        parse_round(bad)
    with pytest.raises(RoundDataError):
        parse_round(api_round(2), expected_number=3)


def test_update_csv_resumes(tmp_path):
    path = tmp_path / 'loteca.csv'

    def fetch(number=None, bad=None):
        return api_round(3 if number is None else number)

    def fetch3(number=None):
        if number is not None and number > 3:
            raise OSError('404')
        return api_round(3 if number is None else number)

    assert update_csv(path, fetch=fetch3, delay=0, log=lambda *_: None) == 3
    assert update_csv(path, fetch=fetch3, delay=0, log=lambda *_: None) == 0
    df = pd.read_csv(path)
    assert len(df) == 42 and df['concurso'].tolist()[-1] == 3


def test_normalize_names():
    assert normalize_name('São  Caetano') == 'SAO CAETANO'
    assert normalize_name('S. PAULO') == 'SAO PAULO'
    assert normalize_name('Ferroviario ST') == 'FERROVIARIO ST'
    assert team_key('Atlético', 'MG') != team_key('Atlético', 'PR')


def make_games(n=300, seed=0):
    """Liga sintetica: 'FORTE' vence quase sempre."""
    rng = np.random.RandomState(seed)
    teams = ['FORTE', 'A', 'B', 'C', 'D', 'E']
    rows = []
    for i in range(n):
        h, a = rng.choice(teams, 2, replace=False)
        gh, ga = rng.poisson(1.4), rng.poisson(1.1)
        if 'FORTE' in (h, a):
            gh, ga = (3, 0) if h == 'FORTE' else (0, 3)
        rows.append({'concurso': i // 14 + 1, 'jogo': i % 14 + 1, 'data': '2002-01-01',
                     'campeonato': '', 'mandante': h, 'uf_mandante': '', 'visitante': a,
                     'uf_visitante': '', 'gols_mandante': gh, 'gols_visitante': ga, 'sorteado': 0})
    return pd.DataFrame(rows)


def test_elo_strong_team_rises(tmp_path):
    path = tmp_path / 'g.csv'
    make_games().to_csv(path, index=False)
    games = load_games(path)
    _, _, ratings, _ = run_elo(games)
    assert ratings['FORTE'] == max(ratings.values())


def test_elo_no_future_leakage(tmp_path):
    path = tmp_path / 'g.csv'
    games = make_games()
    games.to_csv(path, index=False)
    diff, ming, _, _ = run_elo(load_games(path))

    changed = games.copy()
    changed.loc[150:, ['gols_mandante', 'gols_visitante']] = [5, 0]
    changed.to_csv(path, index=False)
    diff2, ming2, _, _ = run_elo(load_games(path))
    # o estado antes do jogo 150 (inclusive) so depende dos jogos anteriores
    assert np.array_equal(diff[:151], diff2[:151]) and np.array_equal(ming[:151], ming2[:151])
    assert not np.array_equal(diff[152:], diff2[152:])


def test_drawn_games_do_not_update_elo(tmp_path):
    path = tmp_path / 'g.csv'
    games = make_games(28)
    games['sorteado'] = 1
    games.to_csv(path, index=False)
    _, _, ratings, played = run_elo(load_games(path))
    assert set(ratings.values()) == {1500.0} and not any(played.values())


def test_goal_multiplier():
    assert goal_multiplier(0) == goal_multiplier(1) == 1.0
    assert goal_multiplier(-2) == 1.5
    assert goal_multiplier(4) == pytest.approx(15 / 8)


def test_outcome_model_and_metrics(tmp_path):
    path = tmp_path / 'g.csv'
    make_games(600).to_csv(path, index=False)
    games = load_games(path)
    diff, ming, _, _ = run_elo(games)
    y = games['y'].to_numpy()
    model = fit_outcome_model(diff, ming, y)
    p = predict_proba(model, diff, ming)
    assert p.shape == (600, 3) and np.allclose(p.sum(axis=1), 1)
    assert log_loss(y, p) < log_loss(y, uniform_proba(600))
    assert brier(y, uniform_proba(600)) == pytest.approx(2 / 3)


# ── casamento com o football-data ───────────────────────────────────
from loteca.matching import country_of, match_games, similarity  # noqa: E402
from loteca.odds_history import implied_probs  # noqa: E402


def test_country_of():
    assert country_of('SP') == 'BRA' and country_of('ING') == 'ING'
    assert country_of('') is None and country_of('ARG') is None


def test_similarity():
    assert similarity('SAO PAULO', 'SAO PAULO') == 1.0
    assert similarity('MONCHENGLADBACH', 'M GLADBACH') < 0.85
    assert similarity('SPORT', 'SPORT RECIFE') >= 0.85
    assert similarity('ARSENAL', 'CHELSEA') < 0.6


def test_implied_probs_removes_margin():
    df = pd.DataFrame({'PSCH': [2.0], 'PSCD': [3.5], 'PSCA': [4.0]})
    p, src = implied_probs(df)
    assert p.sum() == pytest.approx(1.0) and src[0] == 'PSCH'
    assert p[0, 0] > p[0, 2]


def test_match_games_requires_same_score_and_date():
    lot = pd.DataFrame([
        {'data': '2024-03-10', 'mandante': 'MANCHESTER UNITED', 'uf_mandante': 'ING',
         'visitante': 'ARSENAL', 'uf_visitante': 'ING', 'gols_mandante': 2, 'gols_visitante': 1},
        {'data': '2024-03-10', 'mandante': 'CHELSEA', 'uf_mandante': 'ING',
         'visitante': 'LIVERPOOL', 'uf_visitante': 'ING', 'gols_mandante': 0, 'gols_visitante': 0},
        {'data': '2024-03-10', 'mandante': 'AVAI', 'uf_mandante': 'SC',
         'visitante': 'FIGUEIRENSE', 'uf_visitante': 'SC', 'gols_mandante': 1, 'gols_visitante': 1},
    ])
    odds = pd.DataFrame([
        {'date': '2024-03-11', 'country': 'ING', 'league': 'E0', 'home': 'Man United',
         'away': 'Arsenal', 'hg': 2, 'ag': 1, 'p1': 0.4, 'px': 0.3, 'p2': 0.3},
        {'date': '2024-03-10', 'country': 'ING', 'league': 'E0', 'home': 'Chelsea',
         'away': 'Liverpool', 'hg': 1, 'ag': 0, 'p1': 0.3, 'px': 0.3, 'p2': 0.4},  # outro placar
    ])
    m = match_games(lot, odds)
    assert m.loc[0, 'odds_p1'] == 0.4 and m.loc[0, 'odds_league'] == 'E0'
    assert np.isnan(m.loc[1, 'odds_p1'])  # placar nao bate
    assert np.isnan(m.loc[2, 'odds_p1'])  # sem odds para estadual


# ── odds da semana (OddsPapi) ───────────────────────────────────────
from loteca import live  # noqa: E402


def test_split_name_and_match_team():
    assert live.split_name('CR Flamengo RJ', 'BRA') == ('CR FLAMENGO', 'RJ')
    assert live.split_name('Arsenal FC', 'ING') == ('ARSENAL FC', 'ING')
    ratings = {'FLAMENGO/RJ': 1600, 'FLAMENGO B/RJ': 1400, 'VASCO DA GAMA/RJ': 1550,
               'CORINTHIANS/SP': 1580, 'CORINTHIANS B/SP': 1450, 'ARSENAL/ING': 1700}
    index = live.build_team_index(ratings)
    assert live.match_team('CR Flamengo RJ', 'BRA', index) == 'FLAMENGO/RJ'
    assert live.match_team('CR Vasco da Gama RJ', 'BRA', index) == 'VASCO DA GAMA/RJ'
    assert live.match_team('SC Corinthians SP', 'BRA', index) == 'CORINTHIANS/SP'
    assert live.match_team('Arsenal FC', 'ING', index) == 'ARSENAL/ING'
    assert live.match_team('Chelsea FC', 'ING', index) is None


def test_match_team_international_tournament():
    # Libertadores / Sul-Americana (country None): brasileiro vem com a UF no nome
    ratings = {'ATLETICO/MG': 1620, 'ATLETICO': 1500, 'PALMEIRAS/SP': 1650,
               'BOCA JUNIORS/ARG': 1600, 'ESTUDIANTES/ARG': 1550}
    index = live.build_team_index(ratings)
    assert live.split_name('Atletico Mineiro MG', None) == ('ATLETICO MINEIRO', 'MG')
    assert live.match_team('Atletico Mineiro MG', None, index) == 'ATLETICO/MG'
    assert live.match_team('SE Palmeiras SP', None, index) == 'PALMEIRAS/SP'
    assert live.match_team('Boca Juniors', None, index) == 'BOCA JUNIORS/ARG'
    assert live.match_team('Estudiantes de La Plata', None, index) == 'ESTUDIANTES/ARG'


def test_probs_from_market():
    def out(price):
        return {'players': {'0': {'price': price}}}
    market = {'outcomes': {'101': out(2.0), '102': out(3.5), '103': out(4.0)}}
    p = live._probs_from_market(market)
    assert sum(p) == pytest.approx(1, abs=1e-3) and p[0] > p[2]
    assert live._probs_from_market({'outcomes': {'101': out(2.0)}}) is None


def test_fetch_upcoming_without_key_returns_empty(monkeypatch):
    monkeypatch.delenv('ODDSPAPI_KEY', raising=False)
    assert live.fetch_upcoming({}, log=lambda *_: None) == []


def test_fetch_upcoming_api_error_returns_empty(monkeypatch):
    def boom(*a, **k):
        raise OSError('offline')
    monkeypatch.setattr(live, '_get', boom)
    assert live.fetch_upcoming({}, key='x', log=lambda *_: None) == []


def test_merge_name_variants():
    from loteca.data import merge_name_variants
    df = pd.DataFrame({
        'concurso': [1, 2, 3, 3],
        'home': ['VASCO/RJ', 'VASCO DA GAMA/RJ', 'PORTUGUESA/SP', 'PORTUGUESA SANTIS/SP'],
        'away': ['X/RJ', 'Y/RJ', 'Z/SP', 'W/SP'],
    })
    canon = merge_name_variants(df)
    assert canon['VASCO/RJ'] == canon['VASCO DA GAMA/RJ']  # nunca no mesmo concurso
    assert canon['PORTUGUESA/SP'] != canon['PORTUGUESA SANTIS/SP']  # clubes diferentes


# ── programacao oficial do concurso ─────────────────────────────────
def test_parse_programacao_and_resolve():
    data = [{'nuConcurso': 1284, 'dataProximoConcurso': '21/11/2026', 'diaSemana': 'Sábado',
             'dataFimApostas': '21/11/2026', 'horarioFimApostas': '15',
             'valorEstimadoProximoConcurso': 3500000.0,
             'listaJogos': [
                 {'nuSequencial': 2, 'dtJogo': '22/11/2026 00:00:00', 'diaSemana': 'Domingo',
                  'nomeEquipeUm': 'REAL MADRID', 'siglaUFUm': '', 'nomeEquipeDois': 'CELTA DE VIGO',
                  'siglaUFDois': ''},
                 {'nuSequencial': 1, 'dtJogo': '21/11/2026 00:00:00', 'diaSemana': 'Sábado',
                  'nomeEquipeUm': 'PALMEIRAS', 'siglaUFUm': 'SP', 'nomeEquipeDois': 'FLAMENGO',
                  'siglaUFDois': 'RJ'}]}]
    rounds = live.parse_programacao(data)
    assert rounds[0]['number'] == 1284 and rounds[0]['date'] == '2026-11-21'
    assert [g['seq'] for g in rounds[0]['games']] == [1, 2]
    ratings = {'PALMEIRAS/SP': 1600, 'FLAMENGO/RJ': 1620, 'REAL MADRID/ESP': 1700,
               'CELTA DE VIGO/ESP': 1500, 'BARCELONA/ESP': 1690, 'BARCELONA/BA': 1400}
    played = {k: 50 for k in ratings}
    lookup = live.build_team_lookup(set(ratings), {}, ratings, played)
    g1, g2 = rounds[0]['games']
    assert live.resolve_team(g1['home'], g1['home_uf'], lookup) == 'PALMEIRAS/SP'
    assert live.resolve_team(g2['home'], g2['home_uf'], lookup) == 'REAL MADRID/ESP'
    assert live.resolve_team('BARCELONA', '', lookup) == 'BARCELONA/ESP'  # sem UF: fora do Brasil


def test_match_fixture_by_keys_and_names():
    game = {'date': '2026-11-21', 'home': 'PALMEIRAS', 'away': 'FLAMENGO',
            'home_key': 'PALMEIRAS/SP', 'away_key': 'FLAMENGO/RJ'}
    fixtures = [
        {'start': '2026-11-21T19:30Z', 'home': 'SE Palmeiras SP', 'away': 'CR Flamengo RJ',
         'home_key': 'PALMEIRAS/SP', 'away_key': 'FLAMENGO/RJ', 'odds': [0.3, 0.3, 0.4]},
        {'start': '2026-11-21T19:30Z', 'home': 'Santos FC SP', 'away': 'Gremio RS',
         'home_key': None, 'away_key': None, 'odds': [0.5, 0.3, 0.2]},
    ]
    assert live.match_fixture(game, fixtures)['odds'] == [0.3, 0.3, 0.4]
    no_keys = dict(game, home_key=None, away_key=None)
    assert live.match_fixture(no_keys, fixtures)['odds'] == [0.3, 0.3, 0.4]  # pelos nomes
    far = dict(game, date='2026-11-25')
    assert live.match_fixture(far, fixtures) is None  # data distante


def test_update_csv_probes_beyond_stale_latest(tmp_path):
    """O 'ultimo' da Caixa ainda diz 3, mas o 4 ja foi apurado e responde pelo numero."""
    path = tmp_path / 'loteca.csv'

    def fetch(number=None):
        if number is None:
            return api_round(3)
        if number > 4:
            raise OSError('404')
        return api_round(number)

    assert update_csv(path, fetch=fetch, delay=0, log=lambda *_: None) == 4
    assert pd.read_csv(path)['concurso'].max() == 4


def test_parse_round_rejects_unapurado():
    data = api_round(5)
    data['dataApuracao'] = None
    with pytest.raises(RoundDataError):
        parse_round(data)
