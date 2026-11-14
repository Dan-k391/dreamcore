// Wood and plants: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import * as THREE from 'three';
import { set, mat } from './registry.js';

// Growth rings, shared by the sawn sets. ph: the ring phase in years at this texel; w: the tree's mean ring width (mm);
// p: mm (along the grain, across it) for the pores, pp their noise period; id: which board or log (each year's growth differs).
// Each year: soft earlywood with a band of open pores just after the ring boundary (ring-porous, like oak or ash), then
// latewood darkening gradually and ending sharp at the next boundary. Returns (latewood 0..1, pores 0..1, u: mm from the
// nearest boundary, + into the new year, - before it; a hash of that year).
const WD = `
vec4 wd_rings(float ph, float w, vec2 p, vec2 pp, float id, int s) {
  float t = fract(ph), b = step(.5, t), u = (t - b) * w; vec4 hy = hr(vec2(floor(ph) + b, id), s);
  float lw = .6 + 1.8 * hy.x; // latewood band, mm: good years and poor ones
  float late = (1. - ss(-.7 * MMPX, .7 * MMPX, u)) * ss(-(lw + .8 + .3 * w), -.5 * lw, u) * (.65 + .35 * hy.y);
  float eb = ss(-.6, .2, u) * (1. - ss(.7, 1.8, u));
  float pore = ss(.62, .85, vn(p / vec2(6.25, 2.), pp, s + 4)) * (.15 + .85 * eb);
  return vec4(late, pore, u, hy.z);
}
// Fine scratches in a finish, in two crossing directions (rotated by whole steps, so they tile): k across the set, density 0..1.
float wd_scr(vec2 uv, float k, float dens, int s) { float a = vn(vec2((uv.x + 2. * uv.y) * k, (2. * uv.x - uv.y) * 90. * k), vec2(k, 90. * k), s),
  b = vn(vec2((3. * uv.x - uv.y) * k, (uv.x + 3. * uv.y) * 70. * k), vec2(k, 70. * k), s + 1); return ss(1. - .12 * dens, 1. - .06 * dens, max(a, b)); }`;

set('hardwood', 1.2, 1024, 1024, .26, .3, `
  // 15 cm boards, eight to the 1.2 m, end joints at random places: one or two boards to a row
  float row = floor(uv.y * 8.), fy = fract(uv.y * 8.); vec4 rr = hr(vec2(row, 0.), 1);
  float two = step(.45, rr.y), q = .3 + .4 * rr.z, xa = fract(uv.x - rr.x), seg = two * step(q, xa);
  float L = (two > .5 ? (seg > .5 ? 1. - q : q) : 1.) * 1200., al = (xa - seg * q) * 1200.;
  vec4 bh = hr(vec2(row, seg), 2); float side = bh.z > .5 ? 1. : -1., px = side > 0. ? al : L - al;
  float e = min(min(al, L - al), min(fy, 1. - fy) * 150.), across = (fy - .5) * 150.;
  // each board cut from its own log: the pith lies under the face (plain-sawn: cathedral arches where the board runs out of
  // line with the log) on a third of them, off to one side (rift: near-straight lines) on the rest
  float cath = step(.64, bh.w), y0 = mix(side * (110. + 260. * bh.y), (bh.y - .5) * 70., cath);
  float z = mix(70. + 150. * bh.w, 16. + 45. * fract(bh.w * 7.), cath) + px * mix(.006, .025 + .04 * bh.x, cath) + 9. * gn(vec2(px / 400., bh.x * 61.), vec2(4096.), 3);
  float d = length(vec2(across - y0, z)) + 1.6 * (gn(vec2(px / 90., across / 6.), vec2(4096.), 4) - .5);
  float w = 3. + 3.5 * bh.x, ph = d / w + 2.2 * gn(vec2(d / (w * 6.), bh.y * 50.), vec2(4096.), 5); // ring width 0.5-2x its mean
  vec2 p = vec2(px + 1300. * bh.y, across); vec4 g = wd_rings(ph, w, p, vec2(4096.), row * 3. + seg, 6);
  float fl = (1. - cath) * ss(.8, .93, vn(p / vec2(11., 2.4), vec2(4096.), 8)); // ray flecks on the rift boards
  vec3 col = mix(vec3(.47, .29, .15), vec3(.17, .085, .038), g.x) * (1. - .38 * g.y);
  col = mix(col, col * vec3(1.14, 1.1, 1.04), .7 * fl) * (.9 + .2 * gn(vec2(px / 350., across / 45.), vec2(4096.), 9)); // mineral streaks
  col = cellCol(col, bh, .13); // per board: lighter or darker, warmer or cooler
  // the lacquer: dulled in the lanes feet take, fine scratches across it
  float lane = st(fbm(uv * vec2(2., 3.), vec2(2., 3.), 3, 21), 1.8), scr = wd_scr(uv, 4., .8, 23);
  col = mix(col, col * 1.06 + .008, .5 * lane) * (1. + .12 * scr);
  float jm = jointMask(e, .5), jh = jointH(e, .5, 1.);
  c = mix(col * .28, col, jm);
  h = -.9 * (1. - jh) + .035 * g.x - .05 * g.y - .03 * scr + across / 150. * (bh.z - .5) * .5 + .12 * (fy - .5) * (fy - .5) * 4.;
  r = cellGloss(.18, bh, .3) + .16 * lane + .16 * scr + .08 * g.y - .04 * fl + .3 * (1. - jm); t = 1.;`, WD);

