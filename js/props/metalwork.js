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
// A hex prism s across the flats, h tall, standing on y 0: flat faces (a 6-sided lathe shades round) with eased corners.
const hex = (s, h) => new THREE.ExtrudeGeometry(rshape([0, 1, 2, 3, 4, 5].map(k => [Math.cos(k * Math.PI / 3) * s / Math.sqrt(3), Math.sin(k * Math.PI / 3) * s / Math.sqrt(3)]), s * .06), { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
const nut = (s = .019, h = .015) => { // hex nut with the chamfer cone on its crown, a washer under it and the stud end standing out of it
  const t = s / 2, w = .0025; return merge([lathe([[t * 1.75, 0], [t * 1.75, w - .0006], [t * 1.68, w], [0, w]], 14), hex(s, h - .0012).translate(0, w, 0),
    lathe([[t * 1.1, h - .0012 + w - .0008], [t * .96, h + w - .0004], [0, h + w - .0004]], 8), lathe([[t * .62, h + w - .001], [t * .62, h + w + .005], [t * .5, h + w + .0062], [0, h + w + .0062]], 8)]);
};
// A fillet weld round a tube (radius R) where it meets a plate or another tube, its bead tk thick, rippled where the welder stepped it.
function weld(R, tk = .003, n = 48) {
  const g = new THREE.TorusGeometry(R + tk * .25, tk, 6, n), p = g.attributes.position, rip = n / 2;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(y, x), cx = Math.cos(a) * (R + tk * .25), cy = Math.sin(a) * (R + tk * .25);
    const k = 1 + .14 * Math.cos(a * rip) + .05 * Math.sin(a * 7 + 1.3); p.setXYZ(i, cx + (x - cx) * k, cy + (y - cy) * k, z * k * (z < 0 ? .5 : 1)); }
  g.computeVertexNormals(); return g.rotateX(Math.PI / 2); // flattened against the plate below
}
// Own UVs in metres for a lathe: u round it at the radius R (one seam at angle 0), v up it.
function latheUV(g, np, seg, R) { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, Math.floor(i / np) / seg * 2 * Math.PI * R, p.getY(i)); return g; }
// Grain along x on every face of a part: tops and bottoms take (x, z), sides (x, y); so the end and side faces never smear.
function grain(g) { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, Math.abs(n.getX(i)) > .7 ? p.getZ(i) : p.getX(i), Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)); return g; }
const turnTo = (g, dir) => g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize())); // its y axis along dir

