// Flicker detectors, run on the real game (?dev&bare) through browse.mjs:
//   node tools/seams.mjs [--port 8200] [--scan] [--pop] [--fight] [--fast] [--only id,id] [--list] [--json out.json]
// --scan   analytic: faces from different materials lying in one plane (within 1 mm, facing the same way) and overlapping. Those
//          z-fight. One line per patch: plane, the two materials, where, how big.
// --pop    visibility: along the walk list, a 64 px cube view at each eye point, every opaque mesh coloured by its own index, drawn
//          with every layer on; a mesh that shows but is not on the layers build.js gives a camera standing there is a pop.
// --fight  rendered: along the walk list, three 320 x 180 views (as is, the camera moved 1 mm right, 1 mm up), every opaque mesh
//          coloured by its material; a pixel that changes colour where all its neighbours agree in both views is z-fighting, if a
//          ray through it meets both materials within a few depth steps on faces in one plane (else it is fine detail moving under the
//          pixel, moire, or two faces crossing at an edge).
//          --scan counts the same material made twice only within one place: two places' copies light and reflect differently.
// The walk list is made from the level: every opening between two zones (where a body fits through their shared edge) crossed
// from 2 m on one side to 2 m on the other, 10 cm steps, and every zone's long centre line, 10 cm steps (50 cm in zones over 40 m);
// eyes at 1.6 m and mid-jump 2.5 m; --fight looks along the walk, 45 degrees left and right, both ways. --fast: openings only, 20 cm.
// No flags: all three. Exit code 1 if anything is found.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { walkList } from './walk.mjs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), has = k => argv.includes('--' + k), none = !has('scan') && !has('pop') && !has('fight');
const opts = { scan: none || has('scan'), pop: none || has('pop'), fight: none || has('fight'), fast: has('fast'), list: has('list'), only: arg('only', '') };

