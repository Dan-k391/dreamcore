// Procedural textures: the tools that make them and the ones more than one place uses.
// Two engines: makeTex (CPU, one JS call per pixel; kept for the few small textures still made with it) and the material
// library (GPU): every set (js/tex/<family>.js) is a GLSL function baked once at load into an albedo and a normal/roughness/metal texture.
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
    const j = i * 4; col[j] = r * 255; col[j + 1] = g * 255; col[j + 2] = b * 255; col[j + 3] = 255; rgh[j] = rgh[j + 1] = rgh[j + 2] = ro * 255; rgh[j + 3] = 255; hgt[i] = h;
  }
  for (let y = 0, i = 0; y < n; y++) for (let x = 0; x < n; x++, i++) {
    const dx = (hgt[y * n + (x + 1) % n] - hgt[y * n + (x + n - 1) % n]) * bump, dy = (hgt[((y + 1) % n) * n + x] - hgt[((y + n - 1) % n) * n + x]) * bump, l = 127.5 / Math.sqrt(dx * dx + dy * dy + 1);
    const j = i * 4; nor[j] = 127.5 - dx * l; nor[j + 1] = 127.5 - dy * l; nor[j + 2] = 127.5 + l; nor[j + 3] = 255;
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
const waves = (s, n) => { // tileable ripple heightfield -> water normal map, on an n x n grid
  const w = []; for (let i = 0; i < 14; i++) w.push([Math.round(hash(i, s) * 12 - 6) || 1, Math.round(hash(i, s + 9) * 12 - 6), hash(i, s + 5) * 6.28]);
  // sin(A + B) = sin A cos B + cos A sin B, A from the column and B from the row: tables of 14 x n instead of 14 sines a texel
  const T = w.map(([a, b, p]) => { const t = new Float64Array(n * 4), k = 1 / Math.hypot(a, b);
    for (let i = 0; i < n; i++) { const A = 6.2832 * a * i / n + p, B = 6.2832 * b * i / n; t[i * 4] = Math.sin(A) * k; t[i * 4 + 1] = Math.cos(A) * k; t[i * 4 + 2] = Math.cos(B); t[i * 4 + 3] = Math.sin(B); }
    return t; });
  return (u, v, x, y) => { let h = 0; for (const t of T) h += t[x * 4] * t[y * 4 + 2] + t[x * 4 + 1] * t[y * 4 + 3]; return [0, 0, 0, h, 0]; };
};
const wn0 = makeTex(512, 6, waves(1, 512), 2).normalMap, wn1 = makeTex(512, 6, waves(2, 512), 2).normalMap;

// ---------- the material library: GPU-baked texture sets ----------
// A set is the body of surf(uv, c, h, r, m, t): uv runs 0..1 over SZ metres and must tile. It writes linear albedo c, height h in
// millimetres (normals are derived from it at the true scale), roughness r, metalness m and t: how much of the material's colour
// tints this texel (0 keeps the baked colour: grout, chips, stitching), or for an emitter set the emission pattern.
// Baked into A (sRGB: albedo, darkened in crevices by the height; alpha t) and B (linear: normal xy, roughness, metalness).
// The sets and the materials made from them live in one file per family in js/tex/; the GLSL they are written with in js/tex/blocks.js.
import { GLIB } from './tex/blocks.js';
import { sets, LIB, set } from './tex/registry.js';
import './tex/ceramicStone.js';
import './tex/mineral.js';
import './tex/ground.js';
import './tex/textile.js';
import './tex/metal.js';
import './tex/plastic.js';
import './tex/wood.js';
import './tex/light.js';

// shared micro detail, tiled every 10 cm by every library material: rg micro normal, b micro roughness, a a smooth field that
// the shared shader also samples at several large scales in world space (the macro variation)
set('detail', .1, 0, 512, .5, 0, `
  float g = fbm(uv * 32., vec2(32), 4, 1); vec4 v = vor(uv * 24., vec2(24), 3, 1.);
  h = .05 * g - .04 * (1. - ss(.05, .15, v.x)) * step(.8, v.z);
  r = .5 + .8 * (fbm(uv * 12., vec2(12), 3, 5) - .5);
  m = .5 + .5 * tanh((fbm(uv * 4., vec2(4), 5, 7) - .5) * 5.); // stretched softly: no flat plateaus with edges (they read as camouflage blotches)`);

// The library's textures, made on first use: { A, B } (A null for the detail set). bakeLibrary() fills every one in use.
const queue = [];
const rnd = new Float32Array(256 * 256 * 4); for (let i = 0, x = 12345; i < rnd.length; i++) { x = Math.imul(x ^ (x >>> 15), 2246822519) + 374761393 | 0; x ^= x >>> 13; rnd[i] = (x >>> 0) / 4294967296; }
const tR = new THREE.DataTexture(rnd, 256, 256, THREE.RGBAFormat, THREE.FloatType); tR.needsUpdate = true;
const rt = (n, srgb) => new THREE.WebGLRenderTarget(n, n, { depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: maxA,
  minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace });
const quad = new FullScreenQuad(), pre = new THREE.Scene(), preRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, depthBuffer: false });
const p1Of = s => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: quadVS, uniforms: { tR: { value: tR }, uOne: { value: 1 }, uOut: { value: 0 } }, fragmentShader: `precision highp float; precision highp int;
    varying vec2 vUv; uniform int uOut; layout(location = 0) out highp vec4 o0;
    #define SZ ${s.m.toFixed(4)}
    #define NPX ${Math.max(s.a, s.b).toFixed(1)}
    ${GLIB}\n${s.glsl}
    void main() { vec3 c = vec3(.5); float h = 0., r = .5, m = 0., t = 1.; surf(vUv, c, h, r, m, t); o0 = uOut == 0 ? vec4(c, h) : vec4(r, m, t, 0.); }` });
