// Post-processing: AO, fog and sun shafts, bloom, grade and grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { renderer, scene, camera, uTime, sunDir, quadVS } from './core.js';
import { seeThrough } from './build.js';
import { sun } from './sky.js';
import { ponds } from './water.js';

import { zone0 as zone } from './lights.js'; // the starting zone: the look starts from it
// ---------- post ----------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const ao = new GTAOPass(scene, camera, 1, 1);
ao.updateGtaoMaterial({ radius: .9, distanceExponent: 1.5, thickness: 1, scale: 1.3, samples: 16 });
composer.addPass(ao);
const aoRender = ao.render.bind(ao); // the AO pass leaves the water out: its normals and depth then describe the pool floor, and the water isn't asked to re-render its pictures
const noAO = [...ponds, ...seeThrough]; // and anything else see-through
ao.render = (...a) => { const on = noAO.map(w => w.visible); for (const w of noAO) w.visible = false; aoRender(...a); noAO.forEach((w, i) => w.visible = on[i]); };
const look = { exp: zone.exp, shaft: 0, sat: zone.sat, bloom: zone.bloom, fog: zone.fog.clone(), tint: zone.tint.clone() }; // eases toward the current zone's values
const atmos = new THREE.ShaderMaterial({ // distance fog per zone + sun shafts ray-marched through the sun's shadow map
  uniforms: { tDiffuse: { value: null }, tDepth: { value: ao.depthTexture }, tShadow: { value: sun.shadow.map.texture }, uPI: { value: camera.projectionMatrixInverse }, uCW: { value: camera.matrixWorld },
              uSM: { value: sun.shadow.matrix }, uCam: { value: camera.position }, uSun: { value: sunDir }, uFog: { value: look.fog }, uShaft: { value: 0 }, t: uTime },
  vertexShader: quadVS,
  fragmentShader: `#include <packing>
    uniform sampler2D tDiffuse, tDepth, tShadow; uniform mat4 uPI, uCW, uSM; uniform vec3 uCam, uSun; uniform vec4 uFog; uniform float uShaft, t; varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec4 v = uPI * vec4(vUv * 2. - 1., texture2D(tDepth, vUv).x * 2. - 1., 1.);
      vec3 ray = (uCW * vec4(v.xyz / v.w, 1.)).xyz - uCam; float len = min(length(ray), 60.); vec3 dir = normalize(ray);
      col = mix(col, uFog.rgb, 1. - exp(-len * uFog.a));
      if (uShaft > .001) {
        float lit = 0., n = fract(sin(dot(gl_FragCoord.xy + fract(t) * 37., vec2(12.9898, 78.233))) * 43758.5453);
        for (int i = 0; i < 32; i++) { vec4 s = uSM * vec4(uCam + dir * len * (float(i) + n) / 32., 1.);
          if (s.x > 0. && s.x < 1. && s.y > 0. && s.y < 1. && s.z < 1.) lit += step(s.z, unpackRGBAToDepth(texture2D(tShadow, s.xy)) + .002); }
        col += vec3(1., .93, .8) * uShaft * lit / 32. * len * (.003 + .05 * pow(max(dot(dir, uSun), 0.), 6.));
      }
      gl_FragColor = vec4(col, 1.);
    }`,
});
composer.addPass(new ShaderPass(atmos));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .3, .85, .95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const film = new THREE.ShaderMaterial({ // lens fringing, per-zone grade, vignette, grain
  uniforms: { tDiffuse: { value: null }, t: uTime, uTint: { value: look.tint }, uSat: { value: 1 } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float t, uSat; uniform vec3 uTint; varying vec2 vUv;
    void main() { vec2 d = vUv - .5; float r = dot(d, d);
      vec3 c = vec3(texture2D(tDiffuse, vUv - d * r * .014).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + d * r * .014).b);
      c = clamp(mix(vec3(dot(c, vec3(.2126, .7152, .0722))), c, uSat) * uTint, 0., 1.);
      c = mix(c, c * c * (3. - 2. * c), .4) * (1. - r * .7); // S-curve: deeper darks, cleaner highlights
      c += (fract(sin(dot(gl_FragCoord.xy + fract(t) * 91., vec2(12.9898, 78.233))) * 43758.5453) - .5) * .035;
      gl_FragColor = vec4(c, 1.); }`,
});
composer.addPass(new ShaderPass(film));
function resize() {
  if (!innerWidth || !innerHeight) return; // hidden tab
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize); resize();

export { composer, ao, look, atmos, bloom, film };
