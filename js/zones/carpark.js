// The car park at night.
import * as THREE from 'three';
import { dry, zones, defZone } from '../core.js';
import { M, P, neon } from '../mat.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, put, block, box, solid, round, lit } from '../build.js';
import { mastLamp, opalPanel } from '../props/lights.js';
import { bin } from '../props/metalwork.js';

// A 500 mm traffic cone, to the kit's standard (docs/props.md) but only this place has one: a black recycled-rubber base 360 mm square
// with rounded corners and a raised collar, the hollow body moulded in orange PVC with a flared foot and a rolled lip at the top, a
// retroreflective sleeve 130 mm deep heat-shrunk round its middle (a thin band above it), scuffed and dusty. Feet at y 0.
const coneBody = (() => { const r = y => .132 + (.03 - .132) * (y - .075) / (.488 - .075); // the cone's outer radius at height y
  const V = (a, b) => new THREE.Vector2(a, b), base = new THREE.Shape(), q = .18, c = .045;
  for (const [sx, sy, a] of [[1, 1, 0], [-1, 1, .5], [-1, -1, 1], [1, -1, 1.5]]) base.absarc(sx * (q - c), sy * (q - c), c, a * Math.PI, (a + .5) * Math.PI);
  base.holes.push(new THREE.Path().absarc(0, 0, .09, 0, 2 * Math.PI, true)); // the base is a ring: the body's hollow shows through from above in the real thing
  const parts = {
    base: new THREE.ExtrudeGeometry(base, { depth: .024, bevelEnabled: true, bevelThickness: .007, bevelSize: .008, bevelSegments: 2, curveSegments: 6 }).rotateX(-Math.PI / 2).translate(0, .007, 0),
    collar: new THREE.LatheGeometry([V(.162, .03), V(.16, .044), V(.148, .056), V(.14, .06)], 40), // the base's raised ring the body sits in
    body: new THREE.LatheGeometry([V(.145, .038), V(.151, .046), V(.15, .056), V(.138, .066), V(.132, .075), V(r(.2), .2), V(r(.3), .3), V(r(.4), .4), V(.031, .488), V(.034, .494), V(.032, .5), V(.026, .502), V(.022, .497), V(.02, .46)], 40),
    sleeve: new THREE.LatheGeometry([V(r(.235) + .0012, .235), V(r(.24) + .0022, .24), V(r(.36) + .0022, .36), V(r(.365) + .0012, .365)], 40),
    band: new THREE.LatheGeometry([V(r(.395) + .0012, .395), V(r(.398) + .002, .398), V(r(.432) + .002, .432), V(r(.435) + .0012, .435)], 40),
  };
  return parts; })();
function cone(z, x, y, zc, ry = 0) {
  const pvc = M(z, 'hardPlastic', { color: 0xe0561a, roughness: .55, wear: .55, edgeCol: [.95, .62, .42], dirt: .7, dirtCol: [.36, .33, .3], macro: .25, grime: .35 });
  const rub = M(z, 'rubber', { color: 0x1a1918, dirt: .6, dirtCol: [.34, .32, .3] }), refl = M(z, 'hardPlastic', { color: 0xd8d6cc, roughness: .22, metalness: .35, wear: .2, dirt: .5, dirtCol: [.4, .38, .34], macro: .3 });
  const B = coneBody, P = g => put(g.clone(), x, y, zc, ry);
  add(rub, P(B.base)); add(rub, P(B.collar)); add(pvc, P(B.body)); add(refl, P(B.sleeve)); add(refl, P(B.band));
  round(x, zc, .14, y, y + .25); round(x, zc, .07, y + .25, y + .52);
}
import { kerb, bayLine, arrow, bollard, speedBump } from '../props/structure.js';
import { parkBench } from '../props/garden.js';

