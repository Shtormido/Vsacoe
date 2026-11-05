'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, nativeTheme, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store, appDir } = require('./store');
const { Engine } = require('./engine');
const { Tester } = require('./tester');
const diag = require('./diagnostics');
const { ServiceBat } = require('./servicebat');
const sys = require('./sys');
const V = require('./versions');
const { FAKE_SLOTS, DEFAULTS, SCOPES } = require('./core/settings');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const DATA_DIR = path.join(appDir(app), 'ZapretUE-data');
app.setPath('userData', path.join(DATA_DIR, 'electron'));
const store = new Store(DATA_DIR);
const engine = new Engine(store);
let win = null;
let tray = null;
let trayIcons = {};
let lastStatusJson = '';
let lastStatus = null;
let quitting = false;
const startHidden = process.argv.includes('--hidden');

let trayWin = null;
// Событие уходит и в главное окно, и во всплывающую панель трея
const send = (ch, payload) => {
  for (const w of [win, trayWin]) if (w && !w.isDestroyed()) w.webContents.send(ch, payload);
};
const tester = new Tester(engine, store, (ev) => send('tests:event', ev));
const sbat = new ServiceBat((ev) => send('sb:event', ev));

function createWindow() {
  const cfg = store.get();
  const isWin = process.platform === 'win32';
  win = new BrowserWindow({
    width: 1240, height: 800, minWidth: 940, minHeight: 600,
    show: false,
    title: 'Zapret Ultimate Edition',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
    backgroundColor: isWin ? '#00000000' : '#202020',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 40 },
    backgroundMaterial: isWin ? 'mica' : undefined,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    if (!(startHidden || cfg.app.startMinimized) || !cfg.app.minimizeToTray) win.show();
  });
  win.on('close', (e) => {
    if (!quitting && store.get().app.minimizeToTray && tray) { e.preventDefault(); win.hide(); }
  });
}

function trayMenu() {
  const cfg = store.get();
  const st = lastStatus || { state: 'off', service: {} };
  const r = st.run || {};
  const svc = st.service || {};
  const DOT = { off: '⚪', running: '🟢', service: '🟣', testing: '🟠', starting: '🟠' };
  const ver = engine.version(cfg.selectedVersion);
  const bats = ver ? [...ver.bats, ...engine.custom.bats] : [];
  const err = (e) => send('toast', { type: 'error', text: e.message });
  const run = (fn) => () => Promise.resolve(fn()).then(pollStatus).catch(err);
  const full = cfg.app.stopFull !== false;
  const openPage = (page) => () => { win.show(); win.focus(); win.webContents.send('nav', page); };
  return Menu.buildFromTemplate([
    { label: `${DOT[st.state] || '⚪'}  Zapret UE — ${STATE_LABEL[st.state] || st.state}`, enabled: false },
    ...(st.state !== 'off' && r.batName ? [{ label: `     ${r.batName}${r.version ? ' · v' + r.version : ''}`, enabled: false }] : []),
    { type: 'separator' },
    st.state === 'running'
      ? { label: '⏹  Выключить', click: run(() => engine.stop({ full })) }
      : st.state === 'service'
        ? { label: '⏹  Остановить сервис', click: run(() => engine.serviceControl('stop')) }
        : { label: '▶  Включить', enabled: st.state === 'off' && !!cfg.selectedBat, click: run(() => engine.start({})) },
    { label: '🔄  Перезапустить', enabled: st.state === 'running', click: run(() => engine.start({})) },
    { label: '✨  Подобрать оптимальный', enabled: st.state === 'off' || st.state === 'running', click: () => {
      if (!ver) return;
      tester.run({ versionId: ver.id, ...cfg.tests, mode: 'quick', bats: bats.map(b => b.key), autoApply: true }).then(pollStatus).catch(() => {});
    } },
    { type: 'separator' },
    { label: '📑  Стратегия', submenu: bats.length ? bats.map(b => ({ label: b.name + (b.source === 'custom' ? '  (своя)' : ''), type: 'radio', checked: b.key === cfg.selectedBat, click: () => {
      cfg.selectedBat = b.key; store.save(); refreshTrayMenu(); send('config:changed', null);
      if (lastStatus && lastStatus.state === 'running') run(() => engine.start({ batKey: b.key }))();
    } })) : [{ label: 'Нет стратегий', enabled: false }] },
    { label: '📦  Версия', submenu: engine.versions.map(v => ({ label: 'v' + v.version, type: 'radio', checked: v.id === cfg.selectedVersion, click: () => { cfg.selectedVersion = v.id; store.save(); engine.rescan(); refreshTrayMenu(); send('config:changed', null); } })) },
    { label: '👤  Профиль', submenu: cfg.profiles.map(p => ({ label: p.name, type: 'radio', checked: p.id === cfg.activeProfileId, click: () => send('tray:profile', p.id) })) },
    { label: `🛡  Сервис — ${svc.installed ? (svc.state === 'RUNNING' ? 'работает' : 'остановлен') : 'не установлен'}`, submenu: [
      { label: svc.installed ? 'Сменить на выбранную стратегию' : 'Установить выбранную стратегию', enabled: !!cfg.selectedBat, click: run(() => engine.serviceInstall({})) },
      { label: 'Запустить', enabled: !!svc.installed && svc.state !== 'RUNNING', click: run(() => engine.serviceControl('start')) },
      { label: 'Остановить', enabled: svc.state === 'RUNNING', click: run(() => engine.serviceControl('stop')) },
      { type: 'separator' },
      { label: 'Удалить сервис (как п.2 service.bat)', enabled: !!svc.installed, click: run(() => engine.serviceRemove()) },
    ] },
    { type: 'separator' },
    { label: '🏠  Открыть программу', click: openPage('home') },
    { label: '🧪  Проверка стратегий', click: openPage('tests') },
    { label: '📝  Списки', click: openPage('lists') },
    { label: '⌨  service.bat', click: openPage('servicebat') },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  ]);
}

