# Building reference

## Code layout

- `js/core.js`: renderer, scene, camera, constants, the zone registry (`defZone`).
- `js/tex.js`: procedural textures. `js/mat.js`: materials (see [materials.md](materials.md)).
- `js/build.js`: the level builder and the registries places hand things to the rest of the game through.
- `js/props/<group>.js`: the prop kits (lights, metalwork, garden, play, structure); places call them for objects (see [props.md](props.md)).
- `js/zones/<place>.js`: everything about one place: its zones, materials, geometry, floors, lights, props. `js/level.js` imports them in order.
- `js/sky.js`, `water.js`, `lights.js`, `post.js`, `audio.js`, `player.js`, `physics.js`, `dev.js`, `main.js`.
- Imports only point back to earlier files, and places never import each other.
- `vendor/three/`: the three.js r170 files the game imports (the import map in `index.html` points there; no CDN). After changing any code, run `node tools/bundle.mjs` to rebuild `dreamcore.html`, the single-file copy; `tools/test.mjs` fails while it is stale. Imports must stay plain strings (`import('./x.js')`, not a computed path) and modules must not use `import.meta`; the bundler refuses both.

## Adding a place

A new file in `js/zones/` and one import line in `js/level.js`, plus these shared edits when they apply:

- A far-off place reached by a dark passage adds a row to `tunnels` in `js/zones/passages.js`.
- A new sky adds an entry to `skies` in `js/sky.js` and a key to `skyOnly` in `js/build.js`.
- A place that looks through a doorway at another place's pool adds its zone id to that pool's seen-from list in the other place's file; otherwise the water is hidden.
- Then run `node tools/pvs.mjs --port <port>`: it rewrites `js/seen.js`, which zones can be seen from which. Each place's meshes are drawn only from zones that can see it; a new zone is drawn from everywhere until it is listed, and a new doorway or window into an old zone needs the run too (`tools/test.mjs` checks it). Besides its 1 m grid it samples the walk list of `tools/walk.mjs` (every opening crossed at 10 cm, every zone's centre line, standing and mid-jump eyes), so narrow sight lines through a doorway are not stepped over; `tools/seams.mjs --pop` checks the same points.
- A new enclosed zone gives its reflection box in its zone definition, `env: [[minX, floorY, minZ], [maxX, ceilY, maxZ]]` (as `js/zones/mall.js` does), so reflections are box-projected to its walls; outdoor zones give none.
- A new place names its music: `music: '<piece>'` in its zone definition, a piece from `pieces` in `js/music.js` (a new piece keeps to the D major notes and the 10 s bar, and is balanced with `node tools/music.mjs`), or `music: null` for none.
- A new `step` sound name needs an entry in `kinds` in `js/audio.js` to sound different; without one it plays as carpet.

## Geometry

Shapes go into one list per material and are merged into one mesh each (`add(mat, geometry)`), so use few materials and get few draw calls. `add()` gives box-projected UVs in metres; `add(mat, geometry, true)` keeps the geometry's own UVs (for materials with a direction: brushed metal, wood, cloth).

Rounded boxes: import `RoundedBoxGeometry` from `build.js`, not from three's addons. It is the same shape, built once per set of arguments and handed out as a copy (the places ask for about 3800 of some 550 kinds, and building each one was a fifth of the load).

