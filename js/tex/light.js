// Light fittings (for an emitter, t is the emission pattern): the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

// A 600 mm recessed troffer, u across it (two T8 tubes along v): painted steel door frame with a rolled edge, a K12-style lens of
// 4 mm pyramids that images each tube as a bright dot per prism, a reflector that falls off toward the frame, and what years in a
// ceiling leave on top of the lens: dust drifted into the gutter, gnats, two flies and a moth seen softened through it.
set('troffer', .6, 512, 1024, .25, 0, `
  vec2 p = fract(uv * 150.) - .5, ap = abs(p); // 4 mm prisms
  float e = min(uv.x, 1. - uv.x) * 600.; // mm to the frame's outer edge
  float fr = 1. - ss(21.5, 22., e), gap = ss(21.8, 22.2, e) * (1. - ss(23., 28., e)); // the 22 mm frame (its own ring of geometry), and the shadow line where the lens sits in it
  float d1 = (uv.x - .28) * 600., d2 = (uv.x - .72) * 600., dn = abs(d1) < abs(d2) ? d1 : d2; // mm from each tube's axis
  float glow = exp(-d1 * d1 / 6050.) + exp(-d2 * d2 / 6050.), core = exp(-d1 * d1 / 392.) + exp(-d2 * d2 / 392.); // reflector glow (55 mm), the tube's own image (14 mm)
  float fall = .5 + .5 * ss(24., 120., e); // the reflector's side wall shades the lens next to the frame
  float face = (ap.x > ap.y ? -sign(p.x) * sign(dn) : 0.) * ss(0., 30., abs(dn)); // +1: a facet turned toward the nearer tube
  float spark = exp(-dot(p, p) * 18.) * (core + .35 * glow); // each prism's apex catches the tube
  float wob = .04 * sin(2. * PI * uv.y + 1.3) * (d1 < d2 ? 1. : -1.); // the two tubes not quite equal, each brighter at one end of its run
  float dust = ss(.45, .85, fbm(uv * 6., vec2(6), 4, 7)), gut = 1. - ss(20., 90., e); // dust settles on the lens, most in the gutter by the frame
  float gnat = ss(.8, .95, vn(uv * 300., vec2(300), 13)) * (.25 + .75 * gut) * ss(.3, .6, fbm(uv * 3., vec2(3), 2, 17));
  float bug = trBug(uv, vec2(.06, .21), .7, 9.) + trBug(uv, vec2(.91, .63), 2.1, 8.) + trBug(uv, vec2(.36, .86), -.4, 22.) * .8;
  float lens = clamp((.24 + .46 * glow + .22 * core) * fall * (.86 + .3 * face + wob) + .32 * spark, 0., 1.);
  lens *= (1. - .35 * dust * (.3 + .7 * gut)) * (1. - .45 * gnat) * (1. - .7 * min(bug, 1.));
  float mac = multi(uv, 3);
  vec3 ivory = mix(vec3(.78, .75, .66), vec3(.77, .68, .49), .4 * glow); // the acrylic yellows over the tubes
  vec3 lc = mix(ivory, vec3(.5, .45, .37), .5 * dust * (.4 + .6 * gut) + .4 * gnat);
  lc *= 1. - .22 * core - .08 * glow; // the tubes and the reflector's shade behind the sheet, seen through it when the fitting is dead
  lc = mix(lc, vec3(.07, .055, .045), .85 * min(bug, 1.));
  float fh = 1.7 + .02 * vn(uv * 400., vec2(400), 5); // the frame's folds are geometry: only the enamel's orange peel
  float lh = .9 * min(.5 - max(ap.x, ap.y), .44) + .25 * fbm(uv * 3., vec2(3), 3, 9) + .03 * dust - .4 * gap; // prisms, the sheet's slight bow
  h = mix(lh, fh, fr);
  t = mix(lens * (1. - .75 * gap), .06 * (1. - ss(17., 21., e)) + .1 * ss(17., 21.5, e), fr); // the frame catches the lens's spill, most on its return
  c = mix(lc, vec3(.70, .68, .62) * (1. + .05 * mac), fr);
  r = mix(.16 + .25 * dust + .2 * gnat, .42 + .06 * mac, fr);`, `
  float trBug(vec2 uv, vec2 at, float a, float L) { // a dead insect lying on the lens (L mm long), softened by it
    vec2 d = (fract(uv - at + .5) - .5) * 600.; d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
    float body = exp(-pow(d.x / (L * .5), 2.) - pow(d.y / (L * .17), 2.));
    vec2 w = vec2(d.x + L * .05, abs(d.y) - L * .3);
    return body + .5 * exp(-pow(w.x / (L * .35), 2.) - pow(w.y / (L * .22), 2.)); }`);
