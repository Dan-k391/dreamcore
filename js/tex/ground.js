// Loose ground and turf: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

// Sand: wind ripples (gentle stoss, steep lee, sharp crest) from two fields of slightly different wavelength, so they fork
// and die out where the two meet; amplitude fading in trampled patches; grains of mixed minerals, the dark heavy ones
// gathered in the troughs; a few shell bits and pebbles; damp patches darker and smoother. Albedo at 2 mm, relief at 4 mm.
set('sand', 2, 1024, 512, .93, .2, `
  vec2 w = vec2(fbm(uv * 2., vec2(2), 4, 1), fbm(uv * 2., vec2(2), 4, 3));
  float r1 = sdRip(uv.y * 20. + 2.4 * w.x + .3 * sin((uv.x * 2. + w.y) * 2. * PI)), r2 = sdRip(uv.y * 22. + 2.1 * w.y + .4 * sin((uv.x * 3. - w.x) * 2. * PI) + .3);
  float fork = ss(.38, .62, fbm(uv * 3., vec2(3), 3, 7)), amp = .25 + .75 * ss(.3, .6, fbm(uv * 4., vec2(4), 3, 9));
  float rip = mix(r1, r2, fork), lump = fbm(uv * 6., vec2(6), 5, 5);
  h = 6. * amp * rip + 7. * lump + .4 * vn(uv * 400., vec2(400), 13);
  vec4 g = hr(floor(uv * NPX), 11); float trough = (1. - rip) * amp;
  float dark = step(g.x, .07 + .22 * ss(.5, .95, trough)), lite = step(.93, g.x), pink = step(g.y, .05) * (1. - dark);
  c = vec3(.5, .42, .28) * (.88 + .16 * fbm(uv * 15., vec2(15), 3, 19)) * (.93 + .1 * rip) * (.9 + .2 * g.z);
  c = mix(c, vec3(.13, .11, .09), dark * .8); c = mix(c, vec3(.74, .7, .6), lite * .6); c = mix(c, vec3(.6, .36, .26), pink * .5);
  c *= 1. - .12 * ss(.55, 1., trough); r = .95; t = 1.;
  vec4 v = vor(uv * 60., vec2(60), 23, 1.); float dmm = v.x * 2000. / 60., rad = 1.5 + 2.5 * v.w;
  float item = step(.93, v.z) * aa(dmm, rad), shell = step(.5, fract(v.z * 37.));   // shell bits pale and ribbed, pebbles grey-brown
  c = mix(c, shell > .5 ? vec3(.72, .66, .56) * (.85 + .15 * sin(dmm * 4.)) : vec3(.2, .18, .15) * (.7 + .6 * v.w), item);
  h += item * 1.5 * sqrt(sat(1. - dmm * dmm / (rad * rad))); r = mix(r, shell > .5 ? .55 : .7, item);
  float wet = ss(.62, .7, w.y + .3 * lump - .15); c *= 1. - .3 * wet; r -= .3 * wet; // damp patches, darker and smoother`,
  `float sdRip(float ph) { float f = fract(ph), s = f / .72, u = (f - .72) / .28; // 0 in the trough, 1 at the crest
  return f < .72 ? mix(s, s * s * (3. - 2. * s), .5) : (1. - u) * (1. - u); }`);