No two faces in one plane: one surface per plane (trim the hidden face, let one place own a shared face, a twin passage takes `passage()`'s wall depth so the doorway's reveal is the place's); trim, inlays and linings that sit proud stand at least 1.5 mm proud. The suite checks it (`node tools/seams.mjs --scan`).

## Making things solid

Used by `js/player.js` and `js/physics.js`. A solid blocks the body where it overlaps it above step height (0.35 m), its top is ground you can stand on, and its underside stops a jump. A jump peaks at about 0.84 m (rising against 16 m/s², falling at 24) and carries about 1.7 m walking (2.85 m/s), 3.5 m running (6 m/s) and 4.2 m at the 7.2 m/s a chain of strafing hops can build; at every landing height that is no farther than a 6 m/s run carried under the old single 11 m/s² arc (4.5 m on the level), so the level needs no new seals.

- `box()` is solid over its true extent by itself. `block()` is the same shape and never solid.
- For anything built otherwise, add its solid in the same place file:
  - `solid(x1, y1, z1, x2, y2, z2)`: an upright box.
  - `round(x, z, r, y1, y2)`: a post, trunk or column.
  - `turned(cx, cz, hx, hz, ry, y1, y2)`: a box turned by `rotateY(ry)`.
- A slope is a few stepped solids, or a height function in `flats` (`[x1, z1, x2, z2, (x, z) => height]`; a later entry overrides an earlier one).
- `slab(..., through = true)` gives the piers between its arches solids, plus stepped solids under each arch head. `post()` and `doorway()` add their own.
- If something looks like you could stand on it, you can; if a ledge leads out of the level, close it with an unseen thin solid.

## Loose things

`js/physics.js` moves them; fixed 60 Hz steps, deterministic under `dev.hold` + `dev.step`.

- A place pushes `{ mesh, r, pos, region, bounce, grip, ... }` onto `loose` in `js/build.js` (the fields are listed there): balls that fall, roll, float (`float`), stop the body (`solid`) and sleep when still. An `InstancedMesh` holds many.
- A swim ring is a torus mesh pushed onto `rings`; it floats on the pool's waves.
- Their shadows are redrawn on their own, over a cached copy of each map's static casters (see Light), so a moving ring or ball costs only itself.
- Budget, checked in `tools/test.mjs`: under 0.3 ms a frame at rest; in a splash under 1 ms median and under 3 ms at the 95th percentile.

## Light

- Nine shadow-casting lamps are shared by every fixture in the level and follow the player; a place registers fixtures with `lamp()` or `lit()` and they cost nothing more.
- Shadow maps are drawn only when asked. `shadow.needsUpdate` (a lamp moved to a new fixture, the sky changed, anything static changed) redraws a map in full and keeps (lamps only) a copy of it without the loose things. A lamp's map: a loose thing that moves asks with `shadow.loose` instead (`reshade` in `js/physics.js`): the copy is put back over the box where loose things were and are, and only they are drawn, the same map to the bit (checked in `tools/test.mjs`). The sun's map has no copy (64 MB, saves 0.04 ms): a loose thing under it asks with `needsUpdate`, a full redraw. The lamps' copies cost 72 MB. Something new that moves and casts a shadow goes on physics.js's loose list or asks with `needsUpdate`.
- Each zone's ambient light is baked from a probe at load; a material gets it by being registered with the zone (`M(zone, ...)` or `P(zone, ...)`).
- A lit material has 6 texture units to spend: 16 minus the 9 lamp shadow maps and the sun's.

## Between places

- The picture's mood (exposure, fog, grade, bloom, shafts) depends on where you stand, not on when you crossed. At load `lights.js` finds the openings: for every two zones whose boxes touch, the stretches of the shared edge a body can walk straight through (no solid from 0.8 m before the edge to 0.8 m past it, no rise taller than a step). An edge behind a wall is no opening, so nothing blends through a wall.
- `weights(x, z, zone)`: within 2.5 m (BAND) of an opening the neighbour's share k rises linearly to one half on the edge (and falls off the same way along the wall beside it). Shares are counted as odds against the zone you stand in, k / (1 - k), and a zone behind one of that neighbour's openings gets the product of the two odds, so it counts only near the door into the neighbour (nothing through a wall). Since k from one side of an opening is 1 - k from the other, every zone's odds against every other agree whichever zone you count from: the shares do not jump when the zone you are in flips, even where three zones meet (the 1.4 m corner squares). The odds are then normalised.
- Passage warps are two 0.32 m strips meeting at the passage's middle (wider than a body moves in a frame). A self-check asserts that neither a strip nor where it lands is within BAND of an opening, so both twins show the passage's own mood at the move. A place a passage opens into needs its zone box to meet the passage's at the mouth, not reach into it (the glasshouse's once reached 0.4 m in, leaving too little room).
- `player.js mood()` eases each zone's share in time (about 0.12 s, for teleports) and mixes exposure on a log scale, the rest linearly. The fog is mixed as pictures, not numbers (`post.js` atmos, up to three zones): a thick black passage fog thins as a dark veil over the place's own colours, never as grey haze. The shared lamps use the same shares: a fixture's group loses its 8 m ranking handicap as you near its doorway, so a room's lamps come on before you step in and stay on while you look back. Pools and loose things are drawn (and ring shadows redrawn) from any zone in reach.
- A new place does nothing for this: give it a zone box that meets its neighbours' at the doorway (within 0.7 m). `tools/test.mjs` checks every opening can be walked through and that leaving a dark passage never washes grey; `tools/transitions.mjs` measures the rest.

## Pool pictures

Every pool in `water.js` lies on the same horizontal plane, `WY`. Its wide reflection and underwater cameras depend on that plane and the viewing camera, not the basin's position or floor. All pools are hidden during either capture. So there is one mirror/lens pair (one Reflector, one Refractor, 1280 square) for every pool: the first pool drawn in a scene render makes it, the others use it. Waves, floor tracing, plans and shoreline shading remain per pool.

The "made" flag resets on every non-override render from the main camera, including renders at an unchanged shader time; pictures are never carried across frames or camera changes. At or below the plane (within 1 mm) each pool captures into the pair again just before it draws (three skips a back-facing capture, and the water's back face is not drawn anyway). A pool at another height or orientation needs its own pair. `waterViews.reuse = false` makes every pool capture again, for diagnostic A/B pictures and timings.

Two things keep the pair cheap; `waterViews.cull = false` turns both off (`tools/pool-skip.mjs` compares against that).

- **Hidden pools make no pictures.** Each pool has an invisible proxy box (the water widened 1.5 m, raised 3 m), drawn first among the see-through things inside an occlusion query. The result arrives a frame late, so it is trusted only while fresh (4 frames, no `dev.reset` since), while the eye has moved under 15 cm since, while the eye is not within 40 cm of any solid (an edge that close sweeps metres of a far room per centimetre), and, unless the whole proxy was on screen, while the view has not turned or widened. Anything else counts as seen. The pair is skipped only when every pool drawn is judged hidden (corridor: both pools behind walls). Rendered in one task (`dev.step(n)`, `tools/shots.mjs`), no result is ever ready, so nothing is skipped and photos are as before. Waves, rings and balls are untouched: they follow `w.visible` (player.js), not this.
- **The pair is cut to what the water can sample** (render-target scissor, nothing drawn or cleared outside): the lens to the projected basin box (the bent ray ends inside the basin), the mirror to the projected box 9 m round the pool and below the surface (the mirror is read 9 m along the mirrored ray, eased toward the picture's edge, never past it), plus 3 pixels for the mirror's taps and filtering. If any corner of a box is behind the eye that picture is drawn whole; for the mirror that is nearly always, for the lens it cuts pool views to 30-45 %.

`node tools/pool-skip.mjs [--halls]` walks every opening next to a zone a pool is drawn from (running, jumping, spinning and flicking the view at pool doorways; `--halls` adds the centre lines) and compares every game frame with the same frame drawn with `cull` off, pixel for pixel, the pair filled with magenta between frames so a stale picture cannot pass for a fresh one. `tools/test.mjs` runs it for the night hall.
