// The hotel hallway behind where you start.
import * as THREE from 'three';
import { dry, zones, defZone } from '../core.js';
import { hotelTex } from '../tex.js';
import { dirt, P, M, sign, voidMat } from '../mat.js';
import { add, block, box, solid, round, turned, put, spot, solidAt, portal, via, lit, flats, RoundedBoxGeometry } from '../build.js';
import { door } from '../props/metalwork.js';
import { sconce, opalPanel, volume } from '../props/lights.js';
import { mallBench, pottedPlant } from '../props/garden.js';
import { skirting } from '../props/structure.js';

// A door leaf standing open in a frame placed by door(z, x, 0, zc, ry): hinged on the frame's -x jamb, swung `by` radians toward the frame's front.
// The shut leaves' own materials (door() in props/metalwork.js); K the dark keyway, Br the viewer.
function openLeaf(z, x, zc, ry, by, K, Br, y = 0) {
  const Lf = M(z, 'veneer', { swap: 1 }), St = M(z, 'brushedSteel');
  const at = g => put(g.rotateY(-by).translate(-.5095, 0, -.0295), x, y, zc, ry); // the leaf is built hinge at 0, along +x, its push face at -z
  const lt = .045, mz = -.0295, cx = .9625;
  add(Lf, at(new RoundedBoxGeometry(1.026, 2.228, lt, 2, .004).translate(.5095, 1.12, mz)));
  add(St, at(new THREE.BoxGeometry(.0025, .235, .024).translate(1.0232, 1.05, mz))); // lock face plate on the leaf edge
  for (const sd of [1, -1]) { const fz = mz + sd * lt / 2; // lever handles on roses both sides, a cylinder escutcheon below
    add(St, at(new THREE.CylinderGeometry(.026, .0265, .009, 24).rotateX(Math.PI / 2).translate(cx, 1.05, fz + sd * .0045)));
    add(St, at(new THREE.CylinderGeometry(.0095, .0095, .056, 16).rotateX(Math.PI / 2).translate(cx, 1.05, fz + sd * .034)));
    add(St, at(new RoundedBoxGeometry(.13, .02, .022, 2, .007).translate(cx - .055, 1.05, fz + sd * .062)));
    add(St, at(new RoundedBoxGeometry(.02, .02, .04, 2, .007).translate(cx - .11, 1.05, fz + sd * .047)));
    add(St, at(new THREE.CylinderGeometry(.021, .023, .007, 20).rotateX(Math.PI / 2).translate(cx, .978, fz + sd * .0035)));
    add(K, at(new THREE.BoxGeometry(.004, .016, .001).translate(cx, .978, fz + sd * .0075))); // its keyway
  }
  add(St, at(new THREE.BoxGeometry(.926, .25, .0012).translate(.5095, .14, mz - lt / 2 - .0006))); // kick plate on the push face
  add(Br, at(new THREE.LatheGeometry([[0, .009], [.009, .009], [.011, .007], [.0115, .003], [.0115, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 24).rotateX(-Math.PI / 2).translate(.5095, 1.52, mz - lt / 2))); // the door viewer
  const c = Math.cos(by), s = Math.sin(by), [a, b] = spot(x, zc, ry, -.5095 + .5095 * c - mz * s, -.0295 + .5095 * s + mz * c);
  turned(a, b, .513, .023, ry - by, y, y + 2.24); // the leaf is solid where it stands
}

// Engraved lettering (room numbers, row letters): one canvas atlas and one material a zone, a cell per text. Returns (i, w, h) => the
// i-th cell as a plane (w:h = 2:1) to add() with its own UVs, laid a hair proud of the plate it sits on.
export function lettering(z, texts) {
  const n = texts.length, c = document.createElement('canvas'), g = c.getContext('2d'); c.width = 256; c.height = 128 * n;
  g.fillStyle = '#fff'; g.font = '600 96px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  texts.forEach((t, i) => g.fillText(t, 128, 128 * i + 70, 236));
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const m = P(z, { map, alphaTest: .5, color: 0x1c140c, roughness: .55, metalness: .4 });
  return (i, w, h) => { const q = new THREE.PlaneGeometry(w, h), uv = q.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / n); return [m, q]; };
}

// A moulding run along z on a wall face at x = f, looking +x (k 1) or -x (k -1): `prof` is [out, up] in metres, z1..z2 its length.
const moulding = (mat, prof, f, y, z1, z2, k) => {
  const s = new THREE.Shape(prof.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(s, { depth: z2 - z1, bevelEnabled: false, curveSegments: 4 });
  add(mat, k > 0 ? g.translate(f, y, z1) : g.rotateY(Math.PI).translate(f, y, z2));
};
const DADO = [[0, -.035], [.011, -.035], [.016, -.028], [.016, -.018], [.012, -.012], [.02, -.004], [.024, .006], [.02, .016], [.012, .02], [.012, .026], [0, .03]];
const PICTURE = [[0, -.022], [.006, -.022], [.016, -.012], [.02, -.002], [.017, .006], [.012, .008], [.012, .016], [0, .02]];

defZone('hT', { music: 'hotel', ...dry, step: 'carpet', grp: 'm', k: 1, exp: .34, fog: [.3, .2, .12, .004], bloom: .3, wet: .1, hum: .3, box: [2.4, 21.4, 5.2, 51.6], probe: [3.8, 1.5, 36], env: [[2.4, 0, 21.4], [5.2, 2.8, 51.6]] });
const gates = {}; // the hallway's two openable doors onto the vestibule, by wall (1 west, -1 east)
const links = {}; // its openable doors onto the gallery and the lift lobby (below), by wall times z: 27.6 the west door 27.6, -27.6 the east
const LINK = { 1: [27.6, 31.2, 38.4], '-1': [27.6] }; // west 27.6 and east 27.6 open on the gallery, west 38.4 and 31.2 on the lift lobby
{ // hotel hallway x[2.6,5] z[21.4,51.6], through a door behind where you start: patterned carpet, damask above dark stained boarding to a
  // dado rail, a picture rail, numbered room doors in their frames, a sconce between each pair, opal panels down the ceiling
  const z = zones.hT, h = 2.8, C = P(z, { map: hotelTex.map, normalMap: hotelTex.normalMap, ...dirt });
  const W = M(z, 'damask', { color: 0xe0cba0 }), Pl = M(z, 'plaster', { color: 0xe9dcc0 }), Wd = M(z, 'hardwood', { color: 0x6a4030, swap: 1 });
  const Rl = M(z, 'gelcoat', { color: 0x4a2c1e, wear: 0, roughness: .3, macro: .05 }), Br = M(z, 'brass', { roughness: .3, dirt: .6 }), K = P(z, { color: 0x050403, roughness: 1 });
  const OPEN = [42, 45.6, 49], LEAF = 1.5, GATE = { 1: 34.8, '-1': 38.4 }; // the room doors standing open on the passages to the far-off places (zones/passages.js), and how far; GATE: the west and east doors open on the vestibule
  const nums = [], txt = lettering(z, Array.from({ length: 13 }, (_, i) => String(301 + i)));
  box(C, 2.2, -.2, 21.4, 5.4, 0, 51.6); box(Pl, 2.2, h, 21.4, 5.4, h + .2, 51.6); box(W, 2.6, 2.24, 51.55, 5, h, 51.75);
  const later = [];
  for (const [x1, x2, f, k, gap, doors] of [[2.2, 2.6, 2.6, 1, 45, [24, 27.6, 31.2, 34.8, 38.4, 49]], [5, 5.4, 5, -1, 31, [24, 27.6, 34.8, 38.4, 42, 45.6, 49]]]) { // west wall (way to the mall), east wall (way to the cinema)
    const ry = k * Math.PI / 2, ops = [...doors.map(d => [d, 1]), [gap, 0]].sort((a, b) => a[0] - b[0]);
    const plate = c => { // the room number on a brass plate on the wall by the latch
      add(Br, put(new RoundedBoxGeometry(.17, .095, .008, 2, .003).translate(.74, 1.5, .004), f, 0, c, ry));
      const [m, q] = txt(nums.length, .15, .075); nums.push(c); add(m, put(q.translate(.74, 1.5, .0095), f, 0, c, ry), true);
      for (const sx of [-.072, .072]) add(Br, put(new THREE.SphereGeometry(.004, 10, 4, 0, 2 * Math.PI, 0, Math.PI / 2).scale(1, 1, .5).rotateX(Math.PI / 2).translate(.74 + sx, 1.5, .008), f, 0, c, ry));
    };
    let z0 = 21.4;
    for (const [c, isDoor] of ops) { // the wall round each 1.0 x 2.24 m opening; a room door's opening is shut by its leaf and a dark backing
      box(W, x1, 0, z0, x2, h, c - .5); box(W, x1, 2.24, c - .5, x2, h, c + .5); z0 = c + .5;
      if (isDoor && LINK[k].includes(c)) { later.push([k * c, f - k * .05, c, -ry]); plate(c); continue; } // onto the gallery or the lobby: turned round as the vestibule's, built after the loop (the vestibule's two stay doors[0] and [1])
      const open = isDoor && k < 0 && OPEN.includes(c), gate = isDoor && (GATE[k] === c || k < 0 && c === 24), shut = isDoor && !open && !gate; // gate: open on the vestibule (below), its leaf swung in there
      if (shut) { solid(x1, 0, c - .5, x2, 2.24, c + .5); block(K, k > 0 ? x1 : x2 - .2, 0, c - .5, k > 0 ? x1 + .2 : x2, 2.24, c + .5); }
      // an open door's frame is turned round so its hinge jamb is the north one: the leaf then stands where the hallway, walked from the
      // south as you come in, looks through the opening (hinged on the south, it hid behind that jamb)
      if (gate) { const d = door(z, f - k * .05, 0, c, -ry, { openable: true, leafMat: M(z, 'veneer', { swap: 1 }), frame: 0xd8ccb4 }); if (GATE[k] === c) gates[k] = d; } // turned round (hinged north); double-acting, it swings away from whoever opens it, its copy in the vestibule (below) with it; east door 24's copy is in the baths' passage (zones/baths.js, found in build.js's doors)
      else door(z, f - k * .05, 0, c, open ? -ry : ry, shut ? { leafMat: M(z, 'veneer', { swap: 1 }), frame: 0xd8ccb4 } : { leaf: false, frame: 0xd8ccb4 });
      if (open) { // the leaf on the frame's knuckles, swung into the passage along its north side; the wall's back lined dark (the warm light from beyond is the passage's: zones/passages.js)
        openLeaf(z, f - k * .05, c, -ry, LEAF, K, Br);
        for (const [a1, a2, y1] of [[c - .7, c - .5, 0], [c + .5, c + .7, 0], [c - .5, c + .5, 2.24]]) block(voidMat, x2, y1, a1, x2 + .02, 2.4, a2);
      }
      if (shut) add(Br, put(new THREE.LatheGeometry([[0, .009], [.009, .009], [.011, .007], [.0115, .003], [.0115, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 24).rotateX(Math.PI / 2).translate(0, 1.52, -.05 + .0225), f, 0, c, ry)); // the door viewer
      if (shut) add(K, put(new THREE.CircleGeometry(.005, 16).translate(0, 1.52, -.05 + .0225 + .0092), f, 0, c, ry));
      if (isDoor) plate(c);
    }
    box(W, x1, 0, z0, x2, h, 51.6);
    // boarding, rails and skirting between the door frames (each 1.2 m wide)
    const cuts = ops.map(([c]) => [c - .61, c + .61]), runs = []; let a = 21.4;
    for (const [c1, c2] of cuts) { if (c1 > a + .05) runs.push([a, c1]); a = c2; } runs.push([a, 51.55]);
    for (const [r1, r2] of runs) {
      block(Wd, k > 0 ? f : f - .012, 0, r1, k > 0 ? f + .012 : f, .9, r2);
      moulding(Rl, DADO, f + k * .012, .9, r1, r2, k); moulding(Rl, PICTURE, f, 2.38, r1, r2, k);
      skirting(z, k > 0 ? [[f + .012, 0, r1], [f + .012, 0, r2]] : [[f - .012, 0, r2], [f - .012, 0, r1]], { color: 0x3a2318 });
    }
    // a sconce between each pair of openings, 1.75 m up
    for (let i = 0; i + 1 < ops.length; i++) sconce(z, f, 1.75, (ops[i][0] + ops[i + 1][0]) / 2, ry);
  }
  for (const [key, x, c, ry] of later) links[key] = door(z, x, 0, c, ry, { openable: true, leafMat: M(z, 'veneer', { swap: 1 }), frame: 0xd8ccb4 });
  for (const zc of [24.6, 30.6, 36.6, 42.6, 48.6]) opalPanel(z, 3.8, h, zc, 0, { w: .6, l: .6, power: 50 });
  sign('EXIT', 3.8, 2.6, 51.54, Math.PI, .6, .22, '#8fffc0', '#021a0c');
}

// A run of moulding `prof` ([out, up] in metres) along a wall face from a to b ([x, z]), the room on its left; mitred at an inside corner (m0, m1) turning by 2 atan(t) (t 1: square)
const run = (mat, prof, a, b, y, m0, m1, t = 1) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), d = new THREE.Vector3(dx / L, 0, dz / L), o = new THREE.Vector3(d.z, 0, -d.x);
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(prof.map(([u, v]) => new THREE.Vector2(u, v))), { depth: L, bevelEnabled: false, curveSegments: 4 }), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i), w = p.getZ(i); if (m1 && w > L - 1e-5) p.setZ(i, w - u * t); if (m0 && w < 1e-5) p.setZ(i, w + u * t); }
  g.computeVertexNormals(); add(mat, g.applyMatrix4(new THREE.Matrix4().makeBasis(o, new THREE.Vector3(0, 1, 0), d)).translate(a[0], y, a[1]));
};
const COVE = [[0, -.12], [.009, -.12], [.013, -.112], [.02, -.108], ...Array.from({ length: 9 }, (_, i) => { const t = Math.PI - i / 8 * Math.PI / 2; return [.108 + .086 * Math.cos(t), -.108 + .086 * Math.sin(t) + .002]; }), [.112, -.014], [.12, -.008], [.12, 0], [0, 0]];
// The vestibule: a small sitting room the hallway's west door 34.8 and east door 38.4 both open into, although the hallway lies between
// them. Built far off at x 300..304, z 300..303.6 and joined to the two doors by portals (build.js portal(), docs/building.md): in through
// the west door you face its north wall; its west door leads out of the east door of the hallway, still walking west. Hardwood floor and a
// rug, dark boarding to a dado rail, an old-rose damask above, a picture rail and a coved cornice; two lit sconces and a dim opal panel
// over the middle for pools of warm light and dark corners; a bench under the sconces and a plant in the corner.
const Y = -200; // the vestibule's floor: portal-only rooms stand 200 m down, under the sea, where no eye outside them can see them (docs/building.md, Portals)
// A dark shell, faced inward, round each room down here and past its far portal planes: never seen (behind the walls and the planes),
// never solid; an eye tools/pvs.mjs stands inside a wall or past a plane sees only it, not the other rooms down here
const shell = (x1, z1, x2, z2, h) => { const g = new THREE.BoxGeometry(x2 - x1, h + .3, z2 - z1).translate((x1 + x2) / 2, Y - .3 + (h + .3) / 2, (z1 + z2) / 2), ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } add(voidMat, g); };
defZone('hV', { music: 'hotel', ...dry, step: 'carpet', grp: 'm', k: .8, exp: .34, fog: [.3, .2, .12, .004], bloom: .3, wet: .05, hum: .2, box: [299.3, 299.3, 304.1, 303.9], probe: [301.9, Y + 1.4, 301.9], env: [[300, Y, 300], [303.8, Y + 2.8, 303.6]] });
{
  const z = zones.hV, X1 = 300, X2 = 303.8, Z1 = 300, Z2 = 303.6, h = 2.8, T = .7, AX = 302.8, BZ = 301.6, DV = .65; // the room's inside; T: its walls (the south and west 0.65 m deep to the door: the door's frame is the portal's plane); A: the south door's middle, B: the west door's
  const Fl = M(z, 'hardwood', { color: 0x6e4630 }), Rg = M(z, 'hotelCarpet', { color: 0x8a5a48 }), W = M(z, 'damask', { color: 0xd2a888 }), Pl = M(z, 'plaster', { color: 0xe6d6b8 });
  const Wd = M(z, 'hardwood', { color: 0x4e2e20, swap: 1 }), Rl = M(z, 'gelcoat', { color: 0x3e2418, wear: 0, roughness: .3, macro: .05 }), Br = M(z, 'brass', { roughness: .3, dirt: .6 }), K = P(z, { color: 0x050403, roughness: 1 });
  box(Fl, X1 - T, Y - .2, Z1 - T, X2 + T, Y, Z2 + T); flats.push([X1 - T, Z1 - T, X2 + T, Z2 + T, () => Y]); // the floor's height (floorH is 0 where no flat says otherwise)
  box(Pl, X1 - T, Y + h, Z1 - T, X2 + T, Y + h + .2, Z2 + T);
  block(Rg, 300.55, Y, 301.25, 302.15, Y + .005, 303.05); // the rug, under the bench's front
  // the walls, each round its 1.0 x 2.24 opening: south (door A), west (door B), north, east
  box(W, X1 - T, Y, Z1 - T, AX - .5, Y + h, Z1); box(W, AX + .5, Y, Z1 - T, X2 + T, Y + h, Z1); box(W, AX - .5, Y + 2.24, Z1 - T, AX + .5, Y + h, Z1);
  box(W, X1 - T, Y, Z1, X1, Y + h, BZ - .5); box(W, X1 - T, Y, BZ + .5, X1, Y + h, Z2); box(W, X1 - T, Y + 2.24, BZ - .5, X1, Y + h, BZ + .5);
  box(W, X1 - T, Y, Z2, X2 + T, Y + h, Z2 + T); box(W, X2, Y, Z1, X2 + T, Y + h, Z2);
  // each opening's one door stands in the hallway's frame, which is the portal's plane; here its copy at the linked place, deep in the
  // reveal (one leaf in both spaces, docs/building.md, Portals), and a plain frame cased round the opening's room face
  const G = { openable: true, leafMat: M(z, 'veneer', { swap: 1 }), frame: 0xd8ccb4 };
  const [wA] = portal([2.55, 0, 34.8, Math.PI / 2], [AX, Y, Z1 - DV, 0], 1, 2.24, gates[1]); // the hallway's west door 34.8 is the south door
  wA.to.door = door(z, ...via(wA, 2.55, 0, 34.8, -Math.PI / 2), { ...G, copy: gates[1] });
  const [eA] = portal([5.05, 0, 38.4, -Math.PI / 2], [X1 - DV, Y, BZ, Math.PI / 2], 1, 2.24, gates[-1]); // and its east door 38.4 the west door
  eA.to.door = door(z, ...via(eA, 5.05, 0, 38.4, Math.PI / 2), { ...G, copy: gates[-1] });
  shell(297.6, 297.6, 305, 304.6, 3.3);
  door(z, AX, Y, Z1 - .05, Math.PI, { leaf: false, pivot: true, frame: 0xd8ccb4 }); door(z, X1 - .05, Y, BZ, -Math.PI / 2, { leaf: false, pivot: true, frame: 0xd8ccb4 });
  // a slim surface downlight in the middle of each reveal's soffit (2 mm below it: the leaf's top clears it by 4), a brass ring round an opal
  // lens, washing the leaf and the reveal so the doorway reads lit from the room and from the hallway through it
  for (const [x, zc] of [[AX, Z1 - DV / 2], [X1 - DV / 2, BZ]]) {
    add(Br, new THREE.LatheGeometry([[.046, 0], [.047, -.0012], [.046, -.002], [.036, -.002], [.036, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 32).translate(x, Y + 2.24, zc));
    add(M(null, 'opalPanel'), new THREE.CircleGeometry(.0365, 32).rotateX(Math.PI / 2).translate(x, Y + 2.24 - .0015, zc), true);
    lit(z, x, Y + 2.2, zc, 14, [x, Y, zc], 1.25, 6, 0xffcf98);
  }
  // the wall runs between the corners and the doors' frames (1.2 m wide), as [from, to, mitre at start, at end]
  const corner = [[X1, Z1], [X1, Z2], [X2, Z2], [X2, Z1]], runs = [[[X1, BZ + .61], corner[1], 0, 1], [corner[1], corner[2], 1, 1], [corner[2], corner[3], 1, 1], [corner[3], [AX + .61, Z1], 1, 0], [[AX - .61, Z1], corner[0], 0, 1], [corner[0], [X1, BZ - .61], 1, 0]];
  for (const [a, b, m0, m1] of runs) {
    const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]), ox = dz * .012, oz = -dx * .012; // the boarding's face, 12 mm into the room
    const [x1, x2] = [a[0], b[0]].sort((p, q) => p - q), [z1, z2] = [a[1], b[1]].sort((p, q) => p - q);
    block(Wd, Math.min(x1, x1 + ox), Y, Math.min(z1, z1 + oz), Math.max(x2, x2 + ox), Y + .9, Math.max(z2, z2 + oz));
    const a2 = [a[0] + ox, a[1] + oz], b2 = [b[0] + ox, b[1] + oz];
    run(Rl, DADO, a2, b2, Y + .9, m0, m1); run(Rl, PICTURE, a, b, Y + 2.38, m0, m1); run(Pl, COVE, a, b, Y + h, m0, m1);
    skirting(z, [[a2[0], Y, a2[1]], [b2[0], Y, b2[1]]], { color: 0x3a2318 });
  }
  // light: two sconces lit over the bench on the north wall, a dim opal panel in the middle of the ceiling
  for (const x of [300.85, 302.95]) sconce(z, x, Y + 1.75, Z2, Math.PI, { power: 26 });
  opalPanel(z, 301.9, Y + h, 301.8, 0, { w: .6, l: .6, power: 28 });
  mallBench(z, 301.4, Y, Z2 - .42, Math.PI); pottedPlant(z, X2 - .42, Y, Z2 - .42, -.6);
}

