// Kit: metalwork (doors and frames, pool ladders, railings, shutters, bollards, grates, grilles, pipes, sign posts, bins).
// Materials: js/tex/metal.js. Convention, the yard and the inventory: docs/props.md.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { zones } from '../core.js';
import { M } from '../mat.js';
import { ladders, add, put, solidAt, round, spot, turned, box } from '../build.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z), V2 = (x, y) => new THREE.Vector2(x, y);
const cost = {}; // triangles per object, filled as they are built (read by the yard check)

// ---- geometry helpers: everything about its own origin, in metres; own UVs in metres where a part has a grain ----
const rbox = (w, h, d, r = .003, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
const cyl = (r, h, seg = 20, r2 = r) => new THREE.CylinderGeometry(r2, r, h, seg, 1);
const lathe = (pr, seg = 24) => new THREE.LatheGeometry(pr.map(([r, y]) => V2(Math.max(r, 1e-4), y)), seg); // [[radius, y], ...] bottom to top
// A closed outline with each corner rounded by r (a number, or one per corner): no razor edges on anything extruded from it.
function rshape(pts, r) {
  const s = new THREE.Shape(), n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = V2(...pts[i]), da = V2(...pts[(i + n - 1) % n]).sub(p), db = V2(...pts[(i + 1) % n]).sub(p), rr = Array.isArray(r) ? r[i] : r;
    const t = Math.min(rr, da.length() / 2, db.length() / 2), A = p.clone().add(da.normalize().multiplyScalar(t)), B = p.clone().add(db.normalize().multiplyScalar(t));
    i ? s.lineTo(A.x, A.y) : s.moveTo(A.x, A.y); s.quadraticCurveTo(p.x, p.y, B.x, B.y);
  }
  s.closePath(); return s;
}
const prism = (shape, len) => new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 3 }); // outline in x,y; length along +z
// A tube along a polyline whose corners are bent to radius rr (as a pipe bender does), parallel-transported so it never twists;
// UVs in metres: u along the tube (the polishing direction), v around it. caps: close the ends with a rounded plug.
function sweep(pts, r, rr = 0, rad = 20, caps = false) {
  const P = pts.map(p => V3(...p)), S = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i].clone().sub(P[i - 1]).normalize(), b = P[i + 1].clone().sub(P[i]).normalize(), th = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
    const t = Math.min(rr * Math.tan(th / 2), P[i].distanceTo(P[i - 1]) * .49, P[i].distanceTo(P[i + 1]) * .49);
    if (th < 1e-3 || t < 1e-4) { S.push(P[i]); continue; }
    const q = new THREE.QuadraticBezierCurve3(P[i].clone().addScaledVector(a, -t), P[i], P[i].clone().addScaledVector(b, t)), n = Math.max(2, Math.ceil(th / .14));
    for (let k = 0; k <= n; k++) S.push(q.getPoint(k / n));
  }
  S.push(P[P.length - 1]);
  const pos = [], nor = [], uv = [], idx = [], T = S.map((p, i) => S[Math.min(i + 1, S.length - 1)].clone().sub(S[Math.max(i - 1, 0)]).normalize());
  let N = Math.abs(T[0].y) < .9 ? V3(0, 1, 0).cross(T[0]).normalize() : V3(1, 0, 0).cross(T[0]).normalize(), u = 0;
  S.forEach((p, i) => {
    if (i) { u += p.distanceTo(S[i - 1]); N.addScaledVector(T[i], -N.dot(T[i])).normalize(); }
    const B = T[i].clone().cross(N);
    for (let k = 0; k <= rad; k++) { const f = k / rad * Math.PI * 2, d = N.clone().multiplyScalar(Math.cos(f)).addScaledVector(B, Math.sin(f)); pos.push(...p.clone().addScaledVector(d, r).toArray()); nor.push(...d.toArray()); uv.push(u, f * r); }
  });
  for (let i = 0; i < S.length - 1; i++) for (let k = 0; k < rad; k++) { const a = i * (rad + 1) + k, b = a + rad + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  if (!caps) return g;
  const out = [g]; for (const [p, t] of [[S[0], T[0].clone().negate()], [S[S.length - 1], T[T.length - 1]]]) // a plug: flat face with a rounded rim
    out.push(lathe([[0, .0012], [r * .8, .001], [r * .97, -.0008], [r, -.003]], rad).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), t)).translate(p.x, p.y, p.z));
  return merge(out);
}
const merge = gs => { const m = []; for (const g of gs) m.push(g.index ? g.toNonIndexed() : g); return (m.length > 1 ? mergeAll(m) : m[0]); };
function mergeAll(gs) { // the same three attributes everywhere, so add() can take the result as one piece
  const n = gs.reduce((s, g) => s + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
  for (const [k, w] of [['position', 3], ['normal', 3], ['uv', 2]]) { const a = new Float32Array(n * w); let o = 0; for (const g of gs) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, w)); }
  return out;
}
// UVs in metres from the part's own coordinates (before it is turned into place): along a = grain direction.
function planar(g, a = 'x', b = 'z') { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p['get' + a.toUpperCase()](i), p['get' + b.toUpperCase()](i)); return g; }
// Collects an object's parts and sets them in the world at once: part(mat, geometry, ownUV); place(...) puts and merges them.
function parts(name) {
  const L = [];
  return {
    p: (m, g, own = false) => { L.push([m, g, own]); return g; },
    place(x, y, z, ry = 0) { let t = 0; for (const [m, g, own] of L) { const n = g.index ? g.toNonIndexed() : g; t += n.attributes.position.count / 3; add(m, put(n, x, y, z, ry), own); } cost[name] = Math.round(t); },
  };
}
const zoneOf = m => Object.values(zones).find(z => z.mats.includes(m)) || null; // for the older helpers, which were handed a material, not a zone
const hexOf = m => m && m.color ? m.color.getHex() : undefined;

