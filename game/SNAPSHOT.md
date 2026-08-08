# Gated game snapshot

- Source repo: divya-yuddha
- Source commit: `7540db5aa27af9a64423795a2cd7b8fcd0dd9fd0` (7540db5)
- Source committed: 2026-08-08 22:55:57 +0530
- Method: `git archive` of the recorded commit (the free-game working tree is never modified; working-tree dirt is ignored, so this copy is reproducible and complete against the commit).

## Copied from the commit
- index.html (+ gate preamble AND the S3 economy-suppression block, injected between the DYW-GATE markers)
- src/chapters.js (Story Mode data)
- assets/vendor (pixi runtime, ~780KB — the only heavy dir still copied)

## Excluded / transformed
- assets/video/ (~47MB) — NOT copied. The VIDEO_BASE web branch is rewritten to the free game's live same-origin URL (https://sangbaran-purr.github.io/divya-yuddha/assets/video/); the intro streams from there and fails open to the landing if unavailable (the game's own law).
- assets/vfx/ (~285MB, S8 WORD 1) — NOT copied. The FIVE 'assets/vfx/ refs (3 sheet-URL builders mvURL/sheetURL/stillURL + 2 reduced-motion layer PNGs, ramanaam_wash + kishkindhaoath_ring) are rewritten from 'assets/vfx/ to the free game's live Pages URL (https://sangbaran-purr.github.io/divya-yuddha/assets/vfx/); VFX sheets + layers stream same-origin. Guarded: the sync fails if the ref count is not exactly 5.
- assets/cards (~73MB) + assets/img (~80MB) + assets/audio (~2MB) + assets/thumbs (~4MB) + assets/board (~12MB) + assets/story (~13MB) — NOT copied (M-F4e). ~184MB of asset copies pushed the Pages artifact to 262MB and timed the deploy out at ~11min. Each base path (assets/<dir>/) is rewritten — every context, quoted or backtick-templated — to the free game's live Pages origin (https://sangbaran-purr.github.io/divya-yuddha/assets/<dir>/) so the assets stream same-origin. Guarded per dir: at least one relative ref must exist and EVERY one must become absolute; a double-prefix aborts. Gameplay is byte-faithful — only asset origins change.
- .DS_Store — not in the commit; never copied.

## S3 economy suppression (marker: DYW-S3-SUPPRESS-START / -END; S8 WORD 2)
- CSS display:none: the Ratna Vault (#vault + #mode-vault + .vault-buy), buy/acquire entry points (.cc-pin) + #col-wallet, landing wallet rows (.lp-wallet) + #lp-sadhana + #sadhanapick.
- DOM scrubber: coins/Amsha/Sadhana amounts removed from earn stamps (.earn-chip) and quest rewards (.q-reward); XP and LEVEL lines are kept (ruled progression). Game logic is byte-faithful — no source edit.
- KEPT VISIBLE: the Collection gallery (as a card viewer).

## Gate preamble (marker: DYW-GATE-START / DYW-GATE-END)
- Honest-door session check: no site pass -> redirect to ../rite.html. A courtesy redirect, not security.
- localStorage namespace shim (prefix "dyw::"): the copy keeps its own memory, isolated from the free game (both live on the same github.io origin, which otherwise shares localStorage).
- Return-to-gate gem-mark (top-left, safe-area aware).

## Notes at sync time
- Source working tree dirty files: 1 (ignored by the archive method).
- game/ in-repo size: 1684 KB.

## Entry-link stamps (S8 flag-1)
- The five site->game links (rite.html x3, index.html x2) are stamped game/index.html?v=7540db5 — bound to this HEAD short sha, so they change exactly when the copy changes. The sync fails if the link count is not exactly 5.

## Refresh
    bash scripts/sync_game.sh
