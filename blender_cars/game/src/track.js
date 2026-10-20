/* Drift Restomod — closed test-track map on an open asphalt lot (same interface as buildCity). */
window.buildTrack = function buildTrack(THREE, env) {
  'use strict';
  const LOT = 175, ROAD_W = 16;
  const group = new THREE.Group();
  const boxes = [], circles = [];
  const ctrl = [[-110, -125], [0, -132], [80, -122], [125, -88], [138, -32], [108, 6], [58, 2], [26, 32], [40, 78],
    [95, 92], [132, 122], [104, 152], [22, 148], [-42, 122], [-62, 72], [-102, 56], [-138, 20], [-146, -40], [-138, -98]];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const NT = 900;
  const pts = curve.getSpacedPoints(NT).slice(0, NT);
  const len = curve.getLength();
  const dir = pts.map((p, i) => pts[(i + 1) % NT].clone().sub(p).normalize());
  const side = dir.map((d) => new THREE.Vector3(-d.z, 0, d.x));
  const curv = dir.map((d, i) => {
    const n = dir[(i + 4) % NT], p = dir[(i - 4 + NT) % NT];
    return (p.x * n.z - p.z * n.x) / (8 * len / NT);
  });

  function ribbon(a, b, y, colorFn) {
    const pos = [], col = [], idx = [], uv = [];
    const seg = len / NT;
    for (let i = 0; i <= NT; i++) {
      const j = i % NT, p = pts[j], s = side[j], c = colorFn ? colorFn(j) : [1, 1, 1];
      pos.push(p.x + s.x * a, y, p.z + s.z * a, p.x + s.x * b, y, p.z + s.z * b);
      col.push(...c, ...c);
      uv.push(0, i * seg / 16, Math.abs(b - a) / 16, i * seg / 16);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const add = (m, rs = true, cs = false) => { m.receiveShadow = rs; m.castShadow = cs; group.add(m); return m; };
  const grass = add(new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: 0x6f8a4e, roughness: 1, map: env.noiseTexture(256, 150, 60, 0.05, 300) })));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02;
  const lot = add(new THREE.Mesh(new THREE.PlaneGeometry(LOT * 2 + 10, LOT * 2 + 10), new THREE.MeshStandardMaterial({ color: 0x8c8c8a, roughness: 0.95, map: env.noiseTexture(512, 92, 34, 0.02, 90) })));
  lot.rotation.x = -Math.PI / 2;
  add(new THREE.Mesh(ribbon(-ROAD_W / 2, ROAD_W / 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x45474b, roughness: 0.82, map: env.noiseTexture(512, 70, 26, 0.015, 1) })));
  const lineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  for (const s of [-1, 1]) add(new THREE.Mesh(ribbon(s * (ROAD_W / 2 - 0.6), s * (ROAD_W / 2 - 0.3), 0.015, () => [0.95, 0.95, 0.95]), lineMat));
  {
    const pos = [], col = [];
    for (let i = 0; i < NT; i++) {
      if (Math.abs(curv[i]) < 0.012) continue;
      const sg = curv[i] > 0 ? 1 : -1, j2 = (i + 1) % NT;
      const a0 = sg * ROAD_W / 2, a1 = sg * (ROAD_W / 2 + 1.4);
      const P = (j, o) => [pts[j].x + side[j].x * o, 0.03, pts[j].z + side[j].z * o];
      const q = [P(i, a0), P(i, a1), P(j2, a0), P(j2, a1)];
      pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
      const c = Math.floor(i / 3) % 2 ? [0.85, 0.08, 0.06] : [0.95, 0.95, 0.95];
      for (let t = 0; t < 6; t++) col.push(...c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide })));
  }
  {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8;
    const g = c.getContext('2d');
    for (let x = 0; x < 64; x += 4) for (let y = 0; y < 8; y += 4) { g.fillStyle = ((x + y) / 4) % 2 ? '#111' : '#eee'; g.fillRect(x, y, 4, 4); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    const sf = add(new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })));
    sf.rotation.x = -Math.PI / 2; sf.rotation.z = Math.atan2(dir[0].x, dir[0].z) + Math.PI / 2;
    sf.position.set(pts[0].x, 0.02, pts[0].z);
    const ring = add(new THREE.Mesh(new THREE.RingGeometry(23.6, 24, 96), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 })));
    ring.rotation.x = -Math.PI / 2; ring.position.set(-20, 0.016, -50);
  }
  // walls, poles, tyre stacks, containers, trees
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  {
    const n = Math.round(LOT * 2 / 4);
    const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), n * 4);
    const cA = new THREE.Color(0xd6d6d2), cB = new THREE.Color(0xc0261d);
    let k = 0;
    for (let s = 0; s < 4; s++) for (let i = 0; i < n; i++) {
      const t = -LOT + 2 + i * 4;
      const x = s < 2 ? t : (s === 2 ? LOT + 0.4 : -LOT - 0.4), z = s < 2 ? (s === 0 ? LOT + 0.4 : -LOT - 0.4) : t;
      M.compose(new THREE.Vector3(x, 0.55, z), Q.setFromAxisAngle(UP, s < 2 ? 0 : Math.PI / 2), S1);
      wall.setMatrixAt(k, M); wall.setColorAt(k, i % 2 ? cA : cB); k++;
    }
    add(wall, true, true);
    for (const [x0, x1, z0, z1] of [[-LOT - 1, LOT + 1, LOT, LOT + 1], [-LOT - 1, LOT + 1, -LOT - 1, -LOT], [LOT, LOT + 1, -LOT, LOT], [-LOT - 1, -LOT, -LOT, LOT]]) boxes.push({ x0, x1, z0, z1 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.6, roughness: 0.4 });
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 14, 8), metal, 40);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x444a50, emissive: 0xfff3d0, emissiveIntensity: 0.4 }), 40);
    let pk = 0;
    for (let i = 0; i < 10; i++) for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = -LOT + 20 + i * ((LOT * 2 - 40) / 9);
      const x = sx ? sx * (LOT + 4) : t, z = sz ? sz * (LOT + 4) : t;
      M.compose(new THREE.Vector3(x, 7, z), Q.identity(), S1); pole.setMatrixAt(pk, M);
      M.compose(new THREE.Vector3(x - sx, 14, z - sz), Q.setFromAxisAngle(UP, sx ? Math.PI / 2 : 0), S1); head.setMatrixAt(pk, M); pk++;
    }
    add(pole, false, true); add(head, false);
    const tp = [];
    for (let i = 0; i < NT; i += 4) {
      if (Math.abs(curv[i]) < 0.02) continue;
      const sg = curv[i] > 0 ? -1 : 1, o = sg * (ROAD_W / 2 + 9);
      tp.push([pts[i].x + side[i].x * o, pts[i].z + side[i].z * o]);
    }
    const tyres = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 1.05, 14), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.85 }), tp.length);
    tp.forEach(([x, z], i) => { M.compose(new THREE.Vector3(x, 0.52, z), Q.identity(), S1); tyres.setMatrixAt(i, M); circles.push({ x, z, r: 0.65 }); });
    add(tyres, true, true);
    const cols = [0x2b6cb0, 0xb7472a, 0x2f855a, 0xd69e2e];
    for (let i = 0; i < 8; i++) {
      const c = add(new THREE.Mesh(new THREE.BoxGeometry(12, 2.6, 2.5), new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 0.6, metalness: 0.3 })), true, true);
      c.position.set(-LOT + 12 + (i % 4) * 2.7, 1.3 + (i > 3 ? 2.6 : 0), LOT - 20 - (i % 4) * 2.7);
      c.rotation.y = Math.PI / 2;
    }
    boxes.push({ x0: -LOT + 10, x1: -LOT + 23, z0: LOT - 34, z1: LOT - 13 });
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(3, 9, 7), new THREE.MeshStandardMaterial({ color: 0x2f5d32, roughness: 1 }), 160);
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, r = (LOT + 30 + Math.random() * 160) * 1.1, sc = 0.8 + Math.random() * 0.8;
      M.compose(new THREE.Vector3(Math.cos(a) * r, 5.5 * sc, Math.sin(a) * r), Q.identity(), new THREE.Vector3(sc, sc, sc)); trees.setMatrixAt(i, M);
    }
    add(trees, false, true);
  }
  const coneSpots = [];
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; coneSpots.push([-20 + Math.cos(a) * 7, -50 + Math.sin(a) * 7]); }
  for (let i = 0; i < 10; i++) coneSpots.push([-40 + i * 14, 60 + (i % 2 ? 2.5 : -2.5)]);

  const mm = document.createElement('canvas');
  const MS = LOT * 2 + 60;
  mm.width = mm.height = MS;
  {
    const g = mm.getContext('2d'), X = (v) => v + MS / 2;
    g.fillStyle = '#6b7f58'; g.fillRect(0, 0, MS, MS);
    g.fillStyle = '#6d6f72'; g.fillRect(X(-LOT), X(-LOT), LOT * 2, LOT * 2);
    g.strokeStyle = '#2f3236'; g.lineWidth = ROAD_W; g.lineJoin = 'round';
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.x), X(p.z)) : g.moveTo(X(p.x), X(p.z)))); g.closePath(); g.stroke();
    g.strokeStyle = '#f2c200'; g.lineWidth = 2; g.beginPath(); g.arc(X(-20), X(-50), 24, 0, 6.3); g.stroke();
  }
  const d0 = dir[NT - 8];
  const CP = 12;
  return {
    group, boxes, circles, coneSpots, parkSpots: [],
    groundHeight: () => 0,
    surface: () => 1,
    spawn: { x: pts[NT - 8].x, z: pts[NT - 8].z, yaw: Math.atan2(-d0.z, d0.x) },
    showroom: { x: 30, z: -75 },
    bounds: { x0: -LOT, x1: LOT, z0: -LOT, z1: LOT },
    minimap: { canvas: mm, size: MS, center: MS / 2, view: 240 },
    checkpoints: Array.from({ length: CP }, (_, i) => pts[Math.round(i * NT / CP)]),
    roadW: ROAD_W,
    fog: [180, 700],
  };
};
