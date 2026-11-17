// Texture crawl and sharpness: node tools/crawl.mjs [--port 8200] [--only name,name] [--size 1280x720] [--frames 60] [--strip dir --strip-views a,b]
// For each view (tools/views.json names, or the built-in list below) walks forward (W held, 2.85 m/s, about 5 cm a frame) for
// --frames frames with time held (dev.step), and on the luma of every frame measures, in the far band (rows 30-55 % from the top,
// where the far floor and walls are; per view in `band` below) and over the whole frame:
//  crawl: the mean |f(k+1) - 2 f(k) + f(k-1)| per pixel, the frame-to-frame change smooth motion does not explain (aliasing, sparkle);
//  flicker: the same on the far band's 8x8 block means: a region's brightness beating (moire, sparkle), not edges moving;
//  alias: the mean |difference| of those block means from the same walk drawn at twice the size (2x2 supersampled: the truth the
//  blocks should have); alias crawl: the frame-to-frame second difference of that error, the shimmer itself, with motion taken out.
//  (the film grain is turned off for it, through dev.look)
//  sharp: the mean |Laplacian| of the first frame in the far band, the energy of its fine detail (so calm is not bought with blur).
// --strip dir: also saves 8 consecutive frames' far-band crop (centre 50 % wide) of the --strip-views as PNGs, for sheet.py.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), strip = arg('strip', ''), stripViews = arg('strip-views', '').split(',').filter(Boolean);
const std = Object.fromEntries(JSON.parse(readFileSync(new URL('./views.json', import.meta.url))).map(v => [v.name, v.hash]));
const list = { 'gallery-pool': std['gallery-pool'], 'hotel-hallway': std['hotel-hallway'], 'pool-hall': '7.5,-3,0.75,-0.3', 'baths-axis': std['baths-axis'],
  backrooms: std.backrooms, 'car-park': std['car-park'], laundromat: std.laundromat, mall: std.mall };
const only = arg('only', '') ? arg('only').split(',') : Object.keys(list);
// the far field of each view, [x0, x1, y0, y1] as fractions of the frame from the top left (default: the middle, rows 30-55 %)
const band = { 'gallery-pool': [.3, .7, .3, .6], 'hotel-hallway': [.35, .65, .55, .75], 'pool-hall': [.55, .95, .45, .7], 'baths-axis': [.15, .85, .6, .85],
  backrooms: [.3, .9, .5, .65], 'car-park': [.2, .8, .5, .75], laundromat: [.3, .9, .6, .85], mall: [.2, .8, .6, .8] };
const views = only.map(n => ({ name: n, hash: list[n] || std[n], band: band[n] || [.25, .75, .3, .55], strip: !!strip && stripViews.includes(n) }));

