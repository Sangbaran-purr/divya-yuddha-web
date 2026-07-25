# The Threshold — Divya Yuddha companion site (Phase A)

A night-dark temple gateway that happens to respond to clicks. This is the
**LANE-W companion surface**: wallet-is-identity, a free soulbound Access token,
and the treasury hall of owned cards. It **never touches the game repo's
`index.html`** — the free game elsewhere stays free and untouched.

- **Stack:** vanilla HTML/CSS/JS. No framework, no build step, no bundler.
  `ethers` is loaded from a pinned CDN, lazily, only on the first chain action.
- **Design authority:** `docs/DESIGN_DIRECTION_v1_1.md` (law) + the accepted
  master mockup `docs/design/gate_master.png` (look).
- **Product authority:** `WEB3_PRODUCT_v1` + `GATES_v1` in the contracts repo
  (`divya-yuddha-web3`).

## Pages
- `index.html` — **The Gate** (facade: crest, doorway with the visible war,
  DECLARE YOURSELF, the four-faction band, the Law parchment).
- `rite.html` — **The Rite** (claim states; the free claim ships **dormant** —
  "THE RITE OPENS SOON" — because the site cannot mint; `AccessNFT.mint` is
  `onlyMinter`. A later authorized-minter module opens it).
- `treasury.html` — **The Treasury** (owned WaveCardNFT cards on plinths; empty
  hall until cards are held; per-token Polygonscan links).
- `game/` — **The gated game copy** (S2). A copy of the built game behind the
  honest-door Access check. A holder's ENTER on the rite sets a session pass and
  the §8.4 door-wipe carries them in; a passless deep-link to `game/` bounces to
  the rite. Not DRM — the game is free elsewhere by design.

## Updating the gated game

One command, safe to re-run after every game update:

```
bash scripts/sync_game.sh
```

It reads the free-game repo **read-only** (`git archive` of its current
`HEAD` — working-tree dirt is ignored, so the copy is reproducible), rebuilds
`game/` from scratch (idempotent — two runs produce byte-identical output),
and records provenance in `game/SNAPSHOT.md`. What it does:

- Copies `index.html` + `src/chapters.js` + `assets/{cards,img,audio,story,thumbs}`.
- **Video:** does not copy the ~47MB intro (`assets/video/`); rewrites the
  `VIDEO_BASE` web branch to the free game's live same-origin URL so the intro
  streams from there and fails open to the landing if unavailable.
- **Gate preamble** (between `DYW-GATE-START`/`END` markers, replaced cleanly on
  re-sync): an honest-door session check that redirects passless visitors to
  `../rite.html`; a `localStorage` namespace shim (prefix `dyw::`) so the copy
  keeps its own memory, isolated from the free game (both share the
  `sangbaran-purr.github.io` origin, which otherwise shares `localStorage`); and
  the return-to-gate gem-mark. **No wallet code lives in the game copy** — the
  site shell owns all wallet logic.

Override the source path with `GAME_REPO=/path/to/divya-yuddha bash scripts/sync_game.sh`.

## Config
`config.js` — chain (Amoy 80002), contract address slots (⚠ **rehearsal
placeholders, replaced at Phase-A freeze**), and the pinned `ethers` version.
**No secrets exist client-side** — addresses only, never keys.

## Phase A scope
Connect · claim shell (dormant) · play-gate · **gated game copy (S2)** ·
collection. **Not** in Phase A: staking, matchmaking, token-to-NFT claim paths,
XP/earning.
