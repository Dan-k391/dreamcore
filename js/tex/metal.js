// Metals: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

// Handling marks shared by the polished sets (prefixed mt: other families define their own helpers).
const MT = `
float mtWipe(vec2 uv, float k, int s) { // cloth wipes: arcs of parallel oily streaks around a hand's swing, k cells across the set
  vec2 p = uv * k, i = floor(p); float cm = SZ * 1000. / k, a = 0.;
  for (int y = -2; y <= 2 * uOne; y++) for (int x = -2; x <= 2 * uOne; x++) { vec2 o = vec2(x, y), id = mod(i + o, vec2(k)); vec4 h = hr(id, s);
    if (h.x > .6) continue;
    vec2 d = (p - i - o - h.yz) * cm; float dist = length(d), R = (.45 + .8 * h.w) * cm, bw = (.25 + .2 * hf(id, s + 5)) * cm;
    if (abs(dist - R) > bw) continue;
    float rel = mod(atan(d.y, d.x) - hf(id, s + 3) * 6.2832, 6.2832), span = .9 + 1.1 * hf(id, s + 4);
    float win = ss(0., .45, rel) * (1. - ss(span - .45, span, rel)), band = 1. - ss(.1 * bw, bw, abs(dist - R));
    float str = .6 * vn(vec2(rel * R / 35., dist / 1.8), vec2(4096), s + 6) + .4 * vn(vec2(rel * R / 90., dist / 4.5), vec2(4096), s + 8);
    a = max(a, win * band * st(str, 2.2) * (.45 + .55 * h.w)); }
  return a; }
float mtPrints(vec2 uv, float k, float dens, int s) { // fingertips in groups of up to four, each an oval smeared back the way the hand slid off
  vec2 p = uv * k, i = floor(p); float cm = SZ * 1000. / k, a = 0.;
  for (int y = -1; y <= uOne; y++) for (int x = -1; x <= uOne; x++) { vec2 o = vec2(x, y), id = mod(i + o, vec2(k)); vec4 h = hr(id, s);
    if (h.x > dens) continue;
    if (length((p - i - o - .5) * cm) > 75. + .8 * cm) continue; float an = h.w * 6.2832; vec2 ax = vec2(cos(an), sin(an)), px = vec2(-ax.y, ax.x), c0 = (i + o + .3 + .4 * h.yz) * cm, q0 = p * cm - c0;
    float drag = 4. + 14. * hf(id, s + 2);
    for (int f = 0; f < 4 * uOne; f++) { float ff = float(f) - 1.5; if (hf(id + vec2(f * 7), s + 3) < .25) continue;
      vec2 q = q0 - px * ff * 18. - ax * (5. - 2.2 * ff * ff); float al = dot(q, ax), ac = dot(q, px);
      float e = length(vec2(al / (al < 0. ? 6.5 + drag : 6.5), ac / 5.2));
      float mot = .55 + .45 * vn(q / 1.6, vec2(4096), s + 4); // pressed unevenly, ridges smeared into a mottle
      a = max(a, .75 * (1. - ss(.3, 1., e)) * mot * (al < 0. ? 1. - .6 * ss(0., drag, -al) : 1.)); } }
  return a; }`;

set('smudge', .5, 512, 512, .06, 0, `
  float w = mtWipe(uv, 4., 1), pr = mtPrints(uv, 5., .5, 11);
  float sc = st(vn(uv * vec2(3., 160.), vec2(3., 160.), 21), 3.) * .5; // faint polishing lines
  c = vec3(.68, .685, .69) * (1. - .04 * pr); m = 1. - .22 * max(.7 * w, pr); t = 1.; // the oil film hazes: a little light scatters off it
  r = .025 + .14 * w + .2 * pr + .05 * sc + .015 * fbm(uv * 6., vec2(6), 3, 9); h = -.004 * sc + .002 * pr;`, MT);
set('brass', .5, 256, 512, .2, 0, `
  float sw = st(vn(uv * vec2(4., 90.), vec2(4., 90.), 3), 2.5), pr = mtPrints(uv, 4., .55, 13); // polishing swirls; fingertips that oxidise darker
  float tn = st(fbm(uv * 6. + .3 * vec2(fbm(uv * 18., vec2(18), 3, 5), 0.), vec2(6), 5, 17), 1.7); // tarnish: where cloths and hands did not reach
  float tc = ss(.4, .9, tn), vg = ss(.82, .95, tn) * ss(.62, .78, gn(uv * 90., vec2(90), 19)); // verdigris only in the oldest patches, in the pores
  c = vec3(.95) * (1. - .2 * tc) * mix(vec3(1.), vec3(.96, .87, .74), tc) * (1. - .3 * pr * (.4 + .6 * tc)); m = 1. - .15 * pr; t = 1.;
  r = .1 + .2 * tc + .06 * sw * (1. - tc) + .12 * pr + .01 * fbm(uv * 40., vec2(40), 2, 21); h = .003 * sw - .03 * vg;
  c = mix(c, vec3(.2, .34, .26), vg * .8); r = mix(r, .75, vg); m = 1. - vg; t *= 1. - vg;`, MT);
