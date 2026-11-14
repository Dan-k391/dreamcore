// The gallery pool off the corridor.
import { WY, zones, defZone } from '../core.js';
import { glow, poolMats, beachBall } from '../mat.js';
import { flats, pools, loose, box, fixture } from '../build.js';

defZone('pG', { grp: 'g', k: .85, exp: .34, fog: [.75, .82, .8, .0015], tint: [.99, 1, .99], sat: 1, bloom: .3, shaft: 0, hum: 0, water: 1, wet: .7,
        box: [18.3, 12.4, 28.1, 39.4], probe: [23.2, 2.6, 25], env: [[18.7, -1.4, 12.8], [27.7, 6, 39]], band: -99, bandCol: [1, 1, 1], shimmer: .2, caus: .25 });
flats.push([20.9, 16, 25.5, 35, (x, z) => -.3 * Math.min(4, Math.floor((35 - z) / .5) + 1)]); // gallery pool, steps at the far end
pools.push([20.9, 16, 25.5, 35, -1.2, 'pG', ['bC', 'pG', 'pV'], [.08, .17, .15]]);
poolMats(zones.pG);
{ // gallery pool x[18.7,27.7] z[12.8,39], 6m tall, off the corridor: a long bright bath with pilasters, high strip lights and handrails
  const z = zones.pG, T = z.tile, M = z.metal;
  box(T, 18.3, -1.4, 12.4, 20.9, 0, 39.4); box(T, 25.5, -1.4, 12.4, 28.1, 0, 39.4); box(T, 20.9, -1.4, 12.4, 25.5, 0, 16); box(T, 20.9, -1.4, 35, 25.5, 0, 39.4); // deck
  box(T, 20.9, -1.4, 16, 25.5, -1.2, 35); // basin
  for (let i = 1; i < 4; i++) box(T, 18.31, -1.2, 35 - .5 * i, 28.09, -.3 * i, 39.39); // steps at the far end, running on under the decks like the sunlit pool's
  box(T, 18.3, 6, 12.4, 28.1, 6.3, 39.4); // ceiling
  box(T, 18.3, 0, 12.4, 18.7, 6, 39.4); box(T, 27.7, 0, 12.4, 28.1, 6, 39.4); // side walls
  for (const zw of [12.4, 39]) { box(T, 18.7, 0, zw, 22, 6, zw + .4); box(T, 24.4, 0, zw, 27.7, 6, zw + .4); box(T, 22, 2.3, zw, 24.4, 6, zw + .4); } // end walls, each with a door
  for (let i = 0; i < 10; i++) { const zc = 14.4 + 2.6 * i; box(T, 18.7, 0, zc - .25, 18.95, 6, zc + .25); box(T, 27.45, 0, zc - .25, 27.7, 6, zc + .25); } // pilasters
  for (let i = 0; i < 9; i++) { const zc = 15.7 + 2.6 * i; // a strip light high on each wall between every pair of pilasters
    box(glow, 18.7, 4.6, zc - .8, 18.74, 5.1, zc + .8); box(glow, 27.66, 4.6, zc - .8, 27.7, 5.1, zc + .8);
    fixture(z, 19.15, 4.85, zc, 3.5); fixture(z, 27.25, 4.85, zc, 3.5);
  }
  for (const zc of [20.5, 30.5]) { box(glow, 22.8, 5.97, zc - .4, 23.6, 6.01, zc + .4); fixture(z, 23.2, 5.6, zc, 12); } // two ceiling lights
  for (const x of [20.75, 25.65]) { // handrails along both sides of the pool; they block, so the ways in are the near end and the steps
    box(M, x - .02, .93, 16.2, x + .02, .97, 34.8); box(M, x - .015, .5, 16.2, x + .015, .53, 34.8);
    for (let i = 0; i <= 10; i++) box(M, x - .02, 0, 16.18 + 1.86 * i, x + .02, .95, 16.22 + 1.86 * i);
  }
}
loose.push({ mesh: beachBall(zones.pG), r: .25, pos: [23.6, WY + .21, 27.5], region: [18.7, 12.8, 27.7, 39], float: .08, bounce: .6, grip: .6, spin: 1, solid: 1 }); // a beach ball on the water