// ---- shared bits for the shelter and the machines
const rb = (w, h, d, r = .004, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const cy = (r, h, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg); // upright; rotateX / rotateZ to lay it down
const hexNut = () => cy(.015, .012, 6).translate(0, .006, 0);
const alongX = (sh, x1, x2) => new THREE.ExtrudeGeometry(sh, { depth: x2 - x1, bevelEnabled: false, curveSegments: 8 }).rotateY(-Math.PI / 2).translate(x2, 0, 0); // a (z, y) profile run along x
const can = (() => { const V = (a, b) => new THREE.Vector2(a, b); // a 330 ml can: rolled foot, straight wall, necked shoulder, rim
  return new THREE.LatheGeometry([V(0, .004), V(.024, .001), V(.029, 0), V(.032, .006), V(.033, .012), V(.033, .1), V(.029, .111), V(.027, .114), V(.0275, .1165), V(.026, .117), V(.024, .113), V(0, .113)], 20); })();

// ---- bus shelter: a 4 x 1.3 m galvanised barrel roof on curved rafters over two eave beams, five 80 mm square posts on bolted
// base plates, gutters on both eaves with end caps and a downpipe; back and ends glazed in gasketed frames (road dirt splashed up
// their lower edges); the kit bench in the west bay, a perch rail and a blank backlit timetable case in the east; an opal light
// recessed in a channel under the crown makes it a warm island in the dark lot; the kit bin at the front corner.
function shelter(z) {
  const X1 = 686, X2 = 690, ZB = 29.28, ZF = 30.65, RR = 2.34, Y0 = .26, ZC = 30, yr = q => Y0 + Math.sqrt(RR * RR - (q - ZC) ** 2); // the barrel: chord 1.8 m, rise 0.18 m
  const Fr = M(z, 'paintedSteel', { color: 0x2c3134, roughness: .42, dirt: .5, dirtCol: [.4, .38, .34], wear: .25, edgeCol: [.5, .5, .48] }), G = M(z, 'galvanised'),
    Gl = M(z, 'glass'), Rb = M(z, 'rubber', { color: 0x161514 }), St = M(z, 'brushedSteel'), Al = M(z, 'anodised', { color: 0x9c9a94, roughness: .4, dirt: .3 }),
    Dt = M(z, 'frostedGlass', { color: 0x9a8a70, opacity: .55, roughness: .85, side: THREE.DoubleSide, depthWrite: false });
  const band = (z1, z2, top, th, n = 32) => { const s = new THREE.Shape(); // the strip of the barrel between top and top - th above the sheet's underside
    for (let i = 0; i <= n; i++) { const q = z1 + (z2 - z1) * i / n; i ? s.lineTo(q, yr(q) + top) : s.moveTo(q, yr(q) + top); }
    for (let i = n; i >= 0; i--) { const q = z1 + (z2 - z1) * i / n; s.lineTo(q, yr(q) + top - th); } return s; };
  // roof: sheet, standing seams, arched fascia caps, rafters, screws
  add(G, alongX(band(29.1, 30.9, .006, .006), 685.86, 690.14));
  for (let x = 686.01; x < 690.1; x += .3) add(G, alongX(band(29.1, 30.9, .028, .022), x - .009, x + .009));
  for (const x of [685.85, 690.142]) add(Fr, alongX(band(29.07, 30.93, .04, .13), x, x + .008));
  for (const x of [X1, 688, X2]) { add(Fr, alongX(band(29.1, 30.9, 0, .09), x - .025, x + .025));
    for (let q = 29.2; q < 30.9; q += .3) { add(G, cy(.009, .006, 8).translate(x, yr(q) + .015, q)); add(Rb, cy(.011, .003, 10).translate(x, yr(q) + .012, q)); } }
  // eave beams on the posts, fin plates bolted through
  for (const zz of [ZB, ZF]) add(Fr, rb(4.08, .1, .06, .006).translate(688, 2.368, zz));
  for (const [x, zz] of [[X1, ZB], [X2, ZB], [X1, ZF], [X2, ZF]]) {
    add(Fr, rb(.08, 2.306, .08, .006).translate(x, .012 + 1.153, zz)); round(x, zz, .045, 0, 2.32);
    add(Fr, rb(.22, .012, .22, .002).translate(x, .006, zz)); add(Fr, rb(.1, .008, .1, .002).translate(x, 2.314, zz)); // base plate; cap plate under the beam
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { add(G, cy(.02, .003, 12).translate(x + sx * .075, .0135, zz + sz * .075)); add(G, hexNut().translate(x + sx * .075, .015, zz + sz * .075)); add(G, cy(.008, .02, 8).translate(x + sx * .075, .035, zz + sz * .075)); }
    for (const sz of [-1, 1]) { add(Fr, rb(.07, .16, .006, .002).translate(x, 2.35, zz + sz * .033)); // fin plates either face of the beam
      for (const yy of [2.33, 2.4]) for (const dx of [-.018, .018]) add(G, hexNut().rotateX(sz * Math.PI / 2).translate(x + dx, yy, zz + sz * .036)); }
  }
  // gutters on both eaves: half-round, rolled bead, end caps, straps; a downpipe behind the east back post
  for (const [gz, s] of [[29.05, -1], [30.95, 1]]) {
    const sh = new THREE.Shape().absarc(gz, 2.405, .06, Math.PI, 2 * Math.PI, false); sh.absarc(gz, 2.405, .0575, 2 * Math.PI, Math.PI, true);
    add(G, alongX(sh, 685.84, 690.16)); add(G, alongX(new THREE.Shape().absarc(gz + s * .06, 2.408, .006, 0, 2 * Math.PI), 685.84, 690.16));
    for (const x of [685.836, 690.161]) add(G, alongX(new THREE.Shape().absarc(gz, 2.405, .062, Math.PI, 2 * Math.PI, false), x, x + .003));
    for (let x = 686.2; x < 690; x += .8) add(G, new THREE.TorusGeometry(.0615, .0035, 4, 14, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2).translate(x, 2.405, gz));
  }
  const dp = [[690.04, 2.37, 29.05], [690.04, 2.27, 29.06], [690.04, 2.16, 29.13], [690.04, 2.0, 29.14], [690.04, .2, 29.14], [690.04, .08, 29.145], [690.04, .02, 29.07]].map(p => new THREE.Vector3(...p));
  add(G, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dp, false, 'catmullrom', .2), 64, .034, 14));
  for (const yy of [.6, 1.5]) { add(G, new THREE.TorusGeometry(.037, .004, 4, 18).rotateX(Math.PI / 2).translate(690.04, yy, 29.14)); add(G, rb(.03, .03, .07, .002).translate(690.04, yy, 29.205)); }
  // glazing: a 40 mm frame per pane, glass in rubber gaskets both faces, screwed stiles, splash dirt up the bottom of the glass
  let sd = .3;
  const pane = (ax, at, a1, a2, out, y1 = .1, y2 = 2.318) => { const P = g => ax === 'x' ? g.translate(0, 0, at) : g.rotateY(-Math.PI / 2).translate(at, 0, 0), m = .04, w = a2 - a1, c = (a1 + a2) / 2, h = y2 - y1 - 2 * m;
    add(Fr, P(rb(w, m, m, .004).translate(c, y1 + m / 2, 0))); add(Fr, P(rb(w, m, m, .004).translate(c, y2 - m / 2, 0)));
    for (const s of [-1, 1]) { add(Fr, P(rb(m, h, m, .004).translate(c + s * (w / 2 - m / 2), y1 + m + h / 2, 0)));
      for (let yy = y1 + .25; yy < y2 - .1; yy += .5) add(St, P(new THREE.SphereGeometry(.006, 8, 4, 0, 2 * Math.PI, 0, Math.PI / 2).rotateX(out * Math.PI / 2).translate(c + s * (w / 2 - m / 2), yy, out * .02))); }
    add(Gl, P(new THREE.BoxGeometry(w - 2 * m + .02, h + .02, .01).translate(c, y1 + m + h / 2, 0)));
    for (const s of [-1, 1]) { const gw = w - 2 * m, q = .007 * s;
      add(Rb, P(new THREE.BoxGeometry(gw, .007, .005).translate(c, y1 + m + .0035, q))); add(Rb, P(new THREE.BoxGeometry(gw, .007, .005).translate(c, y2 - m - .0035, q)));
      for (const e of [-1, 1]) add(Rb, P(new THREE.BoxGeometry(.007, h, .005).translate(c + e * (gw / 2 - .0035), y1 + m + h / 2, q))); }
    const gw = w - 2 * m - .016, d = new THREE.Shape().moveTo(-gw / 2, 0).lineTo(gw / 2, 0), n = Math.round(gw / .015); sd = (sd * 7.31 + .17) % 1; // the dirt line wanders and runs up in streaks
    for (let i = n; i >= 0; i--) { const t = i / n, k = Math.max(0, Math.sin(t * 13 + sd * 20) * Math.sin(t * 5.3 + sd * 9));
      d.lineTo(t * gw - gw / 2, .045 + .018 * Math.sin(t * 9 + sd * 30) + .01 * Math.sin(t * 23.7 + sd * 4) + .07 * k ** 3); }
    add(Dt, P(new THREE.ShapeGeometry(d).translate(c, y1 + m + .004, out * .0058)));
    add(Dt, P(new THREE.ShapeGeometry(new THREE.Shape().moveTo(-gw / 2, 0).lineTo(gw / 2, 0).lineTo(gw / 2, .022).lineTo(-gw / 2, .028)).translate(c, y1 + m + .004, out * .0062)));
    ax === 'x' ? solid(a1, 0, at - .02, a2, y2, at + .02) : solid(at - .02, 0, a1, at + .02, y2, a2); };
  pane('x', ZB, X1 + .04, 688, -1); pane('x', ZB, 688, X2 - .04, -1);
  pane('z', X1, ZB + .04, ZF - .04, -1); pane('z', X2, ZB + .04, ZF - .04, 1);
  // timetable case on the outside of the east end: anodised frame, a blank warm sheet behind glass, on four standoffs through the
  // end glass with caps inside. Built facing +z with the end glass at z 0, then turned to face +x.
  { const y1 = 1.0, w = .62, h = .92, f = .03, T = (m, g) => add(m, g.rotateY(Math.PI / 2).translate(X2, 0, 29.97));
    T(Al, rb(w, h, .03, .006).translate(0, y1 + h / 2, .04));
    for (const [px, py, pw, ph] of [[0, y1 + f / 2, w, f], [0, y1 + h - f / 2, w, f], [-w / 2 + f / 2, y1 + h / 2, f, h], [w / 2 - f / 2, y1 + h / 2, f, h]]) T(Al, rb(pw, ph, .05, .006).translate(px, py, .05));
    T(neon(0xffcf98, .9), new THREE.BoxGeometry(w - 2 * f, h - 2 * f, .002).translate(0, y1 + h / 2, .058));
    T(Gl, new THREE.BoxGeometry(w - 2 * f + .01, h - 2 * f + .01, .004).translate(0, y1 + h / 2, .07));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const px = sx * (w / 2 - .06), py = y1 + h / 2 + sy * (h / 2 - .06);
      T(St, cy(.009, .06, 12).rotateX(Math.PI / 2).translate(px, py, .02)); T(St, cy(.016, .006, 16).rotateX(Math.PI / 2).translate(px, py, -.012)); }
    solid(X2 + .02, y1, 29.97 - w / 2, X2 + .08, y1 + h, 29.97 + w / 2); }
  // the lamp: a U channel along the crown with two opal panels set up inside it; one shared shadow light from its middle
  { const sh = new THREE.Shape([[-.15, 0], [-.15, -.08], [-.147, -.08], [-.147, -.003], [.147, -.003], [.147, -.08], [.15, -.08], [.15, 0]].map(([a, b]) => new THREE.Vector2(29.995 + a, 2.512 + b)));
    add(Fr, alongX(sh, 686.03, 689.97)); for (const x of [686.03, 689.967]) add(Fr, rb(.003, .08, .3, .001).translate(x + .0015, 2.472, 29.995));
    for (const x of [687, 689]) opalPanel(z, x, 2.48, 29.995, Math.PI / 2, { w: .26, l: 1.5 });
    lit(z, 688, 2.38, 30.0, 80, [688, 0, 30.25], 1.4, 9, 0xffcc90); }
  // the roof stops a jump's head at 2.41 m; over the bench's back it sits higher, or a body stood on the back would be inside it and thrown out sideways
  solid(685.84, 2.41, 29.95, 690.16, 2.6, 31.0); solid(685.84, 2.6, 29.0, 690.16, 2.75, 29.95);
  solid(685.96, 2.318, ZF - .03, 690.04, 2.418, ZF + .03); // the front eave beam
  parkBench(z, 688, 0, 29.62);
  bin(z, 690.55, 0, 31.1);
}

