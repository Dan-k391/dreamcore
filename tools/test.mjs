// Regression suite: loads the game with and without ?dev through tools/browse.mjs, walks the routes between places with dev.go
// and checks where you end up. One line per check; exit code 1 if any fails.
//   node tools/test.mjs [--port 8200] [--all] [--only area,area] [--list]   (default prints only failed checks and a final count; --all prints every line)
//   Each area is its own child process (--child <area>) with its own browsers; areas that measure time (perf) run alone first, the rest side by side.
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argv = process.argv.slice(2), i = argv.indexOf('--port'), base = `http://127.0.0.1:${i < 0 ? 8200 : argv[i + 1]}/`;
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const run = (url, expr, ...opt) => { // -> {result, errors}; browse.mjs exits 1 on page errors, which is still a result to report
  try { return JSON.parse(execFileSync(process.execPath, [browse, '--url', url, '--eval', expr, ...opt], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch (e) { try { return JSON.parse(e.stdout); } catch { return { result: null, errors: [String(e.stderr || e.message)] }; } }
};
const AREAS = { // area: [check count (a full run warns when it differs), runs alone, what it covers]
  perf: [5, 1, 'checks that measure time: library bake, ready, first sign, openings, physics budgets'],
  seen: [1, 0, 'js/seen.js covers what each zone can see (tools/pvs.mjs --check, the longest single check)'],
  move: [50, 0, 'walks between places, jumping and hopping, ladders, passage warps, portals, doors, noclip, the flume'],
  load: [12, 0, 'page loads, draw-call and shader-compile guards, frame ceilings, the single file, other hosts, production'],
  water: [9, 0, 'pool pictures, optics, mirror reflections, skipped pool pictures'],
  solid: [11, 0, 'what stops you: benches, doors, arches, the flume; coplanar faces; nothing pops at an opening'],
  light: [2, 0, 'shadow maps: every caster, the loose-things cache'],
  look: [9, 0, 'zone culling, mood at openings and passages, settings panel, grass viewport'],
  loose: [14, 0, 'balls, rings, the pit and what they do'],
  sound: [1, 0, 'music'],
};
const oi = argv.indexOf('--only'), ci = argv.indexOf('--child'), A = ci < 0 ? null : argv[ci + 1], on = a => A === a;
if (argv.includes('--list')) { for (const [a, [n, , d]] of Object.entries(AREAS)) console.log(`${a.padEnd(6)} ${String(n).padStart(3)} checks  ${d}`); process.exit(0); }
if (!A) { // the scheduler: one child per area
  const want = oi < 0 ? Object.keys(AREAS) : (argv[oi + 1] || '').split(','), unknown = want.filter(a => !AREAS[a]);
  if (unknown.length) { console.error(`unknown area: ${unknown.join(', ')} (areas: ${Object.keys(AREAS).join(', ')})`); process.exit(2); }
  const go = a => new Promise(done => { const t0 = Date.now(), p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--port', i < 0 ? '8200' : argv[i + 1], '--child', a, ...(argv.includes('--all') ? ['--all'] : [])]); let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); p.on('close', () => done({ a, out: out.trim(), s: (Date.now() - t0) / 1000 })); });
  const t0 = Date.now(), res = [];
  for (const a of want.filter(a => AREAS[a][1])) res.push(await go(a));
  const queue = want.filter(a => !AREAS[a][1]), ji = argv.indexOf('--jobs'), jobs = +(ji < 0 ? process.env.JOBS || 5 : argv[ji + 1]); // the GPU is shared: past a few browsers at once, everything only gets slower
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { for (let a; a = queue.shift();) res.push(await go(a)); }));
  let p = 0, f = 0;
  for (const a of want) { const r = res.find(r => r.a === a), lines = r.out.split('\n').map(l => l.trimEnd()), m = /^(\d+) passed, (\d+) failed$/.exec(lines.at(-1)), n = m ? +m[1] + +m[2] : 0;
    if (m) { p += +m[1]; f += +m[2]; } else { f++; lines.push('FAIL ' + a + ' area crashed'); }
    console.log(`${a.padEnd(6)} ${r.s.toFixed(1).padStart(6)} s  ${m ? m[1] + ' passed, ' + m[2] + ' failed' : 'crashed'}${AREAS[a][0] && n !== AREAS[a][0] ? `  (expected ${AREAS[a][0]} checks, ran ${n})` : ''}`);
    for (const l of lines.slice(0, m ? -1 : undefined)) if (l) console.log('  ' + l); }
  console.log(`${p} passed, ${f} failed  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(f ? 1 : 0);
}
let fails = 0, passes = 0;
const all = argv.includes('--all');
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; if (all || !ok) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };

// [name, go(x, z, yaw, keys, secs), expected end state]. Positions within .35; y is the height of the feet.
const R = "['KeyW','ShiftLeft']", P = Math.PI;
const walks = [
  ['toHotel', [3.8, 20, P, R, 1.5], { zone: 'hT', z: 26 }],
  ['toField', [3.8, 50, P, R, 5], { zone: 'fD', sky: 'hill', z: 670 }],
  ['fieldBack', [3.8, 668, 0, R, 5], { zone: 'hT', sky: 'day', z: 48 }],
  ['toMall', [3.8, 45, P / 2, R, 1.5], { zone: 'mL', x: -2.2 }],
  ['toCinema', [3.8, 31, -P / 2, R, 3], { zone: 'cN', x: 15.8, y: -1 }],
  ['cinemaBack', [15, 31, P / 2, R, 3], { zone: 'hT', x: 3, y: 0 }],
  ['toPlay', [-25, 36, P / 2, R, 3.5], { zone: 'sP', x: -37.5, y: -.85 }], // the pit is 85 cm deep since its balls became real (was 55)
  ['pitOut', [-36, 34, -P / 2, R, 2], { zone: 'sP', x: -30.1, y: 0 }],
  ['softWall', [-30, 37, -P / 2, R, 3], { zone: 'mL', x: -19.37 }],
  ['toGarage', [35, 10.9, -P / 2, R, 1.5], { zone: 'pK', x: 41 }],
  ['toLot', [64, 14, -P / 2, R, 5.5], { zone: 'nL', sky: 'night', x: 686 }],
  ['lotBack', [683, 14, P / 2, R, 5], { zone: 'pK', sky: 'day', x: 63 }],
  ['toTerrace', [33, 49.4, -P / 2, R, 7], { zone: 'sK', sky: 'dusk', x: 659.2, y: 0 }],
  ['terraceBack', [652, 649.4, P / 2, R, 5], { zone: 'pV', sky: 'day', x: 32.5, y: -.6 }],
  ['lookout', [683, 649.4, -P / 2, R, 4], { zone: 'sK', y: 5, x: 699 }],
  ['fieldStairs', [22, 692, P, R, 2.5], { zone: 'fD', z: 703.3 }], // runs up the stair and off its top (the jump off it keeps its speed in the air: was 702.55 when the air dragged)
  ['poolSteps', [.5, -5, 0, R, 2], { zone: 'pH', y: -1.2, z: -9.3 }],
  ['poolOut', [.5, -9, P, R, 2.5], { zone: 'pH', y: 0, z: -1.26 }],
  ['poolWall', [0, -12, -P / 2, R, 2.5], { x: 4.7, y: -1.2 }], // the pool side blocks
  ['vaultSteps', [33, 49.4, -P / 2, R, 2], { zone: 't2', x: 39.2, y: 0 }],
  ['fieldEdge', [40, 700, -P / 2, R, 6], { x: 51.7 }], // boundary blocks
  ['terraceRail', [670, 641, 0, R, 2], { z: 639.7 }], // rail blocks
  ['softArch', [-37, 38.8, P, "['KeyW']", 2], { zone: 'sP', z: 40.8 }], // through a 2.05 m arch of the soft play wall
  ['softArchSide', [-36.62, 38.8, P, "['KeyW']", 2], { zone: 'sP', z: 40.8, x: -36.77 }], // off-centre: the arch's curve guides you in toward its middle
  ['fieldWall', [-27, 668, 0, "['KeyW']", 2], { zone: 'fD', z: 665.95 }], // the end wall stops you where the hill is higher than it
  // the hotel's three open doors (east wall, z 42, 45.6, 49): run in, through the dark passage (its turn, for the two that have one), into the place and back out of the same door
  ['toLaundromat', [3.8, 42, -P / 2, R, 2.5], { zone: 'j3', sky: 'night', x: 597.4, z: -608.55 }],
  ['laundromatIn', [597, -608.55, P, R, 1.5], { zone: 'lW', sky: 'night', x: 597, z: -602.6 }],
  ['laundromatOut', [597, -603, 0, R, 2], { zone: 'j3', sky: 'night', z: -608.55 }],
  ['laundromatBack', [597, -608.55, P / 2, R, 3], { zone: 'hT', sky: 'day', x: 2.9, z: 42 }],
  ['toMetro', [3.8, 45.6, -P / 2, R, 2.5], { zone: 'j4', sky: 'night', x: 702.5, z: -593 }],
  ['metroIn', [702, -593, 0, R, 1], { zone: 'mT', sky: 'night', x: 702, z: -597, y: 0 }],
  ['metroOut', [702, -597, P, R, 1.5], { zone: 'j4', sky: 'night', z: -593 }],
  ['metroBack', [702, -593, P / 2, R, 3], { zone: 'hT', sky: 'day', x: 2.9, z: 45.6 }],
  ['toGlasshouse', [3.8, 49, -P / 2, R, 4], { zone: 'gH', sky: 'dusk', z: -600 }],
  ['glasshouseBack', [837, -600, P / 2, R, 5], { zone: 'hT', sky: 'day', x: 2.9, z: 49 }],
];

if (on('move')) {
const dev = run(base + '?dev&bare', `[${walks.map(([, a]) => `dev.go(${a.slice(0, 4).join(",")},${a[4] / 1.5})`).join(',')}]`); // the walks' times were written at the old speeds (1.9 and 4 m/s); the body is 1.5 times faster now
check('dev mode loads without console errors', !dev.errors.length, dev.errors.join(' | ').slice(0, 600));
walks.forEach(([name, , want], k) => {
  const got = dev.result?.[k], bad = got ? Object.entries(want).filter(([key, v]) => typeof v === 'number' ? !(Math.abs(got[key] - v) <= .35) : got[key] !== v) : [1];
  check(name, !bad.length, got ? (bad.length ? `want ${JSON.stringify(want)} got ${JSON.stringify(got)}` : '') : 'no result');
});
}

// Solids and loose things: [name, page function body (dev, P = Math.PI in scope; it returns a value), test of that value in node]. Each starts from a teleport.
const PIT = 'dev.go(-31.6, 30.45, P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.key("Space", true); for (let i = 0; i < 100; i++) { dev.step(1); if (i === 2) dev.key("Space", false); if (i === 30) { dev.key("KeyW", false); dev.key("ShiftLeft", false); } }'; // run down the slide into the pit and jump off its end (the block it stood on became the slide)
const near = (a, b, e = .05) => Math.abs(a - b) <= e;
// The seal: a jump traced in the page (eye heights each frame from take-off, at frame time dt), carried at `top` m/s, must land no farther, at any
// height from 3 m below up to its peak, than the old arc (4.3 m/s against 11, same integration) carried at 6 m/s; below the trace the fall is extended at its own gravity.
const seal = (tr, dt, top) => { const a = tr.slice(), g = (a.at(-3) - 2 * a.at(-2) + a.at(-1)) / dt / dt; let vy = (a.at(-1) - a.at(-2)) / dt; while (a.at(-1) > -3.2) { vy += g * dt; a.push(a.at(-1) + vy * dt); }
  const old = []; for (let f = 0, v = 4.3; f > -3.2 || !old.length;) { v -= 11 * dt; f += v * dt; old.push(f); }
  const land = (h, x) => { const pk = x.indexOf(Math.max(...x)); return x.findIndex((f, i) => i > pk && f <= h) * dt; }; // frames after take-off, as times
  for (let h = -3; h < Math.min(Math.max(...a), Math.max(...old)); h += .02) if (top * land(h, a) > 6 * (land(h, old) + dt) + 1e-9) return false; return true; };
// the night hall's flume: hold keys, turn to face a point every step; up its stair (south from the east deck) to the platform at 3.6 m
const FLUME = 'const F = (await import("/js/zones/nighthall.js")).flume, face = (x, z) => { const p = dev.camera.position; dev.camera.rotation.set(0, Math.atan2(-(x - p.x), -(z - p.z)), 0, "YXZ"); }, hold = (yaw, t) => { dev.camera.rotation.set(0, yaw, 0, "YXZ"); dev.key("KeyW", true); dev.step(t * 40); dev.key("KeyW", false); dev.step(10); return dev.state(); }, steer = (x, z, n = 600) => { dev.key("KeyW", true); for (let i = 0; i < n; i++) { face(x, z); dev.step(1); const p = dev.camera.position; if (Math.hypot(p.x - x, p.z - z) < .2) break; } dev.key("KeyW", false); dev.step(10); return dev.state(); }; dev.go(42.9, -8.6, P);';
const solids = [
  ['walk straight back from the laundromat and the metro: out of the recess to the far wall, turn, and on through the open door without a sidestep', 'const W = ["KeyW", "ShiftLeft"], back = (x, z, yaw, t) => { const s = dev.go(x, z, yaw, W, t); return dev.go(s.x, s.z, P / 2, W, 2); }; return [back(597, -602.6, 0, 1.33), back(702, -597, P, 1)]', ([l, m]) => l.zone === 'hT' && near(l.x, 2.9, .35) && near(l.z, 42, .1) && m.zone === 'hT' && near(m.x, 2.9, .35) && near(m.z, 45.6, .1)],
  ['jump onto the mall bench: standing on its seat (a short tap of W: the air keeps what the jump left with, it no longer slows when W is let go)', 'dev.go(-18, 33.9, P, ["KeyW", "Space"], .05); dev.step(20, .05); return dev.state()', s => near(s.y, .45, .02) && !s.air && near(s.z, 34.6, .2)],
  ['walk into the bench from the front, west and east', 'return [dev.go(-18, 33.4, P, ["KeyW"], 1.5).z, dev.go(-20.2, 34.7, -P / 2, ["KeyW"], 1.5).x, dev.go(-15.8, 34.7, P / 2, ["KeyW"], 1.5).x]', ([s, w, e]) => near(s, 34.18) && near(w, -19.3) && near(e, -16.7)],
  ['walk into the field bench from behind: its back stops you', 'return dev.go(-9.5, 705.4, P / 2, ["KeyW"], 1.5)', s => near(s.x, -9.88) && s.y < 3.3],
  ['the leaf of an open hotel door, swung into its passage, stops you (the passage wall is 0.3 m further)', 'return dev.go(5.7, 41.7, P, ["KeyW"], 1.5)', s => s.z < 42.25 && s.zone === 't3'], // it stands along the north side
  ['walk under the bus shelter roof to its bench', 'return dev.go(688, 31.6, 0, ["KeyW"], 2)', s => near(s.z, 30.15) && near(s.y, 0, .01)],
  ['a jump under the shelter roof stops at it', 'dev.go(688, 30.4, 0); dev.key("Space", true); dev.step(1); dev.key("Space", false); let hi = 0; for (let i = 0; i < 60; i++) { dev.step(1); hi = Math.max(hi, dev.state().y); } return hi', hi => hi > .5 && hi <= 2.4 - 1.75 + .01],
  ['wading through a ring pushes it and it stays in its pool', 'const a = dev.bodies().rings[0]; dev.go(-1.6, -7.2, 0, ["KeyW"], 2.2); dev.step(300); return [a, dev.bodies().rings[0]]', ([a, b]) => Math.hypot(b.x - a.x, b.z - a.z) > .3 && b.x - .55 >= b.pool[0] - 1e-3 && b.x + .55 <= b.pool[2] + 1e-3 && b.z - .55 >= b.pool[1] - 1e-3 && b.z + .55 <= b.pool[3] + 1e-3 && b.y > -.2 && b.y < .1],
  ['jumping into the pit: you reach its floor and the balls are thrown', `const a = Float32Array.from(dev.balls(2)); ${PIT}; const p = dev.balls(2); let moved = 0, low = 9, out = 0, over = 0; for (let i = 0; i < p.length; i += 3) { if (Math.hypot(p[i] - a[i], p[i + 1] - a[i + 1], p[i + 2] - a[i + 2]) > .05) moved++; low = Math.min(low, p[i + 1]); if (p[i] < -41 || p[i] > -27 || p[i + 2] < 28.4 || p[i + 2] > 43.6) out++; if (!(p[i] > -40 && p[i] < -33 && p[i + 2] > 30 && p[i + 2] < 37)) over++; } return { s: dev.state(), moved, low, out, over }`, r => near(r.s.y, -.85, .01) && r.moved > 50 && r.low >= -.755 && !r.out && r.over <= 10], // over: thrown over the rim
  ['the pile comes to rest within 5 s, none under the floor or out of the room', `${PIT}; let n = 0; while (dev.bodies().groups[2].awake && n < 300) { dev.step(1); n++; } const g = dev.bodies().groups[2]; return { n, g }`, ({ n, g }) => n < 300 && g.lo[1] >= -.755 && g.lo[0] >= -41 && g.hi[0] <= -27 && g.lo[2] >= 28.4 && g.hi[2] <= 43.6],
  ['the field ball rolls when walked into, then stops', 'const a = dev.bodies().groups[3].at; dev.go(-8.2, 701.1, P, ["KeyW"], 1.5); let n = 0; while (dev.bodies().groups[3].awake && n < 600) { dev.step(1); n++; } return [a, dev.bodies().groups[3].at, n]', ([a, b, n]) => Math.hypot(b[0] - a[0], b[2] - a[2]) > .5 && n < 600],
  ['loose things cost under 0.3 ms a frame at rest, even standing in the pit', 'dev.go(-31.6, 34.5, P / 2, ["KeyW"], .9); dev.step(600); return [dev.bodies().groups[2].awake, dev.physics(120)]', ([n, ms]) => !n && ms < .3],
  ['a jump in beside the beach ball nudges it (stays low, goes under 3 m), and the rings settle back to the still water', 'const a = dev.bodies().groups.findIndex(g => g.n === 1 && g.at[2] < 0), b = dev.balls(a), s = [b[0], b[2]]; dev.go(5.8, -12, P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.key("Space", true); let top = 0; for (let i = 0; i < 300; i++) { dev.step(1); top = Math.max(top, b[1]); if (i === 2) dev.key("Space", false); if (i === 60) { dev.key("KeyW", false); dev.key("ShiftLeft", false); } } const far = Math.hypot(b[0] - s[0], b[2] - s[1]); dev.go(8, -3, 0); dev.step(900); return [top, far, dev.bodies().rings.map(r => r.y)]', ([top, far, ys]) => top < .4 && far < 3 && ys.every(y => near(y, -.07, .015))],
  ['the field ball run into the door stays in the field', 'dev.go(3.8, 672, 0); dev.balls(3).set([3.8, .17, 667]); dev.go(3.8, 667.8, 0, ["KeyW", "ShiftLeft"], 1.5); dev.step(120); return dev.balls(3)[2]', z => z >= 665.7],
  ['and a splash costs under 1 ms a frame (median) and under 3 ms (95th percentile), the heap falling asleep included', `dev.go(-31.6, 30.6, P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.key("Space", true); const t = []; for (let i = 0; i < 300; i++) { t.push(dev.physics(1)); if (i === 2) dev.key("Space", false); if (i === 30) { dev.key("KeyW", false); dev.key("ShiftLeft", false); } } t.sort((a, b) => a - b); return [t[150], t[285]]`, ([med, p95]) => med < 1 && p95 < 3], // wall-clock: the median and 95th, not the single worst frame, so a busy machine doesn't fail it
  ['walking through a soft play arch off-centre, the eye stays under the arch', 'const out = []; for (const u of [-.4, -.25, .25, .4]) { dev.go(-37 + u, 38.8, P); dev.key("KeyW", true); let worst = 9; for (let i = 0; i < 120; i++) { dev.step(1); const c = dev.camera.position, du = c.x + 37; if (c.z > 39.5 && c.z < 40.2) worst = Math.min(worst, 1.35 + Math.sqrt(Math.max(0, .49 - du * du)) - c.y); } dev.key("KeyW", false); out.push(worst); } return out', w => w.every(m => m > .2)],
  ['pushing the pool-hall beach ball to the pool side keeps it in the water, not lifted out', 'const g = (await import("/js/physics.js")).groups[0], b = g.p; dev.go(2.6, -10.6, 0); b.set([2.6, .09, -11.8]); g.o.set(b); g.v.fill(0); g.still[0] = 0; g.awake = 1; dev.key("KeyW", true); dev.key("ShiftLeft", true); let top = -9; for (let i = 0; i < 240; i++) { dev.step(1); top = Math.max(top, b[1]); } dev.key("KeyW", false); dev.key("ShiftLeft", false); dev.step(300); return [top, b[0], b[2]]', ([top, x, z]) => top < .35 && x > -4 && x < 5 && z > -19 && z < -6],
  ['the field ball holds still on a slope it grips, instead of creeping', 'const g = (await import("/js/physics.js")).groups[3]; dev.go(-5, 684, 0); const x = -8.887, z = 682.564, y = dev.floorH(x, z) + .17; g.p.set([x, y, z]); g.o.set([x, y, z]); g.still[0] = 0; g.awake = 1; let n = 0; while (g.awake && n < 600) { dev.step(1); n++; } return [n, Math.hypot(g.p[0] - x, g.p[2] - z)]', ([n, d]) => n < 600 && d < .05], // it used to crawl here for 40 s, then run
  ['running past the gallery beach ball to the pool steps, it bobs within 20 cm of its rest and settles', 'const g = (await import("/js/physics.js")).groups[1], rest = g.p[1]; dev.go(23.6, 25, P); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.step(240); dev.key("KeyW", false); dev.key("ShiftLeft", false); let top = -9, n = 0; while (g.awake && n < 900) { dev.step(1); n++; top = Math.max(top, g.p[1]); } return [top - rest, n]', ([up, n]) => up < .2 && n < 900],
  ['running through the pool, a ring rides the water: off its height limits, tilted under .2 rad', 'const f = (await import("/js/physics.js")).floaters[0]; dev.go(-3.6, -9.2, -P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); let lo = 9, hi = -9, t = 0; for (let i = 0; i < 240; i++) { dev.step(1); lo = Math.min(lo, f.y); hi = Math.max(hi, f.y); t = Math.max(t, Math.hypot(f.ax, f.az)); } dev.key("KeyW", false); dev.key("ShiftLeft", false); return [lo, hi, t]', ([lo, hi, t]) => lo > -.135 && hi < -.005 && t < .2],
  ['a jump at the pit wall gets you out of the pit', 'dev.go(-38, 33.5, P / 2, ["KeyW"], 2); dev.key("KeyW", true); dev.key("Space", true); dev.step(2); dev.key("Space", false); dev.step(60); dev.key("KeyW", false); dev.step(30); return dev.state()', s => s.x < -40 && near(s.y, 0, .01)],
  // the jump (js/player.js): two gravities with today's peak; momentum kept in the air; held Space hops without ground friction; strafe-turning gains up to TOP
  ['a jump peaks at today\'s 0.8 m, falls faster than it rises, and lands no farther at top speed than a run did with the old arc, at any height', `const tr = dt => { dev.go(690, 20, 0); const e = dev.camera.position.y, t = []; dev.key("Space", true); for (let i = 0; i < 99; i++) { dev.step(1, dt); dev.key("Space", false); if (!dev.state().air && i > 2) break; t.push(dev.camera.position.y - e); } return t; }; return [tr(1 / 60), tr(.05)]`, ([a, b]) => { const pk = Math.max(...a), up = a.indexOf(pk); return near(pk, .8, .02) && a.length - up < up && [[a, 1 / 60], [b, .05]].every(([t, dt]) => seal(t, dt, 7.2)); }],
  ['a running jump lands at take-off speed, keys held or let go mid-air, and held Space hops on at it', 'const v = () => Math.hypot(dev.vel.x, dev.vel.y), K = d => ["KeyW", "ShiftLeft"].forEach(k => dev.key(k, d)), out = []; for (const rel of [0, 1]) { dev.go(682, 20, -P / 2); K(true); dev.step(60); dev.key("Space", true); dev.step(2); dev.key("Space", false); if (rel) K(false); while (dev.state().air) dev.step(1); out.push(v()); K(false); } dev.go(682, 20, -P / 2); K(true); dev.step(60); dev.key("Space", true); let n = 0, was = 0; while (n < 5) { dev.step(1); const a = dev.state().air; if (was && !a) { n++; out.push(v()); } was = a; } K(false); dev.key("Space", false); return out', v => v.every(x => near(x, 6, 1e-3))],
  ['strafe-turning hops from walking speed build to the 7.2 m/s cap and never past it', 'const v = () => Math.hypot(dev.vel.x, dev.vel.y), K = d => ["KeyW", "KeyD", "Space"].forEach(k => dev.key(k, d)); dev.go(700, 30, 0); K(true); let yaw = 0, top = 0; for (let i = 0; i < 240; i++) { yaw -= .07; dev.camera.rotation.set(0, yaw, 0, "YXZ"); dev.step(1, 1 / 30); top = Math.max(top, v()); } K(false); return top', top => top > 7.19 && top <= 7.2 + 1e-9],
  ['a hop chain in the water, arriving at 7.2 m/s, never beats the old water speeds: 6 m/s in the shallows, wading 3.3 in the deep (the air eases to it at rate 3 as it always did: under 3.9 after 0.6 s)', 'const v = () => Math.hypot(dev.vel.x, dev.vel.y), K = d => ["KeyW", "ShiftLeft", "Space"].forEach(k => dev.key(k, d)), chain = (x, z, yaw, n, dt) => { dev.go(x, z, yaw); K(true); dev.vel.set(-Math.sin(yaw) * 7.2, -Math.cos(yaw) * 7.2); let top = 0, late = 0; for (let i = 0; i < n; i++) { dev.step(1, dt); top = Math.max(top, v()); if (i * dt > .6) late = Math.max(late, v()); } K(false); return [top, late]; }; return [1 / 60, 1 / 144].flatMap(dt => [chain(10, -12, -P / 2, 1.6 / dt, dt), chain(-2.5, -14, -P / 2, .9 / dt, dt)])', r => r.every(([top, late], k) => top <= 6 + 1e-9 && (k % 2 === 0 || late < 3.9))],
  ['at top speed with 0.05 s frames: every passage warp lands in its twin, and the 2 cm terrace pane stops you from both sides', 'const { warps } = await import("/js/build.js"); const go = (x, z, dx, dz, n) => { dev.go(x, z, Math.atan2(-dx, -dz)); dev.key("Space", true); dev.step(1, .05); for (let k = 0; k < n; k++) { dev.vel.set(dx * 7.2, dz * 7.2); dev.step(1, .05); } dev.key("Space", false); dev.step(20, .05); return dev.state(); }; const w = warps.map(w => { const t = warps.find(v => Math.abs(v[4] + w[4]) < 1e-6 && Math.abs(v[5] + w[5]) < 1e-6 && Math.hypot((v[0] + v[2] - w[0] - w[2]) / 2 - w[4], (v[1] + v[3] - w[1] - w[3]) / 2 - w[5]) < 1), cx = (w[0] + w[2]) / 2, cz = (w[1] + w[3]) / 2, bx = (t[0] + t[2]) / 2 - w[4], bz = (t[1] + t[3]) / 2 - w[5], l = Math.hypot(cx - bx, cz - bz), dx = (cx - bx) / l, dz = (cz - bz) / l, s = go(cx - dx * 1.6, cz - dz * 1.6, dx, dz, 9); return (s.x - w[4] - cx) * dx + (s.z - w[5] - cz) * dz; }); return [w, go(657, 646.2, 0, 1, 16).z, go(657, 649, 0, -1, 16).z]', ([w, s, n]) => w.length >= 12 && w.every(a => a > .6) && s < 647.6 - .29 && n > 647.62 + .29],
  ['standing still among the pit balls uploads nothing to the fine mesh', 'const g = (await import("/js/physics.js")).groups[2]; dev.go(-31.6, 34.5, P / 2, ["KeyW"], .9); dev.step(400); const v = g.fine.instanceMatrix.version + g.fine.instanceColor.version; dev.step(60); return [g.fine.count, g.fine.instanceMatrix.version + g.fine.instanceColor.version - v]', ([k, d]) => k > 20 && d === 0],
  ['every ball mesh, fine ones too, keeps its own material, not one swapped in while programs compile', 'const g = (await import("/js/physics.js")).groups; return g.flatMap(x => [x.mesh, x.fine].filter(Boolean).map(m => m.material.type))', t => t.length > 4 && t.every(s => s !== "MeshNormalMaterial" && s !== "MeshDepthMaterial")],
  ['night hall flume: up the stair onto the platform (3.6 m), its south wall, west and east rails and the north rail by the stair stop you; north from the west corner the tub wall turns you into the flume, not off the edge', `${FLUME} const top = hold(P, 5), w = hold(P / 2, 3), n = hold(0, 3); steer(41.9, -1); return [top, w, n, hold(0, 2), steer(42, -.5) && hold(-P / 2, 2)]`, ([t, w, n, nr, e]) => near(t.y, 3.6, .01) && near(t.z, -.32, .05) && near(w.x, 39.66, .08) && near(w.y, 3.6, .01) && n.y > 3.3 && (n.z > -2.8 || Math.abs(n.x - 40.4) < .5) && near(nr.z, -2.47, .08) && near(nr.y, 3.6, .01) && near(e.x, 43.1, .08) && near(e.y, 3.6, .01)],
  ['night hall flume: from the platform into the start tub and run down it, in its bed all the way, out into the pool; its side wall stops you', `${FLUME} steer(42.9, -2.2); steer(40.4, -1.9); const a0 = F.at(2.5); steer(a0[0], a0[2]); const side = hold(-P / 2, 1); let s = 2, lat = 0, dy = 0; dev.key("KeyW", true); dev.key("ShiftLeft", true);
    for (let i = 0; i < 1800 && s < F.L - .3; i++) { const p = dev.camera.position; let best = 9, bs = s; for (let t = s; t < Math.min(F.L, s + 1.5); t += .02) { const a = F.at(t), d = Math.hypot(a[0] - p.x, a[2] - p.z); if (d < best) { best = d; bs = t; } } s = bs;
      const a = F.at(s); lat = Math.max(lat, best); dy = Math.max(dy, Math.abs(dev.state().y - a[1])); const b = F.at(s + 1); face(b[0], b[2]); dev.step(1); }
    dev.step(90); dev.key("KeyW", false); dev.key("ShiftLeft", false); dev.step(30); return { side, s, L: F.L, lat, dy, end: dev.state() }`, r => near(r.side.x, 40.55, .06) && r.side.y > 3.2 && r.s >= r.L - .3 && r.lat < .2 && r.dy < .12 && r.end.x < 33 && near(r.end.y, -1.2, .02) && r.end.zone === 'pN'],
  ['walk under the flume platform along the south deck, between its posts, to the east wall', 'return dev.go(36.5, -1.4, -P / 2, ["KeyW"], 5)', s => near(s.x, 44.7, .05) && near(s.y, 0, .01)],
  ['in the pit the near balls are drawn with the fine shape, none from afar','const Ph = await import("/js/physics.js"), g = Ph.groups[2]; dev.go(-31.6, 34.5, P / 2, ["KeyW"], .9); dev.step(2); const near = g.fine.count; dev.go(-20, 36, P / 2); dev.step(2); return [near, g.fine.count]', ([near, far]) => near > 20 && far === 0],
  ['a door opens on E away from you: shut it stops you; E within reach then W walks you through (from the hallway and from the vestibule, the portal behind it); closing, it stops against you in its swing, not moving you, and shuts once you step clear', 'const B = await import("/js/build.js"), d = B.doors[0], E = () => { dev.key("KeyE", true); dev.step(1); dev.key("KeyE", false); }, r = {}, S = () => { const s = dev.state(); return [s.zone, +s.x.toFixed(2), +s.z.toFixed(2)]; }; r.shut = dev.go(3.1, 34.8, P / 2, ["KeyW"], 1.5).zone; dev.go(3.1, 34.8, P / 2); E(); r.h = dev.go(3.1, 34.8, P / 2, ["KeyW"], 1.3); dev.go(302.8, 300.9, 0); E(); dev.step(70); r.closed = d.f; E(); r.v = dev.go(302.8, 300.9, 0, ["KeyW"], 1.3); d.set(0, 1); d.u = d.to = 0; dev.go(3.1, 34.8, P / 2); E(); dev.step(70); dev.go(302.95, 299.85, P / 2); E(); dev.step(70); r.wait = [d.f, ...S()]; dev.go(302.8, 301.5, 0); dev.step(70); r.after = d.f; return r', r => r.shut === 'hT' && r.h.zone === 'hV' && Math.abs(r.h.x - 302.8) < .05 && r.closed === 0 && r.v.zone === 'hT' && Math.abs(r.v.z - 34.8) < .05 && r.wait[0] > .2 && r.wait[0] < 1 && r.wait[2] === 302.95 && r.after === 0],
  // pools that touch are one sheet of water (js/water.js): the arcade channel ran into an unseen wall at the night hall, and a ripple stopped dead at the join
  ['a ring pushed across the arcade / night hall join floats on into the night hall, and a ripple runs across the join at one height', 'const W = await import("/js/water.js"), f = (await import("/js/physics.js")).floaters.find(q => q.w.zone.id === "pC"), was = { ...f }; dev.go(14, -12, -P / 2); Object.assign(f, { x: 23.2, z: -12, vx: 1.5, vz: 0 }); dev.step(240); const ring = [f.x, f.y, f.w.zone.id]; Object.assign(f, was); const S = W.ponds.find(w => w.zone.id === "pC").sheet, R = S.rect, b = new Uint16Array(4); W.ripple(S, [[23.4, -12, .02]]); dev.step(15); const h = x => { dev.renderer.readRenderTargetPixels(S.sim[0], Math.floor((x - R.x) * 20), Math.floor((-12 - R.y) * 20), 1, 1, b); return dev.THREE.DataUtils.fromHalfFloat(b[0]); }; return [ring, h(23.975), h(24.025)]', ([r, a, b]) => r[0] > 24.2 && r[1] > -.1 && r[1] < .05 && r[2] === 'pN' && Math.abs(a) > .002 && Math.abs(b - a) < .2 * Math.abs(a)],
];
// The area of each solids entry, in order: m move, s solid, l loose, p perf (wall-clock budgets, run alone). Entries of one area share a page, in this order: a
// ball test leaves the pit and the rings as it found them for the next, so the loose ones stay together.
const solidArea = 'mmsssssllllpllpsllllmmmmmmllsmslml', AN = { m: 'move', s: 'solid', l: 'loose', p: 'perf' };
if (solidArea.length !== solids.length) throw new Error(`solidArea has ${solidArea.length} letters for ${solids.length} entries`);
const mine = solids.filter((_, k) => AN[solidArea[k]] === A);
if (mine.length) {
  const loose = run(base + '?dev&bare', `(async () => { const P = Math.PI, out = []; for (const f of [${mine.map(([, e]) => `async () => { ${e} }`).join(',')}]) out.push(await f()); return out; })()`);
  if (on('solid')) check('solids page loads without console errors', !loose.errors.length, loose.errors.join(' | ').slice(0, 600));
  else if (loose.errors.length) check(`${A}: its solids page loads without console errors`, false, loose.errors.join(' | ').slice(0, 600));
  mine.forEach(([name, , ok], k) => { const got = loose.result?.[k]; let pass = false; try { pass = got !== undefined && ok(got); } catch {} check(name, pass, pass ? '' : 'got ' + JSON.stringify(got)); });
}

// Cost guards: a place drawn under another place's sky shows as draw calls at the terrace lookout (42 when only the terrace is
// drawn, 238 with the main building); a shader compiled late (a hitch on first sight) shows as programs growing on a tour of every zone, four ways, and the passages.
if (on('load') || on('perf')) {
const cost = run(base + '?dev#702.5,649.4,1.5708,-0.2', `(() => { dev.hold = true; dev.step(2); const look = dev.info().calls, p0 = dev.renderer.info.programs.length;
  for (const z of Object.values(dev.zones)) for (const yaw of [0, 1.57, 3.14, 4.71]) dev.go(z.probe.x, z.probe.z, yaw);
  const P = Math.PI, R = ['KeyW', 'ShiftLeft']; dev.go(3.8, 50.5, P, R, 6); dev.go(3.8, 668, 0, R, 5); dev.go(65.5, 14, -P / 2, R, 6); dev.go(683, 14, P / 2, R, 5); dev.go(34, 49.4, -P / 2, R, 7); dev.go(652, 649.4, P / 2, R, 5);
  const took = n => Math.round(performance.getEntriesByName(n)[0]?.duration ?? 1e9);
  return { look, p0, p1: dev.renderer.info.programs.length, load: dev.readyAt, bake: Math.round(dev.lib.ms), sign: took('load: first sign'), openings: took('load: openings') }; })()`);
if (on('load')) {
check('cost page loads without console errors', !cost.errors.length, cost.errors.join(' | ').slice(0, 600));
check('only the terrace is drawn at the terrace lookout (under 120 draw calls; 238 when other places leak in)', cost.result?.look < 120, JSON.stringify(cost.result));
check('no shader compiles after load on a tour of every zone and passage', cost.result && cost.result.p1 === cost.result.p0, JSON.stringify(cost.result));
} else {
// Load guards, loose enough for a shared GPU and a cold CDN: the library bake (every showroom set too) took 3.5 s when its
// programs compiled again, one by one, on first draw; it takes about 0.5 s with them compiled ahead
check('the material library bakes in under 6 s (0.5 s on a quiet GPU; other agents share it)', cost.result?.bake < 6000, JSON.stringify(cost.result));
check('dev mode is ready in under 30 s', cost.result?.load < 30000, JSON.stringify(cost.result));
// the first sign's lettering waited 2.5-5 s on its font's start-up on most loads until index.html drew that font first (about 5 ms now);
// the search for the openings between zones took half a second when every sample scanned every solid (about 25 ms now)
check('the first sign is drawn in under 0.5 s and the openings are found in under 0.2 s', cost.result?.sign < 500 && cost.result?.openings < 200, JSON.stringify(cost.result));
}
}

// Frame-cost ceilings at the two heaviest views of the real game (every pass of one frame). Before places were culled by what can be
// seen from where you stand (js/seen.js) the gallery drew 902 calls / 6.9 M triangles; now about 340 / 1.4 M, the corridor 680 / 3.2 M.
if (on('load')) for (const [name, hash, calls, tris] of [['gallery-pool', '23.2,14.2,3.14159,-0.08', 500, 2.5e6], ['corridor', '10.5,10.8,-1.5708,0', 900, 4.2e6]]) {
  const f = run(base + '?dev&bare#' + hash, `(() => { dev.hold = true; dev.step(60); const n = dev.info(); return { calls: n.calls, tris: n.triangles }; })()`);
  check(`${name} draws under ${calls} calls and ${tris / 1e6} M triangles a frame`, f.result?.calls < calls && f.result?.tris < tris, JSON.stringify(f.result));
}
// The pool's underwater picture is taken from the eye: a scene hook calling getWorldPosition() once reset three's Refractor camera
// to the origin, and the arcade's water showed the sea under it instead of its basin.
if (on('water')) { const f = run(base + '?dev&bare#10.5,-12,-1.5708,-0.05', `(() => { dev.hold = true; dev.step(3); const P = new dev.THREE.Vector3(), e = dev.camera.getWorldPosition(new dev.THREE.Vector3()); let d = -1;
    dev.scene.traverse(o => { if (o.lens && o.rect.x < e.x && e.x < o.rect.z && o.rect.y < e.z && e.z < o.rect.w) d = P.setFromMatrixPosition(o.lens.camera.matrixWorld).distanceTo(e); }); return { d: +d.toFixed(3) }; })()`);
  check('the arcade water\'s underwater picture is taken from the eye', f.result?.d >= 0 && f.result.d < .01, JSON.stringify(f.result)); }
// The water's pictures against direct renders (dev.waterCheck, surface flat): the lens must carry what pierces the surface (the steps'
// rail, a column under water) and show no band; it once fell back to the pool's top-down plan there (seam 16, mean 6.0; now 0.6, 4.6).
if (on('water')) { const f = run(base + '?dev&bare', `({ steps: dev.waterCheck(0.5, -5.3, 0, -0.95), column: dev.waterCheck(28, -4.5, 0, -0.7) })`);
  const s = f.result?.steps, c = f.result?.column;
  check('the pools\' lens and mirror pictures match direct renders (no seam, nothing piercing the water lost)', s && c && s.lens.seam < 4 && c.lens.mean < 5.3 && s.mirror.mean < 6 && c.mirror.mean < 6, JSON.stringify({ s, c })); }
// Coplanar pools share only the mirror/lens pair of the current scene render. Compare the actual final pixels with
// the original per-pool captures, at all quality levels and changing views without advancing the shader clock.
if (on('water')) { const f = run(base + '?dev&bare', `(async () => {
    const { waterViews } = await import('/js/water.js');
    const r = dev.renderer, gl = r.getContext(), draw = r.render, cases = [
      [10.5, 1.62, 10.8, -1.5708, 0], [23.2, 1.62, 14.2, Math.PI, -.08],
      [43.6, 1.62, -13, 2.63, .22], [41.8, 5.22, -1.2, .6, -.3],
      [8.3, .5, -12, -1.5708, -.4], [10.5, 2.46, .4, Math.PI, 1.1],
      [16, -.122, -12, -1.5708, -.1], [16, -.12, -12, -1.5708, -.1], [16, -.118, -12, -1.5708, -.1]
    ];
    let captures = 0, maxCaptures = 0, maxMean = 0, maxDelta = 0, count = 0;
    r.render = function (s, c) { if (s === dev.scene && c !== dev.camera) captures++; return draw.call(this, s, c); };
    dev.reset(10.5, 10.8, -1.5708); dev.step(90);
    try { for (let q = 0; q < 3; q++) {
      dev.settings.s.q = q; dev.settings.load();
      const size = r.getDrawingBufferSize(new dev.THREE.Vector2()), a = new Uint8Array(size.x * size.y * 4), b = new Uint8Array(a.length);
      for (const v of cases) {
        waterViews.reuse = false; dev.view(...v); gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, a);
        captures = 0; waterViews.reuse = true; dev.view(...v); gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, b);
        maxCaptures = Math.max(maxCaptures, captures); let sum = 0;
        for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; maxDelta = Math.max(maxDelta, d); }
        maxMean = Math.max(maxMean, sum / a.length); count++;
      }
    } } finally { r.render = draw; waterViews.reuse = true; dev.settings.s.q = 2; dev.settings.load(); }
    return { count, maxCaptures, maxMean, maxDelta };
  })()`);
  check('shared pool pictures match per-pool captures across qualities and same-clock camera changes', f.result?.count === 27 && f.result.maxMean < .05 && f.result.maxDelta <= 8 && !f.errors.length, JSON.stringify(f));
  check('at most one mirror/lens pair is rendered per main scene render', f.result?.maxCaptures === 2 && !f.errors.length, JSON.stringify(f.result)); }

if (on('water')) { const f = run(base + '?dev&bare', `(async () => (await import('/tools/water-optics.js')).waterOptics(dev))()`);
  check('pool focusing is bounded, balanced, animated, depth-filtered and responds to disturbances', f.result && Object.values(f.result.field).every(Boolean) && !f.errors.length, JSON.stringify(f.result || f));
  check('all four pool palettes retain finite nonnegative water and visible caustic modulation', f.result?.rows.length === 4 && f.result.rows.every(row => row.waterPixels > 10000 && row.nonfinite === 0 && row.negative === 0 && row.meanLinearModulation > 1e-5) && !f.errors.length, JSON.stringify(f.result?.rows || f));
  check('water optics stays within sixteen active samplers without GL errors', f.result?.maxSamplers <= 16 && f.result.glError === 0 && !f.errors.length, JSON.stringify(f.result && { samplers: f.result.maxSamplers, glError: f.result.glError })); }

if (on('look')) { const f = run(base + '?dev&bare', `(async () => (await import('/tools/grass-viewport.js')).grassViewport(dev))()`);
  check('stationary narrow-to-wide resize shows the same grass as a freshly rebuilt view', f.result?.samePose && f.result.width === 1280 && f.result.height === 720 && f.result.maxDelta <= 1 && f.result.meanDelta <= .01 && f.result.glError === 0 && !f.errors.length, JSON.stringify(f.result || f)); }

// No two faces of different materials in one plane (they z-fight, the flicker on door frames and passages): tools/seams.mjs --scan, every sky's places.
if (on('solid')) try { execFileSync(process.execPath, [fileURLToPath(new URL('./seams.mjs', import.meta.url)), '--port', base.split(':')[2].slice(0, -1), '--scan'], { encoding: 'utf8' }); check('no coplanar overlapping faces (tools/seams.mjs --scan)', true); }
catch (e) { check('no coplanar overlapping faces (tools/seams.mjs --scan)', false, String(e.stdout || e.message).slice(0, 600)); }
// Reflections where a mirror puts them: the mall's skylight in its marble floor, from two places (tools/reflect.mjs; 568 px off before box projection, 5 after).
if (on('water')) { let r; try { r = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./reflect.mjs', import.meta.url)), '--port', base.split(':')[2].slice(0, -1), '--only', 'mL', '--json'], { encoding: 'utf8' })); } catch (e) { r = String(e.stdout || e.message).slice(0, 600); }
  check('the mall floor mirrors its skylight within 25 px of where a mirror puts it, from both places', Array.isArray(r) && r.length === 2 && r.every(m => m.err !== null && m.err < 25), JSON.stringify(r)); }
// What can be seen from where: js/seen.js must still cover every zone the eye can see from each zone (a new doorway or window needs tools/pvs.mjs run again).
if (on('seen')) try { execFileSync(process.execPath, [fileURLToPath(new URL('./pvs.mjs', import.meta.url)), '--port', base.split(':')[2].slice(0, -1), '--check'], { encoding: 'utf8' }); check('js/seen.js covers what each zone can see (tools/pvs.mjs --check)', true); }
catch (e) { check('js/seen.js covers what each zone can see (tools/pvs.mjs --check)', false, String(e.stdout || e.message).slice(0, 600)); }
// Portals (tools/portals.mjs): through the hotel's west door and the vestibule's south door, walking and hopping at 7.2 m/s, lands on the line
// taken through, facing right, in the far zone, with no jump of mood or lamps; the picture with the eye in the plane is the same from both
// sides, and moving through the plane in 2 cm steps shows no seam. (Visibility treating an opening as shut is the seen check's.)
if (on('move')) { const q = 'portals: walk and hop through both ways, one picture either side of the plane, the far side clipped at its plane (tools/portals.mjs)';
  try { execFileSync(process.execPath, [fileURLToPath(new URL('./portals.mjs', import.meta.url)), '--port', base.split(':')[2].slice(0, -1), '--only', '0,1', '--modes', 'walk,hop,same,sweep,clip,leak,deep'], { encoding: 'utf8' }); check(q, true); }
  catch (e) { check(q, false, String(e.stdout || e.message).split('\n').filter(l => !l.startsWith('ok')).join('\n').slice(0, 600)); } }
// A room's lamps are on as you step in (tools/probe.mjs): opening the lift lobby's and the baths passage's doors from the hallway and walking
// through, every lamp the game lights in the room entered is fully on from 10 frames before the crossing to 30 after (they were still coming up at it).
if (on('move')) { const q = 'lamps: a room opened and walked into is fully lit as you step in (tools/probe.mjs --only lobby38,baths24)';
  try { execFileSync(process.execPath, [fileURLToPath(new URL('./probe.mjs', import.meta.url)), '--port', base.split(':')[2].slice(0, -1), '--only', 'lobby38,baths24'], { encoding: 'utf8' }); check(q, true); }
  catch (e) { check(q, false, String(e.stdout || e.message).slice(0, 600)); } }
// Nothing pops in at a doorway: crossing each opening (20 cm steps, standing and mid-jump eyes), every mesh in view is on the camera's layers.
if (on('solid')) try { execFileSync(process.execPath, [fileURLToPath(new URL('./seams.mjs', import.meta.url)), '--port', base.split(':')[2].slice(0, -1), '--pop', '--fast'], { encoding: 'utf8' }); check('nothing pops in crossing an opening (tools/seams.mjs --pop --fast)', true); }
catch (e) { check('nothing pops in crossing an opening (tools/seams.mjs --pop --fast)', false, String(e.stdout || e.message).slice(0, 600)); }
// Pool pictures skipped while a pool is hidden, or cut to what the screen samples (water.js), never show: the night hall's openings
// run through, jumped, spun at and flicked round, each frame against the same frame drawn with the culling off.
if (on('water')) { let out; try { out = execFileSync(process.execPath, [fileURLToPath(new URL('./pool-skip.mjs', import.meta.url)), '--port', base.split(':')[2].slice(0, -1), '--only', 'pN'], { encoding: 'utf8' }); } catch (e) { out = String(e.stdout || e.message); }
  const m = /(\d+) frames \((\d+) with a picture skipped\).*: (\d+) differ/.exec(out);
  check('skipped and cut pool pictures never show (tools/pool-skip.mjs --only pN)', m && +m[2] > 20 && +m[3] === 0, out.slice(0, 600)); }
// No light through walls: from each zone, every shadow map holds every caster (three culls casters by the eye's layers; build.js turns them all on).
if (on('light')) try { execFileSync(process.execPath, [fileURLToPath(new URL('./leaks.mjs', import.meta.url)), '--port', base.split(':')[2].slice(0, -1), '--fast'], { encoding: 'utf8' }); check('every shadow map has every caster (tools/leaks.mjs --fast)', true); }
catch (e) { check('every shadow map has every caster (tools/leaks.mjs --fast)', false, String(e.stdout || e.message).slice(0, 600)); }
// A redraw asked for only by loose things copies the map's cached static casters back and draws just the loose things (physics.js):
// after rings drift, a ball pit is jumped into and the field's ball is kicked, every map so redrawn equals the same map drawn in full.
if (on('light')) { const f = run(base + '?dev&bare', `(async () => { const { renderer: r, scene, camera } = dev, ls = [...(await import('/js/lights.js')).lights, (await import('/js/sky.js')).sun], SM = r.shadowMap, out = [];
    const read = () => ls.map(l => { const m = l.shadow.map, a = new Uint8Array(m.width * m.height * 4); r.readRenderTargetPixels(m, 0, 0, m.width, m.height, a); return a; });
    for (const [x, z, yaw, keys] of [[26.5, -12, -1.75, ['KeyW']], [-28, 36, 1.5708, ['KeyW', 'Space']], [-8.2, 700, Math.PI, ['KeyW', 'ShiftLeft']]]) {
      dev.hold = true; dev.reset(x, z, yaw, 0); dev.step(2); let n = 0; const inner = SM.render; SM.render = function (lights, ...a) { if (SM.needsUpdate) for (const l of lights) if (l.isDirectionalLight ? l.shadow.needsUpdate : l.shadow.loose && !l.shadow.needsUpdate) n++; return inner.call(this, lights, ...a); };
      dev.go(x, z, yaw, keys, 3); dev.step(300); SM.render = inner;
      ls.forEach(l => { if (l.isDirectionalLight) l.shadow.needsUpdate = true; else l.shadow.loose = true; }); SM.needsUpdate = true; r.render(scene, camera); const A = read(); // the sun has no cache: a loose thing under it asks for a full redraw (needsUpdate), so it is read after one
      ls.forEach(l => l.shadow.needsUpdate = true); SM.needsUpdate = true; r.render(scene, camera); const B = read();
      out.push({ n, diff: A.reduce((t, a, i) => { for (let k = 0; k < a.length; k++) if (a[k] !== B[i][k]) t++; return t; }, 0) }); }
    return out; })()`);
  check('shadow maps redrawn for loose things alone match the full redraw (night hall rings, ball pit, field ball)', f.result?.length === 3 && f.result.every(o => o.n > 0 && o.diff === 0) && !f.errors.length, JSON.stringify(f.result || f.errors)); }
// Every zone seen.js lists is culled: its meshes have a layer bit of their own group, not layer 0 (drawn from everywhere). Bits once ran
// out at 31 zones and the 32nd on stayed on layer 0 unnoticed.
if (on('look')) { const f = run(base + '?dev&bare', `(async () => { const seen = (await import('/js/seen.js')).default, bad = new Set(), got = new Set();
    dev.scene.traverse(o => { const id = o.userData?.zone; if (o.isMesh && id in seen) { got.add(id); if (o.layers.mask === 1) bad.add(id); } });
    return { bad: [...bad], none: Object.keys(seen).filter(id => !got.has(id)) }; })()`);
  check('every zone in js/seen.js is culled (its meshes on a layer bit, not drawn from everywhere)', f.result && !f.result.bad.length && !f.result.none.length, JSON.stringify(f.result)); }

// Noclip (V): through the soft play's east wall (walking stops at x -19.37, softWall above), up with nothing under you and staying there,
// about 12 m/s (30 running); turned off inside a solid it puts you back where it was turned on, on the floor; off in the air over a floor
// you land; above a ceiling it puts you back too. Then walking is as before: the same walk as softWall, from the same start, ends at the same wall.
if (on('move')) { const f = run(base + '?dev', `(async () => { const P = Math.PI, v = () => { dev.key('KeyV', true); dev.step(1); dev.key('KeyV', false); dev.step(1); }, s = () => dev.state(), r = {};
  const fly = (keys, n) => { for (const c of keys) dev.key(c, true); dev.step(n); const a = s(); dev.step(30); const b = s(); for (const c of keys) dev.key(c, false); dev.step(30); return [a, b]; };
  const speed = ([a, b]) => +(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 2).toFixed(1);
  dev.reset(-30, 37, -P / 2); dev.step(10); v(); r.walk = speed(fly(['KeyW'], 60)); r.through = s().x; r.run = speed(fly(['KeyW', 'ShiftLeft'], 60));
  dev.reset(-30, 37, -P / 2); dev.step(10); v(); fly(['Space'], 30); const hi = s(); dev.step(120); r.rise = +hi.y.toFixed(1); r.hover = +(s().y - hi.y).toFixed(3); v(); dev.step(30); const g = s();
  r.roofOff = Math.hypot(g.x + 30, g.z - 37) < .05 && Math.abs(g.y) < .02 && !g.air; // above the soft play's ceiling: back to the start, not onto its roof
  const { colliders } = await import('/js/build.js'), c = colliders.find(c => !c[6] && c[4] <= 0 && c[5] > 2 && c[2] - c[0] > 1 && c[3] - c[1] > 1 && c[0] > -30 && c[2] < 30 && c[1] > -30 && c[3] < 40);
  dev.reset(-30, 37, -P / 2); dev.step(10); const s0 = s(); v(); dev.camera.position.x = (c[0] + c[2]) / 2; dev.camera.position.z = (c[1] + c[3]) / 2; dev.step(5); v(); dev.step(30); const e = s();
  r.wallOff = [e.x - s0.x, e.y - s0.y, e.z - s0.z].every(d => Math.abs(d) < .05) && !e.air;
  dev.reset(-30, 37, -P / 2); dev.step(10); v(); dev.key('Space', true); dev.step(12); dev.key('Space', false); dev.step(20); const up = s(); v(); dev.step(150); const l = s(); r.airOff = up.y > 1.5 && Math.abs(l.y - s0.y) < .02 && !l.air && Math.hypot(l.x - up.x, l.z - up.z) < .05;
  dev.reset(-30, 37, -P / 2); dev.step(10); v(); v(); r.after = dev.go(-30, 37, -P / 2, ['KeyW', 'ShiftLeft'], 3).x;
  return r; })()`);
  const r = f.result || {}, ok = r.through > -18.5 && Math.abs(r.walk - 12) < 1 && Math.abs(r.run - 30) < 2 && r.rise > 3 && Math.abs(r.hover) < .01 && r.roofOff && r.wallOff && r.airOff && Math.abs(r.after + 19.37) < .35;
  check('noclip flies through walls and up at 12 / 30 m/s, and turning it off leaves you standing somewhere sane', ok && !f.errors.length, JSON.stringify(f)); }

// Every registered ladder (plain ?dev, so the yard's dry one too), from the water: forward facing it, forward at 0.9 rad off it, jump alone,
// run; from the deck: walk off toward the water, and back down facing it. Each must arrive (on the deck, or standing in the water) with the
// eye never moving more than 4 cm in a frame (the climb itself is 3). Then, at the bottom, off it turned away, left and right, and back up.
// Ladders once only worked from one side of a pool, and later held the body at the bottom for good.
if (on('move')) { const f = run(base + '?dev', `(async () => { const { ladders } = await import('/js/build.js'), P = Math.PI, out = [];
  for (const [x1, z1, x2, z2, dx, dz, top] of ladders) { const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, yaw = Math.atan2(-dx, -dz), b = () => { const s = dev.state(); return .15 - ((s.x - cx) * dx + (s.z - cz) * dz); };
    const up = () => { const s = dev.state(); return Math.abs(s.y - top) < .02 && !s.air && b() < .1; }, dn = () => { const s = dev.state(); return s.y < top - .5 && !s.air && b() > .25; };
    // off: in the pool, a metre from the ladder and out of its zone; or, where a pool wall is nearer than that (the gallery's ladders are 0.7 m
    // from its south wall), stopped against it at least 0.3 m to the side, three times what the rails' hold allowed
    const away = () => { let q, n = 0; return () => { const s = dev.state(), a = Math.abs((s.x - cx) * -dz + (s.z - cz) * dx), still = q && Math.hypot(s.x - q.x, s.z - q.z) < .001; q = s; n = still ? n + 1 : 0;
      return s.y < top - .3 && (Math.hypot(s.x - cx, s.z - cz) > 1 && !(s.x > x1 && s.x < x2 && s.z > z1 && s.z < z2) || n > 10 && a > .3); }; };
    const hold = (keys, face, until, n) => { dev.camera.rotation.set(0, face, 0, 'YXZ'); for (const c of keys) dev.key(c, true); let y0 = dev.camera.position.y, jump = 0, i = 0;
      for (; i < n && !until(); i++) { dev.step(1); const y = dev.camera.position.y; jump = Math.max(jump, Math.abs(y - y0)); y0 = y; } for (const c of keys) dev.key(c, false); dev.step(5); return i < n ? +jump.toFixed(3) : -1; };
    const water = () => { dev.reset(cx - dx * .5, cz - dz * .5, yaw); dev.step(20); }, onto = () => hold(['KeyW'], yaw, () => b() < -.5, 60), r = { at: [+cx.toFixed(1), +cz.toFixed(1)] };
    const down = () => { water(); hold(['KeyW'], yaw, up, 300); onto(); return hold(['KeyS'], yaw, dn, 200); };
    water(); r.upW = hold(['KeyW'], yaw, up, 300); water(); r.upSide = hold(['KeyW'], yaw + .9, up, 300);
    water(); r.upJump = hold(['Space'], yaw, up, 300); onto(); r.downW = hold(['KeyW'], yaw + P, dn, 200);
    r.upRun = hold(['KeyW', 'ShiftLeft'], yaw, up, 300); onto(); r.downBack = hold(['KeyS'], yaw, dn, 200);
    // then off at the bottom: turned round and walking away, then back up; and sideways either way, facing the ladder
    r.offAway = hold(['KeyW'], yaw + P, away(), 120); r.again = hold(['KeyW'], yaw, up, 400);
    down(); r.offLeft = hold(['KeyA'], yaw, away(), 120); down(); r.offRight = hold(['KeyD'], yaw, away(), 120); out.push(r); }
  return out; })()`, '--wait', '300000');
  const bad = (f.result || []).filter(r => Object.entries(r).some(([k, v]) => k !== 'at' && !(v >= 0 && v <= .04)));
  check('every ladder climbs up from the water and down from the deck, either way round, smoothly, and lets go at the bottom', f.result?.length >= 7 && !bad.length && !f.errors.length, JSON.stringify(bad.length ? bad : f).slice(0, 600)); }

// The settings panel (js/settings.js): High is the default render; volume and quality set through the panel reach the master gain and the
// pixel ratio and come back from storage (load() is what a reload runs); the fps readout gives a plausible number once on, and its toggle is saved.
if (on('look')) { const f = run(base + '?dev&bare', `(async () => { const a = await import('/js/audio.js'), $ = id => document.getElementById(id), r = {};
    r.def = [dev.renderer.getPixelRatio(), dev.settings.s.q, document.querySelector('[data-q="2"]').getAttribute('aria-pressed')];
    a.startAudio(Object.values(dev.zones)[0]); $('pv').value = 50; $('pv').dispatchEvent(new Event('input')); document.querySelector('[data-q="0"]').click();
    r.set = [+a.sound.gain.value.toFixed(3), dev.renderer.getPixelRatio()];
    a.sound.set(1, false); dev.settings.s.q = 2; dev.settings.s.vol = 100; dev.settings.load(); r.back = [+a.sound.gain.value.toFixed(3), dev.renderer.getPixelRatio()];
    document.querySelector('[data-q="2"]').click(); r.high = dev.renderer.getPixelRatio(); r.hid = $('f').hidden;
    dev.fps = true; dev.settings.load(); await new Promise(ok => setTimeout(ok, 1200)); r.fps = +$('f').dataset.fps; $('pf').click();
    r.saved = JSON.parse(localStorage.getItem('dreamcore.settings')); r.off = $('f').hidden; return r; })()`);
  const r = f.result || {};
  check('settings: High is the default and draws at the full pixel ratio', r.def?.[0] === 1 && r.def[1] === 2 && r.def[2] === 'true' && r.high === 1, JSON.stringify(r));
  check('settings: the panel sets the master gain and the pixel ratio, and they survive a reload', r.set?.[0] === .25 && r.set[1] === .6 && r.back?.[0] === .25 && r.back[1] === .6, JSON.stringify(r));
  check('settings: fps readout hidden under ?dev, plausible when on, toggle saved', r.hid === true && r.fps > 5 && r.fps < 1000 && r.off === true && r.saved?.fps === false && !f.errors.length, JSON.stringify(f).slice(0, 600)); }

// Music (js/music.js): every zone names a piece or deliberately none; a crossfade between neighbours (backrooms to pool hall) keeps the summed power of its
// fade gains within 1.5 dB, adds no sample step much larger than the music's own notes make, and nothing reaches full scale before the master compressor.
if (on('sound')) { const f = run(base + '?dev&bare', `(async () => { const Z = dev.zones, P = dev.music.pieces, sr = 44100, r = {};
    r.bad = Object.values(Z).filter(z => !('music' in z) || z.music !== null && !P[z.music]).map(z => z.id);
    const seq = [[0, Z.bA], [8, Z.pH]], m = await dev.music.render(seq, 20), law = (await dev.music.render(seq, 20, { tap: true })).buf.getChannelData(0);
    r.law = 0; for (let i = 8 * sr; i < 18 * sr; i++) r.law = Math.max(r.law, Math.abs(10 * Math.log10(law[i] + 1e-20)));
    let jf = 0, je = 0, pk = 0; for (const c of [0, 1]) { const d = m.buf.getChannelData(c); for (let i = 1; i < d.length; i++) { const j = Math.abs(d[i] - d[i - 1]), t = i / sr;
      if (t > 7.5 && t < 14) jf = Math.max(jf, j); else if (t > 3) je = Math.max(je, j); pk = Math.max(pk, Math.abs(d[i])); } }
    Object.assign(r, { jf, je, pk }); return r; })()`, '--wait', '300000');
  const r = f.result || {};
  check('music: every zone names its piece, a neighbour crossfade holds its level with no click, nothing clips', r.bad?.length === 0 && r.law < 1.5 && r.jf <= Math.max(r.je * 1.5, .03) && r.pk < .9 && !f.errors.length, JSON.stringify(f).slice(0, 600)); }

// The single file (tools/bundle.mjs -> dreamcore.html): current with the code, no URL outside a comment or the licence but
// createElementNS's XHTML namespace (a name, never fetched), no CDN at all, and from file:// it reaches dev.ready with no console
// error and no request but itself. The served game asks nothing of any host but its own.
if (on('load')) { const { bundle } = await import('./bundle.mjs'), { readFileSync, existsSync } = await import('node:fs'), file = fileURLToPath(new URL('../dreamcore.html', import.meta.url));
  const have = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
  check('dreamcore.html is current (rebuild: node tools/bundle.mjs)', have === bundle());
  const a = have.indexOf('const src = ') + 12, b = have.indexOf(', imports = {};'), bad = [];
  let parts = []; try { parts = [have.slice(0, a) + have.slice(b), ...Object.values(JSON.parse(have.slice(a, b)))]; } catch { bad.push('module sources unreadable'); }
  for (const p of parts) for (const m of p.matchAll(/https?:\/\/[^\s'"`)]*/g)) { const pre = p.slice(p.lastIndexOf('\n', m.index) + 1, m.index), before = p.slice(0, m.index);
    const comment = /\/\/|^\s*\*/.test(pre) || before.lastIndexOf('/*') > before.lastIndexOf('*/') || before.lastIndexOf('<!--') > before.lastIndexOf('-->');
    if (!comment && m[0] !== 'http://www.w3.org/1999/xhtml') bad.push(m[0]); }
  if (/jsdelivr|unpkg|cdnjs|esm\.sh|skypack|jspm|googleapis/i.test(have)) bad.push('a CDN host');
  check('dreamcore.html has no URL outside comments and none to a CDN', !bad.length, bad.join(' ').slice(0, 600));
  const f = run(pathToFileURL(file).href + '?dev&bare', '({ ready: dev.ready, zone: dev.state().zone })');
  check('dreamcore.html from file:// reaches dev.ready with no console errors and no requests', f.result?.ready === true && !f.errors.length && f.requests?.length === 1 && f.requests[0].startsWith(pathToFileURL(file).href), JSON.stringify(f).slice(0, 600));
  const dv = run(base + '?dev&bare', 'dev.ready'), other = (dv.requests || []).filter(u => !u.startsWith(base));
  check('the served game requests nothing from any other host', dv.requests?.length > 0 && !other.length, other.join(' ').slice(0, 600)); }

