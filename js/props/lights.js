// Kit: light fittings (troffers, battens, panels, sconces, street and mast lamps, globes, step lights, neon, pool lights).
// Materials: js/tex/light.js. Convention, the yard and the inventory: docs/props.md.
import * as THREE from 'three';
import { V, H } from '../core.js';
import { M } from '../mat.js';
import { emitters, add as add0, box, round, lit, put, solidAt, fixture } from '../build.js';

const PI = Math.PI, v2 = (r, y) => new THREE.Vector2(r, y);
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
let tally = null; // cost(): triangles and materials one call of a fitting adds
const add = (m, g, own) => { if (tally) { tally.t += (g.index ? g.index.count : g.attributes.position.count) / 3; tally.m.add(m); } add0(m, g, own); };
const cost = (fn, ...a) => { tally = { t: 0, m: new Set() }; fn(...a); const r = { tris: tally.t, mats: tally.m.size }; tally = null; return r; };
function rrect(w, h, r, p = new THREE.Shape()) { // a rounded rectangle centred on 0 (a Shape, or a Path for a hole)
  const x = w / 2 - r, y = h / 2 - r;
  p.moveTo(x + r, -y); p.lineTo(x + r, y); p.absarc(x, y, r, 0, PI / 2); p.lineTo(-x, y + r); p.absarc(-x, y, r, PI / 2, PI);
  p.lineTo(-x - r, -y); p.absarc(-x, -y, r, PI, 1.5 * PI); p.lineTo(x, -y - r); p.absarc(x, -y, r, 1.5 * PI, 2 * PI); return p;
}
// a pressed or cast plate: the shape extruded along z (centred on 0), every edge rolled over a radius `bev`
const plate = (shape, depth, bev, seg = 3, curve = 8) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: seg, curveSegments: curve }).translate(0, 0, -depth / 2);
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => v2(r, y)), seg); // profile listed bottom to top: outward normals
const pipe = (pts, r, seg, rad = 16) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p))), seg, r, rad);
const flat = g => { g = g.toNonIndexed(); g.computeVertexNormals(); return g; }; // faceted: an octagonal pole, a hex nut
// A pressed rim round a w x l rectangle on a ceiling, as a ring of rectangles: prof [[inset, y], ...] from the outer edge inward.
// The corners mitre themselves; the normals are shared between bands so the folds read rolled, not razor-cut. Own UVs: u the
// inset over .6 (the troffer set's mm from its edge), v along the edge. A few dozen triangles for a whole fitting.
function rim(w, l, prof) {
  const pos = [], uv = [], idx = [];
  for (const [d, y] of prof) { const a = w / 2 - d, b = l / 2 - d; for (const [px, pz] of [[-a, -b], [a, -b], [a, b], [-a, b]]) { pos.push(px, y, pz); uv.push(d / .6, (px + pz) / .6); } }
  for (let k = 0; k < prof.length - 1; k++) for (let i = 0; i < 4; i++) { const A = k * 4 + i, B = k * 4 + (i + 1) % 4, C = B + 4, D = A + 4; idx.push(A, B, C, A, C, D); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
// An emitter seen as a lit volume, not a flat disc: its glow falls toward the silhouette (glass seen edge-on is lit through less of
// its thickness) and peaks where you look straight through it at the lamp. Wraps the library shader; fixed constants, one program.
function volume(m) {
  if (m.userData.vol) return m;
  const lib = m.onBeforeCompile; m.userData.vol = 1;
  m.onBeforeCompile = function (s, r) { lib.call(this, s, r); s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_begin>',
    'totalEmissiveRadiance *= mix(.28, 1.12, pow(abs(dot(normalize(normal), normalize(vViewPosition))), .75));\n#include <lights_fragment_begin>'); };
  return m;
}
// the white stove-enamelled steel of ceiling fittings, one material per place for all of them
const whiteSteel = z => M(z, 'paintedSteel', { color: 0xd8d4c8, wear: .08, dirt: .15, dirtCol: [.55, .5, .42], roughness: .4 });
const greyPlastic = z => M(z, 'hardPlastic', { color: 0xb4b2ac, roughness: .5, wear: .1 });

// ---------- recessed troffer: a lay-in fitting, 600 x 1200 or 600 x 600 ----------
// A pressed-steel door frame (22 mm, 9 mm proud of the ceiling, its rolled edge, face and return as one ring of bands) holding a prismatic
// lens 5 mm up inside it; frame and lens are one material, the frame's look carried by the lens set's edge (u under 22 mm). Seen from
// 1.2 m at the nearest, so 34 triangles: every detail is in the texture. Each fitting is turned end for end and slid along its tubes by
// its own seed, so the dust and insects on it differ from its neighbour's. y: the ceiling's underside. o: w, l (m), on, power, seed.
function troffer(z, x, y, zc, ry = 0, o = {}) {
  const w = o.w || .6, l = o.l || 1.2, on = o.on !== false, s = o.seed ?? hash(x, zc);
  const lens = on ? M(null, 'troffer', { uv: [.6, .6] }) : M(z, 'trofferOff', { uv: [.6, .6], roughness: .35 });
  add(lens, put(rim(w - .006, l - .006, [[0, .003], [0, -.004], [.002, -.008], [.005, -.009], [.019, -.009], [.022, -.006], [.022, -.004]]), x, y, zc, ry), true);
  const wi = w - .006 - .044, li = l - .006 - .044, q = new THREE.PlaneGeometry(wi, li).rotateX(PI / 2), uv = q.attributes.uv, mir = s > .5, u0 = .022 / .6;
  for (let i = 0; i < uv.count; i++) { const u = u0 + uv.getX(i) * (1 - 2 * u0); uv.setXY(i, mir ? 1 - u : u, uv.getY(i) * li / .6 + s * 7.31 % 1); }
  add(lens, put(q.translate(0, -.004, 0), x, y, zc, ry), true);
  if (on) emitters.push({ zone: z, p: V(x, y - .05, zc), t: V(x, 0, zc), power: (o.power ?? 120) * (y / H) ** 2, angle: 1.45, dist: 16, color: 0xfff0cf });
}
const lamp = (z, x, zc, h = H, on = true, power = 120) => troffer(z, x, h, zc, 0, { on, power }); // the 600 x 1200 panel on the 60 cm grid, plus its light

// ---------- surface T8 batten: a pressed-steel channel on the ceiling, a lampholder at each end, the tube held by two C-clips ----------
// Along x, y: the ceiling's underside. The tube's own UVs are in metres (along it, round it). o: l (1.2 m or 1.5 m), on, power (0: glows only).
function batten(z, x, y, zc, ry = 0, o = {}) {
  const L = o.l || 1.2, on = o.on !== false, A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  const st = whiteSteel(z), pl = greyPlastic(z);
  const tm = on ? volume(M(null, 'ledTube')) : M(z, 'ledTube', { emit: null, color: 0xc8c4b8 }), ty = -.05, tl = L - .05;
  A(st, plate(rrect(.052, .03, .009), L - .006, .003, 2, 4).rotateY(PI / 2).translate(0, -.018, 0)); // the channel, 9 mm proud of the ceiling at its ends
  A(st, plate(rrect(.07, L + .01, .004), .002, .001, 1, 2).rotateX(PI / 2).translate(0, -.002, 0)); // its folded lip against the ceiling
  for (const s of [-1, 1]) {
    A(pl, plate(rrect(.036, .046, .007), .014, .003, 2, 4).rotateY(PI / 2).translate(s * (L / 2 - .016), -.052, 0)); // lampholder
    A(pl, new THREE.CylinderGeometry(.0136, .0136, .03, 24, 1).rotateZ(PI / 2).translate(s * (tl / 2 - .013), ty, 0)); // the tube's 30 mm end cap
    for (const p of [-.0063, .0063]) A(st, new THREE.CylinderGeometry(.0012, .0012, .01, 6).rotateZ(PI / 2).translate(s * (tl / 2 + .004), ty + p, 0)); // its bi-pins into the holder
    A(pl, new THREE.TorusGeometry(.0148, .0024, 6, 16, PI * 1.45).rotateZ(-PI * .225 + PI / 2 + PI).rotateY(PI / 2).translate(s * L / 4, ty, 0)); // C-clip round the tube
    A(pl, new THREE.BoxGeometry(.008, .022, .01).translate(s * L / 4, ty + .022, 0)); // its stem into the channel
  }
  const t = new THREE.CylinderGeometry(.013, .013, tl - .06, 32, 1, true).rotateZ(-PI / 2).rotateX(-PI / 2), uv = t.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * (tl - .06), uv.getX(i) * .075);
  A(tm, t.translate(0, ty, 0), true);
  if (on && o.power) lit(z, x, y - .08, zc, o.power, [x, 0, zc], 1.5, 10, 0xffd8a8);
}

