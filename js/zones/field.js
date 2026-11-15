// The field on the hills, at the end of the hotel hallway's dark passage.
import * as THREE from 'three';
import { scene, camera, uTime, sunDir, dry, zones, defZone } from '../core.js';
import { hash, noise, fbm, ss, makeTex, concrete } from '../tex.js';
import { M, P, wallMat, paintedBall } from '../mat.js';
import { colliders, flats, seeThrough, skyOnly, onSun, loose, add, block, box } from '../build.js';
import { streetLamp } from '../props/lights.js';
import { doorway } from '../props/metalwork.js';
import { swingSet, slide, roundabout, springRider } from '../props/play.js';
import { parkBench, picnicTable, fence } from '../props/garden.js';
import { kerb, steps } from '../props/structure.js';

defZone('fD', { music: 'field', ...dry, step: 'carpet', sky: 'hill', air: 1, grp: 'f', k: 1, exp: .3, fog: [.72, .82, .95, .002], sat: 1.15, bloom: .07, shaft: .04, wet: 0, box: [-50, 665.6, 58, 760], probe: [4, 6, 690] });
// ---------- the field: reached through the dark passage at the end of the hotel hallway ----------
// Rolling ground, written once for the walking floor and once for the shaders that plant grass on it. Flat at the door and at the playground, rising to a rim all round.
const hill = (x, z) => { const h = (3 + 2.2 * Math.sin(x * .07 + 1) * Math.cos(z * .06) + 1.4 * Math.sin(x * .13 + z * .11) + .5 * Math.sin(x * .31) * Math.cos(z * .27) + 12 * ss(40, 62, Math.hypot(x - 4, z - 712)) ** 2) * ss(5, 22, Math.hypot(x - 3.8, z - 665.6));
  return 3.2 + (h - 3.2) * ss(10, 18, Math.hypot(x + 18, z - 705)); };
const hillGLSL = `float hillH(vec2 p) { float r = smoothstep(40., 62., distance(p, vec2(4., 712.)));
  float h = (3. + 2.2 * sin(p.x * .07 + 1.) * cos(p.y * .06) + 1.4 * sin(p.x * .13 + p.y * .11) + .5 * sin(p.x * .31) * cos(p.y * .27) + 12. * r * r) * smoothstep(5., 22., distance(p, vec2(3.8, 665.6)));
  return 3.2 + (h - 3.2) * smoothstep(10., 18., distance(p, vec2(-18., 705.))); }`;
