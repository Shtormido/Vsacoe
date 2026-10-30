'use strict';
(function (G) {
  // Зоны
  G.ZONE = {
    1: { key: 'R', name: 'Жилая', color: '#5fd16f', icon: '🏠', max: 4 },
    2: { key: 'C', name: 'Коммерческая', color: '#4aa8ff', icon: '🏪', max: 3 },
    3: { key: 'I', name: 'Промышленная', color: '#ffc23d', icon: '🏭', max: 3 },
  };
  // Вместимость (жители для R, рабочие места для C/I) по уровню
  G.CAP = { 1: [0, 8, 30, 90, 220], 2: [0, 8, 32, 95], 3: [0, 12, 40, 95] };
  // Потребление коммунальных ресурсов по уровню
  G.NEED = { 1: [0, 1, 3, 7, 15], 2: [0, 2, 4, 10], 3: [0, 3, 6, 12] };
  G.RES = ['power', 'water', 'sewage', 'garbage'];
  G.RES_INFO = {
    power: { name: 'Электричество', icon: '⚡', color: '#ffd84a' },
    water: { name: 'Вода', icon: '💧', color: '#4fc3ff' },
    sewage: { name: 'Канализация', icon: '🚽', color: '#b48a5a' },
    garbage: { name: 'Мусор', icon: '🗑️', color: '#9bd36a' },
  };
  // Какие ресурсы нужны зданию уровня L
  G.needsFor = lvl => lvl >= 3 ? G.RES : lvl >= 2 ? ['power', 'water', 'sewage'] : ['power', 'water'];

  // Здания (не зоны)
  G.BLD = {
    wind: { name: 'Ветряк', icon: '🌬️', w: 1, h: 1, cost: 400, upkeep: 4, unlock: 1, provides: { power: 22 }, sh: 120, desc: 'Чистая энергия для небольшого района.' },
    waterTower: { name: 'Водонапорная башня', icon: '🗼', w: 1, h: 1, cost: 500, upkeep: 4, unlock: 1, provides: { water: 40 }, sh: 90, desc: 'Снабжает дома водой.' },
    park: { tourism: 2, name: 'Сквер', icon: '🌳', w: 1, h: 1, cost: 150, upkeep: 1, unlock: 1, service: { kind: 'park', r: 4 }, sh: 40, desc: 'Повышает счастье и стоимость земли.' },
    coal: { name: 'Угольная ТЭС', icon: '🏭', w: 2, h: 2, cost: 2500, upkeep: 25, unlock: 2, provides: { power: 170 }, pollution: 9, sh: 150, desc: 'Много энергии, но сильно загрязняет.' },
    sewage: { name: 'Очистные сооружения', icon: '🚽', w: 2, h: 2, cost: 2000, upkeep: 14, unlock: 2, provides: { sewage: 200 }, pollution: 3, sh: 50, desc: 'Нужны зданиям 2-го уровня.' },
    police: { name: 'Полиция', icon: '🚓', w: 1, h: 1, cost: 900, upkeep: 10, unlock: 2, service: { kind: 'police', r: 9 }, sh: 60, desc: 'Снижает преступность.' },
    cityhall: { tourism: 10, name: 'Мэрия', icon: '🏛️', w: 2, h: 2, cost: 3000, upkeep: 10, unlock: 2, service: { kind: 'park', r: 7 }, lv: 0.15, happy: 0.03, sh: 120, desc: 'Сердце города. +счастье.' },
    fire: { name: 'Пожарная часть', icon: '🚒', w: 1, h: 1, cost: 900, upkeep: 10, unlock: 3, service: { kind: 'fire', r: 9 }, sh: 70, desc: 'Тушит пожары в радиусе.' },
    clinic: { name: 'Поликлиника', icon: '🏥', w: 1, h: 1, cost: 800, upkeep: 8, unlock: 3, service: { kind: 'health', r: 8 }, sh: 60, desc: 'Здоровье жителей.' },
    landfill: { name: 'Полигон отходов', icon: '🗑️', w: 2, h: 2, cost: 1200, upkeep: 10, unlock: 3, provides: { garbage: 150 }, pollution: 6, lvMinus: 0.2, sh: 40, desc: 'Нужен зданиям 3-го уровня.' },
    plaza: { tourism: 6, name: 'Площадь с фонтаном', icon: '⛲', w: 1, h: 1, cost: 450, upkeep: 2, unlock: 3, service: { kind: 'park', r: 5 }, sh: 50, desc: 'Красивое место для прогулок.' },
    school: { name: 'Школа', icon: '🏫', w: 2, h: 2, cost: 1600, upkeep: 12, unlock: 4, service: { kind: 'edu', r: 11 }, sh: 70, desc: 'Образование повышает уровень зданий.' },
    solar: { name: 'Солнечная станция', icon: '☀️', w: 2, h: 2, cost: 2400, upkeep: 12, unlock: 4, provides: { power: 80 }, sh: 30, desc: 'Чистая энергия.' },
    pump: { name: 'Насосная станция', icon: '🚰', w: 1, h: 1, cost: 1500, upkeep: 10, unlock: 4, provides: { water: 170 }, nearWater: true, sh: 60, desc: 'Ставится у воды. Много воды.' },
    hospital: { name: 'Больница', icon: '🏨', w: 2, h: 2, cost: 5000, upkeep: 30, unlock: 5, service: { kind: 'health', r: 17 }, sh: 150, desc: 'Большой радиус охвата.' },
    bigpark: { tourism: 12, name: 'Парк с прудом', icon: '🦆', w: 2, h: 2, cost: 1600, upkeep: 6, unlock: 5, service: { kind: 'park', r: 9 }, sh: 50, desc: 'Сильно повышает стоимость земли.' },
    library: { name: 'Библиотека', icon: '📚', w: 1, h: 1, cost: 1100, upkeep: 7, unlock: 5, service: { kind: 'edu', r: 7 }, sh: 60, desc: 'Небольшой охват образования.' },
    policeHQ: { name: 'Управление полиции', icon: '👮', w: 2, h: 2, cost: 5000, upkeep: 30, unlock: 6, service: { kind: 'police', r: 17 }, sh: 120, desc: 'Большой радиус охвата.' },
    recycling: { name: 'Завод переработки', icon: '♻️', w: 2, h: 2, cost: 4500, upkeep: 25, unlock: 6, provides: { garbage: 360 }, pollution: 1, sh: 80, desc: 'Экологичная утилизация.' },
    monument: { tourism: 15, name: 'Монумент', icon: '🗽', w: 1, h: 1, cost: 2500, upkeep: 2, unlock: 6, service: { kind: 'park', r: 6 }, lv: 0.12, happy: 0.02, sh: 120, desc: 'Гордость города.' },
    university: { tourism: 8, name: 'Университет', icon: '🎓', w: 3, h: 3, cost: 9000, upkeep: 50, unlock: 7, service: { kind: 'edu', r: 22 }, lv: 0.1, sh: 140, desc: 'Огромный охват образования.' },
    stadium: { tourism: 35, name: 'Стадион', icon: '🏟️', w: 3, h: 3, cost: 12000, upkeep: 40, unlock: 7, service: { kind: 'park', r: 16 }, happy: 0.06, sh: 80, desc: 'Матчи по выходным. +счастье.' },
    nuclear: { name: 'АЭС', icon: '☢️', w: 3, h: 3, cost: 18000, upkeep: 90, unlock: 8, provides: { power: 900 }, pollution: 1, sh: 150, desc: 'Колоссальная мощность.' },
    ferris: { tourism: 40, name: 'Колесо обозрения', icon: '🎡', w: 2, h: 2, cost: 7000, upkeep: 15, unlock: 8, service: { kind: 'park', r: 12 }, lv: 0.12, happy: 0.04, sh: 190, desc: 'Аттракцион и символ города.' },
    sawmill: { name: 'Лесопилка', icon: '🪵', w: 2, h: 2, cost: 1500, upkeep: 8, unlock: 2, extract: { res: 'wood', src: 'tree', r: 4, per: 0.9, max: 45 }, pollution: 2, sh: 60, desc: 'Добывает древесину из леса вокруг (радиус 4).' },
    quarry: { name: 'Каменоломня', icon: '🪨', w: 2, h: 2, cost: 2000, upkeep: 10, unlock: 3, extract: { res: 'stone', src: 1, r: 3, per: 3, max: 60 }, pollution: 4, sh: 70, desc: 'Ставьте рядом с залежами камня.' },
    coalmine: { name: 'Угольная шахта', icon: '⛏️', w: 2, h: 2, cost: 2500, upkeep: 12, unlock: 3, extract: { res: 'coal', src: 2, r: 3, per: 3, max: 60 }, pollution: 5, sh: 110, desc: 'Ставьте рядом с залежами угля.' },
    beachclub: { tourism: 18, hotel: 25, beach: true, name: 'Пляжный клуб', icon: '🏝️', w: 1, h: 1, cost: 1200, upkeep: 5, unlock: 3, nearWater: true, sh: 50, desc: 'Ставится у воды. Привлекает туристов.' },
    hotel: { hotel: 90, beach: true, name: 'Отель', icon: '🏨', w: 2, h: 2, cost: 4500, upkeep: 15, unlock: 4, sh: 170, desc: 'Места для туристов. У пляжа — бонус.' },
    tvtower: { tourism: 50, name: 'Телебашня', icon: '📡', w: 2, h: 2, cost: 15000, upkeep: 20, unlock: 9, service: { kind: 'park', r: 10 }, lv: 0.2, happy: 0.05, sh: 330, desc: 'Самое высокое сооружение.' },
  };

  // Инструменты
  G.TOOLS = {
    inspect: { name: 'Осмотр', icon: '👆', kind: 'inspect', unlock: 1 },
    road: { name: 'Дорога', icon: '🛣️', kind: 'line', cost: 10, unlock: 1, desc: 'Перетащите для прокладки. Над водой — мост ($40).' },
    zoneR: { name: 'Жилая зона', icon: '🏠', kind: 'rect', zone: 1, cost: 5, unlock: 1, desc: 'Здесь будут строиться дома.' },
    zoneC: { name: 'Коммерческая', icon: '🏪', kind: 'rect', zone: 2, cost: 5, unlock: 1, desc: 'Магазины и офисы.' },
    zoneI: { name: 'Промышленная', icon: '🏭', kind: 'rect', zone: 3, cost: 5, unlock: 1, desc: 'Заводы и склады. Загрязняют.' },
    dezone: { name: 'Снять зону', icon: '🧽', kind: 'rect', cost: 0, unlock: 1, desc: 'Убирает разметку зоны.' },
    tree: { name: 'Деревья', icon: '🌲', kind: 'rect', cost: 15, unlock: 1, desc: 'Немного снижают загрязнение.' },
    move: { name: 'Переместить', icon: '🚚', kind: 'move', cost: 0, unlock: 1, desc: 'Перенесите здание на новое место бесплатно.' },
    bulldoze: { name: 'Снос', icon: '🧨', kind: 'rect', cost: 5, unlock: 1, desc: 'Сносит постройки, дороги и деревья.' },
  };
  for (const k in G.BLD) G.TOOLS[k] = Object.assign({ kind: 'place', bld: k }, G.BLD[k]);

  G.CATS = [
    { id: 'roads', icon: '🛣️', name: 'Дороги', tools: ['road', 'tree', 'move'] },
    { id: 'zones', icon: '🏘️', name: 'Зоны', tools: ['zoneR', 'zoneC', 'zoneI', 'dezone'] },
    { id: 'power', icon: '⚡', name: 'Энергия', tools: ['wind', 'coal', 'solar', 'nuclear'] },
    { id: 'water', icon: '💧', name: 'Вода', tools: ['waterTower', 'pump', 'sewage'] },
    { id: 'waste', icon: '♻️', name: 'Отходы', tools: ['landfill', 'recycling'] },
    { id: 'safety', icon: '🚒', name: 'Службы', tools: ['police', 'fire', 'clinic', 'hospital', 'policeHQ'] },
    { id: 'edu', icon: '🎓', name: 'Знания', tools: ['school', 'library', 'university'] },
    { id: 'fun', icon: '🌳', name: 'Отдых', tools: ['park', 'plaza', 'bigpark', 'stadium'] },
    { id: 'land', icon: '🏛️', name: 'Особые', tools: ['cityhall', 'monument', 'ferris', 'tvtower'] },
    { id: 'goods', icon: '⛏️', name: 'Добыча', tools: ['sawmill', 'quarry', 'coalmine'] },
    { id: 'tour', icon: '🏖️', name: 'Туризм', tools: ['beachclub', 'hotel'] },
    { id: 'bulldoze', icon: '🧨', name: 'Снос', tool: 'bulldoze' },
  ];

  G.OVERLAYS = [
    { id: 'power', name: 'Электричество', icon: '⚡' },
    { id: 'water', name: 'Вода', icon: '💧' },
    { id: 'sewage', name: 'Канализация', icon: '🚽' },
    { id: 'garbage', name: 'Мусор', icon: '🗑️' },
    { id: 'lv', name: 'Стоимость земли', icon: '💎' },
    { id: 'pol', name: 'Загрязнение', icon: '☁️' },
    { id: 'crime', name: 'Преступность', icon: '🦹' },
    { id: 'police', name: 'Полиция', icon: '🚓' },
    { id: 'fire', name: 'Пожарные', icon: '🚒' },
    { id: 'health', name: 'Здоровье', icon: '🏥' },
    { id: 'edu', name: 'Образование', icon: '🎓' },
    { id: 'park', name: 'Отдых', icon: '🌳' },
    { id: 'res', name: 'Природные ресурсы', icon: '⛏️' },
  ];
  // Стройматериалы для повышения уровня зданий
  G.MAT = { 2: { wood: 1 }, 3: { stone: 2, wood: 1 }, 4: { stone: 5, wood: 2 } };
  G.COAL_USE = 20; // уголь в день на одну ТЭС

  G.xpFor = lvl => Math.floor(90 * Math.pow(lvl, 1.75));
  G.MAX_LEVEL = 15;

  const pc = (g, t) => g.stats.placed[t] || 0;
  const cnt = (g, z) => g.stats.zoneTiles[z] || 0;
  G.QUESTS = [
    { t: 'Проложите 12 клеток дороги', p: g => [pc(g, 'road'), 12], m: 500, xp: 40 },
    { t: 'Разметьте 8 жилых клеток', p: g => [cnt(g, 1), 8], m: 300, xp: 40 },
    { t: 'Постройте ветряк', p: g => [pc(g, 'wind'), 1], m: 300, xp: 40 },
    { t: 'Постройте водонапорную башню', p: g => [pc(g, 'waterTower'), 1], m: 300, xp: 40 },
    { t: 'Население — 40 жителей', p: g => [g.stats.pop, 40], m: 800, xp: 80 },
    { t: 'Разметьте 4 коммерческие клетки', p: g => [cnt(g, 2), 4], m: 400, xp: 50 },
    { t: 'Разметьте 4 промышленные клетки', p: g => [cnt(g, 3), 4], m: 400, xp: 50 },
    { t: 'Посадите сквер', p: g => [pc(g, 'park'), 1], m: 300, xp: 50 },
    { t: 'Население — 120 жителей', p: g => [g.stats.pop, 120], m: 1500, xp: 120 },
    { t: 'Постройте очистные сооружения', p: g => [pc(g, 'sewage'), 1], m: 800, xp: 80 },
    { t: 'Откройте полицейский участок', p: g => [pc(g, 'police'), 1], m: 600, xp: 80 },
    { t: 'Постройте мэрию', p: g => [pc(g, 'cityhall'), 1], m: 1000, xp: 100 },
    { t: '5 зданий 2-го уровня', p: g => [g.stats.lvl2, 5], m: 1500, xp: 120 },
    { t: 'Откройте пожарную часть', p: g => [pc(g, 'fire'), 1], m: 800, xp: 100 },
    { t: 'Население — 300 жителей', p: g => [g.stats.pop, 300], m: 2500, xp: 150 },
    { t: 'Счастье жителей 65%+', p: g => [Math.round(g.stats.happy * 100), 65], m: 1500, xp: 150 },
    { t: 'Постройте лесопилку', p: g => [pc(g, 'sawmill'), 1], m: 800, xp: 80 },
    { t: 'Постройте школу', p: g => [pc(g, 'school'), 1], m: 1500, xp: 150 },
    { t: 'Постройте полигон отходов', p: g => [pc(g, 'landfill'), 1], m: 1200, xp: 120 },
    { t: '3 здания 3-го уровня', p: g => [g.stats.lvl3, 3], m: 3000, xp: 200 },
    { t: 'Население — 800 жителей', p: g => [g.stats.pop, 800], m: 5000, xp: 250 },
    { t: 'Основайте второй город в регионе', p: g => [G.Region.data ? G.Region.data.cities.length : 1, 2], m: 3000, xp: 250 },
    { t: 'Наладьте торговый маршрут', p: g => [G.Region.data ? G.Region.data.routes.length : 0, 1], m: 2000, xp: 200 },
    { t: 'Постройте больницу', p: g => [pc(g, 'hospital'), 1], m: 3000, xp: 250 },
    { t: 'Накопите $30 000', p: g => [g.money, 30000], m: 3000, xp: 250 },
    { t: 'Население — 2 000 жителей', p: g => [g.stats.pop, 2000], m: 8000, xp: 400 },
    { t: '100 туристов в день', p: g => [g.tour ? g.tour.tourists : 0, 100], m: 5000, xp: 400 },
    { t: 'Постройте стадион', p: g => [pc(g, 'stadium'), 1], m: 6000, xp: 400 },
    { t: 'Небоскрёб: здание 4-го уровня', p: g => [g.stats.lvl4, 1], m: 6000, xp: 400 },
    { t: 'Постройте АЭС', p: g => [pc(g, 'nuclear'), 1], m: 8000, xp: 500 },
    { t: 'Население — 5 000 жителей', p: g => [g.stats.pop, 5000], m: 15000, xp: 700 },
    { t: 'Постройте телебашню', p: g => [pc(g, 'tvtower'), 1], m: 10000, xp: 700 },
    { t: 'Население — 10 000 жителей', p: g => [g.stats.pop, 10000], m: 30000, xp: 1200 },
  ];

  G.CHAT = [
    'Обожаю наш район! Только бы парк поближе 🌳',
    'Пробки? Какие пробки, у нас всё отлично!',
    'Мэр, спасибо за новые дороги!',
    'Хочу, чтобы рядом открыли кафе ☕',
    'Вчера видел енота на крыше мэрии 🦝',
    'Налоги бы чуть пониже…',
    'Мой кот считает, что вы лучший мэр 🐈',
    'Когда построят стадион? ⚽',
    'Отличный вид из окна!',
    'Ночью город такой красивый ✨',
    'Нашёл работу недалеко от дома 👍',
    'Пусть заводы будут подальше от домов 🙏',
    'Дети пошли в новую школу 🎒',
    'Сосед опять сажает помидоры на балконе 🍅',
  ];
})(window.G);
