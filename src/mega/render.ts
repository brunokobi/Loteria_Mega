// Renderização da análise da Mega-Sena (results.json).

import { byId, fmtDate, showApp } from '../shared/util';
import type {
  BalancedCombination, Metric, NumberStat, PredictorKey, Results, StrategyName, StrategyResult,
  Strategies, Validation,
} from './types';

type Rgb = [number, number, number];

// ── Cor do heatmap (0 = frio/azul → 1 = quente/vermelho) ────────
const HEAT_STOPS: Array<[number, Rgb]> = [
  [0, [29, 78, 216]],
  [0.35, [34, 211, 160]],
  [0.65, [246, 197, 73]],
  [1, [239, 68, 68]],
];

function heatColor(t: number): Rgb {
  let i = 0;
  while (i < HEAT_STOPS.length - 2 && t > HEAT_STOPS[i + 1]![0]) i++;
  const [t0, c0] = HEAT_STOPS[i]!, [t1, c1] = HEAT_STOPS[i + 1]!;
  const f = (t - t0) / (t1 - t0);
  return c0.map((v, j) => Math.round(v + (c1[j]! - v) * f)) as Rgb;
}

/** Cor do texto com maior contraste (WCAG) sobre um fundo rgb. */
function readableText([r, g, b]: Rgb): string {
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#000' : '#fff';
}

const listPt = (nums: number[]): string =>
  nums.length > 1 ? `${nums.slice(0, -1).join(', ')} e ${nums[nums.length - 1]}` : String(nums[0]);