// ---- vending machines: a painted steel cabinet with rolled edges on a dark plinth and four levelling feet, the door in pieces round
// a glazed spiral display ('snack') or under a blank backlit panel with a row of blank lit selection buttons ('lit'); a control column
// with a blank display, keypad plate, coin slot, return cup and lock; a delivery flap pushed in on a dark bin with a can in it;
// louvred vents on the sides; stood 60 mm off the wall with its cable to a socket. Own frame, front +z, turned to face +x.
function vending(z, Zc, kind, color, glow) {
  const X = 681.48, A = (m, g) => add(m, put(g, X, 0, Zc, Math.PI / 2)), W = .96;
  const Pt = M(z, 'paintedSteel', { color, roughness: .32, dirt: .45, dirtCol: [.36, .33, .3], wear: .35, edgeCol: [.7, .66, .6] }), Dk = M(z, 'paintedSteel', { color: 0x1b1b1a, roughness: .6, dirt: .5 }),
    In = M(z, 'paintedSteel', { color: 0x46443f, roughness: .5 }), St = M(z, 'brushedSteel'), G = M(z, 'galvanised'), Rb = M(z, 'rubber', { color: 0x161514 }), Gl = M(z, 'glass'),
    Bk = M(z, 'hardPlastic', { color: 0x141413, roughness: .25, wear: 0 }), Fl = M(z, 'hardPlastic', { color: 0x2e2b28, roughness: .3, wear: .1 });
  // feet, plinth, body, the door's pieces
  for (const fx of [-.4, .4]) for (const fz of [-.3, .22]) { A(Rb, cy(.028, .012, 16).translate(fx, .006, fz)); A(G, cy(.008, .03, 8).translate(fx, .027, fz)); A(G, hexNut().translate(fx, .014, fz)); }
  A(Dk, rb(W - .06, .08, .64, .006).translate(0, .07, -.03));
  A(Pt, rb(W, 1.74, .1, .022, 3).translate(0, .97, -.32)); // the body is a shell (back, sides, top, bottom) so the display and the flap's bin can be seen into
  for (const s of [-1, 1]) A(Pt, rb(.04, 1.74, .7, .022, 3).translate(s * (W / 2 - .02), .97, -.02));
  A(Pt, rb(W, .04, .7, .022, 3).translate(0, 1.82, -.02)); A(Pt, rb(W, .04, .7, .01).translate(0, .12, -.02));
  const dp = (x1, y1, x2, y2) => A(Pt, rb(x2 - x1, y2 - y1, .05, .01).translate((x1 + x2) / 2, (y1 + y2) / 2, .355));
  dp(-.475, .12, .475, .2); dp(-.475, .2, -.4, .44); dp(.1, .2, .475, .44); dp(-.475, .44, .475, .62); dp(.17, .62, .475, 1.82);
  for (const yy of [.4, 1.5]) A(St, cy(.011, .08, 12).translate(-.483, yy, .355)); // hinge knuckles
  if (kind === 'snack') {
    dp(-.475, .62, -.45, 1.82); dp(-.45, 1.76, .17, 1.82);
    A(Gl, new THREE.BoxGeometry(.63, 1.15, .006).translate(-.14, 1.19, .37));
    for (const s of [-1, 1]) { A(Rb, new THREE.BoxGeometry(.006, 1.14, .006).translate(-.14 + s * .31, 1.19, .376)); A(Rb, new THREE.BoxGeometry(.62, .006, .006).translate(-.14, 1.19 + s * .567, .376)); }
    A(In, new THREE.BoxGeometry(.64, 1.16, .01).translate(-.14, 1.19, -.26)); // the cavity: back, sides, top, floor
    for (const s of [-1, 1]) A(In, new THREE.BoxGeometry(.01, 1.16, .6).translate(-.14 + s * .325, 1.19, .03));
    A(In, new THREE.BoxGeometry(.64, .01, .6).translate(-.14, 1.775, .03)); A(In, new THREE.BoxGeometry(.64, .01, .6).translate(-.14, .615, .03));
    A(M(null, 'backlitPanel', { emit: [glow, .9] }), new THREE.BoxGeometry(.6, 1.1, .004).translate(-.14, 1.19, -.252)); // the lit back wall
    A(neon(glow, 3), new THREE.BoxGeometry(.6, .012, .012).translate(-.14, 1.762, .3)); // the LED strip behind the top rail
    const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * 6 * 2 * Math.PI; pts.push(new THREE.Vector3(.058 * Math.cos(a), .058 * Math.sin(a), -.21 + t * .5)); }
    const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 108, .0025, 4), pk = [M(z, 'hardPlastic', { color: 0xb8762e, roughness: .22, wear: .1, emit: [0x8a5426, .35] }), M(z, 'hardPlastic', { color: 0x6b7f3a, roughness: .22, wear: .1, emit: [0x4a5a28, .35] })];
    const bag = rb(.1, .13, .03, .013, 1), seal = new THREE.BoxGeometry(.1, .012, .006);
    for (let r = 0; r < 5; r++) { const sy = .66 + .23 * r;
      A(G, new THREE.BoxGeometry(.62, .005, .54).translate(-.14, sy, .02)); A(G, new THREE.BoxGeometry(.62, .03, .004).translate(-.14, sy + .015, .29));
      for (let c = 0; c < 4; c++) { const cx = -.45 + .155 * (c + .5) + .012, m = pk[(r + c) % 2];
        A(G, coil.clone().translate(cx, sy + .066, 0)); A(Dk, new THREE.BoxGeometry(.05, .06, .03).translate(cx, sy + .04, -.24));
        for (let k = 0; k < 6; k++) { const bz = -.17 + .0833 * k; A(m, bag.clone().rotateZ((((r * 7 + c * 3 + k) % 5) - 2) * .02).translate(cx, sy + .07, bz)); A(m, seal.clone().translate(cx, sy + .14, bz)); } } }
  } else {
    dp(-.475, .62, .17, 1.82);
    A(neon(glow, 1.1), new THREE.BoxGeometry(.56, .72, .004).translate(-.15, 1.4, .382));
    const Al = M(z, 'anodised', { color: 0xa8a69e, roughness: .35, dirt: .3 });
    for (const [px, py, pw, ph] of [[-.15, 1.04, .6, .02], [-.15, 1.76, .6, .02], [-.44, 1.4, .02, .74], [.14, 1.4, .02, .74]]) A(Al, rb(pw, ph, .014, .004).translate(px, py, .384));
    A(Gl, new THREE.BoxGeometry(.56, .72, .003).translate(-.15, 1.4, .388));
    const Ld = neon(glow, 1.1); // one material for all six (neon() makes a new one each call)
    for (let i = 0; i < 6; i++) { const bx = -.4 + .1 * i; A(St, rb(.074, .05, .01, .004).translate(bx, .9, .384)); A(Ld,new THREE.BoxGeometry(.056, .032, .006).translate(bx, .9, .388)); }
    A(St, rb(.56, .05, .006, .003).translate(-.15, .74, .382)); // a blank plate where a price strip would go
  }
  // control column
  A(Bk, rb(.2, .055, .01, .004).translate(.322, 1.62, .384));
  A(St, rb(.17, .2, .006, .003).translate(.322, 1.36, .383));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) A(St, rb(.038, .03, .01, .004).translate(.272 + .05 * i, 1.295 + .043 * j, .388));
  A(St, rb(.07, .1, .014, .006).translate(.29, 1.13, .386)); A(Bk, new THREE.BoxGeometry(.006, .045, .004).translate(.29, 1.13, .3935));
  A(St, cy(.014, .014, 16).rotateX(Math.PI / 2).translate(.375, 1.13, .387));
  A(St, rb(.12, .08, .012, .005).translate(.322, .82, .386)); A(Dk, new THREE.BoxGeometry(.094, .054, .004).translate(.322, .82, .3925));
  A(St, cy(.02, .018, 20).rotateX(Math.PI / 2).translate(.42, .7, .388)); A(Bk, new THREE.BoxGeometry(.004, .02, .004).translate(.42, .7, .397));
  // delivery flap, pushed in, on a dark bin with a can lying in it
  A(In, new THREE.BoxGeometry(.5, .26, .01).translate(-.15, .32, .12)); A(In, new THREE.BoxGeometry(.5, .01, .24).translate(-.15, .205, .24)); A(In, new THREE.BoxGeometry(.5, .01, .24).translate(-.15, .44, .24));
  for (const s of [-1, 1]) A(In, new THREE.BoxGeometry(.01, .24, .24).translate(-.15 + s * .245, .32, .24));
  for (const [px, py, pw, ph] of [[-.15, .205, .52, .016], [-.15, .435, .52, .016], [-.402, .32, .016, .24], [.102, .32, .016, .24]]) A(Bk, rb(pw, ph, .012, .004).translate(px, py, .384));
  A(Fl, rb(.49, .22, .006, .003).translate(0, -.112, 0).rotateX(.55).translate(-.15, .43, .36));
  A(M(z, 'anodised', { color: 0xb8b4aa, roughness: .3 }), can.clone().translate(0, -.056, 0).rotateZ(Math.PI / 2).rotateY(.2).translate(-.17, .244, .22));
  // vents on both sides: pressed louvres over dark slots
  for (const sx of [-1, 1]) for (let r = 0; r < 8; r++) for (const vz of [-.27, -.11]) { const yy = 1.48 + .035 * r;
    A(Bk, new THREE.BoxGeometry(.002, .011, .13).translate(sx * .4805, yy, vz)); A(Pt, rb(.008, .014, .14, .003).translate(sx * .481, yy + .01, vz)); }
  // cable to the wall socket
  A(Rb, cy(.012, .02, 12).rotateX(Math.PI / 2).translate(.3, .25, -.375));
  A(Rb, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[.3, .25, -.38], [.3, .16, -.395], [.32, .05, -.4], [.37, .04, -.405], [.38, .18, -.408], [.36, .28, -.41]].map(p => new THREE.Vector3(...p))), 40, .0055, 8));
  A(M(z, 'hardPlastic', { color: 0x9a968c, roughness: .5 }), rb(.085, .085, .035, .006).translate(.36, .32, -.4125));
  solid(681.11, 0, Zc - .49, 681.87, 1.86, Zc + .49);
  lit(z, 682.1, 1.3, Zc, 30, [685.5, 0, Zc], 1.3, 9, glow);
}

