// Página da Loteca (loteca.html).

import { fetchLoteca, fetchLotecaProgramacao } from '../shared/caixa';
import { byId, esc, fmtDate, getJson, showApp, weekdayOf } from '../shared/util';
import { hitDistribution, optimize } from './builder';
import { LotecaModel, probsOf, sourceOf } from './model';
import type { LotecaData, OddsMetric, Outcome, Probs, Registry, Round } from './types';

const OUTCOMES: Outcome[] = ['1', 'X', '2'];
const OUTCOME_LABEL: Record<Outcome, string> = { '1': 'Mandante', X: 'Empate', '2': 'Visitante' };
const STORAGE_KEY = 'loteca-aposta-v2';
const TIME_FMT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

interface State {
  data: LotecaData;
  model: LotecaModel;
  rounds: Round[];
  current: number;
  doubles: number;
  triples: number;
}
let state: State;

// ── Formatação ───────────────────────────────────────────────────
const pct = (p: number) => `${Math.round(p * 100)}%`;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const comma1 = (v: number) => v.toFixed(1).replace('.', ',');

function oneIn(p: number): string {
  if (p <= 0) return '—';
  const n = 1 / p;
  return n < 10 ? `1 em ${comma1(n)}` : `1 em ${Math.round(n).toLocaleString('pt-BR')}`;
}

function probBar(p: Probs, label: string): string {
  const text = OUTCOMES.map((o, i) => `${OUTCOME_LABEL[o]} ${pct(p[i]!)}`).join(', ');
  return `
    <div class="lt-prob" role="img" aria-label="${esc(label)}: ${esc(text)}">
      ${OUTCOMES.map((o, i) => `
        <span class="lt-prob-seg lt-seg-${i}" style="flex:${Math.max(p[i]!, 0.04)}">
          <b>${o}</b> ${pct(p[i]!)}
        </span>`).join('')}
    </div>`;
}

// ── Preferências do montador (conveniência; a página funciona sem) ─
function savePrefs(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ doubles: state.doubles, triples: state.triples }));
  } catch { /* indisponível */ }
}

function loadPrefs(): { doubles: number; triples: number } {
  const prefs = { doubles: 1, triples: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<typeof prefs> | null;
    if (Number.isInteger(raw?.doubles)) prefs.doubles = raw!.doubles!;
    if (Number.isInteger(raw?.triples)) prefs.triples = raw!.triples!;
  } catch { /* ignora */ }
  return prefs;
}

// ── Cabeçalho ────────────────────────────────────────────────────
function renderMeta(): void {
  const d = state.data, r = state.rounds[0];
  const next = r ? `<div class="meta-pill">Próximo concurso <strong>${esc(r.number)}</strong> · <strong>${esc(weekdayOf(r.date))}, ${esc(fmtDate(r.date))}</strong></div>` : '';
  byId('lt-meta').innerHTML = `
    ${next}
    <div class="meta-pill"><strong>${d.meta.rounds.toLocaleString('pt-BR')}</strong> concursos no histórico</div>
    <div class="meta-pill">Gerado em <strong>${esc(fmtDate(d.meta.generated_at))}</strong></div>`;
  byId('gen-date').textContent = fmtDate(d.meta.generated_at);
}

// ── Concursos e jogos ────────────────────────────────────────────
function renderTabs(): void {
  const tabs = byId('round-tabs');
  if (state.rounds.length < 2) { tabs.innerHTML = ''; return; }
  tabs.innerHTML = state.rounds.map((r, i) => `
    <button type="button" role="tab" class="lt-tab" id="tab-${i}" data-i="${i}"
            aria-selected="${i === state.current}" tabindex="${i === state.current ? 0 : -1}">
      Concurso ${esc(r.number)} <small>${esc(fmtDate(r.date))}</small>
    </button>`).join('');
}

