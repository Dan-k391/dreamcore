// The great baths: the largest pool room, reached through the hotel hallway's east door 24 by a portal and a tiled passage.
// A hall 40 x 32 m and 9.6 m tall, its east end one great curved wall with a gallery along it at 4.5 m, climbed by a tiled stair
// along the south wall; eight massive mosaic columns in two rows, a 26 x 14 m pool with a round stepped shallow end and a 2 m deep
// end, long warm light slots in the ceiling over the water, a light line where the ceiling meets the curved wall.
// It stands at ground level (every pool lies on WY), far out at x -1400, z 1400 (far enough that no other place sees it, even as a pixel on the horizon), with the sea block cut away under it (zones/sea.js).
import * as THREE from 'three';
import { V, WY, zones, defZone } from '../core.js';
import { M, P, poolMats } from '../mat.js';
import { flats, pools, rings, loose, add, block, box, solid, round, turned, put, solidAt, flight, lit, fixture, portal, RoundedBoxGeometry } from '../build.js';
import { poolLadder, railing, drain, door } from '../props/metalwork.js';
import { poolLight, opalPanel } from '../props/lights.js';
import { mallBench } from '../props/garden.js';
import { swimRing, beachBall } from '../props/play.js';

const PI = Math.PI, X0 = -1400, Z0 = 1400, H = 9.6; // the hall's south-west inside corner; its ceiling
// The curved east wall: an arc through (40, 0), (45, 16), (40, 32) (local x, z) about (CX, 16); the gallery runs inside it from radius RI
const R = 28.1, CX = 40 - Math.sqrt(R * R - 256), RI = 24.6, GY = 4.5;
const SC = [13, 16], SR = 7; // the pool's round shallow end: centre and radius (local)
// pool x[6,32] z[9,23]: the round end west of x 13 with three ring steps, a 1.08 m floor to x 22, sloping to 2 m at x 26
const STEP = [[6.55, -.3], [6.1, -.6], [5.65, -.9]];
const poolFloor = (x, z) => {
  if (x < SC[0]) { const r = Math.hypot(x - SC[0], z - SC[1]); if (r > SR) return 0; for (const [r0, y] of STEP) if (r > r0) return y; return -1.2; }
  return x < 22 ? -1.2 : x < 26 ? -1.2 - .23 * (x - 22) : -2.12;
};
defZone('pB', { music: 'pool', amb: { water: 1, drips: .7, verb: [0, .25, 1] }, step: 'tile', grp: 'r', k: .5, exp: .3, fog: [.2, .15, .1, .0006], tint: [1.02, 1, .97], sat: 1.04, bloom: .32, shaft: 0, hum: 0, water: 1, wet: .8,
        box: [X0 - .4, Z0 - .4, X0 + 45.6, Z0 + 32.4], probe: [X0 + 20, 3, Z0 + 16], env: [[X0 - .4, -2.2, Z0 - .4], [X0 + 45, H, Z0 + 32.4]], band: -99, bandCol: [1, 1, 1], shimmer: .3, caus: .5 });
defZone('pE', { music: 'pool', amb: { water: .35, drips: .2, verb: [0, .7, .3] }, step: 'tile', grp: 'r', k: .7, exp: .32, fog: [.3, .22, .14, .003], tint: [1.02, 1, .96], sat: 1, bloom: .3, shaft: 0, hum: 0, water: .3, wet: .4,
        box: [X0 - 9.7, Z0 + 14.5, X0 - .4, Z0 + 24.3], probe: [X0 - 8.2, 1.5, Z0 + 19], env: [[X0 - 9.4, 0, Z0 + 14.8], [X0 - .4, 3.2, Z0 + 24]] });
flats.push([X0 + 6, Z0 + 9, X0 + 32, Z0 + 23, (x, z) => poolFloor(x - X0, z - Z0)]);
pools.push([X0 + 6, Z0 + 9, X0 + 32, Z0 + 23, -2.12, 'pB', ['pB', 'pE'], [.07, .16, .15]]);
poolMats(zones.pB);

