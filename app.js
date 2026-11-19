// ── Hero: aurora + balls + mouse physics + parallax ────────────
(function initHero() {
  const bg     = document.getElementById('hero-bg');
  const heroEl = document.querySelector('.hero');
  if (!bg || !heroEl) return;

  // ── Aurora orbs ──────────────────────────────────────────────
  const AURORA = [
    { w:700, h:520, x:-8,  y:-35, c:'#f6c549', dur:14, tx:'7%',  ty:'9%',  spd:0.07, depth:0.50 },
    { w:560, h:560, x:58,  y:-15, c:'#7c3aed', dur:18, tx:'-7%', ty:'6%',  spd:0.04, depth:0.30 },
    { w:440, h:440, x:22,  y:42,  c:'#1d4ed8', dur:11, tx:'5%',  ty:'-7%', spd:0.06, depth:0.40 },
    { w:320, h:320, x:72,  y:55,  c:'#059669', dur:16, tx:'-4%', ty:'5%',  spd:0.05, depth:0.20 },
  ];
  const auroras = AURORA.map(a => {
    const el = document.createElement('div');
    el.className = 'aurora-orb';
    el.style.cssText = `width:${a.w}px;height:${a.h}px;left:${a.x}%;top:${a.y}%;background:${a.c};--dur:${a.dur}s;--tx:${a.tx};--ty:${a.ty}`;
    bg.appendChild(el);
    return { el, spd: a.spd, depth: a.depth, sy: 0, tx: 0, ty: 0 };
  });

  // ── Balls ────────────────────────────────────────────────────
  const BALLS = [
    { n:10, x:6,  y:14, s:38, o:0.20, dur:4.6, dl:-0.0, dy:-12, dr:8   },
    { n:23, x:87, y:18, s:28, o:0.14, dur:5.3, dl:-1.2, dy:-9,  dr:-7  },
    { n:41, x:14, y:62, s:44, o:0.22, dur:3.9, dl:-2.8, dy:-14, dr:11  },
    { n:52, x:83, y:68, s:24, o:0.11, dur:6.1, dl:-0.5, dy:-7,  dr:-10 },
    { n:4,  x:44, y:88, s:40, o:0.16, dur:4.9, dl:-3.4, dy:-13, dr:6   },
    { n:33, x:3,  y:44, s:30, o:0.18, dur:5.6, dl:-1.8, dy:-10, dr:-8  },
    { n:7,  x:91, y:48, s:34, o:0.13, dur:3.6, dl:-0.3, dy:-11, dr:14  },
    { n:18, x:29, y:8,  s:22, o:0.09, dur:5.9, dl:-2.1, dy:-7,  dr:-5  },
    { n:59, x:64, y:6,  s:46, o:0.19, dur:4.3, dl:-1.5, dy:-15, dr:9   },
    { n:36, x:54, y:74, s:26, o:0.12, dur:6.6, dl:-3.0, dy:-8,  dr:-12 },
    { n:45, x:73, y:32, s:36, o:0.17, dur:5.1, dl:-0.8, dy:-12, dr:7   },
    { n:2,  x:19, y:80, s:20, o:0.08, dur:4.1, dl:-2.4, dy:-6,  dr:-9  },
    { n:27, x:38, y:50, s:32, o:0.10, dur:5.7, dl:-1.0, dy:-10, dr:12  },
    { n:15, x:78, y:85, s:42, o:0.15, dur:3.8, dl:-3.8, dy:-13, dr:-6  },
  ];
  const balls = BALLS.map(({ n, x, y, s, o, dur, dl, dy, dr }) => {
    const wrap = document.createElement('div');
    wrap.className = 'hero-ball-wrap';
    wrap.style.cssText = `left:${x}%;top:${y}%`;

    const inner = document.createElement('div');
    inner.className = 'hero-ball-bg';
    inner.textContent = n;
    inner.style.cssText = `width:${s}px;height:${s}px;font-size:${Math.round(s*.38)}px;opacity:${o};--dur:${dur}s;--delay:${dl}s;--dy:${dy}px;--dr:${dr}deg`;

    wrap.appendChild(inner);
    bg.appendChild(wrap);

    return { el: wrap, bx: x, by: y, spd: 0.08 + s/200,
             ox:0, oy:0, vx:0, vy:0, sy:0 };
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // ── Physics constants ────────────────────────────────────────
  const R_RADIUS = 140, R_FORCE = 5000, SPRING = 0.055, DAMP = 0.76;
  const TILT = 20; // aurora tilt amplitude px

  // ── State ────────────────────────────────────────────────────
  let mx = -9999, my = -9999, inHero = false;
  let loopId = null, scrollY = 0;

  function applyBalls() {
    balls.forEach(b => {
      b.el.style.transform = `translateY(${b.sy}px) translate(${b.ox.toFixed(2)}px,${b.oy.toFixed(2)}px)`;
    });
  }
  function applyAuroras() {
    auroras.forEach(a => {
      a.el.style.transform = `translateY(${a.sy}px) translate(${a.tx.toFixed(1)}px,${a.ty.toFixed(1)}px)`;
    });
  }
  function atRest() {
    return balls.every(b =>
      Math.abs(b.ox) < 0.25 && Math.abs(b.oy) < 0.25 &&
      Math.abs(b.vx) < 0.08 && Math.abs(b.vy) < 0.08
    );
  }

  function physicsLoop() {
    const rect = heroEl.getBoundingClientRect();
    balls.forEach(b => {
      const bx = rect.left + (b.bx / 100) * rect.width  + b.ox;
      const by = rect.top  + (b.by / 100) * rect.height + b.oy + b.sy;
      if (inHero) {
        const dx = bx - mx, dy = by - my;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < R_RADIUS && dist > 1) {
          const f = R_FORCE / (dist * dist);
          b.vx += (dx / dist) * f;
          b.vy += (dy / dist) * f;
        }
      }
      b.vx = (b.vx - SPRING * b.ox) * DAMP;
      b.vy = (b.vy - SPRING * b.oy) * DAMP;
      b.ox += b.vx;
      b.oy += b.vy;
    });
    applyBalls();
    loopId = (!inHero && atRest()) ? null : requestAnimationFrame(physicsLoop);
  }
  function startLoop() { if (!loopId) loopId = requestAnimationFrame(physicsLoop); }

  // ── Cursor glow element ──────────────────────────────────────
  const glowEl = document.getElementById('hero-glow');

  // ── Mouse events ─────────────────────────────────────────────
  heroEl.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (!inHero) { inHero = true; startLoop(); }

    // Cursor glow — centered exactly on cursor
    const rect = heroEl.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    glowEl.style.left = lx + 'px';
    glowEl.style.top  = ly + 'px';
    glowEl.classList.add('visible');

    // Aurora tilt
    const cx = (e.clientX - rect.left)  / rect.width  - 0.5;
    const cy = (e.clientY - rect.top)   / rect.height - 0.5;
    auroras.forEach(a => {
      a.tx = cx * TILT * a.depth;
      a.ty = cy * TILT * a.depth * 0.65;
    });
    applyAuroras();
  }, { passive: true });

  heroEl.addEventListener('mouseleave', () => {
    mx = -9999; my = -9999; inHero = false;
    startLoop();
    glowEl.classList.remove('visible');
    auroras.forEach(a => {
      a.tx = 0; a.ty = 0;
      a.el.style.transition = 'transform 1.4s ease';
      a.el.style.transform  = `translateY(${a.sy}px)`;
      setTimeout(() => a.el.style.transition = '', 1400);
    });
  }, { passive: true });

  // ── Scroll parallax ──────────────────────────────────────────
  let sraf = null;
  window.addEventListener('scroll', () => {
    if (sraf) return;
    sraf = requestAnimationFrame(() => {
      scrollY = window.scrollY;
      balls.forEach(b => { b.sy = scrollY * b.spd; });
      auroras.forEach(a => { a.sy = scrollY * a.spd; });
      if (!loopId) applyBalls();
      applyAuroras();
      sraf = null;
    });
  }, { passive: true });
})();

