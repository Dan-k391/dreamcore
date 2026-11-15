// The dark passages that lead to the far-off places, each built twice (see passage() in build.js).
import { dry, zones, defZone } from '../core.js';
import { warps, passage, box, lit } from '../build.js';
import { voidMat } from '../mat.js';

// Dark passages come in pairs, far apart. Each is [x1, z1, x2, z2, open at its low end?, x and z offset to its twin, the twin's sky]; see passage()
const tunnels = [[2.8, 51.6, 4.8, 65.6, true, 0, 600, 'hill'], [67, 13, 81, 15, true, 600, 0, 'night'], [36.4, 48.4, 50.4, 50.4, true, 600, 600, 'dusk'],
  // from the hotel hallway's open room doors (z 42, 45.6, 49 on its east wall) to the laundromat, the metro platform and the glasshouse
  [5.4, 41.3, 11.2, 42.7, true, 585.1, -650.55, 'night'], [5.4, 44.9, 11.2, 46.3, true, 690, -638.6, 'night'], [5.4, 48.3, 11.2, 49.7, true, 817.2, -649, 'dusk']];
const t = { ...dry, grp: 'v', k: 0, exp: .3, fog: [0, 0, 0, .5], bloom: .3, wet: .5 };
const hotel = i => i > 2; // the hub halves behind the hotel's open doors: lit like the hallway's own lamps (grp), each with a warm lamp aimed back out
tunnels.forEach(([x1, z1, x2, z2, , dx, dz, sky], i) => { defZone('t' + i, { ...t, ...(hotel(i) && { grp: 'm' }), box: [x1, z1, x2, z2] }); defZone('u' + i, { ...t, sky, box: [x1 + dx, z1 + dz, x2 + dx, z2 + dz] }); });
tunnels.forEach(([x1, z1, , z2], i) => hotel(i) && lit(zones["t" + i], x1 + 1.3, 2.1, (z1 + z2) / 2 + .4, 130, [x1 - 2.2, 0, (z1 + z2) / 2], .9, 9, 0xffb878)); // through the doorway onto the carpet
for (const p of tunnels) passage(...p);
console.assert(warps.length === 2 * tunnels.length, 'level self-check failed: passages');
// The laundromat's and the metro's doorways face along z, so their passages end in a dark square turning toward the recess:
// zone id, [x1, z1, x2, z2] of the square (the passage comes in at x1), whether the recess opens on its z2 side (else z1), its sky.
for (const [id, x1, z1, x2, z2, toZ2, sky] of [['j3', 596.3, -609.25, 597.7, -607.85, true, 'night'], ['j4', 701.2, -593.7, 702.8, -592.3, false, 'night']]) {
  defZone(id, { ...t, sky, box: [x1, z1, x2, z2] });
  box(voidMat, x1, -.2, z1, x2, 0, z2); box(voidMat, x1, 2.4, z1, x2, 2.6, z2); box(voidMat, x2, 0, z1 - .3, x2 + .3, 2.6, z2 + .3); // floor, ceiling, far wall
  if (toZ2) box(voidMat, x1, 0, z1 - .3, x2, 2.6, z1); else box(voidMat, x1, 0, z2, x2, 2.6, z2 + .3); // the wall across from the recess
}
