// Walking through every portal (build.js portal(), js/portals.js):
//   node tools/portals.mjs [--port 8200] [--only i,j] [--modes walk,run,hop,diag,back] [--json f]
// Loads ?dev (the yard's test pair too) and, for every portal end i (build.js ends), walks through it from 2.5 m before to 2.5 m past
// with dev.hold + dev.step: walk (2.85 m/s, 1/60 s frames), run (6 m/s), hop (7.2 m/s, Space held, 0.05 s frames), diag (walking
// 0.2 rad off square, aimed at the middle), back (until 0.15 m past the plane, then backing out). Asserts per walk:
//  end:  the body ends where the link says: on the straight path taken through the portal (back: on the line it came in on, this side),
//        within 5 cm (unless a solid slowed it: then only reported), in the far zone (back: its own), facing the start's facing turned by the link;
//  step: the change of the picture (64x36 luma, as transitions.mjs) on the frame that crosses (back: each) is no larger than the largest
//        frame-to-frame change of the other frames within 0.25 s of it (x1.1 + 1, for noise): the same motion through the same place;
//  same: (once per end) the picture with the eye exactly on the plane in the opening, drawn from this side and from the far side through
//        the link, differs by under 1.5 (mean luma); the same picture moved 2 cm is printed beside it for scale.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), opts = { only: arg('only', ''), modes: arg('modes', 'walk,run,hop,diag,back').split(',') };

