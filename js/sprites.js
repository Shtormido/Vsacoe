// Пиксель-арт: всё рисуется процедурно прямоугольниками
const W = 320, H = 180;

function R(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const HAIRS = ['#2b1d0e', '#6a4e23', '#b5651d', '#d9c27a', '#999', '#111', '#7a2d14'];
const SHIRTS = ['#3a6ea5', '#a83232', '#4f8a3a', '#7b4fa0', '#c9a227', '#3d3d3d', '#2f8f8f', '#b0603a', '#e0e0e0'];
const PANTS = ['#2d3b55', '#3b2a1e', '#333', '#4a4a6a', '#5b4a2e'];
function randomLook() {
  return { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), pants: pick(PANTS), hat: chance(0.25) ? pick(['#7a5230', '#333', '#a83232']) : null };
}

// Персонаж: (x, y) — точка под ногами
function drawChar(ctx, x, y, look, dir = 'down', frame = 0, opts = {}) {
  x = Math.round(x); y = Math.round(y);
  ctx.globalAlpha = opts.alpha ?? 1;
  R(ctx, x - 5, y - 1, 10, 2, 'rgba(0,0,0,.35)');
  const step = frame % 2 === 1;
  // ноги
  R(ctx, x - 3, y - 5, 2, step ? 4 : 5, look.pants);
  R(ctx, x + 1, y - 5, 2, step ? 5 : 4, look.pants);
  R(ctx, x - 3, y - 1, 2, 1, '#1a1a1a'); R(ctx, x + 1, y - 1, 2, 1, '#1a1a1a');
  // тело
  R(ctx, x - 4, y - 11, 8, 6, look.shirt);
  if (look.apron) R(ctx, x - 3, y - 10, 6, 6, '#eee');
  // руки
  const armC = look.shirt;
  if (dir === 'left' || dir === 'right') {
    R(ctx, x + (dir === 'left' ? 1 : -2), y - 10, 2, 5, armC);
    R(ctx, x + (dir === 'left' ? 1 : -2), y - 6, 2, 1, look.skin);
  } else {
    R(ctx, x - 5, y - 10 + (step ? 1 : 0), 1, 5, armC); R(ctx, x + 4, y - 10 + (step ? 0 : 1), 1, 5, armC);
    R(ctx, x - 5, y - 6 + (step ? 1 : 0), 1, 1, look.skin); R(ctx, x + 4, y - 6 + (step ? 0 : 1), 1, 1, look.skin);
  }
  // голова
  R(ctx, x - 3, y - 17, 6, 6, look.skin);
  R(ctx, x - 3, y - 18, 6, 2, look.hair);
  if (dir === 'up') R(ctx, x - 3, y - 17, 6, 4, look.hair);
  else if (dir === 'left') { R(ctx, x + 1, y - 17, 2, 3, look.hair); R(ctx, x - 2, y - 15, 1, 1, '#111'); }
  else if (dir === 'right') { R(ctx, x - 3, y - 17, 2, 3, look.hair); R(ctx, x + 1, y - 15, 1, 1, '#111'); }
  else { R(ctx, x - 2, y - 15, 1, 1, '#111'); R(ctx, x + 1, y - 15, 1, 1, '#111'); }
  if (look.hat) { R(ctx, x - 4, y - 19, 8, 2, look.hat); R(ctx, x - 3, y - 21, 6, 2, look.hat); }
  if (look.chefHat) { R(ctx, x - 3, y - 22, 6, 4, '#fff'); R(ctx, x - 4, y - 19, 8, 1, '#ddd'); }
  ctx.globalAlpha = 1;
}

// ---------- Закусочная ----------
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
  bounds: { x1: 10, x2: 310, y1: 46, y2: 78 },
  door: { x: 160, y: 182 }
};

function sky(time) {
  const h = time / 60;
  if (h < 5 || h >= 22) return '#0b1030';
  if (h < 7) return '#5a4a7a';
  if (h < 18) return '#8fc4e8';
  if (h < 20) return '#e89a5a';
  return '#3a2a5a';
}

