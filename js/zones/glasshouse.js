// The glasshouse at dusk: an empty Victorian palm house far from everything, reached through a dark recess in its brick back wall.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { scene, uTime, sunDir, V, dry, zones, defZone } from '../core.js';
import { M, P, noCast } from '../mat.js';
import { add, block, box, solid, round, turned, put, spot, onSun } from '../build.js';
import { door } from '../props/metalwork.js';
import { sconce } from '../props/lights.js';
import { parkBench, palmPlanter, pottedPlant } from '../props/garden.js';

// One nave x[830,850] z[-604,-596] (inner faces), floor 0, eaves 2.75, ridge 6. The entry is a doorway in the brick back wall at
// x 830, centred on z -600, into a dark recess x[828.5,830]; the sun comes in through the glazed gable at x 850 and the north side.
const X0 = 840, Z0 = -600, EZ = 4.17, EY = 2.75, RY = 6, CAP = .735, GCAP = .285, PI = Math.PI; // GCAP: the sunlit gable is glazed down to a low plinth
defZone('gH', { ...dry, sky: 'dusk', air: .25, grp: 'gh', k: 1.35, exp: .42, fog: [.42, .27, .15, .012], tint: [1.03, 1, .94], sat: 1.06, bloom: .16, shaft: .9, wet: .25, box: [828, -606, 852, -594], probe: [836, 1.8, -600.4] });

// The dusk sky aims its one sun shadow map at the terrace. While a camera is in here under that sky, aim it here instead (a 30 x 16 m
// map, 7 mm a texel: the glazing bars come out sharp) and put it back once the camera leaves; scene.onBeforeRender runs before the shadow pass.
onSun.push(sun => {
  const cam = sun.shadow.camera, AT = V(X0, 2, Z0), p = V(); let saved = null, mine = null;
  const aim = (t, s, e, r) => { sun.target.position.copy(t); sun.position.copy(s); Object.assign(cam, e); cam.updateProjectionMatrix(); sun.target.updateMatrixWorld(); sun.updateMatrixWorld(); sun.shadow.needsUpdate = r.shadowMap.needsUpdate = true; };
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (r, s, c, ...rest) {
    prev.call(this, r, s, c, ...rest);
    // the place is drawn only for a camera near it: from the terrace, under the same sky, it lay in view 1.2 km off and cost 1.3 M triangles
    if (!mine) { const S = new Set(zones.gH.mats); mine = []; s.traverse(o => { if (o.isMesh && S.has(o.material)) mine.push(o); }); }
    p.setFromMatrixPosition(c.matrixWorld); const near = p.x > 800 && p.x < 880 && p.z > -640 && p.z < -560 && Math.abs(sunDir.y - .1025) < .003;
    for (const o of mine) o.visible = near;
    p.setFromMatrixPosition(c.matrixWorld); const dusk = Math.abs(sunDir.y - .1025) < .003, inside = dusk && p.x > 820 && p.x < 860 && p.z > -612 && p.z < -588;
    if (inside && !saved) { saved = [sun.target.position.clone(), sun.position.clone(), { left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom, far: cam.far }];
      aim(AT, sunDir.clone().multiplyScalar(40).add(AT), { left: -15, right: 15, top: 8, bottom: -8, far: 90 }, r); }
    else if (!inside && saved) { if (dusk) aim(...saved, r); saved = null; } // under another sky, setSky has already re-aimed it
  };
});

