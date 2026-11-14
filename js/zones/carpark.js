// The car park at night.
import * as THREE from 'three';
import { dry, zones, defZone } from '../core.js';
import { concrete } from '../tex.js';
import { dirt, M, P, neon } from '../mat.js';
import { add, block, box, round, lit, post } from '../build.js';

defZone('nL', { ...dry, sky: 'night', air: .5, grp: 'n', k: 1, exp: .36, fog: [.012, .016, .03, .004], bloom: .4, wet: .15, box: [681, -20, 745, 50], probe: [712, 2.5, 15] });
{ // car park at night x[681,745] z[-20,50], out of the parking level's far door: pools of lamplight on wet asphalt, a bus shelter, vending machines, the moon
  const z = zones.nL, A = M(z, 'asphalt', { macro: .35, roughness: .45, detail: .6 }), C = P(z, { ...concrete, ...dirt }), paint = P(z, { color: 0xc8c8be, roughness: .6 }), iron = P(z, { color: 0x1c2224, metalness: .7, roughness: .4 }),
    cone = P(z, { color: 0xe8601c, roughness: .5 }), glass = P(z, { color: 0x9fb4b8, metalness: .9, roughness: .08 }), lampG = neon(0xffc98a, 7);
  box(A, 660, -.3, -40, 766, 0, 70);
  box(C, 680.55, 0, -20.4, 681.05, 3.4, 13); box(C, 680.55, 0, 15, 681.05, 3.4, 50.4); box(C, 680.55, 2.4, 13, 681.05, 3.4, 15); // the wall the passage comes out of
  box(C, 745, 0, -20.4, 745.4, 3.4, 50.4); box(C, 681, 0, -20.4, 745, 3.4, -20); box(C, 681, 0, 50, 745, 3.4, 50.4);
  block(neon(0xffe2b0, 5), 681.05, 2.55, 13.6, 681.09, 2.7, 14.4); lit(z, 681.4, 2.6, 14, 30, [684, 0, 14], 1.3, 9);
  for (const zc of [-8, 15, 38]) { for (const x of [695, 713, 731]) post(iron, lampG, x, 0, zc, .7, 0, 520, z);
    for (let x = 686; x < 741; x += 2.6) for (const k of [-1, 1]) if (Math.abs(x - 713) > 20 || zc !== 15 || k > 0) block(paint, x, 0, zc + k * .6 - (k < 0 ? 5 : 0), x + .12, .004, zc + k * .6 + (k > 0 ? 5 : 0)); } // bays either side of each row of lamps
  for (const [x, zc] of [[703, 3.5], [704.2, 4.4], [703.4, 5.6], [728, 27], [729, 26.2]]) { add(cone, new THREE.CylinderGeometry(.025, .13, .5, 16).translate(x, .27, zc)); block(cone, x - .17, 0, zc - .17, x + .17, .03, zc + .17); block(paint, x - .075, .2, zc - .075, x + .075, .3, zc + .075); round(x, zc, .13, 0, .25); round(x, zc, .07, .25, .52); }
  { const x = 688, zc = 30; // bus shelter: a lit panel, a bench, a glass back
    for (const [a, b] of [[x - 2, zc - .7], [x + 2, zc - .7], [x - 2, zc + .7], [x + 2, zc + .7]]) box(iron, a - .04, 0, b - .04, a + .04, 2.4, b + .04);
    box(iron, x - 2.2, 2.4, zc - .9, x + 2.2, 2.48, zc + .9); box(glass, x - 2, .3, zc - .72, x + 2, 2.3, zc - .7); box(iron, x - 1.2, .42, zc - .5, x + 1.2, .47, zc - .15);
    box(iron, x + 1.9, .2, zc - .6, x + 2, 2.2, zc + .6); block(neon(0xfff3dc, 3), x + 1.88, .35, zc - .5, x + 1.9, 2.05, zc + .5); lit(z, x + 1.6, 1.3, zc, 60, [x - 3, 0, zc], 1.3, 10); }
  [[0xc22a2a, 0xffe9e0], [0x1f5fae, 0xdff1ff]].forEach(([c, g], i) => { const z1 = 17.2 + 1.15 * i; // vending machines by the door
    box(P(z, { color: c, roughness: .35 }), 681.05, 0, z1, 681.85, 1.85, z1 + 1); block(neon(g, 2.6), 681.85, .75, z1 + .08, 681.87, 1.75, z1 + .92); block(iron, 681.85, .25, z1 + .2, 681.875, .5, z1 + .8);
    lit(z, 682.1, 1.3, z1 + .5, 35, [686, 0, z1 + .5], 1.3, 9, g); });
}
