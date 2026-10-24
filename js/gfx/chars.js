// Персонажи: спрайт 24×36 с контуром, 4 направления × 4 кадра ходьбы
const SKINS = ['#f6cfa5', '#eab88a', '#d39a6a', '#a8704a', '#7a4a30', '#ffe0c0'];
const HAIRS = ['#3a2416', '#6a4428', '#a86232', '#e0c070', '#9a9aa2', '#1e1a22', '#8a2e1a', '#d8d4cc'];
const SHIRTS = ['#3f6fb0', '#b03a3a', '#4f9a44', '#7e56b0', '#d0a030', '#4a4a56', '#2f9a96', '#c0683a', '#e8e4dc', '#d870a0', '#5a7a3a'];
const PANTS = ['#2e3e64', '#4a3424', '#3a3a44', '#55557a', '#6a5a3a', '#2a2a30'];
const STYLES = ['short', 'short', 'long', 'pony', 'bald', 'bun', 'cap', 'mohawk'];

function randomLook() {
  const style = pick(STYLES);
  return {
    skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), pants: pick(PANTS),
    shoes: pick(['#3a2418', '#1e1a1e', '#6a4a30', '#e8e4dc']),
    style, cap: pick(['#b03a3a', '#3f6fb0', '#2a2a30', '#d0a030']),
    beard: style !== 'long' && chance(0.25), glasses: chance(0.15), stripes: chance(0.25)
  };
}
const PLAYER_LOOK = { skin: '#f6cfa5', hair: '#4a2c18', shirt: '#e8e4dc', pants: '#3a3a44', shoes: '#1e1a1e', style: 'short', apron: true, chef: true };
const NIGHT_LOOK = { skin: '#f6cfa5', hair: '#4a2c18', shirt: '#2e2e3e', pants: '#1e1e26', shoes: '#1e1a1e', style: 'cap', cap: '#1e1e26' };
const GHOST_LOOK = { skin: '#d8dce8', hair: '#c8ccd8', shirt: '#b8bccb', pants: '#a8acbb', shoes: '#9a9eac', style: 'long' };

const _charCache = new Map();
let _lookId = 1;