// ---------- shape helpers, all in the hall's local x, z ----------
const B = (m, x1, y1, z1, x2, y2, z2) => box(m, X0 + x1, y1, Z0 + z1, X0 + x2, y2, Z0 + z2);
const K = (m, x1, y1, z1, x2, y2, z2) => block(m, X0 + x1, y1, Z0 + z1, X0 + x2, y2, Z0 + z2);
// A surface of revolution about (cx, cz): `prof` [[r, y], ...] swept from angle a0 through aL (x = r sin a, z = r cos a, as three's lathe).
// A profile climbing faces outward, one falling faces in, one running inward faces up. UVs in metres: u round the sweep (rounded to
// whole 10 cm tiles, or `C` metres), v down the profile, so tiles keep their size and grout follows the curve.
function lathe(prof, cx, cz, a0 = 0, aL = 2 * PI, seg = 0, C = 0) {
  const n = prof.length, rm = Math.max(...prof.map(p => p[0])); seg ||= Math.max(8, Math.ceil(aL / (PI / 90)));
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg, a0, aL), uv = g.attributes.uv;
  const s = [0]; for (let j = 1; j < n; j++) s.push(s[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]));
  const L = C || Math.max(.1, Math.round(aL * rm / .1) * .1), sg = prof[n - 1][1] >= prof[0][1] ? 1 : -1;
  for (let i = 0; i <= seg; i++) for (let j = 0; j < n; j++) uv.setXY(i * n + j, i / seg * L, prof[0][1] + sg * s[j]);
  return g.translate(X0 + cx, 0, Z0 + cz);
}
// a flat horizontal polygon at height y (local [x, z] points), facing up or down; add() gives it the floor's world UVs
function flat(pts, y, up = true) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(X0 + x, up ? -(Z0 + z) : Z0 + z))));
  return g.rotateX(up ? -PI / 2 : PI / 2).translate(0, y, 0);
}
const ang = (x, z, c = [CX, 16]) => Math.atan2(x - c[0], z - c[1]); // the lathe angle of a point about a centre
const arcX = (r, z) => CX + Math.sqrt(r * r - (z - 16) ** 2); // where the arc of radius r crosses the line z
const arcPts = (r, z1, z2, n) => Array.from({ length: n + 1 }, (_, i) => { const a = ang(arcX(r, z1), z1) + (ang(arcX(r, z2), z2) - ang(arcX(r, z1), z1)) * i / n; return [CX + r * Math.sin(a), 16 + r * Math.cos(a)]; });

const z = zones.pB, T = z.tile;
const Mo = M(z, 'poolMosaic', { color: 0xeee8da, macro: .05 }); // the columns' mosaic
const Bd = M(z, 'poolMosaic', { color: 0x1f5058, roughness: .18 }); // deep teal mosaic: the frieze, the waterline band, the lane lines
const Al = M(z, 'brushedSteel', { roughness: .4, color: 0xb8b4aa }); // light slot trims
const Glow = M(null, 'opalPanel');

