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
    Sound.loadPrefs(); updateSoundBtn();
    document.getElementById('sound-btn').addEventListener('click', () => { Sound.unlock(); Sound.toggleMute(); });
    document.getElementById('journal-btn').addEventListener('click', () => this.journal());
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
    const key = k => `<span class="keycap">${k}</span>`;
    UI.open(`<div class="title-screen">
        <div class="logo"><span class="l1">ПРИДОРОЖНЫЙ</span><span class="l2">МОТЕЛЬ</span><span class="l3">хоррор-кулинарный симулятор</span></div>
        <p class="sound-hint">🔊 Включи звук — у каждой фазы своя музыка</p>
        <p class="ver">версия ${GAME_VERSION}</p>
      </div>
      <div class="cycle">
        <div class="cy c-day"><i>☀</i><b>08:00–00:00</b><span>Закусочная: принимай заказы, готовь на гриле, вертеле, фритюре. Мясо выбираешь сам — и кому его подать.</span></div>
        <div class="cy c-sleep"><i>🌙</i><b>00:00–02:00</b><span>Короткий сон. От него — выносливость и твёрдость рук.</span></div>
        <div class="cy c-night"><i>🔪</i><b>02:00</b><span>Ночная смена: выбери постояльца, прокрадись мимо неспящих, попади в ритм.</span></div>
        <div class="cy c-morning"><i>📁</i><b>Утро</b><span>Бумаги и следы, закупки, ремонт, подкуп, персонал.</span></div>
      </div>
      <div class="controls">${key('W A S D')} ходить · ${key('E')} действие · ${key('Пробел')} удар · ${key('J')} журнал · ${key('Esc')} закрыть · ${key('M')} звук</div>
      <div class="btns title-btns">
        <button class="b primary big" data-a="new">▶ Новая игра</button>
        ${saved ? `<button class="b big" data-a="cont">Продолжить · день ${saved.day}</button>` : ''}
      </div>`, {
      new: () => { clearSave(); newGame(); UI.close(); this.startDay(true); },
      cont: () => { G = saved; UI.close(); G.phase = 'morning'; Morning.report = ['Игра загружена.']; Morning.tab = 'overview'; Morning.render(); }
    }, { cls: 'm-title' });
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
    Atmos.setWeather('clear');
    Kitchen.startDay();
    toast(`День ${G.day}. Закусочная открыта!`, 'good');
    Sound.sfx('dayStart');
    if (first) {
      setTimeout(() => toast('Подойди к станции вверху и нажми E, чтобы готовить'), 1200);
      setTimeout(() => toast('Готовое неси к клиентам у стойки (внизу кухни)'), 3500);
      setTimeout(() => toast('Доска заказов покажет, кто насколько внимателен'), 6000);
    }
  },

  endDay() {
    if (G.phase !== 'day') return;
    G.phase = 'sleep';
    Sound.sfx('close');
    prompt('');
    const left = Kitchen.customers.filter(c => c.state === 'wait' || c.state === 'order').length;
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
    const d = G.dayLog, dRep = G.rep - (d.repStart ?? G.rep), line = (k, v, cls = '') => `<div class="rc-line ${cls}"><span>${k}</span><i></i><b>${v}</b></div>`;
    UI.open(`<div class="close-day">
      <div class="receipt">
        <div class="rc-head">ЗАКУСОЧНАЯ «ПРИДОРОЖНЫЙ»<br><span>день ${G.day} · касса №1</span></div>
        ${line('Обслужено', d.served)}${line('Ушли злыми', d.angry, d.angry ? 'bad' : '')}${line('Блюд из особого', d.special || 0, d.special ? 'blood' : '')}
        ${line('Репутация', (dRep >= 0 ? '+' : '') + dRep.toFixed(1), dRep < 0 ? 'bad' : 'good')}
        <div class="rc-total">${line('ИТОГО', '$' + d.earned)}</div>
        <div class="rc-foot">СПАСИБО ЗА ВИЗИТ! ★ ПРИХОДИТЕ ЕЩЁ</div>
      </div>
      <div class="sleep-card">
        <h2>00:00 — отбой</h2>
        <p>Ты запираешь дверь и ложишься до двух ночи.</p>
        ${meter(G.stamina, 100, goodCls(G.stamina), '⚡ выносливость', '+' + rest + ' → ' + Math.round(G.stamina))}
        <div class="dreams">${dreams.length ? dreams.map(t => `<p class="bad">💭 ${t}</p>`).join('') : '<p class="muted">💤 Сон короткий, но крепкий.</p>'}</div>
        <div class="small muted">База +30 · совесть &lt; 50: −10 · стресс &gt; 50: −8 · подозрения &gt; 60: −5</div>
        <div class="btns"><button class="b primary" data-a="go">⏰ 02:00 — проснуться</button></div>
      </div></div>`, { go: () => { UI.close(); G.time = WAKE_TIME; Night.start(); } }, { cls: 'm-close' });
  },

  ending(type, text) {
    G.phase = 'ending';
    Sound.sfx({ prison: 'end_prison', death: 'end_death', legend: 'end_good', flee: 'end_good', conscience: 'end_soft' }[type]);
    prompt('');
    clearSave();
    const e = ENDINGS[type];
    const heads = { legend: 'ЗАКУСОЧНАЯ-ЛЕГЕНДА СМЕНИЛА ХОЗЯИНА', prison: 'ХОЗЯИН МОТЕЛЯ АРЕСТОВАН', flee: 'ВЛАДЕЛЕЦ МОТЕЛЯ ИСЧЕЗ', conscience: 'МОТЕЛЬ НА ШОССЕ ЗАКРЫЛСЯ', death: 'ТРАГЕДИЯ В ПРИДОРОЖНОМ МОТЕЛЕ' };
    UI.open(`<div class="paper-news ending e-${type}">
      <div class="masthead">ВЕСТНИК ШОССЕ <span>экстренный выпуск · день ${G.day}</span></div>
      <div class="headline">${heads[type]}</div>
      <div class="end-title">${stamp(e.title.toUpperCase(), e.cls || 'gold')}</div>
      <p class="tw lead">${text}</p>
      <div class="end-stats">
        ${kv('Дней', G.day)}${kv('Обслужено', G.stats.served)}${kv('Заработано', '$' + Math.floor(G.stats.earned))}${kv('Особых блюд', G.stats.specialServed)}
        ${kv('Ночных заготовок', G.stats.kills)}${kv('Ресторан', tierOf(REP_TIERS, G.rep))}${kv('Мотель', tierOf(MOTEL_TIERS, G.rumors))}${kv('Совесть', Math.round(G.conscience))}
      </div>
      <div class="btns"><button class="b primary big" data-a="again">↺ Сыграть снова</button></div></div>`,
      { again: () => { UI.close(); newGame(); this.title(); } }, { cls: 'm-ending' });
    updateHUD();
  },

  // журнал: все механики и текущие множители
  journal() {
    if (UI.isOpen() || !['day', 'morning'].includes(G.phase)) return;
    const st = G.stamina, mul = 1 + (100 - st) / 120, err = Kitchen.errorChance();
    const next = REP_TIERS.find(t => t[0] > G.rep);
    const sec = (ico, title, body) => `<div class="jsec"><h3>${ico} ${title}</h3>${body}</div>`;
    UI.open(`${menuHead('<div class="st-badge st-journal"></div>', 'Журнал', 'Как устроены механики и что на тебя сейчас влияет')}
      <div class="jgrid">
        ${sec('⚡', 'Выносливость ' + Math.round(st), `${meter(st, 100, goodCls(st))}${kv('Время готовки', '×' + mul.toFixed(2))}${kv('Шанс ошибки', pct(err), err > 0.1 ? 'bad' : '')}${kv('Скорость ходьбы', '×' + (0.6 + st / 250).toFixed(2))}${kv('Окно удара ночью', '−' + Math.round((100 - st) / 10))}<div class="small">Днём −1.3 в час. Сон до 02:00: +30, до утра: +35.</div>`)}
        ${sec('⭐', 'Репутация', `${meter(G.rep, 100, 'gold', tierOf(REP_TIERS, G.rep), Math.round(G.rep))}${next ? kv('До «' + next[1] + '»', Math.ceil(next[0] - G.rep)) : kv('Статус', 'вершина')}<div class="small">Растёт от качества блюд, падает от злых и ушедших клиентов. Выше репутация — чаще клиенты и богачи.</div>`)}
        ${sec('👁', 'Подозрения ' + Math.round(G.suspicion), `${meter(G.suspicion, 100, riskCls(G.suspicion))}<div class="small">Источники: слухи (×0.06 в день), незакрытые хвосты (+3), досрочные выезды (+4), неудачные ночи (+8…12), журналисты. 100 — арест. Больше 40 — ночью ездит патруль.</div>`)}
        ${sec('🗣', 'Слухи ' + Math.round(G.rumors), `${meter(G.rumors, 100, riskCls(G.rumors))}<div class="small">Повышают риск, что клиент распробует особое мясо (+${pct(G.rumors / 500)}). Сами спадают на 3 в день.</div>`)}
        ${sec('🧽', 'Чистота ' + Math.round(G.cleanliness), `${meter(G.cleanliness, 100, goodCls(G.cleanliness))}<div class="small">Кровь −15, следы и вещи — каждое утро. Ниже 50 — санэпидемстанция и вопросы. Уборщица: +6…12 каждое утро.</div>`)}
        ${sec('♥', 'Совесть ' + Math.round(G.conscience), `${meter(G.conscience, 100, goodCls(G.conscience))}<div class="small">Заготовка −10, питомец −3. Ниже 50 — кошмары (сон хуже), ниже 40 — призраки и шёпот, 0 — конец.</div>`)}
        ${sec('🔧', 'Улучшения', Object.entries(UPGRADES).map(([k, u]) => kv(u.name, pips(G.upgrades[k], u.max, 'gold'))).join(''))}
        ${sec('📊', 'Итоги', kv('Обслужено', G.stats.served) + kv('Заработано', '$' + Math.floor(G.stats.earned)) + kv('Особых блюд', G.stats.specialServed) + kv('Заготовок', G.stats.kills) + kv('Ушли злыми', G.stats.angry))}
      </div>
      <div class="btns"><button class="b" data-a="x">Закрыть (J)</button></div>`, { x: () => UI.close() }, { closable: true, cls: 'm-journal' });
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

  // музыка и фоновые звуки под текущую сцену
  updateAudio() {
    if (!Sound.ready()) return;
    Music.play(musicFor());
    const rain = Atmos.weather === 'rain', fog = Atmos.weather === 'fog';
    const L = { rain: 0, murmur: 0, sizzle: 0, fryer: 0, hum: 0, wind: 0 };
    if (G.phase === 'day') {
      const busy = id => Kitchen.stations[id] ? Kitchen.stations[id].slots.filter(s => s && !s.burnt).length : 0;
      L.murmur = 0.15 + Math.min(1, Kitchen.customers.length / 4) * 0.85;
      L.sizzle = Math.min(1, (busy('grill') + busy('spit')) / 3);
      L.fryer = Math.min(1, busy('fryer') / 2);
      L.hum = 0.5;
    } else if (G.phase === 'stealth') {
      const out = Stealth.player && Stealth.player.y > 104 && Stealth.player.x > 136;
      L.rain = rain ? (out ? 1 : 0.5) : 0; L.wind = fog ? 0.8 : 0.15; L.hum = out ? 0.9 : 0.4;
    } else if (G.phase === 'morning') {
      L.wind = 0.25; L.hum = 0.2;
    } else {
      L.rain = rain ? 0.6 : 0; L.wind = fog ? 0.6 : 0.15; L.hum = 0.6;
    }
    Amb.set(L);
    if (G.phase !== 'stealth') Sound.danger = 0;
  },

  loop(ts) {
    const t = ts / 1000;
    const dt = Math.min(0.05, t - (this.last || t));
    this.last = t;
    this.update(dt);
    Atmos.update(dt, OUTDOOR);
    Sound.update(dt);
    this.audioT = (this.audioT || 0) - dt;
    if (this.audioT <= 0) { this.audioT = 0.25; this.updateAudio(); }
    this.draw(t);
    updateHUD();
    requestAnimationFrame(x => this.loop(x));
  }
};

Game.init();
