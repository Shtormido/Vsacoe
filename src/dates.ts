export const pad = (n: number) => String(n).padStart(2, '0');

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** 0 = понедельник … 6 = воскресенье */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

export function mondayOf(d: Date) {
  const day = startOfDay(d);
  return addDays(day, -weekdayIndex(day));
}

export const dayList = (key: string) => `d:${key}`;
export const weekList = (mondayKey: string) => `w:${mondayKey}`;

export function relativeDay(d: Date, today = startOfDay(new Date())): string | null {
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  return null;
}

export function formatDay(d: Date) {
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEKDAYS_LONG[weekdayIndex(d)]}`;
}

export function formatWeek(monday: Date) {
  const sunday = addDays(monday, 6);
  const start =
    monday.getMonth() === sunday.getMonth()
      ? `${monday.getDate()}`
      : `${monday.getDate()} ${MONTHS_GEN[monday.getMonth()]}`;
  return `${start} – ${sunday.getDate()} ${MONTHS_GEN[sunday.getMonth()]}`;
}

export function parseTime(t: string) {
  const [hour, minute] = t.split(':').map(Number);
  return { hour, minute };
}

export const formatTime = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;

/** plural(3, ['задача', 'задачи', 'задач']) → "задачи" */
export function plural(n: number, forms: [string, string, string]) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

export function describeDays(days: number[]) {
  const s = [...days].sort((a, b) => a - b).join(',');
  if (s === '0,1,2,3,4,5,6') return 'Каждый день';
  if (s === '0,1,2,3,4') return 'По будням';
  if (s === '5,6') return 'По выходным';
  return [...days].sort((a, b) => a - b).map((d) => WEEKDAYS_SHORT[d]).join(', ');
}
