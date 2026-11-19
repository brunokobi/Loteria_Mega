"""
Teste no passado do modelo Elo da Loteca.

Divisao temporal:
  - ajuste:    primeira metade dos concursos (escolha de K e vantagem de mando)
  - teste:     segunda metade, nunca usada para escolher nada
O Elo e sempre calculado em ordem cronologica: cada jogo e previsto so com o passado.
"""
import itertools

import numpy as np

from .data import OUTCOMES, load_games
from .elo import run_elo
from .model import (
    base_rate_proba,
    brier,
    fit_outcome_model,
    home_always_proba,
    log_loss,
    predict_proba,
    uniform_proba,
)

K_GRID = [10, 20, 30, 40, 60]
HOME_GRID = [0, 30, 60, 90, 120]
WARMUP_ROUNDS = 100  # primeiros concursos so aquecem o Elo (todo time comeca em 1500)


def _split(games, tune_frac=0.5):
    rounds = np.sort(games['concurso'].unique())
    cut = rounds[int(len(rounds) * tune_frac)]
    warm = rounds[min(WARMUP_ROUNDS, len(rounds) - 1)]
    return warm, cut


def tune(games, warm, cut):
    """Escolhe K e vantagem de mando pelo log loss numa validacao dentro do periodo de ajuste."""
    rounds = games['concurso'].to_numpy()
    fit_mask = (rounds >= warm) & (rounds < warm + (cut - warm) * 0.7)
    val_mask = (rounds >= warm + (cut - warm) * 0.7) & (rounds < cut)
    y = games['y'].to_numpy()
    best = None
    for k, h in itertools.product(K_GRID, HOME_GRID):
        diff, ming, _, _ = run_elo(games, k=k, home_adv=h)
        model = fit_outcome_model(diff[fit_mask], ming[fit_mask], y[fit_mask])
        ll = log_loss(y[val_mask], predict_proba(model, diff[val_mask], ming[val_mask]))
        if best is None or ll < best[0]:
            best = (ll, k, h)
    return {"k": best[1], "home_adv": best[2], "val_log_loss": best[0]}


def round_hits(games_mask_df, picks):
    """
    Acertos por concurso escolhendo um resultado por jogo (aposta simples).
    Considera so concursos com os 14 jogos (a API tem alguns antigos incompletos).
    """
    hit = (picks == games_mask_df['y'].to_numpy())
    g = games_mask_df.assign(hit=hit).groupby('concurso')['hit'].agg(['sum', 'count'])
    return g.loc[g['count'] == 14, 'sum'].to_numpy()


def run_backtest(games=None, params=None):
    games = load_games() if games is None else games
    warm, cut = _split(games)
    params = params or tune(games, warm, cut)

    diff, ming, ratings, played = run_elo(games, k=params['k'], home_adv=params['home_adv'])
    rounds = games['concurso'].to_numpy()
    y = games['y'].to_numpy()
    train = (rounds >= warm) & (rounds < cut)
    test = rounds >= cut

    model = fit_outcome_model(diff[train], ming[train], y[train])
    test_df = games[test]
    y_test = y[test]
    n = int(test.sum())

    predictors = {
        'elo': predict_proba(model, diff[test], ming[test]),
        'media_historica': base_rate_proba(y[rounds < cut], n),
        'aleatorio': uniform_proba(n),
        'sempre_mandante': home_always_proba(n),
    }

    report = {
        "rounds": {"total": int(len(np.unique(rounds))), "warmup_end": int(warm),
                   "test_start": int(cut), "test_rounds": int(len(np.unique(rounds[test])))},
        "games_test": n,
        "params": params,
        "outcome_freq_train": dict(zip(OUTCOMES, (np.bincount(y[rounds < cut], minlength=3)
                                                  / (rounds < cut).sum()).round(4).tolist())),
        "outcome_freq_test": dict(zip(OUTCOMES, (np.bincount(y_test, minlength=3) / n)
                                      .round(4).tolist())),
        "predictors": {},
    }
    rng = np.random.RandomState(42)
    for name, p in predictors.items():
        # aleatorio: sorteia o palpite (argmax de probabilidades iguais escolheria sempre o 1)
        picks = rng.randint(0, 3, n) if name == 'aleatorio' else p.argmax(axis=1)
        hits = round_hits(test_df, picks)
        entry = {
            "accuracy": round(float((picks == y_test).mean()), 4),
            "hits_per_round_mean": round(float(hits.mean()), 3),
            "hits_per_round_std": round(float(hits.std(ddof=1)), 3),
            "hits_max": int(hits.max()),
            "rounds_10_plus": int((hits >= 10).sum()),
        }
        if name != 'sempre_mandante':  # probabilidade degenerada: log loss nao faz sentido
            entry["log_loss"] = round(log_loss(y_test, p), 4)
            entry["brier"] = round(brier(y_test, p), 4)
        report["predictors"][name] = entry

    # calibracao do Elo: probabilidade do palpite vs frequencia real de acerto
    p_elo = predictors['elo']
    conf = p_elo.max(axis=1)
    correct = p_elo.argmax(axis=1) == y_test
    bins = [0.33, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 1.01]
    report["calibration"] = [
        {"range": f"{lo:.2f}-{min(hi, 1):.2f}", "games": int(m.sum()),
         "predicted": round(float(conf[m].mean()), 3),
         "observed": round(float(correct[m].mean()), 3)}
        for lo, hi in zip(bins, bins[1:]) if (m := (conf >= lo) & (conf < hi)).sum() > 0
    ]
    report["teams"] = len(ratings)
    return report


