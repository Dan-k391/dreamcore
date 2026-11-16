// Plastics, rubber and glass: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

// Gelcoat over glass fibre (slides, pool fittings): a deep gloss with the spray's orange peel, the lay-up's long waviness and
// the chopped-strand mat printing through, chalky sun-faded patches, fine scuffs where people slide, and the odd star crack.
set('gelcoat', 1, 512, 512, .07, 0, `
  float big = fbm(uv * 6., vec2(6), 3, 2); // waviness of the mould and the lay-up, about 15 cm
  float peel = gn(uv * 110., vec2(110), 4) * .6 + gn(uv * 190., vec2(190), 6) * .4; // orange peel of the sprayed coat, 5-9 mm
  float fb = fibres(uv * 28., vec2(28), 1, .9, .05) * .6 + fibres(uv * 44. + .37, vec2(44), 3, .85, .07) * .4; // strand mat, 2-3 cm strands
  float slide = ss(.45, .75, fbm(uv * 3., vec2(3), 4, 8)), scr = .6 * scratches(uv, 5., .2, .35, 11) * slide; // fine scuffs where bodies slide
  float chalk = ss(.52, .78, fbm(uv * 2., vec2(2), 5, 21) + .12 * (fbm(uv * 16., vec2(16), 3, 22) - .5)); // sun-faded, oxidised to a chalky bloom
  float crk = cracks(uv, 4., .25, .1, 31), mv = multi(uv, 41);
  c = vec3(.86) * (1. + .05 * mv); c = mix(c, vec3(.93), .14 * chalk + .06 * scr); c *= 1. - .35 * crk;
  t = 1. - .2 * chalk - .08 * scr;
  h = .05 * (big - .5) * 2. + .012 * (peel - .5) * 2. + .008 * fb - .015 * scr - .02 * crk - .006 * chalk;
  r = .03 + .012 * peel + .006 * mv + .16 * chalk * (.7 + .3 * fb) + .12 * scr + .03 * crk;`);
// Lacquered panelling (a hotel's lift lobby, a bar's back wall): many sprayed and rubbed-down coats over a close-grained panel, a deep
// even gloss. Only a fine orange peel in the last coat, the panel's grain faintly telegraphing through it (up the panel, along v), and
// the polish a shade duller here and there; no chalk, no blotches in the colour.
set('lacquer', 1, 512, 512, .09, 0, `
  float peel = gn(uv * 140., vec2(140), 4) * .6 + gn(uv * 230., vec2(230), 6) * .4; // the last coat's orange peel, 4-7 mm
  float grain = gn(vec2(uv.x * 160., uv.y * 4.), vec2(160., 4.), 7); // close grain under the coats, running up the panel
  float dull = ss(.55, .8, fbm(uv * 3., vec2(3), 4, 9)), mv = multi(uv, 41);
  c = vec3(.86) * (1. + .015 * mv + .02 * (grain - .5)); t = 1.;
  h = .006 * (peel - .5) * 2. + .004 * (grain - .5) * 2.;
  r = .07 + .012 * peel + .04 * dull;`);
// Hard moulded plastic (play equipment): rotomoulded polyethylene, semi-gloss, gentle sink marks and pinholes, paler and chalkier
// where the sun has had it, polished by hands where it is gripped, and whitened along scratches where the plastic was stressed.
set('hardPlastic', 1, 512, 512, .36, 0, `
  float mv = multi(uv, 3), sink = fbm(uv * 10., vec2(10), 3, 17), peel = gn(uv * 220., vec2(220), 6) * .6 + gn(uv * 120., vec2(120), 8) * .4;
  float fade = ss(.5, .85, fbm(uv * 2., vec2(2), 5, 4)), grip = ss(.55, .78, fbm(uv * 4., vec2(4), 4, 9)) * (1. - fade);
  float scr = scratches(uv, 3., .15, .03, 13) * ss(.45, .7, fbm(uv * 3., vec2(3), 3, 23)), pin = pits(uv, 40., 1., .12, 19);
  float flow = .5 + .5 * sin(2. * PI * (uv.x * 9. + .6 * fbm(uv * 3., vec2(3), 3, 31))); // faint flow lines from the mould's fill
  c = vec3(.82) * (1. + .02 * mv); c = mix(c, vec3(.9), .05 * fade);
  t = 1. - .1 * fade - .15 * pin;
  h = .02 * (sink - .5) * 2. + .008 * (peel - .5) * 2. - .006 * scr - .04 * pin;
  r = .34 + .02 * mv + .12 * fade - .12 * grip + .1 * scr + .08 * pin + .03 * flow;`);
