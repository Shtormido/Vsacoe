import { dateKey } from './dates';
import { dayStats, previousDay } from './store';
import { State } from './types';

export const MASCOT_NAME = 'Братан';
export const MASCOT_EMOJI = '🦝';

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

const PHRASES: Record<Mood, string[]> = {
  disappointed: [
    'Брат, я думал ты сможешь...',
    'Ты подвёл не меня. Ты подвёл того самого маленького ребёнка, который сидит внутри тебя.',
    'Я не злюсь. Я просто разочарован.',
    'Вчера ты сказал «завтра». Так вот, брат, сегодня — то самое завтра.',
    'Брат, диван ещё никого не сделал великим.',
    'Я верил в тебя больше, чем ты сам. Не заставляй меня сомневаться.',
    'Мечты не работают, пока не работаешь ты.',
    'Окей, вчера не вышло. Но если и сегодня так же — я начну переживать.',
  ],
  late: [
    'Брат, день почти всё. Осталось {left} — ты ещё успеваешь!',
    'Не ложись спать проигравшим. Закрой хотя бы одну задачу.',
    'Брат, я думал ты сможешь... Докажи, что я был прав.',
    'Маленький ребёнок внутри тебя ждёт. Осталось {left}. Не подведи его.',
  ],
  notStarted: [
    'Список есть, галочек нет. Начни с самого простого.',
    'Брат, первый шаг — самый тяжёлый. Сделай его прямо сейчас.',
    'Просто начни. На пять минут. Дальше пойдёт само.',
    'Я сижу и жду первую галочку. Не томи, брат.',
  ],
  inProgress: [
    'Хорош, брат! Уже {done} из {total}. Не сбавляй!',
    'Вижу прогресс. Продолжай в том же духе 💪',
    'Каждая галочка — кирпич в твоём будущем. Осталось {left}.',
    'Ты в ударе, брат. Добивай!',
  ],
  proud: [
    'Брат, я горжусь тобой! 🔥',
    'Вот это я понимаю — машина!',
    'Маленький ребёнок внутри тебя сейчас очень счастлив.',
    'Сегодня ты стал лучше, чем вчера. Уважение.',
    'Всё закрыто. Легенда.',
  ],
  empty: [
    'Брат, а цели где? Без цели даже стрела не летит.',
    'Пустой список — пустой день. Давай хоть одну цель.',
    'Я жду твой план. Даже одна маленькая задача — уже шаг.',
  ],
  future: [
    'Планируешь заранее? Уважаю, брат.',
    'Тот, кто планирует завтра, уже наполовину победил.',
  ],
  motivation: [
    'Брат, прочитай это вслух. Два раза.',
    'Запомни эту фразу и иди делать.',
    'Это не просто слова. Это про тебя.',
  ],
};

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Фраза стабильна для дня и настроения; `shift` (нажатия на маскота) листает её дальше. */
export function mascotPhrase(mood: Mood, seed: string, shift: number, vars: Record<string, number> = {}) {
  const list = PHRASES[mood];
  const h = hash(seed + mood);
  // Разочарованный Братан начинает с двух коронных фраз, остальные — по нажатию.
  const text = mood === 'disappointed' && shift === 0 ? list[h % 2] : list[(h + shift) % list.length];
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function randomPhrase(mood: Mood) {
  const list = PHRASES[mood];
  return list[Math.floor(Math.random() * list.length)];
}

/** Как Братан относится к выбранному дню. */
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
