// Утро: приведение бумаг в порядок, закупки, ремонт, подкуп, улучшения
const TAIL_INFO = {
  journal: { icon: '📒', name: 'Запись в журнале регистрации' },
  items:   { icon: '🧳', name: 'Вещи постояльца' },
  car:     { icon: '🚗', name: 'Машина на парковке' },
  blood:   { icon: '🩸', name: 'Следы в номере' }
};
const TAIL_ACTIONS = {
  journal: [
    { id: 'forge',  name: 'Подделать запись о раннем выезде', time: 30, need: { blanks: 1 }, p: () => 0.55 + G.forgery * 0.08, skill: true },
    { id: 'erase',  name: 'Оформить, будто не заселялся',     time: 45, need: { blanks: 2 }, p: () => 0.45 + G.forgery * 0.1, skill: true },
    { id: 'bribe',  name: 'Регистратор «потеряет» страницу',  time: 10, money: 120, p: () => 0.9 },
    { id: 'legend', name: 'Легенда: «сбежал без оплаты»',      time: 20, p: () => 0.8, after: () => { addRumors(3); addSuspicion(1); } }
  ],
  items: [
    { id: 'hide',  name: 'Спрятать',                 time: 20, p: () => 0.7 },
    { id: 'burn',  name: 'Сжечь',                    time: 40, p: () => 0.95, after: () => addClean(-3) },
    { id: 'plant', name: 'Подбросить в чужой номер', time: 15, p: () => 0.6, failRemoves: true },
    { id: 'haul',  name: 'Вывезти за город',         time: 70, p: () => 1, stamina: 8 }
  ],
  car: [
    { id: 'move',  name: 'Перегнать подальше',          time: 40, p: () => 0.75 },
    { id: 'steal', name: '«Угнать» от имени владельца', time: 30, p: () => 0.6, gain: 80 },
    { id: 'parts', name: 'Разобрать на запчасти',       time: 90, p: () => 0.85, gain: 150, stamina: 10 }
  ],
  blood: [
    { id: 'clean', name: 'Отмыть номер', time: 45, p: () => 0.9, need: {}, after: () => addClean(12), stamina: 6 }
  ]
};