// ── Página ───────────────────────────────────────────────────────
export function render(d: Results): void {
  const { meta, combinations, numbers, even_odd, decades, sum_stats, consecutive, validation } = d;

  byId('meta-pills').innerHTML = `
    <div class="meta-pill"><strong>${meta.total_draws.toLocaleString('pt-BR')}</strong> sorteios</div>
    <div class="meta-pill"><strong>${fmtDate(meta.date_start)}</strong> a <strong>${fmtDate(meta.date_end)}</strong></div>
    <div class="meta-pill">Gerado em <strong>${fmtDate(meta.generated_at)}</strong></div>
  `;
  byId('gen-date').textContent = fmtDate(meta.generated_at);

  // Resumo
  const years = new Date(meta.date_end).getFullYear() - new Date(meta.date_start).getFullYear();
  const quick: Array<[string | number, string]> = [
    [meta.total_draws.toLocaleString('pt-BR'), 'Sorteios históricos'],
    [`${years}+`, 'Anos de dados'],
    [validation.auc_model.toFixed(4), 'AUC-ROC do modelo'],
    [`${even_odd.even_pct}%`, 'Números pares sorteados'],
    [sum_stats.mean, 'Soma média por sorteio'],
    [`${consecutive.none_pct}%`, 'Sorteios sem consecutivos'],
  ];
  byId('qs-grid').innerHTML = quick.map(([v, l]) => `
    <div class="qs-card" role="listitem">
      <div class="qs-val">${v}</div>
      <div class="qs-lbl">${l}</div>
    </div>
  `).join('');

  // Top 10 combinações
  const maxS = combinations[0]?.score ?? 0;
  const minS = combinations[combinations.length - 1]?.score ?? 0;
  const rng = maxS - minS || 0.001;
  byId('combo-grid').innerHTML = combinations.map((c, i) => {
    const bw = (((c.score - minS) / rng) * 65 + 35).toFixed(1);
    return `
      <li class="combo-card ${i === 0 ? 'rank-1' : ''}">
        <span class="sr-only">Combinação ${i + 1}: ${listPt(c.numbers)}. Score ${c.score.toFixed(4)}.</span>
        <div aria-hidden="true">
          <div class="combo-top">
            <div class="combo-rank">${i + 1}</div>
            <div class="combo-score-txt">Score <span>${c.score.toFixed(4)}</span></div>
          </div>
          <div class="balls">${c.numbers.map(n => `<div class="ball">${n}</div>`).join('')}</div>
          <div class="score-bar"><div class="score-bar-fill" style="width:${bw}%"></div></div>
        </div>
      </li>
    `;
  }).join('');

  renderHeatmap(numbers, meta.total_draws);

  // Par / ímpar
  byId('even-odd').innerHTML = `
    <div class="split-bar" aria-hidden="true">
      <div class="split-even" style="width:${even_odd.even_pct}%"></div>
      <div class="split-odd"></div>
    </div>
    <div class="split-labels">
      <div><span class="label-even">Pares</span> <span class="label-pct">${even_odd.even_pct}%</span></div>
      <div><span class="label-odd">Ímpares</span> <span class="label-pct">${even_odd.odd_pct}%</span></div>
    </div>
    <div class="split-note">
      Esperado por acaso: ~50% / ~50%.<br>
      Distribuição uniforme confirma aleatoriedade.
    </div>
  `;

  // Décadas
  const maxPct = Math.max(...decades.map(x => x.pct));
  byId('decades').innerHTML = decades.map(x => `
    <div class="decade-row">
      <div class="decade-lbl">${x.label}</div>
      <div class="decade-bar-wrap" aria-hidden="true">
        <div class="decade-bar-fill" style="width:${(x.pct / maxPct * 100).toFixed(1)}%"></div>
      </div>
      <div class="decade-pct">${x.pct}%</div>
    </div>
  `).join('');

  // Soma
  byId('sum-stats').innerHTML = `
    <div class="sum-big">${sum_stats.mean}</div>
    <div class="sum-caption">média da soma dos 6 números</div>
    <div class="sum-trio">
      <div class="sum-item">
        <div class="sum-item-val">${sum_stats.min}</div>
        <div class="sum-item-lbl">Mínimo</div>
      </div>
      <div class="sum-item">
        <div class="sum-item-val">±${sum_stats.std}</div>
        <div class="sum-item-lbl">Desvio</div>
      </div>
      <div class="sum-item">
        <div class="sum-item-val">${sum_stats.max}</div>
        <div class="sum-item-lbl">Máximo</div>
      </div>
    </div>
  `;

  // AUC
  const diff = validation.auc_model - validation.auc_baseline;
  byId('auc-card').innerHTML = `
    <h3>AUC-ROC — validação temporal</h3>
    <div class="auc-value">${validation.auc_model.toFixed(4)}</div>
    <div class="auc-sub">
      Treino: ${validation.train_draws.toLocaleString('pt-BR')} sorteios
      &nbsp;·&nbsp;
      Teste: ${validation.test_draws.toLocaleString('pt-BR')} sorteios
    </div>
    <div class="auc-verdict">
      Diferença vs baseline constante: <strong>${diff >= 0 ? '+' : ''}${diff.toFixed(4)}</strong><br><br>
      AUC próximo de 0,5 significa que o modelo <strong>não supera o acaso</strong>.
      Isso é esperado e confirma a integridade estatística da loteria.
    </div>
  `;

  renderValidationExtra(validation);

  // Importância das features
  const maxImp = validation.feature_importance[0]?.value || 1;
  byId('feat-list').innerHTML = validation.feature_importance.map(f => `
    <div class="feat-item">
      <div class="feat-header">
        <span class="feat-name">${f.name}</span>
        <span class="feat-val">${(f.value * 100).toFixed(1)}%</span>
      </div>
      <div class="feat-bar-wrap" aria-hidden="true">
        <div class="feat-bar-fill" style="width:${(f.value / maxImp * 100).toFixed(1)}%"></div>
      </div>
    </div>
  `).join('');

  renderBalanced(d.balanced_combinations);
  renderStrategies(d.strategies);
  showApp();
}