defZone('nL', { music: 'lot', ...dry, sky: 'night', air: .5, grp: 'n', k: 1, exp: .36, fog: [.012, .016, .03, .004], bloom: .4, wet: .15, box: [681, -20, 745, 50], probe: [712, 2.5, 15] });
{ // car park at night x[681,745] z[-20,50], out of the parking level's far door: pools of lamplight on wet asphalt, a bus shelter, vending machines, the moon
  const z = zones.nL, A = M(z, 'asphalt', { macro: .35, roughness: .45, detail: .6 }), C = M(z, 'concreteWall', { color: 0xc8c2b8, dirt: .6, dirtCol: [.42, .4, .36] }), F = M(z, 'concreteFloor', { color: 0x8c8882 });
  box(A, 680.55, -.3, -40, 766, 0, 70); // from the back of the west wall: the passage behind it has its own floor
  box(C, 680.55, 0, -20.4, 681.05, 3.4, 13); box(C, 680.55, 0, 15, 681.05, 3.4, 50.4); box(C, 680.55, 2.4, 13, 681.05, 3.4, 15); // the wall the passage comes out of
  box(C, 745, 0, -20.4, 745.4, 3.4, 50.4); box(C, 681, 0, -20.4, 745, 3.4, -20); box(C, 681, 0, 50, 745, 3.4, 50.4);
  block(neon(0xffe2b0, 5), 681.05, 2.55, 13.6, 681.09, 2.7, 14.4); lit(z, 681.4, 2.6, 14, 30, [684, 0, 14], 1.3, 9);
  const W = 18 / 7; // three rows of bays head to head, 4.8 m deep, the lamp columns on a kerbed island one bay wide in each row's median
  for (const zc of [-8, 15, 38]) {
    for (let x = 695 - 3.5 * W; x < 741; x += W) for (const k of [-1, 1]) bayLine(z, [[x, 0, zc + k * .8], [x, 0, zc + k * 5.6]], { on: 'asphalt' });
    for (const x of [695, 713, 731]) { const e = W / 2 - .07, E = x + e, Wx = x - e, S = zc - .8, N = zc + .8;
      kerb(z, [[E, 0, S], [Wx, 0, S], [Wx, 0, N], [E, 0, N], [E, 0, S]], { color: 0x9c978e }); box(F, Wx + .12, 0, S + .12, E - .12, .1, N - .12);
      mastLamp(z, x, .1, zc, 0, { heads: 2, power: 640, reach: .7, angle: .78, dist: 12 }); }
  }
  arrow(z, 716, 0, 3.5, -Math.PI / 2); arrow(z, 710, 0, 26.5, Math.PI / 2); speedBump(z, [[722, 0, -2.2], [722, 0, 9.2]]);
  for (const zc of [12.4, 15.6]) bollard(z, 681.5, 0, zc); // either side of the passage door
  [[703, 3.5, .3], [704.2, 4.4, 1.1], [703.4, 5.6, 2.4], [728, 27, .7], [729, 26.2, 1.9]].forEach(([x, zc, ry]) => cone(z, x, 0, zc, ry));
  shelter(z); vending(z, 17.7, 'lit', 0x8a2a22, 0xffcf98); vending(z, 18.85, 'snack', 0x284a54, 0xffd9a8);
}