{ // ---------- the hall's shell ----------
  // deck round the basin (deep enough at the deep end), the basin's floors, the walls, and the ceiling round four light slots
  B(T, -.4, -2.4, -.4, 46, 0, 9); B(T, -.4, -2.4, 23, 46, 0, 32.4); B(T, -.4, -1.6, 9, 6, 0, 23); B(T, 32, -2.4, 9, 46, 0, 23);
  // the two corner fills beside the round end: tops only (the curved basin wall and the deck boxes close them)
  const arc = (a0, a1, n = 48) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [SC[0] + SR * Math.sin(a), SC[1] + SR * Math.cos(a)]; });
  add(T, flat([[13, 9], [6, 9], [6, 16], ...arc(1.5 * PI, PI)], 0)); add(T, flat([[6, 16], [6, 23], [13, 23], ...arc(2 * PI, 1.5 * PI)], 0));
  for (let i = 0; i < 12; i++) { // their solids, stepped along the arc (upright boxes, so the water's height map knows them), never into the water
    const z1 = 9 + 7 * i / 12, z2 = 9 + 7 * (i + 1) / 12, xa = Math.max(6.01, SC[0] - Math.sqrt(SR * SR - (z2 - 16) ** 2));
    solid(X0 + 6, -1.6, Z0 + z1, X0 + xa, 0, Z0 + z2); solid(X0 + 6, -1.6, Z0 + 32 - z2, X0 + xa, 0, Z0 + 32 - z1);
  }
  // the round end: the basin wall above the top step, the three steps' risers and treads, and their ends against the side walls
  add(T, lathe([[SR, 0], [SR, -.3]], ...SC, PI, PI), true);
  STEP.forEach(([r, y], i) => { const rOut = i ? STEP[i - 1][0] : SR;
    add(T, lathe([[rOut, y], [r, y]], ...SC, PI, PI)); add(T, lathe([[r, y], [r, y - .3]], ...SC, PI, PI), true);
    for (const s of [-1, 1]) { const za = 16 + s * r, zb = 16 + s * rOut, g = new THREE.PlaneGeometry(Math.abs(zb - za), y + 1.2).rotateY(PI / 2).translate(X0 + 13, (y - 1.2) / 2, Z0 + (za + zb) / 2); add(T, g); }
  });
  B(T, 6, -1.4, 9, 22, -1.2, 23); B(T, 26, -2.32, 9, 32, -2.12, 23); // shallow and deep floors
  { const L = Math.hypot(4, .92), g = new THREE.PlaneGeometry(L, 14).rotateX(-PI / 2).rotateZ(-Math.atan2(.92, 4)).translate(X0 + 24, -1.66, Z0 + 16); add(T, g); } // the slope between
  // lane lines on the floor, deep teal, 25 cm, with a T at each end
  for (const zl of [11.8, 14.6, 17.4, 20.2]) {
    K(Bd, 13.5, -1.198, zl - .125, 21.95, -1.1965, zl + .125); K(Bd, 26.05, -2.118, zl - .125, 30.5, -2.1165, zl + .125);
    const g = new THREE.PlaneGeometry(Math.hypot(4, .92), .25).rotateX(-PI / 2).rotateZ(-Math.atan2(.92, 4)).translate(X0 + 24, -1.6585, Z0 + zl); add(Bd, g);
    K(Bd, 30.5, -2.118, zl - .5, 30.75, -2.1165, zl + .5); K(Bd, 31.998, -2.1, zl - .125, 32, -.6, zl + .125); // the T, and the target line up the end wall
  }
  // the waterline band: 2 mm proud of the basin walls, 21 cm tall, its top 3 cm under the lip
  K(Bd, 13, -.24, 9, 31.998, -.03, 9.002); K(Bd, 13, -.24, 22.998, 31.998, -.03, 23); K(Bd, 31.998, -.24, 9.002, 32, -.03, 22.998);
  add(Bd, lathe([[SR - .002, -.03], [SR - .002, -.24]], ...SC, PI, PI), true);
  // walls: west with the entrance (2.4 x 3.2), south and north, the curved east wall
  B(T, -.4, 0, -.4, 0, H, 14.8); B(T, -.4, 0, 17.2, 0, H, 32.4); B(T, -.4, 3.2, 14.8, 0, H, 17.2);
  B(T, 0, 0, -.4, 41, H, 0); B(T, 0, 0, 32, 41, H, 32.4);
  const aN = ang(40, 32), aS = ang(40, 0);
  add(T, lathe([[R, H], [R, 0]], CX, 16, aN, aS - aN), true);
  for (let i = 0; i < 30; i++) { const a = aN + (aS - aN) * (i + .5) / 30, c = R * Math.sin((aS - aN) / 60) + .05;
    turned(X0 + CX + (R + .2) * Math.sin(a), Z0 + 16 + (R + .2) * Math.cos(a), .2, c, a - PI / 2, 0, H); }
  for (let i = 0; i < 16; i++) { const z2 = i + 1; // the corners of the zone's box outside the curved wall: unseen solids, nobody stands out there
    solid(X0 + arcX(R, z2), 0, Z0 - .4 + (i ? i : 0), X0 + 45.6, H, Z0 + z2); solid(X0 + arcX(R, z2), 0, Z0 + 32 - z2, X0 + 45.6, H, Z0 + 32.4 - (i ? i + .4 : 0)); }
  // the frieze: two rows of teal mosaic at 2.4 m round the walls (the entrance cuts it)
  K(Bd, 0, 2.4, 0, 40.02, 2.45, .002); K(Bd, 0, 2.4, 31.998, 40.02, 2.45, 32.002);
  K(Bd, 0, 2.4, 0, .002, 2.45, 14.8); K(Bd, 0, 2.4, 17.2, .002, 2.45, 32);
  add(Bd, lathe([[R - .002, 2.45], [R - .002, 2.4]], CX, 16, aN, aS - aN), true);
  // ceiling: a slab round four slots 50 cm wide running x 3..37 over the water, opal diffusers 25 cm up in them, aluminium trims on their lips
  const SL = [8.4, 13.2, 18.8, 23.6];
  let za = -.4; for (const s of SL) { B(T, -.4, H, za, 46, H + .3, s - .25); B(T, -.4, H, s - .25, 3, H + .3, s + .25); B(T, 37, H, s - .25, 46, H + .3, s + .25); za = s + .25; }
  B(T, -.4, H, za, 46, H + .3, 32.4);
  for (const s of SL) {
    add(Glow, new THREE.PlaneGeometry(34, .5).rotateX(PI / 2).translate(X0 + 20, H + .25, Z0 + s));
    for (const e of [-1, 1]) { K(Al, 3, H - .004, s + e * .25 - (e > 0 ? .02 : 0), 37, H - .0015, s + e * .25 + (e > 0 ? 0 : .02)); }
  }
  // the light line where the ceiling meets the curved wall: a 30 cm slot of opal round the arc
  add(Glow, lathe([[R - .3, H - .002], [R, H - .002]], CX, 16, aN, aS - aN)); // a profile running outward faces down
}

