import { REGULARS } from '../data/clients.js';
import { STARTER_ITEMS } from '../data/shop.js';
import { SALONS } from '../data/salons.js';

const SAVE_KEY = 'pushistik_save_v1';
const SETTINGS_KEY = 'pushistik_settings_v1';

export function newState(name) {
  return {
    version: 1,
    name,
    day: 1,
    money: 12000,
    rep: 3.0,
    chapter: 1,
    salon: null,
    owned: [...STARTER_ITEMS],
    adsDays: 0,
    regulars: Object.fromEntries(REGULARS.map((r) => [r.id, { visits: 0, loyalty: 0, lastDay: -99, declined: 0 }])),
    flags: {},
    stats: { served: 0, earned: 0, best: 0, perfect: 0 },
    today: null,
  };
}

export function salonTier(s) {
  return s.salon ? SALONS[s.salon].tier : 0;
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
    return s && s.version === 1 ? s : null;
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

export const DEFAULT_SETTINGS = { sfx: 0.8, music: 0.35, quality: 'high', shells: 26 };

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
