"""
MEGA-SENA IA - analise completa no terminal.
Usa o mesmo nucleo (pacote megasena) que gera o results.json da interface web.
"""
import warnings

from megasena.data import load_draws
from megasena.results import build_results
from megasena.stats import DECADE_RANGES

LINE = "=" * 60
LABELS = {
    'model': 'Modelo GradientBoosting',
    'baseline_constant': 'Baseline constante (6/60)',
    'baseline_frequency': 'Baseline frequencia historica',
}


def section(title):
    print("\n" + LINE)
    print(title)
    print(LINE)


def print_descriptive(r):
    section("ANALISE ESTATISTICA DESCRITIVA")
    by_freq = sorted(r['numbers'], key=lambda x: -x['freq'])

    def show(items):
        for it in items:
            bar = '#' * int(it['pct'] * 2)
            print(f"  {it['n']:>3} | {bar:<20} {it['freq']}x ({it['pct']}%)")

    print("\nTop 10 Numeros Mais Frequentes:")
    show(by_freq[:10])
    print("\nTop 10 Numeros Menos Frequentes:")
    show(by_freq[-10:])

    eo = r['even_odd']
    print("\nPar/Impar:")
    print(f"  Pares:   {eo['even']:6d} ({eo['even_pct']:.1f}%)")
    print(f"  Impares: {eo['odd']:6d} ({eo['odd_pct']:.1f}%)")
    print("  Esperado aleatorio: ~50% / ~50%")

    print("\nDistribuicao por Decadas:")
    expected = (eo['even'] + eo['odd']) / len(DECADE_RANGES)
    for d in r['decades']:
        diff = d['count'] - expected
        print(f"  {d['label']}: {d['count']:5d} ({d['pct']:.1f}%)  "
              f"desvio do esperado: {'+' if diff >= 0 else ''}{diff:.0f}")

    s = r['sum_stats']
    print("\nSoma dos 6 numeros por sorteio:")
    print(f"  Min={s['min']}  Media={s['mean']}  Max={s['max']}  Desvio={s['std']}")

    c = r['consecutive']
    print("\nPares consecutivos por sorteio:")
    print(f"  Media={c['mean']:.2f}  Max={c['max']}")
    print(f"  Sorteios sem nenhum consecutivo: {c['none_pct']:.1f}%")


def print_metrics_table(rows):
    print(f"  {'Preditor':<30} {'AUC':>16} {'Log loss':>16} {'Brier':>16}")
    for name, cells in rows:
        print(f"  {LABELS[name]:<30} " + " ".join(f"{c:>16}" for c in cells))


def print_validation(r):
    v = r['validation']
    section(f"VALIDACAO TEMPORAL (Treino {v['train_draws']} / Teste {v['test_draws']} sorteios)")
    print_metrics_table(
        (name, [f"{m['auc']:.4f}", f"{m['log_loss']:.4f}", f"{m['brier']:.4f}"])
        for name, m in v['holdout'].items()
    )

    wf = v['walk_forward']
    print(f"\nWalk-forward ({wf['n_folds']} folds, janela expansiva) - media +- desvio:")
    print_metrics_table(
        (name, [f"{s[k]['mean']:.4f}+-{s[k]['std']:.4f}" for k in ('auc', 'log_loss', 'brier')])
        for name, s in wf['summary'].items()
    )

    diff = v['holdout']['model']['log_loss'] - v['holdout']['baseline_frequency']['log_loss']
    if diff < 0:
        print("\n  Modelo com log loss levemente menor que o baseline de frequencia.")
    else:
        print("\n  CONCLUSAO: o modelo NAO supera nem o baseline de frequencia (log loss maior).")
        print("  AUC proximo de 0.5 e esperado para processos verdadeiramente aleatorios.")

    print("\nImportancia das Features (modelo de validacao):")
    for f in v['feature_importance']:
        print(f"  {f['name']:<15} {'#' * int(f['value'] * 100):<30} {f['value']:.4f}")


def print_strategies(r):
    st = r['strategies']
    exp = st['expected']
    section(f"ESTRATEGIAS NOS ULTIMOS {st['draws_tested']} SORTEIOS")
    print(f"  {'Estrategia':<12} {'Media':>6} {'IC 95%':>16} {'3 ac.':>6} {'Quadra':>7}")
    for name, s in st['results'].items():
        ci = f"[{s['ci95'][0]:.3f}; {s['ci95'][1]:.3f}]"
        print(f"  {name:<12} {s['avg_hits']:>6.3f} {ci:>16} {s['tres']:>6} {s['quadra']:>7}")
    ec = exp['expected_counts']
    print(f"  {'Esperado':<12} {exp['mean_hits']:>6.3f} {'(teoria)':>16} "
          f"{ec['tres']:>6.1f} {ec['quadra']:>7.2f}")
    mean = exp['mean_hits']
    inside = [n for n, s in st['results'].items() if s['ci95'][0] <= mean <= s['ci95'][1]]
    total = len(st['results'])
    print(f"\n  Esperado ({mean}) dentro do IC95% de {len(inside)}/{total} estrategias.")


def print_model_output(r):
    section("TREINAMENTO FINAL COM HISTORICO COMPLETO")
    print("Top 10 numeros por probabilidade estimada:")
    for it in sorted(r['numbers'], key=lambda x: -x['prob'])[:10]:
        print(f"  Numero {it['n']:>3}: {it['prob']:.4f}")

    print("\n" + LINE)
    print("TOP 10 COMBINACOES GERADAS")
    print("-" * 60)
    for i, c in enumerate(r['combinations'], 1):
        print(f"#{i:<4} | {str(c['numbers']):<34} | score: {c['score']:.4f}")
    print(LINE)


def main():
    warnings.filterwarnings('ignore')
    df = load_draws()
    r = build_results(df, log=lambda msg: print(f"... {msg}"))
    m = r['meta']
    print(f"\nDataset: {m['total_draws']} sorteios ({m['date_start']} -> {m['date_end']})")

    print_descriptive(r)
    print_validation(r)
    print_strategies(r)
    print_model_output(r)

    print("\nLEMBRETE: Este e um projeto educacional.")
    print("AUC ~ 0.5 confirma: loterias sao aleatorias por design.")
    print("Nenhum modelo pode prever resultados futuros com confiabilidade.\n")


if __name__ == '__main__':
    main()