// ---- The gallery and the lift lobby: two more rooms behind the hallway's doors, 200 m down like the vestibule, each joined to two doors ----
// by portals. Shared: the door's copy through its portal (docs/building.md, Portals), a slim downlight in a reveal's soffit (as the vestibule's).
const linkDoor = (z, [hx, hz, hry], far, key) => { // hx, hz, hry: the hallway end (its frame's middle, facing the hallway); far: [x, y, z, ry] of the room's
  const [e] = portal([hx, 0, hz, hry], far, 1, 2.24, links[key]);
  e.to.door = door(z, ...via(e, hx, 0, hz, hry + Math.PI), { openable: true, leafMat: M(z, 'veneer', { swap: 1 }), frame: 0xd8ccb4, copy: links[key] });
};
const downlight = (z, Br, x, y, zc) => { // y: the soffit
  add(Br, new THREE.LatheGeometry([[.046, 0], [.047, -.0012], [.046, -.002], [.036, -.002], [.036, 0]].map(([r, v]) => new THREE.Vector2(r, v)), 32).translate(x, y, zc));
  add(M(null, 'opalPanel'), new THREE.CircleGeometry(.0365, 32).rotateX(Math.PI / 2).translate(x, y - .0015, zc), true);
  lit(z, x, y - .04, zc, 14, [x, y - 2.24, zc], 1.25, 6, 0xffcf98);
};
const lathe = (pts, n = 32) => new THREE.LatheGeometry(pts.map(([r, v]) => new THREE.Vector2(r, v)), n); // pts bottom to top: seen from outside
const inward = g => { const ix = g.index.array, n = g.attributes.normal; // turn a surface to be seen from inside
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); return g; };
const wallUV = g => { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; // metres along each face, whatever its turn (own UVs, uv: [1, 1])
  for (let i = 0; i < p.count; i++) { const nx = n.getX(i), nz = n.getZ(i), l = Math.hypot(nx, nz);
    if (l < .5) uv.setXY(i, p.getX(i), p.getZ(i)); else uv.setXY(i, (p.getX(i) * nz - p.getZ(i) * nx) / l, p.getY(i)); } return g; };

