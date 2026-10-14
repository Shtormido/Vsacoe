// Магазин: инструменты, косметика и улучшения салона.

export const SHOP = [
  // --- инструменты
  { id: 'clipper', cat: 'tools', name: 'Машинка «Стриж»', price: 2500, icon: 'clipper',
    desc: 'Первая машинка для стрижки. Три насадки: 25%, 45%, 65% длины. Колтуны её забивают.' },
  { id: 'nailclip', cat: 'tools', name: 'Когтерез-гильотина', price: 1200, icon: 'nailclip',
    desc: 'Открывает услугу «Стрижка когтей».' },
  { id: 'brush_pro', cat: 'tools', name: 'Пуходёрка «Облако»', price: 3500, icon: 'brush',
    desc: 'Шире и мягче: колтуны уходят почти в два раза быстрее.' },
  { id: 'scissors_pro', cat: 'tools', name: 'Японские ножницы «Сакура»', price: 7000, icon: 'scissors',
    desc: 'Острее и быстрее обычных. Для идеальной доводки.' },
  { id: 'shower_pro', cat: 'tools', name: 'Душ-насадка «Тропик»', price: 4500, icon: 'shower',
    desc: 'Мощный напор: моет и смывает пену заметно быстрее.' },
  { id: 'dryer_pro', cat: 'tools', name: 'Компрессор «Ураган»', price: 9000, icon: 'dryer',
    desc: 'Профессиональный фен-компрессор. Сушит в 2,5 раза быстрее.' },
  { id: 'clipper_pro', cat: 'tools', name: 'Машинка «Профи»', price: 12000, icon: 'clipper', needs: 'clipper',
    desc: 'Семь насадок, высокая скорость и не боится колтунов.' },
  // --- косметика и аксессуары
  { id: 'treats', cat: 'cosmetics', name: 'Банка лакомств', price: 600, icon: 'treat',
    desc: 'Открывает инструмент «Лакомство» и даёт 10 штук. Докупайте в «Расходниках» на компьютере.' },
  { id: 'bows', cat: 'cosmetics', name: 'Набор бантиков', price: 900, icon: 'bow',
    desc: 'Открывает услугу «Бантик» и даёт 10 штук. Клиенты-модники в восторге.' },
  { id: 'shampoo_hypo', cat: 'cosmetics', name: 'Гипоаллергенный шампунь', price: 1500, icon: 'shampoo',
    desc: 'Для чувствительной кожи. Некоторые клиенты без него не придут.' },
  { id: 'perfume', cat: 'cosmetics', name: 'Парфюм «Ваниль и лапки»', price: 1800, icon: 'perfume',
    desc: 'Открывает услугу «Парфюм» и даёт 5 порций. +чаевые от ценителей.' },
  { id: 'shampoo_premium', cat: 'cosmetics', name: 'Шампунь «Шёлк» премиум', price: 4000, icon: 'shampoo',
    desc: 'Пенится в 1,5 раза лучше. Клиенты чувствуют разницу: +10% к чаевым.' },
  // --- салон
  { id: 'music', cat: 'salon', name: 'Колонка со спокойной музыкой', price: 2500, icon: 'music',
    desc: 'Питомцы успокаиваются в 1,5 раза быстрее.' },
  { id: 'decor', cat: 'salon', name: 'Декор: растения и картины', price: 3000, icon: 'plant',
    desc: 'Уютнее — клиенты добрее: +0,2★ к оценке каждого визита.' },
  { id: 'ads', cat: 'salon', name: 'Реклама в соцсетях (5 дней)', price: 4000, icon: 'ads', repeatable: true,
    desc: '+1 случайный клиент в день на 5 дней.' },
  { id: 'sofa', cat: 'salon', name: 'Диван для ожидания', price: 5000, icon: 'sofa',
    desc: 'Хозяева ждут дольше и спокойнее: больше времени без штрафа.' },
  { id: 'neon', cat: 'salon', name: 'Неоновая вывеска «Лапка»', price: 6000, icon: 'neon',
    desc: 'Стильно! +8% к цене всех услуг.' },
  { id: 'coffee', cat: 'salon', name: 'Кофемашина для гостей', price: 8000, icon: 'coffee',
    desc: 'Хозяева с капучино щедрее: +10% к чаевым.' },
  { id: 'table_hydro', cat: 'salon', name: 'Гидравлический стол', price: 10000, icon: 'table',
    desc: 'Удобная высота — питомцы нервничают на 20% меньше.' },
];

export const SHOP_CATS = { tools: 'Инструменты', cosmetics: 'Косметика', salon: 'Салон' };

export const STARTER_ITEMS = ['shower', 'shampoo', 'dryer', 'brush', 'scissors'];
