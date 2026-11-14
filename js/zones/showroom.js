// The material showroom (dev only: level.js loads it with ?dev): every library material on a 1.2 m wall panel, a 0.45 m sphere
// (triplanar) and a 0.45 m rounded cube (its own UVs) on a plinth, labelled. North side lit from above, south side in raking
// light from a lamp by the floor. Station i (LIB order) is centred at x = -673.5 + 3i; see AGENTS.md for the photo addresses.
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
const names = Object.keys(LIB), per = 8, X0 = -675, h = 3.2, sphere = new THREE.SphereGeometry(.225, 64, 32), cube = new RoundedBoxGeometry(.45, .45, .45, 6, .04);
for (let j = 0; j * per < names.length; j++) {
  const x1 = X0 + 3 * per * j, x2 = x1 + 3 * per, id = 'sR' + j;
  defZone(id, { ...dry, grp: 's', k: 1, exp: .34, fog: [.2, .17, .13, .002], bloom: .3, wet: 0, box: [x1, -2.4, x2, 2.4], probe: [(x1 + x2) / 2, 1.6, 0] });
  const z = zones[id], W = M(z, 'plaster', { color: 0x57524b }), F = M(z, 'concreteFloor', { color: 0x9a948a }), plinth = M(z, 'plaster', { color: 0x2c2a27 });
  box(F, x1, -.2, -2.8, x2, 0, 2.8); box(W, x1, h, -2.8, x2, h + .2, 2.8); box(W, x1, 0, -2.8, x2, h, -2.4); box(W, x1, 0, 2.4, x2, h, 2.8);
  if (j === 0) box(W, x1 - .4, 0, -2.8, x1, h, 2.8);
  if (x2 >= X0 + 3 * names.length) box(W, x2, 0, -2.8, x2 + .4, h, 2.8);
  for (let i = per * j; i < Math.min(names.length, per * (j + 1)); i++) {
    const n = names[i], x = X0 + 3 * i + 1.5, flat = M(z, n), tri = M(z, n, { tri: 1 }), own = M(z, n, { uv: [.45, .45] }), plate = tag(n.replace(/[A-Z]/g, c => ' ' + c.toLowerCase()));
    for (const k of [-1, 1]) { // k -1: north wall, lit from above; 1: south wall, raking light
      const wz = 2.4 * k, f = wz - .04 * k, pz = wz - .45 * k;
      box(flat, x - 1.1, .6, Math.min(wz, f), x + .1, 1.8, Math.max(wz, f)); // the panel
      box(plinth, x + .35, 0, pz - .25, x + 1.15, .7, pz + .25); // sphere and cube on it
      add(tri, sphere.clone().translate(x + .53, .925, pz)); add(own, cube.clone().translate(x + .97, .925, pz), true);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .1375), plate); p.position.set(x - .5, .42, wz - .01 * k); p.rotation.y = k < 0 ? 0 : Math.PI; scene.add(p);
    }
    box(lampOn, x - .3, h - .012, -2.2, x + .3, h + .01, -1.0); lit(z, x, h - .08, -1.6, 40, [x, .6, -2.35], 1.25, 8, 0xffdcae); // above the north side
    add(M(z, 'frostedGlobe'), new THREE.SphereGeometry(.04, 20, 12).translate(x - .5, .06, 2.3)); lit(z, x - .5, .1, 2.27, 30, [x - .5, 1.9, 2.37], .75, 6, 0xffcf98); // by the floor under the south panel, grazing up it
    block(plinth, x - .56, 0, 2.24, x - .44, .02, 2.36);
  }
}
