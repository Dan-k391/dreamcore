// The metro platform after the last train: one side platform beside one track in a trench, under a shallow vault, both tunnel
// mouths going to black. Far from everything (x 692..748, z -605..-593); reached later through the entry doorway in the back wall.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { dry, zones, defZone } from '../core.js';
import { M, P } from '../mat.js';
import { add, block, box, solid, round, flats, slab, lit, put } from '../build.js';
import { door, railing, signPost, bin } from '../props/metalwork.js';
import { mallBench } from '../props/garden.js';
import { steps } from '../props/structure.js';

// Plan: platform x 700..737 at y 0 between the back wall (face z -595.5) and its edge (z -600); the trench z -600..-604.4 at y -1.1,
// track centred on z -602.2, running on through both end walls into 6 m of tunnel (x 694 / 746, closed). East of the platform's end
// a maintenance bay at track level (x 737..740) with a stair down against the back wall. Vault springs at 3.3 on both walls.
const X0 = 700, X1 = 740, XP = 737, ZW = -595.5, ZE = -600, ZF = -604.4, ZT = -602.2, YB = -1.1, SP = 3.3, CR = 4.1;
const ZC = (ZW + ZF) / 2, HW = (ZW - ZF) / 2, R = (HW * HW + (CR - SP) ** 2) / (2 * (CR - SP)), YC = CR - R; // the vault's circle
const ceilY = zc => YC + Math.sqrt(R * R - (zc - ZC) ** 2);
const TW = 4.1, TC = (ZF + .2 + ZE - .1) / 2, TS = .95; // tunnel: width, centre line, springing
const PI = Math.PI, DOOR = 702; // the entry doorway's centre on the back wall