async function page(o) {
  const THREE = await import('three'), B = await import('/js/build.js'), S = await import('/js/sky.js');
  const { scene, renderer: r, zones, camera } = dev, zl = Object.values(zones), out = {};
  dev.hold = true;
  const zoneAt = (x, z) => zl.find(q => x > q.box[0] && x < q.box[2] && z > q.box[1] && z < q.box[3])?.id || '-';
  const meshes = [], other = []; scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh) meshes.push(o); else if (o.isMesh || o.isLine || o.isPoints || o.isSprite) other.push(o); }); // other: hidden while painting; meshes: every sky's, setSky shows its own
  const see = m => !Array.isArray(m) && !(m.transparent || m.alphaTest > 0 || m.transmission > 0 || m.opacity < 1 || m.depthWrite === false || m.colorWrite === false || m.visible === false) && !m.uniforms?.tMirror && (m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial);
  const opaque = meshes.filter(o => see(o.material) && !B.seeThrough.includes(o));
  const mats = [...new Set(meshes.map(o => o.material).filter(m => !Array.isArray(m)))];
  const name = m => `${m.name || m.type.replace('Mesh', '').replace('Material', '')}#${m.color ? m.color.getHexString() : ''}${m.map ? '+map' : ''}`;

  if (o.scan) { // ---- coplanar overlapping faces from different materials ----
    const t0 = performance.now(), TOL = .001, p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), patches = new Map(), sky0 = S.skyNow; let twins = 0, faces = 0;
    for (const k of new Set(zl.map(q => q.sky || 'day'))) { S.setSky(k); // one pass per sky, with what it shows (all at once is past a Map's size); a patch found twice counts once
    const tris = [], buckets = new Map(), before = new Set(patches.keys()), seenPair = new Set();
    for (const mesh of meshes) { if (!mesh.visible) continue;
      if (Array.isArray(mesh.material) || mesh.material.colorWrite === false || mesh.material.visible === false) continue;
      mesh.updateMatrixWorld(); const g = mesh.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, M = mesh.matrixWorld;
      const two = mesh.material.side === THREE.DoubleSide, mi = mats.indexOf(mesh.material);
      for (let i = 0; i < n; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(M); b.fromBufferAttribute(pos, ib).applyMatrix4(M); c.fromBufferAttribute(pos, ic).applyMatrix4(M);
        p.subVectors(c, b).cross(a.clone().sub(b)); const area = p.length() / 2; if (area < 1e-6) continue; p.normalize();
        for (const s of two ? [1, -1] : [1]) {
          const nx = p.x * s, ny = p.y * s, nz = p.z * s, d = nx * a.x + ny * a.y + nz * a.z, t = tris.length;
          tris.push({ m: mi, mesh, n: [nx, ny, nz], d, v: [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z] });
          const key = `${Math.round(nx * 300)},${Math.round(ny * 300)},${Math.round(nz * 300)},${Math.round(d / TOL)}`;
          buckets.has(key) ? buckets.get(key).push(t) : buckets.set(key, [t]);
        }
      }
    }
    const basis = n => { const u = Math.abs(n[0]) < .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), N = new THREE.Vector3(...n); const e1 = u.cross(N).normalize(), e2 = N.clone().cross(e1); return [e1, e2]; };
    const proj = (t, e) => [0, 3, 6].map(k => [t.v[k] * e[0].x + t.v[k + 1] * e[0].y + t.v[k + 2] * e[0].z, t.v[k] * e[1].x + t.v[k + 1] * e[1].y + t.v[k + 2] * e[1].z]);
    const ccw = P => ((P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0])) < 0 ? [P[0], P[2], P[1]] : P;
    const clip = (poly, A, Bq) => { const res = [], side = q => (Bq[0] - A[0]) * (q[1] - A[1]) - (Bq[1] - A[1]) * (q[0] - A[0]);
      for (let i = 0; i < poly.length; i++) { const P = poly[i], Q = poly[(i + 1) % poly.length], sp = side(P), sq = side(Q);
        if (sp >= 0) res.push(P); if ((sp >= 0) !== (sq >= 0)) { const k = sp / (sp - sq); res.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); } } return res; };
    const areaOf = P => { let s = 0; for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length]; s += P[i][0] * q[1] - q[0] * P[i][1]; } return Math.abs(s) / 2; };
    const overlap = (T1, T2) => { let P = T1; for (let i = 0; i < 3 && P.length; i++) P = clip(P, T2[i], T2[(i + 1) % 3]); return P.length > 2 ? [areaOf(P), P] : [0]; };
    const inside = (t, w) => { const v = t.v, P = [0, 3, 6].map(k => new THREE.Vector3(v[k], v[k + 1], v[k + 2])), N = new THREE.Vector3(...t.n);
      for (let k = 0; k < 3; k++) { const e2 = P[(k + 1) % 3].clone().sub(P[k]), q = w.clone().sub(P[k]); if (e2.cross(q).dot(N) < -1e-7) return false; } return true; };
    const pressed = (n, d, w) => { for (const dd of [-1, 0, 1]) { const l = buckets.get(`${Math.round(-n[0] * 300)},${Math.round(-n[1] * 300)},${Math.round(-n[2] * 300)},${Math.round(-d / TOL) + dd}`);
      if (l) for (const t of l) { const T = tris[t]; if (Math.abs(T.d + d) < TOL && see(mats[T.m]) && inside(T, w)) return true; } } return false; };
    const twin = (a, b) => a.type === b.type && a.color?.equals(b.color) && a.map === b.map && a.normalMap === b.normalMap && a.roughness === b.roughness && a.metalness === b.metalness;
    for (const [key, list] of buckets) {
      const [kx, ky, kz, kd] = key.split(',').map(Number), cand = [];
      for (const dd of [0, 1, 2]) { const l2 = buckets.get(`${kx},${ky},${kz},${kd + dd}`); if (l2) cand.push(...l2); } // its own bucket and the next one up: each pair once
      if (cand.length < 2 || new Set(cand.map(t => tris[t].m)).size < 2) continue;
      const e = basis(tris[list[0]].n), P2 = new Map(cand.map(t => [t, ccw(proj(tris[t], e))]));
      const box = t => { const P = P2.get(t); return [Math.min(...P.map(q => q[0])), Math.min(...P.map(q => q[1])), Math.max(...P.map(q => q[0])), Math.max(...P.map(q => q[1]))]; };
      const grid = new Map(), C = .5;
      for (const t of cand) { const [x1, y1, x2, y2] = box(t); for (let i = Math.floor(x1 / C); i <= Math.floor(x2 / C); i++) for (let j = Math.floor(y1 / C); j <= Math.floor(y2 / C); j++) { const k = i + ',' + j; grid.has(k) ? grid.get(k).push(t) : grid.set(k, [t]); } }
      for (const cell of grid.values()) for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) {
        const A = tris[cell[i]], Bt = tris[cell[j]]; if (A.m === Bt.m || (mats[A.m].depthWrite === false && mats[Bt.m].depthWrite === false) || Math.abs(A.d - Bt.d) > 3 * TOL || A.n[0] * Bt.n[0] + A.n[1] * Bt.n[1] + A.n[2] * Bt.n[2] < .99995) continue;
        const pk = cell[i] < cell[j] ? cell[i] + ':' + cell[j] : cell[j] + ':' + cell[i]; if (seenPair.has(pk)) continue; seenPair.add(pk);
        const [ar, poly] = overlap(P2.get(cell[i]), P2.get(cell[j])); if (ar < 2e-5) continue; // 20 mm²: touching edges are not an overlap
        const [m1, m2] = A.m < Bt.m ? [A, Bt] : [Bt, A], cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
        const w = e[0].clone().multiplyScalar(cx).add(e[1].clone().multiplyScalar(cy)).addScaledVector(new THREE.Vector3(...A.n), A.d);
        const off = (T, n) => n[0] * (w.x - T.v[0]) + n[1] * (w.y - T.v[1]) + n[2] * (w.z - T.v[2]), gap = Math.abs(off(Bt, A.n) - off(A, A.n)); if (gap > TOL) continue; // measured from its own corner: a tiny face's normal is not good to a millimetre 50 m away
        if (pressed(A.n, A.d, w)) continue; // a face lies against them, facing the other way: both are buried, nothing to see
        const f = w.clone().addScaledVector(new THREE.Vector3(...A.n), .003); // just in front: inside a solid or under the floor, nobody sees it
        if (f.y < B.floorH(f.x, f.z) - .001 || B.colliders.some(c => f.x > c[0] && f.x < c[2] && f.z > c[1] && f.z < c[3] && f.y > c[4] && f.y < c[5] && c.length === 6)) continue;
        if (A.mesh.userData.zone === Bt.mesh.userData.zone && twin(mats[A.m], mats[Bt.m])) { twins++; continue; } // the same material made twice in one place: the same colour either way (two places light and reflect theirs differently)
        const pkey = `${m1.m}|${m2.m}|${A.n.map(v => v.toFixed(2))}|${(A.d * 100 | 0)}|${zoneAt(w.x, w.z)}`;
        if (before.has(pkey)) continue; const q = patches.get(pkey) || { a: name(mats[m1.m]), b: name(mats[m2.m]), za: m1.mesh.userData.zone ?? '', zb: m2.mesh.userData.zone ?? '', zone: zoneAt(w.x, w.z), n: A.n.map(v => +v.toFixed(2)), area: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9], dz: 0 };
        q.area += ar; q.dz = Math.max(q.dz, gap); for (let k = 0; k < 3; k++) { q.lo[k] = Math.min(q.lo[k], w.getComponent(k)); q.hi[k] = Math.max(q.hi[k], w.getComponent(k)); } patches.set(pkey, q);
      }
    }
    faces += tris.length; } S.setSky(sky0);
    const list = [...patches.values()].map(q => ({ ...q, area: +q.area.toFixed(4), lo: q.lo.map(v => +v.toFixed(3)), hi: q.hi.map(v => +v.toFixed(3)), dz: +(q.dz * 1000).toFixed(2) })).sort((p, q) => q.area - p.area);
    out.scan = { twins, tris: faces, secs: +((performance.now() - t0) / 1000).toFixed(1), patches: list };
  }

  if (o.pop || o.fight) { // ---- the walk list ----
    const { walks, views } = walkList(B, zl, o);
    out.walks = walks.length; out.points = views.length;
    if (o.list) out.list = walks.map(w => w.kind === 'door' ? `${w.a}|${w.b} ${w.ax ? 'z' : 'x'}=${w.at.toFixed(2)} c ${w.c.toFixed(2)} w ${w.w}` : `${w.a} hall`);
    scene.onBeforeRender = () => {}; const fog = scene.fog; scene.fog = null; r.shadowMap.enabled = false; r.setClearColor(0, 0);
    const opq = new Set(opaque), ovis = new Map(other.map(o => [o, o.visible])), keep = new Map(meshes.map(o => [o, o.material])), vis = new Map(meshes.map(o => [o, o.visible])), flat = new Map();
    const colour = (k, side) => { const key = k * 4 + side; if (!flat.has(key)) flat.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB((k & 255) / 255, (k >> 8 & 255) / 255, (k >> 16 & 255) / 255, THREE.LinearSRGBColorSpace), fog: false, side })); return flat.get(key); };
    other.forEach(o => o.visible = false); const paint = by => { for (const m of meshes) { m.material = keep.get(m); m.visible = vis.get(m) && opq.has(m); if (opq.has(m)) m.material = colour(by(m), m.material.side); } };
    const where = v => v.w.kind === 'door' ? `${v.w.a}|${v.w.b}` : v.w.a, skyOf = id => zones[id] && (zones[id].sky || 'day');
    let skyIs = null; const sky = id => { const k = skyOf(id) || 'day'; if (k === skyIs) return; skyIs = k; S.setSky(k); scene.background = null; other.forEach(o => o.visible = false);
      for (const m of meshes) if (m.visible && skyOf(m.userData.zone) && skyOf(m.userData.zone) !== k) m.visible = false; // a place is drawn only under its own sky (sky.js; build.js masks)
      for (const m of meshes) if (!opq.has(m)) m.visible = false; };
    if (o.pop) {
      const t0 = performance.now(), idx = new Map(opaque.map((m, i) => [i + 1, m])), res = 64, rt = new THREE.WebGLCubeRenderTarget(res), cube = new THREE.CubeCamera(camera.near, camera.far, rt), buf = new Uint8Array(res * res * 4);
      for (const c of cube.children) c.layers.enableAll();
      paint(m => opaque.indexOf(m) + 1);
      const pops = new Map(); let n = 0;
      for (const v of views) { sky(zoneAt(v.x, v.z));
        for (const y of v.ys) { n++;
          const mask = B.maskAt(v.x, v.z); if (mask === -1) continue;
          cube.position.set(v.x, y, v.z); cube.updateMatrixWorld(); cube.update(r, scene);
          const miss = new Set();
          for (let f = 0; f < 6; f++) { r.readRenderTargetPixels(rt, 0, 0, res, res, buf, f); for (let i = 0; i < buf.length; i += 4) { const k = buf[i] | buf[i + 1] << 8 | buf[i + 2] << 16; if (k) { const m = idx.get(k); if (m && !(m.layers.mask & mask)) miss.add(m.userData.zone || '?'); } } }
          if (miss.size) { const key = where(v); const p = pops.get(key) || { at: where(v), n: 0, eg: [], zones: new Set() }; p.n++; miss.forEach(z => p.zones.add(z)); if (p.eg.length < 3) p.eg.push(`${v.x.toFixed(2)},${y.toFixed(2)},${v.z.toFixed(2)} in ${zoneAt(v.x, v.z)} misses ${[...miss]}`); pops.set(key, p); }
        } }
      rt.dispose();
      out.pop = { eyes: n, secs: +((performance.now() - t0) / 1000).toFixed(1), found: [...pops.values()].map(p => ({ ...p, zones: [...p.zones] })) };
    }
    if (o.fight) {
      const t0 = performance.now(), W = 320, Hh = 180, rt = new THREE.WebGLRenderTarget(W, Hh), cam = new THREE.PerspectiveCamera(camera.fov, W / Hh, camera.near, camera.far), A = new Uint8Array(W * Hh * 4), Bf = new Uint8Array(W * Hh * 4);
      cam.layers.enableAll(); paint(m => mats.indexOf(m.material) + 1);
      const shot = (buf, dx, dy) => { cam.position.copy(base).addScaledVector(right, dx).addScaledVector(up, dy); cam.updateMatrixWorld(); r.setRenderTarget(rt); r.render(scene, cam); r.readRenderTargetPixels(rt, 0, 0, W, Hh, buf); };
      const base = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
      const id = (buf, i) => buf[i] | buf[i + 1] << 8 | buf[i + 2] << 16, flat4 = (buf, x, y) => { const i = (y * W + x) * 4, k = id(buf, i); return id(buf, i - 4) === k && id(buf, i + 4) === k && id(buf, i - 4 * W) === k && id(buf, i + 4 * W) === k; };
      // A changed pixel is a fight only if the ray through its centre (unmoved camera) meets both materials within a few depth steps
      // of each other; otherwise the 1 mm move just carried a fine edge across it (grating slots, thin rails at a distance: moire).
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), byMat = new Map(); ray.layers.enableAll();
      for (const m of opaque) { const j = mats.indexOf(keep.get(m)) + 1; byMat.has(j) ? byMat.get(j).push(m) : byMat.set(j, [m]); }
      const fought = px => { cam.position.copy(base); cam.updateMatrixWorld();
        for (let s = 0; s < 8 && s < px.length; s++) { const [xx, yy, a, b] = px[Math.floor(s * px.length / Math.min(8, px.length))]; if (!a || !b) return [a, b];
          ndc.set((xx + .5) / W * 2 - 1, (yy + .5) / Hh * 2 - 1); ray.setFromCamera(ndc, cam);
          const hit = j => ray.intersectObjects((byMat.get(j) || []).filter(m => m.visible), false)[0], ha = hit(a), hb = hit(b);
          if (ha && hb && Math.abs(ha.distance - hb.distance) < .0005 + 16 * ha.distance ** 2 / (cam.near * 2 ** 24) // a fight is two faces at one depth
            && Math.abs(ha.face.normal.clone().transformDirection(ha.object.matrixWorld).dot(hb.face.normal.clone().transformDirection(hb.object.matrixWorld))) > .9) return [a, b]; } // in one plane, not two crossing at an edge
        return null; };
      const fights = new Map(); let n = 0;
      for (const v of views) { sky(zoneAt(v.x, v.z));
        for (const y of v.ys) for (const dir of [0, Math.PI]) for (const turn of [0, Math.PI / 4, -Math.PI / 4]) { n++;
          base.set(v.x, y, v.z); cam.rotation.set(0, v.yaw + dir + turn, 0, 'YXZ'); cam.position.copy(base); cam.updateMatrixWorld(); right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
          shot(A, 0, 0); let worst = 0, pair = '';
          for (const [dx, dy] of [[.001, 0], [0, .001]]) { shot(Bf, dx, dy); let k = 0, eg = null; const px = [];
            for (let yy = 1; yy < Hh - 1; yy++) for (let xx = 1; xx < W - 1; xx++) { const i = (yy * W + xx) * 4; if (id(A, i) !== id(Bf, i) && flat4(A, xx, yy) && flat4(Bf, xx, yy)) { k++; px.push([xx, yy, id(A, i), id(Bf, i)]); } }
            if (k > worst && k >= 3 && (eg = fought(px))) { worst = k; pair = eg.map(j => j ? (mats[j - 1] ? name(mats[j - 1]) : '?' + j) : 'sky').join(' / '); } }
          if (worst >= 3) { const key = where(v); const p = fights.get(key) || { at: key, n: 0, px: 0, eg: [], pairs: new Set() }; p.n++; p.px = Math.max(p.px, worst); p.pairs.add(pair); if (p.eg.length < 3) p.eg.push(`${v.x.toFixed(2)},${y.toFixed(2)},${v.z.toFixed(2)} yaw ${(v.yaw + dir + turn).toFixed(2)}: ${worst} px ${pair}`); fights.set(key, p); }
        } }
      r.setRenderTarget(null); rt.dispose();
      out.fight = { views: n, secs: +((performance.now() - t0) / 1000).toFixed(1), found: [...fights.values()].map(p => ({ ...p, pairs: [...p.pairs] })) };
    }
    for (const m of meshes) { m.material = keep.get(m); m.visible = vis.get(m); } other.forEach(o => o.visible = ovis.get(o)); scene.fog = fog;
  }
  return out;
}

