// Materials more than one place uses, and the helpers places make their own with.
import * as THREE from 'three';
import { scene, uTime, V, WY } from './core.js';
import { maxA, grime, wn0, sets, LIB, libTex, detailTex } from './tex.js';

// ---------- materials ----------
// Budget: 16 texture units. 9 lamp shadows + 1 sun shadow leave 6: a library material uses 4 (its two maps, the shared detail, env),
// pool tiles 5 (plus the ripple sim). Nothing may use more than 6.
const S = o => new THREE.MeshStandardMaterial(o);
const dirt = { aoMap: grime, aoMapIntensity: .7 };

// ---------- the material library ----------
// The materials themselves (name: its texture set and these options) are made in the family files, js/tex/<family>.js.
// Options: detail: strength of the shared 10 cm micro normal; macro: albedo (and gloss) variation from the shared world-space
// field, several metres down to a few cm; grime: how much the low patches of that field darken the ambient light and the
// albedo (default .18: dust and handling that gathers unevenly); fine: metres of the set's finest pattern, which then fades to
// a blur of itself where the screen can no longer resolve it (no moire); larger structure stays; dirt: grime where walls meet the floor and dust on tops
// (dirtCol multiplies); wear: lightening toward edgeCol on rounded convex edges; vary: break up the repeat (isotropic sets
// only); sheen: velvet-like grazing light; back: back-face albedo factor; emit: emissive colour and level (the set's pattern
// modulates it); everything else is a material property.
const libKeys = ['detail', 'dm', 'macro', 'grime', 'fine', 'dirt', 'wear', 'dirtCol', 'edgeCol', 'vary', 'sheen', 'back', 'emit', 'tri', 'uv', 'swap', 'floor', 'roughness'];
// The shader every library material shares (one program, whatever the material): maps sampled by the geometry's UVs in metres
// (build.js box-projects them) or triplanar in world space, a micro detail, macro variation, dirt and edge wear from the geometry.
const libPars = `uniform sampler2D tLA, tLB, tLD; uniform vec4 uL0, uL1, uL2, uL3, uL4; uniform vec3 uLDirt, uLEdge; varying vec3 vLW, vLN; varying vec2 vLUv;
  // uL0: 1 / metres a set covers, triplanar?, 1 / detail metres, detail strength. uL1: wear, dirt, vary, sheen.
  // uL2: normal strength, floor height, metres per UV unit (u, v). uL3: emitter?, back-face albedo, macro amount, swap u and v?
  // uL4: grime, metres of the finest pattern (0: no fade)
  const mat2 lRot = mat2(.8, .6, -.6, .8);
  void lTap(vec2 t, out vec4 a, out vec4 b) {
    a = texture2D(tLA, t); b = texture2D(tLB, t);
    if (uL1.z > 0.) { // break the repeat: a second, turned copy faded in and out by a slow field
      vec2 t2 = lRot * t + vec2(.371, .713); vec4 a2 = texture2D(tLA, t2), b2 = texture2D(tLB, t2);
      b2.xy = ((b2.xy * 2. - 1.) * lRot) * .5 + .5; // its normal turned back into this frame
      float w = smoothstep(.4, .6, texture2D(tLD, t * .23 + .5).a); a = mix(a, a2, w); b = mix(b, b2, w); } }
  mat3 lFrame(vec3 N, vec3 p, vec2 uv) { vec3 d1 = dFdx(p), d2 = dFdy(p); vec2 e1 = dFdx(uv), e2 = dFdy(uv); vec3 a = cross(d2, N), b = cross(N, d1);
    vec3 T = a * e1.x + b * e2.x, B = a * e1.y + b * e2.y; float s = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-24)); return mat3(T * s, B * s, N); }
  vec3 lNz(vec2 xy) { return vec3(xy, sqrt(max(1. - dot(xy, xy), 0.))); }
  // the macro field: the detail set's smooth channel at three scales (blobs of about 6 m, 1.5 m and 0.5 m, each with finer
  // octaves), turned and offset so their repeats never line up. World space, so it runs on across separate boxes.
  // x: all three scales, y: the two large ones only (for grime, which gathers in broad soft patches)
  vec2 lF(vec2 p) { float a = texture2D(tLD, p * .041 + .17).a * .55 + texture2D(tLD, lRot * p * .17 + .5).a * .45; return vec2(a * .8 + texture2D(tLD, p.yx * .53 + .29).a * .2, a); }
  vec2 lMacro(vec3 p, vec3 w) { vec2 a = w.y > .98 ? lF(p.xz) : w.x > .98 ? lF(p.zy) : w.z > .98 ? lF(p.xy) : lF(p.zy) * w.x + lF(p.xz) * w.y + lF(p.xy) * w.z;
    return clamp((a - .5) * 3., -1.5, 1.5); } // centred on 0, standard deviation about .4, smooth (no clamped plateaus)
`;
const libMain = `
  vec3 lN = normalize(vLN) * (gl_FrontFacing ? 1. : -1.); vec4 la, lb; vec2 lM, lT; vec3 lNW = lN;
  vec3 lW3 = pow(abs(lN), vec3(4.)); lW3 /= lW3.x + lW3.y + lW3.z;
  if (uL0.y < .5) { lM = vLUv * uL2.zw; if (uL3.w > .5) lM = lM.yx; lT = lM * uL0.x; lTap(lT, la, lb); }
  else { vec4 ax, bx, ay, by, az, bz; vec3 w = lW3;
    lTap(vLW.zy * uL0.x, ax, bx); lTap(vLW.xz * uL0.x, ay, by); lTap(vLW.xy * uL0.x, az, bz);
    la = ax * w.x + ay * w.y + az * w.z; lb = bx * w.x + by * w.y + bz * w.z;
    vec3 nx = lNz((bx.xy * 2. - 1.) * uL2.x), ny = lNz((by.xy * 2. - 1.) * uL2.x), nz = lNz((bz.xy * 2. - 1.) * uL2.x); // whiteout blend
    lNW = normalize(vec3(nx.xy + lN.zy, nx.z * lN.x).zyx * w.x + vec3(ny.xy + lN.xz, ny.z * lN.y).xzy * w.y + vec3(nz.xy + lN.xy, nz.z * lN.z) * w.z);
    lM = w.x > max(w.y, w.z) ? vLW.zy : w.y > w.z ? vLW.xz : vLW.xy; lT = lM * uL0.x; }
  if (uL4.y > 0.) { // a pattern finer than the pixel fades to its average (the last mip) instead of beating against the pixel grid
    float lFd = smoothstep(.25, .7, length(fwidth(lM)) / uL4.y);
    if (lFd > 0.) { float lod = log2(uL4.y * uL0.x * float(textureSize(tLA, 0).x)) + 1.; // the mip whose texels span the fine pattern: it goes, larger structure stays
      la = mix(la, textureLod(tLA, lT, lod), lFd); lb.xy = mix(lb.xy, textureLod(tLB, lT, lod).xy, lFd); } }
  vec4 lD;
  if (uL0.y < .5) lD = texture2D(tLD, lM * uL0.z);
  else lD = texture2D(tLD, vLW.zy * uL0.z) * lW3.x + texture2D(tLD, vLW.xz * uL0.z) * lW3.y + texture2D(tLD, vLW.xy * uL0.z) * lW3.z; // blended: no seam where the dominant projection changes
  vec2 lMa = lMacro(vLW, lW3); float lMac = lMa.x, lGr = uL4.x * smoothstep(.6, -1.4, lMa.y); // grime: the broad low patches of the field, edges kept wide (narrow ones read as smoke)
  vec3 lC = la.rgb * mix(vec3(1.), diffuse, uL3.x > .5 ? 1. : la.a) * max(.3, 1. + uL3.z * lMac) * (1. - .25 * lGr);
  float lDk = 1. - smoothstep(.015, .1, dot(lC, vec3(.3, .59, .11))); // a dark surface is read by its highlights: more variation in its gloss and relief
  float lR = clamp(lb.b * (1. + (.25 * uL3.z + .25 * lDk) * lMac) + (lD.b - .5) * uL0.w * (.4 + .6 * lDk), .02, 1.), lMet = lb.a;
  float lH = vLW.y - uL2.y, lG = clamp(.45 + .6 * lMac + .6 * (lD.a - .5), 0., 1.);
  float lDirt = uL1.y * (1. - smoothstep(0., .45, lH)) * step(-.03, lH) * (1. - abs(lN.y)) * lG; // grime where it meets the floor
  lC = mix(lC, lC * uLDirt, lDirt); lR = mix(lR, 1., .4 * lDirt); lMet *= 1. - lDirt;
  float lDust = uL1.y * .3 * smoothstep(.7, .95, lN.y) * step(.25, lH) * lG; lC = mix(lC, vec3(.4, .38, .35), lDust * .5); lR = mix(lR, .9, lDust); // dust settles on tops
  float lE = uL1.x * smoothstep(6., 30., length(fwidth(lN)) / max(length(fwidth(vLW)), 1e-4)) * smoothstep(.35, .65, lD.a + .4 * lMac); // rounded convex edges wear
  lC = mix(lC, uLEdge, lE * .45); lR = mix(lR, .7, lE * .3);
  lC = max(lC, vec3(.012)); // nothing so dark that it reads as a hole
  diffuseColor.rgb = lC * (gl_FrontFacing ? 1. : uL3.y);
`;
// Box-projected (parallax-corrected) reflections: the zone's probe is a picture of the room from one point, so a reflected ray is
// followed from the shaded point to the zone's box (zone.env) and the probe looked up toward where it lands, not along the ray.
// A light on the ceiling then shows in the floor where a mirror puts it, from anywhere in the room. No box (outdoors): the plain lookup.
// lights.js's bake fills the uniforms from the zone. Every material a zone lights runs this (library ones inside libCompile).
const envBoxU = () => ({ uEMin: { value: V(1, 1, 1) }, uEMax: { value: V(-1, -1, -1) }, uEP: { value: V(0, 0, 0) } }); // min > max: no box
function envBox(s, u) {
  Object.assign(s.uniforms, u);
  s.vertexShader = 'varying vec3 vEW;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvEW = worldPosition.xyz;');
  s.fragmentShader = `varying vec3 vEW; uniform vec3 uEMin, uEMax, uEP;
    vec3 eBox(vec3 d) { if (uEMax.x < uEMin.x) return d; vec3 m = max((uEMax - vEW) / d, (uEMin - vEW) / d); float t = min(min(m.x, m.y), m.z);
      return t > 0. ? vEW + d * t - uEP : d; } // a point outside the box (a shop behind its glass): the plain lookup
  ` + s.fragmentShader.replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
    'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );', 'reflectVec = eBox( inverseTransformDirection( reflectVec, viewMatrix ) );'));
}
function envCompile(s) { envBox(s, this.userData.envU); } // a plain standard material (P): one shared function, so one program per kind as before
function libCompile(s) {
  Object.assign(s.uniforms, this.userData.libU); envBox(s, this.userData.envU);
  s.vertexShader = 'varying vec3 vLW, vLN; varying vec2 vLUv;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    { vec4 lw = vec4(transformed, 1.); vec3 ln = objectNormal;
    #ifdef USE_INSTANCING
      lw = instanceMatrix * lw; ln = mat3(instanceMatrix) * ln;
    #endif
    vLW = (modelMatrix * lw).xyz; vLN = normalize(mat3(modelMatrix) * ln); vLUv = uv; }`);
  s.fragmentShader = libPars + s.fragmentShader
    .replace('#include <map_fragment>', libMain)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= lR;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= lMet;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (uL0.y < .5) { vec2 xy = (lb.xy * 2. - 1.) * uL2.x + (lD.xy * 2. - 1.) * uL0.w * (1. + lDk); xy *= min(1., .98 / max(length(xy), 1e-4));
        normal = normalize(lFrame(normal, -vViewPosition, lT) * lNz(xy));
      } else normal = normalize((viewMatrix * vec4(lNW, 0.)).xyz);`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (uL3.x > .5) totalEmissiveRadiance *= la.a;')
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float lAO = 1. - lGr; reflectedLight.indirectDiffuse *= lAO; reflectedLight.indirectSpecular *= mix(1., lAO, .6); } // grime holds back the room's ambient light
      if (uL1.w > 0.) { // pile seen end-on is darker, seen along its length (the rim) lighter: a lobe as bright for a dark yarn as for a
        // light one (scaled by 1 / sqrt(albedo), the same as before at albedo .3), so a black velvet still glows at its rim
        vec3 sh = uL1.w * (.88 * pow(1. - saturate(dot(normal, geometryViewDir)), 2.5) * inversesqrt(max(diffuseColor.rgb, vec3(.012))) - .3);
        reflectedLight.directDiffuse *= 1. + sh; reflectedLight.indirectDiffuse *= 1. + sh; }`);
}
const col3 = c => new THREE.Vector3(...c);
// A library material, not registered with any zone (M does that). o: the LIB entry's options overridden by the caller's.
// Own options: tri (triplanar), uv: [u, v] metres per UV unit of the geometry's own UVs (1, 1 for build.js's box projection), swap,
// floor (the height its dirt gathers at, 0 if not given), and roughness: the mean roughness wanted (the set's own if not given).
function libMat(name, o = {}) {
  const [setName, def] = LIB[name] || [name, {}], s = sets[setName], t = libTex(setName);
  o = { detail: 0, dm: .1, macro: 0, grime: .18, fine: 0, dirt: 0, wear: 0, dirtCol: [.6, .58, .54], edgeCol: [.8, .8, .8], vary: 0, sheen: 0, back: 1, uv: [1, 1], floor: 0, ...def, ...o };
  const props = {};
  for (const k in o) {
    if (libKeys.includes(k)) continue;
    // a library material's maps are its own: another map would take one of the 6 texture units left and be ignored or overwritten
    if (/map$/i.test(k)) throw new Error(`library material ${name}: no ${k} (the library packs its own maps)`);
    props[k] = o[k];
  }
  const m = S({ roughness: o.roughness == null ? 1 : o.roughness / s.r0, metalness: 1, ...props });
  if (o.emit) { m.emissive.set(o.emit[0]); m.emissiveIntensity = o.emit[1]; noCast.add(m); }
  m.userData.libU = { tLA: { value: t.A.texture }, tLB: { value: t.B.texture }, tLD: { value: detailTex },
    uL0: { value: new THREE.Vector4(1 / s.m, o.tri ? 1 : 0, 1 / o.dm, o.detail) }, uL1: { value: new THREE.Vector4(o.wear, o.dirt, o.vary, o.sheen) },
    uL2: { value: new THREE.Vector4(1, o.floor, o.uv[0], o.uv[1]) }, uL3: { value: new THREE.Vector4(o.emit ? 1 : 0, o.back, o.macro, o.swap ? 1 : 0) },
    uL4: { value: new THREE.Vector4(o.grime, o.fine, 0, 0) }, uLDirt: { value: col3(o.dirtCol) }, uLEdge: { value: col3(o.edgeCol) } };
  m.onBeforeCompile = libCompile; m.userData.lib = name; m.userData.envU = envBoxU();
  return m;
}
const libCache = new Map();
// M(zone, name, options): the library material `name` (see LIB) for that zone, which then takes the zone's baked light and
// reflections. The same call returns the same material. zone null: a material no zone lights (emitters).
function M(z, name, o = {}) {
  const key = (z ? z.id : '') + '|' + name + '|' + JSON.stringify(o);
  let m = libCache.get(key);
  if (!m) { m = libMat(name, o); libCache.set(key, m); if (z) z.mats.push(m); }
  return m;
}
const causticsGLSL = `
  vec2 h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  float cell(vec2 p, float t) { vec2 i = floor(p), f = fract(p); float a = 8., b = 8.;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y); float d = length(g + .5 + .42 * sin(t + 6.2831 * h2(i + g)) - f); if (d < a) { b = a; a = d; } else b = min(b, d); }
    return b - a; }
  float caus(vec3 w) { vec2 p = w.xz * 1.5 + w.y * .9; p += .3 * sin(p.yx * 1.3 + uTime * .6) + .14 * sin(p.yx * 3.3 - uTime * .9); // warped so the cells don't read as straight-edged polygons
    return pow(1. - smoothstep(0., .5, min(cell(p, uTime * .8), cell(p * 1.63 + 7.3, uTime * 1.1))), 3.); } // thin bright lines; averages about .22
