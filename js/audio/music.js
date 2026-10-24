// Музыка: пошаговый секвенсор (16 шагов на такт) и треки по фазам игры
const CH = {   // аккорды в MIDI
  Fmaj7: [53, 57, 60, 64], Dm7: [50, 53, 57, 60], Gm7: [55, 58, 62, 65], C7: [48, 52, 55, 58], Am7: [57, 60, 64, 67],
  Dm9: [50, 53, 57, 64], Bbmaj7: [46, 50, 53, 57], A7: [45, 49, 52, 55],
  Am: [57, 60, 64], F: [53, 57, 60], C: [48, 52, 55], G: [55, 59, 62]
};
// главная тема закусочной: [шаг, нота, длительность в шагах] на 8 тактов
const THEME = [
  [[0, 72, 4], [4, 76, 2], [6, 77, 2], [8, 76, 4], [12, 72, 4]],
  [[0, 74, 6], [6, 72, 2], [8, 69, 4], [12, 65, 4]],
  [[0, 70, 2], [2, 74, 2], [4, 77, 4], [8, 79, 2], [10, 77, 2], [12, 74, 4]],
  [[0, 76, 6], [6, 72, 2], [8, 70, 4], [12, 67, 4]],
  [[0, 76, 4], [4, 72, 2], [6, 69, 2], [8, 72, 8]],
  [[0, 77, 4], [4, 74, 2], [6, 72, 2], [8, 69, 4], [12, 74, 4]],
  [[0, 70, 4], [4, 74, 4], [8, 77, 2], [10, 76, 2], [12, 74, 4]],
  [[0, 72, 8], [12, 67, 2], [14, 70, 2]]
];
// та же тема в фа миноре — для титров и ночи: уютное становится жутким
const minor = m => ({ 9: m - 1, 4: m - 1, 2: m - 1 })[m % 12] ?? m;

const Inst = {
  epiano(m, t, dur, vel, out) {
    Sound.tone('sine', mtof(m), t, dur, vel, out, { attack: 0.008 });
    Sound.tone('triangle', mtof(m), t, dur * 0.6, vel * 0.35, out, { attack: 0.004, filter: 'lowpass', freq: 2200 });
    Sound.tone('sine', mtof(m + 12), t, dur * 0.25, vel * 0.12, out);
  },
  bass(m, t, dur, vel, out) {
    Sound.tone('triangle', mtof(m), t, dur, vel, out, { attack: 0.01, filter: 'lowpass', freq: 700 });
    Sound.tone('sine', mtof(m - 12), t, dur, vel * 0.6, out, { attack: 0.01 });
  },
  vibes(m, t, dur, vel, out) {
    Sound.tone('sine', mtof(m), t, dur, vel, out, { attack: 0.004, rev: 0.25 });
    Sound.tone('sine', mtof(m) * 4, t, dur * 0.15, vel * 0.15, out, { rev: 0.2 });
  },
  box(m, t, vel, out, rev = 0.6) {   // музыкальная шкатулка
    Sound.tone('sine', mtof(m), t, 1.6, vel, out, { attack: 0.002, rev });
    Sound.tone('sine', mtof(m) * 2.01, t, 0.8, vel * 0.4, out, { rev });
    Sound.tone('sine', mtof(m) * 5.02, t, 0.25, vel * 0.15, out, { rev });
  },
  pluck(m, t, vel, out) {
    Sound.tone('triangle', mtof(m), t, 0.9, vel, out, { attack: 0.003, filter: 'lowpass', freq: 3200, fTo: 500, rev: 0.25 });
    Sound.tone('sine', mtof(m), t, 1.2, vel * 0.5, out, { rev: 0.2 });
  },
  pad(notes, t, dur, vel, out) {
    notes.forEach(m => [-7, 7].forEach(d => Sound.tone('sawtooth', mtof(m), t, dur, vel, out, { attack: dur * 0.35, detune: d, filter: 'lowpass', freq: 700, rev: 0.4 })));
  },
  kick(t, vel, out) { Sound.tone('sine', 120, t, 0.16, vel, out, { to: 42, glide: 0.12 }); },
  brush(t, vel, out) { Sound.noise(t, 0.14, vel, out, { freq: 3500, q: 0.8, attack: 0.015 }); },
  hat(t, vel, out) { Sound.noise(t, 0.04, vel, out, { type: 'highpass', freq: 7500 }); },
  chirp(t, out) { for (let i = 0; i < 3; i++) Sound.tone('sine', rnd(2600, 3200), t + i * 0.09, 0.06, 0.02, out, { to: rnd(3800, 4600) }); }
};

