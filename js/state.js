// Состояние игры и справочники
const GAME_VERSION = '1.2 · приём заказов';   // видна на титульном экране — по ней понятно, обновилась ли игра
const MINUTES_PER_SEC = 4;          // скорость игрового времени днём
const OPEN_TIME = 8 * 60, CLOSE_TIME = 24 * 60, WAKE_TIME = 2 * 60;

const MEATS = {
  meat:    { name: 'обычное мясо',  short: 'обыч.', quality: 1.0, color: '#a0522d' },
  pet:     { name: 'мясо животных', short: 'живот.', quality: 1.2, color: '#c0703a' },
  special: { name: 'особый ресурс', short: 'особ.', quality: 1.6, color: '#8e1b1b' }
};

const DISHES = {
  burger:    { name: 'Бургер',    icon: '🍔', station: 'grill',    time: 7, price: 10,  meat: true, need: { buns: 1, veg: 1, sauce: 1 } },
  shawarma:  { name: 'Шаурма',    icon: '🌯', station: 'spit',     time: 8, price: 11,  meat: true, need: { veg: 1, sauce: 1 } },
  signature: { name: 'Фирменный', icon: '⭐', station: 'grill',    time: 10, price: 55, meat: true, special: 2, need: { buns: 1, veg: 1, sauce: 2 } },
  nuggets:   { name: 'Наггетсы',  icon: '🍗', station: 'fryer',    time: 5, price: 6,  need: { chicken: 1 } },
  fries:     { name: 'Картошка',  icon: '🍟', station: 'fryer',    time: 4, price: 5,  need: { potato: 1 } },
  cola:      { name: 'Кола',      icon: '🥤', station: 'drinks',   time: 0, price: 3 },
  fanta:     { name: 'Фанта',     icon: '🍊', station: 'drinks',   time: 0, price: 3 },
  water:     { name: 'Вода',      icon: '💧', station: 'drinks',   time: 0, price: 2 },
  tea:       { name: 'Чай',       icon: '🍵', station: 'drinks',   time: 0, price: 3 },
  coffee:    { name: 'Кофе',      icon: '☕', station: 'drinks',   time: 0, price: 4 }
};
const MAINS = ['burger', 'shawarma'], SIDES = ['nuggets', 'fries'], DRINKS = ['cola', 'fanta', 'water', 'tea', 'coffee'];

const SHOP = [
  { id: 'meat',    name: 'Обычное мясо',      price: 3,  pack: 5 },
  { id: 'pet',     name: 'Мясо животных',     price: 7,  pack: 5 },
  { id: 'buns',    name: 'Булочки',           price: 1,  pack: 10 },
  { id: 'veg',     name: 'Овощи',             price: 1,  pack: 10 },
  { id: 'sauce',   name: 'Соусы',             price: 1,  pack: 10 },
  { id: 'chicken', name: 'Курица (наггетсы)', price: 2,  pack: 10 },
  { id: 'potato',  name: 'Картофель',         price: 1,  pack: 10 },
  { id: 'blanks',  name: 'Чистые бланки',     price: 15, pack: 2 }
];

const UPGRADES = {
  equip:      { name: 'Кухонное оборудование', desc: 'Мощнее конфорки и фритюр: все блюда готовятся быстрее (−10% времени за уровень)', max: 3, cost: l => 160 + l * 140 },
  grill:      { name: 'Гриль',            desc: '+1 место на гриле и вертеле, быстрее готовка', max: 3, cost: l => 150 + l * 150 },
  fryer:      { name: 'Фритюр',           desc: '+1 корзина, быстрее жарка',                    max: 3, cost: l => 120 + l * 120 },
  recipes:    { name: 'Рецепты',          desc: '+10% к качеству блюд и чаевым',                max: 3, cost: l => 200 + l * 200 },
  tray:       { name: 'Большой поднос',   desc: '+1 предмет в руках',                           max: 2, cost: l => 100 + l * 150 },
  signature:  { name: 'Фирменное блюдо',  desc: 'Дорогой бургер из особого ресурса для богачей', max: 1, cost: () => 400 },
  soundproof: { name: 'Звукоизоляция',    desc: 'Шире окно в ночной мини-игре, меньше досрочных выездов', max: 3, cost: l => 180 + l * 180 },
  cameras:    { name: 'Камеры',           desc: 'Видно, куда смотрят неспящие; раскрывает часть секретов гостей', max: 2, cost: l => 250 + l * 250 },
  tunnels:    { name: 'Тайные ходы',      desc: 'Люк рядом с номерами — короче путь ночью', max: 1, cost: () => 500 }
};

const REP_TIERS = [[0, 'Дешёвая забегаловка'], [20, 'Приличная закусочная'], [45, 'Популярное место'], [70, 'Знаменитая закусочная'], [90, 'Легендарное место']];
const MOTEL_TIERS = [[0, 'Тихий придорожный приют'], [25, 'Мотель со странностями'], [50, 'Нехорошее место'], [75, 'Место, о котором ходят слухи']];
const tierOf = (tiers, v) => tiers.filter(t => v >= t[0]).pop()[1];

let G;
function newGame() {
  G = {
    day: 1, time: OPEN_TIME, phase: 'title',
    money: 250, stamina: 100, stress: 0,
    suspicion: 0, rumors: 0, cleanliness: 80, conscience: 100, rep: 5,
    forgery: 0,
    stock: { meat: 15, pet: 0, special: 0, buns: 30, veg: 30, sauce: 30, chicken: 20, potato: 20, blanks: 2 },
    equip: { grill: 100, spit: 100, fryer: 100, drinks: 100 },
    upgrades: { equip: 0, grill: 0, fryer: 0, recipes: 0, tray: 0, signature: 0, soundproof: 0, cameras: 0, tunnels: 0 },
    staff: [], candidates: [], guests: [], tails: [], regulars: [],
    helperMeat: 'meat',
    stats: { served: 0, specialServed: 0, kills: 0, earned: 0, angry: 0 },
    dayLog: { earned: 0, served: 0, angry: 0 },
    flags: {}
  };
  for (let i = 0; i < 4; i++) G.guests.push(makeGuest());
  G.candidates = makeCandidates();
}

function save() {
  try { localStorage.setItem('motel-save', JSON.stringify(G)); } catch (e) { /* хранилище недоступно */ }
}
function loadSave() {
  try {
    const s = localStorage.getItem('motel-save'); if (!s) return null;
    const g = JSON.parse(s);
    // новые улучшения в старых сохранениях начинаются с нуля
    g.upgrades = Object.assign(Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])), g.upgrades);
    return g;
  } catch (e) { return null; }
}
function clearSave() { try { localStorage.removeItem('motel-save'); } catch (e) { /* ignore */ } }

function hasStaff(role) { return G.staff.find(s => s.role === role); }
function trayMax() { return 3 + G.upgrades.tray; }
function addRumors(v) { G.rumors = clamp(G.rumors + v, 0, 100); }
function addSuspicion(v) { G.suspicion = clamp(G.suspicion + v, 0, 100); }
function addConscience(v) { G.conscience = clamp(G.conscience + v, 0, 100); }
function addClean(v) { G.cleanliness = clamp(G.cleanliness + v, 0, 100); }
function addRep(v) { G.rep = clamp(G.rep + v, 0, 100); }
