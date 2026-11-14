// Kit: light fittings (troffers, battens, panels, sconces, street and mast lamps, globes, step lights, neon, pool lights).
// Materials: js/tex/light.js. Convention, the yard and the inventory: docs/props.md.
import * as THREE from 'three';
import { V, H } from '../core.js';
import { M } from '../mat.js';
import { emitters, add, box, round, lit, put, solidAt } from '../build.js';

const PI = Math.PI, v2 = (r, y) => new THREE.Vector2(r, y);
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
function rrect(w, h, r, p = new THREE.Shape()) { // a rounded rectangle centred on 0 (a Shape, or a Path for a hole)
  const x = w / 2 - r, y = h / 2 - r;
  p.moveTo(x + r, -y); p.lineTo(x + r, y); p.absarc(x, y, r, 0, PI / 2); p.lineTo(-x, y + r); p.absarc(-x, y, r, PI / 2, PI);
  p.lineTo(-x - r, -y); p.absarc(-x, -y, r, PI, 1.5 * PI); p.lineTo(x, -y - r); p.absarc(x, -y, r, 1.5 * PI, 2 * PI); return p;
}
// a pressed or cast plate: the shape extruded along z (centred on 0), every edge rolled over a radius `bev`
const plate = (shape, depth, bev, seg = 3) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: seg, curveSegments: 8 }).translate(0, 0, -depth / 2);
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => v2(r, y)), seg); // profile listed bottom to top: outward normals
const pipe = (pts, r, seg, rad = 16) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p))), seg, r, rad);

// ---------- recessed troffer: a lay-in fitting, 600 x 1200 or 600 x 600 ----------
// A pressed-steel door frame (22 mm flange with a rolled edge, 9 mm proud of the ceiling) holding a prismatic lens 5 mm up inside it.
// The lens's own UVs put the two tubes across its width; each fitting is turned end for end and slid along its tubes by its own
// seed, so the dust and insects on it differ from its neighbour's. y: the ceiling's underside. o: w, l (m), on, power, seed.
function troffer(z, x, y, zc, ry = 0, o = {}) {
  const w = o.w || .6, l = o.l || 1.2, on = o.on !== false, s = o.seed ?? hash(x, zc);
  const fr = M(z, 'paintedSteel', { color: 0xe4e0d4, wear: .1, dirt: .15, dirtCol: [.55, .5, .42], roughness: .38 });
  const lens = on ? M(null, 'troffer', { uv: [.6, .6] }) : M(z, 'trofferOff', { uv: [.6, .6], roughness: .35 });
  const b = .003, f = .022, g = rrect(w - .006 - 2 * b, l - .006 - 2 * b, .004); g.holes.push(rrect(w - .006 - 2 * f + 2 * b, l - .006 - 2 * f + 2 * b, .002, new THREE.Path()));
  add(fr, put(plate(g, .006, b).rotateX(PI / 2).translate(0, -.006, 0), x, y, zc, ry)); // y + .003 (into the ceiling) to y - .009
  const wi = w - .006 - 2 * f + .004, li = l - .006 - 2 * f + .004, q = new THREE.PlaneGeometry(wi, li).rotateX(PI / 2), uv = q.attributes.uv, mir = s > .5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, mir ? 1 - uv.getX(i) : uv.getX(i), uv.getY(i) * li / wi + s * 7.31 % 1);
  add(lens, put(q.translate(0, -.004, 0), x, y, zc, ry), true);
  if (on) emitters.push({ zone: z, p: V(x, y - .05, zc), t: V(x, 0, zc), power: (o.power ?? 120) * (y / H) ** 2, angle: 1.45, dist: 16, color: 0xfff0cf });
}
const lamp = (z, x, zc, h = H, on = true, power = 120) => troffer(z, x, h, zc, 0, { on, power }); // the 600 x 1200 panel on the 60 cm grid, plus its light