const TRACKS = {
  // уютный диннер-джаз днём
  day: {
    bpm: 92, swing: 0.32,
    step(I, s, t, out) {
      const bar = Math.floor(s / 16), pos = s % 16, pass = Math.floor(bar / 8) % 3, b = bar % 8;
      const prog = ['Fmaj7', 'Dm7', 'Gm7', 'C7', 'Am7', 'Dm7', 'Gm7', 'C7'], ch = CH[prog[b]], next = CH[prog[(b + 1) % 8]];
      const beat = 60 / this.bpm;
      if (pos === 0) ch.forEach(m => Inst.epiano(m + 12, t, beat * 1.4, 0.035, out));
      if (pos === 6 || (pos === 10 && b % 2)) ch.forEach(m => Inst.epiano(m + 12, t, beat * 0.35, 0.025, out));
      if (pos % 4 === 0) {
        const root = ch[0] - 12, walk = [root, root + 4 - (prog[b].includes('m') ? 1 : 0), root + 7, next[0] - 12 + (Math.random() < 0.5 ? 1 : -1)];
        Inst.bass(walk[pos / 4], t, beat * 0.9, 0.11, out);
      }
      if (pos === 0) Inst.kick(t, 0.22, out);
      if (pos === 8 && b % 2) Inst.kick(t, 0.12, out);
      if (pos === 4 || pos === 12) Inst.brush(t, 0.05, out);
      if (pos % 4 === 2 || pos % 4 === 0) Inst.hat(t, pos % 4 === 2 ? 0.025 : 0.015, out);
      THEME[b].forEach(([p, m, len]) => {
        if (p !== pos) return;
        if (pass === 0) Inst.vibes(m, t, len * beat / 4 + 0.3, 0.06, out);
        if (pass === 1 && len >= 4) Inst.epiano(m + 12, t, len * beat / 4, 0.045, out);
      });
      if (pass === 2 && pos === 14 && b % 2) Inst.vibes(ch[2] + 24, t, 0.4, 0.035, out);
    }
  },
  // вечер: медленнее, в миноре
  evening: {
    bpm: 76, swing: 0.25,
    step(I, s, t, out) {
      const bar = Math.floor(s / 16), pos = s % 16, b = bar % 4;
      const ch = CH[['Dm9', 'Bbmaj7', 'Gm7', 'A7'][b]], beat = 60 / this.bpm;
      if (pos === 0) { ch.forEach(m => Inst.epiano(m + 12, t, beat * 3, 0.03, out)); Inst.bass(ch[0] - 12, t, beat * 1.8, 0.1, out); }
      if (pos === 8) Inst.bass(ch[0] - 5, t, beat * 1.5, 0.08, out);
      if (pos === 4 || pos === 12) Inst.brush(t, 0.03, out);
      if (pos % 4 === 2) Inst.hat(t, 0.015, out);
      if ((pos === 6 || pos === 10) && Math.random() < 0.55) Inst.vibes(pick(ch) + 24, t, 0.8, 0.04, out);
    }
  },
  // ночь: гул, шкатулка, редкие удары
  night: {
    bpm: 56, swing: 0, drone: true,
    step(I, s, t, out) {
      const bar = Math.floor(s / 16), pos = s % 16;
      const set = [69, 72, 76, 75, 81, 80, 68];
      if (pos === 0 && Math.random() < 0.75) Inst.box(pick(set), t, 0.05, out);
      if (pos === 8 && Math.random() < 0.4) Inst.box(pick(set) - 12, t, 0.04, out);
      if (pos === 12 && Math.random() < 0.15) { Inst.box(82, t, 0.025, out); Inst.box(83, t + 0.02, 0.02, out); }
      if (pos === 0 && bar % 4 === 0) Inst.kick(t, 0.35, out);
      if (pos === 4 && bar % 6 === 3) Sound.noise(t, 2.2, 0.035, out, { freq: 900, q: 5, attack: 1.2, rev: 0.7 });
    }
  },
  // титры: тема закусочной в миноре на шкатулке
  title: {
    bpm: 64, swing: 0, drone: true, droneVol: 0.6,
    step(I, s, t, out) {
      const bar = Math.floor(s / 16), pos = s % 16;
      THEME[bar % 8].forEach(([p, m]) => { if (p === pos) Inst.box(minor(m), t, 0.06, out, 0.8); });
      if (pos === 0 && bar % 2 === 0) Inst.pad([41, 48], t, 60 / this.bpm * 8, 0.012, out);
    }
  },
  // колыбельная перед сном
  lullaby: {
    bpm: 52, swing: 0,
    step(I, s, t, out) {
      const bar = Math.floor(s / 16), pos = s % 16;
      THEME[bar % 4].forEach(([p, m]) => { if (p === pos) Inst.box(m, t, 0.05, out, 0.7); });
      if (pos === 0) Inst.pad([53, 60], t, 60 / this.bpm * 4, 0.01, out);
    }
  },
  // утро: переборы и птицы
  morning: {
    bpm: 72, swing: 0,
    step(I, s, t, out) {
      const bar = Math.floor(s / 16), pos = s % 16;
      const ch = CH[['Am', 'F', 'C', 'G'][bar % 4]];
      if (pos % 2 === 0) { const pat = [0, 1, 2, 1, 0, 2, 1, 2]; const n = ch[pat[pos / 2]] + (pos >= 8 ? 12 : 0); Inst.pluck(n, t, 0.05, out); }
      if (pos === 0) { Inst.pad(ch.slice(0, 2), t, 60 / this.bpm * 4, 0.008, out); Inst.bass(ch[0] - 12, t, 2, 0.06, out); }
      if (Math.random() < 0.04) Inst.chirp(t, out);
    }
  }
};

