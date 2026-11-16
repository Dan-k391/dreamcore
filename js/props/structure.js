// Kit: structure (car-park pillars, wheel stops, kerbs, speed bumps, bay paint, columns, piers, steps, bollards, skirting, beams).
// Materials: js/tex/mineral.js. Convention, the yard and the inventory: docs/props.md.
// concreteWall's set is two 1.2 m panels across u: 0-1.2 cast in place (150 mm vertical formwork boards, form ties every 60 cm, a pour line every
// 1.2 m of v at .15), 1.2-2.4 a precast face (patchy pinholes, weathered aggregate, tyre rubber in u 2.1-2.4). roadPaint's set is four regions
// across u: a 10 cm line on asphalt (0-.12), paint on asphalt (.12-.5), a 10 cm line on concrete (.5-.62), paint on concrete with tyre scuffs in
// the bottom 60 cm of v (.62-1). Objects here map their own UVs (metres) into the region they need, each placement at its own offset (hsh), and
// bake their arris wear as geometry (chop: chips with fresh broken faces) instead of the shader's edge wear, which dashes along fine fillets.
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

const hsh = (x, z, s = 0) => { const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }; // repeatable 0..1 per placement
const nrm = v => { const l = Math.hypot(...v); return v.map(a => a / l); }, dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mk = (pos, nor, uv) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g; };
function cat(gs) { // non-indexed geometries into one
  const pos = [], nor = [], uv = [];
  for (let g of gs) { if (g.index) g = g.toNonIndexed(); const n = g.attributes.position.count, u = g.attributes.uv;
    for (let i = 0; i < n * 3; i++) { pos.push(g.attributes.position.array[i]); nor.push(g.attributes.normal.array[i]); }
    for (let i = 0; i < n * 2; i++) uv.push(u ? u.array[i] : 0); }
  return mk(pos, nor, uv);
}

// Cost, for the kit's report: triangles and materials per object (the last call of each), read with ?dev as `tally` of this module.
const tally = {}; let cur = '';
const put3 = (m, g) => { const t = tally[cur] ??= { calls: 0, tris: 0, mats: new Set() }; t.tris += (g.index ? g.index.count : g.attributes.position.count) / 3; t.mats.add(m.userData.lib + (m.color ? '#' + m.color.getHexString() : '')); add(m, g, true); };
const begin = name => { cur = name; const t = tally[name] ??= { calls: 0, tris: 0, mats: new Set() }; t.calls++; };

