// Темы оформления салона. Применяются поверх базовых настроек помещения.

export const THEMES = {
  original: { name: 'Как при покупке', price: 0, desc: 'Родной вид помещения.', swatch: ['#c98f72', '#ff9248', '#9fb6c4'] },
  scandi: {
    name: 'Скандинавский', price: 6000, desc: 'Светлое дерево, мятные стены и много воздуха.',
    wall: 'paint', wallColor: '#f4f1ec', wallColor2: '#cfe3dc', floor: 'wood', wood: '#d9b991',
    accent: '#5fae9f', fabric: '#c9d3cf', swatch: ['#f4f1ec', '#5fae9f', '#d9b991'],
  },
  provence: {
    name: 'Прованс', price: 7000, desc: 'Лаванда, кремовые стены и тёплый паркет.',
    wall: 'paint', wallColor: '#f6eef4', wallColor2: '#cdb8e6', floor: 'wood', wood: '#c7a27c',
    accent: '#a77fd6', fabric: '#e6d4f0', swatch: ['#f6eef4', '#a77fd6', '#c7a27c'],
  },
  loft: {
    name: 'Лофт', price: 8000, desc: 'Тёмный кирпич, бетон и оранжевые акценты.',
    wall: 'brick', wallColor: '#8f5a46', wallColor2: '#555555', floor: 'concrete', wood: '#6b4a35',
    accent: '#f2a33a', fabric: '#3e4a52', swatch: ['#8f5a46', '#f2a33a', '#3e4a52'],
  },
  sea: {
    name: 'Морской бриз', price: 9000, desc: 'Плитка, голубые стены и белое дерево.',
    wall: 'paint', wallColor: '#eaf6fb', wallColor2: '#7fc4e0', floor: 'tile', tileColor: '#ffffff', tileColor2: '#bfe3f2',
    wood: '#e2c79a', accent: '#2f8fd0', fabric: '#9fd3e8', swatch: ['#eaf6fb', '#2f8fd0', '#bfe3f2'],
  },
  candy: {
    name: 'Конфетный', price: 9000, desc: 'Розовая плитка, мятные панели и сладкий вайб.',
    wall: 'paint', wallColor: '#fff0f5', wallColor2: '#b9eadb', floor: 'tile', tileColor: '#ffe1ea', tileColor2: '#ffffff',
    wood: '#f0c9a4', accent: '#ff5f97', fabric: '#ffc4d6', swatch: ['#ffe1ea', '#ff5f97', '#b9eadb'],
  },
  neon: {
    name: 'Неон-поп', price: 14000, desc: 'Тёмные панели, мрамор и фиолетовый неон.',
    wall: 'panel', wallColor: '#2b2540', wallColor2: '#1d1830', floor: 'marble', wood: '#3a2c4f',
    accent: '#ff4fa3', fabric: '#5b3fd6', swatch: ['#2b2540', '#ff4fa3', '#5b3fd6'],
  },
};

export const ACCENTS = ['#ff8fa3', '#ff9248', '#ffc23d', '#5fd0b5', '#4aa3df', '#8a6cf0', '#e0504f', '#3d2f3a'];
export const ACCENT_PRICE = 800;
