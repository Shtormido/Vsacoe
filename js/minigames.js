// Мини-игры для действий. Результат 0..1 влияет на шанс успеха.
const MG_W = 320, MG_H = 160;
const MG = {};   // описания игр, заполняются ниже

const MiniGame = {
  // итоговый шанс: базовый ± мастерство игрока
  chance(base, score) { return clamp(base + (score - 0.5) * 0.9, 0.05, 0.98); },

  play(id, o = {}) {
    const def = MG[id];
    return new Promise(resolve => {
      const speed = o.haste ? 1.35 : 1;
      const th = id === 'redlight' ? RL_THEMES[o.theme || 'hide'] : {};
      UI.open(`<div class="mg">${menuHead(`<div class="st-badge mg-ico">${th.icon || def.icon}</div>`, o.title || th.title || def.title, o.help || th.help || def.help)}
        <div class="mg-stage" id="mg-stage"><canvas id="mg-cv" width="${MG_W}" height="${MG_H}"></canvas><div id="mg-msg" class="mg-msg">Приготовься…</div></div>
        <div class="mg-hud"><span id="mg-status"></span><span class="mg-keys">${def.keys}</span></div></div>`, {}, { cls: 'm-mini' });
      const cv = document.getElementById('mg-cv'), ctx = cv.getContext('2d'), stage = document.getElementById('mg-stage');
      ctx.imageSmoothingEnabled = false;
      const msg = document.getElementById('mg-msg'), status = document.getElementById('mg-status');
      const st = Object.assign({ t: 0, score: 0, over: false, speed, o, held: {}, mx: MG_W / 2, my: MG_H / 2, mdown: false, mouse: false, cd: 1.1, parts: [], fx: null }, def.init(o, speed));
      // всплывающая надпись поверх холста
      st.pop = (text, x, y, cls = '') => {
        const el = document.createElement('div'); el.className = 'mg-pop ' + cls; el.textContent = text;
        el.style.left = (x / MG_W * 100) + '%'; el.style.top = (y / MG_H * 100) + '%';
        stage.appendChild(el); setTimeout(() => el.remove(), 900);
      };
      st.flash = (col, a = 0.35) => { st.fx = { col, a }; };
      const MAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'space', KeyE: 'space', Enter: 'space' };
      const down = e => {
        const k = MAP[e.code]; if (!k) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (!st.held[k] && st.started && !st.over && def.key) def.key(st, k);
        st.held[k] = true;
      };
      const up = e => { const k = MAP[e.code]; if (k) st.held[k] = false; };
      const pos = e => { const r = cv.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; st.mx = (p.clientX - r.left) / r.width * MG_W; st.my = (p.clientY - r.top) / r.height * MG_H; st.mouse = true; };
      const md = e => { pos(e); st.mdown = true; if (st.started && !st.over && def.key) def.key(st, 'space'); e.preventDefault(); };
      const mu = () => { st.mdown = false; };
      window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true);
      cv.addEventListener('mousemove', pos); cv.addEventListener('mousedown', md); window.addEventListener('mouseup', mu);
      cv.addEventListener('touchstart', md, { passive: false }); cv.addEventListener('touchmove', e => { pos(e); e.preventDefault(); }, { passive: false }); cv.addEventListener('touchend', mu);
      st.hold = () => st.held.space || st.mdown;
      let last = performance.now();
      const frame = now => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (!st.started) {
          st.cd -= dt; msg.textContent = st.cd > 0.35 ? 'Приготовься…' : 'Давай!';
          if (st.cd <= 0) { st.started = true; msg.classList.add('hide'); }
        } else if (!st.over) { st.t += dt; def.update(st, dt); }
        st.parts.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; } });
        st.parts = st.parts.filter(p => p.t < p.life);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (st.shake > 0) { st.shake -= dt; ctx.translate(rint(-2, 2), rint(-1, 1)); }
        def.draw(ctx, st);
        mgDrawParts(ctx, st);
        if (st.fx) { ctx.fillStyle = st.fx.col; ctx.globalAlpha = Math.max(0, st.fx.a); ctx.fillRect(0, 0, MG_W, MG_H); ctx.globalAlpha = 1; st.fx.a -= dt * 1.4; if (st.fx.a <= 0) st.fx = null; }
        mgVignette(ctx);
        status.textContent = def.status(st);
        if (st.over) {
          if (st.endT === undefined) {
            st.endT = 1.3; st.score = clamp(st.score, 0, 1);
            msg.classList.remove('hide');
            msg.textContent = (st.score >= 0.85 ? 'Отлично!' : st.score >= 0.5 ? 'Неплохо' : 'Провал') + ' · ' + pct(st.score);
            msg.className = 'mg-msg ' + (st.score >= 0.5 ? 'ok' : 'fail');
            Sound.sfx(st.score >= 0.5 ? 'mg_ok' : 'mg_bad');
          }
          st.endT -= dt;
          if (st.endT <= 0) {
            window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('mouseup', mu);
            UI.close(); resolve(st.score); return;
          }
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }
};

// ---------- общие рисовалки ----------
function mgPart(st, p) { st.parts.push(Object.assign({ t: 0, life: 1, vx: 0, vy: 0, size: 2, col: '#fff' }, p)); }
function mgBurst(st, x, y, n, col, sp = 40, o = {}) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), v = rnd(sp * 0.3, sp); mgPart(st, Object.assign({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.3, 0.7), col: Array.isArray(col) ? pick(col) : col, size: rint(1, 2) }, o)); } }
function mgDrawParts(ctx, st) {
  st.parts.forEach(p => {
    const k = 1 - p.t / p.life;
    ctx.globalAlpha = p.fade === false ? 1 : clamp(k * 1.6, 0, 1) * (p.alpha ?? 1);
    const s = p.grow ? Math.round(p.size + (1 - k) * p.grow) : p.size;
    if (p.round) pcirc(ctx, Math.round(p.x), Math.round(p.y), s, p.col);
    else R(ctx, p.x - s / 2, p.y - s / 2, s, s, p.col);
  });
  ctx.globalAlpha = 1;
}
function mgVignette(ctx) {
  const g = ctx.createRadialGradient(MG_W / 2, MG_H / 2, MG_H * 0.45, MG_W / 2, MG_H / 2, MG_W * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, MG_W, MG_H);
}
// стрелка 7×7 в масштабе sc
function mgArrow(ctx, x, y, dir, col, sc = 1) {
  const p = { up: [[3, 0, 1, 1], [2, 1, 3, 1], [1, 2, 5, 1], [0, 3, 7, 1], [2, 4, 3, 3]], down: [[2, 0, 3, 3], [0, 3, 7, 1], [1, 4, 5, 1], [2, 5, 3, 1], [3, 6, 1, 1]],
    left: [[0, 3, 1, 1], [1, 2, 1, 3], [2, 1, 1, 5], [3, 0, 1, 7], [4, 2, 3, 3]], right: [[0, 2, 3, 3], [3, 0, 1, 7], [4, 1, 1, 5], [5, 2, 1, 3], [6, 3, 1, 1]] }[dir];
  p.forEach(([a, b, w, h]) => R(ctx, x - 3.5 * sc + a * sc, y - 3.5 * sc + b * sc, w * sc, h * sc, col));
}
function mgBar(ctx, x, y, w, h, v, col, bg = '#2a1a20') {
  R(ctx, x - 1, y - 1, w + 2, h + 2, '#120a0e'); R(ctx, x, y, w, h, bg); R(ctx, x, y, Math.round(w * clamp(v, 0, 1)), h, col);
  R(ctx, x, y, Math.round(w * clamp(v, 0, 1)), 1, 'rgba(255,255,255,.35)');
}
// пиксельные фигуры без сглаживания
function pcirc(ctx, cx, cy, r, col) { cx = Math.round(cx); cy = Math.round(cy); for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); R(ctx, cx - w, cy + y, w * 2 + 1, 1, col); } }
function pring(ctx, cx, cy, r, th, col) {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y)), ri = r - th, wi = Math.abs(y) <= ri ? Math.round(Math.sqrt(ri * ri - y * y)) : -1;
    if (wi < 0) R(ctx, cx - w, cy + y, w * 2 + 1, 1, col); else { R(ctx, cx - w, cy + y, w - wi, 1, col); R(ctx, cx + wi + 1, cy + y, w - wi, 1, col); }
  }
}
function pline(ctx, x1, y1, x2, y2, col, th = 1) { const n = Math.max(1, Math.round(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)))); for (let i = 0; i <= n; i++) R(ctx, x1 + (x2 - x1) * i / n - th / 2, y1 + (y2 - y1) * i / n - th / 2, th, th, col); }
const DIRS = ['left', 'up', 'down', 'right'];
const _mgCache = {};
function mgCached(key, w, h, fn) { if (!_mgCache[key]) { const [c, x] = makeCanvas(w, h); fn(x); _mgCache[key] = c; } return _mgCache[key]; }

