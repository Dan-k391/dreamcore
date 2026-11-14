// Metals: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

set('smudge', .5, 512, 512, .1, 0, `
  vec2 p = uv * 5., i = floor(p), f = fract(p); float pr = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y), cc = mod(i + o, vec2(5)); if (hf(cc, 1) < .45) continue;
    vec2 d = o + hf2(cc, 3) - f; float a = hf(cc, 5) * PI; d = mat2(cos(a), sin(a), -sin(a), cos(a)) * d * vec2(1., 1.4);
    float l = length(d) / .1; pr = max(pr, (1. - ss(.6, 1., l)) * (.65 + .35 * sin(l * 40.))); } // fingerprints
  vec4 s = vor(uv * 50., vec2(50), 7, 1.); float spot = (1. - ss(.0, .04, abs(s.x - .18))) * step(.6, s.z); // dried water spots
  c = vec3(.96) * (1. - .05 * spot); m = 1.; r = .04 + .12 * pr + .12 * spot + .04 * fbm(uv * 6., vec2(6), 4, 9); t = 1.;`);
set('brushed', .5, 512, 1024, .27, 0, `
  float br = .5 * vn(uv * vec2(6., 2400.), vec2(6., 2400.), 1) + .3 * vn(uv * vec2(25., 900.), vec2(25., 900.), 3) + .2 * vn(uv * vec2(2., 300.), vec2(2., 300.), 5);
  c = vec3(.72, .72, .73) * (.94 + .1 * br); m = 1.; r = .26 + .14 * (br - .5) + .06 * fbm(uv * 5., vec2(5), 3, 7); h = .02 * br; t = 1.;`);
set('galvanised', 1, 1024, 512, .4, 0, `
  vec4 v = vor(uv * 22., vec2(22), 1, 1.); vec3 nv = vorv(uv * 22., vec2(22), 1, 1.); // spangle: crystals 3-6 cm across, each a slightly different plane
  float a = nv.z * 6.28; vec2 rq = mat2(cos(a), sin(a), -sin(a), cos(a)) * -nv.xy;
  float den = vn(rq * vec2(70., 12.) + 50., vec2(4096), 3) * .6 + vn(rq * vec2(12., 70.) + 50., vec2(4096), 5) * .4; // feathery dendrites
  float edge = 1. - ss(.0, .025, v.y - v.x);
  vec2 tilt = (hf2(vec2(nv.z * 977., 3.), 9) - .5);
  c = vec3(.74, .75, .76) * (.95 + .05 * v.z + .05 * den) * (1. - .05 * edge); m = 1.; r = .3 + .12 * v.w + .1 * den;
  h = dot(-nv.xy, tilt) * 1.2 + .02 * edge + .015 * den; t = 1.;`);
set('anodised', .5, 512, 512, .4, 0, `
  float g = fbm(uv * 600., vec2(600), 2, 1);
  c = vec3(.8) * (.97 + .05 * g); m = 1.; r = .36 + .08 * g + .04 * fbm(uv * 6., vec2(6), 3, 3); h = .006 * g; t = 1.;`);
set('castIron', .5, 512, 512, .52, .3, `
  float s = fbm(uv * 120., vec2(120), 4, 1); vec4 v = vor(uv * 200., vec2(200), 3, 1.); float pit = (1. - ss(.08, .2, v.x)) * step(.85, v.z);
  h = .35 * s - .4 * pit; c = vec3(.045, .045, .05) * (.85 + .5 * s) * (1. - .4 * pit); r = .5 + .12 * (s - .5) + .15 * pit; t = 1.;`);
set('paintedSteel', 1, 1024, 1024, .32, .3, `
  float peel = gn(uv * 320., vec2(320), 1) * .7 + gn(uv * 700., vec2(700), 3) * .3; // orange peel
  vec4 v = vor(uv * 9. + .35 * vec2(fbm(uv * 30., vec2(30), 4, 13), fbm(uv * 30., vec2(30), 4, 15)), vec2(9), 5, 1.);
  float rad = .04 + .09 * v.w, chip = step(.93, v.z) * (1. - ss(rad - .012, rad, v.x)), core = step(.93, v.z) * (1. - ss(rad * .6 - .012, rad * .6, v.x));
  float scr = fibres(uv * 25., vec2(25), 9, .9, .006) * step(.88, hf(floor(uv * 25.), 11));
  c = vec3(.8) * (.98 + .03 * peel) * (.97 + .05 * fbm(uv * 4., vec2(4), 3, 17)); r = .3 + .04 * peel; h = .015 * peel; t = 1.;
  float prim = max(chip - core, scr * .7); // chipped through to red-oxide primer, then to the steel
  c = mix(c, vec3(.42, .2, .14), prim); r = mix(r, .7, prim); t *= 1. - prim; h -= .06 * prim;
  c = mix(c, vec3(.56, .56, .57), core); r = mix(r, .38, core); m = core; t *= 1. - core; h -= .1 * core;`);

// materials: name, texture set, shader options (see mat.js)
mat('chrome', 'smudge', { dirt: .2, dirtCol: [.7, .68, .64] });
mat('brushedSteel', 'brushed', { dirt: .2 });
mat('galvanised', 'galvanised', { detail: .1, dirt: .5, dirtCol: [.72, .7, .64] });
mat('anodised', 'anodised', { color: 0x9aa4b0, dirt: .2 });
mat('brass', 'smudge', { color: 0xf0d48c, macro: .3, dirt: .6, dirtCol: [.5, .42, .3] });
mat('castIron', 'castIron', { detail: .2, macro: .1, dirt: .5, dirtCol: [.9, .55, .35], wear: .4, edgeCol: [.22, .22, .23] });
mat('paintedSteel', 'paintedSteel', { color: 0x2b5d8a, detail: .1, macro: .05, dirt: .6, dirtCol: [.62, .4, .26], wear: .6, edgeCol: [.5, .5, .52] });
