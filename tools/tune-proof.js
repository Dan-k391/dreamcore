// End-to-end proof of the tuning workspace (docs/look.md): node tools/browse.mjs --url "http://127.0.0.1:<port>/tune.html" --size 1920x1080 --wait 400000 --eval-file tools/tune-proof.js
// Needs tools/serve.mjs (presets, apply). Its one error line, a 400 for /looks/presets/proof-junk, is the junk check being refused. Prints numbers; restores the empty applied look and removes its test preset (js/look.applied.js
// is rewritten as {"all":{},"zones":{}}: `git checkout js/look.applied.js` gives back the committed literal).
(async () => {
  const W = dev.tune, T = W.T, out = {}, sleep = ms => new Promise(r => setTimeout(r, ms)), frames = () => requestAnimationFrame && new Promise(r => requestAnimationFrame(() => r()));
  const vis = T.slice(0, W.S.layout), grabs = () => vis.map(t => W.grab(t.i)), d4 = (A, B) => A.map((a, i) => W.diff(a, B[i]));
  const waitReady = (w, ms = 200000) => new Promise((ok, no) => { const t0 = performance.now(), iv = setInterval(() => { if (w.dev?.ready) { clearInterval(iv); ok(performance.now() - t0); } else if (performance.now() - t0 > ms) { clearInterval(iv); no(new Error('not ready')); } }, 200); });
  W.setLook({}); W.target('all');
  out.tiles = vis.map(t => ({ i: t.i, state: t.state, zone: t.zone, view: W.S.views[t.i].name, loadMs: t.loadMs }));
  out.zonesDistinct = new Set(vis.map(t => t.zone)).size;
  // idle: no frames drawn in 3 s
  const f0 = vis.map(t => t.d.renderer.info.render.frame); await sleep(3000); out.idleFrames = vis.map((t, i) => t.d.renderer.info.render.frame - f0[i]);
  const g0 = grabs(); out.noise = d4(g0, grabs());
  // all rooms
  W.set('exposure', .8, 'all'); const gA = grabs(); out.allChange = d4(gA, g0);
  // one room (tile 2's)
  W.setLook({}); const z = vis[1].zone; W.set('light.strength', 2, z); W.set('exposure', .8, z); const gR = grabs(); out.roomChange = { zone: z, diff: d4(gR, g0) };
  // before / after
  W.setLook({ all: { exposure: .8 }, zones: {} }); const gA2 = grabs(); W.before(true); out.beforeHeld = d4(grabs(), g0); W.before(false); out.beforeReleased = d4(grabs(), gA2);
  // against a preset
  await W.against('quiet-and-neutral', true); const gQ = grabs(); await W.against('quiet-and-neutral', false); out.againstHeld = d4(gQ, gA2); out.againstReleased = d4(grabs(), gA2);
  // undo / redo
  W.setLook({}); const L0 = JSON.stringify(W.look()); W.set('grade.sat', 1.5, 'all'); const L1 = JSON.stringify(W.look()), g1 = grabs(); W.set('fog.density', 3, 'all'); const L2 = JSON.stringify(W.look()), g2 = grabs();
  W.undo(); const u1 = JSON.stringify(W.look()) === L1, gu = grabs(); W.undo(); const u0 = JSON.stringify(W.look()) === L0; W.redo(); W.redo(); const r2 = JSON.stringify(W.look()) === L2, gr = grabs();
  out.undoRedo = { undoToL1: u1, undoToL0: u0, redoToL2: r2, picUndo: d4(gu, g1), picRedo: d4(gr, g2) };
  // presets at 100 and 50 percent
  const file = await (await fetch('/looks/presets/warm-and-luminous')).json();
  await W.preset('warm-and-luminous', 1, 'replace'); const p100 = W.look(), gp100 = grabs(); await W.preset('warm-and-luminous', .5, 'replace'); const p50 = W.look(), gp50 = grabs();
  const half = Object.entries(file.all).every(([id, v]) => { const mul = ['light.strength', 'bloom.strength', 'shafts', 'grade.sat', 'water.scatter'].includes(id); return Math.abs(p50.all[id] - (mul ? 1 + (v - 1) / 2 : v / 2)) < 1e-3; });
  out.preset = { at100equalsFile: JSON.stringify(p100.all) === JSON.stringify(file.all), at50half: half, pic100: d4(gp100, g0), pic50: d4(gp50, g0) };
  await W.preset('quiet-and-neutral', 1, 'over'); out.preset.overKeepsBoth = 'light.warmth' in W.look().all && W.look().all['light.strength'] > 1;
  // presets on disk: save, list, rename, delete
  W.setLook({ all: { exposure: .3 }, zones: { [z]: { 'mat.wet': .5 } } }); const disk = W.disk(); const n1 = await W.save('Proof Test'); const l1 = await W.list(); const n2 = await W.rename(n1, 'proof-test-2'); const l2 = await W.list();
  const back = await (await fetch('/looks/presets/' + n2)).json(); await W.remove(n2); const l3 = await W.list();
  out.presetsDisk = { disk, saved: n1, listed: l1.includes(n1), renamed: l2.includes(n2) && !l2.includes(n1), roundTrip: JSON.stringify(back) === JSON.stringify(W.look()), deleted: !l3.includes(n2), left: l3 };
  // junk is refused
  const before = JSON.stringify(W.look());
  out.junk = { notJson: W.importText('this is not a look').ok, noValues: W.importText('{"foo":{"bar":1},"all":{"nope":3}}').ok, unchanged: JSON.stringify(W.look()) === before,
    serverJunk: (await fetch('/looks/presets/proof-junk', { method: 'PUT', body: '{nope' })).status, good: W.importText('{"all":{"exposure":0.4,"bogus":2}}') };
  // apply: the file, then a fresh game load starts with it; then the empty look again
  W.setLook({ all: { exposure: .5, 'grade.temp': .3 }, zones: {} }); const ap = await W.apply(); const txt = await (await fetch('/js/look.applied.js', { cache: 'no-store' })).text();
  const g = document.body.appendChild(Object.assign(document.createElement('iframe'), { src: 'index.html?dev&bare', style: 'position:fixed;left:0;top:0;width:320px;height:180px' }));
  await new Promise(r => g.onload = r); await waitReady(g.contentWindow); out.apply = { disk: ap.disk, fileHas: txt.includes('"grade.temp": 0.3'), freshGameLook: g.contentWindow.dev.look.get() }; g.remove();
  W.setLook({}); await W.apply(); out.apply.restored = (await (await fetch('/js/look.applied.js', { cache: 'no-store' })).text()).includes('"all": {}');
  // cost: a slider dragged on all rooms (every tile redraws) and on one room (only the tiles that can show it)
  const drag = async (t, n = 40) => { const ts = []; for (let k = 0; k < n; k++) { const t0 = performance.now(); W.set('exposure', (k % 20) / 20, t); await frames(); ts.push(performance.now() - t0); } ts.sort((a, b) => a - b); return { median: +ts[n >> 1].toFixed(1), p90: +ts[Math.floor(n * .9)].toFixed(1) }; };
  out.dragAll = await drag('all'); out.dragRoom = await drag(vis[0].zone); W.setLook({});
  const f1 = vis.map(t => t.d.renderer.info.render.frame); await sleep(2000); out.idleAfter = vis.map((t, i) => t.d.renderer.info.render.frame - f1[i]);
  out.mem = { tex: vis.map(t => t.d.texMem().MB), gl: vis.map(t => t.d.renderer.info.memory), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  // persistence: the state is in storage; a second workspace opened on it comes back the same (two tiles, a room target)
  W.layout(2); W.setLook({ all: { 'grade.sat': .7 }, zones: { [vis[1].zone]: { 'light.warmth': .6 } } }); W.target(vis[1].zone); await sleep(300);
  const c = document.body.appendChild(Object.assign(document.createElement('iframe'), { src: 'tune.html', style: 'position:fixed;left:0;top:0;width:1600px;height:900px;z-index:99' }));
  await new Promise(r => c.onload = r); await sleep(500); await waitReady(c.contentWindow, 300000); const C = c.contentWindow.dev.tune;
  out.reload = { look: JSON.stringify(C.look()) === JSON.stringify(W.look()), layout: C.S.layout === 2, target: C.S.target === W.S.target, views: JSON.stringify(C.S.views) === JSON.stringify(W.S.views), tilesGotLook: C.T.slice(0, 2).map(t => JSON.stringify(t.d.look.get()) === JSON.stringify(W.look())) };
  c.remove(); W.setLook({}); W.target('all'); W.layout(4);
  return out;
})()
