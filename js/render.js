'use strict';
(function (G) {
  const SP = () => G.Sprites;
  const TW = G.TW, TH = G.TH, HW = TW / 2, HH = TH / 2, S = G.SS;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  // Цвет освещения в течение суток (multiply) и сила ночных огней
  const TINT = [[0, '#525f9c'], [4.5, '#525f9c'], [6, '#c9a0b4'], [7.5, '#ffffff'], [17, '#ffffff'], [18.6, '#ffc49a'], [20, '#8a78b0'], [21.5, '#525f9c'], [24, '#525f9c']];
  const NIGHT = [[0, 1], [5, 1], [6.5, 0.45], [7.6, 0], [17.6, 0], [19, 0.45], [20.5, 1], [24, 1]];
  function keyf(arr, h, col) {
    for (let i = 0; i < arr.length - 1; i++) {
      const [a, va] = arr[i], [b, vb] = arr[i + 1];
      if (h >= a && h <= b) { const t = (h - a) / (b - a || 1); return col ? G.mix(va, vb, t) : va + (vb - va) * t; }
    }
    return arr[0][1];
  }

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.cam = { x: 0, y: 0, z: 1 };
      this.particles = []; this.floats = []; this.cars = []; this.iconHits = [];
      this.time = 0; this.overlay = null; this.preview = null; this.hover = null; this.sel = null; this.shake = 0;
      this.sb = document.createElement('canvas'); this.sbx = this.sb.getContext('2d');
      this.resize();
    }
    setGame(g) {
      this.g = g; this.cars = []; this.particles = []; this.floats = [];
      this.clouds = [];
      for (let i = 0; i < 7; i++) this.clouds.push({ x: (Math.random() - 0.5) * g.W * TW, y: Math.random() * g.H * TH, v: 6 + Math.random() * 6, k: i % 4, s: 1.3 + Math.random() * 0.8 });
      this.centerOn(g.W / 2, g.H / 2); this.cam.z = 1;
      this.roadList = null; this.roadT = 0;
    }
    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cw = window.innerWidth; this.ch = window.innerHeight;
      this.cv.width = this.cw * this.dpr; this.cv.height = this.ch * this.dpr;
      this.sb.width = this.cv.width; this.sb.height = this.cv.height;
    }
    iso(x, y) { return [(x - y) * HW, (x + y) * HH]; }
    toWorld(sx, sy) { return [(sx - this.cw / 2) / this.cam.z + this.cam.x, (sy - this.ch / 2) / this.cam.z + this.cam.y]; }
    toScreen(wx, wy) { return [(wx - this.cam.x) * this.cam.z + this.cw / 2, (wy - this.cam.y) * this.cam.z + this.ch / 2]; }
    tileAt(sx, sy) {
      const [wx, wy] = this.toWorld(sx, sy);
      return [Math.floor((wx / HW + wy / HH) / 2), Math.floor((wy / HH - wx / HW) / 2)];
    }
    centerOn(tx, ty) { const [x, y] = this.iso(tx, ty); this.cam.x = x; this.cam.y = y; }
    clampCam() {
      const g = this.g, W = g.W;
      this.cam.x = G.clamp(this.cam.x, -W * HW, W * HW);
      this.cam.y = G.clamp(this.cam.y, 0, W * TH);
      this.cam.z = G.clamp(this.cam.z, 0.3, 3);
    }
    zoomAt(sx, sy, f) {
      const [wx, wy] = this.toWorld(sx, sy);
      this.cam.z = G.clamp(this.cam.z * f, 0.3, 3);
      const [wx2, wy2] = this.toWorld(sx, sy);
      this.cam.x += wx - wx2; this.cam.y += wy - wy2; this.clampCam();
    }
    camT(c) {
      const z = this.cam.z, d = this.dpr;
      const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      c.setTransform(d * z, 0, 0, d * z, d * (this.cw / 2 - this.cam.x * z + sx), d * (this.ch / 2 - this.cam.y * z + sy));
    }
    // ---------- Частицы ----------
    puff(x, y, type, n) {
      if (this.particles.length > 1600) return;
      for (let i = 0; i < (n || 1); i++) {
        const p = { x, y, vx: 0, vy: 0, life: 0, max: 1, r: 2, type };
        switch (type) {
          case 'smoke': Object.assign(p, { vx: 4 + Math.random() * 4, vy: -10 - Math.random() * 6, max: 3 + Math.random() * 2, r: 3, g: 4.5, col: [150, 150, 150] }); break;
          case 'dsmoke': Object.assign(p, { vx: 5 + Math.random() * 4, vy: -12 - Math.random() * 6, max: 4 + Math.random() * 2, r: 4, g: 6, col: [90, 88, 86] }); break;
          case 'steam': Object.assign(p, { vx: 3 + Math.random() * 3, vy: -14 - Math.random() * 5, max: 4, r: 8, g: 9, col: [245, 247, 250] }); break;
          case 'fire': Object.assign(p, { x: x + (Math.random() - 0.5) * 18, vx: (Math.random() - 0.5) * 6, vy: -25 - Math.random() * 20, max: 0.6 + Math.random() * 0.5, r: 4 + Math.random() * 3, g: -3 }); break;
          case 'fsmoke': Object.assign(p, { x: x + (Math.random() - 0.5) * 14, vx: 6, vy: -20, max: 2.5, r: 5, g: 8, col: [40, 36, 34] }); break;
          case 'dust': Object.assign(p, { x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 8, vy: -6, max: 1.2, r: 2, g: 3, col: [190, 160, 120] }); break;
          case 'drop': Object.assign(p, { vx: (Math.random() - 0.5) * 16, vy: -28 - Math.random() * 8, max: 0.9, r: 1.2, grav: 70 }); break;
          case 'spark': { const a = Math.random() * 6.28, s = 30 + Math.random() * 60; Object.assign(p, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, max: 0.8 + Math.random() * 0.4, r: 1.6, grav: 60, col: [255, 210, 60] }); break; }
          case 'firework': { const a = Math.random() * 6.28, s = 40 + Math.random() * 50; Object.assign(p, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: 1.2 + Math.random() * 0.6, r: 1.8, grav: 25, col: n.col }); break; }
          case 'debris': Object.assign(p, { vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, max: 1.4, r: 2 + Math.random() * 2, grav: 120, col: [80, 70, 60] }); break;
        }
        this.particles.push(p);
        if (type === 'firework') break;
      }
    }
    firework(x, y) {
      const cols = [[255, 90, 90], [255, 220, 90], [120, 220, 255], [190, 140, 255], [120, 255, 160]];
      const col = cols[(Math.random() * cols.length) | 0];
      for (let i = 0; i < 40; i++) this.puff(x, y, 'firework', { col });
    }
    floatText(wx, wy, text, col) { this.floats.push({ x: wx, y: wy, text, col: col || '#ffe082', life: 0 }); }

    // ---------- Машинки ----------
    updateCars(dt) {
      const g = this.g, sp = [0, 1, 1.6, 2.2][g.speed];
      this.roadT -= dt;
      if (!this.roadList || this.roadT <= 0) {
        this.roadT = 1; this.roadList = [];
        for (let i = 0; i < g.N; i++) if (g.road[i]) this.roadList.push(i);
      }
      const target = this.roadList.length > 3 ? Math.min(170, Math.floor(this.roadList.length * 0.4), 3 + Math.floor(g.stats.pop / 7) + Math.floor((g.stats.jobsI) / 15)) : 0;
      while (this.cars.length < target) {
        const i = this.roadList[(Math.random() * this.roadList.length) | 0];
        const isT = Math.random() < Math.min(0.3, g.stats.jobsI / (g.stats.pop + 30));
        this.cars.push({ x: i % g.W, y: (i / g.W) | 0, d: (Math.random() * 4) | 0, t: Math.random(), col: (Math.random() * 8) | 0, truck: isT, v: 0.8 + Math.random() * 0.5 });
      }
      if (this.cars.length > target) this.cars.length = target;
      const road = (x, y) => g.inb(x, y) && g.road[g.idx(x, y)];
      for (const c of this.cars) {
        if (!road(c.x, c.y)) { c.dead = true; continue; }
        c.t += dt * sp * c.v * 1.4;
        while (c.t >= 1) {
          c.t -= 1;
          const [dx, dy] = DIRS[c.d];
          if (road(c.x + dx, c.y + dy)) { c.x += dx; c.y += dy; }
          const opts = [];
          for (let d = 0; d < 4; d++) { if (d === (c.d + 2) % 4) continue; if (road(c.x + DIRS[d][0], c.y + DIRS[d][1])) opts.push(d); }
          if (!opts.length) c.d = (c.d + 2) % 4;
          else if (opts.includes(c.d) && Math.random() < 0.6) { /* прямо */ }
          else c.d = opts[(Math.random() * opts.length) | 0];
        }
      }
      this.cars = this.cars.filter(c => !c.dead);
    }
    carPos(c) {
      const [dx, dy] = DIRS[c.d];
      const fx = c.x + 0.5 + dx * (c.t - 0.5) + (-dy) * 0.17, fy = c.y + 0.5 + dy * (c.t - 0.5) + dx * 0.17;
      return [fx, fy];
    }

    // ---------- Кадр ----------
    draw(dt) {
      const g = this.g; if (!g) return;
      this.time += dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
      this.updateCars(dt);
      const c = this.ctx, d = this.dpr, z = this.cam.z, sp = SP(), gr = sp.ground;
      const W = g.W, hour = g.hour;
      const night = keyf(NIGHT, hour), tint = keyf(TINT, hour, true);
      this.dynLights = [];

      c.setTransform(d, 0, 0, d, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      const bg = c.createLinearGradient(0, 0, 0, this.ch);
      bg.addColorStop(0, '#7cc6ea'); bg.addColorStop(1, '#3f8fc4');
      c.fillStyle = bg; c.fillRect(0, 0, this.cw, this.ch);
      // лёгкие волны на фоне
      c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1.2;
      for (let i = 0; i < 18; i++) {
        const yy = ((i * 97 + this.time * 6) % (this.ch + 40)) - 20, xx = (i * 211) % this.cw;
        c.beginPath(); c.moveTo(xx, yy); c.quadraticCurveTo(xx + 20, yy - 4, xx + 40, yy); c.stroke();
      }

      this.camT(c);
      const [wx0, wy0] = this.toWorld(0, 0), [wx1, wy1] = this.toWorld(this.cw, this.ch);
      const vis = (x, y, l, t, r, b) => !(x + r < wx0 || x - l > wx1 || y + b < wy0 || y - t > wy1);

      this.drawSides(c);

      // ----- Земля (кэш чанками) -----
      const waterTiles = [], roadVis = [];
      this.drawGround(c, vis);
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const wx = (x - y) * HW, wy = (x + y) * HH;
        if (!vis(wx, wy, HW, 0, HW, TH)) continue;
        const i = y * W + x;
        if (g.road[i]) roadVis.push(i); else if (g.terrain[i] === 1) waterTiles.push(i);
      }
      // блики на воде
      c.fillStyle = 'rgba(255,255,255,0.55)';
      for (const i of waterTiles) {
        const x = i % W, y = (i / W) | 0, ph = this.time * 1.3 + g.gv[i] * 0.37;
        const s = Math.sin(ph);
        if (s > 0.6) {
          const [wx, wy] = this.iso(x, y), a = (s - 0.6) * 2.5;
          c.globalAlpha = a * 0.7;
          c.fillRect(wx - 8 + (g.gv[i] % 10), wy + HH - 2 + (g.gv[i] % 7) - 3, 7, 1.2);
        }
      }
      c.globalAlpha = 1;

      if (this.overlay) this.drawOverlay(c, vis);

      // ----- Список объектов -----
      const objs = [];
      for (const b of g.buildings.values()) {
        const [wx, wy] = this.iso(b.x, b.y), spr = sp.bld(b);
        if (!vis(wx - spr.ox, wy - spr.oy, 0, 0, spr.c.width / S, spr.c.height / S + 40)) continue;
        objs.push({ d: b.x + b.w - 1 + b.y + b.h - 1 + 0.5, b, spr, wx, wy });
      }
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!g.tree[i] || g.bld[i] >= 0 || g.road[i] || this.staticTree(x, y)) continue;
        const wx = (x - y) * HW, wy = (x + y) * HH;
        if (!vis(wx, wy, HW, 50, HW, TH)) continue;
        const spr = sp.tree(g.tree[i], g.gv[i] % 6);
        objs.push({ d: x + y, spr, wx, wy });
      }
      for (const car of this.cars) {
        const [fx, fy] = this.carPos(car), [wx, wy] = this.iso(fx, fy);
        if (!vis(wx, wy, 20, 20, 20, 20)) continue;
        objs.push({ d: fx + fy - 0.5, car, wx, wy: wy - (g.terrain[g.idx(car.x, car.y)] === 1 ? 5 : 0) });
      }
      objs.sort((a, b) => a.d - b.d);

      // ----- Тени -----
      const sx = this.sbx; sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, this.sb.width, this.sb.height);
      this.camT(sx);
      for (const o of objs) if (o.spr && o.spr.s) sx.drawImage(o.spr.s, o.wx - o.spr.sox, o.wy - o.spr.soy, o.spr.s.width / S, o.spr.s.height / S);
      for (const cl of this.clouds) {
        const cs = sp.clouds[cl.k].s; sx.globalAlpha = 0.5;
        sx.drawImage(cs, cl.x + 90, cl.y + 160, 320 * cl.s, 160 * cl.s); sx.globalAlpha = 1;
      }
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.24; c.drawImage(this.sb, 0, 0); c.globalAlpha = 1;
      this.camT(c);

      // ----- Объекты -----
      const ovA = this.overlay ? 0.55 : 1;
      for (const o of objs) {
        if (o.car) {
          const car = o.car, arr = car.truck ? sp.truck : sp.cars[car.col];
          const im = arr[car.d % 2];
          if (car.truck) c.drawImage(im, o.wx - 23, o.wy - 24, 46, 36); else c.drawImage(im, o.wx - 20, o.wy - 20, 40, 30);
          if (night > 0.2) { const [dx, dy] = DIRS[car.d]; const [hx, hy] = this.iso(dx * 0.22, dy * 0.22); this.dynLights.push([o.wx + hx, o.wy + hy - 3, 10, '#fff2c0', 0.8]); }
          continue;
        }
        const b = o.b, spr = o.spr;
        c.globalAlpha = b ? ovA : 1;
        c.drawImage(spr.c, o.wx - spr.ox, o.wy - spr.oy, spr.c.width / S, spr.c.height / S);
        c.globalAlpha = 1;
        if (b) this.drawDyn(c, b, spr, o.wx, o.wy, dt, night);
      }

      // ----- Частицы -----
      this.drawParticles(c, dt);
      this.drawDisasters(c, dt);

      // ----- Облака -----
      const ca = G.clamp((1.15 - z) * 0.9, 0, 0.6);
      for (const cl of this.clouds) {
        cl.x += cl.v * dt;
        if (cl.x > W * HW + 200) { cl.x = -W * HW - 600; cl.y = Math.random() * W * TH - 100; }
        if (ca > 0.01) { c.globalAlpha = ca; c.drawImage(sp.clouds[cl.k].c, cl.x, cl.y, 320 * cl.s, 160 * cl.s); }
      }
      c.globalAlpha = 1;

      // ----- Освещение -----
      c.setTransform(d, 0, 0, d, 0, 0);
      this.rainA = G.lerp(this.rainA || 0, g.raining ? 1 : 0, Math.min(1, dt * 0.6));
      if (tint !== 'rgb(255,255,255)') {
        c.globalCompositeOperation = 'multiply'; c.fillStyle = tint; c.fillRect(0, 0, this.cw, this.ch);
      }
      if (this.rainA > 0.01) {
        c.globalCompositeOperation = 'multiply'; c.fillStyle = G.mix('#ffffff', '#8e9bb3', this.rainA); c.fillRect(0, 0, this.cw, this.ch);
      }
      c.globalCompositeOperation = 'lighter';
      this.camT(c);
      if (night > 0.02) {
        for (const o of objs) {
          const b = o.b; if (!b || !o.spr.l) continue;
          let a = night;
          if (b.zone) a *= b.abandoned ? 0 : b.occ > 0 ? (b.power ? 1 : 0.1) : 0.15;
          if (b.construct > 0) a = 0;
          if (a <= 0) continue;
          c.globalAlpha = a; c.drawImage(o.spr.l, o.wx - o.spr.ox, o.wy - o.spr.oy, o.spr.l.width / S, o.spr.l.height / S);
        }
        const lampG = sp.glow('rgba(255,200,120,0.55)', 32);
        c.globalAlpha = night * 0.7;
        for (const i of roadVis) {
          const x = i % W, y = (i / W) | 0; if ((x + y) % 2) continue;
          const [wx, wy] = this.iso(x + 0.5, y + 0.5);
          c.drawImage(lampG, wx - 24, wy - 14, 48, 28);
        }
        for (const [x, y, r, col, a] of this.dynLights) { c.globalAlpha = night * a; const gl = sp.glow(col, 24); c.drawImage(gl, x - r, y - r, r * 2, r * 2); }
      }
      // огонь светится всегда
      for (const b of g.buildings.values()) if (b.fire) {
        const [wx, wy] = this.iso(b.x + b.w / 2, b.y + b.h / 2);
        c.globalAlpha = 0.55 + Math.sin(this.time * 12 + b.id) * 0.15;
        c.drawImage(sp.glow('rgba(255,120,40,0.9)', 40), wx - 50, wy - 70, 100, 100);
      }
      for (const p of this.particles) if (p.type === 'fire' || p.type === 'spark' || p.type === 'firework') {
        const t = p.life / p.max; c.globalAlpha = (1 - t) * 0.9;
        const col = p.type === 'fire' ? (t < 0.3 ? '#fff2a8' : t < 0.6 ? '#ffb030' : '#ff5a20') : G.rgbStr(...p.col);
        c.fillStyle = col; c.beginPath(); c.arc(p.x, p.y, p.r * (p.type === 'fire' ? 1 - t * 0.5 : 1), 0, 7); c.fill();
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

      if (this.rainA > 0.02) this.drawRain(c, dt);

      // ----- Интерфейс в мире -----
      this.drawPreview(c);
      this.drawIcons(c);
      this.drawFloats(c, dt);
    }
    drawRain(c, dt) {
      if (!this.drops) { this.drops = []; for (let i = 0; i < 260; i++) this.drops.push({ x: Math.random(), y: Math.random(), l: 10 + Math.random() * 14, v: 0.7 + Math.random() * 0.6 }); }
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.strokeStyle = `rgba(210,225,255,${0.35 * this.rainA})`; c.lineWidth = 1.1; c.beginPath();
      const n = Math.floor(this.drops.length * this.rainA);
      for (let i = 0; i < n; i++) {
        const d = this.drops[i];
        d.y += d.v * dt * 1.3; d.x -= d.v * dt * 0.25;
        if (d.y > 1) { d.y -= 1.05; d.x = Math.random() * 1.2; }
        if (d.x < -0.1) d.x += 1.2;
        const x = d.x * this.cw, y = d.y * this.ch;
        c.moveTo(x, y); c.lineTo(x - d.l * 0.25, y + d.l);
      }
      c.stroke();
      this.camT(c);
    }
    // Дерево можно «запечь» в землю, если позади него нет зданий и дорог
    staticTree(x, y) {
      const g = this.g;
      for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1], [-2, -1], [-1, -2], [-2, -2], [-2, 0], [0, -2]]) {
        const xx = x + dx, yy = y + dy; if (!g.inb(xx, yy)) continue;
        const j = g.idx(xx, yy); if (g.bld[j] >= 0 || g.road[j]) return false;
      }
      return true;
    }
    chunkSig(cx, cy) {
      const g = this.g, CS = 8; let h = 17;
      for (let y = cy * CS - 2; y < cy * CS + CS + 2; y++) for (let x = cx * CS - 2; x < cx * CS + CS + 2; x++) {
        if (!g.inb(x, y)) continue; const i = y * g.W + x;
        h = (Math.imul(h, 31) + g.terrain[i] + g.road[i] * 4 + g.zone[i] * 8 + (g.bld[i] >= 0 ? 32 : 0) + g.tree[i] * 64 + g.res[i] * 512) | 0;
      }
      return h;
    }
    chunkBounds(cx, cy) {
      const CS = 8, x0 = cx * CS, y0 = cy * CS;
      return { l: (x0 - y0 - CS) * HW - 4, r: (x0 + CS - y0) * HW + 4, t: (x0 + y0) * HH - 60, b: (x0 + y0 + 2 * CS) * HH + 8 };
    }
    buildChunk(cx, cy, sc) {
      const g = this.g, gr = SP().ground, CS = 8, B = this.chunkBounds(cx, cy);
      const cvs = document.createElement('canvas');
      cvs.width = Math.ceil((B.r - B.l) * sc); cvs.height = Math.ceil((B.b - B.t) * sc);
      const c = cvs.getContext('2d'); c.setTransform(sc, 0, 0, sc, -B.l * sc, -B.t * sc);
      const ox = gr.offX, oy = gr.offY, gw = TW + 4, gh = TH + 4 + 12;
      const trees = [];
      for (let y = cy * CS; y < cy * CS + CS; y++) for (let x = cx * CS; x < cx * CS + CS; x++) {
        if (!g.inb(x, y)) continue;
        const wx = (x - y) * HW, wy = (x + y) * HH, i = y * g.W + x, t = g.terrain[i];
        if (t === 1) { const m = this.mask(x, y, (xx, yy) => g.terrain[g.idx(xx, yy)] !== 1); c.drawImage(gr.water[m ? 0 : 1][m], wx - ox, wy - oy, gw, gh); }
        else if (t === 2) c.drawImage(gr.sand[g.gv[i] % 3], wx - ox, wy - oy, gw, gh);
        else c.drawImage(gr.grass[g.tone[i]][g.gv[i] % 7 === 0 ? 2 : g.gv[i] % 13 === 0 ? 3 : g.gv[i] % 2], wx - ox, wy - oy, gw, gh);
        if (g.res[i] && !g.road[i] && g.bld[i] < 0) c.drawImage(gr.dep[g.res[i]][g.gv[i] % 3], wx - ox, wy - oy, gw, gh);
        if (g.road[i]) { const m = this.mask(x, y, (xx, yy) => g.road[g.idx(xx, yy)]); c.drawImage(t === 1 ? gr.bridge[m] : gr.road[m], wx - ox, wy - oy, gw, gh); }
        else if (g.zone[i] && g.bld[i] < 0) c.drawImage(gr.zone[g.zone[i]], wx - ox, wy - oy, gw, gh);
        if (g.tree[i] && g.bld[i] < 0 && !g.road[i] && this.staticTree(x, y)) trees.push([x, y, SP().tree(g.tree[i], g.gv[i] % 6)]);
      }
      trees.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
      c.globalAlpha = 0.24;
      for (const [x, y, spr] of trees) { const wx = (x - y) * HW, wy = (x + y) * HH; c.drawImage(spr.s, wx - spr.sox, wy - spr.soy, spr.s.width / S, spr.s.height / S); }
      c.globalAlpha = 1;
      for (const [x, y, spr] of trees) { const wx = (x - y) * HW, wy = (x + y) * HH; c.drawImage(spr.c, wx - spr.ox, wy - spr.oy, spr.c.width / S, spr.c.height / S); }
      return cvs;
    }
    drawGround(c, vis) {
      const g = this.g, n = Math.ceil(g.W / 8);
      const sc = this.cam.z * this.dpr > 1.15 ? 2 : 1;
      if (sc !== this.chunkScale || this.chunkGame !== g) { this.chunks = new Map(); this.chunkScale = sc; this.chunkGame = g; }
      let built = 0;
      const order = [];
      for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) order.push([cx, cy]);
      order.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);
      const seen = new Set();
      for (const [cx, cy] of order) {
        const B = this.chunkBounds(cx, cy);
        if (!vis(B.l, B.t, 0, 0, B.r - B.l, B.b - B.t)) continue;
        const key = cx + ',' + cy, sig = this.chunkSig(cx, cy);
        let ch = this.chunks.get(key);
        if (!ch || (ch.sig !== sig && built < 6)) { ch = { c: this.buildChunk(cx, cy, sc), sig }; this.chunks.set(key, ch); built++; }
        seen.add(key);
        c.drawImage(ch.c, B.l, B.t, B.r - B.l, B.b - B.t);
      }
      if (sc === 2 && this.chunks.size > 36) for (const k of [...this.chunks.keys()]) if (!seen.has(k)) this.chunks.delete(k);
    }
    mask(x, y, f) {
      const g = this.g; let m = 0;
      if (g.inb(x - 1, y) && f(x - 1, y)) m |= 1;
      if (g.inb(x, y - 1) && f(x, y - 1)) m |= 2;
      if (g.inb(x + 1, y) && f(x + 1, y)) m |= 4;
      if (g.inb(x, y + 1) && f(x, y + 1)) m |= 8;
      return m;
    }
    drawSides(c) {
      const g = this.g, W = g.W, D = 46;
      const seg = (a, b, water, left) => {
        const grd = c.createLinearGradient(0, a[1], 0, a[1] + D);
        if (water) { grd.addColorStop(0, left ? '#3a9fd6' : '#2f8ac0'); grd.addColorStop(1, '#1d5f8a'); }
        else { grd.addColorStop(0, left ? '#6fae4c' : '#5c9a3f'); grd.addColorStop(0.1, left ? '#9c6b42' : '#84583a'); grd.addColorStop(0.55, left ? '#7d5233' : '#694427'); grd.addColorStop(1, left ? '#5a3a24' : '#4a2f1d'); }
        c.fillStyle = grd; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(b[0], b[1] + D); c.lineTo(a[0], a[1] + D); c.closePath(); c.fill();
      };
      for (let x = 0; x < W; x++) seg(this.iso(x, W), this.iso(x + 1, W), g.terrain[g.idx(x, W - 1)] === 1, true);
      for (let y = 0; y < W; y++) seg(this.iso(W, y), this.iso(W, y + 1), g.terrain[g.idx(W - 1, y)] === 1, false);
      // полоски слоёв
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
      for (const k of [18, 32]) {
        const a = this.iso(0, W), b = this.iso(W, W), e = this.iso(W, 0);
        c.beginPath(); c.moveTo(a[0], a[1] + k); c.lineTo(b[0], b[1] + k); c.lineTo(e[0], e[1] + k); c.stroke();
      }
    }
    drawOverlay(c, vis) {
      const g = this.g, W = g.W, ov = this.overlay;
      if (ov === 'res') {
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x, [wx, wy] = this.iso(x, y);
          if (!vis(wx, wy, HW, 0, HW, TH)) continue;
          if (g.res[i] === 1) c.fillStyle = '#e2e8f0'; else if (g.res[i] === 2) c.fillStyle = '#0f172a';
          else if (g.tree[i]) c.fillStyle = G.alpha('#16a34a', 0.3 + g.tree[i] * 0.2); else continue;
          dia(wx, wy); c.fill();
        }
        c.globalAlpha = 1; return;
      }
      const res = G.RES.includes(ov);
      const field = { lv: g.lv, pol: g.pol, crime: g.crime }[ov] || g.cov[ov];
      const dia = (wx, wy) => { c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx + HW, wy + HH); c.lineTo(wx, wy + TH); c.lineTo(wx - HW, wy + HH); c.closePath(); };
      c.globalAlpha = 0.6;
      if (res) {
        for (const b of g.buildings.values()) {
          if (b.ruin) continue;
          const d = G.BLD[b.type];
          let col = null;
          if (d && d.provides && d.provides[ov]) col = b.rc >= 0 ? '#3b82f6' : '#a855f7';
          else if (b.zone && b.construct <= 0 && !b.abandoned) col = b[ov] ? '#22c55e' : (G.needsFor(b.lvl).includes(ov) ? '#ef4444' : '#f59e0b');
          if (!col) continue;
          c.fillStyle = col;
          for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { const [wx, wy] = this.iso(x, y); dia(wx, wy); c.fill(); }
        }
        c.fillStyle = 'rgba(255,255,255,0.35)';
        for (let i = 0; i < g.N; i++) if (g.road[i]) { const [wx, wy] = this.iso(i % W, (i / W) | 0); dia(wx, wy); c.fill(); }
      } else if (field) {
        const bad = ov === 'pol' || ov === 'crime';
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x; if (g.terrain[i] === 1) continue;
          const v = field[i];
          const [wx, wy] = this.iso(x, y); if (!vis(wx, wy, HW, 0, HW, TH)) continue;
          if (ov === 'lv') c.fillStyle = v < 0.5 ? G.mix('#ef4444', '#facc15', v * 2) : G.mix('#facc15', '#22c55e', (v - 0.5) * 2);
          else if (bad) { if (v < 0.03) continue; c.fillStyle = ov === 'pol' ? G.alpha('#7c3aed', Math.min(1, v * 1.4)) : G.alpha('#dc2626', Math.min(1, v * 1.4)); }
          else { c.fillStyle = v > 0 ? G.alpha('#22c55e', 0.3 + v * 0.7) : 'rgba(239,68,68,0.35)'; }
          dia(wx, wy); c.fill();
        }
      }
      c.globalAlpha = 1;
    }
    drawDyn(c, b, spr, wx, wy, dt, night) {
      const g = this.g, active = b.zone ? b.occ > 0 && !b.abandoned : b.rc >= 0;
      if (b.construct > 0 && Math.random() < dt * 2) { const [x, y] = this.iso(b.x + b.w / 2, b.y + b.h / 2); this.puff(x, y, 'dust', 2); }
      if (b.fire) {
        const [x, y] = this.iso(b.x + b.w / 2, b.y + b.h / 2);
        if (Math.random() < dt * 30) this.puff(x, y - 10, 'fire');
        if (Math.random() < dt * 6) this.puff(x, y - 25, 'fsmoke');
      }
      for (const e of spr.emit) {
        let x, y;
        if (e.u !== undefined) { const p = this.iso(b.x + e.u, b.y + e.v); x = p[0]; y = p[1] - e.z; }
        else { x = wx + e.x; y = wy + e.y; }
        if (e.k === 'smoke' && active && Math.random() < dt * (e.big ? 5 : 3)) this.puff(x, y, e.big ? 'dsmoke' : 'smoke');
        else if (e.k === 'steam' && active && Math.random() < dt * 4) this.puff(x, y, 'steam');
        else if (e.k === 'fountain' && Math.random() < dt * 25) this.puff(x, y, 'drop');
        else if (e.k === 'rotor') {
          const a = this.time * (active ? 3 : 0.4) + b.id;
          c.strokeStyle = '#f5f7fa'; c.lineWidth = 2.2; c.lineCap = 'round';
          for (let k = 0; k < 3; k++) { const aa = a + k * 2.094; c.beginPath(); c.moveTo(x + e.x, y); c.lineTo(x + e.x + Math.cos(aa) * 30, y + Math.sin(aa) * 30); c.stroke(); }
          c.fillStyle = '#cfd8dc'; c.beginPath(); c.arc(x + e.x, y, 2.4, 0, 7); c.fill();
        } else if (e.k === 'wheel') {
          const a = this.time * 0.25, R = e.R;
          c.lineWidth = 2.6; c.strokeStyle = '#eceff1'; c.beginPath(); c.arc(x, y, R, 0, 7); c.stroke();
          c.lineWidth = 1.2; c.strokeStyle = '#b0bec5'; c.beginPath(); c.arc(x, y, R * 0.82, 0, 7); c.stroke();
          const cols = ['#ef5350', '#ffca28', '#42a5f5', '#66bb6a', '#ab47bc', '#ff7043'];
          for (let k = 0; k < 16; k++) {
            const aa = a + k * Math.PI / 8, px = x + Math.cos(aa) * R, py = y + Math.sin(aa) * R;
            c.strokeStyle = 'rgba(207,216,220,0.9)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(px, py); c.stroke();
            if (k % 2 === 0) { c.fillStyle = cols[(k / 2) % cols.length]; c.fillRect(px - 4, py, 8, 7); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(px - 3, py + 1, 6, 2); }
            if (night > 0.1) this.dynLights.push([px, py, 7, cols[k % cols.length], 1]);
          }
          c.fillStyle = '#90a4ae'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill();
        } else if (e.k === 'duck') {
          const t = this.time * 0.3 + b.id, [px, py] = [x + Math.cos(t) * 26, y + Math.sin(t) * 10];
          c.fillStyle = '#fafafa'; c.beginPath(); c.ellipse(px, py, 3, 2, 0, 0, 7); c.fill();
          c.beginPath(); c.arc(px + 2 * Math.sign(-Math.sin(t)), py - 2, 1.4, 0, 7); c.fill();
        } else if (e.k === 'blink' && Math.sin(this.time * 4) > 0) this.dynLights.push([x, y, 10, 'rgba(255,40,40,1)', 1.2]);
      }
    }
    drawParticles(c, dt) {
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; p.life += dt;
        if (p.life >= p.max) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; if (p.grav) p.vy += p.grav * dt;
        if (p.g) p.r += p.g * dt;
      }
      for (const p of ps) {
        if (p.type === 'fire' || p.type === 'spark' || p.type === 'firework') continue;
        const t = p.life / p.max;
        if (p.type === 'drop') { c.globalAlpha = 0.8 * (1 - t); c.fillStyle = '#bfe9ff'; c.fillRect(p.x, p.y, 1.4, 1.4); continue; }
        c.globalAlpha = (p.type === 'steam' ? 0.55 : 0.45) * (1 - t) * Math.min(1, t * 6);
        c.fillStyle = G.rgbStr(...p.col); c.beginPath(); c.arc(p.x, p.y, Math.max(0.5, p.r), 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }
    drawDisasters(c, dt) {
      const g = this.g, T = g.tornado;
      if (T) {
        const [x, y] = this.iso(T.x, T.y);
        for (let k = 0; k < 22; k++) {
          const h = k * 7, w = 6 + k * k * 0.09 + k * 1.2, sw = Math.sin(this.time * 3 + k * 0.4) * k * 0.6;
          c.globalAlpha = 0.18 + 0.02 * (22 - k) * 0.4;
          c.fillStyle = k % 3 ? '#8d9196' : '#6f7378';
          c.beginPath(); c.ellipse(x + sw, y - h, w, w * 0.32, 0, 0, 7); c.fill();
        }
        c.globalAlpha = 1;
        if (Math.random() < dt * 20) this.puff(x + (Math.random() - 0.5) * 30, y, 'debris');
        this.shake = Math.max(this.shake, 2);
      }
      for (const m of g.meteors) {
        const [tx, ty] = this.iso(m.x, m.y);
        if (m.t < 2) {
          const k = 1 - m.t / 2, x = tx + 380 * k, y = ty - 700 * k;
          const gr = c.createLinearGradient(x, y, x + 90, y - 165);
          gr.addColorStop(0, 'rgba(255,230,160,0.95)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
          c.strokeStyle = gr; c.lineWidth = 9; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 90, y - 165); c.stroke();
          c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill();
        } else if (!m.boomed) {
          m.boomed = true; this.shake = 18;
          for (let i = 0; i < 40; i++) this.puff(tx, ty, 'debris');
          for (let i = 0; i < 30; i++) this.puff(tx, ty, 'spark');
          for (let i = 0; i < 20; i++) this.puff(tx + (Math.random() - 0.5) * 60, ty, 'fsmoke');
        }
      }
    }
    dia(c, x, y, w, h) {
      const [a, b] = this.iso(x, y), [p, q] = this.iso(x + w, y), [r, s] = this.iso(x + w, y + h), [t, u] = this.iso(x, y + h);
      c.beginPath(); c.moveTo(a, b); c.lineTo(p, q); c.lineTo(r, s); c.lineTo(t, u); c.closePath();
    }
    drawPreview(c) {
      const pv = this.preview, g = this.g;
      if (this.sel && g.buildings.has(this.sel.id)) {
        const b = this.sel; c.lineWidth = 2.5 / this.cam.z + 1;
        c.strokeStyle = `rgba(255,214,79,${0.6 + Math.sin(this.time * 5) * 0.35})`;
        this.dia(c, b.x, b.y, b.w, b.h); c.stroke();
        const d = G.BLD[b.type];
        if (d && d.service) this.coverage(c, b.x + b.w / 2, b.y + b.h / 2, d.service.r, '#ffd54f');
      }
      if (this.hover && !pv) { c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.8)'; this.dia(c, this.hover[0], this.hover[1], 1, 1); c.stroke(); }
      if (!pv) return;
      if (pv.kind === 'place') {
        const d = G.BLD[pv.type], spr = SP().bld({ type: pv.type, w: d.w, h: d.h, lvl: 1 });
        c.fillStyle = pv.ok ? 'rgba(80,220,120,0.45)' : 'rgba(255,80,80,0.5)'; this.dia(c, pv.x, pv.y, d.w, d.h); c.fill();
        if (d.service) this.coverage(c, pv.x + d.w / 2, pv.y + d.h / 2, d.service.r, pv.ok ? '#7CFC9A' : '#ff8080');
        const [wx, wy] = this.iso(pv.x, pv.y);
        c.globalAlpha = 0.78; c.drawImage(spr.c, wx - spr.ox, wy - spr.oy, spr.c.width / S, spr.c.height / S); c.globalAlpha = 1;
      } else if (pv.kind === 'move') {
        const b = pv.b, spr = SP().bld(b);
        c.fillStyle = 'rgba(255,214,79,0.25)'; this.dia(c, b.x, b.y, b.w, b.h); c.fill();
        c.fillStyle = pv.ok ? 'rgba(80,220,120,0.45)' : 'rgba(255,80,80,0.5)'; this.dia(c, pv.x, pv.y, b.w, b.h); c.fill();
        const [wx, wy] = this.iso(pv.x, pv.y);
        c.globalAlpha = 0.75; c.drawImage(spr.c, wx - spr.ox, wy - spr.oy, spr.c.width / S, spr.c.height / S); c.globalAlpha = 1;
      } else if (pv.tiles) {
        for (const [x, y, ok] of pv.tiles) {
          c.fillStyle = ok ? pv.col || 'rgba(80,220,120,0.45)' : 'rgba(255,80,80,0.45)';
          this.dia(c, x, y, 1, 1); c.fill();
        }
      }
    }
    coverage(c, cx, cy, r, col) {
      const [x, y] = this.iso(cx, cy);
      c.save(); c.beginPath(); c.ellipse(x, y, r * HW * 1.414, r * HH * 1.414, 0, 0, 7);
      c.fillStyle = G.alpha(col, 0.12); c.fill(); c.setLineDash([8, 6]); c.lineWidth = 2; c.strokeStyle = G.alpha(col, 0.9); c.stroke(); c.restore();
    }
    drawIcons(c) {
      const g = this.g, d = this.dpr, sc = G.clamp(0.55 + this.cam.z * 0.35, 0.6, 1.1);
      c.setTransform(d, 0, 0, d, 0, 0);
      this.iconHits = [];
      const sp = SP();
      for (const b of g.buildings.values()) {
        let ic = null, ring = null, blink = false;
        if (b.fire) { ic = '🔥'; ring = '#ff5722'; }
        else if (b.crimeT) { ic = '🚨'; ring = '#3b82f6'; }
        else if (b.bubble) { ic = b.bubble.k === 'coin' ? '💰' : '💬'; ring = b.bubble.k === 'coin' ? '#fbbf24' : '#22c55e'; }
        else if (b.zone && !b.ruin && b.construct <= 0 && !b.abandoned) {
          for (const r of G.needsFor(b.lvl)) if (!b[r]) { ic = G.RES_INFO[r].icon; blink = true; break; }
        } else if (b.abandoned) { ic = '🏚️'; blink = true; }
        else if (b.noFuel) { ic = '⚫'; ring = '#ef4444'; blink = true; }
        else if (!b.zone && !b.ruin && b.rc < 0 && G.BLD[b.type]) { ic = '🛣️'; blink = true; }
        if (!ic) continue;
        const spr = sp.bld(b), [wx, wy] = this.iso(b.x + b.w / 2, b.y + b.h / 2);
        const [sx, sy] = this.toScreen(wx, wy - Math.min(spr.top, 120) - 4);
        if (sx < -40 || sy < -40 || sx > this.cw + 40 || sy > this.ch + 40) continue;
        if (this.cam.z < 0.5 && blink) continue;
        const bob = Math.sin(this.time * 3 + b.id) * 2.5;
        c.globalAlpha = blink ? 0.55 + Math.sin(this.time * 4 + b.id) * 0.35 : 1;
        const im = sp.icon(ic, ring), w = 34 * sc, h = 42 * sc;
        c.drawImage(im, sx - w / 2, sy - h + bob, w, h);
        if (!blink) this.iconHits.push({ b, x: sx, y: sy - h / 2 + bob - 4 * sc, r: 18 * sc });
      }
      c.globalAlpha = 1;
    }
    drawFloats(c, dt) {
      const d = this.dpr; c.setTransform(d, 0, 0, d, 0, 0);
      c.font = '800 16px Rubik, Nunito, system-ui, sans-serif'; c.textAlign = 'center';
      this.floats = this.floats.filter(f => (f.life += dt) < 1.8);
      for (const f of this.floats) {
        const [sx, sy] = this.toScreen(f.x, f.y);
        const a = 1 - f.life / 1.8;
        c.globalAlpha = a; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.45)';
        c.strokeText(f.text, sx, sy - f.life * 40); c.fillStyle = f.col; c.fillText(f.text, sx, sy - f.life * 40);
      }
      c.globalAlpha = 1;
    }
    drawMinimap(mc) {
      const g = this.g, W = g.W, x = mc.getContext('2d'), s = mc.width / (W * 2);
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, mc.width, mc.height);
      x.setTransform(s, 0, 0, s, 0, 0);
      const ZC = { 1: '#4cc361', 2: '#3d8bfd', 3: '#f2b632' };
      for (let y = 0; y < W; y++) for (let xx = 0; xx < W; xx++) {
        const i = y * W + xx, b = g.bld[i] >= 0 ? g.buildings.get(g.bld[i]) : null;
        let col = g.terrain[i] === 1 ? '#3a9fd6' : g.terrain[i] === 2 ? '#e3d091' : g.res[i] === 1 ? '#b8b8b0' : g.res[i] === 2 ? '#3a3a3a' : g.tree[i] ? '#3f8a3a' : '#71bb4e';
        if (g.road[i]) col = '#4b4f57';
        else if (b) col = b.ruin ? '#555' : b.fire ? '#ff5722' : b.zone ? (b.construct > 0 ? '#c9a46b' : G.shade(ZC[b.zone], 0.8)) : '#eeeeee';
        else if (g.zone[i]) col = ZC[g.zone[i]];
        x.fillStyle = col; x.fillRect(xx - y + W - 1, (xx + y) / 2, 2, 1.2);
      }
      // рамка обзора
      const pts = [[0, 0], [this.cw, 0], [this.cw, this.ch], [0, this.ch]].map(([a, b]) => { const [wx, wy] = this.toWorld(a, b); return [wx / HW + W, wy / HH / 2]; });
      x.strokeStyle = '#fff'; x.lineWidth = 1.2 / s; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.stroke();
    }
  }
  G.Renderer = Renderer;
})(window.G);
