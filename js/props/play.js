// Kit: play things (slides, swings, roundabout, spring rider, soft-play foam, swim rings, beach and ball-pit balls, lane floats, chairs).
// Materials: js/tex/plastic.js. Convention, the yard and the inventory: docs/props.md.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from '../core.js';
import { M } from '../mat.js';
import { add, put, spot, solidAt, round } from '../build.js';

const V3 = THREE.Vector3, PI = Math.PI, cl = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- shape helpers: everything is a swept profile, a lathe or a rounded box, so no edge is razor sharp ----------
// A polyline with its corners rounded to radius r (a number, or one per point), n segments per arc. Points [x, y, z] or Vector3.
function fillet(pts, r, n = 6, closed = false) {
  const P = pts.map(p => p.isVector3 ? p : new V3(...p)), N = P.length, out = [];
  for (let i = 0; i < N; i++) {
    const p = P[i], ri = Array.isArray(r) ? r[i] : r;
    if ((!closed && (i === 0 || i === N - 1)) || !ri) { out.push(p.clone()); continue; }
    const da = P[(i - 1 + N) % N].clone().sub(p).normalize(), db = P[(i + 1) % N].clone().sub(p).normalize(), ang = Math.acos(cl(da.dot(db), -1, 1));
    if (ang > 3.12) { out.push(p.clone()); continue; }
    const c = p.clone().addScaledVector(da.clone().add(db).normalize(), ri / Math.sin(ang / 2));
    const u = p.clone().addScaledVector(da, ri / Math.tan(ang / 2)).sub(c), w = p.clone().addScaledVector(db, ri / Math.tan(ang / 2)).sub(c), phi = PI - ang;
    for (let k = 0; k <= n; k++) { const s = k / n; out.push(c.clone().addScaledVector(u, Math.sin((1 - s) * phi) / Math.sin(phi)).addScaledVector(w, Math.sin(s * phi) / Math.sin(phi))); }
  }
  return out;
}
const fillet2 = (pts, r, n = 4) => fillet(pts.map(p => [p[0], p[1], 0]), r, n, true).map(p => [p.x, p.y]); // a closed 2D profile with rounded corners
const circ = (r, n = 12, a0 = 0) => Array.from({ length: n }, (_, j) => [r * Math.cos(a0 + 2 * PI * j / n), r * Math.sin(a0 + 2 * PI * j / n)]);
const area = q => q.reduce((s, p, j) => { const b = q[(j + 1) % q.length]; return s + p[0] * b[1] - b[0] * p[1]; }, 0) / 2;
// Sweep a profile ([x, y] in metres: x across, y up from the path) along a path. Parallel-transported frames, smooth normals,
// UVs in metres (u along the path, v round the profile). o: closed (path is a loop), loop (profile is closed, default true),
// up (the profile's y at the start), round (metres: the open ends drawn in by a quarter round, then capped).
function sweep(pts, prof, o = {}) {
  const closed = !!o.closed, loop = o.loop !== false, rr = o.round || 0, rn = o.rn || 3;
  prof = prof.map(p => [p[0], p[1]]); if (loop && area(prof) < 0) prof.reverse();
  const m = prof.length, pn = prof.map((p, j) => { const a = prof[loop ? (j - 1 + m) % m : Math.max(j - 1, 0)], b = prof[loop ? (j + 1) % m : Math.min(j + 1, m - 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
  const P = pts.map(p => p.isVector3 ? p : new V3(...p)), n = P.length;
  const T = P.map((p, i) => P[closed ? (i + 1) % n : Math.min(i + 1, n - 1)].clone().sub(P[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)]).normalize());
  const up = new V3(...(o.up || [0, 1, 0])); let Nv = up.clone().addScaledVector(T[0], -up.dot(T[0]));
  if (Nv.lengthSq() < 1e-8) Nv = new V3(1, 0, 0).addScaledVector(T[0], -T[0].x); Nv.normalize();
  let fr = [];
  for (let i = 0; i < n; i++) { if (i) Nv = Nv.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(T[i - 1], T[i])).normalize(); fr.push({ p: P[i], T: T[i], N: Nv, B: new V3().crossVectors(T[i], Nv), off: 0 }); }
  if (!closed && rr) { const s0 = [], s1 = [], f0 = fr[0], f1 = fr[n - 1];
    for (let k = 1; k <= rn; k++) { const a = k / rn * PI / 2, off = rr * (1 - Math.cos(a));
      s0.unshift({ ...f0, p: f0.p.clone().addScaledVector(f0.T, -rr * Math.sin(a)), off }); s1.push({ ...f1, p: f1.p.clone().addScaledVector(f1.T, rr * Math.sin(a)), off }); }
    fr = [...s0, ...fr, ...s1]; }
  const F = fr.length, R = F + (closed ? 1 : 0), C = m + (loop ? 1 : 0), pos = [], uv = [], idx = [];
  const vlen = [0]; for (let j = 1; j < C; j++) vlen.push(vlen[j - 1] + Math.hypot(prof[j % m][0] - prof[j - 1][0], prof[j % m][1] - prof[j - 1][1]));
  let u = 0, q = new V3(); const at = (f, j) => { const a = prof[j % m], d = pn[j % m]; return f.p.clone().addScaledVector(f.B, a[0] - d[0] * f.off).addScaledVector(f.N, a[1] - d[1] * f.off); };
  for (let i = 0; i < R; i++) { const f = fr[i % F]; if (i) u += f.p.distanceTo(fr[i - 1].p);
    for (let j = 0; j < C; j++) { q = at(f, j); pos.push(q.x, q.y, q.z); uv.push(u, vlen[j]); } }
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < C - 1; j++) { const a = i * C + j, b = a + C; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const nr = g.attributes.normal, seam = (a, b) => { const v = new V3().fromBufferAttribute(nr, a).add(new V3().fromBufferAttribute(nr, b)).normalize(); nr.setXYZ(a, v.x, v.y, v.z); nr.setXYZ(b, v.x, v.y, v.z); };
  if (loop) for (let i = 0; i < R; i++) seam(i * C, i * C + m);
  if (closed) for (let j = 0; j < C; j++) seam(j, F * C + j);
  g = g.toNonIndexed();
  if (closed || !loop || o.caps === false) return g;
  const tri = THREE.ShapeUtils.triangulateShape(prof.map(p => new THREE.Vector2(...p)), []), caps = [g];
  for (const [f, s] of [[fr[0], -1], [fr[F - 1], 1]]) { const cp = [], cu = [], cn = [];
    for (const t of tri) for (const j of (s < 0 ? t : [t[0], t[2], t[1]])) { const v = at(f, j); cp.push(v.x, v.y, v.z); cn.push(f.T.x * s, f.T.y * s, f.T.z * s); cu.push(prof[j][0], prof[j][1]); }
    const c = new THREE.BufferGeometry(); c.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); c.setAttribute('normal', new THREE.Float32BufferAttribute(cn, 3)); c.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2)); caps.push(c); }
  return mergeGeometries(caps);
}
const tubeG = (pts, r, n = 12, o = {}) => sweep(pts, circ(r, n), o); // a round tube along a path; o.round domes its ends
// A lathe about y from [radius, y] points with its corners rounded (r), n segments round.
const lathe = (pts, r, n = 24, k = 2) => new THREE.LatheGeometry(fillet(pts.map(p => [p[0], p[1], 0]), r, k).map(p => new THREE.Vector2(Math.max(p.x, 0), p.y)), n);
const rbox = (w, h, d, r = .004, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
const nutG = (s = .012) => lathe([[0, 0], [s * .9, 0], [s, s * .2], [s, s * .7], [s * .88, s * .85], [s * .55, s * .85], [s * .55, s * 1.25], [s * .4, s * 1.4], [0, s * 1.4]], 0, 6, 1); // a chamfered hex nut on its stud
const domeG = (s = .009, h = .004) => lathe([[0, 0], [s, 0], [s * .9, h * .6], [s * .5, h], [0, h]], 0, 12, 1); // a domed bolt head
// Orient a geometry built along +y to run along a direction, then place it at p.
const along = (g, dir, p) => g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), new V3(...dir).normalize())).translate(...p);
// The weld bead where a tube of radius r meets the plane y = h: the ellipse it cuts, swept with a small round.
function weldG(base, dir, r, h, w = .0035) {
  const d = new V3(...dir).normalize(), c = new V3(...base).addScaledVector(d, (h - base[1]) / d.y), e1 = new V3(0, 1, 0).cross(d); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize();
  const e2 = new V3().crossVectors(d, e1).normalize(), pts = [];
  for (let k = 0; k < 24; k++) { const a = 2 * PI * k / 24, p = e1.clone().multiplyScalar(r * Math.cos(a)).addScaledVector(e2, r * Math.sin(a)); p.addScaledVector(d, -p.y / d.y); pts.push(c.clone().add(p).add(new V3(p.x, 0, p.z).normalize().multiplyScalar(w * .5))); }
  return sweep(pts, circ(w, 6), { closed: true });
}
// A bolted base plate: plate, four nuts on studs, and the tube's weld bead. At (x, z) on the floor; dir: the tube's direction up from it.
function footPlate(S, G, x, z, dir, r, s = .15, list) {
  list.push([S, rbox(s, .012, s, .004).translate(x, .006, z)], [S, weldG([x, 0, z], dir, r, .012)]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) list.push([G, nutG(.011).translate(x + a * s * .36, .012, z + b * s * .36)]);
}
// Put a list of [material, geometry, ownUV] into the world at (x, y, zc), turned ry.
const place = (list, x, y, zc, ry) => { for (const [m, g, own = true] of list) add(m, put(g, x, y, zc, ry), own); };

