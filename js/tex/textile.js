// Wall coverings, carpets, upholstery and ceiling tiles: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

set('wallpaper', 1.06, 1024, 1024, .84, .3, `
  float s = fract(uv.x * 2.), seam = min(s, 1. - s) * 530.; // two 53 cm strips
  vec2 g = uv * 8., cl = fract(g); cl.y = fract(g.y + mod(floor(g.x), 2.) * .5);
  float line = 1. - ss(.8, 1.4, (.5 - abs(cl.x - .5)) * 132.5);
  float dd = abs(cl.x - .5) * 1.5 + abs(cl.y - .5), motif = 1. - ss(.12, .132, dd), ring = 1. - ss(.0, .01, abs(dd - .17));
  float fib = vn(uv * 1200., vec2(1200), 3), age = fbm(uv * 5., vec2(5), 5, 5);
  c = vec3(.84, .67, .24) * (.92 + .08 * fib) * (.86 + .2 * age) * (1. - .32 * line - .26 * motif - .14 * ring);
  c *= 1. - .3 * (1. - ss(.15, .5, seam));
  h = .25 * fib + .1 * motif + .05 * ring - .1 * line + .12 * (1. - ss(.5, 3., seam)) - .25 * (1. - ss(0., .3, seam));
  r = .88 - .25 * motif; t = 1.;`);
set('damask', .53, 1024, 512, .6, .3, `
  vec2 g = uv * 2.; g.y += mod(floor(g.x), 2.) * .5; vec2 p = fract(g) - .5; p.x = abs(p.x); // mirrored motif, half-drop match
  float an = atan(p.y, p.x), bd = length((p - vec2(0., .02)) * vec2(1.6, 1.)) - (.17 + .05 * cos(an * 4.));
  float body = 1. - ss(.0, .01, bd), inner = 1. - ss(.0, .008, abs(bd + .05));
  float sc1 = 1. - ss(.0, .012, abs(length(p - vec2(.22, -.16)) - .09)), sc2 = 1. - ss(.0, .012, abs(length(p - vec2(.2, .2)) - .07));
  float leaf = 1. - ss(.0, .01, length((p - vec2(.31, .0)) * vec2(3., 1.)) - .12), top = 1. - ss(0., .01, length((p - vec2(0., .37)) * vec2(2.5, 1.)) - .08);
  float flock = sat(max(max(body - inner, sc1), max(sc2, max(leaf, top))));
  float fib = vn(uv * 1500., vec2(1500), 3);
  c = mix(vec3(.82, .74, .58) * (.95 + .05 * fib), vec3(.6, .46, .28) * (.85 + .2 * fib), flock);
  h = .35 * flock + .1 * fib * flock; r = mix(.42, .95, flock); t = 1.;`);
set('loopCarpet', .5, 1024, 1024, .95, .45, `
  vec4 v = vor(uv * 220., vec2(220), 1, 1.); vec3 nv = vorv(uv * 220., vec2(220), 1, 1.); // tufts, about 2.3 mm
  float tuft = sat(1. - v.x * 1.25), side = ss(.0, .25, v.y - v.x), a = nv.z * 6.28;
  float tw = .5 + .5 * sin(dot(-nv.xy, vec2(cos(a), sin(a))) * 18. + nv.z * 9.); // the twist of the yarn
  float mot = st(fbm(uv * 30., vec2(30), 4, 11), 3.5), clump = fbm(uv * 90., vec2(90), 3, 19), fleck = step(.8, v.w) * (v.w - .8) * 5.;
  float lean = multi(uv, 41); // the pile leans a different way patch by patch: the mottling that reads from across a room
  h = (.6 + .5 * v.w) * sqrt(tuft) * side + .12 * tw * tuft + 1.1 * (mot - .5) + .7 * (clump - .5) + .5 * lean;
  c = vec3(.68, .66, .62) * (.6 + .6 * v.z) * (.5 + .5 * tuft * side) * (.88 + .12 * tw) * (.55 + .8 * mot) * (1. + .16 * lean) * (1. + vec3(.06, 0., -.06) * (v.w - .5));
  c = mix(c, c * vec3(.55, .5, .45), fleck * .7); // darker yarn flecked through it
  r = .95; t = 1.;`);
set('hotelCarpet', 1.2, 1024, 512, 1, .3, `
  vec2 cu = fract(uv * 6.) - .5;
  float lat = abs(abs(cu.x) + abs(cu.y) - .5), latL = 1. - ss(.016, .022, lat), latI = 1. - ss(.004, .008, abs(lat - .055));
  float rr = length(cu), an = atan(cu.y, cu.x), petal = rr - (.11 + .045 * cos(6. * an));
  float flower = 1. - ss(.0, .01, petal), vein = (1. - ss(.0, .006, abs(petal + .03))) * flower, centre = 1. - ss(.025, .035, rr);
  float dots = 1. - ss(.006, .01, length(fract(uv * 12. + .5) - .5) / 12.);
  vec4 tv = vor(uv * 500., vec2(500), 3, 1.); float tuft = sqrt(sat(1. - tv.x)), lay = vn(uv * vec2(60., 600.), vec2(60., 600.), 5), mot = fbm(uv * 20., vec2(20), 4, 7);
  float gold = max(max(latL, latI), max(flower - vein, dots * (1. - flower)));
  c = mix(vec3(.15, .006, .01), vec3(.48, .26, .035), gold); c = mix(c, vec3(.014, .002, .003), centre);
  c *= (.66 + .4 * tuft) * (.86 + .24 * lay) * (.9 + .2 * tv.z) * (.85 + .3 * mot);
  h = .35 * tuft + .25 * lay; r = 1.; t = 1.;`);
