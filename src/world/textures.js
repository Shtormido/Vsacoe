import * as THREE from 'three';
import { mulberry32 } from '../util/math.js';

// Процедурные текстуры на canvas: пол, стены, вид за окном.

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return `#${c.getHexString()}`;
}

export function floorTexture(kind, base) {
  const rng = mulberry32(kind.length * 97);
  if (kind === 'wood') {
    return canvas(1024, 1024, (g, w, h) => {
      const rows = 8;
      const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rng() * 400;
        while (x < w) {
          const len = 300 + rng() * 300;
          g.fillStyle = shade(base, (rng() - 0.5) * 0.08);
          g.fillRect(x, r * rh, len, rh);
          g.strokeStyle = 'rgba(70,40,20,0.12)';
          for (let k = 0; k < 7; k++) {
            g.beginPath();
            const y = r * rh + rng() * rh;
            g.moveTo(x, y);
            g.bezierCurveTo(x + len * 0.3, y + (rng() - 0.5) * 10, x + len * 0.6, y + (rng() - 0.5) * 10, x + len, y);
            g.stroke();
          }
          g.fillStyle = 'rgba(40,20,10,0.35)';
          g.fillRect(x, r * rh, 3, rh);
          x += len;
        }
        g.fillStyle = 'rgba(40,20,10,0.3)';
        g.fillRect(0, r * rh, w, 3);
      }
    });
  }
  if (kind === 'marble') {
    return canvas(1024, 1024, (g, w, h) => {
      const n = 4, s = w / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const dark = (i + j) % 2 === 1;
          g.fillStyle = dark ? '#2f2a38' : '#f3eff2';
          g.fillRect(i * s, j * s, s, s);
          g.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(120,100,120,0.18)';
          g.lineWidth = 2;
          for (let k = 0; k < 5; k++) {
            g.beginPath();
            let x = i * s + rng() * s, y = j * s;
            g.moveTo(x, y);
            for (let t = 0; t < 8; t++) {
              x += (rng() - 0.5) * 40;
              y += s / 8;
              g.lineTo(x, y);
            }
            g.stroke();
          }
          g.strokeStyle = 'rgba(200,170,90,0.6)';
          g.lineWidth = 3;
          g.strokeRect(i * s, j * s, s, s);
        }
      }
    });
  }
  // бетон
  return canvas(1024, 1024, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${rng() * 0.06})`;
      const r = rng() * 6;
      g.beginPath();
      g.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
    // масляные пятна — это же гараж
    for (let i = 0; i < 3; i++) {
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 90);
      grd.addColorStop(0, 'rgba(40,35,30,0.25)');
      grd.addColorStop(1, 'rgba(40,35,30,0)');
      g.save();
      g.translate(rng() * w, rng() * h);
      g.scale(1, 0.6);
      g.fillStyle = grd;
      g.fillRect(-100, -100, 200, 200);
      g.restore();
    }
  });
}

export function wallTexture(kind, color, color2) {
  const rng = mulberry32(kind.length * 31);
  if (kind === 'brick') {
    return canvas(1024, 1024, (g, w, h) => {
      g.fillStyle = '#d8cfc4';
      g.fillRect(0, 0, w, h);
      const bh = 64, bw = 160;
      for (let r = 0; r < h / bh; r++) {
        for (let c = -1; c < w / bw + 1; c++) {
          const x = c * bw + (r % 2) * bw / 2;
          g.fillStyle = shade(color, (rng() - 0.5) * 0.1);
          g.fillRect(x + 4, r * bh + 4, bw - 8, bh - 8);
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(x + 4, r * bh + 4, bw - 8, 6);
        }
      }
    });
  }
  if (kind === 'panel') {
    return canvas(1024, 1024, (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(160,130,90,0.5)';
      g.lineWidth = 6;
      const pw = w / 3;
      for (let i = 0; i < 3; i++) {
        g.strokeRect(i * pw + 30, h * 0.55, pw - 60, h * 0.4);
        g.strokeRect(i * pw + 30, 40, pw - 60, h * 0.45);
      }
    });
  }
  // крашеная стена с обоями-лапками в верхней части
  return canvas(1024, 1024, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.035)';
    for (let y = 0; y < h * 0.62; y += 128) {
      for (let x = (y / 128) % 2 ? 64 : 0; x < w; x += 128) {
        paw(g, x + 40, y + 50, 14);
      }
    }
    g.fillStyle = color2;
    g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(0, h * 0.62 - 10, w, 14);
  });
}

function paw(g, x, y, r) {
  g.beginPath();
  g.ellipse(x, y + r * 0.6, r, r * 0.8, 0, 0, Math.PI * 2);
  g.fill();
  for (const [dx, dy] of [[-1.1, -0.6], [-0.4, -1.2], [0.4, -1.2], [1.1, -0.6]]) {
    g.beginPath();
    g.ellipse(x + dx * r, y + dy * r, r * 0.35, r * 0.45, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/** Вид за окном: небо, дома и деревья. */
export function streetTexture(sky) {
  const rng = mulberry32(5);
  return canvas(1024, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, sky);
    grd.addColorStop(1, '#fff6e8');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = 'rgba(255,255,255,0.7)';
      const x = rng() * w, y = 40 + rng() * 120;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(x + k * 26, y + Math.sin(k) * 8, 26 + rng() * 10, 0, Math.PI * 2);
        g.fill();
      }
    }
    let x = 0;
    while (x < w) {
      const bw = 80 + rng() * 120, bh = 120 + rng() * 200;
      g.fillStyle = ['#e8b4a0', '#c9d6e8', '#f2d7a6', '#d8c3e6', '#b9dcc9'][Math.floor(rng() * 5)];
      g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let yy = h - bh + 16; yy < h - 30; yy += 34) {
        for (let xx = x + 12; xx < x + bw - 20; xx += 28) g.fillRect(xx, yy, 14, 18);
      }
      x += bw + 6;
    }
    for (let i = 0; i < 9; i++) {
      const tx = rng() * w;
      g.fillStyle = '#6b4a35';
      g.fillRect(tx - 5, h - 90, 10, 90);
      g.fillStyle = ['#6fb36a', '#8cc66a', '#e8a33c'][Math.floor(rng() * 3)];
      g.beginPath();
      g.arc(tx, h - 110, 40 + rng() * 15, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, h - 22, w, 22);
  });
}

/** Текстура вывески с надписью. */
export function signTexture(text, bg, fg = '#ffffff') {
  const t = canvas(1024, 256, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = '900 120px Nunito, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
