import { ponds, waterViews } from '../js/water.js';

function wallStrip(dev, pond) {
  const { THREE, renderer } = dev, tile = pond.zone.tile, uniforms = pond.tileU;
  const compile = tile.onBeforeCompile, caus = uniforms.uCaus.value, sun = uniforms.uWaterSun.value.clone();
  const width = 32, height = 256, target = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType });
  const previous = renderer.getRenderTarget();
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-.12, .12, .22, -.22, .01, 1);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(.26, .46), tile);
  strip.rotation.y = Math.PI; strip.position.set(2400, -.52, 2402.8); scene.add(strip);
  camera.position.set(2400, -.52, 2402.3); camera.lookAt(strip.position);
  const pixels = new Float32Array(width * height * 4);
  const sample = () => {
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    let min = Infinity, max = -Infinity, count = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index + 3] === -7) {
      const green = pixels[index + 1];
      min = Math.min(min, green); max = Math.max(max, green); count++;
    }
    return { min, max, count };
  };
  try {
    tile.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(/reflectedLight\.directDiffuse \+= receiver \* (waterSun\([^;]+\));/, '{ gl_FragColor = vec4($1, -7.); return; }');
    };
    tile.needsUpdate = true; uniforms.uCaus.value = 0; uniforms.uWaterSun.value.set(1, 1, 1);
    const lit = sample();
    strip.position.z += .02;
    const hidden = sample();
    return { lit, hidden, ok: lit.count === width * height && hidden.count === lit.count &&
      lit.max > .2 && lit.min > .92 * lit.max && hidden.max < .001 };
  } finally {
    tile.onBeforeCompile = compile; tile.needsUpdate = true;
    uniforms.uCaus.value = caus; uniforms.uWaterSun.value.copy(sun);
    renderer.setRenderTarget(previous); strip.geometry.dispose(); target.dispose();
  }
}

