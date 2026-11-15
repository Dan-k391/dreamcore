// Pool pictures skipped or cut (js/water.js) must never show. Along the walk list (tools/walk.mjs), every game frame is drawn again at
// once with waterViews.cull off (every picture, uncut) and the two are compared pixel by pixel; then both pictures are filled with
// magenta, so a picture the next frame skips or cuts and still samples shows as magenta, not as last frame's near-copy.
//   node tools/pool-skip.mjs [--port 8200] [--only id,id] [--halls] [--size 640x360]
// Each opening next to a zone a pool is drawn from is run through at full speed (W + Shift, 3 m before to 3 m past) both ways, the
// second way jumping; at each opening into a pool's own room the view also spins (0.12 rad a frame) and flicks round (pi in one frame)
// from 1.5 m outside. --halls adds every such zone's centre line, run end to end. Each frame waits for the next animation frame, as in
// the game, so occlusion results arrive. A frame differs when any pixel's channel changes by more than 2.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { walkList } from './walk.mjs';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), size = arg('size', '640x360'), opts = { only: arg('only', ''), halls: argv.includes('--halls') };

async function page(o) {
  const B = await import('/js/build.js'), { ponds, waterViews } = await import('/js/water.js'), { composer } = await import('/js/post.js');
  const { camera, renderer: r, zones } = dev, gl = r.getContext(), zl = Object.values(zones);
  const UP = new dev.THREE.Vector3(0, 1, 0), sees = new Set(ponds.flatMap(w => w.seen)), own = new Set(ponds.map(w => w.zone.id)), t0 = performance.now();
  const face = (dx, dz) => Math.atan2(-dx, -dz); // yaw that looks along (dx, dz)
  const paths = [];
  for (const w of walkList(B, zl, { only: o.only }).walks) {
    if (w.kind === 'door' && (sees.has(w.a) || sees.has(w.b))) {
      const at = s => w.ax ? [w.c, w.at + s] : [w.at + s, w.c], d = w.ax ? [0, 1] : [1, 0];
      for (const k of [1, -1]) paths.push({ name: `${w.a}|${w.b} ${k > 0 ? '>' : '<'}`, at: at(-3 * k), yaw: face(d[0] * k, d[1] * k), keys: k > 0 ? ['KeyW', 'ShiftLeft'] : ['KeyW', 'ShiftLeft', 'Space'], n: 70 });
      for (const k of [1, -1]) if (own.has(k > 0 ? w.b : w.a)) { // outside a pool room's opening, facing away, then turning
        paths.push({ name: `${w.a}|${w.b} spin`, at: at(-1.5 * k), yaw: face(-d[0] * k, -d[1] * k), keys: [], n: 60, turn: () => .12 });
        paths.push({ name: `${w.a}|${w.b} flick`, at: at(-1.5 * k), yaw: face(-d[0] * k, -d[1] * k), keys: [], n: 20, turn: i => i === 8 ? Math.PI : 0 });
      }
    }
    if (w.kind === 'hall' && o.halls && sees.has(w.a)) { const [x1, z1, x2, z2] = zones[w.a].box, X = x2 - x1 >= z2 - z1, len = X ? x2 - x1 : z2 - z1;
      paths.push({ name: `${w.a} hall`, at: X ? [x1 + .3, (z1 + z2) / 2] : [(x1 + x2) / 2, z1 + .3], yaw: X ? face(1, 0) : face(0, 1), keys: ['KeyW', 'ShiftLeft'], n: Math.min(400, Math.round(len / .1) + 20) }); }
  }
  const [W, H] = [gl.drawingBufferWidth, gl.drawingBufferHeight], a = new Uint8Array(W * H * 4), b = new Uint8Array(a.length);
  const pair = [ponds[0].mirror.getRenderTarget(), ponds[0].lens.getRenderTarget()], magenta = new dev.THREE.Color(1, 0, 1);
  const poison = () => { const c = r.getClearColor(new dev.THREE.Color()), al = r.getClearAlpha(); r.setClearColor(magenta, 1);
    for (const t of pair) { const s = t.scissorTest; t.scissorTest = false; r.setRenderTarget(t); r.clear(); t.scissorTest = s; } r.setRenderTarget(null); r.setClearColor(c, al); };
  let captures = 0; const draw = r.render; r.render = function (s, c) { if (s === dev.scene && c !== camera) captures++; return draw.call(this, s, c); };
  let frames = 0, skipped = 0; const bad = [];
  try { for (const p of paths) {
    dev.reset(p.at[0], p.at[1], p.yaw); for (const k of p.keys) dev.key(k, true); poison();
    for (let i = 0; i < p.n; i++) {
      if (p.turn) camera.rotateOnWorldAxis(UP, p.turn(i));
      captures = 0; dev.step(1); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a); const c = captures; // the game's frame
      waterViews.cull = false; captures = 0; composer.render(0); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); waterViews.cull = true; // the same, every picture whole
      let m = 0, n = 0; for (let j = 0; j < a.length; j++) { const d = Math.abs(a[j] - b[j]); if (d > m) m = d; if (d > 2) n++; }
      frames++; if (c < captures) skipped++;
      if (m > 2) { const q = bad.find(q => q.name === p.name) || bad[bad.push({ name: p.name, frames: [], max: 0, px: 0 }) - 1]; q.frames.push(i + (c < captures ? '*' : '')); q.max = Math.max(q.max, m); q.px = Math.max(q.px, n); }
      poison(); await new Promise(g => requestAnimationFrame(g));
    }
    for (const k of p.keys) dev.key(k, false);
  } } finally { r.render = draw; waterViews.cull = true; }
  return { paths: paths.length, frames, skipped, bad, secs: +((performance.now() - t0) / 1000).toFixed(1) };
}

let res;
try { res = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./browse.mjs', import.meta.url)), '--url', `http://127.0.0.1:${port}/?dev&bare#1.9,20,0,0`, '--size', size, '--wait', '7200000',
  '--eval', `((walkList) => (${page})(${JSON.stringify(opts)}))(${walkList})`], { encoding: 'utf8', maxBuffer: 1 << 28 })); }
catch (e) { try { res = JSON.parse(e.stdout); } catch { console.log(String(e.stderr || e.message).slice(0, 2000)); process.exit(2); } }
if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
const R = res.result || {}, bad = R.bad || [];
console.log(`${R.paths} paths, ${R.frames} frames (${R.skipped} with a picture skipped) in ${R.secs} s: ${bad.reduce((n, q) => n + q.frames.length, 0)} differ`);
for (const q of bad) console.log(`  ${q.name}: frames ${q.frames.join(' ')} (largest channel change ${q.max}, up to ${q.px} values; * pictures skipped)`);
process.exit(R.frames && !bad.length && !res.errors?.length ? 0 : 1);
