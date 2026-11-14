// Materials more than one place uses, and the helpers places make their own with.
import * as THREE from 'three';
import { scene, uTime, V, WY } from './core.js';
import { maxA, tileTex, lampTex, grime, wn0, plaster } from './tex.js';

// ---------- materials ----------
// Budget: 16 texture units. 9 lamp shadows + 1 sun shadow leave 6: tiles use 5 (3 maps, env, ripple sim), nothing else may use more.
const S = o => new THREE.MeshStandardMaterial(o);
const dirt = { aoMap: grime, aoMapIntensity: .7 };
const causticsGLSL = `
  vec2 h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  float cell(vec2 p, float t) { vec2 i = floor(p), f = fract(p); float a = 8., b = 8.;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y); float d = length(g + .5 + .42 * sin(t + 6.2831 * h2(i + g)) - f); if (d < a) { b = a; a = d; } else b = min(b, d); }
    return b - a; }
  float caus(vec3 w) { vec2 p = w.xz * 1.5 + w.y * .9; p += .3 * sin(p.yx * 1.3 + uTime * .6) + .14 * sin(p.yx * 3.3 - uTime * .9); // warped so the cells don't read as straight-edged polygons
    return pow(1. - smoothstep(0., .5, min(cell(p, uTime * .8), cell(p * 1.63 + 7.3, uTime * 1.1))), 3.); } // thin bright lines; averages about .22
`; // the moving light pattern under water. Used by the tiles themselves and by the water, for floor it draws from the still plan
const lampOn = S({ color: 0x111111, emissive: 0xfff0cf, emissiveMap: lampTex.map, emissiveIntensity: 9 });
const lampOff = S({ map: lampTex.map, color: 0x9a9a90, roughness: .35 });
const glow = S({ color: 0, emissive: 0xffedc0, emissiveIntensity: 14 }); // frosted windows and light wells
const seaMat = S({ color: 0x0f4652, roughness: .05, normalMap: wn0, normalScale: new THREE.Vector2(.5, .5) });
const noCast = new Set([lampOn, glow, seaMat]); // materials whose meshes cast no shadow

// Tile shader extras: caustics under water, rippling reflected light on walls above it, a coloured tile band below a
// given height, and box-projected reflections so glossy tiles mirror the room's windows in the right place.
function tileFX(m, z) {
  const u = z.tileU = { uTime, uBand: { value: z.band }, uBandCol: { value: new THREE.Color(...z.bandCol) }, uShimmer: { value: z.shimmer },
              uBoxMin: { value: V(...z.env[0]) }, uBoxMax: { value: V(...z.env[1]) }, uProbe: { value: z.probe },
              uSim: { value: null }, uPond: { value: new THREE.Vector4(0, 0, 1, 1) }, uPx: { value: new THREE.Vector2() }, // this zone's pool, filled in when the pool is made
              uLamp: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, uLampCol: { value: new THREE.Color(0xffedc0) }, uCaus: { value: z.caus || .45 } }; // caustic strength: full only where the sun reaches // this zone's own fixtures (see fixture())
  z.nl = 0;
  m.onBeforeCompile = s => {
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
const poolMats = z => { z.tile = tileFX(S({ ...tileTex }), z); z.metal = S({ metalness: 1, roughness: .12 }); z.mats = [z.tile, z.metal]; }; // a pool room's tiles and metal fittings: each pool place calls this
const P = (z, o) => { const m = S(o); z.mats.push(m); return m; }; // a material that takes the zone's ambient light
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
const wallMat = (z, color, o) => P(z, { map: plaster.map, normalMap: plaster.normalMap, color, roughness: .9, ...dirt, ...o });

export { S, dirt, causticsGLSL, lampOn, lampOff, glow, seaMat, noCast, tileFX, poolMats, P, neon, voidMat, aisle, label, sign, wallMat, paintedBall, beachBall };