function buildChar(L, dir, frame) {
  const [c, x] = makeCanvas(24, 36);
  const side = dir === 'left' || dir === 'right';
  const bob = frame % 2 ? 1 : 0;
  const y0 = 3 + bob;
  const r = (X, Y, w, h, col) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
  const sk = L.skin, skD = shade(sk, -0.18), hr = L.hair, hrL = shade(hr, 0.25), hrD = shade(hr, -0.25);
  const sh = L.shirt, shL = shade(sh, 0.2), shD = shade(sh, -0.25), pa = L.pants, paD = shade(pa, -0.25);
  const shoe = L.shoes || '#2a1e1a';
  const arm = frame === 1 ? 1 : frame === 3 ? -1 : 0;

  // ---- ноги ----
  if (!side) {
    const l1 = frame === 1 ? 4 : 5, l2 = frame === 3 ? 4 : 5;
    r(8, y0 + 22, 3, l1, pa); r(13, y0 + 22, 3, l2, pa);
    r(10, y0 + 22, 1, l1, paD); r(15, y0 + 22, 1, l2, paD);
    r(8, y0 + 22 + l1, 3, 2, shoe); r(13, y0 + 22 + l2, 3, 2, shoe);
  } else {
    if (frame % 2 === 0) { r(10, y0 + 22, 4, 5, pa); r(13, y0 + 22, 1, 5, paD); r(10, y0 + 27, 5, 2, shoe); }
    else {
      const f = frame === 1;
      r(f ? 7 : 13, y0 + 22, 3, 4, paD); r(f ? 6 : 13, y0 + 26, 4, 2, shade(shoe, -0.2));
      r(f ? 12 : 9, y0 + 22, 3, 5, pa); r(f ? 12 : 9, y0 + 27, 4, 2, shoe);
    }
  }

  // ---- туловище ----
  if (!side) {
    r(7, y0 + 13, 10, 9, sh); r(7, y0 + 13, 1, 9, shL); r(16, y0 + 13, 1, 9, shD);
    if (L.stripes) for (let i = 0; i < 4; i++) r(7, y0 + 14 + i * 2, 10, 1, shD);
    r(7, y0 + 21, 10, 1, paD);
    if (dir === 'down') { r(10, y0 + 13, 4, 1, shL); r(11, y0 + 13, 2, 2, skD); }
    if (L.apron) {
      if (dir === 'down') { r(8, y0 + 15, 8, 9, '#f4f2ec'); r(15, y0 + 15, 1, 9, '#d0ccc4'); r(8, y0 + 13, 1, 2, '#f4f2ec'); r(15, y0 + 13, 1, 2, '#f4f2ec'); r(10, y0 + 18, 4, 2, '#d0ccc4'); }
      else { r(8, y0 + 19, 8, 1, '#f4f2ec'); r(11, y0 + 19, 2, 3, '#f4f2ec'); }
    }
    // руки
    r(5, y0 + 14 + arm, 2, 6, shD); r(5, y0 + 14 + arm, 1, 6, sh); r(5, y0 + 20 + arm, 2, 2, sk);
    r(17, y0 + 14 - arm, 2, 6, shD); r(18, y0 + 14 - arm, 1, 6, shade(sh, -0.35)); r(17, y0 + 20 - arm, 2, 2, skD);
  } else {
    r(8, y0 + 13, 8, 9, sh); r(15, y0 + 13, 1, 9, shL); r(8, y0 + 13, 1, 9, shD);
    if (L.stripes) for (let i = 0; i < 4; i++) r(8, y0 + 14 + i * 2, 8, 1, shD);
    r(8, y0 + 21, 8, 1, paD);
    if (L.apron) { r(13, y0 + 15, 3, 9, '#f4f2ec'); }
    r(11 + arm, y0 + 14, 3, 6, shD); r(11 + arm, y0 + 14, 1, 6, sh); r(11 + arm, y0 + 20, 3, 2, sk);
  }
  r(10, y0 + 12, 4, 1, skD); // шея

  // ---- голова ----
  if (dir === 'up') {
    r(6, y0, 12, 12, hr); r(7, y0 + 1, 5, 2, hrL); r(6, y0 + 10, 12, 2, hrD);
    r(5, y0 + 6, 1, 2, sk); r(18, y0 + 6, 1, 2, sk);
    if (L.style === 'long') r(6, y0 + 10, 12, 4, hr);
    if (L.style === 'pony') { r(10, y0 + 11, 4, 5, hr); r(11, y0 + 11, 1, 5, hrL); }
    if (L.style === 'bun') { r(9, y0 - 2, 6, 4, hr); r(10, y0 - 2, 2, 1, hrL); }
    if (L.style === 'bald') { r(7, y0, 10, 9, sk); r(8, y0 + 1, 3, 2, shade(sk, 0.3)); }
  } else if (!side) {
    r(6, y0, 12, 5, hr);
    r(7, y0 + 3, 10, 9, sk); r(16, y0 + 3, 1, 9, skD); r(7, y0 + 11, 10, 1, skD);
    r(6, y0 + 6, 1, 2, sk); r(17, y0 + 6, 1, 2, skD);
    if (L.style !== 'bald') { r(7, y0 + 3, 10, 2, hr); r(6, y0 + 3, 1, 3, hr); r(17, y0 + 3, 1, 3, hr); r(8, y0 + 1, 4, 1, hrL); r(12, y0 + 4, 3, 1, hrD); }
    else { r(7, y0, 10, 4, sk); r(8, y0 + 1, 3, 1, shade(sk, 0.3)); r(6, y0 + 4, 1, 3, hr); r(17, y0 + 4, 1, 3, hr); }
    if (L.style === 'long') { r(5, y0 + 3, 2, 11, hr); r(17, y0 + 3, 2, 11, hr); r(5, y0 + 3, 1, 11, hrD); }
    if (L.style === 'bun') { r(9, y0 - 3, 6, 4, hr); r(10, y0 - 3, 2, 1, hrL); }
    if (L.style === 'mohawk') { r(10, y0 - 3, 4, 4, hr); r(11, y0 - 3, 1, 3, hrL); r(7, y0 + 1, 10, 2, skD); }
    // лицо
    r(8, y0 + 5, 2, 1, hrD); r(14, y0 + 5, 2, 1, hrD);
    r(9, y0 + 7, 1, 2, '#2a1a2a'); r(14, y0 + 7, 1, 2, '#2a1a2a');
    r(8, y0 + 9, 1, 1, '#f08a8a'); r(15, y0 + 9, 1, 1, '#f08a8a');
    r(11, y0 + 10, 2, 1, shade(sk, -0.35));
    if (L.beard) { r(8, y0 + 9, 8, 3, hr); r(9, y0 + 12, 6, 1, hr); r(11, y0 + 10, 2, 1, '#5a2a2a'); }
    if (L.glasses) { r(8, y0 + 6, 3, 3, '#20202a'); r(13, y0 + 6, 3, 3, '#20202a'); r(9, y0 + 7, 1, 1, '#a8d8f0'); r(14, y0 + 7, 1, 1, '#a8d8f0'); r(11, y0 + 7, 2, 1, '#20202a'); }
  } else {
    // профиль вправо (влево — зеркально)
    r(7, y0, 10, 5, hr);
    r(9, y0 + 3, 8, 9, sk); r(9, y0 + 11, 8, 1, skD); r(17, y0 + 7, 1, 2, sk);
    if (L.style !== 'bald') { r(7, y0 + 3, 4, 7, hr); r(11, y0 + 3, 6, 2, hr); r(8, y0 + 1, 4, 1, hrL); }
    else { r(9, y0, 8, 4, sk); r(11, y0 + 1, 3, 1, shade(sk, 0.3)); r(7, y0 + 4, 3, 4, hr); }
    if (L.style === 'long') r(6, y0 + 3, 4, 11, hr);
    if (L.style === 'pony') { r(4, y0 + 5, 3, 6, hr); r(4, y0 + 5, 1, 6, hrD); }
    if (L.style === 'bun') { r(5, y0 - 1, 5, 4, hr); }
    if (L.style === 'mohawk') { r(9, y0 - 3, 6, 4, hr); r(10, y0 - 3, 4, 1, hrL); }
    r(10, y0 + 6, 1, 2, skD);
    r(15, y0 + 5, 2, 1, hrD); r(15, y0 + 7, 1, 2, '#2a1a2a');
    r(14, y0 + 9, 1, 1, '#f08a8a'); r(15, y0 + 10, 2, 1, shade(sk, -0.35));
    if (L.beard) { r(11, y0 + 9, 6, 3, hr); r(15, y0 + 10, 2, 1, '#5a2a2a'); }
    if (L.glasses) { r(14, y0 + 6, 3, 3, '#20202a'); r(15, y0 + 7, 1, 1, '#a8d8f0'); r(11, y0 + 7, 3, 1, '#20202a'); }
  }

  // головные уборы
  if (L.style === 'cap') {
    const cp = L.cap || '#b03a3a', cpD = shade(cp, -0.3);
    if (side) { r(7, y0 - 1, 10, 5, cp); r(8, y0, 4, 1, shade(cp, 0.3)); r(15, y0 + 3, 5, 1, cpD); }
    else { r(6, y0 - 1, 12, 5, cp); r(8, y0, 4, 1, shade(cp, 0.3)); if (dir === 'down') r(6, y0 + 4, 12, 1, cpD); else r(6, y0 + 3, 12, 1, cpD); }
  }
  if (L.chef) {
    r(7, y0 - 6, 10, 7, '#fbfaf6'); r(8, y0 - 7, 8, 1, '#fbfaf6'); r(15, y0 - 6, 2, 7, '#dcd8d0'); r(9, y0 - 5, 2, 2, '#ffffff');
    r(6, y0, 12, 2, '#e4e0d8'); r(6, y0 + 1, 12, 1, '#c8c4bc');
  }

  outline(c);
  if (dir === 'left') {
    const [m, mx] = makeCanvas(24, 36);
    mx.translate(24, 0); mx.scale(-1, 1); mx.drawImage(c, 0, 0);
    return m;
  }
  return c;
}

// (wx, wy) — точка под ногами в координатах мира
function drawChar(ctx, wx, wy, look, dir = 'down', frame = 0, opts = {}) {
  if (!look._id) Object.defineProperty(look, '_id', { value: _lookId++, enumerable: false });
  const key = look._id + dir + (frame % 4);
  let spr = _charCache.get(key);
  if (!spr) { spr = buildChar(look, dir, frame % 4); _charCache.set(key, spr); }
  const X = px(wx), Y = px(wy);
  shadow(ctx, X, Y, 8, 3, 0.28 * (opts.alpha ?? 1));
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.drawImage(spr, X - 12, Y - 33);
  ctx.globalAlpha = 1;
}
