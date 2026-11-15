// The gallery pool off the corridor.
import { WY, zones, defZone } from '../core.js';
import { poolMats } from '../mat.js';
import { flats, pools, loose, box, solid, fixture } from '../build.js';
import { poolLadder, railing, drain } from '../props/metalwork.js';
import { beachBall, laneRope } from '../props/play.js';
import { mallBench } from '../props/garden.js';
import { sconce, opalPanel } from '../props/lights.js';

defZone('pG', { music: 'gallery', grp: 'g', k: .85, exp: .34, fog: [.75, .82, .8, .0015], tint: [.99, 1, .99], sat: 1, bloom: .3, shaft: 0, hum: 0, water: 1, wet: .7,
        box: [18.3, 12.4, 28.1, 39.4], probe: [23.2, 2.6, 25], env: [[18.7, -1.4, 12.8], [27.7, 6, 39]], band: -99, bandCol: [1, 1, 1], shimmer: .2, caus: .25 });
flats.push([20.9, 16, 25.5, 35, (x, z) => -.3 * Math.min(4, Math.floor((35 - z) / .5) + 1)]); // gallery pool, steps at the far end
pools.push([20.9, 16, 25.5, 35, -1.2, 'pG', ['bC', 'pG', 'pV'], [.08, .17, .15]]);
poolMats(zones.pG);
{ // gallery pool x[18.7,27.7] z[12.8,39], 6m tall, off the corridor: a long bright bath with pilasters, brass sconces, a gutter and handrails
  const z = zones.pG, T = z.tile, M = z.metal;
  box(T, 18.3, -1.4, 12.4, 20.9, 0, 39.4); box(T, 25.5, -1.4, 12.4, 28.1, 0, 39.4); box(T, 20.9, -1.4, 12.4, 25.5, 0, 16); box(T, 20.9, -1.4, 35, 25.5, 0, 39.4); // deck
  box(T, 20.9, -1.4, 16, 25.5, -1.2, 35); // basin
  for (let i = 1; i < 4; i++) box(T, 18.31, -1.2, 35 - .5 * i, 28.09, -.3 * i, 39.39); // steps at the far end, running on under the decks like the sunlit pool's
  box(T, 18.3, 6, 12.4, 28.1, 6.3, 39.4); // ceiling
  box(T, 18.3, 0, 12.4, 18.7, 6, 39.4); box(T, 27.7, 0, 12.4, 28.1, 6, 39.4); // side walls
  for (const zw of [12.4, 39]) { box(T, 18.7, 0, zw, 22, 6, zw + .4); box(T, 24.4, 0, zw, 27.7, 6, zw + .4); box(T, 22, 2.3, zw, 24.4, 6, zw + .4); } // end walls, each with a door
  for (let i = 0; i < 10; i++) { const zc = 14.4 + 2.6 * i; box(T, 18.7, 0, zc - .25, 18.95, 6, zc + .25); box(T, 27.45, 0, zc - .25, 27.7, 6, zc + .25); } // pilasters
  for (let i = 0; i < 9; i++) { const zc = 15.7 + 2.6 * i; // a brass sconce on each wall between every pair of pilasters, its light thrown up the tile
    sconce(z, 18.7, 2.3, zc, Math.PI / 2, { power: 0 }); sconce(z, 27.7, 2.3, zc, -Math.PI / 2, { power: 0 });
    fixture(z, 19, 3.1, zc, 5); fixture(z, 27.4, 3.1, zc, 5);
  }
  for (const zc of [20.5, 30.5]) { opalPanel(z, 23.2, 6, zc, 0, { w: .8, l: .8 }); fixture(z, 23.2, 5.6, zc, 15); } // two ceiling panels
  // handrails along both sides of the pool, set back behind the gutter; they block, so the ways in are the near end, the ladders and the steps
  for (const x of [20.5, 25.9]) railing(z, [[x, 0, 17.4], [x, 0, 34.8]]);
  for (const x of [20.76, 25.64]) drain(z, x, 0, 25.48, 0, { l: 19.04, w: .2 }); // the overflow gutter: a slot grating along both sides and the near end
  drain(z, 23.2, 0, 15.86, Math.PI / 2, { l: 5.08, w: .2 });
  poolLadder(z, 20.9, 0, 16.8, Math.PI / 2); poolLadder(z, 25.5, 0, 16.8, -Math.PI / 2); // a ladder each side at the deep near end, before the rails start
  laneRope(z, [[23.2, WY, 16.06], [23.2, WY, 34.94]], { solid: false }); // two lanes, anchored to the end walls
  solid(23.14, WY - .12, 16.06, 23.26, WY, 34.4); // the rope's own solid stops short of the top step, where it would be a ledge to stand on
  mallBench(z, 19.45, 0, 26.1, Math.PI / 2); mallBench(z, 27, 0, 20.9, -Math.PI / 2); // one each side, between pilasters under a sconce
}
loose.push({ mesh: beachBall(zones.pG), r: .25, pos: [23.6, WY + .21, 27.5], region: [18.7, 12.8, 27.7, 39], float: .08, bounce: .6, grip: .6, spin: 1, solid: 1 }); // a beach ball on the water
