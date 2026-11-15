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
// a top-down picture of its floor made once. The height map is coarse and knows only floors and colliders (a column's collider
// is 10% wider than its stone; rails and rungs are not in it), so along the ray the first point that lies just behind the live
// picture's surface wins over it: where the picture holds that surface, the ray stops on the real stone, and the plan, which
// shows columns and steps only from above, is not used for them.
// Where the water is thin against a step or wall it fades out, so the shoreline is soft instead of a hard cut.
const OVER = 1.45;
// All pools are on WY. With every pool hidden, their wide mirror/lens cameras see the same pictures.
// Reuse the first pair only within this scene render; a second render at the same time may have moved the
// camera, changed the lights, or changed the scene (dev.waterCheck does all three). Keep the original path
// available for diagnostic A/B captures and timings, without changing any quality or simulation settings.
const waterViews = { reuse: true };
let sharedView;
const beforeScene = scene.onBeforeRender;
scene.onBeforeRender = function (r, s, c, ...args) {
  if (c === camera && !s.overrideMaterial) sharedView = null;
  beforeScene.call(this, r, s, c, ...args);
};
const uTest = { value: 0 }; // ?dev measurement (dev.waterCheck): 1 the lens picture alone, 2 the mirror alone, both with the surface flat; 3 a mask
const DROPS = 8; // disturbances one step takes: the player's and the loose things'
const simMat = new THREE.ShaderMaterial({ uniforms: { tSim: { value: null }, uPx: { value: null }, uDrop: { value: Array.from({ length: DROPS }, () => V(0, 0, 0)) } }, vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tSim; uniform vec2 uPx; uniform vec3 uDrop[${DROPS}]; varying vec2 vUv;
    void main() { vec4 s = texture2D(tSim, vUv); // r = height, g = velocity
      float avg = (texture2D(tSim, vUv - vec2(uPx.x, 0.)).r + texture2D(tSim, vUv + vec2(uPx.x, 0.)).r + texture2D(tSim, vUv - vec2(0., uPx.y)).r + texture2D(tSim, vUv + vec2(0., uPx.y)).r) * .25;
      s.g = (s.g + (avg - s.r) * 2.) * .993; s.r += s.g;
      for (int i = 0; i < ${DROPS}; i++) { vec2 d = (vUv - uDrop[i].xy) / uPx; s.r += uDrop[i].z * exp(-dot(d, d) / 18.); }
      gl_FragColor = s; }` });
const simQuad = new FullScreenQuad(simMat);
const waterVS = 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const waterFS = `uniform sampler2D tMirror, tUnder, tUnderZ, tPlan, tGround, tNormalMap0, tNormalMap1, tSim;
    uniform mat4 projectionMatrix, uLens; uniform vec4 uPond; uniform vec2 uPx; uniform vec3 uScatter, uCausDir; uniform float uFloor, uTime, uMain, uCaus, uTest; varying vec3 vW;
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
      if (uTest == 3.) { gl_FragColor = vec4(-1., -1., -1., 1.); return; } // ?dev: where the water is
      vec4 c0 = clip(vW); vec2 here = wide(c0);
      float gap = mix(9., seen(here) - c0.w, uMain); // metres of water between this bit of surface and what lies under it
      float body = smoothstep(0., .1, gap); // 0 at the shore, 1 in open water
      vec2 s = (vW.xz - uPond.xy) / (uPond.zw - uPond.xy);
      float hx = texture2D(tSim, s - vec2(uPx.x, 0.)).r - texture2D(tSim, s + vec2(uPx.x, 0.)).r, hz = texture2D(tSim, s - vec2(0., uPx.y)).r - texture2D(tSim, s + vec2(0., uPx.y)).r;
      vec2 calm = -poolWaves(vW.xz, 0.).xy + (texture2D(tNormalMap0, vW.xz * .23 + uTime * vec2(.011, .007)).rg + texture2D(tNormalMap1, vW.xz * .37 - uTime * vec2(.009, .013)).rg - 1.) * .009; // water is never glass-flat
      vec3 n = normalize(vec3((hx * 10. + calm.x) * body, 1., (hz * 10. + calm.y) * body)), V = normalize(cameraPosition - vW);
      if (uTest > 0.) n = vec3(0., 1., 0.); // ?dev measurement: flat
      vec3 R = reflect(-V, n); R.y = -max(R.y, .03); // mirrored: the mirror picture shows the room upside-down below the surface
      vec2 ru = onScreen(here, wide(clip(vW + R * 9.))), o = vec2(.0007, 0.); ru.x = 1. - ru.x; // four taps: a real surface is never a perfect mirror
      vec3 refl = (texture2D(tMirror, ru + o.xy).rgb + texture2D(tMirror, ru - o.xy).rgb + texture2D(tMirror, ru + o.yx).rgb + texture2D(tMirror, ru - o.yx).rgb) * .25;
      vec3 T = refract(-V, n, uTest == 1. ? 1. : .75); // air to water (?dev measurement: straight through)
      vec2 tw = mix(vW.xz - uPond.xy, uPond.zw - vW.xz, step(0., T.xz)) / (abs(T.xz) + 1e-5);
      float t = clamp(min((uFloor - vW.y) / min(T.y, -.001), min(tw.x, tw.y)), 0., 30.); // furthest the ray can go: the basin's floor or wall. Never negative, or exp() below overflows
      { float lo = 0., hi = t; bool found = false; // stop where the ray goes under the floor, a step or into a column
        for (int i = 1; i <= 32; i++) { float ti = t * float(i) / 32.; vec3 q = vW + T * ti; if (q.y < ground(q.xz)) { hi = ti; found = true; break; } lo = ti; }
        if (found) { for (int i = 0; i < 6; i++) { float tm = .5 * (lo + hi); vec3 q = vW + T * tm; if (q.y < ground(q.xz)) hi = tm; else lo = tm; } t = hi; }
      }
      if (uMain > 0.) { float lo = 0., st = t / 16.; // the height map's columns are their colliders, a few cm proud of the stone, and it has no rails or rungs: so the
        for (int i = 1; i <= 16; i++) { float ti = st * float(i); vec4 cq = clip(vW + T * ti); vec2 uq = wide(cq); float dz = off(uq) ? -1. : cq.w - seen(uq); // first point the ray reaches
          if (dz > 0. && dz < .1 + st) { float hi = ti; for (int k = 0; k < 4; k++) { float tm = .5 * (lo + hi); vec4 cm = clip(vW + T * tm); if (cm.w > seen(wide(cm))) hi = tm; else lo = tm; } t = hi; break; } // just behind the
          lo = ti; } // underwater picture's surface is what it really meets, and the picture holds it; the height map stays the fallback where the picture has nothing
      }
      vec3 hit = vW + T * t; vec4 ch = clip(hit); vec2 hu = wide(ch);
      float live = off(hu) ? 0. : uMain * (1. - smoothstep(.05 + .02 * ch.w, .14 + .05 * ch.w, abs(ch.w - seen(hu)))); // can the camera see the point the ray reached? (its depth there must match)
      vec3 still = texture2D(tPlan, plan(hit.xz)).rgb; // the plan is a still, so it gets the same moving light the tiles give the live picture: drifting pattern plus the real ripples
      vec2 hs = (causticPath(hit).xy - uPond.xy) / (uPond.zw - uPond.xy), e = uPx * 2.;
      float lap = texture2D(tSim, hs - vec2(e.x, 0.)).r + texture2D(tSim, hs + vec2(e.x, 0.)).r + texture2D(tSim, hs - vec2(0., e.y)).r + texture2D(tSim, hs + vec2(0., e.y)).r - 4. * texture2D(tSim, hs).r;
      float cz = caus(hit, lap);
      still *= 1. + mix(.85, 1.8, smoothstep(.25, 1., max(still.r, max(still.g, still.b)))) * uCaus * cz; // stronger where the floor is in direct light, as on the tiles
      if (uTest == 1.) { gl_FragColor = vec4(mix(texture2D(tUnder, here).rgb, mix(still, texture2D(tUnder, hu).rgb, live), body), 1.); return; } // ?dev: the lens picture alone
      if (uTest == 2.) { gl_FragColor = vec4(texture2D(tMirror, ru).rgb, 1.); return; } // ?dev: the mirror picture alone
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
  const gw = Math.round((x2 - x1) * 20), gh = Math.round((z2 - z1) * 20), heights = new Float32Array(gw * gh), solid = colliders.filter(c => !c[6] && c[5] > WY && c[4] < 1.7 && c[2] > x1 && c[0] < x2 && c[3] > z1 && c[1] < z2); // boxes standing in the water
  for (let j = 0, i = 0; j < gh; j++) for (let k = 0; k < gw; k++, i++) { // the height map: the walking floor, or the surface itself where a wall or column stands in the water
    const x = x1 + (k + .5) / 20, z = z1 + (j + .5) / 20;
    heights[i] = solid.some(c => x > c[0] && x < c[2] && z > c[1] && z < c[3]) ? WY : Math.min(WY, floorH(x, z));
  }
  const ground = new THREE.DataTexture(heights, gw, gh, THREE.RedFormat, THREE.FloatType); ground.needsUpdate = true;
  const planCam = new THREE.OrthographicCamera((x1 - x2) / 2, (x2 - x1) / 2, (z2 - z1) / 2, (z1 - z2) / 2, .001, 1.6); // looking straight down from the surface
  planCam.position.set((x1 + x2) / 2, WY, (z1 + z2) / 2); planCam.up.set(0, 0, -1); planCam.lookAt((x1 + x2) / 2, WY - 1, (z1 + z2) / 2);
  const U = { uCaus: zones[zid].tileU.uCaus, uCausDir: zones[zid].tileU.uCausDir, tMirror: { value: mirror.getRenderTarget().texture }, tPlan: { value: planRT.texture }, tGround: { value: ground }, tUnder: { value: under.texture }, tUnderZ: { value: under.depthTexture }, uLens: { value: lens.camera.projectionMatrix }, tNormalMap0: { value: wn0 }, tNormalMap1: { value: wn1 },
              tSim: { value: sim[0].texture }, uPond: { value: rect }, uPx: { value: px }, uFloor: { value: floor }, uScatter: { value: V(...scatter) }, uMain: { value: 0 }, uTest, uTime };
  const w = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: waterVS, fragmentShader: waterFS, transparent: true }));
  Object.assign(w, { lens, seen, rect, px, sim, tileU: zones[zid].tileU, zone: zones[zid], twin: twin(x1, z1, x2, z2) });
  w.drawPlan = () => { // once, while the zone's lamps are lit for its bake; caustics off, since the plan is a still and they move
    const caus = w.tileU.uCaus.value, target = renderer.getRenderTarget();
    w.tileU.uCaus.value = 0; sky.visible = false; renderer.setRenderTarget(planRT); renderer.render(scene, planCam);
    w.tileU.uCaus.value = caus; sky.visible = true; renderer.setRenderTarget(target);
  };
  w.tileU.uSim.value = sim[0].texture; w.tileU.uPond.value = rect; w.tileU.uPx.value = px;
  w.rotation.x = -Math.PI / 2; w.position.set((x1 + x2) / 2, WY, (z1 + z2) / 2); scene.add(w);
  mirror.matrixAutoUpdate = lens.matrixAutoUpdate = false;
  const wideCam = new THREE.PerspectiveCamera();
  const view = { mirror: mirror.getRenderTarget().texture, under: under.texture, depth: under.depthTexture, projection: lens.camera.projectionMatrix, lens };
  w.onBeforeRender = (r, s, c) => {
    U.uMain.value = +(c === camera);
    if (c !== camera || s.overrideMaterial) return; // only the main view makes the two pictures (not the AO pass's normals, drawn from the same camera)
    // Three skips a plane's captures from its back side. Keep each pool's original targets there rather
    // than share a picture that was not redrawn (also covers noclip and near-coplanar diagnostic views).
    const reuse = waterViews.reuse && c.matrixWorld.elements[13] > WY + .001;
    const use = reuse && sharedView ? sharedView : view;
    U.tMirror.value = use.mirror; U.tUnder.value = use.under; U.tUnderZ.value = use.depth; U.uLens.value = use.projection;
    w.lens = use.lens; // the diagnostic camera belongs to the picture actually sampled, including a reused one
    if (reuse && sharedView) return;
    wideCam.copy(c); wideCam.projectionMatrix.elements[0] /= OVER; wideCam.projectionMatrix.elements[5] /= OVER; wideCam.projectionMatrixInverse.copy(wideCam.projectionMatrix).invert();
    const on = ponds.map(q => q.visible); // every pool is at the same level, so none belongs in another's mirror or underwater picture
    for (const q of ponds) q.visible = false;
    mirror.matrixWorld.copy(w.matrixWorld); mirror.onBeforeRender(r, s, wideCam);
    // three's Refractor sets only its camera's matrixWorld; a scene hook calling getWorldPosition() rebuilds that from .matrix (identity), so keep .matrix the same
    lens.camera.matrix.copy(wideCam.matrixWorld);
    sky.visible = false; lens.matrixWorld.copy(w.matrixWorld); lens.onBeforeRender(r, s, wideCam); sky.visible = true; // the sky ignores the clip and would fill the gaps
    ponds.forEach((q, i) => q.visible = on[i]);
    sharedView = view;
  };
  return w;
});
// The CPU's coarse copy of a pool's waves, 20 cm cells, given the same disturbances: what floating things ride on, so the GPU
// waves never have to be read back. Shallow-water form (heights in the cells, water velocity on the faces between them),
// tuned to the GPU waves' speed (c = 2.12 m/s: one 5 cm cell * 60 Hz / sqrt 2) and damping (.993 a step); walls reflect, as there.
function twin(x1, z1, x2, z2) {
  const nx = Math.round((x2 - x1) / .2), nz = Math.round((z2 - z1) / .2), dx = (x2 - x1) / nx, dz = (z2 - z1) / nz;
  const h = new Float32Array(nx * nz), u = new Float32Array((nx + 1) * nz), v = new Float32Array(nx * (nz + 1)), G = 9.8, D = 2.12 ** 2 / 9.8, t = 1 / 60;
  const T = { x1, z1, nx, nz, dx, dz, h, u, v, at: { h: 0, gx: 0, gz: 0, ux: 0, uz: 0 } };
  T.step = drops => {
    for (const [x, z, p] of drops) { // the same volume the GPU's gaussian adds, shared bilinearly between the four nearest cells
      const fx = Math.min(nx - 1.001, Math.max(0, (x - x1) / dx - .5)), fz = Math.min(nz - 1.001, Math.max(0, (z - z1) / dz - .5)), i = fx | 0, j = fz | 0, a = fx - i, b = fz - j, q = p * .1414 / (dx * dz);
      h[i + j * nx] += q * (1 - a) * (1 - b); h[i + 1 + j * nx] += q * a * (1 - b); h[i + (j + 1) * nx] += q * (1 - a) * b; h[i + 1 + (j + 1) * nx] += q * a * b;
    }
    for (let j = 0; j < nz; j++) for (let i = 1; i < nx; i++) { const k = i + j * (nx + 1); u[k] = (u[k] - G * t * (h[i + j * nx] - h[i - 1 + j * nx]) / dx) * .993; }
    for (let j = 1; j < nz; j++) for (let i = 0; i < nx; i++) { const k = i + j * nx; v[k] = (v[k] - G * t * (h[k] - h[k - nx]) / dz) * .993; }
    let s = 0; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = i + j * nx; s += h[k] -= D * t * ((u[k + j + 1] - u[k + j]) / dx + (v[k + nx] - v[k]) / dz); }
    s /= h.length; for (let k = 0; k < h.length; k++) h[k] -= s; // the drops add water and the closed sides keep it: hold the mean level at the still surface, as the drawn water's is
  };
  T.sample = (x, z) => { // -> T.at: height above the still surface, its slope, and the water's flow, at (x, z)
    const fx = Math.min(nx - 1.001, Math.max(0, (x - x1) / dx - .5)), fz = Math.min(nz - 1.001, Math.max(0, (z - z1) / dz - .5)), i = fx | 0, j = fz | 0, a = fx - i, b = fz - j;
    const H = (p, q) => h[p + q * nx], h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1), o = T.at;
    o.h = (h00 * (1 - a) + h10 * a) * (1 - b) + (h01 * (1 - a) + h11 * a) * b;
    o.gx = ((h10 - h00) * (1 - b) + (h11 - h01) * b) / dx; o.gz = ((h01 - h00) * (1 - a) + (h11 - h10) * a) / dz;
    const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - x1) / dx))), cj = Math.min(nz - 1, Math.max(0, Math.floor((z - z1) / dz))), k = ci + cj * nx;
    o.ux = (u[k + cj] + u[k + cj + 1]) / 2; o.uz = (v[k] + v[k + nx]) / 2; return o;
  };
  return T;
}
function ripple(w, drops) { // one 60Hz step of a pool's waves, with up to DROPS disturbances [x, z, size] in world space
  simMat.uniforms.tSim.value = w.sim[0].texture; simMat.uniforms.uPx.value = w.px;
  simMat.uniforms.uDrop.value.forEach((d, i) => { const [x, z, p] = drops[i] || [0, 0, 0]; d.set((x - w.rect.x) / (w.rect.z - w.rect.x), (z - w.rect.y) / (w.rect.w - w.rect.y), p); });
  renderer.setRenderTarget(w.sim[1]); simQuad.render(renderer); renderer.setRenderTarget(null);
  w.sim.reverse(); w.material.uniforms.tSim.value = w.tileU.uSim.value = w.sim[0].texture;
  if (w.twin.used) w.twin.step(drops.slice(0, DROPS)); // only a pool with something floating on it (physics.js marks them) needs the copy
}

function resetWater() { // ?dev only (dev.reset): every pool flat and still, as at load, on the GPU and in the CPU's copy
  const t = renderer.getRenderTarget(), c = renderer.getClearColor(new THREE.Color()), a = renderer.getClearAlpha(); renderer.setClearColor(0, 0);
  for (const w of ponds) { for (const r of w.sim) { renderer.setRenderTarget(r); renderer.clear(); } w.twin.h.fill(0); w.twin.u.fill(0); w.twin.v.fill(0); }
  renderer.setRenderTarget(t); renderer.setClearColor(c, a);
}

export { ponds, ripple, resetWater, uTest, waterViews };