// Chips knocked out of a convex solid: each chip a list of planes [nx, ny, nz, d] (unit normals), the part beyond all of them (n.p > d) goes.
// Returns [what is left, the broken faces (flat, UVs in metres about cu, cv)]; caps false for a skin (paint) with nothing behind it.
function chop(g, chips, caps = true, cu = 1.65, cv = 1.2) {
  if (g.index) g = g.toNonIndexed();
  const P = g.attributes.position.array, Nr = g.attributes.normal.array, Uv = g.attributes.uv.array;
  let tris = [];
  for (let j = 0; j < P.length / 3; j += 3) tris.push([0, 1, 2].map(k => { const i = j + k; return [P[3 * i], P[3 * i + 1], P[3 * i + 2], Nr[3 * i], Nr[3 * i + 1], Nr[3 * i + 2], Uv[2 * i], Uv[2 * i + 1]]; }));
  const side = (pl, p) => pl[0] * p[0] + pl[1] * p[1] + pl[2] * p[2] - pl[3], lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const split = (poly, pl) => { const a = [], b = [];
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(pl, p), sq = side(pl, q); (sp <= 0 ? a : b).push(p); if ((sp <= 0) !== (sq <= 0)) { const x = lerp(p, q, sp / (sp - sq)); a.push(x); b.push(x); } }
    return [a, b]; };
  const cap = [];
  for (const ch of chips) {
    const next = [], sec = ch.map(() => []);
    for (const t of tris) {
      ch.forEach((pl, i) => { for (let k = 0; k < 3; k++) { const p = t[k], q = t[(k + 1) % 3], sp = side(pl, p), sq = side(pl, q); if ((sp <= 0) !== (sq <= 0)) sec[i].push(lerp(p, q, sp / (sp - sq))); } });
      if (ch.some(pl => t.every(p => side(pl, p) <= 0))) { next.push(t); continue; }
      let rest = [t];
      for (const pl of ch) { const r2 = []; for (const poly of rest) { const [a, b] = split(poly, pl); for (let k = 1; k + 1 < a.length; k++) next.push([a[0], a[k], a[k + 1]]); if (b.length > 2) r2.push(b); } rest = r2; }
    }
    if (caps) ch.forEach((n, i) => {
      const pts = sec[i]; if (pts.length < 3) return;
      const e1 = nrm(Math.abs(n[1]) < .9 ? [n[2], 0, -n[0]] : [0, -n[2], n[1]]), e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
      const c = [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length), rel = p => [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      let poly = pts.map(p => [p, Math.atan2(dot3(rel(p), e2), dot3(rel(p), e1))]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
      ch.forEach((pj, j) => { if (j !== i && poly.length > 2) poly = split(poly, pj)[1]; });
      for (let k = 1; k + 1 < poly.length; k++) cap.push([poly[0], poly[k], poly[k + 1]].map(p => [p[0], p[1], p[2], n[0], n[1], n[2], cu + dot3(rel(p), e1), cv + dot3(rel(p), e2)]));
    });
    tris = next;
  }
  const out = list => { const pos = [], nor = [], uv = []; for (const t of list) for (const p of t) { pos.push(p[0], p[1], p[2]); nor.push(p[3], p[4], p[5]); uv.push(p[6], p[7]); } return mk(pos, nor, uv); };
  return [out(tris), out(cap)];
}
// A V-shaped chip out of an arris at point p on it: out its outward direction, al along it, dp deep, the facets a radians off out (smaller: longer)
const notch = (p, out, al, dp, a) => [1, -1].map(s => { const n = nrm(out.map((v, i) => v * Math.cos(a) + s * al[i] * Math.sin(a))); return [...n, dot3(n, p) - dp * Math.cos(a)]; });
const corner = (p, n, dp) => { n = nrm(n); return [[...n, dot3(n, p) - dp]]; }; // a corner knocked off: the plane dp inside p
const fresh = (z, name, color) => M(z, name, { color, wear: 0, roughness: .95, macro: 0 }); // broken faces: unweathered, lighter, rough

// A loft through plan rings [[poly, y, sharp]], bottom to top, each poly the same count of [x, z] points; smooth normals, split at a sharp ring.
// UVs in metres: u round the ring (each ring a whole number of o.tile, so the seam meets), v up the profile from o.v. o.caps [bottom, top].
function loft(rings, o = {}) {
  const N = rings[0][0].length, pos = [], uv = [], idx = [], rows = [], tile = o.tile ?? 1.2;
  let v = o.v ?? 0;
  rings.forEach(([pl, y, sharp], r) => {
    if (r) { const [q, y0] = rings[r - 1]; v += Math.hypot(y - y0, Math.hypot(...pl[0]) - Math.hypot(...q[0])); }
    let per = 0; for (let i = 0; i < N; i++) per += Math.hypot(pl[(i + 1) % N][0] - pl[i][0], pl[(i + 1) % N][1] - pl[i][1]);
    const k = Math.max(1, Math.round(per / tile)) * tile / per;
    for (let rep = 0; rep < (sharp && r && r < rings.length - 1 ? 2 : 1); rep++) {
      rows.push([pos.length / 3, rep > 0]); let u = o.u ?? 0;
      for (let i = 0; i <= N; i++) { const p = pl[i % N]; if (i) u += Math.hypot(p[0] - pl[i - 1][0], p[1] - pl[i - 1][1]) * k; pos.push(p[0], y, p[1]); uv.push(u, v); }
    }
  });
  for (let r = 0; r + 1 < rows.length; r++) { if (rows[r + 1][1]) continue; const A = rows[r][0], B = rows[r + 1][0]; for (let i = 0; i < N; i++) idx.push(A + i, A + i + 1, B + i + 1, A + i, B + i + 1, B + i); }
  const t0 = [idx[0], idx[1], idx[2]].map(i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), cr = nrm([0, 1, 2].map(k => { const a = t0[1].map((v, j) => v - t0[0][j]), b = t0[2].map((v, j) => v - t0[0][j]); return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]][k]; }));
  if (cr[0] * t0[0][0] + cr[2] * t0[0][2] < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const nn = g.attributes.normal; for (const [a] of rows) { const s = [0, 1, 2].map(k => nn.array[3 * a + k] + nn.array[3 * (a + N) + k]), l = Math.hypot(...s); for (const b of [a, a + N]) nn.setXYZ(b, s[0] / l, s[1] / l, s[2] / l); }
  const parts = [g];
  (o.caps ?? [false, false]).forEach((on, e) => { if (!on) return; const [pl, y] = rings[e ? rings.length - 1 : 0], sy = e ? 1 : -1, p = [], n = [], u = [];
    for (const t of THREE.ShapeUtils.triangulateShape(pl.map(q => new THREE.Vector2(q[0], q[1])), [])) {
      let [a, b, c] = t; const A = pl[a], B = pl[b], C = pl[c]; if (((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) * sy > 0) [b, c] = [c, b];
      for (const q of [a, b, c]) { p.push(pl[q][0], y, pl[q][1]); n.push(0, sy, 0); u.push(pl[q][0] + (o.cu ?? 0), pl[q][1] + (o.cv ?? 0)); } }
    parts.push(mk(p, n, u)); });
  return cat(parts);
}
const circle = (r, n = 36) => Array.from({ length: n }, (_, i) => [r * Math.cos(i / n * 2 * PI), r * Math.sin(i / n * 2 * PI)]);
const rrect = (hx, hz, r, n = 3) => fillet([[hx, -hz, r], [hx, hz, r], [-hx, hz, r], [-hx, -hz, r]], n).map(p => [p[0], p[1]]);

// A parking-level pillar: a cast-in-place column, square with 25 mm chamfers (o.w 0.5 m, o.h 2.3 m), cast in vertical 150 mm formwork boards
// with form-tie holes (the set's first panel, centred on each face) and a pour line just above the band, its arrises chipped where bumpers
// and trolleys reach (and once higher up); a painted warning band (o.band m, yellow with black hazard stripes, tyre scuffs low down), a stencilled
// bay number on two faces (o.num, black on a yellow patch) and galvanised steel corner guards bolted to the corners facing traffic (o.guard,
// corner indices 0-3 counter-clockwise from the back right, 2 and 3 the front ones (default); [] for none).
function pillar(z, x, y, zc, ry = 0, o = {}) {
  begin('pillar');
  const w = o.w ?? .5, h = o.h ?? 2.3, c = .025, hw = w / 2, bh = o.band ?? 1, R = k => hsh(x, zc, k);
  const C = M(z, 'concreteWall', { color: o.color ?? 0xe8e2d8, wear: 0 }), F = fresh(z, 'concreteWall', 0xf6f0e6);
  const Yp = M(z, 'roadPaint', { color: o.paint ?? 0xe6ac18, wear: 0 }), Bk = M(z, 'roadPaint', { color: 0x1d1c1a }), G = M(z, 'galvanised'), Gs = M(z, 'galvanised', { uv: [4, 4] });
  const oct = (d, r) => { const H = hw + d, k = hw - c + d * (Math.SQRT2 - 1); return fillet([[H, -k, r], [H, k, r], [k, H, r], [-k, H, r], [-H, k, r], [-H, -k, r], [-k, -H, r], [k, -H, r]]); };
  const up = (g, yy) => g.rotateX(-PI / 2).translate(0, yy, 0), set = g => put(g, x, y, zc, ry);
  const guard = o.guard ?? [2, 3], gh = o.guardH ?? 1.2, chips = [];
  let ci = 10;
  for (let k = 0; k < 4; k++) { // corner k at 45 + 90k degrees in plan (profile x, y: own x, -z)
    const th = PI / 4 + k * PI / 2, rr = (2 * hw - c) / Math.SQRT2;
    const hs = guard.includes(k) ? [gh + .15 + R(ci++) * (h - gh - .45)] : [.25 + .3 * R(ci++), .6 + .3 * R(ci++), 1.2 + (h - 1.5) * R(ci++)];
    for (const hy of hs) { const sk = (R(ci++) - .5) * .8; chips.push(notch([Math.cos(th) * rr, hy, -Math.sin(th) * rr], [Math.cos(th + sk), 0, -Math.sin(th + sk)], [0, 1, 0], .007 + .011 * R(ci++), .32 + .4 * R(ci++))); }
  }
  const [shaft, broken] = chop(up(bar(oct(0, .005), h, { plan: .6, v: h / 2 + .3, caps: [false, true] }), h / 2), chips);
  put3(C, set(shaft)); put3(F, set(broken));
  put3(Yp, set(chop(up(bar(oct(.0015, .0065), bh, { plan: .81, ku: .72, v: bh / 2, caps: [false, false] }), bh / 2), chips, false)[0]));
  const fk = hw - c - .004, face = (a, d, vs) => (s, t) => { // face a (normal at a * 90 degrees in plan), d metres out; vs(t) its v
    const ca = Math.cos(a * PI / 2), sa = Math.sin(a * PI / 2), px = (hw + d) * ca - s * sa, py = (hw + d) * sa + s * ca; return [px, t, -py, .81 + .72 * s, vs(t)];
  };
  const fn = a => [Math.cos(a * PI / 2), 0, -Math.sin(a * PI / 2)];
  for (const a of [0, 1, 2, 3]) { // hazard stripes: 100 mm bands at 45 degrees, 100 mm apart, mapped clear of the set's scuffed rows (the yellow carries the scuffs)
    const polys = [];
    for (let k = -8; k < 8; k++) { const c0 = k * .2828; const pl = clip([[c0 - 2, -2], [c0 + .1414 - 2, -2], [c0 + .1414 + 2, 2], [c0 + 2, 2]], -fk, .0, fk, bh); if (pl) polys.push(pl); }
    put3(Bk, set(chop(sheet(polys, face(a, .003, t => .6 + .38 * t / bh), fn(a)), chips, false)[0]));
  }
  const num = String(o.num ?? '14'), em = .2, py0 = bh + .3;
  for (const a of o.numFaces ?? [0, 3]) {
    const pw = Math.min(2 * fk, num.length * .78 * em + .1);
    put3(Yp, set(sheet([[[-pw / 2, py0 - .06], [pw / 2, py0 - .06], [pw / 2, py0 + em + .06], [-pw / 2, py0 + em + .06]]], face(a, .0025, t => t + .5), fn(a))));
    put3(Bk, set(sheet(strokes(num, em, .028).map(pl => pl.map(([s, t]) => [s, t + py0])), face(a, .004, t => t + .5), fn(a))));
  }
  const t = .005, L = .075, b1 = bolt();
  for (const k of guard) { // a 75 x 75 x 5 mm angle, rolled corner, up the corner from the floor; its spangle at a true size
    const ang = fillet([[hw, hw - L, .0015], [hw + t, hw - L, .0015], [hw + t, hw + t, .007], [hw - L, hw + t, .0015], [hw - L, hw, .0015], [hw, hw, .002]], 3);
    const rot = k * PI / 2, cs = Math.cos(rot), sn = Math.sin(rot), pr = ang.map(([px, py, f]) => [px * cs - py * sn, px * sn + py * cs, f]);
    put3(Gs, set(up(bar(pr, gh, { e: .0015, es: 2, u: 0, v: 0 }), gh / 2 + .001)));
    for (const [fa, side] of [[k, 1], [k + 1, -1]]) for (const hy of [.22, gh - .2]) { // two anchors per leg, through the leg into the concrete
      const ca = Math.cos(fa * PI / 2), sa = Math.sin(fa * PI / 2), s = side * (hw - .04), px = (hw + t) * ca - s * sa, py = (hw + t) * sa + s * ca;
      put3(G, set(b1.clone().rotateZ(-PI / 2).rotateY(fa * PI / 2).translate(px, hy, -py)));
    }
  }
  solidAt(x, y, zc, ry, 0, h / 2, 0, w + .012, h, w + .012);
}

// A downstand beam under the soffit between two points [[x, y, z], [x, y, z]] (y: the soffit it hangs from): o.w 0.4 m wide, o.d 0.3 m deep,
// 20 mm drip chamfers on its bottom edges, cast in place: formwork boards along it and a form tie through its sides every 60 cm (the set's
// first panel). o.ends [start, end], each 'wall' (default: a haunch splays down to the wall), 'pillar' (the beam runs on over the column to its
// far face, o.pw 0.5 m, and splays down to the column's near face) or 'none'; o.haunch [length, depth] (.3, .12).
function beam(z, [[x1, y1, z1], [x2, , z2]], o = {}) {
  begin('beam');
  const b = (o.w ?? .4) / 2, d = o.d ?? .3, ch = .02, ends = o.ends ?? ['wall', 'wall'], pw = o.pw ?? .5, [hl, hd] = o.haunch ?? [.3, .12];
  const L0 = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(x2 - x1, z2 - z1), ux = (x2 - x1) / L0, uz = (z2 - z1) / L0;
  const e0 = ends[0] === 'pillar' ? pw / 2 : 0, e1 = ends[1] === 'pillar' ? pw / 2 : 0, L = L0 + e0 + e1, s = (e1 - e0) / 2, mx = (x1 + x2) / 2 + ux * s, mz = (z1 + z2) / 2 + uz * s;
  const C = M(z, 'concreteWall', { color: o.color ?? 0xe8e2d8, wear: 0 });
  const prof = fillet([[b, d + .005, 0], [-b, d + .005, 0], [-b, ch, .004], [-b + ch, 0, .004], [b - ch, 0, .004], [b, ch, .004]]);
  put3(C, put(bar(prof, L, { u: -.165, ku: .857, v: o.v ?? .5 + 1.4 * hsh(x1, z1, 2), caps: [ends[0] !== 'wall', ends[1] !== 'wall'] }), mx, y1 - d, mz, a));
  ends.forEach((e, i) => { // the haunch: a splay under the soffit, its vertical face against the wall or the column (px = -z: rotateY(PI / 2) turns px into -z)
    if (e === 'none' || !hl) return;
    const sg = i ? 1 : -1, zw = sg * (L / 2 - (e === 'pillar' ? pw : 0)), zi = zw - sg * hl;
    let pr = [[-zw, .004, 0], [-zi, .004, 0], [-(zw - sg * .07), -hd, .02], [-zw, -hd, 0]];
    if (sg > 0) pr = pr.reverse(); // counter-clockwise
    put3(C, put(bar(fillet(pr, 3), 2 * b - .003, { e: .006, es: 2, u: .45, v: .3 }).rotateY(PI / 2), mx, y1 - d, mz, a));
  });
  solidAt((x1 + x2) / 2, y1 - d, (z1 + z2) / 2, a, 0, d / 2, 0, 2 * b, d, L0);
}

// A precast concrete wheel stop: 1.65 m long along its own x, 15 cm deep, 10 cm tall, its top chamfered and every edge rounded, the ends
// rounded off, pinned by two galvanised spikes through cast holes (their washered heads on top). The precast panel of concreteWall, each unit
// at its own place in it; tyre rubber on its faces, a corner or an arris knocked off here and there (the broken faces fresh and lighter).
function wheelStop(z, x, y, zc, ry = 0, o = {}) {
  begin('wheelStop');
  const C = M(z, 'concreteWall', { color: o.color ?? 0xd8d2c8, wear: 0 }), F = fresh(z, 'concreteWall', 0xeee8de), S = M(z, 'galvanised'), l = o.length ?? 1.65, R = k => hsh(x, zc, k);
  const prof = fillet([[-.075, 0, 0], [.075, 0, 0], [.075, .056, .008], [.034, .1, .014], [-.034, .1, .014], [-.075, .056, .008]], 4);
  const chips = [];
  for (const [sx, sz, k] of [[1, 1, 1], [1, -1, 2], [-1, 1, 3], [-1, -1, 4]]) if (R(k) > .5) chips.push(corner([sx * (l / 2 - .006), .075, sz * .056], [sx, .7 + .6 * R(k + 10), sz * (.6 + .7 * R(k + 20))], .007 + .01 * R(k + 30)));
  for (let k = 0; k < Math.floor(R(5) * 2.6); k++) { const sz = R(40 + k) > .5 ? 1 : -1; chips.push(notch([(R(50 + k) - .5) * (l - .3), .058, sz * .074], nrm([0, .55, sz]), [1, 0, 0], .005 + .007 * R(60 + k), .3 + .3 * R(70 + k))); }
  const [g, br] = chop(bar(prof, l, { e: .014, es: 3, u: 1.93, v: .85 + .7 * R(6) }).rotateY(PI / 2), chips);
  put3(C, put(g, x, y, zc, ry)); put3(F, put(br, x, y, zc, ry));
  const lathe = (pts, n) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), n);
  for (const k of [-.36, .36]) { // a 40 mm washer plate and the spike's domed head
    put3(S, put(lathe([[0, .1], [.02, .1], [.0205, .1015], [.02, .103], [.011, .103], [.0105, .107], [.007, .1102], [0, .1108]], 20).translate(k * l, 0, 0), x, y, zc, ry));
  }
  solidAt(x, y, zc, ry, 0, .05, 0, l, .1, .15);
}

