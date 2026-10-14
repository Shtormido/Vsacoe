import * as THREE from 'three';
import { BREEDS, regionOf } from '../data/breeds.js';
import { createFurMaterial, createPetUniforms, createShellGeometry } from '../fur/FurMaterial.js';
import { config } from '../config.js';
import { clamp, mulberry32, smoothstep, vnoise3 } from '../util/math.js';

const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/**
 * Питомец: модель из Blender + интерактивный мех. Все «грумерские» данные
 * хранятся по вершинам каждого меша меха (см. FurMaterial).
 */
export class Pet {
  constructor(assets, breedId, { palette = 0, seed = 1, scale = 1 } = {}) {
    this.breedId = breedId;
    this.breed = BREEDS[breedId];
    this.palette = typeof palette === 'number' ? this.breed.palettes[palette % this.breed.palettes.length] : palette;
    this.rng = mulberry32(seed);
    this.root = new THREE.Group();
    this.root.name = 'PetRoot';
    this.model = assets.clone(this.breed.model);
    this.model.scale.setScalar(scale);
    this.root.add(this.model);
    this.uniforms = createPetUniforms(this.breed, this.palette);
    this.parts = [];
    this.raycastTargets = [];
    this.nails = {};
    this.blinkers = [];
    this.anim = {
      t: this.rng() * 10, wag: 0.4, wagSpeed: 6, lookYaw: 0, lookPitch: 0, targetYaw: 0, targetPitch: 0,
      shake: 0, tremble: 0, walk: 0, walkPhase: 0, blink: 0, nextBlink: 2, earTwitch: 0, nextTwitch: 3,
      eat: 0, happy: 0, sit: 0,
    };

    const furMeshes = [];
    this.model.traverse((o) => {
      if (o.isMesh && o.name.startsWith('Fur_')) furMeshes.push(o);
      else if (o.isMesh) {
        o.castShadow = true;
        if (/^(Eye_|Pupil_|Glint_)/.test(o.name)) this.blinkers.push(o);
      }
    });
    furMeshes.forEach((m) => this._makeFur(m));
    const find = (n) => this.model.getObjectByName(n);
    this.head = find('Head');
    this.tail = find('Tail_Pivot');
    this.ears = ['EarL_Pivot', 'EarR_Pivot'].map(find).filter(Boolean);
    this.legs = ['LegFL_Pivot', 'LegFR_Pivot', 'LegBL_Pivot', 'LegBR_Pivot'].map(find);
    for (const k of ['FL', 'FR', 'BL', 'BR']) {
      const g = find(`Nails_${k}`);
      if (!g) continue;
      const meshes = [];
      g.traverse((o) => o.isMesh && meshes.push(o));
      this.nails[k] = { group: g, meshes, cut: true };
      meshes.forEach((m) => {
        m.userData.nailKey = k;
        m.material = m.material.clone();
      });
    }
    this.rest = new Map();
    for (const o of [this.head, this.tail, ...this.ears, ...this.legs]) if (o) this.rest.set(o, o.quaternion.clone());
    this.tongue = find('Tongue');
    this.bow = null;
    this._updateGeometryCache();
    this.height = this._measureHeight();
  }

  _makeFur(mesh) {
    const geom = mesh.geometry.clone();
    if (!geom.attributes.normal) geom.computeVertexNormals();
    const n = geom.attributes.position.count;
    const state = new Float32Array(n * 4);
    const state2 = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      state[i * 4] = 1;
      state2[i * 2 + 1] = -1;
    }
    const aState = new THREE.BufferAttribute(state, 4);
    const aState2 = new THREE.BufferAttribute(state2, 2);
    aState.setUsage(THREE.DynamicDrawUsage);
    aState2.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('aState', aState);
    geom.setAttribute('aState2', aState2);
    geom.computeBoundingSphere();
    geom.boundingSphere.radius += this.breed.furMax * 1.5;
    mesh.geometry = geom;
    mesh.material = HIDDEN;
    mesh.castShadow = false;

