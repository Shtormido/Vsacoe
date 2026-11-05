'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store, appDir } = require('./store');
const { Engine } = require('./engine');
const { Tester } = require('./tester');
const diag = require('./diagnostics');
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

const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };
const tester = new Tester(engine, store, (ev) => send('tests:event', ev));

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
  const st = lastStatus ? lastStatus.state : 'off';
  return Menu.buildFromTemplate([
    { label: 'Zapret Ultimate Edition', enabled: false },
    { type: 'separator' },
    { label: 'Открыть', click: () => { win.show(); win.focus(); } },
    st === 'running'
      ? { label: 'Остановить', click: () => engine.stop().then(pollStatus) }
      : { label: 'Запустить', enabled: st === 'off', click: () => engine.start({}).then(pollStatus).catch(e => send('toast', { type: 'error', text: e.message })) },
    { label: 'Профиль', submenu: cfg.profiles.map(p => ({ label: p.name, type: 'radio', checked: p.id === cfg.activeProfileId, click: () => send('tray:profile', p.id) })) },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  ]);
}

function setupTray() {
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'renderer', 'assets', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('Zapret Ultimate Edition');
    tray.on('click', () => { if (win.isVisible()) win.focus(); else win.show(); });
    tray.setContextMenu(trayMenu());
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
        tray.setContextMenu(trayMenu());
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
  const roots = [c.zapretRoot, c.customDir, DATA_DIR].filter(Boolean).map(r => path.resolve(r).toLowerCase() + path.sep);
  const rp = path.resolve(p).toLowerCase();
  return roots.some(r => rp.startsWith(r));
}

function stripBuild(b) {
  if (!b) return b;
  const { version, bat, ...rest } = b;
  return { ...rest, versionId: version && version.id, versionLabel: version && version.version, batKey: bat && bat.key, batName: bat && bat.name, batFile: bat && bat.file };
}

function handle(ch, fn) {
  ipcMain.handle(ch, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
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
    store.patch(partial);
    if (rootChanged) engine.rescan();
    if (tray && partial && (partial.profiles || partial.activeProfileId)) tray.setContextMenu(trayMenu());
    return store.get();
  });
  handle('dialog:folder', async (opts = {}) => {
    const r = await dialog.showOpenDialog(win, { title: opts.title || 'Выберите папку', defaultPath: opts.defaultPath, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('versions:scan', () => engine.rescan());
  handle('cmd:build', (ref) => stripBuild(engine.build(ref || {})));
  handle('zapret:start', async (ref) => { engine.busy = 'starting'; send('status', { ...(lastStatus || {}), state: 'starting' }); try { return await engine.start(ref || {}); } finally { engine.busy = null; await pollStatus(); } });
  handle('zapret:stop', async () => { await engine.stop(); return pollStatus(); });
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
    if (tray) tray.setContextMenu(trayMenu());
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
  if (store.get().app.stopOnExit && lastStatus && lastStatus.state === 'running' && !app._stopped) {
    e.preventDefault();
    app._stopped = true;
    try { await engine.stop(); } catch {}
    app.quit();
  }
  store.save(true);
});

app.on('window-all-closed', () => { if (!tray || quitting) app.quit(); });
