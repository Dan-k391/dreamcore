// Sound.

// ---------- audio: generative ambient music, room tone and footsteps, all synthesised ----------
let sfx;
function startAudio(zone) { // zone: where you are when it starts
  const ac = new AudioContext(), master = ac.createGain(), verb = ac.createConvolver(), comp = ac.createDynamicsCompressor();
  master.connect(comp).connect(ac.destination);
  const bus = (vol, ...to) => { const g = ac.createGain(); g.gain.value = vol; for (const n of to) g.connect(n); return g; };
  const ir = ac.createBuffer(2, ac.sampleRate * 5, ac.sampleRate), noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); // hall reverb impulse, white noise
  for (let c = 0; c < 2; c++) for (let d = ir.getChannelData(c), i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 4;
  for (let d = noise.getChannelData(0), i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const wet = bus(.3, master); verb.buffer = ir; verb.connect(wet);
  const lfo = (f, depth, param) => { const o = ac.createOscillator(); o.frequency.value = f; o.connect(bus(depth, param)); o.start(); };
  const wow = bus(7); { const o = ac.createOscillator(); o.frequency.value = .11; o.connect(wow); o.start(); } // tape wobble, in cents
  const voice = (dest, type, f, t, vol, att, hold, rel) => { // one enveloped oscillator
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; wow.connect(o.detune);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.setTargetAtTime(0, t + att + hold, rel);
    o.connect(g).connect(dest); o.start(t); o.stop(t + att + hold + rel * 6);
  };
  // music: a slow major-ninth pad progression in D, with sparse bell notes through a tape echo
  const music = bus(1.2, master, verb), pad = ac.createBiquadFilter(), echo = ac.createDelay(2);
  pad.frequency.value = 850; pad.Q.value = .4; pad.connect(music); lfo(.04, 300, pad.frequency);
  echo.delayTime.value = .52; echo.connect(bus(.45, echo)); echo.connect(music);
  const hz = m => 440 * 2 ** ((m - 69) / 12), scale = [74, 76, 78, 81, 83, 86, 88, 90];
  const chords = [[38, 50, 57, 61, 64, 66], [35, 47, 54, 57, 61, 62], [31, 43, 50, 54, 57, 59], [33, 45, 52, 57, 59, 64]]; // Dmaj9, Bm9, Gmaj7, A6sus
  let bar = 0, next = ac.currentTime + .3;
  setInterval(() => { while (next < ac.currentTime + 2) { // look-ahead scheduler, one 10s bar at a time
    for (const m of chords[bar++ % 4]) for (const d of [-.07, .07]) voice(pad, 'sawtooth', hz(m + d), next, .035, 4, 5, 2.2);
    for (let t = next + Math.random() * 2; t < next + 10; t += 1.3 + Math.random() * 3.5) {
      const f = hz(scale[Math.random() * scale.length | 0]);
      voice(echo, 'sine', f, t, .06, .01, .05, .9); voice(echo, 'sine', f * 2.01, t, .015, .01, .02, .4); voice(music, 'sine', f, t, .05, .01, .05, .9);
    }
    next += 10;
  } }, 500);
  // room tone: fluorescent hum in the backrooms, lapping water by the pools
  const hum = bus(0, master), water = bus(0, master, verb), lap = bus(.5, water);
  for (const [f, v] of [[120, .5], [240, .2], [360, .08], [1080, .012]]) { const o = ac.createOscillator(); o.frequency.value = f; o.connect(bus(v, hum)); o.start(); }
  const hiss = (type, f, q, dest) => { const s = ac.createBufferSource(), b = ac.createBiquadFilter(); s.buffer = noise; s.loop = true; b.type = type; b.frequency.value = f; b.Q.value = q; s.connect(b).connect(dest); s.start(); };
  hiss('bandpass', 420, .7, lap); hiss('highpass', 5000, .5, bus(.04, water)); lfo(.17, .3, lap.gain);
  const wind = bus(0, master), sway = bus(.7, wind); hiss('lowpass', 380, .3, sway); lfo(.07, .3, sway.gain); // open air
  const kinds = { carpet: ['lowpass', 260, .7, .5, .11], tile: ['bandpass', 1300, 1.1, .3, .06], water: ['bandpass', 650, .5, .45, .32] };
  sfx = {
    step(kind) { // a short filtered noise burst per footfall
      const t = ac.currentTime, s = ac.createBufferSource(), b = ac.createBiquadFilter(), g = bus(0, master, verb), [type, f, q, vol, dur] = kinds[kind] || kinds.carpet; // a place's step sound with no entry here sounds like carpet rather than throwing
      s.buffer = noise; s.playbackRate.value = .7 + Math.random() * .6; b.type = type; b.frequency.value = f * (.85 + Math.random() * .3); b.Q.value = q;
      g.gain.setValueAtTime(kind === 'water' ? .001 : vol, t); g.gain.exponentialRampToValueAtTime(vol, t + .04); g.gain.exponentialRampToValueAtTime(.001, t + .04 + dur);
      s.connect(b).connect(g); s.start(t, Math.random()); s.stop(t + dur + .1);
    },
    zone(z) { const t = ac.currentTime; hum.gain.setTargetAtTime(z.hum * .07, t, .8); water.gain.setTargetAtTime(z.water * .4, t, .8); wet.gain.setTargetAtTime(z.wet, t, .8); wind.gain.setTargetAtTime((z.air || 0) * .25, t, 1.5); },
    mute() { master.gain.value = master.gain.value ? 0 : 1; },
  };
  sfx.zone(zone);
}

export { sfx, startAudio };
