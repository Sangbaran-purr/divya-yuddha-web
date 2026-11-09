# Gated game snapshot

- Source repo: divya-yuddha
- Source commit: `ea6d41fc39a9844be7c604868951f4b194286808` (ea6d41f)
- Source committed: 2026-11-09 15:24:56 +0530
- Copy id (the stamp, GUEST-PLAY-1): `c6074c7` — 7 hex of the sha-256 of game/index.html
- Method: `git archive` of the recorded commit (the free-game working tree is never modified; working-tree dirt is ignored, so this copy is reproducible and complete against the commit).

## Copied from the commit
- index.html (+ gate preamble AND the S3 economy-suppression block, injected between the DYW-GATE markers)
- src/chapters.js (Story Mode data)
- src/engine.js (M-P2 D1 — STANDALONE byte-identical engine copy for the mp/ multiplayer wrapper; same commit as the inlined engine, so byte-identical; guarded — the sync aborts if the archive did not carry it)
- src/narrator.js (SYNC-NARRATOR-1 — the battle-log narrator index.html loads: the recorder and the VIEW BATTLE LOG panel on the result faces read it; guarded — the sync aborts if the archive did not carry it)
- assets/vendor (pixi runtime, ~780KB — the only heavy dir still copied)

## Excluded / transformed
- assets/video/ (~47MB) — NOT copied. The VIDEO_BASE web branch is rewritten to the free game's live same-origin URL (https://sangbaran-purr.github.io/divya-yuddha/assets/video/); the intro streams from there and fails open to the landing if unavailable (the game's own law).
- assets/vfx/ (~285MB, S8 WORD 1) — NOT copied. The FIVE 'assets/vfx/ refs (3 sheet-URL builders mvURL/sheetURL/stillURL + 2 reduced-motion layer PNGs, ramanaam_wash + kishkindhaoath_ring) are rewritten from 'assets/vfx/ to the free game's live Pages URL (https://sangbaran-purr.github.io/divya-yuddha/assets/vfx/); VFX sheets + layers stream same-origin. Guarded: the sync fails if the ref count is not exactly 5.
- assets/manifest (~73MB, HALL-SYNC-1) — NOT copied. The export premium effects (Vajra, Sudarshana chain, Pashupatastra, Brahmastra) and the 20 Hero actors at both rungs, plus registry.json + factionfx.json. Every manifest URL resolves against the game's single FX.base, rewritten to https://sangbaran-purr.github.io/divya-yuddha/assets/manifest/ in the heavy-dir loop below; guarded: exactly one absolute base after the rewrite, else the sync aborts. The free game's Pages serves CORS (access-control-allow-origin: *), so the fetches decode cleanly; a missing asset fails open to the classic sprite (the game's own law).
- assets/cards (~73MB) + assets/img (~80MB) + assets/audio (~2MB) + assets/thumbs (~4MB) + assets/board (~12MB) + assets/story (~13MB) — NOT copied (M-F4e). ~184MB of asset copies pushed the Pages artifact to 262MB and timed the deploy out at ~11min. Each base path (assets/<dir>/) is rewritten — every context, quoted or backtick-templated — to the free game's live Pages origin (https://sangbaran-purr.github.io/divya-yuddha/assets/<dir>/) so the assets stream same-origin. Guarded per dir: at least one relative ref must exist and EVERY one must become absolute; a double-prefix aborts. Gameplay is byte-faithful — only asset origins change.
- .DS_Store — not in the commit; never copied.

## S3 economy suppression (marker: DYW-S3-SUPPRESS-START / -END; S8 WORD 2)
- CSS display:none: the Ratna Vault (#vault + #mode-vault + .vault-buy), buy/acquire entry points (.cc-pin) + #col-wallet, landing wallet rows (.lp-wallet) + #lp-sadhana + #sadhanapick.
- DOM scrubber: coins/Amsha/Sadhana amounts removed from earn stamps (.earn-chip) and quest rewards (.q-reward); XP and LEVEL lines are kept (ruled progression). Game logic is byte-faithful — no source edit.
- KEPT VISIBLE: the Collection gallery (as a card viewer).

## GROWTH-1 block (marker: DYW-GROWTH1-START / -END; owner rulings 2026-11-06)
- The /game/ share preview: meta description + og/twitter tags (the ruled sub-line; image assets/og/og_game.jpg).
- #7: until a wallet has ever been connected on this site (the counter's wallet flag), the Quests intro line, reward lines and the level flourish are hidden — and (ruling A5) the difficulty picker's reward multiplier wording.
- #18: for a browser that has never connected a wallet on this site (the counter's flag — the copy has no Torana read), the opened Multiplayer door reads "unlock with the Torana" and goes to ../store.html#bundle.
- #19: after the 3rd finished match vs AI (the counter's 'match' finish), once per browser, never inside a frame: the ruled nudge card ("See the Torana" → ../store.html#bundle / "Not now").
- #20: every road to the store from the copy (the door, the nudge, the Store roundel) carries the player's first-touch utm tags.
- Stage 2 (#10/#11): ../play/shared/share.js (DY_SHARE) is loaded here, so the game's CHALLENGE A FRIEND (a win vs AI) links to the home page with the sharer's first-touch source + utm_medium=share + utm_campaign=challenge; the game itself reports the share (its fourth counter line).

## Gate preamble (marker: DYW-GATE-START / DYW-GATE-END)
- GUEST-PLAY-1 (owner ruling 2026-10-26): NO pass check and NO redirect - free play needs no wallet. (Until then: no site pass -> redirect to ../rite.html, a courtesy redirect, never security.) The Hall keeps its own gate (wallet + Torana) and the match server its own check.
- The solo_start tag (GUEST-PLAY-1): one tag-only Plausible event the first time this browser starts a battle; utm values only; never in the Hall's or the Daily Puzzle's frame.
- localStorage namespace shim (prefix "dyw::"): the copy keeps its own memory, isolated from the free game (both live on the same github.io origin, which otherwise shares localStorage).
- Return-to-gate gem-mark (bottom-left, safe-area aware). Skipped when the page is framed with ?wire=1 (the Hall's battle frame): a tap there would navigate the battle away mid-match (S-HALL-WIRE-1 R5).
- MINI-GAMES-1 Daily Puzzle Effects R2: the free Daily Puzzle (/play/daily/) frames this copy with ?puzzle=1. That frame — same origin, parent under /play/daily/ — skips the gem (the page around it is the way back) and the solo_start tag.

## Notes at sync time
- Source working tree dirty files: 25 (ignored by the archive method).
- game/ in-repo size: 2292 KB.

## Entry-link stamps (S8 flag-1)
- The twenty-five site->game links (rite.html x5, index.html x3, treasury.html x2, demo/index.html x2, store.html x2, explore.html x2, mint.html x2, dashboard.html x2, my-invites.html x2, play/daily/index.html x1, play/smriti/index.html x2 — LINK-HOME-1) are stamped game/index.html?v=c6074c7 — the COPY ID (GUEST-PLAY-1): the first 7 hex of the sha-256 of this game/index.html, so they change exactly when the copy's BYTES change (a new source commit OR a changed injected block). The sync fails if the link count is not exactly 22.

## STAMP (S-HALL-WIRE-1 R4)
- game/STAMP holds the copy id (c6074c7), plain text (the source commit is recorded above). The Hall reads it (no-store) to build its battle frame's URL (../game/index.html?v=<sha>&wire=1), so the frame is bound to these bytes without mp/ joining the entry-link ledger: STAMP is a file the sync owns, not a link in mp/.

## Refresh
    bash scripts/sync_game.sh
