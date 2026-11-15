// Music: a small generative piece for each place (a zone names its piece in `music`), cross-faded at equal power as you walk between places.
// The plan that keeps any two neighbours consonant while both sound: every piece uses only the seven notes of D major, each place with its own
// centre and colour inside them (G lydian in the backrooms, E dorian in the arcade, B minor at night, A mixolydian on the terrace...), all tuned so
// the fluorescent hum (120 Hz) is the B below; and every piece's bars sit on one 10 s grid counted from when the sound began, so chords change
// together. Notes come from a generator seeded by the piece and the bar, so the same moment always plays the same: walking out and back in does
// not restart a piece, and a piece is only built (and costs anything) while it can be heard.
const BAR = 10, TAU = 1.2; // TAU: the crossfade's time constant, ~3.7 s end to end; audio.js ramps the room tone with it
const hz = m => 120 * 2 ** ((m - 47) / 12);
const rng = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; // mulberry32
const seed = (name, b) => { let h = Math.imul(b + 7919, 2654435761); for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return rng(h); };
const walk = (name, list, b) => { let i = 0; for (let j = 1; j <= b; j++) { const r = seed(name + '~', j)(); i = (i + (r < .5 ? 1 : r < .75 ? 2 : r < .9 ? list.length - 1 : 3)) % list.length; } return list[i]; }; // a chord sequence that wanders, never the same twice running
const DM = []; for (let m = 26; m < 100; m++) if ([1, 2, 4, 6, 7, 9, 11].includes(m % 12)) DM.push(m); // D major
const sc = (lo, hi, pcs) => DM.filter(m => m >= lo && m <= hi && (!pcs || pcs.includes(m % 12)));
const pick = (R, a) => a[R() * a.length | 0];
const tune = (R, notes, n, i = notes.length / 2 | 0) => Array.from({ length: n }, () => notes[i = Math.min(notes.length - 1, Math.max(0, i + pick(R, [-2, -1, -1, 1, 1, 2, -3, 3])))]); // a melody that mostly steps
const near = (notes, ch) => notes.reduce((a, m) => ch.some(c => (c - m) % 12 === 0) && (a === null || Math.abs(m - 76) < Math.abs(a - 76)) ? m : a, null); // nearest chord tone

// instruments: oscillator parts [ratio, level, decay scale, type]; fm: [ratio, index, decay] on the first part; cut: a pluck's low-pass [start, end] x pitch and its time constant
const EP = { fm: [1, 1.1, .5], parts: [[1, 1], [4, .025, .15]], att: .006, rel: 1.4 };
const BELL = { parts: [[1, 1], [2, .3, .5], [3, .1, .3], [4, .05, .2]], att: .006, rel: 2.2 };
const BOX = { parts: [[1, 1], [2, .22, .4], [4, .16, .2]], att: .003, rel: .9 };
const PLUCK = { type: 'sawtooth', cut: [6, 1.2, .18], att: .004, rel: 1.1 };
const PIANO = { parts: [[1, 1, 1, 'triangle'], [2, .35, .5], [3, .1, .3]], att: .004, rel: 1 };
const HARP = { parts: [[1, 1, 1, 'triangle'], [2, .25, .45]], att: .003, rel: 1.8 };

