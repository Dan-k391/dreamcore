// Plastics, rubber and glass: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

set('gelcoat', 1, 512, 512, .04, 0, `
  float fb = fibres(uv * 90., vec2(90), 1, .9, .02) * .5 + fibres(uv * 140. + .3, vec2(140), 3, .9, .02) * .5; // glass fibre printing through
  float seam = 1. - ss(.3, .9, min(uv.x, 1. - uv.x) * 1000.);
  c = vec3(.86) * (1. - .2 * seam); h = .004 * fb - .08 * seam; r = .035 + .01 * fbm(uv * 8., vec2(8), 3, 5) + .2 * seam; t = 1.;`);
set('hardPlastic', 1, 512, 512, .34, 0, `
  float g = fbm(uv * 700., vec2(700), 2, 1), line = 1. - ss(.2, .45, abs(uv.y - .5) * 1000.), haze = ss(.5, .7, fbm(uv * 6., vec2(6), 4, 3));
  c = vec3(.82) * (1. - .04 * haze); h = .006 * g + .05 * line; r = .3 + .05 * g + .2 * haze + .1 * line; t = 1.;`);
set('pvc', 1, 512, 512, .13, 0, `
  float du = min(uv.x, 1. - uv.x) * 1000., weld = 1. - ss(3.5, 4.5, du), lip = 1. - ss(.0, .8, abs(du - 4.)), wr = fbm(uv * vec2(3., 10.), vec2(3., 10.), 4, 1);
  h = .25 * weld + .2 * lip + .3 * wr; c = vec3(.86) * (1. - .06 * weld); r = .12 + .1 * weld + .03 * wr; t = 1.;`);
set('rubber', .5, 512, 512, .85, .2, `
  float g = fbm(uv * 500., vec2(500), 3, 1); c = vec3(.034) * (.9 + .2 * g); h = .05 * g; r = .82 + .08 * g; t = 1.;`);
set('glass', 1, 512, 512, .06, 0, `
  vec3 nv = vorv(uv * 3., vec2(3), 1, 1.); float d = length(nv.xy);
  float wipe = (.5 + .5 * sin(d * 120.)) * (1. - ss(.25, .5, d)) * step(.5, nv.z) * fbm(uv * 30., vec2(30), 3, 5); // wiped arcs
  float dust = step(.97, vn(uv * 900., vec2(900), 3));
  c = vec3(.95); r = .03 + .14 * wipe + .3 * dust; t = 1.;`);

// materials: name, texture set, shader options (see mat.js)
mat('gelcoat', 'gelcoat', { color: 0x3aa6c8, detail: .04 });
mat('hardPlastic', 'hardPlastic', { color: 0xe8b820, detail: .12, wear: .3, edgeCol: [.85, .85, .82] });
mat('pvc', 'pvc', { color: 0xff8fb0, detail: .04 });
mat('rubber', 'rubber', { detail: .2, dirt: .3 });
mat('glass', 'glass', { color: 0xdcefe6, transparent: true, opacity: .22, depthWrite: false });
mat('frostedGlass', 'glass', { color: 0xf2f2ec, roughness: .55, transparent: true, opacity: .85 });