// A screw or bolt head: a low dome (pan) or a countersunk disc, axis along +y, sitting on y 0.
const screw = (r = .0035, pan = true) => lathe(pan ? [[0, .0018], [r * .6, .0016], [r * .95, .0007], [r, 0]] : [[0, .0004], [r * .9, .0003], [r, 0]], 10);
const nut = (s = .019, h = .015) => { // hex nut with its chamfered top, a washer under it and the thread end standing out of it
  const t = s / 2; return merge([cyl(t * 1.6, .0025, 20).translate(0, .00125, 0), lathe([[0, h + .007], [t * .55, h + .007], [t * .62, h + .0035], [t * .62, h], [t * .98, h - .0005], [t * 1.15, h - .003], [t * 1.15, .0025]], 6).rotateY(Math.PI / 6)]);
};

// ===== Door in its frame =====
// A pressed-steel frame (jambs and head mitred, a 16 mm rebate the leaf closes into, stop on the +z side) around a flush steel leaf
// on three butt hinges, with lever handles on round roses, a cylinder escutcheon, a lock face and strike, a kick plate on the push
// (+z) side and an overhead closer on the pull side (-z), its arm folding as the leaf opens. The leaf swings to -z by o.open
// radians about its hinge edge at -x. Clear opening 1.0 x 2.24 m; frame 1.2 x 2.34 m, 150 mm deep. o.leaf false: the frame alone.
function door(z, x, y, zc, ry = 0, o = {}) {
  const K = parts(o.leaf === false ? 'frame' : 'door'), Wc = 1, Hc = 2.24, FU = .1, FD = .075, open = o.open ?? 0;
  const F = M(z, 'paintedSteel', { color: o.frame ?? 0xe9e5dc, detail: .1, macro: .04, dirt: .6, dirtCol: [.5, .45, .38], wear: .6, edgeCol: [.5, .5, .52] });
  const Lf = M(z, 'paintedSteel', { color: o.color ?? 0x2b5d8a, detail: .1, macro: .04, dirt: .6, dirtCol: [.5, .45, .38], wear: .6, edgeCol: [.5, .5, .52] });
  const St = M(z, 'brushedSteel');
  // frame profile (u outward from the clear opening, v through the wall): the stop stands proud on +z, the leaf closes into the rebate
  const prof = rshape([[0, .025], [0, FD], [FU, FD], [FU, -FD], [.016, -FD], [.016, .025]], [.0015, .003, .003, .003, .003, .0015]);
  const member = (len, map, mitre) => { // one frame member: the profile run `len`, mitred at 45 degrees where it meets the next
    const g = prism(prof, len), p = g.attributes.position, nm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i); let a = p.getZ(i); if (mitre[1] && a > len - 1e-5) a += u; if (mitre[0] && a < 1e-5) a -= u;
      const [X, Y, Z] = map(u, v, a); p.setXYZ(i, X, Y, Z); const [nx, ny, nz] = map(nm.getX(i), nm.getY(i), nm.getZ(i), true); nm.setXYZ(i, nx, ny, nz); }
    return K.p(F, g);
  };
  member(Hc, (u, v, a, n) => n ? [-u, a, v] : [-(Wc / 2 + u), a, v], [0, 1]);
  member(Hc, (u, v, a, n) => n ? [u, a, -v] : [Wc / 2 + u, a, -v], [0, 1]);
  member(Wc, (u, v, a, n) => n ? [a, u, v] : [a - Wc / 2, Hc + u, v], [1, 1]);
  K.p(F, rbox(.012, .006, .14, .002).translate(-Wc / 2 - .02, .003, 0)); K.p(F, rbox(.012, .006, .14, .002).translate(Wc / 2 + .02, .003, 0)); // base ties
  // threshold: a brushed saddle with chamfered nosings, grain along its length
  K.p(St, planar(prism(rshape([[-.085, 0], [.085, 0], [.085, .002], [.05, .011], [-.05, .011], [-.085, .002]], .002), Wc + .03).translate(0, 0, -(Wc + .03) / 2).rotateY(Math.PI / 2), 'x', 'z'), true);
  // strike plate on the lock jamb, two countersunk screws; hinge leaves let into the hinge jamb
  K.p(St, rbox(.002, .2, .024, .0008).translate(Wc / 2 + .016, 1.05, -.0085));
  for (const yy of [.97, 1.13]) K.p(St, screw(.003, false).rotateZ(Math.PI / 2).translate(Wc / 2 + .015, yy, -.0085));
  const hy = [.25, 1.15, 1.98];
  // the leaf, about its own hinge axis at the origin; set in the frame afterwards
  const hinge = (ax, az) => { // a butt hinge's knuckle: five knuckles with hairline joints, a pin and two finials
    const g = []; for (let k = 0; k < 5; k++) g.push(cyl(.0068, .0196, 20).translate(0, -.04 + k * .02, 0));
    g.push(lathe([[.0001, .0105], [.004, .0098], [.0062, .0075], [.0068, .0055]], 20).translate(0, .05 - .0055, 0), lathe([[.0068, -.0055], [.0062, -.0075], [.004, -.0098], [.0001, -.0105]], 20).translate(0, -.05 + .0055, 0));
    return merge(g).translate(ax, 0, az);
  };
  const AX = -Wc / 2 - .0095, AZ = -.0295; // the hinge axis: in the corner of soffit and pull face, the knuckles proud of both
  for (const yy of hy) { K.p(St, hinge(AX, AZ).translate(0, yy, 0)); if (o.leaf === false) K.p(St, rbox(.0025, .1, .03, .001).translate(-Wc / 2 - .0172, yy, AZ + .016)); } // a frame alone keeps its hinge leaves
  if (o.leaf !== false) {
    const LW = Wc + .026, LH = Hc - .012, LT = .045, x0 = -Wc / 2 - .013, cx = x0 + LW - .06; // closed, the leaf spans x0 .. x0 + LW; the lock 60 mm in from its edge
    const leaf = [], LP = (m, g, own = false) => leaf.push([m, g, own]);
    LP(Lf, rbox(LW, LH, LT, .004, 2).translate(x0 + LW / 2, .006 + LH / 2, 0));
    LP(St, rbox(.0025, .235, .024, .0008).translate(x0 + LW + .0007, 1.05, 0)); // lock face plate on the leaf edge
    for (const sd of [1, -1]) { // lever handles both sides, on roses, with a cylinder escutcheon below
      const fz = sd * LT / 2;
      LP(St, lathe([[0, .0085], [.012, .0085], [.022, .0068], [.026, .003], [.0265, 0]], 28).rotateX(sd * Math.PI / 2).translate(cx, 1.05, fz));
      LP(St, lathe([[0, .0062], [.0075, .0062], [.0085, .0075], [.011, .0075], [.019, .005], [.0225, .0018], [.023, 0]], 28).rotateX(sd * Math.PI / 2).translate(cx, .978, fz)); // the cylinder face sits in a recess
      LP(St, sweep([[cx, 1.05, fz + sd * .006], [cx, 1.05, fz + sd * .062], [cx - .135, 1.05, fz + sd * .062]], .0095, .03, 16, true), true);
    }
    if (o.kick !== false) { // kick plate on the push face: 1.2 mm, grain along x, eight countersunk screws
      LP(St, planar(rbox(LW - .1, .25, .0012, .0005, 1).translate(x0 + LW / 2, .14, LT / 2 + .0006), 'x', 'y'), true);
      for (const sx of [-.42, -.14, .14, .42]) for (const sy of [.035, .245]) LP(St, screw(.003, false).rotateX(Math.PI / 2).translate(x0 + LW / 2 + sx, sy, LT / 2 + .0012));
    }
    // the closer body on the pull face by the hinge, just under the head, its spindle at the hinge end
    const bz = -LT / 2 - .027, by = 2.186, bx0 = x0 + .05;
    LP(St, rbox(.27, .055, .052, .012, 3).translate(bx0 + .135, by, bz));
    for (const ex of [bx0 - .002, bx0 + .272]) LP(St, rbox(.006, .05, .046, .0025, 2).translate(ex, by, bz));
    const sp = V3(bx0 + .06, by + .0275, bz);
    LP(St, cyl(.0085, .012, 16).translate(sp.x, sp.y + .004, sp.z));
    const swing = g => g.translate(-AX, 0, -AZ).rotateY(open).translate(AX, 0, AZ);
    for (const [m, g, own] of leaf) K.p(m, swing(g), own);
    // the arm: spindle (turned with the leaf) to a shoe on the head's pull face, two links meeting at an elbow that stands off the leaf
    const s = swing(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sp.toArray(), 3))).attributes.position, S = V3(s.getX(0), .0, s.getZ(0));
    const F = V3(-Wc / 2 + .3, 0, -FD - .016), L1 = .2, L2 = .22, d = Math.max(.02, Math.min(S.distanceTo(F), L1 + L2 - .005)), dir = F.clone().sub(S).normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(L1 * L1 - a * a, 0)), pv = V3(-dir.z, 0, dir.x), n = V3(-Math.sin(open), 0, -Math.cos(open));
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pv, pv.dot(n) > 0 ? hh : -hh), ay = sp.y + .012;
    const link = (p, q, w, yy) => rbox(p.distanceTo(q) + .018, .0055, w, .0025, 2).rotateY(-Math.atan2(q.z - p.z, q.x - p.x)).translate((p.x + q.x) / 2, yy, (p.z + q.z) / 2);
    K.p(St, link(S, E, .017, ay)); K.p(St, link(E, F, .013, ay + .0058));
    K.p(St, cyl(.0055, .016, 14).translate(E.x, ay + .003, E.z)); K.p(St, cyl(.0055, .012, 14).translate(F.x, ay + .006, F.z));
    K.p(St, rbox(.06, .07, .016, .004).translate(F.x, Hc + .02, -FD - .008)); // the shoe, dropping from the head face to the arm
    for (const sx of [-.02, .02]) K.p(St, screw(.003).rotateX(-Math.PI / 2).translate(F.x + sx, Hc + .035, -FD - .016));
    const c = V3(x0 + LW / 2 - AX, 0, -AZ).applyAxisAngle(V3(0, 1, 0), open).add(V3(AX, 0, AZ)), [px, pz] = spot(x, zc, ry, c.x, c.z);
    turned(px, pz, LW / 2, LT / 2, ry + open, y + .03, y + 2.23); // the leaf is solid where it stands
  }
  K.place(x, y, zc, ry);
  for (const sx of [-1, 1]) solidAt(x, y, zc, ry, sx * (Wc / 2 + FU / 2), 1.2, 0, FU, 2.4, 2 * FD);
  solidAt(x, y, zc, ry, 0, Hc + FU / 2, 0, Wc + 2 * FU, FU, 2 * FD);
}
// The older call (field, terrace): a frame tinted like `mat`, a leaf tinted like `leaf`, ajar by `open`.
const doorway = (mat, leaf, x, y, z, ry, open = 1.9) => door(zoneOf(mat) || zoneOf(leaf), x, y, z, ry, { open, frame: hexOf(mat), color: hexOf(leaf) });

