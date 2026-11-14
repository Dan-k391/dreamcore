// Plaster, render, concrete and road: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

set('plaster', 2, 1024, 1024, .86, .4, `
  vec4 v = vor(uv * 330., vec2(330), 3, 1.);
  float stip = pow(1. - sat(v.x), 2.) * (.6 + .4 * v.z);
  float wave = gn(uv * vec2(3., 5.) + .4 * vec2(gn(uv * 2., vec2(2), 5), 0.), vec2(3., 5.), 7);
  float crack = crackNet(uv, 4., 11, .006, .3);
  float trowel = multi(uv, 23); // hand-laid: uneven over a few cm to a metre, what lets a plain wall read in raking light
  float sand = fbm(uv * 200., vec2(200), 3, 29); // the float's sand grain, a centimetre and finer
  h = .12 * stip + .3 * wave + .03 * fbm(uv * 900., vec2(900), 2, 9) - .06 * crack + .8 * trowel + 1.6 * (sand - .5);
  c = vec3(.875) * (.975 + .04 * fbm(uv * 10., vec2(10), 4, 19)) * (1. + .05 * trowel) * (1. + .12 * (st(sand, 4.) - .5)) * (1. - .25 * crack);
  r = .86 + .06 * (stip - .5); t = 1.;`);
set('stucco', 1.5, 512, 1024, .93, .25, `
  vec4 v = vor(uv * 500., vec2(500), 3, 1.), w = vor(uv * 180., vec2(180), 5, 1.);
  float grains = pow(sat(1. - v.x * 1.2), 1.5) * (.5 + .5 * v.z), pebbles = pow(sat(1. - w.x * 1.4), 2.) * step(.6, w.z);
  float swirl = gn(uv * 12. + .5 * vec2(gn(uv * 6., vec2(6), 7), gn(uv * 6., vec2(6), 9)), vec2(12), 11);
  h = .35 * grains + .6 * pebbles + .5 * swirl;
  c = vec3(.82, .80, .76) * (.9 + .1 * grains + .06 * fbm(uv * 5., vec2(5), 4, 13)); r = .93; t = 1.;`);
set('concreteWall', 2.4, 1024, 1024, .82, .3, `
  vec2 q = uv * 2.4; float px = mod(q.x, 1.2), pid = floor(q.x / 1.2);
  float fin = 1. - ss(1., 2.5, min(min(px, 1.2 - px), min(q.y, 2.4 - q.y)) * 1000.); // panel joints: a thin raised fin
  vec2 tg = mod(q - .3, .6) - .3; float td = length(tg) * 1000.;
  float hole = 1. - ss(10., 12.5, td), ring = (1. - ss(12., 30., td)) * (1. - hole); // form-tie holes on a 60 cm grid
  vec4 b = vor(uv * 240., vec2(240), 7, 1.); float bug = (1. - ss(.04 + .12 * b.w, .1 + .14 * b.w, b.x)) * step(.965, b.z); // sparse bug holes
  float lift = ss(.94, .995, sin((uv.y * 6. + .03 * gn(uv * vec2(4., 1.), vec2(4., 1.), 9)) * 2. * PI)); // pour lines
  float streak = exp(-pow(tg.x * 1000. / 7., 2.)) * ss(-.3, -.01, -abs(tg.y)) * step(tg.y, 0.) * (.5 + .5 * gn(uv * vec2(60., 8.), vec2(60., 8.), 11));
  streak += .6 * ss(.6, .8, vn(uv * vec2(40., 3.), vec2(40., 3.), 12)) * ss(.5, .7, fbm(uv * 3., vec2(3), 3, 14));
  float grain = vn(uv * vec2(300., 6.), vec2(300., 6.), 13), m1 = fbm(uv * 6., vec2(6), 5, 15), m2 = fbm(uv * 30., vec2(30), 4, 16);
  h = .4 * fin - 9. * hole + .08 * (grain - .5) - 1.5 * bug + .08 * fbm(uv * 600., vec2(600), 2, 17) + .3 * lift + .15 * m2;
  c = vec3(.36, .35, .33) * (.72 + .45 * m1) * (.9 + .2 * m2) * (.94 + .12 * hf(vec2(pid, 0.), 19)) * (1. - .05 * (grain - .5));
  c *= (1. - .12 * fin) * (1. - .45 * hole) * (1. - .08 * ring) * (1. - .2 * sat(streak)) * (1. - .06 * lift) * (1. - .4 * bug);
  r = .8 + .1 * m1 - .1 * sat(streak); t = 1.;`);
