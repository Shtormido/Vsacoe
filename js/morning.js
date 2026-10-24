// Утро: приведение бумаг в порядок, закупки, ремонт, подкуп, улучшения
const TAIL_INFO = {
  journal: { icon: '📒', name: 'Запись в журнале регистрации' },
  items:   { icon: '🧳', name: 'Вещи постояльца' },
  car:     { icon: '🚗', name: 'Машина на парковке' },
  blood:   { icon: '🩸', name: 'Следы в номере' }
};
const TAIL_ACTIONS = {
  journal: [
    { id: 'forge',  name: 'Подделать запись о раннем выезде', time: 30, need: { blanks: 1 }, p: () => 0.55 + G.forgery * 0.08, skill: true, game: { id: 'rhythm', n: 8 } },
    { id: 'erase',  name: 'Оформить, будто не заселялся',     time: 45, need: { blanks: 2 }, p: () => 0.45 + G.forgery * 0.1, skill: true, game: { id: 'rhythm', n: 11, fast: true, title: 'Чистая страница' } },
    { id: 'bribe',  name: 'Регистратор «потеряет» страницу',  time: 10, money: 120, p: () => 0.9 },
    { id: 'legend', name: 'Легенда: «сбежал без оплаты»',      time: 20, p: () => 0.8, after: () => { addRumors(3); addSuspicion(1); } }
  ],
  items: [
    { id: 'hide',  name: 'Спрятать',                 time: 20, p: () => 0.7, game: { id: 'redlight', theme: 'hide' } },
    { id: 'burn',  name: 'Сжечь',                    time: 40, p: () => 0.8, after: () => addClean(-3), game: { id: 'bellows' } },
    { id: 'plant', name: 'Подбросить в чужой номер', time: 15, p: () => 0.6, failRemoves: true, game: { id: 'redlight', theme: 'plant' } },
    { id: 'haul',  name: 'Вывезти за город',         time: 70, p: () => 0.9, stamina: 8, game: { id: 'drive', title: 'Вывезти за город', color: '#5a4a3a' } }
  ],
  car: [
    { id: 'move',  name: 'Перегнать подальше',          time: 40, p: () => 0.75, game: { id: 'drive', title: 'Перегнать машину' } },
    { id: 'steal', name: '«Угнать» от имени владельца', time: 30, p: () => 0.6, gain: 80, game: { id: 'lockpick' } },
    { id: 'parts', name: 'Разобрать на запчасти',       time: 90, p: () => 0.85, gain: 150, stamina: 10, game: { id: 'mash' } }
  ],
  blood: [
    { id: 'clean', name: 'Отмыть номер', time: 45, p: () => 0.8, need: {}, after: () => addClean(12), stamina: 6, game: { id: 'scrub' } }
  ]
};

