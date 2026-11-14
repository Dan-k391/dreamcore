// Ceramic and stone: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

// Glazed wall tile, 100 mm, set in a 3 mm cement grout: straight-edged tiles each set a hair off the grid and a little out of
// plane, a pillowed glaze with its own waviness, tint and gloss per tile, limescale where water ran, a few crazed or chipped.
set('poolTile', 1, 1024, 1024, .1, .35, `
  Cell C = tiles(uv, vec2(10.), 0., 1); vec2 f = C.f + (C.r.xy - .5) * .004; // set by hand: each tile up to .2 mm off the grid
  float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) * 100.; // mm to the tile's edge
  float sh = jointH(e, 3., 2.5), face = jointMask(e, 3.); // the glaze rounds over 2.5 mm into the joint
  vec2 cc = f - .5; vec4 r2 = hr(C.id, 8);
  float sand = fbm(uv * 400., vec2(400), 3, 21);
  float hT = .14 * (1. - 4. * dot(cc, cc)) + cellTilt(C, .22) + .05 * (gn(f * 2.5 + r2.xy * 40., vec2(4096), 71) - .5) * 2. + .008 * (gn(uv * 900., vec2(900), 3) - .5);
  float pin = pits(uv, 24., .9, .3, 81) * step(.5, r2.z); // pinholes where the glaze crawled in the kiln
  h = mix(-1.05 - .25 * (1. - sat(e / 1.5)) + .2 * sand, hT - .15 * pin, sh); // grout: a shallow U a millimetre down
  vec3 glaze = cellCol(vec3(.875, .88, .865), C.r, .03) * (.985 + .03 * gn(f * 3. + r2.yz * 30., vec2(4096), 73));
  glaze *= 1. - .22 * (1. - sh); // the glaze thins over the shoulder: each tile reads framed, also from across the hall
  glaze *= 1. - .3 * step(.988, vn(uv * 700., vec2(700), 31)) - .25 * pin; // specks fired into it
  float dirt = fbm(uv * 30., vec2(30), 4, 41), lime = fbm(uv * 55., vec2(55), 3, 43), haze = ss(.55, .72, fbm(uv * 6., vec2(6), 4, 45));
  vec3 grout = vec3(.25, .245, .235) * (.8 + .3 * sand);
  grout = mix(grout, vec3(.18, .16, .13), ss(.48, .7, dirt) * .8);
  grout = mix(grout, vec3(.6, .6, .57), ss(.58, .76, lime) * .5);
  c = mix(grout, glaze, face);
  r = mix(.9, cellGloss(.055, C.r, .45) + .05 * (1. - sh) + .07 * haze + .3 * pin, face); t = face; // limescale haze dulls where water dried
  if (r2.w > .93) { vec4 v = vor(uv * 60. + .25 * vec2(gn(uv * 80., vec2(80), 51), gn(uv * 80., vec2(80), 53)), vec2(60), 55, 1.); // crazing
    float cr = (1. - ss(.0, .03, v.y - v.x)) * face; c *= 1. - .22 * cr; h -= .02 * cr; }
  float chp = chip(C, uv, 8., .045, 61); // a chipped corner, the buff body showing
  h = mix(h, -1. + .3 * vn(uv * 900., vec2(900), 63), chp); c = mix(c, vec3(.7, .64, .56), chp); r = mix(r, .85, chp); t *= 1. - chp;`);

// Glass mosaic, 25 mm chips on a 2 mm joint: rounded fire-polished edges, each chip its own shade, gloss and tilt, a few odd ones.
set('poolMosaic', .5, 1024, 1024, .12, .35, `
  Cell C = tiles(uv, vec2(20.), 0., 1); vec2 f = C.f + (C.r.xy - .5) * .03; // laid in sheets by hand: up to .4 mm off
  float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) * 25.;
  float sh = jointH(e, 2., 1.2), face = jointMask(e, 2.); vec2 cc = f - .5; vec4 r2 = hr(C.id, 7);
  float hT = .1 * (1. - 4. * dot(cc, cc)) * (.4 + 1.2 * r2.x) + cellTilt(C, .16) + .03 * (gn(f * 2. + r2.yz * 40., vec2(4096), 9) - .5);
  h = mix(-.8 - .2 * (1. - sat(e)) + .15 * fbm(uv * 300., vec2(300), 3, 7), hT, sh);
  vec3 tile = cellCol(vec3(.86, .87, .85), C.r, .06) * (.95 + .07 * vn(uv * 120., vec2(120), 9)); // glass: cloudy inside
  tile *= r2.w < .05 ? vec3(.86, .9, .93) : r2.w > .96 ? vec3(1.04, 1.02, .97) : vec3(1.); // the odd chip from another batch
  c = mix(vec3(.58, .56, .52) * (.85 + .3 * fbm(uv * 40., vec2(40), 3, 11)), tile, face);
  r = mix(.85, cellGloss(.06, C.r, .5) + .05 * (1. - sh), face); t = face;`);