// ---------- surface T8 batten: a pressed-steel channel on the ceiling, a lampholder at each end, the tube held by two C-clips ----------
// Along x, y: the ceiling's underside. The tube's own UVs are in metres (along it, round it), so its LEDs sit on their 10 mm pitch and its
// aluminium back faces up into the channel. o: l (1.2 m or 1.5 m), on, power (0: glows only).
function batten(z, x, y, zc, ry = 0, o = {}) {
  const L = o.l || 1.2, on = o.on !== false, A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  const st = M(z, 'paintedSteel', { color: 0xe4e0d4, wear: .1, dirt: .15, dirtCol: [.55, .5, .42], roughness: .38 }), pl = M(z, 'hardPlastic', { color: 0xe6e2d6, roughness: .45 });
  const tm = on ? M(null, 'ledTube') : M(z, 'ledTube', { emit: null, color: 0xc8c4b8 }), ty = -.05, tl = L - .05;
  A(st, plate(rrect(.052, .03, .009), L - .006, .003).rotateY(PI / 2).translate(0, -.018, 0)); // the channel, 9 mm proud of the ceiling at its ends
  for (const s of [-1, 1]) {
    A(pl, plate(rrect(.036, .046, .007), .014, .003).rotateY(PI / 2).translate(s * (L / 2 - .016), -.052, 0)); // lampholder
    A(pl, new THREE.CylinderGeometry(.0136, .0136, .016, 32, 1).rotateZ(PI / 2).translate(s * (tl / 2 - .006), ty, 0)); // the tube's end cap
    A(pl, new THREE.TorusGeometry(.0148, .0024, 8, 24, PI * 1.45).rotateZ(-PI * .225 + PI / 2 + PI).rotateY(PI / 2).translate(s * L / 4, ty, 0)); // C-clip round the tube
    A(pl, new THREE.BoxGeometry(.008, .022, .01).translate(s * L / 4, ty + .022, 0)); // its stem into the channel
  }
  const t = new THREE.CylinderGeometry(.0128, .0128, tl - .028, 40, 1, true).rotateZ(-PI / 2).rotateX(-PI / 2), uv = t.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * (tl - .028), uv.getX(i) * .075);
  A(tm, t.translate(0, ty, 0), true);
  if (on && o.power) lit(z, x, y - .08, zc, o.power, [x, 0, zc], 1.5, 10, 0xffd8a8);
}

