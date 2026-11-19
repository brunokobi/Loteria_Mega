'use strict';

// ── Estado ───────────────────────────────────────────────────────
const OUTCOMES = ['1', 'X', '2'];
const OUTCOME_LABEL = { '1': 'Mandante', 'X': 'Empate', '2': 'Visitante' };
const STORAGE_KEY = 'loteca-aposta-v2';
const PROGRAMACAO_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca/programacao';
const state = { data: null, rounds: [], current: 0, doubles: 1, triples: 0 };

// ── Utilitários ──────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = p => `${Math.round(p * 100)}%`;
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '—'); };
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' });
const weekdayOf = iso => (iso ? WEEKDAY.format(new Date(`${iso}T12:00:00Z`)) : '');
const TIME_FMT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const UNIFORM = [1 / 3, 1 / 3, 1 / 3];
const probsOf = g => g.odds || g.elo || UNIFORM;
const sourceOf = g => (g.odds ? 'Odds Pinnacle' : g.elo ? 'Elo' : 'Sem dados (1/3 cada)');

function oneIn(p) {
  if (p <= 0) return '—';
  const n = 1 / p;
  return n < 10 ? `1 em ${n.toFixed(1).replace('.', ',')}` : `1 em ${Math.round(n).toLocaleString('pt-BR')}`;
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

// ── Elo e times no navegador (quando a programação vem direto da Caixa) ─
const NAME_ALIASES = { 'S PAULO': 'SAO PAULO', 'S CAETANO': 'SAO CAETANO', 'BRASIL DE PELOTAS': 'BRASIL PELOTAS' };
function normalizeName(s) {
  const n = String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return NAME_ALIASES[n] || n;
}
function resolveTeam(name, uf) {
  const lk = state.data.team_lookup || { by_key: {}, by_name: {} };
  return uf ? lk.by_key[`${normalizeName(name)}/${normalizeName(uf)}`] || null
            : lk.by_name[normalizeName(name)] || null;
}
function eloProbs(hKey, aKey) {
  const teams = state.teamsByKey, model = state.data.model;
  const h = teams.get(hKey), a = teams.get(aKey);
  if (!h || !a) return null;
  const d = (h.rating + model.home_adv - a.rating) / 400;
  const isNew = Math.min(h.games, a.games) < model.new_team_games ? 1 : 0;
  const x = [d, isNew, d * isNew];
  const z = model.coef.map((c, i) => c.reduce((s, w, j) => s + w * x[j], model.intercept[i]));
  const m = Math.max(...z);
  const e = z.map(v => Math.exp(v - m));
  const sum = e.reduce((acc, v) => acc + v, 0);
  return e.map(v => v / sum);
}
function oddsFor(game) {
  if (!game.home_key || !game.away_key || !game.date) return null;
  const d0 = Date.parse(`${game.date}T12:00:00Z`);
  const f = (state.data.upcoming || []).find(x => x.home_key === game.home_key && x.away_key === game.away_key
    && Math.abs(Date.parse(x.start) - d0) <= 2 * 86400000);
  return f ? { odds: f.odds, odds_tournament: f.tournament, kickoff: f.start } : null;
}
const brDate = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
function roundsFromCaixa(list) {
  return (list || []).map(c => {
    const games = (Object.values(c).find(Array.isArray) || []).slice().sort((a, b) => a.nuSequencial - b.nuSequencial);
    return {
      number: c.nuConcurso, date: brDate(c.dataProximoConcurso), weekday: c.diaSemana,
      bets_until: brDate(c.dataFimApostas), bets_until_hour: c.horarioFimApostas,
      estimated_prize: c.valorEstimadoProximoConcurso,
      games: games.map(g => {
        const game = {
          seq: g.nuSequencial, date: brDate(g.dtJogo), weekday: g.diaSemana,
          home: (g.nomeEquipeUm || '').trim(), home_uf: (g.siglaUFUm || g.siglaPaisUm || '').trim(),
          away: (g.nomeEquipeDois || '').trim(), away_uf: (g.siglaUFDois || g.siglaPaisDois || '').trim(),
        };
        game.home_key = resolveTeam(game.home, game.home_uf);
        game.away_key = resolveTeam(game.away, game.away_uf);
        game.elo = eloProbs(game.home_key, game.away_key);
        Object.assign(game, oddsFor(game) || { odds: null });
        return game;
      }),
    };
  }).sort((a, b) => a.number - b.number);
}

// ── Preferências do montador (conveniência; a página funciona sem) ─
function savePrefs() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ doubles: state.doubles, triples: state.triples })); } catch (_) { /* indisponível */ }
}
function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Number.isInteger(raw?.doubles)) state.doubles = raw.doubles;
    if (Number.isInteger(raw?.triples)) state.triples = raw.triples;
  } catch (_) { /* ignora */ }
}

