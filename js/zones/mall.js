// The mall atrium.
import { dry, zones, defZone } from '../core.js';
import { M as lib, P, neon, wallMat } from '../mat.js';
import { box, block, lit } from '../build.js';
import { mallBench, palmPlanter, pottedPlant } from '../props/garden.js';
import { door, railing, shutter, bin, signPost } from '../props/metalwork.js';
import { beam, skirting } from '../props/structure.js';
import { troffer, neonSign } from '../props/lights.js';

// The shop signs' tubes, [x, y] in metres about the sign's centre: no words, only shapes (the kit's default is a sun over water).
const arc = (cx, cy, r, a0, a1, n = 28) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const wave = (y, w, amp, n = 4) => Array.from({ length: 41 }, (_, i) => { const t = i / 40; return [-w / 2 + w * t, y + amp * Math.sin(t * Math.PI * 2 * n)]; });
const SIGNS = [
  undefined,
  [arc(0, -.16, .32, .05, Math.PI - .05), arc(0, -.16, .24, .05, Math.PI - .05), arc(0, -.16, .16, .05, Math.PI - .05)], // three arcs
  [[...arc(-.1, .04, .22, Math.PI * .55, Math.PI * 1.45), ...arc(-.02, .04, .18, Math.PI * 1.38, Math.PI * .62, 24)], wave(.0, .5, .02, 3).map(([a, b]) => [a + .45, b - .1])], // a crescent and a ripple
  [wave(.18, 1.3, .045), wave(.03, 1.3, .045), wave(-.12, 1.3, .045)], // three waves
  [Array.from({ length: 11 }, (_, i) => { const r = i % 2 ? .1 : .25, a = Math.PI / 2 + i * Math.PI / 5; return [r * Math.cos(a), .03 + r * Math.sin(a)]; })], // a star
];