// PVC sheet (inflatables), panels 0.5 m wide welded at their edges: each panel pillows out between its welds, puckers into
// creases beside them, and has a slightly glossier, embossed weld band with a raised lip either side.
set('pvc', .5, 512, 512, .16, 0, `
  float du = min(uv.x, 1. - uv.x) * 500., weld = 1. - ss(3.5, 4.5, du), lip = 1. - ss(0., 1.2, abs(du - 5.));
  float pk = exp(-du / 35.) * ridged(uv * vec2(4., 40.), vec2(4., 40.), 3, 5); // puckered creases running off the weld
  float slack = ridged(uv * vec2(3., 2.), vec2(3., 2.), 4, 7), mv = multi(uv, 9), emb = gn(uv * 150., vec2(150), 11);
  float handled = ss(.5, .8, fbm(uv * 4., vec2(4), 4, 13));
  h = 2. * sin(PI * uv.x) + .15 * pk + .2 * slack + .01 * sin(uv.y * 2. * PI * 160.) + .2 * lip + weld * (.03 * sin(uv.y * 166. * 2. * PI) - .15) + .004 * emb;
  c = vec3(.86) * (1. + .03 * mv) * mix(vec3(1), vec3(.97, .93, .8), weld); t = 1.;
  r = .13 + .03 * mv - .03 * weld + .1 * handled + .02 * emb;`);
// Moulded black rubber: a fine moulded stipple and the odd air bubble, waxy grey bloom risen into the recesses and over
// patches, and lighter, glossier smears where it has been scuffed. Dark, so it is read by its highlights.
set('rubber', .5, 512, 512, .66, 0, `
  vec4 v = vor(uv * 160., vec2(160), 3, .9); float stip = 1. - ss(.0, .55, v.x); // moulded stipple, 3 mm
  float mv = multi(uv, 5), bub = pits(uv, 20., 1.6, .4, 7), scr = .7 * scratches(uv, 4., .3, .45, 9) * ss(.4, .7, fbm(uv * 3., vec2(3), 3, 15));
  float bloom = ss(.5, .85, fbm(uv * 5., vec2(5), 4, 21)) * (.2 + .8 * (1. - stip)) + .8 * bub; // wax blooms out and gathers low
  c = vec3(.066, .063, .058) * (1. + .12 * mv); c = mix(c, vec3(.15, .145, .135), sat(.4 * bloom)); c = mix(c, vec3(.09), .4 * scr);
  h = .07 * stip + .1 * (fbm(uv * 20., vec2(20), 3, 3) - .5) - .25 * bub - .01 * scr;
  r = .58 + .08 * mv + .1 * stip + .3 * sat(bloom) - .2 * scr; t = 1.;`);
// Polyester powder coat on play steelwork: one even semi-gloss colour with a fine orange peel, small chips down to the zinc
// gathered where it gets knocked, and dull scuff marks there. No rust: the steel under it is galvanised.
set('powderCoat', 1, 512, 1024, .3, .2, `
  float peel = gn(uv * 240., vec2(240), 3) * .6 + gn(uv * 150., vec2(150), 5) * .4, mv = multi(uv, 7); // orange peel, 4-7 mm
  float knock = ss(.55, .8, fbm(uv * 3., vec2(3), 4, 11));
  float chp = ss(.15, .5, pits(uv, 9., 7., .04 + .5 * knock, 13)), scr = scratches(uv, 3., .2, .05, 17) * knock;
  c = vec3(.8) * (1. + .012 * mv) * (.99 + .02 * peel); c = mix(c, vec3(.86), .25 * scr); c = mix(c, vec3(.5, .51, .52), chp);
  t = (1. - chp) * (1. - .15 * scr); m = .85 * chp;
  h = .012 * (peel - .5) * 2. - .07 * chp - .004 * scr;
  r = .28 + .03 * peel + .015 * mv + .2 * scr + .12 * chp;`);
