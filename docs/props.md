# Props reference

Objects (props) are built in kits, one file per group in `js/props/`, each with the material family file its agent owns in `js/tex/`. Places (`js/zones/<place>.js`) call kit functions instead of building objects inline.

| Group | Kit | Materials |
|---|---|---|
| lights | `js/props/lights.js` | `js/tex/light.js` |
| metalwork | `js/props/metalwork.js` | `js/tex/metal.js` |
| garden | `js/props/garden.js` | `js/tex/wood.js` |
| play | `js/props/play.js` | `js/tex/plastic.js` |
| structure | `js/props/structure.js` | `js/tex/mineral.js` |

Imports: a kit imports `three`, `js/core.js`, `js/build.js` and `js/mat.js`; never a place, never another kit. Places import kits.

## A kit function

The pattern is `wheelStop` in `js/props/structure.js`.

- **Signature** `thing(z, x, y, zc, ry = 0, o = {})`: the zone, where the object's origin lands (feet on the floor at height `y`), its turn about the vertical (`rotateY(ry)`), and options (size, colour, variant: `on`, `dead`, `open`...). Things that span two points (a railing run, a pipe run, a kerb) take `(z, [[x, y, zc], ...], o)` instead.
- **Own frame**: build about the object's own origin, feet at y 0, front toward +z; set it in the world with `put(g, x, y, zc, ry)` (`js/build.js`).
- **Geometry** goes through `add(mat, g)` (box-projected UVs in metres) or `add(mat, g, true)` (own UVs, for grain and brushing), so it merges into one mesh per material: get materials with `M(z, name, options)`, the same call returns the same material. A separate `Mesh` only for what moves or must be its own (a loose ball, a ring).
- **Solids**: the function registers its own, as [building.md](building.md) describes: `solidAt(x, y, zc, ry, cx, cy, cz, w, h, d)` for a box in the object's own frame, `round(...spot(x, zc, ry, px, pz), r, y1, y2)` for a post or trunk, `solid()` for an upright box. Seats, treads and tops you can stand on are solid; thin rails above step height block.
- **Light**: a fitting that lights the room registers it the way the existing ones do: a shadow-casting lamp with `lit(z, x, y, zc, power, to, angle, dist, color)` or `emitters.push(...)` as `lamp()` does (shared nine shadow lamps, nothing extra per fitting); a soft unshadowed one with `fixture(z, x, y, zc, power)`. Warm colours only, never 0xffffff. `o.on === false` draws it dead and registers nothing.
- Each kit also exports `yard(plot)`, which lays out one of each of its objects (and variants) in its plot of the dev yard.

Moved here from `js/build.js`, signatures unchanged: `lamp` and `post` (lights), `doorway` and `ladder` (metalwork). Their callers are listed below; the place agents swap them for the new kit objects.

## The yard

`js/zones/yard.js`, loaded only with `?dev` (as the showroom is), at x -700..-620, z -700..-684. One hall, 7 m tall, light plaster walls and a light concrete floor. Each group has a bay 16 m wide: its plot (14 x 8 m) at the back, an 8 m aisle in front to stand in. Two warm ceiling panels over the plot, one over the aisle, and a key high at the front right; the back left 3.6 x 3.5 m corner of each plot is dark (walls, floor, ceiling) for judging a lamp alight.

`yard(plot)` gets `plot = { zone, x, z, w: 14, d: 8 }`: the plot's corner with the smallest x and z, floor at y 0, plot spanning x..x+14 and z..z+8, the viewer on the +z side looking toward -z. The dark corner is x..x+3.5, z..z+3.5.

| Group | Zone | Plot | Whole plot (`#x,z,yaw,pitch`) |
|---|---|---|---|
| lights | yd0 | x -699..-685 | `#-692,-685,0,-0.2` |
| metalwork | yd1 | x -683..-669 | `#-676,-685,0,-0.2` |
| garden | yd2 | x -667..-653 | `#-660,-685,0,-0.2` |
| play | yd3 | x -651..-637 | `#-644,-685,0,-0.2` |
| structure | yd4 | x -635..-621 | `#-628,-685,0,-0.2` |