function voice(k, dest, m, t, o) {
  const { vol = .05, att = .01, hold = 0, rel = 1, parts = [[1, 1]], type = 'sine', fm, cut, pan, wow = k.wow } = o, ac = k.ac, now = ac.currentTime + .03, f = hz(m);
  let a = att, h = hold;
  if (t < now) { const late = now - t; if (a + h < late + .3) return; h -= Math.max(0, late - a); a = .4; t = now; } // joined part-way: a held note comes in softly, a struck one is left out
  let out = dest, n = 0, end = t;
  if (pan) { out = ac.createStereoPanner(); out.pan.value = pan; out.connect(dest); n++; }
  if (cut) { const b = ac.createBiquadFilter(); b.frequency.setValueAtTime(f * cut[0], t); b.frequency.setTargetAtTime(f * cut[1], t, cut[2]); b.connect(out); out = b; n++; }
  let mg; if (fm) { const mo = ac.createOscillator(); mg = ac.createGain(); mo.frequency.value = f * fm[0]; mg.gain.setValueAtTime(f * fm[1], t); mg.gain.setTargetAtTime(f * fm[1] * .12, t, fm[2]);
    mo.connect(mg); mo.start(t); mo.stop(t + a + h + rel * 6); n += 2; }
  for (const [r, v, d = 1, ty = type] of parts) {
    const os = ac.createOscillator(), g = ac.createGain(), e = t + a + (h + rel * 6) * d; os.type = ty; os.frequency.value = f * r; if (wow) wow.connect(os.detune);
    if (mg && r === parts[0][0]) mg.connect(os.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * v, t + a); g.gain.setTargetAtTime(0, t + a + h * d, rel * d);
    os.connect(g).connect(out); os.start(t); os.stop(e); n += 2; end = Math.max(end, e);
  }
  k.count(n, end); k.log?.push([t, m]);
}
function bird(k, dest, t, R, vol) { // a short run of rising or falling chirps
  const ac = k.ac; if (t < ac.currentTime + .03) return; const p = ac.createStereoPanner(); p.pan.value = R() * 1.4 - .7; p.connect(dest); let n = 1, end = t;
  for (let i = 0, c = 2 + R() * 4 | 0, f0 = 2900 + R() * 1400, up = R() < .6; i < c; i++, t += .08 + R() * .09) {
    const o = ac.createOscillator(), g = ac.createGain(), f = f0 * (1 + (R() - .5) * .08), d = .04 + R() * .04;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (up ? 1.35 : .75), t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.setTargetAtTime(0, t + d * .7, .015);
    o.connect(g).connect(p); o.start(t); o.stop(t + d + .15); n += 2; end = t + d + .15; k.log?.push([t, 0]);
  }
  k.count(n, end);
}
const steps = (R, n, k, w = s => s % 2 ? 1 : 2) => { const s = [], ws = Array.from({ length: n }, (_, i) => w(i)); // k distinct grid steps, weighted
  while (s.length < Math.min(k, n)) { let x = R() * ws.reduce((a, b) => a + b), i = 0; while ((x -= ws[i]) > 0) i++; if (!s.includes(i)) s.push(i); } return s.sort((a, b) => a - b); };
const roll = (k, dest, ch, t, o, gap = .06) => ch.forEach((m, i) => voice(k, dest, m, t + i * gap, o));

// chords (midi), all inside D major
const C = {
  Dmaj9: [38, 50, 57, 61, 64, 66], Bm9: [35, 47, 54, 57, 61, 62], Gmaj7: [31, 43, 50, 54, 57, 59], A6sus: [33, 45, 52, 57, 59, 64], Em9: [28, 40, 47, 50, 54, 55],
  Gmaj9: [43, 54, 57, 59, 62], Fsm7: [42, 52, 57, 61, 64], Em7: [40, 50, 54, 55, 59], A13sus: [45, 55, 59, 62, 66],
};