const TRAY_W = 372;
let trayHiddenAt = 0;

function createTrayWin() {
  const isWin = process.platform === 'win32';
  trayWin = new BrowserWindow({
    width: TRAY_W, height: 560, show: false, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    backgroundColor: isWin ? '#00000000' : '#202020', backgroundMaterial: isWin ? 'acrylic' : undefined,
    roundedCorners: true, hasShadow: true, title: 'Zapret UE',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  trayWin.removeMenu();
  trayWin.loadFile(path.join(__dirname, '..', 'renderer', 'tray.html'));
  trayWin.on('blur', () => {
    if (trayWin.webContents.isDevToolsOpened()) return;
    trayWin.hide(); trayHiddenAt = Date.now();
  });
  trayWin.on('closed', () => { trayWin = null; });
}

/** Ставит панель у значка трея (панель задач может быть снизу, сверху или сбоку). */
function placeTrayWin() {
  if (!trayWin) return;
  const [w, h] = trayWin.getSize();
  const b = tray ? tray.getBounds() : { x: 0, y: 0, width: 0, height: 0 };
  const pt = b.width ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(pt).workArea;
  const clampX = (x) => Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - w - 8);
  const clampY = (y) => Math.min(Math.max(y, wa.y + 8), wa.y + wa.height - h - 8);
  let x = clampX(Math.round(pt.x - w / 2));
  let y = pt.y > wa.y + wa.height / 2 ? wa.y + wa.height - h - 8 : wa.y + 8;
  if (pt.x < wa.x) x = wa.x + 8;                               // панель задач слева
  else if (pt.x > wa.x + wa.width) x = wa.x + wa.width - w - 8; // справа
  if (pt.x < wa.x || pt.x > wa.x + wa.width) y = clampY(Math.round(pt.y - h + 40));
  trayWin.setPosition(Math.round(x), Math.round(y));
}

function showTrayWin() {
  if (store.get().app.trayStyle === 'native') { tray.popUpContextMenu(trayMenu()); return; }
  if (!trayWin) createTrayWin();
  if (trayWin.isVisible()) { trayWin.hide(); return; }
  if (Date.now() - trayHiddenAt < 250) return; // клик по значку, который только что закрыл панель
  placeTrayWin();
  trayWin.show(); trayWin.focus();
  trayWin.webContents.send('tray:shown');
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(store.get().app.trayStyle === 'native' ? trayMenu() : null);
}

function setupTray() {
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'renderer', 'assets', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('Zapret Ultimate Edition');
    tray.on('click', showTrayWin);
    tray.on('right-click', showTrayWin);
    tray.on('double-click', () => { if (trayWin) trayWin.hide(); win.show(); win.focus(); });
    refreshTrayMenu();
    createTrayWin();
  } catch (e) { console.error('tray', e); }
}

