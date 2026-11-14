// Kit: structure (car-park pillars, wheel stops, kerbs, speed bumps, bay paint, columns, piers, steps, bollards, skirting, beams).
// Materials: js/tex/mineral.js. Convention, the yard and the inventory: docs/props.md.
// concreteWall's set is two 1.2 m panels across u: 0-1.2 cast in place (form ties every 60 cm, pour lifts), 1.2-2.4 a precast face. roadPaint's set
// is four regions across u: a 10 cm line on asphalt (0-.12), paint on asphalt (.12-.5), a 10 cm line on concrete (.5-.62), paint on concrete
// with tyre scuffs in the bottom 60 cm of v (.62-1). Objects here map their own UVs (metres) into the region they need.
import * as THREE from 'three';
import { M } from '../mat.js';
import { add, put, spot, solidAt, round } from '../build.js';

const PI = Math.PI;

// A closed polygon [[x, y, r]] with each corner rounded to radius r in n steps; r 0 leaves it sharp (only where nobody sees it).
function fillet(pts, n = 3) {
  const out = [], N = pts.length;
  for (let i = 0; i < N; i++) {
    const [px, py, r = 0] = pts[i], a = pts[(i + N - 1) % N], b = pts[(i + 1) % N];
    if (!r) { out.push([px, py, -1]); continue; }
    let ux = a[0] - px, uy = a[1] - py, vx = b[0] - px, vy = b[1] - py; const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy); ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    const ang = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))), d = r / Math.sin(ang / 2);
    let bx = ux + vx, by = uy + vy; const lb = Math.hypot(bx, by); bx /= lb; by /= lb;
    const cx = px + bx * d, cy = py + by * d, t = r / Math.tan(ang / 2);
    const a0 = Math.atan2(py + uy * t - cy, px + ux * t - cx); let da = Math.atan2(py + vy * t - cy, px + vx * t - cx) - a0;
    while (da > PI) da -= 2 * PI; while (da < -PI) da += 2 * PI;
    for (let k = 0; k <= n; k++) out.push([cx + r * Math.cos(a0 + da * k / n), cy + r * Math.sin(a0 + da * k / n)]);
  }
  return out;
}