function renderRound(): void {
  const r = state.rounds[state.current];
  const info = byId('round-info');
  const list = byId('round-games');
  if (!r) {
    info.innerHTML = '';
    list.innerHTML = '<li class="lt-empty">A programação do próximo concurso ainda não foi publicada pela Caixa ou está indisponível agora. Tente novamente mais tarde.</li>';
    return;
  }
  const prize = r.estimated_prize ? ` · prêmio estimado <strong>${brl(r.estimated_prize)}</strong>` : '';
  const until = r.bets_until
    ? `apostas até ${esc(weekdayOf(r.bets_until))}, ${esc(fmtDate(r.bets_until))}${r.bets_until_hour ? ` às ${esc(r.bets_until_hour)}h` : ''}`
    : '';
  info.innerHTML = `
    <span class="next-draw-label">Concurso ${esc(r.number)}</span>
    <strong>${esc(weekdayOf(r.date))}, ${esc(fmtDate(r.date))}</strong>
    <span class="next-draw-note">${until}${prize}</span>`;
  const withOdds = r.games.filter(g => g.odds).length;
  list.innerHTML = r.games.map(g => {
    const p = probsOf(g);
    const when = g.kickoff
      ? `${weekdayOf(g.date)}, ${TIME_FMT.format(new Date(g.kickoff))}`
      : `${weekdayOf(g.date)} ${fmtDate(g.date)}`;
    const elo = g.odds && g.elo ? ` · Elo: ${OUTCOMES.map((o, i) => `${o} ${pct(g.elo![i]!)}`).join(' / ')}` : '';
    return `
      <li class="lt-game lt-game-round">
        <span class="lt-seq" aria-hidden="true">${esc(g.seq)}</span>
        <div class="lt-game-info">
          <div class="lt-game-meta"><span class="sr-only">Jogo ${esc(g.seq)}: </span>${esc(when)}${g.odds_tournament ? ` · ${esc(g.odds_tournament)}` : ''}</div>
          <div class="lt-teams">${esc(g.home)}${g.home_uf ? ` <small>${esc(g.home_uf)}</small>` : ''} <span aria-hidden="true">×</span><span class="sr-only">contra</span> ${esc(g.away)}${g.away_uf ? ` <small>${esc(g.away_uf)}</small>` : ''}</div>
        </div>
        <div class="lt-game-probs">
          ${probBar(p, sourceOf(g))}
          <div class="lt-src">${esc(sourceOf(g))}${elo}</div>
        </div>
      </li>`;
  }).join('') + `<li class="lt-round-note val-note">${withOdds} de ${r.games.length} jogos com odds; os demais usam o Elo. Odds de jogos mais distantes aparecem conforme as casas publicam.</li>`;
}

function selectRound(i: number): void {
  state.current = i;
  renderTabs();
  renderRound();
  renderBuilder();
}