// ================= Подделка: ритм подписи =================
MG.rhythm = {
  icon: '✒', title: 'Подделка записи', keys: '← ↑ ↓ → в такт',
  help: 'Стрелки ползут к перу. Жми ту же стрелку, когда она под пером, — рука выводит чужую подпись. Промах — клякса.',
  init(o, sp) {
    const n = o.n || 8, v = 62 * sp * (o.fast ? 1.2 : 1);
    return { n, v, hitX: 176, laneY: 104, win: 11 + (o.skill || 0) * 2, notes: Array.from({ length: n }, (_, i) => ({ dir: pick(DIRS), x: 350 + i * 44 + rnd(-5, 5) })), sum: 0, done: 0, ink: [], blots: [], bob: 0, combo: 0 };
  },
  key(st, k) {
    if (!DIRS.includes(k)) return;
    const n = st.notes.find(n => !n.res && Math.abs(n.x - st.hitX) <= st.win + 6);
    if (!n) return;
    const d = Math.abs(n.x - st.hitX);
    st.bob = 0.12;
    if (n.dir === k && d <= st.win) {
      const perfect = d <= 4;
      n.res = perfect ? 'perfect' : 'good'; st.sum += perfect ? 1 : 0.7; st.combo++;
      for (let i = 0; i < 7; i++) st.ink.push({ q: perfect ? 1 : 0.7 });
      mgBurst(st, st.hitX, st.laneY, perfect ? 10 : 5, perfect ? ['#ffe070', '#ffffff'] : ['#1e2a5a', '#3a4a8a'], 30);
      st.pop(perfect ? 'Идеально!' : 'Хорошо', st.hitX, st.laneY - 24, perfect ? 'gold' : '');
      Sound.sfx(perfect ? 'mg_perfect' : 'mg_tick');
    } else MG.rhythm.miss(st, n);
    st.done++;
  },
  miss(st, n) {
    n.res = 'miss'; st.combo = 0;
    const i = st.ink.length, px0 = 196 + i * 1.3, py0 = 92 + Math.sin(i * 0.55) * 5;
    st.blots.push({ x: px0 + rnd(-2, 2), y: py0 + rnd(-2, 2), r: rint(3, 5) });
    mgBurst(st, px0, py0, 8, '#141a3a', 25, { g: 40 });
    st.pop('Клякса!', st.hitX, st.laneY - 24, 'bad'); st.flash('#3a0a10', 0.18);
    Sound.sfx('mg_bad');
  },
  update(st, dt) {
    st.bob = Math.max(0, st.bob - dt);
    st.notes.forEach(n => { n.x -= st.v * dt; if (!n.res && n.x < st.hitX - st.win - 6) { MG.rhythm.miss(st, n); st.done++; } });
    st.score = st.sum / st.n;
    if (st.done >= st.n) st.over = true;
  },
  bg() {
    return mgCached('rhythm-bg', MG_W, MG_H, x => {
      const rn = seeded(3);
      for (let y = 0; y < MG_H; y += 18) { R(x, 0, y, MG_W, 18, y % 36 ? '#6a4428' : '#704a2c'); R(x, 0, y + 17, MG_W, 1, '#4a2c18'); for (let i = 0; i < 6; i++) R(x, rn() * MG_W, y + 3 + rn() * 12, 10 + rn() * 20, 1, '#5e3c22'); }
      boxShadow(x, 10, 26, 24, 20, 0.3, 3);
      R(x, 10, 22, 24, 22, '#1a2440'); R(x, 12, 18, 20, 6, '#2a3458'); R(x, 16, 14, 12, 5, '#c8a040'); R(x, 13, 24, 3, 16, '#3a4a7a');
      boxShadow(x, 40, 10, 240, 142, 0.35, 4);
      R(x, 40, 10, 240, 142, '#8a2a1e'); R(x, 42, 8, 116, 142, '#f4ecd4'); R(x, 162, 8, 116, 142, '#f6eedc');
      for (let i = 0; i < 3; i++) { R(x, 42, 150 + i, 116, 1, '#d8ccb0'); R(x, 162, 150 + i, 116, 1, '#d8ccb0'); }
      const sp = x.createLinearGradient(146, 0, 176, 0); sp.addColorStop(0, 'rgba(0,0,0,0)'); sp.addColorStop(0.5, 'rgba(60,30,10,.35)'); sp.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = sp; x.fillRect(146, 8, 30, 142);
      [[46, 154], [166, 274]].forEach(([a, b]) => {
        R(x, a, 18, b - a, 2, '#8a3a2a');
        for (let y = 26; y < 146; y += 10) R(x, a, y, b - a, 1, '#c8d0dc');
        [a + 14, a + 64].forEach(c => R(x, c, 18, 1, 128, '#e0b0a8'));
        for (let y = 28; y < 146; y += 10) {
          if (a > 100 && y >= 96 && y < 116) continue;
          if (rn() < 0.8) { R(x, a + 3, y + 3, 6, 1, '#4a4a6a'); R(x, a + 17, y + 3, 20 + rn() * 20, 1, '#3a3a5a'); R(x, a + 67, y + 3, 10 + rn() * 20, 1, '#5a4a6a'); }
        }
      });
      R(x, 166, 96, 108, 20, 'rgba(255,230,120,.35)');
      x.strokeStyle = 'rgba(120,70,30,.25)'; x.lineWidth = 2; x.beginPath(); x.arc(90, 120, 13, 0, 7); x.stroke();
      boxShadow(x, 290, 120, 22, 14, 0.3, 3);
      R(x, 290, 118, 22, 14, '#3a2a1a'); R(x, 296, 104, 10, 16, '#6a4a2a'); R(x, 297, 104, 3, 16, '#8a6a4a'); R(x, 290, 132, 22, 3, '#a02a2a');
    });
  },
  draw(ctx, st) {
    ctx.drawImage(this.bg(), 0, 0);
    let px0 = 196, py0 = 92;
    st.ink.forEach((s, i) => {
      const x = 196 + i * 1.3, y = 92 + Math.sin(i * 0.55) * 5 + Math.sin(i * 0.17) * 3;
      pline(ctx, px0, py0, x, y, s.q >= 1 ? '#1e2a5a' : '#2a3a7a', s.q >= 1 ? 1 : 2);
      px0 = x; py0 = y;
    });
    st.blots.forEach(b => { pcirc(ctx, b.x, b.y, b.r, '#141a3a'); R(ctx, b.x - b.r - 2, b.y + 1, 2, 2, '#141a3a'); R(ctx, b.x + b.r + 1, b.y - 2, 2, 2, '#141a3a'); });
    R(ctx, 0, st.laneY - 9, MG_W, 18, 'rgba(30,20,10,.12)');
    R(ctx, st.hitX - st.win, st.laneY - 10, st.win * 2 + 1, 20, 'rgba(80,160,60,.22)');
    st.notes.forEach(n => {
      if (n.x > MG_W + 12 || n.x < -12) return;
      const near = !n.res && Math.abs(n.x - st.hitX) <= st.win;
      const base = n.res === 'perfect' ? '#3a9a2a' : n.res === 'good' ? '#5a8a3a' : n.res === 'miss' ? '#8a2a2a' : '#1e2a5a';
      const x = Math.round(n.x), y = st.laneY;
      if (near) pcirc(ctx, x, y, 10, 'rgba(255,230,120,.6)');
      pcirc(ctx, x, y + 1, 8, '#0a0e20'); pcirc(ctx, x, y, 8, base); pcirc(ctx, x - 2, y - 2, 3, 'rgba(255,255,255,.18)');
      mgArrow(ctx, x, y, n.dir, n.res === 'miss' ? '#e8a0a0' : '#f4ecd4', 1);
    });
    const b = st.bob > 0 ? 2 : 0, nx = st.hitX, ny = st.laneY - 12 + b;
    pline(ctx, nx, ny, nx + 30, ny - 34, '#1a1a22', 4); pline(ctx, nx + 1, ny - 1, nx + 29, ny - 33, '#3a5a3a', 2);
    pline(ctx, nx + 12, ny - 13, nx + 15, ny - 17, '#e0c060', 3);
    R(ctx, nx - 1, ny - 1, 3, 4, '#c8ccd6'); R(ctx, nx, ny + 2, 1, 2, '#1a1a2a');
    R(ctx, nx + 18, ny - 30, 18, 14, '#f0c49c'); R(ctx, nx + 18, ny - 30, 18, 3, '#ffd8b4'); R(ctx, nx + 32, ny - 28, 4, 10, '#d8a478'); R(ctx, nx + 16, ny - 22, 4, 6, '#e8b890');
    R(ctx, nx + 34, ny - 36, 16, 14, '#3a4a6a'); R(ctx, nx + 34, ny - 36, 16, 2, '#5a6a8a');
    const g = ctx.createRadialGradient(40, 0, 10, 40, 0, 240); g.addColorStop(0, 'rgba(255,220,150,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, MG_W, MG_H);
    if (st.combo >= 3) for (let i = 0; i < Math.min(st.combo, 8); i++) { R(ctx, 298 - i * 7, 5, 5, 5, '#8a5a10'); R(ctx, 299 - i * 7, 6, 3, 3, '#ffe070'); }
  },
  status: st => `Попаданий: ${st.notes.filter(n => n.res === 'perfect' || n.res === 'good').length}/${st.n} · серия ${st.combo} · точность ${pct(st.done ? st.sum / st.done : 0)}`
};

// ================= Угон: замок зажигания =================
MG.lockpick = {
  icon: '🔑', title: 'Взлом замка', keys: 'Пробел / клик — когда отмычка в зелёном',
  help: 'Отмычка ходит по кругу личинки. Поймай зелёную зону — штифт встанет на линию среза. Три промаха — сигнализация.',
  init(o, sp) { return { ang: 0, vel: 2.3 * sp, dir: 1, tgt: rnd(1, 5.5), w: 0.75, hits: 0, misses: 0, pins: 3, fl: 0, jump: [0, 0, 0], drops: Array.from({ length: 30 }, () => [rnd(0, MG_W), rnd(0, 50), rnd(0.5, 1.5)]) }; },
  key(st, k) {
    if (k !== 'space') return;
    const d = Math.abs(((st.ang - st.tgt) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    if (d < st.w / 2) {
      st.jump[st.hits] = 0.3; st.hits++; st.w *= 0.8; st.vel *= 1.2; st.dir *= -1; st.tgt = rnd(0, Math.PI * 2); st.fl = 0.25;
      mgBurst(st, 260 + (st.hits - 1) * 18, 110, 10, ['#ffe070', '#ffffff'], 30); st.pop('Щёлк!', 196, 62, 'gold'); Sound.sfx('mg_ratchet');
    } else { st.misses++; st.fl = -0.3; st.shake = 0.25; st.flash('#ff2020', 0.25); st.pop('Мимо!', 196, 62, 'bad'); Sound.sfx('mg_bad'); }
    if (st.hits >= st.pins || st.misses >= 3) st.over = true;
  },
  update(st, dt) {
    st.ang += st.vel * st.dir * dt; st.fl += st.fl > 0 ? -dt : dt; if (Math.abs(st.fl) < 0.03) st.fl = 0;
    st.jump = st.jump.map(j => Math.max(0, j - dt));
    st.drops.forEach(d => { d[1] += d[2] * 6 * dt; if (d[1] > 50) { d[1] = 0; d[0] = rnd(0, MG_W); } });
    st.score = st.hits / st.pins - st.misses * 0.08;
  },
  bg() {
    return mgCached('lock-bg', MG_W, MG_H, x => {
      const sky = x.createLinearGradient(0, 0, 0, 52); sky.addColorStop(0, '#0a0e22'); sky.addColorStop(1, '#22284a'); x.fillStyle = sky; x.fillRect(0, 0, MG_W, 52);
      const lamp = x.createRadialGradient(250, 20, 2, 250, 20, 60); lamp.addColorStop(0, 'rgba(255,190,90,.7)'); lamp.addColorStop(1, 'rgba(255,190,90,0)'); x.fillStyle = lamp; x.fillRect(180, 0, 140, 52);
      R(x, 248, 14, 4, 38, '#1a1a22'); R(x, 240, 12, 18, 4, '#2a2a30'); R(x, 243, 16, 12, 2, '#ffd890');
      R(x, 20, 34, 60, 18, '#14141c'); R(x, 26, 38, 8, 6, '#3a3a20'); R(x, 90, 40, 40, 12, '#10101a');
      R(x, 0, 48, MG_W, 6, '#0e0e14'); pline(x, 30, 52, 140, 46, '#2a2a34', 2);
      R(x, 0, 54, MG_W, 106, '#24242c'); R(x, 0, 54, MG_W, 3, '#3a3a46'); R(x, 0, 57, MG_W, 1, '#141418');
      const rn = seeded(11); for (let i = 0; i < 300; i++) R(x, rn() * MG_W, 58 + rn() * 100, 1, 1, i % 2 ? '#282830' : '#202028');
      [[48, 86, 22], [100, 90, 14]].forEach(([cx, cy, r]) => {
        pcirc(x, cx, cy, r + 3, '#141418'); pcirc(x, cx, cy, r, '#0e0e14'); pring(x, cx, cy, r + 2, 2, '#6a6a76');
        for (let a = 0; a < 9; a++) { const an = Math.PI * 0.8 + a * Math.PI * 1.4 / 8; R(x, cx + Math.cos(an) * (r - 3), cy + Math.sin(an) * (r - 3), 2, 2, a > 6 ? '#e04a3a' : '#e8e8f0'); }
        pline(x, cx, cy, cx - r * 0.6, cy + r * 0.5, '#e86a3a', 1); pcirc(x, cx, cy, 2, '#8a8a96');
      });
      pring(x, 30, 190, 80, 10, '#141418'); pring(x, 30, 190, 78, 6, '#2a2a32'); pring(x, 30, 190, 74, 1, '#3a3a44');
      R(x, 244, 66, 72, 88, '#16161c'); R(x, 246, 68, 68, 84, '#4a4a56'); R(x, 246, 68, 68, 2, '#7a7a86');
      R(x, 246, 110, 68, 1, '#e8c040');
    });
  },
  draw(ctx, st) {
    ctx.drawImage(this.bg(), 0, 0);
    ctx.fillStyle = 'rgba(160,190,240,.5)'; st.drops.forEach(d => { ctx.fillRect(Math.round(d[0]), Math.round(d[1]), 1, 2); ctx.fillRect(Math.round(d[0]) + 1, Math.round(d[1]) + 2, 1, 1); });
    const blink = st.fl < 0 ? Math.floor(st.t * 20) % 2 : Math.floor(st.t * 2) % 2;
    pcirc(ctx, 150, 68, 3, blink ? '#ff3030' : '#4a1010'); if (blink) { ctx.fillStyle = 'rgba(255,40,40,.25)'; ctx.beginPath(); ctx.arc(150, 68, 10, 0, 7); ctx.fill(); }
    for (let i = 0; i < 3; i++) R(ctx, 140 + i * 8, 78, 6, 3, i < st.misses ? '#ff3030' : '#3a2a2a');
    const cx = 196, cy = 108;
    pcirc(ctx, cx, cy, 36, '#101014'); pcirc(ctx, cx, cy, 33, '#8a8a96'); pcirc(ctx, cx, cy, 30, '#b8b8c4'); pcirc(ctx, cx - 4, cy - 4, 18, '#d0d0dc');
    pcirc(ctx, cx, cy, 24, '#6a6a76'); pcirc(ctx, cx, cy, 21, '#3a3a44');
    ctx.strokeStyle = '#5ad05a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 27, st.tgt - st.w / 2, st.tgt + st.w / 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,255,140,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 31, st.tgt - st.w / 2, st.tgt + st.w / 2); ctx.stroke();
    R(ctx, cx - 3, cy - 12, 6, 24, '#121216'); R(ctx, cx - 1, cy - 15, 2, 4, '#121216');
    pline(ctx, cx, cy + 10, cx + 2, cy + 40, '#4a4a56', 3); pline(ctx, cx + 2, cy + 40, cx + 30, cy + 44, '#4a4a56', 3);
    const ex = cx + Math.cos(st.ang) * 26, ey = cy + Math.sin(st.ang) * 26;
    pline(ctx, cx, cy, ex, ey, st.fl > 0 ? '#ffffff' : st.fl < 0 ? '#ff4a4a' : '#e8c040', 2);
    pcirc(ctx, ex, ey, 2, st.fl < 0 ? '#ff4a4a' : '#fff4c0');
    for (let i = 0; i < st.pins; i++) {
      const x = 254 + i * 18, set = i < st.hits, jy = st.jump[i] > 0 ? -3 : 0;
      R(ctx, x, 72, 12, 76, '#2a2a32');
      for (let k = 0; k < 6; k++) R(ctx, x + (k % 2 ? 6 : 2), 74 + k * 3 + (set ? -2 : 0), 4, 1, '#c8ccd6');
      const top = set ? 92 + jy : 96;
      R(ctx, x + 2, top, 8, set ? 18 : 22, '#a8acb8'); R(ctx, x + 2, top, 8, 1, '#e8ecf4');
      R(ctx, x + 2, set ? 112 : 118, 8, 18, '#c8a040'); R(ctx, x + 2, set ? 112 : 118, 8, 1, '#f0d070');
      if (set) R(ctx, x, 110, 12, 2, '#5ad05a');
    }
  },
  status: st => `Штифты: ${st.hits}/${st.pins} · промахи: ${st.misses}/3`
};

// ================= Сжечь: мехи и жар =================
MG.bellows = {
  icon: '🔥', title: 'Сжечь вещи', keys: 'Держи Пробел / мышь — раздувать',
  help: 'Держи жар в зелёной полосе градусника: слабый огонь не возьмёт вещи, слишком сильный даст столб дыма над мотелем.',
  init(o, sp) { return { heat: 0.3, c: 0.6, w: 0.24, inT: 0, need: 6, dur: 11 / Math.sqrt(sp), smoke: 0, sp, flames: [], squeeze: 0 }; },
  update(st, dt) {
    const h0 = st.heat;
    st.heat = clamp(st.heat + (st.hold() ? 0.85 : -0.5) * dt * st.sp, 0, 1);
    st.squeeze += ((st.hold() ? 1 : 0) - st.squeeze) * Math.min(1, dt * 10);
    st.c = 0.55 + Math.sin(st.t * 0.9) * 0.2; st.w = 0.24 - st.t * 0.006;
    const inZone = Math.abs(st.heat - st.c) < st.w / 2;
    if (inZone) st.inT += dt;
    if (inZone && !st.wasIn) st.pop('Горит!', 92, 40, 'gold');
    st.wasIn = inZone;
    if (st.heat > 0.93) { st.smoke += dt; if (h0 <= 0.93) st.pop('Дым!', 100, 20, 'bad'); }
    if (st.hold() && Math.random() < dt * 6) { Sound.sfx('mg_pump'); for (let i = 0; i < 3; i++) mgPart(st, { x: 136, y: 108, vx: rnd(-50, -30), vy: rnd(-8, 8), life: 0.3, col: 'rgba(255,255,255,.6)', size: 2 }); }
    // пламя, угли, дым
    const n = Math.round(1 + st.heat * 5);
    for (let i = 0; i < n; i++) st.flames.push({ x: rnd(68, 112), y: 76, vx: rnd(-6, 6), vy: -rnd(25, 55) * (0.4 + st.heat), t: 0, life: rnd(0.25, 0.6) * (0.5 + st.heat), s: rint(3, 5) });
    st.flames.forEach(f => { f.t += dt; f.x += f.vx * dt + Math.sin(st.t * 9 + f.y) * 0.3; f.y += f.vy * dt; });
    st.flames = st.flames.filter(f => f.t < f.life);
    if (st.heat > 0.4 && Math.random() < dt * 10 * st.heat) mgPart(st, { x: rnd(70, 110), y: 60, vx: rnd(-10, 10), vy: -rnd(30, 60), life: rnd(0.8, 1.6), col: pick(['#ffb040', '#ff7020', '#ffe080']), size: 1 });
    if ((st.heat > 0.88 || st.heat < 0.18) && Math.random() < dt * 8) mgPart(st, { x: rnd(76, 104), y: 50, vx: rnd(-6, 6), vy: -rnd(15, 25), life: 2, col: st.heat > 0.88 ? '#b8b8c0' : '#3a3438', size: 3, grow: 6, round: true, alpha: 0.6 });
    st.score = st.inT / st.need - st.smoke * 0.08;
    if (st.inT >= st.need || st.t >= st.dur) st.over = true;
  },
  bg() {
    return mgCached('fire-bg', MG_W, MG_H, x => {
      const sky = x.createLinearGradient(0, 0, 0, 90); sky.addColorStop(0, '#0a0818'); sky.addColorStop(1, '#2a1e3a'); x.fillStyle = sky; x.fillRect(0, 0, MG_W, 90);
      const rn = seeded(5); for (let i = 0; i < 50; i++) R(x, rn() * MG_W, rn() * 60, 1, 1, rn() < 0.3 ? '#ffffff' : '#7a7a9a');
      pcirc(x, 286, 22, 12, '#e8e4d0'); pcirc(x, 282, 19, 3, '#c8c4b0'); pcirc(x, 291, 26, 2, '#c8c4b0'); pcirc(x, 290, 15, 2, '#d8d4c0');
      // стена мотеля
      R(x, 170, 30, 150, 60, '#3a2a30'); for (let y = 32; y < 90; y += 6) for (let i = 170 + (y % 12 ? 0 : 6); i < MG_W; i += 12) R(x, i, y, 11, 5, '#43303a');
      R(x, 200, 44, 22, 16, '#f0c860'); R(x, 210, 44, 1, 16, '#8a6a3a'); R(x, 200, 52, 22, 1, '#8a6a3a'); R(x, 244, 50, 26, 18, '#5a5a62'); for (let i = 0; i < 5; i++) R(x, 246, 52 + i * 3, 22, 1, '#3a3a42');
      R(x, 286, 50, 20, 40, '#2a1e1a'); R(x, 288, 52, 16, 38, '#4a3428');
      // сетка-рабица
      R(x, 0, 66, 170, 1, '#5a5a66'); for (let i = 0; i < 170; i += 8) R(x, i, 66, 1, 54, '#3a3a46');
      // ромбы рабицы — попиксельно, без сглаживания
      for (let y = 67; y < 120; y++) for (let i = 0; i < 170; i++) if ((i + y) % 8 === 0 || (i - y + 400) % 8 === 0) R(x, i, y, 1, 1, '#4a4a5a');
      // земля
      R(x, 0, 118, MG_W, 42, '#2a2018'); for (let i = 0; i < 160; i++) R(x, rn() * MG_W, 120 + rn() * 40, 2, 1, rn() < 0.5 ? '#342818' : '#221a12');
      for (let i = 0; i < 18; i++) { const gx = rn() * MG_W, gy = 120 + rn() * 36; R(x, gx, gy, 1, 3, '#3a5a2a'); R(x, gx + 2, gy + 1, 1, 2, '#2a4a20'); }
    });
  },
  draw(ctx, st) {
    ctx.drawImage(this.bg(), 0, 0);
    const h = st.heat, burn = clamp(st.inT / st.need, 0, 1);
    // свет от огня
    const g = ctx.createRadialGradient(90, 70, 4, 90, 70, 60 + h * 70); g.addColorStop(0, `rgba(255,140,50,${0.18 + h * 0.22})`); g.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, MG_W, MG_H);
    // вещи в бочке
    const ch = c => mix(c, '#1a1412', burn * 0.9);
    R(ctx, 74, 64, 22, 14, ch('#7a4a2a')); R(ctx, 82, 60, 6, 4, ch('#3a2418')); R(ctx, 74, 64, 22, 2, ch('#9a6a42'));
    R(ctx, 96, 62, 16, 16, ch('#3f6fb0')); R(ctx, 98, 64, 4, 10, ch('#5a8ac8'));
    R(ctx, 88, 58, 10, 12, ch('#f4f0e0')); R(ctx, 90, 60, 6, 1, ch('#8a8a8a')); R(ctx, 90, 62, 5, 1, ch('#8a8a8a'));
    // пламя
    st.flames.forEach(f => {
      const k = f.t / f.life, col = k < 0.2 ? '#fff4b0' : k < 0.45 ? '#ffc840' : k < 0.7 ? '#f07a20' : '#c0301a';
      const s = Math.max(1, Math.round(f.s * (1 - k * 0.6)));
      R(ctx, f.x - s / 2, f.y - s / 2, s, s, col);
    });
    // бочка
    boxShadow(ctx, 62, 78, 58, 48, 0.4, 4);
    R(ctx, 62, 74, 58, 52, '#5a3424'); R(ctx, 62, 74, 6, 52, '#7a4a32'); R(ctx, 112, 74, 8, 52, '#3a2016');
    [76, 92, 110, 124].forEach(y => { R(ctx, 62, y, 58, 3, '#3a2016'); R(ctx, 62, y, 58, 1, '#8a5a3a'); });
    const rn = seeded(9); for (let i = 0; i < 14; i++) R(ctx, 64 + rn() * 52, 80 + rn() * 42, rint(2, 4), rint(1, 3), rn() < 0.5 ? '#8a4a1e' : '#a85a22');
    for (let i = 0; i < 4; i++) { const hx = 70 + i * 12; pcirc(ctx, hx, 116, 2, `rgba(255,${120 + h * 100 | 0},40,${0.3 + h * 0.7})`); }
    // мехи: две доски на шарнире, между ними кожа с складками
    const op = 12 - Math.round(st.squeeze * 8), bx = 128, len = 58, ny = 106;
    R(ctx, bx - 12, ny - 2, 14, 4, '#7a7a86'); R(ctx, bx - 12, ny - 2, 14, 1, '#b8b8c4'); R(ctx, bx - 14, ny - 3, 3, 6, '#5a5a66');
    ctx.fillStyle = '#7a4a28'; ctx.beginPath(); ctx.moveTo(bx, ny - 2); ctx.lineTo(bx + len, ny - op); ctx.lineTo(bx + len, ny + op); ctx.lineTo(bx, ny + 2); ctx.fill();
    for (let i = 1; i < 6; i++) { const fx = bx + i * len / 6, fy = 2 + (op - 2) * i / 6; R(ctx, fx, ny - fy, 1, fy * 2, '#5a3018'); R(ctx, fx + 1, ny - fy, 1, fy * 2, '#9a6a3a'); }
    pline(ctx, bx, ny - 3, bx + len + 4, ny - op - 2, '#a8783e', 3); pline(ctx, bx, ny + 3, bx + len + 4, ny + op + 2, '#8a5a2e', 3);
    pline(ctx, bx + len + 4, ny - op - 2, bx + len + 16, ny - op - 4, '#5a3a22', 3); pline(ctx, bx + len + 4, ny + op + 2, bx + len + 16, ny + op + 4, '#5a3a22', 3);
    R(ctx, bx + 2, ny - 1, 4, 2, '#c8a040');
    // градусник
    const tx = 226, ty = 14, th = 104;
    R(ctx, tx - 6, ty - 6, 30, th + 30, '#2a2a34'); R(ctx, tx - 4, ty - 4, 26, th + 26, '#8a7a5a');
    for (let i = 0; i <= 10; i++) R(ctx, tx + 14, ty + Math.round(th * i / 10), i % 5 ? 3 : 6, 1, '#2a2018');
    R(ctx, tx + 2, ty, 8, th, '#e8e4dc'); R(ctx, tx + 2, ty + th * (1 - st.c - st.w / 2), 8, th * st.w, 'rgba(70,170,60,.75)');
    R(ctx, tx + 4, ty + th * (1 - h), 4, th * h, h > 0.93 ? '#ff2a1a' : '#d82a1a'); R(ctx, tx + 4, ty + th * (1 - h), 1, th * h, '#ff8a7a');
    pcirc(ctx, tx + 6, ty + th + 8, 7, '#d82a1a'); pcirc(ctx, tx + 4, ty + th + 6, 2, '#ff8a7a');
    // сколько сгорело
    R(ctx, 270, 14, 36, 112, '#2a2a34'); R(ctx, 272, 16, 32, 108, '#14121a');
    const bh = Math.round(104 * burn); R(ctx, 274, 18 + 104 - bh, 28, bh, '#3a2a22'); for (let y = 18 + 104 - bh; y < 122; y += 4) R(ctx, 274 + (y % 8), y, 2, 1, '#ff7020');
  },
  status: st => `Сгорело: ${pct(st.inT / st.need)} · дым: ${st.smoke > 0 ? st.smoke.toFixed(1) + ' с' : 'нет'} · время ${Math.max(0, st.dur - st.t).toFixed(1)} с`
};

// ================= Отмыть номер =================
MG.scrub = {
  icon: '🧽', title: 'Отмыть номер', keys: 'Мышь (зажать) или стрелки + Пробел',
  help: 'Оттирай пятна, пока губка ещё мыльная. Чем больше отмоешь, тем меньше заметит уборщица и проверка.',
  init(o, sp) {
    const [m, mx] = makeCanvas(MG_W, MG_H);
    const dark = o.light ? ['#5a4630', '#6a5238', '#4a3a28'] : ['#6a0a10', '#8a1418', '#4a0608'];
    const blob = (X, Y, rx, ry) => { mx.fillStyle = pick(dark); mx.beginPath(); mx.ellipse(X, Y, rx, ry, rnd(0, 3), 0, 7); mx.fill(); };
    if (o.light) {
      for (let i = 0; i < 4; i++) { const X = rnd(60, 260), Y = rnd(50, 140); for (let k = 0; k < 5; k++) blob(X + rnd(-12, 12), Y + rnd(-6, 6), rnd(4, 10), rnd(3, 6)); }
      for (let s = 0; s < 6; s++) { const X = 40 + s * 30, Y = 120 - s * 8; mx.fillStyle = dark[2]; mx.fillRect(X, Y, 6, 9); mx.fillRect(X + 1, Y + 10, 4, 3); }
    } else {
      const px0 = rnd(110, 200), py0 = rnd(80, 110);
      for (let k = 0; k < 10; k++) blob(px0 + rnd(-16, 16), py0 + rnd(-8, 8), rnd(8, 16), rnd(5, 10));
      for (let k = 0; k < 18; k++) { const a = rnd(0, 6.28), d = rnd(22, 46); blob(px0 + Math.cos(a) * d, py0 + Math.sin(a) * d * 0.6, rnd(1, 3), rnd(1, 2)); }
      let sx = px0, sy = py0; for (let k = 0; k < 14; k++) { sx += 7; sy += rnd(-2, 2); blob(sx, sy, 5 - k * 0.25, 3); }
      for (let s = 0; s < 7; s++) { const X = 40 + s * 22, Y = 140 - s * 12 + (s % 2) * 6; mx.fillStyle = dark[2]; mx.fillRect(X, Y, 6, 10); mx.fillRect(X + 1, Y + 11, 4, 3); }
    }
    const st = { mask: m, mx2: mx, cx: 160, cy: 80, left: 1, total: 0, chk: 0, dur: (o.light ? 10 : 14) / Math.sqrt(sp), foam: [], wet: [] };
    st.total = MG.scrub.count(st);
    return st;
  },
  count(st) { const d = st.mx2.getImageData(0, 0, MG_W, MG_H).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 60) n++; return n; },
  update(st, dt) {
    const v = 130 * dt;
    if (st.held.left) st.cx -= v; if (st.held.right) st.cx += v; if (st.held.up) st.cy -= v; if (st.held.down) st.cy += v;
    if (st.mouse) { st.cx = st.mx; st.cy = st.my; }
    st.cx = clamp(st.cx, 0, MG_W); st.cy = clamp(st.cy, 0, MG_H);
    if (st.hold()) {
      const m = st.mx2; m.globalCompositeOperation = 'destination-out'; m.fillStyle = 'rgba(0,0,0,0.32)';
      m.beginPath(); m.arc(st.cx + Math.sin(st.t * 30) * 2, st.cy, 13, 0, 7); m.fill(); m.globalCompositeOperation = 'source-over';
      if (Math.random() < dt * 18) st.foam.push({ x: st.cx + rnd(-12, 12), y: st.cy + rnd(-8, 8), r: rint(1, 3), t: 0, life: rnd(0.8, 1.6) });
      if (Math.random() < dt * 10) { st.wet.push({ x: st.cx, y: st.cy, t: 0 }); Sound.sfx('mg_scrub'); }
    }
    st.foam.forEach(b => { b.t += dt; b.y -= dt * 3; }); st.foam = st.foam.filter(b => b.t < b.life);
    st.wet.forEach(w => w.t += dt); st.wet = st.wet.filter(w => w.t < 2.5);
    st.chk -= dt;
    if (st.chk <= 0) {
      st.chk = 0.2; const prev = st.left; st.left = MG.scrub.count(st) / Math.max(1, st.total);
      [0.5, 0.25].forEach(m => { if (prev > m && st.left <= m) st.pop(m === 0.5 ? 'Половина!' : 'Почти чисто!', st.cx, st.cy - 18, 'gold'); });
    }
    st.score = (1 - st.left) / 0.9;
    if (st.left < 0.08 || st.t >= st.dur) st.over = true;
  },
  bg() {
    return mgCached('scrub-bg', MG_W, MG_H, x => {
      for (let y = 0; y < MG_H; y += 8) for (let i = 0; i < MG_W; i += 8) R(x, i, y, 8, 8, ((i + y) / 8) % 2 ? '#5a1e26' : '#4e1a20');
      for (let y = 4; y < MG_H; y += 16) for (let i = 4; i < MG_W; i += 16) { R(x, i + 3, y + 1, 2, 1, '#8a6a2a'); R(x, i + 1, y + 3, 1, 2, '#8a6a2a'); R(x, i + 6, y + 3, 1, 2, '#8a6a2a'); R(x, i + 3, y + 6, 2, 1, '#8a6a2a'); }
      R(x, 0, 0, MG_W, 14, '#6a6638'); R(x, 0, 12, MG_W, 3, '#3a2418');
      // кровать
      boxShadow(x, 0, 14, 104, 54, 0.35, 4);
      R(x, 0, 14, 104, 8, '#5a3420'); R(x, 0, 22, 100, 46, '#d8d0c0'); R(x, 6, 24, 30, 14, '#ffffff'); R(x, 40, 24, 30, 14, '#ffffff'); R(x, 6, 36, 30, 2, '#d8d4cc'); R(x, 40, 36, 30, 2, '#d8d4cc');
      R(x, 0, 42, 100, 26, '#7a3a4a'); for (let i = 0; i < 100; i += 10) R(x, i, 42, 5, 26, '#8a4a5a'); R(x, 0, 42, 100, 2, '#9a5a6a');
      // тумбочка с лампой
      boxShadow(x, 110, 16, 26, 22, 0.35, 3); R(x, 110, 16, 26, 22, '#6a4228'); R(x, 110, 16, 26, 2, '#8a5a3a'); R(x, 118, 26, 10, 2, '#c8a040');
      pcirc(x, 123, 20, 6, '#e8d0a0'); pcirc(x, 122, 19, 3, '#fff0c8');
      // ведро
      boxShadow(x, 280, 120, 32, 34, 0.35, 3);
      R(x, 280, 122, 32, 34, '#7a7e88'); R(x, 280, 122, 32, 3, '#a8acb6'); R(x, 283, 125, 26, 6, '#8ac0d8'); for (let i = 0; i < 6; i++) pcirc(x, 286 + i * 4, 126, 2, '#f4f8fc');
      pring(x, 296, 120, 14, 1, '#4a4e58');
    });
  },
  draw(ctx, st) {
    ctx.drawImage(this.bg(), 0, 0);
    ctx.drawImage(st.mask, 0, 0);
    st.wet.forEach(w => { ctx.fillStyle = `rgba(200,220,255,${0.12 * (1 - w.t / 2.5)})`; ctx.beginPath(); ctx.arc(w.x, w.y, 12, 0, 7); ctx.fill(); });
    st.foam.forEach(b => { const a = 1 - b.t / b.life; ctx.globalAlpha = a; pcirc(ctx, b.x, b.y, b.r, '#ffffff'); R(ctx, b.x - b.r + 1, b.y - b.r + 1, 1, 1, '#c8e8ff'); ctx.globalAlpha = 1; });
    const g = ctx.createRadialGradient(123, 20, 2, 123, 20, 70); g.addColorStop(0, 'rgba(255,220,150,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, MG_W, MG_H);
    // губка в перчатке
    const x = Math.round(st.cx), y = Math.round(st.cy), w = st.hold() ? 1 : 0, wob = st.hold() ? Math.round(Math.sin(st.t * 30) * 2) : 0;
    R(ctx, x - 9 + wob + 3, y - 4 + 4, 18, 12, 'rgba(0,0,0,.25)');
    R(ctx, x - 10 + wob, y - 7 + w, 20, 14, '#2a1a10'); R(ctx, x - 9 + wob, y - 6 + w, 18, 9, '#f0d040'); R(ctx, x - 9 + wob, y + 3 + w, 18, 3, '#3a8a3a');
    [[-6, -4], [-1, -2], [4, -5], [6, 0], [-4, 1]].forEach(([a, b]) => R(ctx, x + a + wob, y + b + w, 2, 1, '#c8a020'));
    R(ctx, x - 6 + wob, y - 14 + w, 12, 8, '#e8c030'); R(ctx, x - 6 + wob, y - 14 + w, 12, 2, '#f8e070'); R(ctx, x - 8 + wob, y - 10 + w, 3, 5, '#e8c030');
  },
  status: st => `Отмыто: ${pct(1 - st.left)} · время ${Math.max(0, st.dur - st.t).toFixed(1)} с`
};

// ================= Разобрать машину: болты =================
MG.mash = {
  icon: '🔧', title: 'Разобрать на запчасти', keys: 'Чередуй ← →',
  help: 'Открути четыре гайки колеса: быстро чередуй стрелки влево-вправо. Если медлить, гайка затягивается обратно.',
  init(o, sp) { return { done: 0, prog: 0, last: '', bolts: 4, dur: 11 / Math.sqrt(sp), rot: 0, col: o.color || '#b03a3a', fallen: [] }; },
  key(st, k) {
    if ((k === 'left' || k === 'right') && k !== st.last) {
      st.prog += 0.1; st.rot += 0.6; st.last = k; Sound.sfx('mg_ratchet');
      const p = MG.mash.nutPos(st.done); if (Math.random() < 0.5) mgBurst(st, p[0], p[1], 3, ['#ffe080', '#ffb040'], 30, { g: 80 });
    }
  },
  nutPos: i => { const a = i * Math.PI / 2 + 0.6; return [110 + Math.cos(a) * 24, 96 + Math.sin(a) * 24]; },
  update(st, dt) {
    st.prog = Math.max(0, st.prog - 0.13 * dt);
    if (st.prog >= 1) {
      const p = MG.mash.nutPos(st.done); st.fallen.push({ x: p[0], y: p[1], vy: -40, t: 0 });
      st.done++; st.prog = 0; Sound.sfx('mg_perfect'); st.pop('Готово!', p[0], p[1] - 16, 'gold');
    }
    st.fallen.forEach(f => { f.t += dt; f.vy += 300 * dt; f.y = Math.min(140, f.y + f.vy * dt); f.x += (262 + st.fallen.indexOf(f) * 8 - f.x) * Math.min(1, dt * 3); });
    st.score = (st.done + st.prog) / st.bolts;
    if (st.done >= st.bolts || st.t >= st.dur) st.over = true;
  },
  bg(col) {
    return mgCached('mash-bg' + col, MG_W, MG_H, x => {
      R(x, 0, 0, MG_W, MG_H, '#24242a');
      for (let y = 0; y < 50; y += 7) for (let i = (y % 14 ? 0 : 8); i < MG_W; i += 16) R(x, i, y, 15, 6, '#2e2a2c');
      R(x, 0, 128, MG_W, 32, '#2a2a30'); const rn = seeded(4); for (let i = 0; i < 200; i++) R(x, rn() * MG_W, 128 + rn() * 32, 1, 1, '#34343c');
      x.fillStyle = 'rgba(10,10,14,.6)'; x.beginPath(); x.ellipse(230, 146, 30, 6, 0, 0, 7); x.fill();
      // кузов
      R(x, 0, 18, MG_W, 52, col); R(x, 0, 18, MG_W, 4, shade(col, 0.3)); R(x, 0, 44, MG_W, 2, shade(col, -0.3)); R(x, 180, 22, 1, 40, shade(col, -0.35)); R(x, 196, 34, 14, 3, '#c8ccd6');
      pcirc(x, 110, 96, 70, '#0e0e12');
    });
  },
  draw(ctx, st) {
    ctx.drawImage(this.bg(st.col), 0, 0);
    const cx = 110, cy = 96;
    pcirc(ctx, cx, cy, 62, '#141418');
    for (let a = 0; a < 6.28; a += 0.21) { const c = Math.cos(a), s = Math.sin(a); R(ctx, cx + c * 58 - 3, cy + s * 58 - 3, 6, 6, '#1e1e24'); }
    pring(ctx, cx, cy, 50, 6, '#22222a'); for (let a = 0; a < 6.28; a += 0.5) R(ctx, cx + Math.cos(a) * 47, cy + Math.sin(a) * 47, 2, 1, '#3a3a44');
    pcirc(ctx, cx, cy, 42, '#9a9aa6'); pcirc(ctx, cx - 3, cy - 3, 38, '#c8c8d4');
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 + 0.3; pline(ctx, cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, '#8a8a96', 6); pline(ctx, cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, '#d8d8e4', 2); }
    pcirc(ctx, cx, cy, 14, '#6a6a76'); pcirc(ctx, cx - 2, cy - 2, 9, '#a8a8b4'); pcirc(ctx, cx, cy, 4, '#3a3a44');
    for (let i = 0; i < st.bolts; i++) {
      const [x, y] = MG.mash.nutPos(i);
      if (i < st.done) { pcirc(ctx, x, y, 3, '#5a5a66'); pcirc(ctx, x, y, 1, '#2a2a30'); continue; }
      const cur = i === st.done;
      if (cur) pcirc(ctx, x, y, 8, 'rgba(255,220,100,.5)');
      ctx.fillStyle = '#3a3a44'; ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + (cur ? st.rot * 0.3 : 0); ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); } ctx.fill();
      pcirc(ctx, x, y, 3, '#7a7a86'); R(ctx, x - 2, y - 2, 2, 1, '#c8c8d4');
      if (cur) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(st.rot);
        ctx.fillStyle = '#5a5a66'; ctx.fillRect(-3, -46, 6, 92); ctx.fillRect(-46, -3, 92, 6);
        ctx.fillStyle = '#b8b8c4'; ctx.fillRect(-1, -46, 2, 92); ctx.fillRect(-46, -1, 92, 2);
        ctx.fillStyle = '#3a3a44'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      }
    }
    // домкрат и лоток
    R(ctx, 214, 112, 40, 6, '#c8a020'); pline(ctx, 218, 112, 248, 76, '#a88010', 3); pline(ctx, 248, 112, 218, 76, '#a88010', 3); R(ctx, 214, 72, 40, 6, '#c8a020');
    pcirc(ctx, 274, 142, 16, '#6a6a76'); pcirc(ctx, 274, 141, 13, '#9a9aa6'); pcirc(ctx, 272, 139, 8, '#b8b8c4');
    st.fallen.forEach(f => { pcirc(ctx, f.x, f.y, 3, '#5a5a66'); R(ctx, f.x - 1, f.y - 1, 1, 1, '#c8c8d4'); });
    // фонарик
    ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(110, 96, 10, 110, 96, 110); g.addColorStop(0, 'rgba(255,240,200,.15)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, MG_W, MG_H); ctx.globalCompositeOperation = 'source-over';
    // индикатор усилия
    R(ctx, 286, 20, 22, 92, '#14141a'); R(ctx, 288, 22 + 88 * (1 - st.prog), 18, 88 * st.prog, st.prog > 0.7 ? '#5ad05a' : '#f0c040');
    mgArrow(ctx, 290, 124, 'left', st.held.left ? '#ffffff' : '#5a5a66'); mgArrow(ctx, 304, 124, 'right', st.held.right ? '#ffffff' : '#5a5a66');
  },
  status: st => `Гайки: ${st.done}/${st.bolts} · время ${Math.max(0, st.dur - st.t).toFixed(1)} с`
};

