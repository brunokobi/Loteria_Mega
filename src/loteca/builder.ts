// Montador de aposta: escolhe onde pôr duplos e triplos para maximizar P(acertar todos).

import { probsOf } from './model';
import type { Game } from './types';

export interface Pick {
  picks: number[];   // índices de OUTCOMES cobertos (0 = 1, 1 = X, 2 = 2)
  q: number;         // probabilidade de acerto com esses palpites
}

export interface Optimized {
  choice: Pick[];
  doubles: number;
  triples: number;
}

/**
 * Para cada jogo: simples (resultado mais provável), duplo (2 mais prováveis) ou triplo.
 * Programação dinâmica sobre (duplos usados, triplos usados) maximizando a soma dos log q.
 */
export function optimize(games: Game[], nDoubles: number, nTriples: number): Optimized {
  const opts: Array<[Pick, Pick, Pick]> = games.map(g => {
    const p = probsOf(g);
    const [o0, o1] = [0, 1, 2].sort((a, b) => p[b]! - p[a]!) as [number, number, number];
    return [
      { picks: [o0], q: p[o0]! },
      { picks: [o0, o1], q: p[o0]! + p[o1]! },
      { picks: [0, 1, 2], q: 1 },
    ];
  });
  const n = games.length;
  const D = Math.min(nDoubles, n), T = Math.min(nTriples, n - D);
  const grid = <V>(v: V): V[][] => Array.from({ length: D + 1 }, () => Array<V>(T + 1).fill(v));

  // best[d][t] = melhor log-probabilidade usando exatamente d duplos e t triplos até aqui
  let best = grid(-Infinity);
  best[0]![0] = 0;
  const trace: Array<Array<Array<[number, number, number] | null>>> = [];
  for (const o of opts) {
    const next = grid(-Infinity);
    const from = grid<[number, number, number] | null>(null);
    for (let d = 0; d <= D; d++) for (let t = 0; t <= T; t++) {
      const cur = best[d]![t]!;
      if (cur === -Infinity) continue;
      for (const [k, nd, nt] of [[0, d, t], [1, d + 1, t], [2, d, t + 1]] as const) {
        if (nd > D || nt > T) continue;
        const v = cur + Math.log(Math.max(o[k].q, 1e-12));
        if (v > next[nd]![nt]!) { next[nd]![nt] = v; from[nd]![nt] = [k, d, t]; }
      }
    }
    trace.push(from);
    best = next;
  }

  const choice: Pick[] = Array(n);
  let d = D, t = T;
  for (let i = n - 1; i >= 0; i--) {
    const step = trace[i]![d]![t];
    if (!step) throw new Error('optimize: caminho inválido');
    const [k, pd, pt] = step;
    choice[i] = opts[i]![k as 0 | 1 | 2];
    d = pd; t = pt;
  }
  return { choice, doubles: D, triples: T };
}

/** Distribuição do número de acertos (Poisson-binomial): dist[k] = P(exatamente k acertos). */
export function hitDistribution(probs: number[]): number[] {
  let dist = [1];
  for (const c of probs) {
    const next = Array<number>(dist.length + 1).fill(0);
    dist.forEach((v, k) => { next[k]! += v * (1 - c); next[k + 1]! += v * c; });
    dist = next;
  }
  return dist;
}
