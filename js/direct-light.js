// Skip punctual shadow/BRDF work only for exactly zero physical direct irradiance.
// Install before any material compiles; leave nonphysical modes and cookie derivatives alone.
import { ShaderChunk } from 'three';
const original = ShaderChunk.lights_fragment_begin;
const direct = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
if (original.split(direct).length !== 4) throw Error('Unexpected direct loops');
const guard = `
#if defined( STANDARD )
  if (directLight.visible && directLight.color != vec3(0.) && (dot(geometryNormal, directLight.direction) > 0.
  #ifdef USE_CLEARCOAT
    || dot(geometryClearcoatNormal, directLight.direction) > 0.
  #endif
  )) {
#endif
`;
let candidate = original;
for (const anchor of [
 'getPointLightInfo( pointLight, geometryPosition, directLight );',
 '#undef SPOT_LIGHT_MAP_INDEX',
 'getDirectionalLightInfo( directionalLight, directLight );'
]) {
 if (candidate.split(anchor).length !== 2) throw Error('Unexpected light anchor');
 candidate = candidate.replace(anchor, anchor + guard);
}
candidate = candidate.replaceAll(direct, '\n#if defined( STANDARD )\nif (directLight.color != vec3(0.))\n#endif\n' + direct + '\n#if defined( STANDARD )\n}\n#endif');
ShaderChunk.lights_fragment_begin = candidate;
