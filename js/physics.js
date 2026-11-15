// Loose things: balls (the soft play pit's, the beach balls, the field's ball) and the swim rings. player.js steps them at a fixed
// 60 Hz with the player's body; only dev.step() or the frame loop moves time, so a held game is deterministic.
// Balls are position-based: each step they fall, move, are pushed out of the solids, each other and the body, and their speed is
// what that did to them. Still balls sleep and cost nothing; a group whose balls all sleep is skipped while the player is away.
// Rings float on the CPU's copy of the waves (water.js), so they rise, tilt and drift with what the GPU draws without a readback.
import * as THREE from 'three';
import { renderer, camera, uTime, WY, inR } from './core.js';
import { colliders, flats, loose, rings, clear, out } from './build.js';
import { ponds } from './water.js';
import { lights } from './lights.js';
import { sun } from './sky.js';

const h = 1 / 60, G = 9.8;
const pondAt = (x, z) => ponds.find(w => inR(x, z, w.rect.x, w.rect.y, w.rect.z, w.rect.w));
// The drawn water is flat (water.js shades its waves, it doesn't move the surface), so what floats on it heaves by HEAVE at most:
// enough to bob with the waves, never enough to leave the surface it is seen on or be flung off it.
const HEAVE = .04, heave = t => Math.max(-HEAVE, Math.min(HEAVE, t.h * 5));
const wakes = []; // [pond, x, z, size]: ripples the loose things leave this step, for player.js to hand to ripple()
let ms = 0; // milliseconds the last frame's steps took

// ---------- shadows: the shadow maps are drawn only when asked; a body that has moved a centimetre asks the lights that reach it ----------
const _p = new THREE.Vector3();
function reshade(x, y, z, r) {
  for (const l of lights) if (l.intensity > 0 && l.position.distanceTo(_p.set(x, y, z)) < l.distance + r) { l.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true; }
  if (sun.intensity > 0) { const c = sun.shadow.camera; _p.set(x, y, z).applyMatrix4(c.matrixWorldInverse);
    if (_p.x > c.left - r && _p.x < c.right + r && _p.y > c.bottom - r && _p.y < c.top + r) { sun.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true; } }
}

