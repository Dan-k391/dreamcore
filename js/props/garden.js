// Kit: garden and seating (park and mall benches, planters with palms, potted plants, loungers, picnic tables, timber fences).
// Materials: js/tex/wood.js. Convention, the yard and the inventory: docs/props.md.
import * as THREE from 'three';
import { M } from '../mat.js';
import { add, put, solidAt, round, RoundedBoxGeometry } from '../build.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
const rng = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const seed = (x, z) => Math.floor(x * 73.1 + z * 19.7 + 7);
const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// A sawn timber w x h x d (along x, y, z), its arrises eased to radius r. Own UVs in metres, the grain along `ax`; each piece is
// cut from its own stretch of one of the six 150 mm boards (v 0-.9) that the wood sets hold, so no two show the same figure; the
// sawn ends go to the sets' end-grain band (v .9-1, one 100 mm end each), scaled down when the end is larger than that.
function timber(w, h, d, R, ax = 'x', r = .004) {
  const g = new RoundedBoxGeometry(w, h, d, r >= .008 ? 2 : 1, r), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, S = [w, h, d];
  const A = 'xyz'.indexOf(ax), [o0, o1] = [0, 1, 2].filter(k => k !== A), ou = R() * 8, ov = Math.floor(R() * 6) * .15 + .075 + 3;
  const [e0, e1] = S[o0] >= S[o1] ? [o0, o1] : [o1, o0], ek = Math.min(1, .095 / S[e0], .09 / S[e1]), eu = Math.floor(R() * 10) / 10 + .05 + 8;
  for (let i = 0; i < p.count; i++) {
    const P = [p.getX(i), p.getY(i), p.getZ(i)], N = [n.getX(i), n.getY(i), n.getZ(i)].map(Math.abs);
    if (N[A] > Math.max(N[o0], N[o1])) uv.setXY(i, P[e0] * ek + eu, P[e1] * ek + 3.95); // the end grain
    else uv.setXY(i, P[A] + ou, P[N[o0] > N[o1] ? o1 : o0] + ov);
  }
  return g;
}
// a domed carriage-bolt head (or a rivet, s 8: a screw head), facing +y
const dome = (r = .0095, s = 14) => new THREE.SphereGeometry(r, s, s > 8 ? 4 : 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, s > 8 ? .42 : .3, 1);
// a hex nut on its washer, axis along y, seated at y 0
const nut = (r = .0095) => [new THREE.CylinderGeometry(r * 1.6, r * 1.6, .0025, 16).translate(0, .00125, 0), new THREE.CylinderGeometry(r, r, r * .85, 6).translate(0, .0025 + r * .425, 0)];
// A tube swept along pts (Vector3[]). ring(i, L) is the cross-section at point i, [[a, b], ...] counter-clockwise, a along the
// side, b along the normal (side x tangent); L the length run so far. UVs: (L, perimeter metres), or uvf(i, L, f) with f 0..1 round.
function sweep(pts, ring, side, { loop = false, uvf = null } = {}) {
  const n = pts.length, cnt = loop ? n + 1 : n, pos = [], uv = [], idx = []; let L = 0, m = 0;
  for (let i = 0; i < cnt; i++) {
    const k = i % n, a = pts[loop ? (k - 1 + n) % n : Math.max(k - 1, 0)], b = pts[loop ? (k + 1) % n : Math.min(k + 1, n - 1)];
    const T = b.clone().sub(a).normalize(), N = V().crossVectors(side, T).normalize(), B = V().crossVectors(T, N);
    if (i) L += pts[k].distanceTo(pts[(i - 1) % n]);
    const Rg = ring(k, L); m = Rg.length; let per = 0;
    for (let j = 0; j <= m; j++) {
      const [x, y] = Rg[j % m]; if (j) per += Math.hypot(x - Rg[j - 1][0], y - Rg[j - 1][1]);
      const P = pts[k].clone().addScaledVector(B, x).addScaledVector(N, y); pos.push(P.x, P.y, P.z);
      uv.push(...(uvf ? uvf(k, L, j / m) : [L, per]));
    }
  }
  for (let i = 0; i < cnt - 1; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = a + m + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const nn = g.attributes.normal, avg = (p, q) => { const v = V(nn.getX(p) + nn.getX(q), nn.getY(p) + nn.getY(q), nn.getZ(p) + nn.getZ(q)).normalize(); nn.setXYZ(p, v.x, v.y, v.z); nn.setXYZ(q, v.x, v.y, v.z); };
  for (let i = 0; i < cnt; i++) avg(i * (m + 1), i * (m + 1) + m); // the seam round the ring
  if (loop) for (let j = 0; j <= m; j++) avg(j, (cnt - 1) * (m + 1) + j); // and where the path closes
  return g;
}
const ellipse = (a, b, m = 10) => Array.from({ length: m }, (_, j) => [a * Math.cos(2 * Math.PI * j / m), b * Math.sin(2 * Math.PI * j / m)]);
const rrect = (a, b, r, s = 3) => { const o = []; for (const [cx, cy, a0] of [[a - r, b - r, 0], [r - a, b - r, 1], [r - a, r - b, 2], [a - r, r - b, 3]]) for (let k = 0; k <= s; k++) { const t = (a0 + k / s) * Math.PI / 2; o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return o; };
const lathe = (prof, seg = 64) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ---- park bench: five seat slats and three back slats of varnished hardwood, carriage-bolted to the lugs of two sand-cast iron
// ends (legs, seat rail, raked back upright and arm in one casting, a window under the arm). 1.8 m, seat at 0.465 m.
const BACK = Math.atan(.217); // the back upright's rake: 12 degrees
let benchEnd = null;
function parkBench(z, x, y, zc, ry = 0, o = {}) {
  const R = rng(seed(x, zc)), W = M(z, 'benchWood'), C = M(z, 'castIron', { color: o.iron ?? 0x1f2c25, roughness: .62 }), S = M(z, 'galvanised');
  const L = o.length ?? 1.8, xi = L / 2 - .034, Ls = 2 * xi - .004, P = g => put(g, x, y, zc, ry);
  if (!benchEnd) { // the casting's side profile (z forward, y up), extruded 22 mm with a 6 mm rounded bevel
    const s = new THREE.Shape().moveTo(.3, 0).lineTo(.2, 0).quadraticCurveTo(.205, .2, .215, .3).quadraticCurveTo(.22, .375, .14, .38).lineTo(-.12, .38)
      .quadraticCurveTo(-.19, .375, -.195, .3).quadraticCurveTo(-.2, .2, -.215, 0).lineTo(-.33, 0).quadraticCurveTo(-.3, .2, -.285, .4)
      .quadraticCurveTo(-.33, .62, -.37, .86).quadraticCurveTo(-.378, .925, -.33, .905).lineTo(-.31, .89).lineTo(-.269, .7).lineTo(.24, .7)
      .quadraticCurveTo(.312, .7, .306, .652).quadraticCurveTo(.3, .615, .27, .61).quadraticCurveTo(.262, .5, .275, .43)
      .quadraticCurveTo(.29, .4, .27, .36).quadraticCurveTo(.252, .2, .29, .03).quadraticCurveTo(.302, 0, .3, 0);
    s.holes.push(new THREE.Path().moveTo(.22, .47).lineTo(.22, .62).quadraticCurveTo(.22, .655, .185, .655).lineTo(-.225, .655)
      .quadraticCurveTo(-.255, .655, -.252, .625).lineTo(-.215, .455).quadraticCurveTo(-.21, .43, -.18, .43).lineTo(.19, .43).quadraticCurveTo(.22, .43, .22, .47));
    benchEnd = new THREE.ExtrudeGeometry(s, { depth: .022, bevelEnabled: true, bevelThickness: .006, bevelSize: .005, bevelSegments: 2, curveSegments: 7 }).translate(0, 0, -.011).rotateY(-Math.PI / 2);
  }
  const nz = Math.cos(BACK), ny = Math.sin(BACK), line = yy => -.21 - .217 * (yy - .43); // the back upright's front edge
  for (const sx of [-1, 1]) {
    add(C, P(benchEnd.clone().translate(sx * (L / 2 - .017), 0, 0)));
    add(C, P(new RoundedBoxGeometry(.04, .03, .43, 2, .006).translate(sx * (xi - .02), .415, .013))); // the seat lug, cast on
    add(C, P(new RoundedBoxGeometry(.04, .4, .03, 2, .006).rotateX(-BACK).translate(sx * (xi - .02), .67, line(.67) - nz * .016 + .003)));
  }
  for (let i = 0; i < 5; i++) { // seat slats 72 x 35, the front one with a fuller round where the knees go
    const zz = -.168 + .091 * i; add(W, P(timber(Ls, .035, .072, R, 'x', i === 4 ? .012 : .006).translate(0, .4475, zz)), true);
    for (const sx of [-1, 1]) add(S, P(dome().translate(sx * (xi - .02), .465, zz)));
  }
  for (const yb of [.53, .65, .77]) { // back slats 90 x 28, on the raked upright
    const cy = yb + ny * .0145, cz = line(yb) + nz * .0145; add(W, P(timber(Ls, .09, .028, R, 'x', .006).rotateX(-BACK).translate(0, cy, cz)), true);
    for (const sx of [-1, 1]) add(S, P(dome().rotateX(Math.PI / 2).rotateX(-BACK).translate(sx * (xi - .02), cy + ny * .014, cz + nz * .014)));
  }
  solidAt(x, y, zc, ry, 0, .4225, .014, L, .085, .46); // the seat
  solidAt(x, y, zc, ry, 0, .68, -.27, L, .43, .1); // the back
  for (const sx of [-1, 1]) solidAt(x, y, zc, ry, sx * (L / 2 - .017), .58, .02, .04, .24, .56); // the arms
}

// ---- backless mall bench: eight hardwood battens on edge over two bent rectangular-tube steel frames (a closed loop each:
// legs, top bar and floor runner), joined by a welded spine, on rubber glides. 1.8 x 0.42 m, seat at 0.45 m.
function mallBench(z, x, y, zc, ry = 0, o = {}) {
  const R = rng(seed(x, zc)), W = M(z, 'benchWood'), S = M(z, 'paintedSteel', { color: o.frame ?? 0x2e3031 }), K = M(z, 'rubber'), P = g => put(g, x, y, zc, ry);
  const L = o.length ?? 1.8, n = 8, sw = .046, gap = .008, D = n * sw + (n - 1) * gap, fx = L / 2 - .3;
  for (let i = 0; i < n; i++) {
    const zz = -D / 2 + sw / 2 + i * (sw + gap); add(W, P(timber(L, .05, sw, R, 'x', .006).translate(0, .425, zz)), true);
    for (const sx of [-1, 1]) { // a wood plug over the screw into the frame, its grain across the batten's, a hair proud
      const g = new THREE.CircleGeometry(.0048, 14).rotateX(-Math.PI / 2), pp = g.attributes.position, u = R() * 8, v = Math.floor(R() * 6) * .15 + .075 + 3;
      for (let k = 0; k < pp.count; k++) g.attributes.uv.setXY(k, pp.getZ(k) + u, pp.getX(k) + v);
      add(W, P(g.translate(sx * fx + (R() - .5) * .004, .4503, zz)), true);
    }
  }
  const loop = []; // the frame's centreline: a rounded rectangle 0.34 x 0.36 m, bends of 45 mm
  for (const [cz, cy, a0] of [[.125, .345, 0], [-.125, .345, 1], [-.125, .063, 2], [.125, .063, 3]]) for (let k = 0; k <= 6; k++) { const t = (a0 + k / 6) * Math.PI / 2; loop.push([cz + .045 * Math.cos(t), cy + .045 * Math.sin(t)]); }
  const prof = rrect(.02, .01, .005); // 40 x 20 tube, powder-coated
  for (const sx of [-1, 1]) {
    add(S, P(sweep(loop.map(([zz, yy]) => V(sx * fx, yy, zz)), () => prof, V(1, 0, 0), { loop: true })), true);
    for (const zz of [-.13, .13]) add(K, P(new THREE.CylinderGeometry(.017, .02, .008, 16).translate(sx * fx, .004, zz)));
  }
  add(S, P(timber(2 * fx - .05, .03, .05, R, 'x', .005).translate(0, .385, 0)), true); // the spine, welded between the frames
  solidAt(x, y, zc, ry, 0, .425, 0, L, .05, D);
}

// ---- a palm frond: a curved, tapering rachis (bare petiole for its first 30%), then folded leaflets in sub-opposite pairs, longest
// at mid-length, held up in a shallow V, drooping under their own weight. Adds to the leaf material; ~1.8k triangles at full size.
// base: Vector3, az: compass of its plane, el: elevation at the base, bend: how far it arches over (rad), len: m, R: random.
function frond(Lf, P, base, az, el, bend, len, R, o = {}) {
  const sc = o.scale ?? 1, nPt = 22, hz = V(Math.sin(az), 0, Math.cos(az)), twist = (R() - .5) * .3, pts = [];
  let p = base.clone();
  for (let i = 0; i < nPt; i++) { pts.push(p.clone()); const s = i / (nPt - 1), th = el - bend * Math.pow(s, 1.4), h = hz.clone().applyAxisAngle(UP, twist * s);
    p.addScaledVector(h, Math.cos(th) * len / (nPt - 1)).addScaledVector(UP, Math.sin(th) * len / (nPt - 1)); }
  const midV = (Math.floor(R() * 12) + .5) / 24, side = V().crossVectors(hz, UP).normalize();
  add(Lf, P(sweep(pts, i => { const s = i / (nPt - 1), w = sc * lerp(.05, .006, Math.pow(s, .6)) * (1 + (o.flare ?? 1.6) * (1 - ss(0, .12, s))); return ellipse(w / 2, w * .32, 7); }, side,
    { uvf: (i, L, f) => [L, midV + f * .002] })), true); // the rachis takes the colour of a leaflet's midrib
  const fr = i => { const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, nPt - 1)], T = b.clone().sub(a).normalize(), s2 = V().crossVectors(T, UP).normalize(); return [pts[i], T, s2, V().crossVectors(s2, T)]; };
  const pos = [], uv = [], idx = [], s0 = o.bare ?? .3, step = (o.pitch ?? .042) / len, e = o.vee ?? .5, age = o.age ?? .5, nk = 6;
  for (let s = s0, side2 = 1; s < .985; s += step / 2, side2 = -side2) {
    const fi = s * (nPt - 1), i0 = Math.floor(fi), [Pa, T, Sd, N] = fr(i0), Pp = Pa.clone().lerp(pts[Math.min(i0 + 1, nPt - 1)], fi - i0);
    const q = (s - s0) / (1 - s0), ll = sc * (.14 + .46 * Math.sin(Math.PI * Math.pow(q, .65))) * (.85 + .3 * R()), W = sc * .034 * (.8 + .4 * R());
    const A = lerp(o.fwd0 ?? .95, o.fwd1 ?? .5, q) + (R() - .5) * .2, ee = e + (R() - .5) * .25, dr = ll * (o.droop ?? .3) * (.7 + .6 * R());
    const D = T.clone().multiplyScalar(Math.cos(A)).addScaledVector(Sd, side2 * Math.sin(A)).multiplyScalar(Math.cos(ee)).addScaledVector(N, Math.sin(ee)).normalize();
    const Wv = V().crossVectors(D, N).normalize(), Nl = V().crossVectors(Wv, D).normalize(); if (Nl.dot(N) < 0) Nl.negate();
    // which leaflet of the palmLeaf set: rows 0-3 yellower (old fronds, the young tips of a frond), 8-11 deep green; rows 3, 7, 11
    // dry toward the tip, so a dry one is placed with its tip at u .985 of the set (wood.js)
    const dryTip = ll < .43 && R() < .02 + .5 * age * age, gs = .55 * age + .45 * q + .3 * (R() - .5), grp = gs > .7 ? 0 : gs > .38 ? 1 : 2;
    const li = grp * 4 + (dryTip ? 3 : Math.floor(R() * 3)), ou = dryTip ? .4925 - ll + 2 : R() * 4, b0 = pos.length / 3;
    const fold = .48 + .2 * R(), tw = (R() - .5) * 1.1, curl = (R() - .5) * .25 * ll; // folded along the midrib, twisting and swept a little sideways
    for (let k = 0; k <= nk; k++) {
      const t = k / nk, hw = W / 2 * Math.min(1, .45 + 3.7 * t) * Math.pow(1 - t, .55), c = Pp.clone().addScaledVector(D, ll * t).addScaledVector(UP, -dr * t * t).addScaledVector(Wv, curl * t * t);
      const wv = Wv.clone().applyAxisAngle(D, tw * t), nl = Nl.clone().applyAxisAngle(D, tw * t), fk = fold * (1 - .4 * t);
      for (const a of [-1, 0, 1]) { const q2 = c.clone().addScaledVector(wv, a * hw * Math.cos(fk)).addScaledVector(nl, Math.abs(a) * hw * Math.sin(fk));
        pos.push(q2.x, q2.y, q2.z); uv.push(ll * t + ou, (li + .01 + .49 * (a + 1)) / 24); }
    }
    for (let k = 0; k < nk; k++) for (let a = 0; a < 2; a++) { const v = b0 + k * 3 + a; idx.push(v, v + 3, v + 1, v + 1, v + 3, v + 4); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); add(Lf, P(g), true);
}

// The leaf-scar ring profile the palmTrunk set draws (wood.js), so the stem's silhouette carries the same rings: groove, lip, swell.
const trunkRing = (u, v) => { const rv = v * 24 + .7 * Math.sin(6.2832 * 2 * v + .7) + .25 * Math.sin(6.2832 * 5 * v + 2.1) + .15 * Math.sin(6.2832 * u + 1.3);
  const ri = ((Math.floor(rv) % 24) + 24) % 24, f = rv - Math.floor(rv), dep = .55 + .45 * Math.sin(ri * 2.39 + 1), gw = .09 + .05 * Math.sin(ri * 1.7), lip = .6 + .4 * Math.cos(ri * 3.1);
  return dep * (-1.8 * (1 - ss(0, gw, Math.abs(f - .15))) + 1.6 * lip * ss(.2, .3, f) * (1 - ss(.36, .67, f)) + .8 * Math.sin(Math.PI * f) ** 2); };

// ---- round planter with a palm: a cast terrazzo bowl with a rolled rim, bark mulch, and a palm: a ringed stem with a flared foot,
// leaning a few degrees and curving back, a skirt of cut-off old frond bases under a crown of a dozen fronds.
function palmPlanter(z, x, y, zc, ry = 0, o = {}) {
  const R = rng(seed(x, zc)), Pm = M(z, o.planter ?? 'terrazzo', { tri: 1, ...(o.planterColor ? { color: o.planterColor } : {}) }), So = M(z, 'mulch');
  const Tm = M(z, 'palmTrunk'), Ts = M(z, 'palmTrunk', { color: 0x9c7a5c }), Lf = M(z, 'palmLeaf'), P = g => put(g, x, y, zc, ry), rad = o.radius ?? .66, h = o.height ?? .5;
  add(Pm, P(lathe([[rad - .03, 0], [rad - .005, .006], [rad, .03], [rad + .006, h - .045], [rad + .02, h - .02], [rad + .022, h - .005], [rad + .012, h + .012], [rad - .005, h + .02],
    [rad - .045, h + .02], [rad - .062, h + .008], [rad - .066, h - .01], [rad - .07, h - .08]])));
  const soil = lathe([[rad - .07, h - .075], [rad - .2, h - .06], [rad * .4, h - .045], [rad * .15, h - .035], [0, h - .03]], 48), sp = soil.attributes.position;
  for (let i = 0; i < sp.count; i++) { const sx = sp.getX(i), sz = sp.getZ(i), rr = Math.hypot(sx, sz); if (rr < rad - .08) sp.setY(i, sp.getY(i) + .008 * (Math.sin(sx * 23 + 1) * Math.sin(sz * 19) + .5 * Math.sin(sx * 41 - sz * 37))); }
  soil.computeVertexNormals(); add(So, P(soil));
  // the stem
  const H = o.trunk ?? 3.1, az = o.lean ?? R() * 6.28, lx = Math.sin(az), lz = Math.cos(az), N = Math.round(H / .012), pts = [];
  for (let i = 0; i <= N; i++) { const t = i / N, off = H * (.06 * t + .03 * Math.sin(Math.PI * t)) - H * .05 * t * t; pts.push(V(off * lx, h - .05 + H * t, off * lz)); }
  const Lt = []; { let L = 0; for (let i = 0; i <= N; i++) { if (i) L += pts[i].distanceTo(pts[i - 1]); Lt.push(L); } }
  // the silhouette carries the rings (3.5 mm deep at the most) and the stem is not quite round: flatter on one side, lumpy
  add(Tm, P(sweep(pts, i => { const t = i / N, r0 = .132 + .065 * Math.pow(1 - t, 5) + .014 * ss(.92, 1, t), dm = .0035 * (1 - .8 * ss(.9, 1, t));
    return Array.from({ length: 28 }, (_, j) => { const u = j / 28, r = r0 * (1 + .025 * Math.cos(2 * u * 6.2832 + 3 * t) + .012 * Math.sin(3 * u * 6.2832 + 7 * t)) + dm * trunkRing(u, Lt[i]);
      return [r * Math.cos(u * 6.2832), r * Math.sin(u * 6.2832)]; }); },
    V(1, 0, 0), { uvf: (i, L, f) => [f, L] })), true);
  const top = pts[N], Tt = top.clone().sub(pts[N - 4]).normalize();
  for (let k = 0; k < 26; k++) { // the old frond bases, sawn off, in three staggered rows under the crown: each a curved sheath that
    // grows out of the stem thin and narrow and widens to its cut, wrapping round the stem, its sawn end capped with a small round
    const a = k * 2.39996 + R() * .3, rd = V(Math.sin(a), 0, Math.cos(a)), sd = V().crossVectors(rd, UP).normalize(), yy = -.03 - .07 * (k % 3) - .03 * R();
    const el = 1. + .4 * R(), ln = .1 + .09 * R(), wA = .06 + .03 * R(), d = rd.clone().multiplyScalar(Math.cos(el)).addScaledVector(UP, Math.sin(el));
    const root = top.clone().addScaledVector(Tt, yy - ln * Math.sin(el)).addScaledVector(rd, .12), ou = R() * 3, ov = R() * 3;
    const sp2 = [0, .25, .5, .75, 1].map(t => root.clone().addScaledVector(d, ln * t).addScaledVector(rd, .006 * Math.sin(Math.PI * t))), e = sp2[4];
    sp2.push(e.clone().addScaledVector(d, .002), e.clone().addScaledVector(d, .003));
    const g = sweep(sp2, i => { const t = Math.min(i, 4) / 4, wd = lerp(.3, 1, ss(0, .8, t)) * (i === 5 ? .94 : i === 6 ? .04 : 1), A = wA * wd, B = (.003 + .008 * ss(0, .6, t)) * (i === 6 ? .04 : 1);
      return Array.from({ length: 12 }, (_, j) => { const c = Math.cos(j / 12 * 6.2832), s2 = Math.sin(j / 12 * 6.2832); return [A * c, B * s2 + .02 * wd * c * c]; }); },
      sd, { uvf: (i, L, f) => [f * .25 + ou, L * .5 + ov] });
    // the saw went through at a slant: the outer face shorter, the cut facing out and up, and a little skewed across
    const gp = g.attributes.position, sk = (R() - .5) * 1.2, Q = V();
    for (let v = 4 * 13; v < gp.count; v++) { Q.fromBufferAttribute(gp, v).sub(e); Q.addScaledVector(d, -1.6 * Q.dot(rd) - sk * Q.dot(sd)).add(e); gp.setXYZ(v, Q.x, Q.y, Q.z); }
    g.computeVertexNormals(); add(Ts, P(g), true);
  }
  const nf = o.fronds ?? 12;
  for (let k = 0; k < nf; k++) { // youngest (a spear, nearly upright) to oldest (low, arched right over)
    const a = k / (nf - 1), az2 = k * 2.39996 + R() * .25, rd = V(Math.sin(az2), 0, Math.cos(az2));
    const b = top.clone().addScaledVector(Tt, .06 - .12 * a).addScaledVector(rd, .03 + .05 * a);
    frond(Lf, P, b, az2, lerp(1.25, -.05, a) + (R() - .5) * .15 + (k === 0 ? .25 : 0), lerp(.45, 1.5, a) + (R() - .5) * .2, (k === 0 ? 1.5 : 2.1 + .5 * R()), R,
      k === 0 ? { fwd0: .3, fwd1: .2, vee: .9, droop: .05, age: 0 } : { droop: .2 + .25 * a, age: a });
  }
  round(x, zc, rad + .02, y, y + h + .02); // the bowl (the rim and the mulch are standable)
  round(x, zc, .16, y + h, y + h + H); // the stem
}

// ---- smaller potted plant: a moulded pot with a rolled lip, mulch, and a clump of three slender palm canes, each with a few fronds.
function pottedPlant(z, x, y, zc, ry = 0, o = {}) {
  // the pot: unglazed terracotta, matte, on a matching drip saucer; o.pot tints it
  const R = rng(seed(x, zc)), Pm = M(z, 'limestone', { color: o.pot ?? 0xc8805a, tri: 1, roughness: .85 }), So = M(z, 'mulch'), Lf = M(z, 'palmLeaf'), Tm = M(z, 'palmTrunk', { color: 0x9c7a5c }), P = g => put(g, x, y, zc, ry);
  add(Pm, P(lathe([[.13, 0], [.145, .004], [.15, .02], [.19, .345], [.198, .352], [.205, .37], [.203, .39], [.195, .4], [.18, .4], [.175, .39], [.172, .36]], 48)));
  add(Pm, P(lathe([[0, .001], [.152, .001], [.168, .004], [.177, .012], [.18, .026], [.176, .03], [.172, .027], [.168, .011], [.158, .006], [0, .006]], 48)));
  add(So, P(lathe([[.175, .345], [.1, .355], [0, .362]], 32)));
  for (let c = 0; c < 3; c++) { // a cane: tapering, ringed with nodes 40-60 mm apart, papery sheath remnants at the lowest, fronds splitting from its top
    const a = c * 2.1 + R() * .5, rd = V(Math.sin(a), 0, Math.cos(a)), hh = .45 + .3 * R(), base = rd.clone().multiplyScalar(.04).setY(.35), midV = (Math.floor(R() * 12) + .5) / 24;
    const at = hh2 => base.clone().addScaledVector(rd, .08 * (hh2 / hh) ** 2 * hh).setY(.35 + hh2), nodes = [];
    for (let s = .012 + .02 * R(); s < hh - .02; s += .04 + .02 * R()) nodes.push(s);
    const hs = [0]; for (let i = 0; i < nodes.length; i++) { const n0 = nodes[i], n1 = nodes[i + 1] ?? hh; hs.push(n0 - .004, n0, n0 + .004, (n0 + n1) / 2); } hs.push(hh);
    const rad = hv => { const t = hv / hh, nd = Math.min(...nodes.map(n => Math.abs(hv - n))); return (.0115 - .0045 * t) * (1 + .09 * Math.exp(-((nd / .0025) ** 2))); };
    add(Lf, P(sweep(hs.map(at), i => ellipse(rad(hs[i]), rad(hs[i]), 10), V(1, 0, 0), { uvf: (i, L, f) => [L * .3, midV + f * .002] })), true);
    for (const n0 of nodes.slice(0, 2)) { const r0 = rad(n0) / 1.09, ou = R() * 3; // the sheath left at a node, split and flaring
      add(Tm, P(sweep([0, .5, 1].map(t => at(n0 + .03 * t)), i => ellipse(r0 * (1.12 + .35 * i * i), r0 * (1.12 + .3 * i * i), 10), V(1, 0, 0), { uvf: (i, L, f) => [f * .08 + ou, L + ou] })), true);
    }
    for (let k = 0; k < 3; k++) { const az = a + k * 2.2 + R() * .4, ag = k / 2;
      frond(Lf, P, at(hh - .018 * k), az, lerp(1.1, .35, ag), lerp(.5, 1.3, ag), .55 + .25 * R(), R, { scale: .38, pitch: .045, bare: .22, droop: .25, vee: .45, flare: .2, age: .2 + .4 * ag }); }
  }
  round(x, zc, .2, y, y + .4);
}

// ---- poolside lounger: hardwood side rails on four legs (wheels at the head), a slatted bed and a raised slatted backrest on a strut.
function lounger(z, x, y, zc, ry = 0, o = {}) {
  const R = rng(seed(x, zc)), W = M(z, 'benchWood'), S = M(z, 'galvanised'), K = M(z, 'rubber'), H = M(z, 'brushedSteel'), P = g => put(g, x, y, zc, ry), Wd = g => add(W, P(g), true);
  for (const sx of [-1, 1]) {
    Wd(timber(.04, .11, 1.96, R, 'z', .006).translate(sx * .305, .265, 0)); // side rails, head toward -z
    Wd(timber(.045, .29, .045, R, 'y', .005).translate(sx * .26, .145, .86)); // foot legs
    Wd(timber(.045, .22, .06, R, 'y', .005).translate(sx * .26, .18, -.86)); // head legs carrying the axle
    for (const zz of [.86, -.86]) for (const yy of [.24, .29]) add(S, P(dome().rotateZ(-sx * Math.PI / 2).translate(sx * .325, yy, zz)));
    // wheels: a 40 mm rubber tyre with a rounded tread on a pressed hub, an axle nut on its washer outside
    add(K, P(lathe([[.052, -.02], [.066, -.02], [.072, -.017], [.075, -.01], [.0755, 0], [.075, .01], [.072, .017], [.066, .02], [.052, .02]], 36).rotateZ(Math.PI / 2).translate(sx * .345, .075, -.86)));
    add(S, P(lathe([[0, -.016], [.03, -.016], [.042, -.012], [.053, -.013], [.053, .013], [.042, .012], [.03, .016], [0, .016]], 24).rotateZ(Math.PI / 2).translate(sx * .345, .075, -.86)));
    for (const g of nut(.007)) add(S, P(g.rotateZ(-sx * Math.PI / 2).translate(sx * .361, .075, -.86)));
    // the backrest pivot: a stainless strap on the rail's inside, bolted through it, the backrest's rail turning on a bolt at its top
    add(H, P(new RoundedBoxGeometry(.003, .075, .04, 1, .0012).translate(sx * .2835, .3, -.245)));
    add(S, P(dome(.007, 8).rotateZ(sx * Math.PI / 2).translate(sx * .282, .325, -.245)));
    add(S, P(dome(.0085).rotateZ(-sx * Math.PI / 2).translate(sx * .325, .265, -.245)));
  }
  add(S, P(new THREE.CylinderGeometry(.008, .008, .74, 8).rotateZ(Math.PI / 2).translate(0, .075, -.86)));
  for (const zz of [-.6, .35]) Wd(timber(.57, .035, .045, R, 'x', .005).translate(0, .3, zz)); // cross bearers
  for (let i = 0; i < 14; i++) Wd(timber(.65, .02, .065, R, 'x', .005).translate(0, .33, -.215 + i * .084)); // bed slats
  const bt = .75, back = []; // backrest, built flat from its hinge toward -z, then raised
  for (const sx of [-1, 1]) back.push(timber(.035, .03, .7, R, 'z', .005).translate(sx * .27, .015, -.35));
  for (let i = 0; i < 7; i++) back.push(timber(.6, .02, .065, R, 'x', .005).translate(0, .04, -.05 - i * .093));
  for (const g of back) Wd(g.rotateX(bt).translate(0, .335, -.245));
  const ty = .335 + .45 * Math.sin(bt), tz = -.245 - .45 * Math.cos(bt), by = .32, bz = -.75, sl = Math.hypot(ty - by, tz - bz);
  for (const sx of [-1, 1]) Wd(timber(.03, sl, .035, R, 'y', .005).rotateX(Math.atan2(tz - bz, ty - by)).translate(sx * .235, (ty + by) / 2, (tz + bz) / 2)); // the strut
  solidAt(x, y, zc, ry, 0, .27, .35, .66, .14, 1.2); // the bed
  solidAt(x, y, zc, ry, 0, .45, -.62, .66, .5, .66); // under and behind the backrest
}

// ---- picnic table: five top boards and two seat boards each side on bearers, splayed legs and a brace each end, bolted; weathered.
function picnicTable(z, x, y, zc, ry = 0, o = {}) {
  const R = rng(seed(x, zc)), W = M(z, 'weatheredWood'), S = M(z, 'galvanised'), P = g => put(g, x, y, zc, ry), Wd = g => add(W, P(g), true), L = o.length ?? 1.8;
  const bxs = [-1, 1].map(sx => sx * (L / 2 - .3)), screw = (bx, yt, zz) => { for (const dz of [-.03, .03]) add(S, P(dome(.0045, 8).translate(bx + (R() - .5) * .01, yt, zz + dz))); };
  for (let i = 0; i < 5; i++) { const zz = -.304 + i * .152; Wd(timber(L, .038, .138, R, 'x', .008).translate(0, .731, zz)); for (const bx of bxs) screw(bx, .7498, zz); }
  for (const sz of [-1, 1]) for (let i = 0; i < 2; i++) { const zz = sz * (.56 + i * .128); Wd(timber(L, .038, .118, R, 'x', .008).translate(0, .431, zz)); for (const bx of bxs) screw(bx, .4498, zz); }
  const lg = Math.hypot(.24, .71), la = Math.atan2(.24, .71);
  for (const sx of [-1, 1]) {
    const bx = sx * (L / 2 - .3);
    Wd(timber(.045, .09, .72, R, 'z', .006).translate(bx, .667, 0)); // top bearer
    Wd(timber(.045, .1, 1.62, R, 'z', .006).translate(bx, .362, 0)); // seat bearer
    for (const sz of [-1, 1]) {
      Wd(timber(.045, lg, .11, R, 'y', .006).rotateX(-sz * la).translate(bx + sx * .045, .355, sz * .26)); // legs, splayed
      for (const yy of [.362, .667]) { const zz = sz * (yy < .5 ? .258 : .155); // a carriage bolt through leg and bearer, its nut inside
        add(S, P(dome(.011).rotateZ(-sx * Math.PI / 2).translate(bx + sx * .0675, yy, zz)));
        for (const g of nut(.008)) add(S, P(g.rotateZ(sx * Math.PI / 2).translate(bx - sx * .0225, yy, zz)));
      }
    }
    // the brace: from the middle of the seat bearer up and inward to the underside of the middle top board, bolted at its foot
    Wd(timber(.04, Math.hypot(.35, .3), .07, R, 'y', .006).rotateZ(sx * Math.atan2(.35, .3)).translate(bx - sx * .175, .562, 0));
    add(S, P(dome(.011).rotateZ(-sx * Math.PI / 2).translate(bx + sx * .0225, .385, 0)));
  }
  solidAt(x, y, zc, ry, 0, .7, 0, L, .1, .76); solidAt(x, y, zc, ry, 0, .4, -.62, L, .1, .26); solidAt(x, y, zc, ry, 0, .4, .62, L, .1, .26);
}

// ---- low timber post-and-rail fence along [[x, y, z], ...]: 90 mm posts at most `span` apart with pyramid caps, two rails between.
function fence(z, pts, o = {}) {
  const W = M(z, 'weatheredWood'), S = M(z, 'galvanised'), H = o.height ?? .9, span = o.span ?? 1.8;
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, y0, z0] = pts[s], [x1, , z1] = pts[s + 1], dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), n = Math.ceil(len / span), bay = len / n;
    const R = rng(seed(x0, z0)), P = g => put(g, x0, y0, z0, ry);
    for (let i = 0; i <= n; i++) { // each post leaning its own degree or less, a weathered cap board on top, pinned through at each rail
      if (i === 0 && s > 0) continue;
      const ax = (R() - .5) * .024, az = (R() - .5) * .024, T = g => g.rotateX(ax).rotateZ(az).translate(i * bay, 0, 0);
      add(W, P(T(timber(.09, H + .1, .09, R, 'y', .012).translate(0, (H - .1) / 2, 0))), true);
      add(W, P(T(timber(.12, .024, .12, R, 'x', .008).translate(0, H + .012, 0))), true);
      for (const yy of [.32, H - .17]) for (const sz of [-1, 1]) for (const ox of [-.022, .022]) if (!(i === 0 && ox < 0 || i === n && ox > 0))
        add(S, P(T(dome(.0065, 8).rotateX(sz * Math.PI / 2).translate(ox, yy + ox * .4, sz * .045))));
    }
    // rails, their tenons run into mortises in the posts
    for (let i = 0; i < n; i++) for (const yy of [.32, H - .17]) add(W, P(timber(bay - .06, .095, .045, R, 'x', .01).translate((i + .5) * bay, yy, 0)), true);
    solidAt(x0, y0, z0, ry, len / 2, H / 2, 0, len + .09, H, .09);
  }
}

function yard(plot) { // the garden plot in the dev yard (js/zones/yard.js)
  const { zone, x, z } = plot;
  parkBench(zone, x + 5, 0, z + 5.5);
  mallBench(zone, x + 9, 0, z + 5.5);
  palmPlanter(zone, x + 11.5, 0, z + 3, 0, { lean: 2.2 });
  pottedPlant(zone, x + 4.5, 0, z + 2.5);
  lounger(zone, x + 8, 0, z + 2.4, Math.PI / 2);
  picnicTable(zone, x + 2, 0, z + 6);
  fence(zone, [[x + 4, 0, z + .7], [x + 9.4, 0, z + .7]]);
}

export { parkBench, mallBench, palmPlanter, pottedPlant, lounger, picnicTable, fence, yard };
