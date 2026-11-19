'use strict';

// ── Estado ───────────────────────────────────────────────────────
const OUTCOMES = ['1', 'X', '2'];
const OUTCOME_LABEL = { '1': 'Mandante', 'X': 'Empate', '2': 'Visitante' };
const MAX_GAMES = 14;
const STORAGE_KEY = 'loteca-selecao-v1';
const state = { data: null, selected: new Map(), doubles: 1, triples: 0 };

// ── Utilitários ──────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = p => `${Math.round(p * 100)}%`;
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '—'); };
const DAY_FMT = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const TIME_FMT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const gameId = g => g.id || `${g.start}|${g.home}|${g.away}`;
const probsOf = g => g.odds || g.elo;

function oneIn(p) {
  if (p <= 0) return '—';
  const n = 1 / p;
  return n < 10 ? `1 em ${n.toFixed(1).replace('.', ',')}` : `1 em ${Math.round(n).toLocaleString('pt-BR')}`;
}

// Probabilidades do Elo no navegador (mesmo modelo do Python: regressão logística multinomial)
function eloProbs(model, home, away) {
  const d = (home.rating + model.home_adv - away.rating) / 400;
  const isNew = Math.min(home.games, away.games) < model.new_team_games ? 1 : 0;
  const x = [d, isNew, d * isNew];
  const z = model.coef.map((c, i) => c.reduce((s, w, j) => s + w * x[j], model.intercept[i]));
  const m = Math.max(...z);
  const e = z.map(v => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / sum);
}

function probBar(p, label) {
  const text = OUTCOMES.map((o, i) => `${OUTCOME_LABEL[o]} ${pct(p[i])}`).join(', ');
  return `
    <div class="lt-prob" role="img" aria-label="${esc(label)}: ${esc(text)}">
      ${OUTCOMES.map((o, i) => `
        <span class="lt-prob-seg lt-seg-${i}" style="flex:${Math.max(p[i], 0.04)}">
          <b>${o}</b> ${pct(p[i])}
        </span>`).join('')}
    </div>`;
}

// ── Persistência da seleção (conveniência; a página funciona sem) ─
function saveSelection() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      games: [...state.selected.values()], doubles: state.doubles, triples: state.triples,
    }));
  } catch (_) { /* armazenamento indisponível */ }
}
function loadSelection() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw) return;
    const now = Date.now();
    (raw.games || []).forEach(g => {
      // descarta jogos que já começaram há mais de 1 dia
      if (!g.start || Date.parse(g.start) > now - 86400000) state.selected.set(gameId(g), g);
    });
    if (Number.isInteger(raw.doubles)) state.doubles = raw.doubles;
    if (Number.isInteger(raw.triples)) state.triples = raw.triples;
  } catch (_) { /* ignora */ }
}

// ── Cabeçalho ────────────────────────────────────────────────────
function renderMeta(d) {
  const nr = d.meta.next_round;
  document.getElementById('lt-meta').innerHTML = `
    ${nr?.number ? `<div class="meta-pill">Próximo concurso <strong>${esc(nr.number)}</strong>${nr.date ? ` · <strong>${esc(nr.date)}</strong>` : ''}</div>` : ''}
    <div class="meta-pill"><strong>${d.meta.rounds.toLocaleString('pt-BR')}</strong> concursos no histórico</div>
    <div class="meta-pill">Gerado em <strong>${esc(fmtDate(d.meta.generated_at))} ${esc(d.meta.generated_at.slice(11))}</strong></div>`;
  document.getElementById('gen-date').textContent = `${fmtDate(d.meta.generated_at)} ${d.meta.generated_at.slice(11)}`;
}