{ // ---------- the gallery along the curved wall, and the stair up to it along the south wall ----------
  const pts = [...arcPts(RI, 1.6, 32, 64), ...arcPts(R, 32, 1.6, 64)];
  add(T, flat(pts, GY)); add(T, flat(pts, GY - .4, false));
  const a1 = ang(arcX(RI, 32), 32), a2 = ang(arcX(RI, 1.6), 1.6);
  add(T, lathe([[RI, GY], [RI, GY - .4]], CX, 16, a1, a2 - a1), true); // its fascia
  add(Bd, lathe([[RI - .002, GY - .12], [RI - .002, GY - .17]], CX, 16, a1, a2 - a1), true); // the frieze carried along it
  for (let i = 0; i < 24; i++) { const a = a1 + (a2 - a1) * (i + .5) / 24, c = (R + RI) / 2, h = c * Math.sin((a2 - a1) / 48) + .1;
    turned(X0 + CX + c * Math.sin(a), Z0 + 16 + c * Math.cos(a), (R - RI) / 2, h, a - PI / 2, GY - .4, GY); }
  B(T, 36.2, GY - .4, 0, 40.6, GY, 1.6); // the landing at the stair's head (its far end runs on behind the curved wall)
  const N = 17, x1 = 31.7, x2 = 36.2, run = (x2 - x1) / N;
  flight(T, X0 + x1, Z0, X0 + x2, Z0 + 1.6, 'x', 1, 0, N, .25);
  for (let i = 0; i < N; i++) { const a = x1 + run * i, y = .25 * (i + 1);
    K(Bd, a, y, 0, a + .045, y + .0015, 1.6); // a teal nosing on every tread
    solid(X0 + a, y, Z0 + 1.5, X0 + a + run, y + 1.05, Z0 + 1.6); } // the open side closed, as its railing shows
  K(Bd, x2, GY, 0, x2 + .045, GY + .0015, 1.6);
  // one railing: up the stair's open side (posts on every fourth tread, so each stands on one), along the landing, round the gallery's edge
  const tc = i => [X0 + x1 + run * (i + .5), .25 * (i + 1), Z0 + 1.52];
  const edge = arcPts(RI + .12, 1.9, 31.85, 25).map(([x, zz]) => [X0 + x, GY, Z0 + zz]);
  railing(z, [tc(0), tc(4), tc(8), tc(12), tc(16), [X0 + 36.32, GY, Z0 + 1.52], [X0 + 36.98, GY, Z0 + 1.52], ...edge]);
}

