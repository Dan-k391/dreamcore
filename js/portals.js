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
//  4. inside that picture, openings seen through it are drawn the same way, recursively, each scissored and culled to its rectangle (clipped
//     to its parent's); one under LIM.minpx px across, or past LIM.depth levels, ends in a flat fill of its far zone's distance colour.
import * as THREE from 'three';
import { renderer, scene, camera, clip } from './core.js';
import { ends, side, across, live } from './build.js';
import { ponds } from './water.js';
import { through } from './seen.js';

const LIM = { depth: 8, minpx: 6, fill: 1, cull: true }, // levels at most (each costs what its far zone submits in its cone: 0.05 to 0.8 Mtri; past 8 the gallery loop's openings are 13 px across at 2560x1440); the narrow side in px under which an opening ends; the end fill's brightness (endFill)
  D = 1, REACH = 80; // the pocket's depth (any works: the test is at the plane); no portal farther from the eye at the top level (a zone drawn from everywhere, the dev yard, would draw its far sides behind every wall)
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
// After an opening's picture (and those inside it) is drawn, its pixels (stencil above level, taken bit clear) become TAKEN | level: no later
// opening's mark or picture (EQUAL, full mask) can match them, and the doors' draw (LEQUAL on the low bits) still reaches them from this level up only.
const TAKEN = 0x80, take = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true,
  stencilFunc: THREE.LessStencilFunc, stencilFuncMask: 0x7f, stencilWriteMask: 0xff, stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp,
  vertexShader: 'void main() { gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: 'void main() { gl_FragColor = vec4(0.); }' }));
take.frustumCulled = false; take.matrixAutoUpdate = false; const taking = new THREE.Scene(); taking.add(take);
const cams = Array.from({ length: 64 }, () => new THREE.PerspectiveCamera()), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector4(), _p = new THREE.Vector3(), _at = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
// The far draw culled to its opening: three builds its view frustum from projection * view once per render(), right after scene.onBeforeRender.
// While crop is set, a frustum built from exactly that camera's projection * view (pv) takes the crop first, so only what can show inside the
// opening's screen rectangle is submitted; any other camera's (a shadow camera, a water or cube capture, the field's grass cull for another eye) is untouched
let crop = null; const setFrustum = THREE.Frustum.prototype.setFromProjectionMatrix, _cm = new THREE.Matrix4(), pv = new THREE.Matrix4();
// Its near plane becomes the far end's plane (the clip): what lies between the eye taken through and the far end is clipped away anyway, and
// for a hallway end that was everything of the hallway's neighbours in the cone (0.83 Mtri a level for a 27 x 60 px opening, against 0.05)
THREE.Frustum.prototype.setFromProjectionMatrix = function (m, cs) { if (this === cut) cut = null; if (!crop || !m.equals(pv)) return setFrustum.call(this, m, cs);
  setFrustum.call(this, _cm.multiplyMatrices(crop, m), cs); this.planes[5].copy(clip); if (LIM.cull) { if (deep < Infinity) this.planes[4].copy(farP); cut = this; } return this; }; // cull: the depth bound and box test below (off: for an A/B)
// A cropped frustum also tests each mesh's world box after its bounding sphere: a merged chunk's sphere (15 m across the mall) reaches into
// the narrow slab behind an opening where its box does not
let cut = null; const isect = THREE.Frustum.prototype.intersectsObject, _b = new THREE.Box3();
THREE.Frustum.prototype.intersectsObject = function (o) { if (!isect.call(this, o)) return false; if (this !== cut || o.isSkinnedMesh) return true;
  const h = o.isInstancedMesh ? o : o.geometry; if (!h.boundingBox) h.computeBoundingBox(); return this.intersectsBox(_b.copy(h.boundingBox).applyMatrix4(o.matrixWorld)); };