// A closed CCW profile [[x, y]] (x right, y up) extruded along z over -L/2..L/2 with smooth normals from the profile; ends rounded to radius e
// (0: flat). UVs in metres: v = z + o.v; u runs round the profile from o.u (times o.ku), or with o.plan centred on each face (plan + ku * s).
// o.caps [front, back]: close the ends (default both). o.shape(x, y, z) -> scale of y at that z (for a kerb's drop), normals follow it.
function bar(prof, L, o = {}) {
  const N = prof.length, e = o.e ?? 0, m = e ? (o.es ?? 3) : 0, ku = o.ku ?? 1, en = [], vn = [], U = [], pos = [], nor = [], uv = [];
  for (let i = 0; i < N; i++) { const a = prof[i], b = prof[(i + 1) % N], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); en.push([dy / l, -dx / l, l]); }
  for (let i = 0; i < N; i++) { const p = en[(i + N - 1) % N], q = en[i], x = p[0] + q[0], y = p[1] + q[1], l = Math.hypot(x, y); vn.push([x / l, y / l]); }
  let run = o.u ?? 0;
  for (let i = 0; i < N; i++) {
    const a = prof[i], b = prof[(i + 1) % N], [ex, ey, l] = en[i];
    if (o.plan !== undefined) { const f = Math.abs(ex) > Math.abs(ey) ? p => (ex > 0 ? p[1] : -p[1]) : p => (ey > 0 ? -p[0] : p[0]); U.push([o.plan + ku * f(a), o.plan + ku * f(b)]); }
    else { U.push([run, run + l * ku]); run += l * ku; }
  }
  const rings = [];
  for (let k = 0; k <= m; k++) { const t = PI / 2 * (1 - k / m || 0); rings.push([-L / 2 + e * (1 - Math.sin(t)), e * (1 - Math.cos(t)), Math.cos(t), -Math.sin(t)]); }
  for (let k = m; k >= 0; k--) { const t = PI / 2 * (1 - k / m || 0); rings.push([L / 2 - e * (1 - Math.sin(t)), e * (1 - Math.cos(t)), Math.cos(t), Math.sin(t)]); }
  if (!m) { rings[0] = [-L / 2, 0, 1, 0]; rings[1] = [L / 2, 0, 1, 0]; }
  const S = o.shape, dz = 1e-3;
  const P = (x, y, z, nx, ny, nz) => { // the drop: y above 0 scaled by s(z); normals by the inverse transpose
    if (S && y > 0) { const s = S(z), sd = (S(z + dz) - S(z - dz)) / (2 * dz), n0 = ny; ny = n0 / s; nz -= y * sd * n0 / s; y *= s; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; }
    pos.push(x, y, z); nor.push(nx, ny, nz);
  };
  const V = (i, s, r) => { const p = prof[i % N], v = vn[i % N], [z, ins, c, sn] = rings[r], n = p[2] < 0 ? en[s] : v; return [p[0] - v[0] * ins, p[1] - v[1] * ins, z, n[0] * c, n[1] * c, sn]; };
  for (let s = 0; s < N; s++) for (let r = 0; r + 1 < rings.length; r++) {
    const q = [V(s, s, r), V(s + 1, s, r), V(s + 1, s, r + 1), V(s, s, r + 1)], [u0, u1] = U[s], us = [u0, u1, u1, u0];
    for (const k of [0, 1, 2, 0, 2, 3]) { P(...q[k]); uv.push(us[k], q[k][2] + (o.v ?? 0)); }
  }
  const caps = o.caps ?? [true, true];
  for (const [r, sz, on] of [[0, -1, caps[0]], [rings.length - 1, 1, caps[1]]]) {
    if (!on) continue;
    const [z, ins] = rings[r], ct = prof.map((p, i) => new THREE.Vector2(p[0] - vn[i][0] * ins, p[1] - vn[i][1] * ins));
    for (const t of THREE.ShapeUtils.triangulateShape(ct, [])) {
      let [i, j, k] = t; const A = ct[i], B = ct[j], C = ct[k];
      if (((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) * sz < 0) [j, k] = [k, j];
      for (const q of [i, j, k]) { P(ct[q].x, ct[q].y, z, 0, 0, sz); uv.push(ct[q].x + (o.cu ?? 0), ct[q].y + (o.cv ?? 0)); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Flat 2D polygons (any shape) laid on a plane: map(s, t) -> [x, y, z, u, v], all facing n. Decals, stencils, stripes.
function sheet(polys, map, n) {
  const pos = [], nor = [], uv = [];
  for (const pl of polys) {
    const ct = pl.map(p => new THREE.Vector2(p[0], p[1]));
    for (const tri of THREE.ShapeUtils.triangulateShape(ct, [])) {
      const w = tri.map(i => map(pl[i][0], pl[i][1])), a = w[0], b = w[1], c = w[2];
      const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const ws = cx * n[0] + cy * n[1] + cz * n[2] < 0 ? [a, c, b] : w;
      for (const q of ws) { pos.push(q[0], q[1], q[2]); nor.push(...n); uv.push(q[3], q[4]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// A convex polygon clipped to the box [x1, x2] x [y1, y2] (Sutherland-Hodgman).
function clip(pl, x1, y1, x2, y2) {
  for (const [ax, lim, keep] of [[0, x1, 1], [0, x2, -1], [1, y1, 1], [1, y2, -1]]) {
    const out = [];
    for (let i = 0; i < pl.length; i++) {
      const a = pl[i], b = pl[(i + 1) % pl.length], da = (a[ax] - lim) * keep, db = (b[ax] - lim) * keep;
      if (da >= 0) out.push(a);
      if (da * db < 0) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    pl = out; if (pl.length < 3) return null;
  }
  return pl;
}

// Stencil digits: centreline strokes in a 0.6 x 1 em box, broken where a stencil's bridges hold the card together.
const arc = (cx, cy, rx, ry, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, k) => { const a = (a0 + (a1 - a0) * k / n) * PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const six = [arc(.33, .5, .27, .44, 72, 182, 10), arc(.3, .3, .24, .26, 198, 512, 22)];
const DIGITS = {
  0: [arc(.3, .5, .23, .43, 101, 259), arc(.3, .5, .23, .43, -79, 79)],
  1: [[[.34, 0], [.34, 1]], [[.1, .76], [.25, .9]]],
  2: [arc(.3, .72, .23, .23, 165, -38, 12).concat([[.07, .2]]), [[.05, .065], [.58, .065]]],
  3: [arc(.3, .75, .21, .21, 150, -80), arc(.3, .28, .25, .26, 75, -150)],
  4: [[[.4, .98], [.04, .32], [.6, .32]], [[.47, .84], [.47, 0]]],
  5: [[[.56, .935], [.13, .935], [.11, .58]], arc(.3, .32, .26, .3, 118, -160)],
  6: six, 9: six.map(s => s.map(([x, y]) => [.6 - x, 1 - y])),
  7: [[[.03, .935], [.57, .935]], [[.52, .82], [.2, 0]]],
  8: [arc(.3, .76, .2, .2, 110, 430), arc(.3, .27, .25, .26, -70, 250)],
};
function strokes(text, em, w) { // the quads of a number's strokes, in (s, t) metres, centred on 0, baseline at t 0
  const adv = .78 * em, polys = [], x0 = -(text.length * adv - .18 * em) / 2;
  [...text].forEach((ch, i) => { for (const line of DIGITS[ch] ?? []) for (let k = 0; k + 1 < line.length; k++) {
    const [ax, ay] = line[k], [bx, by] = line[k + 1], dx = (bx - ax) * em, dy = (by - ay) * em, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
    const A = [x0 + i * adv + ax * em, ay * em], B = [A[0] + dx, A[1] + dy];
    polys.push([[A[0] + nx, A[1] + ny], [A[0] - nx, A[1] - ny], [B[0] - nx, B[1] - ny], [B[0] + nx, B[1] + ny]]);
  } });
  return polys;
}

// A hex bolt with its washer, head out along +y: the head faceted, the washer and thread end turned.
function bolt(af = .017) {
  const r = af / Math.sqrt(3), wr = af * .72, lathe = (pts, n) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), n);
  const head = lathe([[0, .002], [r * .98, .002], [r, .0025], [r, .0068], [r * .86, .0082], [0, .0082]], 6).toNonIndexed(); head.computeVertexNormals();
  const washer = lathe([[af * .3, 0], [wr, 0], [wr + .0004, .0005], [wr + .0004, .0016], [wr, .002], [af * .3, .002]], 20).toNonIndexed();
  const end = lathe([[af * .29, .008], [af * .29, .0105], [af * .2, .0118], [0, .012]], 10).toNonIndexed();
  for (const g of [head, washer, end]) g.deleteAttribute('uv');
  const pos = [], nor = [];
  for (const g of [head, washer, end]) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  return g;
}

// A parking-level pillar: a cast-in-place column, square with 25 mm chamfers (o.w 0.5 m, o.h 2.3 m), tie holes up its faces (the set's
// first panel, centred on each face), a painted warning band (o.band m, yellow with black hazard stripes, tyre scuffs low down), a stencilled
// bay number on two faces (o.num, black on a yellow patch) and galvanised steel corner guards bolted to the corners facing traffic (o.guard,
// corner indices 0-3 counter-clockwise from the back right, 2 and 3 the front ones (default); [] for none).
function pillar(z, x, y, zc, ry = 0, o = {}) {
  const w = o.w ?? .5, h = o.h ?? 2.3, c = .025, hw = w / 2, bh = o.band ?? 1;
  const C = M(z, 'concreteWall', { color: o.color ?? 0xe8e2d8, wear: .5 }), Yp = M(z, 'roadPaint', { color: o.paint ?? 0xe6ac18, wear: .5, edgeCol: [.6, .58, .54] });
  const Bk = M(z, 'roadPaint', { color: 0x1d1c1a }), G = M(z, 'galvanised');
  const oct = (d, r) => { const H = hw + d, k = hw - c + d * (Math.SQRT2 - 1); return fillet([[H, -k, r], [H, k, r], [k, H, r], [-k, H, r], [-H, k, r], [-H, -k, r], [-k, -H, r], [k, -H, r]]); };
  const up = (g, yy) => put(g.rotateX(-PI / 2).translate(0, yy, 0), x, y, zc, ry);
  add(C, up(bar(oct(0, .005), h, { plan: .6, v: h / 2 + .3, caps: [false, true] }), h / 2), true);
  add(Yp, up(bar(oct(.0015, .005), bh, { plan: .81, ku: .72, v: bh / 2, caps: [false, false] }), bh / 2), true);
  const fk = hw - c - .004, faces = [0, 1, 2, 3], face = (a, d) => (s, t) => { // face a (normal at a * 90 degrees in plan), d metres out
    const ca = Math.cos(a * PI / 2), sa = Math.sin(a * PI / 2), px = (hw + d) * ca - s * sa, py = (hw + d) * sa + s * ca; return [px, t, -py, .81 + .72 * s, t];
  };
  const fn = a => [Math.cos(a * PI / 2), 0, -Math.sin(a * PI / 2)];
  for (const a of faces) { // hazard stripes: 100 mm bands at 45 degrees, 100 mm apart
    const polys = [];
    for (let k = -8; k < 8; k++) { const c0 = k * .2828; const pl = clip([[c0 - 2, -2], [c0 + .1414 - 2, -2], [c0 + .1414 + 2, 2], [c0 + 2, 2]], -fk, .0, fk, bh); if (pl) polys.push(pl); }
    add(Bk, put(sheet(polys, face(a, .003), fn(a)), x, y, zc, ry), true);
  }
  const num = String(o.num ?? '14'), em = .2, py0 = bh + .3;
  for (const a of o.numFaces ?? [0, 3]) {
    const pw = Math.min(2 * fk, num.length * .78 * em + .1), f = face(a, .0025), g = (s, t) => { const p = f(s, t); p[4] = t + .5; return p; }; // v + .5: clear of the scuffs
    add(Yp, put(sheet([[[-pw / 2, py0 - .06], [pw / 2, py0 - .06], [pw / 2, py0 + em + .06], [-pw / 2, py0 + em + .06]]], g, fn(a)), x, y, zc, ry), true);
    const f2 = face(a, .004);
    add(Bk, put(sheet(strokes(num, em, .028).map(pl => pl.map(([s, t]) => [s, t + py0])), (s, t) => { const p = f2(s, t); p[4] = t + .5; return p; }, fn(a)), x, y, zc, ry), true);
  }
  const gh = o.guardH ?? 1.2, t = .005, L = .075, b1 = bolt();
  for (const k of o.guard ?? [2, 3]) { // a 75 x 75 x 5 mm angle, rolled corner, up the corner from the floor
    const ang = fillet([[hw, hw - L, .0015], [hw + t, hw - L, .0015], [hw + t, hw + t, .007], [hw - L, hw + t, .0015], [hw - L, hw, .0015], [hw, hw, .002]], 3);
    const rot = k * PI / 2, cs = Math.cos(rot), sn = Math.sin(rot), pr = ang.map(([px, py, f]) => [px * cs - py * sn, px * sn + py * cs, f]);
    add(G, up(bar(pr, gh, { e: .0015, es: 2, u: 0, v: 0 }), gh / 2 + .001), true);
    for (const [fa, side] of [[k, 1], [k + 1, -1]]) for (const hy of [.22, gh - .2]) { // two anchors per leg, through the leg into the concrete
      const ca = Math.cos(fa * PI / 2), sa = Math.sin(fa * PI / 2), s = side * (hw - .04), px = (hw + t) * ca - s * sa, py = (hw + t) * sa + s * ca;
      add(G, put(b1.clone().rotateZ(-PI / 2).rotateY(fa * PI / 2).translate(px, hy, -py), x, y, zc, ry), true);
    }
  }
  solidAt(x, y, zc, ry, 0, h / 2, 0, w + .012, h, w + .012);
}

// A downstand beam under the soffit between two points [[x, y, z], [x, y, z]] (y: the soffit it hangs from): o.w 0.4 m wide, o.d 0.3 m deep,
// 20 mm drip chamfers on its bottom edges. The precast panel of concreteWall, across the profile; its panel joints fall across the beam every 2.4 m.
function beam(z, [[x1, y1, z1], [x2, , z2]], o = {}) {
  const b = (o.w ?? .4) / 2, d = o.d ?? .3, ch = .02, L = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(x2 - x1, z2 - z1), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  const C = M(z, 'concreteWall', { color: o.color ?? 0xe8e2d8, wear: .5 });
  const prof = fillet([[b, d + .005, 0], [-b, d + .005, 0], [-b, ch, .004], [-b + ch, 0, .004], [b - ch, 0, .004], [b, ch, .004]]);
  add(C, put(bar(prof, L, { u: 1.25 - 2 * b, v: o.v ?? .4, caps: [false, false] }), mx, y1 - d, mz, a), true);
  solidAt(mx, y1 - d, mz, a, 0, d / 2, 0, 2 * b, d, L);
}

// A precast concrete wheel stop: 1.65 m long along its own x, 15 cm deep, 10 cm tall, its top chamfered and every edge rounded, the ends
// rounded off, pinned by two galvanised spikes through cast holes (their washered heads on top). The precast panel of concreteWall.
function wheelStop(z, x, y, zc, ry = 0, o = {}) {
  const C = M(z, 'concreteWall', { color: o.color ?? 0xd8d2c8, wear: .6 }), S = M(z, 'galvanised'), l = o.length ?? 1.65;
  const prof = fillet([[-.075, 0, 0], [.075, 0, 0], [.075, .056, .008], [.034, .1, .014], [-.034, .1, .014], [-.075, .056, .008]], 4);
  add(C, put(bar(prof, l, { e: .014, es: 3, u: 1.3, v: 1.2 }).rotateY(PI / 2), x, y, zc, ry), true);
  const lathe = (pts, n) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), n);
  for (const k of [-.36, .36]) { // a 40 mm washer plate and the spike's domed head
    add(S, put(lathe([[0, .1], [.02, .1], [.0205, .1015], [.02, .103], [.011, .103], [.0105, .107], [.007, .1102], [0, .1108]], 20).translate(k * l, 0, 0), x, y, zc, ry), true);
  }
  solidAt(x, y, zc, ry, 0, .05, 0, l, .1, .15);
}

// Painted bay lines: a 10 cm sprayed line from point to point ([[x, y, z], [x, y, z]], o.on 'asphalt' or 'concrete'), its ragged edges baked
// into roadPaint's line regions, 1.5 mm proud of the floor.
function bayLine(z, [[x1, y1, z1], [x2, , z2]], o = {}) {
  const P = M(z, 'roadPaint', { color: o.color ?? 0xd2cec2 }), L = Math.hypot(x2 - x1, z2 - z1), dx = (x2 - x1) / L, dz = (z2 - z1) / L, u0 = o.on === 'asphalt' ? .06 : .56, v0 = o.v ?? (x1 * .37 + z1 * .61);
  add(P, sheet([[[-.06, 0], [.06, 0], [.06, L], [-.06, L]]], (s, t) => [x1 + dx * t - dz * s, y1 + .0015, z1 + dz * t + dx * s, u0 + s, v0 + t], [0, 1, 0]), true);
}

// A painted direction arrow on a concrete floor (1.25 m long, pointing along its own -z, toward ry's front), in roadPaint's concrete fill.
function arrow(z, x, y, zc, ry = 0, o = {}) {
  const P = M(z, 'roadPaint', { color: o.color ?? 0xd2cec2 }), k = o.size ?? 1;
  const pl = [[-.075, 0], [.075, 0], [.075, .75], [.225, .72], [0, 1.25], [-.225, .72], [-.075, .75]].map(([s, t]) => [s * k, t * k]);
  add(P, put(sheet([pl], (s, t) => [s, .0015, .625 * k - t, .81 + .72 * s, t + .55], [0, 1, 0]), x, y, zc, ry), true);
}

// A precast half-battered kerb run along points ([[x, y, z], ...]): 125 mm wide, 125 mm upstand, units 915 mm long on 4 mm mortar joints,
// the road on its own -x side (left of the direction of the run). o.drop [from, to] (metres along the run): a dropped crossing at 25 mm,
// with a transition unit each side.
function kerb(z, pts, o = {}) {
  const C = M(z, 'concreteWall', { color: o.color ?? 0xd4cec4, wear: .35 }), U = .915, J = .004;
  const prof = fillet([[0, -.13, 0], [.125, -.13, 0], [.125, .125, .004], [.05, .125, .012], [0, .075, .01]], 6);
  let at = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1, z1] = pts[i], [x2, , z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1), dx = (x2 - x1) / L, dz = (z2 - z1) / L, a = Math.atan2(dx, dz);
    const n = Math.max(1, Math.round(L / U)), ul = L / n;
    for (let k = 0; k < n; k++, at += ul) {
      const hAt = s => { const [d1, d2] = o.drop ?? [-9, -9]; const f = s < d1 ? 1 - (s - (d1 - ul)) / ul : s > d2 ? (s - d2) / ul : 0; return .2 + .8 * Math.min(1, Math.max(0, f)); };
      const s0 = at, h0 = hAt(s0), h1 = hAt(s0 + ul), cx = x1 + dx * (k + .5) * ul, cz = z1 + dz * (k + .5) * ul;
      add(C, put(bar(prof, ul - J, { e: .004, es: 2, u: 1.25, v: .3 + (k % 2) * .9, caps: [true, true], shape: zz => h0 + (h1 - h0) * (zz / (ul - J) + .5) }), cx, y1, cz, a), true);
      solidAt(cx, y1, cz, a, .0625, .0625 * Math.max(h0, h1), 0, .125, .125 * Math.max(h0, h1), ul);
    }
  }
}

// A precast concrete bollard: 300 mm across at the foot, 900 mm tall, a cast groove under its domed head, set 50 mm into the ground.
function bollard(z, x, y, zc, ry = 0, o = {}) {
  const C = M(z, 'concreteWall', { color: o.color ?? 0xdcd6cc, wear: .7 }), h = o.h ?? .9;
  const pr = [[.0, -.05], [.15, -.05], [.15, 0], [.149, .2], [.146, .5], [.143, h - .2]];
  for (const [r, yy] of [[.142, h - .17], [.139, h - .165], [.134, h - .16], [.134, h - .135], [.139, h - .13], [.142, h - .125], [.142, h - .11]]) pr.push([r, yy]); // the groove
  for (let k = 1; k <= 12; k++) { const a = k / 12 * PI / 2; pr.push([.142 * Math.cos(a) * (k === 12 ? 0 : 1), h - .11 + .11 * Math.sin(a)]); } // the dome
  const g = new THREE.LatheGeometry(pr.map(([r, yy]) => new THREE.Vector2(r, yy)), 48), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 1.25 + uv.getX(i) * .9, p.getY(i) + .3 + Math.hypot(p.getX(i), p.getZ(i)) * (p.getY(i) > h - .11 ? 1 : 0));
  add(C, put(g, x, y, zc, ry), true);
  round(...spot(x, zc, ry, 0, 0), .15, y, y + h);
}

// A bolted rubber speed bump across a lane, between two points ([[x, y, z], [x, y, z]]): 500 mm modules 430 mm deep and 50 mm tall,
// black and yellow in turn, rounded end caps, two galvanised bolts down through each module.
function speedBump(z, [[x1, y1, z1], [x2, , z2]], o = {}) {
  const Bk = M(z, 'rubber', { color: 0x1a1a1a }), Ye = M(z, 'hardPlastic', { color: 0xf0b21a, roughness: .6 }), S = M(z, 'galvanised');
  const L = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(x2 - x1, z2 - z1), dx = (x2 - x1) / L, dz = (z2 - z1) / L, n = Math.max(1, Math.round(L / .5)), ml = L / n;
  const prof = [[-.215, 0, -1]]; for (let k = 0; k <= 16; k++) { const s = -.205 + .41 * k / 16; prof.push([s, .05 * Math.pow(Math.max(0, 1 - Math.pow(s / .215, 2)), .55) + .002]); } prof.push([.215, 0, -1]);
  prof.reverse(); // CCW: x right along the depth, y up
    const cap = new THREE.LatheGeometry(prof.filter(p => p[0] >= 0).map(([s, t]) => new THREE.Vector2(s, t)).sort((p, q) => p.y - q.y), 16, 0, PI);
  const b1 = bolt(.019);
  for (let k = 0; k < n; k++) {
    const cx = x1 + dx * (k + .5) * ml, cz = z1 + dz * (k + .5) * ml;
    add(k % 2 ? Ye : Bk, put(bar(prof, ml - .006, { e: .004, es: 2, u: k * .7, v: 0 }).rotateY(PI / 2), cx, y1, cz, a - PI / 2), true);
    for (const s of [-.15, .15]) { const [bx, bz] = spot(cx, cz, a, 0, s * ml); add(S, b1.clone().scale(1, .5, 1).translate(bx, y1 + .048, bz), true); }
  }
  for (const [e, r] of [[0, PI], [L, 0]]) add(Bk, put(cap.clone().rotateY(r - PI / 2), x1 + dx * e, y1, z1 + dz * e, a), true);
  solidAt((x1 + x2) / 2, y1, (z1 + z2) / 2, a, 0, .025, 0, .3, .05, L);
}

// A run of cast concrete steps (o.n 4, rise o.r 0.16, going o.g 0.28, o.w 1.4 m wide), rising toward its own -z from the origin at the
// middle of the flight's plan; an anodised aluminium nosing on every tread with a black grip insert. One sawtooth profile, so the sides
// show the flight's section. Each step registers its own solid.
function steps(z, x, y, zc, ry = 0, o = {}) {
  const n = o.n ?? 4, r = o.r ?? .16, g = o.g ?? .28, W = o.w ?? 1.4, D = n * g, cx = D / 2, cy = n * r / 2;
  const C = M(z, 'concreteWall', { color: o.color ?? 0xdcd6cc, wear: .4 }), A = M(z, 'anodised', { color: 0xb8b4ac }), R = M(z, 'rubber', { color: 0x1c1c1c });
  const pts = [[0, 0, 0], [D, 0, 0], [D, n * r, 0]];
  for (let i = n - 1; i >= 0; i--) { pts.push([i * g, (i + 1) * r, .004]); if (i) pts.push([i * g, i * r, .003]); }
  const prof = fillet(pts.map(([a, b, f]) => [a - cx, b - cy, f]), 3), own = gm => gm.rotateY(PI / 2).translate(0, cy, 0);
  add(C, put(own(bar(prof, W, { plan: 1.8, v: .3 })), x, y, zc, ry), true);
  const t = .003, nose = fillet([[-t, -.03, .001], [0, -.03, .001], [0, 0, .001], [.05, 0, .001], [.05, t, .001], [-t, t, .004]], 2);
  const grip = fillet([[.012, t, 0], [.042, t, 0], [.042, t + .0016, .0007], [.012, t + .0016, .0007]], 2);
  for (let i = 0; i < n; i++) {
    const sh = ([a, b, f]) => [a + i * g - cx, b + (i + 1) * r - cy, f];
    add(A, put(own(bar(nose.map(sh), W - .1, { e: .002, es: 2 })), x, y, zc, ry), true);
    add(R, put(own(bar(grip.map(sh), W - .14, { e: .0008, es: 1 })), x, y, zc, ry), true);
    solidAt(x, y, zc, ry, 0, (i + 1) * r / 2, -((i * g + D) / 2 - cx), W, (i + 1) * r, D - i * g);
  }
}

// A painted moulded skirting along a wall, between points ([[x, y, z], ...]): 100 mm tall, 18 mm thick, a rounded top. The wall is on
// the run's left; the skirting stands out to its right. Painted: the plaster set (orange-peel paint), tinted by o.color.
function skirting(z, pts, o = {}) {
  const P = M(z, 'plaster', { color: o.color ?? 0xe4ddd0, wear: .5, roughness: .55 });
  const prof = fillet([[0, 0, 0], [.018, 0, .001], [.018, .07, .003], [.015, .088, .01], [.006, .1, .003], [0, .1, 0]], 4);
  let u = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1, z1] = pts[i], [x2, , z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(x2 - x1, z2 - z1), more = i + 2 < pts.length;
    add(P, put(bar(prof, L + (more ? .018 : 0), { v: u, caps: [i === 0, !more] }).translate(0, 0, more ? .009 : 0), (x1 + x2) / 2, y1, (z1 + z2) / 2, a), true);
    u += L;
  }
}

function yard(plot) { // the structure plot in the dev yard (js/zones/yard.js)
  const { zone, x, z } = plot;
  pillar(zone, x + 5, 0, z + 3, 0, { num: '14' });
  beam(zone, [[x + 3.4, 2.6, z + 3], [x + 6.6, 2.6, z + 3]]);
  for (const bx of [x + 6.2, x + 8.7]) bayLine(zone, [[bx, 0, z + 1.2], [bx, 0, z + 6.2]]);
  wheelStop(zone, x + 7.45, 0, z + 1.9);
  arrow(zone, x + 7.45, 0, z + 7.1);
  kerb(zone, [[x + 10, 0, z + .8], [x + 10, 0, z + 7.4]], { drop: [2.4, 3.6] });
  bollard(zone, x + 11.3, 0, z + 2.2); bollard(zone, x + 11.3, 0, z + 4.6);
  speedBump(zone, [[x + 12.1, 0, z + 6.6], [x + 13.6, 0, z + 6.6]]);
  steps(zone, x + 12.6, 0, z + 2.6, 0, { w: 1.6 });
  skirting(zone, [[x + 13.95, 0, z], [x + 3.6, 0, z]]);
}

export { pillar, beam, wheelStop, bayLine, arrow, kerb, bollard, speedBump, steps, skirting, yard };
