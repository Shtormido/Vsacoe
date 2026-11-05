'use strict';
// Поиск версий запрета в выбранной папке, их возможности, общая (custom) папка.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseBat } = require('./core/batparser');
const { FAKE_SLOTS, gameFilterVars, DEFAULTS } = require('./core/settings');
const { defaultTargetsText } = require('./core/lists');

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function listDir(p) { try { return fs.readdirSync(p); } catch { return []; } }

function cmpVersion(a, b) {
  const pa = String(a).split(/[.\-]/).map(x => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.\-]/).map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function md5(p) {
  try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); } catch { return null; }
}

function isZapretDir(dir) {
  return exists(path.join(dir, 'bin', 'winws.exe')) || (exists(path.join(dir, 'bin')) && listDir(dir).some(f => /^general.*\.bat$/i.test(f)));
}

function detectVersion(dir) {
  const svc = readText(path.join(dir, 'service.bat'));
  const m = svc && svc.match(/LOCAL_VERSION=([\w.\-]+)/i);
  if (m) return m[1];
  const fm = path.basename(dir).match(/(\d+\.\d+(?:\.\d+)?[a-z]?)/i);
  return fm ? fm[1] : path.basename(dir);
}

function scanBats(dir, source) {
  return listDir(dir)
    .filter(f => /\.bat$/i.test(f) && !/^service/i.test(f))
    .sort(natural)
    .map(f => ({ name: f.replace(/\.bat$/i, ''), file: path.join(dir, f), source, key: (source === 'custom' ? 'custom:' : '') + f.replace(/\.bat$/i, '') }));
}

function analyzeVersion(dir) {
  const version = detectVersion(dir);
  const bats = scanBats(dir, 'version');
  const binDir = path.join(dir, 'bin');
  const listsDir = path.join(dir, 'lists');
  const fakes = listDir(binDir).filter(f => /\.bin$/i.test(f)).sort(natural);
  const caps = { gameFilter: false, gameFilterStyle: null, ipset: exists(path.join(listsDir, 'ipset-all.txt')), activeFakes: false, slots: [], sni: false, targets: exists(path.join(dir, 'utils', 'targets.txt')), testScript: exists(path.join(dir, 'utils', 'test zapret.ps1')), serviceBat: exists(path.join(dir, 'service.bat')), winws: exists(path.join(binDir, 'winws.exe')) };
  const slots = new Set();
  const vars = gameFilterVars(DEFAULTS);
  for (const b of bats) {
    const text = readText(b.file) || '';
    const p = parseBat(text, { dp0: dir + path.sep, name: b.name, vars });
    b.ok = p.ok;
    if (p.usesGameFilter) { caps.gameFilter = true; caps.gameFilterStyle = caps.gameFilterStyle === 'split' ? 'split' : p.gameFilterStyle; }
    if (/ipset-all\.txt/i.test(text)) caps.ipset = true;
    if (/sni=|host=/i.test(text)) caps.sni = true;
    for (const a of p.args) for (const s of FAKE_SLOTS) for (const n of s.args) if (a.startsWith(n + '=')) slots.add(s.key);
  }
  caps.slots = [...slots];
  // активные фейки (1.10.x): ищем, какой файл скопирован в ACTIVE_*
  const active = {};
  const hashes = {};
  for (const f of fakes) if (!/^ACTIVE_/i.test(f)) hashes[f] = md5(path.join(binDir, f));
  for (const f of fakes) {
    if (!/^ACTIVE_/i.test(f)) continue;
    caps.activeFakes = true;
    const h = md5(path.join(binDir, f));
    active[f] = Object.keys(hashes).find(k => hashes[k] === h) || null;
  }
  // состояние ipset-all как его видит service.bat
  let ipsetState = 'missing';
  const ipFile = path.join(listsDir, 'ipset-all.txt');
  const ipText = readText(ipFile);
  if (ipText !== null) {
    if (!ipText.trim()) ipsetState = 'any';
    else if (/203\.0\.113\.113\/32/.test(ipText) && ipText.trim().split(/\r?\n/).length <= 2) ipsetState = 'none';
    else ipsetState = 'loaded';
  }
  const ipsetBackup = exists(ipFile + '.backup') ? ipFile + '.backup' : null;
  const gfText = readText(path.join(dir, 'utils', 'game_filter.enabled'));
  return {
    id: path.basename(dir), version, dir, binDir, listsDir, bats, fakes, caps, active, ipsetState,
    ipsetLoadedPath: ipsetState === 'loaded' ? ipFile : ipsetBackup,
    gameFilterFile: gfText,
  };
}

