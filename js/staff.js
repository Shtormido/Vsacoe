// Найм персонала: каждый сотрудник — и ресурс, и угроза
const ROLES = {
  helper:    { name: 'Повар-помощник',       icon: '👨‍🍳', wage: [25, 40], desc: 'Сам готовит по заказам, ускоряет кухню, помогает разделывать (+1 ресурса за ночь). Видит слишком много.' },
  plant:     { name: 'Подставной постоялец', icon: '🕵', wage: [30, 45], desc: 'Живёт в номере как обычный гость: вынюхивает журналистов и любопытных, докладывает каждое утро.' },
  caretaker: { name: 'Смотритель мотеля',    icon: '🔦', wage: [20, 35], desc: 'Закрывает двери и следит за парковкой: меньше неспящих ночью, подозрения тают быстрее.' },
  cleaner:   { name: 'Уборщица',             icon: '🧹', wage: [20, 30], desc: 'Каждое утро отмывает следы в номерах и поднимает чистоту. Может «не заметить» лишнее.' },
  hauler:    { name: 'Человек «на вывоз»',   icon: '🚚', wage: [45, 60], desc: 'Избавляется от вещей и машин ($40 за раз). Стоит дорого и требует осторожности.' }
};
const HIDDEN = { greedy: 'Жадный', snitch: 'Стукач', loyal: 'Верный', curious: 'Любопытный' };

function makeCandidates() {
  return Object.keys(ROLES).map(role => {
    const p = randomPerson(), r = ROLES[role];
    return {
      id: uid(), role, name: p.name, look: randomLook(),
      wage: rint(r.wage[0], r.wage[1]), loyalty: rint(45, 75), susp: rint(0, 15), skill: rint(0, 2),
      hidden: pick([null, null, 'greedy', 'snitch', 'loyal', 'curious']), days: 0
    };
  }).filter(() => chance(0.75));
}

function staffWitness(role, n) {
  const s = hasStaff(role);
  if (!s) return;
  s.susp = clamp(s.susp + n * (s.hidden === 'snitch' || s.hidden === 'curious' ? 1.5 : 1), 0, 100);
}

