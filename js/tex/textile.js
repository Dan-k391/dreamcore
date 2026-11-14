// Wall coverings, carpets, upholstery and ceiling tiles: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

// Printed vinyl paper hung in 53 cm strips: straight pinstripes and diamonds printed with a little ink spread, each strip hung
// a millimetre or two off its neighbour, glue-stained butt seams whose edges have lifted, an embossed paper grain.
set('wallpaper', 1.06, 1024, 1024, .86, .3, `
  float sx = uv.x * 2., s = fract(sx), seam = min(s, 1. - s) * 530.; vec4 sr = hr(vec2(floor(sx), 3.), 17); // mm to the strip edge
  vec2 q = uv + vec2(.0078 + (sr.y - .5) * .0016, (sr.x - .5) * .004); // the print, misregistered strip by strip
  vec2 g = q * 8., cl = fract(g); cl.y = fract(g.y + mod(floor(g.x), 2.) * .5); vec2 pm = (cl - .5) * 132.5; // mm in the motif cell
  float ink = .85 + .3 * fbm(uv * 70., vec2(70), 3, 7), sp = .5 * (vn(uv * 600., vec2(600), 3) - .5); // ink density, ink spread
  float ex = 66.25 - abs(pm.x), line = max(aa(ex, .5), .6 * aa(abs(ex - 3.4), .3)); // a straight pinstripe and its fine partner
  float dd = abs(pm.x) * 1.45 + abs(pm.y) + sp, fill = aa(dd, 15.), rim = aa(abs(dd - 15.), .45), ring = aa(abs(dd - 23.), .35), dt = aa(length(pm) + sp, 2.2);
  float fib = vn(uv * 450., vec2(450), 3), emb = fbm(uv * 160., vec2(160), 4, 5), mott = multi(uv, 41);
  c = vec3(.84, .67, .25) * (.93 + .07 * fib) * (1. + .05 * mott) * (1. - .2 * fill * ink - .3 * rim - .2 * ring - .3 * line * ink - .35 * dt);
  float glue = 1. - ss(.5, 7., seam), gap = aa(seam, .25);
  c *= mix(vec3(1), vec3(.92, .87, .76), glue * (.4 + .6 * sr.z)) * (1. - .55 * gap);
  float lift = (1. - ss(.3, 9., seam)) * (.05 + .12 * (s < .5 ? sr.w : sr.z)); // the strip edges curl off the wall a little
  h = .1 * emb + .03 * fib + .02 * (fill + line) + lift - .15 * gap;
  r = .87 - .08 * fill - .06 * line - .1 * glue; t = 1.;`);

// Tone-on-tone damask wall fabric: a mirrored acanthus medallion on a half-drop, told from the ground by its satin floats
// running the other way and their sheen (roughness), hardly by colour or relief.
set('damask', .53, 1024, 512, .6, .3, `
  vec2 g = uv * 2.; g.y += mod(floor(g.x), 2.) * .5; vec2 p = fract(g) - .5; p.x = abs(p.x);
  float mk = aa(dmMotif(p) * 265., 0.);
  float sg = vn(uv * vec2(30., 300.), vec2(30., 300.), 3), sm = vn(uv * vec2(300., 30.), vec2(300., 30.), 4); // satin floats: across in the ground, up in the motif
  float slub = vn(uv * vec2(6., 240.), vec2(6., 240.), 6), mott = multi(uv, 9);
  c = mix(vec3(.8, .72, .56) * (.97 + .03 * sg), vec3(.74, .64, .47) * (.96 + .04 * sm), mk) * (.97 + .04 * slub) * (1. + .03 * mott);
  h = mix(.04 * sg, .02 + .03 * sm, mk); r = mix(.72, .36, mk); t = 1.;`, `
float dmLeaf(vec2 p, vec2 a, vec2 b, float wd, float bend) { // distance (cell units) to a curved leaf from a to b, wd wide at its middle
  vec2 d = b - a; float L = length(d), t = dot(p - a, d) / (L * L), n = dot(p - a, vec2(-d.y, d.x) / L) - bend * L * sin(PI * sat(t));
  return abs(n) - wd * sin(PI * sat(t)) + max(max(-t, t - 1.), 0.) * L; }
float dmArc(vec2 p, vec2 c, float R, float w, vec2 dir) { vec2 q = p - c; return dot(q, dir) > 0. ? abs(length(q) - R) - w : 1.; }
float dmMotif(vec2 p) { // the medallion, mirrored (p.x >= 0)
  float body = dmLeaf(p, vec2(0., -.2), vec2(0., .24), .075, 0.), hol = dmLeaf(p, vec2(0., -.13), vec2(0., .17), .045, 0.);
  float d = min(max(body, -hol), dmLeaf(p, vec2(0., -.07), vec2(0., .11), .016, 0.));
  d = min(d, dmLeaf(p, vec2(.02, -.2), vec2(.28, -.03), .045, .25));
  d = min(d, dmLeaf(p, vec2(.05, -.06), vec2(.3, .2), .04, .2));
  d = min(d, dmLeaf(p, vec2(.04, .13), vec2(.18, .34), .03, .2));
  d = min(d, dmArc(p, vec2(.3, .025), .04, .008, vec2(1., .3)));
  d = min(d, dmArc(p, vec2(.31, .24), .035, .007, vec2(.4, 1.)));
  d = min(d, dmArc(p, vec2(.065, -.38), .045, .008, vec2(-.2, -1.)));
  d = min(d, dmLeaf(p, vec2(0., .3), vec2(0., .46), .022, 0.));
  d = min(d, dmLeaf(p, vec2(0., .3), vec2(.07, .44), .018, .1));
  d = min(d, dmLeaf(p, vec2(0., .29), vec2(.13, .39), .016, .15));
  d = min(d, dmLeaf(p, vec2(0., -.45), vec2(0., -.2), .01, 0.));
  vec2 s = vec2(p.x, abs(p.y)) - vec2(.5, .25); d = min(d, min(length(s * vec2(1., 2.5)), length(s * vec2(2.5, 1.))) - .03); // a sprig between columns
  return d; }`);