defZone('mL', { ...dry, grp: 'm', k: 1.15, exp: .3, fog: [.4, .38, .4, .0008], bloom: .25, wet: .7, box: [-27, 24, 2.4, 50], probe: [-12.5, 3.4, 41] }); // off the palms' line: from between them their leaves filled the floor's reflection with a green blob
{ // mall atrium x[-26.6,1.8] z[24.4,49.6], 7m tall: polished chequered floor, shop fronts between piers under fascias with neon signs, a gallery, a skylight, palms
  const z = zones.mL, h = 7, F = lib(z, 'marble'), W = wallMat(z, 0xe6dcd6), soft = neon(0xfff0d8, 2.2), dark = P(z, { color: 0x050505, roughness: 1 }), Bk = lib(z, 'terrazzo'), skirt = pts => skirting(z, pts, { color: 0x5e564d }); // skirting darker than the wall, as the fascias
  box(F, -27, -.2, 24, 2.2, 0, 50); box(W, -27, h, 24, 2.2, h + .3, 50);
  box(W, -27, 0, 24, 2.2, h, 24.4); box(W, -27, 0, 49.6, 2.2, h, 50); // north and south walls
  box(W, 1.8, 0, 24.4, 2.2, h, 44); box(W, 1.8, 0, 46, 2.2, h, 49.6); box(W, 1.8, 2.3, 44, 2.2, h, 46); // east, door to the hotel hallway
  box(W, 1.8, 0, 44, 2.2, 2.3, 44.5); box(W, 1.8, 0, 45.5, 2.2, 2.3, 46); // the hole narrowed to the door frame's 1 m
  door(z, 1.82, 0, 45, Math.PI / 2, { open: 1.85, color: 0x7a5a3c, frame: 0xd9d2c4 }); // swings into the mall, held back against the wall north of it
  box(W, -27, 0, 24.4, -26.6, h, 34); box(W, -27, 0, 38, -26.6, h, 49.6); box(W, -27, 3, 34, -26.6, h, 38); // west, opening to the soft play room
  const signs = [0xff8fb8, 0xffb060, 0xffd28a, 0xff9a8a, 0xe8a0ff], PD = .25; // PD: how far the piers and fascias stand off the wall
  for (const [zw, k] of [[24.4, 1], [49.6, -1]]) {
    const Z = (a, b) => [Math.min(zw + k * a, zw + k * b), Math.max(zw + k * a, zw + k * b)];
    const pier = (xa, xb) => { const [p1, p2] = Z(0, PD); box(W, xa, 0, p1, xb, 4.1, p2); // a pier between two shops, skirted round its three faces
      skirt((k > 0 ? [[xb, zw], [xb, zw + PD], [xa, zw + PD], [xa, zw]] : [[xa, zw], [xa, zw - PD], [xb, zw - PD], [xb, zw]]).map(([a, b]) => [a, 0, b])); };
    pier(-26, -25.6);
    for (let i = 0; i < 5; i++) { // shop fronts
      const x0 = -25.6 + 5.4 * i, cx = x0 + 2.3, open = (i + (k > 0)) % 3 === 0;
      pier(x0 + 4.6, x0 + 5);
      beam(z, [[x0, 4.1, zw + k * PD / 2], [x0 + 4.6, 4.1, zw + k * PD / 2]], { w: PD, d: .8, color: 0x57514a }); // the fascia, 3.3 to 4.1
      const n = (i + (k > 0) * 2) % 5; neonSign(z, cx, 3.68, zw + k * PD, k > 0 ? 0 : Math.PI, { strokes: SIGNS[(i * 2 + (k > 0)) % 5], color: signs[n], k: 4 }); // the sign on the fascia
      let [z1, z2] = Z(0, .06);
      if (open) { // lit and empty: a terrazzo stall riser either side of a recessed entrance in a bronze frame
        block(soft, x0, .1, z1, x0 + 4.6, 3.3, z2); lit(z, cx, 1.8, zw + k * .3, 40, [cx, 0, zw + k * 6], 1.3, 14);
        [z1, z2] = Z(0, .14); box(Bk, x0, 0, z1, cx - .6, .45, z2); box(Bk, cx + .6, 0, z1, x0 + 4.6, .45, z2);
        door(z, cx, 0, zw + k * .075, k > 0 ? 0 : Math.PI, { leaf: false, frame: 0x3b332b });
      } else { // shuttered: a roller shutter between the piers, its coil hidden behind the fascia; one left a hand's width up on the dark
        const ajar = k > 0 && i === 3;
        shutter(z, cx, 0, zw, k > 0 ? 0 : Math.PI, { w: 4.41, h: 3.3, hood: false, open: ajar ? .085 : 0, color: [0x7d8286, 0x5f6a6e, 0x9a9282][(i + k + 2) % 3] });
        if (ajar) { const [d1, d2] = Z(0, .012); block(dark, x0, 0, d1, x0 + 4.6, .4, d2); } // the unlit shop behind
      }
      [z1, z2] = Z(0, 1.3); box(W, x0 - .4, 4.1, z1, x0 + 5, 4.35, z2); // upper gallery
      troffer(z, cx, 4.1, zw + k * .85, 0, { w: .6, l: .6, on: false }); // dead fittings in the gallery's soffit
      if (i === 1 || i === 3) door(z, cx, 4.35, zw, k > 0 ? 0 : Math.PI, { color: 0x6f7c80, frame: 0xd9d2c4 }); // service doors on the gallery
    }
    railing(z, [[-26, 4.35, zw + k * 1.24], [1, 4.35, zw + k * 1.24]]); // the gallery's edge
  }
  skirt([[-26, 0, 24.4], [-26.6, 0, 24.4], [-26.6, 0, 34]]); skirt([[-26.6, 0, 38], [-26.6, 0, 49.6], [-26, 0, 49.6]]); // west wall
  skirt([[1.8, 0, 44.4], [1.8, 0, 24.4], [1, 0, 24.4]]); skirt([[1, 0, 49.6], [1.8, 0, 49.6], [1.8, 0, 45.6]]); // east wall, stopping at the door frame
  block(neon(0xffedc0, 4), -20, h - .02, 35.5, -5, h + .01, 38.5); for (const x of [-19, -12.4, -5.8]) lit(z, x, h - .1, 37, 170, [x, 0, 37], 1.1, 16, 0xffedc4); // skylight
  for (const x of [-18, -7]) { // a palm in a round planter under the skylight, a bench either side
    palmPlanter(z, x, 0, 37, 0, { radius: 1.05 });
    for (const zc of [34.7, 39.3]) mallBench(z, x, 0, zc, 0, { length: 2 });
  }
  bin(z, -12.5, 0, 35.05, 0, { color: 0x4a4038 }); bin(z, 1.3, 0, 47.4, 0, { color: 0x4a4038 }); // between the benches; by the hotel door
  signPost(z, -24.9, 0, 39, Math.PI / 2, { color: 0x3b4a52 }); // a wayfinding sign beside the soft play opening, left blank
  pottedPlant(z, 1.3, 0, 43.75); pottedPlant(z, -26.15, 0, 33.55); pottedPlant(z, -26.15, 0, 38.45, 2); // by the hotel door and the soft play opening
}