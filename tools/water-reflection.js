// Actual prism water rays against known opaque wall / clear aperture geometry.
// A red exterior, changed only in this test, identifies exterior capture samples
// independently of the sun, caustics, exposure and the wall's own illumination.
import { ponds } from '../js/water.js';

export function waterReflection(dev) {
  const { THREE, renderer, scene, camera } = dev;
  dev.hold = true;
  const pond = ponds.find(p => p.zone === dev.zones.prism), material = pond.material;
  const cloud = scene.getObjectByName('prism-distant-clouds');
  const original = material.fragmentShader, blending = material.blending, exterior = cloud.material.fragmentShader;
  const previous = renderer.getRenderTarget(), W = 640, H = 360;
  const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
  material.blending = THREE.NoBlending; // signed diagnostic values must survive
  const grab = output => {
    material.fragmentShader = original.replace('vec3 T = refract', `${output}\n vec3 T = refract`);
    material.needsUpdate = true;
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const pixels = new Float32Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels); return pixels;
  };
  const emitter = red => {
    cloud.material.fragmentShader = `void main(){gl_FragColor=vec4(${red.toFixed(1)},0.,0.,1.);}`;
    cloud.material.needsUpdate = true;
    return grab('gl_FragColor=vec4(refl,-7.);return;');
  };
  const rows = [];
  try {
    for (const [name, x, z, yaw, pitch, lift, frames] of [
      ['primary', 2395.6335, 2405.9226, -.70081, -.04917, 0, 90],
      ['close', 2403.9, 2404, 0, -.22, 0, 90],
      ['window', 2399, 2403, 0, -.25, 0, 90],
      ['low-moving', 2403.9, 2404, 0, -.12, -1.1, 132]
    ]) {
      renderer.setRenderTarget(null); dev.reset(x, z, yaw, pitch); dev.lift = lift; dev.step(frames);
      const position = grab('gl_FragColor=vec4(vW.x-2400.,vW.y,vW.z-2400.,-7.);return;');
      const direction = grab('gl_FragColor=vec4(R.x,-R.y,R.z,-7.);return;');
      const dark = emitter(0), red = emitter(10);
      const wall = { count: 0, leaks: 0, maximum: 0 }, open = { count: 0, signal: 0, sum: 0 };
      for (let k = 0; k < position.length; k += 4) {
        if (position[k + 3] > -6 || direction[k + 2] >= 0) continue;
        const t = -position[k + 2] / direction[k + 2];
        const hx = position[k] + direction[k] * t, hy = position[k + 1] + direction[k + 1] * t;
        if (t < 0 || hy < .05 || hy > 4.4) continue;
        const delta = Math.max(0, red[k] - dark[k]);
        // Wide margins exclude glass, its reveal and filter footprints at edges.
        if ((hx < -1 && hx > -4.8) || (hx > 2.7 && hx < 4.8)) {
          wall.count++; wall.maximum = Math.max(wall.maximum, delta); if (delta > .1) wall.leaks++;
        }
        const tf = (-.55 - position[k + 2]) / direction[k + 2];
        const fx = position[k] + direction[k] * tf, fy = position[k + 1] + direction[k + 1] * tf;
        if (hx > -.45 && hx < 2.12 && hy > .1 && hy < 2.65 && fx > -.45 && fx < 2.12 && fy > .1 && fy < 2.65) {
          open.count++; open.sum += delta; if (delta > .1) open.signal++;
        }
      }
      rows.push({ name, wall, open });
    }
  } finally {
    material.fragmentShader = original; material.blending = blending; material.needsUpdate = true;
    cloud.material.fragmentShader = exterior; cloud.material.needsUpdate = true;
    renderer.setRenderTarget(previous); target.dispose();
  }
  return { rows, ok: rows.every(r => r.wall.count > 1000 && r.wall.leaks === 0 && r.open.count > 100 && r.open.signal > r.open.count * .3 && r.open.sum / r.open.count > 2) };
}