// ── Utility: heat color (0=cold/blue → 1=hot/red) ──────────────
function heatColor(t) {
  const stops = [
    [0,    [29,  78,  216]],
    [0.35, [34,  211, 160]],
    [0.65, [246, 197, 73 ]],
    [1,    [239, 68,  68 ]],
  ];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
  const f = (t - t0) / (t1 - t0);
  const ch = c0.map((v, j) => Math.round(v + (c1[j] - v) * f));
  return { bg: `rgb(${ch})`, rgb: ch };
}

// ── Formatting helpers ──────────────────────────────────────────
// '1996-03-11' -> '11/03/1996'; '2026-11-19 10:38' -> '19/11/2026 10:38'
function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(s || '');
  if (!m) return s || '—';
  return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}` : '');
}
function listPt(nums) {
  return nums.length > 1 ? `${nums.slice(0, -1).join(', ')} e ${nums[nums.length - 1]}` : String(nums[0]);
}

// Cor do texto com maior contraste (WCAG) sobre um fundo rgb
function readableText([r, g, b]) {
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#000' : '#fff';
}

// ── Render ──────────────────────────────────────────────────────
function render(d) {
  const { meta, combinations, numbers, even_odd, decades, sum_stats, consecutive, validation } = d;

  // Meta pills
  document.getElementById('meta-pills').innerHTML = `
    <div class="meta-pill"><strong>${meta.total_draws.toLocaleString('pt-BR')}</strong> sorteios</div>
    <div class="meta-pill"><strong>${fmtDate(meta.date_start)}</strong> a <strong>${fmtDate(meta.date_end)}</strong></div>
    <div class="meta-pill">Gerado em <strong>${fmtDate(meta.generated_at)}</strong></div>
  `;
  document.getElementById('gen-date').textContent = fmtDate(meta.generated_at);

  // Quick stats
  const years = new Date(meta.date_end).getFullYear() - new Date(meta.date_start).getFullYear();
  document.getElementById('qs-grid').innerHTML = [
    [meta.total_draws.toLocaleString('pt-BR'), 'Sorteios históricos'],
    [years + '+',                               'Anos de dados'],
    [validation.auc_model.toFixed(4),           'AUC-ROC do modelo'],
    [even_odd.even_pct + '%',                   'Números pares sorteados'],
    [sum_stats.mean,                             'Soma média por sorteio'],
    [consecutive.none_pct + '%',                'Sorteios sem consecutivos'],
  ].map(([v, l]) => `
    <div class="qs-card" role="listitem">
      <div class="qs-val">${v}</div>
      <div class="qs-lbl">${l}</div>
    </div>
  `).join('');

  // Combinations
  const maxS = combinations[0].score;
  const minS = combinations[combinations.length - 1].score;
  const rng  = maxS - minS || 0.001;
  document.getElementById('combo-grid').innerHTML = combinations.map((c, i) => {
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

  // Even / Odd
  document.getElementById('even-odd').innerHTML = `
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

  // Decades
  const maxPct = Math.max(...decades.map(d => d.pct));
  document.getElementById('decades').innerHTML = decades.map(d => `
    <div class="decade-row">
      <div class="decade-lbl">${d.label}</div>
      <div class="decade-bar-wrap" aria-hidden="true">
        <div class="decade-bar-fill" style="width:${(d.pct / maxPct * 100).toFixed(1)}%"></div>
      </div>
      <div class="decade-pct">${d.pct}%</div>
    </div>
  `).join('');

  // Sum stats
  document.getElementById('sum-stats').innerHTML = `
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

  // AUC card
  const diff = (validation.auc_model - validation.auc_baseline).toFixed(4);
  const sign = diff >= 0 ? '+' : '';
  document.getElementById('auc-card').innerHTML = `
    <h3>AUC-ROC — validação temporal</h3>
    <div class="auc-value">${validation.auc_model.toFixed(4)}</div>
    <div class="auc-sub">
      Treino: ${validation.train_draws.toLocaleString('pt-BR')} sorteios
      &nbsp;·&nbsp;
      Teste: ${validation.test_draws.toLocaleString('pt-BR')} sorteios
    </div>
    <div class="auc-verdict">
      Diferença vs baseline constante: <strong>${sign}${diff}</strong><br><br>
      AUC próximo de 0,5 significa que o modelo <strong>não supera o acaso</strong>.
      Isso é esperado e confirma a integridade estatística da loteria.
    </div>
  `;

  renderValidationExtra(validation);

  // Feature importance
  const maxImp = validation.feature_importance[0].value;
  document.getElementById('feat-list').innerHTML = validation.feature_importance.map(f => `
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

  // Balanced combinations & strategies
  renderBalanced(d.balanced_combinations);
  renderStrategies(d.strategies);

  // Show app
  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').classList.add('ready');
}

