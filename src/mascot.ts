import { dateKey } from './dates';
import { dayStats, previousDay } from './store';
import { Settings, State } from './types';

export const MASCOTS = [
  { id: 'raccoon', emoji: '🦝', name: 'Рокки' },
  { id: 'bear', emoji: '🐻', name: 'Миша' },
  { id: 'wolf', emoji: '🐺', name: 'Акела' },
  { id: 'fox', emoji: '🦊', name: 'Рыжик' },
  { id: 'cat', emoji: '🐱', name: 'Барсик' },
  { id: 'dog', emoji: '🐶', name: 'Бобик' },
  { id: 'lion', emoji: '🦁', name: 'Лёва' },
  { id: 'frog', emoji: '🐸', name: 'Квакс' },
  { id: 'robot', emoji: '🤖', name: 'Бип' },
];

export const DEFAULT_ADDRESS = 'братан';

export type MascotInfo = { emoji: string; name: string; address: string };

/** Маскот с учётом настроек: выбранное животное, своё имя и обращение. */
export function getMascot(settings: Settings): MascotInfo {
  const m = settings.mascot;
  const base = MASCOTS.find((x) => x.id === m.id) ?? MASCOTS[0];
  return {
    emoji: base.emoji,
    name: m.name.trim() || base.name,
    address: m.address.trim() || DEFAULT_ADDRESS,
  };
}

export type Mood = 'proud' | 'disappointed' | 'late' | 'notStarted' | 'inProgress' | 'empty' | 'future' | 'motivation';

export const MOOD_BADGE: Record<Mood, string> = {
  proud: '🔥',
  disappointed: '😔',
  late: '⏰',
  notStarted: '🤨',
  inProgress: '💪',
  empty: '🤔',
  future: '😎',
  motivation: '⚡',
};

// {Addr} — обращение с заглавной (начало фразы), {addr} — как написал пользователь.
const PHRASES: Record<Mood, string[]> = {
  disappointed: [
    '{Addr}, я думал ты сможешь...',
    'Ты подвёл не меня. Ты подвёл того самого маленького ребёнка, который сидит внутри тебя.',
    'Я не злюсь, {addr}. Я просто разочарован.',
    'Вчера ты сказал «завтра». Так вот, {addr}, сегодня — то самое завтра.',
    '{Addr}, диван ещё никого не сделал великим.',
    'Я верил в тебя больше, чем ты сам. Не заставляй меня сомневаться.',
    'Мечты не работают, пока не работаешь ты, {addr}.',
    'Окей, вчера не вышло. Но если и сегодня так же — я начну переживать.',
  ],
  late: [
    '{Addr}, день почти всё. Осталось {left} — ты ещё успеваешь!',
    'Не ложись спать проигравшим, {addr}. Закрой хотя бы одну задачу.',
    '{Addr}, я думал ты сможешь... Докажи, что я был прав.',
    'Маленький ребёнок внутри тебя ждёт. Осталось {left}. Не подведи его.',
  ],
  notStarted: [
    'Список есть, галочек нет. Начни с самого простого, {addr}.',
    '{Addr}, первый шаг — самый тяжёлый. Сделай его прямо сейчас.',
    'Просто начни. На пять минут. Дальше пойдёт само.',
    'Я сижу и жду первую галочку. Не томи, {addr}.',
  ],
  inProgress: [
    'Хорош, {addr}! Уже {done} из {total}. Не сбавляй!',
    'Вижу прогресс. Продолжай в том же духе 💪',
    'Каждая галочка — кирпич в твоём будущем. Осталось {left}.',
    'Ты в ударе, {addr}. Добивай!',
  ],
  proud: [
    '{Addr}, я горжусь тобой! 🔥',
    'Вот это я понимаю — машина!',
    'Маленький ребёнок внутри тебя сейчас очень счастлив.',
    'Сегодня ты стал лучше, чем вчера. Уважение, {addr}.',
    'Всё закрыто. Легенда.',
  ],
  empty: [
    '{Addr}, а цели где? Без цели даже стрела не летит.',
    'Пустой список — пустой день. Давай хоть одну цель, {addr}.',
    'Я жду твой план. Даже одна маленькая задача — уже шаг.',
  ],
  future: [
    'Планируешь заранее? Уважаю, {addr}.',
    'Тот, кто планирует завтра, уже наполовину победил.',
  ],
  motivation: [
    '{Addr}, прочитай это вслух. Два раза.',
    'Запомни эту фразу и иди делать, {addr}.',
    'Это не просто слова. Это про тебя.',
  ],
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Подставляет обращение и числа в шаблон фразы. */
export function fill(text: string, address: string, vars: Record<string, number> = {}) {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (k === 'addr') return address;
    if (k === 'Addr') return capitalize(address);
    return String(vars[k] ?? '');
  });
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Фраза стабильна для дня и настроения; `shift` (нажатия на маскота) листает её дальше. */
export function mascotPhrase(mood: Mood, seed: string, shift: number, address: string, vars: Record<string, number> = {}) {
  const list = PHRASES[mood];
  const h = hash(seed + mood);
  // Разочарованный маскот начинает с двух коронных фраз, остальные — по нажатию.
  const text = mood === 'disappointed' && shift === 0 ? list[h % 2] : list[(h + shift) % list.length];
  return fill(text, address, vars);
}

/** Как маскот относится к выбранному дню. */
export function dayMood(state: State, key: string, now: Date): Mood {
  const todayKey = dateKey(now);
  const { done, total } = dayStats(state, key);
  if (total > 0 && done === total) return 'proud';
  if (key < todayKey) return total > 0 ? 'disappointed' : 'empty';
  if (key > todayKey) return 'future';
  if (total === 0) return 'empty';
  const y = dayStats(state, previousDay(key));
  if (done === 0 && y.total > 0 && y.done < y.total) return 'disappointed';
  if (now.getHours() >= 20) return 'late';
  return done === 0 ? 'notStarted' : 'inProgress';
}