const STATE_LABEL = { off: 'выключен', running: 'работает', service: 'работает как сервис', testing: 'идёт проверка', starting: 'запуск…' };

async function pollStatus() {
  try {
    const st = await engine.status();
    lastStatus = st;
    const { ts, ...cmp } = st;
    const j = JSON.stringify(cmp);
    if (j !== lastStatusJson) {
      lastStatusJson = j;
      send('status', st);
      if (tray) {
        const r = st.run;
        tray.setToolTip(`Zapret UE — ${STATE_LABEL[st.state] || st.state}${r && r.batName ? '\n' + r.batName + (r.version ? ' · v' + r.version : '') : ''}`);
        if (trayIcons[st.state]) tray.setImage(trayIcons[st.state]);
        refreshTrayMenu();
      }
    }
    return st;
  } catch (e) { console.error(e); return lastStatus; }
}

let pollTimer = null;
function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => { await pollStatus(); schedulePoll(); }, Math.max(800, store.get().app.pollMs || 2000));
}

function insideAllowed(p) {
  const c = store.get();
  const norm = (x) => path.resolve(x).replace(/[\\/]+$/, '').toLowerCase();
  const rp = norm(p);
  return [c.zapretRoot, c.customDir, DATA_DIR].filter(Boolean).map(norm).some(r => rp === r || rp.startsWith(r + path.sep));
}

function stripBuild(b) {
  if (!b) return b;
  const { version, bat, ...rest } = b;
  return { ...rest, versionId: version && version.id, versionLabel: version && version.version, batKey: bat && bat.key, batName: bat && bat.name, batFile: bat && bat.file };
}

