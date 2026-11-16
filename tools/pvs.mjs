// Which zones can be seen from which, for js/seen.js (build.js draws only those):
//   node tools/pvs.mjs [--port 8200] [--check]
// Loads the real game (?dev&bare) and, from a grid of eye points over every zone (1 m apart, eye at 1.6 m and at a jump's 2.6 m
// above the floor, skipping points inside solids), and from every eye of tools/walk.mjs's walk list (each opening crossed at 10 cm,
// each zone's centre line, at 1.6 m and 2.5 m: the narrow sight lines a 1 m grid steps over), renders a small cube view with every
// opaque mesh flat-coloured by its zone and reads back which zones show. Portal openings are shut for it (what shows through one is drawn
// with the far end's own row). See-through things (glass, cut-out leaves, water, loose things) hide nothing. --check only compares
// with js/seen.js and fails if a zone is seen that seen.js leaves out (run after changing what a place opens onto).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { walkList } from './walk.mjs';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const port = arg('port', '8200'), check = argv.includes('--check'), step = +arg('step', 1);
const sample = res => `(async () => {
  const THREE = await import('three'), B = await import('/js/build.js'), S = await import('/js/sky.js');
  const { scene, renderer: r, zones } = dev, ids = Object.keys(zones), idx = new Map(ids.map((id, i) => [id, i + 1]));
  dev.hold = true;
  const rig = n => { const rt = new THREE.WebGLCubeRenderTarget(n), cam = new THREE.CubeCamera(.05, 3000, rt); for (const c of cam.children) c.layers.enableAll(); return { n, rt, cam, buf: new Uint8Array(n * n * 4) }; }; // every zone's layer: the answer must not depend on the seen.js in force
  const big = rig(${res}), rigs = ${res} === 96 ? [big, rig(64)] : [big]; // walk eyes also at seams.mjs --pop's 64 px: a sliver one size's pixel centres hit and another's miss is in either way
  for (const e of B.ends) { const m = new THREE.Mesh(new THREE.PlaneGeometry(e.w, e.h).translate(0, e.h / 2, 0), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); // a portal's opening is shut: what shows through it is the far end's own row (js/portals.js)
    m.position.copy(e.p); m.rotation.y = e.ry; m.userData.zone = ''; scene.add(m); m.updateMatrixWorld(); }
  const flat = new Map(), clear = m => m.transparent || m.alphaTest > 0 || m.transmission > 0 || m.opacity < 1 || m.depthWrite === false || m.colorWrite === false || m.visible === false;
  const meshes = [], other = []; scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh) meshes.push(o); else if (o.isMesh || o.isLine || o.isPoints || o.isSprite) other.push(o); }); // other: drawn in its own colours it reads as a zone id (u0..u5 'seen' from the mall), so hidden
  const opaque = new Set(meshes.filter(o => !Array.isArray(o.material) && !clear(o.material) && !B.seeThrough.includes(o) && !o.material.uniforms?.tMirror && (o.material.isMeshStandardMaterial || o.material.isMeshBasicMaterial || o.material.isMeshLambertMaterial || o.material.isMeshPhongMaterial)));
  const colour = (id, side) => { const k = idx.get(id) || 0, key = k * 4 + side; if (!flat.has(key)) flat.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(k / 255, 0, 0, THREE.LinearSRGBColorSpace), fog: false, side })); return flat.get(key); };
  const keep = new Map(meshes.map(o => [o, o.material]));
  scene.onBeforeRender = () => {}; scene.background = null; const fog = scene.fog; scene.fog = null; r.setClearColor(0, 0); r.shadowMap.enabled = false;
  const out = {}, hid = new Set(), t0 = performance.now(), zl = Object.values(zones), walk = new Map(); let n = 0;
  for (const v of walkList(B, zl, {}).views) { const q = zl.find(q => v.x > q.box[0] && v.x < q.box[2] && v.z > q.box[1] && v.z < q.box[3]); // the walk list's eyes too: openings at 10 cm, centre lines
    if (q) walk.has(q.id) ? walk.get(q.id).push(v) : walk.set(q.id, [v]); }
  const look = (got, x, y, q, { n: k, rt, cam, buf } = big) => { cam.position.set(x, y, q); cam.updateMatrixWorld(); cam.update(r, scene); n++;
    for (let face = 0; face < 6; face++) { r.readRenderTargetPixels(rt, 0, 0, k, k, buf, face); for (let i = 0; i < buf.length; i += 4) if (buf[i]) got.add(buf[i]); } };
  for (const z of Object.values(zones)) {
    hid.forEach(o => o.visible = true); hid.clear(); S.setSky(z.sky || 'day'); scene.background = null; other.forEach(o => o.visible = false);
    for (const o of meshes) { o.material = keep.get(o); const own = zones[o.userData.zone]; // another sky's place is never drawn here (sky.js), nor hides anything
      if (o.visible && own && (own.sky || 'day') !== (z.sky || 'day')) { o.visible = false; hid.add(o); } else if (o.visible && opaque.has(o)) o.material = colour(o.userData.zone, o.material.side); else if (!opaque.has(o)) { o.visible = false; o.layers.disableAll(); } } // off its layers too: the loose balls' own code shows them again, and in their own shading their red reads as a zone number
    const got = new Set(), [x1, z1, x2, z2] = z.box, w = x2 - x1, d = z2 - z1, st = Math.max(${step}, Math.sqrt(w * d / 1500));
    for (let x = x1 + .2; x <= x2 - .2 + 1e-6; x += Math.max(.1, Math.min(st, (w - .4) / Math.max(1, Math.round((w - .4) / st)))))
      for (let q = z1 + .2; q <= z2 - .2 + 1e-6; q += Math.max(.1, Math.min(st, (d - .4) / Math.max(1, Math.round((d - .4) / st))))) {
        const f = B.floorH(x, q);
        for (const e of [1.6, 2.6]) { const y = f + e;
          if (B.colliders.some(c => x > c[0] && x < c[2] && q > c[1] && q < c[3] && y > c[4] && y < c[5])) continue;
          look(got, x, y, q);
        }
      }
    for (const v of walk.get(z.id) || []) for (const y of v.ys) for (const g of rigs) look(got, v.x, y, v.z, g);
    out[z.id] = [...got].map(k => ids[k - 1]).filter(id => id && id !== z.id).sort();
  }
  return { out, samples: n, secs: Math.round((performance.now() - t0) / 1000) };
})()`;
const browse = fileURLToPath(new URL('./browse.mjs', import.meta.url)), file = fileURLToPath(new URL('../js/seen.js', import.meta.url));
const go = res => JSON.parse(execFileSync(process.execPath, [browse, '--url', `http://127.0.0.1:${port}/?dev&bare#1.9,20,0,0`, '--size', '320x180', '--wait', '1800000', '--eval', `((walkList) => ${sample(res)})(${walkList})`], { encoding: 'utf8', maxBuffer: 1 << 26 }));
// the check at 96 px a face; the table the union of 96 and 128 px, so a sliver one size catches and the other misses is in it either way
const runs = (check ? [96] : [96, 128]).map(go), errors = runs.flatMap(r => r.errors || []), result = runs[0].result;
for (const r of runs.slice(1)) { result.samples += r.result.samples; result.secs += r.result.secs; for (const [id, l] of Object.entries(r.result.out)) result.out[id] = [...new Set([...result.out[id], ...l])].sort(); }
if (errors?.length) console.log('page errors:', errors.slice(0, 3));
const now = (await import('../js/seen.js')).default, missing = [];
for (const [id, list] of Object.entries(result.out)) for (const q of list) if (now[id] && !now[id].includes(q)) missing.push(id + ' sees ' + q);
for (const id of Object.keys(result.out)) if (!now[id]) missing.push(id + ' not in seen.js');
console.log(`${result.samples} eye points in ${result.secs} s; ${missing.length ? 'differs from seen.js: ' + missing.join(', ') : 'seen.js covers it'}`);
if (check) process.exit(missing.length ? 1 : 0);
writeFileSync(file, `// Which zones can be seen from which: written by tools/pvs.mjs, read by merge() in build.js. Run it again after changing what a place opens onto.\nexport default {\n${Object.entries(result.out).map(([id, l]) => `  ${id}: ${JSON.stringify(l)},`).join('\n')}\n};\n`);
console.log('wrote js/seen.js:', Object.entries(result.out).map(([id, l]) => `${id}(${l.length})`).join(' '));