// Tufted loop pile: rows of yarn loops on a 3.2 x 3 mm gauge in three shades of yarn with a darker fleck, matted where it
// has been trodden flat (darker, glossier), with the odd bit of lint caught in it.
set('loopCarpet', .5, 1024, 1024, .93, .45, `
  vec2 lw = uv + .0024 * vec2(fbm(uv * 20., vec2(20), 3, 2) - .5, fbm(uv * 20., vec2(20), 3, 3) - .5); // rows tufted a little off true
  vec3 L = loops(lw, vec2(156., 166.), 5); L.x *= .75 + .5 * hf(floor(lw * vec2(156., 166.)), 21);
  float cr = ss(.5, .78, fbm(uv * 4., vec2(4), 4, 11)); // matted patches
  float ply = vn(uv * 520., vec2(520), 9), lean = st(fbm(uv * 40., vec2(40), 3, 19), 2.); // tufts clump and lean together
  float tone = L.y < .34 ? .78 : L.y < .72 ? 1. : 1.18; // three shades tufted together: the heather
  float fleck = step(.955, L.y), lint = fibres(uv * 60., vec2(60), 9, .5, .07) * step(.86, hf(floor(uv * 60.), 12));
  float pile = L.x * (1. - .45 * cr) * (.9 + .2 * ply);
  h = 2.4 * pile + 1.2 * (lean - .5) - .5 * cr;
  vec3 yarn = vec3(.55, .52, .48) * tone * (1. + vec3(.04, 0., -.05) * (L.y * 2. - 1.)) * (.9 + .2 * ply);
  yarn = mix(yarn, yarn * vec3(.42, .43, .5), fleck);
  c = yarn * (.55 + .45 * sqrt(L.z) * (.6 + .4 * L.x)) * (1. - .14 * cr) * (.7 + .6 * lean) * (.86 + .28 * vn(uv * 130., vec2(130), 23)) // clumps of tufts that lean and catch the light together
    * (.72 + .56 * st(vn(uv * vec2(90., 45.), vec2(90., 45.), 27), 2.5)); // runs of lighter and darker yarn ends along the rows
  c = mix(c, vec3(.5, .49, .47), lint * .85);
  r = .94 - .14 * cr * L.z - .04 * L.x; t = 1. - .9 * lint;`);