// Polished 300 mm tiles, cream and Nero chequer, butt-jointed. Cream: grey fracture veins in soft clouds. Nero: a deep
// black read by its polish, with a few crisp calcite seams of 1.5-6 mm and sub-mm hairlines branching off near them.
set('marble', 1.2, 2048, 1024, .08, .3, `
  Cell C = tiles(uv, vec2(4.), 0., 1); float dark = mod(C.id.x + C.id.y, 2.);
  float bev = jointH(C.e, .8, 1.2), face = jointMask(C.e, .8);
  vec2 q = C.f * 1.2 + C.r.xy * 17.; // every tile cut from a different part of the block (1 = 250 mm)
  float cloud = fbm(q * 2., vec2(4096), 5, 13), drift = fbm(q * .7, vec2(4096), 3, 15);
  // veins are healed fractures: a branching network, each line narrowing along its length (cracks() in blocks.js)
  float v1 = cracks(uv, 4., 2.2, .6, 61), v2 = cracks(uv, 12., .7, .7, 67), v3 = cracks(uv, 30., .35, .55, 69);
  vec3 cream = vec3(.80, .76, .68) * (.92 + .12 * cloud) * (.9 + .16 * st(drift, 2.)) * (1. + .05 * (C.r.z - .5));
  cream = mix(cream, vec3(.62, .6, .56), ss(.52, .68, fbm(q * 1.4 + 3., vec2(4096), 5, 63)) * .3); // grey clouds of the same minerals, unfocused
  cream = mix(cream, vec3(.47, .45, .42), v1 * .7); cream = mix(cream, vec3(.6, .57, .52), v2 * .5); cream = mix(cream, vec3(.64, .61, .56), v3 * .4);
  float seam = cracks(uv, 5., 5., .45, 21), hair1 = cracks(uv, 14., 1.2, .5, 27), hair2 = cracks(uv, 35., .5, .4, 31);
  vec3 black = vec3(.013, .0125, .014) * (.8 + .45 * cloud);
  black = mix(black, vec3(.3, .29, .28), hair2 * .45); black = mix(black, vec3(.5, .49, .46), hair1 * .6);
  black = mix(black, vec3(.62, .6, .55) * (.8 + .25 * vn(uv * 600., vec2(600), 35)), seam);
  c = mix(mix(cream, black, dark), mix(vec3(.3, .29, .27), vec3(.06), dark), 1. - face);
  h = -.4 * (1. - bev) + cellTilt(C, .05) * bev - .006 * seam * dark;
  float scr = scratches(uv, 5., .12, .5, 71) * ss(.45, .65, fbm(uv * 5., vec2(5), 3, 73)); // fine scratches where people walk most
  r = mix(.7, .05 + .06 * st(fbm(uv * 3., vec2(3), 4, 75), 2.) + .1 * scr + .02 * (C.r.w - .5) + .04 * seam * dark, face); t = 0.;`);

