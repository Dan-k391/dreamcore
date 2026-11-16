// Kit: play things (slides, swings, roundabout, spring rider, soft-play foam, swim rings, beach and ball-pit balls, lane floats, chairs).
// Materials: js/tex/plastic.js. Convention, the yard and the inventory: docs/props.md.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from '../core.js';
import { M } from '../mat.js';
import { add, put, spot, solidAt, round, RoundedBoxGeometry } from '../build.js';

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
// up (the profile's y at the start), round (metres: the open ends drawn in by a quarter round, then capped), warp (f(Vector3): moves each point before normals).
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
    for (let j = 0; j < C; j++) { q = at(f, j); if (o.warp) o.warp(q); pos.push(q.x, q.y, q.z); uv.push(u, vlen[j]); } }
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
// name: tally its triangles and materials in cost (what one call costs).
const cost = {}, tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
const place = (list, x, y, zc, ry, name) => { if (name) cost[name] = { tris: Math.round(list.reduce((s, [, g]) => s + tris(g), 0)), mats: new Set(list.map(l => l[0])).size };
  for (const [m, g, own = true] of list) add(m, put(g, x, y, zc, ry), own); };

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
// The belt seat's moulded section, 160 mm across: a dished 6 mm web between two rolled 24 mm beads, three ribs under the web.
const seatProf = (() => { const t = [[-.08, .004], [-.072, .012], [-.06, .011], [-.054, .006], [.054, .006], [.06, .011], [.072, .012], [.08, .004]], b = [[.08, -.006], [.072, -.012], [.06, -.011], [.05, -.004]];
  for (const c of [.035, 0, -.035]) b.push([c + .007, -.004], [c + .004, -.011], [c - .004, -.011], [c - .007, -.004]);
  b.push([-.05, -.004], [-.06, -.011], [-.072, -.012], [-.08, -.006]); const p = [...t, ...b]; return fillet2(p, p.map((_, j) => j === 0 || j === 7 || j === 8 || j === p.length - 1 ? .005 : .002), 2); })();