// Woven (Axminster-like) hotel carpet: every 3 mm tuft takes one yarn colour, so the design steps along the loom's grid and
// bleeds a tuft into its neighbour: a gold lattice, leaf medallions with cream rosettes and teal buds, a maroon filler scroll.
set('hotelCarpet', 1.2, 1024, 512, 1, .3, `
  vec2 tg = uv * 400., ti = floor(tg), tf = fract(tg) - .5; vec4 th = hr(ti, 3);
  vec4 P = hcPat((ti + .5 + (th.xy - .5) * .8) / 400.);
  vec3 col = vec3(.19, .012, .016); col = mix(col, vec3(.1, .006, .01), P.w); col = mix(col, vec3(.02, .06, .05), P.z);
  col = mix(col, vec3(.6, .46, .26), P.y); col = mix(col, vec3(.5, .27, .045), P.x);
  float tb = sqrt(sat(1. - dot(tf, tf) * 2.6)), lay = vn(uv * vec2(60., 600.), vec2(60., 600.), 5), wear = ss(.5, .8, fbm(uv * 3., vec2(3), 4, 9)), mot = fbm(uv * 20., vec2(20), 4, 7);
  c = col * (.9 + .2 * th.z) * (.72 + .35 * tb) * (.88 + .2 * lay) * (.88 + .24 * mot) * (1. + .12 * wear);
  h = .4 * tb * (1. - .4 * wear) + .25 * lay; r = 1. - .1 * wear; t = 1.;`, `
vec4 hcPat(vec2 q) { // the design at a point: x gold, y cream, z teal, w maroon (the rest is the red ground)
  vec2 cu = fract(q * 6.) - .5; float lat = abs(abs(cu.x) + abs(cu.y) - .5);
  float gold = max(1. - step(.017, lat), 1. - step(.008, abs(lat - .06)));
  vec2 p = abs(cu); if (p.y > p.x) p = p.yx;
  float x = (p.x - .05) / .22, w = .055 * sin(PI * sat(x)) * (1. - .3 * x), leaf = step(0., x) * step(x, 1.) * step(p.y, w), rib = leaf * step(p.y, .006);
  float curl = step(abs(length(p - vec2(.29, .045)) - .035), .008) * step(.27, p.x);
  float bd = length(p - vec2(.14, .14)), r = length(cu);
  float fill = step(abs(fbm(q * 24., vec2(24), 3, 7) - .5), .01); // a thin maroon scroll through the ground
  return vec4(max(gold, max(leaf - rib, curl)), max(step(r, .05) - step(r, .02), step(bd, .011)), max(step(bd, .028) - step(bd, .011), rib), max(fill, step(r, .02))); }`);

// Cotton velvet: the pile lies a different way patch by patch where it was pressed (lighter, smoother, its fibres streaked
// one of four ways, so the grazing sheen changes patch to patch), with soft crease lines between the patches.
set('velvet', .3, 512, 512, .88, .2, `
  vec2 w = uv + .04 * vec2(fbm(uv * 5., vec2(5), 3, 2) - .5, fbm(uv * 5., vec2(5), 3, 3) - .5);
  vec4 v = vor(w * 4., vec2(4), 5, 1.); float edge = ss(0., .45, v.y - v.x), cr = v.z * edge, k = floor(v.w * 4.);
  vec2 a = uv * 300., b = vec2(uv.x + uv.y, uv.x - uv.y) * 250.;
  float st0 = k < 1. ? vn(a * vec2(1., .08), vec2(300., 24.), 4) : k < 2. ? vn(a.yx * vec2(1., .08), vec2(300., 24.), 5) : k < 3. ? vn(b * vec2(1., .08), vec2(250., 20.), 6) : vn(b.yx * vec2(1., .08), vec2(250., 20.), 7);
  float pile = vn(uv * 400., vec2(400), 9), small = vor(w * 10., vec2(10), 8, 1.).z;
  c = vec3(.7) * (1. + .15 * (v.z * 2. - 1.) * edge) * (1. + .05 * (small - .5)) * (.94 + .1 * pile) * (.95 + .1 * st0);
  h = .25 * st0 * (.4 + .6 * cr) + .08 * pile - .05 * (1. - edge); r = .88 - .14 * cr; t = 1.;`);

// Vinyl over foam: a pebbled grain, the cover pillowed up between its seams and rolled down into them, rows of 4 mm stitches
// as rounded thread bumps (band-limited: no ringing), creases toward the corners, scuffed matt where it gets knocked.
set('vinylFoam', 1, 512, 1024, .45, .3, `
  vec4 v = vor(uv * 380., vec2(380), 1, 1.); float peb = sqrt(sat(1. - v.x * 1.3)) * (.7 + .3 * v.z), grain = fbm(uv * 90., vec2(90), 3, 4);
  float du = min(uv.x, 1. - uv.x) * 1000., dv = min(uv.y, 1. - uv.y) * 1000., sd = min(du, dv), al = du < dv ? uv.y : uv.x; // seams on the panel edges
  float roll = 1. - exp(-sd / 18.), val = 1. - ss(0., 3., sd);
  float sx = fract(al * 1000. / 7.), pulse = ss(.05, .25, sx) * (1. - ss(.45, .65, sx));
  float acr = 1. - ss(.6, 1.4, abs(sd - 9.)), stitch = acr * pulse, hole = acr * (1. - pulse);
  float corner = exp(-length(vec2(du, dv)) / 90.), crease = corner * ridged(uv * 30., vec2(30), 3, 3);
  float wr = exp(-sd / 22.) * ss(.35, .75, gn(vec2(al * 56., sd / 9.), vec2(56., 4096.), 3)) * ss(.3, .6, gn(uv * 12., vec2(12), 7));
  float scuff = ss(.7, .86, fbm(uv * vec2(6., 24.), vec2(6., 24.), 4, 5)) * roll;
  h = .05 * peb + .05 * grain + 3. * roll - 1. * val + .35 * stitch - .15 * hole + 1. * wr + .9 * crease + .3 * fbm(uv * 3., vec2(3), 3, 9);
  c = vec3(.82) * (.96 + .04 * peb) * (.97 + .05 * grain) * (1. - .25 * val) * (1. - .2 * hole); c = mix(c, vec3(.88, .86, .8), stitch); c = mix(c, vec3(.72), scuff * .15);
  r = .42 + .05 * peb + .22 * scuff + .15 * stitch; t = (1. - stitch) * (1. - .3 * scuff);`);

