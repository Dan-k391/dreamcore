// Plaster, render, concrete and road: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

// Angular stones for asphalt and road paint, one per cell of p (n cells across the set) on a fraction cover of the cells,
// pr their radius in cells: x the height profile 0..1 (rounded shoulder, a flat top worn by tyres), y a hash of the stone.
const STONES = `
vec2 minStones(vec2 p, vec2 n, int s, float cover, float pr) {
  p += .7 * vec2(gn(p * .25, n * .25, s + 21), gn(p * .25, n * .25, s + 22)) - .35; // no rows: the cells wander
  vec2 i = floor(p), f = fract(p), best = vec2(0);
  for (int y = -1; y <= uOne; y++) for (int x = -1; x <= uOne; x++) { vec2 o = vec2(x, y), c = wr(i + o, n); vec4 h = hr(c, s);
    if (h.x > cover) continue;
    vec2 q = f - o - (.2 + .6 * h.yz); float a = h.w * 6.283, d = 0.; vec4 g = hr(c, s + 3);
    for (int k = 0; k < 3; k++) { float b = a + float(k) * 1.047 + .5 * (g[k] - .5); d = max(d, abs(dot(q, vec2(cos(b), sin(b)))) * (1. + .3 * (g[(k + 1) % 3] - .5))); }
    float rr = pr * (.55 + .45 * g.w), v = sat((rr - d) / rr * 3.); // crushed stone: an irregular hexagon or a wedge
    if (v > best.x) best = vec2(v, hf(c, s + 11)); }
  return best; }
vec3 minStoneCol(float k) { return k < .18 ? vec3(.30, .25, .22) : k < .32 ? vec3(.07, .07, .075) : vec3(.13, .13, .125) + .12 * (k - .32); } // granite, basalt, grey limestone`;

set('plaster', 2, 1024, 1024, .86, .4, `
  vec4 v = vor(uv * 330., vec2(330), 3, 1.);
  float stip = pow(1. - sat(v.x), 2.) * (.6 + .4 * v.z); // the paint's orange peel
  float wave = gn(uv * vec2(3., 5.) + .4 * vec2(gn(uv * 2., vec2(2), 5), 0.), vec2(3., 5.), 7);
  float trowel = multi(uv, 23); // hand-laid: uneven over a few cm to a metre, what lets a plain wall read in raking light
  float sand = fbm(uv * 200., vec2(200), 3, 29); // the float's sand grain, a centimetre and finer
  // trowel passes about 30 cm across: an arc where the blade's edge lapped the last pass, burnished a little on its inside
  vec3 tp = vorv(uv * 7., vec2(7), 31, .9); float an = tp.z * 6.283; vec2 dr = vec2(cos(an), sin(an)), q = tp.xy * (2000. / 7.);
  float acr = dot(q, vec2(-dr.y, dr.x)), lap = dot(q, dr) + acr * acr / 260. - 40. * (tp.z - .5), fade = 1. - ss(90., 150., length(q));
  float ridge = exp(-pow(lap / 3., 2.)) * (1. - ss(60., 130., abs(acr))) * fade, burn = ss(-60., 0., lap) * (1. - ss(0., 20., lap)) * fade;
  vec2 pa = stain(uv, 3., .14, 41); // repairs: a patch filled and sanded smoother, its feathered edge left a hair proud
  float ck = cracks(uv, 5., .5, .28, 47); // hairline shrinkage cracks
  float sk = ss(.6, .8, vn(uv * vec2(60., 1.), vec2(60., 1.), 51)) * ss(.5, .7, fbm(uv * vec2(3., 2.), vec2(3., 2.), 3, 52)); // faint run-down streaks
  float drift = st(fbm(uv, vec2(1), 3, 53), 3.) - .5; // tone drift a metre or two across: two coats never mixed alike
  h = .12 * stip * (1. - .6 * pa.x) + .3 * wave + .03 * fbm(uv * 900., vec2(900), 2, 9) + .8 * trowel + 1.6 * (sand - .5) * (1. - .4 * pa.x)
    + .1 * ridge + .15 * pa.y - .15 * ck;
  c = vec3(.86) * (.97 + .05 * fbm(uv * 10., vec2(10), 4, 19)) * (1. + .08 * trowel) * (1. + .12 * (st(sand, 4.) - .5)) * (1. + .1 * drift);
  c *= (1. + .035 * pa.x) * (1. - .05 * pa.y) * (1. - .22 * ck) * (1. - .04 * sk) * (1. - .015 * ridge);
  r = (.86 + .06 * (stip - .5)) * (1. - .07 * burn - .06 * pa.x); t = 1.;`);
