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
        <div class="mg-stage"><canvas id="mg-cv" width="${MG_W}" height="${MG_H}"></canvas><div id="mg-msg" class="mg-msg">Приготовься…</div></div>
        <div class="mg-hud"><span id="mg-status"></span><span class="mg-keys">${def.keys}</span></div></div>`, {}, { cls: 'm-mini' });
      const cv = document.getElementById('mg-cv'), ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const msg = document.getElementById('mg-msg'), status = document.getElementById('mg-status');
      const st = Object.assign({ t: 0, score: 0, over: false, speed, o, held: {}, mx: MG_W / 2, my: MG_H / 2, mdown: false, mouse: false, cd: 1.1 }, def.init(o, speed));
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
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (st.shake > 0) { st.shake -= dt; ctx.translate(rint(-2, 2), rint(-1, 1)); }
        def.draw(ctx, st);
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
function mgArrow(ctx, x, y, dir, col) {
  const p = { up: [[2, 0, 2, 1], [1, 1, 4, 1], [0, 2, 6, 1], [2, 3, 2, 3]], down: [[2, 0, 2, 3], [0, 3, 6, 1], [1, 4, 4, 1], [2, 5, 2, 1]],
    left: [[0, 2, 1, 2], [1, 1, 1, 4], [2, 0, 1, 6], [3, 2, 3, 2]], right: [[0, 2, 3, 2], [3, 0, 1, 6], [4, 1, 1, 4], [5, 2, 1, 2]] }[dir];
  p.forEach(([a, b, w, h]) => R(ctx, x - 3 + a, y - 3 + b, w, h, col));
}
function mgBar(ctx, x, y, w, h, v, col, bg = '#2a1a20') {
  R(ctx, x - 1, y - 1, w + 2, h + 2, '#120a0e'); R(ctx, x, y, w, h, bg); R(ctx, x, y, Math.round(w * clamp(v, 0, 1)), h, col);
  R(ctx, x, y, Math.round(w * clamp(v, 0, 1)), 1, 'rgba(255,255,255,.35)');
}
const DIRS = ['left', 'up', 'down', 'right'];

// ================= Подделка: ритм подписи =================
MG.rhythm = {
  icon: '✒', title: 'Подделка записи', keys: '← ↑ ↓ → в такт',
  help: 'Стрелки летят к перу. Жми ту же стрелку, когда она над пером, — так рука выводит чужой почерк.',
  init(o, sp) {
    const n = o.n || 8, v = 70 * sp * (o.fast ? 1.2 : 1);
    return { n, v, hitX: 54, win: 11 + (o.skill || 0) * 2, notes: Array.from({ length: n }, (_, i) => ({ dir: pick(DIRS), x: 330 + i * 46 + rnd(-6, 6) })), sum: 0, done: 0, ink: [], flash: 0 };
  },
  key(st, k) {
    if (!DIRS.includes(k)) return;
    const n = st.notes.find(n => !n.res && Math.abs(n.x - st.hitX) <= st.win + 6);
    if (!n) return;
    const d = Math.abs(n.x - st.hitX);
    if (n.dir === k && d <= st.win) {
      n.res = d <= 4 ? 'perfect' : 'good'; st.sum += d <= 4 ? 1 : 0.7; st.flash = 0.15;
      for (let i = 0; i < 6; i++) st.ink.push([st.ink.length, rnd(-6, 6)]);
      Sound.sfx(d <= 4 ? 'mg_perfect' : 'mg_tick');
    } else { n.res = 'miss'; Sound.sfx('mg_bad'); }
    st.done++;
  },
  update(st, dt) {
    st.flash -= dt;
    st.notes.forEach(n => { n.x -= st.v * dt; if (!n.res && n.x < st.hitX - st.win - 6) { n.res = 'miss'; st.done++; Sound.sfx('mg_bad'); } });
    st.score = st.sum / st.n;
    if (st.done >= st.n) st.over = true;
  },
  draw(ctx, st) {
    R(ctx, 0, 0, MG_W, MG_H, '#f4ecd4');
    for (let y = 14; y < MG_H; y += 12) R(ctx, 0, y, MG_W, 1, '#c8d8e8');
    R(ctx, 30, 0, 1, MG_H, '#e8a0a0');
    R(ctx, 0, 52, MG_W, 20, 'rgba(120,90,60,.12)');
    // перо
    R(ctx, st.hitX - 1, 40, 3, 12, '#2a2a3a'); R(ctx, st.hitX - 3, 34, 7, 7, st.flash > 0 ? '#e8c040' : '#5a4a3a'); R(ctx, st.hitX, 52, 1, 3, '#1a1a2a');
    R(ctx, st.hitX - st.win, 52, st.win * 2 + 1, 20, 'rgba(80,140,60,.18)');
    st.notes.forEach(n => {
      if (n.x > MG_W + 10 || n.x < -10) return;
      const col = n.res === 'perfect' ? '#3a9a2a' : n.res === 'good' ? '#6aaa3a' : n.res === 'miss' ? '#c03a2a' : '#1e2a5a';
      R(ctx, n.x - 7, 55, 14, 14, col); R(ctx, n.x - 6, 56, 12, 12, n.res ? col : '#2a3a7a');
      mgArrow(ctx, Math.round(n.x), 62, n.dir, '#f4ecd4');
    });
    // подпись проявляется по мере попаданий
    let x = 60, y = 120;
    ctx.fillStyle = '#1e2a5a';
    st.ink.forEach(([i, dy]) => { x += 4; const yy = y + Math.round(Math.sin(i * 0.9) * 8 + dy * 0.4); ctx.fillRect(x, yy, 3, 2); ctx.fillRect(x - 2, yy + 1, 2, 1); });
    R(ctx, 56, 136, 220, 1, '#8a7a6a');
  },
  status: st => `Попаданий: ${st.notes.filter(n => n.res === 'perfect' || n.res === 'good').length}/${st.n} · точность ${pct(st.done ? st.sum / st.done : 0)}`
};

// ================= Угон: замок зажигания =================
MG.lockpick = {
  icon: '🔑', title: 'Взлом замка', keys: 'Пробел / клик — когда стрелка в зелёном',
  help: 'Стрелка крутится в замке зажигания. Останови её в зелёной зоне трижды. Три промаха — сигнализация.',
  init(o, sp) { return { ang: 0, vel: 2.4 * sp, dir: 1, tgt: rnd(1, 5.5), w: 0.7, hits: 0, misses: 0, pins: 3, fl: 0 }; },
  key(st, k) {
    if (k !== 'space') return;
    let d = Math.abs(((st.ang - st.tgt) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    if (d < st.w / 2) { st.hits++; st.w *= 0.8; st.vel *= 1.2; st.dir *= -1; st.tgt = rnd(0, Math.PI * 2); st.fl = 0.2; Sound.sfx('mg_ratchet'); }
    else { st.misses++; st.fl = -0.25; Sound.sfx('mg_bad'); st.shake = 0.2; }
    if (st.hits >= st.pins || st.misses >= 3) st.over = true;
  },
  update(st, dt) { st.ang += st.vel * st.dir * dt; st.fl += st.fl > 0 ? -dt : dt; if (Math.abs(st.fl) < 0.02) st.fl = 0; st.score = st.hits / st.pins - st.misses * 0.08; },
  draw(ctx, st) {
    R(ctx, 0, 0, MG_W, MG_H, '#1a1a22');
    for (let i = 0; i < MG_W; i += 8) R(ctx, i, 120, 4, 40, '#22222c');
    // приборная панель
    R(ctx, 0, 110, MG_W, 50, '#2a2a34'); R(ctx, 0, 110, MG_W, 2, '#4a4a58');
    const cx = 110, cy = 70;
    ctx.fillStyle = '#5a5a66'; ctx.beginPath(); ctx.arc(cx, cy, 52, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a8a96'; ctx.beginPath(); ctx.arc(cx, cy, 46, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a3a44'; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, 7); ctx.fill();
    ctx.strokeStyle = '#5ad05a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, 34, st.tgt - st.w / 2, st.tgt + st.w / 2); ctx.stroke();
    ctx.strokeStyle = '#2a7a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 30, st.tgt - st.w / 2, st.tgt + st.w / 2); ctx.stroke();
    ctx.strokeStyle = st.fl > 0 ? '#ffffff' : st.fl < 0 ? '#ff4a4a' : '#f0c040'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(st.ang) * 38, cy + Math.sin(st.ang) * 38); ctx.stroke();
    R(ctx, cx - 4, cy - 8, 8, 16, '#1a1a22'); R(ctx, cx - 2, cy - 6, 4, 12, '#c8a040');
    // штифты
    for (let i = 0; i < st.pins; i++) { const up = i < st.hits; R(ctx, 200 + i * 26, up ? 34 : 44, 14, 30, up ? '#5ad05a' : '#8a8a96'); R(ctx, 198 + i * 26, 76, 18, 6, '#4a4a58'); }
    for (let i = 0; i < 3; i++) R(ctx, 200 + i * 14, 104, 10, 6, i < st.misses ? '#ff3a3a' : '#3a3a44');
  },
  status: st => `Штифты: ${st.hits}/${st.pins} · промахи: ${st.misses}/3`
};

// ================= Сжечь: мехи и жар =================
MG.bellows = {
  icon: '🔥', title: 'Сжечь вещи', keys: 'Держи Пробел / мышь — раздувать',
  help: 'Держи жар в зелёной полосе: слабый огонь не сожжёт вещи, слишком сильный даст столб дыма.',
  init(o, sp) { return { heat: 0.3, c: 0.6, w: 0.24, inT: 0, need: 6, dur: 11 / Math.sqrt(sp), smoke: 0, sp }; },
  update(st, dt) {
    st.heat = clamp(st.heat + (st.hold() ? 0.85 : -0.5) * dt * st.sp, 0, 1);
    st.c = 0.55 + Math.sin(st.t * 0.9) * 0.2; st.w = 0.24 - st.t * 0.006;
    if (Math.abs(st.heat - st.c) < st.w / 2) st.inT += dt;
    if (st.heat > 0.93) st.smoke += dt;
    if (st.hold() && Math.random() < dt * 6) Sound.sfx('mg_pump');
    st.score = st.inT / st.need - st.smoke * 0.08;
    if (st.inT >= st.need || st.t >= st.dur) st.over = true;
  },
  draw(ctx, st) {
    R(ctx, 0, 0, MG_W, MG_H, '#0e0c18');
    for (let i = 0; i < 30; i++) R(ctx, (i * 53) % MG_W, (i * 29) % 70, 1, 1, '#4a4a6a');
    R(ctx, 0, 120, MG_W, 40, '#1e1a14'); for (let i = 0; i < MG_W; i += 6) R(ctx, i, 120 + (i % 12 ? 2 : 0), 3, 2, '#2a241a');
    // бочка
    R(ctx, 70, 80, 60, 44, '#5a3a2a'); R(ctx, 70, 80, 60, 3, '#7a5a3a'); R(ctx, 70, 96, 60, 2, '#3a2418'); R(ctx, 70, 112, 60, 2, '#3a2418');
    const h = st.heat, fl = Math.round(10 + h * 50);
    for (let i = 0; i < 14; i++) {
      const x = 74 + i * 4, hh = Math.round(fl * (0.5 + 0.5 * Math.abs(Math.sin(st.t * 7 + i * 1.7))));
      R(ctx, x, 80 - hh, 4, hh, h > 0.9 ? '#e8e8e8' : '#e05a1a'); R(ctx, x + 1, 80 - hh * 0.7, 2, hh * 0.7, '#f8c040'); R(ctx, x + 1, 80 - hh * 0.35, 2, hh * 0.35, '#fff4b0');
    }
    if (st.smoke > 0 || h > 0.9) for (let i = 0; i < 6; i++) { const y = (st.t * 30 + i * 20) % 80; R(ctx, 90 + Math.sin(st.t + i) * 10 + i * 3, 20 - y + 40, 8, 6, 'rgba(160,160,170,.5)'); }
    ctx.fillStyle = 'rgba(255,140,40,' + (0.1 + h * 0.25) + ')'; ctx.beginPath(); ctx.arc(100, 80, 40 + h * 40, 0, 7); ctx.fill();
    // чемодан в огне
    R(ctx, 86, 66, 26, 16, '#6a4a2a'); R(ctx, 96, 62, 6, 4, '#3a2418');
    // мехи
    const sq = st.hold() ? 6 : 0;
    R(ctx, 140, 96 + sq / 2, 34, 18 - sq, '#8a5a30'); R(ctx, 140, 96 + sq / 2, 34, 2, '#aa7a4a'); R(ctx, 132, 102, 8, 4, '#5a5a66'); R(ctx, 174, 100, 16, 3, '#6a4a2a');
    // термометр
    const tx = 230, ty = 14, th = 120;
    R(ctx, tx - 2, ty - 2, 24, th + 4, '#2a2a34'); R(ctx, tx, ty, 20, th, '#14121a');
    R(ctx, tx, ty + th * (1 - st.c - st.w / 2), 20, th * st.w, 'rgba(90,200,80,.55)');
    R(ctx, tx + 4, ty + th * (1 - h), 12, th * h, h > 0.93 ? '#ff4a2a' : '#f08020');
    R(ctx, tx - 6, Math.round(ty + th * (1 - h)) - 1, 32, 2, '#ffffff');
    mgBar(ctx, 262, 20, 8, 110, 0, '#000'); R(ctx, 262, 20 + 110 * (1 - clamp(st.inT / st.need, 0, 1)), 8, 110 * clamp(st.inT / st.need, 0, 1), '#5ad05a');
  },
  status: st => `Горит: ${pct(st.inT / st.need)} · дым: ${st.smoke > 0 ? st.smoke.toFixed(1) + ' с' : 'нет'} · время ${Math.max(0, st.dur - st.t).toFixed(1)} с`
};

// ================= Отмыть номер =================
MG.scrub = {
  icon: '🧽', title: 'Отмыть номер', keys: 'Мышь (зажать) или стрелки + Пробел',
  help: 'Три пятна, пока губка ещё мыльная. Чем больше отмоешь, тем меньше заметит уборщица и проверка.',
  init(o, sp) {
    const [m, mx] = makeCanvas(MG_W, MG_H);
    const n = o.light ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const X = rnd(40, 280), Y = rnd(30, 140), col = o.light ? 'rgba(90,70,50,1)' : 'rgba(120,10,16,1)';
      mx.fillStyle = col;
      for (let k = 0; k < 7; k++) { mx.beginPath(); mx.ellipse(X + rnd(-14, 14), Y + rnd(-8, 8), rnd(5, 13), rnd(3, 8), rnd(0, 3), 0, 7); mx.fill(); }
      if (!o.light) for (let k = 0; k < 6; k++) mx.fillRect(X + rnd(-30, 30), Y + rnd(-20, 20), 2, 2);
    }
    const st = { mask: m, mx2: mx, cx: 160, cy: 80, left: 1, total: 0, chk: 0, dur: (o.light ? 9 : 13) / Math.sqrt(sp), bubbles: [] };
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
      if (Math.random() < dt * 14) { st.bubbles.push({ x: st.cx + rnd(-10, 10), y: st.cy + rnd(-6, 6), t: 0 }); Sound.sfx('mg_scrub'); }
    }
    st.bubbles.forEach(b => { b.t += dt; b.y -= dt * 10; }); st.bubbles = st.bubbles.filter(b => b.t < 0.8);
    st.chk -= dt; if (st.chk <= 0) { st.chk = 0.2; st.left = MG.scrub.count(st) / Math.max(1, st.total); }
    st.score = (1 - st.left) / 0.9;
    if (st.left < 0.08 || st.t >= st.dur) st.over = true;
  },
  draw(ctx, st) {
    for (let y = 0; y < MG_H; y += 8) for (let x = 0; x < MG_W; x += 8) R(ctx, x, y, 8, 8, ((x + y) / 8) % 2 ? '#5a1e26' : '#4e1a20');
    for (let y = 4; y < MG_H; y += 16) for (let x = 4; x < MG_W; x += 16) R(ctx, x + 3, y + 3, 2, 2, '#8a6a2a');
    R(ctx, 0, 0, 90, 40, '#d8d0c0'); R(ctx, 0, 0, 90, 6, '#f4f0e4'); R(ctx, 0, 34, 90, 6, '#a89a8a'); R(ctx, 8, 8, 30, 18, '#ffffff');
    ctx.drawImage(st.mask, 0, 0);
    st.bubbles.forEach(b => { R(ctx, b.x, b.y, 3, 3, 'rgba(255,255,255,.8)'); R(ctx, b.x + 1, b.y + 1, 1, 1, '#c8e8ff'); });
    const x = Math.round(st.cx), y = Math.round(st.cy), w = st.hold() ? 1 : 0;
    R(ctx, x - 9, y - 6 + w, 18, 12, '#2a1a10'); R(ctx, x - 8, y - 5 + w, 16, 10, '#f0d040'); R(ctx, x - 8, y + 2 + w, 16, 3, '#3a8a3a');
    R(ctx, x - 6, y - 4 + w, 2, 2, '#fff4a0'); R(ctx, x + 2, y - 3 + w, 2, 2, '#c8a020');
  },
  status: st => `Отмыто: ${pct(1 - st.left)} · время ${Math.max(0, st.dur - st.t).toFixed(1)} с`
};

// ================= Разобрать машину: болты =================
MG.mash = {
  icon: '🔧', title: 'Разобрать на запчасти', keys: 'Чередуй ← →',
  help: 'Открути четыре болта колеса: быстро чередуй стрелки влево-вправо. Если медлить, болт затягивается обратно.',
  init(o, sp) { return { done: 0, prog: 0, last: '', bolts: 4, dur: 11 / Math.sqrt(sp), rot: 0 }; },
  key(st, k) {
    if ((k === 'left' || k === 'right') && k !== st.last) { st.prog += 0.1; st.rot += 0.6; st.last = k; Sound.sfx('mg_ratchet'); }
  },
  update(st, dt) {
    st.prog = Math.max(0, st.prog - 0.13 * dt);
    if (st.prog >= 1) { st.done++; st.prog = 0; Sound.sfx('mg_perfect'); }
    st.score = (st.done + st.prog) / st.bolts;
    if (st.done >= st.bolts || st.t >= st.dur) st.over = true;
  },
  draw(ctx, st) {
    R(ctx, 0, 0, MG_W, MG_H, '#2a2a30'); for (let i = 0; i < 400; i++) R(ctx, (i * 37) % MG_W, (i * 53) % MG_H, 1, 1, '#34343c');
    const cx = 120, cy = 80;
    ctx.fillStyle = '#141418'; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, 7); ctx.fill();
    ctx.fillStyle = '#22222a'; for (let a = 0; a < 6.28; a += 0.26) { ctx.fillRect(cx + Math.cos(a) * 64 - 3, cy + Math.sin(a) * 64 - 3, 6, 6); }
    ctx.fillStyle = '#9a9aa6'; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, 7); ctx.fill();
    ctx.fillStyle = '#c8c8d4'; ctx.beginPath(); ctx.arc(cx - 4, cy - 4, 36, 0, 7); ctx.fill();
    ctx.fillStyle = '#6a6a76'; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 7); ctx.fill();
    for (let i = 0; i < st.bolts; i++) {
      const a = i * Math.PI / 2 + 0.6, x = cx + Math.cos(a) * 26, y = cy + Math.sin(a) * 26;
      if (i < st.done) { R(ctx, x - 3, y - 3, 6, 6, '#1a1a20'); continue; }
      R(ctx, x - 5, y - 5, 10, 10, i === st.done ? '#f0c040' : '#5a5a66'); R(ctx, x - 3, y - 3, 6, 6, '#3a3a44');
      if (i === st.done) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(st.rot);
        ctx.fillStyle = '#b8b8c4'; ctx.fillRect(-3, -40, 6, 36); ctx.fillStyle = '#8a8a96'; ctx.fillRect(-7, -8, 14, 8); ctx.restore();
      }
    }
    for (let i = 0; i < st.bolts; i++) R(ctx, 230 + i * 16, 30, 12, 12, i < st.done ? '#5ad05a' : '#4a4a58'); mgBar(ctx, 230, 66, 70, 10, st.prog, '#f0c040');
    mgArrow(ctx, 246, 100, 'left', st.held.left ? '#ffffff' : '#6a6a76'); mgArrow(ctx, 276, 100, 'right', st.held.right ? '#ffffff' : '#6a6a76');
  },
  status: st => `Болты: ${st.done}/${st.bolts} · время ${Math.max(0, st.dur - st.t).toFixed(1)} с`
};

// ================= Трасса: увести машину / вывезти вещи =================
MG.drive = {
  icon: '🚗', title: 'Ночная трасса', keys: '← → смена полосы',
  help: 'Уезжай подальше от мотеля. Не попадайся патрулю и не врезайся. Каждое столкновение — свидетель.',
  init(o, sp) { return { lane: 1, x: 160, obs: [], spawn: 0.8, scroll: 0, v: 130 * sp, hits: 0, inv: 0, dur: 12, col: o.color || '#3f6fb0' }; },
  key(st, k) { if (k === 'left') st.lane = Math.max(0, st.lane - 1); if (k === 'right') st.lane = Math.min(2, st.lane + 1); },
  laneX: l => 104 + l * 56,
  update(st, dt) {
    st.x += (MG.drive.laneX(st.lane) - st.x) * Math.min(1, dt * 12);
    st.scroll = (st.scroll + st.v * dt) % 40;
    st.spawn -= dt;
    if (st.spawn <= 0) { st.spawn = rnd(0.55, 1.05) / (1 + st.t / 20); st.obs.push({ lane: rint(0, 2), y: -40, type: pick(['cop', 'cop', 'car', 'cone']), col: pick(CAR_COLORS) }); }
    st.obs.forEach(o => { o.y += (st.v + (o.type === 'car' ? -40 : o.type === 'cone' ? 0 : 30)) * dt; });
    st.inv -= dt;
    st.obs.forEach(o => {
      if (!o.hit && st.inv <= 0 && Math.abs(MG.drive.laneX(o.lane) - st.x) < 22 && Math.abs(o.y - 104) < 40) { o.hit = true; st.hits++; st.inv = 1; st.shake = 0.3; Sound.sfx('mg_crash'); }
    });
    st.obs = st.obs.filter(o => o.y < MG_H + 60);
    st.score = 1 - st.hits * 0.34;
    if (st.t >= st.dur || st.hits >= 3) st.over = true;
  },
  draw(ctx, st) {
    R(ctx, 0, 0, MG_W, MG_H, '#0e1a12');
    for (let i = 0; i < 12; i++) { const y = ((i * 37 + st.scroll * 2) % (MG_H + 40)) - 20; R(ctx, 20 + (i % 3) * 12, y, 14, 14, '#14301e'); R(ctx, 272 + (i % 2) * 14, y + 10, 16, 16, '#14301e'); }
    R(ctx, 74, 0, 172, MG_H, '#2a2a30'); R(ctx, 74, 0, 3, MG_H, '#d8d0c0'); R(ctx, 243, 0, 3, MG_H, '#d8d0c0');
    for (let l = 1; l < 3; l++) for (let y = -40 + st.scroll; y < MG_H; y += 40) R(ctx, 76 + l * 56 + 1, y, 3, 20, '#e8c040');
    st.obs.forEach(o => {
      const x = MG.drive.laneX(o.lane);
      if (o.type === 'cone') { R(ctx, x - 6, o.y, 12, 12, '#f07020'); R(ctx, x - 4, o.y + 4, 8, 2, '#ffffff'); return; }
      ctx.save(); ctx.translate(x, o.y + 26); ctx.rotate(Math.PI); drawCar(ctx, -16, -26, o.type === 'cop' ? '#e8e8f0' : o.col); ctx.restore();
      if (o.type === 'cop') { const f = Math.floor(st.t * 8) % 2; R(ctx, x - 8, o.y + 22, 7, 3, f ? '#ff2a2a' : '#2a4aff'); R(ctx, x + 1, o.y + 22, 7, 3, f ? '#2a4aff' : '#ff2a2a'); ctx.fillStyle = f ? 'rgba(255,40,40,.12)' : 'rgba(40,80,255,.12)'; ctx.beginPath(); ctx.arc(x, o.y + 24, 30, 0, 7); ctx.fill(); }
    });
    if (st.inv <= 0 || Math.floor(st.t * 10) % 2) drawCar(ctx, Math.round(st.x - 16), 80, st.col);
    ctx.fillStyle = 'rgba(255,250,200,.10)'; ctx.beginPath(); ctx.moveTo(st.x - 10, 80); ctx.lineTo(st.x - 34, 0); ctx.lineTo(st.x + 34, 0); ctx.lineTo(st.x + 10, 80); ctx.fill();
    const g = ctx.createRadialGradient(160, 80, 60, 160, 80, 200); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,.7)'); ctx.fillStyle = g; ctx.fillRect(0, 0, MG_W, MG_H);
    mgBar(ctx, 8, 8, 56, 6, st.t / st.dur, '#5ad05a');
  },
  status: st => `Пройдено: ${pct(st.t / st.dur)} · столкновения: ${st.hits}/3`
};

// ================= «Тише едешь»: двигаться, пока не смотрят =================
const RL_THEMES = {
  hide:  { icon: '🧳', title: 'Спрятать вещи', target: 'тайник за котельной', eye: 'Смотритель', help: 'Неси чемодан к тайнику, пока смотритель отвернулся. Он поворачивается — замри.' },
  plant: { icon: '🚪', title: 'Подбросить вещи', target: 'дверь соседнего номера', eye: 'Сосед', help: 'Пробирайся к чужой двери, пока сосед не выглядывает в глазок. Шевельнёшься при открытом глазе — заметят.' },
  pet:   { icon: '🐾', title: 'Увести питомца', target: 'лежанка питомца', eye: 'Хозяин', help: 'Хозяин дремлет вполглаза. Подкрадывайся, только когда глаз закрыт.' }
};
MG.redlight = {
  icon: '👁', title: 'Тише едешь', keys: 'Держи Пробел / мышь — идти, отпусти — замереть',
  help: '',
  init(o, sp) { const th = RL_THEMES[o.theme || 'hide']; return { th, prog: 0, phase: 'closed', pt: rnd(1.2, 2.2) / sp, spotted: 0, seenThis: false, dur: 14, sp, walk: 0 }; },
  update(st, dt) {
    st.pt -= dt;
    if (st.pt <= 0) {
      if (st.phase === 'closed') { st.phase = 'warn'; st.pt = 0.55 / st.sp; Sound.sfx('mg_tick'); }
      else if (st.phase === 'warn') { st.phase = 'open'; st.pt = rnd(0.9, 1.7); st.seenThis = false; }
      else { st.phase = 'closed'; st.pt = rnd(1.1, 2.3) / st.sp; }
    }
    if (st.hold()) {
      if (st.phase === 'open') { if (!st.seenThis) { st.seenThis = true; st.spotted++; st.shake = 0.3; Sound.sfx('mg_bad'); } }
      else { st.prog += 0.13 * dt * st.sp; st.walk += dt; }
    }
    st.score = st.prog >= 1 ? 1 - st.spotted * 0.4 : st.prog * 0.6 - st.spotted * 0.2;
    if (st.prog >= 1 || st.spotted >= 2 || st.t >= st.dur) { if (st.spotted >= 2) st.score = Math.min(st.score, 0.1); st.over = true; }
  },
  draw(ctx, st) {
    const th = st.th, dark = st.o.theme === 'pet';
    R(ctx, 0, 0, MG_W, MG_H, dark ? '#16121e' : '#2a1e24');
    for (let y = 96; y < MG_H; y += 8) for (let x = 0; x < MG_W; x += 8) R(ctx, x, y, 8, 8, ((x + y) / 8) % 2 ? '#4a1a20' : '#401618');
    R(ctx, 0, 40, MG_W, 56, '#3a2a30'); R(ctx, 0, 90, MG_W, 6, '#2a1a1e');
    // цель
    const tx = 286;
    if (st.o.theme === 'plant') { R(ctx, tx - 14, 44, 28, 52, '#6a4228'); R(ctx, tx - 12, 46, 24, 48, '#7a5232'); R(ctx, tx + 6, 70, 3, 3, '#e0c060'); }
    else if (st.o.theme === 'pet') { R(ctx, tx - 18, 100, 36, 14, '#8a3a3a'); R(ctx, tx - 12, 94, 24, 10, '#c8a070'); R(ctx, tx + 6, 92, 6, 5, '#c8a070'); R(ctx, tx + 9, 93, 1, 1, '#000'); }
    else { R(ctx, tx - 16, 50, 32, 46, '#4a4a52'); R(ctx, tx - 14, 52, 28, 42, '#2a2a30'); R(ctx, tx - 4, 70, 8, 4, '#6a6a76'); }
    // глаз
    const ex = 160, ey = 20, open = st.phase === 'open', warn = st.phase === 'warn';
    R(ctx, ex - 26, ey - 12, 52, 24, '#120c10');
    if (open || warn) {
      const h = open ? 8 : 3;
      R(ctx, ex - 20, ey - h, 40, h * 2, '#f4f0e8'); R(ctx, ex - 6, ey - Math.min(h, 6), 12, Math.min(h, 6) * 2, open ? '#8a2a1a' : '#5a4a3a'); R(ctx, ex - 2, ey - 2, 4, 4, '#000');
      if (open) { ctx.fillStyle = 'rgba(255,40,40,.12)'; ctx.fillRect(0, 0, MG_W, MG_H); }
    } else { R(ctx, ex - 20, ey, 40, 2, '#c8b8a8'); for (let i = -16; i <= 16; i += 8) R(ctx, ex + i, ey + 2, 1, 3, '#c8b8a8'); }
    // игрок крадётся
    const px2 = 24 + st.prog * (tx - 50), step = st.hold() && !open ? Math.floor(st.walk * 6) : 0;
    drawChar(ctx, px2 / S, 104 / S, NIGHT_LOOK, 'right', step, {});
    R(ctx, px2 + 8, 82, 10, 8, st.o.theme === 'pet' ? '#c8a070' : '#6a4a2a');
    mgBar(ctx, 20, 146, 280, 6, st.prog, '#5ad05a');
    for (let i = 0; i < 2; i++) R(ctx, 290 - i * 12, 8, 8, 8, i < st.spotted ? '#ff3a3a' : '#3a2a30');
  },
  status: st => `${st.th.eye}: ${st.phase === 'open' ? 'СМОТРИТ!' : st.phase === 'warn' ? 'шевелится…' : 'не смотрит'} · путь ${pct(st.prog)} · замечен ${st.spotted}/2`
};

// ================= Торг: остановить стрелку =================
MG.haggle = {
  icon: '🤝', title: 'Торг', keys: 'Пробел / клик — остановить',
  help: 'Стрелка мечется между «скупо» и «щедро». Лови зелёную зону — там его цена. Три раунда.',
  init(o, sp) { return { pos: 0, dir: 1, v: 150 * sp, zone: 54, zx: rnd(40, 200), round: 0, sum: 0, fl: 0 }; },
  key(st, k) {
    if (k !== 'space') return;
    const c = st.zx + st.zone / 2, d = Math.abs(st.pos - c);
    const s = d <= st.zone / 2 ? 1 - d / st.zone : 0;
    st.sum += s; st.round++; st.fl = s > 0 ? 0.3 : -0.3; Sound.sfx(s > 0 ? 'mg_tick' : 'mg_bad');
    st.zone *= 0.8; st.v *= 1.15; st.zx = rnd(20, 260 - st.zone);
    if (st.round >= 3) st.over = true;
  },
  update(st, dt) { st.pos += st.dir * st.v * dt; if (st.pos < 0 || st.pos > 260) { st.dir *= -1; st.pos = clamp(st.pos, 0, 260); } st.fl += st.fl > 0 ? -dt : dt; st.score = st.sum / 3 * 1.15; },
  draw(ctx, st) {
    R(ctx, 0, 0, MG_W, MG_H, '#2a2018');
    R(ctx, 0, 0, MG_W, 50, '#3a2a1e'); R(ctx, 20, 10, 80, 30, '#5a3a22');
    R(ctx, 30, 78, 262, 18, '#120c08'); R(ctx, 31, 79, 260, 16, '#5a2a1a');
    R(ctx, 31 + st.zx, 79, st.zone, 16, '#3f8a35'); R(ctx, 31 + st.zx, 79, st.zone, 2, '#7ac860');
    const x = 31 + Math.round(st.pos);
    R(ctx, x - 2, 70, 5, 34, '#120c08'); R(ctx, x - 1, 71, 3, 32, st.fl > 0 ? '#ffffff' : st.fl < 0 ? '#ff4a4a' : '#f0c040');
    for (let i = 0; i < 3; i++) R(ctx, 130 + i * 22, 126, 16, 16, i < st.round ? '#e8c060' : '#3a2a1e');
  },
  status: st => `Раунд ${Math.min(3, st.round + 1)}/3 · убедительность ${pct(st.sum / 3)}`
};

// ================= Напитки: налить до черты =================
const DRINK_COL = { cola: '#4a1a0a', fanta: '#f08020', water: '#9ad0e8', tea: '#a8642a', coffee: '#3a2414' };
MG.pour = {
  icon: '🥤', title: 'Налить напиток', keys: 'Держи Пробел / E / мышь — лить, отпусти у черты',
  help: 'Наливай и отпусти у зелёной черты. Пена ещё чуть поднимется! Идеальный стакан — больше чаевых.',
  init(o, sp) { const lo = rnd(0.68, 0.78); return { lvl: 0, foam: 0, lo, hi: lo + 0.1, started: false, rest: 0, sp, col: DRINK_COL[o.drink] || '#4a1a0a' }; },
  update(st, dt) {
    if (st.hold()) { st.rest = 0; st.lvl += 0.55 * dt * st.sp; st.foam = Math.min(0.06, st.foam + dt * 0.08); st.startedPour = true; if (Math.random() < dt * 10) Sound.sfx('mg_scrub'); }
    else if (st.startedPour) { st.rest += dt; const k = Math.min(st.foam, dt * 0.12); st.lvl += k; st.foam -= k; if (st.rest > 0.5) st.over = true; }
    if (st.lvl + st.foam > 1) { st.lvl = 1; st.over = true; st.spill = true; }
    const mid = (st.lo + st.hi) / 2, top = st.lvl;
    st.score = st.spill ? 0 : top >= st.lo && top <= st.hi ? 1 - Math.abs(top - mid) * 2 : clamp(1 - Math.abs(top - mid) * 4, 0, 0.6);
    if (st.t > 6) st.over = true;
  },
  draw(ctx, st) {
    R(ctx, 0, 0, MG_W, MG_H, '#a02a2a'); R(ctx, 0, 0, MG_W, 6, '#d84a40'); R(ctx, 0, 140, MG_W, 20, '#5a5e66'); for (let i = 0; i < MG_W; i += 6) R(ctx, i, 140, 2, 20, '#3a3e46');
    R(ctx, 140, 6, 40, 20, '#2a2a30'); R(ctx, 154, 26, 12, 10, '#c8ccd6');
    if (st.hold()) R(ctx, 158, 36, 4, 104 - Math.round(st.lvl * 90), st.col);
    const gx = 130, gy = 40, gw = 60, gh = 100;
    R(ctx, gx - 2, gy, gw + 4, gh + 2, 'rgba(255,255,255,.35)');
    const lh = Math.round(gh * st.lvl), fh = Math.round(gh * st.foam);
    R(ctx, gx, gy + gh - lh, gw, lh, st.col); R(ctx, gx, gy + gh - lh - fh, gw, fh, 'rgba(255,250,235,.85)');
    for (let i = 0; i < 6; i++) R(ctx, gx + 6 + i * 9, gy + gh - ((st.t * 30 + i * 13) % Math.max(1, lh)), 2, 2, 'rgba(255,255,255,.4)');
    R(ctx, gx - 10, gy + gh - Math.round(gh * st.hi), 8, Math.round(gh * (st.hi - st.lo)), '#5ad05a');
    R(ctx, gx + gw + 2, gy + gh - Math.round(gh * st.hi), 8, Math.round(gh * (st.hi - st.lo)), '#5ad05a');
    R(ctx, gx, gy, 2, gh, 'rgba(255,255,255,.6)');
    if (st.spill) for (let i = 0; i < 10; i++) R(ctx, gx - 10 + i * 8, 136 + (i % 2) * 2, 6, 3, st.col);
  },
  status: st => st.spill ? 'Перелил!' : `Уровень: ${pct(st.lvl)} · черта ${pct(st.lo)}–${pct(st.hi)}`
};