const clampProf = fillet2([[-.025, .0155], [.034, .0155], [.034, -.0155], [-.025, -.0155], [-.025, -.0105], [.029, -.0105], [.029, .0105], [-.025, .0105]], [.002, .005, .005, .002, .002, .0015, .0015, .002], 2);
function swingSet(z, x, y, zc, ry = 0, o = {}) {
  const S = M(z, 'powderCoat', { color: o.color ?? 0xb83228 }), G = M(z, 'galvanised'), R = M(z, 'rubber'), L = [];
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
    L.push([R, sweep(path, seatProf, { round: .006 })]);
    for (const k of [-1, 1]) { const ex = sx + k * .2, a = Math.atan(.1 / .225) * k, clamp = [];
      // a pressed steel channel round the seat's end, its flanges' edges rolled, bolted through with nuts on top and dome heads under
      clamp.push(sweep([[0, 0, -.085], [0, 0, .085]], clampProf.map(p => [-k * p[0], p[1]]), { round: .002, rn: 2 }));
      for (const c of [-.05, .05]) clamp.push(nutG(.007).translate(0, .0155, c), domeG(.007, .003).rotateX(PI).translate(0, -.0155, c));
      clamp.push(tubeG(fillet([[-.012, .016, 0], [-.012, .03, 0], [.012, .03, 0], [.012, .016, 0]], .009, 4), .004, 6));
      for (const g of clamp) L.push([G, g.rotateZ(a).translate(ex, sag(k * .89) + .002, 0)]); }
  }
  place(L, x, y, zc, ry, 'swingSet');
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
const chuteMid = (() => { const p = area(chuteProf) < 0 ? [...chuteProf].reverse() : chuteProf; let v = 0; // the sweep's v at the bed's centre
  for (let j = 0; j < p.length; j++) { const a = p[j], b = p[(j + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.abs(a[1]) < 1e-6 && Math.abs(b[1]) < 1e-6 && a[0] * b[0] <= 0) return v + l * Math.abs(a[0]) / Math.abs(b[0] - a[0]); v += l; }
  throw new Error('chute profile has no bed'); })();
function slide(z, x, y, zc, ry = 0, o = {}) {
  const P = M(z, 'slideChute', { color: o.color ?? 0xe8a21c }), D = M(z, 'hardPlastic', { color: o.deck ?? 0x2f8f5a }), S = M(z, 'powderCoat', { color: o.frame ?? 0x2b5d8a }), G = M(z, 'galvanised'), L = [];
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
  const ch = sweep(path, chuteProf, { round: .012 }), cu = ch.attributes.uv; let Lu = 0; for (let i = 0; i < cu.count; i++) Lu = Math.max(Lu, cu.getX(i));
  for (let i = 0; i < cu.count; i++) cu.setXY(i, 2 * cu.getX(i) / Lu, cu.getY(i) - chuteMid + 1); // slideChute's mapping: u 0..1 down the chute, the bed's centre at v .5
  L.push([P, ch]);
  const zr = 2.08; L.push([S, tubeG(fillet([[-.2, .004, zr], [-.2, .233, zr], [.2, .233, zr], [.2, .004, zr]], .06, 6), .02, 12)]); // the hoop under the run-out
  for (const s of [-1, 1]) footPlate(S, G, s * .2, zr, [0, 1, 0], .02, .12, L);
  L.push([G, rbox(.46, .004, .045, .0015).translate(0, .253, zr)]); // the strap it hangs the chute on, under the chute's bottom
  place(L, x, y, zc, ry, 'slide');
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
  const A = M(z, 'deckTread', { color: o.color ?? 0xd8402c }), B = M(z, 'deckTread', { color: o.color2 ?? 0xe8b820 }), S = M(z, 'powderCoat', { color: o.frame ?? 0x2f6fc0 }), G = M(z, 'galvanised'), L = [];
  const R = .8, top = .3;
  L.push([G, lathe([[0, 0], [.22, 0], [.22, .015], [0, .015]], .004, 32)]);
  for (let k = 0; k < 6; k++) L.push([G, nutG(.012).translate(.17 * Math.cos(k * PI / 3 + .3), .015, .17 * Math.sin(k * PI / 3 + .3))]);
  L.push([S, lathe([[0, .015], [.1, .015], [.1, .17], [.13, .17], [.13, .2], [0, .2]], .008, 32)]); // the bearing housing
  L.push([S, sweep(Array.from({ length: 64 }, (_, k) => [R * Math.cos(k * PI / 32), .245, R * Math.sin(k * PI / 32)]), circ(.024, 12), { closed: true })]); // the rim
  for (let k = 0; k < 6; k++) L.push([S, rbox(R - .12, .04, .04, .006).translate(.1 + (R - .12) / 2, .245, 0).rotateY(k * PI / 3)]); // spokes
  for (let k = 0; k < 4; k++) { const a0 = k * PI / 2 + .012, a1 = (k + 1) * PI / 2 - .012, sh = new THREE.Shape(); // a deck panel, its edges rounded over
    sh.absarc(0, 0, R + .015, a0, a1, false); sh.absarc(0, 0, .14, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: .02, bevelEnabled: true, bevelThickness: .007, bevelSize: .007, bevelSegments: 2, curveSegments: 20 }).rotateX(PI / 2).translate(0, top - .007, 0);
    L.push([k % 2 ? B : A, g, true]); // own UVs: the shape's metres about the hub, as deckTread wants
    for (const [rr, da] of [[.3, .5], [.62, .25], [.62, .75]]) { const a = a0 + (a1 - a0) * da; L.push([G, domeG(.008, .004).translate(rr * Math.cos(a), top, rr * Math.sin(a))]); } }
  L.push([S, tubeG([[0, top - .01, 0], [0, .92, 0]], .038, 20, { round: .03 })], [S, lathe([[0, top - .01], [.16, top - .01], [.16, top + .006], [.05, top + .02], [0, top + .02]], .005, 24)]); // centre column, its collar
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4, c = Math.cos(a), s = Math.sin(a); // grab rails
    const pts = fillet([[.02, .82], [.58, .82], [.64, top + .004]], [0, .1, 0], 8).map(p => [p.x * c, p.y, -p.x * s]);
    L.push([S, tubeG(pts, .016, 12)], [S, lathe([[0, 0], [.032, 0], [.032, .006], [.018, .012], [0, .012]], .002, 16).translate(.64 * c, top, -.64 * s)]); }
  place(L, x, y, zc, ry, 'roundabout');
  round(x, zc, R + .02, y, y + top); round(x, zc, .04, y, y + .92); // the deck to stand on, the column
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; solidAt(x, y, zc, ry + a, .34, (top + .84) / 2, 0, .64, .84 - top, .04); }
}