function scanRoot(root) {
  if (!root || !isDir(root)) return [];
  const out = [];
  if (isZapretDir(root)) out.push(analyzeVersion(root));
  for (const name of listDir(root)) {
    const d = path.join(root, name);
    if (isDir(d) && isZapretDir(d)) out.push(analyzeVersion(d));
  }
  out.sort((a, b) => cmpVersion(b.version, a.version) || natural(a.id, b.id));
  return out;
}

const CUSTOM_SUBDIRS = ['bats', 'lists', 'bin'];
const USER_LISTS = ['list-general-user.txt', 'list-exclude-user.txt', 'ipset-exclude-user.txt'];
const USER_LIST_DEFAULTS = {
  'list-general-user.txt': '# Never leave this file empty\r\ndomain.example.abc\r\n',
  'list-exclude-user.txt': 'domain.example.abc\r\n',
  'ipset-exclude-user.txt': '203.0.113.113/32\r\n',
};

/** Создаёт общую папку и переносит туда пользовательские списки и targets.txt из самой свежей версии. */
function ensureCustomDir(customDir, latest) {
  if (!customDir) return;
  for (const s of CUSTOM_SUBDIRS) fs.mkdirSync(path.join(customDir, s), { recursive: true });
  for (const f of USER_LISTS) {
    const dst = path.join(customDir, 'lists', f);
    if (exists(dst)) continue;
    const src = latest ? path.join(latest.listsDir, f) : null;
    if (src && exists(src)) fs.copyFileSync(src, dst);
    else fs.writeFileSync(dst, USER_LIST_DEFAULTS[f], 'utf8');
  }
  const t = path.join(customDir, 'targets.txt');
  if (!exists(t)) {
    const src = latest ? path.join(latest.dir, 'utils', 'targets.txt') : null;
    if (src && exists(src)) fs.copyFileSync(src, t);
    else fs.writeFileSync(t, defaultTargetsText(), 'utf8');
  }
  const readme = path.join(customDir, 'README.txt');
  if (!exists(readme)) {
    fs.writeFileSync(readme, [
      'Общая папка Zapret Ultimate Edition',
      '',
      'bats\\    — свои стратегии (.bat). Запускаются с файлами выбранной версии (%~dp0 = папка версии).',
      'lists\\   — общие списки. Файл с тем же именем, что и в lists версии, подменяет его (если включены общие списки).',
      '           Свои списки можно подключать в своих батниках как "%LISTS%my-list.txt".',
      'bin\\     — свои фейки (.bin). Появятся в выборе фейков для всех версий.',
      'targets.txt — цели для проверки стратегий.',
      '',
    ].join('\r\n'), 'utf8');
  }
}

function customInfo(customDir) {
  if (!customDir) return { dir: '', bats: [], fakes: [], lists: [] };
  return {
    dir: customDir,
    bats: scanBats(path.join(customDir, 'bats'), 'custom'),
    fakes: listDir(path.join(customDir, 'bin')).filter(f => /\.bin$/i.test(f)).sort(natural),
    lists: listDir(path.join(customDir, 'lists')).filter(f => /\.txt$/i.test(f)).sort(natural),
    targets: path.join(customDir, 'targets.txt'),
  };
}

function resolveBat(version, custom, batKey) {
  if (!batKey) return null;
  if (batKey.startsWith('custom:')) return custom.bats.find(b => b.key === batKey) || null;
  return (version && version.bats.find(b => b.key === batKey)) || null;
}

module.exports = { scanRoot, analyzeVersion, ensureCustomDir, customInfo, resolveBat, cmpVersion, readText, exists, listDir, USER_LISTS, USER_LIST_DEFAULTS, natural };
