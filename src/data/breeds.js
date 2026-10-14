// Породы: параметры меха, окрасы и допустимые стрижки.

export const REGIONS = {
  body: 'Корпус',
  head: 'Голова и уши',
  legs: 'Лапы',
  tail: 'Хвост',
};

// Целевая длина шерсти (доля от максимальной). null — не стричь, оставить пышным.
export const STYLES = {
  tidy: { name: 'Аккуратная подравнивающая', targets: { body: 0.7, head: 0.7, legs: 0.6, tail: 0.8 } },
  summer: { name: 'Летняя короткая', targets: { body: 0.25, head: 0.45, legs: 0.3, tail: 0.45 } },
  teddy: { name: 'Мишка Тедди', targets: { body: 0.45, head: 0.75, legs: 0.55, tail: 0.6 } },
  lion: { name: 'Под льва', targets: { body: 0.2, head: null, legs: 0.25, tail: null } },
  poodle: { name: 'Континентальный пудель', targets: { body: 0.25, head: null, legs: 0.35, tail: null } },
  hygienic: { name: 'Гигиеническая', targets: { body: null, head: 0.6, legs: 0.5, tail: null } },
  show: { name: 'Выставочная', targets: { body: 0.8, head: 0.6, legs: 0.7, tail: null } },
};

export const BREEDS = {
  corgi: {
    name: 'Корги', model: 'pet_corgi', furMax: 0.032, density: 420, curl: 0.1, droop: 0.25, thick: 0.5,
    palettes: [
      { name: 'рыжий', a: '#d9822b', b: '#fbf3e6', c: '#6b4022', skin: '#e9b7a6' },
      { name: 'соболиный', a: '#b77437', b: '#f7efe2', c: '#4a2f1d', skin: '#e9b7a6' },
      { name: 'палевый', a: '#e3a65f', b: '#fff6ea', c: '#9b6233', skin: '#e9b7a6' },
    ],
    temper: 0.8, size: 1.0, mats: 0.25, dirt: 0.8,
    styles: ['tidy', 'hygienic', 'summer'],
    sound: 'bark',
  },
  poodle: {
    name: 'Пудель', model: 'pet_poodle', furMax: 0.06, density: 360, curl: 1.0, droop: 0.15, thick: 0.55,
    palettes: [
      { name: 'абрикосовый', a: '#e7aa72', b: '#f3c99c', c: '#c88a55', skin: '#e9b7a6' },
      { name: 'белый', a: '#f4efe8', b: '#ffffff', c: '#e2dbd0', skin: '#efc6b8' },
      { name: 'чёрный', a: '#2c2a29', b: '#3b3836', c: '#1d1c1b', skin: '#4b3c36' },
      { name: 'шоколадный', a: '#6e4530', b: '#7d523a', c: '#55331f', skin: '#7a5a4a' },
    ],
    temper: 0.9, size: 1.2, mats: 0.9, dirt: 0.6,
    styles: ['poodle', 'teddy', 'summer', 'tidy'],
    sound: 'bark',
  },
  husky: {
    name: 'Хаски', model: 'pet_husky', furMax: 0.045, density: 400, curl: 0.12, droop: 0.3, thick: 0.5,
    palettes: [
      { name: 'серо-белый', a: '#7c818b', b: '#f6f6f3', c: '#3a3d44', skin: '#e3b2a5' },
      { name: 'медный', a: '#b56a3d', b: '#fbf3ea', c: '#7a3f22', skin: '#e3b2a5' },
      { name: 'чёрно-белый', a: '#3b3c40', b: '#f7f7f5', c: '#1f2023', skin: '#6a5048' },
    ],
    temper: 1.0, size: 1.4, mats: 0.5, dirt: 1.0,
    styles: ['hygienic', 'tidy', 'show'],
    sound: 'howl',
  },
  spitz: {
    name: 'Шпиц', model: 'pet_spitz', furMax: 0.07, density: 380, curl: 0.18, droop: 0.05, thick: 0.5,
    palettes: [
      { name: 'оранжевый', a: '#ec933a', b: '#ffe0b0', c: '#c46b22', skin: '#efb9a6' },
      { name: 'белый', a: '#f8f4ee', b: '#ffffff', c: '#e8e0d4', skin: '#f0c4b6' },
      { name: 'кремовый', a: '#f2cf98', b: '#fff1d8', c: '#d9ac6c', skin: '#efb9a6' },
    ],
    temper: 1.2, size: 1.0, mats: 0.8, dirt: 0.5,
    styles: ['teddy', 'lion', 'tidy'],
    sound: 'yap',
  },
  yorkie: {
    name: 'Йоркширский терьер', model: 'pet_yorkie', furMax: 0.08, density: 440, curl: 0.04, droop: 1.3, thick: 0.45,
    palettes: [
      { name: 'классический', a: '#c99050', b: '#e6c28c', c: '#4d5867', skin: '#e9b7a6' },
      { name: 'золотой', a: '#d8a55c', b: '#f0d29d', c: '#8a6a45', skin: '#e9b7a6' },
    ],
    temper: 1.1, size: 0.9, mats: 0.7, dirt: 0.6,
    styles: ['summer', 'teddy', 'show'],
    sound: 'yap',
  },
  cat: {
    name: 'Кошка', model: 'pet_cat', furMax: 0.05, density: 460, curl: 0.08, droop: 0.3, thick: 0.45,
    palettes: [
      { name: 'рыжий табби', a: '#e39a4c', b: '#fff2e0', c: '#b2602a', skin: '#f0b8b0' },
      { name: 'серый табби', a: '#9aa0a8', b: '#f0f2f4', c: '#4f545c', skin: '#e8b0aa' },
      { name: 'голубой британец', a: '#8f97a4', b: '#a8afba', c: '#828a97', skin: '#b9a1a6' },
      { name: 'чёрный', a: '#2d2b2f', b: '#4a474d', c: '#1d1c1f', skin: '#4a3a3e' },
    ],
    temper: 1.6, size: 1.1, mats: 0.6, dirt: 0.35,
    styles: ['lion', 'hygienic', 'tidy'],
    sound: 'meow',
  },
};

export function regionOf(meshName) {
  if (meshName.startsWith('Fur_Head') || meshName.startsWith('Fur_Ear')) return 'head';
  if (meshName.startsWith('Fur_Leg')) return 'legs';
  if (meshName.startsWith('Fur_Tail')) return 'tail';
  return 'body';
}