// ---------- surface opal panel: an extruded aluminium frame, mitred, round a direct-lit opal diffuser ----------
// y: the ceiling's underside, the panel 36 mm deep below it. o: w, l (m), on, power (0: glows only).
function opalPanel(z, x, y, zc, ry = 0, o = {}) {
  const w = o.w || .6, l = o.l || .6, on = o.on !== false, A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  A(whiteSteel(z), rim(w, l, [[.002, 0], [0, -.003], [0, -.03], [.002, -.035], [.006, -.037], [.014, -.037], [.016, -.034]]));
  const q = new THREE.PlaneGeometry(w - .032, l - .032).rotateX(PI / 2), uv = q.attributes.uv, s = hash(x, zc);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w - .032) + s, uv.getY(i) * (l - .032));
  A(on ? M(null, 'opalPanel') : M(z, 'opalPanel', { emit: null, color: 0xd8d4c8 }), q.translate(0, -.034, 0), true);
  if (on && o.power) lit(z, x, y - .1, zc, o.power, [x, 0, zc], 1.45, 12, 0xffd8a8);
}

// ---------- park lamp posts: a fluted cast base, a tapered steel pole, and a crook-neck lantern or a globe on top ----------
const base = () => { // cast bell base, 340 mm across, 16 flutes fading in and out over its shaft
  const p = [[0, 0], [.168, 0], [.172, .008], [.172, .045], [.165, .058], [.148, .064], [.145, .072], [.145, .1], [.138, .112], [.118, .13], [.108, .16]];
  for (let y = .18; y <= .481; y += .03) p.push([.108 - (y - .16) * .09, y]);
  p.push([.072, .5], [.084, .512], [.086, .53], [.08, .545], [.058, .552], [.042, .56]);
  const g = lathe(p, 64), a = g.attributes.position;
  for (let i = 0; i < a.count; i++) { const y = a.getY(i), k = Math.sin(PI * Math.min(1, Math.max(0, (y - .18) / .3))) ** .5, ph = Math.atan2(a.getZ(i), a.getX(i));
    const s = 1 - .07 * k * (.5 + .5 * Math.cos(16 * ph)) ** 2; a.setX(i, a.getX(i) * s); a.setZ(i, a.getZ(i) * s); }
  g.computeVertexNormals(); return g;
};
const collar = (y, r) => lathe([[r - .012, y - .03], [r, y - .022], [r + .004, y - .01], [r + .004, y + .01], [r, y + .022], [r - .012, y + .03]], 32);
const glassBall = (cy, r, neck, top = true) => { // a globe blown round a neck of radius `neck`: from the bottom pole up, or from the neck up
  const p = [], a0 = top ? -Math.acos(neck / r) : -PI / 2, a1 = top ? PI / 2 : Math.acos(neck / r);
  if (!top) p.push([0, cy - r]);
  for (let i = top ? 0 : 1; i <= 20; i++) { const a = a0 + (a1 - a0) * i / 20; p.push([r * Math.cos(a), cy + r * Math.sin(a) * 1.04]); }
  if (top) p.unshift([neck - .004, cy - r * Math.sin(Math.acos(neck / r)) * 1.04 - .012]); else p.push([neck - .002, p[p.length - 1][1] + .03]);
  return lathe(p, 48);
};
// o: metal (the place's own, else dark green cast iron in a satin enamel that catches light), glass (the unlit globe's material),
// on (needs z), power, reach (arm, m), globe: a globe on top instead
function streetLamp(z, x, y, zc, ry = 0, o = {}) {
  const on = z && o.on !== false, metal = o.metal || M(z, 'castIron', { color: 0x40554b, roughness: .34, wear: .5 }), R = o.reach ?? .95;
  const glass = on ? volume(M(null, 'frostedGlobe', { uv: [.1, .1] })) : o.glass || M(z, 'frostedGlobe', { uv: [.1, .1], emit: null, color: 0xd8d4c8, roughness: .3 });
  const bronze = M(z, 'brass', { color: 0x5e4630, roughness: .42, dirt: .8 }), gasket = M(z, 'rubber', { color: 0x1c1b19 });
  const A = (m, g, own) => add(m, put(g, x, y, zc, ry), own), top = o.globe ? 2.95 : 3.4;
  A(metal, base()); A(metal, new THREE.CylinderGeometry(.031, .041, top - .55, 32, 1, true).translate(0, (top + .55) / 2, 0)); A(metal, collar(top - .02, .046));
  let hx, hy;
  if (o.globe) { // a dark bronze cast fitter cup, three set-screws holding the globe's neck lip, and a 360 mm opal globe
    A(bronze, lathe([[.03, top - .02], [.036, top - .012], [.045, top + .01], [.07, top + .045], [.082, top + .056], [.084, top + .066], [.082, top + .074], [.074, top + .078], [.07, top + .074]], 48));
    for (let k = 0; k < 3; k++) { const a = k * 2 * PI / 3 + .4; A(bronze, new THREE.CylinderGeometry(.0055, .0055, .012, 10).rotateZ(PI / 2).translate(.088, top + .064, 0).rotateY(a));
      A(bronze, new THREE.CylinderGeometry(.009, .009, .004, 6).rotateZ(PI / 2).translate(.0835, top + .064, 0).rotateY(a)); } // thumbscrew and its boss
    A(glass, glassBall(top + .25, .18, .072), true); A(glass, new THREE.TorusGeometry(.07, .0055, 8, 40).rotateX(PI / 2).translate(0, top + .079, 0)); // the globe's neck lip
    hx = 0; hy = top + .25;
  } else { // the crook: one bent tube from a socket on the pole over to the lantern, a cast scroll bracing it, the lantern hung from its end
    const k = R / .95, c = [[0, top - .02], [0, 3.74], [.07, 3.95], [.28, 4.05], [.55, 4.05], [.78, 4.0], [.91, 3.93], [.95, 3.86]].map(([a, h]) => [a * k, h, 0]);
    A(metal, pipe(c, .026, 64, 16)); A(metal, collar(3.53, .04));
    const sc = []; for (let i = 0; i <= 28; i++) { const t = i / 28, a = PI * .1 + t * PI * 1.7, r = .07 * (1 - .62 * t); sc.push([.2 * k + r * Math.cos(a) * .9, 3.72 + r * Math.sin(a), 0]); }
    A(metal, pipe([[0, 3.53, 0], [.08, 3.56, 0], [.17 * k, 3.64, 0], ...sc.reverse(), [.25 * k, 3.86, 0], [.29 * k, 3.98, 0], [.3 * k, 4.03, 0]], .012, 60, 8)); // a scroll curling under the arm
    hx = R; const hood = [[.088, 3.752], [.13, 3.748], [.158, 3.744], [.167, 3.748], [.169, 3.755], [.165, 3.762], [.156, 3.768], [.148, 3.784], [.134, 3.804], [.114, 3.823], [.09, 3.839],
      [.066, 3.852], [.048, 3.86], [.038, 3.866], [.036, 3.875], [.036, 3.922], [.032, 3.93]]; // a rolled bead at the rim, a spun dome, the socket
    A(metal, lathe(hood, 48).translate(R, 0, 0)); A(metal, new THREE.TorusGeometry(.089, .007, 8, 40).rotateX(PI / 2).translate(R, 3.735, 0));
    A(gasket, new THREE.TorusGeometry(.084, .004, 6, 40).rotateX(PI / 2).translate(R, 3.727, 0)); // the gasket the globe seats on
    A(bronze, lathe([[.07, 3.69], [.086, 3.7], [.088, 3.728], [.082, 3.73]], 40).translate(R, 0, 0)); // the fitter ring holding the globe's neck
    A(glass, glassBall(3.6, .13, .085, false).translate(R, 0, 0), true); hy = 3.6;
  }
  round(x, zc, .17, y - .4, y + .1); round(x, zc, .11, y + .1, y + .55); round(x, zc, .045, y + .55, y + top + .05);
  if (on) { const c = Math.cos(ry), s = Math.sin(ry), px = x + hx * c, pz = zc - hx * s;
    lit(z, px, y + hy, pz, o.power ?? 90, [px, y, pz], o.globe ? 1.5 : 1.2, 18, 0xffc98a); }
}
// the old helper's signature: a crook-neck lamp reaching (ax, az) * .95 m, lit only where a zone is given
const post = (mat, globe, x, y, zc, ax, az, power, zone) => streetLamp(zone, x, y, zc, Math.atan2(-az, ax), { metal: mat, glass: globe, power, reach: .95 * Math.hypot(ax, az) });
const globeLamp = (z, x, y, zc, ry = 0, o = {}) => streetLamp(z, x, y, zc, ry, { ...o, globe: true });

