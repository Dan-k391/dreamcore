// Photograph every viewpoint in tools/views.json: one 1280x720 PNG per view, named <view>.png, via tools/browse.mjs.
//   node tools/shots.mjs <outDir> [--port 8200] [--only name,name] [--views file.json] [--size WxH] [--fresh]
// Default: ONE browser and one page load for all views; each view starts with dev.reset(x, z, yaw, pitch) (js/dev.js), which puts the game back to what a fresh load there starts with.
// --fresh: the reference and fallback, a new browser and page load per view (three at a time) through tools/browse.mjs.
// --views: another list, same shape [{name, hash}] plus an optional "eval": JavaScript run in the page after the view is set up, before the photo.
// Each view loads ?dev#x,z,yaw,pitch, freezes the clock (dev.hold), resets shader time and runs the same 90 frames at 1/60 s,
// so two runs of the same code give the same picture up to film grain and GPU noise.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = argv[0], port = arg('port', '8200'), only = arg('only')?.split(','), [W, H] = arg('size', '1280x720').split('x').map(Number);
if (!(W > 0 && H > 0)) { console.error('--size must be WxH'); process.exit(2); }
if (!out || out.startsWith('--')) { console.error('usage: node tools/shots.mjs <outDir> [--port 8200] [--only name,name] [--views file.json] [--size WxH] [--fresh]'); process.exit(2); }
const views = JSON.parse(readFileSync(arg('views') ? resolve(arg('views')) : new URL('./views.json', import.meta.url), 'utf8')).filter(v => !only || only.includes(v.name));
if (only && views.length !== only.length) { console.error('unknown view in --only'); process.exit(2); }
mkdirSync(out, { recursive: true });

let last = false; // --fresh: the final, sequential pass
const dev = process.env.FULL || views.some(v => +v.hash.split(",")[0] < -500) ? "?dev" : "?dev&bare"; // test areas (showroom, yard) lie at x < -500: load them only for views there (FULL=1 forces them)
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const shoot = v => new Promise(done => {
  const p = spawn(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/${dev}#${v.hash}`, '--shot', join(out, v.name + '.png'), '--size', `${W}x${H}`,
    // the headless window can reach its final size late: wait until the page and canvas are 1280x720, draw, and fail (then retry) if it changed meanwhile
    '--eval', `(async () => { const c = dev.renderer.domElement, size = () => c.width === ${W} && c.height === ${H} && innerWidth === ${W} && innerHeight === ${H};
      for (let i = 0; i < 100 && !size(); i++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      dev.hold = true; dev.lift = ${+v.lift || 0}; dev.uTime.value = 0; dev.step(90, 1 / 60);
      ${v.eval ? `await (async () => { ${v.eval} })(); dev.step(3, 1 / 60);` : ''}
      await new Promise(r => requestAnimationFrame(r));
      if (!size()) throw new Error('canvas is ' + c.width + 'x' + c.height + ', window ' + innerWidth + 'x' + innerHeight); return true; })()`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
  p.on('close', code => { const bad = !code && wrapped(join(out, v.name + '.png')); if (bad) { code = 1; log += bad + '\n'; }
    // every failure's log is printed, also one that is retried: a real error that shows only now and then must still be seen
    console.log(`${!code ? 'ok  ' : last ? 'FAIL' : 'RETRY'} ${v.name}${code ? '\n' + log : ''}`); done(code); });
});
// The browser's output surface is sometimes smaller than the page (seen: 1250x625 of 1280x720) and the capture repeats it
// to fill the picture, while the page reports the right size. Catch it in the PNG: an exact repeat of the first 8 columns
// (or rows) further on does not happen in a real frame, which has film grain everywhere.
function wrapped(file) {
  const b = readFileSync(file), w = b.readUInt32BE(16), h = b.readUInt32BE(20), bpp = { 2: 3, 6: 4 }[b[25]];
  if (b[24] !== 8 || !bpp || b[28]) return `unexpected PNG format in ${file}`;
  if (w !== W || h !== H) return `picture is ${w}x${h}`;
  const idat = []; for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) if (b.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + b.readUInt32BE(o)));
  const z = inflateSync(Buffer.concat(idat)), row = w * bpp, px = Buffer.alloc(row * h); // undo the PNG row filters
  for (let y = 0; y < h; y++) { const f = z[y * (row + 1)], s = y * (row + 1) + 1, d = y * row;
    for (let i = 0; i < row; i++) { const a = i >= bpp ? px[d + i - bpp] : 0, u = y ? px[d + i - row] : 0, c = i >= bpp && y ? px[d + i - row - bpp] : 0;
      const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c);
      px[d + i] = z[s + i] + [0, a, u, (a + u) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? u : c][f]; } }
  const cols = sw => { for (let y = 0; y < h; y++) if (px.compare(px, y * row, y * row + 8 * bpp, y * row + sw * bpp, y * row + (sw + 8) * bpp)) return false; return true; };
  const rows = sh => !px.compare(px, 0, 8 * row, sh * row, (sh + 8) * row);
  for (let sw = w >> 1; sw <= w - 8; sw++) if (cols(sw)) return `picture repeats from x = ${sw}: the capture surface was too small`;
  for (let sh = h >> 1; sh <= h - 8; sh++) if (rows(sh)) return `picture repeats from y = ${sh}: the capture surface was too small`;
  return false;
}
if (argv.includes('--fresh')) {
let failed = [];
for (let i = 0; i < views.length; i += 3) { const batch = views.slice(i, i + 3), codes = await Promise.all(batch.map(shoot)); failed.push(...batch.filter((v, k) => codes[k])); }
// python's http.server refuses connections when three browsers fetch every module at once: retry those views one at a time
last = true; const retry = failed; failed = [];
for (const v of retry) if (await shoot(v)) failed.push(v);
process.exit(failed.length ? 1 : 0);
}

