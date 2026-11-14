// Light fittings (for an emitter, t is the emission pattern): the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

set('troffer', .6, 512, 1024, .25, 0, `
  float tubes = exp(-pow((uv.x - .28) / .1, 2.)) + exp(-pow((uv.x - .72) / .1, 2.));
  vec2 p = fract(uv * 150.) - .5; // 4 mm prisms
  float facet = abs(p.x) > abs(p.y) ? sign(p.x) * sign(uv.x < .5 ? .28 - uv.x : .72 - uv.x) : 0.; // faces turned toward a tube catch more of it
  float frame = 1. - ss(.012, .016, min(uv.x, 1. - uv.x) * .6);
  h = mix(1.2 * (.5 - max(abs(p.x), abs(p.y))), 2., frame);
  t = (.22 + .78 * tubes) * (.86 + .22 * facet) * (1. - frame);
  c = mix(vec3(.84, .84, .82), vec3(.78, .78, .76), frame); r = mix(.2, .45, frame);`);
set('opal', .5, 512, 512, .3, 0, `
  vec2 p = fract(uv * 10.) - .5; float led = exp(-dot(p, p) * 9.), mot = fbm(uv * 8., vec2(8), 4, 1); // LEDs on a 5 cm grid, softened by the diffuser
  t = .42 + .36 * led + .22 * mot; // a diffuser shows what is behind it: LED hot spots and an uneven glow, not a flat white c = vec3(.9); r = .28 + .05 * mot; h = .01 * fbm(uv * 300., vec2(300), 2, 3);`);
set('ledTube', .3, 512, 512, .25, 0, `
  float p = fract(uv.x * 30.) - .5; t = .7 + .3 * exp(-p * p * 14.); c = vec3(.9); r = .25; h = .08 * (.5 + .5 * sin(uv.y * 2. * PI * 60.));`);


// materials: name, texture set, shader options (see mat.js)
mat('troffer', 'troffer', { color: 0x6a6a66, emit: [0xffd6a0, 6.5], fine: .004 }); // fine: the 4 mm prisms fade out down a room instead of fringing
mat('trofferOff', 'troffer', { color: 0x9a9a90 });
mat('opalPanel', 'opal', { color: 0x9a9a96, emit: [0xffd29a, 4.5], fine: .05 });
mat('ledTube', 'ledTube', { color: 0x9a9a96, emit: [0xffd09a, 5], fine: .01 });
mat('frostedGlobe', 'opal', { color: 0x9a9a96, emit: [0xffc684, 4.5], fine: .05 });
mat('backlitPanel', 'opal', { color: 0x9a9a96, emit: [0xffd8a8, 3.2], fine: .05 });
