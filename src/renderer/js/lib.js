// Общие утилиты интерфейса: preact/htm, глобальное состояние, вызовы main-процесса, тосты.
import { h, render, Fragment } from '../vendor/preact.js';
import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from '../vendor/hooks.js';
import htm from '../vendor/htm.js';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect };

export const api = window.zue;

// ---------- глобальное состояние ----------
const listeners = new Set();
export const S = {
  ready: false,
  info: null,
  cfg: null,
  scan: { versions: [], custom: { bats: [], fakes: [], lists: [] } },
  status: { state: 'off', run: null, service: { installed: false, state: 'NONE' } },
  page: 'home',
  tests: { running: false, combos: [], results: {}, log: [], current: null, done: null, total: 0, optimal: false, targets: [], startedAt: 0 },
  toasts: [],
  modal: null,
};
let scheduled = false;
let version = 0;
export function update(fn) {
  if (fn) fn(S);
  version++;
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; for (const l of listeners) l(); });
}
export function useStore() {
  const [, force] = useState(0);
  const seen = useRef(version);
  seen.current = version;
  useLayoutEffect(() => {
    const l = () => force(x => x + 1);
    listeners.add(l);
    if (seen.current !== version) l(); // обновление пришло до подписки
    return () => listeners.delete(l);
  }, []);
  return S;
}

// ---------- тосты и модалки ----------
let toastId = 0;
export function toast(text, type = 'info', ms = 3800) {
  const id = ++toastId;
  update(s => { s.toasts = [...s.toasts, { id, text, type }]; });
  setTimeout(() => update(s => { s.toasts = s.toasts.map(t => t.id === id ? { ...t, out: true } : t); }), ms);
  setTimeout(() => update(s => { s.toasts = s.toasts.filter(t => t.id !== id); }), ms + 300);
}
export function openModal(render) { update(s => { s.modal = render; }); }
export function closeModal() { update(s => { s.modal = null; }); }
export function confirmDialog(title, text, okText = 'Да', danger = false) {
  return new Promise((resolve) => {
    openModal(() => html`<div class="modal-body"><h3>${title}</h3><div class="dim" style="white-space:pre-wrap">${text}</div></div>
      <div class="modal-foot"><button class="btn" onClick=${() => { closeModal(); resolve(false); }}>Отмена</button>
      <button class=${'btn ' + (danger ? 'primary' : 'primary')} onClick=${() => { closeModal(); resolve(true); }}>${okText}</button></div>`);
  });
}
export function promptDialog(title, label, value = '', okText = 'OK') {
  return new Promise((resolve) => {
    let v = value;
    const done = (r) => { closeModal(); resolve(r); };
    openModal(() => html`<div class="modal-body"><h3>${title}</h3><div class="field"><label>${label}</label>
      <input class="input" autofocus value=${v} onInput=${e => { v = e.target.value; }} onKeyDown=${e => { if (e.key === 'Enter') done(v); if (e.key === 'Escape') done(null); }} ref=${el => el && setTimeout(() => el.focus(), 30)} /></div></div>
      <div class="modal-foot"><button class="btn" onClick=${() => done(null)}>Отмена</button><button class="btn primary" onClick=${() => done(v)}>${okText}</button></div>`);
  });
}

/** Вызов с показом ошибки тостом. */
export async function call(ch, ...args) {
  try { return await api.call(ch, ...args); } catch (e) { toast(e.message, 'error', 6000); throw e; }
}

// ---------- конфиг ----------
let patchChain = Promise.resolve();
export function patchCfg(partial) {
  Object.assign(S.cfg, partial);
  update();
  patchChain = patchChain.then(() => api.call('config:patch', partial)).then(c => { S.cfg = c; update(); }).catch(e => toast(e.message, 'error'));
  return patchChain;
}