// ===== Door in its frame =====
// A pressed-steel frame (jambs and head mitred, a 16 mm rebate the leaf closes into, stop on the +z side) around a flush steel leaf
// on three butt hinges, with lever handles on round roses, a cylinder escutcheon, a lock face and strike, a kick plate on the push
// (+z) side and an overhead closer on the pull side (-z), its arm folding as the leaf opens. The leaf swings to -z by o.open
// radians about its hinge edge at -x. Clear opening 1.0 x 2.24 m; frame 1.2 x 2.34 m, 150 mm deep. o.leaf false: the frame alone.
function door(z, x, y, zc, ry = 0, o = {}) {
  const K = parts(o.leaf === false ? 'frame' : 'door'), Wc = 1, Hc = 2.24, FU = .1, FD = .075, open = o.open ?? 0;
  const F = M(z, 'paintedSteel', { color: o.frame ?? 0xe9e5dc, dirt: .35, dirtCol: [.5, .45, .38], wear: .3 });
  const Lf = M(z, 'paintedSteel', { color: o.color ?? 0x3a6d98, dirt: .35, dirtCol: [.5, .45, .38], wear: .3 });
  const St = M(z, 'brushedSteel'), Al = M(z, 'anodised', { color: 0xc8c8c4, roughness: .42 }), Rb = M(z, 'rubber', { color: 0x2a2826 });
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
  for (const sx of [-1, 1]) { K.p(F, rbox(.04, .004, .1, .0015).translate(sx * (Wc / 2 + .05), .002, 0)); K.p(St, screw(.004).translate(sx * (Wc / 2 + .05), .004, 0)); } // floor anchor tabs, screwed down
  for (const yy of [.4, 1.25, 2.0]) K.p(Rb, lathe([[.0045, 0], [.0042, .0012], [.003, .0022], [0, .0026]], 10).rotateX(-Math.PI / 2).translate(Wc / 2 + .008, yy, .025)); // silencers on the stop
  // threshold: a brushed saddle with chamfered nosings, grain along its length
  K.p(St, planar(prism(rshape([[-.085, 0], [.085, 0], [.085, .002], [.05, .011], [-.05, .011], [-.085, .002]], .002), Wc + .03).translate(0, 0, -(Wc + .03) / 2).rotateY(Math.PI / 2), 'x', 'z'), true);
  // strike plate on the lock jamb, two countersunk screws; hinge leaves let into the hinge jamb
  K.p(St, rbox(.002, .115, .025, .0008).translate(Wc / 2 + .016, 1.05, -.0085));
  K.p(Rb, rbox(.0022, .022, .009, .0006).translate(Wc / 2 + .0162, 1.05, -.0055)); // the latch hole, dark behind
  { const c = [Wc / 2 + .015 - .012, -.021], arc = [], N = 6; // the lip: the plate rolled out of the soffit so the latch rides up it
    for (let k = 0; k <= N; k++) { const a = -k / N * 1.25; arc.push([c[0] + .012 * Math.cos(a), -(c[1] + .012 * Math.sin(a))]); }
    for (let k = N; k >= 0; k--) { const a = -k / N * 1.25; arc.push([c[0] + .0105 * Math.cos(a), -(c[1] + .0105 * Math.sin(a))]); }
    K.p(St, prism(rshape(arc, .0004), .07).rotateX(-Math.PI / 2).translate(0, 1.015, 0)); }
  for (const yy of [1.0, 1.1]) K.p(St, screw(.003, false).rotateZ(Math.PI / 2).translate(Wc / 2 + .015, yy, -.0085));
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
      LP(St, sweep([[cx, 1.05, fz + sd * .006], [cx, 1.05, fz + sd * .062], [cx - .118, 1.05, fz + sd * .062], [cx - .124, 1.05, fz + sd * .03]], .0095, .026, 16, true), true); // a returned lever
    }
    if (o.kick !== false) { // kick plate on the push face: 1.2 mm, grain along x, eight countersunk screws
      LP(St, planar(rbox(LW - .1, .25, .0012, .0005, 1).translate(x0 + LW / 2, .14, LT / 2 + .0006), 'x', 'y'), true);
      for (const sx of [-.42, -.14, .14, .42]) for (const sy of [.035, .245]) LP(St, screw(.003, false).rotateX(Math.PI / 2).translate(x0 + LW / 2 + sx, sy, LT / 2 + .0012));
    }
    // the closer body on the pull face by the hinge, just under the head, its spindle at the hinge end
    const bz = -LT / 2 - .027, by = 2.186, bx0 = x0 + .05;
    LP(Al, rbox(.27, .055, .052, .012, 3).translate(bx0 + .135, by, bz)); // cast aluminium body (box UVs: its texture is not stretched)
    for (const ex of [bx0 - .003, bx0 + .273]) LP(Al, rbox(.007, .05, .046, .003, 2).translate(ex, by, bz)); // end caps
    LP(Al, cyl(.0035, .002, 12).rotateZ(Math.PI / 2).translate(bx0 + .277, by - .012, bz)); // the valve screw in the end cap
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
    K.p(Al, link(S, E, .017, ay)); K.p(Al, link(E, F, .013, ay + .0058));
    K.p(Al, lathe([[.009, -.004], [.0095, -.002], [.0095, .009], [.008, .0105], [0, .011]], 16).translate(E.x, ay, E.z)); // the elbow knuckle
    K.p(St, cyl(.0055, .012, 14).translate(F.x, ay + .006, F.z));
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
    const g = grain(prism(tread, 2 * half - .03).translate(0, 0, -(half - .015)).rotateY(-Math.PI / 2)).translate(0, ty, .1); K.p(St, g, true);
    for (let k = 0; k < 6; k++) K.p(St, planar(rbox(2 * half - .05, .0025, .005, .0011, 1), 'x', 'z').translate(0, ty + .0011, .1 - .03 + k * .0125), true); // anti-slip ribs
    for (const sx of [-half, half]) { K.p(C, lathe([[r + .0035, -.03], [r + .006, -.026], [r + .006, .004], [r + .0035, .008]], 20).translate(sx, ty, .1)); // clamp collar
      K.p(C, hex(.008, .005).rotateZ(-Math.sign(sx) * Math.PI / 2).translate(sx + Math.sign(sx) * (r + .0055), ty - .012, .1)); } // a hex set screw in each collar
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
  const Pl = M(z, 'brushedSteel', { roughness: .45, color: 0xb0b0ac, uv: [.3, .3] }), Wd = M(z, 'brushedSteel', { roughness: .55, color: 0x948876, uv: [.2, .2] }); // plates (finer, duller grain); weld beads, heat-tinted
  const P = pts.map(p => V3(...p)), o0 = P[0].clone(); // built relative to the first point
  const top = [[P[0].x, P[0].y + .008, P[0].z], ...P.map(p => [p.x, p.y + h, p.z]), [P.at(-1).x, P.at(-1).y + .008, P.at(-1).z]].map(([a, b, c]) => [a - o0.x, b - o0.y, c - o0.z]);
  K.p(T, sweep(top, r, .09, 20), true);
  const posts = [P[0], P.at(-1)], inner = [];
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], n = Math.ceil(a.distanceTo(b) / 1.5); for (let k = 1; k < n; k++) inner.push(a.clone().lerp(b, k / n)); if (i) inner.push(P[i]); }
  for (const p of [...posts, ...inner]) {
    const q = p.clone().sub(o0), isEnd = posts.includes(p);
    if (!isEnd) { K.p(T, sweep([[q.x, q.y + .008, q.z], [q.x, q.y + h - r * .6, q.z]], r, 0, 20), true); K.p(Wd, weld(r, .003).translate(q.x, q.y + h - r * .95, q.z)); }
    K.p(Pl, planar(rbox(.12, .008, .12, .0025, 2), 'x', 'z').translate(q.x, q.y + .004, q.z), true); K.p(Wd, weld(r, .0038).translate(q.x, q.y + .0085, q.z));
    for (const [bx, bz] of [[-.042, -.042], [.042, -.042], [-.042, .042], [.042, .042]]) K.p(T, nut(.017, .01).translate(q.x + bx, q.y + .008, q.z + bz));
    round(p.x, p.z, r + .01, p.y, p.y + h + r);
  }
  if (mid) { // mid rail: straight tube between neighbouring posts, welded at both ends
    const all = []; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], n = Math.ceil(a.distanceTo(b) / 1.5); for (let k = 0; k <= n; k++) all.push([a.clone().lerp(b, k / n), k === 0 || k === n]); if (i < P.length - 2) all.pop(); }
    for (let i = 0; i < all.length - 1; i++) { const a = all[i][0].clone().sub(o0), b = all[i + 1][0].clone().sub(o0), d = b.clone().sub(a).setY(0).normalize();
      const A = a.clone().addScaledVector(d, r * .8), B = b.clone().addScaledVector(d, -r * .8); A.y += h * .5; B.y += h * .5;
      K.p(T, sweep([A.toArray(), B.toArray()], r * .8, 0, 16), true);
      for (const p of [A, B]) K.p(Wd, turnTo(weld(r * .8, .0028, 40), d).translate(p.x, p.y, p.z)); }
  }
  K.place(o0.x, o0.y, o0.z, 0);
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], c = a.clone().add(b).multiplyScalar(.5), L = Math.hypot(b.x - a.x, b.z - a.z);
    solidAt(c.x, Math.min(a.y, b.y), c.z, Math.atan2(-(b.z - a.z), b.x - a.x), 0, (h + .03) / 2, 0, L, h + .03, .05); }
}

