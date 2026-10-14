import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MODEL_FILES = [
  'pet_corgi', 'pet_poodle', 'pet_husky', 'pet_spitz', 'pet_yorkie', 'pet_cat',
  'salon_props', 'tools', 'people', 'player',
];

/** Загрузка и клонирование моделей из Blender (GLB). */
export class Assets {
  constructor(base = './models/') {
    this.base = base;
    this.loader = new GLTFLoader();
    this.gltf = {};
  }

  async loadAll(onProgress) {
    let done = 0;
    await Promise.all(
      MODEL_FILES.map(async (name) => {
        const gltf = await this.loader.loadAsync(`${this.base}${name}.glb`);
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const m = o.material;
            if (m && m.name === 'Glass') {
              m.transparent = true;
              m.opacity = 0.25;
              m.depthWrite = false;
            }
            if (m && m.name === 'PerfumeGlass') {
              m.transparent = true;
              m.opacity = 0.6;
            }
            if (m && m.name === 'Blush') {
              m.transparent = true;
              m.opacity = 0.55;
              m.depthWrite = false;
            }
          }
        });
        this.gltf[name] = gltf;
        done++;
        onProgress?.(done / MODEL_FILES.length, name);
      }),
    );
  }

  /** Клон всей сцены файла (питомцы). */
  clone(file) {
    const src = this.gltf[file].scene;
    return src.clone(true);
  }

  /** Клон именованного узла верхнего уровня (мебель, инструменты, люди). */
  node(file, name, { cloneMaterials = false } = {}) {
    const src = this.gltf[file].scene.getObjectByName(name);
    if (!src) throw new Error(`Нет узла ${name} в ${file}`);
    const c = src.clone(true);
    c.position.set(0, 0, 0);
    if (cloneMaterials) {
      const cache = new Map();
      c.traverse((o) => {
        if (o.isMesh) {
          if (!cache.has(o.material)) cache.set(o.material, o.material.clone());
          o.material = cache.get(o.material);
        }
      });
    }
    return c;
  }

  /** Перекрашивает материалы с указанными именами (объект должен иметь свои копии материалов). */
  static tint(obj, names, color) {
    const c = new THREE.Color(color);
    const set = new Set([].concat(names));
    obj.traverse((o) => {
      if (o.isMesh && set.has(o.material?.name)) o.material.color.copy(c);
    });
  }
}
