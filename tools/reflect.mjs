// Where do glossy floors and walls mirror the room's lights? For each room: a bright ball at one of its real fittings, baked into
// the zone's probe and then hidden, so the photo with it minus the photo without it is that light's reflection and nothing else.
// The centroid of that patch on the floor or wall is compared with where a mirror would put it: the light's image behind the plane.
//   node tools/reflect.mjs [--port 8200] [--only mL,hT] [--json] [--views out.json] [--dump dir]
// Prints per room and camera: predicted pixel, measured centroid, error in pixels (1280x720, the game's 72 degree fov).
// --views: also write a tools/shots.mjs view list of the measured camera positions. --dump: each photo with the patch in red, mirror (green ring) and centroid (red ring).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), only = arg('only')?.split(',');
// id, name, the fitting [x, y, z], the mirror plane [axis 0 x / 1 y / 2 z, where], two eye positions [x, z], the ball's brightness
const rooms = [
  ['mL', 'mall', [-12.4, 6.9, 37], [1, 0], [[0.5, 45], [-24, 27]]], // the skylight's middle in the marble floor
  ['lW', 'laundromat', [600.3, 2.95, -600], [1, 0], [[597, -605], [603.5, -595.5]]], // a ceiling fitting in the terrazzo
  ['mT', 'metro', [718, 2.7, -599.1], [1, 0], [[709, -596.8], [727, -597.2]]], // a platform lamp in the terrazzo
  ['pK', 'parking', [46, 2.5, 14], [1, 0], [[39.5, 8], [57, 21]], 10], // a ceiling fitting in the concrete
  ['pG', 'gallery', [23.2, 5.8, 25], [0, 18.7], [[27.3, 22], [27.3, 30]]], // the ceiling's middle in the tiled west wall
  ['pG2', 'gallery-deck', [23.2, 5.5, 25], [1, 0], [[19.2, 22], [27.3, 30]], 10], // the ceiling's middle in the tiled side decks
  ['pH2', 'pool-deck', [-6, 4.5, -12], [1, 0], [[-6, -3], [-7.5, -21]], 10], // the ceiling over the side deck in its tiles
  ['pC', 'arcade', [18.2, 3.55, -12], [2, -9.2], [[11, -12.5], [15, -13.5]]], // a ceiling fitting in the tiled north wall
  ['pN', 'night-hall', [44.6, 3.3, -12], [0, 21], [[35, -8], [37, -17]]], // a wall lamp in the tiled far wall
  ['pH', 'pool-hall', [6, 4.5, -12], [0, -9], [[-5, -5], [-5, -19]]], // the ceiling by the east wall in the tiled west wall
  ['pV', 'vault', [24, 5.1, 49.3], [0, 12], [[30, 46], [30, 53]]], // a pendant in the tiled west wall
  ['hT', 'hotel', [3.8, 2.7, 36.6], [1, 0], [[3.8, 30], [4.6, 44]]], // an opal panel in the corridor's carpet (matte: a sheen, no mirror)
].filter(r => !only || only.includes(r[0]));

