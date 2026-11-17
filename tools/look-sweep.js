// node tools/browse.mjs --url "http://127.0.0.1:<port>/?dev&bare" --eval-file tools/look-sweep.js
// Every look parameter at both ends of its range in a view where it matters: mean picture difference (0-255) from neutral at min and at
// max, and after setting the look back to {} (must be ~0). Then one per-zone case: a parameter set on one zone of a view that looks from
// one zone into another, the difference in the screen's left and right halves. Time is held: the same frame is drawn each time.
(async () => {
  const V = { hall: [3.8, 23, Math.PI, 0], back: [1.9, 20, 0, 0], pool: [7.5, -3, .75, -.18], shore: [.5, -5.3, 0, -.95], night: [26.5, -12, -1.75, .1], mall: [.5, 45, 1.2, .12], field: [3.8, 667, Math.PI, .1], gal: [23.2, 14.2, Math.PI, -.08] };
  const where = { 'light.strength': 'back', 'light.warmth': 'hall', 'light.ambient': 'back', 'light.sun': 'field', exposure: 'back', 'mat.rough': 'mall', 'mat.wet': 'mall',
    'water.scatter': 'gal', 'water.clarity': 'shore', 'water.reflect': 'pool', 'water.waves': 'pool', 'fog.density': 'night', 'fog.color': 'night', 'bloom.strength': 'night',
    'bloom.threshold': 'night', 'bloom.radius': 'night', shafts: 'pool', 'grade.sat': 'mall', 'grade.temp': 'mall', 'grade.tint': 'mall', 'grade.contrast': 'mall', 'grade.vignette': 'mall', 'grade.grain': 'mall' };
  const gl = dev.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const shot = (look, v) => { dev.look.set(look); dev.reset(...v); dev.step(20); const a = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; };
  const diff = (a, b, x0 = 0, x1 = 1) => { let s = 0, n = 0; for (let j = 0; j < H; j++) for (let i = Math.floor(x0 * W); i < Math.floor(x1 * W); i++) { const k = (j * W + i) * 4; s += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); n += 3; } return +(s / n).toFixed(2); };
  const rows = [];
  for (const p of dev.look.params) { const v = V[where[p.id]], n0 = shot({}, v), lo = shot({ all: { [p.id]: p.min } }, v), hi = shot({ all: { [p.id]: p.max } }, v), n1 = shot({}, v);
    rows.push(`${p.id.padEnd(16)} ${where[p.id].padEnd(8)} min ${String(diff(n0, lo)).padStart(6)}  max ${String(diff(n0, hi)).padStart(6)}  reset ${diff(n0, n1)}`); }
  // per zone: the pool hall's arcade doorway: the shore (pS) on one side, the arcade (pC) through it
  const pv = window.LOOK_ZONE_VIEW || [8.3, -12, -1.5708 + .45, -.05]; dev.reset(...pv); dev.step(20); const z = dev.look.zoneAt();
  const out = {}; for (const id of z.onScreen) { const a = shot({}, pv), b = shot({ zones: { [id]: { 'light.strength': 2.5 } } }, pv); out[id] = { left: diff(a, b, 0, .5), right: diff(a, b, .5, 1) }; }
  dev.look.set({});
  return { rows, zone: z, perZone: Object.entries(out).map(([k, v]) => `${k} left ${v.left} right ${v.right}`) };
})()