let currentSender = null;
function handle(ch, fn) {
  ipcMain.handle(ch, async (e, ...args) => {
    currentSender = e.sender;
    try { return { ok: true, data: await fn(...args) }; } catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
}
/** Сообщить остальным окнам (главному / панели трея), что настройки изменились. */
function notifyConfig(except) {
  for (const w of [win, trayWin]) if (w && !w.isDestroyed() && w.webContents !== except) w.webContents.send('config:changed', null);
}

function registerIpc() {
  handle('app:info', async () => ({
    version: app.getVersion(), dataDir: DATA_DIR, admin: await sys.isAdmin(), sim: sys.SIM, platform: process.platform,
    fakeSlots: FAKE_SLOTS, defaults: DEFAULTS, scopes: SCOPES, exe: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
  }));
  handle('config:get', () => store.get());
  handle('config:patch', (partial) => {
    const before = store.get();
    const rootChanged = partial && (('zapretRoot' in partial && partial.zapretRoot !== before.zapretRoot) || ('customDir' in partial && partial.customDir !== before.customDir));
    const sender = currentSender;
    store.patch(partial);
    if (rootChanged) engine.rescan();
    notifyConfig(sender);
    if (tray && partial && (partial.profiles || partial.activeProfileId || partial.app)) refreshTrayMenu();
    return store.get();
  });
  handle('dialog:folder', async (opts = {}) => {
    const r = await dialog.showOpenDialog(win, { title: opts.title || 'Выберите папку', defaultPath: opts.defaultPath, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('versions:scan', () => engine.rescan());
  handle('cmd:build', (ref) => stripBuild(engine.build(ref || {})));
  handle('zapret:start', async (ref) => { engine.busy = 'starting'; send('status', { ...(lastStatus || {}), state: 'starting' }); try { return await engine.start(ref || {}); } finally { engine.busy = null; await pollStatus(); } });
  handle('zapret:stop', async () => { await engine.stop({ full: store.get().app.stopFull !== false }); return pollStatus(); });
  handle('status:get', () => pollStatus());
  handle('service:install', async (ref) => { engine.busy = 'starting'; try { return await engine.serviceInstall(ref || {}); } finally { engine.busy = null; await pollStatus(); } });
  handle('service:remove', async () => { const r = await engine.serviceRemove(); await pollStatus(); return r; });
  handle('service:control', async (a) => { const r = await engine.serviceControl(a); await pollStatus(); return r; });
  handle('file:read', (p) => {
    if (!insideAllowed(p)) throw new Error('Доступ запрещён');
    const buf = fs.readFileSync(p);
    return { text: buf.toString('utf8').replace(/^﻿/, ''), size: buf.length, mtime: fs.statSync(p).mtimeMs };
  });
  handle('file:write', (p, text) => {
    if (!insideAllowed(p)) throw new Error('Доступ запрещён');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
    return true;
  });
  handle('lists:index', (versionId) => {
    const c = store.get();
    const ver = engine.version(versionId || c.selectedVersion);
    const files = [];
    const stat = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
    if (c.customDir) {
      for (const f of V.listDir(path.join(c.customDir, 'lists')).filter(f => /\.txt$/i.test(f)).sort(V.natural)) { const p = path.join(c.customDir, 'lists', f); files.push({ path: p, name: f, scope: 'shared', size: stat(p) }); }
      const t = path.join(c.customDir, 'targets.txt');
      if (V.exists(t)) files.push({ path: t, name: 'targets.txt', scope: 'shared', size: stat(t) });
    }
    if (ver) {
      for (const f of V.listDir(ver.listsDir).filter(f => /\.(txt|backup)$/i.test(f)).sort(V.natural)) { const p = path.join(ver.listsDir, f); files.push({ path: p, name: f, scope: 'version', size: stat(p) }); }
      const t = path.join(ver.dir, 'utils', 'targets.txt');
      if (V.exists(t)) files.push({ path: t, name: 'targets.txt', scope: 'version', size: stat(t) });
    }
    return { files, versionId: ver && ver.id, customDir: c.customDir };
  });
  handle('list:create', (name) => {
    const c = store.get();
    if (!c.customDir) throw new Error('Общая папка не задана');
    const clean = String(name).replace(/[\\/:*?"<>|]/g, '').trim();
    if (!clean) throw new Error('Пустое имя');
    const p = path.join(c.customDir, 'lists', /\.txt$/i.test(clean) ? clean : clean + '.txt');
    if (V.exists(p)) throw new Error('Такой файл уже есть');
    fs.writeFileSync(p, '# Новая группа\r\n', 'utf8');
    return p;
  });
  handle('bat:create', ({ versionId, batKey, name, text }) => {
    const c = store.get();
    if (!c.customDir) throw new Error('Общая папка не задана');
    const clean = String(name || '').replace(/[\\/:*?"<>|]/g, '').trim();
    if (!clean) throw new Error('Введите имя');
    const dst = path.join(c.customDir, 'bats', clean + '.bat');
    if (V.exists(dst)) throw new Error('Батник с таким именем уже есть');
    let body = text;
    if (body === undefined) {
      const ver = engine.version(versionId || c.selectedVersion);
      const bat = ver && V.resolveBat(ver, engine.custom, batKey);
      body = bat ? V.readText(bat.file) : '@echo off\r\nchcp 65001 > nul\r\n\r\nset "BIN=%~dp0bin\\"\r\nset "LISTS=%~dp0lists\\"\r\n\r\nstart "zapret: %~n0" /min "%BIN%winws.exe" --wf-tcp=80,443 ^\r\n--filter-tcp=80,443 --hostlist="%LISTS%list-general.txt" --dpi-desync=fake --dpi-desync-repeats=6\r\n';
    }
    fs.writeFileSync(dst, body, 'utf8');
    engine.rescan();
    return 'custom:' + clean;
  });
  handle('bat:delete', (key) => {
    const bat = engine.custom.bats.find(b => b.key === key);
    if (!bat) throw new Error('Можно удалять только свои батники');
    fs.unlinkSync(bat.file);
    return engine.rescan();
  });
  // Файлы, перетащенные из проводника: .bat -> bats\, .txt -> lists\ (targets.txt -> корень), .bin -> bin\
  handle('import:files', ({ paths, overwrite } = {}) => {
    const c = store.get();
    if (!c.customDir) throw new Error('Общая папка не задана');
    const res = { copied: [], exists: [], skipped: [] };
    for (const src of paths || []) {
      const name = path.basename(src);
      const ext = path.extname(name).toLowerCase();
      let dst = null;
      if (ext === '.bat' && !/^service/i.test(name)) dst = path.join(c.customDir, 'bats', name);
      else if (ext === '.bin') dst = path.join(c.customDir, 'bin', name);
      else if (/^targets\.txt$/i.test(name)) dst = path.join(c.customDir, 'targets.txt');
      else if (ext === '.txt') dst = path.join(c.customDir, 'lists', name);
      if (!dst) { res.skipped.push(name); continue; }
      try { if (!fs.statSync(src).isFile()) { res.skipped.push(name); continue; } } catch { res.skipped.push(name); continue; }
      if (fs.existsSync(dst) && !overwrite) { res.exists.push(name); continue; }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      res.copied.push(name);
    }
    if (res.copied.length) engine.rescan();
    return res;
  });
  handle('fake:import', async () => {
    const c = store.get();
    if (!c.customDir) throw new Error('Общая папка не задана');
    const r = await dialog.showOpenDialog(win, { title: 'Добавить фейки (.bin)', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Фейки', extensions: ['bin'] }] });
    if (r.canceled) return null;
    for (const f of r.filePaths) fs.copyFileSync(f, path.join(c.customDir, 'bin', path.basename(f)));
    return engine.rescan();
  });
  handle('profile:activate', (id) => {
    const c = store.get();
    const p = c.profiles.find(x => x.id === id);
    if (!p) throw new Error('Профиль не найден');
    c.activeProfileId = id;
    if (p.version && engine.version(p.version)) c.selectedVersion = p.version;
    if (p.bat) c.selectedBat = p.bat;
    store.save();
    refreshTrayMenu();
    notifyConfig(currentSender);
    return c;
  });
  handle('tests:run', (opts) => { tester.run(opts).catch(() => {}); return true; });
  handle('tests:cancel', () => { tester.cancel(); return true; });
  handle('tests:history', () => tester.history());
  handle('tests:read', (id) => tester.read(id));
  handle('tests:remove', (id) => { tester.remove(id); return tester.history(); });
  handle('tests:targets', (versionId) => tester.loadTargets(versionId || store.get().selectedVersion));
  handle('diag:run', () => diag.run(engine));
  handle('diag:fix', (id) => { if (id === 'relaunchAdmin') return relaunchAdmin(); return diag.fix(id, engine); });
  handle('updates:check', () => diag.checkUpdates());
  handle('ipset:update', (versionId) => { const v = engine.version(versionId); if (!v) throw new Error('Версия не найдена'); const r = diag.updateIpset(v); return r.then((x) => { engine.rescan(); return x; }); });
  handle('fonts:list', () => sys.systemFonts());
  handle('shell:open', (p) => shell.openPath(p));
  handle('shell:url', (u) => { if (/^https?:\/\//.test(u)) shell.openExternal(u); return true; });
  handle('shell:show', (p) => { shell.showItemInFolder(p); return true; });
  handle('win:overlay', ({ color, symbolColor, dark }) => {
    nativeTheme.themeSource = dark ? 'dark' : 'light';
    try { win.setTitleBarOverlay({ color: color || '#00000000', symbolColor: symbolColor || '#ffffff', height: 40 }); } catch {}
    return true;
  });
  handle('win:material', (m) => {
    if (process.platform === 'win32' && win.setBackgroundMaterial) win.setBackgroundMaterial(m || 'none');
    return true;
  });
  handle('tray:icons', (icons) => {
    trayIcons = {};
    for (const [k, v] of Object.entries(icons || {})) trayIcons[k] = nativeImage.createFromDataURL(v);
    if (tray && lastStatus && trayIcons[lastStatus.state]) tray.setImage(trayIcons[lastStatus.state]);
    return true;
  });
  handle('app:relaunchAdmin', () => relaunchAdmin());
  handle('tray:open', () => { showTrayWin(); return true; });
  handle('tray:hide', () => { if (trayWin) { trayWin.hide(); trayHiddenAt = Date.now(); } return true; });
  handle('tray:resize', (h) => {
    if (!trayWin) return false;
    const wa = screen.getDisplayMatching(trayWin.getBounds()).workArea;
    const nh = Math.max(240, Math.min(Math.ceil(h), wa.height - 16));
    if (trayWin.getSize()[1] === nh) return true;
    // у окна без изменения размера setSize может игнорироваться — на мгновение разрешаем
    trayWin.setResizable(true);
    trayWin.setSize(TRAY_W, nh);
    trayWin.setResizable(false);
    placeTrayWin();
    return true;
  });
  handle('win:show', (page) => {
    if (trayWin) trayWin.hide();
    win.show(); win.focus();
    if (page) win.webContents.send('nav', page);
    return true;
  });
  handle('app:quit', () => { quitting = true; app.quit(); return true; });
  handle('app:autostart', async (enabled) => {
    if (!sys.isWin) return { ok: true, sim: true };
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    if (enabled) {
      const r = await sys.run('schtasks', ['/Create', '/TN', 'ZapretUltimateEdition', '/TR', `"${exe}" --hidden`, '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F']);
      if (r.code !== 0) throw new Error(r.stdout + r.stderr);
    } else await sys.run('schtasks', ['/Delete', '/TN', 'ZapretUltimateEdition', '/F']);
    store.get().app.autoStart = !!enabled; store.save();
    return true;
  });
  handle('theme:export', async (theme) => {
    const r = await dialog.showSaveDialog(win, { title: 'Экспорт темы', defaultPath: (theme.name || 'theme') + '.zuetheme.json', filters: [{ name: 'Тема', extensions: ['json'] }] });
    if (r.canceled) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(theme, null, 2), 'utf8');
    return true;
  });
  handle('theme:import', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Импорт темы', properties: ['openFile'], filters: [{ name: 'Тема', extensions: ['json'] }] });
    if (r.canceled) return null;
    return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
  });
  handle('image:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Фоновое изображение', properties: ['openFile'], filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
    if (r.canceled) return null;
    const p = r.filePaths[0];
    const buf = fs.readFileSync(p);
    if (buf.length > 8 * 1024 * 1024) throw new Error('Файл больше 8 МБ');
    const ext = path.extname(p).slice(1).toLowerCase().replace('jpg', 'jpeg');
    return `data:image/${ext};base64,${buf.toString('base64')}`;
  });
  handle('log:read', () => V.readText(store.runtime('winws.log')) || '');
  const verOrThrow = (id) => { const v = engine.version(id || store.get().selectedVersion); if (!v) throw new Error('Версия не найдена'); return v; };
  handle('sb:status', (id) => sbat.status(verOrThrow(id).id));
  handle('sb:start', (id) => sbat.start(verOrThrow(id)));
  handle('sb:input', (id, text) => sbat.input(verOrThrow(id).id, String(text)));
  handle('sb:stop', (id) => sbat.stop(verOrThrow(id).id));
  handle('sb:window', (id) => sbat.openWindow(verOrThrow(id)));
  handle('sb:refresh', async () => { engine.rescan(); await pollStatus(); return engine.snapshot(); });
}

function relaunchAdmin() {
  if (!sys.isWin) return false;
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const args = app.isPackaged ? '' : `'${path.resolve(__dirname, '..', '..')}'`;
  sys.ps(`Start-Process -FilePath '${exe.replace(/'/g, "''")}' ${args ? '-ArgumentList ' + args : ''} -Verb RunAs`).then((r) => {
    if (r.code === 0) { quitting = true; app.quit(); }
  });
  return true;
}

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(async () => {
  registerIpc();
  createWindow();
  setupTray();
  await pollStatus();
  schedulePoll();
  const c = store.get();
  if (startHidden && c.app.autoStartBat && lastStatus && lastStatus.state === 'off' && c.selectedBat) {
    engine.start({}).then(pollStatus).catch(() => {});
  }
});

app.on('before-quit', async (e) => {
  quitting = true;
  sbat.stopAll();
  if (store.get().app.stopOnExit && lastStatus && lastStatus.state === 'running' && !app._stopped) {
    e.preventDefault();
    app._stopped = true;
    try { await engine.stop({ full: store.get().app.stopFull !== false }); } catch {}
    app.quit();
  }
  store.save(true);
});

app.on('window-all-closed', () => { if (!tray || quitting) app.quit(); });
