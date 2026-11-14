// The hotel hallway behind where you start.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { dry, zones, defZone } from '../core.js';
import { hotelTex } from '../tex.js';
import { dirt, P, M, sign } from '../mat.js';
import { add, block, box, solid, put } from '../build.js';
import { door } from '../props/metalwork.js';
import { sconce, opalPanel } from '../props/lights.js';
import { skirting } from '../props/structure.js';

// Engraved lettering (room numbers, row letters): one canvas atlas and one material a zone, a cell per text. Returns (i, w, h) => the
// i-th cell as a plane (w:h = 2:1) to add() with its own UVs, laid a hair proud of the plate it sits on.
export function lettering(z, texts) {
  const n = texts.length, c = document.createElement('canvas'), g = c.getContext('2d'); c.width = 256; c.height = 128 * n;
  g.fillStyle = '#fff'; g.font = '600 96px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  texts.forEach((t, i) => g.fillText(t, 128, 128 * i + 70, 236));
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const m = P(z, { map, alphaTest: .5, color: 0x1c140c, roughness: .55, metalness: .4 });
  return (i, w, h) => { const q = new THREE.PlaneGeometry(w, h), uv = q.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / n); return [m, q]; };
}

// A moulding run along z on a wall face at x = f, looking +x (k 1) or -x (k -1): `prof` is [out, up] in metres, z1..z2 its length.
const moulding = (mat, prof, f, y, z1, z2, k) => {
  const s = new THREE.Shape(prof.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(s, { depth: z2 - z1, bevelEnabled: false, curveSegments: 4 });
  add(mat, k > 0 ? g.translate(f, y, z1) : g.rotateY(Math.PI).translate(f, y, z2));
};
const DADO = [[0, -.035], [.011, -.035], [.016, -.028], [.016, -.018], [.012, -.012], [.02, -.004], [.024, .006], [.02, .016], [.012, .02], [.012, .026], [0, .03]];
const PICTURE = [[0, -.022], [.006, -.022], [.016, -.012], [.02, -.002], [.017, .006], [.012, .008], [.012, .016], [0, .02]];

defZone('hT', { ...dry, step: 'carpet', grp: 'm', k: 1, exp: .34, fog: [.3, .2, .12, .004], bloom: .3, wet: .1, hum: .3, box: [2.4, 21.4, 5.2, 51.6], probe: [3.8, 1.5, 36] });
{ // hotel hallway x[2.6,5] z[21.4,51.6], through a door behind where you start: patterned carpet, damask above dark stained boarding to a
  // dado rail, a picture rail, numbered room doors in their frames, a sconce between each pair, opal panels down the ceiling
  const z = zones.hT, h = 2.8, C = P(z, { map: hotelTex.map, normalMap: hotelTex.normalMap, ...dirt });
  const W = M(z, 'damask', { color: 0xe0cba0 }), Pl = M(z, 'plaster', { color: 0xe9dcc0 }), Wd = M(z, 'hardwood', { color: 0x6a4030, swap: 1 });
  const Rl = M(z, 'gelcoat', { color: 0x4a2c1e, wear: 0, roughness: .3, macro: .05 }), Br = M(z, 'brass', { roughness: .3, dirt: .6 }), K = P(z, { color: 0x050403, roughness: 1 });
  const nums = [], txt = lettering(z, Array.from({ length: 13 }, (_, i) => String(301 + i)));
  box(C, 2.2, -.2, 21.4, 5.4, 0, 51.6); box(Pl, 2.2, h, 21.4, 5.4, h + .2, 51.6); box(W, 2.6, 2.24, 51.55, 5, h, 51.75);
  for (const [x1, x2, f, k, gap, doors] of [[2.2, 2.6, 2.6, 1, 45, [24, 27.6, 31.2, 34.8, 38.4, 49]], [5, 5.4, 5, -1, 31, [24, 27.6, 34.8, 38.4, 42, 45.6, 49]]]) { // west wall (way to the mall), east wall (way to the cinema)
    const ry = k * Math.PI / 2, ops = [...doors.map(d => [d, 1]), [gap, 0]].sort((a, b) => a[0] - b[0]);
    let z0 = 21.4;
    for (const [c, isDoor] of ops) { // the wall round each 1.0 x 2.24 m opening; a room door's opening is shut by its leaf and a dark backing
      box(W, x1, 0, z0, x2, h, c - .5); box(W, x1, 2.24, c - .5, x2, h, c + .5); z0 = c + .5;
      if (isDoor) { solid(x1, 0, c - .5, x2, 2.24, c + .5); block(K, k > 0 ? x1 : x2 - .2, 0, c - .5, k > 0 ? x1 + .2 : x2, 2.24, c + .5); }
      door(z, f - k * .05, 0, c, ry, isDoor ? { color: 0x4b2418, frame: 0xd8ccb4 } : { leaf: false, frame: 0xd8ccb4 });
      if (isDoor) { // a door viewer in the leaf, and the room number on a brass plate on the wall by the latch
        add(Br, put(new THREE.LatheGeometry([[0, .009], [.009, .009], [.011, .007], [.0115, .003], [.0115, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 24).rotateX(Math.PI / 2).translate(0, 1.52, -.05 + .0225), f, 0, c, ry));
        add(K, put(new THREE.CircleGeometry(.005, 16).translate(0, 1.52, -.05 + .0225 + .0092), f, 0, c, ry));
        add(Br, put(new RoundedBoxGeometry(.17, .095, .008, 2, .003).translate(.74, 1.5, .004), f, 0, c, ry));
        const [m, q] = txt(nums.length, .15, .075); nums.push(c); add(m, put(q.translate(.74, 1.5, .0085), f, 0, c, ry), true);
        for (const sx of [-.072, .072]) add(Br, put(new THREE.SphereGeometry(.004, 10, 4, 0, 2 * Math.PI, 0, Math.PI / 2).scale(1, 1, .5).rotateX(Math.PI / 2).translate(.74 + sx, 1.5, .008), f, 0, c, ry));
      }
    }
    box(W, x1, 0, z0, x2, h, 51.6);
    // boarding, rails and skirting between the door frames (each 1.2 m wide)
    const cuts = ops.map(([c]) => [c - .61, c + .61]), runs = []; let a = 21.4;
    for (const [c1, c2] of cuts) { if (c1 > a + .05) runs.push([a, c1]); a = c2; } runs.push([a, 51.55]);
    for (const [r1, r2] of runs) {
      block(Wd, k > 0 ? f : f - .012, 0, r1, k > 0 ? f + .012 : f, .9, r2);
      moulding(Rl, DADO, f + k * .012, .9, r1, r2, k); moulding(Rl, PICTURE, f, 2.38, r1, r2, k);
      skirting(z, k > 0 ? [[f + .012, 0, r1], [f + .012, 0, r2]] : [[f - .012, 0, r2], [f - .012, 0, r1]], { color: 0x3a2318 });
    }
    // a sconce between each pair of openings, 1.75 m up
    for (let i = 0; i + 1 < ops.length; i++) sconce(z, f, 1.75, (ops[i][0] + ops[i + 1][0]) / 2, ry);
  }
  block(Pl, 1.9, 0, 44, 2.2, 2.3, 44.5); block(Pl, 1.9, 0, 45.5, 2.2, 2.3, 46); block(Pl, 1.9, 2.24, 44.5, 2.2, 2.3, 45.5); // line the mall's wider opening down to this one
  for (const zc of [24.6, 30.6, 36.6, 42.6, 48.6]) opalPanel(z, 3.8, h, zc, 0, { w: .6, l: .6, power: 50 });
  sign('EXIT', 3.8, 2.6, 51.54, Math.PI, .6, .22, '#8fffc0', '#021a0c');
}