set('stucco', 1.5, 512, 1024, .9, .3, `
  vec2 w = uv + .003 * vec2(gn(uv * 40., vec2(40), 3), gn(uv * 40., vec2(40), 4)) - .0015; // the splats' ragged outlines
  vec4 v = vor(uv * 500., vec2(500), 3, 1.), a = vor(w * 75., vec2(75), 5, 1.), b = vor(w * 220., vec2(220), 6, 1.);
  float grains = pow(sat(1. - v.x * 1.2), 1.5) * (.5 + .5 * v.z);
  float hA = step(.5, a.z) * sat((.4 + .2 * a.w - a.x) * 5.), hB = step(.45, b.z) * sat((.38 + .2 * b.w - b.x) * 4.); // 1-3 cm splats and 4-7 mm spatter
  float sp = max(1.1 * hA, .55 * hB), top = ss(.85, 1., max(hA, hB)); // knocked down: flat tops where the trowel pressed them
  float swirl = gn(uv * 12. + .5 * vec2(gn(uv * 6., vec2(6), 7), gn(uv * 6., vec2(6), 9)), vec2(12), 11);
  float dust = fbm(uv * 8., vec2(8), 3, 13);
  h = .25 * grains * (1. - .6 * top) + sp + .5 * swirl;
  c = vec3(.82, .80, .76) * (.92 + .08 * grains + .06 * fbm(uv * 5., vec2(5), 4, 13)) * (1. + .04 * top) * (1. - .09 * (1. - max(hA, hB)) * ss(.4, .6, dust));
  r = .93 - .12 * top; t = 1.;`);
set('concreteWall', 2.4, 1024, 1024, .82, .3, `
  vec2 q = uv * 2.4; float px = mod(q.x, 1.2), pid = floor(q.x / 1.2), sd = min(px, 1.2 - px);
  float fin = 1. - ss(1., 2.5, min(sd, min(q.y, 2.4 - q.y)) * 1000.); // panel joints: a thin raised fin
  vec2 tg = mod(q - .3, .6) - .3; float td = length(tg) * 1000.;
  float hole = 1. - ss(10., 12.5, td), ring = (1. - ss(12., 30., td)) * (1. - hole); // form-tie holes on a 60 cm grid
  float lift = ss(.94, .995, sin((uv.y * 6. + .03 * gn(uv * vec2(4., 1.), vec2(4., 1.), 9)) * 2. * PI)); // pour lines
  float dl = abs(fract(uv.y * 6. - .25 + .5) - .5) * .4; // metres to the nearest pour line: air rose and was trapped under it
  float bug = sat(3. * pits(uv, 40., 10., .18, 61)) * ss(.35, .7, exp(-pow(dl / .12, 2.)) + .5 * fbm(uv * 8., vec2(8), 3, 62)); // bug holes 1-12 mm, clustered
  float leak = exp(-pow(sd * 1000. / 9., 2.)) * ss(.35, .65, fbm(uv * vec2(4., 24.), vec2(4., 24.), 3, 64)); // grout bled out at the panel seams
  vec2 la = stain(uv, 2., .3, 63), fo = stain(uv, 5., .15, 67); // laitance blotches; form-oil stains
  float streak = exp(-pow(tg.x * 1000. / 7., 2.)) * ss(-.3, -.01, -abs(tg.y)) * step(tg.y, 0.) * (.5 + .5 * gn(uv * vec2(60., 8.), vec2(60., 8.), 11));
  streak += .6 * ss(.6, .8, vn(uv * vec2(40., 3.), vec2(40., 3.), 12)) * ss(.5, .7, fbm(uv * 3., vec2(3), 3, 14));
  float grain = vn(uv * vec2(300., 6.), vec2(300., 6.), 13), m1 = fbm(uv * 6., vec2(6), 5, 15), m2 = fbm(uv * 30., vec2(30), 4, 16);
  h = .4 * fin - 9. * hole + .08 * (grain - .5) - 3. * bug + .08 * fbm(uv * 600., vec2(600), 2, 17) + .3 * lift + .15 * m2 + .1 * la.x;
  c = vec3(.36, .35, .33) * (.8 + .3 * m1) * (.9 + .2 * m2) * (.94 + .12 * hf(vec2(pid, 0.), 19)) * (1. - .05 * (grain - .5));
  c *= (1. - .12 * fin) * (1. - .45 * hole) * (1. - .08 * ring) * (1. - .2 * sat(streak)) * (1. - .06 * lift) * (1. - .6 * bug) * (1. - .15 * leak);
  c *= (1. + .08 * la.x - .04 * la.y) * (1. - .08 * fo.x - .05 * fo.y);
  r = .8 + .1 * m1 - .1 * sat(streak) + .05 * la.x - .08 * fo.x; t = 1.;`);