// Painted bay lines: a 10 cm sprayed line from point to point ([[x, y, z], [x, y, z]], o.on 'asphalt' or 'concrete'), its ragged edges baked
// into roadPaint's line regions, 1.5 mm proud of the floor.
function bayLine(z, [[x1, y1, z1], [x2, , z2]], o = {}) {
  begin('bayLine');
  const P = M(z, 'roadPaint', { color: o.color ?? 0xd2cec2 }), L = Math.hypot(x2 - x1, z2 - z1), dx = (x2 - x1) / L, dz = (z2 - z1) / L, u0 = o.on === 'asphalt' ? .06 : .56, v0 = o.v ?? (x1 * .37 + z1 * .61);
  put3(P, sheet([[[-.06, 0], [.06, 0], [.06, L], [-.06, L]]], (s, t) => [x1 + dx * t - dz * s, y1 + .0015, z1 + dz * t + dx * s, u0 + s, v0 + t], [0, 1, 0]));
}

// A painted direction arrow on a concrete floor (1.25 m long, pointing along its own -z, toward ry's front), in roadPaint's concrete fill.
function arrow(z, x, y, zc, ry = 0, o = {}) {
  begin('arrow');
  const P = M(z, 'roadPaint', { color: o.color ?? 0xd2cec2 }), k = o.size ?? 1;
  const pl = [[-.075, 0], [.075, 0], [.075, .75], [.225, .72], [0, 1.25], [-.225, .72], [-.075, .75]].map(([s, t]) => [s * k, t * k]);
  put3(P, put(sheet([pl], (s, t) => [s, .0015, .625 * k - t, .81 + .72 * s, t + .55], [0, 1, 0]), x, y, zc, ry));
}