// ---------- car-park mast lamp: a hot-dip galvanised octagonal mast on a cast plinth, a bracket arm, flat-glass LED lanterns ----------
// Feet at y; the arm reaches toward +z (one head) or both ways along z (heads: 2). A 450 mm concrete plinth with a galvanised base
// plate on four anchor bolts, an inspection door with its two screws, the tapered mast, a spigot and the arm; each lantern a die-cast
// housing with cooling fins over a toughened flat glass, rows of LED optics seen through it. o: h (6 m), heads, on, power, reach.
function mastLamp(z, x, y, zc, ry = 0, o = {}) {
  const h = o.h || 6, n = o.heads || 1, R = o.reach ?? .55, on = z && o.on !== false, A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  const gal = M(z, 'galvanised', {}), con = M(z, 'concreteWall', { dirt: .5 }), body = M(z, 'paintedSteel', { color: 0x55595b, roughness: .45, wear: .25, dirt: .4 });
  const optic = on ? M(null, 'ledOptic', { uv: [.2, .2] }) : M(z, 'ledOptic', { uv: [.2, .2], emit: null, color: 0xb0b0ac });
  A(con, plate(rrect(.45, .45, .03), .3, .012, 2, 3).rotateX(PI / 2).translate(0, .144, 0)); // plinth, 300 mm, a pencil-round edge
  A(gal, plate(rrect(.3, .3, .02), .016, .003, 1, 3).rotateX(PI / 2).translate(0, .31, 0)); // base plate
  for (const [bx, bz] of [[-.11, -.11], [.11, -.11], [.11, .11], [-.11, .11]]) {
    A(gal, flat(new THREE.CylinderGeometry(.017, .017, .018, 6)).translate(bx, .327, bz)); A(gal, new THREE.CylinderGeometry(.021, .021, .003, 16).translate(bx, .319, bz)); // nut on its washer
    A(gal, new THREE.CylinderGeometry(.01, .011, .03, 10).translate(bx, .345, bz)); // the bolt's thread standing proud
  }
  A(gal, flat(new THREE.CylinderGeometry(.06, .086, h - .32, 8, 1, true).rotateY(PI / 8)).translate(0, .32 + (h - .32) / 2, 0)); // the mast, 8 flats
  A(gal, flat(new THREE.CylinderGeometry(.094, .094, .1, 8).rotateY(PI / 8)).translate(0, .37, 0)); // the welded collar at its foot
  A(gal, plate(rrect(.07, .32, .012), .004, .002, 1, 3).translate(0, .95, .079)); for (const sy of [.8, 1.1]) A(gal, new THREE.CylinderGeometry(.006, .006, .006, 10).rotateX(PI / 2).translate(0, sy, .083)); // door
  A(gal, new THREE.CylinderGeometry(.04, .045, .25, 16).translate(0, h + .1, 0)); A(gal, new THREE.SphereGeometry(.042, 16, 6, 0, 2 * PI, 0, PI / 2).translate(0, h + .225, 0)); // spigot and cap
  for (const s of n === 2 ? [-1, 1] : [1]) {
    A(gal, pipe([[0, h + .05, 0], [0, h + .1, s * .08], [0, h + .16, s * R * .6], [0, h + .17, s * R]], .03, 24, 12)); // the arm, swept off the spigot
    const tilt = -s * .09, hy = h + .12, hz = s * (R + .24), tr = g => g.rotateX(tilt).translate(0, hy, hz);
    A(body, tr(plate(rrect(.3, .52, .05), .07, .02, 3, 6).rotateX(PI / 2))); // die-cast housing, its long side along the arm
    for (let i = -3; i <= 3; i++) A(body, tr(plate(rrect(.008, .36, .004), .022, .002, 1, 2).rotateX(PI / 2).translate(i * .032, .064, 0))); // cooling fins on top
    A(body, tr(new THREE.CylinderGeometry(.036, .036, .1, 16).rotateX(PI / 2).translate(0, .01, -s * .27))); // the clamp onto the arm
    const gq = new THREE.PlaneGeometry(.24, .44).rotateX(PI / 2), u = gq.attributes.uv;
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 1.2, u.getY(i) * 2.2);
    A(optic, tr(gq.translate(0, -.0565, 0)), true);
    if (on) { const c = Math.cos(ry), sn = Math.sin(ry), px = x + hz * sn, pz = zc + hz * c; lit(z, px, y + hy - .1, pz, (o.power ?? 520) / n, [px, y, pz], 1.3, 26, 0xffcf96); }
  }
  solidAt(x, y, zc, ry, 0, .15, 0, .47, .3, .47); round(x, zc, .09, y + .3, y + h);
}

