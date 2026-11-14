// The flooded arcade between the pool hall and the night hall.
import { V, dark, zones, defZone } from '../core.js';
import { glow, poolMats } from '../mat.js';
import { emitters, flats, pools, box, slab } from '../build.js';

defZone('pC', { ...dark, exp: .26, bloom: .3, wet: .6, box: [9.4, -14.8, 21, -9.2], probe: [15.2, 1.6, -12], env: [[9.4, -.3, -14.8], [21, 3.6, -9.2]], shimmer: .35 });
flats.push([9.4, -14, 24, -10, (x, z) => -.3]); // flooded arcade and its channel
pools.push([9.4, -14.4, 24, -9.6, -.3, 'pC', ['pH', 'pC', 'pN'], [.003, .01, .009]]);
poolMats(zones.pC);
{ // flooded arcade x[9.4,21] z[-14,-10]: arched niches, ankle-deep water running on into the night hall's pool
  const C = zones.pC.tile, arches = [10.9, 13.7, 16.5, 19.3].map(c => ['arch', c, 1.8, 2.5]);
  box(C, 9.4, -.5, -14.8, 24, -.3, -9.2); box(C, 9.4, 3.6, -14.8, 20.6, 3.9, -9.2); // everything stops at 20.6, where the night hall's wall begins: shared faces flicker
  slab(C, 'x', -14.4, .4, 9.4, 20.6, -.5, 3.6, arches); box(C, 9.4, -.5, -14.8, 20.6, 3.6, -14.4);
  slab(C, 'x', -10, .4, 9.4, 20.6, -.5, 3.6, arches); box(C, 9.4, -.5, -9.6, 20.6, 3.6, -9.2);
  for (const x of [12.4, 18.2]) { box(glow, x - .3, 3.585, -12.3, x + .3, 3.62, -11.7); emitters.push({ zone: zones.pC, p: V(x, 3.5, -12), t: V(x, 0, -12), power: 60, angle: 1.4, dist: 14, color: 0xffedc4 }); }
}
