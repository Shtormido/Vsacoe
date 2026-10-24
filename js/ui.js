// Интерфейс: модальные окна, уведомления, HUD
const UI = (() => {
  const modal = document.getElementById('modal');
  const box = document.getElementById('modal-box');
  let handlers = {}, closable = false, onClose = null, tw = null, openedAt = 0;

  box.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el) { UI.skipType(); return; }
    if (el.disabled) return;
    Sound.sfx('click');
    const fn = handlers[el.dataset.a];
    if (fn) fn(el.dataset.v, el);
  });

  // ночные сцены — тёмная рамка, дневные — пергамент
  const theme = () => ['day', 'morning'].includes(G && G.phase) ? 'paper' : 'dark';

  return {
    // html: разметка, h: { действие: функция }, opts: { closable, onClose, wide }
    open(html, h = {}, opts = {}) {
      handlers = h; closable = !!opts.closable; onClose = opts.onClose || null;
      if (!this.isOpen()) Sound.sfx('open');
      box.className = theme() + (opts.talk ? ' talk-box' : '') + (opts.cls ? ' ' + opts.cls : '');
      box.innerHTML = html;
      modal.classList.toggle('bottom', !!opts.talk);
      openedAt = performance.now();
      modal.classList.remove('hidden');
      box.scrollTop = 0;
      Keys.actPressed = false; Keys.spacePressed = false;
      this.startType();
    },
    // обновить содержимое, не сбрасывая прокрутку
    refresh(html, h) { const s = box.scrollTop; box.innerHTML = html; if (h) handlers = h; box.scrollTop = s; },
    close() {
      clearInterval(tw); tw = null;
      modal.classList.add('hidden'); box.innerHTML = '';
      const cb = onClose; onClose = null; handlers = {};
      Keys.actPressed = false;
      if (cb) cb();
    },
    isOpen() { return !modal.classList.contains('hidden'); },
    // сколько мс окно открыто — чтобы одно нажатие E не открывало и не пролистывало диалог сразу
    age() { return performance.now() - openedAt; },
    escape() { if (this.isOpen() && closable) this.close(); },

    // печатающийся текст в элементах .tw
    startType() {
      clearInterval(tw);
      const els = [...box.querySelectorAll('.tw')];
      if (!els.length) return;
      const full = els.map(e => e.textContent);
      els.forEach(e => { e.textContent = ''; });
      box.classList.add('typing');
      let i = 0, k = 0;
      tw = setInterval(() => {
        if (i >= els.length) { this.skipType(); return; }
        for (let n = 0; n < 2 && i < els.length; n++) {
          els[i].textContent = full[i].slice(0, ++k);
          if (k >= full[i].length) { i++; k = 0; }
        }
        if (k % 4 === 1) Sound.sfx('type');
      }, 22);
      this._full = [els, full];
    },
    skipType() {
      if (!tw) return;
      clearInterval(tw); tw = null;
      const [els, full] = this._full; els.forEach((e, i) => { e.textContent = full[i]; });
      box.classList.remove('typing');
    },
    typing() { return !!tw; },

    // диалог с кнопками: [{ t, fn, cls, dis }]; opts.who = { look, name } — с портретом
    choice(title, text, buttons, opts = {}) {
      const h = {};
      const btns = buttons.map((b, i) => { h['c' + i] = () => { if (!b.keep) this.close(); b.fn && b.fn(); }; return `<button class="b ${b.cls || ''}" data-a="c${i}" ${b.dis ? 'disabled' : ''}>${b.t}</button>`; }).join('');
      if (opts.who) {
        if (!/class="tw/.test(text)) text = text.replace(/<p>([^<]*)<\/p>/, '<p class="tw speech">$1</p>');
        this.open(`<div class="talk">
          <div class="portrait"><img src="${portraitURL(opts.who.look, opts.who.mood)}" alt=""><div class="nameplate">${opts.who.name}</div></div>
          <div class="talk-body"><h2>${title}</h2>${text}<div class="btns">${btns}</div></div></div>`, h, Object.assign({ talk: true }, opts));
      } else this.open(`<h2>${title}</h2>${text}<div class="btns">${btns}</div>`, h, opts);
    },
    // реплика персонажа: E / клик — дальше
    talk(look, name, line, then, mood) {
      this.choice('', `<p class="tw speech">${line}</p>`, [{ t: 'Дальше ▸', cls: 'primary', fn: then }], { who: { look, name, mood }, closable: true });
    }
  };
})();

// детальный портрет 64×64 (gfx/portrait.js), кэш по персонажу и эмоции
const _portraits = new Map();
function portraitURL(look, mood = 'neutral') {
  if (!look._id) Object.defineProperty(look, '_id', { value: _lookId++, enumerable: false });
  const key = look._id + mood;
  if (!_portraits.has(key)) _portraits.set(key, buildPortrait(look, mood).toDataURL());
  return _portraits.get(key);
}

function toast(msg, cls = '') {
  Sound.sfx(cls === 'bad' ? 'bad' : cls === 'good' ? 'good' : 'toast');
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
  if (it.bonus >= 0.15) s += '★'; else if (it.bonus < 0) s += '▾';
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

document.getElementById('version').textContent = 'v' + GAME_VERSION;
