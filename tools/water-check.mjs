// The water's two pictures measured against direct renders (dev.waterCheck in js/dev.js), surface flat and time frozen:
// the lens picture against the scene drawn with the water hidden, the mirror against the truly mirrored camera's render.
// Per view: share of the frame that is water, mean difference (0-255) over the water and the seam score (the largest row-to-row
// jump inside the water that the direct render does not have) for each. --img <dir> also saves the four pictures per view.
//   node tools/water-check.mjs [--port 8200] [--only a,b] [--img dir]
// Views: tools/water-views.json, [name, x, z, yaw, pitch, lift].
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const port = arg('port', '8200'), only = arg('only'), img = arg('img');
const views = JSON.parse(readFileSync(new URL('./water-views.json', import.meta.url), 'utf8')).filter(v => !only || only.split(',').includes(v[0]));
const f = join(tmpdir(), `water-check-${process.pid}.js`), result = {};
for (let i = 0; i < views.length; i += 6) { // six views a page load, so no load runs past browse's time limit
  writeFileSync(f, `(async () => { const out = {}; for (const [n, x, z, yaw, pitch, lift] of ${JSON.stringify(views.slice(i, i + 6))}) out[n] = dev.waterCheck(x, z, yaw, pitch, lift, ${!!img}); return out; })()`);
  let r; try { r = JSON.parse(execFileSync('node', [fileURLToPath(new URL('./browse.mjs', import.meta.url)), '--url', `http://127.0.0.1:${port}/?dev&bare`, '--eval-file', f, '--wait', '600000'], { encoding: 'utf8', maxBuffer: 1 << 30 })); }
  catch (e) { r = JSON.parse(e.stdout || '{}'); }
  if (r.errors?.length) console.log('errors', JSON.stringify(r.errors).slice(0, 2000));
  Object.assign(result, r.result);
}
unlinkSync(f);
console.log('view                      water  lens mean seam(row)   mirror mean seam(row)');
for (const [n, v] of Object.entries(result)) {
  console.log(`${n.padEnd(25)} ${v.water.toFixed(2).padStart(5)}  ${String(v.lens.mean).padStart(9)} ${String(v.lens.seam).padStart(5)}(${v.lens.row})  ${String(v.mirror.mean).padStart(11)} ${String(v.mirror.seam).padStart(5)}(${v.mirror.row})`);
  if (img && v.imgs) { mkdirSync(img, { recursive: true }); for (const [k, u] of Object.entries(v.imgs)) writeFileSync(join(img, `${n}-${k}.png`), Buffer.from(u.split(',')[1], 'base64')); }
}
