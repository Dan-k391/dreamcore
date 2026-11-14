// The player: controls, collision and the frame step.
import * as THREE from 'three';
import { renderer, camera, uTime, V, WY, zones, inR } from './core.js';
import { colliders, emitters, warps, ladders, rings, floorH } from './build.js';
import { setSky } from './sky.js';
import { ponds, ripple } from './water.js';
import { relight, zone0 } from './lights.js';
import { composer, look, atmos, bloom, film } from './post.js';
import { sfx, startAudio } from './audio.js';

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
  if (!locked() && !free) return;
  const m = free ? 60 : 250, cl = v => Math.max(-m, Math.min(m, v)); // drop the one-event jumps browsers report on re-entry or under capture
  turn(cl(e.movementX) * .0022 * camera.fov / 72, cl(e.movementY) * .0022 * camera.fov / 72); // slower while zoomed in
});
addEventListener('keydown', e => { if (paused()) return; keys[e.code] = 1; if (e.code === 'Space') e.preventDefault(); if (e.code === 'KeyM') sfx?.mute(); });
addEventListener('keyup', e => keys[e.code] = 0);
document.getElementById('s').textContent = 'click to enter  ·  wasd walk  ·  mouse look  ·  q / e turn  ·  space jump  ·  shift run  ·  c zoom  ·  m mute';
let zone = zone0; // the zone you are in

function collide(p, R = .3) { // push the player circle out of every wall box along the shallowest axis
  for (const [x1, z1, x2, z2] of colliders) if (p.x > x1 - R && p.x < x2 + R && p.z > z1 - R && p.z < z2 + R) {
    const dx = p.x - (x1 - R) < x2 + R - p.x ? x1 - R - p.x : x2 + R - p.x, dz = p.z - (z1 - R) < z2 + R - p.z ? z1 - R - p.z : z2 + R - p.z;
    if (Math.abs(dx) < Math.abs(dz)) p.x += dx; else p.z += dz;
  }
  return p;
}
console.assert(floorH(0, -12) === -1.2 && floorH(0, -6.2) === -.3 && floorH(15, -12) === -.3 && floorH(24.2, -12) === -.6 && floorH(30, -12) === -1.2 && floorH(0, 10) === 0 && floorH(23, 25) === -1.2 && floorH(23, 34.8) === -.3 && floorH(24, 50) === -.6
  && floorH(15, 31) === -1 && floorH(-36, 34) === -.55 && floorH(-33.3, 34) === -.28 && floorH(700, 649.4) === 5 && floorH(35.2, 49.4) === -.3 && Math.abs(floorH(3.8, 667)) < 1e-9
  && collide(V(5, 0, .6)).z > 1.29 && Object.values(zones).every(z => inR(z.probe.x, z.probe.z, ...z.box)) && emitters.every(e => inR(e.p.x, e.p.z, ...e.zone.box)), 'level self-check failed');

