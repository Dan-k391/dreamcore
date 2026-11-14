// Procedural textures: the tools that make them and the ones more than one place uses.
import * as THREE from 'three';
import { renderer } from './core.js';

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

const tileTex = makeTex(1024, 1, (u, v) => { // 10cm glazed tiles, each slightly tilted so reflections break up per tile
  const tu = u * 10 % 1, tv = v * 10 % 1, iu = Math.floor(u * 10), iv = Math.floor(v * 10);
  const g = ss(.015, .045, Math.min(tu, 1 - tu, tv, 1 - tv)), n = noise(u * 80, v * 80, 80), c = .58 + g * (.33 + .05 * hash(iu, iv));
  return [c * .975, c, c * .995, g + ((tu - .5) * (hash(iu + 31, iv) - .5) + (tv - .5) * (hash(iu, iv + 57) - .5)) * 1.5 + n * .015, .8 - g * (.72 - .1 * n)];
}, 1.5);
const lampTex = makeTex(256, .6, (u, v) => { // prismatic diffuser with two tubes glowing behind it
  const c = (.5 + .5 * (Math.exp(-(((u - .28) / .11) ** 2)) + Math.exp(-(((u - .72) / .11) ** 2)))) * (.93 + .07 * Math.sin(u * 251.3) * Math.sin(v * 251.3));
  return [c, c * .97, c * .88, 0, .3];
});
const grime = makeTex(256, 9, (u, v) => [0, 0, 0, 0, .5 + .8 * fbm(u, v, 3, 5)]).roughnessMap; // large-scale mottling, breaks up tiling
const waves = s => { // tileable ripple heightfield -> water normal map
  const w = []; for (let i = 0; i < 14; i++) w.push([Math.round(hash(i, s) * 12 - 6) || 1, Math.round(hash(i, s + 9) * 12 - 6), hash(i, s + 5) * 6.28]);
  return (u, v) => { let h = 0; for (const [a, b, p] of w) h += Math.sin(6.2832 * (a * u + b * v) + p) / Math.hypot(a, b); return [0, 0, 0, h, 0]; };
};
const wn0 = makeTex(512, 6, waves(1), 2).normalMap, wn1 = makeTex(512, 6, waves(2), 2).normalMap;
const plaster = makeTex(512, 2, (u, v) => { const n = fbm(u, v, 8, 5), f = noise(u * 200, v * 200, 200), c = .86 + .1 * n + .04 * f; return [c, c, c, f * .3 + n, .85]; }, .8); // painted wall: white, so each material's colour is the paint
const concrete = makeTex(512, 3, (u, v, x, y) => { const n = fbm(u, v, 4, 6), pit = Math.min(1, Math.pow(noise(u * 90, v * 90, 90), 8) * 6), c = .5 + .16 * n - .07 * pit + .025 * hash(x, y); return [c, c, c * .98, n * 1.5 - pit + .3 * hash(x, y), .75 + .2 * n]; }, 1.2);
const hotelTex = makeTex(512, 1.2, (u, v) => { // burgundy carpet: gold lattice with a flower in each cell
  const cu = u * 6 % 1 - .5, cv = v * 6 % 1 - .5, gold = Math.abs(Math.abs(cu) + Math.abs(cv) - .5) < .035 || Math.hypot(cu, cv) < .13 + .05 * Math.cos(6 * Math.atan2(cv, cu)), f = noise(u * 256, v * 256, 256), k = .75 + .35 * f;
  return gold ? [.72 * k, .55 * k, .2 * k, f, 1] : [.42 * k, .06 * k, .09 * k, f, 1]; });

export { hash, noise, fbm, ss, maxA, makeTex, tileTex, lampTex, grime, waves, wn0, wn1, plaster, concrete, hotelTex };