// ================= Трасса: увести машину / вывезти вещи =================
MG.drive = {
  icon: '🚗', title: 'Ночная трасса', keys: '← → смена полосы',
  help: 'Уезжай подальше от мотеля. Не попадайся патрулю и не врезайся — каждое столкновение это свидетель.',
  init(o, sp) {
    return { lane: 1, x: 160, obs: [], spawn: 0.8, scroll: 0, v: 130 * sp, hits: 0, inv: 0, dur: 12, col: o.color || '#3f6fb0',
      side: Array.from({ length: 10 }, (_, i) => ({ y: i * 20 - 20, kind: pick(['tree', 'tree', 'bush', 'lamp']), s: i % 2 })) };
  },
  key(st, k) { const l = st.lane; if (k === 'left') st.lane = Math.max(0, st.lane - 1); if (k === 'right') st.lane = Math.min(2, st.lane + 1); if (l !== st.lane) Sound.sfx('mg_tick'); },
  laneX: l => 104 + l * 56,
  update(st, dt) {
    st.x += (MG.drive.laneX(st.lane) - st.x) * Math.min(1, dt * 12);
    st.scroll = (st.scroll + st.v * dt);
    st.side.forEach(s => { s.y += st.v * dt; if (s.y > MG_H + 30) { s.y -= 200; s.kind = pick(['tree', 'tree', 'bush', 'lamp', 'board']); } });
    st.spawn -= dt;
    if (st.spawn <= 0) { st.spawn = rnd(0.55, 1.05) / (1 + st.t / 20); st.obs.push({ lane: rint(0, 2), y: -50, type: pick(['cop', 'cop', 'car', 'cone', 'truck']), col: pick(CAR_COLORS) }); }
    st.obs.forEach(o => { o.y += (st.v + ({ car: -40, truck: -60, cone: 0, cop: 30 })[o.type]) * dt; });
    st.inv -= dt;
    st.obs.forEach(o => {
      const len = o.type === 'truck' ? 70 : 40;
      if (!o.hit && st.inv <= 0 && Math.abs(MG.drive.laneX(o.lane) - st.x) < 22 && o.y + len > 82 && o.y < 128) {
        o.hit = true; st.hits++; st.inv = 1; st.shake = 0.35; st.flash('#ffffff', 0.35); Sound.sfx('mg_crash');
        mgBurst(st, st.x, 84, 14, ['#ffe080', '#ff8040', '#c8ccd6'], 60, { g: 60 });
        st.pop(o.type === 'cop' ? 'Патруль заметил!' : 'Удар!', st.x, 70, 'bad');
      }
    });
    if (Math.floor(st.t) !== Math.floor(st.t - dt) && st.t > 0.5 && Math.floor(st.t) % 4 === 0 && st.hits === 0) st.pop('Чисто едешь', 160, 30, 'gold');
    st.obs = st.obs.filter(o => o.y < MG_H + 80);
    st.score = 1 - st.hits * 0.34;
    if (st.t >= st.dur || st.hits >= 3) st.over = true;
  },
  tile() {
    return mgCached('road-tile', 172, 80, x => {
      R(x, 0, 0, 172, 80, '#2c2c32'); const rn = seeded(8);
      for (let i = 0; i < 500; i++) R(x, rn() * 172, rn() * 80, 1, 1, pick(['#34343a', '#26262c', '#3a3a40']));
      for (let k = 0; k < 3; k++) { let cx = rn() * 172, cy = rn() * 80; for (let i = 0; i < 12; i++) { R(x, cx, cy, 1, 1, '#1c1c22'); cx += rint(-1, 1); cy += 1; } }
    });
  },
  draw(ctx, st) {
    R(ctx, 0, 0, MG_W, MG_H, '#0c1810');
    const so = st.scroll % 80;
    for (let y = -80 + so; y < MG_H; y += 80) ctx.drawImage(this.tile(), 74, Math.round(y));
    R(ctx, 74, 0, 3, MG_H, '#d8d0c0'); R(ctx, 243, 0, 3, MG_H, '#d8d0c0');
    const ls = st.scroll % 40;
    for (let l = 1; l < 3; l++) for (let y = -40 + ls; y < MG_H; y += 40) { R(ctx, 76 + l * 56 + 1, y, 3, 20, '#e8c040'); R(ctx, 77 + l * 56, y + 26, 2, 2, '#ffe8a0'); }
    // обочины
    st.side.forEach(s => {
      const x = s.s ? 262 : 26, y = Math.round(s.y);
      if (s.kind === 'tree') { pcirc(ctx, x + 6, y + 6, 13, 'rgba(0,0,0,.4)'); pcirc(ctx, x, y, 13, '#14361e'); pcirc(ctx, x - 3, y - 3, 8, '#1e4a2a'); pcirc(ctx, x - 5, y - 5, 3, '#2a5a34'); }
      else if (s.kind === 'bush') { pcirc(ctx, x, y, 7, '#1a3a20'); pcirc(ctx, x - 2, y - 2, 4, '#24482a'); }
      else if (s.kind === 'lamp') {
        const lx = s.s ? 248 : 70; R(ctx, lx, y, 4, 4, '#4a4a52'); pline(ctx, lx + 2, y + 2, s.s ? lx - 16 : lx + 18, y + 2, '#4a4a52', 2);
        ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(s.s ? lx - 16 : lx + 18, y + 4, 2, s.s ? lx - 16 : lx + 18, y + 4, 34); g.addColorStop(0, 'rgba(255,200,120,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(lx - 60, y - 40, 120, 90); ctx.globalCompositeOperation = 'source-over';
      } else { R(ctx, x - 16, y - 10, 34, 18, '#3a2a2a'); R(ctx, x - 14, y - 8, 30, 14, '#ff4a7a'); R(ctx, x - 12, y - 6, 26, 10, '#2a1a20'); R(ctx, x - 9, y - 4, 20, 2, '#ff8aa8'); R(ctx, x - 9, y, 14, 2, '#ff8aa8'); R(ctx, x - 2, y + 8, 2, 8, '#3a3a40'); }
    });
    // машины и препятствия
    st.obs.forEach(o => {
      const x = MG.drive.laneX(o.lane), y = Math.round(o.y);
      if (o.type === 'cone') { R(ctx, x - 7, y + 10, 14, 3, '#3a3a3a'); R(ctx, x - 5, y, 10, 11, '#f07020'); R(ctx, x - 3, y + 3, 6, 2, '#ffffff'); R(ctx, x - 2, y - 2, 4, 3, '#f07020'); return; }
      if (o.type === 'truck') {
        boxShadow(ctx, x - 14, y + 2, 28, 70, 0.35, 4);
        R(ctx, x - 14, y, 28, 52, '#8a8a92'); R(ctx, x - 14, y, 28, 2, '#a8a8b0'); for (let i = 0; i < 5; i++) R(ctx, x - 14, y + 8 + i * 9, 28, 1, '#6a6a72');
        R(ctx, x - 12, y + 54, 24, 16, o.col); R(ctx, x - 10, y + 56, 20, 5, '#8ab0c8'); R(ctx, x - 10, y + 70, 6, 2, '#fff4c0'); R(ctx, x + 4, y + 70, 6, 2, '#fff4c0');
        return;
      }
      ctx.save(); ctx.translate(x, y + 26); ctx.rotate(Math.PI); drawCar(ctx, -16, -26, o.type === 'cop' ? '#e8e8f0' : o.col); ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,250,200,.12)'; ctx.beginPath(); ctx.moveTo(x - 10, y + 50); ctx.lineTo(x - 30, y + 100); ctx.lineTo(x + 30, y + 100); ctx.lineTo(x + 10, y + 50); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      if (o.type === 'cop') {
        R(ctx, x - 12, y + 18, 24, 6, '#14141a'); R(ctx, x - 12, y + 30, 24, 3, '#1a2a6a');
        const f = Math.floor(st.t * 8) % 2; R(ctx, x - 10, y + 19, 9, 4, f ? '#ff2a2a' : '#5a1010'); R(ctx, x + 1, y + 19, 9, 4, f ? '#1a1a4a' : '#2a5aff');
        ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x, y + 22, 2, x, y + 22, 44); g.addColorStop(0, f ? 'rgba(255,40,40,.35)' : 'rgba(40,90,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - 50, y - 20, 100, 90); ctx.globalCompositeOperation = 'source-over';
      }
    });
    // игрок
    if (st.inv <= 0 || Math.floor(st.t * 10) % 2) drawCar(ctx, Math.round(st.x - 16), 80, st.col);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,250,200,.14)'; ctx.beginPath(); ctx.moveTo(st.x - 10, 80); ctx.lineTo(st.x - 40, 0); ctx.lineTo(st.x + 40, 0); ctx.lineTo(st.x + 10, 80); ctx.fill();
    const tl = ctx.createRadialGradient(st.x, 134, 1, st.x, 134, 18); tl.addColorStop(0, 'rgba(255,40,40,.4)'); tl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = tl; ctx.fillRect(st.x - 20, 118, 40, 30);
    ctx.globalCompositeOperation = 'source-over';
    // скорость
    for (let i = 0; i < 6; i++) { const yy = (st.scroll * 3 + i * 31) % MG_H; R(ctx, 78 + (i * 47) % 160, yy, 1, 10, 'rgba(255,255,255,.12)'); }
    const g = ctx.createRadialGradient(160, 80, 60, 160, 80, 210); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,12,.65)'); ctx.fillStyle = g; ctx.fillRect(0, 0, MG_W, MG_H);
    // путь
    R(ctx, 8, 8, 58, 8, '#14141a'); R(ctx, 9, 9, Math.round(56 * clamp(st.t / st.dur, 0, 1)), 6, '#5ad05a');
    R(ctx, 8 + Math.round(56 * clamp(st.t / st.dur, 0, 1)) - 2, 6, 5, 12, st.col);
    for (let i = 0; i < 3; i++) R(ctx, 8 + i * 9, 20, 7, 4, i < st.hits ? '#ff3a3a' : '#2a2a30');
  },
  status: st => `Пройдено: ${pct(st.t / st.dur)} · столкновения: ${st.hits}/3`
};