async function page(o) {
  const B = await import('/js/build.js'), { renderer: r, camera } = dev, gl = r.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4), GW = 64, GH = 36;
  const grab = () => { r.setRenderTarget(null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); const g = new Float32Array(GW * GH);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = (j * W + i) * 4; g[Math.floor(j * GH / H) * GW + Math.floor(i * GW / W)] += .2126 * px[k] + .7152 * px[k + 1] + .0722 * px[k + 2]; }
    for (let k = 0; k < g.length; k++) g[k] /= (W / GW) * (H / GH); return g; };
  const diff = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length; };
  const yawNow = () => new dev.THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const out = [], only = o.only ? o.only.split(',').map(Number) : null, keysAll = ['KeyW', 'KeyS', 'ShiftLeft', 'Space'];
  B.ends.forEach((e, i) => { if (only && !only.includes(i)) return;
    const name = `${i}:${e.zone.id}>${e.to.zone.id}`;
    for (const m of o.modes) {
      const dt = m === 'hop' ? .05 : 1 / 60, sp = m === 'run' ? 6 : m === 'hop' ? 7.2 : 2.85, a = m === 'diag' ? .2 : 0, L = 2.5;
      const dir = [-e.n.x * Math.cos(a) + e.r.x * Math.sin(a), -e.n.z * Math.cos(a) + e.r.z * Math.sin(a)], sx = e.p.x - dir[0] * L, sz = e.p.z - dir[1] * L, yaw = Math.atan2(-dir[0], -dir[1]);
      dev.reset(sx, sz, yaw, 0); const z0 = dev.state().zone;
      [ 'KeyW', ...(m === 'run' ? ['ShiftLeft'] : []), ...(m === 'hop' ? ['Space'] : [])].forEach(k => dev.key(k, true));
      dev.vel.set(dir[0] * sp, dir[1] * sp); if (m === 'hop') { dev.step(1, dt); dev.vel.set(dir[0] * sp, dir[1] * sp); } // airborne at 7.2: the air keeps it
      const pics = [grab()], xs = []; let cross = -1, backed = false, slid = false, last = [camera.position.x, camera.position.z], top = 0;
      for (let f = 0; f < Math.ceil(2 * L / Math.min(sp, 2.85) / dt) + 90; f++) {
        if (m === 'hop' && !dev.state().air && dev.vel.length() < 7.2) dev.vel.setLength(7.2); // the hop's speed held exactly across the walk
        dev.step(1, dt); pics.push(grab()); const p = camera.position; top = Math.max(top, dev.vel.length()); if (m !== 'back' && dev.vel.length() < sp * .9 && f > 3) slid = true;
        if (Math.hypot(p.x - last[0], p.z - last[1]) > 1) { xs.push(pics.length - 1); if (cross < 0) cross = pics.length - 1; } last = [p.x, p.z]; // a jump of place: through the link
        if (m === 'back' && !backed && cross >= 0 && B.side(e.to, p.x, p.z) > .15) { backed = true; dev.key('KeyW', false); dev.key('KeyS', true); }
        if (m === 'back' ? backed && B.side(e, p.x, p.z) > L - .2 && Math.hypot(p.x - e.p.x, p.z - e.p.z) < 4 : cross >= 0 && B.side(e.to, p.x, p.z) > L * Math.cos(a)) break;
      }
      keysAll.forEach(k => dev.key(k, false));
      const p = camera.position; let err, face;
      if (m === 'back') { err = Math.abs(B.across(e, p.x, p.z) - B.across(e, sx, sz)); face = wrap(yawNow() - yaw); }
      else { const q = B.carry(e.to, p.x, p.z), bx = q[0] - sx, bz = q[1] - sz; err = Math.abs(bx * dir[1] - bz * dir[0]); face = wrap(yawNow() - yaw - e.turn); } // the end taken back: its distance off the start's line
      const zoneOk = dev.state().zone === (m === 'back' ? z0 : e.to.zone.id);
      // the frames of each crossing (back: both) against the frames round them, the same motion through the same place
      let before = 0, around = 0; const w = Math.round(.25 / dt);
      for (const c of xs) { around = Math.max(around, diff(pics[c], pics[c - 1]));
        for (let k = Math.max(2, c - w); k <= Math.min(pics.length - 1, c + w); k++) if (!xs.includes(k)) before = Math.max(before, diff(pics[k], pics[k - 1])); }
      out.push({ name, m, crossed: cross >= 0, zoneOk, top: +top.toFixed(2), err: +err.toFixed(3), face: +face.toFixed(3), before: +before.toFixed(2), around: +around.toFixed(2),
        slid, ok: cross >= 0 && zoneOk && (err < .05 || slid) && Math.abs(face) < .02 && around <= before * 1.1 + 1 });
    }
    // same: the eye on the plane in the opening, looking through, drawn from both sides (the player's state held, so mood and lamps are one)
    dev.reset(e.p.x + e.n.x * .6, e.p.z + e.n.z * .6, e.ry, 0); dev.step(20);
    const y = 1.62 + e.p.y, [fx, fz] = B.carry(e, e.p.x, e.p.z);
    dev.view(e.p.x, y, e.p.z, e.ry, -.05); const A = grab(); dev.view(fx, y + e.to.p.y - e.p.y, fz, e.ry + e.turn, -.05); const F = grab();
    dev.view(e.p.x + e.n.x * .02, y, e.p.z + e.n.z * .02, e.ry, -.05); const A2 = grab();
    out.push({ name, m: 'same', mean: +diff(A, F).toFixed(2), move2cm: +diff(A, A2).toFixed(2), ok: diff(A, F) < 1.5 });
  });
  return out;
}
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const res = JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev#3.8,30,0,0`, '--size', '640x360', '--wait', '900000', '--eval', `(${page})(${JSON.stringify(opts)})`], { encoding: 'utf8', maxBuffer: 1 << 26 }));
if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
const rows = res.result || [];
for (const q of rows) console.log(`${q.ok ? 'ok  ' : 'FAIL'} ${q.name.padEnd(12)} ${q.m.padEnd(5)} ` + (q.m === 'same' ? `mean ${q.mean} (a 2 cm move: ${q.move2cm})`
  : `end off by ${q.err} m${q.slid ? ' (slid along a solid)' : ''}, facing ${q.face}, zone ${q.zoneOk ? 'ok' : 'WRONG'}, top ${q.top} m/s, crossing frame ${q.around} vs frames round it ${q.before}${q.crossed ? '' : ', NEVER CROSSED'}`));
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(rows, null, 1));
const bad = rows.filter(q => !q.ok).length; console.log(`${rows.length - bad} passed, ${bad} failed`); process.exit(bad || res.errors?.length ? 1 : 0);
