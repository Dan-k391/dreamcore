// The terrace above the clouds.
import * as THREE from 'three';
import { scene, uTime, sunDir, dry, zones, defZone } from '../core.js';
import { P, M } from '../mat.js';
import { flats, seeThrough, skyOnly, block, box, solid, slab, portal, via } from '../build.js';
import { globeLamp } from '../props/lights.js';
import { door, doorway, railing } from '../props/metalwork.js';
import { column, pier, steps } from '../props/structure.js';
import { parkBench, palmPlanter } from '../props/garden.js';

defZone('sK', { music: 'terrace', ...dry, amb: { wind: 1.1, crickets: .6, sea: [664, 662, 684, 662, -25], seaLv: .6 }, sky: 'dusk', air: .7, grp: 's', k: 1, exp: .3, fog: [.95, .6, .55, .0012], sat: 1.12, bloom: .12, shaft: .1, wet: .35, box: [650.4, 600, 745, 700], probe: [672, 2, 649.4] });
{ // terrace above the clouds x[650,704] z[639,660], out of the vaulted hall's far door: white stone at sunset, a court of arches, a stair to a lookout
  const z = zones.sK, blue = P(z, { color: 0x86a8d8, roughness: .4 }), PI = Math.PI;
  const Su = M(z, 'stucco', { color: 0xffffff }), Ls = M(z, 'limestone', { color: 0xffffff, wear: 0, floor: 0 }); // rendered walls; ashlar paving and the passage wall, the court piers' own stone (one draw call)
  const edge = (x1, z1, x2, z2, y, side) => solid(side === 'e' ? x2 - .02 : x1, y, side === 's' ? z2 - .02 : z1, side === 'w' ? x1 + .02 : x2, y + 3, side === 'n' ? z1 + .02 : z2); // an unseen pane on a parapet's outer edge: stand on it, but not step off into the sky
  const rail = (x1, z1, x2, z2, y, side) => { // a stone parapet in 1.2-1.6 m units, each on its plinth under a moulded coping (the kit's arch pier, cut low)
    const alongX = x2 - x1 > z2 - z1, L = alongX ? x2 - x1 : z2 - z1, n = Math.ceil(L / 1.6), u = L / n, d = alongX ? z2 - z1 : x2 - x1;
    for (let i = 0; i < n; i++) if (alongX) pier(z, x1 + u * (i + .5), y, (z1 + z2) / 2, 0, { w: u, d, h: .6, color: 0xffffff }); else pier(z, (x1 + x2) / 2, y, z1 + u * (i + .5), PI / 2, { w: u, d, h: .6, color: 0xffffff });
    edge(x1, z1, x2, z2, y + .6, side); };
  box(Ls, 649.9, -8, 560, 650.45, 16, 648.4); box(Ls, 649.9, -8, 650.4, 650.45, 16, 740); box(Ls, 649.9, 2.4, 648.4, 650.45, 16, 650.4); // the wall the passage comes out of, running out of sight both ways
  block(Ls, 649.9, -.2, 648.4, 650.45, 0, 650.4); // its doorway's floor
  block(Ls, 650.45, -8, 647.9, 664, 0, 650.9); rail(650.45, 647.6, 664, 647.9, 0, 'n'); rail(650.45, 650.9, 664, 651.2, 0, 's'); // causeway
  for (let x = 652.5; x < 664; x += 3.8) for (const zc of [647.1, 651.7]) column(z, x, -8, zc, 0, { h: 15, r: .24, color: 0xffffff }); // columns rising out of the cloud beside it
  block(Ls, 664, -8, 639.4, 684, 0, 659.4); // the court
  rail(664, 639.1, 684, 639.4, 0, 'n'); rail(664, 659.4, 684, 659.7, 0, 's'); rail(663.7, 639.1, 664, 647.9, 0, 'w'); rail(663.7, 650.9, 664, 659.7, 0, 'w'); rail(684, 639.1, 684.3, 645, 0, 'e'); rail(684, 653.8, 684.3, 659.7, 0, 'e'); // stopping at the stair's walls, not in their faces
  const arches = c0 => [0, 1, 2, 3].map(i => ['arch', c0 + 1.9 + 3.4 * i, 2.6, 4.6]);
  for (const zc of [642.4, 655.9]) slab(Su, 'x', zc, .5, 667, 681, 0, 6, arches(667), true);
  for (const x of [667, 680.5]) slab(Su, 'z', x, .5, 642.4, 656.4, 0, 6, arches(642.4), true);
  // stone piers under the rendered arcade, imposts at the springing; 5 mm wider each side than the slab's jambs they stand in, so the jambs are behind their faces
  for (const zc of [642.65, 656.15]) for (const x of [670.6, 674, 677.4]) pier(z, x, 0, zc, 0, { w: .81, h: 3.3, mat: "stucco", color: 0xfff4e6, course: .22 });
  for (const x of [667.25, 680.75]) for (const zc of [646, 649.4, 652.8]) pier(z, x, 0, zc, PI / 2, { w: .81, h: 3.3, mat: "stucco", color: 0xfff4e6, course: .22 });
  for (const x of [667.25, 680.75]) for (const zc of [642.65, 656.15]) pier(z, x, 0, zc, 0, { w: .71, d: .71, h: 3.3, mat: "stucco", color: 0xfff4e6, course: .22 }); // the corners
  const BLUE = { openable: true, frame: 0x86a8d8, color: 0x86a8d8 }, CD = [674, 649.4], courtDoor = door(z, CD[0], 0, CD[1], PI / 2, BLUE); // the court's free-standing door: from its west face it opens onto the sky stair (below).
  // Off the court's middle, in the sunbeam of the arch east of it: at dusk its whole swing and a metre of floor either side are in sun, as at the sky end
  block(Su, 684, -8, 645.4, 694, 0, 653.4); steps(z, 689, 0, 649.4, -PI / 2, { n: 20, r: .25, g: .5, w: 8, color: 0xffffff, insert: 0x8a8276 }); // the stair, between stepped walls
  for (let i = 0; i < 4; i++) for (const zc of [645, 653.4]) { box(Su, 684 + 2.5 * i, -8, zc, 686.5 + 2.5 * i, 1.25 * (i + 1) + .9, zc + .4); edge(684 + 2.5 * i, zc, 686.5 + 2.5 * i, zc + .4, 1.25 * (i + 1) + .9, zc < 649 ? 'n' : 's'); }
  block(Ls, 694, -8, 645, 704, 5, 653.8); flats.push([694, 645.4, 704, 653.4, () => 5]); rail(694, 645, 704, 645.4, 5, 'n'); rail(694, 653.4, 704, 653.8, 5, 's'); rail(703.6, 645.4, 704, 653.4, 5, 'e'); // the lookout
  railing(z, [[694.4, 5.6, 645.2], [703.8, 5.6, 645.2], [703.8, 5.6, 653.6], [694.4, 5.6, 653.6]], { h: .5, mid: false }); // a guard rail fixed to the coping: the drop is high here
  const iron = M(z, 'castIron', { color: 0x1f2c25, roughness: .62 }); // the bench's own iron (its key), so lamps and bench draw as one
  for (const zc of [646, 652.8]) globeLamp(z, 694.8, 5, zc, 0, { metal: iron }); // lamps either side of the stair head, and at its foot
  for (const zc of [644.3, 654.5]) globeLamp(z, 683.1, 0, zc, 0, { metal: iron });
  parkBench(z, 701.2, 5, 649.4, PI / 2, { iron: 0x1f2c25 }); // a bench facing the sun
  palmPlanter(z, 665.6, 0, 641.2); palmPlanter(z, 682.3, 0, 657.8);
  // things that hang in the sky out of reach: stairs and doors
  for (const [x, y, zc, n, ry] of [[690, 9, 622, 9, .4], [712, 3, 676, 12, -1.1]]) { const c = .25 * (n - 1); steps(z, x + c * Math.cos(ry), y, zc - c * Math.sin(ry), ry - PI / 2, { n, r: .25, g: .5, w: 2, color: 0xffffff, insert: 0x8a8276 }); doorway(blue, blue, x, y + .25 * n, zc - 3, ry); }
  { // The sky stair: white stone hanging east of the lookout like its two sisters, nothing holding it up. Its door is the court's door through a
    // portal (docs/building.md, Portals) with no turn: in at the court door's west face walking east, out at the top of the stair walking east.
    // The doors stand O apart, 49 x -12 repeats of the court paving's 1.2 m pattern, so its joints run on over the short flat top; that paving
    // and the door's copy are lit as if they stood back in the court (mat.js, shade: O): the arcade's shadow stripes, the ambient and the
    // reflections carry on through the threshold, and the leaf is one lit object from either side. The court's light stops at the first riser.
    // Unseen panes 3.6 m above the top on all four sides, and from the sides to the door's jambs: no way off.
    const O = [49 * 1.2, 13.75, -12 * 1.2], X = CD[0] + O[0], Y = O[1], Z = CD[1] + O[2], n = 11, r = .25, g = .5, T = X + 1.2, E = T + n * g, yb = Y - (n + 1) * r, y0 = yb - .6, y1 = Y + 3.6;
    const C = M(z, 'concreteWall', { color: 0xffffff, wear: 0 }), Lt = M(z, 'limestone', { color: 0xffffff, wear: 0, floor: 0, shade: O }); Lt.color.setScalar(1.3); // the steps' own stone; the court's paving (lifted as it is, below)
    box(C, X - .1, yb + .001, Z - .999, T, Y - .0205, Z + .999); box(Lt, X - .1, Y - .02, Z - .999, T, Y, Z + .999); // the flat top, carrying the door's frame just behind its plane: the stair's body, the paving on it
    steps(z, (T + E) / 2 - .005, yb, Z, PI / 2, { n, r, g, w: 2, color: 0xffffff, insert: 0x8a8276 }); // its head 5 mm into the body
    flats.push([X - .1, Z - 1, T, Z + 1, () => Y], [T, Z - 1, E, Z + 1, x => yb + r * Math.min(n, Math.ceil((E - x) / g))]);
    for (const [a, b] of [[Z - 1.03, Z - .99], [Z + .99, Z + 1.03]]) solid(X - .05, y0, a, E + .3, y1, b);
    solid(E + .26, y0, Z - 1.03, E + .3, y1, Z + 1.03); // the foot, a body's width out: you stand on the last step, its edge under your toes
    solid(X - .05, y0, Z - 1.03, X + .03, y1, Z - .55); solid(X - .05, y0, Z + .55, X + .03, y1, Z + 1.03); // to the jambs, either side of the door
    const [a] = portal([CD[0], 0, CD[1], -PI / 2], [X, Y, Z, PI / 2], 1, 2.24, courtDoor);
    a.to.door = door(z, ...via(a, CD[0], 0, CD[1], PI / 2), { ...BLUE, copy: courtDoor, shade: O });
  }
  // The ashlar and the cast steps are greyer than the white plaster this place was built in; lift them back to sunlit white stone
  // (the same keys the kit asks for, so its piers, columns and steps share them: at the court, the lookout and under the cloud)
  for (const o of [{ floor: 0 }, { floor: 5 }, { floor: -8 }]) M(z, 'limestone', { color: 0xffffff, wear: 0, ...o }).color.setScalar(1.3);
  M(z, 'concreteWall', { color: 0xffffff, wear: 0 }).color.setScalar(1.3);
  // The cloud sea: an opaque floor of cloud well below the terrace and three thinner sheets above it, all cut from one drifting pattern, lit from the low sun
  [0, 1, 2, 3].forEach(l => { const m = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ transparent: l > 0, depthWrite: l === 0, uniforms: { uTime, uSun: { value: sunDir }, uL: { value: l } },
    vertexShader: 'varying vec3 vW; void main() { vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }',
    fragmentShader: `varying vec3 vW; uniform float uTime, uL; uniform vec3 uSun;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + 1.), f.x), f.y); }
      float fbm(vec2 p) { float a = 0., k = .5; for (int i = 0; i < 6; i++) { a += k * n(p); p = p * 2.03 + 7.; k *= .5; } return a; }
      void main() { vec2 p = vW.xz * .045 + uTime * vec2(.005, .002); float m = fbm(p + .6 * fbm(p * .5)), far = distance(vW, cameraPosition);
        vec3 c = mix(vec3(.42, .3, .55), vec3(2.2, 1.35, 1.05), smoothstep(.3, .75, m + uL * .07)); // hollows in shade, crests catching the sun
        c += vec3(1.6, .6, .25) * pow(max(dot(normalize(vW - cameraPosition), uSun), 0.), 5.) * smoothstep(.35, .7, m);
        gl_FragColor = vec4(mix(c, vec3(2.3, 1.05, .7), smoothstep(120., 1500., far)), uL < .5 ? 1. : smoothstep(.44 + .07 * uL, .6 + .07 * uL, m) * smoothstep(1.5, 6., far)); }` }));
    m.position.set(690, -5.4 + .75 * l, 650); scene.add(m); seeThrough.push(m); skyOnly.dusk.push(m); });
}