// ── Montador de aposta ───────────────────────────────────────────
function setupBuilder(): void {
  const pr = state.data.pricing;
  const dSel = byId<HTMLSelectElement>('bet-doubles'), tSel = byId<HTMLSelectElement>('bet-triples');
  const options = (max: number) => Array.from({ length: max + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('');
  dSel.innerHTML = options(pr.max_doubles);
  tSel.innerHTML = options(pr.max_triples);
  dSel.value = String(Math.min(state.doubles, pr.max_doubles));
  tSel.value = String(Math.min(state.triples, pr.max_triples));
  const onChange = () => {
    state.doubles = Number(dSel.value);
    state.triples = Number(tSel.value);
    savePrefs();
    renderBuilder();
  };
  dSel.addEventListener('change', onChange);
  tSel.addEventListener('change', onChange);
  byId('bet-note').textContent =
    `Preço usado: ${brl(pr.price_per_combination)} por combinação (aposta mínima de ${brl(pr.price_per_combination * pr.min_combinations)} com 1 duplo). ` +
    'Confira os valores e as regras vigentes na Caixa antes de apostar.';
}

function renderBuilder(): void {
  const games = state.rounds[state.current]?.games ?? [];
  const list = byId('bet-list');
  const summary = byId('bet-summary');
  const pr = state.data.pricing;
  if (!games.length) {
    list.innerHTML = '<p class="lt-empty">Sem jogos para montar a aposta.</p>';
    summary.innerHTML = '';
    return;
  }
  const { choice, doubles, triples } = optimize(games, state.doubles, state.triples);
  const combos = 2 ** doubles * 3 ** triples;
  const coverage = choice.map(c => c.q);
  const dist = hitDistribution(coverage);
  const n = games.length;
  const pAll = dist[n] ?? 0;
  const p13 = pAll + (dist[n - 1] ?? 0);
  const expected = coverage.reduce((a, b) => a + b, 0);

  summary.innerHTML = `
    <div class="lt-kpi"><span>${combos}</span>combinações</div>
    <div class="lt-kpi"><span>${brl(combos * pr.price_per_combination)}</span>custo</div>
    <div class="lt-kpi"><span>${oneIn(pAll)}</span>chance de acertar os ${n}</div>
    <div class="lt-kpi"><span>${oneIn(p13)}</span>chance de ${n - 1} ou mais</div>
    <div class="lt-kpi"><span>${comma1(expected)}</span>acertos esperados</div>
    ${combos < pr.min_combinations ? '<p class="lt-warn">A aposta mínima da Loteca exige pelo menos 1 duplo.</p>' : ''}`;

  list.innerHTML = `
    <ol class="lt-bet">
      ${games.map((g, i) => {
        const p = probsOf(g), c = choice[i]!;
        const kind = c.picks.length === 1 ? 'Simples' : c.picks.length === 2 ? 'Duplo' : 'Triplo';
        return `
          <li class="lt-bet-row">
            <div class="lt-bet-game">
              <div class="lt-teams"><span class="lt-seq-inline">${esc(g.seq)}</span> ${esc(g.home)} <span aria-hidden="true">×</span><span class="sr-only">contra</span> ${esc(g.away)}</div>
              <div class="lt-game-meta">${esc(sourceOf(g))}</div>
            </div>
            <div class="lt-picks" role="img" aria-label="${kind}: ${c.picks.map(k => OUTCOME_LABEL[OUTCOMES[k]!]).join(' e ')}">
              ${OUTCOMES.map((o, k) => `
                <span class="lt-pick${c.picks.includes(k) ? ' is-on' : ''}" aria-hidden="true">
                  <b>${o}</b><small>${pct(p[k]!)}</small>
                </span>`).join('')}
            </div>
            <div class="lt-bet-cov">${kind}<br><small>${pct(c.q)} de chance</small></div>
          </li>`;
      }).join('')}
    </ol>`;
}

// ── Teste no histórico ───────────────────────────────────────────
function renderBacktest(d: LotecaData): void {
  const bt = d.backtest, oc = d.odds_comparison, P = bt.predictors;
  const row = (label: string, hits: number, acc: number | null, ten: number | null, cls = '') => `
    <tr class="${cls}"><th scope="row">${label}</th><td>${hits.toFixed(2).replace('.', ',')}</td>
    <td>${acc != null ? pct(acc) : '—'}</td><td>${ten ?? '—'}</td></tr>`;
  const metric = (label: string, m: OddsMetric, cls = '') => `
    <tr class="${cls}"><th scope="row">${label}</th><td>${pct(m.accuracy)}</td>
    <td>${m.log_loss.toFixed(3)}</td><td>${m.brier.toFixed(3)}</td></tr>`;
  const cal = bt.calibration.map(c => `
    <tr><th scope="row">${esc(c.range.replace('-', ' a ').replace(/\./g, ','))}</th><td>${c.games.toLocaleString('pt-BR')}</td>
    <td>${pct(c.predicted)}</td><td>${pct(c.observed)}</td></tr>`).join('');

  byId('bt-content').innerHTML = `
    <div class="val-extra">
      <h3>Acertos por concurso (aposta simples, 14 jogos)</h3>
      <table class="metric-table">
        <caption class="sr-only">Média de acertos por concurso de cada estratégia</caption>
        <thead><tr><th scope="col">Estratégia</th><th scope="col">Acertos / concurso</th><th scope="col">Acerto por jogo</th><th scope="col">Concursos com 10+</th></tr></thead>
        <tbody>
          ${row('Odds quando houver, senão Elo', oc.hits_per_round_elo_ou_odds, null, null, 'model')}
          ${row('Elo', P.elo.hits_per_round_mean, P.elo.accuracy, P.elo.rounds_10_plus)}
          ${row('Sempre o mandante', P.sempre_mandante.hits_per_round_mean, P.sempre_mandante.accuracy, P.sempre_mandante.rounds_10_plus)}
          ${row('Chute aleatório', P.aleatorio.hits_per_round_mean, P.aleatorio.accuracy, P.aleatorio.rounds_10_plus)}
        </tbody>
      </table>
      <div class="val-note">${bt.rounds.test_rounds.toLocaleString('pt-BR')} concursos de teste (a partir do ${bt.rounds.test_start}),
        ${bt.games_test.toLocaleString('pt-BR')} jogos. Parâmetros do Elo escolhidos só com concursos anteriores: K = ${bt.params.k}, vantagem de mando = ${bt.params.home_adv}.</div>

      <h3>Nos jogos que têm odds históricas</h3>
      <table class="metric-table">
        <caption class="sr-only">Comparação entre Elo, odds e a combinação dos dois</caption>
        <thead><tr><th scope="col">Preditor</th><th scope="col">Acerto</th><th scope="col">Log loss</th><th scope="col">Brier</th></tr></thead>
        <tbody>
          ${metric('Odds (sem a margem da casa)', oc.on_games_with_odds.odds, 'model')}
          ${metric('Elo + odds combinados', oc.on_games_with_odds.elo_mais_odds)}
          ${metric('Elo', oc.on_games_with_odds.elo)}
        </tbody>
      </table>
      <div class="val-note">${oc.test_games_with_odds.toLocaleString('pt-BR')} jogos de teste com odds (ligas europeias e Série A).
        Menor log loss e Brier = melhor. As odds já incorporam o que o Elo sabe: combinar os dois não melhora.</div>

      <h3>Calibração do Elo</h3>
      <table class="metric-table">
        <caption class="sr-only">Probabilidade prevista pelo Elo comparada com a frequência real de acerto</caption>
        <thead><tr><th scope="col">Confiança do palpite</th><th scope="col">Jogos</th><th scope="col">Previsto</th><th scope="col">Aconteceu</th></tr></thead>
        <tbody>${cal}</tbody>
      </table>
      <div class="val-note">Quando o modelo diz 42%, o resultado acontece cerca de 42% das vezes. Nos palpites de alta confiança ele exagera um pouco.</div>
    </div>
    <div class="insight-box">
      <strong>Conclusão:</strong> no futebol, ao contrário da Mega-Sena, dá para acertar mais que o acaso:
      cerca de ${comma1(oc.hits_per_round_elo_ou_odds)} acertos por concurso contra
      ${comma1(P.aleatorio.hits_per_round_mean)} no chute. Mas acertar 14 continua muito improvável, e o
      retorno esperado da aposta segue negativo.
    </div>`;
}

// ── Histórico das previsões ──────────────────────────────────────
function renderRegistry(reg: Registry | null): void {
  const box = byId('reg-content');
  const rounds = reg?.rounds ?? [];
  if (!rounds.length) {
    box.innerHTML = '<p class="lt-empty">O registro começa com o próximo concurso. As previsões são gravadas antes do prazo das apostas e conferidas depois dos jogos.</p>';
    return;
  }
  const done = rounds.filter(r => r.result);
  const pending = rounds.filter(r => !r.result);
  const games = done.reduce((a, r) => a + r.result!.games, 0);
  const hits = done.reduce((a, r) => a + r.result!.hits, 0);
  const plural = done.length > 1 ? 's' : '';
  const stamp = (s: string | null | undefined) => esc(fmtDate(s));
  let html = '';
  if (done.length) {
    html += `
      <div class="lt-bet-summary lt-reg-summary">
        <div class="lt-kpi"><span>${pct(hits / games)}</span>de acerto (${hits} de ${games} jogos)</div>
        <div class="lt-kpi"><span>${comma1(hits / done.length)}</span>acertos por concurso</div>
        <div class="lt-kpi"><span>${done.length}</span>concurso${plural} conferido${plural}</div>
        <div class="lt-kpi"><span>33%</span>chute aleatório</div>
      </div>`;
  }
  html += `
    <div class="val-extra">
      <table class="metric-table hist-table">
        <caption class="sr-only">Previsões registradas da Loteca e acertos</caption>
        <thead><tr><th scope="col">Concurso</th><th scope="col">Registrada em</th><th scope="col">Acertos</th><th scope="col">% de acerto</th><th scope="col">Jogos com odds</th></tr></thead>
        <tbody>${rounds.map(r => {
          const res = r.result;
          const odds = r.games.filter(g => g.source === 'odds').length;
          return `<tr>
            <th scope="row">${esc(r.number)}<br><small>${esc(fmtDate(r.date))}${r.checked_in_browser ? ' · conferido agora' : ''}</small></th>
            <td>${stamp(r.first_registered_at)}${r.registered_at !== r.first_registered_at ? `<br><small>atualizada em ${stamp(r.registered_at)}</small>` : ''}</td>
            <td>${res ? `<strong>${res.hits}</strong> de ${res.games}` : '<small>aguardando os jogos</small>'}</td>
            <td>${res ? pct(res.pct) : '—'}</td>
            <td>${res ? `${res.hits_odds} de ${res.games_odds} certos` : `${odds} de ${r.games.length}`}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <div class="val-note">A previsão pode ser atualizada até o fim do prazo das apostas (as odds mudam durante a semana); depois disso fica congelada.
        ${pending.length ? `Pendentes: ${pending.map(r => r.number).join(', ')}.` : ''}</div>
    </div>`;
  box.innerHTML = html;
}

/** Confere no navegador concursos registrados que já têm resultado na Caixa. */
function checkRegistryInBrowser(reg: Registry | null): void {
  if (!reg) return;
  const today = new Date().toISOString().slice(0, 10);
  const pending = reg.rounds.filter(r => !r.result && r.games.every(g => (g.date ?? '') < today));
  for (const r of pending.slice(0, 3)) {
    void fetchLoteca(r.number).then(d => {
      const list = d?.listaResultadoEquipeEsportiva ?? [];
      if (!d || Number(d.numero) !== Number(r.number) || !list.length) return;  // ainda não publicado
      const outcome = new Map<number, Outcome>(list.map(g => [g.nuSequencial,
        g.nuGolEquipeUm > g.nuGolEquipeDois ? '1' : g.nuGolEquipeUm === g.nuGolEquipeDois ? 'X' : '2']));
      const scored = r.games.filter(g => outcome.has(g.seq));
      if (!scored.length) return;
      for (const g of scored) { g.outcome = outcome.get(g.seq); g.hit = g.pick === g.outcome; }
      const hits = scored.filter(g => g.hit).length;
      const withOdds = scored.filter(g => g.source === 'odds');
      r.result = {
        games: scored.length, hits, pct: hits / scored.length,
        hits_odds: withOdds.filter(g => g.hit).length, games_odds: withOdds.length,
      };
      r.checked_in_browser = true;
      renderRegistry(reg);
    });
  }
}

// ── Inicialização ────────────────────────────────────────────────
function applyRounds(rounds: Round[]): void {
  state.rounds = rounds;
  state.current = Math.min(state.current, Math.max(state.rounds.length - 1, 0));
  renderMeta();
  renderTabs();
  renderRound();
  renderBuilder();
}

/**
 * A programação é consultada direto na Caixa (a API permite CORS): a página mostra o
 * concurso certo mesmo que o build não tenha acessado a Caixa.
 */
async function refreshFromCaixa(): Promise<void> {
  const list = await fetchLotecaProgramacao();
  if (!list) return;  // mantém a programação do build
  const live = state.model.roundsFromCaixa(list);
  if (!live.length) return;
  const numbers = (rs: Round[]) => rs.map(r => r.number).join(',');
  if (numbers(live) !== numbers(state.rounds)) applyRounds(live);
}

function setupTabs(): void {
  const tabs = byId('round-tabs');
  tabs.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('.lt-tab');
    if (b) selectRound(Number(b.dataset.i));
  });
  tabs.addEventListener('keydown', e => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step || state.rounds.length < 2) return;
    e.preventDefault();
    const next = (state.current + step + state.rounds.length) % state.rounds.length;
    selectRound(next);
    document.getElementById(`tab-${next}`)?.focus();
  });
}

function init(d: LotecaData): void {
  state = { data: d, model: new LotecaModel(d), rounds: [], current: 0, ...loadPrefs() };
  setupBuilder();
  applyRounds(d.rounds ?? []);
  renderBacktest(d);
  setupTabs();
  showApp();
  void refreshFromCaixa();
  void getJson<Registry>('./loteca_registro.json').then(reg => {
    renderRegistry(reg);
    checkRegistryInBrowser(reg);
  });
}

async function main(): Promise<void> {
  const d = await getJson<LotecaData>('./loteca.json');
  if (d) { init(d); return; }
  byId('loading').innerHTML = `
    <div style="text-align:center;padding:40px;max-width:480px">
      <h2 style="font-size:22px;margin-bottom:12px">loteca.json não encontrado</h2>
      <p style="color:var(--sub);font-size:14px">Gere os dados com <code>python generate_loteca.py</code> antes de abrir a página.</p>
    </div>`;
}

void main();