// ===== Steel bollard =====
// A 168 mm steel tube 1 m tall, painted, with a pressed domed cap welded on and a 250 mm base plate on four anchor bolts.
function bollard(z, x, y, zc, ry = 0, o = {}) {
  const K = parts('bollard'), R = .0843, H = o.h ?? 1, P = M(z, 'bollardPaint', o.color != null ? { color: o.color } : {}), St = M(z, 'galvanised');
  // tube and cap in one turned outline: a 2 mm groove where the pressed cap is welded on; own UVs so the scuffs sit at bumper height
  const pr = [[R, .012], [R, H - .022], [R - .0012, H - .0212], [R - .0012, H - .0188], [R + .0015, H - .018], [R + .002, H - .012], [R * .96, H + .004], [R * .8, H + .022], [R * .5, H + .036], [0, H + .041]];
  K.p(P, latheUV(lathe(pr, 40), pr.length, 40, R).rotateY(Math.PI), true); // the uv seam to the back
  K.p(P, weld(R, .0042, 48).translate(0, .0125, 0)); // the fillet weld to the plate
  K.p(P, rbox(.25, .012, .25, .006, 2).translate(0, .006, 0));
  for (const [bx, bz] of [[-.09, -.09], [.09, -.09], [-.09, .09], [.09, .09]]) K.p(St, nut(.019, .016).translate(bx, .012, bz));
  K.place(x, y, zc, ry); round(x, zc, R, y, y + H + .04);
}