// ---------- single load: one browser, one page, every view ----------
const exe = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
if (!exe) { console.error('no Edge or Chrome found; set BROWSER to its path'); process.exit(2); }
const profile = mkdtempSync(join(tmpdir(), 'dc-shots-')), sleep = ms => new Promise(r => setTimeout(r, ms));
const child = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', '--enable-gpu', '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const quit = code => { try { process.platform === 'win32' ? execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }) : child.kill('SIGKILL'); } catch {}
  for (let i = 0; i < 5; i++) try { rmSync(profile, { recursive: true, force: true }); break; } catch { execSync(process.platform === 'win32' ? 'ping -n 2 127.0.0.1 > NUL' : 'sleep 1'); }
  process.exit(code); };
process.on('uncaughtException', e => { console.error(String(e)); quit(2); });
let dport; for (let i = 0; i < 100 && !dport; i++) { await sleep(100); try { dport = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} }
if (!dport) { console.error('browser did not start'); quit(2); }
const pg = (await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(pg.webSocketDebuggerUrl), pending = new Map(); let id = 0, errors = [];
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
const send = (method, params = {}) => new Promise((ok, bad) => { pending.set(++id, [ok, bad]); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = m => { const d = JSON.parse(m.data);
  if (d.id) { const [ok, bad] = pending.get(d.id); pending.delete(d.id); d.error ? bad(new Error(d.error.message)) : ok(d.result); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(d.params.type)) errors.push(d.params.args.map(a => a.value ?? a.description).join(' '));
  else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.url || '')) errors.push(d.params.entry.text + ' ' + (d.params.entry.url || '')); };
const run = async (expression, timeout = 90000) => {
  const r = await Promise.race([send('Runtime.evaluate', { expression: `(async () => (${expression}\n))()`, awaitPromise: true, returnByValue: true }), sleep(timeout).then(() => { throw new Error('timed out after ' + timeout + ' ms'); })]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value; };
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${port}/${dev}#${views[0]?.hash || ''}` });
let ready = false; for (const end = Date.now() + 90000; Date.now() < end && !ready && !errors.length; await sleep(250)) ready = await run('document.readyState === "complete" && !!(window.dev && window.dev.ready)', 5000).catch(() => false);
if (!ready) { console.error('page did not become ready\n' + errors.join('\n')); quit(1); }

const photo = async v => { // the same steps as the fresh load's eval, after dev.reset in place of the load
  const [x = 0, z = 0, yaw = 0, pitch = 0] = v.hash.split(',').map(Number);
  await run(`(async () => { const c = dev.renderer.domElement, size = () => c.width === ${W} && c.height === ${H} && innerWidth === ${W} && innerHeight === ${H};
      for (let i = 0; i < 100 && !size(); i++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      dev.reset(${x}, ${z}, ${yaw}, ${pitch}); dev.lift = ${+v.lift || 0}; dev.step(90, 1 / 60);
      ${v.eval ? `await (async () => { ${v.eval} })(); dev.step(3, 1 / 60);` : ''}
      await new Promise(r => requestAnimationFrame(r));
      if (!size()) throw new Error('canvas is ' + c.width + 'x' + c.height + ', window ' + innerWidth + 'x' + innerHeight); return true; })()`);
  const file = join(out, v.name + '.png');
  writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  return wrapped(file);
};
let bad = 0;
for (const v of views) for (let attempt = 0; attempt < 2; attempt++) {
  errors = []; let why = false; try { why = await photo(v); } catch (e) { why = String(e.message || e); }
  const log = [...errors, ...(why ? [why] : [])].join('\n'), real = errors.length; // a page error is a failure that a retry does not clear
  if (!log) { console.log(`ok   ${v.name}`); break; }
  const final = attempt || real; console.log(`${final ? 'FAIL' : 'RETRY'} ${v.name}\n${log}`); if (final) { bad++; break; }
}
quit(bad ? 1 : 0);