set('benchWood', 1, 1024, 1024, .4, .3, `
  // straight grain drifting a few degrees, with long gentle swells, and knots the rings swirl round
  float D = 22. * (gn(uv * vec2(1., 2.), vec2(1., 2.), 1) - .5) + 9. * (gn(uv * vec2(3., 5.), vec2(3., 5.), 2) - .5);
  Cell k = tiles(uv, vec2(2., 3.), .5, 3); vec2 kp = (k.f - (.3 + .4 * k.r.xy)) * k.mm;
  float kr = 3. + 6. * k.r.z, kd = length(kp * vec2(.6, 1.)), kon = step(.45, k.r.w), sw = kon * 7. * kr * exp(-kd * kd / (kr * kr * 10.));
  float Y = uv.y + (D + sw) / 1000., ph = Y * 200. + 2. * gn(vec2(Y * 40., .5), vec2(40., 4096.), 4); // rings 3-9 mm
  vec4 g = wd_rings(ph, 5., vec2(uv.x, Y) * 1000., vec2(160., 500.), 0., 5);
  float knot = kon * (1. - ss(kr - .8, kr + .8, kd)), krim = kon * (1. - ss(.0, 1.2, abs(kd - kr)));
  vec3 col = mix(vec3(.5, .31, .16), vec3(.2, .1, .045), g.x) * (1. - .35 * g.y);
  col *= .82 + .34 * gn(vec2(uv.x * 2., Y * 7.), vec2(2., 7.), 9); // heart and sap, a different tone a slat or two away
  col = mix(col, vec3(.17, .08, .035) * (.8 + .4 * fract(kd / 1.4)), knot); col *= 1. - .5 * krim;
  // the varnish: worn through to bare, greying wood where hands and weather have been, flaking at its edge, scratched
  float bf = fbm(uv * vec2(2., 4.), vec2(2., 4.), 4, 31), bare = ss(.46, .66, bf); vec2 sv = vec2(bare, (1. - ss(0., .01, abs(bf - .49))) * .3); float scr = wd_scr(uv, 4., .7, 33) * (1. - bare);
  vec3 grey = vec3(.3, .25, .19) * (.75 + .5 * (1. - g.x)) * (1. - .3 * g.y);
  col = mix(col, mix(grey, col * .75, .35 * g.x + .5 * g.y), bare * .7);
  c = col * (1. - .25 * sv.y) * (1. + .1 * scr);
  h = .1 * g.x * (.3 + bare) - .06 * g.y + .15 * knot - .35 * krim + .03 * sv.y - .02 * scr + .04 * (1. - bare);
  r = mix(.24 + .06 * g.y, .62 + .12 * g.y - .08 * g.x, bare) + .12 * sv.y + .14 * scr - .1 * knot * (1. - bare); t = 1.;`, WD);

