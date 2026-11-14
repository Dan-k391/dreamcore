// The hotel hallway behind where you start.
import { dry, zones, defZone } from '../core.js';
import { hotelTex } from '../tex.js';
import { dirt, glow, P, sign, wallMat } from '../mat.js';
import { block, box, lit } from '../build.js';

defZone('hT', { ...dry, step: 'carpet', grp: 'm', k: 1, exp: .34, fog: [.3, .2, .12, .004], bloom: .3, wet: .1, hum: .3, box: [2.4, 21.4, 5.2, 51.6], probe: [3.8, 1.5, 36] });
{ // hotel hallway x[2.6,5] z[21.4,51.6], through a door behind where you start: patterned carpet, panelled walls, doors that don't open
  const z = zones.hT, h = 2.8, C = P(z, { map: hotelTex.map, normalMap: hotelTex.normalMap, ...dirt }), W = wallMat(z, 0xe9dcc0), wood = P(z, { color: 0x3a2014, roughness: .4 }), brass = P(z, { color: 0xc9a25a, metalness: 1, roughness: .3 });
  box(C, 2.2, -.2, 21.4, 5.4, 0, 51.6); box(W, 2.2, h, 21.4, 5.4, h + .2, 51.6); box(W, 2.6, 2.4, 51.55, 5, h, 51.75);
  for (const [x, gap, doors] of [[2.2, 44, [24, 27.6, 31.2, 34.8, 38.4, 49]], [5, 30, [24, 27.6, 34.8, 38.4, 42, 45.6, 49]]]) { // west wall (way to the mall), east wall (way to the cinema)
    box(W, x, 0, 21.4, x + .4, h, gap); box(W, x, 0, gap + 2, x + .4, h, 51.6); box(W, x, 2.3, gap, x + .4, h, gap + 2);
    const f = x < 3 ? x + .4 : x - .03, k = x < 3 ? 1 : -1; // the wall's face, and which way it looks
    block(wood, f, 0, 21.4, f + .03, .9, gap); block(wood, f, 0, gap + 2, f + .03, .9, 51.55); // panelling
    for (const d of doors) { block(wood, f - .01, 0, d - .5, f + .04, 2.1, d + .5); block(brass, f + .015 + k * .05, .95, d + .32, f + .015 + k * .09, 1.02, d + .39); block(brass, f + .01, 1.55, d - .07, f + .02 + k * .03, 1.63, d + .07);
      block(glow, f + .005 + k * .04, 1.95, d + .78, f + .025 + k * .1, 2.15, d + .9); } // a sconce by each door
  }
  for (const zc of [24.6, 30.6, 36.6, 42.6, 48.6]) { block(glow, 3.6, h - .015, zc - .2, 4, h + .01, zc + .2); lit(z, 3.8, h - .08, zc, 50, [3.8, 0, zc], 1.35, 10, 0xffd9a0); }
  sign('EXIT', 3.8, 2.6, 51.54, Math.PI, .6, .22, '#8fffc0', '#021a0c');
}
