// Sound, the one-shots: footsteps on every surface, doors, splashes, drips, knocks, crickets and the reverbs' impulses, written sample by
// sample into plain arrays (nothing is recorded or loaded). Each call with a new seed gives a new take: the noise, the timing, the filters
// and the resonances all move a little. sound.js turns the arrays into AudioBuffers and plays them.

const rng = seed => () => { seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function biquad(x, type, f, q, sr, from = 0, to = x.length) { // RBJ cookbook, in place over [from, to)
  const w = 2 * Math.PI * Math.min(f, sr * .45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2; const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  if (type === 'lp') { b1 = 1 - cs; b0 = b2 = b1 / 2; } else if (type === 'hp') { b1 = -(1 + cs); b0 = b2 = (1 + cs) / 2; } else { b0 = al; b1 = 0; b2 = -al; }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = from; i < to; i++) { const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
// A burst of filtered noise added into out at time t (s): attack a, decay d (exponential time constants), band [type, f, q], level g
function burst(out, sr, r, t, a, d, band, g, len = d * 7) {
  const n = Math.min(out.length - Math.floor(t * sr), Math.ceil((a * 3 + len) * sr)); if (n <= 0) return;
  const b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = r() * 2 - 1;
  biquad(b, band[0], band[1], band[2], sr); if (band[3]) biquad(b, band[3], band[4], band[5], sr);
  const i0 = Math.floor(t * sr); for (let i = 0; i < n; i++) { const s = i / sr; out[i0 + i] += b[i] * g * (1 - Math.exp(-s / a)) * Math.exp(-s / d); }
}
// Damped resonances (modes): [frequency Hz, decay s, level]; the whole set shifted by `shift` (a size change); struck at t
function modes(out, sr, r, t, list, g, shift = 1) {
  const i0 = Math.floor(t * sr);
  for (const [f0, d, a] of list) { const f = f0 * shift * (.97 + .06 * r()), ph = r() * 6.283, n = Math.min(out.length - i0, Math.ceil(d * 6 * sr)), w = 2 * Math.PI * f / sr;
    for (let i = 0; i < n; i++) out[i0 + i] += Math.sin(w * i + ph) * a * g * Math.exp(-i / sr / d) * Math.min(1, i / (sr * .0008)); }
}
// Grains: n tiny clicks scattered over [t, t + span] with density thinning out, through a band (gravel, rattles, crackling grass)
function grains(out, sr, r, t, span, n, band, g, sharp = .0012) {
  const tmp = new Float32Array(Math.ceil((span + .03) * sr));
  for (let k = 0; k < n; k++) { const u = r() ** 1.6, at = Math.floor(u * span * sr), a = g * (.3 + .7 * r()) * (1 - u * .7), m = Math.ceil(sharp * sr * (.5 + r()));
    for (let i = 0; i < m && at + i < tmp.length; i++) tmp[at + i] += (r() * 2 - 1) * a * Math.exp(-i / (m * .3)); }
  biquad(tmp, band[0], band[1], band[2], sr); if (band[3]) biquad(tmp, band[3], band[4], band[5], sr);
  const i0 = Math.floor(t * sr); for (let i = 0; i < tmp.length && i0 + i < out.length; i++) out[i0 + i] += tmp[i];
}
// A thump: a low sine falling slightly in pitch, the body's weight arriving
function thump(out, sr, r, t, f, d, g) {
  const i0 = Math.floor(t * sr), n = Math.min(out.length - i0, Math.ceil(d * 6 * sr)); let ph = 0;
  for (let i = 0; i < n; i++) { const s = i / sr; ph += 2 * Math.PI * f * (1 + .35 * Math.exp(-s / .012)) / sr; out[i0 + i] += Math.sin(ph) * g * Math.exp(-s / d) * Math.min(1, s / .002); }
}
// Bubbles and droplets: a short sine whose pitch rises as it rings (how a small bubble at the surface sounds)
function bubbles(out, sr, r, t, span, n, f1, f2, g) {
  for (let k = 0; k < n; k++) { const at = t + r() ** 1.3 * span, f = f1 + (f2 - f1) * r(), d = .006 + .012 * r(), i0 = Math.floor(at * sr), m = Math.min(out.length - i0, Math.ceil(d * 6 * sr)), a = g * (.25 + .75 * r()) * (1 - (at - t) / span * .6); let ph = 0;
    for (let i = 0; i < m; i++) { const s = i / sr; ph += 2 * Math.PI * f * (1 + s * 40) / sr; out[i0 + i] += Math.sin(ph) * a * Math.exp(-s / d) * Math.min(1, s / .001); } }
}
// The end of every take fades to zero and its start is silent, so nothing clicks; and nothing above about 7.5 kHz is left harsh
function finish(x, sr, gain = 1) {
  biquad(x, 'lp', 7500, .6, sr); biquad(x, 'hp', 35, .7, sr);
  const f = Math.min(x.length, Math.round(.03 * sr)); for (let i = 0; i < f; i++) x[x.length - 1 - i] *= (i / f) ** 2;
  for (let i = 0; i < Math.min(16, x.length); i++) x[i] *= i / 16;
  for (let i = 0; i < x.length; i++) x[i] *= gain;
  return x;
}

// ---------- footsteps ----------
// Each surface: how the heel and the ball of the foot sound on it. click: the contact's first few ms [band, level]; body: the floor's own
// note [band, decay, level]; thump [Hz, decay, level]; and extras (modes of a hollow floor or a grating, grit dragged, grass, water).
const surfaces = {
  carpet: { click: [['lp', 1100, .7], .05], body: [['lp', 420, .8], .022, .9], thump: [72, .035, .5], brush: .5, loud: .6 },
  rubber: { click: [['lp', 900, .7], .04], body: [['lp', 360, .9], .03, .9], thump: [80, .04, .6], loud: .6 },
  tile: { click: [['bp', 2900, 1.3], .9], body: [['bp', 1350, .9], .016, .6], thump: [85, .025, .3], ring: [[2150, .018, .12], [3350, .012, .08]], loud: .8 },
  wetTile: { click: [['bp', 2600, 1.2], .6], body: [['bp', 1200, .9], .016, .55], thump: [85, .025, .3], ring: [[2150, .016, .08]], slap: .55, peel: .35, loud: .8 },
  concrete: { click: [['bp', 2100, 1], .7], body: [['bp', 850, .9], .028, .75], thump: [70, .03, .38], grit: .35, loud: .85 },
  stone: { click: [['bp', 1700, 1.1], .65], body: [['bp', 650, 1], .034, .8], thump: [60, .036, .5], grit: .15, loud: .9 },
  wood: { click: [['bp', 1500, 1], .5], body: [['lp', 1100, .8], .02, .55], thump: [95, .045, .55], ring: [[175, .07, .3], [262, .055, .25], [415, .04, .16], [640, .03, .1]], loud: .4 },
  metal: { click: [['bp', 2500, 1.2], .55], body: [['bp', 1100, 1.2], .02, .4], thump: [110, .03, .4], ring: [[431, .09, .1], [612, .07, .07], [757, .07, .08], [1029, .05, .06], [1183, .05, .07], [1712, .04, .05], [2355, .03, .04], [3090, .025, .03]], rattle: .7, loud: .8 },
  grass: { click: [['lp', 600, .7], .05], body: [['lp', 300, .8], .03, .5], thump: [68, .035, .35], swish: [.09, 1900], crackle: 1.2, loud: .8 },
  gravel: { click: [['bp', 1800, .8], .3], body: [['lp', 500, .8], .03, .5], thump: [70, .035, .35], crunch: 1, loud: .85 },
  pit: { click: [['bp', 2200, 1], .2], body: [['lp', 500, .8], .04, .5], thump: [70, .04, .3], clatter: 1, loud: .7 },
  shallow: { click: [['lp', 800, .7], .1], body: [['bp', 700, .7], .05, .5], thump: [60, .03, .2], splash: .7, loud: .8 },
  wade: { wade: 1, loud: .8 },
};
// one footfall: surface s, seed, run (0 walk, 1 run), force (1 is a normal step; a landing is more), foot (0 left, 1 right)
function footstep(name, seed, run = 0, force = 1, foot = 0, sr = 44100) {
  const S = surfaces[name] || surfaces.carpet, r = rng(seed * 7919 + foot * 104729 + run * 15485863 + 1), len = name === 'wade' ? .9 : S.ring && name === 'metal' ? .75 : .5;
  const out = new Float32Array(Math.round(len * sr)), j = (a, k = .08) => a * (1 - k + 2 * k * r()), br = (1 + .35 * run) * Math.min(1.4, .8 + .2 * force); // br: a harder strike is brighter
  const g = Math.min(2.2, force) * (1 + .35 * run), heel = .004, gap = run ? j(.042, .2) : j(.085, .2), toe = j(.55, .2) * (run ? 1.15 : 1);
  if (S.wade) { // pushing a leg through deep water: a slow swirl and the water falling off the knee, no strike
    burst(out, sr, r, 0, j(.1), j(.16), ['lp', j(900) * br, .7, 'hp', 140, .7], .55 * g, .6);
    burst(out, sr, r, .05, j(.06), j(.08), ['bp', j(520), .9], .35 * g, .4);
    bubbles(out, sr, r, .12, .5, 10 + 8 * run | 0, 500, 1400, .05 * g);
    return finish(out, sr, S.loud);
  }
  for (const [t, a] of [[heel, 1], [heel + gap, toe]]) { // the heel, then the ball of the foot
    const k = a * g;
    burst(out, sr, r, t, .0004, j(.0016), [S.click[0][0], j(S.click[0][1]) * br, S.click[0][2]], S.click[1] * k, .012);
    burst(out, sr, r, t, .0008, j(S.body[1]), [S.body[0][0], j(S.body[0][1]) * br, S.body[0][2]], S.body[2] * k);
    thump(out, sr, r, t, j(S.thump[0], .06), j(S.thump[1]), S.thump[2] * k * (a === 1 ? 1 : .5));
    if (S.ring) modes(out, sr, r, t, S.ring, k * (name === 'metal' ? .9 : 1), j(1, .03));
    if (S.rattle) grains(out, sr, r, t + .008, .06, 6 + 6 * r() | 0, ['bp', j(1900), 1.4], S.rattle * k * .5, .0008);
    if (S.grit) grains(out, sr, r, t + .004, j(.05 + .04 * run), 18 + 20 * run, ['bp', j(2300), .8], S.grit * k * .35);
    if (S.crunch) { grains(out, sr, r, t + .002, j(.11 + .05 * run), 70 + 50 * run, ['bp', j(2400), .7], k * .45); grains(out, sr, r, t + .004, j(.09), 30, ['bp', j(1100), .8], k * .45, .002); }
    if (S.clatter) { grains(out, sr, r, t + .005, j(.14), 22, ['bp', j(1800), 1.5], k * .5, .0025); modes(out, sr, r, t + .01, [[j(980), .02, .05], [j(1520), .015, .04]], k); }
    if (S.slap) burst(out, sr, r, t + .002, .002, j(.03), ['bp', j(950), .7], S.slap * k * .6);
    if (S.splash) { burst(out, sr, r, t + .004, .004, j(.07), ['bp', j(1300), .6], S.splash * k * .7, .35); bubbles(out, sr, r, t + .02, .22, 8 + 6 * run | 0, 900, 2600, .06 * k); thump(out, sr, r, t + .01, j(230), .025, .12 * k); }
  }
  if (S.peel) burst(out, sr, r, heel + gap + j(.11), .003, .012, ['bp', j(2300), 1.6], S.peel * g * .5, .05); // a wet sole lifting off
  if (S.swish) { burst(out, sr, r, 0, j(.015), j(.045 + .02 * run), ['bp', j(S.swish[1]) * br, .7], S.swish[0] * g * 1.4, .2); grains(out, sr, r, .004, j(.12 + .04 * run), 45 + 30 * run, ['bp', j(1500), .8], S.crackle * g * .3, .0025); grains(out, sr, r, .03, j(.1), 20, ['bp', j(3000), 1.2], S.crackle * g * .15, .0012); } // blades swept aside, stems snapping
  if (S.brush) burst(out, sr, r, heel + gap * .5, j(.02), j(.04), ['bp', j(1600), .6], S.brush * g * .5, .2); // the shoe brushing the pile
  if (r() < .45) burst(out, sr, r, .01, j(.04), j(.06), ['bp', j(700), .5], .025 * (1 + run), .25); // cloth: a trouser leg, now and then, very quiet
  return finish(out, sr, S.loud);
}

// ---------- doors: wood (a panelled room door) and metal (a steel service door with a push bar) ----------
function door(kind, open, seed = 1, sr = 44100) {
  const r = rng(seed * 31 + (open ? 7 : 3) + (kind === 'metal' ? 1000 : 0)), out = new Float32Array(Math.round(1.6 * sr)), j = (a, k = .06) => a * (1 - k + 2 * k * r()), M = kind === 'metal';
  const latch = (t, g) => { burst(out, sr, r, t, .0003, .0012, ['bp', j(M ? 2300 : 2700), 2.2], g, .01); modes(out, sr, r, t, M ? [[1840, .03, .08], [2950, .02, .05]] : [[1450, .015, .05]], g); };
  const leaf = M ? [[72, .45, .5], [118, .38, .45], [196, .3, .35], [311, .22, .25], [455, .16, .18], [690, .12, .1], [1020, .08, .06]] : [[95, .12, .6], [142, .1, .5], [214, .08, .35], [331, .06, .2], [520, .04, .1]];
  if (open) {
    if (M) { latch(.02, .55); burst(out, sr, r, .02, .001, .02, ['bp', 1200, 1], .4); modes(out, sr, r, .02, leaf.slice(2), .12); latch(.09, .3); } // the push bar's clack, the bolt drawn
    else { latch(.02, .35); latch(.075, .45); burst(out, sr, r, .07, .004, .03, ['bp', 1500, 1.4], .12); } // the handle turned, the latch drawn back
    burst(out, sr, r, .15, j(.04), j(.06), ['bp', j(M ? 620 : 880), 6], .05, .45); // the hinge: a short dry turn, not a creak
    burst(out, sr, r, .12, .18, .32, ['lp', 320, .7, 'hp', 60, .7], .5, 1.2); // air moving as the leaf swings
    modes(out, sr, r, .02, leaf, .05);
  } else {
    burst(out, sr, r, 0, .14, .1, ['lp', 300, .7, 'hp', 60, .7], .5, .45); // the swing pushing air ahead of it
    const t = .3; burst(out, sr, r, t, .0006, .01, ['lp', M ? 1800 : 1200, .7], .7, .05);
    thump(out, sr, r, t, M ? 64 : 82, M ? .07 : .05, .75); modes(out, sr, r, t, leaf, M ? .32 : .55);
    latch(t + .006, .5); latch(t + j(.022), .3); // the latch snapping into the strike plate
    if (M) grains(out, sr, r, t + .01, .12, 8, ['bp', 1500, 1.5], .08, .001); // the push bar settling
    burst(out, sr, r, t + .02, .03, M ? .4 : .2, ['lp', 260, .7], .14, 1); // the frame and the room answering
  }
  return finish(out, sr, open ? 1.5 : .9);
}

// ---------- water and loose things ----------
function splash(size, seed = 1, sr = 44100) { // size 0 (a toe dipped) to 1 (a jump in from a height)
  const r = rng(seed * 13 + 5), len = .5 + size, out = new Float32Array(Math.round(len * sr)), g = .4 + .6 * size;
  burst(out, sr, r, 0, .003, .05 + .1 * size, ['bp', 1100 - 300 * size, .6], .8 * g, .4 + .4 * size);
  burst(out, sr, r, .005, .02, .1 + .25 * size, ['lp', 700, .7], .5 * g, .6 + size);
  thump(out, sr, r, .006, 140 - 50 * size, .05 + .05 * size, .25 * g);
  bubbles(out, sr, r, .03, .3 + .5 * size, 12 + 40 * size | 0, 700, 2600, .07 * g);
  bubbles(out, sr, r, .2, .3 + .6 * size, 6 + 25 * size | 0, 1200, 3200, .04 * g); // the spray falling back
  return finish(out, sr, .9);
}
function drip(seed = 1, sr = 44100) {
  const r = rng(seed * 17 + 3), out = new Float32Array(Math.round(.25 * sr)), f = 900 + 1500 * r(); let ph = 0;
  for (let i = 0; i < out.length; i++) { const s = i / sr; ph += 2 * Math.PI * f * (1 + s * 30) / sr; out[i] = Math.sin(ph) * Math.exp(-s / (.01 + .015 * r())) * Math.min(1, s / .0006) * .5; }
  burst(out, sr, r, 0, .0003, .002, ['bp', 1800, 1], .1, .01);
  return finish(out, sr, .8);
}
// a knock of something loose: 'ball' (a hollow beach ball), 'pit' (a small plastic ball), 'ring' (an inflated swim ring meeting the pool's edge), 'big' (the field's ball)
function knock(kind, seed = 1, sr = 44100) {
  const r = rng(seed * 23 + kind.length), out = new Float32Array(Math.round(.35 * sr)), j = (a, k = .08) => a * (1 - k + 2 * k * r());
  if (kind === 'pit') { burst(out, sr, r, 0, .0003, .002, ['bp', j(2400), 1.4], .5, .015); modes(out, sr, r, 0, [[j(1050), .018, .25], [j(1720), .012, .15]], 1); }
  else if (kind === 'ring') { burst(out, sr, r, 0, .002, .02, ['lp', 700, .8], .6); modes(out, sr, r, 0, [[j(160), .05, .3], [j(240), .03, .15]], 1); burst(out, sr, r, .01, .01, .03, ['bp', 600, .8], .15); }
  else { const big = kind === 'big'; burst(out, sr, r, 0, .0006, .006, ['lp', big ? 1400 : 2200, .7], .6); thump(out, sr, r, 0, j(big ? 120 : 190), big ? .06 : .045, .7); modes(out, sr, r, 0, [[j(big ? 260 : 420), .04, .25], [j(big ? 410 : 690), .025, .12]], 1); }
  return finish(out, sr, .9);
}
function cricket(seed = 1, sr = 44100) { // one chirp: three or four pulses of a 4.4 kHz wing note
  const r = rng(seed * 29 + 1), out = new Float32Array(Math.round(.3 * sr)), f = 4100 + 500 * r(), n = 3 + (r() < .5), w = 2 * Math.PI * f / sr;
  for (let k = 0; k < n; k++) { const t0 = k * (.034 + .006 * r()), d = .016; for (let i = 0; i < d * sr; i++) { const s = i / sr, e = Math.sin(Math.PI * s / d) ** 2; out[Math.floor(t0 * sr) + i] += Math.sin(w * (t0 * sr + i)) * e * .5; } }
  return finish(out, sr, .7);
}
// ---------- reverb impulses: noise decaying faster at the top than the bottom; early reflections for the halls ----------
function impulse(secs, bright, early, sr = 44100, seed = 1) {
  const r = rng(seed), n = Math.round(secs * sr), ch = [];
  for (let c = 0; c < 2; c++) {
    const lo = new Float32Array(n), hi = new Float32Array(n);
    for (let i = 0; i < n; i++) { const s = i / sr, w = r() * 2 - 1; lo[i] = w * Math.exp(-s * 6.9 / secs); hi[i] = w * Math.exp(-s * 6.9 / (secs * (.25 + .4 * bright))); }
    biquad(lo, 'lp', 900, .7, sr); biquad(hi, 'hp', 900, .7, sr); biquad(hi, 'lp', 3000 + 3000 * bright, .7, sr);
    const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = lo[i] + hi[i] * (.5 + .5 * bright);
    for (let k = 0; k < early; k++) { const at = Math.floor((.008 + r() * .07) * sr); if (at < n) d[at] += (r() < .5 ? -1 : 1) * (.5 - k / early * .35); }
    for (let i = 0; i < Math.min(n, sr * .004); i++) d[i] *= i / (sr * .004);
    ch.push(d);
  }
  let e = 0; for (const d of ch) for (let i = 0; i < n; i++) e += d[i] * d[i]; const k = 1 / Math.sqrt(e / 2 + 1e-9); for (const d of ch) for (let i = 0; i < n; i++) d[i] *= k;
  return ch;
}

export { surfaces, footstep, door, splash, drip, knock, cricket, impulse, rng, biquad };