{ // ---------- eight great columns: a tiled plinth, a shaft of mosaic 2.39 m across, a coved capital into the ceiling ----------
  const r = 7.5 / (2 * PI); // 7.5 m round: a whole number of the mosaic's 0.5 m sheets, so no seam
  const cove = Array.from({ length: 11 }, (_, i) => { const t = 1.3 * i / 10; return [r + .554 * (1 - Math.cos(t)), H - .55 + .574 * Math.sin(t)]; });
  for (const x of [9, 17, 25, 33]) for (const zc of [4.4, 27.6]) {
    add(T, lathe([[1.32, 0], [1.32, .24], [1.31, .272], [1.29, .292], [1.26, .3], [r, .3]], x, zc, 0, 2 * PI, 96, 8), true);
    add(Mo, lathe([[r, .3], [r, H - .55]], x, zc, 0, 2 * PI, 120, 7.5), true);
    add(Mo, lathe(cove, x, zc, 0, 2 * PI, 120, 7.5), true);
    for (const y of [2.4, H - .62]) add(Bd, lathe([[r + .002, y], [r + .002, y + .05]], x, zc, 0, 2 * PI, 120, 7.5), true);
    round(X0 + x, Z0 + zc, 1.32, 0, .3); round(X0 + x, Z0 + zc, r, 0, H);
  }
}

{ // ---------- light: eight shadow lamps under the four slots, one over the gallery; the curved wall washed from its light line ----------
  for (const s of [8.4, 13.2, 18.8, 23.6]) for (const x of [11.5, 28.5]) lit(z, X0 + x, H - .1, Z0 + s, 290, [X0 + x, 0, Z0 + s], 1.35, 26, 0xffd6a4);
  lit(z, X0 + 40.5, H - .1, Z0 + 16, 90, [X0 + 43.5, GY, Z0 + 16], 1.3, 16, 0xffd29c);
  const aN = ang(40, 32), aS = ang(40, 0);
  for (let i = 0; i < 8; i++) { const a = aN + (aS - aN) * (i + .5) / 8; fixture(z, X0 + CX + (R - 1.6) * Math.sin(a), H - .6, Z0 + 16 + (R - 1.6) * Math.cos(a), 5); }
  for (const x of [16, 22, 28]) { poolLight(z, X0 + x, -.62, Z0 + 9, 0, { power: 4 }); poolLight(z, X0 + x, -.62, Z0 + 23, PI, { power: 4 }); }
}

{ // ---------- the pool's fittings ----------
  drain(z, X0 + 22.52, 0, Z0 + 8.86, PI / 2, { l: 19.04, w: .2 }); drain(z, X0 + 22.52, 0, Z0 + 23.14, PI / 2, { l: 19.04, w: .2 }); // the overflow gutter
  drain(z, X0 + 32.14, 0, Z0 + 16, 0, { l: 14.48, w: .2 });
  poolLadder(z, X0 + 29.5, 0, Z0 + 9, 0); poolLadder(z, X0 + 29.5, 0, Z0 + 23, PI); // a ladder each side at the deep end
  for (const a of [1.25 * PI, 1.75 * PI]) railing(z, [7.5, 5.4].map((p, i) => [X0 + SC[0] + p * Math.sin(a), i ? -1.2 : 0, Z0 + SC[1] + p * Math.cos(a)]), { h: .9, mid: false }); // grab rails down the round steps
  rings.push(...[[0xff7fa8, 17.5, 12.2], [0xffc93a, 27.4, 19.6], [0x4fbfa5, 10.5, 17.8]].map(([c, x, zc]) => { const m = swimRing(z, { color: c }); m.position.set(X0 + x, WY + .05, Z0 + zc); return m; }));
  loose.push({ mesh: beachBall(z), r: .25, pos: [X0 + 21, WY + .21, Z0 + 15], region: [X0, Z0, X0 + 40, Z0 + 32], float: .08, bounce: .6, grip: .6, spin: 1, solid: 1 });
}

