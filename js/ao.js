// Temporal ambient occlusion. GTAO at half the render's resolution with a few samples whose pattern turns every frame; last frame's
// result carried to this one through the depth buffer and both frames' cameras (exact for what stands still) and blended at full size.
// The half-size texel walks the 2 x 2 block of depth texels under it, so every pixel has a sample of its own every 4th frame, and the
// frames between fill in from its neighbours by depth. It replaces GTAOPass's full-size 16-sample AO and its Poisson denoise; the pass's
// normal and depth render (ao.normals) stays as it was, and atmos (post.js) reads the result as it read the denoised picture.
// Camera cuts: player.js sets camera.userData.cut to true (teleport: history dropped) or to the Matrix4 that took the world across
// (passage warp, portal: history re-based, nothing lost). A jump of more than 2 m between frames without one drops it too.
// Moving things (door leaves, rings, balls): history is taken only where its depth matches, then held inside the range of this frame's
// neighbours, so nothing trails. Everything counts per drawn frame, not per second: the vsync-off loop and dev.step behave alike, and a
// drop restarts the sample sequence, so the same view after dev.reset gives the same picture.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { renderer, camera, quadVS } from './core.js';

const DIRS = 2, STEPS = 4, CAP = 16; // slices and steps a frame (16 depth taps against 36, at a quarter of the pixels); weight of history at most
const rt = f => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: f, magFilter: f, depthBuffer: false });
const raw = rt(THREE.NearestFilter), hist = [rt(THREE.LinearFilter), rt(THREE.LinearFilter)]; // history filtered for atmos (on Low and Medium it is half the render's size)

const gtao = new THREE.ShaderMaterial({ name: 'ao.gtao', depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  uniforms: { tNormal: { value: null }, tDepth: { value: null }, uP: { value: new THREE.Matrix4() }, uPI: { value: new THREE.Matrix4() }, uR: { value: 2 }, uJ: { value: new THREE.Vector2() }, uK: { value: 0 }, far: { value: 1 },
              radius: { value: .9 }, distanceExponent: { value: 1.5 }, thickness: { value: 1 }, distanceFallOff: { value: 1 }, scale: { value: 1.3 } },
  vertexShader: quadVS,
  // GTAOShader.js's horizon search (three r170) per texel of the half-size grid, at the depth texel R * i + uJ under it; the slice angle and
  // the step radii from interleaved gradient noise plus an R2 sequence in that depth texel's own count (uK), so its samples cover the
  // hemisphere over time. Output: (ao, eye distance).
  fragmentShader: `#include <common>
    #include <packing>
    uniform highp sampler2D tNormal, tDepth; uniform mat4 uP, uPI; uniform int uR; uniform vec2 uJ; uniform float uK, far, radius, distanceExponent, thickness, distanceFallOff, scale;
    vec3 viewAt(vec2 uv, float d) { vec4 v = uPI * vec4(vec3(uv, d) * 2. - 1., 1.); return v.xyz / v.w; }
    vec3 sceneAt(vec3 vp) { // at the centre of the texel the point falls in, where its depth is exact (off centre a near step read a flat floor as tilted), off screen the edge's
      vec4 c = uP * vec4(vp, 1.); vec2 ds = vec2(textureSize(tDepth, 0)), uv = (clamp(floor((c.xy / c.w * .5 + .5) * ds), vec2(0.), ds - 1.) + .5) / ds; return viewAt(uv, textureLod(tDepth, uv, 0.).x); }
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
    void main() {
      ivec2 ds = textureSize(tDepth, 0), q = min(ivec2(gl_FragCoord.xy) * uR + ivec2(uJ), ds - 1);
      float depth = texelFetch(tDepth, q, 0).x;
      if (depth >= 1.) { gl_FragColor = vec4(1., far, 0., 1.); return; }
      vec3 viewPos = viewAt((vec2(q) + .5) / vec2(ds), depth), viewNormal = unpackRGBToNormal(texelFetch(tNormal, q, 0).rgb), viewDir = normalize(-viewPos);
      float rot = fract(ign(vec2(q)) + uK * .7548777), jit = fract(ign(vec2(q) + vec2(47., 17.)) + uK * .5698403), ao = 0.;
      for (int i = 0; i < ${DIRS}; ++i) {
        float angle = (float(i) + rot) / float(${DIRS}) * PI; vec3 sampleDir = vec3(cos(angle), sin(angle), 0.);
        vec3 sliceBitangent = normalize(cross(sampleDir, viewDir)), sliceTangent = cross(sliceBitangent, viewDir);
        vec3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent)), tangentToNormalInSlice = cross(normalInSlice, sliceBitangent);
        vec2 cosHorizons = vec2(dot(viewDir, tangentToNormalInSlice), dot(viewDir, -tangentToNormalInSlice));
        for (int j = 0; j < ${STEPS}; ++j) { // the steps spread over (15 %, 100 %] of the radius: the original's nearest is at 17 %
          vec3 off = sampleDir * radius * pow(mix(.15, 1., (float(j) + 1. - jit) / float(${STEPS})), distanceExponent), d = sceneAt(viewPos + off) - viewPos;
          if (abs(d.z) < thickness && dot(d, d) > 1e-10) cosHorizons.x += max(0., (dot(viewDir, normalize(d)) - cosHorizons.x) * mix(1., 2. / float(j + 2), distanceFallOff));
          d = sceneAt(viewPos - off) - viewPos;
          if (abs(d.z) < thickness && dot(d, d) > 1e-10) cosHorizons.y += max(0., (dot(viewDir, normalize(d)) - cosHorizons.y) * mix(1., 2. / float(j + 2), distanceFallOff));
        }
        vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);
        float nx = dot(normalInSlice, sliceTangent), ny = dot(normalInSlice, viewDir);
        float nxb = .5 * (acos(cosHorizons.y) - acos(cosHorizons.x) + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y), nyb = .5 * (2. - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y);
        ao += nx * nxb + ny * nyb;
      }
      gl_FragColor = vec4(pow(clamp(ao / float(${DIRS}), 0., 1.), scale), -viewPos.z, 0., 1.);
    }`,
});

