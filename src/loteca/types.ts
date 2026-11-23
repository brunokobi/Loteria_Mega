// Formato do loteca.json (loteca/results.py) e do loteca_registro.json (loteca/registry.py).

export type Outcome = '1' | 'X' | '2';

/** Probabilidades de [mandante, empate, visitante]. */
export type Probs = [number, number, number];

export interface Game {
  seq: number;
  date: string | null;
  weekday?: string;
  home: string;
  home_uf: string;
  away: string;
  away_uf: string;
  home_key: string | null;
  away_key: string | null;
  elo: Probs | null;
  odds: Probs | null;
  odds_tournament?: string | null;
  kickoff?: string | null;
}

export interface Round {
  number: number;
  date: string | null;
  weekday?: string;
  bets_until: string | null;
  bets_until_hour?: string;
  estimated_prize?: number;
  games: Game[];
}

/** Jogo com odds da OddsPapi nos próximos dias. */
export interface UpcomingFixture {
  start: string;
  tournament: string;
  home: string;
  away: string;
  odds: Probs;
  home_key: string | null;
  away_key: string | null;
  elo?: Probs;
}

export interface Team {
  key: string;
  name: string;
  uf: string;
  rating: number;
  games: number;
}

export interface OutcomeModel {
  outcomes: Outcome[];
  k: number;
  home_adv: number;
  new_team_games: number;
  coef: number[][];      // 3 × 3: [diferença de Elo, time novo, interação]
  intercept: number[];
}

export interface PredictorReport {
  accuracy: number;
  hits_per_round_mean: number;
  hits_per_round_std: number;
  hits_max: number;
  rounds_10_plus: number;
  log_loss?: number;
  brier?: number;
}

export interface Backtest {
  rounds: { total: number; warmup_end: number; test_start: number; test_rounds: number };
  games_test: number;
  params: { k: number; home_adv: number; val_log_loss?: number };
  predictors: Record<'elo' | 'sempre_mandante' | 'aleatorio', PredictorReport> &
    Record<string, PredictorReport>;
  calibration: Array<{ range: string; games: number; predicted: number; observed: number }>;
}

export interface OddsMetric {
  accuracy: number;
  log_loss: number;
  brier: number;
}

export interface OddsComparison {
  test_games_with_odds: number;
  test_games: number;
  hits_per_round_elo_ou_odds: number;
  on_games_with_odds: Record<'odds' | 'elo' | 'elo_mais_odds', OddsMetric>;
}

export interface Pricing {
  price_per_combination: number;
  min_combinations: number;
  max_doubles: number;
  max_triples: number;
}

export interface LotecaData {
  meta: {
    generated_at: string;
    rounds: number;
    games: number;
    last_round_date: string;
    next_round: { number: number; date: string | null } | null;
  };
  model: OutcomeModel;
  backtest: Backtest;
  odds_comparison: OddsComparison;
  rounds: Round[];
  upcoming: UpcomingFixture[];
  team_lookup?: { by_key: Record<string, string>; by_name: Record<string, string> };
  teams: Team[];
  pricing: Pricing;
}

// ── loteca_registro.json ─────────────────────────────────────────
export interface RegistryGame {
  seq: number;
  home: string;
  away: string;
  date: string | null;
  probs: Probs;
  source: 'odds' | 'elo';
  pick: Outcome;
  outcome?: Outcome;
  hit?: boolean;
  goals?: [number, number];        // placar (mandante, visitante), depois dos jogos
}

export interface RegistryResult {
  games: number;
  hits: number;
  pct: number;
  hits_odds: number;
  games_odds: number;
  log_loss?: number;
  brier?: number;
}

export interface RegistryRound {
  number: number;
  date: string | null;
  deadline?: string | null;
  registered_at: string;
  first_registered_at: string;
  games: RegistryGame[];
  result: RegistryResult | null;
  checked_in_browser?: boolean;   // conferido no navegador, não vem do build
}

export interface Registry {
  rounds: RegistryRound[];
}
