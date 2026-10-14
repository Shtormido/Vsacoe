import * as THREE from 'three';
import { Assets } from '../engine/Assets.js';
import { Npc } from './Npc.js';

export const SKIN_TONES = { light: '#f6d2bd', fair: '#efc3a4', tan: '#d9a47e', brown: '#a8714f', dark: '#7a4b33' };
export const HAIR_STYLES = {
  short: 'Короткая', bun: 'Пучок', ponytail: 'Хвост', bob: 'Каре', long: 'Длинные', curly: 'Кудри',
  afro: 'Афро', slick: 'Кок', mohawk: 'Ирокез', bald: 'Лысина', none: 'Без волос',
};
export const PALETTE = ['#ffffff', '#3d2f3a', '#ff6f96', '#ff9248', '#ffc23d', '#5fd0b5', '#4aa3df', '#8a6cf0',
  '#e0504f', '#2f8f5f', '#3a4a6a', '#c9b8a4', '#6b4423', '#121212'];
export const HAIR_COLORS = ['#121212', '#3a2a1a', '#6b4423', '#a0622d', '#d9a066', '#f4d27a', '#e8e2d8', '#c8452c',
  '#ff6f96', '#8a6cf0', '#4aa3df', '#5fd0b5'];

/** Собирает модель персонажа игрока из частей player.glb по описанию внешности. */
export function buildPlayerModel(assets, look) {
  const body = assets.node('player', look.body === 'man' ? 'Player_man' : 'Player_woman', { cloneMaterials: true });
  let head = null;
  body.traverse((o) => {
    if (!head && /^Head\d*$/.test(o.name)) head = o;
  });
  const attach = (name) => {
    const part = assets.node('player', name, { cloneMaterials: true });
    part.position.set(0, 0, 0);
    head.add(part);
    return part;
  };
  if (look.hair && look.hair !== 'none') attach(`PHair_${look.hair}`);
  if (look.glasses) attach('PAcc_glasses');
  if (look.cap) attach('PAcc_cap');
  if (look.beard) attach('PAcc_beard');
  Assets.tint(body, ['Skin_P'], SKIN_TONES[look.skin] || look.skin);
  Assets.tint(body, ['Top_P'], look.top);
  Assets.tint(body, ['Bottom_P'], look.bottom);
  Assets.tint(body, ['Shoes_P'], look.shoes);
  Assets.tint(body, ['Apron_P'], look.apron);
  Assets.tint(body, ['Hair_P'], look.hairColor);
  Assets.tint(body, ['Cap_P'], look.capColor || '#e0504f');
  body.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return body;
}

/** Игрок — тот же NPC, но управляется с клавиатуры. */
export class Player extends Npc {
  constructor(assets, look) {
    super(assets, 'player', buildPlayerModel(assets, look));
    this.look = look;
    this.assets = assets;
  }

  rebuild(look) {
    this.look = look;
    this.root.remove(this.model);
    this.model = buildPlayerModel(this.assets, look);
    this.root.add(this.model);
    const f = (n) => {
      let found = null;
      const re = new RegExp(`^${n}\\d*$`);
      this.model.traverse((o) => {
        if (!found && re.test(o.name)) found = o;
      });
      return found;
    };
    this.head = f('Head');
    this.armL = f('ArmL');
    this.armR = f('ArmR');
    this.legL = f('LegL');
    this.legR = f('LegR');
    this.rest = new Map();
    for (const o of [this.head, this.armL, this.armR, this.legL, this.legR]) if (o) this.rest.set(o, o.quaternion.clone());
  }
}

export const _tmp = new THREE.Vector3();
