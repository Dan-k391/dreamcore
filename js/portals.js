// What is seen through a portal (build.js portal()): drawn into the very buffers the scene pass and the AO pass draw into, so AO,
// fog, shafts, bloom and grade treat the two sides as one picture and there is no frame to see.
//
// After each scene draw from the main camera (the scene pass, then the AO pass's normals and depth), for every portal end in view:
//  1. its pocket, a box behind the opening, marks the stencil where the opening is the nearest thing seen. Its fragments are placed at
//     the depth where their ray crosses the opening's plane (and dropped if it crosses outside the opening), so the test is against the
//     plane itself: nothing behind the plane on this side can hide the opening, and the mark still covers the screen with the eye in the
//     plane or closer to it than the near plane (looking along it while straddling it, say).
//  2. the depth there is set to the far plane, and the scene is drawn again from the eye taken through the portal (the same projection,
//     so the depth and normals the AO and fog read are exactly those of a real doorway), only where marked, scissored to the opening's
//     screen rectangle, with the far side's own zone layers (seen.js), clipped at the far end's plane by core.js's clip plane.
//  3. a door in the opening (build.js portal()'s da, db: one leaf, a copy each side) is drawn once, whole, by this side's copy: the far copy
//     is hidden in the far draw and this side's leaf meshes drawn again over the picture, depth tested against it, so the part of the
//     leaf past the plane is lit by the lamps on the side it is seen from (the far copy, behind which there is no room, would get no light
//     on its face toward the plane: black), and it is the same leaf in every frame up to the plane.
//  4. inside that picture, openings seen through it are drawn the same way, DEPTH levels deep; past that an opening is a dark fill.
import * as THREE from 'three';
import { renderer, scene, camera, clip } from './core.js';
import { ends, side, live } from './build.js';
import { ponds } from './water.js';

