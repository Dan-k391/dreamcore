// Optional sunlit pool study. Load with ?scene=prism#2395.6335,2405.9226,-0.70081,-0.04917.
// All finishes, water, sunlight, collisions and ladder use the native engine systems.
import * as THREE from 'three';
import { defZone, zones, scene } from '../core.js';
import { M, tileFX, noCast } from '../mat.js';
import { box, add, pools, flats, skyOnly } from '../build.js';
import { poolLadder } from '../props/metalwork.js';

const X = 2400, Z = 2400, H = 4.5984, BED = -1.2, EDGE = 2.8;
const LEFT = -.5575, RIGHT = 2.2234, HEAD = 2.7901;
defZone('prism', { music: null, sky: 'prism', amb: { water: .25, drips: .12, verb: [0, .5, .5] }, step: 'tile', grp: 'prism',
  k: 4.3, exp: .4, fog: [.15, .18, .16, .0008], tint: [1, 1, .98], sat: 1.02, bloom: .16,
  shaft: .22, hum: 0, water: .5, wet: .5, band: -99, bandCol: [1, 1, 1], shimmer: .22, caus: 1,
  box: [X - 5.4, Z - .9, X + 5.4, Z + 11.4], probe: [X + 1, 1.8, Z + 4],
  env: [[X - 5, BED, Z - .55], [X + 5, H, Z + 11]] });
const z = zones.prism;
// The 100 mm ceramic is scaled to 280 mm here. Its baked face mask separates
// the darker cement joints from the glaze, which stays glossy at the waterline.
const T = z.tile = tileFX(M(z, 'poolTile', { color: 0xc4c7bd, uv: [1 / 2.8, 1 / 2.8] }), z, {
  dryRoughnessFloor: .30, groutAlbedo: .42
});
const B = (m, x1, y1, z1, x2, y2, z2) => box(m, X + x1, y1, Z + z1, X + x2, y2, Z + z2);
flats.push([X - 5, Z, X + 5, Z + EDGE, () => BED], [X + LEFT, Z - .55, X + RIGHT, Z, () => BED],
  [X - 5, Z + EDGE, X - 4.1, Z + 4.8, () => BED]);
pools.push([X - 5, Z - .55, X + 5, Z + 4.8, BED, 'prism', ['prism'], [.055, .12, .105]]);
B(T, -5.35, BED - .3, -1, 5.35, BED, 11.35);
B(T, -4.1, BED, EDGE, 5, 0, 11);
B(T, -5, BED, 4.8, -4.1, 0, 11);
B(T, -5.35, BED, -.35, LEFT, H, 0);
B(T, RIGHT, BED, -.35, 5.35, H, 0);
B(T, LEFT, HEAD, -.35, RIGHT, H, 0);
B(T, -5.35, BED, 0, -5, H, 11.35);
B(T, 5, BED, 0, 5.35, H, 11.35);
B(T, -5, BED, 11, 5, H, 11.35);
B(T, -5.35, H, -.9, 5.35, H + .3, 11.35);
// Deep tiled reveal, closed by a real solid glazed pane. The pane transmits the
// directional sun, as in the glasshouse; its surrounding masonry casts the patch.
B(T, LEFT - .35, BED, -.9, LEFT, HEAD, -.35);
B(T, RIGHT, BED, -.9, RIGHT + .35, HEAD, -.35);
B(T, LEFT, HEAD, -.9, RIGHT, HEAD + .3, -.35);
B(T, LEFT, BED, -.9, RIGHT, -.12, -.55);
const glass = M(z, 'glass', { color: 0x80978d, opacity: .065 });
noCast.add(glass);
B(glass, LEFT, -.12, -.58, RIGHT, HEAD, -.55);
// Library mosaic at 10 cm: hand-set colour groups use material tints, no added
// shader or texture. UVs remain continuous through the cell-aligned little boxes.
const mosaic = [0x446962, 0x63877d, 0x72968a, 0x8aa99a, 0xa1b5a3].map(color =>
  M(z, 'poolMosaic', { color, uv: [.25, .25] }));
for (let j = 0; j < 19; j++) for (let i = 0; i < 110; i++) {
  const n = ((i * 73856093) ^ (j * 19349663)) >>> 0;
  add(mosaic[n % mosaic.length], new THREE.PlaneGeometry(.1, .1).rotateY(-Math.PI / 2).translate(X + 4.992, BED + (j + .5) * .1, Z + (i + .5) * .1));
}
// A short west-side return keeps the ladder outside the matched frame. Deck is toward +z. The existing kit supplies climb behavior and detailed rails.
poolLadder(z, X - 4.65, 0, Z + 4.8, Math.PI, { depth: 1.15 });

// Distant cloud scenery outside the glazing, 180 m from the room. This is a sky
// backdrop in world space, seen by native probes and water captures, not an emitter
// at the opening. The actual lighting comes only from sky.js's directional sun.
const clouds = new THREE.Mesh(new THREE.PlaneGeometry(450, 250), new THREE.ShaderMaterial({
  depthWrite: true, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 uvCloud; void main(){ uvCloud=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec2 uvCloud;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
    float f(vec2 p){return .5*n(p)+.25*n(p*2.03)+.125*n(p*4.07)+.0625*n(p*8.13)+.03125*n(p*16.3);}
    void main(){vec2 p=uvCloud*vec2(28.,18.);p.x+=.6*n(p*.7);
      float d=f(p), c=smoothstep(.42,.62,d), edge=smoothstep(.41,.47,d)*(1.-smoothstep(.47,.55,d));
      vec3 sky=mix(vec3(3.5,3.4,2.9),vec3(1.35,2.,2.4),smoothstep(.28,.7,uvCloud.y));
      vec3 cloud=mix(vec3(1.1,1.3,1.3),vec3(7.,6.8,5.9),smoothstep(.48,.7,f(p+vec2(-.16,.25))))+edge*vec3(2.,1.9,1.6);
      gl_FragColor=vec4(mix(sky,cloud,c*smoothstep(.27,.37,uvCloud.y))*.45,1.);
    }`
}));
clouds.position.set(X, 40, Z - 180); clouds.name = 'prism-distant-clouds'; clouds.renderOrder = -.5;
scene.add(clouds); skyOnly.prism = [clouds];
