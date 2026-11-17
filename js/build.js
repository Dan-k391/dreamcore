// The level builder: shapes go into one list per material and are merged into one mesh each at the end (merge(), run by level.js).
// The registries here are how places hand things to the rest of the game without knowing about each other.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry as RoundedBox } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { renderer, scene, camera, V, H, inR, zones } from './core.js';
import generatedSeen from './seen.js';
import { seaMat, noCast, voidMat, aisle } from './mat.js';

// ---------- level builder: boxes and cut-out wall slabs with world-space UVs, merged into one mesh per material ----------
// Solids, everything the player and loose bodies collide with: [x1, z1, x2, z2, y1, y2] is an upright box. A 7th entry makes it
// another shape inside that rectangle: a number r, an upright cylinder of radius r round its middle; [cx, cz, cos, sin, hx, hz], a box
// of half-size hx by hz turned about the vertical (see turned). A solid blocks the body sideways where it overlaps it above step
// height, its top is ground, its underside stops a jump (player.js). box() adds one for itself; solid(), round() and turned() add one
// for things built otherwise.
const colliders = [], geo = new Map(), emitters = [];
const solid = (x1, y1, z1, x2, y2, z2) => colliders.push([x1, z1, x2, z2, y1, y2]);
const round = (x, z, r, y1, y2) => colliders.push([x - r, z - r, x + r, z + r, y1, y2, r]);
const turn = (k, cx, cz, hx, hz, ry) => { // (re)set solid k to a box of half-size hx, hz centred at cx, cz and turned by rotateY(ry): a moving leaf moves its solid in place
  const c = Math.cos(ry), s = Math.sin(ry), ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
  k[0] = cx - ex; k[1] = cz - ez; k[2] = cx + ex; k[3] = cz + ez; k[6] = [cx, cz, c, s, hx, hz]; return k;
};
const turned = (cx, cz, hx, hz, ry, y1, y2) => { const k = turn([0, 0, 0, 0, y1, y2], cx, cz, hx, hz, ry); colliders.push(k); return k; }; // the solid of a turned box
const doors = []; // openable doors (props/metalwork.js door() with o.openable): { meshes, set(f), f, to, ... }, swung on E by player.js
const loose = []; // loose balls, moved by physics.js: { mesh (a Mesh, or an InstancedMesh for many), r, pos [x, y, z per ball], region [x1, z1, x2, z2] they live in,
// bounce, grip (rolling resistance, m/s²), and if they apply: float (density against water's), spin (it rolls visibly), solid (it stops the body),
// slope (follows a sloping floor), pour (settle this many steps at load), seen (zone ids it is drawn from), cap (top speed, m/s; 7 if not given) }
const flats = []; // [x1, z1, x2, z2, (x, z) => height]: floors that are not at 0, pools included (each pool place registers its own). A later one overrides an earlier one
const seeThrough = [], skyOnly = { hill: [], dusk: [], night: [] }; // things the AO pass must skip; things only one sky has
const warps = []; // [x1, z1, x2, z2, dx, dz]: standing in the rectangle moves you by the offset
const pools = []; // each pool, registered by its place, made into water by water.js: x1, z1, x2, z2, floor height, zone, zones it is drawn from, scattered light
const onSun = []; // f(sun): run once the sun exists, for things built before it that use its shadow map
const ladders = []; // [x1, z1, x2, z2, dx, dz, top]: a ladder's zone, the way up it (unit, toward the deck) and the deck's height; moving that way climbs, the other way descends
const rings = []; // floating rings: bob on the water (see frame)
// Portals: two openings joined as if they were one doorway (docs/building.md, Portals). portal(a, b, w, h) with a, b = [x, y, z, ry]: the
// middle of each opening's sill on its plane, and the way its front faces as rotateY(ry) turns +z (the front is the side you stand on before
// going through). Each end: p, ry, n (front), r (across), w, h, to (the other end), turn (yaw added going through), M (this side's space into
// the other's); zone (its front's zone) and mask (the layers drawn looking out of it) once merge() runs. js/portals.js draws what is seen
// through; player.js walks and collides through; lights.js blends the mood and ranks the lamps through.
const ends = [];
function portal(a, b, w = 1, h = 2.24, da = null, db = null) { // da, db: the openable door() in the opening seen from each end (db: da's copy through the link, door(..., { copy: da }))
  const mk = ([x, y, z, ry]) => ({ p: V(x, y, z), ry, n: V(Math.sin(ry), 0, Math.cos(ry)), r: V(Math.cos(ry), 0, -Math.sin(ry)), w, h }), A = mk(a), B = mk(b); A.door = da; B.door = db;
  for (const [e, f] of [[A, B], [B, A]]) { e.to = f; e.turn = f.ry - e.ry + Math.PI; e.c = Math.cos(e.turn); e.s = Math.sin(e.turn);
    e.M = new THREE.Matrix4().makeTranslation(f.p.x, f.p.y, f.p.z).multiply(new THREE.Matrix4().makeRotationY(e.turn)).multiply(new THREE.Matrix4().makeTranslation(-e.p.x, -e.p.y, -e.p.z)); }
  ends.push(A, B); return [A, B];
}
const side = (e, x, z) => (x - e.p.x) * e.n.x + (z - e.p.z) * e.n.z, across = (e, x, z) => (x - e.p.x) * e.r.x + (z - e.p.z) * e.r.z; // metres in front of its plane; along it from its middle
const carry = (e, x, z) => { const dx = x - e.p.x, dz = z - e.p.z; return [e.to.p.x + e.c * dx + e.s * dz, e.to.p.z - e.s * dx + e.c * dz]; }; // a point taken through e
const via = (e, x, y, z, ry) => { const [X, Z] = carry(e, x, z); return [X, y + e.to.p.y - e.p.y, Z, ry + e.turn]; }; // a pose [x, y, z, ry] taken through e (a door's copy: door(...via(e, x, y, z, ry), { copy }))
const spin = (e, x, z) => [e.c * x + e.s * z, -e.s * x + e.c * z]; // a direction taken through e
const live = e => !e.door || e.door.f > 0, gap = e => e.door ? Math.min(1, e.door.f * 4) : 1; // a portal behind a shut leaf is not drawn, lit for or heard through; its share of the mood grows as the leaf opens
const reveal = (e, x, z, back = 0) => { const d = side(e, x, z); return d >= -back && d < 1 && Math.abs(across(e, x, z)) < e.w / 2; }; // in the 1 m strip in front of e's opening (its reveal, whichever zone's box holds it)
const behind = (e, c) => Math.max(side(e, c[0], c[1]), side(e, c[2], c[1]), side(e, c[0], c[3]), side(e, c[2], c[3])) < 1e-3; // a solid's rectangle wholly at or behind e's plane
function add(mat, g, ownUV = false) { // ownUV: keep the geometry's own UVs (a library material's `uv` option says how many metres one unit is)
  g = g.index ? g.toNonIndexed() : g;
  if (!ownUV) boxUV(g);
  geo.has(mat) ? geo.get(mat).push(g) : geo.set(mat, [g]);
}
function boxUV(g) { // world-space UVs by the face's main axis (a moving part takes them from its own space)
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > .5) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (Math.abs(n.getX(i)) > .5) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}
// three's rounded box: the places ask for about 3800 of only about 550 kinds, so each kind is built once (its corner maths is a
// sizeable share of the load) and handed out as a copy; works with `new`, as the places call it.
const rounded = new Map();
function RoundedBoxGeometry(...a) { const k = a.join(); if (!rounded.has(k)) rounded.set(k, new RoundedBox(...a)); return new THREE.BufferGeometry().copy(rounded.get(k)); }
const block = (mat, x1, y1, z1, x2, y2, z2) => add(mat, new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)); // a box that never blocks
function box(mat, x1, y1, z1, x2, y2, z2) { // a box that is solid, all of it: walls, floors, ceilings, seats
  block(mat, x1, y1, z1, x2, y2, z2);
  if (y2 - y1 >= .02) solid(x1, y1, z1, x2, y2, z2); // a flush inlay is not something to bump into
}
// A flight of n solid steps filling the rectangle, climbing toward its high end (up = 1) or its low end (-1) along x or z, from height y0
function flight(mat, x1, z1, x2, z2, axis, up, y0, n, rise = .25, base = y0 - .2) {
  const a1 = axis === 'x' ? x1 : z1, run = ((axis === 'x' ? x2 : z2) - a1) / n, nth = a => { const i = Math.max(0, Math.min(n - 1, Math.floor((a - a1) / run))); return up > 0 ? i : n - 1 - i; };
  for (let i = 0; i < n; i++) { const a = a1 + run * i, y = y0 + rise * (nth(a + run / 2) + 1); axis === 'x' ? block(mat, a, base, z1, a + run, y, z2) : block(mat, x1, base, a, x2, y, a + run); }
  flats.push([x1, z1, x2, z2, (x, z) => y0 + rise * (nth(axis === 'x' ? x : z) + 1)]);
}
// A dark passage with aisle lights along the floor, built twice: once here and once at its twin's place. Walking into the
// closed half of either puts you at the same spot in the other, whose open end leads somewhere else entirely. Both look
// the same and the dark hides the far ends, so the move can't be seen.
// t: the depth of the twin place's wall the twin's open end runs into; the twin stops at that wall's back face, so the doorway's
// reveal, soffit and floor are the place's own faces, not the passage's lying in the same planes.
function passage(x1, z1, x2, z2, lo, dx, dz, sky, t = 0) {
  const X = x2 - x1 > z2 - z1;
  for (const c of [0, 1]) {
    const ox = c * dx, oz = c * dz, [a1, b1, a2, b2] = X ? [x1 + ox, z1 + oz, x2 + ox, z2 + oz] : [z1 + oz, x1 + ox, z2 + oz, x2 + ox], mid = (a1 + a2) / 2, high = lo === !c; // high: closed at its high end
    const B = (m, p1, y1, q1, p2, y2, q2) => X ? box(m, p1, y1, q1, p2, y2, q2) : box(m, q1, y1, p1, q2, y2, p2);
    const e1 = high && c ? a1 + t : a1, e2 = high || !c ? a2 : a2 - t; // the walls' ends: the open end trimmed for the twin
    B(voidMat, e1, -.2, b1, e2, 0, b2); B(voidMat, e1, 2.4, b1, e2, 2.6, b2); B(voidMat, e1, 0, b1 - .3, e2, 2.4, b1); B(voidMat, e1, 0, b2, e2, 2.4, b2 + .3);
    B(voidMat, high ? a2 : a1 - .3, 0, b1 - .3, high ? a2 + .3 : a1, 2.6, b2 + .3);
    for (let a = a1 + .5; a < e2; a++) if (a > e1) for (const b of [b1 + .08, b2 - .08]) B(aisle, a - .03, 0, b - .03, a + .03, .012, b + .03);
    // the warps: two 0.32 m strips meeting at the middle (more than a body moves in one frame, 6 m/s for the 0.05 s frame cap), so both ends of each
    // move stay more than lights.js's BAND from both mouths (it asserts so); each lands just outside the other, so turning round there does not jump back
    const L = mid, [h1, h2] = high ? [L, L + .32] : [L - .32, L], s = c ? -1 : 1;
    warps.push(X ? [h1, b1, h2, b2, s * dx, s * dz] : [b1, h1, b2, h2, s * dx, s * dz]);
  }
}
// Wall slab with shapes cut out of it. axis 'x': runs a1..a2 along x, occupying z = at..at+depth; axis 'z': the same along z.
// cuts: ['arch', centre, width, top] (niche rising from the floor), ['pill', centre, width, y, height], ['round', centre, diameter, y]
function slab(mat, axis, at, depth, a1, a2, y1, y2, cuts, through = false) { // through: the arches are openings to walk through, not niches
  const sh = new THREE.Shape().moveTo(a1, y1).lineTo(a1, y2).lineTo(a2, y2).lineTo(a2, y1);
  for (const [, c, w, top] of cuts.filter(c => c[0] === 'arch').sort((p, q) => q[1] - p[1]))
    sh.lineTo(c + w / 2, y1).lineTo(c + w / 2, top - w / 2).absarc(c, top - w / 2, w / 2, 0, Math.PI, false).lineTo(c - w / 2, y1);
  sh.closePath();
  for (const [kind, c, w, y, h] of cuts) if (kind !== 'arch') {
    const p = new THREE.Path();
    if (kind === 'pill') p.absarc(c, y + h / 2 - w / 2, w / 2, 0, Math.PI, false).absarc(c, y - h / 2 + w / 2, w / 2, Math.PI, 2 * Math.PI, false);
    else p.absarc(c, y, w / 2, 0, 2 * Math.PI, false);
    p.closePath(); sh.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 24 });
  add(mat, axis === 'x' ? g.translate(0, 0, at) : g.rotateY(-Math.PI / 2).translate(at + depth, 0, 0));
  let a = a1; // the solid: the whole slab, or the piers between walk-through arches and the curved heads over them in eight bands
  const part = (p, q, lo, hi) => axis === 'x' ? solid(p, lo, at, q, hi, at + depth) : solid(at, lo, p, at + depth, hi, q);
  const pier = b => { if (b - a > .01) part(a, b, y1, y2); };
  if (through) for (const [, c, w, top] of cuts.filter(c => c[0] === 'arch').sort((p, q) => p[1] - q[1])) {
    pier(c - w / 2); a = c + w / 2;
    for (let i = 0; i < 8; i++) { const u = Math.max(Math.abs(i / 4 - 1), Math.abs((i + 1) / 4 - 1)) * w / 2; // each band as low as the curve drawn over it, so the body (1.7 m with its ducked top) passes only where the eye stays under the arch
      part(c - w / 2 + w * i / 8, c - w / 2 + w * (i + 1) / 8, top - w / 2 + Math.sqrt(Math.max(0, w * w / 4 - u * u)), y2); }
  }
  pier(a2);
}
const room = (z, x1, z1, x2, z2, h) => { box(z.carpet, x1, -.2, z1, x2, 0, z2); box(z.ceil, x1, h, z1, x2, h + .2, z2); };
const wall = (z, x1, z1, x2, z2, h = H) => { box(z.paper, x1, 0, z1, x2, h, z2); box(z.trim, x1 - .012, 0, z1 - .012, x2 + .012, .1, z2 + .012); };
const fixture = (z, x, y, zc, power, seg) => { (z.fix ||= []).push(V(x, y, zc)); z.fix.at(-1).w = power; z.fix.at(-1).seg = seg; console.assert(z.fix.length <= 24, 'over 24 fixtures in ' + z.id); }; // a light every material of this zone computes, shadowed by a map baked at load (lights.js), up to 24 a zone; seg [dx, dy, dz]: a line of light from p - seg to p + seg (a cove's strip), its power spread evenly along it
const tube = (pts, r, seg, mat) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p))), seg, r, 16), mat); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
const lit = (z, x, y, zc, power, to = [x, 0, zc], angle = 1.35, dist = 12, color = 0xffdfb0) => emitters.push({ zone: z, p: V(x, y, zc), t: V(...to), power, angle, dist, color });
// Kit objects (js/props/, docs/props.md) are built about their own origin, feet at y 0, front toward +z, and set in the world by put():
// turned by ry about the vertical, then moved to x, y, z. spot() is where a point of the object's own plan lands; solidAt() the solid
// of a w x h x d box centred at (cx, cy, cz) in the object's frame.
const put = (g, x, y, z, ry = 0) => g.rotateY(ry).translate(x, y, z);
const spot = (x, z, ry, px, pz) => [x + px * Math.cos(ry) + pz * Math.sin(ry), z - px * Math.sin(ry) + pz * Math.cos(ry)];
const solidAt = (x, y, z, ry, cx, cy, cz, w, h, d) => { const [a, b] = spot(x, z, ry, cx, cz); turned(a, b, w / 2, d / 2, ry, y + cy - h / 2, y + cy + h / 2); };
const floorH = (x, z, list = flats) => { let y = 0; for (const f of list) if (inR(x, z, f[0], f[1], f[2], f[3])) y = f[4](x, z); return y; };
// The shortest move that takes a ball of radius r at (x, y, z) out of solid c, into `out`; false if they don't touch.
// y = null: a circle on the plan, height ignored (the caller tests heights).
const out = { x: 0, y: 0, z: 0 };
function clear(c, x, y, z, r) {
  const o = c[6], turn = Array.isArray(o);
  let px = x, pz = z, ax = c[0], az = c[1], bx = c[2], bz = c[3];
  if (turn) { const dx = x - o[0], dz = z - o[1]; px = dx * o[2] - dz * o[3]; pz = dx * o[3] + dz * o[2]; ax = -o[4]; az = -o[5]; bx = o[4]; bz = o[5]; }
  let qx, qz, inside, mx, my = 0, mz;
  const cyl = typeof o === 'number', cx = (ax + bx) / 2, cz = (az + bz) / 2, dx = px - cx, dz = pz - cz, d = cyl ? Math.hypot(dx, dz) : 0;
  if (cyl) { inside = d <= o; const k = inside ? 1 : o / d; qx = cx + dx * k; qz = cz + dz * k; }
  else { qx = Math.min(bx, Math.max(ax, px)); qz = Math.min(bz, Math.max(az, pz)); inside = qx === px && qz === pz; }
  const qy = y === null ? 0 : Math.min(c[5], Math.max(c[4], y));
  if (!inside || (y !== null && qy !== y)) { // centre outside: straight away from the nearest point
    mx = px - qx; mz = pz - qz; if (y !== null) my = y - qy;
    const d2 = mx * mx + my * my + mz * mz; if (d2 >= r * r) return false;
    const k = (r - Math.sqrt(d2)) / Math.sqrt(d2); mx *= k; my *= k; mz *= k;
  } else { // centre inside: out through the nearest face
    let best = Infinity; mx = mz = 0;
    const face = (len, fx, fy, fz) => { if (len < best) { best = len; mx = fx * len; my = fy * len; mz = fz * len; } };
    if (cyl) { const k = d > 1e-9 ? 1 / d : 0; face(o - d + r, d > 1e-9 ? dx * k : 1, 0, dz * k); }
    else { face(px - ax + r, -1, 0, 0); face(bx - px + r, 1, 0, 0); face(pz - az + r, 0, 0, -1); face(bz - pz + r, 0, 0, 1); }
    if (y !== null) { face(y - c[4] + r, 0, -1, 0); face(c[5] - y + r, 0, 1, 0); }
  }
  if (turn) { out.x = mx * o[2] + mz * o[3]; out.z = -mx * o[3] + mz * o[2]; } else { out.x = mx; out.z = mz; }
  out.y = my; return true;
}
const near = (c, x, z, r) => x > c[0] - r && x < c[2] + r && z > c[1] - r && z < c[3] + r; // within r of a solid's rectangle
let sea;
// One mesh per material per zone, the zone being the one whose box holds a piece's centre: a mesh is then only as big as one place,
// so frustum culling works. Each zone listed in seen.js (made by tools/pvs.mjs) also gets a layer bit, and a camera draws only the
// zones seen.js says can be seen from where it stands: places behind walls further down a view cost nothing. A zone not in seen.js
// (a new place, until tools/pvs.mjs is run again) stays on layer 0, always drawn; a camera outside every listed zone draws all.
// Shadow cameras always draw everything; a cube camera (a zone's ambient bake) draws what seen.js says its probe's zone sees.
// Only 31 bits: zones seen from exactly the same zones (a place and its passage, say) share one, which culls exactly as well; past
// 31 such groups the two whose viewers differ least are merged, so a few zones are drawn from a little further, never from everywhere.
// This optional study is fully enclosed: it sees only itself. Feed it through the same
// layer allocator (including the 31-bit limit), without modifying generated PVS data
// or any normal-game masks. Keep the all-layer shadow rendering below unchanged.
const seen = new URLSearchParams(location.search).get('scene') === 'prism'
  ? { ...generatedSeen, prism: [] } : generatedSeen;
