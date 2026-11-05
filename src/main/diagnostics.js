'use strict';
// Диагностика как в service.bat (пункт "Run Diagnostics") + исправления в один клик.
const fs = require('fs');
const path = require('path');
const https = require('https');
const sys = require('./sys');

async function scQueryAll() {
  const r = await sys.run('sc', ['query', 'type=', 'service', 'state=', 'all']);
  return r.stdout;
}

async function run(engine) {
  const out = [];
  const add = (id, title, status, message, fix) => out.push({ id, title, status, message, fix: fix || null });
  const ver = engine.version(engine.cfg.selectedVersion);
  if (!sys.isWin) {
    add('sim', 'Режим симуляции', 'warn', 'Программа запущена не в Windows — проверки системы недоступны.');
    if (ver) add('path', 'Папка запрета', 'ok', ver.dir);
    return out;
  }
  add('admin', 'Права администратора', (await sys.isAdmin()) ? 'ok' : 'fail', (await sys.isAdmin()) ? 'Есть' : 'Нужны права администратора для работы winws и сервиса', 'relaunchAdmin');

  const bfe = await sys.run('sc', ['query', 'BFE']);
  add('bfe', 'Base Filtering Engine', /RUNNING/i.test(bfe.stdout) ? 'ok' : 'fail', /RUNNING/i.test(bfe.stdout) ? 'Служба работает' : 'Служба BFE не запущена — она обязательна для работы zapret');

  const proxy = await sys.run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable']);
  if (/0x1/.test(proxy.stdout)) {
    const srv = await sys.run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer']);
    add('proxy', 'Системный прокси', 'warn', 'Включён прокси ' + ((srv.stdout.match(/REG_SZ\s+(.+)/) || [])[1] || '').trim() + '. Убедитесь, что он нужен.');
  } else add('proxy', 'Системный прокси', 'ok', 'Не используется');

  const tcp = await sys.run('netsh', ['interface', 'tcp', 'show', 'global']);
  const ts = /timestamps\s*:\s*enabled/i.test(tcp.stdout);
  add('tcpts', 'TCP timestamps', ts ? 'ok' : 'warn', ts ? 'Включены' : 'Выключены — нужны для части стратегий', ts ? null : 'tcpTimestamps');

  const procs = (await sys.run('tasklist', ['/FO', 'CSV', '/NH'])).stdout.toLowerCase();
  add('adguard', 'Adguard', procs.includes('adguardsvc.exe') ? 'fail' : 'ok', procs.includes('adguardsvc.exe') ? 'Adguard может мешать Discord (issue #417)' : 'Не найден');

  const sc = await scQueryAll();
  const has = (re) => re.test(sc);
  add('killer', 'Killer Network', has(/Killer/i) ? 'fail' : 'ok', has(/Killer/i) ? 'Службы Killer конфликтуют с zapret' : 'Не найден');
  add('intel', 'Intel Connectivity Network Service', has(/Intel.*Connectivity.*Network/i) ? 'fail' : 'ok', has(/Intel.*Connectivity.*Network/i) ? 'Конфликтует с zapret' : 'Не найден');
  add('checkpoint', 'Check Point', has(/TracSrvWrapper|EPWD/i) ? 'fail' : 'ok', has(/TracSrvWrapper|EPWD/i) ? 'Check Point конфликтует с zapret — удалите его' : 'Не найден');
  add('smartbyte', 'SmartByte', has(/SmartByte/i) ? 'fail' : 'ok', has(/SmartByte/i) ? 'Отключите SmartByte через services.msc' : 'Не найден');
  const vpn = [...new Set([...sc.matchAll(/^[^:\r\n]*:\s*(\S*(?:VPN|HappService)\S*)\s*$/gim)].map(m => m[1]))];
  add('vpn', 'VPN', vpn.length ? 'warn' : 'ok', vpn.length ? 'Найдены VPN-службы: ' + vpn.join(', ') + '. Некоторые VPN конфликтуют с zapret.' : 'Не найдены');

  if (ver) {
    const cyr = /[\u0400-\u04FF]/.test(ver.dir);
    add('cyrillic', 'Кириллица в пути', cyr ? 'warn' : 'ok', cyr ? 'Путь содержит кириллицу. Если не работает — перенесите запрет, например в C:\\zapret' : ver.dir);
    const od = process.env.OneDrive;
    const inOd = od && ver.dir.toLowerCase().startsWith(od.toLowerCase());
    add('onedrive', 'OneDrive', inOd ? 'fail' : 'ok', inOd ? 'Запрет лежит в папке OneDrive — перенесите его' : 'Не в OneDrive');
    const sysFile = fs.existsSync(path.join(ver.binDir, 'WinDivert64.sys'));
    add('windivert-file', 'WinDivert64.sys', sysFile ? 'ok' : 'fail', sysFile ? 'Найден' : 'Файл не найден в bin — возможно удалён антивирусом');
  }

  const doh = await sys.ps("(Get-ChildItem -Recurse -Path 'HKLM:System\\CurrentControlSet\\Services\\Dnscache\\InterfaceSpecificParameters\\' -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DohFlags -gt 0 } | Measure-Object).Count");
  const dohOn = parseInt(doh.stdout.trim(), 10) > 0;
  add('doh', 'Защищённый DNS', dohOn ? 'ok' : 'warn', dohOn ? 'Настроен DoH в Windows' : 'Настройте защищённый DNS в браузере или в параметрах Windows 11');

  try {
    const hosts = fs.readFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts'), 'utf8');
    const yt = /youtube\.com|youtu\.be/i.test(hosts.replace(/^\s*#.*$/gm, ''));
    add('hosts', 'Файл hosts', yt ? 'warn' : 'ok', yt ? 'В hosts есть записи youtube.com / youtu.be — это может ломать YouTube' : 'Без конфликтов');
  } catch { add('hosts', 'Файл hosts', 'warn', 'Не удалось прочитать'); }

  const winws = (await sys.findProcesses('winws.exe')).length > 0;
  const wd = await sys.run('sc', ['query', 'WinDivert']);
  const wdActive = /RUNNING|STOP_PENDING/i.test(wd.stdout);
  if (!winws && wdActive) add('windivert', 'Служба WinDivert', 'warn', 'winws не запущен, а WinDivert активен — возможен конфликт', 'removeWinDivert');
  else add('windivert', 'Служба WinDivert', 'ok', wdActive ? 'Используется winws' : 'Не активна');

  const conflicts = [];
  for (const s of ['GoodbyeDPI', 'discordfix_zapret', 'winws1', 'winws2']) {
    const q = await sys.run('sc', ['query', s]);
    if (q.code === 0 || /STATE/i.test(q.stdout)) conflicts.push(s);
  }
  add('conflicts', 'Конфликтующие обходы', conflicts.length ? 'fail' : 'ok', conflicts.length ? 'Найдены службы: ' + conflicts.join(', ') : 'Не найдены', conflicts.length ? 'removeConflicts' : null);
  add('discord', 'Кэш Discord', 'info', 'Очистка кэша помогает, если Discord не грузится после смены стратегии', 'clearDiscordCache');
  return out;
}

async function fix(id, engine) {
  if (!sys.isWin) return { ok: true, message: 'Симуляция: ' + id };
  switch (id) {
    case 'tcpTimestamps': return { ok: await sys.ensureTcpTimestamps(), message: 'TCP timestamps включены' };
    case 'removeWinDivert':
      await sys.run('net', ['stop', 'WinDivert']); await sys.run('sc', ['delete', 'WinDivert']);
      return { ok: true, message: 'WinDivert удалён' };
    case 'removeConflicts':
      for (const s of ['GoodbyeDPI', 'discordfix_zapret', 'winws1', 'winws2']) { await sys.run('net', ['stop', s]); await sys.run('sc', ['delete', s]); }
      for (const d of ['WinDivert', 'WinDivert14']) { await sys.run('net', ['stop', d]); await sys.run('sc', ['delete', d]); }
      return { ok: true, message: 'Конфликтующие службы удалены' };
    case 'clearDiscordCache': {
      const done = [];
      const appdata = process.env.APPDATA || '';
      for (const [exe, dir] of [['Discord.exe', 'discord'], ['DiscordPTB.exe', 'discordptb'], ['DiscordCanary.exe', 'discordcanary'], ['DiscordDevelopment.exe', 'discorddevelopment']]) {
        const base = path.join(appdata, dir);
        if (!fs.existsSync(base)) continue;
        await sys.run('taskkill', ['/IM', exe, '/F']);
        for (const c of ['Cache', 'Code Cache', 'GPUCache']) { try { fs.rmSync(path.join(base, c), { recursive: true, force: true }); done.push(dir + '\\' + c); } catch {} }
      }
      return { ok: true, message: done.length ? 'Очищено: ' + done.join(', ') : 'Discord не найден' };
    }
    default: return { ok: false, message: 'Неизвестное действие' };
  }
}

function fetchText(url, timeoutSec = 8) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutSec * 1000, headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'ZapretUE' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return fetchText(res.headers.location, timeoutSec).then(resolve, reject); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let b = ''; res.setEncoding('utf8'); res.on('data', (d) => { b += d; }); res.on('end', () => resolve(b));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function checkUpdates() {
  const v = (await fetchText('https://raw.githubusercontent.com/Flowseal/zapret-discord-youtube/main/.service/version.txt')).trim();
  return { latest: v, url: 'https://github.com/Flowseal/zapret-discord-youtube/releases/tag/' + v, download: 'https://github.com/Flowseal/zapret-discord-youtube/releases/latest' };
}

async function updateIpset(ver) {
  const text = await fetchText('https://raw.githubusercontent.com/Flowseal/zapret-discord-youtube/refs/heads/main/.service/ipset-service.txt', 20);
  if (!text.trim()) throw new Error('Пустой ответ');
  fs.writeFileSync(path.join(ver.listsDir, 'ipset-all.txt'), text);
  return { lines: text.split(/\r?\n/).filter(Boolean).length };
}

module.exports = { run, fix, checkUpdates, updateIpset };
