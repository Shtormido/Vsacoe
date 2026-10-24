// Иконки еды и напитков (12×12), котлеты на гриле, машины
const _itemCache = new Map();

function buildItem(dish, meat, burnt) {
  const [c, x] = makeCanvas(14, 14);
  const r = (X, Y, w, h, col) => { x.fillStyle = col; x.fillRect(X + 1, Y + 1, w, h); };
  const patty = burnt ? '#2a1e1a' : meat === 'special' ? '#8e2222' : meat === 'pet' ? '#8a4a24' : '#6a3418';
  const bun = burnt ? '#5a3a20' : '#d8963a', bunL = '#f0b860';
  switch (dish) {
    case 'signature':
    case 'burger':
      r(1, 1, 10, 4, bun); r(2, 0, 8, 1, bun); r(2, 1, 4, 1, bunL);
      r(3, 2, 1, 1, '#fff4d0'); r(6, 1, 1, 1, '#fff4d0'); r(8, 3, 1, 1, '#fff4d0');
      r(0, 5, 12, 1, '#5aa83a'); r(1, 6, 10, 1, '#f0c030'); r(9, 7, 1, 1, '#f0c030');
      r(1, 7, 10, 2, patty); r(1, 7, 10, 1, shade(patty, 0.2));
      r(1, 9, 10, 2, bun); r(1, 10, 10, 1, shade(bun, -0.2));
      if (dish === 'signature') { r(5, -1, 1, 3, '#c8a060'); r(6, -1, 3, 2, '#ffd23a'); r(4, 5, 1, 1, '#d83a3a'); r(7, 5, 1, 1, '#d83a3a'); }
      break;
    case 'shawarma':
      r(3, 0, 6, 3, '#5aa83a'); r(4, 0, 1, 1, '#d83a3a'); r(7, 1, 1, 1, '#d83a3a'); r(5, 1, 2, 2, patty);
      r(2, 2, 8, 9, '#e8c890'); r(2, 2, 2, 9, '#f4dcb0'); r(9, 2, 1, 9, '#c8a060');
      r(2, 6, 8, 5, '#f4f2ec'); r(2, 6, 8, 1, '#c84a3a'); r(9, 6, 1, 5, '#d0ccc4');
      break;
    case 'nuggets':
      r(1, 5, 10, 6, '#d83a3a'); r(1, 5, 10, 1, '#f05a4a'); r(10, 5, 1, 6, '#a82a2a'); r(4, 7, 4, 2, '#ffd23a');
      r(1, 2, 3, 3, '#d8a040'); r(4, 1, 4, 4, '#e8b050'); r(8, 2, 3, 3, '#d8a040'); r(5, 2, 1, 1, '#ffe0a0');
      break;
    case 'fries':
      for (let i = 0; i < 5; i++) r(2 + i * 2, i % 2 ? 0 : 1, 1, 6, i % 2 ? '#ffe070' : '#f0c840');
      r(1, 5, 10, 7, '#d83a3a'); r(1, 5, 10, 1, '#f05a4a'); r(10, 5, 1, 7, '#a82a2a'); r(4, 7, 4, 3, '#ffd23a'); r(5, 8, 2, 1, '#d83a3a');
      break;
    case 'cola': case 'fanta': {
      const cup = dish === 'cola' ? '#c83030' : '#f08020';
      r(7, 0, 1, 3, '#f4f2ec'); r(8, 0, 2, 1, '#f4f2ec');
      r(2, 2, 8, 2, '#f4f2ec'); r(2, 3, 8, 1, '#d0ccc4');
      r(2, 4, 8, 8, cup); r(3, 4, 1, 8, shade(cup, 0.3)); r(9, 4, 1, 8, shade(cup, -0.3)); r(2, 7, 8, 2, '#f4f2ec');
      break;
    }
    case 'water':
      r(5, 0, 2, 2, '#3a7ad0'); r(4, 2, 4, 1, '#bfe4f8'); r(3, 3, 6, 9, '#bfe4f8'); r(4, 3, 1, 9, '#ffffff'); r(8, 3, 1, 9, '#8ac0e0'); r(3, 6, 6, 3, '#3a7ad0');
      break;
    case 'tea':
      r(0, 10, 12, 2, '#e8e4dc'); r(2, 4, 8, 6, '#f4f2ec'); r(3, 4, 6, 1, '#a8642a'); r(10, 5, 2, 3, '#f4f2ec'); r(9, 4, 1, 6, '#d0ccc4');
      r(5, 1, 1, 2, 'rgba(255,255,255,.7)'); r(7, 0, 1, 2, 'rgba(255,255,255,.7)');
      break;
    case 'coffee':
      r(2, 4, 8, 8, '#5a3a2a'); r(3, 4, 1, 8, '#7a5a40'); r(10, 6, 2, 4, '#5a3a2a'); r(3, 4, 6, 1, '#2a1a10');
      r(5, 1, 1, 2, 'rgba(255,255,255,.7)'); r(7, 0, 1, 2, 'rgba(255,255,255,.7)');
      break;
  }
  return outline(c);
}

