/* Drift Restomod — game shell: rendering, maps, input, effects, scoring.
 * runGame(THREE, carBuffers) is called by the loader in index.html.
 * Physics: physics.js (window.DriftPhysics). Maps: city.js (buildCity), track.js (buildTrack).
 * World axes: x / z ground plane, y up. Car local +X is forward, +Z its right side.
 */
window.runGame = async function runGame(THREE, carBuffers) {
  'use strict';
  const { Vehicle, SPECS } = window.DriftPhysics;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('drift_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('drift_' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };
  const CYL = { Nova63_Restomod: 8, ZIL111_Restomod: 8 };

  // ------------------------------------------------------------------ renderer / scene
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 3000);
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  function gradientTexture(stops, w = 4, h = 512) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function noiseTexture(size, base, spread, specks, repeat) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      let v = base + (Math.random() - 0.5) * spread;
      if (Math.random() < specks) v += 40 * Math.random();
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  scene.background = gradientTexture([[0, '#5d8fd0'], [0.55, '#a9c8e8'], [0.75, '#e8eef2'], [1, '#d9dcdc']]);
  scene.fog = new THREE.Fog(0xcfdbe4, 200, 800);
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide,
      map: gradientTexture([[0, '#7aa6dd'], [0.48, '#e9f1f7'], [0.52, '#8a8f93'], [1, '#3c3f42']]) })));
    const panel = (x, y, z, w, h, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(0, 40, 0, 40, 18, 6); panel(30, 15, 20, 18, 10, 3); panel(-30, 15, -20, 18, 10, 2.5);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    pm.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5048, 0.7));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 300 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const envHelpers = { noiseTexture, renderer, isTouch };

  let _radial = null;
  function radialTexture() {
    if (_radial) return _radial;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return (_radial = new THREE.CanvasTexture(c));
  }

  // ------------------------------------------------------------------ car packs
  function makeMaterial(d) {
    const col = new THREE.Color().setRGB(...d.color);
    if (d.kind === 'glass') return new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.04, transparent: true, opacity: d.opacity, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide });
    if (d.kind === 'paint') return new THREE.MeshPhysicalMaterial({ color: col, metalness: clamp(d.metal, 0, 0.7), roughness: clamp(d.rough, 0.15, 1), clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 });
    if (d.kind === 'emit') {
      const m = new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color().setRGB(...d.emissive), emissiveIntensity: clamp(d.estr / 4, 0.4, 4), roughness: 0.3 });
      m.userData.base = m.emissiveIntensity;
      return m;
    }
    if (d.kind === 'carbon') return new THREE.MeshPhysicalMaterial({ color: 0x18181b, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 });
    return new THREE.MeshStandardMaterial({ color: col, metalness: d.metal, roughness: clamp(d.rough, 0.04, 1) });
  }
  function parsePack(buf) {
    const jl = new DataView(buf).getUint32(0, true);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
    const base = 4 + jl;
    const mats = head.materials.map(makeMaterial);
    const geom = (part) => {
      if (!part) return null;
      const q = new Uint16Array(buf.slice(base + part.pos, base + part.pos + part.vcount * 6));
      const pos = new Float32Array(part.vcount * 3);
      for (let i = 0; i < part.vcount * 3; i++) { const a = i % 3; pos[i] = part.bmin[a] + (q[i] / 65535) * (part.bmax[a] - part.bmin[a]); }
      const nrm = new Int8Array(buf.slice(base + part.nrm, base + part.nrm + part.vcount * 3));
      const idx = part.idx32 ? new Uint32Array(buf.slice(base + part.idx, base + part.idx + part.icount * 4))
        : new Uint16Array(buf.slice(base + part.idx, base + part.idx + part.icount * 2));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      for (const [s, c, mi] of part.groups) g.addGroup(s, c, mi);
      g.computeBoundingSphere();
      return g;
    };
    const p = head.parts;
    return { head, mats, body: geom(p.body), wheel: geom(p.wheel), caliper: geom(p.caliper), lod: geom(p.lod) };
  }
  const MODELS = carBuffers.map(parsePack);

  function buildCarObject(model) {
    const root = new THREE.Group(), chassis = new THREE.Group();
    root.add(chassis);
    const body = new THREE.Mesh(model.body, model.mats);
    body.castShadow = true; body.receiveShadow = true;
    chassis.add(body);
    const wheels = model.head.wheels.map((c) => {
      const pivot = new THREE.Group();
      pivot.position.set(c[0], c[1], c[2]);
      if (c[2] < 0) pivot.scale.z = -1;
      const spin = new THREE.Group();
      const wm = new THREE.Mesh(model.wheel, model.mats);
      wm.castShadow = true;
      spin.add(wm); pivot.add(spin);
      if (model.caliper) pivot.add(new THREE.Mesh(model.caliper, model.mats));
      root.add(pivot);
      return { pivot, spin };
    });
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(model.head.length * 1.05, model.head.width * 1.15),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, map: radialTexture() }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02;
    root.add(blob);
    const brakeMats = model.mats.filter((m) => m.emissive && m.emissive.r > 0.8 && m.emissive.g < 0.2);
    return { root, chassis, wheels, brakeMats };
  }

  // ------------------------------------------------------------------ maps & collision grid
  const MAPS = [
    { id: 'city', name: 'Город', build: () => window.buildCity(THREE, envHelpers) },
    { id: 'track', name: 'Полигон', build: () => window.buildTrack(THREE, envHelpers) },
  ];
  const mapCache = {};
  let map = null, mapIdx = clamp(store.get('map', 0), 0, MAPS.length - 1);
  const CELL = 16;
  let grid = new Map();
  const dyn = new THREE.Group();          // cones and parked cars of the current map
  scene.add(dyn);
  let cones = [];
  const coneGeo = new THREE.ConeGeometry(0.23, 0.7, 12).translate(0, 0.35, 0);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5 });

  function gridAdd(item, x0, x1, z0, z1) {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = cx + ',' + cz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(item);
      }
  }
  function gridQuery(x, z, r, out) {
    out.length = 0;
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const a = grid.get(cx + ',' + cz);
        if (a) for (const it of a) if (!out.includes(it)) out.push(it);
      }
    return out;
  }

  function loadMap(i) {
    if (map) scene.remove(map.group);
    mapIdx = i;
    store.set('map', i);
    map = mapCache[i] || (mapCache[i] = MAPS[i].build());
    opts.surface = map.surface;
    scene.add(map.group);
    scene.fog.near = map.fog[0]; scene.fog.far = map.fog[1];
    dyn.clear(); cones = [];
    for (const [x, z] of map.coneSpots) {
      const mesh = new THREE.Mesh(coneGeo, coneMat);
      mesh.castShadow = true; dyn.add(mesh);
      cones.push({ mesh, x, z, y: 0, vx: 0, vz: 0, vy: 0, rx: 0, rz: 0, hit: false, home: [x, z] });
    }
    const parkedCircles = [];
    map.parkSpots.forEach((s, k) => {
      const md = MODELS[(k * 7 + 3) % MODELS.length];
      if (!md.lod) return;
      const m = new THREE.Mesh(md.lod, md.mats);
      m.position.set(s.x, 0, s.z); m.rotation.y = s.yaw;
      m.castShadow = true; m.receiveShadow = true;
      dyn.add(m);
      const fx = Math.cos(s.yaw), fz = -Math.sin(s.yaw), L = md.head.length, r = md.head.width * 0.47;
      for (const o of [-(L / 2 - r), 0, L / 2 - r]) parkedCircles.push({ x: s.x + fx * o, z: s.z + fz * o, r });
    });
    grid = new Map();
    for (const b of map.boxes) gridAdd({ box: b }, b.x0, b.x1, b.z0, b.z1);
    for (const c of map.circles.concat(parkedCircles)) gridAdd({ circle: c }, c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r);
  }

  // ------------------------------------------------------------------ effects
  class Skids {
    constructor(max = 4000) {
      this.max = max;
      this.pos = new Float32Array(max * 18); this.col = new Float32Array(max * 24);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
      this.geo = g;
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, color: 0x111111 }));
      mesh.frustumCulled = false; mesh.renderOrder = 1;
      scene.add(mesh);
      this.n = 0; this.last = {};
    }
    clear() { this.pos.fill(0); this.col.fill(0); this.n = 0; this.last = {}; this.flag(); }
    flag() { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
    add(id, x, y, z, sx, sz, a) {
      const l = this.last[id], w = 0.11;
      if (a <= 0) { this.last[id] = null; return; }
      const L = [x - sx * w, z - sz * w], R = [x + sx * w, z + sz * w];
      if (l && Math.hypot(x - l.x, z - l.z) < 0.25) return;
      if (l && Math.hypot(x - l.x, z - l.z) < 2.5) {
        const i = this.n % this.max, p = i * 18, c = i * 24, y0 = l.y + 0.022, y1 = y + 0.022;
        this.pos.set([l.L[0], y0, l.L[1], l.R[0], y0, l.R[1], L[0], y1, L[1], l.R[0], y0, l.R[1], R[0], y1, R[1], L[0], y1, L[1]], p);
        for (let k = 0; k < 6; k++) this.col.set([0.05, 0.05, 0.05, a * 0.6], c + k * 4);
        this.n++; this.dirty = true;
      }
      this.last[id] = { x, y, z, L, R };
    }
    update() { if (this.dirty) { this.flag(); this.dirty = false; } }
  }
  class Smoke {
    constructor(n = 160) {
      this.parts = [];
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: 0xf0f0f0, transparent: true, opacity: 0, depthWrite: false }));
        s.visible = false; scene.add(s);
        this.parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, amt: 0 });
      }
      this.i = 0;
    }
    emit(x, y, z, vx, vz, amt) {
      const p = this.parts[this.i++ % this.parts.length];
      p.s.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
      p.vx = vx * 0.2 + (Math.random() - 0.5) * 1.2; p.vz = vz * 0.2 + (Math.random() - 0.5) * 1.2; p.vy = 0.6 + Math.random() * 0.8;
      p.life = 0; p.max = 1.6 + Math.random() * 1.4; p.amt = amt; p.s.visible = true;
    }
    update(dt) {
      for (const p of this.parts) {
        if (!p.s.visible) continue;
        p.life += dt;
        if (p.life > p.max) { p.s.visible = false; continue; }
        const t = p.life / p.max;
        p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
        p.vx *= 1 - 1.5 * dt; p.vz *= 1 - 1.5 * dt;
        const sc = 0.8 + t * 5.5; p.s.scale.set(sc, sc, sc);
        p.s.material.opacity = (1 - t) * 0.42 * p.amt * Math.min(1, p.life * 6);
      }
    }
    clear() { for (const p of this.parts) p.s.visible = false; }
  }
  class Sound {
    constructor() { this.ok = false; this.muted = store.get('muted', false); }
    init() {
      if (this.ok) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.ctx = ctx;
        this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(ctx.destination);
        this.eg = ctx.createGain(); this.eg.gain.value = 0;
        this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 900;
        this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
        this.o2 = ctx.createOscillator(); this.o2.type = 'square';
        const g2 = ctx.createGain(); g2.gain.value = 0.45;
        this.o1.connect(this.lp); this.o2.connect(g2); g2.connect(this.lp); this.lp.connect(this.eg); this.eg.connect(this.master);
        this.o1.start(); this.o2.start();
        const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
        this.bp = ctx.createBiquadFilter(); this.bp.type = 'bandpass'; this.bp.frequency.value = 1900; this.bp.Q.value = 3;
        this.sg = ctx.createGain(); this.sg.gain.value = 0;
        noise.connect(this.bp); this.bp.connect(this.sg); this.sg.connect(this.master); noise.start();
        this.noiseBuf = buf;
        this.ok = true;
      } catch (e) { this.ok = false; }
    }
    update(rpm, throttle, screech, cyl, on) {
      if (!this.ok) return;
      const t = this.ctx.currentTime, f = rpm / 60 * cyl / 2;
      this.o1.frequency.setTargetAtTime(f, t, 0.02);
      this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.02);
      this.lp.frequency.setTargetAtTime(400 + throttle * 1800 + rpm * 0.15, t, 0.05);
      const vol = this.muted || !on ? 0 : 1;
      this.eg.gain.setTargetAtTime(vol * (0.09 + throttle * 0.15), t, 0.05);
      this.sg.gain.setTargetAtTime(vol * clamp(screech, 0, 1) * 0.22, t, 0.05);
      this.bp.frequency.setTargetAtTime(1500 + screech * 900, t, 0.1);
    }
    thump(power) {
      if (!this.ok || this.muted) return;
      const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      src.buffer = this.noiseBuf; f.type = 'lowpass'; f.frequency.value = 300;
      g.gain.setValueAtTime(clamp(power / 12, 0.1, 1) * 0.9, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(); src.stop(ctx.currentTime + 0.4);
    }
  }

  // ------------------------------------------------------------------ input
  const keys = {};
  const touch = { left: 0, right: 0, gas: 0, brake: 0, hb: 0 };
  const opts = Object.assign({ auto: true, abs: true, steerHelp: true, driftHelp: true, tcs: false }, store.get('opts', {}));
  const sound = new Sound(), skids = new Skids(), smoke = new Smoke();
  let state = 'menu';
  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    sound.init();
    if (state === 'drive') {
      if (e.code === 'KeyC') cycleCamera();
      if (e.code === 'KeyR') resetCar();
      if (e.code === 'KeyM') toggleMute();
      if (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') veh.shift(1);
      if (e.code === 'KeyQ' || e.code === 'ControlLeft' || e.code === 'ControlRight') veh.shift(-1);
      if (e.code === 'Escape' || e.code === 'KeyP') openMenu();
    } else if (state === 'menu') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') pickCar(-1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') pickCar(1);
      if (e.code === 'Enter' || e.code === 'Space') startDrive();
    }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  function bindHold(id, prop) {
    const el = $(id);
    const on = (e) => { e.preventDefault(); touch[prop] = 1; el.classList.add('on'); sound.init(); };
    const off = (e) => { e.preventDefault(); touch[prop] = 0; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, off);
  }
  ['left', 'right', 'gas', 'brake', 'hb'].forEach((k) => bindHold('t-' + k, k));
  $('t-cam').addEventListener('click', () => cycleCamera());
  $('t-menu').addEventListener('click', () => openMenu());
  $('t-up').addEventListener('pointerdown', (e) => { e.preventDefault(); veh.shift(1); });
  $('t-down').addEventListener('pointerdown', (e) => { e.preventDefault(); veh.shift(-1); });
  if (isTouch) document.body.classList.add('touch');

  let padPrev = {};
  function readInput() {
    let steer = 0, throttle = 0, brake = 0, handbrake = false;
    if (keys.ArrowLeft || keys.KeyA) steer += 1;
    if (keys.ArrowRight || keys.KeyD) steer -= 1;
    if (keys.ArrowUp || keys.KeyW) throttle = 1;
    if (keys.ArrowDown || keys.KeyS) brake = 1;
    if (keys.Space) handbrake = true;
    steer += touch.left - touch.right;
    throttle = Math.max(throttle, touch.gas);
    brake = Math.max(brake, touch.brake);
    handbrake = handbrake || !!touch.hb;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.08) steer -= Math.sign(ax) * (Math.abs(ax) - 0.08) / 0.92;
      if (p.buttons[7]) throttle = Math.max(throttle, p.buttons[7].value);
      if (p.buttons[6]) brake = Math.max(brake, p.buttons[6].value);
      if (p.buttons[0] && p.buttons[0].pressed) handbrake = true;
      const up = !!(p.buttons[5] && p.buttons[5].pressed), dn = !!(p.buttons[4] && p.buttons[4].pressed);
      if (up && !padPrev.up) veh.shift(1);
      if (dn && !padPrev.dn) veh.shift(-1);
      padPrev = { up, dn };
    }
    return { steer: clamp(steer, -1, 1), throttle, brake, handbrake };
  }

  // ------------------------------------------------------------------ game state
  let carIdx = clamp(store.get('car', 0), 0, MODELS.length - 1);
  let car = null, veh = null, model = null;
  let camMode = 0;
  const CAM_NAMES = ['Погоня', 'Дальняя', 'Капот', 'Сверху'];
  let score = 0, combo = 0, comboMul = 1, driftTime = 0, noDrift = 0;
  let best = store.get('best', 0), bestLap = store.get('bestLap', 0), bestCombo = store.get('bestCombo', 0);
  let lapStart = 0, nextCp = 1, lapsDone = 0;
  let groundY = 0, prevGround = 0;
  const showroom = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.5, roughness: 0.35 }));
  showroom.receiveShadow = true;
  scene.add(showroom);

  function spawnCar(i) {
    if (car) scene.remove(car.root);
    model = MODELS[i];
    car = buildCarObject(model);
    const h = model.head;
    veh = new Vehicle({ wheels: h.wheels, R: h.tyreRadius, length: h.length, width: h.width }, SPECS[h.name] || SPECS.VAZ2106_Restomod);
    scene.add(car.root);
    updateMenuInfo();
  }
  function pickCar(d) {
    carIdx = (carIdx + d + MODELS.length) % MODELS.length;
    store.set('car', carIdx);
    spawnCar(carIdx);
    placeInShowroom();
  }
  function placeInShowroom() {
    const s = map.showroom || map.spawn;
    showroom.position.set(s.x, 0.06, s.z); showroom.visible = true;
    veh.reset(s.x, s.z, 0.6);
  }
  function updateMenuInfo() {
    const h = model.head, s = SPECS[h.name];
    $('car-name').textContent = h.title;
    $('car-desc').textContent = s.desc;
    $('car-count').textContent = `${carIdx + 1} / ${MODELS.length}`;
    const bar = (id, v) => { $(id).style.width = `${clamp(v, 0.05, 1) * 100}%`; };
    const hp = Math.round(s.torque * s.peakRpm * 1.3 / 7023);
    bar('b-power', hp / 480); bar('b-weight', s.mass / 2300); bar('b-grip', (s.mu - 0.9) / 0.2); bar('b-steer', s.lock / 55);
    $('v-power').textContent = `≈${hp} л.с.`;
    $('v-weight').textContent = `${s.mass} кг`;
    $('v-drive').textContent = (s.drive === 'AWD' ? 'полный' : 'задний') + `, ${s.lock}°`;
  }
  const OPT_LABELS = {
    auto: ['Коробка: автомат', 'Коробка: ручная (Q / E)'], abs: ['ABS: вкл', 'ABS: выкл'], tcs: ['Антибукс: вкл', 'Антибукс: выкл'],
    steerHelp: ['Помощь рулю: вкл', 'Помощь рулю: выкл'], driftHelp: ['Анти-разворот: вкл', 'Анти-разворот: выкл'],
  };
  function renderOptions() {
    for (const k of Object.keys(OPT_LABELS)) { const el = $('o-' + k); el.textContent = OPT_LABELS[k][opts[k] ? 0 : 1]; el.classList.toggle('off', !opts[k]); }
    MAPS.forEach((m, i) => $('m-' + m.id).classList.toggle('act', i === mapIdx));
    document.body.classList.toggle('manual', !opts.auto);
  }
  const saveOpts = () => { const o = Object.assign({}, opts); delete o.surface; store.set('opts', o); };
  for (const k of Object.keys(OPT_LABELS)) $('o-' + k).addEventListener('click', () => { opts[k] = !opts[k]; saveOpts(); renderOptions(); });
  MAPS.forEach((m, i) => $('m-' + m.id).addEventListener('click', () => { if (i !== mapIdx) { loadMap(i); placeInShowroom(); renderOptions(); } }));

  function startDrive() {
    sound.init();
    state = 'drive';
    $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
    showroom.visible = false;
    veh.reset(map.spawn.x, map.spawn.z, map.spawn.yaw);
    groundY = prevGround = map.groundHeight(veh.x, veh.z);
    skids.clear(); smoke.clear();
    score = 0; combo = 0; comboMul = 1; driftTime = 0;
    nextCp = 1; lapStart = performance.now() / 1000; lapsDone = 0;
    for (const c of cones) Object.assign(c, { x: c.home[0], z: c.home[1], vx: 0, vz: 0, y: 0, vy: 0, rx: 0, rz: 0, hit: false });
    camSnap = true;
    $('lapbox').classList.toggle('hidden', !map.checkpoints);
    $('mapname').textContent = MAPS[mapIdx].name;
    toast(isTouch ? 'ГАЗ, руль ◀ ▶, РУЧНИК — сорвать зад в занос' : 'W/↑ газ · S/↓ тормоз · A D/← → руль · Пробел ручник · C камера', 4);
  }
  function openMenu() {
    bankCombo();
    state = 'menu';
    $('menu').classList.remove('hidden'); $('hud').classList.add('hidden');
    placeInShowroom();
    renderOptions();
  }
  function resetCar() {
    const p = map.checkpoints ? nearestTrackPose() : { x: veh.x, z: veh.z, yaw: veh.yaw };
    veh.reset(p.x, p.z, p.yaw);
    combo = 0; comboMul = 1; driftTime = 0;
  }
  function nearestTrackPose() {
    let bi = 0, bd = Infinity;
    map.checkpoints.forEach((p, i) => { const d = (p.x - veh.x) ** 2 + (p.z - veh.z) ** 2; if (d < bd) { bd = d; bi = i; } });
    const a = map.checkpoints[bi], b = map.checkpoints[(bi + 1) % map.checkpoints.length];
    return { x: a.x, z: a.z, yaw: Math.atan2(-(b.z - a.z), b.x - a.x) };
  }
  function cycleCamera() { camMode = (camMode + 1) % CAM_NAMES.length; toast('Камера: ' + CAM_NAMES[camMode], 1.2); }
  function toggleMute() { sound.muted = !sound.muted; store.set('muted', sound.muted); toast(sound.muted ? 'Звук выключен' : 'Звук включён', 1.2); }
  let toastT = 0;
  function toast(msg, t = 2) { $('toast').textContent = msg; $('toast').classList.add('show'); toastT = t; }
  function bankCombo() {
    if (combo > 0) {
      const pts = Math.round(combo * comboMul);
      score += pts;
      popup(`+${pts.toLocaleString('ru-RU')}`);
      if (pts > bestCombo) { bestCombo = pts; store.set('bestCombo', pts); }
      if (score > best) { best = score; store.set('best', best); }
    }
    combo = 0; comboMul = 1; driftTime = 0;
  }
  function popup(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'popup ' + cls; el.textContent = text;
    $('popups').appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
  $('btn-prev').addEventListener('click', () => pickCar(-1));
  $('btn-next').addEventListener('click', () => pickCar(1));
  $('btn-go').addEventListener('click', () => startDrive());

  // ------------------------------------------------------------------ minimap (heading-up)
  const mm = $('minimap'), mmc = mm.getContext('2d');
  function drawMinimap() {
    const M = map.minimap, W = mm.width, sc = W / M.view;
    mmc.save();
    mmc.clearRect(0, 0, W, W);
    mmc.beginPath(); mmc.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2); mmc.clip();
    mmc.fillStyle = '#20252b'; mmc.fillRect(0, 0, W, W);
    mmc.translate(W / 2, W / 2);
    mmc.rotate(-Math.PI / 2 + veh.yaw);
    mmc.scale(sc, sc);
    mmc.translate(-(veh.x + M.center), -(veh.z + M.center));
    mmc.drawImage(M.canvas, 0, 0);
    if (map.checkpoints) {
      const cp = map.checkpoints[nextCp % map.checkpoints.length];
      mmc.fillStyle = '#48d1ff'; mmc.beginPath(); mmc.arc(cp.x + M.center, cp.z + M.center, 6, 0, Math.PI * 2); mmc.fill();
    }
    mmc.restore();
    mmc.fillStyle = '#ff3b30';
    mmc.beginPath(); mmc.moveTo(W / 2, W / 2 - 8); mmc.lineTo(W / 2 + 6, W / 2 + 6); mmc.lineTo(W / 2 - 6, W / 2 + 6); mmc.closePath(); mmc.fill();
    mmc.strokeStyle = 'rgba(255,255,255,0.35)'; mmc.lineWidth = 2; mmc.beginPath(); mmc.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2); mmc.stroke();
  }

  // ------------------------------------------------------------------ collisions
  const near = [];
  function collide() {
    const [fx, fz] = veh.fwd();
    const h = model.head, b = h.parts.body;
    const midX = (b.bmin[0] + b.bmax[0]) / 2 - veh.cgx;
    const r = h.width * 0.48, half = Math.max(0, h.length / 2 - r);
    let hit = 0;
    for (const o of [midX - half, midX, midX + half]) {
      const cx = veh.x + fx * o, cz = veh.z + fz * o;
      gridQuery(cx, cz, r + 1, near);
      for (const it of near) {
        let nx, nz, pen;
        if (it.box) {
          const bx = it.box;
          const px = clamp(cx, bx.x0, bx.x1), pz = clamp(cz, bx.z0, bx.z1);
          const dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d < 1e-6) {          // centre inside: push out along the shallowest axis
            const c = [[cx - bx.x0, -1, 0], [bx.x1 - cx, 1, 0], [cz - bx.z0, 0, -1], [bx.z1 - cz, 0, 1]].sort((p, q) => p[0] - q[0])[0];
            nx = c[1]; nz = c[2]; pen = c[0] + r;
          } else { nx = dx / d; nz = dz / d; pen = r - d; }
        } else {
          const c = it.circle;
          const dx = cx - c.x, dz = cz - c.z, d = Math.hypot(dx, dz);
          if (d >= r + c.r || d < 1e-6) continue;
          nx = dx / d; nz = dz / d; pen = r + c.r - d;
        }
        veh.x += nx * pen; veh.z += nz * pen;
        hit = Math.max(hit, veh.impulse(cx - veh.x - nx * r, cz - veh.z - nz * r, nx, nz, 0.15));
      }
    }
    return hit;
  }
  function updateCones(dt) {
    const [fx, fz] = veh.fwd();
    for (const c of cones) {
      if (Math.abs(c.x - veh.x) > 8 && !c.vx && !c.vy) { /* far and resting */ } else {
        for (const o of [-veh.len * 0.3, 0, veh.len * 0.3]) {
          const cx = veh.x + fx * o, cz = veh.z + fz * o;
          const dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz);
          if (d < veh.wid * 0.5 + 0.25 && d > 1e-4) {
            const sp = veh.speed;
            c.vx = veh.vx * 1.2 + dx / d * (2 + sp * 0.3); c.vz = veh.vz * 1.2 + dz / d * (2 + sp * 0.3);
            c.vy = 2 + sp * 0.15; c.x += dx / d * 0.3; c.z += dz / d * 0.3;
            if (!c.hit && state === 'drive') { c.hit = true; popup('Конус!', 'bad'); }
          }
        }
      }
      if (c.vx || c.vz || c.vy || c.y > 0) {
        c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt; c.vy -= 9.81 * dt;
        c.rx += c.vz * dt * 1.5; c.rz -= c.vx * dt * 1.5;
        if (c.y <= 0) {
          c.y = 0; c.vy = Math.abs(c.vy) > 1.5 ? -c.vy * 0.3 : 0;
          c.vx *= 1 - 3 * dt; c.vz *= 1 - 3 * dt;
          if (Math.hypot(c.vx, c.vz) < 0.05) { c.vx = c.vz = 0; c.rx = Math.PI / 2; c.rz = 0; }
        }
      }
      c.mesh.position.set(c.x, c.y + (c.hit && c.y === 0 && !c.vx ? 0.22 : 0), c.z);
      c.mesh.rotation.set(c.hit ? c.rx : 0, 0, c.hit ? c.rz : 0);
    }
  }
  // keep the chase camera out of buildings
  function cameraClear(px, pz, tx, tz) {
    for (let t = 0.15; t <= 1.0001; t += 0.085) {
      const x = lerp(tx, px, t), z = lerp(tz, pz, t);
      gridQuery(x, z, 0.5, near);
      for (const it of near) {
        if (it.box && x > it.box.x0 - 0.6 && x < it.box.x1 + 0.6 && z > it.box.z0 - 0.6 && z < it.box.z1 + 0.6) return Math.max(0.2, t - 0.1);
      }
    }
    return 1;
  }

  // ------------------------------------------------------------------ main loop
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camSnap = true, menuAngle = 0, last = performance.now(), lastRes = { u: 0, v: 0, beta: 0 };
  const fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; };
  const PHYS_HZ = 600;

  function placeCarVisual(dt) {
    const [fx, fz] = veh.fwd();
    groundY = damp(groundY, map.groundHeight(veh.x, veh.z), 18, dt);
    car.root.position.set(veh.x - fx * veh.cgx, groundY, veh.z - fz * veh.cgx);
    car.root.rotation.y = veh.yaw;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 15);
    last = now;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }

    if (state === 'menu') {
      menuAngle += dt * 0.35;
      veh.yaw = 0.6 + menuAngle;
      placeCarVisual(1);
      car.root.position.y = 0.12;
      car.chassis.rotation.set(0, 0, 0);
      for (const w of car.wheels) w.pivot.rotation.y = 0;
      const L = veh.len, cx = showroom.position.x, cz = showroom.position.z;
      const portrait = camera.aspect < 1;
      const r = L * (portrait ? 2.1 : 1.35);
      camera.fov = portrait ? 62 : 55; camera.updateProjectionMatrix();
      camera.position.set(cx + Math.cos(0.9) * r, L * (portrait ? 0.5 : 0.36), cz + Math.sin(0.9) * r);
      camera.lookAt(cx, portrait ? -2.6 : -0.35, cz);
      sun.position.set(cx + 40, 80, cz + 30); sun.target.position.set(cx, 0, cz);
      sound.update(900, 0, 0, 4, false);
      renderer.render(scene, camera);
      return;
    }

    const inp = readInput();
    const n = Math.min(60, Math.max(1, Math.round(dt * PHYS_HZ)));
    const h = dt / n;
    let hit = 0;
    for (let i = 0; i < n; i++) {
      lastRes = veh.step(h, inp, opts);
      if (i % 4 === 3 || i === n - 1) hit = Math.max(hit, collide());
    }
    updateCones(dt);
    if (hit > 2.5) sound.thump(hit);

    // drift scoring
    const spd = veh.speed, res = lastRes;
    const angle = Math.abs(res.beta) * 180 / Math.PI;
    const drifting = spd > 8 && angle > 12 && angle < 110 && res.u > 0;
    if (hit > 4) {
      if (combo > 0) popup('Сорвано!', 'bad');
      combo = 0; comboMul = 1; driftTime = 0;
      $('flash').classList.add('on'); setTimeout(() => $('flash').classList.remove('on'), 120);
    }
    if (drifting) {
      noDrift = 0; driftTime += dt;
      combo += (angle - 10) * spd * dt * 0.9;
      const m = Math.min(5, 1 + Math.floor(driftTime / 2.2));
      if (m > comboMul) { comboMul = m; popup(`x${comboMul}`, 'mul'); }
    } else {
      noDrift += dt;
      if (noDrift > 1.1 && combo > 0) bankCombo();
    }
    if (map.checkpoints) {
      const cps = map.checkpoints, cp = cps[nextCp % cps.length];
      if ((cp.x - veh.x) ** 2 + (cp.z - veh.z) ** 2 < (map.roadW * 0.9) ** 2) {
        if (nextCp % cps.length === 0) {
          const t = performance.now() / 1000 - lapStart;
          lapsDone++;
          if (!bestLap || t < bestLap) { bestLap = t; store.set('bestLap', t); popup('Лучший круг!', 'mul'); }
          lapStart = performance.now() / 1000; nextCp = 1;
        } else nextCp++;
      }
    }

    // visuals: body roll / pitch from the load transfer, wheels from the tyre model
    placeCarVisual(dt);
    const bump = groundY - prevGround; prevGround = groundY;
    car.chassis.rotation.x = damp(car.chassis.rotation.x, clamp(veh.ayL * 0.0055, -0.055, 0.055), 10, dt);
    car.chassis.rotation.z = damp(car.chassis.rotation.z, clamp(veh.axL * 0.004, -0.035, 0.035), 10, dt);
    car.chassis.position.y = clamp(car.chassis.position.y * 0.8 + bump * 0.5, -0.05, 0.05);
    car.wheels.forEach((w, i) => { w.pivot.rotation.y = veh.w[i].delta; w.spin.rotation.z = veh.w[i].angle; });
    const braking = (veh.gear >= 0 ? inp.brake : inp.throttle) > 0 && res.u > 0.5;
    for (const m of car.brakeMats) m.emissiveIntensity = m.userData.base * (braking || inp.handbrake ? 2.6 : 1);

    // skids & smoke straight from the tyre state
    const [fx, fz] = veh.fwd(), [rx, rz] = veh.right();
    let screech = 0;
    veh.w.forEach((pw, i) => {
      const wx = veh.x + fx * pw.px + rx * pw.pz, wz = veh.z + fz * pw.px + rz * pw.pz;
      const s = pw.Fz > 300 && spd > 1.5 ? clamp((pw.slip - 1.25) / 2.5, 0, 1) : 0;
      screech = Math.max(screech, s);
      const y = map.groundHeight(wx, wz);
      skids.add(i, wx, y, wz, rx, rz, s);
      const spinV = Math.abs(pw.omega * veh.R - (veh.vx * fx + veh.vz * fz));
      const sm = clamp((spinV - 3) / 10, 0, 1) + (s > 0.5 ? s * 0.5 : 0);
      if (sm > 0.15 && Math.random() < sm) smoke.emit(wx - fx * 0.2, y + 0.3, wz - fz * 0.2, veh.vx, veh.vz, clamp(sm, 0, 1));
    });
    skids.update(); smoke.update(dt);
    sound.update(veh.rpm, Math.max(inp.throttle, veh.gear < 0 ? inp.brake : 0), screech * clamp(spd / 6, 0, 1), CYL[model.head.name] || 4, true);

    // camera
    const vdir = spd > 3 ? [veh.vx / spd, veh.vz / spd] : [fx, fz];
    let dx = lerp(fx, vdir[0], 0.35), dz = lerp(fz, vdir[1], 0.35);
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const L = veh.len, cx = veh.x, cz = veh.z, gy = groundY;
    let tp, tl, k = 6;
    if (camMode === 0) { tp = [cx - dx * (L * 1.3 + 2.4), gy + 1.9 + L * 0.12, cz - dz * (L * 1.3 + 2.4)]; tl = [cx + dx * 2, gy + 0.9, cz + dz * 2]; }
    else if (camMode === 1) { tp = [cx - dx * (L * 2.3 + 4), gy + 4.2, cz - dz * (L * 2.3 + 4)]; tl = [cx + dx * 4, gy + 0.6, cz + dz * 4]; k = 4; }
    else if (camMode === 2) { tp = [cx + fx * (0.6 - veh.cgx), gy + 1.2, cz + fz * (0.6 - veh.cgx)]; tl = [cx + fx * 20, gy + 0.9, cz + fz * 20]; k = 40; }
    else { tp = [cx - dx * 6, gy + 28, cz - dz * 6]; tl = [cx + dx * 3, gy, cz + dz * 3]; k = 5; }
    if (camMode < 2) {
      const t = cameraClear(tp[0], tp[2], cx, cz);
      if (t < 1) { tp[0] = lerp(cx, tp[0], t); tp[2] = lerp(cz, tp[2], t); tp[1] += (1 - t) * 1.5; }
    }
    if (camSnap) { camPos.set(...tp); camLook.set(...tl); camSnap = false; }
    camPos.x = damp(camPos.x, tp[0], k, dt); camPos.y = damp(camPos.y, tp[1], k, dt); camPos.z = damp(camPos.z, tp[2], k, dt);
    camLook.x = damp(camLook.x, tl[0], k * 1.5, dt); camLook.y = damp(camLook.y, tl[1], k * 1.5, dt); camLook.z = damp(camLook.z, tl[2], k * 1.5, dt);
    camera.position.copy(camPos); camera.lookAt(camLook);
    camera.fov = damp(camera.fov, (camera.aspect < 1 ? 75 : 60) + clamp(spd * 0.22, 0, 14), 3, dt);
    camera.updateProjectionMatrix();
    sun.position.set(veh.x + 50, 90, veh.z + 35); sun.target.position.set(veh.x, 0, veh.z);

    // HUD
    const s = veh.spec;
    $('speed').textContent = Math.round(spd * 3.6);
    $('gear').textContent = veh.gear < 0 ? 'R' : (veh.gear === 0 ? 'N' : veh.gear);
    $('gear').classList.toggle('shift', veh.rpm > s.redline * 0.95);
    $('rpm-bar').style.width = `${clamp(veh.rpm / s.redline, 0, 1) * 100}%`;
    $('rpm-n').textContent = Math.round(veh.rpm / 10) * 10;
    $('score').textContent = Math.round(score).toLocaleString('ru-RU');
    $('best').textContent = Math.round(best).toLocaleString('ru-RU');
    $('bestcombo').textContent = Math.round(bestCombo).toLocaleString('ru-RU');
    if (map.checkpoints) {
      $('lap').textContent = fmtTime(performance.now() / 1000 - lapStart);
      $('lap-best').textContent = bestLap ? fmtTime(bestLap) : '—';
      $('lap-n').textContent = lapsDone;
    }
    if (combo > 0) {
      $('drift').classList.add('show');
      $('drift-pts').textContent = Math.round(combo).toLocaleString('ru-RU');
      $('drift-mul').textContent = 'x' + comboMul;
      $('drift-ang').textContent = drifting ? `${Math.round(angle)}°` : '';
    } else $('drift').classList.remove('show');
    drawMinimap();
    renderer.render(scene, camera);
  }

  loadMap(mapIdx);
  spawnCar(carIdx);
  placeInShowroom();
  renderOptions();
  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
  requestAnimationFrame(frame);

  // hooks for automated tests
  window.__game = {
    veh: () => veh, startDrive, pickCar, state: () => state, cycleCamera, opts, info: () => renderer.info.render,
    loadMap: (i) => { loadMap(i); placeInShowroom(); renderOptions(); },
    setInput: (o) => Object.assign(touch, o),
    sim(script, every = 0.5) {
      const out = []; let t = 0, next = 0;
      for (const [dur, inp] of script) {
        const full = Object.assign({ steer: 0, throttle: 0, brake: 0, handbrake: false }, inp);
        for (let k = 0; k < Math.round(dur * PHYS_HZ); k++) {
          const r = veh.step(1 / PHYS_HZ, full, opts); t += 1 / PHYS_HZ;
          if (k % 4 === 0) collide();
          if (t >= next) { next += every; out.push({ t: +t.toFixed(2), kmh: +(veh.speed * 3.6).toFixed(1), beta: +(r.beta * 57.3).toFixed(1), x: +veh.x.toFixed(1), z: +veh.z.toFixed(1) }); }
        }
      }
      return out;
    },
  };
};
