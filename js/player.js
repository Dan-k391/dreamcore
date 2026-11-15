// The player: controls, collision and the frame step.
import * as THREE from 'three';
import { renderer, camera, uTime, V, WY, zones, inR } from './core.js';
import { colliders, emitters, warps, ladders, floorH, clear, out, near } from './build.js';
import { setSky, sun } from './sky.js';
import { ponds, ripple, resetWater } from './water.js';
import { relight, zone0, lights } from './lights.js';
import { composer, look, atmos, bloom, film } from './post.js';
import { sfx, startAudio } from './audio.js';
import { wakes, stepLoose, drawLoose, resetLoose } from './physics.js';

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
  turn(cl(e.movementX) * .0022 * Math.min(72, camera.fov) / 72, cl(e.movementY) * .0022 * Math.min(72, camera.fov) / 72); // slower while zoomed in, the same while running widens the view
});
addEventListener('keydown', e => { if (paused()) return; keys[e.code] = 1; if (e.code === 'Space') e.preventDefault(); if (e.code === 'KeyM') sfx?.mute(); });
addEventListener('keyup', e => keys[e.code] = 0);
document.getElementById('s').textContent = 'click to enter  ·  wasd walk  ·  mouse look  ·  q / e turn  ·  space jump  ·  shift run  ·  c zoom  ·  m mute';
let zone = zone0; // the zone you are in

// The body: an upright cylinder of radius R from the soles (feet) up 1.75 m. A solid blocks it sideways where it overlaps the body
// above step height (so low things are stepped onto and high things walked under; the top 5 cm of the head ducks), its top is
// ground wherever it is under the middle RS of the body, and its underside stops a jump.
const R = .3, RS = .22, STEP = .35, TALL = 1.75;
const blocks = (c, feet) => c[5] > feet + STEP && c[4] < feet + 1.7;
function collide(p, feet = 0) { // push the body out of every solid it overlaps; a few passes settle corners between solids
  for (let pass = 0; pass < 4; pass++) { let hit = false;
    for (const c of colliders) if (near(c, p.x, p.z, R) && blocks(c, feet) && clear(c, p.x, null, p.z, R)) { p.x += out.x; p.z += out.z; hit = true; }
    if (!hit) return true;
  }
  return !colliders.some(c => near(c, p.x, p.z, R - .002) && blocks(c, feet) && clear(c, p.x, null, p.z, R - .002)); // false: still inside something
}
const groundAt = (x, z, feet) => { // the highest floor or solid top under the body that a step from `feet` reaches
  let g = floorH(x, z);
  for (const c of colliders) if (c[5] > g && c[5] <= feet + STEP && near(c, x, z, RS) && clear(c, x, null, z, RS)) g = c[5];
  return g;
};
console.assert(floorH(0, -12) === -1.2 && floorH(0, -6.2) === -.3 && floorH(15, -12) === -.3 && floorH(24.2, -12) === -.6 && floorH(30, -12) === -1.2 && floorH(0, 10) === 0 && floorH(23, 25) === -1.2 && floorH(23, 34.8) === -.3 && floorH(24, 50) === -.6
  && floorH(15, 31) === -1 && floorH(-36, 34) === -.85 && floorH(-33.3, 34) === -.29 && floorH(700, 649.4) === 5 && floorH(35.2, 49.4) === -.3 && Math.abs(floorH(3.8, 667)) < 1e-9
  && (q => collide(q) && q.z > 1.29)(V(5, 0, .6)) && Object.values(zones).every(z => inR(z.probe.x, z.probe.z, ...z.box)) && emitters.every(e => inR(e.p.x, e.p.z, ...e.zone.box)), 'level self-check failed');

