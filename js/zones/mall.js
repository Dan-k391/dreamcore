// The mall atrium.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { dry, zones, defZone } from '../core.js';
import { M as lib, P, neon, wallMat, noCast } from '../mat.js';
import { box, block, lit, add, put, solid } from '../build.js';
import { mallBench, palmPlanter, pottedPlant } from '../props/garden.js';
import { door, shopfront, railing, shutter, bin, signPost } from '../props/metalwork.js';
import { beam, skirting } from '../props/structure.js';
import { troffer, neonSign } from '../props/lights.js';
import { gardenChair } from '../props/play.js';

// ---- shop fit-out: shapes about their own origin, feet at y 0, front toward +z ----
const PI = Math.PI, V3 = (a, b, c) => new THREE.Vector3(a, b, c);
const RB = (w, h, d, r = .004, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const cyl = (a, b, r, seg = 10) => { const A = V3(...a), B = V3(...b), d = B.clone().sub(A), g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize())); return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); };
const tube = (pts, r, seg = 8, n = pts.length * 4) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V3(...p)), false, 'centripetal'), n, r, seg, false);
const smooth = g => { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-5); g.computeVertexNormals(); return uvs(g); };
const uvs = g => { g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }; // add() projects them
const hash = (k, seed) => { const v = Math.sin(k * 127.1 + seed * 311.7) * 43758.5; return v - Math.floor(v); };
// a folded piece of cloth (a jumper, a towel): layers with a round folded edge and two soft lobes at the open edge, wrinkled; w across, d deep, t thick
function fold(w, d, t, seed) {
  const s = new THREE.Shape(), r = t / 2, q = t / 4, n = 5;
  s.moveTo(-w / 2 + r, 0); for (let i = 1; i <= n; i++) s.lineTo(-w / 2 + r + (w - r - q) * i / n, 0);
  s.absarc(w / 2 - q, q, q, -PI / 2, PI / 2); s.absarc(w / 2 - q - .004, 3 * q, q, -PI / 2, PI / 2);
  for (let i = n - 1; i >= 0; i--) s.lineTo(-w / 2 + r + (w - r - q - .004) * i / n, t); s.absarc(-w / 2 + r, r, r, PI / 2, 1.5 * PI);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, steps: 4, bevelEnabled: true, bevelThickness: t * .3, bevelSize: t * .12, bevelSegments: 1, curveSegments: 3 }).translate(0, 0, -d / 2);
  const p = g.attributes.position, ph = [0, 1, 2].map(k => hash(k, seed));
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), zz = p.getZ(i), top = y / t;
    const dy = t * .12 * Math.sin(x * 29 + ph[0] * 6) * Math.sin(zz * 21 + ph[1] * 6) + top * t * .14 * (1 - (2 * zz / d) ** 2) - top * .003 * Math.exp(-(((x - (ph[2] - .5) * .03) / .016) ** 2));
    p.setY(i, y + dy * (.3 + .7 * top)); }
  return smooth(g);
}
// a plain garment hung by its neck at the origin, front +z: a soft body (shoulders sloping, folds deepening toward the hem) and two sleeves at its sides
function garment(len, wid, dep, seed, sleeves = true) {
  const n = sleeves ? 22 : 10, m = sleeves ? 14 : 7, pos = [], idx = [], ph = [0, 1, 2, 3].map(k => hash(k, seed)), ring = j => 1 + j * n;
  pos.push(0, -.004, 0); // top cap centre
  for (let j = 0; j <= m; j++) { const t = j / m, e = Math.min(1, t / .09);
    const w = wid / 2 * (.5 + .5 * Math.sin(e * PI / 2)) * (1 + .05 * t), d = dep / 2 * (.18 + .82 * Math.sin(e * PI / 2)) * (j === m ? .55 : 1);
    for (let i = 0; i < n; i++) { const a = i / n * 2 * PI, c = Math.cos(a), sd = Math.sin(a), x = w * c;
      const fz = Math.pow(t, 1.4) * (.018 * Math.sin(x * 33 + ph[0] * 6) + .006 * Math.sin(x * 81 + ph[1] * 6)); // folds falling from the shoulders
      const y = -t * len - (1 - t) * .075 * Math.abs(c) ** 1.6 * e + (j === m ? .008 * Math.sin(x * 23 + ph[2] * 6) : 0);
      pos.push(x * (1 + .03 * Math.sin(t * 9 + ph[3] * 6) * t), y, d * sd + fz * (sd > 0 ? 1 : .7)); }
  }
  pos.push(0, -len + .02, 0); // the hem's underside
  for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; idx.push(0, ring(0) + i2, ring(0) + i);
    for (let j = 0; j < m; j++) { const a = ring(j) + i, b = ring(j) + i2, c = ring(j + 1) + i, d = ring(j + 1) + i2; idx.push(a, b, d, a, d, c); }
    idx.push(pos.length / 3 - 1, ring(m) + i, ring(m) + i2); }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (!sleeves) return uvs(g);
  const parts = [g];
  for (const s of [-1, 1]) parts.push(garment(len * .6, .1, .075, seed + s * 7, false).rotateZ(s * .07).translate(s * (wid / 2 - .035), -.05, .004));
  return mergeG(parts);
}
const mergeG = gs => { let n = 0; const pos = [], idx = []; for (const g of gs) { const p = g.attributes.position.array, ix = g.index.array; pos.push(...p); for (const k of ix) idx.push(k + n); n += p.length / 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return uvs(g); };
// a wooden hanger inside the shoulders and its chrome hook curled over a rail whose axis is at (0, .065, 0) and runs along x
const hangerBar = wid => tube([[-wid * .44, -.045, 0], [-wid * .22, -.012, 0], [0, -.002, 0], [wid * .22, -.012, 0], [wid * .44, -.045, 0]], .009, 8, 14);
const hook = () => { const pts = [[0, -.004, 0], [0, .03, 0]]; for (let i = 0; i <= 10; i++) { const a = -PI / 2 - i / 10 * 1.4 * PI; pts.push([0, .065 + .017 * Math.sin(a), .017 * Math.cos(a)]); } return tube(pts, .0022, 6, 30); };

// The shop signs' tubes, [x, y] in metres about the sign's centre: no words, only shapes (the kit's default is a sun over water).
const arc = (cx, cy, r, a0, a1, n = 28) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const wave = (y, w, amp, n = 4) => Array.from({ length: 41 }, (_, i) => { const t = i / 40; return [-w / 2 + w * t, y + amp * Math.sin(t * Math.PI * 2 * n)]; });
const SIGNS = [
  undefined,
  [arc(0, -.16, .32, .05, Math.PI - .05), arc(0, -.16, .24, .05, Math.PI - .05), arc(0, -.16, .16, .05, Math.PI - .05)], // three arcs
  [[...arc(-.1, .04, .22, Math.PI * .55, Math.PI * 1.45), ...arc(-.02, .04, .18, Math.PI * 1.38, Math.PI * .62, 24)], wave(.0, .5, .02, 3).map(([a, b]) => [a + .45, b - .1])], // a crescent and a ripple
  [wave(.18, 1.3, .045), wave(.03, 1.3, .045), wave(-.12, 1.3, .045)], // three waves
  [Array.from({ length: 11 }, (_, i) => { const r = i % 2 ? .1 : .25, a = Math.PI / 2 + i * Math.PI / 5; return [r * Math.cos(a), .03 + r * Math.sin(a)]; })], // a star
];

defZone('mL', { ...dry, grp: 'm', k: 1.15, exp: .3, fog: [.4, .38, .4, .0008], bloom: .25, wet: .7, box: [-27, 21.45, 2.4, 52.6], probe: [-12.5, 3.4, 41] }); // off the palms' line: from between them their leaves filled the floor's reflection with a green blob
{ // mall atrium x[-26.6,1.8] z[24.4,49.6], 7m tall: polished chequered floor, shop fronts between piers under fascias with neon signs, a gallery, a skylight, palms
  const z = zones.mL, h = 7, F = lib(z, 'marble'), W = wallMat(z, 0xe6dcd6), dark = P(z, { color: 0x050505, roughness: 1 }), Bk = lib(z, 'terrazzo'), skirt = pts => skirting(z, pts, { color: 0x5e564d }); // skirting darker than the wall, as the fascias
  box(F, -27, -.2, 24, 2.2, 0, 50); box(W, -27, h, 24, 2.2, h + .3, 50);
  const isOpen = (i, k) => (i + (k > 0)) % 3 === 0; // which units trade: the others are shuttered
  for (const [a, b, k] of [[24, 24.4, 1], [49.6, 50, -1]]) { // north and south walls, a 4.6 x 3.3 m hole into each open shop
    let xa = -27; const [v1, v2] = k > 0 ? [21.45, 24] : [50, 52.6];
    for (let i = 0; i < 5; i++) if (isOpen(i, k)) { const x0 = -25.6 + 5.4 * i;
      box(W, xa, 0, a, x0, h, b); box(W, x0, 3.3, a, x0 + 4.6, h, b); solid(xa === -27 ? -27 : xa + .2, -1, v1, x0 - .2, 10, v2); xa = x0 + 4.6; }
    box(W, xa, 0, a, 2.2, h, b); solid(xa + .2, -1, v1, 2.25, 10, v2); // the space behind the walls filled, so nothing samples the outside (tools/pvs.mjs)
  }
  box(W, 1.8, 0, 24.4, 2.2, h, 44.5); box(W, 1.8, 0, 45.5, 2.2, h, 49.6); box(W, 1.8, 2.24, 44.5, 2.2, h, 45.5); // east, door to the hotel hallway: the
  // same 1 x 2.24 m hole as the hotel's side of the wall, so the passage's reveals are one face each side (the hotel's side owns x > 2.2)
  door(z, 1.82, 0, 45, Math.PI / 2, { open: 1.85, color: 0x7a5a3c, frame: 0xd9d2c4 }); // swings into the mall, held back against the wall north of it
  box(W, -27, 0, 24.4, -26.6, h, 34); box(W, -27, 0, 38, -26.6, h, 49.6); box(W, -27, 3, 34, -26.6, h, 38); // west, opening to the soft play room
  // ---- the open shops: a glazed aluminium front set into the wall's reveal (door locked: looked into, not entered) and behind it a room
  // 4.6 m wide, 2.45 m deep, 3.3 m high with its own floor, walls and dark ceiling, fitted out and lit by a few warm downlights ----
  const Wp = lib(z, 'plaster', { color: 0xa8957a, dirt: .45, grime: .2 }), Wd = lib(z, 'plaster', { color: 0x4a4038, dirt: .3, grime: .2 }), Ce = lib(z, 'plaster', { color: 0x2c2723, grime: .25 }), We = lib(z, 'plaster', { color: 0x5c5248, dirt: .6, grime: .3 }); // putty, umber, a dull stripped grey-brown
  const floors = { linen: lib(z, 'hardwood', { color: 0x8c6a48, roughness: .32 }), clothes: lib(z, 'loopCarpet', { color: 0x4f433a, macro: .12, grime: .25 }),
    empty: lib(z, 'concreteFloor', { color: 0x6a6358, grime: .35, dirt: .7, macro: .3 }) };
  const Pt = lib(z, 'paintedSteel', { color: 0xcfc6b6, roughness: .45, wear: .25, edgeCol: [.7, .66, .6], dirt: .35 }); // painted joinery: plinths, the counter, downlight trims
  const St = lib(z, 'paintedSteel', { color: 0x2c2824, roughness: .38, wear: .3, edgeCol: [.5, .46, .42] }), Ok = lib(z, 'hardwood', { color: 0xb48c62, roughness: .4 });
  const Kr = lib(z, 'hardPlastic', { color: 0x9a7650, roughness: .78, wear: .1 }), Iv = lib(z, 'hardPlastic', { color: 0xcdc2ab, roughness: .62, wear: .1 }); // blank boxes, kraft and ivory card
  const cloth = [lib(z, 'loopCarpet', { color: 0xc4ae8c, macro: .05, grime: .05 }), lib(z, 'loopCarpet', { color: 0x8a4a36, macro: .05, grime: .05 }), lib(z, 'velvet', { color: 0x3e4c46, sheen: .5 })];
  const Dk = lib(z, 'hardPlastic', { color: 0x262422, roughness: .4 }), Sc = lib(z, 'hardPlastic', { color: 0x0b0b0c, roughness: .1 }), Ch = lib(z, 'chrome'), Rb = lib(z, 'rubber', { color: 0x1c1b1a, roughness: .6 });
  const lens = neon(0xffbf78, 6), dead = lib(z, 'hardPlastic', { color: 0x6c665c, roughness: .3 });
  noCast.add(lib(z, 'glass')); // the clear front lets the shop's light out onto the mall floor
  function shop(cx, zw, k, kind) { // own frame: x across the unit, z toward the mall, the wall's face at z 0
    const ry = k > 0 ? 0 : PI, L = [], p = (m, g) => L.push([m, g]), W2 = (x, q) => [cx + k * x, zw + k * q];
    const bx = (m, x1, y1, z1, x2, y2, z2) => { const [a, b] = W2(x1, z1), [c, d] = W2(x2, z2); box(m, Math.min(a, c), y1, Math.min(b, d), Math.max(a, c), y2, Math.max(b, d)); };
    const sol = (x1, y1, z1, x2, y2, z2) => { const [a, b] = W2(x1, z1), [c, d] = W2(x2, z2); solid(Math.min(a, c), y1, Math.min(b, d), Math.max(a, c), y2, Math.max(b, d)); };
    const at = (x, y, q, g, r = 0) => g.rotateY(r).translate(x, y, q), B = -2.85; // B: the back wall's face
    // the room
    bx(floors[kind], -2.3, -.2, B, 2.3, 0, -.4); bx(Ce, -2.5, 3.3, B - .1, 2.5, 3.5, -.4);
    const Wl = { linen: Wp, clothes: Wd, empty: We }[kind]; bx(Wl, -2.5, 0, B - .1, 2.5, 3.3, B); bx(Wl, -2.5, 0, B, -2.3, 3.3, -.4); bx(Wl, 2.3, 0, B, 2.5, 3.3, -.4);
    skirt([[2.3, -.4], [2.3, B], [-2.3, B], [-2.3, -.4]].map(([x, q]) => { const [a, b] = W2(x, q); return [a, 0, b]; }));
    const light = (x, y, q, power, tx, ty, tq, angle, dist, color) => { const [a, b] = W2(x, q), [c, d] = W2(tx, tq); lit(z, a, y, b, power, [c, ty, d], angle, dist, color); };
    const [gx, gz] = W2(0, -.15); shopfront(z, gx, 0, gz, ry, { w: 4.6, h: 3.3, th: 2.3, door: 1, dx: kind === 'empty' ? -1.1 : kind === 'linen' ? 1.1 : 0, open: 0 });
    // fittings: recessed downlights in the dark ceiling; `on` lists which glow
    const downs = [[-1.2, -1.05], [1.2, -1.05], [-1.2, -2.1], [1.2, -2.1]], on = { linen: [0, 1, 2, 3], clothes: [0, 1, 2, 3], empty: [2] }[kind];
    downs.forEach(([x, q], j) => { p(Pt, at(x, 3.3, q, new THREE.LatheGeometry([[.075, 0], [.075, -.006], [.068, -.01], [.052, -.012], [.05, -.004], [.05, .03]].map(([r, y]) => new THREE.Vector2(r, y)), 28)));
      p(on.includes(j) ? lens : dead, at(x, 3.295, q, new THREE.CircleGeometry(.05, 24).rotateX(PI / 2))); });
    // a cluster of display plinths, painted, with a shadow gap at the floor
    const plinth = (x, q, w, d, ht, r = 0) => { p(Pt, at(x, .02, q, RB(w, ht - .02, d, .006).translate(0, (ht - .02) / 2, 0), r)); p(Rb, at(x, 0, q, RB(w - .03, .025, d - .03, .002).translate(0, .0125, 0), r)); sol(x - w / 2, 0, q - d / 2, x + w / 2, ht, q + d / 2); return ht; };
    const stack = (x, y, q, n, seed, r = 0, w = .32, d = .26) => { let yy = y; for (let i = 0; i < n; i++) { const t = .04 + .012 * hash(i, seed);
      p(cloth[(i + seed) % (kind === 'linen' ? 2 : 3)], at(x + .008 * (hash(i + 9, seed) - .5), yy, q + .01 * (hash(i + 5, seed) - .5), fold(w, d, t, seed * 10 + i), r + .06 * (hash(i + 3, seed) - .5))); yy += t * .92; } };
    const carton = (x, y, q, w, ht, d, m, r = 0) => { p(m, at(x, y, q, RB(w, ht - .012, d, .003).translate(0, (ht - .012) / 2, 0), r)); p(m, at(x, y, q, RB(w + .008, .03, d + .008, .004).translate(0, ht - .015, 0), r)); };
    // the counter: a reeded painted front, terrazzo top, a dark kick; a blank till on it facing the clerk
    const counter = (x, q, len) => { const d = .56, hh = .9;
      p(Pt, at(x, .08, q, RB(len, hh - .08, d - .04, .005).translate(0, (hh - .08) / 2, -.01))); p(Rb, at(x, 0, q, RB(len - .06, .08, d - .12, .002).translate(0, .04, -.03)));
      for (let i = 0, n = Math.round(len / .045); i < n; i++) p(Pt, at(x - len / 2 + (i + .5) * len / n, .1, q + d / 2 - .03, new THREE.CylinderGeometry(.018, .018, hh - .14, 8, 1, true).rotateY(PI / 8).translate(0, (hh - .14) / 2, 0)));
      p(Bk, at(x, hh, q, RB(len + .04, .035, d + .03, .006).translate(0, .0175, 0))); sol(x - len / 2, 0, q - d / 2, x + len / 2, hh + .035, q + d / 2);
      const tx = x + len * .22, ty = hh + .035; // the till: drawer, a keyed base, a screen on a stalk, a receipt printer; nothing written on any of it
      p(Dk, at(tx, ty, q - .05, RB(.4, .1, .42, .008).translate(0, .05, 0))); p(Rb, at(tx, ty + .05, q - .05 - .21, RB(.3, .004, .006, .001)));
      p(Dk, at(tx, ty + .1, q - .02, RB(.3, .03, .2, .006).translate(0, .015, 0).rotateX(-.12)));
      p(Dk, at(tx, ty + .1, q + .05, cyl([0, 0, 0], [0, .16, 0], .014, 12))); p(Dk, at(tx, ty + .25, q + .05, RB(.3, .21, .035, .008).rotateX(.25)));
      p(Sc, at(tx, ty + .25, q + .05, RB(.26, .17, .004, .002).translate(0, -.008, -.017).rotateX(.25)));
      p(Dk, at(tx - .32, ty, q - .02, RB(.14, .12, .2, .02).translate(0, .06, 0))); p(Rb, at(tx - .32, ty + .1, q - .12, RB(.08, .004, .01, .001)));
    };
    // wall shelving on the back wall: slotted uprights, oak shelves on brackets
    const shelving = (xs, ys, full = true) => { for (const x of xs) { p(St, at(x, .1, B + .02, RB(.03, 2.35, .03, .003).translate(0, 1.175, .015))); p(Rb, at(x, .2, B + .036, RB(.008, 2.1, .002, .0008).translate(0, 1.05, 0))); }
      if (full) for (let b = 0; b < xs.length - 1; b++) for (const y of ys) { const a = xs[b] + .02, c = xs[b + 1] - .02;
        p(Ok, at((a + c) / 2, y, B + .19, RB(c - a, .026, .34, .004))); for (const e of [a + .01, c - .01]) p(St, at(e, y - .07, B + .17, RB(.004, .06, .3, .001).translate(0, .03, 0))); }
      sol(xs[0], 0, B, xs.at(-1), 2.45, B + .36); };
    let sx = 0, sy = 0, sz = 0, tx2 = 0, ty2 = 0, tz2 = 0;
    if (kind === 'linen') { // folded cloth and blank boxes on oak shelves, plinths in front with stacks on them, a counter by the right wall
      const xs = [-2.2, -1.1, 0, 1.1, 2.2], ys = [.38, .82, 1.26, 1.7, 2.14]; shelving(xs, ys);
      for (let b = 0; b < 4; b++) for (let s = 0; s < 5; s++) { const y = ys[s] + .013, x = (xs[b] + xs[b + 1]) / 2, sd = b * 5 + s + 1, kindOf = hash(sd, 4);
        if (s === 4 || kindOf < .3) for (let c = 0; c < 3; c++) { const w = .24 + .06 * hash(c, sd), ht = .14 + .1 * hash(c + 4, sd); carton(x - .34 + c * .34, y, B + .2, w, ht, .3, (c + b) % 2 ? Kr : Iv, .04 * (hash(c + 8, sd) - .5)); }
        else for (let c = 0; c < 3; c++) if (hash(c + 11, sd) > .15) stack(x - .33 + c * .33, y, B + .2, 2 + Math.floor(hash(c + 2, sd) * 4), sd * 3 + c, 0, .28, .26); }
      stack(-1.35, plinth(-1.35, -1.25, .5, .5, .85), -1.25, 4, 71, .3); stack(-.72, plinth(-.72, -1.5, .6, .5, .55), -1.5, 6, 72, -.2);
      stack(-1.05, plinth(-1.05, -.8, .55, .45, .3), -.8, 3, 73, .1); carton(-.85, .3, -.8, .22, .1, .18, Iv, .3);
      counter(1.25, -1.75, 1.5);
      [sx, sy, sz, tx2, ty2, tz2] = [-1.2, 3.25, -1.05, -1.0, 0, -1.25];
      light(1.2, 3.25, -2.1, 30, .2, 1.2, B, .95, 6, 0xffcf96); // the shelves, softer
    } else if (kind === 'clothes') { // plain garments on a back wall rail and a floor rail, a plinth with folded jumpers
      const ry0 = -2.6, yr = 1.78; // the wall rail: chrome bar on three brackets
      p(Ch, at(0, yr + .065, ry0, cyl([-1.9, 0, 0], [1.9, 0, 0], .0125, 14))); for (const x of [-1.9, 0, 1.9]) p(Ch, at(x, yr + .065, ry0, cyl([0, 0, 0], [0, 0, B - ry0], .009, 10)));
      for (const x of [-1.9, 1.9]) p(Ch, at(x, yr + .065, ry0, new THREE.SphereGeometry(.016, 12, 8)));
      for (let i = 0; i < 26; i++) { const x = -1.78 + i * .142 + .03 * (hash(i, 3) - .5), wid = .4 + .06 * hash(i, 5), len = .7 + .3 * hash(i, 6), r = PI / 2 + .12 * (hash(i, 7) - .5);
        p(cloth[i % 3], at(x, yr, ry0, garment(len, wid, .06 + .04 * hash(i, 8), i + 20), r)); p(Ok, at(x, yr, ry0, hangerBar(wid), r)); p(Ch, at(x, yr, ry0, hook().rotateY(-PI / 2), r)); }
      const fx = 1.15, f1 = -.75, f2 = -2.05, fy = 1.6; // the floor rail: two uprights on flat feet, a bar along z, garments facing the glass
      p(Ch, at(fx, fy + .065, 0, cyl([0, 0, f1], [0, 0, f2], .0125, 14))); for (const q of [f1, f2]) { p(Ch, at(fx, 0, q, cyl([0, .02, 0], [0, fy + .065, 0], .014, 14)));
        p(Ch, at(fx, fy + .065, q, new THREE.SphereGeometry(.018, 12, 8))); p(Ch, at(fx, 0, q, RB(.5, .025, .05, .008).translate(0, .0125, 0)));
        for (const s of [-1, 1]) p(Rb, at(fx + s * .23, 0, q, cyl([0, 0, 0], [0, .01, 0], .02, 12))); }
      sol(fx - .25, 0, f2 - .03, fx + .25, 1.7, f1 + .03);
      for (let i = 0; i < 5; i++) { const q = f1 - .12 - i * .26, wid = .42 + .04 * hash(i, 9), len = .85 + .25 * hash(i, 10), r = .1 * (hash(i, 11) - .5);
        p(cloth[(i + 1) % 3], at(fx, fy, q, garment(len, wid, .07, i + 40), r)); p(Ok, at(fx, fy, q, hangerBar(wid), r)); p(Ch, at(fx, fy, q, hook().rotateY(PI / 2), r)); }
      stack(-1.0, plinth(-1.0, -1.3, .7, .55, .45), -1.3, 5, 81, .15); stack(-1.45, plinth(-1.45, -.85, .45, .45, .8), -.85, 3, 82, -.3);
      [sx, sy, sz, tx2, ty2, tz2] = [1.2, 3.25, -1.05, .3, .6, -1.4]; // between the floor rail and the plinths: dark cloth needs more light than linen
      light(-1.2, 3.25, -2.1, 110, 0, 1.2, B, 1.05, 6, 0xffcf96); // the wall rail, the whole length of it
    } else { // emptied after hours: bare concrete, uprights without shelves, chairs stacked to go, the counter left; one downlight left on over it
      shelving([-2.2, -1.1, 0, 1.1, 2.2], [], false); p(Ok, at(-1.65, 1.26, B + .19, RB(1.06, .026, .34, .004)));
      counter(-1.05, -1.55, 1.3);
      for (const [x, q, n, r] of [[1.35, -2.25, 5, .25], [1.6, -1.2, 3, -.4]]) for (let j = 0; j < n; j++) gardenChair(z, W2(x, q)[0], .052 * j, W2(x, q)[1], ry + r + .02 * Math.sin(j * 2.1), { color: 0x8f8778 });
      carton(.2, 0, -2.45, .5, .4, .4, Kr, .1); carton(.25, .4, -2.45, .42, .3, .36, Kr, -.05); carton(-.35, 0, -2.5, .44, .34, .36, Iv, .4);
      [sx, sy, sz, tx2, ty2, tz2] = [-1.2, 3.25, -2.1, -1.05, .9, -1.55];
    }
    for (const [m, g] of L) add(m, put(g, cx, 0, zw, ry));
    if (kind === 'empty') light(sx, sy, sz, 40, tx2, ty2, tz2, .55, 5, 0xffb870); else light(sx, sy, sz, kind === 'clothes' ? 150 : 75, tx2, ty2, tz2, kind === 'clothes' ? 1 : .9, 7, 0xffcf96); // the shop's bright spot (over the counter alone when emptied)
  }
  const signs = [0xff8fb8,0xffb060, 0xffd28a, 0xff9a8a, 0xe8a0ff], PD = .25; // PD: how far the piers and fascias stand off the wall
  for (const [zw, k] of [[24.4, 1], [49.6, -1]]) {
    const Z = (a, b) => [Math.min(zw + k * a, zw + k * b), Math.max(zw + k * a, zw + k * b)];
    const pier = (xa, xb) => { const [p1, p2] = Z(0, PD); box(W, xa, 0, p1, xb, 4.1, p2); // a pier between two shops, skirted round its three faces
      skirt((k > 0 ? [[xb, zw], [xb, zw + PD], [xa, zw + PD], [xa, zw]] : [[xa, zw], [xa, zw - PD], [xb, zw - PD], [xb, zw]]).map(([a, b]) => [a, 0, b])); };
    pier(-26, -25.6);
    for (let i = 0; i < 5; i++) { // shop fronts
      const x0 = -25.6 + 5.4 * i, cx = x0 + 2.3, open = isOpen(i, k);
      pier(x0 + 4.6, x0 + 5);
      beam(z, [[x0, 4.1, zw + k * PD / 2], [x0 + 4.6, 4.1, zw + k * PD / 2]], { w: PD, d: .8, color: 0x57514a }); // the fascia, 3.3 to 4.1
      const n = (i + (k > 0) * 2) % 5; neonSign(z, cx, 3.68, zw + k * PD, k > 0 ? 0 : Math.PI, { strokes: SIGNS[(i * 2 + (k > 0)) % 5], color: signs[n], k: 4 }); // the sign on the fascia
      let [z1, z2] = Z(0, .06);
      if (open) shop(cx, zw, k, k > 0 ? 'linen' : i ? 'empty' : 'clothes'); // a glazed front onto a shallow lit room
      else { // shuttered: a roller shutter between the piers, its coil hidden behind the fascia; one left a hand's width up on the dark
        const ajar = k > 0 && i === 3;
        shutter(z, cx, 0, zw, k > 0 ? 0 : Math.PI, { w: 4.41, h: 3.3, hood: false, open: ajar ? .085 : 0, color: [0x7d8286, 0x5f6a6e, 0x9a9282][(i + k + 2) % 3] });
        if (ajar) { const [d1, d2] = Z(0, .012); block(dark, x0, 0, d1, x0 + 4.6, .4, d2); } // the unlit shop behind
      }
      [z1, z2] = Z(0, 1.3); box(W, x0 - .4, 4.1, z1, x0 + 5, 4.35, z2); // upper gallery
      troffer(z, cx, 4.1, zw + k * .85, 0, { w: .6, l: .6, on: false }); // dead fittings in the gallery's soffit
      if (i === 1 || i === 3) door(z, cx, 4.35, zw, k > 0 ? 0 : Math.PI, { color: 0x6f7c80, frame: 0xd9d2c4 }); // service doors on the gallery
    }
    railing(z, [[-26, 4.35, zw + k * 1.24], [1, 4.35, zw + k * 1.24]]); // the gallery's edge
  }
  skirt([[-26, 0, 24.4], [-26.6, 0, 24.4], [-26.6, 0, 34]]); skirt([[-26.6, 0, 38], [-26.6, 0, 49.6], [-26, 0, 49.6]]); // west wall
  skirt([[1.8, 0, 44.4], [1.8, 0, 24.4], [1, 0, 24.4]]); skirt([[1, 0, 49.6], [1.8, 0, 49.6], [1.8, 0, 45.6]]); // east wall, stopping at the door frame
  block(neon(0xffedc0, 4), -20, h - .02, 35.5, -5, h + .01, 38.5); for (const x of [-19, -12.4, -5.8]) lit(z, x, h - .1, 37, 170, [x, 0, 37], 1.1, 16, 0xffedc4); // skylight
  for (const x of [-18, -7]) { // a palm in a round planter under the skylight, a bench either side
    palmPlanter(z, x, 0, 37, 0, { radius: 1.05 });
    for (const zc of [34.7, 39.3]) mallBench(z, x, 0, zc, 0, { length: 2 });
  }
  bin(z, -12.5, 0, 35.05, 0, { color: 0x4a4038 }); bin(z, 1.3, 0, 47.4, 0, { color: 0x4a4038 }); // between the benches; by the hotel door
  signPost(z, -24.9, 0, 39, Math.PI / 2, { color: 0x3b4a52 }); // a wayfinding sign beside the soft play opening, left blank
  pottedPlant(z, 1.3, 0, 43.75); pottedPlant(z, -26.15, 0, 33.55); pottedPlant(z, -26.15, 0, 38.45, 2); // by the hotel door and the soft play opening
}