// The pools' water.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { renderer, scene, camera, uTime, V, quadVS, WY, zones, inR } from './core.js';
import { wn0, wn1 } from './tex.js';
import { causticsGLSL, filmGLSL, filmU } from './mat.js';
import { colliders, pools, floorH, seeThrough } from './build.js';
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
// reaches comes from the live underwater picture when the camera can see that point, then from the deep picture (below), and otherwise from the pool's plan,
// a top-down picture of its floor made once. The height map is coarse and knows only floors and colliders (a column's collider
// is 10% wider than its stone; rails and rungs are not in it), so along the ray the first point that lies just behind the live
// picture's surface wins over it: where the picture holds that surface, the ray stops on the real stone, and the plan, which
// shows columns and steps only from above, is not used for them.
// Where the water is thin against a step or wall it fades out, so the shoreline is soft instead of a hard cut.
const OVER = 1.45;
// All pools are on WY. With every pool hidden, their wide mirror/lens cameras see the same pictures.
// Reuse a capture only within this scene render; a second render at the same time may have moved the
// camera, changed the lights, or changed the scene (dev.waterCheck does all three). reuse false (every pool
// captures again) stays for diagnostic A/B pictures and timings.
const waterViews = { reuse: true, cull: true, depth: true, mask: true, cutCull: true }; // cull false (?dev): pictures every frame, unscissored, for the no-pop A/B (tools/pool-skip.js); depth false: no lens pre-pass; mask false: the deep picture shaded whole
let captured = false, frameNo = 0, epoch = 0;
const beforeScene = scene.onBeforeRender;
scene.onBeforeRender = function (r, s, c, ...args) {
  if (c === camera && !s.overrideMaterial) { captured = false; frameNo++; fit(); }
  beforeScene.call(this, r, s, c, ...args);
};
// One mirror/lens pair for every pool: they share a plane, so a capture made for one is right for all (below the plane each pool
// captures into it again just before it draws). Only the part the water on screen can sample is drawn (scissors: clipped to the eye and the picture, and for
// the two under-water pictures to where a refracted ray from the water on screen can go, reach), and the deep picture only where the lens cannot answer.
// The mirror is a 1280 square: it is read with four taps .0007 of its width apart (a real surface is never a perfect mirror), a blur fixed in
// the picture, not on the screen, which a texel the size of a tap's step resolves; more pixels would only cost (tried at 1440p: 1.45x its pixels looked the same).
// The underwater picture is shown unblurred: it spans OVER times the screen each way, so it is OVER times the drawing buffer's size (fit), a
// texel a screen pixel, and what is seen through still water is as sharp as it is in air at any screen size (a 1280 square was 1.5x too coarse at 720p, 3x at 1440p).
const size = { textureWidth: 1280, textureHeight: 1280, multisample: 0 };
const mirror = new Reflector(new THREE.PlaneGeometry(), size), lens = new Refractor(new THREE.PlaneGeometry(), size), under = lens.getRenderTarget(), mirrorRT = mirror.getRenderTarget();
under.setSize(1, 1); under.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType); // kept, so rays can be traced through what is under the water
mirrorRT.depthTexture = new THREE.DepthTexture(mirrorRT.width, mirrorRT.height, THREE.FloatType);
const uMirrorW = { value: new THREE.Vector4() };
// Not multisampled: 4x would clean up fine geometry (a drain's 6 mm bars) for .3 ms at 1440p, but at OVER squared the screen's area its sample buffers take 370 MB there
mirror.matrixAutoUpdate = lens.matrixAutoUpdate = false;
// The deep picture: the same eye, the same lighting, but the world under the surface squashed toward it (depth x SQUASH), in the projection only, so
// shading still sees the real geometry. A refracted ray goes down steeper than the line of sight, so just past a step's nosing it reaches a strip of the
// lower tread the eye's picture cannot see. Squashed, that strip comes into view: a straight line from the eye then falls more steeply into the water than
// any refracted ray whose line of sight is more than 6.5 degrees below the horizon (SQUASH = tan(sight) / tan(refracted) there), so every point such a ray
// reaches first is in it, with the tread's own texture, light and shadow, at the screen's resolution. Below 6.5 degrees the plan still answers.
const SQUASH = .12, deep = new THREE.WebGLRenderTarget(1, 1, { type: under.texture.type }), deepCam = new THREE.PerspectiveCamera();
deep.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType); deepCam.matrixAutoUpdate = false;
const uDeep = { value: new THREE.Matrix4() }, uDeepW = { value: new THREE.Vector4() }, SQ = new THREE.Matrix4().makeTranslation(0, WY, 0).multiply(new THREE.Matrix4().makeScale(1, SQUASH, 1)).multiply(new THREE.Matrix4().makeTranslation(0, -WY, 0));
// Most of the deep picture shows what the eye's picture already holds (the treads it can see, squashed): there it is not shaded. A depth-only pass draws the deep
// picture's depth (deepZ); a full-screen pass copies it into the deep picture's own depth, a hair nearer wherever the eye's picture sees the same point
// (the same eye and light, so the same colour), and the shading pass that follows fails the depth test there and leaves those pixels clear (alpha 0).
// The water takes the eye's picture's colour for whatever share of a deep lookup is clear. Only the strips the eye cannot see are shaded twice.
const deepZ = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RedFormat, type: THREE.UnsignedByteType }); deepZ.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
const uLensCut = { value: new THREE.Vector4(0, 0, 1, 1) }, uMaskCut = { value: new THREE.Vector4(0, 0, 1, 1) }, seenGLSL = `float seen(vec2 u) { // distance to the nearest underwater surface at that place. The underwater picture's projection is skewed so its near
      float d = texture2D(tUnderZ, u).x; vec2 q = u * 2. - 1.; // plane lies on the water (that is how it clips), so depth is undone with that matrix's own third row
      return d > .999999 || any(lessThan(u, uLensCut.xy)) || any(greaterThan(u, uLensCut.zw)) ? 1e4 : -uLens[3][2] / (uLens[0][2] * q.x / uLens[0][0] + uLens[1][2] * q.y / uLens[1][1] - uLens[2][2] - (d * 2. - 1.)); }`; // outside the cut: not drawn this frame
const maskMat = new THREE.ShaderMaterial({ uniforms: { tDeepZ: { value: deepZ.depthTexture }, tUnderZ: { value: under.depthTexture }, uLens: { value: lens.camera.projectionMatrix }, uLensCut: uMaskCut, uDeepInv: { value: new THREE.Matrix4() }, uView: { value: new THREE.Matrix4() } },
  vertexShader: quadVS, colorWrite: false, depthFunc: THREE.AlwaysDepth, fragmentShader: `uniform sampler2D tDeepZ, tUnderZ; uniform mat4 uLens, uDeepInv, uView; uniform vec4 uLensCut; varying vec2 vUv;
    ${seenGLSL}
    void main() { float d = texture2D(tDeepZ, vUv).x; gl_FragDepth = d; if (d > .999999) return;
      vec4 p = uDeepInv * vec4(vUv * 2. - 1., d * 2. - 1., 1.), c = uLens * uView * vec4(p.xyz / p.w, 1.); vec2 u = c.xy / c.w * .5 + .5; // the real point, in the eye's picture
      vec2 h = .5 / vec2(textureSize(tUnderZ, 0)); float e = .01 + .003 * c.w; // all four texels a lookup there blends: so no edge of the eye's picture runs through it
      if (abs(seen(u + h) - c.w) < e && abs(seen(u - h) - c.w) < e && abs(seen(u + vec2(h.x, -h.y)) - c.w) < e && abs(seen(u - vec2(h.x, -h.y)) - c.w) < e) gl_FragDepth = d - 4e-7; }` }), maskQuad = new FullScreenQuad(maskMat); // seen there: nudged nearer, so not shaded
{ const t = renderer.getRenderTarget(); renderer.setRenderTarget(deep); const warm = (async () => renderer.compileAsync?.(maskQuad._mesh, camera))(); renderer.setRenderTarget(t); // compiled at load, not on the first pool seen
  try { await warm; } catch (e) { console.warn('compiling ahead failed, compiling as drawn instead', e); } }
