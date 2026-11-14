// The prop yard (dev only: level.js loads it with ?dev, like the showroom): one plain hall with a 14 x 8 m plot for each kit in
// js/props/, where the kit lays out its objects to be photographed (docs/props.md: the plot addresses and views). Light walls and
// floor, so metal and glass have something to reflect; two warm ceiling panels over each plot, one over the aisle in front and a key
// high to the front right, so tops and bevels catch the light and nothing is lit from below. The back left corner of every plot is
// dark (walls, floor and ceiling), for judging a lamp alight.
import { dry, zones, defZone } from '../core.js';
import { M, lampOn } from '../mat.js';
import { block, box, lit } from '../build.js';
import { lamp } from '../props/lights.js';
import * as lights from '../props/lights.js';
import * as metalwork from '../props/metalwork.js';
import * as garden from '../props/garden.js';
import * as play from '../props/play.js';
import * as structure from '../props/structure.js';

const X0 = -700, Z0 = -700, W = 14, D = 8, A = 8, h = 7; // bay i spans x X0+16i .. +16; its plot x+1 .. x+15, z Z0 .. Z0+8; the aisle in front runs to Z0+16
[lights, metalwork, garden, play, structure].forEach((kit, i) => {
  const x1 = X0 + 16 * i, x2 = x1 + 16, x = x1 + 1, cx = x + W / 2, zf = Z0 + D + A, id = 'yd' + i;
  defZone(id, { ...dry, grp: 'y', k: 1.5, exp: .34, fog: [.2, .17, .13, .002], bloom: .3, wet: 0, box: [x1, Z0, x2, zf], probe: [cx, 2.2, Z0 + 7] });
  const z = zones[id], F = M(z, 'concreteFloor', { color: 0xb4ada2 }), L = M(z, 'plaster', { color: 0xcdc6ba }), dk = M(z, 'plaster', { color: 0x2c2925 }), dkF = M(z, 'concreteFloor', { color: 0x2e2b27 });
  box(F, x1, -.2, Z0 - .3, x2, 0, zf + .3); box(L, x1, h, Z0 - .3, x2, h + .2, zf + .3); // floor, ceiling
  box(L, x1, 0, Z0 - .3, x2, h, Z0); box(L, x1, 0, zf, x2, h, zf + .3); // back and front walls
  box(L, x1 - .1, 0, Z0, x1 + .1, h, i ? Z0 + D + .5 : zf); if (i === 4) box(L, x2 - .1, 0, Z0, x2 + .1, h, zf); // a wall between bays the depth of the plot; the end walls run to the front
  const c1 = x1 + .1, c2 = x + 3.5, c3 = Z0 + 3.5; // the dark corner
  block(dk, c1, 0, Z0, c2, h, Z0 + .01); block(dk, c1, 0, Z0, c1 + .01, h, c3); block(dkF, c1, 0, Z0, c2, .002, c3); block(dk, c1, h - .002, Z0, c2, h, c3);
  lamp(z, x + 7.5, Z0 + 4, h, true, 32); lamp(z, x + 11.5, Z0 + 4, h, true, 32); lamp(z, cx, Z0 + 12, h, true, 30);
  box(lampOn, x + 13.2, h - .012, Z0 + 9.4, x + 13.8, h + .01, Z0 + 10.6); lit(z, x + 13.5, h - .1, Z0 + 10, 170, [cx, .5, Z0 + 4], 1, 20, 0xffd8a4); // the key
  kit.yard({ zone: z, x, z: Z0, w: W, d: D });
});
