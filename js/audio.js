// Sound.
import { makeMusic, TAU } from './music.js';

// ---------- audio: each place's generative music (music.js), room tone and footsteps, all synthesised ----------
let sfx;
const sound = { level: 1, muted: false, music: 1, gain: null, onchange: null, mus: null, // the master volume (0-1), mute and music level, kept before the sound starts (settings.js)
  set(level, muted, music = this.music) { Object.assign(this, { level, muted, music }); if (this.gain) this.gain.value = muted ? 0 : level; this.mus?.(music); this.onchange?.(); } };
function graph(ac, { room = true, tap = false } = {}) { // everything but footsteps, the same in an OfflineAudioContext (dev.music)
  const master = ac.createGain(), verb = ac.createConvolver();
  const bus = (vol, ...to) => { const g = ac.createGain(); g.gain.value = vol; for (const n of to) g.connect(n); return g; };
  const ir = ac.createBuffer(2, ac.sampleRate * 5, ac.sampleRate), noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); // hall reverb impulse, white noise
  for (let c = 0; c < 2; c++) for (let d = ir.getChannelData(c), i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 4;
  for (let d = noise.getChannelData(0), i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const wet = bus(.3, master); verb.buffer = ir; verb.connect(wet);
  const music = makeMusic(ac, master, verb, noise, { tap });
  const lfo = (f, depth, param) => { const o = ac.createOscillator(); o.frequency.value = f; o.connect(bus(depth, param)); o.start(); };
  // room tone: fluorescent hum (120 Hz: the music is tuned to it), lapping water by the pools, wind in the open
  const hum = bus(0, master), water = bus(0, master, verb), lap = bus(.5, water), wind = bus(0, master), sway = bus(.7, wind);
  if (room) {
    for (const [f, v] of [[120, .5], [240, .2], [360, .08], [1080, .012]]) { const o = ac.createOscillator(); o.frequency.value = f; o.connect(bus(v, hum)); o.start(); }
    const hiss = (type, f, q, dest) => { const s = ac.createBufferSource(), b = ac.createBiquadFilter(); s.buffer = noise; s.loop = true; b.type = type; b.frequency.value = f; b.Q.value = q; s.connect(b).connect(dest); s.start(); };
    hiss('bandpass', 420, .7, lap); hiss('highpass', 5000, .5, bus(.04, water)); lfo(.17, .3, lap.gain);
    hiss('lowpass', 380, .3, sway); lfo(.07, .3, sway.gain);
  }
  const zone = (z, t = ac.currentTime) => { // room tone, reverb and music all ramp together
    hum.gain.setTargetAtTime((z.hum || 0) * .07, t, TAU); water.gain.setTargetAtTime((z.water || 0) * .4, t, TAU); wet.gain.setTargetAtTime(z.wet ?? .3, t, TAU); wind.gain.setTargetAtTime((z.air || 0) * .25, t, TAU);
    music.to(z.music, t); };
  return { master, verb, bus, noise, music, zone };
}
function startAudio(zone) { // zone: where you are when it starts
  const ac = new AudioContext(), comp = ac.createDynamicsCompressor(), g = graph(ac), { master, verb, bus, noise } = g;
  master.connect(comp).connect(ac.destination); sound.gain = master.gain; sound.mus = v => g.music.level(v); sound.set(sound.level, sound.muted);
  setInterval(() => g.music.until(ac.currentTime + 2), 500); // look-ahead scheduler
  const kinds = { carpet: ['lowpass', 260, .7, .5, .11], tile: ['bandpass', 1300, 1.1, .3, .06], water: ['bandpass', 650, .5, .45, .32] };
  sfx = {
    step(kind) { // a short filtered noise burst per footfall
      const t = ac.currentTime, s = ac.createBufferSource(), b = ac.createBiquadFilter(), g = bus(0, master, verb), [type, f, q, vol, dur] = kinds[kind] || kinds.carpet; // a place's step sound with no entry here sounds like carpet rather than throwing
      s.buffer = noise; s.playbackRate.value = .7 + Math.random() * .6; b.type = type; b.frequency.value = f * (.85 + Math.random() * .3); b.Q.value = q;
      g.gain.setValueAtTime(kind === 'water' ? .001 : vol, t); g.gain.exponentialRampToValueAtTime(vol, t + .04); g.gain.exponentialRampToValueAtTime(.001, t + .04 + dur);
      s.connect(b).connect(g); s.start(t, Math.random()); s.stop(t + dur + .1);
    },
    zone: z => g.zone(z),
    mute() { sound.set(sound.level, !sound.muted); },
    music: g.music,
  };
  g.zone(zone); g.music.until(ac.currentTime + 2);
}
// dev: render the sound offline. steps: [[seconds, zone], ...] (the first at 0); room: with room tone; tap: the music's fade law instead of the music
async function renderMusic(steps, secs, { room = false, tap = false, sr = 44100, log = false } = {}) {
  const ac = new OfflineAudioContext(2, Math.round(secs * sr), sr), g = graph(ac, { room, tap }); g.master.connect(ac.destination);
  if (log) g.music.k.log = [];
  const at = new Map(steps.map(([t, z]) => [Math.round(t * 2) / 2, z]));
  g.zone(at.get(0)); g.music.until(2);
  for (let t = .5; t < secs; t += .5) ac.suspend(t).then(() => { if (at.has(t)) g.zone(at.get(t), t); g.music.until(t + 2); ac.resume(); });
  const t0 = performance.now(), buf = await ac.startRendering();
  return { buf, ms: performance.now() - t0, peakNodes: g.music.stat.peak, log: g.music.k.log };
}

export { sfx, startAudio, sound, renderMusic };