// ---------- hotel wall sconce ----------
// Origin on the wall's face at the backplate's centre, front (+z) into the room. A cast brass backplate with rolled edges and two
// domed fixing screws, a swan-neck arm out of a boss, a fitter cup with three gallery screws and an etched glass tulip, open at the
// top on a rolled rim. o: on, power (0: glows only).
function sconce(z, x, y, zc, ry = 0, o = {}) {
  const on = o.on !== false, br = M(z, 'brass', { roughness: .3, dirt: .8 });
  const glass = on ? volume(M(null, 'frostedGlobe', { uv: [.1, .1] })) : M(z, 'frostedGlobe', { uv: [.1, .1], emit: null, color: 0xd8d4c8, roughness: .3 });
  const A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  A(br, plate(rrect(.104, .214, .018), .006, .004, 4).translate(0, 0, .007));
  for (const sy of [-.082, .082]) A(br, new THREE.SphereGeometry(.0055, 14, 6, 0, 2 * PI, 0, PI / 2).scale(1, 1, .6).rotateX(PI / 2).translate(0, sy, .014));
  A(br, lathe([[.0, 0], [.02, 0], [.022, .004], [.02, .012], [.012, .018], [.009, .026]], 32).rotateX(PI / 2).translate(0, -.025, .013));
  A(br, pipe([[0, -.025, .03], [0, -.024, .07], [0, -.005, .11], [0, .03, .128], [0, .045, .13]], .0075, 24, 12));
  const cy = .04, cz = .13;
  A(br, lathe([[0, cy - .004], [.011, cy - .002], [.016, cy + .008], [.024, cy + .02], [.032, cy + .03], [.035, cy + .034], [.034, cy + .038]], 40).translate(0, 0, cz));
  for (let k = 0; k < 3; k++) A(br, new THREE.CylinderGeometry(.0035, .0035, .008, 8).rotateZ(PI / 2).translate(.036, cy + .032, 0).rotateY(k * 2 * PI / 3 + PI / 2).translate(0, 0, cz)); // gallery screws
  A(glass, lathe([[.03, cy + .034], [.04, cy + .048], [.052, cy + .075], [.06, cy + .105], [.064, cy + .135], [.066, cy + .158], [.067, cy + .166], [.064, cy + .17]], 48).translate(0, 0, cz), true);
  A(glass, new THREE.TorusGeometry(.0655, .003, 6, 48).rotateX(PI / 2).translate(0, cy + .169, cz)); // the rolled rim, glass seen in its thickness
  solidAt(x, y, zc, ry, 0, .05, .1, .14, .32, .2);
  if (on && o.power) { const c = Math.cos(ry), s = Math.sin(ry); lit(z, x + cz * s, y + .12, zc + cz * c, o.power, [x + .8 * s, 0, zc + .8 * c], 1.4, 8, 0xffcf96); }
}

