import './styles.css';
import { Game } from './game/Game.js';

const game = new Game(document.getElementById('app'), document.getElementById('ui'));
window.game = game;
game.boot().catch((err) => {
  console.error(err);
  document.getElementById('ui').innerHTML = `<div class="screen-full loading"><div class="logo">Ой!</div><div class="tip">Не удалось запустить игру: ${err.message}</div></div>`;
});
