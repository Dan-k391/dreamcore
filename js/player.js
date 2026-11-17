// The player: controls, collision and the frame step.
import * as THREE from 'three';
import { renderer, camera, uTime, V, WY, zones, inR } from './core.js';
import { colliders, emitters, warps, ladders, doors, ends, side, across, carry, spin, live, behind, reveal, floorH as bedH, pools, clear, out, near } from './build.js';
import { setSky, sun } from './sky.js';
import { ponds, sheets, ripple, resetWater } from './water.js';
import { relight, zone0, lights, weights } from './lights.js';
import { composer, look, atmos, bloom, film } from './post.js';
import { sfx, startAudio } from './audio.js';
import { wakes, stepLoose, drawLoose, resetLoose, reshade } from './physics.js';

// ---------- walking ----------
const canvas = renderer.domElement, o = document.getElementById('o'), keys = {}, eu = new THREE.Euler(0, 0, 0, 'YXZ');
const locked = () => document.pointerLockElement === canvas;
let free = false, tries = 0, again; // free: this window forbids capture, so the bare cursor steers. Nothing turns the view except the mouse moving or a turn key.
const setFree = on => { free = on; canvas.style.cursor = on ? 'none' : ''; document.getElementById('x').hidden = document.getElementById('h').hidden = !on; };
const turn = (dx, dy) => { eu.setFromQuaternion(camera.quaternion); eu.y -= dx; eu.x = Math.max(-1.5, Math.min(1.5, eu.x - dy)); camera.quaternion.setFromEuler(eu); };
// Raw (unadjusted) movement avoids the random jumps Windows cursor acceleration and display scaling cause under capture.
// Asking for the mouse can be refused for a moment (browsers do for about a second after Esc) or for good (an embedded
// window that forbids it), and the two can't be told apart. So ask again a few times, and only then steer with the bare
// cursor; a click in that mode asks once more. A refusal can arrive twice (rejected promise and error event): one timer covers both.
function refused(e) {
  clearTimeout(again);
  if (locked()) return;
  if (e?.name === 'WrongDocumentError' || tries >= 4) setFree(true); else again = setTimeout(capture, 450);
}
function capture() {
  tries++;
  try { canvas.requestPointerLock({ unadjustedMovement: true })?.catch(e => e.name === 'NotSupportedError' ? canvas.requestPointerLock()?.catch(refused) : refused(e)); } catch (e) { refused(e); }
}
const paused = () => o.style.display !== 'none', letGo = () => { for (const c in keys) keys[c] = 0; };
o.onclick = () => { o.style.display = 'none'; sfx || startAudio(zone); tries = 0; capture(); };
canvas.addEventListener('click', () => { if (free) { tries = 3; capture(); } });
document.addEventListener('pointerlockerror', () => refused());
document.addEventListener('pointerlockchange', () => { clearTimeout(again); if (locked()) setFree(false); else if (!free) { o.style.display = ''; letGo(); } }); // Esc pauses
addEventListener('blur', letGo); // a key held while the window loses focus never reports its release
addEventListener('mousemove', e => { // mouse look: captured pointer where the browser allows it, bare cursor movement where it doesn't
  if (paused() || (!locked() && !free)) return; // paused: the settings panel is open under the bare cursor
  const m = free ? 60 : 250, cl = v => Math.max(-m, Math.min(m, v)); // drop the one-event jumps browsers report on re-entry or under capture
  turn(cl(e.movementX) * .0022 * Math.min(72, camera.fov) / 72, cl(e.movementY) * .0022 * Math.min(72, camera.fov) / 72); // slower while zoomed in, the same while running widens the view
});
addEventListener('keydown', e => { if (paused()) return; keys[e.code] = 1; if (e.code === 'Space' || e.ctrlKey && /^Key[WASDEC]$/.test(e.code)) e.preventDefault(); if (e.code === 'KeyM') sfx?.mute(); });
addEventListener('keyup', e => keys[e.code] = 0);
addEventListener('beforeunload', e => { if (keys.ControlLeft || keys.ControlRight) e.preventDefault(); }); // crouching forward is Ctrl+W, which a page cannot stop: the browser asks before it closes the tab
document.getElementById('s').textContent = 'click to enter  ·  wasd walk  ·  mouse look  ·  space jump (hold to hop)  ·  shift run  ·  ctrl crouch  ·  c zoom  ·  e open  ·  m mute  ·  v noclip';
let zone = zone0; // the zone you are in

