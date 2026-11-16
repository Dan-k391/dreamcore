// Flicker at portals: node tools/flicker.mjs [--port 8200] [--only i,j] [--modes walk,run,graze,back,strafe] [--size 640x360] [--frame i,mode,k --shot f.png]
// Walks through every portal end i (build.js ends; only its door open) as the player does (dev.hold + dev.step, 1/60 s frames, keys held):
// walk (2.85 m/s, square), run (Shift), graze (0.6 rad off square, aimed at the middle), back (facing away, S held), strafe (facing along the
// plane, D held). Every frame's picture is reduced to a 64x36 luma grid; d(k) is the mean change from frame k-1. Flags, within 20 frames of
// the crossing:
//  blip: one wrong frame, the picture leaving and coming back: min(d(k), d(k+1)) - |k+1 vs k-1| > 1 + 0.5 x the median d around it;
//  pop:  a frame changing more than 2.5 x the largest change of the 6 frames around it (not counting itself and its neighbour) + 1.
//  cells: cells of a 128x72 grid going one way by over 24 levels and back on the next frame (a small part flickering), counted on the 8 frames
//        before the crossing to 4 after, more than 2 x + 10 the most on any frame 12 to 40 before it (walking's own: the stride, grain).
// --series prints the changes of the 6 frames before and after the crossing. --frame i,mode,k with --shot: replays walk (i, mode) to frame k and saves that picture (to look at the frames around a crossing).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), opts = { only: arg('only', ''), modes: arg('modes', 'walk,run,graze,back,strafe').split(','), frame: arg('frame', '') };

