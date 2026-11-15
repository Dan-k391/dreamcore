// The backrooms: the first maze (bA), the pillar hall (bB) and the corridor east (bC).
import { H, warm, zones, defZone } from '../core.js';
import { M, lampOff } from '../mat.js';
import { box, room } from '../build.js';
import { lamp, opalPanel } from '../props/lights.js';
import { pillar, skirting } from '../props/structure.js';
import { door, vent, bin } from '../props/metalwork.js';
import { pottedPlant } from '../props/garden.js';

defZone('bA', { ...warm, box: [-9.4, 0, 9.4, 21.4], probe: [0, 1.5, 11], env: [[-9.4, 0, 0], [9.4, 2.7, 21.4]] });
defZone('bB', { ...warm, box: [-33.4, .6, -9.4, 21.4], probe: [-21.3, 1.7, 13], env: [[-33.4, 0, .6], [-9.4, 3.3, 21.4]] });
defZone('bC', { ...warm, box: [9.4, .4, 36.8, 12.4], probe: [23.4, 1.5, 10.8], env: [[9.4, 0, 9.6], [36.8, 2.7, 12.4]], wet: .3 });
for (const z of [zones.bA, zones.bB, zones.bC]) { // yellowed wallpaper with a seam every 53 cm, worn loop carpet, mineral-fibre tiles in a T-bar grid
  z.carpet = M(z, 'loopCarpet', { color: 0xe8cc8c });
  z.paper = M(z, 'wallpaper');
  z.ceil = M(z, 'ceilingTile', { color: 0xf2e9d6, grime: .3 }); // years of dust and damp, unevenly
}
zones.bA.mats.push(lampOff);

// Walls are wallpapered boxes; once all are placed, every face that looks onto open floor gets the kit skirting (wall on the run's left).
const floors = [[-9.4, 0, 9.4, 21.4], [-33.4, .6, -9.4, 21.4], [9.4, 9.2, 36.8, 12.4], [33.6, .4, 36.8, 9.2]], walls = [];
const inside = (r, x, zc) => x > r[0] && x < r[2] && zc > r[1] && zc < r[3];
const wl = (z, x1, z1, x2, z2, h = H) => { box(z.paper, x1, 0, z1, x2, h, z2); walls.push([z, x1, z1, x2, z2]); };
const frame = (z, x, zc, ry, o = {}) => { // a pressed-steel door frame (no leaf unless o.leaf), set in the middle of the wall's thickness
  door(z, x, 0, zc, ry, { leaf: false, frame: 0xd6ccae, ...o });
  walls.push(ry ? [null, x - .075, zc - .6, x + .075, zc + .6] : [null, x - .6, zc - .075, x + .6, zc + .075]); // no skirting into the frame
};
const skirtAll = () => {
  const e = .018;
  for (const [z, x1, z1, x2, z2] of walls) if (z) for (const [ax, az, bx, bz, nx, nz] of [[x2, z1, x2, z2, 1, 0], [x2, z2, x1, z2, 0, 1], [x1, z2, x1, z1, -1, 0], [x1, z1, x2, z1, 0, -1]]) {
    const mx = (ax + bx) / 2 + nx * .05, mz = (az + bz) / 2 + nz * .05;
    if (!floors.some(r => inside(r, mx, mz)) || walls.some(w => inside([w[1], w[2], w[3], w[4]], mx, mz))) continue;
    const dx = Math.sign(bx - ax) * e, dz = Math.sign(bz - az) * e; // run on past each corner so outside corners close
    skirting(z, [[ax - dx, 0, az - dz], [bx + dx, 0, bz + dz]], { color: 0xb3a273 });
  }
};
const post = (z, x, zc, w, h, color = 0xe2d4ae) => pillar(z, x, 0, zc, 0, { w, h, band: 0, guard: [], numFaces: [], color }); // bare cast columns, never boxed in