const ids = Object.keys(seen), groups = [];
for (const q of ids) { const by = new Set(ids.filter(c => c === q || seen[c].includes(q))), g = groups.find(g => g.by.size === by.size && [...by].every(c => g.by.has(c)));
  g ? g.ids.push(q) : groups.push({ ids: [q], by }); }
while (groups.length > 31) { let best, cost = Infinity; // cost: zone-from-zone pairs drawn that seen.js does not ask for
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) { const [a, b] = [groups[i], groups[j]];
    const c = a.ids.length * [...b.by].filter(v => !a.by.has(v)).length + b.ids.length * [...a.by].filter(v => !b.by.has(v)).length; if (c < cost) { cost = c; best = [i, j]; } }
  const [a, b] = [groups[best[0]], groups[best[1]]]; a.ids.push(...b.ids); for (const v of b.by) a.by.add(v); groups.splice(best[1], 1); }
const bits = new Map(groups.flatMap((g, i) => g.ids.map(id => [id, i + 1]))), masks = new Map(), _c = new THREE.Vector3();
for (const [id, list] of Object.entries(seen)) if (bits.has(id)) masks.set(id, [id, ...list].reduce((m, q) => m | (bits.has(q) ? 1 << bits.get(q) : 0), 1));
let zl; // the zones as a list, made once merge() starts: zoneAt runs once per piece of geometry
const zoneAt = (x, z) => { for (const q of zl) { const b = q.box; if (x > b[0] && x < b[2] && z > b[1] && z < b[3]) return q; } };
function maskAt(x, z) { // the layers a camera at (x, z) draws: -1 is all
  let m = 0, any = false;
  for (const q of Object.values(zones)) if (inR(x, z, ...q.box)) { any = true; const k = masks.get(q.id); if (k === undefined) return -1; m |= k; }
  return any ? m : -1;
}
// What the feet stand on (sound.js): the top of every slab, step and box, kept by its material's name on a 2 m grid. A curved or tall shape
// (a hill, a lathe) is left out: its bounding box's top is not a floor. Looked up a few times a second, never per frame.
const floors = new Map(), FC = 2;
function addFloor(g, name) {
  const b = g.boundingBox; if (b.max.y - b.min.y > .6 && g.attributes.position.count > 36) return;
  const i1 = Math.floor(b.min.x / FC), i2 = Math.floor(b.max.x / FC), k1 = Math.floor(b.min.z / FC), k2 = Math.floor(b.max.z / FC); if ((i2 - i1 + 1) * (k2 - k1 + 1) > 4000) return;
  const e = [b.min.x, b.min.z, b.max.x, b.max.z, b.max.y, name, (b.max.x - b.min.x) * (b.max.z - b.min.z)];
  for (let i = i1; i <= i2; i++) for (let k = k1; k <= k2; k++) { const key = i * 65536 + k, l = floors.get(key); l ? l.push(e) : floors.set(key, [e]); }
}
function floorAt(x, z, feet) { // the material (or `userData.surface`) of the highest top under (x, z) level with the soles; on a tie the smaller piece (a rug on a floor)
  let best = null; for (const e of floors.get(Math.floor(x / FC) * 65536 + Math.floor(z / FC)) || [])
    if (x >= e[0] && x <= e[2] && z >= e[1] && z <= e[3] && e[4] > feet - .15 && e[4] < feet + .06 && (!best || e[4] > best[4] + .005 || e[4] > best[4] - .005 && e[6] < best[6])) best = e;
  return best ? best[5] : null;
}
function merge() { // once every place is built (level.js)
  for (const c of colliders) if (c.length === 4) c.push(-1e4, 1e4); // a bare rectangle is a wall of any height
  rounded.clear();
  zl = Object.values(zones);
  for (const [m, list] of geo) {
    const parts = new Map();
    const fl = m.userData.surface || m.userData.lib;
    for (const g of list) { g.computeBoundingBox(); if (fl) addFloor(g, fl); g.boundingBox.getCenter(_c); const id = m === seaMat ? '' : zoneAt(_c.x, _c.z)?.id || ''; parts.has(id) ? parts.get(id).push(g) : parts.set(id, [g]); }
    for (const [id, part] of parts) {
      const mesh = new THREE.Mesh(mergeGeometries(part), m); mesh.castShadow = !noCast.has(m); mesh.receiveShadow = m !== seaMat; mesh.userData.zone = id;
      if (bits.has(id)) mesh.layers.set(bits.get(id));
      scene.add(mesh); if (m === seaMat) sea = mesh;
    }
  }
  // rings and floating balls stay in their pool: on its zone's layer, or they are drawn from every place whose view they fall in (the
  // pool hall's rings drew from the great baths, 2 km off, through every wall between)
  const own = (m, x, z) => { const id = zoneAt(x, z)?.id; if (bits.has(id)) m.layers.set(bits.get(id)); };
  for (const m of rings) own(m, m.position.x, m.position.z);
  for (const g of loose) if (g.float && !g.mesh.isInstancedMesh) own(g.mesh, (g.region[0] + g.region[2]) / 2, (g.region[1] + g.region[3]) / 2);
  for (const d of doors) for (const m of d.meshes) { const id = (d.zone ?? zoneAt(d.x, d.z))?.id; m.userData.zone = id || ''; if (bits.has(id)) m.layers.set(bits.get(id)); }
  camera.layers.enableAll(); // until the first frame sets it: everything compiles and bakes as before
  // three culls shadow casters by the viewing camera's layers, not the shadow camera's: a map redrawn while you stand in one zone
  // would lack every wall that zone cannot see, and its light would pour through them once you walk round (the backrooms' sun wedge).
  const sm = renderer.shadowMap, drawShadows = sm.render;
  sm.render = (lights, s, cam) => { const m = cam.layers.mask; cam.layers.enableAll(); drawShadows.call(sm, lights, s, cam); cam.layers.mask = m; };
  for (const e of ends) { const f = e.p.clone().addScaledVector(e.n, .3); e.zone = zoneAt(f.x, f.z); e.mask = maskAt(f.x, f.z); e.bit = bits.has(e.zone?.id) ? 1 << bits.get(e.zone.id) : 1; }
  console.assert(ends.every(e => e.zone && e.w === e.to.w && e.h === e.to.h), 'a portal end outside every zone, or its two ends of different sizes');
  scene.onBeforeRender = (r, s, cam) => {
    if (!cam.isPerspectiveCamera) cam.layers.enableAll();
    else { const x = cam.matrixWorld.elements[12], z = cam.matrixWorld.elements[14]; let m = cam.userData.mask ?? maskAt(x, z);
      for (const e of ends) if (m !== -1 && reveal(e, x, z, .01)) m |= e.mask; // in a portal's reveal (outside its zone's box, inside a neighbour's): see as its zone
      cam.layers.mask = m; }
  };
}

export { doors, via, turn, boxUV, live, gap, ends, portal, side, across, carry, spin, behind, reveal, colliders, emitters, flats, seeThrough, skyOnly, warps, pools, onSun, ladders, rings, loose, add, block, box, solid, round, turned, clear, out, near, flight, passage, slab, room, wall, fixture, tube, lit, put, spot, solidAt, floorH, sea, merge, maskAt, RoundedBoxGeometry, floorAt };