{
  const z = zones.gH, R = (s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(9172);
  const lerp = (a, b, t) => a + (b - a) * t;
  // ---- materials (library only)
  const BR = [M(z, 'stucco', { color: 0xa0664e, roughness: .88, macro: .25, grime: .3, dirt: .5 }), M(z, 'stucco', { color: 0x8a5c4a, roughness: .9, macro: .25, grime: .3, dirt: .5 }), M(z, 'stucco', { color: 0x6a4838, roughness: .9, macro: .3, grime: .35, dirt: .5 })];
  const BRp = M(z, 'stucco', { color: 0x96604c, roughness: .74, macro: .3, grime: .35, dirt: .3, dirtCol: [.5, .45, .38] }); // path bricks, polished by feet
  const Mo = M(z, 'plaster', { color: 0xa89c88, grime: .3, dirt: .7 }), Pit = P(z, { color: 0x0d0b09, roughness: 1 });
  const St = M(z, 'limestone', { color: 0xd8ccb2, wear: .6, dirt: .7, dirtCol: [.42, .44, .34] }); // copings, sills, the threshold
  const Bs = M(z, 'limestone', { color: 0xcfc2a6, roughness: .8, wear: .5, dirt: .8, dirtCol: [.36, .4, .3], uv: [8.4, 1.1] }); // the basin, its stones round it
  const Ir = M(z, 'paintedSteel', { color: 0xd6cfba, roughness: .42, wear: .35, edgeCol: [.32, .25, .19], dirt: .55, dirtCol: [.42, .4, .32], macro: .06 }); // the painted ironwork
  const Gi = M(z, 'castIron', { color: 0x37312c, roughness: .6 }), Gal = M(z, 'galvanised', {}), Dp = M(z, 'paintedSteel', { color: 0x3c5244, roughness: .5, wear: .4, edgeCol: [.5, .45, .38], dirt: .5 });
  const G = M(z, 'glass', { color: 0x3c5a44, opacity: .17 }), Fr = M(z, 'frostedGlass', { color: 0xe4dcc4, opacity: .66 }), Du = M(z, 'frostedGlass', { color: 0x8c8466, opacity: .34, roughness: .85 });
  noCast.add(G); noCast.add(Du); // clear glass and its dust let the sun through; the lime-washed panes stop it
  const Sa = M(z, 'terrazzo', { color: 0x5c4c3c, roughness: .9, macro: .3, grime: .4 }), Peb = M(z, 'limestone', { color: 0x9a9182, tri: 1, roughness: .7 });
  const Soil = M(z, 'mulch', { color: 0x6a5444 }), Lf = M(z, 'palmLeaf'), Lfd = M(z, 'palmLeaf', { color: 0xc89a5c }), Tc = M(z, 'limestone', { color: 0xc8805a, tri: 1, roughness: .85 });
  const Wd = M(z, 'weatheredWood', { color: 0xb8ab94 }), Hose = M(z, 'rubber', { color: 0x3f6a3c, roughness: .5 }), Reel = M(z, 'paintedSteel', { color: 0x48684e, roughness: .45, wear: .5, edgeCol: [.3, .28, .25] });
  const Lawn = M(z, 'grassGround', { color: 0x58663e }), Hedge = M(z, 'mulch', { color: 0x2a4026, roughness: .9 }), Br = M(z, 'brass', { roughness: .3, dirt: .7 });

  // ---- construction helpers: a chamfered box (no razor edges), a bar between two points, a convex slab (panes), a round bar
  const cache = new Map();
  const cbox = (w, h, d, c = .003, back = true) => { // back false: only the front (+z) edges rounded, the back is never seen
    const k = `${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)},${c},${back}`;
    if (!cache.has(k) && !c) cache.set(k, new THREE.BoxGeometry(w, h, d)); // c 0: a plain box, for what is never seen close
    if (!cache.has(k)) { const a = w / 2, b = h / 2, e = d / 2, q = Math.min(c, a / 2, b / 2, e / 2), p = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) p.push(...(sz < 0 && !back ? [V(sx * a, sy * b, -e)] : [V(sx * (a - q), sy * b, sz * (e - q)), V(sx * a, sy * (b - q), sz * (e - q)), V(sx * (a - q), sy * (b - q), sz * e)]));
      const g = new ConvexGeometry(p); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); cache.set(k, g); }
    return cache.get(k).clone();
  };
  const basis = (a, b, up) => { const A = V(...a), B = V(...b), y = B.clone().sub(A), L = y.length(); y.divideScalar(L);
    let w = V(...up); w.addScaledVector(y, -w.dot(y)); if (w.lengthSq() < 1e-6) w = Math.abs(y.x) < .9 ? V(1, 0, 0) : V(0, 0, 1); w.normalize();
    return [new THREE.Matrix4().makeBasis(V().crossVectors(y, w), y, w).setPosition(A.add(B).multiplyScalar(.5)), L]; };
  const bar = (m, a, b, w, d, up = [0, 1, 0], c = .003) => { const [T, L] = basis(a, b, up); add(m, cbox(w, L, d, c).applyMatrix4(T)); };
  const rod = (m, a, b, r, s = 12) => { const [T, L] = basis(a, b, [1, 0, 0]); add(m, new THREE.CylinderGeometry(r, r, L, s, 1).applyMatrix4(T)); };
  const slab = (m, pts, n, t) => { const g = new ConvexGeometry(pts.flatMap(p => [V(...p).addScaledVector(n, t / 2), V(...p).addScaledVector(n, -t / 2)]));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); add(m, g); };
  const lathe = (prof, seg = 48) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const ring = (r, t, a = PI * 2, s = 48, rs = 8) => new THREE.TorusGeometry(r, t, rs, s, a);
  const pick = () => { const u = R(); return BR[u < .5 ? 0 : u < .85 ? 1 : 2]; };

  // ---- brickwork: stretcher bond, 215 x 65 mm faces in 10 mm joints raked back 8 mm to the mortar behind, cut bricks at the ends.
  // A face along axis 'x' (at z = at) or 'z' (at x = at), facing +s, from a1 to a2 for n courses from y0; keep(a, y) leaves a brick out.
  function brickFace(axis, at, s, a1, a2, y0, n, keep = () => true, c0 = 0) {
    for (let c = c0; c < c0 + n; c++) { const y = y0 + (c - c0) * .075;
      for (let a = a1 - (c % 2) * .1125; a < a2; a += .225) { const b1 = Math.max(a, a1), b2 = Math.min(a + .215, a2); if (b2 - b1 < .04) continue;
        const m = (b1 + b2) / 2; if (!keep(m, y + .0375, b1, b2)) continue;
        const g = cbox(b2 - b1, .065, .1025, y > 1.95 ? 0 : .004, false), o = at - s * (.05125 - (R() - .5) * .003);
        add(pick(), axis === "x" ? g.rotateY(s < 0 ? PI : 0).translate(m, y + .0425, o) : g.rotateY(s < 0 ? -PI / 2 : PI / 2).translate(o, y + .0425, m)); } }
  }
  // the outside ground and the hedges round it (all anyone sees through the glass), the floor's bedding under the bricks and gravel
  block(Lawn, 780, -.5, -660, 900, -.03, -540);
  block(Sa, 830, -.12, -603.52, 850, -.004, -596.48);
  const hedge = (x1, z1, x2, z2, h) => { const L = Math.max(x2 - x1, z2 - z1), g = new THREE.BoxGeometry(x2 - x1, h, z2 - z1, Math.ceil((x2 - x1) * 1.5), Math.ceil(h * 2), Math.ceil((z2 - z1) * 1.5)), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (x1 + x2) / 2, y = p.getY(i), zz = p.getZ(i) + (z1 + z2) / 2, k = Math.sin(x * 1.7 + zz * .9) * Math.sin(zz * 1.3 - x * .6 + 2) + .5 * Math.sin(x * 4.1 + zz * 3.7);
      if (y > -h / 2 + .01) { p.setX(i, p.getX(i) * (1 + .03 * k)); p.setZ(i, p.getZ(i) * (1 + .03 * k)); } if (y > h / 2 - .01) p.setY(i, y + .35 * k); }
    g.computeVertexNormals(); add(Hedge, g.translate((x1 + x2) / 2, h / 2 - .05, (z1 + z2) / 2)); void L; };
  hedge(796, -589, 846, -586, 1.4); hedge(846, -590, 852, -585, 6.6); hedge(852, -589, 904, -586, 1.0); // north: a tall dark yew block where it shades the east end
  hedge(874, -640, 877, -589, 1.7); hedge(790, -617, 904, -614, 2.7); hedge(806, -640, 809, -589, 3); // east (beyond the sunlit gable, low), south, west

  // ---- the walls: brick dwarf walls under limestone copings along both sides and the sunlit gable, a full brick back wall
  for (const [zf, s] of [[-604, 1], [-596, -1]]) {
    const cp = zf > Z0 ? GCAP : CAP; // the sunlit north side, like the gable, glazed down to a low plinth
    block(Mo, 829.65, -.36, Math.min(zf, zf - s * .35), 850.35, cp - .06, Math.max(zf, zf - s * .35)); // the wall's body, its face 8 mm behind the bricks'
    brickFace('x', zf + s * .008, s, 829.65, 850.35, 0, cp > .5 ? 9 : 3, () => true);
    for (let x = 829.6; x < 850.39; x += 1.0) { const w = Math.min(1, 850.4 - x) - .006; add(St, cbox(w, .06, .43, .008).translate(x + w / 2 + .003, cp - .03, zf - s * .175 + s * .04)); }
  }
  block(Mo, 850.04, -.36, -604.35, 850.35, GCAP - .06, -600.86); block(Mo, 850.04, -.36, -599.14, 850.35, GCAP - .06, -595.65); // gable dwarf wall, the door between
  brickFace('z', 850.032, -1, -604, -600.86, 0, 3); brickFace('z', 850.032, -1, -599.14, -596, 0, 3);
  for (const [z1, z2] of [[-604.39, -600.86], [-599.14, -595.61]]) add(St, cbox(.43, .06, z2 - z1, .008).translate(850.135, GCAP - .03, (z1 + z2) / 2));
  add(St, cbox(.4, .03, 1.7, .006).translate(850.18, .0, Z0)); // the door's threshold
  // back wall: brick up to the roof line, a doorway 1.0 x 2.24 in a kit frame, a limestone lintel over it
  const roofY = zz => EY + (RY - EY) * (1 - Math.abs(zz - Z0) / EZ);
  const backKeep = (m, y, b1, b2) => y + .05 < roofY(b1) - .06 && y + .05 < roofY(b2) - .06 && !(Math.abs(m - Z0) < .62 && y < 2.52);
  block(Mo, 829.65, -.36, -604.35, 829.992, 2.3, -600.62); block(Mo, 829.65, -.36, -599.38, 829.992, 2.3, -595.65); { const sh = new THREE.Shape([new THREE.Vector2(-4.35, 2.3), new THREE.Vector2(4.35, 2.3), new THREE.Vector2(4.35, EY), new THREE.Vector2(0, RY + .05), new THREE.Vector2(-4.35, EY)]); add(Mo, new THREE.ExtrudeGeometry(sh, { depth: .342, bevelEnabled: false }).rotateY(-PI / 2).translate(829.992, 0, Z0)); }
  brickFace('z', 830, 1, -604, -596, 0, 78, backKeep);
  add(St, cbox(.12, .17, 1.48, .008).translate(829.99 + .03, 2.43, Z0));
  door(z, 829.9, 0, Z0, PI / 2, { leaf: false, frame: 0x3c5244 });
  // the recess behind it: dark, 1.25 m deep, then the passage from the hotel
  const K = P(z, { color: 0x1a1714, roughness: .95 });
  block(K, 828.4, -.1, -600.62, 829.65, 0, -599.38); block(K, 828.4, 2.24, -600.62, 829.65, 2.4, -599.38); block(K, 828.4, 0, -600.7, 829.65, 2.4, -600.5); block(K, 828.4, 0, -599.5, 829.65, 2.4, -599.3);
  solid(828.4, 0, -601, 829.66, 3, -600.5); solid(828.4, 0, -599.5, 829.66, 3, -599); solid(828.4, 2.24, -600.6, 829.66, 3, -599.4); // open at x 828.4 onto the hotel's passage (zones/passages.js)
  // the shell's solids: the back wall either side of and over the door, the side walls and their glass, the gable and its shut door
  solid(829.6, 0, -604.5, 830, 8, -600.5); solid(829.6, 0, -599.5, 830, 8, -595.5); solid(829.6, 2.24, -600.6, 830, 8, -599.4);
  solid(829.6, 0, -604.5, 850.5, 8, -603.98); solid(829.6, 0, -596.02, 850.5, 8, -595.5); solid(850, 0, -604.5, 850.5, 8, -595.5);

  // ---- the iron frame: columns on the copings at every bay, eaves beams, arched ribs with rings in their spandrels, rafters that
  // are the roof's glazing bars, purlins, a ridge with cresting; the side and gable glazing bars, transoms and sills
  const bays = [832.5, 835, 837.5, 840, 842.5, 845, 847.5];
  const colProf = [[.085, 0], [.086, .028], [.072, .04], [.07, .065], [.058, .085], [.05, .12], [.046, .5], [.042, 1.66], [.048, 1.69], [.05, 1.72], [.062, 1.76], [.078, 1.8], [.09, 1.83], [.09, 1.865], [0, 1.866]];
  for (const zc of [Z0 - EZ, Z0 + EZ]) { const cp = zc > Z0 ? GCAP : CAP;
    for (const bx of [830.12, ...bays, 849.88]) { add(Ir, put(lathe(colProf, 24).scale(1, (EY - .15 - cp) / 1.866, 1), bx, cp, zc)); round(bx, zc, .09, cp, EY); }
    add(Ir, cbox(20.3, .15, .14, .006).translate(X0, EY - .075, zc)); // the eaves beam
    bar(Ir, [829.9, cp + .015, zc], [850.1, cp + .015, zc], .03, .06, [0, 0, 1]); // the sill bar
    bar(Ir, [829.9, 1.72, zc], [850.1, 1.72, zc], .035, .028, [0, 0, 1]); // transom
    for (let x = 830.5; x < 849.9; x += .5) if (!bays.some(b => Math.abs(b - x) < .1)) bar(Ir, [x, cp + .03, zc], [x, EY - .15, zc], .022, .045, [0, 0, 1]);
  }
  // the rib: a segmental arch of flat bar 140 mm deep with a rolled bead each edge, springing from the column heads
  const AS = EY - .15, AC = 4.25, AR = (EZ * EZ + (AC - AS) ** 2) / (2 * (AC - AS)), AY = AC - AR, ang = Math.asin(EZ / AR), ang2 = Math.asin((EZ - .05) / (AR - .14));
  const rib = new THREE.Shape(); rib.absarc(0, AY, AR, PI / 2 + ang, PI / 2 - ang, true); rib.absarc(0, AY, AR - .14, PI / 2 - ang2, PI / 2 + ang2, false);
  const ribG = new THREE.ExtrudeGeometry(rib, { depth: .026, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 1, curveSegments: 64 }).rotateY(-PI / 2);
  const rafterY = zq => EY + (RY - EY) * (1 - Math.abs(zq) / EZ) - .045; // underside of the rafters at zq from the ridge line
  for (const bx of [...bays, 849.86]) {
    add(Ir, ribG.clone().translate(bx + .013, 0, Z0));
    for (const rr of [AR, AR - .14]) add(Ir, ring(rr, .012, 2 * ang, 60, 6).rotateZ(PI / 2 - ang).translate(0, AY, 0).rotateY(-PI / 2).translate(bx, 0, Z0));
    bar(Ir, [bx, AC, Z0], [bx, RY - .04, Z0], .03, .07, [0, 0, 1]); // king post
    for (const zq of [1.05, 2.25, 3.15]) for (const sg of [-1, 1]) { const ya = AY + Math.sqrt(AR * AR - zq * zq), yr = rafterY(zq) - Math.abs(zq) * .02, rr = (yr - ya) / 2 - .012;
      if (rr > .05) add(Ir, ring(rr, .011, PI * 2, 32, 6).rotateY(PI / 2).translate(bx, (ya + yr) / 2, Z0 + sg * zq)); }
  }
  // roof: on each slope rafters every 500 mm (they are its glazing bars), two purlins under them, the ridge beam and cresting
  const L = Math.hypot(EZ, RY - EY), nrm = s => V(0, EZ / L, s * (RY - EY) / L), rp = (x, s, t, off = 0) => { const n = nrm(s); return [x + 0, EY + (RY - EY) * t + n.y * off, Z0 + s * EZ * (1 - t) + n.z * off]; };
  for (const s of [-1, 1]) { const n = nrm(s), up = [0, n.y, n.z];
    for (let x = 830.06; x < 850; x += .5) { const xx = Math.min(x, 849.94); bar(Ir, rp(xx, s, 0, -.03), rp(xx, s, 1, -.03), .03, .06, up); }
    bar(Ir, rp(850, s, 0, -.03), rp(850, s, 1, -.03), .06, .1, up); bar(Ir, rp(830.04, s, 0, -.05), rp(830.04, s, 1, -.05), .1, .2, up); // the gable verge and the back wall's
    for (const t of [.34, .67]) bar(Ir, rp(829.95, s, t, -.1), rp(850.05, s, t, -.1), .045, .08, up);
  }
  add(Ir, cbox(20.2, .14, .07, .006).translate(X0, RY + .02, Z0));
  for (let x = 830.15; x < 850; x += .3) { add(Ir, ring(.05, .007, PI * 2, 14, 5).translate(x, RY + .16, Z0)); add(Ir, new THREE.ConeGeometry(.012, .09, 8).translate(x + .15, RY + .14, Z0)); }
  bar(Ir, [829.95, RY + .215, Z0], [850.05, RY + .215, Z0], .012, .012, [0, 0, 1]);
  for (const x of [829.95, 850.05]) add(Ir, put(lathe([[.03, 0], [.035, .05], [.05, .1], [.052, .14], [.03, .18], [.012, .2], [.006, .36], [0, .37]], 20), x, RY + .09, Z0)); // finials

  // ---- the glass: old panes, slightly green, lapped in rows on the roof; a few lime-washed white, a few missing, dust gathered at
  // every pane's lower edge. Panes sit 3 mm out from the bars' outer faces.
  const paneAt = (m, pts, n) => slab(m, pts, n, .004);
  const choose = () => { const u = R(); return u < .035 ? null : u < .13 ? Fr : G; };
  const vents = [831.25, 833.75, 836.25, 838.75, 841.25, 843.75, 846.25, 848.75], OPEN = 843.75;
  for (const s of [-1, 1]) { const n = nrm(s);
    for (let x = 830.06; x < 849.9; x += .5) { const xa = x + .016, xb = Math.min(x + .5, 849.94) - .016, vent = s > 0 && vents.some(v => Math.abs(v - (x + .25)) < .6);
      for (let i = 0; i < 5; i++) { const t1 = i / 5 - (i ? .012 : 0), t2 = Math.min((i + 1) / 5, vent ? .865 : 1); if (t1 >= t2) continue; const o = .004 + (i % 2) * .005, m = choose(); if (!m) continue;
        paneAt(m, [rp(xa, s, t1, o), rp(xb, s, t1, o), rp(xb, s, t2, o), rp(xa, s, t2, o)], n);
        if (m === G && R() < .7) paneAt(Du, [rp(xa, s, t1, o + .003), rp(xb, s, t1, o + .003), rp(xb, s, t1 + .012 + .02 * R(), o + .003), rp(xa, s, t1 + .012 + .02 * R(), o + .003)], n); } }
  }
  for (const zc of [Z0 - EZ, Z0 + EZ]) { const n = V(0, 0, Math.sign(zc - Z0)), pz = zc + n.z * .028;
    for (let x = 830.0; x < 849.9; x += .5) for (const [y1, y2] of [[(zc > Z0 ? GCAP : CAP) + .045, 1.705], [1.735, EY - .15]]) { const m = choose(); if (!m) continue;
      paneAt(m, [[x + .02, y1, pz], [x + .48, y1, pz], [x + .48, y2, pz], [x + .02, y2, pz]], n); if (m === G && R() < .8) paneAt(Du, [[x + .02, y1, pz + n.z * .004], [x + .48, y1, pz + n.z * .004], [x + .48, y1 + .03 + .04 * R(), pz + n.z * .004], [x + .02, y1 + .03 + .04 * R(), pz + n.z * .004]], n); }
  }
  // the gable at x 850: glazing bars every 500 mm over the dwarf wall, a transom at the eaves, the triangle above; a pair of glazed
  // doors in the middle, shut, painted green, over a timber bottom panel, with a brass knob and an escutcheon
  const GX = 850.17, gn = V(1, 0, 0);
  bar(Ir, [GX, EY - .08, Z0 - EZ], [GX, EY - .08, Z0 + EZ], .05, .07, [1, 0, 0]);
  for (let m = -8; m <= 8; m++) { const zq = Z0 + m * .5, top = roofY(zq) - .03; if (Math.abs(m) >= 2 && Math.abs(m) < 8) bar(Ir, [GX, GCAP + .03, zq], [GX, EY - .12, zq], .045, .022, [1, 0, 0]); if (Math.abs(m) < 8) bar(Ir, [GX, EY - .05, zq], [GX, top, zq], .045, .022, [1, 0, 0]); }
  for (const [z1, z2] of [[-604.17, -600.9], [-599.1, -595.83]]) for (const y of [GCAP + .015, 1.5]) bar(Ir, [GX, y, z1], [GX, y, z2], .06, y < 1 ? .03 : .028, [1, 0, 0]); // sill and transom
  for (let m = -8; m < 8; m++) { const za = Z0 + m * .5 + .013, zb = za + .474, px = GX + .03;
    if (m <= -3 || m >= 2) for (const [y1, y2] of [[GCAP + .045, 1.485], [1.515, EY - .12]]) { const g = choose(); if (g) paneAt(g, [[px, y1, za], [px, y1, zb], [px, y2, zb], [px, y2, za]], gn); }
    const g2 = choose(); if (g2) paneAt(g2, [[px, EY - .04, za], [px, EY - .04, zb], [px, roofY(zb) - .04, zb], [px, roofY(za) - .04, za]], gn); }
  for (const sg of [-1, 1]) {
    bar(Dp, [GX, 0, Z0 + sg * .86], [GX, EY - .12, Z0 + sg * .86], .09, .08, [1, 0, 0]); // the door posts
    const e = Z0 + sg * .815, mz = Z0 + sg * .012, hz = (e + mz) / 2, W = Math.abs(e - mz);
    for (const zq of [e - sg * .035, mz + sg * .035]) bar(Dp, [GX, .01, zq], [GX, 2.52, zq], .07, .05, [1, 0, 0]); // stiles
    for (const [y, h] of [[.08, .14], [.6, .1], [2.47, .1]]) add(Dp, cbox(.05, h, W - .12, .004).translate(GX, y, hz));
    add(Dp, cbox(.03, .43, W - .12, .006).translate(GX, .365, hz)); // bottom panel
    bar(Dp, [GX, .65, hz], [GX, 2.42, hz], .03, .02, [1, 0, 0]); for (const y of [1.25, 1.85]) bar(Dp, [GX, y, e - sg * .07], [GX, y, mz + sg * .07], .03, .02, [1, 0, 0]);
    paneAt(G, [[GX + .012, .65, e - sg * .07], [GX + .012, .65, mz + sg * .07], [GX + .012, 2.42, mz + sg * .07], [GX + .012, 2.42, e - sg * .07]], gn);
  }
  add(Dp, cbox(.08, .08, 1.8, .006).translate(GX, 2.56, Z0)); // door head
  add(Br, put(lathe([[0, 0], [.02, 0], [.022, .006], [.009, .014], [.008, .03], [.022, .04], [.026, .052], [.02, .062], [0, .066]], 24).rotateZ(PI / 2), GX - .03, 1.02, Z0 - .05));
  add(Br, cbox(.006, .09, .03, .002).translate(GX - .03, .93, Z0 - .05));

  // ---- the ridge vents on the north slope, each hinged at the ridge on its own frame; one stands open. Under them a line shaft on
  // brackets turns a pinion at each vent that drives its rack; at the back wall a bevel box takes it down a rod to a handwheel.
  const vOpen = .42, sv = 1, nv = nrm(sv);
  for (const vx of vents) { const a = vx === OPEN ? vOpen : 0, hinge = V(...rp(0, sv, .995, .02)), dirS = V(0, -(RY - EY) / L, sv * EZ / L);
    const vp = (u, v, w = 0) => { const p = V(0, 0, 0).addScaledVector(dirS, v).addScaledVector(nv, w); p.applyAxisAngle(V(1, 0, 0), sv * -a); return [vx + u, hinge.y + p.y, hinge.z + p.z]; };
    const vn = nv.clone().applyAxisAngle(V(1, 0, 0), sv * -a), up = [0, vn.y, vn.z];
    for (const u of [-.5, .5]) bar(Ir, vp(u, 0, .03), vp(u, .7, .03), .04, .05, up);
    for (const v of [.02, .68]) bar(Ir, vp(-.52, v, .03), vp(.52, v, .03), .04, .05, up);
    bar(Ir, vp(0, .05, .03), vp(0, .65, .03), .025, .04, up);
    paneAt(G, [vp(-.48, .04, .06), vp(.48, .04, .06), vp(.48, .66, .06), vp(-.48, .66, .06)], vn);
    for (const u of [-.4, .4]) rod(Ir, vp(u - .05, 0, .02), vp(u + .05, 0, .02), .014, 12); // hinge knuckles
    // the rack from the vent's bottom rail down through its pinion on the shaft
    const sh = V(...rp(vx, sv, .8, -.16)), tip = V(...vp(0, .69, 0)), d = sh.clone().sub(tip).normalize();
    bar(Ir, tip.toArray(), sh.clone().addScaledVector(d, .14 + (a ? .2 : 0)).toArray(), .012, .022, [1, 0, 0]);
    add(Ir, new THREE.CylinderGeometry(.045, .045, .02, 18).rotateZ(PI / 2).translate(sh.x - .03, sh.y, sh.z));
    for (let k = 0; k < 14; k++) add(Ir, cbox(.018, .012, .008, .002).translate(0, .049, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(k * PI / 7)).translate(sh.x - .03, sh.y, sh.z));
    add(Ir, cbox(.05, .08, .03, .004).translate(sh.x + .04, sh.y - .03, sh.z)); // the guide that holds rack to pinion
  }
  { const a = V(...rp(830.25, sv, .8, -.16)), b = V(...rp(849.7, sv, .8, -.16));
    rod(Ir, a.toArray(), b.toArray(), .013, 12);
    for (const bx of [...bays, 849.6]) { const p = V(...rp(bx, sv, .8, -.03)); bar(Ir, p.toArray(), [bx, a.y, a.z], .02, .008, [1, 0, 0]); add(Ir, new THREE.CylinderGeometry(.028, .028, .04, 14).rotateZ(PI / 2).translate(bx, a.y, a.z)); }
    add(Ir, cbox(.1, .12, .12, .008).translate(830.2, a.y, a.z)); // bevel box
    const dz = -598.25; rod(Ir, [830.2, a.y, a.z], [830.2, a.y, dz], .013); add(Ir, cbox(.1, .1, .1, .008).translate(830.2, a.y, dz));
    rod(Ir, [830.2, a.y, dz], [830.2, 1.25, dz], .013);
    for (let y = 1.6; y < a.y - .2; y += 1.1) { bar(Ir, [830.0, y, dz], [830.2, y, dz], .03, .006, [0, 1, 0]); add(Ir, ring(.02, .005, PI * 2, 12).rotateY(PI / 2).translate(830.2, y, dz)); }
    add(Ir, cbox(.12, .16, .14, .01).translate(830.12, 1.2, dz)); // the gearbox on its wall plate
    add(Ir, ring(.15, .012, PI * 2, 48).rotateY(PI / 2).translate(830.3, 1.2, dz)); // the handwheel: rim, five spokes, hub, a knob
    for (let k = 0; k < 5; k++) { const t = k * 2 * PI / 5; rod(Ir, [830.3, 1.2, dz], [830.3, 1.2 + .145 * Math.cos(t), dz + .145 * Math.sin(t)], .007, 8); }
    rod(Ir, [830.2, 1.2, dz], [830.33, 1.2, dz], .025, 16); rod(Ir, [830.3, 1.2 + .15, dz], [830.38, 1.2 + .15, dz], .012, 10);
  }

  // ---- heating: two cast-iron flow and return pipes on brick saddles in a trench along each side, under cast gratings at floor level
  for (const [z1, z2] of [[-603.98, -603.52], [-596.48, -596.02]]) { const zm = (z1 + z2) / 2;
    block(Pit, 830, -.36, z1, 850, -.34, z2); block(Pit, 830, -.36, z2 > -600 ? z1 - .02 : z2, 850, -.004, z2 > -600 ? z1 : z2 + .02);
    for (const off of [-.1, .1]) { rod(Gi, [830, -.19, zm + off], [850, -.19, zm + off], .05, 24); for (let x = 831.3; x < 850; x += 2.74) rod(Gi, [x, -.19, zm + off], [x + .11, -.19, zm + off], .062, 24); }
    for (let x = 831; x < 850; x += 2) add(BR[2], cbox(.1, .1, .42, .006).translate(x, -.29, zm));
    for (let x = 830; x < 849.99; x += 1) { // a plate: a rim, three bars along it, cross bars at 45 mm, cast as one; seated in an angle frame
      const w = z2 - z1 - .01, y = -.016;
      for (const dzz of [-w / 2 + .012, w / 2 - .012]) add(Gi, cbox(.994, .03, .024, .003).translate(x + .5, y, zm + dzz));
      for (const dx of [.012, .982]) add(Gi, cbox(.024, .03, w - .048, .003).translate(x + dx, y, zm));
      for (const dzz of [-w / 4, 0, w / 4]) add(Gi, cbox(.95, .028, .01, .002).translate(x + .5, y, zm + dzz));
      for (let dx = .045; dx < .96; dx += .045) add(Gi, cbox(.009, .022, w - .048, 0).translate(x + dx, y + .003, zm));
    }
  }

  // ---- the floor: a brick path down the middle, bricks across it in running bond between soldier edges, coursed in rings round
  // the basin; gravel either side
  const inApron = (x, zz, r) => Math.hypot(x - X0, zz - Z0) < r;
  for (let xr = 830.02, i = 0; xr < 849.96; xr += .105, i++) for (let zb = -600.6 - (i % 2) * .1025; zb < -599.4; zb += .205) {
    const b1 = Math.max(zb, -600.6), b2 = Math.min(zb + .2, -599.4); if (b2 - b1 < .04) continue;
    if ([[xr, b1], [xr, b2], [xr + .1, b1], [xr + .1, b2]].some(([a, b]) => inApron(a, b, 2.26))) continue;
    add(BRp, cbox(.1, .05, b2 - b1, .005).translate(xr + .05, -.017 + (R() - .5) * .003, (b1 + b2) / 2));
  }
  for (const zc of [-600.65, -599.35]) for (let x = 830.02; x < 849.98; x += .073) if (!inApron(x + .03, zc, 2.3)) add(BR[1], cbox(.065, .1, .1, .005).translate(x + .0325, -.04, zc));
  for (let k = 0; k < 8; k++) { const r = 1.43 + k * .104, n = Math.floor(2 * PI * r / .208), dt = 2 * PI / n, ln = 2 * r * Math.sin(dt / 2) - .006, top = k === 7;
    for (let i = 0; i < n; i++) { const t = i * dt + k * .5 * dt; add(top ? BR[1] : BRp, cbox(ln, top ? .1 : .05, top ? .065 : .1, .005).rotateY(-t - PI / 2).translate(X0 + r * Math.cos(t), top ? -.04 : -.017, Z0 + r * Math.sin(t))); } }
  // gravel: rounded pebbles bedded in the grit wherever there is no path, apron, bed or staging
  const peb = new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0; k < 2100; k++) { const x = 830.1 + 19.8 * R(), zz = -603.48 + 6.96 * R();
    if (Math.abs(zz - Z0) < .72 || inApron(x, zz, 2.3) || (zz < -601.98 && x > 842.35) || (zz > -598.02 && x > 831.55 && (x < 837.65 || x > 842.35))) continue;
    const r = .006 + .013 * R() ** 2; add(Peb, peb.clone().scale(r * (.8 + .5 * R()), r * .6, r * (.8 + .5 * R())).rotateY(R() * 6.3).translate(x, -.006 + r * .25, zz)); }

  // ---- the basin: a round cast-stone kerb with a rolled rim, still water in it
  add(Bs, lathe([[1.0, .05], [1.3, .05], [1.36, .055], [1.38, .07], [1.36, .09], [1.33, .1], [1.32, .38], [1.34, .4], [1.37, .42], [1.38, .45], [1.37, .475], [1.34, .485], [1.16, .485], [1.135, .475], [1.125, .46], [1.12, .3], [1.0, .3]], 96).translate(X0, -.05, Z0), true); // its top at .435, the water at .39
  { const n = 128, d = new Uint8Array(n * n * 4), q = 1.55; // a normal map of rings spaced in a constant ratio, so magnifying it by q gives it back
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = (i + .5) / n - .5, y = (j + .5) / n - .5, r = Math.max(Math.hypot(x, y), 1e-4), f = Math.min(1, r / .02);
      const s = f * Math.cos(2 * PI * Math.log(r) / Math.log(q)) * 2 * PI / (r * Math.log(q)) * .00045, nx = -s * x / r, ny = -s * y / r, l = Math.hypot(nx, ny, 1), o = (j * n + i) * 4;
      d[o] = 127.5 * (nx / l + 1); d[o + 1] = 127.5 * (ny / l + 1); d[o + 2] = 127.5 * (1 / l + 1); d[o + 3] = 255; }
    const tx = new THREE.DataTexture(d, n, n); tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; tx.center.set(.5, .5); tx.needsUpdate = true;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.13, 96).rotateX(-PI / 2).translate(X0, .39, Z0), P(z, { color: 0x06100c, roughness: .04, metalness: .1, normalMap: tx, normalScale: new THREE.Vector2(1, 1), envMapIntensity: 1.4 }));
    water.receiveShadow = true; water.onBeforeRender = () => tx.repeat.setScalar(Math.pow(q, -((uTime.value / 7) % 1))); scene.add(water);
    block(Pit, X0 - 1.01, .2, Z0 - 1.01, X0 + 1.01, .25, Z0 + 1.01); }
  round(X0, Z0, 1.38, 0, .25); for (let k = 0; k < 18; k++) { const t = k * PI / 9; turned(X0 + 1.25 * Math.cos(t), Z0 + 1.25 * Math.sin(t), .14, .24, -t, .25, .435); }

  // ---- raised beds: half-brick walls with a brick-on-edge coping, dark soil and bark, planted
  const bed = (x1, z1, x2, z2, n) => { // n courses under the coping; the north beds are low so the sun reaches the path over them
    const t = n * .075, hs = t - .01;
    for (const [zf, s] of [[z1, -1], [z2, 1]]) brickFace('x', zf, s, x1, x2, 0, n, () => true);
    for (const [xf, s] of [[x1, -1], [x2, 1]]) brickFace('z', xf, s, z1 + .1025, z2 - .1025, 0, n, () => true, 1);
    for (const [zf] of [[z1], [z2]]) for (let x = x1; x < x2 - .02; x += .075) add(pick(), cbox(.065, .1025, .1025, .004).translate(x + .0375, t + .051, zf + (zf === z1 ? .05125 : -.05125)));
    for (const [xf] of [[x1], [x2]]) for (let zz = z1 + .11; zz < z2 - .12; zz += .075) add(pick(), cbox(.1025, .1025, .065, .004).translate(xf + (xf === x1 ? .05125 : -.05125), t + .051, zz + .0375));
    const g = new THREE.PlaneGeometry(x2 - x1 - .2, z2 - z1 - .2, 40, 10).rotateX(-PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), zz = p.getZ(i); p.setY(i, .015 * Math.sin(x * 9 + zz * 4) * Math.sin(zz * 11 - x * 3) + .01 * Math.sin(x * 23 + 1)); }
    g.computeVertexNormals(); add(Soil, g.translate((x1 + x2) / 2, hs, (z1 + z2) / 2));
    solid(x1, 0, z1, x2, hs + .01, z2); for (const [a, b, c, d] of [[x1, z1, x2, z1 + .1], [x1, z2 - .1, x2, z2], [x1, z1, x1 + .1, z2], [x2 - .1, z1, x2, z2]]) solid(a, hs, b, c, t + .103, d);
  };
  const soilY = zc => zc < Z0 ? .44 : .065;
  bed(842.4, -603.5, 849.4, -602.0, 6); bed(831.6, -598.0, 837.6, -596.5, 1); bed(842.4, -598.0, 849.4, -596.5, 1);
  // palms in the beds (the kit's palm, its planter sunk to the rim in the soil), reaching toward the ridge
  palmPlanter(z, 846.2, .44 - .3, -602.75, 0, { planter: 'mulch', radius: .3, height: .3, trunk: 3.3, fronds: 12 });
  palmPlanter(z, 834.2, .065 - .3, -597.25, 0, { planter: 'mulch', radius: .3, height: .3, trunk: 2.6, fronds: 10 });
  palmPlanter(z, 846.8, .065 - .3, -597.2, 0, { planter: 'mulch', radius: .3, height: .3, trunk: 3.7, fronds: 11 });

  // ---- foliage built here: ferns (arching fronds of paired pinnae) and cast-iron plants (broad strap leaves on stalks), from the
  // palm's leaflet set: each blade's midrib down the middle of one leaflet row
  const leafG = (pos, uv, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  // a blade from base point B along D (unit), its face normal N: length ln, half-width hw(t), drooping dr, folded by fold; row li
  const blade = (pos, uv, idx, B, D, N, ln, wd, dr, fold, li, nk, ou) => { const Wv = V().crossVectors(D, N).normalize(), b0 = pos.length / 3;
    for (let k = 0; k <= nk; k++) { const t = k / nk, hw = wd * Math.min(1, .3 + 3 * t) * Math.pow(1 - t, .6), c = B.clone().addScaledVector(D, ln * t).addScaledVector(V(0, 1, 0), -dr * t * t);
      for (const a of [-1, 0, 1]) { const q = c.clone().addScaledVector(Wv, a * hw * Math.cos(fold)).addScaledVector(N, Math.abs(a) * hw * Math.sin(fold)); pos.push(q.x, q.y, q.z); uv.push(ln * t + ou, (li + .01 + .49 * (a + 1)) / 24); } }
    for (let k = 0; k < nk; k++) for (let a = 0; a < 2; a++) { const v = b0 + k * 3 + a; idx.push(v, v + 3, v + 1, v + 1, v + 3, v + 4); } };
  function fern(x, y, zc, o = {}) {
    const pos = [], uv = [], idx = [], n = o.n ?? 14, Lm = o.len ?? .6;
    for (let k = 0; k < n; k++) { const az = k * 2.39996 + R() * .4, a = k / n, hz = V(Math.sin(az), 0, Math.cos(az)), ln = Lm * (.65 + .35 * R()), el = lerp(1.2, .45, a) + (R() - .5) * .2, bend = lerp(.9, 1.9, a);
      const pts = []; let p = V(x, y, zc).addScaledVector(hz, .02);
      for (let i = 0; i < 12; i++) { pts.push(p.clone()); const th = el - bend * Math.pow(i / 11, 1.3); p = p.clone().addScaledVector(hz, Math.cos(th) * ln / 11).addScaledVector(V(0, 1, 0), Math.sin(th) * ln / 11); }
      const curve = new THREE.CatmullRomCurve3(pts); add(Lf, new THREE.TubeGeometry(curve, 12, .0022, 4), true);
      const sd = V().crossVectors(hz, V(0, 1, 0)).normalize(), li = 8 + Math.floor(R() * 4) - (a > .8 ? 4 : 0);
      for (let s = .12; s < .97; s += .058) { const P0 = curve.getPointAt(s), T = curve.getTangentAt(s), N0 = V().crossVectors(sd, T).normalize(); if (N0.y < 0) N0.negate();
        const pl = ln * (.05 + .17 * Math.sin(PI * Math.pow((s - .12) / .85, .75))) * (.85 + .3 * R());
        for (const sg of [-1, 1]) { const D = T.clone().multiplyScalar(.45).addScaledVector(sd, sg).addScaledVector(N0, .1).normalize(); blade(pos, uv, idx, P0, D, N0, pl, pl * .2, pl * .25, .35, li, 1, R() * 3); } } }
    add(Lf, leafG(pos, uv, idx), true);
  }
  function castIronPlant(x, y, zc, o = {}) {
    const pos = [], uv = [], idx = [], n = o.n ?? 9, Lm = o.len ?? .5;
    for (let k = 0; k < n; k++) { const az = k * 2.39996 + R() * .5, a = k / n, hz = V(Math.sin(az), 0, Math.cos(az)), el = lerp(1.35, .75, a) + (R() - .5) * .2, sl = Lm * (.35 + .2 * R());
      const B = V(x, y, zc).addScaledVector(hz, .015), D0 = hz.clone().multiplyScalar(Math.cos(el)).addScaledVector(V(0, 1, 0), Math.sin(el)), E = B.clone().addScaledVector(D0, sl);
      add(Lf, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([B, B.clone().lerp(E, .5).addScaledVector(hz, .01), E]), 6, .004, 5), true);
      const D = hz.clone().multiplyScalar(Math.cos(el - .5)).addScaledVector(V(0, 1, 0), Math.sin(el - .5)).normalize(), N = V().crossVectors(V().crossVectors(D, V(0, 1, 0)), D).normalize();
      blade(pos, uv, idx, E, D, N.y < 0 ? N.negate() : N, Lm * (.8 + .4 * R()), .05 + .02 * R(), Lm * (.25 + .3 * a), .5, 8 + Math.floor(R() * 4), 5, R() * 3); }
    add(Lf, leafG(pos, uv, idx), true);
  }
  const pot = (x, y, zc, r, h, planted, tilt = 0, ry = 0) => { // a hand-thrown terracotta pot: rolled rim, a drainage hole; soil if planted
    const g = lathe([[r * .62, 0], [r * .66, .004], [r * .68, .012], [r * .97, h * .8], [r * 1.03, h * .81], [r * 1.06, h * .86], [r * 1.065, h * .97], [r * 1.04, h], [r * .96, h], [r * .935, h * .97], [r * .92, h * .84], [r * .6, .03], [r * .12, .03], [r * .1, .002]], 24);
    if (tilt) g.rotateX(tilt).translate(0, r * .97 * Math.sin(tilt) * 0 + r * 1.05 * Math.sin(Math.abs(tilt)) * .9, 0);
    add(Tc, g.rotateY(ry).translate(x, y, zc)); if (planted) add(Soil, lathe([[r * .93, h * .84], [r * .5, h * .86], [0, h * .87]], 24).translate(x, y, zc)); };

  // planting in the beds: ferns and cast-iron plants under the palms
  for (const [x, zc, f] of [[843.2, -602.7, 1], [844.6, -602.4, 0], [848.3, -602.8, 1], [849.0, -602.3, 0], [832.5, -597.3, 1], [833.5, -596.95, 0], [835.6, -597.5, 1], [836.9, -597.1, 0], [843.3, -597.3, 0], [844.6, -597.6, 1], [845.6, -596.95, 1], [848.6, -597.6, 0]])
    f ? fern(x, soilY(zc) + .01, zc, { n: 13, len: .7 + .2 * R() }) : castIronPlant(x, soilY(zc) + .01, zc, { n: 11, len: .55 });

  // ---- tiered staging: three slatted tiers of weathered timber on posts and bearers, pots along each
  { const x1 = 831.6, x2 = 837.6, tiers = [[-602.8, -602.45, .75], [-603.15, -602.8, .95], [-603.5, -603.15, 1.15]];
    for (const [z1, z2, top] of tiers) {
      for (let i = 0; i < 3; i++) { const zc = z1 + .0585 + i * .117; add(Wd, cbox(x2 - x1, .022, .095, .003).translate((x1 + x2) / 2, top - .011, zc)); }
      for (let x = x1 + .04; x < x2; x += .99) add(Wd, cbox(.045, .07, z2 - z1 - .01, .004).translate(Math.min(x, x2 - .04), top - .057, (z1 + z2) / 2));
      for (const x of [x1 + .04, 833.6, 835.6, x2 - .04]) { add(Wd, cbox(.055, top - .022, .055, .005).translate(x, (top - .022) / 2, z2 - .035)); if (z1 < -603.4) add(Wd, cbox(.055, top - .022, .055, .005).translate(x, (top - .022) / 2, z1 + .035)); }
      bar(Wd, [x1 + .04, .15, z2 - .06], [x2 - .04, .15, z2 - .06], .04, .025, [0, 0, 1]); // a low rail tying the posts
      solid(x1, 0, z1, x2, top, z2);
      for (let x = x1 + .25; x < x2 - .1; x += .42 + .1 * R()) { const r = .07 + .04 * R(), h = r * 1.7, zc = (z1 + z2) / 2 + (R() - .5) * .06, u = R();
        if (u < .12) continue; pot(x, top, zc, r, h, u > .25); if (u > .25) (u > .6 ? fern(x, top + h * .87, zc, { n: 9, len: .32 + .1 * R() }) : castIronPlant(x, top + h * .87, zc, { n: 7, len: .28 })); }
    }
  }
  // ---- garden things: two benches facing the basin, the kit's potted canes, stacks of empty pots, a can, a hose on a wall reel
  parkBench(z, X0, 0, -602.42, 0); parkBench(z, X0, 0, -597.58, PI);
  pottedPlant(z, 841.9, 0, -601.6, .6); pottedPlant(z, 838.2, 0, -598.35, 2.2);
  for (const [x, zc, nS, r] of [[830.42, -602.9, 7, .1], [830.75, -603.25, 5, .12], [830.4, -603.3, 3, .085]]) { for (let i = 0; i < nS; i++) pot(x + (R() - .5) * .006, i * r * .32, zc + (R() - .5) * .006, r, r * 1.7, false, 0, R() * 6); round(x, zc, r * 1.05, 0, nS * r * .32 + r * 1.4); }
  pot(831.05, 0, -602.55, .09, .15, false, 1.45, .7); pot(830.95, 0, -602.2, .07, .12, false, 1.5, 2.6); // two on their sides
  { const x = 830.62, zc = -596.95, ry = .5, A = (m, g) => add(m, put(g, x, 0, zc, ry)); // a galvanised can: oval body, riveted seams' bands, a long spout with its rose, a bow handle
    A(Gal, lathe([[0, .003], [.1, .003], [.106, .01], [.104, .025], [.1, .03], [.1, .27], [.104, .275], [.104, .285], [.09, .29], [.06, .3], [0, .302]], 40).scale(1, 1, .72));
    for (const y of [.03, .15, .27]) A(Gal, ring(.101, .003, PI * 2, 40).rotateX(PI / 2).scale(1, 1, .72).translate(0, y, 0));
    A(Gal, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(.08, .05, 0), V(.2, .16, 0), V(.33, .34, 0), V(.38, .4, 0)]), 16, .012, 10));
    A(Gal, lathe([[.012, 0], [.02, .02], [.035, .045], [.036, .05], [0, .051]], 20).rotateZ(-.9).translate(.38, .4, 0));
    A(Gal, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-.095, .12, 0), V(-.13, .3, 0), V(-.05, .42, 0), V(.05, .4, 0), V(.07, .3, 0)]), 24, .009, 8));
    round(x, zc, .14, 0, .3); }
  { const zc = -597.25, y = .92; // a wall reel: a cast bracket bolted to the wall, a drum between two flanges, the hose wound on and run off to the bed
    add(Reel, cbox(.02, .34, .12, .006).translate(830.01, y - .05, zc)); bar(Reel, [830.02, y - .2, zc], [830.06, y, zc], .04, .03);
    for (const x of [830.07, 830.41]) { add(Reel, new THREE.CylinderGeometry(.22, .22, .012, 40).rotateZ(PI / 2).translate(x, y, zc)); add(Reel, ring(.22, .007, PI * 2, 40).rotateY(PI / 2).translate(x, y, zc)); for (let k = 0; k < 6; k++) add(Reel, cbox(.018, .2, .025, .004).translate(0, .11, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(k * PI / 3)).translate(x + (x < 830.2 ? .01 : -.01), y, zc)); }
    rod(Reel, [830.07, y, zc], [830.41, y, zc], .06, 24); rod(Reel, [830.4, y + .17, zc], [830.5, y + .17, zc], .012, 10); rod(Reel, [830.47, y + .17, zc], [830.56, y + .17, zc], .018, 12);
    for (let l = 0; l < 4; l++) for (let k = 0; k < 13; k++) add(Hose, ring(.075 + l * .024, .0115, PI * 2, 28, 6).rotateY(PI / 2).translate(830.095 + k * .0243 + (l % 2) * .012, y, zc));
    add(Hose, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(830.24, y - .17, zc), V(830.3, y - .5, zc + .05), V(830.45, .03, zc + .1), V(830.9, .012, zc + .25), V(831.3, .012, zc - .35), V(831.25, .012, -598.4), V(831.6, .015, -598.6), V(832.4, .35, -598.2), V(832.6, .5, -597.95)]), 120, .012, 10));
    solid(830, 0, zc - .24, 830.45, y + .24, zc + .24); }
  // sconces either side of the door, the only lamps: warm against the cool east end
  for (const zc of [Z0 - 1.05, Z0 + 1.05]) sconce(z, 830.0, 1.9, zc, PI / 2, { power: 7 });
  // a few leaves fallen on the path and the apron
  { const pos = [], uv = [], idx = [];
    for (let k = 0; k < 34; k++) { const t = R(), x = 831 + 18 * R(), zz = Z0 + (R() - .5) * 1.4, az = R() * 6.3, D = V(Math.cos(az), .0, Math.sin(az)); if (inApron(x, zz, 1.45)) continue;
      blade(pos, uv, idx, V(x, .012, zz), D, V(0, 1, 0), .12 + .1 * t, .02 + .01 * R(), -.012, .25 + .3 * R(), [3, 7, 11][k % 3], 4, .4925 - .2); }
    add(Lfd, leafG(pos, uv, idx), true); }
}