// ── Frequency heatmap (botoes com tabindex movel e setas) ───────
function renderHeatmap(numbers, totalDraws) {
  const grid   = document.getElementById('freq-heatmap');
  const detail = document.getElementById('freq-detail');
  const freqs  = numbers.map(n => n.freq);
  const fMin = Math.min(...freqs), fMax = Math.max(...freqs);
  const describe = n =>
    `Número ${n.n}: sorteado ${n.freq} vezes (${n.pct.toLocaleString('pt-BR')}% dos ${totalDraws.toLocaleString('pt-BR')} sorteios)` +
    (n.delay != null ? `, ${n.delay === 0 ? 'saiu no último sorteio' : `há ${n.delay} sorteios sem sair`}` : '');

  grid.innerHTML = numbers.map((n, i) => {
    const t = fMax > fMin ? (n.freq - fMin) / (fMax - fMin) : 0.5;
    const { rgb } = heatColor(t);
    return `
      <button type="button" class="freq-cell" data-i="${i}" tabindex="${i === 0 ? 0 : -1}"
              aria-pressed="false" aria-label="${describe(n)}" title="${describe(n)}"
              style="background:rgb(${rgb});color:${readableText(rgb)}">
        <span class="fc-n" aria-hidden="true">${n.n}</span>
        <span class="fc-f" aria-hidden="true">${n.freq}x</span>
      </button>
    `;
  }).join('');

  const cells = [...grid.querySelectorAll('.freq-cell')];
  let current = 0;
  const select = (i, focus) => {
    cells[current].tabIndex = -1;
    cells[current].setAttribute('aria-pressed', 'false');
    current = i;
    cells[i].tabIndex = 0;
    cells[i].setAttribute('aria-pressed', 'true');
    if (focus) cells[i].focus();
    const n = numbers[i];
    detail.innerHTML = describe(n).replace(/^Número (\d+)/, '<strong>Número $1</strong>');
  };
  const columns = () => getComputedStyle(grid).gridTemplateColumns.split(' ').length;

  grid.onclick = e => { const c = e.target.closest('.freq-cell'); if (c) select(+c.dataset.i, false); };
  grid.onmouseover = e => { const c = e.target.closest('.freq-cell'); if (c) select(+c.dataset.i, false); };
  grid.onkeydown = e => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() }[e.key];
    let next = null;
    if (step) next = Math.min(cells.length - 1, Math.max(0, current + step));
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = cells.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
  };
  detail.textContent = 'Selecione um número para ver os detalhes.';
}

