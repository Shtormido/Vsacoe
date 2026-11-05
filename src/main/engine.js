'use strict';
// Центральная логика: версии, сборка команды, запуск/остановка winws, сервис Windows, статус.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sys = require('./sys');
const V = require('./versions');
const { buildCommand, effectiveSettings, summarizeFakes, FAKE_SLOTS } = require('./core/settings');
const { quoteArg, quoteArgForService, splitArg } = require('./core/batparser');

const SERVICE = 'zapret';
const REG_KEY = 'HKLM\\System\\CurrentControlSet\\Services\\zapret';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
/** Имена фейков для строки активности: ACTIVE_* показываем вместе с реальным файлом. */
function fakeNames(b) {
  const active = (b.version && b.version.active) || {};
  return summarizeFakes(b.fakesUsed).map(f => (active[f + '.bin'] ? `${f}=${active[f + '.bin'].replace(/\.bin$/i, '')}` : f));
}

class Engine {
  constructor(store) {
    this.store = store;
    this.versions = [];
    this.custom = V.customInfo('');
    this.busy = null; // 'testing' | 'starting' | null
    this.simChild = null;
    this.externalCache = { key: '', info: null };
    this.prepareRuntime();
    this.rescan();
  }

  get cfg() { return this.store.get(); }

  prepareRuntime() {
    fs.writeFileSync(this.store.runtime('ipset-none.txt'), '203.0.113.113/32\r\n');
    fs.writeFileSync(this.store.runtime('ipset-any.txt'), '');
  }

  rescan() {
    const c = this.cfg;
    this.versions = V.scanRoot(c.zapretRoot);
    if (c.zapretRoot && !c.customDir) { c.customDir = path.join(c.zapretRoot, 'custom'); this.store.save(); }
    if (c.customDir) {
      try { V.ensureCustomDir(c.customDir, this.versions[0]); } catch (e) { console.error(e); }
    }
    this.custom = V.customInfo(c.customDir);
    if (!this.versions.find(v => v.id === c.selectedVersion) && this.versions[0]) { c.selectedVersion = this.versions[0].id; this.store.save(); }
    const ver = this.version(c.selectedVersion);
    if (ver && !V.resolveBat(ver, this.custom, c.selectedBat)) {
      const def = ver.bats.find(b => b.name === 'general') || ver.bats[0];
      c.selectedBat = def ? def.key : ''; this.store.save();
    }
    // Перенос базовых настроек Game Filter из самой свежей версии при первом запуске
    if (!c._importedBase && this.versions[0]) {
      const gf = this.versions[0].gameFilterFile;
      if (gf) {
        const mode = (gf.match(/mode=(\w+)/) || [])[1];
        const tcp = (gf.match(/tcp=([\d,\-]+)/) || [])[1];
        const udp = (gf.match(/udp=([\d,\-]+)/) || [])[1];
        if (mode) c.base['gameFilter.mode'] = mode;
        if (tcp) c.base['gameFilter.tcp'] = tcp;
        if (udp) c.base['gameFilter.udp'] = udp;
        if (!mode && gf.trim()) c.base['gameFilter.mode'] = 'all';
      }
      const st = this.versions[0].ipsetState;
      if (['loaded', 'none', 'any'].includes(st)) c.base['ipset.mode'] = st;
      c._importedBase = true;
      this.store.save();
    }
    return this.snapshot();
  }

  snapshot() {
    return { versions: this.versions, custom: this.custom, sim: sys.SIM };
  }

  version(id) { return this.versions.find(v => v.id === id) || null; }
  profile(id) { return this.cfg.profiles.find(p => p.id === (id || this.cfg.activeProfileId)) || this.cfg.profiles[0]; }

  layers({ versionId, batKey, profileId, upTo } = {}) {
    const c = this.cfg;
    const p = this.profile(profileId);
    const all = [
      ['base', c.base],
      ['profile', p ? p.overrides : {}],
      ['version', c.versionOverrides[versionId] || {}],
      ['bat', c.batOverrides[batKey] || {}],
    ];
    if (!upTo) return all.map(x => x[1]);
    const idx = all.findIndex(x => x[0] === upTo);
    return all.slice(0, idx + 1).map(x => x[1]);
  }

  settingsFor(ref = {}, extra) {
    const s = effectiveSettings(this.layers(ref));
    return extra ? Object.assign(s, extra) : s;
  }

