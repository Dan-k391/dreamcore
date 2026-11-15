// The night hall: a dark pool under glowing windows, with a water slide.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { V, WY, dark, zones, defZone, uTime } from '../core.js';
import { S, M, glow, poolMats, noCast } from '../mat.js';
import { emitters, flats, pools, rings, box, round, slab, add, solid, turned } from '../build.js';
import { poolLadder, railing, drain, door } from '../props/metalwork.js';
import { poolLight, stepLight } from '../props/lights.js';
import { lounger, pottedPlant } from '../props/garden.js';
import { swimRing } from '../props/play.js';
import { column } from '../props/structure.js';

defZone('pN', { ...dark, exp: .22, bloom: .34, wet: .8, box: [21, -24.4, 45.4, .4], probe: [33, 3, -12], env: [[21, -1.4, -24.4], [45, 7, .4]], shimmer: .25 });
flats.push([24, -21, 42, -3, (x, z) => (z > -14 && z < -10 && x < 25 ? (x < 24.5 ? -.6 : -.9) : -1.2)]); // night pool
pools.push([24, -21, 42, -3, -1.2, 'pN', ['pC', 'pN', 'bC'], [.003, .01, .009]]);
poolMats(zones.pN);
{ // night hall x[21,45] z[-24,0], 7m tall: dark pool x[24,42] z[-21,-3], glowing pill windows and portholes, a water slide
  const T = zones.pN.tile, z = zones.pN;
  box(T, 20.6, -1.4, -24.4, 24, 0, -14); box(T, 20.6, -1.4, -10, 24, 0, .4); box(T, 42, -1.4, -24.4, 45.4, 0, .4); box(T, 24, -1.4, -24.4, 42, 0, -21); box(T, 24, -1.4, -3, 42, 0, .4); // deck
  box(T, 24, -1.4, -21, 42, -1.2, -3); box(T, 24, -1.2, -14, 24.5, -.6, -10); box(T, 24.5, -1.2, -14, 25, -.9, -10); // basin, steps down from the channel
  box(T, 20.6, 7, -24.4, 45.4, 7.3, .4); // ceiling
  box(T, 20.6, 0, -24.4, 21, 7, -14); box(T, 20.6, 0, -10, 21, 7, .4); box(T, 20.6, 3.6, -14, 21, 7, -10); // west wall, opening to the arcade
  box(T, 21, 0, 0, 34, 7, .4); box(T, 36.4, 0, 0, 45.4, 7, .4); box(T, 34, 2.3, 0, 36.4, 7, .4); // south wall, door to the corridor
  box(T, 34, 0, 0, 34.7, 2.3, .4); box(T, 35.7, 0, 0, 36.4, 2.3, .4); // the hole narrowed to the door frame's 1 m
  const windows = at => [...at.map(c => ['pill', c, 1.2, 3.3, 4.2]), ...at.slice(1).map(c => ['round', c - 2, 1.1, 6.1])];
  slab(T, 'x', -24.4, .4, 21, 45, 0, 7, windows([25, 29, 33, 37, 41])); box(glow, 21, 0, -24.7, 45, 7, -24.45);
  slab(T, 'z', 45, .4, -24, 0, 0, 7, windows([-20, -16, -12, -8, -4])); box(glow, 45.45, 0, -24, 45.7, 7, 0);
  box(T, 45, 0, -24.4, 45.4, 7, -24); // corner
  for (const x of [28, 38]) for (const zc of [-17, -7]) column(z, x, -1.2, zc, 0, { h: 8.2, r: .4, color: 0xf0ebe0 }); // stone columns standing in the water, up to the ceiling
  for (const zc of [-20, -12, -4]) emitters.push({ zone: z, p: V(44.6, 3.3, zc), t: V(34, 0, zc), power: 240, angle: 1.25, dist: 34, color: 0xffedc4 });
  for (const x of [25, 33, 41]) emitters.push({ zone: z, p: V(x, 3.3, -23.6), t: V(x, 0, -13), power: 240, angle: 1.25, dist: 34, color: 0xffedc4 });
}
const z = zones.pN;
poolLadder(z, 42, 0, -12, -Math.PI / 2); poolLadder(z, 24, 0, -18, Math.PI / 2); // east side, and west at the deep end clear of the channel
// the overflow gutter: a slot grating right round the pool (the channel steps take the west side's middle), a 4 cm tile lip at the water
drain(z, 42.14, 0, -12, 0, { l: 18.08, w: .2 });
for (const zc of [-21.14, -2.86]) drain(z, 33, 0, zc, Math.PI / 2, { l: 18.48, w: .2 });
drain(z, 23.86, 0, -17.52, 0, { l: 7.04, w: .2 }); drain(z, 23.86, 0, -6.48, 0, { l: 7.04, w: .2 });
// underwater lights, lit: two on each wall, half way down; cheap tile-only lamps
for (const zc of [-16, -8]) { poolLight(z, 42, -.62, zc, -Math.PI / 2, { power: 5 }); poolLight(z, 24, -.62, zc - 1, Math.PI / 2, { power: 5 }); }
for (const x of [30, 36]) { poolLight(z, x, -.62, -21, 0, { power: 5 }); poolLight(z, x - 3, -.62, -3, Math.PI, { power: 5 }); }
railing(z, [[23.7, -.3, -13.62], [25.3, -1.2, -13.62]], { h: .9, mid: false }); // grab rail down the channel steps, against their north side
stepLight(z, 21, .3, -14.5, Math.PI / 2, { power: 1.2 }); stepLight(z, 21, .3, -9.5, Math.PI / 2, { power: 1.2 }); // marking the deck's edge at the channel
door(z, 35.2, 0, .02, 0, { open: 1.85, color: 0x56706a, frame: 0xd9d2c4 }); // the corridor door, held open into the hall
lounger(z, 28.3, 0, -22.6, 0); lounger(z, 29.7, 0, -22.6, 0); pottedPlant(z, 27, 0, -23.75); // a pair under the north windows, heads to the wall
rings.push(...[[0xffc93a, 31, -18.4], [0xff7fa8, 36.3, -13.2]].map(([c, x, zc]) => { const m = swimRing(z, { color: c }); m.position.set(x, WY + .05, zc); return m; }));
// ---------- the flume ----------
// An open U-section gelcoat flume in moulded sections bolted together at flanges. From a railed start platform (deck at 3.6 m,
// reached by a steel stair along the east deck) it runs north over the pool, turns one and a quarter times down round the column
// at (38, -7) on radial arms clamped to that column, and runs out west into the water. A thin film of running water down its bed.
// The path is the bed's lowest line; the profile is built about it, x across (to the right going down), y up.
const V3 = THREE.Vector3, PI = Math.PI, F32 = THREE.Float32BufferAttribute, ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const L1 = 4.25, L2 = 2.4 * 2.5 * PI, L3 = 4.4, FLEN = L1 + L2 + L3, HD = 3.6; // lead-in, helix, run-out; the platform's deck
const plan = s => { if (s < L1) return [40.4, -2.75 - s]; if (s < L1 + L2) { const t = (s - L1) / 2.4; return [38 + 2.4 * Math.cos(t), -7 - 2.4 * Math.sin(t)]; } return [38 - (s - L1 - L2), -9.4]; };
// the fall: a flat start tub, 11.5% down the lead-in, 15% round the helix (2.26 m between the turns where they cross), 17% out, a flat splash run
const knots = [[1.5, .5, 0, .115], [L1, .5, .115, .15], [L1 + L2, .5, .15, .17], [L1 + L2 + 2.6, .6, .17, .02]];
const grade = s => knots.reduce((g, [c, h, a, b]) => g + (b - a) * ss(c - h, c + h, s), 0);
const YT = [HD - .002]; for (let i = 1; i <= FLEN * 100 + 10; i++) YT.push(YT[i - 1] - grade((i - .5) / 100) * .01); // the bed starts 2 mm under the deck it runs out from
const bedY = s => { const f = Math.min(Math.max(s, 0), FLEN + .05) * 100, i = Math.floor(f); return YT[i] + (YT[i + 1] - YT[i]) * (f - i); };
const flare = s => .22 * (1 - ss(.4, 1.8, s)); // the start tub: a flat strip let into the bed's middle, 44 cm at the back
const frame = s => { const [x, z] = plan(s), [x1, z1] = plan(s + .01), [x0, z0] = plan(s - .01);
  const p = new V3(x, bedY(s), z), T = new V3(x1 - x0, bedY(s + .01) - bedY(s - .01), z1 - z0).normalize();
  const B = new V3().crossVectors(T, new V3(0, 1, 0)).normalize(); return { s, p, T, B, N: new V3().crossVectors(B, T), w: flare(s) }; };