// A frosted globe on a brass rod from a ceiling rose: top the ceiling's height, gy the globe's middle. Lit just under the globe, aimed down.
function pendant(z, Br, glass, x, top, zc, gy, power) {
  add(Br, lathe([[0, -.05], [.012, -.05], [.014, -.04], [.022, -.034], [.045, -.026], [.06, -.016], [.066, -.006], [.065, .01], [0, .01]], 40).translate(x, top, zc)); // the rose, sunk into the vault's curve
  add(Br, new THREE.CylinderGeometry(.006, .006, top - .05 - (gy + .16), 12).translate(x, (top - .05 + gy + .16) / 2, zc)); // the rod
  add(Br, lathe([[.006, .16], [.016, .162], [.02, .168], [.016, .175], [.006, .176]], 24).translate(x, gy, zc)); // its collar on the fitter
  add(Br, lathe([[.047, .122], [.056, .126], [.059, .136], [.057, .148], [.05, .154], [.03, .158], [.014, .16], [0, .162]], 40).translate(x, gy, zc)); // the fitter cup over the globe's neck
  for (let k = 0; k < 3; k++) add(Br, new THREE.CylinderGeometry(.003, .003, .012, 8).rotateZ(Math.PI / 2).translate(.062, .138, 0).rotateY(k * 2 * Math.PI / 3).translate(x, gy, zc)); // its gallery screws
  add(glass, new THREE.SphereGeometry(.14, 48, 32, 0, 2 * Math.PI, .34, Math.PI - .34).translate(x, gy, zc), true);
  add(glass, lathe([[.0465, .126], [.049, .128], [.049, .133], [.0465, .135]], 32).translate(x, gy, zc)); // the globe's rolled neck
  round(x, zc, .14, gy - .14, gy + .14);
  lit(z, x, gy - .17, zc, power, [x, gy - 2.45, zc], 1.45, 7, 0xffcf98);
}

