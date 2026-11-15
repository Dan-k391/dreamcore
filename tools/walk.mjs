// The walk list, shared by tools/seams.mjs (--pop, --fight) and tools/pvs.mjs; runs in the page (pasted in as source, so it uses
// only its arguments): B is js/build.js, zl the zones as a list, o { fast, only }. Every opening between two zones (where a body
// fits through their shared edge) crossed both ways, 2 m each side, at 10 cm (--fast 20 cm); unless fast, every zone's long centre
// line (10 cm, 50 cm past 40 m). Each view: { w, x, z, yaw, s, ys } with ys the eye heights there (1.6 m and mid-jump 2.5 m) not in a solid.
export function walkList(B, zl, o) {
  const blocked = (x, z, y) => B.colliders.some(c => x > c[0] && x < c[2] && z > c[1] && z < c[3] && y > c[4] && y < c[5]);
  const body = (x, z) => { const f = B.floorH(x, z); return !B.colliders.some(c => x > c[0] - .05 && x < c[2] + .05 && z > c[1] - .05 && z < c[3] + .05 && c[4] < f + 1.7 && c[5] > f + .35); };
  const walks = [], views = [], only = o.only ? o.only.split(',') : null, want = (...ids) => !only || ids.some(i => only.includes(i));
  for (let i = 0; i < zl.length; i++) for (let j = i + 1; j < zl.length; j++) { // openings: shared edges of two zones' boxes a body fits through
    const [a, b] = [zl[i], zl[j]]; if (!want(a.id, b.id)) continue;
    for (const ax of [0, 1]) for (const [p, q] of [[a, b], [b, a]]) { // ax 0: the edge is at an x (p's east side meets q's west)
      const e1 = p.box[ax ? 3 : 2], e2 = q.box[ax ? 1 : 0]; if (Math.abs(e1 - e2) > .7) continue;
      const at = (e1 + e2) / 2, lo = Math.max(p.box[ax ? 0 : 1], q.box[ax ? 0 : 1]), hi = Math.min(p.box[ax ? 2 : 3], q.box[ax ? 2 : 3]); if (hi - lo < .4) continue;
      let run = null; const done = r => { if (r && r[1] - r[0] >= .4) walks.push({ kind: 'door', a: p.id, b: q.id, ax, at, c: (r[0] + r[1]) / 2, w: +(r[1] - r[0]).toFixed(2) }); };
      for (let s = lo; s <= hi + 1e-6; s += .05) { const ok = ax ? body(s, at) : body(at, s); if (ok) run ? run[1] = s : run = [s, s]; else { done(run); run = null; } }
      done(run);
    }
  }
  const eyes = (x, z) => { const f = B.floorH(x, z); return [1.6, 2.5].map(e => f + e).filter(y => !blocked(x, z, y)); };
  for (const w of walks) { // across each opening, both ways; ax 0: walk along x at z = c
    const st = o.fast ? .2 : .1;
    for (let s = -2; s <= 2 + 1e-6; s += st) { const [x, z] = w.ax ? [w.c, w.at + s] : [w.at + s, w.c]; views.push({ w, x, z, yaw: w.ax ? 0 : -Math.PI / 2, s, ys: eyes(x, z) }); }
  }
  if (!o.fast) for (const q of zl) { if (!want(q.id)) continue; // every zone's long centre line
    const [x1, z1, x2, z2] = q.box, X = x2 - x1 >= z2 - z1, len = X ? x2 - x1 : z2 - z1, st = len > 40 ? .5 : .1, w = { kind: 'hall', a: q.id };
    walks.push(w);
    for (let s = .2; s <= len - .2 + 1e-6; s += st) { const [x, z] = X ? [x1 + s, (z1 + z2) / 2] : [(x1 + x2) / 2, z1 + s]; views.push({ w, x, z, yaw: X ? -Math.PI / 2 : 0, s, ys: eyes(x, z) }); }
  }
  return { walks, views };
}
