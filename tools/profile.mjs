// GPU and CPU cost of a frame, pass by pass, at chosen views (tools/profile.js in the page, through tools/browse.mjs; ?dev&bare):
//   node tools/profile.mjs [--port 8200] [--only name,name] [--size 1280x720[,2560x1440]] [--frames 30] [--waste] [--load n] [--pre js] [--json out.json]
// --pre: JavaScript run in the page once before the views, for an A/B experiment (e.g. --pre "dev.composer.passes[1].enabled = false").
// Default views: the six heaviest and three typical ones of tools/views.json; --only picks others from it. One page load per size.
// GPU ms per row come from EXT_disjoint_timer_query_webgl2 (exact, per frame, median over --frames); nested work (shadow redraws,
// pool pictures, the AO pass's normal render) is its own row and not in its parent's. cpu: the JS submitting that row.
// frame: GPU sum, wall ms with the GPU finished, JS ms of the frame outside the composer, and of the composer.
// --waste: share of main-pass triangles outside the frustum and in meshes with no pixel on screen, grid-chunk counts, overdraw, lamps per pixel.
// --load n: n fresh page loads, the load marks of each (ms from page start).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), sizes = arg('size', '1280x720').split(','), json = arg('json'), frames = +arg('frames', 30), loads = +arg('load', 0);
const all = JSON.parse(readFileSync(new URL('./views.json', import.meta.url), 'utf8'));
const only = (arg('only') || 'night-hall-platform,corridor,arcade,gallery-pool,field,night-hall,hotel-hallway,mall,terrace').split(',');
const views = only.map(n => all.find(v => v.name === n)); if (views.some(v => !v)) { console.error('unknown view in --only'); process.exit(2); }
const here = p => fileURLToPath(new URL(p, import.meta.url)), browse = here('./browse.mjs'), page = readFileSync(here('./profile.js'), 'utf8');
const run = (size, expr, hash = views[0].hash) => { let o; try { o = execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare#${hash}`, '--size', size, '--eval', expr], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { o = e.stdout; }
  const r = JSON.parse(o); if (r.errors.length) throw new Error(r.errors.join('\n')); return r.result; };
const f = (v, n = 6) => String(v).padStart(n), report = { sizes: {} };
for (const size of sizes) {
  const r = run(size, `(() => { const CFG = ${JSON.stringify({ views, frames, waste: argv.includes('--waste'), pre: arg('pre') })};\nreturn (\n${page}\n); })()`); report.sizes[size] = r;
  console.log(`\n== ${r.W}x${r.H} (pixel ratio ${r.pr}) — GPU ms / calls / tris per row, median of ${frames} frames`);
  for (const v of r.views) {
    console.log(`${v.name} [${v.zone}]  frame: gpu ${v.gpu}  wall ${v.wall}  js ${v.cpuFrame}  composer-cpu ${v.cpuComposer}${v.disjoint ? '  DISJOINT ' + v.disjoint : ''}`);
    for (const [l, p] of Object.entries(v.pass).sort((a, b) => b[1].gpu - a[1].gpu)) if (p.busy)
      console.log('  ' + l.padEnd(13), f(p.gpu), 'ms', f(p.calls), 'calls', f((p.tris / 1e6).toFixed(2), 6), 'Mtri', '  cpu', f(p.cpu, 5), p.busy && p.busy < frames ? `  (works in ${p.busy}/${frames} frames: then ${p.busyGpu} ms, ${p.busyCalls} calls, cpu ${p.busyCpu})` : '');
    if (v.shadowsAll) console.log(`  all ${v.shadowsAll.maps} shadow maps redrawn once: ${v.shadowsAll.gpu} ms, ${v.shadowsAll.calls} calls, ${(v.shadowsAll.tris / 1e6).toFixed(2)} Mtri`);
    if (v.waste) { const w = v.waste; console.log(`  pool on screen ${w.poolPx}%;  waste: ${(w.tris / 1e6).toFixed(2)} Mtri in ${w.meshes} meshes; outside frustum ${w.outFrustumPct}%; in meshes with no pixel ${w.inMeshesNoPixelPct}% (${w.meshesNoPixel} meshes); grass ${(w.grass / 1e6).toFixed(2)} Mtri; instanced ${(w.instanced / 1e6).toFixed(2)}`);
      console.log(`  zones drawn with no pixel (zone:tris): ${w.zonesNoPixel.join(' ') || '-'}`);
      console.log(`  chunks (calls/Mtri in view): ${Object.entries(w.chunks).map(([s, c]) => `${s} ${c.calls}/${(c.tris / 1e6).toFixed(2)}`).join('  ')}`);
      console.log(`  overdraw: shaded ${w.shaded.perPx}/px (max ${w.shaded.max}), rasterised ${w.depth.perPx}/px (max ${w.depth.max}); scene pass alone ${w.sceneAlone} ms, with a depth pre-pass ${w.prepass}, flat unlit ${w.flat}; lamps on ${w.lampsOn}, % of pixels reached by 0..n lamps: ${w.lampsPerPx.join(' ')}`); }
  }
}
for (let i = 0; i < loads; i++) { const m = run(sizes[0], `(() => { const r = performance.getEntriesByType('resource'), mk = performance.getEntriesByType('mark'); return { fetched: Math.round(Math.max(...r.map(e => e.responseEnd))), marks: mk.map(e => [e.name.replace('load: ', ''), Math.round(e.startTime)]), lib: dev.lib, mem: dev.texMem() }; })()`, '1.9,20,0,0');
  (report.loads ||= []).push(m); console.log(`load ${i + 1}: fetched ${m.fetched}  ` + m.marks.map(([n, t]) => `${n} ${t}`).join('  ')); }
if (json) writeFileSync(json, JSON.stringify(report, null, 1));
