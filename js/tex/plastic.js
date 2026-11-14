// Plastics, rubber and glass: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

// Gelcoat over glass fibre (slides, pool fittings): a deep gloss with the spray's orange peel, the lay-up's long waviness and
// the chopped-strand mat printing through, chalky sun-faded patches, fine scuffs where people slide, and the odd star crack.
set('gelcoat', 1, 512, 512, .07, 0, `
  float big = fbm(uv * 6., vec2(6), 3, 2); // waviness of the mould and the lay-up, about 15 cm
  float peel = gn(uv * 110., vec2(110), 4) * .6 + gn(uv * 190., vec2(190), 6) * .4; // orange peel of the sprayed coat, 5-9 mm
  float fb = fibres(uv * 28., vec2(28), 1, .9, .05) * .6 + fibres(uv * 44. + .37, vec2(44), 3, .85, .07) * .4; // strand mat, 2-3 cm strands
  float slide = ss(.45, .75, fbm(uv * 3., vec2(3), 4, 8)), scr = .6 * scratches(uv, 5., .2, .35, 11) * slide; // fine scuffs where bodies slide
  float chalk = ss(.52, .78, fbm(uv * 2., vec2(2), 5, 21) + .12 * (fbm(uv * 16., vec2(16), 3, 22) - .5)); // sun-faded, oxidised to a chalky bloom
  float crk = cracks(uv, 4., .25, .1, 31), mv = multi(uv, 41);
  c = vec3(.86) * (1. + .05 * mv); c = mix(c, vec3(.93), .14 * chalk + .06 * scr); c *= 1. - .35 * crk;
  t = 1. - .2 * chalk - .08 * scr;
  h = .05 * (big - .5) * 2. + .012 * (peel - .5) * 2. + .008 * fb - .015 * scr - .02 * crk - .006 * chalk;
  r = .03 + .012 * peel + .006 * mv + .16 * chalk * (.7 + .3 * fb) + .12 * scr + .03 * crk;`);
// Hard moulded plastic (play equipment): rotomoulded polyethylene, semi-gloss, gentle sink marks and pinholes, paler and chalkier
// where the sun has had it, polished by hands where it is gripped, and whitened along scratches where the plastic was stressed.
set('hardPlastic', 1, 512, 512, .36, 0, `
  float mv = multi(uv, 3), sink = fbm(uv * 10., vec2(10), 3, 17), peel = gn(uv * 120., vec2(120), 6);
  float fade = ss(.48, .8, fbm(uv * 2., vec2(2), 5, 4)), grip = ss(.52, .75, fbm(uv * 4., vec2(4), 4, 9)) * (1. - fade);
  float scr = .6 * scratches(uv, 4., .2, .25, 13), pin = pits(uv, 40., 1.2, .3, 19);
  c = vec3(.82) * (1. + .06 * mv); c = mix(c, vec3(.92), .12 * fade + .1 * scr);
  t = 1. - .22 * fade - .15 * scr - .2 * pin;
  h = .03 * (sink - .5) * 2. + .006 * (peel - .5) * 2. - .015 * scr - .06 * pin;
  r = .36 + .03 * mv + .14 * fade - .2 * grip + .12 * scr + .1 * pin;`);
// PVC sheet (inflatables), panels 0.5 m wide welded at their edges: each panel pillows out between its welds, puckers into
// creases beside them, and has a slightly glossier, embossed weld band with a raised lip either side.
set('pvc', .5, 512, 512, .16, 0, `
  float du = min(uv.x, 1. - uv.x) * 500., weld = 1. - ss(3.5, 4.5, du), lip = 1. - ss(0., 1.2, abs(du - 5.));
  float pk = exp(-du / 35.) * ridged(uv * vec2(4., 40.), vec2(4., 40.), 3, 5); // puckered creases running off the weld
  float slack = ridged(uv * vec2(3., 2.), vec2(3., 2.), 4, 7), mv = multi(uv, 9), emb = gn(uv * 150., vec2(150), 11);
  float handled = ss(.5, .8, fbm(uv * 4., vec2(4), 4, 13));
  h = 2. * sin(PI * uv.x) + .35 * pk + .25 * slack + .2 * lip + weld * (.03 * sin(uv.y * 166. * 2. * PI) - .15) + .004 * emb;
  c = vec3(.86) * (1. + .05 * mv) * (1. - .08 * weld); t = 1.;
  r = .13 + .03 * mv - .03 * weld + .1 * handled + .02 * emb;`);