function buildDinerBG() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  // стена кухни
  R(x, 0, 0, W, 40, '#c9b79c');
  for (let i = 0; i < W; i += 8) for (let j = 0; j < 40; j += 8) if ((i + j) % 16 === 0) R(x, i, j, 8, 8, '#bfac90');
  R(x, 0, 38, W, 2, '#8a7458');
  // пол кухни — шахматка
  for (let i = 0; i < W; i += 8) for (let j = 40; j < 80; j += 8) R(x, i, j, 8, 8, ((i + j) / 8) % 2 ? '#e8e2d6' : '#b8433a');
  // стойка
  R(x, 0, 80, W, 12, '#7a3b2a'); R(x, 0, 80, W, 3, '#d8d0c0'); R(x, 0, 91, W, 1, '#3a1a12');
  for (let i = 4; i < W; i += 20) R(x, i, 84, 12, 6, '#8e4a36');
  // зал — доски
  for (let j = 92; j < H; j += 6) { R(x, 0, j, W, 6, j % 12 ? '#6e4a2e' : '#7a5434'); R(x, 0, j + 5, W, 1, '#4e321e'); }
  for (let j = 92; j < H; j += 6) for (let i = (j % 12) * 3; i < W; i += 36) R(x, i, j, 1, 5, '#4e321e');
  // табуреты
  DINER.seats.forEach(s => { R(x, s - 4, 98, 8, 3, '#c0392b'); R(x, s - 1, 101, 2, 6, '#888'); R(x, s - 3, 106, 6, 1, '#555'); });
  // кабинки
  [[20, 130], [110, 130], [230, 130]].forEach(([bx, by]) => {
    R(x, bx, by, 60, 6, '#a83232'); R(x, bx, by + 24, 60, 6, '#a83232');
    R(x, bx + 8, by + 8, 44, 14, '#d8d0c0'); R(x, bx + 8, by + 20, 44, 2, '#999');
    R(x, bx + 14, by + 11, 6, 4, '#c9a227'); R(x, bx + 38, by + 12, 4, 4, '#a83232');
  });
  // дверь
  R(x, 148, 172, 24, 8, '#3a2a1a'); R(x, 150, 172, 20, 8, '#8fc4e8'); R(x, 159, 172, 2, 8, '#3a2a1a');
  // музыкальный автомат
  R(x, 296, 104, 18, 22, '#7b4fa0'); R(x, 298, 106, 14, 8, '#e8a33d'); R(x, 300, 116, 10, 6, '#333');
  // растение
  R(x, 6, 104, 10, 8, '#7a3b2a'); R(x, 4, 96, 14, 9, '#3f7a35'); R(x, 8, 92, 6, 5, '#4f8a3a');
  return c;
}

function drawStation(x, st, state, t) {
  const sx = st.x, y = 12;
  switch (st.id) {
    case 'fridge':
      R(x, sx, 4, st.w, 34, '#cfd8dc'); R(x, sx, 20, st.w, 1, '#90a4ae'); R(x, sx + st.w - 4, 9, 2, 8, '#607d8b'); R(x, sx + st.w - 4, 24, 2, 8, '#607d8b');
      break;
    case 'grill':
    case 'spit':
    case 'fryer': {
      const broken = state.broken;
      const body = st.id === 'fryer' ? '#9e9e9e' : '#555';
      R(x, sx, y + 8, st.w, 18, body); R(x, sx, y + 8, st.w, 2, '#777');
      if (st.id === 'spit') {
        R(x, sx + 11, y - 6, 4, 22, '#999');
        R(x, sx + 7, y - 2, 12, 14, state.slots.some(s => s) ? '#b5651d' : '#5a3a1e');
        R(x, sx + 7, y + (t * 8 | 0) % 12 - 2, 12, 1, '#8b4513');
      } else if (st.id === 'grill') {
        R(x, sx + 2, y + 6, st.w - 4, 4, '#222');
        for (let i = 4; i < st.w - 4; i += 4) R(x, sx + i, y + 6, 1, 4, '#444');
      } else {
        R(x, sx + 3, y + 5, st.w - 6, 5, '#d4a017');
        if (state.slots.some(s => s)) for (let i = 0; i < 4; i++) R(x, sx + 4 + ((t * 30 + i * 7) % (st.w - 8)), y + 5 + (i % 2), 1, 1, '#fff6c0');
      }
      // слоты
      const n = state.slots.length;
      state.slots.forEach((s, i) => {
        const px = sx + 3 + i * ((st.w - 6) / n), pw = (st.w - 6) / n - 2;
        if (!s) return;
        let col = s.done ? (s.burnt ? '#222' : '#e8a33d') : '#c0703a';
        if (s.meat === 'special') col = s.done && !s.burnt ? '#c33' : '#8e1b1b';
        R(x, px, y + 18, pw, 4, col);
        if (!s.done) { R(x, px, y + 24, pw, 2, '#000'); R(x, px, y + 24, pw * clamp(s.t / s.total, 0, 1), 2, '#6fbf5a'); }
        else if (!s.burnt) { R(x, px, y + 24, pw, 2, '#000'); R(x, px, y + 24, pw * clamp(1 - s.over / 10, 0, 1), 2, '#d6453d'); }
        if (!s.done || !s.burnt) for (let k = 0; k < 2; k++) R(x, px + 2 + k * 3, y + 12 - ((t * 10 + k * 5) % 8), 1, 2, 'rgba(255,255,255,.5)');
      });
      if (broken) { R(x, sx + st.w / 2 - 4, y - 4, 8, 8, '#d6453d'); R(x, sx + st.w / 2 - 1, y - 2, 2, 3, '#fff'); R(x, sx + st.w / 2 - 1, y + 2, 2, 1, '#fff'); }
      break;
    }
    case 'drinks':
      R(x, sx, 6, st.w, 32, '#a83232'); R(x, sx + 3, 9, st.w - 6, 10, '#222');
      ['#5a2a14', '#e8761c', '#8fc4e8', '#9c6b30', '#3a2414'].forEach((c, i) => R(x, sx + 4 + i * 5, 11, 3, 6, c));
      R(x, sx + 3, 24, st.w - 6, 2, '#ccc');
      break;
    case 'trash':
      R(x, sx, 22, st.w, 16, '#4a6a4a'); R(x, sx - 1, 20, st.w + 2, 3, '#3a5a3a');
      break;
    case 'board':
      R(x, sx, 6, st.w, 22, '#6b4a2e'); R(x, sx + 2, 8, st.w - 4, 18, '#2a3a2a');
      for (let i = 0; i < 4; i++) R(x, sx + 4, 11 + i * 4, st.w - 8 - (i * 3) % 7, 1, '#ddd');
      break;
    case 'backdoor':
      R(x, sx, 4, st.w, 36, '#4a3020'); R(x, sx + 2, 6, st.w - 4, 34, '#6b4a2e'); R(x, sx + st.w - 6, 22, 2, 2, '#e8a33d');
      break;
  }
}

