// Графическое ядро: мир в 320×180 «единицах», рисуем в 640×360 пикселей
const W = 320, H = 180;           // размеры мира (логика)
const S = 2;                      // пикселей на единицу мира
const PW = W * S, PH = H * S;     // реальное разрешение холста

// прямоугольник в пикселях холста
function R(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
const px = v => Math.round(v * S);

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }

// детерминированный ГСЧ для текстур
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// осветлить/затемнить цвет #rrggbb на amt (-1..1)
const _shadeCache = {};
function shade(hex, amt) {
  const k = hex + amt;
  if (_shadeCache[k]) return _shadeCache[k];
  let n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const f = v => Math.round(clamp(amt > 0 ? v + (255 - v) * amt : v * (1 + amt), 0, 255));
  // тени уводим в холодный, свет — в тёплый оттенок
  r = f(r) + (amt > 0 ? 4 : -2); g = f(g); b = f(b) + (amt < 0 ? 6 : -4);
  return (_shadeCache[k] = '#' + [r, g, b].map(v => clamp(v, 0, 255).toString(16).padStart(2, '0')).join(''));
}

// тёмный контур вокруг непрозрачных пикселей (как в Stardew)
function outline(canvas, col = [34, 20, 28]) {
  const x = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = x.getImageData(0, 0, w, h), d = img.data, src = new Uint8ClampedArray(d);
  const a = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? 0 : src[(j * w + i) * 4 + 3];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const o = (j * w + i) * 4;
    if (src[o + 3] > 0) continue;
    if (a(i - 1, j) > 100 || a(i + 1, j) > 100 || a(i, j - 1) > 100 || a(i, j + 1) > 100) { d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
  return canvas;
}

// мягкая тень-эллипс
function shadow(ctx, x, y, w, h, a = 0.3) {
  ctx.fillStyle = `rgba(20,10,20,${a})`;
  ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), w, h, 0, 0, Math.PI * 2); ctx.fill();
}

// ---------- пиксельный шрифт 3×5 ----------
const FONT = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  '$': '011110010011110', '+': '000010111010000', '-': '000000111000000', '!': '010010010000010', '?': '111001011000010',
  ':': '000010000010000', '.': '000000000000010', ' ': '000000000000000', '%': '101001010100101',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101',
  N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010'
};
function pText(ctx, str, x, y, col, sc = 1, shadowCol) {
  str = String(str).toUpperCase();
  const draw = (ox, oy, c) => {
    ctx.fillStyle = c;
    for (let k = 0; k < str.length; k++) {
      const g = FONT[str[k]] || FONT['?'];
      for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(Math.round(ox + (k * 4 + i % 3) * sc), Math.round(oy + Math.floor(i / 3) * sc), sc, sc);
    }
  };
  if (shadowCol) draw(x + sc, y + sc, shadowCol);
  draw(x, y, col);
}
const pTextW = (str, sc = 1) => (String(str).length * 4 - 1) * sc;

// ---------- частицы (в координатах мира) ----------
const Particles = {
  list: [],
  add(p) { this.list.push(Object.assign({ vx: 0, vy: 0, life: 1, t: 0, size: 2, col: '#fff', g: 0 }, p)); },
  steam(x, y) { this.add({ x: x + rnd(-3, 3), y, vx: rnd(-3, 3), vy: rnd(-14, -8), life: rnd(0.8, 1.4), size: rint(2, 3), col: 'rgba(255,255,255,0.5)', kind: 'puff' }); },
  smoke(x, y) { this.add({ x: x + rnd(-3, 3), y, vx: rnd(-4, 4), vy: rnd(-12, -6), life: rnd(1.2, 2), size: rint(3, 5), col: 'rgba(40,36,40,0.6)', kind: 'puff' }); },
  text(x, y, s, col) { this.add({ x, y, vy: -12, life: 1.4, text: s, col }); },
  sparkle(x, y, col = '#fff6a0') { for (let i = 0; i < 6; i++) this.add({ x, y, vx: rnd(-25, 25), vy: rnd(-30, -5), g: 60, life: rnd(0.4, 0.8), size: 2, col }); },
  update(dt) {
    this.list.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; });
    this.list = this.list.filter(p => p.t < p.life);
  },
  draw(ctx) {
    this.list.forEach(p => {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = clamp(k * 1.5, 0, 1);
      if (p.text) { pText(ctx, p.text, px(p.x) - pTextW(p.text, 2) / 2, px(p.y), p.col, 2, '#2a1420'); }
      else if (p.kind === 'puff') { const s = p.size + (1 - k) * 3; R(ctx, px(p.x) - s, px(p.y) - s, s * 2, s * 2, p.col); }
      else R(ctx, px(p.x), px(p.y), p.size, p.size, p.col);
    });
    ctx.globalAlpha = 1;
  }
};

// ---------- освещение: затемнение с «дырами» света ----------
const Light = {
  cv: null, cx: null,
  begin(color, alpha) {
    if (!this.cv) [this.cv, this.cx] = makeCanvas(PW, PH);
    const d = this.cx;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, PW, PH);
    d.globalAlpha = alpha; d.fillStyle = color; d.fillRect(0, 0, PW, PH); d.globalAlpha = 1;
    d.globalCompositeOperation = 'destination-out';
  },
  hole(x, y, r, k = 1) {   // x, y, r — в пикселях холста
    const d = this.cx, g = d.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(0.6, `rgba(0,0,0,${k * 0.6})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g; d.beginPath(); d.arc(x, y, r, 0, Math.PI * 2); d.fill();
  },
  cone(x, y, ang, len, half, k = 0.9) {
    const d = this.cx, g = d.createRadialGradient(x, y, 0, x, y, len);
    g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(1, 'rgba(0,0,0,0.1)');
    d.fillStyle = g; d.beginPath(); d.moveTo(x, y); d.arc(x, y, len, ang - half, ang + half); d.closePath(); d.fill();
  },
  rect(x, y, w, h, k = 0.9) { this.cx.fillStyle = `rgba(0,0,0,${k})`; this.cx.fillRect(x, y, w, h); },
  end(ctx) { this.cx.globalCompositeOperation = 'source-over'; ctx.drawImage(this.cv, 0, 0); }
};

// цветное свечение поверх (неон, лампы)
function glow(ctx, x, y, r, col, a = 0.35) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}