// ---------- small wall / step light: a cast aluminium brick light with a three-louvre eyelid over an opal lens ----------
// Origin on the wall's face at its centre, front (+z) out; set low beside steps or a passage. o: on, power (a pool place's tiles only: fixture).
function stepLight(z, x, y, zc, ry = 0, o = {}) {
  const on = o.on !== false, al = M(z, 'anodised', { color: 0x8c8c88, roughness: .42, wear: .3, dirt: .5 }), A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  const fp = rrect(.14, .085, .012); fp.holes.push(rrect(.098, .056, .006, new THREE.Path())); A(al, plate(fp, .008, .003, 2, 4).translate(0, 0, .006)); // the faceplate round its aperture
  for (const sx of [-.058, .058]) A(al, new THREE.SphereGeometry(.0045, 10, 4, 0, 2 * PI, 0, PI / 2).scale(1, 1, .5).rotateX(PI / 2).translate(sx, 0, .013)); // fixing screws
  for (let i = 0; i < 3; i++) A(al, plate(rrect(.094, .011, .003), .002, .0012, 1, 2).rotateX(-.6).translate(0, .018 - i * .018, .02)); // louvres, tilted to throw the light down
  for (const sx of [-.048, .048]) A(al, new THREE.BoxGeometry(.003, .056, .014).translate(sx, 0, .016)); // their cheeks
  const q = new THREE.PlaneGeometry(.094, .052), u = q.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * .094 + hash(x, zc), u.getY(i) * .052);
  A(on ? M(null, 'opalPanel') : M(z, 'opalPanel', { emit: null, color: 0xd0ccc0 }), q.translate(0, 0, .004), true);
  if (on && o.power && z.tile) { const c = Math.cos(ry), s = Math.sin(ry); fixture(z, x + .1 * s, y - .05, zc + .1 * c, o.power); }
}