set('velvet', .3, 512, 512, .9, .2, `
  float pile = vn(uv * 600., vec2(600), 1) * .5 + vn(uv * 240., vec2(240), 3) * .5;
  float crush = st(fbm(uv * 3. + .6 * vec2(fbm(uv * 3., vec2(3), 3, 5), 0.), vec2(3), 5, 7), 2.5); // crushed pile: lighter and smoother where it lies flat
  c = vec3(.7) * (.65 + .45 * crush) * (.92 + .1 * pile); h = .15 * pile + .3 * crush; r = .9 - .15 * crush; t = 1.;`);
set('vinylFoam', 1, 512, 1024, .45, .3, `
  vec4 v = vor(uv * 380., vec2(380), 1, 1.); float peb = sqrt(sat(1. - v.x * 1.3)) * (.7 + .3 * v.z);
  float du = min(uv.x, 1. - uv.x) * 1000., dv = min(uv.y, 1. - uv.y) * 1000., sd = min(du, dv), al = du < dv ? uv.y : uv.x; // seams on the panel edges
  float pipe = sqrt(sat(1. - sd * sd / 25.)), groove = 1. - ss(.5, 1.5, abs(sd - 6.));
  float stitch = (1. - ss(.4, .8, abs(sd - 11.))) * step(.35, fract(al * 1000. / 5.));
  float wr = exp(-sd / 22.) * ss(.35, .75, gn(vec2(al * 56., sd / 9.), vec2(56., 4096.), 3)) * ss(.3, .6, gn(uv * 12., vec2(12), 7)); // wrinkles pulled toward the seams, irregular (a sine here rang like a ladder) // wrinkles pulled toward the seams
  float scuff = ss(.72, .86, fbm(uv * vec2(6., 24.), vec2(6., 24.), 4, 5));
  h = .05 * peb + 2. * pipe + 1.2 * wr - .3 * stitch - .4 * groove + .3 * fbm(uv * 3., vec2(3), 3, 9);
  c = vec3(.82) * (.96 + .04 * peb) * (1. - .15 * groove); c = mix(c, vec3(.9, .88, .82), stitch); c = mix(c, vec3(.72), scuff * .15);
  r = .42 + .05 * peb + .2 * scuff + .1 * stitch; t = (1. - stitch) * (1. - .3 * scuff);`);
set('ceilingTile', 1.2, 1024, 1024, .9, .25, `
  vec2 g = uv * 2., id = floor(g), f = fract(g);
  float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) * 600.; // mm to the grid line
  float bar = 1. - ss(11.5, 12.5, e), rev = ss(13., 22., e);
  vec2 p = uv * 40. + .6 * vec2(fbm(uv * 12., vec2(12), 4, 1), fbm(uv * 12., vec2(12), 4, 3));
  float fis = (1. - ss(.0, .05, abs(gn(p, vec2(40), 5) - .5))) * ss(.35, .6, vn(uv * 90., vec2(90), 7)); // worm-like fissures
  vec4 pv = vor(uv * 300., vec2(300), 9, 1.); float pin = (1. - ss(.15, .32, pv.x)) * step(.45, pv.z); // pinholes
  float ht = -3. + 3. * rev - .5 * fis - .5 * pin + .15 * fbm(uv * 400., vec2(400), 2, 11);
  h = mix(ht, 2. - .8 * (1. - ss(10., 11.5, e)) * 0., bar);
  vec3 tile = vec3(.86, .85, .81) * (.95 + .05 * hf(id, 11)) * (1. - .22 * fis - .5 * pin) * (.95 + .05 * fbm(uv * 20., vec2(20), 3, 13));
  c = mix(tile, vec3(.88, .87, .84), bar); r = mix(.95, .4, bar); t = 1.;`);

// materials: name, texture set, shader options (see mat.js)
mat('wallpaper', 'wallpaper', { detail: .25, macro: .08, dirt: .7, dirtCol: [.62, .52, .36] });
mat('damask', 'damask', { detail: .1, macro: .06, dirt: .5, dirtCol: [.66, .6, .5] });
mat('loopCarpet', 'loopCarpet', { color: 0xc8b48a, macro: .4, grime: .4 });
mat('blackoutCarpet', 'loopCarpet', { color: 0x2a2a2e, macro: .2 });
mat('hotelCarpet', 'hotelCarpet', { macro: .15 });
mat('velvet', 'velvet', { color: 0x8a1a26, macro: .1, sheen: 1 });
mat('vinylFoam', 'vinylFoam', { fine: .005, color: 0x3f8fe0, detail: .12, macro: .05, dirt: .4, wear: .3, edgeCol: [.85, .85, .85] });
mat('ceilingTile', 'ceilingTile', { detail: .25, macro: .06 });
