/* Drift Restomod — procedural city map.
 * buildCity(THREE, env) -> { group, boxes, circles, groundHeight(x, z), spawn, bounds, minimap, parkSpots, coneSpots }
 * boxes: axis-aligned building / wall colliders {x0, x1, z0, z1}; circles: poles, trees {x, z, r}.
 */
window.buildCity = function buildCity(THREE, env) {
  'use strict';
  const rnd = mulberry32(20251020);
  const N = 7, B = 86, W = 18, SW = 4.5, CURB = 0.15;
  const S = N * B + (N + 1) * W;
  const half = S / 2;
  const roadC = (i) => -half + W / 2 + i * (B + W);
  const blk = (i) => [roadC(i) + W / 2, roadC(i + 1) - W / 2];
  const group = new THREE.Group();
  const boxes = [], circles = [], parkSpots = [], coneSpots = [];

  const TYPE = {};
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) TYPE[i + ',' + j] = 'build';
  TYPE['3,3'] = 'plaza'; TYPE['1,4'] = 'parking'; TYPE['5,2'] = 'parking'; TYPE['2,1'] = 'park'; TYPE['4,5'] = 'park'; TYPE['5,5'] = 'build';
  const typeOf = (i, j) => TYPE[i + ',' + j];
  const raised = (t) => t === 'build' || t === 'park';

  // ------------------------------------------------------------------ ground
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(S + 40, S + 40),
    new THREE.MeshStandardMaterial({ color: 0x5c5e62, roughness: 0.9, map: env.noiseTexture(512, 80, 30, 0.02, 70) }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.receiveShadow = true;
  group.add(asphalt);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ color: 0x66804a, roughness: 1, map: env.noiseTexture(256, 150, 60, 0.05, 300) }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.03; grass.receiveShadow = true;
  group.add(grass);

  // ------------------------------------------------------------------ geometry accumulators
  function Acc() { this.p = []; this.n = []; this.uv = []; this.i = []; }
  Acc.prototype.quad = function (a, b, c, d, nrm, uvs) {
    const k = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let t = 0; t < 4; t++) this.n.push(nrm[0], nrm[1], nrm[2]);
    this.uv.push(...(uvs || [0, 0, 1, 0, 1, 1, 0, 1]));
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  Acc.prototype.box = function (x0, x1, y0, y1, z0, z1, uvScale, top = true) {
    const su = uvScale ? uvScale[0] : 1, sv = uvScale ? uvScale[1] : 1;
    const w = (x1 - x0) / su, d = (z1 - z0) / su, h = (y1 - y0) / sv;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [0, 0, w, 0, w, h, 0, h]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [0, 0, w, 0, w, h, 0, h]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, 0, d, 0, d, h, 0, h]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, 0, d, 0, d, h, 0, h]);
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0 / 8, z1 / 8, x1 / 8, z1 / 8, x1 / 8, z0 / 8, x0 / 8, z0 / 8]);
  };
  Acc.prototype.flat = function (x0, x1, z0, z1, y) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0]);
  };
  Acc.prototype.mesh = function (mat, shadows = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadows; m.receiveShadow = true;
    return m;
  };

  // ------------------------------------------------------------------ facade textures
  const facade = (wall, glass, lit, frame, style) => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const x = bx * 64, y = fy * 64;
      if (style === 'panel') {          // soviet panel block: seams + small windows + balcony slabs
        g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x, y + 62, 64, 2); g.fillRect(x + 62, y, 2, 64);
        g.fillStyle = frame; g.fillRect(x + 14, y + 14, 34, 32);
        g.fillStyle = Math.random() < 0.15 ? lit : glass; g.fillRect(x + 17, y + 17, 28, 26);
        g.fillStyle = frame; g.fillRect(x + 30, y + 17, 2, 26);
      } else if (style === 'tower') {   // curtain wall
        g.fillStyle = Math.random() < 0.12 ? lit : glass; g.fillRect(x + 2, y + 6, 60, 52);
        g.fillStyle = frame; g.fillRect(x, y, 64, 6); g.fillRect(x + 31, y + 6, 2, 52);
      } else {                         // brick / classic
        g.fillStyle = frame; g.fillRect(x + 16, y + 8, 32, 44);
        g.fillStyle = Math.random() < 0.15 ? lit : glass; g.fillRect(x + 19, y + 11, 26, 38);
        g.fillStyle = frame; g.fillRect(x + 19, y + 28, 26, 2); g.fillRect(x + 31, y + 11, 2, 38);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 12, y + 52, 40, 4);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = env.renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const STYLES = [
    { tex: facade('#c9c4b8', '#3d4a55', '#f3d89a', '#e9e5dc', 'panel'), w: 12.8, h: 11.2, rough: 0.85 },
    { tex: facade('#8c4a34', '#2f3a44', '#f6dca0', '#d9cbb8', 'brick'), w: 12.8, h: 13.6, rough: 0.9 },
    { tex: facade('#5a7f9e', '#20384d', '#ffe8b0', '#c8d3dc', 'tower'), w: 12.8, h: 14.4, rough: 0.25, metal: 0.4 },
    { tex: facade('#d8cfc0', '#34404a', '#f3d89a', '#ffffff', 'brick'), w: 12.8, h: 13.6, rough: 0.8 },
    { tex: facade('#9aa3a8', '#2c3640', '#f3d89a', '#e0e4e6', 'panel'), w: 12.8, h: 11.2, rough: 0.85 },
  ];
  const styleAcc = STYLES.map(() => new Acc());
  const roofAcc = new Acc();
  const slabAcc = new Acc();
  const greenAcc = new Acc();
  const marks = new Acc();
  const parkLines = new Acc();

  // ------------------------------------------------------------------ blocks
  const blocks = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const [x0, x1] = blk(i), [z0, z1] = blk(j), t = typeOf(i, j);
    blocks.push({ i, j, x0, x1, z0, z1, t });
    if (raised(t)) slabAcc.box(x0, x1, 0, CURB, z0, z1, [8, 8]);
    if (t === 'park') greenAcc.flat(x0 + SW, x1 - SW, z0 + SW, z1 - SW, CURB + 0.01);
    if (t === 'build') {
      const nx = 2 + (rnd() < 0.5 ? 1 : 0), nz = 2 + (rnd() < 0.5 ? 1 : 0);
      const ix0 = x0 + SW, ix1 = x1 - SW, iz0 = z0 + SW, iz1 = z1 - SW;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const down = Math.exp(-(cx * cx + cz * cz) / (240 * 240));
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const lx0 = ix0 + (ix1 - ix0) * a / nx, lx1 = ix0 + (ix1 - ix0) * (a + 1) / nx;
        const lz0 = iz0 + (iz1 - iz0) * b / nz, lz1 = iz0 + (iz1 - iz0) * (b + 1) / nz;
        const g = 0.6 + rnd() * 2.2;
        const bx0 = lx0 + (a === 0 ? 0 : g), bx1 = lx1 - (a === nx - 1 ? 0 : g);
        const bz0 = lz0 + (b === 0 ? 0 : g), bz1 = lz1 - (b === nz - 1 ? 0 : g);
        const hmax = 18 + 70 * down;
        const h = Math.max(9, hmax * (0.35 + rnd() * 0.65));
        const st = h > 45 ? 2 : (h < 20 ? (rnd() < 0.6 ? 0 : 4) : [0, 1, 3, 4][Math.floor(rnd() * 4)]);
        const S2 = STYLES[st];
        styleAcc[st].box(bx0, bx1, CURB, CURB + h, bz0, bz1, [S2.w, S2.h], false);
        roofAcc.box(bx0, bx1, CURB + h, CURB + h + 0.6, bz0, bz1, [8, 8]);
        if (h > 30 && rnd() < 0.7) {   // rooftop plant room
          const px = bx0 + (bx1 - bx0) * 0.3, pz = bz0 + (bz1 - bz0) * 0.3;
          roofAcc.box(px, px + (bx1 - bx0) * 0.35, CURB + h, CURB + h + 3.5, pz, pz + (bz1 - bz0) * 0.35, [8, 8]);
        }
        boxes.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1 });
      }
    }
    if (t === 'plaza') {
      // painted drift circle + cones
      coneSpots.push(...Array.from({ length: 16 }, (_, k) => [x0 + B / 2 + Math.cos(k / 16 * Math.PI * 2) * 9, z0 + B / 2 + Math.sin(k / 16 * Math.PI * 2) * 9]));
      for (let k = 0; k < 8; k++) coneSpots.push([x0 + 14 + k * 8, z0 + 12 + (k % 2) * 3]);
    }
    if (t === 'parking') {
      for (let row = 0; row < 4; row++) {
        const zr = z0 + 10 + row * 21;
        for (let k = 0; k < 14; k++) {
          const xs = x0 + 6 + k * 5.4;
          parkLines.flat(xs - 0.07, xs + 0.07, zr - 2.6, zr + 2.6, 0.012);
          if (k < 13 && rnd() < 0.35) parkSpots.push({ x: xs + 2.7, z: zr, yaw: rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2 });
        }
      }
    }
  }
  const facadeMats = STYLES.map((s) => new THREE.MeshStandardMaterial({ map: s.tex, roughness: s.rough, metalness: s.metal || 0 }));
  styleAcc.forEach((a, k) => { if (a.p.length) group.add(a.mesh(facadeMats[k])); });
  group.add(roofAcc.mesh(new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.9 })));
  const slabTex = env.noiseTexture(256, 175, 25, 0.02, 1);
  group.add(slabAcc.mesh(new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.95, map: slabTex }), false));
  group.add(greenAcc.mesh(new THREE.MeshStandardMaterial({ color: 0x5f8a45, roughness: 1, map: env.noiseTexture(256, 150, 70, 0.05, 1) }), false));

  // ------------------------------------------------------------------ road markings
  const dash = (ax, az, bx, bz, w, len, gap, acc) => {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    const seg = Math.min(len, L);
    for (let s = 0; s + seg <= L + 1e-6; s += seg + gap) {
      const sx = ax + dx * s, sz = az + dz * s, ex = sx + dx * seg, ez = sz + dz * seg;
      const nx = -dz * w / 2, nz = dx * w / 2;
      acc.quad([sx - nx, 0.012, sz - nz], [ex - nx, 0.012, ez - nz], [ex + nx, 0.012, ez + nz], [sx + nx, 0.012, sz + nz], [0, 1, 0]);
    }
  };
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
    const [s0, s1] = blk(j);
    for (const vert of [true, false]) {
      const c = roadC(i);
      const P = (along, off) => (vert ? [c + off, along] : [along, c + off]);
      // centre double line and lane dashes
      for (const off of [-0.18, 0.18]) { const a = P(s0 + 4.5, off), b = P(s1 - 4.5, off); dash(a[0], a[1], b[0], b[1], 0.15, Infinity, 0, marks); }
      for (const off of [-4.5, 4.5]) { const a = P(s0 + 6, off), b = P(s1 - 6, off); dash(a[0], a[1], b[0], b[1], 0.14, 3, 6, marks); }
      // zebra crossings at both ends
      for (const end of [s0 + 1.5, s1 - 4.5]) {
        for (let k = -8; k <= 7; k++) {
          const off = k + 0.5;
          const a = P(end, off), b = P(end + 3, off);
          dash(a[0], a[1], b[0], b[1], 0.55, 3, 0, marks);
        }
      }
    }
  }
  const markMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
  group.add(marks.mesh(markMat, false));
  group.add(parkLines.mesh(markMat, false));
  // plaza paint: big ring + "DRIFT" letters via canvas decal
  {
    const pb = blocks.find((b) => b.t === 'plaza');
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(255,205,40,0.9)'; g.lineWidth = 10;
    g.beginPath(); g.arc(512, 512, 330, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(512, 512, 120, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 8; g.strokeRect(30, 30, 964, 964);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = 'italic 900 120px sans-serif'; g.textAlign = 'center';
    g.fillText('DRIFT', 512, 960);
    for (let k = 0; k < 400; k++) { g.fillStyle = 'rgba(0,0,0,0.12)'; const a = Math.random() * 6.28, r = 200 + Math.random() * 200; g.fillRect(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, 18, 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(B, B), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((pb.x0 + pb.x1) / 2, 0.013, (pb.z0 + pb.z1) / 2);
    m.receiveShadow = true;
    group.add(m);
  }

  // ------------------------------------------------------------------ street furniture (instanced)
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  const lamps = [], lights = [], trees = [];
  for (const b of blocks) {
    if (!raised(b.t)) continue;
    const e = 0.9;
    // lamps along the four sides
    for (const [ax, az, bx, bz, ang] of [[b.x0 + e, b.z0 + e, b.x1 - e, b.z0 + e, Math.PI / 2], [b.x0 + e, b.z1 - e, b.x1 - e, b.z1 - e, -Math.PI / 2],
      [b.x0 + e, b.z0 + e, b.x0 + e, b.z1 - e, Math.PI], [b.x1 - e, b.z0 + e, b.x1 - e, b.z1 - e, 0]]) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 30));
      for (let k = 0; k <= n; k++) {
        const t = 0.06 + 0.88 * k / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        lamps.push([x, z, ang]); circles.push({ x, z, r: 0.22 });
      }
    }
    // traffic lights on the four corners
    for (const [x, z] of [[b.x0 + 1.6, b.z0 + 1.6], [b.x1 - 1.6, b.z0 + 1.6], [b.x0 + 1.6, b.z1 - 1.6], [b.x1 - 1.6, b.z1 - 1.6]]) {
      lights.push([x, z]); circles.push({ x, z, r: 0.25 });
    }
    // trees: park interior or a row on the sidewalk of the main avenues
    if (b.t === 'park') {
      for (let k = 0; k < 60; k++) {
        const x = b.x0 + SW + 4 + rnd() * (b.x1 - b.x0 - 2 * SW - 8), z = b.z0 + SW + 4 + rnd() * (b.z1 - b.z0 - 2 * SW - 8);
        trees.push([x, z, 0.8 + rnd() * 0.7]); circles.push({ x, z, r: 0.45 });
      }
    } else if (b.i === 3 || b.i === 2) {
      for (let z = b.z0 + 8; z < b.z1 - 6; z += 12) {
        const x = b.i === 3 ? b.x0 + 2.4 : b.x1 - 2.4;
        trees.push([x, z, 0.7 + rnd() * 0.3]); circles.push({ x, z, r: 0.4 });
      }
    }
  }
  const metal = new THREE.MeshStandardMaterial({ color: 0x55595e, metalness: 0.7, roughness: 0.4 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 8, 8).translate(0, 4, 0), metal, lamps.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.12, 0.12).translate(1.0, 8, 0), metal, lamps.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 0.35).translate(2.0, 7.92, 0),
    new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff1cc, emissiveIntensity: 0.6 }), lamps.length);
  lamps.forEach(([x, z, ang], k) => {
    M4.compose(new THREE.Vector3(x, CURB, z), Q.setFromAxisAngle(UP, ang), V1);
    pole.setMatrixAt(k, M4); arm.setMatrixAt(k, M4); head.setMatrixAt(k, M4);
  });
  pole.castShadow = arm.castShadow = true;
  group.add(pole, arm, head);
  const tlPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 3.4, 8).translate(0, 1.7, 0), metal, lights.length);
  const tlBox = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.95, 0.3).translate(0, 3.6, 0), new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.6 }), lights.length);
  const tlLamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 1.6 }), lights.length * 3);
  const cols = [new THREE.Color(0xff2a1a), new THREE.Color(0xffb000), new THREE.Color(0x22ff66)];
  lights.forEach(([x, z], k) => {
    M4.compose(new THREE.Vector3(x, CURB, z), Q.identity(), V1);
    tlPole.setMatrixAt(k, M4); tlBox.setMatrixAt(k, M4);
    const on = Math.floor(rnd() * 3);
    for (let c = 0; c < 3; c++) {
      for (const sx of [1]) {
        M4.compose(new THREE.Vector3(x + 0.18 * sx, CURB + 3.9 - c * 0.3, z), Q.identity(), V1);
        tlLamp.setMatrixAt(k * 3 + c, M4);
        tlLamp.setColorAt(k * 3 + c, c === on ? cols[c] : new THREE.Color(0x222222));
      }
    }
  });
  tlPole.castShadow = tlBox.castShadow = true;
  group.add(tlPole, tlBox, tlLamp);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 3, 6).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), trees.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.6, 0), new THREE.MeshStandardMaterial({ color: 0x3d6b33, roughness: 1, flatShading: true }), trees.length);
  trees.forEach(([x, z, s], k) => {
    M4.compose(new THREE.Vector3(x, CURB, z), Q.setFromAxisAngle(UP, rnd() * 6), new THREE.Vector3(s, s, s));
    trunk.setMatrixAt(k, M4); crown.setMatrixAt(k, M4);
    crown.setColorAt(k, new THREE.Color().setHSL(0.27 + rnd() * 0.06, 0.4, 0.22 + rnd() * 0.08));
  });
  trunk.castShadow = crown.castShadow = true;
  group.add(trunk, crown);

  // ------------------------------------------------------------------ city edge: fence + outer buildings
  {
    const e = half + 1.2;
    const wallAcc = new Acc();
    for (const [x0, x1, z0, z1] of [[-e - 0.4, e + 0.4, -e - 0.4, -e], [-e - 0.4, e + 0.4, e, e + 0.4], [-e - 0.4, -e, -e, e], [e, e + 0.4, -e, e]]) {
      wallAcc.box(x0, x1, 0, 2.6, z0, z1, [4, 4]);
      boxes.push({ x0, x1, z0, z1 });
    }
    group.add(wallAcc.mesh(new THREE.MeshStandardMaterial({ color: 0xa7a39a, roughness: 0.95, map: slabTex })));
    const outer = new Acc();
    for (let k = 0; k < 60; k++) {
      const side = k % 4, t = -half + rnd() * S;
      const d = half + 14 + rnd() * 50, w = 16 + rnd() * 26, dd = 14 + rnd() * 20, h = 10 + rnd() * 30;
      let x = side < 2 ? t : (side === 2 ? d : -d), z = side < 2 ? (side === 0 ? d : -d) : t;
      outer.box(x - w / 2, x + w / 2, 0, h, z - dd / 2, z + dd / 2, [12.8, 11.2], true);
    }
    group.add(outer.mesh(facadeMats[0]));
  }

  // ------------------------------------------------------------------ helpers for the game
  const groundHeight = (x, z) => {
    for (const b of blocks) if (raised(b.t) && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return CURB;
    return 0;
  };
  const surface = (x, z) => {
    for (const b of blocks) if (b.t === 'park' && x > b.x0 + SW && x < b.x1 - SW && z > b.z0 + SW && z < b.z1 - SW) return 0.6;
    return 1;
  };
  const plaza = blocks.find((b) => b.t === 'plaza');
  const spawn = { x: roadC(3), z: (plaza.z0 + plaza.z1) / 2 + 20, yaw: Math.PI / 2 };

  // minimap texture (1 px = 1 m)
  const mm = document.createElement('canvas');
  const MS = Math.ceil(S + 40);
  mm.width = mm.height = MS;
  {
    const g = mm.getContext('2d');
    const X = (x) => x + MS / 2;
    g.fillStyle = '#6b7f58'; g.fillRect(0, 0, MS, MS);
    g.fillStyle = '#3c3f44'; g.fillRect(X(-half), X(-half), S, S);
    for (const b of blocks) {
      g.fillStyle = b.t === 'park' ? '#5d8a4c' : (b.t === 'plaza' ? '#4a4d53' : (b.t === 'parking' ? '#45484d' : '#9c9b96'));
      g.fillRect(X(b.x0), X(b.z0), b.x1 - b.x0, b.z1 - b.z0);
      if (b.t === 'plaza') { g.strokeStyle = '#f2c200'; g.lineWidth = 3; g.beginPath(); g.arc(X((b.x0 + b.x1) / 2), X((b.z0 + b.z1) / 2), 28, 0, 6.3); g.stroke(); }
    }
    g.fillStyle = '#5b6573';
    for (const bx of boxes) g.fillRect(X(bx.x0), X(bx.z0), bx.x1 - bx.x0, bx.z1 - bx.z0);
  }

  return {
    group, boxes, circles, groundHeight, surface, spawn, parkSpots, coneSpots,
    showroom: { x: (plaza.x0 + plaza.x1) / 2, z: (plaza.z0 + plaza.z1) / 2 - 22 },
    bounds: { x0: -half, x1: half, z0: -half, z1: half },
    minimap: { canvas: mm, size: MS, center: MS / 2, view: 220 },
    fog: [220, 900],
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
};
