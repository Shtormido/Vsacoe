import * as THREE from 'three';
import { Audio } from '../audio/Audio.js';
import { BREEDS, STYLES } from '../data/breeds.js';
import { PET_NAMES, REGULARS, REGULAR_BY_ID, WALKIN_GREETS, WALKIN_PEOPLE, WALKIN_REACT } from '../data/clients.js';
import { SALONS, SALON_ORDER } from '../data/salons.js';
import { SHOP, SHOP_CATS } from '../data/shop.js';
import { CHAPTERS, PROLOGUE, SCENES, SPEAKERS, TIPS } from '../data/story.js';
import { Assets } from '../engine/Assets.js';
import { createRenderer } from '../engine/Renderer.js';
import { applyQuality, config } from '../config.js';
import { furLighting } from '../fur/FurMaterial.js';
import { Pet } from '../pet/Pet.js';
import { UI, h, iconEl, starsText } from '../ui/UI.js';
import { clamp, formatMoney, mulberry32, pick, plural, sleep } from '../util/math.js';
import { CameraRig } from '../world/CameraRig.js';
import { Npc } from '../world/Npc.js';
import { Particles } from '../world/Particles.js';
import { Salon } from '../world/Salon.js';
import { GroomSession } from './GroomSession.js';
import { load, loadSettings, newState, salonTier, save, saveSettings, wipe } from './State.js';

