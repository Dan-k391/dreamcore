// Flicker against a settled twin: node tools/twin.mjs [--port 8200] [--only i,j] [--modes walk,run] [--size 1280x720] [--from -10] [--to 4] [--save dir [--keep k1,k2]] [--dt 4,30]
// Walks through portal end i (its door open) as flicker.mjs does, then draws each frame from `from` to `to` around the crossing again
// from the same eye with all state settled (dev.reset there: zone, lamps chosen and on, shadows redrawn, mood at once; the same clock,
// fov and pose). Head-bob and motion are the same in both, so where they differ state arrives early or late, or the picture is wrong.
// Prints per frame: mean luma difference, % of pixels off by > 12 levels. --save writes game_k.png and twin_k.png.
// --dt a,b: frame times drawn between a and b ms (seeded), not 1/60 s.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), save = arg('save', ''), o = { only: arg('only', '0'), modes: arg('modes', 'walk,run').split(','), from: +arg('from', -10), to: +arg('to', 4), dt: arg('dt', ''), pics: !!save, keep: arg('keep', '').split(',').filter(Boolean).map(Number) };

async function page(o) {
  const B = await import('/js/build.js'), { renderer: r, camera, uTime, composer } = dev, gl = r.getContext();
  const swing = (e, f) => { for (const d of [e.door, e.to.door]) if (d) { d.set(f); d.u = d.to = f; } };
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
  const grab = () => { r.setRenderTarget(null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); const l = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) l[k] = .2126 * px[k * 4] + .7152 * px[k * 4 + 1] + .0722 * px[k * 4 + 2]; return { l, rgb: o.pics ? px.slice() : null }; };
  const png = rgb => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(W, H);
    for (let j = 0; j < H; j++) im.data.set(rgb.subarray((H - 1 - j) * W * 4, (H - j) * W * 4), j * W * 4); for (let k = 3; k < im.data.length; k += 4) im.data[k] = 255; g.putImageData(im, 0, 0); return c.toDataURL('image/png').split(',')[1]; };
  let seed = 1; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const L = await import('/js/lights.js'), P = await import('/js/player.js'), { look } = await import('/js/post.js');
  const settled = () => { // this frame again from the same eye with every fade finished from the game's own state (its lamp hysteresis and look-ahead kept), then the state put back
    const sv = L.lights.map(l => ({ e: l.e, k: l.k, i: l.intensity, p: l.position.clone(), t: l.target.position.clone(), c: l.color.clone(), a: l.angle, d: l.distance })), w = new Map(look.w), p = camera.position;
    const wts = L.weights(p.x, p.z, P.zone); L.relight(p, P.zone, 1, wts, P.ahead); L.relight(p, P.zone, 1, wts, P.ahead); P.mood(wts, 1); composer.render(0); const pic = grab();
    for (const l of L.lights) if (l.e) l.e.light = null;
    L.lights.forEach((l, j) => { const q = sv[j]; if (l.e !== q.e) l.shadow.needsUpdate = r.shadowMap.needsUpdate = true; Object.assign(l, { e: q.e, k: q.k, intensity: q.i, angle: q.a, distance: q.d }); if (q.e) q.e.light = l; l.position.copy(q.p); l.target.position.copy(q.t); l.color.copy(q.c); });
    look.w.clear(); for (const [z, v] of w) look.w.set(z, v); P.mood([], 0); return pic; };
  const out = [];
  for (const i of o.only.split(',').map(Number)) for (const m of o.modes) {
    const e = B.ends[i], a = m === 'graze' ? .6 : 0, L2 = 2.2, dir = [-e.n.x * Math.cos(a) + e.r.x * Math.sin(a), -e.n.z * Math.cos(a) + e.r.z * Math.sin(a)];
    const sx = e.p.x - dir[0] * L2, sz = e.p.z - dir[1] * L2, face = Math.atan2(-dir[0], -dir[1]);
    const yaw = m === 'back' ? face + Math.PI : face, keys = m === 'back' ? ['KeyS'] : m === 'run' ? ['KeyW', 'ShiftLeft'] : m === 'turn' ? ['KeyW', 'ArrowLeft'] : ['KeyW'];
    let cross = -1;
    for (const pass of [0, 1]) { // 0: find the crossing; 1: the same walk (deterministic), its window compared
      for (const f of B.ends) if (f.door) swing(f, 0); swing(e, 1); seed = 7;
      dev.reset(sx, sz, yaw, 0); dev.step(2); keys.forEach(k => dev.key(k, true)); let last = [camera.position.x, camera.position.z];
      for (let f = 0; f < 200; f++) { const dt = o.dt ? (+o.dt.split(',')[0] + rnd() * (o.dt.split(',')[1] - o.dt.split(',')[0])) / 1000 : 1 / 60; dev.step(1, dt);
        const p = camera.position;
        if (!pass) { if (cross < 0 && Math.hypot(p.x - last[0], p.z - last[1]) > 1) cross = f; last = [p.x, p.z]; if (cross >= 0 && f - cross >= o.to) break; continue; }
        if (f - cross < o.from) continue; if (f - cross > o.to) break;
        const g = grab(), tw = settled(); let s = 0, n = 0; for (let j = 0; j < g.l.length; j++) { const d = Math.abs(g.l[j] - tw.l[j]); s += d; if (d > 12) n++; }
        out.push({ end: i, m, k: f - cross, side: +B.side(e, p.x, p.z).toFixed(3), mean: +(s / g.l.length).toFixed(2), pct: +(100 * n / g.l.length).toFixed(2), ...(o.pics && (!o.keep.length || o.keep.includes(f - cross)) ? { game: png(g.rgb), twin: png(tw.rgb) } : {}) }); }
      keys.forEach(k => dev.key(k, false)); if (cross < 0) break; }
    swing(e, 0);
  }
  return out;
}
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const run = a => { try { return execFileSync(process.execPath, a, { encoding: 'utf8', maxBuffer: 1 << 30 }); } catch (x) { return x.stdout; } }; // browse exits 1 on a page error: its report still says what
const res = JSON.parse(run([browse, '--url', `http://127.0.0.1:${port}/?dev&bare#3.8,30,0,0`, '--size', arg('size', '1280x720'), '--wait', '900000', '--eval', `(${page})(${JSON.stringify(o)})`]));
if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
if (save) mkdirSync(save, { recursive: true });
const rows = res.result || [], walks = [...new Set(rows.map(q => q.end + ' ' + q.m))];
for (const w of walks) { const r = rows.filter(q => q.end + ' ' + q.m === w); console.log(`${w.padEnd(9)} k ${r[0].k}..${r.at(-1).k}  mean [${r.map(q => q.mean).join(' ')}]  %>12 [${r.map(q => q.pct).join(' ')}]`); }
for (const q of rows) {
  if (save && q.game) { const b = `${q.end}_${q.m}_${q.k >= 0 ? '+' : ''}${q.k}`; writeFileSync(join(save, `game_${b}.png`), Buffer.from(q.game, 'base64')); writeFileSync(join(save, `twin_${b}.png`), Buffer.from(q.twin, 'base64')); } }
