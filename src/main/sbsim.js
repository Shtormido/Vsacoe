'use strict';
// Симулятор service.bat для разработки интерфейса вне Windows: печатает меню из echo-строк батника.
const fs = require('fs');
const readline = require('readline');
const text = fs.readFileSync(process.argv[2], 'utf8');
const ver = (text.match(/LOCAL_VERSION=([\w.]+)/) || [])[1] || '?';
const menuBlock = (text.split(/^:menu\s*$/m)[1] || '').split(/set \/p/)[0] || '';
const menu = menuBlock.split(/\r?\n/).filter(l => /^\s*echo/i.test(l)).map(l => l.replace(/^\s*echo\.?\s?/i, '').replace(/!LOCAL_VERSION!/g, ver)
  .replace(/!CurrentStrategy!/g, 'Strategy: general').replace(/!GameFilterStatus!/g, 'enabled (TCP and UDP)').replace(/!IPsetStatus!/g, 'loaded').replace(/!CheckUpdatesStatus!/g, 'enabled'));
let state = 'menu';
const out = (s) => process.stdout.write(s);
const showMenu = () => { out('\f' + menu.join('\r\n') + '\r\n   Select option (0-12): '); state = 'menu'; };
showMenu();
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (l) => {
  l = l.trim();
  if (state === 'pause') return showMenu();
  if (state === 'gf') {
    if (l === '0' || l === '') return showMenu();
    out(`\r\n[симуляция] Game Filter: выбран вариант ${l}\r\nRestart the zapret to apply the changes\r\nPress any key to continue . . . `); state = 'pause'; return;
  }
  if (l === '0') { out('\r\n'); process.exit(0); }
  if (l === '4') {
    out('\fSelect game filter option:\r\n  1.   Disable\r\n  2. * TCP and UDP\r\n  3.   TCP\r\n  4.   UDP\r\n\r\n  5. Change TCP port range (current: 1024-65535)\r\n  6. Change UDP port range (current: 1024-65535)\r\n\r\n  0. Exit\r\n\r\nSelect option (0-7, default: 0): ');
    state = 'gf'; return;
  }
  if (l === '11') { out('\f[симуляция] Diagnostics\r\nBase Filtering Engine check passed\r\nDo you want to clear the Discord cache (Stable, PTB, Canary, Development)? (Y/N) (default: Y) '); state = 'pause'; return; }
  if (!l) return showMenu();
  out(`\f[симуляция] выполнен пункт ${l}\r\nPress any key to continue . . . `);
  state = 'pause';
});
