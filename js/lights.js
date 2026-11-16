// The shared lamp pool, relighting as you move, and the ambient bakes.
import * as THREE from 'three';
import { renderer, scene, camera, V, zones, inR } from './core.js';
import { seaMat, noCast, FT, FA } from './mat.js';
import { emitters, loose, rings, colliders, floorH, flats, warps, ends, side, across, carry, live, gap } from './build.js';
import { setSky } from './sky.js';
import { ponds, ripple } from './water.js';
import { libBaked } from './level.js';
import seen from './seen.js';

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
function weights(x, z, zone, open) { // open(e): count the portal end e as open whatever its leaf (the lamp ranking, below)
  // a portal's opening (o.e: its end on each side) is measured in the space of the side you count from, and the zone behind it is
  // counted from your place taken through it, so the mood crosses a portal exactly as it crosses a doorway
  const r = new Map([[zone, 1]]), reach = (from, f, x, z) => { const got = [];
    for (const o of from.openings) { const n = o.p === from ? o.q : o.p, e = o.e?.[o.p === from ? 0 : 1];
      const t = e ? side(e, x, z) < -.5 ? -1e9 : -side(e, x, z) : ((o.ax ? z : x) - o.at) * (o.p === from ? 1 : -1), s = e ? Math.abs(across(e, x, z)) : o.ax ? x : z, a = e ? Math.max(s - e.w / 2, 0) : Math.max(o.lo - s, s - o.hi, 0);
      const k = Math.min(.99, Math.max(0, .5 + .5 * t / BAND)) * Math.max(0, 1 - a / BAND) * (e ? open?.(e) ? 1 : gap(e) : 1), w = f * k / (1 - k);
      if (w > 0 && n !== zone) { got.push([n, w, ...(e ? carry(e, x, z) : [x, z])]); if (w > (r.get(n) || 0)) r.set(n, w); } } // reached two ways: the larger
    return got; };
  for (const [n, w, nx, nz] of reach(zone, 1, x, z)) reach(n, w, nx, nz);
  let sum = 0; for (const v of r.values()) sum += v;
  return [...r].map(([q, v]) => [q, v / sum]);
}
const frustum = new THREE.Frustum(), _m = new THREE.Matrix4(), _s = new THREE.Sphere();
function view(zone) { // the zone ids that may be seen from `zone`, and (.near) those of them seen directly, not through a portal; null: any (a zone seen.js does not list is drawn from everywhere)
  if (!seen[zone.id]) return null; const v = new Set([zone.id, ...seen[zone.id]]); v.near = new Set(v);
  for (let hop = 0; hop < 3; hop++) for (const e of ends) { const q = e.to.zone?.id; if (live(e) && e.zone && v.has(e.zone.id) && q && !v.has(q)) { if (!seen[q]) return null; v.add(q); seen[q].forEach(c => v.add(c)); } }
  return v;
}
function relight(pos, zone, fade, wts, ahead) { // fade: how far to move brightness this call (1 = snap); wts: weights() there, else the zone alone (the bakes); ahead: where the body will be once a swap is done (player.js)
  // a door you have opened counts as open from the press (its latch and swing take time; the room is not yet seen), and so does a shut one
  // within 3 m of where you will be: its room is ranked as it will be once open, so the lamps it takes while unseen are the ones it keeps
  const near = (e, q, r) => { const d = side(e, q.x, q.z); return d >= 0 && Math.hypot(d, Math.max(0, Math.abs(across(e, q.x, q.z)) - e.w / 2)) < r; };
  const open = e => e.door && ((e.door.of || e.door).to || near(e, ahead || pos, 3) && !ahead?.through);
  const gw = {}; for (const [z, v] of wts ? weights(pos.x, pos.z, zone, open) : [[zone, 1]]) gw[z.grp] = (gw[z.grp] || 0) + v; // a fixture's group gives up its 8 m handicap as you near it
  // in play (wts given), a fixture in front of a portal's far end is also as near as it is from your place taken through that portal: an open one within 30 m
  // of its opening, and on through up to two more beyond by the same rule (the lift lobby seen from the vestibule across the hallway); a shut one within 3 m
  // (so its lamps are settled before the leaf opens; not its wall's plane: every door along it would count). The rule is the same at every step, so the set is
  // the same either side of a plane (a shut door counted only on the first step lost the lift lobby's lamps on entering the vestibule from the hallway).
  // Ranked from where you will be too (`ahead`, player.js), so a swap (1/3 s out, 1/3 s in) is done by the time you get there; and a shut door only from
  // there: its room is unseen, so walking away from one it gives up its lamps early to the room you go into (they were still coming up at the plane)
  const reach = (q, shut) => ends.filter(e => near(e, q, live(e) || (e.door.of || e.door).to ? 30 : shut ? 3 : -1)).map(e => { const [x, z] = carry(e, q.x, q.z); return [e.to, V(x, q.y + e.to.p.y - e.p.y, z)]; });
  const from = [pos, ahead || pos], via = [];
  // (not from an `ahead` taken through a portal: walking out of a room, the shut door across the hallway took the lamps you were heading for)
  if (wts) from.forEach((p, shut) => { shut &&= !p.through; for (let hop = 0, fr = [[, p]]; hop < 3 && fr.length; hop++) { fr = fr.flatMap(([, q]) => reach(q, shut)); via.push(...fr); } });
  // a door being opened within 3 m: also ranked from 2 m inside, where you will be once through (the room's lamps come while it is unseen)
  if (wts) for (const e of ends) { const q = e.door && (e.door.of || e.door); if (q?.to && q.u < 1 && near(e, pos, 3)) { const d = side(e, pos.x, pos.z) + 2, [x, z] = carry(e, pos.x - e.n.x * d, pos.z - e.n.z * d); via.push([e.to, V(x, pos.y + e.to.p.y - e.p.y, z)]); } }
  const dist = e => { let d = Math.min(...from.map(p => e.p.distanceTo(p))); for (const [f, q] of via) if (side(f, e.p.x, e.p.z) > 0) d = Math.min(d, e.p.distanceTo(q)); return d; };
  const want = emitters.map(e => [dist(e) + 8 * (1 - Math.min(1, gw[e.zone.grp] || 0)) - (e.light ? 2 : 0), e]).sort((a, b) => a[0] - b[0]).slice(0, lights.length).map(a => a[1]);
  relight.want = want; // for the probes (tools/probe.mjs)
  // A lamp lighting only a zone nobody can see from here changes at once: the zones seen.js gives yours, and through each open portal of
  // those the zone behind it and what that sees, up to three portals on. So a room behind a shut door takes its lamps the moment they are
  // wanted and is fully lit before the leaf moves (they faded in 1/3 s after 1/3 s out, and were still coming up as you stepped through)
  // so does one in a zone seen directly whose reach (a sphere: nothing past its distance is lit) is out of the view (through a portal: always in it)
  const vis = wts && view(zone); if (vis) { camera.updateMatrixWorld(); frustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); }
  const hid = e => vis && e && (!vis.has(e.zone.id) || vis.near.has(e.zone.id) && !frustum.intersectsSphere(_s.set(e.p, e.dist)));
  for (const l of lights) {
    const keep = want.includes(l.e), f = (l.hid = hid(l.e)) ? 1 : fade;
    l.k = Math.min(1, Math.max(0, l.k + (keep ? f : -f)));
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
// ---------- the fixtures' shadows: each fixture's distance to the nearest surface in every direction, baked once at load ----------
// into one octahedral atlas (mat.js fixVis reads it); every material of a zone with fixtures computes them (mat.js fixMain).
const fixZ = Object.values(zones).filter(z => z.fix), nFix = fixZ.reduce((n, z) => n + z.fix.length, 0), AW = FT * FA, fixH = FT * Math.max(1, Math.ceil(nFix / FA));
// ---------- ambient that varies with place: each indoor zone's grid of how open every cell is, in the same atlas below the fixtures ----------
// The zone's capture is the light at its probe, out in the open; a cell holds, for each of the six axis directions, how far you can see
// that way (up to AG_R, cosine-weighted over that half of the sphere), so 1 is open floor or wall and a corner, the floor under a table or
// an alcove is less (mat.js agOpen scales the ambient diffuse by it, not the reflections). Outdoors (no env box) the sky dominates: no grid.
const AG_H = .5, AG_R = 2, agZ = Object.values(zones).filter(z => z.env && z.mats.length);
let agRows = 0;
for (const z of agZ) { const lo = z.env[0].map(v => Math.floor((v - 1) / AG_H) * AG_H), hi = z.env[1].map(v => v + 1), n = lo.map((v, i) => Math.ceil((hi[i] - v) / AG_H) + 1);
  const per = Math.floor(AW / n[0]); z.ag = { lo, n, per, y0: fixH + agRows }; agRows += n[2] * Math.ceil(2 * n[1] / per); }
const fixRT = new THREE.WebGLRenderTarget(AW, fixH + agRows, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false }); // RGBA: the fixtures' maps (texelFetch, red) and the grids (filtered)
console.assert(fixRT.height <= renderer.capabilities.maxTextureSize, 'fixture atlas taller than a texture may be');
{ let base = 0; for (const z of fixZ) {
  const u = { uLamp: { value: z.fix.map(p => new THREE.Vector4(p.x, p.y, p.z, p.w)) }, uFixT: { value: z.fix.map(p => { const s = V(...(p.seg || [0, 0, 0])), l = s.length(); return new THREE.Vector4(...(l ? s.divideScalar(l) : s).toArray(), l); }) }, uLampCol: { value: new THREE.Color(0xffedc0) }, uFixBase: { value: base }, tFix: { value: fixRT.texture } };
  for (const m of z.mats) if (m.userData.envU) { Object.assign(m.userData.envU, u); m.defines = { ...m.defines, NL: z.fix.length }; }
  base += z.fix.length; }
  for (const z of agZ) { const { lo, n, per, y0 } = z.ag, u = { tFix: { value: fixRT.texture }, uAG0: { value: new THREE.Vector4(...lo, 1 / AG_H) }, uAG1: { value: new THREE.Vector4(...n, per) }, uAG2: { value: new THREE.Vector4(0, y0, 1 / AW, 1 / fixRT.height) } };
    for (const m of z.mats) if (m.userData.envU) { Object.assign(m.userData.envU, u); m.defines = { ...m.defines, AG: 1 }; } } }