const Morning = {
  tab: 'overview', report: [], haste: false,

  start(fromTime) {
    G.phase = 'morning';
    G.time = fromTime;
    G.day++;
    this.tab = 'overview'; this.haste = false;
    this.report = [];
    this.overnight();
    save();
    if (G.phase !== 'morning') return; // концовка
    this.render();
  },

  // события между ночью и утром
  overnight() {
    const rep = this.report;
    // слухи превращаются в подозрения
    addSuspicion(G.rumors * 0.06 - (G.tails.length ? 0 : 2));
    addRumors(-3);
    // постояльцы
    const leaving = [];
    G.guests.forEach(g => {
      g.nights--;
      if (g.trait === 'journalist') { addRumors(3); rep.push(`📰 ${g.name} расспрашивал местных о мотеле.`); }
      const limit = 70 + G.upgrades.soundproof * 10 - (g.trait === 'attentive' ? 20 : 0);
      if (g.alarm > limit) { leaving.push(g); addSuspicion(4); addRumors(3); rep.push(`🚪 ${g.name} (№${g.room + 1}) в спешке выехал раньше срока. Тревога в городе растёт.`); }
      else if (g.nights <= 0) { leaving.push(g); rep.push(`👋 ${g.name} выехал из №${g.room + 1}.`); }
      g.alarm = Math.max(0, g.alarm - 10);
    });
    G.guests = G.guests.filter(g => !leaving.includes(g));
    const arrive = clamp(rint(1, 3) - (G.rumors > 50 ? 1 : 0), 0, 6 - G.guests.length);
    for (let i = 0; i < arrive; i++) { const g = makeGuest(); if (g) { G.guests.push(g); rep.push(`🛎 Заселился ${g.name} в №${g.room + 1}.`); } }
    // персонал
    Staff.morning(rep);
    if (G.phase === 'ending') return;
    // проверки концовок
    if (G.suspicion >= 100) { Game.ending('prison', 'Подозрения города достигли предела. На рассвете к мотелю подъехали три патрульные машины.'); return; }
    if (G.conscience <= 0) { Game.ending('conscience', 'Ты больше не можешь смотреть в глаза постояльцам. И себе.'); return; }
  },

  spend(min) {
    G.time += min;
    if (G.time >= OPEN_TIME) { G.time = OPEN_TIME; }
  },
  timeLeft() { return OPEN_TIME - G.time; },

  render() {
    const tabs = [['overview', 'Обзор'], ['tails', `Бумаги и следы (${G.tails.length})`], ['shop', 'Закупки'], ['repair', 'Ремонт и улучшения'], ['staff', `Персонал (${G.staff.length})`]];
    let body = '';
    if (this.tab === 'overview') body = this.overviewHTML();
    if (this.tab === 'tails') body = this.tailsHTML();
    if (this.tab === 'shop') body = this.shopHTML();
    if (this.tab === 'repair') body = this.repairHTML();
    if (this.tab === 'staff') body = Staff.tabHTML();
    const html = `<h2>Утро · День ${G.day} · ${fmtTime(G.time)} <span class="muted">(до открытия ${this.timeLeft()} мин)</span></h2>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="b ${this.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${n}</button>`).join('')}</div>
      ${body}
      <div class="btns" style="margin-top:14px"><button class="b primary" data-a="open">☀ Открыть закусочную (08:00)</button></div>`;
    const h = Object.assign({
      tab: v => { this.tab = v; this.render(); },
      open: () => this.openDiner()
    }, this.handlers(), Staff.handlers());
    if (UI.isOpen()) UI.refresh(html, h); else UI.open(html, h);
    updateHUD();
  },

  openDiner() {
    if (G.tails.length) {
      UI.choice('Остались хвосты', `<p class="bad">Незакрытых следов: ${G.tails.length}. Каждый поднимет подозрения и снизит чистоту.</p>`, [
        { t: 'Всё равно открыться', cls: 'danger', fn: () => Game.startDay() },
        { t: 'Вернуться', fn: () => this.render() }
      ]);
    } else { UI.close(); Game.startDay(); }
  },

  overviewHTML() {
    const legendReady = G.rep >= 90 && G.suspicion < 40 && G.day >= 7;
    return `${statsHTML()}
      <h3>Ночной отчёт</h3>${this.report.length ? this.report.map(r => `<p>${r}</p>`).join('') : '<p class="muted">Ночь прошла тихо.</p>'}
      <h3>Постояльцы (${G.guests.length}/6)</h3>
      <p class="muted">${G.guests.map(g => `№${g.room + 1} ${g.name}${g.revealed && g.trait ? ' — ' + TRAITS[g.trait].name : ''}`).join(' · ') || 'никого'}</p>
      <h3>Нужные люди</h3>
      <div class="btns">
        <button class="b" data-a="act" data-v="deputy" ${G.money < 180 ? 'disabled' : ''}>Подкупить помощника шерифа ($180): −12 подозрений</button>
        <button class="b" data-a="act" data-v="bar" ${G.money < 60 || this.timeLeft() < 30 ? 'disabled' : ''}>Опровергнуть слухи в баре ($60, 30 мин): −10 слухов</button>
        <button class="b" data-a="act" data-v="nap" ${this.timeLeft() < 40 ? 'disabled' : ''}>Вздремнуть (40 мин): +12 выносливости</button>
        <button class="b" data-a="act" data-v="tidy" ${this.timeLeft() < 30 ? 'disabled' : ''}>Прибраться в мотеле (30 мин): +8 чистоты</button>
      </div>
      <h3>Решения</h3>
      <div class="btns">
        ${legendReady ? '<button class="b primary" data-a="end" data-v="legend">Уйти на покой легендой</button>' : ''}
        <button class="b" data-a="end" data-v="flee" ${G.money < 3000 ? 'disabled' : ''}>Продать всё и скрыться ($3000)</button>
        <button class="b" data-a="end" data-v="conscience" ${G.conscience > 60 || !G.stats.kills ? 'disabled' : ''}>Закрыть мотель и вернуться к обычной еде</button>
      </div>`;
  },

  tailsHTML() {
    if (!G.tails.length) return '<p class="good">Бумаги в порядке. Никаких следов.</p>';
    const hasHauler = hasStaff('hauler');
    return `<p class="muted">Навык подделки: ${G.forgery.toFixed(1)} · Бланков: ${G.stock.blanks}. Каждое действие стоит времени, денег или риска.</p>
      <label><input type="checkbox" data-a="haste" ${this.haste ? 'checked' : ''}> Торопиться (вдвое быстрее, но −20% к успеху)</label>
      <div class="cards" style="margin-top:8px">${G.tails.map(t => {
        const info = TAIL_INFO[t.type];
        const acts = TAIL_ACTIONS[t.type].map(a => {
          const time = Math.ceil(a.time * (this.haste ? 0.5 : 1));
          const p = Math.round(clamp(a.p() - (this.haste ? 0.2 : 0) - (G.stamina < 30 ? 0.1 : 0), 0.05, 1) * 100);
          const ok = this.canDo(a, time);
          return `<button class="b" data-a="tail" data-v="${t.id}:${a.id}" ${ok ? '' : 'disabled'}>${a.name} · ${time}м${a.money ? ' · $' + a.money : ''}${a.need && a.need.blanks ? ' · бланк×' + a.need.blanks : ''} · ${p}%</button>`;
        }).join('');
        const haul = hasHauler && (t.type === 'items' || t.type === 'car') ? `<button class="b primary" data-a="hauler" data-v="${t.id}" ${G.money < 40 ? 'disabled' : ''}>Отдать человеку «на вывоз» ($40)</button>` : '';
        return `<div class="card"><h4>${info.icon} ${info.name}</h4><div class="row">${t.guest}${t.bad ? ' · <span class="bad">несостыковка в журнале!</span>' : ''}</div><div class="btns">${acts}${haul}</div></div>`;
      }).join('')}</div>`;
  },

  canDo(a, time) {
    if (this.timeLeft() < time) return false;
    if (a.money && G.money < a.money) return false;
    if (a.need) for (const k in a.need) if (G.stock[k] < a.need[k]) return false;
    return true;
  },

  doTail(tid, aid) {
    const t = G.tails.find(x => x.id == tid);
    const a = TAIL_ACTIONS[t.type].find(x => x.id === aid);
    const time = Math.ceil(a.time * (this.haste ? 0.5 : 1));
    if (!this.canDo(a, time)) return;
    this.spend(time);
    if (a.money) G.money -= a.money;
    if (a.need) for (const k in a.need) G.stock[k] -= a.need[k];
    if (a.stamina) G.stamina = clamp(G.stamina - a.stamina, 0, 100);
    if (a.skill) G.forgery = Math.min(5, G.forgery + 0.5);
    const p = clamp(a.p() - (this.haste ? 0.2 : 0) - (G.stamina < 30 ? 0.1 : 0), 0.05, 1);
    if (chance(p)) {
      G.tails = G.tails.filter(x => x !== t);
      if (a.gain) G.money += a.gain;
      if (a.after) a.after();
      toast('Сделано: ' + a.name.toLowerCase(), 'good');
    } else {
      if (t.type === 'journal') { t.bad = true; addSuspicion(3); toast('Подделка вышла кривой. В журнале несостыковка.', 'bad'); }
      else if (a.failRemoves) { G.tails = G.tails.filter(x => x !== t); addRumors(6); addSuspicion(5); toast('Вещи нашли — по мотелю пошли разговоры.', 'bad'); }
      else { addSuspicion(4); toast('Не вышло. Кто-то мог видеть.', 'bad'); }
    }
    this.render();
  },

  shopHTML() {
    return `<p class="muted">Деньги: $${Math.floor(G.money)}. Поставщик приезжает быстро — закупка 5 минут.</p>
      <div class="cards">${SHOP.map(s => `<div class="card"><h4>${s.name}</h4><div class="row">В запасе: ${G.stock[s.id]} · $${s.price}/шт</div>
        <div class="btns"><button class="b" data-a="buy" data-v="${s.id}:1" ${G.money < s.price * s.pack ? 'disabled' : ''}>+${s.pack} ($${s.price * s.pack})</button>
        <button class="b" data-a="buy" data-v="${s.id}:3" ${G.money < s.price * s.pack * 3 ? 'disabled' : ''}>+${s.pack * 3} ($${s.price * s.pack * 3})</button></div></div>`).join('')}
      </div><p class="muted">Мясо животных — легальная альтернатива особому ресурсу: дороже и менее прибыльно.</p>`;
  },

  repairHTML() {
    const names = { grill: 'Гриль', spit: 'Вертел', fryer: 'Фритюр', drinks: 'Автомат напитков' };
    const eq = Object.entries(G.equip).map(([k, v]) => {
      const cost = Math.ceil((100 - v) * 1.2);
      return `<div class="card"><h4>${names[k]}</h4><div class="row">Состояние: <span class="${v < 30 ? 'bad' : ''}">${Math.round(v)}%</span></div>
        <div class="btns"><button class="b" data-a="repair" data-v="${k}" ${v >= 100 || G.money < cost || this.timeLeft() < 20 ? 'disabled' : ''}>Починить ($${cost}, 20м)</button></div></div>`;
    }).join('');
    const up = Object.entries(UPGRADES).map(([k, u]) => {
      const lvl = G.upgrades[k], max = lvl >= u.max, cost = u.cost(lvl);
      return `<div class="card"><h4>${u.name} ${'★'.repeat(lvl)}${'☆'.repeat(u.max - lvl)}</h4><div class="row">${u.desc}</div>
        <div class="btns"><button class="b" data-a="upgrade" data-v="${k}" ${max || G.money < cost ? 'disabled' : ''}>${max ? 'Максимум' : 'Купить $' + cost}</button></div></div>`;
    }).join('');
    return `<h3>Оборудование</h3><div class="cards">${eq}</div><h3>Улучшения кухни и мотеля</h3><div class="cards">${up}</div>`;
  },

  handlers() {
    return {
      haste: (v, el) => { this.haste = el.checked; this.render(); },
      tail: v => { const [t, a] = v.split(':'); this.doTail(t, a); },
      hauler: v => { G.money -= 40; G.tails = G.tails.filter(x => x.id != v); const h = hasStaff('hauler'); if (h) staffWitness('hauler', 3); toast('Человек «на вывоз» всё забрал', 'good'); this.render(); },
      buy: v => { const [id, n] = v.split(':'); const s = SHOP.find(x => x.id === id); const cost = s.price * s.pack * n; if (G.money >= cost) { G.money -= cost; G.stock[id] += s.pack * n; this.spend(5); } this.render(); },
      repair: k => { const cost = Math.ceil((100 - G.equip[k]) * 1.2); if (G.money >= cost) { G.money -= cost; G.equip[k] = 100; this.spend(20); toast('Починено', 'good'); } this.render(); },
      upgrade: k => { const u = UPGRADES[k], cost = u.cost(G.upgrades[k]); if (G.money >= cost && G.upgrades[k] < u.max) { G.money -= cost; G.upgrades[k]++; toast(u.name + ' улучшено!', 'good'); } this.render(); },
      act: v => {
        if (v === 'deputy' && G.money >= 180) { G.money -= 180; if (chance(0.8)) { addSuspicion(-12); toast('Помощник шерифа теперь «твой человек»', 'good'); } else { addSuspicion(6); toast('Он взял деньги и всё равно доложил', 'bad'); } }
        if (v === 'bar' && G.money >= 60) { G.money -= 60; this.spend(30); addRumors(-10); toast('Ты угостил весь бар. Слухи притихли.', 'good'); }
        if (v === 'nap') { this.spend(40); G.stamina = clamp(G.stamina + 12, 0, 100); }
        if (v === 'tidy') { this.spend(30); addClean(8); G.stamina = clamp(G.stamina - 3, 0, 100); }
        this.render();
      },
      end: v => {
        const texts = {
          legend: 'Ты передаёшь ключи и уезжаешь на пике славы. Закусочную будут вспоминать как лучшую на всём шоссе. Правды так никто и не узнал.',
          flee: 'Ты продал закусочную и мотель первому встречному покупателю, сжёг журналы и растворился на шоссе. Где-то в другом штате открылась новая закусочная…',
          conscience: 'Ты закрыл мотель, снял вывеску и вернулся к обычной еде. Кошмары приходят реже. Но приходят.'
        };
        UI.choice('Ты уверен?', '<p>Это завершит игру.</p>', [{ t: 'Да', cls: 'danger', fn: () => Game.ending(v, texts[v]) }, { t: 'Нет', fn: () => this.render() }]);
      }
    };
  }
};