// The body: an upright cylinder of radius R from the soles (feet) up 1.75 m. A solid blocks it sideways where it overlaps the body
// above step height (so low things are stepped onto and high things walked under; the top 5 cm of the head ducks), its top is
// ground wherever it is under the middle RS of the body, and its underside stops a jump.
// Deep water holds you up: over a pool floor deeper than FLOAT the feet tread water there, the eye 18 cm above the surface (the great baths' deep end)
const FLOAT = WY + .18 - 1.6, floorH = (x, z) => { const f = bedH(x, z); return f < FLOAT && pools.some(q => inR(x, z, q[0], q[1], q[2], q[3])) ? FLOAT : f; };
const R = .3, RS = .22, STEP = .35, TALL = 1.75;
// The jump: rising pulls less than falling, so it has weight; the take-off speed keeps the peak where today's ledges and seals expect it
// (0.84 m, 4.3 m/s against 11). In the air nothing drags: the keys only add speed along a direction you're moving slower than AIR_CAP
// in (the classic air-strafe rule), up to TOP, which is 6 m/s × sqrt(16 / 11): no jump lands farther, at any height, than a 6 m/s run did before.
const G_UP = 16, G_DOWN = 24, JUMP = 4.3 * Math.sqrt(G_UP / 11), AIR = 10, AIR_CAP = .76, TOP = 7.2;
const blocks = (c, feet) => c[5] > feet + STEP && c[4] < feet + 1.7;
// A body straddling a portal's plane, inside its opening, meets the solids of both sides: this side's that are not wholly behind the
// plane, and the far side's (in its own space, the push brought back) that are not wholly behind the far end.
const straddle = (x, z, feet) => ends.find(e => Math.abs(side(e, x, z)) < R && Math.abs(across(e, x, z)) < e.w / 2 + R && feet < e.p.y + e.h && feet + TALL > e.p.y);
function overlaps(p, feet, r, push) { // every solid the body of radius r overlaps; push: move it out of each as found
  const g = straddle(p.x, p.z, feet); let hit = false;
  for (const c of colliders) if (near(c, p.x, p.z, r) && blocks(c, feet) && !(g && behind(g, c)) && clear(c, p.x, null, p.z, r)) { if (!push) return true; p.x += out.x; p.z += out.z; hit = true; }
  if (g) { const [qx, qz] = carry(g, p.x, p.z), f = feet + g.to.p.y - g.p.y;
    for (const c of colliders) if (near(c, qx, qz, r) && blocks(c, f) && !behind(g.to, c) && clear(c, qx, null, qz, r)) { if (!push) return true; const [dx, dz] = spin(g.to, out.x, out.z); p.x += dx; p.z += dz; hit = true; break; } } // one far solid a pass: the next pass re-carries the moved body
  return hit;
}
function collide(p, feet = 0) { // push the body out of every solid it overlaps; a few passes settle corners between solids
  for (let pass = 0; pass < 4; pass++) if (!overlaps(p, feet, R, true)) return true;
  return !overlaps(p, feet, R - .002, false); // false: still inside something
}
const floorVia = (x, z, fx, fz) => { // the floor at (x, z) as reached from (fx, fz): through a portal when the step between them crosses its opening
  for (const e of ends) { const a = side(e, fx, fz), b = side(e, x, z); if (!(a >= 0 && b < 0)) continue; const t = a / (a - b);
    if (Math.abs(across(e, fx + (x - fx) * t, fz + (z - fz) * t)) < e.w / 2) { const [qx, qz] = carry(e, x, z); return floorH(qx, qz) - e.to.p.y + e.p.y; } }
  return floorH(x, z);
};
const groundAt = (x, z, feet) => { // the highest floor or solid top under the body that a step from `feet` reaches
  let g = floorH(x, z);
  for (const c of colliders) if (c[5] > g && c[5] <= feet + STEP && near(c, x, z, RS) && clear(c, x, null, z, RS)) g = c[5];
  return g;
};
console.assert(floorH(0, -12) === -1.2 && floorH(0, -6.2) === -.3 && floorH(15, -12) === -.3 && floorH(24.2, -12) === -.6 && floorH(30, -12) === -1.2 && floorH(0, 10) === 0 && floorH(23, 25) === -1.2 && floorH(23, 34.8) === -.3 && floorH(24, 50) === -.6
  && floorH(15, 31) === -1 && floorH(-36, 34) === -.85 && floorH(-33.3, 34) === -.29 && floorH(700, 649.4) === 5 && floorH(35.2, 49.4) === -.3 && Math.abs(floorH(3.8, 667)) < 1e-9
  && (q => collide(q) && q.z > 1.29)(V(5, 0, .6)) && Object.values(zones).every(z => inR(z.probe.x, z.probe.z, ...z.box)) && emitters.every(e => inR(e.p.x, e.p.z, ...e.zone.box)), 'level self-check failed');