// ---------- balls ----------
const groups = loose.map(s => {
  const n = s.pos.length / 3, [x1, z1, x2, z2] = s.region, r = s.r, C = .5; // C: the cell size of the group's own list of solids
  const g = { ...s, n, x1, z1, x2, z2, p: Float32Array.from(s.pos), o: Float32Array.from(s.pos), d: Float32Array.from(s.pos), a: Float32Array.from(s.pos), v: new Float32Array(n * 3), still: new Uint8Array(n), awake: 0, moved: 0, contact: new Uint8Array(n) };
  g.cw = Math.ceil((x2 - x1) / C); g.ch = Math.ceil((z2 - z1) / C); g.cells = Array.from({ length: g.cw * g.ch }, () => []);
  for (const c of colliders) if (c[2] > x1 - r && c[0] < x2 + r && c[3] > z1 - r && c[1] < z2 + r) // every solid near the group, by the cells it covers
    for (let j = Math.max(0, Math.floor((c[1] - r - z1) / C)); j <= Math.min(g.ch - 1, Math.floor((c[3] + r - z1) / C)); j++)
      for (let i = Math.max(0, Math.floor((c[0] - r - x1) / C)); i <= Math.min(g.cw - 1, Math.floor((c[2] + r - x1) / C)); i++) g.cells[i + j * g.cw].push(c);
  const fl = flats.filter(f => f[2] > x1 && f[0] < x2 && f[3] > z1 && f[1] < z2); // and its floors, in their overriding order
  g.floor = (x, z) => { let y = 0; for (const f of fl) if (inR(x, z, f[0], f[1], f[2], f[3])) y = f[4](x, z); return y; };
  if (n > 1) { // the ball list for finding neighbours: 2r cells, the region's plan by y from -1.2 to 2.8 (anything outside goes in the edge cells)
    g.gx = Math.ceil((x2 - x1) / (2 * r)); g.gz = Math.ceil((z2 - z1) / (2 * r)); g.gy = Math.ceil(4 / (2 * r));
    g.head = new Int32Array(g.gx * g.gy * g.gz); g.next = new Int32Array(n); g.dirty = true;
    g.hid = new Uint8Array(n); g.order = new Int32Array(n); g.tmp = new Float32Array(3 * n); g.tmp8 = new Uint8Array(n); // bury()'s, kept so falling asleep allocates nothing
  }
  if (s.spin) g.q = new THREE.Quaternion();
  if (s.float) g.in = Array(n).fill(null); // per ball, the pool it was well inside at the step's start: it stays in it
  if (n > 1) g.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3((x1 + x2) / 2, .5, (z1 + z2) / 2), Math.hypot(x2 - x1, 3, z2 - z1) / 2); // the region's: wherever its balls go, so they are culled with the room
  if (s.fine) { // a finer shape for the balls near the eye (fine()); the far ones keep the plain one, where its edges are under a pixel
    const m = g.fine = new THREE.InstancedMesh(s.fine, g.mesh.material, n); m.count = 0; m.castShadow = g.mesh.castShadow; m.receiveShadow = g.mesh.receiveShadow;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3); m.boundingSphere = g.mesh.boundingSphere; g.mesh.parent.add(m); g.hi = new Uint8Array(n);
  }
  draw(g, 1);
  return g;
});
// The steps run over thousands of balls 60 times a second, so nothing in them allocates: cellOf answers in ci cj ck, around() in found.
let ci = 0, cj = 0, ck = 0;
const cellOf = (g, x, y, z) => { ci = Math.min(g.gx - 1, Math.max(0, Math.floor((x - g.x1) / (2 * g.r)))); cj = Math.min(g.gy - 1, Math.max(0, Math.floor((y + 1.2) / (2 * g.r)))); ck = Math.min(g.gz - 1, Math.max(0, Math.floor((z - g.z1) / (2 * g.r)))); };
function rebuild(g) {
  g.head.fill(-1);
  for (let b = 0; b < g.n; b++) { cellOf(g, g.p[3 * b], g.p[3 * b + 1], g.p[3 * b + 2]); const c = ci + g.gx * (cj + g.gy * ck); g.next[b] = g.head[c]; g.head[c] = b; }
  g.dirty = false;
}
const found = new Int32Array(Math.max(1, ...loose.map(s => s.pos.length / 3)));
function around(g, x, y, z, rad) { // the balls whose cell is within rad of (x, y, z) into found; returns how many
  cellOf(g, x - rad, y - rad, z - rad); const i0 = ci, j0 = cj, k0 = ck; cellOf(g, x + rad, y + rad, z + rad); let m = 0;
  for (let k = k0; k <= ck; k++) for (let j = j0; j <= cj; j++) for (let i = i0; i <= ci; i++) for (let b = g.head[i + g.gx * (j + g.gy * k)]; b >= 0; b = g.next[b]) found[m++] = b;
  return m;
}
// Once a heap is at rest, the balls with three others resting on them can't be seen from outside it: they go to the end of the
// list and are not drawn (mesh.count) until the heap moves or the player is down in it. Looked at BURY balls a step (g.bq: the next
// one; -1 when there is nothing to do), so falling asleep never costs one frame much; a ball woken meanwhile starts it over.
const BURY = 1024;
function bury(g) {
  if (!g.bq && g.dirty) rebuild(g);
  const { p, n, head, next, gx, gy, gz, hid, order, tmp, tmp8 } = g, s = 2 * g.r, cell = (v, lo, m) => Math.min(m - 1, Math.max(0, Math.floor((v - lo) / s))), end = Math.min(n, g.bq + BURY);
  for (let b = g.bq; b < end; b++) { const x = p[3 * b], y = p[3 * b + 1], z = p[3 * b + 2]; let above = 0; // the balls just above it, cell by cell (around() inlined: this runs over the whole heap)
    const i0 = cell(x - .2, g.x1, gx), i1 = cell(x + .2, g.x1, gx), j0 = cell(y - .05, -1.2, gy), j1 = cell(y + .35, -1.2, gy), k0 = cell(z - .2, g.z1, gz), k1 = cell(z + .2, g.z1, gz);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let c = head[i + gx * (j + gy * k)]; c >= 0; c = next[c]) {
      const dy = p[3 * c + 1] - y, dx = p[3 * c] - x, dz = p[3 * c + 2] - z; if (dy > .05 && dy < .3 && dx * dx + dz * dz < .0289) above++; }
    hid[b] = above >= 3 ? 1 : 0; }
  g.bq = end < n ? end : -1; if (end < n) return;
  let m = 0, shown = 0; for (let b = 0; b < n; b++) shown += 1 - hid[b]; for (let k = 0; k < 2; k++) for (let b = 0; b < n; b++) if (hid[b] === k) order[m++] = b; // the shown ones first, each part in its old order
  for (const a of [g.p, g.o, g.d, g.a, g.v, g.mesh.instanceColor.array]) { tmp.set(a); for (let i = 0; i < n; i++) { const b = order[i]; a[3 * i] = tmp[3 * b]; a[3 * i + 1] = tmp[3 * b + 1]; a[3 * i + 2] = tmp[3 * b + 2]; } }
  for (const a of [g.still, g.contact]) { tmp8.set(a); for (let i = 0; i < n; i++) a[i] = tmp8[order[i]]; }
  if (g.hi) { const a = g.mesh.instanceMatrix.array; for (let b = 0; b < n; b++) if (g.hi[b]) a[16 * b] = a[16 * b + 5] = a[16 * b + 10] = 1; g.hi.fill(0); } // the order changed: fine() picks the near ones again
  g.mesh.instanceColor.needsUpdate = true; g.shown = shown; g.dirty = true; draw(g, 1);
}
const wake = (g, b) => { if (g.still[b] >= 30) { g.still[b] = 0; g.awake++; } else g.still[b] = 0; };