// ---------- the spring rider base ----------
// A heavy painted coil spring (22 mm wire, seven turns, ground ends) between two cast spring cups, the lower one on a
// galvanised ground plate bolted down, the upper one on the top flange a rider would bolt to: here only a moulded cover.
function springRider(z, x, y, zc, ry = 0, o = {}) {
  const S = M(z, 'powderCoat', { color: o.color ?? 0x3a8f3e }), G = M(z, 'galvanised'), I = M(z, 'castIron'), P = M(z, 'hardPlastic', { color: o.top ?? 0xe8b820 }), L = [];
  L.push([G, rbox(.34, .012, .34, .004).translate(0, .006, 0)]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) L.push([G, nutG(.012).translate(a * .13, .012, b * .13)]);
  L.push([I, lathe([[0, .012], [.13, .012], [.13, .03], [.115, .06], [.1, .06], [.1, .035], [0, .035]], .005, 24)]);
  const r = .085, w = .011, y0 = .046, y1 = .454, turns = 7, n = turns * 22, pts = []; // pitch eased to nothing at both ends: closed, ground ends
  for (let i = 0; i <= n; i++) { const t = i / n, a = 2 * PI * turns * t, e = t - Math.sin(2 * PI * t) / (2 * PI) * .25; pts.push([r * Math.cos(a), y0 + (y1 - y0) * e, r * Math.sin(a)]); }
  L.push([S, tubeG(pts, w, 8, { round: .006, rn: 2 })]);
  L.push([I, lathe([[0, .465], [.1, .465], [.1, .44], [.115, .44], [.13, .47], [.13, .49], [0, .49]], .005, 24)]);
  L.push([G, lathe([[0, .49], [.16, .49], [.16, .502], [0, .502]], .003, 32)]);
  for (let k = 0; k < 4; k++) L.push([G, nutG(.009).translate(.135 * Math.cos(k * PI / 2 + PI / 4), .502, .135 * Math.sin(k * PI / 2 + PI / 4))]);
  if (!o.rider) // the moulded cover the rider would bolt over: a stepped rim, a grip ring of ribs, a domed boss with its drain hole
    L.push([P, lathe([[0, .566], [.006, .566], [.008, .575], [.05, .571], [.1, .558], [.112, .548], [.118, .553], [.13, .54], [.136, .544], [.146, .53], [.15, .516], [.156, .514], [.156, .502]], .003, 32, 1)]); // open underneath: the flange's top is the face it sits on
  else { // o.rider: a generic moulded seat body bolted on the flange, rubber saddle pad, a T handlebar and a footrest bar with grips
    const R = M(z, 'rubber'), side = fillet2([[-.27, 0], [.27, 0], [.27, .13], [.2, .24], [.14, .2], [.08, .15], [-.12, .15], [-.2, .2], [-.27, .2]], [.03, .03, .04, .04, .05, .06, .06, .05, .04], 5); // its side, z and y
    L.push([P, sweep([[-.11, .51, 0], [.11, .51, 0]], side, { round: .04, rn: 4 })]);
    L.push([R, rbox(.2, .028, .19, .013, 3).translate(0, .668, -.02)]);
    L.push([S, tubeG([[0, .69, .19], [0, .93, .25]], .016, 12)], [S, tubeG([[-.13, .93, .25], [.13, .93, .25]], .016, 12, { round: .008 })]);
    for (const s of [-1, 1]) { L.push([R, along(lathe([[0, 0], [.021, 0], [.022, .012], [.02, .02], [.021, .1], [.022, .11], [0, .112]], .003, 16), [s, 0, 0], [s * .045, .93, .25])]);
      L.push([R, along(lathe([[0, 0], [.018, 0], [.018, .09], [0, .092]], .004, 14), [s, 0, 0], [s * .14, .57, .1])]); }
    L.push([S, tubeG([[-.235, .57, .1], [.235, .57, .1]], .013, 10, { round: .006 })]);
    for (const s of [-1, 1]) L.push([G, domeG(.012, .006).rotateZ(-s * PI / 2).translate(s * .152, .62, .12)], [G, domeG(.012, .006).rotateZ(-s * PI / 2).translate(s * .152, .62, -.18)]); }
  place(L, x, y, zc, ry, o.rider ? 'springRider+rider' : 'springRider');
  round(x, zc, .16, y, y + .575);
  if (o.rider) { solidAt(x, y, zc, ry, 0, .6, -.02, .3, .16, .56); solidAt(x, y, zc, ry, 0, .8, .23, .3, .26, .05); }
}