const vel = new THREE.Vector2(), UP = new THREE.Vector3(0, 1, 0);
let stride = 0, foot = 0, feet = floorH(camera.position.x, camera.position.z), vy = 0, air = false, grip = false, drop = 0, simT = 0, hitP = 0, splashP = false, fallP = 0, coy = 0, buf = 0, wet = false, spaceWas = 0, lag = 0, dip = 0, dipV = 0, duck = 0; // feet: height of the player's soles; coy, buf: jump grace times; lag, dip: the eye's easing and landing dip
// Noclip (V, the owner's cheat): no gravity, solids, water, ladders or passages; you fly where you look, Space up, X down, 12 m/s (30 running).
// Loose things and footsteps ignore a flying body. Turning it off somewhere you couldn't stand (inside a solid or a floor, above a ceiling or a
// roof, or outside every zone) puts you back where it was turned on; anywhere else gravity takes over from where you are.
let fly = false, fvy = 0, from = null, vWas = 0;
const bod = {}; // the body's state for the sound, one object filled each frame
const cue = document.body.appendChild(document.createElement('div')); cue.hidden = true; cue.textContent = 'noclip';
cue.style.cssText = 'position:fixed;left:16px;top:14px;font-size:11px;letter-spacing:.3em;color:#f2e4c4;opacity:.6;pointer-events:none';
const inside = (x, z, f) => overlaps(V(x, 0, z), f, R - .002, false);
const setFly = on => { const p = camera.position;
  if (on) from = { x: p.x, z: p.z, feet };
  else { const fl = floorH(p.x, p.z), top = colliders.filter(c => c[5] <= feet + STEP && near(c, p.x, p.z, RS) && clear(c, p.x, null, p.z, RS)).sort((c, d) => d[5] - c[5])[0];
    if (inside(p.x, p.z, feet) || feet < fl - .05 || top?.[5] > fl && top[4] > fl + TALL || !Object.values(zones).some(q => inR(p.x, p.z, ...q.box))) { p.x = from.x; p.z = from.z; feet = from.feet; } } // the last: you'd land on a roof or a ceiling
  fly = on; cue.hidden = !on; fvy = vy = 0; grip = false; vel.set(0, 0);
};
const place = (x, z, yaw, pitch) => { // teleport: stand at (x, z) facing that way, at rest
  camera.position.x = x; camera.position.z = z; camera.rotation.set(pitch, yaw, 0, 'YXZ');
  feet = floorH(x, z); camera.position.y = feet + 1.62 + eye.lift; vy = lag = dip = dipV = fvy = duck = 0; vel.set(0, 0); air = grip = fly = false; cue.hidden = true; // the eye height too: the lamps are chosen from it before a frame runs (a room 200 m down got ground level's)
};
// ---------- doors (props/metalwork.js door() with o.openable): E swings the one you look at, within reach, open or shut ----------
// The latch is drawn first (the open sound's latch and hinge lead the motion), then the leaf swings over SWING s, eased in and out like a
// heavy leaf, away from whoever opened it (a shut door picks its way from the side you stand; closing goes back the way it came). It is
// solid all the way: a step that would put it into the body is not taken, so it waits against you and moves on once you step clear. A door
// in a portal has a copy in the far space (door(..., { copy })): pressing either moves the one door, both copies at once, tested together.
// Its sounds come from the copy on your side. The close sound's thud (0.3 s in) lands as the leaf shuts.
const SWING = .8, LATCH = .1, REACH = 1.6, _f = new THREE.Vector3();
const ease = u => u * u * (3 - 2 * u);
function inReach() { // the openable door the eye looks at within reach (to its leaf's middle at handle height), roughly facing it
  const p = camera.position; camera.getWorldDirection(_f); let best = null, bd = REACH;
  for (const d of doors) { const c = d.k[0][6], dx = c[0] - p.x, dy = Math.max(d.y + .3, Math.min(d.y + 2, p.y)) - p.y, dz = c[1] - p.z, r = Math.hypot(dx, dz); // across the floor to the leaf's middle; facing it at eye level
    if (r < bd && (dx * _f.x + dy * _f.y + dz * _f.z) / Math.hypot(r, dy) > .6) { best = d; bd = r; } }
  return best;
}
const inSwing = d => { const p = camera.position, at = [[p.x, p.z, feet], ...ends.filter(e => Math.abs(side(e, p.x, p.z)) < 1).map(e => [...carry(e, p.x, p.z), feet + e.to.p.y - e.p.y])]; // the body here, and taken through a portal it is near
  return !fly && d.k.some(k => at.some(([x, z, f]) => blocks(k, f) && near(k, x, z, R) && clear(k, x, null, z, R))); };
