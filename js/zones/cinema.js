// The cinema.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { dry, zones, defZone } from '../core.js';
import { M, P, neon, wallMat } from '../mat.js';
import { flats, add, block, box, solid, solidAt, lit, put } from '../build.js';
import { door } from '../props/metalwork.js';
import { sconce, stepLight } from '../props/lights.js';
import { lettering } from './hotel.js';

const rb = (w, h, d, s, r) => new RoundedBoxGeometry(w, h, d, s, r);
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Piping: a cord of velvet round a cushion's face, the rounded rectangle w x h (corner r) in the xy plane.
function piping(w, h, r, t = .0045) {
  const p = [], a = w / 2 - r, b = h / 2 - r;
  for (const [cx, cy, a0] of [[a, b, 0], [-a, b, 90], [-a, -b, 180], [a, -b, 270]]) for (let k = 0; k < 4; k++) { const t0 = (a0 + k * 30) * Math.PI / 180; p.push(new THREE.Vector3(cx + r * Math.cos(t0), cy + r * Math.sin(t0), 0)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p, true), 28, t, 3, true);
}

// A cinema seat, own frame: centre of its width on the floor, front (+z) to the screen, 0.6 m between centres. A moulded shell back
// with a buttonless velvet pad and piping, a folding seat (velvet cushion, piped front edge, plastic pan) on a hinge by the back, the
// standard on its -x side (moulded side panel on a steel foot plate, four bolts into the tier) carrying a padded armrest with a cup
// ring at its front. o.down: the seat folded down (empty ones spring up); o.end: a second standard on +x; o.letter: [mat, plane] on
// the outer face of the aisle standard (o.letterSide -1 or 1).
function seat(z, x, y, zc, ry, mats, o = {}) {
  const { shell, vel, pipe, steel, arm, dark } = mats, A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  const tilt = -.2, back = g => g.rotateX(tilt).translate(0, .3, -.27); // the back leans 11 degrees, pivoting at its foot
  A(shell, back(rb(.54, .66, .05, 1, .02).translate(0, .33, 0)));
  A(vel, back(rb(.48, .52, .07, 2, .03).translate(0, .37, .05)));
  A(pipe, back(piping(.48, .52, .03).translate(0, .37, .085)));
  A(shell, back(rb(.3, .05, .03, 1, .01).translate(0, .66, -.03))); // the grab rail moulded into the shell's top
  // the seat about its hinge (y .43, z -.13): folded up near-vertical, or down
  const fold = o.down ? -.06 : -1.38, S = g => g.rotateX(fold).translate(0, .43, -.13);
  A(shell, S(rb(.5, .04, .44, 1, .015).translate(0, -.035, .23)));
  A(vel, S(rb(.48, .09, .44, 2, .035).translate(0, .03, .23)));
  A(pipe, S(new THREE.CylinderGeometry(.0045, .0045, .44, 4).rotateZ(Math.PI / 2).translate(0, .07, .45)));
  for (const sx of [-.26, .26]) A(steel, new THREE.CylinderGeometry(.018, .018, .04, 8).rotateZ(Math.PI / 2).translate(sx, .43, -.13)); // hinge bosses
  for (const sx of o.end ? [-.3, .3] : [-.3]) {
    A(shell, rb(.05, .6, .5, 1, .015).translate(sx, .3, -.05));
    A(steel, rb(.09, .008, .44, 1, .003).translate(sx, .004, -.05));
    for (const bx of [-.03, .03]) for (const bz of [-.24, .14]) A(steel, new THREE.CylinderGeometry(.0065, .0065, .007, 6).translate(sx + bx, .011, bz)); // hex bolt heads
    A(arm, rb(.075, .045, .5, 1, .016).translate(sx, .63, -.04));
    A(steel, new THREE.TorusGeometry(.04, .0055, 4, 14).rotateX(Math.PI / 2).translate(sx, .652, .2)); // the cup ring, with its well below
    A(arm, new THREE.CylinderGeometry(.044, .038, .08, 10, 1, true).translate(sx, .61, .2));
    A(dark, new THREE.CircleGeometry(.036, 12).rotateX(-Math.PI / 2).translate(sx, .575, .2));
    solidAt(x, y, zc, ry, sx, .33, -.05, .07, .66, .5);
  }
  if (o.letter) { const [m, q] = o.letter, s = o.letterSide, sx = s * .3 + s * .0255;
    A(steel, rb(.004, .05, .1, 1, .0015).translate(sx, .5, .1));
    A(m, q.rotateY(s * Math.PI / 2).translate(sx + s * .0035, .5, .1), true); } // 1.5 mm proud of its plate
  if (o.down) solidAt(x, y, zc, ry, 0, .24, .09, .5, .48, .46);
}

