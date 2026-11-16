# AGENTS.md

A browser dreamcore walking game: three.js, no build step, static files, live at https://dan-k391.github.io/dreamcore/.

## The bar

- **Insanely detailed quality.** It should look like it can keep up with AAA: impressive, photorealistic graphics. Every object counts, not only the rooms: a bench, a lamp post, a pillar, a palm, a slide each need believable shape, material and texture up close.
- **Looks before size.** This is no longer a small game, and bigger rooms may come later. However large a place is, spend the effort on how it looks, not on how much there is.

When the two pull against each other, quality wins: one place finished properly beats three that are plain.

## Who does what

- **The lead** plans and directs: decides what gets built, writes the briefs, judges results against the bar as art director, commits and pushes. It does not write game code, except small fixes (below).
- **Small fixes take the short path.** A small, contained change (a tuning number, a few lines in one or two files, a text or doc edit) the lead makes itself: edit, rebuild the bundle, run the suite, look at it if the picture changes, commit. No subagent, no brief, no reviewer, and nothing beyond what was asked: no added scope, no extra proofs or new suite checks unless the fix needs one. Go back to the full process when it grows past about 30 lines, or could break the controls or let the player leave the level.
- **Subagents do the work.** Claude subagents use medium effort:
  - Opus 5.5 for the tough work: shared systems (rendering, shaders, materials, physics, collision), building or rebuilding a place or its objects, art review, and review of that code.
  - Sonnet 5.5 for the easier work: test runs and photo comparisons, audit photos and contact sheets, mechanical edits, small well-specified fixes, merges, tool edits.
- **For GPT leads, use these subagent replacements:**
  - GPT-6.1 Sol (`gpt-6.1-sol`) at max effort replaces Opus 5.5 medium for the tough work listed above.
  - GPT-6.1 Terra (`gpt-6.1-terra`) at high effort replaces Sonnet 5.5 medium for the easier work listed above.
- **One subagent for a straightforward change.** It runs its own tests and looks at its own result; nobody re-checks it.
- **Independent reviewers only where complexity or risk justifies them:** shared systems, anything that could break the controls or let the player leave the level, and art that sets the look for many places. A reviewer gets one question and the diff, and two reviewers never check the same thing. After a fix, verification re-runs the failing cases and reads the fix's diff; it does not repeat the review.
- The owner has put the lead fully in charge: no questions back to the owner, commit and push whenever it makes sense. Subagents never push and never ask the owner anything; they report to the lead.

## Standing rules

- No horror content. It is a calm place to walk around.
- Look: strong contrast between dark and bright, warm yellowish lights (never pure white), nothing washed out.
- First-person controls must keep working: mouse look, WASD, jump, run, zoom, and the cursor fallback where the mouse can't be captured.
- Things in the world are solid and behave: you can stand on what looks standable, you can't walk through what looks solid, and loose things (floating rings, balls) react to you and to the water.
- Never recreate a specific existing game, its levels, characters or art.
- It must run smoothly. Never trade visible quality for speed; find the waste instead.
- 16 texture units is the hard limit per material: 9 lamp shadow maps and 1 sun shadow map are always bound, leaving 6.
- Look at what you built, from several angles and up close, before calling it done. A change that was not looked at is not finished.
- Screenshots go under `screenshots/` (ignored by git, never committed). The local branch `with-screenshots` is never pushed.

## Working economically

Quality is not negotiable; waste is. Half of what a subagent costs is re-reading its own growing conversation on every step, a third is tool output entering it, and a photo read early in a long job is paid for again on every later step.

- **Fewer, fuller steps.** One command that does several things, one script that takes all the photos. A job that would run past about 60 steps is two jobs: stop at a clean point and report what the next agent needs.
- **Do not print what you will not read.** Cut long output with `tail` or `grep`; read files by line range.
- **Numbers before eyes.** What a script can check (tests, picture differences, timings, counts) a script checks, and its numbers are trusted.
- **Photos in batches, sheets before singles.** Open a full-size photo only to judge fine detail up close or when a sheet raises a doubt; never read the same photo twice. Judging a material or an object at arm's length still needs full-size close-ups: do not skimp there.

## Test commands

Use these, not the shared Browser pane. Details, the `?dev` hooks and the photo tools: [docs/testing.md](docs/testing.md).

- `node tools/serve.mjs <port>`: serve the copy you are working in (background; stop it when done). The lead's main checkout is usually on 8200.
- `node tools/test.mjs [--port 8200] [--all]`: the regression suite. Prints only failures and a count. Must be green before you report.
- `node tools/browse.mjs --url "http://127.0.0.1:<port>/?dev#x,z,yaw,pitch" --shot out.png --eval "<js>"`: load the game headless on the real GPU, run JavaScript in the page, save a photo, print `{result, errors}`.
- `node tools/shots.mjs <outDir> [--port] [--only a,b] [--views file.json] [--size WxH]`: a batch of repeatable photos.
- `python tools/compare.py <dirA> <dirB>`: picture difference per view, side-by-sides for the largest only.
- `python tools/sheet.py <out.png> <dir-or-files...>`: a labelled contact sheet.

## Reference

Read the one your job touches; the brief will say which.

- [docs/building.md](docs/building.md): code layout, adding a place, making things solid, loose things.
- [docs/materials.md](docs/materials.md): the material library, its names and options, the showroom.
- [docs/testing.md](docs/testing.md): the test tools and dev hooks in full.
- [docs/props.md](docs/props.md): the prop kits, the kit function convention, the dev yard and its addresses, the inventory of objects and where each is built today.
