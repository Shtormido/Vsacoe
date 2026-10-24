// Закусочная: фон, станции, мебель (координаты станций — в единицах мира)
const DINER = {
  stations: [
    { id: 'fridge', x: 10,  w: 26, label: 'Холодильник' },
    { id: 'grill',  x: 46,  w: 40, label: 'Гриль' },
    { id: 'spit',   x: 96,  w: 26, label: 'Вертел шаурмы' },
    { id: 'fryer',  x: 132, w: 34, label: 'Фритюр' },
    { id: 'drinks', x: 176, w: 30, label: 'Напитки' },
    { id: 'trash',  x: 216, w: 16, label: 'Мусор' },
    { id: 'board',  x: 244, w: 30, label: 'Доска заказов' },
    { id: 'backdoor', x: 284, w: 24, label: 'Чёрный ход' }
  ],
  seats: [40, 92, 144, 196, 248],
  seatY: 110, aisleY: 121,
  booths: [[12, 62], [84, 138], [182, 236], [250, 300]],
  bounds: { x1: 10, x2: 310, y1: 46, y2: 78 },
  door: { x: 160, y: 186 },
  panes: [[36, 112], [118, 194], [200, 276], [364, 440], [446, 522], [528, 604]],
  fans: [[200, 262], [440, 262]]
};

function wallSh(ctx, x, y1, y2, a = 0.2) {
  ctx.fillStyle = SHADOW_COL + a + ')'; ctx.fillRect(Math.round(x), y1, 3, y2 - y1);
  ctx.fillStyle = SHADOW_COL + (a * 0.45) + ')'; ctx.fillRect(Math.round(x) + 3, y1 + 2, 2, y2 - y1 - 2);
}