// And its far plane is as deep as anything seen through the far end inside the rectangle can lie: tools/pvs.mjs records, for each end
// whose zone sees others, the distance of the farthest surface seen through its opening by direction (32 x 32 bins over its front half);
// the bins the rectangle's edge rays fall in (and one round them) give the farthest, and a depth past the opening's farthest corner by
// that, plus half a metre, bounds it (a hallway end straight on: about 3 m to the opposite wall, where the mall behind it was all drawn)
const NB = 32, farP = new THREE.Plane(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _o = new THREE.Vector3(); let deep = Infinity;
function depthOf(f, v, r) {
  const t = f.tab ??= (s => s ? Uint8Array.from(atob(s), c => c.charCodeAt(0)) : null)(through[[f.p.x, f.p.y, f.p.z].map(c => +c.toFixed(2)).join()]), eye = v.position;
  if (!t || side(f, eye.x, eye.z) > -.3) return Infinity; // an eye at the plane: the rectangle's rays fan out too wide to bin
  let a1 = 9, a2 = -9, b1 = 9, b2 = -9;
  for (let k = 0; k <= 4; k++) { const s = k / 4, x = r[0] + s * (r[2] - r[0]), y = r[1] + s * (r[3] - r[1]);
    for (const [px, py] of [[x, r[1]], [x, r[3]], [r[0], y], [r[2], y]]) { _d.set(px, py, .5).unproject(v).sub(eye).normalize(); const dn = _d.dot(f.n); if (dn < .02) return Infinity;
      const a = Math.atan2(_d.dot(f.r), dn), b = Math.asin(_d.y); a1 = Math.min(a1, a); a2 = Math.max(a2, a); b1 = Math.min(b1, b); b2 = Math.max(b2, b); } }
  const bin = q => Math.floor((q / Math.PI + .5) * NB); let m = 0;
  for (let j = Math.max(0, bin(b1) - 1); j <= Math.min(NB - 1, bin(b2) + 1); j++) for (let i = Math.max(0, bin(a1) - 1); i <= Math.min(NB - 1, bin(a2) + 1); i++) m = Math.max(m, t[j * NB + i]);
  if (m === 255) return Infinity;
  _f.set(0, 0, -1).transformDirection(v.matrixWorld); let o = 0;
  for (const [u, h] of [[-.5, 0], [.5, 0], [-.5, 1], [.5, 1]]) o = Math.max(o, _o.copy(f.p).addScaledVector(f.r, u * f.w).addScaledVector(Y, h * f.h).sub(eye).dot(_f));
  const d = o + m * .25 + .5; farP.normal.copy(_f).negate(); farP.constant = _f.dot(eye) + d; return d;
}
const cropOf = (r, M) => M.set(2 / (r[2] - r[0]), 0, 0, -(r[0] + r[2]) / (r[2] - r[0]), 0, 2 / (r[3] - r[1]), 0, -(r[1] + r[3]) / (r[3] - r[1]), 0, 0, 1, 0, 0, 0, 0, 1);
const crops = Array.from({ length: 64 }, () => new THREE.Matrix4());
const stats = { drawn: 0, levels: 0, ends: [], blits: 0 }; // what the last main-camera frame drew through portals (ends: each opening ended by the fill, its pixel rectangle [x1, y1, x2, y2]) (tools/portals.mjs, tools/profile.mjs)

let ref = -1, fn = gl.EQUAL, off = false; // while a far side is drawn, every material tests the stencil for this level, whatever its own settings say (a door drawn again over a picture and those inside it: LEQUAL)
const setMaterial = st.setMaterial.bind(st);
st.setMaterial = (m, cw) => { setMaterial(m, cw); if (ref >= 0) { sb.setTest(true); sb.setMask(0); sb.setFunc(fn, ref, fn === gl.LEQUAL ? 0x7f : 0xff); sb.setOp(gl.KEEP, gl.KEEP, gl.KEEP); } if (off) st.setPolygonOffset(true, -1, -4); }; // off: the far copy's faces win over this side's copy of them, drawn first at the same depth

function rectOf(e, cam, lim) { // the screen rectangle in NDC [x1, y1, x2, y2] of the pocket (what can mark the stencil: the opening and the box behind it, so it holds
  // with the eye in the plane), inside lim; null if none. Each face is cut at the near plane first: a corner behind the eye used to give all of
  // lim, and that far draw then covered another opening's picture at the same level (the gallery seen through 308 with 307 open behind you)
  const n = -cam.near, c = []; let x1 = 1, y1 = 1, x2 = -1, y2 = -1, any = false;
  for (const [u, v, d] of BOX) c.push(_p.copy(e.p).addScaledVector(e.r, u * e.w).addScaledVector(Y, v * e.h).addScaledVector(e.n, -d * D).applyMatrix4(cam.matrixWorldInverse).clone());
  for (const f of FACES) for (let i = 0; i < 4; i++) { const a = c[f[i]], b = c[f[(i + 1) % 4]], ia = a.z <= n, ib = b.z <= n; // keep z <= -near (Sutherland-Hodgman, one plane)
    for (const q of [ia && a, ia !== ib && a.clone().lerp(b, (n - a.z) / (b.z - a.z))]) if (q) { any = true;
      _v.set(q.x, q.y, q.z, 1).applyMatrix4(cam.projectionMatrix); const x = _v.x / _v.w, y = _v.y / _v.w; x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); } }
  if (!any) return null;
  const r = [Math.max(x1, lim[0]), Math.max(y1, lim[1]), Math.min(x2, lim[2]), Math.min(y2, lim[3])];
  return r[0] < r[2] && r[1] < r[3] ? r : null;
}
const BOX = [0, 1, 2, 3, 4, 5, 6, 7].map(i => [(i & 1) - .5, i >> 1 & 1, i >> 2]), FACES = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
function scissor(rt, r) { // r in NDC, widened a pixel; null: off
  if (r) { const W = rt.width, H = rt.height, x = Math.max(0, Math.floor((r[0] * .5 + .5) * W) - 1), y = Math.max(0, Math.floor((r[1] * .5 + .5) * H) - 1);
    rt.scissor.set(x, y, Math.min(W, Math.ceil((r[2] * .5 + .5) * W) + 1) - x, Math.min(H, Math.ceil((r[3] * .5 + .5) * H) + 1) - y); }
  rt.scissorTest = !!r; renderer.setRenderTarget(rt);
}
// The last level: the opening filled flat with the far zone's fog colour times LIM.fill, measured as the mean of what the levels past it
// draw there (the gallery loop from the hallway and from inside at each end, 1280x720: sRGB red 53, 51, 38 drawn past it against 50 filled; fog to the power 1.5 for their hue); in the AO pass's normals
// (an override material) the opening plane's normal, facing the eye, so the AO sees a far wall there, not a colour read as a normal
const _n = new THREE.Vector3();
function endFill(e, cam) {
  if (scene.overrideMaterial) { _n.copy(e.n).transformDirection(cam.matrixWorldInverse); U.uFill.value.setRGB(_n.x * .5 + .5, _n.y * .5 + .5, _n.z * .5 + .5); }
  else U.uFill.value.setRGB(...e.to.zone.fog.toArray().slice(0, 3).map(c => c ** 1.5)).multiplyScalar(LIM.fill);
}
function drawPocket(e, mat, cam, level) {
  pm.material = mat; mat.stencilRef = level; pm.matrix.compose(e.p, _q.setFromAxisAngle(Y, e.ry), _s.set(e.w, e.h, D)); pm.matrixWorldNeedsUpdate = true;
  U.uC.value.copy(e.p); U.uN.value.copy(e.n); U.uR.value.copy(e.r); U.uS.value.set(e.w, e.h); U.uP.value.copy(cam.projectionMatrix);
  draw(pocket, cam);
}
// level: the stencil value of the picture cam draws into; lim: its rectangle; out: the end it looks out of (never drawn from its own camera)
function pass(cam, level, lim, rt, out) {
  const at = _at.setFromMatrixPosition(cam.matrixWorld), list = [], near = []; // near: a door whose opening is off screen but whose leaf, swung through its plane, may be on it (by you, facing away): drawn face by face all the same // not _p: rectOf() writes the corners there, and every end after the first was tested against one
  for (const e of ends) if (e !== out && live(e) && (side(e, at.x, at.z) > 1e-3 || side(e, at.x, at.z) > -1e-3 && Math.abs(across(e, at.x, at.z)) < e.w / 2) /* on its plane (to a millimetre: float32 matrices) only from inside its opening; another opening in the same wall is edge-on */ && (cam.layers.mask & e.bit) && (level || e.p.distanceToSquared(at) < REACH * REACH)) { const r = rectOf(e, cam, lim); if (r) list.push([e.p.distanceToSquared(at), e, r]); else if (e.door && e.to.door && Math.abs(side(e, at.x, at.z)) < e.w) near.push([0, e]); }
  list.sort((a, b) => a[0] - b[0]); const cut = new Set(); // nearest first: a nearer opening overlapping a farther one keeps its pixels
  for (const [, e, r] of list) {
    scissor(rt, r);
    if (level >= LIM.depth || level && Math.min((r[2] - r[0]) * rt.width, (r[3] - r[1]) * rt.height) < 2 * LIM.minpx) { cut.add(e); if (!scene.overrideMaterial) stats.ends.push(r.map((q, i) => Math.round((q * .5 + .5) * (i % 2 ? rt.height : rt.width)))); U.uMode.value = 0; endFill(e, cam); drawPocket(e, fill, cam, level); continue; }
    U.uMode.value = 0; drawPocket(e, mark, cam, level); U.uMode.value = 1; drawPocket(e, reset, cam, level + 1);
    const v = cams[level]; v.projectionMatrix.copy(cam.projectionMatrix); v.projectionMatrixInverse.copy(cam.projectionMatrixInverse); v.near = cam.near; v.far = cam.far;
    v.matrixWorld.multiplyMatrices(e.M, cam.matrixWorld); v.matrixWorld.decompose(v.position, v.quaternion, v.scale); v.updateMatrixWorld(true); v.userData.mask = e.to.mask;
    const was = clip.clone(); clip.normal.copy(e.to.n); clip.constant = -e.to.n.dot(e.to.p) + 1e-3; // keep what lies in front of the far end
    const fc = e.to.door?.meshes || []; for (const m of fc) m.visible = false; // the far copy of the door in this opening: drawn by this side's (below)
    ref = level + 1; crop = cropOf(r, crops[level]); pv.multiplyMatrices(v.projectionMatrix, v.matrixWorldInverse); deep = depthOf(e.to, v, r); draw(scene, v); crop = null; ref = -1; if (!scene.overrideMaterial) stats.drawn++; stats.levels = Math.max(stats.levels, level + 1);
    pass(v, level + 1, r, rt, e.to);
    for (const m of fc) m.visible = true; clip.copy(was); scissor(rt, r);
    take.material.stencilRef = TAKEN | level; draw(taking, cam);
  }
  const ds = [...list.filter(([, e]) => e.door && e.to.door && !cut.has(e)), ...near];
  if (ds.length) { // the leaf in each opening just drawn through, over the pictures (3. above)
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
  const tg = renderer.getRenderTarget(); if (!tg.stencilBuffer && tg.depthTexture?.format !== THREE.DepthStencilFormat) return; // no stencil, no clip: a far side would cover the whole picture (a test's capture target); none is drawn
  if (!warm.has(s.overrideMaterial)) { warm.add(s.overrideMaterial); const t = tg.clone(); t.setSize(1, 1); renderer.setRenderTarget(t); // drawn, not only compiled: ANGLE makes a program's variant for the target's formats on its first draw (2-3 ms on first sight of a portal), so once into a 1 px twin of each pass's target
    try { for (const m of [reset, fill, mark]) { pm.material = m; draw(pocket, c); } draw(taking, c); } finally { renderer.setRenderTarget(tg); t.depthTexture?.dispose(); t.dispose(); } }
  const rt = renderer.getRenderTarget(), auto = renderer.autoClear, upd = scene.matrixWorldAutoUpdate, on = ponds.map(w => w.visible);
  if (!scene.overrideMaterial) { stats.drawn = stats.levels = 0; stats.ends = []; }
  renderer.autoClear = false; scene.matrixWorldAutoUpdate = false; for (const w of ponds) w.visible = false; // shortcut: no pool is drawn through a portal (its pictures are of the main view)
  held = true; // every render() ends by resolving a multisampled target (a full-size blit): 5 or 6 a level, 50 a frame in the gallery loop; one, after
  try { pass(c, 0, [-1, -1, 1, 1], rt, null); }
  finally { ref = -1; crop = null; sb.setMask(0xff); scene.matrixWorldAutoUpdate = upd; ponds.forEach((w, i) => w.visible = on[i]); scissor(rt, null);
    held = false; if (stats.blits) draw(none, c); stats.blits = 0; renderer.autoClear = auto; } // an empty render, no clear: three's own resolve, once
};
const none = new THREE.Scene(), blit = gl.blitFramebuffer; let held = false;
gl.blitFramebuffer = function (...a) { if (held) stats.blits++; else blit.apply(gl, a); };
const warm = new Set(); // the passes (by override material) whose target the pocket's three programs and the take's were drawn into once (a program's output colour space is the target's): none on first sight of a portal

export { stats, LIM, rectOf };