// ---------- the swing set ----------
// Two moulded rubber belt seats on galvanised chain from bearing hangers, on a 76 mm painted steel top beam carried by two
// A-frames of 60 mm legs in cast saddle fittings, each leg welded to a base plate bolted down. 3.3 m long, beam at 2.4 m.
const linkG = (() => { const Li = .036, Wi = .014, w = .004, rc = Wi / 2 + w, yc = (Li - Wi) / 2, pts = []; // one 8 mm chain link, 36 mm inside
  for (let k = 0; k <= 4; k++) { const a = PI * k / 4; pts.push([rc * Math.cos(a), yc + rc * Math.sin(a), 0]); }
  for (let k = 0; k <= 4; k++) { const a = PI + PI * k / 4; pts.push([rc * Math.cos(a), -yc + rc * Math.sin(a), 0]); }
  return sweep(pts, circ(w, 4, PI / 4), { closed: true, up: [0, 0, 1] }); })();
function chainG(list, G, x, y1, y2, zc) { // links from y1 down to y2, alternating plane
  const L = .036; for (let i = 0, y = y1 - L / 2; y > y2 + L / 2 - .002; i++, y -= L) { const g = linkG.clone(); if (i % 2) g.rotateY(PI / 2); list.push([G, g.translate(x, y, zc)]); }
}
function swingSet(z, x, y, zc, ry = 0, o = {}) {
  const S = M(z, 'paintedSteel', { color: o.color ?? 0xb83228 }), G = M(z, 'galvanised'), R = M(z, 'rubber'), L = [];
  const H = 2.4, X = 1.5, spread = 1.1, br = .038, lr = .03;
  L.push([S, tubeG([[-X - .12, H, 0], [X + .12, H, 0]], br, 20)]);
  for (const s of [-1, 1]) L.push([R, lathe([[0, 0], [br + .003, 0], [br + .003, .018], [br * .7, .028], [0, .03]], .006, 20).rotateZ(-s * PI / 2).translate(s * (X + .118), H, 0)]); // the beam's end caps
  for (const sx of [-1, 1]) { const ax = sx * X;
    L.push([G, lathe([[0, -.09], [br + .009, -.09], [br + .009, .09], [0, .09]], .006, 24).rotateZ(PI / 2).translate(ax, H, 0)]); // the saddle's sleeve round the beam
    for (const sz of [-1, 1]) { const top = [ax, H - .03, sz * .03], foot = [ax, .004, sz * spread], d = [0, foot[1] - top[1], foot[2] - top[2]], dl = Math.hypot(d[1], d[2]), u = [0, -d[1] / dl, -d[2] / dl];
      L.push([S, tubeG([top, foot], lr, 16)]);
      L.push([G, along(lathe([[0, 0], [lr + .008, 0], [lr + .008, .15], [lr + .003, .16], [0, .16]], .004, 20), [0, -u[1], -u[2]], [ax, H - .02, sz * .02])]); // its socket, gripping the leg
      footPlate(S, G, ax, sz * spread, u, lr, .16, L); }
    for (const sz of [-1, 1]) L.push([G, nutG(.012).rotateX(sz * PI / 2).translate(ax, H, sz * (br + .009))]); // the saddle's clamp bolts
    L.push([S, tubeG([[ax, .9, -spread * .64], [ax, .9, spread * .64]], .017, 12)]); } // the A-frame's tie bar, at knee height
  for (const sx of [-.75, .75]) {
    for (const k of [-1, 1]) { const hx = sx + k * .2; // a hanger: clamp band, two cheeks, a pin, the chain
      L.push([G, lathe([[0, -.022], [br + .006, -.022], [br + .006, .022], [0, .022]], .003, 24).rotateZ(PI / 2).translate(hx, H, 0)]);
      for (const c of [-1, 1]) L.push([G, rbox(.006, .07, .05, .0025).translate(hx + c * .011, H - .055, 0)]);
      L.push([G, tubeG([[hx - .02, H - .075, 0], [hx + .02, H - .075, 0]], .006, 10, { round: .002 })], [G, nutG(.008).rotateZ(-PI / 2).translate(hx + .02, H - .075, 0)]);
      chainG(L, G, hx, H - .068, .515, 0); }
    // the belt seat: moulded rubber 480 x 160 x 18 mm, sagging; a steel clamp at each end with an eye for the chain
    const sag = t => .5 - .05 * (1 - t * t), path = []; for (let i = 0; i <= 16; i++) { const t = -1 + 2 * i / 16; path.push([sx + .225 * t, sag(t), 0]); }
    L.push([R, sweep(path, fillet2([[-.08, -.009], [.08, -.009], [.08, .009], [-.08, .009]], .007), { round: .006 })]);
    for (const k of [-1, 1]) { const ex = sx + k * .2, a = Math.atan(.1 / .225) * k, clamp = [];
      for (const c of [-1, 1]) clamp.push(rbox(.05, .006, .17, .0025).translate(0, c * .0125, 0));
      clamp.push(rbox(.006, .031, .17, .0025).translate(k * .031, 0, 0)); // the channel's web round the seat's end
      clamp.push(nutG(.007).translate(0, .0155, -.05), nutG(.007).translate(0, .0155, .05), tubeG(fillet([[-.012, .016, 0], [-.012, .03, 0], [.012, .03, 0], [.012, .016, 0]], .009, 4), .004, 6));
      for (const g of clamp) L.push([G, g.rotateZ(a).translate(ex, sag(k * .89) + .002, 0)]); }
  }
  place(L, x, y, zc, ry);
  // solids: the beam out of reach, the legs in five lengths, the seats (stand on them) and their chains (no way between)
  solidAt(x, y, zc, ry, 0, H, 0, 2 * X + .3, .09, .09);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 5; i++) { const t = (i + .5) / 5, [px, pz] = spot(x, zc, ry, sx * X, sz * spread * t); round(px, pz, .035, y + H * (1 - (i + 1) / 5), y + H * (1 - i / 5) + .05); }
  for (const sx of [-.75, .75]) { solidAt(x, y, zc, ry, sx, .475, 0, .48, .05, .17); solidAt(x, y, zc, ry, sx, 1.45, 0, .5, 1.9, .03); }
}

