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

Pool optics share a four-component, gently phase-bent wave field in `causticsGLSL`: broad, slow undulation only (about 0.6 to 2 m long, slopes up to about .05 each, a period of several seconds), no fine chop. Its analytic slopes drive the surface normal, so reflections of windows and lamps break into a few large soft patches and the refracted tiles wobble in wide swirls; the floats ride the simulation, not this field (its height is about a centimetre). Its curvature supplies a signed, soft-clamped focusing term on submerged tiles and the still-plan fallback: a few broad, slow, soft-edged brighter and darker patches, no lines. Sunlight uses the refracted sun direction; indoor diffuse fixtures use an overhead approximation. The simulation's curvature is sampled at the same projected surface position, without changing its physics. Pixel-footprint filtering and depth-dependent spreading suppress unresolved ripples; bounded focusing never creates negative light. Above-water reflected shimmer uses the same low-contrast field.

The water keeps absorption `(.42, .085, .06)`, scatter extinction `.3`, every basin's scatter colour, the air/water refraction ratio `.75`, and Fresnel `.02 + .98 * (1 - cosine)^5`. Reflection retains its four-tap capture lookup with a `.0007` UV radius. Its first surface is found using 24 quadratically spaced mirror-depth samples within 9 m and seven refinement steps. The existing mirror capture retains a 1280-square float depth texture (6.25 MiB, replacing its depth renderbuffer): one more water sampler, no extra pass. The unlit water shader uses 11 samplers; lit library materials retain their separate 16-sampler ceiling. This remains a single-view approximation: geometry missing from the capture, thin geometry between trace samples, and misses beyond 9 m are not full scene ray tracing. See `tools/water-optics.js` for GPU field, colour-domain and sampler checks, and `tools/water-reflection.js` for the opaque-wall/exposed-window regression.

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
