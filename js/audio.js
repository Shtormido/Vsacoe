'use strict';
(function (G) {
  // Синтезированные звуки — без внешних файлов
  let ac = null;
  const A = G.Audio = { on: true };
  function ctx() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(f, t0, dur, type, vol, f2) {
    const c = ctx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, c.currentTime + t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, c.currentTime + t0 + dur);
    g.gain.setValueAtTime(0, c.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol || 0.12, c.currentTime + t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
  }
  function noise(dur, vol, lp) {
    const c = ctx(); if (!c) return;
    const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = lp || 1200; g.gain.value = vol || 0.2;
    s.buffer = b; s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  }
  A.play = function (n) {
    if (!A.on) return;
    switch (n) {
      case 'click': tone(660, 0, 0.06, 'triangle', 0.06); break;
      case 'place': tone(392, 0, 0.09, 'triangle', 0.1); tone(587, 0.06, 0.12, 'triangle', 0.08); break;
      case 'road': tone(220, 0, 0.08, 'square', 0.03, 180); break;
      case 'zone': tone(523, 0, 0.07, 'sine', 0.07); tone(659, 0.05, 0.08, 'sine', 0.06); break;
      case 'bulldoze': noise(0.35, 0.25, 700); break;
      case 'coin': tone(988, 0, 0.08, 'square', 0.05); tone(1319, 0.07, 0.2, 'square', 0.05); break;
      case 'error': tone(180, 0, 0.18, 'sawtooth', 0.05, 120); break;
      case 'quest': [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.08)); break;
      case 'level': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.35, 'triangle', 0.09)); break;
      case 'fire': noise(0.5, 0.12, 2000); tone(880, 0, 0.15, 'square', 0.03); tone(660, 0.18, 0.15, 'square', 0.03); break;
      case 'boom': noise(1.2, 0.5, 400); tone(80, 0, 0.8, 'sine', 0.3, 30); break;
      case 'chat': tone(740, 0, 0.06, 'sine', 0.07); tone(880, 0.07, 0.08, 'sine', 0.07); break;
    }
  };
})(window.G);
