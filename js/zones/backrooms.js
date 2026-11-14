// The backrooms: the first maze (bA), the pillar hall (bB) and the corridor east (bC).
import { H, warm, zones, defZone } from '../core.js';
import { M, P, lampOff } from '../mat.js';
import { box, room, wall } from '../build.js';
import { lamp } from '../props/lights.js';

defZone('bA', { ...warm, box: [-9.4, 0, 9.4, 21.4], probe: [0, 1.5, 11] });
defZone('bB', { ...warm, box: [-33.4, .6, -9.4, 21.4], probe: [-21.3, 1.7, 13] });
defZone('bC', { ...warm, box: [9.4, .4, 36.8, 12.4], probe: [23.4, 1.5, 10.8], wet: .3 });
for (const z of [zones.bA, zones.bB, zones.bC]) { // yellowed wallpaper with a seam every 53 cm, worn loop carpet, mineral-fibre tiles in a T-bar grid
  z.carpet = M(z, 'loopCarpet', { color: 0xe8cc8c });
  z.paper = M(z, 'wallpaper');
  z.ceil = M(z, 'ceilingTile', { color: 0xf2e9d6, grime: .3 }); // years of dust and damp, unevenly
  z.trim = P(z, { color: 0xcfc59a, roughness: .55 });
}
zones.bA.mats.push(lampOff);
{ // backrooms A: the first maze. x[-9,9] z[1,21]
  const z = zones.bA;
  room(z, -9.4, 0, 9.4, 21.4, H);
  box(z.paper, -1.2, 2.2, 0, 1.2, H, 1); box(z.paper, -9.42, 2.3, 3, -9, 3.3, 6); box(z.paper, 9, 2.3, 9.6, 9.4, H, 12); box(z.paper, 3, 2.2, 21, 4.6, H, 21.4); // lintels: pools, pillar hall, corridor, hotel
  for (const w of [
    [-9.42, 1, -9, 3, 3.3], [-9.42, 6, -9, 21.4, 3.3], [9, 1, 9.4, 9.6], [9, 12, 9.4, 21.4], [-9.4, 21, 3, 21.4], [4.6, 21, 9.4, 21.4], [-9.4, 0, -1.2, 1], [1.2, 0, 9.4, 1], // outer walls
    [-9, 7, -4, 7.3], [-1.5, 7, 4, 7.3], [6.5, 7, 9, 7.3], [-3.3, 10, -3, 16], [3, 7.3, 3.3, 13], [5, 14, 9, 14.3],
    [-9, 16, -5.5, 16.3], [-3.3, 16, .5, 16.3], [.5, 16, .8, 18.5], [-6.3, 10.7, -5.7, 11.3], [6.2, 19.2, 6.8, 19.8],
  ]) wall(z, ...w);
  for (const [x, zc] of [[-5.7, 3.6], [.3, 4.2], [5.7, 3.6], [.3, 10.2], [.3, 14.4], [-6.3, 12.6], [6.3, 17.4], [-1.5, 19.2], [-6.3, 18.6]]) lamp(z, x, zc);
  lamp(z, 6.3, 10.2, H, false); // one dead panel: the east room is lit only by spill
}
{ // backrooms B: a taller pillar hall to the west. x[-33,-9.4] z[1,21]
  const z = zones.bB, h = 3.3;
  room(z, -33.4, .6, -9.4, 21.4, h);
  for (const w of [[-33.4, .6, -33, 21.4], [-33, .6, -9.4, 1], [-33, 21, -9.4, 21.4], [-31, 14, -27.5, 14.3], [-15.6, 6.5, -15.3, 10]]) wall(z, ...w, h);
  for (const x of [-25.2, -17.4]) for (const zc of [7.5, 14.1]) wall(z, x - .45, zc - .45, x + .45, zc + .45, h);
  for (const x of [-29.1, -21.3, -13.5]) for (const zc of [4.2, 10.8, 17.4]) lamp(z, x, zc, h);
}
{ // backrooms C: a long corridor east, turning north to the night hall
  const z = zones.bC;
  room(z, 9.4, 9.2, 36.8, 12.4, H); room(z, 33.6, .4, 36.8, 9.2, H);
  for (const w of [[9.4, 9.2, 34, 9.6], [9.4, 12, 22, 12.4], [24.4, 12, 36.8, 12.4], [36.4, .4, 36.8, 9.8], [33.6, .4, 34, 9.2]]) wall(z, ...w);
  box(z.paper, 36.4, 2.2, 9.8, 36.8, H, 12); // lintel over the door to the garage
  box(z.paper, 22, 2.3, 12, 24.4, H, 12.4); // lintel over the door to the gallery pool
  for (const [x, zc] of [[13.5, 10.8], [20.1, 10.8], [26.7, 10.8], [35.1, 10.8], [35.1, 4.8]]) lamp(z, x, zc, H, true, 60); // narrow, so the walls are close to the lamps
}
