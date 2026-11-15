// The shared lamp pool, relighting as you move, and the ambient bakes.
import * as THREE from 'three';
import { renderer, scene, camera, V, zones, inR } from './core.js';
import { seaMat } from './mat.js';
import { emitters, colliders, floorH, flats, warps } from './build.js';
import { setSky } from './sky.js';
import { ponds, ripple } from './water.js';
import { libBaked } from './level.js';

// lamps: nine shadow-casting spotlights are shared by every light fixture in the level and follow the player from
// fixture to fixture, fading out before they move. More fixtures cost nothing; the world can grow without more lights.
const lights = Array.from({ length: 9 }, () => {
  const l = new THREE.SpotLight(0xffffff, 0, 16, 1.45, 1, 2);
  l.castShadow = true; l.shadow.mapSize.setScalar(1024); l.shadow.bias = -.001; l.shadow.normalBias = .03; l.shadow.autoUpdate = false; l.k = 0;
  scene.add(l, l.target); return l;
});
// The zones that set the mood at (x, z) with their shares, the zone you are in first: near an opening the neighbour's share rises
// linearly to one half on the edge (and past it in the gap between two boxes), and falls the same way along the wall beside it.
// Counted as odds against the zone you are in: an opening gives k / (1 - k), a zone behind a neighbour's opening the product of the
// two. Across an opening k from one side is 1 - k from the other, so every zone's odds against every other agree whichever side you
// count from, and the shares do not move when `zone` flips; a neighbour's doors count only near the door into it (nothing through a wall).
function weights(x, z, zone) {
  const r = new Map([[zone, 1]]), reach = (from, f) => { const got = [];
    for (const o of from.openings) { const n = o.p === from ? o.q : o.p, t = (o.ax ? z : x) - o.at, s = o.ax ? x : z, a = Math.max(o.lo - s, s - o.hi, 0);
      const k = Math.min(.99, Math.max(0, .5 + .5 * (o.p === from ? t : -t) / BAND)) * Math.max(0, 1 - a / BAND), w = f * k / (1 - k);
      if (w > 0 && n !== zone) { got.push([n, w]); if (w > (r.get(n) || 0)) r.set(n, w); } } // reached two ways: the larger
    return got; };
  for (const [n, w] of reach(zone, 1)) reach(n, w);
  let sum = 0; for (const v of r.values()) sum += v;
  return [...r].map(([q, v]) => [q, v / sum]);
}
function relight(pos, zone, fade, wts) { // fade: how far to move brightness this call (1 = snap); wts: weights() there, else the zone alone (the bakes)
  const gw = {}; for (const [z, v] of wts || [[zone, 1]]) gw[z.grp] = (gw[z.grp] || 0) + v; // a fixture's group gives up its 8 m handicap as you near it
  const want = emitters.map(e => [e.p.distanceTo(pos) + 8 * (1 - Math.min(1, gw[e.zone.grp] || 0)) - (e.light ? 2 : 0), e]).sort((a, b) => a[0] - b[0]).slice(0, lights.length).map(a => a[1]);
  for (const l of lights) {
    const keep = want.includes(l.e);
    l.k = Math.min(1, Math.max(0, l.k + (keep ? fade : -fade)));
    const e = !keep && l.k === 0 && want.find(e => !e.light);
    if (e) {
      if (l.e) l.e.light = null;
      l.e = e; e.light = l; l.position.copy(e.p); l.target.position.copy(e.t); l.color.set(e.color); l.angle = e.angle; l.distance = e.dist;
      l.shadow.needsUpdate = renderer.shadowMap.needsUpdate = true;
    }
    l.intensity = l.e ? l.e.power * l.k * l.k : 0;
  }
}