let eWas = 0;
const mine = q => q.copy && Math.abs(q.copy.y - camera.position.y) < Math.abs(q.y - camera.position.y) ? q.copy : q; // the copy in the space the eye is in
function stepDoors(dt, press) {
  const d = press && inReach(), q = d && (d.of || d), p = camera.position;
  if (q) { if (!q.u) q.set(0, (p.x - d.at[0]) * Math.sin(d.ry) + (p.z - d.at[1]) * Math.cos(d.ry) > 0 ? 1 : -1); // shut: it will swing away from you (on the leaf's +z side: to -z); a copy's space turns with it
    q.to = 1 - q.to; q.wait = q.to ? LATCH : 0; q.thud = false; if (q.to) { const r = mine(q), c = r.k[0][6]; sfx?.play(`door.${q.kind}.open`, c[0], r.y + 1.05, c[1]); } }
  for (const q of doors) { if (q.of || q.u === q.to) continue;
    if (q.wait > 0) { q.wait -= dt; continue; }
    const u = Math.max(0, Math.min(1, q.u + (q.to ? dt : -dt) / SWING)), was = q.f; q.set(ease(u));
    if (inSwing(q) || q.copy && inSwing(q.copy)) { q.set(was); continue; } // the body is in its way (on either side of the portal): it waits
    q.u = u; for (const r of [q, q.copy]) if (r) { const c = r.k[0][6]; reshade(c[0], r.y + 1.1, c[1], 1.3); }
    if (!q.to && !q.thud && u * SWING <= .3) { q.thud = true; const r = mine(q), c = r.k[0][6]; sfx?.play(`door.${q.kind}.close`, c[0], r.y + 1.05, c[1]); } }
}
const eye = { lift: 0 }; // metres added to the eye height; only dev.lift (?dev) changes it
// Where the body will be in t s at this speed (its place once a lamp swap, 1/3 s out and 1/3 s in, is done), taken through an open portal (or a door being opened) on the way, stopped in a shut one's plane
const ahead = V(0, 0, 0), aheadOf = (p, t) => { let x = p.x + vel.x * t, z = p.z + vel.y * t, y = p.y; ahead.through = false;
  for (const e of ends) { const a = side(e, p.x, p.z), b = side(e, x, z); if (!(a >= 0 && b < 0) || Math.abs(across(e, p.x + (x - p.x) * a / (a - b), p.z + (z - p.z) * a / (a - b))) > e.w / 2) continue;
    if (!live(e) && !(e.door.of || e.door).to) return ahead.set(p.x + (x - p.x) * a / (a - b), y, p.z + (z - p.z) * a / (a - b)); if (e.door && b > -2) { x -= e.n.x * (2 + b); z -= e.n.z * (2 + b); } [x, z] = carry(e, x, z); y += e.to.p.y - e.p.y; ahead.through = true; break; } // through a door: at least 2 m in, where the room's lamps are ranked from as you step through
  return ahead.set(x, y, z); };