// Shredded bark: long splinters in four sizes, tapered and frayed at the ends, curved, streaked along the grain,
// stacked by height over a bed of dark crumbs and soil; red-brown to orange to weathered grey from chip to chip.
set('mulch', 1, 1024, 512, .92, .35, `
  float sl = fbm(uv * 40., vec2(40), 4, 1); vec4 cr = vor(uv * 220., vec2(220), 2, 1.); float crumb = (1. - ss(.25, .45, cr.x)) * step(.35, cr.z);
  c = vec3(.05, .036, .026) * (.6 + .8 * sl); c = mix(c, vec3(.15, .095, .06) * (.6 + .6 * cr.w), crumb * .85); h = -6. + 2. * sl + 1.2 * crumb; r = .95; t = 0.;
  for (int L = 0; L < 4; L++) { float sc = float(14 + 7 * L + L * L), cm = 1000. / sc, e = max(.012, 1.4 * TX * sc); vec2 p = uv * sc + float(L) * .37, i = floor(p), f = fract(p);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y), cc = mod(i + o, vec2(sc)); vec4 k = hr(cc, 3 + L), k2 = hr(cc, 17 + L);
      float a = k.x * PI; vec2 d = vec2(cos(a), sin(a)), pos = f - o - k.yz;
      float len = .32 + .33 * k.w, al = dot(pos, d), ac = dot(pos, vec2(-d.y, d.x)) - (k2.x - .5) * .6 * al * al;   // curved
      if (abs(al) > len * 1.05 || abs(ac) > .24) continue; // nowhere near this chip: skip its noise
      float alm = al * cm, acm = ac * cm, wid = (.1 + .1 * k2.y) * (.8 + .4 * vn(vec2(alm * .15, k2.z * 50.), vec2(4096), 19)) * (1. - .55 * pow(abs(al) / len, 3.));
      float fray = len * (.82 + .22 * vn(vec2(acm * .9, k2.w * 50.), vec2(4096), 21));   // ragged fibrous ends
      float ins = (1. - ss(fray - e, fray, abs(al))) * (1. - ss(wid - e, wid, abs(ac)));
      float streak = vn(vec2(alm * .07, acm * .8) + cc * 13., vec2(4096), 29), x2 = ac / wid;
      float hh = 1. + 6. * k2.z + float(L) * 1.2 + .8 * streak - 2.5 * x2 * x2 * wid * cm / 10.;
      if (hh > h && ins > 0.) {
        vec3 bc = mix(mix(vec3(.2, .1, .06), vec3(.34, .19, .09), k2.w), vec3(.24, .22, .19), ss(.62, .9, k.w) * .85) * (.6 + .6 * k2.y);
        bc = mix(bc, vec3(.3, .28, .25), .35 * ss(4., 8., hh) * step(.5, k2.x));   // sun-bleached tops
        h = mix(h, hh, ins); c = mix(c, bc * (.7 + .55 * streak) * (.75 + .25 * (1. - x2 * x2)), ins); r = mix(r, .82 + .1 * k.w, ins); } } }`);

// Rubber crumb: angular granules about 4 mm, each its own tone and facet, black, grey and a few green flecks among the
// coloured ones, bound with a thin sheen on the tops, small binder gaps; worn, compacted and dusty in broad patches.
set('rubberCrumb', 1, 1024, 512, .9, .45, `
  vec2 rv; vec4 v = rcCell(uv * 250., vec2(250), 1, rv); float cm = 1000. / 250., edge = (v.y - v.x) * .5 * cm;
  float wear = ss(.5, .75, fbm(uv * 3., vec2(3), 4, 5) + .15 * fbm(uv * 20., vec2(20), 3, 7));
  float face = 1. - aa(edge, .55), a = v.w * 2. * PI, tilt = dot(rv * cm, vec2(cos(a), sin(a))) * .3;
  h = face * (1.8 + 1.2 * v.z + 2.2 * tilt) * sqrt(ss(0., .9, edge)) * (1. - .5 * wear) + .15 * vn(uv * 900., vec2(900), 3);
  float black = step(v.z, .06), grey = step(.06, v.z) * step(v.z, .1), green = step(.985, v.z);
  c = vec3(.55) * (.78 + .44 * fract(v.z * 13.7)); t = face * (1. - black - grey - green);
  c = mix(c, vec3(.05), black); c = mix(c, vec3(.26, .26, .25), grey); c = mix(c, vec3(.08, .2, .08), green);
  c = mix(vec3(.05, .045, .04), c, face); c = mix(c, c * .8 + vec3(.08, .07, .065), wear * .35); t *= 1. - .35 * wear;
  r = mix(.95, .7 + .12 * v.w, face); r = mix(r, .93, wear * .7);`,
  `vec4 rcCell(vec2 p, vec2 n, int s, out vec2 r1) { // cellular: F1, F2, two hashes of the nearest cell; r1 the offset to its point
  vec2 i = floor(p), f = fract(p), c1 = vec2(0); float d1 = 9., d2 = 9.; r1 = vec2(0);
  for (int y = -1; y <= uOne; y++) for (int x = -1; x <= uOne; x++) { vec2 o = vec2(x, y), c = wr(i + o, n), r = o + .5 + (hf2(c, s) - .5) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; c1 = c; r1 = r; } else if (d < d2) d2 = d; }
  return vec4(sqrt(d1), sqrt(d2), hf(c1, s + 7), hf(c1, s + 11)); }`);