set('concreteFloor', 4, 1024, 1024, .5, .3, `
  float m1 = st(fbm(uv * 6., vec2(6), 6, 1), 3.), m2 = st(fbm(uv * 28., vec2(28), 5, 2), 2.5), m3 = st(fbm(uv * 2., vec2(2), 4, 4), 2.5);
  float burn = ss(.52, .66, fbm(uv * 5. + 1.7, vec2(5), 5, 3)); // trowel-burnished patches: darker, glossier
  float sweep = gn(uv * vec2(40., 4.) + 2. * vec2(0., gn(uv * 3., vec2(3), 5)), vec2(40., 4.), 7); // trowel streaks
  vec4 sp = vor(uv * 1200., vec2(1200), 5, 1.); float speck = step(.75, sp.z) * (1. - ss(.15, .4, sp.x)); // sand grains showing through
  vec2 q = uv * 4.; float cut = 1. - ss(1.8, 2.6, min(min(q.x, 4. - q.x), min(q.y, 4. - q.y)) * 1000.); // saw-cut joints every 4 m
  float crack = crackNet(uv, 3., 9, .004, .35);
  vec4 o = vor(uv * vec2(6., 3.), vec2(6., 3.), 17, .8); float oil = (1. - ss(.12, .3, o.x + .25 * fbm(uv * 24., vec2(24), 4, 19))) * step(.8, o.z); // oil stains, soaked in unevenly
  float tc = .35 + .04 * sin(uv.x * 2. * PI), tyre = (1. - ss(.02, .035, abs(uv.y - tc))) + (1. - ss(.02, .035, abs(uv.y - tc - .4)));
  tyre *= .4 + .6 * vn(uv * vec2(80., 2.), vec2(80., 2.), 21);
  h = .05 * sweep + .03 * fbm(uv * 800., vec2(800), 2, 25) - 25. * cut - .15 * crack + .02 * speck;
  c = vec3(.32, .31, .295) * (.72 + .4 * m1) * (.88 + .22 * m2) * (.88 + .22 * m3) * (1. - .12 * burn) * (1. - .04 * sweep) * (1. + .35 * speck * (sp.w - .45));
  c *= (1. - .6 * cut) * (1. - .35 * crack) * (1. - .07 * tyre); c = mix(c, c * vec3(.6, .58, .55), oil * .7);
  r = .55 + .2 * (m2 - .5) - .24 * burn - .22 * oil - .06 * tyre + .05 * sweep; t = 1.;`);
set('asphalt', 1, 1024, 1024, .72, .5, ` // 1 m at 1 mm a texel: the 3-6 mm stones keep their relief (vary breaks the repeat)
  vec4 a = vor(uv * 170., vec2(170), 1, 1.), b = vor(uv * 450., vec2(450), 3, 1.);
  float sA = ss(.08, .18, a.y - a.x) * step(.5, a.z), sB = ss(.06, .14, b.y - b.x) * step(.55, b.z) * (1. - sA);
  vec3 st = a.w > .95 ? vec3(.42, .4, .38) : mix(vec3(.08, .08, .085), vec3(.24, .235, .23), a.w / .95);
  float bind = fbm(uv * 75., vec2(75), 3, 5), mo = fbm(uv * 4., vec2(4), 4, 6);
  c = vec3(.035, .035, .038) * (.8 + .4 * bind); c = mix(c, mix(vec3(.06), vec3(.2), b.w), sB); c = mix(c, st, sA); c *= .85 + .3 * mo;
  h = -.4 + .2 * bind + sB * (.3 + .4 * sqrt(sat(1. - b.x * 1.4))) + sA * (.4 + .9 * sqrt(sat(1. - a.x * 1.4)));
  r = mix(.6 - .12 * bind, .85, max(sA, sB));
  float crack = crackNet(uv, 1., 11, .008, .45); h -= 3. * crack; c *= 1. - .7 * crack;
  vec2 pp = uv - vec2(.62, .18); float pat = step(0., pp.x) * step(pp.x, .3) * step(0., pp.y) * step(pp.y, .22); // a patch
  c = mix(c, c * .7, pat); r = mix(r, r * .85, pat); float pe = pat * (1. - ss(.0, .004, min(min(pp.x, .3 - pp.x), min(pp.y, .22 - pp.y)))); c *= 1. - .5 * pe; h -= .5 * pe;
  float rav = multi(uv, 25); h += 1.2 * rav; r *= 1. + .35 * rav; c *= 1. + .25 * rav; // ravelled and rolled unevenly: catches the lamps in glints from across the car park
  float wet = ss(.55, .7, fbm(uv * 2. + 5., vec2(2), 4, 15)); r *= 1. - .4 * wet; c *= 1. - .15 * wet; // worn, wet-looking areas
  t = 0.;`);
set('roadPaint', 1, 512, 512, .55, .4, `
  vec4 a = vor(uv * 130., vec2(130), 1, 1.);
  float stone = ss(.06, .14, a.y - a.x) * sqrt(sat(1. - a.x * 1.4));
  float wear = ss(.62, .72, fbm(uv * 6., vec2(6), 5, 3) + .22 * stone); // worn off the stone tops first
  vec4 k = vor(uv * 25. + .2 * vec2(gn(uv * 50., vec2(50), 7), 0.), vec2(25), 5, 1.); float crack = 1. - ss(0., .03, k.y - k.x);
  float paint = (1. - wear) * (1. - crack * .8);
  h = .9 * stone + .6 * paint + .05 * fbm(uv * 300., vec2(300), 2, 7);
  c = mix(vec3(.05, .05, .055) + .25 * stone, vec3(.84, .83, .8) * (.92 + .08 * fbm(uv * 20., vec2(20), 3, 9)), paint);
  r = mix(.6, .5, paint); t = paint;`);

// materials: name, texture set, shader options (see mat.js)
mat('plaster', 'plaster', { detail: .5, macro: .12, dirt: .5, dirtCol: [.64, .6, .54], wear: .4, edgeCol: [.95, .94, .9] });
mat('stucco', 'stucco', { detail: .6, macro: .12, dirt: .6, dirtCol: [.6, .57, .5], vary: 1 });
mat('concreteWall', 'concreteWall', { detail: .5, macro: .15, dirt: .6, dirtCol: [.6, .58, .54], wear: .4, edgeCol: [.7, .69, .66] });
mat('concreteFloor', 'concreteFloor', { detail: .35, macro: .35, dirt: .3, dirtCol: [.6, .58, .54] });
mat('asphalt', 'asphalt', { detail: .3, macro: .15, vary: 1 });
mat('roadPaint', 'roadPaint', { detail: .2, macro: .1 });
