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

## Kit functions

Every function takes the zone `z` first; "(x, y, zc, ry, o)" below means `z, x, y, zc, ry = 0, o = {}`. A run of points is `pts` = `[[x, y, z], ...]`. Each kit also exports `yard(plot)`; lights, metalwork and play export `cost`, structure `tally`. Options listed are the main ones: read the comment above the function for the rest.

### lights (`js/props/lights.js`)

| Function | Arguments | Builds |
|---|---|---|
| `troffer` | (x, y, zc, ry, o: w, l, on, power, seed) | recessed ceiling panel (600 x 1200 default) with its light; y is the ceiling underside |
| `lamp` | (z, x, zc, h, on, power) | old helper: a `troffer` on the 60 cm grid |
| `batten` | (x, y, zc, ry, o: l, on, power) | surface T8 tube in a pressed-steel channel with lampholders and clips |
| `opalPanel` | (x, y, zc, ry, o: w, l, on, power) | surface opal diffuser panel in a mitred aluminium frame |
| `streetLamp` | (x, y, zc, ry, o: metal, glass, on, power, reach, globe) | crook-neck cast-iron park lamp, or a globe on top |
| `post` | (mat, globe, x, y, zc, ax, az, power, zone) | old helper: a `streetLamp` reaching (ax, az) |
| `globeLamp` | (x, y, zc, ry, o) | `streetLamp` with a globe on top |
| `mastLamp` | (x, y, zc, ry, o: h, heads, on, power, reach) | tall car-park mast on a base plate with LED lanterns on an arm |
| `sconce` | (x, y, zc, ry, o: on, power) | wall light: swan-neck arm and etched glass tulip |
| `stepLight` | (x, y, zc, ry, o: on, power) | small cast brick light with a louvred eyelid, for steps and passages |
| `poolLight` | (x, y, zc, ry, o: on, power, d) | underwater niche light with a fluted lens |
| `neonSign` | (x, y, zc, ry, o) | neon tube sign on standoffs with its transformer lead |

### metalwork (`js/props/metalwork.js`)

| Function | Arguments | Builds |
|---|---|---|
| `door` | (x, y, zc, ry, o: open, leaf, frame, color, openable, swing, kind) | door in a frame with handle, hinges, closer and kick plate; `leaf: false` is the frame alone; `openable: true` returns a double-acting door (`pivot`: centre pivot, floor spring, plain frame, kick plates both faces, no closer) that starts shut and on E swings `swing` rad (1.5) away from whoever pressed, solid all the way, sounding `kind` ('metal' or 'wood'); `pivot: true` alone with `leaf: false` is its plain frame; `copy: d` makes it `d` seen through a portal (built at `via(end, ...)`, moved with `d`) |
| `doorway` | (mat, leaf, x, y, z, ry, open) | old call: a `door` tinted like the two materials |
| `poolLadder` | (x, y, zc, ry, o) | stainless pool ladder with ribbed treads, rails clamped, bumpers on the wall; registers itself in `ladders` (its zone, the way up and the deck height y), so it climbs from any side of any pool, and on a dry block too (tools/test.mjs climbs every registered one) |
| `ladder` | (x, zc, mat) | old call: a `poolLadder` on a pool's east edge |
| `railing` | (pts, o) | tubular handrail: continuous top rail, posts on base plates, mid rail |
| `bollard` | (x, y, zc, ry, o) | painted steel tube bollard with domed cap and base plate |
| `drain` | (x, y, zc, ry, o: l, w) | slot-grate linear drain in an angle frame, flush with the floor |
| `shutter` | (x, y, zc, ry, o: w, h, open, color, hood) | roller shutter with guides, bottom bar and coil box |
| `vent` | (x, y, zc, ry, o: w, h) | wall vent grille with raked blades over a dark duct |
| `pipeRun` | (pts, o: off, to) | pipe along points with flanges, and clamps on drop rods to the wall |
| `signPost` | (x, y, zc, ry, o: w, ph, top, color) | post with a blank aluminium plate on channel rails and band clamps |
| `bin` | (x, y, zc, ry, o: color) | round wire-mesh litter basket on three legs |

