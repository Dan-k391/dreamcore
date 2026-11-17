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
import './water.js';
import { stats as seen } from './portals.js'; // hooks the scene draws below: what is seen through a portal goes into the same buffers

import { zone0 as zone } from './lights.js'; // the starting zone: the look starts from it
// ---------- post ----------
// Only the scene render is multisampled: it draws into msaa, which the AO pass and atmos read; the full-screen passes after it
// write the same value to every sample, so their ping-pong targets need none (a 4x resolve per pass saved, same picture).
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
const msaa = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true, resolveStencilBuffer: false }); // the stencil: portals.js marks openings in it, used only while drawing (resolving it is slow on D3D: it tripled the scene pass)
const scenePass = new RenderPass(scene, camera), sceneRender = scenePass.render.bind(scenePass);
scenePass.render = (r, w, read, ...x) => sceneRender(r, w, msaa, ...x);
composer.addPass(scenePass);
const ao = new GTAOPass(scene, camera, 1, 1);
ao.updateGtaoMaterial({ radius: .9, distanceExponent: 1.5, thickness: 1, scale: 1.3, samples: 16 });
ao.output = GTAOPass.OUTPUT.Off; ao.needsSwap = false; // it only makes its denoised AO picture; atmos multiplies it in (was a copy and a multiply blend, two full-screen passes)
composer.addPass(ao);
const quality = { scale: 1, msaa: 4, ao: 1 }; // render scale, scene samples, AO resolution: High, what the game always drew (settings.js sets the rest)
const aoSize = ao.setSize.bind(ao); ao.setSize = (w, h) => aoSize(Math.round(w * quality.ao), Math.round(h * quality.ao));
const aoRender = ao.render.bind(ao); // the AO pass sees the water's surface: occlusion worked out from the pool floor would darken the water where
const noAO = seeThrough; // the floor lies unbent, a ghost under what the water shows bent (water.js skips its pictures for that pass). The rest see-through is left out
ao.render = (...a) => { const on = noAO.map(w => w.visible); for (const w of noAO) w.visible = false; aoRender(...a); noAO.forEach((w, i) => w.visible = on[i]); };
const ahead = []; // programs compiling in parallel, awaited together once the passes are set up
{ // the AO pass draws every mesh in its normal material: compile that now in each kind of mesh there is (plain, instanced, instanced
  // with colours), not on the frame the ball pit first comes into view
  const was = []; scene.traverse(o => { if (o.isMesh) { was.push([o, o.material]); o.material = ao.normalMaterial; } });
  renderer.setRenderTarget(ao.normalRenderTarget);
  ahead.push((async () => renderer.compileAsync?.(scene, camera))()); // the materials are collected now, synchronously
  renderer.setRenderTarget(null); for (const [o, m] of was) o.material = m; // so put them back before awaiting: other modules run meanwhile and must not see the swap
}
const look = { exp: zone.exp, shaft: 0, sat: zone.sat, bloom: zone.bloom, tint: zone.tint.clone(), w: new Map([[zone, 1]]), on: false }; // on: a look (look.js) is set // w: each zone's share of the mood where you stand (player.js mood)
const atmos = new THREE.ShaderMaterial({ // distance fog per zone + sun shafts ray-marched through the sun's shadow map
  uniforms: { tDiffuse: { value: null }, tAO: { value: ao.pdRenderTarget.texture }, tDepth: { value: ao.depthTexture }, tShadow: { value: sun.shadow.map.texture }, uPI: { value: camera.projectionMatrixInverse }, uCW: { value: camera.matrixWorld },
              uSM: { value: sun.shadow.matrix }, uCam: { value: camera.position }, uSun: { value: sunDir }, uFog: { value: [zone.fog.clone(), zone.fog.clone(), zone.fog.clone()] }, uFogW: { value: new THREE.Vector3(1, 0, 0) }, uShaft: { value: 0 }, uPM: { value: new THREE.Matrix4() }, uPP: { value: new THREE.Vector4() }, uPN: { value: new THREE.Vector4() }, uPR: { value: new THREE.Vector4() }, t: uTime },
  vertexShader: quadVS,
  fragmentShader: `#include <packing>
    uniform sampler2D tDiffuse, tAO, tDepth, tShadow; uniform mat4 uPI, uCW, uSM, uPM; uniform vec4 uPP, uPN, uPR; uniform vec3 uCam, uSun, uFogW; uniform vec4 uFog[3]; uniform float uShaft, t; varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb * texture2D(tAO, vUv).rgb; // the ambient occlusion (blend intensity 1)
      vec4 v = uPI * vec4(vUv * 2. - 1., texture2D(tDepth, vUv).x * 2. - 1., 1.);
      vec3 ray = (uCW * vec4(v.xyz / v.w, 1.)).xyz - uCam; float len = min(length(ray), 60.); vec3 dir = normalize(ray);
      // near a doorway: the picture under each zone's fog, mixed by its share, so a thick dark fog lifts as a veil, never as grey;
      // mixed as square roots (about as the eye sees), or the first few percent of a bright place would light the whole dark mouth
      vec3 c0 = col; col = vec3(0.);
      for (int i = 0; i < 3; i++) col += uFogW[i] * pow(max(mix(c0, uFog[i].rgb, 1. - exp(-len * uFog[i].a)), 0.), vec3(.7));
      col = pow(col, vec3(1. / .7));
      if (uShaft > .001) {
        float lit = 0., n = fract(sin(dot(gl_FragCoord.xy + fract(t) * 37., vec2(12.9898, 78.233))) * 43758.5453), tc = 1e9; vec3 o2 = uCam, d2 = dir;
        if (uPR.w > .5) { float dn = dot(dir, uPN.xyz), tt = dot(uPP.xyz - uCam, uPN.xyz) / dn; vec3 q = uCam + dir * tt - uPP.xyz; // a ray through the portal opening on screen: past the plane it goes on in the far space
          if (dn < 0. && tt > -1e-4 && tt < length(ray) + .01 && abs(dot(q, uPR.xyz)) < uPP.w * .5 && q.y > 0. && q.y < uPN.w) { tc = tt; o2 = (uPM * vec4(uCam, 1.)).xyz; d2 = mat3(uPM) * dir; } }
        for (int i = 0; i < 32; i++) { float x = len * (float(i) + n) / 32.; vec4 s = uSM * vec4(x < tc ? uCam + dir * x : o2 + d2 * x, 1.);
          if (s.x > 0. && s.x < 1. && s.y > 0. && s.y < 1. && s.z < 1.) lit += step(s.z, unpackRGBAToDepth(texture2D(tShadow, s.xy)) + .002); }
        col += vec3(1., .93, .8) * uShaft * lit / 32. * len * (.003 + .05 * pow(max(dot(tc < 1e9 ? d2 : dir, uSun), 0.), 6.));
      }
      gl_FragColor = vec4(col, 1.);
    }`,
});
const atmosPass = new ShaderPass(atmos), atmosRender = atmosPass.render.bind(atmosPass);
atmosPass.render = (r, w, read, ...x) => { const e = seen.top, U = atmos.uniforms; U.uPR.value.w = e ? 1 : 0; // the nearest opening drawn through: its shafts marched in the far space
  if (e) { U.uPM.value.copy(e.M); U.uPP.value.set(e.p.x, e.p.y, e.p.z, e.w); U.uPN.value.set(e.n.x, e.n.y, e.n.z, e.h); U.uPR.value.set(e.r.x, e.r.y, e.r.z, 1); }
  atmosRender(r, w, msaa, ...x); }; // reads the scene picture