// ---------- the slide ----------
// A rotomoulded double-walled polyethylene chute with rolled lips, 1.2 m platform, on two bent 48 mm steel side frames that
// are stringers, handrails and front posts in one piece; moulded ribbed treads bolted through, a moulded deck, bolted feet,
// and a hoop under the run-out.
const chuteProf = fillet2([[-.25, .2], [-.225, .0], [.225, .0], [.25, .2], [.3, .2], [.272, -.045], [-.272, -.045], [-.3, .2]], [.024, .06, .06, .024, .024, .07, .07, .024], 5);
const treadProf = (() => { const p = [[.065, -.035], [.065, 0]]; for (let k = 0; k < 6; k++) { const z0 = .045 - k * .02; p.push([z0 + .003, 0], [z0 + .003, -.004], [z0 - .003, -.004], [z0 - .003, 0]); } p.push([-.065, 0], [-.065, -.035]);
  return fillet2(p, p.map((_, j) => j < 2 || j > p.length - 3 ? .008 : .0012), 2); })();
function slide(z, x, y, zc, ry = 0, o = {}) {
  const P = M(z, 'hardPlastic', { color: o.color ?? 0xe8a21c }), D = M(z, 'hardPlastic', { color: o.deck ?? 0x2f8f5a }), S = M(z, 'paintedSteel', { color: o.frame ?? 0x2b5d8a }), G = M(z, 'galvanised'), L = [];
  const Dk = 1.2, tr = .024, sx = .36, tn = Math.tan(70 * PI / 180), zb = -.5 - Dk / tn, zt = zb + 1.9 / tn, zf = .05;
  for (const s of [-1, 1]) { const ax = s * sx; // the side frame: stringer, handrail, front post, one bent tube
    L.push([S, tubeG(fillet([[ax, .004, zb], [ax, 1.9, zt], [ax, 1.9, zf], [ax, .004, zf]], [0, .16, .13, 0], 8), tr, 16)]);
    footPlate(S, G, ax, zb, [0, tn, 1], tr, .14, L); footPlate(S, G, ax, zf, [0, 1, 0], tr, .14, L); }
  for (const [yy, zz] of [[Dk - .065, zf], [Dk - .06, -.5]]) L.push([S, tubeG([[-sx, yy, zz], [sx, yy, zz]], .019, 12)]); // cross bars under the chute and the deck's back edge
  L.push([D, rbox(2 * sx - .05, .04, .53, .012, 3).translate(0, Dk - .02, -.225), true]); // the moulded deck
  for (let k = 1; k <= 4; k++) { const ty = .24 * k, tz = zb + ty / tn; // treads, bolted through the stringers
    L.push([D, sweep([[-sx + .02, ty, tz], [sx - .02, ty, tz]], treadProf, { round: .004, rn: 1 })]);
    for (const s of [-1, 1]) L.push([G, domeG(.009, .005).rotateZ(-s * PI / 2).translate(s * (sx + tr), ty - .017, tz)]); }
  // the chute: flat lead-in, a 33 degree run, the run-out at 0.3 m; ends rounded over
  const path = fillet([[0, Dk, zf + .006], [0, Dk, .35], [0, .3, .35 + .9 / Math.tan(33 * PI / 180)], [0, .3, 2.3]], [0, .7, 1.1, 0], 14);
  L.push([P, sweep(path, chuteProf, { round: .012 })]);
  const zr = 2.08; L.push([S, tubeG(fillet([[-.2, .004, zr], [-.2, .233, zr], [.2, .233, zr], [.2, .004, zr]], .06, 6), .02, 12)]); // the hoop under the run-out
  for (const s of [-1, 1]) footPlate(S, G, s * .2, zr, [0, 1, 0], .02, .12, L);
  L.push([G, rbox(.46, .004, .045, .0015).translate(0, .2565, zr)]); // the strap it hangs the chute on
  place(L, x, y, zc, ry);
  // solids: the frames, the deck and treads (stand on them), the chute stepped down its run (stand on it, slide down it)
  for (const s of [-1, 1]) { const [px, pz] = spot(x, zc, ry, s * sx, zf); round(px, pz, .03, y, y + 1.93);
    for (let i = 0; i < 6; i++) { const yy = 1.9 * (i + .5) / 6; solidAt(x, y, zc, ry, s * sx, yy, zb + yy / tn, .05, 1.9 / 6 + .02, .1); }
    solidAt(x, y, zc, ry, s * sx, 1.9, (zt + zf) / 2, .05, .05, zf - zt); }
  solidAt(x, y, zc, ry, 0, Dk / 2, -.225, 2 * sx, Dk, .53);
  for (let k = 1; k <= 4; k++) solidAt(x, y, zc, ry, 0, .24 * k - .02, zb + .24 * k / tn, 2 * sx - .05, .04, .13);
  const run = (Dk - .3) / Math.tan(33 * PI / 180), z0 = .35;
  for (let i = 0; i < 10; i++) { const za = z0 + run * i / 10, yt = Dk - (Dk - .3) * (i + .5) / 10; solidAt(x, y, zc, ry, 0, yt / 2, za + run / 20, .6, yt, run / 10); }
  solidAt(x, y, zc, ry, 0, .15, (z0 + run + 2.3) / 2, .6, .3, 2.3 - z0 - run);
  solidAt(x, y, zc, ry, 0, Dk / 2, (.04 + z0) / 2, .6, Dk, z0 - .04);
}

