// Темы: предустановленные + пользовательские. Тема задаёт CSS-токены, шрифты, материал окна и т.д.
import { api, S } from './lib.js';

const base = {
  font: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  displayFont: '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif',
  mono: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  fontSize: 14, radius: 8, material: 'mica', transparency: 0.35, anim: 1, density: 'comfortable',
  orb: 'glow', sidebarWidth: 248, bgImage: '', bgImageOpacity: 0.25, bgImageBlur: 0, reduceMotion: false,
};

const dark = (c) => ({ dark: true, colors: Object.assign({
  bg: '#202020', layer: '#ffffff08', card: '#ffffff0b', surface: '#ffffff0f', surfaceHover: '#ffffff17', surfaceActive: '#ffffff08',
  stroke: '#ffffff14', strokeStrong: '#ffffff29', text: '#ffffff', text2: '#ffffffc7', text3: '#ffffff8a',
  success: '#6ccb5f', warning: '#fce100', danger: '#ff99a4', stOff: '#8a8a8a', stOn: '#22c55e', stService: '#a78bfa', stBusy: '#f59e0b', sidebar: '#00000000',
}, c) });
const light = (c) => ({ dark: false, colors: Object.assign({
  bg: '#f3f3f3', layer: '#ffffff80', card: '#ffffffb3', surface: '#ffffffd9', surfaceHover: '#f9f9f980', surfaceActive: '#f9f9f94d',
  stroke: '#0000000f', strokeStrong: '#00000024', text: '#1a1a1a', text2: '#1a1a1ac2', text3: '#1a1a1a87',
  success: '#0f7b0f', warning: '#9d5d00', danger: '#c42b1c', stOff: '#8a8a8a', stOn: '#16a34a', stService: '#7c3aed', stBusy: '#d97706', sidebar: '#00000000',
}, c) });

export const PRESETS = [
  { id: 'fluent-dark', name: 'Windows 11 · Тёмная', ...base, ...dark({ accent: '#60cdff', accentText: '#002a40' }) },
  { id: 'fluent-light', name: 'Windows 11 · Светлая', ...base, ...light({ accent: '#005fb8', accentText: '#ffffff' }) },
  { id: 'midnight', name: 'Полночь', ...base, material: 'acrylic', transparency: 0.2, ...dark({ bg: '#0b1020', card: '#7c9cff0d', surface: '#7c9cff14', surfaceHover: '#7c9cff21', accent: '#7c9cff', accentText: '#0b1020', stOn: '#34d399', stService: '#c084fc' }) },
  { id: 'sakura', name: 'Сакура', ...base, radius: 12, ...light({ bg: '#fff4f7', card: '#ffffffc0', surface: '#ffe4ecb3', surfaceHover: '#ffd6e3b3', accent: '#e0457b', accentText: '#ffffff', stOn: '#e0457b', stService: '#9b5de5', text: '#3d1a26', text2: '#3d1a26c2', text3: '#3d1a2680' }) },
  { id: 'neon', name: 'Неон', ...base, radius: 4, displayFont: '"Bahnschrift", "Segoe UI", sans-serif', material: 'none', ...dark({ bg: '#0d0221', card: '#ff2bd60d', surface: '#ff2bd617', surfaceHover: '#ff2bd626', stroke: '#ff2bd633', strokeStrong: '#00e5ff59', accent: '#ff2bd6', accentText: '#0d0221', stOn: '#00ffa3', stService: '#00e5ff', stBusy: '#ffe600', text: '#f6e8ff', text3: '#c7a6ff99' }), orb: 'pulse' },
  { id: 'forest', name: 'Лес', ...base, ...dark({ bg: '#0f1a14', card: '#4cc38a0d', surface: '#4cc38a14', surfaceHover: '#4cc38a21', accent: '#4cc38a', accentText: '#062013', stOn: '#84cc16', stService: '#2dd4bf' }) },
  { id: 'sand', name: 'Песок', ...base, radius: 10, ...light({ bg: '#f6f1e7', card: '#fffaf0c0', surface: '#efe6d3c0', surfaceHover: '#e8dcc3c0', accent: '#b5651d', accentText: '#ffffff', text: '#3b2f22', text2: '#3b2f22c2', text3: '#3b2f2287', stOn: '#4d7c0f', stService: '#9a3412' }) },
  { id: 'ocean', name: 'Океан', ...base, material: 'acrylic', ...dark({ bg: '#071a2a', card: '#1fb6ff0d', surface: '#1fb6ff14', surfaceHover: '#1fb6ff24', accent: '#1fb6ff', accentText: '#04121d', stOn: '#2dd4bf', stService: '#818cf8' }) },
  { id: 'amethyst', name: 'Аметист', ...base, radius: 12, ...dark({ bg: '#1a1025', card: '#b57bff0d', surface: '#b57bff17', surfaceHover: '#b57bff26', accent: '#b57bff', accentText: '#1a1025', stOn: '#5eead4', stService: '#f472b6' }) },
  { id: 'mono', name: 'Монохром', ...base, radius: 6, material: 'none', ...dark({ bg: '#121212', accent: '#e6e6e6', accentText: '#121212', stOn: '#e6e6e6', stService: '#9e9e9e', stOff: '#4a4a4a', stBusy: '#bdbdbd', success: '#e6e6e6', warning: '#bdbdbd', danger: '#ff6b6b' }) },
  { id: 'terminal', name: 'Терминал', ...base, radius: 2, font: '"Cascadia Code", Consolas, monospace', displayFont: '"Cascadia Code", Consolas, monospace', fontSize: 13, material: 'none', orb: 'ring', ...dark({ bg: '#050805', card: '#33ff660a', surface: '#33ff6612', surfaceHover: '#33ff6620', stroke: '#33ff6626', strokeStrong: '#33ff6650', accent: '#33ff66', accentText: '#031203', text: '#b6ffc8', text2: '#8de9a5', text3: '#5fa873', stOn: '#33ff66', stService: '#00d0ff', stBusy: '#ffd000' }) },
  { id: 'sunset', name: 'Закат', ...base, radius: 14, ...dark({ bg: '#1c1016', card: '#ff7a590d', surface: '#ff7a5917', surfaceHover: '#ff7a5926', accent: '#ff7a59', accentText: '#250a03', stOn: '#facc15', stService: '#f472b6' }) },
];