// ---------- underwater pool light: a stainless niche ring screwed over a fluted glass lens with its LED ring behind ----------
// Origin on the pool wall's face at the lens centre, front (+z) into the water. o: on, power (cheap unshadowed: fixture, pool places only), d (lens, m).
function poolLight(z, x, y, zc, ry = 0, o = {}) {
  const on = o.on !== false, d = o.d || .24, ss = M(z, 'chrome', { dirt: .5, dirtCol: [.62, .64, .58] }), A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  const r = d / 2, ring = lathe([[r + .046, 0], [r + .042, .004], [r + .03, .007], [r + .004, .008], [r - .002, .004], [r - .004, -.002]], 64).rotateX(PI / 2);
  A(ss, ring); // the face ring, domed, 46 mm wide
  for (let k = 0; k < 6; k++) { const a = k * PI / 3 + PI / 6, sx = Math.cos(a) * (r + .022), sy = Math.sin(a) * (r + .022);
    A(ss, new THREE.SphereGeometry(.0055, 10, 4, 0, 2 * PI, 0, PI / 2).scale(1, 1, .45).rotateX(PI / 2).translate(sx, sy, .0075)); } // countersunk screws
  const g = new THREE.CircleGeometry(r - .002, 48), u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, (u.getX(i) - .5) * (d / .24) + .5, (u.getY(i) - .5) * (d / .24) + .5);
  A(on ? volume(M(null, 'poolLens', { uv: [.24, .24] })) : M(z, 'poolLens', { uv: [.24, .24], emit: null, color: 0xc8ccc8 }), g.translate(0, 0, .002), true);
  if (on && o.power && z.tile) { const c = Math.cos(ry), s = Math.sin(ry); fixture(z, x + .3 * s, y, zc + .3 * c, o.power); }
}

