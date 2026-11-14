// Kit: light fittings (troffers, battens, panels, sconces, street and mast lamps, globes, step lights, neon, pool lights).
// Materials: js/tex/light.js. Convention, the yard and the inventory: docs/props.md.
import * as THREE from 'three';
import { V, H } from '../core.js';
import { lampOn, lampOff } from '../mat.js';
import { emitters, add, box, round, tube, lit } from '../build.js';

const lamp = (z, x, zc, h = H, on = true, power = 120) => { // ceiling panel on the 60cm grid, plus the light it emits
  box(on ? lampOn : lampOff, x - .3, h - .012, zc - .6, x + .3, h + .01, zc + .6);
  if (on) emitters.push({ zone: z, p: V(x, h - .05, zc), t: V(x, 0, zc), power: power * (h / H) ** 2, angle: 1.45, dist: 16, color: 0xfff0cf });
};
const post = (mat, globe, x, y, z, ax, az, power, zone) => { // street lamp: a pole curving over to a glowing globe; lit only where a zone is given
  tube([[x, y - .4, z], [x, y + 3.4, z], [x + ax * .12, y + 3.85, z + az * .12], [x + ax * .5, y + 4.05, z + az * .5], [x + ax * .9, y + 4, z + az * .9]], .045, 40, mat);
  add(globe, new THREE.SphereGeometry(.16, 20, 14).translate(x + ax * .95, y + 3.88, z + az * .95)); add(mat, new THREE.CylinderGeometry(.09, .11, .5, 12).translate(x, y + .25, z));
  round(x, z, .11, y - .4, y + .5); round(x, z, .05, y + .5, y + 3.5);
  if (zone) lit(zone, x + ax * .95, y + 3.7, z + az * .95, power, [x + ax * .95, y, z + az * .95], 1.2, 18, 0xffc98a);
};

function yard(plot) {} // the lights plot in the dev yard (js/zones/yard.js): one of each fitting, lamps glowing in its dark corner

export { lamp, post, yard };