const Morning = {
  tab: 'overview', report: [], haste: false,

  start(fromTime) {
    G.phase = 'morning';
    Atmos.setWeather('fog');
    G.time = fromTime;
    this.t0 = fromTime;
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
    const tabs = [['overview', '📰', 'Сводка'], ['tails', '📁', `Дела (${G.tails.length})`], ['shop', '🛒', 'Поставщик'], ['repair', '🔧', 'Мастерская'], ['staff', '👥', `Персонал (${G.staff.length})`]];
    const body = { overview: () => this.overviewHTML(), tails: () => this.tailsHTML(), shop: () => this.shopHTML(), repair: () => this.repairHTML(), staff: () => Staff.tabHTML() }[this.tab]();
    const left = this.timeLeft(), total = OPEN_TIME - (this.t0 || G.time);
    const html = `<div class="ledger-head">
        <div class="lh-day"><span>ДЕНЬ</span><b>${G.day}</b></div>
        <div class="lh-mid"><h2>Утро · ${fmtTime(G.time)}</h2>${meter(left, Math.max(total, 1), left < 30 ? 'bad' : 'info', '🕗', left + ' мин до открытия')}</div>
        <div class="lh-money">💵 <b>$${Math.floor(G.money)}</b></div>
      </div>
      <div class="ftabs">${tabs.map(([k, i, n]) => `<button class="ftab ${this.tab === k ? 'on' : ''} ${k === 'tails' && G.tails.length ? 'alert' : ''}" data-a="tab" data-v="${k}"><i>${i}</i>${n}</button>`).join('')}</div>
      <div class="fpage p-${this.tab}">${body}</div>
      <div class="btns"><button class="b primary big" data-a="open">☀ Открыть закусочную (08:00)</button></div>`;
    const h = Object.assign({
      tab: v => { this.tab = v; this.render(); },
      open: () => this.openDiner()
    }, this.handlers(), Staff.handlers());
    if (UI.isOpen()) UI.refresh(html, h); else UI.open(html, h, { cls: 'm-morning' });
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

  headline() {
    if (G.suspicion > 70) return ['ШЕРИФ ЗАДАЁТ ВОПРОСЫ', 'Полиция проверяет сообщения о пропавших на шоссе'];
    if (G.rumors > 50) return ['В ГОРОДЕ ШЕПЧУТСЯ О МОТЕЛЕ', 'Местные обходят придорожный приют стороной'];
    if (G.rep > 70) return ['ЛУЧШИЕ БУРГЕРЫ ШТАТА — У ДОРОГИ', 'Очереди в закусочную растут с каждым днём'];
    if (G.stats.kills && G.tails.length) return ['ПОСТОЯЛЕЦ УЕХАЛ, НЕ ПОПРОЩАВШИСЬ', 'Хозяин мотеля разводит руками'];
    return ['ТИХОЕ УТРО НА ШОССЕ', 'Погода ясная, грузовики идут на запад'];
  },

  overviewHTML() {
    const [hl, sub] = this.headline();
    const scale = (ico, name, v, cls, why) => `<div class="scale">${meter(v, 100, cls, ico + ' ' + name, Math.round(v))}<span class="why">${why}</span></div>`;
    const legend = [[G.rep, 90, 'Репутация 90+'], [100 - G.suspicion, 60, 'Подозрения < 40'], [G.day, 7, 'День 7+']];
    const legendReady = G.rep >= 90 && G.suspicion < 40 && G.day >= 7;
    const act = (key, ico, name, cost, time, eff, dis) => `<button class="action" data-a="act" data-v="${key}" ${dis ? 'disabled' : ''}><i>${ico}</i><b>${name}</b><span>${cost ? chip(cost, 'gold') : ''}${time ? chip('⏱ ' + time) : ''}</span><em>${eff}</em></button>`;
    return `<div class="paper-news">
        <div class="masthead">ВЕСТНИК ШОССЕ <span>день ${G.day} · цена 5¢</span></div>
        <div class="headline">${hl}</div><div class="subhead">${sub}</div>
        <div class="news-cols">
          <div class="col">
            <h3>Положение дел</h3>
            ${scale('👁', 'Подозрения', G.suspicion, riskCls(G.suspicion), '100 — арест. Растут от слухов, хвостов, досрочных выездов.')}
            ${scale('🗣', 'Слухи', G.rumors, riskCls(G.rumors), 'Каждое утро превращаются в подозрения (×0.06).')}
            ${scale('🧽', 'Чистота мотеля', G.cleanliness, goodCls(G.cleanliness), '< 50 — проверки санэпидемстанции.')}
            ${scale('♥', 'Совесть', G.conscience, goodCls(G.conscience), '< 40 — галлюцинации, 0 — конец игры.')}
            ${scale('⚡', 'Выносливость', G.stamina, goodCls(G.stamina), 'Скорость, точность и дрожь рук.')}
            <div class="tiers">${kv('⭐ Ресторан', tierOf(REP_TIERS, G.rep))}${meter(G.rep, 100, 'gold', '', Math.round(G.rep))}${kv('🏚 Мотель', tierOf(MOTEL_TIERS, G.rumors))}</div>
          </div>
          <div class="col">
            <h3>Ночная сводка</h3>
            <div class="report">${this.report.length ? this.report.map(r => `<p>${r}</p>`).join('') : '<p class="muted">Ночь прошла тихо.</p>'}</div>
            <h3>Постояльцы ${G.guests.length}/6</h3>
            <div class="guest-row">${G.guests.map(g => `<span class="gmini" title="${g.name}">${portraitImg(g.look)}<i>№${g.room + 1}</i>${g.revealed && g.trait ? '<b>!</b>' : ''}</span>`).join('') || '<span class="muted">никого</span>'}</div>
          </div>
        </div>
      </div>
      <h3>Нужные люди</h3>
      <div class="actions">
        ${act('deputy', '🤝', 'Помощник шерифа', '$180', '', '−12 подозрений · 20% провал (+6)', G.money < 180)}
        ${act('bar', '🍺', 'Угостить бар', '$60', '30м', '−10 слухов', G.money < 60 || this.timeLeft() < 30)}
        ${act('nap', '😴', 'Вздремнуть', '', '40м', '+12 выносливости', this.timeLeft() < 40)}
        ${act('tidy', '🧹', 'Прибраться', '', '30м', '+8 чистоты · −3 выносливости', this.timeLeft() < 30)}
      </div>
      <h3>Решения</h3>
      <div class="decisions">
        <div class="decision">${stamp('ЛЕГЕНДА', 'gold')}${legend.map(([v, m, n]) => meter(v, m, v >= m ? 'good' : 'warn', n)).join('')}<button class="b primary" data-a="end" data-v="legend" ${legendReady ? '' : 'disabled'}>Уйти на покой</button></div>
        <div class="decision">${stamp('ПОБЕГ', '')}${meter(G.money, 3000, G.money >= 3000 ? 'good' : 'gold', '💵 $3000', '$' + Math.floor(G.money))}<button class="b" data-a="end" data-v="flee" ${G.money < 3000 ? 'disabled' : ''}>Продать всё и скрыться</button></div>
        <div class="decision">${stamp('СОВЕСТЬ', 'bad')}${meter(100 - G.conscience, 40, G.conscience <= 60 ? 'good' : 'warn', '♥ ≤ 60', Math.round(G.conscience))}<button class="b" data-a="end" data-v="conscience" ${G.conscience > 60 || !G.stats.kills ? 'disabled' : ''}>Закрыть мотель</button></div>
      </div>`;
  },

  tailsHTML() {
    if (!G.tails.length) return `<div class="clean-desk">${stamp('ДЕЛА ЗАКРЫТЫ', 'good')}<p>Бумаги в порядке. Никаких следов.</p></div>`;
    const hasHauler = hasStaff('hauler');
    return `<div class="tails-top">
        ${kv('Навык подделки', pips(Math.floor(G.forgery), 5, 'gold') + ' ' + G.forgery.toFixed(1))}${kv('Бланков', icon('ing', 'blanks', 18) + ' ' + G.stock.blanks)}
        <label class="switch"><input type="checkbox" data-a="haste" ${this.haste ? 'checked' : ''}><span></span>Торопиться: время ×0.5, успех −20%</label>
      </div>
      <div class="folders">${G.tails.map(t => {
        const info = TAIL_INFO[t.type];
        const acts = TAIL_ACTIONS[t.type].map(a => {
          const time = Math.ceil(a.time * (this.haste ? 0.5 : 1));
          const p = clamp(a.p() - (this.haste ? 0.2 : 0) - (G.stamina < 30 ? 0.1 : 0), 0.05, 1);
          const ok = this.canDo(a, time);
          return `<div class="act-row">
            <div class="ar-name">${a.game ? '<i class="mg-tag">🎮</i>' : ''}${a.name}<span>${chip('⏱ ' + time + 'м')}${a.money ? chip('$' + a.money, 'gold') : ''}${a.need && a.need.blanks ? chip(icon('ing', 'blanks', 12) + '×' + a.need.blanks) : ''}${a.gain ? chip('+$' + a.gain, 'good') : ''}</span></div>
            ${meter(p * 100, 100, goodCls(p * 100), '', pct(p))}
            <button class="b" data-a="tail" data-v="${t.id}:${a.id}" ${ok ? '' : 'disabled'}>▶</button></div>`;
        }).join('');
        const haul = hasHauler && (t.type === 'items' || t.type === 'car') ? `<div class="act-row"><div class="ar-name">🚚 Человек «на вывоз»<span>${chip('$40', 'gold')}${chip('0 мин')}</span></div>${meter(100, 100, 'good', '', '100%')}<button class="b primary" data-a="hauler" data-v="${t.id}" ${G.money < 40 ? 'disabled' : ''}>▶</button></div>` : '';
        return `<div class="folder f-${t.type}"><div class="f-tab">${info.icon} ${info.name}</div>
          <div class="f-body"><div class="f-who">Дело: <b>${t.guest}</b>${t.bad ? stamp('НЕСОСТЫКОВКА', 'bad') : ''}</div>${acts}${haul}</div></div>`;
      }).join('')}</div>
      ${tip('🎮 — действие с мини-игрой: показан базовый шанс, итог = база ± твоя игра (до +45% / −45%). Каждый незакрытый хвост к открытию: подозрения +3 (несостыковка +6), следы крови −5 чистоты.')}`;
  },

  canDo(a, time) {
    if (this.timeLeft() < time) return false;
    if (a.money && G.money < a.money) return false;
    if (a.need) for (const k in a.need) if (G.stock[k] < a.need[k]) return false;
    return true;
  },

  async doTail(tid, aid) {
    const t = G.tails.find(x => x.id == tid);
    const a = TAIL_ACTIONS[t.type].find(x => x.id === aid);
    const time = Math.ceil(a.time * (this.haste ? 0.5 : 1));
    if (!this.canDo(a, time)) return;
    this.spend(time);
    if (a.money) G.money -= a.money;
    if (a.need) for (const k in a.need) G.stock[k] -= a.need[k];
    if (a.stamina) G.stamina = clamp(G.stamina - a.stamina, 0, 100);
    if (a.skill) G.forgery = Math.min(5, G.forgery + 0.5);
    let p = clamp(a.p() - (this.haste ? 0.2 : 0) - (G.stamina < 30 ? 0.1 : 0), 0.05, 1);
    if (a.game) {
      const score = await MiniGame.play(a.game.id, Object.assign({ haste: this.haste, skill: G.forgery }, a.game, t.color ? { color: t.color } : {}));
      p = MiniGame.chance(p, score);
      toast(`Мини-игра ${pct(score)} → шанс успеха ${pct(p)}`);
    }
    Sound.sfx('paper');
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
    return `<div class="catalog-head">🚚 «Оптовик Дэйва» — доставка за 5 минут</div>
      <div class="catalog">${SHOP.map(s => `<div class="product ${s.id === 'pet' ? 'p-pet' : ''}">
        <div class="pr-ico">${icon('ing', s.id, 44)}</div>
        <div class="pr-body"><b>${s.name}</b><span class="price">$${s.price} / шт</span>
          ${meter(G.stock[s.id], 30, G.stock[s.id] < 5 ? 'bad' : G.stock[s.id] < 12 ? 'warn' : 'good', 'склад', G.stock[s.id])}
          <div class="btns"><button class="b" data-a="buy" data-v="${s.id}:1" ${G.money < s.price * s.pack ? 'disabled' : ''}>+${s.pack} · $${s.price * s.pack}</button>
          <button class="b" data-a="buy" data-v="${s.id}:3" ${G.money < s.price * s.pack * 3 ? 'disabled' : ''}>+${s.pack * 3} · $${s.price * s.pack * 3}</button></div>
        </div></div>`).join('')}</div>
      ${tip('Мясо животных — легальная альтернатива особому ресурсу: вкус ×1.2 против ×1.6, но риск почти нулевой.')}`;
  },

  upgEffect(k, l) {
    return {
      equip: `все блюда: время ×${(1 - l * 0.1).toFixed(2)}`,
      grill: `гриль ${2 + l} места, вертел ${1 + l} · время ×${(1 - l * 0.12).toFixed(2)}`,
      fryer: `${2 + l} корзины · время ×${(1 - l * 0.12).toFixed(2)}`,
      recipes: `качество +${l * 10}%`,
      tray: `поднос ${3 + l} предмета`,
      signature: l ? 'фирменный бургер доступен' : 'нет',
      soundproof: `окно удара +${l * 10} · тревога гостей −${l * 3}`,
      cameras: ['камер нет', 'видно неспящих · 50% секретов', 'все секреты гостей'][l],
      tunnels: l ? 'старт ночью из люка у номеров' : 'нет'
    }[k];
  },

  repairHTML() {
    const names = { grill: ['Гриль', 'st-grill'], spit: ['Вертел', 'st-spit'], fryer: ['Фритюр', 'st-fryer'], drinks: ['Автомат напитков', 'st-drinks'] };
    const eq = Object.entries(G.equip).map(([k, v]) => {
      const cost = Math.ceil((100 - v) * 1.2);
      return `<div class="machine"><div class="st-badge ${names[k][1]}"></div><div class="mc-body"><b>${names[k][0]}</b>
        ${meter(v, 100, goodCls(v), '🔧', Math.round(v) + '%')}<span class="small">${v <= 0 ? '<span class="bad">СЛОМАН — не работает</span>' : k === 'drinks' ? 'Износ −0.2% за стакан' : 'Износ −0.5% за готовку'}</span>
        <button class="b" data-a="repair" data-v="${k}" ${v >= 100 || G.money < cost || this.timeLeft() < 20 ? 'disabled' : ''}>${v >= 100 ? '✔ Исправен' : 'Починить · $' + cost + ' · 20м'}</button></div></div>`;
    }).join('');
    const up = Object.entries(UPGRADES).map(([k, u]) => {
      const lvl = G.upgrades[k], max = lvl >= u.max, cost = u.cost(lvl);
      return `<div class="blueprint"><div class="bp-head"><b>${u.name}</b>${pips(lvl, u.max, 'gold')}</div>
        <div class="bp-eff"><span>сейчас</span>${this.upgEffect(k, lvl)}</div>
        ${max ? '' : `<div class="bp-eff next"><span>станет</span>${this.upgEffect(k, lvl + 1)}</div>`}
        <button class="b ${max ? '' : 'primary'}" data-a="upgrade" data-v="${k}" ${max || G.money < cost ? 'disabled' : ''}>${max ? 'Максимум' : 'Улучшить · $' + cost}</button></div>`;
    }).join('');
    return `<h3>Оборудование</h3><div class="machines">${eq}</div><h3>Чертежи улучшений</h3><div class="blueprints">${up}</div>`;
  },

  handlers() {
    return {
      haste: (v, el) => { this.haste = el.checked; this.render(); },
      tail: v => { const [t, a] = v.split(':'); this.doTail(t, a); },
      hauler: v => { G.money -= 40; G.tails = G.tails.filter(x => x.id != v); const h = hasStaff('hauler'); if (h) staffWitness('hauler', 3); toast('Человек «на вывоз» всё забрал', 'good'); this.render(); },
      buy: v => { const [id, n] = v.split(':'); const s = SHOP.find(x => x.id === id); const cost = s.price * s.pack * n; if (G.money >= cost) { G.money -= cost; G.stock[id] += s.pack * n; this.spend(5); Sound.sfx('coin'); } this.render(); },
      repair: k => { const cost = Math.ceil((100 - G.equip[k]) * 1.2); if (G.money >= cost) { G.money -= cost; G.equip[k] = 100; this.spend(20); toast('Починено', 'good'); } this.render(); },
      upgrade: k => { const u = UPGRADES[k], cost = u.cost(G.upgrades[k]); if (G.money >= cost && G.upgrades[k] < u.max) { G.money -= cost; G.upgrades[k]++; toast(u.name + ' улучшено!', 'good'); } this.render(); },
      act: v => {
        if (v === 'deputy' && G.money >= 180) { G.money -= 180; MiniGame.play('haggle', { title: 'Разговор с помощником шерифа' }).then(score => { const p = MiniGame.chance(0.8, score); if (chance(p)) { addSuspicion(-12); toast('Помощник шерифа теперь «твой человек»', 'good'); } else { addSuspicion(6); toast('Он взял деньги и всё равно доложил', 'bad'); } this.render(); }); return; }
        if (v === 'bar' && G.money >= 60) { G.money -= 60; this.spend(30); addRumors(-10); toast('Ты угостил весь бар. Слухи притихли.', 'good'); }
        if (v === 'nap') { this.spend(40); G.stamina = clamp(G.stamina + 12, 0, 100); }
        if (v === 'tidy') { this.spend(30); G.stamina = clamp(G.stamina - 3, 0, 100); MiniGame.play('scrub', { light: true, title: 'Прибраться в мотеле', help: 'Грязь, пыль и следы ботинок. Отмой, сколько успеешь: чистота растёт по результату.' }).then(score => { addClean(Math.round(4 + score * 8)); toast('Чистота +' + Math.round(4 + score * 8), 'good'); this.render(); }); return; }
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