// Ground terrazzo: marble chips at three sizes (many 2-3 mm, fewer 5-8 mm, a few 15-22 mm), angular, turned every way, in a
// cement matrix with its sand and pinholes; ground flat and polished, chips a little glossier; brass divider strips every metre.
set('terrazzo', 1, 1024, 512, .12, .2, `
  vec3 mx = vec3(.7, .67, .62) * (.94 + .1 * fbm(uv * 20., vec2(20), 4, 1)) * (.93 + .14 * vn(uv * 900., vec2(900), 3));
  mx = mix(mx, vec3(.35, .33, .3), step(.985, vn(uv * 700., vec2(700), 5)) * .7); // dark grains in the sand
  c = mx; float ch = 0.;
  terrazzoLayer(uv, 40., 15., 22., .45, 11, c, ch);
  terrazzoLayer(uv, 110., 5., 8., .6, 23, c, ch);
  terrazzoLayer(uv, 300., 2., 3., .5, 37, c, ch);
  float pin = pits(uv, 50., .7, .1, 41) * (1. - ch); // air pinholes in the matrix
  c = mix(c, c * .7, pin);
  vec2 ed = min(uv, 1. - uv) * 1000.; float brass = aa(min(ed.x, ed.y), 1.5);
  h = (.008 * ch - .25 * pin) * (1. - brass);
  r = mix(.17 + .06 * fbm(uv * 8., vec2(8), 3, 17), .09, ch); r = mix(r, .7, pin);
  c = mix(c, vec3(.82, .6, .32) * (.8 + .2 * fbm(uv * 60., vec2(60), 3, 43)), brass); r = mix(r, .3, brass); m = brass;
  t = (1. - ch) * (1. - brass);`,
  `vec3 terrazzoCol(float k, float v) { vec3 p = k < .3 ? vec3(.86, .84, .8) : k < .58 ? vec3(.45, .45, .44) : k < .62 ? vec3(.06, .06, .065) : k < .78 ? vec3(.58, .34, .22) : k < .9 ? vec3(.33, .42, .36) : vec3(.74, .62, .48); return p * (.85 + .3 * v); }
  void terrazzoLayer(vec2 uv, float k, float r0, float r1, float prob, int s, inout vec3 c, inout float on) { // one size of chip: r0-r1 mm across
    vec3 v = vorv(uv * k, vec2(k), s, .6); vec2 p = v.xy * 1000. * SZ / k; float id = v.z * 251.;
    float a = v.z * 6.283, R = .5 * mix(r0, r1, pow(hf(vec2(id, 1.), s), 2.));
    vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * p; q.x *= .75 + .5 * hf(vec2(id, 2.), s);
    float d = mix(max(max(abs(q.x), abs(q.y)), (abs(q.x) + abs(q.y)) * .74), length(q), .1); // angular, corners rounded by the grinding
    d += R * .2 * (vn(q / R * 2. + v.z * 50., vec2(4096), s + 2) - .5); // broken, not cut
    float k2 = aa(d, R) * step(1. - prob, hf(vec2(id, 3.), s)) * (1. - on);
    c = mix(c, terrazzoCol(hf(vec2(id, 4.), s), hf(vec2(id, 5.), s)) * (.93 + .12 * vn(q / R * 3., vec2(4096), s + 3)), k2); on = max(on, k2); }`);

// Limestone ashlar, 400 x 300 mm blocks in lime mortar: bedding bands 2-10 cm, shell fragments, sparse clustered pits stretched
// along the bed, claw tooling on some blocks, arrises softened and now and then chipped, each block its own tone.
set('limestone', 1.2, 1024, 1024, .82, .3, `
  Cell C = tiles(uv, vec2(3., 4.), .5, 3);
  float e = C.e + 2.5 * (gn(uv * 40., vec2(40), 7) - .5);
  float sh = jointH(e, 6., 3. + 6. * C.r.z), face = jointMask(e, 6.);
  float bed = uv.y * 30. + C.r.x * 50. + 2. * (fbm(uv * vec2(3., 4.), vec2(3., 4.), 3, 5) - .5); // bedding, 40 mm per unit
  float band = fbm(vec2(bed, C.f.x * .8), vec2(4096), 4, 9);
  vec3 stone = cellCol(vec3(.63, .57, .47), C.r, .05) * (.84 + .32 * st(band, 2.2)) * (1. + .04 * multi(uv, 13));
  stone = mix(stone, stone * vec3(.9, .93, .97), ss(.55, .65, fbm(vec2(bed * 2.5, C.f.x), vec2(4096), 3, 15)) * .5); // a greyer bed
  vec3 sv = vorv(uv * 40., vec2(40), 17, .8); vec2 sp = sv.xy * 30.; float sr = 1.5 + 5.5 * hf(vec2(sv.z * 251., 1.), 17); // shell fragments: crescents 3-14 mm
  float shell = aa(abs(length(sp) - sr), .5) * step(0., dot(sp, vec2(cos(sv.z * 40.), sin(sv.z * 40.)))) * step(.8, hf(vec2(sv.z * 251., 2.), 17));
  vec2 pu = uv + .003 * vec2(gn(uv * 90., vec2(90), 19) - .5, gn(uv * 90., vec2(90), 20) - .5);
  float pit = pits(vec2(pu.x, pu.y * 2.), 20., 9., .5, 21) * ss(.45, .6, fbm(uv * 6. + C.r.y * 3., vec2(6), 4, 23)); // irregular, stretched along the bed, in clusters
  float tool = step(.5, C.r.w) * .05 * sin(dot(C.f * C.mm, vec2(.94, .34)) * 1.1) * (.5 + .5 * vn(C.f * 8., vec2(4096), 25)); // claw tooling, 6 mm apart
  float chp = chip(C, uv, 22., .35, 27);
  float hF = (fbm(uv * 50. + C.r.xy * 9., vec2(50), 4, 29) - .5) + .2 * (vn(uv * 600., vec2(600), 28) - .5) + .8 * (fbm(C.f * 3. + C.r.zw * 9., vec2(4096), 3, 30) - .5) + tool + .06 * shell - 2. * pit - 3.5 * chp;
  h = mix(-4. + .25 * fbm(uv * 120., vec2(120), 3, 31), hF, sh);
  stone = mix(stone, vec3(.76, .71, .61), shell * .6); stone *= 1. - .45 * pit; stone = mix(stone, vec3(.7, .65, .56), chp * .7);
  stone = mix(stone, stone * vec3(.88, .9, .82), ss(.6, .74, fbm(uv * 7. + 3., vec2(7), 5, 33)) * .4);
  c = mix(vec3(.5, .47, .41) * (.85 + .3 * fbm(uv * 150., vec2(150), 3, 35)), stone, face);
  r = mix(.95, cellGloss(.8, C.r, .06) + .06 * fbm(uv * 20., vec2(20), 3, 37) + .1 * pit - .1 * shell, face); t = face;`);

