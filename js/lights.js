// The shared lamp pool, relighting as you move, and the ambient bakes.
import * as THREE from 'three';
import { renderer, scene, camera, V, zones, inR } from './core.js';
import { seaMat, noCast, FT, FA, bakingU } from './mat.js';
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
      l.e = e; e.light = l; l.position.copy(e.p); l.target.position.copy(e.t); l.color.set(e.color); if (e.zone.lk) l.color.multiply(e.zone.lk.warmC); l.angle = e.angle; l.distance = e.dist;
      l.shadow.needsUpdate = renderer.shadowMap.needsUpdate = true;
    }
    l.intensity = l.e ? l.e.power * l.k * l.k * (l.e.zone.lk?.light ?? 1) : 0; // lk: the zone's look (look.js)
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
// ---------- ambient that varies with place: each indoor zone's grid of the bounced light every cell receives, in the same atlas below the fixtures ----------
// The zone's capture is the light at its probe, out in the open: its level and its overall colour. A cell holds, for each of the six axis
// directions, the coloured light a surface facing that way receives there, as a share of the room's mean (lights.js agWork: the room's lamps
// and fixtures light its surfaces, the light bounces between them in their own colours, and each cell gathers what reaches it), times how far
// you can see that way within AG_R (corners, under tables, alcoves less). mat.js agLight scales the ambient diffuse by it (not the reflections).
// Outdoors (no env box) the sky dominates: no grid. Six RGBA tiles a layer (+x -x +y -y +z -z): rgb the light, a 1 where the cell is open,
// 0 (and rgb 0) where it is solid, so a lookup weights its taps by openness and renormalises: nothing reaches through a wall.
const AG_H = .5, AG_R = 2, AG_RB = 8, agZ = Object.values(zones).filter(z => z.env && z.mats.length); // AG_RB: how far a bounce ray goes before it counts as the room at large
let agRows = 0;
for (const z of agZ) { const lo = z.env[0].map(v => Math.floor((v - 1) / AG_H) * AG_H), hi = z.env[1].map(v => v + 1), n = lo.map((v, i) => Math.ceil((hi[i] - v) / AG_H) + 1);
  const per = Math.floor(AW / n[0]), rows = n[2] * Math.ceil(6 * n[1] / per); z.ag = { lo, n, per, y0: fixH + agRows, rows }; agRows += rows; }
const fixRT = new THREE.WebGLRenderTarget(AW, fixH + agRows, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false }); // RGBA: the fixtures' maps (texelFetch, red) and the grids (filtered)
console.assert(fixRT.height <= renderer.capabilities.maxTextureSize, 'fixture atlas taller than a texture may be');
{ let base = 0; for (const z of fixZ) {
  const u = { uLamp: { value: z.fix.map(p => new THREE.Vector4(p.x, p.y, p.z, p.w)) }, uFixT: { value: z.fix.map(p => { const s = V(...(p.seg || [0, 0, 0])), l = s.length(); return new THREE.Vector4(...(l ? s.divideScalar(l) : s).toArray(), l); }) }, uLampCol: { value: new THREE.Color(0xffedc0) }, uFixBase: { value: base }, tFix: { value: fixRT.texture } };
  for (const m of z.mats) if (m.userData.envU) { Object.assign(m.userData.envU, u); m.defines = { ...m.defines, NL: z.fix.length }; }
  base += z.fix.length; }
  for (const z of agZ) { const { lo, n, per, y0 } = z.ag, u = z.ag.u = { tFix: { value: fixRT.texture }, uAG0: { value: new THREE.Vector4(...lo, 1 / AG_H) }, uAG1: { value: new THREE.Vector4(...n, per) }, uAG2: { value: new THREE.Vector4(0, y0, 1 / AW, 1 / fixRT.height) }, uAGk: { value: 1 } }; // uAGk: look.js light.bounce
    for (const m of z.mats) if (m.userData.envU) { Object.assign(m.userData.envU, u); m.defines = { ...m.defines, AG: 1 }; } } }