function buildDinerBG() {
  const [c, x] = makeCanvas(PW, PH);
  const rn = seeded(7);
  const r = (X, Y, w, h, col) => R(x, X, Y, w, h, col);

  // ---- задняя стена ----
  r(0, 0, PW, 80, '#ead8b2');
  for (let i = 0; i < PW; i += 16) { r(i, 8, 5, 48, '#e0cca2'); r(i + 5, 8, 1, 48, '#f2e4c4'); }
  for (let i = 8; i < PW; i += 16) for (let j = 16; j < 56; j += 12) { r(i + 2, j, 2, 2, '#d4b888'); }
  r(0, 0, PW, 8, '#6a3e28'); r(0, 6, PW, 1, '#8a5a3a'); r(0, 7, PW, 1, '#3a2018');
  // плитка-кабанчик
  r(0, 56, PW, 20, '#cfc8bc');
  for (let j = 56; j < 76; j += 5) for (let i = (j / 5 % 2) * 6; i < PW; i += 12) { r(i, j, 11, 4, '#f2eee6'); r(i, j, 11, 1, '#ffffff'); }
  r(0, 55, PW, 1, '#b8ac98');
  r(0, 76, PW, 4, '#6a3e28'); r(0, 76, PW, 1, '#8a5a3a');

  // декор на стене: номерные знаки, фото шоссе
  [[478, 60, '#e8e4dc', '#2a5aa0'], [452, 62, '#f0d040', '#2a2a2a']].forEach(([X, Y, bg, fg]) => {
    r(X - 1, Y - 1, 22, 12, '#3a2a20'); r(X, Y, 20, 10, bg); r(X + 2, Y + 3, 16, 3, fg); r(X + 1, Y + 1, 2, 1, fg);
  });
  // полка с банками над фритюром
  r(258, 22, 84, 3, '#7a4a2e'); r(258, 25, 84, 1, '#4a2a1a'); r(262, 25, 2, 6, '#5a3a22'); r(334, 25, 2, 6, '#5a3a22');
  ['#d83a3a', '#f0c030', '#5aa83a', '#e8e4dc', '#a86232', '#d83a3a'].forEach((col, i) => {
    const X = 264 + i * 12; r(X, 12, 8, 10, col); r(X, 11, 8, 2, '#c8ccd4'); r(X + 1, 13, 2, 7, shade(col, 0.35)); r(X + 7, 13, 1, 9, shade(col, -0.3));
  });
  // вытяжка над грилем и вертелом
  r(86, 8, 166, 4, '#7a7e88');
  x.fillStyle = '#b8bcc6'; x.beginPath(); x.moveTo(92, 12); x.lineTo(246, 12); x.lineTo(252, 34); x.lineTo(86, 34); x.closePath(); x.fill();
  r(86, 34, 166, 4, '#8a8e98'); r(86, 37, 166, 1, '#5a5e66');
  for (let i = 100; i < 240; i += 10) r(i, 18, 6, 1, '#8a8e98');
  r(96, 14, 60, 1, '#e4e8f0');

  // ---- пол кухни ----
  for (let j = 80; j < 160; j += 16) for (let i = 0; i < PW; i += 16) {
    const red = ((i + j) / 16) % 2;
    const base = red ? '#b8443a' : '#ece4d2';
    r(i, j, 16, 16, base); r(i, j, 16, 1, shade(base, 0.15)); r(i, j, 1, 16, shade(base, 0.1));
    r(i + 15, j, 1, 16, shade(base, -0.12)); r(i, j + 15, 16, 1, shade(base, -0.15));
    if (rn() < 0.3) r(i + rint(2, 12), j + rint(2, 12), 2, 1, shade(base, -0.08));
  }
  const fl = x.createLinearGradient(0, 80, 0, 92); fl.addColorStop(0, 'rgba(40,20,20,.35)'); fl.addColorStop(1, 'rgba(40,20,20,0)');
  x.fillStyle = fl; x.fillRect(0, 80, PW, 12);

  // ---- пол зала: доски ----
  const tones = ['#8e5c36', '#966440', '#86562f', '#9c6c44'];
  for (let j = 184; j < 344; j += 10) {
    let i = -rint(0, 40);
    while (i < PW) {
      const len = rint(48, 110), col = pick(tones);
      r(i, j, len, 10, col); r(i, j, len, 1, shade(col, 0.18)); r(i, j + 9, len, 1, '#5a3820'); r(i + len - 1, j, 1, 10, '#5a3820');
      for (let g = 0; g < 2; g++) r(i + rint(4, len - 20), j + rint(3, 7), rint(8, 18), 1, shade(col, -0.1));
      if (rn() < 0.25) { const kx = i + rint(6, len - 8); r(kx, j + 4, 3, 2, shade(col, -0.25)); }
      r(i + 3, j + 5, 1, 1, '#4a2e18'); r(i + len - 5, j + 5, 1, 1, '#4a2e18');
      i += len;
    }
  }
  // дорожка от двери
  r(296, 300, 48, 44, '#7a2a2a'); r(298, 302, 44, 40, '#9a3a34');
  for (let j = 306; j < 340; j += 8) r(302, j, 36, 2, '#b8584a');

  // ---- нижняя стена и дверь ----
  r(0, 344, PW, 16, '#6a3e28'); r(0, 344, PW, 2, '#8a5a3a');
  r(296, 344, 48, 16, '#3a2418'); r(300, 346, 18, 14, '#9ad0e8'); r(322, 346, 18, 14, '#9ad0e8'); r(302, 347, 4, 8, '#d8f0fc'); r(324, 347, 4, 8, '#d8f0fc');
  r(296, 340, 48, 4, '#5a3a22');
  DINER.panes.forEach(([a, b]) => { r(a - 3, 344, b - a + 6, 16, '#4a2a1c'); r(a - 3, 344, b - a + 6, 1, '#9a6a44'); });
  [[30, 282], [358, 610]].forEach(([a, b]) => {   // шторы
    [a - 4, b - 6].forEach(cx => { r(cx, 342, 10, 18, '#9a2a2a'); r(cx + 2, 342, 1, 18, '#c84a40'); r(cx + 6, 342, 1, 18, '#6a1a1a'); r(cx - 1, 340, 12, 3, '#c8a050'); });
  });

  // ---- стойка ----
  r(0, 160, PW, 8, '#ebe6dc');
  for (let i = 0; i < 260; i++) r(rint(0, PW), rint(160, 166), 1, 1, pick(['#d8d0c4', '#c8c0b4', '#f8f4ee']));
  r(0, 160, PW, 1, '#fffcf6'); r(0, 166, PW, 2, '#c8ccd6'); r(0, 166, PW, 1, '#f0f4fa');
  r(0, 168, PW, 14, '#b03434');
  for (let i = 0; i < PW; i += 40) { r(i, 168, 2, 14, '#d8dce4'); r(i + 2, 168, 1, 14, '#808490'); r(i + 3, 169, 36, 1, '#c84a46'); }
  r(0, 175, PW, 1, '#d8dce4'); r(0, 182, PW, 2, '#4a1a18');
  contactShadow(x, -4, 184, PW + 4, 0.42);
  // предметы на стойке
  const sh = (X, Y, w, h, a = 0.26) => { x.fillStyle = SHADOW_COL + a + ')'; x.fillRect(X, Y, w, h); };
  const nap = X => { sh(X + 10, 152, 3, 8); sh(X + 2, 160, 10, 1, 0.2); r(X, 150, 10, 10, '#c8ccd6'); r(X + 1, 151, 8, 2, '#f8f8f8'); r(X + 9, 150, 1, 10, '#8a8e98'); };
  const sauce = (X, col) => { sh(X + 4, 150, 2, 10); r(X, 148, 4, 12, col); r(X + 1, 146, 2, 2, col); r(X + 1, 149, 1, 9, shade(col, 0.3)); };
  nap(130); nap(338); nap(442); sauce(230, '#d83030'); sauce(236, '#f0c030'); sauce(546, '#d83030'); sauce(552, '#f0c030');
  // витрина с пирогом
  r(14, 150, 30, 10, '#e8e4dc'); x.fillStyle = 'rgba(200,230,250,.55)'; x.beginPath(); x.ellipse(29, 150, 14, 10, 0, Math.PI, 0); x.fill();
  r(20, 146, 18, 4, '#d8963a'); r(20, 146, 18, 1, '#f0b860'); r(28, 146, 2, 4, '#c83a5a');
  // касса
  sh(624, 142, 4, 18); sh(592, 160, 34, 1, 0.2);
  r(588, 140, 36, 20, '#7a7e88'); r(588, 140, 36, 3, '#a8acb6'); r(592, 132, 28, 10, '#4a4e58'); r(594, 134, 24, 5, '#5ad05a');
  for (let i = 0; i < 4; i++) r(592 + i * 8, 146, 6, 3, '#e8e4dc');

  // ---- табуреты: ножки (подушки — в динамике) ----
  DINER.seats.forEach(s => {
    const X = s * S;
    shadow(x, X, 225, 9, 3, 0.3);
    r(X - 2, 210, 4, 13, '#a8acb6'); r(X - 2, 210, 1, 13, '#e4e8f0'); r(X + 1, 210, 1, 13, '#6a6e78');
    r(X - 7, 222, 14, 2, '#8a8e98');
  });

  // ---- кабинки ----
  DINER.booths.forEach(([a, b]) => {
    const X = a * S, w = (b - a) * S;
    const seat = (Y, back) => {
      r(X, Y, w, back ? 14 : 12, '#b83a3a'); r(X, Y, w, 2, '#d85a50'); r(X, Y + (back ? 12 : 10), w, 2, '#7a2222');
      for (let i = X + 8; i < X + w - 4; i += 14) { r(i, Y + 5, 2, 2, '#8a2828'); r(i, Y + 4, 1, 1, '#e87a6a'); }
      r(X - 2, Y, 2, back ? 14 : 12, '#c8ccd6'); r(X + w, Y, 2, back ? 14 : 12, '#8a8e98');
    };
    seat(258, true);
    contactShadow(x, X, 272, w, 0.3);
    boxShadow(x, X + 8, 278, w - 16, 21, 0.26, 4);
    r(X + 8, 274, w - 16, 22, '#f2eee6'); r(X + 8, 274, w - 16, 2, '#ffffff'); r(X + 8, 294, w - 16, 2, '#c8ccd6'); r(X + 8, 296, w - 16, 1, '#8a8e98');
    for (let i = 0; i < 12; i++) r(X + 10 + rint(0, w - 22), 277 + rint(0, 16), 1, 1, '#d8d0c4');
    // на столе
    r(X + 14, 278, 6, 8, '#c8ccd6'); r(X + 15, 279, 4, 2, '#fff');
    r(X + 24, 278, 3, 7, '#d83030'); r(X + 28, 278, 3, 7, '#f0c030');
    if (w > 90) { r(X + w - 30, 280, 14, 9, '#ffffff'); r(X + w - 28, 282, 10, 5, '#e8e4dc'); r(X + w - 26, 283, 3, 2, '#d8963a'); }
    boxShadow(x, X, 310, w, 9, 0.26, 3);
    seat(306, false);
  });

  // ---- растение, автомат, вешалка ----
  shadow(x, 16, 238, 11, 4, 0.3);
  r(8, 222, 18, 16, '#a8582e'); r(8, 222, 18, 3, '#c8784a'); r(23, 225, 3, 13, '#7a3a1e');
  [[4, 206, 10, 10], [16, 200, 12, 14], [6, 212, 22, 10], [12, 196, 8, 8]].forEach(([X, Y, w, h], i) => { r(X, Y, w, h, i % 2 ? '#3f8a35' : '#4f9a40'); r(X + 2, Y + 1, 3, 2, '#7ac860'); });
  boxShadow(x, 598, 238, 30, 13, 0.3, 4);
  r(598, 200, 30, 50, '#6a3a8a'); r(598, 200, 30, 4, '#8a5aaa'); r(602, 206, 22, 18, '#f0a040'); r(604, 208, 18, 14, '#ffd880');
  for (let i = 0; i < 5; i++) r(605 + i * 4, 212, 2, 8, ['#d83a3a', '#3f6fb0', '#5aa83a', '#f0c030', '#d870a0'][i]);
  r(602, 228, 22, 14, '#2a1a2a'); for (let i = 0; i < 3; i++) r(604, 230 + i * 4, 18, 2, '#4a3a4a');
  r(596, 200, 2, 50, '#c8ccd6'); r(628, 200, 2, 50, '#c8ccd6');
  return c;
}