// The body as the balls see it: an upright capsule round the legs and hips, radius .22, from 20 cm above the soles to 1.5 m.
const BR = .22;
function legs(g, b, me) {
  const i = 3 * b, x = g.p[i], y = g.p[i + 1], z = g.p[i + 2], cy = Math.min(me.feet + 1.5, Math.max(me.feet + .2, y)), dx = x - me.x, dy = y - cy, dz = z - me.z, d2 = dx * dx + dy * dy + dz * dz, R = BR + g.r;
  if (d2 >= R * R) return false;
  const d = Math.sqrt(d2) || 1e-6, k = (R - d) / d, nx = dx / d, ny = dy / d, nz = dz / d;  g.p[i] += dx * k; g.p[i + 1] += dy * k; g.p[i + 2] += dz * k; g.o[i] += dx * k; g.o[i + 1] += dy * k; g.o[i + 2] += dz * k; // being put outside the body is not speed: a deep overlap (a fall beside it) would fire it off
  const vn = Math.min(me.vx * nx + me.vz * nz, g.float ? 1.5 : 9), own = ((g.p[i] - g.o[i]) * nx + (g.p[i + 1] - g.o[i + 1]) * ny + (g.p[i + 2] - g.o[i + 2]) * nz) / h; // the legs' speed into it (the water between cushions a float)
  if (own < vn) { const e = (vn - own) * h; g.o[i] -= nx * e; g.o[i + 1] -= ny * e; g.o[i + 2] -= nz * e; } // it moves off at that speed
  return true;
}

