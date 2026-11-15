// Room-to-room transitions: how much the picture changes because you crossed into another zone, and what a crossing costs.
//   node tools/transitions.mjs [--port 8200] [--only id,id] [--top 10] [--strips n] [--out screenshots/transitions] [--json f]
// Every opening of the walk list (tools/walk.mjs) both ways and every dark-passage warp, on ?dev&bare at 640x360. The player is
// moved by place() along a straight line at 2.85 m/s (no bob, no motion left over when it stops), time frozen for the shader clock.
// Pop: on the frame that would cross, the view from that very point is drawn as it is (before); then the crossing frame, then the
// player stands still for 4 s (1 s at 60 Hz, 3 s at 15 Hz). Every change while standing is transition state settling. Pictures are
// 64x36 luma (0-255, as shown), read in the page. abrupt: the largest change between two 1/60 s frames (boundary step included),
// area: % of the picture that step moved by over 8; total: before against settled; settle: s until within noise of settled.
// Cause split: the before view drawn again with one mechanism already at the new zone's state (sky; look = exposure, fog, grade,
// bloom, shaft; lamps = relight snapped for the new zone) - the share of `total` each removes. other: pools, culling, interactions.
// Hitch: a separate run from 1.5 m before to 0.5 s after, real ms per frame (GPU synced): worst frame from the crossing on, against
// the walk's median, and what that frame did (lamp/sun shadow maps redrawn, sky swap, programs and textures first used).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { walkList } from './walk.mjs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), out = arg('out', 'screenshots/transitions'), opts = { only: arg('only', ''), strips: +arg('strips', 3) };

