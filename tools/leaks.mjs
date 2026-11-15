// Light leaks: a shadow map that lacks a wall lets its light through it. Run on the real game (?dev&bare) through browse.mjs:
//   node tools/leaks.mjs [--port 8200] [--fast] [--every n] [--only id,id] [--json out.json]
// Along the walk list (tools/walk.mjs), in order, the player is moved to each eye point and the game runs a few frames there (the
// shared lamps fade and move, their shadow maps are redrawn as the game redraws them). Then four views (along the walk, behind, left,
// right, 160 x 90, linear HDR) are drawn as they are, and again with every shadow map (the nine lamps', the sun's) drawn afresh with
// every layer on, into spare maps so the walk goes on with the game's own. A pixel lit brighter as is than afresh (by 0.05 and 25%)
// is light that a fresh map stops: a leak. A view counts if over 0.2% of it leaks. For the first leaks in each place, the light to
// blame (the one whose fresh map alone removes most of it). --every n: every nth point (default 4).
// --fast: the cause instead of its look, in seconds: standing in the middle of each zone, every shadow map drawn as the game draws it
// is read back and compared with the same map drawn with every layer on; any texel that differs lacks a caster (tools/test.mjs runs this).
// Exit code 1 if anything leaks.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { walkList } from './walk.mjs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), opts = { fast: argv.includes('--fast'), only: arg('only', ''), every: +arg('every', 4) };