// nx, ny — центр иконки в пикселях холста
function drawItem(ctx, dish, nx, ny, meat, burnt) {
  const key = dish + (meat || '') + (burnt ? 'b' : '');
  let s = _itemCache.get(key);
  if (!s) { s = buildItem(dish, meat, burnt); _itemCache.set(key, s); }
  ctx.drawImage(s, Math.round(nx - 7), Math.round(ny - 7));
}

// котлета/мясо на гриле: прогресс 0..1 меняет цвет от сырого к готовому
function drawPatty(ctx, nx, ny, w, prog, meat, burnt) {
  const raw = meat === 'special' ? [176, 40, 50] : meat === 'pet' ? [200, 110, 100] : [210, 100, 110];
  const done = meat === 'special' ? [120, 30, 30] : [110, 56, 26];
  const c = burnt ? [36, 28, 26] : raw.map((v, i) => Math.round(v + (done[i] - v) * clamp(prog, 0, 1)));
  const col = `rgb(${c})`;
  R(ctx, nx + 1, ny, w - 2, 1, col); R(ctx, nx, ny + 1, w, 4, col); R(ctx, nx + 1, ny + 5, w - 2, 1, shade('#' + c.map(v => v.toString(16).padStart(2, '0')).join(''), -0.3));
  if (prog > 0.6 && !burnt) for (let i = 2; i < w - 1; i += 3) R(ctx, nx + i, ny + 1, 1, 4, 'rgba(40,20,10,.55)');
  R(ctx, nx + 1, ny + 1, 2, 1, 'rgba(255,255,255,.25)');
}

// маленький индикатор прогресса
function drawBar(ctx, nx, ny, w, v, col) {
  R(ctx, nx - 1, ny - 1, w + 2, 4, '#22141c');
  R(ctx, nx, ny, w, 2, '#4a3a40');
  R(ctx, nx, ny, Math.round(w * clamp(v, 0, 1)), 2, col);
}

const CAR_COLORS = ['#b03a3a', '#3f6fb0', '#d0a030', '#4f8a3a', '#7e56b0', '#e8e4dc', '#2f9a96', '#3a3a44'];
const _carCache = new Map();
function buildCar(col) {
  const [c, x] = makeCanvas(32, 52);
  const r = (X, Y, w, h, cl) => { x.fillStyle = cl; x.fillRect(X + 1, Y + 1, w, h); };
  const L = shade(col, 0.25), D = shade(col, -0.3), glass = '#7ab0cc', glassD = '#4a7090';
  r(1, 7, 2, 8, '#1a1a1e'); r(27, 7, 2, 8, '#1a1a1e'); r(1, 34, 2, 8, '#1a1a1e'); r(27, 34, 2, 8, '#1a1a1e');
  r(3, 2, 24, 46, col); r(4, 1, 22, 1, col); r(4, 48, 22, 1, col);
  r(3, 2, 2, 46, L); r(25, 2, 2, 46, D);
  r(6, 3, 18, 10, L); r(14, 3, 2, 10, col);
  r(5, 13, 20, 7, glass); r(7, 14, 3, 5, '#c8e8f8'); r(5, 19, 20, 1, glassD);
  r(6, 20, 18, 12, shade(col, 0.12)); r(7, 21, 6, 1, shade(col, 0.4));
  r(5, 32, 20, 5, glassD); r(7, 33, 2, 3, glass);
  r(6, 38, 18, 9, col); r(6, 46, 18, 1, D);
  r(0, 15, 3, 3, D); r(27, 15, 3, 3, D);
  r(5, 0, 5, 2, '#fff4c0'); r(20, 0, 5, 2, '#fff4c0');
  r(5, 48, 5, 2, '#d83030'); r(20, 48, 5, 2, '#d83030');
  r(11, 48, 8, 1, '#b8b8c0');
  return outline(c);
}
function drawCar(ctx, nx, ny, col) {
  let s = _carCache.get(col);
  if (!s) { s = buildCar(col); _carCache.set(col, s); }
  boxShadow(ctx, nx + 3, ny + 6, 26, 46, 0.32, 4);
  ctx.drawImage(s, nx, ny);
}