defZone('mT', { ...dry, sky: 'night', grp: 'q', k: .8, exp: .3, fog: [.012, .011, .009, .004], bloom: .34, wet: .3, hum: .4, box: [692, -604.7, 748, -593.6], probe: [718, 1.6, -598] });
{
  const z = zones.mT, rb = (w, h, d, r, s = 2) => new RoundedBoxGeometry(w, h, d, s, r);
  const A = (m, g, own) => add(m, g, own);
  const F = M(z, 'terrazzo', { color: 0xe6dccb, macro: .12, roughness: .32 }), Tc = M(z, 'poolTile', { color: 0xece7da, macro: .08, dirt: .6, dirtCol: [.55, .5, .42] }), Tb = M(z, 'poolTile', { color: 0x2f6a63, macro: .06 });
  const Pl = M(z, 'plaster', { color: 0xbab5aa, dirt: .3 }), C = M(z, 'concreteWall', { color: 0xb2ab9e, dirt: .5, dirtCol: [.4, .37, .33] }), B = M(z, 'concreteFloor', { color: 0x7a746c, macro: .25, dirt: .5 });
  const L = M(z, 'limestone', { color: 0xd2c8b4, wear: .7 }), Y = M(z, 'hardPlastic', { color: 0xd49a1c, roughness: .55, wear: .25 }), Ln = M(z, 'roadPaint', { color: 0xe8c860 });
  const Br = M(z, 'brass', { color: 0xd8b878 }), Fe = M(z, 'castIron', { color: 0x6a5a4c }), St = M(z, 'brushedSteel', { roughness: .22 }), Gv = M(z, 'galvanised');
  const Rb = M(z, 'rubber', { color: 0x1c1b1a }), Dk = M(z, 'hardPlastic', { color: 0x2a2826, roughness: .6, wear: .2 }), Hs = M(z, 'paintedSteel', { color: 0xbcb6a8, roughness: .35, wear: .15 });
  const En = M(z, 'paintedSteel', { color: 0x2f6a8a, roughness: .16, wear: .1 }), Ec = M(z, 'paintedSteel', { color: 0xe4ddca, roughness: .16, wear: .1 }), Void = P(z, { color: 0x030303, roughness: 1 });
  // emitters of this place's own (an option no other place passes), so they merge into meshes of their own, drawn only under this place's sky
  const Op = M(null, 'opalPanel', { fine: .051 }), Amb = M(null, 'frostedGlobe', { emit: [0xffa040, 4] });

  // ---- floors: platform terrazzo, tactile strip, stone coping; the platform's body; the track bed through the tunnels; the bay
  box(F, X0, -.1, -599.25, XP, 0, ZW); box(C, X0, YB, -599.95, XP, -.1, ZW);
  box(Y, X0, -.1, -599.65, XP, -.002, -599.25);
  for (let x = X0; x < XP - .01; x += 1) A(L, rb(Math.min(1, XP - x) - .005, .12, .4, .012).translate(x + Math.min(1, XP - x) / 2, -.06, -599.85)); // jointed coping units
  solid(X0, -.12, -600.05, XP, 0, -599.65);
  block(Ln, X0, -.001, -598.86, XP - .002, .0015, -598.76); // the painted line behind the strip, 1.5 mm thick, stopping short of the platform's end face
  for (let x = X0 + 1; x < XP; x += 1) for (const [a, b] of [[-599.25, -598.86], [-598.76, ZW]]) block(Br, x - .002, -.002, a, x + .002, .0015, b); // brass divider strips 1.5 mm proud of the terrazzo, broken where the line crosses
  box(B, 692, YB - .2, ZF, 748, YB, ZE); box(B, XP, YB - .2, ZE, X1, YB, ZW);
  { // tactile blister tiles: 400 mm square, 6 x 6 flat-topped domes 5 mm proud
    const d = new THREE.LatheGeometry([[.0125, 0], [.0118, .0028], [.008, .0048], [0, .0052]].map(([a, b]) => new THREE.Vector2(a, b)), 8), gs = [];
    for (let x = X0; x < XP - .2; x += .4) { A(Y, rb(.396, .004, .396, .0015, 1).translate(x + .2, -.002, -599.45)); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) gs.push(d.clone().translate(x + .0333 + i * .0667, 0, -599.65 + .0333 + j * .0667)); }
    gs.forEach(g => A(Y, g));
  }
  // floors that are not at 0: the trench and tunnels (sleepers stand 12 cm proud of the bed), the bay
  flats.push([692, ZF, 748, ZE, (x, zz) => Math.abs(zz - ZT) < 1.2 && ((x - 692.17) / .65 % 1 + 1) % 1 < .4 ? YB + .12 : YB], [XP, ZE, X1, ZW, () => YB]);

  // ---- walls: the tiled back wall (dark plinth, cream field, the band), the doorway cut in it at x 701.5..702.5, 2.24 m
  const back = (m, y1, y2) => { for (const [a, b] of [[X0, DOOR - .5], [DOOR + .5, X1]]) box(m, a, y1, ZW, b, y2, ZW + .3); if (y2 > 2.24) box(m, DOOR - .5, Math.max(y1, 2.24), ZW, DOOR + .5, y2, ZW + .3); };
  back(Tb, 0, .14); back(Tc, .14, 2.3); back(Tb, 2.3, 2.46); back(Tc, 2.46, SP + .3); box(Tb, XP, YB, ZW, X1, 0, ZW + .3);
  box(C, X0, YB, ZF - .3, X1, SP + .3, ZF); // the far wall
  for (const x of [X0 - .3, X1]) slab(Tc, 'z', x, .3, ZF - .3, ZW + .3, YB - .2, CR + .5, [['arch', TC, TW, TS + TW / 2]], true); // end walls round the tunnel mouths
  { // the vault, 250 mm thick, and its ribs every 4 m on pilasters down both walls
    const arc = (r1, r2) => { const a = Math.asin(HW / r1) * 1.01, s = new THREE.Shape(); s.absarc(0, 0, r2, PI / 2 - a, PI / 2 + a, false); s.absarc(0, 0, r1, PI / 2 + a, PI / 2 - a, true); s.closePath(); return s; };
    const ext = (s, d, bev) => new THREE.ExtrudeGeometry(s, { depth: d, curveSegments: 48, bevelEnabled: !!bev, bevelThickness: bev, bevelSize: bev, bevelSegments: 2 }).rotateY(PI / 2);
    A(Pl, ext(arc(R, R + .25), X1 - X0).translate(X0, YC, ZC));
    for (let x = 704; x < XP; x += 4) {
      A(Pl, ext(arc(R - .12, R + .02), .3, .012).translate(x - .15, YC, ZC));
      A(Pl, rb(.34, SP - .02, .1, .015).translate(x, SP / 2, ZW - .04)); solid(x - .17, 0, ZW - .09, x + .17, SP, ZW);
      A(Pl, rb(.34, SP - YB, .1, .015).translate(x, (SP + YB) / 2, ZF + .04)); solid(x - .17, YB, ZF, x + .17, SP, ZF + .09);
    }
  }
  { // the tunnels: plain concrete lining, a semicircular crown, closed 6 m in by dark and a solid
    const s = new THREE.Shape(); s.absarc(0, 0, TW / 2 + .25, 0, PI, false); s.absarc(0, 0, TW / 2, PI, 0, true); s.closePath();
    for (const [a, b, cl] of [[692, X0 - .3, 694], [X1 + .3, 748, 746]]) {
      box(C, a, YB, ZF - .1, b, TS, TC - TW / 2); box(C, a, YB, TC + TW / 2, b, TS, ZE + .3);
      A(C, new THREE.ExtrudeGeometry(s, { depth: b - a, curveSegments: 32, bevelEnabled: false }).rotateY(PI / 2).translate(a, TS, TC));
      box(Void, cl - .15, YB, TC - TW / 2, cl + .15, TS + TW / 2, TC + TW / 2);
    }
  }
  { // the doorway's recess: 1.5 m deep, dark, open at its far end onto the passage from the hotel
    const D = M(z, 'concreteWall', { color: 0x4a443c, dirt: .6 });
    box(D, DOOR - .8, 0, ZW + .3, DOOR - .5, 2.4, ZW + 1.8); box(D, DOOR + .5, 0, ZW + .3, DOOR + .8, 2.4, ZW + 1.8); box(D, DOOR - .5, 2.24, ZW + .3, DOOR + .5, 2.4, ZW + 1.8);
    box(D, DOOR - .5, -.1, ZW + .3, DOOR + .5, 0, ZW + 1.8); // open at its far end onto the hotel's passage (zones/passages.js)
    door(z, DOOR, 0, ZW + .073, PI, { leaf: false, frame: 0x2f5a6a }); // its face 2 mm proud of the tiles
  }

  // ---- the track: concrete sleepers, base plates and clips, two rails, the dark third-rail cover on insulators
  { const rail = new THREE.Shape([[-.075, 0], [.075, 0], [.075, .011], [.0085, .032], [.0085, .125], [.036, .136], [.036, .166], [-.036, .166], [-.036, .136], [-.0085, .125], [-.0085, .032], [-.075, .011]].map(([a, b]) => new THREE.Vector2(a, b)));
    const head = new THREE.Shape(); head.moveTo(-.034, 0); head.lineTo(.034, 0); head.quadraticCurveTo(.035, .007, .026, .008); head.lineTo(-.026, .008); head.quadraticCurveTo(-.035, .007, -.034, 0);
    const run = (s, m, y, zc, e = 0) => A(m, new THREE.ExtrudeGeometry(s, { depth: 54 - 2 * e, bevelEnabled: true, bevelThickness: .002, bevelSize: .0015, bevelSegments: 1, curveSegments: 4 }).rotateY(PI / 2).translate(693 + e, y, zc));
    const ry = YB + .12 + .016;
    for (const s of [-1, 1]) { run(rail, Fe, ry, ZT + s * .7535); run(head, St, ry + .162, ZT + s * .7535, .002); } // the worn head stops 2 mm short of the rail's sawn ends
    const clip = new THREE.TorusGeometry(.03, .007, 6, 12, PI * 1.3).rotateY(PI / 2);
    for (let x = 692.3; x < 748; x += .65) {
      A(B, rb(.26, .14, 2.4, .02).translate(x, YB + .05, ZT));
      for (const s of [-1, 1]) { const zr = ZT + s * .7535;
        A(Fe, rb(.18, .016, .36, .004, 1).translate(x, ry - .008, zr));
        for (const k of [-1, 1]) A(Fe, clip.clone().rotateX(k > 0 ? 0 : PI).translate(x, ry + .012, zr + k * .095)); }
    }
    for (let x = 693; x < 748; x += 2.5) { A(Dk, new THREE.CylinderGeometry(.035, .05, .16, 12).translate(x, YB + .08 + .12, -603.55)); A(Gv, rb(.05, .32, .05, .006).translate(x, YB + .27, -603.75)); }
    A(Fe, rb(54, .07, .07, .008).translate(720, YB + .32, -603.55)); // the conductor rail
    A(Dk, rb(54, .022, .26, .006).translate(720, YB + .44, -603.6)); // the cover board
  }
  // cable brackets on the far wall, every 1.5 m, four arms; cables sagging between them
  { const ys = [-.3, .2, .65, 1.1];
    for (let x = 692.75; x < 748; x += 1.5) { const zw = x > X0 && x < X1 ? ZF : TC - TW / 2; A(Gv, rb(.05, 1.75, .04, .006).translate(x, .4, zw + .02)); for (const y of ys) A(Gv, rb(.04, .03, .26, .005).translate(x, y - .03, zw + .15)); }
    ys.forEach((y, i) => { for (const r of [.018, .026]) { const pts = [];
      for (let x = 692.75; x < 748 - 1.5; x += 1.5) for (let k = 0; k < 6; k++) { const t = k / 6, zw = x + t * 1.5 > X0 - .3 && x + t * 1.5 < X1 + .3 ? ZF : TC - TW / 2; pts.push(new THREE.Vector3(x + t * 1.5, y + r - .015 - .04 * Math.sin(PI * t), zw + .1 + (r > .02 ? .08 : 0) + i * .006)); }
      A(Rb, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, r, 8)); } });
  }

  // ---- light: linear pendants over the platform edge, globes on the back wall
  { const body = new THREE.Shape(); { const w = .045, h = .06, r = .012; body.moveTo(-w, 0); body.lineTo(-w, h - r); body.quadraticCurveTo(-w, h, -w + r, h); body.lineTo(w - r, h); body.quadraticCurveTo(w, h, w, h - r); body.lineTo(w, 0); body.lineTo(w - .006, 0); body.lineTo(w - .006, h - .008); body.lineTo(-w + .006, h - .008); body.lineTo(-w + .006, 0); body.closePath(); }
    const lens = new THREE.CylinderGeometry(.039, .039, 1.5, 24, 1, true, PI, PI).rotateZ(PI / 2).scale(1, .45, 1), uv = lens.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 1.5, uv.getX(i) * .12);
    for (let x = 702; x <= 738; x += 4) {
      const y = 2.78, zc = -599.15, c = ceilY(zc);
      A(Hs, new THREE.ExtrudeGeometry(body, { depth: 1.5, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 1, curveSegments: 4 }).rotateY(PI / 2).translate(x - .75, y, zc));
      for (const s of [-1, 1]) A(Hs, rb(.012, .068, .09, .004).translate(x + s * .756, y + .03, zc)); // end caps
      A(Op, lens.clone().translate(x, y + .004, zc), true);
      for (const s of [-1, 1]) { const xx = x + s * .55;
        A(St, new THREE.CylinderGeometry(.0012, .0012, c - y - .06, 6).translate(xx, (c + y) / 2, zc));
        A(Hs, new THREE.CylinderGeometry(.04, .045, .025, 24).translate(xx, c - .012, zc)); A(Hs, new THREE.CylinderGeometry(.008, .008, .03, 12).translate(xx, y + .075, zc)); }
      lit(z, x, y - .05, zc, 85, [x, 0, zc + .2], 1.3, 13, 0xffd6a2);
    }
    const plate = new THREE.LatheGeometry([[0, 0], [.075, 0], [.08, .006], [.072, .016], [.02, .02], [0, .02]].map(([a, b]) => new THREE.Vector2(a, b)), 32).rotateX(-PI / 2);
    const cup = new THREE.LatheGeometry([[.0, -.03], [.03, -.028], [.05, -.005], [.058, .012], [.052, .018]].map(([a, b]) => new THREE.Vector2(a, b)), 32);
    const globe = new THREE.SphereGeometry(.12, 32, 20), gu = globe.attributes.uv; for (let i = 0; i < gu.count; i++) gu.setXY(i, gu.getX(i) * 7.5, gu.getY(i) * 3.8);
    for (let x = 706; x < XP; x += 4) {
      const y = 2.9, f = ZW - .001;
      A(Br, plate.clone().translate(x, y, f)); // a swan-neck arm out of the backplate, up into the gallery cup
      A(Br, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, y, f - .015), new THREE.Vector3(x, y, f - .26), new THREE.Vector3(x, y + .08, f - .26)), 16, .011, 10));
      A(Br, cup.clone().translate(x, y + .08, f - .26)); A(Op, globe.clone().translate(x, y + .2, f - .26), true);
    }
  }

  // ---- the platform's things
  for (const x of [710, 722, 734]) {
    mallBench(z, x, 0, -596.35, 0);
    A(Br, rb(2.26, .5, .03, .012).translate(x, 1.82, ZW - .016)); A(Ec, rb(2.2, .44, .036, .01).translate(x, 1.82, ZW - .02)); A(En, rb(2.1, .34, .036, .008).translate(x, 1.82, ZW - .022)); // blue field inside a cream rule // a blank enamel panel in a brass frame
    for (const sx of [-1.05, 1.05]) for (const sy of [-.18, .18]) A(St, new THREE.SphereGeometry(.007, 10, 6, 0, 2 * PI, 0, PI / 2).rotateX(-PI / 2).translate(x + sx, 1.82 + sy, ZW - .038));
  }
  { // the stopped clock: double-faced, on a bracket from the pilaster at x 720, no hands
    const y = 2.62, zc = ZW - .55, cs = new THREE.LatheGeometry([[0, -.07], [.24, -.07], [.255, -.06], [.26, 0], [.255, .06], [.24, .07], [0, .07]].map(([a, b]) => new THREE.Vector2(a, b)), 48).rotateZ(PI / 2);
    A(Dk, cs.translate(720, y, zc)); A(Dk, rb(.06, .06, .5, .01).translate(720, y + .29, ZW - .3)); A(Dk, rb(.04, .32, .04, .008).translate(720, y + .14, zc));
    A(Dk, rb(.14, .2, .02, .006).translate(720, y + .29, ZW - .1));
    for (const s of [-1, 1]) { A(Hs, new THREE.CylinderGeometry(.215, .215, .004, 48).rotateZ(PI / 2).translate(720 + s * .072, y, zc));
      for (let k = 0; k < 12; k++) { const a = k * PI / 6, l = k % 3 ? .03 : .05; A(Dk, new THREE.BoxGeometry(.003, l, k % 3 ? .008 : .014).translate(0, .19 - l / 2, 0).rotateX(a).translate(720 + s * .075, y, zc)); }
      A(Dk, new THREE.CylinderGeometry(.008, .008, .004, 16).rotateZ(PI / 2).translate(720 + s * .075, y, zc)); }
  }
  { // the help point: a plain enamelled box with a speaker grille, a button and one small warm lamp
    const x = 714, y = 1.32, f = ZW;
    A(Hs, rb(.32, .52, .1, .018).translate(x, y, f - .05));
    for (let k = 0; k < 6; k++) A(Dk, rb(.15, .008, .004, .002, 1).translate(x, y + .12 + k * .018, f - .1));
    A(St, new THREE.CylinderGeometry(.03, .032, .012, 32).rotateX(PI / 2).translate(x, y - .06, f - .104)); A(Dk, new THREE.CylinderGeometry(.022, .022, .008, 32).rotateX(PI / 2).translate(x, y - .06, f - .11));
    A(Amb, new THREE.SphereGeometry(.012, 16, 8, 0, 2 * PI, 0, PI / 2).rotateX(-PI / 2).translate(x, y - .17, f - .1));
    solid(x - .16, y - .26, f - .1, x + .16, y + .26, f);
  }
  bin(z, 726.6, 0, -595.85);
  signPost(z, 706.4, 0, -597.4, -PI / 2, { w: .7, ph: .4, top: 2.3, color: 0x2c4f64 });
  { // a convex mirror at the platform's end on a post
    const x = 736.4, zc = -598.5;
    A(Gv, new THREE.CylinderGeometry(.03, .03, 2.25, 20).translate(x, 1.125, zc)); A(Gv, rb(.16, .01, .16, .003).translate(x, .005, zc)); round(x, zc, .04, 0, 2.3);
    A(Gv, new THREE.CylinderGeometry(.018, .018, .2, 12).rotateZ(PI / 2).translate(x - .1, 2.1, zc));
    const dish = new THREE.SphereGeometry(.5, 40, 8, 0, 2 * PI, 0, .55).rotateZ(PI / 2).translate(.5 * Math.cos(.55) - .03, 0, 0);
    // turned to look back down the platform and a little down; a dark moulded back behind the dish
    A(St, dish.clone().rotateZ(.12).rotateY(.35).translate(x - .27, 2.1, zc));
    A(Dk, new THREE.TorusGeometry(.262, .014, 8, 48).rotateY(PI / 2).rotateZ(.12).rotateY(.35).translate(x - .30, 2.1, zc));
    A(Dk, new THREE.CylinderGeometry(.262, .25, .03, 48).rotateZ(PI / 2).rotateZ(.12).rotateY(.35).translate(x - .285, 2.1, zc));
  }
  // the maintenance stair at the platform's end, against the back wall, and the guard rails round the bay
  steps(z, XP + .84, YB, ZW - .55, PI / 2, { n: 6, r: -YB / 6, g: .28, w: 1.0 });
  railing(z, [[XP - .08, 0, ZE + .15], [XP - .08, 0, ZW - 1.1]]); solid(XP - .11, 0, ZE + .1, XP - .05, 1.05, ZW - 1.08);
  railing(z, [[XP - .08, 0, ZW - 1.1], [XP + 1.68, YB, ZW - 1.1]]);
  // the signal at the east tunnel mouth: one steady amber lamp
  { const x = X1 + 1.2, y = .7, zc = TC - TW / 2 + .35;
    A(Dk, rb(.28, .62, .2, .03).translate(x, y, zc)); A(Gv, rb(.08, .08, .3, .01).translate(x, y, zc - .22));
    for (const [k, on] of [[.13, 1], [-.13, 0]]) { A(Dk, new THREE.CylinderGeometry(.075, .075, .14, 24, 1, true, 0, PI).rotateZ(PI / 2).translate(x - .17, y + k + .01, zc));
      A(on ? Amb : Rb, new THREE.SphereGeometry(.06, 24, 8, 0, 2 * PI, 0, .7).rotateZ(PI / 2).translate(x - .1, y + k, zc)); }
    lit(z, x - .4, y + .1, zc, 4, [X1 - 3, YB, zc + 1], 1.2, 7, 0xffa040);
  }
}