### garden (`js/props/garden.js`)

| Function | Arguments | Builds |
|---|---|---|
| `parkBench` | (x, y, zc, ry, o: length, iron) | timber slat bench on cast-iron ends, bolted |
| `mallBench` | (x, y, zc, ry, o) | backless hardwood-batten bench on tube steel frames (1.8 x 0.42 m) |
| `palmPlanter` | (x, y, zc, ry, o) | terrazzo round planter with mulch and a palm |
| `pottedPlant` | (x, y, zc, ry, o) | moulded pot with mulch and three palm canes |
| `lounger` | (x, y, zc, ry, o) | poolside timber lounger with a raised slatted back |
| `picnicTable` | (x, y, zc, ry, o) | boards on bearers with splayed legs, braces, bolted |
| `fence` | (pts, o: span) | low timber post-and-rail fence with capped posts |

### play (`js/props/play.js`)

| Function | Arguments | Builds |
|---|---|---|
| `swingSet` | (x, y, zc, ry, o: color) | A-frame swing set with chains and rubber seats |
| `slide` | (x, y, zc, ry, o: color, deck, frame) | playground slide: deck, ladder, rails and moulded chute |
| `roundabout` | (x, y, zc, ry, o) | 1.6 m moulded-panel deck on a steel frame with grab rails |
| `springRider` | (x, y, zc, ry, o) | heavy coil spring between cast cups under a moulded cover |
| `beachBall` | (z, r) | a loose beach ball mesh (push it onto the loose bodies) |
| `swimRing` | (z, o) | a flat swim ring mesh (push it onto `rings`) |
| `foamCube` | (x, y, zc, ry, o: s) | soft-play vinyl cube, zip and all |
| `foamWedge` | (x, y, zc, ry, o: w, d, h) | soft-play ramp, stepped solids so you walk up it |
| `foamCylinder` | (x, y, zc, ry, o: r, h) | soft-play cylinder on its end |
| `foamArch` | (x, y, zc, ry, o: w, h, d, a) | soft-play arch block with a round opening |
| `pitBall` | (z, r) | `{geometry, fine, material}` for an InstancedMesh of pit balls |
| `laneRope` | (pts, o) | pool lane rope of floats, red ends then blue and white |
| `gardenChair` | (x, y, zc, ry, o: color) | stackable moulded plastic chair |

### structure (`js/props/structure.js`)

| Function | Arguments | Builds |
|---|---|---|
| `pillar` | (x, y, zc, ry, o: num, guard) | car-park concrete pillar with bay number and corner guards |
| `beam` | ([[x1, y1, z1], [x2, , z2]], o: ends, pw, haunch) | cast-in-place downstand beam with haunches |
| `wheelStop` | (x, y, zc, ry, o) | precast wheel stop pinned by two spikes |
| `bayLine` | ([[x1, y1, z1], [x2, , z2]], o: on) | painted 10 cm bay line |
| `arrow` | (x, y, zc, ry, o) | painted direction arrow on concrete |
| `kerb` | (pts, o: drop) | precast kerb run, with an optional dropped crossing |
| `bollard` | (x, y, zc, ry, o) | precast concrete bollard (the steel one is in metalwork) |
| `speedBump` | ([[x1, y1, z1], [x2, , z2]], o) | ribbed rubber-and-plastic speed bump in bolted modules |
| `steps` | (x, y, zc, ry, o: n, r, g, w, color, insert) | concrete flight with fluted nosings and anti-slip inserts, solid per step |
| `skirting` | (pts, o: color) | gloss-painted skirting with a caulk bead along a wall run |
| `column` | (x, y, zc, ry, o) | round stone column with plinth, drums and capital; plinth stands, shaft is a post |
| `pier` | (x, y, zc, ry, o: mat, color) | arch pier with plinth course and moulded impost |
