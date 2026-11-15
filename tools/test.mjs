// Regression suite: loads the game with and without ?dev through tools/browse.mjs, walks the routes between places with dev.go
// and checks where you end up. One line per check; exit code 1 if any fails.
//   node tools/test.mjs [--port 8200] [--all]   (default prints only failed checks and a final count; --all prints every line)
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), i = argv.indexOf('--port'), base = `http://127.0.0.1:${i < 0 ? 8200 : argv[i + 1]}/`;
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const run = (url, expr, ...opt) => { // -> {result, errors}; browse.mjs exits 1 on page errors, which is still a result to report
  try { return JSON.parse(execFileSync(process.execPath, [browse, '--url', url, '--eval', expr, ...opt], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch (e) { try { return JSON.parse(e.stdout); } catch { return { result: null, errors: [String(e.stderr || e.message)] }; } }
};
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
  ['toPlay', [-25, 36, P / 2, R, 3.5], { zone: 'sP', x: -36.9, y: -.85 }], // the pit is 85 cm deep since its balls became real (was 55)
  ['pitOut', [-36, 34, -P / 2, R, 2], { zone: 'sP', x: -30.1, y: 0 }],
  ['softWall', [-30, 37, -P / 2, R, 3], { zone: 'mL', x: -19.37 }],
  ['toGarage', [35, 10.9, -P / 2, R, 1.5], { zone: 'pK', x: 41 }],
  ['toLot', [64, 14, -P / 2, R, 5.5], { zone: 'nL', sky: 'night', x: 686 }],
  ['lotBack', [683, 14, P / 2, R, 5], { zone: 'pK', sky: 'day', x: 63 }],
  ['toTerrace', [33, 49.4, -P / 2, R, 7], { zone: 'sK', sky: 'dusk', x: 659.2, y: 0 }],
  ['terraceBack', [652, 649.4, P / 2, R, 5], { zone: 'pV', sky: 'day', x: 32.9, y: -.6 }],
  ['lookout', [683, 649.4, -P / 2, R, 4], { zone: 'sK', y: 5, x: 699 }],
  ['fieldStairs', [22, 692, P, R, 2.5], { zone: 'fD', z: 702 }], // runs up the stair and off its top
  ['poolSteps', [.5, -5, 0, R, 2], { zone: 'pH', y: -1.2, z: -9.3 }],
  ['poolOut', [.5, -9, P, R, 2.5], { zone: 'pH', y: 0, z: -1.26 }],
  ['poolWall', [0, -12, -P / 2, R, 2.5], { x: 4.7, y: -1.2 }], // the pool side blocks
  ['vaultSteps', [33, 49.4, -P / 2, R, 2], { zone: 't2', x: 39.2, y: 0 }],
  ['fieldEdge', [40, 700, -P / 2, R, 6], { x: 51.7 }], // boundary blocks
  ['terraceRail', [670, 641, 0, R, 2], { z: 639.7 }], // rail blocks
  ['softArch', [-37, 38.8, P, "['KeyW']", 2], { zone: 'sP', z: 40.8 }], // through a 2.05 m arch of the soft play wall
  ['softArchSide', [-36.62, 38.8, P, "['KeyW']", 2], { zone: 'sP', z: 40.8, x: -36.77 }], // off-centre: the arch's curve guides you in toward its middle
  ['fieldWall', [-27, 668, 0, "['KeyW']", 2], { zone: 'fD', z: 665.95 }], // the end wall stops you where the hill is higher than it
];

const dev = run(base + '?dev&bare', `[${walks.map(([, a]) => `dev.go(${a.join(',')})`).join(',')}]`);
check('dev mode loads without console errors', !dev.errors.length, dev.errors.join(' | ').slice(0, 600));
walks.forEach(([name, , want], k) => {
  const got = dev.result?.[k], bad = got ? Object.entries(want).filter(([key, v]) => typeof v === 'number' ? !(Math.abs(got[key] - v) <= .35) : got[key] !== v) : [1];
  check(name, !bad.length, got ? (bad.length ? `want ${JSON.stringify(want)} got ${JSON.stringify(got)}` : '') : 'no result');
});

// Solids and loose things: [name, page function body (dev, P = Math.PI in scope; it returns a value), test of that value in node]. Each starts from a teleport.
const PIT = 'dev.go(-31.6, 30.45, P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.key("Space", true); for (let i = 0; i < 100; i++) { dev.step(1); if (i === 2) dev.key("Space", false); if (i === 30) { dev.key("KeyW", false); dev.key("ShiftLeft", false); } }'; // run down the slide into the pit and jump off its end (the block it stood on became the slide)
const near = (a, b, e = .05) => Math.abs(a - b) <= e;
const solids = [
  ['jump onto the mall bench: standing on its seat', 'return dev.go(-18, 33.9, P, ["KeyW", "Space"], .35)', s => near(s.y, .45, .02) && !s.air && near(s.z, 34.6, .2)],
  ['walk into the bench from the front, west and east', 'return [dev.go(-18, 33.4, P, ["KeyW"], 1.5).z, dev.go(-20.2, 34.7, -P / 2, ["KeyW"], 1.5).x, dev.go(-15.8, 34.7, P / 2, ["KeyW"], 1.5).x]', ([s, w, e]) => near(s, 34.18) && near(w, -19.3) && near(e, -16.7)],
  ['walk into the field bench from behind: its back stops you', 'return dev.go(-9.5, 705.4, P / 2, ["KeyW"], 1.5)', s => near(s.x, -9.88) && s.y < 3.3],
  ['walk under the bus shelter roof to its bench', 'return dev.go(688, 31.6, 0, ["KeyW"], 2)', s => near(s.z, 30.15) && near(s.y, 0, .01)],
  ['a jump under the shelter roof stops at it', 'dev.go(688, 30.4, 0); dev.key("Space", true); dev.step(1); dev.key("Space", false); let hi = 0; for (let i = 0; i < 60; i++) { dev.step(1); hi = Math.max(hi, dev.state().y); } return hi', hi => hi > .5 && hi <= 2.4 - 1.75 + .01],
  ['wading through a ring pushes it and it stays in its pool', 'const a = dev.bodies().rings[0]; dev.go(-1.6, -7.2, 0, ["KeyW"], 2.2); dev.step(300); return [a, dev.bodies().rings[0]]', ([a, b]) => Math.hypot(b.x - a.x, b.z - a.z) > .3 && b.x - .55 >= b.pool[0] - 1e-3 && b.x + .55 <= b.pool[2] + 1e-3 && b.z - .55 >= b.pool[1] - 1e-3 && b.z + .55 <= b.pool[3] + 1e-3 && b.y > -.2 && b.y < .1],
  ['jumping into the pit: you reach its floor and the balls are thrown', `const a = Float32Array.from(dev.balls(2)); ${PIT}; const p = dev.balls(2); let moved = 0, low = 9, out = 0, over = 0; for (let i = 0; i < p.length; i += 3) { if (Math.hypot(p[i] - a[i], p[i + 1] - a[i + 1], p[i + 2] - a[i + 2]) > .05) moved++; low = Math.min(low, p[i + 1]); if (p[i] < -41 || p[i] > -27 || p[i + 2] < 28.4 || p[i + 2] > 43.6) out++; if (!(p[i] > -40 && p[i] < -33 && p[i + 2] > 30 && p[i + 2] < 37)) over++; } return { s: dev.state(), moved, low, out, over }`, r => near(r.s.y, -.85, .01) && r.moved > 50 && r.low >= -.755 && !r.out && r.over <= 10], // over: thrown over the rim
  ['the pile comes to rest within 5 s, none under the floor or out of the room', `${PIT}; let n = 0; while (dev.bodies().groups[2].awake && n < 300) { dev.step(1); n++; } const g = dev.bodies().groups[2]; return { n, g }`, ({ n, g }) => n < 300 && g.lo[1] >= -.755 && g.lo[0] >= -41 && g.hi[0] <= -27 && g.lo[2] >= 28.4 && g.hi[2] <= 43.6],
  ['the field ball rolls when walked into, then stops', 'const a = dev.bodies().groups[3].at; dev.go(-8.2, 701.1, P, ["KeyW"], 1.5); let n = 0; while (dev.bodies().groups[3].awake && n < 600) { dev.step(1); n++; } return [a, dev.bodies().groups[3].at, n]', ([a, b, n]) => Math.hypot(b[0] - a[0], b[2] - a[2]) > .5 && n < 600],
  ['loose things cost under 0.3 ms a frame at rest, even standing in the pit', 'dev.go(-31.6, 34.5, P / 2, ["KeyW"], 1.5); dev.step(600); return [dev.bodies().groups[2].awake, dev.physics(120)]', ([n, ms]) => !n && ms < .3],
  ['a jump in beside the beach ball nudges it (stays low, goes under 3 m), and the rings settle back to the still water', 'const a = dev.bodies().groups.findIndex(g => g.n === 1 && g.at[2] < 0), b = dev.balls(a), s = [b[0], b[2]]; dev.go(5.8, -12, P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.key("Space", true); let top = 0; for (let i = 0; i < 300; i++) { dev.step(1); top = Math.max(top, b[1]); if (i === 2) dev.key("Space", false); if (i === 60) { dev.key("KeyW", false); dev.key("ShiftLeft", false); } } const far = Math.hypot(b[0] - s[0], b[2] - s[1]); dev.go(8, -3, 0); dev.step(900); return [top, far, dev.bodies().rings.map(r => r.y)]', ([top, far, ys]) => top < .4 && far < 3 && ys.every(y => near(y, -.07, .015))],
  ['the field ball run into the door stays in the field', 'dev.go(3.8, 672, 0); dev.balls(3).set([3.8, .17, 667]); dev.go(3.8, 667.8, 0, ["KeyW", "ShiftLeft"], 1.5); dev.step(120); return dev.balls(3)[2]', z => z >= 665.7],
  ['and a splash costs under 1 ms a frame (median) and under 3 ms (95th percentile), the heap falling asleep included', `dev.go(-31.6, 30.6, P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.key("Space", true); const t = []; for (let i = 0; i < 300; i++) { t.push(dev.physics(1)); if (i === 2) dev.key("Space", false); if (i === 30) { dev.key("KeyW", false); dev.key("ShiftLeft", false); } } t.sort((a, b) => a - b); return [t[150], t[285]]`, ([med, p95]) => med < 1 && p95 < 3], // wall-clock: the median and 95th, not the single worst frame, so a busy machine doesn't fail it
  ['walking through a soft play arch off-centre, the eye stays under the arch', 'const out = []; for (const u of [-.4, -.25, .25, .4]) { dev.go(-37 + u, 38.8, P); dev.key("KeyW", true); let worst = 9; for (let i = 0; i < 120; i++) { dev.step(1); const c = dev.camera.position, du = c.x + 37; if (c.z > 39.5 && c.z < 40.2) worst = Math.min(worst, 1.35 + Math.sqrt(Math.max(0, .49 - du * du)) - c.y); } dev.key("KeyW", false); out.push(worst); } return out', w => w.every(m => m > .2)],
  ['pushing the pool-hall beach ball to the pool side keeps it in the water, not lifted out', 'const g = (await import("/js/physics.js")).groups[0], b = g.p; dev.go(2.6, -10.6, 0); b.set([2.6, .09, -11.8]); g.o.set(b); g.v.fill(0); g.still[0] = 0; g.awake = 1; dev.key("KeyW", true); dev.key("ShiftLeft", true); let top = -9; for (let i = 0; i < 240; i++) { dev.step(1); top = Math.max(top, b[1]); } dev.key("KeyW", false); dev.key("ShiftLeft", false); dev.step(300); return [top, b[0], b[2]]', ([top, x, z]) => top < .35 && x > -4 && x < 5 && z > -19 && z < -6],
  ['the field ball holds still on a slope it grips, instead of creeping', 'const g = (await import("/js/physics.js")).groups[3]; dev.go(-5, 684, 0); const x = -8.887, z = 682.564, y = dev.floorH(x, z) + .17; g.p.set([x, y, z]); g.o.set([x, y, z]); g.still[0] = 0; g.awake = 1; let n = 0; while (g.awake && n < 600) { dev.step(1); n++; } return [n, Math.hypot(g.p[0] - x, g.p[2] - z)]', ([n, d]) => n < 600 && d < .05], // it used to crawl here for 40 s, then run
  ['running past the gallery beach ball to the pool steps, it bobs within 20 cm of its rest and settles', 'const g = (await import("/js/physics.js")).groups[1], rest = g.p[1]; dev.go(23.6, 25, P); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.step(240); dev.key("KeyW", false); dev.key("ShiftLeft", false); let top = -9, n = 0; while (g.awake && n < 900) { dev.step(1); n++; top = Math.max(top, g.p[1]); } return [top - rest, n]', ([up, n]) => up < .2 && n < 900],
  ['running through the pool, a ring rides the water: off its height limits, tilted under .2 rad', 'const f = (await import("/js/physics.js")).floaters[0]; dev.go(-3.6, -9.2, -P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); let lo = 9, hi = -9, t = 0; for (let i = 0; i < 240; i++) { dev.step(1); lo = Math.min(lo, f.y); hi = Math.max(hi, f.y); t = Math.max(t, Math.hypot(f.ax, f.az)); } dev.key("KeyW", false); dev.key("ShiftLeft", false); return [lo, hi, t]', ([lo, hi, t]) => lo > -.135 && hi < -.005 && t < .2],
  ['a jump at the pit wall gets you out of the pit', 'dev.go(-38, 33.5, P / 2, ["KeyW"], 2); dev.key("KeyW", true); dev.key("Space", true); dev.step(2); dev.key("Space", false); dev.step(60); dev.key("KeyW", false); dev.step(30); return dev.state()', s => s.x < -40 && near(s.y, 0, .01)],
  ['standing still among the pit balls uploads nothing to the fine mesh', 'const g = (await import("/js/physics.js")).groups[2]; dev.go(-31.6, 34.5, P / 2, ["KeyW"], 1.5); dev.step(400); const v = g.fine.instanceMatrix.version + g.fine.instanceColor.version; dev.step(60); return [g.fine.count, g.fine.instanceMatrix.version + g.fine.instanceColor.version - v]', ([k, d]) => k > 20 && d === 0],
  ['every ball mesh, fine ones too, keeps its own material, not one swapped in while programs compile', 'const g = (await import("/js/physics.js")).groups; return g.flatMap(x => [x.mesh, x.fine].filter(Boolean).map(m => m.material.type))', t => t.length > 4 && t.every(s => s !== "MeshNormalMaterial" && s !== "MeshDepthMaterial")],
  ['in the pit the near balls are drawn with the fine shape, none from afar','const Ph = await import("/js/physics.js"), g = Ph.groups[2]; dev.go(-31.6, 34.5, P / 2, ["KeyW"], 1.5); dev.step(2); const near = g.fine.count; dev.go(-20, 36, P / 2); dev.step(2); return [near, g.fine.count]', ([near, far]) => near > 20 && far === 0],
];
const loose = run(base + '?dev&bare', `(async () => { const P = Math.PI, out = []; for (const f of [${solids.map(([, e]) => `async () => { ${e} }`).join(',')}]) out.push(await f()); return out; })()`);
check('solids page loads without console errors', !loose.errors.length, loose.errors.join(' | ').slice(0, 600));
solids.forEach(([name, , ok], k) => { const got = loose.result?.[k]; let pass = false; try { pass = got !== undefined && ok(got); } catch {} check(name, pass, pass ? '' : 'got ' + JSON.stringify(got)); });

// Cost guards: a place drawn under another place's sky shows as draw calls at the terrace lookout (42 when only the terrace is
// drawn, 238 with the main building); a shader compiled late (a hitch on first sight) shows as programs growing on a tour of every zone, four ways, and the passages.
const cost = run(base + '?dev#702.5,649.4,1.5708,-0.2', `(() => { dev.hold = true; dev.step(2); const look = dev.info().calls, p0 = dev.renderer.info.programs.length;
  for (const z of Object.values(dev.zones)) for (const yaw of [0, 1.57, 3.14, 4.71]) dev.go(z.probe.x, z.probe.z, yaw);
  const P = Math.PI, R = ['KeyW', 'ShiftLeft']; dev.go(3.8, 50.5, P, R, 6); dev.go(3.8, 668, 0, R, 5); dev.go(65.5, 14, -P / 2, R, 6); dev.go(683, 14, P / 2, R, 5); dev.go(34, 49.4, -P / 2, R, 7); dev.go(652, 649.4, P / 2, R, 5);
  return { look, p0, p1: dev.renderer.info.programs.length, load: dev.readyAt, bake: Math.round(dev.lib.ms) }; })()`);
check('cost page loads without console errors', !cost.errors.length, cost.errors.join(' | ').slice(0, 600));
check('only the terrace is drawn at the terrace lookout (under 120 draw calls; 238 when other places leak in)', cost.result?.look < 120, JSON.stringify(cost.result));
check('no shader compiles after load on a tour of every zone and passage', cost.result && cost.result.p1 === cost.result.p0, JSON.stringify(cost.result));
// Load guards, loose enough for a shared GPU and a cold CDN: the library bake (every showroom set too) took 3.5 s when its
// programs compiled again, one by one, on first draw; it takes about 0.5 s with them compiled ahead
check('the material library bakes in under 6 s (0.5 s on a quiet GPU; other agents share it)', cost.result?.bake < 6000, JSON.stringify(cost.result));
check('dev mode is ready in under 30 s', cost.result?.load < 30000, JSON.stringify(cost.result));

// Production address: no window.dev, the start overlay is up once the level is built.
const prod = run(base, `await new Promise(ok => { const t = setInterval(() => /click to enter/.test(document.getElementById('s').textContent) && (clearInterval(t), ok()), 100); }),
  { dev: typeof window.dev, overlay: getComputedStyle(document.getElementById('o')).display !== 'none' }`, '--wait', '15000', '--settle', '0'); // browse.mjs waits out --wait for a dev.ready that never comes here
check('production loads without console errors', !prod.errors.length, prod.errors.join(' | ').slice(0, 600));
check('production has no window.dev', prod.result?.dev === 'undefined', JSON.stringify(prod.result));
check('production shows the start overlay', prod.result?.overlay === true);
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