set('weatheredWood', 1, 1024, 1024, .8, .4, `
  // grey, sun- and rain-worn boards: the soft earlywood eroded away, leaving the latewood as sharp ridges
  float D = 30. * (gn(uv * vec2(1., 2.), vec2(1., 2.), 1) - .5) + 10. * (gn(uv * vec2(3., 6.), vec2(3., 6.), 2) - .5);
  float Y = uv.y + D / 1000., ph = Y * 90. + 1.6 * gn(vec2(Y * 14., .5), vec2(14., 4096.), 3) + .6 * gn(vec2(Y * 40., .5), vec2(40., 4096.), 4); // rings 5-50 mm apart: fast and slow years
  float tf = fract(ph), x = abs(tf - .5) * 2., yr = floor(ph + .5); vec4 hy = hr(vec2(yr, 0.), 4);
  float u = (tf - step(.5, tf)) * 11., amp = .35 + 1.5 * hy.x * hy.x, ex = st(fbm(uv * vec2(2., 3.), vec2(2., 3.), 3, 5), 1.6); // how exposed: grey or still brown
  float ridge = x * x * amp; // sharp crest at the latewood, soft valley
  // long checks along the grain, on a ring boundary, opening and closing along their length
  float cm = gn(vec2(uv.x * 3., yr), vec2(3., 4096.), 7), cw = 2.2 * sat((cm - .56) * 5.) * step(hy.z, .06);
  float chk = aa(abs(u), cw * .5) * step(.05, cw);
  // nails at the rails, rust bled down the grain below each; lichen in a few places
  Cell n = tiles(uv, vec2(2.), 0., 9); vec2 np = (n.f - vec2(.25 + .5 * n.r.x, .62 + .2 * n.r.y)) * n.mm; float non = step(.35, n.r.w);
  float nh = non * (1. - ss(2.8, 4., length(np))), dy = -np.y;
  float rust = non * exp(-np.x * np.x / pow(3. + .06 * max(dy, 0.), 2.)) * ss(-4., 6., dy) * exp(-max(dy, 0.) / (60. + 120. * n.r.z)) * (.6 + .4 * vn(vec2(uv.x * 300., uv.y * 20.), vec2(300., 20.), 11));
  vec4 lv = vor(uv * 40., vec2(40.), 13, 1.); float lm = ss(.6, .75, fbm(uv * 4., vec2(4.), 3, 15)) * .45;
  float lich = step(lv.z, lm) * aa(lv.x * 25., 1. + 3.5 * lv.w);
  float fib = vn(vec2(uv.x * 20., Y * 250.), vec2(20., 250.), 17);
  vec3 silver = vec3(.33, .32, .3), brown = vec3(.15, .11, .075);
  vec3 col = mix(brown, silver, ss(.0, .6, x) * (.55 + .45 * ex)) * (.82 + .3 * fib) * (.88 + .2 * fbm(uv * vec2(3., 25.), vec2(3., 25.), 3, 19));
  col = mix(col, vec3(.2, .075, .025), .6 * sat(rust)) * (1. - .85 * chk);
  col = mix(col, mix(vec3(.3, .31, .26), vec3(.34, .32, .22), lv.w), lich * .6);
  c = mix(col, vec3(.06, .05, .045), nh);
  h = ridge - 2.5 * chk - .4 * nh + .3 * lich + .1 * fib + .25 * fbm(uv * vec2(20., 200.), vec2(20., 200.), 2, 21);
  r = .74 + .16 * fbm(uv * vec2(4., 30.), vec2(4., 30.), 2, 23) - .08 * x * ex + .2 * chk + .1 * lich - .2 * nh; m = .6 * nh; t = 1.;`, WD);

