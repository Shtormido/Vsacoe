// Персонажи: спрайт 28×48, 4 направления × 4 кадра ходьбы + моргание
const SKINS = ['#f8d8b8', '#f0c49c', '#dca478', '#b47c52', '#8a5a3a', '#6a4028'];
const HAIRS = ['#3a2416', '#5a3420', '#8a5a30', '#c07a3a', '#e8c878', '#1e1a22', '#8a2e1a', '#4a3a30'];
const OLD_HAIRS = ['#c8c8cc', '#e4e0d8', '#9a9aa2'];
const EYES = ['#2a1a22', '#3a5a8a', '#3a6a3a', '#6a4426'];
const SHIRTS = ['#3f6fb0', '#b03a3a', '#4f9a44', '#7e56b0', '#d0a030', '#4a4a56', '#2f9a96', '#c0683a', '#e8e4dc', '#d870a0', '#5a7a3a', '#c84a6a'];
const PANTS = ['#2e3e64', '#4a3424', '#3a3a44', '#55557a', '#6a5a3a', '#2a2a30', '#3a4a6a'];
const SHOES = ['#3a2418', '#1e1a1e', '#6a4a30', '#e8e4dc', '#8a2a2a'];

function randomLook(kind, fem) {
  const female = fem ?? chance(0.45), old = chance(0.18);
  let style = female ? pick(['long', 'long', 'pony', 'bun', 'curly', 'short']) : pick(['short', 'short', 'bald', 'mohawk', 'curly', 'cap', 'cap', 'cowboy']);
  if (old && (style === 'mohawk' || style === 'curly')) style = female ? 'bun' : 'bald';
  const L = {
    female, old, style,
    skin: pick(SKINS), hair: old ? pick(OLD_HAIRS) : pick(HAIRS), eye: pick(EYES),
    shirt: pick(SHIRTS), shirt2: pick(SHIRTS), pants: pick(PANTS), shoes: pick(SHOES),
    cap: pick(['#b03a3a', '#3f6fb0', '#2a2a30', '#d0a030', '#4f8a3a']), hat: pick(['#8a5a30', '#5a3a22', '#2a2a2e', '#c8a070']),
    build: pick(['thin', 'avg', 'avg', 'heavy']),
    outfit: female ? pick(['tee', 'dress', 'jacket', 'flannel', 'hoodie', 'dress']) : pick(['tee', 'flannel', 'jacket', 'hoodie', 'overalls', 'flannel']),
    beard: !female && chance(0.35) ? pick(['stubble', 'mustache', 'full']) : null,
    glasses: chance(old ? 0.45 : 0.12), lips: female && chance(0.6)
  };
  if (kind === 'rich') {
    L.outfit = 'suit'; L.shirt = pick(['#2a2a3a', '#4a3a2a', '#3a2a3a', '#d8d0c0']); L.pants = L.shirt; L.shoes = '#1e1a1e';
    L.style = female ? 'bun' : pick(['short', 'bald', 'cowboy']); L.watch = true; L.hat = '#e8e0d0';
  }
  if (kind === 'regular' && !female && chance(0.5)) { L.style = 'cap'; L.outfit = pick(['flannel', 'overalls']); }
  return L;
}
const PLAYER_LOOK = { skin: '#f8d8b8', hair: '#4a2c18', eye: '#3a2a1a', shirt: '#f4f2ec', pants: '#3a3a44', shoes: '#1e1a1e', style: 'short', outfit: 'chef', build: 'avg', chef: true };
const NIGHT_LOOK = { skin: '#f8d8b8', hair: '#4a2c18', eye: '#3a2a1a', shirt: '#2a2a36', pants: '#1e1e26', shoes: '#1e1a1e', style: 'hood', outfit: 'hoodie', build: 'avg' };
const SHERIFF_LOOK = { skin: '#e8b890', hair: '#5a3a20', eye: '#3a5a8a', shirt: '#c8a868', shirt2: '#e8dcc0', pants: '#5a5040', shoes: '#3a2418', style: 'cowboy', hat: '#8a6a40', outfit: 'jacket', build: 'heavy', beard: 'mustache', badge: true };
const INSPECTOR_LOOK = { skin: '#f0c49c', hair: '#9a9aa2', eye: '#2a1a22', shirt: '#6a6a74', pants: '#6a6a74', shoes: '#1e1a1e', style: 'short', outfit: 'suit', build: 'thin', glasses: true, old: true };
const KNOWER_LOOK = { skin: '#d8b090', hair: '#3a2a1a', eye: '#6a4426', shirt: '#4a5a3a', pants: '#3a3a44', shoes: '#3a2418', style: 'mohawk', outfit: 'hoodie', build: 'thin', beard: 'stubble' };
const GHOST_LOOK = { skin: '#dfe4ee', hair: '#c8ccd8', eye: '#1a1a2a', shirt: '#b8bccb', pants: '#a8acbb', shoes: '#9a9eac', style: 'long', outfit: 'dress', build: 'thin', female: true };