// Velvet hanging in folds: w wide (along z), from y1 to y2, at x, gathered at `pitch` with fold depth `deep`, facing -x.
function drape(mat, x, y1, y2, z1, z2, pitch, deep, seed) {
  const w = z2 - z1, h = y2 - y1, g = new THREE.PlaneGeometry(w, h, Math.ceil(w / pitch * 8), 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + w / 2, v = (p.getY(i) + h / 2) / h, ph = u / pitch * 2 * Math.PI;
    const d = deep * (Math.sin(ph + 1.3 * Math.sin(ph * .37 + seed)) * .5 + .5) * (.8 + .2 * v); // folds a little deeper at the top where they are gathered
    p.setZ(i, d + .02 * Math.sin(u * 3.1 + seed) * (1 - v));
  }
  g.computeVertexNormals(); add(mat, g.rotateY(-Math.PI / 2).translate(x, (y1 + y2) / 2, (z1 + z2) / 2));
}

defZone('cN', { music: 'cinema', ...dry, step: 'carpet', grp: 'c', k: 1.1, exp: .36, fog: [.01, .008, .01, .01], bloom: .4, wet: .2, box: [5.2, 24, 17.8, 38], probe: [10, 1.5, 31], env: [[5.2, -.5, 24], [17.8, 5, 38]] });
{ // cinema x[5.6,17.4] z[24.4,37.6]: the floor steps down in tiers toward a masked screen between drawn velvet curtains on a low stage
  const z = zones.cN, h = 5, R = wallMat(z, 0x4a1016), C = M(z, 'blackoutCarpet', { color: 0x6a5a62 }), K = P(z, { color: 0x0a0a0a, roughness: .9 });
  const mats = { shell: M(z, 'hardPlastic', { color: 0x1a1819, roughness: .5 }), vel: M(z, 'velvet', { color: 0x9c1a2a }), pipe: M(z, 'velvet', { color: 0x3c0a10 }),
    steel: M(z, 'brushedSteel'), arm: M(z, 'hardPlastic', { color: 0x221f1d, roughness: .62 }), dark: K };
  const nose = M(z, 'anodised', { color: 0x9a9a94, roughness: .4, wear: .3 }), Bk = M(z, 'velvet', { color: 0x070606 }), Cu = M(z, 'velvet', { color: 0x5e0e18 });
  const letters = lettering(z, ['A', 'B', 'C', 'D']);
  box(K, 5.4, h, 24, 17.8, h + .2, 38); box(R, 5.4, -1.4, 24, 17.8, h, 24.4); box(R, 5.4, -1.4, 37.6, 17.8, h, 38); box(R, 17.4, -1.4, 24.4, 17.8, h, 37.6); // north and south walls go down past the lowest tier
  box(R, 5.4, 0, 24.4, 5.6, h, 30.5); box(R, 5.4, 0, 31.5, 5.6, h, 37.6); box(R, 5.4, 2.24, 30.5, 5.6, h, 31.5);
  door(z, 5.65, 0, 31, -Math.PI / 2, { leaf: false, frame: 0x241a1a });
  const nosing = new THREE.Shape([[-.05, 0], [-.05, .003], [.001, .0045], [.004, .002], [.004, -.035], [0, -.035], [0, 0]].map(([a, b]) => new THREE.Vector2(a, b)));
  [[5.4, 7.6], [7.6, 9.6], [9.6, 11.6], [11.6, 13.6], [13.6, 17.4]].forEach(([x1, x2], i) => { const y = -.25 * i;
    block(C, x1, -1.4, 24.4, x2, y, 37.6); if (i) flats.push([x1, 24.4, x2, 37.6, () => y]);
    if (i) { // the riser down from the tier behind: an aluminium nosing on its edge, a step light either side of the aisle
      add(nose, new THREE.ExtrudeGeometry(nosing, { depth: 13.2, bevelEnabled: false }).translate(x1, y + .25, 24.4));
      for (const zc of [30.25, 31.75]) stepLight(z, x1, y + .125, zc, Math.PI / 2);
    }
    if (i < 4) for (const [a, b, s] of [[24.6, 29.8, -1], [32.2, 37.4, 1]]) { // a row either side of the aisle, lettered from the front
      const x = x1 + .55, n = Math.floor((b - a) / .6), z0 = (a + b) / 2 - (n - 1) * .3;
      for (let k = 0; k < n; k++) { const zc = z0 + k * .6, aisle = s < 0 ? k === n - 1 : k === 0, end = k === 0;
        seat(z, x, y, zc, Math.PI / 2, mats, { down: hash(x, zc) < .18, end, letter: aisle ? letters(3 - i, .08, .04) : null, letterSide: s < 0 ? -1 : 1 }); }
      solid(x - .36, y, a, x - .2, y + 1, b); // the backs, as one
    }
  });
  // the stage, the screen behind its black velvet masking, curtains drawn back either side and a pleated valance across the top
  box(C, 16.6, -1.4, 24.4, 17.4, -.4, 37.6); add(nose, new THREE.ExtrudeGeometry(nosing, { depth: 13.2, bevelEnabled: false }).rotateY(Math.PI).translate(16.6, -.4, 37.6));
  block(neon(0xffe2b8, .7), 17.32, -.4, 25.8, 17.38, 4.2, 36.2);
  box(Bk, 17.22, 3.7, 25.6, 17.32, 4.3, 36.4); box(Bk, 17.22, -.4, 25.6, 17.32, .05, 36.4); for (const [a, b] of [[25.6, 26.3], [35.7, 36.4]]) box(Bk, 17.22, -.4, a, 17.32, 4.3, b);
  drape(Cu, 17.08, -.4, 4.85, 24.4, 26.1, .17, .09, 1); drape(Cu, 17.08, -.4, 4.85, 35.9, 37.6, .17, .09, 4); solid(16.98, -.4, 24.4, 17.4, 4.85, 26.1); solid(16.98, -.4, 35.9, 17.4, 4.85, 37.6);
  drape(Cu, 16.95, 4.3, 5, 24.4, 37.6, .22, .05, 7);
  for (const xc of [8.6, 12.6]) { sconce(z, xc, 2.5 - .25 * (xc > 10 ? 2 : 1), 24.4, 0, { power: 12 }); sconce(z, xc, 2.5 - .25 * (xc > 10 ? 2 : 1), 37.6, Math.PI, { power: 12 }); } // dim house lights on the side walls
  lit(z, 13.2, 4.7, 31, 120, [17.2, 3, 31], 1.1, 9, 0xffc890); for (const zc of [25.3, 36.7]) lit(z, 14.2, 4.7, zc, 110, [17.1, 1, zc], .9, 8, 0xffc890); // a warm wash on the stage and curtains from the ceiling
  lit(z, 17, 1.8, 31, 300, [8, -.3, 31], 1.25, 18, 0xffe2bc); // the screen lights the room
}
