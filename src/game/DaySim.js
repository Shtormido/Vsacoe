import * as THREE from 'three';
import { BREEDS, STYLES } from '../data/breeds.js';
import { PET_NAMES, REGULARS, REGULAR_BY_ID, WALKIN_GREETS, WALKIN_PEOPLE, WALKIN_REACT } from '../data/clients.js';
import { SALONS } from '../data/salons.js';
import { computeMods, staffStats, staffXpForLevel, xpForLevel } from '../data/skills.js';
import { traitOf } from '../data/staff.js';
import { clamp, formatMoney, mulberry32, pick } from '../util/math.js';
import { addMail } from './State.js';

export const OPEN = 9 * 60;
export const CLOSE = 19 * 60;
export const LAST_ARRIVAL = 17 * 60 + 30;
export const RATE = { walk: 1.0, groom: 0.5 }; // игровых минут за секунду

const PRICES = { wash: 500, dry: 150, brush: 350, cut: 900, nails: 300, perfume: 200, bow: 150 };
const PAR = { wash: 70, brush: 45, cut: 100, nails: 25, perfume: 12, bow: 10 };
const BOW_COLORS = ['#ff4f81', '#8a6cf0', '#3fbf9f', '#ffc23d', '#4aa3df'];

export const fmtTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

/** Рабочий день: время, записи, клиенты в салоне, работа сотрудников, оплата. */
export class DaySim {
  constructor(game) {
    this.game = game;
    this.clients = [];
    this.jobs = [];
    this.uid = 0;
  }

  get s() {
    return this.game.state;
  }

  get today() {
    return this.s.today;
  }

  mods() {
    return computeMods(this.s);
  }

  capacity() {
    return SALONS[this.s.salon].capacity + this.s.staff.length * 2;
  }

  // ================================================================ утро
  /** Подготовка нового дня: доставки, выздоровление, расписание. */
  morning() {
    const s = this.s;
    if (s.today) return;
    const arrived = [];
    s.deliveries = s.deliveries.filter((d) => {
      if (d.day > s.day) return true;
      s.stock[d.item] = (s.stock[d.item] || 0) + d.qty;
      arrived.push(d);
      return false;
    });
    if (arrived.length) addMail(s, 'ЗооСнаб', 'Заказ доставлен', `Привезли: ${arrived.map((d) => `${d.name} ×${d.qty}`).join(', ')}.`);
    if (s.injury && s.injury.day < s.day) s.injury = null; // за ночь зажило
    for (const e of s.staff) {
      e.jobsToday = 0;
      if (e.injured && e.injuredDay < s.day) e.injured = false;
    }
    const appts = (s.bookings[s.day] || []).map((b) => ({ ...b, spawned: false }));
    if (s.day === 1 && !appts.length) {
      appts.push({ time: 9 * 60 + 30, spec: { regular: 'zina' }, source: 'booking' });
      appts.push({ time: 11 * 60, spec: { walkin: true, seed: 101 }, source: 'booking' });
    }
    delete s.bookings[s.day];
    appts.sort((a, b) => a.time - b.time);
    s.today = {
      open: false, closing: false, clock: 8 * 60 + 30, appts, walkins: 0,
      income: 0, tips: 0, stars: [], served: 0, declined: 0, missed: 0, supplies: 0, log: [],
    };
    this.generateRequests();
  }

