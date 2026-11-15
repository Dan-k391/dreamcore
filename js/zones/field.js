// The field on the hills, at the end of the hotel hallway's dark passage.
import * as THREE from 'three';
import { scene, uTime, sunDir, dry, zones, defZone } from '../core.js';
import { hash, noise, fbm, ss, makeTex, concrete } from '../tex.js';
import { M, P, wallMat, paintedBall } from '../mat.js';
import { colliders, flats, seeThrough, skyOnly, onSun, loose, add, block, box } from '../build.js';
import { streetLamp } from '../props/lights.js';
import { doorway } from '../props/metalwork.js';
import { swingSet, slide, roundabout, springRider } from '../props/play.js';
import { parkBench, picnicTable, fence } from '../props/garden.js';
import { kerb, steps } from '../props/structure.js';

defZone('fD', { music: 'field', ...dry, step: 'carpet', sky: 'hill', air: 1, grp: 'f', k: 1, exp: .3, fog: [.72, .82, .95, .002], sat: 1.15, bloom: .07, shaft: .04, wet: 0, box: [-50, 665.6, 58, 760], probe: [4, 6, 690] });
// ---------- the field: reached through the dark passage at the end of the hotel hallway ----------
// Rolling ground, written once for the walking floor and once for the shaders that plant grass on it. Flat at the door and at the playground, rising to a rim all round.
const hill = (x, z) => { const h = (3 + 2.2 * Math.sin(x * .07 + 1) * Math.cos(z * .06) + 1.4 * Math.sin(x * .13 + z * .11) + .5 * Math.sin(x * .31) * Math.cos(z * .27) + 12 * ss(40, 62, Math.hypot(x - 4, z - 712)) ** 2) * ss(5, 22, Math.hypot(x - 3.8, z - 665.6));
  return 3.2 + (h - 3.2) * ss(10, 18, Math.hypot(x + 18, z - 705)); };