// Opal acrylic over a direct-lit LED board: hot spots on a 50 mm grid, each LED binned a little differently and each strip on its
// own driver, the sheet's uneven thickness and its milky particle mottle, a faint yellowing and dust.
set('opal', .5, 512, 256, .3, 0, `
  vec2 q = uv * 10., id = floor(q), p = fract(q) - .5;
  float lv = (.88 + .22 * hf(id, 3)) * (.95 + .1 * hf(vec2(id.y, 7.), 5)), led = exp(-dot(p, p) * 7.) * lv;
  float mot = fbm(uv * 4., vec2(4), 4, 1), grain = vn(uv * 250., vec2(250), 5), dust = ss(.6, .9, fbm(uv * 8., vec2(8), 3, 11));
  t = (.44 + .34 * led + .2 * mot + .04 * (grain - .5)) * (1. - .12 * dust);
  c = mix(mix(vec3(.87, .85, .78), vec3(.86, .8, .66), .5 * mot), vec3(.6, .56, .48), .35 * dust);
  r = .26 + .06 * mot + .15 * dust; h = .015 * fbm(uv * 300., vec2(300), 2, 3) + .01 * dust;`);
// Acid-etched opal glass on a lamp's own UVs (u round it, v from the bottom, 0, to the neck, 1): the lamp inside lights it most at
// mid-height and least up by the neck in the fitter's shadow; the etch is thicker and thinner in soft patches, with a sugary grain.
set('globe', .1, 256, 256, .55, 0, `
  float mo = fbm(uv * 5., vec2(5), 4, 2), g = vn(uv * 120., vec2(120), 3), g2 = vn(uv * 60., vec2(60), 4), v = uv.y;
  float core = exp(-pow((v - .46) / .24, 2.)), neck = ss(.72, 1., v);
  t = (.3 + .7 * core + .05 * (1. - ss(0., .2, v))) * (1. - .5 * neck) * (1. + .12 * (mo - .5) + .06 * (g - .5) + .04 * (g2 - .5));
  c = mix(vec3(.88, .86, .8), vec3(.86, .82, .72), mo); r = .5 + .1 * g + .05 * mo; h = .015 * g + .01 * g2;`);
// T8 LED tubes, four around a 75 mm circumference per tile: SMD LEDs on a 10 mm pitch seen through the frosted half, brightest
// facing out and falling around the cylinder, a clipped seam, the aluminium housing behind.
set('ledTube', .3, 512, 512, .25, 0, `
  float a = (fract(uv.y * 4.) - .5) * 2., hous = ss(.62, .7, abs(a)), seam = exp(-pow((abs(a) - .66) / .025, 2.));
  float lx = fract(uv.x * 30.) - .5, lv = .85 + .25 * hf(vec2(floor(uv.x * 30.), floor(uv.y * 4.)), 4);
  float spot = exp(-(lx * lx * 3. + a * a * 6.)) * lv, fr = fbm(uv * 20., vec2(20), 3, 6), mil = vn(uv * vec2(60., 8.), vec2(60., 8.), 9);
  t = mix((.72 + .1 * spot + .03 * (mil - .5)) * (.55 + .45 * cos(a * 1.3)) * (.98 + .04 * fr), .012, hous) * (1. - .8 * seam);
  c = mix(vec3(.86, .84, .78), vec3(.42, .42, .41) * (.9 + .2 * fr), hous); m = hous; r = mix(.3, .35 + .1 * fr, hous);
  h = .6 * hous - .3 * seam + .01 * fr;`);

