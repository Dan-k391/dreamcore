# Testing reference

All tools are dependency-free (Node 22; the two image tools use Python 3 with Pillow). Subagents use these, not the shared Browser pane.

## Serving

`node tools/serve.mjs <port>` serves the folder it is run from on 127.0.0.1 only, with no caching. Run it in the background from the root of the copy you are working in, on the port your brief gives you, and stop it when you are done.

## The page

- `?dev` in the address turns on the test hooks (`window.dev`, in `js/dev.js`). Without it none of them exist, and the dev-only showroom is not loaded.
- `#x,z,yaw,pitch` starts the player there.

### `window.dev`

- `dev.ready`: level built, baked and one frame drawn.
- `dev.hold = true` stops the normal loop, so only `dev.step(n, dt = 1/60)` moves time. Deterministic.
- `dev.state()` returns `{x, y, z, zone, sky, air}` (y = feet height).
- `dev.key(code, down)` presses a key by `KeyboardEvent.code`.
- `dev.go(x, z, yaw, keys = [], secs = 0, pitch = 0)`: teleport, settle, hold the keys for `secs`, release, return `state()`.
- `dev.bodies()` lists the loose bodies and rings.
- Also `camera`, `scene`, `renderer`, `zones`, `cost()`, `info()`, `lib` (the texture bake's cost), `texMem()` (material texture memory).

## `tools/browse.mjs`

`node tools/browse.mjs --url "http://127.0.0.1:<port>/?dev#x,z,yaw,pitch" [--eval "<js>" | --eval-file f.js] [--shot out.png] [--size 1280x720] [--wait ms] [--settle ms]`

Loads the page in a private headless browser on the real GPU, waits for `dev.ready`, evaluates the expression (it may use `await`), saves a screenshot and prints `{result, errors, ready, ms}`. Exits non-zero on any page error, console error or failed assert. Each run starts and closes its own browser, so runs can overlap.

## `tools/test.mjs`

`node tools/test.mjs [--port 8200] [--all]`

The regression suite: the page loads with and without `?dev` with no console errors or failed asserts; walks between places land where they should; solids, the ball pit, rings and loose balls behave; physics stays within its cost. Prints only failed checks and a final `N passed, M failed`; `--all` prints every line. Run it before reporting; it must be green. A new behaviour worth keeping gets a small check here.

## `tools/shots.mjs`

`node tools/shots.mjs <outDir> [--port 8200] [--only name,name] [--views file.json] [--size WxH]`

One repeatable photo per viewpoint. It freezes time, resets the shader clock and runs 90 frames, so the same code differs run to run by well under 1/255 on average.

- Default list: `tools/views.json`, `[{name, hash}]`.
- `--views file.json`: your own list, same shape, plus an optional `eval` string per view: JavaScript run after the view is set up and before the photo (hold a key, change the fov).
- An `eval` cannot move the camera's height: the steps that follow re-derive the camera from the player. To photograph from a height, stand the player on something, or use `browse.mjs` with `dev.hold` and set the camera after the last step.
- `--size WxH`: default 1280x720. Use a smaller size when the question is layout, not texture.

## `tools/compare.py`

`python tools/compare.py <dirA> <dirB> [--top 5] [--out <dir>]`

For every PNG name in both folders: mean absolute difference per channel (0-255) and the percent of pixels differing by more than 24, largest first, then a summary line. Writes a side-by-side (A | B | difference x8) for the top N only, into `--out` (default `<dirB>/_compare`). It reports; it does not judge. Run-to-run noise is about 0.1-0.4.

## `tools/sheet.py`

`python tools/sheet.py <out.png> <dir-or-files...> [--cols 4] [--width 2560] [--match <substring>]`

A contact sheet: the images in a grid, each labelled with its file name.

## Other

- `tools/perf.mjs` (arrives with the frame-rate work): median frame time, draw calls, triangles, programs, textures and load time per view.
- Screenshots go under `screenshots/` (ignored by git). The lead's stage photos and the audit photos live there too.
