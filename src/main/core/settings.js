'use strict';
// Слои настроек и сборка итоговой командной строки winws.
// Порядок слоёв (каждый следующий перекрывает предыдущий):
//   база -> профиль -> версия запрета -> батник
// Значения хранятся "плоско": { 'gameFilter.mode': 'all', 'fakes.quic': 'x.bin' }.

const path = require('path');
const { parseBat, splitArg, tokenize } = require('./batparser');

const DEFAULTS = Object.freeze({
  'gameFilter.mode': 'disabled', // disabled | all | tcp | udp
  'gameFilter.tcp': '1024-65535',
  'gameFilter.udp': '1024-65535',
  'ipset.mode': 'loaded',        // loaded | none | any
  'fakes.quic': '',
  'fakes.tls': '',
  'fakes.http': '',
  'fakes.discord': '',
  'fakes.unknownUdp': '',
  'fakes.unknown': '',
  'fakes.seqovl': '',
  'desync.sni': '',
  'desync.repeats': '',
  'lists.shared': true,
  'net.tcpTimestamps': true,
  'args.start': '',
  'args.end': '',
  'run.window': 'hidden',        // hidden | minimized
});

const SCOPES = ['base', 'profile', 'version', 'bat'];

const FAKE_SLOTS = [
  { key: 'quic', label: 'QUIC Initial (UDP 443)', args: ['--dpi-desync-fake-quic'], hint: 'Фейк для YouTube/Google по QUIC' },
  { key: 'tls', label: 'TLS ClientHello', args: ['--dpi-desync-fake-tls'], hint: 'Фейковый TLS-хендшейк для TCP 443' },
  { key: 'http', label: 'HTTP', args: ['--dpi-desync-fake-http'], hint: 'Фейк для TCP 80' },
  { key: 'discord', label: 'Discord / STUN (голос)', args: ['--dpi-desync-fake-discord', '--dpi-desync-fake-stun'], hint: 'Голосовые каналы Discord (аналог ACTIVE_DISCORD_UDP)' },
  { key: 'unknownUdp', label: 'Game Filter UDP', args: ['--dpi-desync-fake-unknown-udp'], hint: 'Игровой UDP-трафик (аналог ACTIVE_GAME_UDP)' },
  { key: 'unknown', label: 'Game Filter TCP', args: ['--dpi-desync-fake-unknown'], hint: 'Неизвестные TCP-протоколы' },
  { key: 'seqovl', label: 'Seqovl-паттерн', args: ['--dpi-desync-split-seqovl-pattern'], hint: 'Паттерн для multisplit seqovl' },
];
const FAKE_ARG_TO_SLOT = {};
for (const s of FAKE_SLOTS) for (const a of s.args) FAKE_ARG_TO_SLOT[a] = s.key;

function effectiveSettings(layers) {
  const out = Object.assign({}, DEFAULTS);
  for (const l of layers) if (l) for (const [k, v] of Object.entries(l)) if (v !== undefined && v !== null) out[k] = v;
  return out;
}

/** Валидация диапазона портов как в service.bat: 1024-1934,1936-65535 */
function validatePortRange(str) {
  const s = String(str || '').replace(/\s+/g, '');
  if (!s) return null;
  for (const item of s.split(',')) {
    const m = item.match(/^([1-9]\d{0,4})(?:-([1-9]\d{0,4}))?$/);
    if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a > 65535 || b > 65535 || a > b) return null;
  }
  return s;
}

/** Значения переменных GameFilter* для любой версии (старой и новой). */
function gameFilterVars(settings) {
  const mode = settings['gameFilter.mode'];
  const tcp = validatePortRange(settings['gameFilter.tcp']) || '1024-65535';
  const udp = validatePortRange(settings['gameFilter.udp']) || '1024-65535';
  const OFF = '12';
  let T = OFF, U = OFF, G = OFF;
  if (mode === 'all') { T = tcp; U = udp; G = tcp; }
  else if (mode === 'tcp') { T = tcp; G = tcp; }
  else if (mode === 'udp') { U = udp; G = udp; }
  return { GameFilter: G, GameFilterTCP: T, GameFilterUDP: U };
}

function isHexOrSpecial(v) {
  return !v || /^0x[0-9a-f]+$/i.test(v) || v === '!' || v === '^!';
}

function samePath(a, b) {
  const n = (x) => String(x).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '').toLowerCase();
  return n(a) === n(b);
}

function looksLikePath(v) {
  return typeof v === 'string' && /[\\/]/.test(v);
}

/**
 * Собирает итоговые аргументы winws.
 * ctx: {
 *   batText, batName, versionDir, binDir, listsDir, customBinDir, customListsDir,
 *   runtimeFiles: { ipsetNone, ipsetAny }, ipsetLoadedPath, settings (effective), exists(fn)
 * }
 */
