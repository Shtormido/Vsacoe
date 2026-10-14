import * as THREE from 'three';
import { Assets } from '../engine/Assets.js';
import { REGIONS, STYLES } from '../data/breeds.js';
import { SCENES } from '../data/story.js';
import { TOOLS, TOOL_BY_ID, toolParams } from '../data/tools.js';
import { h } from '../ui/UI.js';
import { computeMods } from '../data/skills.js';
import { clamp, smoothstep } from '../util/math.js';

const PAINT_TOOLS = new Set(['shower', 'shampoo', 'dryer', 'brush', 'clipper', 'scissors', 'perfume']);
const LOOP_SOUND = { shower: 'water', dryer: 'dryer', clipper: 'clipper', perfume: 'spray' };
const HOVER = { shower: 0.11, dryer: 0.13, perfume: 0.14, shampoo: 0.02, brush: 0.0, clipper: 0.0, scissors: 0.0 };
const SERVICE_LABEL = {
  wash: 'Помыть с шампунем', dry: 'Высушить', brush: 'Вычесать колтуны', cut: 'Стрижка',
  nails: 'Подстричь когти', perfume: 'Парфюм', bow: 'Бантик',
};
const WEIGHT = { wash: 1.2, dry: 0.8, brush: 1, cut: 1.6, nails: 0.6, perfume: 0.35, bow: 0.35 };

const _ray = new THREE.Raycaster();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Сессия груминга одного питомца: ввод, инструменты, стресс, оценка.
 * start() возвращает Promise с результатом, когда игрок нажмёт «Готово».
 */
export class GroomSession {
  constructor(game, { pet, order, client, tutorial = false, championship = false, timeLimit = null }) {
    this.game = game;
    this.pet = pet;
    this.order = order;
    this.client = client;
    this.tutorial = tutorial;
    this.championship = championship;
    this.timeLimit = timeLimit;
    const owned = championship
      ? ['clipper', 'clipper_pro', 'scissors_pro', 'brush_pro', 'dryer_pro', 'shower_pro', 'nailclip', 'perfume', 'bows',
        'treats', 'shampoo_hypo', 'shampoo_premium']
      : game.state.owned;
    this.owned = owned;
    this.params = toolParams(owned);
    this.tool = 'shower';
    this.guardIdx = 1;
    this.mouse = new THREE.Vector2(-9, -9);
    this.hit = null;
    this.active = false;
    this.drag = null;
    this.stress = 8;
    this.incidents = 0;
    this.elapsed = 0;
    this.perfume = 0;
    this.usedShampoo = false;
    this.guide = false;
    this.treatCd = 0;
    this.shakeCd = 4;
    this.snipT = 0;
    this.statsT = 0;
    this.hintOverride = null;
    this.hintT = 0;
    this.paused = false;
    this.mods = computeMods(game.state);
    this.temper = pet.breed.temper * (owned.includes('table_hydro') || championship ? 0.8 : 1) * (client?.temper || 1)
      * Math.max(0.3, 1 + (this.mods.stress || 0));
    this.calm = owned.includes('music') ? 1.5 : 1;
    this.stock = championship ? null : game.state.stock;   // null — без ограничений
    this.wounds = [];
    this.nickCd = 6;
    this.usedPerfume = false;
    this.jitter = new THREE.Vector3();
    this.cursors = {};
    this._bind();
  }

