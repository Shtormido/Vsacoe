'use strict';
// Встроенная консоль service.bat: запускает родной service.bat выбранной версии (с аргументом admin —
// программа уже работает с правами администратора), передаёт ввод и транслирует вывод в интерфейс.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sys = require('./sys');

function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch {}
  try { return new TextDecoder('ibm866').decode(buf); } catch {}
  return buf.toString('latin1');
}

class ServiceBat {
  constructor(emit) {
    this.emit = emit;
    this.sessions = new Map(); // versionId -> { child, log }
  }

  status(versionId) {
    const s = this.sessions.get(versionId);
    return { running: !!(s && s.child && s.child.exitCode === null && !s.exited), log: s ? s.log : '' };
  }

  start(version) {
    this.stop(version.id);
    const file = path.join(version.dir, 'service.bat');
    if (!fs.existsSync(file)) throw new Error('В этой версии нет service.bat');
    let child;
    if (sys.SIM) {
      child = spawn(process.execPath, [path.join(__dirname, 'sbsim.js'), file], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' });
    } else {
      child = spawn('cmd.exe', ['/d', '/s', '/c', `""${file}" admin"`], {
        cwd: version.dir, windowsHide: true, windowsVerbatimArguments: true, stdio: 'pipe',
        env: { ...process.env, NO_UPDATE_CHECK: '' },
      });
    }
    const sess = { child, log: '', exited: false };
    this.sessions.set(version.id, sess);
    const onData = (buf) => {
      const text = decode(buf).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      sess.log = (sess.log + text).slice(-200000);
      this.emit({ type: 'data', versionId: version.id, text });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => { sess.exited = true; this.emit({ type: 'exit', versionId: version.id, code }); });
    child.on('error', (e) => { sess.exited = true; this.emit({ type: 'data', versionId: version.id, text: '\n[ошибка] ' + e.message + '\n' }); });
    this.emit({ type: 'start', versionId: version.id });
    return true;
  }

  input(versionId, text) {
    const s = this.sessions.get(versionId);
    if (!s || s.exited) throw new Error('service.bat не запущен');
    s.log += text + '\n';
    this.emit({ type: 'data', versionId, text: text + '\n', echo: true });
    s.child.stdin.write(text + '\r\n');
    return true;
  }

  stop(versionId) {
    const s = this.sessions.get(versionId);
    if (!s) return true;
    if (!s.exited && s.child.pid) {
      if (sys.isWin) sys.run('taskkill', ['/PID', String(s.child.pid), '/T', '/F']);
      else try { s.child.kill('SIGKILL'); } catch {}
    }
    this.sessions.delete(versionId);
    return true;
  }

  stopAll() { for (const id of [...this.sessions.keys()]) this.stop(id); }

  /** Открыть настоящий service.bat в отдельном окне консоли. */
  openWindow(version) {
    const file = path.join(version.dir, 'service.bat');
    if (!sys.isWin) return false;
    spawn('cmd.exe', ['/d', '/s', '/c', `start "service.bat" /d "${version.dir}" cmd /k ""${file}" admin"`], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore' }).unref();
    return true;
  }
}

module.exports = { ServiceBat };