const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url)), src = `((walkList) => (${page})(${JSON.stringify(opts)}))(${walkList})`;
let res;
try { res = JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare#1.9,20,0,0`, '--size', '320x180', '--wait', '3600000', '--eval', src], { encoding: 'utf8', maxBuffer: 1 << 28 })); }
catch (e) { try { res = JSON.parse(e.stdout); } catch { console.log(String(e.stderr || e.message).slice(0, 2000)); process.exit(2); } }
if (res.errors?.length) console.log('page errors:', res.errors.slice(0, 3));
const R = res.result || {}; let bad = 0;
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(R, null, 1));
if (R.list) console.log(R.list.join('\n'));
if (R.scan) { const byZone = {}; for (const p of R.scan.patches) byZone[p.zone] = (byZone[p.zone] || 0) + 1;
  console.log(`scan: ${R.scan.tris} faces in ${R.scan.secs} s, ${R.scan.patches.length} coplanar overlaps ${JSON.stringify(byZone)} (and ${R.scan.twins} between twin copies of one material, not counted)`);
  for (const p of R.scan.patches.slice(0, +arg('top', 60))) console.log(`  ${p.zone} ${p.a} [${p.za}] / ${p.b} [${p.zb}] n ${p.n} ${p.lo} .. ${p.hi} ${p.area} m² gap ${p.dz} mm`);
  bad += R.scan.patches.length; }
if (R.walks !== undefined) console.log(`walk: ${R.walks} walks, ${R.points} points`);
for (const k of ['pop', 'fight']) if (R[k]) { const f = R[k].found, tot = f.reduce((s, p) => s + p.n, 0);
  console.log(`${k}: ${R[k].eyes ?? R[k].views} ${k === 'pop' ? 'eyes' : 'views'} in ${R[k].secs} s, ${tot} found${f.length ? ' at ' + f.map(p => `${p.at}(${p.n})`).join(' ') : ''}`);
  for (const p of f) console.log(`  ${p.at}: ${p.eg.join(' | ')}${p.zones ? ' zones ' + p.zones : ''}${p.pairs ? ' pairs ' + p.pairs.slice(0, 4).join(', ') : ''}`);
  bad += tot; }
process.exit(bad ? 1 : 0);