// ── Jogos dos próximos dias ──────────────────────────────────────
function renderUpcoming() {
  const box = document.getElementById('up-list');
  const games = state.data.upcoming || [];
  if (!games.length) {
    box.innerHTML = `<p class="lt-empty">Sem jogos com odds no momento (fora de temporada ou odds indisponíveis no último build). Use o jogo manual abaixo.</p>`;
    return;
  }
  const q = document.getElementById('up-search').value.trim().toLowerCase();
  const full = state.selected.size >= MAX_GAMES;
  const shown = games.filter(g => !q || `${g.home} ${g.away} ${g.tournament}`.toLowerCase().includes(q));
  if (!shown.length) { box.innerHTML = `<p class="lt-empty">Nenhum jogo encontrado para “${esc(q)}”.</p>`; return; }

  let html = '', lastDay = '';
  shown.forEach(g => {
    const dt = new Date(g.start);
    const day = DAY_FMT.format(dt);
    if (day !== lastDay) { html += `<h3 class="lt-day">${esc(day)}</h3>`; lastDay = day; }
    const id = gameId(g);
    const checked = state.selected.has(id);
    html += `
      <div class="lt-game${checked ? ' is-selected' : ''}">
        <label class="lt-check">
          <input type="checkbox" data-id="${esc(id)}" ${checked ? 'checked' : ''} ${full && !checked ? 'disabled' : ''} />
          <span class="sr-only">Incluir ${esc(g.home)} x ${esc(g.away)} na aposta</span>
        </label>
        <div class="lt-game-info">
          <div class="lt-game-meta">${esc(TIME_FMT.format(dt))} · ${esc(g.tournament)}</div>
          <div class="lt-teams">${esc(g.home)} <span aria-hidden="true">×</span><span class="sr-only">contra</span> ${esc(g.away)}</div>
        </div>
        <div class="lt-game-probs">
          ${probBar(g.odds, 'Odds')}
          <div class="lt-src">Odds Pinnacle${g.elo ? ` · Elo: ${OUTCOMES.map((o, i) => `${o} ${pct(g.elo[i])}`).join(' / ')}` : ''}</div>
        </div>
      </div>`;
  });
  box.innerHTML = html;
}

function toggleGame(id, on) {
  if (on) {
    if (state.selected.size >= MAX_GAMES) return;
    const g = state.data.upcoming.find(x => gameId(x) === id);
    if (g) state.selected.set(id, { ...g, source: 'Odds Pinnacle' });
  } else {
    state.selected.delete(id);
  }
  saveSelection();
  renderUpcoming();
  renderBuilder();
}

// ── Jogo manual ──────────────────────────────────────────────────
const teamLabel = t => (t.uf ? `${t.name} (${t.uf})` : t.name);

function setupManual() {
  const teams = state.data.teams || [];
  const byLabel = new Map(teams.map(t => [teamLabel(t).toLowerCase(), t]));
  document.getElementById('team-options').innerHTML =
    teams.map(t => `<option value="${esc(teamLabel(t))}"></option>`).join('');

  document.getElementById('man-form').addEventListener('submit', e => {
    e.preventDefault();
    const msg = document.getElementById('man-msg');
    const hIn = document.getElementById('man-home'), aIn = document.getElementById('man-away');
    const home = byLabel.get(hIn.value.trim().toLowerCase());
    const away = byLabel.get(aIn.value.trim().toLowerCase());
    if (!home || !away) { msg.textContent = 'Escolha os dois times da lista de sugestões.'; return; }
    if (home.key === away.key) { msg.textContent = 'Mandante e visitante precisam ser diferentes.'; return; }
    if (state.selected.size >= MAX_GAMES) { msg.textContent = `Você já escolheu ${MAX_GAMES} jogos.`; return; }
    const g = {
      id: `manual|${home.key}|${away.key}`, home: teamLabel(home), away: teamLabel(away),
      tournament: 'Jogo manual', elo: eloProbs(state.data.model, home, away), source: 'Elo',
    };
    state.selected.set(g.id, g);
    msg.textContent = `${g.home} x ${g.away} adicionado à aposta.`;
    hIn.value = ''; aIn.value = '';
    saveSelection();
    renderUpcoming();
    renderBuilder();
  });
}

