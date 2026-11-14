// The shared lamp pool, relighting as you move, and the ambient bakes.
import * as THREE from 'three';
import { renderer, scene, camera, V, zones, inR } from './core.js';
import { seaMat } from './mat.js';
import { emitters } from './build.js';
import { setSky } from './sky.js';
import { ponds } from './water.js';

// lamps: nine shadow-casting spotlights are shared by every light fixture in the level and follow the player from
// fixture to fixture, fading out before they move. More fixtures cost nothing; the world can grow without more lights.
const lights = Array.from({ length: 9 }, () => {
  const l = new THREE.SpotLight(0xffffff, 0, 16, 1.45, 1, 2);
  l.castShadow = true; l.shadow.mapSize.setScalar(1024); l.shadow.bias = -.001; l.shadow.normalBias = .03; l.shadow.autoUpdate = false; l.k = 0;
  scene.add(l, l.target); return l;
});
function relight(pos, zone, fade) { // fade: how far to move brightness this call (1 = snap)
  const want = emitters.map(e => [e.p.distanceTo(pos) + (e.zone.grp === zone.grp ? 0 : 8) - (e.light ? 2 : 0), e]).sort((a, b) => a[0] - b[0]).slice(0, lights.length).map(a => a[1]);
  for (const l of lights) {
    const keep = want.includes(l.e);
    l.k = Math.min(1, Math.max(0, l.k + (keep ? fade : -fade)));
    const e = !keep && l.k === 0 && want.find(e => !e.light);
    if (e) {
      if (l.e) l.e.light = null;
      l.e = e; e.light = l; l.position.copy(e.p); l.target.position.copy(e.t); l.color.set(e.color); l.angle = e.angle; l.distance = e.dist;
      l.shadow.needsUpdate = renderer.shadowMap.needsUpdate = true;
    }
    l.intensity = l.e ? l.e.power * l.k * l.k : 0;
  }
}

// ---------- fake GI: capture each zone into a cubemap and use it as that zone's ambient + reflections ----------
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(.1, 5000, cubeRT);
const pmrem = new THREE.PMREMGenerator(renderer);
function bake(z, mats = z.mats, k = z.k) {
  setSky(z.sky || 'day');
  if (z.id) { relight(z.probe, z, 1); relight(z.probe, z, 1); } // bring the lamps to this zone: first call assigns, second switches on
  cubeCam.position.copy(z.probe); cubeCam.update(renderer, scene);
  const env = pmrem.fromCubemap(cubeRT.texture).texture;
  for (const m of mats) { m.envMap = env; m.envMapIntensity = k; m.needsUpdate = true; }
}
for (const w of ponds) w.visible = false; // a pool's nested renders would reset the active cube face
bake({ probe: V(-200, 3, -12) }, [seaMat], 1);
for (let pass = 0; pass < 2; pass++) for (const z of Object.values(zones)) { // second pass picks up the first bounce, including through doorways
  if (z.mats.length) bake(z); // the dark passages have nothing to light
  if (pass) for (const w of ponds) if (w.zone === z) w.drawPlan();
}
const zone0 = Object.values(zones).find(z => inR(camera.position.x, camera.position.z, ...z.box)) || zones.bA;
setSky(zone0.sky || 'day'); relight(camera.position, zone0, 1); relight(camera.position, zone0, 1); // the zone you start in

export { lights, relight, bake, zone0 };
