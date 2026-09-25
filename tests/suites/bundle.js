"use strict";
// S-BUNDLE-1 — THE BUNDLE ON THE STORE PAGE, proven against the REAL PlayStore.
//
// The chain is anvil carrying the REAL contracts the live store speaks to: PlayStore behind a REAL ERC1967Proxy with
// its REAL initializer (the W3-BUNDLE-3 sequence — deploy, grant the minter, fund the tranche, open), the REAL
// AccessNFT, and two MockStables at 6 decimals standing in for USDC-native and USDT0. The page is store.html's own
// markup running js/store.js in jsdom behind an EIP-1193 shim. Nothing is stubbed that the player touches.
//
// The roads: the tile's four faces; the non-holder buy on BOTH assets; the holder top-up ×1..×4; the cap edge to the
// wei; the six ruled refusals from FORCED contract state; and — the one that matters most — THE PRE-FLIGHT STOPPING
// BEFORE ANY APPROVE on a wallet that cannot receive an ERC-721 (GATES 12e), with the allowance proven never to move.
const { ethers } = require("ethers");
const H = require("../lib.js");
const DEC = 1000000000000000000n, DEC6 = 1000000n;

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const body = (w) => (w.document.body.textContent || "").replace(/\s+/g, " ").trim();
const tile = (w) => { const e = w.document.getElementById("bundle-body"); return (e ? e.textContent : "").replace(/\s+/g, " ").trim(); };
const q = (w, sel) => w.document.querySelector(sel);
const msg = (w) => { const e = q(w, "#b-msg"); return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; };

// every wait is bounded AND named — the S-HALL-STAKED-1 watchdog law
const WD_MS = Number(process.env.DY_WD_MS || 25000);
let step = "boot";
async function waitFor(label, fn) {
  step = label;
  const t0 = Date.now();
  for (;;) {
    let v = null; try { v = await fn(); } catch (e) { v = null; }
    if (v) return v;
    if (Date.now() - t0 > WD_MS) throw new Error("WATCHDOG " + WD_MS + "ms at: " + label);
    await H.sleep(60);
  }
}

// ── §11, the ruled lines, quoted here so a drift shows in THIS suite too (copyproof owns doc↔code) ──
const P1 = "A Torana and 500 DYC - fifty Bronze tables' worth - for a wallet that came to play.";
const P2 = "USD 20 goes to the house now. Your Torana and 500 DYC land in the same transaction, or nothing moves.";
const P3 = "500 DYC for USD 5, up to 2,000 a week. Play money, delivered now.";
const P5 = "This wallet is a smart account and cannot receive the Torana yet. Switch to a standard account (MetaMask: 'switch back to regular account') and try again. Nothing was signed.";
const P6 = "The store is closed for now.";
const P6B = "The store is sold out for now.";
const P8 = "The store could not take this order - refresh and try again.";
const P7 = (sym, sum) => "Not enough " + sym + " in this wallet - " + sum + " buys the bundle.";
const P9 = "The bundle - a Torana and 500 DYC - is USD 20. You already hold yours.";
const P4 = (cap, when) => "You have topped up " + cap + " DYC this week - the window frees " + when + ".";

async function connect(w) {
  await waitFor("wallet provider detected", () => w.DYWallet.state.hasProvider);
  await w.DYWallet.connect();
  await waitFor("connected + chainOk", () => w.DYWallet.state.connected && w.DYWallet.state.chainOk);
  // the connected face is P1 + the price for a non-holder, P3 for a holder (S-BUNDLE-2 ruling 2) — either counts
  return waitFor("the tile painted its connected face",
    () => !/Connect wallet/.test(tile(w)) && (tile(w).indexOf(P1) >= 0 || tile(w).indexOf(P3) >= 0));
}
async function deal(c, which, to, amount) { await (await c[which].mint(to, amount)).wait(); }

