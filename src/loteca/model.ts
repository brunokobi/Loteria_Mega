// Elo, times e programação da Caixa no navegador. Usado quando o concurso publicado
// pela Caixa é diferente do que estava no loteca.json do build.

import type { CaixaLotecaGame, CaixaLotecaProgramacao } from '../shared/caixa';
import { brDateToIso } from '../shared/util';
import type { Game, LotecaData, Probs, Round, Team } from './types';

export const UNIFORM: Probs = [1 / 3, 1 / 3, 1 / 3];

/** Probabilidades usadas: odds quando houver, senão Elo, senão 1/3 cada. */
export const probsOf = (g: Pick<Game, 'odds' | 'elo'>): Probs => g.odds ?? g.elo ?? UNIFORM;

export const sourceOf = (g: Pick<Game, 'odds' | 'elo'>): string =>
  g.odds ? 'Odds Pinnacle' : g.elo ? 'Elo' : 'Sem dados (1/3 cada)';

// Mesmas regras de loteca/live.py (normalize_name)
const NAME_ALIASES: Record<string, string> = {
  'S PAULO': 'SAO PAULO', 'S CAETANO': 'SAO CAETANO', 'BRASIL DE PELOTAS': 'BRASIL PELOTAS',
};

export function normalizeName(s: string | null | undefined): string {
  const n = String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return NAME_ALIASES[n] ?? n;
}

export class LotecaModel {
  private readonly teams: Map<string, Team>;

  constructor(private readonly data: LotecaData) {
    this.teams = new Map(data.teams.map(t => [t.key, t]));
  }

  resolveTeam(name: string, uf: string): string | null {
    const lk = this.data.team_lookup ?? { by_key: {}, by_name: {} };
    return uf
      ? lk.by_key[`${normalizeName(name)}/${normalizeName(uf)}`] ?? null
      : lk.by_name[normalizeName(name)] ?? null;
  }

  /** Regressão logística multinomial sobre [diferença de Elo, time novo, interação]. */
  eloProbs(hKey: string | null, aKey: string | null): Probs | null {
    const model = this.data.model;
    const h = hKey ? this.teams.get(hKey) : undefined;
    const a = aKey ? this.teams.get(aKey) : undefined;
    if (!h || !a) return null;
    const d = (h.rating + model.home_adv - a.rating) / 400;
    const isNew = Math.min(h.games, a.games) < model.new_team_games ? 1 : 0;
    const x = [d, isNew, d * isNew];
    const z = model.coef.map((c, i) => c.reduce((s, w, j) => s + w * (x[j] ?? 0), model.intercept[i] ?? 0));
    const m = Math.max(...z);
    const e = z.map(v => Math.exp(v - m));
    const sum = e.reduce((acc, v) => acc + v, 0);
    return e.map(v => v / sum) as Probs;
  }

  /** Odds da OddsPapi para o jogo (mesmos times, até 2 dias de diferença). */
  private oddsFor(game: Game): Pick<Game, 'odds' | 'odds_tournament' | 'kickoff'> {
    if (!game.home_key || !game.away_key || !game.date) return { odds: null };
    const d0 = Date.parse(`${game.date}T12:00:00Z`);
    const f = this.data.upcoming.find(x => x.home_key === game.home_key && x.away_key === game.away_key
      && Math.abs(Date.parse(x.start) - d0) <= 2 * 86400000);
    return f ? { odds: f.odds, odds_tournament: f.tournament, kickoff: f.start } : { odds: null };
  }

  private gameFromCaixa(g: CaixaLotecaGame): Game {
    const game: Game = {
      seq: g.nuSequencial, date: brDateToIso(g.dtJogo), weekday: g.diaSemana,
      home: (g.nomeEquipeUm ?? '').trim(), home_uf: (g.siglaUFUm || g.siglaPaisUm || '').trim(),
      away: (g.nomeEquipeDois ?? '').trim(), away_uf: (g.siglaUFDois || g.siglaPaisDois || '').trim(),
      home_key: null, away_key: null, elo: null, odds: null,
    };
    game.home_key = this.resolveTeam(game.home, game.home_uf);
    game.away_key = this.resolveTeam(game.away, game.away_uf);
    game.elo = this.eloProbs(game.home_key, game.away_key);
    return Object.assign(game, this.oddsFor(game));
  }

  /** Converte a programação da Caixa no mesmo formato de `rounds` do loteca.json. */
  roundsFromCaixa(list: CaixaLotecaProgramacao[]): Round[] {
    return list.map(c => {
      // a lista de jogos vem num campo cujo nome varia: pega o primeiro array
      const raw = (Object.values(c).find(Array.isArray) ?? []) as CaixaLotecaGame[];
      const games = [...raw].sort((a, b) => a.nuSequencial - b.nuSequencial);
      return {
        number: c.nuConcurso, date: brDateToIso(c.dataProximoConcurso), weekday: c.diaSemana,
        bets_until: brDateToIso(c.dataFimApostas), bets_until_hour: c.horarioFimApostas,
        estimated_prize: c.valorEstimadoProximoConcurso,
        games: games.map(g => this.gameFromCaixa(g)),
      };
    }).sort((a, b) => a.number - b.number);
  }
}
