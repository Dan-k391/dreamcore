// The cinema.
import { dry, zones, defZone } from '../core.js';
import { hotelTex } from '../tex.js';
import { dirt, P, neon, aisle, wallMat } from '../mat.js';
import { colliders, flats, block, box, lit } from '../build.js';

defZone('cN', { ...dry, step: 'carpet', grp: 'c', k: 1.1, exp: .36, fog: [.01, .008, .01, .01], bloom: .4, wet: .2, box: [5.2, 24, 17.8, 38], probe: [10, 1.5, 31] });
{ // cinema x[5.6,17.4] z[24.4,37.6]: the floor steps down in tiers toward a blank glowing screen
  const z = zones.cN, h = 5, R = wallMat(z, 0x4a1016), C = P(z, { map: hotelTex.map, normalMap: hotelTex.normalMap, color: 0x8a8a8a, ...dirt }), seat = P(z, { color: 0x7a1420, roughness: .8 }), K = P(z, { color: 0x0a0a0a, roughness: .9 });
  box(K, 5.4, h, 24, 17.8, h + .2, 38); box(R, 5.4, 0, 24, 17.8, h, 24.4); box(R, 5.4, 0, 37.6, 17.8, h, 38); box(R, 17.4, -1.4, 24.4, 17.8, h, 37.6);
  box(R, 5.4, 0, 24.4, 5.6, h, 30); box(R, 5.4, 0, 32, 5.6, h, 37.6); box(R, 5.4, 2.3, 30, 5.6, h, 32);
  [[5.4, 7.6], [7.6, 9.6], [9.6, 11.6], [11.6, 13.6], [13.6, 17.4]].forEach(([x1, x2], i) => { const y = -.25 * i;
    block(C, x1, -1.4, 24.4, x2, y, 37.6); if (i) flats.push([x1, 24.4, x2, 37.6, () => y]);
    for (let a = x1 + .5; a < x2; a++) for (const b of [29.95, 32.05]) block(aisle, a - .03, y, b - .03, a + .03, y + .012, b + .03);
    if (i < 4) for (const [a, b] of [[24.6, 29.8], [32.2, 37.4]]) { const x = x1 + .5; colliders.push([x, a, x + .62, b]); // a row of seats either side of the aisle
      for (let zc = a + .3; zc < b; zc += .65) { block(seat, x + .12, y, zc - .28, x + .62, y + .42, zc + .28); block(seat, x, y, zc - .28, x + .12, y + 1, zc + .28); } }
  });
  block(neon(0xfff4e2, 1.1), 17.3, -.2, 26, 17.39, 3.8, 36); lit(z, 17, 1.8, 31, 300, [8, -.3, 31], 1.25, 18, 0xfff1dd); // the screen lights the room
}
