// Копирует игру из корня репозитория в desktop/game для упаковки
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..'), dst = path.join(__dirname, 'game');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
['index.html', 'css', 'js', 'fonts', 'icons'].forEach(f => fs.cpSync(path.join(root, f), path.join(dst, f), { recursive: true }));
fs.copyFileSync(path.join(__dirname, 'build', 'icon.png'), path.join(dst, 'icon.png'));
console.log('game copied to', dst);
