"""
Historico de acertos das top 10 combinacoes.

Duas partes:
  - retroativo: para cada um dos ultimos sorteios, recria as top 10 que o site teria
    mostrado na vespera (modelo treinado so com sorteios anteriores, retreinado a cada
    bloco) e confere com o resultado. Comparado com 10 jogos aleatorios por sorteio.
  - registro: a cada build, guarda as top 10 do proximo concurso (a primeira previsao
    registrada vale) e confere as previsoes antigas quando o resultado sai. O registro
    e carregado do deploy anterior (o build do Netlify nao guarda arquivos).
"""
import json
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np

from .combinations import generate_model_combinations
from .data import COLS, N_NUMBERS
from .features import build_dataset
from .model import make_model
from .strategies import hypergeom_probs

TOP_N = 10
TIMEZONE = ZoneInfo('America/Sao_Paulo')


def _hits(combo, actual):
    return len(set(combo) & actual)


def _summary(hit_lists):
    """Distribuicao de acertos (0 a 6) de todos os jogos e do melhor jogo de cada sorteio."""
    all_hits = np.array([h for hits in hit_lists for h in hits])
    best = np.array([max(hits) for hits in hit_lists]) if hit_lists else np.array([])
    return {
        "games": int(all_hits.size),
        "draws": len(hit_lists),
        "hits_distribution": {str(k): int((all_hits == k).sum()) for k in range(7)},
        "best_per_draw_distribution": {str(k): int((best == k).sum()) for k in range(7)},
        "mean_hits": round(float(all_hits.mean()), 4) if all_hits.size else None,
        "draws_with_terno_or_better": int((best >= 3).sum()),
    }


def retro_history(df, n_draws=300, retrain_every=50, n_estimators=100, log=print):
    """Recria as top 10 da vespera de cada um dos ultimos n_draws sorteios e confere."""
    X, y, _ = build_dataset(df)
    balls = df[COLS].to_numpy()
    numbers = df['DrawNumber'].to_numpy()
    dates = df['DrawDate'].astype(str).str[:10].to_numpy()
    n = len(df)
    start = n - n_draws
    rows, model_hits, random_hits = [], [], []

    for block_start in range(start, n, retrain_every):
        log(f"  historico: treinando com {block_start} sorteios...")
        clf = make_model(n_estimators)
        clf.fit(X[:block_start * N_NUMBERS], y[:block_start * N_NUMBERS])
        for i in range(block_start, min(block_start + retrain_every, n)):
            probs = clf.predict_proba(X[i * N_NUMBERS:(i + 1) * N_NUMBERS])[:, 1]
            top = [nums for nums, _ in generate_model_combinations(probs)[:TOP_N]]
            actual = {int(b) for b in balls[i]}
            rng = np.random.RandomState(int(numbers[i]))  # aleatorio reprodutivel por concurso
            rand = [sorted(rng.choice(np.arange(1, 61), 6, replace=False).tolist())
                    for _ in range(TOP_N)]
            mh = [_hits(c, actual) for c in top]
            rh = [_hits(c, actual) for c in rand]
            model_hits.append(mh)
            random_hits.append(rh)
            rows.append({"concurso": int(numbers[i]), "date": dates[i],
                         "result": sorted(actual), "best": max(mh), "hits": mh,
                         "random_best": max(rh)})

    probs = hypergeom_probs()
    games = n_draws * TOP_N
    return {
        "generated_at": datetime.now(TIMEZONE).strftime("%Y-%m-%d %H:%M"),
        "draws": n_draws, "top_n": TOP_N, "retrain_every": retrain_every,
        "first": rows[0]["concurso"], "last": rows[-1]["concurso"],
        "model": _summary(model_hits),
        "random": _summary(random_hits),
        "expected": {
            "games": games,
            "hits_distribution": {str(k): round(p * games, 2) for k, p in enumerate(probs)},
            # P(melhor de 10 jogos independentes >= 3 acertos)
            "draws_with_terno_or_better": round(n_draws * (1 - (1 - sum(probs[3:])) ** TOP_N), 2),
            "mean_hits": 0.6,
        },
        "rows": rows,
    }


# ── registro daqui para frente ──────────────────────────────────────
def load_previous_log(site_url, timeout=20, log=print):
    """Baixa o predicoes.json publicado no deploy anterior (ou devolve registro vazio)."""
    if not site_url:
        return {"entries": []}
    url = site_url.rstrip('/') + '/predicoes.json'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
        if isinstance(data.get('entries'), list):
            return data
    except Exception as exc:
        log(f"Aviso: registro anterior de previsoes indisponivel ({exc}). Comecando do zero.")
    return {"entries": []}


def update_log(previous, df, next_combos):
    """
    Acrescenta a previsao do proximo concurso (se ainda nao registrada) e confere as
    previsoes de concursos que ja tem resultado. Devolve o novo registro.
    """
    entries = {int(e['concurso']): e for e in previous.get('entries', [])}
    results = {int(nr): {int(b) for b in row}
               for nr, row in zip(df['DrawNumber'], df[COLS].to_numpy())}
    dates = dict(zip(df['DrawNumber'].astype(int), df['DrawDate'].astype(str).str[:10]))
    next_number = int(df['DrawNumber'].max()) + 1

    if next_number not in entries:
        entries[next_number] = {
            "concurso": next_number,
            "registered_at": datetime.now(TIMEZONE).strftime("%Y-%m-%d %H:%M"),
            "combinations": [list(map(int, c)) for c in next_combos[:TOP_N]],
            "result": None, "hits": None, "best": None,
        }
    for number, e in entries.items():
        if e.get('result') is None and number in results:
            actual = results[number]
            e['result'] = sorted(actual)
            e['date'] = dates.get(number)
            e['hits'] = [_hits(c, actual) for c in e['combinations']]
            e['best'] = max(e['hits'])

    ordered = sorted(entries.values(), key=lambda e: -e['concurso'])
    checked = [e['hits'] for e in ordered if e.get('hits')]
    return {
        "updated_at": datetime.now(TIMEZONE).strftime("%Y-%m-%d %H:%M"),
        "next": next_number,
        "summary": _summary(checked) if checked else None,
        "entries": ordered,
    }


RETRO_FILE = 'mega_historico_retro.json'


def main():
    """Gera o historico retroativo (rodar localmente; o arquivo e versionado)."""
    import warnings
    from pathlib import Path

    from .data import load_draws

    warnings.filterwarnings('ignore')
    data = retro_history(load_draws())
    out = Path(__file__).resolve().parent.parent / RETRO_FILE
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    m, r = data['model'], data['random']
    print(f"{RETRO_FILE}: concursos {data['first']} a {data['last']}")
    ex = data['expected']
    print(f"  media por jogo: modelo {m['mean_hits']} | aleatorio {r['mean_hits']} | teoria 0.6")
    key = 'draws_with_terno_or_better'
    print(f"  sorteios com terno+: modelo {m[key]} | aleatorio {r[key]} | esperado {ex[key]}")


if __name__ == '__main__':
    main()