export const COLOR_KEYS = [
  ['accent', 'Акцент'], ['accentText', 'Текст на акценте'], ['bg', 'Фон окна'], ['layer', 'Фон области'], ['card', 'Карточки'],
  ['surface', 'Элементы'], ['surfaceHover', 'Наведение'], ['surfaceActive', 'Нажатие'], ['stroke', 'Обводка'], ['strokeStrong', 'Обводка (сильная)'],
  ['text', 'Текст'], ['text2', 'Текст вторичный'], ['text3', 'Текст подсказок'], ['success', 'Успех'], ['warning', 'Предупреждение'], ['danger', 'Ошибка'],
  ['stOff', 'Индикатор: выключен'], ['stOn', 'Индикатор: работает'], ['stService', 'Индикатор: сервис'], ['stBusy', 'Индикатор: проверка/запуск'], ['sidebar', 'Боковая панель'],
];

export function allThemes() { return [...PRESETS, ...((S.cfg && S.cfg.ui.customThemes) || [])]; }
export function currentTheme() {
  const id = S.cfg ? S.cfg.ui.themeId : 'fluent-dark';
  const t = allThemes().find(x => x.id === id) || PRESETS[0];
  return normalize(t);
}
export function normalize(t) {
  const p = t.dark === false ? PRESETS[1] : PRESETS[0];
  return { ...base, ...t, colors: { ...p.colors, ...(t.colors || {}) } };
}

/** #rrggbb[aa] -> {r,g,b,a} */
export function parseColor(hex) {
  const m = String(hex || '').replace('#', '');
  const n = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  return { r: parseInt(n.slice(0, 2), 16) || 0, g: parseInt(n.slice(2, 4), 16) || 0, b: parseInt(n.slice(4, 6), 16) || 0, a: n.length >= 8 ? parseInt(n.slice(6, 8), 16) / 255 : 1 };
}
export function toCss(hex) { const c = parseColor(hex); return `rgba(${c.r},${c.g},${c.b},${+c.a.toFixed(3)})`; }

