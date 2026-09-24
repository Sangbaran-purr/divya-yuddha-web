# The Hall tells the truth about stakes — MP-FIX-3A (2026-09-24)

A player holding 500+ liquid DYC was refused a staked seat with **"insufficient DYC for this stake"**. They were
not short of DYC. This is the record of what was actually wrong, the owner's ruling, and what shipped.

**Owner ruling (2026-09-24):** *"Go."* on all five STEP-0 options for Part A.

---

## 1 · The two lies, measured

The Hall had **two** ways to tell a player they were poor, and neither of them required it to be true.

### M2 — the ceremony message (`mp/hall.js`, the reported sentence)

```js
if (/insufficient/i.test(m)) return "insufficient DYC for this stake";
```

One regex on the **word** "insufficient". Run against the real error shapes, lifted from the shipped function:

| the error | what it means | what the player was told |
|---|---|---|
| ethers 6.17 `INSUFFICIENT_FUNDS` — *"insufficient funds for intrinsic transaction cost"* | **no POL for gas** | "insufficient DYC for this stake" |
| a node's raw `-32000` — *"insufficient funds for gas \* price + value"* | **no POL for gas** | "insufficient DYC for this stake" |
| MetaMask — *"Insufficient funds for gas"* | **no POL for gas** | "insufficient DYC for this stake" |
| a wallet on another network with no native balance | **wrong chain** | "insufficient DYC for this stake" |
| OZ 5.6.1 `ERC20InsufficientBalance` | **a real DYC shortage** | *"execution reverted (unknown custom error)"* |

**The one cause the sentence named was the one cause that could not produce it.** DYC is OpenZeppelin **5.6.1**, so a
genuine shortage reverts with a *custom error*, which carries no such word and which the Hall's ABI could not decode.

**The likeliest shape of the refused wallet:** the site's own **$20 bundle pays out 500 DYC and no POL**
(`config.js`, `playStore`). A buyer who has never held POL has exactly 500 DYC and nothing to pay gas with — and
`js/dashboard.js:727` already words that case correctly. **Only the Hall mislabelled it.**

**The Hall also never checked the wallet's chain.** `js/wallet.js` exports `ensureChain()`; `js/dashboard.js` and
`js/admin.js` both call it; `mp/hall.js` called it **zero** times.

### M1 — the tier rows

`readLiquid`'s catch set `liquid = null`, and `affordable()` read `null` as false — so an unreadable balance
rendered as an empty wallet and **disabled the row**. Reproduced on the live origin with a throwaway address:

| | header | tier rows |
|---|---|---|
| wallet genuinely holds 0 DYC | `0 DYC` | `insufficient liquid DYC`, disabled |
| read endpoint unreachable (balance **unknown**) | `—` | **identical** |

The header obeyed the busy-sentinel law. The rows did not. And the read road had **one endpoint and no retry**
(`chain.readRpcUrls` = a single publicnode url).

**Ruled out by measurement:** the token address (`0x10c29BC0…` ✓), the chain (`eth_chainId` = `0x89` ✓), the
decimals (on-chain `decimals()` = 18, matching the Hall's `DEC = 1e18` ✓), the figure read (escrow
`StakeSource.LIQUID` pulls the same `balanceOf` the header shows ✓), and the tier math (10 DYC = `10e18`,
50 DYC = `50e18`; 500 DYC clears both ✓).

## 2 · What shipped

1. **One sentence per truth, matched on error SHAPE.** `isGasShort()` walks the wrapper chain (`e.info.error`,
   `e.error`) for ethers' `INSUFFICIENT_FUNDS` code or the words *insufficient **funds***; a decoded revert is read
   from `e.revert.{name,args}`. An OZ5 ERC20 revert never says "funds", decoded or not, so the two cannot meet.
   - no POL → *"You need a little POL for the network fee — this table costs ~0.07 POL to sit."*
   - a real DYC shortage → *"Not enough DYC for this stake — you hold 5, the table needs 10 DYC."* (the wallet's
     own numbers, taken from the error's own args)
   - an allowance that came up short → **its own** sentence. Calling that a DYC shortage would repeat the fault.
   - everything else passes through **uncollapsed**.
2. **The ABI learned the errors it was already being told** — the six OZ5 `ERC20*` errors on `DYC_FULL_ABI`, and
   the escrow's own seven on `ESC_ABI`, so its refusals (`BadStake`, `NotOpen`, …) read as themselves.
3. **The chain guard**, in `signerRoad()` — the one door every ceremony passes through, beside the cross-account
   guard, *before* the signer is asked for anything. It prompts `DYWallet.ensureChain()` and refuses in plain words
   if the wallet stays put. An **unreadable** network is not a refusal.
4. **The read road fails over** — the Hall walks its endpoints with one ~400 ms backoff before surrendering to the
   sentinel, and records *why* in `liquidRead` (`ok` / `failed`). An unread balance now says
   *"Couldn't read your balance — tap to retry"*, the row **stays actionable**, and the tap re-reads.
   Only a balance actually read and actually short says "insufficient liquid DYC".
5. **The pre-flight line** in every staked sheet: *"Liquid DYC: 500 DYC · network fee: ~0.069 POL"*, before the act.
   Either number may be unknown, and an unknown one draws **—** — never a figure nobody read.

**The fee number:** a seat is two casts (approve ~60k + lock ~200k gas). The price comes from the **read** road, not
from the failing call — a wallet that cannot pay for gas is exactly the wallet whose `estimateGas` throws. At the
265.8 gwei measured on 2026-09-24 that is **≈0.069 POL** to sit.

## 3 · A scope note, flagged rather than buried

The ruling's item 4 says *"`readRpcUrls` gains a second entry"* — that array lives in `config.js`, which the ruling's
own scope line excludes (*"mp/hall.js only"*). Editing `config.js` would also drag a `?v=` stamp bump through every
page that loads it, or the bytes-not-tasks guards go red.

**So the failover was built in `mp/hall.js`:** `readRpcUrls()` reads `CFG.chain.readRpcUrls` and appends the Hall's
own fallback (`https://polygon.drpc.org` — measured 2026-09-24: it answers `balanceOf` and carries the CORS header
for this origin; GATE-FIX-1's drpc cap is a **getLogs width** cap and does not touch `eth_call`). The site-wide read
road is untouched — `js/wallet.js` and this file both still take `[0]` when they want one url, and a
`dyhall::readRpcUrl` override stays **sole** so an anvil run never falls through to mainnet.

The one-line `config.js` change remains available if the owner would rather it live there; it is provably inert for
existing consumers, since `readRpcUrls` is read as `[0]` in both places that read it at all.

## 4 · What the chain guard found in the harness

Adding the guard turned **ten suites red at once** — every one that drives a real ceremony, all with
*"timed out waiting for…"*. The guard was not wrong; it had found a gap in the test harness.

`tests/lib.js`'s **store** page declares the harness's chain to the page it boots
(`w.DY_CONFIG.chain.id = chainId`, *"the harness's chain, declared not faked"*). Its **Hall** page never did. So in
every Hall suite the page believed it was on Polygon (137) while its wallet shim forwarded `eth_chainId` to anvil's
own id — a page whose config and whose wallet disagreed, and nothing had ever looked.

The fix is the store harness's own line, applied to the Hall harness. The guard is untouched, and the staked suites
now exercise it truthfully: the wallet's chain equals the declared chain, so nothing is refused. Weakening the
guard to suit the harness was the other option and would have been the wrong way round.

**Scope note:** this put `tests/lib.js` in the diff, which the ruling's scope line did not list. It is test
infrastructure, and the alternative was a hole in shipped code.
