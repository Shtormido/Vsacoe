// Инструменты грумера: базовые параметры. Покупки в магазине улучшают их.

export const TOOLS = [
  { id: 'shower', name: 'Душ', key: '1', code: 'Digit1', icon: 'shower', model: 'Tool_Shower', radius: 0.07, color: '#7fd3ff',
    hint: 'Намочите шерсть, а после шампуня тщательно смойте пену.' },
  { id: 'shampoo', name: 'Шампунь', key: '2', code: 'Digit2', icon: 'shampoo', model: 'Tool_Shampoo', radius: 0.06, color: '#ff9ec4',
    hint: 'Наносите на мокрую шерсть — так пена лучше растекается.' },
  { id: 'dryer', name: 'Фен', key: '3', code: 'Digit3', icon: 'dryer', model: 'Tool_Dryer', radius: 0.08, color: '#c9b8ff',
    hint: 'Высушите шерсть. Не дуйте долго в морду — питомец нервничает.' },
  { id: 'brush', name: 'Пуходёрка', key: '4', code: 'Digit4', icon: 'brush', model: 'Tool_Brush', radius: 0.045, color: '#ffd166',
    hint: 'Расчёсывает колтуны. Лучше работает по сухой шерсти.' },
  { id: 'clipper', name: 'Машинка', key: '5', code: 'Digit5', icon: 'clipper', model: 'Tool_Clipper', radius: 0.03, color: '#5fd0b5',
    requires: 'clipper', hint: 'Стрижёт до длины насадки. Колёсико + Shift или Q/E — сменить насадку.' },
  { id: 'scissors', name: 'Ножницы', key: '6', code: 'Digit6', icon: 'scissors', model: 'Tool_Scissors', radius: 0.02, color: '#ffffff',
    hint: 'Точная доводка длины. Включите подсказку длины клавишей Tab.' },
  { id: 'nails', name: 'Когтерез', key: '7', code: 'Digit7', icon: 'nailclip', model: 'Tool_NailClipper', radius: 0, color: '#ff9248',
    requires: 'nailclip', hint: 'Кликайте по подсвеченным когтям на лапах.' },
  { id: 'perfume', name: 'Парфюм', key: '8', code: 'Digit8', icon: 'perfume', model: 'Tool_Perfume', radius: 0.1, color: '#ffb3d9',
    requires: 'perfume', hint: 'Пара пшиков по корпусу — и питомец благоухает.' },
  { id: 'bow', name: 'Бантик', key: '9', code: 'Digit9', icon: 'bow', model: 'Tool_Bow', radius: 0, color: '#ff4f81',
    requires: 'bows', hint: 'Кликните по голове, чтобы прикрепить бантик.' },
  { id: 'treat', name: 'Лакомство', key: '0', code: 'Digit0', icon: 'treat', model: 'Tool_Treat', radius: 0, color: '#d99a4e',
    requires: 'treats', hint: 'Успокаивает питомца. Кликните по нему.' },
  { id: 'firstaid', name: 'Аптечка', key: '−', code: 'Minus', icon: 'firstaid', model: 'Tool_FirstAid', radius: 0, color: '#e5484d',
    hint: 'Кликните по порезу, чтобы обработать его. Расходует одну аптечку.' },
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

/** Итоговые параметры инструментов с учётом купленных улучшений. */
export function toolParams(owned) {
  const has = (id) => owned.includes(id);
  return {
    shower: { radius: has('shower_pro') ? 0.09 : 0.07, power: has('shower_pro') ? 1.6 : 1 },
    shampoo: { radius: 0.06, rate: has('shampoo_premium') ? 1.5 : 1 },
    dryer: { radius: has('dryer_pro') ? 0.1 : 0.075, power: has('dryer_pro') ? 2.3 : 0.9 },
    brush: { radius: has('brush_pro') ? 0.06 : 0.045, rate: has('brush_pro') ? 1.8 : 1 },
    clipper: {
      radius: has('clipper_pro') ? 0.038 : 0.03,
      speed: has('clipper_pro') ? 1.6 : 1,
      pro: has('clipper_pro'),
      guards: has('clipper_pro') ? [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.8] : [0.25, 0.45, 0.65],
    },
    scissors: { radius: has('scissors_pro') ? 0.026 : 0.02, speed: has('scissors_pro') ? 1.7 : 1 },
    perfume: { radius: 0.1 },
  };
}
