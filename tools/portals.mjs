// Walking through every portal (build.js portal(), js/portals.js):
//   node tools/portals.mjs [--port 8200] [--only i,j] [--modes walk,run,hop,diag,back,same,sweep,clip,leak] [--json f]
// Loads ?dev (the yard's test pair too) and, for every portal end i (build.js ends), walks through it from 2.5 m before to 2.5 m past
// with dev.hold + dev.step: walk (2.85 m/s, 1/60 s frames), run (6 m/s), hop (7.2 m/s, Space held, 0.05 s frames), diag (walking
// 0.2 rad off square, aimed at the middle), back (until 0.15 m past the plane, then backing out). Asserts per walk:
//  end:  the body ends where the link says: on the straight path taken through the portal (back: on the line it came in on, this side),
//        within 5 cm, unless a solid slowed it or pushed it off its line more than a body's radius from either plane (an open leaf, a
//        jamb met at an angle: what a real doorway does; then only reported); pushed off its line while straddling the plane fails, in the far zone (back: its own), facing the start's facing turned by the link;
//  step: the crossing is no jump of state: the pose of each crossing frame (back: each), drawn with the state the frame before it left,
//        against the real frame (what changed besides the move: mood, lamps, zone), on it and the 3 after it, no larger than the same
//        measure on the 3 frames before it (x1.1 + 0.3). The picture's own change on that frame is printed beside it: it peaks inside a deep reveal, where the
//        jambs are nearest the eye, as at any doorway, so it is no measure of the portal (the sweep below is);
//  same: (once per end) the picture with the eye exactly on the plane in the opening, drawn from this side and from the far side through
//        the link, differs by under 1.5 (mean luma); the same picture moved 2 cm is printed beside it for scale.
//  sweep: (once per end) the eye moved through the plane in 2 cm steps from 0.3 m before to 0.3 m past (drawn from the far side once
//        past): the step across the plane changes the picture no more than the largest other step within 0.1 m (x1.1 + 0.3), so the
//        two sides meet with no seam in time.
//  clip: (once per end) a bright card 5 cm behind the far end's plane, in its opening (between the eye taken through and the opening: what
//        the far draw's clip plane must cut, like the mall wall behind the hotel's west door) changes the picture through it by under
//        0.05; the same card 5 cm in front of the plane must change it by over 0.3 (the check can see it).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), opts = { only: arg('only', ''), modes: arg('modes', 'walk,run,hop,diag,back,same,sweep,clip,leak,deep').split(',') };

