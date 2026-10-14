// Древа прокачки: грумер (очки за уровни), салон (за деньги), сотрудник (очки сотрудника).

export const PLAYER_TREE = [
  { id: 'wash1', name: 'Ловкие руки', desc: 'Душ и шампунь работают на 25% быстрее.', cost: 1, req: [], fx: { washRate: 0.25 }, x: 0, y: 0 },
  { id: 'wash2', name: 'Мастер пены', desc: 'Ещё +25% к мытью, фен сушит на 30% быстрее.', cost: 2, req: ['wash1'], fx: { washRate: 0.25, dryRate: 0.3 }, x: 0, y: 1 },
  { id: 'cut1', name: 'Точный срез', desc: 'Машинка и ножницы на 25% быстрее.', cost: 1, req: [], fx: { cutSpeed: 0.25 }, x: 1, y: 0 },
  { id: 'cut2', name: 'Твёрдая рука', desc: 'Ещё +20% к стрижке, травма руки мешает вдвое меньше.', cost: 2, req: ['cut1'], fx: { cutSpeed: 0.2, steady: 0.5 }, x: 1, y: 1 },
  { id: 'calm1', name: 'Шёпот зверей', desc: 'Питомцы нервничают на 15% меньше.', cost: 1, req: [], fx: { stress: -0.15 }, x: 2, y: 0 },
  { id: 'calm2', name: 'Заклинатель', desc: 'Ещё −15% стресса, лакомство успокаивает вдвое сильнее.', cost: 2, req: ['calm1'], fx: { stress: -0.15, treatPower: 1 }, x: 2, y: 1 },
  { id: 'care1', name: 'Осторожность', desc: 'Порезы случаются вдвое реже.', cost: 1, req: [], fx: { nick: -0.5 }, x: 3, y: 0 },
  { id: 'care2', name: 'Медик', desc: 'Укусы и царапины вдвое реже, аптечка ещё и успокаивает питомца.', cost: 2, req: ['care1'], fx: { bite: -0.5, medic: 1 }, x: 3, y: 1 },
  { id: 'talk1', name: 'Обаяние', desc: '+10% чаевых.', cost: 1, req: [], fx: { tips: 0.1 }, x: 4, y: 0 },
  { id: 'talk2', name: 'Душа компании', desc: 'Ещё +10% чаевых, лояльность растёт быстрее.', cost: 2, req: ['talk1'], fx: { tips: 0.1, loyalty: 1 }, x: 4, y: 1 },
  { id: 'run', name: 'Расторопность', desc: 'Вы ходите на 30% быстрее.', cost: 1, req: ['talk1'], fx: { walk: 0.3 }, x: 5, y: 1 },
  { id: 'master', name: 'Мастер-грумер', desc: '+10% к цене всех ваших услуг.', cost: 3, req: ['wash2', 'cut2', 'calm2'], fx: { price: 0.1 }, x: 1, y: 2 },
  { id: 'star', name: 'Звезда района', desc: '+1 заявка в день и +5% чаевых.', cost: 3, req: ['talk2', 'care2'], fx: { bookings: 1, tips: 0.05 }, x: 4, y: 2 },
];

export const SALON_TREE = [
  { id: 'ads1', name: 'Таргет', desc: '+1 заявка на запись в день.', cost: 3000, req: [], fx: { bookings: 1 }, x: 0, y: 0 },
  { id: 'ads2', name: 'Блогеры', desc: 'Ещё +1 заявка и чаще заходят случайные клиенты.', cost: 9000, req: ['ads1'], fx: { bookings: 1, walkins: 0.5 }, x: 0, y: 1 },
  { id: 'service1', name: 'Гостеприимство', desc: 'Клиенты ждут на 30% дольше.', cost: 4000, req: [], fx: { patience: 0.3 }, x: 1, y: 0 },
  { id: 'service2', name: 'Чайная станция', desc: '+5% чаевых всем мастерам.', cost: 7000, req: ['service1'], fx: { tips: 0.05 }, x: 1, y: 1 },
  { id: 'logistics1', name: 'Оптовые поставки', desc: 'Расходники на 20% дешевле.', cost: 4000, req: [], fx: { supplyDiscount: 0.2 }, x: 2, y: 0 },
  { id: 'logistics2', name: 'Экспресс-доставка', desc: 'Заказы приходят сразу, а не утром.', cost: 8000, req: ['logistics1'], fx: { instant: 1 }, x: 2, y: 1 },
  { id: 'safety1', name: 'Нескользящие коврики', desc: 'Травмы сотрудников −40%, порезы −20%.', cost: 5000, req: [], fx: { staffInjury: -0.4, nick: -0.2 }, x: 3, y: 0 },
  { id: 'hr1', name: 'Обучение персонала', desc: 'Сотрудники получают на 50% больше опыта.', cost: 6000, req: ['safety1'], fx: { staffXp: 0.5 }, x: 3, y: 1 },
  { id: 'prestige1', name: 'Бренд', desc: '+5% к цене всех услуг.', cost: 10000, req: [], fx: { price: 0.05 }, x: 4, y: 0 },
  { id: 'prestige2', name: 'Премиум-сегмент', desc: 'Ещё +8% к цене услуг.', cost: 20000, req: ['prestige1', 'service2'], fx: { price: 0.08 }, x: 4, y: 1 },
];

