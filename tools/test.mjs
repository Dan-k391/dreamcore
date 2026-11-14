// Regression suite: loads the game with and without ?dev through tools/browse.mjs, walks the routes between places with dev.go
// and checks where you end up. One line per check; exit code 1 if any fails.
//   node tools/test.mjs [--port 8200]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), i = argv.indexOf('--port'), base = `http://127.0.0.1:${i < 0 ? 8200 : argv[i + 1]}/`;
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const run = (url, expr, ...opt) => { // -> {result, errors}; browse.mjs exits 1 on page errors, which is still a result to report
  try { return JSON.parse(execFileSync(process.execPath, [browse, '--url', url, '--eval', expr, ...opt], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch (e) { try { return JSON.parse(e.stdout); } catch { return { result: null, errors: [String(e.stderr || e.message)] }; } }
};
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };

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
  ['softWall', [-30, 36, -P / 2, R, 3], { zone: 'mL', x: -19.8 }],
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
  ['softArch', [-37, 38.8, P, "['KeyW']", 2], { zone: 'sP', z: 40.8 }], // through a 1.7 m arch of the soft play wall
  ['fieldWall', [-27, 668, 0, "['KeyW']", 2], { zone: 'fD', z: 665.95 }], // the end wall stops you where the hill is higher than it
];

const dev = run(base + '?dev', `[${walks.map(([, a]) => `dev.go(${a.join(',')})`).join(',')}]`);
check('dev mode loads without console errors', !dev.errors.length, dev.errors.join(' | ').slice(0, 600));
walks.forEach(([name, , want], k) => {
  const got = dev.result?.[k], bad = got ? Object.entries(want).filter(([key, v]) => typeof v === 'number' ? !(Math.abs(got[key] - v) <= .35) : got[key] !== v) : [1];
  check(name, !bad.length, got ? (bad.length ? `want ${JSON.stringify(want)} got ${JSON.stringify(got)}` : '') : 'no result');
});

// Solids and loose things: [name, page function body (dev, P = Math.PI in scope; it returns a value), test of that value in node]. Each starts from a teleport.
const PIT = 'dev.go(-31.6, 30.6, P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.key("Space", true); for (let i = 0; i < 100; i++) { dev.step(1); if (i === 2) dev.key("Space", false); if (i === 30) { dev.key("KeyW", false); dev.key("ShiftLeft", false); } }'; // run and jump off the block beside the pit
const near = (a, b, e = .05) => Math.abs(a - b) <= e;
const solids = [
  ['jump onto the mall bench: standing on its seat', 'return dev.go(-18, 33.9, P, ["KeyW", "Space"], .35)', s => near(s.y, .45, .02) && !s.air && near(s.z, 34.6, .2)],
  ['walk into the bench from the front, west and east', 'return [dev.go(-18, 33.4, P, ["KeyW"], 1.5).z, dev.go(-20.2, 34.7, -P / 2, ["KeyW"], 1.5).x, dev.go(-15.8, 34.7, P / 2, ["KeyW"], 1.5).x]', ([s, w, e]) => near(s, 34.18) && near(w, -19.5) && near(e, -16.5)],
  ['walk into the field bench from behind: its back stops you', 'return dev.go(6, 682.8, P, ["KeyW"], 1.5)', s => near(s.z, 683.42) && s.y < 1.2],
  ['walk under the bus shelter roof to its bench', 'return dev.go(688, 31.6, 0, ["KeyW"], 2)', s => near(s.z, 30.15) && near(s.y, 0, .01)],
  ['a jump under the shelter roof stops at it', 'dev.go(688, 30.4, 0); dev.key("Space", true); dev.step(1); dev.key("Space", false); let hi = 0; for (let i = 0; i < 60; i++) { dev.step(1); hi = Math.max(hi, dev.state().y); } return hi', hi => hi > .5 && hi <= 2.4 - 1.75 + .01],
  ['wading through a ring pushes it and it stays in its pool', 'const a = dev.bodies().rings[0]; dev.go(-1.6, -7.2, 0, ["KeyW"], 2.2); dev.step(300); return [a, dev.bodies().rings[0]]', ([a, b]) => Math.hypot(b.x - a.x, b.z - a.z) > .3 && b.x - .55 >= b.pool[0] - 1e-3 && b.x + .55 <= b.pool[2] + 1e-3 && b.z - .55 >= b.pool[1] - 1e-3 && b.z + .55 <= b.pool[3] + 1e-3 && b.y > -.2 && b.y < .1],
  ['jumping into the pit: you reach its floor and the balls are thrown', `const a = Float32Array.from(dev.balls(2)); ${PIT}; const p = dev.balls(2); let moved = 0, low = 9, out = 0, over = 0; for (let i = 0; i < p.length; i += 3) { if (Math.hypot(p[i] - a[i], p[i + 1] - a[i + 1], p[i + 2] - a[i + 2]) > .05) moved++; low = Math.min(low, p[i + 1]); if (p[i] < -41 || p[i] > -27 || p[i + 2] < 28.4 || p[i + 2] > 43.6) out++; if (!(p[i] > -40 && p[i] < -33 && p[i + 2] > 30 && p[i + 2] < 37)) over++; } return { s: dev.state(), moved, low, out, over }`, r => near(r.s.y, -.85, .01) && r.moved > 50 && r.low >= -.755 && !r.out && r.over <= 10], // over: thrown over the rim
  ['the pile comes to rest within 5 s, none under the floor or out of the room', `${PIT}; let n = 0; while (dev.bodies().groups[2].awake && n < 300) { dev.step(1); n++; } const g = dev.bodies().groups[2]; return { n, g }`, ({ n, g }) => n < 300 && g.lo[1] >= -.755 && g.lo[0] >= -41 && g.hi[0] <= -27 && g.lo[2] >= 28.4 && g.hi[2] <= 43.6],
  ['the field ball rolls when walked into, then stops', 'const a = dev.bodies().groups[3].at; dev.go(-10.6, 699, P, ["KeyW"], 1.5); let n = 0; while (dev.bodies().groups[3].awake && n < 600) { dev.step(1); n++; } return [a, dev.bodies().groups[3].at, n]', ([a, b, n]) => Math.hypot(b[0] - a[0], b[2] - a[2]) > .5 && n < 600],
  ['loose things cost under 0.3 ms a frame at rest, even standing in the pit', 'dev.go(-31.6, 34.5, P / 2, ["KeyW"], 1.5); dev.step(600); return [dev.bodies().groups[2].awake, dev.physics(120)]', ([n, ms]) => !n && ms < .3],
  ['a jump in beside the beach ball nudges it (stays low, goes under 3 m), and the rings settle back to the still water', 'const a = dev.bodies().groups.findIndex(g => g.n === 1 && g.at[2] < 0), b = dev.balls(a), s = [b[0], b[2]]; dev.go(5.8, -12, P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.key("Space", true); let top = 0; for (let i = 0; i < 300; i++) { dev.step(1); top = Math.max(top, b[1]); if (i === 2) dev.key("Space", false); if (i === 60) { dev.key("KeyW", false); dev.key("ShiftLeft", false); } } const far = Math.hypot(b[0] - s[0], b[2] - s[1]); dev.go(8, -3, 0); dev.step(900); return [top, far, dev.bodies().rings.map(r => r.y)]', ([top, far, ys]) => top < .4 && far < 3 && ys.every(y => near(y, -.07, .015))],
  ['the field ball run into the door stays in the field', 'dev.go(3.8, 672, 0); dev.balls(3).set([3.8, .17, 667]); dev.go(3.8, 667.8, 0, ["KeyW", "ShiftLeft"], 1.5); dev.step(120); return dev.balls(3)[2]', z => z >= 665.7],
  ['and under 4 ms a frame in the worst of a splash', `dev.go(-31.6, 30.6, P / 2); dev.key("KeyW", true); dev.key("ShiftLeft", true); dev.key("Space", true); let worst = 0; for (let i = 0; i < 160; i++) { worst = Math.max(worst, dev.physics(1)); if (i === 2) dev.key("Space", false); if (i === 30) { dev.key("KeyW", false); dev.key("ShiftLeft", false); } } return worst`, ms => ms < 4],
];
const loose = run(base + '?dev', `(async () => { const P = Math.PI, out = []; for (const f of [${solids.map(([, e]) => `async () => { ${e} }`).join(',')}]) out.push(await f()); return out; })()`);
check('solids page loads without console errors', !loose.errors.length, loose.errors.join(' | ').slice(0, 600));
solids.forEach(([name, , ok], k) => { const got = loose.result?.[k]; let pass = false; try { pass = got !== undefined && ok(got); } catch {} check(name, pass, pass ? '' : 'got ' + JSON.stringify(got)); });

// Production address: no window.dev, the start overlay is up once the level is built.
const prod = run(base, `await new Promise(ok => { const t = setInterval(() => /click to enter/.test(document.getElementById('s').textContent) && (clearInterval(t), ok()), 100); }),
  { dev: typeof window.dev, overlay: getComputedStyle(document.getElementById('o')).display !== 'none' }`, '--wait', '15000', '--settle', '0'); // browse.mjs waits out --wait for a dev.ready that never comes here
check('production loads without console errors', !prod.errors.length, prod.errors.join(' | ').slice(0, 600));
check('production has no window.dev', prod.result?.dev === 'undefined', JSON.stringify(prod.result));
check('production shows the start overlay', prod.result?.overlay === true);
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
