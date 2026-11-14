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
  // six boards a metre across (js/props/garden.js cuts each piece of timber from one), each sawn from its own log: on half of
  // them the pith lies just under the face (flat-sawn: cathedral arches where the rings run out through it), on the rest well off
  // to one side (rift: near-straight lines). Rings 2.6-5 mm, wandering; knots 15-30 mm with the rings swirling round them.
  float row = mod(floor(uv.y * 6.), 6.), across = (fract(uv.y * 6.) - .5) * 166.7; vec4 bh = hr(vec2(row, 3.), 2);
  float cath = step(.67, bh.w), y0 = mix((bh.y > .5 ? 1. : -1.) * (120. + 200. * bh.x), (bh.y - .5) * 50., cath);
  float zz = mix(60. + 120. * bh.z, 14. + 30. * bh.z, cath) + mix(4., 9., cath) * sin(6.2832 * (uv.x + bh.x)) + 5. * sin(6.2832 * (2. * uv.x + bh.y))
    + 6. * (gn(vec2(uv.x * 3., row * 1.7), vec2(3., 4096.), 3) - .5);
  Cell k = tiles(uv, vec2(2., 6.), .5, 3); vec2 kp = (k.f - (.3 + .4 * k.r.xy)) * k.mm;
  float kr = 7.5 + 7.5 * k.r.z, kd = length(kp * vec2(.55, 1.)), kon = step(.55, k.r.w);
  float d = length(vec2(across - y0, zz)) + kon * 1.4 * kr * exp(-kd * kd / (kr * kr * 7.)) + 1.2 * (gn(vec2(uv.x * 40., across / 7.), vec2(40., 4096.), 4) - .5);
  float w = 2.6 + 2.4 * bh.x, ph = d / w + 1.5 * gn(vec2(d / (w * 5.), bh.y * 50.), vec2(4096.), 5);
  vec4 g = wd_rings(ph, w, uv * 1000., vec2(160., 500.), row, 6);
  float knot = kon * (1. - ss(kr - .8, kr + .8, kd)), krim = kon * (1. - ss(0., 1.4, abs(kd - kr)));
  vec3 col = mix(vec3(.4, .225, .115), vec3(.2, .1, .045), g.x) * (1. - .3 * g.y); // a mid-brown tropical hardwood, not pine
  col *= .86 + .28 * gn(vec2(uv.x * 2., row * 3.1), vec2(2., 4096.), 9); // heart and sap streaks along the board
  col = cellCol(col, bh, .1);
  col = mix(col, vec3(.2, .095, .04) * (.8 + .4 * fract(kd / 1.6)), knot) * (1. - .45 * krim);
  // the varnish: worn through to bare, greying, raised grain where hands and weather have been, flaking at its edge, scratched
  float bf = fbm(uv * vec2(2., 4.), vec2(2., 4.), 4, 31), bare = ss(.5, .7, bf), flk = (1. - ss(0., .012, abs(bf - .53))) * .3, scr = wd_scr(uv, 4., .7, 33) * (1. - bare);
  vec3 grey = vec3(.32, .27, .21) * (.8 + .4 * (1. - g.x)) * (1. - .25 * g.y);
  col = mix(col, mix(grey, col * .8, .35 * g.x + .4 * g.y), bare * .7);
  c = col * (1. - .25 * flk) * (1. + .1 * scr);
  h = .12 * g.x * (.25 + bare) - .07 * g.y + .12 * knot - .3 * krim + .03 * flk - .02 * scr + .04 * (1. - bare);
  r = mix(.3 + .06 * g.y, .64 + .1 * g.y - .08 * g.x, bare) + .1 * flk + .12 * scr - .08 * knot * (1. - bare); t = 1.;`, WD);

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

set('palmTrunk', 1, 512, 1024, .86, .35, `
  // the stem: leaf-scar rings 28-80 mm apart (24 a metre on average, bunching and spreading), tilted, each a groove with a raised
  // lip above it and a gentle swell between; vertical fibre between the rings, shallow cracks; grey-brown and matte.
  // trunkRing() in js/props/garden.js repeats this ring profile in the stem's silhouette: keep the two in step.
  float rv = uv.y * 24. + .6 * sin(6.2832 * 3. * uv.y) + .15 * sin(6.2832 * uv.x + 1.3);
  float ri = mod(floor(rv), 24.), f = fract(rv); vec4 sr = hr(vec2(ri, 0.), 3);
  float amp = .4 + .6 * ss(.3, .7, gn(vec2(uv.x * 7., ri * 1.7), vec2(7., 4096.), 4));
  float groove = 1. - ss(0., .09 + .03 * sr.y, abs(f - .15)), lip = ss(.2, .3, f) * (1. - ss(.36, .62 + .1 * sr.z, f));
  float band = sin(PI * f); band *= band;
  float q = uv.x * 14. + .6 * (gn(uv * vec2(3., 4.), vec2(3., 4.), 5) - .5), ci = mod(floor(q + .5), 14.), dx = (q - floor(q + .5)) * 67.;
  float cw = 1.2 * sat((gn(vec2(ci * 7.3, uv.y * 5.), vec2(4096., 5.), 6) - .58) * 6.), crk = aa(abs(dx), cw * .5) * step(.05, cw) * (1. - groove);
  float fib = ridged(vec2(uv.x * 380., uv.y * 9.), vec2(380., 9.), 2, 7), fn = vn(vec2(uv.x * 160., uv.y * 5.), vec2(160., 5.), 8);
  float pat = st(fbm(uv * vec2(4., 6.), vec2(4., 6.), 3, 9), 1.6);
  h = amp * (-2.6 * groove + 2.2 * lip + 1.4 * band) + .35 * fib + .3 * fn - crk + .8 * (fbm(uv * vec2(24., 32.), vec2(24., 32.), 3, 10) - .5);
  vec3 col = mix(vec3(.1, .088, .075), vec3(.25, .22, .185), .3 + .35 * lip + .2 * band) * (.72 + .38 * fib + .22 * fn) * (.72 + .5 * pat);
  col = mix(col, vec3(.21, .14, .085) * (.8 + .4 * fn), .45 * sr.w * (1. - groove)); // a few rings keep the brown of the old leaf bases
  c = col * (1. - .5 * groove * amp) * (1. - .6 * crk);
  r = .86 + .06 * groove - .03 * lip + .05 * crk; t = 1.;`);

set('palmLeaf', .5, 512, 512, .45, .2, `
  // one leaflet a twelfth of the set across (js/props/garden.js maps each modelled leaflet onto one, so the midrib runs down its
  // fold), its length along u: a raised midrib 2-4 mm wide, parallel veins 1.4 mm apart, a paler margin; on some, dry patches
  // creeping in from the edge
  float ln = uv.y * 12., li = mod(floor(ln), 12.), am = (fract(ln) - .5) * 41.7, aw = abs(am);
  vec4 lr = hr(vec2(li, 0.), 2); float mid = 1. - ss(.9, 2., aw);
  float vv = .5 + .5 * cos(6.2832 * am / 1.4), g = fract(uv.x + lr.x), nz = vn(vec2(uv.x * 40., ln * 6.), vec2(40., 72.), 5);
  float pd = abs(g - .5) * 500. + (21. - aw) * .9 + 40. * nz, dry = step(lr.y, .18) * (1. - ss(15. + 50. * lr.z, 30. + 50. * lr.z, pd));
  float edge = ss(17.5 + 2. * nz, 20.8, aw);
  vec3 col = cellCol(vec3(.075, .16, .042), lr, .14) * (.84 + .32 * gn(vec2(uv.x * 3., li * 1.7), vec2(3., 4096.), 7)) * (1. + .1 * vv);
  col = mix(col, vec3(.2, .24, .085), mid * .7);
  col = mix(col, col * vec3(1.25, 1.15, .9), .5 * edge); // the paler margin
  col = mix(col, vec3(.29, .23, .13) * (.75 + .4 * nz), dry) * (1. - 1.4 * dry * (1. - dry)); // a darker line where green turns dry
  c = col;
  h = .35 * (1. - aw * aw / 435.) + .35 * mid - .05 * vv + .04 * fbm(uv * 100., vec2(100.), 2, 6) - .1 * dry;
  r = mix(.42 + .06 * vv - .06 * mid, .7, dry) + .06 * edge; t = 1.;`);

// materials: name, texture set, shader options (see mat.js)
mat('hardwood', 'hardwood', { detail: .08, macro: .05, fine: .002, dirt: .3, wear: .3, edgeCol: [.62, .45, .3] });
mat('benchWood', 'benchWood', { detail: .08, macro: .06, fine: .002, dirt: .3, wear: .5, edgeCol: [.72, .56, .4] });
mat('weatheredWood', 'weatheredWood', { detail: .2, macro: .08, fine: .003 });
mat('palmTrunk', 'palmTrunk', { detail: .2, macro: .1, fine: .003 });
mat('palmLeaf', 'palmLeaf', { detail: .04, back: 1.6, fine: .003, side: THREE.DoubleSide });
