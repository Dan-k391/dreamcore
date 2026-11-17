# The look layer

A **look** is a set of art-direction deltas laid over the game live: light, exposure, materials, water, fog, bloom, shafts and grade. The tuning workspace (`tune.html`, next) drives it through `dev.look`; the game starts with the look saved in `js/look.applied.js`. An empty look is the game as built, pixel for pixel.

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
| `grade.grain` | mul | 0 – 3 | all only | the film pass's grain (0.035, `uGrain`) |

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