const Music = {
  cur: null, timer: null,
  play(name) {
    if (!Sound.ready()) return;
    if (this.cur && this.cur.name === name) return;
    const c = Sound.ctx, t = c.currentTime;
    if (this.cur) { const old = this.cur; old.gain.gain.setTargetAtTime(0, t, 0.6); old.dead = true; setTimeout(() => { old.gain.disconnect(); old.drone && old.drone.forEach(o => { try { o.stop(); } catch (e) { /* уже */ } }); }, 4000); }
    if (!name) { this.cur = null; return; }
    const def = TRACKS[name], gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t); gain.gain.setTargetAtTime(1, t + 0.1, 0.8); gain.connect(Sound.musicBus);
    const inst = { name, def, gain, step: 0, start: t + 0.15 };
    if (def.drone) inst.drone = this.startDrone(gain, def.droneVol || 1);
    this.cur = inst;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
  },
  startDrone(out, v) {
    const c = Sound.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; g.gain.value = 0.05 * v; lp.connect(g); g.connect(out);
    const oscs = [[55, 'sawtooth', 0], [55 * 1.498, 'sawtooth', 6], [27.5, 'sine', 0], [58.27, 'sawtooth', -4]].map(([f, type, d], i) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = d;
      const og = c.createGain(); og.gain.value = i === 3 ? 0.25 : 0.6; o.connect(og); og.connect(lp); o.start(); return o;
    });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 180; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    oscs.push(lfo);
    return oscs;
  },
  tick() {
    const I = this.cur;
    if (!I || !Sound.ready()) return;
    const sd = 60 / I.def.bpm / 4, ahead = Sound.now() + 0.15;
    while (true) {
      const grid = I.start + I.step * sd;
      if (grid > ahead) break;
      const pos = I.step % 16, t = grid + (pos % 4 === 2 ? I.def.swing * sd : 0);
      if (t >= Sound.now() - 0.02) I.def.step(I, I.step, t, I.gain);
      I.step++;
    }
  }
};

// какой трек звучит сейчас
function musicFor() {
  switch (G.phase) {
    case 'title': case 'ending': return 'title';
    case 'day': return G.time / 60 >= 20 ? 'evening' : 'day';
    case 'sleep': return 'lullaby';
    case 'nightmenu': case 'stealth': return 'night';
    case 'morning': return 'morning';
  }
  return null;
}