// ===== Floor drain grate =====
// A slot grate dropped flush into a channel: an angle-section frame, bars of 6 mm on 12 mm centres along its length with rounded tops,
// tie bars beneath, and the dark wet channel under the slots. o.l, o.w in metres (default a 1 m x 150 mm linear drain).
function drain(z, x, y, zc, ry = 0, o = {}) {
  const K = parts('drain'), L = o.l ?? 1, W = o.w ?? .15, St = M(z, 'brushedSteel', { roughness: .45, color: 0xa4a49e, dirt: .5, dirtCol: [.3, .28, .24] });
  const D = M(z, 'rubber', { color: 0x161513, roughness: .45 }), Gr = M(z, 'castIron', { color: 0x2a2620, roughness: .85, dirt: 0 });
  // the gully seen through the slots: near black, silted and damp (the floor is a slab, so it is a dark film just above it)
  K.p(D, new THREE.BoxGeometry(W - .01, .0004, L - .01).translate(0, .0008, 0));
  for (const s of [-1, 1]) K.p(Gr, rbox(W - .024, .0025, .004, .001, 1).translate(0, .0035, s * (L / 2 - .014))); // grime packed at the bar roots
  for (const s of [-1, 1]) { // the frame's flange, 12 mm wide, 4 mm proud, rounded outer edge
    K.p(St, planar(rbox(.012, .005, L, .002, 1).translate(s * (W / 2 - .006), .0025, 0), 'z', 'x'), true);
    K.p(St, planar(rbox(W - .024, .005, .012, .002, 1).translate(0, .0025, s * (L / 2 - .006)), 'x', 'z'), true);
  }
  const bar = rshape([[-.003, 0], [.003, 0], [.003, .006], [-.003, .006]], [.0003, .0003, .003, .003]), n = Math.floor((W - .024) / .012);
  for (let k = 0; k < n; k++) K.p(St, planar(prism(bar, L - .024).translate((k - (n - 1) / 2) * .012, -.0015, -(L - .024) / 2), 'z', 'x'), true);
  for (const tz of [-L / 4, L / 4]) K.p(St, rbox(W - .024, .0015, .004, .0006, 1).translate(0, .00175, tz)); // tie bars under the bars
  K.place(x, y, zc, ry);
}