// ---------- Мотель ночью ----------
const MOTEL = {
  doors: [0, 1, 2, 3, 4, 5].map(i => ({ x: 24 + i * 50, y: 40 })),
  start: { x: 50, y: 150 },
  hatch: { x: 160, y: 66 },
  bounds: { x1: 6, x2: 314, y1: 46, y2: 92 }
};
function buildMotelBG() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  R(x, 0, 0, W, 42, '#4a3a4a');
  for (let i = 0; i < W; i += 12) R(x, i, 0, 1, 42, '#3a2a3a');
  R(x, 0, 40, W, 2, '#2a1a2a');
  MOTEL.doors.forEach((d, i) => {
    R(x, d.x - 8, 14, 16, 26, '#5a3a22'); R(x, d.x - 7, 15, 14, 25, '#7a5232');
    R(x, d.x + 4, 28, 2, 2, '#e8a33d');
    R(x, d.x - 3, 18, 6, 5, '#c9a227'); R(x, d.x - 1, 19, 2, 3, '#3a2a1a');
    R(x, d.x + 12, 18, 12, 10, '#1a2a4a'); R(x, d.x + 17, 18, 1, 10, '#333');
  });
  // коридор
  for (let i = 0; i < W; i += 8) for (let j = 42; j < 98; j += 8) R(x, i, j, 8, 8, ((i + j) / 8) % 2 ? '#5a1e24' : '#4e1a20');
  for (let i = 4; i < W; i += 16) R(x, i, 68, 4, 2, '#7a3a30');
  // нижняя стена с проходами
  R(x, 0, 98, W, 6, '#4a3a4a'); R(x, 20, 98, 40, 6, '#4e1a20'); R(x, 210, 98, 30, 6, '#3a3a3a');
  // офис
  R(x, 0, 104, 128, 76, '#6b5a3a');
  for (let j = 104; j < H; j += 8) R(x, 0, j, 128, 1, '#5a4a2e');
  R(x, 128, 104, 3, 76, '#4a3a4a');
  R(x, 70, 120, 40, 14, '#5a3a22'); R(x, 70, 120, 40, 2, '#7a5232'); R(x, 82, 123, 10, 7, '#e8e2d6'); R(x, 87, 123, 1, 7, '#999');
  R(x, 10, 110, 22, 16, '#3a2a1a'); for (let i = 0; i < 6; i++) R(x, 13 + (i % 3) * 6, 113 + Math.floor(i / 3) * 7, 2, 4, '#c9a227');
  // парковка
  R(x, 131, 104, W - 131, 76, '#3a3a3e');
  for (let i = 150; i < W; i += 36) R(x, i, 140, 2, 40, '#d8d0c0');
  return c;
}
const CAR_COLORS = ['#a83232', '#3a6ea5', '#c9a227', '#4f8a3a', '#7b4fa0', '#ddd'];
function drawCar(x, cx, cy, col) {
  R(x, cx, cy, 26, 14, col); R(x, cx + 5, cy - 6, 16, 7, col); R(x, cx + 7, cy - 5, 12, 5, '#8fc4e8');
  R(x, cx + 2, cy + 12, 6, 4, '#111'); R(x, cx + 18, cy + 12, 6, 4, '#111'); R(x, cx + 24, cy + 3, 2, 3, '#ffeb99');
}
function drawSign(x, t) {
  const on = Math.sin(t * 3) > -0.6;
  R(x, 270, 106, 46, 14, '#222');
  const c = on ? '#ff4a6a' : '#5a2a32';
  // «МОТЕЛЬ» упрощённые буквы-полоски
  for (let i = 0; i < 6; i++) { R(x, 273 + i * 7, 109, 5, 1, c); R(x, 273 + i * 7, 109, 1, 8, c); R(x, 277 + i * 7, 109, 1, 8, c); R(x, 273 + i * 7, 116, 5, 1, c); }
}
