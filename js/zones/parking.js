// The parking level off the corridor.
import { dry, zones, defZone } from '../core.js';
import { concrete } from '../tex.js';
import { dirt, P, neon, sign } from '../mat.js';
import { block, box, lit } from '../build.js';

defZone('pK', { ...dry, grp: 'k', k: .9, exp: .3, fog: [.12, .1, .06, .006], bloom: .32, wet: .8, hum: .5, box: [36.8, 2, 67, 26], probe: [52, 1.4, 14] });
{ // parking level x[37.2,66.6] z[2.4,25.6], low ceiling, off the corridor's far end: concrete, painted bays, tube lights
  const z = zones.pK, h = 2.6, C = P(z, { ...concrete, ...dirt }), Y = P(z, { color: 0xe0b020, roughness: .6 }), paint = P(z, { color: 0xd8d8d0, roughness: .7 }), tubeL = neon(0xfff0cf, 9);
  box(C, 36.8, -.2, 2, 67, 0, 26); box(C, 36.8, h, 2, 67, h + .3, 26); box(C, 36.8, 0, 2, 67, h, 2.4); box(C, 36.8, 0, 25.6, 67, h, 26);
  box(C, 36.8, 0, 2.4, 37.2, h, 9.8); box(C, 36.8, 0, 12, 37.2, h, 25.6); box(C, 36.8, 2.2, 9.8, 37.2, h, 12); // west, door from the corridor
  box(C, 66.6, 0, 2.4, 67, h, 13); box(C, 66.6, 0, 15, 67, h, 25.6); box(C, 66.6, 2.4, 13, 67, h, 15); // east, the way out
  for (const x of [43, 49, 55, 61]) { box(C, x - .2, 2.3, 2.4, x + .2, h, 25.6); for (const zc of [8, 14, 20]) { box(C, x - .25, 0, zc - .25, x + .25, 2.3, zc + .25); block(Y, x - .26, 0, zc - .26, x + .26, 1, zc + .26); } }
  for (let x = 38.5; x < 66; x += 2.5) for (const [a, b] of [[2.4, 7.4], [20.6, 25.6]]) { block(paint, x, 0, a, x + .1, .004, b); box(C, x + .6, 0, a < 5 ? 2.9 : 24.9, x + 2, .12, a < 5 ? 3.1 : 25.1); } // bays and wheel stops
  for (const [a, b] of [[2.4, 2.42], [25.58, 25.6]]) block(Y, 37.2, .9, a, 66.6, 1.1, b); // a painted stripe along the walls
  for (const x of [40, 46, 52, 58, 64]) for (const zc of [5, 14, 23]) { block(tubeL, x - .6, h - .05, zc - .04, x + .6, h - .01, zc + .04); lit(z, x, h - .1, zc, 55, [x, 0, zc], 1.4, 12, 0xffe9c0); }
  sign('EXIT', 66.58, 2, 12.3, -Math.PI / 2, .7, .25, '#8fffc0', '#021a0c'); sign('P2', 37.22, 1.7, 14, Math.PI / 2, .9, .5, '#e0b020', '#555', 1);
}
