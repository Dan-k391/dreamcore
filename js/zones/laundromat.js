// The all-night laundromat, 3 a.m., nobody there: a warm room behind a full-width shopfront onto a wet, dark street.
// Far from everything (x 595-605, z -608..-594; the street it looks onto to z -570). Reached by the entry doorway in the back wall.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { dry, zones, defZone, scene } from '../core.js';
import { M, neon } from '../mat.js';
import { add, block, box, solid, round, turned, put, spot, solidAt, onSun, RoundedBoxGeometry } from '../build.js';
import { troffer, streetLamp } from '../props/lights.js';
import { door, shopfront, drain, bin } from '../props/metalwork.js';
import { kerb } from '../props/structure.js';

const PI = Math.PI, V2 = (a, b) => new THREE.Vector2(a, b), V3 = (a, b, c) => new THREE.Vector3(a, b, c);
const RB = (w, h, d, r, s = 3) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg); // normal (dy, -dr): listed up the axis faces out, down it faces in
const fwd = g => g.rotateX(PI / 2); // a lathe's axis turned to +z: its profile's y becomes the depth toward the front
const cyl = (a, b, r, seg = 8) => { const A = V3(...a), B = V3(...b), d = B.clone().sub(A), g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize())); return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); };
const loop = (pts, r, seg = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V3(...p)), true, 'centripetal'), pts.length * 4, r, seg, true);
const rrPts = (w, d, r, y, n = 4) => { const o = []; for (const [cx, cz, a0] of [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, .5], [-w / 2 + r, -d / 2 + r, 1], [w / 2 - r, -d / 2 + r, 1.5]])
  for (let i = 0; i <= n; i++) { const a = (a0 + .5 * i / n) * PI; o.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]); } return o; }; // a rounded rectangle in plan
function rrect(w, h, r) { const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.absarc(x, -y, r, -PI / 2, 0); s.lineTo(w / 2, y); s.absarc(x, y, r, 0, PI / 2);
  s.lineTo(-x, h / 2); s.absarc(-x, y, r, PI / 2, PI); s.lineTo(-w / 2, -y); s.absarc(-x, -y, r, PI, 1.5 * PI); return s; }
// a pressed front panel w x h (centred on x, from y 0) with a round port of radius `hole` at height hy, its edges rolled over `bev`; front at z 0
const panel = (w, h, r, hole, hy, d, bev) => { const s = rrect(w, h, r); s.holes.push(new THREE.Path().absarc(0, hy - h / 2, hole, 0, 2 * PI, true));
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 56 }).translate(0, h / 2, -d - bev); };
const kit = () => { const L = []; return { L, p: (m, g, own = false) => L.push([m, g, own]), place: (x, y, zc, ry = 0) => { for (const [m, g, own] of L) add(m, put(g.clone(), x, y, zc, ry), own); } }; };
const smooth = g => { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-5); g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };

defZone('lW', { music: 'radio', ...dry, sky: 'night', air: .03, grp: 'w', k: .24, exp: .34, fog: [.012, .014, .022, .005], bloom: .36, wet: .05, hum: .55, box: [595.3, -607.9, 604.7, -594], probe: [600, 1.6, -600], env: [[595.5, 0, -606], [604.5, 3, -594]] });
defZone('lX', { music: 'lot', ...dry, sky: 'night', air: .5, grp: 'w', k: 1, exp: .34, fog: [.012, .016, .03, .004], bloom: .4, wet: .3, box: [570, -594, 630, -566], probe: [600, 1.6, -590] });

const z = zones.lW, zx = zones.lX, X0 = 595.5, X1 = 604.5, ZB = -606, ZF = -594, HT = 3;
const Fl = M(z, 'terrazzo', { color: 0x776c5b, roughness: .2, macro: .24, grime: .32, dirt: .6, dirtCol: [.36, .33, .28] }); // damp sheen, scuffed where the room is walked
const Wl = M(z, 'plaster', { color: 0x8c7f67, dirt: .4, grime: .16 }), Tl = M(z, 'poolTile', { color: 0x93a48e, roughness: .16, dirt: .6, dirtCol: [.5, .46, .38] });
const Cap = M(z, 'paintedSteel', { color: 0x8a9a84, roughness: .28, wear: .4, edgeCol: [.86, .88, .82] }), Dr = M(z, 'plaster', { color: 0x2b2722, grime: .3 });
const En = M(z, 'paintedSteel', { color: 0xcdc6b5, roughness: .3, wear: .3, edgeCol: [.78, .76, .72], dirt: .45, dirtCol: [.44, .41, .35] }); // stove enamel of the machines
const Br = M(z, 'brushedSteel', { roughness: .3, dirt: .3, dirtCol: [.42, .4, .36] }), Ch = M(z, 'chrome'), Gl = M(z, 'glass'), Rb = M(z, 'rubber', { color: 0x1d1c1b, roughness: .55 });
const Dk = M(z, 'hardPlastic', { color: 0x2b2a28, roughness: .38, wear: .2 }), Lt = M(z, 'hardPlastic', { color: 0xc0baab, roughness: .32, wear: .25 });
const Dc = M(z, 'paintedSteel', { color: 0x25282b, roughness: .36, wear: .45, edgeCol: [.42, .42, .4], dirt: .4, dirtCol: [.4, .38, .34] }); // dark cabinets, rails, frames
const lampLens = neon(0xffb45a, 3.2);

