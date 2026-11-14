// Test hooks, only with ?dev in the address (see AGENTS.md).
import * as THREE from 'three';
import { renderer, scene, camera, uTime, zones } from './core.js';
import { colliders, emitters, floorH } from './build.js';
import { skyNow } from './sky.js';
import { o, zone, feet, air, frame, place } from './player.js';

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
    info() { renderer.info.reset(); this.step(1); return { ...renderer.info.render, ...renderer.info.memory, programs: renderer.info.programs.length }; }, // draw calls and triangles for one whole frame
  };
}
