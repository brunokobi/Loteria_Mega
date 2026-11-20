// Hero da Mega-Sena: aurora + bolinhas flutuantes + física do mouse + parallax.

interface AuroraSpec { w: number; h: number; x: number; y: number; c: string; dur: number; tx: string; ty: string; spd: number; depth: number }
interface BallSpec { n: number; x: number; y: number; s: number; o: number; dur: number; dl: number; dy: number; dr: number }

const AURORA: AuroraSpec[] = [
  { w: 700, h: 520, x: -8, y: -35, c: '#f6c549', dur: 14, tx: '7%', ty: '9%', spd: 0.07, depth: 0.50 },
  { w: 560, h: 560, x: 58, y: -15, c: '#7c3aed', dur: 18, tx: '-7%', ty: '6%', spd: 0.04, depth: 0.30 },
  { w: 440, h: 440, x: 22, y: 42, c: '#1d4ed8', dur: 11, tx: '5%', ty: '-7%', spd: 0.06, depth: 0.40 },
  { w: 320, h: 320, x: 72, y: 55, c: '#059669', dur: 16, tx: '-4%', ty: '5%', spd: 0.05, depth: 0.20 },
];

const BALLS: BallSpec[] = [
  { n: 10, x: 6, y: 14, s: 38, o: 0.20, dur: 4.6, dl: -0.0, dy: -12, dr: 8 },
  { n: 23, x: 87, y: 18, s: 28, o: 0.14, dur: 5.3, dl: -1.2, dy: -9, dr: -7 },
  { n: 41, x: 14, y: 62, s: 44, o: 0.22, dur: 3.9, dl: -2.8, dy: -14, dr: 11 },
  { n: 52, x: 83, y: 68, s: 24, o: 0.11, dur: 6.1, dl: -0.5, dy: -7, dr: -10 },
  { n: 4, x: 44, y: 88, s: 40, o: 0.16, dur: 4.9, dl: -3.4, dy: -13, dr: 6 },
  { n: 33, x: 3, y: 44, s: 30, o: 0.18, dur: 5.6, dl: -1.8, dy: -10, dr: -8 },
  { n: 7, x: 91, y: 48, s: 34, o: 0.13, dur: 3.6, dl: -0.3, dy: -11, dr: 14 },
  { n: 18, x: 29, y: 8, s: 22, o: 0.09, dur: 5.9, dl: -2.1, dy: -7, dr: -5 },
  { n: 59, x: 64, y: 6, s: 46, o: 0.19, dur: 4.3, dl: -1.5, dy: -15, dr: 9 },
  { n: 36, x: 54, y: 74, s: 26, o: 0.12, dur: 6.6, dl: -3.0, dy: -8, dr: -12 },
  { n: 45, x: 73, y: 32, s: 36, o: 0.17, dur: 5.1, dl: -0.8, dy: -12, dr: 7 },
  { n: 2, x: 19, y: 80, s: 20, o: 0.08, dur: 4.1, dl: -2.4, dy: -6, dr: -9 },
  { n: 27, x: 38, y: 50, s: 32, o: 0.10, dur: 5.7, dl: -1.0, dy: -10, dr: 12 },
  { n: 15, x: 78, y: 85, s: 42, o: 0.15, dur: 3.8, dl: -3.8, dy: -13, dr: -6 },
];

// Física
const R_RADIUS = 140, R_FORCE = 5000, SPRING = 0.055, DAMP = 0.76;
const TILT = 20; // amplitude da inclinação da aurora (px)

