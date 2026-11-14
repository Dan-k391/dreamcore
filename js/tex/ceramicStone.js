// Ceramic and stone: the texture sets (GLSL, see docs/materials.md) and the materials made from them.
import { set, mat } from './registry.js';

set('poolTile', 1, 1024, 1024, .1, .35, `
  vec2 g = uv * 10., id = floor(g), f = fract(g) + (hf2(id, 9) - .5) * .004;
  float r1 = hf(id, 1), r2 = hf(id, 2), r3 = hf(id, 3), r4 = hf(id, 4), r5 = hf(id, 5);
  float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) * 100.; // mm to the tile's edge
  float sh = jointH(e, 3.6, 3.), face = jointMask(e, 3.6); // 3.6 mm grout, cushion edges rounding over 3 mm (blocks.js)
  vec2 cc = f - .5;
  float hT = -1.1 + 1.1 * sh - dot(cc, cc) * .5 + (cc.x * (r2 - .5) + cc.y * (r3 - .5)) * 1.6 + .3 * (gn(f * 2.5 + id * 3.1, vec2(4096), 71) - .5) + (gn(uv * 900., vec2(900), 3) - .5) * .02;
  float sand = fbm(uv * 400., vec2(400), 3, 21);
  h = mix(-1.5 + .25 * sand, hT, face);
  vec3 glaze = vec3(.885, .89, .875) * (.93 + .1 * r1) + vec3(.016, .004, -.016) * (r4 - .5) * 2.;
  glaze *= 1. - .22 * (1. - sh); // the glaze thins over the shoulder: each tile reads framed, also from across the hall
  glaze *= 1. - .3 * step(.988, vn(uv * 700., vec2(700), 31)); // specks fired into it
  float dirt = fbm(uv * 30., vec2(30), 4, 41), lime = fbm(uv * 55., vec2(55), 3, 43);
  vec3 grout = vec3(.25, .245, .235) * (.8 + .3 * sand);
  grout = mix(grout, vec3(.18, .16, .13), ss(.48, .7, dirt) * .8);
  grout = mix(grout, vec3(.6, .6, .57), ss(.58, .76, lime) * .5);
  c = mix(grout, glaze, face);
  r = mix(.9, .03 + .07 * r5 + .05 * (1. - sh), face); t = face;
  if (r4 > .93) { vec4 v = vor(uv * 60. + .25 * vec2(gn(uv * 80., vec2(80), 51), gn(uv * 80., vec2(80), 53)), vec2(60), 55, 1.); // crazing
    float cr = (1. - ss(.0, .03, v.y - v.x)) * face; c *= 1. - .22 * cr; h -= .02 * cr; }
  if (r5 > .955) { vec2 k = vec2(step(.5, hf(id, 6)), step(.5, hf(id, 7))); float d = length(f - k) * 100. + 2. * gn(uv * 400., vec2(400), 61); // a chipped corner
    float chip = 1. - ss(7., 8.5, d); h = mix(h, -1. + .3 * vn(uv * 900., vec2(900), 63), chip); c = mix(c, vec3(.7, .64, .56), chip); r = mix(r, .85, chip); t *= 1. - chip; }`);
set('poolMosaic', .5, 1024, 1024, .12, .35, `
  vec2 g = uv * 20., id = floor(g), f = fract(g) + (hf2(id, 3) - .5) * .03;
  float r1 = hf(id, 1), r2 = hf(id, 2);
  float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) * 25. + .4 * (vn(uv * 600., vec2(600), 5) - .5);
  float sh = sqrt(sat((e - .7) / 1.4)), face = ss(.6, .9, e); vec2 cc = f - .5;
  h = mix(-.9 + .2 * fbm(uv * 300., vec2(300), 3, 7), -.7 + .7 * sh - dot(cc, cc) * .4, face);
  vec3 tile = vec3(.86, .87, .85) * (.86 + .22 * r1) * (1. + vec3(.04, 0., -.04) * (r2 - .5)) * (.94 + .06 * vn(uv * 120., vec2(120), 9));
  c = mix(vec3(.58, .56, .52) * (.85 + .3 * fbm(uv * 40., vec2(40), 3, 11)), tile, face);
  r = mix(.85, .05 + .06 * hf(id, 4), face); t = face;`);