let grass;
{ const z = zones.fD, W = wallMat(z, 0xf4f1ea), G = M(z, 'grassGround'), stone = P(z, { ...concrete, color: 0xd8d2c4 }),
    red = P(z, { color: 0xc8322c, roughness: .35 }), blue = P(z, { color: 0x2f6fc0, roughness: .35 }), y0 = 3.2;
  const g = new THREE.PlaneGeometry(180, 180, 240, 240).rotateX(-Math.PI / 2).translate(4, 0, 712), q = g.attributes.position;
  for (let i = 0; i < q.count; i++) { const x = q.getX(i), zz = q.getZ(i); q.setY(i, zz < 665.2 && Math.abs(x - 3.8) < 3 ? -5 : hill(x, zz)); g.attributes.uv.setXY(i, x, zz); } // sunk under the passage behind the end wall: it has its own floor
  g.computeVertexNormals(); const land = new THREE.Mesh(g, G); land.castShadow = land.receiveShadow = true; scene.add(land);
  flats.push([-60, 665.6, 70, 790, hill]); colliders.push([-46, 665, -44, 760], [52, 665, 54, 760], [-46, 757, 54, 759], [-90, 665.2, 2.8, 665.65], [4.8, 665.2, 98, 665.65]); // the hills climb higher than the end wall either side of the door: it stops you at any height
  box(W, -90, -3, 665.2, 2.8, 9, 665.65); box(W, 4.8, -3, 665.2, 98, 9, 665.65); box(W, 2.8, 2.4, 665.2, 4.8, 9, 665.65); // one long white wall across the hills, and the door you came through
  block(stone, 2, -.2, 665.2, 5.6, .03, 668.6); // the hardstanding runs back through the doorway as its threshold
  // a tarmac path from the door down to the playground, draped on the hill: straight runs with round joins (the grass below keeps off the same shape)
  { const pts = [[3.8, 668.3], [2.6, 672.2], [-11.9, 697.6], [-11.9, 706.6]], hw = .7, st = [], pos = [], idx = [];
    for (let i = 0; i + 1 < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(L / .4), nx = -(z2 - z1) / L, nz = (x2 - x1) / L;
      if (i) { const p = st[st.length - 1], a0 = Math.atan2(p[3], p[2]), a1 = Math.atan2(nz, nx); let da = a1 - a0; da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));
        for (let k = 1; k < 8; k++) st.push([x1, z1, Math.cos(a0 + da * k / 8), Math.sin(a0 + da * k / 8)]); } // the round join, turning about the corner
      for (let k = 0; k <= n; k++) st.push([x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n, nx, nz]); }
    for (const [x, zc, nx, nz] of st) for (const o of [-1, -.85, 0, .85, 1]) { const px = x + nx * o * hw, pz = zc + nz * o * hw; pos.push(px, hill(px, pz) + (Math.abs(o) < 1 ? .022 : -.004), pz); } // the edge tucked into the ground
    for (let i = 0; i + 1 < st.length; i++) for (let k = 0; k < 4; k++) { const a = i * 5 + k; idx.push(a, a + 1, a + 5, a + 1, a + 6, a + 5); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.length / 3 * 2, 2)); g.setIndex(idx); g.computeVertexNormals(); add(M(z, 'asphalt'), g);
    block(M(z, 'asphalt'), -11.1, y0 - .1, 704.2, -9.95, y0 + .02, 706.6); } // the bench's hardstanding off the end of the path
  for (const s of [2, 9.5, 17, 24.5]) { const t = s / 29.27, x = 2.6 - 14.4 * t + .87 * 1.05, zc = 672.2 + 25.4 * t + .493 * 1.05; streetLamp(z, x, hill(x, zc), zc, 2.626, { on: false }); } // crook-neck lamps along the path's east side, lanterns over it
  // the playground: a bark-mulch safety surface set flush in a precast edging, swings, a slide, a roundabout and a spring rider; a low timber fence round it with a gap for the path
  box(M(z, 'mulch'), -23.375, y0 - .1, 701.125, -12.625, y0 + .012, 708.875);
  { const c = [[-12.5, 701], [-23.5, 701], [-23.5, 709], [-12.5, 709]], ky = y0 - .105; // each run starts one kerb width in, so the corners butt instead of overlapping
    for (let i = 0; i < 4; i++) { const [x1, z1] = c[i], [x2, z2] = c[(i + 1) % 4], L = Math.hypot(x2 - x1, z2 - z1), dx = (x2 - x1) / L, dz = (z2 - z1) / L; kerb(z, [[x1 + dx * .125, ky, z1 + dz * .125], [x2, ky, z2]]); } }
  swingSet(z, -20.5, y0 + .012, 703); slide(z, -14.5, y0 + .012, 703.2); roundabout(z, -17.2, y0 + .012, 707.2, .4); springRider(z, -21.5, y0 + .012, 707.4, -.5);
  fence(z, [[-12.6, y0, 700.2], [-24.4, y0, 700.2], [-24.4, y0, 709.8], [-9, y0, 709.8], [-9, y0, 700.2], [-10.8, y0, 700.2]]);
  parkBench(z, -10.5, y0 + .02, 705.4, -Math.PI / 2); // on its hardstanding, facing the swings
  picnicTable(z, -16.5, hill(-16.5, 712.6), 712.6, .15);
  // a white stair that climbs to nothing, two doors standing open on the grass
  steps(z, 22, 1.24, 697.2, Math.PI, { n: 16, r: .25, g: .4, w: 2, color: 0xece8e0 });
  doorway(W, red, 14, hill(14, 716), 716, .5); doorway(W, blue, -30, hill(-30, 728), 728, -.9, 1.2);
  { const x = -8.2, zc = 702.5, r = .17; // a rubber ball left on the grass by the playground: red, with a darker seam round it each way
    loose.push({ mesh: paintedBall(z, r, (a, b, c) => Math.abs(b) < .045 || Math.abs(a) < .045 ? 0x7a1a14 : 0xc8322c, { roughness: .55 }), r, pos: [x, hill(x, zc) + r, zc], region: [-44, 665.7, 52, 757], bounce: .45, grip: 1.3, spin: 1, solid: 1, slope: 1 }); }
  // Grass: blades planted in a square that follows the camera (each blade draws its nearest copy), so it is dense underfoot without covering the whole field.
  const N = 430, seeds = new Float32Array(N * N * 3), blade = new THREE.InstancedBufferGeometry();
  for (let i = 0; i < N * N; i++) seeds.set([(i % N + hash(i, 1)) / N, (Math.floor(i / N) + hash(i, 2)) / N, hash(i, 3)], i * 3);
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -.8, .35, 0, .8, .35, 0, -.5, .7, 0, .5, .7, 0, 0, 1, 0], 3)); blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
  blade.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3)); blade.instanceCount = N * N;
  grass = new THREE.Mesh(blade, new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uTime, uCam: { value: camera.position }, uSun: { value: sunDir }, uSM: { value: null }, tShadow: { value: null } },
    vertexShader: `#include <packing>
      attribute vec3 aSeed; uniform vec3 uCam, uSun; uniform float uTime; uniform mat4 uSM; uniform sampler2D tShadow; varying vec3 vCol;
      ${hillGLSL}
      float segD(vec2 p, vec2 a, vec2 b) { vec2 d = b - a; return distance(p, a + d * clamp(dot(p - a, d) / dot(d, d), 0., 1.)); }
      void main() { const float L = 40.;
        vec2 b = aSeed.xy * L; b += L * floor((uCam.xz - b) / L + .5);
        float r = aSeed.z, a = r * 44., t = position.y, far = distance(b, uCam.xz);
        float keep = smoothstep(L * .5, L * .5 - 9., far) * step(665.8, b.y) * (abs(b.x - 3.8) < 1.9 && b.y < 668.7 || abs(b.x + 18.) < 5.66 && abs(b.y - 705.) < 4.16 || abs(b.x - 22.) < 1.05 && b.y > 693.95 && b.y < 700.45 || b.x > -11.15 && b.x < -9.9 && b.y > 704.15 && b.y < 706.65 ? 0. : 1.)
          * smoothstep(.6, .78, min(min(segD(b, vec2(3.8, 668.3), vec2(2.6, 672.2)), segD(b, vec2(2.6, 672.2), vec2(-11.9, 697.6))), segD(b, vec2(-11.9, 697.6), vec2(-11.9, 706.6)))); // off the playground, stair, path and hardstanding
        float tall = (.16 + .2 * fract(r * 13.) + .12 * sin(b.x * .9) * sin(b.y * .7)) * keep; // taller in clumps
        vec2 d = vec2(cos(a), sin(a)); float wind = .16 + .13 * sin(uTime * 1.3 + b.x * .33 + b.y * .27) + .05 * sin(uTime * 3.3 + r * 50.);
        vec3 root = vec3(b.x, hillH(b), b.y), p = root + vec3(d.x, 0., d.y) * position.x * .017 * keep + vec3(0., t * tall, 0.) + (vec3(.8, 0., .6) * wind + vec3(d.y, 0., -d.x) * .3) * t * t * tall;
        vec4 s = uSM * vec4(root + vec3(0., .15, 0.), 1.);
        float lit = s.x > 0. && s.x < 1. && s.y > 0. && s.y < 1. && s.z < 1. ? step(s.z - .0015, unpackRGBAToDepth(texture2D(tShadow, s.xy))) : 0.; // one shadow lookup per blade
        vec3 tip = mix(vec3(.3, .52, .1), vec3(.48, .6, .16), fract(r * 7.)); if (fract(r * 91.) < .012 && t > .9) tip = vec3(1.6, 1.5, 1.1); // the odd flower
        vec3 view = normalize(p - uCam);
        vCol = mix(vec3(.04, .12, .02), tip, t) * (vec3(.42, .55, .7) * (.35 + .65 * t) + vec3(4.4, 4.1, 3.6) * lit * (.3 + .2 * t + .7 * t * pow(max(dot(view, uSun), 0.), 3.))); // sky light, sun, and sun through the blade when you look toward it
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.); }`,
    fragmentShader: 'varying vec3 vCol; void main() { gl_FragColor = vec4(vCol, 1.); }' }));
  grass.frustumCulled = false; scene.add(grass); seeThrough.push(grass); skyOnly.hill.push(grass);
  // clouds: soft shapes on big cards standing round the horizon
  const cloud = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime },
    vertexShader: 'varying vec2 vUv, vP; void main() { vUv = uv; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec2 vUv, vP; uniform float uTime;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + 1.), f.x), f.y); }
      float fbm(vec2 p) { float a = 0., k = .5; for (int i = 0; i < 6; i++) { a += k * n(p); p = p * 2.03 + 7.; k *= .5; } return a; }
      void main() { vec2 q = vP * vec2(1., 2.2); float m = fbm(vUv * 5. + uTime * .006) + .75 * (1. - length(q)) - .45 * smoothstep(.1, -.5, vP.y);
        float a = smoothstep(.62, .85, m) * smoothstep(1., .8, length(q));
        gl_FragColor = vec4(mix(vec3(1.25, 1.4, 1.75), vec3(3.2, 3.1, 2.95), smoothstep(.6, 1.15, m + vP.y * .5)), a); }` });
  for (let i = 0; i < 11; i++) { const a = i * .571 + hash(i, 9), d = 380 + 260 * hash(i, 4), w = 260 + 200 * hash(i, 5), g = new THREE.PlaneGeometry(2, 2); g.attributes.uv.array.forEach((v, j, u) => u[j] = v + i * 3.7);
    const m = new THREE.Mesh(g, cloud); m.position.set(4 + Math.sin(a) * d, 110 + 120 * hash(i, 6), 712 + Math.cos(a) * d); m.scale.set(w, w * .5, 1); m.lookAt(4, 40, 712); scene.add(m); seeThrough.push(m); skyOnly.hill.push(m); }
}
onSun.push(sun => {
  grass.material.uniforms.uSM.value = sun.shadow.matrix; grass.onBeforeRender = () => grass.material.uniforms.tShadow.value = sun.shadow.map.texture; // the map exists once anything has been drawn
});