// Travertine, 600 x 300 mm vein-cut blocks, honed: wavy cream, tan, ivory and rust bands, voids of 2-30 mm stretched along them
// and gathered in the porous beds, some open and dark, some filled flush with paler calcite and glossier.
set('travertine', 1.2, 1024, 1024, .5, .3, `
  Cell C = tiles(uv, vec2(2., 4.), .5, 4);
  float sh = jointH(C.e, 3., 2.), face = jointMask(C.e, 3.);
  float by = uv.y * 40. + C.r.x * 60. + 1.8 * (fbm(vec2(C.f.x * 1.5, uv.y * 3.) + C.r.yz * 5., vec2(4096), 4, 5) - .5); // wavy bedding, 30 mm per unit
  float b1 = fbm(vec2(by, C.f.x * .6 + C.r.w * 7.), vec2(4096), 5, 7), b2 = fbm(vec2(by * .35, C.f.x * .3), vec2(4096), 3, 9);
  vec3 col = mix(vec3(.78, .69, .54), vec3(.6, .47, .33), st(b1, 3.));
  col = mix(col, vec3(.86, .8, .68), ss(.56, .68, b2) * .8);
  col = mix(col, vec3(.55, .33, .18), ss(.62, .7, fbm(vec2(by * 1.7, C.f.x), vec2(4096), 3, 11)) * .5); // thin iron seams
  col = cellCol(col, C.r, .04);
  float por = ss(.45, .6, fbm(vec2(by * .8, C.f.x * .4), vec2(4096), 3, 13));
  vec2 pu = uv + .002 * vec2(gn(uv * 120., vec2(120), 15) - .5, gn(uv * 120., vec2(120), 16) - .5);
  float vug = max(pits(vec2(pu.x, pu.y * 4.), 10., 30., .5, 17), pits(vec2(pu.x, pu.y * 4.), 30., 8., .12, 18)) * por; // a few long voids, more short ones
  float fill = ss(.5, .56, vn(pu * vec2(24., 96.), vec2(24., 96.), 19)), open = vug * (1. - fill), filled = ss(.05, .2, vug) * fill;
  col = mix(col, vec3(.88, .83, .72), filled * .85); col *= 1. - .65 * ss(0., .5, open);
  c = mix(vec3(.6, .55, .45) * (.9 + .2 * fbm(uv * 150., vec2(150), 2, 21)), col, face);
  h = mix(-1.5, .25 * (fbm(uv * 30. + C.r.xy * 9., vec2(30), 4, 23) - .5) + cellTilt(C, .2) - 3. * open - .05 * filled, sh);
  r = mix(.9, cellGloss(.5, C.r, .1) + .06 * (fbm(uv * 12., vec2(12), 3, 25) - .5) - .22 * filled + .35 * ss(0., .3, open), face); t = face;`);