set('marble', 1.2, 2048, 1024, .1, .3, `
  vec2 g = uv * 4., id = floor(g), f = fract(g);
  float dark = mod(id.x + id.y, 2.), r1 = hf(id, 1), r2 = hf(id, 2);
  float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) * 300.;
  float bev = sqrt(sat((e - .4) / 1.6)), face = ss(.3, .5, e);
  vec2 q = f * 1.2 + vec2(r1, r2) * 17.; // every tile cut from a different part of the block
  vec2 wq = q + .6 * vec2(fbm(q * 1.3, vec2(4096), 5, 3), fbm(q * 1.3 + 5., vec2(4096), 5, 5));
  float n1 = fbm(wq * 1.1, vec2(4096), 6, 7), n2 = fbm(wq * 2.6 + 3., vec2(4096), 5, 9), cloud = fbm(q * 2., vec2(4096), 5, 13);
  float v1 = 1. - ss(0., .012, abs(n1 - .5)), v1h = 1. - ss(0., .07, abs(n1 - .5)); // veins along the noise's isolines, with a soft halo
  float v2 = (1. - ss(0., .006, abs(n2 - .5))) * ss(.4, .6, fbm(q * .8, vec2(4096), 3, 11));
  vec3 cream = vec3(.80, .76, .68) * (.92 + .12 * cloud);
  cream = mix(cream, vec3(.62, .6, .57), v1h * .35); cream = mix(cream, vec3(.42, .41, .4), v1 * .8); cream = mix(cream, vec3(.56, .53, .48), v2 * .6);
  vec3 black = vec3(.014, .0135, .015) * (.75 + .6 * cloud); float bv = ss(.4, .65, fbm(q * .7 + 9., vec2(4096), 3, 15)); // Nero: deep black, veins sparse and only in some tiles
  black = mix(black, vec3(.05), v1h * .15 * bv); black = mix(black, vec3(.62, .6, .56), v1 * .6 * bv); black = mix(black, vec3(.2, .2, .19), v2 * .25 * bv);
  c = mix(mix(cream, black, dark), vec3(.3, .29, .27), 1. - face);
  h = -.6 + .6 * bev;
  float scr = fibres(uv * 300., vec2(300), 71, .9, .04) * step(.5, fbm(uv * 6., vec2(6), 3, 73));
  r = mix(.7, .05 + .08 * scr + .03 * cloud, face); t = 0.;`);
set('terrazzo', 1, 1024, 512, .13, .2, `
  vec4 v1 = vor(uv * 70., vec2(70), 3, 1.), v2 = vor(uv * 160., vec2(160), 5, 1.), v3 = vor(uv * 30., vec2(30), 9, 1.);
  float c1 = ss(.10, .16, v1.y - v1.x) * step(.25, v1.z), c2 = ss(.12, .2, v2.y - v2.x) * step(.4, v2.z) * (1. - c1), c3 = ss(.06, .1, v3.y - v3.x) * step(.8, v3.z);
  c = vec3(.80, .77, .72) * (.94 + .1 * fbm(uv * 20., vec2(20), 4, 1)); t = 1.;
  c = mix(c, chip(v3.w) * (.85 + .3 * hf(v3.zw * 99., 2)), c3); t *= 1. - c3;
  c = mix(c, chip(v1.w) * (.85 + .3 * v1.z), c1); t *= 1. - c1;
  c = mix(c, chip(v2.w) * (.85 + .3 * v2.z), c2); t *= 1. - c2;
  h = .02 * max(max(c1, c2), c3) + .01 * fbm(uv * 500., vec2(500), 2, 15);
  r = .13 + .05 * fbm(uv * 8., vec2(8), 3, 17) - .03 * max(c1, max(c2, c3));`,
  `vec3 chip(float k) { return k < .35 ? vec3(.88, .86, .82) : k < .55 ? vec3(.42, .42, .41) : k < .7 ? vec3(.06, .06, .065) : k < .85 ? vec3(.6, .36, .24) : vec3(.36, .44, .38); }`);
