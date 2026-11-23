// Próximo sorteio e histórico de acertos das previsões (predicoes.json + mega_historico_retro.json).

import { fetchMega } from '../shared/caixa';
import { brDateToIso, byId, esc, fmtDate, getJson, weekdayOf } from '../shared/util';
import type { CheckedEntry, HitsSummary, NextDraw, PredictionEntry, PredictionLog, RetroHistory } from './types';

// ── Próximo sorteio ──────────────────────────────────────────────
export function renderNextDraw(nd: NextDraw | null | undefined): void {
  const box = byId('next-draw');
  if (!nd?.date) { box.innerHTML = ''; return; }
  const estimated = nd.source === 'estimado';
  box.innerHTML = `
    <span class="next-draw-label">Próximo sorteio</span>
    <strong>Concurso ${esc(nd.number)} · ${esc(weekdayOf(nd.date))}, ${esc(fmtDate(nd.date))}</strong>
    ${estimated ? '<span class="next-draw-note">data estimada pelo calendário (ter/qui/sáb); confirme na Caixa</span>'
                : '<span class="next-draw-note">data informada pela Caixa</span>'}`;
  const pills = byId('meta-pills');
  pills.querySelector('.pill-next')?.remove();
  pills.insertAdjacentHTML('afterbegin',
    `<div class="meta-pill pill-next">Próximo sorteio <strong>${esc(fmtDate(nd.date))}</strong>${estimated ? ' (estimado)' : ''}</div>`);
}

/** Consulta a Caixa direto no navegador: a data fica certa mesmo se o build não tiver acessado a Caixa. */
export async function refreshNextDrawFromCaixa(): Promise<void> {
  const d = await fetchMega();
  const date = brDateToIso(d?.dataProximoConcurso);
  if (!d?.numeroConcursoProximo || !date) return;  // mantém a data do build
  renderNextDraw({ number: d.numeroConcursoProximo, date, source: 'caixa' });
}

// ── Histórico de acertos ─────────────────────────────────────────
const HIT_LABEL: Record<number, string> = { 3: 'terno', 4: 'quadra', 5: 'quina', 6: 'sena' };

const ballsHtml = (nums: number[], hitSet?: Set<number>) => nums.map(n =>
  `<span class="mini-ball${hitSet?.has(n) ? ' is-hit' : ''}">${n}</span>`).join('');

const isChecked = (e: PredictionEntry): e is CheckedEntry =>
  e.hits != null && e.result != null && e.best != null;

const openDraws = new Set<number>();   // concursos com os detalhes abertos
let current: { log: PredictionLog | null; retro: RetroHistory | null } = { log: null, retro: null };

export async function loadHistory(): Promise<void> {
  const [log, retro] = await Promise.all([
    getJson<PredictionLog>('./predicoes.json'),
    getJson<RetroHistory>('./mega_historico_retro.json'),
  ]);
  byId('hist-content').addEventListener('click', e => {
    const row = (e.target as Element).closest<HTMLElement>('tr.reg-row');
    if (!row) return;
    const n = Number(row.dataset.n);
    if (openDraws.has(n)) openDraws.delete(n); else openDraws.add(n);
    renderHistory(current.log, current.retro);
    document.querySelector<HTMLElement>(`#hist-content tr.reg-row[data-n="${n}"] .reg-toggle`)?.focus();
  });
  renderHistory(log, retro);
  void checkPendingInBrowser(log, retro);
}