  build({ versionId, batKey, profileId, extra } = {}) {
    const c = this.cfg;
    versionId = versionId || c.selectedVersion;
    batKey = batKey || c.selectedBat;
    const ver = this.version(versionId);
    if (!ver) return { ok: false, error: 'Версия запрета не выбрана или не найдена' };
    const bat = V.resolveBat(ver, this.custom, batKey);
    if (!bat) return { ok: false, error: 'Стратегия (батник) не найдена' };
    const settings = this.settingsFor({ versionId, batKey, profileId }, extra);
    const text = V.readText(bat.file);
    if (text === null) return { ok: false, error: 'Не удалось прочитать ' + bat.file };
    const res = buildCommand({
      batText: text, batName: bat.name, versionDir: ver.dir, binDir: ver.binDir, listsDir: ver.listsDir,
      customBinDir: c.customDir ? path.join(c.customDir, 'bin') : null,
      customListsDir: c.customDir ? path.join(c.customDir, 'lists') : null,
      runtimeFiles: { ipsetNone: this.store.runtime('ipset-none.txt'), ipsetAny: this.store.runtime('ipset-any.txt') },
      ipsetLoadedPath: ver.ipsetLoadedPath,
      settings, exists: V.exists, posix: !sys.isWin,
    });
    if (settings['gameFilter.mode'] !== 'disabled' && !res.usesGameFilter && res.ok) res.warnings.push('Этот батник не поддерживает Game Filter — настройка игнорируется');
    if (settings['ipset.mode'] !== 'loaded' && !res.usesIpset && res.ok) res.warnings.push('Этот батник не использует ipset-all — режим IPSet игнорируется');
    if (ver.caps.activeFakes && res.ok) res.activeInfo = ver.active;
    return Object.assign(res, {
      exe: path.join(ver.binDir, 'winws.exe'), version: ver, bat, settings,
      commandLine: [quoteArg(path.join(ver.binDir, 'winws.exe')), ...res.args.map(quoteArg)].join(' '),
    });
  }

  // ---------- процессы ----------
  async winwsPids() {
    if (sys.SIM) return this.simChild && sys.pidAlive(this.simChild.pid) ? [this.simChild.pid] : [];
    return sys.findProcesses('winws.exe');
  }

  ensureVersionUserLists(ver) {
    for (const f of V.USER_LISTS) {
      const p = path.join(ver.listsDir, f);
      if (!V.exists(p)) try { fs.writeFileSync(p, V.USER_LIST_DEFAULTS[f], 'utf8'); } catch {}
    }
  }