// ===== Pool ladder =====
// Deck-mounted, two 43 mm polished stainless rails bent over the coping into anchor sockets under domed escutcheons, three pressed
// treads with ribbed tops clamped to the rails, rubber bumpers where the rails rest on the pool wall. Own frame: the coping edge at
// z 0, the deck at y 0 on -z, the water on +z (front: you climb toward -z).
function poolLadder(z, x, y, zc, ry = 0, o = {}) {
  const K = parts('ladder'), C = M(z, 'chrome'), St = M(z, 'brushedSteel'), R = M(z, 'rubber', { color: 0x2a2826 }), r = .0215, half = .25, depth = o.depth ?? 1.2;
  for (const sx of [-half, half]) {
    K.p(C, sweep([[sx, -depth, .03], [sx, -depth, .1], [sx, .78, .1], [sx, .78, -.42], [sx, -.06, -.42]], r, .18, 20), true);
    K.p(R, lathe([[r * 1.25, 0], [r * 1.3, .004], [r * 1.3, .026], [r * 1.1, .03], [r * .98, .032]], 20).rotateX(-Math.PI / 2).translate(sx, -depth, .032)); // bumper against the wall
    K.p(C, lathe([[.055, 0], [.054, .003], [.047, .009], [.03, .013], [r + .002, .0145], [r + .001, .016]], 32).translate(sx, 0, -.42)); // escutcheon
    for (const k of [0, 1, 2]) { const a = k * 2.094 + .5; K.p(C, screw(.0028).translate(sx + Math.cos(a) * .041, .0085, -.42 + Math.sin(a) * .041).rotateY(0)); }
  }
  const tread = rshape([[-.04, 0], [.045, 0], [.045, -.032], [.039, -.032], [.039, -.006], [-.034, -.006], [-.034, -.025], [-.04, -.025]], .0025);
  for (const ty of [-.27, -.55, -.83]) {
    const g = planar(prism(tread, 2 * half - .03).translate(0, 0, -(half - .015)).rotateY(-Math.PI / 2), 'x', 'z').translate(0, ty, .1); K.p(St, g, true);
    for (let k = 0; k < 6; k++) K.p(St, planar(rbox(2 * half - .05, .0025, .005, .0011, 1), 'x', 'z').translate(0, ty + .0011, .1 - .03 + k * .0125), true); // anti-slip ribs
    for (const sx of [-half, half]) { K.p(C, lathe([[r + .0035, -.03], [r + .006, -.026], [r + .006, .004], [r + .0035, .008]], 20).translate(sx, ty, .1)); // clamp collar
      K.p(C, screw(.0035).rotateZ(-Math.sign(sx) * Math.PI / 2).translate(sx + Math.sign(sx) * (r + .006), ty - .012, .1)); }
  }
  K.place(x, y, zc, ry);
  // climbing zone in the water in front of it (as before); the rails are left passable: you climb out between them
  const pts = [[-.45, -.5], [.45, -.5], [-.45, .8], [.45, .8]].map(([a, b]) => spot(x, zc, ry, a, b));
  ladders.push([Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]);
}
// The older call: on a pool's east edge at x (deck at y 0 to the east, water to the west); `mat` names the room.
const ladder = (x, zc, mat) => poolLadder(zoneOf(mat), x, 0, zc, -Math.PI / 2);

