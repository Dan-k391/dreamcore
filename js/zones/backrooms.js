// The backrooms: the first maze (bA), the pillar hall (bB) and the corridor east (bC).
import { H, warm, zones, defZone } from '../core.js';
import { hash, noise, fbm, makeTex } from '../tex.js';
import { S, dirt, lampOff } from '../mat.js';
import { box, room, wall, lamp } from '../build.js';

defZone('bA', { ...warm, box: [-9.4, 0, 9.4, 21.4], probe: [0, 1.5, 11] });
defZone('bB', { ...warm, box: [-33.4, .6, -9.4, 21.4], probe: [-21.3, 1.7, 13] });
defZone('bC', { ...warm, box: [9.4, .4, 36.8, 12.4], probe: [23.4, 1.5, 10.8], wet: .3 });
const carpetTex = makeTex(512, 1.5, (u, v, x, y) => {
  const f = hash(x, y), s = noise(u * 128, v * 128, 128), k = .62 + .3 * f * s + .2 * s + .25 * fbm(u, v, 4, 3);
  return [.66 * k, .58 * k, .37 * k, f * .5 + s, 1];
}, 1.2);
const paperTex = makeTex(1024, 1.2, (u, v) => { // mustard wallpaper: pinstripes + staggered embossed diamonds
  const cu = u * 8 % 1, cv = (v * 8 + (Math.floor(u * 8) & 1) * .5) % 1;
  const line = Math.abs(cu - .5) > .47 ? 1 : 0, motif = Math.abs(cu - .5) * 1.5 + Math.abs(cv - .5) < .13 ? 1 : 0;
  const fib = noise(u * 300, v * 300, 300), k = (.9 + .1 * fib) * (1 - .1 * line - .08 * motif) * (.9 + .15 * fbm(u, v, 3, 4));
  return [.93 * k, .83 * k, .46 * k, fib * .25 - line * .4 + motif * .4, .9];
}, 1.5);
const ceilTex = makeTex(1024, 1.2, (u, v, x, y) => { // 60cm acoustic tiles in a T-bar grid
  const tu = u * 2 % 1, tv = v * 2 % 1, e = Math.min(tu, 1 - tu, tv, 1 - tv), bar = e < .02;
  const pit = Math.min(1, Math.pow(noise(u * 160, v * 160, 160), 7) * 5 + (hash(x, y) > .994 ? .8 : 0));
  const c = bar ? .9 : (.84 + .05 * hash(Math.floor(u * 2), Math.floor(v * 2) + 5)) * (1 - .16 * pit) * (.92 + .1 * fbm(u, v, 4, 3));
  return [c, c * .985, c * .94, bar ? 1.6 : 1 - pit * .8 - (e < .03 ? .4 : 0), .95];
}, 2);
for (const z of [zones.bA, zones.bB, zones.bC]) {
  z.carpet = S({ map: carpetTex.map, normalMap: carpetTex.normalMap, ...dirt });
  z.paper = S({ map: paperTex.map, normalMap: paperTex.normalMap, roughness: .88, ...dirt });
  z.ceil = S({ map: ceilTex.map, normalMap: ceilTex.normalMap, roughness: .95, ...dirt });
  z.trim = S({ color: 0xcfc59a, roughness: .55 });
  z.mats = [z.carpet, z.paper, z.ceil, z.trim];
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