  /** Заявки на завтра с сайта и от постоянных клиентов. */
  generateRequests() {
    const s = this.s;
    const tomorrow = s.day + 1;
    if (s.requests.some((r) => r.day === tomorrow)) return;
    const m = this.mods();
    const rng = mulberry32(tomorrow * 977 + 3);
    const site = s.site;
    let n = 2 + Math.floor(Math.max(0, s.rep - 2.5) * 1.3) + (m.bookings || 0) + (site.upgrades.includes('gallery') ? 1 : 0) + (site.upgrades.includes('seo') ? 1 : 0)
      + (s.adsDays > 0 ? 1 : 0);
    n = Math.round(n * clamp(2 - site.priceMul, 0.4, 1.3));
    n = clamp(n, 1, this.capacity());
    const specs = [];
    // кто уже записан на сегодня или завтра, повторно не просится
    const booked = new Set([...(s.today?.appts || []), ...(s.bookings[tomorrow] || [])].map((a) => a.spec.regular).filter(Boolean));
    for (const r of REGULARS) {
      const st = s.regulars[r.id];
      if (booked.has(r.id) || s.chapter < r.chapter || tomorrow - st.lastDay < r.interval) continue;
      if (specs.length < 2) specs.push({ regular: r.id });
    }
    while (specs.length < n) specs.push({ walkin: true, seed: Math.floor(rng() * 1e6) });
    const used = {};
    for (const spec of specs) {
      let t;
      for (let k = 0; k < 20; k++) {
        t = OPEN + Math.floor(rng() * 17) * 30;
        if ((used[t] || 0) < SALONS[s.salon].tables) break;
      }
      used[t] = (used[t] || 0) + 1;
      const info = this.buildClient(spec);
      s.requests.push({ id: `${tomorrow}_${this.uid++}_${Math.floor(rng() * 1e4)}`, day: tomorrow, time: t, spec,
        name: info.name, pet: `${info.pet.name}, ${BREEDS[info.pet.breed].name.toLowerCase()}`, person: info.person });
    }
    s.requests.sort((a, b) => a.time - b.time);
  }

  acceptRequest(id) {
    const s = this.s;
    const r = s.requests.find((x) => x.id === id);
    if (!r) return false;
    if ((s.bookings[r.day]?.length || 0) >= this.capacity()) return false;
    (s.bookings[r.day] ||= []).push({ time: r.time, spec: r.spec, source: 'booking', name: r.name, pet: r.pet });
    s.requests = s.requests.filter((x) => x.id !== id);
    return true;
  }

  declineRequest(id) {
    this.s.requests = this.s.requests.filter((x) => x.id !== id);
  }

  open() {
    this.today.open = true;
    this.today.clock = OPEN;
    this.game.audio.play('bell');
  }

  // ================================================================ клиенты
  buildClient(spec) {
    const s = this.s;
    if (spec.regular) {
      const r = REGULAR_BY_ID[spec.regular];
      const st = s.regulars[r.id];
      const tpl = r.orders[Math.min(st.visits, r.orders.length - 1)];
      return {
        regular: r, name: r.name, person: r.person, speaker: r.id, pet: { ...r.pet }, condition: r.condition, tpl,
        needs: r.needs, greet: r.greet[Math.min(st.visits, r.greet.length - 1)], tip: r.tip, react: r.react,
      };
    }
    const rng = mulberry32(spec.seed);
    const who = pick(WALKIN_PEOPLE, rng);
    const breed = pick(Object.keys(BREEDS), rng);
    const B = BREEDS[breed];
    const style = pick(B.styles, rng);
    const tpl = { wash: rng() < 0.9, brush: rng() < 0.8, style: rng() < 0.85 ? style : null, nails: rng() < 0.45, bow: rng() < 0.25, perfume: rng() < 0.25 };
    if (!tpl.wash && !tpl.brush && !tpl.style) tpl.wash = true;
    const petName = pick(PET_NAMES, rng);
    const greet = pick(WALKIN_GREETS, rng).replace('{pet}', petName).replace('{style}', tpl.style ? STYLES[tpl.style].name : 'просто помыться');
    return {
      name: pick(who.names, rng), person: who.person, speaker: 'walkin',
      pet: { name: petName, breed, palette: Math.floor(rng() * B.palettes.length), seed: spec.seed },
      condition: { dirt: 0.3 + rng() * 0.7 * B.dirt, mats: 0.2 + rng() * 0.8 * B.mats }, tpl, greet, tip: 0.08,
      react: { great: pick(WALKIN_REACT.great, rng), good: pick(WALKIN_REACT.good, rng), bad: pick(WALKIN_REACT.bad, rng) },
    };
  }

