// Lamps around a door: node tools/probe.mjs [--port 8213] [--only lobby38,baths24] [--back] [--open]
// For each door: stands 6 m down the hallway (10 m with --open, the door already open), strafes to it, presses E (not with --open),
// walks through, and lists lamps with brightness k < 1 by zone (* out of view: may snap) at -30 -10 0 +20 +50 frames from the crossing; farOn0: the entered
// zone's lamps fully on at the crossing; jump: the largest change of k in one frame of a lamp in view; low: frames from -10 to +30 where a lamp of the entered zone
// the game wants (relight.want) is below 1 (short: the first such).
// --shots dir: a picture every 5 frames of each walk in, from E to 60 frames past the crossing (dir/<door>_<k>.png, k from the crossing).
// --back: then turns round and walks out again, measured the same way.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const shots = arg('shots', ''), o = { pics: !!shots, only: arg('only', ''), back: argv.includes('--back'), open: argv.includes('--open') };
async function page(o) {
  const L = await import('/js/lights.js'), { lights } = L, B = await import('/js/build.js'); dev.hold = true; const out = {}, pics = {};
  const r = dev.renderer, gl = r.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
  const png = () => { r.setRenderTarget(null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(W, H);
    for (let j = 0; j < H; j++) im.data.set(px.subarray((H - 1 - j) * W * 4, (H - j) * W * 4), j * W * 4); for (let k = 3; k < im.data.length; k += 4) im.data[k] = 255; g.putImageData(im, 0, 0); return c.toDataURL('image/png').split(',')[1]; };
  const DOORS = [['lobby38', 38.4, 1.5708], ['vest34', 34.8, 1.5708], ['gal27', 27.6, 1.5708], ['baths24', 24.2, -1.5708]].filter(d => !o.only || o.only.split(',').includes(d[0]));
  const walk = (keys, name) => { const rec = [], wnt = [], zs = dev.state().zone; let cross = -1;
    keys.forEach(k => dev.key(k, true));
    for (let i = 0; i < 300; i++) { dev.step(1); const s = dev.state(); if (cross < 0 && s.zone !== zs) cross = i; wnt.push(L.relight.want.map(e => [e.zone.id, e.light ? e.light.k : 0])); if (o.pics && !name.endsWith('<') && i % 5 === 0) pics[name + '@' + i] = png(); rec.push(lights.map(l => [l.e ? l.e.zone.id : '-', +l.k.toFixed(2), !l.hid])); if (cross >= 0 && i > cross + 60) break; }
    keys.forEach(k => dev.key(k, false));
    const far = dev.state().zone, at = i => rec[i] ? rec[i].filter(a => a[1] < 1).map(a => a.slice(0, 2).join(':') + (a[2] ? '' : '*')).join(' ') : '';
    let low = 0, short = ''; for (let i = Math.max(0, cross - 10); i <= cross + 30 && i < rec.length; i++) { const d = wnt[i].filter(a => a[0] === far && a[1] < 1); if (d.length) { low++; short ||= `${i - cross}: ${d.map(a => a[1].toFixed(2)).join(' ')}`; } }
    let jump = 0; for (let i = 1; i < rec.length; i++) rec[i].forEach((a, j) => { if (a[0] === rec[i - 1][j][0] && a[2]) jump = Math.max(jump, Math.abs(a[1] - rec[i - 1][j][1])); });
    if (o.pics) for (const k of Object.keys(pics)) if (k.startsWith(name + '@')) { const i = +k.split('@')[1]; if (i > cross + 60) delete pics[k]; else { pics[name + '_' + (i - cross)] = pics[k]; delete pics[k]; } }
    out[name] = { cross, far, m30: at(cross - 30), m10: at(cross - 10), c0: at(cross), p20: at(cross + 20), p50: at(cross + 50), farOn0: rec[cross]?.filter(a => a[0] === far && a[1] === 1).length, low, short, jump: +jump.toFixed(2) }; };
  for (const [name, z1, yaw] of DOORS) {
    const x = 3.8, z0 = z1 + (o.open ? 10 : 6);
    const end = B.ends.filter(e => e.door && (e.p.x < x) === (yaw > 0)).sort((a, b) => Math.hypot(a.p.x - x, a.p.z - z1) - Math.hypot(b.p.x - x, b.p.z - z1))[0];
    for (const e of B.ends) for (const d of [e.door]) if (d) { d.set(0); d.u = d.to = 0; }
    if (o.open) for (const d of [end?.door, end?.to.door]) if (d) { d.set(1); d.u = d.to = 1; }
    dev.reset(x, z0, yaw); dev.step(120); const key = yaw > 0 ? 'KeyD' : 'KeyA'; dev.key(key, true); let n = 0;
    while (dev.state().z > z1 && n++ < 900) dev.step(1); dev.key(key, false);
    if (!o.open) { dev.key('KeyE', true); dev.step(1); dev.key('KeyE', false); }
    walk(['KeyW'], name);
    if (o.back) { dev.step(30); walk(['KeyS'], name + '<'); }
  }
  return JSON.stringify({ out, pics });
}
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const run = a => { try { return execFileSync(process.execPath, a, { encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (x) { return x.stdout; } };
const res = JSON.parse(run([browse, '--url', `http://127.0.0.1:${arg('port', '8213')}/?dev&bare#3.8,40,1.5708,0`, '--wait', '300000', '--size', arg('size', '640x360'), '--eval', `(${page})(${JSON.stringify(o)})`]));
if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
const { out: r = {}, pics = {} } = JSON.parse(res.result || '{}');
if (shots) { mkdirSync(shots, { recursive: true }); for (const [k, b] of Object.entries(pics)) writeFileSync(join(shots, `${k.replace(/_(-?\d+)$/, (m, n) => '_' + (+n >= 0 ? '+' : '-') + String(Math.abs(n)).padStart(3, '0'))}.png`), Buffer.from(b, 'base64')); }
for (const [k, v] of Object.entries(r)) console.log(k.padEnd(9), JSON.stringify(v));
process.exitCode = Object.values(r).some(v => v.low) ? 1 : 0;