// ===== Roller shutter =====
// A shop-front roller shutter: a curtain of roll-formed slats on a 77 mm pitch, each hanging in the curl of the one above, running in
// two flanged U guides lined with pile, an extruded aluminium bottom bar on a rubber seal with two lift handles and a lock, and the
// coil box over the opening. Own frame: the opening (o.w x o.h, default 3 x 2.6 m) centred on x 0, floor y 0, the wall face z 0, the
// shutter on +z. o.open 0 closed .. 1 up; o.color paints the curtain (default bare galvanised); o.hood false: no coil box (a fascia hides it).
function shutter(z, x, y, zc, ry = 0, o = {}) {
  const K = parts('shutter'), w = o.w ?? 3, h = o.h ?? 2.6, open = Math.min(Math.max(o.open ?? 0, 0), .97), P = .077, cz = .03;
  const C = o.color != null ? M(z, 'paintedSteel', { color: o.color, dirt: .4, wear: .3 }) : M(z, 'galvanised'), G = M(z, 'galvanised');
  const A = M(z, 'anodised', { color: 0xc4c4c0, roughness: .4, dirt: .4 }), Rb = M(z, 'rubber', { color: 0x1e1d1c }), Hd = M(z, 'paintedSteel', { color: o.hoodColor ?? 0xd6d1c5, dirt: .3, wear: .2 });
  const Lc = w + .07, bh = .06, yb = (h - bh) * open; // curtain length into the guides; bottom bar height; its foot
  const along = (sh, len) => prism(sh, len).rotateY(-Math.PI / 2).translate(len / 2, 0, 0); // an outline in (z, y) run along x, centred
  // one slat's section (z through the curtain, y up): bowed face, the hook at its foot, the curl on top the next one hangs in
  const sec = rshape([[.004, 0], [.011, .002], [.0135, .012], [.0145, .038], [.0135, .062], [.0105, .07], [.0065, .0755], [.0025, .077], [0, .0735], [.0012, .066], [.0022, .04], [.0012, .012], [0, .005]], .0012);
  const n = Math.ceil((h + .12 - yb - bh) / P);
  for (let k = 0; k < n; k++) K.p(C, along(sec, Lc).translate(0, yb + bh + k * P, cz - .007));
  // bottom bar: a hollow T extrusion with a front bead, the rubber bulb seal under it; two D handles on bosses and a lock in the middle
  K.p(A, along(rshape([[-.016, .008], [.021, .008], [.021, .044], [.009, bh], [-.005, bh], [-.016, .044]], [.003, .003, .006, .002, .002, .006]), w + .05).translate(0, yb, cz));
  K.p(A, along(rshape([[.019, .02], [.024, .02], [.024, .026], [.019, .026]], .002), w + .05).translate(0, yb, cz)); // the bead
  K.p(Rb, along(rshape([[-.01, 0], [.01, 0], [.013, .005], [.01, .009], [-.01, .009], [-.013, .005]], .003), w + .04).translate(0, yb, cz));
  for (const hx of [-w / 4, w / 4]) {
    K.p(G, sweep([[hx - .06, yb + .034, cz + .021], [hx - .06, yb + .034, cz + .056], [hx + .06, yb + .034, cz + .056], [hx + .06, yb + .034, cz + .021]], .0065, .016, 12));
    for (const sx of [-.06, .06]) K.p(G, lathe([[.012, 0], [.0115, .003], [.009, .006], [.0068, .007]], 16).rotateX(Math.PI / 2).translate(hx + sx, yb + .034, cz + .0215));
  }
  K.p(G, lathe([[.017, 0], [.0165, .002], [.012, .005], [.009, .0055], [0, .0055]], 24).rotateX(Math.PI / 2).translate(0, yb + .032, cz + .0215)); // lock escutcheon
  K.p(Rb, rbox(.0022, .008, .002, .0005).translate(0, yb + .032, cz + .027)); // the keyway
  // guides: a 62 x 70 mm channel opening to the curtain, pile strips inside its lips, a flange on the wall screwed every 600 mm
  const gl = h + .12;
  for (const sx of [-1, 1]) {
    const u0 = w / 2, ch = [[u0, 0], [u0 + .062, 0], [u0 + .062, .07], [u0, .07], [u0, .067], [u0 + .059, .067], [u0 + .059, .003], [u0, .003]].map(([u, v]) => [sx * u, -v]);
    K.p(G, prism(rshape(sx > 0 ? ch : ch.reverse(), .0012), gl).rotateX(-Math.PI / 2));
    K.p(G, rbox(.032, gl, .003, .001, 1).translate(sx * (u0 + .077), gl / 2, .0015));
    for (const zz of [.012, .058]) K.p(Rb, rbox(.022, gl, .014, .003, 1).translate(sx * (u0 + .02), gl / 2, zz)); // black pile, lip to curtain
    for (let yy = .15; yy < gl - .05; yy += .6) K.p(G, screw(.0045).rotateX(Math.PI / 2).translate(sx * (u0 + .08), yy, .003));
  }
  if (o.hood !== false) { // the coil box: a folded sheet hood with a rounded nose, the curtain entering through the slot behind it
    K.p(Hd, along(rshape([[.075, 0], [.3, 0], [.42, .12], [.42, .42], [0, .42], [0, .12], [.075, .12]], [.002, .07, .07, .003, .003, .002, .002]), w + .22).translate(0, h, 0));
    solidAt(x, y, zc, ry, 0, h + .21, .21, w + .22, .42, .42);
  }
  K.place(x, y, zc, ry);
  if (yb < 2.2) solidAt(x, y, zc, ry, 0, (yb + h) / 2, cz, w, h - yb, .05); // the curtain where it hangs
  for (const sx of [-1, 1]) solidAt(x, y, zc, ry, sx * (w / 2 + .046), gl / 2, .035, .092, gl, .07);
}

// ===== Wall vent grille =====
// A powder-coated aluminium louvre grille: a pressed frame with a soft rolled lip and a sleeve into the wall, four countersunk screws,
// fixed blades on 22 mm centres raked down and out with a drip lip, the dark duct behind. Own frame: the wall face z 0, the grille's
// bottom edge centred on the origin (y is the height of its bottom edge), facing +z. o.w x o.h, default .4 x .3 m.
function vent(z, x, y, zc, ry = 0, o = {}) {
  const K = parts('vent'), w = o.w ?? .4, h = o.h ?? .3, f = .022, iw = w - 2 * f, ih = h - 2 * f;
  const P = M(z, 'paintedSteel', { color: o.color ?? 0xe2ded4, dirt: .8, dirtCol: [.4, .38, .34], wear: .12 }), Dk = M(z, 'castIron', { color: 0x1a1a18, roughness: .9, dirt: 0 });
  const rr = (a, b, r) => rshape([[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]], r), ring = rr(w, h, .005);
  ring.holes.push(new THREE.Path(rr(iw, ih, .002).getPoints(3).reverse()));
  K.p(P, new THREE.ExtrudeGeometry(ring, { depth: .003, bevelEnabled: true, bevelThickness: .0025, bevelSize: .002, bevelSegments: 2, curveSegments: 3 }).translate(0, h / 2, .0025));
  for (const s of [-1, 1]) { K.p(P, rbox(.0015, ih, .03, .0006, 1).translate(s * (iw / 2 - .00075), h / 2, -.008)); K.p(P, rbox(iw, .0015, .03, .0006, 1).translate(0, h / 2 + s * (ih / 2 - .00075), -.008)); } // sleeve
  K.p(Dk, new THREE.PlaneGeometry(iw, ih).translate(0, h / 2, -.02)); // the duct behind
  const blade = rshape([[-.012, .0075], [-.0105, .0082], [.009, -.0055], [.0105, -.0095], [.0094, -.0099], [.0078, -.0067], [-.012, .0063]], .0005); // (z, y): back up, front down, drip lip
  const nb = Math.floor(ih / .022);
  for (let k = 0; k < nb; k++) K.p(P, prism(blade, iw - .002).rotateY(-Math.PI / 2).translate((iw - .002) / 2, f + (k + .5) * ih / nb, -.004));
  for (const sx of [-1, 1]) for (const yy of [f / 2, h - f / 2]) K.p(P, screw(.0034, false).rotateX(Math.PI / 2).translate(sx * (w / 2 - f / 2), yy, .0081));
  K.place(x, y, zc, ry);
}

