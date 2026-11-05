'use strict';
// Проверка стратегий: стандартный тест (HTTP/TLS1.2/TLS1.3 + ping по targets.txt) и DPI 16-20KB.
// Быстрый подбор: все выбранные батники. Полная проверка: батники × фейки.
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const sys = require('./sys');
const V = require('./versions');
const { targetsFromText } = require('./core/lists');
const { FAKE_SLOTS } = require('./core/settings');

const DPI_SUITE_URL = 'https://hyperion-cs.github.io/dpi-checkers/ru/tcp-16-20/suite.v2.json';
const TLS_MODES = [
  { label: 'HTTP', min: undefined, max: undefined },
  { label: 'TLS1.2', min: 'TLSv1.2', max: 'TLSv1.2' },
  { label: 'TLS1.3', min: 'TLSv1.3', max: 'TLSv1.3' },
];
const SSL_CODES = /^(CERT_|UNABLE_TO_|DEPTH_ZERO|SELF_SIGNED|ERR_TLS_CERT|ENOTFOUND|EAI_AGAIN|HOSTNAME_MISMATCH)/;

function classifyError(e) {
  const code = (e && e.code) || '';
  const msg = String((e && e.message) || '');
  if (msg === 'TIMEOUT') return 'TIMEOUT';
  if (SSL_CODES.test(code) || /certificate|self.signed/i.test(msg)) return 'SSL';
  if (/unsupported protocol|no protocols available|wrong version number|version too low|tlsv1 alert protocol version/i.test(msg) || code === 'ERR_SSL_UNSUPPORTED_PROTOCOL') return 'UNSUP';
  if (code === 'ECONNRESET') return 'RESET';
  return 'ERROR';
}

function httpCheck(url, mode, timeoutSec) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve('ERROR'); }
    const isHttps = u.protocol === 'https:';
    if (!isHttps && mode.min) return resolve('UNSUP');
    const lib = isHttps ? https : http;
    let done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
    const req = lib.request({
      host: u.hostname, port: u.port || (isHttps ? 443 : 80), path: (u.pathname || '/') + (u.search || ''), method: 'HEAD',
      agent: false, servername: u.hostname, minVersion: mode.min, maxVersion: mode.max,
      headers: { 'User-Agent': 'curl/8.9.1', Accept: '*/*', Connection: 'close' },
    });
    const t = setTimeout(() => { req.destroy(new Error('TIMEOUT')); }, timeoutSec * 1000);
    req.on('response', (res) => { res.resume(); finish('OK'); });
    req.on('error', (e) => finish(classifyError(e)));
    req.end();
  });
}

function dpiCheck(host, mode, timeoutSec, payload) {
  return new Promise((resolve) => {
    let sock = null, down = 0, code = null, timedOut = false, done = false;
    const finish = (status) => {
      if (done) return; done = true; clearTimeout(t);
      const up = sock ? sock.bytesWritten || 0 : 0;
      if (timedOut && up > 0 && down === 0) status = 'BLOCKED';
      resolve({ status, code, up, down });
    };
    const req = https.request({
      host, port: 443, path: '/', method: 'POST', agent: false, servername: host, minVersion: mode.min, maxVersion: mode.max,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length, Range: `bytes=0-${payload.length - 1}`, 'User-Agent': 'curl/8.9.1' },
    });
    const t = setTimeout(() => { timedOut = true; req.destroy(new Error('TIMEOUT')); }, timeoutSec * 1000);
    req.on('socket', (s) => { sock = s; });
    req.on('response', (res) => { code = res.statusCode; res.on('data', (d) => { down += d.length; }); res.on('end', () => finish('OK')); res.on('error', () => finish('OK')); });
    req.on('error', (e) => { const c = classifyError(e); finish(c === 'UNSUP' ? 'UNSUP' : 'FAIL'); });
    req.end(payload);
  });
}

async function ping(host, timeoutMs = 1000) {
  if (!host) return null;
  if (sys.isWin) {
    const r = await sys.run('ping', ['-n', '1', '-w', String(timeoutMs), host], { timeout: timeoutMs + 3000 });
    if (!/TTL=/i.test(r.stdout)) return null;
    const m = r.stdout.match(/[=<]\s*(\d+)\s*\S*\s+TTL=/i);
    return m ? Number(m[1]) : 1;
  }
  const r = await sys.run('ping', ['-c', '1', '-W', String(Math.ceil(timeoutMs / 1000)), host], { timeout: timeoutMs + 3000 });
  const m = r.stdout.match(/time[=<]([\d.]+)/);
  return m ? Math.round(Number(m[1])) : null;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

function fetchJson(url, timeoutSec) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutSec * 1000, headers: { 'User-Agent': 'ZapretUE' } }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (d) => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