function stepGroup(g, me) {
  const near = me.x > g.x1 - 1 && me.x < g.x2 + 1 && me.z > g.z1 - 1 && me.z < g.z2 + 1, many = g.n > 1;
  g.inside = near && me.feet < -.1; // down among the balls: every one may show
  if (g.float && !g.awake) { const w = pondAt(g.p[0], g.p[2]); if (w?.visible) { const t = w.twin.sample(g.p[0], g.p[2]); if (Math.abs(t.h) > .003 || Math.hypot(t.ux, t.uz) > .02) wake(g, 0); } } // a passing wave wakes a float
  if (many && !g.awake && g.bq >= 0) bury(g);
  if (!g.awake && !near) return;
  if (many && g.dirty) rebuild(g);
  const { p, o, v, r } = g;
  if (near && (Math.hypot(me.vx, me.vz) > .05 || Math.abs(me.vy) > .05 || me.hit)) { // moving legs wake what they touch (still ones leave a resting heap be); a landing throws the balls round the feet up and out
    for (let q = 0, m = many ? around(g, me.x, me.feet + .8, me.z, 1) : 1; q < m; q++) { const b = many ? found[q] : 0, i = 3 * b, dx = p[i] - me.x, dz = p[i + 2] - me.z, dy = p[i + 1] - Math.min(me.feet + 1.5, Math.max(me.feet + .2, p[i + 1])), R = BR + r - .003, d = Math.hypot(dx, dz) + .05;
      if (dx * dx + dy * dy + dz * dz < R * R) { wake(g, b); if (me.vy < -2.5 && dy < .05 && !g.float) { const k = (.5 + .5 * frac(b * .618)) * Math.min(1.2, -me.vy / 4); // falling in: what is under the feet sprays up and out, low enough that most stay in
        const up = (1.1 + 1.5 * frac(b * .377)) * k; if (v[i + 1] < up) { v[i] += dx / d * 1.1 * k; v[i + 1] = up; v[i + 2] += dz / d * 1.1 * k; } } } // once: a ball already thrown is not thrown again on the next step of the fall
      else if (me.hit > 2.5 && d < .9 && p[i + 1] < me.feet + .6 && !g.float) { wake(g, b); const k = (1 - d / .9) * (.4 + .6 * frac(b * .618)) * Math.min(1.2, me.hit / 4); // and the landing heaves the ones round the legs
        v[i] += dx / d * 1 * k; v[i + 1] += (.9 + 1.2 * frac(b * .377)) * k; v[i + 2] += dz / d * 1 * k; } }
  }
  if (g.float && me.splash) { const dx = p[0] - me.x, dz = p[2] - me.z, d = Math.hypot(dx, dz); if (d < 3.5) { wake(g, 0); const k = (1 - d / 3.5) / (d || 1); v[0] += dx * k; v[2] += dz * k; } } // a jump in throws water, and a float on it, outward
  if (!g.awake) return;
  let fast = 0;
  for (let b = 0; b < g.n; b++) if (g.still[b] < 30) { // fall and move
    const i = 3 * b; o[i] = p[i]; o[i + 1] = p[i + 1]; o[i + 2] = p[i + 2];
    v[i + 1] -= G * h;
    if (g.float) { const w = pondAt(p[i], p[i + 2]), R = w?.rect; g.in[b] = R && inR(p[i], p[i + 2], R.x + r - .01, R.y + r - .01, R.z - r + .01, R.w - r + .01) ? R : null; if (w) { const t = w.twin.sample(p[i], p[i + 2]), s = WY + heave(t), sub = Math.min(1, Math.max(0, (s - p[i + 1] + r) / (2 * r))); // how much of it is under water (the surface heaved as the rings ride it)
      if (sub > 0) { v[i + 1] += G * sub / g.float * h; const k = Math.min(1, (.6 + sub * 4) * h), kv = Math.min(1, (4 + sub * 60) * h); // it floats, the water drags it along with its flow and holds back its bobbing (near critical: a dive must not launch it)
        v[i] += (t.ux * 1.4 - G * .3 * t.gx - v[i]) * k; v[i + 2] += (t.uz * 1.4 - G * .3 * t.gz - v[i + 2]) * k; v[i + 1] -= v[i + 1] * kv;
        const sp = Math.hypot(v[i], v[i + 2]); if (sp > .08) wakes.push([w, p[i], p[i + 2], Math.min(sp, 2) * .0015 * sub]); } } } // its wake: from moving through the water, not bobbing (a wake raised under a rising ball would lift it further)
    const sp = Math.hypot(v[i], v[i + 1], v[i + 2]), top = g.cap || 7; if (sp > top) { v[i] *= top / sp; v[i + 1] *= top / sp; v[i + 2] *= top / sp; }
    p[i] += v[i] * h; p[i + 1] += v[i + 1] * h; p[i + 2] += v[i + 2] * h;
  }
  for (let it = 0; it < 2; it++) for (let b = 0; b < g.n; b++) if (g.still[b] < 30) { // push out of the legs, the world and each other
    if (g.solid && me.feet !== undefined && legs(g, b, me)) g.kick = b + 1; // a solid ball: the legs first, so the walls have the last word and a pinned ball shoves the body back
    const i = 3 * b;
    const R = g.float && g.in[b]; if (R) { p[i] = Math.min(R.z - r, Math.max(R.x + r, p[i])); p[i + 2] = Math.min(R.w - r, Math.max(R.y + r, p[i + 2])); } // a float in its pool stays there, as the rings do: before the solids, so pushed at the rim it holds the body instead of rolling up over the edge
    let x = p[i], y = p[i + 1], z = p[i + 2], hit = 0, fy = g.floor(x, z);
    if (fy > y - r * .5 && !g.slope) { x = o[i]; z = o[i + 2]; fy = g.floor(x, z); } // a floor rising above half its radius (a step, a block) is a wall to it, not a lift onto its top
    // the floor: along its slope's normal where it slopes (the field), so a ball on a slope rolls down it
    if (y - r < fy + .01) { let nx = 0, ny = 1, nz = 0; if (g.slope) { nx = g.floor(x - .1, z) - g.floor(x + .1, z); nz = g.floor(x, z - .1) - g.floor(x, z + .1); ny = .2; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; }
      const pen = r - (y - fy) * ny; if (pen > 0) { x += nx * pen; y += ny * pen; z += nz * pen; } hit = 1; }
    const cl = g.cells[Math.min(g.cw - 1, Math.max(0, Math.floor((x - g.x1) / .5))) + g.cw * Math.min(g.ch - 1, Math.max(0, Math.floor((z - g.z1) / .5)))];
    for (const c of cl) if (y + r > c[4] - .01 && y - r < c[5] + .01 && clear(c, x, y, z, r + .005)) { if (out.y > 0) hit = 1; if (clear(c, x, y, z, r)) { x += out.x; y += out.y; z += out.z; } }
    p[i] = x; p[i + 1] = y; p[i + 2] = z;
    for (let q = 0, m = many ? around(g, x, y, z, 2 * r) : 0; q < m; q++) { const c = found[q]; if (c === b) continue; const j = 3 * c, dx = p[i] - p[j], dy = p[i + 1] - p[j + 1], dz = p[i + 2] - p[j + 2], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= 4.2 * r * r || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), e = 2 * r - d;
      if (dy > .5 * d) hit = 1; // resting on it (or just touching)
      if (e <= 0) continue;
      if (g.still[c] >= 30 && e > .004) wake(g, c); // a hard knock wakes a sleeping ball; a light one finds it as firm as the floor
      const w = g.still[c] >= 30 ? 1 : .5 + .4 * dy / d, k = e * w / d, kj = e * (1 - w) / d; // the upper ball gives way more, so a pile carries its weight down to the floor in one step
      p[i] += dx * k; p[i + 1] += dy * k; p[i + 2] += dz * k; p[j] -= dx * kj; p[j + 1] -= dy * kj; p[j + 2] -= dz * kj; }
    if (!g.solid && me.feet !== undefined) legs(g, b, me); // a small ball: the legs last, so none is left inside them
    p[i] = Math.min(g.x2 - r, Math.max(g.x1 + r, p[i])); p[i + 2] = Math.min(g.z2 - r, Math.max(g.z1 + r, p[i + 2])); // a ball never leaves its place: its doorways are shut to it, and its solids are only gathered there
    g.contact[b] = hit;
  }
  if (g.solid && g.kick) { // a big ball the walls hold against the legs pushes back: you can't walk through it
    const i = 3 * (g.kick - 1), dx = p[i] - me.x, dz = p[i + 2] - me.z, d = Math.hypot(dx, dz), R = BR + r - .005;
    if (d < R && p[i + 1] - r < me.feet + 1.5 && p[i + 1] + r > me.feet + .05) { const k = (R - d) / (d || 1); me.x -= dx * k; me.z -= dz * k; me.shoved = true; }
    g.kick = 0;
  }
  for (let b = 0; b < g.n; b++) if (g.still[b] < 30) { // speed is what the step did; floors bounce a little and roll it to a stop
    const i = 3 * b, ox = v[i], oy = v[i + 1], oz = v[i + 2];
    v[i] = (p[i] - o[i]) / h; v[i + 1] = (p[i + 1] - o[i + 1]) / h; v[i + 2] = (p[i + 2] - o[i + 2]) / h;
    const s1 = Math.hypot(v[i], v[i + 1], v[i + 2]), s0 = Math.hypot(ox, oy, oz) + 3; if (s1 > s0) { v[i] *= s0 / s1; v[i + 1] *= s0 / s1; v[i + 2] *= s0 / s1; } // being pushed out of an overlap gains at most 3 m/s a step: a pile squeezed by a falling body would otherwise burst
    if (g.contact[b]) {
      if (oy < -1.2 && v[i + 1] > oy * -.2) v[i + 1] = -oy * g.bounce; // a fall onto something bounces
      const s = Math.hypot(v[i], v[i + 2]), f = s > 1e-6 ? Math.max(0, s - g.grip * h) / s : 0; v[i] *= f; v[i + 2] *= f; // rolling resistance
      if (!f && g.slope) { p[i] = o[i]; p[i + 2] = o[i + 2]; } // and where it holds, it holds the place too: the push out along the slope's normal would otherwise creep it downhill until a steeper bit lets it run
      if (g.q && s > 1e-4) g.q.premultiply(_q.setFromAxisAngle(_a.set(v[i + 2] / s, 0, -v[i] / s), s * h / r)); // rolls without slipping
    } else if (g.q && g.float) { const s = Math.hypot(v[i], v[i + 2]); if (s > 1e-4) g.q.premultiply(_q.setFromAxisAngle(_a.set(v[i + 2] / s, 0, -v[i] / s), s * h / r * .5)); }
    fast = Math.max(fast, v[i] * v[i] + v[i + 1] * v[i + 1] + v[i + 2] * v[i + 2]);
    const A = g.a; if (Math.abs(p[i] - A[i]) + Math.abs(p[i + 1] - A[i + 1]) + Math.abs(p[i + 2] - A[i + 2]) < .01) { if (++g.still[b] >= 30) { v[i] = v[i + 1] = v[i + 2] = 0; g.awake--; } } // within a centimetre for half a second (a jostle included): asleep
    else { g.still[b] = 0; A[i] = p[i]; A[i + 1] = p[i + 1]; A[i + 2] = p[i + 2]; }
  }
  if (many) { g.dirty = true; g.bq = g.awake ? -1 : 0; } // asleep: bury() starts on the next step
  g.moved += Math.sqrt(fast) * h; g.drawn = false;
}
const _q = new THREE.Quaternion(), _a = new THREE.Vector3(), frac = x => x - Math.floor(x);
function draw(g, all) { // write the bodies that moved since they were last drawn into the mesh
  const { p, d } = g;
  if (g.n > 1) { const a = g.mesh.instanceMatrix.array; let any = all;
    for (let b = 0, i = 0; b < g.n; b++, i += 3) if (all || p[i] !== d[i] || p[i + 1] !== d[i + 1] || p[i + 2] !== d[i + 2]) { a[16 * b + 12] = d[i] = p[i]; a[16 * b + 13] = d[i + 1] = p[i + 1]; a[16 * b + 14] = d[i + 2] = p[i + 2]; any = true; }
    if (any) g.mesh.instanceMatrix.needsUpdate = true; }
  else { g.mesh.position.set(p[0], p[1], p[2]); if (g.q) g.mesh.quaternion.copy(g.q); }
}
// The balls within FINE of the eye are drawn by the fine mesh and shrunk to nothing in the plain one; only a change is uploaded to it.
const FINE = 1.6;
function fine(g) {
  const { p, hi, n } = g, a = g.mesh.instanceMatrix.array, f = g.fine.instanceMatrix.array, c = g.mesh.instanceColor.array, fc = g.fine.instanceColor.array, e = camera.position, m = g.mesh.count;
  let k = 0, changed = false, moved = false;
  for (let b = 0, i = 0; b < n; b++, i += 3) {
    const dx = p[i] - e.x, dy = p[i + 1] - e.y, dz = p[i + 2] - e.z, on = b < m && dx * dx + dy * dy + dz * dz < FINE * FINE ? 1 : 0;
    if (on !== hi[b]) { hi[b] = on; a[16 * b] = a[16 * b + 5] = a[16 * b + 10] = 1 - on; changed = true; }
    if (on) { const j = 16 * k, q = 3 * k; if (f[j + 12] !== p[i] || f[j + 13] !== p[i + 1] || f[j + 14] !== p[i + 2] || fc[q] !== c[i] || fc[q + 1] !== c[i + 1] || fc[q + 2] !== c[i + 2]) { f[j + 12] = p[i]; f[j + 13] = p[i + 1]; f[j + 14] = p[i + 2]; fc[q] = c[i]; fc[q + 1] = c[i + 1]; fc[q + 2] = c[i + 2]; moved = true; } k++; }
  }
  if (changed) g.mesh.instanceMatrix.needsUpdate = true;
  if (moved) for (const [A, w] of [[g.fine.instanceMatrix, 16], [g.fine.instanceColor, 3]]) { A.clearUpdateRanges(); A.addUpdateRange(0, w * k); A.needsUpdate = true; } // only the first k are drawn
  g.fine.count = k;
}
// Settle a freshly poured group before anyone sees it (the pit, at load): step it with no one near until it sleeps, at most `max` steps.
function settle(g, max) { const nobody = { x: 1e9, z: 1e9 }; const cap = g.cap; g.cap = .8; for (let i = 0; i < max && g.awake; i++) stepGroup(g, nobody); g.cap = cap; while (g.bq >= 0) bury(g); draw(g, 1); g.moved = 0; } // gently: no ball is thrown out
for (const g of groups) { g.awake = g.n; if (g.pour) settle(g, g.pour); else g.awake = 0, g.still.fill(30); draw(g, 1); }

