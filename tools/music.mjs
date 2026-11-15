// The music, measured: renders every place's piece and every crossfade between neighbouring places offline (dev.music.render) and prints one table;
// --wav <dir> also writes short WAVs to listen to. Nobody here can listen, so this is what can be measured.
//   node tools/music.mjs [--port 8200] [--only places,pairs,repeats] [--wav screenshots/music]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const url = `http://127.0.0.1:${arg('port', 8200)}/?dev&bare`, only = arg('only', 'places,pairs,repeats').split(','), wav = arg('wav');
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const run = (fn, job) => { let out; try { out = execFileSync(process.execPath, [browse, '--url', url, '--wait', '1800000', '--eval', `(${fn})(${JSON.stringify(job)})`], { encoding: 'utf8', maxBuffer: 1 << 30 }); }
  catch (e) { out = e.stdout; } const r = JSON.parse(out); if (r.errors.length) console.error(r.errors.join('\n').slice(0, 2000)); return r.result; };

// ---- in the page ----
async function page(job) {
  const Z = dev.zones, R = dev.music.render, sr = 44100, PCS = new Set([1, 2, 4, 6, 7, 9, 11]); // D major
  const db = x => 10 * Math.log10(x + 1e-20);
  function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), u = i + k, v = u + len / 2, xr = re[v] * c - im[v] * s, xi = re[v] * s + im[v] * c; re[v] = re[u] - xr; im[v] = im[u] - xi; re[u] += xr; im[u] += xi; } } }
  const Aw = f => { const f2 = f * f, r = 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)); return (r * 1.2589) ** 2; };
  function stats(buf, t0, t1) { // over [t0, t1) s: rms, A-weighted rms, peak, crest, centroid, out-of-key energy share (60 Hz - 5 kHz), largest sample step
    const ch = [buf.getChannelData(0), buf.getChannelData(1)], i0 = Math.round(t0 * sr), i1 = Math.min(Math.round(t1 * sr), ch[0].length), N = 8192;
    let e = 0, pk = 0, jump = 0; for (const d of ch) for (let i = i0; i < i1; i++) { e += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); if (i > i0) jump = Math.max(jump, Math.abs(d[i] - d[i - 1])); }
    const rms = db(e / (2 * (i1 - i0))); let P = 0, PA = 0, PF = 0, Pin = 0, Pout = 0;
    for (let s = i0; s + N <= i1; s += N) for (const d of ch) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = d[s + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / N)); fft(re, im);
      for (let b = 1; b < N / 2; b++) { const f = b * sr / N, p = re[b] * re[b] + im[b] * im[b]; P += p; PA += p * Aw(f); PF += p * f;
        if (f > 180 && f < 5000) { const pc = ((Math.round(12 * Math.log2(f / 120)) + 47) % 12 + 12) % 12; PCS.has(pc) ? Pin += p : Pout += p; } } }
    return { rms: +rms.toFixed(1), A: +(rms + db(PA / P)).toFixed(1), peak: +(20 * Math.log10(pk)).toFixed(1), crest: +(20 * Math.log10(pk) - rms).toFixed(1), cent: Math.round(PF / P), out: +(100 * Pout / (Pin + Pout)).toFixed(1), jump: +jump.toFixed(4) };
  }
  const level = (buf, t0, t1) => { const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1); let e = 0; for (let i = Math.round(t0 * sr); i < Math.round(t1 * sr); i++) e += d0[i] * d0[i] + d1[i] * d1[i]; return db(e / (2 * (t1 - t0) * sr)); };
  const rep = {}; for (const z of Object.values(Z)) if (z.music && !rep[z.music]) rep[z.music] = z; // one zone per piece
  const out = {};
  if (job.places) { out.places = []; for (const [name, z] of Object.entries(rep)) { const r = await R([[0, z]], 60), rr = await R([[0, z]], 30, { room: true });
    const L = level(r.buf, 10, 60); let sw = 0; for (let t = 10; t <= 57; t += .5) sw = Math.max(sw, Math.abs(level(r.buf, t, t + 3) - L));
    out.places.push({ name, zone: z.id, ...stats(r.buf, 10, 60), swing3s: +sw.toFixed(1), withRoomA: stats(rr.buf, 10, 30).A, cpu: +(100 * r.ms / 60000).toFixed(1), nodes: r.peakNodes }); } }
  if (job.repeats) for (const mel of [0, 1]) { job.mel = mel; out[mel ? 'melody' : 'repeats'] = []; for (const [name, z] of Object.entries(rep)) { const r = await R([[0, z]], 300, { sr: 8000, log: true }), H = .05, n = 300 / H, x = new Float64Array(n);
    for (const [t] of r.log) if (t < 300 && (!job.mel || t % 10 > .6)) x[t / H | 0] += 1; const m = x.reduce((a, b) => a + b) / n; for (let i = 0; i < n; i++) x[i] -= m;
    const ac = L => { let s = 0; for (let i = 0; i + L < n; i++) s += x[i] * x[i + L]; return s / (n - L); }, a0 = ac(0) || 1;
    let best = 0, at = 0; for (let L = Math.round(10.5 / H); L <= 150 / H; L++) { const v = ac(L) / a0; if (v > best) { best = v; at = L * H; } }
    const bars = {}; for (const [t, m] of r.log) if (t % 10 > .6) (bars[t / 10 | 0] ||= []).push(Math.round(t % 10 * 10) + ':' + m);
    const sig = Object.values(bars).filter(v => v.length > 2).map(v => v.sort().join()), same = sig.filter(v => sig.indexOf(v) !== sig.lastIndexOf(v)).length;
    out[mel ? 'melody' : 'repeats'].push({ name, notes: r.log.length, sameBars: same + '/' + sig.length, bar: +(ac(10 / H) / a0).toFixed(2), beyond: +best.toFixed(2), at: +at.toFixed(2) }); } }
  if (job.pairs) { const ids = Object.keys(Z).filter(id => 'music' in Z[id]), seen = new Set(), pairs = [];
    const touch = (a, b, e = .3) => a[0] <= b[2] + e && b[0] <= a[2] + e && a[1] <= b[3] + e && b[1] <= a[3] + e;
    for (const a of ids) for (const b of ids) { const A = Z[a].music, B = Z[b].music, key = [A, B].sort().join('|');
      const warp = /^t\d$/.test(a) && b === 'u' + a.slice(1); if (A && B && A !== B && a < b && (touch(Z[a].box, Z[b].box) || warp) && !seen.has(key)) { seen.add(key); pairs.push([a, b]); } }
    out.pairs = []; for (const [a, b, jit] of [...pairs, ['bA', 'pH', 1]]) { // the last row: stepping back and forth in a doorway, 8 crossings in 6 s
      const st = [[0, Z[a]], [20, Z[b]]], seq = jit ? [[0, Z.bA], [20, Z.pH], [21, Z.bA], [22, Z.pH], [22.5, Z.bA], [24, Z.pH], [25, Z.bA], [26, Z.pH]] : st;
      const r = await R(seq, 40), law = await R(seq, 40, { tap: true }), L = law.buf.getChannelData(0);
      let lawMax = 0; for (let i = 20 * sr; i < 32 * sr; i++) lawMax = Math.max(lawMax, Math.abs(db(L[i])));
      const LA = level(r.buf, 8, 20), LB = level(r.buf, 28, 40); let bump = -99, dip = -99;
      for (let t = 18; t <= 26; t += .5) { const l = level(r.buf, t, t + 3); bump = Math.max(bump, l - Math.max(LA, LB)); dip = Math.max(dip, Math.min(LA, LB) - l); }
      const sa = stats(r.buf, 8, 19), sb = stats(r.buf, 30, 40), sf = stats(r.buf, 19, 28), so = stats(r.buf, 21, 24);
      out.pairs.push({ a, b, pieces: Z[a].music + '>' + Z[b].music + (seq !== st ? ' (doorway, 8 crossings)' : ''), LA: +LA.toFixed(1), LB: +LB.toFixed(1), law: +lawMax.toFixed(2), bump: +bump.toFixed(1), dip: +dip.toFixed(1),
        jump: sf.jump, jumpElse: Math.max(sa.jump, sb.jump), outOverlap: so.out, outA: sa.out, outB: sb.out, peak: Math.max(sa.peak, sb.peak, sf.peak), cpu: +(100 * r.ms / 40000).toFixed(1), nodes: r.peakNodes }); } }
  if (job.wav) { out.wav = []; for (const [name, steps, secs] of job.wav) { const r = await R(steps.map(([t, id]) => [t, Z[id]]), secs, { room: true }), n = r.buf.length, b = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); b.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 2, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 4, true); b.setUint16(32, 4, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 4, true);
    const c0 = r.buf.getChannelData(0), c1 = r.buf.getChannelData(1); for (let i = 0; i < n; i++) { b.setInt16(44 + i * 4, Math.max(-1, Math.min(1, c0[i])) * 32767, true); b.setInt16(46 + i * 4, Math.max(-1, Math.min(1, c1[i])) * 32767, true); }
    let s = ''; const u = new Uint8Array(b.buffer); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); out.wav.push([name, btoa(s)]); } }
  return out;
}