    const mat = createFurMaterial(this.uniforms);
    const shell = new THREE.Mesh(createShellGeometry(geom, config.shells), mat);
    shell.name = mesh.name + '_Shell';
    shell.raycast = () => {};
    shell.castShadow = true;
    shell.frustumCulled = false;
    shell.onBeforeRender = () => {
      // «вниз» в локальных координатах меша — для провисания шерсти
      mesh.getWorldQuaternion(_q).invert();
      mat.uniforms.uDown.value.set(0, -1, 0).applyQuaternion(_q);
    };
    mesh.add(shell);

    const color = geom.attributes.color;
    const growth = new Float32Array(n);
    for (let i = 0; i < n; i++) growth[i] = color ? color.getZ(i) : 1;
    const part = {
      name: mesh.name, region: regionOf(mesh.name), mesh, shell, geom, n, aState, aState2, state, state2, growth,
      pos: geom.attributes.position.array, petPos: new Float32Array(n * 3), inv: new THREE.Matrix4(), scale: 1,
    };
    this.parts.push(part);
    this.raycastTargets.push(mesh);
  }

  _updateGeometryCache() {
    this.root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    for (const p of this.parts) {
      _m.multiplyMatrices(rootInv, p.mesh.matrixWorld);
      for (let i = 0; i < p.n; i++) {
        _v.fromArray(p.pos, i * 3).applyMatrix4(_m);
        _v.toArray(p.petPos, i * 3);
      }
    }
  }

  _measureHeight() {
    const box = new THREE.Box3().setFromObject(this.model);
    return box.max.y;
  }

  /** Состояние «до груминга»: грязь, колтуны, отросшая шерсть. */
  setCondition({ dirt = 0.7, mats = 0.5, length = 1.0, nails = true } = {}, seed = 7) {
    const s = seed % 1000;
    for (const p of this.parts) {
      for (let i = 0; i < p.n; i++) {
        const x = p.petPos[i * 3], y = p.petPos[i * 3 + 1], z = p.petPos[i * 3 + 2];
        const low = 1 - smoothstep(0.02, this.height * 0.55, y);       // лапы и живот грязнее
        const dn = vnoise3(x * 18, y * 18, z * 18, s);
        const d = clamp(dirt * (0.35 + low * 0.9) * (0.5 + dn));
        const mn = vnoise3(x * 26 + 9, y * 26, z * 26, s + 3);
        const matBias = p.region === 'legs' || p.region === 'tail' || p.name.startsWith('Fur_Ear') ? 0.25 : 0;
        const m = clamp((mn + matBias - (1 - mats) * 0.9 - 0.25) * 2.4);
        const g = p.growth[i];
        p.state[i * 4] = clamp(length + (vnoise3(x * 40, y * 40, z * 40, s + 5) - 0.5) * 0.1, 0.05, 1.15);
        p.state[i * 4 + 1] = d * (g > 0.02 ? 1 : 0.4);
        p.state[i * 4 + 2] = g > 0.15 ? m : 0;
        p.state[i * 4 + 3] = 0;
        p.state2[i * 2] = 0;
      }
      p.aState.needsUpdate = true;
      p.aState2.needsUpdate = true;
    }
    for (const k in this.nails) this.setNailCut(k, !nails);
    this.removeBow();
  }

  setNailCut(key, cut) {
    const n = this.nails[key];
    if (!n) return;
    n.cut = cut;
    n.group.scale.setScalar(cut ? 0.8 : 1.7);
    n.meshes.forEach((m) => m.material.emissive?.setRGB(0, 0, 0));
  }

  highlightNails(on, t = 0) {
    for (const k in this.nails) {
      const n = this.nails[k];
      const glow = on && !n.cut ? 0.25 + 0.25 * Math.sin(t * 6) : 0;
      n.meshes.forEach((m) => m.material.emissive?.setRGB(glow, glow * 0.8, 0.1 * glow));
    }
  }

  nailMeshes() {
    return Object.values(this.nails).flatMap((n) => n.meshes);
  }

  setTargets(targets) {
    for (const p of this.parts) {
      const t = targets ? targets[p.region] : undefined;
      const v = t === undefined ? -1 : t === null ? 1.0 : t;
      for (let i = 0; i < p.n; i++) p.state2[i * 2 + 1] = v;
      p.aState2.needsUpdate = true;
    }
  }

  setGuide(on) {
    this.uniforms.uGuide.value = on ? 1 : 0;
  }

  setCursor(point, radius, color = '#ffffff') {
    if (!point) {
      this.uniforms.uCursorR.value = 0;
      return;
    }
    this.uniforms.uCursor.value.copy(point);
    this.uniforms.uCursorR.value = radius;
    this.uniforms.uCursorColor.value.set(color);
  }

  /**
   * Применяет инструмент вокруг точки (мировые координаты).
   * Возвращает сводку: сколько «работы» сделано и в каких зонах.
   */
  applyTool(tool, hit, radius, dt, opts = {}) {
    const res = { work: 0, regions: { body: 0, head: 0, legs: 0, tail: 0 }, cut: 0, mats: 0, dirt: 0, blocked: 0 };
    for (const p of this.parts) {
      p.inv.copy(p.mesh.matrixWorld).invert();
      p.scale = p.mesh.matrixWorld.getMaxScaleOnAxis();
      _v.copy(hit).applyMatrix4(p.inv);
      const r = radius / p.scale;
      const r2 = r * r;
      // быстрая отсечка по ограничивающей сфере
      const bs = p.geom.boundingSphere;
      if (_v.distanceTo(bs.center) > bs.radius + r) continue;
      const hx = _v.x, hy = _v.y, hz = _v.z;
      let touched = false;
      const st = p.state, st2 = p.state2, pos = p.pos;
      for (let i = 0; i < p.n; i++) {
        const dx = pos[i * 3] - hx, dy = pos[i * 3 + 1] - hy, dz = pos[i * 3 + 2] - hz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const w = 1 - Math.sqrt(d2) / r;
        const k = w * dt * (opts.rate || 1);
        const i4 = i * 4, i2 = i * 2;
        const g = p.growth[i];
        touched = true;
        res.regions[p.region] += w;
        switch (tool) {
          case 'brush': {
            const wetPenalty = st2[i2] > 0.5 ? 0.35 : 1;
            const before = st[i4 + 2];
            st[i4 + 2] = Math.max(0, before - k * 1.1 * wetPenalty);
            st[i4 + 1] = Math.max(0, st[i4 + 1] - k * 0.08);
            res.mats += before - st[i4 + 2];
            res.work += w;
            break;
          }
          case 'shampoo': {
            const eff = st2[i2] > 0.25 ? 1 : 0.35;
            st[i4 + 3] = Math.min(1, st[i4 + 3] + k * 1.8 * eff);
            res.work += w;
            break;
          }
          case 'shower': {
            st2[i2] = Math.min(1, st2[i2] + k * 2.2);
            const soap = st[i4 + 3];
            const before = st[i4 + 1];
            st[i4 + 1] = Math.max(0, before - k * (0.12 + soap * 1.6) * (opts.power || 1));
            st[i4 + 3] = Math.max(0, soap - k * 0.75 * (opts.power || 1));
            res.dirt += before - st[i4 + 1];
            res.work += w;
            break;
          }
          case 'dryer': {
            st2[i2] = Math.max(0, st2[i2] - k * 0.9 * (opts.power || 1));
            res.work += w;
            break;
          }
          case 'clipper': {
            if (g < 0.05) break;
            const guard = opts.guard ?? 0.3;
            const before = st[i4];
            if (st[i4 + 2] > 0.6 && !opts.pro) {
              res.blocked += w; // колтун забивает обычную машинку
              st[i4 + 2] = Math.max(0, st[i4 + 2] - k * 0.4);
              break;
            }
            if (before > guard) st[i4] = Math.max(guard, before - k * 6 * (opts.speed || 1));
            if (st[i4] <= guard + 0.05) st[i4 + 2] = Math.max(0, st[i4 + 2] - k * 4);
            res.cut += before - st[i4];
            res.work += w;
            break;
          }
          case 'scissors': {
            if (g < 0.05) break;
            const before = st[i4];
            const floor = opts.floor ?? 0.08;
            if (before > floor) st[i4] = Math.max(floor, before - k * 0.9 * (opts.speed || 1));
            st[i4 + 2] = Math.max(0, st[i4 + 2] - k * 0.6);
            res.cut += before - st[i4];
            res.work += w;
            break;
          }
          default:
            break;
        }
      }
      if (touched) {
        p.aState.needsUpdate = true;
        p.aState2.needsUpdate = true;
      }
    }
    return res;
  }

  /** Средние показатели по зонам — для заказа и оценки. */
  stats() {
    const z = () => ({ w: 0, dirt: 0, mats: 0, soap: 0, wet: 0, len: 0, lw: 0, err: 0, max: 0 });
    const out = { body: z(), head: z(), legs: z(), tail: z(), all: z() };
    for (const p of this.parts) {
      const R = out[p.region];
      for (let i = 0; i < p.n; i++) {
        const g = p.growth[i];
        if (g < 0.04) continue;
        const i4 = i * 4, i2 = i * 2;
        const w = g;
        for (const T of [R, out.all]) {
          T.w += w;
          T.dirt += p.state[i4 + 1] * w;
          T.mats += p.state[i4 + 2] * w;
          T.soap += p.state[i4 + 3] * w;
          T.wet += p.state2[i2] * w;
          if (g > 0.15) {
            const len = p.state[i4];
            T.len += len * w;
            T.lw += w;
            const tgt = p.state2[i2 + 1];
            if (tgt >= 0) {
              // для «не стричь» (цель 1.0) наказываем только за укорочение
              const e = tgt >= 0.99 ? Math.max(0, 0.88 - len) : Math.abs(len - tgt);
              T.err += e * w;
              T.max = Math.max(T.max, e);
            }
          }
        }
      }
    }
    for (const k in out) {
      const T = out[k];
      const w = T.w || 1, lw = T.lw || 1;
      T.dirt /= w; T.mats /= w; T.soap /= w; T.wet /= w; T.len /= lw; T.err /= lw;
    }
    return out;
  }

  attachBow(bowObj, worldPoint) {
    this.removeBow();
    const parent = this.head || this.model;
    parent.updateMatrixWorld(true);
    const local = parent.worldToLocal(worldPoint.clone());
    bowObj.position.copy(local);
    bowObj.scale.setScalar(1.2);
    parent.add(bowObj);
    bowObj.lookAt(parent.localToWorld(local.clone().multiplyScalar(2)));
    this.bow = bowObj;
  }

  removeBow() {
    if (this.bow) this.bow.parent?.remove(this.bow);
    this.bow = null;
  }

  lookAt(worldPoint) {
    if (!this.head || !worldPoint) {
      this.anim.targetYaw = 0;
      this.anim.targetPitch = 0;
      return;
    }
    const local = this.model.worldToLocal(worldPoint.clone());
    const hp = this.head.position;
    const dx = local.x - hp.x, dz = local.z - hp.z, dy = local.y - hp.y;
    this.anim.targetYaw = clamp(Math.atan2(dx, Math.max(0.05, dz)), -0.7, 0.7);
    this.anim.targetPitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz) + 0.05) * 0.5, -0.35, 0.35);
  }

  shake() {
    this.anim.shake = 1.2;
  }

  eat() {
    this.anim.eat = 1.0;
  }

  update(dt, stress = 0) {
    const a = this.anim;
    a.t += dt;
    const t = a.t;
    const k = 1 - Math.exp(-6 * dt);
    a.lookYaw += (a.targetYaw - a.lookYaw) * k;
    a.lookPitch += (a.targetPitch - a.lookPitch) * k;
    const _e = new THREE.Euler();
    const set = (obj, x, y, z) => {
      if (!obj) return;
      _e.set(x, y, z);
      obj.quaternion.copy(this.rest.get(obj)).multiply(_q.setFromEuler(_e));
    };
    // дыхание
    const breath = Math.sin(t * 2.4) * 0.012;
    this.model.scale.y = this.model.scale.x * (1 + breath);
    // голова
    const eatNod = a.eat > 0 ? Math.sin(a.eat * 18) * 0.25 : 0;
    a.eat = Math.max(0, a.eat - dt);
    set(this.head, a.lookPitch + eatNod + Math.sin(t * 0.7) * 0.03, a.lookYaw, Math.sin(t * 0.5) * 0.05);
    if (this.tongue) this.tongue.visible = stress < 50;
    // хвост: виляет чаще, когда питомец спокоен и доволен
    const mood = clamp(1 - stress / 100);
    const wagAmp = (0.15 + 0.45 * mood + a.happy * 0.4) * (this.breedId === 'cat' ? 0.5 : 1);
    const wagSpd = this.breedId === 'cat' ? 1.6 : 4 + mood * 6 + a.happy * 6;
    a.happy = Math.max(0, a.happy - dt * 0.3);
    set(this.tail, -0.25 * (1 - mood) * (this.breedId === 'cat' ? 0 : 1), Math.sin(t * wagSpd) * wagAmp, 0);
    // уши: подёргивание, при стрессе прижаты
    a.nextTwitch -= dt;
    if (a.nextTwitch < 0) {
      a.earTwitch = 1;
      a.nextTwitch = 2 + this.rng() * 5;
    }
    a.earTwitch = Math.max(0, a.earTwitch - dt * 5);
    this.ears.forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      const back = (1 - mood) * 0.6;
      set(e, -back, 0, side * (Math.sin(a.earTwitch * 9) * 0.2 * (i === 0 ? 1 : 0.4)) + side * back * 0.4);
    });
    // моргание
    a.nextBlink -= dt;
    if (a.nextBlink < 0) {
      a.blink = 0.14;
      a.nextBlink = 2 + this.rng() * 4;
    }
    a.blink = Math.max(0, a.blink - dt);
    const eyeScale = a.blink > 0 ? 0.15 : 1;
    for (const b of this.blinkers) b.scale.y = eyeScale;
    // ходьба
    if (a.walk > 0.01) {
      a.walkPhase += dt * 9 * a.walk;
      const s = Math.sin(a.walkPhase) * 0.5 * a.walk;
      set(this.legs[0], s, 0, 0);
      set(this.legs[3], s, 0, 0);
      set(this.legs[1], -s, 0, 0);
      set(this.legs[2], -s, 0, 0);
      this.model.position.y = Math.abs(Math.cos(a.walkPhase)) * 0.015 * a.walk;
    } else {
      for (const l of this.legs) set(l, 0, 0, 0);
      this.model.position.y = 0;
    }
    // отряхивание и дрожь
    let roll = 0;
    if (a.shake > 0) {
      a.shake = Math.max(0, a.shake - dt);
      roll = Math.sin(a.shake * 40) * 0.22 * Math.min(1, a.shake * 2);
    }
    a.tremble = stress > 65 ? (stress - 65) / 35 : 0;
    roll += Math.sin(t * 55) * 0.012 * a.tremble;
    this.model.rotation.z = roll;
    this.uniforms.uShake.value = a.shake > 0 ? Math.min(1, a.shake) : a.tremble * 0.3;
    if (this.uniforms.uSparkle.value > 0) this.uniforms.uSparkle.value = Math.max(0, this.uniforms.uSparkle.value - dt * 0.08);
  }

  dispose() {
    this.root.parent?.remove(this.root);
    for (const p of this.parts) {
      p.geom.dispose();
      p.shell.geometry.dispose();
      p.shell.material.dispose();
    }
  }
}