// ---------- inflatables: beach ball and swim ring (welded PVC, own UVs: the pvc set's weld bands land on the seams) ----------
// The beach ball: six gores welded pole to pole, a white disc welded over each pole, the valve on one cap. Parts [material, geometry].
function ballParts(z, r = .25) {
  const cols = [0xe8402e, 0xf4f0e6, 0xf6c22b, 0xf4f0e6, 0x2f7fd8, 0xf4f0e6], th = .2, out = [], W = M(z, 'pvc', { color: 0xf4f0e6, uv: [.5, .5] });
  for (let k = 0; k < 6; k++) { const g = new THREE.SphereGeometry(r, 10, 24, k * PI / 3, PI / 3, th, PI - 2 * th), uv = g.attributes.uv, p = g.attributes.position, m = M(z, 'pvc', { color: cols[k], uv: [.5, .5] }); // u across the gore 0..1, v along it in metres
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), q = new V3().fromBufferAttribute(p, i), a = Math.acos(cl(q.y / r, -1, 1)), ph = Math.atan2(q.z, q.x);
      // each gore pillows out between its welds (pulled in 3 mm at them), and puckers into soft creases near the valve's pole
      const s = 1 - .012 * (1 - Math.sin(PI * u)) ** 2 - .006 * Math.max(0, 1 - a / .55) * (.5 + .5 * Math.cos(ph * 16 + a * 22)) ** 3;
      p.setXYZ(i, q.x * s, q.y * s, q.z * s); uv.setXY(i, u, uv.getY(i) * r * (PI - 2 * th) * 2); }
    g.computeVertexNormals(); out.push([m, g]);
    const seam = []; for (let i = 0; i <= 24; i++) { const a = th - .02 + (PI - 2 * th + .04) * i / 24; seam.push([-r * .99 * Math.sin(a) * Math.cos(k * PI / 3), r * .99 * Math.cos(a), r * .99 * Math.sin(a) * Math.sin(k * PI / 3)]); }
    out.push([m, tubeG(seam, .0028, 6)]); } // the weld's raised bead between this gore and the last
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
      const g = sweep(pts, prof, { loop: false, warp: q => { const a = Math.atan2(q.z, q.x), k = Math.max(0, 1 - Math.abs(a) / .3); // soft wrinkles across the tube round the valve
        if (k && q.y > 0) q.y -= .0025 * k * (q.y / r) * (.5 + .5 * Math.cos(a * 70)) ** 2; } }), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) / (PI * r), uv.getX(i) / .5);
      out.push([m, g]); } }
  out.push([M(z, 'pvc', { color: cols[1], uv: [.5, .5] }), lathe([[0, 0], [.016, 0], [.016, .005], [.01, .007], [.01, .015], [.005, .018], [0, .018]], .002, 16).translate(R, r - .002, 0)]);
  // the two halves' weld: a thin flat flange standing out round the outer and the inner equator
  const fl = fillet2([[0, -.0008], [.006, -.0008], [.006, .0008], [0, .0008]], .0007, 1), loop = rr => Array.from({ length: n }, (_, i) => [rr * Math.cos(2 * PI * i / n), 0, rr * Math.sin(2 * PI * i / n)]);
  const F = M(z, 'pvc', { color: cols[1], uv: [.5, .5] }); out.push([F, sweep(loop(R + r - .001), fl.map(p => [-p[0], p[1]]), { closed: true })], [F, sweep(loop(R - r + .001), fl, { closed: true })]);
  return out;
}
// A loose one for a place to hand to physics: one Mesh, one group per material. beachBall(z) matches mat.js's beachBall.
function partsMesh(parts) {
  const mats = [...new Set(parts.map(p => p[0]))], geos = mats.map(m => mergeGeometries(parts.filter(p => p[0] === m).map(p => p[1].index ? p[1].toNonIndexed() : p[1])));
  const mesh = new THREE.Mesh(mergeGeometries(geos, true), mats); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
const beachBall = (z, r = .25) => partsMesh(ballParts(z, r));
const swimRing = (z, o = {}) => partsMesh(ringParts(z, o)); // lying flat, centred on its origin: push it onto `rings`

// ---------- soft play: vinyl-covered foam shapes ----------
// Each is a foam block in a sewn cover: a panel per face, so vinylFoam's seams, rolled edges and stitching (on its tile's
// edges) are mapped to the face's edges: each triangle gets its face's box projection, scaled to the shape's extent there.
// The cover closes with a nylon coil zip along the back's foot, its slider parked at one end with the pull hanging.
function faceUV(g) {
  g = g.index ? g.toNonIndexed() : g; g.computeBoundingBox(); const { min, max } = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv || new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2), a = new V3(), b = new V3(), c = new V3();
  const n01 = (v, k) => (v - min.getComponent(k)) / (max.getComponent(k) - min.getComponent(k) || 1);
  for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); const nn = b.clone().sub(a).cross(c.clone().sub(a)), ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
    const [k1, k2] = ay >= ax && ay >= az ? [0, 2] : ax >= az ? [2, 1] : [0, 1];
    for (let j = 0; j < 3; j++) uv.setXY(i + j, n01(p.getComponent(i + j, k1), k1), n01(p.getComponent(i + j, k2), k2)); }
  g.setAttribute('uv', uv); return g;
}
const vinyl = (z, o, def) => M(z, 'vinylFoam', { color: o.color ?? def, uv: [1, 1] });
function zipAt(L, z, w, zb) { // a zip w long along x on the face z = zb (facing -z), 40 mm up
  const R = M(z, 'rubber'), G = M(z, 'galvanised');
  L.push([R, rbox(w, .026, .004, .0015).translate(0, .04, zb - .001)], [R, tubeG([[-w / 2 + .01, .04, zb - .0035], [w / 2 - .01, .04, zb - .0035]], .0022, 6, { round: .002 })]);
  L.push([G, rbox(.03, .011, .007, .002).translate(w / 2 - .03, .04, zb - .006)], [G, rbox(.01, .026, .0025, .001).rotateX(-.15).translate(w / 2 - .03, .025, zb - .01)]);
}
function foamCube(z, x, y, zc, ry = 0, o = {}) { // o.s: the side, 0.6 m
  const s = o.s ?? .6, L = [[vinyl(z, o, 0x3f8fe0), faceUV(rbox(s, s, s, .035, 4).translate(0, s / 2, 0))]];
  zipAt(L, z, s * .8, -s / 2); place(L, x, y, zc, ry, 'foamCube'); solidAt(x, y, zc, ry, 0, s / 2, 0, s, s, s);
}
function foamWedge(z, x, y, zc, ry = 0, o = {}) { // o.w across, o.d long, o.h tall at the back (-z), down to nothing at the front (+z)
  const w = o.w ?? .6, d = o.d ?? .9, h = o.h ?? .45;
  const L = [[vinyl(z, o, 0xf2c230), faceUV(sweep([[-w / 2 + .03, 0, 0], [w / 2 - .03, 0, 0]], fillet2([[-d / 2, 0], [d / 2, 0], [-d / 2, h]], [.03, .012, .03], 5), { round: .03, rn: 4 }))]];
  zipAt(L, z, w * .8, -d / 2); place(L, x, y, zc, ry, 'foamWedge');
  for (let i = 0; i < 5; i++) { const t = (i + .5) / 5, hh = h * (1 - t); solidAt(x, y, zc, ry, 0, hh / 2, -d / 2 + d * t, w, hh, d / 5); } // stepped down the slope: walk up it
}
function foamCylinder(z, x, y, zc, ry = 0, o = {}) { // o.r, o.h: 0.3 m, 0.6 m, standing on its end
  const r = o.r ?? .3, h = o.h ?? .6, g = lathe([[0, 0], [r, 0], [r, h], [0, h]], .035, 40, 4).rotateY(PI).toNonIndexed(), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i += 3) { let rr = 0; for (let j = 0; j < 3; j++) rr += Math.hypot(p.getX(i + j), p.getZ(i + j)) / 3; // per triangle: the side panel wraps once (its seam at the back), the end panels inside it
    for (let j = i; j < i + 3; j++) rr > r - .02 ? uv.setXY(j, uv.getX(j), p.getY(j) / h) : uv.setXY(j, .5 + p.getX(j) / (2.4 * r), .5 + p.getZ(j) / (2.4 * r)); }
  const L = [[vinyl(z, o, 0x58c070), g]]; place(L, x, y, zc, ry, 'foamCylinder'); round(x, zc, r, y, y + h);
}
function foamArch(z, x, y, zc, ry = 0, o = {}) { // o.w across, o.h tall, o.d deep, o.a the opening's radius: 1.2, 0.6, 0.4, 0.35 m
  const w = o.w ?? 1.2, h = o.h ?? .6, d = o.d ?? .4, a = o.a ?? .35, pts = [[w / 2, 0], [w / 2, h], [-w / 2, h], [-w / 2, 0], [-a, 0]];
  for (let k = 1; k < 16; k++) pts.push([-a * Math.cos(PI * k / 16), a * Math.sin(PI * k / 16)]); pts.push([a, 0]);
  const prof = fillet2(pts, pts.map((_, j) => j < 5 || j === pts.length - 1 ? .03 : 0), 5).map(p => [-p[0], p[1]]); // the path runs +z, so its x is mirrored
  const L = [[vinyl(z, o, 0xe85a4a), faceUV(sweep([[0, 0, -d / 2 + .03], [0, 0, d / 2 - .03]], prof, { round: .03, rn: 4 }))]];
  zipAt(L, z, (w / 2 - a) * .7, -d / 2); L[L.length - 4][1].translate(-(w / 2 + a) / 2, 0, 0); for (let k = 1; k <= 3; k++) L[L.length - k][1].translate(-(w / 2 + a) / 2, 0, 0); // under one pier's back
  place(L, x, y, zc, ry, 'foamArch');
  for (const s of [-1, 1]) solidAt(x, y, zc, ry, s * (w / 2 + a) / 2, h / 2, 0, w / 2 - a, h, d);
  solidAt(x, y, zc, ry, 0, (h + a) / 2, 0, 2 * a, h - a, d);
}