async function page(o) {
  const B = await import('/js/build.js'), S = await import('/js/sky.js'), L = await import('/js/lights.js'), P = await import('/js/post.js'), PL = await import('/js/player.js'), C = await import('/js/core.js');
  const { renderer: r, zones, camera, uTime } = dev, zl = Object.values(zones), gl = r.getContext(), SM = r.shadowMap, t0 = performance.now();
  const only = o.only ? o.only.split(',') : null, V = 2.85, DT = 1 / 60;
  const zoneAt = (x, z) => zl.find(q => C.inR(x, z, ...q.box)), warpAt = (x, z) => B.warps.find(w => C.inR(x, z, w[0], w[1], w[2], w[3]));
  const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
  // the crossings: each opening both ways (the boundary point, the walking direction), and each warp from its passage's open half
  const X = [];
  for (const w of walkList(B, zl, { fast: true, only: o.only }).walks.filter(w => w.kind === 'door')) for (const d of [1, -1]) {
    const [x, z] = w.ax ? [w.c, w.at] : [w.at, w.c], [dx, dz] = w.ax ? [0, d] : [d, 0];
    X.push({ name: d > 0 ? `${w.a}>${w.b}` : `${w.b}>${w.a}`, x, z, dx, dz, lead: 1.5 });
  }
  for (const w of B.warps) {
    const cx = (w[0] + w[2]) / 2, cz = (w[1] + w[3]) / 2, Z = zoneAt(cx, cz), T = zoneAt(cx + w[4], cz + w[5]); if (!Z || !T) continue;
    if (only && !only.includes(Z.id) && !only.includes(T.id)) continue;
    const ax = Z.box[2] - Z.box[0] > Z.box[3] - Z.box[1] ? 0 : 1, zc = ax ? (Z.box[1] + Z.box[3]) / 2 : (Z.box[0] + Z.box[2]) / 2, rc = ax ? cz : cx, d = Math.sign(rc - zc);
    const e = ax ? (d > 0 ? w[1] : w[3]) : (d > 0 ? w[0] : w[2]), far = ax ? (d > 0 ? Z.box[1] : Z.box[3]) : (d > 0 ? Z.box[0] : Z.box[2]);
    const [x, z] = ax ? [cx, e] : [e, cz], [dx, dz] = ax ? [0, d] : [d, 0];
    X.push({ name: `${Z.id}>${T.id} warp`, x, z, dx, dz, warp: true, lead: Math.min(1.5, Math.abs(e - far) - .2) });
  }
  // pictures: the canvas read back, 64x36 luma
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4), GW = 64, GH = 36, bx = W / GW, by = H / GH;
  const read = () => { r.setRenderTarget(null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  const grab = () => { read(); const g = new Float32Array(GW * GH);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = (j * W + i) * 4; g[Math.floor(j / by) * GW + Math.floor(i / bx)] += .2126 * px[k] + .7152 * px[k + 1] + .0722 * px[k + 2]; }
    for (let k = 0; k < g.length; k++) g[k] /= bx * by; return g; };
  const d = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length; };
  const area = (a, b) => { let n = 0; for (let k = 0; k < a.length; k++) n += Math.abs(a[k] - b[k]) > 8; return n / a.length; };
  const cv = document.createElement('canvas'), c2 = document.createElement('canvas'); cv.width = W; cv.height = H; c2.width = 320; c2.height = 180;
  const photo = () => { read(); const id = new ImageData(W, H); for (let j = 0; j < H; j++) id.data.set(px.subarray((H - 1 - j) * W * 4, (H - j) * W * 4), j * W * 4);
    cv.getContext('2d').putImageData(id, 0, 0); c2.getContext('2d').drawImage(cv, 0, 0, 320, 180); return c2.toDataURL('image/png'); };
  // the walk: placed at each point, one frame each; returns the index where it crosses (the frame not yet run)
  const lookKeys = ['exp', 'shaft', 'sat', 'bloom'], apply = () => { r.toneMappingExposure = P.look.exp; P.bloom.strength = P.look.bloom; P.atmos.uniforms.uShaft.value = P.look.shaft; P.film.uniforms.uSat.value = P.look.sat; };
  const path = (c, k, lead) => [c.x - c.dx * lead + c.dx * V * k * DT, c.z - c.dz * lead + c.dz * V * k * DT];
  const crosses = (c, x, z) => { const wp = warpAt(x, z); if (c.warp) return !!wp; const nz = zoneAt(x + (wp ? wp[4] : 0), z + (wp ? wp[5] : 0)); return nz && nz.id !== dev.state().zone; };
  const pop = (c, cap) => {
    const yaw = yawOf(c.dx, c.dz), lead = Math.min(.6, c.lead); let [x, z] = path(c, 0, lead);
    dev.reset(x, z, yaw, 0); uTime.value = 0;
    const tick = (dt) => { uTime.value = -dt; PL.frame(dt); }; // the shader clock (grain, wind) held at 0
    const moved = () => Math.hypot(camera.position.x - x, camera.position.z - z) > .02; // the game put the body elsewhere: a step too tall, a solid
    let k = 0; for (; k < 200; k++) { [x, z] = path(c, k, lead); if (crosses(c, x, z)) break; PL.place(x, z, yaw, 0); tick(DT); if (moved()) return 'blocked'; }
    if (k === 200) return 'never crossed';
    const from = dev.state(), y = B.floorH(x, z) + 1.62, nz = zoneAt(x + (c.warp ? warpAt(x, z)[4] : 0), z + (c.warp ? warpAt(x, z)[5] : 0));
    const view = () => { dev.view(x, y, z, yaw, 0); return grab(); }, caps = [];
    const B0 = view(); if (cap) caps.push(['before', photo()]);
    // the cause split, before view with one mechanism already at the new zone's state, each put back after
    const bSky = (() => { const was = S.skyNow; S.setSky(nz.sky || 'day'); const g = view(); S.setSky(was); return g; })();
    const bLook = (() => { const was = { ...P.look, fog: P.look.fog.clone(), tint: P.look.tint.clone() };
      for (const q of lookKeys) P.look[q] = nz[q]; P.look.fog.copy(nz.fog); P.look.tint.copy(nz.tint); apply(); const g = view();
      for (const q of lookKeys) P.look[q] = was[q]; P.look.fog.copy(was.fog); P.look.tint.copy(was.tint); apply(); return g; })();
    const bLamp = (() => { const ls = L.lights, was = ls.map(l => ({ k: l.k, e: l.e, p: l.position.clone(), t: l.target.position.clone(), c: l.color.clone(), a: l.angle, dist: l.distance, i: l.intensity })), el = B.emitters.map(e => e.light);
      const here = new dev.THREE.Vector3(x, y, z); L.relight(here, nz, 1); L.relight(here, nz, 1); const g = view();
      ls.forEach((l, i) => { const s = was[i]; Object.assign(l, { k: s.k, e: s.e, angle: s.a, distance: s.dist, intensity: s.i }); l.position.copy(s.p); l.target.position.copy(s.t); l.color.copy(s.c); l.shadow.needsUpdate = true; });
      B.emitters.forEach((e, i) => e.light = el[i]); SM.needsUpdate = true; return g; })();
    // the crossing frame, then standing still
    PL.place(x, z, yaw, 0); tick(DT); if (!c.warp && moved()) return 'blocked'; const seq = [B0, grab()], ts = [-DT, 0]; if (cap) caps.push(['at', photo()]);
    const at = { 12: '+0.2s', 30: '+0.5s', 60: '+1s' };
    for (let i = 1; i <= 60; i++) { tick(DT); seq.push(grab()); ts.push(i * DT); if (cap && at[i]) caps.push([at[i], photo()]); }
    for (let i = 1; i <= 45; i++) { tick(1 / 15); seq.push(grab()); ts.push(1 + i / 15); }
    if (cap) caps.push(['settled', photo()]);
    const inf = seq[seq.length - 1], n = seq.length; let ab = 0, abA = 0, abT = 0;
    for (let i = 1; i <= 61; i++) { const v = d(seq[i], seq[i - 1]); if (v > ab) { ab = v; abA = area(seq[i], seq[i - 1]); abT = ts[i]; } }
    const noise = (d(seq[n - 1], seq[n - 2]) + d(seq[n - 2], seq[n - 3]) + d(seq[n - 3], seq[n - 4])) / 3, thr = Math.max(.5, 3 * noise);
    let settle = 0; for (let i = n - 1; i >= 0; i--) if (d(seq[i], inf) > thr) { settle = ts[Math.min(i + 1, n - 1)]; break; }
    const total = d(B0, inf), share = g => total < .5 ? null : Math.max(0, Math.round(100 * (1 - d(g, inf) / total)));
    return { from: from.zone, to: dev.state().zone, abrupt: +ab.toFixed(2), area: Math.round(abA * 100), abT: +abT.toFixed(3), jump: +d(B0, seq[1]).toFixed(2), total: +total.toFixed(2), settle: +settle.toFixed(2), noise: +noise.toFixed(2),
      sky: share(bSky), look: share(bLook), lamps: share(bLamp), caps };
  };
  // hitch: real ms a frame, GPU synced by a one-pixel read
  const counts = { lamp: 0, sun: 0 }, draw = SM.render;
  SM.render = function (lights, ...a) { if (SM.needsUpdate) for (const l of lights) if (l.shadow.needsUpdate || l.shadow.autoUpdate) l.isDirectionalLight ? counts.sun++ : counts.lamp++; return draw.call(this, lights, ...a); };
  const one = new Uint8Array(4);
  const walkT = (c) => {
    const yaw = yawOf(c.dx, c.dz); let [x, z] = path(c, 0, c.lead), off = [0, 0], N = -1;
    dev.reset(x, z, yaw, 0); const fr = [];
    for (let k = 0; k < 260 && (N < 0 || k < N + 31); k++) {
      [x, z] = path(c, k, c.lead); x += off[0]; z += off[1];
      if (N < 0 && crosses(c, x, z)) N = k;
      const sky = S.skyNow, prog = r.info.programs.length, tex = r.info.memory.textures; counts.lamp = counts.sun = 0;
      PL.place(x, z, yaw, 0); const t = performance.now(); PL.frame(DT); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one);
      fr.push({ ms: performance.now() - t, lamp: counts.lamp, sun: counts.sun, sky: S.skyNow !== sky, prog: r.info.programs.length - prog, tex: r.info.memory.textures - tex });
      const p = camera.position; if (Math.hypot(p.x - x, p.z - z) > 1) { off[0] += p.x - x; off[1] += p.z - z; } // warped
    }
    return { fr, N };
  };
  const hitch = (c) => { // three runs: per frame the median ms (what repeats), the first run's worst too (first draws happen once)
    const runs = [walkT(c), walkT(c), walkT(c)], { fr, N } = runs[0], n = Math.min(...runs.map(q => q.fr.length));
    const ms = Array.from({ length: n }, (_, i) => runs.map(q => q.fr[i].ms).sort((a, b) => a - b)[1]);
    const base = ms.slice(6).sort((a, b) => a - b), med = base[base.length >> 1];
    let wi = N; for (let i = N; i < n; i++) if (ms[i] > ms[wi]) wi = i;
    let fi = N; for (let i = N; i < fr.length; i++) if (fr[i].ms > fr[fi].ms) fi = i;
    const w = fr[wi] || {}, lampMaps = fr.slice(N).reduce((s, f) => s + f.lamp, 0);
    return { worst: +(ms[wi] || 0).toFixed(1), med: +med.toFixed(1), atN: +(ms[N] || 0).toFixed(1), wAt: wi - N, wLamp: w.lamp, wSun: w.sun, wSky: w.sky, wProg: w.prog, wTex: w.tex, first: +(fr[fi]?.ms || 0).toFixed(1), fAt: fi - N, lampMaps };
  };
  const rows = [];
  for (const c of X) { const p = pop(c, false); if (typeof p === 'string') { rows.push({ name: c.name, miss: p }); continue; } delete p.caps; rows.push({ name: c.name, warp: !!c.warp, ...p, ...hitch(c) }); }
  SM.render = draw;
  rows.sort((a, b) => (b.abrupt || 0) - (a.abrupt || 0));
  const strips = rows.filter(r => !r.miss).slice(0, o.strips).map(row => ({ name: row.name, caps: pop(X.find(c => c.name === row.name), true).caps }));
  return { n: X.length, secs: +((performance.now() - t0) / 1000).toFixed(1), rows, strips };
}

