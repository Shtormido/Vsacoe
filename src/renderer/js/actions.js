// Действия, общие для нескольких страниц.
import { S, api, update, toast, call, patchCfg, confirmDialog, allBats, curVersion } from './lib.js';

export async function refreshScan() {
  const snap = await call('versions:scan');
  S.scan = snap;
  S.cfg = await api.call('config:get');
  update();
}

export async function startZapret(ref = {}) {
  try {
    const r = await api.call('zapret:start', { versionId: S.cfg.selectedVersion, batKey: S.cfg.selectedBat, ...ref });
    toast(`Запущено: ${r.batName} · v${r.version}`, 'ok', 2500);
  } catch (e) { toast(e.message, 'error', 8000); }
}

export async function stopZapret() {
  await call('zapret:stop');
  toast('Обход остановлен', 'info', 2000);
}

export async function selectVersion(id) {
  const c = S.cfg;
  const ver = S.scan.versions.find(v => v.id === id);
  let bat = c.selectedBat;
  if (ver && !allBats(ver).find(b => b.key === bat)) {
    const name = (allBats(curVersion()).find(b => b.key === bat) || {}).name;
    const same = ver.bats.find(b => b.name === name);
    bat = same ? same.key : ((ver.bats.find(b => b.name === 'general') || ver.bats[0] || {}).key || '');
  }
  await patchCfg({ selectedVersion: id, selectedBat: bat });
}

export async function activateProfile(id) {
  const cfg = await call('profile:activate', id);
  S.cfg = cfg; update();
  const p = cfg.profiles.find(x => x.id === id);
  toast(`Профиль «${p.name}» активен`, 'ok', 2000);
  if (S.status.state === 'running' && S.cfg.app.autoRestart && S.status.run && !S.status.run.external) await startZapret();
}

export async function installService(ref = {}) {
  const st = S.status;
  if (st.service.installed && !(await confirmDialog('Заменить сервис?', `Сейчас установлен: ${st.service.bat || '?'}\nУстановить вместо него выбранную стратегию?`, 'Заменить'))) return;
  try {
    const r = await api.call('service:install', { versionId: S.cfg.selectedVersion, batKey: S.cfg.selectedBat, ...ref });
    toast(`Сервис установлен: ${r.bat}`, 'ok');
  } catch (e) { toast(e.message, 'error', 8000); }
}

export async function removeService() {
  if (!(await confirmDialog('Удалить сервис?', 'Сервис zapret будет остановлен и удалён, WinDivert выгружен.', 'Удалить', true))) return;
  await call('service:remove');
  toast('Сервис удалён', 'info');
}

export async function serviceControl(a) {
  await call('service:control', a);
}

/** Тесты: запуск и обработка событий */
export function runTests(opts) {
  update(s => {
    s.tests = { running: true, combos: [], results: {}, log: [], current: null, done: null, total: 0, optimal: !!opts.autoApply && opts.mode === 'quick', targets: [], startedAt: Date.now(), opts };
  });
  return call('tests:run', { versionId: S.cfg.selectedVersion, ...S.cfg.tests, ...opts });
}

export function runOptimal() {
  const ver = curVersion();
  if (!ver) return toast('Сначала выберите версию запрета', 'warn');
  if (S.tests.running) return toast('Проверка уже идёт', 'warn');
  const bats = allBats(ver).map(b => b.key);
  return runTests({ mode: 'quick', bats, autoApply: true });
}

export function onTestEvent(ev) {
  update(s => {
    const t = s.tests;
    if (ev.type === 'start') { t.total = ev.total; t.combos = ev.combos; t.targets = ev.targets; t.testType = ev.testType; }
    else if (ev.type === 'combo-start') { t.current = ev.index; t.results[ev.index] = { ...ev.combo, targets: [], ok: 0, total: 0, score: null, running: true }; }
    else if (ev.type === 'target') {
      const r = t.results[ev.index];
      if (r) { r.targets = [...r.targets, ev.result]; for (const v of Object.values(ev.result.checks)) { if (v !== 'UNSUP') r.total++; if (v === 'OK') r.ok++; } r.score = r.total ? Math.round(r.ok / r.total * 1000) / 10 : 0; }
    } else if (ev.type === 'combo-end') { t.results[ev.index] = { ...ev.summary, running: false }; }
    else if (ev.type === 'log') t.log = [...t.log, { level: ev.level, text: ev.text, at: Date.now() }];
    else if (ev.type === 'done') {
      t.running = false; t.done = ev.result; t.current = null;
      const b = ev.result.best;
      t.log = [...t.log, { level: 'ok', text: b ? `Готово. Лучшая: ${b.batName}${b.fake ? ' + ' + b.fake : ''} — ${b.score}%` : 'Готово' }];
      toast(b ? `Проверка завершена. Лучшая: ${b.batName} (${b.score}%)` : 'Проверка завершена', 'ok', 5000);
    } else if (ev.type === 'error') {
      t.running = false; t.current = null; t.log = [...t.log, { level: 'error', text: ev.text }];
      toast(ev.text, 'error', 7000);
    }
  });
  if (ev.type === 'done' || ev.type === 'error') api.call('config:get').then(c => { S.cfg = c; update(); });
}