// ================= «Тише едешь»: двигаться, пока не смотрят =================
const RL_THEMES = {
  hide:  { icon: '🧳', title: 'Спрятать вещи', eye: 'Смотритель', help: 'Неси чемодан к котельной, пока смотритель отвернулся. Он поворачивается — замри.' },
  plant: { icon: '🚪', title: 'Подбросить вещи', eye: 'Сосед', help: 'Пробирайся к чужой двери, пока сосед не выглядывает. Шевельнёшься при открытой двери — заметят.' },
  pet:   { icon: '🐾', title: 'Увести питомца', eye: 'Хозяин', help: 'Хозяин дремлет вполглаза. Подкрадывайся к питомцу, только когда глаз закрыт.' }
};
const CARETAKER_LOOK = { skin: '#d8a478', hair: '#6a6a6a', eye: '#3a2a1a', shirt: '#5a6a4a', shirt2: '#c8b890', pants: '#3a4a6a', shoes: '#3a2418', style: 'cap', cap: '#3a4a3a', outfit: 'overalls', build: 'heavy', beard: 'stubble', old: true };
MG.redlight = {
  icon: '👁', title: 'Тише едешь', keys: 'Держи Пробел / мышь — идти, отпусти — замереть', help: '',
  init(o, sp) { const th = RL_THEMES[o.theme || 'hide']; return { th, prog: 0, phase: 'closed', pt: rnd(1.2, 2.2) / sp, spotted: 0, seenThis: false, dur: 14, sp, walk: 0, zz: 0 }; },
  update(st, dt) {
    st.pt -= dt;
    if (st.pt <= 0) {
      if (st.phase === 'closed') { st.phase = 'warn'; st.pt = 0.55 / st.sp; Sound.sfx('mg_tick'); }
      else if (st.phase === 'warn') { st.phase = 'open'; st.pt = rnd(0.9, 1.7); st.seenThis = false; }
      else { st.phase = 'closed'; st.pt = rnd(1.1, 2.3) / st.sp; }
    }
    if (st.hold()) {
      if (st.phase === 'open') {
        if (!st.seenThis) { st.seenThis = true; st.spotted++; st.shake = 0.3; st.flash('#ff2020', 0.3); st.pop(st.th.eye + ' заметил!', 200, 40, 'bad'); Sound.sfx('mg_bad'); }
      } else {
        st.prog += 0.13 * dt * st.sp; st.walk += dt;
        if (Math.random() < dt * 5) mgPart(st, { x: 30 + st.prog * 220, y: 120, vx: rnd(-10, 0), vy: -rnd(4, 10), life: 0.5, col: 'rgba(200,180,160,.5)', size: 2 });
      }
    }
    if (st.o.theme === 'pet' && st.phase === 'closed') { st.zz -= dt; if (st.zz <= 0) { st.zz = 0.7; mgPart(st, { x: 262, y: 70, vx: rnd(4, 10), vy: -12, life: 1.4, col: '#c8d8f8', size: 2 }); } }
    st.score = st.prog >= 1 ? 1 - st.spotted * 0.4 : st.prog * 0.6 - st.spotted * 0.2;
    if (st.prog >= 1 || st.spotted >= 2 || st.t >= st.dur) { if (st.spotted >= 2) st.score = Math.min(st.score, 0.1); st.over = true; }
  },
  bg(theme) {
    return mgCached('rl-' + theme, MG_W, MG_H, x => {
      const rn = seeded(12);
      if (theme === 'hide') {
        const sky = x.createLinearGradient(0, 0, 0, 40); sky.addColorStop(0, '#0a0818'); sky.addColorStop(1, '#1e1830'); x.fillStyle = sky; x.fillRect(0, 0, MG_W, 40);
        R(x, 0, 30, MG_W, 74, '#4a2e2a'); for (let y = 30; y < 104; y += 6) for (let i = (y % 12 ? 0 : 6); i < MG_W; i += 12) { R(x, i, y, 11, 5, '#5a3a32'); R(x, i, y, 11, 1, '#6a4a3e'); }
        R(x, 268, 50, 34, 54, '#2a2a30'); R(x, 270, 52, 30, 52, '#4a4a52'); R(x, 274, 60, 22, 2, '#2a2a30'); R(x, 274, 66, 22, 2, '#2a2a30'); R(x, 294, 78, 3, 3, '#c8a040'); R(x, 276, 44, 18, 6, '#3a3a20'); R(x, 278, 45, 14, 3, '#e8d060');
        boxShadow(x, 20, 70, 50, 34, 0.35, 4); R(x, 20, 64, 50, 40, '#2a5a3a'); R(x, 18, 60, 54, 6, '#3a7a4a'); R(x, 18, 60, 54, 1, '#5a9a64'); for (let i = 26; i < 66; i += 8) R(x, i, 70, 2, 30, '#1e4a2a'); R(x, 22, 104, 6, 4, '#1a1a1a'); R(x, 62, 104, 6, 4, '#1a1a1a'); R(x, 30, 80, 14, 6, '#e8e4dc'); R(x, 32, 82, 10, 2, '#3a7a4a');
        R(x, 0, 104, MG_W, 56, '#2a2a30'); for (let i = 0; i < 300; i++) R(x, rn() * MG_W, 104 + rn() * 56, 1, 1, '#34343a');
        x.fillStyle = 'rgba(10,10,20,.5)'; x.beginPath(); x.ellipse(120, 140, 20, 4, 0, 0, 7); x.fill();
      } else if (theme === 'plant') {
        R(x, 0, 0, MG_W, 104, '#6a6638'); for (let i = 0; i < MG_W; i += 20) for (let y = 6; y < 60; y += 14) { const o = (y / 14 % 2) * 10; R(x, i + o + 7, y + 1, 6, 3, '#5a5630'); }
        R(x, 0, 60, MG_W, 40, '#4a2c20'); for (let i = 0; i < MG_W; i += 12) R(x, i, 60, 1, 40, '#3a2016'); R(x, 0, 58, MG_W, 3, '#5a3424');
        [[50, 3], [150, 4]].forEach(([dx, n]) => { R(x, dx - 16, 30, 32, 72, '#2a1810'); R(x, dx - 14, 32, 28, 70, '#7a4a2e'); R(x, dx - 4, 38, 8, 6, '#a8802a'); x.fillStyle = '#2a1810'; x.fillRect(dx - 1, 39, 2, 4); R(x, dx + 8, 66, 3, 3, '#d0a840'); });
        [100, 220].forEach(lx => { R(x, lx - 5, 22, 10, 7, '#e8d0a0'); R(x, lx - 1, 29, 2, 6, '#a8802a'); });
        R(x, 0, 100, MG_W, 60, '#5a1e26'); for (let y = 104; y < MG_H; y += 12) for (let i = 4; i < MG_W; i += 12) R(x, i, y, 3, 3, '#7a3a30');
      } else {
        R(x, 0, 0, MG_W, 40, '#4a4a3a'); R(x, 0, 36, MG_W, 4, '#3a2418');
        R(x, 0, 40, MG_W, MG_H - 40, '#6a4a2e'); for (let y = 40; y < MG_H; y += 10) { R(x, 0, y + 9, MG_W, 1, '#4a3420'); }
        R(x, 4, 40, 22, 60, '#2a1810'); R(x, 6, 42, 18, 58, '#7a4a2e');
        // кровать: изголовье, матрас, две подушки, стёганое одеяло с отворотом
        boxShadow(x, 180, 40, 120, 66, 0.35, 4);
        R(x, 178, 26, 124, 16, '#4a2a18'); R(x, 180, 28, 120, 12, '#6a4228'); R(x, 180, 28, 120, 2, '#8a5a3a'); R(x, 178, 26, 4, 22, '#3a2014'); R(x, 298, 26, 4, 22, '#3a2014');
        R(x, 180, 42, 120, 64, '#e8e2d6'); R(x, 180, 104, 120, 2, '#b8b0a0');
        [[186, 46], [242, 46]].forEach(([px, py]) => { R(x, px + 2, py, 48, 16, '#fbf8f0'); R(x, px, py + 2, 52, 12, '#fbf8f0'); R(x, px + 2, py + 13, 48, 3, '#dcd6ca'); R(x, px + 4, py + 2, 16, 2, '#ffffff'); R(x, px + 24, py + 6, 1, 6, '#e4ded2'); });
        R(x, 180, 64, 120, 5, '#fbf8f0'); R(x, 180, 68, 120, 1, '#d8d2c6');
        R(x, 180, 69, 120, 37, '#3a4a7a');
        for (let i = 180; i < 300; i += 15) for (let y = 69; y < 106; y += 12) { R(x, i, y, 15, 12, ((i + y) / 3) % 2 ? '#3e4e80' : '#36467a'); R(x, i, y, 15, 1, '#5a6a9a'); R(x, i, y, 1, 12, '#2a3a6a'); R(x, i + 7, y + 5, 1, 1, '#8a9ac8'); }
        R(x, 180, 104, 120, 2, '#2a3a6a');
        R(x, 60, 110, 70, 40, '#8a3a3a'); R(x, 64, 114, 62, 32, '#a84a40'); for (let i = 68; i < 122; i += 8) R(x, i, 118, 4, 24, '#c8603a');
      }
    });
  },
  draw(ctx, st) {
    const th = st.o.theme || 'hide', open = st.phase === 'open', warn = st.phase === 'warn';
    ctx.drawImage(this.bg(th), 0, 0);
    // наблюдатель
    if (th === 'hide') {
      drawChar(ctx, 205 / S, 120 / S, CARETAKER_LOOK, open ? 'left' : warn ? 'down' : 'right', 0);
      if (!open) { R(ctx, 214, 96, 2, 1, '#ff7020'); if (Math.random() < 0.3) mgPart(st, { x: 215, y: 94, vx: rnd(-3, 3), vy: -10, life: 1, col: 'rgba(200,200,210,.5)', size: 1 }); }
      if (open) { ctx.fillStyle = 'rgba(255,240,170,.16)'; ctx.beginPath(); ctx.moveTo(196, 100); ctx.lineTo(20, 70); ctx.lineTo(20, 150); ctx.closePath(); ctx.fill(); }
      if (warn) R(ctx, 203, 70, 4, 8, '#ffe070');
    } else if (th === 'plant') {
      const dx = 150;
      if (open || warn) { R(ctx, dx - 14, 32, open ? 10 : 3, 70, '#0a0608'); if (open) { R(ctx, dx - 12, 52, 6, 4, '#f4f0e8'); R(ctx, dx - 10, 53, 2, 2, '#2a1a1a'); ctx.fillStyle = 'rgba(255,230,150,.2)'; ctx.beginPath(); ctx.moveTo(dx - 14, 40); ctx.lineTo(0, 30); ctx.lineTo(0, 160); ctx.lineTo(dx - 14, 102); ctx.fill(); } }
      if (warn) R(ctx, dx - 12, 102, 24, 2, '#ffd27a');
      R(ctx, 238, 30, 36, 72, '#2a1810'); R(ctx, 240, 32, 32, 70, '#7a4a2e'); R(ctx, 250, 38, 12, 6, '#a8802a');
    } else {
      // хозяин спит на правой подушке, тело под одеялом
      const hx = 266, hy = 53;
      ctx.fillStyle = 'rgba(20,30,60,.35)'; ctx.beginPath(); ctx.ellipse(268, 92, 26, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a5a90'; ctx.beginPath(); ctx.ellipse(266, 84, 26, 13, 0, Math.PI, 0); ctx.fill();
      R(ctx, 242, 84, 48, 1, '#5a6aa0'); R(ctx, 250, 76, 30, 1, '#6a7ab0');
      R(ctx, 250, 64, 34, 5, '#fbf8f0'); R(ctx, 250, 68, 34, 1, '#d8d2c6');
      pcirc(ctx, hx - 4, hy - 1, 8, '#3a2416'); pcirc(ctx, hx - 6, hy - 4, 3, '#5a3a22');
      pcirc(ctx, hx + 1, hy + 1, 7, '#f0c49c'); pcirc(ctx, hx + 3, hy + 3, 4, '#e0b088'); R(ctx, hx - 5, hy - 6, 8, 4, '#3a2416');
      R(ctx, hx - 6, hy + 1, 2, 3, '#d8a478'); R(ctx, hx + 7, hy + 1, 2, 2, '#e8b890');
      const ex = hx + 3, ey = hy - 1;
      if (open) { R(ctx, ex - 2, ey, 4, 3, '#ffffff'); R(ctx, ex - 1, ey, 2, 3, '#4a2a1a'); R(ctx, ex - 1, ey + 1, 1, 1, '#000'); R(ctx, ex - 3, ey - 1, 5, 1, '#2a1a10'); R(ctx, ex + 2, ey + 2, 1, 1, '#d84a4a'); }
      else if (warn) { R(ctx, ex - 2, ey + 1, 4, 1, '#2a1a10'); R(ctx, ex - 1, ey + 2, 2, 1, '#ffffff'); }
      else { R(ctx, ex - 2, ey + 2, 4, 1, '#5a3a2a'); R(ctx, ex - 2, ey + 3, 1, 1, '#5a3a2a'); R(ctx, ex + 1, ey + 3, 1, 1, '#5a3a2a'); }
      R(ctx, hx + 1, hy + 6, 3, 1, open ? '#7a2a2a' : '#a85a4a');
      // пёс на коврике
      const wag = Math.round(Math.sin(st.t * (open ? 2 : 10)) * 2), dx = 132, dy = 118;
      R(ctx, dx - 22, dy + 12, 34, 3, 'rgba(0,0,0,.25)');
      R(ctx, dx - 20, dy, 26, 13, '#c8a070'); R(ctx, dx - 20, dy, 26, 3, '#e0bc88'); R(ctx, dx - 20, dy + 10, 26, 3, '#a8804e');
      R(ctx, dx - 18, dy + 12, 4, 4, '#a8804e'); R(ctx, dx, dy + 12, 4, 4, '#a8804e');
      R(ctx, dx + 2, dy - 9, 14, 12, '#c8a070'); R(ctx, dx + 2, dy - 9, 14, 2, '#e0bc88'); R(ctx, dx + 13, dy - 4, 6, 6, '#d8b480'); R(ctx, dx + 17, dy - 3, 3, 2, '#1a1a1a');
      R(ctx, dx + 3, dy - 11, 4, 6, '#8a6a40'); R(ctx, dx + 10, dy - 11, 4, 6, '#8a6a40');
      R(ctx, dx + 11, dy - 6, 2, 2, open ? '#1a1a1a' : '#5a4030'); R(ctx, dx + 2, dy + 1, 12, 2, '#c02a2a'); R(ctx, dx + 7, dy + 3, 2, 2, '#e0c060');
      R(ctx, dx - 25, dy + 2 + wag, 6, 3, '#c8a070'); R(ctx, dx - 27, dy + wag, 3, 3, '#e0bc88');
    }
    // большой глаз-индикатор
    const ex = 160, ey = 14;
    R(ctx, ex - 28, ey - 12, 56, 24, '#120c10'); R(ctx, ex - 27, ey - 11, 54, 22, open ? '#3a0a10' : '#1e1418');
    if (open || warn) {
      const h = open ? 8 : 3;
      R(ctx, ex - 20, ey - h, 40, h * 2, '#f4f0e8'); R(ctx, ex - 22, ey - 1, 2, 2, '#f4f0e8'); R(ctx, ex + 20, ey - 1, 2, 2, '#f4f0e8');
      if (open) { pcirc(ctx, ex, ey, 6, '#8a2a1a'); pcirc(ctx, ex, ey, 3, '#0a0a0a'); R(ctx, ex - 3, ey - 4, 2, 2, '#ffffff'); for (let i = -16; i <= 16; i += 8) R(ctx, ex + i, ey - h + 1, 1, 2, '#c84a4a'); }
      else R(ctx, ex - 5, ey - 2, 10, 4, '#5a4a3a');
    } else { R(ctx, ex - 20, ey, 40, 2, '#c8b8a8'); for (let i = -16; i <= 16; i += 8) R(ctx, ex + i, ey + 2, 1, 3, '#c8b8a8'); }
    // игрок
    const px2 = 30 + st.prog * 200, moving = st.hold() && !open, step = moving ? Math.floor(st.walk * 7) : 0;
    drawChar(ctx, px2 / S, 128 / S, NIGHT_LOOK, 'right', step);
    const item = th === 'pet' ? null : th === 'plant' ? '#3f6fb0' : '#6a4a2a';
    if (item) { R(ctx, px2 + 6, 108, 12, 10, '#1a1010'); R(ctx, px2 + 7, 109, 10, 8, item); R(ctx, px2 + 10, 106, 4, 2, '#1a1010'); }
    if (open && st.hold()) { R(ctx, px2 - 2, 76, 4, 10, '#ff3a3a'); R(ctx, px2 - 2, 88, 4, 3, '#ff3a3a'); }
    // путь
    R(ctx, 20, 148, 280, 6, '#14101a'); R(ctx, 21, 149, Math.round(278 * clamp(st.prog, 0, 1)), 4, '#5ad05a');
    for (let i = 0; i < 2; i++) R(ctx, 296 - i * 12, 6, 8, 8, i < st.spotted ? '#ff3a3a' : '#3a2a30');
    if (open) { ctx.fillStyle = 'rgba(255,0,0,.08)'; ctx.fillRect(0, 0, MG_W, MG_H); }
  },
  status: st => `${st.th.eye}: ${st.phase === 'open' ? 'СМОТРИТ!' : st.phase === 'warn' ? 'шевелится…' : 'не смотрит'} · путь ${pct(st.prog)} · замечен ${st.spotted}/2`
};

// ================= Торг: остановить стрелку =================
const DEPUTY_LOOK = { skin: '#f0c49c', hair: '#5a3a20', eye: '#3a5a8a', shirt: '#4a5a7a', shirt2: '#e8e4dc', pants: '#2a2a3a', shoes: '#1e1a1e', style: 'short', outfit: 'jacket', build: 'avg', beard: 'mustache', badge: true };
MG.haggle = {
  icon: '🤝', title: 'Торг', keys: 'Пробел / клик — остановить',
  help: 'Помощник шерифа набивает цену. Лови зелёную зону — там его настоящая цена. Три раунда, каждый жёстче.',
  init(o, sp) { return { pos: 0, dir: 1, v: 150 * sp, zone: 54, zx: rnd(40, 200), round: 0, sum: 0, fl: 0, mood: 'sus', bills: 0, steam: 0 }; },
  key(st, k) {
    if (k !== 'space') return;
    const c = st.zx + st.zone / 2, d = Math.abs(st.pos - c);
    const s = d <= st.zone / 2 ? 1 - d / st.zone : 0;
    st.sum += s; st.round++; st.fl = s > 0 ? 0.3 : -0.3;
    st.mood = s > 0.6 ? 'happy' : s > 0 ? 'neutral' : 'angry';
    st.pop(s > 0.6 ? 'Договорились' : s > 0 ? 'Хм…' : 'Ты издеваешься?', 160, 30, s > 0.6 ? 'gold' : s > 0 ? '' : 'bad');
    if (s > 0) st.bills++;
    Sound.sfx(s > 0 ? 'mg_tick' : 'mg_bad');
    st.zone *= 0.8; st.v *= 1.15; st.zx = rnd(20, 260 - st.zone);
    if (st.round >= 3) st.over = true;
  },
  update(st, dt) { st.pos += st.dir * st.v * dt; if (st.pos < 0 || st.pos > 260) { st.dir *= -1; st.pos = clamp(st.pos, 0, 260); } st.fl += st.fl > 0 ? -dt : dt; st.score = st.sum / 3 * 1.15; st.steam += dt; },
  bg() {
    return mgCached('haggle-bg', MG_W, MG_H, x => {
      const win = x.createLinearGradient(0, 0, 0, 70); win.addColorStop(0, '#0a0e22'); win.addColorStop(1, '#2a2040'); x.fillStyle = win; x.fillRect(0, 0, MG_W, 70);
      const n = x.createRadialGradient(270, 30, 2, 270, 30, 50); n.addColorStop(0, 'rgba(255,70,130,.5)'); n.addColorStop(1, 'rgba(255,70,130,0)'); x.fillStyle = n; x.fillRect(200, 0, 120, 70);
      for (let i = 0; i < MG_W; i += 80) R(x, i, 0, 4, 70, '#3a2a20');
      R(x, 0, 66, MG_W, 6, '#a83232'); R(x, 0, 66, MG_W, 2, '#d85a50');
      R(x, 0, 72, MG_W, 22, '#8a2a2a'); for (let i = 10; i < MG_W; i += 20) { R(x, i, 80, 2, 2, '#6a1a1a'); R(x, i, 79, 1, 1, '#c85a50'); } R(x, 0, 72, MG_W, 2, '#b84a44');
      R(x, 0, 96, MG_W, 64, '#f2eee6'); R(x, 0, 96, MG_W, 3, '#ffffff'); R(x, 0, 92, MG_W, 4, '#c8ccd6');
      const rn = seeded(2); for (let i = 0; i < 120; i++) R(x, rn() * MG_W, 100 + rn() * 58, 1, 1, '#d8d0c4');
    });
  },
  draw(ctx, st) {
    ctx.drawImage(this.bg(), 0, 0);
    // помощник шерифа (детальный портрет)
    ctx.drawImage(buildPortraitCached(DEPUTY_LOOK, st.mood), 124, 28, 72, 72);
    // кофе и конверт
    [[60, 112], [222, 112]].forEach(([cx, cy], i) => { pcirc(ctx, cx, cy + 2, 10, 'rgba(0,0,0,.15)'); pcirc(ctx, cx, cy, 10, '#ffffff'); pcirc(ctx, cx, cy, 7, '#4a2a14'); pcirc(ctx, cx - 2, cy - 2, 2, '#6a4a2a'); R(ctx, cx + 9, cy - 2, 4, 4, '#ffffff'); if (Math.sin(st.steam * 3 + i) > 0) R(ctx, cx - 1, cy - 16 - (st.steam * 10 % 6), 2, 4, 'rgba(255,255,255,.5)'); });
    R(ctx, 140, 104, 40, 22, '#d8c8a0'); R(ctx, 140, 104, 40, 2, '#e8dcbc'); pline(ctx, 140, 104, 160, 116, '#b8a880', 1); pline(ctx, 180, 104, 160, 116, '#b8a880', 1);
    for (let i = 0; i < st.bills; i++) { R(ctx, 146 + i * 3, 98 - i * 2, 28, 8, '#5a8a4a'); R(ctx, 146 + i * 3, 98 - i * 2, 28, 1, '#8ac07a'); R(ctx, 156 + i * 3, 100 - i * 2, 8, 4, '#3a6a2a'); }
    // шкала торга
    R(ctx, 30, 134, 262, 16, '#120c08'); R(ctx, 31, 135, 260, 14, '#5a2a1a');
    for (let i = 0; i < 260; i += 26) R(ctx, 31 + i, 135, 1, 14, '#4a2010');
    R(ctx, 31 + st.zx, 135, st.zone, 14, '#3f8a35'); R(ctx, 31 + st.zx, 135, st.zone, 2, '#7ac860');
    const x = 31 + Math.round(st.pos);
    R(ctx, x - 3, 128, 7, 26, '#120c08'); R(ctx, x - 2, 129, 5, 24, st.fl > 0 ? '#ffffff' : st.fl < 0 ? '#ff4a4a' : '#f0c040');
    for (let i = 0; i < 3; i++) { pcirc(ctx, 296 - i * 14, 114, 5, '#8a6a10'); pcirc(ctx, 296 - i * 14, 113, 5, i < st.round ? '#e8b830' : '#d8d0c0'); pcirc(ctx, 295 - i * 14, 112, 2, i < st.round ? '#fff0a0' : '#ece6da'); }
  },
  status: st => `Раунд ${Math.min(3, st.round + 1)}/3 · убедительность ${pct(st.sum / 3)}`
};
const _pc = new Map();
function buildPortraitCached(L, mood) { if (!L._id) Object.defineProperty(L, '_id', { value: _lookId++, enumerable: false }); const k = L._id + mood; if (!_pc.has(k)) _pc.set(k, buildPortrait(L, mood, false)); return _pc.get(k); }

// ================= Напитки: налить до черты =================
const DRINK_COL = { cola: '#4a1a0a', fanta: '#f08020', water: '#9ad0e8', tea: '#a8642a', coffee: '#3a2414' };
MG.pour = {
  icon: '🥤', title: 'Налить напиток', keys: 'Держи Пробел / E / мышь — лить, отпусти у черты',
  help: 'Наливай и отпусти у зелёной черты. Пена ещё чуть поднимется! Идеальный стакан — больше чаевых.',
  init(o, sp) { const lo = rnd(0.68, 0.78); return { lvl: 0, foam: 0, lo, hi: lo + 0.1, rest: 0, sp, col: DRINK_COL[o.drink] || '#4a1a0a', drink: o.drink, ice: Array.from({ length: 4 }, (_, i) => ({ x: 140 + i * 12 + rnd(-2, 2), r: rnd(-1, 1) })) }; },
  update(st, dt) {
    if (st.hold()) {
      st.rest = 0; st.lvl += 0.55 * dt * st.sp; st.foam = Math.min(0.07, st.foam + dt * 0.09); st.startedPour = true;
      if (Math.random() < dt * 10) Sound.sfx('mg_scrub');
      if (Math.random() < dt * 20) mgPart(st, { x: 160 + rnd(-6, 6), y: 140 - st.lvl * 96, vx: rnd(-20, 20), vy: -rnd(10, 30), g: 80, life: 0.4, col: '#ffffff', size: 1 });
    } else if (st.startedPour) { st.rest += dt; const k = Math.min(st.foam, dt * 0.12); st.lvl += k; st.foam -= k; if (st.rest > 0.5) st.over = true; }
    if (st.lvl + st.foam > 1) { st.lvl = 1; st.over = true; st.spill = true; st.pop('Перелил!', 160, 30, 'bad'); }
    const mid = (st.lo + st.hi) / 2, top = st.lvl;
    st.score = st.spill ? 0 : top >= st.lo && top <= st.hi ? 1 - Math.abs(top - mid) * 2 : clamp(1 - Math.abs(top - mid) * 4, 0, 0.6);
    if (st.over && !st.spill && !st.said) { st.said = 1; st.pop(st.score >= 0.85 ? 'Идеально!' : st.score >= 0.5 ? 'Сойдёт' : 'Недолил', 160, 30, st.score >= 0.85 ? 'gold' : st.score >= 0.5 ? '' : 'bad'); }
    if (st.t > 6) st.over = true;
  },
  bg() {
    return mgCached('pour-bg', MG_W, MG_H, x => {
      R(x, 0, 0, MG_W, MG_H, '#b8443a'); for (let i = 0; i < MG_W; i += 16) for (let y = 0; y < MG_H; y += 16) R(x, i, y, 16, 16, ((i + y) / 16) % 2 ? '#c84a40' : '#a83a32');
      R(x, 100, 0, 120, 140, '#c03232'); R(x, 100, 0, 120, 6, '#e05a50'); R(x, 100, 0, 6, 140, '#d84a44'); R(x, 214, 0, 6, 140, '#8a2222');
      R(x, 110, 8, 100, 22, '#f4f2ec'); R(x, 114, 12, 92, 14, '#c03232'); R(x, 120, 16, 80, 2, '#f4f2ec'); R(x, 120, 21, 60, 2, '#f4f2ec');
      ['#3a1a10', '#f08020', '#9ad0e8', '#a8642a', '#5a3a2a'].forEach((c, i) => { R(x, 114 + i * 19, 34, 14, 10, c); R(x, 114 + i * 19, 34, 14, 2, shade(c, 0.3)); R(x, 119 + i * 19, 44, 4, 8, '#c8ccd6'); });
      R(x, 100, 140, 120, 20, '#5a5e66'); R(x, 104, 142, 112, 4, '#8a8e98'); for (let i = 106; i < 214; i += 5) R(x, i, 146, 2, 12, '#3a3e46');
      R(x, 230, 40, 70, 100, '#a0a4ae'); R(x, 230, 40, 70, 4, '#d8dce4'); for (let i = 0; i < 4; i++) { R(x, 244, 52 + i * 12, 42, 9, '#f4f2ec'); R(x, 244, 58 + i * 12, 42, 2, '#d0ccc4'); }
    });
  },
  draw(ctx, st) {
    ctx.drawImage(this.bg(), 0, 0);
    const idx = DRINKS.indexOf(st.drink); if (idx >= 0) R(ctx, 114 + idx * 19, 34 + (st.hold() ? 2 : 0), 14, 10, '#ffffff');
    const gx = 132, gy = 44, gw = 56, gh = 96;
    if (st.hold()) { const top = gy + gh - Math.round(gh * st.lvl); for (let y = 52; y < top; y += 2) R(ctx, 158 + Math.round(Math.sin(y * 0.6 + st.t * 20)), y, 4, 2, st.col); }
    R(ctx, gx - 2, gy, gw + 4, gh + 3, 'rgba(255,255,255,.25)'); R(ctx, gx, gy, gw, gh, 'rgba(255,255,255,.12)');
    const lh = Math.round(gh * st.lvl), fh = Math.round(gh * st.foam);
    R(ctx, gx, gy + gh - lh, gw, lh, st.col); R(ctx, gx, gy + gh - lh, gw, 2, shade(st.col, 0.3));
    R(ctx, gx, gy + gh - lh - fh, gw, fh, '#f4ecdc'); if (fh) for (let i = 0; i < gw; i += 3) { R(ctx, gx + i, gy + gh - lh - fh - 1 - ((i * 7) % 3 ? 1 : 0), 3, 2, '#fff8ec'); R(ctx, gx + i + 1, gy + gh - lh - fh + 2 + (i % 4), 1, 1, '#d8ccb8'); }
    if (lh > 10 && st.drink !== 'tea' && st.drink !== 'coffee') st.ice.forEach(c => { const y = gy + gh - lh + 2; R(ctx, c.x, y, 9, 8, 'rgba(230,245,255,.75)'); R(ctx, c.x + 1, y + 1, 3, 2, '#ffffff'); });
    for (let i = 0; i < 8; i++) { const by = gy + gh - ((st.t * 40 + i * 17) % Math.max(1, lh)); if (lh > 4) R(ctx, gx + 4 + i * 6, by, 2, 2, 'rgba(255,255,255,.45)'); }
    R(ctx, gx, gy, 3, gh, 'rgba(255,255,255,.55)'); R(ctx, gx + gw - 4, gy + 6, 2, gh - 12, 'rgba(255,255,255,.3)');
    R(ctx, gx, gy + 40, gw, 10, 'rgba(200,40,40,.35)');
    const ly = gy + gh - Math.round(gh * st.hi), lh2 = Math.round(gh * (st.hi - st.lo));
    R(ctx, gx - 12, ly, 8, lh2, '#5ad05a'); R(ctx, gx + gw + 4, ly, 8, lh2, '#5ad05a'); mgArrow(ctx, gx - 16, ly + lh2 / 2, 'right', '#5ad05a');
    if (st.spill) { for (let i = 0; i < 4; i++) R(ctx, gx + i * 16, gy, 3, gh, st.col); R(ctx, 104, 140, 112, 4, st.col); }
  },
  status: st => st.spill ? 'Перелил!' : `Уровень: ${pct(st.lvl)} · черта ${pct(st.lo)}–${pct(st.hi)}`
};