{ // ---------- the entrance passage: in at the door in its south end (the hotel's east door 24 through a portal), north 9 m, then east into the hall ----------
  const e = zones.pE, Tp = M(e, 'poolTile'), Bp = M(e, 'poolMosaic', { color: 0x1f5058, roughness: .18 }), h = 3.2;
  B(Tp, -9.7, -.2, 14.5, -.4, 0, 24.3); B(Tp, -9.7, h, 14.5, -.4, h + .2, 24.3);
  B(Tp, -9.7, 0, 14.5, -9.4, h, 24.3); B(Tp, -9.4, 0, 14.5, -.4, h, 14.8); B(Tp, -7, 0, 17.2, -6.7, h, 24); B(Tp, -6.7, 0, 17.2, -.4, h, 17.5);
  B(Tp, -9.4, 0, 24, -8.7, h, 24.3); B(Tp, -7.7, 0, 24, -6.7, h, 24.3); B(Tp, -8.7, 2.24, 24, -7.7, h, 24.3); // its south wall round the door
  for (const [y1, y2] of [[2.4, 2.45], [0, .1]]) { // the frieze and a teal base course, carried round from the hall
    K(Bp, -9.4, y1, 14.8, -9.398, y2, 24); K(Bp, -9.4, y1, 14.8, -.4, y2, 14.802); K(Bp, -7.002, y1, 17.5, -7, y2, 24); K(Bp, -7, y1, 17.198, -.4, y2, 17.2);
    K(Bp, -9.4, y1, 23.998, -8.7, y2, 24); K(Bp, -7.7, y1, 23.998, -7, y2, 24);
  }
  door(e, X0 - 8.2, 0, Z0 + 24.05, 0, { open: 1.65, color: 0x4b2418, frame: 0xd8ccb4 });
  portal([5.4, 0, 24, -PI / 2], [X0 - 8.2, 0, Z0 + 24.3, PI]); // the hallway's east door 24 (its plane the wall's back face) is this door's outer face
  opalPanel(e, X0 - 8.2, h, Z0 + 20.6, 0, { w: .6, l: 1.2, power: 22 }); opalPanel(e, X0 - 8.2, h, Z0 + 16, 0, { w: .6, l: .6, power: 14 }); opalPanel(e, X0 - 3.6, h, Z0 + 16, PI / 2, { w: .6, l: 1.2, power: 22 });
}