// ---------- ball-pit balls ----------
// A place's InstancedMesh of pit balls uses these: the plain shape for most, the finer one physics.js swaps in near the eye
// (`fine`), and pitBall's material (white, tinted per ball by setColorAt). The parting line runs round the shape's equator.
const pitBall = (z, r = .1) => ({ geometry: new THREE.SphereGeometry(r, 14, 10), fine: new THREE.SphereGeometry(r, 32, 20), material: M(z, 'pitBall') });

// ---------- pool lane rope ----------
// Floats 110 mm across, each a moulded spool of three finned discs, threaded on a stainless cable between two anchors;
// 5 m of red at each end, then blue and white. Lying on the water at the points' height. pts [[x, y, zc], [x, y, zc]].
const floatG = lathe([[.005, -.05], [.03, -.05], [.052, -.042], [.054, -.034], [.03, -.028], [.03, -.006], [.055, -.003], [.055, .003], [.03, .006], [.03, .028], [.054, .034], [.052, .042], [.03, .05], [.005, .05]], 0, 12, 1);
function laneRope(z, pts, o = {}) {
  const [a, b] = pts.map(p => new V3(...p)), dir = b.clone().sub(a), len = dir.length(), n = Math.floor((len - .3) / .1), cols = o.colors ?? [0xd23a2a, 0x2f6fd0, 0xf2efe6], E = o.ends ?? 5; // o.ends: metres of red at each end
  const mats = cols.map(c => M(z, 'hardPlastic', { color: c })), G = M(z, 'galvanised'), d = dir.clone().normalize(), parts = new Map(mats.map(m => [m, []]));
  for (let i = 0; i < n; i++) { const s = .15 + (i + .5) * (len - .3) / n, c = s < E || s > len - E ? 0 : 1 + (Math.floor((s - E) / .5) % 2), p = a.clone().addScaledVector(d, s);
    parts.get(mats[c]).push(along(floatG.clone(), d.toArray(), [p.x, p.y, p.z])); }
  for (const [m, gs] of parts) if (gs.length) add(m, mergeGeometries(gs), true);
  add(G, tubeG([a.clone().addScaledVector(d, .06), b.clone().addScaledVector(d, -.06)], .004, 6), true);
  for (const [p, s] of [[a, 1], [b, -1]]) { const e = p.clone().addScaledVector(d, s * .06); add(G, along(lathe([[0, 0], [.009, 0], [.009, .07], [.006, .08], [0, .08]], .002, 10, 1), d.clone().multiplyScalar(-s).toArray(), e.toArray()), true); } // the swaged terminals at the anchors
  cost.laneRope = { tris: n * tris(floatG) + 400, mats: mats.length + 1, perFloat: tris(floatG) };
  if (o.solid !== false) { const m = a.clone().add(b).multiplyScalar(.5); solidAt(m.x, m.y - .06, m.z, Math.atan2(-d.z, d.x), 0, .06, 0, len, .12, .12); }
}