// контур: тёмный оттенок соседнего пикселя (мягче, чем чёрный)
function outlineAuto(canvas) {
  const x = canvas.getContext('2d'), { width: w, height: h } = canvas;
  const img = x.getImageData(0, 0, w, h), d = img.data, src = new Uint8ClampedArray(d);
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? -1 : (src[(j * w + i) * 4 + 3] > 100 ? (j * w + i) * 4 : -1);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const o = (j * w + i) * 4;
    if (src[o + 3] > 0) continue;
    const n = [at(i, j + 1), at(i, j - 1), at(i - 1, j), at(i + 1, j)].find(v => v >= 0);
    if (n === undefined) continue;
    d[o] = src[n] * 0.28 + 12; d[o + 1] = src[n + 1] * 0.22 + 6; d[o + 2] = src[n + 2] * 0.28 + 14; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return canvas;
}

// кудрявая шапка волос: скруглённый силуэт с завитками
function curlyHair(r, y0, hr, hrL, hrD, mode) {
  const rows = mode === 'back'
    ? [[9, 10], [7, 14], [6, 16], [5, 18], [5, 18], [5, 18], [5, 18], [5, 18], [5, 18], [5, 18], [6, 16], [6, 16], [7, 14], [9, 10]]
    : [[9, 10], [7, 14], [6, 16], [5, 18], [5, 18], [5, 18], [5, 3], [20, 3], [5, 3], [20, 3], [5, 3], [20, 3], [6, 2], [20, 2]];
  if (mode === 'back') rows.forEach(([x, w], i) => r(x, y0 - 3 + i, w, 1, hr));
  else {
    for (let i = 0; i < 6; i++) r(rows[i][0], y0 - 3 + i, rows[i][1], 1, hr);
    for (let i = 6; i < rows.length; i += 2) { r(rows[i][0], y0 + (i - 6) / 2 + 3, rows[i][1], 1, hr); r(rows[i + 1][0], y0 + (i - 6) / 2 + 3, rows[i + 1][1], 1, hr); }
    r(5, y0 + 6, 3, 3, hr); r(20, y0 + 6, 3, 3, hr); r(6, y0 + 9, 2, 1, hr); r(20, y0 + 9, 2, 1, hr);
    r(8, y0 + 3, 2, 1, hr); r(12, y0 + 3, 3, 1, hr); r(17, y0 + 3, 2, 1, hr);
  }
  r(8, y0 - 4, 2, 1, hr); r(13, y0 - 4, 2, 1, hr); r(18, y0 - 4, 2, 1, hr); r(4, y0, 1, 2, hr); r(23, y0, 1, 2, hr);
  [[8, -2], [12, -1], [16, -2], [7, 1], [11, 1], [15, 0], [19, 1], [9, 3], [17, 3], [6, 6], [21, 6]].forEach(([x, y], k) => {
    if (mode !== 'back' && y >= 3 && x > 7 && x < 20) return;
    r(x, y0 + y, 2, 1, hrL); r(x + 1, y0 + y + 1, 1, 1, hrD);
  });
  r(17, y0 - 1, 4, 3, hrD); r(18, y0 + 2, 3, 1, hrD);
}

const _charCache = new Map();
let _lookId = 1;