const PRICES = { wash: 500, dry: 150, brush: 350, cut: 900, nails: 300, perfume: 200, bow: 150 };
const PAR = { wash: 70, brush: 45, cut: 100, nails: 25, perfume: 12, bow: 10 };
const BOW_COLORS = ['#ff4f81', '#8a6cf0', '#3fbf9f', '#ffc23d', '#4aa3df'];

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
    this.salon = null;
    this.session = null;
    this.state = null;
    this.mode = 'boot';
    this.busy = false;
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: false });
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

  update(dt) {
    if (this.mode === 'menu' || this.mode === 'select') {
      const a = this.time * 0.08;
      const S = this.salon;
      if (S) {
        const r = Math.max(S.W, S.D) * 0.55;
        this.camera.position.set(Math.sin(a) * r * 0.9, S.H * 0.62, Math.cos(a) * r * 0.7 + S.D * 0.25);
        this.camera.lookAt(0, 0.9, -0.3);
      }
    } else {
      this.rig.update(dt);
    }
    for (const n of this.npcs) n.update(dt);
    for (const p of this.pets) if (!(this.session && this.session.pet === p)) p.update(dt, p.stressDisplay || 0);
    if (this.ponchik) this.ponchik.lookAt(this.camera.position);
    this.session?.update(dt);
    this.salon?.update(dt, this.time);
    this.particles.setScale(this.renderer.domElement.height);
    this.particles.update(dt);
  }

  _globalKey(e) {
    if (e.code === 'Escape' && this.mode === 'hub' && !this.busy && !document.querySelector('.modal-back')) this.pauseMenu();
    if (e.code === 'Escape' && this.mode === 'groom' && this.session && !this.session.paused && !document.querySelector('.modal-back')) {
      this.groomPause();
    }
  }

  // ---------------------------------------------------------------- мир
  setSalon(id, { withPonchik = true } = {}) {
    this.clearActors();
    this.salon?.dispose();
    if (this.ponchik) {
      const old = this.ponchik;
      old.dispose();
      this.pets = this.pets.filter((p) => p !== old);
      this.ponchik = null;
    }
    this.salon = new Salon(this, id, { owned: this.state?.owned || [], flags: this.state?.flags || {} });
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

  // ================================================================ меню
  async showMenu() {
    this.mode = 'menu';
    this.ui.clearHud();
    const saved = load();
    this.state = saved;
    this.setSalon(saved?.salon || 'studio');
    this.audio.startMusic();
    this.ui.mainMenu({
      hasSave: !!saved,
      onContinue: () => this.continueGame(),
      onNew: () => this.newGame(),
      onSettings: () => this.settingsModal(),
      onAbout: () => this.ui.modal('Об игре', null, h('div', { style: { fontWeight: 600, lineHeight: 1.6, fontSize: '16px' } },
        h('p', '«Пушистый салон» — симулятор грумера. Откройте свой салон, купите инструменты, мойте, сушите, вычёсывайте и стригите питомцев, заводите постоянных клиентов и победите на чемпионате «Золотые ножницы».'),
        h('p', 'Все 3D-модели — собаки, кошка, люди, мебель и инструменты — созданы процедурно скриптами Blender (папка blender/). Шерсть — многослойный шейдер, реагирующий на воду, шампунь, фен, расчёску и машинку в реальном времени.'),
        h('p', 'Управление: ЛКМ — инструмент, ПКМ — вращение камеры, колесо — зум, 1–0 — инструменты, Tab — подсказка длины, Esc — пауза.'))),
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
    await this.ui.fade(() => {
      this.setSalon(this.state.salon);
    });
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
    // Наставница встречает в учебной студии курсов
    await this.ui.fade(() => {
      this.setSalon('studio', { withPonchik: true });
      const S = this.salon;
      this.spawnNpc('tamara', S.clientAtDesk.clone(), Math.PI / 2, 'tamara');
      this.rig.set(S.cams.reception.pos, S.cams.reception.target);
      this.mode = 'story';
    });
    await this.ui.dialog(SCENES.mentor);
    await this.chooseSalon(true);
  }

  // ================================================================ выбор салона
  async chooseSalon(first = false) {
    this.mode = 'select';
    this.ui.clearHud();
    let idx = 0;
    const order = SALON_ORDER;
    const current = this.state.salon;
    if (current) idx = Math.min(order.length - 1, order.indexOf(current) + 1);
    return new Promise((resolve) => {
      const show = async () => {
        const id = order[idx];
        const c = SALONS[id];
        await this.ui.fade(() => this.setSalon(id, { withPonchik: false }));
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
              h('span', `🐾 до ${c.capacity} клиентов в день`),
              h('span', `✨ цены ×${c.prestige}`)),
            refund ? h('div', { style: { fontWeight: 700, color: '#7c6a76', marginBottom: '8px' } }, `Продажа текущего салона вернёт ${formatMoney(refund)}. К оплате: ${formatMoney(cost)}`) : null,
            h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
              h('button.primary', {
                disabled: !canBuy,
                onclick: async () => {
                  this.audio.play('coins');
                  this.state.money -= cost;
                  this.state.salon = id;
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

  // ================================================================ хаб
  chapter() {
    return CHAPTERS[this.state.chapter];
  }

  async hub() {
    this.mode = 'hub';
    this.busy = false;
    this.ui.clear('screen');
    const s = this.state;
    this.rig.flyTo(this.salon.cams.overview.pos, this.salon.cams.overview.target, 1.2);
    if (await this.storyChecks()) return;
    this.ui.topbar(s, this.chapter());
    this.ui.hubbar([
      { icon: '🛒', label: 'Магазин', fn: () => this.shop() },
      { icon: '🏠', label: 'Помещение', fn: () => this.salonInfo() },
      { icon: '📇', label: 'Картотека', fn: () => this.cardFile() },
      { icon: '⏸', label: 'Меню', fn: () => this.pauseMenu() },
    ]);
    const actions = [];
    if (!s.today) actions.push({ label: '☀ Открыть салон', fn: () => this.openDay() });
    else if (s.today.queue.length) actions.push({ label: `🔔 Следующий клиент (${s.today.queue.length})`, fn: () => this.nextClient() });
    else actions.push({ label: '🌙 Закрыть день', cls: '.violet', fn: () => this.endDay() });
    if (s.chapter === 5 && !s.today) actions.push({ label: '🏆 Чемпионат!', cls: '.mint', fn: () => this.championship() });
    this.ui.actionbar(actions);
  }

  refreshTop() {
    if (this.mode === 'hub') this.ui.topbar(this.state, this.chapter());
  }

  async pauseMenu() {
    const r = await this.ui.modal('Пауза', `День ${this.state.day} · ${this.state.name}`, h('div'),
      [{ label: 'Настройки', value: 'settings' }, { label: 'Сохранить и выйти', value: 'exit' }, { label: 'Продолжить', cls: '.primary', value: 'go' }]);
    if (r === 'settings') await this.settingsModal();
    if (r === 'exit') {
      save(this.state);
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

  // ---------------------------------------------------------------- магазин
  async shop() {
    let cat = 'tools';
    const s = this.state;
    const content = h('div');
    const render = () => {
      const tabs = h('div.tabs', Object.entries(SHOP_CATS).map(([k, v]) => h(`button${k === cat ? '.on' : ''}`, {
        onclick: () => { cat = k; render(); },
      }, v)));
      const grid = h('div.grid', SHOP.filter((it) => it.cat === cat).map((it) => {
        const owned = s.owned.includes(it.id) && !it.repeatable;
        const locked = it.needs && !s.owned.includes(it.needs);
        const afford = s.money >= it.price;
        return h(`div.card${owned ? '.owned' : ''}`,
          h('div.icon', iconEl(it.icon)),
          h('div.info',
            h('div.title', it.name),
            h('div.desc', it.desc),
            h('div.row',
              h('span.price', formatMoney(it.price)),
              owned ? h('span.badge', 'Куплено')
                : locked ? h('span.badge.warn', 'Нужна «Стриж»')
                  : h('button.primary', {
                    disabled: !afford,
                    onclick: () => {
                      s.money -= it.price;
                      if (it.id === 'ads') s.adsDays += 5;
                      else s.owned.push(it.id);
                      this.audio.play('coins');
                      this.ui.toast(`Куплено: ${it.name}`, 'good');
                      save(s);
                      if (['sofa', 'coffee', 'decor', 'neon', 'music'].includes(it.id)) this.rebuildSalonKeepActors();
                      render();
                      this.refreshTop();
                    },
                  }, it.id === 'ads' && s.adsDays ? `Ещё (${s.adsDays} дн.)` : 'Купить'))));
      }));
      content.replaceChildren(tabs, grid);
      subtitle.textContent = `На счету: ${formatMoney(s.money)}`;
    };
    const subtitle = h('span');
    render();
    await this.ui.modal('Магазин «ГрумМаркет»', subtitle, content);
  }

  rebuildSalonKeepActors() {
    const pon = this.ponchik;
    const old = this.salon;
    this.salon = new Salon(this, old.id, { owned: this.state.owned, flags: this.state.flags });
    old.dispose();
    this.scene.add(this.salon.group);
    this.salon.applyFurLighting();
    if (pon) pon.root.position.copy(this.salon.bedPos).setY(0.08);
  }

  async salonInfo() {
    const s = this.state;
    const c = SALONS[s.salon];
    const r = await this.ui.modal(c.name, c.district, h('div', { style: { fontWeight: 600, lineHeight: 1.6 } },
      h('p', c.desc),
      h('p', `Аренда: ${formatMoney(c.rent)} в день · до ${c.capacity} клиентов · цены ×${c.prestige}`),
      h('p', 'Хотите расти? Можно переехать в помещение получше: текущее продаётся за половину цены.')),
    [{ label: 'Закрыть', value: 0 }, { label: 'Смотреть помещения', cls: '.primary', value: 1, disabled: !!s.today }]);
    if (r === 1) {
      this.ui.clearHud();
      await this.chooseSalon(false);
    }
  }

  async cardFile() {
    const s = this.state;
    const list = h('div', REGULARS.map((r) => {
      const st = s.regulars[r.id];
      const known = st.visits > 0;
      return h('div.regular',
        h(`div.portrait${known ? '' : '.locked'}`, { style: { backgroundImage: `url(portraits/${r.person}.png)` } }),
        h('div', { style: { flex: 1 } },
          h('h4', known ? r.name : '???', known ? h('span', { style: { color: '#7c6a76', fontWeight: 700, fontSize: '15px' } }, ` · ${r.pet.name}, ${BREEDS[r.pet.breed].name.toLowerCase()}`) : null),
          known ? h('div.hearts', '♥'.repeat(st.loyalty) + '♡'.repeat(5 - st.loyalty), h('span', { style: { color: '#7c6a76', fontSize: '13px', marginLeft: '8px' } }, `визитов: ${st.visits}`)) : h('div', { style: { color: '#7c6a76', fontWeight: 600 } }, s.chapter >= r.chapter ? 'Скоро заглянет в салон' : `Появится в главе ${r.chapter}`),
          known ? h('ul', r.bio.map((b, i) => h(`li${st.loyalty >= i ? '' : '.lock'}`, st.loyalty >= i ? b : 'Повышайте лояльность, чтобы узнать больше...'))) : null));
    }));
    await this.ui.modal('Картотека постоянных клиентов', 'Отличная работа (4★ и выше) повышает лояльность', list);
  }

  // ================================================================ день
  openDay() {
    const s = this.state;
    const cap = SALONS[s.salon].capacity;
    const rng = mulberry32(s.day * 7919 + 13);
    const queue = [];
    // постоянные клиенты, которым пора
    for (const r of REGULARS) {
      const st = s.regulars[r.id];
      if (s.chapter < r.chapter) continue;
      if (s.day - st.lastDay < r.interval) continue;
      if (r.id === 'zina' && s.day === 1) {
        queue.unshift({ regular: r.id });
        continue;
      }
      if (queue.filter((q) => q.regular).length < 2) queue.push({ regular: r.id });
    }
    let n = s.day === 1 ? 2 : clamp(Math.round(2 + (s.rep - 2.5) * 1.6), 2, cap);
    if (s.adsDays > 0) n += 1;
    n = Math.min(n, cap + (s.adsDays > 0 ? 1 : 0));
    while (queue.length < n) queue.push({ walkin: true, seed: Math.floor(rng() * 1e6) });
    s.today = { queue, income: 0, tips: 0, stars: [], served: 0, declined: 0 };
    save(s);
    this.audio.play('bell');
    this.ui.toast(`Салон открыт! Сегодня ${queue.length} ${plural(queue.length, 'клиент', 'клиента', 'клиентов')}.`, 'good');
    this.hub();
  }

  buildClient(spec) {
    const s = this.state;
    if (spec.regular) {
      const r = REGULAR_BY_ID[spec.regular];
      const st = s.regulars[r.id];
      const tpl = r.orders[Math.min(st.visits, r.orders.length - 1)];
      return {
        regular: r, name: r.name, person: r.person, speaker: r.id,
        pet: { ...r.pet }, condition: r.condition, tpl, needs: r.needs,
        greet: r.greet[Math.min(st.visits, r.greet.length - 1)], tip: r.tip, react: r.react,
      };
    }
    const rng = mulberry32(spec.seed);
    const who = pick(WALKIN_PEOPLE, rng);
    const breedIds = Object.keys(BREEDS);
    const breed = pick(breedIds, rng);
    const B = BREEDS[breed];
    const style = pick(B.styles, rng);
    const tpl = {
      wash: rng() < 0.9, brush: rng() < 0.8, style: rng() < 0.85 ? style : null,
      nails: rng() < 0.45, bow: rng() < 0.25, perfume: rng() < 0.25,
    };
    if (!tpl.wash && !tpl.brush && !tpl.style) tpl.wash = true;
    const petName = pick(PET_NAMES, rng);
    const greet = pick(WALKIN_GREETS, rng).replace('{pet}', petName).replace('{style}', tpl.style ? STYLES[tpl.style].name : 'просто помыться');
    return {
      name: pick(who.names, rng), person: who.person, speaker: 'walkin',
      pet: { name: petName, breed, palette: Math.floor(rng() * B.palettes.length), seed: spec.seed },
      condition: { dirt: 0.3 + rng() * 0.7 * B.dirt, mats: 0.2 + rng() * 0.8 * B.mats }, tpl, greet, tip: 0.08,
      react: { great: pick(WALKIN_REACT.great, rng), good: pick(WALKIN_REACT.good, rng), bad: pick(WALKIN_REACT.bad, rng) },
    };
  }

  makeOrder(client) {
    const t = client.tpl;
    const own = this.state.owned;
    const services = [];
    if (t.wash) services.push('wash');
    if (t.brush) services.push('brush');
    if (t.style) services.push('cut');
    if (t.nails && own.includes('nailclip')) services.push('nails');
    if (t.perfume && own.includes('perfume')) services.push('perfume');
    if (t.bow && own.includes('bows')) services.push('bow');
    const size = BREEDS[client.pet.breed].size;
    const par = (40 + services.reduce((a, k) => a + (PAR[k] || 0), 0)) * size;
    const priceList = services.flatMap((k) => (k === 'wash' ? ['wash', 'dry'] : [k]));
    const c = SALONS[this.state.salon];
    const mult = size * c.prestige * (own.includes('neon') ? 1.08 : 1);
    const price = Math.round(priceList.reduce((a, k) => a + PRICES[k], 0) * mult / 10) * 10;
    return {
      services, style: t.style, needs: client.needs, par, price,
      bowColor: BOW_COLORS[(client.pet.seed || 1) % BOW_COLORS.length],
    };
  }

  orderCard(client, order) {
    const B = BREEDS[client.pet.breed];
    const lines = [];
    const L = { wash: 'Мытьё и сушка', brush: 'Вычёсывание колтунов', cut: `Стрижка «${order.style ? STYLES[order.style].name : ''}»`, nails: 'Стрижка когтей', perfume: 'Парфюм', bow: 'Бантик' };
    for (const k of order.services) lines.push(h('li', h('span.check', '•'), h('span', L[k])));
    const warn = order.needs && !this.state.owned.includes(order.needs)
      ? h('div.note', { style: { color: '#e5484d', fontWeight: 800, marginTop: '10px' } }, '⚠ Нужен гипоаллергенный шампунь — его нет. Купите в магазине до следующего визита.') : null;
    return h('div',
      h('div', { style: { fontWeight: 800, color: '#7c6a76', marginBottom: '8px' } }, `${client.pet.name} · ${B.name}, окрас «${B.palettes[client.pet.palette % B.palettes.length].name}»`),
      h('ul', { style: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: 700, fontSize: '16px' } }, lines),
      h('div', { style: { marginTop: '12px', fontWeight: 900, fontSize: '18px' } }, `Стоимость: ${formatMoney(order.price)}`, h('span', { style: { color: '#7c6a76', fontSize: '14px', fontWeight: 700 } }, ` · норматив ~${Math.round(order.par / 60 + 0.4)} мин`)),
      warn);
  }

  async nextClient() {
    if (this.busy) return;
    this.busy = true;
    this.mode = 'client';
    this.ui.clearHud();
    const s = this.state;
    const spec = s.today.queue.shift();
    const client = this.buildClient(spec);
    const S = this.salon;
    const order = this.makeOrder(client);
    // приход
    this.audio.play('bell');
    const npc = this.spawnNpc(client.person, S.doorIn.clone().add(new THREE.Vector3(0.3, 0, 0)), -Math.PI / 2, client.speaker);
    npc.appear = 0;
    const pet = this.spawnPet(client.pet.breed, { palette: client.pet.palette, seed: client.pet.seed });
    pet.name = client.pet.name;
    pet.setCondition({ ...client.condition, length: 1.0, nails: order.services.includes('nails') }, client.pet.seed);
    npc.setFollower(pet);
    this.ponchik?.lookAt(npc.pos);
    this.cam('reception', 1.4);
    if (this.ponchik) setTimeout(() => this.audio.play('bark'), 600);
    await npc.walkTo([S.doorIn.clone().add(new THREE.Vector3(-0.6, 0, -0.3)), S.clientAtDesk]);
    npc.face(Math.PI / 2);
    await this.speak([[client.speaker, client.greet]], client);
    // карточка заказа
    const accept = await this.ui.modal(`Заказ: ${client.name}`, 'Возьмётесь?', this.orderCard(client, order),
      [{ label: 'Отказать', value: 0 }, { label: 'Принять', cls: '.primary', value: 1 }], { width: 'min(520px, 94vw)' });
    if (accept !== 1) {
      await this.speak([[client.speaker, 'Жаль... Ну, может, в другой раз.']], client);
      if (client.regular) s.regulars[client.regular.id].declined++;
      s.today.declined++;
      await this.leave(npc, pet);
      save(s);
      return this.hub();
    }
    // ожидание: хозяин садится, питомец — на стол
    const seat = S.seats[0];
    npc.setFollower(null);
    await this.ui.fade(async () => {
      npc.path = [];
      npc.sit(seat, S.seatYaw);
      pet.anim.walk = 0;
      pet.root.position.copy(S.tablePos);
      pet.root.rotation.set(0, Math.PI / 2, 0);
      npc.lookTarget = S.tablePos;
      this.rig.set(S.cams.overview.pos, S.cams.overview.target);
    });
    this.mode = 'groom';
    const session = new GroomSession(this, { pet, order, client, tutorial: s.day === 1 && client.regular?.id === 'zina' && !s.flags.tutorialDone });
    this.session = session;
    const result = await session.start();
    this.session = null;
    s.flags.tutorialDone = true;
    this.mode = 'client';
    // возврат питомца
    await this.ui.fade(async () => {
      npc.stand();
      npc.lookTarget = null;
      npc.place(S.clientAtDesk, Math.PI / 2);
      pet.root.rotation.set(0, Math.PI / 2, 0);
      pet.anim.happy = result.score > 0.7 ? 1.5 : 0;
      npc.setFollower(pet);
      this.rig.set(S.cams.reception.pos, S.cams.reception.target);
    });
    await this.payout(client, order, result, npc, pet);
    await this.leave(npc, pet);
    save(s);
    this.hub();
  }

  speak(lines, client) {
    // временный «говорящий» для случайного клиента
    if (client && !client.regular) SPEAKERS.walkin = { name: client.name, color: '#4a90d9', portrait: client.person };
    return this.ui.dialog(lines);
  }

  async leave(npc, pet) {
    const S = this.salon;
    await npc.walkTo([S.doorIn.clone().add(new THREE.Vector3(-0.6, 0, -0.3)), S.doorIn]);
    this.audio.play('bell');
    this.removeNpc(npc);
    this.removePet(pet);
  }

  async payout(client, order, result, npc, pet) {
    const s = this.state;
    let stars = result.score * 5 + (s.owned.includes('decor') || SALONS[s.salon].tier === 3 ? 0.2 : 0);
    stars = clamp(Math.round(stars * 2) / 2, 0.5, 5);
    const pay = Math.round(order.price * (0.35 + 0.65 * result.score) / 10) * 10;
    const reg = client.regular ? s.regulars[client.regular.id] : null;
    let tipRate = 0;
    if (stars >= 4) {
      tipRate = client.tip + (reg ? reg.loyalty * 0.02 : 0) + (s.owned.includes('coffee') ? 0.1 : 0)
        + (s.owned.includes('shampoo_premium') ? 0.1 : 0);
    }
    const tip = Math.round(order.price * tipRate * result.score / 10) * 10;
    s.money += pay + tip;
    s.today.income += pay;
    s.today.tips += tip;
    s.today.stars.push(stars);
    s.today.served++;
    s.stats.served++;
    s.stats.earned += pay + tip;
    s.stats.best = Math.max(s.stats.best, stars);
    if (stars >= 5) s.stats.perfect++;
    const oldRep = s.rep;
    s.rep = clamp(s.rep + (stars - s.rep) * 0.14, 1, 5);
    let extra = null;
    if (reg) {
      reg.visits++;
      reg.lastDay = s.day;
      const before = reg.loyalty;
      if (stars >= 4) reg.loyalty = Math.min(5, reg.loyalty + 1);
      else if (stars < 2.5) reg.loyalty = Math.max(0, reg.loyalty - 1);
      if (reg.loyalty > before) extra = `Лояльность «${client.name}» выросла! Новая запись в картотеке.`;
      if (client.regular.influencer) {
        if (stars >= 4.5) {
          s.rep = clamp(s.rep + 0.25, 1, 5);
          s.adsDays += 2;
          extra = 'Лиза выложила восторженный пост: +репутация и новые клиенты!';
        } else if (stars < 3.5) {
          s.rep = clamp(s.rep - 0.2, 1, 5);
          extra = 'Лиза написала прохладный отзыв. Репутация немного просела.';
        }
      }
    }
    // реакция
    const mood = stars >= 4 ? 'great' : stars >= 2.5 ? 'good' : 'bad';
    this.audio.play(mood === 'bad' ? 'fail' : 'success');
    if (mood === 'great') {
      pet.anim.happy = 2;
      for (let i = 0; i < 3; i++) this.particles.emit('heart', pet.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, 0.6, 0), 4, { spread: 0.8 });
    }
    const rows = result.items.map((it) => h('tr', h('td', it.label), h('td', it.q >= 0.85 ? '✓ ' + Math.round(it.q * 100) + '%' : Math.round(it.q * 100) + '%')));
    const starEls = starsText(stars).split('').map((c, i) => h('span', { style: { animationDelay: `${i * 0.12}s` } }, c));
    const content = h('div.result', { style: { width: 'auto', padding: 0 } },
      h('div.bigstars', starEls),
      h('div', { style: { fontWeight: 800, color: '#7c6a76' } }, `Оценка ${stars.toFixed(1)} · время ${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, '0')}`),
      h('table', rows),
      result.notes.length ? h('div', { style: { color: '#e5484d', fontWeight: 700 } }, result.notes.join(' · ')) : null,
      h('div.quote', `«${client.react[mood]}»`),
      h('div.money', `+${formatMoney(pay)}`, tip ? h('span', { style: { fontSize: '18px', color: '#ff6f96' } }, `  +${formatMoney(tip)} чаевые`) : null),
      h('div', { style: { fontWeight: 700, color: '#7c6a76', marginTop: '6px' } }, `Репутация: ${oldRep.toFixed(2)} → ${s.rep.toFixed(2)}`),
      extra ? h('div', { style: { fontWeight: 800, color: '#3fbf9f', marginTop: '8px' } }, extra) : null);
    this.audio.play('coins');
    await this.ui.modal('Работа сдана!', `${client.name} и ${client.pet.name}`, content, [{ label: 'Отлично', cls: '.primary' }], { width: 'min(560px, 94vw)' });
  }

  async endDay() {
    const s = this.state;
    const c = SALONS[s.salon];
    const t = s.today;
    const avg = t.stars.length ? t.stars.reduce((a, b) => a + b, 0) / t.stars.length : 0;
    s.money -= c.rent;
    const content = h('div.result', { style: { width: 'auto', padding: 0 } },
      h('table',
        h('tr', h('td', 'Клиентов обслужено'), h('td', String(t.served))),
        h('tr', h('td', 'Средняя оценка'), h('td', t.stars.length ? `${avg.toFixed(1)} ★` : '—')),
        h('tr', h('td', 'Выручка'), h('td', formatMoney(t.income))),
        h('tr', h('td', 'Чаевые'), h('td', formatMoney(t.tips))),
        h('tr', h('td', 'Аренда'), h('td', `−${formatMoney(c.rent)}`)),
        h('tr', h('td', h('b', 'Итог дня')), h('td', h('b', formatMoney(t.income + t.tips - c.rent))))),
      h('div.money', `На счету: ${formatMoney(s.money)}`));
    await this.ui.modal(`Итоги дня ${s.day}`, SALONS[s.salon].name, content, [{ label: 'Спать 💤', cls: '.violet' }], { width: 'min(520px, 94vw)' });
    s.day++;
    s.today = null;
    if (s.adsDays > 0) s.adsDays--;
    if (s.flags.fakeReviewsDay && !s.flags.fakeReviewsDone && s.day >= s.flags.fakeReviewsDay) s.flags.fakeReviewsPending = true;
    save(s);
    await this.ui.fade(() => {
      this.clearActors();
    });
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
  /** Проверяет цели глав и сюжетные события. true — если событие перехватило управление. */
  async storyChecks() {
    const s = this.state;
    if (s.today) return false;
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
      if (s.chapter === 2) await this.ui.dialog(SCENES.chapter2);
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
    const npc = this.spawnNpc(person, S.doorIn.clone(), -Math.PI / 2, person);
    npc.appear = 0;
    this.cam('reception', 1.2);
    await npc.walkTo([S.clientAtDesk]);
    npc.face(Math.PI / 2);
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
    const npc = this.spawnNpc('viktor', S.doorIn.clone(), -Math.PI / 2, 'viktor');
    npc.appear = 0;
    this.cam('reception', 1.2);
    await npc.walkTo([S.clientAtDesk]);
    npc.face(Math.PI / 2);
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
      this.clearActors();
      this.salon.group.visible = false;
      if (this.ponchik) this.ponchik.root.visible = false;
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
    const order = {
      services: ['wash', 'brush', 'cut', 'nails', 'perfume', 'bow'], style: 'lion', needs: null, par: 420, price: 0,
      bowColor: '#ffc23d',
    };
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
      this.salon.group.visible = true;
      if (this.ponchik) this.ponchik.root.visible = true;
      this.setSalon(s.salon);
      this.audio.startMusic('salon');
    });
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