set('brushed', .5, 256, 1024, .23, 0, `
  // grit lines along u at several widths: their cross-slopes spread the highlight across the grain, so it streaks instead of a round spot
  float g1 = vn(uv * vec2(5., 250.), vec2(5., 250.), 1), g2 = vn(uv * vec2(9., 120.), vec2(9., 120.), 3), g3 = vn(uv * vec2(1., 48.), vec2(1., 48.), 5);
  float g4 = vn(uv * vec2(16., 330.), vec2(16., 330.), 7), pass = vn(uv * vec2(2., 12.), vec2(2., 12.), 9); // passes of the belt
  float sc = scratches(uv, 4., .2, .35, 23); // a few later scuffs across the grain
  c = vec3(.7, .7, .71) * (.95 + .05 * g2 + .03 * pass); m = 1. ; t = 1.;
  r = .2 + .09 * (g1 - .5) + .07 * (g2 - .5) + .04 * (pass - .5) + .06 * sc; h = .12 * g1 + .05 * g2 + .02 * g3 + .07 * g4 - .01 * sc;`);
set('galvanised', .5, 512, 1024, .32, 0, `
  // hot-dip spangle: zinc crystals 5-20 mm, each grown out from a nucleus in six feathered arms, each a slightly different plane and gloss
  float K = 40., cm = SZ * 1000. / K; vec2 q = uv * K + .5 * (vec2(fbm(uv * 80., vec2(80), 3, 21), fbm(uv * 80., vec2(80), 3, 23)) - .5);
  vec4 v = vor(q, vec2(K), 1, 1.); vec3 nv = vorv(q, vec2(K), 1, 1.); vec2 d = -nv.xy * cm; // mm from the nucleus
  vec4 ch = hr(vec2(nv.z * 977., 3.), 9); float den = 0.;
  for (int k = 0; k < 3 * uOne; k++) { float a = ch.x * 1.0472 + float(k) * 1.0472; vec2 dr = vec2(cos(a), sin(a)); float al = dot(d, dr), pe = abs(dot(d, vec2(-dr.y, dr.x)));
    float fe = .5 + .5 * cos((abs(al) - .577 * pe) * 3.1416); // side branches at 60 degrees, 2 mm apart
    den = max(den, exp(-pe / .5) + .55 * fe * exp(-pe / 2.5)); }
  den = sat(den); float edge = 1. - ss(.0, .035, v.y - v.x), age = ss(.4, .75, fbm(uv * 3., vec2(3), 4, 25)); // dull weathered areas
  vec2 tilt = ch.yz - .5;
  c = vec3(.72, .73, .74) * (.92 + .1 * ch.w + .05 * den) * (1. - .08 * edge); m = 1.; t = 1.;
  r = mix(.12 + .3 * ch.w - .08 * den, .42, .55 * age) + .1 * edge; h = dot(d, tilt) * .045 + .012 * den - .05 * edge;
  vec2 wr = stain(uv, 3., .2, 31); float wh = wr.x * (.6 + .4 * fbm(uv * 60., vec2(60), 3, 33)); // white rust where water stood
  c = mix(c, vec3(.8, .8, .77), wh * .85); c *= 1. - .12 * wr.y; r = mix(r, .8, wh); m = 1. - .7 * wh; h += .02 * wh;`);
set('anodised', .5, 256, 512, .3, 0, `
  float ex = .6 * vn(uv * vec2(3., 220.), vec2(3., 220.), 1) + .4 * vn(uv * vec2(8., 90.), vec2(8., 90.), 3); // extrusion die lines along the length
  float bb = .6 * gn(uv * 230., vec2(230), 5) + .4 * gn(uv * 110., vec2(110), 7); // bead-blast stipple under the oxide
  float mo = 2. * fbm(uv * 3., vec2(3), 5, 9) - 1.; // the dye took a little unevenly
  c = vec3(.86) * (.96 + .05 * mo); m = .7; // the dyed oxide is a clear dielectric over the metal: some colour comes back diffusely
  t = 1.; r = .26 + .07 * (bb - .5) + .05 * (ex - .5) + .03 * mo; h = .012 * bb + .01 * ex;`);
