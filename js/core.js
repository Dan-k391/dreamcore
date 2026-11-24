// Renderer, scene, camera, the constants and small helpers everything shares, and the zone registry every place registers into.
import * as THREE from 'three';

// Anything outside a light's shadow frustum counts as shadowed instead of lit. The sun's shadow map then only has to
// cover the one hall it shines into; every enclosed zone is dark to it for free.
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace('float shadow = 1.0;', 'float shadow = 0.0;')
  .replace('unpackRGBAToDepth( texture2D( depths, uv ) )', 'unpackRGBAToDepth( textureLod( depths, uv, 0.0 ) )'); // no mips: the same texel, and no gradient, so the lookup can sit in a real branch
// The soft lookup's 16 taps weighted by a cubic B-spline instead of three's 3-texel box: the box's piecewise-linear ramp drew the texel grid as stair steps
// and spread an edge over 3 texels (where the low sun grazes the pool floor, a texel is 2.4 times longer, so a ring's shadow was a blurred staircase); the spline is smooth and about 1.4 times narrower, at the same 16 taps
{ const a = THREE.ShaderChunk.shadowmap_pars_fragment, i = a.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )'), j = a.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )');
  if (i < 0 || j < i) throw new Error("three's shadowmap_pars_fragment changed");
  THREE.ShaderChunk.shadowmap_pars_fragment = a.slice(0, i) + `#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
      vec2 texelSize = vec2( 1.0 ) / shadowMapSize, f = fract( shadowCoord.xy * shadowMapSize + 0.5 ), uv = shadowCoord.xy - f * texelSize, g = 1.0 - f;
      vec4 wx = vec4( g.x * g.x * g.x, 4.0 + f.x * f.x * ( 3.0 * f.x - 6.0 ), 1.0 + 3.0 * f.x * ( 1.0 + f.x * g.x ), f.x * f.x * f.x ) / 6.0;
      vec4 wy = vec4( g.y * g.y * g.y, 4.0 + f.y * f.y * ( 3.0 * f.y - 6.0 ), 1.0 + 3.0 * f.y * ( 1.0 + f.y * g.y ), f.y * f.y * f.y ) / 6.0;
      shadow = 0.0;
      for ( int y = 0; y < 4; y ++ ) { vec4 r = vec4( 0.0 ); for ( int x = 0; x < 4; x ++ ) r[ x ] = texture2DCompare( shadowMap, uv + vec2( float( x ) - 1.0, float( y ) - 1.0 ) * texelSize, shadowCoord.z ); shadow += wy[ y ] * dot( wx, r ); }
    ` + a.slice(j); }
// A lamp's or the sun's 16-tap shadow lookup only where that light adds anything: inside its cone and reach (three's ternary was
// flattened by the compiler, so every pixel paid all ten) and on the side the surface faces (RE_Direct adds nothing there). The same picture.
for (const [map, sh, coord] of [['spotShadowMap', 'spotLightShadow', 'vSpotLightCoord'], ['directionalShadowMap', 'directionalLightShadow', 'vDirectionalShadowCoord']]) {
  const from = `directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( ${map}[ i ], ${sh}.shadowMapSize, ${sh}.shadowIntensity, ${sh}.shadowBias, ${sh}.shadowRadius, ${coord}[ i ] ) : 1.0;`;
  if (!THREE.ShaderChunk.lights_fragment_begin.includes(from)) throw new Error("three's lights_fragment_begin changed");
  THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(from, `
    if ( directLight.visible && receiveShadow && ( dot( geometryNormal, directLight.direction ) > 0.0 || dot( geometryClearcoatNormal, directLight.direction ) > 0.0 ) ) directLight.color *= getShadow( ${map}[ i ], ${sh}.shadowMapSize, ${sh}.shadowIntensity, ${sh}.shadowBias, ${sh}.shadowRadius, ${coord}[ i ] );`);
}