// ---------- neon tube sign on standoffs ----------
// Origin on the wall's face at the sign's centre, front (+z) out. Each stroke is a glass tube (12 mm) bent through its points [x, y] (m),
// held 40 mm off the wall by clear standoffs with clips, each end turning back into a black electrode boot at the wall; a lead runs
// from the last boot to a small transformer box below. o: strokes, color (warm), on, k (brightness).
const sun = (() => { const s = [[]]; for (let i = 0; i <= 40; i++) { const a = PI * .62 + i / 40 * PI * 1.76; s[0].push([.16 * Math.cos(a), .14 + .16 * Math.sin(a)]); } // a sun over water, its ring open at the bottom
  for (const yy of [-.1, -.2]) { const w = []; for (let i = 0; i <= 24; i++) { const t = i / 24; w.push([-.3 + .6 * t, yy + .025 * Math.sin(t * PI * 4 + (yy < -.15 ? 1 : 0))]); } s.push(w); } return s; })();
function neonSign(z, x, y, zc, ry = 0, o = {}) {
  const on = o.on !== false, st = o.strokes || sun, col = o.color ?? 0xffa860, A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  const tube = on ? volume(M(null, 'neonTube', { emit: [col, o.k ?? 5] })) : M(z, 'neonTube', { emit: null, color: 0xc8c4bc });
  const boot = M(z, 'rubber', { color: 0x1c1b19 }), clear = M(z, 'hardPlastic', { color: 0xd4d6d2, roughness: .2 }), tb = whiteSteel(z), off = .04;
  let lo = [0, 1e9];
  for (const s of st) {
    const pts = s.map(([px, py]) => [px, py, off]), a = s[0], b = s[s.length - 1];
    let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    const g = pipe([[a[0], a[1], .012], [a[0], a[1], .03], ...pts, [b[0], b[1], .03], [b[0], b[1], .012]], .006, Math.ceil(L / .012) + 8, 10), u = g.attributes.uv;
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * L, u.getY(i) * .04);
    A(tube, g, true);
    for (const e of [a, b]) { A(boot, new THREE.CylinderGeometry(.009, .01, .03, 12).rotateX(PI / 2).translate(e[0], e[1], .015)); if (e[1] < lo[1]) lo = e; } // electrode boots
    for (let t = .12; t < L - .05; t += .22) { // a standoff every 220 mm along the stroke
      let d = t, i = 1; while (i < s.length - 1 && d > Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1])) { d -= Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); i++; }
      const [px, py] = s[i]; A(clear, new THREE.CylinderGeometry(.005, .006, off - .008, 10).rotateX(PI / 2).translate(px, py - .009, (off - .008) / 2));
      A(clear, new THREE.TorusGeometry(.0075, .0018, 5, 14, PI * 1.5).rotateZ(-PI * .25 - PI / 2).translate(px, py, off)); }
  }
  const by = Math.min(...st.flat().map(p => p[1])) - .14; A(tb, plate(rrect(.12, .07, .008), .045, .004, 2, 3).translate(0, by, .026)); // transformer
  A(boot, pipe([[lo[0], lo[1], .006], [lo[0] * .6, (lo[1] + by) / 2, .006], [0, by + .035, .01]], .0035, 16, 6)); // its lead along the wall
}