// ---- in Node ----
const table = (rows, cols) => { if (!rows?.length) return; const ks = cols || Object.keys(rows[0]), w = ks.map(k => Math.max(k.length, ...rows.map(r => String(r[k]).length)));
  console.log(ks.map((k, i) => k.padEnd(w[i])).join('  ')); for (const r of rows) console.log(ks.map((k, i) => String(r[k]).padEnd(w[i])).join('  ')); console.log(); };
const job = Object.fromEntries(only.map(k => [k, true]));
if (only.some(k => k !== 'wav')) { const r = run(page, { ...job, wav: undefined }) || {};
  if (r.places) { console.log('places (music alone, 10-60 s; rms/A/peak dBFS before the master compressor; out = % energy off the D major notes, 180 Hz-5 kHz; cpu = offline render time / real time, whole graph; swing3s = largest gap between a 3 s level and the long-term level, the piece alone)'); table(r.places); }
  if (r.repeats) { console.log('repeats (note onsets over 5 min, 50 ms bins: autocorrelation at the 10 s bar, and the largest at 10.5-150 s)'); table(r.repeats); }
  if (r.melody) { console.log('the same without the onsets in the first 0.6 s of each bar (the chords): the tunes alone; sameBars = bars (3+ notes) whose notes and timing exactly match another bar'); table(r.melody); }
  if (r.pairs) { console.log('crossfades (zone a until 20 s, then b; law = largest |dB| of the summed power of the fade gains; bump/dip = 3 s level beyond both sides; jump = largest sample step in the fade vs elsewhere; out% in the overlap vs each alone)'); table(r.pairs); } }