class Tester {
  constructor(engine, store, emit) {
    this.engine = engine; this.store = store; this.emit = emit;
    this.running = false; this.cancelled = false;
  }

  loadTargets(versionId) {
    const c = this.store.get();
    const ver = this.engine.version(versionId);
    const candidates = [c.customDir ? require('path').join(c.customDir, 'targets.txt') : null, ver ? require('path').join(ver.dir, 'utils', 'targets.txt') : null];
    for (const p of candidates) {
      const t = p && V.readText(p);
      if (t) { const list = targetsFromText(t); if (list.length) return { file: p, targets: list }; }
    }
    return { file: null, targets: targetsFromText(require('./core/lists').defaultTargetsText()) };
  }

  cancel() { this.cancelled = true; this.emit({ type: 'log', level: 'warn', text: 'Остановка проверки…' }); }

  buildCombos(opts) {
    const bats = opts.bats || [];
    const variants = [];
    if (opts.mode === 'full') {
      const slots = (opts.fakeSlots || []).filter(s => FAKE_SLOTS.find(f => f.key === s));
      if (opts.includeBaseline !== false) variants.push({ label: 'как в батнике', extra: null, fake: null });
      for (const f of opts.fakes || []) {
        const extra = {};
        for (const s of slots) extra['fakes.' + s] = f;
        variants.push({ label: f.replace(/\.bin$/i, ''), extra, fake: f, slots });
      }
      if (!variants.length) variants.push({ label: 'как в батнике', extra: null, fake: null });
    } else variants.push({ label: 'как в батнике', extra: null, fake: null });
    const combos = [];
    for (const v of variants) for (const b of bats) combos.push({ id: combos.length, batKey: b, batName: b.replace(/^custom:/, ''), variant: v.label, fake: v.fake, slots: v.slots || [], extra: v.extra });
    return combos;
  }

