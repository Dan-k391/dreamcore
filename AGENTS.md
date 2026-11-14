# AGENTS.md

This is a browser dreamcore walking game (three.js, no build step, served as static files, live at https://dan-k391.github.io/dreamcore/). The bar for everything in it:

- **Insanely detailed quality.** It should look like it can keep up with AAA: impressive, photorealistic graphics. Every object counts, not only the rooms: a bench, a lamp post, a pillar, a palm, a slide each need believable shape, material and texture up close.
- **Small in scope.** Several tiny levels, not a big game. Each place is small; spend the effort on how it looks, not on how much there is.

When the two pull against each other, quality wins: one place finished properly beats three that are plain.

## Who does what

- The lead session is the **head manager and art director**. It decides what gets built, writes the briefs, judges the results against the bar above, and commits and pushes. It does not write game code itself.
- **Coding, code review and testing are done by subagents, at medium effort.** Opus 5.5 for the tough work: engines and shared systems (rendering, materials, physics), building or rebuilding a place or its objects, art review, and review of that code. Sonnet 5.5 for the easier work: running the test suite and photo comparisons, taking audit photos and contact sheets, mechanical edits, small well-specified fixes, merging branches. Every change is written by one subagent and then checked by others (a code review and a test run) before the lead accepts it.
- The owner has put the lead fully in charge: no questions back to the owner, commit and push whenever it makes sense. Subagents never push and never ask the owner anything; they report to the lead.

## Standing rules for the game

- No horror content. It is a calm place to walk around.
- Look: strong contrast between dark and bright, warm yellowish lights (never pure white), nothing washed out.
- First-person controls must keep working: mouse look, WASD, jump, run, zoom, and the cursor fallback where the mouse can't be captured.
- Things in the world are solid and behave: you can stand on what looks standable, you can't walk through what looks solid, and loose things (floating rings, balls) react to you and to the water.
- Never recreate a specific existing game, its levels, characters or art.
- It must run smoothly. Never trade visible quality for speed; find the waste instead.
- 16 texture units is the hard limit per material: 9 lamp shadow maps and 1 sun shadow map are always bound, leaving 6.

## Working economically

Quality is not negotiable; waste is. Measured on this project: half of what a subagent costs is re-reading its own growing conversation on every step, a third is tool output entering it, and a photo read early in a long job is paid for again on every later step.

- **Fewer, fuller steps.** One command that does several things, one script that takes all the photos, instead of many small steps. A job that would run past about 60 steps is two jobs: stop at a clean point and report what the next agent needs.
- **Do not print what you will not read.** `node tools/test.mjs` prints only failures and a count (`--all` for every line). Cut long output with `tail` or `grep`; read files by line range.
- **Numbers before eyes.** What a script can check (tests, pixel differences, timings, counts) a script checks, and its numbers are trusted. `python tools/compare.py <before> <after>` prints the difference per view and writes side-by-sides only for the largest: look at those, not at every view.
- **Photos in batches, sheets before singles.** Take many photos in one run with `node tools/shots.mjs <outDir> --views <file.json>`. See many at once with `python tools/sheet.py`; open a full-size photo only to judge fine detail up close or when the sheet raises a doubt. Never read the same photo twice. Judging a material or an object at arm's length still needs full-size close-ups: do not skimp there.
- **Focused reviews.** A reviewer gets one question and the diff, not "check everything", and two reviewers never check the same thing. After a fix, verification re-runs the failing cases and reads the fix's diff; it does not repeat the whole review.

## Testing (subagents: use this, do not use the shared Browser pane)

- Serve your working copy: `node tools/serve.mjs <port>` from the root of the copy you are working in (in the background), on the port your brief gives you. Stop it when you are done.
- `node tools/browse.mjs --url "http://127.0.0.1:<port>/?dev#x,z,yaw,pitch" --shot out.png --eval "<js>"` loads the game in a private headless browser on the real GPU, runs JavaScript in the page, saves a 1280x720 screenshot and prints `{result, errors}`. It exits non-zero on any page error. Read the screenshot file to look at it.
- `?dev` in the address turns on the test hooks (`window.dev`, in `js/dev.js`); `#x,z,yaw,pitch` starts the player there. Without `?dev` none of it exists.
  - `dev.ready`: level built, baked and one frame drawn. `dev.hold = true` stops the normal loop, so only `dev.step(n, dt = 1/60)` moves time (deterministic).
  - `dev.state()` -> `{x, y, z, zone, sky, air}` (y = feet height). `dev.key(code, down)` presses a key by `KeyboardEvent.code`.
  - `dev.go(x, z, yaw, keys = [], secs = 0, pitch = 0)`: teleport, settle, hold the keys for `secs`, release, return `state()`. Also `camera`, `scene`, `renderer`, `zones`, `cost()`, `info()`.
- `node tools/test.mjs [--port 8200]`: the regression suite (page loads with and without `?dev` with no console errors or failed asserts, and walks between places land where they should). Run it before reporting; it must be green.
- `node tools/shots.mjs <outDir> [--port 8200] [--only name,name]`: one repeatable 1280x720 photo per viewpoint in `tools/views.json` (`[{name, hash}]`). Shoot before and after a change and compare; run to run, the same code differs by well under 1/255 on average.
- Code layout: `js/zones/<place>.js` holds everything about one place (its zones, materials, geometry, floors, lights, props); `js/level.js` imports them in order. Adding a place = a new file there and one import line in `level.js`, plus three shared edits when they apply: a far-off place reached by a dark passage adds a row to `tunnels` in `js/zones/passages.js`; a new sky adds an entry to `skies` in `js/sky.js` and a key to `skyOnly` in `js/build.js`; a place that looks through a doorway at another place's pool adds its zone id to that pool's seen-from list in the other place's file (otherwise the water is hidden). A new `step` sound name needs an entry in `kinds` in `js/audio.js` to sound different; without one it plays as carpet. Shared things live in `js/core.js`, `tex.js`, `mat.js`, `build.js` (builder and registries); places never import each other.
- Solids (`js/build.js`, used by `js/player.js` and `js/physics.js`): `box()` is solid over its true extent by itself (use `block()` for what must not be). For anything built otherwise, add its solid in the same place file: `solid(x1, y1, z1, x2, y2, z2)` for an upright box, `round(x, z, r, y1, y2)` for a post, trunk or column, `turned(cx, cz, hx, hz, ry, y1, y2)` for a box turned by `rotateY(ry)`; a slope is a few stepped solids or a `flats` height function. A solid blocks the body where it overlaps it above step height (0.35 m), its top is ground, its underside stops a jump.
- Loose things: a place pushes `{ mesh, r, pos, region, bounce, grip, ... }` onto `loose` (`js/build.js`; the fields are listed there) and `js/physics.js` moves them: balls that fall, roll, float (`float`), stop the body (`solid`) and sleep when still; an `InstancedMesh` holds many. A swim ring is a torus mesh pushed onto `rings`, floated on the pool's waves. `dev.bodies()` lists them for tests.
- Materials come from the library: `M(zone, name, options)` in `js/mat.js` returns a cached material (same call, same material) registered with the zone so it gets the zone's baked light; `M(null, ...)` for emitters no zone lights. Names (the `LIB` table): poolTile, poolMosaic, marble, terrazzo, limestone, travertine, stoneWall, plaster, stucco, concreteWall, concreteFloor, asphalt, roadPaint, sand, mulch, rubberCrumb, grassGround, wallpaper, loopCarpet, ceilingTile, hotelCarpet, hardwood, damask, velvet, blackoutCarpet, vinylFoam, chrome, brushedSteel, galvanised, anodised, brass, castIron, paintedSteel, gelcoat, hardPlastic, pvc, rubber, glass, frostedGlass, benchWood, weatheredWood, palmTrunk, palmLeaf, troffer, trofferOff, opalPanel, ledTube, frostedGlobe, backlitPanel. Options: `color` (tints the paint/glaze/yarn, not grout or chips), `roughness` (the mean wanted), `dirt` / `wear` (0-1), `floor` (height its dirt gathers at, default 0), `tri: 1` (triplanar, world space, for odd shapes), `uv: [u, v]` (metres per unit of the geometry's own UVs; with `add(mat, geo, true)` in build.js to keep them; box-projected `add()` geometry is already in metres), `swap: 1` (turn grain / weave 90°), plus any MeshStandardMaterial property. Textures are GPU-baked once at load from the GLSL sets in `js/tex.js` (`set(name, metres, albedo px, normal px, ...)`); a set is only baked if something uses it. `wallMat`, `poolMats`, `lampOn`/`lampOff`, and `P(zone, { ...concrete })` / `hotelTex` already return library materials. Showroom (dev only, `?dev`): station i (LIB order) at x = -673.5 + 3i; north side lit from above `#x-0.1,-0.86,0,-0.25` (1.5 m) and `#x-0.5,-1.96,0,-0.12` (0.4 m), south side raking light `#x-0.1,0.86,3.14159,-0.25` and `#x-0.5,1.96,3.14159,-0.12`; `dev.lib` has the bake's cost, `dev.texMem()` the material texture memory.
- Look at what you built, from several angles and up close, before calling it done. A change that was not looked at is not finished.
- Put screenshots under `screenshots/` (ignored by git, never committed). The local branch `with-screenshots` is never pushed.