export function initHero(): void {
  const bg = document.getElementById('hero-bg');
  const heroEl = document.querySelector<HTMLElement>('.hero');
  const glowEl = document.getElementById('hero-glow');
  if (!bg || !heroEl) return;

  const auroras = AURORA.map(a => {
    const el = document.createElement('div');
    el.className = 'aurora-orb';
    el.style.cssText = `width:${a.w}px;height:${a.h}px;left:${a.x}%;top:${a.y}%;background:${a.c};--dur:${a.dur}s;--tx:${a.tx};--ty:${a.ty}`;
    bg.appendChild(el);
    return { el, spd: a.spd, depth: a.depth, sy: 0, tx: 0, ty: 0 };
  });

  const balls = BALLS.map(({ n, x, y, s, o, dur, dl, dy, dr }) => {
    const wrap = document.createElement('div');
    wrap.className = 'hero-ball-wrap';
    wrap.style.cssText = `left:${x}%;top:${y}%`;

    const inner = document.createElement('div');
    inner.className = 'hero-ball-bg';
    inner.textContent = String(n);
    inner.style.cssText = `width:${s}px;height:${s}px;font-size:${Math.round(s * 0.38)}px;opacity:${o};--dur:${dur}s;--delay:${dl}s;--dy:${dy}px;--dr:${dr}deg`;

    wrap.appendChild(inner);
    bg.appendChild(wrap);

    return { el: wrap, bx: x, by: y, spd: 0.08 + s / 200, ox: 0, oy: 0, vx: 0, vy: 0, sy: 0 };
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let mx = -9999, my = -9999, inHero = false;
  let loopId: number | null = null;

  const applyBalls = () => {
    balls.forEach(b => {
      b.el.style.transform = `translateY(${b.sy}px) translate(${b.ox.toFixed(2)}px,${b.oy.toFixed(2)}px)`;
    });
  };
  const applyAuroras = () => {
    auroras.forEach(a => {
      a.el.style.transform = `translateY(${a.sy}px) translate(${a.tx.toFixed(1)}px,${a.ty.toFixed(1)}px)`;
    });
  };
  const atRest = () => balls.every(b =>
    Math.abs(b.ox) < 0.25 && Math.abs(b.oy) < 0.25 &&
    Math.abs(b.vx) < 0.08 && Math.abs(b.vy) < 0.08);

  const physicsLoop = () => {
    const rect = heroEl.getBoundingClientRect();
    balls.forEach(b => {
      const bx = rect.left + (b.bx / 100) * rect.width + b.ox;
      const by = rect.top + (b.by / 100) * rect.height + b.oy + b.sy;
      if (inHero) {
        const dx = bx - mx, dy = by - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
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
  };
  const startLoop = () => { if (!loopId) loopId = requestAnimationFrame(physicsLoop); };

  heroEl.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (!inHero) { inHero = true; startLoop(); }

    // Brilho centralizado no cursor
    const rect = heroEl.getBoundingClientRect();
    if (glowEl) {
      glowEl.style.left = `${e.clientX - rect.left}px`;
      glowEl.style.top = `${e.clientY - rect.top}px`;
      glowEl.classList.add('visible');
    }

    // Inclinação da aurora
    const cx = (e.clientX - rect.left) / rect.width - 0.5;
    const cy = (e.clientY - rect.top) / rect.height - 0.5;
    auroras.forEach(a => {
      a.tx = cx * TILT * a.depth;
      a.ty = cy * TILT * a.depth * 0.65;
    });
    applyAuroras();
  }, { passive: true });

  heroEl.addEventListener('mouseleave', () => {
    mx = -9999; my = -9999; inHero = false;
    startLoop();
    glowEl?.classList.remove('visible');
    auroras.forEach(a => {
      a.tx = 0; a.ty = 0;
      a.el.style.transition = 'transform 1.4s ease';
      a.el.style.transform = `translateY(${a.sy}px)`;
      setTimeout(() => { a.el.style.transition = ''; }, 1400);
    });
  }, { passive: true });

  // Parallax no scroll
  let sraf: number | null = null;
  window.addEventListener('scroll', () => {
    if (sraf) return;
    sraf = requestAnimationFrame(() => {
      const scrollY = window.scrollY;
      balls.forEach(b => { b.sy = scrollY * b.spd; });
      auroras.forEach(a => { a.sy = scrollY * a.spd; });
      if (!loopId) applyBalls();
      applyAuroras();
      sraf = null;
    });
  }, { passive: true });
}
