// Атмосфера: зерно плёнки, виньетка, дождь, молнии, туман, пылинки, мотыльки
const Atmos = {
  grainFrames: null, fogCv: null, drops: [], splashes: [], motes: [], moths: [],
  flash: 0, flashT: 6, shake: 0, weather: 'clear',

  init() {
    // зерно: три кадра шума в половинном разрешении (пиксельное)
    this.grainFrames = [0, 1, 2].map(k => {
      const [c, x] = makeCanvas(W, H), img = x.createImageData(W, H), rn = seeded(91 + k);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = rn(); if (v > 0.5) continue;
        const b = v < 0.25 ? 255 : 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 40 + rn() * 60;
      }
      x.putImageData(img, 0, 0); return c;
    });
    // туман: мягкие пятна
    const [f, fx] = makeCanvas(PW, PH), rn = seeded(5);
    for (let i = 0; i < 70; i++) {
      const X = rn() * PW, Y = rn() * PH, r = 30 + rn() * 70, g = fx.createRadialGradient(X, Y, 0, X, Y, r);
      g.addColorStop(0, 'rgba(190,200,220,0.085)'); g.addColorStop(1, 'rgba(190,200,220,0)');
      fx.fillStyle = g; fx.fillRect(X - r, Y - r, r * 2, r * 2);
    }
    this.fogCv = f;
    for (let i = 0; i < 40; i++) this.motes.push({ x: rnd(0, PW), y: rnd(184, 344), vx: rnd(-3, 3), vy: rnd(-4, 1), p: rnd(0, 6) });
    for (let i = 0; i < 5; i++) this.moths.push({ a: rnd(0, 6.28), r: rnd(6, 16), s: rnd(3, 6), p: rnd(0, 6) });
  },

  setWeather(w) { this.weather = w; this.drops = []; this.splashes = []; },

  // ---------- общий пост-эффект ----------
  grain(ctx, a) {
    ctx.globalAlpha = a;
    ctx.drawImage(this.grainFrames[(performance.now() / 70 | 0) % 3], 0, 0, PW, PH);
    ctx.globalAlpha = 1;
  },
  vignette(ctx, a, col = '10,4,16') {
    const g = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.32, PW / 2, PH / 2, PW * 0.62);
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
  },
  pulse(ctx, k) {   // красная пульсация опасности
    if (k <= 0) return;
    const beat = Math.pow(Math.max(0, Math.sin(performance.now() / 1000 * 7.5)), 6);
    this.vignette(ctx, k * (0.25 + beat * 0.35), '140,0,10');
  },

  // ---------- погода (в пикселях холста; area — где идёт дождь) ----------
  update(dt, area) {
    if (this.weather === 'rain') {
      for (let i = 0; i < 10; i++) if (this.drops.length < 220) this.drops.push({ x: rnd(area.x - 40, area.x + area.w), y: area.y - rnd(0, 120), v: rnd(380, 520), gy: rnd(area.y + 10, area.y + area.h) });
      this.drops.forEach(d => { d.x += d.v * 0.18 * dt; d.y += d.v * dt; if (d.y >= d.gy) { d.dead = true; if (chance(0.5)) this.splashes.push({ x: d.x, y: d.gy, t: 0 }); } });
      this.drops = this.drops.filter(d => !d.dead);
      this.splashes.forEach(s => s.t += dt); this.splashes = this.splashes.filter(s => s.t < 0.25);
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash = 1; this.shake = 0.25; setTimeout(() => Sound.sfx('thunder'), rnd(150, 900)); this.flashT = rnd(7, 16); if (chance(0.5)) setTimeout(() => { this.flash = 0.8; }, 140); }
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt);
    this.motes.forEach(m => { m.x += m.vx * dt; m.y += m.vy * dt; m.p += dt; if (m.y < 184 || m.y > 344 || m.x < 0 || m.x > PW) { m.x = rnd(0, PW); m.y = rnd(250, 344); } });
    this.moths.forEach(m => { m.a += m.s * dt; m.p += dt * 9; });
  },
  drawRain(ctx, area) {
    if (this.weather !== 'rain') return;
    ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
    ctx.fillStyle = 'rgba(170,190,230,0.45)';
    this.drops.forEach(d => { for (let k = 0; k < 7; k++) ctx.fillRect(Math.round(d.x - k * 0.9), Math.round(d.y - k * 4), 1, 3); });
    ctx.fillStyle = 'rgba(200,215,255,0.5)';
    this.splashes.forEach(s => { const r = 1 + s.t * 12; ctx.fillRect(Math.round(s.x - r), Math.round(s.y), 2, 1); ctx.fillRect(Math.round(s.x + r - 1), Math.round(s.y), 2, 1); ctx.fillRect(Math.round(s.x), Math.round(s.y - 1 - s.t * 8), 1, 1); });
    ctx.restore();
  },
  // сплошная пелена дождя поверх света (чтобы был виден и в темноте)
  drawRainVeil(ctx, area) {
    if (this.weather !== 'rain') return;
    ctx.fillStyle = 'rgba(120,140,190,0.06)'; ctx.fillRect(area.x, area.y, area.w, area.h);
  },
  drawFog(ctx, t, a = 1) {
    if (this.weather !== 'fog' && this.weather !== 'rain') return;
    const k = (this.weather === 'fog' ? 0.85 : 0.4) * a;
    const o1 = (t * 6) % PW, o2 = (t * 11) % PW;
    const layer = () => {
      ctx.drawImage(this.fogCv, o1, 0); ctx.drawImage(this.fogCv, o1 - PW, 0);
      ctx.drawImage(this.fogCv, -o2, 30); ctx.drawImage(this.fogCv, PW - o2, 30);
    };
    // снаружи гуще, в помещении — лёгкая дымка
    ctx.globalAlpha = k * 0.35; layer();
    ctx.save(); ctx.beginPath(); ctx.rect(OUTDOOR.x, OUTDOOR.y, OUTDOOR.w, OUTDOOR.h); ctx.clip();
    ctx.globalAlpha = k * 0.75; layer();
    ctx.restore();
    ctx.globalAlpha = 1;
  },
  drawFlash(ctx) {
    if (this.flash <= 0) return;
    ctx.fillStyle = `rgba(215,225,255,${this.flash * 0.55})`; ctx.fillRect(0, 0, PW, PH);
  },
  // пылинки в солнечных лучах
  drawMotes(ctx, a) {
    if (a <= 0) return;
    this.motes.forEach(m => {
      const tw = (Math.sin(m.p * 2) + 1) / 2;
      ctx.fillStyle = `rgba(255,245,210,${a * (0.3 + tw * 0.7)})`;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    });
  },
  // мотыльки вокруг фонаря
  drawMoths(ctx, cx, cy) {
    this.moths.forEach(m => {
      const X = Math.round(cx + Math.cos(m.a) * m.r), Y = Math.round(cy + Math.sin(m.a * 1.3) * m.r * 0.6);
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(X, Y, 1, 1);
      if (Math.sin(m.p) > 0) { ctx.fillRect(X - 1, Y - 1, 1, 1); ctx.fillRect(X + 1, Y - 1, 1, 1); }
    });
  },
  // лужи с отражением неона
  drawPuddles(ctx, t, neonOn) {
    [[306, 330, 18, 5], [452, 348, 18, 4], [560, 350, 20, 5], [376, 346, 14, 3]].forEach(([x, y, w, h], i) => {
      ctx.fillStyle = 'rgba(20,24,40,0.55)'; ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(120,140,190,0.25)'; ctx.fillRect(x - w + 4, y - 1, w * 2 - 8, 1);
      if (neonOn) { ctx.fillStyle = 'rgba(255,70,130,0.28)'; ctx.fillRect(x - 6, y - 2, 12, 3); }
      if (this.weather === 'rain') { const r = ((t * 1.6 + i * 0.37) % 1) * (w - 4); ctx.strokeStyle = 'rgba(200,215,255,0.35)'; ctx.beginPath(); ctx.ellipse(x + (i % 2 ? 5 : -5), y, r, r * 0.25, 0, 0, 7); ctx.stroke(); }
    });
  }
};