// ── Render balanced combinations ────────────────────────────────
function renderBalanced(items) {
  document.getElementById('balanced-grid').innerHTML = items.map((c, i) => `
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

// ── Render holdout / walk-forward metrics ────────────────────────
function renderValidationExtra(validation) {
  const box = document.getElementById('val-extra');
  const hold = validation?.holdout;
  const wf = validation?.walk_forward;
  if (!hold && !wf) { box.style.display = 'none'; box.innerHTML = ''; return; }

  const f4 = v => (typeof v === 'number' ? v.toFixed(4) : '—');
  const PRED = [
    ['model', 'Modelo', 'model'],
    ['baseline_constant', 'Baseline constante (p=0.1)', ''],
    ['baseline_frequency', 'Baseline frequência', '']
  ];
  let html = '';

  if (hold) {
    const rows = PRED.filter(([k]) => hold[k]).map(([k, label, cls]) => `
      <tr class="${cls}">
        <th scope="row">${label}</th>
        <td>${f4(hold[k].auc)}</td>
        <td>${f4(hold[k].log_loss)}</td>
        <td>${f4(hold[k].brier)}</td>
      </tr>`).join('');
    html += `
      <h3>Holdout 80/20 — Modelo vs Baselines</h3>
      <table class="metric-table">
        <thead><tr><th scope="col">Preditor</th><th scope="col">AUC</th><th scope="col">Log loss</th><th scope="col">Brier</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="val-note">Menor log loss e Brier = melhor. AUC 0,5 = sem poder preditivo.</div>`;
  }

  const sum = wf?.summary;
  if (sum) {
    const ms = (o) => (o && typeof o.mean === 'number')
      ? `${o.mean.toFixed(4)}<span class="pm">± ${(o.std ?? 0).toFixed(4)}</span>` : '—';
    const rows = PRED.filter(([k]) => sum[k]).map(([k, label, cls]) => `
      <tr class="${cls}">
        <th scope="row">${label}</th>
        <td>${ms(sum[k].auc)}</td>
        <td>${ms(sum[k].log_loss)}</td>
        <td>${ms(sum[k].brier)}</td>
      </tr>`).join('');
    html += `
      <h3>Walk-forward — média ± desvio (${wf.n_folds ?? wf.folds?.length ?? '?'} folds)</h3>
      <table class="metric-table">
        <thead><tr><th scope="col">Preditor</th><th scope="col">AUC</th><th scope="col">Log loss</th><th scope="col">Brier</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="val-note">Janela expansiva: cada fold treina com o passado e testa no bloco seguinte.</div>`;
  }

  box.innerHTML = html;
  box.style.display = html ? '' : 'none';
}

// ── Render strategy comparison ───────────────────────────────────
function renderStrategies(strat) {
  const COLORS = {
    'Aleatoria': 'var(--sub)',   'Quentes': 'var(--red)',
    'Frias':     'var(--blue)',  'Balanceada': 'var(--green)'
  };
  const DESCS = {
    'Aleatoria':  '6 números escolhidos ao acaso',
    'Quentes':    strat.expected ? 'Os 6 mais frequentes até o sorteio anterior' : 'Os 6 números mais frequentes',
    'Frias':      strat.expected ? 'Os 6 menos frequentes até o sorteio anterior' : 'Os 6 números menos frequentes',
    'Balanceada': 'Critérios: soma, paridade, décadas'
  };
  const LABEL = name => ({ 'Aleatoria': 'Aleatória' })[name] || name;
  const maxAvg = Math.max(...Object.values(strat.results).map(r => r.avg_hits));
  const expected = strat.expected;
  const theoreticalNum = expected?.mean_hits ?? (6 * 6 / 60);
  const theoretical = theoreticalNum.toFixed(3);
  const ciOf = r => (Array.isArray(r.ci95) && r.ci95.length === 2) ? r.ci95 : null;
  const hasCi = Object.values(strat.results).every(r => ciOf(r));
  const inside = r => { const c = ciOf(r); return c && c[0] <= theoreticalNum && theoreticalNum <= c[1]; };
  const allInside = hasCi && Object.values(strat.results).every(inside);
  const outside = hasCi ? Object.entries(strat.results).filter(([, r]) => !inside(r)).map(([n]) => n) : [];
  const ec = expected?.expected_counts;
  const expRow = ec ? `
        <div class="strat-row strat-expected">
          <div>
            <div class="strat-name" style="color:var(--gold)">Esperado</div>
            <div class="strat-desc">Teoria (hipergeométrica) em ${strat.draws_tested} sorteios</div>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="strat-bar-wrap" style="flex:1" aria-hidden="true">
                <div class="strat-bar-fill" style="width:${(theoreticalNum/maxAvg*100).toFixed(1)}%;background:var(--gold)"></div>
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
  const above = hasCi ? Object.entries(strat.results).filter(([, r]) => ciOf(r)[0] > theoreticalNum).map(([n]) => n) : [];
  const below = outside.filter(n => !above.includes(n));
  const verdict = !hasCi
    ? `Nenhuma estratégia superou as outras de forma significativa.`
    : allInside
      ? `O valor esperado (${theoretical}) está dentro do intervalo de confiança de 95% de todas as estratégias:
      <strong>as diferenças observadas são indistinguíveis do acaso</strong>.`
      : [
          above.length
            ? `<strong>${above.map(LABEL).join(', ')}</strong> ficou acima do esperado (${theoretical}) pelo IC95%.`
            : `<strong>Nenhuma estratégia acertou significativamente mais que o acaso</strong> (esperado: ${theoretical}).`,
          below.length
            ? `${below.map(LABEL).join(', ')} ficou abaixo do esperado.`
            : '',
          `Com ${Object.keys(strat.results).length} estratégias testadas, um desvio isolado como esse é comum por puro acaso.`
        ].filter(Boolean).join(' ');

  document.getElementById('strat-content').innerHTML = `
    <div class="strat-header" aria-hidden="true">
      <div>Estratégia</div>
      <div>Média de acertos / sorteio</div>
      <div style="text-align:center">3 ac.</div>
      <div style="text-align:center">Quadra</div>
      <div style="text-align:center">Quina</div>
      <div style="text-align:center">Sena</div>
    </div>
    <div class="strat-grid">
      ${Object.entries(strat.results).map(([name, r]) => `
        <div class="strat-row">
          <div>
            <div class="strat-name" style="color:${COLORS[name]}">${LABEL(name)}</div>
            <div class="strat-desc">${DESCS[name]}</div>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="strat-bar-wrap" style="flex:1" aria-hidden="true">
                <div class="strat-bar-fill" style="width:${(r.avg_hits/maxAvg*100).toFixed(1)}%;background:${COLORS[name]}"></div>
              </div>
              <span style="font-size:13px;font-variant-numeric:tabular-nums;color:var(--sub);width:36px">${r.avg_hits}</span>
            </div>
            ${ciOf(r) ? `<div class="strat-ci">IC95% [${ciOf(r)[0].toFixed(3)} ; ${ciOf(r)[1].toFixed(3)}]${r.std_hits != null ? ` · desvio ${Number(r.std_hits).toFixed(3)}` : ''}</div>` : ''}
          </div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--sub)">${r.tres}</div><div class="strat-stat-lbl"><abbr title="3 acertos">3 ac.</abbr></div></div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--gold)">${r.quadra}</div><div class="strat-stat-lbl">Quadra</div></div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--green)">${r.quina}</div><div class="strat-stat-lbl">Quina</div></div>
          <div class="strat-stat"><div class="strat-stat-val" style="color:var(--red)">${r.sena}</div><div class="strat-stat-lbl">Sena</div></div>
        </div>
      `).join('')}${expRow}
    </div>
    <div class="insight-box">
      <strong>Conclusão:</strong> Em ${strat.draws_tested} sorteios reais, as estratégias acertaram em média
      entre <strong>${Math.min(...Object.values(strat.results).map(r => r.avg_hits)).toFixed(3)}</strong> e
      <strong>${maxAvg.toFixed(3)}</strong> números por sorteio — em torno dos ${theoretical} previstos pela teoria da probabilidade (6×6/60).
      <br><br>
      ${verdict}
      <strong>É exatamente o que se espera de um processo aleatório</strong> —
      não existe sistema, método ou IA capaz de aumentar suas chances reais de ganhar.
    </div>
  `;
}

