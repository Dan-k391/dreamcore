// Procedural textures: the tools that make them and the ones more than one place uses.
// Two engines: makeTex (CPU, one JS call per pixel; kept for the few small textures still made with it) and the material
// library (GPU): every set below is a GLSL function baked once at load into an albedo and a normal/roughness/metal texture.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { renderer, quadVS } from './core.js';

// ---------- procedural textures (albedo + normal + roughness from one function) ----------
const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const noise = (x, y, p) => { // tileable value noise, integer period p
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), w = (i, j) => hash(i % p, j % p);
  return (w(xi, yi) * (1 - sx) + w(xi + 1, yi) * sx) * (1 - sy) + (w(xi, yi + 1) * (1 - sx) + w(xi + 1, yi + 1) * sx) * sy;
};
const fbm = (u, v, p, o) => { let a = 0, k = .5; for (let i = 0; i < o; i++, p *= 2, k *= .5) a += k * noise(u * p, v * p, p); return a; };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const maxA = renderer.capabilities.getMaxAnisotropy();

// fn(u, v, px, py) -> [r, g, b, height, roughness]; texture covers `meters` of world space
function makeTex(n, meters, fn, bump = 1) {
  const col = new Uint8ClampedArray(n * n * 4), rgh = new Uint8ClampedArray(n * n * 4), nor = new Uint8ClampedArray(n * n * 4), hgt = new Float32Array(n * n);
  for (let y = 0, i = 0; y < n; y++) for (let x = 0; x < n; x++, i++) {
    const [r, g, b, h, ro] = fn(x / n, y / n, x, y);
    col.set([r * 255, g * 255, b * 255, 255], i * 4); rgh.set([ro * 255, ro * 255, ro * 255, 255], i * 4); hgt[i] = h;
  }
  for (let y = 0, i = 0; y < n; y++) for (let x = 0; x < n; x++, i++) {
    const dx = (hgt[y * n + (x + 1) % n] - hgt[y * n + (x + n - 1) % n]) * bump, dy = (hgt[((y + 1) % n) * n + x] - hgt[((y + n - 1) % n) * n + x]) * bump, l = 127.5 / Math.hypot(dx, dy, 1);
    nor.set([127.5 - dx * l, 127.5 - dy * l, 127.5 + l, 255], i * 4);
  }
  const T = (d, srgb) => {
    const t = new THREE.DataTexture(new Uint8Array(d.buffer), n, n);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(1 / meters);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = maxA;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  };
  return { map: T(col, true), normalMap: T(nor), roughnessMap: T(rgh) };
}

const grime = makeTex(256, 9, (u, v) => [0, 0, 0, 0, .5 + .8 * fbm(u, v, 3, 5)]).roughnessMap; // large-scale mottling, breaks up tiling
const waves = s => { // tileable ripple heightfield -> water normal map
  const w = []; for (let i = 0; i < 14; i++) w.push([Math.round(hash(i, s) * 12 - 6) || 1, Math.round(hash(i, s + 9) * 12 - 6), hash(i, s + 5) * 6.28]);
  return (u, v) => { let h = 0; for (const [a, b, p] of w) h += Math.sin(6.2832 * (a * u + b * v) + p) / Math.hypot(a, b); return [0, 0, 0, h, 0]; };
};
const wn0 = makeTex(512, 6, waves(1), 2).normalMap, wn1 = makeTex(512, 6, waves(2), 2).normalMap;

// ---------- the material library: GPU-baked texture sets ----------
// A set is the body of surf(uv, c, h, r, m, t): uv runs 0..1 over SZ metres and must tile. It writes linear albedo c, height h in
// millimetres (normals are derived from it at the true scale), roughness r, metalness m and t: how much of the material's colour
// tints this texel (0 keeps the baked colour: grout, chips, stitching), or for an emitter set the emission pattern.
// Baked into A (sRGB: albedo, darkened in crevices by the height; alpha t) and B (linear: normal xy, roughness, metalness).
const GLIB = `
#define PI 3.14159265
#define ss smoothstep
float sat(float x) { return clamp(x, 0., 1.); }
float st(float x, float k) { return sat((x - .5) * k + .5); } // stretch a noise's contrast about its middle (fbm is mostly .4-.6)
uniform int uOne; // 1, unknown to the compiler: loops stay loops instead of being unrolled (unrolled noise is slow to compile)
uniform highp sampler2D tR; // 256x256 random numbers: hashing by lookup is far cheaper than integer hashing on most GPUs
vec4 hr(vec2 p, int s) { ivec2 q = ivec2(p) + ivec2(s * 37 + 4096, s * 59 + 4096); return texelFetch(tR, (q + (q.yx >> 8) * ivec2(113, 71)) & 255, 0); } // the high bits move the lookup to another row: no 256-cell repeat
float hf(vec2 p, int s) { return hr(p, s).x; }
vec2 hf2(vec2 p, int s) { return hr(p, s).xz; }
vec2 wr(vec2 i, vec2 n) { return mod(i, n); }
float vn(vec2 p, vec2 n, int s) { vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f); // value noise, period n
  return mix(mix(hf(wr(i, n), s), hf(wr(i + vec2(1, 0), n), s), u.x), mix(hf(wr(i + vec2(0, 1), n), s), hf(wr(i + 1., n), s), u.x), u.y); }
float gn(vec2 p, vec2 n, int s) { vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6. - 15.) + 10.); // gradient noise, period n, about 0..1
  vec2 a = hf2(wr(i, n), s) * 2. - 1., b = hf2(wr(i + vec2(1, 0), n), s) * 2. - 1., c = hf2(wr(i + vec2(0, 1), n), s) * 2. - 1., d = hf2(wr(i + 1., n), s) * 2. - 1.;
  return mix(mix(dot(a, f), dot(b, f - vec2(1, 0)), u.x), mix(dot(c, f - vec2(0, 1)), dot(d, f - 1.), u.x), u.y) * .7 + .5; }
float fbm(vec2 p, vec2 n, int o, int s) { float a = 0., w = .5, t = 0.; for (int i = 0; i < o * uOne; i++) { a += w * gn(p, n, s + i * 13); t += w; p *= 2.; n *= 2.; w *= .5; } return a / t; }
vec4 vor(vec2 p, vec2 n, int s, float j) { // cellular: F1, F2, two hashes of the nearest cell
  vec2 i = floor(p), f = fract(p), c1 = vec2(0); float d1 = 9., d2 = 9.;
  for (int y = -1; y <= uOne; y++) for (int x = -1; x <= uOne; x++) { vec2 o = vec2(x, y), c = wr(i + o, n), r = o + .5 + j * (hf2(c, s) - .5) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; c1 = c; } else if (d < d2) d2 = d; }
  return vec4(sqrt(d1), sqrt(d2), hf(c1, s + 7), hf(c1, s + 11)); }
vec3 vorv(vec2 p, vec2 n, int s, float j) { // cellular: offset from here to the nearest cell's point, and its hash (same as vor().z)
  vec2 i = floor(p), f = fract(p), c1 = vec2(0), r1 = vec2(0); float d1 = 9.;
  for (int y = -1; y <= uOne; y++) for (int x = -1; x <= uOne; x++) { vec2 o = vec2(x, y), c = wr(i + o, n), r = o + .5 + j * (hf2(c, s) - .5) - f; float d = dot(r, r);
    if (d < d1) { d1 = d; c1 = c; r1 = r; } }
  return vec3(r1, hf(c1, s + 7)); }
float fibres(vec2 p, vec2 n, int s, float len, float wid) { // short straight strands, one per cell (p in cells), any direction; coverage 0..1
  vec2 i = floor(p), f = fract(p); float best = 0.;
  for (int y = -1; y <= uOne; y++) for (int x = -1; x <= uOne; x++) { vec2 o = vec2(x, y), c = wr(i + o, n); float a = hf(c, s + 3) * PI; vec2 d = vec2(cos(a), sin(a)), q = f - o - hf2(c, s);
    float al = dot(q, d), ac = dot(q, vec2(-d.y, d.x)), l = len * (.6 + .4 * hf(c, s + 9));
    best = max(best, (1. - ss(wid * .4, wid, abs(ac))) * (1. - ss(l * .4, l * .5, abs(al))) * (.55 + .45 * hf(c, s + 5))); }
  return best; }
float crackNet(vec2 uv, float k, int s, float w, float cover) { // a network of hairline cracks, only where a mask allows
  vec4 v = vor(uv * k + .3 * vec2(fbm(uv * k * 2., vec2(k * 2.), 4, s), fbm(uv * k * 2., vec2(k * 2.), 4, s + 1)), vec2(k), s + 2, 1.);
  return (1. - ss(0., w, v.y - v.x)) * ss(1. - cover, 1. - cover + .08, fbm(uv * max(1., k * .5), vec2(max(1., k * .5)), 3, s + 3)); }
`;
const sets = {}; // name -> { m: metres covered, a / b: albedo / normal size (a 0: no albedo), r0: its mean roughness, cav: crevice darkening per mm, glsl }
const set = (name, m, a, b, r0, cav, body, pre = '') => sets[name] = { name, m, a, b, r0, cav, glsl: `${pre}\nvoid surf(vec2 uv, inout vec3 c, inout float h, inout float r, inout float m, inout float t) {\n${body}\n}` };