  makeOrder(info) {
    const t = info.tpl;
    const own = this.s.owned;
    const services = [];
    if (t.wash) services.push('wash');
    if (t.brush) services.push('brush');
    if (t.style) services.push('cut');
    if (t.nails && own.includes('nailclip')) services.push('nails');
    if (t.perfume && own.includes('perfume')) services.push('perfume');
    if (t.bow && own.includes('bows')) services.push('bow');
    const size = BREEDS[info.pet.breed].size;
    const par = (40 + services.reduce((a, k) => a + (PAR[k] || 0), 0)) * size;
    const c = SALONS[this.s.salon];
    const m = this.mods();
    const mult = size * c.prestige * (own.includes('neon') ? 1.08 : 1) * this.s.site.priceMul * (1 + (m.price || 0));
    const price = Math.round(services.flatMap((k) => (k === 'wash' ? ['wash', 'dry'] : [k])).reduce((a, k) => a + PRICES[k], 0) * mult / 10) * 10;
    return { services, style: t.style, needs: info.needs, par, price, bowColor: BOW_COLORS[(info.pet.seed || 1) % BOW_COLORS.length] };
  }

  patienceFor(info) {
    const m = this.mods();
    return 70 * (1 + (m.patience || 0)) * (this.s.owned.includes('sofa') ? 1.3 : 1) * (info.regular ? 1.4 : 1);
  }

  spawnClient(appt) {
    const g = this.game;
    const S = g.salon;
    const info = this.buildClient(appt.spec);
    const order = this.makeOrder(info);
    const npc = g.spawnNpc(info.person, S.doorIn.clone(), -Math.PI / 2);
    npc.appear = 0;
    const pet = g.spawnPet(info.pet.breed, { palette: info.pet.palette, seed: info.pet.seed });
    pet.name = info.pet.name;
    pet.setCondition({ ...info.condition, length: 1.0, nails: order.services.includes('nails') }, info.pet.seed);
    npc.setFollower(pet);
    const c = { id: ++this.uid, appt, info, order, npc, pet, status: 'arriving', patience: this.patienceFor(info), greeted: false, seat: null };
    c.maxPatience = c.patience;
    this.clients.push(c);
    g.audio.play('bell');
    if (g.ponchik) setTimeout(() => g.audio.play('bark'), 500);
    g.ui.toast(`Пришёл клиент: ${info.name} с питомцем ${info.pet.name}`, 'good');
    this.relayoutQueue();
    return c;
  }

  deskQueue() {
    return this.clients.filter((c) => c.status === 'arriving' || c.status === 'desk');
  }

  relayoutQueue() {
    const S = this.game.salon;
    this.deskQueue().forEach((c, i) => {
      const spot = S.queueSpot(i);
      if (c.queueIdx === i && c.status === 'desk') return;
      c.queueIdx = i;
      const via = c.status === 'arriving' && !c.enteredOnce ? [S.doorIn.clone().add(new THREE.Vector3(-0.7, 0, -0.35))] : [];
      c.enteredOnce = true;
      c.npc.walkTo([...via, spot]).then(() => {
        if (c.status === 'arriving') c.status = 'desk';
        c.npc.face(Math.PI / 2);
      });
    });
  }

  freeSeat() {
    const S = this.game.salon;
    return S.seats.find((st) => !this.clients.some((c) => c.seat === st));
  }

  sendToSofa(c) {
    const S = this.game.salon;
    c.status = 'sofa';
    c.patience = Math.max(c.patience, c.maxPatience * 0.8);
    const seat = this.freeSeat();
    c.seat = seat || null;
    c.npc.setFollower(null);
    const target = seat ? seat.pos.clone().setY(0).add(new THREE.Vector3(-0.45, 0, 0)) : S.queueSpot(3).add(new THREE.Vector3(0.6, 0, 0.6));
    c.npc.walkTo([target]).then(() => {
      if (seat && (c.status === 'sofa' || c.status === 'staff' || c.status === 'self')) c.npc.sit(seat.pos, seat.yaw);
    });
    // питомец ложится у ног хозяина
    c.pet.root.position.copy(target).add(new THREE.Vector3(-0.35, 0, 0.3));
    this.relayoutQueue();
  }