// ---------- the roundabout ----------
// A 1.6 m deck of four moulded polyethylene panels on a painted steel frame (rim tube, six spokes) turning on a bearing
// housing bolted to the ground; a centre column and four bent grab rails bolted through the deck.
function roundabout(z, x, y, zc, ry = 0, o = {}) {
  const A = M(z, 'hardPlastic', { color: o.color ?? 0xd8402c }), B = M(z, 'hardPlastic', { color: o.color2 ?? 0xe8b820 }), S = M(z, 'paintedSteel', { color: o.frame ?? 0x2f6fc0 }), G = M(z, 'galvanised'), L = [];
  const R = .8, top = .3;
  L.push([G, lathe([[0, 0], [.22, 0], [.22, .015], [0, .015]], .004, 32)]);
  for (let k = 0; k < 6; k++) L.push([G, nutG(.012).translate(.17 * Math.cos(k * PI / 3 + .3), .015, .17 * Math.sin(k * PI / 3 + .3))]);
  L.push([S, lathe([[0, .015], [.1, .015], [.1, .17], [.13, .17], [.13, .2], [0, .2]], .008, 32)]); // the bearing housing
  L.push([S, sweep(Array.from({ length: 64 }, (_, k) => [R * Math.cos(k * PI / 32), .245, R * Math.sin(k * PI / 32)]), circ(.024, 12), { closed: true })]); // the rim
  for (let k = 0; k < 6; k++) L.push([S, rbox(R - .12, .04, .04, .006).translate(.1 + (R - .12) / 2, .245, 0).rotateY(k * PI / 3)]); // spokes
  for (let k = 0; k < 4; k++) { const a0 = k * PI / 2 + .012, a1 = (k + 1) * PI / 2 - .012, sh = new THREE.Shape(); // a deck panel, its edges rounded over
    sh.absarc(0, 0, R + .015, a0, a1, false); sh.absarc(0, 0, .14, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: .02, bevelEnabled: true, bevelThickness: .007, bevelSize: .007, bevelSegments: 2, curveSegments: 20 }).rotateX(PI / 2).translate(0, top - .007, 0);
    L.push([k % 2 ? B : A, g, false]);
    for (const [rr, da] of [[.3, .5], [.62, .25], [.62, .75]]) { const a = a0 + (a1 - a0) * da; L.push([G, domeG(.008, .004).translate(rr * Math.cos(a), top, rr * Math.sin(a))]); } }
  L.push([S, tubeG([[0, top - .01, 0], [0, .92, 0]], .038, 20, { round: .03 })], [S, lathe([[0, top - .01], [.16, top - .01], [.16, top + .006], [.05, top + .02], [0, top + .02]], .005, 24)]); // centre column, its collar
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4, c = Math.cos(a), s = Math.sin(a); // grab rails
    const pts = fillet([[.02, .82], [.58, .82], [.64, top + .004]], [0, .1, 0], 8).map(p => [p.x * c, p.y, -p.x * s]);
    L.push([S, tubeG(pts, .016, 12)], [S, lathe([[0, 0], [.032, 0], [.032, .006], [.018, .012], [0, .012]], .002, 16).translate(.64 * c, top, -.64 * s)]); }
  place(L, x, y, zc, ry);
  round(x, zc, R + .02, y, y + top); round(x, zc, .04, y, y + .92); // the deck to stand on, the column
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; solidAt(x, y, zc, ry + a, .34, (top + .84) / 2, 0, .64, .84 - top, .04); }
}