function ambientGrid() { // what is solid in each grid, and what lights it; the rest (agWork) runs in a worker while the GPU compiles
  const t0 = performance.now(), PAD = Math.ceil(AG_R / AG_H) + 1;
  const grids = agZ.map(z => { const { lo, n, per, y0 } = z.ag, occ = new Uint8Array((n[0] + 2 * PAD) * (n[1] + 2 * PAD) * (n[2] + 2 * PAD)), px = n[0] + 2 * PAD, pz = n[2] + 2 * PAD, q = 1 / AG_H;
    // the level's solids (build.js: walls, floors, ceilings, seats, tables, columns; what you stand on and cannot walk through), each
    // marking every cell it overlaps: thousands of boxes, not the millions of triangles drawn (those took over a second)
    for (const k of colliders) { const r = (a, b, ax) => [Math.max(0, Math.ceil((a - lo[ax]) * q - .5)), Math.min(n[ax] - 1, Math.floor((b - lo[ax]) * q + .5))];
      const [i0, i1] = r(k[0], k[2], 0), [l0, l1] = r(k[1], k[3], 2), [j0, j1] = r(Math.max(k[4], lo[1] - 9), Math.min(k[5], lo[1] + 9 * n[1]), 1); if (i0 > i1 || l0 > l1 || j0 > j1) continue;
      const t = k[6], e = AG_H / 2;
      for (let l = l0; l <= l1; l++) for (let i = i0; i <= i1; i++) { const x = lo[0] + i * AG_H, zz = lo[2] + l * AG_H;
        if (typeof t === 'number' ? Math.hypot(x - (k[0] + k[2]) / 2, zz - (k[1] + k[3]) / 2) > t + e : t && (Math.abs((x - t[0]) * t[2] - (zz - t[1]) * t[3]) > t[4] + e || Math.abs((x - t[0]) * t[3] + (zz - t[1]) * t[2]) > t[5] + e)) continue; // round, turned
        for (let j = j0; j <= j1; j++) occ[i + PAD + px * (l + PAD + pz * (j + PAD))] = 1; } }
    // its light: the lamps' pools on the floor (where their light lands and bounces from) and the fixtures; its openings (doorways, portal ends)
    const src = [...emitters.filter(e => e.zone === z).map(e => [e.t.x, e.t.y, e.t.z, 4 * e.power / Math.max(1, e.p.distanceToSquared(e.t))]), ...(z.fix || []).map(p => [p.x, p.y, p.z, p.w])].flat();
    const ops = z.openings.map(o => { if (!o.e) return [0, o.ax, o.at, o.lo, o.hi, 0, 0]; const e = o.e[o.p === z ? 0 : 1]; return [1, e.p.x, e.p.z, e.n.x, e.n.z, e.w, 0]; }).flat();
    return { lo, n, per, y0: y0 - fixH, occ, src: Float32Array.from(src), ops: Float32Array.from(ops) }; });
  const job = { grids, AW, rows: agRows, H: AG_H, R: AG_R, PAD };
  performance.measure('load: ambient grids, solids', { start: t0 });
  let w; try { w = new Worker(URL.createObjectURL(new Blob([`onmessage = e => { const r = (${agWork})(e.data); postMessage(r, [r.buffer]); }`], { type: 'text/javascript' }))); } catch { return Promise.resolve(agWork(job)); }
  return new Promise(ok => { w.onmessage = e => { ok(e.data); w.terminate(); }; w.onerror = () => ok(agWork(job)); w.postMessage(job); });
}
// The grids' cells (a pure function: it runs in a worker). Per cell: 48 rays over the sphere, each to the first solid within R at quarter-metre
// steps; per face the cosine-weighted share of R they get; times the light term; then packed into the atlas rows as half floats.
function agWork({ grids, AW, rows, H, R, PAD }) {
  const out = new Uint16Array(AW * rows * 4), S = Math.round(R / (H / 2)), NR = 48, f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  const half = v => { if (v < 6.1e-5) return 0; f32[0] = v; const b = u32[0]; return (((b & 0x7f800000) - 0x38000000) >> 13 & 0x7c00) | (b >> 13 & 0x3ff); }; // positive, normal, under 2: all a cell holds
  out.fill(half(1));
  const dirs = Array.from({ length: NR }, (_, i) => { const y = 1 - 2 * (i + .5) / NR, r = Math.sqrt(1 - y * y), a = i * 2.39996; return [r * Math.cos(a), y, r * Math.sin(a)]; });
  const steps = dirs.map(d => { const o = []; for (let s = 1; s <= S; s++) { const t = s * H / 2, c = d.map(v => Math.round(v * t / H)); if (!o.length || c.some((v, k) => v !== o[o.length - 1][k])) o.push([...c, t]); } return o; });
  const WF = new Float32Array(NR * 6); for (let k = 0; k < 6; k++) { const ax = k >> 1, sg = k & 1 ? -1 : 1; let s = 0; for (const d of dirs) s += Math.max(0, sg * d[ax]); dirs.forEach((d, r) => WF[r * 6 + k] = Math.max(0, sg * d[ax]) / s); }
  for (const { lo, n, per, y0, occ, src, ops } of grids) { const [nx, ny, nz] = n, N = nx * ny * nz, at = (i, j, l) => i + nx * (l + nz * j), val = new Float32Array(N * 6).fill(1);
    const px = nx + 2 * PAD, pz = nz + 2 * PAD, P = (i, j, l) => i + PAD + px * (l + PAD + pz * (j + PAD)); // occ is padded by PAD empty cells all round: no bounds checks on a ray
    const D0 = new Int32Array(NR + 1); steps.forEach((o, r) => D0[r + 1] = D0[r] + o.length);
    const DD = Int32Array.from(steps.flatMap(o => o.map(([a, b, e]) => a + px * (e + pz * b)))), TV = Float32Array.from(steps.flatMap(o => o.map(s => (s[3] - H / 2) / R)));
    // near: a solid within 2 cells along every axis (a box dilation, one axis at a time): only such cells are ever read (a surface's sample
    // point is 0.6 cells off it, between cells at most 2 from it); the rest stay open all round
    const solid = new Uint8Array(N); for (let c = 0; c < N; c++) solid[c] = occ[P(c % nx, Math.floor(c / (nx * nz)), Math.floor(c / nx) % nz)];
    let near = solid;
    for (const [st, len] of [[1, nx], [nx, nz], [nx * nz, ny]]) { const o = new Uint8Array(N);
      for (let c = 0; c < N; c++) if (near[c]) { const p = Math.floor(c / st) % len; for (let d = -Math.min(2, p); d <= Math.min(2, len - 1 - p); d++) o[c + d * st] = 1; } near = o; }
    for (let j = 0; j < ny; j++) for (let l = 0; l < nz; l++) for (let i = 0; i < nx; i++) { const c = at(i, j, l); if (solid[c] || !near[c]) continue;
      const c0 = P(i, j, l); let f0 = 0, f1 = 0, f2 = 0, f3 = 0, f4 = 0, f5 = 0;
      for (let r = 0; r < NR; r++) { let vis = 1; // how far the ray gets before something solid, as a share of R
        for (let s = D0[r]; s < D0[r + 1]; s++) if (occ[c0 + DD[s]]) { vis = TV[s]; break; }
        const w = r * 6; f0 += WF[w] * vis; f1 += WF[w + 1] * vis; f2 += WF[w + 2] * vis; f3 += WF[w + 3] * vis; f4 += WF[w + 4] * vis; f5 += WF[w + 5] * vis; }
      const v = c * 6; val[v] = f0; val[v + 1] = f1; val[v + 2] = f2; val[v + 3] = f3; val[v + 4] = f4; val[v + 5] = f5; }
    for (let c = 0; c < N; c++) if (solid[c]) { const i = c % nx, l = Math.floor(c / nx) % nz, j = Math.floor(c / (nx * nz)); let any = false; // a solid cell: the most open of its open neighbours (the side a surface is seen from)
      const f = [0, 0, 0, 0, 0, 0]; for (const [a, b, e] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const I = i + a, J = j + b, L = l + e;
        if (I < 0 || J < 0 || L < 0 || I >= nx || J >= ny || L >= nz || solid[at(I, J, L)]) continue; any = true; for (let k = 0; k < 6; k++) f[k] = Math.max(f[k], val[at(I, J, L) * 6 + k]); }
      if (any) for (let k = 0; k < 6; k++) val[c * 6 + k] = f[k]; }
    // how near the room's light, as a share of its mean over the cells read, softened (x^0.4, which can only lower the mean: no room gets
    // brighter overall) and faded out within 4 m of an opening, where the neighbour's light comes in and the two rooms' own captures already meet
    if (src.length) { const lt = new Float32Array(N); let sum = 0, cnt = 0;
      for (let c = 0; c < N; c++) if (near[c]) { const x = lo[0] + (c % nx) * H, y = lo[1] + Math.floor(c / (nx * nz)) * H, z = lo[2] + (Math.floor(c / nx) % nz) * H; let e = 0;
        for (let s = 0; s < src.length; s += 4) { const a = x - src[s], b = y - src[s + 1], d = z - src[s + 2]; e += src[s + 3] / (a * a + b * b + d * d + 4); }
        lt[c] = e; if (!solid[c]) { sum += e; cnt++; } }
      const mean = sum / Math.max(1, cnt);
      for (let c = 0; c < N; c++) if (near[c]) { const x = lo[0] + (c % nx) * H, z = lo[2] + (Math.floor(c / nx) % nz) * H; let d = 1e9;
        for (let o = 0; o < ops.length; o += 7) {
          if (ops[o]) { const sd = (x - ops[o + 1]) * ops[o + 3] + (z - ops[o + 2]) * ops[o + 4], ac = -(x - ops[o + 1]) * ops[o + 4] + (z - ops[o + 2]) * ops[o + 3]; d = Math.min(d, Math.hypot(sd, Math.max(0, Math.abs(ac) - ops[o + 5] / 2))); } // a portal's end
          else { const u = ops[o + 1] ? z : x, v = ops[o + 1] ? x : z; d = Math.min(d, Math.hypot(u - ops[o + 2], Math.max(ops[o + 3] - v, v - ops[o + 4], 0))); } } // a doorway on the line u = at, v from lo to hi
        const k = 1 + (Math.min(1.3, Math.max(.55, (lt[c] / mean) ** .4)) - 1) * Math.min(1, Math.max(0, (d - 1) / 3));
        for (let q = 0; q < 6; q++) val[c * 6 + q] *= k; } }
    for (let j = 0; j < ny; j++) for (let h = 0; h < 2; h++) { const t = 2 * j + h, tx = (t % per) * nx, ty = y0 + Math.floor(t / per) * nz; // layer j: tile 2j holds +x +y +z, tile 2j + 1 -x -y -z
      for (let l = 0; l < nz; l++) for (let i = 0; i < nx; i++) { const c = at(i, j, l), q = ((ty + l) * AW + tx + i) * 4; for (let k = 0; k < 3; k++) out[q + k] = half(val[c * 6 + 2 * k + h]); } } }
  return out;
}
function bakeFixtures() {
  const t0 = performance.now(), cube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }), cam = new THREE.CubeCamera(.03, 40, cube);
  const dist = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uP: { value: V(0, 0, 0) } },
    vertexShader: `varying vec3 vW; void main() { vec4 w = vec4(position, 1.);
      #ifdef USE_INSTANCING
        w = instanceMatrix * w;
      #endif
      w = modelMatrix * w; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: 'uniform vec3 uP; varying vec3 vW; void main() { gl_FragColor = vec4(length(vW - uP)); }' });
  const oct = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { tC: { value: cube.texture } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vU; void main() { vU = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `uniform samplerCube tC; varying vec2 vU; void main() { vec2 o = vU * 2. - 1.; vec3 n = vec3(o.x, 1. - abs(o.x) - abs(o.y), o.y);
      if (n.y < 0.) n.xz = (1. - abs(n.zx)) * vec2(n.x >= 0. ? 1. : -1., n.z >= 0. ? 1. : -1.);
      float d = textureCube(tC, normalize(n)).r; gl_FragColor = vec4(d > 0. ? d : 1e4); }` })), octScene = new THREE.Scene(), octCam = new THREE.Camera();
  octScene.add(oct); oct.frustumCulled = false;
  // what casts: what casts the lamps' shadows, less loose things (they move) and glass
  const hid = []; scene.traverse(o => { if (o.visible && (o.isPoints || o.isSprite || o.isLine || (o.isMesh && (!o.castShadow || [o.material].flat().every(m => noCast.has(m) || m.transparent))))) { hid.push(o); o.visible = false; } });
  for (const b of [...loose.map(l => l.mesh), ...rings]) if (b.visible) { hid.push(b); b.visible = false; }
  const sm = renderer.shadowMap.enabled, bg = scene.background, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  renderer.shadowMap.enabled = false; scene.background = null; scene.overrideMaterial = dist; renderer.setClearColor(0, 0);
  let i = 0; for (const z of fixZ) for (const p of z.fix) {
    dist.uniforms.uP.value.copy(p); cam.position.copy(p); cam.update(renderer, scene);
    const x = (i % FA) * FT, y = Math.floor(i / FA) * FT; i++;
    fixRT.viewport.set(x, y, FT, FT); fixRT.scissor.set(x, y, FT, FT); fixRT.scissorTest = true; renderer.setRenderTarget(fixRT); renderer.render(octScene, octCam);
  }
  renderer.setRenderTarget(null); scene.overrideMaterial = null; scene.background = bg; renderer.shadowMap.enabled = sm; renderer.setClearColor(cc, ca);
  for (const o of hid) o.visible = true;
  cube.dispose(); dist.dispose(); oct.material.dispose(); oct.geometry.dispose();
  performance.measure('load: fixture shadows', { start: t0 });
}
const env0 = pmrem.fromCubemap(cubeRT.texture), shown = [];
for (const m of [seaMat, ...Object.values(zones).flatMap(z => z.mats)]) m.envMap = env0.texture;
scene.traverse(o => { shown.push([o, o.visible]); o.visible = true; });
renderer.setRenderTarget(cubeRT);
const compiled = (async () => renderer.compileAsync?.(scene, camera))(); // (a throw becomes a rejection) the GPU compiles them while the rest goes on
renderer.setRenderTarget(null);
for (const [o, v] of shown) o.visible = v; // collected synchronously above: restored before the await, while other modules run
if (ponds.length) ripple(ponds[0].sheet, []); // and the wave step's program, by one step of still water (which stays still), not when a pool first comes into view
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
  for (let i = 0; i < ends.length; i += 2) { const o = { p: ends[i].zone, q: ends[i + 1].zone, e: [ends[i], ends[i + 1]] }; o.p.openings.push(o); if (o.q !== o.p) o.q.openings.push(o); } // portals (build.js): an opening each pair
}
const agData = agRows ? ambientGrid() : null; // a worker works them out while the GPU compiles
try { await compiled; } catch (e) { console.warn('compiling ahead failed, compiling as drawn instead', e); }
performance.mark('load: scene compiled');
await libBaked; // the bakes draw with the library's textures
for (const w of ponds) w.visible = false; // a pool's nested renders would reset the active cube face
bakeFixtures(); // before the zone bakes, which see the fixtures' light
if (agRows) { const t0 = performance.now(), t = new THREE.DataTexture(await agData, AW, agRows, THREE.RGBAFormat, THREE.HalfFloatType);
  performance.measure('load: ambient grids, waited', { start: t0 }); renderer.copyTextureToTexture(t, fixRT.texture, null, new THREE.Vector2(0, fixH)); t.dispose(); } // the grids under the fixtures' maps
bake({ probe: V(-200, 3, -12) }, [seaMat], 1);
for (let pass = 0; pass < 2; pass++) for (const z of Object.values(zones)) { // second pass picks up the first bounce, including through doorways
  if (z.mats.length) bake(z); // the dark passages have nothing to light
  if (pass) for (const w of ponds) if (w.zone === z) w.drawPlan();
}
env0.dispose(); performance.mark('load: zones baked'); // every material has its bake's now
const zone0 = Object.values(zones).find(z => inR(camera.position.x, camera.position.z, ...z.box)) || zones.bA;
setSky(zone0.sky || 'day'); relight(camera.position, zone0, 1); relight(camera.position, zone0, 1); // the zone you start in

export { lights, relight, bake, zone0, openings, weights };