// ── Montador de aposta ───────────────────────────────────────────
// Para cada jogo: simples (resultado mais provável), duplo (2 mais prováveis) ou triplo.
// Programação dinâmica escolhe onde pôr os duplos/triplos para maximizar P(acertar todos).
function optimize(games, nDoubles, nTriples) {
  const opts = games.map(g => {
    const p = probsOf(g);
    const order = [0, 1, 2].sort((a, b) => p[b] - p[a]);
    return [
      { picks: [order[0]], q: p[order[0]] },
      { picks: order.slice(0, 2), q: p[order[0]] + p[order[1]] },
      { picks: [0, 1, 2], q: 1 },
    ];
  });
  const n = games.length;
  const D = Math.min(nDoubles, n), T = Math.min(nTriples, n - D);
  // best[d][t] = melhor log-probabilidade usando exatamente d duplos e t triplos até aqui
  let best = Array.from({ length: D + 1 }, () => Array(T + 1).fill(-Infinity));
  best[0][0] = 0;
  const trace = [];
  opts.forEach(o => {
    const next = Array.from({ length: D + 1 }, () => Array(T + 1).fill(-Infinity));
    const from = Array.from({ length: D + 1 }, () => Array(T + 1).fill(null));
    for (let d = 0; d <= D; d++) for (let t = 0; t <= T; t++) {
      if (best[d][t] === -Infinity) continue;
      [[0, d, t], [1, d + 1, t], [2, d, t + 1]].forEach(([k, nd, nt]) => {
        if (nd > D || nt > T) return;
        const v = best[d][t] + Math.log(Math.max(o[k].q, 1e-12));
        if (v > next[nd][nt]) { next[nd][nt] = v; from[nd][nt] = [k, d, t]; }
      });
    }
    trace.push(from); best = next;
  });
  const choice = Array(n);
  let d = D, t = T;
  for (let i = n - 1; i >= 0; i--) { const [k, pd, pt] = trace[i][d][t]; choice[i] = opts[i][k]; d = pd; t = pt; }
  return { choice, doubles: D, triples: T };
}

// Distribuição do número de acertos (Poisson-binomial)
function hitDistribution(probs) {
  let dist = [1];
  probs.forEach(c => {
    const next = Array(dist.length + 1).fill(0);
    dist.forEach((v, k) => { next[k] += v * (1 - c); next[k + 1] += v * c; });
    dist = next;
  });
  return dist;
}