// Rock-faced ashlar in courses of 333 mm, blocks of 1-4 units: pillowed faces, recessed sandy mortar, each block its own tone
// and gloss, mineral grain, iron stains on some, rain streaks washed down from the joint above.
set('stoneWall', 2, 1024, 1024, .87, .25, `
  vec2 q = uv * vec2(10., 6.); float row = floor(q.y), fy = fract(q.y);
  float xu = q.x + floor(hf(vec2(1., row), 2) * 10.) + .5 * mod(row, 2.), u0 = floor(xu), L = u0 - 3., R = u0 + 4.;
  for (int k = 3; k >= 0; k--) { float b = u0 - float(k), bm = mod(b, 10.); if (hf(vec2(bm, row), 5) < .45 || mod(bm, 4.) == 0.) L = b; }
  for (int k = 4; k >= 1; k--) { float b = u0 + float(k), bm = mod(b, 10.); if (hf(vec2(bm, row), 5) < .45 || mod(bm, 4.) == 0.) R = b; }
  vec2 id = vec2(mod(L, 10.), row); vec4 rb = hr(id, 13);
  float e = min(min(xu - L, R - xu) * 200., min(fy, 1. - fy) * 333.) + 3. * (fbm(uv * 30., vec2(30), 3, 7) - .5); // hand-dressed arrises wander a little
  float sh = jointH(e, 12., 8.), face = jointMask(e, 12.);
  float hF = -4. + 4. * sqrt(sat((e - 6.) / 40.)) + 3.5 * fbm(uv * 25. + rb.xy * 7., vec2(25), 5, 11) + .3 * (vn(uv * 700., vec2(700), 12) - .5);
  h = mix(-9. + .8 * fbm(uv * 300., vec2(300), 3, 9) - .3 * vn(uv * 900., vec2(900), 10), hF, sh);
  vec3 stone = cellCol(vec3(.46, .42, .35), rb, .08) * (.9 + .15 * fbm(uv * 18., vec2(18), 4, 15));
  stone = mix(stone, vec3(.56, .53, .45), ss(.6, .8, fbm(uv * 9., vec2(9), 4, 17)) * .35);
  stone *= .93 + .14 * vn(uv * 1000., vec2(1000), 21); stone = mix(stone, vec3(.12, .11, .1), step(.94, vn(uv * 1100., vec2(1100), 23)) * .5); // grain, dark flecks
  vec2 stn = stain(uv, 5., .12, 25) * step(.6, rb.z); stone = mix(stone, vec3(.42, .26, .14), stn.x * .35); stone *= 1. - .15 * stn.y; // iron
  float drip = ss(.6, .8, vn(vec2(uv.x * 300., 0.), vec2(300., 1.), 27)) * exp(-(1. - fy) * 2.5) * step(rb.w, .35) * (.6 + .4 * vn(uv * vec2(300., 30.), vec2(300., 30.), 29));
  stone *= 1. - .2 * drip;
  c = mix(vec3(.52, .49, .43) * (.88 + .2 * fbm(uv * 120., vec2(120), 3, 19)) * (.92 + .16 * vn(uv * 900., vec2(900), 10)), stone, face);
  r = mix(.95, cellGloss(.86, rb, .07) - .06 * drip, face); t = face;`);

// materials: name, texture set, shader options (see mat.js)
mat('poolTile', 'poolTile', { detail: .12, macro: .03, dirt: .5, dirtCol: [.72, .68, .6], fine: .003 });
mat('poolMosaic', 'poolMosaic', { detail: .12, macro: .04, dirt: .4, dirtCol: [.72, .68, .6], fine: .002 });
mat('marble', 'marble', { detail: .08, macro: .03, dirt: .3, wear: .2, edgeCol: [.8, .78, .74], fine: .001 });
mat('terrazzo', 'terrazzo', { detail: .1, macro: .04, dirt: .4, fine: .002 });
mat('limestone', 'limestone', { detail: .4, macro: .08, dirt: .6, dirtCol: [.62, .6, .52], wear: .5, edgeCol: [.88, .84, .76], fine: .002 });
mat('travertine', 'travertine', { detail: .3, macro: .08, dirt: .6, dirtCol: [.62, .6, .52], wear: .5, edgeCol: [.9, .84, .74], fine: .002 });
mat('stoneWall', 'stoneWall', { detail: .4, macro: .08, dirt: .6, dirtCol: [.62, .6, .52], fine: .003 });
