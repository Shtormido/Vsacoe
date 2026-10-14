/**
 * Весь звук синтезируется WebAudio — без звуковых файлов.
 * Короткие эффекты: play(name). Петли (вода, фен, машинка): loop(name, on).
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musicVol = 0.35;
    this.loops = {};
    this.music = null;
  }

  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    this.mus = this.ctx.createGain();
    this.mus.gain.value = this.musicVol;
    this.mus.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  unlock() {
    if (!this.ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (this.ctx) {
      this.sfx.gain.value = sfx;
      this.mus.gain.value = music;
    }
  }

  _env(node, t, a, d, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g);
    return g;
  }

  _osc(type, f, t, dur, { to, peak = 0.3, a = 0.005, out } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this._env(o, t, a, dur, peak);
    g.connect(out || this.sfx);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    return o;
  }

  _noise(t, dur, { type = 'bandpass', f = 1000, q = 1, peak = 0.3, a = 0.005, out } = {}) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    s.connect(fl);
    const g = this._env(fl, t, a, dur, peak);
    g.connect(out || this.sfx);
    s.start(t, Math.random());
    s.stop(t + a + dur + 0.05);
  }

  play(name) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'click':
        this._osc('triangle', 880, t, 0.05, { peak: 0.12 });
        break;
      case 'blip':
        this._osc('sine', 620 + Math.random() * 80, t, 0.05, { peak: 0.05 });
        break;
      case 'snip':
        this._noise(t, 0.04, { type: 'highpass', f: 5000, peak: 0.35 });
        this._osc('square', 2400, t, 0.02, { peak: 0.05 });
        break;
      case 'clip':
        this._noise(t, 0.06, { type: 'highpass', f: 3000, peak: 0.4 });
        this._osc('triangle', 300, t, 0.05, { to: 120, peak: 0.25 });
        break;
      case 'squish':
        this._noise(t, 0.18, { type: 'lowpass', f: 900, peak: 0.25 });
        this._osc('sine', 300, t, 0.15, { to: 700, peak: 0.08 });
        break;
      case 'spray':
        this._noise(t, 0.35, { type: 'highpass', f: 4500, peak: 0.25, a: 0.02 });
        break;
      case 'bark':
        for (const k of [0, 0.22]) {
          this._osc('sawtooth', 520, t + k, 0.12, { to: 260, peak: 0.25 });
          this._noise(t + k, 0.1, { f: 900, q: 2, peak: 0.2 });
        }
        break;
      case 'yap':
        for (const k of [0, 0.14, 0.28]) this._osc('sawtooth', 900, t + k, 0.07, { to: 500, peak: 0.18 });
        break;
      case 'howl':
        this._osc('sawtooth', 380, t, 1.1, { to: 620, peak: 0.12, a: 0.2 });
        this._osc('sine', 760, t, 1.1, { to: 1240, peak: 0.06, a: 0.2 });
        break;
      case 'meow': {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(500, t);
        o.frequency.linearRampToValueAtTime(820, t + 0.25);
        o.frequency.linearRampToValueAtTime(420, t + 0.6);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(900, t);
        f.frequency.linearRampToValueAtTime(1800, t + 0.3);
        f.Q.value = 3;
        o.connect(f);
        this._env(f, t, 0.05, 0.6, 0.35).connect(this.sfx);
        o.start(t);
        o.stop(t + 0.75);
        break;
      }
      case 'shake':
        for (let i = 0; i < 6; i++) this._noise(t + i * 0.07, 0.06, { type: 'bandpass', f: 1600, peak: 0.18 });
        break;
      case 'bell':
        for (const [f, p] of [[1320, 0.18], [1980, 0.08], [2640, 0.05]]) this._osc('sine', f, t, 1.2, { peak: p });
        this._osc('sine', 990, t + 0.25, 1.2, { peak: 0.12 });
        break;
      case 'coins':
        [988, 1319, 1568, 2093].forEach((f, i) => this._osc('square', f, t + i * 0.07, 0.12, { peak: 0.06 }));
        break;
      case 'success':
        [523, 659, 784, 1047].forEach((f, i) => this._osc('triangle', f, t + i * 0.1, 0.3, { peak: 0.15 }));
        break;
      case 'fail':
        [392, 330, 262].forEach((f, i) => this._osc('triangle', f, t + i * 0.14, 0.3, { peak: 0.13 }));
        break;
      case 'eat':
        for (let i = 0; i < 4; i++) this._noise(t + i * 0.11, 0.05, { type: 'lowpass', f: 700, peak: 0.25 });
        break;
      case 'pop':
        this._osc('sine', 400, t, 0.08, { to: 900, peak: 0.2 });
        break;
      case 'whoosh':
        this._noise(t, 0.4, { type: 'bandpass', f: 600, q: 0.7, peak: 0.2, a: 0.1 });
        break;
      case 'fanfare':
        [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.45], [784, 0.65], [1047, 0.8]].forEach(([f, k]) => {
          this._osc('sawtooth', f, t + k, 0.35, { peak: 0.08 });
          this._osc('triangle', f / 2, t + k, 0.35, { peak: 0.1 });
        });
        break;
      default:
        break;
    }
  }

  /** Непрерывный звук инструмента. */
  loop(name, on) {
    if (!this.ensure()) return;
    const cur = this.loops[name];
    if (on && !cur) {
      const t = this.ctx.currentTime;
      const out = this.ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(1, t + 0.08);
      out.connect(this.sfx);
      const nodes = [];
      if (name === 'water' || name === 'dryer' || name === 'spray') {
        const s = this.ctx.createBufferSource();
        s.buffer = this.noise;
        s.loop = true;
        const f = this.ctx.createBiquadFilter();
        f.type = name === 'water' ? 'bandpass' : 'lowpass';
        f.frequency.value = name === 'water' ? 2400 : 1400;
        f.Q.value = name === 'water' ? 0.6 : 0.3;
        const g = this.ctx.createGain();
        g.gain.value = name === 'water' ? 0.3 : 0.22;
        s.connect(f).connect(g).connect(out);
        s.start();
        nodes.push(s);
        if (name === 'dryer') {
          const o = this.ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = 160;
          const og = this.ctx.createGain();
          og.gain.value = 0.03;
          o.connect(og).connect(out);
          o.start();
          nodes.push(o);
        }
      } else if (name === 'clipper') {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 118;
        const o2 = this.ctx.createOscillator();
        o2.type = 'square';
        o2.frequency.value = 236;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1800;
        const g = this.ctx.createGain();
        g.gain.value = 0.07;
        o.connect(f);
        o2.connect(f);
        f.connect(g).connect(out);
        o.start();
        o2.start();
        nodes.push(o, o2);
      }
      this.loops[name] = { out, nodes };
    } else if (!on && cur) {
      const t = this.ctx.currentTime;
      cur.out.gain.cancelScheduledValues(t);
      cur.out.gain.setValueAtTime(cur.out.gain.value, t);
      cur.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      cur.nodes.forEach((n) => n.stop(t + 0.15));
      delete this.loops[name];
    }
  }

  stopLoops() {
    for (const k of Object.keys(this.loops)) this.loop(k, false);
  }

  /** Спокойная генеративная музыка: мягкие аккорды + пиццикато. */
  startMusic(mood = 'salon') {
    if (!this.ensure()) return;
    this.stopMusic();
    const ctx = this.ctx;
    const prog = mood === 'stage'
      ? [[57, 60, 64, 67], [53, 57, 60, 65], [55, 59, 62, 67], [52, 55, 59, 64]]
      : [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
    const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
    const bpm = mood === 'stage' ? 104 : 84;
    const beat = 60 / bpm;
    let next = ctx.currentTime + 0.1;
    let step = 0;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const tick = () => {
      while (next < ctx.currentTime + 0.6) {
        const bar = Math.floor(step / 8) % prog.length;
        const chord = prog[bar];
        if (step % 8 === 0) {
          for (const n of chord) {
            const o = ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.value = mtof(n - 12);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, next);
            g.gain.exponentialRampToValueAtTime(0.05, next + 0.4);
            g.gain.exponentialRampToValueAtTime(0.0001, next + beat * 8);
            o.connect(g).connect(this.mus);
            o.start(next);
            o.stop(next + beat * 8 + 0.1);
          }
          const b = ctx.createOscillator();
          b.type = 'sine';
          b.frequency.value = mtof(chord[0] - 24);
          const bg = ctx.createGain();
          bg.gain.setValueAtTime(0.0001, next);
          bg.gain.exponentialRampToValueAtTime(0.12, next + 0.02);
          bg.gain.exponentialRampToValueAtTime(0.0001, next + beat * 3);
          b.connect(bg).connect(this.mus);
          b.start(next);
          b.stop(next + beat * 3.2);
        }
        if (Math.random() < (step % 2 === 0 ? 0.7 : 0.3)) {
          const n = chord[0] + scale[Math.floor(Math.random() * scale.length)];
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = mtof(n + 12);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, next);
          g.gain.exponentialRampToValueAtTime(0.06, next + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, next + beat * 1.5);
          o.connect(g).connect(this.mus);
          o.start(next);
          o.stop(next + beat * 1.6);
        }
        next += beat / 2;
        step++;
      }
    };
    this.music = setInterval(tick, 150);
    tick();
  }

  stopMusic() {
    if (this.music) clearInterval(this.music);
    this.music = null;
  }
}