/** As 10 combinações registradas para um concurso, com os números sorteados destacados. */
function drawDetail(e: PredictionEntry): string {
  const res = isChecked(e) ? new Set(e.result) : undefined;
  const stamp = (s: string | null | undefined) => (s ? esc(fmtDate(s)) : '—');  // fmtDate já inclui a hora
  const facts = [
    `<div><span>Concurso</span><strong>${esc(e.concurso)}</strong></div>`,
    `<div><span>Previsão registrada</span><strong>${stamp(e.registered_at)}</strong></div>`,
    isChecked(e) ? `<div><span>Sorteio</span><strong>${esc(weekdayOf(e.date))}, ${esc(fmtDate(e.date))}</strong></div>` : '<div><span>Situação</span><strong>aguardando o sorteio</strong></div>',
    isChecked(e) ? `<div><span>Números sorteados</span><div class="mini-balls">${ballsHtml(e.result)}</div></div>` : '',
    isChecked(e) ? `<div><span>Acertos (10 jogos)</span><strong>${e.hits.reduce((a, h) => a + h, 0)} números · melhor jogo ${e.best}</strong></div>` : '',
  ].join('');
  const rows = e.combinations.map((c, i) => {
    const h = isChecked(e) ? e.hits[i]! : null;
    const label = h != null && HIT_LABEL[h] ? ` · ${HIT_LABEL[h]}` : '';
    return `<tr><td class="reg-seq">${i + 1}</td>
      <td><div class="mini-balls">${ballsHtml(c, res)}</div></td>
      <td>${h == null ? '<small>aguardando</small>' : `<strong>${h}</strong> acerto${h === 1 ? '' : 's'}${label}`}</td></tr>`;
  }).join('');
  return `
    <div class="reg-detail-box">
      <div class="reg-facts">${facts}</div>
      <table class="metric-table reg-games">
        <caption class="sr-only">As 10 combinações registradas para o concurso ${esc(e.concurso)} e os acertos</caption>
        <thead><tr><th scope="col">#</th><th scope="col">Combinação</th><th scope="col">Acertos</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${res ? '<p class="val-note">Em dourado, os números que saíram no sorteio.</p>' : ''}
    </div>`;
}

/** Confere a previsão pendente assim que a Caixa publica o resultado (o build pode demorar a ver). */
async function checkPendingInBrowser(log: PredictionLog | null, retro: RetroHistory | null): Promise<void> {
  const pending = log?.entries.find(e => !isChecked(e));
  if (!log || !pending) return;
  const d = await fetchMega(pending.concurso);
  if (!d) return;  // resultado ainda não saiu
  const result = (d.listaDezenas ?? []).map(Number).sort((a, b) => a - b);
  if (Number(d.numero) !== Number(pending.concurso) || result.length !== 6) return;
  const set = new Set(result);
  pending.result = result;
  pending.date = (d.dataApuracao ?? '').split('/').reverse().join('-');
  pending.hits = pending.combinations.map(c => c.filter(n => set.has(n)).length);
  pending.best = Math.max(...pending.hits);
  pending.checked_in_browser = true;
  renderHistory(log, retro);
}

