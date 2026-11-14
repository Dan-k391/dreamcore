// The night hall: a dark pool under glowing windows, with a water slide.
import * as THREE from 'three';
import { V, dark, zones, defZone } from '../core.js';
import { S, glow, poolMats } from '../mat.js';
import { emitters, flats, pools, box, round, slab, tube } from '../build.js';
import { ladder } from '../props/metalwork.js';

defZone('pN', { ...dark, exp: .22, bloom: .34, wet: .8, box: [21, -24.4, 45.4, .4], probe: [33, 3, -12], env: [[21, -1.4, -24.4], [45, 7, .4]], shimmer: .25 });
flats.push([24, -21, 42, -3, (x, z) => (z > -14 && z < -10 && x < 25 ? (x < 24.5 ? -.6 : -.9) : -1.2)]); // night pool
pools.push([24, -21, 42, -3, -1.2, 'pN', ['pC', 'pN', 'bC'], [.003, .01, .009]]);
const slideMat = S({ color: 0x0b4f4c, roughness: .16, side: THREE.DoubleSide });
poolMats(zones.pN); zones.pN.mats.push(slideMat);
{ // night hall x[21,45] z[-24,0], 7m tall: dark pool x[24,42] z[-21,-3], glowing pill windows and portholes, a water slide
  const T = zones.pN.tile, z = zones.pN;
  box(T, 20.6, -1.4, -24.4, 24, 0, -14); box(T, 20.6, -1.4, -10, 24, 0, .4); box(T, 42, -1.4, -24.4, 45.4, 0, .4); box(T, 24, -1.4, -24.4, 42, 0, -21); box(T, 24, -1.4, -3, 42, 0, .4); // deck
  box(T, 24, -1.4, -21, 42, -1.2, -3); box(T, 24, -1.2, -14, 24.5, -.6, -10); box(T, 24.5, -1.2, -14, 25, -.9, -10); // basin, steps down from the channel
  box(T, 20.6, 7, -24.4, 45.4, 7.3, .4); // ceiling
  box(T, 20.6, 0, -24.4, 21, 7, -14); box(T, 20.6, 0, -10, 21, 7, .4); box(T, 20.6, 3.6, -14, 21, 7, -10); // west wall, opening to the arcade
  box(T, 21, 0, 0, 34, 7, .4); box(T, 36.4, 0, 0, 45.4, 7, .4); box(T, 34, 2.3, 0, 36.4, 7, .4); // south wall, door to the corridor
  const windows = at => [...at.map(c => ['pill', c, 1.2, 3.3, 4.2]), ...at.slice(1).map(c => ['round', c - 2, 1.1, 6.1])];
  slab(T, 'x', -24.4, .4, 21, 45, 0, 7, windows([25, 29, 33, 37, 41])); box(glow, 21, 0, -24.7, 45, 7, -24.45);
  slab(T, 'z', 45, .4, -24, 0, 0, 7, windows([-20, -16, -12, -8, -4])); box(glow, 45.45, 0, -24, 45.7, 7, 0);
  box(T, 45, 0, -24.4, 45.4, 7, -24); // corner
  for (const x of [28, 38]) for (const zc of [-17, -7]) box(T, x - .4, -1.2, zc - .4, x + .4, 7, zc + .4); // columns in the water
  for (const zc of [-20, -12, -4]) emitters.push({ zone: z, p: V(44.6, 3.3, zc), t: V(34, 0, zc), power: 240, angle: 1.25, dist: 34, color: 0xffedc4 });
  for (const x of [25, 33, 41]) emitters.push({ zone: z, p: V(x, 3.3, -23.6), t: V(x, 0, -13), power: 240, angle: 1.25, dist: 34, color: 0xffedc4 });
}
ladder(42, -12, zones.pN.metal);
const slide = [[40.4, 6, -.2], [40.4, 5.6, -3.5]];
for (let i = 0; i <= 20; i++) slide.push([38 + 2.4 * Math.cos(-i * Math.PI / 8), 5.1 - 4.3 * i / 20, -7 + 2.4 * Math.sin(-i * Math.PI / 8)]);
const chute = tube([...slide, [35.4, .5, -9.5], [33.4, .22, -9.7]], .55, 320, slideMat);
{ const pts = chute.geometry.parameters.path.getSpacedPoints(90); // its solid: a chain of short upright cylinders down its length
  pts.forEach((q, i) => { const y = [pts[Math.max(0, i - 1)].y, q.y, pts[Math.min(90, i + 1)].y]; round(q.x, q.z, .5, Math.min(...y) - .55, Math.max(...y) + .5); }); }
