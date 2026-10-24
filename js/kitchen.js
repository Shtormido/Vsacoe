// Дневная фаза: закусочная 8:00–00:00
const CUSTOMER_TYPES = {
  traveler: { name: 'Проезжий',      patience: 55, tip: 0.05, attention: 0.15 },
  regular:  { name: 'Постоянный',    patience: 70, tip: 0.25, attention: 0.45 },
  referral: { name: 'По рекомендации', patience: 60, tip: 0.15, attention: 0.3 },
  rich:     { name: 'Богач',         patience: 50, tip: 0.4,  attention: 0.35 },
  ghost:    { name: '???',           patience: 20, tip: 0,    attention: 0 }
};
const TALK = {
  traveler: ['Долго ещё до города?', 'Пахнет у вас вкусно.', 'Я тут проездом, завтра уже дальше.', 'Мотель у вас свободен?'],
  regular:  ['Как обычно, шеф!', 'Слыхал, у вас постоялец пропал? Шучу.', 'Бургеры у тебя лучше, чем в городе.', 'Жена говорит, я тут живу.'],
  referral: ['Мне вас Хэнк посоветовал.', 'Говорят, у вас особенная шаурма.', 'Посмотрим, правда ли всё так хорошо.'],
  rich:     ['Я слышал о вашем фирменном блюде.', 'Деньги не проблема. Удивите меня.', 'Надеюсь, тут чисто.'],
  ghost:    ['…', 'Ты помнишь меня?', 'Номер семь. Ночью. Помнишь?', 'Холодно здесь…']
};

