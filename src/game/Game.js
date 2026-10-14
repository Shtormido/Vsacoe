import * as THREE from 'three';
import { Audio } from '../audio/Audio.js';
import { applyQuality, config } from '../config.js';
import { BREEDS, STYLES } from '../data/breeds.js';
import { SALONS, SALON_ORDER } from '../data/salons.js';
import { computeMods, staffStats } from '../data/skills.js';
import { CHAPTERS, PROLOGUE, SCENES, SPEAKERS, TIPS } from '../data/story.js';
import { Assets } from '../engine/Assets.js';
import { createRenderer } from '../engine/Renderer.js';
import { furLighting } from '../fur/FurMaterial.js';
import { Pet } from '../pet/Pet.js';
import { Computer } from '../ui/Computer.js';
import { openCustomizer } from '../ui/Customizer.js';
import { UI, h, starsText } from '../ui/UI.js';
import { clamp, formatMoney, sleep } from '../util/math.js';
import { CameraRig } from '../world/CameraRig.js';
import { Npc } from '../world/Npc.js';
import { Particles } from '../world/Particles.js';
import { Player } from '../world/Player.js';
import { Salon } from '../world/Salon.js';
import { WalkControls } from '../world/WalkControls.js';
import { CLOSE, DaySim, RATE, fmtTime } from './DaySim.js';
import { GroomSession } from './GroomSession.js';
import { addMail, load, loadSettings, newState, salonTier, save, saveSettings, wipe } from './State.js';

const BLOCKING = '.modal-back, .dialog, .pc, .custom-wrap, .screen-full.slides';

export class Game {
  constructor(container, uiRoot) {
    this.container = container;
    this.settings = loadSettings();
    const r = createRenderer(container, { quality: this.settings.quality });
    Object.assign(this, r);
    // ?pr=0.5 — пониженное разрешение рендера, ?q=low — качество (для слабых ПК и автотестов)
    const params = new URLSearchParams(location.search);
    if (params.get('q')) this.settings.quality = params.get('q');
    applyQuality(this.settings.quality);
    this.renderer.shadowMap.enabled = config.shadows;
    this.dtMax = Number(params.get('dtmax')) || 0.05;
    this.timeScale = Number(params.get('ts')) || 1; // ускорение игровых часов (для тестов)
    const pr = Number(params.get('pr'));
    if (pr) this.renderer.setPixelRatio(pr);
    this.scene.background = new THREE.Color('#2a2130');
    this.assets = new Assets('./models/');
    this.audio = new Audio();
    this.audio.setVolumes(this.settings.sfx, this.settings.music);
    this.ui = new UI(uiRoot, this);
    this.rig = new CameraRig(this.camera);
    this.particles = new Particles(this.scene);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.npcs = [];
    this.pets = [];
    this.actors = {};
    this.staffNpcs = {};
    this.salon = null;
    this.session = null;
    this.state = null;
    this.player = null;
    this.mode = 'boot';
    this.busy = false;
    this.day = new DaySim(this);
    this.pc = new Computer(this);
    this.walk = new WalkControls(this);
    this.hudT = 0;
    window.addEventListener('pointerdown', () => this.audio.unlock());
    window.addEventListener('keydown', (e) => this._globalKey(e));
  }

  // ================================================================ движок
  async boot() {
    const ld = this.ui.loading();
    let tip = 0;
    const tipTimer = setInterval(() => ld.set(undefined, TIPS[tip++ % TIPS.length]), 2600);
    await this.assets.loadAll((p, name) => ld.set(p, `Загружено: ${name}`));
    clearInterval(tipTimer);
    this._loop();
    ld.done();
    window.__ready = true;
    await this.showMenu();
  }

  _loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(this.dtMax, this.clock.getDelta());
      this.time += dt;
      furLighting.uTime.value = this.time;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  uiBlocking() {
    return !!document.querySelector(BLOCKING);
  }

