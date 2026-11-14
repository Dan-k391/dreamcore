// The mall atrium.
import * as THREE from 'three';
import { dry, zones, defZone } from '../core.js';
import { M as lib, P, neon, wallMat } from '../mat.js';
import { add, block, box, round, lit } from '../build.js';

defZone('mL', { ...dry, grp: 'm', k: .9, exp: .3, fog: [.4, .38, .4, .0008], bloom: .25, wet: .7, box: [-27, 24, 2.4, 50], probe: [-12, 3, 37] });
{ // mall atrium x[-26.6,1.8] z[24.4,49.6], 7m tall: polished chequered floor, shuttered shops under glowing signs, a skylight, palms
  const z = zones.mL, h = 7, F = lib(z, 'marble'), W = wallMat(z, 0xe6dcd6), soft = neon(0xfff0d8, 2.2), M = P(z, { metalness: 1, roughness: .25 }), sh = P(z, { color: 0x8d9296, metalness: .6, roughness: .45 }),
    leaf = P(z, { color: 0x2f6b3a, roughness: .6, side: THREE.DoubleSide }), bark = P(z, { color: 0x6b5138, roughness: .9 }), soil = P(z, { color: 0x2a1d14, roughness: 1 });
  box(F, -27, -.2, 24, 2.2, 0, 50); box(W, -27, h, 24, 2.2, h + .3, 50);
  box(W, -27, 0, 24, 2.2, h, 24.4); box(W, -27, 0, 49.6, 2.2, h, 50); // north and south walls
  box(W, 1.8, 0, 24.4, 2.2, h, 44); box(W, 1.8, 0, 46, 2.2, h, 49.6); box(W, 1.8, 2.3, 44, 2.2, h, 46); // east, door to the hotel hallway
  box(W, -27, 0, 24.4, -26.6, h, 34); box(W, -27, 0, 38, -26.6, h, 49.6); box(W, -27, 3, 34, -26.6, h, 38); // west, opening to the soft play room
  const signs = [0xff8fb8, 0x8fd8ff, 0xffe08a, 0xb9a2ff, 0x9dffc8];
  for (let i = 0; i < 5; i++) for (const [zw, k] of [[24.4, 1], [49.6, -1]]) { // shop fronts: k is which way the wall faces
    const x0 = -25.6 + 5.4 * i, f = (a, b) => [Math.min(zw + k * a, zw + k * b), Math.max(zw + k * a, zw + k * b)], open = (i + (k > 0)) % 3 === 0;
    let [z1, z2] = f(0, .06);
    if (open) { block(soft, x0, .1, z1, x0 + 4.6, 3, z2); lit(z, x0 + 2.3, 1.8, zw + k * .3, 40, [x0 + 2.3, 0, zw + k * 6], 1.3, 14); } // a few are lit, and empty
    else for (let y = .08; y < 3; y += .24) block(sh, x0, y, z1, x0 + 4.6, y + .2, z2); // the rest are shuttered
    [z1, z2] = f(0, .09); block(neon(signs[(i + (k > 0) * 2) % 5], 3.5), x0 + .9, 3.3, z1, x0 + 3.7, 3.75, z2);
    [z1, z2] = f(0, 1.3); box(W, x0 - .4, 4.1, z1, x0 + 5, 4.35, z2); // upper gallery
    [z1, z2] = f(1.24, 1.28); block(M, x0 - .4, 5.3, z1, x0 + 5, 5.34, z2); for (let j = 0; j < 4; j++) block(M, x0 + 1.5 * j, 4.35, z1, x0 + 1.5 * j + .04, 5.3, z2);
  }
  block(neon(0xffedc0, 4), -20, h - .02, 35.5, -5, h + .01, 38.5); for (const x of [-19, -12.4, -5.8]) lit(z, x, h - .1, 37, 170, [x, 0, 37], 1.1, 16, 0xffedc4); // skylight
  for (const x of [-18, -7]) { // planters with a palm each, benches on two sides
    box(W, x - 1.5, 0, 35.5, x + 1.5, .5, 38.5); block(soil, x - 1.3, .5, 35.7, x + 1.3, .52, 38.3);
    add(bark, new THREE.CylinderGeometry(.11, .16, 3.2, 10).translate(x, 2.1, 37)); round(x, 37, .15, .5, 3.7);
    for (let j = 0; j < 9; j++) add(leaf, new THREE.BoxGeometry(1.9, .015, .42).translate(1, 0, 0).rotateZ(-.25 - .3 * (j % 3)).rotateY(j * .7).translate(x, 3.7, 37));
    for (const zc of [34.7, 39.3]) { box(bark, x - 1.2, .38, zc - .22, x + 1.2, .45, zc + .22); box(M, x - 1.1, 0, zc - .03, x - 1.04, .4, zc + .03); box(M, x + 1.04, 0, zc - .03, x + 1.1, .4, zc + .03); }
  }
}
