'use strict';
(function (G) {
  const KEY = 'gradostroi_region_v1', CITY = id => 'gradostroi_city_' + id;

  G.GOODS = {
    stone: { name: 'Камень', icon: '🪨', price: 8 },
    coal: { name: 'Уголь', icon: '⚫', price: 10 },
    wood: { name: 'Древесина', icon: '🪵', price: 6 },
  };
  G.SPECS = {
    river: { name: 'Речной край', icon: '🏞️', desc: 'Сбалансированная карта с рекой' },
    lakes: { name: 'Озёрный край', icon: '💧', desc: 'Озёра и немного всего' },
    mountains: { name: 'Горный край', icon: '⛰️', desc: 'Богатые залежи камня' },
    coalfield: { name: 'Угольный бассейн', icon: '⚫', desc: 'Много угля для ТЭС' },
    forest: { name: 'Лесной край', icon: '🌲', desc: 'Густые леса — древесина' },
    resort: { name: 'Курорт', icon: '🏖️', desc: 'Пляжи, отели и туристы' },
  };
  G.MAX_CITIES = 4;
  G.REGION_LEVEL = 3;

  // Регион хранит все города. Активный город симулируется полностью,
  // остальные «живут» по своей последней дневной сводке.
  const R = G.Region = {
    data: null,
    load() {
      try { this.data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { this.data = null; }
      if (!this.data) this.migrate();
      return this.data;
    },
    migrate() { // сохранение старой версии с одним городом
      try {
        const old = localStorage.getItem('gradostroi_save_v1'); if (!old) return;
        const o = JSON.parse(old);
        this.data = { sandbox: !!o.sandbox, cities: [], routes: [], active: 1, nextId: 2 };
        this.data.cities.push(this.record(1, o.name, o.mapKind || 'river', o.money));
        localStorage.setItem(CITY(1), old); localStorage.removeItem('gradostroi_save_v1');
        this.save();
      } catch (e) { this.data = null; }
    },
    record(id, name, spec, money) {
      return { id, name, spec, pop: 0, level: 1, money, net: 0, stock: { stone: 120, coal: 120, wood: 120 }, prod: {}, cons: {}, tourists: 0 };
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { } },
    exists() { return !!(this.load() && this.data.cities.length); },
    create(sandbox) {
      const old = this.load();
      if (old) for (const c of old.cities) try { localStorage.removeItem(CITY(c.id)); } catch (e) { }
      this.data = { sandbox: !!sandbox, cities: [], routes: [], active: null, nextId: 1 };
      this.save();
    },
    city(id) { return this.data && this.data.cities.find(c => c.id === id); },
    addCity(g) {
      const id = this.data.nextId++;
      g.cityId = id;
      this.data.cities.push(this.record(id, g.name, g.mapKind, g.money));
      this.data.active = id; this.sync(g); this.save();
    },
    sync(g) {
      const c = this.city(g.cityId); if (!c) return;
      Object.assign(c, {
        name: g.name, spec: g.mapKind, pop: g.stats.pop, level: g.level, money: g.money, net: g.lastNet || 0,
        stock: Object.assign({}, g.stock), prod: Object.assign({}, g.lastProd || {}), cons: Object.assign({}, g.lastCons || {}),
        tourists: g.tour ? g.tour.tourists : 0,
      });
    },
    saveCity(g) {
      if (!this.data || !g.cityId) return false;
      try { localStorage.setItem(CITY(g.cityId), g.serialize()); } catch (e) { return false; }
      this.sync(g); this.data.active = g.cityId; this.save(); return true;
    },
    loadCity(id) {
      const s = localStorage.getItem(CITY(id)); if (!s) return null;
      const g = new G.Game(); g.load(s); g.cityId = id;
      const c = this.city(id);
      if (c) { g.money = c.money; g.stock = Object.assign({ stone: 0, coal: 0, wood: 0 }, c.stock); }
      this.data.active = id; this.save();
      return g;
    },
    totalPop(g) {
      if (!this.data) return g.stats.pop;
      return this.data.cities.reduce((s, c) => s + (c.id === g.cityId ? g.stats.pop : c.pop), 0);
    },
    // Доступ к складу и казне: у активного города — сам объект игры
    acc(g, id) {
      if (id === g.cityId) return { stock: g.stock, pay: d => { if (!g.sandbox) g.money += d; } };
      const c = this.city(id);
      return { stock: c.stock, pay: d => { if (!this.data.sandbox) c.money += d; } };
    },
    addRoute(from, to, res, amt) {
      if (from === to) return false;
      this.data.routes.push({ from, to, res, amt, last: 0 }); this.save(); return true;
    },
    removeRoute(i) { this.data.routes.splice(i, 1); this.save(); },
    // Ежедневный тик региона (вызывается в конце дня активного города)
    tick(g) {
      if (!this.data) return 0;
      let delta = 0;
      this.data.routes = this.data.routes.filter(r => this.city(r.from) && this.city(r.to));
      for (const r of this.data.routes) {
        const A = this.acc(g, r.from), B = this.acc(g, r.to);
        const n = Math.max(0, Math.min(r.amt, Math.floor(A.stock[r.res] || 0)));
        r.last = n; if (!n) continue;
        const cost = n * G.GOODS[r.res].price;
        A.stock[r.res] -= n; B.stock[r.res] = (B.stock[r.res] || 0) + n;
        A.pay(cost); B.pay(-cost);
        if (r.from === g.cityId) delta += cost; if (r.to === g.cityId) delta -= cost;
      }
      for (const c of this.data.cities) {
        if (c.id === g.cityId) continue;
        if (!this.data.sandbox) c.money += c.net;
        for (const k in G.GOODS) c.stock[k] = Math.max(0, (c.stock[k] || 0) + (c.prod[k] || 0) - (c.cons[k] || 0));
      }
      return delta;
    },
  };
})(window.G);