// ── Heatmap de frequência (botões com tabindex móvel e setas) ────
function renderHeatmap(numbers: NumberStat[], totalDraws: number): void {
  const grid = byId('freq-heatmap');
  const detail = byId('freq-detail');
  const freqs = numbers.map(n => n.freq);
  const fMin = Math.min(...freqs), fMax = Math.max(...freqs);
  const describe = (n: NumberStat) =>
    `Número ${n.n}: sorteado ${n.freq} vezes (${n.pct.toLocaleString('pt-BR')}% dos ${totalDraws.toLocaleString('pt-BR')} sorteios)` +
    (n.delay != null ? `, ${n.delay === 0 ? 'saiu no último sorteio' : `há ${n.delay} sorteios sem sair`}` : '');

  grid.innerHTML = numbers.map((n, i) => {
    const rgb = heatColor(fMax > fMin ? (n.freq - fMin) / (fMax - fMin) : 0.5);
    return `
      <button type="button" class="freq-cell" data-i="${i}" tabindex="${i === 0 ? 0 : -1}"
              aria-pressed="false" aria-label="${describe(n)}" title="${describe(n)}"
              style="background:rgb(${rgb});color:${readableText(rgb)}">
        <span class="fc-n" aria-hidden="true">${n.n}</span>
        <span class="fc-f" aria-hidden="true">${n.freq}x</span>
      </button>
    `;
  }).join('');

  const cells = [...grid.querySelectorAll<HTMLButtonElement>('.freq-cell')];
  let current = 0;
  const select = (i: number, focus: boolean) => {
    const prev = cells[current], next = cells[i], n = numbers[i];
    if (!prev || !next || !n) return;
    prev.tabIndex = -1;
    prev.setAttribute('aria-pressed', 'false');
    current = i;
    next.tabIndex = 0;
    next.setAttribute('aria-pressed', 'true');
    if (focus) next.focus();
    detail.innerHTML = describe(n).replace(/^Número (\d+)/, '<strong>Número $1</strong>');
  };
  const columns = () => getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const cellFrom = (e: Event) => (e.target as Element).closest<HTMLElement>('.freq-cell');

  grid.onclick = e => { const c = cellFrom(e); if (c) select(Number(c.dataset.i), false); };
  grid.onmouseover = e => { const c = cellFrom(e); if (c) select(Number(c.dataset.i), false); };
  grid.onkeydown = e => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() };
    const step = steps[e.key];
    let next: number | null = null;
    if (step) next = Math.min(cells.length - 1, Math.max(0, current + step));
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = cells.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
  };
  detail.textContent = 'Selecione um número para ver os detalhes.';
}

// ── Combinações balanceadas ──────────────────────────────────────
function renderBalanced(items: BalancedCombination[]): void {
  byId('balanced-grid').innerHTML = items.map((c, i) => `
    <li class="combo-card ${i === 0 ? 'rank-1' : ''}">
      <span class="sr-only">Combinação balanceada ${i + 1}: ${listPt(c.numbers)}. Soma ${c.sum},
        ${c.even} pares e ${c.odd} ímpares, ${c.decades} décadas.</span>
      <div aria-hidden="true">
        <div class="combo-top">
          <div class="combo-rank">${i + 1}</div>
          <div class="combo-score-txt">Soma <span>${c.sum}</span></div>
        </div>
        <div class="balls">
          ${c.numbers.map(n => `<div class="ball ball-balanced">${n}</div>`).join('')}
        </div>
        <div class="combo-badges">
          <span class="badge badge-sum">Soma ${c.sum}</span>
          <span class="badge badge-even">${c.even}P / ${c.odd}I</span>
          <span class="badge badge-decade">${c.decades} décadas</span>
        </div>
      </div>
    </li>
  `).join('');
}

// ── Holdout / walk-forward ───────────────────────────────────────
const PREDICTORS: Array<[PredictorKey, string, string]> = [
  ['model', 'Modelo', 'model'],
  ['baseline_constant', 'Baseline constante (p=0.1)', ''],
  ['baseline_frequency', 'Baseline frequência', ''],
];
const METRIC_HEAD = '<thead><tr><th scope="col">Preditor</th><th scope="col">AUC</th><th scope="col">Log loss</th><th scope="col">Brier</th></tr></thead>';
const METRICS: Array<keyof Metric> = ['auc', 'log_loss', 'brier'];

