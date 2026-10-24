// Мотель: постояльцы, ночная заготовка, стелс и мини-игра тайминга
const BUILDS = [
  { id: 'thin',  name: 'худощавый', yield: 3, zone: 4 },
  { id: 'avg',   name: 'среднее',   yield: 5, zone: 0 },
  { id: 'heavy', name: 'крупный',   yield: 8, zone: -8 }
];
const TRAITS = {
  journalist: { name: 'Журналист',      desc: 'Задаёт вопросы, раздувает слухи. Его пропажу заметят.' },
  double:     { name: 'С двойным дном', desc: 'Опаснее, чем кажется. Может дать отпор.' },
  attentive:  { name: 'Внимательный',   desc: 'Плохо спит, всё замечает, легко съезжает раньше.' },
  knower:     { name: 'Слишком много знает', desc: 'Тот самый тип из закусочной.' }
};

function makeGuest(forceTrait) {
  const used = (G ? G.guests : []).map(g => g.room);
  const free = [0, 1, 2, 3, 4, 5].filter(r => !used.includes(r));
  if (!free.length) return null;
  const p = randomPerson();
  const r = Math.random();
  const trait = forceTrait || (r < 0.12 ? 'journalist' : r < 0.22 ? 'double' : r < 0.42 ? 'attentive' : null);
  return {
    id: uid(), name: p.name, look: randomLook(), room: pick(free),
    age: rint(19, 74), build: pick(BUILDS).id,
    suspicious: rint(5, 45) + (trait === 'attentive' ? 30 : 0) + (trait === 'journalist' ? 20 : 0),
    value: rint(20, 160) + (trait === 'double' ? 120 : 0),
    trait, revealed: false,
    pet: chance(0.25) ? pick(['собака', 'кошка', 'кролик']) : null,
    car: chance(0.7) ? pick(CAR_COLORS) : null,
    nights: rint(1, 4), alarm: 0
  };
}
const buildOf = g => BUILDS.find(b => b.id === g.build);

