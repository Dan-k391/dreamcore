// Test hooks, only with ?dev in the address (see AGENTS.md).
import * as THREE from 'three';
import { renderer, scene, camera, uTime, zones, WY } from './core.js';
import { colliders, emitters, floorH } from './build.js';
import { skyNow } from './sky.js';
import { vel, eye, o, zone, feet, air, frame, place, looseCost, resetAll } from './player.js';
import { groups, floaters } from './physics.js';
import { composer } from './post.js';
import { libStats } from './tex.js';
import { ponds, uTest } from './water.js';
import { renderMusic } from './audio.js';
import { pieces } from './music.js';

// ---------- test harness: with ?dev in the address, tools/test.mjs and tools/shots.mjs drive the game through window.dev ----------
if (new URLSearchParams(location.search).has('dev')) {
  o.style.display = 'none'; // no start overlay, so no click, so no audio
  const r2 = v => +v.toFixed(2);
  renderer.info.autoReset = false; // so info() counts every pass of a frame, not just the last
  window.dev = { _ready: false, readyAt: 0, hold: false, // readyAt: ms from page start to the first frame drawn (tools/perf.mjs)
    get ready() { return this._ready; }, set ready(v) { if (v && !this._ready) this.readyAt = Math.round(performance.now()); this._ready = v; }, THREE, vel, renderer, scene, camera, composer, zones, colliders, emitters, floorH, uTime,
    get lift() { return eye.lift; }, set lift(v) { eye.lift = v; }, // metres added to the eye height
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); }, // deterministic: only the caller's dt moves the game
    reset(x, z, yaw = 0, pitch = 0) { this.hold = true; resetAll(x, z, yaw, pitch); }, // a fresh load's starting state at (x, z): lift, fov, keys, clock, sky, lamps, waves, loose bodies, eye adaptation
    state: () => ({ x: r2(camera.position.x), y: r2(feet), z: r2(camera.position.z), zone: zone.id, sky: skyNow, air }),
    key: (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })),
    go(x, z, yaw = 0, keys = [], secs = 0, pitch = 0) { // teleport, settle, hold the keys for secs, let go, report where you ended up
      this.hold = true;
      place(x, z, yaw, pitch);
      this.step(12, .05);
      for (const c of keys) this.key(c, true); this.step(Math.round(secs * 20), .05); for (const c of keys) this.key(c, false);
      this.step(6, .05); return this.state();
    },
    cost(n = 60) { const gl = renderer.getContext(), px = new Uint8Array(4), t = Date.now(); // real milliseconds per frame, reading a pixel back so the GPU has to finish
      for (let i = 0; i < n; i++) { frame(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return +((Date.now() - t) / n).toFixed(2); },
    bodies() { // the loose things: each ball group (count, how many awake, the bounds of its balls, a single ball's place) and each ring
      return { groups: groups.map(g => { const p = g.p, b = { n: g.n, awake: g.awake, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] };
          for (let i = 0; i < p.length; i++) { b.lo[i % 3] = Math.min(b.lo[i % 3], p[i]); b.hi[i % 3] = Math.max(b.hi[i % 3], p[i]); }
          b.lo = b.lo.map(r2); b.hi = b.hi.map(r2); if (g.n === 1) b.at = [r2(p[0]), r2(p[1]), r2(p[2])]; return b; }),
        rings: floaters.map(f => ({ x: r2(f.x), y: +f.y.toFixed(3), z: r2(f.z), tilt: +Math.hypot(f.ax, f.az).toFixed(3), v: +Math.hypot(f.vx, f.vz).toFixed(3), pool: [f.w.rect.x, f.w.rect.y, f.w.rect.z, f.w.rect.w] })) };
    },
    balls: (k = 0) => groups[k].p, // one group's ball positions, x y z each
    view(x, y, z, yaw, pitch = 0) { // draw one picture from somewhere else without moving the player (for photos of what the player does)
      const p = camera.position.clone(), q = camera.quaternion.clone(); camera.position.set(x, y, z); camera.rotation.set(pitch, yaw, 0, 'YXZ'); camera.updateMatrixWorld();
      composer.render(0); camera.position.copy(p); camera.quaternion.copy(q); },
    physics(n = 60) { let t = 0; for (let i = 0; i < n; i++) { frame(1 / 60); t += looseCost.ms; } return +(t / n).toFixed(3); }, // ms a frame the loose things cost, over n frames
    music: { render: renderMusic, pieces }, // offline renders of the sound: render([[0, zoneA], [t, zoneB]], secs, { room, tap, log }) -> { buf, ms, peakNodes, log }
    lib: libStats, // the material library's bake: ms, sets, bytes
    texMem() { // material textures in the scene (env maps and shadow maps aside), counted as w x h x bytes per texel x 1.33 when mipmapped
      const seen = new Set(), keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap'];
      scene.traverse(o => { for (const m of [o.material].flat()) if (m) { for (const k of keys) if (m[k]) seen.add(m[k]);
        for (const u of Object.values(m.userData.libU || {})) if (u.value?.isTexture) seen.add(u.value);
        for (const u of Object.values(m.uniforms || {})) if (u.value?.isTexture && !u.value.isRenderTargetTexture && !u.value.isDepthTexture) seen.add(u.value); } });
      let bytes = 0; for (const t of seen) { const w = t.image?.width || 0, h = t.image?.height || 0, b = { 1015: 16, 1016: 8 }[t.type] || 4;
        bytes += w * h * b * (t.generateMipmaps || t.mipmaps?.length ? 1.33 : 1); }
      return { textures: seen.size, MB: +(bytes / 1048576).toFixed(1) }; },
    waterCheck(x, z, yaw, pitch = 0, lift = 0, imgs = false) { // the water's two pictures against direct renders, surface flat, time frozen (tools/water-check.mjs)
      this.reset(x, z, yaw, pitch); eye.lift = lift; this.step(30);
      const W = 1280, H = 720, rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType }), on = ponds.map(w => w.visible), cps = renderer.clippingPlanes;
      const grab = (cam, mode, water) => { uTest.value = mode; ponds.forEach((w, i) => w.visible = water && on[i]); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
        const a = new Float32Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, a); return a; };
      const mask = grab(camera, 3, true), lensT = grab(camera, 1, true), lensR = grab(camera, 0, false), mirT = grab(camera, 2, true);
      const mc = camera.clone(), m = new THREE.Matrix4().makeTranslation(0, 2 * WY, 0).multiply(new THREE.Matrix4().makeScale(1, -1, 1)).multiply(camera.matrixWorld).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      m.decompose(mc.position, mc.quaternion, mc.scale); mc.updateMatrixWorld(true); // the truly mirrored camera; its picture is the mirror image left-right
      renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -WY)]; const mirR0 = grab(mc, 0, false); renderer.clippingPlanes = cps;
      uTest.value = 0; ponds.forEach((w, i) => w.visible = on[i]); renderer.setRenderTarget(null); rt.dispose();
      const mirR = new Float32Array(mirR0.length); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) for (let c = 0; c < 4; c++) mirR[(j * W + i) * 4 + c] = mirR0[(j * W + W - 1 - i) * 4 + c];
      const g = v => 255 * Math.pow(Math.min(Math.max(v, 0), 1), 1 / 2.2), isW = k => mask[k * 4] < -.5, d = (A, k, B, l) => (Math.abs(g(A[k * 4]) - g(B[l * 4])) + Math.abs(g(A[k * 4 + 1]) - g(B[l * 4 + 1])) + Math.abs(g(A[k * 4 + 2]) - g(B[l * 4 + 2]))) / 3;
      const B = 4, bw = W / B, bh = H / B, blocks = A => { const o = new Float32Array(bw * bh * 3).fill(NaN); // 4 px blocks, so the tiles' grout lines (resampled differently in the 1280 px pictures) do not count as seams
        for (let J = 0; J < bh; J++) for (let I = 0; I < bw; I++) { const s = [0, 0, 0]; let ok = true;
          for (let j = J * B; j < J * B + B && ok; j++) for (let i = I * B; i < I * B + B; i++) { const k = j * W + i; if (!isW(k)) { ok = false; break; } for (let c = 0; c < 3; c++) s[c] += g(A[k * 4 + c]); }
          if (ok) for (let c = 0; c < 3; c++) o[(J * bw + I) * 3 + c] = s[c] / (B * B); }
        return o; };
      const bd = (A, k, C, l) => (Math.abs(A[k * 3] - C[l * 3]) + Math.abs(A[k * 3 + 1] - C[l * 3 + 1]) + Math.abs(A[k * 3 + 2] - C[l * 3 + 2])) / 3;
      const score = (T, R) => { let s = 0, n = 0, seam = 0, row = -1; // mean difference over the water, and the largest row-to-row jump the test has and the direct render does not
        for (let k = 0; k < W * H; k++) if (isW(k)) { s += d(T, k, R, k); n++; }
        const t = blocks(T), r = blocks(R);
        for (let J = 0; J + 1 < bh; J++) { let jt = 0, jr = 0, c = 0; for (let I = 0; I < bw; I++) { const k = J * bw + I, l = k + bw; if (t[k * 3] === t[k * 3] && t[l * 3] === t[l * 3]) { jt += bd(t, k, t, l); jr += bd(r, k, r, l); c++; } }
          if (c >= 8 && (jt - jr) / c > seam) { seam = (jt - jr) / c; row = H - B * (J + 1); } }
        return { mean: +(s / Math.max(n, 1)).toFixed(2), seam: +seam.toFixed(2), row }; };
      const out = { water: +(mask.reduce((a, v, k) => a + (k % 4 === 0 && v < -.5), 0) / (W * H)).toFixed(3), lens: score(lensT, lensR), mirror: score(mirT, mirR) };
      if (imgs) { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'), id = cx.createImageData(W, H);
        const png = A => { for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = ((H - 1 - j) * W + i) * 4, l = (j * W + i) * 4; for (let c = 0; c < 3; c++) id.data[l + c] = isW(k / 4) ? g(A[k + c]) : 40 + g(A[k + c]) * .15; id.data[l + 3] = 255; } /* outside the water dimmed */ cx.putImageData(id, 0, 0); return cv.toDataURL(); };
        out.imgs = { mask: png(mask.map(v => -v)), lensT: png(lensT), lensR: png(lensR), mirT: png(mirT), mirR: png(mirR) }; }
      return out; },
    info() { renderer.info.reset(); this.step(1); return { ...renderer.info.render, ...renderer.info.memory, programs: renderer.info.programs.length }; }, // draw calls and triangles for one whole frame
  };
}