// What the grids' workers need from the main thread: what is solid in each grid (the level's colliders), what each solid cell face is made of
// (a material id, from the drawn triangles), what glows (emissive surfaces), and what lights the room. The bounces then run in workers while the
// GPU compiles; the materials' colours follow once the library is baked (agPalette). -> { send(palette), done: the grids' texels }
function ambientGrid() {
  const t0 = performance.now(), PAD = Math.ceil(AG_RB / AG_H) + 2, q = 1 / AG_H, mats = [null], mid = new Map(), litM = new Set(Object.values(zones).flatMap(z => z.mats));
  const grids = agZ.map(z => { const { lo, n, per, y0, rows } = z.ag, N = n[0] * n[1] * n[2], occ = new Uint8Array((n[0] + 2 * PAD) * (n[1] + 2 * PAD) * (n[2] + 2 * PAD)), px = n[0] + 2 * PAD, pz = n[2] + 2 * PAD;
    // the level's solids (build.js: walls, floors, ceilings, seats, tables, columns; what you stand on and cannot walk through), each
    // marking every cell it overlaps: thousands of boxes, not the millions of triangles drawn (those took over a second)
    for (const k of colliders) { const r = (a, b, ax) => [Math.max(0, Math.ceil((a - lo[ax]) * q - .5)), Math.min(n[ax] - 1, Math.floor((b - lo[ax]) * q + .5))];
      const [i0, i1] = r(k[0], k[2], 0), [l0, l1] = r(k[1], k[3], 2), [j0, j1] = r(Math.max(k[4], lo[1] - 9), Math.min(k[5], lo[1] + 9 * n[1]), 1); if (i0 > i1 || l0 > l1 || j0 > j1) continue;
      const t = k[6], e = AG_H / 2;
      for (let l = l0; l <= l1; l++) for (let i = i0; i <= i1; i++) { const x = lo[0] + i * AG_H, zz = lo[2] + l * AG_H;
        if (typeof t === 'number' ? Math.hypot(x - (k[0] + k[2]) / 2, zz - (k[1] + k[3]) / 2) > t + e : t && (Math.abs((x - t[0]) * t[2] - (zz - t[1]) * t[3]) > t[4] + e || Math.abs((x - t[0]) * t[3] + (zz - t[1]) * t[2]) > t[5] + e)) continue; // round, turned
        for (let j = j0; j <= j1; j++) occ[i + PAD + px * (l + PAD + pz * (j + PAD))] = 1; } }
    // its light: the lamps (spots: position, colour x intensity, axis, cone, reach) and the fixtures (colour x power, a line's half length); its openings (doorways, portal ends)
    const src = [...emitters.filter(e => e.zone === z).map(e => { const c = new THREE.Color(e.color).multiplyScalar(e.power), a = e.t.clone().sub(e.p).normalize(); return [0, e.p.x, e.p.y, e.p.z, c.r, c.g, c.b, a.x, a.y, a.z, Math.cos(e.angle), e.dist]; }),
      ...(z.fix || []).map(p => { const c = new THREE.Color(0xffedc0).multiplyScalar(p.w), s = p.seg || [0, 0, 0]; return [1, p.x, p.y, p.z, c.r, c.g, c.b, ...s, 0, 0]; })].flat();
    const ops = z.openings.map(o => { if (!o.e) return [0, o.ax, o.at, o.lo, o.hi, 0, 0]; const e = o.e[o.p === z ? 0 : 1]; return [1, e.p.x, e.p.z, e.n.x, e.n.z, e.w, 0]; }).flat();
    // the old light term's sources (the lamps' pools and the fixtures), only to hold the room's mean where it was
    const old = [...emitters.filter(e => e.zone === z).map(e => [e.t.x, e.t.y, e.t.z, 4 * e.power / Math.max(1, e.p.distanceToSquared(e.t))]), ...(z.fix || []).map(p => [p.x, p.y, p.z, p.w])].flat();
    return { lo, n, per, y0: y0 - fixH, rows, N, occ, mid: new Uint16Array(N * 6), best: new Float32Array(N * 6), em: new Map(), src: Float32Array.from(src), old: Float32Array.from(old), ops: Float32Array.from(ops) }; });
  performance.measure('load: ambient grids, solids', { start: t0 });
  // what each solid face is made of: the drawn triangles of every lit or glowing material sampled about every 20 cm (a mesh's first 20000
  // triangles' worth, spread over all of them), each sample marking the face of the cell just behind it that faces its normal; the
  // biggest triangle there wins (a wall over the screw heads on it). Glow adds up by area, as a share of a cell face.
  const t1 = performance.now(), boxes = grids.map(g => [g.lo, g.lo.map((v, i) => v + (g.n[i] - 1) * AG_H)]), bb = new THREE.Box3(), A3 = new Float32Array(9);
  let seed = 1; const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  scene.updateMatrixWorld(true);
  scene.traverse(o => { if (!o.isMesh || o.isInstancedMesh || !o.visible) return; const g = o.geometry, pos = g.attributes.position, idx = g.index?.array, cnt = (idx ? idx.length : pos.count) / 3;
    if (!g.boundingBox) g.computeBoundingBox(); bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    const mine = boxes.map((b, gi) => bb.max.x > b[0][0] - .5 && bb.min.x < b[1][0] + .5 && bb.max.y > b[0][1] - .5 && bb.min.y < b[1][1] + .5 && bb.max.z > b[0][2] - .5 && bb.min.z < b[1][2] + .5 ? gi : -1).filter(gi => gi >= 0);
    if (!mine.length) return;
    const pa = pos.isInterleavedBufferAttribute ? null : pos.array, me = o.matrixWorld.elements;
    const W3 = (v, k) => { const x = pa ? pa[3 * v] : pos.getX(v), y = pa ? pa[3 * v + 1] : pos.getY(v), z = pa ? pa[3 * v + 2] : pos.getZ(v);
      A3[k] = me[0] * x + me[4] * y + me[8] * z + me[12]; A3[k + 1] = me[1] * x + me[5] * y + me[9] * z + me[13]; A3[k + 2] = me[2] * x + me[6] * y + me[10] * z + me[14]; };
    const groups = g.groups.length && Array.isArray(o.material) ? g.groups : [{ start: 0, count: cnt * 3, materialIndex: 0 }];
    for (const gr of groups) { const m = [o.material].flat()[gr.materialIndex]; if (!m) continue;
      const glow = m.emissive && m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0 ? m.emissive.clone().multiplyScalar(m.emissiveIntensity) : null;
      if (!litM.has(m) && !glow) continue;
      let id = mid.get(m); if (id == null) { id = mats.length; mats.push(m); mid.set(m, id); }
      for (let t = gr.start / 3, t1 = Math.min(cnt, (gr.start + gr.count) / 3); t < t1; t++) {
        W3(idx ? idx[3 * t] : 3 * t, 0); W3(idx ? idx[3 * t + 1] : 3 * t + 1, 3); W3(idx ? idx[3 * t + 2] : 3 * t + 2, 6);
        const ux = A3[3] - A3[0], uy = A3[4] - A3[1], uz = A3[5] - A3[2], vx = A3[6] - A3[0], vy = A3[7] - A3[1], vz = A3[8] - A3[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const n2 = Math.hypot(nx, ny, nz), A = n2 / 2;
        if (A < 1e-7 || A < .04 && rnd() * .04 > A) continue; nx /= n2; ny /= n2; nz /= n2; // a small one stands for its share of 0.04 m² by chance
        const ax = Math.abs(nx) > Math.abs(ny) ? Math.abs(nx) > Math.abs(nz) ? 0 : 2 : Math.abs(ny) > Math.abs(nz) ? 1 : 2, slot = 2 * ax + ([nx, ny, nz][ax] < 0 ? 1 : 0);
        const ns = Math.min(400, Math.ceil(A / .04)), w = Math.max(A, .04) / ns;
        for (let s = 0; s < ns; s++) { let u = ns === 1 ? 1 / 3 : rnd(), e = ns === 1 ? 1 / 3 : rnd(); if (u + e > 1) { u = 1 - u; e = 1 - e; }
          const x = A3[0] + u * ux + e * vx - .05 * nx, y = A3[1] + u * uy + e * vy - .05 * ny, zz = A3[2] + u * uz + e * vz - .05 * nz;
          for (const gi of mine) { const G = grids[gi], i = Math.round((x - G.lo[0]) * q), j = Math.round((y - G.lo[1]) * q), l = Math.round((zz - G.lo[2]) * q);
            if (i < 0 || j < 0 || l < 0 || i >= G.n[0] || j >= G.n[1] || l >= G.n[2]) continue; const c = (i + G.n[0] * (l + G.n[2] * j)) * 6 + slot;
            if (litM.has(m) && A > G.best[c]) { G.best[c] = A; G.mid[c] = id; }
            if (glow) { const f = w * q * q, a = G.em.get(c) || G.em.set(c, [0, 0, 0]).get(c); a[0] += glow.r * f; a[1] += glow.g * f; a[2] += glow.b * f; } } } } } });
  performance.measure('load: ambient grids, surfaces', { start: t1 });
  const jobs = grids.map(g => ({ lo: g.lo, n: g.n, per: g.per, y0: g.y0, rows: g.rows, occ: g.occ, mid: g.mid, src: g.src, old: g.old, ops: g.ops,
    em: Float32Array.from([...g.em].flatMap(([c, v]) => [c, ...v])) }));
  // the grids shared out among a few workers, biggest first, each to the least loaded
  const W = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, jobs.length)), part = Array.from({ length: W }, () => ({ cells: 0, grids: [] }));
  for (const j of [...jobs].sort((a, b) => b.n[0] * b.n[1] * b.n[2] - a.n[0] * a.n[1] * a.n[2])) { const p = part.reduce((a, b) => a.cells <= b.cells ? a : b); p.grids.push(j); p.cells += j.n[0] * j.n[1] * j.n[2]; }
  const cfg = { AW, H: AG_H, R: AG_R, RB: AG_RB, PAD }, url = URL.createObjectURL(new Blob([`let f; onmessage = e => { if (!f) f = (${agWork})(e.data); else { const r = f(e.data); postMessage(r, r.grids.map(g => g.out.buffer)); } }`], { type: 'text/javascript' }));
  // (no worker, or one that fails: the same work here, once the colours are known)
  let pal; const later = [], ws = [], go = (job, ok) => { try { ok(agWork(job)(pal)); } catch (e) { console.error('ambient grid bake failed', e); ok({ grids: [], ms: [] }); } }, run = (job, ok) => pal ? go(job, ok) : later.push(() => go(job, ok));
  const done = part.map(p => new Promise(ok => { const job = { ...cfg, grids: p.grids }; let w; try { w = new Worker(url); } catch { return run(job, ok); }
    ws.push(w); w.onmessage = e => { ok(e.data); w.terminate(); }; w.onerror = e => { console.warn('ambient grid worker failed, baking here', e.message); w.terminate(); run(job, ok); }; w.postMessage(job); }));
  return { mats, workers: W, send(p) { pal = p; for (const w of ws) w.postMessage(p); for (const f of later.splice(0)) f(); }, done: Promise.all(done).then(r => (URL.revokeObjectURL(url), r)) };
}
// Each material's mean colour (linear albedo): a library material's set's baked albedo at its smallest mip (its mean) times the
// material's colour; a plain one its colour. One draw a set into a row of float texels, read back once.
function agPalette(mats) {
  const tex = [...new Set(mats.map(m => m?.userData.libU?.tLA.value).filter(Boolean))], at = new Map(tex.map((t, i) => [t, i])), n = Math.max(1, tex.length);
  const rt = new THREE.WebGLRenderTarget(n, 1, { type: THREE.FloatType, depthBuffer: false }), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: 'uniform sampler2D t; void main() { gl_FragColor = vec4(textureLod(t, vec2(.5), 16.).rgb, 1.); }' })), sc = new THREE.Scene(), cam = new THREE.Camera();
  sc.add(q); q.frustumCulled = false; rt.scissorTest = true;
  tex.forEach((t, i) => { q.material.uniforms.t.value = t; rt.viewport.set(i, 0, 1, 1); rt.scissor.set(i, 0, 1, 1); renderer.setRenderTarget(rt); renderer.render(sc, cam); });
  const px = new Float32Array(n * 4); if (tex.length) renderer.readRenderTargetPixels(rt, 0, 0, n, 1, px); renderer.setRenderTarget(null);
  rt.dispose(); q.material.dispose(); q.geometry.dispose();
  const out = new Float32Array(mats.length * 3).fill(.45);
  mats.forEach((m, i) => { if (!m) return; const t = at.get(m.userData.libU?.tLA.value), c = m.color || new THREE.Color(1, 1, 1);
    for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.min(.9, (t == null ? 1 : px[t * 4 + k]) * [c.r, c.g, c.b][k] * (m.metalness > .5 && t == null ? .3 : 1)); });
  return out;
}
// The grids' bounced light (a pure function: it runs in a worker). Called with the job it marks every solid cell face that looks into an open
// cell as a patch, follows 24 rays from each over its half of the sphere to what they first meet within RB (a link: that patch, or the room at
// large), and sums the direct light every patch takes from the room's lamps and fixtures, shadowed through the solids. The function it returns,
// called with the materials' colours, solves the bounces (each patch's light is its colour times what reaches it, plus its glow; Jacobi, 8 rounds),
// then every open cell near a solid gathers, over 48 rays, what the patches send each of its six directions, and how far it sees that way
// within R; packed into the atlas's rows as half floats.
function agWork({ grids, AW, H, R, RB, PAD }) {
  const t0 = Date.now(), NR = 48, NB = 24, f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer), S = Math.round(RB / (H / 2)), SR = Math.round(R / (H / 2));
  const half = v => { if (!(v >= 6.1e-5)) return 0; f32[0] = Math.min(v, 6e4); const b = u32[0]; return (((b & 0x7f800000) - 0x38000000) >> 13 & 0x7c00) | (b >> 13 & 0x3ff); }; // positive, normal: all a cell holds
  const sph = Array.from({ length: NR }, (_, i) => { const y = 1 - 2 * (i + .5) / NR, r = Math.sqrt(1 - y * y), a = i * 2.39996; return [r * Math.cos(a), y, r * Math.sin(a)]; });
  const WF = new Float32Array(NR * 6); for (let k = 0; k < 6; k++) { const ax = k >> 1, sg = k & 1 ? -1 : 1; let s = 0; for (const d of sph) s += Math.max(0, sg * d[ax]); sph.forEach((d, r) => WF[r * 6 + k] = Math.max(0, sg * d[ax]) / s); }
  const hemi = Array.from({ length: 6 }, (_, k) => Array.from({ length: NB }, (_, i) => { const u = (i + .5) / NB, r = Math.sqrt(u), a = i * 2.39996 + k, c = Math.sqrt(1 - u), l = [r * Math.cos(a), r * Math.sin(a)], d = [0, 0, 0], ax = k >> 1;
    d[ax] = k & 1 ? -c : c; d[(ax + 1) % 3] = l[0]; d[(ax + 2) % 3] = l[1]; return d; })); // cosine-distributed about each face's normal
  const cellsOf = d => { const o = []; for (let s = 1; s <= S; s++) { const t = s * H / 2, c = d.map(v => Math.round(v * t / H)); if (!o.length || c.some((v, k) => v !== o[o.length - 1][k])) o.push([...c, t]); } return o; };
  const sphSteps = sph.map(cellsOf), hemiSteps = hemi.map(h => h.map(cellsOf));
  const work = grids.map(G => { const { lo, n, occ, mid, src, ops } = G, [nx, ny, nz] = n, N = nx * ny * nz, px = nx + 2 * PAD, pz = nz + 2 * PAD;
    const P = (i, j, l) => i + PAD + px * (l + PAD + pz * (j + PAD)), at = (i, j, l) => i + nx * (l + nz * j), D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const flat = steps => ({ D0: Int32Array.from([0, ...steps.map((o, r, a) => a.slice(0, r + 1).reduce((s, o) => s + o.length, 0))]), DD: Int32Array.from(steps.flatMap(o => o.map(([a, b, e]) => a + px * (e + pz * b)))),
      DC: Int8Array.from(steps.flatMap(o => o.flatMap(([a, b, e]) => [a, b, e]))), TV: Float32Array.from(steps.flatMap(o => o.map(s => s[3]))) });
    const sS = flat(sphSteps), hS = hemiSteps.map(flat);
    const solid = new Uint8Array(N); for (let j = 0; j < ny; j++) for (let l = 0; l < nz; l++) for (let i = 0; i < nx; i++) solid[at(i, j, l)] = occ[P(i, j, l)];
    // patches: a solid cell's face onto an open cell inside the grid
    const pid = new Int32Array(N * 6).fill(-1), pc = []; for (let j = 0; j < ny; j++) for (let l = 0; l < nz; l++) for (let i = 0; i < nx; i++) { const c = at(i, j, l); if (!solid[c]) continue;
      for (let k = 0; k < 6; k++) { const I = i + D[k][0], J = j + D[k][1], L = l + D[k][2]; if (I < 0 || J < 0 || L < 0 || I >= nx || J >= ny || L >= nz || solid[at(I, J, L)]) continue; pid[c * 6 + k] = pc.length; pc.push(c * 6 + k); } }
    const NP = pc.length;
    // the patch a ray from cell (i, j, l) meets at step s of its list (its cell's face toward the cell before it, a diagonal step: the face its ray crosses most squarely), or -1
    const meet = (T, s0, s, i, j, l, d) => { const b = 3 * s, I = i + T.DC[b], J = j + T.DC[b + 1], L = l + T.DC[b + 2]; if (I < 0 || J < 0 || L < 0 || I >= nx || J >= ny || L >= nz) return -1;
      const pI = s > s0 ? i + T.DC[b - 3] : i, pJ = s > s0 ? j + T.DC[b - 2] : j, pL = s > s0 ? l + T.DC[b - 1] : l, c = at(I, J, L) * 6, dd = [pI - I, pJ - J, pL - L];
      let best = -1, bw = -1; for (let ax = 0; ax < 3; ax++) if (dd[ax]) { const p = pid[c + 2 * ax + (dd[ax] > 0 ? 0 : 1)], w = Math.abs(d[ax]); if (p >= 0 && w > bw) { best = p; bw = w; } }
      if (best < 0) for (let k = 0; k < 6; k++) if (pid[c + k] >= 0) return pid[c + k]; return best; };
    const link = new Int32Array(NP * NB), Ed = new Float32Array(NP * 3), ids = new Uint16Array(NP);
    for (let p = 0; p < NP; p++) { const c = pc[p] / 6 | 0, k = pc[p] % 6, i = c % nx + D[k][0], l = (c / nx | 0) % nz + D[k][2], j = (c / (nx * nz) | 0) + D[k][1], s0 = P(i, j, l), T = hS[k];
      for (let r = 0; r < NB; r++) { let h = -1; for (let s = T.D0[r]; s < T.D0[r + 1]; s++) if (occ[s0 + T.DD[s]]) { h = meet(T, T.D0[r], s, i, j, l, hemi[k][r]); break; } link[p * NB + r] = h; }
      ids[p] = mid[pc[p]] || mid[at(i, j, l) * 6 + k] || mid[c * 6] || mid[c * 6 + 1] || mid[c * 6 + 2] || mid[c * 6 + 3] || mid[c * 6 + 4] || mid[c * 6 + 5];
      // direct light at the face's middle from every source, shadowed by the solids between (marched from the open cell, to 0.75 m short of the source)
      const fx = lo[0] + (i - D[k][0] / 2) * H, fy = lo[1] + (j - D[k][1] / 2) * H, fz = lo[2] + (l - D[k][2] / 2) * H, ox = lo[0] + i * H, oy = lo[1] + j * H, oz = lo[2] + l * H, nk = D[k];
      for (let s = 0; s < src.length; s += 12) { const line = src[s] === 1 && (src[s + 7] || src[s + 8] || src[s + 9]), K = line ? 3 : 1;
        for (let u = 0; u < K; u++) { const f = K === 1 ? 0 : (u - 1) * 2 / 3, sx = src[s + 1] + f * src[s + 7], sy = src[s + 2] + f * src[s + 8], sz = src[s + 3] + f * src[s + 9];
          const dx = sx - fx, dy = sy - fy, dz = sz - fz, d2 = dx * dx + dy * dy + dz * dz, dl = Math.sqrt(d2), cs = (dx * nk[0] + dy * nk[1] + dz * nk[2]) / dl; if (cs <= 0) continue;
          let e; if (src[s] === 0) { if (dl > src[s + 11]) continue; const ca = -(dx * src[s + 7] + dy * src[s + 8] + dz * src[s + 9]) / dl, c0 = src[s + 10]; if (ca <= c0) continue;
            const x = (ca - c0) / (1 - c0), rg = 1 - (dl / src[s + 11]) ** 4; e = x * x * (3 - 2 * x) * rg * rg / Math.max(d2, .25); }
          else { e = 1 / K / (d2 + .2); if (e * K * (src[s + 4] + src[s + 5] + src[s + 6]) < .006) continue; } // as faint as the shader skips
          e *= cs; if (e * (src[s + 4] + src[s + 5] + src[s + 6]) < 1e-3) continue;
          const ex = sx - ox, ey = sy - oy, ez = sz - oz, el = Math.hypot(ex, ey, ez), M = Math.floor((el - .75) / H); let vis = 1;
          for (let m = 1; m <= M; m++) { const t = m * H / el, I = Math.round(i + ex * t / H), J = Math.round(j + ey * t / H), L = Math.round(l + ez * t / H);
            if (I >= 0 && J >= 0 && L >= 0 && I < nx && J < ny && L < nz && solid[at(I, J, L)]) { vis = 0; break; } }
          if (vis) { Ed[p * 3] += e * src[s + 4]; Ed[p * 3 + 1] += e * src[s + 5]; Ed[p * 3 + 2] += e * src[s + 6]; } } } }
    return { G, N, nx, ny, nz, P, at, D, solid, pid, pc, NP, link, Ed, ids, sS, meet };
  });
  const t1 = Date.now();
  return pal => { const out = [];
    for (const { G, N, nx, ny, nz, P, at, D, solid, pid, NP, link, Ed, ids, sS, meet } of work) { const { lo, n, per, y0, rows, occ, em, old, ops } = G;
      const rho = new Float32Array(NP * 3), Be = new Float32Array(NP * 3); for (let p = 0; p < NP; p++) for (let k = 0; k < 3; k++) rho[p * 3 + k] = pal[ids[p] * 3 + k] ?? .45;
      for (let e = 0; e < em.length; e += 4) { const c = em[e], p = pid[c]; if (p >= 0) for (let k = 0; k < 3; k++) Be[p * 3 + k] += Math.PI * em[e + 1 + k]; }
      let B = new Float32Array(NP * 3), B2 = new Float32Array(NP * 3); const far = [0, 0, 0];
      for (let p = 0; p < NP * 3; p++) B[p] = rho[p] * Ed[p] + Be[p];
      for (let it = 0; it < 8; it++) { far.fill(0); for (let p = 0; p < NP; p++) for (let k = 0; k < 3; k++) far[k] += B[p * 3 + k] / Math.max(1, NP); // a ray that meets nothing near sees the room at large
        for (let p = 0; p < NP; p++) { let r = 0, g = 0, b = 0; for (let q = p * NB; q < p * NB + NB; q++) { const h = link[q]; if (h >= 0) { r += B[h * 3]; g += B[h * 3 + 1]; b += B[h * 3 + 2]; } else { r += far[0]; g += far[1]; b += far[2]; } }
          B2[p * 3] = rho[p * 3] * (Ed[p * 3] + r / NB) + Be[p * 3]; B2[p * 3 + 1] = rho[p * 3 + 1] * (Ed[p * 3 + 1] + g / NB) + Be[p * 3 + 1]; B2[p * 3 + 2] = rho[p * 3 + 2] * (Ed[p * 3 + 2] + b / NB) + Be[p * 3 + 2]; }
        [B, B2] = [B2, B]; }
      // near: a solid within 2 cells along every axis (a box dilation, one axis at a time): only such cells are ever read (a surface's sample
      // point is 0.6 cells off it, between cells at most 2 from it); the rest stay open and plain all round
      let near = solid;
      for (const [st, len] of [[1, nx], [nx, nz], [nx * nz, ny]]) { const o = new Uint8Array(N);
        for (let c = 0; c < N; c++) if (near[c]) { const p = Math.floor(c / st) % len; for (let d = -Math.min(2, p); d <= Math.min(2, len - 1 - p); d++) o[c + d * st] = 1; } near = o; }
      const E = new Float32Array(N * 18), op = new Float32Array(N * 6).fill(1), T = sS;
      for (let j = 0; j < ny; j++) for (let l = 0; l < nz; l++) for (let i = 0; i < nx; i++) { const c = at(i, j, l); if (solid[c] || !near[c]) continue; const c0 = P(i, j, l);
        for (let r = 0; r < NR; r++) { let vis = 1, br = far[0], bg = far[1], bb = far[2];
          for (let s = T.D0[r]; s < T.D0[r + 1]; s++) if (occ[c0 + T.DD[s]]) { const t = T.TV[s]; if (t <= R) vis = (t - H / 2) / R; const h = meet(T, T.D0[r], s, i, j, l, sph[r]); if (h >= 0) { br = B[h * 3]; bg = B[h * 3 + 1]; bb = B[h * 3 + 2]; } break; }
          for (let k = 0; k < 6; k++) { const w = WF[r * 6 + k]; if (!w) continue; op[c * 6 + k] -= w * (1 - vis); E[c * 18 + k * 3] += w * br; E[c * 18 + k * 3 + 1] += w * bg; E[c * 18 + k * 3 + 2] += w * bb; } } }
      // smoothed over the open cells around (3 x 3 x 3, a box a pass per axis, solid and far cells left out): 48 rays each saw the floor's tiles
      // as blotches on the ceiling; a wall's cell is left out, and the far side lies two cells off, so nothing crosses it. Openness stays crisp
      { let m = new Float32Array(N); for (let c = 0; c < N; c++) m[c] = near[c] && !solid[c] ? 1 : 0; const m0 = m.slice(); // only open cells carry light from pass to pass
        for (const [st, len] of [[1, nx], [nx, nz], [nx * nz, ny]]) { const e2 = new Float32Array(N * 18), m2 = new Float32Array(N);
          for (let c = 0; c < N; c++) { if (!m0[c]) continue; const p = Math.floor(c / st) % len;
            for (let d = p > 0 ? -1 : 0; d <= (p < len - 1 ? 1 : 0); d++) { const o = c + d * st; if (!m[o]) continue; m2[c] += m[o]; for (let q = 0; q < 18; q++) e2[c * 18 + q] += E[o * 18 + q]; } }
          E.set(e2); m = m2; }
        for (let c = 0; c < N; c++) if (near[c] && !solid[c] && m[c] > 0) for (let q = 0; q < 18; q++) E[c * 18 + q] /= m[c]; }
      // the light as a share of the room's mean (each channel: the capture carries the room's own colour), its brightness softened (x^0.5, held to
      // 0.4..1.6) and scaled so the room's mean is what the old nearness-to-lamps term gave; faded to plain within 4 m of an opening, where the
      // neighbour's light comes in and the two rooms' captures already meet
      const lum = (r, g, b) => .2126 * r + .7152 * g + .0722 * b, pos = c => [lo[0] + (c % nx) * H, lo[1] + Math.floor(c / (nx * nz)) * H, lo[2] + (Math.floor(c / nx) % nz) * H];
      const mean = [0, 0, 0]; let cnt = 0, oldSum = 0;
      for (let c = 0; c < N; c++) if (near[c] && !solid[c]) { for (let k = 0; k < 6; k++) for (let ch = 0; ch < 3; ch++) mean[ch] += E[c * 18 + k * 3 + ch] / 6; cnt++; }
      for (let ch = 0; ch < 3; ch++) mean[ch] /= Math.max(1, cnt);
      const lit = lum(...mean) > 1e-6, fade = new Float32Array(N);
      if (lit) { const oldT = new Float32Array(N); let oS = 0;
        for (let c = 0; c < N; c++) if (near[c] && !solid[c]) { const [x, y, z] = pos(c); let e = 0; for (let s = 0; s < old.length; s += 4) { const a = x - old[s], b = y - old[s + 1], d = z - old[s + 2]; e += old[s + 3] / (a * a + b * b + d * d + 4); } oldT[c] = e; oS += e; }
        const oM = oS / Math.max(1, cnt); let nS = 0;
        for (let c = 0; c < N; c++) if (near[c] && !solid[c]) { oldSum += old.length ? Math.min(1.3, Math.max(.55, (oldT[c] / oM) ** .4)) : 1;
          for (let k = 0; k < 6; k++) { const q = c * 18 + k * 3, r = E[q] / mean[0], g = E[q + 1] / mean[1], b = E[q + 2] / mean[2], L = lum(r, g, b), Lc = Math.min(1.6, Math.max(.4, Math.sqrt(L))), s = L > 1e-6 ? Lc / L : 0, h = s ? .5 : 0; // h: half the colour (a full share painted the soft play's grey ceiling in its tiles' colours)
            E[q] = Lc + h * (r * s - Lc); E[q + 1] = Lc + h * (g * s - Lc); E[q + 2] = Lc + h * (b * s - Lc); nS += Lc / 6; } }
        const scale = .9 * oldSum / Math.max(1e-6, nS); // .9: matched by cells the room averaged a few percent brighter on screen than before (the 46 standard views)
        for (let c = 0; c < N; c++) if (near[c] && !solid[c]) { const [x, , z] = pos(c); let d = 1e9;
          for (let o = 0; o < ops.length; o += 7) {
            if (ops[o]) { const sd = (x - ops[o + 1]) * ops[o + 3] + (z - ops[o + 2]) * ops[o + 4], ac = -(x - ops[o + 1]) * ops[o + 4] + (z - ops[o + 2]) * ops[o + 3]; d = Math.min(d, Math.hypot(sd, Math.max(0, Math.abs(ac) - ops[o + 5] / 2))); } // a portal's end
            else { const u = ops[o + 1] ? z : x, v = ops[o + 1] ? x : z; d = Math.min(d, Math.hypot(u - ops[o + 2], Math.max(ops[o + 3] - v, v - ops[o + 4], 0))); } } // a doorway on the line u = at, v from lo to hi
          fade[c] = Math.min(1, Math.max(0, (d - 1) / 3)); for (let q = c * 18; q < c * 18 + 18; q++) E[q] = 1 + (E[q] * scale - 1) * fade[c]; } }
      // the light each open cell stores; a solid cell lends a lookup whose every tap is solid (a surface beside a second one: a wall under the
      // ceiling, in a corner; the solid cells reach up to half a cell past a face) the light of the open cell its face looks into, else the
      // mean of its lent or open neighbours but the one behind it (two rounds), at weight LW: an open tap still outweighs it 32 to 1. Was plain 1
      // there, a bright frame round every wall whose corners baked darker
      const V = new Float32Array(N * 18), F = new Uint8Array(N * 6), LW = 1 / 32;
      for (let c = 0; c < N; c++) if (!solid[c]) for (let k = 0; k < 6; k++) { const w = op[c * 6 + k]; for (let ch = 0; ch < 3; ch++) V[c * 18 + k * 3 + ch] = w * (near[c] && lit ? E[c * 18 + k * 3 + ch] : 1); F[c * 6 + k] = 1; }
      const nb = (c, d) => { const i = c % nx + D[d][0], l = (c / nx | 0) % nz + D[d][2], j = (c / (nx * nz) | 0) + D[d][1]; return i < 0 || j < 0 || l < 0 || i >= nx || j >= ny || l >= nz ? -1 : at(i, j, l); };
      for (let c = 0; c < N; c++) if (solid[c]) for (let k = 0; k < 6; k++) { const o = nb(c, k); if (o >= 0 && !solid[o]) { V.copyWithin(c * 18 + k * 3, o * 18 + k * 3, o * 18 + k * 3 + 3); F[c * 6 + k] = 2; } }
      for (let round = 0; round < 2; round++) { const F0 = F.slice();
        for (let c = 0; c < N; c++) if (solid[c]) for (let k = 0; k < 6; k++) { if (F0[c * 6 + k]) continue; let m = 0;
          for (let d = 0; d < 6; d++) { const o = d === (k ^ 1) ? -1 : nb(c, d); if (o < 0 || !F0[o * 6 + k]) continue; m++; for (let ch = 0; ch < 3; ch++) V[c * 18 + k * 3 + ch] += V[o * 18 + k * 3 + ch]; }
          if (m) { for (let ch = 0; ch < 3; ch++) V[c * 18 + k * 3 + ch] /= m; F[c * 6 + k] = 3; } } }
      const o16 = new Uint16Array(AW * rows * 4), one = half(1), lw = half(LW);
      for (let j = 0; j < ny; j++) for (let k = 0; k < 6; k++) { const t = 6 * j + k, tx = (t % per) * nx, ty = Math.floor(t / per) * nz; // layer j: tiles 6j .. 6j + 5 are +x -x +y -y +z -z
        for (let l = 0; l < nz; l++) for (let i = 0; i < nx; i++) { const c = at(i, j, l), q = ((ty + l) * AW + tx + i) * 4, f = F[c * 6 + k]; if (!f) continue; // deep in a solid: 0 everywhere, weight 0
          const w = f === 1 ? 1 : LW; for (let ch = 0; ch < 3; ch++) o16[q + ch] = half(w * V[c * 18 + k * 3 + ch]); o16[q + 3] = f === 1 ? one : lw; } }
      out.push({ y0, rows, out: o16, patches: NP }); }
    return { grids: out, ms: [t1 - t0, Date.now() - t1] }; };
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
const agJob = agRows ? ambientGrid() : null; // workers work them out while the GPU compiles
libBaked.then(() => { if (!agJob) return; const t0 = performance.now(); agJob.send(agPalette(agJob.mats)); performance.measure('load: ambient grids, colours', { start: t0 }); }); // the materials' colours, for the bounces, as soon as the library is baked
try { await compiled; } catch (e) { console.warn('compiling ahead failed, compiling as drawn instead', e); }
performance.mark('load: scene compiled');
await libBaked; // the bakes draw with the library's textures
for (const w of ponds) w.visible = false; // a pool's nested renders would reset the active cube face
bakeFixtures(); // before the zone bakes, which see the fixtures' light
if (agJob) { const t0 = performance.now(), res = await agJob.done; performance.measure('load: ambient grids, waited', { start: t0 });
  agJob.ms = res.map(r => r.ms); agJob.patches = res.reduce((n, r) => n + r.grids.reduce((m, g) => m + g.patches, 0), 0); // for the probes: each worker's [rays and direct light, bounces and gather] ms
  for (const r of res) for (const g of r.grids) { const t = new THREE.DataTexture(g.out, AW, g.rows, THREE.RGBAFormat, THREE.HalfFloatType); renderer.copyTextureToTexture(t, fixRT.texture, null, new THREE.Vector2(0, fixH + g.y0)); t.dispose(); } } // the grids under the fixtures' maps
bake({ probe: V(-200, 3, -12) }, [seaMat], 1); bakingU.value = 1;
for (let pass = 0; pass < 2; pass++) for (const z of Object.values(zones)) { // second pass picks up the first bounce, including through doorways
  if (z.mats.length) bake(z); // the dark passages have nothing to light
  if (pass && z.mats.length) for (const w of ponds) w.drawPlan(z); // each pool's plan, the part in this room
}
bakingU.value = 0; env0.dispose(); performance.mark('load: zones baked'); // every material has its bake's now
const zone0 = Object.values(zones).find(z => inR(camera.position.x, camera.position.z, ...z.box)) || zones.bA;
setSky(zone0.sky || 'day'); relight(camera.position, zone0, 1); relight(camera.position, zone0, 1); // the zone you start in

export { lights, relight, bake, zone0, openings, weights, view, agJob };