const vel = new THREE.Vector2(), UP = new THREE.Vector3(0, 1, 0);
let stride = 0, foot = 0, feet = floorH(camera.position.x, camera.position.z), vy = 0, air = false, grip = false, drop = 0, simT = 0; // feet: height of the player's soles
const place = (x, z, yaw, pitch) => { // teleport: stand at (x, z) facing that way, at rest
  camera.position.x = x; camera.position.z = z; camera.rotation.set(pitch, yaw, 0, 'YXZ');
  feet = floorH(x, z); vy = 0; vel.set(0, 0); air = grip = false;
};
const frame = dt => { // one game frame of dt seconds: the loop below passes the real time, dev.step() a fixed one
  const p = camera.position, k = c => keys[c] ? 1 : 0, ease = Math.min(1, dt * 8);
  uTime.value += dt;
  const fov = k('KeyC') ? 22 : 72; // hold C to zoom in
  if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); }
  const pool = !!zone.tile, deep = (pool || zone.wade) && feet < -.5; // only the pool rooms have water below 0; elsewhere a low floor is just a low floor
  const speed = (k('ShiftLeft') ? 4 : 1.9) * (deep ? .55 : 1); // wading is slower
  vel.x += ((k('KeyD') - k('KeyA')) * speed - vel.x) * ease;
  vel.y += (((k('KeyW') | k('ArrowUp')) - (k('KeyS') | k('ArrowDown'))) * speed - vel.y) * ease;
  camera.rotateOnWorldAxis(UP, ((k('ArrowLeft') | k('KeyQ')) - (k('ArrowRight') | k('KeyE'))) * dt * 2.2);
  const yaw = eu.setFromQuaternion(camera.quaternion).y, sn = Math.sin(yaw), cs = Math.cos(yaw);
  const warp = warps.find(w => inR(p.x, p.z, w[0], w[1], w[2], w[3]));
  if (warp) { p.x += warp[4]; p.z += warp[5]; }
  const ox = p.x, oz = p.z;
  p.x += (vel.x * cs - vel.y * sn) * dt; p.z += (-vel.x * sn - vel.y * cs) * dt;
  collide(p);
  // A rise taller than a step is a wall. Pool sides can't be walked up: the ways out are the steps, or a jump onto something low enough.
  const lead = (to, from) => to + Math.sign(to - from) * .3, tall = (x, z) => { const here = floorH(x, z); return here - feet > .35 || floorH(lead(x, ox), lead(z, oz)) - Math.max(feet, here) > .35; }; // tested a body-width ahead, so the eye never reaches the wall face; measured from the step being stepped onto, or a fast climber would see two steps ahead as one wall
  if (tall(p.x, p.z)) { if (!tall(p.x, oz)) p.z = oz; else if (!tall(ox, p.z)) p.x = ox; else { p.x = ox; p.z = oz; } }
  const ground = floorH(p.x, p.z), was = feet;
  let landed = false;
  // Ladders: in the water at one, facing it, forward (or jump) climbs and back descends; once holding on, gravity lets go of you.
  const at = feet < 0 && -sn > .3 && ladders.some(l => inR(p.x, p.z, ...l)), climb = at ? (k('KeyW') | k('ArrowUp') | k('Space')) - (k('KeyS') | k('ArrowDown')) : 0;
  grip = at && (grip || climb !== 0);
  if (grip) { feet = Math.max(ground, Math.min(0, feet + climb * 1.3 * dt)); vy = 0; }
  else if (vy > 0 || feet > ground + (air ? .001 : .12)) { // off the ground: gravity, and drag once the legs are under water. Walking off a ledge is a fall; walking down a slope is not
    vy -= 11 * dt; if (pool && feet < WY) vy -= vy * Math.min(1, 4 * dt);
    feet += vy * dt;
    if (feet <= ground) { feet = ground; vy = 0; landed = true; }
  } else feet = Math.min(ground, feet + 4 * dt); // a step up is climbed, not jumped to
  air = feet > ground + .001;
  if (k('Space') && !air) vy = deep ? 2.8 : 4.3; // deep water weighs a jump down
  const splash = pool && was > WY && feet <= WY; // the moment the feet break the surface
  if (splash) drop = .35;
  if (!air) stride += vel.length() * dt;
  p.y = feet + 1.62 + Math.sin(stride * 3.4) * .018 * Math.min(1, vel.length());
  const f = Math.floor(stride * 3.4 / Math.PI); // one footfall per half bob cycle, one on landing, one on entering water
  if (sfx && ((f !== foot && !air && vel.length() > .5) || landed || splash)) sfx.step(pool ? ground < 0 ? 'water' : 'tile' : zone.step || 'carpet');
  foot = f;

  const here = Object.values(zones).find(z => inR(p.x, p.z, ...z.box));
  if (here && here !== zone) { zone = here; sfx?.zone(zone); setSky(zone.sky || 'day'); }
  if (warp) relight(p, zone, 1); // arrived somewhere else: the lamps come at once
  relight(p, zone, warp ? 1 : dt * 3);
  for (const w of ponds) w.visible = w.seen.includes(zone.id);
  const wake = pool && ground < 0 && !air ? Math.min(vel.length(), 4) * .006 : 0; // wading leaves a wake; `drop` is a pending splash
  for (simT += dt; simT > 1 / 60; simT = simT > .05 ? 0 : simT - 1 / 60) { for (const w of ponds) if (w.visible) ripple(w, p.x, p.z, wake + drop); drop = 0; }
  const a = 1 - Math.exp(-dt * 1.5); // eye adaptation and mood drift between zones
  for (const key of ['exp', 'shaft', 'sat', 'bloom']) look[key] += (zone[key] - look[key]) * a;
  look.fog.lerp(zone.fog, a); look.tint.lerp(zone.tint, a);
  renderer.toneMappingExposure = look.exp; bloom.strength = look.bloom; atmos.uniforms.uShaft.value = look.shaft; film.uniforms.uSat.value = look.sat;
  rings.forEach((r, i) => { r.position.y = WY + .05 + .012 * Math.sin(uTime.value * 1.1 + i * 2); r.rotation.z = .03 * Math.sin(uTime.value * .7 + i); });
  composer.render(dt);
};

export { o, zone, feet, air, frame, place };
