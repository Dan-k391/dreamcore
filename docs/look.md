# The look layer

A **look** is a set of art-direction deltas laid over the game live: light, exposure, materials, water, fog, bloom, shafts and grade. The tuning workspace (`tune.html`, below) drives it through `dev.look`; the game starts with the look saved in `js/look.applied.js`. An empty look is the game as built, pixel for pixel.

Files: `js/look.params.js` (the parameter registry and `sanitize`, no imports, also used by Node), `js/look.js` (applies a look), `js/look.applied.js` (the applied look, a literal), `looks/presets/*.json` (saved looks), `tools/look-sweep.js` (every parameter at both ends, and the per-zone check).

## The model

```json
{ "all": { "exposure": 0.3, "grade.temp": 0.2 }, "zones": { "pH": { "light.strength": 1.4 } } }
```

- Values are **deltas from what the code defines**: `mul` parameters multiply (1 = as built), `add` parameters add (0 = as built). Missing means untouched.
- `all` applies to every zone; a zone's own entry is laid over it (multipliers multiply, offsets add). Zone ids are `dev.zones` keys (`bA`, `pH`, `hT`, ...).
- **All-only** parameters (the engine has them once) are dropped from a zone entry.
- `sanitize(look, zoneIds?)` is the one validation: unknown ids, non-numbers and non-finite values dropped, values clamped to the range, all-only parameters refused per zone, zone ids limited to `[A-Za-z0-9_-]` (and, in the game, to existing zones). Everything that comes in (dev.look.set, the server, the applied file) goes through it.

## How it reaches the frame

`look.js` gives each zone with a non-neutral look a `z.lk`: the zone's own values with the look applied (exp, shaft, sat, bloom, tint, fog, contrast, vignette, sun, light strength, lamp colour). `mood()` (player.js) and `relight()` (lights.js) read `z.lk || z`. Materials, fixture colour and pool uniforms are set directly; their as-built values are kept and put back exactly when the zone returns to neutral. Nothing is rebaked: no parameter "settles", every change shows on the next frame.

Two kinds of per-zone parameters:

- **Per surface** (light, materials, water): each zone's own materials, lamps, fixtures and pools. A view from one zone into another shows each with its own values (pool hall lit 2.5x alone: its pillar on the left half changes 50.7, the right half 0.2).
- **Per view** (exposure, fog, bloom strength, shafts, grade, sun): the engine has one value per frame, mixed from the zones by where you stand (`mood()`: the zone you are in, its neighbours' shares near an opening). So a zone's value shows while you stand in it, and blends at its doorways, exactly as the zone's own exposure and fog do today.

The base film uses a radial chromatic offset of 0.002 and grain amplitude 0.026. The warm tint, S-curve, saturation and vignette remain zone-controlled as before.

## Parameters

| id | kind | range | per zone | drives |
|---|---|---|---|---|
| `light.strength` | mul | 0.3 – 2 | surface | the zone's lamps (spot intensity), its fixtures (`uLampCol`), its materials' `envMapIntensity` (ambient and reflections), its pools' plan picture and scatter |
| `light.warmth` | add | -0.5 – 1 | surface | lamp and fixture colour: + amber, - paler (still warm at -0.5); the baked ambient keeps its colour |
| `light.ambient` | mul | 0 – 2 | surface | `envMapIntensity` alone: shadow depth / fill |
| `light.sun` | mul | 0 – 3 | view | `sun.intensity` (one sun per sky) |
| `exposure` | add (stops) | -1.5 – 1.5 | view | the zone's `exp` |
| `mat.rough` | mul | 0.3 – 2 | surface | every zone material's `roughness` |
| `mat.wet` | add | 0 – 1 | surface | roughness x (1 - 0.7 w), albedo x (1 - 0.3 w) |
| `water.scatter` | mul | 0 – 3 | surface (pool's zone) | the pool's `uScatter` |
| `water.clarity` | mul | 0.25 – 4 | surface | absorption divided by it (`uLook.x`) |
| `water.reflect` | mul | 0 – 2.5 | surface | Fresnel mirror weight (`uLook.y`) |
| `water.waves` | mul | 0 – 3 | surface | the surface normal's tilt in the shader (`uLook.z`); the simulated waves and what floats are untouched |
| `fog.density` | mul | 0 – 4 | view | the zone's fog density |
| `fog.color` | mul | 0 – 3 | view | the zone's fog colour |
| `bloom.strength` | mul | 0 – 2.5 | view | the zone's `bloom` |
| `bloom.threshold` | add | -0.5 – 0.15 | all only | `bloom.threshold` (0.85) |
| `bloom.radius` | add | -0.8 – 0.05 | all only | `bloom.radius` (0.95) |
| `shafts` | mul | 0 – 3 | view | the zone's `shaft` (zones without shafts stay without) |
| `grade.sat` | mul | 0 – 2 | view | the zone's `sat` |
| `grade.temp` | add | -1 – 1 | view | the zone's tint: amber / blue |
| `grade.tint` | add | -1 – 1 | view | the zone's tint: green / magenta |
| `grade.contrast` | add | -0.4 – 0.5 | view | the film pass's S-curve amount (0.4, `uCon`) |
| `grade.vignette` | mul | 0 – 2 | view | the film pass's vignette (0.7, `uVig`) |
| `grade.grain` | mul | 0 – 3 | all only | the film pass's grain (0.026, `uGrain`) |

Picture difference (0–255, mean) at each end, from `tools/look-sweep.js`: every parameter changes its view, and setting `{}` returns it to 0.00 exactly.

## `dev.look` (`?dev`)

- `params`: `[{ id, group, label, kind, min, max, step, neutral, perZone, help }]`, all a UI needs to draw a control.
- `set(look)`: replace the current look and apply it now; returns the cleaned look. `set({})` is the game as built.
- `get()`: the current (clean) look.
- `zoneAt()`: `{ here, mix, onScreen }`: the zone the camera stands in, the mood's shares `[[id, share]]` (what the per-view parameters follow), and the zones that may be on screen (seen.js's list from here; those seen directly are frustum-tested, those through a portal are listed as is).

`dev.reset` leaves the look as it is.

## Endpoints (`tools/serve.mjs`, 127.0.0.1 only)

- `PUT /looks/applied`: writes `js/look.applied.js` from the body. Run `node tools/bundle.mjs` afterwards so `dreamcore.html` carries it (the suite checks the bundle is current).
- `GET /looks/presets`: the names. `GET / PUT / DELETE /looks/presets/<name>`: `looks/presets/<name>.json`.
- Names `[a-z0-9-]{1,64}`, bodies at most 64 KB, parsed and re-serialised through `sanitize` (never written raw). Bad name or junk JSON: 400; too big: 413; no such preset: 404.

## Presets

`warm-and-luminous`, `quiet-and-neutral`, `dreamy-and-atmospheric`, `all` only. Judged on the backrooms, pool hall, night hall, hotel hallway, field and terrace. The pool hall is the place to watch with the dreamy one: its own picture is already pale, and more fog, bloom or shafts wash it out first.

## The tuning workspace

Open `http://127.0.0.1:<port>/tune.html` with `node tools/serve.mjs <port>` running (`?tiles=1|2|4` opens with that many tiles). Files: `tune.html`, `tune.js`, `tune.css`; not in the bundle (`tools/bundle.mjs` follows `js/main.js` only).

- **Tiles.** 1, 2 or 4 scenes, each the real game in an iframe (`index.html?dev&bare`), loaded one after another, each showing its loading state (a failed one says why and offers *Try again*). A tile's header names its room by place, its scene (click for the searchable list of `tools/views.json`, grouped by place), a dot when its room has its own changes, and the other tiles that share its room. Click a picture to walk it like the game (mouse captured, or the game's bare-cursor mode where capture is refused); Esc gives the mouse back and the tile keeps the view it was left at. A held tile draws a frame only when what it can show changes (the look's `all`, or a room it can see); *Motion* lets time run in that tile (water). Going from 4 to 2 or 1 tiles unloads the others.
- **Target** (bar, *Edit*): *All rooms* edits `all`; a room (named by place, with its tile numbers) edits that zone's entry, laid over `all`. Two tiles in the same room share one entry.
- **Controls** (panel): built from the registry, grouped as it groups them; values in percent of as built, stops, or a signed scale with its direction (warmer / cooler, amber / paler, green / magenta). A dot and bright text mark a value off neutral; on a room target the grey mark on the track and the line below show what *All rooms* adds and the two together. All-only parameters are greyed on a room target. Typed entry beside each slider. ↺ or a double-click resets one; *reset* in a group's head resets the group on the target; *Clear room* the room; *Clear all* everything. *Copy to…* copies a room's entry to another tile's room. *Rooms with their own changes* lists every zone entry, also of rooms on no tile.
- **Compare.** Hold *Before* (B): every tile shows the game as built. Hold *Against* (N): the look chosen beside it (a preset or the applied look) in place of the working one. In the presets list, *hold* shows that preset as it would be laid in now.
- **Presets.** The three starters and any saved ones; click to load at *Strength* (0–150 %, scales each delta from neutral) and *Replace* or *Lay over* (multipliers multiply, offsets add). Save the working look under a name, rename, delete (not the starters), export to a `.json`, import one (refused unless it parses and holds a known value; always through `sanitize`). Saved through the server to `looks/presets/` when it answers, else in the browser (`localStorage` `dreamcore.tune.presets`); the list says which.
- **Game look.** Shows what `js/look.applied.js` holds; *Apply working look to the game* writes it (`PUT /looks/applied`; on a static host the file is downloaded instead); *Start from it* loads it as the working look. Players get it after `node tools/bundle.mjs`, a commit and a push.
- **Undo / redo** (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y) cover every change, presets, resets and imports included. The working look, scenes, layout, target, strength and mode are kept in `localStorage` (`dreamcore.tune`) and pass `sanitize` on load.
- **Keys:** 0 all rooms, 1–4 the room of that tile, hold B before, hold N against, arrows one step on a focused slider, Shift+arrows a fifth, PageUp/Down five, Esc closes a popover or stops walking.
- **Cost** (four tiles, 1920x1080, this machine): all four ready about 20 s after opening (the first 8 s, the rest 4-7 s each, loaded in turn); a slider dragged on All rooms 12.4 ms a frame (median, every tile redrawn), on one room 10.2 ms; idle tiles draw no frames; each tile holds its own textures (texMem 432 MB), so 2 or 1 tiles free that. Default 4 tiles, motion off.
- **Scripting:** `window.dev.ready` (every tile ready or failed) and `dev.tune` (`set(id, v, target)`, `setLook`, `undo`, `redo`, `before(on)`, `against(name, on)`, `preset(name, strength, mode)`, `save`, `rename`, `remove`, `list`, `importText`, `apply`, `grab(i)` a 160x90 picture of tile i, `diff(a, b)`). `tools/tune-proof.js` drives it end to end through `browse.mjs`.