// ===== the room: terrazzo floor, painted walls over a tiled dado, a suspended ceiling =====
box(Fl, X0 - .2, -.2, ZB - .15, X1 + .2, 0, ZF);
box(M(z, 'ceilingTile', { color: 0x8e8472, dirt: .3 }), X0 - .2, HT, ZB - .15, X1 + .2, HT + .2, ZF);
box(Wl, X0 - .2, 0, ZB - .15, X0, HT, ZF); box(Wl, X1, 0, ZB - .15, X1 + .2, HT, ZF); // west, east
box(Wl, X0 - .2, 0, ZB - .15, 596.4, HT, ZB); box(Wl, 597.6, 0, ZB - .15, X1 + .2, HT, ZB); box(Wl, 596.4, 2.34, ZB - .15, 597.6, HT, ZB); // back, the entry's opening
const D = 1.25, t = .012; // the dado: 100 mm glazed tiles to 1.25 m, a rounded capping along the top
block(Tl, X0, 0, ZB, X0 + t, D, ZF); block(Tl, X1 - t, 0, ZB, X1, D, ZF);
for (const [a, b] of [[X0 + t, 596.4], [597.6, 600.14], [602.86, X1 - t]]) block(Tl, a, 0, ZB, b, D, ZB + t);
add(Cap, cyl([X0 + t - .003, D, ZB + t], [X0 + t - .003, D, ZF], .011, 10)); add(Cap, cyl([X1 - t + .003, D, ZB + t], [X1 - t + .003, D, ZF], .011, 10));
for (const [a, b] of [[X0 + t, 596.4], [597.6, 600.14], [602.86, X1 - t]]) add(Cap, cyl([a, D, ZB + t - .003], [b, D, ZB + t - .003], .011, 10));
// the entry: a 1.0 x 2.24 m opening in a steel frame, a dark recess 1.5 m deep behind it, open onto the dark passage from the hotel
door(z, 597, 0, ZB - .075, 0, { leaf: false, frame: 0xd8d2c4 });
box(Fl, 596.3, -.2, -607.85, 597.7, 0, ZB - .15); box(Dr, 596.3, 0, -607.85, 596.5, 2.44, ZB - .15); box(Dr, 597.5, 0, -607.85, 597.7, 2.44, ZB - .15);
box(Dr, 596.3, 2.24, -607.85, 597.7, 2.44, ZB - .15); // open at its far end onto the hotel's passage (zones/passages.js)
// the shopfront, full width and height, its door locked; the street beyond
shopfront(z, 600, 0, ZF, 0, { w: X1 - X0, h: HT, th: 2.3, door: 1, dx: 2.9, open: 0 });
// ceiling fittings on the 600 mm grid: one dead over the dryers' corner, one dimmer by the window
for (const x of [597.3, 600.3, 602.7]) for (const zc of [-603.6, -600, -596.4]) // the east row a tile in from the washers, so its light reaches into the open drum
  troffer(z, x, HT, zc, 0, x === 602.7 && zc === -603.6 ? { on: false } : { power: x === 597.3 && zc === -596.4 ? 14 : 36 });