set('concreteFloor', 4, 1024, 1024, .5, .3, `
  float m1 = st(fbm(uv * 6., vec2(6), 6, 1), 2.), m2 = st(fbm(uv * 28., vec2(28), 5, 2), 2.5), m3 = st(fbm(uv * 2., vec2(2), 4, 4), 2.);
  float sweep = gn(uv * vec2(40., 4.) + 2. * vec2(0., gn(uv * 3., vec2(3), 5)), vec2(40., 4.), 7); // hand-float streaks
  // power-trowel passes: overlapping half-discs about 40 cm across, burnished in arcs a few cm apart
  vec3 pt = vorv(uv * 10., vec2(10), 31, .8); float rho = length(pt.xy) * 400.;
  float pass = (1. - ss(140., 200., rho)) * ss(-.2, .4, sin(atan(pt.y, pt.x) + pt.z * 6.283));
  float arcs = (.5 + .5 * sin(rho * .11 + pt.z * 40. + 2. * gn(uv * 30., vec2(30), 33))) * pass;
  vec4 sp = vor(uv * 600., vec2(600), 5, 1.); float speck = step(.8, sp.z) * (1. - ss(.15, .4, sp.x)); // sand grains showing through
  float po = pits(uv, 50., 10., .3, 73); // pop-outs: a stone near the top came loose, its socket rough and lighter
  vec2 q = uv * 4., e2 = min(q, 4. - q) * 1000.; float e = min(e2.x, e2.y);
  float cut = 1. - jointH(e, 5., 3.), cm = jointMask(e, 5.); // a 5 mm saw cut, dusty inside
  float ck = cracks(uv, 3., 1.2, .3, 9); // shrinkage cracks
  vec2 ol = stain(uv, 6., .1, 77); // oil, soaked in, its rim darker
  float tc = .35 + .04 * sin(uv.x * 2. * PI), tyre = (1. - ss(.02, .045, abs(uv.y - tc))) + (1. - ss(.02, .045, abs(uv.y - tc - .4)));
  tyre *= .4 + .6 * vn(uv * vec2(80., 2.), vec2(80., 2.), 21);
  h = .05 * sweep + .05 * fbm(uv * 400., vec2(400), 2, 25) - 5. * cut - .2 * ck + .02 * speck - 1.2 * po + .02 * arcs;
  c = vec3(.32, .31, .295) * (.88 + .18 * m1) * (.86 + .26 * m2) * (.94 + .1 * m3) * (1. - .04 * sweep) * (1. - .04 * arcs) * (1. + .3 * speck * (sp.w - .45));
  c = mix(c, c * vec3(1.25, 1.22, 1.15), po) * mix(.35, 1., cm) * (1. - .3 * ck) * (1. - .07 * tyre);
  c = mix(c, c * vec3(.55, .53, .5), ol.x * .7) * (1. - .12 * ol.y);
  r = .58 + .2 * (m2 - .5) - .2 * arcs - .25 * ol.x - .06 * tyre + .05 * sweep + .2 * po + .2 * (1. - cm); t = 1.;`);