const Night = {
  // ---------- выбор цели ----------
  start() {
    G.phase = 'nightmenu';
    Sound.sfx('chime');
    Atmos.setWeather(pick(['rain', 'rain', 'fog', 'clear']));
    if (G.flags.knowerGuest) {
      G.flags.knowerGuest = false;
      const k = makeGuest('knower');
      if (k) { k.name = 'Тощий тип'; k.revealed = true; k.car = null; G.guests.push(k); }
    }
    // разведка: подставной человек и камеры
    const plant = hasStaff('plant');
    G.guests.forEach(g => {
      if (plant && chance(0.5 + plant.skill * 0.15)) g.revealed = true;
      if (G.upgrades.cameras >= 2 || (G.upgrades.cameras === 1 && chance(0.5))) g.revealed = true;
    });
    this.menu();
  },

  // оценка окна удара в мини-игре (как в Stealth.startStrike)
  strikeZone(g, known) {
    return clamp(44 + (Atmos.weather === 'rain' ? 6 : 0) + G.upgrades.soundproof * 10 + buildOf(g).zone - g.suspicious / 6 - (known && g.trait === 'double' ? 12 : 0) - (100 - G.stamina) / 10, 14, 80);
  },

  menu() {
    const restless = G.guests.filter(g => g.trait === 'attentive' || g.suspicious > 40 || g.alarm > 40).length;
    const awake = clamp(1 + restless - 1 - (hasStaff('caretaker') ? 1 : 0), 0, 3);
    const W = { rain: ['🌧', 'Ливень', 'Шум дождя глушит возню: окно удара +6'], fog: ['🌫', 'Туман', 'Неспящие видят ближе: обзор 44 вместо 58'], clear: ['🌙', 'Ясно', 'Обычная ночь, без поблажек'] }[Atmos.weather];
    const cards = G.guests.map(g => {
      const b = buildOf(g), known = g.revealed;
      const zone = this.strikeZone(g, known), diff = zone > 50 ? ['легко', 'good'] : zone > 32 ? ['средне', 'warn'] : ['тяжело', 'bad'];
      const trait = g.trait && known ? stamp(TRAITS[g.trait].name.toUpperCase(), 'bad') : known ? stamp('ЧИСТО', 'good') : stamp('???', '');
      const yieldN = b.yield + (hasStaff('helper') ? 1 : 0);
      return `<div class="dossier">
        <div class="ds-photo">${portraitImg(g.look, 'photo')}<span class="ds-room">№${g.room + 1}</span></div>
        <div class="ds-body">
          <div class="ds-name"><b>${g.name}</b><span>${g.age} лет · ${b.name}</span></div>
          ${meter(g.suspicious, 100, riskCls(g.suspicious), '👁', g.suspicious)}
          ${meter(g.alarm, 100, riskCls(g.alarm), '⚠', Math.round(g.alarm))}
          <div class="ds-row">${chip(icon('ing', 'special', 16) + ' ×' + yieldN, 'dark')}${chip('$' + g.value, 'gold')}${g.pet ? chip('🐾 ' + g.pet) : ''}${g.car ? chip('🚗 хвост') : ''}${chip('⏳ ' + g.nights + ' н.')}</div>
          ${meter(zone, 80, diff[1], 'удар', diff[0])}
          ${known && g.trait ? `<div class="ds-trait">${TRAITS[g.trait].desc}</div>` : ''}
          <div class="btns">
            <button class="b danger" data-a="target" data-v="${g.id}" ${G.stamina < 15 ? 'disabled' : ''}>🔪 Заготовка</button>
            ${g.pet ? `<button class="b" data-a="pet" data-v="${g.id}">🐾 Питомец (${pct(0.75 - g.suspicious / 300)})</button>` : ''}
          </div>
        </div>${trait}</div>`;
    }).join('') || '<p class="muted">Мотель пуст. Ни одного постояльца.</p>';
    const hall = G.conscience < 40 ? '<p class="bad whisper">В коридоре кто-то шепчет твоё имя. Там никого нет.</p>' : '';
    UI.open(`${menuHead('<div class="st-badge st-moon"></div>', '02:00 — Тихая ночная смена', 'Выбери цель. Данные собраны подставным человеком и камерами.',
      `<div class="mh-stats">${meter(G.stamina, 100, goodCls(G.stamina), '⚡', Math.round(G.stamina))}${kv('Особый ресурс', G.stock.special)}</div>`)}
      <div class="night-info">
        <div class="weather w-${Atmos.weather}"><span class="w-ico">${W[0]}</span><div><b>${W[1]}</b><span>${W[2]}</span></div></div>
        ${kv('Неспящих в коридоре', '≈ ' + awake)}${kv('Патруль', G.suspicion > 40 ? '<span class="bad">ездит</span>' : 'нет')}${kv('Звукоизоляция', pips(G.upgrades.soundproof, 3, 'gold'))}
      </div>${hall}
      <div class="dossiers">${cards}</div>
      ${tip('Шире окно удара — проще мини-игра. Его сужают подозрительность, крупное телосложение, усталость и «двойное дно».')}
      <div class="btns"><button class="b primary" data-a="sleep">😴 Спать до утра (+35 выносливости)</button></div>`,
      {
        target: id => { UI.close(); Stealth.init(G.guests.find(g => g.id == id)); },
        pet: id => this.takePet(G.guests.find(g => g.id == id)),
        sleep: () => { UI.close(); G.stamina = clamp(G.stamina + 35, 0, 100); G.stress = clamp(G.stress - 15, 0, 100); toast('Ты проспал до семи утра', 'night'); Morning.start(7 * 60); }
      }, { cls: 'm-night' });
  },

  // итог ночи: что получено и что осталось
  report(ok, title, text, gains, losses, then) {
    UI.open(`<div class="night-report ${ok ? 'ok' : 'fail'}">
      <div class="nr-stamp">${stamp(ok ? 'ЗАГОТОВКА' : 'СРЫВ', ok ? 'blood' : 'bad')}</div>
      <h2>${title}</h2><p class="tw">${text}</p>
      <div class="nr-cols">
        <div><h3>${ok ? 'Получено' : 'Последствия'}</h3>${gains}</div>
        <div><h3>${ok ? 'Цена' : 'Что изменилось'}</h3>${losses}</div>
      </div>
      <div class="btns"><button class="b primary" data-a="go">🛏 Вернуться в постель</button></div></div>`, { go: () => { UI.close(); then(); } }, { cls: 'm-report' });
  },

  takePet(g) {
    Sound.sfx('pet');
    G.stamina = clamp(G.stamina - 10, 0, 100);
    addConscience(-3);
    if (chance(0.75 - g.suspicious / 300)) {
      const n = g.pet === 'собака' ? 4 : 2;
      G.stock.pet += n; g.alarm += 30;
      toast(`Питомец исчез. +${n} мяса животных`, 'night');
    } else {
      g.alarm += 55; addRumors(4);
      toast(`${g.name} проснулся от шума!`, 'bad');
    }
    g.pet = null;
    this.menu();
  },

  // результат заготовки
  success(g) {
    const b = buildOf(g);
    const y = b.yield + (hasStaff('helper') ? 1 : 0);
    G.stock.special += y;
    G.money += g.value;
    G.stats.kills++;
    addConscience(-10);
    addClean(-15);
    G.stamina = clamp(G.stamina - 20, 0, 100);
    G.guests = G.guests.filter(x => x !== g);
    G.tails.push({ id: uid(), type: 'journal', guest: g.name, room: g.room });
    G.tails.push({ id: uid(), type: 'items', guest: g.name });
    if (g.car) G.tails.push({ id: uid(), type: 'car', guest: g.name, color: g.car });
    G.tails.push({ id: uid(), type: 'blood', guest: g.name, room: g.room });
    if (g.trait === 'journalist') { addSuspicion(10); toast('Журналиста будут искать…', 'bad'); }
    if (g.trait === 'knower') toast('Больше он никому ничего не расскажет.', 'night');
    G.guests.forEach(o => o.alarm += 8 - G.upgrades.soundproof * 3);
    const tails = G.tails.slice(-(g.car ? 4 : 3)).map(t => `<div class="nr-line">${TAIL_INFO[t.type].icon} ${TAIL_INFO[t.type].name}</div>`).join('');
    this.report(true, `Номер ${g.room + 1} затих`, `${g.name} больше не проснётся. Утром придётся привести бумаги в порядок.`,
      `<div class="nr-line">${icon('ing', 'special', 22)} Особый ресурс <b>+${y}</b></div><div class="nr-line">💵 Из вещей <b>+$${g.value}</b></div>`,
      `<div class="nr-line bad">♥ Совесть −10</div><div class="nr-line bad">🧽 Чистота −15</div><div class="nr-line">⚡ Выносливость −20</div><h3>Хвосты</h3>${tails}`,
      () => Morning.start(4 * 60 + 30));
  },

  fail(g, why) {
    G.stamina = clamp(G.stamina - 15, 0, 100);
    if (g.trait === 'double' && why === 'woke' && chance(0.45)) {
      Game.ending('death', `Постоялец из номера ${g.room + 1} проснулся раньше. Под подушкой у него лежал револьвер. Он оказался опаснее, чем казался.`);
      return;
    }
    addSuspicion(why === 'woke' ? 12 : 8);
    addRumors(why === 'woke' ? 8 : 5);
    addConscience(-2);
    g.alarm += 60;
    const text = why === 'woke'
      ? `${g.name} проснулся и закричал. Ты едва успел скрыться в темноте.`
      : 'Тебя заметили в коридоре. Пришлось изображать ночной обход.';
    this.report(false, 'Ночь сорвалась', text,
      `<div class="nr-line bad">👁 Подозрения +${why === 'woke' ? 12 : 8}</div><div class="nr-line bad">🗣 Слухи +${why === 'woke' ? 8 : 5}</div><div class="nr-line">♥ Совесть −2</div>`,
      `<div class="nr-line">⚠ Тревога гостя ${g.name}: ${Math.round(g.alarm)}</div><div class="nr-line">⚡ Выносливость −15</div><div class="nr-line muted">Гость может съехать раньше — это поднимет тревогу города.</div>`,
      () => Morning.start(4 * 60));
  }
};

