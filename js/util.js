// Общие помощники
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pad2 = n => String(n).padStart(2, '0');
const fmtTime = m => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); };
const uid = (() => { let i = Date.now() % 1e9; return () => i++; })();

// Ввод
const Keys = { up: false, down: false, left: false, right: false, act: false, space: false, actPressed: false, spacePressed: false };
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyE: 'act', Enter: 'act', Space: 'space'
};
function setKey(k, down) {
  if (!k) return;
  if (down && !Keys[k]) {
    if (k === 'act') Keys.actPressed = true;
    if (k === 'space') Keys.spacePressed = true;
  }
  Keys[k] = down;
}
window.addEventListener('keydown', e => {
  Sound.unlock();
  if (e.code === 'KeyM') { Sound.toggleMute(); return; }
  if (e.code === 'Escape') { UI.escape(); return; }
  const k = KEYMAP[e.code];
  if (k) { setKey(k, true); if (!UI.isOpen() || k === 'space') e.preventDefault(); }
});
window.addEventListener('pointerdown', () => Sound.unlock());
window.addEventListener('keyup', e => setKey(KEYMAP[e.code], false));
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  b.addEventListener('touchstart', e => { e.preventDefault(); setKey(k, true); }, { passive: false });
  b.addEventListener('touchend', e => { e.preventDefault(); setKey(k, false); }, { passive: false });
  b.addEventListener('mousedown', () => setKey(k, true));
  b.addEventListener('mouseup', () => setKey(k, false));
});
function consumeAct() { const v = Keys.actPressed; Keys.actPressed = false; return v; }
function consumeSpace() { const v = Keys.spacePressed; Keys.spacePressed = false; return v; }

const NAMES_M = ['Билл', 'Джо', 'Хэнк', 'Рой', 'Эрл', 'Дуэйн', 'Карл', 'Лютер', 'Вэйд', 'Клифф', 'Бадди', 'Гас', 'Мэл', 'Отис', 'Рэй'];
const NAMES_F = ['Мэри', 'Линда', 'Барбара', 'Дот', 'Пэтти', 'Ширли', 'Джун', 'Рут', 'Мэйбл', 'Ирма', 'Конни', 'Флора'];
const SURNAMES = ['Смит', 'Джонс', 'Миллер', 'Купер', 'Хаскинс', 'Бейкер', 'Тёрнер', 'Палмер', 'Грей', 'Флетчер', 'Доусон', 'Стоун'];
function randomPerson() {
  const f = chance(0.45);
  return { name: pick(f ? NAMES_F : NAMES_M) + ' ' + pick(SURNAMES), female: f };
}