{ // backrooms A: the first maze. x[-9,9] z[1,21]
  const z = zones.bA;
  room(z, -9.4, 0, 9.4, 21.4, H);
  box(z.paper, -1.2, 2.2, 0, 1.2, H, 1); box(z.paper, -9.42, 2.3, 3, -9, 3.3, 6); box(z.paper, 9, 2.34, 9.6, 9.4, H, 12); box(z.paper, 3, 2.34, 21, 4.6, H, 21.4); // lintels: pools, pillar hall, corridor, hotel
  for (const w of [
    [-9.42, 1, -9, 3, 3.3], [-9.42, 6, -9, 21.398, 3.3], [9, 1, 9.4, 9.6], [9, 12, 9.4, 21.4], [-9.4, 21, 3, 21.4], [4.6, 21, 9.4, 21.4], [-9.4, 0, -1.2, 1], [1.2, 0, 9.4, 1], // outer walls
    [-9, 7, -4, 7.3], [-1.5, 7, 4, 7.3], [6.5, 7, 9, 7.3], [-3.3, 10, -3, 16], [3, 7.3, 3.3, 13], [5, 14, 6.4, 14.3], [7.6, 14, 9, 14.3],
    [-9, 16, -5.5, 16.3], [-3.3, 16, .5, 16.3], [.5, 16, .8, 18.5],
    [3, 21, 3.2, 21.4], [4.4, 21, 4.6, 21.4], [9, 9.6, 9.4, 10.2], [9, 11.4, 9.4, 12], // the hotel door and the corridor door narrowed to their frames
  ]) wl(z, ...w);
  box(z.paper, 6.4, 2.34, 14, 7.6, H, 14.3);
  frame(z, 3.8, 21.2, 0); frame(z, 9.2, 10.8, Math.PI / 2);
  frame(z, 7, 14.15, 0, { leaf: true, color: 0xb8ab84 }); // a door that stays shut, between two rooms you can reach anyway
  post(z, -6, 11, .6, H, 0xc6b792); post(z, 6.5, 19.5, .6, H, 0xc6b792); // darker: each stands right under a lamp
  vent(z, -3, 2.25, 13, Math.PI / 2, { w: .6, h: .3, color: 0xd8cfb2 });
  for (const [x, zc] of [[-5.7, 3.6], [.3, 4.2], [5.7, 3.6], [.3, 10.2], [.3, 14.4], [-6.3, 12.6], [6.3, 17.4], [-1.5, 19.2], [-6.3, 18.6]]) lamp(z, x, zc);
  lamp(z, 6.3, 10.2, H, false); // one dead panel: the east room is lit only by spill
}
{ // backrooms B: a taller pillar hall to the west. x[-33,-9.4] z[1,21]
  const z = zones.bB, h = 3.3;
  room(z, -33.4, .6, -9.4, 21.4, h);
  for (const w of [[-33.4, .6, -33, 21.4], [-33, .6, -9.4, 1], [-33, 21, -9.4, 21.4], [-31, 14, -27.5, 14.3], [-15.6, 6.5, -15.3, 10]]) wl(z, ...w, h);
  for (const x of [-25.2, -17.4]) for (const zc of [7.5, 14.1]) post(z, x, zc, .9, h);
  vent(z, -21.3, 2.8, 21, Math.PI, { w: .6, h: .3, color: 0xd8cfb2 });
  bin(z, -16.75, 0, 14.75, .4, { color: 0x6a685e }); // by a pillar, empty
  pottedPlant(z, -10.05, 0, 6.7, 1); // left by the way in
  for (const x of [-29.1, -21.3, -13.5]) for (const zc of [4.2, 10.8, 17.4]) lamp(z, x, zc, h);
}
{ // backrooms C: a long corridor east, turning north to the night hall
  const z = zones.bC;
  room(z, 9.4, 9.2, 36.8, 12.4, H); room(z, 33.6, .4, 36.8, 9.2, H);
  for (const w of [[9.4, 9.2, 34, 9.6], [9.4, 12, 22, 12.4], [24.4, 12, 36.8, 12.4], [36.4, .4, 36.8, 9.8], [33.6, .4, 34, 9.2],
    [36.4, 9.8, 36.8, 10.3], [36.4, 11.5, 36.8, 12], [22, 12, 22.6, 12.4], [23.8, 12, 24.4, 12.4]]) wl(z, ...w); // garage and gallery doors narrowed to their frames
  box(z.paper, 36.4, 2.34, 10.3, 36.8, H, 11.5); // lintel over the door to the garage
  box(z.paper, 22.6, 2.34, 12, 23.8, H, 12.4); // lintel over the door to the gallery pool
  frame(z, 36.6, 10.9, Math.PI / 2); frame(z, 23.2, 12.2, 0);
  vent(z, 17, 2.25, 9.6, 0, { w: .6, h: .3, color: 0xd8cfb2 });
  opalPanel(z, 35.2, H, 1.6, 0, { power: 30 }); // a different fitting at the end of the north leg
  for (const [x, zc] of [[13.5, 10.8], [20.1, 10.8], [26.7, 10.8], [35.1, 10.8], [35.1, 4.8]]) lamp(z, x, zc, H, true, 60); // narrow, so the walls are close to the lamps
}
skirtAll();