async function page(o) {
  const { renderer: r } = dev, gl = r.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
  const luma = () => { r.setRenderTarget(null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); const g = new Float32Array(W * H);
    for (let i = 0, k = 0; i < W * H; i++, k += 4) g[i] = .2126 * px[k] + .7152 * px[k + 1] + .0722 * px[k + 2]; return g; };
  let x0, x1, y0, y1;
  const crop = () => { const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0; c.getContext('2d').drawImage(r.domElement, x0, H - y1, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0); return c.toDataURL('image/png'); };
  dev.look.set({ all: { 'grade.grain': 0 } }); // the film grain changes every frame: it would be counted as crawl
  const out = [];
  for (const v of o.views) {
    x0 = Math.floor(W * v.band[0] / o.bs) * o.bs; x1 = Math.floor(W * v.band[1] / o.bs) * o.bs; y0 = Math.floor(H * (1 - v.band[3]) / o.bs) * o.bs; y1 = Math.floor(H * (1 - v.band[2]) / o.bs) * o.bs; // gl rows run bottom up
    const [x, z, yaw, pitch] = v.hash.split(',').map(Number); dev.hold = true; dev.reset(x, z, yaw, pitch); dev.step(30);
    dev.key('KeyW', true); dev.step(20); // up to walking speed
    let a = luma(), b, cF = 0, cA = 0, n = 0, sh = 0, fl = 0; const pics = [], S = o.bs, BW = ((x1 - x0) / S) | 0, B0 = (y0 / S) | 0, B1 = (y1 / S) | 0, ser = [];
    const blk = g => { const m = new Float32Array(BW * (B1 - B0)); for (let j = B0 * S; j < B1 * S; j++) for (let i = 0; i < BW * S; i++) m[(((j / S) | 0) - B0) * BW + ((i / S) | 0)] += g[j * W + x0 + i] / (S * S); ser.push(Array.from(m, q => Math.round(q * 100) / 100)); return m; };
    let ma = blk(a), mb;
    for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) { const p = j * W + i; sh += Math.abs(4 * a[p] - a[p - 1] - a[p + 1] - a[p - W] - a[p + W]); }
    sh /= (x1 - x0) * (y1 - y0);
    dev.step(1); b = luma(); mb = blk(b);
    for (let f = 0; f < o.frames; f++) { dev.step(1); if (v.strip && f < 8) pics.push(crop()); const c = luma(); let sF = 0, sA = 0;
      for (let p = 0; p < W * H; p++) { const d = Math.abs(c[p] - 2 * b[p] + a[p]); sA += d; const j = (p / W) | 0, i = p - j * W; if (j >= y0 && j < y1 && i >= x0 && i < x1) sF += d; }
      const mc = blk(c); let sB = 0; for (let k = 0; k < mc.length; k++) sB += Math.abs(mc[k] - 2 * mb[k] + ma[k]); fl += sB / mc.length; ma = mb; mb = mc;
      cF += sF / ((x1 - x0) * (y1 - y0)); cA += sA / (W * H); n++; a = b; b = c; }
    dev.key('KeyW', false);
    out.push({ name: v.name, crawlFar: +(cF / n).toFixed(3), crawlAll: +(cA / n).toFixed(3), flick: +(fl / n).toFixed(3), sharpFar: +sh.toFixed(3), pics, ser });
  }
  return out;
}
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url)), [w, h] = arg('size', '1280x720').split('x').map(Number);
const run = (k, pics) => JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare#3.8,30,0,0`, '--size', `${w * k}x${h * k}`, '--wait', '900000',
  '--eval', `(${page})(${JSON.stringify({ views: views.map(v => ({ ...v, strip: pics && v.strip })), frames: +arg('frames', 60), bs: 8 * k })})`], { encoding: 'utf8', maxBuffer: 1 << 29 }));
const res = run(1, true), ref = run(2, false); // ref: the same walk at twice the size, its 16 px blocks the supersampled truth of the 8 px ones
for (const r of [res, ref]) if (r.errors?.length) console.log('page errors:', r.errors.slice(0, 3));
for (const [vi, q] of (res.result || []).entries()) {
  const R = ref.result[vi].ser, A = q.ser, d = A.map((f, k) => f.map((x, j) => x - R[k][j])); let al = 0, ac = 0, n = 0;
  for (let k = 0; k < d.length; k++) for (let j = 0; j < d[k].length; j++) { al += Math.abs(d[k][j]); if (k > 1) { ac += Math.abs(d[k][j] - 2 * d[k - 1][j] + d[k - 2][j]); n++; } }
  q.alias = al / (d.length * d[0].length); q.acrawl = ac / n;
  console.log(`${q.name.padEnd(14)} alias ${q.alias.toFixed(3).padStart(6)}  alias crawl ${q.acrawl.toFixed(3).padStart(6)}  flicker ${q.flick.toFixed(3).padStart(6)}  crawl far ${q.crawlFar.toFixed(3).padStart(7)}  sharp far ${q.sharpFar.toFixed(3).padStart(7)}`);
  if (q.pics.length) { mkdirSync(strip, { recursive: true }); q.pics.forEach((p, i) => writeFileSync(`${strip}/${q.name}-${i}.png`, Buffer.from(p.split(',')[1], 'base64'))); }
}
