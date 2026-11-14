// The night hall: a dark pool under glowing windows, with a water slide.
import * as THREE from 'three';
import { V, WY, dark, zones, defZone } from '../core.js';
import { S, glow, poolMats } from '../mat.js';
import { emitters, flats, pools, rings, box, round, slab, tube } from '../build.js';
import { poolLadder, railing, drain, door } from '../props/metalwork.js';
import { poolLight, stepLight } from '../props/lights.js';
import { lounger, pottedPlant } from '../props/garden.js';
import { swimRing } from '../props/play.js';
import { column } from '../props/structure.js';

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
  box(T, 34, 0, 0, 34.7, 2.3, .4); box(T, 35.7, 0, 0, 36.4, 2.3, .4); // the hole narrowed to the door frame's 1 m
  const windows = at => [...at.map(c => ['pill', c, 1.2, 3.3, 4.2]), ...at.slice(1).map(c => ['round', c - 2, 1.1, 6.1])];
  slab(T, 'x', -24.4, .4, 21, 45, 0, 7, windows([25, 29, 33, 37, 41])); box(glow, 21, 0, -24.7, 45, 7, -24.45);
  slab(T, 'z', 45, .4, -24, 0, 0, 7, windows([-20, -16, -12, -8, -4])); box(glow, 45.45, 0, -24, 45.7, 7, 0);
  box(T, 45, 0, -24.4, 45.4, 7, -24); // corner
  for (const x of [28, 38]) for (const zc of [-17, -7]) column(z, x, -1.2, zc, 0, { h: 8.2, r: .4, color: 0xf0ebe0 }); // stone columns standing in the water, up to the ceiling
  for (const zc of [-20, -12, -4]) emitters.push({ zone: z, p: V(44.6, 3.3, zc), t: V(34, 0, zc), power: 240, angle: 1.25, dist: 34, color: 0xffedc4 });
  for (const x of [25, 33, 41]) emitters.push({ zone: z, p: V(x, 3.3, -23.6), t: V(x, 0, -13), power: 240, angle: 1.25, dist: 34, color: 0xffedc4 });
}
const z = zones.pN;
poolLadder(z, 42, 0, -12, -Math.PI / 2); poolLadder(z, 24, 0, -18, Math.PI / 2); // east side, and west at the deep end clear of the channel
// the overflow gutter: a slot grating right round the pool (the channel steps take the west side's middle), a 4 cm tile lip at the water
drain(z, 42.14, 0, -12, 0, { l: 18.08, w: .2 });
for (const zc of [-21.14, -2.86]) drain(z, 33, 0, zc, Math.PI / 2, { l: 18.48, w: .2 });
drain(z, 23.86, 0, -17.52, 0, { l: 7.04, w: .2 }); drain(z, 23.86, 0, -6.48, 0, { l: 7.04, w: .2 });
// underwater lights, lit: two on each wall, half way down; cheap tile-only lamps
for (const zc of [-16, -8]) { poolLight(z, 42, -.62, zc, -Math.PI / 2, { power: 5 }); poolLight(z, 24, -.62, zc - 1, Math.PI / 2, { power: 5 }); }
for (const x of [30, 36]) { poolLight(z, x, -.62, -21, 0, { power: 5 }); poolLight(z, x - 3, -.62, -3, Math.PI, { power: 5 }); }
railing(z, [[23.7, -.3, -13.62], [25.3, -1.2, -13.62]], { h: .9, mid: false }); // grab rail down the channel steps, against their north side
stepLight(z, 21, .3, -14.5, Math.PI / 2, { power: 1.2 }); stepLight(z, 21, .3, -9.5, Math.PI / 2, { power: 1.2 }); // marking the deck's edge at the channel
door(z, 35.2, 0, .02, 0, { open: 1.85, color: 0x56706a, frame: 0xd9d2c4 }); // the corridor door, held open into the hall
lounger(z, 28.3, 0, -22.6, 0); lounger(z, 29.7, 0, -22.6, 0); pottedPlant(z, 27, 0, -23.75); // a pair under the north windows, heads to the wall
rings.push(...[[0xffc93a, 31, -18.4], [0xff7fa8, 36.3, -13.2]].map(([c, x, zc]) => { const m = swimRing(z, { color: c }); m.position.set(x, WY + .05, zc); return m; }));
const slide = [[40.4, 6, -.2], [40.4, 5.6, -3.5]];
for (let i = 0; i <= 20; i++) slide.push([38 + 2.4 * Math.cos(-i * Math.PI / 8), 5.1 - 4.3 * i / 20, -7 + 2.4 * Math.sin(-i * Math.PI / 8)]);
const chute = tube([...slide, [35.4, .5, -9.5], [33.4, .22, -9.7]], .55, 320, slideMat);
{ const pts = chute.geometry.parameters.path.getSpacedPoints(90); // its solid: a chain of short upright cylinders down its length
  pts.forEach((q, i) => { const y = [pts[Math.max(0, i - 1)].y, q.y, pts[Math.min(90, i + 1)].y]; round(q.x, q.z, .5, Math.min(...y) - .55, Math.max(...y) + .5); }); }
