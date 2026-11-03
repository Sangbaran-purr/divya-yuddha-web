# GROW-COUNT-1 — the player counter (owner rulings, 3 Nov 2026)

**A player** is one browser that finishes at least one match vs AI, story chapter, Hall match (free or staked), Daily
Puzzle (solved or revealed, any date) or Smriti board — counted once, for life. Days are UTC.

## Where things are

| Piece | Where |
|---|---|
| The counter in the browser | `play/shared/count.js` (`window.DY_COUNT`) — loaded by `play/daily/`, `play/smriti/`, and by the game copy's injected block **ahead of its storage shim** (`scripts/sync_game.sh`), so one id spans all three |
| Finishes reported | Daily: `play/daily/page.js` `countFinish()` (battle win, fallback-board win, reveal) · Smriti: `play/smriti/page.js` `finish()` · the game (game repo `index.html`): `showGameOver` → match, `showStoryResult` → story, `showWireResult` → hall · wallet: `js/wallet.js` `countWallet()` (never on admin, treasury or owner pages) |
| Owner pages | `owner/growth.html` (players by day/week per source, visit → player, day-1 / exactly-day-7 / any-day-7–13 return, shares, wallet connects, bot flags, CSV) and `owner/links.html` (tagged links) — both behind the owner's wallet signature |
| The server | `divya-yuddha-web3/services/dy-count` (Render + Postgres at `count.divyayuddha.games`; its README has the owner's steps) |
| Tests | `tests/suites/growcount.js` (30) · `divya-yuddha-web3/services/dy-count/test/proof.js` (41) · game repo `src/test_count_hook.js` (10) |

## Switched on (owner, 3 Nov 2026)

`play/shared/count.js` sends to `ENDPOINT = "https://count.divyayuddha.games/v1/events"` (the counter's stamp is
`count.js?v=c2` in all five places: `play/daily/index.html`, `play/smriti/index.html`, `scripts/sync_game.sh` → the game
copy, and `js/wallet.js`). `tests/suites/growcount.js` G7 pins the address and G13 checks the stamps agree. To switch off
again: set `ENDPOINT = ""` (events wait in the browser's outbox; up to 45 days of them are accepted later) and bump the stamp.

**Test traffic:** rows with source `cc_test` (`utm_source=cc_test`, campaign `switchon`) are Claude's live checks — exclude
them from every report.

## Draft Privacy sentence — for the owner's ruling (ruling 8: not on any page yet)

> When you finish your first match or puzzle, your browser sends us a random anonymous ID, the link that brought you
> (for example a creator's name), and the date — never your name, email, IP address or wallet address. We use it only
> to count players and see which links bring them back; clearing this site's data in your browser removes the ID.

## The Hall's "[N] players" line (not wired yet — ruling 6)

`GET https://count.divyayuddha.games/count/public` → `{"players": N}`: lifetime players rounded **down** to the nearest
10, cached 10 minutes. When the line is wired it reads this and hides itself if the call fails.