const pieces = {
  // backrooms: a lounge record several rooms away, slowed and wobbling, mostly reverb, in G lydian; the hum (room tone) is the lead
  backrooms: { vol: 1.35, send: 1.4, bed(h, out, p) { p.wow = h.gain(1); h.lfo(.19, 17, p.wow); h.lfo(.031, 11, p.wow); return h.filt('lowpass', 820, .7, h.filt('highpass', 160, .5, out)); },
    bar(k, p, b, t, R) { const ch = walk('backrooms', [C.Gmaj9, C.Fsm7, C.Em7, C.A13sus], b), o = { ...EP, wow: p.wow }, S = BAR / 16;
      roll(k, p.in, ch, t, { ...o, vol: .026, rel: 2.6 }, .09); if (R() < .6) roll(k, p.in, ch.slice(2), t + 8 * S, { ...o, vol: .02, rel: 2 }, .09);
      const st = steps(R, 16, 3 + R() * 5 | 0), mel = tune(R, sc(66, 81), st.length);
      st.forEach((s, i) => voice(k, p.in, s % 8 ? mel[i] : near(sc(66, 81), ch) ?? mel[i], t + s * S + R() * .03, { ...o, vol: .04, rel: 1.3 })); } },
  // pool hall (daylight): the game's first piece, brighter and wider: a slow major-ninth pad, glassy electric-piano notes panned wide through a tape echo
  pool: { vol: .88, send: 1, bed(h, out, p) { const lp = h.filt('lowpass', 1100, .4, out); h.lfo(.04, 350, lp.frequency); p.echo = h.echo(.52, .45, 4000, out); return lp; },
    bar(k, p, b, t, R) { const ch = walk('pool', [C.Dmaj9, C.Bm9, C.Gmaj7, C.A6sus, C.Em9], b);
      for (const m of ch) voice(k, p.in, m, t, { type: 'sawtooth', parts: [[.996, 1], [1.004, 1]], vol: .03, att: 4, hold: 5, rel: 2.2 });
      for (let s = t + R() * 2; s < t + BAR; s += 1.3 + R() * 3.5) { const m = pick(R, [74, 76, 78, 81, 83, 86, 88, 90]), pan = R() * 1.4 - .7;
        voice(k, p.echo, m, s, { fm: [1, .7, .25], parts: [[1, 1], [2, .2, .4]], vol: .06, rel: .9, pan }); } } },
  // arcade pool: the pool hall's family, cooler and closer: triangle pad, darker electric piano on a tighter grid, E dorian
  arcade: { vol: 1.08, send: .7, bed(h, out, p) { p.echo = h.echo(.375, .3, 2200, out); return h.filt('lowpass', 700, .5, out); },
    bar(k, p, b, t, R) { const ch = walk('arcade', [[40, 52, 55, 59, 62, 66], [45, 52, 57, 59, 62, 66], [43, 50, 54, 57, 59], [42, 54, 57, 61, 64]], b), S = BAR / 16;
      for (const m of ch) voice(k, p.in, m, t, { type: 'triangle', parts: [[.997, 1], [1.003, 1]], vol: .025, att: 3, hold: 6, rel: 2 });
      const st = steps(R, 16, 3 + R() * 4 | 0), mel = tune(R, sc(66, 81), st.length);
      st.forEach((s, i) => voice(k, p.echo, mel[i], t + s * S, { ...EP, fm: [1, .5, .3], vol: .05, rel: 1.1, pan: R() * .5 - .25 })); } },
  // gallery: formal and symmetrical: chords run forward then back over eight bars; each bar's phrase is answered by its mirror image, left then right
  gallery: { vol: 1.17, send: 1, bed(h, out) { return h.filt('lowpass', 1300, .5, out); },
    bar(k, p, b, t, R) { const i = ((b % 8) + 8) % 8, ch = walk('gallery', [[38, 50, 57, 62, 66], [37, 49, 57, 61, 64], [35, 47, 54, 59, 62], [31, 43, 50, 55, 59], [40, 52, 55, 59, 62], [33, 45, 52, 57, 62]], Math.floor(b / 8) * 4 + (i < 4 ? i : 7 - i)), S = BAR / 8;
      for (const m of ch) voice(k, p.in, m, t, { parts: [[1, 1], [2, .4], [3, .15]], vol: .022, att: 2, hold: 6, rel: 2 });
      if (R() < .2) return;
      const notes = sc(69, 86), st = steps(R, 4, 2 + R() * 3 | 0, () => 1), mel = tune(R, notes, st.length, notes.indexOf(near(notes, ch))), inv = R() < .5;
      st.forEach((s, j) => { voice(k, p.in, mel[j], t + s * S, { ...BELL, vol: .04, rel: 2, pan: -.3 });
        const m = inv ? notes[Math.max(0, Math.min(notes.length - 1, 2 * notes.indexOf(mel[0]) - notes.indexOf(mel[j])))] : mel[j]; // the answer: mirrored in pitch, or the same notes played back from the end
        voice(k, p.in, m, t + (7 - s) * S, { ...BELL, vol: .04, rel: 2, pan: .3 }); }); } },
  // night hall: the pools after dark: lower, slower, B minor, two bars to a chord, a few warm electric-piano notes through a long echo
  night: { vol: 1.11, send: 1, bed(h, out, p) { p.echo = h.echo(.9, .4, 1500, out); return h.filt('lowpass', 520, .5, out); },
    bar(k, p, b, t, R) { const ch = walk('night', [[35, 47, 50, 54, 57, 61], [31, 43, 47, 54, 57, 62], [28, 40, 47, 50, 55, 54], [30, 42, 50, 57, 61, 64]], b >> 1), S = BAR / 8;
      if (!(b & 1)) for (const m of ch) voice(k, p.in, m, t, { type: 'triangle', parts: [[.997, 1], [1.003, 1]], vol: .022, att: 6, hold: 9, rel: 3 });
      steps(R, 8, 1 + R() * 3 | 0).forEach(s => voice(k, p.echo, pick(R, sc(54, 71)), t + s * S, { ...EP, fm: [1, .6, .6], vol: .055, rel: 2 })); } },
  // vault: almost a held breath: a low bowed tone now and then, a low bell, and a very long tail
  vault: { vol: 1.35, send: 1.2, bed(h, out, p) { p.tail = h.gain(1, out); h.echo(.73, .55, 1300, out, p.tail); h.echo(1.17, .5, 1000, out, p.tail); return p.tail; },
    bar(k, p, b, t, R) { if (R() < .6) for (const m of [pick(R, [38, 45, 35, 40]), ...(R() < .5 ? [57] : [])]) voice(k, p.in, m, t + R() * 2, { type: 'triangle', parts: [[1, 1], [2, .15]], vol: .025, att: 4, hold: 3, rel: 3 });
      if (R() < .7) voice(k, p.in, pick(R, [50, 57, 59, 62, 64, 69]), t + (R() * 4 | 0) * 2.5, { ...BELL, vol: .045, rel: 3.5 }); } },
  // hotel corridor: lounge piano behind a door: shell chords every half bar, a lazy swung melody, muffled
  hotel: { vol: 2.11, send: .4, bed(h, out) { return h.filt('lowpass', 680, .3, out); },
    bar(k, p, b, t, R) { const B = BAR / 16;
      for (let hf = 0; hf < 2; hf++) { const ch = walk('hotel', [[40, 50, 54, 55, 59], [45, 55, 61, 66], [38, 49, 52, 54, 57], [35, 45, 49, 50, 54], [43, 50, 54, 57, 59], [42, 52, 57, 61, 64]], b * 2 + hf), t0 = t + hf * 8 * B;
        voice(k, p.in, ch[0] - 12 > 26 ? ch[0] - 12 : ch[0], t0, { ...PIANO, vol: .03, rel: 1.6 }); roll(k, p.in, ch.slice(1), t0 + .02, { ...PIANO, vol: .025, rel: 1.8 }, .025);
        if (R() < .5) voice(k, p.in, ch[0] + 7 - (ch[0] + 7 > 52 ? 12 : 0), t0 + 4 * B, { ...PIANO, vol: .04, rel: 1.2 });
        const st = steps(R, 16, 3 + R() * 4 | 0), mel = tune(R, sc(66, 83), st.length);
        st.forEach((s, i) => voice(k, p.in, mel[i], t0 + (s >> 1) * B + (s & 1) * B * .62 + R() * .02, { ...PIANO, vol: .03 + R() * .012, rel: .8 })); } } },
  // mall after hours: slow major-seventh chords rolled on a wobbling electric piano, a soft pad, a vibraphone line, wide reverb
  mall: { vol: 1.75, send: 1.2, bed(h, out, p) { p.wow = h.gain(1); h.lfo(.27, 15, p.wow); h.lfo(.07, 8, p.wow); return h.filt('lowpass', 2000, .5, out); },
    bar(k, p, b, t, R) { const ch = walk('mall', [[38, 50, 54, 57, 61], [43, 54, 59, 62, 66], [35, 50, 54, 57, 61], [31, 47, 54, 57, 62], [40, 50, 55, 59, 66], [42, 50, 54, 57, 61]], b), o = { ...EP, fm: [1, .7, .5], wow: p.wow }, S = BAR / 8;
      roll(k, p.in, ch, t, { ...o, vol: .03, rel: 3 }, .09); if (R() < .5) roll(k, p.in, ch.slice(1).map(m => m + 12), t + 5 * S, { ...o, vol: .02, rel: 2.5 }, .09);
      for (const m of ch.slice(1)) voice(k, p.in, m, t, { type: 'sawtooth', parts: [[.996, 1], [1.004, 1]], vol: .008, att: 3, hold: 5, rel: 3, wow: p.wow });
      steps(R, 8, 1 + R() * 3 | 0).forEach(s => voice(k, p.in, pick(R, sc(69, 83)), t + s * S, { parts: [[1, 1], [4, .1, .25]], vol: .04, rel: 2.2, pan: R() - .5, wow: p.wow })); } },
  // soft play: a music box, simple and gentle, a little slow and not quite steady
  softplay: { vol: 2.50, send: .7, bed(h, out) { return h.filt('lowpass', 5000, .5, out); },
    bar(k, p, b, t, R) { const ch = walk('softplay', [[50, 54, 57], [43, 47, 50], [47, 50, 54], [45, 49, 52], [40, 43, 47]], b), S = BAR / 12, notes = sc(74, 86, [2, 4, 6, 7, 9, 11]);
      voice(k, p.in, ch[0] + 12, t, { ...BOX, vol: .04, rel: 1.4 }); if (R() < .6) voice(k, p.in, ch[2] + 12, t + 6 * S, { ...BOX, vol: .03, rel: 1.2 });
      const st = steps(R, 12, 5 + R() * 4 | 0, s => s % 3 ? 1 : 2), mel = tune(R, notes, st.length);
      st.forEach((s, i) => voice(k, p.in, s % 6 ? mel[i] : near(notes, ch) ?? mel[i], t + s * S * (1 + s * .004) + R() * .04, { ...BOX, vol: .035, rel: .9 })); } },
  // cinema: a low warm string pad in B minor with a gentle vibrato, an occasional high line, and the projector's faint flutter
  cinema: { vol: 2.17, send: .8, bed(h, out, p) { p.wow = h.gain(1); h.lfo(5.2, 5, p.wow);
      const fl = h.gain(.5, h.gain(.02, out)); h.hiss('bandpass', 2200, .9, fl); h.lfo(24, .5, fl.gain, 'square'); h.lfo(.5, .2, fl.gain);
      return h.filt('lowpass', 1000, .5, out); },
    bar(k, p, b, t, R) { const ch = walk('cinema', [[35, 47, 54, 59, 62], [31, 43, 50, 55, 59], [30, 42, 50, 57, 62], [28, 40, 47, 55, 59], [33, 45, 52, 57, 61]], b >> 1);
      if (!(b & 1)) for (const m of ch) voice(k, p.in, m, t, { type: 'sawtooth', parts: [[1, 1], [1.003, .8], [.997, .8]], vol: .014, att: 3.5, hold: 13, rel: 3, wow: p.wow });
      if (R() < .6) voice(k, p.in, pick(R, sc(66, 78).filter(m => ch.some(c => (c - m) % 12 === 0))), t + 1 + R() * 4, { type: 'triangle', vol: .022, att: 3, hold: 3, rel: 2.5, wow: p.wow }); } },
  // parking level: almost nothing: a low far drone and, now and then, one distant note
  parking: { vol: 1, send: 1.4, bed(h, out, p) { const g = h.gain(.6, h.filt('lowpass', 260, .5, out)); h.osc('triangle', hz(38), h.gain(.05, g)); h.osc('triangle', hz(45), h.gain(.035, g)); h.lfo(.021, .4, g.gain);
      p.echo = h.echo(1.1, .45, 1200, out); return out; },
    bar(k, p, b, t, R) { if (R() < .4) voice(k, p.echo, pick(R, sc(57, 74)), t + (R() * 4 | 0) * 2.5, { ...(R() < .5 ? EP : BELL), vol: .2, rel: 2.5 }); } },
  // field: open and airy: soft high pads, plucked pentatonic notes carried on the wind (their own echo: the open air has no reverb)
  field: { vol: 2.19, send: 1, bed(h, out, p) { p.echo = h.echo(.55, .35, 2500, out); return out; },
    bar(k, p, b, t, R) { const ch = walk('field', [[50, 57, 62, 64, 66], [47, 54, 57, 62, 64], [43, 54, 57, 59, 62], [45, 52, 57, 59, 64]], b), S = BAR / 12;
      for (const m of ch) voice(k, p.in, m + 12, t, { type: 'triangle', parts: [[1, 1], [2, .12]], vol: .016, att: 3, hold: 4, rel: 3 });
      steps(R, 12, 2 + R() * 4 | 0).forEach(s => voice(k, p.echo, pick(R, sc(62, 83, [2, 4, 6, 9, 11])), t + s * S + R() * .15, { ...PLUCK, vol: .02 + R() * .03, pan: R() * 1.6 - .8 })); } },
  // car park at night: sparse and calm: a rolled electric-piano chord under the lamps' hum and a note or two
  lot: { vol: 1.89, send: 1, bed(h, out, p) { p.echo = h.echo(.7, .35, 1800, out); return out; },
    bar(k, p, b, t, R) { const ch = walk('lot', [[43, 54, 57, 59, 62], [42, 50, 57, 61, 64], [40, 50, 54, 55, 59], [35, 50, 54, 57, 61]], b), S = BAR / 8;
      roll(k, p.in, ch, t, { ...EP, fm: [1, .5, .6], vol: .028, rel: 3 }, .11);
      if (R() > .2) steps(R, 8, 1 + R() * 3 | 0).forEach(s => s && voice(k, p.echo, pick(R, sc(64, 78)), t + s * S, { ...EP, fm: [1, .6, .5], vol: .04, rel: 2 })); } },
  // terrace at dusk: a slow plucked guitar in A mixolydian over the sea's wash
  terrace: { vol: 1.66, send: .8, bed(h, out) { const sea = h.gain(.5, h.gain(.05, out)); h.hiss('lowpass', 420, .4, sea); h.lfo(.085, .3, sea.gain); h.lfo(.053, .18, sea.gain); return out; },
    bar(k, p, b, t, R) { const ch = walk('terrace', [[45, 52, 57, 61, 64, 66], [43, 50, 55, 59, 62, 66], [38, 45, 50, 57, 61, 64], [40, 47, 50, 55, 59, 62]], b), S = BAR / 12;
      voice(k, p.in, ch[0], t, { ...PLUCK, vol: .15, rel: 1.6 }); const up = ch.slice(1), seq = [...up, ...up.slice(0, -1).reverse()];
      for (let s = 1, j = 0; s < 12 && j < seq.length; s++) if (R() > .25) voice(k, p.in, seq[j++], t + s * S + R() * .03, { ...PLUCK, vol: .09 + R() * .03, rel: 1.3, pan: (j / seq.length - .5) * .6 }); } },
  // laundromat at 3 a.m.: the machines' hum (room tone) and a small radio somewhere playing an easy tune, thin and a little crunchy
  radio: { vol: 1.37, send: .5, bed(h, out) { const hs = h.gain(.003, out); h.hiss('highpass', 4000, .5, hs);
      const sh = h.add(h.ac.createWaveShaper()); sh.curve = new Float32Array(257).map((_, i) => Math.tanh(2 * (i / 128 - 1))); sh.connect(h.filt('highpass', 450, .7, out)); return h.filt('bandpass', 1500, 1.3, sh); },
    bar(k, p, b, t, R) { const S = BAR / 16;
      for (let hf = 0; hf < 2; hf++) { const ch = walk('radio', [[50, 62, 66, 69], [47, 62, 66, 71], [43, 62, 67, 71], [45, 61, 64, 69]], b * 2 + hf), t0 = t + hf * 8 * S;
        for (const s of [0, 3, 4, 6]) voice(k, p.in, s === 3 || s === 6 ? ch[0] + 7 : ch[0], t0 + s * S, { parts: [[1, 1, 1, 'triangle'], [2, .4, .5]], vol: .08, rel: .35 });
        for (const s of [2, 6]) roll(k, p.in, ch.slice(1), t0 + s * S, { ...EP, vol: .03, rel: .5 }, .01);
        const st = steps(R, 8, 2 + R() * 3 | 0), mel = tune(R, sc(69, 86), st.length); st.forEach((s, i) => voice(k, p.in, mel[i], t0 + s * S, { parts: [[1, 1], [2, .3]], vol: .05, rel: .5 })); } } },
  // metro platform: deep tunnel air and, now and then, a falling chime with a long tail
  metro: { vol: 1.83, send: 1, bed(h, out, p) { const air = h.gain(.6, h.gain(.15, out)); h.hiss('lowpass', 140, .5, air); h.lfo(.043, .3, air.gain); h.osc('sine', hz(38), h.gain(.012, out));
      p.echo = h.echo(1.4, .5, 3000, out); return out; },
    bar(k, p, b, t, R) { if (R() < .45) { const ns = [81, 78, 74, 69, 66], i = R() * 2 | 0, s0 = t + (R() * 4 | 0) * 2.5, pan = R() * .6 - .3;
      for (let j = 0, c = 2 + (R() < .5); j < c; j++) voice(k, p.echo, ns[i + j], s0 + j * .9, { ...BELL, vol: .05, rel: 3, pan }); }
      if (R() < .2) voice(k, p.echo, pick(R, [57, 62]), t + 5 + R() * 4, { ...BELL, vol: .03, rel: 3.5 }); } },
  // glasshouse at dusk: slow harp arpeggios and a little evening birdsong
  glass: { vol: 1.80, send: .9, bed(h, out) { return out; },
    bar(k, p, b, t, R) { const ch = walk('glass', [[43, 55, 59, 62, 66, 69], [38, 50, 57, 61, 64, 66], [40, 52, 55, 59, 62, 69], [45, 57, 59, 62, 64, 69]], b), S = BAR / 16;
      const ar = [...ch.slice(1), ...ch.slice(1).map(m => m + 12)], n = 6 + R() * 5 | 0, down = R() < .3;
      voice(k, p.in, ch[0], t, { ...HARP, vol: .08, rel: 2.4 });
      for (let j = 0, o = R() * 2 | 0; j < Math.min(n, ar.length - o); j++) if (R() > .15) voice(k, p.in, down ? ar[ar.length - 1 - j - o] : ar[j + o], t + (j + 1) * S + R() * .03, { ...HARP, vol: .06, pan: (j / n - .5) * .8 });
      if (R() < .35) bird(k, p.in, t + 1 + R() * 7, R, .02); } },
  // the dark passages: the music thins to a faint low D and A, the hand-over between places
  hush: { vol: 1, send: 1, bed(h, out) { const g = h.gain(.6, out); h.osc('sine', hz(38), h.gain(.03, g)); h.osc('sine', hz(45), h.gain(.018, g)); h.lfo(.05, .25, g.gain); h.hiss('lowpass', 200, .5, h.gain(.02, out)); return out; } },
};

