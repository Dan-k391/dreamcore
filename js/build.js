// The level builder: shapes go into one list per material and are merged into one mesh each at the end (merge(), run by level.js).
// The registries here are how places hand things to the rest of the game without knowing about each other.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, V, H, inR } from './core.js';
import { lampOn, lampOff, seaMat, noCast, voidMat, aisle } from './mat.js';

// ---------- level builder: boxes and cut-out wall slabs with world-space UVs, merged into one mesh per material ----------
const colliders = [], geo = new Map(), emitters = [];
const flats = []; // [x1, z1, x2, z2, (x, z) => height]: floors that are not at 0, pools included (each pool place registers its own). A later one overrides an earlier one
const seeThrough = [], skyOnly = { hill: [], dusk: [], night: [] }; // things the AO pass must skip; things only one sky has
const warps = []; // [x1, z1, x2, z2, dx, dz]: standing in the rectangle moves you by the offset
const pools = []; // each pool, registered by its place, made into water by water.js: x1, z1, x2, z2, floor height, zone, zones it is drawn from, scattered light
const onSun = []; // f(sun): run once the sun exists, for things built before it that use its shadow map
// props: chrome ladder, floating rings, water slide spiralling round a column
const ladders = []; // [x1, z1, x2, z2] zones in the water where facing the ladder and pressing forward climbs it
const rings = []; // floating rings: bob on the water (see frame)
function add(mat, g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > .5) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (Math.abs(n.getX(i)) > .5) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  geo.has(mat) ? geo.get(mat).push(g) : geo.set(mat, [g]);
}
const block = (mat, x1, y1, z1, x2, y2, z2) => add(mat, new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)); // a box that never blocks
function box(mat, x1, y1, z1, x2, y2, z2) {
  block(mat, x1, y1, z1, x2, y2, z2);
  if (y1 < 1.7 && y2 > .3) colliders.push([x1, z1, x2, z2]); // anything at body height blocks the player
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
function passage(x1, z1, x2, z2, lo, dx, dz) {
  const X = x2 - x1 > z2 - z1;
  for (const c of [0, 1]) {
    const ox = c * dx, oz = c * dz, [a1, b1, a2, b2] = X ? [x1 + ox, z1 + oz, x2 + ox, z2 + oz] : [z1 + oz, x1 + ox, z2 + oz, x2 + ox], mid = (a1 + a2) / 2, high = lo === !c; // high: closed at its high end
    const B = (m, p1, y1, q1, p2, y2, q2) => X ? box(m, p1, y1, q1, p2, y2, q2) : box(m, q1, y1, p1, q2, y2, p2);
    B(voidMat, a1, -.2, b1, a2, 0, b2); B(voidMat, a1, 2.4, b1, a2, 2.6, b2); B(voidMat, a1, 0, b1 - .3, a2, 2.4, b1); B(voidMat, a1, 0, b2, a2, 2.4, b2 + .3);
    B(voidMat, high ? a2 : a1 - .3, 0, b1 - .3, high ? a2 + .3 : a1, 2.6, b2 + .3);
    for (let a = a1 + .5; a < a2; a++) for (const b of [b1 + .08, b2 - .08]) B(aisle, a - .03, 0, b - .03, a + .03, .012, b + .03);
    const [h1, h2] = high ? [mid, a2] : [a1, mid], s = c ? -1 : 1;
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
  let a = a1; // solid stretches block the player: the whole slab, or just the piers between walk-through arches
  const pier = b => { if (b - a > .01) colliders.push(axis === 'x' ? [a, at, b, at + depth] : [at, a, at + depth, b]); };
  if (through) for (const [, c, w] of cuts.filter(c => c[0] === 'arch').sort((p, q) => p[1] - q[1])) { pier(c - w / 2); a = c + w / 2; }
  pier(a2);
}
const room = (z, x1, z1, x2, z2, h) => { box(z.carpet, x1, -.2, z1, x2, 0, z2); box(z.ceil, x1, h, z1, x2, h + .2, z2); };
const wall = (z, x1, z1, x2, z2, h = H) => { box(z.paper, x1, 0, z1, x2, h, z2); box(z.trim, x1 - .012, 0, z1 - .012, x2 + .012, .1, z2 + .012); };
const fixture = (z, x, y, zc, power) => { z.tileU.uLamp.value[z.nl].set(x, y, zc, power); z.tile.defines.NL = ++z.nl; }; // a light only this zone's tiles see: cheap, unshadowed, up to 24 a zone
const lamp = (z, x, zc, h = H, on = true, power = 120) => { // ceiling panel on the 60cm grid, plus the light it emits
  box(on ? lampOn : lampOff, x - .3, h - .012, zc - .6, x + .3, h + .01, zc + .6);
  if (on) emitters.push({ zone: z, p: V(x, h - .05, zc), t: V(x, 0, zc), power: power * (h / H) ** 2, angle: 1.45, dist: 16, color: 0xfff0cf });
};
const tube = (pts, r, seg, mat) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p))), seg, r, 16), mat); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
const lit = (z, x, y, zc, power, to = [x, 0, zc], angle = 1.35, dist = 12, color = 0xffdfb0) => emitters.push({ zone: z, p: V(x, y, zc), t: V(...to), power, angle, dist, color });
const post = (mat, globe, x, y, z, ax, az, power, zone) => { // street lamp: a pole curving over to a glowing globe; lit only where a zone is given
  tube([[x, y - .4, z], [x, y + 3.4, z], [x + ax * .12, y + 3.85, z + az * .12], [x + ax * .5, y + 4.05, z + az * .5], [x + ax * .9, y + 4, z + az * .9]], .045, 40, mat);
  add(globe, new THREE.SphereGeometry(.16, 20, 14).translate(x + ax * .95, y + 3.88, z + az * .95)); add(mat, new THREE.CylinderGeometry(.09, .11, .5, 12).translate(x, y + .25, z));
  colliders.push([x - .1, z - .1, x + .1, z + .1]);
  if (zone) lit(zone, x + ax * .95, y + 3.7, z + az * .95, power, [x + ax * .95, y, z + az * .95], 1.2, 18, 0xffc98a);
};
const doorway = (mat, leaf, x, y, z, ry, open = 1.9) => { // a door standing on its own, ajar
  const part = (m, w, h, d, px, py, pz) => add(m, new THREE.BoxGeometry(w, h, d).translate(px, py, pz).rotateY(ry).translate(x, y, z));
  part(mat, .12, 2.3, .16, -.56, 1.15, 0); part(mat, .12, 2.3, .16, .56, 1.15, 0); part(mat, 1.24, .12, .16, 0, 2.3, 0); part(mat, 1.24, .05, .2, 0, .025, 0);
  add(leaf, new THREE.BoxGeometry(1, 2.2, .045).translate(.5, 1.13, 0).rotateY(open).translate(-.5, 0, 0).rotateY(ry).translate(x, y, z));
};
const ladder = (x, zc, mat) => { // on a pool's east edge at x: two rails over the lip, three treads
  for (const z of [zc - .25, zc + .25]) tube([[x - .1, -1], [x - .1, .5], [x - .03, .76], [x + .17, .86], [x + .37, .76], [x + .44, .5], [x + .44, 0]].map(([a, y]) => [a, y, z]), .022, 48, mat);
  for (const y of [-.2, -.5, -.8]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.08, .03, .5).translate(x - .1, y, zc), mat); m.castShadow = true; scene.add(m); }
  ladders.push([x - .8, zc - .45, x + .5, zc + .45]);
};
const floorH = (x, z) => { let y = 0; for (const f of flats) if (inR(x, z, f[0], f[1], f[2], f[3])) y = f[4](x, z); return y; };
let sea;
function merge() { // once every place is built (level.js): one mesh per material
  for (const [m, list] of geo) { const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.castShadow = !noCast.has(m); mesh.receiveShadow = m !== seaMat; scene.add(mesh); if (m === seaMat) sea = mesh; }
}

export { colliders, emitters, flats, seeThrough, skyOnly, warps, pools, onSun, ladders, rings, add, block, box, flight, passage, slab, room, wall, fixture, lamp, tube, lit, post, doorway, ladder, floorH, sea, merge };