function renderValidationExtra(validation: Validation): void {
  const box = byId('val-extra');
  const hold = validation.holdout;
  const wf = validation.walk_forward;
  const f4 = (v: unknown) => (typeof v === 'number' ? v.toFixed(4) : '—');
  let html = '';

  if (hold) {
    const rows = PREDICTORS.map(([k, label, cls]) => {
      const m = hold[k];
      return m ? `
      <tr class="${cls}">
        <th scope="row">${label}</th>
        ${METRICS.map(x => `<td>${f4(m[x])}</td>`).join('')}
      </tr>` : '';
    }).join('');
    html += `
      <h3>Holdout 80/20 — Modelo vs Baselines</h3>
      <table class="metric-table">${METRIC_HEAD}<tbody>${rows}</tbody></table>
      <div class="val-note">Menor log loss e Brier = melhor. AUC 0,5 = sem poder preditivo.</div>`;
  }

  const sum = wf?.summary;
  if (wf && sum) {
    const ms = (o: { mean: number; std?: number } | undefined) => (o && typeof o.mean === 'number')
      ? `${o.mean.toFixed(4)}<span class="pm">± ${(o.std ?? 0).toFixed(4)}</span>` : '—';
    const rows = PREDICTORS.map(([k, label, cls]) => {
      const m = sum[k];
      return m ? `
      <tr class="${cls}">
        <th scope="row">${label}</th>
        ${METRICS.map(x => `<td>${ms(m[x])}</td>`).join('')}
      </tr>` : '';
    }).join('');
    html += `
      <h3>Walk-forward — média ± desvio (${wf.n_folds ?? wf.folds?.length ?? '?'} folds)</h3>
      <table class="metric-table">${METRIC_HEAD}<tbody>${rows}</tbody></table>
      <div class="val-note">Janela expansiva: cada fold treina com o passado e testa no bloco seguinte.</div>`;
  }

  box.innerHTML = html;
  box.style.display = html ? '' : 'none';
}

// ── Comparação de estratégias ────────────────────────────────────
const STRAT_COLORS: Record<StrategyName, string> = {
  Aleatoria: 'var(--sub)', Quentes: 'var(--red)', Frias: 'var(--blue)', Balanceada: 'var(--green)',
};
const stratLabel = (name: string) => (name === 'Aleatoria' ? 'Aleatória' : name);

