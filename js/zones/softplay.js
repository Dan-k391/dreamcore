// The soft play room off the mall.
import * as THREE from 'three';
import { scene, dry, zones, defZone } from '../core.js';
import { hash } from '../tex.js';
import { P, wallMat } from '../mat.js';
import { flats, loose, add, block, box, solid, flight, slab, lamp } from '../build.js';

defZone('sP', { ...dry, step: 'carpet', wade: 1, grp: 'm', k: 1.15, exp: .3, fog: [.6, .5, .55, .001], bloom: .25, wet: .25, box: [-41.4, 28, -27, 44], probe: [-34, 2, 36] });
{ // soft play room x[-41,-27] z[28.4,43.6], off the mall: foam floor squares, a ball pit, a climbing block with a way to jump in
  const z = zones.sP, h = 3.6, pad = [0xff8fb0, 0x7cc8ff, 0xffdc6a, 0x8fe6ae].map(c => wallMat(z, c, { roughness: .6 })), W = wallMat(z, 0xf3e6d0);
  for (let i = 0; i < 14; i++) for (let j = 0; j < 16; j++) if (i < 1 || i > 7 || j < 2 || j > 8) block(pad[(i + j * 3) % 4], -41 + i, -1, 28 + j, -40 + i, 0, 29 + j); // floor squares; the gap is the pit
  solid(-41, -1, 28, -27, 0, 30); solid(-41, -1, 37, -27, 0, 44); solid(-41, -1, 30, -40, 0, 37); solid(-33, -1, 30, -27, 0, 37); // the floor round the pit, whose sides keep the balls in
  box(pad[0], -40, -1, 30, -33, -.85, 37); flats.push([-40, 30, -33, 37, () => -.85], [-34.4, 33, -33.7, 35, () => -.57], [-33.7, 33, -33, 35, () => -.29]); // the pit, 85 cm deep, and two foam steps under the balls to climb out by
  box(pad[2], -34.4, -1, 33, -33.7, -.57, 35); box(pad[2], -33.7, -1, 33, -33, -.29, 35);
  box(W, -41.4, h, 28, -27, h + .2, 44); box(W, -41.4, 0, 28, -27, h, 28.4); box(W, -41.4, 0, 43.6, -27, h, 44); box(W, -41.4, 0, 28.4, -41, h, 43.6);
  for (const [x1, z1, x2, z2] of [[-41, 28.4, -27, 28.45], [-41, 43.55, -27, 43.6], [-41, 28.4, -40.95, 43.6]]) for (let i = 0; i < 3; i++) block(pad[i], x1, .4 * i, z1, x2, .4 * i + .4, z2); // padded band round the walls
  { // the balls: poured in close-packed layers, the top two thinned at random, and shaken to rest when the level loads (physics.js)
    const r = .1, pos = [], step = (x, z) => x > -34.4 - r && z > 33 - r && z < 35 + r ? (x > -33.7 - r ? -.29 : -.57) : -.85; // the floor under any part of a ball
    for (let l = 0; l < 5; l++) for (let k = 0; k < 40; k++) for (let m = 0; m < 35; m++) {
      const x = -40 + r + (k % 2) * r + (l % 2) * r + m * 2 * r, zc = 30 + r + (l % 2) * r / Math.sqrt(3) + k * r * Math.sqrt(3), y = -.85 + r + l * .1633;
      if (x > -33 - r || zc > 37 - r || y < step(x, zc) + r - .001 || (l > 2 && hash(m + l * 41, k) > (l > 3 ? .22 : .8))) continue;
      const j = l > 2 ? .09 : .004; pos.push(x + j * (hash(m, k + l * 17) - .5), y + (l > 2 ? .06 * hash(k, m + l) : 0), zc + j * (hash(k + 5, m + l) - .5)); // the top ones tumble into a loose heap
    }
    const n = pos.length / 3, balls = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 14, 10), P(z, { roughness: .3 }), n), cols = [0xff5d73, 0x4db8ff, 0xffd84a, 0x58d68d, 0xff9f43, 0xffffff].map(c => new THREE.Color(c));
    for (let i = 0; i < n; i++) balls.setColorAt(i, cols[Math.floor(hash(i, 3) * 6)]);
    balls.castShadow = balls.receiveShadow = true; scene.add(balls);
    loose.push({ mesh: balls, r, pos, region: [-41, 28.4, -27, 43.6], seen: ['sP', 'mL'], bounce: .35, grip: 2.5, pour: 240, cap: 3 }); // cap: no ball flies faster, so a jump in leaves most of them in the pit
  }
  flight(pad[1], -32.6, 31, -31, 33, 'z', -1, 0, 4); box(pad[2], -32.6, 0, 29, -31, 1, 31); flats.push([-32.6, 29, -31, 31, () => 1]); // steps up a block beside the pit; jump off it
  for (const [x, zc, s, c] of [[-30, 41, .7, 0], [-29.2, 41.2, .5, 3], [-30.1, 41, .45, 2], [-37, 41.5, .8, 1], [-36.1, 41.6, .5, 0]]) box(pad[c], x - s / 2, c === 2 ? .7 : 0, zc - s / 2, x + s / 2, (c === 2 ? .7 : 0) + s, zc + s / 2); // foam cubes
  slab(pad[3], 'x', 39.6, .5, -40.6, -33.4, 0, 2.2, [['arch', -38.8, 1.4, 1.7], ['arch', -37, 1.4, 1.7], ['arch', -35.2, 1.4, 1.7]], true); // a wall of little arches
  for (const [x, zc] of [[-37.5, 32.4], [-30.3, 32.4], [-37.5, 40.2], [-30.3, 40.2]]) lamp(z, x, zc, h, true, 55);
  [1.7, 1.42, 1.14, .86].forEach((r, i) => add(pad[i], new THREE.TorusGeometry(r, .14, 14, 48, Math.PI).translate(-30.4, 0, 43.3))); // a rainbow against the wall
  for (let i = 0; i < 12; i++) { const u0 = -1.84 + .3067 * i, u1 = u0 + .3067, far = Math.max(Math.abs(u0), Math.abs(u1)), close = u0 * u1 < 0 ? 0 : Math.min(Math.abs(u0), Math.abs(u1)); // its solid, in twelve upright slices
    solid(-30.4 + u0, close < .72 ? Math.sqrt(.72 ** 2 - close ** 2) : 0, 43.16, -30.4 + u1, Math.sqrt(Math.max(0, 1.84 ** 2 - far ** 2)), 43.44); }
}
