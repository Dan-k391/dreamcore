// Page side of tools/profile.mjs (run through tools/browse.mjs; the driver prepends `const CFG = {views, frames, waste}`).
// Per view: GPU ms of every pass of a frame from EXT_disjoint_timer_query_webgl2, split exactly where the frame nests (a shadow
// redraw or a pool picture inside the scene pass is timed as its own row, the scene row is the rest), with draw calls, triangles
// and CPU ms for each; with CFG.waste also what the main pass draws that is out of the frustum or behind walls, overdraw and lamps per pixel.
(async () => {
  const { renderer, scene, camera, composer, THREE } = dev, gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) throw new Error('no EXT_disjoint_timer_query_webgl2: no GPU times');
  const info = renderer.info.render, med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }, r2 = v => +v.toFixed(2);
  const W = renderer.domElement.width, H = renderer.domElement.height;
  // ---------- the instrument: a stack of labels, one GPU query open at a time ----------
  let on = false, stack = [], cur = null, segs = [];
  const begin = label => { cur = { label, q: gl.createQuery(), calls: info.calls, tris: info.triangles, t: performance.now() }; gl.beginQuery(ext.TIME_ELAPSED_EXT, cur.q); };
  const end = () => { gl.endQuery(ext.TIME_ELAPSED_EXT); Object.assign(cur, { calls: info.calls - cur.calls, tris: info.triangles - cur.tris, cpu: performance.now() - cur.t }); segs.push(cur); cur = null; };
  const enter = label => { if (!on) return false; if (cur) end(); stack.push(label); begin(label); return true; };
  const leave = () => { end(); stack.pop(); if (stack.length) begin(stack.at(-1)); };
  const wrap = (o, k, label) => { const f = o[k]; o[k] = function (...a) { const l = typeof label === 'function' ? label(...a) : label, e = l && enter(l); try { return f.apply(this, a); } finally { if (e) leave(); } }; };
  const names = ['scene', 'post.ao', 'post.atmos', 'post.bloom', 'post.output', 'post.film'];
  composer.passes.forEach((p, i) => wrap(p, 'render', names[i] || 'post.' + i));
  const pools = [], mirrors = new Set(); scene.traverse(o => { if (o.material?.uniforms?.tMirror) { pools.push(o); mirrors.add(o.material.uniforms.tMirror.value); } });
  wrap(renderer.shadowMap, 'render', (lights) => 'shadows');
  const aoP = composer.passes[1];
  wrap(renderer, 'render', (s, c) => s !== scene ? (s.material === aoP.gtaoMaterial ? 'ao.gtao' : s.material === aoP.pdMaterial ? 'ao.denoise' : stack.length ? null : 'water.sim') : s.overrideMaterial ? (stack.at(-1) === 'post.ao' ? 'ao.normals' : 'override')
    : c === camera ? null : c.isOrthographicCamera ? 'pool.plan' : mirrors.has(renderer.getRenderTarget()?.texture) ? 'pool.mirror' : 'pool.under');
  const px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const results = async list => { gl.finish(); for (let i = 0; i < 200 && !gl.getQueryParameter(list.at(-1).q, gl.QUERY_RESULT_AVAILABLE); i++) await new Promise(r => setTimeout(r, 10));
    const bad = gl.getParameter(ext.GPU_DISJOINT_EXT); for (const s of list) { s.gpu = gl.getQueryParameter(s.q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(s.q); } return !bad; };
  // CPU of the frame outside the composer (player, physics, relight, ripples), the composer's own CPU, and wall ms with the GPU finished
  let compCPU = 0; { const f = composer.render; composer.render = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { compCPU += performance.now() - t; } }; }
  if (CFG.pre) await (0, eval)(CFG.pre); // --pre: an experiment set up before the views (a pass off, a size changed)
  const out = [];
  for (const v of CFG.views) {
    const [x, z, yaw, pitch] = v.hash.split(",").map(Number); dev.reset(x, z, yaw, pitch); dev.lift = v.lift || 0; if (v.pre) await (0, eval)(v.pre); dev.step(60); sync(); // v.pre: a view's own set-up (a door open)
    const frames = []; let disjoint = 0, wall = [], cpuFrame = [], cpuComp = [];
    for (let f = 0; f < CFG.frames; f++) {
      segs = []; on = true; compCPU = 0; const t = performance.now(); dev.step(1); const c = performance.now() - t; on = false; sync(); wall.push(performance.now() - t);
      cpuFrame.push(c - compCPU); cpuComp.push(compCPU);
      if (!await results(segs)) disjoint++;
      const row = {}; for (const s of segs) { const r = row[s.label] ||= { gpu: 0, cpu: 0, calls: 0, tris: 0, n: 0 }; r.gpu += s.gpu; r.cpu += s.cpu; r.calls += s.calls; r.tris += s.tris; r.n++; }
      frames.push(row);
    }
    const labels = [...new Set(frames.flatMap(Object.keys))], pass = {};
    for (const l of labels) { const g = k => frames.map(fr => fr[l]?.[k] || 0); const busy = frames.filter(fr => fr[l]?.calls > 0).map(fr => fr[l]);
      pass[l] = { gpu: r2(med(g('gpu'))), cpu: r2(med(g('cpu'))), calls: med(g('calls')), tris: med(g('tris')), busy: busy.length, busyGpu: r2(med(busy.map(b => b.gpu))), busyCpu: r2(med(busy.map(b => b.cpu))), busyCalls: med(busy.map(b => b.calls)) }; }
    const total = frames.map(fr => Object.values(fr).reduce((a, s) => a + s.gpu, 0));
    const o = { name: v.name, zone: dev.state().zone, gpu: r2(med(total)), wall: r2(med(wall)), cpuFrame: r2(med(cpuFrame)), cpuComposer: r2(med(cpuComp)), disjoint, pass };
    { const ls = []; scene.traverse(l => { if (l.castShadow && l.shadow) ls.push(l); }); for (const l of ls) l.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true; // every map redrawn once, as a lamp move or reset does
      segs = []; on = true; dev.step(1); on = false; await results(segs); const sh = segs.filter(s => s.label === 'shadows'); o.shadowsAll = { maps: ls.length, gpu: r2(sh.reduce((a, s) => a + s.gpu, 0)), calls: sh.reduce((a, s) => a + s.calls, 0), tris: sh.reduce((a, s) => a + s.tris, 0) }; }
    if (CFG.waste) o.waste = await waste();
    out.push(o);
  }
  // ---------- waste: what the main pass draws, judged against the frustum, the picture and the lamps ----------
  async function waste() {
    const drawn = [], rec = Object.getPrototypeOf(THREE.Mesh.prototype).onBeforeRender; let grab = false; // what three really draws in the scene pass
    THREE.Object3D.prototype.onBeforeRender = function (r, s, c, g, m) { if (grab && c === camera && !s.overrideMaterial) drawn.push(this); };
    grab = true; dev.step(1); grab = false; THREE.Object3D.prototype.onBeforeRender = rec;
    for (const w of pools) if (w.visible) drawn.push(w); // a pool draws through its own hook: in, so its pixels count (and hide the floor under it)
    const meshes = [...new Set(drawn)], fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const P = fr.planes, v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], box = new THREE.Box3(), cells = [2, 4, 8, 16, 32];
    let tris = 0, inF = 0, grassT = 0, inst = 0; scene.traverse(o => { if (o.visible && o.geometry?.isInstancedBufferGeometry) grassT += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * o.geometry.instanceCount; }); const chunk = cells.map(() => ({ calls: 0, tris: 0 })), byZone = {};
    const outside = (a, b, c) => P.some(p => p.distanceToPoint(a) < 0 && p.distanceToPoint(b) < 0 && p.distanceToPoint(c) < 0);
    for (const m of meshes) {
      const g = m.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (g.isInstancedBufferGeometry || pools.includes(m)) continue; // shader-placed grass: already culled per tile on the CPU
      if (m.isInstancedMesh) { inst += n * m.count; tris += n * m.count; inF += n * m.count; continue; } // (counted as all in view)
      const pos = g.attributes.position, idx = g.index, mw = m.matrixWorld; let mine = 0, mineIn = 0; const bins = cells.map(() => new Map());
      for (let t = 0; t < n; t++) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(mw);
        const o = outside(v[0], v[1], v[2]); mine++; if (!o) mineIn++;
        const cx = (v[0].x + v[1].x + v[2].x) / 3, cz = (v[0].z + v[1].z + v[2].z) / 3;
        cells.forEach((s, i) => { const key = Math.floor(cx / s) + ',' + Math.floor(cz / s); let b = bins[i].get(key); if (!b) bins[i].set(key, b = { n: 0, box: new THREE.Box3() }); b.n++; b.box.expandByPoint(v[0]).expandByPoint(v[1]).expandByPoint(v[2]); });
      }
      bins.forEach((bm, i) => { for (const b of bm.values()) if (fr.intersectsBox(b.box)) { chunk[i].calls++; chunk[i].tris += b.n; } });
      tris += mine; inF += mineIn; const zid = m.userData.zone ?? '?'; (byZone[zid] ||= { tris: 0, px: 0 }).tris += mine;
    }
    // which drawn meshes reach the picture at all: an id render of the same draw list
    const rt = new THREE.WebGLRenderTarget(W, H), was = new Map(), hidden = [], idOf = new Map();
    scene.traverse(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { was.set(o, o.material); if (o.geometry?.isInstancedBufferGeometry || !meshes.includes(o)) { hidden.push([o, o.visible]); o.visible = false; } } });
    meshes.forEach((m, i) => { if (!m.visible) return; idOf.set(i + 1, m); m.material = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, side: [m.material].flat()[0].side }); m.material.color.setRGB(((i + 1) & 255) / 255, ((i + 1) >> 8) / 255, 0, THREE.LinearSRGBColorSpace); });
    const bg = scene.background, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(); scene.background = null; renderer.setRenderTarget(rt); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera);
    const pix = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, pix); const count = new Map();
    for (let k = 0; k < W * H; k++) { const id = pix[k * 4] + (pix[k * 4 + 1] << 8); if (id) count.set(id, (count.get(id) || 0) + 1); }
    let seenT = 0; for (const [id, m] of idOf) { const g = m.geometry; if (g.isInstancedBufferGeometry || m.isInstancedMesh) continue; const n = (g.index ? g.index.count : g.attributes.position.count) / 3, c = count.get(id) || 0;
      if (c) seenT += n; const zid = m.userData.zone ?? '?'; if (byZone[zid]) byZone[zid].px += c; }
    for (const [o, m] of was) { if (o.material !== m) o.material.dispose?.(); o.material = m; }
    // overdraw: fragments that pass the depth test in the real draw order (what is shaded), and every fragment rasterised
    const ft = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType }), poolPx = [...idOf].filter(([, m]) => pools.includes(m)).reduce((a, [id]) => a + (count.get(id) || 0), 0), add = d => new THREE.MeshBasicMaterial({ color: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthTest: d, depthWrite: d, side: THREE.FrontSide });
    const od = mat => { mat.color.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace); scene.overrideMaterial = mat; renderer.setRenderTarget(ft); renderer.clear(); renderer.render(scene, camera); scene.overrideMaterial = null;
      const a = new Float32Array(W * H * 4); renderer.readRenderTargetPixels(ft, 0, 0, W, H, a); let s = 0, cov = 0, mx = 0; for (let k = 0; k < W * H; k++) { s += a[k * 4]; if (a[k * 4] > 0) cov++; mx = Math.max(mx, a[k * 4]); } mat.dispose(); return { perPx: r2(s / (W * H)), perCovered: r2(s / Math.max(cov, 1)), max: mx }; };
    const shaded = od(add(true)), depth = od(add(false));
    // lamps per pixel: from the depth the AO pass drew this frame, how many of the nine lamps are on and reach the point (range and cone)
    const lamps = []; scene.traverse(o => { if (o.isSpotLight) lamps.push(o); });
    const ao = composer.passes[1], q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { tD: { value: ao.depthTexture }, uPI: { value: camera.projectionMatrixInverse }, uCW: { value: camera.matrixWorld },
      uP: { value: lamps.map(l => l.getWorldPosition(new THREE.Vector3())) }, uD: { value: lamps.map(l => l.target.getWorldPosition(new THREE.Vector3()).sub(l.getWorldPosition(new THREE.Vector3())).normalize()) },
      uK: { value: lamps.map(l => new THREE.Vector3(Math.cos(l.angle), l.distance || 1e9, l.intensity > 0 ? 1 : 0)) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `uniform sampler2D tD; uniform mat4 uPI, uCW; uniform vec3 uP[${lamps.length}], uD[${lamps.length}], uK[${lamps.length}]; varying vec2 vUv;
        void main() { float d = texture2D(tD, vUv).x; if (d >= 1.) { gl_FragColor = vec4(0.); return; }
          vec4 v = uPI * vec4(vUv * 2. - 1., d * 2. - 1., 1.); vec3 p = (uCW * vec4(v.xyz / v.w, 1.)).xyz; float n = 0.;
          for (int i = 0; i < ${lamps.length}; i++) { vec3 l = p - uP[i]; if (uK[i].z > 0. && length(l) < uK[i].y && dot(normalize(l), uD[i]) > uK[i].x) n += 1.; }
          gl_FragColor = vec4(n / 255., 1. / 255., 0., 1.); }` }));
    q.frustumCulled = false; const qs = new THREE.Scene(); qs.add(q); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(qs, new THREE.Camera()); renderer.readRenderTargetPixels(rt, 0, 0, W, H, pix);
    const hist = Array(lamps.length + 1).fill(0); let geo = 0; for (let k = 0; k < W * H; k++) if (pix[k * 4 + 1]) { hist[pix[k * 4]]++; geo++; }
    for (const [o, vis] of hidden) o.visible = vis; scene.background = bg; renderer.setClearColor(cc, ca); renderer.setRenderTarget(null); rt.dispose(); ft.dispose();
    // the scene pass drawn alone (pools and grass hidden, shadows as they are) three ways, GPU ms: as is; after a depth-only pre-pass
    // (what a pre-pass would cost and save); every mesh in one flat unlit material (the geometry and raster floor)
    const rtM = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }), hideX = [], flat = new THREE.MeshBasicMaterial(), depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
    scene.traverse(o => { if (o.visible && (o.geometry?.isInstancedBufferGeometry || pools.includes(o))) { hideX.push(o); o.visible = false; } });
    const timeIt = async fn => { const t = []; for (let i = 0; i < 7; i++) { renderer.shadowMap.needsUpdate = false; renderer.setRenderTarget(rtM); renderer.clear(); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); fn(); gl.endQuery(ext.TIME_ELAPSED_EXT); t.push({ q }); }
      await results(t); return r2(med(t.map(s => s.gpu))); };
    const ac = renderer.autoClear, sceneAlone = await timeIt(() => renderer.render(scene, camera));
    const prepass = await timeIt(() => { scene.overrideMaterial = depthOnly; renderer.render(scene, camera); scene.overrideMaterial = null; renderer.autoClear = false; renderer.render(scene, camera); renderer.autoClear = ac; });
    const flatT = await timeIt(() => { scene.overrideMaterial = flat; renderer.render(scene, camera); scene.overrideMaterial = null; });
    for (const o of hideX) o.visible = true; rtM.dispose(); renderer.setRenderTarget(null);
    const pct = a => Math.round(100 * a / Math.max(tris, 1));
    return { sceneAlone, prepass, flat: flatT, poolPx: r2(100 * poolPx / (W * H)), tris, outFrustumPct: 100 - pct(inF), meshes: meshes.length, meshesNoPixel: [...idOf.keys()].filter(id => !count.get(id)).length, inMeshesNoPixelPct: 100 - pct(seenT + inst), grass: grassT, instanced: inst,
      zonesNoPixel: Object.entries(byZone).filter(([, b]) => !b.px).map(([z, b]) => z + ':' + b.tris), chunks: Object.fromEntries(cells.map((s, i) => [s + 'm', chunk[i]])), shaded, depth,
      lampsOn: lamps.filter(l => l.intensity > 0).length, lampsPerPx: hist.map(h => Math.round(100 * h / Math.max(geo, 1))) };
  }
  return { W, H, dpr: devicePixelRatio, pr: renderer.getPixelRatio(), views: out };
})()
