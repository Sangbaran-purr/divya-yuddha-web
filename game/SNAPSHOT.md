# Gated game snapshot

- Source repo: divya-yuddha
- Source commit: `44690ca615034bdfb8c4a00c4358f260d4d2a7b0` (44690ca)
- Source committed: 2026-07-24 11:54:37 +0530
- Method: `git archive` of the recorded commit (the free-game working tree is never modified; working-tree dirt is ignored, so this copy is reproducible and complete against the commit).

## Copied from the commit
- index.html (+ gate preamble injected between the DYW-GATE markers)
- src/chapters.js (Story Mode data)
- assets/cards, assets/img, assets/audio, assets/story, assets/thumbs

## Excluded / transformed
- assets/video/ (~47MB) — NOT copied. The VIDEO_BASE web branch is rewritten to the free game's live same-origin URL (https://sangbaran-purr.github.io/divya-yuddha/assets/video/); the intro streams from there and fails open to the landing if unavailable (the game's own law).
- .DS_Store — not in the commit; never copied.

## Gate preamble (marker: DYW-GATE-START / DYW-GATE-END)
- Honest-door session check: no site pass -> redirect to ../rite.html. A courtesy redirect, not security.
- localStorage namespace shim (prefix "dyw::"): the copy keeps its own memory, isolated from the free game (both live on the same github.io origin, which otherwise shares localStorage).
- Return-to-gate gem-mark (top-left, safe-area aware).

## Notes at sync time
- Source working tree dirty files: 4 (ignored by the archive method).
- game/ in-repo size: 246112 KB.

## Refresh
    bash scripts/sync_game.sh