// ===== Pipe run =====
// Painted steel pipe (o.r, default DN80, 88.9 mm) along pts [[x, y, z], ...], each corner a long-radius elbow welded in, a bolted
// flange joint in every length over 1.6 m, a blind flange on each end (o.ends false: open ends), and a bracket every 1.5 m: a
// two-piece clamp bolted through its ears on a drop rod to a plate screwed to the wall, o.off (default .1 m) from the pipe's axis
// toward o.to (default [0, 0, -1]).
function pipeRun(z, pts, o = {}) {
  const K = parts('pipe'), r = o.r ?? .0445, off = o.off ?? .1, to = V3(...(o.to ?? [0, 0, -1])).normalize(), rb = 3 * r;
  const P = M(z, 'paintedSteel', { color: o.color ?? 0xbab3a3, dirt: .5, dirtCol: [.45, .42, .37] }), G = M(z, 'galvanised'), Rb = M(z, 'rubber', { color: 0x1c1b1a });
  const Q = pts.map(p => V3(...p)), o0 = Q[0].clone(), L = Q.map(p => p.clone().sub(o0));
  K.p(P, sweep(L.map(p => p.toArray()), r, rb, 24), true);
  const Rf = r + .04, bc = r + .028;
  const fl = (rin, sgn) => { // one flange about the y axis, its face on y 0, its back toward sgn: hub, disc, raised face
    const pr = [[r, -.028], [r + .007, -.026], [r + .009, -.018], [Rf - .001, -.017], [Rf, -.016], [Rf, -.0025], [Rf - .0015, -.0012], [r + .021, -.0012], [r + .021, 0], [rin, 0]];
    return lathe(sgn < 0 ? pr : pr.map(([a, b]) => [a, -b]).reverse(), 40);
  };
  const joint = (p, dir, blind) => { // a flanged joint (or a blind end) at p, the pipe arriving along dir
    const g = [fl(r, -1), blind ? lathe([[Rf, 0], [Rf, .0145], [Rf - .0015, .016], [0, .016]], 40) : fl(r, 1)];
    for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * Math.PI * 2, bx = Math.cos(a) * bc, bz = Math.sin(a) * bc;
      g.push(nut(.02, .013).rotateX(Math.PI).translate(bx, -.017, bz), nut(.02, .013).translate(bx, .016, bz)); }
    K.p(G, turnTo(merge(g.slice(2)), dir).translate(p.x, p.y, p.z)); K.p(P, turnTo(merge(g.slice(0, 2)), dir).translate(p.x, p.y, p.z));
    K.p(Rb, turnTo(lathe([[r + .0215, -.0012], [r + .0222, 0], [r + .0215, .0012]], 40), dir).translate(p.x, p.y, p.z)); // the gasket's edge
  };
  const bracket = (p, dir) => { // built with y along the pipe and -z toward the wall, then turned into place
    const Y = dir.clone().normalize(), Zw = to.clone().addScaledVector(Y, -to.dot(Y)).normalize().negate(), X = Y.clone().cross(Zw), m = new THREE.Matrix4().makeBasis(X, Y, Zw).setPosition(p);
    const band = lathe([[r + .0003, -.017], [r + .004, -.016], [r + .004, .016], [r + .0003, .017]], 32), parts2 = [band];
    for (const s of [-1, 1]) parts2.push(rbox(.022, .032, .005, .0015).translate(s * (r + .013), 0, 0), hex(.013, .008).rotateX(Math.PI / 2).translate(s * (r + .016), 0, .0025));
    const rodL = off - r - .004 - .006;
    parts2.push(cyl(.008, rodL, 12).rotateX(Math.PI / 2).translate(0, 0, -(r + .004 + rodL / 2)), nut(.024, .013).rotateX(-Math.PI / 2).translate(0, 0, -(r + .004)).rotateZ(0));
    parts2.push(rbox(.08, .1, .006, .002).translate(0, 0, -off + .003), nut(.024, .013).rotateX(Math.PI / 2).translate(0, 0, -off + .006));
    for (const s of [-1, 1]) parts2.push(screw(.005).rotateX(Math.PI / 2).translate(0, s * .036, -off + .006));
    K.p(G, merge(parts2).applyMatrix4(m));
  };
  for (let i = 0; i < L.length - 1; i++) {
    const a = L[i], b = L[i + 1], d = b.clone().sub(a), len = d.length(); d.normalize();
    const cut = k => { if (k <= 0 || k >= L.length - 1) return 0; const u = L[k].clone().sub(L[k - 1]).normalize(), v = L[k + 1].clone().sub(L[k]).normalize(); return rb * Math.tan(Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1)) / 2); };
    const c0 = cut(i), c1 = cut(i + 1); // the elbows take this much of each end
    for (const [c, s] of [[c0, a], [c1, b]]) if (c > 0) K.p(P, turnTo(weld(r, .003, 48), d).translate(...s.clone().addScaledVector(d, s === a ? c : -c).toArray()));
    if (o.ends !== false && i === 0) joint(a, d.clone().negate(), true);
    if (o.ends !== false && i === L.length - 2) joint(b, d, true);
    if (len - c0 - c1 > 1.6) joint(a.clone().addScaledVector(d, c0 + (len - c0 - c1) / 2), d, false);
    const nbk = Math.max(1, Math.round((len - c0 - c1) / 1.5));
    for (let k = 0; k < nbk; k++) { const t = c0 + (len - c0 - c1) * (k + .5) / nbk; if (Math.abs(t - (c0 + (len - c0 - c1) / 2)) < .15 && len - c0 - c1 > 1.6) continue; bracket(a.clone().addScaledVector(d, t), d); }
    const A = Q[i], B = Q[i + 1]; // solids: level lengths as boxes, upright ones as posts
    if (Math.abs(B.y - A.y) < .01) solidAt((A.x + B.x) / 2, A.y - r, (A.z + B.z) / 2, Math.atan2(-(B.z - A.z), B.x - A.x), 0, r, 0, len, 2 * r, 2 * r);
    else if (Math.hypot(B.x - A.x, B.z - A.z) < .01) round(A.x, A.z, r, Math.min(A.y, B.y), Math.max(A.y, B.y));
  }
  K.place(o0.x, o0.y, o0.z, 0);
}