const frame = dt => { // one game frame of dt seconds: the loop below passes the real time, dev.step() a fixed one
  const p = camera.position, k = c => keys[c] ? 1 : 0, sp = vel.length();
  uTime.value += dt;
  if (k('KeyV') && !vWas) setFly(!fly); vWas = k('KeyV');
  const cl01 = v => Math.max(0, Math.min(1, v)), fov = k('KeyC') ? 22 : 72 + 4 * cl01((sp - 2.85) / 3.15) + 3 * cl01((sp - 6) / (TOP - 6)); // hold C to zoom in; running widens the view up to 4 degrees, hop speed 3 more
  if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * (fov < 70 || camera.fov < 70 ? 12 : 3)); camera.updateProjectionMatrix(); }
  const pool = !!zone.tile, deep = (pool || zone.wade) && feet < -.5; // only the pool rooms have water below 0; elsewhere a low floor is just a low floor
  const low = !fly && !grip && (k('ControlLeft') | k('ControlRight')); // hold Ctrl to crouch
  const speed = (low ? 1.4 : k('ShiftLeft') ? 6 : 2.85) * (deep ? .55 : 1); // wading is slower
  camera.rotateOnWorldAxis(UP, (k('ArrowLeft') - k('ArrowRight')) * dt * 2.2);
  const yaw = eu.setFromQuaternion(camera.quaternion).y, sn = Math.sin(yaw), cs = Math.cos(yaw), ix = k('KeyD') - k('KeyA'), iy = (k('KeyW') | k('ArrowUp')) - (k('KeyS') | k('ArrowDown'));
  // vel is in the world, so turning in the air doesn't swing the jump round; diagonals are no faster; quick to start (90% in 0.23 s), quicker to stop
  const il = Math.hypot(ix, iy) || 1, tx = (ix * cs - iy * sn) / il * speed, tz = (-ix * sn - iy * cs) / il * speed, ease = Math.min(1, dt * (air ? 3 : tx * tx + tz * tz < sp * sp ? 14 : 10));
  // in the air, or leaving the ground this frame: a hop taken on landing loses nothing to the ground. Below walking or running speed (a jump from
  // standing) the jump still steers up toward it as it always did, or a chain of hops from rest would crawl
  const old = wet || (pool && feet < WY); // a jump from the water, or legs under it: the movement as it was before the jump had weight, exactly (6 m/s was its top)
  const hop = (air || vy > 0) && !grip && !fly && !old; if (old && !fly && sp > 6) vel.setLength(6);
  if (hop) { const wl = Math.hypot(tx, tz), up = sp < speed && wl && Math.min(ease * wl, wl - (vel.x * tx + vel.y * tz) / wl); // pushing along the keys only: no braking sideways, so strafing still gains
    if (up > 0) { vel.x += up * tx / wl; vel.y += up * tz / wl; }
    const add = wl && Math.min(AIR * wl * dt, AIR_CAP - (vel.x * tx + vel.y * tz) / wl);
    if (add > 0) { vel.x += add * tx / wl; vel.y += add * tz / wl; } if (vel.length() > TOP) vel.setLength(TOP); }
  else if (!fly) { vel.x += (tx - vel.x) * ease; vel.y += (tz - vel.y) * ease; }
  else { // flying: forward follows the look up and down; the same quick start and quicker stop as walking
    const fs = k('ShiftLeft') ? 30 : 12, iz = k('Space') - k('KeyX'), l3 = Math.hypot(ix, iy, iz) || 1, cp = Math.cos(eu.x), fx = (ix * cs - iy * sn * cp) / l3 * fs, fz = (-ix * sn - iy * cs * cp) / l3 * fs, fy = (iy * Math.sin(eu.x) + iz) / l3 * fs;
    const e = Math.min(1, dt * (fx * fx + fy * fy + fz * fz < sp * sp + fvy * fvy ? 14 : 10)); vel.x += (fx - vel.x) * e; vel.y += (fz - vel.y) * e; fvy += (fy - fvy) * e; }
  // Ladders: at one, moving toward its deck (whichever way you face) or jumping climbs, moving toward the water descends; once holding on, gravity lets go of you.
  // Moving sideways, or away at the bottom, lets go of the ladder (it once held the body between the rails for good).
  const lad = !fly && ladders.find(l => inR(p.x, p.z, l[0], l[1], l[2], l[3])), top = lad ? lad[6] : 0;
  const toward = lad && (ix || iy) ? ((ix * cs - iy * sn) * lad[4] + (-ix * sn - iy * cs) * lad[5]) / Math.hypot(ix, iy) : 0, below = lad && Math.min(feet, floorH(p.x, p.z)) < top - .01; // below: not standing on the deck
  const bottom = lad && feet < top - .05 && feet <= groundAt(p.x, p.z, feet) + .01; // below the deck with nothing left to descend
  const climb = toward < -.3 ? bottom ? 0 : -1 : toward > .3 || (below && k('Space')) ? 1 : 0, at = !!lad && (below || toward < -.3);
  const off = (ix || iy) && !climb; // moving sideways, or away at the bottom: let go of the ladder
  const hang = grip && at && !off && feet < top - .05; // on the rungs below the deck: the body stays on the ladder
  let mx = vel.x * dt, mz = vel.y * dt;
  if (lad && k('Space') && !iy && !ix && Math.abs(feet - top) < .03 && (p.x - (lad[0] + lad[2]) / 2) * lad[4] + (p.z - (lad[1] + lad[3]) / 2) * lad[5] < .5) { mx += lad[4] * 1.5 * dt; mz += lad[5] * 1.5 * dt; } // jump held at the top: step off onto the deck
  let ox = p.x, oz = p.z, warp, gate; const n = Math.max(1, Math.ceil(Math.hypot(mx, mz) / .1));
  const fb = grip ? feet - .3 : feet; // on a ladder a solid deck is stepped onto only once the feet are level with it, as below
  let roomy = fly || collide(p, fb); // false: squeezed somewhere a teleport put you, so any move is allowed until you are out
  for (let i = 0; i < n; i++) { // in steps of 10 cm at most, so nothing thin is run through and no passage warp strip is stepped over
    const sx = p.x, sz = p.z; p.x += mx / n; p.z += mz / n; const stop = !fly && !collide(p, fb) && roomy; if (stop) { p.x = sx; p.z = sz; }
    if (!fly && !warp && (warp = warps.find(w => inR(p.x, p.z, w[0], w[1], w[2], w[3])))) { p.x += warp[4]; p.z += warp[5]; ox += warp[4]; oz += warp[5]; }
    // a portal: the centre went from in front of its plane to behind it, through the opening (the eye within its height). Everything that
    // has a place or a direction is taken through exactly: where you are, where the frame started, the move left, the speed, the facing
    if (!gate && (gate = ends.find(e => { const a = side(e, sx, sz), b = side(e, p.x, p.z), y = feet + 1.62 + eye.lift - e.p.y; if (!(a >= 0 && b < 0) || y < 0 || y > e.h) return false;
      const t = a / (a - b); return Math.abs(across(e, sx + (p.x - sx) * t, sz + (p.z - sz) * t)) < e.w / 2; }))) {
      [p.x, p.z] = carry(gate, p.x, p.z); [ox, oz] = carry(gate, ox, oz); [mx, mz] = spin(gate, mx, mz); const [vx, vz] = spin(gate, vel.x, vel.y); vel.set(vx, vz);
      camera.rotateOnWorldAxis(UP, gate.turn); feet += gate.to.p.y - gate.p.y; }
    if (stop) break; }
  if (hang) { // held between the rails: within 10 cm of the ladder's middle, and inside its zone
    const cx = (lad[0] + lad[2]) / 2, cz = (lad[1] + lad[3]) / 2, [dx, dz] = [lad[4], lad[5]], a0 = (p.x - cx) * -dz + (p.z - cz) * dx, a = a0 - (a0 - Math.max(-.1, Math.min(.1, a0))) * Math.min(1, dt * 8), b = Math.max(-.6, Math.min(.6, (p.x - cx) * dx + (p.z - cz) * dz));
    p.x = cx - dz * a + dx * b; p.z = cz + dx * a + dz * b; }
  // A rise taller than a step is a wall. Pool sides can't be walked up: the ways out are the steps, the ladders, or a jump onto something low enough.
  const rise = grip ? .05 : .35; // on a ladder the deck is stepped onto only once the climb has brought the feet level with it
  const lead = (to, from) => to + Math.sign(to - from) * .3, tall = (x, z) => { const here = floorH(x, z); return here - feet > rise || floorVia(lead(x, ox), lead(z, oz), x, z) - Math.max(feet, here) > rise; }; // tested a body-width ahead, so the eye never reaches the wall face; measured from the step being stepped onto, or a fast climber would see two steps ahead as one wall
  if (!fly && tall(p.x, p.z)) { if (!tall(p.x, oz)) p.z = oz; else if (!tall(ox, p.z)) p.x = ox; else { p.x = ox; p.z = oz; } }
  if (hop) { const ax = (p.x - ox) / dt, az = (p.z - oz) / dt; if (ax * ax + az * az < vel.lengthSq() - 1e-6) vel.set(ax, az); } // a wall met in the air takes the speed into it, or it would come back once past
  const ground = groundAt(p.x, p.z, feet), was = feet;
  let landed = false, hit = 0;
  grip = at && !off && (grip || climb !== 0);
  if (fly) { feet += fvy * dt; vy = 0; wet = false; }
  else if (grip) { feet = Math.max(Math.min(ground, feet + 4 * dt), Math.min(top, feet + climb * 1.8 * dt)); vy = 0; wet = false; }
  else if (vy > 0 || feet > ground + (air ? .001 : .12)) { // off the ground: gravity, and drag once the legs are under water. Walking off a ledge is a fall; walking down a slope is not
    vy -= (old ? 11 : vy > 0 ? G_UP : G_DOWN) * dt; if (pool && feet < WY) vy -= vy * Math.min(1, 4 * dt); // in the water, and a jump from it, as before
    feet += vy * dt;
    if (vy > 0) for (const c of colliders) if (c[4] >= was + TALL - .15 && c[4] < feet + TALL && near(c, p.x, p.z, R * .9) && clear(c, p.x, null, p.z, R * .9)) { feet = Math.max(was, c[4] - TALL); vy = 0; } // the head meets an underside
    if (feet <= ground) { hit = -vy; feet = ground; vy = 0; landed = true; wet = false; }
  } else feet = Math.min(ground, feet + 4 * dt); // a step up is climbed, not jumped to
  air = fly || feet > ground + .001;
  // a jump pressed up to 0.1 s before landing, or up to 0.1 s after walking off an edge, still jumps
  coy = air ? coy - dt : .1; buf = k('Space') && !spaceWas ? .1 : buf - dt; spaceWas = k('Space');
  const jumped = (buf > 0 || k('Space')) && coy > 0 && !grip && !fly && vy <= 0;
  if (jumped) { wet = pool && feet < WY; vy = pool && feet < -.5 ? 2.8 : wet ? 4.3 : JUMP; coy = buf = 0; } // deep water weighs a jump down (a dry pit only slows the walk: you can jump out of it)
  const splash = !fly && pool && was > WY && feet <= WY; // the moment the feet break the surface
  if (splash) drop = .35;
  // the eye: a step up or down is eased over about 0.07 s instead of popping, a landing dips it by about 1 cm per m/s of fall, and
  // walking bobs it 1.6 cm (2.2 running), lowest at each footfall; a step is longer the faster you go (1.26 m walking, 2.05 m running)
  if (!air && !landed) lag = Math.max(-.4, Math.min(.4, lag - (feet - was))); lag *= Math.exp(-dt * 15);
  if (landed && hit > 2.2) dipV -= Math.min(hit, 13) * (vy > 0 ? .1 : .2); // the same dip for the same drop as under the old gravity (×0.3 at 11); half on a hop, so a chain doesn't thump
  for (let t = dt; t > 1e-6; t -= 1 / 60) { const h = Math.min(t, 1 / 60); dipV += (-150 * dip - 24.5 * dipV) * h; dip += dipV * h; } // critically damped
  if (!air) stride += Math.PI * sp * dt / (.55 + .25 * sp);
  // crouching brings the eye down 0.6 m, in a pool no nearer the water than a swimmer's (18 cm). shortcut: the body stays 1.75 m tall for solids, so nothing is ducked under; shrink it, and re-check the level's seal, when a place needs crawling
  duck += ((low ? Math.max(0, Math.min(.6, pools.some(q => inR(p.x, p.z, q[0], q[1], q[2], q[3])) ? feet + 1.62 - WY - .18 : .6)) : 0) - duck) * Math.min(1, dt * 10);
  p.y = feet + 1.62 + eye.lift - duck + lag + dip - Math.cos(2 * stride) * .008 * Math.min(1.4, sp / 2.85);
  const f = Math.floor(stride / Math.PI); // one footfall per bob, one on landing, one on entering water
  Object.assign(bod, { feet, sp, step: f !== foot && !air && sp > .5, foot: f & 1, run: sp > 4.2, landed, hit, jumped, splash, fall: vy, deep, grip, fly, air }); // for the footsteps (sound.js)
  foot = f;

  stepDoors(dt, k('KeyE') && !eWas); eWas = k('KeyE');
  const here = ends.find(e => reveal(e, p.x, p.z))?.zone || Object.values(zones).find(z => inR(p.x, p.z, ...z.box)); // in a portal's reveal: its zone, whichever box holds it (or weights() would measure from the wrong space)
  if (here && here !== zone) { zone = here; sfx?.zone(zone); setSky(zone.sky || 'day'); }
  const wts = weights(p.x, p.z, zone);
  aheadOf(p, 1);
  if (warp) relight(p, zone, 1, wts, ahead); // arrived somewhere else: the lamps come at once
  relight(p, zone, warp ? 1 : dt * 3, wts, ahead);
  for (const w of ponds) w.visible = wts.some(([z]) => w.seen.includes(z.id));
  sfx?.frame(camera, wts, zone, bod); // what you hear from here: sound.js // drawn from near a doorway of a zone that sees it, not only once through
  const wake = pool && ground < 0 && !air ? Math.min(Math.hypot(p.x - ox, p.z - oz) / dt, 4) * .006 : 0; // wading leaves a wake, by how far the body really moved (pressed against a wall it would heap the water on one spot); `drop` is a pending splash
  // 60 Hz: the loose things, then the waves, with the ripples both leave
  simT += dt; const steps = Math.min(4, Math.floor(simT * 60 + 1e-6)); simT = steps === 4 ? 0 : simT - steps / 60; // as many as the frame's time holds; a long stall is dropped, not caught up
  hitP = Math.max(hitP, hit); splashP ||= splash; fallP = Math.min(fallP, landed ? -hit : vy); // held until a step runs: above 60 Hz most frames run none
  const me = { x: p.x, z: p.z, feet, vx: (p.x - ox) / dt, vz: (p.z - oz) / dt, vy: fallP < 0 ? fallP : vy, hit: hitP, splash: splashP };
  for (let i = 1; i <= steps; i++) { // the body's place and height move through the frame's steps, so a slow frame doesn't hit things harder or skip them
    if (!me.shoved) { me.x = ox + (p.x - ox) * i / steps; me.z = oz + (p.z - oz) * i / steps; } me.feet = fly ? 1e4 : was + (feet - was) * i / steps; // a flying body touches nothing loose
    stepLoose(me); me.hit = 0; me.splash = false; hitP = 0; splashP = false; fallP = 0;
    for (const S of sheets) if (S.ponds.some(w => w.visible)) ripple(S, [[p.x, p.z, wake + drop], ...wakes.filter(k => k[0].sheet === S).map(k => k.slice(1))]);
    drop = 0;
  }
  if (me.shoved) { const sx = p.x, sz = p.z; p.x = me.x; p.z = me.z; if (!collide(p, feet)) { p.x = sx; p.z = sz; } } // a ring or ball held against something stops the body
  looseCost.ms = drawLoose(wts.map(q => q[0].id));
  mood(wts, 1 - Math.exp(-dt * 8));
  composer.render(dt);
};
// The look is where you stand: each zone in weights() has a share, eased toward it in time (about 0.12 s) so a teleport or the small
// steps where several openings meet never show as a one-frame jump (a: share of the way this frame, 1 = at once). Exposure mixes on
// a log scale; the fog is not mixed as numbers but as pictures (post.js), up to the three largest shares.
const tint = new THREE.Vector3();
function mood(wts, a) {
  const m = look.w; let sum = 0, e = 0, sh = 0, sa = 0, bl = 0, con = 0, vig = 0, sn = 0;
  for (const [z] of wts) if (!m.has(z)) m.set(z, 0);
  for (const [z, v] of m) { const t = wts.find(q => q[0] === z)?.[1] || 0, n = v + (t - v) * a; if (n < 1e-3 && !t) m.delete(z); else { m.set(z, n); sum += n; } }
  const ws = [...m].map(([z, v]) => [z, v / sum]).sort((p, q) => q[1] - p[1]); tint.set(0, 0, 0);
  for (const [z0, v] of ws) { const z = z0.lk || z0; e += v * Math.log(z.exp); sh += v * z.shaft; sa += v * z.sat; bl += v * z.bloom; tint.addScaledVector(z.tint, v); con += v * (z.con ?? .4); vig += v * (z.vig ?? .7); sn += v * (z.sun ?? 1); } // lk: the zone with the look laid over it (look.js)
  Object.assign(look, { exp: Math.exp(e), shaft: sh, sat: sa, bloom: bl }); look.tint.copy(tint);
  const F = atmos.uniforms.uFog.value, top = ws.slice(0, 3), s3 = top.reduce((s, q) => s + q[1], 0);
  atmos.uniforms.uFogW.value.set(...[0, 1, 2].map(i => top[i] ? top[i][1] / s3 : 0)); top.forEach(([z], i) => F[i].copy((z.lk || z).fog));
  renderer.toneMappingExposure = look.exp; bloom.strength = look.bloom; atmos.uniforms.uShaft.value = look.shaft; film.uniforms.uSat.value = look.sat;
  film.uniforms.uCon.value = look.on ? con : .4; film.uniforms.uVig.value = look.on ? vig : .7; sun.intensity = sun.userData.light * (look.on ? sn : 1);
}
{ const w0 = weights(camera.position.x, camera.position.z, zone); mood(w0, 1); relight(camera.position, zone, 1, w0); relight(camera.position, zone, 1, w0); } // the start: as if standing there a while