  leave(c, angry = false) {
    const g = this.game;
    const S = g.salon;
    c.status = angry ? 'angry' : 'done';
    c.seat = null;
    c.npc.stand();
    c.npc.setBadge(angry ? '😠' : null, angry ? '#ffd6d6' : '#fff');
    c.npc.setFollower(c.pet);
    this.relayoutQueue();
    c.npc.walkTo([S.doorIn.clone().add(new THREE.Vector3(-0.7, 0, -0.35)), S.doorIn]).then(() => {
      g.removeNpc(c.npc);
      g.removePet(c.pet);
      this.clients = this.clients.filter((x) => x !== c);
    });
  }

  // ================================================================ сотрудники
  freeStaff() {
    return this.s.staff.filter((e) => !e.injured && !this.jobs.some((j) => j.emp.id === e.id));
  }

  assignStaff(c, emp) {
    const g = this.game;
    const idx = this.s.staff.indexOf(emp) + 1;
    const table = g.salon.tables[idx];
    if (!table) return;
    const st = staffStats(emp);
    this.sendToSofa(c);
    c.status = 'staff';
    c.npc.setBadge('✂', '#e6f8f2');
    c.pet.root.position.copy(table.pos);
    c.pet.root.rotation.set(0, Math.PI / 2, 0);
    c.pet.anim.walk = 0;
    c.pet.snapshot();
    const fatigue = emp.jobsToday >= 2 + Math.floor(st.stamina / 3) ? 1.25 : 1;
    const duration = c.order.par * 0.55 * (1.55 - st.speed * 0.075) * fatigue;
    this.jobs.push({ c, emp, progress: 0, duration, fatigue, table });
    const npc = g.staffNpcs[emp.id];
    if (npc) npc.talking = true;
    g.audio.play('click');
  }

  _finishJob(job) {
    const { c, emp } = job;
    const s = this.s;
    const m = this.mods();
    const st = staffStats(emp);
    const rng = Math.random;
    let q = 0.32 + st.care * 0.055 + (rng() - 0.5) * 0.18;
    if (c.order.services.includes('cut')) q += st.style;
    if (c.info.pet.breed === 'cat') q += st.cats - 0.05;
    if (job.fatigue > 1) q -= 0.12;
    const notes = [];
    // расходники
    if (c.order.services.includes('wash')) {
      if (s.stock.shampoo > 0) s.stock.shampoo--;
      else {
        q -= 0.25;
        notes.push('не было шампуня');
      }
    }
    if (c.order.services.includes('bow')) {
      if (s.stock.bows > 0) s.stock.bows--;
      else q -= 0.08;
    }
    if (c.order.services.includes('perfume')) {
      if (s.stock.perfume > 0) s.stock.perfume--;
      else q -= 0.06;
    }
    // травмы
    const injuryChance = 0.12 * (1.1 - st.care / 12) * (1 + (m.staffInjury || 0)) * BREEDS[c.info.pet.breed].temper;
    if (rng() < injuryChance) {
      emp.injured = true;
      emp.injuredDay = s.day;
      q -= 0.15;
      notes.push(`${emp.name} получил(а) травму`);
      this.game.ui.toast(`${emp.name} поранились во время работы! Нужна аптечка (ПК → Персонал).`, 'bad');
      this.game.audio.play('fail');
    }
    q = clamp(q, 0.15, 1);
    c.pet.autoGroom(1, q, c.order.services.includes('cut') ? STYLES[c.order.style].targets : null,
      { wash: c.order.services.includes('wash'), brush: c.order.services.includes('brush'), cut: c.order.services.includes('cut') });
    for (const k in c.pet.nails) c.pet.setNailCut(k, true);
    emp.jobsToday++;
    // опыт
    const xp = Math.round((20 + 30 * q) * (1 + (m.staffXp || 0) + (traitOf(emp)?.fx.xp || 0)));
    emp.xp += xp;
    while (emp.xp >= staffXpForLevel(emp.level)) {
      emp.xp -= staffXpForLevel(emp.level);
      emp.level++;
      emp.points++;
      this.game.ui.toast(`${emp.name}: новый уровень ${emp.level}! Есть очко навыка.`, 'good');
    }
    const npc = this.game.staffNpcs[emp.id];
    if (npc) npc.talking = false;
    const res = this.settle(c, q, { emp, notes });
    this.game.ui.toast(`${emp.name} закончил(а): ${c.info.pet.name} — ${res.stars.toFixed(1)}★, +${formatMoney(res.pay + res.tip)}`, res.stars >= 3 ? 'good' : 'bad');
    c.pet.root.position.copy(c.npc.pos);
    this.leave(c);
  }