// ---------- fake GI: capture each zone into a cubemap and use it as that zone's ambient + reflections ----------
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(.1, 5000, cubeRT);
const pmrem = new THREE.PMREMGenerator(renderer);
function bake(z, mats = z.mats, k = z.k) {
  setSky(z.sky || 'day');
  if (z.id) { relight(z.probe, z, 1); relight(z.probe, z, 1); } // bring the lamps to this zone: first call assigns, second switches on
  cubeCam.position.copy(z.probe); cubeCam.update(renderer, scene);
  const env = pmrem.fromCubemap(cubeRT.texture).texture;
  for (const m of mats) { m.envMap = env; m.envMapIntensity = k; m.needsUpdate = true;
    const u = m.userData.envU; if (u && z.env) { u.uEMin.value.set(...z.env[0]); u.uEMax.value.set(...z.env[1]); u.uEP.value.copy(z.probe); } } // reflections box-projected onto the room (mat.js envBox)
}
// Every program the bakes and the first frames use, compiled up front and in parallel (KHR_parallel_shader_compile) instead of
// one after another as each is first drawn. For the cube target, as the bakes and the scene pass draw (a half-float target:
// no tone mapping, linear; for the screen the variants would be ones no draw uses), and with an env map of the bakes' kind.
const env0 = pmrem.fromCubemap(cubeRT.texture), shown = [];
for (const m of [seaMat, ...Object.values(zones).flatMap(z => z.mats)]) m.envMap = env0.texture;
scene.traverse(o => { shown.push([o, o.visible]); o.visible = true; });
renderer.setRenderTarget(cubeRT);
const compiled = (async () => renderer.compileAsync?.(scene, camera))(); // (a throw becomes a rejection) the GPU compiles them while the rest goes on
renderer.setRenderTarget(null);
for (const [o, v] of shown) o.visible = v; // collected synchronously above: restored before the await, while other modules run
if (ponds.length) ripple(ponds[0], []); // and the wave step's program, by one step of still water (which stays still), not when a pool first comes into view
// Openings: the stretches of a shared zone edge a body can walk straight through (free of solids from 0.8 m before the edge to
// 0.8 m past it, no rise taller than a step), found once, while the GPU compiles the programs above. Between places the mood is a function of where you stand near one.
const BAND = 2.5, openings = []; // BAND: metres either side of an opening over which the neighbour's share goes from 0 to a half
{ const zl = Object.values(zones), t0 = performance.now(); let cs, fs; // the solids and floors that reach the strip along the edge being searched: scanning all of them per sample was half a second
  const free = (x, z) => { const f = floorH(x, z, fs); return !cs.some(c => x > c[0] - .05 && x < c[2] + .05 && z > c[1] - .05 && z < c[3] + .05 && c[4] < f + 1.7 && c[5] > f + .35); };
  const through = (ax, at, s) => { let f0; for (let u = -.8; u <= .8 + 1e-6; u += .1) { const [x, z] = ax ? [s, at + u] : [at + u, s], f = floorH(x, z, fs);
    if (!free(x, z) || Math.abs(f - (f0 ?? f)) > .35) return false; f0 = f; } return true; };
  for (const p of zl) for (const q of zl) for (const ax of [0, 1]) { // ax 0: p's east side meets q's west at x = at; ax 1: p's north (high z) meets q's south
    const e1 = p.box[ax ? 3 : 2], e2 = q.box[ax ? 1 : 0], lo = Math.max(p.box[ax ? 0 : 1], q.box[ax ? 0 : 1]), hi = Math.min(p.box[ax ? 2 : 3], q.box[ax ? 2 : 3]);
    if (p === q || Math.abs(e1 - e2) > .7 || hi - lo < .4) continue;
    const at = (e1 + e2) / 2, [x1, x2, z1, z2] = ax ? [lo - .1, hi + .1, at - .9, at + .9] : [at - .9, at + .9, lo - .1, hi + .1]; // every sample lies inside
    cs = colliders.filter(c => c[0] - .05 < x2 && c[2] + .05 > x1 && c[1] - .05 < z2 && c[3] + .05 > z1); fs = flats.filter(f => f[0] <= x2 && f[2] >= x1 && f[1] <= z2 && f[3] >= z1);
    let run = null; const done = () => { if (run && run[1] - run[0] >= .4) openings.push({ p, q, ax, at, lo: run[0], hi: run[1] }); run = null; };
    for (let s = lo; s <= hi + 1e-6; s += .05) if (through(ax, at, s)) run ? run[1] = s : run = [s, s]; else done();
    done();
  }
  for (const z of zl) z.openings = openings.filter(o => o.p === z || o.q === z);
  performance.measure('load: openings', { start: t0 }); // half a second when every sample scanned every solid (tools/test.mjs)
  // the band must end before any passage warp and where it lands: there both twins must show the passage's own mood, or the move would show
  console.assert(openings.every(o => warps.every(w => [0, 1].every(c => { const [x1, x2, z1, z2] = o.ax ? [o.lo, o.hi, o.at, o.at] : [o.at, o.at, o.lo, o.hi];
    return Math.max(w[0] + c * w[4] - x2, x1 - w[2] - c * w[4], w[1] + c * w[5] - z2, z1 - w[3] - c * w[5]) > BAND; }))), 'a passage warp or its landing lies within an opening band');
}
try { await compiled; } catch (e) { console.warn('compiling ahead failed, compiling as drawn instead', e); }
performance.mark('load: scene compiled');
await libBaked; // the bakes draw with the library's textures
for (const w of ponds) w.visible = false; // a pool's nested renders would reset the active cube face
bake({ probe: V(-200, 3, -12) }, [seaMat], 1);
for (let pass = 0; pass < 2; pass++) for (const z of Object.values(zones)) { // second pass picks up the first bounce, including through doorways
  if (z.mats.length) bake(z); // the dark passages have nothing to light
  if (pass) for (const w of ponds) if (w.zone === z) w.drawPlan();
}
env0.dispose(); performance.mark('load: zones baked'); // every material has its bake's now
const zone0 = Object.values(zones).find(z => inR(camera.position.x, camera.position.z, ...z.box)) || zones.bA;
setSky(zone0.sky || 'day'); relight(camera.position, zone0, 1); relight(camera.position, zone0, 1); // the zone you start in

export { lights, relight, bake, zone0, openings, weights };