const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // static level: a shadow map is re-rendered only when its light moves
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, .08, 5000);
const spawn = location.hash.slice(1).split(',').map(Number), spawned = spawn.length > 1 && spawn.every(isFinite); // optional #x,z,yaw,pitch: start anywhere (used for stage photos)
camera.position.set(spawned ? spawn[0] : 1.9, 1.62, spawned ? spawn[1] : 20);
if (spawned) camera.rotation.set(spawn[3] || 0, spawn[2] || 0, 0, 'YXZ');
const uTime = { value: 0 }, V = (x, y, z) => new THREE.Vector3(x, y, z), sunDir = V(0, 1, 0);
const quadVS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
// The one clipping plane every program is built with: js/portals.js moves it onto a portal's far plane while drawing what is seen through
// it, and everywhere else it clips nothing. Set, and one render made, before anything compiles (compile() takes the clipping state of the
// last render), so no program is ever built twice for it. Clipped in hardware (gl_ClipDistance) where the GPU can: three's own clipping
// discards in the fragment shader, and a shader that may discard loses the early depth test, which tripled the scene pass everywhere.
// So every material takes the clip-distance extension (a getter on the prototype: ShaderMaterials set their own, the setter keeps it on)
// and the fragment test is gone; without the extension three's discard stays (correct, slower).
const clipHW = renderer.extensions.get('WEBGL_clip_cull_distance');
if (clipHW) {
  renderer.getContext().enable(clipHW.CLIP_DISTANCE0_WEBGL); // three writes gl_ClipDistance but never switches it on
  Object.defineProperty(THREE.Material.prototype, 'extensions', { configurable: true,
    get() { return this._ext ||= { clipCullDistance: true, multiDraw: false }; }, set(v) { this._ext = Object.assign(v, { clipCullDistance: true }); } });
  const C = THREE.ShaderChunk;
  C.clipping_planes_pars_vertex += `
#if NUM_CLIPPING_PLANES > 0 && defined( USE_CLIP_DISTANCE )
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`;
  C.clipping_planes_vertex += `
#if NUM_CLIPPING_PLANES > 0 && defined( USE_CLIP_DISTANCE )
	gl_ClipDistance[ 0 ] = clippingPlanes[ 0 ].w - dot( - mvPosition.xyz, clippingPlanes[ 0 ].xyz );
#endif`;
  C.clipping_planes_fragment = '';
}
const clip = new THREE.Plane(V(0, 1, 0), 1e6); renderer.clippingPlanes = [clip]; renderer.render(new THREE.Scene(), camera);
const H = 2.7, PH = 5, WY = -0.12; // backrooms ceiling, pool hall ceiling, water level (shared by every pool)

// ---------- zones: each has its own materials, ambient probe, exposure, fog, grade and room tone ----------
const warm = { grp: 'b', k: 1.2, exp: .36, fog: [.55, .45, .2, .002], tint: [1.02, 1, .96], sat: 1, bloom: .3, shaft: 0, hum: 1, water: 0, wet: .15 };
const dark = { step: 'tile', grp: 'd', k: .6, fog: [.006, .02, .018, .004], tint: [1, 1, .98], sat: 1, shaft: 0, hum: 0, water: 1, band: 1.15, bandCol: [.05, .3, .28] };
const dry = { step: 'tile', hum: 0, water: 0, shaft: 0, sat: 1, tint: [1, 1, 1] };
// beyond the backrooms and pools. step: footstep sound; sky: which sky and sun it lives under (see skies); wade: a floor below 0 slows you, as water does
const zones = {}; // id -> zone, in the order the places register them (see level.js)
const defZone = (id, z) => zones[id] = Object.assign(z, { id, mats: [], fog: new THREE.Vector4(...z.fog), tint: V(...z.tint), probe: V(...(z.probe || [(z.box[0] + z.box[2]) / 2, 1.4, (z.box[1] + z.box[3]) / 2])) });
const inR = (x, z, x1, z1, x2, z2) => x > x1 && x < x2 && z > z1 && z < z2;

export { clip, renderer, scene, camera, uTime, V, sunDir, quadVS, H, PH, WY, warm, dark, dry, zones, defZone, inR };
