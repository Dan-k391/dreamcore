// Photograph every viewpoint in tools/views.json: one 1280x720 PNG per view, named <view>.png, via tools/browse.mjs.
//   node tools/shots.mjs <outDir> [--port 8200] [--only name,name]
// Each view loads ?dev#x,z,yaw,pitch, freezes the clock (dev.hold), resets shader time and runs the same 90 frames at 1/60 s,
// so two runs of the same code give the same picture up to film grain and GPU noise.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = argv[0], port = arg('port', '8200'), only = arg('only')?.split(',');
if (!out || out.startsWith('--')) { console.error('usage: node tools/shots.mjs <outDir> [--port 8200] [--only name,name]'); process.exit(2); }
const views = JSON.parse(readFileSync(new URL('./views.json', import.meta.url), 'utf8')).filter(v => !only || only.includes(v.name));
if (only && views.length !== only.length) { console.error('unknown view in --only'); process.exit(2); }
mkdirSync(out, { recursive: true });

const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const shoot = v => new Promise(done => {
  const p = spawn(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev#${v.hash}`, '--shot', join(out, v.name + '.png'),
    // two animation frames first, so a late window resize has landed before the picture is drawn
    '--eval', 'await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), dev.hold = true, dev.uTime.value = 0, dev.step(90, 1 / 60), innerWidth + "x" + innerHeight'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
  p.on('close', code => { console.log(`${code ? 'FAIL' : 'ok  '} ${v.name}${code ? '\n' + log : ''}`); done(code); });
});
let failed = 0;
for (let i = 0; i < views.length; i += 3) failed += (await Promise.all(views.slice(i, i + 3).map(shoot))).filter(Boolean).length;
process.exit(failed ? 1 : 0);