// A precast half-battered kerb run along points ([[x, y, z], ...]): 125 mm wide, 125 mm upstand, units 915 mm long on 4 mm mortar joints,
// the road on its own -x side (left of the direction of the run). o.drop [from, to] (metres along the run): a dropped crossing at 25 mm,
// with a transition unit each side. Each unit at its own place in the precast panel, tyre rubber on its road face, a few knocked arrises.
function kerb(z, pts, o = {}) {
  begin('kerb');
  const C = M(z, 'concreteWall', { color: o.color ?? 0xd4cec4, wear: 0 }), F = fresh(z, 'concreteWall', 0xe8e2d8), Mo = M(z, 'concreteWall', { color: 0xa8a196, wear: 0, roughness: .97 }), U = .915, J = .004;
  const prof = fillet([[0, -.13, 0], [.125, -.13, 0], [.125, .125, .004], [.05, .125, .012], [0, .075, .01]], 6);
  const mort = prof.map(([px, py]) => [px + (px < .06 ? .003 : -.003), py > 0 ? py - .003 : py]); // the joint's mortar, struck 3 mm back
  let at = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1, z1] = pts[i], [x2, , z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1), dx = (x2 - x1) / L, dz = (z2 - z1) / L, a = Math.atan2(dx, dz);
    const n = Math.max(1, Math.round(L / U)), ul = L / n;
    for (let k = 0; k < n; k++, at += ul) {
      const hAt = s => { const [d1, d2] = o.drop ?? [-9, -9]; const f = s < d1 ? 1 - (s - (d1 - ul)) / ul : s > d2 ? (s - d2) / ul : 0; return .2 + .8 * Math.min(1, Math.max(0, f)); };
      const s0 = at, h0 = hAt(s0), h1 = hAt(s0 + ul), cx = x1 + dx * (k + .5) * ul, cz = z1 + dz * (k + .5) * ul, R = q => hsh(cx, cz, q), hl = (ul - J) / 2;
      const sh = zz => h0 + (h1 - h0) * (zz / (ul - J) + .5), chips = [];
      for (const sz of [-1, 1]) if (R(sz + 3) > .55) { const zz = sz * (hl - .004), up = R(sz + 7) > .5; // a corner knocked off a unit's end on the road side
        chips.push(corner(up ? [.05, .125 * sh(zz), zz] : [0, .075 * sh(zz), zz], [-(.5 + .6 * R(sz + 9)), up ? 1 : .5, sz * (.6 + .8 * R(sz + 11))], .007 + .01 * R(sz + 13))); }
      if (R(20) > .6) { const zz = (R(21) - .5) * (ul - .25); chips.push(notch([0, .075 * sh(zz), zz], nrm([-1, .55, 0]), [0, 0, 1], .005 + .007 * R(22), .3 + .3 * R(23))); }
      const [g, br] = chop(bar(prof, ul - J, { e: .004, es: 2, u: 1.66, v: hl + .02 + (2.36 - 2 * hl) * R(1), caps: [true, true], shape: sh }), chips);
      put3(C, put(g, cx, y1, cz, a)); put3(F, put(br, cx, y1, cz, a));
      if (k + 1 < n) { const hj = hAt(s0 + ul); put3(Mo, put(bar(mort, J + .002, { u: 1.3, v: .2, shape: () => hj }), cx + dx * ul / 2, y1, cz + dz * ul / 2, a)); }
      solidAt(cx, y1, cz, a, .0625, .0625 * Math.max(h0, h1), 0, .125, .125 * Math.max(h0, h1), ul);
    }
  }
}