const temporal = new THREE.ShaderMaterial({ name: 'ao.temporal', depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  uniforms: { tRaw: { value: raw.texture }, tHist: { value: null }, tDepth: { value: null }, uPI: { value: new THREE.Matrix4() }, uReV: { value: new THREE.Matrix4() }, uPP: { value: new THREE.Matrix4() }, uJ: { value: new THREE.Vector2() }, uR: { value: 2 }, uReset: { value: 1 } },
  vertexShader: quadVS,
  // per depth texel: raw (ao, eye distance) at half size, this frame's texels on depth texels R * i + uJ; history (ao, eye distance, weight)
  fragmentShader: `uniform highp sampler2D tRaw, tHist, tDepth; uniform mat4 uPI, uReV, uPP; uniform vec2 uJ; uniform float uR, uReset;
    vec2 at(ivec2 p) { return texelFetch(tRaw, clamp(p, ivec2(0), textureSize(tRaw, 0) - 1), 0).xy; }
    void main() {
      ivec2 p = ivec2(gl_FragCoord.xy); vec2 ds = vec2(textureSize(tDepth, 0)), uv = (vec2(p) + .5) / ds;
      vec4 r = uPI * vec4(vec3(uv, texelFetch(tDepth, p, 0).x) * 2. - 1., 1.); vec3 vp = r.xyz / r.w; float z = -vp.z;
      vec2 rp = (vec2(p) - uJ) / uR, f = fract(rp); ivec2 r0 = ivec2(floor(rp)), rc = ivec2(floor(rp + .5));
      // the depth step to the smoother neighbour on each axis around the nearest raw texel: a plane's own slope, never the jump at a silhouette
      float zc = at(rc).y, sl = max(min(abs(at(rc + ivec2(1, 0)).y - zc), abs(at(rc - ivec2(1, 0)).y - zc)), min(abs(at(rc + ivec2(0, 1)).y - zc), abs(at(rc - ivec2(0, 1)).y - zc)));
      float tol = .01 * z + 2. * sl, bs = 0., bn = 0., lo = 1., hi = 0., cs = 0., cw = 0., conf = 0.;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { ivec2 t = rc + ivec2(x, y); vec2 v = at(t); float d = abs(v.y - z);
        if (d < tol) { bs += v.x; bn++; lo = min(lo, v.x); hi = max(hi, v.x); }
        ivec2 o = t - r0; if (o.x >= 0 && o.x <= 1 && o.y >= 0 && o.y <= 1) { // the four around: bilinear, weighed by depth
          float q = (o.x == 1 ? f.x : 1. - f.x) * (o.y == 1 ? f.y : 1. - f.y) * exp(-d / (.02 * z + sl)); cs += q * v.x; cw += q; conf = max(conf, q); } }
      if (bn < .5) { lo = 0.; hi = 1.; } // nothing near in depth (thinner than the grid): no clamp
      float cur = cw > 1e-6 ? cs / cw : 1., blur = bn > .5 ? bs / bn : cur;
      conf = conf > .999 ? 1. : .3 * conf; // a texel worked out here this frame counts in full; one carried over from beside it, a little
      // where this texel stood last frame: four history texels, each taken only if its depth is where this one's was
      vec4 pv = uReV * vec4(vp, 1.), cl = uPP * pv; float zp = -pv.z, tp = (.01 * z + sl / uR) * zp / z;
      vec2 hp = (cl.xy / cl.w * .5 + .5) * ds - .5, g = fract(hp); ivec2 h0 = ivec2(floor(hp)), hs = textureSize(tHist, 0);
      float ha = 0., hn = 0., w = 0.;
      if (uReset < .5 && cl.w > 0.) for (int k = 0; k < 4; k++) { ivec2 o = ivec2(k & 1, k >> 1), t = h0 + o;
        if (any(lessThan(t, ivec2(0))) || any(greaterThanEqual(t, hs))) continue;
        vec3 h = texelFetch(tHist, t, 0).xyz; float b = (o.x == 1 ? g.x : 1. - g.x) * (o.y == 1 ? g.y : 1. - g.y);
        if (abs(h.y - zp) < tp) { ha += b * h.x; hn += b * h.z; w += b; } }
      float n = w > .05 ? min(hn / w, max(2., ${CAP}. * exp(-4. * length(hp - vec2(p))))) : 0., // moving: each resample blurs history a little, so it counts for less 
        hv = w > .05 ? clamp(ha / w, lo - .02, hi + .02) : 0.;
      if (n < 1.) { bs = 0.; bn = 0.; for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) { vec2 v = at(rc + ivec2(x, y)); if (abs(v.y - z) < tol + sl) { bs += v.x; bn++; } } if (bn > .5) blur = bs / bn; } // just uncovered: wider, about the old denoise's reach
      cur = mix(cur, blur, 1. / (1. + 4. * n)); conf = max(conf, .05); // little history: the neighbours' mean, so a fresh frame is not grain
      gl_FragColor = vec4((hv * n + cur * conf) / (n + conf), z, min(n + conf, ${CAP}.), 1.);
    }`,
});

