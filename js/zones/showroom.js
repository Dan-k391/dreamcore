// The material showroom (dev only: level.js loads it with ?dev): every library material on a 1.2 m wall panel, a 0.6 m sphere
// (triplanar) and a 0.6 m rounded cube (its own UVs) on a plinth, labelled. The rig is a photographer's, the same at every station:
// north side a soft frontal light from above, south side a warm key from above and to one side (the right as you face the wall), raking down the panel at about
// 10 degrees. Light neutral walls and a lit ceiling panel over each side give the zone's probe something to reflect.
// Station i (LIB order) is centred at x = -673.5 + 3i; see docs/materials.md for the photo addresses.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene, dry, zones, defZone } from '../core.js';
import { maxA } from '../tex.js';
import { M, LIB, lampOn } from '../mat.js';
import { add, box, block, lit } from '../build.js';

const tag = text => { // a small name plate (64 px tall: sign()'s 256 px plates would cost 2.5 MB each, a hundred of them)
  const c = document.createElement('canvas'), g = c.getContext('2d'); c.width = 512; c.height = 64; g.fillStyle = '#17140f'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#f0e2c0'; g.font = '600 38px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxA;
  return new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(.9, .9, .9) }); };
const names = Object.keys(LIB), per = 8, X0 = -675, h = 3.2, sphere = new THREE.SphereGeometry(.3, 96, 48), cube = new RoundedBoxGeometry(.6, .6, .6, 6, .05);
for (let j = 0; j * per < names.length; j++) {
  const x1 = X0 + 3 * per * j, x2 = x1 + 3 * per, id = 'sR' + j;
  defZone(id, { ...dry, grp: 's', k: 1.5, exp: .34, fog: [.2, .17, .13, .002], bloom: .3, wet: 0, box: [x1, -2.4, x2, 2.4], probe: [(x1 + x2) / 2, 1.6, 0] });
  const z = zones[id], W = M(z, 'plaster', { color: 0xa29d94 }), F = M(z, 'concreteFloor', { color: 0x9a948a }), plinth = M(z, 'plaster', { color: 0x4a4640 });
  box(F, x1, -.2, -2.8, x2, 0, 2.8); box(W, x1, h, -2.8, x2, h + .2, 2.8); box(W, x1, 0, -2.8, x2, h, -2.4); box(W, x1, 0, 2.4, x2, h, 2.8);
  if (j === 0) box(W, x1 - .4, 0, -2.8, x1, h, 2.8);
  if (x2 >= X0 + 3 * names.length) box(W, x2, 0, -2.8, x2 + .4, h, 2.8);
  for (let i = per * j; i < Math.min(names.length, per * (j + 1)); i++) {
    const n = names[i], x = X0 + 3 * i + 1.5, flat = M(z, n), tri = M(z, n, { tri: 1 }), own = M(z, n, { uv: [.6, .6] }), plate = tag(n.replace(/[A-Z]/g, c => ' ' + c.toLowerCase()));
    for (const k of [-1, 1]) { // k -1: north wall, lit from above; 1: south wall, raking light
      const wz = 2.4 * k, f = wz - .04 * k, pz = wz - .55 * k;
      box(flat, x - 1.1, .6, Math.min(wz, f), x + .1, 1.8, Math.max(wz, f)); // the panel
      box(plinth, x + .2, 0, pz - .35, x + 1.6, .6, pz + .35); // sphere and cube on it
      add(tri, sphere.clone().translate(x + .55, .9, pz)); add(own, cube.clone().translate(x + 1.22, .9, pz), true);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .1375), plate); p.position.set(x - .5, .42, wz - .01 * k); p.rotation.y = k < 0 ? 0 : Math.PI; scene.add(p);
    }
    // north: a soft light from the ceiling in front of the panel, aimed at it and the plinth
    box(lampOn, x - .6, h - .012, -1.6, x + .2, h + .01, -.8); lit(z, x - .2, h - .08, -1.2, 50, [x - .1, .9, -2.4], 1.3, 9, 0xffdcae);
    // south: the key, high and to one side, close to the wall, so it rakes down the panel and models the sphere and cube from above
    box(lampOn, x - 1.3, h - .012, 1.9, x - .5, h + .01, 2.3); lit(z, x - .9, h - .15, 2.15, 70, [x, .7, 2.4], 1., 9, 0xffd29a);
  }
}
