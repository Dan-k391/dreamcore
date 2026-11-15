// The car park at night.
import * as THREE from 'three';
import { dry, zones, defZone } from '../core.js';
import { M, P, neon } from '../mat.js';
import { add, put, block, box, round, lit } from '../build.js';
import { mastLamp } from '../props/lights.js';

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

defZone('nL', { ...dry, sky: 'night', air: .5, grp: 'n', k: 1, exp: .36, fog: [.012, .016, .03, .004], bloom: .4, wet: .15, box: [681, -20, 745, 50], probe: [712, 2.5, 15] });
{ // car park at night x[681,745] z[-20,50], out of the parking level's far door: pools of lamplight on wet asphalt, a bus shelter, vending machines, the moon
  const z = zones.nL, A = M(z, 'asphalt', { macro: .35, roughness: .45, detail: .6 }), C = M(z, 'concreteWall', { color: 0xc8c2b8, dirt: .6, dirtCol: [.42, .4, .36] }), F = M(z, 'concreteFloor', { color: 0x8c8882 }), iron = P(z, { color: 0x1c2224, metalness: .7, roughness: .4 }),
    glass = P(z, { color: 0x9fb4b8, metalness: .9, roughness: .08 });
  box(A, 660, -.3, -40, 766, 0, 70);
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
  { const x = 688, zc = 30; // bus shelter: a lit panel, a bench, a glass back
    for (const [a, b] of [[x - 2, zc - .7], [x + 2, zc - .7], [x - 2, zc + .7], [x + 2, zc + .7]]) box(iron, a - .04, 0, b - .04, a + .04, 2.4, b + .04);
    box(iron, x - 2.2, 2.4, zc - .9, x + 2.2, 2.48, zc + .9); box(glass, x - 2, .3, zc - .72, x + 2, 2.3, zc - .7); parkBench(z, x, 0, zc - .35);
    box(iron, x + 1.9, .2, zc - .6, x + 2, 2.2, zc + .6); block(neon(0xffd8a8, 1.5), x + 1.88, .35, zc - .5, x + 1.9, 2.05, zc + .5); lit(z, x + 1.6, 1.3, zc, 60, [x - 3, 0, zc], 1.3, 10); }
  [[0xc22a2a, 0xffe6c4], [0x1f5fae, 0xfff0d6]].forEach(([c, g], i) => { const z1 = 17.2 + 1.15 * i; // vending machines by the door
    box(P(z, { color: c, roughness: .35 }), 681.05, 0, z1, 681.85, 1.85, z1 + 1); block(neon(g, 2.6), 681.85, .75, z1 + .08, 681.87, 1.75, z1 + .92); block(iron, 681.85, .25, z1 + .2, 681.875, .5, z1 + .8);
    lit(z, 682.1, 1.3, z1 + .5, 35, [686, 0, z1 + .5], 1.3, 9, g); });
}
