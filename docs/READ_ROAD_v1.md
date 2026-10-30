# THE READ ROAD — v1 (RPC-CLEANUP-1)

Owner rulings, 2026-10-30. The authority for the site's read endpoint and for the sentences a page shows when it cannot read.

## 1. One road

Every site read — the quick reads and the history scans alike — rides our own read proxy, `https://rpc.divyayuddha.games`
(dy-rpc on Render, forwarding to a keyed provider server-side). No free public RPC (publicnode, drpc, Tenderly's gateway,
1rpc and the like) is used for any site read, and the dashboard no longer reads through the connected wallet as a last
resort. If the proxy is down or refuses, the page says so plainly and offers **Try again**; the only backup is
server-side (dy-rpc's optional `UPSTREAM_RPC_URL_2`, unset until the owner adds a second paid provider).

`config.js` `rpcUrls` — the network MetaMask is offered when it adds Polygon, the wallet's own road for sends — is
unchanged (ruling C). Signing and sending are untouched.

History scans are one wide call: dy-rpc serves an addressed `eth_getLogs` up to 10,000,000 blocks (`MAX_LOG_SPAN`, ruling E),
allow-listed contracts only, never an address-less scan. The owner console's history panels use the owner's Read RPC URL
override if one is set in that browser, otherwise the proxy — so Torana claims and the other panels finish in one press
in any browser.

## 2. The failure sentences (approved word for word)

Each is shown with a **Try again** button that re-attempts that read — never a page reload.

| Page | Sentence |
|---|---|
| Dashboard (cards and feed) | We couldn't load this right now — try again. |
| Store, bundle tile (and the card grid) | We couldn't load the store right now — try again. |
| Card market | We couldn't load the market right now — try again. |
| Treasury (your cards) | We couldn't load your cards right now — try again. |
| Report | We couldn't load these figures right now — try again. |
| Hall, staked tiers | We couldn't read your balance right now — try again. |
| Torana gate (rite, store) | We couldn't check your Torana right now — try again. |
| Owner console (Torana claims) | The site's read proxy is busy or unreachable — try again in a moment. |

The button's label: **Try again**. (In the Hall the whole tier row is already the button that re-reads the balance, so
"Try again" is its label there, not a second button inside it.)

### The owner console's other history lines (approved)

- …using the site's read proxy instead. A paid tier on your provider lifts this.
- The site's read proxy is busy or unreachable — retry in a minute, or set a dedicated Read RPC URL in Configuration.
- The history couldn't be read right now — retry in a minute.

## 3. Not covered by this ruling (unchanged, flagged for a future ruling)

Faces that still carry their earlier wording: the market's whole-load failure ("The market could not be read" / "The
chain is busy or unreachable — nothing was bought or changed. Refresh to retry."), the Treasury's
listings panel and Access mark, the store tile's weekly-headroom line, the rite's DYC balance line, and the Hall's own
entry gate ("Couldn't check your Torana just now"). (The store grid's whole-load failure is now the ruled store line — §4.)

## 4. The store's reads (STORE-READS-1, owner rulings 2026-10-30)

A store visit reads the chain through **one call** to Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`,
`aggregate3`): the card grid (every live card's price and stock, the sale's flags) in one, the bundle tile in one, and a
connected wallet's own figures in one. Our proxy serves `aggregate3` only when every inner call targets one of our
contracts. Budget: a wallet-less visit **≤ 3 chain calls in ≤ 3 HTTP requests**; a connected visit **≤ 6**. A wallet
connect re-reads only that wallet's figures — never the grid. If the one call fails, the page says *We couldn't load the
store right now — try again.* and never falls back to single per-card calls.

Every purchase — a card for DYC, a card for USD, the bundle and the top-up — starts with a **fresh** read of its price and
stock. If the price moved since the page showed it, the purchase stops before anything is signed and the tile shows the
new price with the ruled sentence:

| When | Sentence |
|---|---|
| The price changed between viewing and buying | The price just changed. Check the new price and try again. |
| The card sold out between viewing and buying | This card is sold out. *(unchanged)* |