// Moulded black rubber: a fine moulded stipple and the odd air bubble, waxy grey bloom risen into the recesses and over
// patches, and lighter, glossier smears where it has been scuffed. Dark, so it is read by its highlights.
set('rubber', .5, 512, 512, .55, 0, `
  vec4 v = vor(uv * 160., vec2(160), 3, .9); float stip = 1. - ss(.0, .55, v.x); // moulded stipple, 3 mm
  float mv = multi(uv, 5), bub = pits(uv, 20., 1.6, .4, 7), scr = .7 * scratches(uv, 4., .3, .45, 9) * ss(.4, .7, fbm(uv * 3., vec2(3), 3, 15));
  float bloom = ss(.5, .85, fbm(uv * 5., vec2(5), 4, 21)) * (.2 + .8 * (1. - stip)) + .8 * bub; // wax blooms out and gathers low
  c = vec3(.056, .053, .049) * (1. + .15 * mv); c = mix(c, vec3(.15, .145, .135), sat(.4 * bloom)); c = mix(c, vec3(.09), .4 * scr);
  h = .07 * stip + .1 * (fbm(uv * 20., vec2(20), 3, 3) - .5) - .25 * bub - .01 * scr;
  r = .46 + .08 * mv + .1 * stip + .3 * sat(bloom) - .2 * scr; t = 1.;`);
// Float glass: nearly invisible itself, read by its reflections: the faint roller wave of the float line, wiped arcs and
// fingerprints that catch the light, and specks of dust (untinted, so they stay pale on any glass).
set('glass', 1, 512, 512, .06, 0, `
  vec3 nv = vorv(uv * 3., vec2(3), 1, 1.); float d = length(nv.xy);
  float wipe = (.5 + .5 * sin(d * 120.)) * (1. - ss(.25, .5, d)) * step(.5, nv.z) * fbm(uv * 30., vec2(30), 3, 5); // wiped arcs
  vec4 fp = vor(uv * 25., vec2(25), 8, 1.); float print = step(.82, fp.z) * (1. - ss(.12, .3, fp.x)) * (.6 + .4 * gn(uv * 200., vec2(200), 9)); // fingerprints, 1-2 cm
  float dust = pits(uv, 60., 1., .08, 7);
  c = mix(vec3(.95), vec3(.3, .29, .27), step(.01, dust)); t = 1. - step(.01, dust);
  h = .1 * (fbm(uv * 4., vec2(4), 3, 2) - .5) + .002 * print;
  r = .03 + .14 * wipe + .2 * print + .5 * dust;`);

// materials: name, texture set, shader options (see mat.js)
mat('gelcoat', 'gelcoat', { color: 0x3aa6c8, detail: .05, macro: .12, wear: .25, edgeCol: [.75, .82, .84] });
mat('hardPlastic', 'hardPlastic', { color: 0xe8b820, detail: .3, macro: .1, wear: .3, edgeCol: [.85, .85, .82] });
mat('pvc', 'pvc', { color: 0xff8fb0, detail: .06, macro: .08 });
mat('rubber', 'rubber', { detail: .3, sheen: .15, dirt: .3, macro: .1, wear: .4, edgeCol: [.1, .095, .09] });
// glass: the dark tint is the little light it scatters; it is drawn premultiplied (one, one minus alpha: CustomBlending with
// OneFactor and OneMinusSrcAlphaFactor) so its reflections keep their full strength while what is behind shows through
mat('glass', 'glass', { color: 0x2e3d36, transparent: true, opacity: .12, depthWrite: false, blending: 5, blendSrc: 201, blendDst: 205 });
mat('frostedGlass', 'glass', { color: 0xf2f2ec, roughness: .55, detail: .35, transparent: true, opacity: .78 });
