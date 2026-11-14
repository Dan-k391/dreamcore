# Building reference

## Code layout

- `js/core.js`: renderer, scene, camera, constants, the zone registry (`defZone`).
- `js/tex.js`: procedural textures. `js/mat.js`: materials (see [materials.md](materials.md)).
- `js/build.js`: the level builder and the registries places hand things to the rest of the game through.
- `js/props/<group>.js`: the prop kits (lights, metalwork, garden, play, structure); places call them for objects (see [props.md](props.md)).
- `js/zones/<place>.js`: everything about one place: its zones, materials, geometry, floors, lights, props. `js/level.js` imports them in order.
- `js/sky.js`, `water.js`, `lights.js`, `post.js`, `audio.js`, `player.js`, `physics.js`, `dev.js`, `main.js`.
- Imports only point back to earlier files, and places never import each other.

## Adding a place

A new file in `js/zones/` and one import line in `js/level.js`, plus these shared edits when they apply:

- A far-off place reached by a dark passage adds a row to `tunnels` in `js/zones/passages.js`.
- A new sky adds an entry to `skies` in `js/sky.js` and a key to `skyOnly` in `js/build.js`.
- A place that looks through a doorway at another place's pool adds its zone id to that pool's seen-from list in the other place's file; otherwise the water is hidden.
- A new `step` sound name needs an entry in `kinds` in `js/audio.js` to sound different; without one it plays as carpet.

## Geometry

Shapes go into one list per material and are merged into one mesh each (`add(mat, geometry)`), so use few materials and get few draw calls. `add()` gives box-projected UVs in metres; `add(mat, geometry, true)` keeps the geometry's own UVs (for materials with a direction: brushed metal, wood, cloth).

## Making things solid

Used by `js/player.js` and `js/physics.js`. A solid blocks the body where it overlaps it above step height (0.35 m), its top is ground you can stand on, and its underside stops a jump. A jump peaks at about 0.84 m.

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
- Budget, checked in `tools/test.mjs`: under 0.3 ms a frame at rest; in a splash under 1 ms median and under 3 ms at the 95th percentile.

## Light

- Nine shadow-casting lamps are shared by every fixture in the level and follow the player; a place registers fixtures with `lamp()` or `lit()` and they cost nothing more.
- Each zone's ambient light is baked from a probe at load; a material gets it by being registered with the zone (`M(zone, ...)` or `P(zone, ...)`).
- A lit material has 6 texture units to spend: 16 minus the 9 lamp shadow maps and the sun's.