// ===== Tubular railing run =====
// 42.4 mm tube: one continuous top rail bent round each corner and down into the end posts, intermediate posts at most 1.5 m apart
// welded under it, a mid rail between posts, every post on a 120 mm base plate with four anchor bolts. pts: [[x, y, z], ...] on the floor.
function railing(z, pts, o = {}) {
  const T = M(z, o.mat ?? 'brushedSteel'), r = .0212, h = o.h ?? 1, K = parts('railing'), mid = o.mid ?? true;
  const P = pts.map(p => V3(...p)), o0 = P[0].clone(); // built relative to the first point
  const top = [[P[0].x, P[0].y + .008, P[0].z], ...P.map(p => [p.x, p.y + h, p.z]), [P.at(-1).x, P.at(-1).y + .008, P.at(-1).z]].map(([a, b, c]) => [a - o0.x, b - o0.y, c - o0.z]);
  K.p(T, sweep(top, r, .09, 20), true);
  const posts = [P[0], P.at(-1)], inner = [];
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], n = Math.ceil(a.distanceTo(b) / 1.5); for (let k = 1; k < n; k++) inner.push(a.clone().lerp(b, k / n)); if (i) inner.push(P[i]); }
  const weld = (rr, tk = .0035) => new THREE.TorusGeometry(rr + tk * .3, tk, 5, 18).rotateX(Math.PI / 2);
  for (const p of [...posts, ...inner]) {
    const q = p.clone().sub(o0), isEnd = posts.includes(p);
    if (!isEnd) { K.p(T, sweep([[q.x, q.y + .008, q.z], [q.x, q.y + h - r * .6, q.z]], r, 0, 20), true); K.p(T, weld(r).translate(q.x, q.y + h - r * .95, q.z)); }
    K.p(T, rbox(.12, .008, .12, .003, 1).translate(q.x, q.y + .004, q.z)); K.p(T, weld(r, .004).translate(q.x, q.y + .009, q.z));
    for (const [bx, bz] of [[-.042, -.042], [.042, -.042], [-.042, .042], [.042, .042]]) K.p(T, nut(.013, .009).translate(q.x + bx, q.y + .008, q.z + bz));
    round(p.x, p.z, r + .01, p.y, p.y + h + r);
  }
  if (mid) { // mid rail: straight tube between neighbouring posts, welded at both ends
    const all = []; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], n = Math.ceil(a.distanceTo(b) / 1.5); for (let k = 0; k <= n; k++) all.push([a.clone().lerp(b, k / n), k === 0 || k === n]); if (i < P.length - 2) all.pop(); }
    for (let i = 0; i < all.length - 1; i++) { const a = all[i][0].clone().sub(o0), b = all[i + 1][0].clone().sub(o0), d = b.clone().sub(a).setY(0).normalize();
      const A = a.clone().addScaledVector(d, r * .8), B = b.clone().addScaledVector(d, -r * .8); A.y += h * .5; B.y += h * .5;
      K.p(T, sweep([A.toArray(), B.toArray()], r * .8, 0, 16), true);
      for (const [p, s] of [[A, 1], [B, -1]]) K.p(T, new THREE.TorusGeometry(r * .8 + .001, .003, 5, 16).rotateY(Math.atan2(d.x, d.z)).translate(p.x + d.x * .0005 * s, p.y, p.z + d.z * .0005 * s)); }
  }
  K.place(o0.x, o0.y, o0.z, 0);
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], c = a.clone().add(b).multiplyScalar(.5), L = Math.hypot(b.x - a.x, b.z - a.z);
    solidAt(c.x, Math.min(a.y, b.y), c.z, Math.atan2(-(b.z - a.z), b.x - a.x), 0, (h + .03) / 2, 0, L, h + .03, .05); }
}

