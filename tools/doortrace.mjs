// Frame times opening a portal door and walking through it and back, on a fresh page (the first time counts):
//   node tools/doortrace.mjs [--port 8200] [--doors 0,6,12,4] [--size 2560x1440] [--runs n] [--phase] [--frames] [--pre js]
// --runs n: n fresh pages per door, each frame's least time of the n (the machine's own hiccups left out)
// Stands 1.3 m in front of end i's door facing it, settles 30 frames, presses E, waits 60, walks W through to 1.5 m past, then S back through.
// Each frame: dev.step(1) at 1/60 s, then one pixel read (the GPU finished): wall ms. Prints median, worst, worst / median, and the frames
// over 1.5 x median with what they did: new programs (prog), new textures (tex), shadow maps drawn in full (full) or from the loose cache (loose),
// the sun's map (sun). --phase adds gl.finish around the shadow and scene draws to split the time (shadows / scene with portals / rest).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), runs = +arg('runs', 1), doors = arg('doors', '0,6,12,4').split(',').map(Number), size = arg('size', '2560x1440');
const ENDS = { 0: [2.55, 34.8, 1.5708], 2: [5.05, 38.4, -1.5708], 4: [2.55, 27.6, 1.5708], 6: [5.05, 27.6, -1.5708], 8: [2.55, 38.4, 1.5708], 10: [2.55, 31.2, 1.5708], 12: [5.05, 24, -1.5708] }; // hallway ends: x, z, ry (n = (sin ry, cos ry))

async function page(o) {
  const B = await import('/js/build.js'), r = dev.renderer, gl = r.getContext(), SM = r.shadowMap, px = new Uint8Array(4), e = B.ends[o.i];
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let cur = null; const sm = SM.render, rr = r.render;
  SM.render = function (ls, s, c) { if (cur && SM.needsUpdate && SM.enabled) { for (const l of ls) if (l.shadow.needsUpdate) l.isDirectionalLight ? cur.sun++ : cur.full++; else if (l.shadow.loose) cur.loose++; }
    if (!o.phase || !cur) return sm.call(this, ls, s, c); gl.finish(); const t = performance.now(); sm.call(this, ls, s, c); gl.finish(); cur.sh += performance.now() - t; };
  r.render = function (s, c) { if (!o.phase || !cur || s !== dev.scene) return rr.call(this, s, c); gl.finish(); const t = performance.now(), sh = cur.sh; rr.call(this, s, c); gl.finish(); cur.sc += performance.now() - t - (cur.sh - sh); };
  dev.hold = true; const out = []; if (o.pre) await eval(o.pre);
  const step = tag => { const p0 = r.info.programs.length, t0 = r.info.memory.textures, g0 = r.info.memory.geometries; cur = { tag, full: 0, loose: 0, sun: 0, sh: 0, sc: 0 };
    const qy = !o.phase && tq && gl.createQuery(); if (qy) gl.beginQuery(tq.TIME_ELAPSED_EXT, qy); const t = performance.now(); dev.step(1); cur.cpu = performance.now() - t; if (qy) gl.endQuery(tq.TIME_ELAPSED_EXT); sync(); cur.ms = performance.now() - t; cur.qy = qy; cur.prog = r.info.programs.length - p0; cur.tex = r.info.memory.textures - t0; cur.geo = r.info.memory.geometries - g0; out.push(cur); cur = null; };
  for (let k = 0; k < 30; k++) step('settle');
  dev.key('KeyE', true); step('E'); dev.key('KeyE', false); for (let k = 0; k < 60; k++) step('swing');
  const d = () => B.side(e, dev.camera.position.x, dev.camera.position.z); // >0 in front of the hallway end; through: in the far space, its own side
  dev.key('KeyW', true); let crossed = -1; for (let k = 0; k < 120; k++) { const y = dev.camera.position.y; step('in'); if (crossed < 0 && Math.abs(dev.camera.position.y - y) > 50 || crossed < 0 && Math.abs(dev.camera.position.x - e.p.x) > 50) crossed = out.length - 1; if (crossed >= 0 && out.length - crossed > 32) break; }
  dev.key('KeyW', false); for (let k = 0; k < 10; k++) step('stop');
  dev.key('KeyS', true); let back = -1; for (let k = 0; k < 120; k++) { const x = dev.camera.position.x; step('out'); if (back < 0 && Math.abs(dev.camera.position.x - x) > 50) back = out.length - 1; if (back >= 0 && out.length - back > 32) break; }
  dev.key('KeyS', false); for (let k = 0; k < 10; k++) step('end');
  for (let k = 0; k < 10; k++) await new Promise(f => requestAnimationFrame(f)); for (const q of out) { q.gpu = q.qy ? gl.getQueryParameter(q.qy, gl.QUERY_RESULT) / 1e6 : 0; delete q.qy; }
  return { out: out.map(q => ({ ...q, gpu: +q.gpu.toFixed(2), cpu: +q.cpu.toFixed(2), ms: +q.ms.toFixed(2), sh: +q.sh.toFixed(2), sc: +q.sc.toFixed(2) })), crossed, back };
}
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
for (const i of doors) { const [x, z, ry] = ENDS[i], sx = x + Math.sin(ry) * 1.3, sz = z + Math.cos(ry) * 1.3;
  let R; for (let n = 0; n < runs; n++) { // the same walk on n fresh pages, each frame's least: what the frame costs without the machine's own hiccups
    const o = execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare#${sx.toFixed(2)},${sz.toFixed(2)},${ry},0`, '--size', size, '--wait', '300000', '--eval', `(${page})(${JSON.stringify({ i, phase: argv.includes("--phase"), pre: arg("pre") })})`], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const res = JSON.parse(o); if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
    if (!R) R = res.result; else R.out.forEach((q, k) => { const b = res.result.out[k]; if (b) for (const f of ['ms', 'gpu', 'cpu', 'sh', 'sc']) q[f] = Math.min(q[f], b[f]); }); }
  const { out, crossed, back } = R, t = out.slice(30).map(q => q.ms), g = out.slice(30).map(q => q.gpu).sort((a, b) => a - b), c = out.slice(30).map(q => q.cpu).sort((a, b) => a - b), med = [...t].sort((a, b) => a - b)[t.length >> 1], worst = Math.max(...t);
  console.log(`door ${i}: median ${med.toFixed(1)} ms, worst ${worst.toFixed(1)} (${(worst / med).toFixed(2)}x), gpu median ${g[g.length >> 1]} worst ${g.at(-1)}, cpu median ${c[c.length >> 1]} worst ${c.at(-1)}, frames ${t.length}, crossed at ${crossed}, back at ${back}`);
  out.forEach((q, k) => { if (k >= 30 && (q.ms > 1.5 * med || argv.includes('--frames'))) console.log(`  ${String(k).padStart(3)} ${q.tag.padEnd(5)} ${String(q.ms).padStart(6)} ms  (gpu ${q.gpu} cpu ${q.cpu})  prog ${q.prog} tex ${q.tex} geo ${q.geo} full ${q.full} loose ${q.loose} sun ${q.sun}${argv.includes('--phase') ? `  shadows ${q.sh} scene ${q.sc}` : ''}`); });
}