// ===== Sign post =====
// A galvanised 60.3 mm post with a moulded cap, on a welded base plate with four anchors (o.base false: set in the ground), carrying a
// blank aluminium sign (o.w x o.ph, default .6 x .45 m, its top at o.top, 2.3 m) faced in o.color: a 2 mm plate with rounded corners
// on two extruded channel rails, held to the post by stainless band clamps. Front +z.
function signPost(z, x, y, zc, ry = 0, o = {}) {
  const K = parts('signPost'), R = .0302, H = o.h ?? 2.4, pw = o.w ?? .6, ph = o.ph ?? .45, top = Math.min(o.top ?? 2.3, H - .02);
  const G = M(z, 'galvanised'), Al = M(z, 'anodised', { color: 0xc8c8c4, roughness: .38 }), St = M(z, 'brushedSteel'), Rb = M(z, 'rubber', { color: 0x222120 });
  const F = M(z, 'paintedSteel', { color: o.color ?? 0xebe5d5, dirt: .35, dirtCol: [.48, .45, .4], wear: .1, roughness: .32 });
  const y0 = o.base === false ? -.05 : .012;
  K.p(G, lathe([[R, y0], [R, H - .004], [R * .6, H - .001], [0, H - .001]], 32));
  K.p(Rb, lathe([[R + .0025, H - .03], [R + .003, H - .027], [R + .003, H - .004], [R + .0015, H + .003], [R * .7, H + .008], [0, H + .0095]], 32)); // the cap
  if (o.base !== false) {
    K.p(G, rbox(.2, .012, .2, .005, 2).translate(0, .006, 0)); K.p(G, weld(R, .004, 48).translate(0, .0125, 0));
    for (const [bx, bz] of [[-.07, -.07], [.07, -.07], [-.07, .07], [.07, .07]]) K.p(G, nut(.019, .014).translate(bx, .012, bz));
  }
  const pz = R + .014, rr = (a, b, r) => rshape([[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]], r), cy = top - ph / 2;
  K.p(Al, new THREE.ExtrudeGeometry(rr(pw - .002, ph - .002, .03), { depth: .0012, bevelEnabled: true, bevelThickness: .0004, bevelSize: .0008, bevelSegments: 2, curveSegments: 6 }).translate(0, cy, pz + .0004));
  K.p(F, new THREE.ExtrudeGeometry(rr(pw - .006, ph - .006, .028), { depth: .0003, bevelEnabled: false, curveSegments: 6 }).translate(0, cy, pz + .0021)); // the face sheet, a hair inside the edge
  for (const ry2 of [cy + ph * .27, cy - ph * .27]) {
    K.p(Al, along2(rshape([[0, -.0125], [.012, -.0125], [.012, -.009], [.003, -.009], [.003, .009], [.012, .009], [.012, .0125], [0, .0125]], .0008), pw - .07).translate(0, ry2, R + .002)); // the channel rail
    K.p(St, lathe([[R + .0003, -.008], [R + .0013, -.0075], [R + .0013, .0075], [R + .0003, .008]], 32).translate(0, ry2, 0)); // band
    K.p(St, rbox(.034, .022, .01, .002).translate(0, ry2, R + .006)); // the clip that takes the band and slides in the rail
    for (const s of [-1, 1]) K.p(St, rbox(.005, .016, .012, .0015).translate(s * .0055, ry2, -R - .006)); // the band's ears
    K.p(St, hex(.01, .005).rotateZ(Math.PI / 2).translate(.0085 + .005, ry2, -R - .008)); K.p(St, cyl(.003, .03, 8).rotateZ(Math.PI / 2).translate(0, ry2, -R - .008));
  }
  K.place(x, y, zc, ry);
  round(x, zc, R + .004, y, y + H + .01); solidAt(x, y, zc, ry, 0, cy, pz + .001, pw, ph, .006);
}
const along2 = (sh, len) => prism(sh, len).rotateY(-Math.PI / 2).translate(len / 2, 0, 0);

