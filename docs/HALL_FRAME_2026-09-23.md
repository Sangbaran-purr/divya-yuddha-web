# The Hall steps back — MP-FIX-2 (2026-09-23)

Two faults were reported against the Hall's multiplayer road on 2026-09-23. This is the record of the owner's
rulings, the measurements they were ruled against, and the decisions taken while building them.

---

## Owner rulings (2026-09-23), verbatim in substance

**Fault 1 — the board is small in the Hall.** Road **(i)**: *the Hall collapses its chrome while a match is live,
restoring it in the lobby; the 900–1023 px band's missing rule is closed; the frame gets the window's width AND
height.*

**The remote-cast proof, server-relay half.** *Prove it on a local dev-mode match server (`DEV_ADDRESS_MODE`, no
wallets, no funds); never against the live server with real DYC.*

---

## 1 · What was measured before a line was changed

The game's own device matrix (`src/device_matrix.json` in the game repo, 16 viewports) gives the board's geometry
when the game has the whole window. The same build, in the Hall, through the real frame, with a live server-relayed
match, measured this:

| viewport | frame (Hall) | board half — Hall | board half — solo | height lost |
|---|---|---|---|---|
| 360×800 | 360×593.5 | 358 × 118.5 | 358 × 214 | −44.6% |
| 375×812 | 375×605.5 | 373 × 130.7 | 373 × 228.7 | −42.8% |
| 390×844 | 390×637.5 | 388 × 146.7 | 388 × 244.7 | −40.0% |
| 430×932 | 430×755.5 | 428 × 215 | 428 × 288.7 | −25.5% |
| 768×1024 | 520×847.5 | 518 × 264 | 518 × 336.8 | −21.6% |
| 810×1080 | 520×903.5 | 518 × 292 | 518 × 374 | −21.9% |
| 834×1194 | 520×1017.5 | 518 × 349 | 518 × 431 | −19.0% |
| 1024×768 | 1024×567.5 | 919.6 × 113.4 | 919.6 × 213.6 | −46.9% |
| 1024×1366 | 1024×1165.5 | 919.6 × 412.4 | 919.6 × 512.6 | −19.5% |
| 1080×810 | 1024×609.5 | 970 × 134.4 | 970 × 234.6 | −42.7% |
| 1194×834 | 1120×633.5 | 998 × 146.4 | 998 × 246.6 | −40.6% |
| 1280×800 | 1120×599.5 | 998 × 129.4 | 998 × 229.6 | −43.6% |
| 1366×1024 | 1120×823.5 | 998 × 241.4 | 998 × 341.6 | −29.3% |
| **1440×900** | **1120×699.5** | **998 × 179.4** | **998 × 279.6** | **−35.8%** |
| 1680×1050 | 1120×849.5 | 998 × 254.4 | 998 × 354.6 | −28.3% |
| 1920×1080 | 1120×879.5 | 998 × 269.4 | 998 × 369.6 | −27.1% |

The **width** was already right from 1024 up (the frame's `clamp(1024px, 100vw − 64px, 1120px)` carries the game's
desktop layout, and its `#app` caps at 1000 either way). The fault was **height**, and it was a constant: on every
viewport from 1024 up the Hall kept exactly **200.5 px** of its own chrome above the frame — nav 65, the title band,
the column's padding — which is **100.2 px off each board half**. On phones the nav wraps to two lines and the toll
rises to ~206 px.

**The 900–1023 band, measured:** the frame was 520 wide at 900×800 (x = 212.5) and at 1000×800 (x = 265). There was
no rule for the band; that geometry fell out of the base `max-width: 520px` plus the column's own centring. It was
not wrong — it was **unstated**, which is the thing the ruling closes.

## 2 · What was built

**`html.hall-match-live`** — one class on the document element, set and cleared in `syncFrameHost()`, the one place
in `hall.js` that already decides whether the frame is on screen. It goes on when the frame is mounted, **dealt**,
**ready**, and the match has **no outcome**; it comes off on the outcome, on leave, on unmount, on the thin-client
fallback, and in the lobby. `unmountFrame` and `frameFallback` clear it directly as well as through the render.

While it is on, `hall.css` hides the nav and the title band, flattens the column's padding and the statue-corridor
margins, and pins the frame host to `position: fixed; inset: 0` with **nothing but `env(safe-area-inset-*)` padding**.
The frame fills it in both directions and drops its 520 floor, because the frame **is** the window.

**Three decisions taken while building, stated rather than hidden:**

1. **The dealing beat keeps the Hall's chrome.** The matched moment is the Hall's, not the board's. The layout
   therefore changes exactly once, on a beat the player is already watching, instead of twice.
