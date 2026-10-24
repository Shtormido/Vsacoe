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

  menu() {
    const cards = G.guests.map(g => {
      const b = buildOf(g);
      const trait = g.trait && g.revealed ? `<span class="tag warn">${TRAITS[g.trait].name}</span>` : g.revealed ? '<span class="tag">Обычный</span>' : '<span class="tag">Секреты: ?</span>';
      return `<div class="card"><h4>№${g.room + 1} · ${g.name}</h4>
        <div class="row">Возраст: ${g.age} · Телосложение: ${b.name}</div>
        <div class="row">Подозрительность: ${g.suspicious} · Ценность: ~$${g.value}</div>
        <div class="row">Тревога гостя: ${Math.round(g.alarm)}</div>
        <div>${trait}${g.pet ? `<span class="tag">🐾 ${g.pet}</span>` : ''}${g.car ? '<span class="tag">🚗 машина</span>' : ''}</div>
        <div class="btns">
          <button class="b danger" data-a="target" data-v="${g.id}" ${G.stamina < 15 ? 'disabled' : ''}>Заготовка</button>
          ${g.pet ? `<button class="b" data-a="pet" data-v="${g.id}">Забрать питомца</button>` : ''}
        </div></div>`;
    }).join('') || '<p class="muted">Мотель пуст. Ни одного постояльца.</p>';
    const hall = G.conscience < 40 ? '<p class="bad">В коридоре кто-то шепчет твоё имя. Там никого нет.</p>' : '';
    UI.open(`<h2>02:00 — Тихая ночная смена</h2>
      <p>Ты просыпаешься. Мотель спит. Особого ресурса в запасе: <b>${G.stock.special}</b>. Выносливость: <b>${Math.round(G.stamina)}</b>.</p>${hall}
      <div class="cards">${cards}</div>
      <div class="btns"><button class="b primary" data-a="sleep">Спать до утра (+выносливость)</button></div>`,
      {
        target: id => { UI.close(); Stealth.init(G.guests.find(g => g.id == id)); },
        pet: id => this.takePet(G.guests.find(g => g.id == id)),
        sleep: () => { UI.close(); G.stamina = clamp(G.stamina + 35, 0, 100); G.stress = clamp(G.stress - 15, 0, 100); toast('Ты проспал до семи утра', 'night'); Morning.start(7 * 60); }
      });
  },

  takePet(g) {
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
    UI.choice('Заготовка завершена', `<p>Номер ${g.room + 1} затих. Добыто особого ресурса: <b>${y}</b>. В вещах нашлось <b>$${g.value}</b>.</p>
      <p class="muted">Остались «хвосты»: запись в журнале, вещи${g.car ? ', машина на парковке' : ''}, следы в номере. Утром нужно привести бумаги в порядок.</p>`,
      [{ t: 'Вернуться в постель', cls: 'primary', fn: () => Morning.start(4 * 60 + 30) }]);
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
    UI.choice('Ночь сорвалась', `<p class="bad">${text}</p>`, [{ t: 'Вернуться в постель', fn: () => Morning.start(4 * 60) }]);
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
      p.anim += dt; if (p.anim > 0.18) { p.anim = 0; p.frame++; }
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

  seen(n, p) {
    const dx = p.x - n.x, dy = p.y - n.y, d = Math.hypot(dx, dy);
    if (d < 10) return true;
    if (d > 58) return false;
    const a = Math.atan2(dy, dx), f = n.dir > 0 ? 0 : Math.PI;
    let diff = Math.abs(((a - f) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    return diff < 0.45 && n.pause <= 0 || diff < 0.3;
  },

  caught() {
    if (this.mode !== 'walk') return;
    this.mode = 'done'; prompt('');
    Night.fail(this.target, 'seen');
  },

  // ---------- мини-игра тайминга ----------
  startStrike() {
    prompt('');
    const g = this.target;
    const zone = clamp(44 + G.upgrades.soundproof * 10 + buildOf(g).zone - g.suspicious / 6 - (g.trait === 'double' ? 12 : 0) - (100 - G.stamina) / 10, 14, 80);
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
        s.hits++; s.flash = 0.25; s.speed += 45; s.zone = Math.max(12, s.zone - 6); s.zx = rnd(10, 190 - s.zone);
        if (s.hits >= 3) { this.mode = 'done'; Night.success(this.target); }
      } else {
        s.misses++; s.flash = -0.3;
        this.target.alarm += 20;
        if (s.misses >= 2) { this.mode = 'done'; Night.fail(this.target, 'woke'); }
        else toast('Скрипнула половица…', 'bad');
      }
    }
  },

  draw(ctx, t) {
    ctx.drawImage(this.bg, 0, 0);
    G.guests.forEach(g => { if (g.car) drawCar(ctx, 140 + g.room * 29 % 150, 150 + (g.room % 2) * 4, g.car); });
    drawSign(ctx, t);
    const door = MOTEL.doors[this.target.room];
    R(ctx, door.x - 8, 12, 16, 1, '#e8a33d');
    if (G.upgrades.tunnels) { R(ctx, MOTEL.hatch.x - 6, MOTEL.hatch.y - 3, 12, 6, '#2a1a12'); R(ctx, MOTEL.hatch.x - 5, MOTEL.hatch.y - 2, 10, 1, '#5a3a22'); }
    this.npcs.forEach(n => drawChar(ctx, n.x, n.y, n.look, n.dir > 0 ? 'right' : 'left', n.frame));
    const p = this.player;
    drawChar(ctx, p.x, p.y, { skin: '#f1c27d', hair: '#3a2a1a', shirt: '#2a2a3a', pants: '#1a1a22' }, p.dir, p.frame);

    // темнота с кругом света вокруг игрока и фонарями неспящих
    const dark = this.dark || (this.dark = document.createElement('canvas'));
    dark.width = W; dark.height = H;
    const d = dark.getContext('2d');
    d.fillStyle = 'rgba(5,5,20,0.88)'; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => { const gr = d.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = gr; d.beginPath(); d.arc(x, y, r, 0, 7); d.fill(); };
    hole(p.x, p.y - 8, 44);
    hole(door.x, 30, 18);
    hole(292, 112, 26);
    this.npcs.forEach(n => {
      d.fillStyle = 'rgba(0,0,0,0.85)'; d.beginPath();
      const f = n.dir > 0 ? 0 : Math.PI;
      d.moveTo(n.x, n.y - 8); d.arc(n.x, n.y - 8, 58, f - 0.45, f + 0.45); d.closePath(); d.fill();
      if (G.upgrades.cameras) hole(n.x, n.y - 8, 14);
    });
    if (this.beam && this.beam.active) { d.fillStyle = 'rgba(0,0,0,0.9)'; d.fillRect(this.beam.x - 12, 0, 24, 98); }
    d.globalCompositeOperation = 'source-over';
    ctx.drawImage(dark, 0, 0);
    this.npcs.forEach(n => {
      ctx.fillStyle = 'rgba(255,240,170,0.12)'; ctx.beginPath();
      const f = n.dir > 0 ? 0 : Math.PI;
      ctx.moveTo(n.x, n.y - 8); ctx.arc(n.x, n.y - 8, 58, f - 0.45, f + 0.45); ctx.closePath(); ctx.fill();
    });
    if (this.beam && this.beam.active) { ctx.fillStyle = 'rgba(180,200,255,0.15)'; ctx.fillRect(this.beam.x - 12, 0, 24, 98); }
    if (this.beam && this.beam.warn) { ctx.fillStyle = (t * 6 | 0) % 2 ? 'rgba(255,0,0,.25)' : 'rgba(0,80,255,.25)'; ctx.fillRect(0, 0, 8, H); }
    if (G.conscience < 40 && Math.sin(t * 1.3) > 0.9) drawChar(ctx, 300 - (t * 20 % 280), 60, { skin: '#ddd', hair: '#ddd', shirt: '#ccc', pants: '#bbb' }, 'left', 0, { alpha: 0.25 });

    if (this.mode === 'strike') {
      const s = this.strike;
      R(ctx, 50, 130, 220, 34, 'rgba(0,0,0,.85)');
      R(ctx, 60, 142, 200, 10, '#3a1a1a');
      R(ctx, 60 + s.zx, 142, s.zone, 10, '#3f8a35');
      R(ctx, 60 + s.pos - 1, 138, 3, 18, s.flash > 0 ? '#fff' : s.flash < 0 ? '#d6453d' : '#e8a33d');
      for (let i = 0; i < 3; i++) R(ctx, 140 + i * 14, 133, 10, 4, i < s.hits ? '#d6453d' : '#555');
      for (let i = 0; i < 2; i++) R(ctx, 64 + i * 8, 133, 5, 4, i < s.misses ? '#e8a33d' : '#333');
    }
  }
};
