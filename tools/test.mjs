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
  ['toPlay', [-25, 36, P / 2, R, 3.5], { zone: 'sP', x: -36.9, y: -.55 }],
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
];

const dev = run(base + '?dev', `[${walks.map(([, a]) => `dev.go(${a.join(',')})`).join(',')}]`);
check('dev mode loads without console errors', !dev.errors.length, dev.errors.join(' | ').slice(0, 600));
walks.forEach(([name, , want], k) => {
  const got = dev.result?.[k], bad = got ? Object.entries(want).filter(([key, v]) => typeof v === 'number' ? !(Math.abs(got[key] - v) <= .35) : got[key] !== v) : [1];
  check(name, !bad.length, got ? (bad.length ? `want ${JSON.stringify(want)} got ${JSON.stringify(got)}` : '') : 'no result');
});

// Production address: no window.dev, the start overlay is up once the level is built.
const prod = run(base, `await new Promise(ok => { const t = setInterval(() => /click to enter/.test(document.getElementById('s').textContent) && (clearInterval(t), ok()), 100); }),
  { dev: typeof window.dev, overlay: getComputedStyle(document.getElementById('o')).display !== 'none' }`, '--wait', '15000', '--settle', '0'); // browse.mjs waits out --wait for a dev.ready that never comes here
check('production loads without console errors', !prod.errors.length, prod.errors.join(' | ').slice(0, 600));
check('production has no window.dev', prod.result?.dev === 'undefined', JSON.stringify(prod.result));
check('production shows the start overlay', prod.result?.overlay === true);
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