const looseCost = { ms: 0 }; // what the loose things cost the last frame, in ms

// ?dev only (dev.reset): everything a walk leaves behind put back to what a fresh load at (x, z) would start with, so one page can take many photos
function resetAll(x, z, yaw, pitch) {
  for (const c in keys) keys[c] = 0; eye.lift = 0; uTime.value = 0; camera.fov = 72; camera.updateProjectionMatrix();
  place(x, z, yaw, pitch); stride = foot = vy = drop = simT = hitP = fallP = coy = buf = spaceWas = 0; grip = splashP = false; vel.set(0, 0);
  zone = ends.find(e => reveal(e, x, z))?.zone || Object.values(zones).find(q => inR(x, z, ...q.box)) || zones.bA; // as lights.js picks zone0
  resetWater(); resetLoose();
  const wts = weights(x, z, zone); setSky(zone.sky || 'day'); relight(camera.position, zone, 1, wts); relight(camera.position, zone, 1, wts);
  for (const l of lights) l.shadow.needsUpdate = true; sun.shadow.needsUpdate = renderer.shadowMap.needsUpdate = true; // the loose things moved: every shadow is drawn again
  mood(wts, 1);
}

export { vel, eye, o, zone, feet, air, frame, place, looseCost, resetAll, mood, ahead };