// ---------- rings: float on the waves, pushed by the body, the water's flow and each other; bounce softly off the pool's sides ----------
const RO = .55, RT = .13; // outer radius, tube radius
const floaters = rings.map((m, i) => ({ m, i, w: pondAt(m.position.x, m.position.z), x: m.position.x, z: m.position.z, y: m.position.y, vx: 0, vz: 0, vy: 0, ax: 0, az: 0, wx: 0, wz: 0, yaw: i * 2.1, wy: 0, shade: [1e9, 0, 0, 0, 0] }));
for (const w of [...floaters.map(f => f.w), ...groups.filter(g => g.float).map(g => pondAt(g.p[0], g.p[2]))]) if (w) w.twin.used = true; // the pools whose wave copy something rides
for (const f of floaters) f.solids = colliders.filter(c => c[2] > f.w.rect.x - 1 && c[0] < f.w.rect.z + 1 && c[3] > f.w.rect.y - 1 && c[1] < f.w.rect.w + 1);
function stepRing(f, me) {
  const T = f.w.twin, t = uTime.value, e = .42, at = (x, z) => heave(T.sample(x, z)); // heave and lean five times the copy's: the drawn water's slopes are drawn ten times steeper than the waves (water.js), and the ring should agree with what is seen
  const hm = (at(f.x + e, f.z) + at(f.x - e, f.z) + at(f.x, f.z + e) + at(f.x, f.z - e)) / 4, sx = (at(f.x + e, f.z) - at(f.x - e, f.z)) / (2 * e), sz = (at(f.x, f.z + e) - at(f.x, f.z - e)) / (2 * e);
  const flow = T.sample(f.x, f.z);
  // rides the surface on a soft spring; leans with its slope
  f.vy += (81 * (WY + .05 + hm - f.y) - 9 * f.vy) * h; f.y += f.vy * h; f.y = Math.min(WY + .12, Math.max(WY - .02, f.y)); // never sinks, never flies
  const lean = Math.hypot(sx, sz), q = lean > .15 ? .15 / lean : 1, tx = Math.atan(sx * q), tz = -Math.atan(sz * q); // leans with the slope, at most .15 rad any way: more would lift its rim clear of the flat drawn water
  f.wx += (49 * (tx - f.ax) - 8 * f.wx) * h; f.wz += (49 * (tz - f.az) - 8 * f.wz) * h; f.ax += f.wx * h; f.az += f.wz * h;
  // carried by the water's flow, down the wave faces and by a faint draught over the pool; slowed by drag
  const cx = .025 * Math.sin(t * .13 + f.z * .5 + f.i * 2), cz = .025 * Math.cos(t * .11 + f.x * .4 + f.i * 3);
  f.vx += ((flow.ux * 1.4 - G * .4 * flow.gx + cx) - f.vx) * 1.2 * h; f.vz += ((flow.uz * 1.4 - G * .4 * flow.gz + cz) - f.vz) * 1.2 * h;
  f.wy += (.04 * Math.sin(t * .07 + f.i) - f.wy) * .5 * h; // and slowly turns
  // the body: water pushed by the legs carries it; touching, it is shoved off at the legs' speed
  const dx = f.x - me.x, dz = f.z - me.z, d = Math.hypot(dx, dz), wet = me.feet < f.y + RT && me.feet + 1.75 > f.y - RT;
  if (wet && d < 1.4) { const k = (1 - d / 1.4) * 1.5 * h; f.vx += (me.vx - f.vx) * k; f.vz += (me.vz - f.vz) * k; }
  if (wet && d < RO + .3) { const nx = dx / (d || 1), nz = dz / (d || 1), push = RO + .3 - d, vn = me.vx * nx + me.vz * nz, own = f.vx * nx + f.vz * nz;
    f.x += nx * push * .85; f.z += nz * push * .85; me.x -= nx * push * .15; me.z -= nz * push * .15; me.shoved = true;
    if (own < vn * 1.1) { f.vx += nx * (vn * 1.1 - own); f.vz += nz * (vn * 1.1 - own); }
    f.wy += (dx * me.vz - dz * me.vx) * .05; }
  if (me.splash && d < 3.5) { const k = .5 * (1 - d / 3.5) / (d || 1); f.vx += dx * k; f.vz += dz * k; } // a jump in throws water outward
  f.x += f.vx * h; f.z += f.vz * h; f.yaw += f.wy * h;
  // the pool's sides and anything standing in the water; then the other rings
  for (const c of f.solids) if (f.y + RT > c[4] && f.y - RT < c[5] && clear(c, f.x, null, f.z, RO)) { f.x += out.x; f.z += out.z; const l = Math.hypot(out.x, out.z), nx = out.x / l, nz = out.z / l, vn = f.vx * nx + f.vz * nz;
    if (vn < 0) { f.vx -= 1.3 * vn * nx; f.vz -= 1.3 * vn * nz; } }
  const R = f.w.rect; f.x = Math.min(R.z - RO, Math.max(R.x + RO, f.x)); f.z = Math.min(R.w - RO, Math.max(R.y + RO, f.z));
  for (const g of floaters) if (g !== f && g.w === f.w) { const ex = f.x - g.x, ez = f.z - g.z, l = Math.hypot(ex, ez);
    if (l < 2 * RO && l > 1e-6) { const nx = ex / l, nz = ez / l, s = (2 * RO - l) / 2, vn = (f.vx - g.vx) * nx + (f.vz - g.vz) * nz;
      f.x += nx * s; f.z += nz * s; g.x -= nx * s; g.z -= nz * s; if (vn < 0) { const j = -.65 * vn; f.vx += nx * j; f.vz += nz * j; g.vx -= nx * j; g.vz -= nz * j; } } }
  if (wet) { const ex = f.x - me.x, ez = f.z - me.z, l = Math.hypot(ex, ez); if (l < RO + .3) { const k = (RO + .3 - l) / (l || 1); me.x -= ex * k; me.z -= ez * k; me.shoved = true; } } // held by a wall: the body stops
  const sp = Math.hypot(f.vx, f.vz) + Math.abs(f.vy) * 2;
  if (sp > .04) wakes.push([f.w, f.x + f.vx / sp * .4, f.z + f.vz / sp * .4, Math.min(sp, 1.5) * .0012]); // it leaves its own small ripples
}