  async start(opts = {}) {
    const b = this.build(opts);
    if (!b.ok) throw new Error(b.error);
    if (!opts.ignoreService) {
      const svc = await this.serviceStatus();
      if (svc.state === 'RUNNING') throw new Error('Запрет уже работает как сервис. Удалите сервис, чтобы запустить батник отдельно.');
    }
    await this.stop({ keepService: true });
    this.ensureVersionUserLists(b.version);
    if (b.settings['net.tcpTimestamps']) await sys.ensureTcpTimestamps();
    const logFile = this.store.runtime('winws.log');
    let pid = null;
    let child = null;
    if (sys.SIM) {
      const fd = fs.openSync(logFile, 'w');
      fs.writeSync(fd, `[SIM] ${b.commandLine}\n`);
      child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e9)'], { detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
      child.unref(); fs.closeSync(fd);
      this.simChild = child; pid = child.pid;
    } else if (b.settings['run.window'] === 'minimized') {
      const line = `start "zapret: ${b.bat.name}" /min ${quoteArg(b.exe)} ${b.args.map(quoteArg).join(' ')}`;
      child = spawn('cmd.exe', ['/d', '/s', '/c', `"${line}"`], { cwd: b.version.binDir, windowsVerbatimArguments: true, windowsHide: true, stdio: 'ignore', detached: true });
      child.unref();
    } else {
      const fd = fs.openSync(logFile, 'w');
      child = spawn(b.exe, b.args, { cwd: b.version.binDir, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });
      child.unref(); fs.closeSync(fd);
      pid = child.pid;
    }
    let exited = null;
    if (child) child.on('exit', (code) => { exited = code; });
    child && child.on('error', (e) => { exited = e.message; });
    const warm = opts.warmup || 1200;
    const t0 = Date.now();
    let pids = [];
    while (Date.now() - t0 < Math.max(warm, 600)) {
      await wait(200);
      if (pid && exited !== null) break;
    }
    pids = await this.winwsPids();
    if (!pid && pids.length) pid = pids[0];
    if ((pid && exited !== null && b.settings['run.window'] !== 'minimized') || !pids.length) {
      const log = (V.readText(logFile) || '').trim().split(/\r?\n/).slice(-8).join('\n');
      throw new Error('winws.exe не запустился' + (log ? ':\n' + log : (typeof exited === 'string' ? ': ' + exited : '')));
    }
    const run = {
      pid, versionId: b.version.id, version: b.version.version, batKey: b.bat.key, batName: b.bat.name, custom: b.bat.source === 'custom',
      profileId: opts.profileId || this.cfg.activeProfileId, fakes: fakeNames(b), fakesUsed: b.fakesUsed,
      gameFilter: b.usesGameFilter ? b.settings['gameFilter.mode'] : 'n/a', ipset: b.usesIpset ? b.settings['ipset.mode'] : 'n/a',
      startedAt: Date.now(), test: !!opts.test,
    };
    if (!opts.test) { this.cfg.lastRun = run; this.store.save(); }
    else this.testRun = run;
    return run;
  }

  async stop({ keepService = true } = {}) {
    const c = this.cfg;
    if (sys.SIM) {
      if (this.simChild) { await sys.killPid(this.simChild.pid); this.simChild = null; }
    } else {
      const svc = keepService ? await this.serviceStatus() : { state: 'NONE' };
      if (svc.state === 'RUNNING') {
        if (c.lastRun && c.lastRun.pid) await sys.killPid(c.lastRun.pid);
      } else {
        await sys.killImage('winws.exe');
      }
    }
    this.testRun = null;
    await wait(150);
    return true;
  }

  // ---------- сервис ----------
  simServiceFile() { return this.store.runtime('sim-service.json'); }

  async serviceStatus() {
    if (sys.SIM) {
      let j;
      try { j = JSON.parse(fs.readFileSync(this.simServiceFile(), 'utf8')); } catch { return { installed: false, state: 'NONE' }; }
      const m = this.cfg.serviceMeta;
      const ok = m && m.binPath === j.binPath;
      return { ...j, meta: ok ? m : null, fakes: ok ? m.fakes : null, profileId: ok ? m.profileId : null };
    }
    // Метки в выводе sc могут быть локализованы, но коды состояний всегда на английском
    const q = await sys.run('sc', ['query', SERVICE]);
    const stm = q.stdout.match(/:\s*\d+\s+(RUNNING|STOPPED|START_PENDING|STOP_PENDING|PAUSED|PAUSE_PENDING|CONTINUE_PENDING)/);
    if (q.code !== 0 && !stm) return { installed: false, state: 'NONE' };
    const state = stm ? stm[1] : 'UNKNOWN';
    const reg = await sys.run('reg', ['query', REG_KEY, '/v', 'zapret-discord-youtube']);
    const bat = (reg.stdout.match(/REG_SZ\s+(.+)/) || [])[1];
    const qc = await sys.run('sc', ['qc', SERVICE]);
    const bin = ((qc.stdout.match(/^[^:\r\n]*:\s*(.*winws\.exe.*)$/im) || [])[1] || '').trim();
    const exe = (bin.match(/^"([^"]+)"/) || bin.match(/^(\S+)/) || [])[1] || '';
    const versionDir = exe ? path.dirname(path.dirname(exe)) : '';
    const meta = this.cfg.serviceMeta || {};
    const ver = this.versions.find(v => v.dir.toLowerCase() === versionDir.toLowerCase());
    return {
      installed: true, state, bat: (bat || '').trim() || meta.batName || '', binPath: bin, versionDir,
      versionId: ver ? ver.id : meta.versionId, version: ver ? ver.version : meta.version,
      fakes: meta.binPath === bin ? meta.fakes : null, profileId: meta.binPath === bin ? meta.profileId : null, meta: meta.binPath === bin ? meta : null,
    };
  }

  async serviceInstall(opts = {}) {
    const b = this.build(opts);
    if (!b.ok) throw new Error(b.error);
    await this.stop({ keepService: false });
    this.ensureVersionUserLists(b.version);
    if (b.settings['net.tcpTimestamps']) await sys.ensureTcpTimestamps();
    const binPath = [quoteArg(b.exe), ...b.args.map(quoteArgForService)].join(' ');
    const meta = {
      versionId: b.version.id, version: b.version.version, batKey: b.bat.key, batName: b.bat.name,
      profileId: opts.profileId || this.cfg.activeProfileId, fakes: fakeNames(b), binPath,
      gameFilter: b.usesGameFilter ? b.settings['gameFilter.mode'] : 'n/a', ipset: b.usesIpset ? b.settings['ipset.mode'] : 'n/a', installedAt: Date.now(),
    };
    if (sys.SIM) {
      fs.writeFileSync(this.simServiceFile(), JSON.stringify({ installed: true, state: 'RUNNING', bat: b.bat.name, binPath, versionId: b.version.id, version: b.version.version }));
      const fd = fs.openSync(this.store.runtime('winws.log'), 'w');
      this.simChild = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e9)'], { detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
      this.simChild.unref(); fs.closeSync(fd);
    } else {
      await sys.run('net', ['stop', SERVICE]);
      await sys.run('sc', ['delete', SERVICE]);
      await wait(300);
      const cr = await sys.run('sc', ['create', SERVICE, 'binPath=', binPath, 'DisplayName=', 'zapret', 'start=', 'auto']);
      if (cr.code !== 0) throw new Error('sc create: ' + (cr.stdout + cr.stderr).trim());
      await sys.run('sc', ['description', SERVICE, 'Zapret DPI bypass software (Zapret Ultimate Edition)']);
      const st = await sys.run('sc', ['start', SERVICE]);
      await sys.run('reg', ['add', REG_KEY, '/v', 'zapret-discord-youtube', '/t', 'REG_SZ', '/d', b.bat.name, '/f']);
      if (st.code !== 0 && !/RUNNING|START_PENDING/i.test(st.stdout)) throw new Error('Сервис создан, но не запустился: ' + (st.stdout + st.stderr).trim());
    }
    this.cfg.serviceMeta = meta; this.cfg.lastRun = null; this.store.save();
    return this.serviceStatus();
  }

  async serviceRemove() {
    if (sys.SIM) {
      try { fs.unlinkSync(this.simServiceFile()); } catch {}
      if (this.simChild) { await sys.killPid(this.simChild.pid); this.simChild = null; }
    } else {
      await sys.run('net', ['stop', SERVICE]);
      await sys.run('sc', ['delete', SERVICE]);
      await sys.killImage('winws.exe');
      for (const d of ['WinDivert', 'WinDivert14']) {
        await sys.run('net', ['stop', d]);
        await sys.run('sc', ['delete', d]);
      }
    }
    this.cfg.serviceMeta = null; this.store.save();
    return this.serviceStatus();
  }

  async serviceControl(action) {
    if (sys.SIM) {
      const s = await this.serviceStatus();
      if (!s.installed) return s;
      s.state = action === 'stop' ? 'STOPPED' : 'RUNNING';
      fs.writeFileSync(this.simServiceFile(), JSON.stringify(s));
      return s;
    }
    await sys.run('net', [action === 'stop' ? 'stop' : 'start', SERVICE], { timeout: 30000 });
    return this.serviceStatus();
  }

  // ---------- статус ----------
  async status() {
    const c = this.cfg;
    const [pids, svc] = await Promise.all([this.winwsPids(), this.serviceStatus()]);
    let state = 'off';
    let run = null;
    if (svc.state === 'RUNNING') {
      state = 'service';
      run = { ...(svc.meta || {}), versionId: svc.versionId, version: svc.version, batName: svc.bat, fakes: svc.fakes || [], service: true };
    } else if (pids.length) {
      state = 'running';
      if (this.testRun && pids.includes(this.testRun.pid)) run = this.testRun;
      else if (c.lastRun && (pids.includes(c.lastRun.pid) || !c.lastRun.pid || sys.SIM)) run = c.lastRun;
      else run = await this.externalInfo(pids);
    }
    if (this.busy) state = this.busy;
    if (this.busy === 'testing') run = this.testRun || { batName: 'проверка стратегий', fakes: [] };
    return { state, pids, run, service: svc, ts: Date.now() };
  }

  async externalInfo(pids) {
    const key = pids.join(',');
    if (this.externalCache.key === key) return this.externalCache.info;
    const det = await sys.processDetails('winws.exe');
    const p = det[0];
    let info = { external: true, pid: pids[0], batName: 'внешний запуск', fakes: [] };
    if (p) {
      const dir = p.exe ? path.dirname(path.dirname(p.exe)) : '';
      const ver = this.versions.find(v => v.dir.toLowerCase() === dir.toLowerCase());
      const fakes = new Set();
      const re = /--dpi-desync-fake-[\w-]+=("?)([^"\s]+\.bin)\1/gi;
      let m; while ((m = re.exec(p.cmd || ''))) fakes.add(path.win32.basename(m[2]).replace(/\.bin$/i, ''));
      info = { external: true, pid: p.pid, versionId: ver && ver.id, version: ver ? ver.version : (dir ? path.basename(dir) : '?'), batName: 'внешний запуск', fakes: [...fakes] };
    }
    this.externalCache = { key, info };
    return info;
  }
}

module.exports = { Engine, FAKE_SLOTS, splitArg };