// ===== front-loading washer: own frame, front toward +z, feet at y 0 =====
// An enamelled cabinet (side and top panels with rolled edges, a pressed front panel round the port) on four screw feet, a brushed console
// with a soap drawer, two blank dials and a coin slot; the stainless drum with three lifters seen through a rubber boot; the door a chrome
// ring round a domed glass on a hinge block, a pull on the other side. The door is its own kit, built about its hinge, so it can stand open.
const CY = .45; // the port's centre above the feet
function washerKits() {
  const K = kit(), Dd = kit();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const fx = sx * .29, fz = sz * .27;
    K.p(Rb, lathe([[0, 0], [.023, 0], [.025, .004], [.022, .011], [0, .011]], 16).translate(fx, 0, fz));
    K.p(Ch, new THREE.CylinderGeometry(.008, .008, .034, 10).translate(fx, .028, fz)); K.p(Ch, new THREE.CylinderGeometry(.015, .015, .008, 6).translate(fx, .036, fz)); }
  for (const sx of [-1, 1]) K.p(En, RB(.022, .94, .7, .007).translate(sx * .329, .51, 0));
  K.p(En, RB(.68, .024, .72, .009).translate(0, .992, .005)); K.p(Dk, new THREE.BoxGeometry(.636, .06, .01).translate(0, .07, .3)); // lid; toe kick
  K.p(En, panel(.636, .7, .012, .172, CY - .1, .012, .003).translate(0, .1, .352));
  K.p(Br, RB(.636, .17, .06, .006).translate(0, .89, .325)); K.p(Dk, new THREE.BoxGeometry(.63, .008, .012).translate(0, .803, .34));
  K.p(Lt, RB(.2, .08, .03, .007).translate(-.19, .893, .362)); K.p(Dk, RB(.09, .016, .012, .005).translate(-.19, .862, .377)); // soap drawer and its finger pull
  for (const kx of [.02, .12]) { K.p(Ch, fwd(lathe([[.034, 0], [.034, .002], [.031, .003]], 32)).translate(kx, .89, .355));
    K.p(Dk, fwd(lathe([[.026, .002], [.026, .008], [.021, .012], [.019, .028], [.017, .031], [0, .032]], 24)).translate(kx, .89, .355));
    K.p(Lt, new THREE.BoxGeometry(.003, .014, .002).translate(kx, .9, .3875)); } // the pointer line on each blank dial
  K.p(Ch, RB(.07, .13, .01, .003).translate(.255, .89, .359)); K.p(Rb, RB(.007, .045, .004, .0015).translate(.255, .905, .3635));
  K.p(Ch, fwd(lathe([[.012, 0], [.012, .006], [.009, .009], [0, .01]], 16)).translate(.255, .847, .364)); // coin plate, slot, return button
  K.p(Rb, fwd(lathe([[.18, .352], [.173, .345], [.159, .331], [.153, .313], [.157, .297], [.172, .287], [.236, .283]], 48)).translate(0, CY, 0)); // the boot
  K.p(Br, fwd(lathe([[.236, .283], [.236, -.14], [.229, -.16], [.2, -.168], [.04, -.168], [.03, -.16], [0, -.16]], 48)).translate(0, CY, 0)); // the drum
  for (let k = 0; k < 3; k++) { const a = PI / 2 + k * 2 * PI / 3; K.p(Br, RB(.055, .032, .38, .012).rotateZ(a - PI / 2).translate(Math.cos(a) * .222, CY + Math.sin(a) * .222, .06)); }
  Dd.p(Ch, new THREE.TorusGeometry(.184, .022, 12, 64).scale(1, 1, .8).translate(0, CY, .386));
  Dd.p(Dk, new THREE.TorusGeometry(.207, .007, 6, 64).translate(0, CY, .372)); Dd.p(Dk, new THREE.TorusGeometry(.161, .008, 6, 48).translate(0, CY, .398));
  Dd.p(Gl, new THREE.SphereGeometry(.42, 40, 4, 0, 2 * PI, 0, Math.asin(.165 / .42)).rotateX(PI / 2).translate(0, CY, -.006));
  Dd.p(Ch, RB(.036, .11, .03, .009).translate(-.212, CY, .372)); for (const hy of [-.04, .04]) Dd.p(Ch, new THREE.CylinderGeometry(.009, .009, .03, 12).translate(-.226, CY + hy, .372));
  Dd.p(Ch, RB(.03, .09, .03, .011).translate(.206, CY, .392)); Dd.p(Dk, RB(.018, .06, .01, .004).translate(.21, CY, .375));
  return [K, Dd];
}
const HX = -.226, HZ = .372; // the door's hinge axis
const swing = (g, a) => g.translate(-HX, 0, -HZ).rotateY(a).translate(HX, 0, HZ);