function makeMusic(ac, master, verb, noise, { tap = false } = {}) {
  const mus = ac.createGain(), musV = ac.createGain(); mus.connect(master); musV.connect(verb);
  const curve = new Float32Array(2049).map((_, i) => Math.sin(Math.min(1, Math.max(0, i / 1024 - 1)) * Math.PI / 2)); // fade position -> equal-power gain
  const live = new Map(), ends = [], stat = { live: 0, peak: 0 };
  const k = { ac, log: null, count(n, end) { stat.live += n; stat.peak = Math.max(stat.peak, stat.live); if (end) ends.push([end, n]); } };
  { const o = ac.createOscillator(); k.wow = ac.createGain(); k.wow.gain.value = 7; o.frequency.value = .11; o.connect(k.wow); o.start(); } // tape wobble, in cents
  function start(name, t) { // build a piece's bus and bed; its x lane (0 silent .. 1 full) runs through the equal-power curve into its gain
    const def = pieces[name], p = { name, def, nodes: [], next: Math.floor(t / BAR) - 1, off: null }, add = n => (p.nodes.push(n), n);
    const h = { ac, add, gain(v, ...to) { const g = add(ac.createGain()); g.gain.value = v; for (const n of to) g.connect(n); return g; },
      filt(type, f, q, to) { const b = add(ac.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(to); return b; },
      osc(type, f, to) { const o = add(ac.createOscillator()); o.type = type; o.frequency.value = f; o.connect(to); o.start(t); return o; },
      lfo(f, depth, param, type = 'sine') { h.osc(type, f, h.gain(depth, param)); },
      hiss(type, f, q, to) { const s = add(ac.createBufferSource()); s.buffer = noise; s.loop = true; s.connect(h.filt(type, f, q, to)); s.start(t, Math.random() * 1.5); },
      echo(dt, fb, lp, out, from) { // a feedback delay, low-passed each time round, into out with the dry; fed by a new input, or by from
        const d = add(ac.createDelay(2)); d.delayTime.value = dt; d.connect(h.filt('lowpass', lp, .5, h.gain(fb, d))); d.connect(out);
        if (from) { from.connect(d); return from; } return h.gain(1, out, d); } };
    p.x = add(ac.createConstantSource()); p.x.offset.value = 0; const sh = add(ac.createWaveShaper()); sh.curve = curve;
    p.out = add(ac.createGain()); p.out.gain.value = 0; p.x.connect(sh).connect(p.out.gain); p.x.start(t);
    const lvl = h.gain(def.vol, p.out);
    if (tap) { const sq = h.gain(0, master); sh.connect(sq); sh.connect(sq.gain); } // dev: the piece's gain squared to the output, to measure the fade law
    else { p.out.connect(mus); p.out.connect(h.gain(def.send, musV)); }
    p.in = def.bed ? def.bed(h, lvl, p) : lvl;
    k.count(p.nodes.length); live.set(name, p); return p;
  }
  function stop(p) { for (const n of p.nodes) { try { n.stop?.(); } catch {} n.disconnect(); } stat.live -= p.nodes.length; live.delete(p.name); }
  return { k, stat, live, pieces,
    to(name, t = ac.currentTime) { // fade to a place's piece (or to silence for a place with none); a piece already sounding is turned round, never restarted
      if (!pieces[name]) name = null; if (name && !live.has(name)) start(name, t);
      for (const p of live.values()) { const on = p.name === name; if (on === p.on) continue; p.on = on; p.off = on ? null : t; p.x.offset.setTargetAtTime(on ? 1.05 : -.05, t, TAU); } },
    until(T) { const now = ac.currentTime; // schedule every sounding piece's bars that start before T; drop pieces faded out for good
      for (const p of [...live.values()]) { if (p.off !== null && now > p.off + 4 * TAU) { stop(p); continue; }
        while (p.next * BAR < T) { const b = p.next++; p.def.bar?.(k, p, b, b * BAR, seed(p.name, b)); } }
      for (let i = ends.length; i--;) if (ends[i][0] < now) { stat.live -= ends[i][1]; ends.splice(i, 1); } },
    level(v) { mus.gain.value = musV.gain.value = v; },
  };
}

export { makeMusic, pieces, TAU, BAR };
