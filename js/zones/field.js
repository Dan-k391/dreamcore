// The field on the hills, at the end of the hotel hallway's dark passage.
import * as THREE from 'three';
import { scene, camera, uTime, sunDir, dry, zones, defZone } from '../core.js';
import { hash, noise, fbm, ss, makeTex, concrete } from '../tex.js';
import { M, P, wallMat, paintedBall } from '../mat.js';
import { colliders, flats, seeThrough, skyOnly, onSun, loose, add, block, box, solid, round, flight, tube, lit, post, doorway } from '../build.js';

defZone('fD', { ...dry, step: 'carpet', sky: 'hill', air: 1, grp: 'f', k: 1, exp: .3, fog: [.72, .82, .95, .002], sat: 1.15, bloom: .07, shaft: .04, wet: 0, box: [-50, 665.6, 58, 760], probe: [4, 6, 690] });
// ---------- the field: reached through the dark passage at the end of the hotel hallway ----------
// Rolling ground, written once for the walking floor and once for the shaders that plant grass on it. Flat at the door and at the playground, rising to a rim all round.
const hill = (x, z) => { const h = (3 + 2.2 * Math.sin(x * .07 + 1) * Math.cos(z * .06) + 1.4 * Math.sin(x * .13 + z * .11) + .5 * Math.sin(x * .31) * Math.cos(z * .27) + 12 * ss(40, 62, Math.hypot(x - 4, z - 712)) ** 2) * ss(5, 22, Math.hypot(x - 3.8, z - 665.6));
  return 3.2 + (h - 3.2) * ss(7, 14, Math.hypot(x + 18, z - 705)); };
const hillGLSL = `float hillH(vec2 p) { float r = smoothstep(40., 62., distance(p, vec2(4., 712.)));
  float h = (3. + 2.2 * sin(p.x * .07 + 1.) * cos(p.y * .06) + 1.4 * sin(p.x * .13 + p.y * .11) + .5 * sin(p.x * .31) * cos(p.y * .27) + 12. * r * r) * smoothstep(5., 22., distance(p, vec2(3.8, 665.6)));
  return 3.2 + (h - 3.2) * smoothstep(7., 14., distance(p, vec2(-18., 705.))); }`;
