// Loose ground and turf: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

set('sand', 2, 512, 1024, .93, .2, `
  vec2 w = vec2(fbm(uv * 3., vec2(3), 4, 1), fbm(uv * 3., vec2(3), 4, 3));
  float rip = pow(.5 + .5 * sin((uv.y * 20. + 1.6 * w.x + .4 * sin(uv.x * 2. * PI * 3.)) * 2. * PI), 1.6);
  float lump = fbm(uv * 6., vec2(6), 5, 5), grain = vn(uv * 1500., vec2(1500), 7);
  h = 3.5 * rip * ss(.3, .6, w.y + .2) + 10. * lump + .08 * grain;
  c = vec3(.5, .42, .28) * (.9 + .12 * fbm(uv * 15., vec2(15), 4, 9)) * (.92 + .08 * rip) * (.96 + .08 * grain);
  float spark = step(.996, hf(floor(uv * 1024.), 11)); r = .95 - .6 * spark; c += .2 * spark; t = 1.;`);
set('mulch', 1, 1024, 512, .92, .35, `
  h = -4.; c = vec3(.07, .055, .045) * (.7 + .6 * fbm(uv * 80., vec2(80), 3, 1)); r = .95; t = 0.;
  for (int L = 0; L < 3; L++) { float sc = 22. + 9. * float(L); vec2 p = uv * sc + float(L) * .37, i = floor(p), f = fract(p);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y), cc = mod(i + o, vec2(sc));
      float a = hf(cc, 3 + L) * PI; vec2 d = vec2(cos(a), sin(a)), pos = f - o - hf2(cc, 7 + L);
      float al = dot(pos, d), ac = dot(pos, vec2(-d.y, d.x)), len = .45 + .35 * hf(cc, 9 + L), wid = .16 + .12 * hf(cc, 13 + L);
      float ins = (1. - ss(len - .06, len, abs(al))) * (1. - ss(wid - .05, wid, abs(ac)));
      float hh = 2. + 5. * hf(cc, 17 + L) + float(L) * 1.5 + 1.2 * vn(vec2(al * 30., ac * 6.) + cc, vec2(4096), 19) - 3. * ac * ac;
      if (hh > h && ins > 0.) { h = mix(h, hh, ins); c = mix(c, vec3(.36, .24, .15) * (.55 + .6 * hf(cc, 23 + L)) * (.8 + .3 * vn(vec2(al * 40., ac * 4.) + cc * 3., vec2(4096), 29)), ins); } } }`);
set('rubberCrumb', 1, 1024, 512, .9, .45, `
  vec4 v = vor(uv * 300., vec2(300), 1, 1.); float g = ss(.04, .12, v.y - v.x), black = step(.75, v.z);
  h = g * (.4 + .6 * sqrt(sat(1. - v.x))) + .1 * vn(uv * 900., vec2(900), 3);
  c = mix(vec3(.03), mix(vec3(.62, .6, .58) * (.8 + .35 * v.w), vec3(.05), black), g); t = g * (1. - black); r = .9;`);
set('grassGround', 2, 1024, 1024, .92, .4, `
  float soil = fbm(uv * 30., vec2(30), 5, 1), patchy = st(fbm(uv * 6., vec2(6), 5, 31), 2.5), turf = fbm(uv * 120., vec2(120), 3, 2);
  float bare = ss(.2, .02, patchy + .15 * soil); // earth showing through where the turf is thin
  c = mix(vec3(.08, .27, .018) * (.65 + .7 * turf), vec3(.1, .075, .05) * (.7 + .6 * soil), bare); h = 2. * soil + 1.5 * turf * (1. - bare); r = .95; t = 1.;
  vec4 pb = vor(uv * 120., vec2(120), 3, 1.); float peb = (1. - ss(.2, .3, pb.x)) * step(.9, pb.z) * bare;
  c = mix(c, vec3(.28, .26, .22) * (.7 + .5 * pb.w), peb); h += 2. * peb * sqrt(sat(1. - pb.x * 3.));
  for (int L = 0; L < 2; L++) { float sc = float(60 + 23 * L), f = fibres(uv * sc, vec2(sc), 5 + L * 7, .95, .14) * (.35 + .65 * (1. - patchy)); // thatch: dead blades lying flat
    c = mix(c, vec3(.32, .26, .14) * (.6 + .5 * f), ss(.1, .5, f) * .4); h = max(h, f * (2. + float(L))); }
  for (int L = 0; L < 3; L++) { float sc = float(110 + 37 * L), gb = fibres(uv * sc, vec2(sc), 33 + L * 5, .95, .18) * (.5 + .5 * patchy); // living blades
    c = mix(c, vec3(.11, .34, .02) * (.7 + .6 * gb) * (.8 + .4 * hf(floor(uv * sc), 40 + L)), ss(.05, .35, gb)); h = max(h, gb * (4. + float(L))); }
  vec3 cl = vorv(uv * 50., vec2(50), 41, .7); float an = atan(cl.y, cl.x), rr = length(cl.xy);
  float clover = (1. - ss(.0, .03, rr - .2 * (.55 + .45 * abs(cos(1.5 * an))))) * step(.6, cl.z) * ss(.5, .62, fbm(uv * 5., vec2(5), 3, 43));
  c = mix(c, vec3(.04, .12, .025) * (1. + .3 * cl.z), clover); h = max(h, 6.5 * clover); r = mix(r, .6, clover);
  c *= 1. + .2 * ss(-.15, .15, sin(uv.x * 2. * PI)) - .1;
  float clump = multi(uv, 61), grain = vn(uv * vec2(50., 140.), vec2(50., 140.), 63) * vn(uv * vec2(110., 40.), vec2(110., 40.), 65) - .25; c *= (1. + .1 * clump) * pow(1. + 1.4 * grain, 2.); // contrast as the eye sees it (linear light): blades in sun against blades in shade h += 3. * clump + 2. * grain; // tussocks and hollows, 2 cm to a metre: what the hills read by from afar // mowing stripes a metre wide: the blades lie toward or away from you`);

// materials: name, texture set, shader options (see mat.js)
mat('sand', 'sand', { detail: .2, macro: .2, vary: 1 });
mat('mulch', 'mulch', { detail: .2, macro: .2, vary: 1 });
mat('rubberCrumb', 'rubberCrumb', { color: 0xb04a3a, detail: .2, macro: .1, vary: 1 });
mat('grassGround', 'grassGround', { detail: .2, macro: .3 }); // no vary: blending two copies halves the grain's contrast
