// Звуковой движок: всё синтезируется WebAudio, без внешних файлов
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const Sound = {
  ctx: null, master: null, musicBus: null, sfxBus: null, ambBus: null, revIn: null, noiseBuf: null,
  prefs: { muted: false, music: 0.7, sfx: 0.85 },
  danger: 0, beatT: 0, popT: 0,

  loadPrefs() {
    try { Object.assign(this.prefs, JSON.parse(localStorage.getItem('motel-sound') || '{}')); } catch (e) { /* нет хранилища */ }
  },
  savePrefs() { try { localStorage.setItem('motel-sound', JSON.stringify(this.prefs)); } catch (e) { /* ignore */ } },

  // браузер разрешает звук только после действия игрока
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.connect(c.destination);
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
      this.master.disconnect(); this.master.connect(comp); comp.connect(c.destination);
      this.musicBus = c.createGain(); this.sfxBus = c.createGain(); this.ambBus = c.createGain();
      [this.musicBus, this.sfxBus, this.ambBus].forEach(b => b.connect(this.master));
      // реверберация
      const len = c.sampleRate * 2.8, imp = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      const conv = c.createConvolver(); conv.buffer = imp;
      this.revIn = c.createGain(); this.revIn.gain.value = 0.5; this.revIn.connect(conv); conv.connect(this.master);
      // белый шум
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      Amb.init();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  ready() { return this.ctx && this.ctx.state === 'running'; },
  now() { return this.ctx.currentTime; },
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.now();
    this.master.gain.setTargetAtTime(this.prefs.muted ? 0 : 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.prefs.music * 0.8, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.prefs.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.prefs.sfx * 0.9, t, 0.05);
  },
  toggleMute() { this.prefs.muted = !this.prefs.muted; this.savePrefs(); this.applyVolumes(); updateSoundBtn(); },

  // ---------- строительные блоки ----------
  // осциллятор с огибающей; возвращает узел частоты для глиссандо
  tone(type, freq, t, dur, vel, out, o = {}) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
    if (o.detune) osc.detune.value = o.detune;
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    let node = osc;
    if (o.filter) { const f = c.createBiquadFilter(); f.type = o.filter; f.frequency.value = o.freq || 1000; f.Q.value = o.q || 0.7; node.connect(f); node = f; if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur); }
    node.connect(g); g.connect(out || this.sfxBus);
    if (o.rev) { const s = c.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.revIn); }
    osc.start(t); osc.stop(t + a + dur + 0.05);
    return osc;
  },
  noise(t, dur, vel, out, o = {}) {
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = this.noiseBuf; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1000, t); f.Q.value = o.q ?? 1;
    if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    src.connect(f); f.connect(g); g.connect(out || this.sfxBus);
    if (o.rev) { const s = c.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.revIn); }
    src.start(t, Math.random() * 1.5); src.stop(t + a + dur + 0.05);
  },
  // колокол из негармонических обертонов
  bell(f, t, vel, decay = 2.5, out, rev = 0.5) {
    [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([r, v]) => this.tone('sine', f * r, t, decay / r ** 0.4, vel * v, out, { rev }));
  },

  // ---------- звуковые эффекты ----------
  sfx(name, o = {}) {
    if (!this.ready()) return;
    const t = this.now(), T = (...a) => this.tone(...a), N = (...a) => this.noise(...a);
    switch (name) {
      case 'type': T('square', rnd(520, 640), t, 0.018, 0.012, null, { filter: 'lowpass', freq: 1800 }); break;
      case 'mg_ok': [72, 76, 79, 84].forEach((m, i) => T('square', mtof(m), t + i * 0.07, 0.12, 0.035, null, { filter: 'lowpass', freq: 3000 })); break;
      case 'mg_bad': T('sawtooth', 160, t, 0.25, 0.06, null, { to: 90, filter: 'lowpass', freq: 900 }); break;
      case 'mg_perfect': T('square', mtof(84), t, 0.08, 0.04, null, { filter: 'lowpass', freq: 4000 }); T('square', mtof(91), t + 0.05, 0.12, 0.035, null, { filter: 'lowpass', freq: 4000 }); break;
      case 'mg_tick': T('square', 1200, t, 0.03, 0.03, null, { filter: 'lowpass', freq: 3000 }); break;
      case 'mg_ratchet': N(t, 0.03, 0.12, null, { freq: 2600, q: 6 }); T('square', 300, t, 0.02, 0.03); break;
      case 'mg_pump': N(t, 0.25, 0.08, null, { freq: 400, fTo: 1200, q: 1, attack: 0.05 }); break;
      case 'mg_scrub': N(t, 0.07, 0.05, null, { freq: 3000, q: 2 }); break;
      case 'mg_crash': N(t, 0.4, 0.3, null, { type: 'lowpass', freq: 1200, fTo: 200 }); T('square', 80, t, 0.2, 0.1, null, { to: 40 }); break;
      case 'flip': N(t, 0.35, 0.16, null, { type: 'highpass', freq: 3000 }); T('sine', 220, t, 0.06, 0.12, null, { to: 440 }); break;
      case 'click': T('square', 900, t, 0.025, 0.035, null, { filter: 'lowpass', freq: 2500 }); break;
      case 'open': N(t, 0.18, 0.06, null, { freq: 600, fTo: 2400, q: 1.5, attack: 0.05 }); break;
      case 'good': [72, 76, 79].forEach((m, i) => T('triangle', mtof(m + 12), t + i * 0.06, 0.18, 0.06)); break;
      case 'bad': T('square', 220, t, 0.2, 0.05, null, { to: 140, filter: 'lowpass', freq: 900 }); break;
      case 'toast': T('sine', 1180, t, 0.08, 0.04); T('sine', 1580, t + 0.05, 0.1, 0.03); break;
      case 'step': {
        const s = o.surface || 'tile';
        if (s === 'tile') N(t, 0.035, 0.11, null, { freq: 1900, q: 2.5 });
        if (s === 'wood') { N(t, 0.05, 0.1, null, { freq: 700, q: 1.5 }); T('sine', 130, t, 0.05, 0.05); }
        if (s === 'carpet') N(t, 0.07, 0.07, null, { type: 'lowpass', freq: 420 });
        if (s === 'wet') { N(t, 0.06, 0.08, null, { freq: 1400, q: 1 }); N(t + 0.02, 0.08, 0.05, null, { type: 'highpass', freq: 3000 }); }
        break;
      }
      case 'cook': N(t, 0.7, 0.14, null, { type: 'highpass', freq: 2800, attack: 0.02 }); T('sine', 90, t, 0.08, 0.1); break;
      case 'pickup': T('sine', 660, t, 0.06, 0.08, null, { to: 990 }); T('sine', 1320, t + 0.05, 0.06, 0.05); break;
      case 'pour': N(t, 0.65, 0.09, null, { freq: 700, fTo: 2200, q: 3, attack: 0.04 }); for (let i = 0; i < 4; i++) T('sine', 500 + i * 120, t + 0.1 + i * 0.12, 0.05, 0.03, null, { to: 900 }); break;
      case 'serve': T('sine', 2200, t, 0.18, 0.05); T('sine', 3300, t + 0.01, 0.12, 0.03); N(t, 0.03, 0.05, null, { freq: 3000 }); break;
      case 'cash':
        N(t, 0.04, 0.12, null, { freq: 2500, q: 3 }); N(t + 0.08, 0.05, 0.1, null, { freq: 1800, q: 3 });
        this.bell(1568, t + 0.12, 0.07, 0.9, null, 0.2); this.bell(2093, t + 0.2, 0.06, 1.1, null, 0.2); break;
      case 'doorbell': this.bell(1318.5, t, 0.06, 1.2, null, 0.3); this.bell(1046.5, t + 0.22, 0.06, 1.6, null, 0.3); break;
      case 'angry': T('sawtooth', 150, t, 0.35, 0.06, null, { to: 85, filter: 'lowpass', freq: 700 }); break;
      case 'sus': T('sine', mtof(70), t, 1.0, 0.05, null, { rev: 0.4 }); T('sine', mtof(71), t, 1.0, 0.05, null, { rev: 0.4 }); T('triangle', 110, t, 0.8, 0.07); break;
      case 'burnt': N(t, 0.7, 0.1, null, { type: 'highpass', freq: 4000 }); [0, 0.18].forEach(d => T('square', 1000, t + d, 0.1, 0.03)); break;
      case 'trash': N(t, 0.25, 0.12, null, { type: 'lowpass', freq: 700 }); T('sine', 80, t, 0.15, 0.15, null, { to: 50 }); break;
      case 'coin': T('square', 988, t, 0.06, 0.035, null, { filter: 'lowpass', freq: 3000 }); T('square', 1319, t + 0.06, 0.12, 0.035, null, { filter: 'lowpass', freq: 3000 }); break;
      case 'paper': for (let i = 0; i < 6; i++) N(t + i * 0.07 + Math.random() * 0.03, 0.05, 0.05, null, { freq: 2500 + Math.random() * 1500, q: 2 }); break;
      case 'dayStart': [65, 69, 72, 77, 81].forEach((m, i) => T('triangle', mtof(m), t + i * 0.07, 0.4, 0.06, null, { rev: 0.15 })); this.bell(mtof(89), t + 0.4, 0.04, 1.2); break;
      case 'close': N(t, 0.05, 0.12, null, { freq: 1200, q: 4 }); [77, 72, 69, 65].forEach((m, i) => T('triangle', mtof(m), t + 0.15 + i * 0.12, 0.5, 0.05, null, { rev: 0.3 })); break;
      case 'chime': [0, 1.8].forEach(d => this.bell(110, t + d, 0.22, 4.5, null, 0.8)); break;
      case 'creak': T('sawtooth', 170, t, 0.55, 0.07, null, { to: 250, glide: 0.25, filter: 'bandpass', freq: 650, q: 9 }); break;
      case 'hit': T('sine', 95, t, 0.22, 0.5, null, { to: 38 }); N(t, 0.09, 0.2, null, { type: 'lowpass', freq: 1200 }); break;
      case 'kill':
        [55, 58.27, 82.4].forEach(f => T('sawtooth', f, t, 2.6, 0.05, null, { attack: 0.3, filter: 'lowpass', freq: 200, fTo: 900, rev: 0.6 }));
        [81, 77, 76, 72, 69].forEach((m, i) => this.tone('sine', mtof(m), t + 0.6 + i * 0.35, 1.2, 0.04, null, { rev: 0.7 })); break;
      case 'caught': for (let i = 0; i < 6; i++) T('square', i % 2 ? 932 : 880, t + i * 0.11, 0.1, 0.035, null, { filter: 'lowpass', freq: 2500 }); T('sine', 60, t, 0.8, 0.4, null, { to: 30 }); break;
      case 'thunder': N(t, 3.2, 0.45, null, { type: 'lowpass', freq: 500, fTo: 80, attack: 0.04 }); N(t + 0.35, 2.4, 0.3, null, { type: 'lowpass', freq: 220, fTo: 60, attack: 0.2 }); break;
      case 'heart': T('sine', 58, t, 0.13, 0.55 * (o.k || 1), null, { to: 38 }); T('sine', 52, t + 0.19, 0.13, 0.4 * (o.k || 1), null, { to: 36 }); break;
      case 'whisper': N(t, 1.6, 0.05, null, { freq: 1300, q: 6, attack: 0.6, rev: 0.6 }); break;
      case 'pet': T('triangle', 900, t, 0.15, 0.05, null, { to: 600 }); break;
      case 'end_prison': [45, 48, 52].forEach(m => T('sawtooth', mtof(m), t, 2.5, 0.05, null, { filter: 'lowpass', freq: 600, attack: 0.05, rev: 0.4 })); T('sine', 70, t + 1.2, 0.3, 0.6, null, { to: 40 }); break;
      case 'end_death': T('sawtooth', 1800, t, 1.2, 0.06, null, { to: 220, filter: 'lowpass', freq: 3000, rev: 0.6 }); T('sine', 50, t + 0.3, 1.5, 0.6, null, { to: 25 }); break;
      case 'end_good': [65, 69, 72, 76, 81].forEach((m, i) => T('triangle', mtof(m), t + i * 0.15, 2.2, 0.05, null, { rev: 0.5 })); break;
      case 'end_soft': [60, 64, 67, 72].forEach((m, i) => T('sine', mtof(m), t + i * 0.3, 2.5, 0.05, null, { rev: 0.6 })); break;
    }
  },

  // каждый кадр: сердцебиение, треск гриля
  update(dt) {
    if (!this.ready()) return;
    if (this.danger > 0.05) {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.sfx('heart', { k: 0.4 + this.danger * 0.6 }); this.beatT = 1.0 - this.danger * 0.5; }
    }
    if (Amb.levels.sizzle > 0.01) {
      this.popT -= dt;
      if (this.popT <= 0) { this.popT = rnd(0.02, 0.12); this.noise(this.now(), 0.012, rnd(0.03, 0.09) * Amb.levels.sizzle * 4, this.ambBus, { type: 'highpass', freq: 3500 }); }
    }
    if (Amb.levels.fryer > 0.01 && Math.random() < dt * 9) this.tone('sine', rnd(250, 520), this.now(), 0.04, 0.03 * Amb.levels.fryer * 4, this.ambBus, { to: rnd(500, 800) });
  }
};

