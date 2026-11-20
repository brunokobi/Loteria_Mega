// Formato dos JSON gerados pelo pipeline Python da Mega-Sena:
// results.json (megasena/results.py + generate_results.py),
// predicoes.json e mega_historico_retro.json (megasena/history.py).
// Se o Python mudar um campo, ajuste aqui: o typecheck aponta o que quebra no front.

export interface NextDraw {
  number: number;
  date: string;                    // ISO 'YYYY-MM-DD'
  source: 'caixa' | 'estimado';
}

export interface Meta {
  total_draws: number;
  date_start: string;
  date_end: string;
  generated_at: string;            // 'YYYY-MM-DD HH:MM' (Brasília)
  next_draw?: NextDraw | null;
  data_update?: Record<string, unknown> | null;
}

export interface Combination {
  numbers: number[];
  score: number;
}

export interface NumberStat {
  n: number;
  freq: number;
  pct: number;
  prob: number;
  delay?: number | null;
}

export interface Decade {
  label: string;
  count: number;
  pct: number;
}

export interface Metric {
  auc: number;
  log_loss: number;
  brier: number;
}

export type PredictorKey = 'model' | 'baseline_constant' | 'baseline_frequency';

export interface MeanStd {
  mean: number;
  std?: number;
}

export interface WalkForward {
  n_folds?: number;
  folds?: Array<{ train_draws: number; test_draws: number } & Partial<Record<PredictorKey, Metric>>>;
  summary?: Partial<Record<PredictorKey, Record<keyof Metric, MeanStd>>>;
}

export interface Validation {
  auc_model: number;
  auc_baseline: number;
  train_draws: number;
  test_draws: number;
  feature_importance: Array<{ name: string; value: number }>;
  holdout?: Partial<Record<PredictorKey, Metric>>;
  walk_forward?: WalkForward;
}

export interface BalancedCombination {
  numbers: number[];
  sum: number;
  even: number;
  odd: number;
  decades: number;
}

export type PrizeKey = 'tres' | 'quadra' | 'quina' | 'sena';

export type StrategyName = 'Aleatoria' | 'Quentes' | 'Frias' | 'Balanceada';

export interface StrategyResult extends Record<PrizeKey, number> {
  avg_hits: number;
  std_hits?: number;
  ci95?: [number, number];
}

export interface StrategyExpected {
  mean_hits: number;
  std_hits?: number;
  probs: Record<PrizeKey, number>;
  expected_counts: Record<PrizeKey, number>;
}

export interface Strategies {
  draws_tested: number;
  expected?: StrategyExpected;
  results: Record<StrategyName, StrategyResult>;
}

export interface Results {
  meta: Meta;
  combinations: Combination[];
  numbers: NumberStat[];
  even_odd: { even: number; odd: number; even_pct: number; odd_pct: number };
  decades: Decade[];
  sum_stats: { min: number; mean: number; max: number; std: number };
  consecutive: { mean: number; max: number; none_pct: number };
  validation: Validation;
  balanced_combinations: BalancedCombination[];
  strategies: Strategies;
}

// ── predicoes.json ───────────────────────────────────────────────
export interface PredictionEntry {
  concurso: number;
  registered_at: string;
  combinations: number[][];
  result: number[] | null;
  hits: number[] | null;
  best: number | null;
  date?: string | null;
  checked_in_browser?: boolean;   // conferido no navegador, não vem do build
}

/** Entrada já conferida: resultado e acertos preenchidos. */
export type CheckedEntry = PredictionEntry & { result: number[]; hits: number[]; best: number };

export interface PredictionLog {
  updated_at?: string;
  next?: number | null;
  next_draw?: NextDraw | null;
  entries: PredictionEntry[];
}

// ── mega_historico_retro.json ────────────────────────────────────
export interface HitsSummary {
  games: number;
  draws: number;
  hits_distribution: Record<string, number>;
  best_per_draw_distribution: Record<string, number>;
  mean_hits: number;
  draws_with_terno_or_better: number;
}

export interface RetroRow {
  concurso: number;
  date: string;
  result: number[];
  best: number;
  hits: number[];
  random_best: number;
}

export interface RetroHistory {
  generated_at: string;
  draws: number;
  top_n: number;
  retrain_every: number;
  first: number;
  last: number;
  model: HitsSummary;
  random: HitsSummary;
  expected: {
    games: number;
    hits_distribution: Record<string, number>;
    draws_with_terno_or_better: number;
    mean_hits: number;
  };
  rows: RetroRow[];
}