2. **The status strip stays, as an overlay.** `#hall-root` carries `statusStrip`'s lines — reconnecting, the vanish
   line, the thinking clock — in a slot that is usually empty. Leaving it in the flow would have cost the frame 34 px
   and missed the ruling; removing it would have cost the player two urgent lines. While live it becomes a fixed
   overlay at the top of the frame with `pointer-events: none`: an empty slot draws nothing, and a live line sits
   over the board's top chrome, which is the right trade for a line that only appears when something is wrong.
3. **The flag comes off the moment a match has an outcome.** The settle controls and *back to the Hall* live in that
   same strip, and they must never be behind a board.

**The 900–1023 rule** now states exactly what was measured there before the change: `min(520px, 100vw − 32px)`, auto
margins inside the already corridor-centred 820 column — x = 212.5 at 900, x = 265 at 1000. Nothing moved.

## 3 · What it measures now

Frame **= the window** on all sixteen matrix viewports plus 900×800 and 1000×800, with no page scroll behind it. The
board inside then matches the same build playing solo at the same window size:

| viewport | frame | board half — Hall (after) | board half — solo |
|---|---|---|---|
| 1024×768 | 1024×768 | 919.6 × 213.7 | 919.6 × 213.6 |
| 1024×1366 | 1024×1366 | 919.6 × 512.7 | 919.6 × 512.6 |
| 1080×810 | 1080×810 | 970 × 234.7 | 970 × 234.6 |
| 1194×834 | 1194×834 | 998 × 246.7 | 998 × 246.6 |
| 1280×800 | 1280×800 | 998 × 229.7 | 998 × 229.6 |
| **1440×900** | **1440×900** | **998 × 279.7** | **998 × 279.7** |
| 1680×1050 | 1680×1050 | 998 × 354.7 | 998 × 354.6 |
| 1920×1080 | 1920×1080 | 998 × 369.7 | 998 × 369.6 |

At 1440×900, like for like — the same build, the same window, one card on the board — the Hall's frame and a solo
match both draw a **998 × 279.7** half and a **112.5 × 150** board card. Identical, not close.

**The lobby is untouched by construction**: every declaration in the collapse block is behind the class, and a
19-viewport layout fingerprint (box, display, position, padding, margin, width, max-width, flex, gap for ten lobby
elements) is **identical before and after**, on the same signed-in floor.

Board-card size depends on how many cards share a row, so it is not a constant per viewport; the board **half** is,
which is why the tables above use it.

## 4 · The server-relay proof (free road), on a local dev-mode server

Per the ruling: `PORT=8123 DEV_ADDRESS_MODE=1 STAKING_ENABLED=0` — paste-address auth, **free tables only, no escrow
env, no wallets, no funds**. Two browser tabs signed in through the Hall's own door as two throwaway dev addresses,
opened and joined a free table, and played a real match relayed by the server (one server-minted `matchId`,
`Wire.road: "free"`, `Wire.seq` advancing to 14).

Both card classes manifested **premium on the receiving client**, from the real relay:

| cast | caster → receiver | receiver's truth |
|---|---|---|
| Mahabali (routed Hero) | seat 1 → seat 0 | `mfManifest` → **true**; `MF.diag` empty (no fallback) |
| Vajra (routed Astra) | seat 0 → seat 1 | `fxCast` gate **go**, 36/36 frames drawn, `drawError: null`, all six cues; `fxOwnsMoment('vajra')` → **true** |
| Sudarshana Chakra (routed Astra) | seat 0 → seat 1 | `fxCast` gate **go**, 45/45 frames drawn, all eight cues; `fxOwnsMoment` → **true** |

**What dev mode could not exercise: the staked road.** `STAKING_ENABLED` is derived, not set —
`!!(MATCH_RPC_URL && STAKE_ESCROW_ADDRESS && DYC_ADDRESS)` — and with it on, opening a staked table verifies locked
escrow **on chain**. There is no staked-shaped room without an escrow, so a dev-mode server cannot serve one. The
staked half of the remote-cast-proof law was already discharged in HALL-SYNC-4's live check on divyayuddha.games
(the opponent's faction pool prefetched at match start, and a remote Mahabali drawing premium at rung 256).

**One harness note, disclosed:** the browser pane fronts one tab at a time, so the receiving tab is hidden mid-cast
and the game's shipped `visibilitychange → fastForwardChoreo` correctly skips the visuals. That is the product
behaving as designed, not a fault; it was neutralised in the receiving tab for the measurement and nowhere else.
