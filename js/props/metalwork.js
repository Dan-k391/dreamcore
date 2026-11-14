// Kit: metalwork (doors and frames, pool ladders, railings, shutters, bollards, grates, grilles, pipes, sign posts, bins).
// Materials: js/tex/metal.js. Convention, the yard and the inventory: docs/props.md.
import * as THREE from 'three';
import { scene } from '../core.js';
import { ladders, add, turned, tube } from '../build.js';

const doorway = (mat, leaf, x, y, z, ry, open = 1.9) => { // a door standing on its own, ajar
  const c = Math.cos(ry), s = Math.sin(ry), part = (m, w, h, d, px, py, pz) => { add(m, new THREE.BoxGeometry(w, h, d).translate(px, py, pz).rotateY(ry).translate(x, y, z)); turned(x + px * c + pz * s, z - px * s + pz * c, w / 2, d / 2, ry, y + py - h / 2, y + py + h / 2); };
  part(mat, .12, 2.3, .16, -.56, 1.15, 0); part(mat, .12, 2.3, .16, .56, 1.15, 0); part(mat, 1.24, .12, .16, 0, 2.3, 0); part(mat, 1.24, .05, .2, 0, .025, 0);
  add(leaf, new THREE.BoxGeometry(1, 2.2, .045).translate(.5, 1.13, 0).rotateY(open).translate(-.5, 0, 0).rotateY(ry).translate(x, y, z));
  const lx = .5 * Math.cos(open) - .5, lz = -.5 * Math.sin(open); turned(x + lx * c + lz * s, z - lx * s + lz * c, .5, .0225, open + ry, y + .03, y + 2.23); // the leaf
};
const ladder = (x, zc, mat) => { // on a pool's east edge at x: two rails over the lip, three treads
  for (const z of [zc - .25, zc + .25]) tube([[x - .1, -1], [x - .1, .5], [x - .03, .76], [x + .17, .86], [x + .37, .76], [x + .44, .5], [x + .44, 0]].map(([a, y]) => [a, y, z]), .022, 48, mat);
  for (const y of [-.2, -.5, -.8]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.08, .03, .5).translate(x - .1, y, zc), mat); m.castShadow = true; scene.add(m); }
  ladders.push([x - .8, zc - .45, x + .5, zc + .45]);
};

function yard(plot) {} // the metalwork plot in the dev yard (js/zones/yard.js)

export { doorway, ladder, yard };
