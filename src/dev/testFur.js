import * as THREE from 'three';
import { createRenderer } from '../engine/Renderer.js';
import { Assets } from '../engine/Assets.js';
import { Pet } from '../pet/Pet.js';
import { furLighting } from '../fur/FurMaterial.js';

const params = new URLSearchParams(location.search);
const { renderer, scene, camera } = createRenderer(document.getElementById('app'));
scene.background = new THREE.Color('#d9d3e6');
const sun = new THREE.DirectionalLight('#fff3e0', 2.2);
sun.position.set(2, 4, 3);
scene.add(sun, new THREE.HemisphereLight('#dfe6ff', '#806a60', 1.0));
const assets = new Assets('./models/');
await assets.loadAll();
const breeds = (params.get('breeds') || 'corgi,poodle,husky,spitz,yorkie,cat').split(',');
const pets = breeds.map((b, i) => {
  const p = new Pet(assets, b, { palette: Number(params.get('pal') || 0), seed: i + 1 });
  p.root.position.set((i - (breeds.length - 1) / 2) * 0.75, 0, 0);
  p.root.rotation.y = Number(params.get('yaw') || 0.9);
  p.setCondition({ dirt: Number(params.get('dirt') || 0), mats: Number(params.get('mats') || 0) });
  scene.add(p.root);
  return p;
});
if (params.get('soap')) for (const p of pets) for (const part of p.parts) { for (let i = 0; i < part.n; i++) part.state[i*4+3] = (i % 7) / 7; part.aState.needsUpdate = true; }
const n = breeds.length;
camera.position.set(0, 0.5, n > 1 ? 0.5 + n * 0.36 : 1.0);
camera.lookAt(0, 0.22, 0);
let t = 0;
let frames = Number(params.get('frames') || 3);
function frame() {
  if (frames-- <= 0) { window.__ready = true; return; }
  t += 1 / 60;
  furLighting.uTime.value = t;
  furLighting.uLightDir.value.copy(sun.position).normalize();
  for (const p of pets) p.update(1 / 60, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