const Kitchen = {
  player: { x: 160, y: 60, dir: 'down', frame: 0, anim: 0 },
  tray: [],
  customers: [],
  stations: {},
  spawnT: 0,
  helperT: 0,
  eventT: [],
  bg: null,

  startDay() {
    this.bg = this.bg || buildDinerBG();
    this.player = { x: 160, y: 60, dir: 'down', frame: 0, anim: 0 };
    this.tray = []; this.customers = []; this.spawnT = 3; this.helperT = 6;
    const g = G.upgrades.grill, f = G.upgrades.fryer;
    this.stations = {
      grill:  { slots: Array(2 + g).fill(null), broken: G.equip.grill <= 0 },
      spit:   { slots: Array(1 + g).fill(null), broken: G.equip.spit <= 0 },
      fryer:  { slots: Array(2 + f).fill(null), broken: G.equip.fryer <= 0 },
      drinks: { slots: [], broken: G.equip.drinks <= 0 }
    };
    // случайные события дня
    this.eventT = [];
    if (G.cleanliness < 60 || chance(0.15)) this.eventT.push({ at: rint(10, 20) * 60, type: 'sanitary' });
    if (G.suspicion > 30 && chance(0.25 + G.suspicion / 200)) this.eventT.push({ at: rint(9, 22) * 60, type: 'sheriff' });
    if (G.rumors > 20 && chance(0.3)) this.eventT.push({ at: rint(11, 22) * 60, type: 'knower' });
    G.dayLog = { earned: 0, served: 0, angry: 0, special: 0 };
  },

  speedMul() { return 0.6 + G.stamina / 250; },
  cookMul(st) {
    const lvl = st === 'fryer' ? G.upgrades.fryer : G.upgrades.grill;
    const helper = hasStaff('helper') ? 0.85 : 1;
    return (1 + (100 - G.stamina) / 120) * (1 - lvl * 0.12) * helper;
  },
  errorChance() { return (100 - G.stamina) / 500 + G.stress / 400 + (G.conscience < 30 ? 0.05 : 0); },

  update(dt) {
    const p = this.player;
    // движение
    let dx = (Keys.right ? 1 : 0) - (Keys.left ? 1 : 0), dy = (Keys.down ? 1 : 0) - (Keys.up ? 1 : 0);
    if (dx || dy) {
      const l = Math.hypot(dx, dy), sp = 70 * this.speedMul();
      p.x = clamp(p.x + dx / l * sp * dt, DINER.bounds.x1, DINER.bounds.x2);
      p.y = clamp(p.y + dy / l * sp * dt, DINER.bounds.y1, DINER.bounds.y2);
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      p.anim += dt; if (p.anim > 0.15) { p.anim = 0; p.frame++; if (p.frame % 2) Sound.sfx('step', { surface: 'tile' }); }
    } else p.frame = 0;

    this.updateStations(dt);
    Particles.update(dt);
    this.updateCustomers(dt);
    this.updateHelper(dt);

    // спавн клиентов
    this.spawnT -= dt;
    if (this.spawnT <= 0 && G.time < CLOSE_TIME - 30) {
      const h = G.time / 60, peak = (h >= 12 && h < 14) || (h >= 18 && h < 20) ? 0.6 : 1;
      this.spawnT = (9 - G.rep / 20) * peak * rnd(0.7, 1.3);
      this.spawnCustomer();
    }

    // события
    this.eventT.forEach(ev => { if (!ev.done && G.time >= ev.at) { ev.done = true; Events[ev.type](); } });

    // взаимодействие
    const target = this.nearest();
    this.target = target;
    prompt(target ? target.hint : '');
    if (consumeAct() && target) target.fn();
  },

  // ---------- станции ----------
  updateStations(dt) {
    ['grill', 'spit', 'fryer'].forEach(id => {
      this.stations[id].slots.forEach((s, i, arr) => {
        if (!s) return;
        if (!s.done) { s.t += dt; if (s.t >= s.total) { s.done = true; s.over = 0; } }
        else if (!s.burnt) { s.over += dt; if (s.over > 10) { s.burnt = true; Sound.sfx('burnt'); toast(DISHES[s.dish].name + ' сгорел!', 'bad'); } }
      });
    });
  },
  freeSlot(id) { return this.stations[id].slots.findIndex(s => !s); },
  readySlot(id) { return this.stations[id].slots.findIndex(s => s && s.done); },

  canCook(dish, meat) {
    const d = DISHES[dish], need = Object.assign({}, d.need || {});
    if (d.meat) need[meat] = (need[meat] || 0) + (d.special || 1);
    return Object.entries(need).every(([k, v]) => G.stock[k] >= v) ? need : null;
  },
  startCook(stId, dish, meat, auto) {
    const i = this.freeSlot(stId);
    if (i < 0) return false;
    const need = this.canCook(dish, meat);
    if (!need) { if (!auto) toast('Не хватает продуктов!', 'bad'); return false; }
    Object.entries(need).forEach(([k, v]) => G.stock[k] -= v);
    const total = DISHES[dish].time * this.cookMul(stId) * (auto ? 1.2 : 1);
    const burnt = !auto && chance(this.errorChance());
    if (!auto) Sound.sfx('cook');
    this.stations[stId].slots[i] = { dish, meat: DISHES[dish].meat ? meat : null, t: 0, total, done: false, burnt: false, over: 0, preBurnt: burnt };
    G.equip[stId] = Math.max(0, G.equip[stId] - 0.5);
    if (G.equip[stId] <= 0) { this.stations[stId].broken = true; toast(DINER.stations.find(s => s.id === stId).label + ' сломался! Почините утром.', 'bad'); }
    if (meat === 'special' && hasStaff('helper')) staffWitness('helper', 1);
    if (burnt) toast('Руки дрожат… что-то пошло не так.', 'bad');
    return true;
  },
  takeFrom(stId) {
    const i = this.readySlot(stId);
    if (i < 0) return;
    if (this.tray.length >= trayMax()) { toast('Поднос полон', 'bad'); return; }
    const s = this.stations[stId].slots[i];
    this.stations[stId].slots[i] = null;
    this.tray.push({ dish: s.dish, meat: s.meat, burnt: s.burnt || s.preBurnt });
    Sound.sfx('pickup');
  },

  cookMenu(stId) {
    const dishes = stId === 'grill' ? ['burger'].concat(G.upgrades.signature ? ['signature'] : []) : stId === 'spit' ? ['shawarma'] : ['nuggets', 'fries'];
    const buttons = [];
    dishes.forEach(dish => {
      const d = DISHES[dish];
      if (dish === 'signature') {
        buttons.push({ t: `${d.icon} ${d.name} (особый ×2)`, dis: !this.canCook(dish, 'special'), fn: () => this.startCook(stId, dish, 'special') });
      } else if (d.meat) {
        Object.keys(MEATS).forEach(m => buttons.push({ t: `${d.icon} ${d.name}: ${MEATS[m].name} [${G.stock[m]}]`, dis: !this.canCook(dish, m), fn: () => this.startCook(stId, dish, m) }));
      } else buttons.push({ t: `${d.icon} ${d.name}`, dis: !this.canCook(dish), fn: () => this.startCook(stId, dish) });
    });
    buttons.push({ t: 'Отмена', cls: 'danger' });
    UI.choice(DINER.stations.find(s => s.id === stId).label, `<p class="muted">Свободно мест: ${this.stations[stId].slots.filter(s => !s).length}. Ты сам решаешь, из чего готовить и кому подать.</p>`, buttons, { closable: true });
  },
  drinksMenu() {
    if (this.tray.length >= trayMax()) { toast('Поднос полон', 'bad'); return; }
    UI.choice('Напитки', '<p class="muted">Самые обычные напитки.</p>',
      DRINKS.map(k => ({ t: DISHES[k].icon + ' ' + DISHES[k].name, fn: () => { this.tray.push({ dish: k }); Sound.sfx('pour'); G.equip.drinks = Math.max(0, G.equip.drinks - 0.2); } }))
        .concat([{ t: 'Отмена', cls: 'danger' }]), { closable: true });
  },
  fridgeInfo() {
    const s = G.stock;
    UI.choice('Холодильник', `<div class="stats">
      <div>🥩 Обычное мясо: <b>${s.meat}</b></div><div>🐾 Мясо животных: <b>${s.pet}</b></div>
      <div>🩸 Особый ресурс: <b>${s.special}</b></div><div>🍞 Булочки: <b>${s.buns}</b></div>
      <div>🥬 Овощи: <b>${s.veg}</b></div><div>🥫 Соусы: <b>${s.sauce}</b></div>
      <div>🍗 Курица: <b>${s.chicken}</b></div><div>🥔 Картофель: <b>${s.potato}</b></div></div>
      <p class="muted">Докупить продукты можно утром.</p>`, [{ t: 'Закрыть' }], { closable: true });
  },
  boardInfo() {
    const list = this.customers.filter(c => c.state === 'wait').map(c => {
      const t = CUSTOMER_TYPES[c.type];
      return `<div class="card"><h4>${c.name} — ${t.name}</h4>
        <div class="row">Заказ: ${c.order.map(o => (o.done ? '✅' : '') + DISHES[o.dish].icon + DISHES[o.dish].name).join(', ')}</div>
        <div class="row">Внимательность: ${'●'.repeat(Math.round(c.attention * 5))}${'○'.repeat(5 - Math.round(c.attention * 5))} · терпение ${Math.round(c.patience)}</div></div>`;
    }).join('') || '<p class="muted">Заказов нет.</p>';
    const helper = hasStaff('helper');
    const hm = helper ? `<h3>Повар-помощник (${helper.name})</h3><p class="muted">Из чего ему готовить мясные блюда:</p>
      <div class="btns">${Object.keys(MEATS).map(m => `<button class="b ${G.helperMeat === m ? 'primary' : ''}" data-a="hm" data-v="${m}">${MEATS[m].name}</button>`).join('')}</div>` : '';
    UI.open(`<h2>Доска заказов</h2><div class="cards">${list}</div>${hm}<div class="btns"><button class="b" data-a="x">Закрыть</button></div>`,
      { x: () => UI.close(), hm: v => { G.helperMeat = v; UI.close(); this.boardInfo(); } }, { closable: true });
  },

  // ---------- клиенты ----------
  spawnCustomer() {
    const free = DINER.seats.map((x, i) => i).filter(i => !this.customers.some(c => c.seat === i));
    if (!free.length) return;
    const seat = pick(free);
    let type = 'traveler';
    const r = Math.random();
    if (G.upgrades.signature && r < 0.08 + G.rep / 500) type = 'rich';
    else if (G.regulars.length && r < 0.35 + G.rep / 300) type = 'regular';
    else if (r < 0.5 && G.rep > 15) type = 'referral';
    if (G.conscience < 35 && chance(0.12)) type = 'ghost';
    let person, look;
    if (type === 'regular') { const reg = pick(G.regulars); person = { name: reg.name }; look = reg.look; }
    else { person = randomPerson(); look = randomLook(type); }
    const t = CUSTOMER_TYPES[type];
    const order = [];
    if (type === 'rich') order.push({ dish: 'signature' });
    else if (type !== 'ghost') {
      if (chance(0.85)) order.push({ dish: pick(MAINS) });
      if (chance(0.55) || !order.length) order.push({ dish: pick(SIDES) });
    }
    if (type !== 'ghost' && chance(0.75)) order.push({ dish: pick(DRINKS) });
    if (type === 'ghost') order.push({ dish: pick(MAINS) });
    Sound.sfx('doorbell');
    this.customers.push({
      id: uid(), type, name: person.name, look, seat, order, state: 'walk',
      x: DINER.door.x, y: DINER.door.y, path: [{ x: DINER.door.x, y: DINER.aisleY }, { x: DINER.seats[seat], y: DINER.aisleY }, { x: DINER.seats[seat], y: DINER.seatY }],
      patience: t.patience, maxPatience: t.patience, attention: clamp(t.attention + rnd(-0.1, 0.15) + G.rumors / 400, 0, 1),
      eatT: 0, frame: 0, anim: 0, pay: 0, quality: 0, bubble: null, bubbleT: 0, served: []
    });
  },

  updateCustomers(dt) {
    this.customers.forEach(c => {
      if (c.bubbleT > 0) c.bubbleT -= dt;
      if (c.state === 'walk' || c.state === 'leave') {
        const wp = c.path[0];
        const dx = wp.x - c.x, dy = wp.y - c.y, l = Math.hypot(dx, dy), sp = 50 * dt;
        if (l <= sp) {
          c.x = wp.x; c.y = wp.y; c.path.shift();
          if (!c.path.length) { if (c.state === 'walk') c.state = 'wait'; else c.gone = true; }
        } else {
          c.x += dx / l * sp; c.y += dy / l * sp;
          c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'up' : 'down');
          c.anim += dt; if (c.anim > 0.14) { c.anim = 0; c.frame++; }
        }
      } else if (c.state === 'wait') {
        c.dir = 'up'; c.frame = 0;
        c.patience -= dt * (G.time > 22 * 60 ? 1.3 : 1);
        if (c.type === 'ghost' && c.patience <= 0) { c.gone = true; toast('…клиент исчез. Был ли он вообще?', 'night'); G.stress = clamp(G.stress + 10, 0, 100); return; }
        if (c.patience <= 0) {
          this.leave(c); c.bubble = '😠'; c.bubbleT = 3;
          addRep(-1.5); G.dayLog.angry++; G.stats.angry++;
          toast(c.name + ' ушёл, не дождавшись заказа', 'bad'); Sound.sfx('angry');
        }
      } else if (c.state === 'eat') {
        c.eatT -= dt;
        if (c.eatT <= 0) this.finishCustomer(c);
      }
    });
    this.customers = this.customers.filter(c => !c.gone);
  },

  leave(c) {
    c.state = 'leave'; c.frame = 0;
    c.path = [{ x: c.x, y: DINER.aisleY }, { x: DINER.door.x, y: DINER.aisleY }, { x: DINER.door.x, y: DINER.door.y }];
  },

  serve(c) {
    if (c.type === 'ghost') {
      c.bubble = '👻'; c.bubbleT = 2; c.gone = true;
      toast('Ты протягиваешь тарелку… место пустое.', 'night'); addConscience(-1); G.stress = clamp(G.stress + 8, 0, 100);
      return;
    }
    let gave = 0;
    c.order.forEach(o => {
      if (o.done) return;
      const i = this.tray.findIndex(it => it.dish === o.dish);
      if (i < 0) return;
      const it = this.tray.splice(i, 1)[0];
      o.done = true; o.item = it; gave++; Sound.sfx('serve');
    });
    if (!gave) {
      c.bubble = '💬'; c.bubbleT = 3;
      UI.talk(c.look, c.name, pick(TALK[c.type]), null, c.patience / c.maxPatience < 0.3 ? 'angry' : c.type === 'regular' ? 'happy' : c.attention > 0.5 ? 'sus' : 'neutral');
      return;
    }
    if (c.order.every(o => o.done)) { c.state = 'eat'; c.eatT = 4; }
  },

  finishCustomer(c) {
    const t = CUSTOMER_TYPES[c.type];
    let sum = 0, q = 0, n = 0, suspicious = false;
    c.order.forEach(o => {
      const d = DISHES[o.dish], it = o.item;
      let quality = it.burnt ? 0.3 : 1;
      if (it.meat) quality *= MEATS[it.meat].quality;
      quality *= 1 + G.upgrades.recipes * 0.1;
      q += quality; n++;
      sum += d.price;
      if (it.meat === 'special') {
        G.stats.specialServed++; G.dayLog.special++;
        // клиент может что-то заподозрить
        const p = 0.04 + c.attention * 0.18 + G.rumors / 500 + (o.dish === 'signature' ? 0.03 : 0);
        if (chance(p)) suspicious = true;
      }
      if (it.meat === 'pet' && chance(c.attention * 0.05)) suspicious = 'pet';
    });
    q /= n;
    const tip = sum * t.tip * q * (G.cleanliness > 60 ? 1.1 : 0.9);
    const total = Math.round(sum * (q >= 1 ? 1 : 0.7) + tip);
    G.money += total; G.dayLog.earned += total; G.stats.earned += total;
    G.dayLog.served++; G.stats.served++;
    addRep((q - 0.8) * (c.type === 'regular' ? 1.2 : 0.7));
    c.bubble = q >= 1.4 ? '😍' : q >= 0.9 ? '🙂' : '🤢'; c.bubbleT = 3;
    if (suspicious) Sound.sfx('sus');
    if (suspicious === true) {
      c.bubble = '🤨';
      const lines = ['Странный вкус… что это за мясо?', 'Слишком вкусно для такой дыры. Подозрительно.', 'Мясо какое-то… сладковатое.'];
      toast(`${c.name}: «${pick(lines)}»`, 'bad');
      addRumors(c.type === 'regular' ? 6 : 4); addSuspicion(c.type === 'rich' ? 4 : 2);
      if (c.type === 'regular') { const r = G.regulars.find(r => r.name === c.name); if (r) r.doubt = (r.doubt || 0) + 1; }
    } else if (suspicious === 'pet') {
      toast(`${c.name}: «Это точно говядина?»`, 'bad'); addRumors(2);
    }
    if (q >= 1 && !suspicious && c.type !== 'regular' && chance(0.25) && G.regulars.length < 10) {
      G.regulars.push({ name: c.name, look: c.look });
      toast(c.name + ' стал постоянным клиентом!', 'good');
    }
    Particles.text(c.x, c.y - 40, '+$' + total, '#ffe070');
    Sound.sfx('cash');
    if (q >= 1.4) Particles.sparkle(c.x, c.y - 30);
    this.leave(c);
  },

  updateHelper(dt) {
    if (!hasStaff('helper')) return;
    this.helperT -= dt;
    if (this.helperT > 0) return;
    this.helperT = 5;
    // помощник готовит первое невыполненное блюдо из заказов, которого ещё нет в работе
    const pending = [];
    this.customers.filter(c => c.state === 'wait' && c.type !== 'ghost').forEach(c => c.order.forEach(o => { if (!o.done && DISHES[o.dish].station !== 'drinks') pending.push(o.dish); }));
    const inWork = [];
    ['grill', 'spit', 'fryer'].forEach(id => this.stations[id].slots.forEach(s => s && inWork.push(s.dish)));
    this.tray.forEach(t => inWork.push(t.dish));
    for (const dish of pending) {
      const k = inWork.indexOf(dish);
      if (k >= 0) { inWork.splice(k, 1); continue; }
      const st = DISHES[dish].station;
      if (this.stations[st].broken) continue;
      const meat = dish === 'signature' ? 'special' : G.helperMeat;
      if (this.startCook(st, dish, meat, true)) return;
    }
  },

  // ---------- взаимодействие ----------
  nearest() {
    const p = this.player, opts = [];
    if (p.y < 62) DINER.stations.forEach(st => {
      const cx = st.x + st.w / 2;
      if (Math.abs(p.x - cx) > st.w / 2 + 6) return;
      opts.push({ d: Math.abs(p.x - cx), ax: cx, ay: 2, ...this.stationAction(st) });
    });
    if (p.y > 70) this.customers.forEach(c => {
      if (c.state !== 'wait' && c.state !== 'eat') return;
      const d = Math.abs(p.x - c.x);
      if (d > 14) return;
      const t = CUSTOMER_TYPES[c.type];
      opts.push({ d, ax: c.x, ay: c.y - 44, hint: c.state === 'eat' ? `${c.name} ест…` : `E — обслужить: ${c.name} (${t.name})`, fn: () => c.state === 'wait' && this.serve(c) });
    });
    opts.sort((a, b) => a.d - b.d);
    return opts[0];
  },
  stationAction(st) {
    const s = this.stations[st.id];
    switch (st.id) {
      case 'fridge': return { hint: 'E — запасы', fn: () => this.fridgeInfo() };
      case 'trash': return { hint: 'E — выбросить поднос', fn: () => { if (this.tray.length) { this.tray = []; Sound.sfx('trash'); toast('Поднос очищен'); } } };
      case 'board': return { hint: 'E — заказы', fn: () => this.boardInfo() };
      case 'backdoor': return { hint: 'E — чёрный ход (закрыть пораньше)', fn: () => UI.choice('Закрыть закусочную?', '<p>Закончить смену раньше и пойти спать? Оставшиеся клиенты уйдут.</p>', [{ t: 'Закрыть', cls: 'primary', fn: () => Game.endDay() }, { t: 'Работать дальше' }], { closable: true }) };
      case 'drinks': return s.broken ? { hint: 'Автомат сломан', fn: () => {} } : { hint: 'E — налить напиток', fn: () => this.drinksMenu() };
      default:
        if (s.broken) return { hint: st.label + ' сломан', fn: () => {} };
        if (this.readySlot(st.id) >= 0) return { hint: 'E — забрать готовое', fn: () => this.takeFrom(st.id) };
        if (this.freeSlot(st.id) >= 0) return { hint: 'E — готовить: ' + st.label, fn: () => this.cookMenu(st.id) };
        return { hint: st.label + ': все места заняты', fn: () => {} };
    }
  },

  // ---------- отрисовка ----------
  draw(ctx, t) {
    ctx.drawImage(this.bg, 0, 0);
    drawDinerWindows(ctx, G.time, t);
    const sun = drawSunbeams(ctx, G.time);
    SUN_DX = clamp(Math.round(-sun.skew / 18), -5, 5);
    drawFans(ctx, t);
    drawJukebox(ctx, t);
    this.drawClock(ctx);
    DINER.stations.forEach(st => drawStation(ctx, st, this.stations[st.id] || { slots: [] }, t));
    this.drawCooking(ctx, t);

    // повар
    const p = this.player;
    drawChar(ctx, p.x, p.y, PLAYER_LOOK, p.dir, p.frame);
    if (this.tray.length) {
      const X = px(p.x), Y = px(p.y) - (p.dir === 'up' ? 30 : 22), w = this.tray.length * 13 + 4;   // поднос в руках, на уровне груди
      R(ctx, X - w / 2 - 1, Y + 7, w + 2, 3, '#5a5e68'); R(ctx, X - w / 2, Y + 7, w, 1, '#c8ccd6');
      this.tray.forEach((it, i) => drawItem(ctx, it.dish, X - w / 2 + 9 + i * 13, Y, it.meat, it.burnt));
    }

    // клиенты
    const seated = c => (c.state === 'wait' || c.state === 'eat') || (c.path && c.path.length === 1 && c.state === 'walk');
    this.customers.slice().sort((a, b) => a.y - b.y).forEach(c => {
      drawChar(ctx, c.x, c.y, c.look, c.dir || 'up', c.frame, { alpha: c.type === 'ghost' ? 0.4 + Math.sin(t * 6) * 0.15 : 1 });
    });
    drawStoolTops(ctx);
    this.customers.forEach(c => { if (!seated(c)) drawChar(ctx, c.x, c.y, c.look, c.dir || 'up', c.frame); });
    this.customers.forEach(c => this.drawBubble(ctx, c, t));

    // стрелка над целью взаимодействия
    if (this.target && this.target.ax != null && !UI.isOpen()) {
      const X = px(this.target.ax), Y = px(this.target.ay) + Math.round(Math.sin(t * 6) * 2);
      R(ctx, X - 4, Y, 9, 2, '#22141c'); R(ctx, X - 3, Y + 2, 7, 2, '#22141c'); R(ctx, X - 2, Y + 4, 5, 2, '#22141c'); R(ctx, X - 1, Y + 6, 3, 1, '#22141c');
      R(ctx, X - 3, Y, 7, 1, '#ffe070'); R(ctx, X - 2, Y + 2, 5, 1, '#ffd040'); R(ctx, X - 1, Y + 4, 3, 1, '#f0b020');
    }
    Particles.draw(ctx);

    // время суток и лампы
    const tint = dayTint(G.time);
    if (tint) {
      Light.begin(tint[0], tint[1]);
      if (G.time / 60 >= 19) {
        [130, 320, 510].forEach(X => Light.hole(X, 110, 80, 0.8));
        [80, 240, 400, 560].forEach(X => Light.hole(X, 236, 70, 0.75));
      }
      Light.end(ctx);
      if (G.time / 60 >= 19) [80, 240, 400, 560].forEach(X => glow(ctx, X, 236, 60, 'rgba(255,200,120,A)', 0.1));
    }
    if (G.stamina < 25) { const v = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.35, PW / 2, PH / 2, PH * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,0,10,.55)'); ctx.fillStyle = v; ctx.fillRect(0, 0, PW, PH); }
    if (G.conscience < 40 && Math.sin(t * 0.7) > 0.97) { ctx.fillStyle = 'rgba(140,0,0,.25)'; ctx.fillRect(0, 0, PW, PH); }
    Atmos.drawMotes(ctx, sun.a * 2.6);
    Atmos.vignette(ctx, 0.32);
    Atmos.grain(ctx, 0.05);
  },

  drawClock(ctx) {
    const X = 448, Y = 30;
    R(ctx, X - 10, Y - 10, 20, 20, '#3a2418'); R(ctx, X - 9, Y - 9, 18, 18, '#f8f4e8'); R(ctx, X - 9, Y - 9, 18, 1, '#ffffff');
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; R(ctx, X + Math.round(Math.sin(a) * 7), Y - Math.round(Math.cos(a) * 7), 1, 1, '#8a7a6a'); }
    const hand = (a, len, col) => { for (let k = 0; k <= len; k++) R(ctx, X + Math.round(Math.sin(a) * k), Y - Math.round(Math.cos(a) * k), 1, 1, col); };
    const m = G.time % 60, h = (G.time / 60) % 12;
    hand(m / 60 * Math.PI * 2, 7, '#3a3a44'); hand(h / 12 * Math.PI * 2, 4, '#c03030');
  },

  drawCooking(ctx, t) {
    const st = id => DINER.stations.find(s => s.id === id);
    ['grill', 'spit', 'fryer'].forEach(id => {
      const S0 = st(id), slots = this.stations[id].slots, n = slots.length;
      const X = S0.x * S, w = S0.w * S, cw = (w - 8) / n;
      slots.forEach((s, i) => {
        if (!s) return;
        const cx = X + 4 + i * cw + cw / 2;
        if (id === 'grill') drawPatty(ctx, cx - cw / 2 + 2, 50, cw - 4, s.done ? 1 : s.t / s.total, s.meat, s.burnt);
        const prog = s.done ? 1 : s.t / s.total;
        if (!s.done) drawBar(ctx, cx - 8, 40, 16, prog, '#6fbf5a');
        else if (!s.burnt) {
          drawBar(ctx, cx - 8, 40, 16, 1 - s.over / 10, s.over > 6 ? '#d6453d' : '#f0c030');
          const by = 31 + Math.round(Math.sin(t * 5 + i) * 1.5);
          R(ctx, cx - 9, by - 9, 18, 17, '#22141c'); R(ctx, cx - 8, by - 8, 16, 15, '#fbf8f0'); R(ctx, cx - 8, by + 5, 16, 2, '#d8d0c0');
          drawItem(ctx, s.dish, cx, by - 1, s.meat);
        }
        if (s.burnt) { if (Math.random() < 0.15) Particles.smoke(cx / S, 24); }
        else if (Math.random() < 0.06) Particles.steam(cx / S, 24);
      });
    });
  },

  drawBubble(ctx, c, t) {
    const X = px(c.x), top = px(c.y) - 44;
    if (c.state === 'wait' && c.type !== 'ghost') {
      const items = c.order.filter(o => !o.done);
      if (items.length) {
        const w = items.length * 14 + 4, y = top - 18;
        R(ctx, X - w / 2 - 1, y - 1, w + 2, 18, '#22141c'); R(ctx, X - w / 2, y, w, 16, '#fbf8f0'); R(ctx, X - w / 2, y + 14, w, 2, '#d8d0c0');
        R(ctx, X - 2, y + 16, 4, 2, '#fbf8f0'); R(ctx, X - 1, y + 18, 2, 1, '#22141c'); R(ctx, X - 3, y + 16, 1, 2, '#22141c'); R(ctx, X + 2, y + 16, 1, 2, '#22141c');
        items.forEach((o, i) => drawItem(ctx, o.dish, X - w / 2 + 9 + i * 14, y + 8));
        const pr = c.patience / c.maxPatience;
        drawBar(ctx, X - 10, y - 6, 20, pr, pr > 0.5 ? '#6fbf5a' : pr > 0.25 ? '#f0c030' : '#d6453d');
        if (c.type === 'rich') { R(ctx, X + w / 2 - 2, y - 4, 5, 5, '#22141c'); R(ctx, X + w / 2 - 1, y - 3, 3, 3, '#ffd23a'); }
        if (c.type === 'regular') { R(ctx, X + w / 2 - 3, y - 4, 2, 2, '#e05a6a'); R(ctx, X + w / 2, y - 4, 2, 2, '#e05a6a'); R(ctx, X + w / 2 - 3, y - 3, 5, 2, '#e05a6a'); R(ctx, X + w / 2 - 2, y - 1, 3, 1, '#e05a6a'); }
      }
    }
    if (c.state === 'eat') { if (Math.sin(t * 8 + c.id) > 0.6) R(ctx, X - 1, top + 2, 3, 2, '#f0d090'); }
    if (c.bubbleT > 0 && c.bubble) this.drawEmote(ctx, X, top - (c.state === 'wait' && c.order.some(o => !o.done) ? 28 : 4), c.bubble, t);
  },

  drawEmote(ctx, X, Y, kind, t) {
    const y = Y - 14 - Math.round(Math.abs(Math.sin(t * 4)) * 2);
    R(ctx, X - 8, y - 1, 16, 15, '#22141c'); R(ctx, X - 7, y, 14, 13, '#fbf8f0'); R(ctx, X - 1, y + 13, 3, 2, '#22141c');
    const r = (a, b, w, h, col) => R(ctx, X + a, y + b, w, h, col);
    switch (kind) {
      case '😍': r(-5, 3, 4, 3, '#e04a5a'); r(1, 3, 4, 3, '#e04a5a'); r(-4, 6, 8, 2, '#e04a5a'); r(-2, 8, 4, 2, '#e04a5a'); r(-4, 4, 1, 1, '#ffb0b8'); break;
      case '🙂': r(-3, 3, 2, 2, '#22141c'); r(2, 3, 2, 2, '#22141c'); r(-4, 7, 1, 1, '#22141c'); r(-3, 8, 7, 1, '#22141c'); r(4, 7, 1, 1, '#22141c'); break;
      case '🤢': r(-5, 2, 11, 9, '#7ac860'); r(-3, 4, 2, 1, '#22141c'); r(2, 4, 2, 1, '#22141c'); r(-2, 8, 5, 1, '#22141c'); break;
      case '😠': r(-5, 2, 2, 6, '#d83030'); r(-1, 2, 2, 6, '#d83030'); r(3, 2, 2, 6, '#d83030'); r(-5, 10, 2, 2, '#d83030'); r(-1, 10, 2, 2, '#d83030'); r(3, 10, 2, 2, '#d83030'); break;
      case '🤨': r(-2, 2, 5, 1, '#3a3a8a'); r(2, 3, 2, 3, '#3a3a8a'); r(0, 6, 2, 2, '#3a3a8a'); r(0, 10, 2, 2, '#3a3a8a'); break;
      case '👻': r(-4, 3, 8, 8, '#c8ccd8'); r(-2, 5, 1, 2, '#22141c'); r(1, 5, 1, 2, '#22141c'); break;
      default: [-4, 0, 4].forEach((a, i) => r(a - 1, 6, 2, 2, (Math.floor(t * 4) % 3) === i ? '#22141c' : '#8a7a7a'));
    }
  }
};

