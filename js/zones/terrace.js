// The terrace above the clouds.
import * as THREE from 'three';
import { scene, uTime, sunDir, dry, zones, defZone } from '../core.js';
import { P, neon, wallMat } from '../mat.js';
import { colliders, flats, seeThrough, skyOnly, add, block, box, flight, slab, post, doorway } from '../build.js';

defZone('sK', { ...dry, sky: 'dusk', air: .7, grp: 's', k: 1, exp: .3, fog: [.95, .6, .55, .0012], sat: 1.12, bloom: .12, shaft: .1, wet: .35, box: [650.4, 600, 745, 700], probe: [672, 2, 649.4] });
{ // terrace above the clouds x[650,704] z[639,660], out of the vaulted hall's far door: white stone at sunset, a court of arches, a stair to a lookout
  const z = zones.sK, W = wallMat(z, 0xf2ece4, { roughness: .55 }), iron = P(z, { color: 0x24262c, metalness: .7, roughness: .4 }), blue = P(z, { color: 0x86a8d8, roughness: .4 }), lampG = neon(0xffd9a0, 6);
  const rail = (x1, z1, x2, z2, y = 0) => { block(W, x1, y, z1, x2, y + .6, z2); colliders.push([x1, z1, x2, z2]); };
  box(W, 649.9, -8, 560, 650.45, 16, 648.4); box(W, 649.9, -8, 650.4, 650.45, 16, 740); box(W, 649.9, 2.4, 648.4, 650.45, 16, 650.4); // the wall the passage comes out of, running out of sight both ways
  block(W, 650.45, -8, 647.9, 664, 0, 650.9); rail(650.45, 647.6, 664, 647.9); rail(650.45, 650.9, 664, 651.2); // causeway
  for (let x = 652.5; x < 664; x += 3.8) for (const zc of [647.1, 651.7]) add(W, new THREE.CylinderGeometry(.24, .24, 15, 20).translate(x, -.5, zc)); // columns rising out of the cloud beside it
  block(W, 664, -8, 639.4, 684, 0, 659.4); // the court
  rail(664, 639.1, 684, 639.4); rail(664, 659.4, 684, 659.7); rail(663.7, 639.1, 664, 647.9); rail(663.7, 650.9, 664, 659.7); rail(684, 639.1, 684.3, 645.4); rail(684, 653.4, 684.3, 659.7);
  const arches = c0 => [0, 1, 2, 3].map(i => ['arch', c0 + 1.9 + 3.4 * i, 2.6, 4.6]);
  for (const zc of [642.4, 655.9]) slab(W, 'x', zc, .5, 667, 681, 0, 6, arches(667), true);
  for (const x of [667, 680.5]) slab(W, 'z', x, .5, 642.4, 656.4, 0, 6, arches(642.4), true);
  doorway(W, blue, 674, 0, 649.4, Math.PI / 2, 2.2);
  flight(W, 684, 645.4, 694, 653.4, 'x', 1, 0, 20, .25, -8); // the stair, between stepped walls
  for (let i = 0; i < 4; i++) for (const zc of [645, 653.4]) box(W, 684 + 2.5 * i, -8, zc, 686.5 + 2.5 * i, 1.25 * (i + 1) + .9, zc + .4);
  block(W, 694, -8, 645, 704, 5, 653.8); flats.push([694, 645.4, 704, 653.4, () => 5]); rail(694, 645, 704, 645.4, 5); rail(694, 653.4, 704, 653.8, 5); rail(703.6, 645.4, 704, 653.4, 5); // the lookout
  post(iron, lampG, 696, 5, 646.4, .6, .8, 90, z);
  for (let i = 0; i < 3; i++) block(iron, 700.6 + .13 * i, 5.44, 648.5, 700.7 + .13 * i, 5.47, 650.3); for (const k of [648.6, 650.2]) block(iron, 700.6, 5, k - .03, 700.98, 5.44, k + .03); colliders.push([700.6, 648.5, 701, 650.3]); // a bench facing the sun
  // things that hang in the sky out of reach: stairs and doors
  for (const [x, y, zc, n, ry] of [[690, 9, 622, 9, .4], [712, 3, 676, 12, -1.1], [735, 12, 640, 7, 2]]) { for (let i = 0; i < n; i++) add(W, new THREE.BoxGeometry(.5, .25 * (i + 1), 2).translate(.5 * i, .125 * (i + 1), 0).rotateY(ry).translate(x, y, zc)); doorway(W, blue, x, y + .25 * n, zc - 3, ry); }
  // The cloud sea: an opaque floor of cloud well below the terrace and three thinner sheets above it, all cut from one drifting pattern, lit from the low sun
  [0, 1, 2, 3].forEach(l => { const m = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ transparent: l > 0, depthWrite: l === 0, uniforms: { uTime, uSun: { value: sunDir }, uL: { value: l } },
    vertexShader: 'varying vec3 vW; void main() { vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }',
    fragmentShader: `varying vec3 vW; uniform float uTime, uL; uniform vec3 uSun;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + 1.), f.x), f.y); }
      float fbm(vec2 p) { float a = 0., k = .5; for (int i = 0; i < 6; i++) { a += k * n(p); p = p * 2.03 + 7.; k *= .5; } return a; }
      void main() { vec2 p = vW.xz * .045 + uTime * vec2(.005, .002); float m = fbm(p + .6 * fbm(p * .5)), far = distance(vW, cameraPosition);
        vec3 c = mix(vec3(.42, .3, .55), vec3(2.2, 1.35, 1.05), smoothstep(.3, .75, m + uL * .07)); // hollows in shade, crests catching the sun
        c += vec3(1.6, .6, .25) * pow(max(dot(normalize(vW - cameraPosition), uSun), 0.), 5.) * smoothstep(.35, .7, m);
        gl_FragColor = vec4(mix(c, vec3(2.3, 1.05, .7), smoothstep(120., 1500., far)), uL < .5 ? 1. : smoothstep(.44 + .07 * uL, .6 + .07 * uL, m) * smoothstep(1.5, 6., far)); }` }));
    m.position.set(690, -5.4 + .75 * l, 650); scene.add(m); seeThrough.push(m); skyOnly.dusk.push(m); });
}
