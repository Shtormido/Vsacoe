// Офлайн-версия для браузера: архив с игрой и скриптом запуска
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { version } = require('./package.json');
const name = `Pridorozhny-Motel-${version}-web`;
const out = path.join(__dirname, 'dist'), dir = path.join(out, name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
['index.html', 'css', 'js', 'fonts', 'icons'].forEach(f => fs.cpSync(path.join(__dirname, '..', f), path.join(dir, f), { recursive: true }));
fs.writeFileSync(path.join(dir, 'play.sh'), '#!/bin/sh\n# Открывает игру в браузере по умолчанию\ncd "$(dirname "$0")" && xdg-open index.html\n', { mode: 0o755 });
fs.writeFileSync(path.join(dir, 'README.txt'), 'Придорожный Мотель — браузерная версия\n\nЗапуск: ./play.sh или открой index.html в Chrome / Firefox.\nРаботает без интернета. Сохранения хранятся в браузере.\n');
execSync(`tar -czf ${name}.tar.gz ${name}`, { cwd: out });
fs.rmSync(dir, { recursive: true, force: true });
console.log('web build:', path.join(out, name + '.tar.gz'));