const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url)), src = `((walkList) => (${page})(${JSON.stringify(opts)}))(${walkList})`;
let res;
try { res = JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare#1.9,20,0,0`, '--size', '640x360', '--wait', '3600000', '--eval', src], { encoding: 'utf8', maxBuffer: 1 << 28 })); }
catch (e) { try { res = JSON.parse(e.stdout); } catch { console.log(String(e.stderr || e.message).slice(0, 2000)); process.exit(2); } }
if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
mkdirSync(out, { recursive: true });
const R = res.result || {}, rows = R.rows || [], ok = rows.filter(r => !r.miss), top = +arg('top', 10);
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(rows, null, 1));
const pct = v => v === null ? '  -' : String(v).padStart(3);
console.log(`transitions: ${R.n} crossings in ${R.secs} s${rows.length - ok.length ? `, ${rows.length - ok.length} not walkable: ${rows.filter(r => r.miss).map(r => `${r.name} (${r.miss})`).join(' ')}` : ''}`);
console.log('crossing                 abrupt area@s     jump total settle | sky look lamps | ms: crossing frame, worst after (walk median) +frames: lamp/sun maps, sky, new programs/textures; first-run worst');
for (const r of ok.slice(0, top)) console.log(`${r.name.padEnd(24)} ${String(r.abrupt).padStart(6)} ${String(r.area).padStart(3)}%@${r.abT.toFixed(2)} ${String(r.jump).padStart(6)} ${String(r.total).padStart(5)} ${String(r.settle).padStart(5)}s | ${pct(r.sky)} ${pct(r.look)} ${pct(r.lamps)}  | ${String(r.atN).padStart(5)} ${String(r.worst).padStart(5)} (${r.med}) +${r.wAt}: ${r.wLamp}/${r.wSun}${r.wSky ? ' sky' : ''}${r.wProg ? ` +${r.wProg}prog` : ''}${r.wTex ? ` +${r.wTex}tex` : ''}, ${r.lampMaps} lamp maps after; first ${r.first} +${r.fAt}`);
const med = k => { const v = ok.map(r => r[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
console.log(`median crossing: abrupt ${med('abrupt')} total ${med('total')} settle ${med('settle')}s worst frame ${med('worst')} ms (walk median ${med('med')} ms)`);
if (R.strips?.length) {
  R.strips.forEach((s, i) => s.caps.forEach(([lab, url], j) => writeFileSync(`${out}/${i + 1}-${s.name.replace(/[^\w]+/g, '_')}-${j}-${lab.replace('+', 'p').replace('.', '_')}.png`, Buffer.from(url.split(',')[1], 'base64'))));
  console.log(`strips: ${out}`); }
