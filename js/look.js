// The look layer (docs/look.md): a look (deltas over what each zone defines) laid over the game, live. Each zone with a look gets z.lk,
// its own values with the look applied, which mood() (player.js), relight() (lights.js) read in place of the zone's; its materials,
// fixtures and pools are set here. A zone with nothing set has no z.lk and every value is back to what the code made, exactly.
import * as THREE from 'three';
import { zones } from './core.js';
import { lights } from './lights.js';
import { look as mixed, bloom, film } from './post.js';
import { ponds } from './water.js';
import { params, sanitize } from './look.params.js';
import applied from './look.applied.js';

const base = new Map(); // material -> { r, c, k } as built; fixtures' colour and pools' scatter as built
const fix0 = new Map(), scat0 = new Map(), bloom0 = { t: bloom.threshold, r: bloom.radius };
let cur = sanitize({});
const ids = () => Object.keys(zones);
const val = (L, z, p) => { const a = L.all[p.id], b = L.zones[z]?.[p.id]; return p.kind === 'mul' ? (a ?? 1) * (b ?? 1) : (a ?? 0) + (b ?? 0); };
const lampC = w => new THREE.Color(1, 1 - .12 * w, 1 - .4 * w); // warmth: +1 amber, -.5 paler (the lamps' own colour is warm already)
const fixU = z => z.mats.find(m => m.userData.envU?.uLampCol)?.userData.envU.uLampCol;

function set(look) {
  const L = cur = sanitize(look, ids());
  mixed.on = Object.keys(L.all).length > 0 || Object.keys(L.zones).length > 0;
  for (const z of Object.values(zones)) {
    const v = {}; let any = false; for (const p of params) if (p.perZone) { v[p.id] = val(L, z.id, p); any ||= v[p.id] !== p.neutral; }
    const u = fixU(z); if (u && !fix0.has(z)) fix0.set(z, u.value.clone());
    for (const m of z.mats) if (!base.has(m)) base.set(m, { r: m.roughness, c: m.color.clone(), k: m.envMapIntensity });
    if (!any) { delete z.lk; for (const m of z.mats) { const b = base.get(m); m.roughness = b.r; m.color.copy(b.c); m.envMapIntensity = b.k; } if (u) u.value.copy(fix0.get(z)); continue; }
    const t = v['grade.temp'], g = v['grade.tint'], warmC = lampC(v['light.warmth']), wet = v['mat.wet'];
    z.lk = { exp: z.exp * 2 ** v.exposure, shaft: z.shaft * v.shafts, sat: z.sat * v['grade.sat'], bloom: z.bloom * v['bloom.strength'],
      tint: z.tint.clone().multiply(new THREE.Vector3((1 + .1 * t) * (1 - .04 * g), (1 + .01 * t) * (1 + .06 * g), (1 - .16 * t) * (1 - .04 * g))),
      fog: new THREE.Vector4(z.fog.x * v['fog.color'], z.fog.y * v['fog.color'], z.fog.z * v['fog.color'], z.fog.w * v['fog.density']),
      con: .4 + v['grade.contrast'], vig: .7 * v['grade.vignette'], sun: v['light.sun'], light: v['light.strength'], warmC };
    for (const m of z.mats) { const b = base.get(m); m.roughness = b.r * v['mat.rough'] * (1 - .7 * wet); m.color.copy(b.c).multiplyScalar(1 - .3 * wet); m.envMapIntensity = b.k * v['light.strength'] * v['light.ambient']; }
    if (u) u.value.copy(fix0.get(z)).multiply(warmC).multiplyScalar(v['light.strength']);
  }
  for (const w of ponds) { const p = w.material.uniforms, z = w.zone.id; if (!scat0.has(w)) scat0.set(w, p.uScatter.value.clone());
    const v = id => val(L, z, params.find(p => p.id === id));
    p.uLook.value.set(1 / v('water.clarity'), v('water.reflect'), v('water.waves'), v('light.strength') * v('light.ambient') ** .5); // the plan is the floor as baked: direct and ambient light together
    p.uScatter.value.copy(scat0.get(w)).multiplyScalar(v('water.scatter') * v('light.strength')); }
  for (const l of lights) if (l.e) { l.color.set(l.e.color); if (l.e.zone.lk) l.color.multiply(l.e.zone.lk.warmC); } // intensities: relight, every frame
  bloom.threshold = bloom0.t + (L.all['bloom.threshold'] ?? 0); bloom.radius = bloom0.r + (L.all['bloom.radius'] ?? 0);
  film.uniforms.uGrain.value = .026 * (L.all['grade.grain'] ?? 1);
  return get();
}
const get = () => JSON.parse(JSON.stringify(cur));
set(applied);

export { set, get, params };