// ===== a folded towel: cloth in layers, its folded edge round, its open edge two soft lobes, wrinkled and sagging into what it lies on =====
// w across (x), d deep (z), t thick, feet at y 0; sag(x, z): how far below 0 its underside settles there. Seeded so no two are alike.
function towel(w, d, t, seed, sag = () => 0) {
  const s = new THREE.Shape(), r = t / 2, q = t / 4, n = 14;
  s.moveTo(-w / 2 + r, 0); for (let i = 1; i <= n; i++) s.lineTo(-w / 2 + r + (w - r - q) * i / n, 0);
  s.absarc(w / 2 - q, q, q, -PI / 2, PI / 2); s.absarc(w / 2 - q - .004, 3 * q, q, -PI / 2, PI / 2);
  for (let i = n - 1; i >= 0; i--) s.lineTo(-w / 2 + r + (w - r - q - .004) * i / n, t); s.absarc(-w / 2 + r, r, r, PI / 2, 1.5 * PI);
  let g = new THREE.ExtrudeGeometry(s, { depth: d, steps: 10, bevelEnabled: true, bevelThickness: t * .35, bevelSize: t * .14, bevelSegments: 3, curveSegments: 6 }).translate(0, 0, -d / 2);
  const p = g.attributes.position, h = k => { const v = Math.sin(k * 127.1 + seed * 311.7) * 43758.5; return v - Math.floor(v); }, ph = [0, 1, 2, 3].map(h);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), zz = p.getZ(i), top = y / t;
    let dy = t * .14 * Math.sin(x * 31 + ph[0] * 6) * Math.sin(zz * 23 + ph[1] * 6) + t * .07 * Math.sin(x * 71 + zz * 47 + ph[2] * 6); // loose wrinkles
    dy += top > .6 ? -.004 * Math.exp(-(((x - (ph[3] - .5) * .02) / .014) ** 2)) : 0; // the soft crease of the last fold across the top
    dy += top * t * .12 * (1 - (2 * zz / d) ** 2); // the middle puffs where the layers part
    p.setY(i, y + dy * (.4 + .6 * top) - sag(x, zz) * (1 - .35 * top)); }
  return smooth(g);
}

{ // the row of eight washers on a tiled plinth along the east wall, fronts toward the room (-x); the sixth stands open with towels in its drum
  const [K, Dd] = washerKits(), ry = -PI / 2, x = 604.1, y = .12, T1 = M(z, 'loopCarpet', { color: 0xfffaf0, macro: .06, grime: 0, roughness: .95, emit: [0xffe6c0, .12] }), T2 = M(z, 'loopCarpet', { color: 0xc4d8e8, macro: .06, grime: 0, roughness: .95, emit: [0xd8dcd8, .1] }); // emit: the light the steel drum bounces onto them, which its shadow cuts off
  box(Tl, 603.7, 0, -602.92, X1 - t, y, -597.08); add(Cap, cyl([603.7, y - .002, -602.92], [603.7, y - .002, -597.08], .01, 10));
  solid(603.7, y, -602.9, X1, 1.13, -597.1);
  for (let i = 0; i < 8; i++) { const zc = -602.52 + i * .72; K.place(x, y, zc, ry);
    if (i !== 5) { Dd.place(x, y, zc, ry); continue; }
    const a = -1.35; for (const [m, g, own] of Dd.L) add(m, put(swing(g.clone(), a), x, y, zc, ry), own);
    const c = V3(.2, 0, 0).applyAxisAngle(V3(0, 1, 0), a), [px, pz] = spot(x, zc, ry, HX + c.x, HZ + c.z); turned(px, pz, .21, .03, ry + a, y + CY - .21, y + CY + .21);
    const dz = (xx, k) => (.236 - Math.sqrt(Math.max(0, .236 ** 2 - xx * xx))) * k, B = CY - .236 + .004; // the drum's curve under each layer
    for (const [m, w, d, tk, ox, oy, oz, tr, k, sd] of [[T1, .27, .2, .042, .006, 0, .14, .04, 1, 1], [T1, .26, .19, .04, -.004, .04, .15, -.05, .55, 2], [T2, .25, .18, .038, .008, .078, .155, .1, .3, 3], [T1, .24, .17, .036, -.006, .114, .165, -.12, .1, 4]]) {
      const g = towel(w, d, tk, sd, (xx) => -dz(xx + ox, k)).rotateY(tr).translate(ox, B + oy, oz); add(m, put(g, x, y, zc, ry)); }
  }
  drain(z, 603.05, 0, -600, PI / 2, { l: .5, w: .15 }); // the floor gully in front of the row
}

