'use strict';
(function (G) {
  const TW = G.TW, TH = G.TH, HW = TW / 2, HH = TH / 2, S = G.SS;
  const K = 0.018;                // длина тени (тайлов на пиксель высоты)
  const shade = G.shade, pick = G.pick;

  function mkc(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * S)); c.height = Math.max(1, Math.ceil(h * S));
    const x = c.getContext('2d'); x.scale(S, S); x.lineJoin = 'round'; x.lineCap = 'round';
    return [c, x];
  }

  const LIT = ['#ffd88a', '#ffe6a6', '#fff0c8', '#ffcf73', '#cfe8ff'];

  // ---------- Изометрический «художник» ----------
  class P {
    constructor(ctx, lctx, sctx, ox, oy, sox, soy, r) {
      this.ctx = ctx; this.lctx = lctx; this.sctx = sctx;
      this.ox = ox; this.oy = oy; this.sox = sox; this.soy = soy;
      this.r = r || Math.random; this.emit = []; this.lit = false; this.maxZ = 0; this.litP = 0.6;
    }
    p(u, v, z) { z = z || 0; if (z > this.maxZ) this.maxZ = z; return [this.ox + (u - v) * HW, this.oy + (u + v) * HH - z]; }
    sp(u, v) { return [this.sox + (u - v) * HW, this.soy + (u + v) * HH]; }
    path(ctx, pts, shadow) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        const xy = shadow ? this.sp(q[0], q[1]) : this.p(q[0], q[1], q[2]);
        if (i) ctx.lineTo(xy[0], xy[1]); else ctx.moveTo(xy[0], xy[1]);
      }
      ctx.closePath();
    }
    poly(pts, fill, stroke, lw) {
      const c = this.ctx; this.path(c, pts);
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
    }
    lpoly(pts, fill) { if (!this.lctx) return; this.lit = true; this.path(this.lctx, pts); this.lctx.fillStyle = fill; this.lctx.fill(); }
    line(a, b, col, lw) {
      const c = this.ctx, A = this.p(a[0], a[1], a[2]), B = this.p(b[0], b[1], b[2]);
      c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.strokeStyle = col; c.lineWidth = lw || 1; c.stroke();
    }
    lglow(u, v, z, r, col) {
      if (!this.lctx) return; this.lit = true;
      const [x, y] = this.p(u, v, z), c = this.lctx;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    vgrad(a, b, c0, c1) {
      const g = this.ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, c0); g.addColorStop(1, c1); return g;
    }
    lot(u0, v0, u1, v1, col) { this.poly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], col); }
    shadow(u0, v0, u1, v1, h) {
      if (!this.sctx) return;
      const L = h * K;
      this.path(this.sctx, [[u0, v0], [u1 + L, v0], [u1 + L, v1], [u0, v1]], true);
      this.sctx.fillStyle = '#000'; this.sctx.fill();
    }
    shadowEllipse(u, v, r, h) {
      if (!this.sctx) return;
      const L = h * K, c = this.sctx;
      const [x, y] = this.sp(u + L * 0.5, v);
      c.beginPath();
      c.ellipse(x, y, r * HW * 1.42 + L * HW * 0.55, r * HH * 1.42 + L * HH * 0.3, 0.46, 0, Math.PI * 2);
      c.fillStyle = '#000'; c.fill();
    }
    box(u0, v0, u1, v1, z0, z1, col, o) {
      o = o || {};
      const L = [[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]];
      this.poly(L, this.vgrad(this.p(u0, v1, z0), this.p(u0, v1, z1), shade(col, o.dark ? 0.6 : 0.74), shade(col, 0.9)));
      const R = [[u1, v0, z0], [u1, v1, z0], [u1, v1, z1], [u1, v0, z1]];
      this.poly(R, this.vgrad(this.p(u1, v1, z0), this.p(u1, v1, z1), shade(col, 0.52), shade(col, 0.7)));
      if (!o.noTop) this.poly([[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], o.top || shade(col, 1.07));
      if (!o.noEdge) {
        const c = this.ctx, a = this.p(u0, v1, z1), b = this.p(u1, v1, z1), d = this.p(u1, v0, z1), e = this.p(u1, v1, z0);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]);
        c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 0.7; c.stroke();
        c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.strokeStyle = 'rgba(255,255,255,0.12)'; c.stroke();
      }
      if (z0 <= 2 && !o.noShadow) this.shadow(u0, v0, u1, v1, z1);
    }
    // Окно: face 'v' — грань +v (лево-фронт), 'u' — грань +u (право-фронт)
    win(face, f, a0, a1, z0, z1, o) {
      o = o || {};
      const pts = face === 'v' ? [[a0, f, z0], [a1, f, z0], [a1, f, z1], [a0, f, z1]]
        : [[f, a0, z0], [f, a1, z0], [f, a1, z1], [f, a0, z1]];
      const glass = o.glass || (face === 'v' ? '#6f93b3' : '#4b6985');
      this.poly(pts, glass);
      if (!o.noFrame) {
        const c = this.ctx; this.path(c, pts); c.strokeStyle = o.frame || 'rgba(255,255,255,0.55)'; c.lineWidth = 0.6; c.stroke();
        // блик
        const hp = face === 'v' ? [[a0, f, z1], [a0 + (a1 - a0) * 0.45, f, z1], [a0, f, z0 + (z1 - z0) * 0.4]]
          : [[f, a0, z1], [f, a0 + (a1 - a0) * 0.45, z1], [f, a0, z0 + (z1 - z0) * 0.4]];
        this.poly(hp, 'rgba(255,255,255,0.18)');
      }
      if (this.r() < (o.litP !== undefined ? o.litP : this.litP)) this.lpoly(pts, pick(this.r, LIT));
    }
    winGrid(face, f, a0, a1, z0, z1, cols, rows, o) {
      o = o || {};
      const da = (a1 - a0) / cols, dz = (z1 - z0) / rows;
      const pa = da * (o.pa !== undefined ? o.pa : 0.22), pz = dz * (o.pz !== undefined ? o.pz : 0.25);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (o.skip && o.skip(c, r)) continue;
        this.win(face, f, a0 + c * da + pa, a0 + (c + 1) * da - pa, z0 + r * dz + pz, z0 + (r + 1) * dz - pz * 0.7, o);
      }
    }
    // Крыши
    roof(kind, u0, v0, u1, v1, z, rh, col) {
      const du = u1 - u0, dv = v1 - v0, um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
      const cB = shade(col, 1.12), cBL = shade(col, 0.98), cF = shade(col, 0.86), cR = shade(col, 0.62);
      if (kind === 'flat') {
        this.poly([[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]], shade(col, 1.0));
        return;
      }
      if (kind === 'hip') {
        let r1, r2;
        if (du >= dv) { r1 = [u0 + dv / 2, vm, z + rh]; r2 = [u1 - dv / 2, vm, z + rh]; }
        else { r1 = [um, v0 + du / 2, z + rh]; r2 = [um, v1 - du / 2, z + rh]; }
        if (du >= dv) {
          this.poly([[u0, v0, z], [u1, v0, z], r2, r1], cBL);
          this.poly([[u0, v0, z], r1, [u0, v1, z]], cB);
          this.poly([[u0, v1, z], [u1, v1, z], r2, r1], cF);
          this.poly([[u1, v0, z], [u1, v1, z], r2], cR);
        } else {
          this.poly([[u0, v0, z], [u1, v0, z], r1], cBL);
          this.poly([[u0, v0, z], [u0, v1, z], r2, r1], cB);
          this.poly([[u1, v0, z], [u1, v1, z], r2, r1], cR);
          this.poly([[u0, v1, z], [u1, v1, z], r2], cF);
        }
        this.line(r1, r2, 'rgba(255,255,255,0.35)', 0.8);
        return;
      }
      if (kind === 'gableU') { // конёк вдоль u
        this.poly([[u0, v0, z], [u1, v0, z], [u1, vm, z + rh], [u0, vm, z + rh]], cBL);
        this.poly([[u0, v1, z], [u1, v1, z], [u1, vm, z + rh], [u0, vm, z + rh]], cF);
        this.poly([[u1, v0, z], [u1, v1, z], [u1, vm, z + rh]], shade(col, 0.55));
        this.line([u0, vm, z + rh], [u1, vm, z + rh], 'rgba(255,255,255,0.35)', 0.8);
        return;
      }
      if (kind === 'gableV') { // конёк вдоль v
        this.poly([[u0, v0, z], [u0, v1, z], [um, v1, z + rh], [um, v0, z + rh]], cB);
        this.poly([[u1, v0, z], [u1, v1, z], [um, v1, z + rh], [um, v0, z + rh]], cR);
        this.poly([[u0, v1, z], [u1, v1, z], [um, v1, z + rh]], shade(col, 0.8));
        this.line([um, v0, z + rh], [um, v1, z + rh], 'rgba(255,255,255,0.35)', 0.8);
      }
    }
    gableWall(kind, u0, v0, u1, v1, z, rh, wall) { // фронтоны стены под двускатной крышей
      if (kind === 'gableU') this.poly([[u1, v0, z], [u1, v1, z], [u1, (v0 + v1) / 2, z + rh]], shade(wall, 0.62));
      if (kind === 'gableV') this.poly([[u0, v1, z], [u1, v1, z], [(u0 + u1) / 2, v1, z + rh]], shade(wall, 0.84));
    }
    cyl(u, v, r, z0, z1, col, o) {
      o = o || {};
      const c = this.ctx, [cx, yb] = this.p(u, v, z0), yt = this.p(u, v, z1)[1];
      const rx = r * HW * 1.414, ry = r * HH * 1.414;
      const g = c.createLinearGradient(cx - rx, 0, cx + rx, 0);
      g.addColorStop(0, shade(col, 0.82)); g.addColorStop(0.3, shade(col, 1.12)); g.addColorStop(1, shade(col, 0.5));
      c.beginPath(); c.moveTo(cx - rx, yt); c.lineTo(cx - rx, yb);
      c.ellipse(cx, yb, rx, ry, 0, Math.PI, 0, true); c.lineTo(cx + rx, yt); c.closePath();
      c.fillStyle = g; c.fill();
      if (!o.noTop) { c.beginPath(); c.ellipse(cx, yt, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = o.top || shade(col, 1.12); c.fill(); }
      if (o.hole) { c.beginPath(); c.ellipse(cx, yt, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2); c.fillStyle = '#2b2b2b'; c.fill(); }
      if (z0 <= 2 && !o.noShadow) this.shadowEllipse(u, v, r, z1);
    }
    disc(u, v, r, z, fill, stroke) {
      const c = this.ctx, [x, y] = this.p(u, v, z);
      c.beginPath(); c.ellipse(x, y, r * HW * 1.414, r * HH * 1.414, 0, 0, Math.PI * 2);
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
    }
    dome(u, v, r, z, col) {
      const c = this.ctx, [x, y] = this.p(u, v, z), rx = r * HW * 1.414, ry = r * HH * 1.414;
      const g = c.createRadialGradient(x - rx * 0.4, y - rx * 0.6, 1, x, y, rx * 1.1);
      g.addColorStop(0, shade(col, 1.35)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, 0.6));
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI); c.ellipse(x, y, rx, rx * 0.95, 0, Math.PI, 0); c.fillStyle = g; c.fill();
      this.p(u, v, z + rx);
    }
    tree(u, v, s, kind, col) {
      s = s || 1; const c = this.ctx, [x, y] = this.p(u, v, 0); this.p(u, v, 28 * s);
      this.shadowEllipse(u, v, 0.13 * s, 22 * s);
      c.fillStyle = '#6d4c33'; c.fillRect(x - 1.3 * s, y - 8 * s, 2.6 * s, 8 * s);
      if (kind === 1) {
        col = col || '#2f7d4a';
        for (let i = 0; i < 3; i++) {
          const by = y - 4 * s - i * 6.5 * s, wd = (9.5 - i * 2.4) * s, ht = 11 * s;
          c.beginPath(); c.moveTo(x, by - ht); c.lineTo(x + wd, by); c.lineTo(x - wd, by); c.closePath();
          c.fillStyle = shade(col, 0.82 + i * 0.06); c.fill();
          c.beginPath(); c.moveTo(x, by - ht); c.lineTo(x, by); c.lineTo(x - wd, by); c.closePath();
          c.fillStyle = shade(col, 1.12 + i * 0.04); c.fill();
        }
        return;
      }
      col = col || '#5fae45';
      const blobs = [[0, -14, 8], [-5, -11, 6], [5.5, -10.5, 6], [0, -20, 6.5], [-3, -17, 5]];
      for (const [bx, by, br] of blobs) {
        const X = x + bx * s, Y = y + by * s, R = br * s;
        const g = c.createRadialGradient(X - R * 0.4, Y - R * 0.45, R * 0.1, X, Y, R);
        g.addColorStop(0, shade(col, 1.3)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, 0.68));
        c.beginPath(); c.arc(X, Y, R, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      }
    }
    bush(u, v, s, col) {
      const c = this.ctx, [x, y] = this.p(u, v, 0); col = col || '#4f9e3c';
      for (const [bx, by, br] of [[-3, -3, 3.5], [3, -3, 3.5], [0, -5, 4]]) {
        const X = x + bx * s, Y = y + by * s, R = br * s;
        const g = c.createRadialGradient(X - R * 0.4, Y - R * 0.4, 0.5, X, Y, R);
        g.addColorStop(0, shade(col, 1.3)); g.addColorStop(1, shade(col, 0.7));
        c.beginPath(); c.arc(X, Y, R, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      }
    }
    flowers(u0, v0, u1, v1, n) {
      const c = this.ctx, cols = ['#ff6b8a', '#ffd23f', '#ffffff', '#c77dff', '#ff8c42'];
      for (let i = 0; i < n; i++) {
        const [x, y] = this.p(u0 + this.r() * (u1 - u0), v0 + this.r() * (v1 - v0), 0);
        c.fillStyle = pick(this.r, cols); c.beginPath(); c.arc(x, y - 1, 1.1, 0, Math.PI * 2); c.fill();
      }
    }
    car(u, v, alongU, col) {
      const l = 0.15, w = 0.075;
      const [a0, a1, b0, b1] = alongU ? [u - l, u + l, v - w, v + w] : [u - w, u + w, v - l, v + l];
      this.box(a0, b0, a1, b1, 0.5, 4.5, col, { noEdge: true });
      const [c0, c1, d0, d1] = alongU ? [u - l * 0.55, u + l * 0.35, v - w * 0.85, v + w * 0.85] : [u - w * 0.85, u + w * 0.85, v - l * 0.55, v + l * 0.35];
      this.box(c0, d0, c1, d1, 4.5, 7.5, '#9fb7cc', { noEdge: true, noShadow: true, top: shade(col, 1.1) });
    }
    lamp(u, v, h) {
      h = h || 14; this.line([u, v, 0], [u, v, h], '#3d4450', 1);
      const [x, y] = this.p(u, v, h); const c = this.ctx;
      c.fillStyle = '#fff6d6'; c.beginPath(); c.arc(x, y, 1.4, 0, Math.PI * 2); c.fill();
      this.lglow(u, v, h, 9, 'rgba(255,214,140,0.9)');
    }
    flag(u, v, h, col) {
      this.line([u, v, 0], [u, v, h], '#ddd', 0.8);
      const [x, y] = this.p(u, v, h); const c = this.ctx;
      c.fillStyle = col || '#e53935'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 9, y + 2); c.lineTo(x, y + 5); c.fill();
    }
  }
  G.Painter = P;

  // ---------- Земля ----------
  const GT = 12, GP = 2; // верхний отступ (для мостов) и боковой
  function groundCanvas(fn) {
    const [c, x] = mkc(TW + GP * 2, TH + GP * 2 + GT);
    const p = new P(x, null, null, HW + GP, GT, 0, 0, Math.random);
    fn(p, x); return c;
  }
  function diamondPath(x, ox, oy, e) {
    x.beginPath(); x.moveTo(ox, oy - e); x.lineTo(ox + HW + e * 2, oy + HH); x.lineTo(ox, oy + TH + e); x.lineTo(ox - HW - e * 2, oy + HH); x.closePath();
  }
  const GRASS = ['#86cb5b', '#82c858', '#7ec455', '#7ac052'];

  function makeGrass(tone, v) {
    return groundCanvas((p, x) => {
      const r = G.rng(tone * 31 + v * 7 + 3); p.r = r;
      const base = GRASS[tone];
      diamondPath(x, p.ox, p.oy, 0.8); x.fillStyle = base; x.fill();
      x.save(); diamondPath(x, p.ox, p.oy, 0); x.clip();
      for (let i = 0; i < 46; i++) {
        const gx = p.ox - HW + r() * TW, gy = p.oy + r() * TH;
        x.strokeStyle = r() < 0.5 ? shade(base, 0.86) : shade(base, 1.1);
        x.lineWidth = 0.8; x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + (r() - 0.5) * 1.5, gy - 2 - r() * 1.5); x.stroke();
      }
      if (v === 2) {
        const cols = ['#fff', '#ffd23f', '#ff8fb1', '#b9a3ff'];
        for (let i = 0; i < 6; i++) { x.fillStyle = pick(r, cols); x.beginPath(); x.arc(p.ox - HW * 0.6 + r() * TW * 0.6, p.oy + TH * 0.25 + r() * TH * 0.5, 0.9, 0, 7); x.fill(); }
      }
      if (v === 3) { x.fillStyle = '#a3a39a'; x.beginPath(); x.ellipse(p.ox + (r() - 0.5) * 20, p.oy + HH + (r() - 0.5) * 8, 2.2, 1.4, 0, 0, 7); x.fill(); }
      x.restore();
    });
  }
  function makeSand(v) {
    return groundCanvas((p, x) => {
      const r = G.rng(v * 13 + 5), base = '#e8d6a0';
      diamondPath(x, p.ox, p.oy, 0.8); x.fillStyle = base; x.fill();
      x.save(); diamondPath(x, p.ox, p.oy, 0); x.clip();
      for (let i = 0; i < 40; i++) { x.fillStyle = r() < 0.5 ? '#d7c288' : '#f4e6bb'; x.fillRect(p.ox - HW + r() * TW, p.oy + r() * TH, 1, 1); }
      x.restore();
    });
  }
  const WATER = ['#45aee0', '#3a9fd6', '#318fca'];
  function makeWater(mask, tone) {
    return groundCanvas((p, x) => {
      diamondPath(x, p.ox, p.oy, 0.8); x.fillStyle = WATER[tone]; x.fill();
      x.save(); diamondPath(x, p.ox, p.oy, 0); x.clip();
      const edges = [[1, [0, 0], [0, 1], [0.32, 0], [0.32, 1]], [2, [0, 0], [1, 0], [0, 0.32], [1, 0.32]],
        [4, [1, 0], [1, 1], [0.68, 0], [0.68, 1]], [8, [0, 1], [1, 1], [0, 0.68], [1, 0.68]]];
      for (const [bit, a, b, a2, b2] of edges) {
        if (!(mask & bit)) continue;
        const A = p.p(a[0], a[1]), A2 = p.p(a2[0], a2[1]);
        const g = x.createLinearGradient(A[0], A[1], A2[0], A2[1]);
        g.addColorStop(0, 'rgba(160,232,240,0.95)'); g.addColorStop(1, 'rgba(160,232,240,0)');
        p.poly([a, b, b2, a2], g);
      }
      for (const [bit, a, b] of edges) {
        if (!(mask & bit)) continue;
        x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 1.3;
        const A = p.p(a[0], a[1]), B = p.p(b[0], b[1]);
        x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke();
      }
      x.restore();
    });
  }
  function makeRoad(mask, bridge) {
    return groundCanvas((p, x) => {
      const z = bridge ? 5 : 0, sw = bridge ? 0.09 : 0.15;
      const asph = '#5a5f68', side = bridge ? '#d6d1c6' : '#cfc9bc', curb = '#8e8a82';
      if (bridge) {
        x.save(); x.globalAlpha = 0.28; diamondPath(x, p.ox + 4, p.oy + 3, -2); x.fillStyle = '#05304a'; x.fill(); x.restore();
        if (!(mask & 4)) p.poly([[1, 0, 0], [1, 1, 0], [1, 1, z], [1, 0, z]], '#8c8a84');
        if (!(mask & 8)) p.poly([[0, 1, 0], [1, 1, 0], [1, 1, z], [0, 1, z]], '#a9a69f');
        // опоры
        for (const t of [0.5]) { p.poly([[t - 0.05, t - 0.05, -6], [t + 0.05, t - 0.05, -6], [t + 0.05, t + 0.05, z], [t - 0.05, t + 0.05, z]], 'rgba(120,118,112,0.6)'); }
      }
      p.poly([[0, 0, z], [1, 0, z], [1, 1, z], [0, 1, z]], asph);
      // текстура асфальта
      x.save(); p.path(x, [[0, 0, z], [1, 0, z], [1, 1, z], [0, 1, z]]); x.clip();
      const r = G.rng(mask * 17 + (bridge ? 99 : 1));
      for (let i = 0; i < 30; i++) { x.fillStyle = r() < 0.5 ? '#626770' : '#50545c'; x.fillRect(p.ox - HW + r() * TW, p.oy - z + r() * TH, 1, 1); }
      x.restore();
      const strips = { 1: [[0, 0], [sw, 0], [sw, 1], [0, 1]], 2: [[0, 0], [1, 0], [1, sw], [0, sw]], 4: [[1 - sw, 0], [1, 0], [1, 1], [1 - sw, 1]], 8: [[0, 1 - sw], [1, 1 - sw], [1, 1], [0, 1]] };
      for (const b of [1, 2, 4, 8]) if (!(mask & b)) {
        p.poly(strips[b].map(q => [q[0], q[1], z]), side);
        const inner = { 1: [[sw, 0], [sw, 1]], 2: [[0, sw], [1, sw]], 4: [[1 - sw, 0], [1 - sw, 1]], 8: [[0, 1 - sw], [1, 1 - sw]] }[b];
        p.line([inner[0][0], inner[0][1], z], [inner[1][0], inner[1][1], z], curb, 0.9);
        if (bridge) {
          const outer = { 1: [[0.01, 0], [0.01, 1]], 2: [[0, 0.01], [1, 0.01]], 4: [[0.99, 0], [0.99, 1]], 8: [[0, 0.99], [1, 0.99]] }[b];
          p.poly([[outer[0][0], outer[0][1], z], [outer[1][0], outer[1][1], z], [outer[1][0], outer[1][1], z + 4], [outer[0][0], outer[0][1], z + 4]], 'rgba(70,74,82,0.85)');
        }
      }
      const corners = [[1 | 2, [0, 0]], [2 | 4, [1 - sw, 0]], [4 | 8, [1 - sw, 1 - sw]], [8 | 1, [0, 1 - sw]]];
      for (const [m, [a, b]] of corners) if ((mask & m) === m) p.poly([[a, b, z], [a + sw, b, z], [a + sw, b + sw, z], [a, b + sw, z]], side);
      const n = [1, 2, 4, 8].filter(b => mask & b).length;
      x.setLineDash([3, 3]);
      if (n === 2 && (mask === 5 || mask === 10)) {
        if (mask === 5) p.line([0, 0.5, z], [1, 0.5, z], '#f3c845', 1.1);
        else p.line([0.5, 0, z], [0.5, 1, z], '#f3c845', 1.1);
      } else if (n <= 2) {
        const mid = { 1: [0, 0.5], 2: [0.5, 0], 4: [1, 0.5], 8: [0.5, 1] };
        for (const b of [1, 2, 4, 8]) if (mask & b) p.line([0.5, 0.5, z], [mid[b][0], mid[b][1], z], '#f1f1f1', 1);
      }
      x.setLineDash([]);
      if (n >= 3) {
        for (const b of [1, 2, 4, 8]) if (mask & b) {
          for (let t = sw + 0.04; t < 1 - sw - 0.04; t += 0.1) {
            const q = { 1: [[0.03, t], [0.12, t], [0.12, t + 0.05], [0.03, t + 0.05]], 2: [[t, 0.03], [t + 0.05, 0.03], [t + 0.05, 0.12], [t, 0.12]], 4: [[0.88, t], [0.97, t], [0.97, t + 0.05], [0.88, t + 0.05]], 8: [[t, 0.88], [t + 0.05, 0.88], [t + 0.05, 0.97], [t, 0.97]] }[b];
            p.poly(q.map(k => [k[0], k[1], z]), 'rgba(240,240,240,0.85)');
          }
        }
      }
    });
  }
  function makeZone(z) {
    return groundCanvas((p, x) => {
      const col = G.ZONE[z].color;
      diamondPath(x, p.ox, p.oy, 0); x.fillStyle = G.alpha(col, 0.34); x.fill();
      diamondPath(x, p.ox, p.oy, -4); x.strokeStyle = G.alpha(col, 1); x.lineWidth = 1.8; x.setLineDash([5, 3]); x.stroke();
    });
  }

  // ---------- Здания ----------
  const WALLS = ['#f4e7cc', '#ead5b3', '#dbe7f1', '#f2d6d1', '#d9ecd6', '#fbf7ef', '#e8ddf1', '#f5e1a9'];
  const ROOFS = ['#c4493d', '#9c5b3d', '#5c6672', '#4e7091', '#b9633f', '#3f7a5c', '#7b5a9e'];
  const BRICK = ['#c9785a', '#b9654b', '#d39a6a', '#c4a484', '#a9b8c9', '#d8b4a0', '#bfcf9f'];
  const MODERN = ['#eceff1', '#cfd8dc', '#d7ccc8', '#b0bec5', '#f5e6d3', '#e3d5c0', '#c5d5e4'];
  const GLASS = ['#6fa8d6', '#5ec2c9', '#7fa3c2', '#7fb6a8', '#8e9fd6'];
  const TREE_COLS = ['#5fae45', '#4f9e3c', '#6fbf4f', '#83bf3f', '#4a9a52'];

  function treeAt(p, u, v, s) { const r = p.r(); p.tree(u, v, s, r < 0.25 ? 1 : 0, r < 0.25 ? '#2f7d4a' : pick(p.r, TREE_COLS)); }

  const GEN = {};
  // --- Жилые ---
  GEN.R1 = (p, r) => {
    p.lot(0.03, 0.03, 0.97, 0.97, '#93d468');
    const wall = pick(r, WALLS), roof = pick(r, ROOFS);
    const u0 = 0.2 + r() * 0.06, v0 = 0.18 + r() * 0.06, u1 = 0.78 - r() * 0.05, v1 = 0.7 - r() * 0.05;
    const h = 13 + r() * 5, um = (u0 + u1) / 2;
    p.poly([[um - 0.05, v1], [um + 0.05, v1], [um + 0.05, 0.97], [um - 0.05, 0.97]], '#e1d6c1');
    if (r() < 0.8) treeAt(p, 0.12, 0.14, 0.75);
    if (r() < 0.5) treeAt(p, 0.86, 0.16, 0.6);
    p.box(u0, v0, u1, v1, 0, h, wall);
    p.poly([[um - 0.045, v1, 0], [um + 0.045, v1, 0], [um + 0.045, v1, 8.5], [um - 0.045, v1, 8.5]], '#7a5236');
    p.win('v', v1, u0 + 0.05, um - 0.1, 4, h - 3, { litP: 0.55 });
    p.win('v', v1, um + 0.1, u1 - 0.05, 4, h - 3, { litP: 0.55 });
    p.winGrid('u', u1, v0, v1, 3, h - 2, 2, 1, { litP: 0.5 });
    const kind = pick(r, ['hip', 'gableU', 'gableV', 'hip']);
    const o = 0.04;
    p.gableWall(kind, u0, v0, u1, v1, h, 11, wall);
    if (r() < 0.6) p.box(u0 + 0.06, v0 + 0.05, u0 + 0.14, v0 + 0.13, h, h + 16, '#8d6e63', { noShadow: true });
    p.roof(kind, u0 - o, v0 - o, u1 + o, v1 + o, h, 11, roof);
    if (r() < 0.5) p.car(0.88, 0.62, false, pick(r, ['#e53935', '#1e88e5', '#fdd835', '#eeeeee', '#43a047', '#424242']));
    for (let i = 0.08; i < 0.95; i += 0.11) p.box(i, 0.94, i + 0.03, 0.97, 0, 4, '#ffffff', { noEdge: true, noShadow: true });
    p.bush(0.25, 0.86, 0.8); if (r() < 0.6) p.bush(0.72, 0.88, 0.7, '#5cae46');
    p.flowers(0.05, 0.75, 0.4, 0.92, 6);
  };
  GEN.R2 = (p, r) => {
    p.lot(0.03, 0.03, 0.97, 0.97, '#a5d77c');
    if (r() < 0.5) { // таунхаусы
      p.poly([[0.03, 0.8], [0.97, 0.8], [0.97, 0.97], [0.03, 0.97]], '#d8d0c0');
      treeAt(p, 0.1, 0.1, 0.7);
      const kind = 'gableV';
      for (let i = 0; i < 2; i++) {
        const u0 = 0.1 + i * 0.41, u1 = u0 + 0.4, v0 = 0.18, v1 = 0.76, h = 28 + r() * 6, wall = pick(r, WALLS);
        p.box(u0, v0, u1, v1, 0, h, wall);
        p.poly([[u0 + 0.15, v1, 0], [u0 + 0.25, v1, 0], [u0 + 0.25, v1, 9], [u0 + 0.15, v1, 9]], '#6d4c33');
        p.winGrid('v', v1, u0, u1, 9, h - 2, 2, 2, { skip: (c, rr) => rr === 0 && c === 0 });
        p.winGrid('u', u1, v0, v1, 3, h - 2, 3, 3);
        p.gableWall(kind, u0, v0, u1, v1, h, 13, wall);
        p.roof(kind, u0 - 0.02, v0 - 0.03, u1 + 0.02, v1 + 0.03, h, 13, pick(r, ROOFS));
      }
      p.bush(0.5, 0.88, 0.8);
    } else { // малоэтажка
      p.poly([[0.03, 0.82], [0.97, 0.82], [0.97, 0.97], [0.03, 0.97]], '#d8d0c0');
      const col = pick(r, BRICK), fl = 4, h = fl * 11 + 3;
      p.box(0.12, 0.14, 0.88, 0.8, 0, h, col);
      p.winGrid('v', 0.8, 0.12, 0.88, 3, h - 1, 4, fl, { skip: (c, rr) => rr === 0 && c === 1 });
      p.poly([[0.31, 0.8, 0], [0.43, 0.8, 0], [0.43, 0.8, 9], [0.31, 0.8, 9]], '#5d4037');
      p.box(0.28, 0.8, 0.46, 0.86, 9, 10.5, '#eceff1', { noShadow: true });
      p.winGrid('u', 0.88, 0.14, 0.8, 3, h - 1, 3, fl);
      p.box(0.12, 0.14, 0.88, 0.8, h, h + 2, shade(col, 0.9), { noShadow: true, top: shade(col, 0.75) });
      p.box(0.5, 0.25, 0.62, 0.37, h + 2, h + 7, '#b0bec5', { noShadow: true });
      treeAt(p, 0.92, 0.9, 0.55);
    }
  };
  GEN.R3 = (p, r) => {
    p.lot(0.02, 0.02, 0.98, 0.98, '#cfc8b8');
    p.poly([[0.02, 0.02], [0.3, 0.02], [0.3, 0.98], [0.02, 0.98]], '#9fd57a');
    treeAt(p, 0.1, 0.12, 0.7); treeAt(p, 0.12, 0.85, 0.65);
    const col = pick(r, MODERN), acc = pick(r, ['#e57373', '#4db6ac', '#ffb74d', '#7986cb', '#90a4ae']);
    const fl = 7 + Math.floor(r() * 3), h = fl * 10.5 + 4;
    p.box(0.18, 0.16, 0.84, 0.82, 0, h, col);
    p.box(0.18, 0.16, 0.84, 0.82, 0, 9, shade(col, 0.7), { noShadow: true });
    p.winGrid('v', 0.82, 0.18, 0.84, 10, h - 2, 4, fl - 1, { glass: '#6c90b3' });
    p.winGrid('u', 0.84, 0.16, 0.82, 10, h - 2, 4, fl - 1);
    p.poly([[0.46, 0.82, 0], [0.56, 0.82, 0], [0.56, 0.82, h], [0.46, 0.82, h]], G.alpha(acc, 0.85));
    p.win('v', 0.82, 0.3, 0.44, 1, 7.5, { glass: '#3e5a75', litP: 0.95 });
    p.box(0.2, 0.18, 0.82, 0.8, h, h + 1.5, shade(col, 0.9), { noShadow: true, top: shade(col, 0.72) });
    p.box(0.3, 0.3, 0.48, 0.48, h, h + 9, '#90a4ae', { noShadow: true });
    p.cyl(0.66, 0.38, 0.08, h, h + 12, '#8d6e63', { noShadow: true });
  };
  GEN.R4 = (p, r) => {
    p.lot(0.02, 0.02, 0.98, 0.98, '#d6cfc0');
    const col = pick(r, MODERN), glass = pick(r, GLASS);
    p.box(0.06, 0.06, 0.94, 0.94, 0, 14, shade(col, 0.95));
    p.winGrid('v', 0.94, 0.06, 0.94, 2, 12, 5, 1, { glass: '#4e6f8f', litP: 0.9 });
    p.winGrid('u', 0.94, 0.06, 0.94, 2, 12, 5, 1, { glass: '#3d5a75', litP: 0.9 });
    const fl = 15 + Math.floor(r() * 6), h = 14 + fl * 10;
    p.box(0.2, 0.2, 0.8, 0.8, 14, h, col, { noShadow: true });
    p.shadow(0.2, 0.2, 0.8, 0.8, h);
    p.winGrid('v', 0.8, 0.2, 0.8, 16, h - 2, 4, fl - 1, { glass, pa: 0.12, pz: 0.18, litP: 0.5 });
    p.winGrid('u', 0.8, 0.2, 0.8, 16, h - 2, 4, fl - 1, { glass: shade(glass, 0.7), pa: 0.12, pz: 0.18, litP: 0.5 });
    for (let z = 24; z < h; z += 20) p.poly([[0.2, 0.8, z], [0.8, 0.8, z], [0.8, 0.2, z], [0.8, 0.2, z + 1], [0.8, 0.8, z + 1], [0.2, 0.8, z + 1]], 'rgba(255,255,255,0.45)');
    p.box(0.26, 0.26, 0.74, 0.74, h, h + 10, shade(col, 0.85), { noShadow: true });
    if (r() < 0.5) { p.line([0.5, 0.5, h + 10], [0.5, 0.5, h + 32], '#cfd8dc', 1.2); p.lglow(0.5, 0.5, h + 32, 5, 'rgba(255,60,60,1)'); }
    else { p.disc(0.5, 0.5, 0.18, h + 10.2, '#455a64'); p.disc(0.5, 0.5, 0.12, h + 10.3, null, '#ffd54f'); }
  };
  // --- Коммерческие ---
  GEN.C1 = (p, r) => {
    p.lot(0.02, 0.02, 0.98, 0.98, '#d3cdc1');
    const col = pick(r, ['#fff3e0', '#e3f2fd', '#fce4ec', '#f1f8e9', '#fffde7', '#ede7f6']);
    const aw = pick(r, ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b']);
    const u0 = 0.14, v0 = 0.14, u1 = 0.86, v1 = 0.7, h = 18 + r() * 4;
    treeAt(p, 0.9, 0.1, 0.55);
    p.box(u0, v0, u1, v1, 0, h, col);
    p.win('v', v1, u0 + 0.05, u1 - 0.22, 1.5, 12, { glass: '#4f7ea6', litP: 1, frame: 'rgba(255,255,255,0.9)' });
    p.poly([[u1 - 0.18, v1, 0], [u1 - 0.07, v1, 0], [u1 - 0.07, v1, 11], [u1 - 0.18, v1, 11]], '#5d4037');
    p.winGrid('u', u1, v0, v1, 3, 12, 2, 1, { litP: 0.9 });
    // маркиза
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = u0 + (u1 - u0) * i / n, b = u0 + (u1 - u0) * (i + 1) / n;
      p.poly([[a, v1, 14], [b, v1, 14], [b, v1 + 0.13, 10], [a, v1 + 0.13, 10]], i % 2 ? '#ffffff' : aw);
    }
    p.box(u0, v0, u1, v1, h, h + 1.5, shade(col, 0.85), { noShadow: true });
    // вывеска
    p.box(0.3, 0.38, 0.7, 0.42, h + 1, h + 11, aw, { noShadow: true });
    p.poly([[0.35, 0.42, h + 4], [0.65, 0.42, h + 4], [0.65, 0.42, h + 8], [0.35, 0.42, h + 8]], 'rgba(255,255,255,0.9)');
    p.lpoly([[0.3, 0.42, h + 1], [0.7, 0.42, h + 1], [0.7, 0.42, h + 11], [0.3, 0.42, h + 11]], G.alpha(aw, 0.9));
    if (r() < 0.5) { for (const [uu, vv] of [[0.25, 0.86], [0.55, 0.88]]) { p.line([uu, vv, 0], [uu, vv, 9], '#666', 0.8); p.disc(uu, vv, 0.09, 9, aw); } }
    else p.box(0.4, 0.85, 0.55, 0.9, 0, 3, '#8d6e63', { noEdge: true });
    p.lamp(0.92, 0.92, 13);
  };
  GEN.C2 = (p, r) => {
    p.lot(0.02, 0.02, 0.98, 0.98, '#cdc6b8');
    const glass = pick(r, GLASS), fr = pick(r, ['#eceff1', '#cfd8dc', '#455a64', '#d7ccc8']);
    const fl = 5 + Math.floor(r() * 3), h = fl * 11 + 8;
    p.box(0.14, 0.14, 0.86, 0.86, 0, h, fr);
    // стеклянные фасады
    p.poly([[0.17, 0.86, 8], [0.83, 0.86, 8], [0.83, 0.86, h - 3], [0.17, 0.86, h - 3]], p.vgrad(p.p(0.17, 0.86, 8), p.p(0.17, 0.86, h), shade(glass, 0.75), shade(glass, 1.25)));
    p.poly([[0.86, 0.17, 8], [0.86, 0.83, 8], [0.86, 0.83, h - 3], [0.86, 0.17, h - 3]], p.vgrad(p.p(0.86, 0.83, 8), p.p(0.86, 0.83, h), shade(glass, 0.5), shade(glass, 0.85)));
    for (let z = 8; z < h - 3; z += 11) {
      p.line([0.17, 0.86, z], [0.83, 0.86, z], 'rgba(255,255,255,0.5)', 0.8);
      p.line([0.86, 0.17, z], [0.86, 0.83, z], 'rgba(255,255,255,0.3)', 0.8);
      for (let a = 0.17; a < 0.82; a += 0.11) {
        if (r() < 0.55) p.lpoly([[a, 0.86, z + 1], [a + 0.1, 0.86, z + 1], [a + 0.1, 0.86, z + 9], [a, 0.86, z + 9]], '#fff1c9');
        if (r() < 0.5) p.lpoly([[0.86, a, z + 1], [0.86, a + 0.1, z + 1], [0.86, a + 0.1, z + 9], [0.86, a, z + 9]], '#ffe2a0');
      }
    }
    p.win('v', 0.86, 0.38, 0.62, 0.5, 7, { glass: '#2d4459', litP: 1 });
    p.box(0.16, 0.16, 0.84, 0.84, h, h + 1.5, fr, { noShadow: true });
    if (r() < 0.5) { p.lot(0.22, 0.22, 0.78, 0.78); p.poly([[0.22, 0.22, h + 1.6], [0.78, 0.22, h + 1.6], [0.78, 0.78, h + 1.6], [0.22, 0.78, h + 1.6]], '#7cb342'); treeAt(p, 0.4, 0.4, 0.4); }
    else { p.box(0.3, 0.3, 0.55, 0.5, h, h + 8, '#90a4ae', { noShadow: true }); p.box(0.6, 0.55, 0.75, 0.7, h, h + 5, '#b0bec5', { noShadow: true }); }
    p.lamp(0.08, 0.92, 13); p.lamp(0.92, 0.08, 13);
  };
  GEN.C3 = (p, r) => {
    p.lot(0.0, 0.0, 1, 1, '#c9c2b4');
    const glass = pick(r, GLASS), fr = pick(r, ['#eceff1', '#b0bec5', '#37474f']);
    const h1 = 26, h2 = 150 + r() * 50, h3 = h2 + 40 + r() * 30;
    const face = (u0, v0, u1, v1, z0, z1, mult) => {
      p.box(u0, v0, u1, v1, z0, z1, fr, { noShadow: true });
      p.poly([[u0 + 0.02, v1, z0 + 2], [u1 - 0.02, v1, z0 + 2], [u1 - 0.02, v1, z1 - 2], [u0 + 0.02, v1, z1 - 2]], p.vgrad(p.p(u0, v1, z0), p.p(u0, v1, z1), shade(glass, 0.7), shade(glass, 1.3)));
      p.poly([[u1, v0 + 0.02, z0 + 2], [u1, v1 - 0.02, z0 + 2], [u1, v1 - 0.02, z1 - 2], [u1, v0 + 0.02, z1 - 2]], p.vgrad(p.p(u1, v1, z0), p.p(u1, v1, z1), shade(glass, 0.45), shade(glass, 0.85)));
      for (let a = u0 + 0.08; a < u1 - 0.02; a += 0.08) p.line([a, v1, z0 + 2], [a, v1, z1 - 2], 'rgba(255,255,255,0.22)', 0.5);
      for (let a = v0 + 0.08; a < v1 - 0.02; a += 0.08) p.line([u1, a, z0 + 2], [u1, a, z1 - 2], 'rgba(255,255,255,0.12)', 0.5);
      for (let z = z0 + 4; z < z1 - 4; z += 8) for (let a = u0 + 0.03; a < u1 - 0.06; a += 0.08) {
        if (r() < 0.45 * mult) p.lpoly([[a, v1, z], [a + 0.06, v1, z], [a + 0.06, v1, z + 5], [a, v1, z + 5]], '#fff3cf');
        if (r() < 0.4 * mult) p.lpoly([[u1, a, z], [u1, a + 0.06, z], [u1, a + 0.06, z + 5], [u1, a, z + 5]], '#ffe7a8');
      }
    };
    p.shadow(0.12, 0.12, 0.88, 0.88, h3);
    face(0.06, 0.06, 0.94, 0.94, 0, h1, 1.5);
    face(0.14, 0.14, 0.86, 0.86, h1, h2, 1);
    face(0.24, 0.24, 0.76, 0.76, h2, h3, 0.8);
    p.box(0.34, 0.34, 0.66, 0.66, h3, h3 + 8, fr, { noShadow: true });
    p.line([0.5, 0.5, h3 + 8], [0.5, 0.5, h3 + 45], '#cfd8dc', 1.4);
    p.lglow(0.5, 0.5, h3 + 45, 6, 'rgba(255,50,50,1)');
  };
  // --- Промышленные ---
  GEN.I1 = (p, r) => {
    p.lot(0.02, 0.02, 0.98, 0.98, '#bdb7aa');
    p.line([0.05, 0.9, 0], [0.95, 0.9, 0], '#e8c547', 1);
    if (r() < 0.55) {
      const col = pick(r, ['#a9b4bf', '#b7a99a', '#9fb3a2', '#c2b49a']), h = 20;
      p.box(0.08, 0.16, 0.92, 0.8, 0, h, col);
      for (let i = 0; i < 3; i++) p.poly([[0.12 + i * 0.25, 0.8, 0], [0.3 + i * 0.25, 0.8, 0], [0.3 + i * 0.25, 0.8, 13], [0.12 + i * 0.25, 0.8, 13]], i === 1 ? '#5a5f68' : '#7f8790');
      p.winGrid('u', 0.92, 0.16, 0.8, 13, 18, 4, 1, { litP: 0.7 });
      for (let i = 0; i < 4; i++) {
        const a = 0.08 + i * 0.21, b = a + 0.21;
        p.poly([[a, 0.16, h], [a, 0.8, h], [b, 0.8, h + 7], [b, 0.16, h + 7]], shade(col, 1.15));
        p.poly([[b, 0.16, h], [b, 0.8, h], [b, 0.8, h + 7], [b, 0.16, h + 7]], '#6f8fae');
      }
      p.box(0.62, 0.84, 0.72, 0.92, 0, 5, '#a1887f', { noEdge: true }); p.box(0.75, 0.83, 0.85, 0.91, 0, 5, '#8d6e63', { noEdge: true });
    } else {
      const col = pick(r, BRICK), h = 26;
      p.cyl(0.25, 0.2, 0.07, 0, 55, '#8d6e63', { hole: true });
      p.emit.push({ k: 'smoke', u: 0.25, v: 0.2, z: 55 });
      p.box(0.12, 0.3, 0.88, 0.82, 0, h, col);
      p.winGrid('v', 0.82, 0.12, 0.88, 6, h - 3, 4, 2);
      p.winGrid('u', 0.88, 0.3, 0.82, 6, h - 3, 3, 2);
      p.roof('gableU', 0.1, 0.28, 0.9, 0.84, h, 9, '#78909c');
      p.gableWall('gableU', 0.12, 0.3, 0.88, 0.82, h, 9, col);
    }
  };
  GEN.I2 = (p, r) => {
    p.lot(0.0, 0.0, 1, 1, '#b4ae9f');
    const col = pick(r, BRICK);
    p.cyl(0.2, 0.2, 0.08, 0, 90, '#c62828', { hole: true });
    for (let z = 15; z < 90; z += 22) p.cyl(0.2, 0.2, 0.082, z, z + 9, '#f5f5f5', { noShadow: true });
    p.emit.push({ k: 'smoke', u: 0.2, v: 0.2, z: 90 });
    p.cyl(0.78, 0.22, 0.14, 0, 30, '#cfd8dc');
    p.box(0.1, 0.38, 0.72, 0.9, 0, 32, col);
    p.winGrid('v', 0.9, 0.1, 0.72, 6, 28, 4, 2);
    p.winGrid('u', 0.72, 0.38, 0.9, 6, 28, 3, 2);
    for (let i = 0; i < 3; i++) {
      const a = 0.38 + i * 0.173, b = a + 0.173;
      p.poly([[0.1, a, 32], [0.72, a, 32], [0.72, b, 40], [0.1, b, 40]], '#90a4ae');
      p.poly([[0.1, b, 32], [0.72, b, 32], [0.72, b, 40], [0.1, b, 40]], '#5c7a96');
    }
    p.cyl(0.85, 0.65, 0.1, 0, 22, '#ffb74d');
    p.line([0.72, 0.6, 18], [0.85, 0.65, 18], '#78909c', 2);
  };
  GEN.I3 = (p, r) => {
    p.lot(0.0, 0.0, 1, 1, '#aaa496');
    for (const [u, v] of [[0.16, 0.16], [0.4, 0.12], [0.16, 0.42]]) p.cyl(u, v, 0.1, 0, 64, '#cfd8dc', { top: '#eceff1' });
    p.cyl(0.78, 0.18, 0.07, 0, 110, '#90a4ae', { hole: true });
    p.cyl(0.88, 0.36, 0.06, 0, 95, '#90a4ae', { hole: true });
    p.emit.push({ k: 'smoke', u: 0.78, v: 0.18, z: 110 }, { k: 'smoke', u: 0.88, v: 0.36, z: 95 });
    p.box(0.36, 0.38, 0.94, 0.92, 0, 40, pick(r, ['#78909c', '#8d6e63', '#607d8b']));
    p.winGrid('v', 0.92, 0.36, 0.94, 8, 36, 5, 3, { litP: 0.8 });
    p.winGrid('u', 0.94, 0.38, 0.92, 8, 36, 5, 3, { litP: 0.8 });
    p.box(0.42, 0.44, 0.88, 0.86, 40, 44, '#546e7a', { noShadow: true });
    p.line([0.16, 0.42, 30], [0.36, 0.6, 30], '#b0bec5', 2.2);
    p.line([0.4, 0.12, 40], [0.5, 0.38, 40], '#b0bec5', 2.2);
    p.cyl(0.14, 0.82, 0.12, 0, 18, '#ffca28');
  };

  // --- Сервисы ---
  GEN.wind = (p) => {
    p.lot(0.1, 0.1, 0.9, 0.9, '#8fd065');
    p.box(0.38, 0.38, 0.62, 0.62, 0, 3, '#cfd8dc', { noEdge: true });
    const c = p.ctx, [x, y] = p.p(0.5, 0.5, 0), top = 98;
    const g = c.createLinearGradient(x - 3, 0, x + 3, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b8c2cc');
    c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x - 1.3, y - top); c.lineTo(x + 1.3, y - top); c.lineTo(x + 3, y); c.closePath(); c.fillStyle = g; c.fill();
    p.p(0.5, 0.5, top + 30);
    p.shadow(0.45, 0.45, 0.55, 0.55, top);
    c.fillStyle = '#eceff1'; c.beginPath(); c.ellipse(x + 1, y - top, 5, 3, 0, 0, 7); c.fill();
    p.emit.push({ k: 'rotor', u: 0.5, v: 0.5, z: top, x: -3 });
    p.lglow(0.5, 0.5, top + 3, 4, 'rgba(255,40,40,1)');
  };
  GEN.waterTower = (p) => {
    p.lot(0.08, 0.08, 0.92, 0.92, '#8fd065');
    const legs = [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]];
    for (const [u, v] of legs.slice(0, 2)) p.line([u, v, 0], [0.5 + (u - 0.5) * 0.6, 0.5 + (v - 0.5) * 0.6, 56], '#78909c', 1.8);
    p.line([0.3, 0.3, 20], [0.7, 0.7, 40], '#90a4ae', 0.8);
    for (const [u, v] of legs.slice(2)) p.line([u, v, 0], [0.5 + (u - 0.5) * 0.6, 0.5 + (v - 0.5) * 0.6, 56], '#78909c', 1.8);
    p.shadow(0.3, 0.3, 0.7, 0.7, 80);
    p.cyl(0.5, 0.5, 0.3, 54, 76, '#7ec8e3', { noShadow: true, top: '#a7dcef' });
    p.cyl(0.5, 0.5, 0.305, 62, 66, '#ffffff', { noShadow: true, top: '#a7dcef' });
    const c = p.ctx, [x, y] = p.p(0.5, 0.5, 76); c.fillStyle = '#5fb3d1';
    c.beginPath(); c.moveTo(x - 27, y); c.lineTo(x, y - 12); c.lineTo(x + 27, y); c.ellipse(x, y, 27, 13.5, 0, 0, Math.PI); c.fill();
    p.p(0.5, 0.5, 90); p.lglow(0.5, 0.5, 89, 4, 'rgba(255,60,60,1)');
  };
  GEN.pump = (p) => {
    p.lot(0.05, 0.05, 0.95, 0.95, '#cfd8dc');
    p.disc(0.28, 0.72, 0.2, 0, '#2f8fc4', '#90a4ae');
    p.box(0.42, 0.15, 0.88, 0.62, 0, 24, '#4fa3c7');
    p.winGrid('v', 0.62, 0.42, 0.88, 6, 20, 2, 1); p.winGrid('u', 0.88, 0.15, 0.62, 6, 20, 2, 1);
    p.roof('hip', 0.4, 0.13, 0.9, 0.64, 24, 8, '#37474f');
    p.line([0.42, 0.55, 6], [0.28, 0.72, 2], '#1565c0', 3);
    p.cyl(0.2, 0.25, 0.1, 0, 30, '#90caf9');
  };
  GEN.park = (p, r) => {
    p.lot(0.0, 0.0, 1, 1, '#86cf5c');
    p.poly([[0.44, 0], [0.56, 0], [0.56, 1], [0.44, 1]], '#e6d7b5');
    p.poly([[0, 0.44], [1, 0.44], [1, 0.56], [0, 0.56]], '#e6d7b5');
    p.disc(0.5, 0.5, 0.12, 0.2, '#d9c8a1');
    p.flowers(0.05, 0.6, 0.4, 0.95, 14); p.flowers(0.6, 0.05, 0.95, 0.4, 10);
    treeAt(p, 0.2, 0.2, 0.9); treeAt(p, 0.78, 0.22, 0.7);
    p.box(0.62, 0.66, 0.84, 0.72, 0, 3, '#8d6e63', { noEdge: true });
    p.bush(0.8, 0.85, 0.8, '#5aa843'); treeAt(p, 0.22, 0.8, 0.75);
    p.lamp(0.6, 0.38, 14);
  };
  GEN.plaza = (p) => {
    p.lot(0.0, 0.0, 1, 1, '#ddd5c4');
    for (let a = 0.1; a < 1; a += 0.2) { p.line([a, 0, 0], [a, 1, 0], 'rgba(150,140,120,0.3)', 0.5); p.line([0, a, 0], [1, a, 0], 'rgba(150,140,120,0.3)', 0.5); }
    p.cyl(0.5, 0.5, 0.32, 0, 4, '#bcaaa4', { top: '#d7ccc8', noShadow: true });
    p.disc(0.5, 0.5, 0.27, 4.1, '#4fc3f7');
    p.cyl(0.5, 0.5, 0.05, 4, 15, '#d7ccc8', { noShadow: true });
    p.cyl(0.5, 0.5, 0.12, 15, 17, '#d7ccc8', { noShadow: true, top: '#81d4fa' });
    p.emit.push({ k: 'fountain', u: 0.5, v: 0.5, z: 18 });
    p.lglow(0.5, 0.5, 6, 18, 'rgba(120,200,255,0.6)');
    for (const [u, v] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) p.bush(u, v, 0.6, '#5aa843');
    p.lamp(0.88, 0.5, 14); p.lamp(0.5, 0.88, 14);
  };
  GEN.bigpark = (p, r) => {
    p.lot(0.0, 0.0, 2, 2, '#86cf5c');
    const c = p.ctx, [x, y] = p.p(0.9, 1.0, 0);
    c.beginPath(); c.ellipse(x, y, 42, 20, 0, 0, 7); c.fillStyle = '#a5e2ef'; c.fill();
    c.beginPath(); c.ellipse(x, y + 1, 37, 17, 0, 0, 7); c.fillStyle = '#3ea6dc'; c.fill();
    c.beginPath(); c.ellipse(x - 10, y - 4, 10, 3, 0, 0, 7); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fill();
    c.strokeStyle = '#e6d7b5'; c.lineWidth = 3.5;
    const a = p.p(0, 1.75), b = p.p(1.3, 1.65), d = p.p(2, 0.4);
    c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(b[0], b[1], d[0], d[1]); c.stroke();
    for (const [u, v, s] of [[0.2, 0.2, 0.9], [0.6, 0.15, 0.8], [1.6, 0.2, 0.9], [0.15, 0.6, 0.7], [1.8, 1.0, 0.9], [1.7, 1.75, 0.85], [0.3, 1.8, 0.8]]) treeAt(p, u, v, s);
    // беседка
    p.box(1.25, 0.6, 1.55, 0.9, 0, 12, '#fafafa');
    p.roof('hip', 1.2, 0.55, 1.6, 0.95, 12, 10, '#c4493d');
    p.flowers(1.0, 1.4, 1.6, 1.95, 16);
    p.emit.push({ k: 'duck', u: 0.9, v: 1.0, z: 0 });
    p.lamp(1.0, 1.75, 14); p.lamp(1.9, 0.6, 14);
  };
  GEN.coal = (p) => {
    p.lot(0.0, 0.0, 2, 2, '#a6a094');
    p.cyl(0.35, 0.3, 0.13, 0, 150, '#eceff1', { hole: true });
    for (let z = 10; z < 150; z += 34) p.cyl(0.35, 0.3, 0.132, z, z + 14, '#d84315', { noShadow: true, hole: z + 14 >= 150 });
    p.cyl(0.85, 0.22, 0.12, 0, 130, '#eceff1', { hole: true });
    for (let z = 10; z < 130; z += 34) p.cyl(0.85, 0.22, 0.122, z, z + 14, '#d84315', { noShadow: true });
    p.emit.push({ k: 'smoke', u: 0.35, v: 0.3, z: 150, big: 1 }, { k: 'smoke', u: 0.85, v: 0.22, z: 130, big: 1 });
    const c = p.ctx, [x, y] = p.p(1.55, 0.45, 0);
    c.beginPath(); c.ellipse(x, y, 22, 9, 0, Math.PI, 0); c.quadraticCurveTo(x, y - 30, x - 22, y); c.fillStyle = '#2b2b2b'; c.fill();
    p.box(0.15, 0.6, 1.25, 1.85, 0, 46, '#9c5a44');
    p.winGrid('v', 1.85, 0.15, 1.25, 8, 42, 5, 3); p.winGrid('u', 1.25, 0.6, 1.85, 8, 42, 5, 3);
    p.box(0.15, 0.6, 1.25, 1.85, 46, 49, '#7b4a38', { noShadow: true });
    p.box(1.25, 1.0, 1.88, 1.85, 0, 28, '#90a4ae');
    p.winGrid('u', 1.88, 1.0, 1.85, 6, 24, 4, 1); p.winGrid('v', 1.85, 1.25, 1.88, 6, 24, 3, 1);
    p.line([1.25, 1.3, 20], [1.6, 1.0, 20], '#ffb300', 3);
  };
  GEN.solar = (p) => {
    p.lot(0.0, 0.0, 2, 2, '#c9c3b5');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const u0 = 0.12 + j * 0.6, u1 = u0 + 0.5, v0 = 0.15 + i * 0.45, v1 = v0 + 0.28;
      p.line([u0 + 0.1, v1, 0], [u0 + 0.1, v1, 4], '#777', 1); p.line([u1 - 0.1, v1, 0], [u1 - 0.1, v1, 4], '#777', 1);
      p.poly([[u0, v0, 9], [u1, v0, 9], [u1, v1, 4], [u0, v1, 4]], p.vgrad(p.p(u0, v0, 9), p.p(u0, v1, 4), '#4f7fc4', '#1f3f78'), 'rgba(220,230,255,0.6)', 0.6);
      p.line([(u0 + u1) / 2, v0, 9], [(u0 + u1) / 2, v1, 4], 'rgba(200,220,255,0.45)', 0.5);
      p.shadow(u0, v0, u1, v1 + 0.1, 3);
    }
    p.box(1.75, 1.65, 1.95, 1.95, 0, 10, '#eceff1');
  };
  GEN.nuclear = (p) => {
    p.lot(0.0, 0.0, 3, 3, '#bcb6a8');
    const tower = (u, v) => {
      const c = p.ctx, [x, yb] = p.p(u, v, 0), yt = yb - 105, rx = 34, ry = 17;
      p.p(u, v, 105); p.shadowEllipse(u, v, 0.5, 100);
      const g = c.createLinearGradient(x - rx, 0, x + rx, 0);
      g.addColorStop(0, '#d7dbdd'); g.addColorStop(0.35, '#f7f7f5'); g.addColorStop(1, '#9aa3a8');
      c.beginPath(); c.moveTo(x - rx, yb); c.quadraticCurveTo(x - rx * 0.45, yb - 70, x - rx * 0.66, yt);
      c.lineTo(x + rx * 0.66, yt); c.quadraticCurveTo(x + rx * 0.45, yb - 70, x + rx, yb);
      c.ellipse(x, yb, rx, ry, 0, 0, Math.PI); c.closePath(); c.fillStyle = g; c.fill();
      c.beginPath(); c.ellipse(x, yt, rx * 0.66, ry * 0.66, 0, 0, 7); c.fillStyle = '#c3c8cb'; c.fill();
      c.beginPath(); c.ellipse(x, yt + 1, rx * 0.56, ry * 0.56, 0, 0, 7); c.fillStyle = '#505a60'; c.fill();
      p.emit.push({ k: 'steam', u, v, z: 105 });
    };
    tower(0.75, 0.75); tower(2.0, 0.6);
    p.box(0.3, 1.6, 1.4, 2.7, 0, 36, '#90a4ae');
    p.winGrid('v', 2.7, 0.3, 1.4, 6, 32, 6, 2); p.winGrid('u', 1.4, 1.6, 2.7, 6, 32, 6, 2);
    p.cyl(2.1, 2.0, 0.55, 0, 40, '#eceff1', { top: '#eceff1' });
    p.dome(2.1, 2.0, 0.55, 40, '#eceff1');
    p.poly([[1.55, 2.6, 0], [2.65, 2.6, 0], [2.65, 2.9, 0], [1.55, 2.9, 0]], '#ffeb3b');
    p.lglow(2.1, 2.0, 70, 6, 'rgba(255,60,60,1)');
  };
  GEN.sewage = (p) => {
    p.lot(0.0, 0.0, 2, 2, '#b8c4b0');
    for (const [u, v] of [[0.55, 0.55], [1.45, 0.6], [0.6, 1.45]]) {
      p.cyl(u, v, 0.38, 0, 8, '#b0bec5', { top: '#cfd8dc' });
      p.disc(u, v, 0.33, 8.1, '#7f8f58');
      p.line([u - 0.3, v, 9], [u + 0.3, v, 9], '#eceff1', 1.2);
    }
    p.box(1.2, 1.25, 1.85, 1.85, 0, 22, '#d7ccc8');
    p.winGrid('v', 1.85, 1.2, 1.85, 6, 19, 3, 1); p.winGrid('u', 1.85, 1.25, 1.85, 6, 19, 3, 1);
    p.roof('flat', 1.2, 1.25, 1.85, 1.85, 22, 0, '#8d6e63');
  };
  GEN.landfill = (p) => {
    p.lot(0.0, 0.0, 2, 2, '#9b8261');
    const c = p.ctx, cols = ['#e57373', '#64b5f6', '#fff176', '#81c784', '#bdbdbd', '#ffffff', '#a1887f'];
    for (const [u, v, rr] of [[0.6, 0.6, 26], [1.35, 0.55, 20], [0.7, 1.35, 22], [1.3, 1.25, 16]]) {
      const [x, y] = p.p(u, v, 0);
      const g = c.createRadialGradient(x - 6, y - 10, 2, x, y, rr);
      g.addColorStop(0, '#a89070'); g.addColorStop(1, '#6e5a40');
      c.beginPath(); c.ellipse(x, y, rr, rr * 0.5, 0, Math.PI, 0); c.quadraticCurveTo(x, y - rr * 0.9, x - rr, y); c.fillStyle = g; c.fill();
      c.beginPath(); c.ellipse(x, y, rr, rr * 0.5, 0, 0, Math.PI); c.fillStyle = '#7a6448'; c.fill();
      for (let i = 0; i < 30; i++) { c.fillStyle = pick(p.r, cols); c.fillRect(x + (p.r() - 0.5) * rr * 1.5, y - p.r() * rr * 0.5, 1.6, 1.2); }
      p.p(u, v, rr * 0.7);
    }
    p.box(1.55, 1.55, 1.8, 1.72, 0, 7, '#fbc02d'); p.box(1.6, 1.58, 1.72, 1.7, 7, 11, '#455a64', { noShadow: true });
    for (let a = 0.05; a < 2; a += 0.25) { p.line([a, 1.97, 0], [a, 1.97, 6], '#5d4037', 0.8); p.line([1.97, a, 0], [1.97, a, 6], '#5d4037', 0.8); }
    p.line([0.05, 1.97, 5], [1.97, 1.97, 5], '#8d6e63', 0.6); p.line([1.97, 0.05, 5], [1.97, 1.97, 5], '#8d6e63', 0.6);
  };
  GEN.recycling = (p) => {
    p.lot(0.0, 0.0, 2, 2, '#c3cfb9');
    p.box(0.2, 0.2, 1.5, 1.4, 0, 34, '#e0e6dd');
    p.winGrid('v', 1.4, 0.2, 1.5, 8, 30, 6, 2); p.winGrid('u', 1.5, 0.2, 1.4, 8, 30, 5, 2);
    p.roof('flat', 0.2, 0.2, 1.5, 1.4, 34, 0, '#66bb6a');
    p.disc(0.85, 0.8, 0.3, 34.2, '#2e7d32');
    const c = p.ctx, [x, y] = p.p(0.85, 0.8, 34.2);
    c.strokeStyle = '#e8f5e9'; c.lineWidth = 1.8; for (let i = 0; i < 3; i++) { const a = i * 2.1; c.beginPath(); c.ellipse(x, y, 11, 5.5, 0, a, a + 1.5); c.stroke(); }
    const bins = ['#1e88e5', '#fdd835', '#43a047', '#e53935'];
    bins.forEach((col, i) => p.box(0.25 + i * 0.32, 1.6, 0.5 + i * 0.32, 1.85, 0, 9, col));
    p.cyl(1.75, 0.45, 0.14, 0, 40, '#a5d6a7');
  };
  GEN.police = (p) => {
    p.lot(0.02, 0.02, 0.98, 0.98, '#cfc9bd');
    p.flag(0.12, 0.12, 30, '#1e88e5');
    p.box(0.16, 0.16, 0.84, 0.72, 0, 28, '#eef2f6');
    p.poly([[0.16, 0.72, 17], [0.84, 0.72, 17], [0.84, 0.72, 21], [0.16, 0.72, 21]], '#1565c0');
    p.poly([[0.84, 0.16, 17], [0.84, 0.72, 17], [0.84, 0.72, 21], [0.84, 0.16, 21]], '#0d47a1');
    p.winGrid('v', 0.72, 0.16, 0.84, 3, 16, 4, 1, { skip: c => c === 1 }); p.winGrid('u', 0.84, 0.16, 0.72, 3, 16, 3, 1);
    p.winGrid('v', 0.72, 0.16, 0.84, 21, 28, 4, 1); p.winGrid('u', 0.84, 0.16, 0.72, 21, 28, 3, 1);
    p.poly([[0.33, 0.72, 0], [0.43, 0.72, 0], [0.43, 0.72, 11], [0.33, 0.72, 11]], '#263238');
    p.roof('flat', 0.16, 0.16, 0.84, 0.72, 28, 0, '#90a4ae');
    p.box(0.45, 0.35, 0.55, 0.45, 28, 31, '#e53935', { noShadow: true });
    p.lglow(0.5, 0.4, 31, 8, 'rgba(80,140,255,1)');
    p.car(0.7, 0.86, true, '#f5f5f5');
    p.box(0.66, 0.84, 0.72, 0.88, 7.5, 9, '#1e88e5', { noShadow: true, noEdge: true });
  };
  GEN.policeHQ = (p) => {
    p.lot(0, 0, 2, 2, '#cfc9bd');
    p.box(0.2, 0.2, 1.6, 1.4, 0, 22, '#eef2f6');
    p.box(0.45, 0.35, 1.45, 1.25, 22, 88, '#2f5d8a');
    p.winGrid('v', 1.25, 0.45, 1.45, 26, 86, 6, 7, { glass: '#7fb2e5', pa: 0.15 });
    p.winGrid('u', 1.45, 0.35, 1.25, 26, 86, 6, 7, { glass: '#5a8bbd', pa: 0.15 });
    p.winGrid('v', 1.4, 0.2, 1.6, 4, 18, 7, 1); p.winGrid('u', 1.6, 0.2, 1.4, 4, 18, 6, 1);
    p.box(0.85, 0.7, 1.05, 0.9, 88, 94, '#e53935', { noShadow: true });
    p.lglow(0.95, 0.8, 94, 10, 'rgba(80,140,255,1)');
    p.flag(0.1, 1.5, 40, '#1e88e5');
    for (let i = 0; i < 3; i++) p.car(0.4 + i * 0.4, 1.75, true, i === 1 ? '#263238' : '#f5f5f5');
  };
  GEN.fire = (p) => {
    p.lot(0.02, 0.02, 0.98, 0.98, '#cfc9bd');
    p.box(0.12, 0.12, 0.34, 0.34, 0, 50, '#b23a2c');
    p.winGrid('v', 0.34, 0.12, 0.34, 30, 46, 1, 2); p.roof('hip', 0.1, 0.1, 0.36, 0.36, 50, 8, '#37474f');
    p.box(0.14, 0.34, 0.86, 0.74, 0, 26, '#c0392b');
    p.poly([[0.2, 0.74, 0], [0.48, 0.74, 0], [0.48, 0.74, 15], [0.2, 0.74, 15]], '#eceff1');
    p.poly([[0.52, 0.74, 0], [0.8, 0.74, 0], [0.8, 0.74, 15], [0.52, 0.74, 15]], '#eceff1');
    for (let z = 2; z < 15; z += 3) { p.line([0.2, 0.74, z], [0.48, 0.74, z], '#b0bec5', 0.5); p.line([0.52, 0.74, z], [0.8, 0.74, z], '#b0bec5', 0.5); }
    p.winGrid('v', 0.74, 0.14, 0.86, 18, 24, 4, 1); p.winGrid('u', 0.86, 0.34, 0.74, 6, 22, 2, 2);
    p.roof('flat', 0.14, 0.34, 0.86, 0.74, 26, 0, '#8d6e63');
    p.box(0.55, 0.8, 0.85, 0.94, 0.5, 8, '#e53935');
    p.box(0.75, 0.8, 0.85, 0.94, 8, 11, '#e53935', { noShadow: true });
    p.line([0.55, 0.87, 9], [0.74, 0.87, 9], '#cfd8dc', 1.4);
  };
  GEN.clinic = (p) => {
    p.lot(0.02, 0.02, 0.98, 0.98, '#d7d2c6');
    p.box(0.15, 0.15, 0.85, 0.72, 0, 26, '#fafafa');
    p.winGrid('v', 0.72, 0.15, 0.85, 3, 24, 4, 2, { glass: '#7fc4c4', skip: (c, r) => r === 0 && c === 1 });
    p.winGrid('u', 0.85, 0.15, 0.72, 3, 24, 3, 2, { glass: '#5aa3a3' });
    p.poly([[0.33, 0.72, 0], [0.46, 0.72, 0], [0.46, 0.72, 10], [0.33, 0.72, 10]], '#4db6ac');
    p.roof('flat', 0.15, 0.15, 0.85, 0.72, 26, 0, '#cfd8dc');
    p.poly([[0.44, 0.3, 26.2], [0.56, 0.3, 26.2], [0.56, 0.58, 26.2], [0.44, 0.58, 26.2]], '#e53935');
    p.poly([[0.36, 0.38, 26.2], [0.64, 0.38, 26.2], [0.64, 0.5, 26.2], [0.36, 0.5, 26.2]], '#e53935');
    p.lpoly([[0.44, 0.3, 26.2], [0.56, 0.3, 26.2], [0.56, 0.58, 26.2], [0.44, 0.58, 26.2]], 'rgba(255,80,80,0.8)');
    p.car(0.7, 0.86, true, '#fafafa');
    p.box(0.62, 0.83, 0.66, 0.89, 7.5, 9, '#e53935', { noShadow: true, noEdge: true });
  };
  GEN.hospital = (p) => {
    p.lot(0, 0, 2, 2, '#d7d2c6');
    p.box(0.2, 0.15, 1.8, 1.3, 0, 96, '#fafafa');
    p.winGrid('v', 1.3, 0.2, 1.8, 6, 92, 8, 9, { glass: '#7fc4c4' });
    p.winGrid('u', 1.8, 0.15, 1.3, 6, 92, 6, 9, { glass: '#5aa3a3' });
    p.poly([[0.95, 1.3, 70], [1.05, 1.3, 70], [1.05, 1.3, 90], [0.95, 1.3, 90]], '#e53935');
    p.poly([[0.9, 1.3, 77], [1.1, 1.3, 77], [1.1, 1.3, 83], [0.9, 1.3, 83]], '#e53935');
    p.lpoly([[0.9, 1.3, 70], [1.1, 1.3, 70], [1.1, 1.3, 90], [0.9, 1.3, 90]], 'rgba(255,80,80,0.6)');
    p.roof('flat', 0.2, 0.15, 1.8, 1.3, 96, 0, '#cfd8dc');
    p.disc(1.0, 0.72, 0.38, 96.2, '#455a64');
    p.line([0.86, 0.6, 96.3], [0.86, 0.84, 96.3], '#ffd54f', 1.6); p.line([1.14, 0.6, 96.3], [1.14, 0.84, 96.3], '#ffd54f', 1.6); p.line([0.86, 0.72, 96.3], [1.14, 0.72, 96.3], '#ffd54f', 1.6);
    p.box(0.3, 1.3, 1.7, 1.8, 0, 20, '#eceff1');
    p.winGrid('v', 1.8, 0.3, 1.7, 3, 18, 7, 1, { glass: '#7fc4c4' }); p.winGrid('u', 1.7, 1.3, 1.8, 3, 18, 2, 1);
    p.car(1.85, 1.9, true, '#fafafa');
  };
  GEN.school = (p) => {
    p.lot(0, 0, 2, 2, '#9fd57a');
    p.box(0.1, 0.1, 1.25, 0.75, 0, 30, '#e59a5a');
    p.winGrid('v', 0.75, 0.1, 1.25, 4, 28, 6, 2); p.winGrid('u', 1.25, 0.1, 0.75, 4, 28, 3, 2);
    p.roof('gableU', 0.08, 0.08, 1.27, 0.77, 30, 10, '#a0522d'); p.gableWall('gableU', 0.1, 0.1, 1.25, 0.75, 30, 10, '#e59a5a');
    p.box(0.1, 0.75, 0.7, 1.9, 0, 30, '#e59a5a');
    p.winGrid('v', 1.9, 0.1, 0.7, 4, 28, 3, 2); p.winGrid('u', 0.7, 0.75, 1.9, 4, 28, 5, 2, { skip: (c, r) => r === 0 && c === 2 });
    p.poly([[0.7, 1.25, 0], [0.7, 1.4, 0], [0.7, 1.4, 11], [0.7, 1.25, 11]], '#5d4037');
    p.roof('gableV', 0.08, 0.75, 0.72, 1.92, 30, 10, '#a0522d'); p.gableWall('gableV', 0.1, 0.75, 0.7, 1.9, 30, 10, '#e59a5a');
    p.lot(0.95, 0.95, 1.9, 1.9, '#4caf50');
    for (let i = 0; i < 4; i++) p.lot(0.95 + i * 0.24, 0.95, 1.07 + i * 0.24, 1.9, '#58b85c');
    p.poly([[1.0, 1.0], [1.85, 1.0], [1.85, 1.85], [1.0, 1.85]], null, 'rgba(255,255,255,0.85)', 1);
    p.line([1.425, 1.0, 0], [1.425, 1.85, 0], 'rgba(255,255,255,0.85)', 1);
    p.flag(1.5, 0.3, 40, '#e53935');
    treeAt(p, 1.85, 0.25, 0.8);
  };
  GEN.library = (p) => {
    p.lot(0.02, 0.02, 0.98, 0.98, '#ddd5c4');
    p.box(0.1, 0.1, 0.9, 0.88, 0, 3, '#e0d6c2');
    p.box(0.16, 0.14, 0.84, 0.66, 3, 30, '#efe4cc');
    p.winGrid('u', 0.84, 0.14, 0.66, 8, 26, 3, 1, { glass: '#5d6f7f' });
    for (let a = 0.2; a < 0.84; a += 0.13) p.box(a, 0.74, a + 0.05, 0.79, 3, 28, '#f7f1e3', { noShadow: true });
    p.box(0.14, 0.66, 0.86, 0.82, 28, 31, '#e8dcc2', { noShadow: true });
    p.roof('gableV', 0.14, 0.14, 0.86, 0.82, 31, 12, '#8d8170'); p.gableWall('gableV', 0.14, 0.14, 0.86, 0.82, 31, 12, '#efe4cc');
    p.win('v', 0.66, 0.42, 0.58, 3, 18, { glass: '#4e342e', litP: 0.9 });
  };
  GEN.university = (p) => {
    p.lot(0, 0, 3, 3, '#93d468');
    p.poly([[1.35, 1.7], [1.65, 1.7], [1.65, 3], [1.35, 3]], '#e6d7b5');
    p.poly([[0, 2.25], [3, 2.25], [3, 2.45], [0, 2.45]], '#e6d7b5');
    for (const [u, v] of [[0.2, 0.2], [2.8, 0.25], [0.3, 2.7], [2.7, 2.75], [0.9, 2.7], [2.2, 2.75]]) treeAt(p, u, v, 0.9);
    const st = '#ece2cf';
    p.box(0.3, 0.3, 1.0, 1.7, 0, 46, st); p.winGrid('v', 1.7, 0.3, 1.0, 6, 42, 4, 3); p.winGrid('u', 1.0, 0.3, 1.7, 6, 42, 7, 3);
    p.roof('gableV', 0.28, 0.28, 1.02, 1.72, 46, 12, '#6d7b8a'); p.gableWall('gableV', 0.3, 0.3, 1.0, 1.7, 46, 12, st);
    p.box(2.0, 0.3, 2.7, 1.7, 0, 46, st); p.winGrid('v', 1.7, 2.0, 2.7, 6, 42, 4, 3); p.winGrid('u', 2.7, 0.3, 1.7, 6, 42, 7, 3);
    p.roof('gableV', 1.98, 0.28, 2.72, 1.72, 46, 12, '#6d7b8a'); p.gableWall('gableV', 2.0, 0.3, 2.7, 1.7, 46, 12, st);
    p.box(1.0, 0.4, 2.0, 1.55, 0, 56, st);
    p.winGrid('u', 2.0, 0.4, 1.55, 8, 52, 6, 3);
    for (let a = 1.05; a < 2.0; a += 0.13) p.box(a, 1.55, a + 0.05, 1.62, 0, 50, '#faf6ec', { noShadow: true });
    p.box(1.0, 1.5, 2.0, 1.66, 50, 56, '#e2d6bf', { noShadow: true });
    p.roof('gableU', 1.0, 0.4, 2.0, 1.66, 56, 12, '#6d7b8a'); p.gableWall('gableU', 1.0, 0.4, 2.0, 1.66, 56, 12, st);
    p.cyl(1.5, 1.0, 0.32, 62, 80, st, { noShadow: true });
    p.dome(1.5, 1.0, 0.32, 80, '#4f8a8b');
    p.line([1.5, 1.0, 102], [1.5, 1.0, 112], '#ffd54f', 1.4);
    p.lglow(1.5, 1.6, 30, 30, 'rgba(255,220,150,0.5)');
  };
  GEN.stadium = (p) => {
    p.lot(0, 0, 3, 3, '#bdb7aa');
    const seat = (u0, v0, u1, v1, h, col) => { p.box(u0, v0, u1, v1, 0, h, '#cfd8dc'); };
    seat(0.25, 0.2, 2.75, 0.62, 28); seat(0.2, 0.62, 0.62, 2.38, 28);
    p.poly([[0.62, 0.62, 0.1], [2.38, 0.62, 0.1], [2.38, 2.38, 0.1], [0.62, 2.38, 0.1]], '#4caf50');
    for (let i = 0; i < 6; i++) { const a = 0.62 + i * 0.293; p.poly([[a, 0.62, 0.1], [a + 0.146, 0.62, 0.1], [a + 0.146, 2.38, 0.1], [a, 2.38, 0.1]], '#5cbf60'); }
    p.poly([[0.75, 0.75, 0.2], [2.25, 0.75, 0.2], [2.25, 2.25, 0.2], [0.75, 2.25, 0.2]], null, 'rgba(255,255,255,0.9)', 1);
    p.line([1.5, 0.75, 0.2], [1.5, 2.25, 0.2], 'rgba(255,255,255,0.9)', 1);
    p.disc(1.5, 1.5, 0.25, 0.2, null, 'rgba(255,255,255,0.9)');
    // ступенчатые трибуны с цветными рядами
    const cols = ['#1e88e5', '#e53935', '#fdd835', '#1e88e5'];
    for (let i = 0; i < 4; i++) {
      p.poly([[0.25, 0.2 + i * 0.1, 28 - i * 6], [2.75, 0.2 + i * 0.1, 28 - i * 6], [2.75, 0.3 + i * 0.1, 28 - i * 6], [0.25, 0.3 + i * 0.1, 28 - i * 6]], cols[i]);
      p.poly([[0.2 + i * 0.1, 0.62, 28 - i * 6], [0.3 + i * 0.1, 0.62, 28 - i * 6], [0.3 + i * 0.1, 2.38, 28 - i * 6], [0.2 + i * 0.1, 2.38, 28 - i * 6]], shade(cols[i], 1.15));
    }
    p.box(2.38, 0.62, 2.8, 2.38, 0, 14, '#cfd8dc'); p.box(0.25, 2.38, 2.8, 2.8, 0, 14, '#cfd8dc');
    for (let i = 0; i < 3; i++) {
      p.line([2.42 + i * 0.12, 0.62, 4 + i * 4], [2.42 + i * 0.12, 2.38, 4 + i * 4], '#e53935', 2.5);
      p.line([0.62, 2.42 + i * 0.12, 4 + i * 4], [2.38, 2.42 + i * 0.12, 4 + i * 4], '#1e88e5', 2.5);
    }
    for (const [u, v] of [[0.2, 0.2], [2.85, 0.2], [0.2, 2.85], [2.85, 2.85]]) {
      p.line([u, v, 0], [u, v, 75], '#90a4ae', 1.6);
      p.box(u - 0.08, v - 0.08, u + 0.08, v + 0.08, 75, 82, '#eceff1', { noShadow: true });
      p.lglow(u, v, 78, 26, 'rgba(255,255,230,0.95)');
    }
    p.lglow(1.5, 1.5, 0, 70, 'rgba(255,255,220,0.35)');
  };
  GEN.cityhall = (p) => {
    p.lot(0, 0, 2, 2, '#ddd5c4');
    p.lot(0.1, 1.75, 1.9, 1.95, '#e6d7b5');
    treeAt(p, 0.15, 0.15, 0.8); treeAt(p, 1.85, 0.2, 0.8);
    const st = '#f3ead8';
    p.box(0.25, 0.3, 1.75, 1.45, 0, 40, st);
    p.winGrid('u', 1.75, 0.3, 1.45, 6, 36, 6, 2, { glass: '#4f6a85' });
    p.winGrid('v', 1.45, 0.25, 1.75, 6, 36, 8, 2, { glass: '#4f6a85' });
    p.box(0.25, 0.3, 1.75, 1.45, 40, 44, '#e2d6bf', { noShadow: true });
    for (let a = 0.6; a < 1.42; a += 0.14) p.box(a, 1.5, a + 0.06, 1.56, 0, 34, '#fffaf0', { noShadow: true });
    p.box(0.55, 1.45, 1.45, 1.62, 34, 38, '#e2d6bf', { noShadow: true });
    p.roof('gableV', 0.55, 1.4, 1.45, 1.62, 38, 12, '#e8dcc4');
    p.box(0.55, 1.58, 1.45, 1.75, 0, 2, '#d6ccb8', { noShadow: true });
    p.box(0.8, 0.6, 1.2, 1.0, 44, 70, st, { noShadow: true });
    p.winGrid('v', 1.0, 0.8, 1.2, 50, 66, 2, 1); p.winGrid('u', 1.2, 0.6, 1.0, 50, 66, 2, 1);
    p.dome(1.0, 0.8, 0.26, 70, '#6fa287');
    p.flag(1.0, 0.8, 110, '#e53935');
    p.shadow(0.8, 0.6, 1.2, 1.0, 100);
    p.flowers(0.1, 1.6, 0.5, 1.95, 10); p.flowers(1.5, 1.6, 1.9, 1.95, 10);
    p.lglow(1.0, 1.6, 15, 26, 'rgba(255,220,150,0.6)');
  };
  GEN.monument = (p) => {
    p.lot(0, 0, 1, 1, '#ddd5c4');
    p.disc(0.5, 0.5, 0.42, 0.1, '#cfc4ae');
    p.box(0.32, 0.32, 0.68, 0.68, 0, 8, '#bcaaa4'); p.box(0.38, 0.38, 0.62, 0.62, 8, 16, '#d7ccc8', { noShadow: true });
    const c = p.ctx, [x, y] = p.p(0.5, 0.5, 16), top = 105;
    const g = c.createLinearGradient(x - 7, 0, x + 7, 0); g.addColorStop(0, '#f5f5f5'); g.addColorStop(0.5, '#e0e0e0'); g.addColorStop(1, '#9e9e9e');
    c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x - 3.5, y - top + 16); c.lineTo(x, y - top + 6); c.lineTo(x + 3.5, y - top + 16); c.lineTo(x + 7, y); c.closePath(); c.fillStyle = g; c.fill();
    c.beginPath(); c.moveTo(x - 3.5, y - top + 16); c.lineTo(x, y - top + 6); c.lineTo(x + 3.5, y - top + 16); c.closePath(); c.fillStyle = '#ffca28'; c.fill();
    p.p(0.5, 0.5, top + 10); p.shadow(0.42, 0.42, 0.58, 0.58, top);
    for (const [u, v] of [[0.15, 0.5], [0.5, 0.15], [0.85, 0.5], [0.5, 0.85]]) p.bush(u, v, 0.55, '#5aa843');
    p.lglow(0.5, 0.5, 40, 30, 'rgba(255,230,170,0.7)');
  };
  GEN.ferris = (p) => {
    p.lot(0, 0, 2, 2, '#ddd5c4');
    p.box(0.3, 0.6, 1.7, 1.4, 0, 4, '#b0bec5');
    p.box(1.4, 1.5, 1.85, 1.85, 0, 12, '#ff8a65'); p.roof('hip', 1.37, 1.47, 1.88, 1.88, 12, 7, '#e53935');
    const c = p.ctx, [x, y] = p.p(1.0, 1.0, 4), cy = y - 95, R = 80;
    c.strokeStyle = '#78909c'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x - 30, y + 6); c.lineTo(x, cy); c.lineTo(x + 30, y + 6); c.stroke();
    p.p(1, 1, 4 + 95 + R + 8);
    p.shadow(0.6, 0.9, 1.4, 1.1, 170);
    p.emit.push({ k: 'wheel', x: x - p.ox, y: cy - p.oy, R });
  };
  GEN.tvtower = (p) => {
    p.lot(0, 0, 2, 2, '#ddd5c4');
    p.cyl(1.0, 1.0, 0.65, 0, 14, '#b0bec5', { top: '#cfd8dc' });
    const c = p.ctx, [x, y] = p.p(1.0, 1.0, 14), top = 250;
    const g = c.createLinearGradient(x - 10, 0, x + 10, 0); g.addColorStop(0, '#e0e0e0'); g.addColorStop(0.35, '#ffffff'); g.addColorStop(1, '#8e9aa3');
    c.beginPath(); c.moveTo(x - 11, y); c.lineTo(x - 4, y - top); c.lineTo(x + 4, y - top); c.lineTo(x + 11, y); c.closePath(); c.fillStyle = g; c.fill();
    for (let z = 30; z < top - 40; z += 40) { c.fillStyle = '#e53935'; const w = 11 - 7 * z / top; c.fillRect(x - w, y - z - 4, w * 2, 4); }
    p.cyl(1.0, 1.0, 0.36, 14 + top - 70, 14 + top - 48, '#cfd8dc', { noShadow: true });
    p.cyl(1.0, 1.0, 0.3, 14 + top - 48, 14 + top - 38, '#4fc3f7', { noShadow: true, top: '#eceff1' });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI; const px = x + Math.cos(a) * 18, py = y - top + 53 + Math.sin(a) * 6; if (p.lctx) { p.lit = true; p.lctx.fillStyle = '#fff2c4'; p.lctx.fillRect(px - 1.5, py - 2, 3, 4); } }
    c.strokeStyle = '#cfd8dc'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y - top); c.lineTo(x, y - top - 60); c.stroke();
    p.p(1, 1, 14 + top + 62);
    p.shadow(0.85, 0.85, 1.15, 1.15, top + 60);
    p.lglow(1, 1, 14 + top + 60, 7, 'rgba(255,40,40,1)');
    p.emit.push({ k: 'blink', u: 1, v: 1, z: 14 + top + 60 });
  };

  // Стройка и руины
  GEN.construct = (p, r, w, h) => {
    p.lot(0.04, 0.04, w - 0.04, h - 0.04, '#bf9a6a');
    const hh = 14 + Math.min(w, h) * 18;
    p.box(0.15, 0.15, w - 0.15, h - 0.15, 0, 3, '#b0aaa0');
    p.box(0.2, 0.2, w - 0.35, h - 0.35, 3, hh * 0.45, '#cfc8bb', { noShadow: true });
    const wood = '#e0a84a';
    for (let u = 0.15; u <= w - 0.14; u += (w - 0.3) / 3) { p.line([u, h - 0.15, 0], [u, h - 0.15, hh], wood, 1); }
    for (let v = 0.15; v <= h - 0.14; v += (h - 0.3) / 3) { p.line([w - 0.15, v, 0], [w - 0.15, v, hh], wood, 1); }
    for (let z = 8; z <= hh; z += 9) { p.line([0.15, h - 0.15, z], [w - 0.15, h - 0.15, z], wood, 0.9); p.line([w - 0.15, 0.15, z], [w - 0.15, h - 0.15, z], wood, 0.9); }
    const cu = 0.25, cv = 0.25, ch = hh + 35;
    p.line([cu, cv, 0], [cu, cv, ch], '#f9a825', 2);
    p.line([cu - 0.25, cv, ch], [cu + w * 0.7, cv, ch], '#f9a825', 1.6);
    p.line([cu + w * 0.55, cv, ch], [cu + w * 0.55, cv, ch - 22], '#555', 0.6);
    p.box(cu + w * 0.5, cv - 0.05, cu + w * 0.6, cv + 0.05, ch - 26, ch - 22, '#8d6e63', { noShadow: true, noEdge: true });
    p.shadow(cu - 0.03, cv - 0.03, cu + 0.03, cv + 0.03, ch);
    p.box(w - 0.4, h - 0.32, w - 0.12, h - 0.12, 0, 6, '#fbc02d');
    p.emit.push({ k: 'dust', u: w / 2, v: h / 2, z: 4 });
  };
  GEN.ruin = (p, r, w, h) => {
    p.lot(0.04, 0.04, w - 0.04, h - 0.04, '#6f655c');
    const cols = ['#8d8478', '#5d554d', '#a1958a', '#3e3a36', '#7b6a5a'];
    for (let i = 0; i < 10 * w * h; i++) {
      const u = 0.1 + r() * (w - 0.3), v = 0.1 + r() * (h - 0.3), s = 0.06 + r() * 0.12;
      p.box(u, v, u + s, v + s * (0.6 + r()), 0, 2 + r() * 7, pick(r, cols), { noEdge: true });
    }
    for (let i = 0; i < 4 * w; i++) { const u = 0.1 + r() * (w - 0.2), v = 0.1 + r() * (h - 0.2); p.line([u, v, 1], [u + 0.25, v + (r() - 0.5) * 0.3, 5 + r() * 6], '#2e2a26', 1.5); }
  };

  // ---------- Кэш спрайтов ----------
  const cache = new Map();
  function buildSprite(key, gen, w, h, hmax, seed) {
    const W = (w + h) * HW, H = hmax + (w + h) * HH + 6;
    const [c, x] = mkc(W, H), [l, lx] = mkc(W, H);
    const ext = Math.ceil(hmax * K) + 1;
    const [s, sx] = mkc((w + h + ext) * HW, (w + h + ext) * HH);
    const p = new P(x, lx, sx, h * HW, hmax, h * HW, 0, G.rng(seed));
    gen(p, p.r, w, h);
    return { c, l: p.lit ? l : null, s, ox: h * HW, oy: hmax, sox: h * HW, soy: 0, top: p.maxZ, emit: p.emit, w, h };
  }
  const ZH = { R: [0, 50, 75, 140, 260], C: [0, 60, 110, 330], I: [0, 70, 110, 130] };

  G.Sprites = {
    TW, TH, HW, HH, S,
    ground: null,
    init() {
      const g = this.ground = { grass: [], sand: [], water: [], road: [], bridge: [], zone: {} };
      for (let t = 0; t < 4; t++) { g.grass[t] = []; for (let v = 0; v < 4; v++) g.grass[t][v] = makeGrass(t, v); }
      for (let v = 0; v < 3; v++) g.sand[v] = makeSand(v);
      for (let t = 0; t < 3; t++) { g.water[t] = []; for (let m = 0; m < 16; m++) g.water[t][m] = makeWater(m, t); }
      for (let m = 0; m < 16; m++) { g.road[m] = makeRoad(m, false); g.bridge[m] = makeRoad(m, true); }
      for (const z of [1, 2, 3]) g.zone[z] = makeZone(z);
      g.offX = HW + GP; g.offY = GT;
      this.cars = []; const cc = ['#e53935', '#1e88e5', '#fdd835', '#f5f5f5', '#43a047', '#37474f', '#fb8c00', '#8e24aa'];
      for (let ci = 0; ci < cc.length; ci++) {
        this.cars[ci] = [];
        for (let d = 0; d < 2; d++) {
          const [c, x] = mkc(40, 30); const p = new P(x, null, null, 20, 20, 0, 0);
          x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(21, 21, 9, 4.5, 0, 0, 7); x.fill();
          p.car(0, 0, d === 0, cc[ci]);
          this.cars[ci][d] = c;
        }
      }
      // Грузовик
      this.truck = [];
      for (let d = 0; d < 2; d++) {
        const [c, x] = mkc(46, 36); const p = new P(x, null, null, 23, 24, 0, 0);
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(24, 25, 12, 6, 0, 0, 7); x.fill();
        const al = d === 0;
        if (al) { p.box(-0.22, -0.08, 0.1, 0.08, 1, 11, '#eceff1'); p.box(0.1, -0.08, 0.22, 0.08, 1, 8, '#fb8c00'); }
        else { p.box(-0.08, -0.22, 0.08, 0.1, 1, 11, '#eceff1'); p.box(-0.08, 0.1, 0.08, 0.22, 1, 8, '#fb8c00'); }
        this.truck[d] = c;
      }
      this.glows = {};
      this.clouds = [];
      for (let i = 0; i < 4; i++) this.clouds.push(this.makeCloud(i));
    },
    glow(col, r) {
      const k = col + r; if (this.glows[k]) return this.glows[k];
      const c = document.createElement('canvas'); c.width = c.height = r * 2;
      const x = c.getContext('2d'), g = x.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
      return (this.glows[k] = c);
    },
    makeCloud(seed) {
      const r = G.rng(seed * 991 + 7), W = 320, H = 160;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      const s = document.createElement('canvas'); s.width = W; s.height = H; const sx = s.getContext('2d');
      for (let i = 0; i < 14; i++) {
        const px = 60 + r() * 200, py = 70 + (r() - 0.5) * 40, pr = 26 + r() * 30;
        let g = x.createRadialGradient(px - pr * 0.3, py - pr * 0.4, pr * 0.1, px, py, pr);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.7, 'rgba(240,245,255,0.75)'); g.addColorStop(1, 'rgba(220,230,250,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, pr, 0, 7); x.fill();
        g = sx.createRadialGradient(px, py, 0, px, py, pr); g.addColorStop(0, 'rgba(0,0,20,0.5)'); g.addColorStop(1, 'rgba(0,0,20,0)');
        sx.fillStyle = g; sx.beginPath(); sx.arc(px, py, pr, 0, 7); sx.fill();
      }
      return { c, s };
    },
    icons: {},
    icon(emoji, ring) {
      const k = emoji + (ring || ''); if (this.icons[k]) return this.icons[k];
      const c = document.createElement('canvas'), R = 2; c.width = 34 * R; c.height = 42 * R;
      const x = c.getContext('2d'); x.scale(R, R);
      x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 4; x.shadowOffsetY = 2;
      x.fillStyle = '#ffffff'; x.beginPath(); x.arc(17, 16, 13, 0, 7); x.fill();
      x.beginPath(); x.moveTo(11, 26); x.lineTo(17, 35); x.lineTo(23, 26); x.fill();
      x.shadowColor = 'transparent';
      if (ring) { x.strokeStyle = ring; x.lineWidth = 2.5; x.beginPath(); x.arc(17, 16, 12, 0, 7); x.stroke(); }
      x.font = '15px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(emoji, 17, 17);
      return (this.icons[k] = c);
    },
    tree(n, v) {
      const k = 't' + n + '_' + v; if (cache.has(k)) return cache.get(k);
      const spr = buildSprite(k, (p, r) => {
        const spots = [[0.5, 0.5], [0.3, 0.35], [0.7, 0.62], [0.35, 0.7], [0.68, 0.3]];
        const cnt = n === 1 ? 1 : n === 2 ? 3 : 5;
        const pts = spots.slice(n === 1 ? 0 : 1, (n === 1 ? 0 : 1) + cnt).map(q => [q[0] + (r() - 0.5) * 0.12, q[1] + (r() - 0.5) * 0.12]);
        pts.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
        const pine = v % 3 === 0;
        for (const [u, vv] of pts) {
          const kind = pine ? (r() < 0.75 ? 1 : 0) : (r() < 0.15 ? 1 : 0);
          let col = kind ? pick(r, ['#2f7d4a', '#3b8a52', '#28704a']) : pick(r, TREE_COLS);
          if (v === 5 && r() < 0.5) col = pick(r, ['#e3a33a', '#d9774a', '#e8c547']);
          p.tree(u, vv, 0.75 + r() * 0.35, kind, col);
        }
      }, 1, 1, 44, n * 100 + v);
      cache.set(k, spr); return spr;
    },
    bld(b) {
      let key, gen, w = b.w, h = b.h, hmax;
      if (b.ruin) { key = 'ruin' + w; gen = GEN.ruin; hmax = 20; }
      else if (b.construct > 0) { key = 'con' + w + 'x' + h; gen = GEN.construct; hmax = 14 + Math.min(w, h) * 18 + 45; }
      else if (b.zone) { const z = G.ZONE[b.zone].key; key = z + b.lvl + '_' + (b.var % 4); gen = GEN[z + b.lvl]; hmax = ZH[z][b.lvl]; }
      else { key = b.type; gen = GEN[b.type]; hmax = G.BLD[b.type].sh + 20; }
      const ck = key + (b.abandoned ? '_a' : '');
      if (cache.has(ck)) return cache.get(ck);
      let spr;
      if (b.abandoned) {
        const base = cache.get(key) || this.bld(Object.assign({}, b, { abandoned: false }));
        spr = Object.assign({}, base, { c: desaturate(base.c), l: null, emit: [] });
      } else spr = buildSprite(key, gen, w, h, hmax, hashStr(key));
      cache.set(ck, spr); return spr;
    },
    preview(type) { return this.bld({ type, w: G.BLD[type].w, h: G.BLD[type].h, lvl: 1 }); },
  };
  function hashStr(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; }
  function desaturate(src) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const g = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) * 0.7; a[i] = g * 1.05 + 10; a[i + 1] = g + 8; a[i + 2] = g * 0.95 + 6; }
    x.putImageData(d, 0, 0); return c;
  }
})(window.G);