// A precast concrete bollard: 300 mm across at the foot, 900 mm tall, a cast groove under its low domed head, set 50 mm into the ground; the
// precast panel at its own place, aggregate showing where it weathered, dirt splashed up its foot. The texture seam faces its own -z.
function bollard(z, x, y, zc, ry = 0, o = {}) {
  begin('bollard');
  const C = M(z, 'concreteWall', { color: o.color ?? 0xdcd6cc, wear: 0, dirt: .9, floor: y }), h = o.h ?? .9, v0 = .1 + 1.2 * hsh(x, zc, 5);
  const pr = [[.0, -.05], [.15, -.05], [.15, 0], [.149, .2], [.146, .5], [.143, h - .19]];
  for (const [r, yy] of [[.142, h - .14], [.139, h - .135], [.134, h - .13], [.134, h - .105], [.139, h - .1], [.142, h - .095], [.142, h - .075]]) pr.push([r, yy]); // the groove
  for (let k = 1; k <= 12; k++) { const a = k / 12 * PI / 2; pr.push([.142 * Math.cos(a) * (k === 12 ? 0 : 1), h - .075 + .075 * Math.sin(a)]); } // the dome, a half ellipse
  const g = new THREE.LatheGeometry(pr.map(([r, yy]) => new THREE.Vector2(r, yy)), 48), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 1.22 + uv.getX(i) * .82, p.getY(i) + v0 + Math.hypot(p.getX(i), p.getZ(i)) * (p.getY(i) > h - .075 ? 1 : 0));
  put3(C, put(g.rotateY(PI), x, y, zc, ry));
  round(...spot(x, zc, ry, 0, 0), .15, y, y + h);
}