// ---------- станции (рисуются каждый кадр) ----------
function drawStation(ctx, st, state, t) {
  const X = st.x * S, w = st.w * S;
  const r = (a, b, c2, d, col) => R(ctx, a, b, c2, d, col);
  const cooking = state.slots && state.slots.some(s => s && !s.burnt);
  switch (st.id) {
    case 'fridge': {
      wallSh(ctx, X + w, 10, 84, 0.24); contactShadow(ctx, X, 86, w);
      r(X, 6, w, 82, '#d8dee6'); r(X, 6, w, 3, '#f4f8fc'); r(X, 6, 3, 82, '#eef2f8'); r(X + w - 3, 6, 3, 82, '#a8b0bc');
      r(X + 2, 40, w - 4, 2, '#8a929e'); r(X + w - 8, 14, 3, 18, '#7a828e'); r(X + w - 8, 48, 3, 26, '#7a828e');
      r(X + 6, 18, 6, 6, '#d83a3a'); r(X + 14, 22, 5, 7, '#f0c030'); r(X + 8, 52, 10, 8, '#ffffff'); r(X + 9, 54, 8, 1, '#8a8a8a'); r(X + 9, 56, 6, 1, '#8a8a8a');
      r(X + 2, 84, w - 4, 4, '#6a727e');
      break;
    }
    case 'grill': {
      wallSh(ctx, X + w, 50, 84); contactShadow(ctx, X, 84, w);
      r(X, 46, w, 16, '#3a3a42'); r(X, 46, w, 2, '#7a7a86'); r(X + 2, 48, w - 4, 1, '#55555e');
      r(X, 62, w, 22, '#a0a4ae'); r(X, 62, w, 2, '#d8dce4'); r(X, 82, w, 2, '#6a6e78');
      for (let i = 0; i < 4; i++) { const kx = X + 10 + i * (w - 20) / 3; r(kx - 3, 70, 6, 6, '#2a2a30'); r(kx - 1, 70, 2, 3, '#d8dce4'); }
      if (cooking) { const f = (Math.sin(t * 12) + 1) / 2; r(X + 4, 63, w - 8, 2, `rgb(255,${120 + f * 80 | 0},40)`); glow(ctx, X + w / 2, 58, 34, 'rgba(255,140,60,A)', 0.18 + f * 0.08); }
      break;
    }
    case 'spit': {
      wallSh(ctx, X + w, 62, 84); wallSh(ctx, X + w / 2 + 2, 12, 60, 0.12); contactShadow(ctx, X, 84, w);
      r(X + 2, 16, 10, 44, '#5a3a2a'); for (let j = 18; j < 58; j += 4) r(X + 3, j, 8, 2, cooking ? `rgb(255,${100 + Math.sin(t * 8 + j) * 40 | 0},40)` : '#7a4a2a');
      if (cooking) glow(ctx, X + 8, 38, 26, 'rgba(255,120,40,A)', 0.25);
      r(X + w / 2 - 1, 10, 3, 54, '#c8ccd6');
      const n = state.slots.filter(Boolean).length, sz = 6 + n * 3;
      for (let j = 0; j < 36; j++) {
        const hw = Math.round(sz - j * (sz - 4) / 36), y = 18 + j;
        const band = ((j + Math.floor(t * 6)) % 6) < 3;
        r(X + w / 2 - hw, y, hw * 2, 1, band ? '#a8602e' : '#8a4a22');
        r(X + w / 2 - hw, y, 2, 1, '#c8803e');
      }
      r(X, 60, w, 24, '#8a8e98'); r(X, 60, w, 2, '#c8ccd6'); r(X + 4, 66, w - 8, 10, '#6a6e78'); r(X + 6, 68, w - 12, 6, '#d8b070');
      break;
    }
    case 'fryer': {
      wallSh(ctx, X + w, 50, 84); contactShadow(ctx, X, 84, w);
      r(X, 48, w, 14, '#8a8e98'); r(X, 48, w, 2, '#c8ccd6');
      const n = state.slots.length, vw = (w - 6) / n;
      state.slots.forEach((s, i) => {
        const vx = X + 3 + i * vw;
        r(vx + 1, 51, vw - 2, 9, '#2a2a2e'); r(vx + 2, 52, vw - 4, 7, '#d8a020');
        if (s && !s.done) for (let k = 0; k < 3; k++) r(vx + 3 + ((t * 20 + k * 9 + i * 5) % (vw - 7)), 53 + (k % 2) * 3, 2, 2, '#fff2b0');
        if (s) { const col = s.burnt ? '#3a2a1a' : s.dish === 'fries' ? '#f0d040' : '#d8a040'; r(vx + 4, 53, vw - 8, 4, col); r(vx + vw / 2 - 1, 44, 2, 8, '#5a5e66'); }
      });
      r(X, 62, w, 22, '#b0b4be'); r(X, 62, w, 2, '#e4e8f0'); r(X, 82, w, 2, '#6a6e78');
      for (let i = 0; i < n; i++) { const kx = X + 8 + i * vw; r(kx, 70, 5, 5, '#2a2a30'); r(kx + 1, 70, 2, 2, '#e05a40'); }
      break;
    }
    case 'drinks': {
      wallSh(ctx, X + w - 2, 19, 60, 0.22); wallSh(ctx, X + w, 62, 84); contactShadow(ctx, X, 84, w);
      r(X + 2, 16, w - 4, 44, '#c03232'); r(X + 2, 16, w - 4, 3, '#e05a50'); r(X + w - 5, 16, 3, 44, '#8a2222');
      r(X + 6, 22, w - 12, 8, '#f4f2ec'); r(X + 8, 24, w - 16, 4, '#c03232');
      ['#3a1a10', '#f08020', '#9ad0e8', '#a8642a', '#5a3a2a'].forEach((col, i) => {
        const tx = X + 7 + i * ((w - 16) / 4); r(tx, 34, 6, 5, col); r(tx + 2, 39, 2, 5, '#c8ccd6');
      });
      r(X + 5, 52, w - 10, 3, '#5a5e66'); for (let i = X + 6; i < X + w - 6; i += 3) r(i, 52, 1, 3, '#8a8e98');
      r(X, 60, w, 24, '#a0a4ae'); r(X, 60, w, 2, '#d8dce4'); r(X, 82, w, 2, '#6a6e78');
      for (let i = 0; i < 3; i++) { r(X + w - 12, 64 + i * 3, 8, 3, '#f4f2ec'); r(X + w - 12, 66 + i * 3, 8, 1, '#c8c4bc'); }
      break;
    }
    case 'trash': {
      wallSh(ctx, X + w, 57, 84, 0.2); contactShadow(ctx, X, 86, w, 0.4);
      r(X + 2, 58, w - 4, 28, '#3f7a4a'); r(X + 2, 58, 3, 28, '#5a9a64'); r(X + w - 5, 58, 3, 28, '#2a5a34');
      r(X, 54, w, 6, '#2f6a3a'); r(X, 54, w, 2, '#5a9a64'); r(X + w / 2 - 3, 51, 6, 3, '#2a5a34');
      for (let j = 64; j < 84; j += 6) r(X + 6, j, w - 12, 1, '#2f6a3a');
      break;
    }
    case 'board': {
      r(X - 2, 10, w + 4, 40, '#7a4a2e'); r(X, 12, w, 36, '#2e3e34'); r(X, 12, w, 1, '#3e5044');
      pText(ctx, 'MENU', X + w / 2 - pTextW('MENU', 1) / 2, 15, '#f4f2ec');
      for (let i = 0; i < 5; i++) { r(X + 4, 23 + i * 5, 22 + (i * 13) % 18, 1, '#d8dcd0'); r(X + w - 12, 23 + i * 5, 7, 1, '#f0d070'); }
      wallSh(ctx, X + w + 2, 13, 50, 0.2); wallSh(ctx, X + w + 4, 58, 84); contactShadow(ctx, X - 4, 84, w + 8);
      r(X - 4, 56, w + 8, 8, '#c8a070'); r(X - 4, 56, w + 8, 1, '#e8c898'); r(X - 4, 64, w + 8, 20, '#8a5a36'); r(X - 4, 82, w + 8, 2, '#4a2e1a');
      r(X, 52, w, 2, '#a8acb6');
      for (let i = 0; i < 4; i++) { r(X + 3 + i * 14, 52, 10, 10, '#fffdf0'); r(X + 5 + i * 14, 55, 6, 1, '#8a8a8a'); r(X + 5 + i * 14, 57, 4, 1, '#8a8a8a'); }
      break;
    }
    case 'backdoor': {
      wallSh(ctx, X + w + 2, 8, 82, 0.18);
      r(X - 2, 6, w + 4, 76, '#4a2c1c'); r(X, 8, w, 74, '#7a4e30'); r(X, 8, 2, 74, '#9a6a44'); r(X + w - 2, 8, 2, 74, '#5a3420');
      r(X + 8, 16, w - 16, 18, '#2a3a4a'); r(X + 10, 18, 4, 8, '#4a6a8a');
      r(X + 6, 42, w - 12, 14, '#6a4228'); r(X + 6, 62, w - 12, 14, '#6a4228');
      r(X + w - 10, 46, 4, 4, '#e0b040');
      r(X + 6, 0, w - 12, 6, '#1a3a22'); pText(ctx, 'EXIT', X + w / 2 - pTextW('EXIT') / 2, 1, '#6aff8a');
      glow(ctx, X + w / 2, 3, 20, 'rgba(80,255,120,A)', 0.2);
      break;
    }
  }
  if (state.broken) {
    const bx = X + w / 2;
    r(bx - 7, 26, 14, 14, '#2a1418'); r(bx - 6, 27, 12, 12, '#d6453d'); r(bx - 1, 29, 2, 5, '#fff'); r(bx - 1, 36, 2, 2, '#fff');
    if (Math.random() < 0.08) Particles.smoke(st.x + st.w / 2, 30);
  }
}