export const flume = { L: FLEN, at: s => { const f = frame(s); return [f.p.x, f.p.y, f.p.z, Math.atan2(-f.T.x, -f.T.z), f.w]; } }; // for tools/test.mjs: bed point and heading (yaw)
// Sweep a profile ([x, y, side]: side -1/1 moves the point out by the tub's flare) along frames. UVs in metres. loop: a closed profile; caps: close its ends.
function sweep(fs, prof, loop = true, caps = loop) {
  const m = prof.length, C = m + (loop ? 1 : 0), pos = [], uv = [], idx = [], vl = [0];
  for (let j = 1; j < C; j++) { const a = prof[j - 1], b = prof[j % m]; vl.push(vl[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const at = (f, q) => f.p.clone().addScaledVector(f.B, q[0] + (q[2] || 0) * f.w).addScaledVector(f.N, q[1]);
  fs.forEach(f => { for (let j = 0; j < C; j++) { const v = at(f, prof[j % m]); pos.push(v.x, v.y, v.z); uv.push(f.s, vl[j]); } });
  for (let i = 0; i < fs.length - 1; i++) for (let j = 0; j < C - 1; j++) { const a = i * C + j, b = a + C; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new F32(pos, 3)); g.setAttribute('uv', new F32(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal;
  if (loop) for (let i = 0; i < fs.length; i++) { const a = i * C, b = a + m, v = new V3().fromBufferAttribute(n, a).add(new V3().fromBufferAttribute(n, b)).normalize(); n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z); }
  const out = [g.toNonIndexed()];
  if (caps) for (const [f, sg] of [[fs[0], -1], [fs.at(-1), 1]]) {
    const tri = THREE.ShapeUtils.triangulateShape(prof.map(q => new THREE.Vector2(q[0] + (q[2] || 0) * f.w, q[1])), []), cp = [], cn = [], cu = [];
    for (const t of tri) for (const j of (sg < 0 ? t : [t[0], t[2], t[1]])) { const v = at(f, prof[j]); cp.push(v.x, v.y, v.z); cn.push(f.T.x * sg, f.T.y * sg, f.T.z * sg); cu.push(prof[j][0], prof[j][1]); }
    const c = new THREE.BufferGeometry(); c.setAttribute('position', new F32(cp, 3)); c.setAttribute('normal', new F32(cn, 3)); c.setAttribute('uv', new F32(cu, 2)); out.push(c);
  }
  return out;
}
const ccw = p => p.reduce((s, q, j) => { const b = p[(j + 1) % p.length]; return s + q[0] * b[1] - b[0] * q[1]; }, 0) < 0 ? p.reverse() : p;
// the moulding: bed radius 45 cm, walls 58 cm, a 28 mm rolled lip turned outward and down, a 13 mm shell
const R = .45, rb = .028, Hw = .58, A1 = -122 * PI / 180, TH = rb * (1 + Math.cos(A1)), yB = Hw - rb + rb * Math.sin(A1);
const half = [];
for (let k = 0; k <= 14; k++) { const f = k / 14 * PI / 2; half.push([R * Math.sin(f), R - R * Math.cos(f)]); }
for (let k = 0; k <= 12; k++) { const a = PI + (A1 - PI) * k / 12; half.push([R + rb + rb * Math.cos(a), Hw - rb + rb * Math.sin(a)]); }
for (let k = 14; k >= 0; k--) { const f = k / 14 * PI / 2; half.push([(R + TH) * Math.sin(f), R - (R + TH) * Math.cos(f)]); }
const shellProf = ccw([...half.map(([x, y]) => [x, y, 1]), ...[...half].reverse().map(([x, y]) => [-x, y, -1])]);
// a curve round the outside at radius r, wall top (yTop) to wall top; a band between two of them (flanges, saddle straps)
const curve = (r, yTop, n = 16) => { const h = yTop > R + .001 ? [[r, yTop]] : []; for (let k = n; k >= 0; k--) { const f = k / n * PI / 2; h.push([r * Math.sin(f), R - r * Math.cos(f)]); }
  return [...h.map(([x, y]) => [-x, y, -1]), ...[...h].reverse().map(([x, y]) => [x, y, 1])]; };
const band = (r0, r1, yTop) => ccw([...curve(r0, yTop), ...curve(r1, yTop).reverse()]);
{
  const Gc = M(z, 'gelcoat', { color: 0x4fb8ad, roughness: .2, macro: .12, wear: .25 }), G = M(z, 'galvanised'), Bs = M(z, 'brushedSteel'), Dk = M(z, 'deckTread', { color: 0x9aa59e }), Rb = M(z, 'rubber');
  const up = new V3(0, 1, 0), q = new THREE.Quaternion();
  const along = (g, d, p) => g.applyQuaternion(q.setFromUnitVectors(up, d.clone().normalize())).translate(p.x, p.y, p.z); // a geometry built along +y, turned to run along d, put at p
  const rod = (a, b, r, n = 12) => along(new THREE.CylinderGeometry(r, r, a.distanceTo(b), n, 1, true), b.clone().sub(a), a.clone().add(b).multiplyScalar(.5)); // an open tube between two points (its ends are buried)
  const rbox = (w, h, d, r = .006, sg = 1) => new RoundedBoxGeometry(w, h, d, sg, r);
  const Gb = M(z, 'galvanised', { detail: .1, dirt: .5, dirtCol: [.72, .7, .64], vary: 1, macro: .01 }); noCast.add(Gb); // the bolts: their shadows are too small to see, so they skip the shadow passes
  const nut = (p, d) => { add(Gb, along(new THREE.CylinderGeometry(.0105, .0105, .009, 6), d, p.clone().addScaledVector(d, .0055))); add(Gb, along(new THREE.CylinderGeometry(.016, .016, .002, 8), d, p.clone().addScaledVector(d, .001))); };
  const dome = (p, d) => add(Gb, along(new THREE.SphereGeometry(.012, 10, 3, 0, 2 * PI, 0, PI / 2), d, p));
  const plate = (x, y, zc, s = .2) => { add(G, rbox(s, .016, s, .004).translate(x, y + .008, zc)); for (const a of [-1, 1]) for (const b of [-1, 1]) nut(new V3(x + a * s * .34, y + .016, zc + b * s * .34), up); };
  const ryOf = d => Math.atan2(-d.z, d.x); // rotateY that takes +x to the horizontal direction d
  // the shell: 10 cm steps round the helix (1.9 degrees: no facet shows), 25 cm on the straights, which only bend gently in the fall
  const fs = [], stepAt = s => s > L1 - .3 && s < L1 + L2 + .3 ? .1 : .25; for (let s = 0; s < FLEN - .05; s += stepAt(s)) fs.push(frame(s)); fs.push(frame(FLEN));
  for (const g of sweep(fs, shellProf)) add(Gc, g, true);
  // the joints: back-to-back flanges every section (about 2 m), bolted every 12 cm round
  const supports = [.65, ...Array.from({ length: 11 }, (_, k) => L1 + 2.4 * k * PI / 4), L1 + L2 + 1.6, L1 + L2 + 3.4];
  const ns = Math.round(FLEN / 2);
  for (let j = 1; j < ns; j++) { let sj = FLEN * j / ns; if (supports.some(s => Math.abs(s - sj) < .15)) sj += .3;
    const fa = frame(sj - .022), fb = frame(sj + .022);
    for (const g of sweep([fa, fb], band(R + TH - .003, R + TH + .05, yB - .012))) add(Gc, g, true);
    const mid = curve(R + TH + .027, yB - .03), ls = [0]; for (let k = 1; k < mid.length; k++) ls.push(ls[k - 1] + Math.hypot(mid[k][0] - mid[k - 1][0], mid[k][1] - mid[k - 1][1]));
    const nb = Math.round(ls.at(-1) / .12);
    for (let b = 0; b <= nb; b++) { const l = ls.at(-1) * b / nb; let k = 1; while (k < mid.length - 1 && ls[k] < l) k++;
      const t = (l - ls[k - 1]) / (ls[k] - ls[k - 1] || 1), qx = mid[k - 1][0] + (mid[k][0] - mid[k - 1][0]) * t, qy = mid[k - 1][1] + (mid[k][1] - mid[k - 1][1]) * t, sd = Math.sign(qx);
      const pa = fa.p.clone().addScaledVector(fa.B, qx + sd * fa.w).addScaledVector(fa.N, qy), pb = fb.p.clone().addScaledVector(fb.B, qx + sd * fb.w).addScaledVector(fb.N, qy);
      nut(pb, fb.T); dome(pa, fa.T.clone().negate()); } }
  // a saddle: a strap round the shell's underside on a beam across under it (an arm from the column round the helix)
  const saddle = s => { const f = frame(s); for (const g of sweep([frame(s - .03), frame(s + .03)], band(R + TH, R + TH + .008, R))) add(G, g, true); return f; };
  const beamY = f => f.p.y - TH - .008 - .045; // the beam's centre, its top under the strap
  const legs = (s, fl) => { const f = saddle(s), y = beamY(f), hw = R + TH + .12, ry = ryOf(f.B);
    add(G, rbox(2 * hw + .1, .09, .07).rotateY(ry).translate(f.p.x, y, f.p.z));
    const ft = [-1, 1].map(sd => f.p.clone().addScaledVector(f.B, sd * hw).setY(fl)), top = y - .045;
    for (const a of ft) { add(G, rod(a, a.clone().setY(top), .045, 16)); plate(a.x, fl, a.z); round(a.x, a.z, .05, fl, top); }
    const tiers = Math.max(1, Math.ceil((top - fl - .5) / 2.2)), h0 = fl + .3, dh = (top - .25 - h0) / tiers;
    for (let t = 0; t < tiers; t++) { const a0 = ft[0].clone().setY(h0 + t * dh), a1 = ft[0].clone().setY(h0 + (t + 1) * dh), b0 = ft[1].clone().setY(h0 + t * dh), b1 = ft[1].clone().setY(h0 + (t + 1) * dh);
      if (top - fl > 1.6) { add(G, rod(a0, b1, .02)); add(G, rod(b0, a1, .02)); } else { add(G, rod(a0.setY((fl + top) / 2), b0.setY((fl + top) / 2), .02)); } }
    turned(f.p.x, f.p.z, hw, .03, ry, fl, top); }; // the frame is a wall: its braces stop you
  legs(supports[0], -1.2); legs(supports[12], -1.2); legs(supports[13], -1.2);
  // each arm and its strut bolt to the column through a curved plate (a 40 degree sector, 13 mm), anchors at its corners
  const CX = 38, CZ = -7, bracket = (th, y, h) => { add(G, new THREE.CylinderGeometry(.413, .413, h, 10, 1, false, th + PI / 2 - .35, .7).translate(CX, y, CZ));
    for (const da of [-.26, .26]) for (const dy of [-1, 1]) { const a = th + da, d = new V3(Math.cos(a), 0, -Math.sin(a)); nut(new V3(CX, y + dy * (h / 2 - .035), CZ).addScaledVector(d, .413), d); } };
  for (let k = 0; k <= 10; k++) { const f = saddle(supports[k + 1]), y = beamY(f), o = new V3(CX, y, CZ), ry = ryOf(f.B), r1 = 2.4 + R + TH + .12;
    add(G, rbox(r1 - .41, .1, .07).translate((r1 + .41) / 2, 0, 0).rotateY(ry).translate(CX, y, CZ)); bracket(k * PI / 4, y, .26); bracket(k * PI / 4, y - 1, .2);
    const a = o.clone().addScaledVector(f.B, .41).setY(y - 1), b = o.clone().addScaledVector(f.B, 1.55).setY(y - .05);
    add(G, rod(a, b, .028, 14)); add(G, rbox(.09, .012, .07, .003).rotateY(ry).translate(b.x, y - .056, b.z));
    turned(CX + f.B.x * (r1 + .43) / 2, CZ + f.B.z * (r1 + .43) / 2, (r1 - .43) / 2, .035, ry, y - .05, y + .05);
    for (let i = 0; i < 3; i++) { const c = a.clone().lerp(b, (i + .5) / 3); round(c.x, c.z, .04, c.y - .2, c.y + .2); } }
  // its solids: the bed in 25 cm steps you walk down, a wall each side you can't pass
  for (let s = 0; s < FLEN - .01; s += .25) { const f = frame(s + .125), ry = ryOf(new V3(f.T.x, 0, f.T.z).normalize()), y = f.p.y, hw = R + f.w;
    turned(f.p.x, f.p.z, .14, hw, ry, y - .25, y);
    for (const sd of [-1, 1]) turned(f.p.x + f.B.x * sd * (hw + .05), f.p.z + f.B.z * sd * (hw + .05), .14, .05, ry, y - .25, y + Hw); }
  // the water running down the bed: a film 4 mm over it whose ripples move downstream
  const film = S({ color: 0xc8e2da, roughness: .05, metalness: 0, transparent: true, opacity: .45, depthWrite: false });
  film.customProgramCacheKey = () => 'flumeFilm'; z.mats.push(film); noCast.add(film);
  film.onBeforeCompile = sh => { sh.uniforms.uTime = uTime;
    sh.vertexShader = 'varying vec2 vF;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vF = uv;');
    sh.fragmentShader = 'uniform float uTime;\nvarying vec2 vF;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { float u = vF.x * 7. - uTime * 5., v = vF.y * 12.;
    float hg = sin(u + 1.7 * sin(v * .9 + vF.x * 2.3)) * .5 + sin(u * 1.93 - v * 1.1 + 2.) * .3 + sin(u * 3.7 + v * 2.3 + uTime) * .12;
    vec2 dH = vec2(dFdx(hg), dFdy(hg)) * .02; vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition), r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1);
    normal = normalize(abs(det) * normal - sign(det) * (dH.x * r1 + dH.y * r2)); diffuseColor.a *= .6 + .4 * smoothstep(-.6, .8, hg); }`); };
  const filmProf = []; for (let k = 6; k >= -6; k--) { const f = k / 6 * .48; filmProf.push([(R - .004) * Math.sin(f), R - (R - .004) * Math.cos(f), Math.sign(k)]); }
  for (const g of sweep(fs.filter(f => f.s > .25), filmProf, false)) add(film, g, true);

  // the start platform: deck x 39.3..43.45, z -2.8..0 at 3.6 m on six posts, knee braced (you walk under it along the south deck)
  const X0 = 39.3, X1 = 43.45, Z0 = -2.8, Z1 = -.02, posts = [];
  for (const x of [39.42, 41.4, 43.33]) for (const zc of [-.2, -2.68]) posts.push([x, zc]);
  for (const [x, zc] of posts) { add(G, rod(new V3(x, 0, zc), new V3(x, HD - .19, zc), .05, 16)); plate(x, 0, zc, .22); round(x, zc, .055, 0, HD - .19);
    for (const [dx, dz] of [[x < 41 ? 1 : -1, 0], [0, zc < -1 ? 1 : -1]]) add(G, rod(new V3(x, HD - 1, zc), new V3(x + dx * .7, HD - .17, zc + dz * .7), .025)); }
  for (const zc of [-.2, -2.68]) add(G, rbox(X1 - X0 - .08, .14, .08).translate((X0 + X1) / 2, HD - .12, zc)); // the bearers
  for (const x of [39.42, 41.4, 43.33]) add(G, rbox(.08, .14, 2.62).translate(x, HD - .12, -1.44)); // joists across them
  add(Dk, rbox(X1 - X0, .05, Z1 - Z0, .01).translate((X0 + X1) / 2, HD - .025, (Z0 + Z1) / 2)); solid(X0, HD - .2, Z0, X1, HD, Z1);
  add(G, rbox(.012, .1, 2.6, .003).translate(X0 - .006, HD - .05, (Z0 + Z1) / 2)); add(G, rbox(X1 - X0, .1, .012, .003).translate((X0 + X1) / 2, HD - .05, Z0 - .006)); // edge angles
  railing(z, [[X0 + .03, HD, -.06], [X0 + .03, HD, Z0 + .05]], { h: 1 });
  // the stair: 20 risers of 18 cm on two galvanised channel stringers, open treads with rubber anti-slip strips, rising south
  const S0 = -7.74, sx0 = 42.38, sx1 = 43.42, rise = .18, go = .26, nose = zc => rise + (zc - S0) * rise / go, len = Math.hypot(HD, Z0 - S0) + .3, ang = Math.atan2(HD, Z0 - S0);
  for (const x of [sx0, sx1]) { add(G, rbox(.05, .26, len, .006).rotateX(-ang).translate(x, nose((S0 + Z0) / 2) - .06, (S0 + Z0) / 2));
    const zm = -5.4, ym = nose(zm) - .2; add(G, rod(new V3(x, 0, zm), new V3(x, ym, zm), .04, 16)); plate(x, 0, zm, .18); round(x, zm, .05, 0, ym); }
  add(G, rod(new V3(sx0, 1, -5.4), new V3(sx1, 1, -5.4), .022)); add(G, rbox(sx1 - sx0, .08, .06).translate((sx0 + sx1) / 2, nose(-5.4) - .26, -5.4));
  for (let i = 1; i < 20; i++) { const za = S0 + go * (i - 1), y = rise * i;
    add(G, rbox(sx1 - sx0 - .05, .03, go + .02, .004).translate((sx0 + sx1) / 2, y - .015, za + go / 2));
    for (const d of [.035, .09, .145]) add(Rb, new THREE.BoxGeometry(sx1 - sx0 - .12, .006, .03).translate((sx0 + sx1) / 2, y + .002, za + d));
    for (const x of [sx0 + .03, sx1 - .03]) for (const d of [.06, go - .06]) dome(new V3(x + (x < 43 ? -.055 : .055), y - .03, za + d), new V3(x < 43 ? -1 : 1, 0, 0));
    solid(sx0 + .02, y - .04, za, sx1 - .02, y, za + go);
    solid(sx0 - .06, y, za, sx0 + .02, y + 1, za + go); solid(sx1 - .02, y, za, sx1 + .06, y + 1, za + go); } // its sides, above every tread
  railing(z, [[sx0, nose(S0 + .1), S0 + .1], [sx0, HD, Z0], [41.42, HD, Z0]], { h: 1 });
  railing(z, [[sx1, nose(S0 + .1), S0 + .1], [sx1, HD, Z0], [X1 - .03, HD, -.06]], { h: 1 });
  // the grab bar over the way in: a bent tube hoop 2 m over the deck, its feet bolted down on flanges
  const gx = .88, gz = -2.66, gh = 2;
  const hoop = new THREE.CurvePath(), P3 = (x, y) => new V3(40.4 + x, HD + y, gz), rc = .18;
  hoop.add(new THREE.LineCurve3(P3(-gx, 0), P3(-gx, gh - rc))); hoop.add(new THREE.QuadraticBezierCurve3(P3(-gx, gh - rc), P3(-gx, gh), P3(-gx + rc, gh)));
  hoop.add(new THREE.LineCurve3(P3(-gx + rc, gh), P3(gx - rc, gh))); hoop.add(new THREE.QuadraticBezierCurve3(P3(gx - rc, gh), P3(gx, gh), P3(gx, gh - rc))); hoop.add(new THREE.LineCurve3(P3(gx, gh - rc), P3(gx, 0)));
  add(Bs, new THREE.TubeGeometry(hoop, 120, .024, 16), true);
  for (const sd of [-1, 1]) { const x = 40.4 + sd * gx; add(Bs, new THREE.CylinderGeometry(.045, .05, .012, 24).translate(x, HD + .006, gz)); for (let k = 0; k < 3; k++) dome(new V3(x + .035 * Math.cos(k * 2.1), HD + .012, gz + .035 * Math.sin(k * 2.1)), up);
    round(x, gz, .04, HD, HD + gh); }
  solid(40.4 - gx, HD + gh - .03, gz - .03, 40.4 + gx, HD + gh + .03, gz + .03);
}