const quad = new FullScreenQuad(null), state = { k: 0, f: 0, drop: true, R: 2, pVI: new THREE.Matrix4(), pP: new THREE.Matrix4(), pPos: new THREE.Vector3() };
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), J = [[0, 0], [1, 1], [1, 0], [0, 1]];
function setSize(dw, dh, R) { // dw, dh: the depth texture's size; R: depth texels per AO texel (2 on High, 1 where the depth is already half size)
  state.R = R; raw.setSize(Math.ceil(dw / R), Math.ceil(dh / R)); for (const t of hist) t.setSize(dw, dh); state.drop = true;
}
function render(ao) { // after ao.normals: the half-size AO, then the blend into history; returns the history texture just written
  const cut = camera.userData.cut; camera.userData.cut = null;
  if (cut === true) state.drop = true; else if (cut) state.pVI.multiply(_m.copy(cut).invert()); // re-based: last frame's camera as seen from this side
  if (!state.drop && _v.copy(state.pPos).applyMatrix4(cut || _m.identity()).distanceTo(camera.position) > 2) state.drop = true; // moved without a word
  if (state.drop) { state.k = 0; state.drop = false; }
  const G = gtao.uniforms, T = temporal.uniforms, R = state.R, j = J[state.k % (R * R)]; // the 2 x 2 block walked through
  T.uReset.value = state.k ? 0 : 1;
  G.tNormal.value = ao.normalRenderTarget.texture; G.tDepth.value = T.tDepth.value = ao.depthTexture; G.uP.value.copy(camera.projectionMatrix); G.uPI.value.copy(camera.projectionMatrixInverse);
  G.uR.value = T.uR.value = R; G.uJ.value.set(...j); T.uJ.value.set(...j); G.uK.value = Math.floor(state.k / (R * R)) % 4096; G.far.value = camera.far;
  T.uPI.value.copy(camera.projectionMatrixInverse); T.uReV.value.multiplyMatrices(state.pVI, camera.matrixWorld); T.uPP.value.copy(state.pP);
  const from = hist[state.f], to = hist[state.f ^= 1]; T.tHist.value = from.texture;
  renderer.setRenderTarget(raw); quad.material = gtao; quad.render(renderer);
  renderer.setRenderTarget(to); quad.material = temporal; quad.render(renderer);
  state.pVI.copy(camera.matrixWorldInverse); state.pP.copy(camera.projectionMatrix); state.pPos.copy(camera.position); state.k++;
  return to.texture;
}
const reset = () => { state.drop = true; }; // the next frame starts afresh (the motion proofs' reference)
export { setSize, render, reset, state };