let listed = -1; const mats = [], objs = [];
const lists = () => { // the scene's materials and cullable things, gathered once a frame for the captures (a walk of the scene each capture cost the CPU more)
  if (listed === frameNo) return; listed = frameNo; mats.length = objs.length = 0; const seen = new Set();
  scene.traverse(o => { for (const m of o.material ? [].concat(o.material) : []) if (!seen.has(m)) { seen.add(m); mats.push(m); } if ((o.isMesh || o.isLine || o.isPoints) && o.frustumCulled) objs.push(o); });
};
const depthOnly = draw => { // every material depth only, see-through ones not at all
  lists(); const was = mats.map(m => [m.colorWrite, m.visible]);
  for (const m of mats) { m.colorWrite = false; if (m.transparent || !m.depthWrite) m.visible = false; }
  try { draw(); } finally { mats.forEach((m, i) => { m.colorWrite = was[i][0]; m.visible = was[i][1]; }); }
};
const CROP = new THREE.Matrix4(), cut = new THREE.Frustum(), hide = [];
const captureUnder = capture => { // the three pictures drawn with what lies wholly outside the target's cut (scissors) left out, and the lens after a depth pre-pass
  const draw = renderer.render; // (fewer shaded pixels where things overlap)
  renderer.render = function (world, view) {
    if (world !== scene || world.overrideMaterial || (view !== lens.camera && view !== mirror.camera && view !== deepCam)) return draw.call(this, world, view);
    const t = this.getRenderTarget(), sc = t.scissor, x0 = sc.x / t.width * 2 - 1, x1 = (sc.x + sc.z) / t.width * 2 - 1, y0 = sc.y / t.height * 2 - 1, y1 = (sc.y + sc.w) / t.height * 2 - 1;
    if (waterViews.cutCull && t.scissorTest && x1 > x0 && y1 > y0) { // the cut as a frustum: the picture's projection stretched so the cut fills it
      CROP.set(2 / (x1 - x0), 0, 0, -(x1 + x0) / (x1 - x0), 0, 2 / (y1 - y0), 0, -(y1 + y0) / (y1 - y0), 0, 0, 1, 0, 0, 0, 0, 1);
      cut.setFromProjectionMatrix(CROP.multiply(view.projectionMatrix).multiply(view.matrixWorldInverse));
      lists(); for (const o of objs) if (o.visible && !cut.intersectsObject(o)) hide.push(o); // (a thing under a hidden parent is hidden and shown again: no change)
      for (const o of hide) o.visible = false;
    }
    try {
      if (view !== lens.camera || !waterViews.depth) return draw.call(this, world, view);
      depthOnly(() => draw.call(this, world, view));
      const autoClear = this.autoClear; this.autoClear = false;
      try { return draw.call(this, world, view); } finally { this.autoClear = autoClear; }
    } finally { for (const o of hide) o.visible = true; hide.length = 0; }
  };
  try { capture(); } finally { renderer.render = draw; }
};
const row = (m, r, v) => v.set(m.elements[r], m.elements[4 + r], m.elements[8 + r], m.elements[12 + r]), C = new THREE.Vector4(), Cc = new THREE.Vector4(), Q = new THREE.Vector4(), R4 = new THREE.Vector4(), INV = new THREE.Matrix4(), INVT = new THREE.Matrix4(), CLEAR = new THREE.Color();
const drawDeep = c => { // c: the wide camera. Its projection times the squash (in view space), with the near plane on the water (Lengyel's oblique frustum, general form)
  const Pm = deepCam.projectionMatrix.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).multiply(SQ).multiply(c.matrixWorld), e = Pm.elements;
  C.set(0, -1, 0, WY).applyMatrix4(INVT.copy(c.matrixWorld).transpose()); // the water's plane in view space, positive below
  INV.copy(Pm).invert(); Cc.copy(C).applyMatrix4(INVT.copy(INV).transpose()); Q.set(Math.sign(Cc.x), Math.sign(Cc.y), 1, 1).applyMatrix4(INV);
  row(Pm, 3, R4); const a = 2 * R4.dot(Q) / C.dot(Q); e[2] = a * C.x - R4.x; e[6] = a * C.y - R4.y; e[10] = a * C.z - R4.z; e[14] = a * C.w - R4.w;
  deepCam.projectionMatrixInverse.copy(Pm).invert(); row(deepCam.projectionMatrixInverse, 3, uDeepW.value); // 1 / its dot with (ndc, 1) is the squashed point's view depth
  deepCam.matrixWorld.copy(c.matrixWorld); deepCam.matrixWorldInverse.copy(c.matrixWorldInverse); uDeep.value.multiplyMatrices(Pm, c.matrixWorldInverse);
  const t = renderer.getRenderTarget(), au = renderer.shadowMap.autoUpdate, ac = renderer.autoClear, al = renderer.getClearAlpha(); renderer.getClearColor(CLEAR); renderer.shadowMap.autoUpdate = false;
  try {
    if (!waterViews.mask) { renderer.setRenderTarget(deep); renderer.clear(); renderer.render(scene, deepCam); return; } // plain: every pixel shaded (diagnostic A/B)
    deepZ.scissor.copy(deep.scissor); deepZ.scissorTest = deep.scissorTest; renderer.autoClear = false;
    renderer.setRenderTarget(deepZ); renderer.clear(); depthOnly(() => renderer.render(scene, deepCam));
    maskMat.uniforms.uDeepInv.value.copy(uDeep.value).invert(); maskMat.uniforms.uView.value.copy(c.matrixWorldInverse);
    renderer.setRenderTarget(deep); renderer.setClearColor(0, 0); renderer.clear(); maskQuad.render(renderer); renderer.render(scene, deepCam);
  } finally { renderer.setClearColor(CLEAR, al); renderer.autoClear = ac; renderer.setRenderTarget(t); renderer.shadowMap.autoUpdate = au; }
};
const BUF = new THREE.Vector2(), fit = () => { // follow the drawing buffer (resize, pixel ratio, render scale): three resizes the depth texture with the target
  renderer.getDrawingBufferSize(BUF); const w = Math.ceil(BUF.x * OVER), h = Math.ceil(BUF.y * OVER);
  if (under.width !== w || under.height !== h) { under.setSize(w, h); deep.setSize(w, h); deepZ.setSize(w, h); renderer.initRenderTarget(deep); renderer.initRenderTarget(deepZ); const t = renderer.getRenderTarget(); renderer.initRenderTarget(under); renderer.setRenderTarget(t); } // init leaves no framebuffer bound, and this runs inside the frame's render
};
const wideCam = new THREE.PerspectiveCamera(), gl = renderer.getContext(), P = new THREE.Vector3(), M4 = new THREE.Matrix4(), frustum = new THREE.Frustum(), LO = new THREE.Vector3(), HI = new THREE.Vector3();
// Is this pool certainly hidden? Each frame its proxy, the water widened 1.5 m and raised 3 m, is drawn invisibly after everything opaque
// inside an occlusion query. A result arrives a frame or more late, so it is trusted only while fresh (4 frames, no dev.reset since) and
// while the eye has moved under 15 cm since (a run at 60 fps: 10 cm a frame). The proxy is that large because an edge near the eye (a lintel mid-jump) sweeps a wide band of
// a far room for a few cm of movement: with 1 m it reported hidden while the far end of the pool hall showed under a lintel. Nothing is
// trusted while the eye is within 40 cm of a solid (the body is 30 cm round): jumping into a door head opens metres of a far room per cm. A result
// covers only what was on screen: unless the whole proxy was, the view must not have turned, zoomed or changed shape since (even narrower: an edge sliver under a pixel moves with the projection). Anything else is
// unknown, which counts as seen. Rendered in one task (dev.step(n), tools/shots.mjs) no result is ever ready, so nothing is skipped.
const hidden = (w, c) => {
  const e = w.q.last;
  if (!waterViews.cull || !e?.hidden || e.epoch !== epoch || frameNo - e.frame > 4 || P.setFromMatrixPosition(c.matrixWorld).distanceTo(e.pos) > .15) return false;
  const p = c.projectionMatrix.elements;
  return (e.inside || (e.quat.angleTo(c.quaternion) < 1e-5 && p[0] === e.p0 && p[5] === e.p5))
    && !colliders.some(k => Math.hypot(Math.max(k[0] - P.x, 0, P.x - k[2]), Math.max(k[4] - P.y, 0, P.y - k[5]), Math.max(k[1] - P.z, 0, P.z - k[3])) < .4);
};
const FACES = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]], CV = Array.from({ length: 8 }, () => new THREE.Vector4()), EYE = new THREE.Vector3();
const NEAR = [[0, 0, 1, -.01]], WIDE = [...NEAR, [-1, 0, OVER, 0], [1, 0, OVER, 0], [0, -1, OVER, 0], [0, 1, OVER, 0]], SCREEN = [...NEAR, [-1, 0, 1, 0], [1, 0, 1, 0], [0, -1, 1, 0], [0, 1, 1, 0]]; // (x, y, w, 1) in clip space: in front of the eye, inside the wide pictures, on the screen
const clip = (poly, planes) => { // a convex polygon of [x, y, w, ...] (clip space, then anything carried along) cut to the kept side of every plane (Sutherland-Hodgman)
  for (const [a, b, k, d] of planes) {
    const out = [], s = q => a * q[0] + b * q[1] + k * q[2] + d;
    poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], sp = s(p), sq = s(q), t = sp / (sp - sq); if (sp >= 0) out.push(p); if ((sp >= 0) !== (sq >= 0)) out.push(p.map((v, j) => v + (q[j] - v) * t)); });
    poly = out;
  }
  return poly;
};
const project = (lo, hi, c, r, cut = 0, xz) => { // widen r (u0, v0, u1, v1 in the wide pictures), and xz (x0, z0, x1, z1 in the world) if given, by the box lo..hi seen from c.
  const m = M4.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); // cut 0: false if any of it lies behind the eye; else by its part in front of the eye (NEAR), in the wide pictures (WIDE) or on the screen (SCREEN)
  for (let i = 0; i < 8; i++) if (CV[i].set(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z, 1).applyMatrix4(m).w < .01 && !cut) return false;
  EYE.setFromMatrixPosition(c.matrixWorld); // within 5 cm of the box the near plane's own cut through it could be missed below: take all
  if (cut && EYE.x > lo.x - .05 && EYE.x < hi.x + .05 && EYE.y > lo.y - .05 && EYE.y < hi.y + .05 && EYE.z > lo.z - .05 && EYE.z < hi.z + .05) { r[0] = r[1] = 0; r[2] = r[3] = 1; if (xz) { xz[0] = Math.min(xz[0], lo.x); xz[1] = Math.min(xz[1], lo.z); xz[2] = Math.max(xz[2], hi.x); xz[3] = Math.max(xz[3], hi.z); } return true; }
  for (const f of FACES) { // each face clipped (Sutherland-Hodgman) to the kept side of every plane: the bound of what is left is the bound of the box's kept part
    for (const [x, y, w, X, Z] of clip(f.map(i => [CV[i].x, CV[i].y, CV[i].w, i & 1 ? hi.x : lo.x, i & 4 ? hi.z : lo.z]), cut || [])) {
      const u = x / w * .5 / OVER + .5, v = y / w * .5 / OVER + .5;
      r[0] = Math.min(r[0], u); r[1] = Math.min(r[1], v); r[2] = Math.max(r[2], u); r[3] = Math.max(r[3], v);
      if (xz) { xz[0] = Math.min(xz[0], X); xz[1] = Math.min(xz[1], Z); xz[2] = Math.max(xz[2], X); xz[3] = Math.max(xz[3], Z); }
    }
  }
  return true;
};
const scissor = (rt, r, flip) => { // past the bound by the mirror's four taps (.0007 of the width) and bilinear filtering, plus one
  const W = rt.width, H = rt.height, m = Math.ceil(.0007 * W) + 2, c = v => Math.min(1, Math.max(0, v)), x0 = Math.max(0, Math.floor(c(flip ? 1 - r[2] : r[0]) * W) - m), x1 = Math.min(W, Math.ceil(c(flip ? 1 - r[0] : r[2]) * W) + m);
  const y0 = Math.max(0, Math.floor(c(r[1]) * H) - m), y1 = Math.min(H, Math.ceil(c(r[3]) * H) + m);
  rt.scissor.set(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)); rt.scissorTest = true;
};
// Where a refracted ray can go (waterFS holds it there): seen from above, flat water bends it away from the eye's foot by A0 metres per metre down (tan of the
// refracted angle, up to 1.13 at a grazing view) and no way sideways. Ripples turn it by at most SLACK[0] outward or inward and SLACK[1] sideways per metre down
// (measured: a run and a jump into the pool hall's water reach .27 and .15); only steeper splashes are held to that.
const SLACK = [.4, .3], A0 = (l, h) => { const s = .75 * l / Math.hypot(l, h); return s / Math.sqrt(1 - s * s); }; // l: from the eye's foot, h: the eye over the surface
const reach = (o, c, floor, squash, r) => { // widen r by every point a ray from this pool's surface on screen can reach, to the sheet's deepest floor (and 10 cm past it, the
  // deep march's overshoot), squashed for the deep picture; false if that cannot be bounded so (some of it near or behind the eye)
  const m = M4.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse), H = WY - floor + .1, ex = c.matrixWorld.elements[12], ez = c.matrixWorld.elements[14];
  const e = m.elements, cl = (x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[3] * x + e[7] * y + e[11] * z + e[15]];
  const put = (x, y, z) => { const [X, Y, w] = cl(x, WY - (WY - y) * squash, z); if (w < .01) return false; // y squashed toward the surface
    const u = X / w * .5 / OVER + .5, v = Y / w * .5 / OVER + .5; r[0] = Math.min(r[0], u); r[1] = Math.min(r[1], v); r[2] = Math.max(r[2], u); r[3] = Math.max(r[3], v); return true; };
  const poly = clip([[o.x, o.y], [o.z, o.y], [o.z, o.w], [o.x, o.w]].map(([x, z]) => [...cl(x, WY, z), x, z]), SCREEN);
  if (!poly.length) return true; // none of it on screen
  const hy = c.matrixWorld.elements[13] - WY, D = Math.hypot(A0(.3, hy) + SLACK[0], SLACK[1]) * H + .02; // right under the eye the outward direction is any: a square that holds every way
  if (Math.min(...poly.map(p => p[3])) < ex + .3 && Math.max(...poly.map(p => p[3])) > ex - .3 && Math.min(...poly.map(p => p[4])) < ez + .3 && Math.max(...poly.map(p => p[4])) > ez - .3)
    for (const [x, z] of [[ex, ez], ...poly.map(p => [p[3], p[4]]).filter(([x, z]) => Math.hypot(x - ex, z - ez) < .3)]) for (let i = 0; i < 5; i++) if (!put(x + (i & 1 ? D : -D) * (i < 4), WY - H * (i < 4), z + (i & 2 ? D : -D) * (i < 4))) return false;
  for (let i = 0; i < poly.length; i++) { // along the surface's outline, finely enough that the outward direction turns under .03 rad a step, each point's
    const [, , , x0, z0] = poly[i], [, , , x1, z1] = poly[(i + 1) % poly.length]; // cone (a pyramid down to the floor): their hull holds every ray of the inside too
    const n = Math.min(128, Math.ceil(Math.abs(Math.atan2((x0 - ex) * (z1 - ez) - (z0 - ez) * (x1 - ex), (x0 - ex) * (x1 - ex) + (z0 - ez) * (z1 - ez))) / .03) + 1);
    for (let j = 0; j < n; j++) {
      const x = x0 + (x1 - x0) * j / n, z = z0 + (z1 - z0) * j / n, l = Math.hypot(x - ex, z - ez); if (!put(x, WY, z)) return false;
      if (l < .3) continue; const ax = (x - ex) / l, az = (z - ez) / l, a0 = A0(l, hy);
      for (const [a, b] of [[a0 - SLACK[0] - .02, -SLACK[1] - .02], [a0 - SLACK[0] - .02, SLACK[1] + .02], [a0 + SLACK[0] + .02, -SLACK[1] - .02], [a0 + SLACK[0] + .02, SLACK[1] + .02]]) if (!put(x + H * (a * ax - b * az), WY - H, z + H * (a * az + b * ax))) return false;
    }
  }
  return true;
};
const scissors = (users, c) => { // the pictures cut to what these pools' pixels can sample (waterFS). The lens is read along the bent ray, from a bit of surface on
  // screen to its end (reach); the deep picture along the same ray squashed. Only from above: below the plane the pictures are whole. The mirror at a point
  // 9 m along the mirrored ray (below the surface, further from the eye than the surface), eased toward the picture's edge one axis at a time, never past it:
  // so there the whole box in front of the eye counts, unclipped by the picture's sides
  const m = [1, 1, 0, 0], l = [1, 1, 0, 0], d = [1, 1, 0, 0];
  const above = c.matrixWorld.elements[13] > WY + .001;
  for (const { rect: o, sheet: { rect, floor } } of users) {
    if (above && !(reach(o, c, floor, 1, l) && reach(o, c, floor, SQUASH, d))) { // near the eye: the sheet's box, cut to the wide picture
      project(LO.set(rect.x, floor - .1, rect.y), HI.set(rect.z, WY, rect.w), c, l, WIDE);
      project(LO.set(rect.x, WY - SQUASH * (WY - floor + .1), rect.y), HI.set(rect.z, WY, rect.w), c, d, WIDE);
    }
    project(LO.set(o.x - 9, WY - 9, o.y - 9), HI.set(o.z + 9, WY, o.w + 9), c, m, NEAR);
  }
  if (!above) { l.splice(0, 4, 0, 0, 1, 1); d.splice(0, 4, 0, 0, 1, 1); }
  scissor(mirrorRT, m, true); scissor(under, l, false); scissor(deep, d, false);
  const u = under.scissor, W = under.width, H = under.height; uMaskCut.value.set(u.x / W, u.y / H, (u.x + u.z) / W, (u.y + u.w) / H); // the deep picture leans on the lens only inside its cut, cut or not (so cull off changes nothing)
  if (waterViews.cull) uLensCut.value.copy(uMaskCut.value); else { uLensCut.value.set(0, 0, 1, 1); mirrorRT.scissorTest = under.scissorTest = deep.scissorTest = false; }
};
const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, side: THREE.DoubleSide });
const uTest = { value: 0 }; // ?dev measurement (dev.waterCheck): 1 the lens picture alone, 2 the mirror alone, both with the surface flat; 3 a mask
const DROPS = 8; // disturbances one step takes: the player's and the loose things'
const RECTS = 4; // pools one sheet of water may join (sheets below)
const simMat = new THREE.ShaderMaterial({ uniforms: { tSim: { value: null }, uPx: { value: null }, uDrop: { value: Array.from({ length: DROPS }, () => V(0, 0, 0)) }, uWet: { value: null } }, vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tSim; uniform vec2 uPx; uniform vec3 uDrop[${DROPS}]; uniform vec4 uWet[${RECTS}]; varying vec2 vUv;
    bool wet(vec2 u) { for (int i = 0; i < ${RECTS}; i++) if (u.x > uWet[i].x && u.x < uWet[i].z && u.y > uWet[i].y && u.y < uWet[i].w) return true; return false; } // inside one of the sheet's pools
    float nb(vec2 u, float own) { return wet(u) ? texture2D(tSim, u).r : own; } // a side wall reflects: past it the water sees its own height
    void main() { vec4 s = texture2D(tSim, vUv); // r = height, g = velocity
      vec2 l = vUv - vec2(uPx.x, 0.), r = vUv + vec2(uPx.x, 0.), d = vUv - vec2(0., uPx.y), u = vUv + vec2(0., uPx.y);
      if (!wet(vUv)) { float n = 0., c = 0.; if (wet(l)) { n += texture2D(tSim, l).r; c++; } if (wet(r)) { n += texture2D(tSim, r).r; c++; } if (wet(d)) { n += texture2D(tSim, d).r; c++; } if (wet(u)) { n += texture2D(tSim, u).r; c++; }
        gl_FragColor = vec4(c > 0. ? n / c : 0., 0., 0., 1.); return; } // dry ground in the sheet's box holds the height of the water beside it, so slopes read at a wall are as at the box's own edge
      float avg = (nb(l, s.r) + nb(r, s.r) + nb(d, s.r) + nb(u, s.r)) * .25;
      s.g = (s.g + (avg - s.r) * 2.) * .993; s.r += s.g;
      for (int i = 0; i < ${DROPS}; i++) { vec2 d = (vUv - uDrop[i].xy) / uPx; s.r += uDrop[i].z * exp(-dot(d, d) / 18.); }
      gl_FragColor = s; }` });
const simQuad = new FullScreenQuad(simMat);
// A sheet's light picture: the caustic film at this moment plus the simulation's real ripples, light minus one at 3 cm a texel with mipmaps,
// one step after each wave step. The tiles and the water's still plan read it with one lookup (it takes the tiles' place for the simulation's map).
const lightMat = new THREE.ShaderMaterial({ uniforms: { tSim: { value: null }, tFilm: filmU, uPx: { value: null }, uPond: { value: null }, uTime }, vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tSim; uniform vec2 uPx; uniform vec4 uPond; uniform float uTime, uCaus; uniform vec3 uCausDir; varying vec2 vUv;
    ${causticsGLSL}${filmGLSL}
    void main() { vec2 e = uPx * 2.;
      float lap = texture2D(tSim, vUv - vec2(e.x, 0.)).r + texture2D(tSim, vUv + vec2(e.x, 0.)).r + texture2D(tSim, vUv - vec2(0., e.y)).r + texture2D(tSim, vUv + vec2(0., e.y)).r - 4. * texture2D(tSim, vUv).r;
      gl_FragColor = vec4(causLight(mix(uPond.xy, uPond.zw, vUv), lap), 0., 0., 1.); }` });