// Turf: soil under a dark, shaded under-storey of blades; dead thatch lying in it; living blades on top in five sizes,
// each tapered to a tip that catches the light, yellow-green to blue-green blade by blade and yellower in dry zones;
// clover clumps, thin bare patches with pebbles, tufts, and mowing bands a metre wide.
set('grassGround', 2, 1024, 1024, .92, .4, `
  float patchy = st(fbm(uv * 6., vec2(6), 4, 31), 2.5), dry = st(fbm(uv * 3., vec2(3), 3, 71), 2.2), soil = fbm(uv * 30., vec2(30), 4, 1);
  float bare = ss(.2, .02, patchy + .15 * soil), deep = vn(uv * 500., vec2(500), 3); // earth showing through where the turf is thin
  c = mix(vec3(.06, .14, .025) * (.6 + .8 * deep), vec3(.1, .075, .05) * (.7 + .6 * soil), bare); h = 1.2 * soil + .6 * deep * (1. - bare); r = .95; t = 1.;
  vec4 pb = vor(uv * 120., vec2(120), 3, 1.); float peb = (1. - ss(.2, .3, pb.x)) * step(.9, pb.z) * bare;
  c = mix(c, vec3(.28, .26, .22) * (.7 + .5 * pb.w), peb); h += 2. * peb * sqrt(sat(1. - pb.x * 3.));
  for (int L = 0; L < 2; L++) { float sc = float(36 + 22 * L); vec4 b = grBlade(uv * sc, vec2(sc), 5 + L * 7, 1.6, 1.2 * sc / 2000.); // thatch: dead blades lying flat
    float k = b.x * (.45 + .55 * max(1. - patchy, bare)), hh = .9 + .3 * float(L) + .4 * (1. - b.w * b.w);
    c = mix(c, mix(vec3(.3, .24, .12), vec3(.2, .18, .13), fract(b.z * 5.1)) * (.65 + .45 * b.z), k); h = mix(h, max(h, hh), k); r = mix(r, .85, k); }
  vec3 cl = vorv(uv * 50., vec2(50), 41, .7); float an = atan(cl.y, cl.x), rr = length(cl.xy);
  float clover = (1. - ss(.0, .03, rr - .2 * (.55 + .45 * abs(cos(1.5 * an))))) * step(.6, cl.z) * ss(.5, .62, fbm(uv * 5., vec2(5), 3, 43));
  c = mix(c, vec3(.05, .15, .03) * (1. + .3 * cl.z) * (.8 + .4 * ss(.0, .15, rr)), clover); h = max(h, 4. * clover); r = mix(r, .72, clover);
  for (int L = 0; L < 5; L++) { float sc = float(48 + 24 * L), hw = (1.8 - .2 * float(L)) * sc / 2000.; vec4 b = grBlade(uv * sc, vec2(sc), 33 + L * 5, 1.9, hw); // living blades
    float bz = fract(b.z * 13.7); b.x *= step(bz, mix(.6, 1., patchy) * (1. - .75 * bare));
    float hh = 1.6 + .45 * float(L) + 1.2 * fract(b.z * 3.7) + .35 * (1. - b.w * b.w) + .4 * b.y; // the tip stands proud of the base
    vec3 gc = mix(vec3(.2, .47, .045), vec3(.11, .4, .055), fract(b.z * 11.3)); // yellow-green to blue-green, blade by blade
    gc = mix(gc, vec3(.3, .3, .09), dry * ss(.3, .9, fract(b.z * 5.7)) * .75);
    gc *= (.45 + .75 * (b.y * .5 + .5)) * (.65 + .7 * fract(b.z * 17.9)) * (1. + .12 * (1. - abs(b.w))); // shaded base, lit tip, midrib
    if (hh > h) { c = mix(c, gc, b.x); r = mix(r, .84 + .1 * fract(b.z * 23.1), b.x); h = mix(h, hh, b.x); } }
  // tussocks and hollows, 2 cm to a metre: what the hills read by from afar, the speckle strong as the eye sees it in linear light
  float clump = multi(uv, 61), tuft = .1 * vn(uv * 30., vec2(30), 69) + .35 * vn(uv * 60., vec2(60), 63) + .55 * vn(uv * 150., vec2(150), 67);
  c *= vec3(1.08, 1.16, 1.) * (1. + .12 * clump) * pow(.42 + 1.1 * tuft, 2.8) * (.9 + .2 * ss(-.15, .15, sin(uv.x * 2. * PI))); // mowing bands a metre wide
  h += 3. * clump + 1.5 * tuft;`,
  `vec4 grBlade(vec2 p, vec2 n, int s, float len, float wid) { // one blade per cell (p in cells), wid its half width in cells;
  // x coverage, y along it (-1 base .. 1 tip, tapered to a point), z its hash, w across (-1..1)
  vec2 i = floor(p), f = fract(p); vec4 best = vec4(0, 0, 0, 1); float e = .7 * TX * n.x;
  for (int y = -1; y <= uOne; y++) for (int x = -1; x <= uOne; x++) { vec2 o = vec2(x, y), c = wr(i + o, n); vec4 k = hr(c, s);
    float a = k.x * 2. * PI; vec2 d = vec2(cos(a), sin(a)), q = f - o - k.yz;
    float l = len * (.6 + .4 * k.w), al = dot(q, d) / l * 2., ac = dot(q, vec2(-d.y, d.x)) - .3 * (k.w - .5) * l * al * al;
    float w = wid * (.7 + .6 * fract(k.w * 7.3)) * min(1., 1.6 * (1. - al)), cov = (1. - ss(w - e, w + e, abs(ac))) * (1. - ss(.85, 1., abs(al)));
    if (cov > best.x) best = vec4(cov, al, k.w, clamp(ac / max(w, 1e-4), -1., 1.)); }
  return best; }`);