// An upholstered gallery bench, front +z: a buttoned velvet top on a dark walnut apron, four turned legs in brass sabots.
function galleryBench(z, x, y, zc, ry) {
  const Wd = M(z, 'hardwood', { color: 0x3a2216 }), Vv = M(z, 'velvet', { color: 0x5e2622, sheen: 1 }), Bs = M(z, 'brass', { roughness: .3, dirt: .6 });
  const A = (m, g, own) => add(m, put(g, x, y, zc, ry), own), L = 1.3, D = .42;
  A(Vv, new RoundedBoxGeometry(L, .11, D, 4, .04).translate(0, .41, 0));
  for (let i = 0; i < 4; i++) for (const bz of [-.09, .09]) A(Vv, new THREE.SphereGeometry(.012, 12, 6).scale(1, .45, 1).translate(-.48 + i * .32, .463, bz)); // buttons, sunk in the pile
  for (const sz of [-1, 1]) A(Wd, new RoundedBoxGeometry(L - .05, .07, .024, 2, .005).translate(0, .32, sz * (D / 2 - .028)), true); // the apron's long rails
  for (const sx of [-1, 1]) A(Wd, new RoundedBoxGeometry(.024, .07, D - .08, 2, .005).translate(sx * (L / 2 - .028), .32, 0), true); // its ends
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const lx = sx * (L / 2 - .045), lz = sz * (D / 2 - .045);
    A(Wd, lathe([[0, .028], [.017, .028], [.019, .06], [.023, .2], [.026, .245], [.03, .255], [.03, .272], [.027, .28], [.027, .352], [0, .352]], 24).translate(lx, 0, lz), true); // a turned leg
    A(Bs, lathe([[0, 0], [.02, 0], [.022, .004], [.019, .03], [0, .03]], 24).translate(lx, 0, lz)); } // its sabot
  solidAt(x, y, zc, ry, 0, .2325, 0, L, .465, D);
}