export function waterSun(dev) {
  const { THREE, scene, camera, renderer, uTime } = dev;
  const pond = ponds.find(pond => pond.zone === dev.zones.prism), material = pond.material;
  const original = material.fragmentShader, blending = material.blending, beforeRender = scene.onBeforeRender;
  if (!material.uniforms.tSunPlan) return { ok: false, reason: 'prism has no transmitted sunlight receiver plan' };
  const gl = renderer.getContext(), previous = renderer.getRenderTarget(), width = 640, height = 480;
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType });
  const samplerTypes = new Set([gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D]);
  const maxSamplers = Math.max(...renderer.info.programs.map(({ program }) => {
    let count = 0;
    for (let index = 0; index < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); index++) {
      const uniform = gl.getActiveUniform(program, index);
      if (samplerTypes.has(uniform.type)) count += uniform.size;
    }
    return count;
  }));
  const look = dev.look.get(), mask = waterViews.mask, modes = { hit: 0, weights: 1, live: 2, deep: 3, plan: 4, combined: 5 };
  let dark = false;
  const grab = (mode, noSun = false) => {
    material.uniforms.uSunProbe.value = modes[mode]; dark = noSun;
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const pixels = new Float32Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return pixels;
  };
  const delta = mode => {
    const lit = grab(mode), shade = grab(mode, true);
    return lit.map((value, index) => value - shade[index]);
  };
  try {
    dev.look.set({});
    dev.reset(2398.55, 2403.6, 0, -1.13); dev.step(3); uTime.value = 1.5;
    camera.position.y = 3.2;
    waterViews.mask = false;
    scene.onBeforeRender = function (...args) {
      beforeRender.apply(this, args);
      if (dark) material.uniforms.uWaterSun.value.set(0, 0, 0);
    };
    material.blending = THREE.NoBlending;
    material.uniforms.uSunProbe = { value: 0 };
    material.fragmentShader = 'uniform int uSunProbe;\n' + original
      .replace('if (uMain > 0. && live < 1.)', 'if (uMain > 0.)')
      .replace('      if (uTest == 1.) { gl_FragColor', `
        if (uSunProbe == 0) { gl_FragColor = vec4(hit.x - 2400., hit.y, hit.z - 2400., -7.); return; }
        if (uSunProbe == 1) { gl_FragColor = vec4(live, dl, body, -7.); return; }
        if (uSunProbe == 2) { gl_FragColor = vec4(eye, -7.); return; }
        if (uSunProbe == 3) { gl_FragColor = vec4(dc, -7.); return; }
        if (uSunProbe == 4) { gl_FragColor = vec4(still, -7.); return; }
        if (uSunProbe == 5) { live *= .5; dl *= .5; }
        if (uTest == 1.) { gl_FragColor`)
      .replace(' * waterAbsorption(t);', `;
        if (uSunProbe == 5) { gl_FragColor = vec4(refr, -7.); return; }
        refr *= waterAbsorption(t);`);
    material.needsUpdate = true;
    const wall = wallStrip(dev, pond);
    const hit = grab('hit'), weights = grab('weights'), live = delta('live'), deep = delta('deep'), plan = delta('plan'), combined = delta('combined');
    dev.look.set({ zones: { prism: { 'mat.wet': 1 } } });
    const wetLive = delta('live'), wetPlan = delta('plan');
    dev.look.set({});
    uTime.value = 2;
    const next = delta('plan');
    dark = false; pond.drawPlan(pond.zone);
    const bakedLit = grab('plan', true);
    pond.drawPlan(pond.zone);
    const bakedDark = grab('plan', true);
    const measure = () => ({ count: 0, plan: 0, live: 0, wetLive: 0, wetPlan: 0, deep: 0, mixed: 0, animation: 0, peak: 0, baked: 0 });
    const clear = measure(), blocked = measure();
    for (let index = 0; index < hit.length; index += 4) {
      const [x, y, z, marker] = hit.subarray(index, index + 4);
      if (marker !== -7 || Math.abs(y + 1.2) > .018 || weights[index] < .99 || weights[index + 1] < .99 || weights[index + 2] < .99) continue;
      if (z < 2.03 || z > 2.35) continue;
      const sample = Math.abs(x) < .23 ? clear : Math.abs(x + 3) < .23 ? blocked : null;
      if (!sample) continue;
      const channel = index + 1;
      sample.count++; sample.plan += plan[channel]; sample.live += live[channel]; sample.deep += deep[channel]; sample.mixed += combined[channel];
      sample.wetLive += wetLive[channel]; sample.wetPlan += wetPlan[channel];
      sample.animation += Math.abs(next[channel] - plan[channel]); sample.peak = Math.max(sample.peak, Math.abs(plan[channel]), Math.abs(live[channel]), Math.abs(deep[channel]));
      sample.baked = Math.max(sample.baked, Math.abs(bakedLit[channel] - bakedDark[channel]));
    }
    for (const sample of [clear, blocked]) for (const key of ['plan', 'live', 'deep', 'mixed', 'wetLive', 'wetPlan', 'animation']) sample[key] /= sample.count;
    const glError = gl.getError();
    return { clear, blocked, wall, maxSamplers, glError, ok: wall.ok && clear.wetLive < .8 * clear.live &&
      Math.abs(clear.wetPlan / clear.plan - clear.wetLive / clear.live) < .04 && clear.count > 64 && blocked.count > 64 && clear.plan > .2 && clear.animation > .015 &&
      ['live', 'deep', 'mixed'].every(key => Math.abs(clear[key] / clear.plan - 1) < .1) && blocked.peak < .005 && clear.baked < .005 && maxSamplers <= 16 && glError === 0 };
  } finally {
    material.fragmentShader = original; material.blending = blending; delete material.uniforms.uSunProbe; material.needsUpdate = true;
    scene.onBeforeRender = beforeRender; waterViews.mask = mask; dev.look.set(look); pond.drawPlan(pond.zone);
    renderer.setRenderTarget(previous); target.dispose();
  }
}
