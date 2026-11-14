// Frame cost per viewpoint in tools/views.json, one fresh page each, via tools/browse.mjs:
//   node tools/perf.mjs [--port 8200] [--size 1280x720] [--only name,name] [--json out.json]
// Per view: the median ms of 120 frames, each dev.step(1) followed by a 1-pixel readPixels so the GPU has to finish it
// (CPU and GPU one after the other, so a little above a real frame, which overlaps them); draw calls and triangles of one
// whole frame (every pass); shader programs and textures alive; ms from page start to dev.ready (load).
// Other GPU users swing single readings by 30%: compare A and B by alternating runs, trust only the counts as exact.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), size = arg('size', '1280x720'), only = arg('only')?.split(','), json = arg('json');
const views = JSON.parse(readFileSync(new URL('./views.json', import.meta.url), 'utf8')).filter(v => !only || only.includes(v.name));
if (only && views.length !== only.length) { console.error('unknown view in --only'); process.exit(2); }
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url)), [W, H] = size.split('x').map(Number);
const measure = `(async () => { const c = dev.renderer.domElement;
  for (let i = 0; i < 100 && !(c.width === ${W} && c.height === ${H}); i++) await new Promise(r => setTimeout(r, 50));
  const gl = dev.renderer.getContext(), px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px), t = [];
  dev.hold = true; dev.step(60); sync();
  for (let i = 0; i < 120; i++) { const a = performance.now(); dev.step(1); sync(); t.push(performance.now() - a); }
  t.sort((a, b) => a - b); const n = dev.info();
  return { ms: +t[60].toFixed(2), calls: n.calls, tris: n.triangles, programs: n.programs, textures: n.textures, load: dev.readyAt, zone: dev.state().zone, sky: dev.state().sky }; })()`;
const rows = [];
console.log('view'.padEnd(24), 'ms'.padStart(6), 'calls'.padStart(6), 'tris'.padStart(9), 'progs'.padStart(6), 'texs'.padStart(5), 'load'.padStart(6), ' zone/sky');
for (const v of views) {
  let r;
  try { r = JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev#${v.hash}`, '--size', size, '--eval', measure], { encoding: 'utf8' })).result; }
  catch (e) { console.log(v.name.padEnd(24), 'FAILED', String(e.stdout || e.message).slice(0, 400)); process.exitCode = 1; continue; }
  rows.push({ name: v.name, ...r });
  console.log(v.name.padEnd(24), String(r.ms).padStart(6), String(r.calls).padStart(6), String(r.tris).padStart(9), String(r.programs).padStart(6), String(r.textures).padStart(5), String(r.load).padStart(6), ` ${r.zone}/${r.sky}`);
}
const loads = rows.map(r => r.load).sort((a, b) => a - b);
if (loads.length) console.log(`load to dev.ready: median ${loads[loads.length >> 1]} ms over ${loads.length} pages`);
if (json) writeFileSync(json, JSON.stringify({ size, port, rows }, null, 1));