// подушки табуретов поверх сидящих клиентов
function drawStoolTops(ctx) {
  DINER.seats.forEach(s => {
    const X = s * S;
    R(ctx, X - 10, 206, 20, 6, '#c03a3a'); R(ctx, X - 9, 205, 18, 1, '#c03a3a');
    R(ctx, X - 8, 206, 9, 1, '#ea6a5a'); R(ctx, X - 10, 211, 20, 2, '#c8ccd6'); R(ctx, X - 10, 212, 20, 1, '#8a8e98');
  });
}

// тонировка по времени суток
function dayTint(time) {
  const h = time / 60;
  if (h < 10) return ['rgba(255,200,120,1)', 0.08 * (10 - h) / 2];
  if (h < 17) return null;
  if (h < 20) return ['rgba(255,110,40,1)', 0.08 + (h - 17) * 0.05];
  return ['rgba(24,16,64,1)', Math.min(0.6, 0.32 + (h - 20) * 0.07)];
}

// ---------- атмосфера зала ----------
const lerp = (a, b, k) => a + (b - a) * k;
function mixCol(c1, c2, k) { return c1.map((v, i) => Math.round(lerp(v, c2[i], clamp(k, 0, 1)))); }

// параметры солнца по времени: цвет, сила, наклон и длина лучей
function sunInfo(time) {
  const h = time / 60;
  const morning = [255, 222, 160], noon = [255, 246, 220], evening = [255, 140, 70], moon = [120, 150, 255];
  let col, a;
  if (h < 11) { col = mixCol(morning, noon, (h - 8) / 3); a = 0.22; }
  else if (h < 16) { col = noon; a = 0.16; }
  else if (h < 19.5) { col = mixCol(noon, evening, (h - 16) / 3.5); a = 0.16 + (h - 16) * 0.025; }
  else if (h < 21) { col = mixCol(evening, moon, (h - 19.5) / 1.5); a = lerp(0.25, 0.05, (h - 19.5) / 1.5); }
  else { col = moon; a = 0.05; }
  const skew = clamp((h - 13.5) * 16, -90, 90);
  const len = clamp(90 + Math.abs(h - 13.5) * 16, 90, 175);
  return { col, a, skew, len, h };
}

