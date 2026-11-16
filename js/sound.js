// Sound, the effects: footsteps by what is under the foot, the body's landings and splashes, each place's ambience, fixtures humming
// where they hang, pools lapping at their edges, the sea, wind and grass, doors, the loose things' knocks; all positioned for the ear
// (HRTF) and heard through the room they are in. makeSound() builds it on any AudioContext, the live one or an OfflineAudioContext
// (dev.sound.render), and is driven by frame() once a game frame. Nothing here is loaded: voices.js writes every one-shot.
import { footstep, door, splash, drip, knock, cricket, impulse, rng } from './voices.js';

// What each library material sounds like underfoot (docs/building.md, "Sound"). A material outside the library can carry its own
// `userData.surface`; anything else falls back to the zone's `step`.
const surfaceOf = { loopCarpet: 'carpet', blackoutCarpet: 'carpet', hotelCarpet: 'carpet', velvet: 'carpet', damask: 'carpet', poolTile: 'tile', poolMosaic: 'tile', marble: 'tile', terrazzo: 'tile',
  gelcoat: 'tile', glass: 'tile', frostedGlass: 'tile', limestone: 'stone', travertine: 'stone', stoneWall: 'stone', concreteFloor: 'concrete', concreteWall: 'concrete', plaster: 'concrete', stucco: 'concrete',
  asphalt: 'concrete', roadPaint: 'concrete', wallpaper: 'concrete', ceilingTile: 'concrete', sand: 'gravel', mulch: 'gravel', rubberCrumb: 'rubber', vinylFoam: 'rubber', rubber: 'rubber', hardPlastic: 'rubber', pvc: 'rubber',
  grassGround: 'grass', hardwood: 'wood', benchWood: 'wood', weatheredWood: 'wood', palmTrunk: 'wood', galvanised: 'metal', paintedSteel: 'metal', castIron: 'metal', brushedSteel: 'metal', anodised: 'metal', chrome: 'metal', brass: 'metal' };
const CAP = { shots: 14, steps: 6 }; // live one-shot voices placed in space; live footstep voices
const WY = -.12; // the water level every pool shares (core.js)

// A zone's ambience: its own `amb` if it gives one, otherwise read from the old room-tone numbers (hum, water, air)
function ambOf(z) {
  if (z._amb) return z._amb;
  const a = { hum: z.hum || 0, vent: z.env ? .3 : 0, water: z.water || 0, wind: z.air || 0, grass: 0, drips: z.water ? .5 : 0, ...(z.amb || {}) };
  // the room's reverb: how wet (zone.wet, the music's own) and how big (its env box); carpet deadens it
  if (!a.verb) { const e = z.env, vol = e ? (e[1][0] - e[0][0]) * (e[1][1] - e[0][1]) * (e[1][2] - e[0][2]) : 0, wet = z.wet ?? .3, soft = z.step === 'carpet' ? .5 : 1;
    const big = e ? Math.min(1, Math.max(0, Math.log10(vol / 150) / 1.3)) : 0; // 150 m³ a small room, 3000 m³ a hall
    a.verb = e ? [wet * (1 - soft) * .8 + .05, wet * soft * (1 - big), wet * soft * big] : [.04 + .1 * wet, 0, 0]; } // outdoors: next to none
  return (z._amb = a);
}

