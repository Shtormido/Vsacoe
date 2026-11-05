// Та же логика, что в src/main/core/lists.js (группы по комментариям), для интерфейса.
export function detectKind(name) { return /targets/i.test(name || '') ? 'targets' : 'list'; }

export function parseGrouped(text, kind = 'list') {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const preamble = [];
  const groups = [];
  let cur = null, seenHeader = false, seenItem = false;
  const headerRe = kind === 'targets' ? /^\s*(#{2,})\s*(.*?)\s*$/ : /^\s*(#+)\s*(.*?)\s*$/;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const hm = line.match(headerRe);
    if (hm) { seenHeader = true; cur = { name: hm[2] || 'Без названия', prefix: hm[1], items: [] }; groups.push(cur); continue; }
    if (!line.trim()) continue;
    if (kind === 'targets' && !seenHeader && !seenItem && /^\s*#/.test(line)) { preamble.push(line); continue; }
    seenItem = true;
    if (!cur) { cur = { name: null, prefix: kind === 'targets' ? '###' : '#', items: [] }; groups.push(cur); }
    cur.items.push(line.trim());
  }
  return { kind, preamble, groups, eol };
}

export function serializeGrouped(model) {
  const eol = model.eol || '\r\n';
  const parts = [];
  if (model.preamble && model.preamble.length) parts.push(model.preamble.join(eol));
  for (const g of model.groups) {
    const lines = [];
    if (g.name !== null && g.name !== undefined) lines.push(`${g.prefix || (model.kind === 'targets' ? '###' : '#')} ${g.name}`);
    for (const it of g.items) if (String(it).trim()) lines.push(String(it).trim());
    if (lines.length) parts.push(lines.join(eol));
  }
  return parts.join(eol + eol) + (parts.length ? eol : '');
}

export function parseTarget(line) {
  const m = String(line).match(/^\s*(\w+)\s*=\s*"(.+)"\s*$/);
  return m ? { key: m[1], value: m[2] } : null;
}
export function formatTarget(key, value) { return `${String(key).padEnd(21)} = "${value}"`; }
