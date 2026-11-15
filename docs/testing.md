# Testing reference

All tools are dependency-free (Node 22; the two image tools use Python 3 with Pillow). Subagents use these, not the shared Browser pane.

## Serving

`node tools/serve.mjs <port>` serves the folder it is run from on 127.0.0.1 only, with no caching. Run it in the background from the root of the copy you are working in, on the port your brief gives you, and stop it when you are done.

## The page

- `?dev` in the address turns on the test hooks (`window.dev`, in `js/dev.js`). Without it none of them exist. Plain `?dev` also loads the two test-only areas far away at x below -500 (the material showroom and the prop yard); they are drawn in every view, which adds about a million triangles and several hundred draw calls and bakes every material set (texMem 420 MB against 322 MB). `?dev&bare` loads the same hooks without them: it is what the real game costs. Which tool uses which: `perf.mjs` and `test.mjs` use `?dev&bare` (`perf.mjs --full` the plain load; `test.mjs` keeps its cost-and-tour check on plain `?dev`, which needs the showroom shaders); `shots.mjs` uses `?dev&bare` unless a view of the run has x below -500, then plain `?dev` (`FULL=1` forces it); `browse.mjs` loads whatever address you give it.
- `#x,z,yaw,pitch` starts the player there.

### `window.dev`