function buildCommand(ctx) {
  const s = ctx.settings;
  // posix: режим симуляции не в Windows — обратные слэши из батника превращаем в прямые
  const P = ctx.posix ? path.posix : path.win32;
  const fix = (v) => (ctx.posix && typeof v === 'string' ? v.replace(/\\/g, '/') : v);
  const warnings = [];
  const exists = ctx.exists || (() => false);
  const vars = gameFilterVars(s);
  const sep = ctx.posix ? '/' : '\\';
  const dp0 = ctx.versionDir.endsWith(sep) ? ctx.versionDir : ctx.versionDir + sep;
  const parsed = parseBat(ctx.batText, { dp0, name: ctx.batName, vars });
  if (!parsed.ok) return { ok: false, error: parsed.error, args: [], warnings, fakesUsed: [], parsed };
  if (parsed.unresolved.length) warnings.push('Неизвестные переменные: ' + parsed.unresolved.join(', '));

  const fakesUsed = {};
  const fakeOverrides = {};
  for (const slot of FAKE_SLOTS) {
    const want = s['fakes.' + slot.key];
    if (!want) continue;
    const inVer = P.join(ctx.binDir, want);
    const inCustom = ctx.customBinDir ? P.join(ctx.customBinDir, want) : null;
    if (exists(inVer)) fakeOverrides[slot.key] = inVer;
    else if (inCustom && exists(inCustom)) fakeOverrides[slot.key] = inCustom;
    else warnings.push(`Фейк «${want}» не найден в этой версии — используется фейк из батника (${slot.label})`);
  }
  const usedSlots = new Set();
  const sni = String(s['desync.sni'] || '').trim();
  const repeats = String(s['desync.repeats'] || '').trim();
  let gfUsed = parsed.usesGameFilter;
  let ipsetUsed = false;

  const out = [];
  for (const arg of parsed.args) {
    let { name, value } = splitArg(arg);
    if (!name || value === null) { out.push(arg); continue; }
    value = fix(value);

    // Фейки
    const slot = FAKE_ARG_TO_SLOT[name];
    if (slot && !isHexOrSpecial(value)) {
      usedSlots.add(slot);
      if (fakeOverrides[slot]) value = fakeOverrides[slot];
      (fakesUsed[slot] = fakesUsed[slot] || new Set()).add(P.basename(value));
    } else if (slot) {
      usedSlots.add(slot);
      (fakesUsed[slot] = fakesUsed[slot] || new Set()).add(value === '!' ? '! (встроенный)' : value);
    }

    // SNI / host подмена
    if (sni && (name === '--dpi-desync-fake-tls-mod' || name === '--dpi-desync-hostfakesplit-mod' || name === '--dpi-desync-fake-tls-mod')) {
      value = value.replace(/(sni|host)=[^,]+/g, (_, k) => `${k}=${sni}`);
    }
    if (repeats && name === '--dpi-desync-repeats' && /^\d+$/.test(repeats)) value = repeats;

    // Пути
    if (looksLikePath(value)) {
      const dir = P.dirname(value);
      const base = P.basename(value);
      const prefix = value.startsWith('@') ? '@' : '';
      if (samePath(dir, ctx.listsDir)) {
        if (base.toLowerCase() === 'ipset-all.txt') {
          ipsetUsed = true;
          const mode = s['ipset.mode'];
          if (mode === 'none' && ctx.runtimeFiles) value = ctx.runtimeFiles.ipsetNone;
          else if (mode === 'any' && ctx.runtimeFiles) value = ctx.runtimeFiles.ipsetAny;
          else if (ctx.ipsetLoadedPath) value = ctx.ipsetLoadedPath;
          else if (!exists(value) && ctx.runtimeFiles) { value = ctx.runtimeFiles.ipsetNone; warnings.push('ipset-all.txt нет в этой версии — IPSet работает как none'); }
        } else if (ctx.customListsDir) {
          const custom = P.join(ctx.customListsDir, base);
          const inVer = exists(value);
          if (exists(custom) && (s['lists.shared'] || !inVer)) value = custom;
          else if (!inVer) warnings.push(`Список «${base}» не найден`);
        }
      } else if (samePath(dir, ctx.binDir) && !exists(value) && ctx.customBinDir) {
        const custom = P.join(ctx.customBinDir, base);
        if (exists(custom)) value = custom;
        else warnings.push(`Файл «${base}» не найден в bin`);
      }
      value = prefix && !value.startsWith('@') ? prefix + value : value;
    }
    const final = `${name}=${value}`;
    if (out.length && out[out.length - 1] === final) continue; // убираем дубли после подмены фейков
    out.push(final);
  }

  const start = tokenize(String(s['args.start'] || ''));
  const end = tokenize(String(s['args.end'] || ''));
  const args = [...start, ...out, ...end];

  const fakes = {};
  for (const [k, set] of Object.entries(fakesUsed)) fakes[k] = [...set];

  return {
    ok: true,
    args,
    warnings,
    fakesUsed: fakes,
    usedSlots: [...usedSlots],
    usesGameFilter: gfUsed,
    gameFilterStyle: parsed.gameFilterStyle,
    usesIpset: ipsetUsed,
    title: parsed.title,
    rawTail: parsed.rawTail,
  };
}

/** Краткое описание фейков для строки активности. */
function summarizeFakes(fakesUsed) {
  const names = new Set();
  for (const list of Object.values(fakesUsed || {})) for (const f of list) if (!f.startsWith('0x') && !f.startsWith('!')) names.add(f.replace(/\.bin$/i, ''));
  return [...names];
}

module.exports = { DEFAULTS, SCOPES, FAKE_SLOTS, effectiveSettings, validatePortRange, gameFilterVars, buildCommand, summarizeFakes };
