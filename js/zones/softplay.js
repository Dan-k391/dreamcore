// The soft play room off the mall.
import * as THREE from 'three';
import { scene, dry, zones, defZone } from '../core.js';
import { hash } from '../tex.js';
import { P, wallMat } from '../mat.js';
import { flats, add, block, box, flight, slab, lamp } from '../build.js';

defZone('sP', { ...dry, step: 'carpet', wade: 1, grp: 'm', k: 1.15, exp: .3, fog: [.6, .5, .55, .001], bloom: .25, wet: .25, box: [-41.4, 28, -27, 44], probe: [-34, 2, 36] });
{ // soft play room x[-41,-27] z[28.4,43.6], off the mall: foam floor squares, a ball pit, a climbing block with a way to jump in
  const z = zones.sP, h = 3.6, pad = [0xff8fb0, 0x7cc8ff, 0xffdc6a, 0x8fe6ae].map(c => wallMat(z, c, { roughness: .6 })), W = wallMat(z, 0xf3e6d0);
  for (let i = 0; i < 14; i++) for (let j = 0; j < 16; j++) if (i < 1 || i > 7 || j < 2 || j > 8) block(pad[(i + j * 3) % 4], -41 + i, -.8, 28 + j, -40 + i, 0, 29 + j); // floor squares; the gap is the pit
  block(pad[0], -40, -.8, 30, -33, -.3, 37); flats.push([-40, 30, -33, 37, () => -.55], [-33.7, 33, -33, 35, () => -.28]); block(pad[2], -33.7, -.8, 33, -33, -.28, 35); // the pit, and a foam step under the balls to climb out by
  box(W, -41.4, h, 28, -27, h + .2, 44); box(W, -41.4, 0, 28, -27, h, 28.4); box(W, -41.4, 0, 43.6, -27, h, 44); box(W, -41.4, 0, 28.4, -41, h, 43.6);
  for (const [x1, z1, x2, z2] of [[-41, 28.4, -27, 28.45], [-41, 43.55, -27, 43.6], [-41, 28.4, -40.95, 43.6]]) for (let i = 0; i < 3; i++) block(pad[i], x1, .4 * i, z1, x2, .4 * i + .4, z2); // padded band round the walls
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(.1, 10, 6), P(z, { roughness: .3 }), 41 * 41 * 2), m4 = new THREE.Matrix4(), cols = [0xff5d73, 0x4db8ff, 0xffd84a, 0x58d68d, 0xff9f43, 0xffffff].map(c => new THREE.Color(c));
  for (let i = 0, n = 0; i < 41; i++) for (let j = 0; j < 41; j++) for (let l = 0; l < 2; l++, n++) { // shortcut: the balls are fixed in place, make them a particle system if they should part around the legs
    balls.setMatrixAt(n, m4.makeTranslation(-39.9 + (i + .5 * l + .4 * hash(i, j + l * 99)) * .168, -.16 - .13 * l + .06 * hash(j, i + 7), 30.1 + (j + .5 * l + .4 * hash(i + 31, j)) * .168));
    balls.setColorAt(n, cols[Math.floor(hash(i + l * 57, j) * 6)]);
  }
  balls.receiveShadow = true; scene.add(balls);
  flight(pad[1], -32.6, 31, -31, 33, 'z', -1, 0, 4); box(pad[2], -32.6, 0, 29, -31, 1, 31); flats.push([-32.6, 29, -31, 31, () => 1]); // steps up a block beside the pit; jump off it
  for (const [x, zc, s, c] of [[-30, 41, .7, 0], [-29.2, 41.2, .5, 3], [-30.1, 41, .45, 2], [-37, 41.5, .8, 1], [-36.1, 41.6, .5, 0]]) box(pad[c], x - s / 2, c === 2 ? .7 : 0, zc - s / 2, x + s / 2, (c === 2 ? .7 : 0) + s, zc + s / 2); // foam cubes
  slab(pad[3], 'x', 39.6, .5, -40.6, -33.4, 0, 2.2, [['arch', -38.8, 1.4, 1.7], ['arch', -37, 1.4, 1.7], ['arch', -35.2, 1.4, 1.7]], true); // a wall of little arches
  for (const [x, zc] of [[-37.5, 32.4], [-30.3, 32.4], [-37.5, 40.2], [-30.3, 40.2]]) lamp(z, x, zc, h, true, 55);
  [1.7, 1.42, 1.14, .86].forEach((r, i) => add(pad[i], new THREE.TorusGeometry(r, .14, 14, 48, Math.PI).translate(-30.4, 0, 43.3))); // a rainbow against the wall
}
