# Material library reference

Everything is generated; nothing is downloaded. Textures are GPU-baked once at load from the GLSL sets in `js/tex.js` (`set(name, metres, albedo px, normal px, ...)`); a set is only baked if something uses it.

## Getting a material

`M(zone, name, options)` in `js/mat.js` returns a cached material: the same call returns the same material, so repeated use costs no extra draw calls. It is registered with the zone, so it gets the zone's baked light. Use `M(null, ...)` for emitters no zone lights.

`wallMat`, `poolMats`, `lampOn` / `lampOff`, `P(zone, { ...concrete })` and `hotelTex` already return library materials.

## Names (the `LIB` table)

- Ceramic and stone: poolTile, poolMosaic, marble, terrazzo, limestone, travertine, stoneWall, plaster, stucco.
- Concrete and ground: concreteWall, concreteFloor, asphalt, roadPaint, sand, mulch, rubberCrumb, grassGround.
- Interior finishes: wallpaper, loopCarpet, ceilingTile, hotelCarpet, hardwood, damask, velvet, blackoutCarpet, vinylFoam.
- Metals: chrome, brushedSteel, galvanised, anodised, brass, castIron, paintedSteel.
- Plastics, rubber, glass: gelcoat, hardPlastic, pvc, rubber, glass, frostedGlass.
- Wood and plants: benchWood, weatheredWood, palmTrunk, palmLeaf.
- Light fittings: troffer, trofferOff, opalPanel, ledTube, frostedGlobe, backlitPanel.

## Options

- `color`: tints the paint, glaze or yarn, not the grout or chips.
- `roughness`: the mean wanted.
- `dirt`, `wear`: 0 to 1.
- `floor`: the height its dirt gathers at (default 0).
- `tri: 1`: triplanar mapping in world space, for odd shapes.
- `uv: [u, v]`: metres per unit of the geometry's own UVs, used with `add(mat, geo, true)` in `js/build.js` to keep them. Box-projected `add()` geometry is already in metres.
- `swap: 1`: turn the grain or weave 90 degrees.
- Any `MeshStandardMaterial` property.

## Limits

- 16 texture units per material, 10 of them taken by shadow maps: a library material packs its maps to fit in the remaining 6.
- Shader programs take 200-400 ms each to compile here, so library materials share one shader variant. Do not add a variant per material.
- Texture memory for the whole game: 400 MB at most. Tint one texture set into many colours instead of baking each colour.
- Emitters are warm and keep their diffuser's structure visible; never 0xffffff, never a clipped white rectangle.

## Showroom

Dev only (`?dev`), far from everything else. Station i (in `LIB` order) is at x = -673.5 + 3i, with a wall panel, a sphere and a rounded cube of the material.

- North side, lit from above: `#x-0.1,-0.86,0,-0.25` (1.5 m) and `#x-0.5,-1.96,0,-0.12` (0.4 m).
- South side, raking light: `#x-0.1,0.86,3.14159,-0.25` (1.5 m) and `#x-0.5,1.96,3.14159,-0.12` (0.4 m).
- `dev.lib` has the bake's cost; `dev.texMem()` the material texture memory.
