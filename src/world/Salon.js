import * as THREE from 'three';
import { Assets } from '../engine/Assets.js';
import { furLighting } from '../fur/FurMaterial.js';
import { SALONS } from '../data/salons.js';
import { THEMES } from '../data/themes.js';
import { floorTexture, signTexture, streetTexture, wallTexture } from './textures.js';

const TABLE_TOP = 0.872;
const NON_SOLID = new Set(['Rug', 'Window', 'PendantLamp', 'WallClock', 'NeonPaw', 'Picture', 'PictureWide', 'Signboard',
  'FirstAidCabinet', 'Trophy', 'Door']);

/** Итоговые настройки помещения с учётом выбранной темы оформления. */
export function salonConfig(id, theme) {
  const base = SALONS[id];
  const t = theme && theme.id !== 'original' ? THEMES[theme.id] : null;
  const cfg = { ...base };
  if (t) for (const k of ['wall', 'wallColor', 'wallColor2', 'floor', 'wood', 'accent', 'fabric', 'tileColor', 'tileColor2']) if (t[k]) cfg[k] = t[k];
  if (theme?.accent) cfg.accent = theme.accent;
  return cfg;
}

/**
 * Салон из двух комнат: слева груминг-зал со столами, справа ресепшен
 * с компьютером, входом и зоной ожидания. Между ними — перегородка с проёмом.
 */
export class Salon {
  constructor(game, salonId, { owned = [], flags = {}, theme = null } = {}) {
    this.game = game;
    this.id = salonId;
    this.cfg = salonConfig(salonId, theme);
    this.group = new THREE.Group();
    this.group.name = `Salon_${salonId}`;
    this.owned = owned;
    this.flags = flags;
    this.lamps = [];
    this.anim = [];
    this.colliders = [];
    this.stations = [];
    this._build();
  }