const lightQuad = new FullScreenQuad(lightMat);
function light(S) { Object.assign(lightMat.uniforms, { tSim: { value: S.sim[0].texture }, uPx: { value: S.px }, uPond: { value: S.rect } }); const t = renderer.getRenderTarget(); renderer.setRenderTarget(S.light); lightQuad.render(renderer); renderer.setRenderTarget(t); }
const waterVS = 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const waterFS = `uniform sampler2D tMirror, tMirrorZ, tUnder, tUnderZ, tDeep, tDeepZ, tPlan, tGround, tNormalMap0, tNormalMap1, tSim, tLight;
    uniform mat4 projectionMatrix, uLens, uDeep; uniform vec4 uDeepW, uLensCut, uMirrorW; uniform vec4 uPond; uniform vec2 uPx; uniform vec3 uScatter, uCausDir; uniform float uFloor, uTime, uMain, uCaus, uTest; uniform vec4 uLook; varying vec3 vW;
    ${causticsGLSL}
    vec4 clip(vec3 p) { return projectionMatrix * viewMatrix * vec4(p, 1.); } // .w is the distance from the camera
    vec2 wide(vec4 c) { return c.xy / c.w * ${(.5 / OVER).toFixed(5)} + .5; } // a clip position's place in the two wider pictures
    ${seenGLSL}
    float deepSeen(vec2 u) { float d = texture2D(tDeepZ, u).x; return d > .999999 ? 1e4 : 1. / dot(uDeepW, vec4(u * 2. - 1., d * 2. - 1., 1.)); } // the same for the deep picture
    bool off(vec2 u) { return any(lessThan(u, vec2(0.))) || any(greaterThan(u, vec2(1.))); }
    vec2 onScreen(vec2 from, vec2 to) { vec2 d = to - from, room = max(mix(from, 1. - from, step(0., d)), 1e-4); return from + sign(d) * room * (1. - exp(-abs(d) / room)); } // a lookup that would leave the picture is eased toward its edge; clamping smears streaks
    vec2 mirrorUV(vec4 c) { vec2 u = wide(c); return vec2(1. - u.x, u.y); }
    float mirrorSeen(vec2 uv) {
      float depth = texture2D(tMirrorZ, uv).x;
      // Undo the mirror camera's oblique projection using its inverse's last row.
      return depth > .999999 ? 1e4 : 1. / dot(uMirrorW, vec4(uv * 2. - 1., depth * 2. - 1., 1.));
    }
    vec2 reflectionUV(vec3 ray, vec2 here) {
      // Stop at the first captured surface, not a point beyond a nearby wall. The
      // old fixed-distance lookup could cross the capture's water clip plane and
      // read exterior sky where the actual reflected ray hits opaque masonry.
      vec4 start = clip(vW);
      vec4 delta = projectionMatrix * viewMatrix * vec4(ray, 0.);
      float lo = 0.;
      for (int i = 1; i <= 24; i++) {
        float hi = 9. * pow(float(i) / 24., 2.);
        vec4 sampleClip = start + delta * hi;
        vec2 uv = mirrorUV(sampleClip);
        if (off(uv)) break;
        if (sampleClip.w >= mirrorSeen(uv)) {
          for (int j = 0; j < 7; j++) {
            float mid = (lo + hi) * .5;
            vec4 midClip = start + delta * mid;
            if (midClip.w >= mirrorSeen(mirrorUV(midClip))) hi = mid;
            else lo = mid;
          }
          return mirrorUV(start + delta * hi);
        }
        lo = hi;
      }
      vec2 fallback = onScreen(here, wide(clip(vW + ray * 9.)));
      return vec2(1. - fallback.x, fallback.y);
    }
    vec2 plan(vec2 xz) { vec2 s = (xz - uPond.xy) / (uPond.zw - uPond.xy); return vec2(s.x, 1. - s.y); } // a world position's place in the pool's top-down picture
    float ground(vec2 xz) { return texture2D(tGround, (xz - uPond.xy) / (uPond.zw - uPond.xy)).r; } // height of whatever is under the water there
    void main() {
      if (uTest == 3.) { gl_FragColor = vec4(-1., -1., -1., 1.); return; } // ?dev: where the water is
      vec4 c0 = clip(vW); vec2 here = wide(c0);
      float gap = mix(9., seen(here) - c0.w, uMain); // metres of water between this bit of surface and what lies under it
      float body = smoothstep(0., .1, gap); // 0 at the shore, 1 in open water
      vec2 s = (vW.xz - uPond.xy) / (uPond.zw - uPond.xy);
      float hx = texture2D(tSim, s - vec2(uPx.x, 0.)).r - texture2D(tSim, s + vec2(uPx.x, 0.)).r, hz = texture2D(tSim, s - vec2(0., uPx.y)).r - texture2D(tSim, s + vec2(0., uPx.y)).r;
      vec2 calm = -poolWaves(vW.xz, 0.).xy + (texture2D(tNormalMap0, vW.xz * .23 + uTime * vec2(.011, .007)).rg + texture2D(tNormalMap1, vW.xz * .37 - uTime * vec2(.009, .013)).rg - 1.) * .009; // water is never glass-flat
      vec3 n = normalize(vec3((hx * 10. + calm.x) * body * uLook.z, 1., (hz * 10. + calm.y) * body * uLook.z)), V = normalize(cameraPosition - vW);
      if (uTest > 0.) n = vec3(0., 1., 0.); // ?dev measurement: flat
      vec3 R = reflect(-V, n); R.y = -max(R.y, .03); // mirrored: the mirror picture shows the room upside-down below the surface
      vec2 ru = reflectionUV(R, here), o = vec2(.0007, 0.); // four taps: a real surface is never a perfect mirror
      vec3 refl = (texture2D(tMirror, ru + o.xy).rgb + texture2D(tMirror, ru - o.xy).rgb + texture2D(tMirror, ru + o.yx).rgb + texture2D(tMirror, ru - o.yx).rgb) * .25;
      vec3 T = refract(-V, n, uTest == 1. ? 1. : .75); // air to water (?dev measurement: straight through)
      if (uTest != 1.) { vec2 ra = vW.xz - cameraPosition.xz; float rl = length(ra), y = max(-T.y, .001); ra = rl > 1e-4 ? ra / rl : vec2(1., 0.); vec2 si = vec2(-ra.y, ra.x); // held to where reach() looks for it:
        vec3 T0 = refract(-V, vec3(0., 1., 0.), .75); float a0 = dot(T0.xz, ra) / -T0.y, a = dot(T.xz, ra), b = dot(T.xz, si); // within SLACK per metre down of the flat surface's ray
        float ac = clamp(a, (a0 - ${SLACK[0].toFixed(3)}) * y, (a0 + ${SLACK[0].toFixed(3)}) * y), bc = clamp(b, -${SLACK[1].toFixed(3)} * y, ${SLACK[1].toFixed(3)} * y);
        if (ac != a || bc != b || T.y > -.001) { vec2 h = ra * ac + si * bc; T = normalize(vec3(h.x, -y, h.y)); } }
      vec2 tw = mix(vW.xz - uPond.xy, uPond.zw - vW.xz, step(0., T.xz)) / (abs(T.xz) + 1e-5);
      float t = clamp(min((uFloor - vW.y) / min(T.y, -.001), min(tw.x, tw.y)), 0., 30.); // furthest the ray can go: the basin's floor or wall. Never negative, or exp() below overflows
      { float lo = 0., hi = t; bool found = false; // stop where the ray goes under the floor, a step or into a column
        for (int i = 1; i <= 32; i++) { float ti = t * float(i) / 32.; vec3 q = vW + T * ti; if (q.y < ground(q.xz)) { hi = ti; found = true; break; } lo = ti; }
        if (found) { for (int i = 0; i < 6; i++) { float tm = .5 * (lo + hi); vec3 q = vW + T * tm; if (q.y < ground(q.xz)) hi = tm; else lo = tm; } t = hi; }
      }
      float tH = t; // the height map's answer
      if (uMain > 0.) { float lo = 0., st = t / 16.; // the height map's columns are their colliders, a few cm proud of the stone, and it has no rails or rungs: so the
        for (int i = 1; i <= 16; i++) { float ti = st * float(i); vec4 cq = clip(vW + T * ti); vec2 uq = wide(cq); float dz = off(uq) ? -1. : cq.w - seen(uq); // first point the ray reaches
          if (dz > 0. && dz < .1 + st) { float hi = ti; for (int k = 0; k < 4; k++) { float tm = .5 * (lo + hi); vec4 cm = clip(vW + T * tm); if (cm.w > seen(wide(cm))) hi = tm; else lo = tm; }
            if (seen(wide(clip(vW + T * lo))) - seen(wide(clip(vW + T * hi))) < .1 + .03 * cq.w) t = hi; break; } // just behind the
          lo = ti; } // underwater picture's surface is what it really meets, and the picture holds it; the height map stays the fallback where the picture has nothing
      } // ...unless the picture's depth jumps there: then the ray went behind an edge the camera sees over (a step's nosing), not into a surface, and the height map's point stands
      vec3 hit = vW + T * t; vec4 ch = clip(hit); vec2 hu = wide(ch);
      float live = off(hu) ? 0. : uMain * (1. - smoothstep(.05 + .02 * ch.w, .14 + .05 * ch.w, abs(ch.w - seen(hu)))); // can the camera see the point the ray reached? (its depth there must match)
      vec3 eye = texture2D(tUnder, hu).rgb, dc = vec3(0.); float dl = 0.;
      if (uMain > 0. && live < 1.) { float lo = 0., st = (tH + .05) / 16.; // the eye's picture cannot see where the ray went: follow it through the deep picture
        for (int i = 1; i <= 16; i++) { float ti = st * float(i); vec4 cq = uDeep * vec4(vW + T * ti, 1.); vec2 uq = cq.xy / cq.w * .5 + .5; float dz = off(uq) ? -1. : cq.w - deepSeen(uq);
          if (dz > 0. && dz < .1 + st) { float hi = ti; for (int k = 0; k < 5; k++) { float tm = .5 * (lo + hi); vec4 cm = uDeep * vec4(vW + T * tm, 1.); if (cm.w > deepSeen(cm.xy / cm.w * .5 + .5)) hi = tm; else lo = tm; }
            vec4 c2 = uDeep * vec4(vW + T * hi, 1.); vec2 u2 = c2.xy / c2.w * .5 + .5;
            dl = off(u2) ? 0. : 1. - smoothstep(.05 + .02 * c2.w, .14 + .05 * c2.w, abs(c2.w - deepSeen(u2))); vec4 dd = texture2D(tDeep, u2); dc = dd.rgb + (1. - dd.a) * texture2D(tUnder, wide(clip(vW + T * hi))).rgb; // what is clear there the eye's picture holds
            t = mix(hi, t, live); hit = vW + T * t; break; }
          lo = ti; }
      }
      vec4 plan4 = texture2D(tPlan, plan(hit.xz)); vec3 still = plan4.rgb * uLook.w; // the plan is a still, so it gets the same moving light the tiles give the live picture: drifting pattern plus the real ripples
      vec3 hp = causticPath(hit); float cz = causMap(texture2D(tLight, (hp.xy - uPond.xy) / (uPond.zw - uPond.xy), uCausDir.y > .999 ? .8 : 0.).r, hp.z); // as the tiles have it
      still *= 1. + plan4.a * cz * causStrength(); // on the directly lit share only (the plan's alpha), as on the tiles: none in shade
      if (uTest == 1.) { gl_FragColor = vec4(mix(texture2D(tUnder, here).rgb, mix(mix(still, dc, dl), eye, live), body), 1.); return; } // ?dev: the lens picture alone
      if (uTest == 2.) { gl_FragColor = vec4(texture2D(tMirror, ru).rgb, 1.); return; } // ?dev: the mirror picture alone
      vec3 refr = mix(mix(still, dc, dl), eye, live) * exp(-vec3(.42, .085, .06) * t * uLook.x); // red is absorbed first
      refr += uScatter * (1. - exp(-.3 * t)); // and the water itself scatters the room's light back, giving deep water a pale body
      vec3 col = mix(refr, refl, (.02 + .98 * pow(1. - max(dot(V, n), 0.), 5.)) * uLook.y);
      col = mix(texture2D(tUnder, here).rgb, col, body); // thin water shows what is under it, unbent and untinted
      col += refl * .3 * smoothstep(0., .015, gap) * (1. - smoothstep(.015, .06, gap)); // a wet glint along the contact line
      gl_FragColor = vec4(col, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
// Pools that touch along an edge are one sheet of water: one wave field, one CPU copy, one height map and one plan over the box round
// them all, so waves, light and what floats run on across the join, and each pool's surface reads the same field. Within the box,
// ground outside every pool is dry: a wall to the waves and to the refracted rays.
const touch = (a, b) => { const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oz = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return (ox > 1e-6 && oz > -1e-6) || (oz > 1e-6 && ox > -1e-6); };
const sheetOf = pools.map((_, i) => i);
for (let i = 0; i < pools.length; i++) for (let j = 0; j < i; j++) if (touch(pools[i], pools[j])) { const a = sheetOf[i], b = sheetOf[j]; sheetOf.forEach((s, k) => { if (s === a) sheetOf[k] = b; }); }
const sheets = [...new Set(sheetOf)].map(id => {
  const mine = pools.filter((_, i) => sheetOf[i] === id), rects = mine.map(p => p.slice(0, 4));
  if (rects.length > RECTS) throw new Error(`a sheet of water joins ${rects.length} pools; the wave step takes ${RECTS}`);
  const x1 = Math.min(...rects.map(r => r[0])), z1 = Math.min(...rects.map(r => r[1])), x2 = Math.max(...rects.map(r => r[2])), z2 = Math.max(...rects.map(r => r[3]));
  const floor = Math.min(...mine.map(p => p[4])), wetAt = (x, z) => rects.some(r => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
  const rt = () => new THREE.WebGLRenderTarget(Math.round((x2 - x1) * 20), Math.round((z2 - z1) * 20), { type: THREE.HalfFloatType, depthBuffer: false }); // 5cm cells
  const sim = [rt(), rt()], rect = new THREE.Vector4(x1, z1, x2, z2), px = new THREE.Vector2(.05 / (x2 - x1), .05 / (z2 - z1));
  const wet = Array.from({ length: RECTS }, (_, i) => { const r = rects[i]; return r ? new THREE.Vector4((r[0] - x1) / (x2 - x1), (r[1] - z1) / (z2 - z1), (r[2] - x1) / (x2 - x1), (r[3] - z1) / (z2 - z1)) : new THREE.Vector4(); });
  const ppm = Math.min(80, 4096 / Math.max(x2 - x1, z2 - z1)), planRT = new THREE.WebGLRenderTarget(Math.round((x2 - x1) * ppm), Math.round((z2 - z1) * ppm), { type: THREE.HalfFloatType }); // the plan: 80 pixels a metre where it fits
  const gw = Math.round((x2 - x1) * 20), gh = Math.round((z2 - z1) * 20), heights = new Float32Array(gw * gh), solid = colliders.filter(c => !c[6] && c[5] > WY && c[4] < 1.7 && c[2] > x1 && c[0] < x2 && c[3] > z1 && c[1] < z2); // boxes standing in the water
  for (let j = 0, i = 0; j < gh; j++) for (let k = 0; k < gw; k++, i++) { // the height map: the walking floor, or the surface itself where a wall or column stands in the water or the ground is dry
    const x = x1 + (k + .5) / 20, z = z1 + (j + .5) / 20;
    heights[i] = !wetAt(x, z) || solid.some(c => x > c[0] && x < c[2] && z > c[1] && z < c[3]) ? WY : Math.min(WY, floorH(x, z));
  }
  const ground = new THREE.DataTexture(heights, gw, gh, THREE.RedFormat, THREE.FloatType); ground.needsUpdate = true;
  // where a floating disc may be: inside a pool, or across a join, in the band the two pools share (a pool's side there is open water)
  const boxes = [...rects];
  for (const a of rects) for (const b of rects) if (a !== b && touch(a, b)) {
    if (Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1e-6 && a[2] <= b[0] + 1e-6) boxes.push([a[0], Math.max(a[1], b[1]), b[2], Math.min(a[3], b[3])]); // a west of b
    if (Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1e-6 && a[3] <= b[1] + 1e-6) boxes.push([Math.max(a[0], b[0]), a[1], Math.min(a[2], b[2]), b[3]]); // a north of b
  }
  const keep = (x, z, r, o) => { // -> o.x, o.z: the nearest place to (x, z) where a disc of radius r lies all in the water; returns the squared distance to it
    let d = Infinity; o.x = x; o.z = z;
    for (const [bx1, bz1, bx2, bz2] of boxes) if (bx2 - bx1 >= 2 * r && bz2 - bz1 >= 2 * r) { const cx = Math.min(bx2 - r, Math.max(bx1 + r, x)), cz = Math.min(bz2 - r, Math.max(bz1 + r, z)), e = (cx - x) ** 2 + (cz - z) ** 2; if (e < d) { d = e; o.x = cx; o.z = cz; } }
    return d;
  };
  const light = new THREE.WebGLRenderTarget(Math.round((x2 - x1) / .03), Math.round((z2 - z1) / .03), { type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  return { rects, rect, floor, sim, light, px, wet, planRT, ppm, ground, keep, ponds: [], twin: twin(x1, z1, x2, z2, wetAt) };
});
const ponds = pools.map(([x1, z1, x2, z2, floor, zid, seen, scatter]) => {
  const S = sheets.find(q => q.rects.some(r => r[0] === x1 && r[1] === z1 && r[2] === x2 && r[3] === z2)), { sim, px, planRT } = S;
  const g = new THREE.PlaneGeometry(x2 - x1, z2 - z1), rect = new THREE.Vector4(x1, z1, x2, z2);
  const planCam = new THREE.OrthographicCamera((x1 - x2) / 2, (x2 - x1) / 2, (z2 - z1) / 2, (z1 - z2) / 2, .001, Math.max(1.6, WY - floor + .5)); // looking straight down from the surface, to below its deepest floor
  planCam.position.set((x1 + x2) / 2, WY, (z1 + z2) / 2); planCam.up.set(0, 0, -1); planCam.lookAt((x1 + x2) / 2, WY - 1, (z1 + z2) / 2);
  const U = { uCaus: zones[zid].tileU.uCaus, uCausDir: zones[zid].tileU.uCausDir, tMirror: { value: mirrorRT.texture }, tPlan: { value: planRT.texture }, tGround: { value: S.ground }, tUnder: { value: under.texture }, tUnderZ: { value: under.depthTexture }, tDeep: { value: deep.texture }, tDeepZ: { value: deep.depthTexture }, uDeep, uDeepW, uLensCut, uLens: { value: lens.camera.projectionMatrix }, tNormalMap0: { value: wn0 }, tNormalMap1: { value: wn1 },
              tMirrorZ: { value: mirrorRT.depthTexture }, uMirrorW,
              tSim: { value: sim[0].texture }, tLight: { value: S.light.texture }, uPond: { value: S.rect }, uPx: { value: px }, uFloor: { value: S.floor }, uScatter: { value: V(...scatter) }, uLook: { value: new THREE.Vector4(1, 1, 1, 1) }, uMain: { value: 0 }, uTest, uTime }; // uPond, uFloor: the sheet's box and deepest floor, which its field, height map and plan span
  const w = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: waterVS, fragmentShader: waterFS, transparent: true }));
  Object.assign(w, { lens, mirror, deep, seen, rect, floor, q: { pending: [], last: null }, sheet: S, tileU: zones[zid].tileU, zone: zones[zid], twin: S.twin });
  S.ponds.push(w);
  w.drawPlan = z => { // once per zone, while that zone's lamps are lit for its bake: the part of this pool that lies in its room, into this pool's part of the sheet's plan
    const c1 = Math.max(x1, z.box[0]), d1 = Math.max(z1, z.box[1]), c2 = Math.min(x2, z.box[2]), d2 = Math.min(z2, z.box[3]); if (c1 >= c2 || d1 >= d2) return; // so where a pool runs on into the next room (a channel into a pool hall) it is drawn under that room's lamps, as the live view shows it
    const tu = Object.values(zones).filter(q => q.tileU), caus = tu.map(q => q.tileU.uCaus.value), target = renderer.getRenderTarget(), R = S.rect, k = S.ppm, u = x => Math.round((x - R.x) * k), v = z => Math.round((R.w - z) * k);
    planRT.viewport.set(u(x1), v(z2), u(x2) - u(x1), v(z1) - v(z2)); planRT.scissor.set(u(c1), v(d2), u(c2) - u(c1), v(d1) - v(d2)); planRT.scissorTest = true;
    const skyVisible = sky.visible;
    for (const q of tu) q.tileU.uCaus.value = 0; sky.visible = false; renderer.setRenderTarget(planRT); renderer.render(scene, planCam); // caustics off, since the plan is a still and they move
    planRT.viewport.set(0, 0, planRT.width, planRT.height); planRT.scissor.copy(planRT.viewport); planRT.scissorTest = false;
    tu.forEach((q, i) => q.tileU.uCaus.value = caus[i]); sky.visible = skyVisible; renderer.setRenderTarget(target);
  };
  for (let x = x1 + .05; x < x2; x += .1) for (let z = z1 + .05; z < z2; z += .1) console.assert(Object.values(zones).some(q => q.mats.length && inR(x, z, ...q.box)), 'a pool reaches past every room: its plan has a hole there', x, z); // drawPlan's parts cover it
  w.tileU.uLight.value = S.light.texture; w.tileU.uPond.value = S.rect;
  w.rotation.x = -Math.PI / 2; w.position.set((x1 + x2) / 2, WY, (z1 + z2) / 2); scene.add(w);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1 + 3, z2 - z1 + 3, 3.05).translate(0, 0, 1.475), proxyMat); // in the water's frame: z is up
  proxy.renderOrder = -1e9; w.add(proxy); seeThrough.push(proxy); // first of the see-through things, so only opaque depth decides; never in the AO pass
  proxy.geometry.computeBoundingBox();
  let open = null;
  proxy.onBeforeRender = (r, s, c) => {
    if (c !== camera || s.overrideMaterial) return;
    const q = w.q; // take what has arrived, oldest first
    while (q.pending.length && gl.getQueryParameter(q.pending[0].query, gl.QUERY_RESULT_AVAILABLE)) { const e = q.pending.shift(); e.hidden = !gl.getQueryParameter(e.query, gl.QUERY_RESULT); gl.deleteQuery(e.query); q.last = e; }
    if (q.pending.length > 3) return;
    LO.copy(proxy.geometry.boundingBox.min).applyMatrix4(proxy.matrixWorld); HI.copy(proxy.geometry.boundingBox.max).applyMatrix4(proxy.matrixWorld);
    const r4 = [1, 1, 0, 0], inside = project(P.copy(LO).min(HI), HI.max(LO), c, r4) && r4[0] >= .5 - .5 / OVER && r4[1] >= .5 - .5 / OVER && r4[2] <= .5 + .5 / OVER && r4[3] <= .5 + .5 / OVER;
    const p = c.projectionMatrix.elements;
    open = { query: gl.createQuery(), frame: frameNo, epoch, pos: new THREE.Vector3().setFromMatrixPosition(c.matrixWorld), quat: c.quaternion.clone(), p0: p[0], p5: p[5], inside };
    gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, open.query);
  };
  proxy.onAfterRender = () => { if (open) { gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE); w.q.pending.push(open); open = null; } };
  w.onBeforeRender = (r, s, c) => {
    U.uMain.value = +(c === camera);
    if (c !== camera || s.overrideMaterial) return; // only the main view makes the two pictures (not the AO pass's normals, drawn from the same camera)
    // Three skips a plane's captures from its back side. There each pool captures for itself just before it draws rather
    // than trust a capture made for another (also covers noclip and near-coplanar diagnostic views).
    const reuse = waterViews.reuse && c.matrixWorld.elements[13] > WY + .001;
    if ((reuse && captured) || hidden(w, c)) return;
    frustum.setFromProjectionMatrix(M4.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
    fit(); scissors(reuse ? ponds.filter(q => q.visible && frustum.intersectsObject(q)) : [w], c); // a pool judged hidden still counts: the pair is made anyway
    wideCam.copy(c); wideCam.projectionMatrix.elements[0] /= OVER; wideCam.projectionMatrix.elements[5] /= OVER; wideCam.projectionMatrixInverse.copy(wideCam.projectionMatrix).invert();
    const on = ponds.map(q => q.visible); // every pool is at the same level, so none belongs in another's mirror or underwater picture
    for (const q of ponds) q.visible = false;
    mirror.matrixWorld.copy(w.matrixWorld); captureUnder(() => mirror.onBeforeRender(r, s, wideCam));
    row(INV.copy(mirror.camera.projectionMatrix).invert(), 3, uMirrorW.value);
    // three's Refractor sets only its camera's matrixWorld; a scene hook calling getWorldPosition() rebuilds that from .matrix (identity), so keep .matrix the same
    lens.camera.matrix.copy(wideCam.matrixWorld);
    const skyVisible = sky.visible;
    sky.visible = false; lens.matrixWorld.copy(w.matrixWorld); captureUnder(() => { lens.onBeforeRender(r, s, wideCam); drawDeep(wideCam); }); sky.visible = skyVisible; // the sky ignores the clip and would fill the gaps
    ponds.forEach((q, i) => q.visible = on[i]);
    captured = true;
  };
  return w;
});
// The CPU's coarse copy of a pool's waves, 20 cm cells, given the same disturbances: what floating things ride on, so the GPU
// waves never have to be read back. Shallow-water form (heights in the cells, water velocity on the faces between them),
// tuned to the GPU waves' speed (c = 2.12 m/s: one 5 cm cell * 60 Hz / sqrt 2) and damping (.993 a step); walls reflect, as there.
function twin(x1, z1, x2, z2, wetAt) { // over a sheet's box: faces next to dry cells stay shut, and a dry cell beside water holds its height (as on the GPU)
  const nx = Math.round((x2 - x1) / .2), nz = Math.round((z2 - z1) / .2), dx = (x2 - x1) / nx, dz = (z2 - z1) / nz;
  const h = new Float32Array(nx * nz), u = new Float32Array((nx + 1) * nz), v = new Float32Array(nx * (nz + 1)), G = 9.8, D = 2.12 ** 2 / 9.8, t = 1 / 60;
  const wet = Uint8Array.from({ length: nx * nz }, (_, k) => wetAt(x1 + (k % nx + .5) * dx, z1 + ((k / nx | 0) + .5) * dz)), nWet = wet.reduce((a, b) => a + b, 0);
  const shore = []; for (let k = 0; k < h.length; k++) if (!wet[k]) { const i = k % nx, n = [i > 0 && k - 1, i < nx - 1 && k + 1, k >= nx && k - nx, k + nx < h.length && k + nx].filter(q => q !== false && wet[q]); if (n.length) shore.push([k, ...n]); }
  const T = { x1, z1, nx, nz, dx, dz, h, u, v, at: { h: 0, gx: 0, gz: 0, ux: 0, uz: 0 } };
  T.step = drops => {
    for (const [x, z, p] of drops) { // the same volume the GPU's gaussian adds, shared bilinearly between the four nearest cells
      const fx = Math.min(nx - 1.001, Math.max(0, (x - x1) / dx - .5)), fz = Math.min(nz - 1.001, Math.max(0, (z - z1) / dz - .5)), i = fx | 0, j = fz | 0, a = fx - i, b = fz - j, q = p * .1414 / (dx * dz);
      h[i + j * nx] += q * (1 - a) * (1 - b); h[i + 1 + j * nx] += q * a * (1 - b); h[i + (j + 1) * nx] += q * (1 - a) * b; h[i + 1 + (j + 1) * nx] += q * a * b;
    }
    for (let j = 0; j < nz; j++) for (let i = 1; i < nx; i++) { const k = i + j * (nx + 1), c = i + j * nx; u[k] = wet[c] && wet[c - 1] ? (u[k] - G * t * (h[c] - h[c - 1]) / dx) * .993 : 0; }
    for (let j = 1; j < nz; j++) for (let i = 0; i < nx; i++) { const k = i + j * nx; v[k] = wet[k] && wet[k - nx] ? (v[k] - G * t * (h[k] - h[k - nx]) / dz) * .993 : 0; }
    let s = 0; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = i + j * nx; if (wet[k]) s += h[k] -= D * t * ((u[k + j + 1] - u[k + j]) / dx + (v[k + nx] - v[k]) / dz); }
    s /= nWet; for (let k = 0; k < h.length; k++) h[k] = wet[k] ? h[k] - s : 0; // the drops add water and the closed sides keep it: hold the mean level at the still surface, as the drawn water's is
    for (const [k, ...n] of shore) { let a = 0; for (const q of n) a += h[q]; h[k] = a / n.length; }
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
// made at load, not on the frame a pool first shows (the baths seen first through their door: five targets and textures in one frame); `under` by fit(), from the first frame on
for (const r of [...sheets.flatMap(S => S.sim), mirrorRT]) renderer.initRenderTarget(r);
for (const S of sheets) light(S); // the light pictures, and their program, at load
for (const w of ponds) for (const u of [w.material.uniforms, w.tileU]) for (const k in u) if (u[k].value?.isTexture && !u[k].value.isRenderTargetTexture) renderer.initTexture(u[k].value);
function ripple(S, drops) { // one 60Hz step of a sheet's waves, with up to DROPS disturbances [x, z, size] in world space
  simMat.uniforms.tSim.value = S.sim[0].texture; simMat.uniforms.uPx.value = S.px; simMat.uniforms.uWet.value = S.wet;
  simMat.uniforms.uDrop.value.forEach((d, i) => { const [x, z, p] = drops[i] || [0, 0, 0]; d.set((x - S.rect.x) / (S.rect.z - S.rect.x), (z - S.rect.y) / (S.rect.w - S.rect.y), p); });
  renderer.setRenderTarget(S.sim[1]); simQuad.render(renderer); renderer.setRenderTarget(null);
  S.sim.reverse(); for (const w of S.ponds) w.material.uniforms.tSim.value = S.sim[0].texture;
  light(S);
  if (S.twin.used) S.twin.step(drops.slice(0, DROPS)); // only a sheet with something floating on it (physics.js marks them) needs the copy
}

function resetWater() { // ?dev only (dev.reset): every pool flat and still, as at load, on the GPU and in the CPU's copy
  const t = renderer.getRenderTarget(), c = renderer.getClearColor(new THREE.Color()), a = renderer.getClearAlpha(); renderer.setClearColor(0, 0);
  for (const S of sheets) { for (const r of S.sim) { renderer.setRenderTarget(r); renderer.clear(); } S.twin.h.fill(0); S.twin.u.fill(0); S.twin.v.fill(0); }
  renderer.setRenderTarget(t); renderer.setClearColor(c, a); epoch++; // and no visibility result from before counts
}

export { ponds, sheets, ripple, resetWater, uTest, waterViews };
