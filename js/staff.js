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
      id: uid(), role, name: p.name, look: randomLook(null, p.female),
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

  tabHTML() {
    const d = G.flags.demand;
    const dem = d ? (() => {
      const s = G.staff.find(x => x.id === d.id);
      return s ? `<div class="blackmail">${portraitImg(s.look || PLAYER_LOOK)}<div><div class="bm-title">✉ Шантаж</div><p><b>${s.name}</b> требует <b>$${d.amount}</b> за молчание.</p>
        <div class="small">Отказ: ${s.susp > 70 ? '<span class="bad">60% — пойдёт к шерифу (арест)</span>' : 'уйдёт, подозрения +' + Math.round(s.susp / 3)}</div>
        <div class="btns"><button class="b primary" data-a="demand" data-v="pay" ${G.money < d.amount ? 'disabled' : ''}>Заплатить (лояльн. +20)</button><button class="b danger" data-a="demand" data-v="no">Отказать</button>
        <button class="b danger" data-a="staff" data-v="${s.id}:dark">«Решить проблему»</button></div></div></div>` : '';
    })() : '';
    const act = (s, key, name, eff, dis) => `<button class="sact" data-a="staff" data-v="${s.id}:${key}" ${dis ? 'disabled' : ''}><b>${name}</b><em>${eff}</em></button>`;
    const team = G.staff.map(s => {
      const r = ROLES[s.role], danger = s.loyalty < 30 && s.susp > 45;
      return `<div class="empfile ${danger ? 'danger' : ''}">
        <div class="ef-left">${portraitImg(s.look || PLAYER_LOOK, 'photo')}<span class="role">${r.icon} ${r.name}</span></div>
        <div class="ef-body"><div class="ef-name"><b>${s.name}</b>${danger ? stamp('УГРОЗА', 'bad') : ''}</div>
          ${meter(s.loyalty, 100, goodCls(s.loyalty), 'Лояльность', Math.round(s.loyalty))}
          ${meter(s.susp, 100, riskCls(s.susp), 'Подозрит.', Math.round(s.susp))}
          <div class="ef-row">${kv('Зарплата', '$' + s.wage + '/д')}${kv('Навык', pips(s.skill, 3, 'gold'))}${kv('Черта', s.days >= 4 ? (HIDDEN[s.hidden] || 'обычный') : '? (через ' + (4 - s.days) + ' дн.)')}</div>
          <div class="sacts">
            ${act(s, 'bonus', 'Премия $50', 'лояльн. +15', G.money < 50)}
            ${act(s, 'terms', 'Условия $100', 'лояльн. +25 · подозр. −5', G.money < 100)}
            ${act(s, 'train', 'Обучить $80', 'навык +1 · лояльн. +5', G.money < 80 || s.skill >= 3)}
            ${act(s, 'threat', 'Припугнуть', 'лояльн. +10 · подозр. +12 · ♥ −2', false)}
            ${act(s, 'fire', 'Уволить', 'город: подозр. +' + Math.round(s.susp / 4), false)}
            ${s.susp > 40 ? act(s, 'dark', '«Решить проблему»', 'особый +5 · ♥ −15 · подозр. +10', false) : ''}
          </div></div></div>`;
    }).join('') || '<p class="muted">Ты работаешь один.</p>';
    const cands = G.candidates.filter(c => !hasStaff(c.role)).map(c => {
      const r = ROLES[c.role], cost = c.wage * 3;
      return `<div class="resume">${portraitImg(c.look, 'photo')}<div class="rs-body"><b>${c.name}</b><span class="role">${r.icon} ${r.name}</span>
        <p>${r.desc}</p>
        <div class="ef-row">${kv('Зарплата', '$' + c.wage + '/д')}${kv('Навык', pips(c.skill, 3, 'gold'))}${kv('Лояльность', '~' + c.loyalty)}</div>
        <button class="b primary" data-a="hire" data-v="${c.id}" ${G.money < cost ? 'disabled' : ''}>Нанять · аванс $${cost}</button></div></div>`;
    }).join('') || '<p class="muted">Новых кандидатов нет. Объявление обновится через пару дней.</p>';
    const wages = G.staff.reduce((a, s) => a + s.wage, 0);
    return `${dem}<div class="staff-sum">${kv('Сотрудников', G.staff.length)}${kv('Зарплаты в день', '$' + wages)}${kv('Падение лояльности', '−2/день')}</div>
      <h3>Команда</h3><div class="empfiles">${team}</div>
      <h3>Резюме кандидатов</h3><div class="resumes">${cands}</div>
      ${tip('Лояльность < 30 и подозрительность > 45 — шантаж. Лояльность ≤ 5 при подозрительности > 70 — донос и арест.')}`;
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