// ── Cabeçalho ────────────────────────────────────────────────────
function renderMeta() {
  const d = state.data, r = state.rounds[0];
  const next = r ? `<div class="meta-pill">Próximo concurso <strong>${esc(r.number)}</strong> · <strong>${esc(weekdayOf(r.date))}, ${esc(fmtDate(r.date))}</strong></div>` : '';
  document.getElementById('lt-meta').innerHTML = `
    ${next}
    <div class="meta-pill"><strong>${d.meta.rounds.toLocaleString('pt-BR')}</strong> concursos no histórico</div>
    <div class="meta-pill">Gerado em <strong>${esc(fmtDate(d.meta.generated_at))} ${esc(d.meta.generated_at.slice(11))}</strong></div>`;
  document.getElementById('gen-date').textContent = `${fmtDate(d.meta.generated_at)} ${d.meta.generated_at.slice(11)}`;
}

// ── Concursos e jogos ────────────────────────────────────────────
function renderTabs() {
  const tabs = document.getElementById('round-tabs');
  if (state.rounds.length < 2) { tabs.innerHTML = ''; return; }
  tabs.innerHTML = state.rounds.map((r, i) => `
    <button type="button" role="tab" class="lt-tab" id="tab-${i}" data-i="${i}"
            aria-selected="${i === state.current}" tabindex="${i === state.current ? 0 : -1}">
      Concurso ${esc(r.number)} <small>${esc(fmtDate(r.date))}</small>
    </button>`).join('');
}