// ---------- park lamp posts: a fluted cast base, a tapered steel pole, and a crook-neck lantern or a globe on top ----------
const base = () => { // cast bell base, 340 mm across, 16 flutes fading in and out over its shaft
  const p = [[0, 0], [.168, 0], [.172, .008], [.172, .045], [.165, .058], [.148, .064], [.145, .072], [.145, .1], [.138, .112], [.118, .13], [.108, .16]];
  for (let y = .18; y <= .481; y += .03) p.push([.108 - (y - .16) * .09, y]);
  p.push([.072, .5], [.084, .512], [.086, .53], [.08, .545], [.058, .552], [.042, .56]);
  const g = lathe(p, 64), a = g.attributes.position;
  for (let i = 0; i < a.count; i++) { const y = a.getY(i), k = Math.sin(PI * Math.min(1, Math.max(0, (y - .18) / .3))) ** .5, ph = Math.atan2(a.getZ(i), a.getX(i));
    const s = 1 - .07 * k * (.5 + .5 * Math.cos(16 * ph)) ** 2; a.setX(i, a.getX(i) * s); a.setZ(i, a.getZ(i) * s); }
  g.computeVertexNormals(); return g;
};
const collar = (y, r) => lathe([[r - .012, y - .03], [r, y - .022], [r + .004, y - .01], [r + .004, y + .01], [r, y + .022], [r - .012, y + .03]], 32);
const glassBall = (cy, r, neck, top = true) => { // a globe blown round a neck of radius `neck`: from the bottom pole up, or from the neck up
  const p = [], a0 = top ? -Math.acos(neck / r) : -PI / 2, a1 = top ? PI / 2 : Math.acos(neck / r);
  if (!top) p.push([0, cy - r]);
  for (let i = top ? 0 : 1; i <= 20; i++) { const a = a0 + (a1 - a0) * i / 20; p.push([r * Math.cos(a), cy + r * Math.sin(a) * 1.04]); }
  if (top) p.unshift([neck - .004, cy - r * Math.sin(Math.acos(neck / r)) * 1.04 - .012]); else p.push([neck - .002, p[p.length - 1][1] + .03]);
  return lathe(p, 48);
};
// o: metal (the place's own, else dark green cast iron), glass (the unlit globe's material), on (needs z), power, reach (arm, m), globe: a globe on top instead
function streetLamp(z, x, y, zc, ry = 0, o = {}) {
  const on = z && o.on !== false, metal = o.metal || M(z, 'castIron', { color: 0x31403a }), R = o.reach ?? .95;
  const glass = on ? M(null, 'frostedGlobe', { uv: [.1, .1] }) : o.glass || M(z, 'frostedGlobe', { uv: [.1, .1], emit: null, color: 0xd8d4c8, roughness: .3 });
  const A = (m, g, own) => add(m, put(g, x, y, zc, ry), own), top = o.globe ? 2.95 : 3.4;
  A(metal, base()); A(metal, new THREE.CylinderGeometry(.031, .041, top - .55, 32, 1, true).translate(0, (top + .55) / 2, 0)); A(metal, collar(top - .02, .046));
  let hx, hy;
  if (o.globe) { // a cast fitter cup and a 360 mm opal globe
    A(metal, lathe([[.03, top - .02], [.045, top + .01], [.07, top + .045], [.082, top + .06], [.082, top + .072], [.074, top + .076]], 48));
    A(glass, glassBall(top + .25, .18, .072), true); hx = 0; hy = top + .25;
  } else { // the crook: one bent tube from a socket on the pole over to the lantern, a scroll bracing it, the lantern hung from its end
    const k = R / .95, c = [[0, top - .02], [0, 3.74], [.07, 3.95], [.28, 4.05], [.55, 4.05], [.78, 4.0], [.91, 3.93], [.95, 3.86]].map(([a, h]) => [a * k, h, 0]);
    A(metal, pipe(c, .026, 80, 20)); A(metal, pipe([[0, 3.52, 0], [.1, 3.55, 0], [.2 * k, 3.66, 0], [.27 * k, 3.83, 0], [.3 * k, 4.02, 0]], .011, 40, 10));
    hx = R; const hood = [[.088, 3.752], [.13, 3.748], [.158, 3.744], [.167, 3.748], [.169, 3.755], [.165, 3.762], [.156, 3.768], [.148, 3.784], [.134, 3.804], [.114, 3.823], [.09, 3.839],
      [.066, 3.852], [.048, 3.86], [.038, 3.866], [.036, 3.875], [.036, 3.922], [.032, 3.93]]; // a rolled bead at the rim, a spun dome, the socket
    A(metal, lathe(hood, 48).translate(R, 0, 0)); A(metal, new THREE.TorusGeometry(.089, .007, 8, 40).rotateX(PI / 2).translate(R, 3.735, 0));
    A(glass, glassBall(3.6, .13, .085, false).translate(R, 0, 0), true); hy = 3.6;
  }
  round(x, zc, .17, y - .4, y + .1); round(x, zc, .11, y + .1, y + .55); round(x, zc, .045, y + .55, y + top + .05);
  if (on) { const c = Math.cos(ry), s = Math.sin(ry), px = x + hx * c, pz = zc - hx * s;
    lit(z, px, y + hy, pz, o.power ?? 90, [px, y, pz], o.globe ? 1.5 : 1.2, 18, 0xffc98a); }
}
// the old helper's signature: a crook-neck lamp reaching (ax, az) * .95 m, lit only where a zone is given
const post = (mat, globe, x, y, zc, ax, az, power, zone) => streetLamp(zone, x, y, zc, Math.atan2(-az, ax), { metal: mat, glass: globe, power, reach: .95 * Math.hypot(ax, az) });
const globeLamp = (z, x, y, zc, ry = 0, o = {}) => streetLamp(z, x, y, zc, ry, { ...o, globe: true });

