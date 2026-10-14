import { REGULARS } from '../data/clients.js';
import { STARTER_ITEMS } from '../data/shop.js';
import { SALONS } from '../data/salons.js';
import { START_STOCK } from '../data/supplies.js';

const SAVE_KEY = 'pushistik_save_v1';
const SETTINGS_KEY = 'pushistik_settings_v1';

export const DEFAULT_LOOK = {
  body: 'woman', skin: 'fair', hair: 'ponytail', hairColor: '#6b4423', top: '#ffffff', bottom: '#3a4a6a',
  shoes: '#2b2525', apron: '#5fd0b5', glasses: false, cap: false, beard: false, capColor: '#e0504f',
};

export function newState(name) {
  return migrate({
    version: 1,
    name,
    day: 1,
    money: 12000,
    rep: 3.0,
    chapter: 1,
    salon: null,
    owned: [...STARTER_ITEMS],
    adsDays: 0,
    regulars: {},
    flags: {},
    stats: { served: 0, earned: 0, best: 0, perfect: 0 },
    today: null,
  });
}

/** Дополняет старые сохранения новыми полями. */
export function migrate(s) {
  for (const r of REGULARS) s.regulars[r.id] ||= { visits: 0, loyalty: 0, lastDay: -99, declined: 0 };
  if (s.version < 2) s.today = null;
  s.version = 2;
  s.look ||= { ...DEFAULT_LOOK };
  s.stock ||= { ...START_STOCK };
  for (const k of Object.keys(START_STOCK)) s.stock[k] ??= 0;
  s.deliveries ||= [];
  s.bookings ||= {};
  s.requests ||= [];
  s.site ||= { name: 'Пушистый салон', slogan: 'Стрижём с любовью', color: '#ff6f96', priceMul: 1, upgrades: [], reviews: [] };
  s.theme ||= { id: 'original', accent: null };
  s.themesOwned ||= ['original'];
  s.staff ||= [];
  s.skills ||= { player: [], salon: [] };
  s.level ||= 1;
  s.xp ||= 0;
  s.points ||= 0;
  s.injury ||= null;
  s.finance ||= [];
  s.mail ||= [];
  return s;
}

export function salonTier(s) {
  return s.salon ? SALONS[s.salon].tier : 0;
}

export function addMail(s, from, subject, body) {
  s.mail.unshift({ id: `${s.day}_${s.mail.length}_${Math.random().toString(36).slice(2, 6)}`, day: s.day, from, subject, body, read: false });
  if (s.mail.length > 40) s.mail.length = 40;
}

export function save(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.version >= 1 ? migrate(s) : null;
  } catch {
    return null;
  }
}

export function wipe() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export const DEFAULT_SETTINGS = { sfx: 0.8, music: 0.35, quality: 'high' };

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