// One 60 Hz step of everything loose near the player. me: { x, z, feet, vx, vz, hit }; may move me.x, me.z (and set me.shoved).
function stepLoose(me) {
  const t0 = performance.now();
  wakes.length = 0;
  for (const g of groups) stepGroup(g, me);
  for (const f of floaters) if (f.w.visible) stepRing(f, me);
  ms += performance.now() - t0;
}
function drawLoose(near) { // once a frame, after the steps: meshes, and the shadows of whatever moved. near: the ids of the zones the player stands in or near (lights.js weights)
  const t0 = performance.now();
  for (const g of groups) { if (g.seen) g.mesh.visible = near.some(id => g.seen.includes(id)); /* drawn only where it can be seen from, as pools are */ if (g.shown) g.mesh.count = g.awake || g.inside || g.bq >= 0 ? g.n : g.shown; }
  for (const g of groups) if (g.fine && (g.fine.visible = g.mesh.visible)) fine(g); // every frame: the eye moves when the balls don't
  for (const g of groups) if (!g.drawn) { draw(g, 0); g.drawn = true;
    if (g.moved > .01) { const [x1, z1, x2, z2] = g.region; if (g.n > 1) reshade((x1 + x2) / 2, 0, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1) / 2); else reshade(g.p[0], g.p[1], g.p[2], g.r); g.moved = 0; } }
  for (const f of floaters) { f.m.position.set(f.x, f.y, f.z); f.m.rotation.set(f.az, f.yaw, f.ax);
    const s = f.shade; if (near.includes(f.w.zone.id) && Math.hypot(f.x - s[0], f.z - s[2]) + Math.abs(f.y - s[1]) + .5 * (Math.abs(f.ax - s[3]) + Math.abs(f.az - s[4])) > .04) { reshade(f.x, f.y, f.z, RO); f.shade = [f.x, f.y, f.z, f.ax, f.az]; } } // its pose when its shadow was last drawn; only from its own room or near its doorways, as its slow drift can't be seen from further through one
  const took = ms + performance.now() - t0; ms = 0; return took;
}

// ?dev only: dev.reset() puts the loose things back as they were when the level finished loading (tools/shots.mjs, one load for many photos)
const snap = new URLSearchParams(location.search).has('dev') ? { g: groups.map(g => Object.fromEntries(Object.entries(g).filter(([k, v]) => k !== 'hi' && (ArrayBuffer.isView(v) || typeof v === 'number' || typeof v === 'boolean')).map(([k, v]) => [k, ArrayBuffer.isView(v) ? v.slice() : v]))),
  f: floaters.map(f => ({ ...f, shade: f.shade.slice() })) } : null; // 'hi' (which balls the fine mesh draws) is kept: it matches the instance matrices, and fine() re-derives it
function resetLoose() {
  groups.forEach((g, i) => { for (const [k, v] of Object.entries(snap.g[i])) if (ArrayBuffer.isView(v)) g[k].set(v); else g[k] = v; g.dirty = true; g.drawn = false; g.moved = 1; draw(g, 1); }); // moved: the lamps' shadows are drawn again
  floaters.forEach((f, i) => Object.assign(f, snap.f[i], { shade: snap.f[i].shade.slice() }));
  wakes.length = 0;
}

export { groups, floaters, wakes, stepLoose, drawLoose, resetLoose };
