/* Drift Restomod — single-file three.js drifting game.
 * runGame(THREE, carBuffers) is called by the loader in index.html once three.js and the car packs are unpacked.
 * World axes: x / z ground plane, y up. A car's local +X is forward, +Z is its right side.
 */
window.runGame = async function runGame(THREE, carBuffers) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  // ------------------------------------------------------------------ car balance
  const SPECS = {
    VAZ2106_Restomod: { hp: 210, mass: 1100, grip: 1.0, drive: 0.0, steer: 0.62, top: 235, plate: 'Белая шестёрка на расширителях' },
    ZAZ968_Coupe: { hp: 150, mass: 940, grip: 0.97, drive: 0.0, steer: 0.64, top: 210, plate: 'Заднемоторное купе, лёгкое и вертлявое' },
    LADA2107_NewGen: { hp: 250, mass: 1180, grip: 1.02, drive: 0.0, steer: 0.6, top: 245, plate: 'Классика нового поколения' },
    Nova63_Restomod: { hp: 430, mass: 1400, grip: 1.05, drive: 0.0, steer: 0.58, top: 270, plate: 'V8, много дыма' },
    VAZ2108_2025: { hp: 230, mass: 990, grip: 1.03, drive: 0.2, steer: 0.62, top: 240, plate: 'Полный привод с упором назад' },
    ZIL111_Restomod: { hp: 400, mass: 2250, grip: 1.08, drive: 0.0, steer: 0.55, top: 220, plate: 'Две с лишним тонны дипломатии' },
  };

  // ------------------------------------------------------------------ renderer / scene
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 75 : 60;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // sky gradient background + fog
  function gradientTexture(stops, w = 4, h = 512) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  scene.background = gradientTexture([[0, '#5d8fd0'], [0.55, '#a9c8e8'], [0.75, '#e8eef2'], [1, '#d9dcdc']]);
  scene.fog = new THREE.Fog(0xcfdbe4, 180, 700);

  // environment map for reflections (studio-ish sky dome with soft boxes)
  {
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: gradientTexture([[0, '#7aa6dd'], [0.48, '#e9f1f7'], [0.52, '#8a8f93'], [1, '#3c3f42']]) }));
    env.add(sky);
    const panel = (x, y, z, w, h, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(0, 40, 0, 40, 18, 6); panel(30, 15, 20, 18, 10, 3); panel(-30, 15, -20, 18, 10, 2.5);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    pm.dispose();
  }

  const hemi = new THREE.HemisphereLight(0xdfefff, 0x5a5048, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  sun.position.set(60, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 10; sc.far = 250;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // ------------------------------------------------------------------ textures
  function noiseTexture(size, base, spread, specks, repeat) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      let v = base + (Math.random() - 0.5) * spread;
      if (Math.random() < specks) v += 40 * Math.random();
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // ------------------------------------------------------------------ track
  const LOT = 175;                       // asphalt lot half size, walls on its edge
  const ROAD_W = 16;
  const ctrl = [[-110, -125], [0, -132], [80, -122], [125, -88], [138, -32], [108, 6], [58, 2], [26, 32], [40, 78],
    [95, 92], [132, 122], [104, 152], [22, 148], [-42, 122], [-62, 72], [-102, 56], [-138, 20], [-146, -40], [-138, -98]];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const TRACK_N = 900;
  const trackPts = curve.getSpacedPoints(TRACK_N).slice(0, TRACK_N);
  const trackLen = curve.getLength();
  const trackDir = trackPts.map((p, i) => trackPts[(i + 1) % TRACK_N].clone().sub(p).normalize());
  const trackSide = trackDir.map((d) => new THREE.Vector3(-d.z, 0, d.x));     // right-hand side of travel
  const trackCurv = trackDir.map((d, i) => {
    const n = trackDir[(i + 4) % TRACK_N], p = trackDir[(i - 4 + TRACK_N) % TRACK_N];
    return (p.x * n.z - p.z * n.x) / (8 * trackLen / TRACK_N);      // signed curvature, >0 turning right
  });

  function ribbon(offA, offB, y, colorFn, step = 1) {
    const pos = [], col = [], idx = [], uv = [];
    let k = 0;
    const segLen = trackLen / TRACK_N;
    for (let i = 0; i <= TRACK_N; i += step) {
      const j = i % TRACK_N, p = trackPts[j], s = trackSide[j];
      const c = colorFn ? colorFn(j) : [1, 1, 1];
      pos.push(p.x + s.x * offA, y, p.z + s.z * offA, p.x + s.x * offB, y, p.z + s.z * offB);
      col.push(...c, ...c);
      uv.push(0, i * segLen / 16, Math.abs(offB - offA) / 16, i * segLen / 16);
      if (i > 0) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      k += 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  const world = new THREE.Group();
  scene.add(world);
  {
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x6f8a4e, roughness: 1, map: noiseTexture(256, 150, 60, 0.05, 300) }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; grass.receiveShadow = true;
    world.add(grass);
    const asphaltTex = noiseTexture(512, 92, 34, 0.02, 90);
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(LOT * 2 + 10, LOT * 2 + 10),
      new THREE.MeshStandardMaterial({ color: 0x8c8c8a, roughness: 0.95, map: asphaltTex }));
    lot.rotation.x = -Math.PI / 2; lot.receiveShadow = true;
    world.add(lot);
    const roadTex = noiseTexture(512, 70, 26, 0.015, 1);
    roadTex.repeat.set(1, 1);
    const road = new THREE.Mesh(ribbon(-ROAD_W / 2, ROAD_W / 2, 0.01, null),
      new THREE.MeshStandardMaterial({ color: 0x45474b, roughness: 0.82, map: roadTex }));
    road.receiveShadow = true;
    world.add(road);
    const lineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    for (const s of [-1, 1]) {
      world.add(Object.assign(new THREE.Mesh(ribbon(s * (ROAD_W / 2 - 0.6), s * (ROAD_W / 2 - 0.3), 0.015, () => [0.95, 0.95, 0.95]), lineMat), { receiveShadow: true }));
    }
    // curbs on the inside of corners
    const curbCol = (j) => (Math.floor(j / 3) % 2 ? [0.85, 0.08, 0.06] : [0.95, 0.95, 0.95]);
    const pos = [], col = [];
    for (let i = 0; i < TRACK_N; i++) {
      const k = trackCurv[i];
      if (Math.abs(k) < 0.012) continue;
      const side = k > 0 ? 1 : -1;          // inside of the bend
      const j2 = (i + 1) % TRACK_N;
      const a0 = side * ROAD_W / 2, a1 = side * (ROAD_W / 2 + 1.4);
      const P = (j, o) => [trackPts[j].x + trackSide[j].x * o, 0.03, trackPts[j].z + trackSide[j].z * o];
      const q = [P(i, a0), P(i, a1), P(j2, a0), P(j2, a1)];
      pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
      const c = curbCol(i);
      for (let t = 0; t < 6; t++) col.push(...c);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    cg.computeVertexNormals();
    const curbs = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
    curbs.receiveShadow = true;
    world.add(curbs);
    // start / finish chequer
    const chk = document.createElement('canvas'); chk.width = 64; chk.height = 8;
    const cgx = chk.getContext('2d');
    for (let x = 0; x < 64; x += 4) for (let y = 0; y < 8; y += 4) { cgx.fillStyle = ((x + y) / 4) % 2 ? '#111' : '#eee'; cgx.fillRect(x, y, 4, 4); }
    const ct = new THREE.CanvasTexture(chk); ct.magFilter = THREE.NearestFilter; ct.colorSpace = THREE.SRGBColorSpace;
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 2), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7 }));
    sf.rotation.x = -Math.PI / 2;
    sf.rotation.z = Math.atan2(trackDir[0].x, trackDir[0].z) + Math.PI / 2;
    sf.position.set(trackPts[0].x, 0.02, trackPts[0].z);
    world.add(sf);
    // drift circle painted + gantry
    const ringG = new THREE.RingGeometry(23.6, 24, 96);
    const ring = new THREE.Mesh(ringG, new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(-20, 0.016, -50);
    world.add(ring);
  }

  // ------------------------------------------------------------------ props & colliders
  const statics = [];       // {x, z, r} circles the car bounces off
  const cones = [];         // dynamic cones
  {
    // perimeter walls (concrete blocks with stripes)
    const blockGeo = new THREE.BoxGeometry(4, 1.1, 0.8);
    const n = Math.round((LOT * 2) / 4);
    const wall = new THREE.InstancedMesh(blockGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), n * 4);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    let k = 0;
    const colA = new THREE.Color(0xd6d6d2), colB = new THREE.Color(0xc0261d);
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < n; i++) {
        const t = -LOT + 2 + i * 4;
        const x = side < 2 ? t : (side === 2 ? LOT + 0.4 : -LOT - 0.4);
        const z = side < 2 ? (side === 0 ? LOT + 0.4 : -LOT - 0.4) : t;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side < 2 ? 0 : Math.PI / 2);
        m.compose(new THREE.Vector3(x, 0.55, z), q, s);
        wall.setMatrixAt(k, m);
        wall.setColorAt(k, i % 2 ? colA : colB);
        k++;
      }
    }
    wall.castShadow = true; wall.receiveShadow = true;
    world.add(wall);
    // light poles
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.6, roughness: 0.4 });
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 14, 8), poleMat, 40);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x444a50, emissive: 0xfff3d0, emissiveIntensity: 0.4 }), 40);
    let pk = 0;
    for (let i = 0; i < 10; i++) for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = -LOT + 20 + i * ((LOT * 2 - 40) / 9);
      const x = sx ? sx * (LOT + 4) : t, z = sz ? sz * (LOT + 4) : t;
      m.compose(new THREE.Vector3(x, 7, z), new THREE.Quaternion(), s); pole.setMatrixAt(pk, m);
      m.compose(new THREE.Vector3(x - sx * 1, 14, z - sz * 1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx ? Math.PI / 2 : 0), s);
      head.setMatrixAt(pk, m); pk++;
    }
    pole.castShadow = true;
    world.add(pole, head);
    // tyre stacks on the outside of corners
    const tyreGeo = new THREE.CylinderGeometry(0.62, 0.62, 1.05, 14);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.85 });
    const tyrePos = [];
    for (let i = 0; i < TRACK_N; i += 4) {
      const kk = trackCurv[i];
      if (Math.abs(kk) < 0.02) continue;
      const side = kk > 0 ? -1 : 1;          // outside of the bend
      const p = trackPts[i], sd = trackSide[i];
      const o = side * (ROAD_W / 2 + 9);
      tyrePos.push([p.x + sd.x * o, p.z + sd.z * o]);
    }
    const tyres = new THREE.InstancedMesh(tyreGeo, tyreMat, tyrePos.length);
    tyrePos.forEach(([x, z], i) => {
      m.compose(new THREE.Vector3(x, 0.52, z), new THREE.Quaternion(), s); tyres.setMatrixAt(i, m);
      statics.push({ x, z, r: 0.65 });
    });
    tyres.castShadow = true; tyres.receiveShadow = true;
    world.add(tyres);
    // containers and trees for scenery
    const contCols = [0x2b6cb0, 0xb7472a, 0x2f855a, 0xd69e2e];
    const contGeo = new THREE.BoxGeometry(12, 2.6, 2.5);
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(contGeo, new THREE.MeshStandardMaterial({ color: contCols[i % 4], roughness: 0.6, metalness: 0.3 }));
      c.position.set(-LOT + 12 + (i % 4) * 2.7 + (i > 3 ? 0 : 0), 1.3 + (i > 3 ? 2.6 : 0), LOT - 20 - (i % 4) * 2.7);
      c.rotation.y = Math.PI / 2;
      c.castShadow = c.receiveShadow = true;
      world.add(c);
    }
    statics.push({ x: -LOT + 16, z: LOT - 24, r: 7 });
    const treeGeo = new THREE.ConeGeometry(3, 9, 7);
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2, 6);
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0x2f5d32, roughness: 1 }), 160);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b4632 }), 160);
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, r = LOT + 30 + Math.random() * 160;
      const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 1.1, sc = 0.8 + Math.random() * 0.8;
      m.compose(new THREE.Vector3(x, 5.5 * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)); trees.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 1, z), new THREE.Quaternion(), s); trunks.setMatrixAt(i, m);
    }
    trees.castShadow = true;
    world.add(trees, trunks);
    // cones: drift circle + slalom
    const coneGeo = new THREE.ConeGeometry(0.23, 0.7, 12);
    coneGeo.translate(0, 0.35, 0);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5 });
    const addCone = (x, z) => {
      const mesh = new THREE.Mesh(coneGeo, coneMat);
      mesh.position.set(x, 0, z); mesh.castShadow = true;
      world.add(mesh);
      cones.push({ mesh, x, z, vx: 0, vz: 0, vy: 0, y: 0, rx: 0, rz: 0, hit: false, home: [x, z] });
    };
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; addCone(-20 + Math.cos(a) * 7, -50 + Math.sin(a) * 7); }
    for (let i = 0; i < 10; i++) addCone(-40 + i * 14, 60 + (i % 2 ? 2.5 : -2.5));
  }

  // ------------------------------------------------------------------ car loading
  function makeMaterial(d) {
    const col = new THREE.Color().setRGB(...d.color);
    if (d.kind === 'glass') {
      return new THREE.MeshPhysicalMaterial({ color: col, metalness: 0, roughness: 0.04, transparent: true, opacity: d.opacity, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide });
    }
    if (d.kind === 'paint') {
      return new THREE.MeshPhysicalMaterial({ color: col, metalness: clamp(d.metal, 0, 0.7), roughness: clamp(d.rough, 0.15, 1), clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 });
    }
    if (d.kind === 'emit') {
      const e = new THREE.Color().setRGB(...d.emissive);
      const m = new THREE.MeshStandardMaterial({ color: col, emissive: e, emissiveIntensity: clamp(d.estr / 4, 0.4, 4), roughness: 0.3 });
      m.userData.baseEmissive = m.emissiveIntensity;
      return m;
    }
    if (d.kind === 'carbon') return new THREE.MeshPhysicalMaterial({ color: 0x18181b, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 });
    return new THREE.MeshStandardMaterial({ color: col, metalness: d.metal, roughness: clamp(d.rough, 0.04, 1), envMapIntensity: 1.0 });
  }

  function parsePack(buf) {
    const dv = new DataView(buf);
    const jl = dv.getUint32(0, true);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
    const base = 4 + jl;
    const mats = head.materials.map(makeMaterial);
    const geom = (part) => {
      if (!part) return null;
      const q = new Uint16Array(buf.slice(base + part.pos, base + part.pos + part.vcount * 6));
      const pos = new Float32Array(part.vcount * 3);
      for (let i = 0; i < part.vcount; i++) for (let a = 0; a < 3; a++) {
        pos[i * 3 + a] = part.bmin[a] + (q[i * 3 + a] / 65535) * (part.bmax[a] - part.bmin[a]);
      }
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
    return { head, mats, body: geom(head.parts.body), wheel: geom(head.parts.wheel), caliper: geom(head.parts.caliper) };
  }

  const MODELS = carBuffers.map(parsePack);

  function buildCarObject(model) {
    const root = new THREE.Group();
    const chassis = new THREE.Group();       // pitches / rolls
    root.add(chassis);
    const body = new THREE.Mesh(model.body, model.mats);
    body.castShadow = true; body.receiveShadow = true;
    chassis.add(body);
    const wheels = model.head.wheels.map((c) => {
      const pivot = new THREE.Group();
      pivot.position.set(c[0], c[1], c[2]);
      if (c[2] < 0) pivot.scale.z = -1;      // left side: mirror the right-hand wheel
      const spin = new THREE.Group();
      const wm = new THREE.Mesh(model.wheel, model.mats);
      wm.castShadow = true;
      spin.add(wm);
      pivot.add(spin);
      if (model.caliper) pivot.add(new THREE.Mesh(model.caliper, model.mats));
      root.add(pivot);
      return { pivot, spin, front: c[0] > 0, left: c[2] < 0, base: new THREE.Vector3(c[0], c[1], c[2]) };
    });
    // contact shadow blob under the car (helps on low shadow-map settings)
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(model.head.length * 1.05, model.head.width * 1.15),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, map: radialTexture() }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02;
    root.add(blob);
    const brakeMats = model.mats.filter((m) => m.emissive && m.emissive.r > 0.8 && m.emissive.g < 0.2);
    return { root, chassis, wheels, brakeMats };
  }

  let _radial = null;
  function radialTexture() {
    if (_radial) return _radial;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    _radial = new THREE.CanvasTexture(c);
    return _radial;
  }

  // ------------------------------------------------------------------ vehicle physics
  class Vehicle {
    constructor(model, spec) {
      const h = model.head;
      const fx = h.wheels.filter((w) => w[0] > 0)[0][0], rx = h.wheels.filter((w) => w[0] < 0)[0][0];
      this.wb = fx - rx;
      this.a = fx; this.b = -rx;                       // CG at origin
      this.track = Math.abs(h.wheels[0][2] - h.wheels[2][2]);
      this.R = h.tyreRadius;
      this.len = h.length; this.wid = h.width;
      this.m = spec.mass;
      this.I = this.m * this.wb * this.wb * 0.3;
      this.P = spec.hp * 745.7;
      this.mu = 1.12 * spec.grip;
      this.driveFront = spec.drive;
      this.maxSteer = spec.steer;
      this.vmax = spec.top / 3.6;
      this.reset(0, 0, 0);
    }
    reset(x, z, yaw) {
      this.x = x; this.z = z; this.yaw = yaw;
      this.vx = 0; this.vz = 0; this.w = 0;
      this.steer = 0; this.ax = 0; this.ay = 0;
      this.slipF = 0; this.slipR = 0; this.wheelSpin = 0; this.spinAngle = 0;
      this.gear = 1; this.rpm = 900;
    }
    get speed() { return Math.hypot(this.vx, this.vz); }
    fwd() { return [Math.cos(this.yaw), -Math.sin(this.yaw)]; }
    right() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }

    step(dt, inp, assist) {
      const g = 9.81, m = this.m, L = this.wb, a = this.a, b = this.b, hcg = 0.5;
      const [fx, fz] = this.fwd(), [rx, rz] = this.right();
      let u = this.vx * fx + this.vz * fz;          // forward speed
      let v = this.vx * rx + this.vz * rz;          // rightward speed
      const spd = Math.hypot(u, v);

      // steering: speed-sensitive limit + optional counter-steer assist
      const lim = this.maxSteer / (1 + spd * 0.02);
      let target = inp.steer * lim;
      const beta = Math.atan2(-v, Math.max(Math.abs(u), 1)) * Math.sign(u || 1);   // + = velocity to the left
      // counter-steer assist fades out while the driver holds the wheel over
      if (assist > 0 && spd > 4) target = clamp(target + assist * (1 - 0.7 * Math.abs(inp.steer)) * beta, -this.maxSteer, this.maxSteer);
      const rate = Math.sign(target) !== Math.sign(this.steer) ? 6 : (Math.abs(target) > Math.abs(this.steer) ? 3.4 : 5.5);
      this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
      const d = this.steer;

      // loads with longitudinal transfer
      let Nf = m * g * b / L - m * this.ax * hcg / L;
      let Nr = m * g * a / L + m * this.ax * hcg / L;
      Nf = Math.max(Nf, m * g * 0.15); Nr = Math.max(Nr, m * g * 0.15);

      // longitudinal forces
      const throttle = inp.throttle, brake = inp.brake;
      let Fdrive = 0, Fbrake = 0;
      if (brake > 0 && u > 1.0) Fbrake = brake * m * g * 1.05;
      else if (brake > 0) Fdrive = -brake * Math.min(this.P * 0.35 / Math.max(Math.abs(u), 3), m * g * 0.6) * (u > -8 ? 1 : 0);
      if (throttle > 0) {
        if (u < -1) Fbrake = throttle * m * g * 1.0;
        else Fdrive = throttle * Math.min(this.P / Math.max(u, 4), m * g * 1.25) * (u < this.vmax ? 1 : 0);
      }
      const Fr_drive = Fdrive * (1 - this.driveFront), Ff_drive = Fdrive * this.driveFront;
      const muR = this.mu * (inp.handbrake ? 0.4 : 0.9), muF = this.mu;

      // tyre slip angles
      const latF = v - this.w * a;                   // lateral speed at the front axle (right +)
      const fwdF = u * Math.cos(d) - latF * Math.sin(d);   // in the frame of the wheel, steered left by d
      const sideF = latF * Math.cos(d) + u * Math.sin(d);
      const latR = v + this.w * b;
      const alphaF = Math.atan2(sideF, Math.max(Math.abs(fwdF), 2.0));
      const alphaR = Math.atan2(latR, Math.max(Math.abs(u), 2.0));
      const curve = (x) => {
        const ax = Math.abs(x);
        const f = ax < 1 ? ax * (1.5 - 0.5 * ax * ax) : 1 - 0.33 * Math.min(1, (ax - 1) / 2.5);
        return Math.sign(x) * f;
      };
      // rear traction circle: wheelspin / handbrake eat into lateral grip
      let FxR = Fr_drive - (inp.handbrake ? Math.sign(u) * 0.55 * muR * Nr : 0) - Math.sign(u) * Fbrake * 0.4;
      const capR = muR * Nr;
      const spinRatio = clamp(Math.abs(FxR) / capR, 0, 1.4);
      FxR = clamp(FxR, -capR, capR);
      let latCapR = capR * Math.sqrt(Math.max(0.18, 1 - 0.9 * Math.min(1, spinRatio) ** 2));
      // assist: with the wheel centred the rear slowly regains grip, so a slide winds down by itself
      latCapR *= 1 + assist * 0.9 * (1 - Math.abs(inp.steer)) * Math.min(1, Math.abs(beta) / 0.6);
      let FxF = Ff_drive - Math.sign(u) * Fbrake * 0.6;
      const capF = muF * Nf;
      FxF = clamp(FxF, -capF, capF);
      const latCapF = capF * Math.sqrt(Math.max(0.2, 1 - 0.8 * (FxF / capF) ** 2));
      const FyF = -latCapF * curve(alphaF / 0.15);
      const FyR = -latCapR * curve(alphaR / 0.12);
      this.slipF = alphaF; this.slipR = alphaR; this.wheelSpin = spinRatio;

      // resistances
      const drag = 0.42 * spd;
      const Fx = FxR + FxF * Math.cos(d) + FyF * Math.sin(d) - drag * u - 12 * u;
      const FyFront = FyF * Math.cos(d) - FxF * Math.sin(d);
      const Fy = FyR + FyFront - drag * v;
      let torque = -a * FyFront + b * FyR;
      // anti-spin: with the assist on, yaw is damped once the slide goes past ~45 degrees
      const over = clamp((Math.abs(beta) - 0.75) / 0.6, 0, 1);
      torque -= assist * over * this.w * this.I * 4.0;

      const axl = Fx / m, ayl = Fy / m;
      this.ax = damp(this.ax, axl, 10, dt);
      this.ay = damp(this.ay, ayl, 10, dt);
      this.vx += (axl * fx + ayl * rx) * dt;
      this.vz += (axl * fz + ayl * rz) * dt;
      this.w += (torque / this.I) * dt;
      this.w *= 1 - 0.8 * dt;
      // creep stop
      if (spd < 0.6 && throttle === 0 && brake === 0) { this.vx *= 0.9; this.vz *= 0.9; this.w *= 0.85; }
      if (spd < 2.0) this.w *= 1 - 3 * dt;
      this.yaw += this.w * dt;
      this.x += this.vx * dt;
      this.z += this.vz * dt;

      // drivetrain simulation for the tach / sound
      const ratios = [0, 3.6, 2.3, 1.65, 1.25, 1.0, 0.82];
      const wheelU = Math.abs(u) * (1 + 0.6 * Math.max(0, spinRatio - 0.8));
      let rpm = 900 + wheelU / this.R * ratios[this.gear] * 3.9 * 60 / (2 * Math.PI);
      if (rpm > 7000 && this.gear < 6) this.gear++;
      else if (rpm < 3200 && this.gear > 1) this.gear--;
      rpm = 900 + wheelU / this.R * ratios[this.gear] * 3.9 * 60 / (2 * Math.PI);
      this.rpm = damp(this.rpm, clamp(rpm + throttle * 600, 850, 7600), 12, dt);
      this.spinAngle -= (u / this.R) * dt * (1 + (inp.handbrake ? -1 : 0.4 * Math.max(0, spinRatio - 0.9)));
      return { u, v, beta };
    }

    collideCircle(px, pz, r, ox, oz, or, e = 0.3, movable = false) {
      // car circle at local offset (px, pz) vs world circle
      const [fx, fz] = this.fwd(), [rx, rz] = this.right();
      const cx = this.x + fx * px + rx * pz, cz = this.z + fz * px + rz * pz;
      let dx = cx - ox, dz = cz - oz;
      const dist = Math.hypot(dx, dz);
      if (dist >= r + or || dist < 1e-6) return 0;
      const nx = dx / dist, nz = dz / dist;
      const pen = r + or - dist;
      if (movable) return { nx, nz, pen, cx, cz };
      this.x += nx * pen; this.z += nz * pen;
      return this.impulse(cx - this.x, cz - this.z, nx, nz, e);
    }

    impulse(px, pz, nx, nz, e) {
      const vpx = this.vx + this.w * pz, vpz = this.vz - this.w * px;
      const vn = vpx * nx + vpz * nz;
      if (vn >= 0) return 0;
      const pxn = pz * nx - px * nz;
      const j = -(1 + e) * vn / (1 / this.m + pxn * pxn / this.I);
      this.vx += j * nx / this.m; this.vz += j * nz / this.m;
      this.w += pxn * j / this.I;
      // scrub some speed on impact
      this.vx *= 0.97; this.vz *= 0.97;
      return -vn;
    }
  }

  // ------------------------------------------------------------------ effects: skid marks + smoke
  class Skids {
    constructor(max = 3000) {
      this.max = max;
      this.pos = new Float32Array(max * 18);
      this.col = new Float32Array(max * 24);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
      this.geo = g;
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: 0x111111 }));
      mesh.frustumCulled = false; mesh.renderOrder = 1;
      scene.add(mesh);
      this.n = 0; this.last = {};
    }
    clear() { this.pos.fill(0); this.col.fill(0); this.n = 0; this.last = {}; this.flag(); }
    flag() { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
    add(id, x, z, sx, sz, a) {
      const l = this.last[id];
      const w = 0.12;
      const L = [x - sx * w, z - sz * w], Rr = [x + sx * w, z + sz * w];
      if (a <= 0) { this.last[id] = null; return; }
      if (l && Math.hypot(x - l.x, z - l.z) < 0.25) return;
      if (l && Math.hypot(x - l.x, z - l.z) < 2.5) {
        const i = this.n % this.max, p = i * 18, c = i * 24, y = 0.025;
        const q = [l.L[0], y, l.L[1], l.R[0], y, l.R[1], L[0], y, L[1], l.R[0], y, l.R[1], Rr[0], y, Rr[1], L[0], y, L[1]];
        this.pos.set(q, p);
        for (let k = 0; k < 6; k++) this.col.set([0.05, 0.05, 0.05, a * 0.55], c + k * 4);
        this.n++;
        this.dirty = true;
      }
      this.last[id] = { x, z, L, R: Rr };
    }
    update() { if (this.dirty) { this.flag(); this.dirty = false; } }
  }

  class Smoke {
    constructor(n = 140) {
      this.parts = [];
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: 0xf0f0f0, transparent: true, opacity: 0, depthWrite: false }));
        s.visible = false;
        scene.add(s);
        this.parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
      }
      this.i = 0;
    }
    emit(x, y, z, vx, vz, amount) {
      const p = this.parts[this.i++ % this.parts.length];
      p.s.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
      p.vx = vx * 0.25 + (Math.random() - 0.5) * 1.2; p.vz = vz * 0.25 + (Math.random() - 0.5) * 1.2; p.vy = 0.6 + Math.random() * 0.8;
      p.life = 0; p.max = 1.6 + Math.random() * 1.4; p.amt = amount;
      p.s.visible = true;
    }
    update(dt) {
      for (const p of this.parts) {
        if (!p.s.visible) continue;
        p.life += dt;
        if (p.life > p.max) { p.s.visible = false; continue; }
        const t = p.life / p.max;
        p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
        p.vx *= 1 - 1.5 * dt; p.vz *= 1 - 1.5 * dt;
        const sc = 0.8 + t * 5.5;
        p.s.scale.set(sc, sc, sc);
        p.s.material.opacity = (1 - t) * 0.42 * p.amt * Math.min(1, p.life * 6);
      }
    }
    clear() { for (const p of this.parts) p.s.visible = false; }
  }

  // ------------------------------------------------------------------ sound (WebAudio synth)
  class Sound {
    constructor() { this.ok = false; this.muted = false; }
    init() {
      if (this.ok) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.ctx = ctx;
        this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(ctx.destination);
        this.eg = ctx.createGain(); this.eg.gain.value = 0;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; this.lp = lp;
        this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
        this.o2 = ctx.createOscillator(); this.o2.type = 'square';
        const g2 = ctx.createGain(); g2.gain.value = 0.45;
        this.o1.connect(lp); this.o2.connect(g2); g2.connect(lp); lp.connect(this.eg); this.eg.connect(this.master);
        this.o1.start(); this.o2.start();
        const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 3; this.bp = bp;
        this.sg = ctx.createGain(); this.sg.gain.value = 0;
        noise.connect(bp); bp.connect(this.sg); this.sg.connect(this.master); noise.start();
        this.ok = true;
      } catch (e) { this.ok = false; }
    }
    update(rpm, throttle, screech, on) {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      const f = rpm / 60 * 2;      // 4-stroke: fires every other revolution per cylinder pair
      this.o1.frequency.setTargetAtTime(f, t, 0.03);
      this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
      this.lp.frequency.setTargetAtTime(500 + throttle * 1800 + rpm * 0.15, t, 0.05);
      const vol = this.muted || !on ? 0 : 1;
      this.eg.gain.setTargetAtTime(vol * (0.10 + throttle * 0.14), t, 0.05);
      this.sg.gain.setTargetAtTime(vol * clamp(screech, 0, 1) * 0.22, t, 0.05);
      this.bp.frequency.setTargetAtTime(1500 + screech * 900, t, 0.1);
    }
  }

  // ------------------------------------------------------------------ input
  const keys = {};
  const touch = { left: 0, right: 0, gas: 0, brake: 0, hb: 0 };
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    sound.init();
    if (state === 'drive') {
      if (e.code === 'KeyC') cycleCamera();
      if (e.code === 'KeyR') resetToTrack();
      if (e.code === 'KeyM') toggleMute();
      if (e.code === 'KeyH') toggleAssist();
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
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }
  ['left', 'right', 'gas', 'brake', 'hb'].forEach((k) => bindHold('t-' + k, k));
  $('t-cam').addEventListener('click', () => cycleCamera());
  $('t-menu').addEventListener('click', () => openMenu());
  if (isTouch) document.body.classList.add('touch');

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
      if (Math.abs(ax) > 0.12) steer -= ax;
      if (p.buttons[7]) throttle = Math.max(throttle, p.buttons[7].value);
      if (p.buttons[6]) brake = Math.max(brake, p.buttons[6].value);
      if (p.buttons[0] && p.buttons[0].pressed) handbrake = true;
    }
    return { steer: clamp(steer, -1, 1), throttle, brake, handbrake };
  }

  // ------------------------------------------------------------------ game state
  const sound = new Sound();
  const skids = new Skids();
  const smoke = new Smoke();
  let state = 'menu';
  let carIdx = 0;
  try { carIdx = clamp(parseInt(localStorage.getItem('drift_car') || '0', 10) || 0, 0, MODELS.length - 1); } catch (e) { /* storage blocked */ }
  let car = null, veh = null;
  let camMode = 0;
  const CAM_NAMES = ['Погоня', 'Дальняя', 'Капот', 'Сверху'];
  let assist = 0.55;
  let score = 0, combo = 0, comboMul = 1, driftTime = 0, noDrift = 0, best = 0, bestLap = 0;
  let lapStart = 0, lapTimeRun = 0, nextCp = 1, lapsDone = 0, lastLap = 0;
  const CP = 12;
  const cpIdx = Array.from({ length: CP }, (_, i) => Math.round(i * TRACK_N / CP));
  try { best = parseFloat(localStorage.getItem('drift_best') || '0') || 0; bestLap = parseFloat(localStorage.getItem('drift_bestlap') || '0') || 0; } catch (e) { /* ignore */ }

  const showroom = new THREE.Group();
  {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.12, 64),
      new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.5, roughness: 0.35 }));
    disc.position.y = 0.06; disc.receiveShadow = true;
    showroom.add(disc);
    showroom.position.set(30, 0, -75);
    scene.add(showroom);
  }

  function spawnCar(i) {
    if (car) { (car.root.parent || scene).remove(car.root); }
    const model = MODELS[i];
    car = buildCarObject(model);
    veh = new Vehicle(model, SPECS[model.head.name] || SPECS.VAZ2106_Restomod);
    scene.add(car.root);
    updateMenuInfo();
  }

  function pickCar(d) {
    carIdx = (carIdx + d + MODELS.length) % MODELS.length;
    try { localStorage.setItem('drift_car', String(carIdx)); } catch (e) { /* ignore */ }
    spawnCar(carIdx);
    placeInShowroom();
  }

  function placeInShowroom() {
    veh.reset(showroom.position.x, showroom.position.z, 0.6);
    car.root.position.set(veh.x, 0.12, veh.z);
  }

  function updateMenuInfo() {
    const h = MODELS[carIdx].head, s = SPECS[h.name];
    $('car-name').textContent = h.title;
    $('car-desc').textContent = s.plate;
    $('car-count').textContent = `${carIdx + 1} / ${MODELS.length}`;
    const bar = (id, v) => { $(id).style.width = `${clamp(v, 0.05, 1) * 100}%`; };
    bar('b-power', s.hp / 450);
    bar('b-weight', s.mass / 2300);
    bar('b-grip', (s.grip - 0.9) / 0.2);
    bar('b-steer', (s.steer - 0.5) / 0.15);
    $('v-power').textContent = `${s.hp} л.с.`;
    $('v-weight').textContent = `${s.mass} кг`;
    $('v-drive').textContent = s.drive > 0 ? 'полный' : 'задний';
  }

  function trackPose(i) {
    const p = trackPts[i], d = trackDir[i];
    return { x: p.x, z: p.z, yaw: Math.atan2(-d.z, d.x) };
  }

  function startDrive() {
    sound.init();
    state = 'drive';
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    const p = trackPose(TRACK_N - 8);
    veh.reset(p.x, p.z, p.yaw);
    skids.clear(); smoke.clear();
    score = 0; combo = 0; comboMul = 1; driftTime = 0;
    nextCp = 1; lapStart = performance.now() / 1000; lapsDone = 0;
    for (const c of cones) Object.assign(c, { x: c.home[0], z: c.home[1], vx: 0, vz: 0, y: 0, vy: 0, rx: 0, rz: 0 });
    camSnap = true;
    toast(isTouch ? 'ГАЗ + руль — занос, РУЧНИК — сорвать зад' : 'Газ — ↑ / W, руль — ← → / A D, ручник — пробел', 3.5);
  }

  function openMenu() {
    bankCombo();
    state = 'menu';
    $('menu').classList.remove('hidden');
    $('hud').classList.add('hidden');
    placeInShowroom();
  }

  function resetToTrack() {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < TRACK_N; i += 3) {
      const d = (trackPts[i].x - veh.x) ** 2 + (trackPts[i].z - veh.z) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    const p = trackPose(bi);
    veh.reset(p.x, p.z, p.yaw);
    combo = 0; comboMul = 1; driftTime = 0;
  }

  function cycleCamera() { camMode = (camMode + 1) % CAM_NAMES.length; toast('Камера: ' + CAM_NAMES[camMode], 1.2); }
  function toggleMute() { sound.muted = !sound.muted; toast(sound.muted ? 'Звук выключен' : 'Звук включён', 1.2); }
  function toggleAssist() { assist = assist > 0 ? 0 : 0.55; toast(assist ? 'Помощь в заносе: вкл' : 'Помощь в заносе: выкл', 1.5); }

  let toastT = 0;
  function toast(msg, t = 2) { $('toast').textContent = msg; $('toast').classList.add('show'); toastT = t; }

  function bankCombo() {
    if (combo > 0) {
      const pts = Math.round(combo * comboMul);
      score += pts;
      popup(`+${pts}`);
      if (score > best) { best = score; try { localStorage.setItem('drift_best', String(best)); } catch (e) { /* ignore */ } }
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
  $('btn-assist').addEventListener('click', () => { toggleAssist(); $('btn-assist').textContent = assist ? 'Помощь в заносе: вкл' : 'Помощь в заносе: выкл'; });

  // minimap
  const mm = $('minimap'), mmc = mm.getContext('2d');
  const mmBase = document.createElement('canvas');
  mmBase.width = mmBase.height = 160;
  {
    const g = mmBase.getContext('2d');
    g.fillStyle = 'rgba(20,24,28,0.55)'; g.fillRect(0, 0, 160, 160);
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath();
    trackPts.forEach((p, i) => { const x = 80 + p.x / LOT * 74, y = 80 + p.z / LOT * 74; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.stroke();
    g.fillStyle = '#f2c200'; g.beginPath(); g.arc(80 - 20 / LOT * 74, 80 - 50 / LOT * 74, 3, 0, Math.PI * 2); g.fill();
  }
  function drawMinimap() {
    mmc.clearRect(0, 0, 160, 160);
    mmc.drawImage(mmBase, 0, 0);
    const cp = trackPts[cpIdx[nextCp % CP]];
    mmc.fillStyle = '#48d1ff'; mmc.beginPath(); mmc.arc(80 + cp.x / LOT * 74, 80 + cp.z / LOT * 74, 4, 0, Math.PI * 2); mmc.fill();
    const x = 80 + veh.x / LOT * 74, y = 80 + veh.z / LOT * 74;
    mmc.save(); mmc.translate(x, y); mmc.rotate(-veh.yaw);
    mmc.fillStyle = '#ff3b30'; mmc.beginPath(); mmc.moveTo(7, 0); mmc.lineTo(-5, 4.5); mmc.lineTo(-5, -4.5); mmc.closePath(); mmc.fill();
    mmc.restore();
  }

  // ------------------------------------------------------------------ main loop
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camSnap = true, menuAngle = 0;
  let last = performance.now();
  const fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; };

  function physicsStep(dt, inp) {
    const r = veh.step(dt, inp, assist);
    // walls (lot edge) with the car approximated by two circles
    const rad = veh.wid * 0.5;
    let hit = 0;
    for (const off of [veh.len * 0.3, -veh.len * 0.3]) {
      const [fx, fz] = veh.fwd();
      const cx = veh.x + fx * off, cz = veh.z + fz * off;
      const lim = LOT - rad;
      for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
        const c = ax === 'x' ? cx : cz;
        if (c * sgn > lim) {
          const pen = c * sgn - lim;
          if (ax === 'x') veh.x -= sgn * pen; else veh.z -= sgn * pen;
          const nx = ax === 'x' ? -sgn : 0, nz = ax === 'z' ? -sgn : 0;
          hit = Math.max(hit, veh.impulse(cx - veh.x, cz - veh.z, nx, nz, 0.25));
        }
      }
      for (const s of statics) {
        if (Math.abs(s.x - cx) > 10 || Math.abs(s.z - cz) > 10) continue;
        hit = Math.max(hit, veh.collideCircle(off, 0, rad, s.x, s.z, s.r, 0.3));
      }
    }
    return { r, hit };
  }

  function updateCones(dt) {
    const [fx, fz] = veh.fwd();
    for (const c of cones) {
      for (const off of [veh.len * 0.3, -veh.len * 0.3]) {
        const cx = veh.x + fx * off, cz = veh.z + fz * off;
        const dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz);
        if (d < veh.wid * 0.5 + 0.25 && d > 1e-4) {
          const sp = veh.speed;
          c.vx = veh.vx * 1.2 + dx / d * (2 + sp * 0.3); c.vz = veh.vz * 1.2 + dz / d * (2 + sp * 0.3);
          c.vy = 2 + sp * 0.15; c.x += dx / d * 0.3; c.z += dz / d * 0.3;
          if (!c.hit && state === 'drive') { c.hit = true; popup('Конус!', 'bad'); }
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

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }

    if (state === 'menu') {
      menuAngle += dt * 0.35;
      veh.yaw = 0.6 + menuAngle;
      car.root.position.set(veh.x, 0.12, veh.z);
      car.root.rotation.y = veh.yaw;
      car.chassis.rotation.set(0, 0, 0);
      for (const w of car.wheels) { w.pivot.rotation.y = 0; }
      const L = veh.len, cx = showroom.position.x, cz = showroom.position.z;
      const r = L * 1.35 + (camera.aspect < 1 ? L * 0.9 : 0);
      camera.position.set(cx + Math.cos(0.9) * r, L * 0.36, cz + Math.sin(0.9) * r);
      camera.lookAt(cx, camera.aspect < 1 ? -0.9 : -0.35, cz);
      sun.position.set(cx + 30, 60, cz + 25); sun.target.position.set(cx, 0, cz);
      sound.update(900, 0, 0, false);
      renderer.render(scene, camera);
      return;
    }

    const inp = readInput();
    const sub = 4;
    let res, hit = 0;
    for (let i = 0; i < sub; i++) { const o = physicsStep(dt / sub, inp); res = o.r; hit = Math.max(hit, o.hit); }
    updateCones(dt);

    // --- drift scoring
    const spd = veh.speed;
    const angle = Math.abs(res.beta) * 180 / Math.PI;
    const drifting = spd > 7 && angle > 11 && angle < 110 && res.u > 0;
    if (hit > 3) {
      if (combo > 0) popup('Сорвано!', 'bad');
      combo = 0; comboMul = 1; driftTime = 0;
      $('flash').classList.add('on'); setTimeout(() => $('flash').classList.remove('on'), 120);
    }
    if (drifting) {
      noDrift = 0;
      driftTime += dt;
      combo += (angle - 8) * spd * dt * 0.9;
      const newMul = Math.min(5, 1 + Math.floor(driftTime / 2.2));
      if (newMul > comboMul) { comboMul = newMul; popup(`x${comboMul}`, 'mul'); }
    } else {
      noDrift += dt;
      if (noDrift > 1.1 && combo > 0) bankCombo();
    }

    // --- laps / checkpoints
    const cp = trackPts[cpIdx[nextCp % CP]];
    if ((cp.x - veh.x) ** 2 + (cp.z - veh.z) ** 2 < (ROAD_W * 0.9) ** 2) {
      if (nextCp % CP === 0) {
        const t = performance.now() / 1000 - lapStart;
        lapsDone++; lastLap = t;
        if (!bestLap || t < bestLap) { bestLap = t; try { localStorage.setItem('drift_bestlap', String(bestLap)); } catch (e) { /* ignore */ } popup('Лучший круг!', 'mul'); }
        lapStart = performance.now() / 1000;
        nextCp = 1;
      } else nextCp++;
    }
    lapTimeRun = performance.now() / 1000 - lapStart;

    // --- visuals: car transform, body roll, wheels
    car.root.position.set(veh.x, 0, veh.z);
    car.root.rotation.y = veh.yaw;
    const pitch = clamp(veh.ax * 0.0045, -0.03, 0.03), roll = clamp(veh.ay * 0.006, -0.05, 0.05);
    car.chassis.rotation.set(roll, 0, pitch, 'XYZ');
    car.chassis.position.y = -Math.abs(pitch) * 0.5;
    for (const w of car.wheels) {
      w.pivot.rotation.y = w.front ? veh.steer : 0;
      w.spin.rotation.z = veh.spinAngle;
    }
    const braking = inp.brake > 0 && res.u > 1;
    for (const m of car.brakeMats) m.emissiveIntensity = m.userData.baseEmissive * (braking || inp.handbrake ? 2.6 : 1);

    // --- skids & smoke from the rear (and front when sliding hard)
    const [fx, fz] = veh.fwd(), [rx, rz] = veh.right();
    const rearSlide = clamp((Math.abs(veh.slipR) - 0.12) * 3 + Math.max(0, veh.wheelSpin - 0.95) * 2 + (inp.handbrake && spd > 3 ? 0.6 : 0), 0, 1);
    const frontSlide = clamp((Math.abs(veh.slipF) - 0.22) * 2.5 + (inp.brake && res.u > 6 ? 0.5 : 0), 0, 1);
    for (const w of car.wheels) {
      const s = w.front ? frontSlide : rearSlide;
      const wx = veh.x + fx * w.base.x + rx * w.base.z, wz = veh.z + fz * w.base.x + rz * w.base.z;
      skids.add(w.base.x.toFixed(2) + w.left, wx, wz, rx, rz, spd > 2 ? s : 0);
      if (!w.front && s > 0.25 && spd > 3 && Math.random() < s * 0.9) smoke.emit(wx - fx * 0.3, 0.3, wz - fz * 0.3, veh.vx, veh.vz, s);
    }
    skids.update();
    smoke.update(dt);
    sound.update(veh.rpm, inp.throttle, Math.max(rearSlide, frontSlide * 0.7) * clamp(spd / 10, 0, 1), true);

    // --- camera
    const vdir = spd > 3 ? [veh.vx / spd, veh.vz / spd] : [fx, fz];
    const blend = 0.35;
    let dx = lerp(fx, vdir[0], blend), dz = lerp(fz, vdir[1], blend);
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const L = veh.len;
    let tp, tl, k = 6;
    if (camMode === 0) { tp = [veh.x - dx * (L * 1.35 + 2.2), 1.9 + L * 0.12, veh.z - dz * (L * 1.35 + 2.2)]; tl = [veh.x + dx * 2, 0.9, veh.z + dz * 2]; }
    else if (camMode === 1) { tp = [veh.x - dx * (L * 2.4 + 4), 4.2, veh.z - dz * (L * 2.4 + 4)]; tl = [veh.x + dx * 4, 0.6, veh.z + dz * 4]; k = 4; }
    else if (camMode === 2) { tp = [veh.x + fx * 0.35, 1.18, veh.z + fz * 0.35]; tl = [veh.x + fx * 20, 0.9, veh.z + fz * 20]; k = 40; }
    else { tp = [veh.x - dx * 6, 26, veh.z - dz * 6]; tl = [veh.x + dx * 3, 0, veh.z + dz * 3]; k = 5; }
    if (camSnap) { camPos.set(...tp); camLook.set(...tl); camSnap = false; }
    camPos.x = damp(camPos.x, tp[0], k, dt); camPos.y = damp(camPos.y, tp[1], k, dt); camPos.z = damp(camPos.z, tp[2], k, dt);
    camLook.x = damp(camLook.x, tl[0], k * 1.5, dt); camLook.y = damp(camLook.y, tl[1], k * 1.5, dt); camLook.z = damp(camLook.z, tl[2], k * 1.5, dt);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    const targetFov = (camera.aspect < 1 ? 75 : 60) + clamp(spd * 0.25, 0, 14);
    camera.fov = damp(camera.fov, targetFov, 3, dt); camera.updateProjectionMatrix();
    sun.position.set(veh.x + 40, 80, veh.z + 30);
    sun.target.position.set(veh.x, 0, veh.z);

    // --- HUD
    $('speed').textContent = Math.round(spd * 3.6);
    $('gear').textContent = res.u < -0.5 && inp.brake ? 'R' : (spd < 0.5 ? 'N' : veh.gear);
    $('rpm-bar').style.width = `${clamp((veh.rpm - 800) / 6800, 0, 1) * 100}%`;
    $('score').textContent = Math.round(score).toLocaleString('ru-RU');
    $('best').textContent = Math.round(best).toLocaleString('ru-RU');
    $('lap').textContent = fmtTime(lapTimeRun);
    $('lap-best').textContent = bestLap ? fmtTime(bestLap) : '—';
    $('lap-n').textContent = lapsDone;
    const dz2 = $('drift');
    if (combo > 0) {
      dz2.classList.add('show');
      $('drift-pts').textContent = Math.round(combo).toLocaleString('ru-RU');
      $('drift-mul').textContent = 'x' + comboMul;
      $('drift-ang').textContent = drifting ? `${Math.round(angle)}°` : '';
    } else dz2.classList.remove('show');
    drawMinimap();
    renderer.render(scene, camera);
  }

  spawnCar(carIdx);
  placeInShowroom();
  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
  requestAnimationFrame(frame);

  // expose for automated testing
  window.__game = {
    veh: () => veh, startDrive, pickCar, setInput: (o) => Object.assign(touch, o), state: () => state, cycleCamera,
    // run the physics without rendering: script = [[seconds, input], ...]; returns samples
    sim(script, every = 0.5) {
      const out = []; let t = 0, next = 0;
      for (const [dur, inp] of script) {
        const full = Object.assign({ steer: 0, throttle: 0, brake: 0, handbrake: false }, inp);
        for (let s = 0; s < dur; s += 1 / 240) {
          const o = physicsStep(1 / 240, full); t += 1 / 240;
          if (t >= next) { next += every; out.push({ t: +t.toFixed(2), kmh: +(veh.speed * 3.6).toFixed(1), beta: +(o.r.beta * 57.3).toFixed(1), w: +veh.w.toFixed(2), gear: veh.gear }); }
        }
      }
      return out;
    },
  };
};