let grass;
{ const z = zones.fD, W = wallMat(z, 0xf4f1ea), G = M(z, 'grassGround'), stone = P(z, { ...concrete, color: 0xd8d2c4 }),
    iron = P(z, { color: 0x24302c, metalness: .7, roughness: .45 }), red = P(z, { color: 0xc8322c, roughness: .35 }), blue = P(z, { color: 0x2f6fc0, roughness: .35 }), yel = P(z, { color: 0xe8b820, roughness: .35 }),
    wood = P(z, { color: 0x7a5a3c, roughness: .7 }), frost = P(z, { color: 0xfff6e0, roughness: .15, emissive: 0xffe2a8, emissiveIntensity: .5 }), sand = wallMat(z, 0xb39a68, { roughness: 1 }), y0 = 3.2;
  const g = new THREE.PlaneGeometry(180, 180, 240, 240).rotateX(-Math.PI / 2).translate(4, 0, 712), q = g.attributes.position;
  for (let i = 0; i < q.count; i++) { q.setY(i, hill(q.getX(i), q.getZ(i))); g.attributes.uv.setXY(i, q.getX(i), q.getZ(i)); }
  g.computeVertexNormals(); const land = new THREE.Mesh(g, G); land.castShadow = land.receiveShadow = true; scene.add(land);
  flats.push([-60, 665.6, 70, 790, hill]); colliders.push([-46, 665, -44, 760], [52, 665, 54, 760], [-46, 757, 54, 759], [-90, 665.2, 2.8, 665.65], [4.8, 665.2, 98, 665.65]); // the hills climb higher than the end wall either side of the door: it stops you at any height
  box(W, -90, -3, 665.2, 2.8, 9, 665.65); box(W, 4.8, -3, 665.2, 98, 9, 665.65); box(W, 2.8, 2.4, 665.2, 4.8, 9, 665.65); // one long white wall across the hills, and the door you came through
  block(stone, 2, -.2, 665.65, 5.6, .03, 668.6);
  for (let i = 0; i < 5; i++) { const x = 1.2 - 3.6 * i, zc = 672 + 6.6 * i; post(iron, frost, x, hill(x, zc), zc, .6, -.8); } // lamps leading to the playground
  // playground on its patch of sand: swings, a roundabout, a seesaw
  add(sand, new THREE.CylinderGeometry(7.3, 7.3, .08, 64).translate(-18, y0 + .02, 705)); round(-18, 705, 7.3, y0 - .5, y0 + .06);
  for (const x of [-22.2, -18.6]) for (const k of [-1, 1]) { tube([[x, y0 + 2.5, 702], [x, y0 - .3, 702 + k * 1.1]], .04, 8, red); // the swing frame's legs, solid in five lengths down their slant
    for (let i = 0; i < 5; i++) round(x, 702 + k * 1.1 * (i + .5) / 5, .05, y0 - .3 + 2.8 * (1 - (i + 1) / 5), y0 - .3 + 2.8 * (1 - i / 5) + .05); }
  solid(-22.25, y0 + 2.45, 701.95, -18.55, y0 + 2.55, 702.05); // the top bar
  tube([[-22.2, y0 + 2.5, 702], [-18.6, y0 + 2.5, 702]], .04, 8, red);
  for (const x of [-21.3, -19.5]) { for (const k of [-.22, .22]) block(iron, x + k - .006, y0 + .55, 701.994, x + k + .006, y0 + 2.5, 702.006); block(blue, x - .26, y0 + .5, 701.9, x + .26, y0 + .55, 702.1); solid(x - .26, y0 + .5, 701.9, x + .26, y0 + 2.45, 702.1); } // a seat on its chains: too narrow to stand between them
  add(yel, new THREE.CylinderGeometry(1.25, 1.25, .08, 40).translate(-14.5, y0 + .42, 707.5)); add(iron, new THREE.CylinderGeometry(.06, .06, 1.2, 12).translate(-14.5, y0 + .6, 707.5));
  for (let i = 0; i < 4; i++) add(red, new THREE.TorusGeometry(.55, .022, 8, 24, Math.PI).translate(.6, .46, 0).rotateY(i * Math.PI / 2 + .4).translate(-14.5, y0, 707.5));
  round(-14.5, 707.5, 1.25, y0, y0 + .46); round(-14.5, 707.5, .06, y0, y0 + 1.2); // the roundabout's deck, to stand on, and its middle pole
  add(blue, new THREE.BoxGeometry(3.4, .06, .26).rotateZ(.2).translate(-21, y0 + .55, 708.5)); add(iron, new THREE.CylinderGeometry(.05, .05, .5, 10).rotateX(Math.PI / 2).translate(-21, y0 + .52, 708.5));
  for (const k of [-.14, .14]) block(iron, -21.03, y0, 708.5 + k - .02, -20.97, y0 + .55, 708.5 + k + .02);
  for (let i = 0; i < 6; i++) { const a = -21 - 1.665 + .555 * i, t = Math.tan(.2); solid(a, y0 + .55 + (a + 21) * t - .035, 708.37, a + .555, y0 + .55 + (a + .555 + 21) * t + .035, 708.63); } // the seesaw's plank in six steps up its slope
  solid(-21.05, y0, 708.34, -20.95, y0 + .5, 708.66); // and its pivot
  // a white staircase that climbs to nothing, two doors standing open on the grass, a bench
  { const x = 22, zc = 694, y = hill(x, zc + .5) - .1; flight(W, x - 1, zc, x + 1, zc + 6.4, 'z', 1, y, 16, .25, y - 6); }
  doorway(W, red, 14, hill(14, 716), 716, .5); doorway(W, blue, -30, hill(-30, 728), 728, -.9, 1.2);
  { const x = 6, zc = 684, y = hill(x, zc); for (let i = 0; i < 4; i++) block(wood, x - .9, y + .44, zc - .22 + .12 * i, x + .9, y + .47, zc - .13 + .12 * i);
    for (let i = 0; i < 2; i++) block(wood, x - .9, y + .62 + .14 * i, zc - .27, x + .9, y + .72 + .14 * i, zc - .24);
    for (const k of [-.75, .75]) { block(iron, x + k - .025, y - .2, zc - .28, x + k + .025, y + .9, zc - .23); block(iron, x + k - .025, y - .2, zc + .2, x + k + .025, y + .44, zc + .25); block(iron, x + k - .025, y + .4, zc - .25, x + k + .025, y + .44, zc + .22); }
    solid(x - .9, y + .4, zc - .25, x + .9, y + .47, zc + .25); solid(x - .9, y + .47, zc - .28, x + .9, y + .9, zc - .23); // the seat and the back
    for (const k of [-.75, .75]) solid(x + k - .025, y - .2, zc - .28, x + k + .025, y + .4, zc + .25); }
  { const x = -10.6, zc = 700.4, r = .17; // a rubber ball left on the grass by the playground: red, with a darker seam round it each way
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
      void main() { const float L = 40.;
        vec2 b = aSeed.xy * L; b += L * floor((uCam.xz - b) / L + .5);
        float r = aSeed.z, a = r * 44., t = position.y, far = distance(b, uCam.xz);
        float keep = smoothstep(L * .5, L * .5 - 9., far) * smoothstep(7., 8.2, distance(b, vec2(-18., 705.))) * step(665.8, b.y) * (abs(b.x - 3.8) < 1.9 && b.y < 668.7 ? 0. : 1.);
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
