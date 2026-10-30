'use strict';
(function (G) {
  const $ = id => document.getElementById(id);
  G.Sprites.init();

  const app = G.app = {
    g: null, r: new G.Renderer($('view')), ui: null, tool: 'inspect', playing: false,
    setTool(t) {
      this.tool = t; this.r.preview = null; this.drag = null; this.moving = null;
      if (t !== 'inspect') this.ui.hideInfo();
      this.ui.updateHint(); this.ui.markCats();
      $('view').style.cursor = t === 'inspect' ? 'default' : 'crosshair';
    },
    setSpeed(s) { this.g.speed = s; this.ui.update(); },
    setOverlay(o) {
      this.r.overlay = o || null;
      const L = $('layerLegend');
      if (!o) { L.classList.add('hidden'); return; }
      const ov = G.OVERLAYS.find(x => x.id === o);
      let leg;
      if (G.RES.includes(o)) leg = `<span class="lg"><i style="background:#22c55e"></i>есть</span><span class="lg"><i style="background:#ef4444"></i>нет</span><span class="lg"><i style="background:#3b82f6"></i>источник</span>`;
      else if (o === 'lv') leg = `<span class="lg"><i style="background:#ef4444"></i>низкая</span><span class="lg"><i style="background:#22c55e"></i>высокая</span>`;
      else if (o === 'pol' || o === 'crime') leg = `<span class="lg"><i style="background:${o === 'pol' ? '#7c3aed' : '#dc2626'}"></i>высокое</span>`;
      else leg = `<span class="lg"><i style="background:#22c55e"></i>охвачено</span><span class="lg"><i style="background:#ef4444"></i>нет</span>`;
      L.innerHTML = `<b>${ov.icon} ${ov.name}</b>${leg}<button>✕</button>`;
      L.querySelector('button').onclick = () => { this.setOverlay(null); if (this.ui.panel === 'layers') this.ui.renderPanel(); };
      L.classList.remove('hidden');
    },
    startGame(g) {
      this.g = g; this.r.setGame(g); this.bind(g);
      this.playing = true; $('start').classList.add('hidden');
      this.ui.show(true); this.setTool('inspect'); this.ui.update();
      const c = this.findCenter(); this.r.centerOn(c[0], c[1]); this.r.cam.z = window.innerWidth < 760 ? 0.7 : 1.1;
      if (!g.stats.history.length && g.day === 1 && !g.buildings.size) {
        setTimeout(() => this.ui.modal(`<div class="em">🏙️</div><h1>Добро пожаловать, мэр!</h1>
          <p class="note" style="font-size:15px">Город <b>${g.name.replace(/</g, '&lt;')}</b> ждёт вас.<br><br>
          1️⃣ Проложите <b>дорогу</b><br>2️⃣ Разметьте <b>жилую зону</b> рядом<br>3️⃣ Дайте домам <b>энергию</b> и <b>воду</b> — ставьте их у дороги<br>4️⃣ Добавьте <b>торговлю</b> и <b>промышленность</b> для рабочих мест<br><br>Следите за заданиями слева!</p>`, '<button class="btn primary" id="mOk">Начать строить!</button>'), 400);
      }
    },
    switchCity(id) {
      if (this.g.cityId === id) return;
      this.g.save();
      const g = G.Region.loadCity(id);
      if (!g) { this.ui.toast('Не удалось загрузить город', 'bad'); return; }
      G.Audio.play('quest'); this.ui.closePanel(); this.startGame(g);
      this.ui.toast(`🌐 Вы в городе «${g.name.replace(/</g, '&lt;')}»`, 'good');
    },
    foundCity(name, spec) {
      this.g.save();
      const g = new G.Game();
      g.newGame({ name, sandbox: G.Region.data.sandbox, mapKind: spec });
      G.Region.addCity(g); g.save();
      G.Audio.play('quest'); this.ui.closePanel(); this.startGame(g);
    },
    findCenter() {
      const g = this.g; let sx = 0, sy = 0, n = 0;
      for (const b of g.buildings.values()) { sx += b.x; sy += b.y; n++; }
      return n ? [sx / n, sy / n] : [g.W / 2, g.H / 2];
    },
    toStart(fresh) {
      this.playing = false; this.ui.show(false); this.ui.closePanel(); this.ui.hideInfo(); this.ui.closeSub();
      $('toolhint').classList.add('hidden'); this.setOverlay(null);
      $('start').classList.remove('hidden');
      $('btnContinue').hidden = fresh || !G.Region.exists();
      $('startMain').hidden = !!fresh; $('startNew').hidden = !fresh;
      const demo = new G.Game(); demo.newGame({ seed: (Math.random() * 1e9) | 0, mapKind: 'river' }); demo.speed = 1;
      this.g = demo; this.r.setGame(demo); this.r.cam.z = 0.8;
    },
    bind(g) {
      const ui = this.ui, r = this.r, A = G.Audio;
      const at = b => { const [x, y] = r.iso(b.x + b.w / 2, b.y + b.h / 2); return [x, y - 30]; };
      const goto = b => () => { r.centerOn(b.x + b.w / 2, b.y + b.h / 2); ui.showInfo(b); };
      g.on('money', () => ui.update());
      g.on('error', m => { ui.toast('⚠️ ' + m, 'bad', null, 'err' + m, 2200); A.play('error'); });
      g.on('levelup', (l, u, b) => { A.play('level'); ui.levelUp(l, u, b); const [cx, cy] = r.toWorld(r.cw / 2, r.ch / 2); for (let i = 0; i < 6; i++) setTimeout(() => r.firework(cx + (Math.random() - 0.5) * 300, cy - 100 - Math.random() * 150), i * 250); });
      g.on('quest', q => { A.play('quest'); ui.toast(`🏅 Задание выполнено: <b>${q.t}</b> +$${G.fmt(q.m)}`, 'gold', () => ui.togglePanel('quests'), null, 4500); });
      g.on('fire', b => { A.play('fire'); ui.toast('🔥 Пожар! Нажмите, чтобы посмотреть', 'bad', goto(b), 'fire'); });
      g.on('extinguished', (b, auto) => { const [x, y] = at(b); r.floatText(x, y, auto ? '🚒 Потушено' : '💧 Потушено', '#8fd3ff'); });
      g.on('burned', b => ui.toast('🏚️ Здание сгорело', 'bad', goto(b), 'burn'));
      g.on('crime', b => ui.toast('🚨 Преступление! Нужна полиция', 'bad', goto(b), 'crime'));
      g.on('crime-solved', (b, auto) => { const [x, y] = at(b); r.floatText(x, y, auto ? '🚓 Раскрыто' : '👮 Пойман!', '#93c5fd'); });
      g.on('crime-lost', b => ui.toast('💸 Грабитель скрылся: −$100', 'bad', goto(b), 'crimelost'));
      g.on('coin', (b, v) => { A.play('coin'); const [x, y] = at(b); r.floatText(x, y, '+$' + v, '#ffe082'); for (let i = 0; i < 12; i++) r.puff(x, y, 'spark'); });
      g.on('chat', (b, m) => { A.play('chat'); ui.toast('💬 «' + m + '»', '', null, null, 4500); });
      g.on('abandoned', () => ui.toast('🏚️ Жители уезжают из домов без коммуникаций', 'bad', () => this.setOverlay('power'), 'aband'));
      g.on('upgrade', b => { const [x, y] = at(b); r.floatText(x, y, '⬆ Уровень ' + b.lvl, '#a7f3d0'); });
      g.on('placed', b => { A.play('place'); const [x, y] = r.iso(b.x + b.w / 2, b.y + b.h / 2); r.puff(x, y, 'dust', 14); });
      g.on('built-road', () => A.play('road'));
      g.on('rect', t => A.play(t === 'bulldoze' ? 'bulldoze' : 'zone'));
      g.on('nofuel', () => ui.toast('⚫ Кончился уголь — ТЭС остановлены! Купите уголь или наладьте поставки', 'bad', () => ui.togglePanel('region'), 'nofuel', 5000));
      g.on('day', (b, trade) => { if (trade) ui.toast(`🚚 Торговля: ${trade >= 0 ? '+' : '−'}$${G.fmt(Math.abs(trade))}`, trade >= 0 ? 'good' : '', () => ui.togglePanel('region'), null, 2500);
        if (!g.sandbox) ui.toast(`📅 День ${g.day}: ${b.net >= 0 ? '+' : '−'}$${G.fmt(Math.abs(b.net))}`, b.net >= 0 ? 'good' : 'bad', () => ui.togglePanel('budget'), null, 2500); if (g.money < 0 && !g.sandbox) ui.toast('💸 Казна пуста! Повысьте налоги или сократите расходы', 'bad', () => ui.togglePanel('budget'), 'broke'); });
      g.on('festival', () => { ui.toast('🎉 В городе праздник!', 'gold'); A.play('quest'); });
      g.on('disaster', (k, d) => {
        A.play(k === 'meteor' ? 'fire' : 'boom');
        if (k === 'tornado') ui.toast('🌪️ Торнадо! Держитесь!', 'bad', () => r.centerOn(g.tornado ? g.tornado.x : d.x, g.tornado ? g.tornado.y : d.y));
        else { ui.toast('☄️ Метеорит летит к городу!', 'bad'); r.centerOn(d.x, d.y); }
      });
      g.on('impact', () => A.play('boom'));
      g.on('rain', () => ui.toast('🌧️ Пошёл дождь — пожарам конец', '', null, 'rain', 2500));
    },
  };
  app.ui = new G.UI(app);
  try { G.Audio.on = localStorage.getItem('gradostroi_snd') !== '0'; } catch (e) { }

  // ---------- Стартовый экран ----------
  let mode = 'career', mapKind = 'river';
  document.querySelectorAll('#segMode button').forEach(b => b.onclick = () => { mode = b.dataset.v; document.querySelectorAll('#segMode button').forEach(x => x.classList.toggle('on', x === b)); });
  document.querySelectorAll('#segMap button').forEach(b => b.onclick = () => {
    mapKind = b.dataset.v; document.querySelectorAll('#segMap button').forEach(x => x.classList.toggle('on', x === b));
    const demo = new G.Game(); demo.newGame({ seed: (Math.random() * 1e9) | 0, mapKind }); app.g = demo; app.r.setGame(demo); app.r.cam.z = 0.8;
  });
  $('btnNew').onclick = () => { $('startMain').hidden = true; $('startNew').hidden = false; G.Audio.play('click'); };
  $('btnBack').onclick = () => { $('startMain').hidden = false; $('startNew').hidden = true; $('btnContinue').hidden = !G.Region.exists(); };
  $('btnStart').onclick = () => {
    G.Audio.play('quest');
    G.Region.create(mode === 'sandbox');
    const g = new G.Game();
    g.newGame({ name: $('inName').value.trim() || 'Новоград', sandbox: mode === 'sandbox', mapKind, seed: app.g ? app.g.seed : undefined });
    G.Region.addCity(g); app.startGame(g); g.save();
  };
  $('btnContinue').onclick = () => { let g = null; try { G.Region.load(); g = G.Region.loadCity(G.Region.data.active || G.Region.data.cities[0].id); } catch (e) { console.error(e); } if (g) { G.Audio.play('quest'); app.startGame(g); } else app.ui.toast('Не удалось загрузить сохранение', 'bad'); };
  app.toStart(false);

  // ---------- Ввод ----------
  const cv = $('view'), ptrs = new Map(), keys = new Set();
  let drag = null, pinch = null, spaceDown = false;
  const anchorFor = (tx, ty) => {
    const T = G.TOOLS[app.tool]; if (T.kind !== 'place') return [tx, ty];
    return [tx - Math.floor((T.w - 1) / 2), ty - Math.floor((T.h - 1) / 2)];
  };
  function updatePreview(tx, ty) {
    const g = app.g, T = G.TOOLS[app.tool], r = app.r;
    if (!T || T.kind === 'inspect') { r.preview = null; return; }
    if (T.kind === 'move') {
      const b = app.moving;
      if (!b) { r.preview = { kind: 'rect', tiles: g.inb(tx, ty) ? [[tx, ty, !!g.getB(tx, ty)]] : [] }; app.ui.updateHint('выберите здание'); return; }
      const x = tx - Math.floor((b.w - 1) / 2), y = ty - Math.floor((b.h - 1) / 2), ok = g.canRelocate(b, x, y);
      r.preview = { kind: 'move', b, x, y, ok }; app.ui.updateHint(ok ? 'нажмите, чтобы поставить' : 'место занято');
      return;
    }
    if (T.kind === 'place') {
      const [x, y] = anchorFor(tx, ty), ok = g.canPlace(app.tool, x, y);
      r.preview = { kind: 'place', type: app.tool, x, y, ok: ok.ok };
      const ex = T.extract && g.inb(x, y) ? ` · ${G.GOODS[T.extract.res].icon} ${g.extractAt(app.tool, x, y)}/день` : '';
      app.ui.updateHint(ok.ok ? `$${G.fmt(T.cost)}${ex}` : ok.why);
      return;
    }
    if (!drag || !drag.tool) { r.preview = { kind: 'rect', tiles: g.inb(tx, ty) ? [[tx, ty, true]] : [], col: T.zone ? G.alpha(G.ZONE[T.zone].color, 0.5) : null }; return; }
    if (T.kind === 'line') {
      const pts = g.linePath(drag.sx, drag.sy, tx, ty);
      let cost = 0, n = 0;
      const tiles = pts.map(([x, y]) => { const c = g.roadCost(x, y); if (c > 0) { cost += c; n++; } return [x, y, c > 0 || g.road[g.idx(x, y)] === 1]; });
      r.preview = { kind: 'line', tiles }; drag.tiles = pts;
      app.ui.updateHint(`${n} кл. · $${G.fmt(cost)}`);
    } else {
      const tiles = g.rectTiles(drag.sx, drag.sy, tx, ty);
      const { cost, n } = g.rectCost(app.tool, tiles);
      const col = T.zone ? G.alpha(G.ZONE[T.zone].color, 0.5) : app.tool === 'bulldoze' ? 'rgba(255,90,60,0.45)' : app.tool === 'dezone' ? 'rgba(200,200,200,0.45)' : null;
      r.preview = { kind: 'rect', tiles: tiles.map(([x, y]) => [x, y, true]), col }; drag.tiles = tiles;
      app.ui.updateHint(`${n} шт. · $${G.fmt(cost)}`);
    }
  }
  function click(sx, sy) {
    const r = app.r, g = app.g;
    for (const h of r.iconHits) if (Math.hypot(sx - h.x, sy - h.y) < h.r + 6) {
      const b = h.b;
      if (b.fire) { app.ui.showInfo(b); g.extinguish(b); }
      else if (b.crimeT) { app.ui.showInfo(b); g.solveCrime(b); }
      else if (b.bubble) g.collect(b);
      return;
    }
    const [tx, ty] = r.tileAt(sx, sy), b = g.getB(tx, ty);
    if (b) { G.Audio.play('click'); app.ui.showInfo(b); } else app.ui.hideInfo();
  }
  cv.addEventListener('pointerdown', e => {
    if (!app.playing) return;
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    app.ui.closeSub();
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null; app.r.preview = null; return;
    }
    const pan = e.button === 1 || e.button === 2 || spaceDown;
    const [tx, ty] = app.r.tileAt(e.clientX, e.clientY);
    const T = G.TOOLS[app.tool];
    const single = T.kind === 'place' || T.kind === 'move';
    drag = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, pan: pan || T.kind === 'inspect', btn: e.button, sx: tx, sy: ty, tool: !pan && T.kind !== 'inspect' && !single };
    if (drag.tool) updatePreview(tx, ty);
    if (!pan && single) updatePreview(tx, ty);
  });
  cv.addEventListener('pointermove', e => {
    if (!app.playing) return;
    const p = ptrs.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; }
    const r = app.r;
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      r.cam.x -= (cx - pinch.cx) / r.cam.z; r.cam.y -= (cy - pinch.cy) / r.cam.z;
      r.zoomAt(cx, cy, d / pinch.d); pinch = { d, cx, cy }; return;
    }
    const [tx, ty] = r.tileAt(e.clientX, e.clientY);
    r.hover = app.g.inb(tx, ty) && e.pointerType === 'mouse' ? [tx, ty] : null;
    if (drag) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.moved = true;
      if (drag.pan && drag.moved) {
        r.cam.x -= (e.clientX - drag.lx) / r.cam.z; r.cam.y -= (e.clientY - drag.ly) / r.cam.z; r.clampCam();
      } else if (drag.tool) updatePreview(tx, ty);
      else if (G.TOOLS[app.tool].kind === 'place' || G.TOOLS[app.tool].kind === 'move') updatePreview(tx, ty);
      drag.lx = e.clientX; drag.ly = e.clientY;
    } else if (e.pointerType === 'mouse') updatePreview(tx, ty);
  });
  const up = e => {
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
    if (!drag || !app.playing) { drag = null; return; }
    const g = app.g, T = G.TOOLS[app.tool], d = drag; drag = null;
    if (d.btn === 2 && !d.moved && app.tool !== 'inspect') { app.setTool('inspect'); return; }
    if (d.pan) { if (!d.moved && d.btn === 0) click(e.clientX, e.clientY); return; }
    if (T.kind === 'line' && d.tiles) g.buildRoads(d.tiles);
    else if (T.kind === 'rect' && d.tiles) g.applyRect(app.tool, d.tiles);
    else if (T.kind === 'place') { const [tx, ty] = app.r.tileAt(e.clientX, e.clientY); const [x, y] = anchorFor(tx, ty); g.place(app.tool, x, y); }
    else if (T.kind === 'move') {
      const [tx, ty] = app.r.tileAt(e.clientX, e.clientY);
      if (!app.moving) { const b = g.getB(tx, ty); if (b && !b.ruin) { app.moving = b; G.Audio.play('click'); } }
      else { const b = app.moving, x = tx - Math.floor((b.w - 1) / 2), y = ty - Math.floor((b.h - 1) / 2); if (g.relocate(b, x, y)) app.moving = null; }
    }
    const [tx, ty] = app.r.tileAt(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') { drag = null; updatePreview(tx, ty); } else { app.r.preview = null; app.ui.updateHint(); }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { app.r.hover = null; if (!drag && G.TOOLS[app.tool] && G.TOOLS[app.tool].kind === 'place') app.r.preview = null; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); app.r.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || !app.playing) return;
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === ' ') { spaceDown = true; e.preventDefault(); }
    if (k === 'escape') { app.setTool('inspect'); app.ui.closeSub(); app.ui.closePanel(); app.ui.hideInfo(); if (!$('modal').classList.contains('hidden')) app.ui.closeModal(); }
    if (k === 'p') app.setSpeed(app.g.speed ? 0 : 1);
    if (k === '1' || k === '2' || k === '3') app.setSpeed(+k);
    if (k === 'r' || k === 'к') app.setTool('road');
    if (k === 'b' || k === 'и') app.setTool('bulldoze');
    if (k === '+' || k === '=') app.r.zoomAt(app.r.cw / 2, app.r.ch / 2, 1.15);
    if (k === '-') app.r.zoomAt(app.r.cw / 2, app.r.ch / 2, 1 / 1.15);
  });
  window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k); if (k === ' ') spaceDown = false; });
  window.addEventListener('resize', () => app.r.resize());
  window.addEventListener('beforeunload', () => { if (app.playing) app.g.save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && app.playing) app.g.save(); });

  // ---------- Главный цикл ----------
  let last = performance.now(), uiT = 0, mmT = 0, fwT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const r = app.r, g = app.g;
    if (g) {
      if (app.playing) {
        g.update(dt);
        const sp = 600 / r.cam.z * dt;
        if (keys.has('w') || keys.has('arrowup') || keys.has('ц')) r.cam.y -= sp;
        if (keys.has('s') || keys.has('arrowdown') || keys.has('ы')) r.cam.y += sp;
        if (keys.has('a') || keys.has('arrowleft') || keys.has('ф')) r.cam.x -= sp;
        if (keys.has('d') || keys.has('arrowright') || keys.has('в')) r.cam.x += sp;
        r.clampCam();
        if (g.festival && (fwT -= dt) <= 0) {
          fwT = 0.5 + Math.random() * 0.8;
          const c = app.findCenter(), [x, y] = r.iso(c[0] + (Math.random() - 0.5) * 10, c[1] + (Math.random() - 0.5) * 10);
          r.firework(x, y - 150 - Math.random() * 100);
        }
      } else {
        g.t += dt * 40; // демо-режим: время бежит, камера плывёт
        r.cam.x += Math.sin(now / 9000) * 8 * dt;
      }
      r.draw(dt);
      if (app.playing) {
        if ((uiT -= dt) <= 0) { uiT = 0.25; app.ui.update(); }
        if ((mmT -= dt) <= 0) { mmT = 0.5; r.drawMinimap($('minimap')); }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})(window.G);
