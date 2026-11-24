import { causticsGLSL, filmGLSL, filmU } from '../js/mat.js';
import { WY } from '../js/core.js';
import { ponds, uTest } from '../js/water.js';

export function waterOptics(dev) {
  const { THREE, renderer } = dev;
  dev.hold = true;
  const target = new THREE.WebGLRenderTarget(128, 128, { type: THREE.FloatType, depthBuffer: false });
  const previousTarget = renderer.getRenderTarget();
  const uniforms = { uTime: { value: 1.5 }, uCausDir: { value: new THREE.Vector3(-1, .5, -.32).normalize() }, uDepth: { value: 1.08 }, uSpan: { value: 8 }, uImpulse: { value: 0 }, tFilm: filmU };
  const material = new THREE.ShaderMaterial({ uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uDepth, uSpan, uImpulse, uCaus; uniform vec3 uCausDir; ${causticsGLSL}${filmGLSL}
      void main() { vec2 position = (vUv - .5) * uSpan + vec2(.37, -.81); gl_FragColor = vec4(caus(vec3(position.x, ${WY} - uDepth, position.y), uImpulse), poolWaves(position, 0.).xy, 1.); }` });
  const geometry = new THREE.PlaneGeometry(2, 2), scene = new THREE.Scene(), camera = new THREE.Camera();
  scene.add(new THREE.Mesh(geometry, material));
  const samples = [];
  const sample = (name, time = 1.5, depth = 1.08, span = 8, impulse = 0) => {
    uniforms.uTime.value = time; uniforms.uDepth.value = depth; uniforms.uSpan.value = span; uniforms.uImpulse.value = impulse;
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const pixels = new Float32Array(128 * 128 * 4); renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
    let minimum = Infinity, maximum = -Infinity, sum = 0, square = 0, nonfinite = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const value = pixels[index]; minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); sum += value; square += value * value;
      for (let channel = 0; channel < 4; channel++) if (!Number.isFinite(pixels[index + channel])) nonfinite++;
    }
    samples.push({ name, time, depth, span, impulse, minimum, maximum, mean: sum / 16384, rms: Math.sqrt(square / 16384), nonfinite });
    return pixels;
  };
  const difference = (left, right) => { let sum = 0; for (let index = 0; index < left.length; index += 4) sum += Math.abs(left[index] - right[index]); return sum / 16384; };
  let frameDelta, halfSecondDelta;
  try {
    const normal = sample('normal'); frameDelta = difference(normal, sample('next-frame', 1.5 + 1 / 60)); halfSecondDelta = difference(normal, sample('half-second', 2));
    sample('waterline', 1.5, 0); sample('deep', 1.5, 24); sample('subpixel', 1.5, 1.08, 1024); sample('positive-impulse', 1.5, 1.08, 8, .1); sample('negative-impulse', 1.5, 1.08, 8, -.1);
  } finally { renderer.setRenderTarget(previousTarget); target.dispose(); geometry.dispose(); material.dispose(); }
  const byName = Object.fromEntries(samples.map(sample => [sample.name, sample]));
  const field = {
    bounded: samples.every(sample => sample.nonfinite === 0 && sample.minimum >= -1 && sample.maximum <= 9.1), // the light is conserved: never below none, lines at most what softening .1 allows
    balanced: Math.abs(byName.normal.mean) < .03,
    visible: byName.normal.rms > .01 && byName.normal.minimum < -.025 && byName.normal.maximum > .025,
    waterline: byName.waterline.rms < 1e-6,
    filtered: byName.subpixel.rms < byName.normal.rms * .1 && byName.deep.rms < byName.normal.rms * .5,
    smooth: frameDelta > 0 && frameDelta < .03 && halfSecondDelta > frameDelta * 2,
    disturbances: byName['positive-impulse'].mean < -.06 && byName['negative-impulse'].mean > .12 // cells are only ever slightly darker
  };
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