// Production address: no window.dev, the start overlay is up once the level is built.
// Between places: every opening found at load can be walked straight through its middle (none lies on a wall), and walking out
// of a dark passage the view from its mouth never gets brighter than both its ends anywhere (the grey haze the mood once eased through).
if (on('look')) { const f = run(base + '?dev&bare', `(async () => { const L = await import('/js/lights.js'), PL = await import('/js/player.js'), r = dev.renderer, gl = r.getContext(), out = { walls: [], n: L.openings?.length };
  for (const o of L.openings || []) { const c = (o.lo + o.hi) / 2, [x, z] = o.ax ? [c, o.at - 1] : [o.at - 1, c]; const s = dev.go(x, z, o.ax ? Math.PI : -Math.PI / 2, ['KeyW'], 2 / 2.85);
    if (s.zone !== o.q.id) out.walls.push(o.p.id + '>' + o.q.id + ' ended in ' + s.zone); }
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4), grab = () => { r.setRenderTarget(null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); const g = new Float32Array(W * H); for (let i = 0; i < g.length; i++) g[i] = .2126 * px[4 * i] + .7152 * px[4 * i + 1] + .0722 * px[4 * i + 2]; return g; };
  out.wash = {}; for (const [n, x, z0, dz] of [['u0>fD', 3.8, 665.6, 1], ['t3>hT', 5.3, 41.95, 0], ['u2>sK', 650.4, 649.4, 0]]) { // [name, mouth x, z, walking +z (else +x)]
    const yaw = dz ? Math.PI : -Math.PI / 2, at = s => dz ? [x, z0 + s] : [x + s, z0], y = dev.floorH(x, z0) + 1.62, hs = [];
    dev.reset(...at(-2.5), yaw, 0); for (let s = -2.5; s <= 1.2; s += 2.85 / 60) { PL.place(...at(s), yaw, 0); dev.uTime.value = -1 / 60; dev.step(1); /* the grain held still */ dev.view(x, y, z0, yaw, 0); hs.push(grab()); }
    for (let k = 0; k < 16; k++) { dev.uTime.value = -15 / 60; dev.step(15); dev.view(x, y, z0, yaw, 0); hs.push(grab()); } // then 4 s standing: the end state is the settled one
    const a = hs[0], b = hs[hs.length - 1]; let worst = 0; for (const h of hs) { let t = 0; for (let i = 0; i < h.length; i++) t += Math.max(0, h[i] - Math.max(a[i], b[i]) - 2); worst = Math.max(worst, t / h.length); }
    out.wash[n] = +worst.toFixed(2); }
  // the shares as you walk: a 10 cm lattice flooded from both sides of every opening, carrying the zone you would be in (the box there,
  // else the last), its largest change between neighbours; and both ends of every passage warp (a few points of its strip, and where each lands)
  const Z = Object.values(dev.zones), { colliders, floorH, warps, ends, side, across } = await import('/js/build.js'), S = .1, inb = (x, z, b) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3], boxz = (x, z) => Z.find(q => inb(x, z, q.box));
  const vec = (x, z, zn) => { const m = new Map(); for (const [q, v] of L.weights(x, z, zn)) m.set(q.id, (m.get(q.id) || 0) + v); return m; }, dist = (a, b) => Math.max(...[...new Set([...a.keys(), ...b.keys()])].map(k => Math.abs((a.get(k) || 0) - (b.get(k) || 0))));
  const near = (x, z) => L.openings.some(o => { const [s, t] = o.ax ? [x, z] : [z, x]; return Math.max(o.lo - s, s - o.hi, 0) <= 3 && Math.abs(t - o.at) <= 3; });
  const fc = new Map(), free = (i, j) => { const k = i + ',' + j, x = i * S, z = j * S; if (!fc.has(k)) { const f = floorH(x, z); fc.set(k, near(x, z) && !ends.some(e => side(e, x, z) < 0 && side(e, x, z) > -1.5 && Math.abs(across(e, x, z)) < e.w / 2 + .3) && !colliders.some(c => x > c[0] - .28 && x < c[2] + .28 && z > c[1] - .28 && z < c[3] + .28 && c[4] < f + 1.7 && c[5] > f + .35)); } return fc.get(k); };
  const seen = new Set(), q = L.openings.flatMap(o => [[o.p, -1], [o.q, 1]].map(([zn, t]) => { const c = (o.lo + o.hi) / 2, [x, z] = o.ax ? [c, o.at + t] : [o.at + t, c]; return [Math.round(x / S), Math.round(z / S), zn]; }));
  out.jump = { d: 0 }; while (q.length) { const [i, j, zn] = q.pop(), key = i + ',' + j + zn.id; if (seen.has(key) || !free(i, j)) continue; seen.add(key); const ma = vec(i * S, j * S, zn), f0 = floorH(i * S, j * S);
    for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]]) { const i2 = i + di, j2 = j + dj; if (!free(i2, j2) || Math.abs(floorH(i2 * S, j2 * S) - f0) > .35) continue;
      const zb = boxz(i2 * S, j2 * S) || zn, d = dist(ma, vec(i2 * S, j2 * S, zb)); if (d > out.jump.d) out.jump = { d: +d.toFixed(3), at: [i * S, j * S].map(v => +v.toFixed(2)), from: zn.id, to: zb.id }; q.push([i2, j2, zb]); } }
  const look = m => ['exp', 'bloom', 'sat', 'shaft'].map(k => [...m].reduce((s, [id, v]) => s + v * dev.zones[id][k], 0)).concat([...m].reduce((s, [id, v]) => s + v * dev.zones[id].fog.w, 0));
  out.warp = 0; for (const w of warps) for (const u of [.02, .5, .98]) for (const v of [.02, .5, .98]) { const x = w[0] + (w[2] - w[0]) * u, z = w[1] + (w[3] - w[1]) * v, a = look(vec(x, z, boxz(x, z))), b = look(vec(x + w[4], z + w[5], boxz(x + w[4], z + w[5])));
    out.warp = Math.max(out.warp, ...a.map((e, k) => Math.abs(e - b[k]))); }
  return out; })()`, '--size', '480x270');
  check('every opening between places can be walked through (none on a wall)', f.result?.n > 20 && !f.result.walls.length, JSON.stringify(f.result?.walls ?? f.errors));
  check('the shares of the mood never jump between neighbouring 10 cm steps around an opening (one zone to the next)', f.result?.jump?.d < .1, JSON.stringify(f.result?.jump ?? f.errors));
  check('both ends of every passage warp show the same mood', f.result?.warp === 0, JSON.stringify(f.result?.warp ?? f.errors));
  check('no grey wash leaving a dark passage', f.result && Object.values(f.result.wash).every(v => v < .3), JSON.stringify(f.result?.wash ?? f.errors)); }

if (on('load')) {
const prod = run(base, `await new Promise(ok => { const t = setInterval(() => /click to enter/.test(document.getElementById('s').textContent) && (clearInterval(t), ok()), 100); }),
  { dev: typeof window.dev, overlay: getComputedStyle(document.getElementById('o')).display !== 'none' }`, '--wait', '15000', '--settle', '0'); // browse.mjs waits out --wait for a dev.ready that never comes here
check('production loads without console errors', !prod.errors.length, prod.errors.join(' | ').slice(0, 600));
check('production has no window.dev', prod.result?.dev === 'undefined', JSON.stringify(prod.result));
check('production shows the start overlay', prod.result?.overlay === true);
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