function compileEarly(m) { // hand a bake program to the GPU now, while the places are still being built on the CPU: by bakeLibrary() it is compiled
  const q = new THREE.Mesh(quad._mesh.geometry, m); q.frustumCulled = false; pre.add(q);
  renderer.setRenderTarget(preRT); renderer.compile(q, new THREE.Camera(), pre); renderer.setRenderTarget(null); // for drawing into a float target, as it will be
  renderer.getContext().flush(); pre.remove(q);
}
function libTex(name) {
  const s = sets[name]; if (!s) throw new Error('no texture set ' + name);
  if (!s.B) { s.A = s.a ? rt(s.a, true) : null; s.B = rt(s.b, false); queue.push(s); compileEarly(s.p1 = p1Of(s)); }
  return s;
}
const detailTex = libTex('detail').B.texture;
const libStats = { ms: 0, compileMs: 0, sets: 0, bytes: 0, programs: 0 }; // what the last bake cost (programs: made for it, all freed after)
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
  const float G[5] = float[5](1., 4., 6., 4., 1.), D[5] = float[5](-1., -2., 0., 2., 1.);
  void main() { // normal from the height at its true scale, plus roughness and metalness, box-filtered
    ivec2 o = ivec2(gl_FragCoord.xy) * uK; vec2 n = vec2(0); vec2 rm = vec2(0); float k2 = float(uK * uK);
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) { if (x >= uK || y >= uK) continue; ivec2 p = o + ivec2(x, y);
      // the slope by a 5x5 derivative of a Gaussian, not a 3x3 Sobel: a joint or a step a texel wide gives a smooth
      // normal instead of a one-texel spike, so edges don't alias into stepped double lines in raking light
      vec2 g = vec2(0); for (int j = 0; j < 5; j++) for (int i = 0; i < 5; i++) g += vec2(D[i] * G[j], G[i] * D[j]) * H(p + ivec2(i - 2, j - 2));
      vec3 nn = normalize(vec3(-g / (128. * uMM), 1.));
      n += nn.xy; rm += texelFetch(t1, p % uN, 0).rg; }
    o0 = vec4(n / k2 * .5 + .5, rm / k2); }` });
compileEarly(pass2A); compileEarly(pass2B);

async function bakeLibrary() { // run once, after every place has asked for its materials and before anything is drawn (level.js)
  if (!queue.length) return;
  const t0 = performance.now(), list = queue.splice(0), N = Math.max(...list.map(s => Math.max(s.a, s.b)));
  // Two single targets, the set's shader drawn once into each (uOut picks what it writes), not one two-target draw: ANGLE on
  // D3D11 compiles a program ahead (compileAsync, in parallel) only for its first output, so a two-output program was compiled
  // again, one after another, on its first draw (30-250 ms a set). Drawing it twice costs a few ms; the texels are the same.
  const sc0 = () => new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const scratch = [sc0(), sc0()];
  const sc = new THREE.Scene(); // the programs were handed to the GPU as each set was first asked for (compileEarly): this waits for them
  for (const m of [...list.map(s => s.p1), pass2A, pass2B]) { const q = new THREE.Mesh(quad._mesh.geometry, m); q.frustumCulled = false; sc.add(q); }
  renderer.setRenderTarget(scratch[0]); // the programs must be made for drawing into a target, as they will be
  await renderer.compileAsync(sc, new THREE.Camera()); // all at once, in parallel where the browser can
  libStats.compileMs += performance.now() - t0; performance.mark('load: library compiled');
  const u = pass2A.uniforms; u.t0.value = scratch[0].texture; u.t1.value = scratch[1].texture;
  for (const s of list) {
    const n = Math.max(s.a, s.b); quad.material = s.p1;
    for (let k = 0; k < 2; k++) { scratch[k].viewport.set(0, 0, n, n); s.p1.uniforms.uOut.value = k; renderer.setRenderTarget(scratch[k]); quad.render(renderer); }
    u.uN.value = n; u.uMM.value = s.m * 1000 / n; u.uCav.value = s.cav;
    if (s.A) { u.uK.value = n / s.a; renderer.setRenderTarget(s.A); quad.material = pass2A; quad.render(renderer); }
    u.uK.value = n / s.b; renderer.setRenderTarget(s.B); quad.material = pass2B; quad.render(renderer);
    s.p1.dispose(); delete s.p1;
    libStats.bytes += ((s.a * s.a) + s.b * s.b) * 4 * 1.33; libStats.sets++;
  }
  renderer.setRenderTarget(null); for (const t of scratch) t.dispose(); pass2A.dispose(); pass2B.dispose(); quad.dispose(); preRT.dispose(); // three remakes them if a later bake needs them
  libStats.programs += list.length + 2;
  libStats.ms += performance.now() - t0;
}

// The shared materials the places used before the library, as handles P() in mat.js turns into library materials (see mat.js).
const concrete = { lib: 'concreteFloor' }, hotelTex = { map: { lib: 'hotelCarpet' }, normalMap: { lib: 'hotelCarpet' } };

export { hash, noise, fbm, ss, maxA, makeTex, grime, waves, wn0, wn1, concrete, hotelTex, sets, LIB, libTex, detailTex, bakeLibrary, libStats };