export const STAFF_TREE = [
  { id: 'spd1', name: 'Скорость I', desc: '+1 к скорости.', cost: 1, req: [], fx: { speed: 1 }, x: 0, y: 0 },
  { id: 'spd2', name: 'Скорость II', desc: '+1 к скорости.', cost: 1, req: ['spd1'], fx: { speed: 1 }, x: 0, y: 1 },
  { id: 'spd3', name: 'Скорость III', desc: '+2 к скорости.', cost: 2, req: ['spd2'], fx: { speed: 2 }, x: 0, y: 2 },
  { id: 'care1', name: 'Аккуратность I', desc: '+1 к аккуратности.', cost: 1, req: [], fx: { care: 1 }, x: 1, y: 0 },
  { id: 'care2', name: 'Аккуратность II', desc: '+1 к аккуратности.', cost: 1, req: ['care1'], fx: { care: 1 }, x: 1, y: 1 },
  { id: 'care3', name: 'Аккуратность III', desc: '+2 к аккуратности.', cost: 2, req: ['care2'], fx: { care: 2 }, x: 1, y: 2 },
  { id: 'charm1', name: 'Обаяние I', desc: '+1 к обаянию.', cost: 1, req: [], fx: { charm: 1 }, x: 2, y: 0 },
  { id: 'charm2', name: 'Обаяние II', desc: '+2 к обаянию.', cost: 2, req: ['charm1'], fx: { charm: 2 }, x: 2, y: 1 },
  { id: 'stam1', name: 'Выносливость I', desc: '+1 к выносливости.', cost: 1, req: [], fx: { stamina: 1 }, x: 3, y: 0 },
  { id: 'stam2', name: 'Выносливость II', desc: '+2 к выносливости.', cost: 2, req: ['stam1'], fx: { stamina: 2 }, x: 3, y: 1 },
  { id: 'cats', name: 'Кошатник', desc: 'Кошек стрижёт на 15% лучше.', cost: 2, req: ['care2'], fx: { cats: 0.15 }, x: 1, y: 3 },
  { id: 'stylist', name: 'Стилист', desc: 'Стрижки на 10% качественнее.', cost: 3, req: ['spd2', 'care2'], fx: { style: 0.1 }, x: 0, y: 3 },
  { id: 'star', name: 'Любимчик клиентов', desc: '+50% к чаевым этого мастера.', cost: 2, req: ['charm2'], fx: { tipMul: 0.5 }, x: 2, y: 2 },
];

const sumFx = (tree, ids, base = {}) => {
  const out = { ...base };
  for (const n of tree) if (ids.includes(n.id)) for (const [k, v] of Object.entries(n.fx)) out[k] = (out[k] || 0) + v;
  return out;
};

/** Суммарные бонусы игрока и салона. */
export function computeMods(state) {
  const m = sumFx(PLAYER_TREE, state.skills?.player || []);
  return sumFx(SALON_TREE, state.skills?.salon || [], m);
}

/** Характеристики сотрудника с учётом его навыков. */
export function staffStats(emp) {
  const fx = sumFx(STAFF_TREE, emp.skills || []);
  const s = { ...emp.stats };
  for (const k of ['speed', 'care', 'charm', 'stamina']) s[k] = Math.min(12, s[k] + (fx[k] || 0));
  return { ...s, cats: fx.cats || 0, style: fx.style || 0, tipMul: fx.tipMul || 0 };
}

export function canUnlock(tree, owned, node) {
  return !owned.includes(node.id) && node.req.every((r) => owned.includes(r));
}

export const xpForLevel = (lvl) => 100 + (lvl - 1) * 60;
export const staffXpForLevel = (lvl) => 80 + (lvl - 1) * 40;
