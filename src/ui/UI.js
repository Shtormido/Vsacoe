import { SPEAKERS } from '../data/story.js';
import { formatMoney } from '../util/math.js';

/** Мини-конструктор DOM: h('div.cls', {onclick}, ...children). */
export function h(sel, attrs = {}, ...children) {
  const [tag, ...classes] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = {};
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function starsText(v) {
  const full = Math.max(0, Math.min(5, Math.round(v)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export const ICONS = {
  shower: 'icons/shower.png', shampoo: 'icons/shampoo.png', dryer: 'icons/dryer.png', brush: 'icons/brush.png',
  clipper: 'icons/clipper.png', scissors: 'icons/scissors.png', nailclip: 'icons/nailclip.png',
  perfume: 'icons/perfume.png', bow: 'icons/bow.png', treat: 'icons/treat.png', firstaid: 'icons/firstaid.png',
};
const EMOJI = { music: '🎵', plant: '🪴', ads: '📣', sofa: '🛋️', neon: '💡', coffee: '☕', table: '🛠️' };

export function iconEl(id) {
  if (ICONS[id]) return h('img', { src: ICONS[id], alt: '', onerror: (e) => { e.target.replaceWith('✂️'); } });
  return h('span', EMOJI[id] || '✨');
}

/** Слой интерфейса поверх 3D. */
export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.layers = {};
    for (const name of ['world', 'hud', 'screen', 'modal', 'dialog', 'toast']) {
      const l = h(`div.layer-${name}.pass`);
      Object.assign(l.style, { position: 'fixed', inset: '0' });
      this.layers[name] = l;
      root.append(l);
    }
    this.toastBox = h('div.toasts');
    this.layers.toast.append(this.toastBox);
    this.fader = h('div.fade');
    root.append(this.fader);
  }

  clear(layer) {
    this.layers[layer].replaceChildren();
  }

  sfx(name) {
    this.game.audio?.play(name);
  }

  // ------------------------------------------------------------ загрузка
  loading() {
    const bar = h('div');
    const tip = h('div.tip', 'Загружаем модели из Blender...');
    const el = h('div.screen-full.loading', h('div.logo', 'Пушистый салон'), h('div.bar', bar), tip);
    this.layers.screen.replaceChildren(el);
    return {
      set: (p, text) => {
        bar.style.width = `${Math.round(p * 100)}%`;
        if (text) tip.textContent = text;
      },
      done: () => el.remove(),
    };
  }

  async fade(fn) {
    this.fader.classList.add('on');
    await new Promise((r) => setTimeout(r, 470));
    await fn?.();
    this.fader.classList.remove('on');
    await new Promise((r) => setTimeout(r, 300));
  }

  // ------------------------------------------------------------ меню
  mainMenu({ hasSave, onNew, onContinue, onSettings, onAbout }) {
    const b = (label, fn, cls = '') => h(`button${cls}`, { onclick: () => { this.sfx('click'); fn(); } }, label);
    const el = h('div.screen-full.menu',
      h('div.col',
        h('h1', 'Пушистый', h('br'), 'салон'),
        h('div.sub', 'симулятор грумера'),
        hasSave ? b('▶  Продолжить', onContinue, '.primary') : null,
        b('✦  Новая игра', onNew, hasSave ? '' : '.primary'),
        b('⚙  Настройки', onSettings),
        b('♥  Об игре', onAbout),
        h('div.ver', 'Модели созданы процедурно в Blender · Three.js'),
      ));
    this.layers.screen.replaceChildren(el);
  }

  slides(texts, { dim = true } = {}) {
    return new Promise((resolve) => {
      let i = 0;
      const text = h('div.text');
      const el = h('div.screen-full.slides', text, h('div.next', 'Клик или пробел — дальше'));
      if (!dim) el.style.background = 'rgba(20,12,24,0.5)';
      const show = () => {
        if (i >= texts.length) {
          cleanup();
          el.remove();
          resolve();
          return;
        }
        const cur = texts[i++];
        text.style.opacity = 0;
        setTimeout(() => {
          text.textContent = this.fill(cur);
          text.style.transition = 'opacity 0.4s';
          text.style.opacity = 1;
        }, 120);
      };
      const key = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') show();
      };
      const cleanup = () => window.removeEventListener('keydown', key);
      el.addEventListener('click', show);
      window.addEventListener('keydown', key);
      this.layers.dialog.append(el);
      show();
    });
  }

  prompt(title, placeholder, value = '') {
    return new Promise((resolve) => {
      const input = h('input', { type: 'text', placeholder, value, maxlength: 18 });
      const done = () => {
        const v = input.value.trim();
        if (!v) return input.focus();
        back.remove();
        resolve(v);
      };
      input.addEventListener('keydown', (e) => e.code === 'Enter' && done());
      const back = h('div.modal-back', h('div.modal.panel', { style: { width: 'min(480px, 92vw)' } },
        h('h2', title), h('div.subtitle', 'Так тебя будут звать клиенты'), input,
        h('div.footer', h('button.primary', { onclick: done }, 'Готово'))));
      this.layers.modal.append(back);
      setTimeout(() => input.focus(), 50);
    });
  }

  fill(text, extra = {}) {
    const vars = { name: this.game.state?.name || 'Мастер', ...extra };
    return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
  }

  /**
   * Диалог: массив реплик [speaker, text] и {choice: [...]}.
   * Возвращает индексы выбранных вариантов.
   */
  dialog(lines, extra = {}) {
    return new Promise((resolve) => {
      const choices = [];
      let i = 0;
      let typing = null;
      const portrait = h('div.portrait');
      const name = h('div.name');
      const text = h('div.text');
      const choiceBox = h('div.choices');
      const hint = h('div.hint', 'Клик / пробел');
      const box = h('div.dialog.panel', portrait, h('div.body', name, text, choiceBox), hint);
      const finishTyping = () => {
        if (typing) {
          clearInterval(typing.id);
          text.textContent = typing.full;
          typing = null;
          return true;
        }
        return false;
      };
      const next = () => {
        if (choiceBox.childElementCount) return;
        if (finishTyping()) return;
        if (i >= lines.length) {
          cleanup();
          box.remove();
          resolve(choices);
          return;
        }
        const line = lines[i++];
        if (line.choice) {
          hint.style.display = 'none';
          line.choice.forEach((c, idx) => {
            choiceBox.append(h('button', {
              onclick: (e) => {
                e.stopPropagation();
                this.sfx('click');
                choices.push(idx);
                choiceBox.replaceChildren();
                hint.style.display = '';
                next();
              },
            }, `${idx + 1}. ${this.fill(c, extra)}`));
          });
          return;
        }
        const [sid, raw] = line;
        const sp = sid === 'me' ? { name: this.game.state.name, color: '#3d2f3a', portrait: null } : SPEAKERS[sid] || { name: sid, color: '#333' };
        name.textContent = sp.name;
        name.style.color = sp.color;
        portrait.style.display = sp.portrait ? '' : 'none';
        if (sp.portrait) portrait.style.backgroundImage = `url(portraits/${sp.portrait}.png)`;
        const full = this.fill(raw, extra);
        let n = 0;
        text.textContent = '';
        this.game.audio?.play('blip');
        typing = {
          full,
          id: setInterval(() => {
            n += 2;
            text.textContent = full.slice(0, n);
            if (n >= full.length) finishTyping();
          }, 16),
        };
        this.game.onSpeak?.(sid);
      };
      const key = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          next();
        }
        if (/^Digit[1-9]$/.test(e.code) && choiceBox.childElementCount) {
          const b = choiceBox.children[Number(e.code.slice(5)) - 1];
          b?.click();
        }
      };
      const cleanup = () => window.removeEventListener('keydown', key);
      box.addEventListener('click', next);
      window.addEventListener('keydown', key);
      this.layers.dialog.append(box);
      next();
    });
  }

  toast(text, type = '') {
    const t = h(`div.toast.panel${type ? '.' + type : ''}`, text);
    this.toastBox.append(t);
    setTimeout(() => t.remove(), 3300);
  }

  // ------------------------------------------------------------ HUD хаба
  topbar(state, chapter) {
    const el = h('div.topbar',
      h('div.chip.panel', h('span.ico', '📅'), `День ${state.day}`),
      h('div.chip.panel', h('span.ico', '💰'), formatMoney(state.money)),
      h('div.chip.panel', h('span.stars', starsText(state.rep)), ` ${state.rep.toFixed(1)}`),
      chapter ? h('div.goal.panel', h('b', chapter.title), chapter.goal) : null,
    );
    this.layers.hud.querySelector('.topbar')?.remove();
    this.layers.hud.append(el);
  }

  hubbar(items) {
    const el = h('div.hubbar', items.map((it) => h(`button${it.cls || ''}`, {
      onclick: () => { this.sfx('click'); it.fn(); }, disabled: it.disabled,
    }, h('span.ico', it.icon), it.label)));
    this.layers.hud.querySelector('.hubbar')?.remove();
    this.layers.hud.append(el);
  }

  actionbar(items) {
    const el = h('div.actionbar', items.map((it) => h(`button.big${it.cls || '.primary'}`, {
      onclick: () => { this.sfx('click'); it.fn(); }, disabled: it.disabled,
    }, it.label)));
    this.layers.hud.querySelector('.actionbar')?.remove();
    this.layers.hud.append(el);
  }

  clearHud() {
    this.clear('hud');
  }

  // ------------------------------------------------------------ модальные окна
  modal(title, subtitle, content, buttons = [{ label: 'Закрыть', cls: '.primary' }], { width } = {}) {
    return new Promise((resolve) => {
      const close = (v) => {
        back.remove();
        window.removeEventListener('keydown', esc);
        resolve(v);
      };
      const esc = (e) => e.code === 'Escape' && close(null);
      const back = h('div.modal-back', h('div.modal.panel', { style: width ? { width } : null },
        h('h2', title), subtitle ? h('div.subtitle', subtitle) : null,
        h('div.content', content),
        h('div.footer', buttons.map((b, i) => h(`button${b.cls || ''}`, {
          onclick: () => { this.sfx('click'); close(b.value ?? i); }, disabled: b.disabled,
        }, b.label)))));
      back.addEventListener('mousedown', (e) => e.target === back && close(null));
      window.addEventListener('keydown', esc);
      this.layers.modal.append(back);
    });
  }
}
