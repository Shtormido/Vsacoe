'use strict';
(function (G) {
  // Генерация ландшафта: 0 — трава, 1 — вода, 2 — песок
  G.generateMap = function (W, H, seed, kind) {
    const N = W * H, r = G.rng(seed);
    const terrain = new Uint8Array(N), tree = new Uint8Array(N), tone = new Uint8Array(N), res = new Uint8Array(N);
    const n4 = G.makeNoise(seed + 333), n5 = G.makeNoise(seed + 555);
    const coast = kind === 'coast' || kind === 'resort';
    const n1 = G.makeNoise(seed), n2 = G.makeNoise(seed + 77), n3 = G.makeNoise(seed + 991);
    const water = new Float32Array(N);

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let w = 0;
      const e = n1(x / 14, y / 14, 4);
      if (kind === 'lakes') w = e < 0.36 ? 1 : 0;
      else if (kind === 'mountains') w = e < 0.25 ? 1 : 0;
      else if (coast) {
        const d = (x + y) / (W + H) + (e - 0.5) * 0.35;
        w = d > 0.78 ? 1 : 0;
        if (e < 0.3) w = 1;
      } else w = e < 0.27 ? 1 : 0;
      water[i] = w;
    }

    if (kind !== 'lakes' && kind !== 'mountains') {
      // Река, петляющая через всю карту
      let y = H * (0.25 + r() * 0.5), dy = 0;
      const width = 1.6 + r() * 0.8;
      for (let x = -2; x < W + 2; x += 0.25) {
        dy += (n2(x / 9, 3.3, 2) - 0.5) * 0.35;
        dy *= 0.92; y += dy;
        y = G.clamp(y, 6, H - 7);
        const wx = Math.round(x);
        for (let k = -3; k <= 3; k++) {
          const yy = Math.round(y + k);
          if (wx >= 0 && wx < W && yy >= 0 && yy < H && Math.abs(k) <= width) water[yy * W + wx] = 1;
        }
      }
    }

    // Центр карты держим сухим, чтобы было где строить
    const cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dc = Math.hypot(x - cx, y - cy);
      if (dc < 6 && (kind === 'lakes' || kind === 'mountains')) water[i] = 0;
      terrain[i] = water[i] ? 1 : 0;
    }

    // Убираем одиночные клетки воды и суши
    for (let pass = 0; pass < 2; pass++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let wn = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { wn += terrain[i] === 1 ? 1 : 0; continue; }
        if (terrain[ny * W + nx] === 1) wn++;
      }
      if (terrain[i] === 1 && wn <= 1) terrain[i] = 0;
      else if (terrain[i] !== 1 && wn >= 3) terrain[i] = 1;
    }

    // Песок у воды, оттенки травы, деревья
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (terrain[i] === 1) continue;
      let nearW = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && terrain[ny * W + nx] === 1) nearW = true;
      }
      if (nearW && n3(x / 5, y / 5, 2) > (kind === 'resort' ? 0.05 : 0.38)) terrain[i] = 2;
      if (kind === 'resort' && terrain[i] === 0 && n3(x / 5, y / 5, 2) > 0.3) {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && terrain[ny * W + nx] === 1) terrain[i] = 2;
        }
      }
      tone[i] = Math.min(3, Math.floor(n2(x / 7, y / 7, 3) * 4.6));
      const f = n3(x / 9 + 10, y / 9, 4);
      const ft = kind === 'forest' ? 0.44 : 0.58;
      if (terrain[i] === 0) {
        if (f > ft) tree[i] = f > ft + 0.08 ? 3 : f > ft + 0.04 ? 2 : 1;
        else if (r() < 0.035) tree[i] = 1;
        // залежи ресурсов
        const st = kind === 'mountains' ? 0.67 : 0.75, ct = kind === 'coalfield' ? 0.65 : 0.77;
        if (n4(x / 6, y / 6, 3) > st) res[i] = 1;
        else if (n5(x / 6, y / 6, 3) > ct) res[i] = 2;
        if (res[i]) tree[i] = 0;
      }
      if (Math.hypot(x - cx, y - cy) < 4) { tree[i] = 0; res[i] = 0; }
    }
    return { terrain, tree, tone, res };
  };
})(window.G);
