import * as THREE from 'three';
import { Assets } from '../engine/Assets.js';
import { furLighting } from '../fur/FurMaterial.js';
import { SALONS } from '../data/salons.js';
import { floorTexture, signTexture, streetTexture, wallTexture } from './textures.js';

const TABLE_TOP = 0.872;

/**
 * Интерьер салона: комната с процедурными стенами/полом и мебелью из
 * salon_props.glb. Что именно стоит в салоне, зависит от покупок.
 */
export class Salon {
  constructor(game, salonId, { owned = [], flags = {} } = {}) {
    this.game = game;
    this.id = salonId;
    this.cfg = SALONS[salonId];
    this.group = new THREE.Group();
    this.group.name = `Salon_${salonId}`;
    this.owned = owned;
    this.flags = flags;
    this.lamps = [];
    this.anim = [];
    this._build();
  }

  prop(name, x, y, z, rotY = 0, { tint = true, scale = 1 } = {}) {
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
    return o;
  }

  _build() {
    const c = this.cfg;
    const { w: W, d: D, h: H } = c.size;
    this.W = W;
    this.D = D;
    this.H = H;
    const has = (id) => this.owned.includes(id);

    // --- пол
    const floorTex = floorTexture(c.floor, c.floor === 'wood' ? c.wood : '#a7a29b');
    const tile = c.floor === 'marble' ? 3 : c.floor === 'wood' ? 2.2 : 4;
    floorTex.repeat.set(W / tile, D / tile);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: c.floor === 'marble' ? 0.18 : 0.75, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // --- стены (левая — с проёмом под окно)
    const wallTex = wallTexture(c.wall, c.wallColor, c.wallColor2);
    const texSize = c.wall === 'brick' ? 2.2 : 3.2;
    const wallMat = () => {
      const t = wallTex.clone();
      t.needsUpdate = true;
      t.repeat.set(1 / texSize, 1 / texSize);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
    };
    const backShape = new THREE.Shape().moveTo(0, 0).lineTo(W, 0).lineTo(W, H).lineTo(0, H).lineTo(0, 0);
    const back = new THREE.Mesh(new THREE.ShapeGeometry(backShape), wallMat());
    back.position.set(-W / 2, 0, -D / 2);
    back.receiveShadow = true;
    this.group.add(back);
    // окно: z от -0.9 до 0.5 на левой стене, y 0.8..2.3
    const winZ = -0.2, winY = 1.55, winW = 1.4, winH = 1.5;
    const leftShape = new THREE.Shape().moveTo(0, 0).lineTo(D, 0).lineTo(D, H).lineTo(0, H).lineTo(0, 0);
    const hole = new THREE.Path();
    const hz = D / 2 - winZ;
    hole.moveTo(hz - winW / 2, winY - winH / 2).lineTo(hz + winW / 2, winY - winH / 2)
      .lineTo(hz + winW / 2, winY + winH / 2).lineTo(hz - winW / 2, winY + winH / 2);
    leftShape.holes.push(hole);
    const left = new THREE.Mesh(new THREE.ShapeGeometry(leftShape), wallMat());
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2, 0, D / 2);
    left.receiveShadow = true;
    this.group.add(left);
    const right = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape().moveTo(0, 0).lineTo(D, 0).lineTo(D, H).lineTo(0, H)), wallMat());
    right.rotation.y = -Math.PI / 2;
    right.position.set(W / 2, 0, -D / 2);
    right.receiveShadow = true;
    this.group.add(right);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#fbf7f2', roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    this.group.add(ceil);
    for (const m of [back, left, right, ceil]) m.castShadow = true;
    // плинтусы
    const baseMat = new THREE.MeshStandardMaterial({ color: c.floor === 'marble' ? '#c9a45a' : '#ffffff', roughness: 0.5 });
    for (const [x, z, sx, sz] of [[0, -D / 2 + 0.01, W, 0.02], [-W / 2 + 0.01, 0, 0.02, D], [W / 2 - 0.01, 0, 0.02, D]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.1, sz), baseMat);
      b.position.set(x, 0.05, z);
      this.group.add(b);
    }

    // --- окно и улица
    this.prop('Window', -W / 2 + 0.02, winY, winZ, Math.PI / 2, { tint: false });
    const street = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: streetTexture(c.sky), toneMapped: false }));
    street.position.set(-W / 2 - 3, 1.6, winZ);
    street.rotation.y = Math.PI / 2;
    this.group.add(street);

    // --- зона груминга
    this.tablePos = new THREE.Vector3(-0.2, TABLE_TOP, -D / 2 + 1.55);
    this.prop('GroomTable', this.tablePos.x, 0, this.tablePos.z);
    this.prop('Stool', this.tablePos.x - 0.2, 0, this.tablePos.z + 0.75, 0);
    this.prop('Bathtub', -W / 2 + 1.0, 0, -D / 2 + 0.55);
    this.prop('TowelStack', -W / 2 + 0.3, 0, -D / 2 + 1.35, 0.3);
    this.prop('DryerStand', this.tablePos.x + 1.05, 0, this.tablePos.z - 0.35, -0.6);
    this.prop('Shelf', W / 2 - 1.1, 0, -D / 2 + 0.17);
    this.prop('WallClock', this.tablePos.x + 0.9, 2.15, -D / 2 + 0.03);
    const nLamps = c.tier === 3 ? 3 : 2;
    for (let i = 0; i < nLamps; i++) {
      const x = this.tablePos.x + (i - (nLamps - 1) / 2) * 0.7;
      const lamp = this.prop('PendantLamp', x, H, this.tablePos.z);
      if (c.tier === 1) Assets.tint(lamp, ['Accent'], '#3a3a3a');
      const pl = new THREE.PointLight(c.lamp, 2.2, 5.5, 1.6);
      pl.position.set(x, H - 1.06, this.tablePos.z);
      this.group.add(pl);
      this.lamps.push(pl);
    }

    // --- ресепшен и вход
    this.deskPos = new THREE.Vector3(W / 2 - 1.0, 0, D / 2 - 2.0);
    this.prop('ReceptionDesk', this.deskPos.x, 0, this.deskPos.z, -Math.PI / 2);
    this.prop('Door', W / 2 - 0.02, 0, D / 2 - 0.75, -Math.PI / 2);
    this.prop('PlantSmall', W / 2 - 0.35, 0, D / 2 - 0.2);
    const sign = this.prop('Signboard', this.deskPos.x + 0.25, 2.15, this.deskPos.z, -Math.PI / 2);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.33),
      new THREE.MeshStandardMaterial({ map: signTexture(c.name.replace(/[«»]/g, '').split(' в ')[0], c.accent), roughness: 0.6 }));
    label.position.set(0, 0, 0.034);
    sign.add(label);

    // --- зона ожидания
    const waitX = -W / 2 + 0.75, waitZ = D / 2 - 1.6;
    this.rug = this.prop('Rug', waitX + 0.9, 0, waitZ, 0, { scale: 0.85 });
    if (has('sofa')) {
      this.prop('Sofa', waitX, 0, waitZ, Math.PI / 2);
      this.seats = [new THREE.Vector3(waitX + 0.05, 0.45, waitZ - 0.35), new THREE.Vector3(waitX + 0.05, 0.45, waitZ + 0.35)];
    } else {
      this.prop('Bench', waitX - 0.05, 0, waitZ, Math.PI / 2);
      this.seats = [new THREE.Vector3(waitX - 0.05, 0.48, waitZ - 0.35), new THREE.Vector3(waitX - 0.05, 0.48, waitZ + 0.35)];
    }
    this.seatYaw = Math.PI / 2;
    if (has('coffee')) this.prop('CoffeeMachine', waitX - 0.3, 0, waitZ + 1.25, Math.PI / 2);
    if (c.tier >= 2) this.prop('Chair', waitX + 1.9, 0, waitZ + 0.9, -Math.PI * 0.75);

    // --- Пончик
    this.bedPos = new THREE.Vector3(-W / 2 + 0.7, 0, 0.75);
    this.prop('DogBed', this.bedPos.x, 0, this.bedPos.z, 0.4);
    if (c.tier === 1) this.prop('Kennel', W / 2 - 0.55, 0, -D / 2 + 1.5, -Math.PI / 2, { scale: 0.9 });
    if (c.tier >= 2) this.prop('SinkCabinet', W / 2 - 0.35, 0, -D / 2 + 1.75, -Math.PI / 2, { scale: 0.9 });
    if (c.tier === 3) this.prop('PetScale', -W / 2 + 2.2, 0, -D / 2 + 0.6);

    // --- декор и улучшения
    if (has('decor') || c.tier === 3) {
      this.prop('PlantBig', -W / 2 + 0.35, 0, -D / 2 + 2.3);
      this.prop('PlantBig', W / 2 - 0.4, 0, -0.2, 1.2);
      this.prop('Picture', -W / 2 + 0.03, 1.7, waitZ - 0.2, Math.PI / 2);
      this.prop('PictureWide', -W / 2 + 0.03, 1.75, waitZ + 1.05, Math.PI / 2);
    }
    if (has('neon') || c.tier === 3) {
      this.prop('NeonPaw', this.tablePos.x - 1.0, 2.0, -D / 2 + 0.04);
      const nl = new THREE.PointLight('#ff4fa3', 1.2, 3, 2);
      nl.position.set(this.tablePos.x - 1.0, 2.0, -D / 2 + 0.4);
      this.group.add(nl);
    }
    if (has('music')) {
      const spk = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.18), new THREE.MeshStandardMaterial({ color: '#2b2b30', roughness: 0.5 }));
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 24), new THREE.MeshStandardMaterial({ color: c.accent }));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, 0.03, 0.092);
      spk.add(body, cone);
      spk.position.set(W / 2 - 1.1, 1.43, -D / 2 + 0.2);
      this.group.add(spk);
      this.anim.push((t) => cone.scale.setScalar(1 + Math.sin(t * 12) * 0.04));
    }
    if (this.flags.trophy) this.prop('Trophy', this.deskPos.x + 0.15, 1.1, this.deskPos.z + 0.55, -Math.PI / 2);

    // --- свет
    const hemi = new THREE.HemisphereLight('#f4f0ff', '#8a7466', 0.9);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(c.sky === '#ffcf9e' ? '#ffe3c2' : '#fff4e3', 2.4);
    sun.position.set(-W / 2 - 3, 4.2, winZ + 1.5);
    sun.target.position.set(0, 0, -0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -6; sc.right = 6; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 16;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.group.add(sun, sun.target);
    this.sun = sun;
    this.hemi = hemi;
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.5);
    fill.position.set(3, 3, 6);
    this.group.add(fill);

    // --- точки сцены
    this.doorIn = new THREE.Vector3(W / 2 - 0.55, 0, D / 2 - 0.75);
    this.clientAtDesk = new THREE.Vector3(this.deskPos.x - 1.05, 0, this.deskPos.z);
    this.petAtDesk = new THREE.Vector3(this.deskPos.x - 1.2, 0, this.deskPos.z + 0.6);
    this.cams = {
      overview: { pos: new THREE.Vector3(W * 0.12, H * 0.78, D / 2 + 2.6), target: new THREE.Vector3(-0.1, 0.95, -0.4) },
      // со стороны стойки: клиент стоит лицом к камере в три четверти
      reception: {
        pos: new THREE.Vector3(this.deskPos.x - 0.15, 1.62, this.deskPos.z + 2.5),
        target: new THREE.Vector3(this.deskPos.x - 1.15, 1.1, this.deskPos.z + 0.05),
      },
      waiting: { pos: new THREE.Vector3(waitX + 2.6, 1.5, waitZ + 1.6), target: new THREE.Vector3(waitX, 0.8, waitZ) },
    };
  }

  /** Обновить общий для меха свет под эту сцену. */
  applyFurLighting() {
    furLighting.uLightDir.value.copy(this.sun.position).sub(this.sun.target.position).normalize();
    furLighting.uLightColor.value.copy(this.sun.color).multiplyScalar(0.95);
    furLighting.uSky.value.copy(this.hemi.color).multiplyScalar(0.62);
    furLighting.uGround.value.copy(this.hemi.groundColor).multiplyScalar(0.55);
  }

  update(dt, t) {
    for (const f of this.anim) f(t);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (m?.map) m.map.dispose();
      }
    });
  }
}

export { TABLE_TOP };
