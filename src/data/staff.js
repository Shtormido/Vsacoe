// Кандидаты на работу: внешность, имена, характеристики.
import { mulberry32, pick } from '../util/math.js';

export const STAFF_PEOPLE = {
  emp1: ['Вика', 'Даша', 'Алина'],
  emp2: ['Артём', 'Руслан', 'Давид'],
  emp3: ['Полина', 'Ксюша', 'Лера'],
  emp4: ['Марат', 'Тимофей', 'Ильдар'],
  emp5: ['Зарина', 'Ника', 'Мадина'],
  emp6: ['Егор', 'Савва', 'Лёва'],
};

export const STAT_NAMES = { speed: 'Скорость', care: 'Аккуратность', charm: 'Обаяние', stamina: 'Выносливость' };

const TRAITS = [
  { id: 'catlover', name: 'Любит кошек', desc: 'с кошками аккуратнее', fx: { cats: 0.1 } },
  { id: 'chatty', name: 'Болтушка', desc: 'клиенты в восторге, но работа медленнее', fx: { charm: 2, speed: -1 } },
  { id: 'perfectionist', name: 'Перфекционист', desc: 'очень аккуратно, но долго', fx: { care: 2, speed: -1 } },
  { id: 'rocket', name: 'Ракета', desc: 'очень быстро, иногда небрежно', fx: { speed: 2, care: -1 } },
  { id: 'student', name: 'Студент колледжа', desc: 'дешевле, быстро учится', fx: { xp: 0.5 }, salary: -0.25 },
  { id: 'veteran', name: 'Ветеран', desc: '15 лет стажа, просит больше', fx: { care: 1, speed: 1, stamina: 1 }, salary: 0.35 },
];

/** Три кандидата на сегодня (стабильно для одного дня). */
export function candidatesFor(day, tier, taken = []) {
  const rng = mulberry32(day * 4241 + 7);
  const ids = Object.keys(STAFF_PEOPLE).filter((p) => !taken.includes(p));
  const out = [];
  for (let i = 0; i < 3 && ids.length; i++) {
    const person = ids.splice(Math.floor(rng() * ids.length), 1)[0];
    const lvlBias = tier * 0.8;
    const r = () => Math.max(1, Math.min(10, Math.round(2 + rng() * 5 + lvlBias + (rng() - 0.5) * 2)));
    const stats = { speed: r(), care: r(), charm: r(), stamina: r() };
    const trait = rng() < 0.7 ? pick(TRAITS, rng) : null;
    if (trait) for (const [k, v] of Object.entries(trait.fx)) if (stats[k] !== undefined) stats[k] = Math.max(1, Math.min(10, stats[k] + v));
    const total = stats.speed + stats.care + stats.charm + stats.stamina;
    const salary = Math.round(((250 + total * 32) * (1 + (trait?.salary || 0))) / 10) * 10;
    out.push({
      id: `${person}_${day}`, person, name: pick(STAFF_PEOPLE[person], rng), stats, trait: trait?.id || null,
      salary, level: 1, xp: 0, points: 0, skills: [], injured: false, jobsToday: 0,
    });
  }
  return out;
}

export function traitOf(emp) {
  return TRAITS.find((t) => t.id === emp.trait) || null;
}