def main():
    import json
    print(json.dumps(run_backtest(), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()


# ── Elo x odds x combinacao ─────────────────────────────────────────
def _odds_features(diff, ming, odds_probs):
    from .model import features
    logp = np.log(np.clip(odds_probs, 1e-6, 1))
    return np.column_stack([features(diff, ming), logp])


def run_odds_comparison(games=None, odds_path=None, params=None):
    """
    Nos jogos que tem odds historicas (football-data.co.uk), compara no periodo de teste:
      - Elo sozinho, odds sozinhas (probabilidade sem margem) e a combinacao (regressao
        logistica com as features do Elo + log das probabilidades das odds, ajustada no treino).
    Tambem mede os acertos por concurso usando a combinacao onde ha odds e o Elo no resto.
    """
    import pandas as pd
    from sklearn.linear_model import LogisticRegression

    from .matching import match_games
    from .odds_history import DEFAULT_CSV as ODDS_CSV

    games = load_games() if games is None else games
    warm, cut = _split(games)
    params = params or tune(games, warm, cut)
    diff, ming, _, _ = run_elo(games, k=params['k'], home_adv=params['home_adv'])
    rounds = games['concurso'].to_numpy()
    y = games['y'].to_numpy()
    train = (rounds >= warm) & (rounds < cut)
    test = rounds >= cut

    matched = match_games(games, pd.read_csv(odds_path or ODDS_CSV))
    odds_p = matched[['odds_p1', 'odds_px', 'odds_p2']].to_numpy()
    has = ~np.isnan(odds_p[:, 0])

    elo_model = fit_outcome_model(diff[train], ming[train], y[train])
    p_elo = predict_proba(elo_model, diff, ming)

    blend = LogisticRegression(C=1.0, max_iter=2000)
    tr = train & has
    blend.fit(_odds_features(diff[tr], ming[tr], odds_p[tr]), y[tr])
    p_blend = np.full_like(p_elo, np.nan)
    p_blend[has] = blend.predict_proba(_odds_features(diff[has], ming[has], odds_p[has]))

    te = test & has
    res = {"test_games_with_odds": int(te.sum()), "test_games": int(test.sum()),
           "train_games_with_odds": int(tr.sum()), "on_games_with_odds": {}}
    for name, p in (('elo', p_elo), ('odds', odds_p), ('elo_mais_odds', p_blend)):
        pt = p[te]
        res["on_games_with_odds"][name] = {
            "accuracy": round(float((pt.argmax(1) == y[te]).mean()), 4),
            "log_loss": round(log_loss(y[te], pt), 4),
            "brier": round(brier(y[te], pt), 4),
        }

    # aposta simples por concurso: melhor fonte disponivel em cada jogo
    best = np.where(has[:, None], np.where(np.isnan(p_blend), odds_p, p_blend), p_elo)
    test_df = games[test]
    elo_or_odds = np.where(has[:, None], odds_p, p_elo)
    for name, p in (('elo', p_elo), ('elo_ou_combinacao', best), ('elo_ou_odds', elo_or_odds)):
        hits = round_hits(test_df, p[test].argmax(1))
        res[f"hits_per_round_{name}"] = round(float(hits.mean()), 3)
    res["blend_weights"] = {
        "classes": [OUTCOMES[c] for c in blend.classes_],
        "coef": np.round(blend.coef_, 3).tolist(),
        "features": ['elo_diff', 'time_novo', 'elo_x_novo', 'log_p1_odds', 'log_px_odds',
                     'log_p2_odds'],
    }
    return res