// ---------- objects ----------
// Glazed ceramic plaques with the game's lettering (Georgia, as the hotel's room numbers): one canvas atlas and one material a zone,
// a 4:1 cell per text. Returns (i, w, h) => [material, the i-th cell as a plane facing +z].
function plaques(zz, texts) {
  const n = texts.length, c = document.createElement('canvas'), g = c.getContext('2d'); c.width = 512; c.height = 128 * n;
  texts.forEach((t, i) => { const y = 128 * i; g.fillStyle = '#ebe4d2'; g.fillRect(0, y, 512, 128); g.strokeStyle = '#1f5058'; g.lineWidth = 6; g.strokeRect(12, y + 12, 488, 104);
    g.fillStyle = '#173d43'; g.font = '600 70px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 256, y + 68, 450); });
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const m = P(zz, { map, roughness: .2 });
  return (i, w, h) => { const q = new THREE.PlaneGeometry(w, h), uv = q.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / n); return [m, q]; };
}
// A tube bent through points (corners rounded to radius rb), as the ladders' and rails' are bent
function bent(pts, r, rb = .08) {
  const v = pts.map(p => new THREE.Vector3(...p)), path = new THREE.CurvePath(); let a = v[0];
  for (let i = 1; i < v.length - 1; i++) { const p = v[i], d0 = p.clone().sub(v[i - 1]), d1 = v[i + 1].clone().sub(p), k0 = Math.min(rb, d0.length() / 2), k1 = Math.min(rb, d1.length() / 2);
    const b = p.clone().addScaledVector(d0.normalize(), -k0), c = p.clone().addScaledVector(d1.normalize(), k1);
    path.add(new THREE.LineCurve3(a, b)); path.add(new THREE.QuadraticBezierCurve3(b, p, c)); a = c; }
  path.add(new THREE.LineCurve3(a, v.at(-1)));
  return new THREE.TubeGeometry(path, Math.max(8, Math.ceil(path.getLength() / .025)), r, 16, false);
}
// A lifeguard's chair: two side frames of 42 mm polished stainless tube (rear leg rising into the back post and bent forward over the arm
// and down to the seat's front, a straight raked front leg), four hardwood treads on angle brackets between the front legs, a slatted
// seat and back, rubber feet. Own frame: feet at y 0, facing +z; climbed from the front.
function lifeguardChair(zz, x, y, zc, ry = 0) {
  const C = zz.metal, Wd = M(zz, 'benchWood'), Rb = M(zz, 'rubber', { color: 0x252321 }), St = M(zz, 'brushedSteel', { roughness: .45 }), A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  const r = .021, fz = yy => .66 - (yy - .03) / 1.59 * .44, rz = yy => -.62 + (yy - .03) / 1.59 * .32;
  for (const sx of [-.36, .36]) {
    A(C, bent([[sx, .03, -.62], [sx, 1.62, -.3], [sx, 2.25, -.38], [sx, 2.25, .1], [sx, 1.68, .2]], r, .1), true);
    A(C, bent([[sx, .03, .66], [sx, 1.62, .22]], r), true); A(C, bent([[sx, 1.6, -.29], [sx, 1.6, .21]], r * .85), true); // front leg, seat rail
    for (const fzz of [.66, -.62]) A(Rb, new THREE.CylinderGeometry(r + .006, r + .009, .045, 16).translate(sx, .0225, fzz)); // feet
  }
  for (const yy of [.3, 1.1]) A(C, bent([[-.36, yy, rz(yy)], [.36, yy, rz(yy)]], r * .85), true); // rear cross tubes
  for (const yy of [.34, .68, 1.02, 1.36]) { const tz = fz(yy) - .03;
    A(Wd, new RoundedBoxGeometry(.7, .035, .16, 2, .008).translate(0, yy - .0175, tz));
    for (const sx of [-.33, .33]) A(St, new THREE.BoxGeometry(.035, .004, .14).translate(sx, yy - .037, tz)); // its angle brackets
    solidAt(x, y, zc, ry, 0, yy - .0175, tz, .7, .035, .16);
  }
  for (let i = 0; i < 4; i++) A(Wd, new RoundedBoxGeometry(.78, .032, .1, 2, .008).translate(0, 1.637, -.24 + i * .125)); // seat slats
  for (const yy of [1.82, 1.97, 2.12]) A(Wd, new RoundedBoxGeometry(.7, .08, .024, 2, .006).translate(0, yy, -.335 - (yy - 1.62) * .12)); // back slats
  solidAt(x, y, zc, ry, 0, .83, -.2, .74, 1.66, .74); // the frame below the seat, and the seat to stand or sit on
}
// A wall clock, 1.1 m across: a dark enamelled steel case with a polished bezel, an ivory dial with minute and hour marks and the game's
// numerals, black hands at ten past ten. Own frame: its back on the wall at z 0, centre at the given height, face toward +z.
function wallClock(zz, x, y, zc, ry = 0, rd = .55) {
  const Cs = M(zz, 'paintedSteel', { color: 0x1f2b2a, roughness: .35 }), Bz = zz.metal, Hd = M(zz, 'paintedSteel', { color: 0x141414, roughness: .4 }), A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  const c = document.createElement('canvas'), g = c.getContext('2d'); c.width = c.height = 1024; g.fillStyle = '#efe7d4'; g.fillRect(0, 0, 1024, 1024);
  g.translate(512, 512); g.fillStyle = '#1b1a17';
  for (let i = 0; i < 60; i++) { g.save(); g.rotate(i * PI / 30); if (i % 5) g.fillRect(-4, -490, 8, 30); else g.fillRect(-11, -490, 22, 78); g.restore(); }
  g.font = '600 92px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) g.fillText(String(i), 340 * Math.sin(i * PI / 6), -340 * Math.cos(i * PI / 6) + 4);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  A(Cs, new THREE.LatheGeometry([[rd + .03, 0], [rd + .045, .012], [rd + .045, .06], [rd + .035, .075]].map(([a, b]) => new THREE.Vector2(a, b)), 96).rotateX(PI / 2));
  A(Bz, new THREE.LatheGeometry([[rd + .035, .075], [rd + .03, .085], [rd + .012, .088], [rd - .002, .082], [rd - .006, .07]].map(([a, b]) => new THREE.Vector2(a, b)), 96).rotateX(PI / 2));
  A(P(zz, { map, roughness: .3 }), new THREE.CircleGeometry(rd - .004, 96).translate(0, 0, .06), true);
  const hand = (len, w, a, dz) => A(Hd, new RoundedBoxGeometry(w, len + .08, .006, 2, .0025).translate(0, len / 2 - .04, dz).rotateZ(-a));
  hand(.3, .042, (10 + 8 / 60) / 12 * 2 * PI, .064); hand(.45, .028, 8 / 60 * 2 * PI, .071);
  A(Hd, new THREE.CylinderGeometry(.026, .026, .022, 24).rotateX(PI / 2).translate(0, 0, .072));
}
{
  const txt = plaques(z, ['1.2 m', '2.0 m', 'NO DIVING']);
  for (const [i, x] of [[0, 15], [1, 29]]) { // depth marks set in the deck beyond the gutters, both sides, reading toward the water
    const [m, q] = txt(i, .52, .13); add(m, put(q.rotateX(-PI / 2).translate(0, .002, 0), X0 + x, 0, Z0 + 8.5, PI), true);
    const [m2, q2] = txt(i, .52, .13); add(m2, put(q2.rotateX(-PI / 2).translate(0, .002, 0), X0 + x, 0, Z0 + 23.5, 0), true);
  }
  { const [m, q] = txt(2, .8, .2); add(m, put(q.rotateX(-PI / 2).translate(0, .002, 0), X0 + 4.4, 0, Z0 + 16, -PI / 2), true); }
  const sg = plaques(zones.pE, ['BATHS  →']); { const [m, q] = sg(0, 1.6, .4); add(m, q.translate(X0 - 8.2, 1.8, Z0 + 14.803), true); } // facing the door
  wallClock(z, X0 + CX + R - .003, 7.3, Z0 + 16, -PI / 2); // on the curved wall over the gallery, on the axis from the entrance
  lifeguardChair(z, X0 + 21, 0, Z0 + 24.95, PI);
  mallBench(z, X0 + 13, 0, Z0 + .55, 0); mallBench(z, X0 + 21, 0, Z0 + .55, 0); mallBench(z, X0 + 13, 0, Z0 + 31.45, PI); // against the walls behind the columns
  for (const a of [PI / 2 - .2, PI / 2 + .2]) mallBench(z, X0 + CX + 27.3 * Math.sin(a), GY, Z0 + 16 + 27.3 * Math.cos(a), a + PI); // on the gallery, facing the water
}
