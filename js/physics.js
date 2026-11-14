// Loose things: balls (the soft play pit's, the beach balls, the field's ball) and the swim rings. player.js steps them at a fixed
// 60 Hz with the player's body; only dev.step() or the frame loop moves time, so a held game is deterministic.
// Balls are position-based: each step they fall, move, are pushed out of the solids, each other and the body, and their speed is
// what that did to them. Still balls sleep and cost nothing; a group whose balls all sleep is skipped while the player is away.
// Rings float on the CPU's copy of the waves (water.js), so they rise, tilt and drift with what the GPU draws without a readback.
import * as THREE from 'three';
import { renderer, uTime, WY, inR } from './core.js';
import { colliders, flats, loose, rings, clear, out } from './build.js';
import { ponds } from './water.js';
import { lights } from './lights.js';
import { sun } from './sky.js';

const h = 1 / 60, G = 9.8;
const pondAt = (x, z) => ponds.find(w => inR(x, z, w.rect.x, w.rect.y, w.rect.z, w.rect.w));
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
  }
  if (s.spin) g.q = new THREE.Quaternion();
  if (n > 1) g.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3((x1 + x2) / 2, .5, (z1 + z2) / 2), Math.hypot(x2 - x1, 3, z2 - z1) / 2); // the region's: wherever its balls go, so they are culled with the room
  draw(g, 1);
  return g;
});
const cellOf = (g, x, y, z) => { const i = Math.min(g.gx - 1, Math.max(0, Math.floor((x - g.x1) / (2 * g.r)))), j = Math.min(g.gy - 1, Math.max(0, Math.floor((y + 1.2) / (2 * g.r)))), k = Math.min(g.gz - 1, Math.max(0, Math.floor((z - g.z1) / (2 * g.r)))); return [i, j, k]; };
function rebuild(g) {
  g.head.fill(-1);
  for (let b = 0; b < g.n; b++) { const [i, j, k] = cellOf(g, g.p[3 * b], g.p[3 * b + 1], g.p[3 * b + 2]), c = i + g.gx * (j + g.gy * k); g.next[b] = g.head[c]; g.head[c] = b; }
  g.dirty = false;
}
function each(g, x, y, z, rad, f) { // f(ball) for every ball whose cell is within rad of (x, y, z)
  const s = 2 * g.r, [i0, j0, k0] = cellOf(g, x - rad, y - rad, z - rad), [i1, j1, k1] = cellOf(g, x + rad, y + rad, z + rad);
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let b = g.head[i + g.gx * (j + g.gy * k)]; b >= 0; b = g.next[b]) f(b);
}
// Once a heap is at rest, the balls with three others resting on them can't be seen from outside it: they go to the end of the
// list and are not drawn (mesh.count) until the heap moves or the player is down in it.
function bury(g) {
  if (g.dirty) rebuild(g);
  const { p, n } = g, hid = new Uint8Array(n);
  for (let b = 0; b < n; b++) { let above = 0; each(g, p[3 * b], p[3 * b + 1] + .15, p[3 * b + 2], .2, c => { const dy = p[3 * c + 1] - p[3 * b + 1]; if (dy > .05 && dy < .3 && Math.hypot(p[3 * c] - p[3 * b], p[3 * c + 2] - p[3 * b + 2]) < .17) above++; }); hid[b] = above >= 3; }
  const order = [...Array(n).keys()].sort((a, b) => hid[a] - hid[b] || a - b), col = g.mesh.instanceColor.array.slice();
  for (const k of ['p', 'o', 'd', 'a', 'v']) { const a = g[k].slice(); order.forEach((b, i) => { g[k][3 * i] = a[3 * b]; g[k][3 * i + 1] = a[3 * b + 1]; g[k][3 * i + 2] = a[3 * b + 2]; }); }
  for (const k of ['still', 'contact']) { const a = g[k].slice(); order.forEach((b, i) => g[k][i] = a[b]); }
  order.forEach((b, i) => { col[3 * i] = g.mesh.instanceColor.array[3 * b]; col[3 * i + 1] = g.mesh.instanceColor.array[3 * b + 1]; col[3 * i + 2] = g.mesh.instanceColor.array[3 * b + 2]; });
  g.mesh.instanceColor.array.set(col); g.mesh.instanceColor.needsUpdate = true;
  g.shown = n - hid.reduce((s, h) => s + h, 0); g.dirty = true; draw(g, 1);
}
const wake = (g, b) => { if (g.still[b] >= 30) { g.still[b] = 0; g.awake++; } else g.still[b] = 0; };