async function page(o) {
  const B = await import('/js/build.js'), { renderer: r, camera } = dev, gl = r.getContext();
  // only the door under test open (and its copy): an open door across the hallway would let a walk carry on into another room; a shut door is the move area's door check
  const swing = (e, f) => { for (const d of [e.door, e.to.door]) if (d) { d.set(f); d.u = d.to = f; } };
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4), GW = 64, GH = 36;
  const grab = () => { r.setRenderTarget(null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); const g = new Float32Array(GW * GH);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = (j * W + i) * 4; g[Math.floor(j * GH / H) * GW + Math.floor(i * GW / W)] += .2126 * px[k] + .7152 * px[k + 1] + .0722 * px[k + 2]; }
    for (let k = 0; k < g.length; k++) g[k] /= (W / GW) * (H / GH); return g; };
  const diff = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length; };
  const yawNow = () => new dev.THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const out = [], only = o.only ? o.only.split(',').map(Number) : null, keysAll = ['KeyW', 'KeyS', 'ShiftLeft', 'Space'];
  for (const [i, e] of B.ends.entries()) { if (only && !only.includes(i)) continue;
    const name = `${i}:${e.zone.id}>${e.to.zone.id}`; swing(e, 1);
    for (const m of o.modes.filter(m => !['same', 'sweep', 'clip', 'leak'].includes(m))) {
      const dt = m === 'hop' ? .05 : 1 / 60, sp = m === 'run' ? 6 : m === 'hop' ? 7.2 : 2.85, a = m === 'diag' ? .2 : 0, L = 2; // L: the run-up and run-out, inside the hallway's 2.4 m (2.5 began on the facing door's plane, in its shut leaf, and ran out through it)
      const dir = [-e.n.x * Math.cos(a) + e.r.x * Math.sin(a), -e.n.z * Math.cos(a) + e.r.z * Math.sin(a)], sx = e.p.x - dir[0] * L, sz = e.p.z - dir[1] * L, yaw = Math.atan2(-dir[0], -dir[1]);
      const walk = hook => { // hook(k): called with the state the frame before picture k left, just before stepping to it
        swing(e, 1); dev.reset(sx, sz, yaw, 0); const z0 = dev.state().zone; // the leaf as it began: the first walk may have moved it, and the replay must see what it saw
        [ 'KeyW', ...(m === 'run' ? ['ShiftLeft'] : []), ...(m === 'hop' ? ['Space'] : [])].forEach(k => dev.key(k, true));
        dev.vel.set(dir[0] * sp, dir[1] * sp); if (m === 'hop') { dev.step(1, dt); dev.vel.set(dir[0] * sp, dir[1] * sp); } // airborne at 7.2: the air keeps it
        const pics = [grab()], poses = [null], xs = []; let bend = null, cross = -1, backed = false, slid = false, last = [camera.position.x, camera.position.z], top = 0;
        for (let f = 0; f < Math.ceil(2 * L / Math.min(sp, 2.85) / dt) + 90; f++) {
          if (m === 'hop' && !dev.state().air && dev.vel.length() < 7.2) dev.vel.setLength(7.2); // the hop's speed held exactly across the walk
          hook?.(pics.length); dev.step(1, dt); pics.push(grab()); poses.push([camera.position.clone(), camera.quaternion.clone(), camera.fov]); const p = camera.position; top = Math.max(top, dev.vel.length()); if (m !== 'back' && dev.vel.length() < sp * .9 && f > 3) slid = true;
          if (Math.hypot(p.x - last[0], p.z - last[1]) > 1) { xs.push(pics.length - 1); if (cross < 0) cross = pics.length - 1; } last = [p.x, p.z]; // a jump of place: through the link
          { const q = xs.length % 2 ? B.carry(e.to, p.x, p.z) : [p.x, p.z], off = m === 'back' ? Math.abs(B.across(e, ...q) - B.across(e, sx, sz)) : Math.abs((q[0] - sx) * dir[1] - (q[1] - sz) * dir[0]);
            if (!bend && off > .005) bend = +Math.min(Math.abs(B.side(e, p.x, p.z)), Math.abs(B.side(e.to, p.x, p.z))).toFixed(2); } // first pushed off its line: how far from the plane
          if (m === 'back' && !backed && cross >= 0 && B.side(e.to, p.x, p.z) > .15) { backed = true; dev.key('KeyW', false); dev.key('KeyS', true); }
          if (m === 'back' ? backed && B.side(e, p.x, p.z) > L - .2 && Math.hypot(p.x - e.p.x, p.z - e.p.z) < 4 : cross >= 0 && B.side(e.to, p.x, p.z) > L * Math.cos(a)) break;
        }
        keysAll.forEach(k => dev.key(k, false)); return { z0, pics, poses, xs, cross, slid: slid || bend > .32, bend, top };
      };
      const { z0, pics, poses, xs, cross, slid, bend, top } = walk(), replay = walk;
      const p = camera.position; let err, face;
      if (m === 'back') { err = Math.abs(B.across(e, p.x, p.z) - B.across(e, sx, sz)); face = wrap(yawNow() - yaw); }
      else { const q = B.carry(e.to, p.x, p.z), bx = q[0] - sx, bz = q[1] - sz; err = Math.abs(bx * dir[1] - bz * dir[0]); face = wrap(yawNow() - yaw - e.turn); } // the end taken back: its distance off the start's line
      const zoneOk = dev.state().zone === (m === 'back' ? z0 : e.to.zone.id);
      // each crossing frame (and the 3 before and after it) replayed: the walk again from the start, the pose of frame k drawn with the state after k - 1
      let around = 0, jump = 0, pre = 0; const want = new Set(xs.flatMap(c => [-3, -2, -1, 0, 1, 2, 3].map(i => c + i))), shot = new Map();
      if (xs.length) { const shoot = ([q, r, fov]) => { const P = camera.position.clone(), Q = camera.quaternion.clone(), F = camera.fov; camera.position.copy(q); camera.quaternion.copy(r); camera.fov = fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
          dev.composer.render(0); const g = grab(); camera.position.copy(P); camera.quaternion.copy(Q); camera.fov = F; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); return g; };
        replay(k => want.has(k) && shot.set(k, shoot(poses[k]))); }
      for (const c of xs) { around = Math.max(around, diff(pics[c], pics[c - 1])); for (const k of [c, c + 1, c + 2, c + 3]) if (shot.has(k)) jump = Math.max(jump, diff(shot.get(k), pics[k]));
        for (const k of [c - 3, c - 2, c - 1]) if (shot.has(k) && !xs.includes(k)) pre = Math.max(pre, diff(shot.get(k), pics[k])); }
      out.push({ name, m, crossed: cross >= 0, zoneOk, top: +top.toFixed(2), err: +err.toFixed(3), face: +face.toFixed(3), around: +around.toFixed(2), jump: +jump.toFixed(2), pre: +pre.toFixed(2),
        slid, bend, ok: !(bend !== null && bend <= .32) && cross >= 0 && zoneOk && (err < .05 || slid) && Math.abs(face) < .02 && jump <= pre * 1.1 + .3 });
    }
    // same: the eye on the plane in the opening, looking through, drawn from both sides (the player's state held, so mood and lamps are one)
    dev.reset(e.p.x + e.n.x * .6, e.p.z + e.n.z * .6, e.ry, 0); dev.step(20);
    const y = 1.62 + e.p.y, [fx, fz] = B.carry(e, e.p.x, e.p.z);
    if (o.modes.includes('same')) {
      dev.view(e.p.x, y, e.p.z, e.ry, -.05); const A = grab(); dev.view(fx, y + e.to.p.y - e.p.y, fz, e.ry + e.turn, -.05); const F = grab();
      dev.view(e.p.x + e.n.x * .02, y, e.p.z + e.n.z * .02, e.ry, -.05); const A2 = grab();
      out.push({ name, m: 'same', mean: +diff(A, F).toFixed(2), move2cm: +diff(A, A2).toFixed(2), ok: diff(A, F) < 1.5 }); }
    if (o.modes.includes('leak') && e.door) { // the owner's 307-then-308: the doors behind the eye, opened, must not change the picture through this one, looked at from its threshold, turned 0.3 rad either way (another opening behind the eye once took the whole screen and drew over this one's picture)
      const ex = e.p.x + e.n.x * .25, ez = e.p.z + e.n.z * .25; let worst = 0, n = 0;
      for (const t of [-.3, 0, .3]) { const yw = e.ry + t, dx = -Math.sin(yw), dz = -Math.cos(yw); // this room's doors onto other rooms, wholly behind the eye: they must add nothing
        const others = B.ends.filter(f => f !== e && f.door && f.zone === e.zone && f.to.zone !== e.to.zone && Math.hypot(f.p.x - ex, f.p.z - ez) < 80 && (f.p.x - ex) * dx + (f.p.z - ez) * dz < -.6), set = v => others.forEach(g => swing(g, v));
        const look = () => { dev.view(ex, y, ez, yw, 0); return grab(); }; set(0); const A = look(); set(1); worst = Math.max(worst, diff(look(), A)); set(0); n += others.length; }
      swing(e, 1); out.push({ name, m: 'leak', worst: +worst.toFixed(3), n, ok: worst < .1 }); }
    if (o.modes.includes('clip')) {
      const { scene } = await import('/js/core.js'), T = dev.THREE, card = new T.Mesh(new T.PlaneGeometry(.6, .6), new T.MeshBasicMaterial({ color: 0xff40ff, side: T.DoubleSide }));
      card.layers.enableAll(); card.frustumCulled = false; card.rotation.y = e.to.ry; scene.add(card);
      const look = () => { card.updateMatrixWorld(true); dev.view(e.p.x + e.n.x * 1.2, y, e.p.z + e.n.z * 1.2, e.ry, -.05); return grab(); };
      card.visible = false; const A = look(), at = d => { card.visible = true; card.position.copy(e.to.p).addScaledVector(e.to.n, d); card.position.y += 1.1; return diff(look(), A); };
      const behind = at(-.05), front = at(.05); scene.remove(card);
      out.push({ name, m: 'clip', behind: +behind.toFixed(3), front: +front.toFixed(2), ok: behind < .05 && front > .3 }); }
    if (o.modes.includes('sweep')) { // 2 cm steps through the plane, at the run's field of view; d: metres in front of it (past it: drawn from the far side)
      camera.fov = 76; camera.updateProjectionMatrix(); const st = []; let prev = null;
      for (let i = 0; i <= 30; i++) { const d = .3 - i * .02; let [x, z] = [e.p.x + e.n.x * d, e.p.z + e.n.z * d], yw = e.ry, yy = y;
        if (d < 0) { [x, z] = B.carry(e, x, z); yw += e.turn; yy += e.to.p.y - e.p.y; }
        dev.view(x, yy, z, yw, 0); const g = grab(); if (prev) st.push([d + .01, diff(g, prev)]); prev = g; }
      camera.fov = 72; camera.updateProjectionMatrix();
      const at = st.find(q => Math.abs(q[0]) < .011)[1], near = Math.max(...st.filter(q => Math.abs(q[0]) > .011 && Math.abs(q[0]) < .1).map(q => q[1]));
      out.push({ name, m: 'sweep', at: +at.toFixed(2), near: +near.toFixed(2), ok: at <= near * 1.1 + .3 }); }
    swing(e, 0);
  }
  if (o.modes.includes('deep')) { // recursion: the gallery's two doors open, seen from across the hallway, its far door shows the hallway, your own door, the gallery again...
    const P = await import('/js/portals.js'), g = B.ends.filter(e => e.zone.id === 'hT' && e.to.zone.id === 'hG'); g.forEach(e => swing(e, 1));
    dev.reset(4.9, 27.6, Math.PI / 2, 0); dev.step(20); dev.view(4.9, 1.62, 27.6, Math.PI / 2, 0); const { levels, ends: cut } = P.stats, L = P.LIM;
    const small = cut.every(([x1, y1, x2, y2]) => Math.min(x2 - x1, y2 - y1) < L.minpx + 1); // ended for size (+1: rounding to whole pixels), not by the cap
    g.forEach(e => swing(e, 0)); out.push({ name: 'gallery', m: 'deep', levels, cut: cut.length, small, ok: levels >= 3 && cut.length > 0 && small });
  }
  return out;
}
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url));
const res = JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev#3.8,30,0,0`, '--size', '640x360', '--wait', '900000', '--eval', `(${page})(${JSON.stringify(opts)})`], { encoding: 'utf8', maxBuffer: 1 << 26 }));
if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
const rows = res.result || [];
for (const q of rows) console.log(`${q.ok ? 'ok  ' : 'FAIL'} ${q.name.padEnd(12)} ${q.m.padEnd(5)} ` + (q.m === 'deep' ? `${q.levels} levels drawn, ${q.cut} ended by the fill${q.small ? ' (each smaller than the cut-off)' : ' (ONE ENDED LARGER THAN THE CUT-OFF)'}` : q.m === 'same' ? `mean ${q.mean} (a 2 cm move: ${q.move2cm})` : q.m === 'sweep' ? `the 2 cm step across the plane ${q.at} vs the steps within 10 cm ${q.near}` : q.m === 'leak' ? `${q.n} doors behind the eye opened change the picture through it by ${q.worst}` : q.m === 'clip' ? `a card behind the far plane changes it ${q.behind} (in front: ${q.front})`
  : `end off by ${q.err} m${q.slid ? ` (slid along a solid${q.bend !== null ? `, first pushed off its line ${q.bend} m from the plane` : ''})` : q.bend !== null ? `, PUSHED OFF ITS LINE STRADDLING THE PLANE (${q.bend} m)` : ''}, facing ${q.face}, zone ${q.zoneOk ? 'ok' : 'WRONG'}, top ${q.top} m/s, state jump on crossing ${q.jump} vs frames before ${q.pre} (the picture's own change ${q.around})${q.crossed ? '' : ', NEVER CROSSED'}`));
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(rows, null, 1));
const bad = rows.filter(q => !q.ok).length; console.log(`${rows.length - bad} passed, ${bad} failed`); process.exit(bad || res.errors?.length ? 1 : 0);