let lastTrayKey = '';
export function applyTheme(t = currentTheme()) {
  const r = document.documentElement.style;
  const c = t.colors;
  const map = { accent: '--accent', accentText: '--accent-text', bg: '--bg', layer: '--layer', card: '--card', surface: '--surface', surfaceHover: '--surface-hover', surfaceActive: '--surface-active', stroke: '--stroke', strokeStrong: '--stroke-strong', text: '--text', text2: '--text-2', text3: '--text-3', success: '--success', warning: '--warning', danger: '--danger', stOff: '--st-off', stOn: '--st-on', stService: '--st-service', stBusy: '--st-busy', sidebar: '--sidebar' };
  for (const [k, v] of Object.entries(map)) if (c[k]) r.setProperty(v, toCss(c[k]));
  const ac = parseColor(c.accent);
  r.setProperty('--accent-soft', `rgba(${ac.r},${ac.g},${ac.b},.16)`);
  r.setProperty('--font', t.font);
  r.setProperty('--font-display', t.displayFont || t.font);
  r.setProperty('--mono', t.mono);
  r.setProperty('--fs', t.fontSize + 'px');
  r.setProperty('--radius', t.radius + 'px');
  r.setProperty('--anim', t.reduceMotion ? 0.001 : String(t.anim));
  r.setProperty('--sidebar-w', t.sidebarWidth + 'px');
  const useMat = S.info && S.info.platform === 'win32' && t.material !== 'none';
  r.setProperty('--bg-alpha', useMat ? String(1 - t.transparency) : '1');
  r.setProperty('--bg-image', t.bgImage ? `url("${t.bgImage}")` : 'none');
  r.setProperty('--bg-image-opacity', String(t.bgImageOpacity));
  r.setProperty('--bg-image-blur', t.bgImageBlur + 'px');
  r.setProperty('--shadow', t.dark ? '0 8px 28px rgba(0,0,0,.32), 0 2px 6px rgba(0,0,0,.2)' : '0 8px 28px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.08)');
  r.setProperty('color-scheme', t.dark ? 'dark' : 'light');
  document.body.classList.toggle('reduce-motion', !!t.reduceMotion);
  document.body.classList.toggle('density-compact', t.density === 'compact');
  document.body.dataset.orb = t.orb;
  if (!api) return;
  api.call('win:overlay', { color: '#00000000', symbolColor: toCss(c.text).replace(/,[\d.]+\)$/, ',1)').replace('rgba', 'rgba'), dark: t.dark }).catch(() => {});
  api.call('win:material', t.material).catch(() => {});
  const trayKey = [c.stOff, c.stOn, c.stService, c.stBusy].join();
  if (trayKey !== lastTrayKey) { lastTrayKey = trayKey; api.call('tray:icons', trayIcons(c)).catch(() => {}); }
}

/** Иконки трея по цветам состояния (рисуются на canvas). */
function trayIcons(c) {
  const draw = (col, ring) => {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 32, 32);
    grd.addColorStop(0, toCss(c.accent)); grd.addColorStop(1, '#ff3cac');
    g.fillStyle = grd; g.beginPath(); g.roundRect(2, 2, 28, 28, 8); g.fill();
    g.fillStyle = '#ffffffee'; g.font = 'bold 18px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', 14, 16);
    g.beginPath(); g.arc(24, 24, 7, 0, Math.PI * 2); g.fillStyle = '#000000aa'; g.fill();
    g.beginPath(); g.arc(24, 24, 5.2, 0, Math.PI * 2); g.fillStyle = toCss(col); g.fill();
    if (ring) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.stroke(); }
    return cv.toDataURL('image/png');
  };
  return { off: draw(c.stOff), running: draw(c.stOn), service: draw(c.stService, true), testing: draw(c.stBusy), starting: draw(c.stBusy) };
}

export const FONT_PRESETS = [
  '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  '"Segoe UI", sans-serif',
  'Bahnschrift, "Segoe UI", sans-serif',
  '"Cascadia Code", Consolas, monospace',
  'Consolas, monospace',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  'Calibri, sans-serif',
  'Candara, sans-serif',
  'Georgia, serif',
  '"Comic Sans MS", cursive',
];