// ---------- иконки ингредиентов (для меню) ----------
function buildIngredient(id) {
  const [c, x] = makeCanvas(14, 14);
  const r = (X, Y, w, h, col) => { x.fillStyle = col; x.fillRect(X + 1, Y + 1, w, h); };
  switch (id) {
    case 'meat':
      r(1, 3, 10, 7, '#d0505a'); r(0, 4, 12, 5, '#d0505a'); r(2, 2, 7, 1, '#d0505a'); r(2, 4, 3, 1, '#f8e0e0'); r(6, 6, 4, 1, '#f8e0e0'); r(3, 8, 2, 1, '#f8e0e0'); r(1, 9, 9, 1, '#a03040'); r(10, 4, 1, 5, '#a03040'); break;
    case 'pet':
      r(0, 3, 12, 8, '#e8d8c0'); r(0, 3, 12, 1, '#fff4e0'); r(1, 4, 10, 6, '#c86a5a'); r(4, 6, 4, 3, '#5a3a2a'); r(3, 4, 1, 1, '#5a3a2a'); r(5, 4, 1, 1, '#5a3a2a'); r(7, 4, 1, 1, '#5a3a2a'); r(9, 5, 1, 1, '#5a3a2a'); break;
    case 'special':
      r(1, 4, 9, 7, '#7a1a1e'); r(0, 5, 11, 5, '#7a1a1e'); r(2, 5, 3, 1, '#b0303a'); r(1, 10, 9, 1, '#4a0a10');
      r(8, 1, 2, 5, '#f4f0e0'); r(7, 0, 2, 2, '#f4f0e0'); r(10, 0, 2, 2, '#f4f0e0'); r(4, 11, 1, 2, '#9a1a22'); r(4, 12, 1, 1, '#c02030'); break;
    case 'buns':
      r(1, 2, 10, 6, '#d8963a'); r(2, 1, 8, 1, '#d8963a'); r(2, 2, 4, 1, '#f0b860'); r(3, 4, 1, 1, '#fff4d0'); r(6, 3, 1, 1, '#fff4d0'); r(8, 5, 1, 1, '#fff4d0');
      r(1, 8, 10, 3, '#c8803a'); r(1, 10, 10, 1, '#a0602a'); break;
    case 'veg':
      r(0, 2, 7, 7, '#5aa83a'); r(1, 1, 5, 1, '#5aa83a'); r(1, 3, 2, 3, '#8ad060'); r(3, 2, 1, 6, '#3a7a2a');
      r(6, 5, 6, 6, '#d83a3a'); r(7, 6, 4, 4, '#f05a4a'); r(8, 7, 2, 2, '#f8d0a0'); break;
    case 'sauce':
      r(4, 0, 3, 2, '#e8e4dc'); r(3, 2, 5, 1, '#e8e4dc'); r(2, 3, 7, 9, '#d02a2a'); r(3, 4, 1, 7, '#f05a4a'); r(8, 3, 1, 9, '#901a1a'); r(3, 6, 5, 3, '#f4f0e0'); r(4, 7, 3, 1, '#d02a2a'); break;
    case 'chicken':
      r(1, 1, 7, 7, '#d8a040'); r(0, 2, 9, 5, '#d8a040'); r(2, 2, 3, 2, '#f0c870'); r(7, 7, 2, 2, '#c08030'); r(8, 8, 2, 3, '#f4f0e0'); r(9, 10, 3, 2, '#f4f0e0'); break;
    case 'potato':
      r(1, 3, 10, 7, '#b88a50'); r(2, 2, 7, 1, '#b88a50'); r(2, 3, 3, 2, '#d8aa70'); r(4, 6, 1, 1, '#7a5a30'); r(8, 4, 1, 1, '#7a5a30'); r(6, 8, 1, 1, '#7a5a30'); r(1, 9, 9, 1, '#8a6a3a'); break;
    case 'blanks':
      r(2, 0, 9, 12, '#f4f0e0'); r(1, 1, 9, 12, '#fffcf0'); for (let j = 3; j < 10; j += 2) r(2, j, 6, 1, '#a8a090'); r(6, 8, 4, 3, '#c02a3a'); r(7, 9, 2, 1, '#f08090'); break;
  }
  return outline(c);
}

// картинка (dataURL) для HTML-меню
const _iconUrl = new Map();
function iconURL(kind, id, meat) {
  const key = kind + id + (meat || '');
  if (!_iconUrl.has(key)) _iconUrl.set(key, (kind === 'dish' ? buildItem(id, meat) : buildIngredient(id)).toDataURL());
  return _iconUrl.get(key);
}