  // ------------------------------------------------------------ запуск
  async start() {
    const g = this.game;
    const pet = this.pet;
    const targets = this.order.services.includes('cut')
      ? STYLES[this.order.style].targets
      : { body: null, head: null, legs: null, tail: null };
    pet.setTargets(targets);
    this.targets = targets;
    pet.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pet.model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.center = sphere.center.clone();
    this.radius = sphere.radius;
    g.rig.startOrbit(this.center, {
      yaw: 0.15, pitch: 0.32, dist: sphere.radius * 2.7, min: sphere.radius * 0.9, max: sphere.radius * 5,
    });
    for (const t of TOOLS) {
      const m = g.assets.node('tools', t.model, { cloneMaterials: t.id === 'bow' });
      m.visible = false;
      m.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.raycast = () => {};
        }
      });
      g.scene.add(m);
      this.cursors[t.id] = m;
    }
    if (this.order.bowColor) Assets.tint(this.cursors.bow, ['Ribbon'], this.order.bowColor);
    this._buildHud();
    this.selectTool(this.tutorial ? 'shower' : 'shower');
    this.stats = pet.stats();
    this.startQ = this.evaluateItems(this.stats);
    this._refreshOrder();
    if (this.tutorial) {
      this.paused = true;
      await g.ui.dialog(SCENES.tutorial);
      this.paused = false;
    }
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  // ------------------------------------------------------------ ввод
  _bind() {
    const el = this.game.renderer.domElement;
    this._handlers = {
      pointerdown: (e) => this._down(e),
      pointermove: (e) => this._move(e),
      pointerup: (e) => this._up(e),
      pointerleave: () => {
        this.active = false;
        this.mouse.set(-9, -9);
      },
      wheel: (e) => this._wheel(e),
      contextmenu: (e) => e.preventDefault(),
    };
    for (const [k, f] of Object.entries(this._handlers)) el.addEventListener(k, f, { passive: k !== 'wheel' });
    this._key = (e) => this._keydown(e);
    window.addEventListener('keydown', this._key);
  }

  _unbind() {
    const el = this.game.renderer.domElement;
    for (const [k, f] of Object.entries(this._handlers)) el.removeEventListener(k, f);
    window.removeEventListener('keydown', this._key);
  }

  _setMouse(e) {
    const r = this.game.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _down(e) {
    if (this.paused) return;
    this.game.audio.unlock();
    this._setMouse(e);
    this._raycast();
    if (e.button === 2 || e.button === 1 || (e.button === 0 && !this.hit)) {
      this.drag = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button === 0 && this.hit) {
      this.active = true;
      this._oneShot();
    }
  }

  _move(e) {
    this._setMouse(e);
    if (this.drag) {
      this.game.rig.rotate(e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag = { x: e.clientX, y: e.clientY };
    }
  }

  _up() {
    this.active = false;
    this.drag = null;
  }

  _wheel(e) {
    e.preventDefault();
    if (this.tool === 'clipper' && e.shiftKey) {
      this.setGuard(this.guardIdx + (e.deltaY > 0 ? -1 : 1));
      return;
    }
    this.game.rig.zoom(e.deltaY);
  }

  _keydown(e) {
    if (this.paused) return;
    const t = TOOLS.find((x) => x.code === e.code);
    if (t) {
      this.selectTool(t.id);
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      this.toggleGuide();
    }
    if (e.code === 'KeyQ') this.setGuard(this.guardIdx - 1);
    if (e.code === 'KeyE') this.setGuard(this.guardIdx + 1);
    if (e.code === 'KeyA') this.game.rig.rotate(-60, 0);
    if (e.code === 'KeyD') this.game.rig.rotate(60, 0);
    if (e.code === 'KeyW') this.game.rig.rotate(0, 40);
    if (e.code === 'KeyS') this.game.rig.rotate(0, -40);
  }

  hasTool(id) {
    const t = TOOL_BY_ID[id];
    return !t.requires || this.owned.includes(t.requires);
  }

  /** Есть ли расходник на складе (на чемпионате — всегда). */
  has(item) {
    return !this.stock || (this.stock[item] || 0) > 0;
  }

  use(item) {
    if (this.stock) this.stock[item] = Math.max(0, (this.stock[item] || 0) - 1);
    this._refreshStock?.();
  }

  get injured() {
    return !this.championship && !!this.game.state.injury;
  }

  healPlayer() {
    const g = this.game;
    if (!g.state.injury) return;
    if (!this.has('firstaid')) {
      g.ui.toast('Аптечек нет — закажите на компьютере (Расходники).', 'bad');
      return;
    }
    this.use('firstaid');
    g.state.injury = null;
    g.audio.play('pop');
    g.ui.toast('Рана обработана — руки больше не дрожат.', 'good');
    this._refreshInjury();
  }

  selectTool(id) {
    if (!this.hasTool(id)) {
      this.game.ui.toast(`Нужно купить в магазине: ${TOOL_BY_ID[id].name}`, 'bad');
      return;
    }
    this.game.audio.stopLoops();
    this.tool = id;
    this.game.audio.play('click');
    for (const [tid, btn] of Object.entries(this.toolBtns)) btn.classList.toggle('on', tid === id);
    this.guardsEl.style.display = id === 'clipper' ? '' : 'none';
    if (id === 'clipper') this._renderGuards();
    this.pet.highlightNails(id === 'nails');
  }

  setGuard(i) {
    const g = this.params.clipper.guards;
    this.guardIdx = clamp(i, 0, g.length - 1);
    this._renderGuards();
  }

  toggleGuide() {
    this.guide = !this.guide;
    this.pet.setGuide(this.guide);
    this.guideBtn.classList.toggle('mint', this.guide);
  }

  // ------------------------------------------------------------ кадр
  _raycast() {
    const g = this.game;
    _ray.setFromCamera(this.mouse, g.camera);
    const targets = this.tool === 'nails' ? [...this.pet.nailMeshes(), ...this.pet.raycastTargets] : this.pet.raycastTargets;
    const hits = _ray.intersectObjects(targets, false);
    if (hits.length) {
      const hh = hits[0];
      const n = hh.face ? hh.face.normal.clone().transformDirection(hh.object.matrixWorld) : UP.clone();
      if (n.dot(_ray.ray.direction) > 0) n.negate();
      this.hit = { point: hh.point.clone(), normal: n, object: hh.object };
    } else {
      this.hit = null;
    }
  }

  _placeCursor(dt) {
    const g = this.game;
    for (const [id, m] of Object.entries(this.cursors)) m.visible = id === this.tool && !this.paused;
    const m = this.cursors[this.tool];
    const fur = this.pet.breed.furMax;
    if (this.hit) {
      const n = this.hit.normal;
      const off = HOVER[this.tool] ?? 0.02;
      const lift = ['clipper', 'scissors', 'brush'].includes(this.tool) ? fur * 0.6 : fur;
      m.position.copy(this.hit.point).addScaledVector(n, lift + off);
      _q.setFromUnitVectors(UP, n);
      // повернуть ручку инструмента к камере
      const handle = new THREE.Vector3(0, 0, -1).applyQuaternion(_q);
      const toCam = g.camera.position.clone().sub(this.hit.point);
      toCam.addScaledVector(n, -toCam.dot(n)).normalize();
      handle.addScaledVector(n, -handle.dot(n)).normalize();
      let ang = Math.acos(clamp(handle.dot(toCam), -1, 1));
      if (n.dot(handle.clone().cross(toCam)) < 0) ang = -ang;
      const twist = new THREE.Quaternion().setFromAxisAngle(n, ang);
      m.quaternion.copy(twist.multiply(_q));
      const r = this._radius();
      this.pet.setCursor(r > 0 ? this.hit.point : null, r, TOOL_BY_ID[this.tool].color);
    } else {
      _ray.setFromCamera(this.mouse, g.camera);
      m.position.copy(_ray.ray.origin).addScaledVector(_ray.ray.direction, 0.45);
      m.quaternion.setFromUnitVectors(UP, g.camera.position.clone().sub(m.position).normalize().lerp(UP, 0.6).normalize());
      this.pet.setCursor(null);
    }
    // анимация инструментов
    const t = this.elapsed;
    const working = this.active && this.hit;
    if (this.tool === 'scissors') {
      const open = working ? Math.abs(Math.sin(t * 14)) * 0.35 : 0.15;
      m.traverse((o) => {
        if (o.name === 'Sc_Half-1') o.rotation.z = -0.16 - open;
        if (o.name === 'Sc_Half1') o.rotation.z = 0.16 + open;
      });
    }
    if (this.tool === 'clipper' && working) m.position.x += Math.sin(t * 90) * 0.0012;
    if (this.tool === 'nails') {
      m.traverse((o) => {
        if (o.name === 'Half-1') o.rotation.y = -0.1 - (this.snipT > 0 ? 0 : 0.15);
        if (o.name === 'Half1') o.rotation.y = 0.1 + (this.snipT > 0 ? 0 : 0.15);
      });
    }
    m.scale.setScalar(this.tool === 'bow' ? 1.1 : 1);
  }

  _radius() {
    const p = this.params[this.tool];
    return p?.radius || TOOL_BY_ID[this.tool].radius || 0;
  }

  _oneShot() {
    const g = this.game;
    const pet = this.pet;
    if (this.tool === 'nails') {
      const k = this.hit.object.userData.nailKey;
      if (k && !pet.nails[k].cut) {
        pet.setNailCut(k, true);
        g.audio.play('clip');
        this.snipT = 0.15;
        this.stress += 6 * this.temper;
        g.particles.emit('dust', this.hit.point, new THREE.Vector3(0, 0.6, 0), 6, { color: '#2a2522', spread: 1 });
        this._sound();
      } else if (!k) {
        this._hint('Кликните точно по подсвеченному когтю на лапе.', true);
      }
    } else if (this.tool === 'bow') {
      const name = this.hit.object.name;
      if (/Fur_Head|Fur_Ear/.test(name)) {
        if (!this.pet.bow) {
          if (!this.has('bows')) {
            g.ui.toast('Бантики закончились — закажите на компьютере.', 'bad');
            return;
          }
          this.use('bows');
        }
        const bow = g.assets.node('tools', 'Tool_Bow', { cloneMaterials: true });
        if (this.order.bowColor) Assets.tint(bow, ['Ribbon'], this.order.bowColor);
        pet.attachBow(bow, this.hit.point.clone().addScaledVector(this.hit.normal, pet.breed.furMax * 0.5));
        g.audio.play('pop');
        g.particles.emit('heart', this.hit.point, new THREE.Vector3(0, 0.5, 0), 6);
      } else {
        this._hint('Бантик крепится на голову или ушко.', true);
      }
    } else if (this.tool === 'firstaid') {
      const w = this.wounds.find((x) => !x.treated && x.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(this.hit.point) < 0.06);
      if (!w) {
        this._hint(this.wounds.some((x) => !x.treated) ? 'Кликните точно по красной ранке.' : 'Ран нет — и это прекрасно!', true);
        return;
      }
      if (!this.has('firstaid')) {
        g.ui.toast('Аптечек нет! Закажите на компьютере (Расходники).', 'bad');
        return;
      }
      this.use('firstaid');
      w.treated = true;
      w.mesh.material = new THREE.MeshStandardMaterial({ color: '#fff6ea', roughness: 0.8 });
      w.mesh.scale.set(1.4, 1.4, 0.5);
      g.audio.play('pop');
      g.particles.emit('heart', this.hit.point, UP, 4);
      if (this.mods.medic) this.stress = Math.max(0, this.stress - 20);
    } else if (this.tool === 'treat') {
      if (this.treatCd > 0) {
        this._hint('Не перекармливайте — подождите пару секунд.', true);
        return;
      }
      if (!this.has('treats')) {
        g.ui.toast('Лакомства закончились — закажите на компьютере.', 'bad');
        return;
      }
      this.use('treats');
      pet.eat();
      g.audio.play('eat');
      this.stress = Math.max(0, this.stress - 35 * (1 + (this.mods.treatPower || 0)));
      this.treatCd = 4;
      pet.anim.happy = 1;
      g.particles.emit('heart', this.center.clone().add(new THREE.Vector3(0, this.radius * 0.6, 0)), UP, 8, { spread: 0.8 });
    } else if (this.tool === 'shampoo') {
      g.audio.play('squish');
    }
  }

  _sound() {
    const s = this.pet.breed.sound;
    if (Math.random() < 0.5) this.game.audio.play(s === 'meow' ? 'meow' : s === 'yap' ? 'yap' : s === 'howl' ? 'bark' : 'bark');
  }

  update(dt) {
    if (this.done) return;
    const g = this.game;
    const pet = this.pet;
    if (!this.paused) this.elapsed += dt;
    this.treatCd = Math.max(0, this.treatCd - dt);
    this.snipT = Math.max(0, this.snipT - dt);
    if (this.paused) {
      g.audio.stopLoops();
      for (const m of Object.values(this.cursors)) m.visible = false;
      pet.update(dt, this.stress);
      return;
    }
    this._raycast();
    if (this.hit && this.injured) {
      const amp = 0.012 * (1 - 0.5 * (this.mods.steady || 0));
      this.hit.point.x += Math.sin(this.elapsed * 37) * amp;
      this.hit.point.y += Math.sin(this.elapsed * 29 + 1) * amp;
      this.hit.point.z += Math.cos(this.elapsed * 33) * amp;
    }
    for (const w of this.wounds) if (!w.treated) w.mesh.scale.setScalar(1 + Math.sin(this.elapsed * 8) * 0.25);
    this._placeCursor(dt);
    pet.highlightNails(this.tool === 'nails', this.elapsed);
    pet.lookAt(this.hit ? this.hit.point : g.camera.position);

    const working = this.active && this.hit && PAINT_TOOLS.has(this.tool);
    const loop = LOOP_SOUND[this.tool];
    if (loop) g.audio.loop(loop, !!working);
    let gain = 0;
    if (working) {
      const P = this.params[this.tool] || {};
      const opts = { ...P };
      const M = this.mods;
      if (this.tool === 'shower' || this.tool === 'shampoo') opts.rate = (opts.rate || 1) * (1 + (M.washRate || 0));
      if (this.tool === 'dryer') opts.power = (opts.power || 1) * (1 + (M.dryRate || 0));
      if (this.tool === 'clipper' || this.tool === 'scissors') opts.speed = (opts.speed || 1) * (1 + (M.cutSpeed || 0));
      if (this.injured) opts.rate = (opts.rate || 1) * (0.65 + 0.35 * (M.steady || 0));
      if (this.tool === 'shampoo' && !this.usedShampoo) {
        if (!this.has('shampoo')) {
          this._hint('Шампунь закончился! Закажите на компьютере (Расходники). Пока можно только смыть водой.', true);
          this.active = false;
          return;
        }
        this.use('shampoo');
      }
      if (this.tool === 'perfume' && !this.usedPerfume) {
        if (!this.has('perfume')) {
          this._hint('Парфюм закончился — закажите на компьютере.', true);
          this.active = false;
          return;
        }
        this.use('perfume');
        this.usedPerfume = true;
      }
      if (this.tool === 'clipper') opts.guard = P.guards[this.guardIdx];
      const res = this.tool === 'perfume'
        ? { work: 1, regions: { head: 0 } }
        : pet.applyTool(this.tool, this.hit.point, this._radius(), dt, opts);
      const total = Object.values(res.regions).reduce((a, b) => a + b, 0) || 1;
      const headFrac = (res.regions.head || 0) / total;
      const pt = this.hit.point;
      const n = this.hit.normal;
      const nozzle = this.cursors[this.tool].position;
      switch (this.tool) {
        case 'shower':
          this.everWet = true;
          gain = 1 + 10 * headFrac;
          g.particles.emit('water', nozzle, _v.copy(pt).sub(nozzle).normalize().multiplyScalar(2.2), 5, { spread: 0.25 });
          if (Math.random() < 0.3) g.particles.emit('water', pt, n.clone().multiplyScalar(0.8), 2, { spread: 1.2 });
          break;
        case 'shampoo':
          this.usedShampoo = true;
          if (Math.random() < 0.5) g.particles.emit('foam', pt, n.clone().multiplyScalar(0.2), 2, { spread: 0.8 });
          break;
        case 'dryer':
          gain = 1.2 + 12 * headFrac;
          g.particles.emit('air', nozzle, _v.copy(pt).sub(nozzle).normalize().multiplyScalar(2.5), 3, { spread: 0.3 });
          if (Math.random() < 0.15) g.particles.emit('water', pt, n.clone().multiplyScalar(0.6), 2, { spread: 1 });
          break;
        case 'brush':
          gain = res.mats > 0.02 ? 3.5 : 0.2;
          if (res.mats > 0.01) g.particles.emit('hair', pt, n.clone().multiplyScalar(0.5), 1, { color: this._furColor(), spread: 1 });
          if (Math.random() < 0.1 && this.stats.all.dirt > 0.2) g.particles.emit('dust', pt, n.clone().multiplyScalar(0.4), 2);
          break;
        case 'clipper':
          gain = 1.2 + 5 * headFrac;
          this._maybeNick(dt, headFrac, P.guards[this.guardIdx] <= 0.15 ? 2 : P.guards[this.guardIdx] <= 0.25 ? 1 : 0.4);
          if (res.cut > 0.002) g.particles.emit('hair', pt, n.clone().multiplyScalar(0.6), 2, { color: this._furColor(), spread: 1.2 });
          if (res.blocked > 0.5) this._hint('Колтуны забивают машинку! Сначала расчешите их пуходёркой [4].', true);
          break;
        case 'scissors':
          gain = 3 * headFrac;
          this._maybeNick(dt, headFrac, 0.6);
          this.snipT -= dt;
          if (res.cut > 0.0005 && this.snipT <= 0) {
            g.audio.play('snip');
            this.snipT = 0.17;
            g.particles.emit('hair', pt, n.clone().multiplyScalar(0.5), 2, { color: this._furColor(), spread: 1 });
          }
          break;
        case 'perfume':
          this.perfume += dt;
          pet.uniforms.uSparkle.value = Math.min(1, this.perfume);
          g.particles.emit('sparkle', nozzle, _v.copy(pt).sub(nozzle).normalize().multiplyScalar(1.4), 2, { spread: 0.5 });
          break;
        default:
          break;
      }
      if (this.tool === 'shampoo' && this.stats.all.wet < 0.2) this._hint('Шерсть сухая — сначала намочите её душем [1], тогда шампунь пенится лучше.', true);
      if (this.tool === 'brush' && this.stats.all.wet > 0.5) this._hint('Мокрую шерсть расчёсывать тяжело. Сначала высушите феном [3].', true);
    }
    // стресс
    const stressMul = this.temper;
    if (gain > 0) this.stress += gain * stressMul * dt * 1.6;
    else this.stress -= 3.2 * this.calm * dt;
    this.stress = clamp(this.stress, 0, 100);
    if (this.stress >= 100) {
      this.incidents++;
      this.stress = 72;
      pet.shake();
      this._sound();
      g.ui.toast('Питомец вырывается! Дайте ему успокоиться.', 'bad');
      this.active = false;
      const biteChance = (pet.breedId === 'cat' ? 0.7 : 0.4) * Math.max(0.1, 1 + (this.mods.bite || 0));
      if (!this.championship && !g.state.injury && Math.random() < biteChance) {
        g.state.injury = { type: pet.breedId === 'cat' ? 'Царапина' : 'Укус', day: g.state.day };
        g.audio.play('fail');
        g.ui.toast(`${g.state.injury.type}! Руки дрожат — обработайте рану аптечкой (кнопка 🩹).`, 'bad');
        this._refreshInjury();
      }
    }
    // мокрая собака отряхивается
    this.shakeCd -= dt;
    if (this.shakeCd < 0 && this.stats.all.wet > 0.4 && this.tool !== 'shower' && Math.random() < dt * 0.25) {
      this.shakeCd = 6;
      pet.shake();
      g.audio.play('shake');
      for (let i = 0; i < 6; i++) {
        const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize().multiplyScalar(1.8);
        g.particles.emit('water', this.center, d, 8, { spread: 0.4 });
      }
      for (const p of pet.parts) {
        for (let i = 0; i < p.n; i++) p.state2[i * 2] *= 0.85;
        p.aState2.needsUpdate = true;
      }
      if (this.tutorial || Math.random() < 0.5) this._hint('Брызги! Мокрые питомцы любят отряхнуться.', true);
    }
    pet.update(dt, this.stress);

    this.statsT -= dt;
    if (this.statsT <= 0) {
      this.statsT = 0.25;
      this.stats = pet.stats();
      this._refreshOrder();
    }
    this._refreshTop();
    this.hintT -= dt;
    if (this.hintT <= 0) this.hintOverride = null;
    this._refreshHint();
    if (this.timeLimit && this.elapsed >= this.timeLimit) this.finish(true);
  }

  _maybeNick(dt, headFrac, k) {
    this.nickCd -= dt;
    if (this.nickCd > 0 || !this.hit || !/^Fur_/.test(this.hit.object.name)) return;
    const chance = 0.05 * k * (1 + this.stress / 60) * (1 + headFrac) * Math.max(0.1, 1 + (this.mods.nick || 0)) * (this.injured ? 1.6 : 1);
    if (Math.random() < chance * dt) {
      this.nickCd = 8;
      this._addWound();
    }
  }

  /** Порез: красная ранка на коже и выбритое пятно вокруг. */
  _addWound() {
    const g = this.game;
    const obj = this.hit.object;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#d61f3c', emissive: '#7a0010', roughness: 0.3 }));
    mesh.position.copy(obj.worldToLocal(this.hit.point.clone().addScaledVector(this.hit.normal, 0.004)));
    mesh.raycast = () => {};
    obj.add(mesh);
    this.pet.applyTool('clipper', this.hit.point, 0.02, 1, { guard: 0.05, speed: 30, pro: true });
    this.wounds.push({ mesh, treated: false });
    this.stress = Math.min(100, this.stress + 22);
    this._sound();
    g.audio.play('fail');
    g.ui.toast('Порез! Обработайте ранку аптечкой [−], иначе хозяин будет в ярости.', 'bad');
  }

  _furColor() {
    return `#${this.pet.uniforms.uColA.value.getHexString()}`;
  }

  _hint(text, warn = false) {
    this.hintOverride = { text, warn };
    this.hintT = 3;
  }

  // ------------------------------------------------------------ оценка
  evaluateItems(st) {
    const A = st.all;
    const out = {};
    const s = this.order.services;
    if (s.includes('wash')) {
      const clean = 1 - smoothstep(0.06, 0.38, A.dirt);
      const soap = smoothstep(0.03, 0.25, A.soap);
      let q = clean * (1 - 0.7 * soap);
      if (!this.usedShampoo) q *= 0.75;
      if (this.order.needs && !this.owned.includes(this.order.needs)) q *= 0.5;
      out.wash = { q, sub: `грязь ${Math.round(A.dirt * 100)}% · пена ${Math.round(A.soap * 100)}%` };
    }
    if (s.includes('dry') || s.includes('wash')) {
      out.dry = this.everWet || !s.includes('wash')
        ? { q: 1 - smoothstep(0.08, 0.5, A.wet), sub: `влажность ${Math.round(A.wet * 100)}%` }
        : { q: 0, sub: 'после мытья' };
    }
    if (s.includes('brush')) {
      out.brush = { q: 1 - smoothstep(0.04, 0.35, A.mats), sub: `колтуны ${Math.round(A.mats * 100)}%` };
    }
    const regs = Object.keys(this.targets).filter((r) => st[r].lw > 0);
    const per = regs.map((r) => ({ r, q: 1 - smoothstep(0.05, 0.25, st[r].err) }));
    const cutQ = per.length ? per.reduce((a, b) => a + b.q, 0) / per.length : 1;
    if (s.includes('cut')) {
      out.cut = {
        q: cutQ,
        sub: per.map((p) => `${REGIONS[p.r].split(' ')[0]} ${p.q > 0.85 ? '✓' : Math.round(p.q * 100) + '%'}`).join(' · '),
        label: `Стрижка «${STYLES[this.order.style].name}»`,
      };
    } else {
      this.keepQ = cutQ;
    }
    if (s.includes('nails')) {
      const n = Object.values(this.pet.nails);
      const cut = n.filter((x) => x.cut).length;
      out.nails = { q: n.length ? cut / n.length : 1, sub: `${cut} из ${n.length} лап` };
    }
    if (s.includes('perfume')) out.perfume = { q: clamp(this.perfume / 1.2), sub: 'пара пшиков по корпусу' };
    if (s.includes('bow')) out.bow = { q: this.pet.bow ? 1 : 0, sub: 'на голову или ушко' };
    return out;
  }

  finish(force = false) {
    if (this.done) return;
    const st = this.pet.stats();
    const items = this.evaluateItems(st);
    let sum = 0, wsum = 0;
    const list = [];
    for (const [k, it] of Object.entries(items)) {
      const w = WEIGHT[k] || 1;
      sum += it.q * w;
      wsum += w;
      list.push({ key: k, label: it.label || SERVICE_LABEL[k], q: it.q });
    }
    let score = wsum ? sum / wsum : 0;
    const notes = [];
    if (!this.order.services.includes('cut') && this.keepQ < 0.85) {
      score *= 0.6 + 0.4 * this.keepQ;
      notes.push('Шерсть подстрижена без спроса');
    }
    const open = this.wounds.filter((w) => !w.treated).length;
    const treated = this.wounds.length - open;
    if (open) {
      score *= Math.max(0.35, 1 - open * 0.3);
      notes.push(`Необработанные порезы: ${open}`);
    }
    if (treated) {
      score *= Math.max(0.7, 1 - treated * 0.06);
      notes.push(`Порезы (обработаны): ${treated}`);
    }
    if (this.incidents) {
      score *= Math.max(0.5, 1 - this.incidents * 0.12);
      notes.push(`Питомец вырывался: ${this.incidents}`);
    }
    const par = this.order.par * (this.owned.includes('sofa') ? 1.3 : 1);
    if (this.elapsed > par) {
      const over = clamp((this.elapsed - par) / par);
      score *= 1 - 0.2 * over;
      notes.push('Хозяин заждался');
    }
    if (this.stress > 70) notes.push('Питомец ушёл нервным');
    const result = { score: clamp(score), items: list, notes, time: this.elapsed, par, incidents: this.incidents, forced: force };
    this.done = true;
    this.dispose();
    this._resolve(result);
  }

  // ------------------------------------------------------------ интерфейс
  _buildHud() {
    const ui = this.game.ui;
    this.toolBtns = {};
    const bar = h('div.toolbar.panel', TOOLS.map((t) => {
      const btn = h(`button.tool${this.hasTool(t.id) ? '' : '.locked'}`, {
        title: `${t.name} [${t.key}] — ${t.hint}`,
        onclick: () => this.selectTool(t.id),
      }, h('span.key', t.key), h('img', { src: `icons/${t.icon}.png`, alt: '' }), h('span.lbl', t.name));
      this.toolBtns[t.id] = btn;
      return btn;
    }));
    this.guardsEl = h('div.guards.panel');
    this.stressBar = h('div');
    this.timerEl = h('span');
    this.injuryBtn = h('button.chip.panel', { style: { color: '#e5484d', display: 'none' }, onclick: () => this.healPlayer() });
    const top = h('div.groomtop',
      this.injuryBtn,
      h('div.chip.panel', `${this.pet.name || 'Питомец'} · ${this.pet.breed.name}`),
      h('div.stress.panel', h('span', '♥'), h('div.bar', this.stressBar), h('span.lbl', 'нервы')),
      h('div.chip.panel', h('span.ico', '⏱'), this.timerEl));
    this.orderList = h('ul');
    this.orderEl = h('div.order.panel',
      h('h3', this.championship ? 'Задание чемпионата' : `Заказ: ${this.client?.name || ''}`),
      h('div.pet', `${this.pet.name} · ${this.pet.breed.name}, окрас «${this.pet.palette.name}»`),
      this.orderList,
      this.stockEl = h('div.stockline'),
      this.order.needs && !this.owned.includes(this.order.needs)
        ? h('div.note', 'Нет гипоаллергенного шампуня — у питомца будет зуд, мытьё оценят ниже.') : null);
    this.hintEl = h('div.hintbox.panel');
    this.guideBtn = h('button', { onclick: () => this.toggleGuide(), title: 'Подсветка длины шерсти [Tab]' }, 'Подсказка длины [Tab]');
    const doneBtn = h('button.primary.big', { onclick: () => this._confirmFinish() }, 'Готово ✓');
    const bottom = h('div.groombottom', this.guideBtn, this.hintEl, doneBtn);
    const keys = h('div.keys.panel', { style: { position: 'fixed', left: '14px', bottom: '14px' } },
      h('kbd', 'ЛКМ'), ' инструмент · ', h('kbd', 'ПКМ'), ' вращать · ', h('kbd', 'колесо'), ' зум · ', h('kbd', '1–0'), ' выбор');
    this.hud = h('div.pass', bar, this.guardsEl, top, this.orderEl, bottom, keys);
    ui.layers.hud.append(this.hud);
    this._refreshStock = () => {
      if (!this.stock) {
        this.stockEl.textContent = 'Расходники предоставлены оргкомитетом';
        return;
      }
      const st = this.stock;
      this.stockEl.textContent = `Склад: шампунь ${st.shampoo} · аптечки ${st.firstaid}`
        + (this.owned.includes('treats') ? ` · лакомства ${st.treats}` : '')
        + (this.owned.includes('bows') ? ` · бантики ${st.bows}` : '')
        + (this.owned.includes('perfume') ? ` · парфюм ${st.perfume}` : '');
    };
    this._refreshStock();
    this._refreshInjury();
  }

  _refreshInjury() {
    if (!this.injuryBtn) return;
    const inj = this.injured ? this.game.state.injury : null;
    this.injuryBtn.style.display = inj ? '' : 'none';
    if (inj) this.injuryBtn.textContent = `🩹 ${inj.type}: обработать (${this.stock ? this.stock.firstaid : '∞'})`;
  }

  _renderGuards() {
    const g = this.params.clipper.guards;
    this.guardsEl.replaceChildren(h('div.t', 'насадка'),
      ...g.map((v, i) => h(`button${i === this.guardIdx ? '.on' : ''}`, { onclick: () => this.setGuard(i) }, `${Math.round(v * 100)}%`)),
      h('div.t', 'Q / E'));
  }

  _refreshOrder() {
    const items = this.evaluateItems(this.stats);
    const rows = Object.entries(items).map(([k, it]) => {
      const done = it.q >= 0.85;
      return h(`li${done ? '.done' : ''}`,
        h('span.check', done ? '✓' : ''), h('span', it.label || SERVICE_LABEL[k]),
        h('div.meter', h('div', { style: { width: `${Math.round(it.q * 100)}%` } })),
        h('div.sub', it.sub));
    });
    this.orderList.replaceChildren(...rows);
    this.items = items;
  }

  _refreshTop() {
    this.stressBar.style.width = `${Math.round(this.stress)}%`;
    const t = this.timeLimit ? Math.max(0, this.timeLimit - this.elapsed) : this.elapsed;
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    this.timerEl.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    this.timerEl.style.color = this.timeLimit && t < 30 ? '#e5484d' : '';
  }

  _refreshHint() {
    let text, warn = false;
    if (this.hintOverride) ({ text, warn } = this.hintOverride);
    else if (this.wounds.some((w) => !w.treated) && this.tool !== 'firstaid') {
      text = 'Есть необработанный порез! Возьмите аптечку [−] и кликните по ранке.';
      warn = true;
    } else if (this.stress > 70) {
      text = this.hasTool('treat') ? 'Питомец нервничает! Дайте лакомство [0] или переждите.' : 'Питомец нервничает — дайте ему передохнуть.';
      warn = true;
    } else text = TOOL_BY_ID[this.tool].hint;
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintEl.classList.toggle('warn', warn);
  }

  async _confirmFinish() {
    const notDone = Object.values(this.items || {}).filter((it) => it.q < 0.85).length;
    if (notDone) {
      this.paused = true;
      const r = await this.game.ui.modal('Закончить?', null,
        h('p', { style: { fontWeight: 700, fontSize: '17px' } }, `Не выполнено пунктов заказа: ${notDone}. Хозяин это заметит.`),
        [{ label: 'Продолжить работу', value: 0 }, { label: 'Да, отдать питомца', cls: '.primary', value: 1 }]);
      this.paused = false;
      if (r !== 1) return;
    }
    this.finish();
  }

  dispose() {
    this._unbind();
    this.game.audio.stopLoops();
    this.pet.setCursor(null);
    this.pet.setGuide(false);
    this.pet.highlightNails(false);
    this.pet.uniforms.uSparkle.value = Math.max(this.pet.uniforms.uSparkle.value, this.perfume > 0.3 ? 1 : 0);
    for (const m of Object.values(this.cursors)) m.parent?.remove(m);
    this.hud?.remove();
  }
}