// ===== Wire-mesh waste bin =====
// A round litter basket 400 mm across and 750 mm tall: 5 mm verticals inside 5 mm hoops welded on at 60 mm, a rolled 16 mm rim, a
// pressed dish base on a bottom hoop and three short legs with rubber feet; powder-coated (o.color, default a deep green). Front +z.
function bin(z, x, y, zc, ry = 0, o = {}) {
  const K = parts('bin'), R = .2, H = .75, w = .0025, P = M(z, 'paintedSteel', { color: o.color ?? 0x2d4a3b, dirt: .45, dirtCol: [.45, .42, .36], roughness: .36 }), Rb = M(z, 'rubber', { color: 0x1d1c1b });
  for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; K.p(P, cyl(w, H - .07, 6).translate(Math.cos(a) * (R - w), .06 + (H - .07) / 2, Math.sin(a) * (R - w))); }
  for (let yy = .12; yy < H - .03; yy += .06) K.p(P, new THREE.TorusGeometry(R + w * .9, w, 6, 64).rotateX(Math.PI / 2).translate(0, yy, 0));
  K.p(P, new THREE.TorusGeometry(R + .002, .008, 10, 64).rotateX(Math.PI / 2).translate(0, H, 0)); // rim
  K.p(P, new THREE.TorusGeometry(R, .006, 8, 64).rotateX(Math.PI / 2).translate(0, .06, 0)); // bottom hoop
  K.p(P, lathe([[0, .047], [R - .012, .047], [R - .005, .056], [R - .004, .066], [R - .007, .067], [R - .013, .057], [0, .053]], 48)); // dish
  for (let k = 0; k < 3; k++) { const a = (k / 3 + 1 / 12) * Math.PI * 2, c = Math.cos(a) * (R - .012), s = Math.sin(a) * (R - .012);
    K.p(P, sweep([[c, .062, s], [c * 1.04, .03, s * 1.04], [c * 1.06, .016, s * 1.06]], .006, .03, 10));
    K.p(Rb, lathe([[.011, 0], [.0115, .003], [.011, .014], [.008, .018], [0, .018]], 14).translate(c * 1.06, 0, s * 1.06)); }
  K.place(x, y, zc, ry); round(x, zc, R + .01, y, y + H + .01);
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
  shutter(z, x + 7, 0, Z, 0, { w: 2.4, h: 2.4 });
  vent(z, x + 9.6, 1.5, Z);
  pipeRun(z, [[x + 13.8, 2.4, Z + .1], [x + 10.8, 2.4, Z + .1], [x + 10.8, .25, Z + .1]]);
  signPost(z, x + 4.8, 0, Z + 6.8);
  bin(z, x + 3.9, 0, Z + 6);
}
export { door, doorway, poolLadder, ladder, railing, bollard, drain, shutter, vent, pipeRun, signPost, bin, yard, cost };
