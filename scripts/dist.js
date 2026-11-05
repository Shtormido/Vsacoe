'use strict';
// Сборка portable-exe с автоматическим номером версии: <major>.<minor>.<число коммитов>.
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');
const [major, minor] = pkg.version.split('.');
let build = '0';
try { build = execSync('git rev-list --count HEAD', { cwd: path.join(__dirname, '..') }).toString().trim(); } catch {}
const version = `${major}.${minor}.${build}`;
console.log('Версия сборки:', version);
const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(bin, ['electron-builder', '--win', 'portable', '--x64', '--publish', 'never', `-c.extraMetadata.version=${version}`, ...process.argv.slice(2)], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status === null ? 1 : r.status);
