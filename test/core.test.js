'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const bp = require('../src/main/core/batparser');
const st = require('../src/main/core/settings');
const ls = require('../src/main/core/lists');

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
const VER = 'C:\\zapret\\zapret-discord-youtube-1.10.4';
const ctxBase = (text, settings, extra = {}) => Object.assign({
  batText: text, batName: 'general', versionDir: VER,
  binDir: VER + '\\bin', listsDir: VER + '\\lists',
  customBinDir: 'C:\\zapret\\custom\\bin', customListsDir: 'C:\\zapret\\custom\\lists',
  runtimeFiles: { ipsetNone: 'D:\\data\\runtime\\ipset-none.txt', ipsetAny: 'D:\\data\\runtime\\ipset-any.txt' },
  settings: st.effectiveSettings([settings]),
  exists: () => true,
}, extra);

test('parse modern bat', () => {
  const r = bp.parseBat(fx('general.bat'), { dp0: VER + '\\', name: 'general', vars: st.gameFilterVars(st.DEFAULTS) });
  assert.ok(r.ok);
  assert.strictEqual(r.gameFilterStyle, 'split');
  assert.strictEqual(r.args[0], '--wf-tcp=80,443,2053,2083,2087,2096,8443,12');
  assert.ok(r.args.includes('--hostlist=' + VER + '\\lists\\list-general.txt'));
  assert.strictEqual(r.unresolved.length, 0);
  assert.strictEqual(r.title, 'zapret: general');
  assert.strictEqual(r.args.filter(a => a === '--new').length, 8);
});

test('caret-bang becomes !', () => {
  const r = bp.parseBat(fx('fake-tls-auto.bat'), { dp0: VER + '\\', name: 'x', vars: st.gameFilterVars(st.DEFAULTS) });
  assert.ok(r.args.includes('--dpi-desync-fake-tls=!'));
});

test('old style GameFilter + set without quotes', () => {
  const s = { 'gameFilter.mode': 'all', 'gameFilter.tcp': '1024-2000' };
  const r = st.buildCommand(ctxBase(fx('old-style.bat'), s));
  assert.ok(r.ok);
  assert.strictEqual(r.gameFilterStyle, 'single');
  assert.strictEqual(r.args[0], '--wf-tcp=80,443,1024-2000');
  assert.ok(r.args.includes('--filter-tcp=1024-2000'));
});

test('ipset modes and fake overrides', () => {
  const r = st.buildCommand(ctxBase(fx('general.bat'), { 'ipset.mode': 'any', 'fakes.quic': 'quic_initial_5ka_ru.bin', 'fakes.discord': 'stun.bin' }));
  assert.ok(r.args.includes('--ipset=D:\\data\\runtime\\ipset-any.txt'));
  assert.ok(r.args.includes('--dpi-desync-fake-quic=' + VER + '\\bin\\quic_initial_5ka_ru.bin'));
  assert.ok(r.args.includes('--dpi-desync-fake-discord=' + VER + '\\bin\\stun.bin'));
  assert.deepStrictEqual(r.fakesUsed.quic, ['quic_initial_5ka_ru.bin']);
  assert.ok(r.usesIpset);
});

test('shared lists redirect user lists', () => {
  const r = st.buildCommand(ctxBase(fx('general.bat'), {}, { exists: (p) => !p.startsWith('C:\\zapret\\custom') || p.endsWith('list-general-user.txt') }));
  assert.ok(r.args.includes('--hostlist=C:\\zapret\\custom\\lists\\list-general-user.txt'));
  assert.ok(r.args.includes('--hostlist=' + VER + '\\lists\\list-general.txt'));
});

test('sni override & quoting', () => {
  const r = st.buildCommand(ctxBase(fx('fake-tls-auto.bat'), { 'desync.sni': 'ya.ru', 'args.start': '--debug=1' }));
  assert.strictEqual(r.args[0], '--debug=1');
  assert.ok(r.args.some(a => a === '--dpi-desync-fake-tls-mod=rnd,dupsid,sni=ya.ru'));
  assert.strictEqual(bp.quoteArg('--a=C:\\x y\\'), '"--a=C:\\x y\\\\"');
  assert.strictEqual(bp.quoteArgForService('--hostlist=C:\\a b\\l.txt'), '--hostlist="C:\\a b\\l.txt"');
});

test('port range validation', () => {
  assert.strictEqual(st.validatePortRange('1024-1934, 1936-65535'), '1024-1934,1936-65535');
  assert.strictEqual(st.validatePortRange('70000'), null);
  assert.strictEqual(st.validatePortRange('2000-1000'), null);
});

test('lists roundtrip and groups', () => {
  const t = fx('list-general-user.txt');
  const m = ls.parseGrouped(t, 'list');
  const g = m.groups.find(g => /Моды/.test(g.name));
  assert.deepStrictEqual(g.items, ['modrinth.com', 'curseforge.com', 'itch.io', 'fandom.com']);
  const again = ls.parseGrouped(ls.serializeGrouped(m), 'list');
  assert.deepStrictEqual(again.groups, m.groups);
});

test('targets parse', () => {
  const m = ls.parseGrouped(fx('targets.txt'), 'targets');
  assert.ok(m.preamble.length > 3);
  assert.strictEqual(m.groups[0].name, 'Discord');
  const t = ls.targetsFromText(fx('targets.txt'));
  const dns = t.find(x => x.name === 'GoogleDNS8888');
  assert.strictEqual(dns.url, null); assert.strictEqual(dns.ping, '8.8.8.8');
  const mp = t.find(x => x.name === 'Mineplex');
  assert.strictEqual(mp.url, 'https://mineplex.com');
  const again = ls.parseGrouped(ls.serializeGrouped(m), 'targets');
  assert.deepStrictEqual(again.groups, m.groups);
});