function setupBuilder() {
  const pr = state.data.pricing;
  const dSel = document.getElementById('bet-doubles'), tSel = document.getElementById('bet-triples');
  dSel.innerHTML = Array.from({ length: pr.max_doubles + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('');
  tSel.innerHTML = Array.from({ length: pr.max_triples + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('');
  dSel.value = Math.min(state.doubles, pr.max_doubles);
  tSel.value = Math.min(state.triples, pr.max_triples);
  const onChange = () => { state.doubles = +dSel.value; state.triples = +tSel.value; saveSelection(); renderBuilder(); };
  dSel.addEventListener('change', onChange);
  tSel.addEventListener('change', onChange);
  document.getElementById('bet-note').textContent =
    `Preço usado: ${brl(pr.price_per_combination)} por combinação (aposta mínima de ${brl(pr.price_per_combination * pr.min_combinations)} com 1 duplo). ` +
    `Confira os valores e as regras vigentes na Caixa antes de apostar.`;
}

function renderBuilder() {
  const games = [...state.selected.values()];
  const list = document.getElementById('bet-list');
  const summary = document.getElementById('bet-summary');
  const pr = state.data.pricing;
  if (!games.length) {
    list.innerHTML = `<p class="lt-empty">Marque os jogos acima ou adicione jogos manualmente (até ${MAX_GAMES}).</p>`;
    summary.innerHTML = '';
    return;
  }
  const { choice, doubles, triples } = optimize(games, state.doubles, state.triples);
  const combos = 2 ** doubles * 3 ** triples;
  const coverage = choice.map(c => c.q);
  const dist = hitDistribution(coverage);
  const n = games.length;
  const pAll = dist[n];
  const pMinus1 = n >= 1 ? dist[n] + dist[n - 1] : pAll;
  const expected = coverage.reduce((a, b) => a + b, 0);
  const missing = MAX_GAMES - n;
  const tooSmall = combos < pr.min_combinations;

  summary.innerHTML = `
    <div class="lt-kpi"><span>${n}/${MAX_GAMES}</span>jogos${missing > 0 ? ` (faltam ${missing})` : ''}</div>
    <div class="lt-kpi"><span>${combos}</span>combinações</div>
    <div class="lt-kpi"><span>${brl(combos * pr.price_per_combination)}</span>custo</div>
    <div class="lt-kpi"><span>${oneIn(pAll)}</span>chance de acertar ${n === MAX_GAMES ? 'os 14' : `os ${n}`}</div>
    ${n === MAX_GAMES ? `<div class="lt-kpi"><span>${oneIn(pMinus1)}</span>chance de 13 ou mais</div>` : ''}
    <div class="lt-kpi"><span>${expected.toFixed(1).replace('.', ',')}</span>acertos esperados</div>
    ${tooSmall ? `<p class="lt-warn">A aposta mínima da Loteca exige pelo menos 1 duplo.</p>` : ''}`;

  list.innerHTML = `
    <ol class="lt-bet">
      ${games.map((g, i) => {
        const p = probsOf(g), c = choice[i];
        const kind = c.picks.length === 1 ? 'Simples' : c.picks.length === 2 ? 'Duplo' : 'Triplo';
        return `
          <li class="lt-bet-row">
            <div class="lt-bet-game">
              <div class="lt-teams">${esc(g.home)} <span aria-hidden="true">×</span><span class="sr-only">contra</span> ${esc(g.away)}</div>
              <div class="lt-game-meta">${esc(g.tournament)} · ${esc(g.source || (g.odds ? 'Odds Pinnacle' : 'Elo'))}</div>
            </div>
            <div class="lt-picks" role="img" aria-label="${kind}: ${c.picks.map(k => OUTCOME_LABEL[OUTCOMES[k]]).join(' e ')}">
              ${OUTCOMES.map((o, k) => `
                <span class="lt-pick${c.picks.includes(k) ? ' is-on' : ''}" aria-hidden="true">
                  <b>${o}</b><small>${pct(p[k])}</small>
                </span>`).join('')}
            </div>
            <div class="lt-bet-cov">${kind}<br><small>${pct(c.q)} de chance</small></div>
            <button type="button" class="lt-remove" data-id="${esc(gameId(g))}" aria-label="Remover ${esc(g.home)} x ${esc(g.away)}">×</button>
          </li>`;
      }).join('')}
    </ol>`;
}

// ── Teste no histórico ───────────────────────────────────────────
function renderBacktest(d) {
  const bt = d.backtest, oc = d.odds_comparison, P = bt.predictors;
  const row = (label, hits, acc, ten, cls = '') => `
    <tr class="${cls}"><th scope="row">${label}</th><td>${hits.toFixed(2).replace('.', ',')}</td>
    <td>${acc != null ? pct(acc) : '—'}</td><td>${ten ?? '—'}</td></tr>`;
  const metric = (label, m, cls = '') => `
    <tr class="${cls}"><th scope="row">${label}</th><td>${pct(m.accuracy)}</td>
    <td>${m.log_loss.toFixed(3)}</td><td>${m.brier.toFixed(3)}</td></tr>`;
  const cal = bt.calibration.map(c => `
    <tr><th scope="row">${esc(c.range.replace('-', ' a ').replace(/\./g, ','))}</th><td>${c.games.toLocaleString('pt-BR')}</td>
    <td>${pct(c.predicted)}</td><td>${pct(c.observed)}</td></tr>`).join('');

  document.getElementById('bt-content').innerHTML = `
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
      cerca de ${oc.hits_per_round_elo_ou_odds.toFixed(1).replace('.', ',')} acertos por concurso contra
      ${P.aleatorio.hits_per_round_mean.toFixed(1).replace('.', ',')} no chute. Mas acertar 14 continua muito improvável, e o
      retorno esperado da aposta segue negativo.
    </div>`;
}

// ── Inicialização ────────────────────────────────────────────────
function init(d) {
  state.data = d;
  loadSelection();
  renderMeta(d);
  setupManual();
  setupBuilder();
  renderUpcoming();
  renderBuilder();
  renderBacktest(d);

  document.getElementById('up-search').addEventListener('input', renderUpcoming);
  document.getElementById('up-list').addEventListener('change', e => {
    if (e.target.matches('input[type=checkbox]')) toggleGame(e.target.dataset.id, e.target.checked);
  });
  document.getElementById('bet-list').addEventListener('click', e => {
    const b = e.target.closest('.lt-remove');
    if (!b) return;
    state.selected.delete(b.dataset.id);
    saveSelection();
    renderUpcoming();
    renderBuilder();
  });
  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').classList.add('ready');
}

fetch('./loteca.json')
  .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
  .then(init)
  .catch(() => {
    document.getElementById('loading').innerHTML = `
      <div style="text-align:center;padding:40px;max-width:480px">
        <h2 style="font-size:22px;margin-bottom:12px">loteca.json não encontrado</h2>
        <p style="color:var(--sub);font-size:14px">Gere os dados com <code>python generate_loteca.py</code> antes de abrir a página.</p>
      </div>`;
  });
