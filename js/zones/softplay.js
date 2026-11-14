// The soft play room off the mall.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene, dry, zones, defZone } from '../core.js';
import { hash } from '../tex.js';
import { M, wallMat } from '../mat.js';
import { flats, loose, add, block, box, solid, slab } from '../build.js';
import { lamp } from '../props/lights.js';
import { vent } from '../props/metalwork.js';
import { mallBench } from '../props/garden.js';
import { slide, foamCube, foamWedge, foamCylinder, foamArch, pitBall } from '../props/play.js';

defZone('sP', { ...dry, step: 'carpet', wade: 1, grp: 'm', k: 1.15, exp: .3, fog: [.6, .5, .55, .001], bloom: .25, wet: .25, box: [-41.4, 28, -27, 44], probe: [-34, 2, 36] });
{ // soft play room x[-41,-27] z[28.4,43.6], off the mall: vinyl floor mats, a padded ball pit with a slide into it, wall pads, foam shapes
  const z = zones.sP, h = 3.6, W = wallMat(z, 0xf3e6d0);
  const cols = [0xf0849c, 0x62aeea, 0xf4cc5c, 0x78d09a], V = cols.map(c => M(z, 'vinylFoam', { color: c, uv: [1, 1] })); // the kit's foam covers in the room's softer colours
  const Al = M(z, 'brushedSteel'), hide = new THREE.MeshBasicMaterial({ visible: false });
  // a sewn vinyl panel over foam, x1..x2 y1..y2 z1..z2: its own UVs run 0..1 over each face, so vinylFoam's seams and stitching follow its edges
  const pad = (m, x1, y1, z1, x2, y2, z2, r = .03, s = 2) => add(V[m], new RoundedBoxGeometry(x2 - x1, y2 - y1, z2 - z1, s, Math.min(r, (x2 - x1) / 2.01, (y2 - y1) / 2.01, (z2 - z1) / 2.01)).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), true);
  const run = (a, b, n, f) => { const L = (b - a) / n; for (let k = 0; k < n; k++) f(a + k * L, a + (k + 1) * L, k); }; // a length cut into n panels

  // the floor: 1 m vinyl mats, 4 cm thick, laid with a hairline gap over a dark base; the pit is the gap in them
  for (let i = 0; i < 14; i++) for (let j = 0; j < 16; j++) if (i < 1 || i > 7 || j < 2 || j > 8) {
    const z1 = Math.max(28 + j, 28.4), z2 = Math.min(29 + j, 43.6), dy = .003 * (hash(i, j + 7) - .5); // each sits a little proud or low of its neighbours
    pad((i + j * 3) % 4, -41 + i + .003, -.04, z1 + .003, -40 + i - .003, dy, z2 - .003, .012, 1);
  }
  const R = M(z, 'rubber'); block(R, -41, -.06, 28.4, -27, -.04, 30); block(R, -41, -.06, 37, -27, -.04, 43.6); block(R, -41, -.06, 30, -40, -.04, 37); block(R, -33, -.06, 30, -27, -.04, 37);
  solid(-41, -1, 28, -27, 0, 30); solid(-41, -1, 37, -27, 0, 44); solid(-41, -1, 30, -40, 0, 37); solid(-33, -1, 30, -27, 0, 37); // the floor round the pit, whose sides keep the balls in
  // the pit, 85 cm deep, lined with blue pads, and two foam steps under the balls to climb out by
  box(V[1], -40, -1, 30, -33, -.85, 37); flats.push([-40, 30, -33, 37, () => -.85], [-34.4, 33, -33.7, 35, () => -.57], [-33.7, 33, -33, 35, () => -.29]);
  run(30, 37, 7, (a, b) => { pad(1, -40.05, -.86, a, -40, 0, b, .02); pad(1, -33, -.86, a, -32.95, 0, b, .02); });
  run(-40, -33, 7, (a, b) => { pad(1, a, -.86, 29.95, b, 0, 30, .02); pad(1, a, -.86, 37, b, 0, 37.05, .02); });
  pad(2, -34.4, -.86, 33.002, -33.702, -.57, 34.998, .05); pad(2, -33.698, -.86, 33.002, -33.002, -.29, 34.998, .05); solid(-34.4, -1, 33, -33.7, -.57, 35); solid(-33.7, -1, 33, -33, -.29, 35);
  // its rim: a 24 x 20 cm padded bolster on the floor round the edge, open where the slide runs in and at the climb-out steps
  const rim = (x1, z1, x2, z2, c) => { const n = Math.ceil(Math.max(x2 - x1, z2 - z1) / 1.25), along = x2 - x1 > z2 - z1;
    run(along ? x1 : z1, along ? x2 : z2, n, (a, b, k) => along ? pad((c + k) % 2 ? 0 : 2, a + .002, 0, z1, b - .002, .2, z2, .07, 3) : pad((c + k) % 2 ? 0 : 2, x1, 0, a + .002, x2, .2, b - .002, .07, 3));
    solid(x1, 0, z1, x2, .2, z2); };
  rim(-40.24, 29.76, -40, 37.24, 0); rim(-40, 29.76, -33, 30, 1); rim(-40, 37, -33, 37.24, 1);
  rim(-33, 29.76, -32.76, 30.2, 0); rim(-33, 31, -32.76, 33, 1); rim(-33, 35, -32.76, 37.24, 0);
  { // the balls: poured in close-packed layers, the top two thinned at random, and shaken to rest when the level loads (physics.js)
    const r = .1, pos = [], step = (x, z) => x > -34.4 - r && z > 33 - r && z < 35 + r ? (x > -33.7 - r ? -.29 : -.57) : -.85; // the floor under any part of a ball
    for (let l = 0; l < 5; l++) for (let k = 0; k < 40; k++) for (let m = 0; m < 35; m++) {
      const x = -40 + r + (k % 2) * r + (l % 2) * r + m * 2 * r, zc = 30 + r + (l % 2) * r / Math.sqrt(3) + k * r * Math.sqrt(3), y = -.85 + r + l * .1633;
      if (x > -33 - r || zc > 37 - r || y < step(x, zc) + r - .001 || (l > 2 && hash(m + l * 41, k) > (l > 3 ? .22 : .8))) continue;
      const j = l > 2 ? .09 : .004; pos.push(x + j * (hash(m, k + l * 17) - .5), y + (l > 2 ? .06 * hash(k, m + l) : 0), zc + j * (hash(k + 5, m + l) - .5)); // the top ones tumble into a loose heap
    }
    const pb = pitBall(z, r), n = pos.length / 3, balls = new THREE.InstancedMesh(pb.geometry, pb.material, n), bc = [0xff5d73, 0x4db8ff, 0xffd84a, 0x58d68d, 0xff9f43, 0xffffff].map(c => new THREE.Color(c));
    for (let i = 0; i < n; i++) balls.setColorAt(i, bc[Math.floor(hash(i, 3) * 6)]);
    balls.castShadow = balls.receiveShadow = true; scene.add(balls);
    loose.push({ mesh: balls, r, pos, region: [-41, 28.4, -27, 43.6], seen: ['sP', 'mL'], bounce: .35, grip: 2.5, pour: 240, cap: 3, fine: pb.fine }); // cap: no ball flies faster, so a jump in leaves most of them in the pit
  }
  slide(z, -30.75, 0, 30.6, -Math.PI / 2); // up its steps from the room, down into the pit over the gap in the rim

  // wall pads: 6 cm sewn panels to 1.2 m on every wall, an aluminium capping strip along their top
  const wallRun = (x1, z1, x2, z2, n, c) => { const along = x2 - x1 > z2 - z1;
    run(along ? x1 : z1, along ? x2 : z2, n, (a, b, k) => along ? pad(c[k % 2], a + .002, 0, z1, b - .002, 1.2, z2, .025) : pad(c[k % 2], x1, 0, a + .002, x2, 1.2, b - .002, .025));
    along ? add(Al, new RoundedBoxGeometry(x2 - x1, .02, z2 - z1 + .012, 1, .004).translate((x1 + x2) / 2, 1.21, (z1 + z2) / 2)) : add(Al, new RoundedBoxGeometry(x2 - x1 + .012, .02, z2 - z1, 1, .004).translate((x1 + x2) / 2, 1.21, (z1 + z2) / 2));
    solid(x1, 0, z1, x2, 1.2, z2); };
  wallRun(-41, 28.4, -40.94, 43.6, 15, [1, 3]); wallRun(-40.94, 28.4, -27.06, 28.46, 14, [0, 2]); wallRun(-40.94, 43.54, -27.06, 43.6, 14, [2, 1]);
  wallRun(-27.06, 28.46, -27, 34, 6, [3, 0]); wallRun(-27.06, 38, -27, 43.54, 6, [3, 0]); // either side of the way in from the mall
  add(Al, new RoundedBoxGeometry(.05, .006, 4, 1, .002).translate(-27.02, .003, 36)); // the threshold strip where the mall's tile meets the mats
  mallBench(z, -27.4, 0, 40.6, -Math.PI / 2, { length: 1.8 }); // by the way in, to take your shoes off
  vent(z, -41, 2.75, 35.5, Math.PI / 2, { w: .6, h: .3 });

  box(M(z, 'ceilingTile', { color: 0xfff1dc }), -41.4, h, 28, -27, h + .2, 44); // a 60 cm tile grid; the panels sit in it
  box(W, -41.4, 0, 28, -27, h, 28.4); box(W, -41.4, 0, 43.6, -27, h, 44); box(W, -41.4, 0, 28.4, -41, h, 43.6);
  for (const [x, zc] of [[-37.5, 32.4], [-30.3, 32.4], [-37.5, 40.2], [-30.3, 40.2]]) lamp(z, x, zc, h, true, 55);

  { // a padded wall of little arches: walked through (slab's solids, drawn by nothing), drawn as a foam slab with a 4 cm rolled edge
    const cuts = [['arch', -38.8, 1.4, 2.05], ['arch', -37, 1.4, 2.05], ['arch', -35.2, 1.4, 2.05]], b = .04;
    slab(hide, 'x', 39.6, .5, -40.6, -33.4, 0, 2.2, cuts, true);
    const sh = new THREE.Shape().moveTo(-40.6 + b, 0).lineTo(-40.6 + b, 2.2 - b).lineTo(-33.4 - b, 2.2 - b).lineTo(-33.4 - b, 0);
    for (const [, c, w, top] of [...cuts].reverse()) { const a = w / 2 + b; sh.lineTo(c + a, 0).lineTo(c + a, top - w / 2).absarc(c, top - w / 2, a, 0, Math.PI, false).lineTo(c - a, 0); }
    sh.closePath(); add(V[2], new THREE.ExtrudeGeometry(sh, { depth: .5 - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 32 }).translate(0, 0, 39.6 + b));
  }
  { // a rainbow of four padded tubes against the wall, its feet on two flat pads; seams every metre along, one down its inside
    const g0 = [1.7, 1.42, 1.14, .86];
    g0.forEach((r, i) => { const g = new THREE.TorusGeometry(r, .14, 16, 64, Math.PI), uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * Math.PI * r, uv.getY(k) + .5);
      add(V[i], g.translate(-30.4, .05, 43.3), true); });
    for (const s of [-1, 1]) { pad(1, -30.4 + s * 1.3 - .62, 0, 43.06, -30.4 + s * 1.3 + .62, .06, 43.54, .025); solid(-30.4 + s * 1.3 - .62, 0, 43.06, -30.4 + s * 1.3 + .62, .06, 43.54); }
    for (let i = 0; i < 12; i++) { const u0 = -1.84 + .3067 * i, u1 = u0 + .3067, far = Math.max(Math.abs(u0), Math.abs(u1)), close = u0 * u1 < 0 ? 0 : Math.min(Math.abs(u0), Math.abs(u1)); // its solid, in twelve upright slices
      solid(-30.4 + u0, close < .72 ? Math.sqrt(.72 ** 2 - close ** 2) : 0, 43.16, -30.4 + u1, Math.sqrt(Math.max(0, 1.84 ** 2 - far ** 2)) + .05, 43.44); }
  }
  // foam shapes, set out as if tidied at closing: a ramp up onto a stacked pair, a roll, a tunnel arch
  foamWedge(z, -31.9, 0, 41.3, -Math.PI / 2, { h: .6, color: cols[2] }); foamCube(z, -31.15, 0, 41.3, 0, { color: cols[1] }); foamCube(z, -31.15, .6, 41.3, .12, { s: .5, color: cols[0] });
  foamCylinder(z, -28.6, 0, 41.6, 0, { color: cols[3] }); foamCube(z, -28.4, 0, 40.5, .4, { s: .5, color: cols[2] });
  foamCube(z, -37, 0, 41.5, 0, { s: .8, color: cols[1] }); foamArch(z, -35.6, 0, 42.6, 0, { color: cols[0] }); foamCylinder(z, -39.5, 0, 42.6, 0, { r: .25, h: .5, color: cols[2] }); foamCube(z, -34.1, 0, 42.9, -.2, { color: cols[3] });
}