export function curVersion() { return S.scan.versions.find(v => v.id === S.cfg.selectedVersion) || null; }
export function allBats(ver = curVersion()) {
  return [...(ver ? ver.bats : []), ...S.scan.custom.bats];
}
export function batByKey(key, ver = curVersion()) { return allBats(ver).find(b => b.key === key) || null; }
export function activeProfile() { return S.cfg.profiles.find(p => p.id === S.cfg.activeProfileId) || S.cfg.profiles[0]; }

// ---------- слои настроек ----------
export const SCOPE_LABEL = { base: 'База', profile: 'Профиль', version: 'Версия', bat: 'Батник' };
export function layerOf(scope, cfg = S.cfg) {
  if (scope === 'base') return cfg.base;
  if (scope === 'profile') return (cfg.profiles.find(p => p.id === cfg.activeProfileId) || {}).overrides || {};
  if (scope === 'version') return cfg.versionOverrides[cfg.selectedVersion] || {};
  if (scope === 'bat') return cfg.batOverrides[cfg.selectedBat] || {};
  return {};
}
export function effective(upTo = 'bat') {
  const order = ['base', 'profile', 'version', 'bat'];
  const out = { ...S.info.defaults };
  const src = {};
  for (const k of Object.keys(out)) src[k] = 'default';
  for (const sc of order) {
    const l = layerOf(sc);
    for (const [k, v] of Object.entries(l)) if (v !== undefined && v !== null) { out[k] = v; src[k] = sc; }
    if (sc === upTo) break;
  }
  return { values: out, source: src };
}
export function setSetting(scope, key, value) {
  const c = S.cfg;
  const del = value === undefined;
  const apply = (obj) => { const o = { ...(obj || {}) }; if (del) delete o[key]; else o[key] = value; return o; };
  if (scope === 'base') return patchCfg({ base: apply(c.base) }).then(afterSettingChange);
  if (scope === 'profile') return patchCfg({ profiles: c.profiles.map(p => p.id === c.activeProfileId ? { ...p, overrides: apply(p.overrides) } : p) }).then(afterSettingChange);
  if (scope === 'version') return patchCfg({ versionOverrides: { ...c.versionOverrides, [c.selectedVersion]: apply(c.versionOverrides[c.selectedVersion]) } }).then(afterSettingChange);
  if (scope === 'bat') return patchCfg({ batOverrides: { ...c.batOverrides, [c.selectedBat]: apply(c.batOverrides[c.selectedBat]) } }).then(afterSettingChange);
}

let restartTimer = null;
export function afterSettingChange() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(async () => {
    const st = S.status;
    if (!S.cfg.app.autoRestart || st.state !== 'running' || !st.run || st.run.external) return;
    try {
      await api.call('zapret:start', { versionId: S.cfg.selectedVersion, batKey: S.cfg.selectedBat });
      toast('Запрет перезапущен с новыми настройками', 'ok', 2500);
    } catch (e) { toast(e.message, 'error', 6000); }
  }, 900);
}

// ---------- форматирование ----------
export function fmtSize(n) { if (n < 1024) return n + ' Б'; if (n < 1048576) return (n / 1024).toFixed(1) + ' КБ'; return (n / 1048576).toFixed(1) + ' МБ'; }
export function fmtTime(ts) { const d = new Date(ts); return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
export function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? hh + ':' : '') + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}
export const cls = (...a) => a.filter(Boolean).join(' ');
export function scoreColor(p) {
  const hue = Math.max(0, Math.min(120, p * 1.2));
  return `hsl(${hue} 70% 42%)`;
}
export const GF_LABEL = { disabled: 'выкл', all: 'TCP+UDP', tcp: 'TCP', udp: 'UDP', 'n/a': 'нет' };
export const IPSET_LABEL = { loaded: 'loaded', none: 'none', any: 'any', 'n/a': 'нет' };
export const STATE_TEXT = { off: 'Выключен', running: 'Обход работает', service: 'Работает как сервис', testing: 'Идёт проверка', starting: 'Запуск…' };
