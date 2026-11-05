'use strict';
// Разбор списков (list-*.txt, ipset-*.txt, targets.txt) на группы по комментариям-заголовкам.
// Формат файлов не меняется: заголовок "# Название" (или "### Название" в targets.txt) + строки.

function detectKind(fileName) {
  return /targets/i.test(fileName || '') ? 'targets' : 'list';
}

/**
 * @returns {{kind, preamble:string[], groups:{name:string|null, prefix:string, items:string[]}[], eol:string}}
 */
function parseGrouped(text, kind = 'list') {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const preamble = [];
  const groups = [];
  let cur = null;
  const headerRe = kind === 'targets' ? /^\s*(#{2,})\s*(.*?)\s*$/ : /^\s*(#+)\s*(.*?)\s*$/;
  let seenHeader = false;
  let seenItem = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const hm = line.match(headerRe);
    if (hm) {
      seenHeader = true;
      cur = { name: hm[2] || 'Без названия', prefix: hm[1], items: [] };
      groups.push(cur);
      continue;
    }
    if (!line.trim()) continue;
    if (kind === 'targets' && !seenHeader && !seenItem && /^\s*#/.test(line)) { preamble.push(line); continue; }
    seenItem = true;
    if (!cur) { cur = { name: null, prefix: kind === 'targets' ? '###' : '#', items: [] }; groups.push(cur); }
    cur.items.push(line.trim());
  }
  // Пустой безымянный и комментарии сохраняем как есть
  return { kind, preamble, groups, eol };
}

function serializeGrouped(model) {
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

/** Разбор строки targets.txt: Key = "value" */
function parseTarget(line) {
  const m = String(line).match(/^\s*(\w+)\s*=\s*"(.+)"\s*$/);
  if (!m) return null;
  return { key: m[1], value: m[2] };
}

function formatTarget(key, value, pad = 21) {
  return `${String(key).padEnd(pad)} = "${value}"`;
}

/** Все цели из targets.txt с группами, в формате для тестера. */
function targetsFromText(text) {
  const model = parseGrouped(text, 'targets');
  const out = [];
  for (const g of model.groups) {
    for (const it of g.items) {
      const t = parseTarget(it);
      if (!t) continue;
      let url = null, ping = null;
      if (/^PING:/i.test(t.value)) ping = t.value.replace(/^PING:\s*/i, '');
      else {
        url = /^https?:\/\//i.test(t.value) ? t.value : 'https://' + t.value;
        ping = url.replace(/^https?:\/\//i, '').replace(/[/:].*$/, '');
      }
      out.push({ name: t.key, group: g.name || 'Без группы', url, ping });
    }
  }
  return out;
}

const DEFAULT_TARGETS = [
  ['Discord', 'DiscordMain', 'https://discord.com'],
  ['Discord', 'DiscordGateway', 'https://gateway.discord.gg'],
  ['Discord', 'DiscordCDN', 'https://cdn.discordapp.com'],
  ['Discord', 'DiscordUpdates', 'https://updates.discord.com'],
  ['YouTube', 'YouTubeWeb', 'https://www.youtube.com'],
  ['YouTube', 'YouTubeShort', 'https://youtu.be'],
  ['YouTube', 'YouTubeImage', 'https://i.ytimg.com'],
  ['YouTube', 'YouTubeVideoRedirect', 'https://redirector.googlevideo.com'],
  ['Google', 'GoogleMain', 'https://www.google.com'],
  ['Google', 'GoogleGstatic', 'https://www.gstatic.com'],
  ['Cloudflare', 'CloudflareWeb', 'https://www.cloudflare.com'],
  ['Cloudflare', 'CloudflareCDN', 'https://cdnjs.cloudflare.com'],
  ['Public DNS (PING-only)', 'CloudflareDNS1111', 'PING:1.1.1.1'],
  ['Public DNS (PING-only)', 'GoogleDNS8888', 'PING:8.8.8.8'],
];

function defaultTargetsText() {
  const groups = [];
  for (const [g, k, v] of DEFAULT_TARGETS) {
    let grp = groups.find(x => x.name === g);
    if (!grp) { grp = { name: g, prefix: '###', items: [] }; groups.push(grp); }
    grp.items.push(formatTarget(k, v));
  }
  return serializeGrouped({
    kind: 'targets', eol: '\r\n', groups,
    preamble: ['# targets.txt - endpoint list for tests', '#', '# Format:', '#   KeyName = "https://host..."   -> HTTP/TLS checks + ping', '#   KeyName = "PING:1.2.3.4"       -> Ping only'],
  });
}

module.exports = { detectKind, parseGrouped, serializeGrouped, parseTarget, formatTarget, targetsFromText, defaultTargetsText };