// shared micro detail, tiled every 10 cm by every library material: rg micro normal, b micro roughness, a a smooth low-frequency field (macro variation)
set('detail', .1, 0, 512, .5, 0, `
  float g = fbm(uv * 32., vec2(32), 4, 1); vec4 v = vor(uv * 24., vec2(24), 3, 1.);
  h = .05 * g - .04 * (1. - ss(.05, .15, v.x)) * step(.8, v.z);
  r = .5 + .8 * (fbm(uv * 12., vec2(12), 3, 5) - .5);
  m = sat((fbm(uv * 4., vec2(4), 5, 7) - .5) * 2.6 + .5);`);

// ceramic and stone
set('poolTile', 1, 1024, 2048, .1, .35, `
  vec2 g = uv * 10., id = floor(g), f = fract(g) + (hf2(id, 9) - .5) * .004;
  float r1 = hf(id, 1), r2 = hf(id, 2), r3 = hf(id, 3), r4 = hf(id, 4), r5 = hf(id, 5);
  float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) * 100.; // mm to the tile's edge
  float sh = sqrt(sat((e - 1.6) / 2.6)), face = ss(1.4, 1.8, e);
  vec2 cc = f - .5;
  float hT = -1.1 + 1.1 * sh - dot(cc, cc) * .5 + (cc.x * (r2 - .5) + cc.y * (r3 - .5)) * 1.6 + .3 * (gn(f * 2.5 + id * 3.1, vec2(4096), 71) - .5) + (gn(uv * 900., vec2(900), 3) - .5) * .02;
  float sand = fbm(uv * 400., vec2(400), 3, 21);
  h = mix(-1.5 + .25 * sand, hT, face);
  vec3 glaze = vec3(.885, .89, .875) * (.93 + .1 * r1) + vec3(.016, .004, -.016) * (r4 - .5) * 2.;
  glaze *= 1. - .1 * (1. - sh); // the glaze thins over the shoulder
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
  vec3 black = vec3(.022, .021, .024) * (.75 + .6 * cloud);
  black = mix(black, vec3(.1), v1h * .4); black = mix(black, vec3(.82, .8, .76), v1 * .9); black = mix(black, vec3(.45, .45, .43), v2 * .7);
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
set('plaster', 2, 1024, 2048, .86, .4, `
  vec4 v = vor(uv * 330., vec2(330), 3, 1.);
  float stip = pow(1. - sat(v.x), 2.) * (.6 + .4 * v.z);
  float wave = gn(uv * vec2(3., 5.) + .4 * vec2(gn(uv * 2., vec2(2), 5), 0.), vec2(3., 5.), 7);
  float crack = crackNet(uv, 4., 11, .006, .3);
  h = .12 * stip + .3 * wave + .03 * fbm(uv * 900., vec2(900), 2, 9) - .06 * crack;
  c = vec3(.875) * (.975 + .04 * fbm(uv * 10., vec2(10), 4, 19)) * (1. - .25 * crack);
  r = .86 + .06 * (stip - .5); t = 1.;`);
set('stucco', 1.5, 512, 1024, .93, .25, `
  vec4 v = vor(uv * 500., vec2(500), 3, 1.), w = vor(uv * 180., vec2(180), 5, 1.);
  float grains = pow(sat(1. - v.x * 1.2), 1.5) * (.5 + .5 * v.z), pebbles = pow(sat(1. - w.x * 1.4), 2.) * step(.6, w.z);
  float swirl = gn(uv * 12. + .5 * vec2(gn(uv * 6., vec2(6), 7), gn(uv * 6., vec2(6), 9)), vec2(12), 11);
  h = .35 * grains + .6 * pebbles + .5 * swirl;
  c = vec3(.82, .80, .76) * (.9 + .1 * grains + .06 * fbm(uv * 5., vec2(5), 4, 13)); r = .93; t = 1.;`);
// concrete and ground
set('concreteWall', 2.4, 1024, 1024, .82, .3, `
  vec2 q = uv * 2.4; float px = mod(q.x, 1.2), pid = floor(q.x / 1.2);
  float fin = 1. - ss(1., 2.5, min(min(px, 1.2 - px), min(q.y, 2.4 - q.y)) * 1000.); // panel joints: a thin raised fin
  vec2 tg = mod(q - .3, .6) - .3; float td = length(tg) * 1000.;
  float hole = 1. - ss(10., 12.5, td), ring = (1. - ss(12., 30., td)) * (1. - hole); // form-tie holes on a 60 cm grid
  vec4 b = vor(uv * 240., vec2(240), 7, 1.); float bug = (1. - ss(.04 + .12 * b.w, .1 + .14 * b.w, b.x)) * step(.965, b.z); // sparse bug holes
  float lift = ss(.94, .995, sin((uv.y * 6. + .03 * gn(uv * vec2(4., 1.), vec2(4., 1.), 9)) * 2. * PI)); // pour lines
  float streak = exp(-pow(tg.x * 1000. / 7., 2.)) * ss(-.3, -.01, -abs(tg.y)) * step(tg.y, 0.) * (.5 + .5 * gn(uv * vec2(60., 8.), vec2(60., 8.), 11));
  streak += .6 * ss(.6, .8, vn(uv * vec2(40., 3.), vec2(40., 3.), 12)) * ss(.5, .7, fbm(uv * 3., vec2(3), 3, 14));
  float grain = vn(uv * vec2(300., 6.), vec2(300., 6.), 13), m1 = fbm(uv * 6., vec2(6), 5, 15), m2 = fbm(uv * 30., vec2(30), 4, 16);
  h = .4 * fin - 9. * hole + .08 * (grain - .5) - 1.5 * bug + .08 * fbm(uv * 600., vec2(600), 2, 17) + .3 * lift + .15 * m2;
  c = vec3(.36, .35, .33) * (.72 + .45 * m1) * (.9 + .2 * m2) * (.94 + .12 * hf(vec2(pid, 0.), 19)) * (1. - .05 * (grain - .5));
  c *= (1. - .12 * fin) * (1. - .45 * hole) * (1. - .08 * ring) * (1. - .2 * sat(streak)) * (1. - .06 * lift) * (1. - .4 * bug);
  r = .8 + .1 * m1 - .1 * sat(streak); t = 1.;`);
set('concreteFloor', 4, 1024, 1024, .5, .3, `
  float m1 = st(fbm(uv * 6., vec2(6), 6, 1), 3.), m2 = st(fbm(uv * 28., vec2(28), 5, 2), 2.5), m3 = st(fbm(uv * 2., vec2(2), 4, 4), 2.5);
  float burn = ss(.52, .66, fbm(uv * 5. + 1.7, vec2(5), 5, 3)); // trowel-burnished patches: darker, glossier
  float sweep = gn(uv * vec2(40., 4.) + 2. * vec2(0., gn(uv * 3., vec2(3), 5)), vec2(40., 4.), 7); // trowel streaks
  vec4 sp = vor(uv * 1200., vec2(1200), 5, 1.); float speck = step(.75, sp.z) * (1. - ss(.15, .4, sp.x)); // sand grains showing through
  vec2 q = uv * 4.; float cut = 1. - ss(1.8, 2.6, min(min(q.x, 4. - q.x), min(q.y, 4. - q.y)) * 1000.); // saw-cut joints every 4 m
  float crack = crackNet(uv, 3., 9, .004, .35);
  vec4 o = vor(uv * vec2(6., 3.), vec2(6., 3.), 17, .8); float oil = (1. - ss(.12, .3, o.x + .25 * fbm(uv * 24., vec2(24), 4, 19))) * step(.8, o.z); // oil stains, soaked in unevenly
  float tc = .35 + .04 * sin(uv.x * 2. * PI), tyre = (1. - ss(.02, .035, abs(uv.y - tc))) + (1. - ss(.02, .035, abs(uv.y - tc - .4)));
  tyre *= .4 + .6 * vn(uv * vec2(80., 2.), vec2(80., 2.), 21);
  h = .05 * sweep + .03 * fbm(uv * 800., vec2(800), 2, 25) - 25. * cut - .15 * crack + .02 * speck;
  c = vec3(.32, .31, .295) * (.72 + .4 * m1) * (.88 + .22 * m2) * (.88 + .22 * m3) * (1. - .12 * burn) * (1. - .04 * sweep) * (1. + .35 * speck * (sp.w - .45));
  c *= (1. - .6 * cut) * (1. - .35 * crack) * (1. - .07 * tyre); c = mix(c, c * vec3(.6, .58, .55), oil * .7);
  r = .55 + .2 * (m2 - .5) - .24 * burn - .22 * oil - .06 * tyre + .05 * sweep; t = 1.;`);
set('asphalt', 2, 1024, 1024, .72, .5, `
  vec4 a = vor(uv * 340., vec2(340), 1, 1.), b = vor(uv * 900., vec2(900), 3, 1.);
  float sA = ss(.08, .18, a.y - a.x) * step(.5, a.z), sB = ss(.06, .14, b.y - b.x) * step(.55, b.z) * (1. - sA);
  vec3 st = a.w > .95 ? vec3(.42, .4, .38) : mix(vec3(.08, .08, .085), vec3(.24, .235, .23), a.w / .95);
  float bind = fbm(uv * 150., vec2(150), 3, 5), mo = fbm(uv * 8., vec2(8), 4, 6);
  c = vec3(.035, .035, .038) * (.8 + .4 * bind); c = mix(c, mix(vec3(.06), vec3(.2), b.w), sB); c = mix(c, st, sA); c *= .85 + .3 * mo;
  h = -.4 + .2 * bind + sB * (.3 + .4 * sqrt(sat(1. - b.x * 1.4))) + sA * (.4 + .9 * sqrt(sat(1. - a.x * 1.4)));
  r = mix(.6 - .12 * bind, .85, max(sA, sB));
  float crack = crackNet(uv, 2., 11, .008, .45); h -= 3. * crack; c *= 1. - .7 * crack;
  vec2 pp = uv - vec2(.62, .18); float pat = step(0., pp.x) * step(pp.x, .3) * step(0., pp.y) * step(pp.y, .22); // a patch
  c = mix(c, c * .7, pat); r = mix(r, r * .85, pat); float pe = pat * (1. - ss(.0, .004, min(min(pp.x, .3 - pp.x), min(pp.y, .22 - pp.y)))); c *= 1. - .5 * pe; h -= .5 * pe;
  float wet = ss(.55, .7, fbm(uv * 4. + 5., vec2(4), 4, 15)); r *= 1. - .4 * wet; c *= 1. - .15 * wet; // worn, wet-looking areas
  t = 0.;`);
set('roadPaint', 1, 512, 512, .55, .4, `
  vec4 a = vor(uv * 130., vec2(130), 1, 1.);
  float stone = ss(.06, .14, a.y - a.x) * sqrt(sat(1. - a.x * 1.4));
  float wear = ss(.62, .72, fbm(uv * 6., vec2(6), 5, 3) + .22 * stone); // worn off the stone tops first
  vec4 k = vor(uv * 25. + .2 * vec2(gn(uv * 50., vec2(50), 7), 0.), vec2(25), 5, 1.); float crack = 1. - ss(0., .03, k.y - k.x);
  float paint = (1. - wear) * (1. - crack * .8);
  h = .9 * stone + .6 * paint + .05 * fbm(uv * 300., vec2(300), 2, 7);
  c = mix(vec3(.05, .05, .055) + .25 * stone, vec3(.84, .83, .8) * (.92 + .08 * fbm(uv * 20., vec2(20), 3, 9)), paint);
  r = mix(.6, .5, paint); t = paint;`);
set('sand', 2, 512, 1024, .93, .2, `
  vec2 w = vec2(fbm(uv * 3., vec2(3), 4, 1), fbm(uv * 3., vec2(3), 4, 3));
  float rip = pow(.5 + .5 * sin((uv.y * 20. + 1.6 * w.x + .4 * sin(uv.x * 2. * PI * 3.)) * 2. * PI), 1.6);
  float lump = fbm(uv * 6., vec2(6), 5, 5), grain = vn(uv * 1500., vec2(1500), 7);
  h = 3.5 * rip * ss(.3, .6, w.y + .2) + 10. * lump + .08 * grain;
  c = vec3(.5, .42, .28) * (.9 + .12 * fbm(uv * 15., vec2(15), 4, 9)) * (.92 + .08 * rip) * (.96 + .08 * grain);
  float spark = step(.996, hf(floor(uv * 1024.), 11)); r = .95 - .6 * spark; c += .2 * spark; t = 1.;`);
set('mulch', 1, 1024, 512, .92, .35, `
  h = -4.; c = vec3(.07, .055, .045) * (.7 + .6 * fbm(uv * 80., vec2(80), 3, 1)); r = .95; t = 0.;
  for (int L = 0; L < 3; L++) { float sc = 22. + 9. * float(L); vec2 p = uv * sc + float(L) * .37, i = floor(p), f = fract(p);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y), cc = mod(i + o, vec2(sc));
      float a = hf(cc, 3 + L) * PI; vec2 d = vec2(cos(a), sin(a)), pos = f - o - hf2(cc, 7 + L);
      float al = dot(pos, d), ac = dot(pos, vec2(-d.y, d.x)), len = .45 + .35 * hf(cc, 9 + L), wid = .16 + .12 * hf(cc, 13 + L);
      float ins = (1. - ss(len - .06, len, abs(al))) * (1. - ss(wid - .05, wid, abs(ac)));
      float hh = 2. + 5. * hf(cc, 17 + L) + float(L) * 1.5 + 1.2 * vn(vec2(al * 30., ac * 6.) + cc, vec2(4096), 19) - 3. * ac * ac;
      if (hh > h && ins > 0.) { h = mix(h, hh, ins); c = mix(c, vec3(.36, .24, .15) * (.55 + .6 * hf(cc, 23 + L)) * (.8 + .3 * vn(vec2(al * 40., ac * 4.) + cc * 3., vec2(4096), 29)), ins); } } }`);
set('rubberCrumb', 1, 1024, 512, .9, .45, `
  vec4 v = vor(uv * 300., vec2(300), 1, 1.); float g = ss(.04, .12, v.y - v.x), black = step(.75, v.z);
  h = g * (.4 + .6 * sqrt(sat(1. - v.x))) + .1 * vn(uv * 900., vec2(900), 3);
  c = mix(vec3(.03), mix(vec3(.62, .6, .58) * (.8 + .35 * v.w), vec3(.05), black), g); t = g * (1. - black); r = .9;`);
set('grassGround', 2, 1024, 1024, .92, .4, `
  float soil = fbm(uv * 30., vec2(30), 5, 1), patchy = st(fbm(uv * 6., vec2(6), 5, 31), 2.5), turf = fbm(uv * 120., vec2(120), 3, 2);
  float bare = ss(.2, .02, patchy + .15 * soil); // earth showing through where the turf is thin
  c = mix(vec3(.045, .13, .02) * (.65 + .7 * turf), vec3(.1, .075, .05) * (.7 + .6 * soil), bare); h = 2. * soil + 1.5 * turf * (1. - bare); r = .95; t = 1.;
  vec4 pb = vor(uv * 120., vec2(120), 3, 1.); float peb = (1. - ss(.2, .3, pb.x)) * step(.9, pb.z) * bare;
  c = mix(c, vec3(.28, .26, .22) * (.7 + .5 * pb.w), peb); h += 2. * peb * sqrt(sat(1. - pb.x * 3.));
  for (int L = 0; L < 2; L++) { float sc = float(60 + 23 * L), f = fibres(uv * sc, vec2(sc), 5 + L * 7, .95, .14) * (.35 + .65 * (1. - patchy)); // thatch: dead blades lying flat
    c = mix(c, vec3(.32, .26, .14) * (.6 + .5 * f), ss(.1, .5, f) * .8); h = max(h, f * (2. + float(L))); }
  for (int L = 0; L < 3; L++) { float sc = float(110 + 37 * L), gb = fibres(uv * sc, vec2(sc), 33 + L * 5, .95, .18) * (.5 + .5 * patchy); // living blades
    c = mix(c, vec3(.06, .17, .025) * (.7 + .6 * gb) * (.8 + .4 * hf(floor(uv * sc), 40 + L)), ss(.05, .35, gb)); h = max(h, gb * (4. + float(L))); }
  vec3 cl = vorv(uv * 50., vec2(50), 41, .7); float an = atan(cl.y, cl.x), rr = length(cl.xy);
  float clover = (1. - ss(.0, .03, rr - .2 * (.55 + .45 * abs(cos(1.5 * an))))) * step(.6, cl.z) * ss(.5, .62, fbm(uv * 5., vec2(5), 3, 43));
  c = mix(c, vec3(.04, .12, .025) * (1. + .3 * cl.z), clover); h = max(h, 6.5 * clover); r = mix(r, .6, clover);`);
// interior finishes
set('wallpaper', 1.06, 1024, 1024, .84, .3, `
  float s = fract(uv.x * 2.), seam = min(s, 1. - s) * 530.; // two 53 cm strips
  vec2 g = uv * 8., cl = fract(g); cl.y = fract(g.y + mod(floor(g.x), 2.) * .5);
  float line = 1. - ss(.8, 1.4, (.5 - abs(cl.x - .5)) * 132.5);
  float dd = abs(cl.x - .5) * 1.5 + abs(cl.y - .5), motif = 1. - ss(.12, .132, dd), ring = 1. - ss(.0, .01, abs(dd - .17));
  float fib = vn(uv * 1200., vec2(1200), 3), age = fbm(uv * 5., vec2(5), 5, 5);
  c = vec3(.78, .62, .22) * (.92 + .08 * fib) * (.86 + .2 * age) * (1. - .32 * line - .26 * motif - .14 * ring);
  c *= 1. - .3 * (1. - ss(.15, .5, seam));
  h = .25 * fib + .1 * motif + .05 * ring - .1 * line + .12 * (1. - ss(.5, 3., seam)) - .25 * (1. - ss(0., .3, seam));
  r = .88 - .25 * motif; t = 1.;`);
set('loopCarpet', .5, 1024, 1024, .95, .45, `
  vec4 v = vor(uv * 220., vec2(220), 1, 1.); vec3 nv = vorv(uv * 220., vec2(220), 1, 1.); // tufts, about 2.3 mm
  float tuft = sat(1. - v.x * 1.25), side = ss(.0, .25, v.y - v.x), a = nv.z * 6.28;
  float tw = .5 + .5 * sin(dot(-nv.xy, vec2(cos(a), sin(a))) * 18. + nv.z * 9.); // the twist of the yarn
  float mot = st(fbm(uv * 30., vec2(30), 4, 11), 2.5), clump = fbm(uv * 90., vec2(90), 3, 19), fleck = step(.8, v.w) * (v.w - .8) * 5.;
  h = (.6 + .5 * v.w) * sqrt(tuft) * side + .12 * tw * tuft + .5 * (mot - .5) + .3 * (clump - .5);
  c = vec3(.6, .58, .54) * (.6 + .6 * v.z) * (.5 + .5 * tuft * side) * (.88 + .12 * tw) * (.75 + .45 * mot) * (1. + vec3(.06, 0., -.06) * (v.w - .5));
  c = mix(c, c * vec3(.55, .5, .45), fleck * .7); // darker yarn flecked through it
  r = .95; t = 1.;`);
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
set('hardwood', 1.2, 1024, 1024, .32, .3, `
  float b = floor(uv.y * 8.), fy = fract(uv.y * 8.), r1 = hf(vec2(0., b), 1), r2 = hf(vec2(0., b), 3);
  float groove = 1. - ss(.5, 2.5, min(fy, 1. - fy) * 150.); // V-joints between 15 cm boards
  float x = uv.x * 2. * PI; // each board cut from a log at its own place: rings round a pith below the face, rising and falling along it (cathedral figure)
  float z0 = .07 + .06 * r1 + .03 * sin(x + r2 * 6.) + .01 * sin(3. * x + r1 * 9.), yy = fy * .15 - .075 - .1 * (r2 - .5);
  float d = sqrt(yy * yy + z0 * z0) + .0012 * gn(vec2(uv.x * 20., fy * 6. + b * 3.), vec2(20., 4096.), 5);
  float ring = fract(d * (130. + 60. * r2)), late = ss(.55, .85, ring) * (1. - ss(.93, 1., ring)) * (.6 + .4 * gn(vec2(uv.x * 40., d * 300.), vec2(40., 4096.), 8));
  float pore = step(.8, vn(uv * vec2(2400., 2080.), vec2(2400., 2080.), 7)) * (.4 + late);
  vec3 wood = mix(vec3(.44, .27, .14), vec3(.22, .11, .05), late) * (.75 + .4 * r1) * (.9 + .14 * fbm(uv * vec2(4., 30.), vec2(4., 30.), 4, 9));
  wood *= 1. - .4 * pore;
  c = mix(wood, wood * .3, groove); h = -2.5 * groove * groove + .03 * late - .05 * pore; r = .26 + .14 * pore + .1 * groove + .04 * late; t = 1.;`);
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
set('velvet', .3, 512, 512, .9, .2, `
  float pile = vn(uv * 600., vec2(600), 1) * .5 + vn(uv * 240., vec2(240), 3) * .5;
  float crush = st(fbm(uv * 3. + .6 * vec2(fbm(uv * 3., vec2(3), 3, 5), 0.), vec2(3), 5, 7), 2.5); // crushed pile: lighter and smoother where it lies flat
  c = vec3(.7) * (.65 + .45 * crush) * (.92 + .1 * pile); h = .15 * pile + .3 * crush; r = .9 - .15 * crush; t = 1.;`);
set('vinylFoam', 1, 512, 1024, .45, .3, `
  vec4 v = vor(uv * 380., vec2(380), 1, 1.); float peb = sqrt(sat(1. - v.x * 1.3)) * (.7 + .3 * v.z);
  float du = min(uv.x, 1. - uv.x) * 1000., dv = min(uv.y, 1. - uv.y) * 1000., sd = min(du, dv), al = du < dv ? uv.y : uv.x; // seams on the panel edges
  float pipe = sqrt(sat(1. - sd * sd / 25.)), groove = 1. - ss(.5, 1.5, abs(sd - 6.));
  float stitch = (1. - ss(.4, .8, abs(sd - 11.))) * step(.35, fract(al * 1000. / 5.));
  float wr = exp(-sd / 22.) * (.5 + .5 * sin(al * 1000. / 18. * 2. * PI + 3. * gn(uv * 8., vec2(8), 3))) * ss(.3, .6, gn(uv * 12., vec2(12), 7)); // wrinkles pulled toward the seams
  float scuff = ss(.72, .86, fbm(uv * vec2(6., 24.), vec2(6., 24.), 4, 5));
  h = .05 * peb + 2. * pipe + 1.2 * wr - .3 * stitch - .4 * groove + .3 * fbm(uv * 3., vec2(3), 3, 9);
  c = vec3(.82) * (.96 + .04 * peb) * (1. - .15 * groove); c = mix(c, vec3(.9, .88, .82), stitch); c = mix(c, vec3(.72), scuff * .15);
  r = .42 + .05 * peb + .2 * scuff + .1 * stitch; t = (1. - stitch) * (1. - .3 * scuff);`);
// metals
set('smudge', .5, 512, 512, .1, 0, `
  vec2 p = uv * 5., i = floor(p), f = fract(p); float pr = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y), cc = mod(i + o, vec2(5)); if (hf(cc, 1) < .45) continue;
    vec2 d = o + hf2(cc, 3) - f; float a = hf(cc, 5) * PI; d = mat2(cos(a), sin(a), -sin(a), cos(a)) * d * vec2(1., 1.4);
    float l = length(d) / .1; pr = max(pr, (1. - ss(.6, 1., l)) * (.65 + .35 * sin(l * 40.))); } // fingerprints
  vec4 s = vor(uv * 50., vec2(50), 7, 1.); float spot = (1. - ss(.0, .04, abs(s.x - .18))) * step(.6, s.z); // dried water spots
  c = vec3(.96) * (1. - .05 * spot); m = 1.; r = .04 + .12 * pr + .12 * spot + .04 * fbm(uv * 6., vec2(6), 4, 9); t = 1.;`);
set('brushed', .5, 512, 1024, .27, 0, `
  float br = .5 * vn(uv * vec2(6., 2400.), vec2(6., 2400.), 1) + .3 * vn(uv * vec2(25., 900.), vec2(25., 900.), 3) + .2 * vn(uv * vec2(2., 300.), vec2(2., 300.), 5);
  c = vec3(.72, .72, .73) * (.94 + .1 * br); m = 1.; r = .26 + .14 * (br - .5) + .06 * fbm(uv * 5., vec2(5), 3, 7); h = .02 * br; t = 1.;`);
set('galvanised', 1, 1024, 512, .4, 0, `
  vec4 v = vor(uv * 22., vec2(22), 1, 1.); vec3 nv = vorv(uv * 22., vec2(22), 1, 1.); // spangle: crystals 3-6 cm across, each a slightly different plane
  float a = nv.z * 6.28; vec2 rq = mat2(cos(a), sin(a), -sin(a), cos(a)) * -nv.xy;
  float den = vn(rq * vec2(70., 12.) + 50., vec2(4096), 3) * .6 + vn(rq * vec2(12., 70.) + 50., vec2(4096), 5) * .4; // feathery dendrites
  float edge = 1. - ss(.0, .025, v.y - v.x);
  vec2 tilt = (hf2(vec2(nv.z * 977., 3.), 9) - .5);
  c = vec3(.74, .75, .76) * (.95 + .05 * v.z + .05 * den) * (1. - .05 * edge); m = 1.; r = .3 + .12 * v.w + .1 * den;
  h = dot(-nv.xy, tilt) * 1.2 + .02 * edge + .015 * den; t = 1.;`);
set('anodised', .5, 512, 512, .4, 0, `
  float g = fbm(uv * 600., vec2(600), 2, 1);
  c = vec3(.8) * (.97 + .05 * g); m = 1.; r = .36 + .08 * g + .04 * fbm(uv * 6., vec2(6), 3, 3); h = .006 * g; t = 1.;`);
set('castIron', .5, 512, 512, .52, .3, `
  float s = fbm(uv * 120., vec2(120), 4, 1); vec4 v = vor(uv * 200., vec2(200), 3, 1.); float pit = (1. - ss(.08, .2, v.x)) * step(.85, v.z);
  h = .35 * s - .4 * pit; c = vec3(.045, .045, .05) * (.85 + .5 * s) * (1. - .4 * pit); r = .5 + .12 * (s - .5) + .15 * pit; t = 1.;`);
set('paintedSteel', 1, 1024, 1024, .32, .3, `
  float peel = gn(uv * 320., vec2(320), 1) * .7 + gn(uv * 700., vec2(700), 3) * .3; // orange peel
  vec4 v = vor(uv * 9. + .35 * vec2(fbm(uv * 30., vec2(30), 4, 13), fbm(uv * 30., vec2(30), 4, 15)), vec2(9), 5, 1.);
  float rad = .04 + .09 * v.w, chip = step(.93, v.z) * (1. - ss(rad - .012, rad, v.x)), core = step(.93, v.z) * (1. - ss(rad * .6 - .012, rad * .6, v.x));
  float scr = fibres(uv * 25., vec2(25), 9, .9, .006) * step(.88, hf(floor(uv * 25.), 11));
  c = vec3(.8) * (.98 + .03 * peel) * (.97 + .05 * fbm(uv * 4., vec2(4), 3, 17)); r = .3 + .04 * peel; h = .015 * peel; t = 1.;
  float prim = max(chip - core, scr * .7); // chipped through to red-oxide primer, then to the steel
  c = mix(c, vec3(.42, .2, .14), prim); r = mix(r, .7, prim); t *= 1. - prim; h -= .06 * prim;
  c = mix(c, vec3(.56, .56, .57), core); r = mix(r, .38, core); m = core; t *= 1. - core; h -= .1 * core;`);
// plastics, rubber, glass
set('gelcoat', 1, 512, 512, .04, 0, `
  float fb = fibres(uv * 90., vec2(90), 1, .9, .02) * .5 + fibres(uv * 140. + .3, vec2(140), 3, .9, .02) * .5; // glass fibre printing through
  float seam = 1. - ss(.3, .9, min(uv.x, 1. - uv.x) * 1000.);
  c = vec3(.86) * (1. - .2 * seam); h = .004 * fb - .08 * seam; r = .035 + .01 * fbm(uv * 8., vec2(8), 3, 5) + .2 * seam; t = 1.;`);
set('hardPlastic', 1, 512, 512, .34, 0, `
  float g = fbm(uv * 700., vec2(700), 2, 1), line = 1. - ss(.2, .45, abs(uv.y - .5) * 1000.), haze = ss(.5, .7, fbm(uv * 6., vec2(6), 4, 3));
  c = vec3(.82) * (1. - .04 * haze); h = .006 * g + .05 * line; r = .3 + .05 * g + .2 * haze + .1 * line; t = 1.;`);
set('pvc', 1, 512, 512, .13, 0, `
  float du = min(uv.x, 1. - uv.x) * 1000., weld = 1. - ss(3.5, 4.5, du), lip = 1. - ss(.0, .8, abs(du - 4.)), wr = fbm(uv * vec2(3., 10.), vec2(3., 10.), 4, 1);
  h = .25 * weld + .2 * lip + .3 * wr; c = vec3(.86) * (1. - .06 * weld); r = .12 + .1 * weld + .03 * wr; t = 1.;`);
set('rubber', .5, 512, 512, .85, .2, `
  float g = fbm(uv * 500., vec2(500), 3, 1); c = vec3(.034) * (.9 + .2 * g); h = .05 * g; r = .82 + .08 * g; t = 1.;`);
set('glass', 1, 512, 512, .06, 0, `
  vec3 nv = vorv(uv * 3., vec2(3), 1, 1.); float d = length(nv.xy);
  float wipe = (.5 + .5 * sin(d * 120.)) * (1. - ss(.25, .5, d)) * step(.5, nv.z) * fbm(uv * 30., vec2(30), 3, 5); // wiped arcs
  float dust = step(.97, vn(uv * 900., vec2(900), 3));
  c = vec3(.95); r = .03 + .14 * wipe + .3 * dust; t = 1.;`);
// wood and plants
set('benchWood', 1, 1024, 1024, .34, .3, `
  float wob = gn(uv * vec2(2., 5.), vec2(2., 5.), 1) + .5 * gn(uv * vec2(6., 14.), vec2(6., 14.), 2);
  float rg = uv.y * 110. + 1.6 * wob + .5 * sin(uv.x * 2. * PI + 1.3), ring = fract(rg); // nearly straight, rift-sawn grain
  float late = ss(.5, .85, ring) * (1. - ss(.92, 1., ring)) * (.6 + .4 * gn(vec2(uv.x * 30., rg), vec2(30., 4096.), 4));
  float pore = step(.8, vn(uv * vec2(1800., 1400.), vec2(1800., 1400.), 3)) * (.4 + late), streak = vn(uv * vec2(3., 60.), vec2(3., 60.), 6);
  c = mix(vec3(.55, .36, .2), vec3(.3, .17, .08), late) * (.8 + .3 * streak) * (.88 + .18 * fbm(uv * vec2(3., 20.), vec2(3., 20.), 4, 5)) * (1. - .35 * pore);
  h = .04 * late - .05 * pore; r = .3 + .12 * pore + .04 * late; t = 1.;`);
set('weatheredWood', 1, 1024, 1024, .85, .4, `
  float wob = gn(uv * vec2(2., 5.), vec2(2., 5.), 1) + .5 * gn(uv * vec2(6., 14.), vec2(6., 14.), 2);
  float rg = uv.y * 80. + 1.8 * wob + .6 * sin(uv.x * 2. * PI + .7), ring = fract(rg), late = ss(.5, .85, ring) * (1. - ss(.92, 1., ring));
  vec4 k = vor(uv * vec2(4., 60.), vec2(4., 60.), 7, 1.); float check = (1. - ss(.0, .03, k.y - k.x)) * ss(.55, .7, fbm(uv * vec2(2., 20.), vec2(2., 20.), 3, 9));
  float lich = ss(.62, .75, fbm(uv * 5., vec2(5), 4, 15)), streak = vn(uv * vec2(3., 50.), vec2(3., 50.), 6);
  c = vec3(.46, .44, .41) * (.7 + .3 * (1. - late)) * (.8 + .3 * streak) * (.85 + .2 * fbm(uv * vec2(3., 25.), vec2(3., 25.), 4, 13)) * (1. - .6 * check);
  c = mix(c, c * vec3(.75, .72, .6), lich * .5);
  h = .5 * late - 1.5 * check + .12 * fbm(uv * vec2(20., 400.), vec2(20., 400.), 3, 11) + .2 * streak; r = .85; t = 1.;`);
set('palmTrunk', 1, 512, 1024, .9, .35, `
  float rv = uv.y * 14. + .3 * gn(vec2(uv.x * 3., uv.y * 7.), vec2(3., 7.), 9), ri = floor(rv), rf = fract(rv + .1 * gn(vec2(uv.x * 6., ri), vec2(6., 4096.), 1)); // leaf scars, uneven rings
  float scar = (1. - ss(.0, .06, abs(rf - .5))) * (.6 + .4 * gn(vec2(uv.x * 20., ri), vec2(20., 4096.), 11)), lip = (1. - ss(.0, .05, abs(rf - .56)));
  float fis = 1. - ss(.0, .07, abs(gn(uv * vec2(60., 8.), vec2(60., 8.), 3) - .5)); // fine vertical fissures
  float fib = vn(uv * vec2(400., 40.), vec2(400., 40.), 3), boot = ss(.62, .7, fbm(uv * vec2(3., 4.), vec2(3., 4.), 4, 5)) * ss(.2, .45, rf) * (1. - ss(.55, .9, rf));
  float weave = abs(sin(PI * (uv.x + uv.y) * 240.)) * abs(sin(PI * (uv.x - uv.y) * 240.)); // burlap-like remains of the leaf bases
  h = -1.5 * scar + .8 * lip - .5 * fis + .4 * fib + boot * (2.5 + 1.2 * weave) + 1.2 * fbm(uv * vec2(8., 30.), vec2(8., 30.), 3, 13);
  c = vec3(.27, .25, .22) * (.8 + .25 * fib) * (1. - .45 * scar) * (1. - .25 * fis) * (.8 + .4 * st(fbm(uv * 6., vec2(6), 3, 15), 2.));
  c = mix(c, vec3(.2, .14, .08) * (.7 + .5 * weave), boot); r = .9; t = 1.;`);
set('palmLeaf', .5, 512, 512, .35, .2, `
  float vein = pow(abs(sin(uv.y * 125. * PI)), 3.), mid = 1. - ss(.0, .06, abs(fract(uv.y * 12.5) - .5));
  h = .15 * (1. - vein) + .5 * mid + .05 * fbm(uv * 200., vec2(200), 2, 1);
  c = vec3(.07, .16, .04) * (.9 + .15 * fbm(uv * vec2(4., 40.), vec2(4., 40.), 3, 3)) * (1. + .25 * mid); r = .32 + .1 * vein; t = 1.;`);
// light fittings: t is the emission pattern
set('troffer', .6, 512, 1024, .25, 0, `
  float tubes = exp(-pow((uv.x - .28) / .1, 2.)) + exp(-pow((uv.x - .72) / .1, 2.));
  vec2 p = fract(uv * 150.) - .5; // 4 mm prisms
  float facet = abs(p.x) > abs(p.y) ? sign(p.x) * sign(uv.x < .5 ? .28 - uv.x : .72 - uv.x) : 0.; // faces turned toward a tube catch more of it
  float frame = 1. - ss(.012, .016, min(uv.x, 1. - uv.x) * .6);
  h = mix(1.2 * (.5 - max(abs(p.x), abs(p.y))), 2., frame);
  t = (.22 + .78 * tubes) * (.86 + .22 * facet) * (1. - frame);
  c = mix(vec3(.84, .84, .82), vec3(.78, .78, .76), frame); r = mix(.2, .45, frame);`);
set('opal', .5, 512, 512, .3, 0, `
  vec2 p = fract(uv * 10.) - .5; float led = exp(-dot(p, p) * 9.), mot = fbm(uv * 8., vec2(8), 4, 1); // LEDs on a 5 cm grid, softened by the diffuser
  t = .7 + .16 * led + .14 * mot; c = vec3(.9); r = .28 + .05 * mot; h = .01 * fbm(uv * 300., vec2(300), 2, 3);`);
set('ledTube', .3, 512, 512, .25, 0, `
  float p = fract(uv.x * 30.) - .5; t = .7 + .3 * exp(-p * p * 14.); c = vec3(.9); r = .25; h = .08 * (.5 + .5 * sin(uv.y * 2. * PI * 60.));`);

// The library's textures, made on first use: { A, B } (A null for the detail set). bakeLibrary() fills every one in use.
const queue = [];
const rnd = new Float32Array(256 * 256 * 4); for (let i = 0, x = 12345; i < rnd.length; i++) { x = Math.imul(x ^ (x >>> 15), 2246822519) + 374761393 | 0; x ^= x >>> 13; rnd[i] = (x >>> 0) / 4294967296; }
const tR = new THREE.DataTexture(rnd, 256, 256, THREE.RGBAFormat, THREE.FloatType); tR.needsUpdate = true;
const rt = (n, srgb) => new THREE.WebGLRenderTarget(n, n, { depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: maxA,
  minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace });
function libTex(name) {
  const s = sets[name]; if (!s) throw new Error('no texture set ' + name);
  if (!s.B) { s.A = s.a ? rt(s.a, true) : null; s.B = rt(s.b, false); queue.push(s); }
  return s;
}
const detailTex = libTex('detail').B.texture;
const libStats = { ms: 0, compileMs: 0, sets: 0, bytes: 0, programs: 0 }; // what the last bake cost
const P2 = `uniform highp sampler2D t0, t1; uniform int uN, uK; uniform float uMM, uCav; layout(location = 0) out highp vec4 o0;
  vec4 T0(ivec2 p) { return texelFetch(t0, (p + uN) % uN, 0); } float H(ivec2 p) { return T0(p).a; }`;
const pass2A = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: quadVS, uniforms: { t0: { value: null }, t1: { value: null }, uN: { value: 1 }, uK: { value: 1 }, uMM: { value: 1 }, uCav: { value: 0 } },
  fragmentShader: `${P2}
  void main() { // albedo: a box-filtered block of the bake, darkened where it sits below the height around it
    ivec2 o = ivec2(gl_FragCoord.xy) * uK; vec3 c = vec3(0); float t = 0., k2 = float(uK * uK);
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) { if (x >= uK || y >= uK) continue; ivec2 p = o + ivec2(x, y); c += T0(p).rgb; t += texelFetch(t1, p % uN, 0).b; }
    ivec2 m = o + uK / 2; float h0 = H(m), sum = 0.; int R = clamp(int(2.5 / uMM), 1, 16);
    for (int i = 0; i < 16; i++) { float a = float(i) * .3927 + float(i & 1) * .2; ivec2 d = ivec2(vec2(cos(a), sin(a)) * float(R * (1 + (i & 1)))); sum += H(m + d); }
    o0 = vec4(c / k2 * clamp(1. - uCav * max(0., sum / 16. - h0), .3, 1.), t / k2); }` });
const pass2B = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: quadVS, uniforms: pass2A.uniforms,
  fragmentShader: `${P2}
  void main() { // normal from the height at its true scale, plus roughness and metalness, box-filtered
    ivec2 o = ivec2(gl_FragCoord.xy) * uK; vec2 n = vec2(0); vec2 rm = vec2(0); float k2 = float(uK * uK);
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) { if (x >= uK || y >= uK) continue; ivec2 p = o + ivec2(x, y);
      float a = H(p + ivec2(-1, -1)), b = H(p + ivec2(0, -1)), c = H(p + ivec2(1, -1)), d = H(p + ivec2(-1, 0)), e = H(p + ivec2(1, 0)), f = H(p + ivec2(-1, 1)), g = H(p + ivec2(0, 1)), h = H(p + ivec2(1, 1));
      vec3 nn = normalize(vec3(-((c + 2. * e + h) - (a + 2. * d + f)) / (8. * uMM), -((f + 2. * g + h) - (a + 2. * b + c)) / (8. * uMM), 1.));
      n += nn.xy; rm += texelFetch(t1, p % uN, 0).rg; }
    o0 = vec4(n / k2 * .5 + .5, rm / k2); }` });

async function bakeLibrary() { // run once, after every place has asked for its materials and before anything is drawn (level.js)
  if (!queue.length) return;
  const t0 = performance.now(), list = queue.splice(0), N = Math.max(...list.map(s => Math.max(s.a, s.b)));
  const scratch = new THREE.WebGLRenderTarget(N, N, { count: 2, type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  for (const s of list) s.p1 = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: quadVS, uniforms: { tR: { value: tR }, uOne: { value: 1 } }, fragmentShader: `precision highp float; precision highp int;
    varying vec2 vUv; layout(location = 0) out highp vec4 o0; layout(location = 1) out highp vec4 o1;
    #define SZ ${s.m.toFixed(4)}
    ${GLIB}\n${s.glsl}
    void main() { vec3 c = vec3(.5); float h = 0., r = .5, m = 0., t = 1.; surf(vUv, c, h, r, m, t); o0 = vec4(c, h); o1 = vec4(r, m, t, 0.); }` });
  const sc = new THREE.Scene(), quad = new FullScreenQuad();
  for (const m of [...list.map(s => s.p1), pass2A, pass2B]) { const q = new THREE.Mesh(quad._mesh.geometry, m); q.frustumCulled = false; sc.add(q); }
  renderer.setRenderTarget(scratch); // the programs must be made for drawing into a target, as they will be
  await renderer.compileAsync(sc, new THREE.Camera()); // all at once, in parallel where the browser can
  libStats.compileMs += performance.now() - t0;
  const u = pass2A.uniforms; u.t0.value = scratch.textures[0]; u.t1.value = scratch.textures[1];
  for (const s of list) {
    const n = Math.max(s.a, s.b); scratch.viewport.set(0, 0, n, n);
    renderer.setRenderTarget(scratch); quad.material = s.p1; quad.render(renderer);
    u.uN.value = n; u.uMM.value = s.m * 1000 / n; u.uCav.value = s.cav;
    if (s.A) { u.uK.value = n / s.a; renderer.setRenderTarget(s.A); quad.material = pass2A; quad.render(renderer); }
    u.uK.value = n / s.b; renderer.setRenderTarget(s.B); quad.material = pass2B; quad.render(renderer);
    s.p1.dispose(); delete s.p1;
    libStats.bytes += ((s.a * s.a) + s.b * s.b) * 4 * 1.33; libStats.sets++;
  }
  renderer.setRenderTarget(null); scratch.dispose(); libStats.programs += list.length + 2;
  libStats.ms += performance.now() - t0;
}

// The shared materials the places used before the library, as handles P() in mat.js turns into library materials (see mat.js).
const concrete = { lib: 'concreteFloor' }, hotelTex = { map: { lib: 'hotelCarpet' }, normalMap: { lib: 'hotelCarpet' } };

export { hash, noise, fbm, ss, maxA, makeTex, grime, waves, wn0, wn1, concrete, hotelTex, sets, libTex, detailTex, bakeLibrary, libStats };
