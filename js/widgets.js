// Элементы меню: иконки, шкалы, отметки, штампы
const ING = {
  meat: 'Обычное мясо', pet: 'Мясо животных', special: 'Особый ресурс', buns: 'Булочки', veg: 'Овощи',
  sauce: 'Соусы', chicken: 'Курица', potato: 'Картофель', blanks: 'Чистые бланки'
};
const pct = p => Math.round(clamp(p, 0, 1) * 100) + '%';

function icon(kind, id, size = 32, meat) {
  return `<img class="px ico" src="${iconURL(kind, id, meat)}" width="${size}" height="${size}" alt="">`;
}
// шкала: v из max, cls — цвет (good, bad, warn, info, gold)
function meter(v, max = 100, cls = 'good', label = '', right = '') {
  const w = Math.round(clamp(v / max, 0, 1) * 100);
  return `<div class="meter ${cls}">${label ? `<span class="ml">${label}</span>` : ''}<div class="mbar"><i style="width:${w}%"></i></div>${right !== '' ? `<span class="mr">${right}</span>` : ''}</div>`;
}
// цвет шкалы, где «больше — хуже»
const riskCls = v => v > 66 ? 'bad' : v > 33 ? 'warn' : 'good';
const goodCls = v => v < 33 ? 'bad' : v < 66 ? 'warn' : 'good';
function pips(n, max, cls = '') { let s = ''; for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`; return `<span class="pips ${cls}">${s}</span>`; }
const chip = (text, cls = '') => `<span class="chip ${cls}">${text}</span>`;
const stamp = (text, cls = '') => `<span class="stamp ${cls}">${text}</span>`;
const kv = (k, v, cls = '') => `<div class="kv ${cls}"><span>${k}</span><b>${v}</b></div>`;
const tip = (text) => `<div class="hint">💡 ${text}</div>`;
const portraitImg = (look, cls = '') => `<img class="px portrait-mini ${cls}" src="${portraitURL(look)}" alt="">`;

// шапка меню: иконка, заголовок, подзаголовок, справа — доп. блок
function menuHead(ico, title, sub = '', right = '') {
  return `<div class="mhead"><div class="mh-ico">${ico}</div><div class="mh-t"><h2>${title}</h2>${sub ? `<div class="mh-sub">${sub}</div>` : ''}</div>${right ? `<div class="mh-r">${right}</div>` : ''}</div>`;
}

// модификаторы, влияющие на кухню — показываем игроку, откуда берутся цифры
function kitchenMods(stId) {
  const lvl = stId === 'fryer' ? G.upgrades.fryer : G.upgrades.grill;
  const parts = [`выносливость ${Math.round(G.stamina)} → ×${(1 + (100 - G.stamina) / 120).toFixed(2)}`];
  if (lvl) parts.push(`улучшение ${lvl} → ×${(1 - lvl * 0.12).toFixed(2)}`);
  if (hasStaff('helper')) parts.push('помощник → ×0.85');
  return parts.join(' · ');
}

// шанс, что клиент заподозрит особый ресурс (как в Kitchen.finishCustomer)
function specialRisk(attention, signature) { return 0.04 + attention * 0.18 + G.rumors / 500 + (signature ? 0.03 : 0); }