const grass = [];
let updateGrass;
{ const z = zones.fD, W = wallMat(z, 0xf4f1ea), G = M(z, 'fieldTurf'), stone = P(z, { ...concrete, color: 0xd8d2c4 }),
    red = P(z, { color: 0xc8322c, roughness: .35 }), blue = P(z, { color: 0x2f6fc0, roughness: .35 }), y0 = 3.2;
  const groundCompile = G.onBeforeCompile, groundProgram = G.customProgramCacheKey();
  G.onBeforeCompile = function (shader, renderer) {
    groundCompile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n#include <opaque_fragment>');
  };
  G.customProgramCacheKey = () => groundProgram + '|field-turf-diffuse';
  const g = new THREE.PlaneGeometry(180, 180, 240, 240).rotateX(-Math.PI / 2).translate(4, 0, 712), q = g.attributes.position;
  for (let i = 0; i < q.count; i++) { const x = q.getX(i), zz = q.getZ(i); q.setY(i, zz < 665.2 && Math.abs(x - 3.8) < 3 ? -5 : hill(x, zz)); g.attributes.uv.setXY(i, x, zz); } // sunk under the passage behind the end wall: it has its own floor
  g.computeVertexNormals(); const land = new THREE.Mesh(g, G); land.castShadow = land.receiveShadow = true; scene.add(land);
  flats.push([-60, 665.6, 70, 790, hill]); colliders.push([-46, 665, -44, 760], [52, 665, 54, 760], [-46, 757, 54, 759], [-90, 665.2, 2.8, 665.65], [4.8, 665.2, 98, 665.65]); // the hills climb higher than the end wall either side of the door: it stops you at any height
  box(W, -90, -3, 665.2, 2.8, 9, 665.65); box(W, 4.8, -3, 665.2, 98, 9, 665.65); box(W, 2.8, 2.4, 665.2, 4.8, 9, 665.65); // one long white wall across the hills, and the door you came through
  block(stone, 2, -.2, 665.2, 5.6, .03, 668.6); // the hardstanding runs back through the doorway as its threshold
  // a tarmac path from the door down to the playground, draped on the hill: straight runs with round joins (the grass below keeps off the same shape)
  { const pts = [[3.8, 668.3], [2.6, 672.2], [-11.9, 697.6], [-11.9, 706.6]], hw = .7, st = [], pos = [], idx = [];
    for (let i = 0; i + 1 < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(L / .4), nx = -(z2 - z1) / L, nz = (x2 - x1) / L;
      if (i) { const p = st[st.length - 1], a0 = Math.atan2(p[3], p[2]), a1 = Math.atan2(nz, nx); let da = a1 - a0; da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));
        for (let k = 1; k < 8; k++) st.push([x1, z1, Math.cos(a0 + da * k / 8), Math.sin(a0 + da * k / 8)]); } // the round join, turning about the corner
      for (let k = 0; k <= n; k++) st.push([x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n, nx, nz]); }
    for (const [x, zc, nx, nz] of st) for (const o of [-1, -.85, 0, .85, 1]) { const px = x + nx * o * hw, pz = zc + nz * o * hw; pos.push(px, hill(px, pz) + (Math.abs(o) < 1 ? .022 : -.004), pz); } // the edge tucked into the ground
    for (let i = 0; i + 1 < st.length; i++) for (let k = 0; k < 4; k++) { const a = i * 5 + k; idx.push(a, a + 1, a + 5, a + 1, a + 6, a + 5); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.length / 3 * 2, 2)); g.setIndex(idx); g.computeVertexNormals(); add(M(z, 'asphalt'), g);
    block(M(z, 'asphalt'), -11.1, y0 - .1, 704.2, -9.95, y0 + .02, 706.6); } // the bench's hardstanding off the end of the path
  for (const s of [2, 9.5, 17, 24.5]) { const t = s / 29.27, x = 2.6 - 14.4 * t + .87 * 1.05, zc = 672.2 + 25.4 * t + .493 * 1.05; streetLamp(z, x, hill(x, zc), zc, 2.626, { on: false }); } // crook-neck lamps along the path's east side, lanterns over it
  // the playground: a bark-mulch safety surface set flush in a precast edging, swings, a slide, a roundabout and a spring rider; a low timber fence round it with a gap for the path
  box(M(z, 'mulch'), -23.375, y0 - .1, 701.125, -12.625, y0 + .012, 708.875);
  { const c = [[-12.5, 701], [-23.5, 701], [-23.5, 709], [-12.5, 709]], ky = y0 - .105; // each run starts one kerb width in, so the corners butt instead of overlapping
    for (let i = 0; i < 4; i++) { const [x1, z1] = c[i], [x2, z2] = c[(i + 1) % 4], L = Math.hypot(x2 - x1, z2 - z1), dx = (x2 - x1) / L, dz = (z2 - z1) / L; kerb(z, [[x1 + dx * .125, ky, z1 + dz * .125], [x2, ky, z2]]); } }
  swingSet(z, -20.5, y0 + .012, 703); slide(z, -14.5, y0 + .012, 703.2); roundabout(z, -17.2, y0 + .012, 707.2, .4); springRider(z, -21.5, y0 + .012, 707.4, -.5);
  fence(z, [[-12.6, y0, 700.2], [-24.4, y0, 700.2], [-24.4, y0, 709.8], [-9, y0, 709.8], [-9, y0, 700.2], [-10.8, y0, 700.2]]);
  parkBench(z, -10.5, y0 + .02, 705.4, -Math.PI / 2); // on its hardstanding, facing the swings
  picnicTable(z, -16.5, hill(-16.5, 712.6), 712.6, .15);
  // a white stair that climbs to nothing, two doors standing open on the grass
  steps(z, 22, 1.24, 697.2, Math.PI, { n: 16, r: .25, g: .4, w: 2, color: 0xece8e0 });
  doorway(W, red, 14, hill(14, 716), 716, .5); doorway(W, blue, -30, hill(-30, 728), 728, -.9, 1.2);
  { const x = -8.2, zc = 702.5, r = .17; // a rubber ball left on the grass by the playground: red, with a darker seam round it each way
    loose.push({ mesh: paintedBall(z, r, (a, b, c) => Math.abs(b) < .045 || Math.abs(a) < .045 ? 0x7a1a14 : 0xc8322c, { roughness: .55 }), r, pos: [x, hill(x, zc) + r, zc], region: [-44, 665.7, 52, 757], bounce: .45, grip: 1.3, spin: 1, solid: 1, slope: 1 }); }
  const tileSize = 4, tileCache = new Map(), grassCamera = new THREE.Vector3(), lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity), lastDirection = new THREE.Vector3(), direction = new THREE.Vector3(), frustum = new THREE.Frustum(), projection = new THREE.Matrix4(), lastProjection = new THREE.Matrix4();
  const pathSegments = [[3.8, 668.3, 2.6, 672.2], [2.6, 672.2, -11.9, 697.6], [-11.9, 697.6, -11.9, 706.6]];
  const grassCoverage = (rootX, rootZ) => {
    if (rootZ < 665.8 || rootX < -86 || rootX > 94 || rootZ > 802 || Math.abs(rootX - 3.8) < 1.9 && rootZ < 668.7 || Math.abs(rootX + 18) < 5.66 && Math.abs(rootZ - 705) < 4.16 || Math.abs(rootX - 22) < 1.05 && rootZ > 693.95 && rootZ < 700.45 || rootX > -11.15 && rootX < -9.9 && rootZ > 704.15 && rootZ < 706.65) return 0;
    let distance = Infinity;
    for (const [startX, startZ, endX, endZ] of pathSegments) {
      const deltaX = endX - startX, deltaZ = endZ - startZ, along = Math.max(0, Math.min(1, ((rootX - startX) * deltaX + (rootZ - startZ) * deltaZ) / (deltaX * deltaX + deltaZ * deltaZ)));
      distance = Math.min(distance, Math.hypot(rootX - startX - along * deltaX, rootZ - startZ - along * deltaZ));
    }
    return ss(.67, .89, distance);
  };
  const tileData = (tileX, tileZ, layer) => {
    const key = `${tileX},${tileZ}`, tile = tileCache.get(key) || { tileX, tileZ, layers: [] };
    if (!tileCache.has(key)) tileCache.set(key, tile);
    if (tile.layers[layer.index]) return tile.layers[layer.index];
    const roots = [], shapes = [];
    for (let tuftIndex = 0; tuftIndex < 256; tuftIndex++) {
      const cellX = tileX * 16 + tuftIndex % 16, cellZ = tileZ * 16 + Math.floor(tuftIndex / 16), tuftSeed = hash(cellX, cellZ), tuftX = (cellX + .12 + .76 * hash(cellX + 17, cellZ)) * .25, tuftZ = (cellZ + .12 + .76 * hash(cellX, cellZ + 29)) * .25;
      const lush = .5 + .28 * Math.sin(tuftX * .61 + Math.sin(tuftZ * .23)) + .22 * Math.sin(tuftZ * .83 - tuftX * .29), tuftHeight = .27 + .16 * lush + .07 * tuftSeed, heading = 1.1 + .6 * Math.sin(tuftX * .37 + tuftZ * .19) + (tuftSeed - .5) * 1.4;
      for (let leafIndex = 0; leafIndex < layer.leaves; leafIndex++) {
        const identity = tuftIndex * 47 + leafIndex + layer.offset, seed = hash(tileX * 631 + identity, tileZ * 977), spread = .025 + .13 * Math.sqrt(hash(identity + 91, tileX * 71 + tileZ)), angle = hash(identity + 137, tileZ * 41 + tileX) * Math.PI * 2;
        const rootX = tuftX + Math.cos(angle) * spread, rootZ = tuftZ + Math.sin(angle) * spread, coverage = grassCoverage(rootX, rootZ);
        if (!coverage) continue;
        const height = tuftHeight * (.57 + .76 * seed) * coverage, width = (.0065 + .005 * hash(identity + 211, tileX * 101 + tileZ)) * coverage;
        roots.push(rootX, hill(rootX, rootZ) - .012, rootZ, seed);
        shapes.push(height, width, .22 + .43 * hash(identity + 313, tileZ * 97 + tileX), heading + (seed - .5) * 2.1);
      }
    }
    return tile.layers[layer.index] = { roots: new Float32Array(roots), shapes: new Float32Array(shapes) };
  };
  const vertexShader = `#include <packing>
    attribute vec4 aRoot, aShape;
    uniform vec3 uCam; uniform vec2 uFade, uShadowTexel; uniform float uTime, uPixelHeight; uniform mat4 uSM; uniform sampler2D tShadow;
    centroid varying vec3 vPosition, vNormal, vAcross; centroid varying vec2 vBlade; centroid varying float vSeed, vLight, vCoverage;
    void main() {
      float distanceToEye = distance(aRoot.xz, uCam.xz), fade = 1. - smoothstep(uFade.x, uFade.y, distanceToEye);
      if (fade < .001) { gl_Position = vec4(2., 2., 2., 1.); return; }
      float along = position.y, seed = aRoot.w, height = aShape.x * fade;
      vec2 heading = vec2(cos(aShape.w), sin(aShape.w));
      float twist = aShape.w + (seed - .5) * along * 1.35;
      vec3 across = vec3(sin(twist), 0., -cos(twist));
      float gust = .13 + .085 * sin(uTime * 1.15 - aRoot.x * .31 - aRoot.z * .23) + .035 * sin(uTime * 2.1 - aRoot.x * .67 + aRoot.z * .39);
      vec2 wind = vec2(.8, .6) * gust + vec2(-.6, .8) * .025 * sin(uTime * 1.7 + aRoot.x * .25 + aRoot.z * .32);
      float curve = aShape.z * along * along, sag = .26 * aShape.z * along * along * along;
      vec3 center = vec3(heading.x * curve + wind.x * along * along, along - sag, heading.y * curve + wind.y * along * along) * height;
      float taper = (1. - along) * (.58 + 1.35 * along);
      float width = aShape.y * taper * fade;
      float pixelWidth = uPixelHeight > 0. ? max(0., -(viewMatrix * vec4(aRoot.xyz + center, 1.)).z) / (projectionMatrix[1][1] * uPixelHeight) : 0.;
      float filteredWidth = max(width, pixelWidth * .85); vCoverage = width / max(filteredWidth, .000001);
      vec3 world = aRoot.xyz + center + across * position.x * filteredWidth;
      vec3 tangent = vec3(2. * along * (heading.x * aShape.z + wind.x), 1. - .78 * aShape.z * along * along, 2. * along * (heading.y * aShape.z + wind.y));
      vNormal = normalize(cross(across, tangent)); vAcross = across; vPosition = world; vBlade = vec2(position.x, along); vSeed = seed;
      vec4 shadow = uSM * vec4(aRoot.xyz + vec3(0., .2, 0.), 1.); vLight = 0.;
      if (shadow.x > 0. && shadow.x < 1. && shadow.y > 0. && shadow.y < 1. && shadow.z < 1.) {
        vLight = .25 * (step(shadow.z - .0009, unpackRGBAToDepth(texture2D(tShadow, shadow.xy + uShadowTexel * vec2(-.7, -.7))))
          + step(shadow.z - .0009, unpackRGBAToDepth(texture2D(tShadow, shadow.xy + uShadowTexel * vec2(.7, -.7))))
          + step(shadow.z - .0009, unpackRGBAToDepth(texture2D(tShadow, shadow.xy + uShadowTexel * vec2(-.7, .7))))
          + step(shadow.z - .0009, unpackRGBAToDepth(texture2D(tShadow, shadow.xy + uShadowTexel * vec2(.7, .7)))));
      }
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
    }`;
  const fragmentShader = `uniform vec3 uCam, uSun;
    centroid varying vec3 vPosition, vNormal, vAcross; centroid varying vec2 vBlade; centroid varying float vSeed, vLight, vCoverage;
    void main() {
      vec2 blade = clamp(vBlade, vec2(-1., 0.), vec2(1.));
      float along = blade.y, across = abs(blade.x), openness = smoothstep(.015, .72, along);
      vec3 normal = normalize(vNormal + vAcross * blade.x * .24); if (!gl_FrontFacing) normal = -normal;
      vec3 view = normalize(uCam - vPosition), halfLight = normalize(view + uSun);
      vec3 leaf = mix(vec3(.105, .25, .033), vec3(.145, .32, .047), vSeed * .65 + .18);
      leaf = mix(vec3(.026, .066, .012), leaf, openness);
      leaf *= 1. - .12 * across * across + .055 * exp(-blade.x * blade.x * 45.);
      float detail = 1. - smoothstep(8., 25., distance(vPosition, uCam));
      float diffuse = mix(.58, .28 + .72 * max(dot(normal, uSun), 0.), detail);
      float through = pow(max(dot(-view, uSun), 0.), 4.) * (.28 + .72 * (1. - abs(dot(normal, uSun))));
      vec3 lighting = vec3(.48, .58, .68) * (.25 + .75 * openness) + vec3(4.4, 4.15, 3.65) * vLight * (diffuse * (.33 + .67 * openness) + .65 * through * openness);
      vec3 sheen = vec3(.08, .11, .045) * pow(max(dot(normal, halfLight), 0.), 12.) * vLight * openness * detail;
      gl_FragColor = vec4(leaf * lighting + sheen, clamp(vCoverage, 0., 1.));
    }`;
  const layers = [{ name: 'near', leaves: 32, offset: 0, start: 7, end: 12, sections: 7 }, { name: 'mid', leaves: 8, offset: 32, start: 21, end: 32, sections: 3 }, { name: 'far', leaves: 2, offset: 40, start: 43, end: 58, sections: 2 }];
  for (const [index, layer] of layers.entries()) {
    layer.index = index;
    const geometry = new THREE.InstancedBufferGeometry(), positions = [], indices = [], capacity = Math.ceil(Math.PI * (layer.end + 6) ** 2 / (tileSize * tileSize)) * 256 * layer.leaves;
    for (let section = 0; section < layer.sections; section++) positions.push(-1, section / layer.sections, 0, 1, section / layer.sections, 0);
    positions.push(0, 1, 0);
    for (let section = 0; section < layer.sections - 1; section++) { const base = section * 2; indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3); }
    indices.push(layer.sections * 2 - 2, layer.sections * 2 - 1, layer.sections * 2);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
    for (const name of ['aRoot', 'aShape']) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({ side: THREE.DoubleSide, alphaToCoverage: true, uniforms: { uTime, uCam: { value: grassCamera }, uSun: { value: sunDir }, uFade: { value: new THREE.Vector2(layer.start, layer.end) }, uPixelHeight: { value: 0 }, uSM: { value: new THREE.Matrix4() }, tShadow: { value: null }, uShadowTexel: { value: new THREE.Vector2() } }, vertexShader, fragmentShader });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `field-grass-${layer.name}`; mesh.frustumCulled = false; mesh.userData.grassLayer = layer;
    grass.push(mesh); scene.add(mesh); seeThrough.push(mesh); skyOnly.hill.push(mesh);
  }
  updateGrass = viewCamera => {
    grassCamera.setFromMatrixPosition(viewCamera.matrixWorld); viewCamera.getWorldDirection(direction);
    if (grassCamera.distanceToSquared(lastPosition) < .0625 && direction.dot(lastDirection) > .9998 && lastProjection.equals(viewCamera.projectionMatrix)) return;
    lastPosition.copy(grassCamera); lastDirection.copy(direction); lastProjection.copy(viewCamera.projectionMatrix);
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse));
    const centerX = Math.floor(grassCamera.x / tileSize), centerZ = Math.floor(grassCamera.z / tileSize), candidates = [];
    for (let tileZ = Math.max(166, centerZ - 16); tileZ <= Math.min(200, centerZ + 16); tileZ++) for (let tileX = Math.max(-22, centerX - 16); tileX <= Math.min(23, centerX + 16); tileX++) {
      const tileCenterX = (tileX + .5) * tileSize, tileCenterZ = (tileZ + .5) * tileSize, distance = Math.hypot(tileCenterX - grassCamera.x, tileCenterZ - grassCamera.z);
      if (distance > 62) continue;
      const key = `${tileX},${tileZ}`;
      let tile = tileCache.get(key);
      if (!tile) {
        const cornerHeights = [hill(tileCenterX - 2, tileCenterZ - 2), hill(tileCenterX + 2, tileCenterZ - 2), hill(tileCenterX - 2, tileCenterZ + 2), hill(tileCenterX + 2, tileCenterZ + 2)], low = Math.min(...cornerHeights), high = Math.max(...cornerHeights);
        tile = { tileX, tileZ, layers: [], bounds: new THREE.Sphere(new THREE.Vector3(tileCenterX, (low + high) * .5 + .4, tileCenterZ), Math.hypot(3, (high - low) * .5 + .8) + 1.3) }; tileCache.set(key, tile);
      }
      tile.distance = distance;
      if (frustum.intersectsSphere(tile.bounds)) candidates.push(tile);
    }
    for (const mesh of grass) {
      const layer = mesh.userData.grassLayer, rootAttribute = mesh.geometry.attributes.aRoot, shapeAttribute = mesh.geometry.attributes.aShape;
      let count = 0;
      for (const tile of candidates) if (tile.distance < layer.end + 3) {
        const data = tileData(tile.tileX, tile.tileZ, layer);
        rootAttribute.array.set(data.roots, count * 4); shapeAttribute.array.set(data.shapes, count * 4); count += data.roots.length / 4;
      }
      mesh.geometry.instanceCount = count;
      for (const attribute of [rootAttribute, shapeAttribute]) { attribute.clearUpdateRanges(); if (count) attribute.addUpdateRange(0, count * 4); attribute.needsUpdate = true; }
    }
    for (const [key, tile] of tileCache) {
      const distance = Math.hypot((tile.tileX + .5) * tileSize - grassCamera.x, (tile.tileZ + .5) * tileSize - grassCamera.z);
      if (distance > 66) tileCache.delete(key);
      else for (const layer of layers) if (distance > layer.end + 6) tile.layers[layer.index] = null;
    }
  };
  // clouds: soft shapes on big cards standing round the horizon
  const cloud = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime },
    vertexShader: 'varying vec2 vUv, vP; void main() { vUv = uv; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec2 vUv, vP; uniform float uTime;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + 1.), f.x), f.y); }
      float fbm(vec2 p) { float a = 0., k = .5; for (int i = 0; i < 6; i++) { a += k * n(p); p = p * 2.03 + 7.; k *= .5; } return a; }
      void main() { vec2 q = vP * vec2(1., 2.2); float m = fbm(vUv * 5. + uTime * .006) + .75 * (1. - length(q)) - .45 * smoothstep(.1, -.5, vP.y);
        float a = smoothstep(.62, .85, m) * smoothstep(1., .8, length(q));
        gl_FragColor = vec4(mix(vec3(1.25, 1.4, 1.75), vec3(3.2, 3.1, 2.95), smoothstep(.6, 1.15, m + vP.y * .5)), a); }` });
  for (let i = 0; i < 11; i++) { const a = i * .571 + hash(i, 9), d = 380 + 260 * hash(i, 4), w = 260 + 200 * hash(i, 5), g = new THREE.PlaneGeometry(2, 2); g.attributes.uv.array.forEach((v, j, u) => u[j] = v + i * 3.7);
    const m = new THREE.Mesh(g, cloud); m.position.set(4 + Math.sin(a) * d, 110 + 120 * hash(i, 6), 712 + Math.cos(a) * d); m.scale.set(w, w * .5, 1); m.lookAt(4, 40, 712); scene.add(m); seeThrough.push(m); skyOnly.hill.push(m); }
}
onSun.push(sun => {
  for (const mesh of grass) {
    mesh.material.uniforms.uSM.value = sun.shadow.matrix;
    mesh.material.uniforms.uShadowTexel.value.set(1 / sun.shadow.mapSize.x, 1 / sun.shadow.mapSize.y);
    mesh.onBeforeRender = renderer => { const target = renderer.getRenderTarget(); mesh.material.uniforms.tShadow.value = sun.shadow.map.texture; mesh.material.uniforms.uPixelHeight.value = target?.samples > 1 ? target.height : 0; };
  }
  const previous = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, world, viewCamera, ...rest) {
    previous.call(this, renderer, world, viewCamera, ...rest);
    if (grass[0].visible) updateGrass(viewCamera);
  };
});
