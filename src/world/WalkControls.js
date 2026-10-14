import * as THREE from 'three';

const KEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

/**
 * Управление от первого лица: мышь — осмотреться (захват курсора по клику),
 * WASD/стрелки — ходить, Shift — бегом, E или клик — действие с тем, на что смотрите.
 */
export class WalkControls {
  constructor(game) {
    this.game = game;
    this.down = new Set();
    this.enabled = false;
    this.drag = null;
    const el = game.renderer.domElement;
    this.el = el;
    this._key = (e) => {
      if (!this.enabled || e.target instanceof HTMLInputElement) return;
      if (e.type === 'keydown') {
        this.down.add(e.code);
        if (e.code === 'KeyE' || e.code === 'Enter') this.game.interact?.();
      } else this.down.delete(e.code);
    };
    this._pd = (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        if (e.button === 0) this.game.interact?.();
        return;
      }
      // клик по сцене захватывает мышь; если захват недоступен — вращение перетаскиванием
      this.drag = { x: e.clientX, y: e.clientY };
      try {
        el.requestPointerLock?.()?.catch?.(() => {});
      } catch {
        /* браузер не дал захватить курсор — останется перетаскивание */
      }
    };
    this._pm = (e) => {
      if (!this.enabled) return;
      if (this.locked) game.rig.fpsRotate(e.movementX, e.movementY);
      else if (this.drag) {
        game.rig.fpsRotate(e.clientX - this.drag.x, e.clientY - this.drag.y);
        this.drag = { x: e.clientX, y: e.clientY };
      }
    };
    this._pu = () => {
      this.drag = null;
    };
    window.addEventListener('keydown', this._key);
    window.addEventListener('keyup', this._key);
    window.addEventListener('blur', () => this.down.clear());
    el.addEventListener('pointerdown', this._pd);
    window.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) this.game.onPointerUnlock?.();
    });
  }

  get locked() {
    return document.pointerLockElement === this.el;
  }

  release() {
    if (this.locked) {
      this.autoUnlock = true;
      document.exitPointerLock();
    }
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
    const yaw = this.game.rig.fps.yaw;
    player.root.rotation.y = yaw + Math.PI;
    player.yaw = yaw + Math.PI;
    player.targetYaw = null;
    const len = Math.hypot(mx, mz);
    if (len < 0.01) {
      player.moveInput = 0;
      return;
    }
    const run = this.down.has('ShiftLeft') || this.down.has('ShiftRight');
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // вперёд
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);    // вправо
    const dx = (fx * mz + rx * mx) / len, dz = (fz * mz + rz * mx) / len;
    const speed = (run ? 3.2 : 1.8) * speedMul;
    const p = player.root.position;
    const next = new THREE.Vector3(p.x + dx * speed * dt, 0, p.z + dz * speed * dt);
    salon.resolve(next, 0.26);
    p.x = next.x;
    p.z = next.z;
    player.path = [];
    player.moveInput = run ? 1.5 : 1;
  }
}