// ===== Steel bollard =====
// A 168 mm steel tube 1 m tall, painted, with a pressed domed cap welded on and a 250 mm base plate on four anchor bolts.
function bollard(z, x, y, zc, ry = 0, o = {}) {
  const K = parts('bollard'), R = .0843, H = o.h ?? 1, P = M(z, 'paintedSteel', { color: o.color ?? 0x34383c, detail: .15, macro: .05, dirt: .7, dirtCol: [.5, .45, .38], wear: .7, edgeCol: [.62, .62, .6] }), St = M(z, 'galvanised');
  K.p(P, lathe([[R + .004, .012], [R + .001, .016], [R, .03], [R, H - .02], [R + .0015, H - .016], [R + .002, H - .01], [R * .96, H + .004], [R * .8, H + .022], [R * .5, H + .036], [0, H + .041]], 40));
  K.p(P, new THREE.TorusGeometry(R + .002, .004, 6, 40).rotateX(Math.PI / 2).translate(0, .016, 0)); // the fillet weld to the plate
  K.p(P, rbox(.25, .012, .25, .004).translate(0, .006, 0));
  for (const [bx, bz] of [[-.09, -.09], [.09, -.09], [-.09, .09], [.09, .09]]) K.p(St, nut(.019, .016).translate(bx, .012, bz));
  K.place(x, y, zc, ry); round(x, zc, R, y, y + H + .04);
}