set('limestone', 2, 1024, 1024, .8, .3, `
  vec2 q = uv * vec2(4., 5.); float row = floor(q.y); q.x += floor(hf(vec2(0., row), 1) * 8.) * .5;
  vec2 id = vec2(mod(floor(q.x), 4.), row), f = fract(q);
  float r1 = hf(id, 3), r2 = hf(id, 5);
  float e = min(min(f.x, 1. - f.x) * 500., min(f.y, 1. - f.y) * 400.) + 2.5 * (vn(uv * 300., vec2(300), 7) - .5) * (.5 + r2);
  float face = ss(3., 4., e), sh = sqrt(sat((e - 3.) / (2. + 7. * r2)));
  h = mix(-4. + fbm(uv * 200., vec2(200), 3, 9), -2.2 * (1. - sh) + .9 * fbm(uv * 40. + r1 * 9., vec2(40), 5, 11), face);
  float pits = ss(.84, .9, vn(uv * vec2(220., 700.), vec2(220., 700.), 13)) * st(fbm(uv * 12. + r1 * 5., vec2(12), 3, 15), 3.); // travertine voids along the bedding
  pits = sat(pits * (.5 + r2));
  h -= pits * 1.6 * face;
  vec3 stone = vec3(.62, .56, .46) * (.9 + .14 * r1) * (.9 + .14 * fbm(uv * 12., vec2(12), 4, 17)) * (.95 + .08 * vn(uv * vec2(8., 40.), vec2(8., 40.), 18));
  float lich = ss(.58, .72, fbm(uv * 7. + 3., vec2(7), 5, 19));
  stone = mix(stone, vec3(.7, .7, .62), lich * .35); stone = mix(stone, stone * .45, pits);
  c = mix(vec3(.45, .42, .37) * (.85 + .3 * fbm(uv * 90., vec2(90), 3, 21)), stone, face);
  r = mix(.95, .8 + .08 * fbm(uv * 30., vec2(30), 3, 23), face); t = face;`);
set('stoneWall', 2, 1024, 1024, .87, .25, `
  vec2 q = uv * vec2(10., 6.); float row = floor(q.y), fy = fract(q.y);
  float xu = q.x + floor(hf(vec2(1., row), 2) * 10.) + .5 * mod(row, 2.), u0 = floor(xu), L = u0 - 3., R = u0 + 4.;
  for (int k = 3; k >= 0; k--) { float b = u0 - float(k), bm = mod(b, 10.); if (hf(vec2(bm, row), 5) < .45 || mod(bm, 4.) == 0.) L = b; }
  for (int k = 4; k >= 1; k--) { float b = u0 + float(k), bm = mod(b, 10.); if (hf(vec2(bm, row), 5) < .45 || mod(bm, 4.) == 0.) R = b; }
  vec2 id = vec2(mod(L, 10.), row);
  float e = min(min(xu - L, R - xu) * 200., min(fy, 1. - fy) * 333.) + 4. * (fbm(uv * 60., vec2(60), 3, 7) - .5);
  float face = ss(5., 8., e);
  h = mix(-9. + 1.5 * fbm(uv * 150., vec2(150), 3, 9), -4. + 4. * sqrt(sat(e / 40.)) + 3.5 * fbm(uv * 25. + hf2(id, 3) * 7., vec2(25), 5, 11), face);
  vec3 stone = vec3(.45, .42, .36) * (.8 + .32 * hf(id, 13)) * (.9 + .15 * fbm(uv * 18., vec2(18), 4, 15));
  stone = mix(stone, vec3(.56, .53, .45), ss(.6, .8, fbm(uv * 9., vec2(9), 4, 17)) * .4);
  c = mix(vec3(.5, .47, .41) * (.85 + .25 * fbm(uv * 120., vec2(120), 3, 19)), stone, face); r = mix(.95, .85, face); t = face;`);

// materials: name, texture set, shader options (see mat.js)
mat('poolTile', 'poolTile', { detail: .12, macro: .04, dirt: .5, dirtCol: [.72, .68, .6] });
mat('poolMosaic', 'poolMosaic', { detail: .12, macro: .05, dirt: .4, dirtCol: [.72, .68, .6] });
mat('marble', 'marble', { detail: .08, macro: .06, dirt: .3, wear: .2, edgeCol: [.8, .78, .74] });
mat('terrazzo', 'terrazzo', { detail: .12, macro: .08, dirt: .4 });
mat('limestone', 'limestone', { detail: .4, macro: .2, dirt: .6, dirtCol: [.62, .6, .52], wear: .5, edgeCol: [.88, .84, .76] });
mat('travertine', 'limestone', { color: 0xf3dfc4, detail: .4, macro: .2, dirt: .6, dirtCol: [.62, .6, .52], wear: .5, edgeCol: [.9, .84, .74] });
mat('stoneWall', 'stoneWall', { detail: .4, macro: .2, dirt: .6, dirtCol: [.62, .6, .52] });
