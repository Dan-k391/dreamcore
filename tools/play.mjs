// Drives the game in a headless browser, for tests and photos. No dependencies: Node 22+ and Edge or Chrome.
//
//   node tools/play.mjs [--url http://localhost:8123/] [--size 1280x720] <steps, run in order>
//     --at x,z,yaw,pitch     stand there and let the lighting settle (dev.go)
//     --eval "js"            run JS in the page and print the result as JSON. One expression, or statements ending in `return`;
//                            may use await; `dev` is the game's test handle
//     --file path.js         the same, with the JS read from a file
//     --shot out.png         save a photo of the screen
//     --wait ms              let real time pass
//     --views dir            photograph every viewpoint in tools/views.json into dir (name.png)
//
// The page is opened with ?dev, which makes the game expose window.dev and freeze its clock so that only dev.step() advances it
// (see the "test harness" block in the game). Console errors and failed asserts are printed, and make the exit code 1.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2), steps = [];
let url = 'http://localhost:8123/', size = [1280, 720];
for (let i = 0; i < args.length; i += 2) {
  const k = args[i], v = args[i + 1];
  if (v === undefined) throw new Error(`${k} needs a value`);
  if (k === '--url') url = v; else if (k === '--size') size = v.split('x').map(Number);
  else if (k === '--views') for (const [name, at] of Object.entries(JSON.parse(readFileSync(new URL('./views.json', import.meta.url), 'utf8')))) steps.push(['at', at], ['shot', join(v, name + '.png')]);
  else if (['--at', '--eval', '--file', '--shot', '--wait'].includes(k)) steps.push([k.slice(2), v]);
  else throw new Error(`unknown option ${k}`);
}

const exe = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!exe) throw new Error('no Edge or Chrome found; set BROWSER to its path');
const profile = mkdtempSync(join(tmpdir(), 'play-')), sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn(exe, ['--headless=new', '--no-first-run', '--disable-extensions', `--user-data-dir=${profile}`, '--remote-debugging-port=0', `--window-size=${size.join(',')}`,
  '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });

let failed = false, ws;
try {
  let port; // the browser picks a free port and writes it here
  for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} }
  if (!port) throw new Error('browser did not start');
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let id = 0; const waiting = new Map();
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id) { waiting.get(d.id)?.(d); waiting.delete(d.id); return; }
    if (d.method === 'Runtime.exceptionThrown') { failed = true; console.error('PAGE ERROR:', d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); }
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(d.params.type)) { failed = true; console.error('PAGE ' + d.params.type.toUpperCase() + ':', d.params.args.map(a => a.value ?? a.description).join(' ')); }
  };
  const send = (method, params = {}) => new Promise((ok, no) => { waiting.set(++id, d => d.error ? no(new Error(`${method}: ${d.error.message}`)) : ok(d.result)); ws.send(JSON.stringify({ id, method, params })); });
  const run = async js => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${js.includes(';') || js.includes('\n') ? js : 'return ' + js} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  const u = new URL(url); u.searchParams.set('dev', ''); await send('Page.navigate', { url: u.href });
  for (let i = 0; ; i++) { // the game sets dev.ready once the level is built and lit
    if (await run('!!(window.dev && dev.ready)').catch(() => false)) break;
    if (i > 480) throw new Error('game did not become ready in 4 minutes');
    await sleep(500);
  }
  for (const [kind, v] of steps) {
    if (kind === 'at') await run(`dev.go(${v})`);
    else if (kind === 'eval' || kind === 'file') console.log(JSON.stringify(await run(kind === 'file' ? readFileSync(v, 'utf8') : v), null, 1));
    else if (kind === 'wait') await sleep(+v);
    else { await run('dev.step(1, 0)'); writeFileSync(v, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); console.log('saved ' + v); }
  }
  await send('Browser.close').catch(() => {});
} catch (e) { failed = true; console.error(e.message); }
finally { try { ws?.close(); } catch {} browser.kill(); await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
process.exit(failed ? 1 : 0);