set('palmTrunk', 1, 512, 1024, .88, .35, `
  // the stem: rings of leaf scars 6 cm apart, tilted and wavy, each a shadowed groove with a raised lip above it;
  // fibrous striation running up between them, shallow vertical cracks
  float rv = uv.y * 16. + .15 * sin(2. * PI * uv.x + 1.3) + .22 * (gn(uv * vec2(2., 3.), vec2(2., 3.), 1) - .5) + .1 * (gn(uv * vec2(8., 16.), vec2(8., 16.), 2) - .5);
  float ri = mod(floor(rv), 16.), y = fract(rv) * 62.5; vec4 sr = hr(vec2(ri, 0.), 3);
  float amp = .15 + .85 * ss(.3, .7, gn(vec2(uv.x * 7., ri), vec2(7., 4096.), 4)), gy = 7. + 4. * sr.x;
  float groove = 1. - ss(0., 4. + 2. * sr.y, abs(y - gy)), lip = ss(gy + 2., gy + 6., y) * (1. - ss(gy + 10., gy + 24. + 8. * sr.z, y));
  float band = sin(PI * fract(rv)); band *= band;
  float q = uv.x * 14. + .6 * (gn(uv * vec2(3., 4.), vec2(3., 4.), 5) - .5), ci = mod(floor(q + .5), 14.), dx = (q - floor(q + .5)) * 71.;
  float cw = 1.4 * sat((gn(vec2(ci * 7.3, uv.y * 5.), vec2(4096., 5.), 6) - .58) * 6.), crk = aa(abs(dx), cw * .5) * step(.05, cw);
  float fib = ridged(vec2(uv.x * 300., uv.y * 12.), vec2(300., 12.), 2, 7), fn = vn(vec2(uv.x * 150., uv.y * 6.), vec2(150., 6.), 8);
  float pat = st(fbm(uv * vec2(4., 6.), vec2(4., 6.), 3, 9), 1.8);
  h = amp * (-3.5 * groove + 3. * lip + 2. * band) + .7 * fib + .5 * fn - 1.2 * crk + 1.4 * (fbm(uv * vec2(24., 32.), vec2(24., 32.), 3, 10) - .5) * 2.;
  vec3 col = mix(vec3(.06, .052, .045), vec3(.17, .155, .135), .2 + .45 * lip + .25 * band) * (.6 + .5 * fib + .35 * fn) * (.6 + .7 * pat);
  col = mix(col, vec3(.2, .13, .075) * (.8 + .4 * fn), .5 * sr.w * band); // a few rings keep the brown of the old leaf bases
  c = col * (1. - .55 * groove * amp) * (1. - .7 * crk);
  r = .86 + .08 * groove - .06 * lip + .06 * crk; t = 1.;`);

set('palmLeaf', .5, 512, 512, .38, .2, `
  // leaflets 4 cm wide side by side, each folded along its raised midrib, fine parallel veins; on some, dry brown patches
  // that start at the margins and creep in, and margins browned where the wind frayed them
  float ln = uv.y * 12. + .25 * (gn(uv * vec2(2., 12.), vec2(2., 12.), 1) - .5), li = mod(floor(ln), 12.), am = (fract(ln) - .5) * 41.7;
  vec4 lr = hr(vec2(li, 0.), 2); float aw = abs(am), face = 1. - ss(18.6, 20.4, aw), mid = 1. - ss(.8, 2.4, aw);
  float sp = 2.4 * (.85 + .3 * gn(vec2(uv.x * 3., li), vec2(3., 4096.), 3)), vv = .5 + .5 * cos(2. * PI * am / sp);
  float g = fract(uv.x + lr.x), nz = vn(vec2(uv.x * 40., ln * 6.), vec2(40., 72.), 5);
  float pd = abs(g - .5) * 500. + (19. - aw) * .8 + 45. * nz, dry = step(lr.y, .2) * (1. - ss(20. + 60. * lr.z, 40. + 60. * lr.z, pd));
  float edge = step(.55, lr.z) * ss(14.5 + 3. * nz, 18.5, aw);
  vec3 col = cellCol(vec3(.055, .13, .032), lr, .12) * (.82 + .36 * gn(vec2(uv.x * 3., li * 1.7), vec2(3., 4096.), 7)) * (1. + .12 * vv);
  col = mix(col, vec3(.15, .2, .06), mid * .75);
  col = mix(col, vec3(.3, .2, .09) * (.75 + .4 * nz), max(dry, .75 * edge)) * (1. - 1.6 * dry * (1. - dry)); // a darker line where green turns dry
  c = mix(col * .3, col, face);
  h = .9 * (1. - aw * aw / 400.) + .3 * mid - .05 * vv - .6 * (1. - face) + .04 * fbm(uv * 100., vec2(100.), 2, 6) - .1 * dry;
  r = mix(.3 + .06 * vv, .68, max(dry, edge)) + .3 * (1. - face); t = 1.;`);

// materials: name, texture set, shader options (see mat.js)
mat('hardwood', 'hardwood', { detail: .08, macro: .05, fine: .002, dirt: .3, wear: .3, edgeCol: [.62, .45, .3] });
mat('benchWood', 'benchWood', { detail: .08, macro: .06, fine: .002, dirt: .3, wear: .5, edgeCol: [.72, .56, .4] });
mat('weatheredWood', 'weatheredWood', { detail: .2, macro: .08, fine: .003 });
mat('palmTrunk', 'palmTrunk', { detail: .2, macro: .1 });
mat('palmLeaf', 'palmLeaf', { detail: .04, back: 1.6, fine: .003, side: THREE.DoubleSide });
