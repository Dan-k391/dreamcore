// Photograph every viewpoint in tools/views.json: one 1280x720 PNG per view, named <view>.png, via tools/browse.mjs.
//   node tools/shots.mjs <outDir> [--port 8200] [--only name,name] [--views file.json] [--size WxH]
// --views: another list, same shape [{name, hash}] plus an optional "eval": JavaScript run in the page after the view is set up, before the photo.
// Each view loads ?dev#x,z,yaw,pitch, freezes the clock (dev.hold), resets shader time and runs the same 90 frames at 1/60 s,
// so two runs of the same code give the same picture up to film grain and GPU noise.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = argv[0], port = arg('port', '8200'), only = arg('only')?.split(','), [W, H] = arg('size', '1280x720').split('x').map(Number);
if (!(W > 0 && H > 0)) { console.error('--size must be WxH'); process.exit(2); }
if (!out || out.startsWith('--')) { console.error('usage: node tools/shots.mjs <outDir> [--port 8200] [--only name,name] [--views file.json] [--size WxH]'); process.exit(2); }
const views = JSON.parse(readFileSync(arg('views') ? resolve(arg('views')) : new URL('./views.json', import.meta.url), 'utf8')).filter(v => !only || only.includes(v.name));
if (only && views.length !== only.length) { console.error('unknown view in --only'); process.exit(2); }
mkdirSync(out, { recursive: true });

const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const shoot = v => new Promise(done => {
  const p = spawn(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev#${v.hash}`, '--shot', join(out, v.name + '.png'), '--size', `${W}x${H}`,
    // the headless window can reach its final size late: wait until the page and canvas are 1280x720, draw, and fail (then retry) if it changed meanwhile
    '--eval', `(async () => { const c = dev.renderer.domElement, size = () => c.width === ${W} && c.height === ${H} && innerWidth === ${W} && innerHeight === ${H};
      for (let i = 0; i < 100 && !size(); i++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      dev.hold = true; dev.uTime.value = 0; dev.step(90, 1 / 60);
      ${v.eval ? `await (async () => { ${v.eval} })(); dev.step(3, 1 / 60);` : ''}
      await new Promise(r => requestAnimationFrame(r));
      if (!size()) throw new Error('canvas is ' + c.width + 'x' + c.height + ', window ' + innerWidth + 'x' + innerHeight); return true; })()`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
  p.on('close', code => { const bad = !code && wrapped(join(out, v.name + '.png')); if (bad) { code = 1; log += bad + '\n'; }
    // every failure's log is printed, also one that is retried: a real error that shows only now and then must still be seen
    console.log(`${!code ? 'ok  ' : last ? 'FAIL' : 'RETRY'} ${v.name}${code ? '\n' + log : ''}`); done(code); });
});
// The browser's output surface is sometimes smaller than the page (seen: 1250x625 of 1280x720) and the capture repeats it
// to fill the picture, while the page reports the right size. Catch it in the PNG: an exact repeat of the first 8 columns
// (or rows) further on does not happen in a real frame, which has film grain everywhere.
function wrapped(file) {
  const b = readFileSync(file), w = b.readUInt32BE(16), h = b.readUInt32BE(20), bpp = { 2: 3, 6: 4 }[b[25]];
  if (b[24] !== 8 || !bpp || b[28]) return `unexpected PNG format in ${file}`;
  if (w !== W || h !== H) return `picture is ${w}x${h}`;
  const idat = []; for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) if (b.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + b.readUInt32BE(o)));
  const z = inflateSync(Buffer.concat(idat)), row = w * bpp, px = Buffer.alloc(row * h); // undo the PNG row filters
  for (let y = 0; y < h; y++) { const f = z[y * (row + 1)], s = y * (row + 1) + 1, d = y * row;
    for (let i = 0; i < row; i++) { const a = i >= bpp ? px[d + i - bpp] : 0, u = y ? px[d + i - row] : 0, c = i >= bpp && y ? px[d + i - row - bpp] : 0;
      const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c);
      px[d + i] = z[s + i] + [0, a, u, (a + u) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? u : c][f]; } }
  const cols = sw => { for (let y = 0; y < h; y++) if (px.compare(px, y * row, y * row + 8 * bpp, y * row + sw * bpp, y * row + (sw + 8) * bpp)) return false; return true; };
  const rows = sh => !px.compare(px, 0, 8 * row, sh * row, (sh + 8) * row);
  for (let sw = w >> 1; sw <= w - 8; sw++) if (cols(sw)) return `picture repeats from x = ${sw}: the capture surface was too small`;
  for (let sh = h >> 1; sh <= h - 8; sh++) if (rows(sh)) return `picture repeats from y = ${sh}: the capture surface was too small`;
  return false;
}let last = false, failed = [];
for (let i = 0; i < views.length; i += 3) { const batch = views.slice(i, i + 3), codes = await Promise.all(batch.map(shoot)); failed.push(...batch.filter((v, k) => codes[k])); }
// python's http.server refuses connections when three browsers fetch every module at once: retry those views one at a time
last = true; const retry = failed; failed = [];
for (const v of retry) if (await shoot(v)) failed.push(v);
process.exit(failed.length ? 1 : 0);
