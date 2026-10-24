// Интерфейс: модальные окна, уведомления, HUD
const UI = (() => {
  const modal = document.getElementById('modal');
  const box = document.getElementById('modal-box');
  let handlers = {}, closable = false, onClose = null;

  box.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = handlers[el.dataset.a];
    if (fn) fn(el.dataset.v, el);
  });

  return {
    // html: разметка, h: { действие: функция }, opts: { closable, onClose }
    open(html, h = {}, opts = {}) {
      handlers = h; closable = !!opts.closable; onClose = opts.onClose || null;
      box.innerHTML = html;
      modal.classList.remove('hidden');
      box.scrollTop = 0;
      Keys.actPressed = false; Keys.spacePressed = false;
    },
    // обновить содержимое, не сбрасывая прокрутку
    refresh(html, h) { const s = box.scrollTop; box.innerHTML = html; if (h) handlers = h; box.scrollTop = s; },
    close() {
      modal.classList.add('hidden'); box.innerHTML = '';
      const cb = onClose; onClose = null; handlers = {};
      Keys.actPressed = false;
      if (cb) cb();
    },
    isOpen() { return !modal.classList.contains('hidden'); },
    escape() { if (this.isOpen() && closable) this.close(); },
    // короткий диалог с кнопками: [{ t, fn, cls, dis }]
    choice(title, text, buttons, opts = {}) {
      const h = {};
      const btns = buttons.map((b, i) => { h['c' + i] = () => { if (!b.keep) this.close(); b.fn && b.fn(); }; return `<button class="b ${b.cls || ''}" data-a="c${i}" ${b.dis ? 'disabled' : ''}>${b.t}</button>`; }).join('');
      this.open(`<h2>${title}</h2>${text}<div class="btns">${btns}</div>`, h, opts);
    }
  };
})();

function toast(msg, cls = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + cls; t.textContent = msg;
  const box = document.getElementById('toasts');
  box.appendChild(t);
  while (box.children.length > 5) box.removeChild(box.firstChild);
  setTimeout(() => t.remove(), 4000);
}

function setBar(id, v, color) {
  const el = document.getElementById(id);
  el.style.setProperty('--v', clamp(v, 0, 100) + '%');
  el.style.setProperty('--c', color);
}

function updateHUD() {
  const hud = document.getElementById('hud');
  hud.classList.toggle('hidden', G.phase === 'title' || G.phase === 'ending');
  document.getElementById('hud-day').textContent = 'День ' + G.day;
  document.getElementById('hud-time').textContent = '🕒 ' + fmtTime(G.time);
  document.getElementById('hud-money').textContent = '$' + Math.floor(G.money);
  document.getElementById('hud-rep').textContent = tierOf(REP_TIERS, G.rep);
  setBar('bar-stamina', G.stamina, G.stamina < 30 ? '#d6453d' : '#e8a33d');
  setBar('bar-suspicion', G.suspicion, G.suspicion > 70 ? '#d6453d' : '#9a6ad6');
  setBar('bar-clean', G.cleanliness, G.cleanliness < 40 ? '#d6453d' : '#5ab0bf');
  setBar('bar-conscience', G.conscience, G.conscience < 40 ? '#8e1b1b' : '#6fbf5a');
  const tray = document.getElementById('hud-tray');
  if (G.phase === 'day' && typeof Kitchen !== 'undefined') {
    tray.textContent = 'Поднос: ' + (Kitchen.tray.length ? Kitchen.tray.map(itemLabel).join('  ') : '—') + `  (${Kitchen.tray.length}/${trayMax()})`;
  } else tray.textContent = '';
}

function itemLabel(it) {
  const d = DISHES[it.dish];
  let s = d.icon + d.name;
  if (it.meat) s += '(' + MEATS[it.meat].short + ')';
  if (it.burnt) s += '🔥';
  return s;
}

function prompt(text) {
  const p = document.getElementById('prompt');
  if (!text) { p.classList.add('hidden'); return; }
  p.classList.remove('hidden'); p.textContent = text;
}

function statsHTML() {
  return `<div class="stats">
    <div>💵 Деньги: <b>$${Math.floor(G.money)}</b></div>
    <div>⚡ Выносливость: <b>${Math.round(G.stamina)}</b></div>
    <div>👁 Подозрения: <b class="${G.suspicion > 70 ? 'bad' : ''}">${Math.round(G.suspicion)}</b></div>
    <div>🗣 Слухи: <b>${Math.round(G.rumors)}</b></div>
    <div>🧽 Чистота мотеля: <b class="${G.cleanliness < 40 ? 'bad' : ''}">${Math.round(G.cleanliness)}</b></div>
    <div>♥ Совесть: <b>${Math.round(G.conscience)}</b></div>
    <div>⭐ Ресторан: <b>${tierOf(REP_TIERS, G.rep)}</b> (${Math.round(G.rep)})</div>
    <div>🏚 Мотель: <b>${tierOf(MOTEL_TIERS, G.rumors)}</b></div>
  </div>`;
}