function renderRound() {
  const r = state.rounds[state.current];
  const info = document.getElementById('round-info');
  const list = document.getElementById('round-games');
  if (!r) {
    info.innerHTML = '';
    list.innerHTML = `<li class="lt-empty">A programação do próximo concurso ainda não foi publicada pela Caixa ou está indisponível agora. Tente novamente mais tarde.</li>`;
    return;
  }
  const prize = r.estimated_prize ? ` · prêmio estimado <strong>${brl(r.estimated_prize)}</strong>` : '';
  const until = r.bets_until ? `apostas até ${esc(weekdayOf(r.bets_until))}, ${esc(fmtDate(r.bets_until))}${r.bets_until_hour ? ` às ${esc(r.bets_until_hour)}h` : ''}` : '';
  info.innerHTML = `
    <span class="next-draw-label">Concurso ${esc(r.number)}</span>
    <strong>${esc(weekdayOf(r.date))}, ${esc(fmtDate(r.date))}</strong>
    <span class="next-draw-note">${until}${prize}</span>`;
  const withOdds = r.games.filter(g => g.odds).length;
  list.innerHTML = r.games.map(g => {
    const p = probsOf(g);
    const when = g.kickoff ? `${weekdayOf(g.date)}, ${TIME_FMT.format(new Date(g.kickoff))}` : `${weekdayOf(g.date) || ''} ${fmtDate(g.date)}`;
    const elo = g.odds && g.elo ? ` · Elo: ${OUTCOMES.map((o, i) => `${o} ${pct(g.elo[i])}`).join(' / ')}` : '';
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

function selectRound(i) {
  state.current = i;
  renderTabs();
  renderRound();
  renderBuilder();
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
  const onChange = () => { state.doubles = +dSel.value; state.triples = +tSel.value; savePrefs(); renderBuilder(); };
  dSel.addEventListener('change', onChange);
  tSel.addEventListener('change', onChange);
  document.getElementById('bet-note').textContent =
    `Preço usado: ${brl(pr.price_per_combination)} por combinação (aposta mínima de ${brl(pr.price_per_combination * pr.min_combinations)} com 1 duplo). ` +
    `Confira os valores e as regras vigentes na Caixa antes de apostar.`;
}

function renderBuilder() {
  const r = state.rounds[state.current];
  const games = r ? r.games : [];
  const list = document.getElementById('bet-list');
  const summary = document.getElementById('bet-summary');
  const pr = state.data.pricing;
  if (!games.length) {
    list.innerHTML = `<p class="lt-empty">Sem jogos para montar a aposta.</p>`;
    summary.innerHTML = '';
    return;
  }
  const { choice, doubles, triples } = optimize(games, state.doubles, state.triples);
  const combos = 2 ** doubles * 3 ** triples;
  const coverage = choice.map(c => c.q);
  const dist = hitDistribution(coverage);
  const n = games.length;
  const pAll = dist[n];
  const p13 = dist[n] + (dist[n - 1] || 0);
  const expected = coverage.reduce((a, b) => a + b, 0);

  summary.innerHTML = `
    <div class="lt-kpi"><span>${combos}</span>combinações</div>
    <div class="lt-kpi"><span>${brl(combos * pr.price_per_combination)}</span>custo</div>
    <div class="lt-kpi"><span>${oneIn(pAll)}</span>chance de acertar os ${n}</div>
    <div class="lt-kpi"><span>${oneIn(p13)}</span>chance de ${n - 1} ou mais</div>
    <div class="lt-kpi"><span>${expected.toFixed(1).replace('.', ',')}</span>acertos esperados</div>
    ${combos < pr.min_combinations ? `<p class="lt-warn">A aposta mínima da Loteca exige pelo menos 1 duplo.</p>` : ''}`;

  list.innerHTML = `
    <ol class="lt-bet">
      ${games.map((g, i) => {
        const p = probsOf(g), c = choice[i];
        const kind = c.picks.length === 1 ? 'Simples' : c.picks.length === 2 ? 'Duplo' : 'Triplo';
        return `
          <li class="lt-bet-row">
            <div class="lt-bet-game">
              <div class="lt-teams"><span class="lt-seq-inline">${esc(g.seq)}</span> ${esc(g.home)} <span aria-hidden="true">×</span><span class="sr-only">contra</span> ${esc(g.away)}</div>
              <div class="lt-game-meta">${esc(sourceOf(g))}</div>
            </div>
            <div class="lt-picks" role="img" aria-label="${kind}: ${c.picks.map(k => OUTCOME_LABEL[OUTCOMES[k]]).join(' e ')}">
              ${OUTCOMES.map((o, k) => `
                <span class="lt-pick${c.picks.includes(k) ? ' is-on' : ''}" aria-hidden="true">
                  <b>${o}</b><small>${pct(p[k])}</small>
                </span>`).join('')}
            </div>
            <div class="lt-bet-cov">${kind}<br><small>${pct(c.q)} de chance</small></div>
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


// ── Histórico das previsões ──────────────────────────────────────
function renderRegistry(reg) {
  const box = document.getElementById('reg-content');
  const rounds = reg?.rounds || [];
  if (!rounds.length) {
    box.innerHTML = `<p class="lt-empty">O registro começa com o próximo concurso. As previsões são gravadas antes do prazo das apostas e conferidas depois dos jogos.</p>`;
    return;
  }
  const done = rounds.filter(r => r.result);
  const pending = rounds.filter(r => !r.result);
  const games = done.reduce((a, r) => a + r.result.games, 0);
  const hits = done.reduce((a, r) => a + r.result.hits, 0);
  let html = '';
  if (done.length) {
    html += `
      <div class="lt-bet-summary lt-reg-summary">
        <div class="lt-kpi"><span>${pct(hits / games)}</span>de acerto (${hits} de ${games} jogos)</div>
        <div class="lt-kpi"><span>${(hits / done.length).toFixed(1).replace('.', ',')}</span>acertos por concurso</div>
        <div class="lt-kpi"><span>${done.length}</span>concurso${done.length > 1 ? 's' : ''} conferido${done.length > 1 ? 's' : ''}</div>
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
            <td>${esc(fmtDate(r.first_registered_at))} ${esc((r.first_registered_at || '').slice(11))}${r.registered_at !== r.first_registered_at ? `<br><small>atualizada em ${esc(fmtDate(r.registered_at))} ${esc((r.registered_at || '').slice(11))}</small>` : ''}</td>
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

// Confere no navegador concursos registrados que já têm resultado na Caixa
function checkRegistryInBrowser(reg) {
  const today = new Date().toISOString().slice(0, 10);
  const pending = (reg?.rounds || []).filter(r => !r.result && r.games.every(g => (g.date || '') < today));
  pending.slice(0, 3).forEach(r => {
    fetch(`https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca/${r.number}`, { headers: { Accept: 'application/json' } })
      .then(x => (x.ok ? x.json() : Promise.reject()))
      .then(d => {
        const list = d.listaResultadoEquipeEsportiva || [];
        if (Number(d.numero) !== Number(r.number) || !list.length) return;
        const outcome = new Map(list.map(g => [g.nuSequencial,
          g.nuGolEquipeUm > g.nuGolEquipeDois ? '1' : g.nuGolEquipeUm === g.nuGolEquipeDois ? 'X' : '2']));
        const scored = r.games.filter(g => outcome.has(g.seq));
        if (!scored.length) return;
        scored.forEach(g => { g.outcome = outcome.get(g.seq); g.hit = g.pick === g.outcome; });
        const hits = scored.filter(g => g.hit).length;
        const withOdds = scored.filter(g => g.source === 'odds');
        r.result = { games: scored.length, hits, pct: hits / scored.length,
          hits_odds: withOdds.filter(g => g.hit).length, games_odds: withOdds.length };
        r.checked_in_browser = true;
        renderRegistry(reg);
      })
      .catch(() => { /* resultado ainda não publicado */ });
  });
}

// ── Inicialização ────────────────────────────────────────────────
function applyRounds(rounds) {
  state.rounds = rounds || [];
  state.current = Math.min(state.current, Math.max(state.rounds.length - 1, 0));
  renderMeta();
  renderTabs();
  renderRound();
  renderBuilder();
}

// A programação é consultada direto na Caixa pelo navegador (a API permite CORS):
// assim a página mostra o concurso certo mesmo que o build não tenha acessado a Caixa.
function refreshFromCaixa() {
  fetch(PROGRAMACAO_URL, { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : Promise.reject()))
    .then(list => {
      const live = roundsFromCaixa(list);
      if (!live.length) return;
      const built = state.rounds.map(r => r.number).join(',');
      if (live.map(r => r.number).join(',') !== built) applyRounds(live);
    })
    .catch(() => { /* mantém a programação do build */ });
}

function init(d) {
  state.data = d;
  state.teamsByKey = new Map((d.teams || []).map(t => [t.key, t]));
  loadPrefs();
  setupBuilder();
  applyRounds(d.rounds || []);
  renderBacktest(d);
  refreshFromCaixa();
  fetch('./loteca_registro.json')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .then(reg => { renderRegistry(reg); checkRegistryInBrowser(reg); });

  const tabs = document.getElementById('round-tabs');
  tabs.addEventListener('click', e => { const b = e.target.closest('.lt-tab'); if (b) selectRound(+b.dataset.i); });
  tabs.addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step || state.rounds.length < 2) return;
    e.preventDefault();
    const next = (state.current + step + state.rounds.length) % state.rounds.length;
    selectRound(next);
    document.getElementById(`tab-${next}`)?.focus();
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