async function page(o) {
  const THREE = await import('three'), B = await import('/js/build.js'), S = await import('/js/sky.js'), L = await import('/js/lights.js');
  const { scene, renderer: r, zones, camera } = dev, zl = Object.values(zones), SM = r.shadowMap, t0 = performance.now();
  const zoneAt = (x, z) => zl.find(q => x > q.box[0] && x < q.box[2] && z > q.box[1] && z < q.box[3])?.id || '-';
  if (o.fast) { // the cause itself: from each zone's middle, every shadow map drawn the game's way must match the same map drawn with every layer on
    const ls = [...L.lights, S.sun], found = [], hook = scene.onBeforeRender;
    const maps = (all) => { ls.forEach(l => l.shadow.needsUpdate = true); SM.needsUpdate = true; if (all) { scene.onBeforeRender = () => {}; camera.layers.enableAll(); }
      r.render(scene, camera); scene.onBeforeRender = hook;
      return ls.map(l => { const m = l.shadow.map, a = new Uint8Array(m.width * m.height * 4); r.readRenderTargetPixels(m, 0, 0, m.width, m.height, a); return a; }); };
    for (const q of zl) { if (o.only && !o.only.split(',').includes(q.id)) continue;
      dev.reset((q.box[0] + q.box[2]) / 2, (q.box[1] + q.box[3]) / 2); dev.step(1);
      const got = maps(false), ref = maps(true), bad = got.map((g, i) => { let n = 0; for (let k = 0; k < g.length; k += 4) if (g[k] !== ref[i][k] || g[k + 1] !== ref[i][k + 1]) n++; return n; });
      if (bad.some(n => n)) found.push({ at: q.id, n: 1, eg: [`texels missing a caster: ${bad.map((n, i) => n ? `${i === 9 ? 'sun' : 'lamp ' + i} ${n}` : '').filter(Boolean).join(', ')}`] }); }
    return { points: zl.length, secs: +((performance.now() - t0) / 1000).toFixed(1), worst: 0, found };
  }
  const { views } = walkList(B, zl, { fast: o.fast, only: o.only }), pts = views.filter((v, i) => i % o.every === 0 && v.ys.length);
  const W = 160, H = 90, rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType }), ls = [...L.lights, S.sun], spare = ls.map(() => null);
  const grab = () => { r.setRenderTarget(rt); r.render(scene, camera); r.setRenderTarget(null); const a = new Float32Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, a); return a; };
  const yaws = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
  const shoot = (fresh) => { // the four views; fresh: the lights (indices) whose maps are drawn afresh, every layer on, into spares
    const saved = ls.map(l => l.shadow.map), orig = SM.render;
    if (fresh.length) { for (const i of fresh) { ls[i].shadow.map = spare[i]; ls[i].shadow.needsUpdate = true; } SM.needsUpdate = true;
      SM.render = function (...a) { const m = camera.layers.mask; camera.layers.enableAll(); orig.apply(this, a); camera.layers.mask = m; }; }
    const q = camera.quaternion.clone(), e = new THREE.Euler().setFromQuaternion(q, 'YXZ'), out = [];
    for (const y of yaws) { camera.rotation.set(0, e.y + y, 0, 'YXZ'); camera.updateMatrixWorld(); out.push(grab()); }
    camera.quaternion.copy(q); camera.updateMatrixWorld();
    if (fresh.length) { SM.render = orig; for (const i of fresh) spare[i] = ls[i].shadow.map; ls.forEach((l, i) => l.shadow.map = saved[i]); }
    return out;
  };
  const lum = (a, i) => .2126 * a[i] + .7152 * a[i + 1] + .0722 * a[i + 2];
  const leakPx = (A, Bf) => { let n = 0; for (let i = 0; i < A.length; i += 4) { const a = lum(A, i), b = lum(Bf, i); if (a - b > .05 && a - b > .25 * b) n++; } return n; };
  const found = new Map(); let n = 0, worst = 0;
  for (const v of pts) {
    dev.go(v.x, v.z, v.yaw, [], 0); n++; // teleport and settle (18 frames, 0.9 s): the lamps fade over and move as when walking in
    const A = shoot([]), Bv = shoot(ls.map((l, i) => i)), px = A.map((a, k) => leakPx(a, Bv[k]));
    const k = px.indexOf(Math.max(...px)), frac = px[k] / (W * H); worst = Math.max(worst, frac);
    if (frac > .002) { const at = zoneAt(v.x, v.z), f = found.get(at) || { at, n: 0, eg: [] }; f.n++;
      if (f.eg.length < 3) { // which light: the one whose fresh map alone removes most of the leak in that view
        const by = ls.map((l, i) => { const b = shoot([i]); return leakPx(b[k], Bv[k]); }), best = by.indexOf(Math.min(...by)), l = ls[best];
        f.eg.push(`${v.x.toFixed(1)},${v.z.toFixed(1)} yaw ${(v.yaw + yaws[k]).toFixed(2)} ${(frac * 100).toFixed(1)}% ${best === 9 ? 'sun' : `lamp ${best} at ${l.position.toArray().map(c => c.toFixed(1))} (${zoneAt(l.position.x, l.position.z)})`} leaves ${by[best]} px`); }
      found.set(at, f); }
  }
  return { points: n, secs: +((performance.now() - t0) / 1000).toFixed(1), worst: +(worst * 100).toFixed(2), found: [...found.values()] };
}

const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url)), src = `((walkList) => (${page})(${JSON.stringify(opts)}))(${walkList})`;
let res;
try { res = JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare#1.9,20,0,0`, '--size', '320x180', '--wait', '3600000', '--eval', src], { encoding: 'utf8', maxBuffer: 1 << 28 })); }
catch (e) { try { res = JSON.parse(e.stdout); } catch { console.log(String(e.stderr || e.message).slice(0, 2000)); process.exit(2); } }
if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
const R = res.result || {}, f = R.found || [], tot = f.reduce((s, p) => s + p.n, 0);
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(R, null, 1));
console.log(`leaks: ${R.points} points in ${R.secs} s, worst view ${R.worst}% leaking, ${tot} found${f.length ? ' in ' + f.map(p => `${p.at}(${p.n})`).join(' ') : ''}`);
for (const p of f) console.log(`  ${p.at}: ${p.eg.join(' | ')}`);
process.exit(tot || !R.points ? 1 : 0);
