// The sunlit pool hall, open to the sea.
import * as THREE from 'three';
import { scene, PH, WY, zones, defZone } from '../core.js';
import { S, poolMats, beachBall } from '../mat.js';
import { flats, pools, rings, loose, box, solid, ladder } from '../build.js';

defZone('pH', { grp: 'h', k: 1.25, exp: .34, fog: [.7, .82, .95, .0015], tint: [1, 1, 1.02], sat: 1.08, bloom: .35, shaft: 1, hum: 0, water: 1, wet: .5,
        box: [-9.4, -23.4, 9.4, 0], probe: [.5, 2.2, -12.5], env: [[-9, -1.4, -23], [9, 5, -1]], band: -99, bandCol: [1, 1, 1], shimmer: .25, caus: 1 });
flats.push([-4, -19, 5, -6, (x, z) => -.3 * Math.min(4, Math.floor((-6 - z) / .5) + 1)]); // pool hall, stepped entry
pools.push([-4, -19, 5, -6, -1.2, 'pH', ['bA', 'pH', 'pC', 'pN'], [.08, .18, .17]]);
const chrome = S({ metalness: 1, roughness: .1 });
poolMats(zones.pH); zones.pH.mats.push(chrome);
{ // sunlit pool hall: x[-9,9] z[-23,-1], pool x[-4,5] z[-19,-6]
  const T = zones.pH.tile;
  box(T, -9.4, -1.4, -23.4, -4, 0, 0); box(T, 5, -1.4, -23.4, 9.4, 0, 0); box(T, -4, -1.4, -6, 5, 0, 0); box(T, -4, -1.4, -23.4, 5, 0, -19); // deck
  box(T, -4, -1.4, -19, 5, -1.2, -6); // basin floor
  // Entry steps. Each block runs on under the decks beside and behind it: the underwater picture looks through the decks, and a
  // block that stopped at the pool's edge would show its hidden end face there, in front of the real steps.
  for (let i = 1; i < 4; i++) box(T, -9.39, -1.2, -6 - .5 * i, 9.39, -.3 * i, -.01);
  box(T, -9.4, PH, -23.4, 9.4, PH + .3, 0); // ceiling
  box(T, 9, 0, -23.4, 9.4, PH, -13.2); box(T, 9, 0, -10.8, 9.4, PH, -1); box(T, 9, 2.6, -13.2, 9.4, PH, -10.8); // east wall, door to the arcade
  box(T, -9.4, 0, -1, -1.2, PH, 0); box(T, 1.2, 0, -1, 9.4, PH, 0); box(T, -1.2, 2.2, -1, 1.2, PH, 0); // south wall, door to the backrooms
  box(T, -9.4, 0, -23.4, -9, 1, -1); box(T, -9.4, 4.2, -23.4, -9, PH, -1); // west wall: sill + header, windows between piers
  for (const [a, b] of [[-23.4, -21.5], [-18.5, -16.5], [-13.5, -11.5], [-8.5, -6.5], [-3.5, -1]]) box(T, -9.4, 1, a, -9, 4.2, b);
  box(T, -9, 0, -23.4, 9, .4, -23); box(T, -9, 4.2, -23.4, 9, PH, -23); // north side: low curb, open to the sea
  for (const [a, b] of [[-9, -8.7], [-5.7, -5.1], [-2.1, -1.5], [1.5, 2.1], [5.1, 5.7], [8.7, 9]]) box(T, a, .4, -23.4, b, 4.2, -23);
  box(T, .1, -1.2, -10.4, .9, PH, -9.6); box(T, .1, -1.2, -15.4, .9, PH, -14.6); // columns standing in the water
  solid(-9.4, 1, -23.4, -9.38, 4.2, -1); solid(-9, .4, -23.4, 9, 4.2, -23.38); // unseen panes in the windows and over the curb: the sea is to look at
  box(T, -33.4, -1.5, 0, -9.4, PH + .3, .6); box(T, 20.6, -1.5, -25, 45.4, 7.3, -24.7); // blank facades hiding the other wings from the windows
}
ladder(5, -16, chrome);
rings.push(...[[0xff9ec4, -1.6, -9.2], [0xffe27a, 2.9, -16.4], [0x9ee8d0, -2.3, -14]].map(([c, x, z]) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(.42, .13, 20, 48).rotateX(Math.PI / 2), S({ color: c, roughness: .3 }));
  m.position.set(x, WY + .05, z); m.castShadow = true; scene.add(m); zones.pH.mats.push(m.material); return m;
}));
loose.push({ mesh: beachBall(zones.pH), r: .25, pos: [2.6, WY + .21, -11.8], region: [-9, -23, 9, -1], float: .08, bounce: .6, grip: .6, spin: 1, solid: 1 }); // a beach ball on the water