// ── Build progress ──────────────────────────────────────────────
let currentGeneratedAt = null;
let pollTimer = null;
let elapsedTimer = null;
let elapsedSec = 0;
// Tempo estimado do build (~2 min de analise + instalacao); a barra vai ate 95% antes de terminar
const BUILD_EST = 240;
// Abandona o acompanhamento se o build passar deste tempo (segundos)
const BUILD_TIMEOUT_SEC = 600;

function fmt(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${String(sec).padStart(2,'0')}s` : `${sec}s`;
}

function showBanner(text) {
  document.getElementById('build-banner').className = 'build-banner show';
  document.getElementById('build-text').innerHTML = text;
}

// Unica rotina de limpeza: para timers, reabilita o botao e restaura o icone
function stopBuildProgress() {
  clearInterval(elapsedTimer);
  clearInterval(pollTimer);
  elapsedTimer = null;
  pollTimer = null;
  const btn = document.getElementById('update-btn');
  btn.disabled = false;
  btn.removeAttribute('aria-busy');
  btn.classList.remove('loading');
  btn.querySelector('.btn-icon').textContent = '↻';
}

function startBuildProgress() {
  elapsedSec = 0;
  const banner = document.getElementById('build-banner');
  const bar    = document.getElementById('build-bar');
  banner.className = 'build-banner show';

  elapsedTimer = setInterval(() => {
    elapsedSec++;
    if (elapsedSec >= BUILD_TIMEOUT_SEC) {
      stopBuildProgress();
      const msg = 'O build demorou mais de 10 min. Verifique o painel do Netlify e tente novamente.';
      banner.className = 'build-banner show error';
      document.getElementById('build-text').textContent = msg;
      const toast = document.getElementById('update-toast');
      toast.textContent = '✗ ' + msg;
      toast.className = 'update-toast err show';
      setTimeout(() => {
        if (banner.classList.contains('error')) banner.className = 'build-banner';
      }, 10000);
      return;
    }
    const pct = Math.min(95, (elapsedSec / BUILD_EST) * 100).toFixed(1);
    bar.style.width = pct + '%';
    document.getElementById('build-text').innerHTML =
      `Atualizando dados e treinando o modelo... <strong>${fmt(elapsedSec)}</strong>`;
  }, 1000);

  // Poll results.json a cada 15s para detectar quando o build terminar
  pollTimer = setInterval(() => {
    fetch('./results.json?t=' + Date.now())
      .then(r => r.json())
      .then(data => {
        if (data.meta.generated_at !== currentGeneratedAt) {
          buildFinished(data);
        }
      })
      .catch(() => {}); // ignora erros durante o build
  }, 15000);
}

function buildFinished(data) {
  stopBuildProgress();

  const banner = document.getElementById('build-banner');
  banner.className = 'build-banner show done';
  document.getElementById('build-text').innerHTML =
    `Análise atualizada em <strong>${fmt(elapsedSec)}</strong>!`;

  // Recarrega os dados na pagina
  render(data);
  currentGeneratedAt = data.meta.generated_at;

  // Oculta o banner apos 4s
  setTimeout(() => { banner.className = 'build-banner'; }, 4000);
}

// ── Trigger new build ───────────────────────────────────────────
function triggerBuild() {
  const btn   = document.getElementById('update-btn');
  const toast = document.getElementById('update-toast');

  stopBuildProgress();
  document.getElementById('build-banner').className = 'build-banner';
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.classList.add('loading');
  toast.className = 'update-toast';
  toast.textContent = '';

  fetch('/.netlify/functions/trigger-build', { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        startBuildProgress();
      } else {
        toast.textContent = '✗ ' + (data.error || 'Erro desconhecido');
        toast.className = 'update-toast err show';
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.classList.remove('loading');
      }
    })
    .catch(() => {
      toast.textContent = '✗ Não foi possível conectar. Verifique se está no Netlify.';
      toast.className = 'update-toast err show';
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.classList.remove('loading');
    });
}

document.getElementById('update-btn').addEventListener('click', triggerBuild);

// ── Fetch data ──────────────────────────────────────────────────
fetch('./results.json')
  .then(r => {
    if (!r.ok) throw new Error('not found');
    return r.json();
  })
  .then(data => {
    currentGeneratedAt = data.meta.generated_at;
    render(data);
  })
  .catch(() => {
    document.getElementById('loading').innerHTML = `
      <div style="text-align:center;padding:40px;max-width:480px">
        <div style="font-size:48px;margin-bottom:20px">⚠️</div>
        <h2 style="font-size:22px;margin-bottom:12px;color:#f1f5f9">results.json não encontrado</h2>
        <p style="color:#64748b;margin-bottom:24px;font-size:14px">
          Execute o script para gerar os dados antes de abrir a interface:
        </p>
        <code style="
          background:#0e1220;border:1px solid rgba(255,255,255,0.1);
          border-radius:8px;padding:12px 20px;display:inline-block;
          font-family:'JetBrains Mono',monospace;font-size:14px;color:#22d3a0
        ">python generate_results.py</code>
      </div>
    `;
  });