// фоновые петли: дождь, гул зала, шипение, ветер, неон
const Amb = {
  nodes: {}, levels: { rain: 0, murmur: 0, sizzle: 0, fryer: 0, hum: 0, wind: 0 },
  init() {
    const c = Sound.ctx;
    const loop = (filters, name) => {
      const src = c.createBufferSource(); src.buffer = Sound.noiseBuf; src.loop = true;
      let n = src; filters.forEach(([type, f, q]) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; n.connect(b); n = b; });
      const g = c.createGain(); g.gain.value = 0; n.connect(g); g.connect(Sound.ambBus); src.start();
      this.nodes[name] = { g, last: n };
    };
    loop([['lowpass', 1500], ['highpass', 280]], 'rain');
    loop([['bandpass', 380, 0.6], ['lowpass', 900]], 'murmur');
    loop([['highpass', 2600], ['bandpass', 6000, 0.5]], 'sizzle');
    loop([['lowpass', 380]], 'fryer');
    loop([['bandpass', 500, 2.5]], 'wind');
    // гул неона и холодильника
    const g = c.createGain(); g.gain.value = 0; g.connect(Sound.ambBus);
    [60, 120, 180].forEach((f, i) => { const o = c.createOscillator(); o.type = i ? 'sine' : 'sawtooth'; o.frequency.value = f; const og = c.createGain(); og.gain.value = [0.25, 0.5, 0.2][i]; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; o.connect(lp); lp.connect(og); og.connect(g); o.start(); });
    this.nodes.hum = { g };
    // ветер «гуляет»
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 260; lfo.connect(lg); lg.connect(this.nodes.wind.last.frequency); lfo.start();
  },
  set(levels) {
    if (!Sound.ready()) return;
    const t = Sound.now();
    for (const k in levels) {
      this.levels[k] = levels[k];
      const max = { rain: 0.32, murmur: 0.09, sizzle: 0.05, fryer: 0.08, hum: 0.02, wind: 0.12 }[k];
      if (this.nodes[k]) this.nodes[k].g.gain.setTargetAtTime(clamp(levels[k], 0, 1) * max, t, 0.4);
    }
  }
};

// кнопка звука в HUD
function updateSoundBtn() {
  const b = document.getElementById('sound-btn');
  if (b) b.textContent = Sound.prefs.muted ? '🔇' : '🔊';
}
