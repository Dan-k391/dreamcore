// The sun, the skies and switching between them.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { renderer, scene, V, sunDir, zones } from './core.js';
import { skyOnly, onSun, sea } from './build.js';

import './level.js';
// outside: sky, low sun through the pool hall's west windows, calm sea to the horizon
const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
// The far-off places get a plainer sky that can be set exactly: a gradient from horizon to zenith, a glow and disc where the sun or moon is, stars.
const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
  uniforms: { uZen: { value: V(0, 0, 0) }, uHor: { value: V(0, 0, 0) }, uGlow: { value: V(0, 0, 0) }, uSun: { value: sunDir }, uStars: { value: 0 } },
  vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `varying vec3 vD; uniform vec3 uZen, uHor, uGlow, uSun; uniform float uStars;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() { vec3 d = normalize(vD); float s = max(dot(d, uSun), 0.);
      vec3 c = mix(uHor, uZen, pow(max(d.y, 0.), .5)) + uGlow * (.22 * pow(s, 5.) + .5 * pow(s, 60.) + 9. * smoothstep(.99955, .9998, s));
      vec2 g = d.xz / (abs(d.y) + .35) * 70., f = fract(g) - .5; float k = h(floor(g));
      c += uStars * step(.93, k) * smoothstep(.09, 0., length(f + (vec2(h(floor(g) + 3.), h(floor(g) + 5.)) - .5) * .7)) * (k - .9) * 30. * smoothstep(0., .15, d.y);
      gl_FragColor = vec4(c, 1.); }` }));
dome.frustumCulled = false; dome.renderOrder = -1; scene.add(dome);
dome.onBeforeRender = (r, sc, c) => { dome.position.setFromMatrixPosition(c.matrixWorld); dome.updateMatrixWorld(); }; // always centred on whoever is looking
Object.assign(sky.material.uniforms.sunPosition.value, V(-1, .5, -.32).normalize()); sky.material.uniforms.turbidity.value = 2; sky.material.uniforms.rayleigh.value = 3.5;
sky.material.uniforms.mieCoefficient.value = .004; sky.material.uniforms.mieDirectionalG.value = .85;
const sun = new THREE.DirectionalLight(0xfff0dc, 15);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 8192); sun.shadow.bias = 0; sun.shadow.normalBias = .03; sun.shadow.autoUpdate = false;
// No depth bias: casters draw their back faces, so a lit face is a wall's thickness in front of its own shadow and needs none, while
// any bias (-.0004 was 3.6 cm at far 90) let the sun past the end of a wall into the inside corner it makes: a bright sliver up the joint.
scene.add(sun, sun.target);
for (const f of onSun) f(sun); // things built before the sun that use its shadow map (the field's grass)
// The far-off places each have their own sky. There is one sun and one shadow map: on arrival (in a dark passage, where
// no sky shows) the sun is turned, recoloured and its shadows aimed at that place.
const skies = { // sun direction, strength, colour; middle and half-size of the ground its shadows cover; sky: its zenith, horizon and sun-glow colours and how many stars (none: the pool hall's own sky); show: things only this sky has
  day: { dir: [-1, .5, -.32], light: 15, color: 0xfff0dc, at: [0, -12], r: [15, 10.5], show: [sea, sky] },
  hill: { dir: [-.55, .42, .72], light: 14, color: 0xfff0dc, at: [4, 712], r: [72, 36], sky: [[.3, .62, 1.75], [1.25, 1.6, 2.1], [1.6, 1.45, 1.2], 0], show: [dome, ...skyOnly.hill] },
  dusk: { dir: [.8, .1, .55], light: 9, color: 0xffb27a, at: [695, 650], r: [60, 16], sky: [[.3, .32, .85], [2.3, 1.05, .7], [3, 1.5, .7], .25], show: [dome, ...skyOnly.dusk] },
  night: { dir: [.4, .45, -.6], light: 1.3, color: 0x9db4ff, at: [712, 15], r: [46, 30], sky: [[.004, .007, .018], [.02, .03, .06], [.5, .55, .7], 1], show: [dome, ...skyOnly.night] },
};
// Optional enclosed reference room: its own native sun/shadow volume and sky.
// No changes to the ordinary skies or their shadow coverage.
if (zones.prism) skies.prism = { dir: [.34, .28, -1], light: 22, color: 0xfff3df,
  at: [2400, 2404], r: [11, 9], sky: [[1.35, 2., 2.4], [3.5, 3.4, 2.9], [2., 1.9, 1.6], 0], show: [dome, ...skyOnly.prism] };
// Every place is drawn only under its own sky, in every pass (main, AO, pond pictures, shadow maps, bakes): a mesh in a material
// of zones of one sky (P(), a zone's mats), or else reaching only into boxes of zones of one sky, is hidden under the others.
// Looked up at every switch, so things made later (physics.js) are included. The show lists above and the ponds (their own seen-from lists) are left alone.
const matSky = new Map(), ownSky = new WeakMap(), bb = new THREE.Box3();
for (const z of Object.values(zones)) for (const m of z.mats) matSky.set(m, matSky.has(m) && matSky.get(m) !== (z.sky || 'day') ? null : z.sky || 'day');
function skyOfMesh(o) {
  if (!ownSky.has(o)) {
    let k = matSky.get(o.material);
    if (k === undefined) { k = null; bb.setFromObject(o);
      if (!bb.isEmpty()) for (const z of Object.values(zones)) { const [x1, z1, x2, z2] = z.box;
        if (bb.max.x > x1 && bb.min.x < x2 && bb.max.z > z1 && bb.min.z < z2) { if (k === null) k = z.sky || 'day'; else if (k !== (z.sky || 'day')) { k = false; break; } } } }
    ownSky.set(o, k || null);
  }
  return ownSky.get(o);
}
let skyNow;
function setSky(k) {
  if (k === skyNow) return;
  skyNow = k; const s = skies[k], d = Math.max(40, 1.6 * s.r[0]);
  sunDir.set(...s.dir).normalize();
  if (s.sky) { const v = dome.material.uniforms; v.uZen.value.set(...s.sky[0]); v.uHor.value.set(...s.sky[1]); v.uGlow.value.set(...s.sky[2]); v.uStars.value = s.sky[3]; }
  sun.intensity = sun.userData.light = s.light; sun.color.set(s.color); sun.position.copy(sunDir).multiplyScalar(d).add(sun.target.position.set(s.at[0], 2, s.at[1]));
  Object.assign(sun.shadow.camera, { left: -s.r[0], right: s.r[0], top: s.r[1], bottom: -s.r[1], near: 1, far: Math.max(90, 2.2 * d) }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.needsUpdate = renderer.shadowMap.needsUpdate = true;
  for (const q of Object.values(skies)) for (const o of q.show) o.visible = false;
  for (const o of s.show) o.visible = true;
  const listed = new Set(Object.values(skies).flatMap(q => q.show));
  scene.traverse(o => {
    if (o.isMesh && !listed.has(o) && !o.material.uniforms?.tMirror) { const own = skyOfMesh(o); if (own) o.visible = own === k; }
    if (o.isSpotLight && o.castShadow) o.shadow.needsUpdate = true; // a lamp's shadow drawn under the other sky lacks this one's things: draw it again
  });
}
setSky('day');

export { sky, dome, sun, skies, skyNow, setSky };
