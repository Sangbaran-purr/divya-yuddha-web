# ARCHIVE_ROAD — WHAT THE PUBLIC RPCs ACTUALLY SERVE (GATE-FIX-1)
# Dated note, 2026-09-23. Measured, not remembered. Read this BEFORE
# re-running a measurement pass against the public Polygon endpoints —
# the numbers below cost a full diagnose rung to establish.
# Amendments dated, never silent.

=====================================================
## 0. THE FAULT THIS RECORDS
=====================================================
The owner console's TORANA RELEASE panel answered FIND ELIGIBLE with
"The archive is busy or unreachable — try again in a moment." It was
not busy and it was not unreachable. drpc's free plan had silently cut
its `eth_getLogs` span, and the console's archive-selection probe —
hardcoded at 128 blocks — read that width rejection as "this endpoint
is not an archive", failed over to publicnode (which IS pruned), ran
out of candidates, and surfaced the archive message.

Three panels failed the same way at the same moment, because they share
one probe: ACCESS DROP history, PURCHASE REGISTRY (the Bought column),
PROCESS CLAIM / GRANT REWARDS. Same cause, same hour, one fix.

=====================================================
## 1. THE MEASURED TRUTH (2026-09-23)
=====================================================
**drpc free plan (`https://polygon.drpc.org`)**

- `eth_getLogs` maximum span: **101 blocks inclusive**. 102 is refused.
  Stable across repeated runs; the same at the deploy block and at the
  chain head, so it is a WIDTH cap, not a history-depth cap.
- The rejection text is **STALE AND MISLEADING**:

      HTTP 400  {"error":{"code":35,
                 "message":"ranges over 10000 blocks are not supported on free plan"}}

  It says 10000. It means 101. Do not trust the number in that string;
  trust the measurement. A 128-block request is refused by a message
  claiming a 10000-block allowance.
- Depth is FINE: a 1-block `getLogs` at the deploy block (92050143)
  returns cleanly. drpc still holds the archive. It just will not serve
  it wide.
- Rate: 60 sequential 101-block calls, unpaced — 60/60 clean, mean
  242ms, ~4.1 req/s. No 429, no throttle at that rate.
- ⚠ Measuring gotcha: Cloudflare answers `HTTP 403 error code: 1010` to
  a default `Python-urllib` User-Agent. That is a UA block, NOT a rate
  limit and NOT a drpc verdict. Send a browser User-Agent when probing
  by script, or you will measure your own tooling.

**The public-archive survey — nothing free serves deep getLogs wide**

| endpoint | 1-block @ deploy | 9999-block @ deploy |
|---|---|---|
| polygon.drpc.org | OK (archive intact) | ERR 35 (cap 101) |
| polygon-bor-rpc.publicnode.com | −32701 pruned | −32701 pruned |
| polygon-rpc.com | −32051 API key disabled / tenant disabled | same |
| 1rpc.io/matic | −32602 "limited to 0 - 50 blocks range" | same |
| rpc.ankr.com/polygon | −32000 Unauthorized, API key required | same |
| polygon.llamarpc.com | transport failure (no connect) | same |
| polygon.meowrpc.com | transport failure | same |
| polygon.blockpi.network | HTTP 521 | same |
| polygon.api.onfinality.io | −32029 Too Many Requests / needs key | same |
| polygon-pokt.nodies.app | HTTP 403 paid plan required | same |

**Conclusion: the free public archive era is over for this workload.**
A second free fallback is not available to be added. The deep scan needs
either an owner-keyed endpoint or many thousands of narrow calls.

**The arithmetic that follows from it** (DYCoinSale deploy 92050143 →
head 94291762 = 2,241,620 blocks):

| span | chunks | at the measured 4.1 req/s |
|---|---|---|
| 9999 (the old constant) | 225 | ~55s — but every call is refused |
| **101 (drpc free)** | **22,195** | **~90 min** |
| 50 (1rpc) | 44,833 | ~182 min |

A 75-second scan deadline cannot cover that, and the deadline had in
fact already been outgrown at the OLD width (225 chunks × ~362ms ≈ 81s).

=====================================================
## 2. KEY-SAFETY LAW (standing)
=====================================================
The keyed archive RPC URL is the owner's paid credential. It is
therefore bound by all four of these, permanently:

1. It enters the system **only** through the owner console's
   Configuration panel (`Read RPC URL`).
2. It lives **only** in this browser's `dyadmin::config` localStorage
   entry. Not in `config.js`, not in `admin-config.js`, not in any
   committed file, not in a screenshot, not in chat.
3. No public script reads the `dyadmin::` namespace, **EXCEPT the one
   pinned read-only reader** — `js/dashboard.js` `archiveReadRpc()`
   (S-FEED-3) — which never displays and never transmits the URL; it
   uses it to build a getLogs provider and nothing else. **The pinned
   set may never grow.** (AMENDED by owner ruling 2026-09-23; see §2.1.)
   Every other public consumer — `store.js`, `wallet.js`, the Hall —
   has no business there and must never acquire it.
4. No repo file may contain a keyed provider URL.

Laws 3 and 4 are machine-enforced by the `consoleroad` suite; they fail
the build rather than rely on anyone remembering. `readRpcUrl` stays the
FIRST candidate the archive road tries, exactly as before.

### 2.1 — RULED 2026-09-23: law 3 amended (was an open collision)

