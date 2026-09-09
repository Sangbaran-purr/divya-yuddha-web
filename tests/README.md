# tests/ — the Hall's guard

The money roads in `mp/` are proven here. Every suite drives the **real** `mp/hall.js` and
`mp/matchclient.js` in jsdom, against the **real** match server booted in-process, against a **real**
`StakeEscrow` deployed on a throwaway anvil chain. Nothing is mocked except the browser wallet.

## Run it

```
cd tests && npm install     # once — jsdom/ws/ethers, gitignored
node tests/run.js           # from the repo root: every suite, one line each, a measured total
node tests/run.js account   # one suite (or several by name)
```

Exit code is non-zero if any suite is red. Each suite gets its **own fresh anvil** on its own port
(~110ms), so no suite can colour another.

## What it needs (and what happens when it is missing)

The suite boots the match server, whose source lives in the **sibling web3 repo**. Four things must exist:

| Needed | Where |
|---|---|
| the web3 checkout | `$DY_WEB3`, default `../divya-yuddha-web3` |
| the match-server source | `services/match-server/src/` |
| the match-server's own `node_modules` | `npm install` in `services/match-server` |
| the forge artifacts (`StakeEscrow`, `MockDYC`) | `forge build` in `contracts/` |

Plus `anvil` on `PATH` (foundry).

**A missing dependency FAILS LOUD** — every miss is named with the path it was expected at, and the
runner exits non-zero. A guard that passes emptily is worse than no guard. `--allow-skip` downgrades
this to a loud skip that says *NOTHING WAS PROVEN*; never use it in CI.

## What each suite guards

| Suite | Checks | Guards |
|---|---|---|
| `copyproof` (in `mp/`) | 46 | every §11 ruled money line: doc ↔ code, and the amendments that ruled them |
| `p4` | 7 | auth survives either ordering; `send()` reports delivery honestly |
| `p8rig` | 7 | the frozen rig (`mp/wire.html`, `mpa3`) still works on the shared `matchclient.js` |
| `p7dom` | 4 | the 8d affordance line is byte-identical doc ↔ code ↔ rendered DOM |
| `p1` | 18 | S-HALL-L3-FIX-1: a lock confirmed but the server never told — the record survives, the affordance renders, FINISH OPENING completes it |
| `p2356` | 23 | the reload road, the ack-only clear, the dead overwrite, the cancel refund |
| `friendlookup` | 21 | the friend code rides the server `{lookup}`, in both withholding-flag states |
| `chrome` | 25 | sheet self-dismiss, live floor across the battle, header re-read on money moves, human-act reconnect, seats-line honesty |
| `account` | 43 | the Hall follows the wallet: re-key, no cross-signing, records hidden-not-deleted, click-gated sign-in |

## The law

**A change to `mp/` comes with its suite.** These proofs exist because five separate money defects
reached production first — a stranded stake, a ghost table, a frozen floor, a wallet poked in an idle
tab, an identity that outlived its account. Each is now a red line here if it returns.

## Notes

- `tests/package.json` is **test-scoped only**. It does not make the site a built project: the site is
  static files served whole by GitHub Pages, and nothing in `tests/` is referenced by any page.
- `fixtures/matchclient_OLD.js` is a **NEGATIVE-CONTROL FIXTURE**, frozen pre-FIX-1. It is never a
  source of truth — `fixtures/neg.js` uses it to prove the old auth race genuinely never authenticated.
- `fixtures/g3.js`, `g3b.js`, `g4.js`, `g5.js` are the S-HALL-GHOST-TABLE-1 diagnostics: `g3` shows the
  server's table lifecycle is clean, `g3b` manufactures the ghost, `g4` shows CANCEL on a ghost is safe
  but useless, `g5` shows closing the tab clears it. Kept as the record of how that bug was found.
- The runner sets `process.exitCode` and never calls `process.exit()`, so a leaked timer would hang it
  rather than be masked — the no-leak law from W3-KEEPALIVE-1, applied to the guard itself.