// one page load per room: a room baked again with the ball must not leave anything behind for the next
const page = list => `(async () => {
  const { THREE, scene, camera, zones, floorH, renderer } = dev, { bake } = await import('/js/lights.js'), { ponds } = await import('/js/water.js');
  const gl = renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4), out = [];
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.3, 24, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(60, 52, 40) }));
  const rebake = (z, on) => { const v = ponds.map(w => w.visible); ponds.forEach(w => w.visible = false); if (on) scene.add(ball); bake(z); scene.remove(ball); ponds.forEach((w, i) => w.visible = v[i]); };
  const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment, flat = chunk.replace('return PI * envMapColor.rgb * envMapIntensity;', 'return vec3(0.);');
  if (flat === chunk) throw new Error('three.js env chunk changed: the diffuse ambient term was not found');
  THREE.ShaderChunk.envmap_physical_pars_fragment = flat;
  const aim = (c, q) => { const d = q.clone().sub(c); return [Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z))]; };
  const shoot = (x, z, yaw, pitch) => { dev.reset(x, z, yaw, pitch); dev.step(20); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const l = new Float32Array(W * H); for (let i = 0; i < W * H; i++) l[i] = .3 * px[4 * i] + .59 * px[4 * i + 1] + .11 * px[4 * i + 2]; return l; };
  for (const [id, , L, [ax, at], cams, gain = 1] of ${JSON.stringify(list)}) {
    const z = zones[id.slice(0, 2)], light = new THREE.Vector3(...L), img = light.clone(); img.setComponent(ax, 2 * at - L[ax]);
    ball.position.copy(light); ball.material.color.setRGB(60 * gain, 52 * gain, 40 * gain);
    const views = cams.map(([x, zc]) => { const [yaw, pitch] = aim(new THREE.Vector3(x, floorH(x, zc) + 1.62, zc), img); return [x, zc, yaw, pitch]; });
    // The ball would also brighten the probe's diffuse ambient over the whole floor. In this test page only, the room's materials
    // are recompiled with that term off, so the two photos differ by the ball's reflection alone; the reflection code is the game's.
    for (const m of z.mats) { const key = m.customProgramCacheKey; m.customProgramCacheKey = () => 'reflect-test ' + key.call(m); m.needsUpdate = true; }
    rebake(z, true); const with_ = views.map(v => shoot(...v));
    rebake(z, false); const without = views.map(v => shoot(...v));
    const b = z.box, lo = [b[0], z.env ? z.env[0][1] : 0, b[1]], hi = [b[2], z.env ? z.env[1][1] : 8, b[3]];
    views.forEach((v, k) => {
      dev.reset(...v); dev.step(1); camera.updateMatrixWorld();
      const p = img.clone().project(camera), want = [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H];
      const inv = camera.projectionMatrixInverse, cw = camera.matrixWorld, o = camera.position, d = new THREE.Vector3(), h = new THREE.Vector3();
      // the mirror: pixels whose ray meets its plane inside the zone's box (a floor: at the floor's own height, not over a pool)
      const diff = new Float32Array(W * H);
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
        d.set(x / W * 2 - 1, y / H * 2 - 1, 1).applyMatrix4(inv).transformDirection(cw); // y from the bottom (readPixels order)
        const t = (at - o.getComponent(ax)) / d.getComponent(ax); if (!(t > 0)) continue; h.copy(o).addScaledVector(d, t);
        if ([0, 1, 2].some(a => a !== ax && !(h.getComponent(a) > lo[a] && h.getComponent(a) < hi[a]))) continue;
        if (ax === 1 && Math.abs(floorH(h.x, h.z) - at) > .05) continue;
        const i = y * W + x; diff[i] = with_[k][i] - without[k][i]; }
      // the patch: around the brightest 9 x 9 px spot, everything over a third of it within 90 px, weighted by how much over
      const S = new Float64Array((W + 1) * (H + 1)); let max = 0, pk = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = (y + 1) * (W + 1) + x + 1; S[j] = diff[y * W + x] + S[j - 1] + S[j - W - 1] - S[j - W - 2]; }
      for (let y = 4; y < H - 5; y++) for (let x = 4; x < W - 5; x++) { const s = (S[(y + 5) * (W + 1) + x + 5] - S[(y - 4) * (W + 1) + x + 5] - S[(y + 5) * (W + 1) + x - 4] + S[(y - 4) * (W + 1) + x - 4]) / 81;
        if (s > max) { max = s; pk = y * W + x; } }
      let sw = 0, sx = 0, sy = 0; const th = max / 3, px0 = pk % W, py0 = Math.floor(pk / W);
      for (let y = Math.max(0, py0 - 90); y < Math.min(H, py0 + 90); y++) for (let x = Math.max(0, px0 - 90); x < Math.min(W, px0 + 90); x++) {
        const i = y * W + x; if (diff[i] > th && Math.hypot(x - px0, y - py0) < 90) { const w = diff[i] - th; sw += w; sx += w * x; sy += w * (H - 1 - y); } }
      const got = sw && max > 2 ? [sx / sw, sy / sw] : null; // under 2/255: no reflection to find
      let png; if (${!!arg('dump')}) { // the photo with the reflected patch in red, the mirror's place as a green ring, the centroid as a red one
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(W, H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (H - 1 - y) * W + x, o = 4 * (y * W + x), l = without[k][i] * .8, d = Math.max(0, diff[i]) / (max || 1) * 255;
          im.data[o] = Math.min(255, l + d); im.data[o + 1] = l; im.data[o + 2] = l; im.data[o + 3] = 255; }
        g.putImageData(im, 0, 0); g.lineWidth = 3;
        g.strokeStyle = '#0f0'; g.beginPath(); g.arc(want[0], want[1], 14, 0, 7); g.stroke();
        if (got) { g.strokeStyle = '#f33'; g.beginPath(); g.arc(got[0], got[1], 9, 0, 7); g.stroke(); }
        png = c.toDataURL('image/png').split(',')[1]; }
      out.push({ id, cam: k, view: v.map(n => +n.toFixed(4)), want: want.map(Math.round), got: got && got.map(Math.round), err: got ? +Math.hypot(got[0] - want[0], got[1] - want[1]).toFixed(1) : null, peak: +max.toFixed(1), png });
    });
    rebake(z, false);
  }
  return out; })()`;
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const r = { result: [] };
for (const room of rooms) { let q; try { q = JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare`, '--eval', page([room]), '--wait', '400000'], { encoding: 'utf8', maxBuffer: 1 << 26 })); }
  catch (e) { q = JSON.parse(e.stdout || '{}'); }
  if (q.errors?.length || !q.result) { console.error(room[0] + ' page errors: ' + JSON.stringify(q.errors)); process.exit(1); }
  r.result.push(...q.result); }
for (const m of r.result) { if (m.png) writeFileSync(`${arg('dump')}/${rooms.find(x => x[0] === m.id)[1]}-${m.cam}.png`, Buffer.from(m.png, 'base64')); delete m.png; }
if (argv.includes('--json')) console.log(JSON.stringify(r.result));
else for (const m of r.result) console.log(`${m.id.padEnd(3)} ${rooms.find(x => x[0] === m.id)[1].padEnd(11)} cam ${m.cam}  want ${m.want}  got ${m.got}  error ${m.err} px  (peak ${m.peak})`);
if (arg('views')) writeFileSync(arg('views'), JSON.stringify(r.result.map(m => ({ name: `${rooms.find(x => x[0] === m.id)[1]}-${m.cam}`, hash: m.view.join(',') })), null, 1));
