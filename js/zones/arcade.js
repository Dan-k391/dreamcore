// The flooded arcade between the pool hall and the night hall.
import { WY, dark, zones, defZone } from '../core.js';
import { poolMats } from '../mat.js';
import { flats, pools, rings, box, slab } from '../build.js';
import { troffer, stepLight } from '../props/lights.js';
import { drain } from '../props/metalwork.js';
import { swimRing } from '../props/play.js';

defZone('pC', { ...dark, exp: .26, bloom: .3, wet: .6, box: [9.4, -14.8, 21, -9.2], probe: [15.2, 1.6, -12], env: [[9.4, -.3, -14.8], [21, 3.6, -9.2]], shimmer: .35 });
flats.push([9.4, -14, 24, -10, (x, z) => -.3]); // flooded arcade and its channel
pools.push([9.4, -14.4, 24, -9.6, -.3, 'pC', ['pH', 'pC', 'pN'], [.003, .01, .009]]);
poolMats(zones.pC);
{ // flooded arcade x[9.4,21] z[-14,-10]: arched niches, ankle-deep water running on into the night hall's pool
  const C = zones.pC.tile, arches = [10.9, 13.7, 16.5, 19.3].map(c => ['arch', c, 1.8, 2.5]);
  box(C, 9.4, -.5, -14.8, 20.6, -.3, -9.2); box(C, 9.4, 3.6, -14.8, 20.6, 3.9, -9.2); // everything stops at 20.6, where the night hall's wall begins: shared faces flicker
  box(C, 20.6, -.6, -14, 24, -.3, -10); // the channel's floor through the night hall's deck, as wide as its gap in the deck; its end is the riser down to the pool's first step (-.6)
  slab(C, 'x', -14.4, .4, 9.4, 20.6, -.5, 3.6, arches); box(C, 9.4, -.5, -14.8, 20.6, 3.6, -14.4);
  slab(C, 'x', -10, .4, 9.4, 20.6, -.5, 3.6, arches); box(C, 9.4, -.5, -9.6, 20.6, 3.6, -9.2);
  // two recessed 600 troffers; power .34 of the old 60 because the kit scales it by (height / 2.7)^2, so the light is unchanged
  for (const x of [12.4, 18.2]) troffer(zones.pC, x, 3.6, -12, 0, { w: .6, l: .6, power: 34 });
  // a linear drain down the middle of the flooded floor, seen through the water; a step light low on each pier at the step down from the pool hall
  drain(zones.pC, 15, -.3, -12, Math.PI / 2, { l: 9, w: .15 });
  stepLight(zones.pC, 9.72, .22, -14, 0, { power: 1.2 }); stepLight(zones.pC, 9.72, .22, -10, Math.PI, { power: 1.2 });
}
rings.push((m => (m.position.set(17.4, WY + .05, -11.3), m))(swimRing(zones.pC, { color: 0x4fbfa5 }))); // one ring drifted in from the pool hall