// A bolted rubber speed bump across a lane, between two points ([[x, y, z], [x, y, z]]): 500 mm modules 430 mm deep and 50 mm tall, black and
// yellow in turn (matte rubber and matte moulded plastic), chamfered feet, six moulded ribs along the top, rounded end caps (the ribs run round them); two galvanised
// bolts down through each module, each with its washer in a moulded pocket.
function speedBump(z, [[x1, y1, z1], [x2, , z2]], o = {}) {
  begin('speedBump');
  const Bk = M(z, 'rubber', { color: 0x1a1a1a, wear: 0 }), Ye = M(z, 'hardPlastic', { color: 0xe0a820, wear: 0, roughness: .85 }), S = M(z, 'galvanised');
  const L = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(x2 - x1, z2 - z1), dx = (x2 - x1) / L, dz = (z2 - z1) / L, n = Math.max(1, Math.round(L / .5)), ml = L / n;
  const H = s => .05 * Math.pow(Math.max(0, 1 - Math.pow(s / .215, 2)), .55) + .002, ribs = [-.16, -.1, -.04, .04, .1, .16];
  const top = [];
  for (let k = 0; k <= 20; k++) { const s = -.205 + .41 * k / 20; if (ribs.every(r => Math.abs(s - r) > .009)) top.push([s, H(s)]); }
  for (const r of ribs) for (const [ds, dh] of [[-.007, 0], [-.005, .0022], [-.003, .003], [.003, .003], [.005, .0022], [.007, 0]]) top.push([r + ds, H(r + ds) + dh]);
  top.sort((p, q) => q[0] - p[0]); // right to left over the top: the profile runs counter-clockwise from the foot at -x
  const prof = [[-.215, 0, -1], [.215, 0, -1], [.214, .005], ...top, [-.214, .005]];
  const cap = new THREE.LatheGeometry(prof.filter(p => p[0] >= 0 && p[1] > 0 || p[0] === .215).sort((p, q) => q[0] - p[0]).map(([s, t]) => new THREE.Vector2(s, t)), 18, 0, PI);
  const b1 = bolt(.013), boss = new THREE.LatheGeometry([[.034, .0505], [.027, .056], [.02, .0612], [.0115, .0612], [.0095, .059], [.0095, .049]].map(([r, t]) => new THREE.Vector2(r, t)), 18);
  for (let k = 0; k < n; k++) {
    const cx = x1 + dx * (k + .5) * ml, cz = z1 + dz * (k + .5) * ml, m = k % 2 ? Ye : Bk;
    put3(m, put(bar(prof, ml - .006, { e: .004, es: 2, u: k * .7, v: 0 }).rotateY(PI / 2), cx, y1, cz, a - PI / 2));
    for (const s of [-.15, .15]) { const [bx, bz] = spot(cx, cz, a, 0, s * ml); put3(m, boss.clone().translate(bx, y1, bz)); put3(S, b1.clone().scale(1, .5, 1).translate(bx, y1 + .052, bz)); }
  }
  for (const [e, r] of [[.006, PI], [L - .006, 0]]) put3(Bk, put(cap.clone().rotateY(r - PI / 2), x1 + dx * e, y1, z1 + dz * e, a));
  solidAt((x1 + x2) / 2, y1, (z1 + z2) / 2, a, 0, .025, 0, .3, .05, L);
}

// A run of cast concrete steps (o.n 4, rise o.r 0.16, going o.g 0.28, o.w 1.4 m wide), rising toward its own -z from the origin at the
// middle of the flight's plan; on every tread a 50 mm anodised aluminium nosing, fluted, its slot holding a ribbed anti-slip insert (o.insert,
// a warm yellow plastic). One sawtooth profile, so the sides show the flight's section. Each step registers its own solid.
function steps(z, x, y, zc, ry = 0, o = {}) {
  begin('steps');
  const n = o.n ?? 4, r = o.r ?? .16, g = o.g ?? .28, W = o.w ?? 1.4, D = n * g, cx = D / 2, cy = n * r / 2;
  const C = M(z, 'concreteWall', { color: o.color ?? 0xdcd6cc, wear: 0 }), A = M(z, 'anodised', { color: 0xcac6be, wear: 0 }), Rb = M(z, 'hardPlastic', { color: o.insert ?? 0xd8a228, wear: 0, roughness: .8 });
  const c = (o.soffit ?? 0) * g / r; // o.soffit: a hanging flight's waist, its depth (vertical) at both ends; the underside runs parallel to the pitch from c
  const pts = o.soffit ? [[0, 0, 0], [c, 0, 0], [D, (D - c) * r / g, 0], [D, n * r, 0]] : [[0, 0, 0], [D, 0, 0], [D, n * r, 0]];
  for (let i = n - 1; i >= 0; i--) { pts.push([i * g, (i + 1) * r, .004]); if (i) pts.push([i * g, i * r, .003]); }
  const prof = fillet(pts.map(([a, b, f]) => [a - cx, b - cy, f]), 3), own = gm => gm.rotateY(PI / 2).translate(0, cy, 0);
  put3(C, put(own(bar(prof, W, { plan: 1.64, ku: .75, v: .3 + 1.2 * hsh(x, zc, 3) })), x, y, zc, ry));
  const t = .003, nose = fillet([[-t, -.03, .001], [0, -.03, .001], [0, 0, .001], [.05, 0, .001], [.05, t, .001], [.046, t, 0], [.0455, t - .0008, 0], [.044, t - .0008, 0], [.0435, t, 0],
    [.008, t, 0], [.0075, t - .0008, 0], [.006, t - .0008, 0], [.0055, t, 0], [-t, t, .004]], 2); // two flutes outside the insert's slot
  const grip = [[.011, t - .0005], [.041, t - .0005]];
  for (let k = 0; k < 5; k++) { const s = .041 - k * .006; grip.push([s, t + .0012], [s - .0012, t + .0022], [s - .0038, t + .0022], [s - .005, t + .0012]); } // five ribs
  grip.push([.011, t + .0012]);
  for (let i = 0; i < n; i++) {
    const sh = ([a, b, f]) => [a + i * g - cx, b + (i + 1) * r - cy, f];
    put3(A, put(own(bar(nose.map(sh), W - .1, { e: .002, es: 2 })), x, y, zc, ry));
    put3(Rb, put(own(bar(grip.map(sh), W - .14, { e: .0008, es: 1, ku: 3 })), x, y, zc, ry));
    solidAt(x, y, zc, ry, 0, (i + 1) * r / 2, -((i * g + D) / 2 - cx), W, (i + 1) * r, D - i * g);
  }
}