  /** Деньги, репутация, лояльность, опыт игрока. Возвращает итог визита. */
  settle(c, score, { emp = null, notes = [] } = {}) {
    const s = this.s;
    const m = this.mods();
    const order = c.order;
    let stars = score * 5 + (s.owned.includes('decor') || SALONS[s.salon].tier === 3 ? 0.2 : 0);
    stars = clamp(Math.round(stars * 2) / 2, 0.5, 5);
    const pay = Math.round(order.price * (0.35 + 0.65 * score) / 10) * 10;
    const reg = c.info.regular ? s.regulars[c.info.regular.id] : null;
    let tipRate = 0;
    if (stars >= 4) {
      tipRate = c.info.tip + (reg ? reg.loyalty * 0.02 : 0) + (s.owned.includes('coffee') ? 0.1 : 0)
        + (s.owned.includes('shampoo_premium') ? 0.1 : 0) + (m.tips || 0);
      if (emp) tipRate *= 0.7 + staffStats(emp).charm * 0.06 + staffStats(emp).tipMul;
    }
    const tip = Math.round(order.price * tipRate * score / 10) * 10;
    s.money += pay + tip;
    const T = s.today;
    T.income += pay;
    T.tips += tip;
    T.stars.push(stars);
    T.served++;
    T.log.push({ name: c.info.name, pet: c.info.pet.name, stars, pay, tip, by: emp ? emp.name : s.name });
    s.stats.served++;
    s.stats.earned += pay + tip;
    s.stats.best = Math.max(s.stats.best, stars);
    if (stars >= 5) s.stats.perfect++;
    const oldRep = s.rep;
    s.rep = clamp(s.rep + (stars - s.rep) * 0.12, 1, 5);
    let extra = null;
    if (reg) {
      reg.visits++;
      reg.lastDay = s.day;
      const before = reg.loyalty;
      if (stars >= 4) reg.loyalty = Math.min(5, reg.loyalty + 1 + (m.loyalty && stars >= 4.5 ? 1 : 0));
      else if (stars < 2.5) reg.loyalty = Math.max(0, reg.loyalty - 1);
      if (reg.loyalty > before) extra = `Лояльность «${c.info.name}» выросла! Новая запись в картотеке.`;
      if (c.info.regular.influencer) {
        if (stars >= 4.5) {
          s.rep = clamp(s.rep + 0.25, 1, 5);
          s.adsDays += 2;
          extra = 'Лиза выложила восторженный пост: +репутация и новые клиенты!';
        } else if (stars < 3.5) {
          s.rep = clamp(s.rep - 0.2, 1, 5);
          extra = 'Лиза написала прохладный отзыв. Репутация немного просела.';
        }
      }
    }
    const mood = stars >= 4 ? 'great' : stars >= 2.5 ? 'good' : 'bad';
    s.site.reviews.unshift({ day: s.day, name: c.info.name, stars, text: c.info.react[mood] });
    if (s.site.reviews.length > 20) s.site.reviews.length = 20;
    // опыт игрока — только за свою работу
    let levelUp = false;
    if (!emp) {
      s.xp += Math.round(30 + 50 * score);
      while (s.xp >= xpForLevel(s.level)) {
        s.xp -= xpForLevel(s.level);
        s.level++;
        s.points++;
        levelUp = true;
      }
    }
    return { stars, pay, tip, oldRep, newRep: s.rep, extra, mood, notes, levelUp };
  }

