import * as THREE from 'three';
import { clamp } from '../util/math.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Персонаж из people.glb с процедурной анимацией ходьбы, сидения и речи. */
export class Npc {
  constructor(assets, personId) {
    this.id = personId;
    this.root = new THREE.Group();
    this.model = assets.node('people', `Person_${personId}`);
    this.root.add(this.model);
    // в people.glb имена частей повторяются у разных персонажей (Head, Head001, ...)
    const f = (n) => {
      let found = null;
      const re = new RegExp(`^${n}\\d*$`);
      this.model.traverse((o) => {
        if (!found && re.test(o.name)) found = o;
      });
      return found;
    };
    this.head = f('Head');
    this.armL = f('ArmL');
    this.armR = f('ArmR');
    this.legL = f('LegL');
    this.legR = f('LegR');
    this.rest = new Map();
    for (const o of [this.head, this.armL, this.armR, this.legL, this.legR]) if (o) this.rest.set(o, o.quaternion.clone());
    this.path = [];
    this.speed = 1.25;
    this.yaw = 0;
    this.targetYaw = null;
    this.phase = Math.random() * 6;
    this.t = Math.random() * 10;
    this.walking = 0;
    this.sitting = 0;
    this.sitTarget = 0;
    this.seatY = 0.45;
    this.talking = false;
    this.wave = 0;
    this.follower = null;
    this.lookTarget = null;
    this._resolve = null;
    this.appear = 1;
  }

  get pos() {
    return this.root.position;
  }

  place(p, yaw = 0) {
    this.root.position.copy(p);
    this.root.position.y = 0;
    this.yaw = yaw;
    this.root.rotation.y = yaw;
    if (this.follower) this.follower.root.position.copy(this._followPoint());
  }

  walkTo(points, speed = 1.25) {
    this.stand();
    this.path = points.map((p) => p.clone());
    this.speed = speed;
    if (!this.path.length) return Promise.resolve();
    return new Promise((r) => {
      this._resolve = r;
    });
  }

  face(yaw) {
    this.targetYaw = yaw;
  }

  faceTo(p) {
    this.targetYaw = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
  }

  sit(seat, yaw) {
    this.root.position.set(seat.x, 0, seat.z);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
    this.seatY = seat.y;
    this.sitTarget = 1;
  }

  stand() {
    this.sitTarget = 0;
  }

  setFollower(pet) {
    this.follower = pet;
    if (pet) pet.root.position.copy(this._followPoint());
  }

  _followPoint() {
    const off = new THREE.Vector3(0.45, 0, 0.35).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return this.root.position.clone().add(off).setY(0);
  }

  _set(obj, x, y, z) {
    if (!obj) return;
    _e.set(x, y, z);
    obj.quaternion.copy(this.rest.get(obj)).multiply(_q.setFromEuler(_e));
  }

  update(dt) {
    this.t += dt;
    let moving = false;
    if (this.path.length) {
      const p = this.root.position;
      const tgt = this.path[0];
      const dx = tgt.x - p.x, dz = tgt.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        p.x = tgt.x;
        p.z = tgt.z;
        this.path.shift();
        if (!this.path.length) {
          const r = this._resolve;
          this._resolve = null;
          r?.();
        }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.targetYaw = Math.atan2(dx, dz);
        moving = true;
      }
    }
    if (this.targetYaw !== null) {
      let diff = this.targetYaw - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * clamp(dt * 9);
      this.root.rotation.y = this.yaw;
    }
    this.walking += ((moving ? 1 : 0) - this.walking) * clamp(dt * 8);
    this.sitting += (this.sitTarget - this.sitting) * clamp(dt * 5);

    // ходьба
    this.phase += dt * 7.5 * this.walking;
    const sw = Math.sin(this.phase) * 0.55 * this.walking;
    const sitLeg = -1.45 * this.sitting;
    this._set(this.legL, sw + sitLeg, 0, 0);
    this._set(this.legR, -sw + sitLeg, 0, 0);
    const talk = this.talking ? Math.sin(this.t * 9) * 0.25 + 0.35 : 0;
    this.wave = Math.max(0, this.wave - dt);
    const waveA = this.wave > 0 ? -2.6 : 0;
    this._set(this.armL, -sw * 0.8 - 0.3 * this.sitting, 0, -0.08);
    this._set(this.armR, sw * 0.8 - 0.3 * this.sitting - talk + waveA, 0, 0.08 + (this.wave > 0 ? Math.sin(this.t * 14) * 0.4 : 0));
    const nod = this.talking ? Math.sin(this.t * 7) * 0.06 : Math.sin(this.t * 0.8) * 0.03;
    let headYaw = Math.sin(this.t * 0.37) * 0.15;
    if (this.lookTarget) {
      const wp = new THREE.Vector3();
      this.root.getWorldPosition(wp);
      const ang = Math.atan2(this.lookTarget.x - wp.x, this.lookTarget.z - wp.z) - this.yaw;
      headYaw = clamp(Math.atan2(Math.sin(ang), Math.cos(ang)), -0.9, 0.9);
    }
    this._set(this.head, nod, headYaw, 0);
    const bob = Math.abs(Math.cos(this.phase)) * 0.035 * this.walking;
    const sitY = (this.seatY - 0.78 + 0.1) * this.sitting;
    this.model.position.y = bob + sitY;
    this.model.scale.y = 1 + Math.sin(this.t * 2.2) * 0.006;
    // появление
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt * 3);
      this.model.scale.setScalar(0.6 + 0.4 * this.appear);
    }

    if (this.follower) {
      const pet = this.follower;
      const tgt = this._followPoint();
      const pp = pet.root.position;
      const dx = tgt.x - pp.x, dz = tgt.z - pp.z;
      const d = Math.hypot(dx, dz);
      const k = clamp(dt * 4);
      pp.x += dx * k;
      pp.z += dz * k;
      pet.anim.walk += ((d > 0.05 ? 1 : 0) - pet.anim.walk) * clamp(dt * 6);
      const want = d > 0.05 ? Math.atan2(dx, dz) : this.yaw;
      let diff = want - pet.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      pet.root.rotation.y += diff * clamp(dt * 6);
    }
  }

  dispose() {
    this.root.parent?.remove(this.root);
  }
}
