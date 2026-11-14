// Drive the game in a private headless Edge/Chrome: load a URL, run JavaScript in the page, save a screenshot, report errors.
// No dependencies (Node 22+). Each run starts its own browser with its own profile and closes it, so runs can overlap.
//
//   node tools/browse.mjs --url "http://localhost:8123/?dev#7.5,-3,0.75,-0.18" --shot out.png
//   node tools/browse.mjs --url "http://localhost:8123/?dev" --eval "dev.go(3.8, 50, Math.PI, ['KeyW','ShiftLeft'], 5)"
//   node tools/browse.mjs --url ... --eval-file test.js --shot a.png --size 1280x720 --wait 60000
//
// --eval / --eval-file: an expression (may be async, may use await) evaluated after the page is ready; its value is printed as JSON.
// The page counts as ready when window.dev.ready is true (the game sets it in ?dev mode once the level is built), else after --settle ms.
// Output: one JSON object {result, errors, ms}. Exit code 1 if the page threw, logged an error, or the expression failed.
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const url = arg('url'), shot = arg('shot'), wait = +arg('wait', 90000), settle = +arg('settle', 4000), [w, h] = arg('size', '1280x720').split('x').map(Number);
const expr = arg('eval-file') ? readFileSync(arg('eval-file'), 'utf8') : arg('eval');
if (!url) { console.error('usage: node tools/browse.mjs --url URL [--eval EXPR | --eval-file FILE] [--shot FILE.png] [--size WxH] [--wait MS] [--settle MS]'); process.exit(2); }
const exe = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
if (!exe) { console.error('no Edge or Chrome found; set BROWSER to its path'); process.exit(2); }

const profile = mkdtempSync(join(tmpdir(), 'dc-browse-')), sleep = ms => new Promise(r => setTimeout(r, ms)), t0 = Date.now();
const child = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', '--enable-gpu', '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
const quit = code => { try { process.platform === 'win32' ? execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }) : child.kill('SIGKILL'); } catch {}
  for (let i = 0; i < 5; i++) try { rmSync(profile, { recursive: true, force: true }); break; } catch { execSync(process.platform === 'win32' ? 'ping -n 2 127.0.0.1 > NUL' : 'sleep 1'); }
  process.exit(code); };
process.on('uncaughtException', e => { console.error(String(e)); quit(2); });

let port; // the browser writes the port it picked into its profile folder
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} }
if (!port) throw new Error('browser did not start');
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl), pending = new Map(), errors = [];
let id = 0;
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
const send = (method, params = {}) => new Promise((ok, bad) => { pending.set(++id, [ok, bad]); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = m => { const d = JSON.parse(m.data);
  if (d.id) { const [ok, bad] = pending.get(d.id); pending.delete(d.id); d.error ? bad(new Error(d.error.message)) : ok(d.result); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(d.params.type)) errors.push(d.params.args.map(a => a.value ?? a.description).join(' '));
  else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.url || '')) errors.push(d.params.entry.text + ' ' + (d.params.entry.url || '')); };
const run = async (expression, timeout = wait) => { // evaluate in the page; awaits promises; returns the value or throws
  const r = await Promise.race([send('Runtime.evaluate', { expression: `(async () => (${expression}\n))()`, awaitPromise: true, returnByValue: true }), sleep(timeout).then(() => { throw new Error('timed out after ' + timeout + ' ms'); })]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value; };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
let ready = false, result, failed = false;
for (const end = Date.now() + wait; Date.now() < end && !ready && !errors.length; await sleep(250)) ready = await run('document.readyState === "complete" && !!(window.dev && window.dev.ready)', 5000).catch(() => false);
if (!ready) await sleep(settle); // not the game's dev mode: just give the page time
try { if (expr) result = await run(expr); } catch (e) { errors.push(String(e.message || e)); failed = true; }
if (shot) writeFileSync(shot, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(JSON.stringify({ result, errors, ready, ms: Date.now() - t0 }, null, 1));
quit(errors.length || failed ? 1 : 0);
