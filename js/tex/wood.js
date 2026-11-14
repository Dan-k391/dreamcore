// Wood and plants: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import * as THREE from 'three';
import { set, mat } from './registry.js';

set('hardwood', 1.2, 1024, 1024, .32, .3, `
  float b = floor(uv.y * 8.), fy = fract(uv.y * 8.), r1 = hf(vec2(0., b), 1), r2 = hf(vec2(0., b), 3);
  float groove = 1. - ss(.5, 2.5, min(fy, 1. - fy) * 150.); // V-joints between 15 cm boards
  float x = uv.x * 2. * PI; // each board cut from a log at its own place: rings round a pith below the face, rising and falling along it (cathedral figure)
  float z0 = .07 + .06 * r1 + .03 * sin(x + r2 * 6.) + .01 * sin(3. * x + r1 * 9.), yy = fy * .15 - .075 - .1 * (r2 - .5);
  float d = sqrt(yy * yy + z0 * z0) + .0012 * gn(vec2(uv.x * 20., fy * 6. + b * 3.), vec2(20., 4096.), 5);
  float ring = fract(d * (130. + 60. * r2)), late = ss(.55, .85, ring) * (1. - ss(.93, 1., ring)) * (.6 + .4 * gn(vec2(uv.x * 40., d * 300.), vec2(40., 4096.), 8));
  float pore = step(.8, vn(uv * vec2(2400., 2080.), vec2(2400., 2080.), 7)) * (.4 + late);
  vec3 wood = mix(vec3(.44, .27, .14), vec3(.22, .11, .05), late) * (.75 + .4 * r1) * (.9 + .14 * fbm(uv * vec2(4., 30.), vec2(4., 30.), 4, 9));
  wood *= 1. - .4 * pore;
  c = mix(wood, wood * .3, groove); h = -2.5 * groove * groove + .03 * late - .05 * pore; r = .26 + .14 * pore + .1 * groove + .04 * late; t = 1.;`);
set('benchWood', 1, 1024, 1024, .34, .3, `
  float wob = gn(uv * vec2(2., 5.), vec2(2., 5.), 1) + .5 * gn(uv * vec2(6., 14.), vec2(6., 14.), 2);
  float rg = uv.y * 110. + 1.6 * wob + .5 * sin(uv.x * 2. * PI + 1.3), ring = fract(rg); // nearly straight, rift-sawn grain
  float late = ss(.5, .85, ring) * (1. - ss(.92, 1., ring)) * (.6 + .4 * gn(vec2(uv.x * 30., rg), vec2(30., 4096.), 4));
  float pore = step(.8, vn(uv * vec2(1800., 1400.), vec2(1800., 1400.), 3)) * (.4 + late), streak = vn(uv * vec2(3., 60.), vec2(3., 60.), 6);
  c = mix(vec3(.55, .36, .2), vec3(.3, .17, .08), late) * (.8 + .3 * streak) * (.88 + .18 * fbm(uv * vec2(3., 20.), vec2(3., 20.), 4, 5)) * (1. - .35 * pore);
  h = .04 * late - .05 * pore; r = .3 + .12 * pore + .04 * late; t = 1.;`);
set('weatheredWood', 1, 1024, 1024, .85, .4, `
  float wob = gn(uv * vec2(2., 5.), vec2(2., 5.), 1) + .5 * gn(uv * vec2(6., 14.), vec2(6., 14.), 2);
  float rg = uv.y * 80. + 1.8 * wob + .6 * sin(uv.x * 2. * PI + .7), ring = fract(rg), late = ss(.5, .85, ring) * (1. - ss(.92, 1., ring));
  vec4 k = vor(uv * vec2(4., 60.), vec2(4., 60.), 7, 1.); float check = (1. - ss(.0, .03, k.y - k.x)) * ss(.55, .7, fbm(uv * vec2(2., 20.), vec2(2., 20.), 3, 9));
  float lich = ss(.62, .75, fbm(uv * 5., vec2(5), 4, 15)), streak = vn(uv * vec2(3., 50.), vec2(3., 50.), 6);
  c = vec3(.46, .44, .41) * (.7 + .3 * (1. - late)) * (.8 + .3 * streak) * (.85 + .2 * fbm(uv * vec2(3., 25.), vec2(3., 25.), 4, 13)) * (1. - .6 * check);
  c = mix(c, c * vec3(.75, .72, .6), lich * .5);
  h = .5 * late - 1.5 * check + .12 * fbm(uv * vec2(20., 400.), vec2(20., 400.), 3, 11) + .2 * streak; r = .85; t = 1.;`);
set('palmTrunk', 1, 512, 1024, .9, .35, `
  float rv = uv.y * 14. + .3 * gn(vec2(uv.x * 3., uv.y * 7.), vec2(3., 7.), 9), ri = floor(rv), rf = fract(rv + .1 * gn(vec2(uv.x * 6., ri), vec2(6., 4096.), 1)); // leaf scars, uneven rings
  float scar = (1. - ss(.0, .06, abs(rf - .5))) * (.6 + .4 * gn(vec2(uv.x * 20., ri), vec2(20., 4096.), 11)), lip = (1. - ss(.0, .05, abs(rf - .56)));
  float fis = 1. - ss(.0, .07, abs(gn(uv * vec2(60., 8.), vec2(60., 8.), 3) - .5)); // fine vertical fissures
  float fib = vn(uv * vec2(400., 40.), vec2(400., 40.), 3), boot = ss(.62, .7, fbm(uv * vec2(3., 4.), vec2(3., 4.), 4, 5)) * ss(.2, .45, rf) * (1. - ss(.55, .9, rf));
  float weave = abs(sin(PI * (uv.x + uv.y) * 240.)) * abs(sin(PI * (uv.x - uv.y) * 240.)); // burlap-like remains of the leaf bases
  h = -1.5 * scar + .8 * lip - .5 * fis + .4 * fib + boot * (2.5 + 1.2 * weave) + 1.2 * fbm(uv * vec2(8., 30.), vec2(8., 30.), 3, 13);
  c = vec3(.27, .25, .22) * (.8 + .25 * fib) * (1. - .45 * scar) * (1. - .25 * fis) * (.8 + .4 * st(fbm(uv * 6., vec2(6), 3, 15), 2.));
  c = mix(c, vec3(.2, .14, .08) * (.7 + .5 * weave), boot); r = .9; t = 1.;`);
set('palmLeaf', .5, 512, 512, .35, .2, `
  float vein = pow(abs(sin(uv.y * 125. * PI)), 3.), mid = 1. - ss(.0, .06, abs(fract(uv.y * 12.5) - .5));
  h = .15 * (1. - vein) + .5 * mid + .05 * fbm(uv * 200., vec2(200), 2, 1);
  c = vec3(.07, .16, .04) * (.9 + .15 * fbm(uv * vec2(4., 40.), vec2(4., 40.), 3, 3)) * (1. + .25 * mid); r = .32 + .1 * vein; t = 1.;`);

// materials: name, texture set, shader options (see mat.js)
mat('hardwood', 'hardwood', { detail: .08, macro: .05, dirt: .3, wear: .3, edgeCol: [.62, .45, .3] });
mat('benchWood', 'benchWood', { detail: .08, dirt: .3, wear: .5, edgeCol: [.72, .56, .4] });
mat('weatheredWood', 'weatheredWood', { detail: .2, macro: .1 });
mat('palmTrunk', 'palmTrunk', { detail: .2, macro: .15 });
mat('palmLeaf', 'palmLeaf', { detail: .04, back: 1.6, side: THREE.DoubleSide });
