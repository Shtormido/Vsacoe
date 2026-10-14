// Расходники: заказываются на компьютере, тратятся при работе.

export const SUPPLIES = {
  shampoo: { name: 'Шампунь', unit: 'фл.', pack: 5, price: 600, icon: 'shampoo', desc: 'Один флакон — на одно мытьё. Без шампуня не отмыть грязь.' },
  firstaid: { name: 'Аптечка', unit: 'шт.', pack: 1, price: 450, icon: 'firstaid', desc: 'Обработать порез питомца, свою травму или травму сотрудника.' },
  treats: { name: 'Лакомства', unit: 'шт.', pack: 10, price: 300, icon: 'treat', needs: 'treats', desc: 'Одно лакомство успокаивает питомца.' },
  bows: { name: 'Бантики', unit: 'шт.', pack: 10, price: 400, icon: 'bow', needs: 'bows', desc: 'Один бантик на питомца.' },
  perfume: { name: 'Парфюм', unit: 'порц.', pack: 5, price: 500, icon: 'perfume', needs: 'perfume', desc: 'Одна порция на питомца.' },
};

export const START_STOCK = { shampoo: 8, firstaid: 2, treats: 0, bows: 0, perfume: 0 };

// При покупке оборудования в магазине сразу даётся стартовый запас.
export const UNLOCK_STOCK = { treats: { treats: 10 }, bows: { bows: 10 }, perfume: { perfume: 5 } };