  // ================================================================ кадр
  update(dt, rate) {
    const T = this.today;
    if (!T || !T.open) return;
    const g = this.game;
    const mins = dt * rate;
    T.clock += mins;
    // приход по записи
    for (const a of T.appts) {
      if (a.spawned || T.closing || a.time > T.clock) continue;
      if (this.clients.length >= SALONS[this.s.salon].tables + 4) continue;
      a.spawned = true;
      this.spawnClient(a);
    }
    // случайные посетители
    const m = this.mods();
    const rate_h = 0.35 + Math.max(0, this.s.rep - 3) * 0.25 + (m.walkins || 0) + (this.s.adsDays > 0 ? 0.3 : 0);
    if (!T.closing && T.clock < LAST_ARRIVAL && T.walkins < 3 && this.clients.length < 4 && Math.random() < (rate_h / 60) * mins) {
      T.walkins++;
      const appt = { time: T.clock, spec: { walkin: true, seed: Math.floor(Math.random() * 1e6) }, source: 'walkin', spawned: true };
      T.appts.push(appt);
      this.spawnClient(appt);
    }
    // терпение
    for (const c of this.clients) {
      if (c.status !== 'desk' && c.status !== 'sofa') continue;
      c.patience -= mins;
      const k = c.patience / c.maxPatience;
      c.npc.setBadge(c.status === 'desk' ? (k < 0.3 ? '😤' : '❗') : k < 0.3 ? '😤' : '⌛', k < 0.3 ? '#ffe1c2' : '#ffffff');
      if (c.patience <= 0) {
        T.missed++;
        this.s.rep = clamp(this.s.rep - 0.08, 1, 5);
        if (c.info.regular) this.s.regulars[c.info.regular.id].declined++;
        g.ui.toast(`${c.info.name} не дождались и ушли. Репутация −`, 'bad');
        this.leave(c, true);
      }
    }
    // работа сотрудников
    for (const j of [...this.jobs]) {
      j.progress += mins / j.duration;
      if (Math.floor(j.progress * 20) !== j._step) {
        j._step = Math.floor(j.progress * 20);
        j.c.pet.autoGroom(Math.min(1, j.progress), 0.85, j.c.order.services.includes('cut') ? STYLES[j.c.order.style].targets : null,
          { wash: j.c.order.services.includes('wash'), brush: j.c.order.services.includes('brush'), cut: j.c.order.services.includes('cut') });
      }
      if (j.progress >= 1) {
        this.jobs = this.jobs.filter((x) => x !== j);
        this._finishJob(j);
      }
    }
    // закрытие
    if (!T.closing && T.clock >= CLOSE) {
      T.closing = true;
      for (const c of this.clients.filter((x) => x.status === 'desk' || x.status === 'sofa' || x.status === 'arriving')) {
        T.missed++;
        this.leave(c);
      }
      g.ui.toast('19:00 — салон закрывается. Доделайте работу и закройте день.', '');
    }
  }

  /** Все ли дела дня сделаны. */
  idle() {
    const T = this.today;
    const pending = T.appts.some((a) => !a.spawned);
    return !pending && !this.clients.some((c) => c.status !== 'done' && c.status !== 'angry') && !this.jobs.length;
  }

  clear() {
    for (const c of this.clients) {
      this.game.removeNpc(c.npc);
      this.game.removePet(c.pet);
    }
    this.clients = [];
    this.jobs = [];
  }
}