// ---------- stackable moulded garden chair ----------
// One injection moulding in polypropylene: legs and back stiles of open U-channel (open toward the inside, so chairs nest),
// a seat shell with a rolled front edge and ribs under it, a back of curved slats with slots between, flat arms on top.
// 0.56 m wide, seat at 0.44 m, back to 0.8 m; facing +z.
const legProf = fillet2([[-.022, -.018], [.022, -.018], [.022, .018], [.017, .018], [.017, -.013], [-.017, -.013], [-.017, .018], [-.022, .018]], [.007, .007, .003, .003, .002, .002, .003, .003], 2);
function gardenChair(z, x, y, zc, ry = 0, o = {}) {
  const P = M(z, 'hardPlastic', { color: o.color ?? 0xe6e2d6 }), L = [], slat = (yy, hh, tk) => { const pts = [];
    for (let i = 0; i <= 10; i++) { const xx = -.215 + .43 * i / 10; pts.push([xx, yy, .3 - Math.sqrt(.55 * .55 - xx * xx) - .1 * (yy - .45)]); }
    return sweep(pts, fillet2([[-tk / 2, -hh / 2], [tk / 2, -hh / 2], [tk / 2, hh / 2], [-tk / 2, hh / 2]], Math.min(tk, hh) * .45, 3), { round: .006, rn: 2 }); };
  for (const s of [-1, 1]) { const pr = legProf.map(p => [p[0], -s * p[1]]); // the channel opens toward the middle
    L.push([P, sweep(fillet([[s * .27, 0, .265], [s * .245, .42, .2], [s * .245, .63, .185]], [0, .12, 0], 8), pr, { round: .006, rn: 2 })]);
    L.push([P, sweep(fillet([[s * .27, 0, -.27], [s * .232, .42, -.2], [s * .222, .8, -.25]], [0, .14, 0], 8), pr, { round: .012, rn: 3 })]);
    L.push([P, sweep(fillet([[s * .235, .64, -.215], [s * .245, .655, .05], [s * .25, .64, .2]], [0, .3, 0], 6), fillet2([[-.028, -.009], [.028, -.009], [.028, .009], [-.028, .009]], .008, 3), { round: .012, rn: 3 })]); // the arm
    L.push([P, rbox(.022, .05, .4, .008).translate(s * .228, .4, 0)]); } // the seat's side skirt, joining the legs
  L.push([P, rbox(.48, .022, .43, .011, 3).translate(0, .43, -.005)], [P, tubeG([[-.235, .425, .21], [.235, .425, .21]], .014, 12, { round: .01 })]); // seat shell, its rolled front
  for (const c of [-.11, .1]) L.push([P, rbox(.44, .028, .01, .004).translate(0, .405, c)]); // ribs under it
  for (const yy of [.5, .575, .65]) L.push([P, slat(yy, .052, .016)]);
  L.push([P, slat(.745, .095, .022)]); // the top rail
  place(L, x, y, zc, ry, 'gardenChair');
  solidAt(x, y, zc, ry, 0, .22, 0, .52, .44, .5); solidAt(x, y, zc, ry, 0, .62, -.24, .5, .38, .07);
}

