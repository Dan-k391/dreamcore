import * as THREE from 'three';
import { renderer, scene, sunDir, WY } from './core.js';
import { floorH } from './build.js';

function bakeWaterSun(sheet) {
  const { rect, floor } = sheet, { width, height } = sheet.sim[0];
  const cells = new Uint16Array(width * height * 4), half = THREE.DataUtils.toHalfFloat;
  const ray = new THREE.Raycaster();
  const down = sunDir.clone().multiplyScalar(-.75);
  down.y = -Math.sqrt(1 - down.x * down.x - down.z * down.z);
  const reach = (floor - WY) / down.y + .1;
  const pool = new THREE.Box3(new THREE.Vector3(rect.x, floor - .1, rect.y), new THREE.Vector3(rect.z, WY, rect.w));
  const airBounds = pool.clone().union(pool.clone().translate(sunDir.clone().multiplyScalar(100)));
  const above = [], below = [];
  scene.updateMatrixWorld(true);
  scene.traverseVisible(mesh => {
    if (!mesh.isMesh || !mesh.castShadow) return;
    const bounds = new THREE.Box3().setFromObject(mesh);
    if (bounds.max.y >= WY && bounds.intersectsBox(airBounds)) above.push(mesh);
    if (bounds.intersectsBox(pool)) below.push(mesh);
  });
  const entry = new THREE.Vector3(), hits = [];
  ray.layers.enableAll(); ray.near = .0005;
  const first = (from, dir, far, meshes) => {
    ray.set(from, dir); ray.far = far; hits.length = 0;
    return ray.intersectObjects(meshes, false, hits)[0]?.distance;
  };
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    entry.set(THREE.MathUtils.lerp(rect.x, rect.z, (col + .5) / width), WY, THREE.MathUtils.lerp(rect.y, rect.w, (row + .5) / height));
    if (floorH(entry.x, entry.z) >= WY || first(entry, sunDir, 100, above) !== undefined) continue;
    const at = (row * width + col) * 4;
    cells[at + 2] = half(1);
    cells[at + 3] = half(first(entry, down, reach, below) ?? reach);
  }
  return new THREE.DataTexture(cells, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
}

function restoreWaterSun(sheet, target) {
  renderer.copyTextureToTexture(sheet.sunPaths, target.texture);
}

export { bakeWaterSun, restoreWaterSun };
