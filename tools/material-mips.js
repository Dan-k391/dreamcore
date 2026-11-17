// One material-mip invariant: filtering must preserve the combined normal/roughness
// second moment and mean metalness, to RGBA8 precision. Runs on real baked textures.
export async function materialMips(dev) {
  const { THREE, renderer } = dev, { sets } = await import('/js/tex.js');
  const { FullScreenQuad } = await import('/vendor/three/examples/jsm/postprocessing/Pass.js');
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, depthBuffer: false });
  const material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { t: { value: null }, level: { value: 0 } },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D t;uniform int level;out vec4 color;void main(){color=texelFetch(t,ivec2(gl_FragCoord.xy),level);}' });
  const quad = new FullScreenQuad(material), rt = renderer.getRenderTarget(), rows = [];
  try {
    for (const name of ['poolTile', 'smudge', 'brushed']) {
      const s = sets[name]; if (!s?.B) continue;
      material.uniforms.t.value = s.B.texture;
      let base;
      for (let level = 0, n = s.b; n >= 1; level++, n >>= 1) {
        target.setSize(n, n); material.uniforms.level.value = level; renderer.setRenderTarget(target); quad.render(renderer);
        const px = new Float32Array(n * n * 4); renderer.readRenderTargetPixels(target, 0, 0, n, n, px);
        let energy = 0, metal = 0;
        for (let i = 0; i < px.length; i += 4) {
          const x = (px[i] * 255 - 128) / 127, y = (px[i + 1] * 255 - 128) / 127;
          energy += px[i + 2] ** 4 + x * x + y * y; metal += px[i + 3];
        }
        energy /= n * n; metal /= n * n;
        if (!level) base = { energy, metal };
        rows.push({ name, level, size: n, energy, metal, error: Math.abs(energy - base.energy), metalError: Math.abs(metal - base.metal) });
      }
    }
  } finally { renderer.setRenderTarget(rt); target.dispose(); material.dispose(); quad.dispose(); }
  return { ok: rows.length >= 22 && rows.every(x => Number.isFinite(x.energy) && x.error < .012 && x.metalError < .004), rows };
}