// materials: name, texture set, shader options (see mat.js)
mat('sand', 'sand', { detail: .35, macro: .1 }); // no vary: a turned copy would cross the ripples
mat('mulch', 'mulch', { detail: .2, macro: .1, vary: 1 });
mat('rubberCrumb', 'rubberCrumb', { color: 0xa8402f, detail: .2, macro: .06, vary: 1 });
mat('grassGround', 'grassGround', { detail: .2, macro: .3 }); // no vary: blending two copies halves the grain's contrast

set('fieldTurf', 4, 512, 512, .94, .18, `
  float bed = fbm(uv * 8., vec2(8), 3, 113), roots = vn(uv * 150., vec2(150), 127), fine = vn(uv * 380., vec2(380), 139);
  c = mix(vec3(.04, .10, .015), vec3(.067, .17, .024), ss(.18, .85, bed)) * (.86 + .24 * roots + .06 * fine);
  float thatch = ss(.75, .94, vn(uv * 110., vec2(110), 149)) * ss(.62, .8, bed);
  c = mix(c, vec3(.065, .077, .021), thatch * .18);
  h = 1.6 * bed + .7 * roots + .2 * fine; r = .94; t = 1.;`);
mat('fieldTurf', 'fieldTurf', { detail: .12, macro: .18, grime: .12 });
