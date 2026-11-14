// The level builder: shapes go into one list per material and are merged into one mesh each at the end (merge(), run by level.js).
// The registries here are how places hand things to the rest of the game without knowing about each other.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, V, H, inR } from './core.js';
import { lampOn, lampOff, seaMat, noCast, voidMat, aisle } from './mat.js';

// ---------- level builder: boxes and cut-out wall slabs with world-space UVs, merged into one mesh per material ----------
// Solids, everything the player and loose bodies collide with: [x1, z1, x2, z2, y1, y2] is an upright box. A 7th entry makes it
// another shape inside that rectangle: a number r, an upright cylinder of radius r round its middle; [cx, cz, cos, sin, hx, hz], a box
// of half-size hx by hz turned about the vertical (see turned). A solid blocks the body sideways where it overlaps it above step
// height, its top is ground, its underside stops a jump (player.js). box() adds one for itself; solid(), round() and turned() add one
// for things built otherwise.
const colliders = [], geo = new Map(), emitters = [];
const solid = (x1, y1, z1, x2, y2, z2) => colliders.push([x1, z1, x2, z2, y1, y2]);
const round = (x, z, r, y1, y2) => colliders.push([x - r, z - r, x + r, z + r, y1, y2, r]);
const turned = (cx, cz, hx, hz, ry, y1, y2) => { // the solid of a box of half-size hx, hz centred at cx, cz and turned by rotateY(ry)
  const c = Math.cos(ry), s = Math.sin(ry), ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
  colliders.push([cx - ex, cz - ez, cx + ex, cz + ez, y1, y2, [cx, cz, c, s, hx, hz]]);
};
const loose = []; // loose balls, moved by physics.js: { mesh (a Mesh, or an InstancedMesh for many), r, pos [x, y, z per ball], region [x1, z1, x2, z2] they live in,
// bounce, grip (rolling resistance, m/s²), and if they apply: float (density against water's), spin (it rolls visibly), solid (it stops the body),
// slope (follows a sloping floor), pour (settle this many steps at load), seen (zone ids it is drawn from) }
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
  let a = a1; // the solid: the whole slab, or the piers between walk-through arches and the curved heads over them in eight bands
  const part = (p, q, lo, hi) => axis === 'x' ? solid(p, lo, at, q, hi, at + depth) : solid(at, lo, p, at + depth, hi, q);
  const pier = b => { if (b - a > .01) part(a, b, y1, y2); };
  if (through) for (const [, c, w, top] of cuts.filter(c => c[0] === 'arch').sort((p, q) => p[1] - q[1])) {
    pier(c - w / 2); a = c + w / 2;
    for (let i = 0; i < 8; i++) { const u = Math.max(Math.abs(i / 4 - 1), Math.abs((i + 1) / 4 - 1)) * w / 2; part(c - w / 2 + w * i / 8, c - w / 2 + w * (i + 1) / 8, top - w / 2 + Math.sqrt(Math.max(0, w * w / 4 - u * u)), y2); }
  }
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
  round(x, z, .11, y - .4, y + .5); round(x, z, .05, y + .5, y + 3.5);
  if (zone) lit(zone, x + ax * .95, y + 3.7, z + az * .95, power, [x + ax * .95, y, z + az * .95], 1.2, 18, 0xffc98a);
};
const doorway = (mat, leaf, x, y, z, ry, open = 1.9) => { // a door standing on its own, ajar
  const c = Math.cos(ry), s = Math.sin(ry), part = (m, w, h, d, px, py, pz) => { add(m, new THREE.BoxGeometry(w, h, d).translate(px, py, pz).rotateY(ry).translate(x, y, z)); turned(x + px * c + pz * s, z - px * s + pz * c, w / 2, d / 2, ry, y + py - h / 2, y + py + h / 2); };
  part(mat, .12, 2.3, .16, -.56, 1.15, 0); part(mat, .12, 2.3, .16, .56, 1.15, 0); part(mat, 1.24, .12, .16, 0, 2.3, 0); part(mat, 1.24, .05, .2, 0, .025, 0);
  add(leaf, new THREE.BoxGeometry(1, 2.2, .045).translate(.5, 1.13, 0).rotateY(open).translate(-.5, 0, 0).rotateY(ry).translate(x, y, z));
  const lx = .5 * Math.cos(open) - .5, lz = -.5 * Math.sin(open); turned(x + lx * c + lz * s, z - lx * s + lz * c, .5, .0225, open + ry, y + .03, y + 2.23); // the leaf
};
const ladder = (x, zc, mat) => { // on a pool's east edge at x: two rails over the lip, three treads
  for (const z of [zc - .25, zc + .25]) tube([[x - .1, -1], [x - .1, .5], [x - .03, .76], [x + .17, .86], [x + .37, .76], [x + .44, .5], [x + .44, 0]].map(([a, y]) => [a, y, z]), .022, 48, mat);
  for (const y of [-.2, -.5, -.8]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.08, .03, .5).translate(x - .1, y, zc), mat); m.castShadow = true; scene.add(m); }
  ladders.push([x - .8, zc - .45, x + .5, zc + .45]);
};
const floorH = (x, z) => { let y = 0; for (const f of flats) if (inR(x, z, f[0], f[1], f[2], f[3])) y = f[4](x, z); return y; };
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
function merge() { // once every place is built (level.js): one mesh per material
  for (const c of colliders) if (c.length === 4) c.push(-1e4, 1e4); // a bare rectangle is a wall of any height
  for (const [m, list] of geo) { const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.castShadow = !noCast.has(m); mesh.receiveShadow = m !== seaMat; scene.add(mesh); if (m === seaMat) sea = mesh; }
}

export { colliders, emitters, flats, seeThrough, skyOnly, warps, pools, onSun, ladders, rings, loose, add, block, box, solid, round, turned, clear, out, near, flight, passage, slab, room, wall, fixture, lamp, tube, lit, post, doorway, ladder, floorH, sea, merge };
