// The effects (js/sound.js), measured and written out to listen to: renders offline (dev.sound.render) every footstep surface, the doors,
// splashes, 20 s of each place's ambience and three walks through a doorway, writes WAVs and a spectrogram sheet, and prints one table.
// Nobody here can listen, so this is what can be measured.
//   node tools/sound.mjs [--port 8200] [--out screenshots/audio] [--only steps,doors,places,walks,space,live,sheet]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', 8200), out = resolve(arg('out', 'screenshots/audio')), only = arg('only', 'steps,doors,places,walks,space,live,sheet').split(',');
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
mkdirSync(out, { recursive: true });
const run = (fn, job, hash = '') => { let o; try { o = execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare${hash}`, '--wait', '1800000', '--eval', `(${fn})(${JSON.stringify(job)})`], { encoding: 'utf8', maxBuffer: 1 << 30 }); }
  catch (e) { o = e.stdout; } const r = JSON.parse(o); if (r.errors.length) console.error(r.errors.join('\n').slice(0, 2000)); return r.result; };

// ---- in the page ----
async function page(job) {
  const S = dev.sound, Z = dev.zones, V = S.voices, sr = 44100, db = x => 10 * Math.log10(x + 1e-20);
  const wav = buf => { const n = buf.length, c = buf.numberOfChannels, b = new DataView(new ArrayBuffer(44 + n * 2 * c)), w = (o, s) => [...s].forEach((ch, i) => b.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); b.setUint32(4, 36 + n * 2 * c, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, c, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 2 * c, true); b.setUint16(32, 2 * c, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2 * c, true);
    const ch = [...Array(c)].map((_, i) => buf.getChannelData(i)); for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) b.setInt16(44 + (i * c + k) * 2, Math.max(-1, Math.min(1, ch[k][i])) * 32767, true);
    let s = ''; const u = new Uint8Array(b.buffer); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
  const mono = (len, f) => { const b = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: sr }); b.copyToChannel(f, 0); return b; };
  function stats(buf, t0 = 0, t1 = buf.length / sr) { const i0 = Math.round(t0 * sr), i1 = Math.min(buf.length, Math.round(t1 * sr)); let e = 0, pk = 0, jump = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = i0; i < i1; i++) { e += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); if (i > i0) jump = Math.max(jump, Math.abs(d[i] - d[i - 1])); } }
    return { rms: +db(e / buf.numberOfChannels / (i1 - i0)).toFixed(1), peak: +(20 * Math.log10(pk + 1e-9)).toFixed(1), jump: +jump.toFixed(3) }; }
  function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), u = i + k, v = u + len / 2, tr = re[v] * c - im[v] * s, ti = re[v] * s + im[v] * c; re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti; } } }
  const centroid = (d, i0 = 0, n = 8192) => { const re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < n && i0 + i < d.length; i++) re[i] = d[i0 + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / n)); fft(re, im); let P = 0, F = 0, H = 0, H2 = 0;
    for (let b = 1; b < n / 2; b++) { const f = b * sr / n, p = re[b] ** 2 + im[b] ** 2; P += p; F += p * f; if (f > 7000) H += p; if (f > 2000) H2 += p; } return { cent: Math.round(F / P), above2k: +(100 * H2 / P).toFixed(2), above7k: +(100 * H / P).toFixed(2) }; };
  const decay = d => { let pk = 0, at = 0; const b = Math.round(.002 * sr), env = []; for (let i = 0; i + b <= d.length; i += b) { let e = 0; for (let k = 0; k < b; k++) e += d[i + k] ** 2; env.push(e); if (e > pk) { pk = e; at = env.length - 1; } }
    let last = at; for (let i = at; i < env.length; i++) if (env[i] > pk * 1e-3) last = i; return Math.round((last - at) * 2); }; // ms from the peak until it stays 30 dB down
  const edges = d => ({ start: +Math.abs(d[0]).toFixed(4), end: +Math.abs(d[d.length - 1]).toFixed(4) });
  const at = [], R = {}, files = {};
  const here = Z[job.from || 'bA'].probe, P = [[0, here.x, here.z, 0]];
  if (job.steps) { R.steps = []; for (const s of Object.keys(V.surfaces)) { // each surface: its takes measured dry (voices.js), then 8 walking and 8 running steps through the engine in the backrooms
      const a = V.footstep(s, 1, 0, 1, 0), b = V.footstep(s, 2, 0, 1, 0), c = V.footstep(s, 1, 1, 1, 0); let diff = 0, e = 0; for (let i = 0; i < a.length; i++) { diff += (a[i] - b[i]) ** 2; e += a[i] ** 2; }
      const ev = []; for (let k = 0; k < 8; k++) ev.push([.3 + k * .55, eng => eng.foot(s, k & 1, 0, .85 + .1 * Math.random())]); for (let k = 0; k < 8; k++) ev.push([5 + k * .34, eng => eng.foot(s, k & 1, 1, 1.25)]);
      ev.push([0, eng => eng.quiet(true)]);
      const r = await S.render({ secs: 8, path: P, at: ev, bed: false }); files['step-' + s] = wav(r.buf);
      R.steps.push({ surface: s, ...centroid(a, 0, 8192), runCent: centroid(c).cent, decayMs: decay(a), diffTakes: +(db(diff / e)).toFixed(1), ...edges(a), ...stats(r.buf) }); } }
  if (job.doors) { R.doors = []; for (const n of ['door.wood.open', 'door.wood.close', 'door.metal.open', 'door.metal.close', 'splash.small', 'splash.big']) {
      const [k1, k2, k3] = n.split('.'), d = k1 === 'door' ? V.door(k2, k3 === 'open', 1) : V.splash(k2 === 'big' ? 1 : 0, 1);
      const r = await S.render({ secs: n.startsWith('splash') ? 2.5 : 2.2, path: [[0, here.x, here.z, 0]], at: [[0, eng => eng.quiet(true)], [.2, eng => eng.play(n, here.x - 1, here.y - .4, here.z - 2.5, { loud: 1 })]] });
      files[n.replace(/\./g, '-')] = wav(r.buf); R.doors.push({ name: n, ...centroid(d), decayMs: decay(d), ...edges(d), ...stats(r.buf) }); } }
  if (job.places) { R.places = []; const rep = {}; for (const z of Object.values(Z)) if (!rep[z.music ?? z.id] && z.probe) rep[z.music ?? z.id] = z;
    for (const z of Object.values(rep).filter(q => !job.ids || job.ids.includes(q.id))) { const p = [[0, z.probe.x, z.probe.z, 0]];
      const r = await S.render({ secs: 20, path: p }), q = await S.render({ secs: 20, path: p, at: [[0, eng => eng.quiet(true)]] }), m = z.music ? await dev.music.render([[0, z]], 20) : null;
      let sw = 0; const bl = []; for (let t = 2; t + .4 <= 20; t += .1) bl.push(stats(q.buf, t, t + .4).rms); for (let i = 1; i < bl.length; i++) sw = Math.max(sw, Math.abs(bl[i] - bl[i - 1]));
      files['place-' + z.id + '-' + (z.music || 'none')] = wav(r.buf);
      const fx = stats(r.buf, 2, 20), mu = m && stats(m.buf, 4, 20);
      R.places.push({ zone: z.id, music: z.music, fxRms: fx.rms, fxPeak: fx.peak, musicRms: mu?.rms ?? null, fxVsMusic: mu ? +(fx.rms - mu.rms).toFixed(1) : null, stepMomentary: +sw.toFixed(2), nodes: r.nodes, frameMs: +r.frameMs.toFixed(3) }); } }
  if (job.walks) { R.walks = []; const O = dev.openings;
    const route = (a, b) => { const prev = new Map([[a, null]]), q = [a]; while (q.length) { const z = q.shift(); if (z === b) break; for (const o of O) { const n = o.p === z ? o.q : o.q === z ? o.p : null; if (n && !prev.has(n)) { prev.set(n, [z, o]); q.push(n); } } }
      const path = []; for (let z = b; prev.get(z); z = prev.get(z)[0]) path.unshift(prev.get(z)); return path; };
    for (const [a, b] of job.walks) { const A = Z[a], B = Z[b], hops = route(A, B), pts = [[A.probe.x, A.probe.z]];
      for (const [z, o] of hops) { const m = (o.lo + o.hi) / 2, c = z.box, inA = o.ax ? ((c[1] + c[3]) / 2 < o.at ? -1 : 1) : ((c[0] + c[2]) / 2 < o.at ? -1 : 1);
        const P1 = o.ax ? [m, o.at + inA * 3] : [o.at + inA * 3, m], P2 = o.ax ? [m, o.at - inA * 3] : [o.at - inA * 3, m]; pts.push(P1, P2); }
      pts.push([B.probe.x, B.probe.z]); const L = []; let len = 0; for (let i = 0; i < pts.length; i++) { if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(len); }
      const path = pts.map((p, i) => [1 + 18 * L[i] / len, p[0], p[1], Math.atan2(-(pts[Math.min(i + 1, pts.length - 1)][0] - p[0]), -(pts[Math.min(i + 1, pts.length - 1)][1] - p[1])) || 0]); path.unshift([0, ...path[0].slice(1)]);
      const r = await S.render({ secs: 20, path }), q = await S.render({ secs: 20, path, at: [[0, eng => eng.quiet(true)]] }), mx = await S.render({ secs: 20, path, music: true });
      const bl = []; for (let t = 0; t + .4 <= 20; t += .1) bl.push(stats(q.buf, t, t + .4).rms); let st = 0, sAt = 0; for (let i = 21; i < bl.length; i++) { const d = Math.abs(bl[i] - bl[i - 1]); if (d > st) { st = d; sAt = i / 10; } }
      files[`walk-${a}-to-${b}`] = wav(r.buf); files[`walk-${a}-to-${b}-with-music`] = wav(mx.buf);
      R.walks.push({ walk: `${a}>${b}`, via: hops.map(([z, o]) => (o.p === z ? o.q : o.p).id).join('>'), stepMomentary: +st.toFixed(2), at: +(sAt + .2).toFixed(1), startRms: +(bl.slice(10, 20).reduce((s, v) => s + v) / 10).toFixed(1), endRms: +(bl.slice(-10).reduce((s, v) => s + v) / 10).toFixed(1), ...stats(r.buf), mixPeak: stats(mx.buf).peak }); } }
  if (job.space) { // a big splash 3 m to the left, right, in front, behind and 12 m ahead, the listener in the backrooms facing -z; over its first 0.5 s
    const one = async (dx, dz) => { const r = await S.render({ secs: 1.5, path: P, at: [[0, eng => eng.quiet(true)], [.1, eng => eng.play('splash.big', here.x + dx, here.y, here.z + dz, { loud: 1 })]] });
      const i0 = Math.round(.1 * sr), i1 = Math.round(.6 * sr), l = r.buf.getChannelData(0), rr = r.buf.getChannelData(1), m = new Float32Array(l.length); for (let i = 0; i < l.length; i++) m[i] = (l[i] + rr[i]) / 2;
      let el = 0, er = 0; for (let i = i0; i < i1; i++) { el += l[i] ** 2; er += rr[i] ** 2; } return { lr: +db(el / er).toFixed(1), hi2k: centroid(m, i0, 8192).above2k, rms: stats(r.buf, .1, .6).rms }; };
    R.space = { left: await one(-3, 0), right: await one(3, 0), front: await one(0, -3), behind: await one(0, 3), far: await one(0, -12) }; }
  if (job.sheet) { // spectrograms of one walking step per surface and each door: 0-8 kHz, 0.5 s (doors 1.3 s), log magnitude
    const list = [...Object.keys(V.surfaces).map(s => [s, V.footstep(s, 3, 0, 1, 0), .5]), ...Object.keys(V.surfaces).map(s => [s + ' run', V.footstep(s, 3, 1, 1.25, 1), .5]), ...[['wood', 1], ['wood', 0], ['metal', 1], ['metal', 0]].map(([k, o]) => [`door ${k} ${o ? 'open' : 'close'}`, V.door(k, !!o, 1), 1.3]), ['splash small', V.splash(0, 1), 1], ['splash big', V.splash(1, 1), 1.4]];
    const W = 260, H = 150, cols = 6, cv = document.createElement('canvas'); cv.width = cols * W; cv.height = Math.ceil(list.length / cols) * (H + 18); const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
    list.forEach(([name, d, secs], k) => { const x0 = (k % cols) * W, y0 = Math.floor(k / cols) * (H + 18), N = 1024, img = g.createImageData(W - 4, H), hop = secs * sr / (W - 4);
      for (let c = 0; c < W - 4; c++) { const re = new Float64Array(N), im = new Float64Array(N), s0 = Math.round(c * hop); for (let i = 0; i < N; i++) re[i] = (d[s0 + i] || 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / N)); fft(re, im);
        for (let r = 0; r < H; r++) { const bin = Math.round((1 - r / H) * 8000 / (sr / N)), v = Math.max(0, Math.min(1, (db(re[bin] ** 2 + im[bin] ** 2) + 40) / 70)), o = (r * (W - 4) + c) * 4;
          img.data[o] = 255 * Math.min(1, v * 1.6); img.data[o + 1] = 255 * Math.max(0, v * 1.6 - .6); img.data[o + 2] = 255 * Math.max(0, v * 2 - 1.4) + 60 * (1 - v) * (v > .02); img.data[o + 3] = 255; } }
      g.putImageData(img, x0 + 2, y0 + 16); g.fillStyle = '#ddd'; g.font = '12px sans-serif'; g.fillText(`${name}  (${secs} s, 0-8 kHz)`, x0 + 4, y0 + 12); });
    files.sheet = cv.toDataURL('image/png').split(',')[1]; }
  if (job.live) { // the live sound standing in the busiest place, then a frame-cost sample
    const s = S.start(); dev.reset(...job.live); dev.hold = false; await new Promise(r => setTimeout(r, 3000)); const e = s.eng; e.cost.ms = 0; e.cost.n = 0; await new Promise(r => setTimeout(r, 4000));
    R.live = { at: job.live, nodes: e.nodes.live, peakNodes: e.nodes.peak, voices: e.voices(), buses: [...e.buses.values()].filter(b => b.on).map(b => b.z.id), frameMs: +(e.cost.ms / e.cost.n).toFixed(4), frames: e.cost.n, state: s.ac.state }; }
  return { R, files };
}

const jobs = [];
if (only.includes('steps')) jobs.push({ steps: 1 });
if (only.includes('doors')) jobs.push({ doors: 1 });
if (only.includes('places')) jobs.push({ places: 1, ids: arg('ids')?.split(',') });
if (only.includes('walks')) jobs.push({ walks: [['bA', 'pH'], ['u0', 'fD'], ['mL', 'cN']] });
if (only.includes('space')) jobs.push({ space: 1 });
if (only.includes('sheet')) jobs.push({ sheet: 1 });
const all = {};
for (const j of jobs) { const r = run(page, j); if (!r) { console.error('no result for', JSON.stringify(j)); continue; } Object.assign(all, r.R);
  for (const [k, b64] of Object.entries(r.files)) writeFileSync(join(out, k === 'sheet' ? 'spectrograms.png' : k + '.wav'), Buffer.from(b64, 'base64')); }
if (only.includes('live')) { const r = run(page, { live: [-1.4, -12, 0, 0] }); Object.assign(all, r?.R || {}); }
for (const [k, v] of Object.entries(all)) { console.log('== ' + k); if (Array.isArray(v)) console.table(v); else console.log(JSON.stringify(v)); }
console.log('files in', out);