set('castIron', .35, 256, 512, .45, .3, `
  // sand-cast iron under black enamel: mould grain, ramming lumps and gas pits, softened where the paint is thick; chips rusting at the edges
  float sand = fbm(uv * 160., vec2(160), 3, 1), lump = fbm(uv * 36., vec2(36), 3, 3), pt = pits(uv, 28., 2.2, .55, 5);
  float pa = ss(.35, .7, fbm(uv * 5., vec2(5), 4, 7)), mo = 2. * fbm(uv * 3., vec2(3), 6, 11) - 1.;
  h = .22 * (sand - .5) * (1. - .45 * pa) + .4 * (lump - .5) - .28 * pt * (1. - .4 * pa);
  c = vec3(.05, .048, .046) * (.9 + .2 * mo); m = 0.; t = 1.; r = .28 + .08 * mo + .1 * (1. - pa) + .15 * pt;
  vec4 v = vor(uv * 7. + .4 * vec2(gn(uv * 28., vec2(28), 13), gn(uv * 28., vec2(28), 15)), vec2(7), 17, 1.);
  float rad = .07 + .11 * v.w, on = step(.82, v.z), chp = on * (1. - ss(rad - .015, rad, v.x)), core = on * (1. - ss(rad * .5 - .015, rad * .5, v.x));
  float bloom = on * (1. - ss(rad, rad * 1.9, v.x)) * (1. - chp); // rust creeping under the paint round a chip
  c = mix(c, vec3(.075, .04, .022), bloom * .7); r = mix(r, .6, bloom * .6); h += .03 * bloom;
  c = mix(c, vec3(.2, .085, .035) * (.8 + .4 * sand), chp); r = mix(r, .85, chp); t *= 1. - chp; h -= .12 * chp;
  c = mix(c, vec3(.1, .095, .09), core * .8); m = core * .7; r = mix(r, .5, core * .8);`);
set('paintedSteel', 1, 1024, 1024, .32, .3, `
  float peel = gn(uv * 250., vec2(250), 1) * .65 + gn(uv * 160., vec2(160), 3) * .35; // orange peel, 4-6 mm
  float zone = ss(.5, .72, vn(uv * 3., vec2(3), 19)); // where it gets knocked: chips gather there
  c = vec3(.8) * (.98 + .03 * peel) * (.95 + .07 * (2. * fbm(uv * 2., vec2(2), 6, 17) - 1.)); r = .3 + .05 * peel; h = .02 * peel; t = 1.; m = 0.;
  float chp = 0., core = 0., run = 0., K = 14.; vec2 p = uv * K + .3 * vec2(gn(uv * 40., vec2(40), 13), gn(uv * 40., vec2(40), 15)), i = floor(p);
  for (int y = -2; y <= uOne; y++) for (int x = -1; x <= uOne; x++) { vec2 o = vec2(x, y), id = mod(i + o, vec2(K)); vec4 hh = hr(id, 5);
    if (hh.x > .04 + .26 * ss(.5, .72, vn((id + .5) / K * 3., vec2(3), 19))) continue; // more of them where it gets knocked
    vec2 dd = (p - i - o - .2 - .6 * hh.yz) * 1000. / K; float rd = 3. + 9. * hh.w * hh.w, l = length(dd);
    chp = max(chp, 1. - ss(rd - .8, rd, l)); core = max(core, (1. - ss(rd * .55 - .8, rd * .55, l)) * step(.35, hh.z));
    float dn = -dd.y - rd * .5, L = 15. + 50. * hf(id, 7); // rust runs down from it
    if (dn < 0. || dn > L || hh.z < .35) continue;
    run = max(run, step(0., dn) * (1. - ss(.4, 1., abs(dd.x) / (rd * .55 * (1. - .6 * sat(dn / L)) + .5))) * (1. - sat(dn / L)) * (.5 + .5 * vn(vec2(dd.x / 1.5, dn / 6.), vec2(4096), 9)) * step(.35, hh.z)); }
  float scr = scratches(uv, 3., .25, .01 + .06 * zone, 41); // through the top coat: lighter scuffs, not the primer
  c = mix(c, vec3(.3, .14, .07), run * .55); t *= 1. - run * .55; r = mix(r, .55, run * .5);
  c = mix(c, vec3(.36, .36, .35), scr * .7); t *= 1. - scr * .7; r = mix(r, .55, scr); h -= .02 * scr;
  float prim = chp - core;
  c = mix(c, vec3(.42, .2, .14), prim); r = mix(r, .7, prim); t *= 1. - prim; h -= .06 * prim;
  c = mix(c, vec3(.27, .12, .055), core); r = mix(r, .8, core); t *= 1. - core; h -= .1 * core;`);

// materials: name, texture set, shader options (see mat.js)
mat('chrome', 'smudge', { dirt: .2, dirtCol: [.7, .68, .64] });
mat('brushedSteel', 'brushed', { dirt: .2, macro: .05 });
mat('galvanised', 'galvanised', { detail: .1, dirt: .5, dirtCol: [.72, .7, .64], vary: 1 });
mat('anodised', 'anodised', { color: 0x7f9cc4, roughness: .36, dirt: .2, wear: .6, edgeCol: [.8, .8, .82] });
mat('brass', 'brass', { color: 0xf0d48c, macro: .1, dirt: .6, dirtCol: [.5, .42, .3] });
mat('castIron', 'castIron', { detail: .2, macro: .06, dirt: .5, dirtCol: [.9, .55, .35], wear: .4, edgeCol: [.2, .19, .18], vary: 1 });
mat('paintedSteel', 'paintedSteel', { color: 0x2b5d8a, detail: .1, macro: .04, dirt: .6, dirtCol: [.62, .4, .26], wear: .6, edgeCol: [.5, .5, .52] });