set('asphalt', 1, 1024, 1024, .7, .5, ` // 1 m at 1 mm a texel (vary breaks the repeat)
  vec2 A = minStones(uv * 80., vec2(80), 3, .7, .5), B = minStones(uv * 160., vec2(160), 5, .6, .45); // 7-14 mm and 3-6 mm crushed stone
  B.x *= 1. - ss(0., .3, A.x);
  float sand = vn(uv * 500., vec2(500), 7), bind = fbm(uv * 60., vec2(60), 3, 9), mo = fbm(uv * 4., vec2(4), 4, 6);
  float sA = ss(0., .25, A.x), sB = ss(0., .25, B.x), topA = ss(.75, 1., A.x), topB = ss(.75, 1., B.x);
  vec3 cb = vec3(.042, .042, .045) * (.7 + .6 * sand) + vec3(.05) * ss(.75, .9, sand); // binder and its sand fill
  vec3 cA = minStoneCol(A.y) * mix(.6, 1.15, topA), cB = minStoneCol(B.y) * mix(.6, 1.05, topB); // the binder is worn off the tops only
  c = mix(mix(cb, cB, sB), cA, sA) * (.85 + .3 * mo);
  h = -.3 + .25 * sand + .2 * bind + max(1.6 * A.x, .9 * B.x);
  r = mix(mix(.8 - .1 * bind, .7 - .2 * topB, sB), .7 - .25 * topA, sA); // tops polished by tyres, the binder between them rough
  float crack = cracks(uv, 2., 3., .25, 11); h -= 3. * crack; c *= 1. - .6 * crack;
  float rav = multi(uv, 25); h += 1.2 * rav; r *= 1. + .35 * rav; c *= 1. + .3 * rav; // ravelled and rolled unevenly: catches the lamps in glints from across the car park
  float wet = ss(.55, .7, fbm(uv * 2. + 5., vec2(2), 4, 15)); r *= 1. - .5 * wet; c *= 1. - .3 * wet; // worn, wet-looking areas
  t = 0.;`, STONES);
set('roadPaint', 1, 512, 512, .6, .4, `
  vec2 A = minStones(uv * 80., vec2(80), 3, .7, .5);
  float stone = A.x, sand = vn(uv * 250., vec2(250), 7);
  float L = mix(1.3, .35, ss(.45, .68, fbm(uv * 4., vec2(4), 4, 3))); // where wheels ran the paint is worn down to the stone tops
  float paint = 1. - ss(L - .25, L + .1, stone + .25 * (sand - .5)); // so it is lost from the tops first and stays in the hollows
  h = mix(1.4 * stone - .3 + .2 * sand, max(1.4 * stone, .9) + .5, paint);
  vec3 ca = mix(vec3(.035, .035, .038) * (.8 + .4 * sand), minStoneCol(A.y) * mix(.7, 1.5, ss(.6, 1., A.x)), ss(0., .25, A.x)); // stone tops scrubbed pale
  vec4 bv = vor(uv * 160., vec2(160), 81, 1.); float bead = step(.8, bv.z) * (1. - ss(.08, .2, bv.x)) * paint; // glass beads in the paint: sparse glints
  c = mix(ca, vec3(.82, .81, .77) * (.93 + .07 * fbm(uv * 20., vec2(20), 3, 9)) * (1. - .08 * (1. - ss(.6, 1., stone)) * (1. - ss(1., 1.3, L))), paint) + .06 * bead;
  r = mix(mix(.8, .55, ss(.7, 1., stone)), .55, paint) - .3 * bead; t = paint;`, STONES);

// materials: name, texture set, shader options (see mat.js). macro and grime kept low: the variation belongs to the sets
mat('plaster', 'plaster', { detail: .5, macro: .12, grime: .1, dirt: .5, dirtCol: [.64, .6, .54], wear: .4, edgeCol: [.95, .94, .9] });
mat('stucco', 'stucco', { detail: .6, macro: .08, grime: .08, dirt: .6, dirtCol: [.6, .57, .5], vary: 1 });
mat('concreteWall', 'concreteWall', { detail: .5, macro: .06, grime: .12, dirt: .6, dirtCol: [.6, .58, .54], wear: .4, edgeCol: [.7, .69, .66] });
mat('concreteFloor', 'concreteFloor', { detail: .35, macro: .18, grime: .16, dirt: .3, dirtCol: [.6, .58, .54] });
mat('asphalt', 'asphalt', { detail: .3, macro: .06, vary: 1 });
mat('roadPaint', 'roadPaint', { detail: .2, macro: .04 });
