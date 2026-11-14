// The vaulted hall, knee-deep in water.
import { V, zones, defZone } from '../core.js';
import { glow, poolMats, sign } from '../mat.js';
import { emitters, flats, pools, box, slab, fixture } from '../build.js';
import { pier } from '../props/structure.js';
import { railing } from '../props/metalwork.js';
import { poolLight, opalPanel } from '../props/lights.js';

defZone('pV', { grp: 'g', k: .8, exp: .3, fog: [.02, .03, .035, .003], tint: [1, 1, .99], sat: 1, bloom: .3, shaft: 0, hum: 0, water: 1, wet: .9,
        box: [11.6, 39.4, 36.4, 63.4], probe: [24, 2, 49.25], env: [[12, -.8, 40.6], [36, 5.2, 63]], band: 1.15, bandCol: [.07, .17, .36], shimmer: .3, caus: .35 });
flats.push([22, 40.2, 24.4, 41, (x, z) => (z < 40.7 ? -.3 : -.6)]); flats.push([12, 41, 36, 63, (x, z) => -.6]); // passage down into the vaulted hall
pools.push([12, 40.2, 36, 63, -.6, 'pV', ['pG', 'pV'], [.006, .012, .016]]);
poolMats(zones.pV);
{ // vaulted hall x[12,36] z[41,63], knee-deep water throughout: three walls of walk-through arches, light wells overhead, a far wall of windows
  const z = zones.pV, T = z.tile, arches = [14.4, 19.2, 24, 28.8, 33.6].map(c => ['arch', c, 3.2, 3.6]);
  box(T, 22, -.8, 39.4, 24.4, 0, 40.2); box(T, 22, -.8, 40.2, 24.4, -.3, 40.7); box(T, 11.6, -.8, 40.6, 36.4, -.6, 63.4); // passage from the gallery stepping down, then the hall floor
  box(T, 21.6, -.8, 39.4, 22, 2.6, 40.6); box(T, 24.4, -.8, 39.4, 24.8, 2.6, 40.6); box(T, 22, 2.3, 39.4, 24.4, 2.6, 40.6); // passage walls and roof
  box(T, 11.6, 5.2, 40.6, 36.4, 5.5, 63.4); // ceiling
  box(T, 11.6, -.8, 40.6, 12, 5.2, 63.4); box(T, 36, -.8, 40.6, 36.4, 5.2, 48.4); box(T, 36, -.8, 50.4, 36.4, 5.2, 63.4); box(T, 36, 2.4, 48.4, 36.4, 5.2, 50.4); // side walls; a door in the east one
  box(T, 35, -.8, 48.4, 35.5, -.3, 50.4); box(T, 35.5, -.8, 48.4, 36.4, 0, 50.4); flats.push([35, 48.4, 35.5, 50.4, () => -.3], [35.5, 48.4, 36, 50.4, () => 0]); // two steps up out of the water to it
  sign('EXIT', 35.98, 2.85, 49.4, -Math.PI / 2, .7, .25, '#8fffc0', '#021a0c');
  box(T, 12, -.8, 40.6, 22, 5.2, 41); box(T, 24.4, -.8, 40.6, 36, 5.2, 41); box(T, 22, 2.3, 40.6, 24.4, 5.2, 41); // north wall, door
  for (const zc of [46.5, 52, 57.5]) { slab(T, 'x', zc - .3, .6, 12, 36, -.8, 5.2, arches, true);
    for (const [x, w] of [[12.4, .8], [16.8, 1.6], [21.6, 1.6], [26.4, 1.6], [31.2, 1.6], [35.6, .8]]) pier(z, x, -.6, zc, 0, { w: w + .02, d: .62, h: 1.8, color: 0xe4e2dc }); // stone dressings: a plinth in the water, an impost the arches spring from at 1.2
  }
  slab(T, 'x', 63, .4, 12, 36, -.8, 5.2, [14, 18, 22, 26, 30, 34].map(c => ['pill', c, 1.3, 2.5, 3.6])); box(glow, 12, -.8, 63.45, 36, 5.2, 63.7); // glowing windows at the far end
  for (const zc of [43.75, 49.25, 54.75, 60.25]) { // each bay: a shadow-casting light well in the middle, two soft ones to the sides
    box(glow, 23.6, 5.17, zc - .4, 24.4, 5.21, zc + .4); emitters.push({ zone: z, p: V(24, 5.1, zc), t: V(24, -.6, zc), power: 150, angle: 1.35, dist: 18, color: 0xffedc4 });
    for (const x of [16, 32]) { opalPanel(z, x, 5.2, zc); fixture(z, x, 4.8, zc, 45); }
    poolLight(z, 12, -.38, zc, Math.PI / 2, { power: 4 }); if (zc !== 49.25) poolLight(z, 36, -.38, zc, -Math.PI / 2, { power: 4 }); // underwater lights low in the side walls, none under the door
  }
  railing(z, [[34.75, -.6, 48.6], [35.75, 0, 48.6]], { h: .9, mid: false }); // grab rail up the exit steps
}
