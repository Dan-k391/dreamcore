// Kit: structure (car-park pillars, wheel stops, kerbs, speed bumps, bay paint, columns, piers, steps, bollards, skirting, beams).
// Materials: js/tex/mineral.js. Convention, the yard and the inventory: docs/props.md.
import * as THREE from 'three';
import { M } from '../mat.js';
import { add, put, solidAt } from '../build.js';

// The pattern every kit function follows (docs/props.md): (zone, x, y, z, ry = 0, o = {}). Built about its own origin (feet at y 0,
// front toward +z), set in the world with put(), added through add() so it merges per material, and it registers its own solids.
// A precast concrete wheel stop: 1.65 m long along its own x, 15 cm deep, 10 cm tall with a chamfered top, pinned by two steel spikes.
function wheelStop(z, x, y, zc, ry = 0, o = {}) {
  const C = M(z, 'concreteWall', { color: o.color ?? 0xb4aea4, wear: .5 }), S = M(z, 'galvanised'), l = o.length ?? 1.65;
  const sh = new THREE.Shape().moveTo(-.075, 0).lineTo(.075, 0).lineTo(.075, .06).lineTo(.035, .1).lineTo(-.035, .1).lineTo(-.075, .06).closePath();
  add(C, put(new THREE.ExtrudeGeometry(sh, { depth: l, bevelEnabled: false }).translate(0, 0, -l / 2).rotateY(Math.PI / 2), x, y, zc, ry));
  for (const k of [-.36, .36]) add(S, put(new THREE.CylinderGeometry(.016, .016, .012, 16).translate(k * l, .104, 0), x, y, zc, ry)); // the spike heads in their holes
  solidAt(x, y, zc, ry, 0, .05, 0, l, .1, .15);
}

function yard(plot) { // the structure plot in the dev yard (js/zones/yard.js)
  const { zone, x, z } = plot;
  wheelStop(zone, x + 10, 0, z + 6); wheelStop(zone, x + 12, 0, z + 6, .4);
}

export { wheelStop, yard };