function yard(plot) { // the play plot in the dev yard (js/zones/yard.js)
  const { zone: z, x, z: Z } = plot;
  swingSet(z, x + 6.2, 0, Z + 3.2);
  slide(z, x + 10, 0, Z + 1.6, .35);
  roundabout(z, x + 12.3, 0, Z + 6.2);
  springRider(z, x + 1.8, 0, Z + 5.2, 0, { rider: true });
  foamCube(z, x + 6, 0, Z + 6.5, .2); foamWedge(z, x + 7, 0, Z + 6.5, -.3); foamCylinder(z, x + 8, 0, Z + 6.5); foamArch(z, x + 9.4, 0, Z + 6.8, .15);
  gardenChair(z, x + 3.6, 0, Z + 5.4, .4);
  laneRope(z, [[x + 5.4, .055, Z + 7.6], [x + 11.4, .055, Z + 7.6]], { solid: false, ends: 1.5 }); // on the floor; ends short so the colour change shows
  { const { geometry, fine, material } = pitBall(z), cols = [0xff5d73, 0x4db8ff, 0xffd84a, 0x58d68d, 0xff9f43, 0xffffff].map(c => new THREE.Color(c)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const at = []; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (Math.abs(i + j) <= 2) at.push([.2 * i + .1 * j, .1, .1732 * j]); // a little heap: a hexagon of 19, the hollows near its middle filled, one on top
    for (const [px, , pz] of at.slice()) if (Math.hypot(px + .1, pz + .0577) < .3) at.push([px + .1, .263, pz + .0577]); at.push([0, .426, .1155]);
    const n = at.length, b = new THREE.InstancedMesh(fine, material, n);
    for (let i = 0; i < n; i++) { q.setFromEuler(new THREE.Euler(i * 1.3, i * 2.1, i * .7)); m4.compose(new V3(x + 1.5 + at[i][0], at[i][1], Z + 7 + at[i][2]), q, new V3(1, 1, 1)); b.setMatrixAt(i, m4); b.setColorAt(i, cols[(i * 7) % 6]); } // each turned at random
    b.castShadow = b.receiveShadow = true; scene.add(b); }
  for (const [m, g] of ballParts(z)) add(m, g.rotateX(.5).rotateY(.7).translate(x + 3.1, .25, Z + 7.1), true);
  for (const [m, g] of ringParts(z)) add(m, g.rotateY(.4).translate(x + 4.7, .13, Z + 7.2), true);
  round(x + 3.1, Z + 7.1, .25, 0, .5); solidAt(x + 4.7, 0, Z + 7.2, 0, 0, .13, 0, 1.1, .26, 1.1);
}

export { swingSet, slide, roundabout, springRider, beachBall, swimRing, ringParts, foamCube, foamWedge, foamCylinder, foamArch, pitBall, laneRope, gardenChair, cost, yard };
