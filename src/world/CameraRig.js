import * as THREE from 'three';
import { clamp } from '../util/math.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Камера: плавные перелёты между ракурсами и орбита вокруг питомца. */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 1, 0);
    this.mode = 'fixed';
    this.fly = null;
    this.t = 0;
    this.sway = 1;
    this.basePos = camera.position.clone();
    this.orbit = { yaw: 0, pitch: 0.35, dist: 1.2, tyaw: 0, tpitch: 0.35, tdist: 1.2, min: 0.35, max: 2.2, center: new THREE.Vector3() };
  }

  set(pos, target) {
    this.fly = null;
    this.mode = 'fixed';
    this.basePos.copy(pos);
    this.target.copy(target);
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
  }

  flyTo(pos, target, dur = 1.4) {
    this.mode = 'fixed';
    return new Promise((resolve) => {
      this.fly = {
        p0: this.camera.position.clone(), t0: this.target.clone(), p1: pos.clone(), t1: target.clone(),
        k: 0, dur, resolve,
      };
    });
  }

  startOrbit(center, { yaw = 0, pitch = 0.35, dist = 1.2, min = 0.35, max = 2.2 } = {}) {
    const o = this.orbit;
    o.center.copy(center);
    Object.assign(o, { min, max });
    // стартуем из текущей позиции камеры, чтобы не было рывка
    const off = this.camera.position.clone().sub(center);
    o.dist = clamp(off.length(), min, max);
    o.yaw = Math.atan2(off.x, off.z);
    o.pitch = Math.asin(clamp(off.y / Math.max(off.length(), 1e-3), -0.99, 0.99));
    o.tyaw = yaw;
    o.tpitch = pitch;
    o.tdist = dist;
    this.fly = null;
    this.mode = 'orbit';
  }

  rotate(dx, dy) {
    const o = this.orbit;
    o.tyaw -= dx * 0.006;
    o.tpitch = clamp(o.tpitch + dy * 0.005, -0.25, 1.35);
  }

  zoom(delta) {
    const o = this.orbit;
    o.tdist = clamp(o.tdist * (1 + delta * 0.0012), o.min, o.max);
  }

  update(dt) {
    this.t += dt;
    const cam = this.camera;
    if (this.fly) {
      const f = this.fly;
      f.k = Math.min(1, f.k + dt / f.dur);
      const e = ease(f.k);
      cam.position.lerpVectors(f.p0, f.p1, e);
      this.target.lerpVectors(f.t0, f.t1, e);
      cam.lookAt(this.target);
      if (f.k >= 1) {
        this.fly = null;
        this.basePos.copy(f.p1);
        f.resolve();
      }
      return;
    }
    if (this.mode === 'orbit') {
      const o = this.orbit;
      const k = clamp(dt * 10);
      let dy = o.tyaw - o.yaw;
      o.yaw += dy * k;
      o.pitch += (o.tpitch - o.pitch) * k;
      o.dist += (o.tdist - o.dist) * k;
      const cp = Math.cos(o.pitch);
      cam.position.set(
        o.center.x + Math.sin(o.yaw) * cp * o.dist,
        o.center.y + Math.sin(o.pitch) * o.dist,
        o.center.z + Math.cos(o.yaw) * cp * o.dist,
      );
      this.target.copy(o.center);
      cam.lookAt(o.center);
      return;
    }
    // лёгкое «дыхание» камеры в статичных ракурсах
    const s = this.sway;
    cam.position.set(
      this.basePos.x + Math.sin(this.t * 0.31) * 0.04 * s,
      this.basePos.y + Math.sin(this.t * 0.47) * 0.02 * s,
      this.basePos.z + Math.cos(this.t * 0.27) * 0.03 * s,
    );
    cam.lookAt(this.target);
  }
}
