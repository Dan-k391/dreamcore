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
- `?dev` in the address turns on the test hooks (`window.dev`); `#x,z,yaw,pitch` starts the player there.
- Look at what you built, from several angles and up close, before calling it done. A change that was not looked at is not finished.
- Put screenshots under `screenshots/` (ignored by git, never committed). The local branch `with-screenshots` is never pushed.
