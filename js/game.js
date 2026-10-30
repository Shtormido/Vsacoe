'use strict';
(function (G) {
  const STEP = 15;            // шаг симуляции, игровые минуты
  const DAY = 1440;
  const SAVE_KEY = 'gradostroi_save_v1';

  class Game extends G.Emitter {
    newGame(o) {
      const W = this.W = this.H = o.size || 64; const N = this.N = W * W;
      this.seed = o.seed || (Math.random() * 1e9) | 0;
      this.name = o.name || 'Новоград';
      this.sandbox = !!o.sandbox;
      this.mapKind = o.mapKind || 'river';
      const m = G.generateMap(W, W, this.seed, this.mapKind);
      this.terrain = m.terrain; this.tree = m.tree; this.tone = m.tone;
      this.road = new Uint8Array(N); this.zone = new Uint8Array(N);
      this.buildings = new Map(); this.nextId = 1;
      this.money = this.sandbox ? 999999999 : 20000;
      this.xp = 0; this.level = 1; this.t = 8 * 60;
      this.taxes = { 1: 9, 2: 9, 3: 9 };
      this.stats = { placed: {}, history: [] };
      this.qDone = G.QUESTS.map(() => false);
      this.disasters = true; this.festivalUntil = 0; this.maxPop = 0;
      this.init();
    }
    init() {
      const N = this.N;
      this.bld = new Int32Array(N).fill(-1);
      for (const b of this.buildings.values()) this.mark(b, b.id);
      this.gv = new Uint8Array(N);
      for (let i = 0; i < N; i++) this.gv[i] = Math.floor(G.hash(i % this.W, (i / this.W) | 0, 5) * 100);
      this.cov = {}; for (const k of ['police', 'fire', 'health', 'edu', 'park']) this.cov[k] = new Float32Array(N);
      this.lv = new Float32Array(N); this.pol = new Float32Array(N); this.crime = new Float32Array(N);
      this.lvB = new Float32Array(N); this.crimeA = new Float32Array(N);
      this.computeWaterDist();
      this.acc = 0; this.stepN = 0; this.speed = 1; this.tornado = null; this.meteors = [];
      this.util = { produced: {}, used: {}, demanded: {} };
      Object.assign(this.stats, { pop: 0, jobsC: 0, jobsI: 0, capC: 0, capI: 0, happy: 0.6, demand: { 1: 0.6, 2: 0.3, 3: 0.4 }, zoneTiles: {}, lvl2: 0, lvl3: 0, lvl4: 0, roads: 0 });
      this.workRatio = 0; this.globalHappy = 0;
      this.recalc(true);
    }
    idx(x, y) { return y * this.W + x; }
    inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
    get day() { return Math.floor(this.t / DAY) + 1; }
    get hour() { return (this.t % DAY) / 60; }
    get festival() { return this.t < this.festivalUntil; }
    get raining() { return this.t < (this.rainUntil || 0); }

    computeWaterDist() {
      const W = this.W, d = this.wd = new Float32Array(this.N).fill(99), q = [];
      for (let i = 0; i < this.N; i++) if (this.terrain[i] === 1) { d[i] = 0; q.push(i); }
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy; if (!this.inb(nx, ny)) continue;
          const j = ny * W + nx; if (d[j] > d[i] + 1) { d[j] = d[i] + 1; if (d[j] < 6) q.push(j); }
        }
      }
    }

    // ---------- Деньги и опыт ----------
    canPay(c) { return this.sandbox || this.money >= c; }
    pay(c) { if (!this.sandbox) this.money -= c; this.emit('money'); }
    unlocked(tool) { const t = G.TOOLS[tool]; return this.sandbox || !t || this.level >= (t.unlock || 1); }
    addXP(n) {
      if (this.level >= G.MAX_LEVEL) return;
      this.xp += n;
      while (this.level < G.MAX_LEVEL && this.xp >= G.xpFor(this.level)) {
        this.xp -= G.xpFor(this.level); this.level++;
        const unlocked = Object.keys(G.TOOLS).filter(k => G.TOOLS[k].unlock === this.level);
        const bonus = 500 * this.level; if (!this.sandbox) this.money += bonus;
        this.emit('levelup', this.level, unlocked, bonus);
      }
      this.emit('xp');
    }
    count(type, n) { this.stats.placed[type] = (this.stats.placed[type] || 0) + (n || 1); }

    // ---------- Постройка ----------
    mark(b, v) { for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.bld[this.idx(x, y)] = v; }
    getB(x, y) { if (!this.inb(x, y)) return null; const id = this.bld[this.idx(x, y)]; return id >= 0 ? this.buildings.get(id) : null; }
    addBuilding(o) {
      const b = Object.assign({ id: this.nextId++, lvl: 1, var: (Math.random() * 1000) | 0, occ: 0, construct: 0, unmet: 0, fire: 0, ruinT: 0 }, o);
      this.buildings.set(b.id, b); this.mark(b, b.id);
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.tree[this.idx(x, y)] = 0;
      this.dirty = true; return b;
    }
    removeBuilding(b) {
      this.mark(b, -1); this.buildings.delete(b.id); this.dirty = true; this.emit('removed', b);
    }
    canPlace(type, x, y) {
      const d = G.BLD[type];
      if (!this.unlocked(type)) return { ok: false, why: 'Откроется на ' + d.unlock + ' уровне' };
      let nearW = false;
      for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
        if (!this.inb(xx, yy)) return { ok: false, why: 'За пределами карты' };
        const i = this.idx(xx, yy);
        if (this.terrain[i] === 1) return { ok: false, why: 'Нельзя строить на воде' };
        if (this.road[i]) return { ok: false, why: 'Мешает дорога' };
        if (this.bld[i] >= 0) return { ok: false, why: 'Место занято' };
      }
      if (d.nearWater) {
        for (let yy = y - 1; yy <= y + d.h; yy++) for (let xx = x - 1; xx <= x + d.w; xx++)
          if (this.inb(xx, yy) && this.terrain[this.idx(xx, yy)] === 1) nearW = true;
        if (!nearW) return { ok: false, why: 'Нужно поставить у воды' };
      }
      if (!this.canPay(d.cost)) return { ok: false, why: 'Недостаточно денег' };
      return { ok: true };
    }
    place(type, x, y) {
      const r = this.canPlace(type, x, y);
      if (!r.ok) { this.emit('error', r.why); return false; }
      const d = G.BLD[type];
      for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) this.zone[this.idx(xx, yy)] = 0;
      const b = this.addBuilding({ type, x, y, w: d.w, h: d.h, construct: 0 });
      this.pay(d.cost); this.count(type); this.addXP(Math.max(3, Math.round(d.cost / 80)));
      this.recalc(true); this.emit('placed', b);
      return true;
    }
    canRelocate(b, x, y) {
      for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) {
        if (!this.inb(xx, yy)) return false;
        const i = this.idx(xx, yy);
        if (this.terrain[i] === 1 || this.road[i] || (this.bld[i] >= 0 && this.bld[i] !== b.id)) return false;
        if (b.zone && this.zone[i] && this.zone[i] !== b.zone) return false;
      }
      const d = G.BLD[b.type];
      if (d && d.nearWater) {
        let nw = false;
        for (let yy = y - 1; yy <= y + b.h; yy++) for (let xx = x - 1; xx <= x + b.w; xx++) if (this.inb(xx, yy) && this.terrain[this.idx(xx, yy)] === 1) nw = true;
        if (!nw) return false;
      }
      return true;
    }
    relocate(b, x, y) {
      if (!this.canRelocate(b, x, y)) { this.emit('error', 'Сюда переместить нельзя'); return false; }
      this.mark(b, -1); b.x = x; b.y = y; this.mark(b, b.id);
      for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) { const i = this.idx(xx, yy); this.tree[i] = 0; if (b.zone) this.zone[i] = b.zone; else this.zone[i] = 0; }
      this.recalc(true); this.emit('placed', b); return true;
    }
    linePath(x0, y0, x1, y1) {
      const pts = [];
      const sx = Math.sign(x1 - x0) || 1, sy = Math.sign(y1 - y0) || 1;
      if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
        for (let x = x0; ; x += sx) { pts.push([x, y0]); if (x === x1) break; }
        for (let y = y0; y !== y1;) { y += sy; pts.push([x1, y]); }
      } else {
        for (let y = y0; ; y += sy) { pts.push([x0, y]); if (y === y1) break; }
        for (let x = x0; x !== x1;) { x += sx; pts.push([x, y1]); }
      }
      return pts.filter(([x, y]) => this.inb(x, y));
    }
    roadCost(x, y) {
      const i = this.idx(x, y);
      if (this.road[i] || this.bld[i] >= 0) return -1;
      return this.terrain[i] === 1 ? 40 : 10;
    }
    buildRoads(pts) {
      let cost = 0, n = 0;
      for (const [x, y] of pts) { const c = this.roadCost(x, y); if (c > 0) cost += c; }
      if (!this.canPay(cost)) { this.emit('error', 'Недостаточно денег'); return; }
      for (const [x, y] of pts) {
        const c = this.roadCost(x, y); if (c < 0) continue;
        const i = this.idx(x, y); this.road[i] = 1; this.zone[i] = 0; this.tree[i] = 0; n++;
      }
      if (!n) return;
      this.pay(cost); this.count('road', n); this.addXP(Math.ceil(n / 3));
      this.recalc(true); this.emit('built-road', pts, n);
    }
    rectTiles(x0, y0, x1, y1) {
      const a = [], xa = Math.max(0, Math.min(x0, x1)), xb = Math.min(this.W - 1, Math.max(x0, x1));
      const ya = Math.max(0, Math.min(y0, y1)), yb = Math.min(this.H - 1, Math.max(y0, y1));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) a.push([x, y]);
      return a;
    }
    rectCost(tool, tiles) {
      let c = 0, n = 0; const seen = new Set();
      for (const [x, y] of tiles) {
        const i = this.idx(x, y);
        if (tool === 'zoneR' || tool === 'zoneC' || tool === 'zoneI') {
          const z = G.TOOLS[tool].zone;
          if (this.terrain[i] !== 1 && !this.road[i] && this.bld[i] < 0 && this.zone[i] !== z) { c += 5; n++; }
        } else if (tool === 'tree') {
          if (this.terrain[i] !== 1 && !this.road[i] && this.bld[i] < 0 && this.tree[i] < 3) { c += 15; n++; }
        } else if (tool === 'bulldoze') {
          const b = this.getB(x, y);
          if (b) { if (!seen.has(b.id)) { seen.add(b.id); c += 5 * b.w * b.h; n++; } }
          else if (this.road[i] || this.tree[i]) { c += 5; n++; }
        } else if (tool === 'dezone') { if (this.zone[i]) n++; }
      }
      return { cost: c, n };
    }
    applyRect(tool, tiles) {
      const { cost, n } = this.rectCost(tool, tiles);
      if (!n) return;
      if (!this.canPay(cost)) { this.emit('error', 'Недостаточно денег'); return; }
      const seen = new Set();
      for (const [x, y] of tiles) {
        const i = this.idx(x, y);
        if (G.TOOLS[tool].zone) {
          const z = G.TOOLS[tool].zone;
          if (this.terrain[i] !== 1 && !this.road[i] && this.bld[i] < 0) { this.zone[i] = z; this.tree[i] = 0; }
        } else if (tool === 'tree') {
          if (this.terrain[i] !== 1 && !this.road[i] && this.bld[i] < 0) this.tree[i] = Math.min(3, this.tree[i] + 1 + (Math.random() < 0.4 ? 1 : 0));
        } else if (tool === 'bulldoze') {
          const b = this.getB(x, y);
          if (b) { if (!seen.has(b.id)) { seen.add(b.id); this.removeBuilding(b); } }
          else if (this.road[i]) { this.road[i] = 0; }
          else if (this.tree[i]) this.tree[i] = 0;
        } else if (tool === 'dezone') {
          const b = this.getB(x, y); if (b && b.zone) this.removeBuilding(b);
          this.zone[i] = 0;
        }
      }
      this.pay(cost);
      if (G.TOOLS[tool].zone) this.addXP(Math.ceil(n / 4));
      this.count(tool, n);
      this.recalc(true); this.emit('rect', tool, tiles);
    }

    // ---------- Симуляция ----------
    update(dtReal) {
      if (!this.speed) return;
      const mins = dtReal * 12 * [0, 1, 2, 4][this.speed];
      const prevDay = this.day;
      this.t += mins; this.acc += mins;
      let guard = 0;
      while (this.acc >= STEP && guard++ < 8) { this.acc -= STEP; this.step(); }
      if (this.day !== prevDay) this.dayEnd(prevDay);
      this.updateDisasters(mins, dtReal);
    }
    recalc(full) {
      this.computeNetwork(); this.computeUtilities();
      if (full) this.computeFields();
      this.updateStats();
    }
    computeNetwork() {
      const W = this.W, N = this.N, comp = this.comp = new Int32Array(N).fill(-1);
      let nc = 0, roads = 0;
      for (let s = 0; s < N; s++) {
        if (!this.road[s]) continue; roads++;
        if (comp[s] >= 0) continue;
        const q = [s]; comp[s] = nc;
        for (let h = 0; h < q.length; h++) {
          const i = q[h], x = i % W, y = (i / W) | 0;
          if (x > 0 && this.road[i - 1] && comp[i - 1] < 0) { comp[i - 1] = nc; q.push(i - 1); }
          if (x < W - 1 && this.road[i + 1] && comp[i + 1] < 0) { comp[i + 1] = nc; q.push(i + 1); }
          if (y > 0 && this.road[i - W] && comp[i - W] < 0) { comp[i - W] = nc; q.push(i - W); }
          if (y < W - 1 && this.road[i + W] && comp[i + W] < 0) { comp[i + W] = nc; q.push(i + W); }
        }
        nc++;
      }
      this.nComp = nc; this.stats.roads = roads;
      for (const b of this.buildings.values()) b.rc = this.roadComp(b.x, b.y, b.w, b.h, b.zone ? 2 : 1);
    }
    roadComp(x, y, w, h, d) {
      let best = -1, bd = 99;
      for (let yy = y - d; yy < y + h + d; yy++) for (let xx = x - d; xx < x + w + d; xx++) {
        if (!this.inb(xx, yy)) continue; const i = this.idx(xx, yy);
        if (!this.road[i]) continue;
        const dd = Math.max(xx < x ? x - xx : xx >= x + w ? xx - x - w + 1 : 0, yy < y ? y - yy : yy >= y + h ? yy - y - h + 1 : 0);
        if (dd < bd) { bd = dd; best = this.comp[i]; }
      }
      return best;
    }
    computeUtilities() {
      const sup = {}, P = {}, U = {}, D = {};
      for (const r of G.RES) { sup[r] = new Float64Array(this.nComp + 1); P[r] = 0; U[r] = 0; D[r] = 0; }
      const cons = [];
      for (const b of this.buildings.values()) {
        if (b.ruin || b.construct > 0) continue;
        const d = G.BLD[b.type];
        if (d && d.provides && b.rc >= 0 && !b.fire) for (const r in d.provides) { sup[r][b.rc] += d.provides[r]; P[r] += d.provides[r]; }
        if (b.zone) cons.push(b);
      }
      cons.sort((a, b) => a.id - b.id);
      for (const b of cons) {
        const need = b.abandoned ? 0 : G.NEED[b.zone][b.lvl];
        const needed = G.needsFor(b.lvl);
        for (const r of G.RES) {
          if (needed.includes(r)) D[r] += need;
          if (b.rc >= 0 && sup[r][b.rc] >= need) { sup[r][b.rc] -= need; b[r] = true; if (needed.includes(r)) U[r] += need; }
          else b[r] = false;
        }
      }
      this.util = { produced: P, used: U, demanded: D };
    }
    computeFields() {
      const W = this.W, N = this.N, cov = this.cov;
      for (const k in cov) cov[k].fill(0);
      this.lvB.fill(0); this.pol.fill(0); this.crimeA.fill(0);
      let gh = 0;
      const area = (cx, cy, r, fn) => {
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(W - 1, Math.ceil(cy + r));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r) fn(y * W + x, d / r);
        }
      };
      for (const b of this.buildings.values()) {
        if (b.ruin || b.construct > 0) continue;
        const d = G.BLD[b.type], cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (d) {
          if (d.service && b.rc >= 0) { const a = cov[d.service.kind]; area(cx, cy, d.service.r, (i, t) => { const v = 1 - 0.55 * t; if (v > a[i]) a[i] = v; }); }
          if (d.lv) area(cx, cy, 9, (i, t) => { this.lvB[i] += d.lv * (1 - t); });
          if (d.lvMinus) area(cx, cy, 5, (i, t) => { this.lvB[i] -= d.lvMinus * (1 - t); });
          if (d.happy && b.rc >= 0) gh += d.happy;
          if (d.pollution) { const s = d.pollution; area(cx, cy, 2 + s * 0.7, (i, t) => { this.pol[i] += s * (1 - t) / 9; }); }
        } else if (b.zone === 3 && !b.abandoned) {
          const s = 1.5 + b.lvl * 1.6; area(cx, cy, 2 + s * 0.6, (i, t) => { this.pol[i] += s * (1 - t) / 9; });
        }
        if ((b.zone === 1 || b.zone === 2) && b.occ > 0) { const s = b.occ / 70; area(cx, cy, 4, (i, t) => { this.crimeA[i] += s * (1 - t); }); }
      }
      this.globalHappy = Math.min(0.15, gh);
      for (let i = 0; i < N; i++) {
        const tr = this.tree[i] ? 0.06 * this.tree[i] : 0;
        const p = this.pol[i] = G.clamp(this.pol[i] - tr - cov.park[i] * 0.15, 0, 1);
        const c = this.crime[i] = G.clamp(this.crimeA[i] * 0.7 - cov.police[i] * 1.1, 0, 1);
        const wb = this.wd[i] < 4 ? 0.14 * (1 - this.wd[i] / 4) : 0;
        this.lv[i] = G.clamp(0.24 + wb + cov.park[i] * 0.28 + cov.edu[i] * 0.08 + cov.health[i] * 0.08 + cov.police[i] * 0.05 + cov.fire[i] * 0.04 + this.lvB[i] + (this.tree[i] ? 0.04 : 0) - p * 0.7 - c * 0.3, 0, 1);
      }
    }
    happyOf(b) {
      const i = this.idx(b.x, b.y), c = this.cov;
      let h = 0.4 + c.police[i] * 0.08 + c.fire[i] * 0.06 + c.health[i] * 0.1 + c.edu[i] * 0.08 + c.park[i] * 0.16
        + (this.lv[i] - 0.4) * 0.25 - this.pol[i] * 0.45 - this.crime[i] * 0.3;
      for (const r of G.needsFor(b.lvl)) if (!b[r]) h -= 0.12;
      h -= (this.taxes[b.zone] - 9) * 0.015;
      h += this.globalHappy + (this.festival ? 0.12 : 0);
      if (b.crimeT) h -= 0.1; if (b.fire) h -= 0.2;
      return G.clamp(h, 0, 1);
    }
    canLevel(b) {
      const L = b.lvl + 1, z = b.zone, i = this.idx(b.x, b.y), lv = this.lv[i], c = this.cov, pop = this.stats.pop;
      if (L > G.ZONE[z].max) return false;
      if (!G.needsFor(L).every(r => b[r])) return false;
      if (z === 1) {
        if (L === 2) return lv >= 0.3 && b.happy >= 0.48;
        if (L === 3) return lv >= 0.48 && b.happy >= 0.55 && (c.edu[i] > 0 || c.health[i] > 0);
        return lv >= 0.66 && b.happy >= 0.62 && c.edu[i] > 0 && c.health[i] > 0 && pop >= 1500;
      }
      if (z === 2) return L === 2 ? lv >= 0.3 && pop >= 150 : lv >= 0.52 && pop >= 900;
      return L === 2 ? pop >= 120 : pop >= 600 && c.edu[i] > 0;
    }
    step() {
      this.stepN++;
      if (this.dirty) { this.recalc(false); this.dirty = false; }
      else { this.computeNetwork(); this.computeUtilities(); }
      if (this.stepN % 4 === 0) this.computeFields();
      if (!this.raining && Math.random() < 0.0035) { this.rainUntil = this.t + 150 + Math.random() * 300; this.emit('rain'); }
      this.growth();
      this.incidents();
      this.updateStats();
      this.checkQuests();
      this.emit('step');
    }
    growth() {
      const dem = this.stats.demand, W = this.W;
      let newCount = 0, maxNew = 3 + Math.floor(this.stats.pop / 250);
      const start = (Math.random() * this.N) | 0;
      for (let k = 0; k < this.N && newCount < maxNew; k++) {
        const i = (start + k) % this.N, z = this.zone[i];
        if (!z || this.bld[i] >= 0 || this.road[i] || Math.random() > 0.15) continue;
        if (dem[z] <= 0.02 || Math.random() > dem[z] * 0.7 + 0.05) continue;
        const x = i % W, y = (i / W) | 0;
        if (this.roadComp(x, y, 1, 1, 2) < 0) continue;
        this.addBuilding({ type: G.ZONE[z].key, zone: z, x, y, w: 1, h: 1, construct: 60 + Math.random() * 120 });
        newCount++;
      }
      for (const b of this.buildings.values()) {
        if (b.construct > 0) {
          b.construct -= STEP;
          if (b.construct <= 0) { b.construct = 0; this.dirty = true; this.emit('built', b); }
          continue;
        }
        if (b.ruin) {
          b.ruinT += STEP;
          if (b.ruinT > DAY * 3) this.removeBuilding(b);
          continue;
        }
        if (!b.zone) continue;
        const z = b.zone, met = G.needsFor(b.lvl).every(r => b[r]), cap = G.CAP[z][b.lvl];
        b.happy = this.happyOf(b);
        if (b.abandoned) {
          if (met && dem[z] > 0 && Math.random() < 0.05) { b.abandoned = false; b.unmet = 0; this.dirty = true; }
          continue;
        }
        const target = !met ? 0 : z === 1 ? cap * (0.55 + 0.45 * b.happy) : cap * (0.25 + 0.75 * this.workRatio) * (0.75 + 0.25 * b.happy);
        const diff = target - b.occ;
        b.occ = Math.max(0, Math.round(b.occ + G.clamp(diff, -Math.max(1, cap * 0.15), Math.max(1, cap * 0.12))));
        if (!met) {
          b.unmet += STEP;
          if (b.unmet > DAY * 2) { b.abandoned = true; b.occ = 0; this.dirty = true; this.emit('abandoned', b); }
        } else b.unmet = 0;
        if (met && Math.random() < 0.025 && dem[z] > -0.15 && this.canLevel(b)) {
          b.lvl++; b.var = (Math.random() * 1000) | 0; b.construct = 45; this.dirty = true;
          this.addXP(4 * b.lvl); this.emit('upgrade', b);
        }
      }
    }
    updateStats() {
      const s = this.stats;
      let pop = 0, jC = 0, jI = 0, capC = 0, capI = 0, hs = 0, l2 = 0, l3 = 0, l4 = 0;
      const zt = { 1: 0, 2: 0, 3: 0 };
      for (let i = 0; i < this.N; i++) if (this.zone[i]) zt[this.zone[i]]++;
      for (const b of this.buildings.values()) {
        if (!b.zone || b.ruin) continue;
        if (b.lvl >= 2) l2++; if (b.lvl >= 3) l3++; if (b.lvl >= 4) l4++;
        if (b.construct > 0 || b.abandoned) continue;
        const cap = G.CAP[b.zone][b.lvl];
        if (b.zone === 1) { pop += b.occ; hs += (b.happy !== undefined ? b.happy : 0.5) * b.occ; }
        else if (b.zone === 2) { jC += b.occ; capC += cap; }
        else { jI += b.occ; capI += cap; }
      }
      const workers = pop * 0.55, jobsCap = capC + capI;
      this.workRatio = jobsCap > 0 ? Math.min(1, workers / jobsCap) : 0;
      const hap = pop > 0 ? hs / pop : 0.6;
      const tx = z => (this.taxes[z] - 9) * 0.07;
      s.demand = {
        1: G.clamp((jobsCap + 24 - workers) / Math.max(30, workers * 0.5) + (hap - 0.5) * 0.4 - tx(1), -1, 1),
        2: G.clamp((pop * 0.2 + 6 - capC) / Math.max(12, pop * 0.12) - tx(2), -1, 1),
        3: G.clamp((pop * 0.26 + 10 - capI) / Math.max(12, pop * 0.12) - tx(3), -1, 1),
      };
      Object.assign(s, { pop, jobsC: jC, jobsI: jI, capC, capI, happy: hap, zoneTiles: zt, lvl2: l2, lvl3: l3, lvl4: l4 });
      if (pop > this.maxPop) { const d = pop - this.maxPop; this.maxPop = pop; this.addXP(Math.ceil(d * 0.5)); }
    }
    budget() {
      const s = this.stats, t = this.taxes;
      const inc = { 1: s.pop * t[1] * 0.075, 2: s.jobsC * t[2] * 0.09, 3: s.jobsI * t[3] * 0.09 };
      const exp = {}; let total = 0;
      for (const b of this.buildings.values()) {
        const d = G.BLD[b.type]; if (!d || b.ruin) continue;
        exp[b.type] = (exp[b.type] || 0) + d.upkeep; total += d.upkeep;
      }
      const roads = s.roads * 0.25; total += roads;
      const income = inc[1] + inc[2] + inc[3];
      return { inc, income, exp, roads, upkeep: total, net: income - total };
    }
    dayEnd(prevDay) {
      const b = this.budget();
      if (!this.sandbox) this.money += b.net;
      this.stats.history.push({ d: prevDay, pop: this.stats.pop, money: Math.round(this.money), happy: this.stats.happy });
      if (this.stats.history.length > 120) this.stats.history.shift();
      // случайные бедствия
      if (this.disasters && !this.sandbox) {
        if (this.level >= 5 && Math.random() < 0.035) this.startTornado();
        else if (this.level >= 7 && Math.random() < 0.025) this.dropMeteor();
      }
      this.emit('day', b);
      this.save();
    }

    // ---------- Происшествия ----------
    incidents() {
      const arr = [...this.buildings.values()];
      let bubbles = 0;
      for (const b of arr) if (b.bubble) bubbles++;
      for (const b of arr) {
        if (b.ruin || b.construct > 0) continue;
        const i = this.idx(b.x, b.y);
        if (b.fire) {
          b.fire += STEP;
          if ((this.cov.fire[i] > 0.3 && Math.random() < 0.12) || (this.raining && Math.random() < 0.08)) { b.fire = 0; this.emit('extinguished', b, true); continue; }
          if (Math.random() < 0.035) {
            const nb = this.getB(b.x + ((Math.random() * 3) | 0) - 1, b.y + ((Math.random() * 3) | 0) - 1);
            if (nb && !nb.fire && !nb.ruin && nb !== b && nb.construct <= 0) this.ignite(nb);
          }
          if (b.fire > 480) this.burnDown(b);
          continue;
        }
        if (this.disasters && b.zone && b.occ > 0 && Math.random() < 1.5e-5 * (1 - 0.85 * this.cov.fire[i]) * (1 + b.lvl * 0.3)) this.ignite(b);
        if (b.crimeT) {
          b.crimeT += STEP;
          if (this.cov.police[i] > 0.45 && Math.random() < 0.1) { b.crimeT = 0; this.emit('crime-solved', b, true); }
          else if (b.crimeT > DAY) { b.crimeT = 0; if (!this.sandbox) this.money -= 100; this.emit('crime-lost', b); }
        } else if ((b.zone === 1 || b.zone === 2) && b.occ > 0 && Math.random() < 3e-5 * this.crime[i] * (1 + b.lvl)) {
          b.crimeT = 1; this.emit('crime', b);
        }
        if (b.bubble) { b.bubble.t += STEP; if (b.bubble.t > DAY) b.bubble = null; }
      }
      if (bubbles < 4 && Math.random() < 0.09) {
        const cand = arr.filter(b => b.zone && b.occ > 0 && !b.fire && !b.crimeT && !b.bubble);
        if (cand.length) { const b = cand[(Math.random() * cand.length) | 0]; b.bubble = { k: Math.random() < 0.6 ? 'coin' : 'chat', t: 0 }; }
      }
    }
    ignite(b) { if (b.fire || b.ruin) return; b.fire = 1; this.emit('fire', b); }
    burnDown(b) {
      b.fire = 0; b.crimeT = 0; b.bubble = null;
      if (b.zone) { Object.assign(b, { ruin: true, ruinT: 0, occ: 0, lvl: 1, abandoned: false }); this.dirty = true; this.emit('burned', b); }
      else { this.removeBuilding(b); const r = this.addBuilding({ type: 'ruin', x: b.x, y: b.y, w: b.w, h: b.h, ruin: true }); this.emit('burned', r); }
    }
    extinguish(b) {
      const i = this.idx(b.x, b.y);
      const covered = this.cov.fire[i] > 0;
      const cost = covered ? 0 : 250;
      if (!this.canPay(cost)) { this.emit('error', 'Нужно $' + cost + ' на вызов пожарных'); return false; }
      this.pay(cost); b.fire = 0; this.addXP(10); this.emit('extinguished', b, false, cost); return true;
    }
    solveCrime(b) {
      const i = this.idx(b.x, b.y);
      if (this.cov.police[i] <= 0) { this.emit('error', 'Рядом нет полиции — постройте участок'); return false; }
      b.crimeT = 0; this.addXP(10); this.emit('crime-solved', b, false); return true;
    }
    collect(b) {
      const bb = b.bubble; if (!bb) return;
      b.bubble = null;
      if (bb.k === 'coin') { const v = Math.round(40 + this.stats.pop * 0.25 + Math.random() * 60); if (!this.sandbox) this.money += v; this.addXP(3); this.emit('coin', b, v); }
      else { this.addXP(6); this.emit('chat', b, G.CHAT[(Math.random() * G.CHAT.length) | 0]); }
    }
    festivalCost() { return Math.round(800 + this.stats.pop * 1.5); }
    holdFestival() {
      const c = this.festivalCost();
      if (this.festival) { this.emit('error', 'Праздник уже идёт!'); return; }
      if (!this.canPay(c)) { this.emit('error', 'Недостаточно денег'); return; }
      this.pay(c); this.festivalUntil = this.t + DAY * 2; this.addXP(30); this.emit('festival');
    }

    // ---------- Стихийные бедствия ----------
    startTornado() {
      const W = this.W, side = Math.random() < 0.5;
      const x = side ? 1 : Math.random() * W, y = side ? Math.random() * W : 1;
      const a = Math.atan2(W / 2 - y, W / 2 - x);
      this.tornado = { x, y, a, life: 420 + Math.random() * 200 };
      this.emit('disaster', 'tornado', this.tornado);
    }
    dropMeteor(x, y) {
      if (x === undefined) {
        const bs = [...this.buildings.values()].filter(b => b.zone);
        if (bs.length) { const b = bs[(Math.random() * bs.length) | 0]; x = b.x; y = b.y; }
        else { x = (Math.random() * this.W) | 0; y = (Math.random() * this.H) | 0; }
      }
      this.meteors.push({ x: x + 0.5, y: y + 0.5, t: 0 });
      this.emit('disaster', 'meteor', { x, y });
    }
    randomFire() {
      const bs = [...this.buildings.values()].filter(b => !b.ruin && !b.fire && b.construct <= 0);
      if (!bs.length) { this.emit('error', 'Нечему гореть'); return; }
      const b = bs[(Math.random() * bs.length) | 0]; this.ignite(b);
    }
    smash(x, y) {
      const b = this.getB(x, y);
      if (b && !b.ruin) { if (Math.random() < 0.5) this.burnDown(b); else this.ignite(b); }
      if (this.inb(x, y)) this.tree[this.idx(x, y)] = 0;
    }
    updateDisasters(mins, dt) {
      const T = this.tornado;
      if (T) {
        T.a += (Math.random() - 0.5) * 0.15 * mins / 10;
        T.x += Math.cos(T.a) * mins * 0.035; T.y += Math.sin(T.a) * mins * 0.035;
        T.life -= mins;
        const tx = Math.floor(T.x), ty = Math.floor(T.y);
        if (this.inb(tx, ty) && (tx !== T.lx || ty !== T.ly)) { T.lx = tx; T.ly = ty; this.smash(tx, ty); this.dirty = true; }
        if (T.life <= 0 || !this.inb(tx, ty)) { this.tornado = null; this.emit('tornado-end'); }
      }
      for (const m of this.meteors) {
        m.t += dt;
        if (m.t >= 2 && !m.hit) {
          m.hit = true;
          const cx = Math.floor(m.x), cy = Math.floor(m.y);
          for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
            if (!this.inb(x, y)) continue;
            const d = Math.hypot(x - cx, y - cy);
            if (d <= 1.5) { const b = this.getB(x, y); if (b && !b.ruin) this.burnDown(b); this.tree[this.idx(x, y)] = 0; if (d < 1) this.road[this.idx(x, y)] = 0; }
            else if (d <= 2.3 && Math.random() < 0.5) { const b = this.getB(x, y); if (b) this.ignite(b); }
          }
          this.dirty = true; this.emit('impact', m);
        }
      }
      this.meteors = this.meteors.filter(m => m.t < 3);
    }

    // ---------- Задания ----------
    activeQuests() { const a = []; for (let i = 0; i < G.QUESTS.length && a.length < 3; i++) if (!this.qDone[i]) a.push(i); return a; }
    checkQuests() {
      for (const i of this.activeQuests()) {
        const q = G.QUESTS[i], [c, m] = q.p(this);
        if (c >= m) { this.qDone[i] = true; if (!this.sandbox) this.money += q.m; this.addXP(q.xp); this.emit('quest', q); }
      }
    }

    // ---------- Сохранение ----------
    serialize() {
      const enc = a => Array.from(a).join('');
      const bs = [...this.buildings.values()].map(b => {
        const o = {}; for (const k of ['id', 'type', 'zone', 'x', 'y', 'w', 'h', 'lvl', 'var', 'occ', 'construct', 'ruin', 'ruinT', 'abandoned', 'unmet', 'fire', 'crimeT']) if (b[k]) o[k] = b[k];
        return o;
      });
      return JSON.stringify({
        v: 1, W: this.W, seed: this.seed, name: this.name, sandbox: this.sandbox, mapKind: this.mapKind,
        terrain: enc(this.terrain), tree: enc(this.tree), tone: enc(this.tone), road: enc(this.road), zone: enc(this.zone),
        buildings: bs, nextId: this.nextId, money: this.money, xp: this.xp, level: this.level, t: this.t, taxes: this.taxes,
        placed: this.stats.placed, history: this.stats.history, qDone: this.qDone, disasters: this.disasters, festivalUntil: this.festivalUntil, maxPop: this.maxPop,
      });
    }
    load(str) {
      const d = JSON.parse(str), W = d.W, N = W * W;
      const dec = s => { const a = new Uint8Array(N); for (let i = 0; i < N; i++) a[i] = s.charCodeAt(i) - 48; return a; };
      Object.assign(this, { W, H: W, N, seed: d.seed, name: d.name, sandbox: d.sandbox, mapKind: d.mapKind, nextId: d.nextId, money: d.money, xp: d.xp, level: d.level, t: d.t, taxes: d.taxes, disasters: d.disasters, festivalUntil: d.festivalUntil || 0, maxPop: d.maxPop || 0 });
      this.terrain = dec(d.terrain); this.tree = dec(d.tree); this.tone = dec(d.tone); this.road = dec(d.road); this.zone = dec(d.zone);
      this.buildings = new Map();
      for (const o of d.buildings) this.buildings.set(o.id, Object.assign({ lvl: 1, var: 0, occ: 0, construct: 0, unmet: 0, fire: 0, ruinT: 0 }, o));
      this.stats = { placed: d.placed || {}, history: d.history || [] };
      this.qDone = G.QUESTS.map((q, i) => !!(d.qDone && d.qDone[i]));
      this.init();
    }
    save() { try { localStorage.setItem(SAVE_KEY, this.serialize()); this.emit('saved'); return true; } catch (e) { return false; } }
    static hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
    static loadSaved() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return null; const g = new Game(); g.load(s); return g; } catch (e) { console.error(e); return null; } }
  }
  G.Game = Game;
})(window.G);
