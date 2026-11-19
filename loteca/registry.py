"""
Registro das previsoes da Loteca e conferencia com os resultados.

  - Para cada concurso aberto (programacao oficial da Caixa), grava as probabilidades e o
    palpite de cada um dos 14 jogos. Atualiza ate o fim do prazo das apostas; depois disso
    a previsao fica congelada e nunca mais muda.
  - Quando os resultados do concurso entram no loteca.csv, confere: acertos, % de acerto,
    log loss e Brier do concurso.

O arquivo loteca_registro.json e versionado. Ele precisa ser atualizado numa maquina que
acesse a API da Caixa (no Brasil): python -m loteca.registry
"""
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np

from .data import OUTCOMES, load_games

TIMEZONE = ZoneInfo('America/Sao_Paulo')
REGISTRY_FILE = Path(__file__).resolve().parent.parent / 'loteca_registro.json'
_EPS = 1e-9


def _now():
    return datetime.now(TIMEZONE)


def deadline_of(rnd):
    """Fim do prazo das apostas (data + hora da Caixa, horario de Brasilia)."""
    try:
        day = datetime.fromisoformat(rnd['bets_until'])
        hour = int(rnd.get('bets_until_hour') or 23)
        return day.replace(hour=hour, tzinfo=TIMEZONE)
    except (KeyError, TypeError, ValueError):
        return None


def load_registry(path=REGISTRY_FILE):
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if isinstance(data.get('rounds'), list):
            return data
    except (OSError, ValueError):
        pass
    return {"rounds": []}


def _prediction(g):
    probs = g.get('odds') or g.get('elo')
    if not probs:
        return None
    return {
        "seq": g['seq'], "home": g['home'], "away": g['away'], "date": g.get('date'),
        "probs": [round(float(p), 4) for p in probs],
        "source": 'odds' if g.get('odds') else 'elo',
        "pick": OUTCOMES[int(np.argmax(probs))],
    }


def record_rounds(registry, open_rounds, now=None):
    """Registra (ou atualiza, se o prazo ainda esta aberto) a previsao de cada concurso."""
    now = now or _now()
    by_number = {r['number']: r for r in registry['rounds']}
    for rnd in open_rounds:
        deadline = deadline_of(rnd)
        if deadline and now >= deadline:
            continue  # prazo encerrado: o que foi registrado antes vale
        entry = by_number.get(rnd['number'])
        if entry and entry.get('result'):
            continue
        games = [p for p in (_prediction(g) for g in rnd['games']) if p]
        if len(games) != len(rnd['games']):
            continue  # so registra concurso com previsao para todos os jogos
        new = {
            "number": rnd['number'], "date": rnd.get('date'),
            "deadline": deadline.strftime('%Y-%m-%d %H:%M') if deadline else None,
            "registered_at": now.strftime('%Y-%m-%d %H:%M'),
            "first_registered_at": (entry or {}).get('first_registered_at')
            or now.strftime('%Y-%m-%d %H:%M'),
            "games": games, "result": None,
        }
        by_number[rnd['number']] = new
    registry['rounds'] = sorted(by_number.values(), key=lambda r: -r['number'])
    return registry


def score_rounds(registry, games_df):
    """Confere os concursos registrados que ja tem resultado no historico (loteca.csv)."""
    results = {}
    for rnd, grp in games_df.groupby('concurso'):
        results[int(rnd)] = {int(j): o for j, o in zip(grp['jogo'], grp['result'])}
    for entry in registry['rounds']:
        if entry.get('result') or entry['number'] not in results:
            continue
        actual = results[entry['number']]
        scored = [g for g in entry['games'] if g['seq'] in actual]
        if not scored:
            continue
        for g in scored:
            g['outcome'] = actual[g['seq']]
            g['hit'] = g['pick'] == g['outcome']
        hits = sum(g['hit'] for g in scored)
        y = np.array([OUTCOMES.index(g['outcome']) for g in scored])
        p = np.array([g['probs'] for g in scored])
        p_true = np.clip(p[np.arange(len(y)), y], _EPS, 1)
        entry['result'] = {
            "games": len(scored), "hits": hits, "pct": round(hits / len(scored), 4),
            "log_loss": round(float(-np.mean(np.log(p_true))), 4),
            "brier": round(float(np.mean(np.sum((p - np.eye(3)[y]) ** 2, axis=1))), 4),
            "hits_odds": sum(g['hit'] for g in scored if g['source'] == 'odds'),
            "games_odds": sum(1 for g in scored if g['source'] == 'odds'),
        }
    return registry


def summarize(registry):
    done = [r for r in registry['rounds'] if r.get('result')]
    if not done:
        return None
    games = sum(r['result']['games'] for r in done)
    hits = sum(r['result']['hits'] for r in done)
    return {
        "rounds": len(done), "games": games, "hits": hits,
        "pct": round(hits / games, 4) if games else None,
        "mean_hits_per_round": round(hits / len(done), 2),
        "best_round": max(r['result']['hits'] for r in done),
    }


def save_registry(registry, path=REGISTRY_FILE):
    registry['summary'] = summarize(registry)
    registry['updated_at'] = _now().strftime('%Y-%m-%d %H:%M')
    Path(path).write_text(json.dumps(registry, ensure_ascii=False, indent=1), encoding='utf-8')


def main():
    """Atualiza o historico, registra os concursos abertos e confere os encerrados."""
    import warnings

    from .results import build_loteca
    from .update import update_csv

    warnings.filterwarnings('ignore')
    update_csv()
    data = build_loteca()
    registry = load_registry()
    record_rounds(registry, data['rounds'])
    score_rounds(registry, load_games())
    save_registry(registry)
    s = registry['summary']
    open_n = [r['number'] for r in registry['rounds'] if not r.get('result')]
    print(f"Registro: {len(registry['rounds'])} concurso(s); abertos/pendentes: {open_n}")
    if s:
        print(f"Conferidos: {s['rounds']} concurso(s), {s['hits']}/{s['games']} acertos "
              f"({s['pct']:.1%}), media {s['mean_hits_per_round']} por concurso.")


if __name__ == '__main__':
    main()