`; // the moving light pattern under water. Used by the tiles themselves and by the water, for floor it draws from the still plan
const glow = S({ color: 0, emissive: 0xffedc0, emissiveIntensity: 14 }); // frosted windows and light wells
const seaMat = S({ color: 0x0f4652, roughness: .05, normalMap: wn0, normalScale: new THREE.Vector2(.5, .5) });
seaMat.onBeforeCompile = envCompile; seaMat.userData.envU = envBoxU(); // no box (the open sea): the plain lookup, but the same program as P()'s water
const noCast = new Set([glow, seaMat]); // materials whose meshes cast no shadow (library emitters add themselves)
const lampOn = M(null, 'troffer'), lampOff = libMat('trofferOff', { roughness: .35 }); // the ceiling panel lit, and dead (bA bakes its light)

// Tile shader extras: caustics under water, rippling reflected light on walls above it, a coloured tile band below a
// given height (box-projected reflections come with the library shader underneath).
function tileFX(m, z) {
  const u = z.tileU = { uTime, uBand: { value: z.band }, uBandCol: { value: new THREE.Color(...z.bandCol) }, uShimmer: { value: z.shimmer },
              uSim: { value: null }, uPond: { value: new THREE.Vector4(0, 0, 1, 1) }, uPx: { value: new THREE.Vector2() }, // this zone's pool, filled in when the pool is made
              uLamp: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, uLampCol: { value: new THREE.Color(0xffedc0) }, uCaus: { value: z.caus || .45 } }; // caustic strength: full only where the sun reaches // this zone's own fixtures (see fixture())
  z.nl = 0;
  const lib = m.onBeforeCompile; // a library material underneath: its shader first
  m.onBeforeCompile = function (s, r) {
    lib.call(this, s, r);
    Object.assign(s.uniforms, u);
    s.vertexShader = 'varying vec3 vW;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;');
    s.fragmentShader = `varying vec3 vW; uniform float uTime, uBand, uShimmer, uCaus; uniform vec3 uBandCol; uniform sampler2D uSim; uniform vec4 uPond; uniform vec2 uPx;
      #ifdef NL
        uniform vec4 uLamp[NL]; uniform vec3 uLampCol;
      #endif
      ${causticsGLSL}
    ` + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vW.y < uBand) diffuseColor.rgb *= uBandCol;
        float wet = 1. - smoothstep(0., .06, abs(vW.y + ${-WY})); diffuseColor.rgb *= 1. - .3 * wet; // the waterline leaves a wet band`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= 1. - .6 * wet;')
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        #ifdef NL
          for (int i = 0; i < NL; i++) { // the room's own fixtures: unshadowed, seen only by this zone's tiles, so a room can have dozens of them
            vec3 lv = (viewMatrix * vec4(uLamp[i].xyz, 1.)).xyz - geometryPosition; float d2 = dot(lv, lv);
            IncidentLight fx; fx.direction = lv * inversesqrt(d2); fx.color = uLampCol * uLamp[i].w / (d2 + .2); fx.visible = true;
            RE_Direct(fx, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
          }
        #endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        if (vW.y < ${WY}) { // light focused by the surface: a drifting base pattern plus the real ripples (crests focus, troughs spread)
          vec2 s = (vW.xz - uPond.xy) / (uPond.zw - uPond.xy), o = uPx * 2.;
          float lap = texture2D(uSim, s - vec2(o.x, 0.)).r + texture2D(uSim, s + vec2(o.x, 0.)).r + texture2D(uSim, s - vec2(0., o.y)).r + texture2D(uSim, s + vec2(0., o.y)).r - 4. * texture2D(uSim, s).r;
          float c = (max(caus(vW) + clamp(-lap * 30., -.6, 2.5), 0.) - .22) * smoothstep(${WY}, ${WY} - .3, vW.y); // minus its average: caustics move light around, they don't add any
          reflectedLight.directDiffuse *= max(.2, 1. + 2.2 * uCaus * c); reflectedLight.indirectDiffuse *= max(.4, 1. + .9 * uCaus * c); }
        else if (uShimmer > 0.) reflectedLight.indirectDiffuse *= 1. + uShimmer * (caus(vW * .6) - .22) * smoothstep(.2, 1.2, vW.y - ${WY}) * exp((${WY} - vW.y) * .3);`);
  };
  return m;
}
const poolMats = z => { z.tile = tileFX(libMat('poolTile'), z); z.mats.push(z.tile); z.metal = M(z, 'chrome'); }; // a pool room's tiles and metal fittings: each pool place calls this
const P = (z, o) => { // a material that takes the zone's ambient light. Given one of tex.js's old shared texture handles, the library material that replaced it
  const lib = o.lib || o.map?.lib;
  if (lib) { const { lib: _, map, normalMap, roughnessMap, aoMap, aoMapIntensity, ...rest } = o; return M(z, lib, rest); }
  const m = S(o); m.onBeforeCompile = envCompile; m.userData.envU = envBoxU(); z.mats.push(m); return m; };
const neon = (c, k = 6) => { const m = S({ color: 0, emissive: c, emissiveIntensity: k }); noCast.add(m); return m; };
const voidMat = S({ color: 0x040404, roughness: 1 }), aisle = neon(0xffa646, 12);
const label = (text, w, h, color = '#fff', bg = '#000', k = 3) => { // glowing lettering on a plate
  const c = document.createElement('canvas'), g = c.getContext('2d'); c.width = Math.round(256 * w / h); c.height = 256;
  g.fillStyle = bg; g.fillRect(0, 0, c.width, 256); g.fillStyle = color; g.font = '600 150px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, 136, c.width * .86);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxA;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(k, k, k) }));
};
const sign = (text, x, y, z, ry, w, h, ...style) => { const m = label(text, w, h, ...style); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };
// A ball painted by direction: paint(x, y, z) of a unit vector -> colour, one colour per face so the edges between colours are crisp.
// Its own mesh, casting and taking shadows, in a material that takes the zone's ambient light.
function paintedBall(z, r, paint, o) {
  const g = new THREE.SphereGeometry(r, 48, 32).toNonIndexed(), p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) { c.set(paint(...[0, 1, 2].map(k => (p.getComponent(i, k) + p.getComponent(i + 1, k) + p.getComponent(i + 2, k)) / (3 * r)))); for (let j = 0; j < 3; j++) c.toArray(col, (i + j) * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, P(z, { vertexColors: true, ...o })); m.castShadow = m.receiveShadow = true; scene.add(m); return m;
}
const beachBall = z => paintedBall(z, .25, (x, y, zc) => Math.abs(y) > .93 ? 0xf4f0e6 : [0xe8402e, 0xf4f0e6, 0xf6c22b, 0xf4f0e6, 0x2f7fd8, 0xf4f0e6][Math.floor((Math.atan2(zc, x) / Math.PI + 1) * 3) % 6], { roughness: .28 }); // six vinyl gores, white caps
const wallMat = (z, color, o) => M(z, 'plaster', { color, ...o }); // painted plaster in any colour

export { S, M, libMat, LIB, dirt, causticsGLSL, lampOn, lampOff, glow, seaMat, noCast, tileFX, poolMats, P, neon, voidMat, aisle, label, sign, wallMat, paintedBall, beachBall };