function buildChar(L, dir, frame, blink) {
  const [c, x] = makeCanvas(28, 48);
  const r = (X, Y, w, h, col) => { if (w > 0 && h > 0) { x.fillStyle = col; x.fillRect(X, Y, w, h); } };
  const side = dir === 'left' || dir === 'right', up = dir === 'up', down = dir === 'down';
  const bob = frame % 2 ? 1 : 0, y0 = 9 + bob;
  const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;

  const sk = L.skin, skD = shade(sk, -0.16), skDD = shade(sk, -0.32), skL = shade(sk, 0.3);
  const hr = L.hair, hrL = shade(hr, 0.28), hrD = shade(hr, -0.28);
  const C = L.shirt, CL = shade(C, 0.22), CD = shade(C, -0.24), CDD = shade(C, -0.42);
  const C2 = L.shirt2 || '#e8e4dc';
  const P = L.pants, PD = shade(P, -0.25), PL = shade(P, 0.15);
  const shoe = L.shoes || '#2a1e1a', shoeD = shade(shoe, -0.35), shoeL = shade(shoe, 0.35);
  const eye = L.eye || '#2a1a22', outfit = L.outfit || 'tee', build = L.build || 'avg';
  const tw = build === 'thin' ? 5 : build === 'heavy' ? 7 : 6;
  const legW = build === 'thin' ? 3 : build === 'heavy' ? 5 : 4;
  const armW = build === 'heavy' ? 4 : 3;
  const white = '#f6f4ee', whiteD = '#d8d4cc';
  const longSleeve = ['flannel', 'jacket', 'hoodie', 'suit', 'chef'].includes(outfit);
  const sleeve = outfit === 'overalls' ? C2 : C;
  const mouth = L.lips ? '#c03a4a' : skDD;

  // ================= ВИД СПЕРЕДИ / СЗАДИ =================
  if (!side) {
    const tL = 14 - tw, tW = tw * 2;
    // --- ноги ---
    const len1 = frame === 1 ? 7 : frame === 3 ? 6 : 7, len2 = frame === 3 ? 7 : frame === 1 ? 6 : 7;
    const lx = 13 - legW, rx = 15;
    const legCol = outfit === 'dress' ? sk : P, legD = outfit === 'dress' ? skD : PD;
    const lw = outfit === 'dress' ? legW - 1 : legW;
    r(lx + (legW - lw), y0 + 25, lw, len1, legCol); r(rx, y0 + 25, lw, len2, legCol);
    r(lx + legW - 1, y0 + 25, 1, len1, legD); r(rx, y0 + 25, 1, len2, legD);
    if (outfit !== 'dress') { r(13, y0 + 25, 2, 2, P); r(lx, y0 + 24 + len1, legW, 1, PD); r(rx, y0 + 24 + len2, legW, 1, PD); }
    const sh = (X, Y) => { r(X, Y, legW + 1, 2, shoe); r(X, Y + 1, legW + 1, 1, shoeD); if (down) r(X + 1, Y, 2, 1, shoeL); };
    sh(lx - 1, y0 + 25 + len1); sh(rx, y0 + 25 + len2);

    // --- руки (позади туловища не видны, рисуем по бокам) ---
    const armL = tL - armW, armR = tL + tW;
    const arm = (X, dy, dark) => {
      const s = dark ? CD : sleeve, s2 = dark ? CDD : shade(sleeve, -0.12);
      const sl = longSleeve ? 9 : 4;
      r(X, y0 + 15 + dy, armW, sl, s); r(dark ? X + armW - 1 : X, y0 + 15 + dy, 1, sl, s2);
      if (!longSleeve) { r(X, y0 + 19 + dy, armW, 5, dark ? skD : sk); r(dark ? X + armW - 1 : X, y0 + 19 + dy, 1, 5, skD); }
      else r(X, y0 + 23 + dy, armW, 1, dark ? CDD : CD);
      r(X, y0 + 24 + dy, armW, 2, dark ? skD : sk); r(X, y0 + 25 + dy, armW, 1, skD);
      if (L.watch && dark) r(X, y0 + 23 + dy, armW, 1, '#e0c060');
    };
    arm(armL, swing, false); arm(armR, -swing, true);

    // --- туловище ---
    const body = outfit === 'chef' ? white : C, bodyL = outfit === 'chef' ? '#ffffff' : CL, bodyD = outfit === 'chef' ? whiteD : CD;
    r(tL + 1, y0 + 14, tW - 2, 1, body); r(tL, y0 + 15, tW, 9, body);
    if (build === 'heavy') { r(tL - 1, y0 + 18, tW + 2, 5, body); r(tL - 1, y0 + 18, 1, 5, bodyL); r(tL + tW, y0 + 18, 1, 5, bodyD); }
    r(tL, y0 + 15, 1, 9, bodyL); r(tL + tW - 2, y0 + 15, 2, 9, bodyD); r(tL, y0 + 23, tW, 1, bodyD);
    if (down) r(tL + 3, y0 + 21, tW - 6, 1, bodyD);
    // детали одежды
    if (outfit === 'tee') { if (down) { r(12, y0 + 14, 4, 1, skD); r(13, y0 + 15, 2, 1, skD); r(12, y0 + 17, 4, 3, C2); r(13, y0 + 18, 2, 1, shade(C2, -0.3)); } else r(12, y0 + 14, 4, 1, CD); }
    if (outfit === 'flannel') {
      for (let j = y0 + 16; j < y0 + 24; j += 3) r(tL, j, tW, 1, CD);
      for (let i = tL + 1; i < tL + tW; i += 3) r(i, y0 + 15, 1, 9, CD);
      for (let j = y0 + 16; j < y0 + 24; j += 3) for (let i = tL + 1; i < tL + tW; i += 3) r(i, j, 1, 1, CDD);
      if (down) { r(11, y0 + 14, 2, 2, CL); r(15, y0 + 14, 2, 2, CL); r(13, y0 + 14, 2, 1, skD); for (let j = y0 + 16; j < y0 + 24; j += 2) r(14, j, 1, 1, '#ece4c8'); }
    }
    if (outfit === 'jacket') {
      if (down) { r(12, y0 + 14, 4, 10, C2); r(12, y0 + 14, 1, 10, shade(C2, -0.2)); r(11, y0 + 14, 1, 5, CL); r(16, y0 + 14, 1, 5, CD); r(tL + 1, y0 + 20, 3, 1, CD); r(tW + tL - 4, y0 + 20, 3, 1, CD); }
      else r(13, y0 + 15, 2, 8, CD);
    }
    if (outfit === 'hoodie') {
      if (down) { r(10, y0 + 13, 8, 2, CD); r(12, y0 + 14, 4, 1, skD); r(12, y0 + 15, 1, 3, white); r(15, y0 + 15, 1, 3, white); r(10, y0 + 20, 8, 3, CD); r(11, y0 + 20, 6, 1, C); }
      else { r(9, y0 + 12, 10, 5, CD); r(10, y0 + 12, 8, 1, C); }
    }
    if (outfit === 'overalls') {
      r(tL, y0 + 21, tW, 3, P);
      if (down) { r(11, y0 + 16, 6, 6, P); r(11, y0 + 16, 6, 1, PL); r(13, y0 + 18, 2, 2, PD); r(10, y0 + 14, 2, 3, P); r(16, y0 + 14, 2, 3, P); r(10, y0 + 16, 1, 1, '#e0c060'); r(17, y0 + 16, 1, 1, '#e0c060'); }
      else { r(11, y0 + 14, 1, 8, P); r(16, y0 + 14, 1, 8, P); r(11, y0 + 18, 6, 1, P); }
    }
    if (outfit === 'suit') {
      if (down) { r(12, y0 + 14, 4, 2, white); r(13, y0 + 16, 2, 3, white); r(13, y0 + 15, 2, 6, '#b02a3a'); r(13, y0 + 15, 2, 1, '#d84a5a'); r(11, y0 + 15, 1, 4, CL); r(16, y0 + 15, 1, 4, CL); r(tL + tW - 4, y0 + 16, 2, 1, white); r(14, y0 + 21, 1, 1, CDD); }
      else r(14, y0 + 19, 1, 5, CDD);
    }
    if (outfit === 'dress') {
      if (down) { r(12, y0 + 14, 4, 2, sk); r(13, y0 + 16, 2, 1, skD); }
      r(tL, y0 + 20, tW, 1, CD);
      r(tL - 1, y0 + 21, tW + 2, 7, C); r(tL - 2, y0 + 25, tW + 4, 3, C);
      r(tL - 1, y0 + 21, 1, 7, CL); r(tL + tW - 1, y0 + 21, 2, 7, CD); r(tL - 2, y0 + 27, tW + 4, 1, CD);
      for (let i = tL + 1; i < tL + tW; i += 3) r(i, y0 + 24, 1, 3, CD);
    }
    if (outfit === 'chef') {
      if (down) {
        r(12, y0 + 14, 4, 2, '#d83a3a'); r(13, y0 + 16, 2, 1, '#a82a2a');
        [17, 20].forEach(dy => { r(11, y0 + dy, 1, 1, whiteD); r(16, y0 + dy, 1, 1, whiteD); });
        r(tL + 1, y0 + 18, tW - 2, 10, '#fbfaf6'); r(tL + tW - 2, y0 + 18, 1, 10, whiteD); r(12, y0 + 22, 4, 2, '#e8e4dc'); r(12, y0 + 22, 4, 1, whiteD);
      } else { r(tL, y0 + 19, tW, 1, whiteD); r(13, y0 + 19, 2, 3, '#fbfaf6'); r(12, y0 + 22, 1, 2, '#fbfaf6'); r(15, y0 + 22, 1, 2, '#fbfaf6'); r(12, y0 + 14, 4, 1, '#d83a3a'); }
    }
    if (!['dress', 'overalls', 'chef'].includes(outfit)) { r(tL, y0 + 24, tW, 1, '#3a2418'); if (down) r(13, y0 + 24, 2, 1, '#e0c060'); }
    r(12, y0 + 13, 4, 1, skD); // шея

    // --- голова ---
    if (up) {
      r(9, y0, 10, 1, hr); r(8, y0 + 1, 12, 1, hr); r(7, y0 + 2, 14, 10, hr); r(8, y0 + 12, 12, 1, hrD);
      r(6, y0 + 6, 1, 3, sk); r(21, y0 + 6, 1, 3, skD);
      r(10, y0 + 2, 5, 2, hrL); r(7, y0 + 10, 14, 2, hrD); r(11, y0 + 5, 1, 5, hrD); r(16, y0 + 4, 1, 6, hrD); r(13, y0 + 7, 1, 4, hrD);
      if (L.style === 'long') { r(6, y0 + 3, 16, 14, hr); r(6, y0 + 3, 1, 14, hrD); r(21, y0 + 3, 1, 14, hrD); r(9, y0 + 6, 1, 9, hrL); r(14, y0 + 8, 1, 8, hrD); r(7, y0 + 16, 14, 1, hrD); }
      if (L.style === 'pony') { r(12, y0 + 11, 4, 8, hr); r(13, y0 + 12, 1, 6, hrL); r(12, y0 + 11, 4, 1, '#d83a5a'); }
      if (L.style === 'bun') { r(11, y0 - 3, 6, 4, hr); r(12, y0 - 4, 4, 1, hr); r(12, y0 - 3, 2, 1, hrL); }
      if (L.style === 'curly') curlyHair(r, y0, hr, hrL, hrD, 'back');
      if (L.style === 'bald') { r(8, y0, 12, 9, sk); r(9, y0 + 1, 4, 2, skL); r(7, y0 + 8, 14, 4, hr); r(7, y0 + 11, 14, 1, hrD); }
      if (L.style === 'mohawk') { r(8, y0, 12, 12, skD); r(12, y0 - 4, 4, 15, hr); r(13, y0 - 4, 1, 13, hrL); }
    } else {
      // лицо
      r(8, y0 + 3, 12, 9, sk); r(9, y0 + 12, 10, 1, skD); r(18, y0 + 3, 2, 9, skD); r(8, y0 + 4, 12, 1, skD);
      r(7, y0 + 6, 1, 3, sk); r(20, y0 + 6, 1, 3, skD); r(7, y0 + 7, 1, 1, skD);
      // глаза
      if (blink) { r(10, y0 + 8, 2, 1, skDD); r(16, y0 + 8, 2, 1, skDD); }
      else {
        r(10, y0 + 7, 2, 2, '#ffffff'); r(11, y0 + 7, 1, 2, eye); r(16, y0 + 7, 2, 2, '#ffffff'); r(16, y0 + 7, 1, 2, eye);
        r(11, y0 + 7, 1, 1, shade(eye, -0.4)); r(16, y0 + 7, 1, 1, shade(eye, -0.4));
        if (L.female) { r(9, y0 + 6, 3, 1, '#2a1a22'); r(16, y0 + 6, 3, 1, '#2a1a22'); }
      }
      r(10, y0 + 5, L.female ? 2 : 3, 1, hrD); r(L.female ? 16 : 15, y0 + 5, L.female ? 2 : 3, 1, hrD);
      r(13, y0 + 9, 2, 1, skD); r(13, y0 + 10, 2, 1, skDD);
      r(13, y0 + 11, 2, 1, mouth); if (L.lips) r(12, y0 + 11, 1, 1, shade(mouth, 0.2));
      r(9, y0 + 9, 2, 1, '#f09a90'); r(17, y0 + 9, 1, 1, '#e08a80');
      if (L.old) { r(9, y0 + 8, 1, 1, skDD); r(18, y0 + 8, 1, 1, skDD); r(11, y0 + 11, 1, 1, skD); r(16, y0 + 11, 1, 1, skD); r(12, y0 + 4, 4, 1, skDD); }
      if (L.beard === 'stubble') { for (let i = 9; i < 19; i++) for (let j = y0 + 10; j < y0 + 13; j++) if ((i + j) % 2) r(i, j, 1, 1, shade(hr, 0.15)); r(13, y0 + 11, 2, 1, mouth); }
      if (L.beard === 'mustache') { r(11, y0 + 10, 6, 1, hr); r(12, y0 + 10, 2, 1, hrL); }
      if (L.beard === 'full') { r(8, y0 + 9, 12, 4, hr); r(9, y0 + 13, 10, 1, hr); r(10, y0 + 14, 8, 1, hrD); r(13, y0 + 11, 2, 1, '#5a2a2a'); r(9, y0 + 10, 2, 1, hrL); }
      if (L.glasses) { const f = '#22202a'; [9, 15].forEach(gx => { r(gx, y0 + 6, 4, 4, f); r(gx + 1, y0 + 7, 2, 2, '#bfe0f0'); }); r(13, y0 + 7, 2, 1, f); r(11, y0 + 7, 1, 2, eye); r(16, y0 + 7, 1, 2, eye); r(10, y0 + 7, 1, 1, '#ffffff'); }
      // волосы спереди
      const cap = () => { r(9, y0, 10, 1, hr); r(8, y0 + 1, 12, 1, hr); r(7, y0 + 2, 14, 2, hr); r(10, y0 + 1, 4, 1, hrL); r(9, y0 + 2, 2, 1, hrL); r(16, y0 + 2, 4, 2, hrD); };
      const bangs = () => { r(8, y0 + 4, 12, 1, hr); r(9, y0 + 5, 1, 1, hr); r(12, y0 + 5, 2, 1, hr); r(17, y0 + 5, 1, 1, hr); r(7, y0 + 4, 1, 3, hr); r(20, y0 + 4, 1, 3, hr); r(15, y0 + 4, 3, 1, hrD); };
      switch (L.style) {
        case 'hood':
          r(6, y0 - 1, 16, 14, C); r(7, y0 - 2, 14, 1, C); r(9, y0 + 3, 10, 9, sk); r(9, y0 + 3, 10, 2, CDD); r(9, y0 + 5, 1, 7, CD); r(18, y0 + 5, 1, 7, CD);
          r(7, y0, 4, 2, CL); r(19, y0, 3, 12, CD);
          if (!blink) { r(10, y0 + 7, 2, 2, '#ffffff'); r(11, y0 + 7, 1, 2, eye); r(16, y0 + 7, 2, 2, '#ffffff'); r(16, y0 + 7, 1, 2, eye); }
          break;
        case 'long': cap(); r(8, y0 + 4, 5, 1, hr); r(15, y0 + 4, 5, 1, hr); r(8, y0 + 5, 2, 1, hr); r(18, y0 + 5, 2, 1, hr); r(13, y0 + 3, 2, 1, hrD); r(6, y0 + 3, 2, 14, hr); r(20, y0 + 3, 2, 14, hr); r(6, y0 + 3, 1, 14, hrD); r(21, y0 + 3, 1, 14, hrD); r(7, y0 + 6, 1, 7, hrL); break;
        case 'pony': cap(); bangs(); r(20, y0 + 3, 2, 4, hr); r(21, y0 + 2, 1, 2, '#d83a5a'); break;
        case 'bun': cap(); bangs(); r(11, y0 - 3, 6, 3, hr); r(12, y0 - 4, 4, 1, hr); r(12, y0 - 3, 2, 1, hrL); break;
        case 'curly': curlyHair(r, y0, hr, hrL, hrD, 'front'); break;
        case 'mohawk': r(8, y0 + 1, 12, 3, skD); r(9, y0, 10, 1, skD); r(12, y0 - 4, 4, 8, hr); r(13, y0 - 4, 1, 7, hrL); r(7, y0 + 4, 1, 3, skDD); r(20, y0 + 4, 1, 3, skDD); break;
        case 'bald': r(9, y0, 10, 1, sk); r(8, y0 + 1, 12, 3, sk); r(10, y0 + 1, 3, 1, skL); r(11, y0 + 2, 1, 1, skL); r(7, y0 + 4, 2, 3, hr); r(19, y0 + 4, 2, 3, hr); break;
        case 'cap': {
          const cp = L.cap || '#b03a3a', cpD = shade(cp, -0.3);
          r(7, y0 + 4, 1, 3, hr); r(20, y0 + 4, 1, 3, hr);
          r(8, y0 - 1, 12, 1, cp); r(7, y0, 14, 4, cp); r(8, y0, 3, 1, shade(cp, 0.3));
          if (down) { r(11, y0 + 1, 6, 2, '#f4f2ec'); r(13, y0 + 1, 2, 2, cpD); r(7, y0 + 4, 14, 1, cpD); r(8, y0 + 5, 12, 1, shade(cp, -0.5)); }
          break;
        }
        case 'cowboy': {
          const ht = L.hat || '#8a5a30', htD = shade(ht, -0.3);
          bangs(); r(9, y0 - 3, 10, 6, ht); r(13, y0 - 3, 2, 1, htD); r(9, y0 + 1, 10, 1, '#3a2418'); r(4, y0 + 3, 20, 2, ht); r(4, y0 + 4, 20, 1, htD); r(3, y0 + 2, 1, 1, ht); r(24, y0 + 2, 1, 1, ht); r(10, y0 - 2, 2, 2, shade(ht, 0.25));
          break;
        }
        default: cap(); bangs();
      }
    }
    if (up && L.style === 'cap') { const cp = L.cap || '#b03a3a'; r(7, y0 - 1, 14, 5, cp); r(10, y0 + 4, 8, 1, shade(cp, -0.3)); r(12, y0 + 4, 4, 1, hr); }
    if (up && L.style === 'cowboy') { const ht = L.hat || '#8a5a30'; r(9, y0 - 3, 10, 6, ht); r(4, y0 + 3, 20, 2, ht); r(4, y0 + 4, 20, 1, shade(ht, -0.3)); r(9, y0 + 1, 10, 1, '#3a2418'); }
    if (up && L.style === 'hood') { r(6, y0 - 1, 16, 15, C); r(7, y0 - 2, 14, 1, C); r(13, y0 + 1, 2, 12, CD); r(7, y0 + 12, 14, 2, CD); }
  }

  // ================= ПРОФИЛЬ (вправо; влево — зеркально) =================
  else {
    const sw = tw * 2 - 3, tx = 14 - Math.floor(sw / 2);
    // дальняя рука
    if (swing) { const off = -swing * 2; r(tx + 3 + off, y0 + 16, armW, 7, CDD); r(tx + 3 + off, y0 + 23, armW, 2, skD); }
    // ноги
    const legCol = outfit === 'dress' ? sk : P;
    if (!swing) { r(12, y0 + 25, legW + 1, 7, legCol); r(12, y0 + 25, 1, 7, shade(legCol, -0.25)); r(12, y0 + 32, legW + 3, 2, shoe); r(12, y0 + 33, legW + 3, 1, shoeD); }
    else {
      const backX = swing > 0 ? 9 : 15, frontX = swing > 0 ? 15 : 10;
      r(backX, y0 + 25, legW, 6, shade(legCol, -0.3)); r(backX - 1, y0 + 31, legW + 2, 2, shoeD);
      r(frontX, y0 + 25, legW, 7, legCol); r(frontX, y0 + 25, 1, 7, shade(legCol, -0.2)); r(frontX, y0 + 32, legW + 2, 2, shoe); r(frontX, y0 + 33, legW + 2, 1, shoeD); r(frontX + legW, y0 + 32, 1, 1, shoeL);
    }
    // туловище
    const body = outfit === 'chef' ? white : C, bodyL = outfit === 'chef' ? '#ffffff' : CL, bodyD = outfit === 'chef' ? whiteD : CD;
    r(tx, y0 + 14, sw, 10, body); r(tx, y0 + 14, 1, 10, bodyD); r(tx + sw - 1, y0 + 15, 1, 8, bodyL); r(tx, y0 + 23, sw, 1, bodyD);
    if (build === 'heavy') { r(tx + sw, y0 + 18, 2, 5, body); r(tx + sw + 1, y0 + 19, 1, 3, bodyL); }
    if (outfit === 'flannel') { for (let j = y0 + 16; j < y0 + 24; j += 3) r(tx, j, sw, 1, CD); for (let i = tx + 1; i < tx + sw; i += 3) r(i, y0 + 14, 1, 10, CD); }
    if (outfit === 'suit') { r(tx + sw - 2, y0 + 14, 2, 4, white); r(tx + sw - 1, y0 + 15, 1, 6, '#b02a3a'); }
    if (outfit === 'jacket') r(tx + sw - 2, y0 + 14, 2, 10, C2);
    if (outfit === 'hoodie') { r(tx - 1, y0 + 12, 5, 5, CD); r(tx + sw - 4, y0 + 20, 4, 3, CD); }
    if (outfit === 'overalls') { r(tx, y0 + 21, sw, 3, P); r(tx + 2, y0 + 14, 2, 8, P); r(tx + 3, y0 + 16, 1, 1, '#e0c060'); }
    if (outfit === 'tee') r(tx + 3, y0 + 14, sw - 3, 1, skD);
    if (outfit === 'dress') { r(tx, y0 + 20, sw, 1, CD); r(tx - 1, y0 + 21, sw + 3, 7, C); r(tx - 2, y0 + 25, sw + 5, 3, C); r(tx - 2, y0 + 27, sw + 5, 1, CD); r(tx + sw, y0 + 21, 2, 7, CL); }
    if (outfit === 'chef') { r(tx + sw - 3, y0 + 18, 3, 10, '#fbfaf6'); r(tx + sw - 1, y0 + 14, 2, 2, '#d83a3a'); r(tx, y0 + 19, sw, 1, whiteD); }
    if (!['dress', 'overalls', 'chef'].includes(outfit)) r(tx, y0 + 24, sw, 1, '#3a2418');
    // ближняя рука
    const off = swing * 2, ax = tx + Math.floor(sw / 2) - 1;
    r(ax, y0 + 15, armW, 4, sleeve); r(ax + Math.round(off / 2), y0 + 19, armW, 4, longSleeve ? sleeve : sk);
    r(ax, y0 + 15, 1, 4, shade(sleeve, 0.15));
    r(ax + off, y0 + 23, armW, 2, sk); r(ax + off, y0 + 24, armW, 1, skD);
    if (L.watch) r(ax + off, y0 + 22, armW, 1, '#e0c060');
    r(13, y0 + 13, 4, 1, skD);
    // голова в профиль
    r(11, y0 + 3, 9, 9, sk); r(12, y0 + 12, 7, 1, skD); r(20, y0 + 7, 1, 3, sk); r(20, y0 + 9, 1, 1, skD); r(11, y0 + 4, 9, 1, skD);
    r(12, y0 + 6, 2, 3, sk); r(12, y0 + 7, 1, 1, skDD);
    if (blink) r(17, y0 + 8, 2, 1, skDD);
    else { r(17, y0 + 7, 2, 2, '#ffffff'); r(18, y0 + 7, 1, 2, eye); if (L.female) r(17, y0 + 6, 3, 1, '#2a1a22'); }
    r(17, y0 + 5, 3, 1, hrD);
    r(18, y0 + 11, 2, 1, mouth); r(16, y0 + 9, 2, 1, '#f09a90');
    if (L.old) { r(16, y0 + 8, 1, 1, skDD); r(16, y0 + 11, 1, 1, skD); }
    if (L.beard === 'full') { r(13, y0 + 9, 7, 4, hr); r(14, y0 + 13, 5, 1, hrD); r(18, y0 + 11, 2, 1, '#5a2a2a'); }
    if (L.beard === 'mustache') r(18, y0 + 10, 3, 1, hr);
    if (L.beard === 'stubble') for (let i = 13; i < 20; i++) if (i % 2) r(i, y0 + 11, 1, 1, shade(hr, 0.15));
    if (L.glasses) { r(16, y0 + 6, 4, 4, '#22202a'); r(17, y0 + 7, 2, 2, '#bfe0f0'); r(18, y0 + 7, 1, 2, eye); r(13, y0 + 7, 3, 1, '#22202a'); }
    const capS = () => { r(10, y0, 9, 1, hr); r(9, y0 + 1, 11, 1, hr); r(8, y0 + 2, 12, 2, hr); r(8, y0 + 3, 4, 8, hr); r(9, y0 + 11, 3, 1, hr); r(13, y0 + 3, 7, 1, hr); r(14, y0 + 4, 3, 1, hr); r(13, y0 + 4, 1, 3, hr); r(10, y0 + 1, 4, 1, hrL); r(8, y0 + 8, 3, 3, hrD); };
    switch (L.style) {
      case 'hood': r(7, y0 - 1, 13, 14, C); r(8, y0 - 2, 11, 1, C); r(14, y0 + 3, 6, 9, sk); r(14, y0 + 3, 6, 2, CDD); r(14, y0 + 5, 1, 7, CD); r(8, y0, 3, 2, CL);
        if (!blink) { r(17, y0 + 7, 2, 2, '#ffffff'); r(18, y0 + 7, 1, 2, eye); } r(20, y0 + 7, 1, 3, sk); break;
      case 'long': capS(); r(7, y0 + 3, 5, 14, hr); r(7, y0 + 3, 1, 14, hrD); r(9, y0 + 6, 1, 8, hrL); break;
      case 'pony': capS(); r(5, y0 + 4, 3, 8, hr); r(5, y0 + 6, 1, 5, hrD); r(7, y0 + 4, 1, 2, '#d83a5a'); break;
      case 'bun': capS(); r(6, y0 - 2, 5, 4, hr); r(7, y0 - 2, 2, 1, hrL); break;
      case 'curly': r(7, y0 - 2, 12, 5, hr); r(6, y0, 6, 10, hr); r(5, y0 + 2, 2, 6, hr); r(9, y0 - 3, 7, 1, hr); r(13, y0 + 3, 7, 1, hr); r(18, y0 + 1, 2, 3, hr);
        [[8, -1], [12, -2], [7, 3], [9, 6], [6, 8], [15, 0]].forEach(([x, y]) => { r(x, y0 + y, 2, 1, hrL); r(x + 1, y0 + y + 1, 1, 1, hrD); }); break;
      case 'mohawk': r(9, y0 + 1, 11, 3, skD); r(8, y0 + 3, 4, 8, skD); r(9, y0 - 4, 9, 5, hr); r(10, y0 - 4, 7, 1, hrL); break;
      case 'bald': r(10, y0, 9, 1, sk); r(9, y0 + 1, 11, 3, sk); r(12, y0 + 1, 3, 1, skL); r(8, y0 + 4, 4, 5, hr); r(9, y0 + 3, 2, 1, sk); break;
      case 'cap': { const cp = L.cap || '#b03a3a'; r(8, y0 + 3, 4, 7, hr); r(8, y0 - 1, 12, 5, cp); r(9, y0 - 1, 4, 1, shade(cp, 0.3)); r(15, y0, 3, 2, '#f4f2ec'); r(18, y0 + 3, 6, 1, shade(cp, -0.3)); r(19, y0 + 4, 4, 1, shade(cp, -0.5)); break; }
      case 'cowboy': { const ht = L.hat || '#8a5a30'; capS(); r(9, y0 - 3, 10, 6, ht); r(9, y0 + 1, 10, 1, '#3a2418'); r(4, y0 + 3, 20, 2, ht); r(4, y0 + 4, 20, 1, shade(ht, -0.3)); r(10, y0 - 2, 2, 2, shade(ht, 0.25)); break; }
      default: capS();
    }
  }

  // поварской колпак
  if (L.chef) {
    const tx = side ? 9 : 9;
    r(tx, y0 - 7, 10, 8, '#fbfaf6'); r(tx - 1, y0 - 6, 12, 4, '#fbfaf6'); r(tx + 8, y0 - 6, 3, 7, '#dcd8d0'); r(tx + 1, y0 - 6, 2, 2, '#ffffff');
    r(tx + 3, y0 - 3, 1, 3, '#e4e0d8'); r(tx + 6, y0 - 3, 1, 3, '#e4e0d8');
    r(tx - 1, y0, 12, 3, '#ece8e0'); r(tx - 1, y0 + 2, 12, 1, '#c8c4bc');
  }

  outlineAuto(c);
  if (dir === 'left') {
    const [m, mx] = makeCanvas(28, 48);
    mx.translate(28, 0); mx.scale(-1, 1); mx.drawImage(c, 0, 0);
    return m;
  }
  return c;
}

// (wx, wy) — точка под ногами в координатах мира
function drawChar(ctx, wx, wy, look, dir = 'down', frame = 0, opts = {}) {
  if (!look._id) Object.defineProperty(look, '_id', { value: _lookId++, enumerable: false });
  const now = performance.now() / 1000;
  const blink = dir !== 'up' && ((now + look._id * 0.77) % 3.7) < 0.13;
  const key = look._id + dir + (frame % 4) + (blink ? 'b' : '');
  let spr = _charCache.get(key);
  if (!spr) { spr = buildChar(look, dir, frame % 4, blink); _charCache.set(key, spr); }
  const X = px(wx), Y = px(wy);
  const a = opts.alpha ?? 1;
  shadow(ctx, X, Y - 1, (look.build === 'heavy' ? 10 : 8) + Math.abs(SUN_DX) / 2, 3, 0.32 * a, SUN_DX);
  ctx.globalAlpha = a;
  ctx.drawImage(spr, X - 14, Y - 45);
  ctx.globalAlpha = 1;
}
