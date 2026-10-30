'use strict';
window.G = window.G || {};
(function (G) {
  G.TW = 64;          // ширина тайла (изометрия 2:1)
  G.TH = 32;          // высота тайла
  G.SS = 2;           // супер-сэмплинг спрайтов для чёткости при зуме

  // Детерминированный ГПСЧ
  G.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  G.hash = function (x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  G.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

  G.hexToRgb = function (h) {
    if (h[0] === 'r') { const m = h.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; }
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  };
  G.rgbStr = (r, g, b, a) => (a === undefined || a >= 1)
    ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  // f > 1 — светлее (к белому), f < 1 — темнее
  G.shade = function (hex, f) {
    const [r, g, b] = G.hexToRgb(hex);
    if (f >= 1) { const t = Math.min(1, f - 1); return G.rgbStr(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t); }
    return G.rgbStr(r * f, g * f, b * f);
  };
  G.mix = function (a, b, t) {
    const A = G.hexToRgb(a), B = G.hexToRgb(b);
    return G.rgbStr(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  G.alpha = function (hex, a) { const [r, g, b] = G.hexToRgb(hex); return G.rgbStr(r, g, b, a); };

  G.fmt = function (n) {
    n = Math.round(n);
    const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (n < 0 ? '−' : '') + s;
  };
  G.money = n => '$' + G.fmt(n);

  // Сглаженный value-noise + fbm
  G.makeNoise = function (seed) {
    const sm = t => t * t * (3 - 2 * t);
    function n(x, y) {
      const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
      const a = G.hash(ix, iy, seed), b = G.hash(ix + 1, iy, seed);
      const c = G.hash(ix, iy + 1, seed), d = G.hash(ix + 1, iy + 1, seed);
      return G.lerp(G.lerp(a, b, fx), G.lerp(c, d, fx), fy);
    }
    return function fbm(x, y, oct) {
      let s = 0, amp = 0.5, f = 1, tot = 0;
      for (let i = 0; i < (oct || 4); i++) { s += n(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
      return s / tot;
    };
  };

  // Простейший эмиттер событий
  G.Emitter = class {
    constructor() { this._h = {}; }
    on(e, f) { (this._h[e] = this._h[e] || []).push(f); }
    emit(e, ...a) { (this._h[e] || []).forEach(f => f(...a)); }
  };
})(window.G);
