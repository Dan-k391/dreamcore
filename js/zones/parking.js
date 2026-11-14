// The parking level off the corridor.
import { dry, zones, defZone } from '../core.js';
import { M, P, sign } from '../mat.js';
import { block, box } from '../build.js';
import { pillar, beam, wheelStop, bayLine, arrow, speedBump } from '../props/structure.js';
import { batten } from '../props/lights.js';
import { bollard, drain } from '../props/metalwork.js';

defZone('pK', { ...dry, grp: 'k', k: .9, exp: .3, fog: [.12, .1, .06, .006], bloom: .32, wet: .8, hum: .5, box: [36.8, 2, 67, 26], probe: [52, 1.4, 14] });
{ // parking level x[37.2,66.6] z[2.4,25.6], low ceiling, off the corridor's far end: a 6 m column grid (x 43..61, z 8/14/20) under downstand
  // beams, a row of 3 m bays along each wall headed by wheel stops, a two-way aisle split by the middle columns and their drain line, battens
  const z = zones.pK, h = 2.6, F = M(z, 'concreteFloor', { color: 0xfffaf0 }), C = M(z, 'concreteWall', { color: 0xf4eee4, dirt: .4, dirtCol: [.5, .47, .42] }), Y = P(z, { color: 0xe0b020, roughness: .6 });
  box(F, 36.8, -.2, 2, 67, 0, 26); box(C, 36.8, h, 2, 67, h + .3, 26); box(C, 36.8, 0, 2, 67, h, 2.4); box(C, 36.8, 0, 25.6, 67, h, 26);
  box(C, 36.8, 0, 2.4, 37.2, h, 9.8); box(C, 36.8, 0, 12, 37.2, h, 25.6); box(C, 36.8, 2.2, 9.8, 37.2, h, 12); // west, door from the corridor
  box(C, 66.6, 0, 2.4, 67, h, 13); box(C, 66.6, 0, 15, 67, h, 25.6); box(C, 66.6, 2.4, 13, 67, h, 15); // east, the way out
  [43, 49, 55, 61].forEach((x, i) => {
    beam(z, [[x, h, 2.4], [x, h, 25.6]]);
    pillar(z, x, 0, 8, 0, { h: h - .3, num: String(11 + i) }); // wall rows: guards and numbers toward the aisle
    pillar(z, x, 0, 14, 0, { h: h - .3, num: String(21 + i), guard: [0, 1, 2, 3], numFaces: [1, 3] }); // the middle row, traffic both sides
    pillar(z, x, 0, 20, Math.PI, { h: h - .3, num: String(31 + i) });
  });
  for (const [a, b, s] of [[2.4, 7.4, 1], [25.6, 20.6, -1]]) { // bays 3 m wide on the column lines, a wheel stop 0.75 m off the wall in each
    for (let x = 40; x < 66; x += 3) bayLine(z, [[x, 0, a], [x, 0, b]], { on: 'concrete' });
    for (let x = 38.6; x < 66; x += 3) wheelStop(z, Math.min(x, 65.3), 0, a + s * .75);
  }
  for (const x of [46, 58]) { arrow(z, x, 0, 11, -Math.PI / 2); arrow(z, x - 6, 0, 17, Math.PI / 2); } // keep left: east on the south lane, west on the north
  for (let x = 39; x < 66; x += 2) if (Math.min(...[43, 49, 55, 61].map(c => Math.abs(c - x))) > 1) drain(z, x, 0, 14, Math.PI / 2, { l: 2 }); // drain line under the middle columns
  speedBump(z, [[64, 0, 8.4], [64, 0, 19.6]]); // before the way out
  for (const [x, zc] of [[37.65, 9.3], [37.65, 12.5], [66.15, 12.5], [66.15, 15.5]]) bollard(z, x, 0, zc); // either side of each door
  for (const [a, b] of [[2.4, 2.42], [25.58, 25.6]]) block(Y, 37.2, .9, a, 66.6, 1.1, b); // a painted stripe along the walls
  for (const x of [40, 46, 52, 58, 64]) for (const zc of [5, 14, 23]) batten(z, x, h, zc, 0, x === 58 && zc === 23 ? { l: 1.5, on: false } : { l: 1.5, power: 80 }); // one dead
  sign('EXIT', 66.58, 2, 12.3, -Math.PI / 2, .7, .25, '#8fffc0', '#021a0c'); sign('P2', 37.22, 1.7, 14, Math.PI / 2, .9, .5, '#e0b020', '#555', 1);
}