function makeSound(ac, out, L) { // L: the level: { zones, zoneAt(x, z), emitters, ponds, floorAt(x, z, feet) }
  const sr = ac.sampleRate, now = () => ac.currentTime, R = rng(12345), rnd = () => R();
  const nodes = { live: 0, peak: 0 }, mk = n => { nodes.live++; nodes.peak = Math.max(nodes.peak, nodes.live); return n; }, done = k => { nodes.live -= k; };
  const gain = (v = 1, ...to) => { const g = ac.createGain(); g.gain.value = v; for (const n of to) g.connect(n); return g; };
  const filt = (type, f, q = .7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const bufOf = (...ch) => { const b = ac.createBuffer(ch.length, ch[0].length, sr); ch.forEach((d, i) => b.copyToChannel(d, i)); return b; };
  const fx = gain(.55, out); // every effect, under the music
  // noise: 11.3 s of white noise (no loop length lines up with another's, and none is short enough to hear come round)
  const nz = new Float32Array(Math.round(11.3 * sr)); for (let i = 0; i < nz.length; i++) nz[i] = rnd() * 2 - 1; const noise = bufOf(nz);
  const verbs = [[.45, .15, 3], [1.2, .45, 6], [3.2, .85, 10]].map(([s, b, e], i) => { const c = ac.createConvolver(); c.normalize = false; c.buffer = bufOf(...impulse(s, b, e, sr, 7 + i)); c.connect(fx); return c; }); // dead, room, hall
  const verbGain = [.5, .45, .4];
  const hiss = (f1, type = 'bandpass', q = .7, rate = 1) => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = rate; const b = filt(type, f1, q); s.connect(b); s.start(now(), rnd() * 11); return [s, b]; };
  const gust = ac.createConstantSource(), gust2 = ac.createConstantSource(); gust.offset.value = .5; gust2.offset.value = .5; gust.start(); gust2.start(); // the weather: one wind for every outdoor place

  // ---- one bus per zone: what is in it goes through its walls (muffled or not) into its own room's reverb ----
  const buses = new Map();
  function bus(z) {
    let b = buses.get(z); if (b) return b;
    const a = ambOf(z), lp = filt('lowpass', 18000, .5), dry = gain(1, fx), pt = gain(0, lp), bed = gain(0, lp);
    lp.connect(dry); a.verb.forEach((v, i) => v > 0 && (lp.connect(gain(v * verbGain[i], verbs[i])), nodes.live++)); nodes.live += 4;
    b = { z, a, lp, pt, bed, gp: 0, gb: 0, f: 18000, on: false, off: 0, beds: [] }; buses.set(z, b); return b;
  }
  const self = gain(1, fx), selfSend = verbs.map((v, i) => gain(0, v)); for (const s of selfSend) self.connect(s); // the body's own sounds: here, in whatever room you are in

  // ---- placed voices ----
  const panner = (x, y, z, ref = 1.5, roll = 1) => { const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 80;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; return p; };
  // behind the head is duller: a lowpass from 18 kHz in front down to 3 kHz straight behind (the HRTF alone barely tells front from back)
  const shade = (x, y, z) => { const dx = x - ear.x, dy = y - ear.y, dz = z - ear.z, l = Math.hypot(dx, dy, dz) || 1, c = (dx * ear.fx + dy * ear.fy + dz * ear.fz) / l; return 3000 * 6 ** ((1 + c) / 2); };
  const ear = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 };
  const banks = new Map(); // name -> takes; a take is made the first time it is wanted, up to `max`, then they are drawn at random (never the last two)
  function take(key, make, max = 8) { let b = banks.get(key); if (!b) banks.set(key, b = { list: [], last: [-1, -1] });
    if (b.list.length < max) { b.list.push(bufOf(make(b.list.length + 1))); b.last = [b.list.length - 1, b.last[0]]; return b.list.at(-1); }
    let i; do i = Math.floor(rnd() * b.list.length); while (b.list.length > 2 && b.last.includes(i)); b.last = [i, b.last[0]]; return b.list[i]; }
  const makers = {
    'door.wood.open': s => door('wood', true, s, sr), 'door.wood.close': s => door('wood', false, s, sr), 'door.metal.open': s => door('metal', true, s, sr), 'door.metal.close': s => door('metal', false, s, sr),
    splash: s => splash(.25, s, sr), 'splash.big': s => splash(1, s, sr), 'splash.small': s => splash(0, s, sr), drip: s => drip(s, sr), cricket: s => cricket(s, sr),
    'knock.ball': s => knock('ball', s, sr), 'knock.pit': s => knock('pit', s, sr), 'knock.ring': s => knock('ring', s, sr), 'knock.big': s => knock('big', s, sr),
  };
  let shots = 0, steps = 0, quiet = false; // quiet: no chance one-shots (drips, crickets, knocks), for measuring a bed's level (tools/sound.mjs)
  // play a named one-shot at a point (in the zone there; a point outside every zone is heard as if in yours). o: { gain, rate, ref }
  function play(name, x, y, z, o = {}) {
    const make = makers[name] || (name.startsWith('step.') && (s => footstep(name.slice(5), s, 0, 1, s & 1, sr))); if (!make || shots >= CAP.shots || quiet && !o.loud) return false;
    const zn = o.zone || L.zoneAt(x, z) || cur, b = bus(zn); b.on || wake(b);
    const s = ac.createBufferSource(), g = gain(o.gain ?? 1), p = panner(x, y, z, o.ref ?? 1.5), sh = filt('lowpass', shade(x, y, z), .5); s.buffer = take(name, make, o.takes || 6); s.playbackRate.value = (o.rate || 1) * (.97 + .06 * rnd());
    s.connect(g).connect(sh).connect(p).connect(b.pt); shots++; mk(s); mk(g); mk(p); mk(sh); s.onended = () => { shots--; done(4); s.disconnect(); p.disconnect(); };
    s.start(o.at ?? now()); return true;
  }
  // start a looping sound at a point; returns { move(x, y, z), stop() }. Names: hum, vent, lap, washer, dryer, surf, roll
  const loops = {
    hum: (dst, lv = 1) => { const o = ac.createOscillator(), w = ac.createPeriodicWave(new Float32Array(13), new Float32Array([0, 0, 1, 0, .45, 0, .2, 0, .08, 0, .04, 0, .02])); o.setPeriodicWave(w); o.frequency.value = 60; // 120 Hz and its evens, the tube's buzz
      const bz = hiss(240, 'bandpass', 8), g = gain(.012 * lv, dst), gb = gain(.0025 * lv, dst); o.connect(g); bz[1].connect(gb); o.start(); return [[o, bz[0]], 5]; },
    vent: (dst, lv = 1) => { const f = 300; const [s, b] = hiss(f, 'bandpass', .5, .9 + .2 * rnd()), l = filt('lowpass', f * 3), g = gain(.05 * lv, dst); b.connect(l).connect(g); return [[s], 4]; },
    lap: (dst, lv = 1, e) => { const [s, b] = hiss(420 + 100 * rnd(), 'bandpass', .8), h = hiss(1800, 'bandpass', .6, 1.1), env = gain(.2, dst), g2 = gain(.25, env); b.connect(env); h[1].connect(g2); if (e) e.env = env.gain; env.gain.value = .12 * lv; return [[s, h[0]], 6]; },
    washer: (dst, lv = 1) => { const [s, b] = hiss(260, 'lowpass', .8), g = gain(.02 * lv, dst), m = ac.createOscillator(), mg = gain(.016 * lv, g.gain); m.frequency.value = .83; m.connect(mg); b.connect(g); m.start();
      const o = ac.createOscillator(), og = gain(.002 * lv, dst); o.type = 'triangle'; o.frequency.value = 98; o.connect(og); o.start(); return [[s, m, o], 8]; },
    dryer: (dst, lv = 1) => { const [s, b] = hiss(170, 'lowpass', 1.2), g = gain(.024 * lv, dst), m = ac.createOscillator(), mg = gain(.02 * lv, g.gain); m.frequency.value = .71; m.type = 'triangle'; m.connect(mg); b.connect(g); m.start();
      const w = hiss(620, 'bandpass', 2), wg = gain(.003 * lv, dst); w[1].connect(wg); return [[s, m, w[0]], 8]; },
    surf: (dst, lv = 1, e) => { const [s, b] = hiss(500, 'lowpass', .5), h = hiss(2200, 'bandpass', .5), env = gain(0, dst), g2 = gain(.18, env), body = gain(.5, env); b.connect(body); h[1].connect(g2); if (e) { e.env = env.gain; e.f = b.frequency; } return [[s, h[0]], 7]; },
    roll: (dst, lv = 1, e) => { const [s, b] = hiss(220, 'lowpass', .9), env = gain(0, dst); b.connect(env); if (e) e.env = env.gain; return [[s], 3]; },
  };
  function loop(name, x, y, z, lv = 1, o = {}) {
    const zn = o.zone || L.zoneAt(x, z) || cur, b = bus(zn), p = panner(x, y, z, o.ref ?? 2, o.roll ?? 1), sh = filt('lowpass', shade(x, y, z), .5), e = {};
    const fade = gain(0, sh); fade.gain.setTargetAtTime(1, now(), .3); // every loop fades in and out, so a fixture changing hands never pops
    sh.connect(p).connect(b.pt); const [srcs, n0] = loops[name](fade, lv, e), n = n0 + 3; nodes.live += n; nodes.peak = Math.max(nodes.peak, nodes.live); live.add(e);
    return Object.assign(e, { p, b, x, y, z, sh, move(x, y, z) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; e.x = x; e.y = y; e.z = z; },
      stop(t = now()) { fade.gain.setTargetAtTime(0, t, .2); for (const s of srcs) s.stop(t + 1.2); setTimeoutish(() => { p.disconnect(); }, t + 1.2); nodes.live -= n; live.delete(e); } });
  }
  const live = new Set(); // every looping sound playing, for the head shadow
  const later = []; const setTimeoutish = (f, t) => later.push([t + .2, f]); // runs from frame(): the offline renderer has no timers

  // ---- the beds: each zone's own air, made while it can be heard ----
  function wake(b) {
    b.on = true; const a = b.a, d = b.bed, B = b.beds = [], n0 = nodes.live;
    const two = (f, type, q, lv, mod) => { for (const pan of [-.7, .7]) { const [s, f1] = hiss(f, type, q, .93 + .14 * rnd()), sp = ac.createStereoPanner(), g = gain(lv, sp); sp.pan.value = pan; sp.connect(d); f1.connect(g); if (mod) mod.connect(g.gain); B.push(s); nodes.live += 4; } };
    if (a.hum) { const o = ac.createOscillator(); o.frequency.value = 120; o.connect(gain(.006 * a.hum, d)); o.start(); B.push(o); nodes.live += 2; } // the room's hum, under the fixtures' own
    if (a.vent) two(a.ventF || 300, 'bandpass', .45, .05 * a.vent);
    if (a.water) two(380, 'bandpass', .6, .012 * a.water);
    if (a.wind) { const m = gain(.1 * a.wind); gust.connect(m); two(330, 'lowpass', .5, 0, m); const w = gain(0), wm = gain(.004 * a.wind), [s, f1] = hiss(900, 'bandpass', 5, .97); gust2.connect(wm).connect(w.gain); f1.connect(w).connect(d); B.push(s); nodes.live += 7; }
    if (a.grass) { const m = gain(.03 * a.grass); gust.connect(m); two(3200, 'bandpass', .5, 0, m); }
    if (a.traffic) { const m = gain(.04 * a.traffic); gust2.connect(m); two(220, 'lowpass', .7, .01 * a.traffic, m); }
    if (a.rumble) { const [s, f1] = hiss(70, 'lowpass', .7), g = gain(.06 * a.rumble, d); f1.connect(g); B.push(s); const t = hiss(90, 'lowpass', .8); b.train = { g: gain(0, d), f: t[1] }; t[1].connect(b.train.g); B.push(t[0]); b.trainAt = now() + 8 + 20 * rnd(); nodes.live += 7; }
    b.loops = [];
    if (a.machines) for (const [x, y, z, k] of a.machines) b.loops.push(loop(k, x, y, z, 1, { zone: b.z, ref: 1.2 }));
    b.n = nodes.live - n0;
    if (a.sea) { const s = loop('surf', 0, 0, 0, 1, { zone: b.z, ref: 6, roll: .6 }); s.line = a.sea; s.next = now() + 1; b.loops.push(s); b.sea = s; }
  }
  function sleep(b) { const t = now(); for (const s of b.beds) s.stop(t + .05); for (const l of b.loops) l.stop(t); nodes.live -= b.n; b.beds = []; b.loops = []; b.on = false; b.sea = b.train = null; b.crickets = null; }

  // ---- what you hear from where you stand ----
  let cur = L.zones[0], tick = 0, rung = 0, lastStep = 0, lastLand = -1, wadeL = null, rollL = null, cost = { ms: 0, n: 0 }, stirred = 0;
  const hums = [], laps = [], gx = { t: 0, t2: 0 }, sv = [0, 0, 0];
  const near2 = (e, x, z) => (e.p.x - x) ** 2 + (e.p.z - z) ** 2;
  const set = (param, v, tc = .06) => param.setTargetAtTime(v, now(), tc);
  function frame(st) { // st: { x, y, z, fx, fy, fz, ux, uy, uz (the ear and where it looks), wts (lights.js weights), zone, body: {...} }
    const t0 = performance.now(), t = now(), li = ac.listener;
    if (li.positionX) { li.positionX.value = st.x; li.positionY.value = st.y; li.positionZ.value = st.z; li.forwardX.value = st.fx; li.forwardY.value = st.fy; li.forwardZ.value = st.fz; li.upX.value = st.ux; li.upY.value = st.uy; li.upZ.value = st.uz; }
    else { li.setPosition(st.x, st.y, st.z); li.setOrientation(st.fx, st.fy, st.fz, st.ux, st.uy, st.uz); }
    cur = st.zone; ear.x = st.x; ear.y = st.y; ear.z = st.z; ear.fx = st.fx; ear.fy = st.fy; ear.fz = st.fz;
    // each zone's share: yours and those near a doorway (weights) and, faintly, the rooms your doorways open into
    for (const b of buses.values()) b.tp = b.tb = 0, b.tc = 0;
    for (const [z, s] of st.wts) { const b = bus(z); b.tb = Math.sqrt(s); b.tc = Math.min(1, 2 * s); b.tp = Math.min(1, 2 * s); }
    for (const o of cur.openings || []) { const n = o.p === cur ? o.q : o.p, sa = o.ax ? st.x : st.z, sb = o.ax ? st.z : st.x, d = Math.hypot(Math.max(o.lo - sa, sa - o.hi, 0), sb - o.at), k = Math.exp(-d / 5), b = bus(n);
      b.tb = Math.max(b.tb, .3 * k); b.tp = Math.max(b.tp, .5 * k); }
    const cb = bus(cur); cb.tp = 1; cb.tc = 1; cb.tb = Math.max(cb.tb, .5);
    for (const b of buses.values()) {
      const on = b.tp > .004 || b.tb > .004; if (on && !b.on) wake(b); if (!on && b.on && (b.off ||= t) < t - 3) sleep(b); if (on) b.off = 0;
      if (Math.abs(b.tp - b.gp) > .005) set(b.pt.gain, b.gp = b.tp); if (Math.abs(b.tb - b.gb) > .005) set(b.bed.gain, b.gb = b.tb, .25);
      const f = 500 * 36 ** b.tc; if (Math.abs(f - b.f) > b.f * .03) set(b.lp.frequency, b.f = f, .2); }
    // the body's own sounds take the reverb of where it stands, blended across a doorway
    sv[0] = sv[1] = sv[2] = 0; for (const [z, s] of st.wts) { const v = ambOf(z).verb; for (let i = 0; i < 3; i++) sv[i] += v[i] * s; }
    for (let i = 0; i < 3; i++) { const v = sv[i] * verbGain[i]; if (Math.abs(selfSend[i].gain.value - v) > .003) set(selfSend[i].gain, v, .15); }
    body(st.body, st); nodes.peak = Math.max(nodes.peak, nodes.live);
    if (t >= tick) { tick = t + .1; slow(st, t); }
    cost.ms += performance.now() - t0; cost.n++;
  }
  // ten times a second: which fixtures hum and which pools lap nearest you, the gusts, the drips, the trains, the sea
  function slow(st, t) {
    for (const l of live) { const f = shade(l.x, l.y, l.z); if (Math.abs(f - (l.f0 || 0)) > 300) set(l.sh.frequency, l.f0 = f, .1); }
    for (let i = later.length - 1; i >= 0; i--) if (later[i][0] < t) { later[i][1](); later.splice(i, 1); }
    // fixtures: the four nearest in rooms you can hear, each humming from where it hangs
    const want = []; for (const e of L.emitters) { const b = buses.get(e.zone); if (b?.on && b.a.hum > 0) { const d = near2(e, st.x, st.z); if (d < 400) want.push([d, e]); } }
    want.sort((a, b) => a[0] - b[0]); want.length = Math.min(4, want.length);
    for (let i = hums.length - 1; i >= 0; i--) if (!want.some(w => w[1] === hums[i].e)) { hums[i].stop(); hums.splice(i, 1); }
    for (const [, e] of want) if (!hums.some(h => h.e === e) && hums.length < 4) { const h = loop('hum', e.p.x, e.p.y, e.p.z, bus(e.zone).a.hum * Math.min(1.5, .6 + e.power / 8), { zone: e.zone, ref: 1, roll: 1.3 }); h.e = e; hums.push(h); }
    // pools: lapping at the nearest point of each nearby pool's edge, stirred up for a while by anything that moved the water
    stirred *= .93;
    const pw = []; for (const w of L.ponds) { const b = buses.get(w.zone); if (b?.on) { const R = w.rect, x = Math.min(R.z, Math.max(R.x, st.x)), z = Math.min(R.w, Math.max(R.y, st.z)), inside = x === st.x && z === st.z;
      const ex = inside ? (Math.min(st.x - R.x, R.z - st.x) < Math.min(st.z - R.y, R.w - st.z) ? (st.x - R.x < R.z - st.x ? R.x : R.z) : st.x) : x, ez = inside && ex === st.x ? (st.z - R.y < R.w - st.z ? R.y : R.w) : z;
      pw.push([(ex - st.x) ** 2 + (ez - st.z) ** 2, w, ex, ez]); } }
    pw.sort((a, b) => a[0] - b[0]); pw.length = Math.min(3, pw.length);
    for (let i = laps.length - 1; i >= 0; i--) if (!pw.some(q => q[1] === laps[i].w)) { laps[i].stop(); laps.splice(i, 1); }
    for (const [, w, x, z] of pw) { let l = laps.find(q => q.w === w); if (!l && laps.length < 3) { l = loop('lap', x, WY + .05, z, 1, { zone: w.zone, ref: 2.5 }); l.w = w; laps.push(l); } if (!l) continue; l.move(x, WY + .05, z);
      if (t > (l.next || 0)) { const pk = .14 + .14 * rnd() + stirred * .4; l.env.setTargetAtTime(pk, t, .12); l.env.setTargetAtTime(.08 + .04 * rnd() + stirred * .15, t + .2 + .15 * rnd(), .35); l.next = t + .35 + rnd() * (1.1 - Math.min(.7, stirred)); } }
    // drips: now and then, somewhere over a pool in a room you can hear
    for (const b of buses.values()) if (b.on && b.a.drips && t > (b.drip || 0)) { b.drip = t + (1.5 + 5 * rnd()) / b.a.drips; const ws = L.ponds.filter(w => w.zone === b.z); const w = ws[Math.floor(rnd() * ws.length)];
      if (w) { const R = w.rect; play('drip', R.x + (R.z - R.x) * rnd(), WY, R.y + (R.w - R.y) * rnd(), { gain: .5 + .5 * rnd(), ref: 1, takes: 10 }); } }
    // the weather: gusts wander, never in a pattern (a new aim every 1.5-5 s, eased over 1-3 s); the whistle's slower
    if (t > gx.t) { gx.t = t + 1.5 + 3.5 * rnd(); set(gust.offset, .25 + .75 * rnd() ** 1.5, 1 + 2 * rnd()); }
    if (t > gx.t2) { gx.t2 = t + 4 + 6 * rnd(); set(gust2.offset, .2 + .8 * rnd(), 3 + 3 * rnd()); }
    for (const b of buses.values()) if (b.on) {
      if (b.train && t > b.trainAt) { b.trainAt = t + 45 + 60 * rnd(); const g = b.train.g.gain, f = b.train.f.frequency, a = .08 * b.a.rumble; // a train somewhere far off in the tunnels: swells and fades over about 20 s
        g.setTargetAtTime(a, t, 3); g.setTargetAtTime(a * 1.3, t + 6, 2); g.setTargetAtTime(0, t + 10, 3.5); f.setTargetAtTime(240, t, 4); f.setTargetAtTime(90, t + 9, 4); }
      if (b.sea) { const s = b.sea, [x1, z1, x2, z2, y] = s.line, dx = x2 - x1, dz = z2 - z1, u = Math.max(0, Math.min(1, ((st.x - x1) * dx + (st.z - z1) * dz) / (dx * dx + dz * dz || 1))); s.move(x1 + dx * u, y, z1 + dz * u);
        if (t > s.next) { const p = (.25 + .25 * rnd()) * (b.a.seaLv || 1), up = 1.8 + rnd(); s.next = t + 6 + 6 * rnd(); s.env.setTargetAtTime(p * .5, t, up / 3); s.env.setTargetAtTime(p * .18, t + up, 1.4); s.env.setTargetAtTime(.1, t + up + 2.5, 1.5); s.f.setTargetAtTime(1300, t, up / 2); s.f.setTargetAtTime(380, t + up, 1.5); } }
      if (b.a.crickets) { b.crickets ||= [0, 1, 2].map(i => ({ a: rnd() * 6.28, d: 9 + 14 * rnd(), next: t + rnd() * 3, left: 0 }));
        for (const c of b.crickets) if (t > c.next) { if (c.left <= 0) { c.left = 5 + 15 * rnd() | 0; c.next = t + 3 + 8 * rnd(); continue; } c.left--; c.next = t + .55 + .3 * rnd();
          play('cricket', st.x + Math.cos(c.a) * c.d, .3, st.z + Math.sin(c.a) * c.d, { gain: .35 * b.a.crickets, ref: 3, takes: 4, at: t + rnd() * .08, zone: b.z }); } }
    }
  }
  // ---- the body ----
  const surfaceAt = (x, z, feet, zone) => {
    if (zone.tile && feet < WY - .02) return feet < WY - .38 ? 'wade' : 'shallow'; // in a pool: by how deep
    if (zone.wade && feet < -.4) return 'pit';
    const m = L.floorAt(x, z, feet), s = m && (surfaceOf[m] || m);
    const f = s && (s !== m || m in stepNames) ? s : zone.step || 'carpet';
    return f === 'tile' && (zone.tile || zone.water) ? 'wetTile' : f; };
  const stepNames = { carpet: 1, rubber: 1, tile: 1, wetTile: 1, concrete: 1, stone: 1, wood: 1, metal: 1, grass: 1, gravel: 1, pit: 1, shallow: 1, wade: 1 };
  function stepSound(surf, foot, run, force, at = now(), pan = foot ? .14 : -.14) {
    if (steps >= CAP.steps) return; const key = surf + (run ? '.run' : '.walk') + foot;
    const s = ac.createBufferSource(), lp = filt('lowpass', 3000 + 4500 * Math.min(1, force / 1.6)), g = gain(Math.min(1.3, .55 + .3 * force) * (.84 + .32 * rnd())), p = ac.createStereoPanner();
    s.buffer = take(key, n => footstep(surf, n * 2 + foot, run, 1, foot, sr), 8); s.playbackRate.value = (foot ? 1.025 : .99) * (.95 + .1 * rnd()); p.pan.value = pan;
    s.connect(lp).connect(g).connect(p).connect(self); steps++; nodes.live += 4; s.onended = () => { steps--; nodes.live -= 4; s.disconnect(); p.disconnect(); }; s.start(at);
  }
  function body(m, st) { // m: { feet, sp, step, foot, run, landed, hit, jumped, splash, fall, deep, grip, fly }
    if (!m || m.fly) return; const t = now(), surf = surfaceAt(st.x, st.z, m.feet, st.zone);
    if (m.splash) { const k = Math.min(1, Math.max(0, (-m.fall - 1) / 6)); playSelf(k > .6 ? 'splash.big' : k > .2 ? 'splash' : 'splash.small', .5 + .6 * k); stirred = Math.min(1.5, stirred + .5 + k); lastStep = t; }
    else if (m.landed && m.hit > 1) { // both feet, a hair apart, harder the faster the fall; on a hop (jumped again at once) lighter
      const f = Math.min(2.2, .5 + m.hit / 5) * (m.jumped ? .55 : 1); stepSound(surf, 0, 1, f, t); if (!m.jumped) stepSound(surf, 1, 1, f * .8, t + .012 + .015 * rnd()); lastStep = lastLand = t; }
    else if (m.step && t - lastStep > .12) { stepSound(surf, m.foot, m.run, m.run ? 1.25 : .7 + .3 * Math.min(1, m.sp / 2.85)); lastStep = t; if (surf === 'shallow' || surf === 'wade') stirred = Math.min(1.5, stirred + .15); }
    if (m.jumped && !m.landed && t - lastLand > .15 && !m.deep) { stepSound(surf, 1, 0, .45, t); lastStep = t; } // the push off: a toe, quietly
    if (m.grip) { if (Math.abs(m.feet - rung) > .28) { rung = m.feet; stepSound('metal', rung * 10 & 1, 0, .4); } } else rung = m.feet;
    // wading: the water swirling round the legs, by how fast they move through it
    const wv = m.deep && !m.air ? Math.min(1, m.sp / 3) : 0;
    if (wv > 0 && !wadeL) { wadeL = loop('roll', st.x, m.feet + .3, st.z, 1, { zone: st.zone, ref: 1 }); wadeL.env.value = 0; }
    if (wadeL) { wadeL.move(st.x, m.feet + .3, st.z); set(wadeL.env, wv * .5, .15); if (!wv && t - (wadeL.idle ||= t) > 1) { wadeL.stop(); wadeL = null; } else if (wv) wadeL.idle = 0; }
  }
  function playSelf(name, g = 1) { const s = ac.createBufferSource(), v = gain(g, self); s.buffer = take(name, makers[name], 3); s.playbackRate.value = .95 + .1 * rnd(); s.connect(v); nodes.live += 2; s.onended = () => { nodes.live -= 2; v.disconnect(); }; s.start(); }
  // ---- the loose things: physics.js leaves its knocks in `ev` (x, y, z, speed, kind: 0 ball, 1 pit ball, 2 ring, 3 big ball, 4 a ball meeting the water); the strongest few play
  const kinds = ['knock.ball', 'knock.pit', 'knock.ring', 'knock.big', 'splash.small'], lastKnock = new Float64Array(5);
  function knocks(ev, roll) {
    const t = now(); let played = 0;
    for (let i = 0; i < ev.n && played < 3; i++) { const o = i * 5, sp = ev.d[o + 3], k = ev.d[o + 4]; if (t - lastKnock[k] < (k === 1 ? .03 : .07)) continue;
      const g = Math.min(1, sp / (k === 4 ? 3 : 5)) ** 1.3; if (g < .03) continue; if (play(kinds[k], ev.d[o], ev.d[o + 1], ev.d[o + 2], { gain: g, ref: k === 1 ? .8 : 1.5, rate: 1.05 - .1 * g })) { lastKnock[k] = t; played++; } }
    ev.n = 0;
    if (roll) { const v = Math.min(1, roll.s / 4); if (v > .05 && !rollL) { rollL = loop('roll', roll.x, roll.y, roll.z, 1, { ref: 1.5 }); } if (rollL) { rollL.move(roll.x, roll.y, roll.z); set(rollL.env, v * .35, .08); if (v <= .05 && t - (rollL.idle ||= t) > 1) { rollL.stop(); rollL = null; } else if (v > .05) rollL.idle = 0; } roll.s = 0; }
  }
  return { frame, play, loop, knocks, nodes, cost, buses, surfaceAt, fx, foot: stepSound, quiet: on => { quiet = on; }, voices: () => ({ shots, steps, hums: hums.length, laps: laps.length, live: shots + steps + hums.length + laps.length }) };
}

export { makeSound, surfaceOf, ambOf, CAP };