// ===== tumble dryers: two stacks of two, built into the back wall, their faces flush with a plastered bulkhead =====
// Each: a brushed face round a large port, a dark control strip with blank dials and a coin slot, a lint drawer under the door, a deep
// drum with baffles behind a rubber boot, a flat glass door in a chrome ring on a hinge block with a long pull. Own frame: front at z 0.
{ const K = kit(), DW = .84, DH = .92, cy = .43;
  K.p(Br, panel(.82, .78, .01, .272, cy, .012, .003));
  K.p(Dc, RB(.82, .125, .03, .006).translate(0, .855, -.015));
  for (const kx of [-.25, -.15]) { K.p(Ch, fwd(lathe([[.03, 0], [.03, .002], [.027, .003]], 32)).translate(kx, .855, 0));
    K.p(Dk, fwd(lathe([[.022, .002], [.022, .007], [.018, .011], [.016, .024], [0, .026]], 24)).translate(kx, .855, 0)); }
  K.p(Ch, RB(.12, .07, .01, .003).translate(.25, .855, .002)); K.p(Rb, RB(.045, .007, .004, .0015).translate(.25, .865, .007));
  K.p(Dk, RB(.42, .05, .012, .006).translate(0, .075, .004)); K.p(Rb, RB(.1, .012, .012, .005).translate(0, .06, .012)); // lint drawer and its pull
  K.p(Rb, fwd(lathe([[.276, .002], [.268, -.01], [.264, -.025], [.28, -.035], [.322, -.04]], 56)).translate(0, cy, 0));
  K.p(Br, fwd(lathe([[.322, -.04], [.322, -.6], [.31, -.625], [.05, -.63], [0, -.625]], 56)).translate(0, cy, 0));
  for (let k = 0; k < 3; k++) { const a = PI / 2 + k * 2 * PI / 3; K.p(Br, RB(.08, .05, .5, .02).rotateZ(a - PI / 2).translate(Math.cos(a) * .3, cy + Math.sin(a) * .3, -.32)); }
  K.p(Ch, new THREE.TorusGeometry(.3, .026, 12, 72).scale(1, 1, .7).translate(0, cy, .03));
  K.p(Dk, new THREE.TorusGeometry(.276, .008, 6, 64).translate(0, cy, .042)); K.p(Gl, new THREE.CircleGeometry(.278, 64).translate(0, cy, .04));
  K.p(Ch, RB(.04, .14, .035, .01).translate(-.33, cy, .018)); K.p(Ch, RB(.028, .2, .03, .011).translate(.318, cy, .05)); // hinge block, pull
  for (const x of [601.08, 601.92]) for (const yb of [.25, .25 + DH]) K.place(x, yb, -605.3, 0);
  // the bulkhead the stacks sit in: a tiled plinth, plastered cheeks and a soffit to the ceiling, the cavity behind closed
  box(Tl, 600.24, 0, ZB, 602.84, .25, -605.32); box(Wl, 600.14, 0, ZB, 600.66, HT, -605.3); box(Wl, 602.34, 0, ZB, 602.86, HT, -605.3);
  box(Wl, 600.24, .25 + 2 * DH, ZB, 602.84, HT, -605.3); block(Dc, 600.66, .25, -605.95, 602.34, .25 + 2 * DH, -605.94);
  block(Dc, 600.66, .25 + DH - .004, -605.32, 602.34, .25 + DH + .004, -605.31); block(Dc, 601.495, .25, -605.32, 601.505, .25 + 2 * DH, -605.31); // the seams between the units
  solid(600.66, 0, ZB, 602.34, .25 + 2 * DH, -605.3);
}

// ===== folding table: a laminated top with a rolled edge on a welded square-tube frame, six legs on glides =====
{ const x = 600, zc = -600.4, L = 3, Tt = M(z, 'hardPlastic', { color: 0x9e917a, roughness: .34, wear: .45, edgeCol: [.9, .87, .8], macro: .15 });
  add(Tt, RB(.8, .03, L, .009).translate(x, .885, zc));
  for (const sx of [-1, 1]) { add(Dc, RB(.03, .06, L - .1, .005).translate(x + sx * .34, .84, zc)); add(Dc, RB(.025, .025, L - .1, .004).translate(x + sx * .34, .16, zc)); }
  for (const dz of [-1.42, 0, 1.42]) { add(Dc, RB(.65, .05, .025, .005).translate(x, .845, zc + dz));
    for (const sx of [-1, 1]) { add(Dc, RB(.04, .82, .04, .006).translate(x + sx * .34, .43, zc + dz)); add(Rb, lathe([[0, 0], [.024, 0], [.025, .006], [.02, .02], [0, .02]], 16).translate(x + sx * .34, 0, zc + dz)); } }
  solid(x - .4, .86, zc - L / 2, x + .4, .9, zc + L / 2); for (const dz of [-1.42, 0, 1.42]) for (const sx of [-1, 1]) round(x + sx * .34, zc + dz, .03, 0, .86);
}