// The body as the balls see it: an upright capsule round the legs and hips, radius .22, from 20 cm above the soles to 1.5 m.
const BR = .22;
function legs(g, b, me) {
  const i = 3 * b, x = g.p[i], y = g.p[i + 1], z = g.p[i + 2], cy = Math.min(me.feet + 1.5, Math.max(me.feet + .2, y)), dx = x - me.x, dy = y - cy, dz = z - me.z, d2 = dx * dx + dy * dy + dz * dz, R = BR + g.r;
  if (d2 >= R * R) return false;
  const d = Math.sqrt(d2) || 1e-6, k = (R - d) / d;
  g.p[i] += dx * k; g.p[i + 1] += dy * k; g.p[i + 2] += dz * k;
  return true;
}

function stepGroup(g, me) {
  const near = me.x > g.x1 - 1 && me.x < g.x2 + 1 && me.z > g.z1 - 1 && me.z < g.z2 + 1, many = g.n > 1;
  g.inside = near && me.feet < -.1; // down among the balls: every one may show
  if (g.float && !g.awake) { const w = pondAt(g.p[0], g.p[2]); if (w?.visible) { const t = w.twin.sample(g.p[0], g.p[2]); if (Math.abs(t.h) > .003 || Math.hypot(t.ux, t.uz) > .02) wake(g, 0); } } // a passing wave wakes a float
  if (!g.awake && !near) return;
  if (many && g.dirty) rebuild(g);
  const { p, o, v, r } = g;
  if (near && (Math.hypot(me.vx, me.vz) > .05 || Math.abs(me.vy) > .05 || me.hit)) { // moving legs wake what they touch (still ones leave a resting heap be); a landing throws the balls round the feet up and out
    const touch = b => { const i = 3 * b, dx = p[i] - me.x, dz = p[i + 2] - me.z, dy = p[i + 1] - Math.min(me.feet + 1.5, Math.max(me.feet + .2, p[i + 1])), R = BR + r - .003, d = Math.hypot(dx, dz) + .05;
      if (dx * dx + dy * dy + dz * dz < R * R) { wake(g, b); if (me.vy < -2.5 && dy < .05) { const k = (.5 + .5 * frac(b * .618)) * Math.min(1.5, -me.vy / 4); // falling in: what is under the feet sprays up and out
        v[i] += dx / d * 2.2 * k; v[i + 1] += (1.6 + 2.6 * frac(b * .377)) * k; v[i + 2] += dz / d * 2.2 * k; } }
      else if (me.hit > 2.5 && d < .9 && p[i + 1] < me.feet + .6) { wake(g, b); const k = (1 - d / .9) * (.4 + .6 * frac(b * .618)) * Math.min(1.5, me.hit / 4); // and the landing heaves the ones round the legs
        v[i] += dx / d * 1.8 * k; v[i + 1] += (1.2 + 1.8 * frac(b * .377)) * k; v[i + 2] += dz / d * 1.8 * k; } };
    if (many) each(g, me.x, me.feet + .8, me.z, 1, touch); else touch(0);
  }
  if (!g.awake) return;
  let fast = 0;
  for (let b = 0; b < g.n; b++) if (g.still[b] < 30) { // fall and move
    const i = 3 * b; o[i] = p[i]; o[i + 1] = p[i + 1]; o[i + 2] = p[i + 2];
    v[i + 1] -= G * h;
    if (g.float) { const w = pondAt(p[i], p[i + 2]); if (w) { const t = w.twin.sample(p[i], p[i + 2]), s = WY + t.h * 5, sub = Math.min(1, Math.max(0, (s - p[i + 1] + r) / (2 * r))); // how much of it is under water
      if (sub > 0) { v[i + 1] += G * sub / g.float * h; const k = Math.min(1, (.6 + sub * 4) * h), kv = Math.min(1, (2 + sub * 10) * h); // it floats, the water drags it along with its flow
        v[i] += (t.ux * 1.4 - G * .3 * t.gx - v[i]) * k; v[i + 2] += (t.uz * 1.4 - G * .3 * t.gz - v[i + 2]) * k; v[i + 1] -= v[i + 1] * kv;
        const sp = Math.hypot(v[i], v[i + 1], v[i + 2]); if (sp > .08) wakes.push([w, p[i], p[i + 2], Math.min(sp, 2) * .0015 * sub]); } } }
    const sp = Math.hypot(v[i], v[i + 1], v[i + 2]), top = g.cap || 7; if (sp > top) { v[i] *= top / sp; v[i + 1] *= top / sp; v[i + 2] *= top / sp; }
    p[i] += v[i] * h; p[i + 1] += v[i + 1] * h; p[i + 2] += v[i + 2] * h;
  }
  for (let it = 0; it < 2; it++) for (let b = 0; b < g.n; b++) if (g.still[b] < 30) { // push out of the world, each other and the legs
    const i = 3 * b; let x = p[i], y = p[i + 1], z = p[i + 2], hit = 0;
    const fy = g.floor(x, z); // the floor: along its slope's normal where it slopes (the field), so a ball on a slope rolls down it
    if (y - r < fy + .01) { let nx = 0, ny = 1, nz = 0; if (g.slope) { nx = g.floor(x - .1, z) - g.floor(x + .1, z); nz = g.floor(x, z - .1) - g.floor(x, z + .1); ny = .2; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; }
      const pen = r - (y - fy) * ny; if (pen > 0) { x += nx * pen; y += ny * pen; z += nz * pen; } hit = 1; }
    const cl = g.cells[Math.min(g.cw - 1, Math.max(0, Math.floor((x - g.x1) / .5))) + g.cw * Math.min(g.ch - 1, Math.max(0, Math.floor((z - g.z1) / .5)))];
    for (const c of cl) if (y + r > c[4] - .01 && y - r < c[5] + .01 && clear(c, x, y, z, r + .005)) { if (out.y > 0) hit = 1; if (clear(c, x, y, z, r)) { x += out.x; y += out.y; z += out.z; } }
    p[i] = x; p[i + 1] = y; p[i + 2] = z;
    if (many) each(g, x, y, z, 2 * r, c => { if (c === b) return; const j = 3 * c, dx = p[i] - p[j], dy = p[i + 1] - p[j + 1], dz = p[i + 2] - p[j + 2], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= 4.2 * r * r || d2 < 1e-12) return;
      const d = Math.sqrt(d2), e = 2 * r - d;
      if (dy > .5 * d) hit = 1; // resting on it (or just touching)
      if (e <= 0) return;
      if (g.still[c] >= 30 && e > .004) wake(g, c); // a hard knock wakes a sleeping ball; a light one finds it as firm as the floor
      const w = g.still[c] >= 30 ? 1 : .5 + .4 * dy / d, k = e * w / d, kj = e * (1 - w) / d; // the upper ball gives way more, so a pile carries its weight down to the floor in one step
      p[i] += dx * k; p[i + 1] += dy * k; p[i + 2] += dz * k; p[j] -= dx * kj; p[j + 1] -= dy * kj; p[j + 2] -= dz * kj; });
    if (me.feet !== undefined && legs(g, b, me) && g.solid) g.kick = b + 1;
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
    if (g.contact[b]) {
      if (oy < -1.2 && v[i + 1] > oy * -.2) v[i + 1] = -oy * g.bounce; // a fall onto something bounces
      const s = Math.hypot(v[i], v[i + 2]), f = s > 1e-6 ? Math.max(0, s - g.grip * h) / s : 0; v[i] *= f; v[i + 2] *= f; // rolling resistance
      if (g.q && s > 1e-4) g.q.premultiply(_q.setFromAxisAngle(_a.set(v[i + 2] / s, 0, -v[i] / s), s * h / r)); // rolls without slipping
    } else if (g.q && g.float) { const s = Math.hypot(v[i], v[i + 2]); if (s > 1e-4) g.q.premultiply(_q.setFromAxisAngle(_a.set(v[i + 2] / s, 0, -v[i] / s), s * h / r * .5)); }
    fast = Math.max(fast, v[i] * v[i] + v[i + 1] * v[i + 1] + v[i + 2] * v[i + 2]);
    const A = g.a; if (Math.abs(p[i] - A[i]) + Math.abs(p[i + 1] - A[i + 1]) + Math.abs(p[i + 2] - A[i + 2]) < .01) { if (++g.still[b] >= 30) { v[i] = v[i + 1] = v[i + 2] = 0; g.awake--; } } // within a centimetre for half a second (a jostle included): asleep
    else { g.still[b] = 0; A[i] = p[i]; A[i + 1] = p[i + 1]; A[i + 2] = p[i + 2]; }
  }
  if (many) { g.dirty = true; if (!g.awake) bury(g); }
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
// Settle a freshly poured group before anyone sees it (the pit, at load): step it with no one near until it sleeps, at most `max` steps.
function settle(g, max) { const nobody = { x: 1e9, z: 1e9 }; g.cap = .8; for (let i = 0; i < max && g.awake; i++) stepGroup(g, nobody); g.cap = 0; draw(g, 1); g.moved = 0; } // gently: no ball is thrown out
for (const g of groups) { g.awake = g.n; if (g.pour) settle(g, g.pour); else g.awake = 0, g.still.fill(30); draw(g, 1); }

