# STORE-TRACK-1 — influencer attribution on the store (2026-09-25)

## The rulings, verbatim

> "Go." on STEP-0 — option B; NO transaction hash and NO wallet address ever leave the page (zero-PII law,
> admin.html:202 stands); vendor = Plausible (cookieless; domain as a config value, script from plausible.io);
> the cache-stamp guard (I1/I2) extends to store.html/js/store.js. Campaign default: torana_oct26.

## What was built

**Two independent numbers, one question.** The tag says how many people followed a link, clicked buy and reached a
confirmed purchase; the console says how many bundles the chain actually recorded in the same window. Neither is
allowed to name a person.

### The tag (client side)
- `config.js` — `analytics: { domain, enabled, src }`. The only place the vendor is named. `enabled:false` injects
  nothing and leaves `window.plausible` undefined; the store buys identically either way.
- `js/store.js` — the tracking module: first-paint capture of `utm_source` / `utm_medium` / `utm_campaign` into
  **sessionStorage** (`dystore::utm`), a runtime-injected vendor script (the `js/wallet.js:56-58` ethers pattern),
  and one `track()` helper that builds every payload.
- Three events: `store_view` (once per load), `bundle_buy_click` (the buy control), `bundle_purchased` (only after
  the bounded wait resolves **confirmed** — never on `slow:true`, never on the receiver-refusal path).
- Payload: the three utm values plus the chosen pay asset (`usdc` / `usdt`). `track()` drops any value shaped like
  an address or a hash before it reaches the wire, so no call site can smuggle one past the law.
- `store.html` mounts it beside the existing store mounts; `js/store.js` stamp `s13 → s14`.

### The count (chain side)
- `admin.html` — panel "Bundle sales — on-chain count", with a UTC from/to date window; `js/admin.js` stamp
  `s37 → s38`.
- `js/admin.js` — `scanBundledWindow` reads the PlayStore's **`Bundled`** logs (not the sale's `Purchased`: a
  different contract and a different question) through the existing archive machinery — `discoverSpan` →
  `readRangeAdaptive` → a chunked walk with a checkpoint after each chunk under `dyadmin::scan::`, `HEAD_BUFFER`
  honoured. The buyer field is read and dropped; what the panel shows is a count and a DYC total.
- **Dates → blocks:** Polygon block times drift, so a date cannot be divided into a block number. The mapping is a
  binary search over block timestamps (`provider.getBlock(n).timestamp`, monotonic by consensus): `from` resolves
  to the first block at or after `00:00:00Z`, `to` to the last at or before `23:59:59Z` — about log2(span) block
  reads, each cached for the session.
- `config.js` gains `playStoreDeployBlock: 93676726` (it was only a comment beside the address), the scan's floor.

## Zero-PII, stated
No wallet address and no transaction hash leaves the page, and none is written to storage. The tag payloads carry
campaign tags and an asset name; the console's checkpoint carries `{ scannedTo, count, dyc }`. Checks assert both:
every captured analytics call is scanned for `0x`-shaped values, and the checkpoint's own bytes are scanned too.

## Checks
- `tests/suites/consoleroad.js` 82 → 94: **I3/I4** extend the bytes-not-tasks stamp law to `store.html`, and
  **BS1–BS10** cover the panel (right event, machinery reused, checkpoint shape, the date→block search and its
  monotonicity, the window, the count, and that no address can appear in the panel or its storage).
- `tests/suites/bundle.js` 73 → 95: the tag driven through the real `store.js` on real contracts — capture and
  inheritance, replacement between campaigns, a fresh visit inheriting nothing, both money-path events, the
  slow-purchase silence, the receiver refusal, zero-PII, the tag off, and a throwing tag that cannot break a buy.
  The vendor is Plausible's **per-site snippet** (`pa-<id>.js` + queue shim + `init()`), not the classic
  `data-domain` tag: the site's domain is baked into the script and applied last over any init options, so
  there is no attribute to set and nothing on the page can change which site is reported to. The custom-event
  contract was verified against that script rather than from memory — it reads `props` off the second
  argument (`m && m.props && (L.p = m.props)`), which is the shape the page already used, so no call changed.
  One gain: the shim queues calls made before the script lands and the script replays them, so `store_view`
  is no longer lost to the load race.
- Site suite 659 → 693 across 19 suites; `copyproof` unchanged at 108 (no ruled copy was touched).

## A note for the next person
`anvil_setCode` is chain-wide and the bundle suite shares one anvil per run; the tag's receiver-refusal case puts
the wallet back and asserts it, the same tripwire P2 already carried. The suite's deployer also runs near the end
of its default balance after a dozen cases (the page's fee floors make each deployment cost real ETH), so this
section tops both harness accounts up once — a harness fact, not a page behaviour.
