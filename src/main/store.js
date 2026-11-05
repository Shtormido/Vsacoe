'use strict';
// Портативное хранилище: всё лежит рядом с exe в папке ZapretUE-data.
const fs = require('fs');
const path = require('path');

function appDir(app) {
  if (process.env.ZUE_DATA_DIR) return process.env.ZUE_DATA_DIR;
  if (app && app.isPackaged) return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  return path.resolve(__dirname, '..', '..');
}

const DEFAULT_CONFIG = () => ({
  zapretRoot: '',
  customDir: '',
  selectedVersion: '',
  selectedBat: '',
  activeProfileId: 'daily',
  base: {},
  versionOverrides: {},
  batOverrides: {},
  batOrder: [],
  profiles: [
    { id: 'daily', name: 'Повседневный', icon: 'globe', color: '#0a84ff', version: '', bat: '', overrides: {} },
    { id: 'games', name: 'Игры', icon: 'game', color: '#34c759', version: '', bat: '', overrides: { 'gameFilter.mode': 'all' } },
    { id: 'light', name: 'Минимальный', icon: 'leaf', color: '#ff9f0a', version: '', bat: '', overrides: { 'gameFilter.mode': 'disabled', 'ipset.mode': 'none' } },
  ],
  ui: { themeId: 'fluent-dark', customThemes: [], sidebarCollapsed: false, lastPage: 'home' },
  app: { stopFull: true, stopOnExit: false, minimizeToTray: true, startMinimized: false, autoRestart: true, pollMs: 2000, autoStart: false, autoStartBat: true },
  tests: { type: 'standard', timeout: 4, parallel: 12, warmup: 1500, groups: null },
  scores: {},
  serviceMeta: null,
  lastRun: null,
});

function deepFill(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (target[k] === undefined) target[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deepFill(target[k], v);
  }
  return target;
}

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'config.json');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'results'), { recursive: true });
    this.data = this.load();
    this.timer = null;
  }
  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return deepFill(raw, DEFAULT_CONFIG());
    } catch {
      return DEFAULT_CONFIG();
    }
  }
  get() { return this.data; }
  patch(partial) {
    for (const [k, v] of Object.entries(partial || {})) this.data[k] = v;
    this.save();
    return this.data;
  }
  save(now = false) {
    clearTimeout(this.timer);
    const write = () => {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    };
    if (now) write(); else this.timer = setTimeout(write, 150);
  }
  runtime(...p) { return path.join(this.dataDir, 'runtime', ...p); }
  results(...p) { return path.join(this.dataDir, 'results', ...p); }
}

module.exports = { Store, appDir, DEFAULT_CONFIG };