// ===== moulded plastic chairs bolted to a beam along the west wall, facing the machines =====
// Each shell a 7 mm moulding: a rolled front lip, a dished seat, the back swept up and wrapping a little at the sides; on a cast bracket
// to a rectangular beam, which stands on two posts with bolted foot plates.
{ const C = M(z, 'hardPlastic', { color: 0x5c9694, roughness: .4, wear: .4, edgeCol: [.62, .78, .76], macro: .12, dirt: .2 });
  const cl = [[.215, .405], [.222, .43], [.2, .445], [.12, .444], [.02, .437], [-.09, .428], [-.17, .436], [-.21, .47], [-.226, .55], [-.24, .68], [-.252, .8], [-.256, .845]];
  const nrm = cl.map((p, i) => { const a = cl[Math.max(0, i - 1)], b = cl[Math.min(cl.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; });
  const s = new THREE.Shape(cl.map(([a, b]) => V2(a, b))); for (let i = cl.length - 1; i >= 0; i--) s.lineTo(cl[i][0] - nrm[i][0] * .007, cl[i][1] - nrm[i][1] * .007);
  let sh = new THREE.ExtrudeGeometry(s, { depth: .43, steps: 8, bevelEnabled: true, bevelThickness: .004, bevelSize: .0028, bevelSegments: 2 }).rotateY(-PI / 2).translate(.215, 0, 0);
  const p = sh.attributes.position; for (let i = 0; i < p.count; i++) { const u = (2 * p.getX(i) / .43) ** 2, yy = p.getY(i);
    p.setY(i, yy + .012 * u * (yy < .5 ? 1 : 0)); p.setZ(i, p.getZ(i) + .03 * u * Math.max(0, Math.min(1, (yy - .47) / .3))); }
  sh = smooth(sh);
  const N = 6, pitch = .56, z1 = -601.58, x = X0 + .33, ry = PI / 2;
  for (let k = 0; k < N; k++) { const zc = z1 + k * pitch; add(C, put(sh.clone(), x, 0, zc, ry)); add(Dc, RB(.3, .05, .07, .008).translate(x - .02, .395, zc)); }
  add(Dc, RB(.08, .06, (N - 1) * pitch + .4, .006).translate(x - .02, .345, z1 + (N - 1) * pitch / 2));
  for (const zc of [z1 + .28, z1 + (N - 1) * pitch - .28]) { add(Dc, RB(.06, .33, .06, .006).translate(x - .02, .165, zc)); add(Dc, RB(.4, .012, .12, .004).translate(x - .02, .006, zc));
    for (const bx of [-.15, .15]) add(Ch, new THREE.CylinderGeometry(.011, .011, .008, 6).translate(x - .02 + bx, .016, zc)); }
  const za = z1 - .23, zb = z1 + (N - 1) * pitch + .23; solid(X0, 0, za, x + .23, .45, zb); solid(X0, .45, za, x - .2, .86, zb);
}

// ===== wire laundry carts on castors, a hanging rail at one end =====
function cart(x, zc, ry) {
  const K = kit(), w = .64, d = .44, r = .0125;
  for (const [cx, cz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) { const tall = cx < 0;
    K.p(Ch, cyl([cx, .135, cz], [cx, tall ? 1.6 : .8, cz], r, 10)); K.p(Ch, new THREE.SphereGeometry(r, 10, 6).translate(cx, .8, cz));
    K.p(Br, RB(.07, .006, .07, .002).translate(cx, .13, cz)); K.p(Br, new THREE.CylinderGeometry(.015, .015, .02, 10).translate(cx, .118, cz)); // swivel plate and race
    for (const s of [-1, 1]) K.p(Br, RB(.004, .07, .045, .0015).translate(cx + s * .018, .08, cz - .012)); // the fork's two cheeks
    K.p(Rb, new THREE.CylinderGeometry(.05, .05, .026, 24).rotateZ(PI / 2).translate(cx, .052, cz - .02)); K.p(Lt, new THREE.CylinderGeometry(.02, .02, .03, 12).rotateZ(PI / 2).translate(cx, .052, cz - .02)); }
  K.p(Ch, cyl([-w / 2, 1.6, -d / 2], [-w / 2, 1.6, d / 2], r, 10)); for (const s of [-1, 1]) K.p(Ch, new THREE.SphereGeometry(r, 10, 6).translate(-w / 2, 1.6, s * d / 2));
  for (const yy of [.14, .42, .6]) K.p(Ch, loop(rrPts(w, d, .03, yy), yy === .14 ? .009 : .004)); K.p(Ch, loop(rrPts(w, d, .03, .8), .007));
  for (let k = 1; k < 14; k++) { const xx = -w / 2 + w * k / 14; K.p(Ch, cyl([xx, .42, -d / 2], [xx, .42, d / 2], .0028, 6)); for (const s of [-1, 1]) K.p(Ch, cyl([xx, .42, s * d / 2], [xx, .8, s * d / 2], .0028, 6)); }
  for (let k = 1; k < 10; k++) { const zz = -d / 2 + d * k / 10; K.p(Ch, cyl([-w / 2, .42, zz], [w / 2, .42, zz], .0028, 6)); for (const s of [-1, 1]) K.p(Ch, cyl([s * w / 2, .42, zz], [s * w / 2, .8, zz], .0028, 6)); }
  K.place(x, 0, zc, ry); turned(x, zc, w / 2 + .02, d / 2 + .02, ry, 0, 1.62);
}
cart(602.55, -596.3, .35); cart(598.7, -604.7, 1.45);

// ===== the change machine and the vending box: plain dark cabinets, one warm lamp each =====
{ const K = kit(); // vending box, front +z: a dark glazed door with shelves inside, a blank keypad, a coin slot, a lamp, the delivery flap
  K.p(Dc, RB(.86, 1.82, .74, .014).translate(0, .91, 0)); K.p(Dk, new THREE.BoxGeometry(.84, .06, .02).translate(0, .03, .366));
  K.p(Dk, new THREE.BoxGeometry(.52, 1.02, .01).translate(-.1, 1.2, .362));
  for (const sy of [.8, 1.06, 1.32, 1.58]) K.p(Dc, RB(.5, .012, .03, .004).translate(-.1, sy, .36));
  K.p(Gl, new THREE.BoxGeometry(.54, 1.04, .006).translate(-.1, 1.2, .376)); for (const [gw, gh, gx, gy] of [[.56, .014, -.1, .68], [.56, .014, -.1, 1.72], [.014, 1.05, -.375, 1.2], [.014, 1.05, .175, 1.2]]) K.p(Rb, RB(gw, gh, .012, .005).translate(gx, gy, .376));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) K.p(Ch, RB(.034, .024, .012, .005).translate(.24 + (c - 1) * .045, 1.3 - r * .036, .374));
  K.p(Ch, RB(.08, .12, .01, .004).translate(.27, 1.05, .373)); K.p(Rb, RB(.007, .045, .004, .0015).translate(.27, 1.06, .378));
  K.p(lampLens, RB(.09, .045, .012, .008).translate(.25, 1.52, .3735)); K.p(Ch, RB(.1, .055, .006, .003).translate(.25, 1.52, .369));
  K.p(Ch, fwd(lathe([[.017, 0], [.017, .006], [.014, .01], [0, .011]], 20)).translate(.3, .85, .37));
  K.p(Dk, new THREE.BoxGeometry(.58, .2, .01).translate(-.08, .3, .367)); // the flap's housing 2 mm proud of the cabinet K.p(Dc, RB(.56, .18, .014, .005).rotateX(-.08).translate(-.08, .3, .376));
  K.place(595.95, 0, -604.5, PI / 2); solidAt(595.95, 0, -604.5, PI / 2, 0, .91, 0, .86, 1.82, .74);
  const C = kit(); // change machine on the wall, front +z: a note slot in its bezel, a coin cup, the lamp, the lock
  C.p(Dc, RB(.42, .64, .26, .012).translate(0, 0, 0)); C.p(Dk, RB(.15, .04, .02, .008).translate(0, .16, .13)); C.p(Rb, RB(.11, .006, .004, .002).translate(0, .16, .141));
  C.p(Br, fwd(lathe([[.075, .0], [.075, .005], [.07, .006], [.065, -.03], [0, -.032]], 32)).translate(0, -.2, .13));
  C.p(lampLens, RB(.07, .035, .012, .007).translate(0, .26, .13)); C.p(Ch, fwd(lathe([[.015, 0], [.015, .005], [.012, .009], [0, .01]], 20)).translate(.14, -.02, .13));
  C.place(595.64, 1.25, -603.25, PI / 2); solidAt(595.64, 1.25, -603.25, PI / 2, 0, 0, 0, .42, .64, .26);
}

// ===== a wall clock with no hands, a noticeboard with blank cards =====
{ const K = kit(), Face = M(z, 'hardPlastic', { color: 0xcfc7b6, roughness: .5 });
  K.p(Dk, fwd(lathe([[.17, 0], [.17, .03], [.166, .04]], 64))); K.p(Dk, new THREE.TorusGeometry(.162, .013, 10, 64).translate(0, 0, .04));
  K.p(Face, new THREE.CircleGeometry(.152, 64).translate(0, 0, .03)); K.p(Gl, new THREE.CircleGeometry(.152, 64).translate(0, 0, .048));
  for (let k = 0; k < 60; k++) { const a = k / 60 * 2 * PI, big = k % 5 === 0; K.p(Dk, new THREE.BoxGeometry(big ? .006 : .0025, big ? .024 : .009, .001).translate(0, .136 - (big ? .012 : .0045), .0305).rotateZ(a)); }
  K.p(Dk, fwd(lathe([[.008, 0], [.008, .004], [0, .006]], 16)).translate(0, 0, .03)); // the boss where the hands would be
  K.place(X0 + t, 2.35, -602.4, PI / 2);
  const B = kit(), Felt = M(z, 'loopCarpet', { color: 0x56604c, macro: .1, grime: .2 }), Al = M(z, 'anodised', { color: 0xb8b4aa, roughness: .35 }), Card = M(z, 'hardPlastic', { color: 0xb9b19f, roughness: .75, detail: .1 });
  B.p(Felt, new THREE.BoxGeometry(.96, .62, .012).translate(0, 0, .006));
  for (const [w, h, x, y] of [[1.0, .022, 0, .32], [1.0, .022, 0, -.32], [.022, .66, -.49, 0], [.022, .66, .49, 0]]) B.p(Al, RB(w, h, .024, .006).translate(x, y, .012));
  const pin = (x, y) => B.p(M(z, 'brass'), fwd(lathe([[.005, 0], [.005, .004], [.004, .007], [0, .0075]], 12)).translate(x, y, .0145));
  for (const [x, y, w, h, a] of [[-.3, .14, .15, .1, .03], [-.08, .17, .13, .09, -.05], [.2, .12, .15, .1, .02], [-.26, -.12, .1, .15, -.02], [.02, -.1, .15, .1, .06], [.3, -.15, .13, .09, -.03]]) {
    B.p(Card, RB(w, h, .0015, .0006, 1).rotateZ(a).translate(x, y, .0128)); pin(x - Math.sin(a) * h * .4, y + Math.cos(a) * h * .4); }
  B.place(X0 + t, 1.72, -599.95, PI / 2);
}

// ===== the street: a strip of wet pavement, a kerb, the road, one street lamp, darkness =====
{ const Pv = M(zx, 'concreteFloor', { color: 0x8c877e, roughness: .3, macro: .32, grime: .3 }), As = M(zx, 'asphalt', { roughness: .32, macro: .35, detail: .6 }), Fc = M(zx, 'concreteWall', { color: 0x4e4a45, dirt: .6 });
  box(Pv, 570, -.2, ZF, 630, 0, -591.125); kerb(zx, [[630, -.125, -591], [570, -.125, -591]], { color: 0xa09a90 });
  box(As, 570, -.45, -591, 630, -.125, -574.5); kerb(zx, [[570, -.125, -574.5], [630, -.125, -574.5]], { color: 0x8a857c });
  box(Pv, 570, -.3, -574.5, 630, 0, -571); box(Fc, 570, 0, -571, 630, 7, -570.6); // the far side: a blank, unlit front
  streetLamp(zx, 601.6, 0, -591.55, -PI / 2, { power: 260, reach: .95 }); bin(zx, 598.2, 0, -591.6);
  // unseen walls where the street runs into the dark: along its back either side of the shop, and across both ends (a run once left the level here)
  solid(570, -.5, -594.2, 595.3, 4, -594); solid(604.7, -.5, -594.2, 630, 4, -594); solid(569.8, -.5, -594.2, 570, 4, -570.6); solid(630, -.5, -594.2, 630.2, 4, -570.6);
}

// Drawn only when the camera is near (any pass, the probe bakes included): far away the whole place is out of sight anyway, and
// no other place's view pays for its meshes. Runs once the level is merged (onSun comes after merge).
onSun.push(() => {
  const mine = new Set([...z.mats, ...zx.mats, lampLens]), meshes = [];
  scene.traverse(o => { if (o.isMesh && mine.has(o.material)) meshes.push(o); });
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (r, sc, c, ...a) { prev.call(this, r, sc, c, ...a); const p = near.setFromMatrixPosition(c.matrixWorld), on = p.x > 555 && p.x < 645 && p.z > -640 && p.z < -550; for (const m of meshes) m.visible = on; };
});
const near = new THREE.Vector3();
