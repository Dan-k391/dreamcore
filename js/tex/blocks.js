// The GLSL every texture set is written with: noise, hashing and the building blocks (tiles and joints, variation, veins,
// cracks, fibres, weaves, loops, scratches, pits, chips, stains). Shared by all families: change it only for all of them.
// Defined by the bake for each set: SZ, the metres the set covers, and NPX, the texels it is baked at across.
// Lengths a block takes in mm are true sizes on the surface; a block never makes an edge sharper than the bake can hold.
export const GLIB = `
#define PI 3.14159265
#define ss smoothstep
#define TX (1. / NPX)          // uv per bake texel
#define MMPX (SZ * 1000. / NPX) // mm per bake texel
float sat(float x) { return clamp(x, 0., 1.); }
float st(float x, float k) { return sat((x - .5) * k + .5); } // stretch a noise's contrast about its middle (fbm is mostly .4-.6)
float aa(float d, float w) { return 1. - ss(w - .7 * MMPX, w + .7 * MMPX, d); } // 1 where d < w (both mm), edge filtered to the texel
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
float ridged(vec2 p, vec2 n, int o, int s) { float a = 0., w = .5, t = 0.; // ridged fbm: sharp crests where the noise crosses its middle, 0..1
  for (int i = 0; i < o * uOne; i++) { a += w * (1. - abs(gn(p, n, s + i * 13) * 2. - 1.)); t += w; p *= 2.; n *= 2.; w *= .5; } return a / t; }
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
float crackNet(vec2 uv, float k, int s, float w, float cover) { // a network of hairline cracks, only where a mask allows (older form of cracks())
  vec4 v = vor(uv * k + .3 * vec2(fbm(uv * k * 2., vec2(k * 2.), 4, s), fbm(uv * k * 2., vec2(k * 2.), 4, s + 1)), vec2(k), s + 2, 1.);
  return (1. - ss(0., w, v.y - v.x)) * ss(1. - cover, 1. - cover + .08, fbm(uv * max(1., k * .5), vec2(max(1., k * .5)), 3, s + 3)); }

// ---------- building blocks ----------
// Tiles, bricks, boards, panels: n cells across the set; off shifts each row by that fraction of a cell (0 a grid, .5 running
// bond; off * n.y must be whole for the set to tile). id: the cell (wrapped), f: 0..1 across it, mm: its size, e: mm to its
// nearest edge, r: four hashes of the cell (use them for colour, gloss and tilt).
struct Cell { vec2 id, f, mm; float e; vec4 r; };
Cell tiles(vec2 uv, vec2 n, float off, int s) { Cell c; vec2 g = uv * n; float row = floor(g.y); g.x += off * row;
  c.id = vec2(mod(floor(g.x), n.x), mod(row, n.y)); c.f = fract(g); c.mm = SZ * 1000. / n;
  c.e = min(min(c.f.x, 1. - c.f.x) * c.mm.x, min(c.f.y, 1. - c.f.y) * c.mm.y); c.r = hr(c.id, s); return c; }
// A joint w mm wide between faces: the face's height, 0 in the joint rising over a rounded shoulder sh mm wide to 1 on the
// face (no crease, never steeper than the bake holds: no stepped, aliased lines in raking light). Scale it by the joint's depth.
float jointH(float e, float w, float sh) { return ss(w * .5, w * .5 + max(sh, 2.5 * MMPX), e); }
float jointMask(float e, float w) { return 1. - aa(e, w * .5); } // 1 on the face, 0 in the joint (for colour and roughness)
vec3 cellCol(vec3 c, vec4 r, float k) { return c * (1. + k * (r.x - .5) * 2.) * (1. + k * .3 * vec3(1., 0., -1.) * (r.y - .5) * 2.); } // brightness +-k, a little warmer or cooler
float cellGloss(float rough, vec4 r, float k) { return rough * (1. + k * (r.w - .5) * 2.); } // roughness +-k (fraction)
float cellTilt(Cell c, float k) { return dot(c.f - .5, c.r.zw - .5) * 2. * k; } // height (mm): each cell k mm out of plane across, so reflections break per tile

// Variation at three scales at once (the set's size, a sixth and a fortieth of it), centred on 0, about -1..1. What keeps
// a surface reading at every distance; the shared shader adds world-space variation larger than any set on top (macro).
float multi(vec2 uv, int s) { return (st(fbm(uv * 2., vec2(2), 3, s), 2.5) - .5) * 1.1 + (st(fbm(uv * 12., vec2(12), 3, s + 3), 2.5) - .5) * .6 + (fbm(uv * 80., vec2(80), 2, s + 5) - .5) * .8; }
// Veins: crisp lines w mm wide along an isoline of noise of k cells across the set (warp uv first for marble-like flow).
// Constant width wherever the noise is steep or flat, because the distance is measured by the noise's gradient.
float vein(vec2 uv, float k, float w, int o, int s) { float f = fbm(uv * k, vec2(k), o, s), fx = fbm((uv + vec2(TX, 0.)) * k, vec2(k), o, s), fy = fbm((uv + vec2(0., TX)) * k, vec2(k), o, s);
  float g = length(vec2(fx - f, fy - f)) / MMPX; return aa(abs(f - .5) / max(g, 1e-6), w * .5); }
// Cracks: a wandering network (k cells across the set), w mm wide at most and narrowing along its length, only where
// a coverage field (0..1) allows. 1 in the crack.
float cracks(vec2 uv, float k, float w, float cover, int s) {
  vec4 v = vor(uv * k + .35 * vec2(fbm(uv * k * 2., vec2(k * 2.), 4, s), fbm(uv * k * 2., vec2(k * 2.), 4, s + 1)), vec2(k), s + 2, 1.);
  float d = (v.y - v.x) * .5 * SZ * 1000. / k, ww = w * (.3 + .7 * fbm(uv * k * 6., vec2(k * 6.), 2, s + 4));
  return aa(d, ww * .5) * ss(1. - cover, 1. - cover + .08, fbm(uv * max(1., floor(k * .5)), vec2(max(1., floor(k * .5))), 3, s + 3)); }
// Plain weave of n threads across the set, warp along v: x the height 0..1, y 1 where a warp thread is on top (0 weft), z 0..1 along the thread.
vec3 weave(vec2 uv, vec2 n) { vec2 g = uv * n, i = floor(g), f = fract(g); float wp = mod(i.x + i.y, 2.), ac = wp > .5 ? f.x : f.y, al = wp > .5 ? f.y : f.x;
  return vec3(sqrt(sat(1. - pow(ac * 2. - 1., 2.))) * (.65 + .35 * sin(PI * al)), wp, al); }
// Loop pile: staggered rows of yarn loops, n across the set (n.y even): x height 0..1, y a hash of the loop, z 1 on a loop (0 between).
vec3 loops(vec2 uv, vec2 n, int s) { vec2 g = uv * n; float row = floor(g.y); g.x += .5 * mod(row, 2.); vec2 i = vec2(mod(floor(g.x), n.x), mod(row, n.y));
  vec2 f = fract(g) - .5 + (hf2(i, s) - .5) * .25; float d = length(f * vec2(1.5, 1.)), on = 1. - ss(.34, .5, d);
  return vec3(on * (1. - 1.6 * d * d) * (.7 + .3 * hf(i, s + 1)), hf(i, s + 2), on); }
// Scratches: straight strokes w mm wide at three sizes, many short fine ones and a few long ones (k cells across the set for
// the longest, density 0..1). 0..1.
float scratches(vec2 uv, float k, float w, float dens, int s) { float a = 0.;
  for (int L = 0; L < 3; L++) { float sc = k * float(1 + 2 * L), cm = SZ * 1000. / sc; vec2 p = uv * sc;
    a = max(a, fibres(p, vec2(sc), s + 17 * L, .95, max(w * (1. - .3 * float(L)) / cm, 1.5 / NPX * sc)) * step(1. - dens * (.4 + .3 * float(L)), hf(floor(p), s + 5 + L))); }
  return a; }
// Pits: round holes up to r mm across, many small and few big (three sizes, density 0..1), k cells across the set for the biggest. Depth 0..1.
float pits(vec2 uv, float k, float r, float dens, int s) { float d = 0.;
  for (int L = 0; L < 3; L++) { float sc = k * float(1 + 2 * L); vec4 v = vor(uv * sc, vec2(sc), s + 7 * L, 1.); float rr = r * .5 * pow(.45, float(L)) * (.4 + .6 * v.w), dm = v.x * SZ * 1000. / sc;
    d = max(d, step(1. - dens, v.z) * aa(dm, rr) * sqrt(sat(1. - dm * dm / (rr * rr)))); }
  return d; }
// A chip out of a cell's corner, about r mm across, on a fraction prob of the cells: 1 where it is chipped away.
float chip(Cell c, vec2 uv, float r, float prob, int s) { vec4 h = hr(c.id, s); vec2 k = vec2(step(.5, h.y), step(.5, h.z));
  float d = length((c.f - k) * c.mm) + r * .4 * (gn(uv * 300., vec2(300), s + 1) - .5) * 2.; return step(h.x, prob) * aa(d, r * (.6 + .4 * h.w)); }
// Stains: blotches soaked in (k across the set, cover 0..1): x the stain 0..1, y its tide mark, the darker rim where it dried.
vec2 stain(vec2 uv, float k, float cover, int s) { float n = fbm(uv * k, vec2(k), 5, s), t = mix(.7, .45, cover);
  return vec2(ss(t, t + .05, n), 1. - ss(0., .012, abs(n - t))); }
`;