composer.addPass(atmosPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .3, .85, .95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const film = new THREE.ShaderMaterial({ // lens fringing, per-zone grade, vignette, grain
  uniforms: { tDiffuse: { value: null }, t: uTime, uTint: { value: look.tint }, uSat: { value: 1 }, uCon: { value: .4 }, uVig: { value: .7 }, uGrain: { value: .026 } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float t, uSat, uCon, uVig, uGrain; uniform vec3 uTint; varying vec2 vUv;
    void main() { vec2 d = vUv - .5; float r = dot(d, d);
      vec3 c = vec3(texture2D(tDiffuse, vUv - d * r * .002).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + d * r * .002).b);
      c = clamp(mix(vec3(dot(c, vec3(.2126, .7152, .0722))), c, uSat) * uTint, 0., 1.);
      c = mix(c, c * c * (3. - 2. * c), uCon) * (1. - r * uVig); // S-curve: deeper darks, cleaner highlights
      c += (fract(sin(dot(gl_FragCoord.xy + fract(t) * 91., vec2(12.9898, 78.233))) * 43758.5453) - .5) * uGrain;
      gl_FragColor = vec4(c, 1.); }`,
});
composer.addPass(new ShaderPass(film));
function resize() {
  if (!innerWidth || !innerHeight) return; // hidden tab
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * quality.scale);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); msaa.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
}
addEventListener('resize', resize); resize();
function setQuality(q) { Object.assign(quality, q); if (msaa.samples !== quality.msaa) { msaa.samples = quality.msaa; msaa.dispose(); } resize(); } // at once: targets resized, no shader changes
{ // and every program the passes draw with, for the target each draws into: found by one frame through the composer with the
  // draws left out (passes set their defines as they render), not compiled one after another on the first frame
  // (each draw's materials collected as it is asked for: the full-screen passes share one quad and swap its material)
  const draw = renderer.render;
  renderer.render = (s, c) => { ahead.push((async () => renderer.compileAsync?.(s, c))()); };
  try { composer.render(0); } finally { renderer.render = draw; renderer.setRenderTarget(null); }
  try { await Promise.all(ahead); } catch (e) { console.warn('compiling ahead failed, compiling as drawn instead', e); }
}
performance.mark('load: passes compiled');

export { composer, ao, look, atmos, bloom, film, setQuality };