const vel = new THREE.Vector2(), UP = new THREE.Vector3(0, 1, 0);
let stride = 0, foot = 0, feet = floorH(camera.position.x, camera.position.z), vy = 0, air = false, grip = false, drop = 0, simT = 0, hitP = 0, splashP = false, fallP = 0, coy = 0, buf = 0, spaceWas = 0, lag = 0, dip = 0, dipV = 0; // feet: height of the player's soles; coy, buf: jump grace times; lag, dip: the eye's easing and landing dip
const place = (x, z, yaw, pitch) => { // teleport: stand at (x, z) facing that way, at rest
  camera.position.x = x; camera.position.z = z; camera.rotation.set(pitch, yaw, 0, 'YXZ');
  feet = floorH(x, z); vy = lag = dip = dipV = 0; vel.set(0, 0); air = grip = false;
};
const eye = { lift: 0 }; // metres added to the eye height; only dev.lift (?dev) changes it
const frame = dt => { // one game frame of dt seconds: the loop below passes the real time, dev.step() a fixed one
  const p = camera.position, k = c => keys[c] ? 1 : 0, sp = vel.length();
  uTime.value += dt;
  const fov = k('KeyC') ? 22 : 72 + 4 * Math.max(0, Math.min(1, (sp - 2.85) / 3.15)); // hold C to zoom in; running widens the view up to 4 degrees
  if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * (fov < 70 || camera.fov < 70 ? 12 : 3)); camera.updateProjectionMatrix(); }
  const pool = !!zone.tile, deep = (pool || zone.wade) && feet < -.5; // only the pool rooms have water below 0; elsewhere a low floor is just a low floor
  const speed = (k('ShiftLeft') ? 6 : 2.85) * (deep ? .55 : 1); // wading is slower
  camera.rotateOnWorldAxis(UP, ((k('ArrowLeft') | k('KeyQ')) - (k('ArrowRight') | k('KeyE'))) * dt * 2.2);
  const yaw = eu.setFromQuaternion(camera.quaternion).y, sn = Math.sin(yaw), cs = Math.cos(yaw), ix = k('KeyD') - k('KeyA'), iy = (k('KeyW') | k('ArrowUp')) - (k('KeyS') | k('ArrowDown'));
  // vel is in the world, so turning in the air doesn't swing the jump round; diagonals are no faster; quick to start (90% in 0.23 s), quicker to stop, and a jump steers only a little
  const il = Math.hypot(ix, iy) || 1, tx = (ix * cs - iy * sn) / il * speed, tz = (-ix * sn - iy * cs) / il * speed, ease = Math.min(1, dt * (air ? 3 : tx * tx + tz * tz < sp * sp ? 14 : 10));
  vel.x += (tx - vel.x) * ease; vel.y += (tz - vel.y) * ease;
  const warp = warps.find(w => inR(p.x, p.z, w[0], w[1], w[2], w[3]));
  if (warp) { p.x += warp[4]; p.z += warp[5]; }
  // Ladders: at one, moving toward its deck (whichever way you face) or jumping climbs, moving toward the water descends; once holding on, gravity lets go of you.
  const lad = ladders.find(l => inR(p.x, p.z, l[0], l[1], l[2], l[3])), top = lad ? lad[6] : 0;
  const toward = lad && (ix || iy) ? ((ix * cs - iy * sn) * lad[4] + (-ix * sn - iy * cs) * lad[5]) / Math.hypot(ix, iy) : 0, below = lad && Math.min(feet, floorH(p.x, p.z)) < top - .01; // below: not standing on the deck
  const climb = toward < -.3 ? -1 : toward > .3 || (below && k('Space')) ? 1 : 0, at = !!lad && (below || toward < -.3);
  const hang = grip && at && feet < top - .05; // on the rungs below the deck: the body stays on the ladder
  let mx = vel.x * dt, mz = vel.y * dt;
  if (lad && k('Space') && !iy && !ix && Math.abs(feet - top) < .03 && (p.x - (lad[0] + lad[2]) / 2) * lad[4] + (p.z - (lad[1] + lad[3]) / 2) * lad[5] < .5) { mx += lad[4] * 1.5 * dt; mz += lad[5] * 1.5 * dt; } // jump held at the top: step off onto the deck
  const ox = p.x, oz = p.z, n = Math.max(1, Math.ceil(Math.hypot(mx, mz) / .1));
  const fb = grip ? feet - .3 : feet; // on a ladder a solid deck is stepped onto only once the feet are level with it, as below
  let roomy = collide(p, fb); // false: squeezed somewhere a teleport put you, so any move is allowed until you are out
  for (let i = 0; i < n; i++) { const sx = p.x, sz = p.z; p.x += mx / n; p.z += mz / n; if (!collide(p, fb) && roomy) { p.x = sx; p.z = sz; break; } } // in steps of 10 cm at most, so nothing thin is run through
  if (hang) { // held between the rails: within 10 cm of the ladder's middle, and inside its zone
    const cx = (lad[0] + lad[2]) / 2, cz = (lad[1] + lad[3]) / 2, [dx, dz] = [lad[4], lad[5]], a0 = (p.x - cx) * -dz + (p.z - cz) * dx, a = a0 - (a0 - Math.max(-.1, Math.min(.1, a0))) * Math.min(1, dt * 8), b = Math.max(-.6, Math.min(.6, (p.x - cx) * dx + (p.z - cz) * dz));
    p.x = cx - dz * a + dx * b; p.z = cz + dx * a + dz * b; }
  // A rise taller than a step is a wall. Pool sides can't be walked up: the ways out are the steps, the ladders, or a jump onto something low enough.
  const rise = grip ? .05 : .35; // on a ladder the deck is stepped onto only once the climb has brought the feet level with it
  const lead = (to, from) => to + Math.sign(to - from) * .3, tall = (x, z) => { const here = floorH(x, z); return here - feet > rise || floorH(lead(x, ox), lead(z, oz)) - Math.max(feet, here) > rise; }; // tested a body-width ahead, so the eye never reaches the wall face; measured from the step being stepped onto, or a fast climber would see two steps ahead as one wall
  if (tall(p.x, p.z)) { if (!tall(p.x, oz)) p.z = oz; else if (!tall(ox, p.z)) p.x = ox; else { p.x = ox; p.z = oz; } }
  const ground = groundAt(p.x, p.z, feet), was = feet;
  let landed = false, hit = 0;
  grip = at && (grip || climb !== 0);
  if (grip) { feet = Math.max(Math.min(ground, feet + 4 * dt), Math.min(top, feet + climb * 1.8 * dt)); vy = 0; }
  else if (vy > 0 || feet > ground + (air ? .001 : .12)) { // off the ground: gravity, and drag once the legs are under water. Walking off a ledge is a fall; walking down a slope is not
    vy -= 11 * dt; if (pool && feet < WY) vy -= vy * Math.min(1, 4 * dt);
    feet += vy * dt;
    if (vy > 0) for (const c of colliders) if (c[4] >= was + TALL - .15 && c[4] < feet + TALL && near(c, p.x, p.z, R * .9) && clear(c, p.x, null, p.z, R * .9)) { feet = Math.max(was, c[4] - TALL); vy = 0; } // the head meets an underside
    if (feet <= ground) { hit = -vy; feet = ground; vy = 0; landed = true; }
  } else feet = Math.min(ground, feet + 4 * dt); // a step up is climbed, not jumped to
  air = feet > ground + .001;
  // a jump pressed up to 0.1 s before landing, or up to 0.1 s after walking off an edge, still jumps
  coy = air ? coy - dt : .1; buf = k('Space') && !spaceWas ? .1 : buf - dt; spaceWas = k('Space');
  if ((buf > 0 || k('Space')) && coy > 0 && !grip && vy <= 0) { vy = pool && feet < -.5 ? 2.8 : 4.3; coy = buf = 0; } // deep water weighs a jump down (a dry pit only slows the walk: you can jump out of it)
  const splash = pool && was > WY && feet <= WY; // the moment the feet break the surface
  if (splash) drop = .35;
  // the eye: a step up or down is eased over about 0.07 s instead of popping, a landing dips it by about 1 cm per m/s of fall, and
  // walking bobs it 1.6 cm (2.2 running), lowest at each footfall; a step is longer the faster you go (1.26 m walking, 2.05 m running)
  if (!air && !landed) lag = Math.max(-.4, Math.min(.4, lag - (feet - was))); lag *= Math.exp(-dt * 15);
  if (landed && hit > 1.5) dipV -= Math.min(hit, 9) * .3;
  for (let t = dt; t > 1e-6; t -= 1 / 60) { const h = Math.min(t, 1 / 60); dipV += (-150 * dip - 24.5 * dipV) * h; dip += dipV * h; } // critically damped
  if (!air) stride += Math.PI * sp * dt / (.55 + .25 * sp);
  p.y = feet + 1.62 + eye.lift + lag + dip - Math.cos(2 * stride) * .008 * Math.min(1.4, sp / 2.85);
  const f = Math.floor(stride / Math.PI); // one footfall per bob, one on landing, one on entering water
  if (sfx && ((f !== foot && !air && sp > .5) || landed || splash)) sfx.step(pool ? ground < 0 ? 'water' : 'tile' : zone.step || 'carpet');
  foot = f;

  const here = Object.values(zones).find(z => inR(p.x, p.z, ...z.box));
  if (here && here !== zone) { zone = here; sfx?.zone(zone); setSky(zone.sky || 'day'); }
  if (warp) relight(p, zone, 1); // arrived somewhere else: the lamps come at once
  relight(p, zone, warp ? 1 : dt * 3);
  for (const w of ponds) w.visible = w.seen.includes(zone.id);
  const wake = pool && ground < 0 && !air ? Math.min(Math.hypot(p.x - ox, p.z - oz) / dt, 4) * .006 : 0; // wading leaves a wake, by how far the body really moved (pressed against a wall it would heap the water on one spot); `drop` is a pending splash
  // 60 Hz: the loose things, then the waves, with the ripples both leave
  simT += dt; const steps = Math.min(4, Math.floor(simT * 60 + 1e-6)); simT = steps === 4 ? 0 : simT - steps / 60; // as many as the frame's time holds; a long stall is dropped, not caught up
  hitP = Math.max(hitP, hit); splashP ||= splash; fallP = Math.min(fallP, landed ? -hit : vy); // held until a step runs: above 60 Hz most frames run none
  const me = { x: p.x, z: p.z, feet, vx: (p.x - ox) / dt, vz: (p.z - oz) / dt, vy: fallP < 0 ? fallP : vy, hit: hitP, splash: splashP };
  for (let i = 1; i <= steps; i++) { // the body's place and height move through the frame's steps, so a slow frame doesn't hit things harder or skip them
    if (!me.shoved) { me.x = ox + (p.x - ox) * i / steps; me.z = oz + (p.z - oz) * i / steps; } me.feet = was + (feet - was) * i / steps;
    stepLoose(me); me.hit = 0; me.splash = false; hitP = 0; splashP = false; fallP = 0;
    for (const w of ponds) if (w.visible) ripple(w, [[p.x, p.z, wake + drop], ...wakes.filter(k => k[0] === w).map(k => k.slice(1))]);
    drop = 0;
  }
  if (me.shoved) { const sx = p.x, sz = p.z; p.x = me.x; p.z = me.z; if (!collide(p, feet)) { p.x = sx; p.z = sz; } } // a ring or ball held against something stops the body
  looseCost.ms = drawLoose(zone.id);
  const a = 1 - Math.exp(-dt * 1.5); // eye adaptation and mood drift between zones
  for (const key of ['exp', 'shaft', 'sat', 'bloom']) look[key] += (zone[key] - look[key]) * a;
  look.fog.lerp(zone.fog, a); look.tint.lerp(zone.tint, a);
  renderer.toneMappingExposure = look.exp; bloom.strength = look.bloom; atmos.uniforms.uShaft.value = look.shaft; film.uniforms.uSat.value = look.sat;
  composer.render(dt);
};