function renderStrategies(strat: Strategies): void {
  const expected = strat.expected;
  const descs: Record<StrategyName, string> = {
    Aleatoria: '6 números escolhidos ao acaso',
    Quentes: expected ? 'Os 6 mais frequentes até o sorteio anterior' : 'Os 6 números mais frequentes',
    Frias: expected ? 'Os 6 menos frequentes até o sorteio anterior' : 'Os 6 números menos frequentes',
    Balanceada: 'Critérios: soma, paridade, décadas',
  };
  const entries = Object.entries(strat.results) as Array<[StrategyName, StrategyResult]>;
  const results = entries.map(([, r]) => r);
  const maxAvg = Math.max(...results.map(r => r.avg_hits));
  const theoreticalNum = expected?.mean_hits ?? (6 * 6 / 60);
  const theoretical = theoreticalNum.toFixed(3);
  const ciOf = (r: StrategyResult) => (Array.isArray(r.ci95) && r.ci95.length === 2 ? r.ci95 : null);
  const hasCi = results.every(r => ciOf(r));
  const inside = (r: StrategyResult) => { const c = ciOf(r); return !!c && c[0] <= theoreticalNum && theoreticalNum <= c[1]; };
  const allInside = hasCi && results.every(inside);
  const outside = hasCi ? entries.filter(([, r]) => !inside(r)).map(([n]) => n) : [];
  const above = hasCi ? entries.filter(([, r]) => (ciOf(r)?.[0] ?? 0) > theoreticalNum).map(([n]) => n) : [];
  const below = outside.filter(n => !above.includes(n));

  const ec = expected?.expected_counts;
  const expRow = expected && ec ? `
        <div class="strat-row strat-expected">
          <div>
            <div class="strat-name" style="color:var(--gold)">Esperado</div>
            <div class="strat-desc">Teoria (hipergeométrica) em ${strat.draws_tested} sorteios</div>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="strat-bar-wrap" style="flex:1" aria-hidden="true">
                <div class="strat-bar-fill" style="width:${(theoreticalNum / maxAvg * 100).toFixed(1)}%;background:var(--gold)"></div>
              </div>
              <span style="font-size:13px;font-variant-numeric:tabular-nums;color:var(--sub);width:36px">${theoretical}</span>
            </div>
            ${expected.std_hits != null ? `<div class="strat-ci">desvio por sorteio ${Number(expected.std_hits).toFixed(3)}</div>` : ''}
          </div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--sub)">${Number(ec.tres).toFixed(1)}</div><div class="strat-stat-lbl"><abbr title="3 acertos">3 ac.</abbr></div></div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--gold)">${Number(ec.quadra).toFixed(2)}</div><div class="strat-stat-lbl">Quadra</div></div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--green)">${Number(ec.quina).toFixed(3)}</div><div class="strat-stat-lbl">Quina</div></div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--red)">${Number(ec.sena) < 0.001 ? '≈0' : Number(ec.sena).toFixed(4)}</div><div class="strat-stat-lbl">Sena</div></div>
        </div>` : '';

  const verdict = !hasCi
    ? 'Nenhuma estratégia superou as outras de forma significativa.'
    : allInside
      ? `O valor esperado (${theoretical}) está dentro do intervalo de confiança de 95% de todas as estratégias:
      <strong>as diferenças observadas são indistinguíveis do acaso</strong>.`
      : [
          above.length
            ? `<strong>${above.map(stratLabel).join(', ')}</strong> ficou acima do esperado (${theoretical}) pelo IC95%.`
            : `<strong>Nenhuma estratégia acertou significativamente mais que o acaso</strong> (esperado: ${theoretical}).`,
          below.length ? `${below.map(stratLabel).join(', ')} ficou abaixo do esperado.` : '',
          `Com ${entries.length} estratégias testadas, um desvio isolado como esse é comum por puro acaso.`,
        ].filter(Boolean).join(' ');

  byId('strat-content').innerHTML = `
    <div class="strat-header" aria-hidden="true">
      <div>Estratégia</div>
      <div>Média de acertos / sorteio</div>
      <div style="text-align:center">3 ac.</div>
      <div style="text-align:center">Quadra</div>
      <div style="text-align:center">Quina</div>
      <div style="text-align:center">Sena</div>
    </div>
    <div class="strat-grid">
      ${entries.map(([name, r]) => {
        const ci = ciOf(r);
        return `
        <div class="strat-row">
          <div>
            <div class="strat-name" style="color:${STRAT_COLORS[name]}">${stratLabel(name)}</div>
            <div class="strat-desc">${descs[name]}</div>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="strat-bar-wrap" style="flex:1" aria-hidden="true">
                <div class="strat-bar-fill" style="width:${(r.avg_hits / maxAvg * 100).toFixed(1)}%;background:${STRAT_COLORS[name]}"></div>
              </div>
              <span style="font-size:13px;font-variant-numeric:tabular-nums;color:var(--sub);width:36px">${r.avg_hits}</span>
            </div>
            ${ci ? `<div class="strat-ci">IC95% [${ci[0].toFixed(3)} ; ${ci[1].toFixed(3)}]${r.std_hits != null ? ` · desvio ${Number(r.std_hits).toFixed(3)}` : ''}</div>` : ''}
          </div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--sub)">${r.tres}</div><div class="strat-stat-lbl"><abbr title="3 acertos">3 ac.</abbr></div></div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--gold)">${r.quadra}</div><div class="strat-stat-lbl">Quadra</div></div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--green)">${r.quina}</div><div class="strat-stat-lbl">Quina</div></div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--red)">${r.sena}</div><div class="strat-stat-lbl">Sena</div></div>
        </div>
      `;
      }).join('')}${expRow}
    </div>
    <div class="insight-box">
      <strong>Conclusão:</strong> Em ${strat.draws_tested} sorteios reais, as estratégias acertaram em média
      entre <strong>${Math.min(...results.map(r => r.avg_hits)).toFixed(3)}</strong> e
      <strong>${maxAvg.toFixed(3)}</strong> números por sorteio — em torno dos ${theoretical} previstos pela teoria da probabilidade (6×6/60).
      <br><br>
      ${verdict}
      <strong>É exatamente o que se espera de um processo aleatório</strong> —
      não existe sistema, método ou IA capaz de aumentar suas chances reais de ganhar.
    </div>
  `;
}