function renderHistory(log: PredictionLog | null, retro: RetroHistory | null): void {
  current = { log, retro };
  const entries = (log?.entries ?? []).slice(0, 30);
  let html = '<div class="val-extra"><h3>Registro das previsões</h3>';

  if (entries.length) {
    html += `
      <table class="metric-table hist-table reg-table">
        <caption class="sr-only">Previsões registradas e acertos. Abra um concurso para ver as 10 combinações.</caption>
        <thead><tr><th scope="col">Concurso</th><th scope="col">Sorteados</th><th scope="col">Melhor jogo</th><th scope="col">Jogos com 3+</th></tr></thead>
        <tbody>${entries.map(e => {
          const open = openDraws.has(e.concurso);
          const toggle = `<button type="button" class="reg-toggle" aria-expanded="${open}" aria-controls="draw-det-${e.concurso}">
                <span class="reg-caret" aria-hidden="true">▸</span> ${esc(e.concurso)}<span class="sr-only">: ver as 10 combinações</span></button>`;
          let cells: string;
          if (isChecked(e)) {
            const res = new Set(e.result);
            const bestGame = e.combinations[e.hits.indexOf(e.best)] ?? [];
            const label = HIT_LABEL[e.best];
            cells = `
            <th scope="row">${toggle}<br><small>${esc(fmtDate(e.date))}${e.checked_in_browser ? ' · conferido agora' : ''}</small></th>
            <td><div class="mini-balls">${ballsHtml(e.result)}</div></td>
            <td><div class="mini-balls">${ballsHtml(bestGame, res)}</div><small>${e.best} acerto${e.best === 1 ? '' : 's'}${label ? ` · ${label}` : ''}</small></td>
            <td>${e.hits.filter(h => h >= 3).length}</td>`;
          } else {
            cells = `
            <th scope="row">${toggle}<br><small>registrada em ${esc(fmtDate(e.registered_at))}</small></th>
            <td colspan="3"><small>aguardando o sorteio; será conferida quando o resultado sair</small></td>`;
          }
          return `<tr class="reg-row${open ? ' is-open' : ''}" data-n="${e.concurso}">${cells}</tr>
          <tr class="reg-detail" id="draw-det-${e.concurso}"${open ? '' : ' hidden'}><td colspan="4">${open ? drawDetail(e) : ''}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <p class="val-note">Clique num concurso para ver as 10 combinações registradas e os acertos de cada uma.</p>`;
  } else {
    html += '<p class="val-note">O registro começa no próximo build.</p>';
  }
  html += '</div>';

  if (retro) html += renderRetro(retro);
  byId('hist-content').innerHTML = html;
}

/** Teste retroativo: top 10 dos últimos concursos contra 10 jogos ao acaso e a teoria. */
function renderRetro(retro: RetroHistory): string {
  const m = retro.model, r = retro.random, ex = retro.expected;
  const dist = (s: HitsSummary, k: number) => (s.hits_distribution[String(k)] ?? 0).toLocaleString('pt-BR');
  const exDist = (k: number) => Number(ex.hits_distribution[String(k)]).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const comma2 = (v: number) => v.toFixed(2).replace('.', ',');
  return `
      <div class="val-extra">
        <h3>Teste nos últimos ${retro.draws} concursos (${retro.first} a ${retro.last})</h3>
        <table class="metric-table">
          <caption class="sr-only">Distribuição de acertos das top 10 contra 10 jogos aleatórios e a teoria</caption>
          <thead><tr><th scope="col">Acertos por jogo</th><th scope="col">Top 10 do modelo</th><th scope="col">10 jogos ao acaso</th><th scope="col">Esperado</th></tr></thead>
          <tbody>
            ${[0, 1, 2, 3, 4, 5, 6].map(k => `<tr><th scope="row">${k}${HIT_LABEL[k] ? ` (${HIT_LABEL[k]})` : ''}</th><td>${dist(m, k)}</td><td>${dist(r, k)}</td><td>${exDist(k)}</td></tr>`).join('')}
            <tr class="model"><th scope="row">Média por jogo</th><td>${m.mean_hits.toFixed(3)}</td><td>${r.mean_hits.toFixed(3)}</td><td>${ex.mean_hits.toFixed(3)}</td></tr>
            <tr><th scope="row">Concursos com terno ou melhor</th><td>${m.draws_with_terno_or_better}</td><td>${r.draws_with_terno_or_better}</td><td>${Number(ex.draws_with_terno_or_better).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td></tr>
          </tbody>
        </table>
        <div class="val-note">${m.games.toLocaleString('pt-BR')} jogos de cada lado. Para cada concurso, o modelo foi treinado só com
          os sorteios anteriores (retreinado a cada ${retro.retrain_every} concursos) e gerou as mesmas top 10 que o site teria mostrado na véspera.</div>
        <details class="hist-details">
          <summary>Ver os últimos 20 concursos do teste</summary>
          <table class="metric-table hist-table">
            <caption class="sr-only">Últimos concursos do teste retroativo</caption>
            <thead><tr><th scope="col">Concurso</th><th scope="col">Sorteados</th><th scope="col">Melhor das top 10</th><th scope="col">Melhor ao acaso</th></tr></thead>
            <tbody>${retro.rows.slice(-20).reverse().map(row => `<tr>
              <th scope="row">${row.concurso}<br><small>${esc(fmtDate(row.date))}</small></th>
              <td><div class="mini-balls">${ballsHtml(row.result)}</div></td>
              <td>${row.best}</td><td>${row.random_best}</td></tr>`).join('')}</tbody>
          </table>
        </details>
      </div>
      <div class="insight-box">
        <strong>Conclusão:</strong> as top 10 acertam em média ${comma2(m.mean_hits)} número por jogo, contra
        ${comma2(r.mean_hits)} dos jogos ao acaso e 0,60 da teoria. <strong>O modelo empata com o acaso</strong>,
        como esperado num sorteio aleatório.
      </div>`;
}
