import * as THREE from 'three';

const MAX = 4000;

const TYPES = {
  water: { color: '#9fdcff', size: 0.012, gravity: -4.5, life: 0.7, drag: 0.4, alpha: 0.8 },
  foam: { color: '#ffffff', size: 0.02, gravity: 0.25, life: 1.4, drag: 2.5, alpha: 0.95 },
  hair: { color: '#d9822b', size: 0.009, gravity: -1.2, life: 1.6, drag: 3.0, alpha: 1 },
  air: { color: '#ffffff', size: 0.01, gravity: 0, life: 0.35, drag: 1.0, alpha: 0.35 },
  sparkle: { color: '#ffd1ec', size: 0.016, gravity: 0.15, life: 1.2, drag: 2.0, alpha: 1, twinkle: true },
  dust: { color: '#8a6a4a', size: 0.008, gravity: -0.6, life: 0.9, drag: 2.2, alpha: 0.8 },
  heart: { color: '#ff5f8f', size: 0.035, gravity: 0.35, life: 1.4, drag: 1.0, alpha: 1, twinkle: true },
  confetti: { color: '#ffc23d', size: 0.03, gravity: -1.5, life: 3.0, drag: 0.6, alpha: 1 },
};

/** Простая система частиц на одном THREE.Points с мягкими круглыми спрайтами. */
export class Particles {
  constructor(scene) {
    this.geom = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.kind = new Array(MAX).fill(null);
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        uniform float uScale; varying vec3 vC; varying float vA;
        void main() {
          vC = pcolor; vA = palpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.25, r) * vA;
          vec3 c = vC + (0.25 - r) * 0.6;
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geom, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.cursor = 0;
    this._c = new THREE.Color();
  }

  setScale(h) {
    this.mat.uniforms.uScale.value = h * 0.9;
  }

  emit(type, origin, dir, count = 10, { spread = 0.5, speed = 1, color } = {}) {
    const T = TYPES[type];
    this._c.set(color || T.color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const r = () => (Math.random() - 0.5) * 2;
      this.pos[i * 3] = origin.x + r() * 0.01;
      this.pos[i * 3 + 1] = origin.y + r() * 0.01;
      this.pos[i * 3 + 2] = origin.z + r() * 0.01;
      const s = speed * (0.6 + Math.random() * 0.8);
      this.vel[i * 3] = (dir.x + r() * spread) * s;
      this.vel[i * 3 + 1] = (dir.y + r() * spread) * s;
      this.vel[i * 3 + 2] = (dir.z + r() * spread) * s;
      const shade = 0.85 + Math.random() * 0.3;
      if (type === 'confetti') this._c.setHSL(Math.random(), 0.8, 0.6);
      this.col[i * 3] = this._c.r * shade;
      this.col[i * 3 + 1] = this._c.g * shade;
      this.col[i * 3 + 2] = this._c.b * shade;
      this.size[i] = T.size * (0.6 + Math.random() * 0.8);
      this.life[i] = this.maxLife[i] = T.life * (0.7 + Math.random() * 0.6);
      this.kind[i] = T;
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          any = true;
        }
        continue;
      }
      any = true;
      const T = this.kind[i];
      this.life[i] -= dt;
      const drag = Math.exp(-T.drag * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + T.gravity * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.floorY !== undefined && this.pos[i * 3 + 1] < this.floorY) {
        this.pos[i * 3 + 1] = this.floorY;
        this.vel[i * 3] *= 0.3;
        this.vel[i * 3 + 1] = 0;
        this.vel[i * 3 + 2] *= 0.3;
      }
      const k = this.life[i] / this.maxLife[i];
      let a = T.alpha * Math.min(1, k * 3);
      if (T.twinkle) a *= 0.6 + 0.4 * Math.sin(this.life[i] * 30 + i);
      this.alpha[i] = Math.max(0, a);
    }
    if (any) {
      this.geom.attributes.position.needsUpdate = true;
      this.geom.attributes.palpha.needsUpdate = true;
      this.geom.attributes.pcolor.needsUpdate = true;
      this.geom.attributes.psize.needsUpdate = true;
    }
  }

  clear() {
    this.life.fill(0);
  }
}
