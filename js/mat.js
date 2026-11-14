// Materials more than one place uses, and the helpers places make their own with.
import * as THREE from 'three';
import { scene, uTime, V, WY } from './core.js';
import { maxA, grime, wn0, sets, libTex, detailTex } from './tex.js';

// ---------- materials ----------
// Budget: 16 texture units. 9 lamp shadows + 1 sun shadow leave 6: a library material uses 4 (its two maps, the shared detail, env),
// pool tiles 5 (plus the ripple sim). Nothing may use more than 6.
const S = o => new THREE.MeshStandardMaterial(o);
const dirt = { aoMap: grime, aoMapIntensity: .7 };

// ---------- the material library ----------
// name: its texture set (tex.js) and how it is worn. detail: strength of the shared 10 cm micro normal; macro: large-scale
// variation; dirt: grime where walls meet the floor and dust on tops (dirtCol multiplies); wear: lightening toward edgeCol on
// rounded convex edges; vary: break up the repeat (isotropic sets only); sheen: velvet-like grazing light; back: back-face
// albedo factor; emit: emissive colour and level (the set's pattern modulates it); everything else is a material property.
const LIB = {
  poolTile: ['poolTile', { detail: .12, macro: .04, dirt: .5, dirtCol: [.72, .68, .6] }],
  poolMosaic: ['poolMosaic', { detail: .12, macro: .05, dirt: .4, dirtCol: [.72, .68, .6] }],
  marble: ['marble', { detail: .08, macro: .06, dirt: .3, wear: .2, edgeCol: [.8, .78, .74] }],
  terrazzo: ['terrazzo', { detail: .12, macro: .08, dirt: .4 }],
  limestone: ['limestone', { detail: .4, macro: .2, dirt: .6, dirtCol: [.62, .6, .52], wear: .5, edgeCol: [.88, .84, .76] }],
  travertine: ['limestone', { color: 0xf3dfc4, detail: .4, macro: .2, dirt: .6, dirtCol: [.62, .6, .52], wear: .5, edgeCol: [.9, .84, .74] }],
  stoneWall: ['stoneWall', { detail: .4, macro: .2, dirt: .6, dirtCol: [.62, .6, .52] }],
  plaster: ['plaster', { detail: .5, macro: .1, dirt: .5, dirtCol: [.64, .6, .54], wear: .4, edgeCol: [.95, .94, .9] }],
  stucco: ['stucco', { detail: .6, macro: .12, dirt: .6, dirtCol: [.6, .57, .5], vary: 1 }],
  concreteWall: ['concreteWall', { detail: .5, macro: .15, dirt: .6, dirtCol: [.6, .58, .54], wear: .4, edgeCol: [.7, .69, .66] }],
  concreteFloor: ['concreteFloor', { detail: .35, macro: .18, dirt: .3, dirtCol: [.6, .58, .54] }],
  asphalt: ['asphalt', { detail: .3, macro: .15, vary: 1 }],
  roadPaint: ['roadPaint', { detail: .2, macro: .1 }],
  sand: ['sand', { detail: .2, macro: .2, vary: 1 }],
  mulch: ['mulch', { detail: .2, macro: .2, vary: 1 }],
  rubberCrumb: ['rubberCrumb', { color: 0xb04a3a, detail: .2, macro: .1, vary: 1 }],
  grassGround: ['grassGround', { detail: .2, macro: .3, vary: 1 }],
  wallpaper: ['wallpaper', { detail: .25, macro: .08, dirt: .7, dirtCol: [.62, .52, .36] }],
  loopCarpet: ['loopCarpet', { color: 0xc8b48a, macro: .25 }],
  ceilingTile: ['ceilingTile', { detail: .25, macro: .06 }],
  hotelCarpet: ['hotelCarpet', { macro: .15 }],
  hardwood: ['hardwood', { detail: .08, macro: .05, dirt: .3, wear: .3, edgeCol: [.62, .45, .3] }],
  damask: ['damask', { detail: .1, macro: .06, dirt: .5, dirtCol: [.66, .6, .5] }],
  velvet: ['velvet', { color: 0x8a1a26, macro: .1, sheen: 1 }],
  blackoutCarpet: ['loopCarpet', { color: 0x2a2a2e, macro: .2 }],
  vinylFoam: ['vinylFoam', { color: 0x3f8fe0, detail: .12, macro: .05, dirt: .4, wear: .3, edgeCol: [.85, .85, .85] }],
  chrome: ['smudge', { dirt: .2, dirtCol: [.7, .68, .64] }],
  brushedSteel: ['brushed', { dirt: .2 }],
  galvanised: ['galvanised', { detail: .1, dirt: .5, dirtCol: [.72, .7, .64] }],
  anodised: ['anodised', { color: 0x9aa4b0, dirt: .2 }],
  brass: ['smudge', { color: 0xf0d48c, macro: .3, dirt: .6, dirtCol: [.5, .42, .3] }],
  castIron: ['castIron', { detail: .2, macro: .1, dirt: .5, dirtCol: [.9, .55, .35], wear: .4, edgeCol: [.22, .22, .23] }],
  paintedSteel: ['paintedSteel', { color: 0x2b5d8a, detail: .1, macro: .05, dirt: .6, dirtCol: [.62, .4, .26], wear: .6, edgeCol: [.5, .5, .52] }],
  gelcoat: ['gelcoat', { color: 0x3aa6c8, detail: .04 }],
  hardPlastic: ['hardPlastic', { color: 0xe8b820, detail: .12, wear: .3, edgeCol: [.85, .85, .82] }],
  pvc: ['pvc', { color: 0xff8fb0, detail: .04 }],
  rubber: ['rubber', { detail: .2, dirt: .3 }],
  glass: ['glass', { color: 0xdcefe6, transparent: true, opacity: .22, depthWrite: false }],
  frostedGlass: ['glass', { color: 0xf2f2ec, roughness: .55, transparent: true, opacity: .85 }],
  benchWood: ['benchWood', { detail: .08, dirt: .3, wear: .5, edgeCol: [.72, .56, .4] }],
  weatheredWood: ['weatheredWood', { detail: .2, macro: .1 }],
  palmTrunk: ['palmTrunk', { detail: .2, macro: .15 }],
  palmLeaf: ['palmLeaf', { detail: .04, back: 1.6, side: THREE.DoubleSide }],
  troffer: ['troffer', { color: 0x6a6a66, emit: [0xffe0b4, 3.2] }],
  trofferOff: ['troffer', { color: 0x9a9a90 }],
  opalPanel: ['opal', { color: 0x9a9a96, emit: [0xffe2b8, 2.2] }],
  ledTube: ['ledTube', { color: 0x9a9a96, emit: [0xffdcaa, 2.6] }],
  frostedGlobe: ['opal', { color: 0x9a9a96, emit: [0xffd49a, 2.2] }],
  backlitPanel: ['opal', { color: 0x9a9a96, emit: [0xffe6c4, 1.6] }],
};
const libKeys = ['detail', 'dm', 'macro', 'dirt', 'wear', 'dirtCol', 'edgeCol', 'vary', 'sheen', 'back', 'emit', 'tri', 'uv', 'swap', 'floor', 'roughness'];
// The shader every library material shares (one program, whatever the material): maps sampled by the geometry's UVs in metres
// (build.js box-projects them) or triplanar in world space, a micro detail, macro variation, dirt and edge wear from the geometry.
const libPars = `uniform sampler2D tLA, tLB, tLD; uniform vec4 uL0, uL1, uL2, uL3; uniform vec3 uLDirt, uLEdge; varying vec3 vLW, vLN; varying vec2 vLUv;
  // uL0: 1 / metres a set covers, triplanar?, 1 / detail metres, detail strength. uL1: wear, dirt, vary, sheen.
  // uL2: normal strength, floor height, metres per UV unit (u, v). uL3: emitter?, back-face albedo, macro amount, swap u and v?
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
`;
const libMain = `
  vec3 lN = normalize(vLN) * (gl_FrontFacing ? 1. : -1.); vec4 la, lb; vec2 lM, lT; vec3 lNW = lN;
  if (uL0.y < .5) { lM = vLUv * uL2.zw; if (uL3.w > .5) lM = lM.yx; lT = lM * uL0.x; lTap(lT, la, lb); }
  else { vec3 w = pow(abs(lN), vec3(4.)); w /= w.x + w.y + w.z; vec4 ax, bx, ay, by, az, bz;
    lTap(vLW.zy * uL0.x, ax, bx); lTap(vLW.xz * uL0.x, ay, by); lTap(vLW.xy * uL0.x, az, bz);
    la = ax * w.x + ay * w.y + az * w.z; lb = bx * w.x + by * w.y + bz * w.z;
    vec3 nx = lNz((bx.xy * 2. - 1.) * uL2.x), ny = lNz((by.xy * 2. - 1.) * uL2.x), nz = lNz((bz.xy * 2. - 1.) * uL2.x); // whiteout blend
    lNW = normalize(vec3(nx.xy + lN.zy, nx.z * lN.x).zyx * w.x + vec3(ny.xy + lN.xz, ny.z * lN.y).xzy * w.y + vec3(nz.xy + lN.xy, nz.z * lN.z) * w.z);
    lM = w.x > max(w.y, w.z) ? vLW.zy : w.y > w.z ? vLW.xz : vLW.xy; lT = lM * uL0.x; }
  vec4 lD; float lMac;
  if (uL0.y < .5) { lD = texture2D(tLD, lM * uL0.z); lMac = texture2D(tLD, lM * .143).a * .65 + texture2D(tLD, lM * .43 + .3).a * .35 - .5; }
  else { vec3 w = pow(abs(lN), vec3(4.)); w /= w.x + w.y + w.z; // blended over the three projections, so no seam where the dominant one changes
    lD = texture2D(tLD, vLW.zy * uL0.z) * w.x + texture2D(tLD, vLW.xz * uL0.z) * w.y + texture2D(tLD, vLW.xy * uL0.z) * w.z;
    lMac = (texture2D(tLD, vLW.zy * .143).a * w.x + texture2D(tLD, vLW.xz * .143).a * w.y + texture2D(tLD, vLW.xy * .143).a * w.z) - .5; }
  vec3 lC = la.rgb * mix(vec3(1.), diffuse, uL3.x > .5 ? 1. : la.a) * (1. + uL3.z * lMac);
  float lR = clamp(lb.b * (1. + uL3.z * lMac * .6) + (lD.b - .5) * uL0.w * .4, .02, 1.), lMet = lb.a;
  float lH = vLW.y - uL2.y, lG = clamp(.45 + 1.6 * lMac + .6 * (lD.a - .5), 0., 1.);
  float lDirt = uL1.y * (1. - smoothstep(0., .45, lH)) * step(-.03, lH) * (1. - abs(lN.y)) * lG; // grime where it meets the floor
  lC = mix(lC, lC * uLDirt, lDirt); lR = mix(lR, 1., .4 * lDirt); lMet *= 1. - lDirt;
  float lDust = uL1.y * .3 * smoothstep(.7, .95, lN.y) * step(.25, lH) * lG; lC = mix(lC, vec3(.4, .38, .35), lDust * .5); lR = mix(lR, .9, lDust); // dust settles on tops
  float lE = uL1.x * smoothstep(6., 30., length(fwidth(lN)) / max(length(fwidth(vLW)), 1e-4)) * smoothstep(.35, .65, lD.a + lMac); // rounded convex edges wear
  lC = mix(lC, uLEdge, lE * .45); lR = mix(lR, .7, lE * .3);
  diffuseColor.rgb = lC * (gl_FrontFacing ? 1. : uL3.y);
`;
function libCompile(s) {
  Object.assign(s.uniforms, this.userData.libU);
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
      if (uL0.y < .5) { vec2 xy = (lb.xy * 2. - 1.) * uL2.x + (lD.xy * 2. - 1.) * uL0.w; xy *= min(1., .98 / max(length(xy), 1e-4));
        normal = normalize(lFrame(normal, -vViewPosition, lT) * lNz(xy));
      } else normal = normalize((viewMatrix * vec4(lNW, 0.)).xyz);`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (uL3.x > .5) totalEmissiveRadiance *= la.a;')
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      if (uL1.w > 0.) { float sh = uL1.w * (1.6 * pow(1. - saturate(dot(normal, geometryViewDir)), 2.5) - .3); reflectedLight.directDiffuse *= 1. + sh; reflectedLight.indirectDiffuse *= 1. + sh; }`);
}
const col3 = c => new THREE.Vector3(...c);
// A library material, not registered with any zone (M does that). o: the LIB entry's options overridden by the caller's.
// Own options: tri (triplanar), uv: [u, v] metres per UV unit of the geometry's own UVs (1, 1 for build.js's box projection), swap,
// floor (the height its dirt gathers at, 0 if not given), and roughness: the mean roughness wanted (the set's own if not given).
function libMat(name, o = {}) {
  const [setName, def] = LIB[name] || [name, {}], s = sets[setName], t = libTex(setName);
  o = { detail: 0, dm: .1, macro: 0, dirt: 0, wear: 0, dirtCol: [.6, .58, .54], edgeCol: [.8, .8, .8], vary: 0, sheen: 0, back: 1, uv: [1, 1], floor: 0, ...def, ...o };
  const props = {}; for (const k in o) if (!libKeys.includes(k)) props[k] = o[k];
  const m = S({ roughness: o.roughness == null ? 1 : o.roughness / s.r0, metalness: 1, ...props });
  if (o.emit) { m.emissive.set(o.emit[0]); m.emissiveIntensity = o.emit[1]; noCast.add(m); }
  m.userData.libU = { tLA: { value: t.A.texture }, tLB: { value: t.B.texture }, tLD: { value: detailTex },
    uL0: { value: new THREE.Vector4(1 / s.m, o.tri ? 1 : 0, 1 / o.dm, o.detail) }, uL1: { value: new THREE.Vector4(o.wear, o.dirt, o.vary, o.sheen) },
    uL2: { value: new THREE.Vector4(1, o.floor, o.uv[0], o.uv[1]) }, uL3: { value: new THREE.Vector4(o.emit ? 1 : 0, o.back, o.macro, o.swap ? 1 : 0) },
    uLDirt: { value: col3(o.dirtCol) }, uLEdge: { value: col3(o.edgeCol) } };
  m.onBeforeCompile = libCompile; m.userData.lib = name;
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
const noCast = new Set([glow, seaMat]); // materials whose meshes cast no shadow (library emitters add themselves)
const lampOn = M(null, 'troffer'), lampOff = libMat('trofferOff', { roughness: .35 }); // the ceiling panel lit, and dead (bA bakes its light)

// Tile shader extras: caustics under water, rippling reflected light on walls above it, a coloured tile band below a
// given height, and box-projected reflections so glossy tiles mirror the room's windows in the right place.
function tileFX(m, z) {
  const u = z.tileU = { uTime, uBand: { value: z.band }, uBandCol: { value: new THREE.Color(...z.bandCol) }, uShimmer: { value: z.shimmer },
              uBoxMin: { value: V(...z.env[0]) }, uBoxMax: { value: V(...z.env[1]) }, uProbe: { value: z.probe },
              uSim: { value: null }, uPond: { value: new THREE.Vector4(0, 0, 1, 1) }, uPx: { value: new THREE.Vector2() }, // this zone's pool, filled in when the pool is made
              uLamp: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, uLampCol: { value: new THREE.Color(0xffedc0) }, uCaus: { value: z.caus || .45 } }; // caustic strength: full only where the sun reaches // this zone's own fixtures (see fixture())
  z.nl = 0;
  const lib = m.onBeforeCompile; // a library material underneath: its shader first
  m.onBeforeCompile = function (s, r) {
    lib.call(this, s, r);
    Object.assign(s.uniforms, u);
    s.vertexShader = 'varying vec3 vW;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;');
    s.fragmentShader = `varying vec3 vW; uniform float uTime, uBand, uShimmer, uCaus; uniform vec3 uBandCol, uBoxMin, uBoxMax, uProbe; uniform sampler2D uSim; uniform vec4 uPond; uniform vec2 uPx;
      #ifdef NL
        uniform vec4 uLamp[NL]; uniform vec3 uLampCol;
      #endif
      ${causticsGLSL}
      vec3 boxProj(vec3 d) { vec3 m = max((uBoxMax - vW) / d, (uBoxMin - vW) / d); return vW + d * min(min(m.x, m.y), m.z) - uProbe; }
    ` + s.fragmentShader
      .replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
        'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );', 'reflectVec = boxProj( inverseTransformDirection( reflectVec, viewMatrix ) );'))
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
  const m = S(o); z.mats.push(m); return m; };
const neon = (c, k = 6) => { const m = S({ color: 0, emissive: c, emissiveIntensity: k }); noCast.add(m); return m; };
const voidMat = S({ color: 0x040404, roughness: 1 }), aisle = neon(0xffd9a0, 12);
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