function yard(plot) { // the lights plot in the dev yard (js/zones/yard.js): one of each fitting, lamps glowing in its dark corner
  const z = plot.zone, X = plot.x, Z = plot.z, cy = 2.7;
  box(M(z, 'ceilingTile'), X + 4.6, cy, Z + .5, X + 9.4, cy + .06, Z + 4.5); // a ceiling island at room height for the troffers
  troffer(z, X + 5.9, cy, Z + 2.5, 0, { power: 60 }); troffer(z, X + 7.1, cy, Z + 2.5, 0, { on: false }); troffer(z, X + 8.3, cy, Z + 2.2, 0, { l: .6, power: 40 });
  batten(z, X + 6.6, cy, Z + 4, 0, { power: 25 });
  opalPanel(z, X + 8.3, cy, Z + 1.1, 0, {}); opalPanel(z, X + 5.3, cy, Z + 1.1, 0, { on: false });
  streetLamp(z, X + 1, 0, Z + 2.4, 0, { power: 60 }); // in the dark corner, its lantern toward +x
  sconce(z, X + 2.7, 1.9, Z + .01, 0, {}); // on the dark corner's back wall
  neonSign(z, X + 1.1, 1.4, Z + .01, 0, {}); stepLight(z, X + 2.3, .35, Z + .01, 0, {}); poolLight(z, X + 3.05, .5, Z + .01, 0, {});
  globeLamp(z, X + 12, 0, Z + 4, 0, { power: 40 });
  mastLamp(z, X + 10.2, 0, Z + 1.2, 0, { power: 120 });
}

export { lamp, post, troffer, batten, opalPanel, streetLamp, globeLamp, mastLamp, sconce, stepLight, poolLight, neonSign, yard, cost };