async function page(o) {
  const B = await import('/js/build.js'), { renderer: r, camera } = dev, gl = r.getContext();
  const swing = (e, f) => { for (const d of [e.door, e.to.door]) if (d) { d.set(f); d.u = d.to = f; } };
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4), GW = 128, GH = 72;
  const grab = () => { r.setRenderTarget(null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); const g = new Float32Array(GW * GH);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = (j * W + i) * 4; g[Math.floor(j * GH / H) * GW + Math.floor(i * GW / W)] += .2126 * px[k] + .7152 * px[k + 1] + .0722 * px[k + 2]; }
    for (let k = 0; k < g.length; k++) g[k] /= (W / GW) * (H / GH); return g; };
  const diff = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length; };
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
  const walk = (i, m, stop = -1) => { // stop >= 0: replay to that frame and return
    const e = B.ends[i]; for (const f of B.ends) if (f.door) swing(f, 0); swing(e, 1);
    const a = m === 'graze' ? .6 : 0, L = m === 'graze' ? 2 : 2.2, dir = [-e.n.x * Math.cos(a) + e.r.x * Math.sin(a), -e.n.z * Math.cos(a) + e.r.z * Math.sin(a)];
    const sx = e.p.x - dir[0] * L, sz = e.p.z - dir[1] * L, face = Math.atan2(-dir[0], -dir[1]); // yaw facing along dir
    const yaw = m === 'back' ? face + Math.PI : m === 'strafe' ? face + Math.PI / 2 : face, keys = m === 'back' ? ['KeyS'] : m === 'strafe' ? ['KeyD'] : m === 'run' ? ['KeyW', 'ShiftLeft'] : ['KeyW'];
    dev.reset(sx, sz, yaw, 0); dev.step(2); keys.forEach(k => dev.key(k, true));
    const pics = [grab()]; let cross = -1, last = [camera.position.x, camera.position.z];
    for (let f = 0; f < 200; f++) { dev.step(1); if (stop >= 0 && pics.length === stop) break; pics.push(grab()); const p = camera.position;
      if (cross < 0 && Math.hypot(p.x - last[0], p.z - last[1]) > 1) cross = pics.length - 1; last = [p.x, p.z];
      if (cross >= 0 && pics.length - cross > 40) break; }
    keys.forEach(k => dev.key(k, false)); swing(e, 0); return { pics, cross };
  };
  if (o.frame) { const [i, m, k] = o.frame.split(','); walk(+i, m, +k); return 'shot'; }
  const out = [], only = o.only ? o.only.split(',').map(Number) : null;
  for (const [i, e] of B.ends.entries()) { if (only && !only.includes(i)) continue;
    for (const m of o.modes) { const { pics, cross } = walk(i, m), d = pics.map((p, k) => k ? diff(p, pics[k - 1]) : 0), flags = []; let worst = 0, maxCells = 0;
      const cl = []; for (let k = Math.max(2, cross - 40); k < Math.min(pics.length - 1, cross + 20); k++) { if (cross < 0) break;
        const around = d.slice(Math.max(1, k - 4), k + 5).filter((_, j, s) => true), base = med(around);
        const blip = Math.min(d[k], d[k + 1]) - diff(pics[k + 1], pics[k - 1]), others = [k - 3, k - 2, k - 1, k + 2, k + 3, k + 4].filter(j => j > 0 && j < d.length).map(j => d[j]);
        const pop = d[k] - (2.5 * Math.max(...others) + 1);
        let cells = 0; for (let c = 0; c < pics[k].length; c++) { const a = pics[k - 1][c], b = pics[k][c], n = pics[k + 1][c]; if (Math.min(Math.abs(b - a), Math.abs(n - b)) - Math.abs(n - a) > 24 && Math.sign(b - a) !== Math.sign(n - b)) cells++; } // cells that leave and come back
        cl.push([k - cross, cells]); if (k < cross - 20) continue;
        worst = Math.max(worst, blip - (1 + .5 * base), pop);
        if (blip > 1 + .5 * base) flags.push(`blip@${k - cross} ${blip.toFixed(2)}`); if (pop > 0) flags.push(`pop@${k - cross} ${d[k].toFixed(2)} vs ${Math.max(...others).toFixed(2)}`); }
      const base = Math.max(0, ...cl.filter(([j]) => j < -12).map(q => q[1])); // walking's own blinking (the stride, grain), well before the plane
      for (const [j, c] of cl) if (j >= -8 && j <= 4 && c > 2 * base + 10) flags.push(`cells@${j} ${c} vs ${base}`); maxCells = Math.max(0, ...cl.filter(([j]) => j >= -8 && j <= 4).map(q => q[1])); const cellBase = base;
      out.push({ name: `${i}:${e.zone.id}>${e.to.zone.id}`, m, cross, frames: pics.length, worst: +worst.toFixed(2), dmax: +Math.max(...d).toFixed(2), flags, maxCells, cellBase, series: d.slice(Math.max(0, cross - 6), cross + 6).map(v => +v.toFixed(1)), ok: cross >= 0 ? !flags.length : m === 'strafe' }); }
  }
  return out;
}
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url)), shot = arg('shot');
const res = JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare#3.8,30,0,0`, '--size', arg('size', '640x360'), '--wait', '900000', ...(shot ? ['--shot', shot] : []), '--eval', `(${page})(${JSON.stringify(opts)})`], { encoding: 'utf8', maxBuffer: 1 << 26 }));
if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
if (opts.frame) { console.log(res.result, shot); process.exit(0); }
const rows = res.result || [];
for (const q of rows) console.log(`${q.ok ? 'ok  ' : 'FAIL'} ${q.name.padEnd(11)} ${q.m.padEnd(6)} ${q.cross < 0 ? 'never crossed' : `crossed at frame ${q.cross}/${q.frames}`}, largest change ${q.dmax}, worst ${q.worst}, blinking cells ${q.maxCells} (before: ${q.cellBase})${argv.includes('--series') ? ' [' + q.series + ']' : ''} ${q.flags.slice(0, 4).join(', ')}`);
const bad = rows.filter(q => !q.ok).length; console.log(`${rows.length - bad} passed, ${bad} failed`); process.exit(bad || res.errors?.length ? 1 : 0);