// The slide's chute, its own UVs mapped once over it (u 0 at the deck to 1 at the exit, about 2.5 m; v the profile, the bed's
// centre at .5, 2 m across): fine scuffs streaming down the bed, dulled where people sit at the top and the exit, the top
// sun-faded and the lips' crowns chalkier. Periods across u are 2.5x those across v so the grain is round on the chute.
set('slideChute', 2, 1024, 2048, .3, 0, `
  float d = abs(uv.y - .5) * 2., bed = 1. - ss(.17, .23, d); // metres round the profile from the bed's centre
  float mv = multi(uv, 3), sink = fbm(uv * vec2(25., 10.), vec2(25., 10.), 3, 17), peel = gn(uv * vec2(500., 200.), vec2(500., 200.), 6);
  float str = ss(.62, .9, gn(uv * vec2(6., 700.), vec2(6., 700.), 21)) * ss(.35, .65, fbm(uv * vec2(10., 40.), vec2(10., 40.), 3, 23)); // streaks down the run
  float scr = max(str, .7 * scratches(uv, 4., .15, .25, 25)) * bed * (1. - .6 * ss(.1, .2, d));
  float sit = bed * (1. - ss(.08, .16, uv.x) + ss(.8, .9, uv.x)) * (.6 + .4 * fbm(uv * vec2(20., 8.), vec2(20., 8.), 3, 27));
  float fade = (1. - ss(.0, .55, uv.x)) * (.5 + .3 * fbm(uv * vec2(8., 3.), vec2(8., 3.), 3, 29)) + .6 * ss(.36, .48, d) * (1. - ss(.52, .62, d));
  c = vec3(.82) * (1. + .02 * mv); c = mix(c, vec3(.92), .2 * fade + .3 * scr + .06 * sit);
  t = 1. - .25 * fade - .2 * scr;
  h = .02 * (sink - .5) * 2. + .006 * (peel - .5) * 2. - .006 * scr;
  r = .2 + .02 * mv + .1 * fade + .22 * scr + .2 * sit;`);
// The roundabout's moulded deck, its own UVs in metres centred on the hub (1.8 m covers it once): raised anti-slip studs on a
// 12 mm hexagonal grid over a fine grit, the studs worn down, scuffed matt and paler in the ring where feet land and push off,
// grit packed between them there.
set('deckTread', 1.8, 1024, 2048, .5, .3, `
  vec2 q = uv * vec2(150., 173.); float row = floor(q.y); q.x += .5 * mod(row, 2.); vec2 f = fract(q) - .5; f.x *= 12.; f.y *= 1.8 / 173. * 1000.; float dm = length(f); // mm from the stud's axis
  vec2 p = (fract(uv + .5) - .5) * 1.8; float rad = length(p); // metres from the hub
  float feet = ss(.3, .45, rad) * (1. - ss(.72, .8, rad)) * (.5 + .5 * ss(.35, .65, fbm(uv * 6., vec2(6), 4, 5))), wear = sat(feet * 1.2);
  float stud = sqrt(sat(1. - dm * dm / 6.25)), grit = gn(uv * 900., vec2(900), 7), mv = multi(uv, 9);
  float scr = scratches(uv, 4., .2, .3, 11) * feet;
  c = vec3(.8) * (1. + .02 * mv) * (.97 + .03 * grit); c = mix(c, vec3(.88), .25 * wear * stud + .15 * scr); c *= 1. - .25 * wear * (1. - stud) * ss(.4, .7, grit);
  t = 1. - .2 * wear * stud - .1 * scr;
  h = (1.1 - .5 * wear) * stud + .05 * grit - .004 * scr;
  r = .48 + .04 * mv + .08 * grit - .15 * wear * stud + .2 * wear * (1. - stud) + .15 * scr;`);