function skyCol(time) {
  const h = time / 60;
  if (h < 9) return ['#f0b090', '#ffd8a8'];
  if (h < 17) return ['#7ab8e8', '#c8e8f8'];
  if (h < 19.5) return ['#e87a50', '#f8c070'];
  if (h < 21) return ['#5a3a7a', '#c86a6a'];
  return ['#0e1430', '#1e2850'];
}

function drawDinerWindows(ctx, time, t) {
  const [c1, c2] = skyCol(time), night = time / 60 >= 21;
  DINER.panes.forEach(([a, b], i) => {
    R(ctx, a, 346, b - a, 13, c1); R(ctx, a, 346, b - a, 4, c2);
    for (let k = 0; k < 3; k++) R(ctx, a + 8 + k * 22 + (i * 7) % 10, 349 + k % 2, 10, 1, 'rgba(255,255,255,0.35)');
    if (night && i % 2) R(ctx, a + 20 + i * 3, 348, 1, 1, '#ffffff');
    R(ctx, a + (b - a) / 2 - 1, 346, 2, 13, '#4a2a1c');
  });
  // неон OPEN в окне
  const open = time < CLOSE_TIME, on = open && (Math.sin(t * 2.3) > -0.85);
  pText(ctx, 'OPEN', 474, 348, on ? '#ff4a5a' : '#5a2228', 2);
  if (on) glow(ctx, 489, 353, 40, 'rgba(255,60,80,A)', time / 60 > 18 ? 0.45 : 0.22);
}

