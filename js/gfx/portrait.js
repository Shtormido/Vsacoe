// Детальные портреты 64×64 для диалогов (бюст, как в Stardew Valley)
// mood: neutral | happy | angry | sus | sad
const PORTRAIT_BG = [['#9cc8e4', '#efe2bc'], ['#e6b894', '#f8e8c8'], ['#a8d09c', '#f2eac4'], ['#c8b0dc', '#f2e2ea'], ['#e8d090', '#faf0d0']];

function buildPortrait(L, mood = 'neutral', withBg = true) {
  const [c, x] = makeCanvas(64, 64);
  const [f, fx] = makeCanvas(64, 64);          // слой персонажа (потом обводим)
  const r = (X, Y, w, h, col) => { if (w > 0 && h > 0) { fx.fillStyle = col; fx.fillRect(Math.round(X), Math.round(Y), Math.round(w), Math.round(h)); } };
  const row = (y, x1, x2, col) => r(x1, y, x2 - x1 + 1, 1, col);
  const ell = (cx, cy, rx, ry, col) => { for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) { const t = (y - cy) / ry, w = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t))); row(y, cx - w, cx + w, col); } };

  const sk = L.skin, skL = shade(sk, 0.22), skD = shade(sk, -0.14), skDD = shade(sk, -0.3), skX = shade(sk, -0.45);
  const hr = L.hair, hrL = shade(hr, 0.3), hrLL = shade(hr, 0.5), hrD = shade(hr, -0.25), hrDD = shade(hr, -0.45);
  const C = L.shirt, CL = shade(C, 0.2), CD = shade(C, -0.22), CDD = shade(C, -0.4);
  const C2 = L.shirt2 || '#e8e4dc', P = L.pants || '#3a3a44';
  const eye = L.eye || '#3a2a1a', white = '#f8f6f0', whiteD = '#d8d4cc';
  const build = L.build || 'avg', outfit = L.outfit || 'tee', style = L.style || 'short';
  const cx = 32, cy = 27, rx = 12, ry = 15;
  const hw = y => { const t = (y - cy) / ry; if (Math.abs(t) > 1) return -1; let w = rx * Math.sqrt(1 - t * t); if (y > cy + 3) w *= 1 - (y - cy - 3) / (ry * 2.6); return Math.round(w); };

  // ---------- плечи и одежда ----------
  const sw = build === 'thin' ? 19 : build === 'heavy' ? 26 : 22;
  for (let y = 46; y < 64; y++) { const k = Math.min(1, (y - 45) / 7), w = Math.round(10 + (sw - 10) * Math.sqrt(k)); row(y, cx - w, cx + w, outfit === 'chef' ? '#f6f4ee' : C); }
  const body = outfit === 'chef' ? '#f6f4ee' : C, bodyD = outfit === 'chef' ? '#d8d4cc' : CD, bodyL = outfit === 'chef' ? '#ffffff' : CL;
  for (let y = 48; y < 64; y++) { const k = Math.min(1, (y - 45) / 7), w = Math.round(10 + (sw - 10) * Math.sqrt(k)); r(cx + w - 3, y, 3, 1, bodyD); r(cx - w, y, 2, 1, bodyL); }
  r(cx - 15, 58, 2, 6, bodyD); r(cx + 13, 58, 2, 6, bodyD);   // складки у рукавов
  // шея
  r(cx - 5, 38, 11, 10, sk); r(cx - 5, 38, 11, 3, skDD); r(cx + 3, 41, 3, 7, skD);
  const neckline = (w, d) => { for (let i = 0; i < d; i++) row(46 + i, cx - w + i, cx + w - i, i < 1 ? skD : sk); };
  switch (outfit) {
    case 'tee': neckline(6, 4); r(cx - 6, 46, 13, 1, CD); r(cx - 4, 55, 9, 6, C2); r(cx - 3, 56, 7, 4, shade(C2, -0.25)); break;
    case 'flannel':
      for (let y = 49; y < 64; y += 4) for (let X = cx - sw; X <= cx + sw; X++) r(X, y, 1, 1, CD);
      for (let X = cx - sw + 2; X <= cx + sw; X += 4) for (let y = 47; y < 64; y++) r(X, y, 1, 1, (y % 4 === 1) ? CDD : CD);
      neckline(4, 3); r(cx - 8, 45, 6, 4, CL); r(cx + 3, 45, 6, 4, CL); r(cx - 8, 48, 6, 1, CD); r(cx + 3, 48, 6, 1, CD);
      for (let y = 51; y < 64; y += 4) r(cx, y, 1, 1, '#f0e6c8');
      break;
    case 'jacket':
      r(cx - 6, 46, 13, 18, C2); r(cx - 6, 46, 2, 18, shade(C2, -0.15)); neckline(5, 3);
      for (let i = 0; i < 9; i++) { r(cx - 7 - Math.floor(i / 2), 46 + i, 2, 1, CL); r(cx + 6 + Math.floor(i / 2), 46 + i, 2, 1, CDD); }
      r(cx - 18, 56, 6, 1, CD); r(cx + 13, 56, 6, 1, CD);
      if (L.badge) { r(cx - 15, 52, 5, 5, '#e8c040'); r(cx - 14, 51, 3, 1, '#e8c040'); r(cx - 14, 57, 3, 1, '#e8c040'); r(cx - 13, 53, 1, 3, '#a87a20'); r(cx - 14, 52, 1, 1, '#fff4a0'); }
      break;
    case 'hoodie':
      r(cx - 11, 43, 23, 5, CD); r(cx - 9, 44, 19, 2, CDD); neckline(5, 2);
      r(cx - 4, 48, 1, 7, white); r(cx + 4, 48, 1, 7, white); r(cx - 4, 55, 1, 1, '#c8c4bc'); r(cx + 4, 55, 1, 1, '#c8c4bc');
      r(cx - 9, 58, 19, 6, CD); r(cx - 8, 58, 17, 1, CL);
      break;
    case 'overalls':
      neckline(6, 3); r(cx - 8, 52, 17, 12, P); r(cx - 8, 52, 17, 1, shade(P, 0.2)); r(cx - 2, 56, 5, 3, shade(P, -0.25));
      r(cx - 10, 46, 3, 7, P); r(cx + 8, 46, 3, 7, P); r(cx - 9, 52, 2, 2, '#e0c060'); r(cx + 8, 52, 2, 2, '#e0c060');
      break;
    case 'suit':
      r(cx - 5, 46, 11, 18, white); r(cx - 5, 46, 11, 1, whiteD);
      r(cx - 1, 47, 3, 2, '#d84a5a'); r(cx - 2, 49, 5, 15, '#b02a3a'); r(cx - 1, 50, 1, 12, '#d84a5a');
      for (let i = 0; i < 12; i++) { r(cx - 6 - Math.floor(i / 2.5), 46 + i, 2, 1, CL); r(cx + 5 + Math.floor(i / 2.5), 46 + i, 2, 1, CL); }
      r(cx + 11, 52, 4, 2, white);
      break;
    case 'dress':
      for (let i = 0; i < 6; i++) row(46 + i, cx - 8 + i, cx + 8 - i, sk);
      r(cx - 6, 48, 4, 1, skD); r(cx + 3, 48, 4, 1, skD);   // ключицы
      r(cx - 9, 46, 2, 6, CL); r(cx + 8, 46, 2, 6, CD);
      break;
    case 'chef':
      neckline(4, 2); r(cx - 6, 46, 13, 5, '#d83a3a'); r(cx - 2, 51, 5, 4, '#b02a2a'); r(cx - 5, 47, 3, 1, '#f05a5a');
      [[cx - 7, 54], [cx + 7, 54], [cx - 7, 59], [cx + 7, 59]].forEach(([X, Y]) => { r(X, Y, 2, 2, '#c8c4bc'); r(X, Y, 1, 1, '#ffffff'); });
      r(cx - 1, 52, 1, 12, '#d8d4cc');
      break;
  }

  // ---------- уши ----------
  [[cx - 14, 1], [cx + 13, -1]].forEach(([X, s]) => { r(X, 24, 2, 8, sk); r(X + (s > 0 ? 0 : 1), 26, 1, 4, skDD); r(X, 31, 2, 1, skD); });

  // ---------- лицо ----------
  for (let y = 12; y <= 42; y++) { const w = hw(y); if (w >= 0) row(y, cx - w, cx + w, sk); }
  for (let y = 12; y <= 42; y++) { const w = hw(y); if (w < 0) continue; r(cx + Math.round(w * 0.45), y, Math.max(1, w - Math.round(w * 0.45) + 1), 1, skD); r(cx - w, y, 1, 1, skL); }
  for (let y = 36; y <= 42; y++) { const w = hw(y); if (w >= 0) r(cx + Math.round(w * 0.2), y, w - Math.round(w * 0.2) + 1, 1, skDD); }
  row(42, cx - 2, cx + 2, skDD);
  // румянец
  ell(cx - 8, 33, 2.5, 1.2, mix(sk, '#f08080', 0.35)); ell(cx + 8, 33, 2.5, 1.2, mix(skD, '#e07070', 0.3));
  // нос
  r(cx + 1, 25, 1, 7, skD); r(cx - 1, 32, 4, 1, skDD); r(cx - 2, 31, 1, 1, skD); r(cx + 3, 31, 1, 1, skDD); r(cx, 30, 1, 1, skL);
  // глаза
  const eyeAt = (X, right) => {
    const squint = mood === 'happy', narrow = mood === 'sus' || mood === 'angry';
    r(X, 27, 6, 3, white); r(X, 29, 6, 1, whiteD);
    const ix = X + (right ? 1 : 2);
    r(ix, 27, 3, 3, eye); r(ix, 27, 3, 1, shade(eye, -0.4)); r(ix + 1, 28, 1, 2, '#120a12'); r(ix, 27, 1, 1, '#ffffff'); r(ix + 2, 29, 1, 1, shade(eye, 0.4));
    r(X - 1, 26, 8, 1, '#2a1a22'); r(right ? X + 6 : X - 1, 27, 1, 1, '#2a1a22');
    if (L.female) { r(right ? X + 6 : X - 2, 25, 2, 1, '#2a1a22'); r(right ? X + 7 : X - 2, 24, 1, 1, '#2a1a22'); }
    if (narrow) r(X, 27, 6, 1, skD);
    if (squint) { r(X, 29, 6, 1, skD); r(X, 30, 6, 1, skL); }
    r(X, 30, 6, 1, skD);
    if (L.old) { r(right ? X + 7 : X - 2, 29, 1, 2, skDD); r(right ? X + 8 : X - 3, 28, 1, 1, skDD); }
  };
  eyeAt(cx - 9, false); eyeAt(cx + 4, true);
  // брови
  const brow = (X, right) => {
    const th = L.female ? 1 : 2, col = shade(hr, -0.2);
    for (let i = 0; i < 7; i++) {
      let dy = 0;
      if (mood === 'angry') dy = right ? Math.floor((6 - i) / 2.5) * -1 + 2 : Math.floor(i / 2.5) - 0;
      else if (mood === 'sad') dy = right ? Math.floor(i / 3) - 1 : -Math.floor((6 - i) / 3) + 1;
      else if (mood === 'sus' && right) dy = -1 - (i > 3 ? 1 : 0);
      else dy = (i === 0 || i === 6) ? 1 : 0;
      r(X + i, 23 + dy, 1, th, col);
    }
  };
  brow(cx - 10, false); brow(cx + 4, true);
  // рот
  const lips = L.lips ? '#c0384a' : skX, lipL = L.lips ? '#e06070' : skDD;
  if (mood === 'happy') { row(36, cx - 4, cx + 4, lips); r(cx - 5, 35, 1, 1, lips); r(cx + 5, 35, 1, 1, lips); row(37, cx - 3, cx + 3, '#7a2a30'); row(38, cx - 2, cx + 2, lipL); r(cx - 2, 37, 5, 1, '#f8f0e8'); }
  else if (mood === 'angry') { row(37, cx - 4, cx + 4, lips); r(cx - 5, 38, 1, 1, lips); r(cx + 5, 38, 1, 1, lips); row(38, cx - 3, cx + 3, lipL); }
  else if (mood === 'sad') { row(37, cx - 3, cx + 3, lips); r(cx - 4, 38, 1, 1, lips); r(cx + 4, 38, 1, 1, lips); }
  else if (mood === 'sus') { row(37, cx - 3, cx + 3, lips); r(cx + 4, 36, 1, 1, lips); row(38, cx - 2, cx + 1, lipL); }
  else { row(37, cx - 3, cx + 3, lips); row(38, cx - 2, cx + 2, lipL); r(cx - 4, 37, 1, 1, skDD); }
  if (L.old) { r(cx - 6, 34, 1, 3, skDD); r(cx + 6, 34, 1, 3, skDD); row(19, cx - 5, cx + 5, skD); row(21, cx - 4, cx + 3, skD); }

  // ---------- борода ----------
  if (L.beard === 'stubble') for (let y = 34; y <= 42; y++) { const w = hw(y); for (let X = cx - w + 1; X < cx + w; X++) if ((X + y) % 2 && !(y >= 36 && y <= 38 && Math.abs(X - cx) < 5)) r(X, y, 1, 1, mix(sk, hr, 0.45)); }
  if (L.beard === 'mustache') { row(34, cx - 5, cx + 5, hr); row(35, cx - 6, cx - 1, hr); row(35, cx + 1, cx + 6, hr); r(cx - 4, 34, 3, 1, hrL); r(cx - 6, 36, 1, 1, hrD); r(cx + 6, 36, 1, 1, hrD); }
  if (L.beard === 'full') {
    for (let y = 31; y <= 45; y++) { const w = y > 42 ? Math.max(2, 8 - (y - 42) * 2) : hw(y) + (y > 33 ? 1 : 0); if (w > 0) row(y, cx - w, cx + w, hr); }
    for (let y = 31; y <= 44; y++) { const w = y > 42 ? 4 : hw(y); if (w > 0) { r(cx + Math.round(w * 0.4), y, w - Math.round(w * 0.4), 1, hrD); if (y % 3 === 0) r(cx - w + 2, y, 2, 1, hrL); } }
    row(34, cx - 5, cx + 5, hrD); row(36, cx - 3, cx + 3, '#5a2a2a'); row(37, cx - 2, cx + 2, '#7a3a3a');
  }

  // ---------- очки ----------
  if (L.glasses) {
    const fr = '#2a2230';
    [[cx - 10, 25], [cx + 3, 25]].forEach(([X, Y]) => { r(X, Y, 9, 1, fr); r(X, Y + 6, 9, 1, fr); r(X, Y, 1, 7, fr); r(X + 8, Y, 1, 7, fr); fx.fillStyle = 'rgba(190,225,245,0.35)'; fx.fillRect(X + 1, Y + 1, 7, 5); r(X + 2, Y + 1, 2, 1, 'rgba(255,255,255,0.8)'); r(X + 1, Y + 2, 1, 1, 'rgba(255,255,255,0.6)'); });
    r(cx - 1, 27, 3, 1, fr); r(cx - 14, 26, 4, 1, fr); r(cx + 12, 26, 3, 1, fr);
  }

  // ---------- волосы и головные уборы ----------
  const hwH = y => { const t = (y - (cy - 1)) / (ry + 2.5); return Math.abs(t) > 1 ? -1 : Math.round((rx + 2) * Math.sqrt(1 - t * t)); };
  const capHair = (bottom = 18) => {
    for (let y = 8; y <= bottom; y++) { const w = hwH(y); if (w >= 0) row(y, cx - w, cx + w, hr); }
    for (let y = 8; y <= bottom; y++) { const w = hwH(y); if (w >= 0) r(cx + Math.round(w * 0.35), y, w - Math.round(w * 0.35) + 1, 1, hrD); }
    ell(cx - 4, 12, 6, 1.5, hrL); row(11, cx - 7, cx - 3, hrLL); r(cx + 2, 10, 2, 1, hrL);
    for (let k = 0; k < 5; k++) { const X = cx - 9 + k * 4; r(X, 13 + (k % 2), 1, 4, hrD); r(X + 1, 15 + (k % 2), 1, 2, hrDD); }
  };
  const bangs = () => {
    for (let k = 0; k < 7; k++) { const X = cx - 12 + k * 4, len = 2 + (k * 7) % 3; r(X, 18, 4, len, hr); r(X + 3, 18, 1, len, hrD); r(X, 18 + len, 2, 1, hrD); }
    r(cx - 14, 18, 3, 8, hr); r(cx + 12, 18, 3, 8, hrD); r(cx - 14, 25, 2, 2, hrD);
    fx.fillStyle = 'rgba(60,30,30,0.18)'; fx.fillRect(cx - 11, 21, 23, 2);   // тень от чёлки на лбу
  };
  switch (style) {
    case 'short': capHair(); bangs(); break;
    case 'long':
      for (let y = 14; y < 60; y++) { const w = y < 30 ? 15 : 15 + Math.min(3, (y - 30) / 6); r(cx - w - 2, y, 6, 1, hr); r(cx + w - 3, y, 6, 1, hrD); }
      r(cx - 16, 20, 1, 30, hrL); r(cx - 15, 24, 1, 18, hrLL); r(cx + 14, 20, 1, 34, hrDD); r(cx - 13, 22, 1, 36, hrD);
      capHair(); for (let k = 0; k < 6; k++) { const X = cx - 12 + k * 5; r(X, 18, 4, 2 + (k % 2), hr); r(X + 3, 18, 1, 2, hrD); }
      r(cx - 1, 9, 2, 10, hrD);   // пробор
      break;
    case 'pony':
      ell(cx + 16, 28, 4, 10, hr); ell(cx + 17, 30, 2, 7, hrD); r(cx + 13, 18, 4, 3, '#d83a5a'); capHair(); bangs(); break;
    case 'bun':
      ell(cx, 6, 7, 5, hr); ell(cx - 2, 5, 3, 2, hrL); r(cx + 3, 7, 3, 2, hrD); r(cx - 6, 10, 12, 1, '#d83a5a'); capHair(); bangs(); break;
    case 'curly': {
      const rn = seeded(7 + (L._id || 1));
      ell(cx - 16, 26, 5, 9, hrD); ell(cx + 16, 26, 5, 9, hrD); ell(cx - 16, 24, 4, 7, hr); ell(cx + 16, 24, 4, 7, hrD);
      ell(cx, 11, 19, 10, hr);
      for (let k = 0; k < 22; k++) { const a = rn() * Math.PI, X = cx + Math.cos(a) * 18, Y = 11 - Math.sin(a) * 9; ell(X, Y, 3, 3, hr); }
      for (let k = 0; k < 7; k++) ell(cx - 12 + k * 4, 20 + (k % 2), 2.5, 2, hr);
      for (let y = 2; y < 22; y++) { const w = Math.round(19 * Math.sqrt(Math.max(0, 1 - ((y - 11) / 10) ** 2))); r(cx + Math.round(w * 0.4), y, w - Math.round(w * 0.4), 1, hrD); }
      for (let k = 0; k < 34; k++) { const X = cx - 17 + rn() * 34, Y = 3 + rn() * 17; r(X, Y, 2, 1, rn() < 0.55 ? hrL : hrDD); r(X + 1, Y + 1, 1, 1, hrDD); }
      ell(cx - 6, 6, 5, 2, hrL);
      break;
    }
    case 'mohawk':
      for (let y = 9; y < 20; y++) { const w = hwH(y); if (w >= 0) for (let X = cx - w; X <= cx + w; X++) if ((X + y) % 3 === 0) r(X, y, 1, 1, skDD); }
      for (let y = 0; y < 20; y++) { const w = 4 - Math.max(0, (y - 14)); r(cx - w, y, w * 2 + 1, 1, hr); r(cx + 1, y, w, 1, hrD); r(cx - w, y, 1, 1, hrL); }
      for (let y = 1; y < 16; y += 3) r(cx - 2, y, 1, 2, hrLL);
      break;
    case 'bald':
      ell(cx - 5, 15, 3, 2, skL); r(cx - 6, 14, 2, 1, '#ffffff');
      r(cx - 14, 20, 3, 8, hr); r(cx + 12, 20, 3, 8, hrD); r(cx - 14, 20, 1, 8, hrL);
      break;
    case 'cap': {
      const cp = L.cap || '#b03a3a', cpL = shade(cp, 0.25), cpD = shade(cp, -0.3);
      r(cx - 14, 19, 3, 7, hr); r(cx + 12, 19, 3, 7, hrD);
      for (let y = 4; y <= 18; y++) { const w = hwH(y + 2) + 1; if (w > 0) row(y, cx - w, cx + w, cp); }
      for (let y = 4; y <= 18; y++) { const w = hwH(y + 2) + 1; if (w > 0) r(cx + Math.round(w * 0.4), y, w - Math.round(w * 0.4) + 1, 1, cpD); }
      ell(cx - 5, 8, 4, 1.5, cpL); r(cx - 6, 11, 13, 6, '#f4f0e4'); r(cx - 6, 11, 13, 1, '#ffffff'); r(cx - 3, 12, 7, 4, cpD); r(cx - 2, 13, 2, 1, '#f4f0e4');
      r(cx, 3, 2, 2, cpD);
      for (let y = 18; y <= 21; y++) row(y, cx - 15 + (y - 18), cx + 15 - (y - 18), y === 21 ? shade(cp, -0.5) : cpD);
      row(18, cx - 15, cx + 15, cpL);
      fx.fillStyle = 'rgba(40,20,20,0.25)'; fx.fillRect(cx - 12, 22, 25, 3);
      break;
    }
    case 'cowboy': {
      const ht = L.hat || '#8a5a30', htL = shade(ht, 0.25), htD = shade(ht, -0.3);
      capHair(); bangs();
      for (let y = 1; y <= 14; y++) { const w = 11 - (y < 3 ? 3 - y : 0); row(y, cx - w, cx + w, ht); r(cx + 5, y, w - 4, 1, htD); }
      r(cx - 2, 1, 5, 2, htD); r(cx - 8, 3, 3, 8, htL); row(12, cx - 11, cx + 11, '#3a2418'); row(13, cx - 11, cx + 11, '#5a3a22');
      for (let y = 14; y <= 18; y++) { const k = y - 14, w = 28 - k; row(y, cx - w, cx + w, k > 2 ? htD : ht); }
      r(cx - 29, 12, 3, 3, ht); r(cx + 27, 12, 3, 3, htD); row(14, cx - 26, cx + 26, htL);
      fx.fillStyle = 'rgba(40,20,10,0.3)'; fx.fillRect(cx - 13, 19, 27, 5);
      break;
    }
    case 'hood':
      for (let y = 4; y <= 50; y++) { const t = (y - 26) / 24, w = Math.round(20 * Math.sqrt(Math.max(0, 1 - t * t))); if (w > 0) { row(y, cx - w, cx - w + 5, C); row(y, cx + w - 5, cx + w, CD); } }
      for (let y = 4; y <= 14; y++) { const t = (y - 26) / 24, w = Math.round(20 * Math.sqrt(Math.max(0, 1 - t * t))); row(y, cx - w, cx + w, C); }
      ell(cx - 6, 8, 6, 2, CL); r(cx - 13, 14, 27, 4, CDD); fx.fillStyle = 'rgba(10,6,16,0.45)'; fx.fillRect(cx - 13, 18, 27, 6);
      break;
  }
  if (L.chef) {
    ell(cx, 4, 13, 7, '#fbfaf6'); ell(cx - 8, 7, 6, 5, '#fbfaf6'); ell(cx + 8, 7, 6, 5, '#ece8e0'); ell(cx - 3, 2, 4, 2, '#ffffff');
    r(cx - 4, 7, 1, 6, '#dcd8d0'); r(cx + 4, 7, 1, 6, '#dcd8d0');
    for (let y = 11; y <= 16; y++) row(y, cx - 13, cx + 13, y > 14 ? '#d0ccc4' : '#ece8e0');
    row(11, cx - 13, cx + 13, '#ffffff');
  }

  outlineAuto(f);
  if (!withBg) return f;
  // фон
  const bg = L.ghost ? ['#2a2238', '#4a3a58'] : PORTRAIT_BG[(L._id || 0) % PORTRAIT_BG.length];
  const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 64; i += 8) x.fillRect(i, 0, 4, 64);
  x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, 56, 64, 8);
  x.drawImage(f, 0, 0);
  return c;
}

function mix(a, b, k) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