- `dev.ready`: level built, baked and one frame drawn.
- `dev.hold = true` stops the normal loop, so only `dev.step(n, dt = 1/60)` moves time. Deterministic.
- `dev.state()` returns `{x, y, z, zone, sky, air}` (y = feet height).
- `dev.key(code, down)` presses a key by `KeyboardEvent.code`.
- `dev.go(x, z, yaw, keys = [], secs = 0, pitch = 0)`: teleport, settle, hold the keys for `secs`, release, return `state()`.
- `dev.reset(x, z, yaw = 0, pitch = 0)`: put everything a walk leaves behind back to a fresh load's start at (x, z): keys, `lift`, fov, shader clock, sky, shared lamps and shadows, waves, loose bodies and rings, eye adaptation. A `eval` that changes some other state of its own must put it back itself.
- `dev.lift`: metres added to the eye height (default 0; exists only with `?dev`).
- `dev.bodies()` lists the loose bodies and rings.
- `dev.settings`: `{ load, s, levels }` from `js/settings.js` (the pause panel: volume, mute, quality Low / Medium / High, fps readout; saved in localStorage `dreamcore.settings`; quality levels are `setQuality` in `js/post.js`). Under `?dev` the fps readout and the P / F keys stay off unless `dev.fps = true` (then `dev.settings.load()`).
- Also `camera`, `scene`, `renderer`, `zones`, `cost()`, `info()`, `lib` (the texture bake's cost), `texMem()` (material texture memory).

## `tools/browse.mjs`

`node tools/browse.mjs --url "http://127.0.0.1:<port>/?dev#x,z,yaw,pitch" [--eval "<js>" | --eval-file f.js] [--shot out.png] [--size 1280x720] [--wait ms] [--settle ms]`

Loads the page in a private headless browser on the real GPU, waits for `dev.ready`, evaluates the expression (it may use `await`), saves a screenshot and prints `{result, errors, ready, ms, requests}` (requests: every URL the page asked for, `data:` and `blob:` left out). Exits non-zero on any page error, console error or failed assert. Each run starts and closes its own browser, so runs can overlap.

## `tools/bundle.mjs`

`node tools/bundle.mjs [out]` writes `dreamcore.html` (or `out`): `index.html` and every module reachable from `js/main.js` (the vendored three.js and the dev-only showroom and yard included), each embedded as a string and loaded through a Blob URL behind a generated import map, with every import specifier rewritten to `dreamcore/<path>`. It opens from `file://` with no request but itself; `?dev`, `?dev&bare` and `#x,z,yaw,pitch` work there as served. `test.mjs` checks it is current, has no URL outside comments (bar the XHTML namespace three passes to `createElementNS`) and none to a CDN, and loads from `file://` with no errors or other requests. `browse.mjs` lists the page's requests (`requests`) for this.

## `tools/test.mjs`

`node tools/test.mjs [--port 8200] [--all]`

The regression suite: the page loads with and without `?dev` with no console errors or failed asserts; walks between places land where they should; solids, the ball pit, rings and loose balls behave; physics stays within its cost. Prints only failed checks and a final `N passed, M failed`; `--all` prints every line. Run it before reporting; it must be green. A new behaviour worth keeping gets a small check here. The stationary grass viewport check (`tools/grass-viewport.js`) widens the window without moving or advancing time and compares its rendered pixels with a freshly rebuilt view; it catches projection changes missing from the patch cache.

## `tools/shots.mjs`

`node tools/shots.mjs <outDir> [--port 8200] [--only name,name] [--views file.json] [--size WxH] [--fresh]`

One repeatable photo per viewpoint. It freezes time, resets the shader clock and runs 90 frames, so the same code differs run to run by well under 1/255 on average.

- Default: ONE browser and ONE page load for all views (24 views in about a minute). Each view starts with `dev.reset(x, z, yaw, pitch)`, so a photo does not depend on the views before it (checked: single load vs `--fresh` max 0.36 / mean 0.14, two single runs and a reversed order max 0.4).
- `--fresh`: a new browser and page load per view (three at a time), the old behaviour, the reference and the fallback.

- Default list: `tools/views.json`, `[{name, hash}]`.
- `--views file.json`: your own list, same shape, plus an optional `eval` string per view: JavaScript run after the view is set up and before the photo (hold a key, change the fov).
- `lift` per view: metres added to the eye height for the photo (e.g. `1` from above, `-1.2` near the floor). Sets `dev.lift`; do not set the camera by hand, it is re-derived from the player every step.
- `--size WxH`: default 1280x720. Use a smaller size when the question is layout, not texture.

## `tools/compare.py`

`python tools/compare.py <dirA> <dirB> [--top 5] [--out <dir>]`

For every PNG name in both folders: mean absolute difference per channel (0-255) and the percent of pixels differing by more than 24, largest first, then a summary line. Writes a side-by-side (A | B | difference x8) for the top N only, into `--out` (default `<dirB>/_compare`). It reports; it does not judge. Run-to-run noise is about 0.1-0.4.

## `tools/sheet.py`

`python tools/sheet.py <out.png> <dir-or-files...> [--cols 4] [--width 2560] [--match <substring>]`

A contact sheet: the images in a grid, each labelled with its file name.

## Other

- The load's phases are `performance.mark('load: ...')` marks (`performance.getEntriesByType('mark')`); the library bake runs while the scene's programs compile, so its marks fall inside that phase. Two `performance.measure`s guard known stalls, checked by `test.mjs`: `load: first sign` (the signs' font, drawn first by `index.html`) and `load: openings` (the opening search in `lights.js`).
- `node tools/perf.mjs [--port 8200]`: for every view in `tools/views.json` at the default size, median frame time (ms), draw calls, triangles, programs, textures, load time to `dev.ready` (ms) and zone/sky; ends with the median load over all pages.
- `node tools/profile.mjs [--port 8200] [--only name,name] [--size 1280x720[,2560x1440]] [--frames 30] [--waste] [--pre "<js>"] [--load n] [--json f]`: GPU ms (timer queries), draw calls, triangles and CPU ms of every pass of a frame (scene, shadow redraws, pool mirror and underwater pictures, AO normals / GTAO / denoise, atmos, bloom, film), nested work split out exactly; default views the six heaviest and three typical, one page load per size (about 15 s). `--waste`: triangles out of the frustum and in meshes with no pixel, grid-chunk counts, overdraw, pool share of the screen, lamps per pixel, the scene pass alone / after a depth pre-pass / flat. `--pre`: an A/B experiment run once in the page first. `--load n`: n fresh loads' phase marks.
- `node tools/pool-skip.mjs [--port 8200] [--only id,id] [--halls] [--size 640x360]`: pool pictures skipped or cut (`water.js`) never show: along the walk list near every pool, each game frame against the same frame drawn with `waterViews.cull` off, pixel for pixel (docs/building.md, Pool pictures).
- `node tools/corners.mjs <outDir> [--port 8200] [--size 400x250] [--flag-only]`: every inside corner of every room (found from the solids), photographed twice (wall-floor and wall-ceiling joins), and the photos with a thin bright line at the joint listed (`tools/corners.py`, `--show` marks them in red). Light leaking through a joint shows here. Known, real lines: the glasshouse's window bars, the laundromat's ceiling grid, the mall's clothes rail.
- The seam tools classify `InstancedBufferGeometry` with `InstancedMesh`, outside their CPU-face scan and opaque-material override. Shader-positioned instance templates are not world-space faces: scanning the three grass templates at the origin produces six fictitious overlaps. This does not change the 1 mm coplanarity tolerance or ordinary mesh coverage; instance placement/coverage still needs its own rendered checks.
- `node tools/leaks.mjs [--port 8200] [--every n] [--only id,id] [--fast]`: light through walls. Walks the walk list (tools/walk.mjs) and at each point compares four views with the same views after every shadow map is drawn afresh with every layer on; a view brighter as is leaks, and the light to blame is named. `--fast` (in test.mjs) checks the cause instead: from each zone, every shadow map read back against the same map with every layer on.
- `node tools/transitions.mjs [--port 8200] [--only id,id] [--top 10] [--strips 3] [--out screenshots/transitions] [--json f]`: every opening both ways and every passage warp (about a minute): how the picture changes because you crossed (largest 1/60 s step, before-vs-settled total, settle time, standing still with time held), the share of that from sky / look / lamps; walking through each opening at 2.85 m/s from up to 3 m before to 3 m past (`step`: the largest frame-to-frame change of what you see, motion included, with the walk's median for motion alone; `mood`: the same seen from the edge with each frame's state, motion left out; `wash`, passage mouths only: how far any frame is brighter than both settled ends there; `--curve` adds the per-frame mean to the json), and the crossing's frame cost (lamp and sun shadow maps, sky swap, first draws); frame strips of the worst for `sheet.py`.
- `node tools/browse.mjs --url "http://127.0.0.1:<port>/?dev&bare#3.8,50,0,0" --eval-file tools/shadowcost.js`: shadow-map redraws and their triangles over a run through the hotel and the backrooms.
- Screenshots go under `screenshots/` (ignored by git). The lead's stage photos and the audit photos live there too.