Plot z is -700..-692 for every group. Views files: `tools/yard/<group>.json` for `node tools/shots.mjs <out> --views tools/yard/<group>.json`; each starts with the whole plot (from 1.2 m higher, `lift`); add a close view (arm's length) and a far view (about 6 m) per object. `tools/yard/structure.json` has the wheel stop's as the example.

## Inventory

Where an object of each kind is built today (line ranges as of this commit). "Notes" are the audit's findings: `grep -n "<name>" screenshots/audit/notes/round2-{1,2,3,4}.txt`.

### lights (`js/props/lights.js`)

| Object | Built today |
|---|---|
| Recessed troffer 600 x 1200, lit and dead | `lamp()` lights.js:8-11 (box of `lampOn`/`lampOff` + emitter); called backrooms.js:26-27 (bA, one dead), 34 (bB), 42 (bC); softplay.js:33; yard.js (hall lighting) |
| Troffer 600 x 600 | arcade.js:15 (`glow` box + emitter); vault.js:24 (`glow` + `fixture`); gallery.js:24 (`glow` + `fixture`, ceiling lights) |
| Surface LED batten / tube | parking.js:16 (`neon` strip + `lit`); gallery.js:20-23 (wall strip lights, `glow` + `fixture`) |
| Opal ceiling panel | hotel.js:18 (`glow` square + `lit`); vault.js:23 (light wells, `glow` + emitter) |
| Hotel wall sconce | hotel.js:16 (a `glow` block by each door) |
| Crook-neck park street lamp | `post()` lights.js:12-17; called field.js:28 (5, `frost` globe, unlit), terrace.js:26 (lookout) |
| Car-park mast lamp | carpark.js:17 (9 x `post()`, power 520) |
| Globe lamp on a post | field.js:28 and terrace.js:26 (`post()` globes) |
| Small wall / step light | carpark.js:16 (strip over the passage door); the passage floor markers `passage()` build.js:62 (`aisle`) |
| Neon tube sign on standoffs + transformer lead | mall.js:21 (shop signs, `neon` blocks); `sign()` / `label()` mat.js:195-209 (EXIT, P2 plates: hotel.js:19, parking.js:17, vault.js:18) |
| Underwater pool light | none yet (pool hall, gallery, night hall, vault pools) |
| Also: backlit panels | carpark.js:23 (bus-shelter panel), 25 (vending fronts); mall.js:19 (lit empty shops); mall.js:25 (skylight); cinema.js:18 (screen) |
| Also: glow behind windows (not a fitting) | nighthall.js:21-22, vault.js:21 (`glow` slabs behind pill windows) |

### metalwork (`js/props/metalwork.js`)

| Object | Built today |
|---|---|
| Door in frame (handle, hinges, closer, kick plate); frame without leaf | `doorway()` metalwork.js:7-12; called field.js:45 (red, blue), terrace.js:22 (blue); hotel doors hotel.js:15 (wood slab + brass handle and plate); bare doorways with no frame: backrooms.js:20, 40-41, parking.js:11-12, poolhall.js:22-23, gallery.js:18, nighthall.js:19, vault.js:19, mall.js:13-14 |
| Pool ladder with treads and wall anchors | `ladder()` metalwork.js:13-17; called poolhall.js:32 (chrome), nighthall.js:28 |
| Tubular handrail / railing run | gallery.js:25-28 (pool handrails, boxes); mall.js:23 (upper gallery rail) |
| Roller shutter (guides, bottom bar) | mall.js:20 (stacked slabs) |
| Steel bollard | none yet |
| Floor drain grate | none yet (pool decks) |
| Wall vent grille | none yet |
| Pipe run with brackets and flanges | none yet |
| Sign post with blank plate | none yet |
| Wire-mesh waste bin | none yet |
| Also: bus shelter (posts, roof, glass) | carpark.js:20-23 |
| Also: vending machine | carpark.js:24-26 |
| Also: shopfront (mullions, glass door) | mall.js:16-24 (open shops are only a lit panel) |

### garden (`js/props/garden.js`)

| Object | Built today |
|---|---|
| Park bench (slats on cast ends, bolted) | field.js:46-50; terrace.js:27 (lookout bench); carpark.js:22 (bus-shelter seat) |
| Backless mall bench | mall.js:30 |
| Round planter with soil and a palm | mall.js:26-31 (planter box, soil, 10-sided trunk, 9 flat leaf boxes) |
| Smaller potted plant | none yet |
| Poolside timber lounger | none yet |
| Picnic table | none yet |
| Low timber fence / rail | none yet |
| Also: cinema seat (cushion and back) | cinema.js:15-16 |

### play (`js/props/play.js`)

| Object | Built today |
|---|---|
| Playground slide | none on land; the water slide nighthall.js:29-33 (`tube` chute, solid chain) |
| Swing set | field.js:31-35 (tube legs, top bar, block chains and seats) |
| Roundabout | field.js:36-38 |
| Spring rider base | none yet |
| Soft-play foam shapes (cube, wedge, cylinder, arch) | softplay.js:31 (cubes), 30 (steps and block), 32 (arch wall), 34-36 (rainbow), 17 (padded wall band), 12-15 (floor mats, pit) |
| Swim ring | poolhall.js:33-36 (torus meshes on `rings`) |
| Beach ball | `beachBall()` mat.js:210; used poolhall.js:37, gallery.js:30; field ball field.js:51-52 (`paintedBall`) |
| Ball-pit balls | softplay.js:18-29 (InstancedMesh on `loose`) |
| Pool lane-rope floats | none yet |
| Stackable moulded garden chair | none yet |
| Also: seesaw | field.js:39-42 |
| Also: sand pit edge | field.js:30 |

### structure (`js/props/structure.js`)

| Object | Built today |
|---|---|
| Parking-level pillar | parking.js:13 (50 cm box + yellow band block) |
| Wheel stop | parking.js:14 (boxes); kit example `wheelStop()` structure.js:10-16 |
| Kerb run with dropped section | none yet (car park) |
| Speed bump | none yet |
| Painted bay lines and arrows | parking.js:14, carpark.js:18 (paint blocks); wall stripe parking.js:15 |
| Round column with base and capital | terrace.js:16 (columns from the cloud); square columns poolhall.js:28, nighthall.js:24 |
| Arch pier with impost | `slab(..., through)` build.js; terrace.js:19-21, vault.js:20, arcade.js:13-14, softplay.js:32 |
| Step run with nosings | `flight()` build.js:47; field.js:44 (stair to nothing), terrace.js:23-24, softplay.js:30; pool entry steps poolhall.js:20, gallery.js:15 |
| Concrete bollard | none yet |
| Skirting | `wall()` build.js:93 (trim box); mall walls have none |
| Ceiling beam / downstand | parking.js:13 (beams over the pillars) |
| Also: traffic cone | carpark.js:19 |
| Also: pilasters | gallery.js:19; backrooms pillars backrooms.js:33 |
| Also: parapet rail | terrace.js:13 (`rail`) |
