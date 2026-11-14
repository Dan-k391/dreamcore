// The dark passages that lead to the far-off places, each built twice (see passage() in build.js).
import { dry, defZone } from '../core.js';
import { warps, passage } from '../build.js';

// Dark passages come in pairs, far apart. Each is [x1, z1, x2, z2, open at its low end?, x and z offset to its twin, the twin's sky]; see passage()
const tunnels = [[2.8, 51.6, 4.8, 65.6, true, 0, 600, 'hill'], [67, 13, 81, 15, true, 600, 0, 'night'], [36.4, 48.4, 50.4, 50.4, true, 600, 600, 'dusk']];
tunnels.forEach(([x1, z1, x2, z2, , dx, dz, sky], i) => { const t = { ...dry, grp: 'v', k: 0, exp: .3, fog: [0, 0, 0, .5], bloom: .3, wet: .5 };
  defZone('t' + i, { ...t, box: [x1, z1, x2, z2] }); defZone('u' + i, { ...t, sky, box: [x1 + dx, z1 + dz, x2 + dx, z2 + dz] }); });
for (const t of tunnels) passage(...t);
console.assert(warps.length === 2 * tunnels.length, 'level self-check failed: passages');