// A painted moulded skirting along a wall, between points ([[x, y, z], ...]): 100 mm tall, 18 mm thick, a rounded top, in semi-gloss paint
// (o.color) with a bead of caulk along the wall above it and floor grime on its foot. The wall is on the run's left; the skirting stands
// out to its right.
function skirting(z, pts, o = {}) {
  begin('skirting');
  const P = M(z, 'gelcoat', { color: o.color ?? 0xe4ddd0, wear: 0, roughness: .32, macro: .05, dirt: .8, dirtCol: [.6, .55, .48], floor: pts[0][1] }), K = M(z, 'gelcoat', { color: 0xf0ece4, wear: 0, roughness: .5, macro: 0 });
  const prof = fillet([[0, 0, 0], [.018, 0, .001], [.018, .07, .003], [.015, .088, .01], [.006, .1, .003], [0, .1, 0]], 4);
  const bead = [[0, .0995]]; for (let k = 0; k <= 4; k++) { const an = (270 - 90 * k / 4) * PI / 180; bead.push([.0045 + .0045 * Math.cos(an), .104 + .0045 * Math.sin(an)]); }
  let u = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1, z1] = pts[i], [x2, , z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(x2 - x1, z2 - z1), more = i + 2 < pts.length;
    put3(P, put(bar(prof, L + (more ? .018 : 0), { v: u, caps: [i === 0, !more] }).translate(0, 0, more ? .009 : 0), (x1 + x2) / 2, y1, (z1 + z2) / 2, a));
    put3(K, put(bar(bead, L, { v: u }), (x1 + x2) / 2, y1, (z1 + z2) / 2, a));
    u += L;
  }
}

// A round column (o.h 3 m to the top of its abacus, the shaft o.r 0.2 m at the foot, diminishing by a seventh above its lower third) of dressed
// stone (o.mat, default limestone; o.color): a square plinth, a base of torus, scotia and a smaller torus flaring into the shaft, the shaft in
// drums on fine joints about a metre apart, and a capital of astragal, necking, ovolo and square abacus. A corner or two of the plinth knocked.
// Solid: the plinth a step you can stand on, the shaft a post.
function column(z, x, y, zc, ry = 0, o = {}) {
  begin('column');
  const h = o.h ?? 3, r = o.r ?? .2, name = o.mat ?? 'limestone', S = M(z, name, { color: o.color ?? 0xece6da, wear: 0, floor: y }), F = fresh(z, name, 0xfaf6ee), Rn = k => hsh(x, zc, k + 30);
  const ph = .12, pw = r * 1.5, b0 = ph, rt = r * (1 - 1 / 7), ys0 = b0 + .25, ys1 = h - .3, rg = [], C = (rr, yy, sh) => rg.push([circle(rr, 36), yy, sh]);
  const arcPts = (cx, cy, rad, a0, a1, n, inward = 1) => { for (let k = 0; k <= n; k++) { const t = (a0 + (a1 - a0) * k / n) * PI / 180; C(cx + inward * rad * Math.cos(t), cy + rad * Math.sin(t)); } };
  arcPts(r * 1.22, b0 + .045, .045, -90, 90, 6);                  // lower torus
  C(r * 1.16, b0 + .09, 1); C(r * 1.16, b0 + .1, 1);             // fillet
  arcPts(r * 1.16, b0 + .125, .025, -90, 90, 4, -1);             // scotia
  C(r * 1.12, b0 + .15, 1); C(r * 1.12, b0 + .155, 1);           // fillet
  arcPts(r * 1.08, b0 + .177, .022, -90, 90, 4);                  // upper torus
  for (let k = 1; k <= 4; k++) { const t = k / 4; C(r + .05 * (1 - t) ** 2, b0 + .2 + .05 * t); } // apophyge into the shaft
  const rs = yy => { const t = (yy - ys0) / (ys1 - ys0); return r - (r - rt) * Math.pow(Math.max(0, (t - .33) / .67), 1.4); };
  const nj = Math.max(1, Math.round((ys1 - ys0) / 1.05)), ys = [];
  for (let k = 1; k <= 8; k++) ys.push([ys0 + (ys1 - ys0) * k / 8, 0]);
  for (let k = 1; k < nj; k++) { const yj = ys0 + (ys1 - ys0) * k / nj; ys.push([yj - .002, 0], [yj, -.0018], [yj + .002, 0]); } // drum joints
  ys.sort((p, q) => p[0] - q[0]).forEach(([yy, dr]) => C(rs(yy) + dr, yy));
  for (let k = 1; k <= 3; k++) { const t = k / 3; C(rt + .035 * t * t, ys1 + .025 * t); }                // the shaft's flare under the astragal
  arcPts(rt + .035, ys1 + .039, .014, -90, 90, 5);                // astragal
  C(rt + .01, ys1 + .053, 1); C(rt + .01, ys1 + .11, 1);           // necking
  for (let k = 1; k <= 6; k++) { const t = k / 6 * PI / 2; C(rt + .01 + (r * 1.36 - rt - .01) * (1 - Math.cos(t)), ys1 + .11 + .07 * Math.sin(t)); } // ovolo
  C(r * 1.3, ys1 + .18, 1);
  put3(S, put(loft(rg, { v: Rn(1) * 1.2, caps: [false, true] }), x, y, zc, ry));
  const block = (y0, y1, hx, rad, k, chip) => { // a squared block with 5 mm rounded arrises: plinth and abacus
    const e = .005, g = loft([[rrect(hx - e, hx - e, rad), y0], [rrect(hx, hx, rad + e), y0 + e], [rrect(hx, hx, rad + e), y1 - e], [rrect(hx - e, hx - e, rad), y1]], { u: Rn(k) * 1.2, v: Rn(k + 1) * 1.2, caps: [false, true], cu: Rn(k + 2) });
    const ch = []; if (chip) for (const [sx, sz, q] of [[1, 1, 3], [-1, 1, 4], [1, -1, 5], [-1, -1, 6]]) if (Rn(k + q) > .6) ch.push(corner([sx * hx, y1, sz * hx], [sx, .9 + .5 * Rn(k + q + 7), sz * (.7 + .6 * Rn(k + q + 9))], .008 + .012 * Rn(k + q + 11)));
    const [kept, br] = chop(g, ch); put3(S, put(kept, x, y, zc, ry)); put3(F, put(br, x, y, zc, ry));
  };
  block(0, ph, pw, .004, 20, true); block(h - .12, h, r * 1.46, .004, 40, false);
  solidAt(x, y, zc, ry, 0, ph / 2, 0, 2 * pw, ph, 2 * pw);
  round(...spot(x, zc, ry, 0, 0), r * 1.1, y + ph, y + h);
}