const looseCost = { ms: 0 }; // what the loose things cost the last frame, in ms

// ?dev only (dev.reset): everything a walk leaves behind put back to what a fresh load at (x, z) would start with, so one page can take many photos
function resetAll(x, z, yaw, pitch) {
  for (const c in keys) keys[c] = 0; eye.lift = 0; uTime.value = 0; camera.fov = 72; camera.updateProjectionMatrix();
  place(x, z, yaw, pitch); stride = foot = vy = drop = simT = hitP = fallP = coy = buf = spaceWas = 0; grip = splashP = false; vel.set(0, 0);
  zone = Object.values(zones).find(q => inR(x, z, ...q.box)) || zones.bA; // as lights.js picks zone0
  resetWater(); resetLoose();
  setSky(zone.sky || 'day'); relight(camera.position, zone, 1); relight(camera.position, zone, 1);
  for (const l of lights) l.shadow.needsUpdate = true; sun.shadow.needsUpdate = renderer.shadowMap.needsUpdate = true; // the loose things moved: every shadow is drawn again
  Object.assign(look, { exp: zone.exp, shaft: 0, sat: zone.sat, bloom: zone.bloom }); look.fog.copy(zone.fog); look.tint.copy(zone.tint);
}

export { eye, o, zone, feet, air, frame, place, looseCost, resetAll };
