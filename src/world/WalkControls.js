import * as THREE from 'three';

const KEYS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

/**
 * Управление персонажем: WASD/стрелки (Shift — бегом), вращение камеры
 * зажатой правой кнопкой или Q/E, колесо — отдаление, E — взаимодействие.
 */
export class WalkControls {
  constructor(game) {
    this.game = game;
    this.down = new Set();
    this.enabled = false;
    this.drag = null;
    this._key = (e) => {
      if (!this.enabled) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.type === 'keydown') {
        this.down.add(e.code);
        if (e.code === 'KeyE' || e.code === 'Enter') this.game.interact?.();
      } else this.down.delete(e.code);
    };
    const el = game.renderer.domElement;
    this._pd = (e) => {
      if (!this.enabled) return;
      if (e.button === 2 || e.button === 0) this.drag = { x: e.clientX, y: e.clientY };
    };
    this._pm = (e) => {
      if (!this.enabled || !this.drag) return;
      game.rig.followRotate(e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag = { x: e.clientX, y: e.clientY };
    };
    this._pu = () => {
      this.drag = null;
    };
    this._wheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      game.rig.followZoom(e.deltaY);
    };
    window.addEventListener('keydown', this._key);
    window.addEventListener('keyup', this._key);
    window.addEventListener('blur', () => this.down.clear());
    el.addEventListener('pointerdown', this._pd);
    window.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
    el.addEventListener('wheel', this._wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.down.clear();
      this.drag = null;
    }
  }

  update(dt, player, salon, speedMul = 1) {
    if (!this.enabled || !player) {
      if (player) player.moveInput = 0;
      return;
    }
    let mx = 0, mz = 0;
    for (const c of this.down) if (KEYS[c]) {
      mx += KEYS[c][0];
      mz += KEYS[c][1];
    }
    if (this.down.has('KeyQ')) this.game.rig.followRotate(-220 * dt, 0);
    if (this.down.has('KeyR')) this.game.rig.followRotate(220 * dt, 0);
    const len = Math.hypot(mx, mz);
    if (len < 0.01) {
      player.moveInput = 0;
      return;
    }
    const run = this.down.has('ShiftLeft') || this.down.has('ShiftRight');
    const yaw = this.game.rig.follow.yaw;
    // направление относительно камеры
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const dx = (rx * mx - fx * mz) / len, dz = (rz * mx - fz * mz) / len;
    const speed = (run ? 3.4 : 2.0) * speedMul;
    const p = player.root.position;
    const next = new THREE.Vector3(p.x + dx * speed * dt, 0, p.z + dz * speed * dt);
    salon.resolve(next, 0.24);
    p.x = next.x;
    p.z = next.z;
    player.path = [];
    player.targetYaw = Math.atan2(dx, dz);
    player.moveInput = run ? 1.5 : 1;
  }
}
