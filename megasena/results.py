"""Monta o dicionario completo da analise (gravado em results.json)."""
from datetime import datetime
from zoneinfo import ZoneInfo

from .combinations import balanced_samples, generate_model_combinations
from .features import build_dataset
from .model import holdout_validation, make_model, walk_forward
from .stats import descriptive_stats
from .strategies import compare_strategies, hypergeom_expected

TIMEZONE = ZoneInfo('America/Sao_Paulo')


def _silent(*_args, **_kwargs):
    pass


def build_results(df, *, n_estimators=100, n_folds=5, n_test_strategies=500, log=_silent):
    n_draws = len(df)
    date_start = str(df['DrawDate'].iloc[0])[:10]
    date_end = str(df['DrawDate'].iloc[-1])[:10]
    log(f"{n_draws} sorteios ({date_start} -> {date_end})")

    stats = descriptive_stats(df)

    log("Construindo dataset...")
    X, y, final_state = build_dataset(df)

    log("Validando modelo (train 80% / test 20%)...")
    holdout = holdout_validation(X, y, n_draws, n_estimators=n_estimators)

    log(f"Validacao walk-forward ({n_folds} folds)...")
    wf = walk_forward(X, y, n_draws, n_folds=n_folds, n_estimators=n_estimators)

    log("Treinando modelo final...")
    clf = make_model(n_estimators)
    clf.fit(X, y)
    probs = clf.predict_proba(final_state)[:, 1]

    numbers = stats['numbers']
    for item in numbers:
        item['prob'] = round(float(probs[item['n'] - 1]), 4)
        item['delay'] = int(final_state[item['n'] - 1, 0])

    log("Gerando combinacoes...")
    combos = generate_model_combinations(probs)

    log("Gerando combinacoes balanceadas...")
    balanced = balanced_samples()

    log(f"Comparando estrategias (ultimos {n_test_strategies} sorteios)...")
    strategies = compare_strategies(df, n_test=n_test_strategies)

    m = holdout['metrics']
    return {
        "meta": {
            "total_draws": n_draws,
            "date_start": date_start,
            "date_end": date_end,
            # horario de Brasilia: o build roda em servidor UTC
            "generated_at": datetime.now(TIMEZONE).strftime("%Y-%m-%d %H:%M"),
        },
        "combinations": [{"numbers": nums, "score": round(s, 4)} for nums, s in combos[:10]],
        "numbers": numbers,
        "even_odd": stats['even_odd'],
        "decades": stats['decades'],
        "sum_stats": stats['sum_stats'],
        "consecutive": stats['consecutive'],
        "validation": {
            "auc_model": round(m['model']['auc'], 4),
            "auc_baseline": round(m['baseline_constant']['auc'], 4),
            "train_draws": holdout['train_draws'],
            "test_draws": holdout['test_draws'],
            "feature_importance": holdout['feature_importance'],
            "holdout": m,
            "walk_forward": wf,
        },
        "balanced_combinations": balanced,
        "strategies": {
            "draws_tested": n_test_strategies,
            "expected": hypergeom_expected(n_test_strategies),
            "results": strategies,
        },
    }