  prop(name, x, y, z, rotY = 0, { tint = true, scale = 1, solid } = {}) {
    const o = this.game.assets.node('salon_props', name, { cloneMaterials: tint });
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    o.scale.setScalar(scale);
    if (tint) {
      Assets.tint(o, ['Accent'], this.cfg.accent);
      Assets.tint(o, ['AccentFabric'], this.cfg.fabric);
      Assets.tint(o, ['Wood'], this.cfg.wood);
    }
    this.group.add(o);
    if (solid ?? (!NON_SOLID.has(name) && y < 0.3)) {
      o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o);
      this.colliders.push({ x0: b.min.x + 0.04, x1: b.max.x - 0.04, z0: b.min.z + 0.04, z1: b.max.z - 0.04, name });
    }
    return o;
  }

  /** Точка взаимодействия: pos — где стоит игрок, look — на что он смотрит. */
  station(id, pos, label, r = 0.9, look = null) {
    this.stations.push({ id, pos: pos.clone().setY(0), label, r, look: look || pos.clone().setY(1.0) });
  }

  _build() {
    const c = this.cfg;
    const { w: W, d: D, h: H } = c.size;
    this.W = W;
    this.D = D;
    this.H = H;
    const has = (id) => this.owned.includes(id);
    const xp = -W / 2 + W * 0.55;          // перегородка между комнатами
    const dz0 = D / 2 - 2.0, dz1 = D / 2 - 0.8; // дверной проём в перегородке
    this.partitionX = xp;
    this.doorway = { z0: dz0, z1: dz1 };

    // --- пол
    const tile = c.floor === 'marble' ? 3 : c.floor === 'wood' ? 2.2 : c.floor === 'tile' ? 2.4 : 4;
    const floorBase = c.floor === 'wood' ? c.wood : c.floor === 'tile' ? (c.tileColor || '#ffffff') : '#a7a29b';
    const floorTex = floorTexture(c.floor, floorBase, c.tileColor2);
    floorTex.repeat.set(W / tile, D / tile);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: c.floor === 'marble' || c.floor === 'tile' ? 0.2 : 0.75 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const baseMat = new THREE.MeshStandardMaterial({ color: c.floor === 'marble' ? '#c9a45a' : '#ffffff', roughness: 0.5 });
    // --- стены
    const wallTex = wallTexture(c.wall, c.wallColor, c.wallColor2);
    const texSize = c.wall === 'brick' ? 2.2 : 3.2;
    const mkMat = () => {
      const t = wallTex.clone();
      t.needsUpdate = true;
      t.repeat.set(1 / texSize, 1 / texSize);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
    };
    const back = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape().moveTo(0, 0).lineTo(W, 0).lineTo(W, H).lineTo(0, H)), mkMat());
    back.position.set(-W / 2, 0, -D / 2);
    const winZ = -0.2, winY = 1.55, winW = 1.4, winH = 1.5;
    const leftShape = new THREE.Shape().moveTo(0, 0).lineTo(D, 0).lineTo(D, H).lineTo(0, H).lineTo(0, 0);
    const hz = D / 2 - winZ;
    leftShape.holes.push(new THREE.Path().moveTo(hz - winW / 2, winY - winH / 2).lineTo(hz + winW / 2, winY - winH / 2)
      .lineTo(hz + winW / 2, winY + winH / 2).lineTo(hz - winW / 2, winY + winH / 2));
    const left = new THREE.Mesh(new THREE.ShapeGeometry(leftShape), mkMat());
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2, 0, D / 2);
    const right = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape().moveTo(0, 0).lineTo(D, 0).lineTo(D, H).lineTo(0, H)), mkMat());
    right.rotation.y = -Math.PI / 2;
    right.position.set(W / 2, 0, -D / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#fbf7f2', roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    for (const m of [back, left, right, ceil]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    for (const [x, z, sx, sz] of [[0, -D / 2 + 0.01, W, 0.02], [-W / 2 + 0.01, 0, 0.02, D], [W / 2 - 0.01, 0, 0.02, D]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.1, sz), baseMat);
      b.position.set(x, 0.05, z);
      this.group.add(b);
    }

    // --- перегородка с проёмом (становится прозрачной, если загораживает игрока)
    const pTex = wallTex.clone();
    pTex.needsUpdate = true;
    pTex.repeat.set(1 / texSize, 1 / texSize);
    this.partitionMat = new THREE.MeshStandardMaterial({ map: pTex, roughness: 0.9, transparent: true });
    const pt = 0.12;
    const doorH = 2.15;
    this.partition = new THREE.Group();
    for (const [z0, z1, y0, y1] of [[-D / 2, dz0, 0, H], [dz1, D / 2, 0, H], [dz0, dz1, doorH, H]]) {
      const len = z1 - z0, hh = y1 - y0;
      const g = new THREE.BoxGeometry(pt, hh, len);
      // UV по реальным размерам, чтобы текстура не растягивалась
      const uv = g.attributes.uv;
      const pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getZ(i) + z0 + len / 2, pos.getY(i) + y0 + hh / 2);
      const m = new THREE.Mesh(g, this.partitionMat);
      m.position.set(xp, y0 + hh / 2, z0 + len / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      this.partition.add(m);
    }
    const trimMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    for (const [z, sz, y, sy] of [[dz0, 0.08, doorH / 2, doorH], [dz1, 0.08, doorH / 2, doorH], [(dz0 + dz1) / 2, dz1 - dz0 + 0.16, doorH, 0.08]]) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(pt + 0.04, sy, sz), trimMat);
      tr.position.set(xp, y, z);
      this.partition.add(tr);
    }
    this.group.add(this.partition);
    this.colliders.push({ x0: xp - 0.1, x1: xp + 0.1, z0: -D / 2, z1: dz0, name: 'wall' });
    this.colliders.push({ x0: xp - 0.1, x1: xp + 0.1, z0: dz1, z1: D / 2, name: 'wall' });

    // --- передняя стена с витринами (видна только изнутри — камеры меню смотрят сквозь неё)
    const fwX = [(-W / 2 + xp) / 2, (xp + W / 2) / 2 - 0.3];
    const frontShape = new THREE.Shape().moveTo(0, 0).lineTo(W, 0).lineTo(W, H).lineTo(0, H).lineTo(0, 0);
    for (const x of fwX) {
      const hx = W / 2 - x; // в координатах фигуры ось X идёт от правого края
      frontShape.holes.push(new THREE.Path().moveTo(hx - winW / 2, winY - winH / 2).lineTo(hx + winW / 2, winY - winH / 2)
        .lineTo(hx + winW / 2, winY + winH / 2).lineTo(hx - winW / 2, winY + winH / 2));
    }
    const front = new THREE.Mesh(new THREE.ShapeGeometry(frontShape), mkMat());
    front.rotation.y = Math.PI;
    front.position.set(W / 2, 0, D / 2);
    front.receiveShadow = true;
    this.group.add(front);
    const fb = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, 0.02), baseMat);
    fb.position.set(0, 0.05, D / 2 - 0.01);
    this.group.add(fb);
    for (const x of fwX) this.prop('Window', x, winY, D / 2 - 0.02, Math.PI, { tint: false });
    const frontStreet = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, 4.5), new THREE.MeshBasicMaterial({ map: streetTexture(c.sky), toneMapped: false }));
    frontStreet.position.set(0, 1.6, D / 2 + 3);
    frontStreet.rotation.y = Math.PI;
    this.group.add(frontStreet);
    this.frontParts = [front, fb, frontStreet];

    // --- окно и улица
    this.prop('Window', -W / 2 + 0.02, winY, winZ, Math.PI / 2, { tint: false });
    const street = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: streetTexture(c.sky), toneMapped: false }));
    street.position.set(-W / 2 - 3, 1.6, winZ);
    street.rotation.y = Math.PI / 2;
    this.group.add(street);

    // ================= груминг-зал
    const Wg = xp + W / 2;
    const n = c.tables;
    const tableZ = -D / 2 + 1.55;
    this.tables = [];
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + Wg * (i + 0.5) / n;
      this.prop('GroomTable', x, 0, tableZ);
      this.prop('DryerStand', x + 0.35, 0, -D / 2 + 0.6, -0.4, { scale: 0.95 });
      this.tables.push({ pos: new THREE.Vector3(x, TABLE_TOP, tableZ), stand: new THREE.Vector3(x, 0, tableZ + 0.75) });
      const lamp = this.prop('PendantLamp', x, H, tableZ);
      if (c.tier === 1) Assets.tint(lamp, ['Accent'], '#3a3a3a');
      const pl = new THREE.PointLight(c.lamp, 2.0, 5, 1.6);
      pl.position.set(x, H - 1.06, tableZ);
      this.group.add(pl);
      this.lamps.push(pl);
    }
    this.tablePos = this.tables[0].pos;
    this.prop('Stool', this.tables[0].pos.x - 0.55, 0, tableZ + 0.6);
    this.prop('Bathtub', -W / 2 + 0.4, 0, D / 2 - 1.45, Math.PI / 2);
    this.prop('TowelStack', -W / 2 + 0.3, 0, D / 2 - 2.55, 0.3);
    this.prop('Shelf', xp - 0.18, 0, -D / 2 + 1.1, -Math.PI / 2);
    this.prop('WallClock', this.tables[0].pos.x, 2.2, -D / 2 + 0.03);
    this.prop('FirstAidCabinet', xp - 0.1, 1.45, 0.15, -Math.PI / 2);
    this.prop('Mirror', xp - 0.4, 0, D / 2 - 0.4, -Math.PI / 2 - 0.5, { tint: false, scale: 0.9 });
    if (c.tier === 1) this.prop('Kennel', -W / 2 + 1.35, 0, D / 2 - 0.45, 0, { scale: 0.9 });
    if (c.tier === 3) this.prop('PetScale', -W / 2 + 2.4, 0, D / 2 - 0.5);
    if (has('neon') || c.tier === 3) {
      const nx = this.tables[0].pos.x + Wg / n / 2;
      this.prop('NeonPaw', nx, 2.05, -D / 2 + 0.04);
      const nl = new THREE.PointLight('#ff4fa3', 1.2, 3, 2);
      nl.position.set(nx, 2.0, -D / 2 + 0.4);
      this.group.add(nl);
    }
    this.station('table', this.tables[0].stand, 'Мой рабочий стол', 0.9, this.tables[0].pos.clone());
    this.station('firstaid', new THREE.Vector3(xp - 0.6, 0, 0.15), 'Аптечка: обработать травму', 0.9, new THREE.Vector3(xp - 0.1, 1.45, 0.15));
    this.station('mirror', new THREE.Vector3(xp - 0.95, 0, D / 2 - 0.75), 'Зеркало: сменить образ', 0.8, new THREE.Vector3(xp - 0.4, 1.15, D / 2 - 0.4));

    // ================= ресепшен
    const deskX = W / 2 - 1.15, deskZ = -D / 2 + 1.45;
    this.deskPos = new THREE.Vector3(deskX, 0, deskZ);
    this.prop('ReceptionDesk', deskX, 0, deskZ, -Math.PI / 2);
    this.staffSpot = new THREE.Vector3(W / 2 - 0.45, 0, deskZ);
    this.prop('OfficeChair', W / 2 - 0.3, 0, deskZ - 0.6, -Math.PI / 2 + 0.4, { solid: false });
    this.station('pc', this.staffSpot, 'Компьютер', 0.9, new THREE.Vector3(deskX - 0.05, 1.3, deskZ + 0.35));
    const sign = this.prop('Signboard', deskX + 0.25, 2.15, deskZ, -Math.PI / 2);
    const signName = this.game.state?.site?.name || c.name.replace(/[«»]/g, '');
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.33),
      new THREE.MeshStandardMaterial({ map: signTexture(signName, c.accent), roughness: 0.6 }));
    label.position.set(0, 0, 0.034);
    sign.add(label);
    this.prop('Door', W / 2 - 0.02, 0, D / 2 - 0.75, -Math.PI / 2);
    this.doorIn = new THREE.Vector3(W / 2 - 0.55, 0, D / 2 - 0.75);
    this.station('door', this.doorIn, 'Дверь', 1.0, new THREE.Vector3(W / 2, 1.2, D / 2 - 0.75));
    this.queueSpot = (i) => new THREE.Vector3(deskX - 1.05, 0, deskZ + i * 0.7);
    this.clientAtDesk = this.queueSpot(0);

    // зона ожидания
    const sofaX = W / 2 - 0.45, sofaZ = deskZ + 1.95;
    if (has('sofa')) {
      this.prop('Sofa', sofaX, 0, sofaZ, -Math.PI / 2);
      this.seats = [-0.35, 0.35].map((dz) => ({ pos: new THREE.Vector3(sofaX + 0.05, 0.45, sofaZ + dz), yaw: -Math.PI / 2 }));
    } else {
      this.prop('Bench', sofaX + 0.05, 0, sofaZ, -Math.PI / 2);
      this.seats = [-0.35, 0.35].map((dz) => ({ pos: new THREE.Vector3(sofaX + 0.1, 0.48, sofaZ + dz), yaw: -Math.PI / 2 }));
    }
    if (c.tier >= 2) {
      this.prop('Chair', sofaX - 1.5, 0, sofaZ + 0.95, Math.PI * 0.8);
      this.seats.push({ pos: new THREE.Vector3(sofaX - 1.5, 0.46, sofaZ + 0.95), yaw: Math.PI * 0.8 });
    }
    this.prop('Rug', sofaX - 1.1, 0, sofaZ, 0, { scale: 0.8 });
    if (has('coffee')) this.prop('CoffeeMachine', xp + 0.45, 0, -D / 2 + 0.7, Math.PI / 2);
    this.bedPos = new THREE.Vector3(xp + 0.95, 0, D / 2 - 0.6);
    this.prop('DogBed', this.bedPos.x, 0, this.bedPos.z, 0.4, { solid: false });
    this.prop('PlantSmall', xp + 0.35, 0, D / 2 - 0.3);
    if (has('decor') || c.tier === 3) {
      this.prop('PlantBig', W / 2 - 0.4, 0, -D / 2 + 0.38, 1.2);
      this.prop('PlantBig', -W / 2 + 0.35, 0, -0.95);
      this.prop('Picture', xp + 0.07, 1.7, -0.6, Math.PI / 2);
      this.prop('PictureWide', -W / 2 + 0.03, 1.75, D / 2 - 1.5, Math.PI / 2);
    }
    if (has('music')) {
      const spk = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.18), new THREE.MeshStandardMaterial({ color: '#2b2b30', roughness: 0.5 }));
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 24), new THREE.MeshStandardMaterial({ color: c.accent }));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, 0.03, 0.092);
      spk.add(body, cone);
      spk.position.set(xp - 0.2, 1.45, -D / 2 + 1.1);
      spk.rotation.y = -Math.PI / 2;
      this.group.add(spk);
      this.anim.push((t) => cone.scale.setScalar(1 + Math.sin(t * 12) * 0.04));
    }
    if (this.flags.trophy) this.prop('Trophy', deskX + 0.15, 1.1, deskZ + 0.55, -Math.PI / 2);
    const recLamp = this.prop('PendantLamp', sofaX - 1.2, H, sofaZ);
    if (c.tier === 1) Assets.tint(recLamp, ['Accent'], '#3a3a3a');
    const rl = new THREE.PointLight(c.lamp, 1.6, 5, 1.6);
    rl.position.set(sofaX - 1.2, H - 1.06, sofaZ);
    this.group.add(rl);

    // --- свет
    const hemi = new THREE.HemisphereLight('#f4f0ff', '#8a7466', 0.95);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(c.sky === '#ffcf9e' ? '#ffe3c2' : '#fff4e3', 2.4);
    sun.position.set(-W / 2 - 3, 4.2, winZ + 1.5);
    sun.target.position.set(-W / 4, 0, -0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 6; sc.bottom = -6; sc.near = 0.5; sc.far = 20;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.group.add(sun, sun.target);
    this.sun = sun;
    this.hemi = hemi;
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.55);
    fill.position.set(3, 3, 6);
    this.group.add(fill);

    this.cams = {
      overview: { pos: new THREE.Vector3(0.4, H + 1.2, D / 2 + 3.6), target: new THREE.Vector3(0, 0.6, -0.4) },
      reception: {
        pos: new THREE.Vector3(deskX - 1.1, 1.75, deskZ + 2.9),
        target: new THREE.Vector3(deskX - 0.45, 1.05, deskZ - 0.1),
      },
    };
  }

  /** Сдвигает точку из препятствий (круг радиуса r против прямоугольников и стен). */
  resolve(p, r = 0.25) {
    const W = this.W, D = this.D;
    p.x = Math.min(W / 2 - r, Math.max(-W / 2 + r, p.x));
    p.z = Math.min(D / 2 - 0.15, Math.max(-D / 2 + r, p.z));
    for (const c of this.colliders) {
      const cx = Math.max(c.x0, Math.min(p.x, c.x1));
      const cz = Math.max(c.z0, Math.min(p.z, c.z1));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        // центр внутри прямоугольника — выталкиваем через ближайшую сторону
        const pushes = [[c.x0 - r - p.x, 0], [c.x1 + r - p.x, 0], [0, c.z0 - r - p.z], [0, c.z1 + r - p.z]];
        pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += pushes[0][0];
        p.z += pushes[0][1];
      }
    }
    return p;
  }

  roomOf(p) {
    return p.x < this.partitionX ? 'groom' : 'reception';
  }

  applyFurLighting() {
    furLighting.uLightDir.value.copy(this.sun.position).sub(this.sun.target.position).normalize();
    furLighting.uLightColor.value.copy(this.sun.color).multiplyScalar(0.95);
    furLighting.uSky.value.copy(this.hemi.color).multiplyScalar(0.62);
    furLighting.uGround.value.copy(this.hemi.groundColor).multiplyScalar(0.55);
  }

  update(dt, t, camPos, focus) {
    for (const f of this.anim) f(t);
    // перегородка полупрозрачна, если камера и игрок по разные стороны
    let target = 1;
    if (camPos && focus && Math.sign(camPos.x - this.partitionX) !== Math.sign(focus.x - this.partitionX)) target = 0.18;
    const m = this.partitionMat;
    m.opacity += (target - m.opacity) * Math.min(1, dt * 6);
    m.depthWrite = m.opacity > 0.95;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (o.material?.map) o.material.map.dispose();
      }
    });
  }
}

export { TABLE_TOP };