function drawSunbeams(ctx, time) {
  const s = sunInfo(time);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 184, PW, 160); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  DINER.panes.forEach(([a, b]) => {
    const g = ctx.createLinearGradient(0, 344, 0, 344 - s.len);
    g.addColorStop(0, `rgba(${s.col},${s.a})`); g.addColorStop(1, `rgba(${s.col},0)`);
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(a, 344); ctx.lineTo(b, 344); ctx.lineTo(b + s.skew, 344 - s.len); ctx.lineTo(a + s.skew, 344 - s.len); ctx.closePath(); ctx.fill();
    // тень от переплёта
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = SHADOW_COL + '0.05)'; const m = (a + b) / 2;
    ctx.beginPath(); ctx.moveTo(m - 1, 344); ctx.lineTo(m + 1, 344); ctx.lineTo(m + 1 + s.skew, 344 - s.len); ctx.lineTo(m - 1 + s.skew, 344 - s.len); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
  });
  ctx.restore();
  return s;
}

// тени от потолочных вентиляторов
function drawFans(ctx, t) {
  DINER.fans.forEach(([cx, cy], i) => {
    ctx.fillStyle = SHADOW_COL + '0.11)';
    for (let k = 0; k < 4; k++) {
      const a = t * 4.5 + i + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a) * 0.45;
      const px1 = -Math.sin(a) * 5, py1 = Math.cos(a) * 5 * 0.45;
      ctx.beginPath();
      ctx.moveTo(cx + px1 * 0.5, cy + py1 * 0.5); ctx.lineTo(cx + ca * 46 + px1, cy + sa * 46 + py1);
      ctx.lineTo(cx + ca * 46 - px1, cy + sa * 46 - py1); ctx.lineTo(cx - px1 * 0.5, cy - py1 * 0.5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = SHADOW_COL + '0.16)'; ctx.fillRect(cx - 4, cy - 2, 8, 4);
  });
}

// музыкальный автомат: эквалайзер и ноты
function drawJukebox(ctx, t) {
  const cols = ['#ff4a6a', '#ffb040', '#6aff8a', '#4ab0ff', '#d06aff'];
  for (let i = 0; i < 5; i++) {
    const h = 3 + Math.round((Math.sin(t * 7 + i * 1.7) + 1) * 3);
    R(ctx, 605 + i * 4, 220 - h, 2, h, cols[(i + Math.floor(t * 2)) % 5]);
  }
  const hue = cols[Math.floor(t * 1.5) % 5];
  const rgb = parseInt(hue.slice(1), 16);
  glow(ctx, 613, 214, 34, `rgba(${rgb >> 16},${rgb >> 8 & 255},${rgb & 255},A)`, 0.28);
  if (Math.random() < 0.012) Particles.add({ x: 613 / S, y: 198 / S, vx: rnd(-8, 4), vy: rnd(-12, -8), life: 2.2, kind: 'note', col: pick(cols) });
}
