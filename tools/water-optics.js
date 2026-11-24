import { ponds, sheets, ripple, resetWater, uTest } from '../js/water.js';

// The light pictures (water.js): the light traced forward through the surface, as the tiles read it (1 = flat water's light)
export function waterOptics(dev) {
  const { THREE, renderer } = dev;
  dev.hold = true; dev.reset(0.5, -17, 3.14159, -1.25); dev.step(30);
  const S = sheets.find(q => q.ponds.some(w => w.tileU.uCausDir.value.y < .999)), W = S.light.width, H = S.light.height, R = S.rect, previousTarget = renderer.getRenderTarget();
  const copy = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false }), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: S.light.texture } }, depthTest: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = vec4(textureLod(t, vUv, 0.).r, 0., 0., 1.); }' }));
  const scene = new THREE.Scene(), cam = new THREE.Camera(); scene.add(quad);
  const read = () => { renderer.setRenderTarget(copy); renderer.render(scene, cam); const p = new Float32Array(W * H * 4); renderer.readRenderTargetPixels(copy, 0, 0, W, H, p); renderer.setRenderTarget(previousTarget); return p; }; // a half-float red target is not readable as such
  const at = (x, z) => [Math.round((x - R.x) / (R.z - R.x) * W), Math.round((z - R.y) / (R.w - R.y) * H)];
  const region = (pixels, x1, z1, x2, z2) => { const [i1, j1] = at(x1, z1), [i2, j2] = at(x2, z2), v = []; for (let j = j1; j < j2; j++) for (let i = i1; i < i2; i++) v.push(pixels[(j * W + i) * 4]); return v; };
  const stats = v => { let min = Infinity, max = -Infinity, sum = 0, sq = 0, nonfinite = 0; for (const x of v) { if (!Number.isFinite(x)) { nonfinite++; continue; } min = Math.min(min, x); max = Math.max(max, x); sum += x; sq += x * x; } const mean = sum / v.length; return { min, max, mean, rms: Math.sqrt(Math.max(0, sq / v.length - mean * mean)), nonfinite }; };
  const inner = p => region(p, R.x + 1.5, R.y + 1.5, R.z - 1.5, R.w - 1.5), diff = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length;
  const now = read(), all = stats(region(now, R.x, R.y, R.z, R.w)), mid = stats(inner(now));
  dev.step(1); const next = read(); dev.step(29); const half = read();
  const frameDelta = diff(inner(now), inner(next)), halfSecondDelta = diff(inner(now), inner(half));
  const cx = (R.x + R.z) / 2, cz = (R.y + R.w) / 2, near = p => region(p, cx - .5, cz - .5, cx + .5, cz + .5); // the player's ripples: one landing in the middle of the pool, ten steps on, against still water
  resetWater(); for (let i = 0; i < 10; i++) ripple(S, []); const calm = read();
  resetWater(); ripple(S, [[cx, cz, .35]]); for (let i = 0; i < 9; i++) ripple(S, []); const struck = read(); resetWater(); copy.dispose(); quad.geometry.dispose(); quad.material.dispose();
  const field = {
    bounded: all.nonfinite === 0 && all.min >= 0 && all.max <= 64, // never below none; a fold adds at most a few cells of 16
    balanced: Math.abs(mid.mean - 1) < .05, // light is conserved
    visible: mid.rms > .15 && mid.max > 2.5 && mid.min < .5, // a net: bright lines, darker cells
    smooth: frameDelta > 0 && frameDelta < .25 && halfSecondDelta > frameDelta * 3, // at 1.5 cm a texel a moving line changes a few texels a step (measured .15 against .84 over half a second)
    disturbances: diff(near(calm), near(struck)) > .1
  };
  const samples = { all, mid, frameDelta, halfSecondDelta, ripples: diff(near(calm), near(struck)) };
  const liveTarget = new THREE.WebGLRenderTarget(1280, 720, { type: THREE.FloatType });
  const rows = [], strengths = ponds.map(pond => pond.tileU.uCaus.value);
  const grab = mode => {
    uTest.value = mode; renderer.setRenderTarget(liveTarget); renderer.render(dev.scene, dev.camera);
    const pixels = new Float32Array(1280 * 720 * 4); renderer.readRenderTargetPixels(liveTarget, 0, 0, 1280, 720, pixels); return pixels;
  };
  try {
    for (const [name, x, z, yaw, pitch, lift] of [
      ['pool-hall', 6, -12, 1.5708, -.7, 0], ['gallery', 23.2, 20, 3.14159, 0, -.4],
      ['night-hall', 30, -9, 1.2, -.3, 0], ['vault', 23.2, 42, 3.14159, -1.4, 0]
    ]) {
      renderer.setRenderTarget(null); dev.reset(x, z, yaw, pitch); dev.lift = lift; dev.step(90);
      const mask = grab(3), normal = grab(0);
      ponds.forEach(pond => pond.tileU.uCaus.value = 0); const unmodulated = grab(0);
      ponds.forEach((pond, index) => pond.tileU.uCaus.value = strengths[index]);
      let count = 0, nonfinite = 0, negative = 0, modulation = 0, maximumModulation = 0;
      for (let index = 0; index < mask.length; index += 4) if (mask[index] < -.5) {
        count++;
        for (let channel = 0; channel < 3; channel++) {
          const value = normal[index + channel]; if (!Number.isFinite(value)) nonfinite++; if (value < 0) negative++;
          const delta = Math.abs(value - unmodulated[index + channel]); modulation += delta; maximumModulation = Math.max(maximumModulation, delta);
        }
      }
      rows.push({ name, waterPixels: count, nonfinite, negative, meanLinearModulation: modulation / (3 * count), maximumLinearModulation: maximumModulation });
    }
  } finally { uTest.value = 0; ponds.forEach((pond, index) => pond.tileU.uCaus.value = strengths[index]); renderer.setRenderTarget(previousTarget); liveTarget.dispose(); }
  const gl = renderer.getContext(), samplerTypes = new Set([gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D]);
  let maxSamplers = 0;
  for (const program of renderer.info.programs) {
    let count = 0;
    for (let index = 0; index < gl.getProgramParameter(program.program, gl.ACTIVE_UNIFORMS); index++) { const uniform = gl.getActiveUniform(program.program, index); if (samplerTypes.has(uniform.type)) count += uniform.size; }
    maxSamplers = Math.max(maxSamplers, count);
  }
  return { field, samples, frameDelta, halfSecondDelta, rows, maxSamplers, glError: gl.getError() };
}