// The pilasters' mouldings ([out, up], metres): an attic base (torus, scotia, torus on a fillet) and a capital (astragal, neck, ovolo, abacus)
const arc = (cu, cv, r, a0, a1, n = 6) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cu + r * Math.cos(a), cv + r * Math.sin(a)]; });
const BASE = [[0, 0], ...arc(.016, .022, .022, -Math.PI / 2, Math.PI / 2), [.018, .046], ...arc(.018, .058, .012, -Math.PI / 2, -Math.PI, 4).map(([u, v]) => [u + .012 * 0, v]),
  ...arc(.012, .068, .01, -Math.PI / 2, Math.PI / 2, 5), [.004, .078], [.004, .09], [0, .09]];
const CAP = [[0, 0], [.004, 0], [.004, .1], ...arc(.004, .116, .016, -Math.PI / 2, Math.PI / 2), [.006, .132], [.006, .17], [.012, .17], ...arc(.012, .2, .03, -Math.PI / 2, 0, 6),
  [.05, .2], [.054, .204], [.054, .236], [.05, .24], [.044, .24], [.044, .3], [0, .3]];
// The gallery: the hallway's west door 27.6 opens on the east end of a narrow barrel-vaulted gallery fifteen metres long, and its far door
// leads out of the east door 27.6, straight across the hallway from where you went in. Limestone floor and a long green runner, ochre
// plaster walls broken by limestone pilasters into four bays, a plaster vault on a coved cornice; a frosted globe on a long rod in each bay,
// pools of warm light with dusk between them, and a velvet bench in the third bay.
const GX1 = 320, GX2 = 335, GZ = 301;
defZone('hG', { music: 'hotel', ...dry, step: 'stone', grp: 'm', k: .8, exp: .34, fog: [.3, .2, .12, .004], bloom: .3, wet: .35, hum: .15, box: [GX1 - .7, GZ - 1.7, GX2 + .7, GZ + 1.7], probe: [327.5, Y + 1.5, GZ], env: [[GX1, Y, GZ - 1], [GX2, Y + 3.9, GZ + 1]] });
{
  const z = zones.hG, X1 = GX1, X2 = GX2, Z1 = GZ - 1, Z2 = GZ + 1, T = .7, DV = .65, HS = 2.9, RV = 1, TOP = Y + HS + RV + .2, PX = [323.75, 327.5, 331.25];
  const Fl = M(z, 'limestone', { color: 0xe4d6bc, macro: .12 }), Rn = M(z, 'loopCarpet', { color: 0x2a4036, sheen: .3 }), W = M(z, 'plaster', { color: 0xc4a682 }), Pl = M(z, 'plaster', { color: 0xecdfc4 });
  const Vt = M(z, 'plaster', { color: 0xecdfc4, uv: [1, 1] }), St = M(z, 'limestone', { color: 0xddcfb2, wear: .3, floor: Y }), Br = M(z, 'brass', { roughness: .3, dirt: .6 });
  box(Fl, X1 - T, Y - .2, Z1 - T, X2 + T, Y, Z2 + T); flats.push([X1 - T, Z1 - T, X2 + T, Z2 + T, () => Y]);
  box(Pl, X1 - T, TOP, Z1 - T, X2 + T, TOP + .2, Z2 + T);
  block(Rn, X1 + .3, Y, GZ - .5, X2 - .3, Y + .006, GZ + .5); // the runner
  box(W, X1 - T, Y, Z1 - T, X2 + T, TOP, Z1); box(W, X1 - T, Y, Z2, X2 + T, TOP, Z2 + T); // the long walls
  for (const [a, b] of [[X1 - T, X1], [X2, X2 + T]]) { box(W, a, Y, Z1, b, TOP, GZ - .5); box(W, a, Y, GZ + .5, b, TOP, Z2); box(W, a, Y + 2.24, GZ - .5, b, TOP, GZ + .5); } // the end walls round their openings
  const v = inward(new THREE.CylinderGeometry(RV, RV, X2 - X1, 64, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate((X1 + X2) / 2, Y + HS, GZ)); // the vault
  { const p = v.attributes.position, uv = v.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), RV * Math.atan2(p.getY(i) - Y - HS, p.getZ(i) - GZ)); }
  add(Vt, v, true);
  run(Pl, COVE, [X2 + .02, Z1], [X1 - .02, Z1], Y + HS, 0, 0); run(Pl, COVE, [X1 - .02, Z2], [X2 + .02, Z2], Y + HS, 0, 0);
  for (const px of PX) for (const k of [1, -1]) { // the pilasters: a plinth, a moulded base, a fluted shaft standing off the wall on a
    // shadow line, a moulded capital up into the cornice (each moulding wrapped round the shaft, mitred at its arrises)
    const wz = k > 0 ? Z1 : Z2, S = (w, y1, y2, d) => box(St, px - w, Y + y1, k > 0 ? Z1 - .05 : Z2 - d, px + w, Y + y2, k > 0 ? Z1 + d : Z2 + .05);
    S(.25, 0, .2, .1); solidAt(px, Y, wz, 0, 0, 1.4, 0, .5, 2.8, .2); // plinth; the whole pilaster solid to the plinth's depth
    const plan = new THREE.Shape(), P2 = (x, o) => new THREE.Vector2(x, -k * o), pts = [P2(-.185, -.01), P2(-.185, .012), P2(-.2, .012), P2(-.2, .066), P2(-.196, .07)];
    for (const fx of [-.15, -.05, .05, .15]) { pts.push(P2(fx - .025, .07)); for (let i = 1; i < 8; i++) { const t = Math.PI * i / 8; pts.push(P2(fx - .025 * Math.cos(t), .07 - .012 * Math.sin(t))); } pts.push(P2(fx + .025, .07)); } // the flutes
    pts.push(P2(.196, .07), P2(.2, .066), P2(.2, .012), P2(.185, .012), P2(.185, -.01)); plan.setFromPoints(pts);
    add(St, new THREE.ExtrudeGeometry(plan, { depth: 2.42, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(px, Y + .19, wz));
    const ring = (prof, y, w, d) => { const c = [[px + k * w, wz], [px + k * w, wz + k * d], [px - k * w, wz + k * d], [px - k * w, wz]]; // round the shaft, the room on the left
      for (let i = 0; i < 3; i++) run(St, prof, c[i], c[i + 1], Y + y, i > 0, i < 2, -1); };
    ring(BASE, .2, .2, .07); ring(CAP, 2.5, .2, .07);
  }
  const sk = pts => skirting(z, pts.map(([x, q]) => [x, Y, q]), { color: 0x4a3426 }), p0 = PX[0], p1 = PX[1], p2 = PX[2]; // room on the left of each run
  sk([[X2, GZ - .61], [X2, Z1], [p2 + .23, Z1]]); sk([[p2 - .23, Z1], [p1 + .23, Z1]]); sk([[p1 - .23, Z1], [p0 + .23, Z1]]); sk([[p0 - .23, Z1], [X1, Z1], [X1, GZ - .61]]);
  sk([[X1, GZ + .61], [X1, Z2], [p0 - .23, Z2]]); sk([[p0 + .23, Z2], [p1 - .23, Z2]]); sk([[p1 + .23, Z2], [p2 - .23, Z2]]); sk([[p2 + .23, Z2], [X2, Z2], [X2, GZ + .61]]);
  const glass = volume(M(null, 'frostedGlobe', { uv: [.1, .1] }));
  for (const px of [(X1 + p0) / 2, (p0 + p1) / 2, (p1 + p2) / 2, (p2 + X2) / 2]) pendant(z, Br, glass, px, Y + HS + RV, GZ, Y + 2.45, 30);
  galleryBench(z, (p1 + p2) / 2, Y, Z2 - .27, Math.PI);
  linkDoor(z, [2.55, 27.6, Math.PI / 2], [X2 + DV, Y, GZ, -Math.PI / 2], 27.6); // in from the hallway's west door, walking west
  linkDoor(z, [5.05, 27.6, -Math.PI / 2], [X1 - DV, Y, GZ, Math.PI / 2], -27.6); // and out of its east door, still walking west
  door(z, X2 + .05, Y, GZ, Math.PI / 2, { leaf: false, pivot: true, frame: 0xd8ccb4 }); door(z, X1 - .05, Y, GZ, -Math.PI / 2, { leaf: false, pivot: true, frame: 0xd8ccb4 });
  downlight(z, Br, X2 + DV / 2, Y + 2.24, GZ); downlight(z, Br, X1 - DV / 2, Y + 2.24, GZ);
  shell(X1 - T - 1.6, Z1 - T - .3, X2 + T + 1.6, Z2 + T + .3, 4.6);
}

// The lift lobby: the hallway's west doors 38.4 and 31.2 open on the north and south doors of one small octagonal lobby, so crossing it
// you come out of the other door facing back up the hallway, turned round without turning. Deep green lacquered panelling inlaid with brass, a terrazzo floor with a
// brass compass, a travertine centre and a dark green border, a plaster cornice and a round opal laylight; on the east and west faces a pair of brass lift doors
// that never open, a floor dial over each with its needle past the top floor, and a call station with one button lit.
const LC = [360, 301], RI = 1.93;
defZone('hL', { music: 'hotel', ...dry, step: 'tile', grp: 'm', k: .9, exp: .34, fog: [.3, .2, .12, .004], bloom: .32, wet: .4, hum: .12, box: [LC[0] - 2.7, LC[1] - 2.7, LC[0] + 2.7, LC[1] + 2.7], probe: [LC[0], Y + 1.5, LC[1]], env: [[LC[0] - RI, Y, LC[1] - RI], [LC[0] + RI, Y + 3.3, LC[1] + RI]] });
{
  const z = zones.hL, [CX, CZ] = LC, H = 3.3, T = .7, DV = .65, D = .3, FW = 2 * RI * Math.tan(Math.PI / 8), RC = RI / Math.cos(Math.PI / 8), MT = Math.tan(Math.PI / 8);
  const Mb = M(z, 'lacquer', { color: 0x2a5e46, uv: [1, 1] }), Sk = M(z, 'gelcoat', { color: 0x10221a, roughness: .25, wear: .2 }), Mk = M(z, 'terrazzo', { color: 0x2e4a3c }), Mc = M(z, 'travertine', { color: 0xe6d6b8 });
  const Fl = M(z, 'terrazzo', { color: 0xd8c4a0 }), Pl = M(z, 'plaster', { color: 0xe8dcc2 }), Br = M(z, 'brass', { roughness: .28, dirt: .5 }), Bp = M(z, 'brass', { color: 0x8c6a44, roughness: .36, dirt: .15, wear: 0 });
  const Al = M(z, 'anodised', { color: 0x8c8a84, roughness: .4 }), K = P(z, { color: 0x050403, roughness: 1 }), num = lettering(z, ['1', '2', '3', '4', '5']);
  box(Fl, CX - 2.7, Y - .2, CZ - 2.7, CX + 2.7, Y, CZ + 2.7); flats.push([CX - 2.7, CZ - 2.7, CX + 2.7, CZ + 2.7, () => Y]);
  box(Pl, CX - 2.7, Y + H, CZ - 2.7, CX + 2.7, Y + H + .2, CZ + 2.7);
  const corner = k => { const a = (k - .5) * Math.PI / 4; return [CX + RC * Math.sin(a), CZ + RC * Math.cos(a)]; }; // face k runs corner(k) to corner(k + 1), the room on its left
  const SKIRT = [[0, 0], [.014, 0], [.014, .092], [.011, .1], [.006, .104], [0, .106]], STRIP = [[0, 0], [.005, 0], [.005, .014], [0, .014]];
  for (let k = 0; k < 8; k++) {
    const f = k * Math.PI / 4, ox = CX + RI * Math.sin(f), oz = CZ + RI * Math.cos(f), ry = f + Math.PI, A = (m, g, own) => add(m, put(g, ox, Y, oz, ry), own);
    const wall = (cx, w, y1, y2, z1, z2) => { add(Mb, wallUV(put(new THREE.BoxGeometry(w, y2 - y1, z2 - z1).translate(cx, (y1 + y2) / 2, (z1 + z2) / 2), ox, Y, oz, ry)), true); solidAt(ox, Y, oz, ry, cx, (y1 + y2) / 2, (z1 + z2) / 2, w, y2 - y1, z2 - z1); };
    const kind = k % 2 ? 0 : k % 4 ? 2 : 1, hw = kind === 2 ? .55 : .5, oh = kind === 2 ? 2.25 : 2.24, jw = FW / 2 - hw; // 1: a door to the hallway, 2: a lift
    const a = corner(k), b = corner(k + 1), at = s => [ox + (b[0] - a[0]) / FW * s, oz + (b[1] - a[1]) / FW * s]; // a point s along the face from its middle
    run(Pl, COVE, a, b, Y + H, 1, 1, MT); run(Br, STRIP, a, b, Y + 2.85, 1, 1, MT);
    // the panelling's brass inlay, 12 mm strips standing 1.5 mm proud: a dado line at 0.95 m and, on a plain face, a frame round a
    // tall upper and a low lower panel; a brass bead down each corner
    const IN = (x1, y1, x2, y2) => A(Br, new THREE.BoxGeometry(x2 - x1, y2 - y1, .003).translate((x1 + x2) / 2, (y1 + y2) / 2, 0));
    const fx = FW / 2 - .17, ex = kind ? hw + (kind === 2 ? .065 : .09) : -FW / 2; // ex: the strip stops at the door's frame or the lift's architrave
    A(Br, new THREE.CylinderGeometry(.007, .007, H - .12, 12).translate(FW / 2, (H - .12) / 2 + .1, 0));
    if (kind) for (const s of [-1, 1]) IN(s > 0 ? ex : -FW / 2 + .01, .944, s > 0 ? FW / 2 - .01 : -ex, .956);
    if (!kind) { IN(-FW / 2 + .01, .944, FW / 2 - .01, .956);
      for (const [y1, y2] of [[.22, .8], [1.1, 2.62]]) { IN(-fx, y1, fx, y1 + .012); IN(-fx, y2 - .012, fx, y2); IN(-fx, y1 + .012, -fx + .012, y2 - .012); IN(fx - .012, y1 + .012, fx, y2 - .012); } }
    if (!kind) { wall(0, FW, 0, H, -T, 0); run(Sk, SKIRT, a, b, Y - .002, 1, 1, MT); continue; }
    for (const s of [-1, 1]) wall(s * (hw + jw / 2), jw, 0, H, -T, 0);
    wall(0, 2 * hw + .02, oh, H, -T, 0); run(Sk, SKIRT, a, at(-.61), Y - .002, 1, 0, MT); run(Sk, SKIRT, at(.61), b, Y - .002, 0, 1, MT);
    if (kind !== 2) continue;
    wall(0, 2 * hw + .02, 0, oh + .01, -T, -D); // the lift's shaft wall behind its doors
    for (const s of [-1, 1]) A(Br, new THREE.BoxGeometry(.003, oh - .0015, D).translate(s * (hw - .0015), (oh - .0015) / 2, -D / 2)); // the reveal lined in brass
    A(Br, new THREE.BoxGeometry(2 * hw - .004, .003, D).translate(0, oh - .0015, -D / 2));
    A(Al, new THREE.BoxGeometry(2 * hw + .1, .006, D + .05).translate(0, .001, -D / 2 + .025)); // the sill
    for (let i = 0; i < 3; i++) A(K, new THREE.PlaneGeometry(2 * hw - .02, .004).rotateX(-Math.PI / 2).translate(0, .0057, -D + .03 + i * .012)); // its grooves (dark lines 1.5 mm over its face)
    A(K, new THREE.BoxGeometry(.01, oh, .002).translate(0, oh / 2, -D + .0012)); // dark behind the meeting of the leaves
    for (const s of [-1, 1]) { const lx = s * (hw / 2 + .001), lw = hw - .002, fz = -D + .032; // the two leaves, an inlaid brass frame and rail on each
      A(Bp, new RoundedBoxGeometry(lw, oh - .012, .03, 2, .004).translate(lx, oh / 2, -D + .017)); // world UVs: its own 0..1 stretched the brass four times up the leaf, in streaks
      const i1 = lx - lw / 2 + .06, i2 = lx + lw / 2 - .06, y1 = .12, y2 = oh - .12;
      for (const ix of [i1, i2]) A(Br, new THREE.BoxGeometry(.012, y2 - y1, .004).translate(ix, (y1 + y2) / 2, fz));
      for (const iy of [y1 + .006, 1.0, y2 - .006]) A(Br, new THREE.BoxGeometry(i2 - i1 - .012, .012, .004).translate((i1 + i2) / 2, iy, fz));
    }
    for (const s of [-1, 1]) A(Br, new RoundedBoxGeometry(.07, oh + .067, .02, 2, .004).translate(s * (hw + .03), (oh + .067) / 2 - .002, .006)); // the architrave
    A(Br, new RoundedBoxGeometry(2 * hw + .13, .07, .024, 2, .005).translate(0, oh + .03, .008));
    const dy = oh + .11; // the floor dial over the doors: a half disc of brass, its numbers on an arc, the needle resting past 5
    const dial = new THREE.Shape(); dial.moveTo(.2, 0); dial.absarc(0, 0, .2, 0, Math.PI, false); dial.lineTo(.2, 0);
    A(Bp, new THREE.ExtrudeGeometry(dial, { depth: .008, bevelEnabled: true, bevelThickness: .002, bevelSize: .003, bevelSegments: 2, curveSegments: 48 }).translate(0, dy, .004));
    for (let i = 0; i < 5; i++) { const t = Math.PI * (150 - 30 * i) / 180, [m, q] = num(i, .07, .035); A(m, q.translate(.145 * Math.cos(t), dy + .145 * Math.sin(t), .0165), true); }
    A(K, new THREE.BoxGeometry(.11, .005, .002).translate(.055, 0, 0).rotateZ(Math.PI * 12 / 180).translate(0, dy, .017));
    A(Br, lathe([[0, 0], [.016, 0], [.016, .004], [.01, .008], [0, .008]], 24).rotateX(Math.PI / 2).translate(0, dy, .014));
    const cx = -(hw + .165); // the call station beside the doors: a brass plate, two buttons in bezels, the lower lit
    A(Br, new RoundedBoxGeometry(.07, .17, .012, 2, .004).translate(cx, 1.1, .004));
    for (const [by, on] of [[1.14, 0], [1.06, 1]]) {
      A(Br, new THREE.TorusGeometry(.0165, .003, 8, 32).translate(cx, by, .0105));
      A(on ? M(null, 'opalPanel') : M(z, 'opalPanel', { emit: null, color: 0xd0ccc0 }), new THREE.CylinderGeometry(.0145, .0145, .006, 32).rotateX(Math.PI / 2).translate(cx, by, .011), true);
    }
  }
  // the floor: a dark marble border round the walls, a brass ring and eight rays out from a pale marble centre
  const oct = r => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = (i - .5) * Math.PI / 4; s[i ? 'lineTo' : 'moveTo'](r * Math.sin(a), -r * Math.cos(a)); } return s; };
  const band = oct(RC + .02); band.holes.push(oct((RI - .25) / Math.cos(Math.PI / 8)));
  add(Mk, new THREE.ShapeGeometry(band).rotateX(-Math.PI / 2).translate(CX, Y + .0015, CZ));
  add(Mc, new THREE.CircleGeometry(.5, 96).rotateX(-Math.PI / 2).translate(CX, Y + .0015, CZ));
  for (const [r1, r2] of [[.5, .514], [1.0, 1.016]]) add(Br, new THREE.RingGeometry(r1, r2, 128).rotateX(-Math.PI / 2).translate(CX, Y + .002, CZ));
  for (let k = 0; k < 8; k++) add(Br, new THREE.PlaneGeometry(.008, .486).rotateX(-Math.PI / 2).translate(0, 0, .757).rotateY(k * Math.PI / 4).translate(CX, Y + .002, CZ));
  // the laylight: an opal disc recessed in a brass bezel, in a moulded plaster ring
  add(Pl, lathe([[.47, -.064], [.5, -.066], [.53, -.06], [.57, -.05], [.61, -.046], [.65, -.04], [.69, -.028], [.73, -.02], [.76, -.008], [.78, .01]], 96).translate(CX, Y + H, CZ));
  add(Br, lathe([[.455, -.06], [.455, -.072], [.462, -.076], [.472, -.073], [.475, -.064], [.47, -.058]], 96).translate(CX, Y + H, CZ));
  add(M(null, 'opalPanel'), new THREE.CircleGeometry(.456, 96).rotateX(Math.PI / 2).translate(CX, Y + H - .06, CZ), true);
  lit(z, CX, Y + H - .12, CZ, 45, [CX, Y, CZ], 1.5, 7, 0xffcf98);
  linkDoor(z, [2.55, 38.4, Math.PI / 2], [CX, Y, CZ + RI + DV, Math.PI], 38.4); // in from the hallway's west door 38.4 at the north door, walking south
  linkDoor(z, [2.55, 31.2, Math.PI / 2], [CX, Y, CZ - RI - DV, 0], 31.2); // and out of the south door into its west door 31.2, walking east
  door(z, CX, Y, CZ - RI - .05, Math.PI, { leaf: false, pivot: true, frame: 0xd8ccb4 }); door(z, CX, Y, CZ + RI + .05, 0, { leaf: false, pivot: true, frame: 0xd8ccb4 });
  downlight(z, Br, CX, Y + 2.24, CZ - RI - DV / 2); downlight(z, Br, CX, Y + 2.24, CZ + RI + DV / 2);
  shell(CX - 2.9, CZ - RI - T - 1.6, CX + 2.9, CZ + RI + T + 1.6, 3.8);
}