// Mineral fibre ceiling tiles, 60 cm, in a painted steel T-bar grid: worm fissures that vary in width and gather in clusters,
// pinholes, each tile its own tone and yellowing, a few sagging or water-ringed, a shadow line where each sits on the flange.
set('ceilingTile', 1.8, 1024, 1024, .9, .25, `
  Cell c0 = tiles(uv, vec2(3), 0., 3); float e = c0.e; vec4 q = hr(c0.id, 13), q2 = hr(c0.id, 29);
  float bar = aa(e, 12.); // the 24 mm flange
  vec2 wu = uv + .006 * vec2(fbm(uv * 9., vec2(9), 3, 1) - .5, fbm(uv * 9., vec2(9), 3, 2) - .5);
  float clus = ss(.42, .68, fbm(uv * 12., vec2(12), 3, 4));
  float f1 = vein(wu, 60., 1.8, 3, 21) * ss(.5, .64, vn(uv * 150., vec2(150), 7)) * (.3 + .7 * clus);
  float f2 = vein(wu.yx + .3, 96., .9, 3, 23) * ss(.5, .62, vn(uv * 240., vec2(240), 8)) * clus;
  float pin = pits(uv, 90., 1.6, .55, 31);
  float wetT = step(.86, q.x), wet = wetT * ss(14., 40., e);
  float sag = max(step(.86, q.z), wetT * step(.45, q.z)) * (4. + 6. * q.w) * sin(PI * c0.f.x) * sin(PI * c0.f.y); // bowed with damp
  float ht = -4. + 4. * ss(12.5, 22., e) + cellTilt(c0, 1.5) + sag - .9 * f1 - .6 * f2 - .9 * pin + .2 * fbm(uv * 450., vec2(450), 2, 11);
  float sd = length((c0.f - .22 - .56 * q2.xy) * c0.mm) / (70. + 150. * q2.z) + .25 * (fbm(uv * 14., vec2(14), 4, 17) - .5);
  float soak = wet * (1. - ss(.8, 1., sd)), tide = wet * ((1. - ss(0., .03, abs(sd - 1.))) + .6 * (1. - ss(0., .025, abs(sd - .7))));
  vec3 tile = cellCol(vec3(.86, .85, .8), c0.r, .08) * mix(vec3(1), vec3(1., .93, .78), .6 * q.y * q.y);
  tile *= (.96 + .06 * fbm(uv * 30., vec2(30), 3, 13)) * (1. - .4 * f1 - .28 * f2 - .5 * pin);
  tile *= mix(vec3(1), vec3(1., .95, .84), soak) * mix(vec3(1), vec3(.86, .77, .6), sat(tide)) * (1. - .5 * (1. - ss(12., 15., e)));
  c = mix(tile, vec3(.84, .85, .86) * (.97 + .03 * vn(uv * 600., vec2(600), 5)), bar);
  h = mix(ht, 2., bar); r = mix(.93 - .06 * soak, .38, bar); t = mix(1., .25, bar);`);

// materials: name, texture set, shader options (see mat.js)
mat('wallpaper', 'wallpaper', { detail: .2, macro: .08, dirt: .7, dirtCol: [.62, .52, .36] });
mat('damask', 'damask', { detail: .05, macro: .05, dirt: .5, dirtCol: [.66, .6, .5] });
mat('loopCarpet', 'loopCarpet', { color: 0xc8b48a, macro: .32, grime: .35, fine: .004 });
mat('blackoutCarpet', 'loopCarpet', { color: 0x5c5c66, macro: .15, sheen: .3, fine: .004 });
mat('hotelCarpet', 'hotelCarpet', { macro: .12, fine: .003 });
mat('velvet', 'velvet', { color: 0x8a1a26, macro: .06, sheen: 1, detail: .1 });
mat('vinylFoam', 'vinylFoam', { fine: .005, color: 0x3f8fe0, detail: .12, macro: .05, dirt: .4, wear: .3, edgeCol: [.85, .85, .85] });
mat('ceilingTile', 'ceilingTile', { detail: .2, macro: .09 });
