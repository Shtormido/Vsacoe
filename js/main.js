// Главный цикл, смена фаз, концовки
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const ENDINGS = {
  legend:     { title: 'Легенда, о которой никто не узнал', cls: 'good' },
  prison:     { title: 'Тюрьма', cls: 'bad' },
  flee:       { title: 'Продал всё и скрылся', cls: '' },
  conscience: { title: 'Закрыто по совести', cls: '' },
  death:      { title: 'Гость оказался опаснее', cls: 'bad' }
};

const Game = {
  motelBG: null,
  last: 0,

  init() {
    newGame();
    Atmos.init();
    this.fit();
    window.addEventListener('resize', () => this.fit());
    this.title();
    requestAnimationFrame(t => this.loop(t));
  },

  fit() {
    const st = document.getElementById('stage');
    const s = Math.min(st.clientWidth / PW, st.clientHeight / PH);
    const k = s >= 2 ? Math.floor(s) : s >= 1 ? Math.floor(s * 2) / 2 : s;
    canvas.style.width = Math.floor(PW * k) + 'px'; canvas.style.height = Math.floor(PH * k) + 'px';
  },

  title() {
    G.phase = 'title';
    Atmos.setWeather('rain');
    const saved = loadSave();
    UI.open(`<div class="title-screen"><h1>ПРИДОРОЖНЫЙ<br>МОТЕЛЬ</h1>
      <p>Хоррор-кулинарный симулятор с чёрным юмором.</p>
      <p class="muted">Днём ты повар закусочной при мотеле. Ночью — заготавливаешь особый ресурс.</p></div>
      <div class="help">
        <h3>Как играть</h3>
        <p>• <b>WASD / стрелки</b> — ходить, <b>E</b> — действие, <b>Пробел</b> — удар в ночной мини-игре, <b>Esc</b> — закрыть окно.</p>
        <p>• <b>08:00–00:00</b> — закусочная: готовь у гриля, вертела, фритюра, наливай напитки и подавай клиентам у стойки. Мясо выбираешь сам: обычное, животных или особое — и сам решаешь, кому его подать.</p>
        <p>• <b>00:00–02:00</b> — сон. От него зависят выносливость и твёрдость рук.</p>
        <p>• <b>02:00</b> — ночная смена: выбери постояльца, проберись мимо неспящих и фар патруля, попади в ритм.</p>
        <p>• <b>Утро</b> — приведи бумаги в порядок: журнал, вещи, машины, следы. Закупки, ремонт, подкуп, персонал.</p>
        <p>• Следи за <b>подозрениями города</b>, <b>чистотой мотеля</b> и <b>совестью</b>. Концовок — пять.</p>
      </div>
      <div class="btns" style="justify-content:center">
        <button class="b primary" data-a="new">Новая игра</button>
        ${saved ? `<button class="b" data-a="cont">Продолжить (день ${saved.day})</button>` : ''}
      </div>`, {
      new: () => { clearSave(); newGame(); UI.close(); this.startDay(true); },
      cont: () => { G = saved; UI.close(); G.phase = 'morning'; Morning.report = ['Игра загружена.']; Morning.tab = 'overview'; Morning.render(); }
    });
  },

  startDay(first) {
    // незакрытые хвосты бьют по подозрениям и чистоте
    if (!first && G.tails.length) {
      G.tails.forEach(t => {
        addSuspicion(t.bad ? 6 : 3);
        if (t.type === 'blood') addClean(-5);
        if (t.type === 'car' || t.type === 'items') addClean(-2);
      });
      toast(`Незакрытые следы (${G.tails.length}) подогревают подозрения`, 'bad');
    }
    if (G.flags.demand) Staff.refuse(false);
    if (G.phase === 'ending') return;
    if (G.suspicion >= 100) { this.ending('prison', 'Слишком много несостыковок. Шериф приехал прямо к открытию.'); return; }
    G.phase = 'day';
    G.time = OPEN_TIME;
    Kitchen.startDay();
    toast(`День ${G.day}. Закусочная открыта!`, 'good');
    if (first) {
      setTimeout(() => toast('Подойди к станции вверху и нажми E, чтобы готовить'), 1200);
      setTimeout(() => toast('Готовое неси к клиентам у стойки (внизу кухни)'), 3500);
      setTimeout(() => toast('Доска заказов покажет, кто насколько внимателен'), 6000);
    }
  },

  endDay() {
    if (G.phase !== 'day') return;
    G.phase = 'sleep';
    prompt('');
    const left = Kitchen.customers.filter(c => c.state === 'wait').length;
    if (left) { addRep(-left * 0.5); }
    Kitchen.customers = []; Kitchen.tray = [];
    G.time = CLOSE_TIME;
    // короткий сон до 02:00
    let rest = 30;
    const dreams = [];
    if (G.conscience < 50) { rest -= 10; dreams.push('Снились лица постояльцев. Они стучали в дверь кухни.'); }
    if (G.stress > 50) { rest -= 8; dreams.push('Ты ворочался до самого будильника.'); }
    if (G.suspicion > 60) { rest -= 5; dreams.push('Во сне выли сирены.'); }
    G.stamina = clamp(G.stamina + rest, 0, 100);
    G.stress = clamp(G.stress - 12, 0, 100);
    const d = G.dayLog;
    UI.choice('00:00 — Закусочная закрыта', `
      <p>Обслужено: <b>${d.served}</b> · Ушли злыми: <b>${d.angry}</b> · Выручка: <b>$${d.earned}</b> · Блюд из особого ресурса: <b>${d.special || 0}</b></p>
      <p>Ты запираешь дверь и ложишься спать до двух ночи.</p>
      ${dreams.length ? `<p class="bad">${dreams.join(' ')}</p>` : '<p class="muted">Сон был коротким, но крепким.</p>'}
      <p>Выносливость: <b>${Math.round(G.stamina)}</b></p>`,
      [{ t: '02:00 — проснуться', cls: 'primary', fn: () => { G.time = WAKE_TIME; Night.start(); } }]);
  },

  ending(type, text) {
    G.phase = 'ending';
    prompt('');
    clearSave();
    const e = ENDINGS[type];
    UI.open(`<div class="title-screen"><h1 class="${e.cls}" style="font-size:16px">${e.title}</h1></div>
      <p>${text}</p>
      <h3>Итоги</h3>
      <div class="stats">
        <div>Дней: <b>${G.day}</b></div><div>Обслужено: <b>${G.stats.served}</b></div>
        <div>Заработано: <b>$${Math.floor(G.stats.earned)}</b></div><div>Особых блюд: <b>${G.stats.specialServed}</b></div>
        <div>Ночных заготовок: <b>${G.stats.kills}</b></div><div>Ресторан: <b>${tierOf(REP_TIERS, G.rep)}</b></div>
        <div>Мотель: <b>${tierOf(MOTEL_TIERS, G.rumors)}</b></div><div>Совесть: <b>${Math.round(G.conscience)}</b></div>
      </div>
      <div class="btns"><button class="b primary" data-a="again">Сыграть снова</button></div>`,
      { again: () => { UI.close(); newGame(); this.title(); } });
    updateHUD();
  },

  update(dt) {
    if (UI.isOpen()) return;
    if (G.phase === 'day') {
      G.time += dt * MINUTES_PER_SEC;
      G.stamina = clamp(G.stamina - dt * MINUTES_PER_SEC / 60 * 1.3, 0, 100);
      Kitchen.update(dt);
      if (G.time >= CLOSE_TIME && G.phase === 'day') this.endDay();
    } else if (G.phase === 'stealth') {
      Stealth.update(dt);
    }
  },

  draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (Atmos.shake > 0) ctx.translate(rint(-2, 2), rint(-1, 1));
    if (G.phase === 'day' && G.stamina < 25 && !UI.isOpen()) ctx.translate(rint(-1, 1) * (Math.random() < 0.3 ? S : 0), 0);
    if (G.phase === 'day') { Kitchen.draw(ctx, t); return; }
    if (G.phase === 'stealth') { Stealth.draw(ctx, t); return; }
    // фон для меню: мотель ночью или на рассвете
    this.motelBG = this.motelBG || buildMotelBG();
    ctx.drawImage(this.motelBG, 0, 0);
    const night = G.phase !== 'morning';
    if (night) Atmos.drawPuddles(ctx, t, neonOn(t));
    G.guests.forEach(g => { if (g.car) { const sp = MOTEL.carSpot(g.room); drawCar(ctx, sp.x, sp.y, g.car); } });
    drawLampPost(ctx);
    if (night) {
      Light.begin('#05051a', 0.82);
      MOTEL.lamps.forEach(([X, Y], i) => { if (i < 5) Light.hole(X, Y + 24, 44, 0.5); });
      Light.hole(201, 222, 56, 0.8); Light.hole(300, 300, 96, 0.85); Light.hole(578, 230, 90, 0.7);
      Light.end(ctx);
      glow(ctx, 300, 240, 30, 'rgba(255,240,180,A)', 0.4);
      drawSign(ctx, t);
      Atmos.drawMoths(ctx, 300, 244);
      Atmos.drawRain(ctx, OUTDOOR); Atmos.drawRainVeil(ctx, OUTDOOR);
      Atmos.drawFog(ctx, t, 0.8);
      Atmos.drawFlash(ctx);
      Atmos.vignette(ctx, 0.55);
    } else {
      // рассвет: тёплый свет сверху, холодные тени снизу, утренняя дымка
      const g = ctx.createLinearGradient(0, 0, 0, PH);
      g.addColorStop(0, 'rgba(255,170,110,0.28)'); g.addColorStop(1, 'rgba(70,80,140,0.22)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
      glow(ctx, 520, 300, 220, 'rgba(255,190,120,A)', 0.18);
      drawSign(ctx, t);
      Atmos.drawFog(ctx, t, 0.7);
      Atmos.vignette(ctx, 0.35);
    }
    Atmos.grain(ctx, 0.07);
  },

  loop(ts) {
    const t = ts / 1000;
    const dt = Math.min(0.05, t - (this.last || t));
    this.last = t;
    this.update(dt);
    Atmos.update(dt, OUTDOOR);
    this.draw(t);
    updateHUD();
    requestAnimationFrame(x => this.loop(x));
  }
};

Game.init();