const Staff = {
  morning(rep) {
    if (G.day % 3 === 0) G.candidates = makeCandidates();
    if (G.flags.demand) this.refuse(true, rep);
    for (const s of G.staff.slice()) {
      s.days++;
      if (G.money >= s.wage) G.money -= s.wage;
      else { s.loyalty -= 15; rep.push(`💸 ${s.name} не получил зарплату и злится.`); }
      s.loyalty = clamp(s.loyalty - (s.hidden === 'greedy' ? 4 : s.hidden === 'loyal' ? 1 : 2), 0, 100);
      if (s.hidden === 'snitch') s.susp = clamp(s.susp + 2, 0, 100);

      if (s.role === 'cleaner') {
        const blood = G.tails.filter(t => t.type === 'blood');
        if (blood.length) { G.tails = G.tails.filter(t => t.type !== 'blood'); addClean(12 * blood.length); staffWitness('cleaner', 4 * blood.length); rep.push(`🧹 ${s.name} отмыла ${blood.length} номер(а). Вопросов не задавала… пока.`); }
        addClean(6 + s.skill * 2);
      }
      if (s.role === 'caretaker') { addSuspicion(-2 - s.skill); if (chance(0.25)) rep.push(`🔦 ${s.name}: «Ночью у парковки крутилась патрульная машина».`); }
      if (s.role === 'plant') {
        const g = G.guests.find(x => !x.revealed);
        if (g) { g.revealed = true; rep.push(`🕵 ${s.name}: «${g.name} из №${g.room + 1} — ${g.trait ? TRAITS[g.trait].name.toLowerCase() : 'обычный, ничего странного'}».`); }
        const awake = G.guests.filter(x => x.alarm > 30);
        if (awake.length) rep.push(`🕵 ${s.name}: «${awake.map(x => x.name).join(', ')} плохо спят и задают странные вопросы».`);
        staffWitness('plant', 1);
      }

      // предательство, шантаж, уход
      if (s.loyalty <= 5 && s.susp > 70) {
        Game.ending('prison', `${s.name} (${ROLES[s.role].name.toLowerCase()}) пришёл в участок с рассказом и уликами. Тебя сдал собственный сотрудник.`);
        return;
      }
      if (s.loyalty < 30 && s.susp > 45 && !G.flags.demand) {
        const amount = 100 + Math.round(s.susp * 3);
        G.flags.demand = { id: s.id, amount };
        rep.push(`<span class="bad">⚠ ${s.name} требует $${amount} за молчание. Ответь во вкладке «Персонал».</span>`);
      } else if (s.loyalty <= 10) {
        G.staff = G.staff.filter(x => x !== s);
        addRumors(Math.round(s.susp / 5));
        rep.push(`<span class="bad">🚪 ${s.name} уволился сам и хлопнул дверью.</span>`);
      } else if (s.loyalty < 25 && chance(0.3)) {
        rep.push(`<span class="bad">🔧 ${s.name} саботирует работу.</span>`);
        if (s.role === 'helper') { const k = pick(['grill', 'fryer', 'spit']); G.equip[k] = Math.max(0, G.equip[k] - 30); }
        else addClean(-8);
      }
    }
  },

  refuse(auto, rep) {
    const d = G.flags.demand; G.flags.demand = null;
    const s = G.staff.find(x => x.id === d.id);
    if (!s) return;
    if (s.susp > 70 && chance(0.6)) { Game.ending('prison', `${s.name} не получил денег и пошёл к шерифу. Его рассказ сошёлся с журналом регистрации.`); return; }
    G.staff = G.staff.filter(x => x !== s);
    addSuspicion(Math.round(s.susp / 3)); addRumors(8);
    const msg = `${s.name} ушёл, бросив: «Ещё пожалеешь». По городу поползли разговоры.`;
    if (rep) rep.push(`<span class="bad">${msg}</span>`); else toast(msg, 'bad');
  },

  bar(v, c) { return `<b style="color:${c}">${'█'.repeat(Math.round(v / 10))}${'░'.repeat(10 - Math.round(v / 10))}</b>`; },

  tabHTML() {
    const d = G.flags.demand;
    const dem = d ? (() => { const s = G.staff.find(x => x.id === d.id); return s ? `<div class="card" style="border-color:var(--danger)"><h4 class="bad">Шантаж: ${s.name} хочет $${d.amount}</h4>
      <div class="btns"><button class="b" data-a="demand" data-v="pay" ${G.money < d.amount ? 'disabled' : ''}>Заплатить</button><button class="b danger" data-a="demand" data-v="no">Отказать</button>
      <button class="b danger" data-a="staff" data-v="${s.id}:dark">«Решить проблему»</button></div></div>` : ''; })() : '';
    const team = G.staff.map(s => {
      const r = ROLES[s.role];
      return `<div class="card"><h4>${r.icon} ${s.name} — ${r.name}</h4>
        <div class="row">Зарплата: $${s.wage}/день · Навык: ${s.skill} · Черта: ${s.days >= 4 ? (HIDDEN[s.hidden] || 'обычный') : '?'}</div>
        <div class="row">Лояльность ${this.bar(s.loyalty, '#6fbf5a')}</div>
        <div class="row">Подозрит. ${this.bar(s.susp, '#d6453d')}</div>
        <div class="btns">
          <button class="b" data-a="staff" data-v="${s.id}:bonus" ${G.money < 50 ? 'disabled' : ''}>Премия $50</button>
          <button class="b" data-a="staff" data-v="${s.id}:terms" ${G.money < 100 ? 'disabled' : ''}>Условия $100</button>
          <button class="b" data-a="staff" data-v="${s.id}:train" ${G.money < 80 || s.skill >= 3 ? 'disabled' : ''}>Обучить $80</button>
          <button class="b" data-a="staff" data-v="${s.id}:threat">Припугнуть</button>
          <button class="b" data-a="staff" data-v="${s.id}:fire">Уволить</button>
          ${s.susp > 40 ? `<button class="b danger" data-a="staff" data-v="${s.id}:dark">«Решить проблему»</button>` : ''}
        </div></div>`;
    }).join('') || '<p class="muted">Ты работаешь один.</p>';
    const cands = G.candidates.filter(c => !hasStaff(c.role)).map(c => {
      const r = ROLES[c.role], cost = c.wage * 3;
      return `<div class="card"><h4>${r.icon} ${c.name} — ${r.name}</h4><div class="row">${r.desc}</div>
        <div class="row">Зарплата $${c.wage}/день · Навык ${c.skill} · Лояльность ~${c.loyalty}</div>
        <div class="btns"><button class="b primary" data-a="hire" data-v="${c.id}" ${G.money < cost ? 'disabled' : ''}>Нанять ($${cost} аванс)</button></div></div>`;
    }).join('') || '<p class="muted">Новых кандидатов нет. Загляни через пару дней.</p>';
    return `${dem}<h3>Команда</h3><div class="cards">${team}</div><h3>Кандидаты</h3><div class="cards">${cands}</div>
      <p class="muted">Если лояльность падает, а подозрительность растёт — сотрудник может саботировать, шантажировать или сдать тебя.</p>`;
  },

  handlers() {
    return {
      hire: id => {
        const c = G.candidates.find(x => x.id == id); if (!c) return;
        const cost = c.wage * 3; if (G.money < cost) return;
        G.money -= cost; G.staff.push(c); G.candidates = G.candidates.filter(x => x !== c);
        toast(c.name + ' теперь работает на тебя', 'good'); Morning.render();
      },
      demand: v => {
        const d = G.flags.demand;
        if (v === 'pay' && G.money >= d.amount) {
          G.money -= d.amount; G.flags.demand = null;
          const s = G.staff.find(x => x.id === d.id); if (s) { s.loyalty = clamp(s.loyalty + 20, 0, 100); }
          toast('Молчание куплено. Надолго ли?', 'night');
        } else if (v === 'no') this.refuse(false);
        if (G.phase === 'morning') Morning.render();
      },
      staff: v => {
        const [id, act] = v.split(':');
        const s = G.staff.find(x => x.id == id); if (!s) return;
        if (act === 'bonus') { G.money -= 50; s.loyalty = clamp(s.loyalty + 15, 0, 100); }
        if (act === 'terms') { G.money -= 100; s.loyalty = clamp(s.loyalty + 25, 0, 100); s.susp = clamp(s.susp - 5, 0, 100); }
        if (act === 'train') { G.money -= 80; s.skill++; s.loyalty = clamp(s.loyalty + 5, 0, 100); }
        if (act === 'threat') { s.loyalty = clamp(s.loyalty + 10, 0, 100); s.susp = clamp(s.susp + 12, 0, 100); addConscience(-2); toast(s.name + ' побледнел и закивал', 'night'); }
        if (act === 'fire') { G.staff = G.staff.filter(x => x !== s); addSuspicion(Math.round(s.susp / 4)); addRumors(Math.round(s.susp / 6)); toast(s.name + ' уволен', ''); }
        if (act === 'dark') {
          UI.choice('«Решить проблему»', `<p>${s.name} слишком много видел. Ты знаешь, что можно сделать.</p>`, [
            { t: 'Сделать это', cls: 'danger', fn: () => {
              G.staff = G.staff.filter(x => x !== s);
              if (G.flags.demand && G.flags.demand.id === s.id) G.flags.demand = null;
              G.stock.special += 5; G.stats.kills++; addConscience(-15); addSuspicion(10); addRumors(5);
              G.tails.push({ id: uid(), type: 'items', guest: s.name });
              toast('Сотрудник «уволился». Особого ресурса +5', 'night');
              Morning.render();
            } },
            { t: 'Нет', fn: () => Morning.render() }
          ]);
          return;
        }
        Morning.render();
      }
    };
  }
};