// An arch pier (o.w 0.6 x o.d 0.6 m, o.h 2.4 m to the top of its impost) in dressed stone courses (o.course 0.3 m), each block its own, set
// on a projecting plinth course with a weathered top and crowned by a moulded impost the arch springs from (a fillet, an ovolo and a flat top
// projecting 60 mm). o.mat (limestone) and o.color. A few block corners knocked. Solid: the pier, the plinth a step.
function pier(z, x, y, zc, ry = 0, o = {}) {
  begin('pier');
  const W = (o.w ?? .6) / 2, D = (o.d ?? .6) / 2, h = o.h ?? 2.4, ip = .18, pl = .26, pj = .035, name = o.mat ?? 'limestone', Rn = k => hsh(x, zc, k + 60);
  const S = M(z, name, { color: o.color ?? 0xe6dfd2, wear: 0, floor: y }), F = fresh(z, name, 0xf8f2e6), e = .005;
  const course = (y0, y1, hx, hz, k, rings) => {
    const jx = (Rn(k) - .5) * .003, jz = (Rn(k + 1) - .5) * .003;
    const g = loft(rings ?? [[rrect(hx - e, hz - e, .004), y0], [rrect(hx, hz, .009), y0 + e], [rrect(hx, hz, .009), y1 - e], [rrect(hx - e, hz - e, .004), y1]], { u: Rn(k + 2) * 1.2, v: Rn(k + 3) * 1.2, caps: [false, true], cu: Rn(k + 4) });
    const ch = []; for (const [sx, sz, q] of [[1, 1, 5], [-1, 1, 6], [1, -1, 7], [-1, -1, 8]]) for (const [yy, sy] of [[y0, -1], [y1, 1]]) if (Rn(k + q * 3 + (sy > 0 ? 1 : 0)) > .82)
      ch.push(corner([sx * hx, yy, sz * hz], [sx, sy * (.7 + .5 * Rn(k + q + 20)), sz * (.6 + .8 * Rn(k + q + 30))], .008 + .014 * Rn(k + q + 40)));
    const [kept, br] = chop(g.translate(jx, 0, jz), ch); put3(S, put(kept, x, y, zc, ry)); put3(F, put(br, x, y, zc, ry));
  };
  const PX = W + pj, PZ = D + pj; // the plinth: its top weathered (sloped) back to the pier's face
  course(0, pl, PX, PZ, 0, [[rrect(PX, PZ, .009), 0], [rrect(PX, PZ, .009), pl - .045], [rrect(PX - .005, PZ - .005, .006), pl - .04], [rrect(W + .004, D + .004, .004), pl]]);
  const nc = Math.max(1, Math.round((h - ip - pl) / (o.course ?? .3))), chh = (h - ip - pl) / nc;
  for (let k = 0; k < nc; k++) course(pl + k * chh, pl + (k + 1) * chh, W, D, 100 + k * 50);
  const yi = h - ip, im = [[0, yi], [0, yi + .001], [.004, yi + .002, 1], [.004, yi + .022, 1]];
  for (let k = 1; k <= 6; k++) { const t = k / 6 * PI / 2; im.push([.004 + .046 * (1 - Math.cos(t)), yi + .022 + .07 * Math.sin(t)]); }
  im.push([.054, yi + .092, 1], [.054, yi + .1, 1], [.06, yi + .106], [.06, h - .006], [.055, h]);
  course(yi, h, W, D, 900, im.map(([d, yy, sh]) => [rrect(W + d, D + d, .006 + d * .2), yy, sh]));
  solidAt(x, y, zc, ry, 0, h / 2, 0, 2 * W, h, 2 * D);
  solidAt(x, y, zc, ry, 0, pl / 2, 0, 2 * PX, pl, 2 * PZ);
}

function yard(plot) { // the structure plot in the dev yard (js/zones/yard.js)
  const { zone, x, z } = plot;
  pillar(zone, x + 5, 0, z + 3, 0, { num: '14' });
  beam(zone, [[x + 5, 2.6, z], [x + 5, 2.6, z + 3]], { ends: ['wall', 'pillar'] });
  for (const bx of [x + 6.2, x + 8.7]) bayLine(zone, [[bx, 0, z + 1.2], [bx, 0, z + 6.2]]);
  wheelStop(zone, x + 7.45, 0, z + 1.9);
  arrow(zone, x + 7.45, 0, z + 7.1);
  kerb(zone, [[x + 10, 0, z + .8], [x + 10, 0, z + 7.4]], { drop: [2.4, 3.6] });
  bollard(zone, x + 11.3, 0, z + 2.2); bollard(zone, x + 11.3, 0, z + 4.6);
  speedBump(zone, [[x + 12.1, 0, z + 6.6], [x + 13.6, 0, z + 6.6]]);
  steps(zone, x + 12.6, 0, z + 2.6, 0, { w: 1.6 });
  skirting(zone, [[x + 13.95, 0, z], [x + 3.6, 0, z]]);
  column(zone, x + 1.2, 0, z + 5.4);
  pier(zone, x + 2.9, 0, z + 5.4);
}

export { pillar, beam, wheelStop, bayLine, arrow, kerb, bollard, speedBump, steps, skirting, column, pier, yard, tally };
