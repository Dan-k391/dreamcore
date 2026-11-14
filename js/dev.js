// Test hooks, only with ?dev in the address (see AGENTS.md).
import * as THREE from 'three';
import { renderer, scene, camera, uTime, zones } from './core.js';
import { colliders, emitters, floorH } from './build.js';
import { skyNow } from './sky.js';
import { o, zone, feet, air, frame, place, looseCost } from './player.js';
import { groups, floaters } from './physics.js';
import { composer } from './post.js';
import { libStats } from './tex.js';

// ---------- test harness: with ?dev in the address, tools/test.mjs and tools/shots.mjs drive the game through window.dev ----------
if (new URLSearchParams(location.search).has('dev')) {
  o.style.display = 'none'; // no start overlay, so no click, so no audio
  const r2 = v => +v.toFixed(2);
  renderer.info.autoReset = false; // so info() counts every pass of a frame, not just the last
  window.dev = { ready: false, hold: false, THREE, renderer, scene, camera, zones, colliders, emitters, floorH, uTime,
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); }, // deterministic: only the caller's dt moves the game
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
    lib: libStats, // the material library's bake: ms, sets, bytes
    texMem() { // material textures in the scene (env maps and shadow maps aside), counted as w x h x bytes per texel x 1.33 when mipmapped
      const seen = new Set(), keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap'];
      scene.traverse(o => { for (const m of [o.material].flat()) if (m) { for (const k of keys) if (m[k]) seen.add(m[k]);
        for (const u of Object.values(m.userData.libU || {})) if (u.value?.isTexture) seen.add(u.value);
        for (const u of Object.values(m.uniforms || {})) if (u.value?.isTexture && !u.value.isRenderTargetTexture && !u.value.isDepthTexture) seen.add(u.value); } });
      let bytes = 0; for (const t of seen) { const w = t.image?.width || 0, h = t.image?.height || 0, b = { 1015: 16, 1016: 8 }[t.type] || 4;
        bytes += w * h * b * (t.generateMipmaps || t.mipmaps?.length ? 1.33 : 1); }
      return { textures: seen.size, MB: +(bytes / 1048576).toFixed(1) }; },
    info() { renderer.info.reset(); this.step(1); return { ...renderer.info.render, ...renderer.info.memory, programs: renderer.info.programs.length }; }, // draw calls and triangles for one whole frame
  };
}