// ===== Floor drain grate =====
// A slot grate dropped flush into a channel: an angle-section frame, bars of 6 mm on 12 mm centres along its length with rounded tops,
// tie bars beneath, and the dark wet channel under the slots. o.l, o.w in metres (default a 1 m x 150 mm linear drain).
function drain(z, x, y, zc, ry = 0, o = {}) {
  const K = parts('drain'), L = o.l ?? 1, W = o.w ?? .15, St = M(z, 'brushedSteel'), D = M(z, 'castIron', { color: 0x606058, roughness: .2 });
  K.p(D, new THREE.BoxGeometry(W - .01, .001, L - .01).translate(0, .001, 0)); // the wet channel seen through the slots
  for (const s of [-1, 1]) { // the frame's flange, 12 mm wide, 4 mm proud, rounded outer edge
    K.p(St, planar(rbox(.012, .005, L, .002, 1).translate(s * (W / 2 - .006), .0025, 0), 'z', 'x'), true);
    K.p(St, planar(rbox(W - .024, .005, .012, .002, 1).translate(0, .0025, s * (L / 2 - .006)), 'x', 'z'), true);
  }
  const bar = rshape([[-.003, 0], [.003, 0], [.003, .006], [-.003, .006]], [.0003, .0003, .003, .003]), n = Math.floor((W - .024) / .012);
  for (let k = 0; k < n; k++) K.p(St, planar(prism(bar, L - .024).translate((k - (n - 1) / 2) * .012, -.0015, -(L - .024) / 2), 'z', 'x'), true);
  for (const tz of [-L / 4, L / 4]) K.p(St, rbox(W - .024, .0015, .004, .0006, 1).translate(0, .00175, tz)); // tie bars under the bars
  K.place(x, y, zc, ry);
}

function yard(plot) { // the metalwork plot in the dev yard (js/zones/yard.js): one of each, room to walk round
  const { zone: z, x, z: Z } = plot;
  door(z, x + 5.5, 0, Z + 4.5, 0, { open: .35 });
  door(z, x + 8, 0, Z + 4.5, 0, { leaf: false, frame: 0xd8d2c6 });
  box(M(z, 'concreteWall', { color: 0xd6d0c4 }), x + 11.1, 0, Z + 4.4, x + 12.9, 1.2, Z + 6); // a block of deck 1.2 m high for the ladder, the floor in front its pool
  bollard(z, x + 1.5, 0, Z + 6.5); bollard(z, x + 2.6, 0, Z + 6.5, 0, { color: 0xd8a62a });
  railing(z, [[x + 10, 0, Z + 6.5], [x + 10, 0, Z + 3], [x + 13.2, 0, Z + 3]]);
  poolLadder(z, x + 12, 1.2, Z + 6, 0, { depth: 1.15 });
  drain(z, x + 6.8, 0, Z + 6.8, Math.PI / 2);
}
export { door, doorway, poolLadder, ladder, railing, bollard, drain, yard, cost };
