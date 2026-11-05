'use strict';
// Разбор .bat стратегий zapret: достаём аргументы winws.exe, не запуская cmd.
// Работает с разными версиями батников (старые с %GameFilter%, новые с %GameFilterTCP%/%GameFilterUDP%,
// разные способы задать BIN/LISTS) — всё сводится к раскрытию переменных и токенизации как в cmd.

/** Склеивает строки, оканчивающиеся на ^ (перенос строки в cmd). */
function joinContinuations(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let acc = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    // нечётное число ^ в конце = перенос
    const m = line.match(/\^+$/);
    const cont = m && m[0].length % 2 === 1;
    const body = cont ? line.slice(0, -1) : line;
    acc = acc === null ? body : acc + body;
    if (!cont) { out.push(acc); acc = null; }
  }
  if (acc !== null) out.push(acc);
  return out;
}

function isComment(line) {
  const t = line.trim();
  return t.startsWith('::') || /^rem(\s|$)/i.test(t) || /^@?echo\s+off/i.test(t);
}

/** Раскрытие %VAR%, %~dp0, %~n0, %% с учётом переданного окружения. */
function expandVars(str, env) {
  return str.replace(/%%|%~([a-z]*)([0-9])|%([^%\r\n]+)%/gi, (all, mods, digit, name) => {
    if (all === '%%') return '%';
    if (digit !== undefined) {
      const key = '~' + (mods || '').toLowerCase() + digit;
      return env[key] !== undefined ? env[key] : '';
    }
    const keyNorm = Object.keys(env).find(k => k.toLowerCase() === name.toLowerCase());
    if (keyNorm !== undefined) return env[keyNorm];
    return all; // неизвестная переменная — оставляем как есть, чтобы показать предупреждение
  });
}

/** Обрабатывает `set "A=B"` / `set A=B`. Возвращает [name, value] или null. */
function parseSet(line) {
  const t = line.trim();
  let m = t.match(/^set\s+"([^=]+)=(.*)"\s*$/i);
  if (m) return [m[1], m[2]];
  m = t.match(/^set\s+(?!\/)([^=\s"]+)=(.*)$/i);
  if (m) return [m[1], m[2]];
  return null;
}

/** Токенизация командной строки как её увидит программа (кавычки снимаются, ^ экранирует вне кавычек). */
function tokenize(str) {
  const tokens = [];
  let cur = '';
  let inQ = false;
  let has = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') { inQ = !inQ; has = true; continue; }
    if (!inQ && c === '^' && i + 1 < str.length) { cur += str[++i]; has = true; continue; }
    if (!inQ && (c === ' ' || c === '\t')) {
      if (has) { tokens.push(cur); cur = ''; has = false; }
      continue;
    }
    cur += c; has = true;
  }
  if (has) tokens.push(cur);
  return tokens;
}

/**
 * Находит строку запуска winws.exe и возвращает её "сырой" хвост (после winws.exe) и сеты до неё.
 */
function locateCommand(text) {
  const lines = joinContinuations(text);
  const sets = [];
  for (const line of lines) {
    if (!line.trim() || isComment(line)) continue;
    const s = parseSet(line);
    if (s) { sets.push(s); continue; }
    const idx = line.toLowerCase().indexOf('winws.exe');
    if (idx >= 0) {
      let tail = line.slice(idx + 'winws.exe'.length);
      if (tail.startsWith('"')) tail = tail.slice(1);
      const head = line.slice(0, idx);
      const title = (head.match(/start\s+"([^"]*)"/i) || [])[1] || '';
      return { tail, head, title, sets };
    }
  }
  return null;
}

/**
 * Разбирает батник.
 * @param {string} text содержимое .bat
 * @param {object} ctx { dp0: 'C:\\zapret\\1.10.4\\', name: 'general', vars: {GameFilter:..}}
 * @returns {{ok:boolean, args:string[], rawTail:string, title:string, usesGameFilter:boolean,
 *            gameFilterStyle:'split'|'single'|null, unresolved:string[], error?:string}}
 */
function parseBat(text, ctx = {}) {
  const loc = locateCommand(text);
  if (!loc) return { ok: false, args: [], rawTail: '', title: '', usesGameFilter: false, gameFilterStyle: null, unresolved: [], error: 'Строка запуска winws.exe не найдена' };
  const env = Object.assign({}, ctx.vars || {});
  env['~dp0'] = ctx.dp0 || '';
  env['~n0'] = ctx.name || '';
  env['~nx0'] = (ctx.name || '') + '.bat';
  env['~f0'] = (ctx.dp0 || '') + (ctx.name || '') + '.bat';
  for (const [k, v] of loc.sets) env[k] = expandVars(v, env);
  const expanded = expandVars(loc.tail, env);
  const unresolved = [...new Set((expanded.match(/%[A-Za-z_][\w]*%/g) || []))];
  const usesSplit = /%GameFilter(TCP|UDP)%/i.test(loc.tail);
  const usesSingle = /%GameFilter%/i.test(loc.tail);
  return {
    ok: true,
    args: tokenize(expanded),
    rawTail: loc.tail.trim(),
    title: expandVars(loc.title, env),
    usesGameFilter: usesSplit || usesSingle,
    gameFilterStyle: usesSplit ? 'split' : usesSingle ? 'single' : null,
    unresolved,
  };
}

/** Разбивает аргумент вида --name=value. */
function splitArg(arg) {
  const m = String(arg).match(/^(--?[\w-]+)(?:=(.*))?$/s);
  if (!m) return { name: null, value: arg };
  return { name: m[1], value: m[2] === undefined ? null : m[2] };
}

/** Квотирование аргумента для командной строки Windows (CommandLineToArgvW-совместимо). */
function quoteArg(arg) {
  if (arg === '') return '""';
  if (!/[\s"]/.test(arg)) return arg;
  let out = '"';
  let bs = 0;
  for (const c of arg) {
    if (c === '\\') { bs++; continue; }
    if (c === '"') { out += '\\'.repeat(bs * 2 + 1) + '"'; bs = 0; continue; }
    out += '\\'.repeat(bs) + c; bs = 0;
  }
  out += '\\'.repeat(bs * 2) + '"';
  return out;
}

/** Аргумент для binPath сервиса: значения-пути в кавычках как делает service.bat (--opt="value"). */
function quoteArgForService(arg) {
  const { name, value } = splitArg(arg);
  if (name && value !== null && /[\s\\:]/.test(value)) return `${name}="${value}"`;
  return quoteArg(arg);
}

module.exports = { joinContinuations, expandVars, tokenize, parseBat, splitArg, quoteArg, quoteArgForService, locateCommand };
