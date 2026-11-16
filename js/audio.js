// Sound.
import { makeMusic, TAU } from './music.js';
import { makeSound } from './sound.js';
import { zones, inR } from './core.js';
import { emitters, floorAt, floorH as floorAt0 } from './build.js';
import { ponds } from './water.js';
import { weights } from './lights.js';
import { knocks, rolling } from './physics.js';

// ---------- audio: each place's generative music (music.js) and the effects (sound.js), all synthesised ----------
let sfx;
const sound = { level: 1, muted: false, music: 1, gain: null, onchange: null, mus: null, // the master volume (0-1), mute and music level, kept before the sound starts (settings.js)
  set(level, muted, music = this.music) { Object.assign(this, { level, muted, music }); if (this.gain) this.gain.value = muted ? 0 : level; this.mus?.(music); this.onchange?.(); } };
function graph(ac, { tap = false } = {}) { // the music and its hall, the same in an OfflineAudioContext (dev.music); the effects are sound.js
  const master = ac.createGain(), verb = ac.createConvolver();
  const bus = (vol, ...to) => { const g = ac.createGain(); g.gain.value = vol; for (const n of to) g.connect(n); return g; };
  const ir = ac.createBuffer(2, ac.sampleRate * 5, ac.sampleRate), noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); // hall reverb impulse, white noise
  for (let c = 0; c < 2; c++) for (let d = ir.getChannelData(c), i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 4;
  for (let d = noise.getChannelData(0), i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const wet = bus(.3, master); verb.buffer = ir; verb.connect(wet);
  const music = makeMusic(ac, master, verb, noise, { tap });
  const zone = (z, t = ac.currentTime) => { // room tone, reverb and music all ramp together
    wet.gain.setTargetAtTime(z.wet ?? .3, t, TAU);
    music.to(z.music, t); };
  return { master, verb, bus, noise, music, zone };
}
// the level as sound.js needs it, gathered once
let lv;
const level = () => lv ||= { zones: Object.values(zones), zoneAt: (x, z) => { for (const q of lv.zones) if (inR(x, z, ...q.box)) return q; return null; }, emitters, ponds, floorAt };
const ear = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, wts: null, zone: null, body: null }; // one object, filled each frame
function hear(cam, wts, zone, body) { const e = cam.matrixWorld.elements, p = cam.position;
  ear.x = p.x; ear.y = p.y; ear.z = p.z; ear.fx = -e[8]; ear.fy = -e[9]; ear.fz = -e[10]; ear.ux = e[4]; ear.uy = e[5]; ear.uz = e[6]; ear.wts = wts; ear.zone = zone; ear.body = body; return ear; } // no new object a frame
function startAudio(zone) { // zone: where you are when it starts
  const ac = new AudioContext(), comp = ac.createDynamicsCompressor(), g = graph(ac), { master } = g;
  master.connect(comp).connect(ac.destination); sound.gain = master.gain; sound.mus = v => g.music.level(v); sound.set(sound.level, sound.muted);
  setInterval(() => g.music.until(ac.currentTime + 2), 500); // look-ahead scheduler
  const eng = makeSound(ac, master, level());
  sfx = {
    frame(cam, wts, zone, body) { eng.knocks(knocks, rolling); eng.frame(hear(cam, wts, zone, body)); }, // once a game frame (player.js)
    play: eng.play, loop: eng.loop, // the interface: docs/building.md, "Sound"
    zone: z => g.zone(z),
    mute() { sound.set(sound.level, !sound.muted); },
    music: g.music, eng, ac,
  };
  g.zone(zone); g.music.until(ac.currentTime + 2);
}
// dev: render the music offline. steps: [[seconds, zone], ...] (the first at 0); room: with the place's ambience (sound.js) heard from its probe; tap: the music's fade law instead of the music
async function renderMusic(steps, secs, { room = false, tap = false, sr = 44100, log = false } = {}) {
  const ac = new OfflineAudioContext(2, Math.round(secs * sr), sr), g = graph(ac, { tap }); g.master.connect(ac.destination);
  const eng = room ? makeSound(ac, g.master, level()) : null, stand = z => eng?.frame(Object.assign(ear, { x: z.probe.x, y: z.probe.y, z: z.probe.z, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, wts: [[z, 1]], zone: z, body: null }));
  let here = steps[0][1]; stand(here);
  if (log) g.music.k.log = [];
  const at = new Map(steps.map(([t, z]) => [Math.round(t * 2) / 2, z]));
  g.zone(at.get(0)); g.music.until(2);
  for (let t = .5; t < secs; t += .5) ac.suspend(t).then(() => { if (at.has(t)) g.zone(here = at.get(t), t); stand(here); g.music.until(t + 2); ac.resume(); });
  const t0 = performance.now(), buf = await ac.startRendering();
  return { buf, ms: performance.now() - t0, peakNodes: g.music.stat.peak, log: g.music.k.log };
}

// dev: render the effects offline (tools/sound.mjs). path: [[t, x, z, yaw], ...] walked in straight lines at the eye's height above the floor;
// at: [[t, eng => ...]] things to do then (eng: sound.js's engine: play, loop, foot); music: the place's music too. Ticks every 50 ms.
async function renderSound({ secs, path, at = [], music = false, sr = 44100, y = 1.62 }) {
  const ac = new OfflineAudioContext(2, Math.round(secs * sr), sr), g = graph(ac); g.master.connect(ac.destination); if (!music) g.music.level(0);
  const L = level(), eng = makeSound(ac, g.master, L), todo = [...at].sort((a, b) => a[0] - b[0]);
  let zone = null, lv = 0, steps = 0;
  const go = t => { let i = 0; while (i < path.length - 2 && path[i + 1][0] <= t) i++; const [t0, x0, z0, a0] = path[i], [t1, x1, z1, a1] = path[Math.min(i + 1, path.length - 1)], k = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
    const x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k, yaw = a0 + (a1 - a0) * k, here = L.zoneAt(x, z) || zone || L.zones[0];
    if (here !== zone) { zone = here; g.zone(zone, t); } g.music.until(t + 2);
    eng.frame(Object.assign(ear, { x, y: floorAt0(x, z) + y, z, fx: -Math.sin(yaw), fy: 0, fz: -Math.cos(yaw), ux: 0, uy: 1, uz: 0, wts: weights(x, z, zone), zone, body: null }));
    while (todo.length && todo[0][0] <= t + 1e-6) todo.shift()[1](eng, t); };
  go(0); for (let t = .05; t < secs - .01; t = Math.round((t + .05) * 100) / 100) { const tt = t; ac.suspend(tt).then(() => { go(tt); ac.resume(); }); steps++; }
  const t0 = performance.now(), buf = await ac.startRendering();
  return { buf, ms: performance.now() - t0, nodes: eng.nodes.peak, live: eng.nodes.live, frameMs: eng.cost.ms / eng.cost.n };
}

export { sfx, startAudio, sound, renderMusic, renderSound };