// ---------- rings: float on the waves, pushed by the body, the water's flow and each other; bounce softly off the pool's sides ----------
const RO = .55, RT = .13; // outer radius, tube radius
const floaters = rings.map((m, i) => ({ m, i, w: pondAt(m.position.x, m.position.z), x: m.position.x, z: m.position.z, y: m.position.y, vx: 0, vz: 0, vy: 0, ax: 0, az: 0, wx: 0, wz: 0, yaw: i * 2.1, wy: 0, shade: [1e9, 0, 0, 0, 0] }));
for (const f of floaters) f.solids = colliders.filter(c => c[2] > f.w.rect.x - 1 && c[0] < f.w.rect.z + 1 && c[3] > f.w.rect.y - 1 && c[1] < f.w.rect.w + 1);
function stepRing(f, me) {
  const T = f.w.twin, t = uTime.value, e = .42, at = (x, z) => T.sample(x, z).h * 5; // heave and lean five times the copy's: the drawn water's slopes are drawn ten times steeper than the waves (water.js), and the ring should agree with what is seen
  const hm = (at(f.x + e, f.z) + at(f.x - e, f.z) + at(f.x, f.z + e) + at(f.x, f.z - e)) / 4, sx = (at(f.x + e, f.z) - at(f.x - e, f.z)) / (2 * e), sz = (at(f.x, f.z + e) - at(f.x, f.z - e)) / (2 * e);
  const flow = T.sample(f.x, f.z);
  // rides the surface on a soft spring; leans with its slope
  f.vy += (81 * (WY + .05 + hm - f.y) - 9 * f.vy) * h; f.y += f.vy * h; f.y = Math.min(WY + .12, Math.max(WY - .02, f.y)); // never sinks, never flies
  const tx = Math.max(-.3, Math.min(.3, Math.atan(sx))), tz = Math.max(-.3, Math.min(.3, -Math.atan(sz)));
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
function drawLoose(zone) { // once a frame, after the steps: meshes, and the shadows of whatever moved. zone: the player's
  const t0 = performance.now();
  for (const g of groups) { if (g.seen) g.mesh.visible = g.seen.includes(zone); /* drawn only where it can be seen from, as pools are */ if (g.shown) g.mesh.count = g.awake || g.inside ? g.n : g.shown; }
  for (const g of groups) if (!g.drawn) { draw(g, 0); g.drawn = true;
    if (g.moved > .01) { const [x1, z1, x2, z2] = g.region; if (g.n > 1) reshade((x1 + x2) / 2, 0, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1) / 2); else reshade(g.p[0], g.p[1], g.p[2], g.r); g.moved = 0; } }
  for (const f of floaters) { f.m.position.set(f.x, f.y, f.z); f.m.rotation.set(f.az, f.yaw, f.ax);
    const s = f.shade; if (Math.hypot(f.x - s[0], f.z - s[2]) + Math.abs(f.y - s[1]) + .5 * (Math.abs(f.ax - s[3]) + Math.abs(f.az - s[4])) > .01) { reshade(f.x, f.y, f.z, RO); f.shade = [f.x, f.y, f.z, f.ax, f.az]; } } // its pose when its shadow was last drawn
  const took = ms + performance.now() - t0; ms = 0; return took;
}

export { groups, floaters, wakes, stepLoose, drawLoose };