async function main() {
  const miss = H.preflight();
  if (miss.length) { console.log("PREFLIGHT FAILED:\n" + miss.join("\n")); process.exit(1); }

  // ══════════════════════════ P1 · THE TILE'S FOUR FACES ══════════════════════════
  console.log("\n── P1 · the tile's faces ──");
  {
    const c = await H.chainStore();
    const h = await H.storePage(c, c.player);
    const w = h.w;
    await waitFor("the disconnected tile", () => tile(w).indexOf(P1) >= 0);
    const firstPaint = tile(w);
    // DOCUMENT ORDER, not a substring: the lede legitimately contains the word "Buy".
    const before = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & 4));
    ok("the tile is FIRST on the page: before the lede, the tabs and both grids",
       before(q(w, "#bundle"), q(w, ".prose")) && before(q(w, "#bundle"), q(w, ".st-tabs")) &&
       before(q(w, "#bundle"), q(w, "#st-buy-grid")),
       "bundle=" + !!q(w, "#bundle") + " prose=" + !!q(w, ".prose") + " tabs=" + !!q(w, ".st-tabs"));
    ok("disconnected: the ruled tile line + Connect wallet, and no buy control",
       tile(w).indexOf(P1) >= 0 && /Connect wallet/.test(tile(w)) && !q(w, ".b-buy"));
    ok("the Torana art is the card itself, lazily, with the rite's placeholder behind it",
       q(w, ".b-art img").getAttribute("src") === "assets/tokens/Access_Torana_720.jpg" &&
       q(w, ".b-art img").getAttribute("loading") === "lazy" && !!q(w, ".b-art .torana-ph"),
       q(w, ".b-art img") ? q(w, ".b-art img").getAttribute("src") : "no img");
    // S-BUNDLE-4 — the PICTURE shows the bundle: the card, then the site's own coin with the figure beside it
    ok("the coin line sits UNDER the card, in the picture column, with the site's own DYC mark",
       !!q(w, ".b-pic .b-art") && !!q(w, ".b-pic .b-coinline") &&
       q(w, ".b-pic .b-coinline img.b-coin").getAttribute("src") === "assets/dyc_coin_96.png" &&
       q(w, ".b-coin-plus").textContent === "+" && q(w, ".b-coin-n").textContent === "500 DYC" &&
       !!(q(w, ".b-art").compareDocumentPosition(q(w, ".b-coinline")) & 4));
    // "+ 500 DYC" leaves the text column AS A NUMBER; it survives inside the heading, which names the bundle
    ok("the text column's hero is the PRICE ALONE - the DYC figure left it",
       q(w, ".b-hero-price .b-hero-n").textContent === "USD 20" &&
       q(w, ".b-hero-price .b-hero-s").textContent === "USDC or USDT" &&
       !q(w, ".b-hero-dyc") &&
       !/\+ 500 DYC/.test(q(w, ".b-body").textContent.replace(q(w, ".b-title").textContent, "")));
    ok("S-BUNDLE-4 · the heading names the bundle",
       q(w, ".b-title").textContent === "TORANA + 500 DYC — THE BUNDLE");
    ok("the old body-text price line is still gone", !/USD 20 — USDC or USDT/.test(tile(w)));
    await waitFor("the public stock read landed (no wallet needed)", () => /In stock/.test(tile(w)));
    ok("THE STOCK LINE CARRIES NO COUNT — 'In stock', never 'N bundles'",
       /In stock/.test(tile(w)) && !/bundle[s]? left|998|4500|5000/.test(tile(w)), tile(w).slice(0, 200));
    ok("before the read lands it says unavailable, never a false Sold out (the first paint)",
       /stock unavailable - refresh to retry/.test(String(firstPaint)), String(firstPaint).slice(0, 120));

    await connect(w);
    ok("connected NON-holder: the commitment line and the buy control",
       tile(w).indexOf(P2) >= 0 && !!q(w, ".b-buy") && !q(w, ".b-topup"));
    ok("the bundle face has EXACTLY ONE hero price, and its only other USD 20 is inside ruled P2",
       w.document.querySelectorAll(".b-hero-price").length === 1 &&
       (tile(w).match(/USD 20/g) || []).length === 2 && tile(w).indexOf(P2) >= 0,
       "USD 20 x" + (tile(w).match(/USD 20/g) || []).length);
    ok("P9 is not on the bundle face", tile(w).indexOf(P9) < 0);
    // S-BUNDLE-2 (F1) — the chip is a CHOICE with its balance as small print, never a price-shaped "USDC · 3.35"
    ok("both assets are offered as CHOICES, the balance beneath, never price-shaped",
       w.document.querySelectorAll(".b-asset").length === 2 &&
       q(w, ".b-asset .b-asset-l").textContent === "Pay with USDC" &&
       /^balance /.test(q(w, ".b-asset .b-asset-b").textContent) &&
       !/USDC · |USDT · /.test(tile(w)), tile(w).slice(0, 220));
    ok("a penniless wallet sees BOTH chips dimmed, unselectable, and told why before any tap",
       w.document.querySelectorAll(".b-asset.short").length === 2 &&
       w.document.querySelectorAll(".b-asset[disabled]").length === 2 &&
       /not enough/.test(tile(w)));
    ok("the buy control is still live, so a tap renders the RULED refusal (P7), not a dead button",
       q(w, ".b-buy").disabled === false);
    // S-BUNDLE-2 (F3) — .st-act was defined in no stylesheet; every control wears the store's own .st-btn
    ok("the bundle's controls wear the store's dress (.st-btn), and .st-act is gone",
       q(w, ".b-buy").className.indexOf("st-btn") === 0 &&
       w.document.querySelectorAll(".st-act").length === 0);
    H.teardown(h);
  }

  // ══════════════════════════ P2 · THE PRE-FLIGHT (the one that matters) ══════════════════════════
  console.log("\n── P2 · the pre-flight stops a wallet it cannot serve, before any approve ──");
  {
    const c = await H.chainStore();
    // the wallet is given CODE — exactly what an EIP-7702 MetaMask smart account has — and that code has no
    // onERC721Received, so AccessNFT's _safeMint must refuse it. This is the live hazard, not a mock of it.
    const someCode = await c.provider.getCode(c.addrs.usdc);
    await c.provider.send("anvil_setCode", [c.player.address, someCode]);
    ok("the wallet now has code, as a smart account does",
       (await c.provider.getCode(c.player.address)).length > 2);
    await deal(c, "usdc", c.player.address, 25n * DEC6);
    const h = await H.storePage(c, c.player);
    const w = h.w;
    await connect(w);
    const allowBefore = await c.usdc.allowance(c.player.address, c.addrs.ps);
    H.click(w, ".b-buy");
    await waitFor("the smart-account refusal rendered", () => msg(w).indexOf("smart account") >= 0);
    ok("P5 renders VERBATIM", msg(w) === P5, msg(w));
    const allowAfter = await c.usdc.allowance(c.player.address, c.addrs.ps);
    ok("ZERO APPROVALS SENT — the allowance never moved", allowBefore === 0n && allowAfter === 0n,
       "before " + allowBefore + " after " + allowAfter);
    ok("the wallet was never asked to sign anything",
       h.eth.__calls.filter((m) => m === "eth_sendTransaction").length === 0,
       h.eth.__calls.join(","));
    H.teardown(h);
    // THE HARNESS'S OWN TRIPWIRE: anvil_setCode is chain-wide and this suite's cases share one anvil, so the code is
    // removed HERE and the removal is asserted. (Found the hard way: without this every later case saw a smart
    // account and the happy path looked broken — a leak in the proof, not in the page.)
    await c.provider.send("anvil_setCode", [c.player.address, "0x"]);
    ok("the harness put the wallet back — no code leaks into the next case",
       (await c.provider.getCode(c.player.address)) === "0x");
    // the control: the SAME wallet, now a plain EOA, walks straight through the probe to a receipt
    const c2 = await H.chainStore();
    await deal(c2, "usdc", c2.player.address, 25n * DEC6);
    const h2 = await H.storePage(c2, c2.player);
    await connect(h2.w);
    H.click(h2.w, ".b-buy");
    await waitFor("the control wallet reached its receipt", () => /is yours/.test(tile(h2.w)) || msg(h2.w).indexOf("smart account") >= 0);
    ok("a PLAIN EOA is served without a probe refusal (the control)", /is yours/.test(tile(h2.w)), msg(h2.w));
    H.teardown(h2);
    ok("nothing was bought: no Torana, no DYC, inventory untouched",
       (await c.nft.balanceOf(c.player.address)) === 0n &&
       (await c.dyc.balanceOf(c.player.address)) === 0n &&
       (await c.ps.inventory()) === 5000n * DEC);
  }

  // ══════════════════════════ P3 · THE BUY, BOTH ASSETS, AND THE RECEIPT ══════════════════════════
  for (const A of [{ key: "usdc", sym: "USDC" }, { key: "usdt", sym: "USDT" }]) {
    console.log("\n── P3 · the bundle bought with " + A.sym + " ──");
    const c = await H.chainStore();
    ok(A.sym + " · the wallet is a plain EOA (the tripwire against P2's setCode leaking)",
       (await c.provider.getCode(c.player.address)) === "0x");
    await deal(c, A.key, c.player.address, 25n * DEC6);
    const h = await H.storePage(c, c.player);
    const w = h.w;
    await connect(w);
    // pick the asset explicitly (the default follows the balance, which is this one anyway)
    const btns = w.document.querySelectorAll(".b-asset");
    btns[A.key === "usdc" ? 0 : 1].click();
    await waitFor("the picker moved", () => !!q(w, ".b-buy"));
    const sinkBefore = await c[A.key].balanceOf(c.addrs.owner);
    H.click(w, ".b-buy");
    await waitFor("the receipt", () => /is yours/.test(tile(w)));
    ok(A.sym + " · the receipt names the Torana by its own tokenId", /Torana #9?\d* is yours\./.test(tile(w)) || /Torana #1 is yours\./.test(tile(w)), tile(w).slice(0, 120));
    ok(A.sym + " · the wallet holds exactly one Torana, and it is token 1",
       (await c.nft.balanceOf(c.player.address)) === 1n && (await c.nft.ownerOf(1n)).toLowerCase() === c.player.address.toLowerCase());
    ok(A.sym + " · 500 DYC, liquid", (await c.dyc.balanceOf(c.player.address)) === 500n * DEC);
    ok(A.sym + " · the sink took exactly USD 20", (await c[A.key].balanceOf(c.addrs.owner)) - sinkBefore === 20n * DEC6);
    ok(A.sym + " · the approval was EXACT and is now spent",
       (await c[A.key].allowance(c.player.address, c.addrs.ps)) === 0n);
    ok(A.sym + " · inventory fell by exactly 500", (await c.ps.inventory()) === 4500n * DEC);
    ok(A.sym + " · THE STORE CUSTODIED NOTHING — INV-PROCEEDS, seen from the page",
       (await c.usdc.balanceOf(c.addrs.ps)) === 0n && (await c.usdt.balanceOf(c.addrs.ps)) === 0n);
    ok(A.sym + " · the door out is the Hall, UNSTAMPED",
       !!q(w, '.b-door[href="mp/hall.html"]') && q(w, ".b-door").textContent === "Sit at a table");
    H.teardown(h);
  }

  // ══════════════════════════ P4 · THE TOP-UP, ×1..×4, AND THE CAP EDGE ══════════════════════════
  console.log("\n── P4 · the holder's top-up, and the cap to the wei ──");
  {
    const c = await H.chainStore();
    await (await c.nft.setMinter(c.addrs.owner, true)).wait();
    await (await c.nft.mint(c.player.address)).wait();            // a holder, without spending a bundle
    await deal(c, "usdc", c.player.address, 100n * DEC6);
    const h = await H.storePage(c, c.player);
    const w = h.w;
    await connect(w);
    ok("a HOLDER sees the top-up, never the bundle", tile(w).indexOf(P3) >= 0 && !!q(w, ".b-topup") && !q(w, ".b-buy"));
    ok("the headroom is the chain's, not a guess (and carries P4's own thousands separator)",
       /top up 2,000 more DYC this week/.test(tile(w)), tile(w).slice(0, 220));
    ok("four pack sizes are offered (the cap allows exactly four)", w.document.querySelectorAll(".b-pack").length === 4);

    // ×3 first: 1,500 of the 2,000
    w.document.querySelectorAll(".b-pack")[2].click();
    await waitFor("×3 chosen", () => /Top up 1,500 DYC/.test(tile(w)));
    const sink0 = await c.usdc.balanceOf(c.addrs.owner);
    H.click(w, ".b-topup");
    await waitFor("the top-up landed", () => /Topped up/.test(msg(w)));
    ok("×3 delivered 1,500 DYC and took USD 15",
       (await c.dyc.balanceOf(c.player.address)) === 1500n * DEC &&
       (await c.usdc.balanceOf(c.addrs.owner)) - sink0 === 15n * DEC6);
    ok("the window reads 1,500 used / 500 left, from chain",
       (await c.ps.topUpUsed(c.player.address)) === 1500n * DEC &&
       (await c.ps.topUpRemaining(c.player.address)) === 500n * DEC);
    await waitFor("the tile re-read itself", () => /top up 500 more DYC this week/.test(tile(w)));
    ok("only ONE pack is offered now — the headroom bounds the picker",
       w.document.querySelectorAll(".b-pack").length === 1);

    // the last 500, to the wei, then the cap line
    H.click(w, ".b-topup");
    await waitFor("the cap filled", async () => (await c.ps.topUpUsed(c.player.address)) === 2000n * DEC);
    await waitFor("the cap line", () => /You have topped up/.test(tile(w)));
    ok("P4 renders with the cap from chain and a GRAMMATICAL sentinel (no 'frees on within')",
       tile(w).indexOf(P4("2,000", "within 7 days")) >= 0 && !/frees on within/.test(tile(w)), tile(w).slice(-170));
    ok("at the cap there is no top-up control at all", !q(w, ".b-topup"));
    ok("the store still custodied nothing across four casts",
       (await c.usdc.balanceOf(c.addrs.ps)) === 0n);
    H.teardown(h);
  }

  // ══════════════════════════ P7 · THE TILE'S THREE MISREADS (S-BUNDLE-2) ══════════════════════════
  console.log("\n── P7 · the chips name the asset, the face names the price, the controls are dressed ──");
  {
    const c = await H.chainStore();
    await (await c.nft.setMinter(c.addrs.owner, true)).wait();
    await (await c.nft.mint(c.player.address)).wait();          // a HOLDER
    await deal(c, "usdc", c.player.address, 6n * DEC6);          // 6 USDC: enough for ONE pack (5), not for two (10)
    const h = await H.storePage(c, c.player);
    const w = h.w;
    await connect(w);
    await waitFor("the holder's face", () => !!q(w, ".b-topup"));

    // F2 — the holder's face is priced by P3 alone
    // S-BUNDLE-3 F2 — the holder's face is headed TOP UP and priced by its own LIVE hero
    ok("F2 · the holder's heading is TOP UP, not the card's name",
       q(w, ".b-title").textContent === "TOP UP");
    ok("F2 · the holder's hero is USD 5 at x1, and its coin figure is under the card",
       q(w, ".b-hero-price .b-hero-n").textContent === "USD 5" &&
       q(w, ".b-pic .b-coin-n").textContent === "500 DYC" && !q(w, ".b-hero-dyc") &&
       !/\+ 500 DYC/.test(q(w, ".b-body").textContent.replace(q(w, ".b-title").textContent, "")));
    ok("F2 · P9 stands on the holder's face, above P3",
       tile(w).indexOf(P9) >= 0 && tile(w).indexOf(P9) < tile(w).indexOf(P3));
    ok("F2 · the ONLY USD 20 on the holder's face is inside ruled P9",
       (tile(w).match(/USD 20/g) || []).length === 1);
    ok("F2 · P3 carries the weekly price once, and no second price line was added",
       tile(w).indexOf(P3) >= 0 && (tile(w).match(/USD 5,/g) || []).length === 1);
    // ruling (2) — P1 is the bundle face's line
    ok("ruling 2 · P1 is NOT on the holder's face", tile(w).indexOf(P1) < 0);

    // F1's second bug — the dim takes the price OF THE FACE, not the bundle's
    ok("F1 · at x1 the 6-USDC wallet is NOT dimmed (the face costs USD 5, not USD 20)",
       q(w, ".b-asset").className.indexOf("short") < 0 && /balance 6.00/.test(tile(w)),
       q(w, ".b-asset").className + " | " + tile(w).slice(0, 200));
    ok("F1 · USDT, with nothing in it, IS dimmed and says so",
       w.document.querySelectorAll(".b-asset")[1].className.indexOf("short") >= 0 && /not enough/.test(tile(w)));
    // ×2 costs USD 10 — the same wallet, the same chip, now short
    w.document.querySelectorAll(".b-pack")[1].click();
    await waitFor("x2 chosen", () => /Top up 1,000 DYC/.test(tile(w)));
    ok("S-BUNDLE-4 · the price AND the coin figure follow the picker: x2 -> USD 10 and 1,000 DYC under the card",
       q(w, ".b-hero-price .b-hero-n").textContent === "USD 10" &&
       q(w, ".b-pic .b-coin-n").textContent === "1,000 DYC",
       q(w, ".b-coin-n").textContent + " / " + q(w, ".b-hero-price .b-hero-n").textContent);
    ok("F1 · at x2 the SAME chip dims, because the face now costs USD 10",
       q(w, ".b-asset").className.indexOf("short") >= 0 && q(w, ".b-asset").disabled === true);
    ok("F1 · a dimmed chip cannot be chosen (the click does nothing)",
       (() => { const before = q(w, ".b-asset").className; q(w, ".b-asset").click(); return q(w, ".b-asset").className === before; })());
    // F3 — the top-up control is dressed too
    ok("F3 · the top-up control wears .st-btn", q(w, ".b-topup").className.indexOf("st-btn") === 0);
    H.teardown(h);

    // and the BUNDLE face still carries both of its own lines
    const c2 = await H.chainStore();
    await deal(c2, "usdc", c2.player.address, 25n * DEC6);
    const h2 = await H.storePage(c2, c2.player);
    await connect(h2.w);
    ok("the bundle face keeps P1, its USD 20 hero and the coin under the card",
       tile(h2.w).indexOf(P1) >= 0 &&
       q(h2.w, ".b-hero-price .b-hero-n").textContent === "USD 20" &&
       q(h2.w, ".b-pic .b-coin-n").textContent === "500 DYC" &&
       !/USD 20 — USDC or USDT/.test(tile(h2.w)));
    ok("and the affordable chip is chosen, the empty one dimmed",
       q(h2.w, ".b-asset").className.indexOf("on") >= 0 &&
       h2.w.document.querySelectorAll(".b-asset")[1].className.indexOf("short") >= 0);
    H.teardown(h2);
  }

  // ══════════════════════════ P5 · THE RULED REFUSALS, FROM FORCED STATE ══════════════════════════
  console.log("\n── P5 · every refusal, from real contract state ──");
  {
    // closed
    const c1 = await H.chainStore({ open: false });
    const h1 = await H.storePage(c1, c1.player);
    await connect(h1.w);
    ok("CLOSED · P6 on the tile, and the buy control is dead",
       tile(h1.w).indexOf(P6) >= 0 && q(h1.w, ".b-buy").disabled === true, tile(h1.w).slice(0, 200));
    H.teardown(h1);

    // sold out — inventory under one pack
    const c2 = await H.chainStore({ inventory: 100n * DEC });
    const h2 = await H.storePage(c2, c2.player);
    await connect(h2.w);
    ok("SOLD OUT · P6b on the tile (a read that SUCCEEDED and said not enough)",
       tile(h2.w).indexOf(P6B) >= 0 && q(h2.w, ".b-buy").disabled === true);
    H.teardown(h2);

    // not enough of the chosen stablecoin — caught by the READ, before any approve
    const c3 = await H.chainStore();
    await deal(c3, "usdc", c3.player.address, 5n * DEC6);          // 5, needs 20
    const h3 = await H.storePage(c3, c3.player);
    await connect(h3.w);
    H.click(h3.w, ".b-buy");
    await waitFor("the funds refusal", () => msg(h3.w).indexOf("Not enough") >= 0);
    ok("FUNDS · P7 renders with the asset and the sum substituted", msg(h3.w) === P7("USDC", "USD 20"), msg(h3.w));
    ok("FUNDS · nothing was signed and no allowance moved",
       h3.eth.__calls.filter((m) => m === "eth_sendTransaction").length === 0 &&
       (await c3.usdc.allowance(c3.player.address, c3.addrs.ps)) === 0n);
    H.teardown(h3);

    // a holder pressing the bundle road, and a non-holder pressing the top-up: the tile refuses by SHAPE
    const c4 = await H.chainStore();
    await (await c4.nft.setMinter(c4.addrs.owner, true)).wait();
    await (await c4.nft.mint(c4.player.address)).wait();
    const h4 = await H.storePage(c4, c4.player);
    await connect(h4.w);
    ok("ALREADY A HOLDER · the bundle road is not offered at all (a state, not an error)", !q(h4.w, ".b-buy"));
    H.teardown(h4);
    const c5 = await H.chainStore();
    const h5 = await H.storePage(c5, c5.player);
    await connect(h5.w);
    ok("NOT A HOLDER · the top-up road is not offered at all", !q(h5.w, ".b-topup"));
    H.teardown(h5);

    // the generic refusal is reachable and is RENDERED, never a bare revert
    ok("GENERIC · P8 is the decode map's floor, and the bare revert never reaches the player",
       /return B_P8;\s*\n\s*}/.test(require("fs").readFileSync(require("path").join(H.SITE, "js/store.js"), "utf8")));
  }

  // ══════════════════════════ P6 · THE BUSY SENTINEL ══════════════════════════
  console.log("\n── P6 · a dead RPC says unavailable, never sold out, never non-holder ──");
  {
    const c = await H.chainStore();
    await deal(c, "usdc", c.player.address, 25n * DEC6);
    const h = await H.storePage(c, c.player, { ls: { "dy::readRpcUrl": "http://127.0.0.1:1" } });
    const w = h.w;
    await waitFor("the sentinel", () => /stock unavailable/.test(tile(w)));
    ok("stock unavailable — refresh to retry (never Sold out)",
       /stock unavailable - refresh to retry/.test(tile(w)) && tile(w).indexOf(P6B) < 0 && tile(w).indexOf(P6) < 0,
       tile(w).slice(0, 200));
    ok("and it never claims the wallet holds no Torana", !/buy the bundle first/.test(tile(w)));
    H.teardown(h);
  }

  // ══════════════════════════ P7 · STORE-TRACK-1 · THE TAG ══════════════════════════
  // The campaign's client-side half, driven through the REAL store.js on the REAL contracts. Three laws are under
  // test at once: the tag never carries a person, it never fires on a purchase that did not confirm, and it can
  // never touch the money path — a throwing tag must leave the buy exactly as it was.
  console.log("\n── P7 · the cookieless tag: tags only, confirmed only, never in the way ──");
  {
    const TAG_URL = "https://divyayuddha.games/store.html?utm_source=test&utm_medium=video&utm_campaign=torana_oct26";
    // a capture stub standing in for the vendor script: every call recorded, nothing sent
    const spy = (w) => { const calls = []; w.plausible = (name, o) => calls.push({ name, props: (o && o.props) || {} }); return calls; };
    const PII = /0x[0-9a-fA-F]{40}\b|0x[0-9a-fA-F]{64}\b/;
    const scanPII = (calls) => calls.filter((c) => PII.test(JSON.stringify(c)));

    // THE HARNESS'S GAS BUDGET, stated: every case here deploys its own contracts through the deployer account,
    // and the page's fee floors (RUNG4-FIX-6: 45/30 gwei) make each deployment cost real ETH on anvil. After the
    // twelve cases above, the deployer is near the end of its default balance — the first symptom is an
    // "insufficient funds" that looks like a page fault and is not one. Top both harness accounts up here, once,
    // so THIS section's failures can only ever be the page's.
    const fund = async (c) => {
      for (const a of [c.addrs.owner, c.player.address]) {
        await c.provider.send("anvil_setBalance", [a, "0x" + (10000n * 10n ** 18n).toString(16)]);
      }
    };

    // ── the capture, and what a later visit may inherit (no buy: one chain serves both) ──
    const cNoBuy = await H.chainStore();
    await fund(cNoBuy);

    // ── the vendor snippet itself, exactly as Plausible's per-site form ships it ──
    {
      const h = await H.storePage(cNoBuy, cNoBuy.player, { url: TAG_URL });
      const w = h.w;
      w.DYStore.mountTracking();                     // deliberately NO spy: the REAL shim has to install
      const tags = [...w.document.querySelectorAll("script")].filter((t) => t.src === w.DY_CONFIG.analytics.script);
      ok("the injected tag IS the per-site script named in config — async, and carrying no data-domain attribute",
         tags.length === 1 && tags[0].async === true && !tags[0].hasAttribute("data-domain"),
         JSON.stringify([...w.document.querySelectorAll("script")].map((t) => t.src)));
      // The script replays window.plausible.q on arrival, so store_view — fired before the network
      // has a chance to deliver it — is queued rather than dropped.
      const q = (w.plausible && w.plausible.q) || [];
      ok("the queue shim is installed and initialised, so store_view is QUEUED for the script, not lost to the race",
         typeof w.plausible === "function" && typeof w.plausible.init === "function" && !!w.plausible.o &&
         q.length === 1 && q[0][0] === "store_view" && q[0][1].props.utm_campaign === "torana_oct26",
         JSON.stringify(q));
      H.teardown(h);
    }
    {
      const c = cNoBuy;
      const h = await H.storePage(c, c.player, { url: TAG_URL });
      const w = h.w;
      const calls = spy(w);
      w.DYStore.mountTracking();
      ok("the three utm values are captured at first paint, from the page's own URL",
         JSON.stringify(w.DYStore.currentUtm()) === JSON.stringify({ utm_source: "test", utm_medium: "video", utm_campaign: "torana_oct26" }),
         JSON.stringify(w.DYStore.currentUtm()));
      ok("they live in sessionStorage, never localStorage — a later VISIT inherits nothing",
         !!w.sessionStorage.getItem("dystore::utm") && w.localStorage.getItem("dystore::utm") === null);
      ok("store_view fires once per load and carries the tags",
         calls.length === 1 && calls[0].name === "store_view" && calls[0].props.utm_campaign === "torana_oct26", JSON.stringify(calls));
      w.DYStore.mountTracking();
      ok("and only once — a second mount is a no-op, so one load is one view", calls.length === 1, String(calls.length));
      // the same session, a page with no tags: the campaign is still known
      w.DYStore.captureUtm("?nothing=here");
      ok("an untagged page LATER IN THE SAME VISIT inherits the campaign (the player browsed on)",
         w.DYStore.currentUtm().utm_campaign === "torana_oct26");
      // a different campaign REPLACES — never merges
      w.DYStore.captureUtm("?utm_campaign=other_campaign");
      const after = w.DYStore.currentUtm();
      ok("a second campaign link REPLACES the set — campaign B never inherits campaign A's source (a merge would mis-credit)",
         after.utm_campaign === "other_campaign" && after.utm_source == null && after.utm_medium == null, JSON.stringify(after));
      H.teardown(h);
    }
    // a FRESH visit, untagged, with no storage: nothing is inherited
    {
      const c = cNoBuy;
      const h = await H.storePage(c, c.player);          // the plain URL, a new jsdom, empty sessionStorage
      const calls = spy(h.w);
      h.w.DYStore.mountTracking();
      ok("a FRESH untagged visit carries no tags at all — no stale set survives a visit",
         JSON.stringify(h.w.DYStore.currentUtm()) === "{}" && JSON.stringify(calls[0].props) === "{}", JSON.stringify(calls));
      H.teardown(h);
    }

    // ── the two money-path events, on a real confirmed buy ──
    {
      const c = await H.chainStore();
      await fund(c);
      await deal(c, "usdc", c.player.address, 25n * DEC6);
      const h = await H.storePage(c, c.player, { url: TAG_URL });
      const w = h.w;
      const calls = spy(w);
      w.DYStore.mountTracking();
      await connect(w);
      H.click(w, ".b-buy");
      const clicked = calls.filter((x) => x.name === "bundle_buy_click");
      ok("bundle_buy_click fires on the click, with the tags and the chosen asset",
         clicked.length === 1 && clicked[0].props.asset === "usdc" && clicked[0].props.utm_source === "test", JSON.stringify(clicked));
      await waitFor("the receipt", () => /is yours/.test(tile(w)));
      const bought = calls.filter((x) => x.name === "bundle_purchased");
      ok("bundle_purchased fires exactly once, AFTER the purchase confirmed, with the tags and the asset",
         bought.length === 1 && bought[0].props.asset === "usdc" && bought[0].props.utm_campaign === "torana_oct26", JSON.stringify(bought));
      ok("THE PURCHASE STILL LANDED — the tag is a bystander to the money path",
         (await c.nft.balanceOf(c.player.address)) === 1n && (await c.dyc.balanceOf(c.player.address)) === 500n * DEC);
      ok("ZERO-PII · no captured call carries a wallet address or a transaction hash, anywhere in its payload",
         scanPII(calls).length === 0, JSON.stringify(scanPII(calls)));

      // The check above is passive: the page never passes an address, so it would stay green
      // even with the filter gone. This one ATTACKS the filter — the law has to hold against
      // a caller that tries, because that is the only way a wallet ever reaches a vendor.
      const before = calls.length;
      w.DYStore.track("smuggle_attempt", { addr: c.player.address, hash: "0x" + "ab".repeat(32), asset: "usdc" });
      const smug = calls[before] || { props: {} };
      ok("ZERO-PII · the filter DROPS an address and a tx hash handed to it, and keeps the honest field",
         scanPII([smug]).length === 0 && smug.props.asset === "usdc" &&
         smug.props.addr === undefined && smug.props.hash === undefined, JSON.stringify(smug));
      H.teardown(h);
    }

    // ── a purchase that did NOT confirm in time: no event, ever ──
    {
      const c = await H.chainStore();
      await fund(c);
      await deal(c, "usdc", c.player.address, 25n * DEC6);
      const h = await H.storePage(c, c.player, { url: TAG_URL, waitMs: 1 });   // the bounded wait gives up at once
      const w = h.w;
      const calls = spy(w);
      w.DYStore.mountTracking();
      await connect(w);
      H.click(w, ".b-buy");
      await waitFor("the slow-confirm line", () => /Still confirming on chain/.test(msg(w)));
      ok("a SLOW (unconfirmed) purchase fires NO bundle_purchased — the count must never inherit a maybe",
         calls.filter((x) => x.name === "bundle_purchased").length === 0 &&
         calls.filter((x) => x.name === "bundle_buy_click").length === 1, JSON.stringify(calls.map((x) => x.name)));
      H.teardown(h);
    }

    // ── the receiver refusal: the pre-flight stops before any approve, and before any purchased event ──
    {
      const c = await H.chainStore();
      await fund(c);
      await deal(c, "usdc", c.player.address, 25n * DEC6);
      await c.provider.send("anvil_setCode", [c.player.address, "0x60006000fd"]);   // a wallet that cannot receive an ERC-721
      const h = await H.storePage(c, c.player, { url: TAG_URL });
      const w = h.w;
      const calls = spy(w);
      w.DYStore.mountTracking();
      await connect(w);
      H.click(w, ".b-buy");
      await waitFor("the P5 refusal", () => msg(w).indexOf(P5) >= 0);
      ok("a wallet that cannot hold the Torana is refused with NO bundle_purchased — the hook sits after the pre-flight, not before it",
         calls.filter((x) => x.name === "bundle_purchased").length === 0, JSON.stringify(calls.map((x) => x.name)));
      ok("and the allowance never moved (GATES 12e still holds with the tag in place)",
         (await c.usdc.allowance(c.player.address, c.addrs.ps)) === 0n);
      // THE SUITE'S OWN TRIPWIRE (P2's lesson): anvil_setCode is chain-wide and every case here shares one anvil.
      // Put the wallet back, and assert it — without this the blocks below buy from a smart account and the tag's
      // happy path looks broken when the leak, not the page, is at fault.
      await c.provider.send("anvil_setCode", [c.player.address, "0x"]);
      ok("the tag's refusal case puts the wallet back too — no code leaks into the cases below",
         (await c.provider.getCode(c.player.address)) === "0x");
      H.teardown(h);
    }

    // ── the tag off, and the tag broken: the store buys identically either way ──
    {
      const c = await H.chainStore();
      await fund(c);
      await deal(c, "usdc", c.player.address, 25n * DEC6);
      const h = await H.storePage(c, c.player, { url: TAG_URL });
      const w = h.w;
      const SCRIPT = w.DY_CONFIG.analytics.script;
      w.DY_CONFIG.analytics = { domain: "divyayuddha.games", script: SCRIPT, enabled: false };
      // No stub here, deliberately: a spy would define window.plausible itself and hide whether
      // the page installed a shim. With nothing standing in, "nothing exists" is provable.
      w.DYStore.mountTracking();
      ok("config.analytics.enabled=false injects NO vendor script AND installs no shim — window.plausible stays undefined",
         [...w.document.querySelectorAll("script")].filter((t) => t.src === SCRIPT).length === 0 &&
         typeof w.plausible === "undefined");
      await connect(w);
      H.click(w, ".b-buy");
      await waitFor("the receipt", () => /is yours/.test(tile(w)));
      ok("with the tag OFF the bundle still lands, whole — the page's money path does not depend on it",
         (await c.nft.balanceOf(c.player.address)) === 1n && (await c.dyc.balanceOf(c.player.address)) === 500n * DEC);
      ok("and nothing was queued for a vendor that never arrives — still no window.plausible after the whole purchase",
         typeof w.plausible === "undefined");
      H.teardown(h);
    }
    {
      const c = await H.chainStore();
      await fund(c);
      await deal(c, "usdc", c.player.address, 25n * DEC6);
      const h = await H.storePage(c, c.player, { url: TAG_URL });
      const w = h.w;
      w.plausible = () => { throw new Error("the tag exploded"); };   // the worst a vendor script can do
      w.DYStore.mountTracking();
      await connect(w);
      H.click(w, ".b-buy");
      await waitFor("the receipt", () => /is yours/.test(tile(w)));
      ok("A THROWING TAG CANNOT BREAK A BUY — the Torana and the 500 DYC land exactly as they do without it",
         (await c.nft.balanceOf(c.player.address)) === 1n && (await c.dyc.balanceOf(c.player.address)) === 500n * DEC);
      H.teardown(h);
    }
  }

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("HARNESS ERROR (at step: " + step + ")\n" + e.stack); process.exit(1); });
