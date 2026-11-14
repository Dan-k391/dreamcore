// The pools' water.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { renderer, scene, camera, uTime, V, quadVS, WY, zones } from './core.js';
import { wn0, wn1 } from './tex.js';
import { causticsGLSL } from './mat.js';
import { colliders, pools, floorH } from './build.js';
import { sky } from './sky.js';

import './level.js';
// ---------- water ----------
// Each pool is a wave-equation simulation on the GPU (the player's legs and landings disturb it) feeding a ray-traced surface.
// Every frame the main view draws a pool, two extra pictures are made from a camera OVER times wider than the screen
// (bent rays near the screen's edges land outside it): the room mirrored in the surface, and everything below the surface
// with its depth. The shader reflects and refracts the view ray at the simulated normal. The refracted ray is bent by Snell's
// law and marched through the pool's height map: the level's own floor heights and wall boxes sampled every 5cm, so
// steps, columns and piers are all in it and the result does not depend on where the camera is. That matters: seen from
// far back, the line of sight skims over a staircase, and the camera's underwater picture holds no pixel of it. Tracing
// against that picture's depth instead (tried twice) smears streaks along pool edges. The colour of the point the ray
// reaches comes from the live underwater picture when the camera can see that point, and otherwise from the pool's plan,
// a top-down picture of its floor made once.
// Where the water is thin against a step or wall it fades out, so the shoreline is soft instead of a hard cut.
const OVER = 1.45;
const simMat = new THREE.ShaderMaterial({ uniforms: { tSim: { value: null }, uPx: { value: null }, uDrop: { value: V(0, 0, 0) } }, vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tSim; uniform vec2 uPx; uniform vec3 uDrop; varying vec2 vUv;
    void main() { vec4 s = texture2D(tSim, vUv); // r = height, g = velocity
      float avg = (texture2D(tSim, vUv - vec2(uPx.x, 0.)).r + texture2D(tSim, vUv + vec2(uPx.x, 0.)).r + texture2D(tSim, vUv - vec2(0., uPx.y)).r + texture2D(tSim, vUv + vec2(0., uPx.y)).r) * .25;
      s.g = (s.g + (avg - s.r) * 2.) * .993; s.r += s.g;
      vec2 d = (vUv - uDrop.xy) / uPx; s.r += uDrop.z * exp(-dot(d, d) / 18.);
      gl_FragColor = s; }` });
const simQuad = new FullScreenQuad(simMat);
const waterVS = 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const waterFS = `uniform sampler2D tMirror, tUnder, tUnderZ, tPlan, tGround, tNormalMap0, tNormalMap1, tSim;
    uniform mat4 projectionMatrix, uLens; uniform vec4 uPond; uniform vec2 uPx; uniform vec3 uScatter; uniform float uFloor, uTime, uMain, uCaus; varying vec3 vW;
    ${causticsGLSL}
    vec4 clip(vec3 p) { return projectionMatrix * viewMatrix * vec4(p, 1.); } // .w is the distance from the camera
    vec2 wide(vec4 c) { return c.xy / c.w * ${(.5 / OVER).toFixed(5)} + .5; } // a clip position's place in the two wider pictures
    float seen(vec2 u) { // distance to the nearest underwater surface at that place. The underwater picture's projection is skewed so its near
      float d = texture2D(tUnderZ, u).x; vec2 q = u * 2. - 1.; // plane lies on the water (that is how it clips), so depth is undone with that matrix's own third row
      return d > .999999 ? 1e4 : -uLens[3][2] / (uLens[0][2] * q.x / uLens[0][0] + uLens[1][2] * q.y / uLens[1][1] - uLens[2][2] - (d * 2. - 1.)); }
    bool off(vec2 u) { return any(lessThan(u, vec2(0.))) || any(greaterThan(u, vec2(1.))); }
    vec2 plan(vec2 xz) { vec2 s = (xz - uPond.xy) / (uPond.zw - uPond.xy); return vec2(s.x, 1. - s.y); } // a world position's place in the pool's top-down picture
    float ground(vec2 xz) { return texture2D(tGround, (xz - uPond.xy) / (uPond.zw - uPond.xy)).r; } // height of whatever is under the water there
    vec2 onScreen(vec2 from, vec2 to) { vec2 d = to - from, room = max(mix(from, 1. - from, step(0., d)), 1e-4); return from + sign(d) * room * (1. - exp(-abs(d) / room)); } // a lookup that would leave the picture is eased toward its edge; clamping smears streaks
    void main() {
      vec4 c0 = clip(vW); vec2 here = wide(c0);
      float gap = mix(9., seen(here) - c0.w, uMain); // metres of water between this bit of surface and what lies under it
      float body = smoothstep(0., .1, gap); // 0 at the shore, 1 in open water
      vec2 s = (vW.xz - uPond.xy) / (uPond.zw - uPond.xy);
      float hx = texture2D(tSim, s - vec2(uPx.x, 0.)).r - texture2D(tSim, s + vec2(uPx.x, 0.)).r, hz = texture2D(tSim, s - vec2(0., uPx.y)).r - texture2D(tSim, s + vec2(0., uPx.y)).r;
      vec2 calm = (texture2D(tNormalMap0, vW.xz * .23 + uTime * vec2(.011, .007)).rg + texture2D(tNormalMap1, vW.xz * .37 - uTime * vec2(.009, .013)).rg - 1.) * .09; // water is never glass-flat
      vec3 n = normalize(vec3((hx * 10. + calm.x) * body, 1., (hz * 10. + calm.y) * body)), V = normalize(cameraPosition - vW);
      vec3 R = reflect(-V, n); R.y = -max(R.y, .03); // mirrored: the mirror picture shows the room upside-down below the surface
      vec2 ru = onScreen(here, wide(clip(vW + R * 9.))), o = vec2(.0016, 0.); ru.x = 1. - ru.x; // four taps: a real surface is never a perfect mirror
      vec3 refl = (texture2D(tMirror, ru + o.xy).rgb + texture2D(tMirror, ru - o.xy).rgb + texture2D(tMirror, ru + o.yx).rgb + texture2D(tMirror, ru - o.yx).rgb) * .25;
      vec3 T = refract(-V, n, .75); // air to water
      vec2 tw = mix(vW.xz - uPond.xy, uPond.zw - vW.xz, step(0., T.xz)) / (abs(T.xz) + 1e-5);
      float t = clamp(min((uFloor - vW.y) / min(T.y, -.001), min(tw.x, tw.y)), 0., 30.); // furthest the ray can go: the basin's floor or wall. Never negative, or exp() below overflows
      { float lo = 0., hi = t; bool found = false; // stop where the ray goes under the floor, a step or into a column
        for (int i = 1; i <= 32; i++) { float ti = t * float(i) / 32.; vec3 q = vW + T * ti; if (q.y < ground(q.xz)) { hi = ti; found = true; break; } lo = ti; }
        if (found) { for (int i = 0; i < 6; i++) { float tm = .5 * (lo + hi); vec3 q = vW + T * tm; if (q.y < ground(q.xz)) hi = tm; else lo = tm; } t = hi; }
      }
      vec3 hit = vW + T * t; vec4 ch = clip(hit); vec2 hu = wide(ch);
      float live = off(hu) ? 0. : uMain * (1. - smoothstep(.05 + .02 * ch.w, .14 + .05 * ch.w, abs(ch.w - seen(hu)))); // can the camera see the point the ray reached? (its depth there must match)
      vec3 still = texture2D(tPlan, plan(hit.xz)).rgb; // the plan is a still, so it gets the same moving light the tiles give the live picture: drifting pattern plus the real ripples
      vec2 hs = (hit.xz - uPond.xy) / (uPond.zw - uPond.xy), e = uPx * 2.;
      float lap = texture2D(tSim, hs - vec2(e.x, 0.)).r + texture2D(tSim, hs + vec2(e.x, 0.)).r + texture2D(tSim, hs - vec2(0., e.y)).r + texture2D(tSim, hs + vec2(0., e.y)).r - 4. * texture2D(tSim, hs).r;
      float cz = (max(caus(hit) + clamp(-lap * 30., -.6, 2.5), 0.) - .22) * smoothstep(${WY}, ${WY} - .3, hit.y);
      still *= max(.3, 1. + mix(.9, 2.2, smoothstep(.25, 1., max(still.r, max(still.g, still.b)))) * uCaus * cz); // stronger where the floor is in direct light, as on the tiles
      vec3 refr = mix(still, texture2D(tUnder, hu).rgb, live) * exp(-vec3(.42, .085, .06) * t); // red is absorbed first
      refr += uScatter * (1. - exp(-.3 * t)); // and the water itself scatters the room's light back, giving deep water a pale body
      vec3 col = mix(refr, refl, .02 + .98 * pow(1. - max(dot(V, n), 0.), 5.));
      col = mix(texture2D(tUnder, here).rgb, col, body); // thin water shows what is under it, unbent and untinted
      col += refl * .3 * smoothstep(0., .015, gap) * (1. - smoothstep(.015, .06, gap)); // a wet glint along the contact line
      gl_FragColor = vec4(col, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
const ponds = pools.map(([x1, z1, x2, z2, floor, zid, seen, scatter]) => {
  const g = new THREE.PlaneGeometry(x2 - x1, z2 - z1), size = { textureWidth: 1280, textureHeight: 1280, multisample: 0 };
  const mirror = new Reflector(g, size), lens = new Refractor(g, size), under = lens.getRenderTarget(); // three's own mirror render, and its render of only what lies below the plane
  under.depthTexture = new THREE.DepthTexture(1280, 1280, THREE.FloatType); // kept, so rays can be traced through what is under the water
  const rt = () => new THREE.WebGLRenderTarget(Math.round((x2 - x1) * 20), Math.round((z2 - z1) * 20), { type: THREE.HalfFloatType, depthBuffer: false }); // 5cm cells
  const sim = [rt(), rt()], rect = new THREE.Vector4(x1, z1, x2, z2), px = new THREE.Vector2(.05 / (x2 - x1), .05 / (z2 - z1));
  const ppm = Math.min(80, 2048 / Math.max(x2 - x1, z2 - z1)), pw = Math.round((x2 - x1) * ppm), ph = Math.round((z2 - z1) * ppm); // the plan: 80 pixels a metre where it fits
  const planRT = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType });
  const gw = Math.round((x2 - x1) * 20), gh = Math.round((z2 - z1) * 20), heights = new Float32Array(gw * gh), solid = colliders.filter(c => c[2] > x1 && c[0] < x2 && c[3] > z1 && c[1] < z2);
  for (let j = 0, i = 0; j < gh; j++) for (let k = 0; k < gw; k++, i++) { // the height map: the walking floor, or the surface itself where a wall or column stands in the water
    const x = x1 + (k + .5) / 20, z = z1 + (j + .5) / 20;
    heights[i] = solid.some(c => x > c[0] && x < c[2] && z > c[1] && z < c[3]) ? WY : Math.min(WY, floorH(x, z));
  }
  const ground = new THREE.DataTexture(heights, gw, gh, THREE.RedFormat, THREE.FloatType); ground.needsUpdate = true;
  const planCam = new THREE.OrthographicCamera((x1 - x2) / 2, (x2 - x1) / 2, (z2 - z1) / 2, (z1 - z2) / 2, .001, 1.6); // looking straight down from the surface
  planCam.position.set((x1 + x2) / 2, WY, (z1 + z2) / 2); planCam.up.set(0, 0, -1); planCam.lookAt((x1 + x2) / 2, WY - 1, (z1 + z2) / 2);
  const U = { uCaus: zones[zid].tileU.uCaus, tMirror: { value: mirror.getRenderTarget().texture }, tPlan: { value: planRT.texture }, tGround: { value: ground }, tUnder: { value: under.texture }, tUnderZ: { value: under.depthTexture }, uLens: { value: lens.camera.projectionMatrix }, tNormalMap0: { value: wn0 }, tNormalMap1: { value: wn1 },
              tSim: { value: sim[0].texture }, uPond: { value: rect }, uPx: { value: px }, uFloor: { value: floor }, uScatter: { value: V(...scatter) }, uMain: { value: 0 }, uTime };
  const w = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: waterVS, fragmentShader: waterFS, transparent: true }));
  Object.assign(w, { seen, rect, px, sim, tileU: zones[zid].tileU, zone: zones[zid] });
  w.drawPlan = () => { // once, while the zone's lamps are lit for its bake; caustics off, since the plan is a still and they move
    const caus = w.tileU.uCaus.value, target = renderer.getRenderTarget();
    w.tileU.uCaus.value = 0; sky.visible = false; renderer.setRenderTarget(planRT); renderer.render(scene, planCam);
    w.tileU.uCaus.value = caus; sky.visible = true; renderer.setRenderTarget(target);
  };
  w.tileU.uSim.value = sim[0].texture; w.tileU.uPond.value = rect; w.tileU.uPx.value = px;
  w.rotation.x = -Math.PI / 2; w.position.set((x1 + x2) / 2, WY, (z1 + z2) / 2); scene.add(w);
  mirror.matrixAutoUpdate = lens.matrixAutoUpdate = false;
  const wideCam = new THREE.PerspectiveCamera();
  w.onBeforeRender = (r, s, c) => {
    U.uMain.value = +(c === camera);
    if (c !== camera) return; // only the main view makes the two pictures
    wideCam.copy(c); wideCam.projectionMatrix.elements[0] /= OVER; wideCam.projectionMatrix.elements[5] /= OVER; wideCam.projectionMatrixInverse.copy(wideCam.projectionMatrix).invert();
    const on = ponds.map(q => q.visible); // every pool is at the same level, so none belongs in another's mirror or underwater picture
    for (const q of ponds) q.visible = false;
    mirror.matrixWorld.copy(w.matrixWorld); mirror.onBeforeRender(r, s, wideCam);
    sky.visible = false; lens.matrixWorld.copy(w.matrixWorld); lens.onBeforeRender(r, s, wideCam); sky.visible = true; // the sky ignores the clip and would fill the gaps
    ponds.forEach((q, i) => q.visible = on[i]);
  };
  return w;
});
function ripple(w, x, z, power) { // one 60Hz step of a pool's waves, with a disturbance of the given size at world (x, z)
  simMat.uniforms.tSim.value = w.sim[0].texture; simMat.uniforms.uPx.value = w.px;
  simMat.uniforms.uDrop.value.set((x - w.rect.x) / (w.rect.z - w.rect.x), (z - w.rect.y) / (w.rect.w - w.rect.y), power);
  renderer.setRenderTarget(w.sim[1]); simQuad.render(renderer); renderer.setRenderTarget(null);
  w.sim.reverse(); w.material.uniforms.tSim.value = w.tileU.uSim.value = w.sim[0].texture;
}

export { ponds, ripple };