  async run(opts) {
    if (this.running) throw new Error('Проверка уже идёт');
    this.running = true; this.cancelled = false;
    const engine = this.engine;
    const c = this.store.get();
    const versionId = opts.versionId || c.selectedVersion;
    const type = opts.type || 'standard';
    const timeout = Math.max(1, Number(opts.timeout) || 4);
    const parallel = Math.max(1, Number(opts.parallel) || 12);
    const warmup = Math.max(500, Number(opts.warmup) || 1500);
    const result = { id: new Date().toISOString().replace(/[:.]/g, '-'), at: Date.now(), versionId, type, mode: opts.mode || 'quick', combos: [], best: null };
    const prevRun = c.lastRun;
    let prevService = null;
    try {
      const pre = await engine.status();
      const wasRunning = pre.state === 'running';
      if (pre.service.state === 'RUNNING') {
        this.emit({ type: 'log', level: 'warn', text: 'Сервис zapret временно остановлен на время проверки' });
        prevService = true;
        await engine.serviceControl('stop');
      }
      engine.busy = 'testing';
      let targets = [];
      let dpiTargets = [];
      if (type === 'dpi') {
        this.emit({ type: 'log', level: 'info', text: 'Загрузка DPI-набора (hyperion-cs/dpi-checkers)…' });
        try {
          const suite = opts.dpiHost ? [{ id: 'CUSTOM', provider: 'Custom', country: '', host: opts.dpiHost }] : await fetchJson(DPI_SUITE_URL, 8);
          dpiTargets = (Array.isArray(suite) ? suite : []).map(x => ({ name: x.id || x.host, group: `${x.country || ''} ${x.provider || ''}`.trim(), host: x.host })).filter(x => x.host);
        } catch (e) { throw new Error('Не удалось загрузить DPI-набор: ' + e.message); }
        if (!dpiTargets.length) throw new Error('DPI-набор пуст');
      } else {
        const t = this.loadTargets(versionId);
        targets = t.targets;
        if (opts.groups && opts.groups.length) targets = targets.filter(x => opts.groups.includes(x.group));
        if (!targets.length) throw new Error('Нет целей для проверки (targets.txt пуст или ни одна группа не выбрана)');
        this.emit({ type: 'log', level: 'info', text: `Цели: ${targets.length} из ${t.file || 'встроенного набора'}` });
      }
      const combos = this.buildCombos(opts);
      if (!combos.length) throw new Error('Не выбраны батники для проверки');
      const list = type === 'dpi' ? dpiTargets : targets;
      this.emit({ type: 'start', total: combos.length, combos: combos.map(({ extra, ...x }) => x), targets: list.map(x => ({ name: x.name, group: x.group })), testType: type });
      const payload = type === 'dpi' ? crypto.randomBytes(65536) : null;

      for (const combo of combos) {
        if (this.cancelled) break;
        this.emit({ type: 'combo-start', index: combo.id, combo: { ...combo, extra: undefined } });
        const summary = { ...combo, extra: undefined, ok: 0, total: 0, score: 0, avgPing: null, targets: [], error: null };
        try {
          await engine.start({ versionId, batKey: combo.batKey, extra: combo.extra, test: true, ignoreService: true, warmup, profileId: opts.profileId });
        } catch (e) {
          summary.error = e.message;
          this.emit({ type: 'combo-end', index: combo.id, summary });
          result.combos.push(summary);
          continue;
        }
        const pings = [];
        await pool(list, parallel, async (tg) => {
          if (this.cancelled) return;
          const r = { name: tg.name, group: tg.group, checks: {}, ping: null };
          if (type === 'dpi') {
            for (const m of TLS_MODES) { const x = await dpiCheck(tg.host, m, timeout, payload); r.checks[m.label] = x.status; }
          } else {
            if (tg.url) {
              const res = await Promise.all(TLS_MODES.map(m => httpCheck(tg.url, m, timeout)));
              TLS_MODES.forEach((m, i) => { r.checks[m.label] = res[i]; });
            }
            r.ping = await ping(tg.ping, 1000);
            if (r.ping !== null) pings.push(r.ping);
          }
          for (const v of Object.values(r.checks)) { if (v !== 'UNSUP') summary.total++; if (v === 'OK') summary.ok++; }
          summary.targets.push(r);
          this.emit({ type: 'target', index: combo.id, result: r });
        });
        summary.avgPing = pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null;
        summary.pingOk = pings.length;
        summary.score = summary.total ? Math.round((summary.ok / summary.total) * 1000) / 10 : 0;
        await engine.stop();
        result.combos.push(summary);
        this.emit({ type: 'combo-end', index: combo.id, summary });
        if (!combo.extra) {
          c.scores[`${versionId}|${combo.batKey}`] = { score: summary.score, at: Date.now(), type };
        }
      }
      const ranked = result.combos.filter(x => !x.error).sort((a, b) => (b.score - a.score) || ((a.avgPing ?? 1e9) - (b.avgPing ?? 1e9)));
      result.best = ranked[0] ? { batKey: ranked[0].batKey, batName: ranked[0].batName, fake: ranked[0].fake, slots: ranked[0].slots, score: ranked[0].score, variant: ranked[0].variant } : null;
      result.cancelled = this.cancelled;
      fs.writeFileSync(this.store.results(result.id + '.json'), JSON.stringify(result));
      this.store.save();
      engine.busy = null;

      // Что запустить после проверки
      if (opts.autoApply && result.best && !this.cancelled) {
        c.selectedVersion = versionId; c.selectedBat = result.best.batKey; this.store.save();
        const extra = {};
        if (result.best.fake) for (const s of result.best.slots || []) extra['fakes.' + s] = result.best.fake;
        await engine.start({ versionId, batKey: result.best.batKey, extra: Object.keys(extra).length ? extra : null });
        this.emit({ type: 'log', level: 'ok', text: `Запущена лучшая стратегия: ${result.best.batName} (${result.best.score}%)` });
      } else if (prevService) {
        await engine.serviceControl('start');
      } else if (wasRunning && prevRun && prevRun.batKey) {
        try { await engine.start({ versionId: prevRun.versionId, batKey: prevRun.batKey, profileId: prevRun.profileId }); } catch {}
      }
      this.emit({ type: 'done', result: { ...result, combos: result.combos.map(x => ({ ...x })) } });
      return result;
    } catch (e) {
      engine.busy = null;
      try { await engine.stop(); } catch {}
      if (prevService) try { await engine.serviceControl('start'); } catch {}
      this.emit({ type: 'error', text: e.message });
      throw e;
    } finally {
      engine.busy = null;
      this.running = false;
    }
  }

  history() {
    const dir = this.store.results();
    return V.listDir(dir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 50).map(f => {
      try {
        const j = JSON.parse(fs.readFileSync(require('path').join(dir, f), 'utf8'));
        return { id: j.id, at: j.at, type: j.type, mode: j.mode, versionId: j.versionId, count: j.combos.length, best: j.best, cancelled: j.cancelled };
      } catch { return null; }
    }).filter(Boolean);
  }

  read(id) {
    try { return JSON.parse(fs.readFileSync(this.store.results(id.replace(/[^\w\-]/g, '') + '.json'), 'utf8')); } catch { return null; }
  }

  remove(id) {
    try { fs.unlinkSync(this.store.results(id.replace(/[^\w\-]/g, '') + '.json')); } catch {}
  }
}

module.exports = { Tester, httpCheck, ping, classifyError };