// A ball-pit ball, blow-moulded polyethylene, its own sphere UVs over the whole set (one ball): a soft parting line round the
// equator, the gate pip at one pole, fine handling scuffs, glossy.
set('pitBall', 1, 256, 512, .25, 0, `
  float sm = abs(uv.y - .5) * 314., seam = exp(-sm * sm / 2.), pip = exp(-pow((1. - uv.y) * 314. / 2.5, 2.)); // mm from the parting line (0.2 m ball: 0.31 m pole to pole); heights are a third of true, the set being 1 m
  float scr = scratches(uv, 3., .12, .25, 5), mv = multi(uv, 7);
  c = vec3(.85) * (1. + .015 * mv); c = mix(c, vec3(.92), .15 * scr); t = 1. - .1 * scr;
  h = .1 * seam + .15 * pip - .002 * scr;
  r = .2 + .02 * mv + .15 * scr + .1 * seam;`);
// Float glass: nearly invisible itself, read by its reflections: the faint roller wave of the float line, wiped arcs and
// fingerprints that catch the light, and specks of dust (untinted, so they stay pale on any glass).
set('glass', 1, 512, 512, .06, 0, `
  vec3 nv = vorv(uv * 3., vec2(3), 1, 1.); float d = length(nv.xy);
  float wipe = (.5 + .5 * sin(d * 120.)) * (1. - ss(.25, .5, d)) * step(.5, nv.z) * fbm(uv * 30., vec2(30), 3, 5); // wiped arcs
  vec4 fp = vor(uv * 25., vec2(25), 8, 1.); float print = step(.82, fp.z) * (1. - ss(.12, .3, fp.x)) * (.6 + .4 * gn(uv * 200., vec2(200), 9)); // fingerprints, 1-2 cm
  float dust = pits(uv, 60., 1., .08, 7);
  c = mix(vec3(.95), vec3(.3, .29, .27), step(.01, dust)); t = 1. - step(.01, dust);
  h = .1 * (fbm(uv * 4., vec2(4), 3, 2) - .5) + .002 * print;
  r = .03 + .14 * wipe + .2 * print + .5 * dust;`);

// materials: name, texture set, shader options (see mat.js)
mat('gelcoat', 'gelcoat', { color: 0x3aa6c8, detail: .05, macro: .12, wear: .25, edgeCol: [.75, .82, .84] });
mat('lacquer', 'lacquer', { detail: .02, macro: .02, grime: .05, wear: 0 });
mat('hardPlastic', 'hardPlastic', { color: 0xe8b820, detail: .3, macro: .1, wear: .3, edgeCol: [.85, .85, .82] });
mat('pvc', 'pvc', { color: 0xff8fb0, detail: .06, macro: .08 });
mat('powderCoat', 'powderCoat', { color: 0xb83228, detail: .08, macro: .04, grime: .12, wear: .2, edgeCol: [.6, .6, .58] });
mat('slideChute', 'slideChute', { color: 0xe8a21c, detail: .06, macro: .05, uv: [1, 1] });
mat('deckTread', 'deckTread', { color: 0xd8402c, detail: .15, macro: .06, dirt: .3, uv: [1, 1] });
mat('pitBall', 'pitBall', { color: 0xffffff, detail: .02, macro: 0, grime: 0, uv: [1, 1] });
mat('rubber', 'rubber', { detail: .3, sheen: .15, dirt: .3, macro: .1, wear: .4, edgeCol: [.1, .095, .09] });
// glass: the dark tint is the little light it scatters; it is drawn premultiplied (one, one minus alpha: CustomBlending with
// OneFactor and OneMinusSrcAlphaFactor) so its reflections keep their full strength while what is behind shows through
mat('glass', 'glass', { color: 0x2e3d36, transparent: true, opacity: .12, depthWrite: false, blending: 5, blendSrc: 201, blendDst: 205 });
mat('frostedGlass', 'glass', { color: 0xf2f2ec, roughness: .55, detail: .35, transparent: true, opacity: .78 });
