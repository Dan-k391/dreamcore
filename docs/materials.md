# Material library reference

Everything is generated; nothing is downloaded. Textures are GPU-baked once at load from GLSL texture sets; a set is only baked if something uses it.

## Where things live

- `js/tex/<family>.js`: one file per family of materials, holding its texture sets and the materials made from them. A family agent edits only its own file.
- `js/tex/blocks.js`: the GLSL every set is written with (noise and the building blocks below). Shared: change it only for all families.
- `js/tex/registry.js`: `set()` and `mat()`, and the two registries they fill.
- `js/tex.js`: the bake engine (two passes per set, anisotropic; the normal/roughness map's mips made by its own pass, below), the shared 10 cm `detail` set, and the imports of the family files, in showroom order.
- `js/mat.js`: the one shader all library materials share (macro variation, grime, dirt, wear, moire fade), `M()`, `libMat()` and the helpers (`wallMat`, `poolMats`, `lampOn` / `lampOff`, `P`).

| Family file | Materials (texture set, where it is not the material's own name) |
| --- | --- |
| `ceramicStone.js` | poolTile, poolMosaic, marble, terrazzo, limestone, travertine (`limestone`, tinted), stoneWall |
| `mineral.js` | plaster, stucco, concreteWall, concreteFloor, asphalt, roadPaint |
| `ground.js` | sand, mulch, rubberCrumb, grassGround |
| `textile.js` | wallpaper, damask, loopCarpet, blackoutCarpet (`loopCarpet`, tinted), hotelCarpet, velvet, vinylFoam, ceilingTile |
| `metal.js` | chrome (`smudge`), brushedSteel (`brushed`), galvanised, anodised, brass (`smudge`, tinted), castIron, paintedSteel |
| `plastic.js` | gelcoat, hardPlastic, pvc, rubber, glass, frostedGlass (`glass`) |
| `wood.js` | hardwood, veneer (book-matched walnut door faces, grain along u: `swap: 1` on a door), benchWood, weatheredWood, palmTrunk, palmLeaf |
| `light.js` | troffer, trofferOff (`troffer`), opalPanel, ledTube, frostedGlobe (`opal`), backlitPanel (`opal`) |

Materials sharing a set are in the same family. Changing a shared set changes all of them.

## A family file

```js
import { set, mat } from './registry.js';
set('name', metres, albedoPx, normalPx, meanRoughness, creviceDarkeningPerMm, `GLSL body`, `GLSL helpers (optional)`);
mat('materialName', 'setName', { shader options });
```

- The body is `surf(vec2 uv, inout vec3 c, inout float h, inout float r, inout float m, inout float t)`. `uv` runs 0..1 over the set's metres and the pattern must tile: every noise period over the set must be whole.
- It writes the linear albedo `c`, the height `h` in millimetres (normals are derived from it at the true scale, so real depths give real relief), the roughness `r`, the metalness `m`, and `t`: how much the material's `color` tints this texel (0 keeps the baked colour: grout, chips, stitching). For an emitter, `t` is the emission pattern.
- Sizes: the albedo and normal maps may differ by at most 4x (`set()` throws otherwise). 1024 is the usual size; a texel finer than the camera resolves costs memory and shows nothing.
- Helper names in the second GLSL string must not clash with another family's: prefix them with the set name if unsure.
- `SZ` (metres the set covers), `NPX` (bake texels across), `TX` (uv per texel) and `MMPX` (mm per texel) are defined in the body.

## Building blocks (`js/tex/blocks.js`)

Lengths in mm are true sizes on the surface. No block makes an edge sharper than the bake can hold, so nothing aliases into stepped lines in raking light.

- Noise: `vn` value, `gn` gradient, `fbm`, `ridged` (sharp crests), `vor` / `vorv` cellular, `hr` / `hf` / `hf2` hashes, `st` contrast stretch, `aa(d, w)` a filtered step.
- `tiles(uv, n, off, seed)` -> `Cell { id, f, mm, e, r }`: tiles, bricks, boards and panels; `off` .5 for running bond. `e` is mm to the cell's edge, `r` four hashes of the cell.
- `jointH(e, w, sh)`: a face's height beside a joint `w` mm wide, rising over a rounded shoulder `sh` mm (smooth, no crease). `jointMask(e, w)`: face 1, joint 0, for colour and roughness.
- `cellCol(c, r, k)`, `cellGloss(rough, r, k)`, `cellTilt(cell, k)`: per-cell colour, gloss and tilt, so no tile is the same as its neighbour.
- `multi(uv, seed)`: variation at three scales at once, -1..1. What lets a surface read at every distance.
- `vein(uv, k, w, octaves, seed)`: crisp veins of constant width along a noise isoline (warp `uv` first for flow).
- `cracks(uv, k, w, cover, seed)`: a wandering crack network, narrowing along its length, only where a coverage field allows. (`crackNet` is the older form.)
- `fibres`, `weave(uv, n)`, `loops(uv, n, seed)`: strands, plain weave, loop pile.
- `scratches(uv, k, w, density, seed)`: three sizes, many fine and short, few long.
- `pits(uv, k, r, density, seed)`: round pits, many small, few big.
- `chip(cell, uv, r, prob, seed)`: a chip out of a cell's corner.
- `stain(uv, k, cover, seed)`: a soaked blotch (`x`) and its darker tide mark (`y`).

## Mips and sparkle

The normal/roughness map (B) of every set but `detail` gets its mips from `passMip` in `js/tex.js`, not the hardware: per level the normal and metalness are the mean of the four texels below, and the roughness is the mean roughness widened by the variance of those four normals (GGX alpha^2 + variance, Toksvig; same channel, no extra unit or tap). Far or grazing, relief finer than the pixel (grout shoulders, mosaic, orange peel, a wet floor's grain) then broadens the highlight instead of sparkling. Measured with `tools/crawl.mjs` (shimmer against a 2x2 supersampled walk): pool hall far floor 0.88 -> 0.75, baths 1.51 -> 1.15, gallery pool 1.38 -> 1.27, the rest unchanged; arm's-length close-ups unchanged; far detail no softer; bake no slower. The `detail` set's blue is a roughness offset, not a roughness, so it keeps hardware mips. Tried and dropped: a per-pixel normal-spread term (pool hall worse), a weaker `fine` bias (no sharper, pool hall worse). Library textures already filter at the hardware's 16x anisotropy.

Tried and dropped: computed straight joints (the bake holding the tile faces only, the joint, its rounded shoulder and its slope box-filtered per pixel from the footprint; local branches `joints-attempt` 5b47173 and `mosaic-only` e293b6d, after 1d4223b). Far sharpness rose everywhere and the mosaic is crisper close up, but alias crawl (`tools/crawl.mjs`) stayed above the baked joints: pool hall .742 -> .90 at best, baths axis 1.147 -> 1.22, night hall .669 -> .69, baths gallery .572 -> .586 with the mosaic alone. The shoulder's slope variance trades the near bevel glint against the far shimmer (no setting wins both), and the face-only bake crawls by itself, so the baked joint stays.

## Getting a material

`M(zone, name, options)` in `js/mat.js` returns a cached material: the same call returns the same material, so repeated use costs no extra draw calls. It is registered with the zone, so it gets the zone's baked light. Use `M(null, ...)` for emitters no zone lights.

`wallMat`, `poolMats`, `lampOn` / `lampOff`, `P(zone, { ...concrete })` and `hotelTex` already return library materials.

## Options (in `mat()` or at the call)

- `color`: tints the paint, glaze or yarn, not the grout or chips.
- `roughness`: the mean wanted.
- `macro`: albedo and gloss variation from a shared world-space field (blobs of about 6 m, 1.5 m and 0.5 m with finer octaves); about 0.1-0.4.
- `grime` (default .18): how much the broad low patches of that field hold back the room's ambient light and darken the albedo. Raise it for old, handled places; lower it for clean ones.
- `fine`: metres of the set's finest pattern. Where a pixel covers more than that, the pattern fades to a blur of itself (no moire, no fringing); larger structure stays.
- `detail`: strength of the shared 10 cm micro normal. Dark materials get more of it and more gloss variation automatically: they are read by their highlights.
- `dirt`, `dirtCol`: grime where walls meet the floor, dust on tops. `wear`, `edgeCol`: lightening on rounded convex edges (hard-edged boxes get none).
- `vary: 1`: breaks the repeat with a turned second copy (isotropic sets only; it lowers fine contrast where the copies blend).
- `sheen`: pile seen along its length (at the rim) lighter, end-on darker; the rim lobe is as bright for a dark yarn as a light one (velvet about 1, carpets .2-.4). `back`, `emit: [colour, level]`.
- `floor`: the height its dirt gathers at (default 0). `tri: 1`: triplanar in world space. `uv: [u, v]`: metres per unit of the geometry's own UVs, with `add(mat, geo, true)`. `swap: 1`: turn the grain 90 degrees. `shade: [x, y, z]`: lit as if standing that far back: every lookup by world position (sun and lamp shadows, lamps, fixtures, ambient grid, reflection box, the world-space pattern) takes the point minus it; its own program (define `SHADE`), others untouched. For the far side of a portal with no turn (the terrace sky door's copy, `door(..., { shade })`, and the paving past it); the geometry's own UVs are not shifted, so place the far end a whole number of texture repeats away.
- Any `MeshStandardMaterial` property, except maps: a `*Map` option throws (a library material packs its own maps into the 6 free texture units).

## Pool optics

An undisturbed pool is still: no idle waves, no ripple film. Only the wave simulation (`js/water.js`, 5 cm cells, the player wading or landing, the rings and balls) moves the water, and the light under it comes only from those ripples. Each wave step loses `DAMP` = .995 of its speed (the same number in the CPU's coarse copy the rings float on), so a landing's ripples keep moving for some 15 s. While a sheet of water is still it costs nothing: `S.stir` bounds how much it still moves (the disturbances put in, dying away at `DAMP` a step); while it is 0 neither the simulation nor the light is stepped and the light picture is flat. A disturbance starts both at once. As `S.stir` falls from 10 `QUIET` to `QUIET` (2e-3) the traced light eases to flat (`uFade`), and there the waves are zeroed, the light traced once more, flat, and both left alone: no pop either way (a landing: full lines for about 10 s, gone by about 16 s, untraced from about 17 s).

The light is traced forward through that surface (`light()` in `js/water.js`). Each wave step, every disturbed sheet in view draws a grid over its pools into its light picture (`S.lp` a cell and a texel: 1.5 cm in the sun, 2 cm under lamps, where 3 cm drew a ripple's line in stair steps; 4x multisampled, so a line thinner than a texel counts by its coverage). Each vertex goes to where its light ray lands after refracting (ratio .75) at the surface's slope there, marched through the sheet's 5 cm height map (24 steps, nine halvings, then exactly onto the floor of the cell it ends in or the face it crossed: a wall, a column, a step's riser), and is written at the surface point whose undisturbed ray reaches that landing point (`causticPath`, the same lookup the tiles make), so flat water draws every vertex in place. A fragment gets the grid cell's area on the surface over its area in the picture (flat water: exactly 1, capped at 16), added up where the light folds over itself (additive blending into a half-float red target, cleared to 0, mipmapped). The slope is read from the simulation as a cubic B-spline over its cells (16 fetches), so slope and curvature are smooth and the light has no 5 cm facets (the bilinear central difference the drawn water uses made the light's brightness constant over each cell). To it is added `uLift - 1` times the slope of the same height over 10 cm knots, which leaves out the simulation's grid-scale ripples (gained, they speckle): at a metre of depth a wade's gentle ripples barely focus, and without the gain their light faded seconds before the reflections stopped moving. `uLift` is `GAIN0 / S.amp` held between 1 and `uGain.x` = 14, where `S.amp` is the sheet's largest disturbance still dying away (at `DAMP` a step) and `GAIN0` = .1: a wade or a ring gets the full 14, a fresh landing (.35) none, since its ripples focus by themselves at this depth and gained they focused far above the floor and spread again into broad bands; as its ripples die away the gain rises. The sum is eased toward `uGain.y` = .1 (`g / sqrt(1 + |g|^2 / .1^2)`), so a hard landing stays a net of lines, not a tangle. Only the light takes the gain; the drawn water keeps the simulation's own slope. Light is conserved within a few percent. The pool tiles read the picture with one lookup at the surface point their light comes through (`texture(uLight, ...) - 1`), so they keep five texture units (16 with the shadows). Light and shade: the result multiplies DIRECT diffuse light only (`reflectedLight.directDiffuse`, already behind each light's own shadow), never the ambient, so a column's, a ring's or the pool wall's shadow cuts the net and it ends where the sun patch ends. Sunlight on submerged tiles also loses what the surface reflects (.97) and what the water absorbs on its way down (`exp(-(.42, .085, .06) * path)`). The sun's own share of that direct light (taken round three's directional-light loop in the tile shader, no texture unit) reaches the floor at .5 in all: the art director's call, so tile colour shows between the lines; other direct light keeps .97, and while `lights.js` bakes the rooms' light (`bakingU`) the tiles show the sun at its old strength, so the bounce off the floor, and everything outside the patch, is unchanged (the plan, drawn with caustics off, takes the .5). `causStrength()`: the sun's pools take `sqrt(caus)` of the traced light; lamp pools (light straight down, which the surface bends two or three times less than the low sun, so their lines are fainter by themselves) `min(1, 4 * caus)`: the gallery (.25) and the vault take it all. The water's still-plan fallback matches: while the plan is drawn (caustics off, `uCaus` 0) each tile writes the share of its diffuse light that is direct into the plan's alpha, and the water puts the light on that share only. Above water the walls keep the old reflected shimmer on ambient light (the nearest water's light picture, blurred), not yet limited to where the sun reaches the water.

Cost, measured at 2560x1440 (`tools/profile.mjs`, the `water.sim` row: simulation plus light): still water nothing (before: .3 to .5 ms a frame for the idle film's trace); disturbed, about the same in the pool hall (.5 to .7 ms against .6), more in the big lamp pools for their finer grid (the vault .7 to .9 ms against .45 to .5); frame totals within noise (measured interleaved against the old code, as another job shared the GPU). `tools/water-optics.js` checks the pool hall's light picture: flat and untraced while still; after a landing finite, never negative, mean near 1, visible lines, smooth from step to step, still clear 8 s on, and eased flat before tracing stops.

The water keeps absorption `(.42, .085, .06)`, scatter extinction `.3`, every basin's scatter colour, the air/water refraction ratio `.75`, and Fresnel `.02 + .98 * (1 - cosine)^5`. Reflection retains its four-tap capture lookup with a `.0007` UV radius. Its first surface is found using 24 quadratically spaced mirror-depth samples within 9 m and seven refinement steps. The existing mirror capture retains a 1280-square float depth texture (6.25 MiB, replacing its depth renderbuffer): one more water sampler, no extra pass. The unlit water shader uses one sampler fewer than with the ripple film (10 declared); lit library materials retain their separate 16-sampler ceiling. This remains a single-view approximation: geometry missing from the capture, thin geometry between trace samples, and misses beyond 9 m are not full scene ray tracing. See `tools/water-optics.js` for GPU field, colour-domain and sampler checks, and `tools/water-reflection.js` for the opaque-wall/exposed-window regression.

## Limits

- 16 texture units per material, 10 of them taken by shadow maps: a library material uses 4 (its two maps, the shared detail, env), pool tiles 5.
- Shader programs take 200-400 ms each to compile here, so library materials share one shader variant. Do not add a variant per material.
- Texture memory for the whole game: 400 MB at most. Tint one set into many colours instead of baking each colour.
- The library may add at most 2 s to load (production now: about 1.7 s for 13 sets).
- Emitters are warm and keep their diffuser's structure visible; never 0xffffff, never a clipped white rectangle.
- No albedo below about 0.012 (the shader holds it there): nothing should read as a hole.

## Showroom

Dev only (`?dev`), far from everything else. Station i (in the order the family files are imported, `Object.keys(LIB)`) is at x = -673.5 + 3i, with a 1.2 m wall panel, a 0.6 m sphere (triplanar) and a 0.6 m rounded cube (own UVs) of the material.

The rig is the same at every station, set up as a photographer would: light neutral walls and floor, a lit ceiling panel over each side (so the zone's probe, and every metal and glass, has bright and dark things to reflect), the game's own exposure and post.

- North side, a soft frontal light from the ceiling in front of the panel: `#x-0.1,-0.86,0,-0.25` (1.5 m) and `#x-0.5,-1.96,0,-0.12` (0.4 m).
- South side, a warm key high up to one side, close to the wall, raking down the panel at about 10 degrees (so pits and joints read as recessed, lit from above) and modelling the sphere and cube: `#x+0.2,0.86,3.14159,-0.25` (1.5 m, panel, sphere and most of the cube) and `#x-0.5,1.96,3.14159,-0.12` (0.4 m).
- Never light a wall from below, or with the lamp in the wall's plane: everything then sits at the light's terminator, pits read as beads and joints break into per-pixel zigzags.
- `dev.lib` has the bake's cost; `dev.texMem()` the material texture memory.