if (wav) { mkdirSync(wav, { recursive: true }); // with room tone, as you would hear it (before the master compressor)
  const places = [['backrooms', 'bA'], ['poolhall', 'pH'], ['arcade', 'pC'], ['gallery', 'pG'], ['nighthall', 'pN'], ['vault', 'pV'], ['hotel', 'hT'], ['mall', 'mL'], ['softplay', 'sP'], ['cinema', 'cN'],
    ['parking', 'pK'], ['field', 'fD'], ['carpark-night', 'nL'], ['terrace', 'sK'], ['laundromat', 'lW'], ['metro', 'mT'], ['glasshouse', 'gH'], ['passage', 't0']].map(([n, z]) => [n, [[0, z]], 40]);
  const moves = [['x-backrooms-poolhall', [[0, 'bA'], [15, 'pH']], 35], ['x-poolhall-arcade-nighthall', [[0, 'pH'], [12, 'pC'], [26, 'pN']], 42], ['x-backrooms-gallery-vault', [[0, 'bC'], [12, 'pG'], [26, 'pV']], 42],
    ['x-hotel-mall-softplay', [[0, 'hT'], [12, 'mL'], [26, 'sP']], 42], ['x-hotel-cinema', [[0, 'hT'], [15, 'cN']], 32], ['x-hotel-passage-field', [[0, 'hT'], [12, 't0'], [17, 'u0'], [19, 'fD']], 38],
    ['x-laundromat-outside', [[0, 'lW'], [15, 'lX']], 32], ['x-doorway-back-and-forth', [[0, 'bA'], [12, 'pH'], [14, 'bA'], [15.5, 'pH'], [17, 'bA'], [20, 'pH'], [21, 'bA']], 34]];
  const all = [...places, ...moves]; for (let i = 0; i < all.length; i += 4) for (const [n, b64] of run(page, { wav: all.slice(i, i + 4) })?.wav || []) writeFileSync(join(wav, n + '.wav'), Buffer.from(b64, 'base64'));
  console.log(`${all.length} WAVs in ${wav}`); }