As first drafted, law 3 named `dashboard.js` as forbidden. `dashboard.js` already reads
`dyadmin::config.readRpcUrl` ON PURPOSE, and says so:
`archiveReadRpc()` (S-FEED-3) exists precisely so the owner's single
paste in the console also extends the BUYER dashboard's getLogs reach,
with no RPC field shown to buyers. The read is one-way and read-only —
the URL is used to build a getLogs provider and is never rendered,
logged, or sent anywhere.

The drafted law and the shipped design therefore contradicted each
other. This rung did NOT silently resolve it in either direction: it
pinned the one existing reader by name, surfaced the collision, and
held for a ruling.

**OWNER RULING, 2026-09-23 — option (b): the law is AMENDED.** A
READ-ONLY cross-read by the dashboard's getLogs road alone is
permitted. It never displays the URL and never transmits it. The write
path, the display, and every other namespace consumer stay forbidden,
and **the pinned set may never grow** — it is exactly
`["js/dashboard.js"]`.

The alternative was rejected on its consequence: deleting the
cross-read would drop the buyer dashboard back to drpc + publicnode —
straight into the 101-block cap — turning the public feed's reach into
a fresh problem rather than a solved one.

Enforcement is not a matter of memory: the `consoleroad` suite fails
the build the moment a second reader appears.

=====================================================
## 3. WHAT THE FIX DOES (GATE-FIX-1, owner-ruled 2026-09-23)
=====================================================
- **The probe asks one question.** Depth only, one block at the deploy
  block. A width complaint can no longer disqualify an endpoint that
  holds the history, because a 1-block range cannot be too wide.
- **The width self-tunes.** The Configuration panel sets a STARTING
  span; a range-class rejection halves it (floor 50), re-reads the same
  range in halves so the caller still gets its events, and remembers the
  discovered width per endpoint for the session. drpc free settles at 78
  after seven halvings; a keyed endpoint keeps the wide start.
- **TORANA checkpoints, grow-only.** High-water block AND the running
  per-buyer totals persist together in `dyadmin::scan::`, resuming at
  `scannedTo + 1`, persisting after each chunk, never bookmarking inside
  `HEAD_BUFFER` (128) of the head, never moving backwards. A deadline is
  now a pause, not a loss.
- **The console carries the truth.** The three-way funnel still shows
  the owner one plain sentence; `console.error` now records which class
  actually fired and the underlying error object.
- **The deadline scales** with the work planned, floored at the historic
  75s and ceiled at 600s so a tab is never hostage.

=====================================================
## 4. WHAT IS NOT FIXED HERE
=====================================================
- **The public site's first-visit break — queued as GATE-FIX-2.** A
  returning visitor is fine: `wallet.js` checkpoints, so it scans only
  the recent delta and publicnode serves that. A FIRST-time visitor has
  no checkpoint, starts at the deploy block, meets publicnode's pruning,
  fails over to drpc, and is refused for width. GATE-FIX-2 begins with
  STEP-0 measuring the baked-checkpoint idea: ship a scan snapshot in
  the deploy so a first visit only scans the delta.
- **Checkpoint adoption for the other three console panels.** They
  inherit the probe and the self-tuning width this rung; their own
  checkpoints are follow-up.
- **PROCESS CLAIM's precomputed boundaries.** That loop fixes its chunk
  edges before any request, so it cannot re-cut them mid-scan. It is
  still correct — a too-wide piece is split in flight and returns the
  same events — but it issues the split work every run until a sibling
  panel has taught the session the endpoint's real width.

=====================================================
## 5. THE FIX MEASURED AGAINST LIVE drpc FREE (2026-09-23)
=====================================================
A dry FIND ELIGIBLE, read-only, driving the real road against the real
endpoint (not a fixture), 60-second budget:

    PROBE   -> https://polygon.drpc.org  accepted in ~0.5s, no fall-back
               (this is the exact call the old 128-block probe failed)
    SPAN    -> self-tuned 9999 -> 78 blocks (under the measured 101 cap)
    SCAN    -> 108 chunks in 60s
    BANKED  -> scannedTo 92058566 · 8,424 blocks checkpointed
    HEAD BUFFER respected · 0 errors

So on drpc free the road WORKS and RESUMES, but the full 2.24M-block
backfill runs into hours at 78 blocks a call. That is the expected
state: the backfill is waiting for the owner's keyed endpoint, and the
checkpoint means every run keeps the ground it took.

Three defects were found by this dry run that the fixtures had missed —
all three now carry their own checks in the `consoleroad` suite:

  1. the remembered width raced to the FLOOR (50) instead of settling at
     the endpoint's real cap, because every refusal halved the CURRENT
     memory and one wide read is refused at many levels of the split
     beneath it. It now narrows relative to the width actually REFUSED;
  2. the split re-descended on every branch, spending 295 reads on one
     9999-block chunk. Once a width is learned the range is now WALKED
     in known-good pieces (~135 reads, and no doomed re-attempt);
  3. nothing was ever checkpointed, because the unit that gets banked is
     the outer CHUNK and the first one took the whole budget to finish.
     The width is now learned UP FRONT (a short descent of fast
     refusals), so chunk 1 is right-sized and banks on its own.

The lesson worth keeping: a fixture proves the logic, a live dry run
proves the SHAPE. Neither substitutes for the other.