  update(dt) {
    if (this.mode === 'menu' || this.mode === 'select') {
      this.rig.setFov(45);
      const a = this.time * 0.08;
      const S = this.salon;
      if (S) {
        const r = Math.max(S.W, S.D) * 0.5;
        this.camera.position.set(Math.sin(a) * r * 0.9, S.H * 0.7, Math.cos(a) * r * 0.75 + S.D * 0.3);
        this.camera.lookAt(0, 0.9, -0.3);
      }
    } else {
      this.rig.update(dt);
    }
    const blocking = this.uiBlocking();
    if ((blocking || this.mode !== 'walk') && this.walk.locked) this.walk.release();
    if (this.mode === 'walk' && this.player) {
      const m = computeMods(this.state);
      this.walk.setEnabled(!blocking && !this.busy);
      this.walk.update(dt, this.player, this.salon, 1 + (m.walk || 0));
    }
    // время течёт только в салоне и не во время диалогов/меню
    let rate = 0;
    if (!blocking && !this.busy && this.mode === 'walk') rate = RATE.walk;
    if (this.mode === 'groom' && this.session && !this.session.paused && !this.session.championship) rate = RATE.groom;
    if (this.state?.today?.open) this.day.update(dt, rate * this.timeScale);
    for (const n of this.npcs) n.update(dt);
    for (const p of this.pets) if (!(this.session && this.session.pet === p)) p.update(dt, 0);
    if (this.ponchik) this.ponchik.lookAt(this.player && this.mode === 'walk' ? this.player.root.position.clone().setY(1) : this.camera.position);
    this.session?.update(dt);
    const focus = this.player?.root.visible && this.mode !== 'menu' && this.mode !== 'select' ? this.player.root.position : null;
    this.salon?.update(dt, this.time, this.camera.position, focus);
    this.particles.setScale(this.renderer.domElement.height);
    this.particles.update(dt);
    if (this.mode === 'walk') {
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.25;
        this.refreshHud();
      }
    }
  }

  _globalKey(e) {
    if (document.querySelector('.modal-back, .pc, .custom-wrap')) return;
    if (e.code === 'Escape' && this.mode === 'walk' && !this.busy) this.pauseMenu();
    if (e.code === 'KeyC' && this.mode === 'walk' && !this.busy && !document.querySelector('.dialog')) this.openPC();
    if (e.code === 'Escape' && this.mode === 'groom' && this.session && !this.session.paused) this.groomPause();
  }

  // ---------------------------------------------------------------- мир
  setSalon(id, { withPonchik = true, withPlayer = true } = {}) {
    this.day?.clear?.();
    this.clearActors();
    this.salon?.dispose();
    if (this.ponchik) {
      const old = this.ponchik;
      old.dispose();
      this.pets = this.pets.filter((p) => p !== old);
      this.ponchik = null;
    }
    this.salon = new Salon(this, id, { owned: this.state?.owned || [], flags: this.state?.flags || {}, theme: this.state?.theme });
    this.scene.add(this.salon.group);
    this.salon.applyFurLighting();
    this.scene.background = new THREE.Color(SALONS[id].sky);
    this.particles.floorY = 0.005;
    if (withPonchik) {
      const p = new Pet(this.assets, 'corgi', { palette: 0, seed: 99, scale: 0.85 });
      p.name = 'Пончик';
      p.setCondition({ dirt: 0, mats: 0, length: 0.75, nails: false });
      p.root.position.copy(this.salon.bedPos).setY(0.08);
      p.root.rotation.y = 0.9;
      this.scene.add(p.root);
      this.ponchik = p;
      this.pets.push(p);
    }
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    if (withPlayer && this.state) {
      this.player = new Player(this.assets, this.state.look);
      // начинаем посреди ресепшена, лицом к груминг-залу
      this.player.place(new THREE.Vector3(this.salon.deskPos.x - 1.0, 0, this.salon.deskPos.z + 1.9), Math.PI);
      this.scene.add(this.player.root);
      this.rig.fps.yaw = 2.2;
      this.rig.fps.pitch = -0.12;
      this.syncStaff();
    }
  }

  /** NPC сотрудников у их столов. */
  syncStaff() {
    for (const n of Object.values(this.staffNpcs)) n.dispose();
    this.staffNpcs = {};
    if (!this.state || !this.salon) return;
    this.state.staff.forEach((e, i) => {
      const t = this.salon.tables[i + 1];
      if (!t) return;
      const n = new Npc(this.assets, e.person);
      n.place(t.stand, Math.PI);
      n.lookTarget = t.pos;
      this.scene.add(n.root);
      this.staffNpcs[e.id] = n;
    });
  }

  clearActors() {
    for (const n of this.npcs) n.dispose();
    for (const p of this.pets) if (p !== this.ponchik) p.dispose();
    this.npcs = [];
    this.pets = this.ponchik ? [this.ponchik] : [];
    this.actors = {};
  }

  spawnNpc(personId, pos, yaw = 0, speaker = null) {
    const n = new Npc(this.assets, personId);
    n.place(pos, yaw);
    this.scene.add(n.root);
    this.npcs.push(n);
    if (speaker) this.actors[speaker] = n;
    return n;
  }

  removeNpc(n) {
    n.dispose();
    this.npcs = this.npcs.filter((x) => x !== n);
    for (const k of Object.keys(this.actors)) if (this.actors[k] === n) delete this.actors[k];
  }

  spawnPet(breed, opts) {
    const p = new Pet(this.assets, breed, opts);
    this.scene.add(p.root);
    this.pets.push(p);
    return p;
  }

  removePet(p) {
    p.dispose();
    this.pets = this.pets.filter((x) => x !== p);
  }

  onSpeak(sid) {
    for (const n of this.npcs) n.talking = false;
    const n = this.actors[sid];
    if (n) {
      n.talking = true;
      clearTimeout(this._talkT);
      this._talkT = setTimeout(() => {
        n.talking = false;
      }, 1800);
    }
    if (sid === 'ponchik') this.audio.play('bark');
  }

  async cam(name, dur = 1.3) {
    const c = this.salon.cams[name];
    await this.rig.flyTo(c.pos, c.target, dur);
  }

  rebuildSalonKeepActors() {
    const old = this.salon;
    this.salon = new Salon(this, old.id, { owned: this.state.owned, flags: this.state.flags, theme: this.state.theme });
    old.dispose();
    this.scene.add(this.salon.group);
    this.salon.applyFurLighting();
    if (this.ponchik) this.ponchik.root.position.copy(this.salon.bedPos).setY(0.08);
    if (this.player) this.salon.resolve(this.player.root.position, 0.24);
  }

  refreshSign() {
    if (this.salon) this.rebuildSalonKeepActors();
  }

  /** Вид от первого лица: своё тело скрыто, камера в глазах персонажа. */
  enterFps(opts = {}) {
    if (!this.player) return;
    this.player.root.visible = false;
    this.rig.startFps(this.player, opts);
  }

  headOf(npc) {
    return npc.pos.clone().add(new THREE.Vector3(0, npc.sitting > 0.5 ? 1.2 : 1.55, 0));
  }

  onPointerUnlock() {
    if (this.walk.autoUnlock) {
      this.walk.autoUnlock = false;
      return;
    }
    // Esc в браузере сначала отпускает мышь — показываем паузу
    if (this.mode === 'walk' && !this.busy && !this.uiBlocking()) this.pauseMenu();
  }

  /** Сцена у стойки: игрок за компьютером, гость — у стойки. */
  playerToDesk() {
    if (!this.player) return;
    this.player.place(this.salon.staffSpot, -Math.PI / 2);
    this.player.moveInput = 0;
  }

  // ================================================================ меню
  async showMenu() {
    this.mode = 'menu';
    this.walk.setEnabled(false);
    this.ui.clearHud();
    const saved = load();
    this.state = saved;
    this.setSalon(saved?.salon || 'studio', { withPlayer: false });
    this.audio.startMusic();
    this.ui.mainMenu({
      hasSave: !!saved,
      onContinue: () => this.continueGame(),
      onNew: () => this.newGame(),
      onSettings: () => this.settingsModal(),
      onAbout: () => this.ui.modal('Об игре', null, h('div', { style: { fontWeight: 600, lineHeight: 1.6, fontSize: '16px' } },
        h('p', '«Пушистый салон» — симулятор грумера. Купите помещение, наймите команду, ведите запись клиентов, заказывайте расходники, стригите питомцев и победите на чемпионате «Золотые ножницы».'),
        h('p', 'Все 3D-модели — собаки, кошка, люди, мебель и инструменты — созданы процедурно скриптами Blender. Шерсть — многослойный шейдер, который в реальном времени реагирует на воду, шампунь, фен, расчёску и машинку.'),
        h('p', 'В салоне: WASD — ходить, Shift — бегом, E — действие, C — компьютер, ПКМ — повернуть камеру. За столом: ЛКМ — инструмент, 1–0 и «−» — инструменты, Tab — подсказка длины, Esc — пауза.'))),
    });
  }

  settingsModal() {
    const s = this.settings;
    const row = (label, input) => h('label', label, input);
    const range = (key, fn) => h('input', {
      type: 'range', min: 0, max: 1, step: 0.05, value: s[key],
      oninput: (e) => {
        s[key] = Number(e.target.value);
        fn();
      },
    });
    const apply = () => {
      this.audio.setVolumes(s.sfx, s.music);
      saveSettings(s);
    };
    const quality = h('select', {
      onchange: (e) => {
        s.quality = e.target.value;
        applyQuality(s.quality);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, s.quality === 'high' ? 2 : 1));
        this.renderer.shadowMap.enabled = config.shadows;
        saveSettings(s);
        this.ui.toast('Мех обновится у следующего питомца', 'good');
      },
    }, ['high', 'medium', 'low'].map((q) => h('option', { value: q, selected: s.quality === q }, { high: 'Высокое', medium: 'Среднее', low: 'Низкое' }[q])));
    return this.ui.modal('Настройки', null, h('div.settings',
      row('Громкость эффектов', range('sfx', apply)),
      row('Громкость музыки', range('music', apply)),
      row('Качество графики', quality)), undefined, { width: 'min(560px, 94vw)' });
  }

  async continueGame() {
    this.ui.clear('screen');
    await this.ui.fade(() => this.setSalon(this.state.salon));
    this.hub();
  }

  async newGame() {
    if (load()) {
      const ok = await this.ui.modal('Новая игра', null, h('p', { style: { fontWeight: 700 } }, 'Текущее сохранение будет удалено. Начать заново?'),
        [{ label: 'Отмена', value: 0 }, { label: 'Начать', cls: '.primary', value: 1 }]);
      if (ok !== 1) return;
      wipe();
    }
    this.ui.clear('screen');
    this.mode = 'story';
    await this.ui.slides(PROLOGUE);
    const name = await this.ui.prompt('Как тебя зовут?', 'Имя грумера', 'Саша');
    this.state = newState(name);
    addMail(this.state, 'Тамара Павловна', 'Добро пожаловать!', 'Золотце, это твой рабочий компьютер. Здесь запись клиентов, заказ расходников, сайт салона, персонал и навыки. Заглядывай почаще! Т. П.');
    await this.ui.fade(() => {
      this.setSalon('studio');
      this.player.place(new THREE.Vector3(this.salon.deskPos.x - 1.3, 0, this.salon.D / 2 - 1.2), 0);
      this.mode = 'story';
    });
    await this.customize({ title: 'Каким будет грумер?', first: true });
    const S = this.salon;
    await this.ui.fade(() => {
      this.playerToDesk();
      const t = this.spawnNpc('tamara', S.clientAtDesk.clone(), Math.PI / 2, 'tamara');
      this.enterFps();
      this.rig.fpsLookAt(this.headOf(t), 0.01);
    });
    await this.ui.dialog(SCENES.mentor);
    await this.chooseSalon(true);
  }

  /** Экран внешнего вида: камера крупно на персонаже. */
  async customize(opts = {}) {
    const prevMode = this.mode;
    this.mode = 'story';
    this.walk.setEnabled(false);
    const p = this.player.root.position;
    this.player.root.visible = true;
    this.player.face(0);
    this.player.yaw = 0;
    this.player.root.rotation.y = 0;
    this.rig.set(p.clone().add(new THREE.Vector3(-0.55, 1.35, 2.3)), p.clone().add(new THREE.Vector3(-0.55, 1.0, 0)));
    const hud = this.ui.layers.hud;
    hud.style.display = 'none';
    await openCustomizer(this, opts);
    hud.style.display = '';
    save(this.state);
    this.mode = prevMode;
    if (prevMode === 'walk') this.enterFps();
  }

  // ================================================================ выбор салона
  async chooseSalon(first = false) {
    this.mode = 'select';
    this.walk.setEnabled(false);
    this.ui.clearHud();
    let idx = 0;
    const order = SALON_ORDER;
    const current = this.state.salon;
    if (current) idx = Math.min(order.length - 1, order.indexOf(current) + 1);
    return new Promise((resolve) => {
      const show = async () => {
        const id = order[idx];
        const c = SALONS[id];
        await this.ui.fade(() => this.setSalon(id, { withPonchik: false, withPlayer: false }));
        const refund = current && current !== id ? Math.round(SALONS[current].price * 0.5) : 0;
        const cost = c.price - refund;
        const owns = id === current;
        const tierLow = current && c.tier <= SALONS[current].tier;
        const canBuy = !owns && !tierLow && this.state.money >= cost;
        const card = h('div.salonsel.panel',
          h('button.arrow', { onclick: () => { idx = (idx + order.length - 1) % order.length; show(); } }, '‹'),
          h('div.mid',
            h('div.district', c.district),
            h('h2', c.name),
            h('p', c.desc),
            h('div.stats',
              h('span', `💰 ${formatMoney(c.price)}`),
              h('span', `🏠 аренда ${formatMoney(c.rent)}/день`),
              h('span', `✂ столов: ${c.tables}`),
              h('span', `🐾 до ${c.capacity} записей`),
              h('span', `✨ цены ×${c.prestige}`)),
            refund ? h('div', { style: { fontWeight: 700, color: '#7c6a76', marginBottom: '8px' } }, `Продажа текущего салона вернёт ${formatMoney(refund)}. К оплате: ${formatMoney(cost)}`) : null,
            h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
              h('button.primary', {
                disabled: !canBuy,
                onclick: async () => {
                  this.audio.play('coins');
                  this.state.money -= cost;
                  this.state.salon = id;
                  // сотрудники, которым не хватает столов, переходят вместе с вами
                  this.ui.clear('screen');
                  save(this.state);
                  await this.ui.fade(() => this.setSalon(id));
                  resolve(id);
                  if (first) {
                    this.mode = 'story';
                    this.rig.set(this.salon.cams.overview.pos, this.salon.cams.overview.target);
                    await this.ui.dialog(SCENES.bought);
                  }
                  this.hub();
                },
              }, owns ? 'Это ваш салон' : tierLow ? 'Не нужно' : `Купить за ${formatMoney(cost)}`),
              h('span', { style: { fontWeight: 800 } }, `На счету: ${formatMoney(this.state.money)}`),
              !first ? h('button', { onclick: async () => { this.ui.clear('screen'); await this.ui.fade(() => this.setSalon(this.state.salon)); resolve(null); this.hub(); } }, 'Назад') : null)),
          h('button.arrow', { onclick: () => { idx = (idx + 1) % order.length; show(); } }, '›'));
        this.ui.layers.screen.replaceChildren(card);
      };
      show();
    });
  }

  // ================================================================ салон (ходьба)
  chapter() {
    return CHAPTERS[this.state.chapter];
  }

  async hub() {
    this.busy = false;
    this.ui.clear('screen');
    const s = this.state;
    if (!s.today) {
      if (await this.storyChecks()) return;
      this.day.morning();
      save(s);
    }
    this.mode = 'walk';
    this.enterFps();
    this.buildHud();
    if (!s.flags.walkTutorial) {
      s.flags.walkTutorial = true;
      this.busy = true;
      await this.ui.dialog(SCENES.walkTutorial);
      this.busy = false;
    }
  }

  buildHud() {
    const ui = this.ui;
    ui.clearHud();
    this.hudEls = {
      clock: h('span'), money: h('span'), rep: h('span'), injury: h('button.chip.panel', { style: { color: '#e5484d' }, onclick: () => this.useFirstAidSelf() }),
      stock: h('div.chip.panel.warnchip'), queue: h('div.queue.panel'), prompt: h('div.prompt.panel'), action: h('div.actionbar'),
      cross: h('div.crosshair'), lock: h('div.lockhint.panel', 'Кликните по экрану, чтобы осматриваться мышью'),
    };
    const E = this.hudEls;
    const ch = this.chapter();
    ui.layers.hud.append(
      h('div.topbar',
        h('div.chip.panel', h('span.ico', '📅'), `День ${this.state.day}`, h('span.ico', ' 🕘'), E.clock),
        h('div.chip.panel', h('span.ico', '💰'), E.money),
        h('div.chip.panel', E.rep),
        E.injury, E.stock,
        ch ? h('div.goal.panel', h('b', ch.title), ch.goal) : null),
      h('div.hubbar',
        h('button', { onclick: () => this.openPC() }, h('span.ico', '💻'), 'Компьютер [C]'),
        h('button', { onclick: () => this.customize() }, h('span.ico', '👤'), 'Внешний вид'),
        h('button', { onclick: () => this.pauseMenu() }, h('span.ico', '⏸'), 'Меню [Esc]')),
      E.queue, E.prompt, E.action, E.cross, E.lock,
      h('div.keys.panel', { style: { position: 'fixed', left: '14px', bottom: '14px' } },
        h('kbd', 'Мышь'), ' осмотреться · ', h('kbd', 'WASD'), ' ходить · ', h('kbd', 'Shift'), ' бег · ', h('kbd', 'E'), '/', h('kbd', 'ЛКМ'), ' действие · ', h('kbd', 'C'), ' компьютер'));
    this._actionKey = null;
    this.refreshHud();
  }

  refreshHud() {
    const E = this.hudEls;
    if (!E || this.mode !== 'walk') return;
    const s = this.state;
    const T = s.today;
    E.clock.textContent = T?.open ? fmtTime(T.clock) : '08:30 · закрыто';
    E.money.textContent = formatMoney(s.money);
    E.rep.textContent = `${starsText(s.rep)} ${s.rep.toFixed(1)}`;
    E.rep.className = 'stars';
    E.injury.style.display = s.injury ? '' : 'none';
    if (s.injury) E.injury.textContent = `🩹 ${s.injury.type} — обработать (${s.stock.firstaid})`;
    const low = [];
    if (s.stock.shampoo < 3) low.push(`шампунь: ${s.stock.shampoo}`);
    if (s.stock.firstaid < 1) low.push('нет аптечек');
    E.stock.style.display = low.length ? '' : 'none';
    E.stock.textContent = `📦 ${low.join(', ')}`;
    // очередь
    const lines = this.day.clients.filter((c) => !['done', 'angry'].includes(c.status)).map((c) => {
      const st = { arriving: 'идёт к стойке', desk: 'ждёт у стойки', sofa: 'ждёт мастера', self: 'у вас', staff: 'у сотрудника' }[c.status];
      const job = this.day.jobs.find((j) => j.c === c);
      const k = job ? job.progress : c.patience / c.maxPatience;
      return h('div.qrow', h('b', c.info.name), h('span', ` · ${c.info.pet.name} — ${st}`),
        h('div.bar', h('div', { style: { width: `${Math.round(clamp(k) * 100)}%`, background: job ? '#3fbf9f' : k < 0.3 ? '#e5484d' : '#ffc23d' } })));
    });
    const upcoming = T?.appts.filter((a) => !a.spawned).length || 0;
    E.queue.replaceChildren(h('div.qtitle', `Клиенты · ожидается ещё ${upcoming}`), ...lines);
    E.queue.style.display = T ? '' : 'none';
    // подсказка действия
    const free = !this.busy && !this.uiBlocking();
    const target = free ? this.findInteraction() : null;
    E.prompt.style.display = target ? '' : 'none';
    E.cross.style.display = free ? '' : 'none';
    E.cross.classList.toggle('on', !!target);
    E.lock.style.display = free && !this.walk.locked ? '' : 'none';
    if (target) E.prompt.replaceChildren(h('kbd', 'E'), ' ', target.label);
    // большая кнопка
    let key = 'none';
    if (T && !T.open) key = 'open';
    else if (T && T.open && (this.day.idle() || T.closing) && !this.day.jobs.length && !this.day.clients.some((c) => c.status === 'self')) key = 'close';
    if (s.chapter === 5 && T && !T.open) key = 'open+champ';
    if (key !== this._actionKey) {
      this._actionKey = key;
      const items = [];
      if (key.startsWith('open')) items.push(h('button.big.primary', { onclick: () => this.openDay() }, '☀ Открыть салон (9:00)'));
      if (key === 'open+champ') items.push(h('button.big.mint', { onclick: () => this.championship() }, '🏆 Чемпионат!'));
      if (key === 'close') items.push(h('button.big.violet', { onclick: () => this.endDay() }, '🌙 Закрыть день'));
      E.action.replaceChildren(...items);
    }
  }

  /** Ближайшее, с чем можно взаимодействовать. */
  /** То, на что смотрит игрок (в пределах ~2,3 м и узкого конуса взгляда). */
  findInteraction() {
    if (!this.player || this.mode !== 'walk') return null;
    const eye = this.camera.position;
    const dir = this.rig.fpsDir();
    const feet = this.player.root.position;
    let best = null;
    const consider = (point, obj, { maxDist = 2.3, cone = 0.38 } = {}) => {
      const v = point.clone().sub(eye);
      const d = v.length();
      if (d > maxDist) return;
      const ang = Math.acos(Math.min(1, Math.max(-1, v.dot(dir) / Math.max(d, 1e-4))));
      // чем ближе цель, тем шире допустимый угол
      const limit = cone + 0.25 / Math.max(d, 0.4);
      if (ang > limit) return;
      const score = ang + d * 0.05;
      if (!best || score < best.score) best = { ...obj, score };
    };
    const body = (n) => n.pos.clone().add(new THREE.Vector3(0, n.sitting > 0.5 ? 1.0 : 1.25, 0));
    for (const c of this.day.clients) {
      if (c.status === 'desk') consider(body(c.npc), { kind: 'client', c, label: `Поговорить: ${c.info.name}` }, { maxDist: 3 });
      if (c.status === 'sofa') consider(body(c.npc), { kind: 'client', c, label: `${c.info.name}: взять в работу` });
    }
    for (const st of this.salon.stations) {
      let label = st.label;
      if (st.id === 'door') {
        const T = this.state.today;
        if (T && !T.open) label = 'Открыть салон';
        else if (this.day.idle() || T?.closing) label = 'Закрыть день';
        else continue;
      }
      if (st.id === 'firstaid' && !this.state.injury) label = 'Аптечка (вы здоровы)';
      if (st.pos.distanceTo(feet) > st.r + 1.4) continue;
      consider(st.look, { kind: 'station', id: st.id, label });
    }
    if (this.ponchik) consider(this.ponchik.root.position.clone().setY(0.3), { kind: 'ponchik', label: 'Погладить Пончика' });
    for (const [id, n] of Object.entries(this.staffNpcs)) {
      const e = this.state.staff.find((x) => x.id === id);
      if (e) consider(body(n), { kind: 'staff', e, label: `${e.name}: как дела?` });
    }
    return best;
  }

  async interact() {
    if (this.mode !== 'walk' || this.busy || this.uiBlocking()) return;
    const t = this.findInteraction();
    if (!t) return;
    if (t.kind === 'client') return this.talkTo(t.c);
    if (t.kind === 'ponchik') {
      this.ponchik.anim.happy = 2;
      this.audio.play('bark');
      this.particles.emit('heart', this.ponchik.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, 0.6, 0), 6, { spread: 0.8 });
      return;
    }
    if (t.kind === 'staff') {
      const st = staffStats(t.e);
      const job = this.day.jobs.find((j) => j.emp.id === t.e.id);
      this.ui.toast(t.e.injured ? `${t.e.name}: «Я поранился... Нужна аптечка (ПК → Персонал)»`
        : job ? `${t.e.name}: «Работаю с ${job.c.info.pet.name}, готово на ${Math.round(job.progress * 100)}%»`
          : `${t.e.name}: «Свободен(на)! Скорость ${st.speed}, аккуратность ${st.care}»`);
      return;
    }
    switch (t.id) {
      case 'pc': return this.openPC();
      case 'door': return this.state.today?.open ? this.endDay() : this.openDay();
      case 'firstaid': return this.useFirstAidSelf();
      case 'mirror': return this.customize();
      case 'table': return this.ui.toast('Примите клиента у стойки на ресепшене и выберите «Сделаю сам(а)».');
      default:
    }
  }

  async openPC() {
    if (this.busy) return;
    this.walk.setEnabled(false);
    await this.pc.open();
    this.buildHud();
  }

  useFirstAidSelf() {
    const s = this.state;
    if (!s.injury) return this.ui.toast('Вы целы и невредимы!');
    if (!s.stock.firstaid) return this.ui.toast('Аптечек нет — закажите на компьютере (Расходники).', 'bad');
    s.stock.firstaid--;
    s.injury = null;
    this.audio.play('pop');
    this.ui.toast('Рана обработана. Руки снова твёрдые!', 'good');
  }

  async pauseMenu() {
    const r = await this.ui.modal('Пауза', `День ${this.state.day} · ${this.state.name}`, h('div'),
      [{ label: 'Настройки', value: 'settings' }, { label: 'Сохранить и выйти', value: 'exit' }, { label: 'Продолжить', cls: '.primary', value: 'go' }]);
    if (r === 'settings') await this.settingsModal();
    if (r === 'exit') {
      // клиенты, которые сейчас в салоне, при выходе не сохраняются
      save(this.state);
      this.day.clear();
      this.ui.clearHud();
      this.showMenu();
    }
  }

  async groomPause() {
    const s = this.session;
    s.paused = true;
    const r = await this.ui.modal('Пауза', 'Питомец терпеливо ждёт на столе', h('div'),
      [{ label: 'Настройки', value: 'settings' }, { label: 'Продолжить', cls: '.primary', value: 'go' }]);
    if (r === 'settings') await this.settingsModal();
    s.paused = false;
  }

  // ================================================================ день
  openDay() {
    const T = this.state.today;
    if (!T || T.open) return;
    this.day.open();
    const n = T.appts.length;
    this.ui.toast(`Салон открыт! По записи: ${n}. Клиенты приходят к своему времени.`, 'good');
    this._actionKey = null;
  }

  orderCard(info, order) {
    const B = BREEDS[info.pet.breed];
    const L = { wash: 'Мытьё и сушка', brush: 'Вычёсывание колтунов', cut: `Стрижка «${order.style ? STYLES[order.style].name : ''}»`, nails: 'Стрижка когтей', perfume: 'Парфюм', bow: 'Бантик' };
    const warn = order.needs && !this.state.owned.includes(order.needs)
      ? h('div', { style: { color: '#e5484d', fontWeight: 800, marginTop: '10px' } }, '⚠ Нужен гипоаллергенный шампунь — его нет. Купите в ГрумМаркете.') : null;
    const noShampoo = order.services.includes('wash') && this.state.stock.shampoo < 1
      ? h('div', { style: { color: '#e5484d', fontWeight: 800, marginTop: '6px' } }, '⚠ На складе нет шампуня — закажите на компьютере.') : null;
    return h('div',
      h('div', { style: { fontWeight: 800, color: '#7c6a76', marginBottom: '8px' } }, `${info.pet.name} · ${B.name}, окрас «${B.palettes[info.pet.palette % B.palettes.length].name}»`),
      h('ul', { style: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: 700, fontSize: '16px' } },
        order.services.map((k) => h('li', `• ${L[k]}`))),
      h('div', { style: { marginTop: '12px', fontWeight: 900, fontSize: '18px' } }, `Стоимость: ${formatMoney(order.price)}`,
        h('span', { style: { color: '#7c6a76', fontSize: '14px', fontWeight: 700 } }, ` · норматив ~${Math.round(order.par / 60 + 0.4)} мин`)),
      warn, noShampoo);
  }

  speak(lines, info) {
    if (info && !info.regular) SPEAKERS.walkin = { name: info.name, color: '#4a90d9', portrait: info.person };
    return this.ui.dialog(lines);
  }

  /** Разговор с клиентом у стойки или на диване: приём заказа и выбор мастера. */
  async talkTo(c) {
    if (this.busy) return;
    this.busy = true;
    const S = this.salon;
    const atDesk = c.status === 'desk';
    this.actors.walkin = c.npc;
    if (c.info.regular) this.actors[c.info.regular.id] = c.npc;
    this.player.moveInput = 0;
    await this.rig.fpsLookAt(this.headOf(c.npc), 0.45);
    if (atDesk) {
      if (!c.greeted) {
        c.greeted = true;
        await this.speak([[c.info.speaker, c.info.greet]], c.info);
      }
    }
    const free = this.day.freeStaff();
    const buttons = [{ label: 'Отказать', value: 'no' }];
    if (atDesk) buttons.push({ label: 'Подождите на диване', value: 'wait' });
    for (const e of free) {
      if (!S.tables[this.state.staff.indexOf(e) + 1]) continue;
      buttons.push({ label: `Поручить: ${e.name}`, cls: '.mint', value: `emp:${e.id}` });
    }
    buttons.push({ label: 'Сделаю сам(а)', cls: '.primary', value: 'self' });
    const r = await this.ui.modal(`Заказ: ${c.info.name}`, free.length ? 'Кто займётся питомцем?' : 'Возьмётесь?', this.orderCard(c.info, c.order), buttons, { width: 'min(620px, 94vw)' });
    this.busy = false;
    if (r === null) return; // закрыли окно — клиент ждёт дальше
    if (r === 'no') {
      await this.speak([[c.info.speaker, 'Жаль... Ну, может, в другой раз.']], c.info);
      this.state.today.declined++;
      if (c.info.regular) this.state.regulars[c.info.regular.id].declined++;
      this.day.leave(c);
      return;
    }
    if (r === 'wait') {
      this.day.sendToSofa(c);
      c.npc.setBadge('⌛');
      return;
    }
    if (typeof r === 'string' && r.startsWith('emp:')) {
      const e = this.state.staff.find((x) => x.id === r.slice(4));
      this.day.assignStaff(c, e);
      this.ui.toast(`${e.name} берёт ${c.info.pet.name} в работу.`, 'good');
      return;
    }
    if (r === 'self') await this.groomSelf(c);
  }

  async groomSelf(c) {
    const S = this.salon;
    const s = this.state;
    this.busy = true;
    this.day.sendToSofa(c);
    c.status = 'self';
    c.npc.setBadge('✂', '#e6f8f2');
    const pet = c.pet;
    await this.ui.fade(async () => {
      pet.anim.walk = 0;
      pet.root.position.copy(S.tablePos);
      pet.root.rotation.set(0, Math.PI / 2, 0);
      this.player.place(S.tables[0].stand, Math.PI);
      this.player.root.visible = false;
      this.rig.set(S.tables[0].stand.clone().add(new THREE.Vector3(0, 1.55, 0.1)), S.tablePos);
    });
    this.mode = 'groom';
    this.ui.clearHud();
    const tutorial = s.day === 1 && c.info.regular?.id === 'zina' && !s.flags.tutorialDone;
    const session = new GroomSession(this, { pet, order: c.order, client: { name: c.info.name }, tutorial });
    this.session = session;
    const result = await session.start();
    this.session = null;
    s.flags.tutorialDone = true;
    this.mode = 'story';
    await this.ui.fade(async () => {
      this.playerToDesk();
      c.npc.stand();
      c.npc.place(S.clientAtDesk, Math.PI / 2);
      pet.root.rotation.set(0, Math.PI / 2, 0);
      pet.anim.happy = result.score > 0.7 ? 1.5 : 0;
      c.npc.setFollower(pet);
      c.npc.setBadge(null);
      this.enterFps();
      this.rig.fpsLookAt(this.headOf(c.npc), 0.01);
    });
    await this.payout(c, result);
    this.day.leave(c);
    save(s);
    this.busy = false;
    this.hub();
  }

  async payout(c, result) {
    const s = this.state;
    const res = this.day.settle(c, result.score, {});
    const { stars, pay, tip, mood } = res;
    this.audio.play(mood === 'bad' ? 'fail' : 'success');
    if (mood === 'great') {
      c.pet.anim.happy = 2;
      for (let i = 0; i < 3; i++) this.particles.emit('heart', c.pet.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, 0.6, 0), 4, { spread: 0.8 });
    }
    const rows = result.items.map((it) => h('tr', h('td', it.label), h('td', it.q >= 0.85 ? '✓ ' + Math.round(it.q * 100) + '%' : Math.round(it.q * 100) + '%')));
    const starEls = starsText(stars).split('').map((ch, i) => h('span', { style: { animationDelay: `${i * 0.12}s` } }, ch));
    const content = h('div.result', { style: { width: 'auto', padding: 0 } },
      h('div.bigstars', starEls),
      h('div', { style: { fontWeight: 800, color: '#7c6a76' } }, `Оценка ${stars.toFixed(1)} · время ${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, '0')}`),
      h('table', rows),
      result.notes.length ? h('div', { style: { color: '#e5484d', fontWeight: 700 } }, result.notes.join(' · ')) : null,
      h('div.quote', `«${c.info.react[mood]}»`),
      h('div.money', `+${formatMoney(pay)}`, tip ? h('span', { style: { fontSize: '18px', color: '#ff6f96' } }, `  +${formatMoney(tip)} чаевые`) : null),
      h('div', { style: { fontWeight: 700, color: '#7c6a76', marginTop: '6px' } }, `Репутация: ${res.oldRep.toFixed(2)} → ${res.newRep.toFixed(2)} · опыт грумера: ${s.xp}`),
      res.levelUp ? h('div', { style: { fontWeight: 900, color: '#8a6cf0', marginTop: '8px' } }, `Новый уровень ${s.level}! Очко навыка — потратьте на компьютере («Навыки»).`) : null,
      res.extra ? h('div', { style: { fontWeight: 800, color: '#3fbf9f', marginTop: '8px' } }, res.extra) : null);
    this.audio.play('coins');
    await this.ui.modal('Работа сдана!', `${c.info.name} и ${c.info.pet.name}`, content, [{ label: 'Отлично', cls: '.primary' }], { width: 'min(560px, 94vw)' });
  }

  async endDay() {
    const s = this.state;
    const T = s.today;
    if (!T || this.busy) return;
    if (!T.open) return this.openDay();
    if (!this.day.idle() && !T.closing) {
      const ok = await this.ui.modal('Закрыть раньше?', null, h('p', { style: { fontWeight: 700 } }, 'Кто-то ещё ждёт или должен прийти по записи. Они уйдут недовольными.'),
        [{ label: 'Отмена', value: 0 }, { label: 'Закрыть', cls: '.primary', value: 1 }]);
      if (ok !== 1) return;
      for (const c of this.day.clients.filter((x) => ['desk', 'sofa', 'arriving'].includes(x.status))) {
        T.missed++;
        this.day.leave(c, true);
      }
      T.missed += T.appts.filter((a) => !a.spawned).length;
      s.rep = clamp(s.rep - 0.05 * T.appts.filter((a) => !a.spawned).length, 1, 5);
    }
    if (this.day.jobs.length) return this.ui.toast('Сотрудники ещё работают — дождитесь их.', 'bad');
    this.busy = true;
    const c = SALONS[s.salon];
    const salaries = s.staff.reduce((a, e) => a + e.salary, 0);
    const avg = T.stars.length ? T.stars.reduce((a, b) => a + b, 0) / T.stars.length : 0;
    s.money -= c.rent + salaries;
    const expenses = c.rent + salaries + (T.supplies || 0);
    s.finance.push({ day: s.day, served: T.served, income: T.income, tips: T.tips, expenses });
    if (s.finance.length > 60) s.finance.shift();
    // заявки на завтра: онлайн-запись принимает сама, остальные сгорают
    let auto = 0;
    if (s.site.upgrades.includes('widget')) for (const r of s.requests.filter((x) => x.day === s.day + 1)) if (this.day.acceptRequest(r.id)) auto++;
    const lost = s.requests.filter((x) => x.day <= s.day + 1).length;
    s.requests = s.requests.filter((x) => x.day > s.day + 1);
    const content = h('div.result', { style: { width: 'auto', padding: 0 } },
      h('table',
        h('tr', h('td', 'Клиентов обслужено'), h('td', String(T.served))),
        h('tr', h('td', 'Не дождались / отказ'), h('td', `${T.missed} / ${T.declined}`)),
        h('tr', h('td', 'Средняя оценка'), h('td', T.stars.length ? `${avg.toFixed(1)} ★` : '—')),
        h('tr', h('td', 'Выручка'), h('td', formatMoney(T.income))),
        h('tr', h('td', 'Чаевые'), h('td', formatMoney(T.tips))),
        h('tr', h('td', 'Аренда'), h('td', `−${formatMoney(c.rent)}`)),
        salaries ? h('tr', h('td', 'Зарплаты'), h('td', `−${formatMoney(salaries)}`)) : null,
        T.supplies ? h('tr', h('td', 'Расходники'), h('td', `−${formatMoney(T.supplies)}`)) : null,
        h('tr', h('td', h('b', 'Итог дня')), h('td', h('b', formatMoney(T.income + T.tips - expenses))))),
      auto ? h('div', { style: { fontWeight: 700, color: '#3fbf9f' } }, `Онлайн-запись приняла на завтра: ${auto}`) : null,
      lost ? h('div', { style: { fontWeight: 700, color: '#e5484d' } }, `Необработанных заявок сгорело: ${lost}. Принимайте их на компьютере!`) : null,
      h('div.money', `На счету: ${formatMoney(s.money)}`));
    await this.ui.modal(`Итоги дня ${s.day}`, SALONS[s.salon].name, content, [{ label: 'Спать 💤', cls: '.violet' }], { width: 'min(540px, 94vw)' });
    s.day++;
    s.today = null;
    if (s.adsDays > 0) s.adsDays--;
    if (s.flags.fakeReviewsDay && !s.flags.fakeReviewsDone && s.day >= s.flags.fakeReviewsDay) s.flags.fakeReviewsPending = true;
    save(s);
    await this.ui.fade(() => {
      this.day.clear();
      this.clearActors();
      this.syncStaff();
      this.player.place(new THREE.Vector3(this.salon.deskPos.x - 1.0, 0, this.salon.deskPos.z + 1.9), Math.PI);
    });
    this.busy = false;
    if (s.money < 0) {
      if (!s.flags.bailout) {
        s.flags.bailout = true;
        s.money += 5000;
        this.mode = 'story';
        await this.ui.dialog(SCENES.bankrupt);
      } else if (s.money < -3000) {
        await this.ui.slides(SCENES.gameOver);
        wipe();
        return this.showMenu();
      }
    }
    save(s);
    this.hub();
  }

  // ================================================================ сюжет
  /** Цели глав и сюжетные события (утром). true — если событие перехватило управление. */
  async storyChecks() {
    const s = this.state;
    const ch = this.chapter();
    if (s.flags.fakeReviewsPending) {
      s.flags.fakeReviewsPending = false;
      s.flags.fakeReviewsDone = true;
      this.mode = 'story';
      await this.ui.dialog(SCENES.fakeReviews);
      s.rep = clamp(s.rep - 0.4, 1, 5);
      if (s.regulars.liza.loyalty >= 2) {
        await this.visitScene('liza', SCENES.savedByLiza);
        s.rep = clamp(s.rep + 0.6, 1, 5);
      } else if (s.regulars.timur.loyalty >= 2) {
        await this.visitScene('timur', SCENES.savedByTimur);
        s.rep = clamp(s.rep + 0.5, 1, 5);
      } else {
        this.ui.toast('Отзывы-боты снизили репутацию. Подружитесь с клиентами — они вступятся за вас.', 'bad');
      }
      save(s);
      this.hub();
      return true;
    }
    if (ch && ch.check({ ...s, salonTier: salonTier(s) })) {
      s.chapter++;
      save(s);
      this.mode = 'story';
      this.ui.clearHud();
      await this.ui.slides([CHAPTERS[s.chapter].title], { dim: false });
      if (s.chapter === 2) {
        await this.ui.dialog(SCENES.chapter2);
        addMail(s, 'Тамара Павловна', 'Сарафанное радио', 'Новые постоянные клиенты будут записываться через сайт — проверяй «Запись» каждое утро. И подумай о помощнике: в «Персонале» есть кандидаты.');
      }
      if (s.chapter === 3) {
        const sold = await this.viktorVisit();
        if (sold) return true;
      }
      if (s.chapter === 4) await this.visitScene('tamara', SCENES.invitation);
      if (s.chapter === 5) await this.ui.dialog(SCENES.readyForChampionship);
      save(s);
      this.hub();
      return true;
    }
    return false;
  }

  async visitScene(person, lines) {
    const S = this.salon;
    this.ui.clearHud();
    this.audio.play('bell');
    this.playerToDesk();
    const npc = this.spawnNpc(person, S.doorIn.clone(), -Math.PI / 2, person);
    npc.appear = 0;
    this.enterFps();
    this.rig.fpsLookAt(this.headOf(npc), 0.6);
    await npc.walkTo([S.doorIn.clone().add(new THREE.Vector3(-0.7, 0, -0.35)), S.clientAtDesk]);
    npc.face(Math.PI / 2);
    await this.rig.fpsLookAt(this.headOf(npc), 0.4);
    const r = await this.ui.dialog(lines);
    npc.wave = 1.2;
    await sleep(500);
    await npc.walkTo([S.doorIn]);
    this.removeNpc(npc);
    return r;
  }

  async viktorVisit() {
    const s = this.state;
    const S = this.salon;
    this.audio.play('bell');
    this.playerToDesk();
    const npc = this.spawnNpc('viktor', S.doorIn.clone(), -Math.PI / 2, 'viktor');
    npc.appear = 0;
    this.enterFps();
    this.rig.fpsLookAt(this.headOf(npc), 0.6);
    await npc.walkTo([S.doorIn.clone().add(new THREE.Vector3(-0.7, 0, -0.35)), S.clientAtDesk]);
    npc.face(Math.PI / 2);
    await this.rig.fpsLookAt(this.headOf(npc), 0.4);
    for (;;) {
      const [choice] = await this.ui.dialog(SCENES.viktor);
      if (choice !== 2) break;
      const sure = await this.ui.modal('Продать салон?', null, h('p', { style: { fontWeight: 700 } }, 'Виктор получит ваш салон, а вы — униформу и план. Точно?'),
        [{ label: 'Нет, я передумал(а)', value: 0 }, { label: 'Подписать договор', cls: '.primary', value: 1 }]);
      if (sure === 1) {
        await this.ui.slides(SCENES.sellEnding);
        const again = await this.ui.modal('Концовка «Конвейер»', 'Одна из концовок игры', h('p', { style: { fontWeight: 700 } }, 'Вернуться к моменту выбора?'),
          [{ label: 'В главное меню', value: 0 }, { label: 'Переиграть', cls: '.primary', value: 1 }]);
        if (again !== 1) {
          s.chapter = 2;
          save(s);
          this.removeNpc(npc);
          this.showMenu();
          return true;
        }
      }
    }
    await this.ui.dialog(SCENES.viktorRefused);
    await npc.walkTo([S.doorIn]);
    this.removeNpc(npc);
    s.flags.fakeReviewsDay = s.day + 2;
    addMail(s, 'Тамара Павловна', 'Не сдавайся', 'Слышала про визит Лоска. Держись! Лучший ответ ему — довольные клиенты и салон побольше. Студия «Лапки» на Садовой как раз свободна.');
    return false;
  }

  // ================================================================ чемпионат
  async championship() {
    const s = this.state;
    if (s.flags.champRetryDay && s.day < s.flags.champRetryDay) {
      this.ui.toast(`Дополнительный тур — на ${s.flags.champRetryDay}-й день.`, 'bad');
      return;
    }
    this.busy = true;
    this.mode = 'story';
    this.ui.clearHud();
    this.audio.startMusic('stage');
    let stage;
    await this.ui.fade(() => {
      this.day.clear();
      this.clearActors();
      this.salon.group.visible = false;
      if (this.ponchik) this.ponchik.root.visible = false;
      if (this.player) this.player.root.visible = false;
      for (const n of Object.values(this.staffNpcs)) n.root.visible = false;
      stage = this.buildStage();
    });
    const judge = this.spawnNpc('judge', new THREE.Vector3(0, 0, -3.85), 0, 'judge');
    const viktor = this.spawnNpc('viktor', new THREE.Vector3(2.2, 0, 1.2), -Math.PI / 2 - 0.4, 'viktor');
    const tamara = this.spawnNpc('tamara', new THREE.Vector3(-2.6, 0, 2.2), Math.PI * 0.75, 'tamara');
    for (const n of [judge, viktor, tamara]) n.lookTarget = new THREE.Vector3(0, 1, 0);
    this.rig.set(new THREE.Vector3(0, 2.4, 5.2), new THREE.Vector3(0, 1.0, 0));
    await this.ui.dialog(SCENES.championshipIntro);
    const pet = this.spawnPet('spitz', { palette: 1, seed: 777 });
    pet.name = 'Снежок';
    pet.setCondition({ dirt: 0.6, mats: 0.85, length: 1.0, nails: true }, 777);
    pet.root.position.copy(stage.tablePos);
    pet.root.rotation.y = Math.PI / 2;
    const order = { services: ['wash', 'brush', 'cut', 'nails', 'perfume', 'bow'], style: 'lion', needs: null, par: 420, price: 0, bowColor: '#ffc23d' };
    this.mode = 'groom';
    const session = new GroomSession(this, { pet, order, client: { name: 'Чемпионат' }, championship: true, timeLimit: 480 });
    this.session = session;
    const result = await session.start();
    this.session = null;
    this.mode = 'story';
    const stars = clamp(Math.round(result.score * 10) / 2, 0.5, 5);
    this.rig.flyTo(new THREE.Vector3(0, 2.2, 4.6), new THREE.Vector3(0, 1.0, 0), 1.2);
    const extra = { stars: `${stars.toFixed(1)}★` };
    if (stars >= 4) {
      this.audio.play('fanfare');
      for (let i = 0; i < 8; i++) this.particles.emit('confetti', new THREE.Vector3((Math.random() - 0.5) * 4, 3.2, (Math.random() - 0.5) * 2), new THREE.Vector3(0, -0.2, 0), 30, { spread: 1.5 });
      await this.ui.dialog(SCENES.championshipWin, extra);
      s.flags.trophy = true;
      s.chapter = 6;
      s.rep = clamp(s.rep + 0.3, 1, 5);
      s.money += 50000;
      this.ui.toast('Приз чемпионата: 50 000 ₽ и золотой кубок!', 'good');
      await sleep(600);
      await this.ui.slides(SCENES.epilogue);
    } else {
      this.audio.play('fail');
      await this.ui.dialog(SCENES.championshipLose, extra);
      s.flags.champRetryDay = s.day + 3;
    }
    save(s);
    await this.ui.fade(() => {
      this.clearActors();
      this.removePet(pet);
      stage.group.parent.remove(stage.group);
      this.setSalon(s.salon);
      this.audio.startMusic('salon');
    });
    this.busy = false;
    this.hub();
  }

  buildStage() {
    const g = new THREE.Group();
    const a = this.assets;
    const add = (name, x, y, z, ry = 0) => {
      const o = a.node('salon_props', name, { cloneMaterials: true });
      o.position.set(x, y, z);
      o.rotation.y = ry;
      g.add(o);
      return o;
    };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: '#1e1828', roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    add('Stage', 0, 0, 0);
    const table = add('GroomTable', 0, 0.35, 0);
    Assets.tint(table, ['AccentMat'], '#f2c14e');
    add('JudgesTable', 0, 0, -3.2);
    add('Spotlight', -3.2, 0, 1.8, Math.PI * 0.8);
    add('Spotlight', 3.2, 0, 1.8, -Math.PI * 0.8);
    add('Trophy', 0, 0.77, -3.15);
    for (let i = 0; i < 7; i++) add('Chair', -3.6 + i * 1.2, 0, 4.8, Math.PI);
    const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 6, 64, 1, true, Math.PI * 0.6, Math.PI * 0.8),
      new THREE.MeshStandardMaterial({ color: '#3a2552', side: THREE.BackSide, roughness: 0.8 }));
    backdrop.position.y = 3;
    g.add(backdrop);
    g.add(new THREE.HemisphereLight('#c9b8ff', '#2a1d36', 0.5));
    for (const [x, c] of [[-3, '#ffd6f0'], [3, '#d6e6ff']]) {
      const sp = new THREE.SpotLight(c, 40, 12, 0.45, 0.5, 1.5);
      sp.position.set(x, 4.5, 3);
      sp.target.position.set(0, 0.8, 0);
      sp.castShadow = true;
      sp.shadow.mapSize.set(1024, 1024);
      g.add(sp, sp.target);
    }
    const key = new THREE.DirectionalLight('#fff2e0', 1.2);
    key.position.set(1, 5, 4);
    g.add(key);
    this.scene.add(g);
    this.scene.background = new THREE.Color('#140f1c');
    furLighting.uLightDir.value.set(0.2, 1, 0.6).normalize();
    furLighting.uLightColor.value.set('#fff0f6').multiplyScalar(1.1);
    furLighting.uSky.value.set('#8a78c8').multiplyScalar(0.45);
    furLighting.uGround.value.set('#2a1d36');
    return { group: g, tablePos: new THREE.Vector3(0, 0.35 + 0.872, 0) };
  }
}

export { CLOSE };
