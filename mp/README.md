# mp/ — Divya Yuddha multiplayer wrapper (M-P2)

**Authority:** MULTIPLAYER_DESIGN_v1 §2 ruling 4 — the engine is **byte-identical** and the **sole card-fact
authority**; multiplayer is a **shell that feeds it moves**. This directory never edits the engine.

## What this is
`wrapper.js` is a driver/shell around the engine. It **deals from outside** (`newGame` with `opts.scenario` ordered
decks/hands and/or `opts.rng` seeded shuffle) and **feeds each seat's moves in** through the engine's PUBLIC API
(`playCard` / `pass` / `mulligan` / `doLeap` / `designateShield`). The engine runs no loop of its own — the wrapper
is the loop. A seat is one of:

- **engine** — the engine plays its own turn (`aiTakeTurn`): "the engine playing".
- **externalAI** — the AI **brain** runs OUTSIDE the engine loop: the wrapper takes the decision from `aiMove`/`bestLeap`
  and applies it via the public API: "moves fed from outside itself".
- **scripted** — a predetermined move list supplied entirely from outside.

**Concede = pass** (owner ruling D2). No engine forfeit primitive; the 90 s disconnect forfeit is a server verdict (M-P6).

## Why this lives OUTSIDE `game/`
`scripts/sync_game.sh` does `rm -rf game/` every run, so anything inside `game/` is wiped. `mp/` is a sibling — the
sync never touches it, so the wrapper **survives every sync untouched**.

## The engine copy
The wrapper needs the byte-identical engine. `sync_game.sh` (owner ruling D1) archives `src/engine.js` from the game
HEAD to **`game/src/engine.js`** — same commit as the inlined engine in `game/index.html`, so byte-identical; refreshed
every sync; guarded (the sync aborts if the archive did not carry it). The browser page loads that copy; its top-level
`function` declarations become `window` globals in a classic script, which the wrapper drives.

## Files
- `wrapper.js` — UMD (Node `require` / browser `window.DYWrapper`): the public-API router, the three seat kinds, the loop.
- `proof.js` — Node harness. Requires the game repo's canonical `src/engine.js` **directly** (strongest byte-identity),
  and drives full matches through the wrapper: external deal (scenario + seeded rng), external moves (engine vs
  outside-fed, both-external, scripted), mulligan, rounds, win, concede==pass. Run from the site repo root:
  ```
  node mp/proof.js
  ```
- `index.html` — dark test page (unlinked, noindex). Loads the sync-produced `game/src/engine.js` + `wrapper.js` and
  runs a live wrapper match (engine vs outside-fed / both-external), showing the deal, the move stream, and the winner.

## Fences
Engine bytes never edited (hash before == after). Game repo untouched. No server / wire / money in M-P2 (those are
M-P3+). The wrapper is a shell; the engine is the authority.