// ---------- the spring rider base ----------
// A heavy painted coil spring (22 mm wire, seven turns, ground ends) between two cast spring cups, the lower one on a
// galvanised ground plate bolted down, the upper one on the top flange a rider would bolt to: here only a moulded cover.
function springRider(z, x, y, zc, ry = 0, o = {}) {
  const S = M(z, 'paintedSteel', { color: o.color ?? 0x3a8f3e }), G = M(z, 'galvanised'), I = M(z, 'castIron'), P = M(z, 'hardPlastic', { color: o.top ?? 0xe8b820 }), L = [];
  L.push([G, rbox(.34, .012, .34, .004).translate(0, .006, 0)]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) L.push([G, nutG(.012).translate(a * .13, .012, b * .13)]);
  L.push([I, lathe([[0, .012], [.13, .012], [.13, .03], [.115, .06], [.1, .06], [.1, .035], [0, .035]], .005, 24)]);
  const r = .085, w = .011, y0 = .046, y1 = .454, turns = 7, n = turns * 22, pts = []; // pitch eased to nothing at both ends: closed, ground ends
  for (let i = 0; i <= n; i++) { const t = i / n, a = 2 * PI * turns * t, e = t - Math.sin(2 * PI * t) / (2 * PI) * .25; pts.push([r * Math.cos(a), y0 + (y1 - y0) * e, r * Math.sin(a)]); }
  L.push([S, tubeG(pts, w, 8, { round: .006, rn: 2 })]);
  L.push([I, lathe([[0, .465], [.1, .465], [.1, .44], [.115, .44], [.13, .47], [.13, .49], [0, .49]], .005, 24)]);
  L.push([G, lathe([[0, .49], [.16, .49], [.16, .502], [0, .502]], .003, 32)]);
  L.push([P, lathe([[0, .502], [.15, .502], [.145, .53], [.1, .565], [0, .575]], .012, 32)]); // the moulded cover the rider would bolt over
  for (let k = 0; k < 4; k++) L.push([G, nutG(.009).translate(.135 * Math.cos(k * PI / 2 + PI / 4), .502, .135 * Math.sin(k * PI / 2 + PI / 4))]);
  place(L, x, y, zc, ry);
  round(x, zc, .16, y, y + .575);
}