// ---------- стелс-фаза ----------
const Stealth = {
  bg: null, target: null, player: null, npcs: [], beam: null, t: 0, mode: 'walk', strike: null,

  init(target) {
    G.phase = 'stealth';
    this.bg = this.bg || buildMotelBG();
    this.target = target; this.mode = 'walk'; this.t = 0;
    const start = G.upgrades.tunnels ? MOTEL.hatch : MOTEL.start;
    this.player = { x: start.x, y: start.y, dir: 'up', frame: 0, anim: 0 };
    // неспящие постояльцы
    const restless = G.guests.filter(g => g !== target && (g.trait === 'attentive' || g.suspicious > 40 || g.alarm > 40)).length;
    let n = clamp(1 + restless - (hasStaff('caretaker') ? 1 : 0), 0, 3);
    this.npcs = [];
    for (let i = 0; i < n; i++) this.npcs.push({ x: rnd(40, 280), y: rnd(54, 86), dir: chance(0.5) ? 1 : -1, sp: rnd(16, 26), pause: 0, look: randomLook(), frame: 0, anim: 0, vy: chance(0.5) ? 1 : -1 });
    this.flicker = rint(0, 4);
    this.beam = G.suspicion > 40 ? { x: -40, cd: rnd(3, 6), active: false, warn: 0 } : null;
    toast('Подберись к номеру ' + (target.room + 1) + ' и нажми E', 'night');
  },

  update(dt) {
    this.t += dt;
    if (this.mode === 'strike') { this.updateStrike(dt); return; }
    const p = this.player;
    let dx = (Keys.right ? 1 : 0) - (Keys.left ? 1 : 0), dy = (Keys.down ? 1 : 0) - (Keys.up ? 1 : 0);
    if (dx || dy) {
      const l = Math.hypot(dx, dy), sp = 42 * (0.7 + G.stamina / 330);
      let nx = p.x + dx / l * sp * dt, ny = p.y + dy / l * sp * dt;
      // проходы: офис (20–60) и парковка (210–240) соединены с коридором
      if (!this.walkable(nx, ny)) { if (this.walkable(nx, p.y)) ny = p.y; else if (this.walkable(p.x, ny)) nx = p.x; else { nx = p.x; ny = p.y; } }
      p.x = nx; p.y = ny;
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      p.anim += dt; if (p.anim > 0.18) { p.anim = 0; p.frame++; if (p.frame % 2) Sound.sfx('step', { surface: p.y > 104 ? (p.x > 136 ? (Atmos.weather === 'rain' ? 'wet' : 'tile') : 'wood') : 'carpet' }); }
    } else p.frame = 0;

    // неспящие гуляют по коридору
    this.npcs.forEach(n => {
      if (n.pause > 0) { n.pause -= dt; if (n.pause <= 0 && chance(0.5)) n.dir *= -1; n.frame = 0; }
      else {
        n.x += n.dir * n.sp * dt; n.y += n.vy * 4 * dt;
        if (n.y < 52 || n.y > 90) n.vy *= -1;
        if (n.x < 16 || n.x > 304) { n.dir *= -1; n.x = clamp(n.x, 16, 304); }
        if (chance(dt * 0.25)) n.pause = rnd(1, 2.5);
        n.anim += dt; if (n.anim > 0.2) { n.anim = 0; n.frame++; }
      }
      if (this.seen(n, p)) { this.caught(); }
    });
    // фары патрульной машины
    if (this.beam) {
      const b = this.beam;
      if (!b.active) { b.cd -= dt; if (b.cd < 1 && b.cd > 0) b.warn = 1; if (b.cd <= 0) { b.active = true; b.x = -30; b.warn = 0; } }
      else {
        b.x += 120 * dt;
        if (p.y < 98 && Math.abs(p.x - b.x) < 12) this.caught();
        if (b.x > W + 30) { b.active = false; b.cd = rnd(5, 9); }
      }
    }
    if (this.mode !== 'walk') return;
    const door = MOTEL.doors[this.target.room];
    const near = Math.abs(p.x - door.x) < 10 && p.y < 54;
    const nearExit = dist(p, MOTEL.start) < 12 && !G.upgrades.tunnels || (G.upgrades.tunnels && dist(p, MOTEL.hatch) < 10);
    prompt(near ? 'E — войти в номер ' + (this.target.room + 1) : nearExit ? 'E — отказаться и вернуться' : '');
    if (consumeAct()) {
      if (near) this.startStrike();
      else if (nearExit) { prompt(''); G.stamina = clamp(G.stamina - 5, 0, 100); toast('Ты передумал и вернулся в постель', 'night'); Morning.start(3 * 60 + 30); }
    }
  },

  walkable(x, y) {
    if (x < 6 || x > 314 || y > 176) return false;
    if (y >= 46 && y <= 94) return true;               // коридор
    if (y > 94 && y < 108) return (x > 22 && x < 58) || (x > 212 && x < 238); // проходы
    if (y >= 108) return x < 124 || x > 136;            // офис и парковка
    return false;
  },

  visLen() { return Atmos.weather === 'fog' ? 44 : 58; },

  seen(n, p) {
    const dx = p.x - n.x, dy = p.y - n.y, d = Math.hypot(dx, dy);
    if (d < 10) return true;
    if (d > this.visLen()) return false;
    const a = Math.atan2(dy, dx), f = n.dir > 0 ? 0 : Math.PI;
    let diff = Math.abs(((a - f) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    return diff < 0.45 && n.pause <= 0 || diff < 0.3;
  },

  caught() {
    if (this.mode !== 'walk') return;
    this.mode = 'done'; prompt('');
    Sound.sfx('caught');
    Night.fail(this.target, 'seen');
  },

  // ---------- мини-игра тайминга ----------
  startStrike() {
    prompt('');
    const g = this.target;
    const zone = clamp(44 + (Atmos.weather === 'rain' ? 6 : 0) + G.upgrades.soundproof * 10 + buildOf(g).zone - g.suspicious / 6 - (g.trait === 'double' ? 12 : 0) - (100 - G.stamina) / 10, 14, 80);
    this.mode = 'strike';
    this.strike = { pos: 0, dir: 1, speed: 140, hits: 0, misses: 0, zone, zx: rnd(20, 180 - zone), flash: 0 };
    toast('ПРОБЕЛ — когда метка в зелёной зоне. Три попадания.', 'night');
  },
  updateStrike(dt) {
    const s = this.strike;
    s.pos += s.dir * s.speed * dt;
    if (s.pos < 0) { s.pos = 0; s.dir = 1; }
    if (s.pos > 200) { s.pos = 200; s.dir = -1; }
    if (s.flash > 0) s.flash -= dt;
    if (consumeSpace() || consumeAct()) {
      if (s.pos >= s.zx && s.pos <= s.zx + s.zone) {
        s.hits++; s.flash = 0.25; Sound.sfx('hit'); s.speed += 45; s.zone = Math.max(12, s.zone - 6); s.zx = rnd(10, 190 - s.zone);
        if (s.hits >= 3) { this.mode = 'done'; Sound.sfx('kill'); Night.success(this.target); }
      } else {
        s.misses++; s.flash = -0.3; Sound.sfx('creak');
        this.target.alarm += 20;
        if (s.misses >= 2) { this.mode = 'done'; Sound.sfx('caught'); Night.fail(this.target, 'woke'); }
        else toast('Скрипнула половица…', 'bad');
      }
    }
  },

  draw(ctx, t) {
    ctx.drawImage(this.bg, 0, 0);
    const p = this.player, door = MOTEL.doors[this.target.room], TX = door.x * S;
    // свет из-под дверей тех, кто не спит
    G.guests.forEach(g => { if (g.alarm > 30 || g.suspicious > 45) { const X = MOTEL.doors[g.room].x * S; R(ctx, X - 14, 82, 28, 2, '#ffd27a'); } });
    if (G.upgrades.tunnels) {
      const X = px(MOTEL.hatch.x), Y = px(MOTEL.hatch.y);
      R(ctx, X - 13, Y - 8, 26, 16, '#2a1810'); R(ctx, X - 12, Y - 7, 24, 14, '#6a4228');
      for (let i = -10; i < 12; i += 6) R(ctx, X + i, Y - 7, 1, 14, '#4a2c1a');
      R(ctx, X - 2, Y - 1, 4, 2, '#a8acb6');
    }
    Atmos.drawPuddles(ctx, t, neonOn(t));
    G.guests.forEach(g => { if (g.car) { const sp = MOTEL.carSpot(g.room); drawCar(ctx, sp.x, sp.y, g.car); } });
    drawLampPost(ctx);
    SUN_DX = 2;
    const actors = this.npcs.map(n => ({ y: n.y, f: () => drawChar(ctx, n.x, n.y, n.look, n.dir > 0 ? 'right' : 'left', n.frame) }));
    actors.push({ y: p.y, f: () => drawChar(ctx, p.x, p.y, NIGHT_LOOK, p.dir, p.frame) });
    actors.sort((a, b) => a.y - b.y).forEach(a => a.f());
    if (G.conscience < 40 && Math.sin(t * 1.3) > 0.9) drawChar(ctx, 300 - (t * 20 % 280), 60, GHOST_LOOK, 'left', Math.floor(t * 4), { alpha: 0.3 });

    // ночное освещение
    Light.begin('#05051a', 0.9);
    Light.hole(px(p.x), px(p.y) - 14, 80, 1);
    const flick = i => i === this.flicker ? (Math.random() < 0.15 ? 0.05 : 0.5) : 0.5;
    MOTEL.lamps.forEach(([X, Y], i) => { if (i < 5) Light.hole(X, Y + 24, 44, flick(i)); });
    Light.hole(TX, 54, 34, 0.55 + Math.sin(t * 4) * 0.1);
    Light.hole(201, 222, 56, 0.8); Light.hole(40, 312, 34, 0.45 + Math.random() * 0.1);
    Light.hole(300, 300, 96, 0.85); Light.hole(578, 230, 90, 0.7);
    this.npcs.forEach(n => {
      Light.cone(px(n.x), px(n.y) - 16, n.dir > 0 ? 0 : Math.PI, this.visLen() * S, 0.45, 0.85);
      if (G.upgrades.cameras) Light.hole(px(n.x), px(n.y) - 16, 26, 0.9);
    });
    if (this.beam && this.beam.active) Light.rect(px(this.beam.x) - 24, 0, 48, 196, 0.9);
    Light.end(ctx);

    MOTEL.lamps.forEach(([X, Y], i) => { if (i < 5 && flick(i) > 0.1) glow(ctx, X, Y, 20, 'rgba(255,210,140,A)', 0.3); });
    glow(ctx, 201, 214, 24, 'rgba(160,255,170,A)', 0.2);
    glow(ctx, 300, 240, 30, 'rgba(255,240,180,A)', 0.4);
    drawSign(ctx, t);
    Atmos.drawMoths(ctx, 300, 244);
    Atmos.drawRain(ctx, OUTDOOR); Atmos.drawRainVeil(ctx, OUTDOOR);
    Atmos.drawFog(ctx, t, 0.9);
    this.npcs.forEach(n => {
      const f = n.dir > 0 ? 0 : Math.PI, X = px(n.x), Y = px(n.y) - 16;
      ctx.fillStyle = 'rgba(255,240,170,0.1)'; ctx.beginPath(); ctx.moveTo(X, Y); ctx.arc(X, Y, this.visLen() * S, f - 0.45, f + 0.45); ctx.closePath(); ctx.fill();
      R(ctx, X + (n.dir > 0 ? 4 : -8), Y + 2, 4, 2, '#fff8c0');
    });
    if (this.beam && this.beam.active) { ctx.fillStyle = 'rgba(180,200,255,0.12)'; ctx.fillRect(px(this.beam.x) - 24, 0, 48, 196); }
    if (this.beam && this.beam.warn) { ctx.fillStyle = (t * 6 | 0) % 2 ? 'rgba(255,40,40,.3)' : 'rgba(40,90,255,.3)'; ctx.fillRect(0, 0, 10, PH); ctx.fillRect(PW - 10, 0, 10, PH); }
    // опасность рядом: пульс
    let danger = this.beam && this.beam.warn ? 0.6 : 0;
    this.npcs.forEach(n => { danger = Math.max(danger, clamp(1 - (dist(n, p) - 12) / 50, 0, 1)); });
    Atmos.drawFlash(ctx);
    Atmos.vignette(ctx, 0.5);
    Atmos.pulse(ctx, danger);
    Sound.danger = this.mode === 'walk' ? danger : 0;
    Atmos.grain(ctx, 0.08);
    // маркер цели
    const by = 12 + Math.round(Math.sin(t * 5) * 2);
    R(ctx, TX - 4, by, 9, 2, '#22141c'); R(ctx, TX - 3, by + 2, 7, 2, '#22141c'); R(ctx, TX - 2, by + 4, 5, 2, '#22141c');
    R(ctx, TX - 3, by, 7, 1, '#ff6a6a'); R(ctx, TX - 2, by + 2, 5, 1, '#e04a4a'); R(ctx, TX - 1, by + 4, 3, 1, '#c03030');

    if (this.mode === 'strike') {
      const s = this.strike, X0 = 120, Y0 = 290;
      R(ctx, 98, 258, 444, 72, '#22141c'); R(ctx, 100, 260, 440, 68, '#3a2430'); R(ctx, 100, 260, 440, 2, '#5a3a48');
      pText(ctx, 'SPACE', 320 - pTextW('SPACE', 2) / 2, 268, '#e8d8c8', 2, '#22141c');
      R(ctx, X0 - 2, Y0 - 2, 404, 18, '#22141c'); R(ctx, X0, Y0, 400, 14, '#5a1e24');
      for (let i = X0; i < X0 + 400; i += 8) R(ctx, i, Y0, 1, 14, '#4a161c');
      R(ctx, X0 + s.zx * 2, Y0, s.zone * 2, 14, '#4f9a40'); R(ctx, X0 + s.zx * 2, Y0, s.zone * 2, 2, '#7ac860');
      const mx = X0 + Math.round(s.pos * 2), mc = s.flash > 0 ? '#ffffff' : s.flash < 0 ? '#ff4a4a' : '#ffd040';
      R(ctx, mx - 3, Y0 - 6, 7, 26, '#22141c'); R(ctx, mx - 2, Y0 - 5, 5, 24, mc);
      for (let i = 0; i < 3; i++) { const X = 450 + i * 22, hit = i < s.hits; R(ctx, X, 268, 8, 10, '#22141c'); R(ctx, X + 1, 269, 6, 8, hit ? '#c02020' : '#5a4a50'); R(ctx, X + 2, 266, 4, 3, hit ? '#c02020' : '#5a4a50'); }
      for (let i = 0; i < 2; i++) { const X = 112 + i * 16; R(ctx, X, 268, 12, 10, '#22141c'); R(ctx, X + 1, 269, 10, 8, i < s.misses ? '#f0a030' : '#4a3a40'); }
    }
  }
};