// Случайные дневные события
const Events = {
  sanitary() {
    const bad = G.cleanliness < 50;
    UI.choice('Санэпидемстанция!', `<p>В закусочную заходит инспектор с планшетом. ${bad ? '<span class="bad">Мотель в запущенном состоянии.</span>' : 'Вроде бы всё в порядке.'}</p>`, [
      { t: 'Показать кухню', fn: () => {
        if (bad || chance(0.15)) { G.money -= 80; addSuspicion(5); addRep(-3); toast('Штраф $80, инспектор что-то записал', 'bad'); }
        else { addRep(3); toast('Инспекция пройдена!', 'good'); }
      } },
      { t: 'Сунуть $60', dis: G.money < 60, fn: () => { G.money -= 60; if (chance(0.8)) toast('Инспектор «ничего не заметил»', 'good'); else { addSuspicion(8); toast('Инспектор оскорбился!', 'bad'); } } }
    ], { who: { look: INSPECTOR_LOOK, name: 'Инспектор Грэм', mood: G.cleanliness < 50 ? 'angry' : 'neutral' } });
  },
  sheriff() {
    const tails = G.tails.length, badJ = G.tails.filter(t => t.bad).length;
    UI.choice('Визит шерифа', `<p>Шериф Коулман заказывает кофе и как бы между делом спрашивает про постояльцев.</p>
      <p class="muted">Незакрытых «хвостов»: ${tails}. Подозрения: ${Math.round(G.suspicion)}.</p>`, [
      { t: 'Угостить за счёт заведения', fn: () => this.sheriffCheck(0) },
      { t: 'Показать журнал регистрации', fn: () => this.sheriffCheck(badJ ? 0.25 : -0.15) },
      { t: 'Подкуп $150', dis: G.money < 150, fn: () => { G.money -= 150; if (chance(0.6)) { addSuspicion(-10); toast('Шериф довольно хмыкнул', 'good'); } else { addSuspicion(15); toast('Шериф: «Ты меня за кого держишь?»', 'bad'); } } }
    ], { who: { look: SHERIFF_LOOK, name: 'Шериф Коулман', mood: 'sus' } });
  },
  sheriffCheck(mod) {
    const p = G.suspicion / 220 + G.tails.length * 0.05 + mod;
    if (G.suspicion > 85 && chance(p)) { Game.ending('prison', 'Шериф нашёл несостыковки в журнале. Наручники щёлкнули прямо у стойки.'); return; }
    if (chance(p)) { addSuspicion(8); toast('Шериф ушёл задумчивым…', 'bad'); }
    else { addSuspicion(-4); toast('Шериф доел и уехал', 'good'); }
  },
  knower() {
    UI.choice('Клиент, который слишком много знает', `<p>Тощий тип у стойки наклоняется: «Я видел, что ты таскал ночью из седьмого номера. Двести баксов — и я ничего не видел».</p>`, [
      { t: 'Заплатить $200', dis: G.money < 200, fn: () => { G.money -= 200; toast('Он ухмыльнулся и ушёл', 'night'); } },
      { t: 'Послать его', fn: () => { addRumors(10); addSuspicion(10); toast('Он пообещал «поговорить с кем надо»', 'bad'); } },
      { t: 'Пригласить в мотель «поговорить»', fn: () => { G.flags.knowerGuest = true; addConscience(-3); toast('Он заселится сегодня. Ночь покажет.', 'night'); } }
    ], { who: { look: KNOWER_LOOK, name: 'Тощий тип', mood: 'happy' } });
  }
};