// ---------- inflatables: beach ball and swim ring (welded PVC, own UVs: the pvc set's weld bands land on the seams) ----------
// The beach ball: six gores welded pole to pole, a white disc welded over each pole, the valve on one cap. Parts [material, geometry].
function ballParts(z, r = .25) {
  const cols = [0xe8402e, 0xf4f0e6, 0xf6c22b, 0xf4f0e6, 0x2f7fd8, 0xf4f0e6], th = .2, out = [], W = M(z, 'pvc', { color: 0xf4f0e6, uv: [.5, .5] });
  for (let k = 0; k < 6; k++) { const g = new THREE.SphereGeometry(r, 10, 24, k * PI / 3, PI / 3, th, PI - 2 * th), uv = g.attributes.uv; // u across the gore 0..1, v along it in metres
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * r * (PI - 2 * th) * 2); out.push([M(z, 'pvc', { color: cols[k], uv: [.5, .5] }), g]); }
  for (const s of [0, 1]) { const g = new THREE.SphereGeometry(r * 1.003, 24, 4, 0, 2 * PI, 0, th + .02); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, .5 - .495 * (1 - uv.getY(i)), uv.getX(i) * 4 * PI * r * Math.sin(th));
    if (s) g.rotateX(PI); out.push([W, g]); }
  out.push([W, lathe([[0, 0], [.018, 0], [.018, .004], [.011, .006], [.011, .014], [.006, .017], [0, .017]], .002, 16).translate(0, r * .995, 0).rotateZ(.08)]);
  return out;
}
// The swim ring: two half-tubes welded along the inner and outer equator, in print bands; the valve on top.
function ringParts(z, o = {}) {
  const R = o.R ?? .42, r = o.r ?? .13, n = 72, cols = [o.color ?? 0xff8fb0, o.color2 ?? 0xf4f0e6], out = [], bands = o.bands ?? 8;
  for (let b = 0; b < bands; b++) { const m = M(z, 'pvc', { color: cols[b % 2], uv: [.5, .5] }), pts = [];
    for (let i = 0; i <= n / bands; i++) { const a = 2 * PI * (b + i * bands / n) / bands; pts.push([R * Math.cos(a), 0, R * Math.sin(a)]); }
    for (const h of [0, 1]) { const prof = Array.from({ length: 13 }, (_, j) => { const a = PI * h + PI * j / 12; return [r * Math.cos(a), r * Math.sin(a)]; });
      const g = sweep(pts, prof, { loop: false }), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) / (PI * r), uv.getX(i) / .5);
      out.push([m, g]); } }
  out.push([M(z, 'pvc', { color: cols[1], uv: [.5, .5] }), lathe([[0, 0], [.016, 0], [.016, .005], [.01, .007], [.01, .015], [.005, .018], [0, .018]], .002, 16).translate(R, r - .002, 0)]);
  return out;
}
// A loose one for a place to hand to physics: one Mesh, one group per material. beachBall(z) matches mat.js's beachBall.
function partsMesh(parts) {
  const mats = [...new Set(parts.map(p => p[0]))], geos = mats.map(m => mergeGeometries(parts.filter(p => p[0] === m).map(p => p[1].index ? p[1].toNonIndexed() : p[1])));
  const mesh = new THREE.Mesh(mergeGeometries(geos, true), mats); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
const beachBall = (z, r = .25) => partsMesh(ballParts(z, r));
const swimRing = (z, o = {}) => partsMesh(ringParts(z, o)); // lying flat, centred on its origin: push it onto `rings`

function yard(plot) { // the play plot in the dev yard (js/zones/yard.js)
  const { zone: z, x, z: Z } = plot;
  swingSet(z, x + 6.2, 0, Z + 3.2);
  slide(z, x + 10, 0, Z + 1.6, .35);
  roundabout(z, x + 12.3, 0, Z + 6.2);
  springRider(z, x + 1.8, 0, Z + 5.2);
  for (const [m, g] of ballParts(z)) add(m, g.rotateX(.5).rotateY(.7).translate(x + 3.1, .25, Z + 7.1), true);
  for (const [m, g] of ringParts(z)) add(m, g.rotateY(.4).translate(x + 4.7, .13, Z + 7.2), true);
  round(x + 3.1, Z + 7.1, .25, 0, .5); solidAt(x + 4.7, 0, Z + 7.2, 0, 0, .13, 0, 1.1, .26, 1.1);
}

export { swingSet, slide, roundabout, springRider, beachBall, swimRing, yard };