// ---------- hotel wall sconce ----------
// Origin on the wall's face at the backplate's centre, front (+z) into the room. A cast brass backplate with rolled edges and two
// domed fixing screws, a swan-neck arm out of a boss, a fitter cup and an etched glass tulip, open at the top. o: on, power (0: glows only).
function sconce(z, x, y, zc, ry = 0, o = {}) {
  const on = o.on !== false, br = M(z, 'brass', { roughness: .3 });
  const glass = on ? M(null, 'frostedGlobe', { uv: [.1, .1] }) : M(z, 'frostedGlobe', { uv: [.1, .1], emit: null, color: 0xd8d4c8, roughness: .3 });
  const A = (m, g, own) => add(m, put(g, x, y, zc, ry), own);
  A(br, plate(rrect(.104, .214, .018), .006, .004, 4).translate(0, 0, .007));
  for (const sy of [-.082, .082]) A(br, new THREE.SphereGeometry(.0055, 14, 6, 0, 2 * PI, 0, PI / 2).scale(1, 1, .6).rotateX(PI / 2).translate(0, sy, .014));
  A(br, lathe([[.0, 0], [.02, 0], [.022, .004], [.02, .012], [.012, .018], [.009, .026]], 32).rotateX(PI / 2).translate(0, -.025, .013));
  A(br, pipe([[0, -.025, .03], [0, -.024, .07], [0, -.005, .11], [0, .03, .128], [0, .045, .13]], .0075, 24, 12));
  const cy = .04, cz = .13;
  A(br, lathe([[0, cy - .004], [.011, cy - .002], [.016, cy + .008], [.024, cy + .02], [.032, cy + .03], [.035, cy + .034], [.034, cy + .038]], 40).translate(0, 0, cz));
  A(glass, lathe([[.03, cy + .034], [.04, cy + .048], [.052, cy + .075], [.06, cy + .105], [.064, cy + .135], [.066, cy + .158], [.067, cy + .166], [.064, cy + .17]], 48).translate(0, 0, cz), true);
  solidAt(x, y, zc, ry, 0, .05, .1, .14, .32, .2);
  if (on && o.power) { const c = Math.cos(ry), s = Math.sin(ry); lit(z, x + cz * s, y + .12, zc + cz * c, o.power, [x + .8 * s, 0, zc + .8 * c], 1.4, 8, 0xffcf96); }
}

function yard(plot) { // the lights plot in the dev yard (js/zones/yard.js): one of each fitting, lamps glowing in its dark corner
  const z = plot.zone, X = plot.x, Z = plot.z, cy = 2.7;
  box(M(z, 'ceilingTile'), X + 4.6, cy, Z + .5, X + 9.4, cy + .06, Z + 4.5); // a ceiling island at room height for the troffers
  troffer(z, X + 5.9, cy, Z + 2.5, 0, { power: 60 }); troffer(z, X + 7.1, cy, Z + 2.5, 0, { on: false }); troffer(z, X + 8.3, cy, Z + 2.2, 0, { l: .6, power: 40 });
  batten(z, X + 6.6, cy, Z + 4, 0, { power: 25 });
  streetLamp(z, X + 1, 0, Z + 2.4, 0, { power: 60 }); // in the dark corner, its lantern toward +x
  sconce(z, X + 2.7, 1.9, Z + .01, 0, {}); // on the dark corner's back wall
  globeLamp(z, X + 12, 0, Z + 4, 0, { power: 40 });
}

export { lamp, post, troffer, batten, streetLamp, globeLamp, sconce, yard };
