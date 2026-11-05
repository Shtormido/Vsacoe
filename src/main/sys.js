'use strict';
// Системные вызовы Windows. На других ОС работает режим симуляции (для разработки интерфейса).
const { execFile, spawn } = require('child_process');

const isWin = process.platform === 'win32';
const SIM = !isWin || process.env.ZUE_SIM === '1';

function run(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, encoding: 'latin1', timeout: opts.timeout || 20000, maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err });
    });
  });
}

function runUtf8(cmd, args = [], opts = {}) {
  return run(cmd, args, { ...opts, encoding: 'utf8' });
}

/** PowerShell с выводом в UTF-8. */
function ps(script, opts = {}) {
  const full = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script;
  return runUtf8('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', full], opts);
}

let adminCache = null;
async function isAdmin() {
  if (SIM) return true;
  if (adminCache !== null) return adminCache;
  const r = await run('net', ['session']);
  adminCache = r.code === 0;
  return adminCache;
}

/** PID процессов по имени образа. */
async function findProcesses(image) {
  if (!isWin) {
    const r = await run('pgrep', ['-f', image]);
    return r.stdout.split(/\s+/).filter(Boolean).map(Number).filter(p => p !== process.pid);
  }
  const r = await run('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH']);
  const out = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(\d+)"/);
    if (m && m[1].toLowerCase() === image.toLowerCase()) out.push(Number(m[2]));
  }
  return out;
}

/** Командные строки процессов (для распознавания запущенного извне winws). */
async function processDetails(image) {
  if (!isWin) return [];
  const r = await ps(`Get-CimInstance Win32_Process -Filter "Name='${image}'" | Select-Object ProcessId,ExecutablePath,CommandLine,CreationDate | ConvertTo-Json -Compress`);
  try {
    let j = JSON.parse(r.stdout.trim() || '[]');
    if (!Array.isArray(j)) j = [j];
    return j.map(p => ({ pid: p.ProcessId, exe: p.ExecutablePath, cmd: p.CommandLine }));
  } catch { return []; }
}

async function killImage(image) {
  if (!isWin) return run('pkill', ['-f', image]);
  return run('taskkill', ['/IM', image, '/F']);
}

async function killPid(pid) {
  if (!pid) return;
  if (!isWin) { try { process.kill(pid, 'SIGKILL'); } catch {} return; }
  return run('taskkill', ['/PID', String(pid), '/F']);
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

async function ensureTcpTimestamps() {
  if (!isWin) return true;
  const r = await run('netsh', ['interface', 'tcp', 'show', 'global']);
  if (/timestamps\s*:\s*enabled/i.test(r.stdout)) return true;
  const s = await run('netsh', ['interface', 'tcp', 'set', 'global', 'timestamps=enabled']);
  return s.code === 0;
}

function spawnDetached(exe, args, opts = {}) {
  const child = spawn(exe, args, { detached: true, windowsHide: opts.hidden !== false, stdio: opts.stdio || 'ignore', cwd: opts.cwd });
  child.unref();
  return child;
}

async function systemFonts() {
  if (!isWin) return ['Segoe UI', 'Arial', 'Verdana', 'Consolas', 'DejaVu Sans', 'Liberation Sans'];
  const r = await ps('Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }');
  return r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

module.exports = { isWin, SIM, run, runUtf8, ps, isAdmin, findProcesses, processDetails, killImage, killPid, pidAlive, ensureTcpTimestamps, spawnDetached, systemFonts };
