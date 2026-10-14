import { DEFAULT_LOOK } from '../game/State.js';
import { HAIR_COLORS, HAIR_STYLES, PALETTE, SKIN_TONES } from '../world/Player.js';
import { h } from './UI.js';

/** Экран внешнего вида персонажа: телосложение, кожа, причёска, одежда, аксессуары. */
export function openCustomizer(game, { title = 'Внешний вид', first = false } = {}) {
  const s = game.state;
  const look = { ...DEFAULT_LOOK, ...s.look };
  return new Promise((resolve) => {
    const apply = () => {
      game.player.rebuild(look);
      render();
    };
    const swatches = (key, colors) => h('div.swatches', colors.map((c) => h(`button.sw${look[key] === c ? '.on' : ''}`, {
      style: { background: c }, onclick: () => { look[key] = c; apply(); },
    })));
    const opts = (key, map) => h('div.opts', Object.entries(map).map(([id, name]) => h(`button${look[key] === id ? '.on' : ''}`, {
      onclick: () => { look[key] = id; apply(); },
    }, name)));
    const toggle = (key, label) => h(`button${look[key] ? '.on' : ''}`, { onclick: () => { look[key] = !look[key]; apply(); } }, label);
    const panel = h('div.custom.panel');
    const render = () => {
      panel.replaceChildren(...[
        h('h2', title),
        first ? h('p.muted', 'Таким вас увидят клиенты. Всё можно поменять у зеркала в груминг-зале.') : null,
        h('h4', 'Телосложение'), opts('body', { woman: 'Женское', man: 'Мужское' }),
        h('h4', 'Кожа'), h('div.swatches', Object.entries(SKIN_TONES).map(([id, c]) => h(`button.sw${look.skin === id ? '.on' : ''}`, {
          style: { background: c }, onclick: () => { look.skin = id; apply(); },
        }))),
        h('h4', 'Причёска'), opts('hair', HAIR_STYLES),
        h('h4', 'Цвет волос'), swatches('hairColor', HAIR_COLORS),
        h('h4', 'Кофта'), swatches('top', PALETTE),
        h('h4', 'Брюки'), swatches('bottom', PALETTE),
        h('h4', 'Обувь'), swatches('shoes', PALETTE),
        h('h4', 'Фартук'), swatches('apron', PALETTE),
        h('h4', 'Аксессуары'), h('div.opts', toggle('glasses', 'Очки'), toggle('cap', 'Кепка'), toggle('beard', 'Борода')),
        look.cap ? [h('h4', 'Цвет кепки'), swatches('capColor', PALETTE)] : null,
        h('div.footer', h('button.primary.big', {
          onclick: () => {
            s.look = look;
            back.remove();
            resolve(look);
          },
        }, 'Готово')),
      ].flat().filter(Boolean));
    };
    const back = h('div.custom-wrap', panel);
    game.ui.layers.modal.append(back);
    render();
  });
}
