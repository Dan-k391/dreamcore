# AGENTS.md

This is a browser dreamcore walking game (three.js, no build step, served as static files, live at https://dan-k391.github.io/dreamcore/). The bar for everything in it:

- **Insanely detailed quality.** It should look like it can keep up with AAA: impressive, photorealistic graphics. Every object counts, not only the rooms: a bench, a lamp post, a pillar, a palm, a slide each need believable shape, material and texture up close.
- **Small in scope.** A tiny level, not a big game. Spend the effort on how it looks, not on how much there is.

When the two pull against each other, quality wins: one place finished properly beats three that are plain.

## Who does what

- The lead session is the **head manager and art director**. It decides what gets built, writes the briefs, judges the results against the bar above, and commits and pushes. It does not write game code itself.
- **Coding, code review and testing are done by subagents: Opus 5.5 at medium effort.** Every change is written by one subagent and then checked by others (a code review and a test run) before the lead accepts it.
- The owner has put the lead fully in charge: no questions back to the owner, commit and push whenever it makes sense. Subagents never push and never ask the owner anything; they report to the lead.

## Standing rules for the game

- No horror content. It is a calm place to walk around.
- Look: strong contrast between dark and bright, warm yellowish lights (never pure white), nothing washed out.
- First-person controls must keep working: mouse look, WASD, jump, run, zoom, and the cursor fallback where the mouse can't be captured.
- Things in the world are solid and behave: you can stand on what looks standable, you can't walk through what looks solid, and loose things (floating rings, balls) react to you and to the water.
- Never recreate a specific existing game, its levels, characters or art.
- It must run smoothly. Never trade visible quality for speed; find the waste instead.
- 16 texture units is the hard limit per material: 9 lamp shadow maps and 1 sun shadow map are always bound, leaving 6.

## Testing (subagents: use this, do not use the shared Browser pane)

- Serve your working copy: `python -m http.server <port> --bind 127.0.0.1` from the repo root, on the port your brief gives you.
- `node tools/browse.mjs --url "http://127.0.0.1:<port>/?dev#x,z,yaw,pitch" --shot out.png --eval "<js>"` loads the game in a private headless browser on the real GPU, runs JavaScript in the page, saves a 1280x720 screenshot and prints `{result, errors}`. It exits non-zero on any page error. Read the screenshot file to look at it.
- `?dev` in the address turns on the test hooks (`window.dev`, in `js/dev.js`); `#x,z,yaw,pitch` starts the player there. Without `?dev` none of it exists.
  - `dev.ready`: level built, baked and one frame drawn. `dev.hold = true` stops the normal loop, so only `dev.step(n, dt = 1/60)` moves time (deterministic).
  - `dev.state()` -> `{x, y, z, zone, sky, air}` (y = feet height). `dev.key(code, down)` presses a key by `KeyboardEvent.code`.
  - `dev.go(x, z, yaw, keys = [], secs = 0, pitch = 0)`: teleport, settle, hold the keys for `secs`, release, return `state()`. Also `camera`, `scene`, `renderer`, `zones`, `cost()`, `info()`.
- `node tools/test.mjs [--port 8200]`: the regression suite (page loads with and without `?dev` with no console errors or failed asserts, and walks between places land where they should). Run it before reporting; it must be green.
- `node tools/shots.mjs <outDir> [--port 8200] [--only name,name]`: one repeatable 1280x720 photo per viewpoint in `tools/views.json` (`[{name, hash}]`). Shoot before and after a change and compare; run to run, the same code differs by well under 1/255 on average.
- Code layout: `js/zones/<place>.js` holds everything about one place (its zones, materials, geometry, floors, lights, props); `js/level.js` imports them in order. Adding a place = a new file there and one import line in `level.js`, plus three shared edits when they apply: a far-off place reached by a dark passage adds a row to `tunnels` in `js/zones/passages.js`; a new sky adds an entry to `skies` in `js/sky.js` and a key to `skyOnly` in `js/build.js`; a place that looks through a doorway at another place's pool adds its zone id to that pool's seen-from list in the other place's file (otherwise the water is hidden). Shared things live in `js/core.js`, `tex.js`, `mat.js`, `build.js` (builder and registries); places never import each other.
- Look at what you built, from several angles and up close, before calling it done. A change that was not looked at is not finished.
- Put screenshots under `screenshots/` (ignored by git, never committed). The local branch `with-screenshots` is never pushed.