// The flat toughened glass of a lantern over rows of LED optics, 25 mm pitch: each a moulded lens with a hot core and a ring where its
// collimator wall catches the LED, white reflector between them, road dust on the glass.
set('ledOptic', .2, 256, 256, .15, 0, `
  vec2 q = uv * 8., id = floor(q), p = fract(q) - .5; float d = length(p);
  float lv = .88 + .24 * hf(id, 3), lens = 1. - ss(.34, .38, d), core = exp(-d * d * 70.) * lv, ring = exp(-pow((d - .28) / .035, 2.)) * lens;
  float dust = ss(.5, .9, fbm(uv * 3., vec2(3), 4, 5)), mo = vn(uv * 40., vec2(40), 7);
  t = (.03 + .92 * core + .14 * lens + .16 * ring) * (1. - .25 * dust);
  c = mix(mix(vec3(.84, .84, .82), vec3(.9, .89, .85), lens), vec3(.6, .57, .52), .4 * dust);
  r = mix(.38, .1, lens) + .25 * dust + .04 * mo; h = .45 * lens * sqrt(max(0., 1. - d * d / .13)) + .08 * ring;`);
// A neon tube's glass on its own UVs (u along it in metres, v round it): the discharge a touch uneven along the tube, faint draw lines.
set('neon', .2, 128, 128, .08, 0, `
  float g = vn(uv * vec2(5., 1.), vec2(5., 1.), 3), dl = vn(uv * vec2(1., 60.), vec2(1., 60.), 6);
  t = .84 + .14 * g; c = vec3(.92, .9, .86); r = .06 + .04 * dl; h = .01 * dl;`);
// An underwater lamp's lens, 240 mm across (UVs 0-1 across it): a ring of twelve LEDs and one in the middle under a clear centre,
// concentric Fresnel flutes outside them, the flat rim the face ring clamps.
set('poolLens', .24, 512, 512, .08, 0, `
  vec2 p = (uv - .5) * 240.; float d = length(p), a = atan(p.y, p.x), led = exp(-d * d / 60.);
  for (int i = 0; i < 12; i++) { vec2 o = 46. * vec2(cos(float(i) * PI / 6.), sin(float(i) * PI / 6.)); led += exp(-dot(p - o, p - o) / 40.); }
  float fl = .5 + .5 * cos(d * PI / 3.), zone = ss(64., 70., d) * (1. - ss(108., 112., d)), sc = vn(uv * 30., vec2(30), 4);
  t = (.1 + .7 * min(led, 1.) + .3 * exp(-d * d / 4000.) + .16 * fl * zone) * (1. - ss(112., 118., d) * .85) * (.96 + .08 * sc);
  c = vec3(.86, .9, .9); r = .05 + .1 * ss(110., 118., d) + .03 * sc; h = .4 * fl * zone + .2 * (1. - ss(60., 64., d)) * (1. - led * .5);`);

// materials: name, texture set, shader options (see mat.js)
mat('troffer', 'troffer', { color: 0x6a6a66, emit: [0xffd29a, 6.6], fine: .004 }); // fine: the 4 mm prisms fade out down a room instead of fringing
mat('trofferOff', 'troffer', { color: 0xc4c0b2, fine: .004 }); // light tint: the dark tubes show through the lens, not stripes
mat('opalPanel', 'opal', { color: 0x9a9a96, emit: [0xffd29a, 4.5], fine: .05 });
mat('ledTube', 'ledTube', { color: 0x9a9a96, emit: [0xffd09a, 8], fine: .01 }); // brighter: the housing third of each tube is dark
mat('frostedGlobe', 'globe', { color: 0x9a9a96, emit: [0xffc684, 2.3], fine: .002 }); // lower: the volume falloff, not the tone curve, shapes it
mat('backlitPanel', 'opal', { color: 0x9a9a96, emit: [0xffd8a8, 3.2], fine: .05 });
mat('ledOptic', 'ledOptic', { color: 0x9a9a96, emit: [0xffd29a, 5], fine: .01 });
mat('neonTube', 'neon', { color: 0x9a9a96, emit: [0xffa860, 5], fine: .002 });
mat('poolLens', 'poolLens', { color: 0x9a9a96, emit: [0xffd6a0, 5], fine: .004 });