const DEPTH = 2, D = 1, REACH = 80; // levels drawn through openings; the pocket's depth (any works: the test is at the plane); no portal farther (a zone drawn from everywhere, the dev yard, would draw its far sides behind every wall)
const gl = renderer.getContext(), st = renderer.state, sb = st.buffers.stencil, draw = renderer.render.bind(renderer);
const U = { uC: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uR: { value: new THREE.Vector3() }, uS: { value: new THREE.Vector2() }, uP: { value: new THREE.Matrix4() }, uMode: { value: 0 }, uFill: { value: new THREE.Color() } };
const pocketMat = o => new THREE.ShaderMaterial({ uniforms: U, side: THREE.BackSide, colorWrite: false, depthWrite: false, depthFunc: THREE.LessEqualDepth, stencilWrite: true, stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp, ...o,
  vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform vec3 uC, uN, uR, uFill; uniform vec2 uS; uniform mat4 uP; uniform float uMode; varying vec3 vW;
    void main() { vec3 d = vW - cameraPosition; float dn = dot(d, uN), t = dot(uC - cameraPosition, uN) / dn; vec3 q = cameraPosition + d * t - uC; // where the ray crosses the plane
      if (dn > -1e-7 || t < -1e-4 || t > 1.001 || abs(dot(q, uR)) > uS.x * .5 || q.y < 0. || q.y > uS.y) discard;
      vec4 c = uP * viewMatrix * vec4(q + uC - normalize(d) * .004, 1.); // 4 mm toward the eye: a face lying in the plane behind it (the mall wall) must not tie with it
      gl_FragDepth = uMode > .5 ? 1. : c.w < 1e-5 ? 0. : clamp(c.z / c.w * .5 + .5, 0., 1.); // a crossing nearer than the near plane (or, biased, behind the eye): the nearest depth
      gl_FragColor = vec4(uFill, 1.); }` });
const mark = pocketMat({ stencilZPass: THREE.IncrementStencilOp }), reset = pocketMat({ depthWrite: true, depthFunc: THREE.AlwaysDepth }), fill = pocketMat({ colorWrite: true, depthWrite: true });
const pocket = new THREE.Scene(), pm = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, -.5), mark); pm.frustumCulled = false; pm.matrixAutoUpdate = false; pocket.add(pm);
const cams = Array.from({ length: DEPTH }, () => new THREE.PerspectiveCamera()), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector4(), _p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
const stats = { drawn: 0, levels: 0 }; // what the last main-camera frame drew through portals (tools/portals.mjs, tools/profile.mjs)

let ref = -1, fn = gl.EQUAL, off = false; // while a far side is drawn, every material tests the stencil for this level, whatever its own settings say (a door drawn again over a picture and those inside it: LEQUAL)
const setMaterial = st.setMaterial.bind(st);
st.setMaterial = (m, cw) => { setMaterial(m, cw); if (ref >= 0) { sb.setTest(true); sb.setMask(0); sb.setFunc(fn, ref, 0xff); sb.setOp(gl.KEEP, gl.KEEP, gl.KEEP); } if (off) st.setPolygonOffset(true, -1, -4); }; // off: the far copy's faces win over this side's copy of them, drawn first at the same depth

function rectOf(e, cam, lim) { // the opening's screen rectangle in NDC [x1, y1, x2, y2], inside lim; null if none
  let x1 = 1, y1 = 1, x2 = -1, y2 = -1;
  for (const [u, v] of [[-.5, 0], [.5, 0], [-.5, 1], [.5, 1]]) {
    _p.copy(e.p).addScaledVector(e.r, u * e.w).addScaledVector(Y, v * e.h); _v.set(_p.x, _p.y, _p.z, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
    if (_v.w < cam.near) return lim; // a corner at or behind the eye: all of lim
    x1 = Math.min(x1, _v.x / _v.w); x2 = Math.max(x2, _v.x / _v.w); y1 = Math.min(y1, _v.y / _v.w); y2 = Math.max(y2, _v.y / _v.w);
  }
  const r = [Math.max(x1, lim[0]), Math.max(y1, lim[1]), Math.min(x2, lim[2]), Math.min(y2, lim[3])];
  return r[0] < r[2] && r[1] < r[3] ? r : null;
}
function scissor(rt, r) { // r in NDC, widened a pixel; null: off
  if (r) { const W = rt.width, H = rt.height, x = Math.max(0, Math.floor((r[0] * .5 + .5) * W) - 1), y = Math.max(0, Math.floor((r[1] * .5 + .5) * H) - 1);
    rt.scissor.set(x, y, Math.min(W, Math.ceil((r[2] * .5 + .5) * W) + 1) - x, Math.min(H, Math.ceil((r[3] * .5 + .5) * H) + 1) - y); }
  rt.scissorTest = !!r; renderer.setRenderTarget(rt);
}
function drawPocket(e, mat, cam, level) {
  pm.material = mat; mat.stencilRef = level; pm.matrix.compose(e.p, _q.setFromAxisAngle(Y, e.ry), _s.set(e.w, e.h, D)); pm.matrixWorldNeedsUpdate = true;
  U.uC.value.copy(e.p); U.uN.value.copy(e.n); U.uR.value.copy(e.r); U.uS.value.set(e.w, e.h); U.uP.value.copy(cam.projectionMatrix);
  draw(pocket, cam);
}
// level: the stencil value of the picture cam draws into; lim: its rectangle; out: the end it looks out of (never drawn from its own camera)
function pass(cam, level, lim, rt, out) {
  const at = _p.setFromMatrixPosition(cam.matrixWorld), list = [];
  for (const e of ends) if (e !== out && live(e) && side(e, at.x, at.z) >= 0 && (cam.layers.mask & e.bit) && e.p.distanceToSquared(at) < REACH * REACH) { const r = rectOf(e, cam, lim); if (r) list.push([e.p.distanceToSquared(at), e, r]); }
  list.sort((a, b) => a[0] - b[0]); // nearest first: a nearer opening overlapping a farther one keeps its pixels
  for (const [, e, r] of list) {
    scissor(rt, r);
    if (level >= DEPTH) { U.uMode.value = 0; U.uFill.value.setRGB(...e.to.zone.fog.toArray().slice(0, 3)).multiplyScalar(.15); drawPocket(e, fill, cam, level); continue; }
    U.uMode.value = 0; drawPocket(e, mark, cam, level); U.uMode.value = 1; drawPocket(e, reset, cam, level + 1);
    const v = cams[level]; v.projectionMatrix.copy(cam.projectionMatrix); v.projectionMatrixInverse.copy(cam.projectionMatrixInverse); v.near = cam.near; v.far = cam.far;
    v.matrixWorld.multiplyMatrices(e.M, cam.matrixWorld); v.matrixWorld.decompose(v.position, v.quaternion, v.scale); v.updateMatrixWorld(true); v.userData.mask = e.to.mask;
    const was = clip.clone(); clip.normal.copy(e.to.n); clip.constant = -e.to.n.dot(e.to.p) + 1e-3; // keep what lies in front of the far end
    const fc = e.to.door?.meshes || []; for (const m of fc) m.visible = false; // the far copy of the door in this opening: drawn by this side's (below)
    ref = level + 1; draw(scene, v); ref = -1; if (!scene.overrideMaterial) stats.drawn++; stats.levels = Math.max(stats.levels, level + 1);
    pass(v, level + 1, r, rt, e.to);
    for (const m of fc) m.visible = true; clip.copy(was); scissor(rt, r);
  }
  const ds = list.filter(([, e]) => e.door && e.to.door);
  if (ds.length && level < DEPTH) { // the leaf in each opening just drawn through, over the pictures (3. above)
    lamps ??= (() => { const a = []; scene.traverse(o => o.isLight && a.push(o)); return a; })(); // all of them, so its programs are the scene's
    one.fog = scene.fog; one.environment = scene.environment; one.overrideMaterial = scene.overrideMaterial;
    const sm = renderer.shadowMap, nu = sm.needsUpdate; sm.needsUpdate = false; scissor(rt, level ? lim : null);
    ref = level; fn = gl.LEQUAL;
    try { for (const [, e] of ds) for (const [d, M, far] of [[e.door, null, false], [e.to.door, e.M, true]]) { // this side's copy whole; then the far copy's faces toward the far room, from the eye taken through
      one.children = [...lamps, ...(far ? d.meshes.filter(m => faces(m, e.to, d)) : d.meshes)];
      rc.projectionMatrix.copy(cam.projectionMatrix); rc.projectionMatrixInverse.copy(cam.projectionMatrixInverse); rc.near = cam.near; rc.far = cam.far;
      rc.matrixWorld.copy(cam.matrixWorld); if (M) rc.matrixWorld.premultiply(M); rc.matrixWorld.decompose(rc.position, rc.quaternion, rc.scale); rc.updateMatrixWorld(true);
      off = far; draw(one, rc); off = false; } }
    finally { ref = -1; fn = gl.EQUAL; off = false; sm.needsUpdate = nu; one.children = []; }
  }
}
// Which of a copy's leaf meshes (props/metalwork.js: userData.face) face the room in front of end f, whatever side the eye is on: a face by its
// normal (it never turns past square, so its sign holds); the edges by where the leaf stands, on f's side of the plane (shut: the original's).
const _z = new THREE.Vector3();
function faces(m, f, d) {
  if (m.userData.face) return _z.setFromMatrixColumn(m.matrixWorld, 2).dot(f.n) * m.userData.face > 0;
  const c = d.k[0][6], s = side(f, c[0], c[1]); return Math.abs(s) > 1e-3 ? s > 0 : !d.of;
}
const one = new THREE.Scene(), rc = new THREE.PerspectiveCamera(); one.matrixWorldAutoUpdate = false; rc.layers.enableAll(); let lamps = null; // the doors' own draw: their meshes and the scene's lamps
// The hook: right after the scene is drawn from the main camera (any pass: colour, or the AO pass's normals with its override material).
renderer.render = (s, c) => {
  draw(s, c);
  if (s !== scene || c !== camera || !ends.length || !renderer.getRenderTarget()) return;
  if (!warm) { warm = true; for (const m of [reset, fill, mark]) { pm.material = m; renderer.compile(pocket, c); } }
  const rt = renderer.getRenderTarget(), auto = renderer.autoClear, upd = scene.matrixWorldAutoUpdate, on = ponds.map(w => w.visible);
  if (!scene.overrideMaterial) stats.drawn = stats.levels = 0;
  renderer.autoClear = false; scene.matrixWorldAutoUpdate = false; for (const w of ponds) w.visible = false; // shortcut: no pool is drawn through a portal (its pictures are of the main view)
  try { pass(c, 0, [-1, -1, 1, 1], rt, null); }
  finally { ref = -1; sb.setMask(0xff); renderer.autoClear = auto; scene.matrixWorldAutoUpdate = upd; ponds.forEach((w, i) => w.visible = on[i]); scissor(rt, null); }
};
let warm = false; // the pocket's three programs, compiled on the first scene draw with its target bound (a program's output colour space is the target's): none on first sight of a portal

export { stats, DEPTH };
