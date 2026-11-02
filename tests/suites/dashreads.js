"use strict";
// DASH-READS-1 (owner rulings carried over from STORE-READS-1, 2026-10-30) — THE DASHBOARD'S READ BUDGET. A connected
// dashboard visit was ~32 single calls in ~32 HTTP requests (measured on live b2dd2dc), and the whole set again on every
// wallet event (a reconnect read it twice). Now every eth_call the cards need is ONE Multicall3.aggregate3, sent in one
// HTTP batch with the block and the POL balance; a second aggregate3 carries only what depends on an answer (staking
// positions, the cash-out quote, a coupon's nonces); the Torana self-claim simulation stays a single call (it must run
// FROM the wallet). The history feed (one combined getLogs, RPC-CLEANUP-1) is untouched.
//
// Measured on the REAL dashboard page (shipped endpoints) through the REAL dy-rpc, at two points:
//   A · what the page sends the proxy (HTTP requests, chain calls, and the inner calls of every aggregate3)
//   B · what dy-rpc forwards upstream (the calls the provider bills)
// on a chain carrying every contract the dashboard reads (DYCoinSale, VestingVault, HolderStaking with two positions,
// RoiRedemption, WinningsDesk, ToranaIcoClaim + AccessNFT, DropDesk with a live coupon) and Multicall3 at 0xcA11…CA11.
//
//   D1 wallet-less: 0 chain calls · D2 connected (every card live): the cards in ≤ 6 calls / ≤ 3 HTTP, the feed apart · D3 no single eth_call but the
//   Torana simulation · D4 upstream == page · D5 a wallet SWITCH reads only that wallet's figures · D6 a wallet event that
//   changes nothing reads nothing · D7 every action reads FRESH before the wallet opens · D8 the action takes the fresh
//   amount (rewards credited after load) · D9 the fresh read refused → the ruled sentence + Try again, nothing opens, and
//   Try again recovers · D10 the load's read refused → the ruled sentence on the cards, no single calls
//   B1–B4 · breakages: single calls put back · a wallet event re-reads everything · the fresh read removed · a single-call
//   fallback on failure
const fs = require("fs");
const path = require("path");
const http = require("http");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = H.SITE, RPC = H.RPC, DEC = H.DEC, DEC6 = H.DEC6;
const DYRPC_SRC = path.resolve(SITE, "..", "dy-rpc", "src");
const { makeSigner } = require(path.join(H.W3, "services", "approval-bot", "src", "signer.js"));
const RR = "We couldn't load this right now — try again.";
// cards: the chain check, ONE batch (block + POL balance + the aggregate3), the dependent aggregate3 + the Torana simulation.
// The feed (the history scan, untouched): its tip, ≤ 2 getLogs (forward + backfill) and the block of each history row (its date).
const BUDGET = { anonCalls: 0, cardCalls: 6, cardHttp: 3, feedLogs: 2 };
const FEED = (d) => d.method === "eth_getLogs" || d.method === "eth_blockNumber";
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const T = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, " ") : ""; };
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(H.OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }

// ── decoding: an aggregate3's inner calls, by function name ──
const MC3 = new ethers.Interface(["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])"]);
const NAMES = {};
const GLOBAL_FNS = ["decimals", "dexDay", "VEST_DURATION", "reserve", "paused", "MIN_REDEEM", "COOLDOWN", "CAP_MULTIPLE", "poolRemaining", "totalStakedPrincipal", "currentRound", "presalePriceE18", "publicPriceE18"];
for (const sig of ["balanceOf(address)", "decimals()", "grantedTo(address)", "vestedSoFar(address)", "releasable(address)", "dexDay()", "VEST_DURATION()", "redeemed(address)", "lastRedeem(address)",
  "invitePaid(address)", "reserve()", "paused()", "MIN_REDEEM()", "COOLDOWN()", "status(address)", "claimFor(address)", "positionCount(address)", "getPosition(address,uint256)", "pendingRoi(address)",
  "roi(address)", "vestedRegistered(address)", "CAP_MULTIPLE()", "poolRemaining()", "totalStakedPrincipal()", "attributionLocked(address)", "quote(uint256)", "currentRound()", "presalePriceE18()",
  "publicPriceE18()", "nonceRedeemed(uint256)", "nonceCancelled(uint256)", "allowance(address,address)", "presaleSold()", "presaleCap()"]) NAMES[ethers.id(sig).slice(0, 10)] = sig.split("(")[0];
function describe(item) {
  const p = (item.params || [])[0] || {};
  const d = String(p.data || p.input || "");
  if (item.method === "eth_call" && d.slice(0, 10) === "0x82ad56cb") return { method: "multicall", inner: MC3.decodeFunctionData("aggregate3", d)[0].map((c) => NAMES[c.callData.slice(0, 10)] || c.callData.slice(0, 10)) };
  return { method: item.method, fn: item.method === "eth_call" ? (NAMES[d.slice(0, 10)] || d.slice(0, 10)) : null };
}

// ── A · the page → proxy counter (ethers' transport); ORDER also records the wallet's own requests (the prompts) ──
const baseGetUrl = ethers.FetchRequest.createGetUrlFunc();
const A = { proxyTo: null, http: 0, items: [] };
let ORDER = [];
ethers.FetchRequest.registerGetUrl(async (req, signal) => {
  const u = new URL(req.url);
  if (u.hostname === "rpc.divyayuddha.games") {
    let j = null; try { j = JSON.parse(Buffer.from(req.body).toString("utf8")); } catch (e) {}
    A.http++;
    for (const it of (Array.isArray(j) ? j : [j])) { const d = describe(it); A.items.push(d); ORDER.push({ k: "read", d }); }
    const r2 = new ethers.FetchRequest(A.proxyTo); r2.method = req.method; r2.body = req.body; for (const [k, v] of req) r2.setHeader(k, v);
    return baseGetUrl(r2, signal);
  }
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return baseGetUrl(req, signal);
  throw new Error("refused by the suite: " + u.host);
});
const resetA = () => { A.http = 0; A.items = []; ORDER = []; };
const multis = () => A.items.filter((d) => d.method === "multicall");
const innerHas = (name) => multis().reduce((n, d) => n + d.inner.filter((x) => x === name).length, 0);
const singles = () => A.items.filter((d) => d.method === "eth_call");
const shape = () => JSON.stringify(A.items.map((d) => d.method + (d.inner ? "×" + d.inner.length : "") + (d.fn ? "·" + d.fn : "")));

// ── B · dy-rpc → upstream counter ──
function upstreamCounter() {
  const B = { items: 0, srv: null, url: null };
  B.srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", async () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      B.items += Array.isArray(j) ? j.length : 1;
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: b }).then((x) => x.text()).catch(() => null);
      if (r == null) { res.writeHead(502); return res.end(); }
      res.writeHead(200, { "content-type": "application/json" }); res.end(r);
    });
  });
  return new Promise((r) => B.srv.listen(0, "127.0.0.1", () => { B.url = "http://127.0.0.1:" + B.srv.address().port; r(B); }));
}
function startDyRpc(upstream, targets) {
  Object.assign(process.env, { UPSTREAM_RPC_URL: upstream, ALLOWED_TARGETS: targets.join(","), RATE_IP_PER_MIN: "100000", RATE_IP_PER_HOUR: "1000000", RATE_GLOBAL_PER_SEC: "100000", UPSTREAM_LOGS_TIMEOUT_MS: "20000" });
  delete process.env.MAX_LOG_SPAN; delete process.env.UPSTREAM_RPC_URL_2; delete process.env.MAX_MULTICALL_INNER; delete process.env.MULTICALL3_ADDRESS;
  for (const f of ["policy.js", "server.js"]) delete require.cache[require.resolve(path.join(DYRPC_SRC, f))];
  const { create } = require(path.join(DYRPC_SRC, "server.js"));
  const srv = create({ log: () => {} });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, url: "http://127.0.0.1:" + srv.address().port })));
}

// ── the chain: every contract the dashboard reads, with the player holding something in each ──
async function dashChain() {
  const c = await H.chainPresale();
  const F = (n) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, c.owner); };
  const owner = c.addrs.owner, chainId = Number((await c.provider.getNetwork()).chainId);
  // the purchase: vesting granted, the sale's "has bought" flag, and the Torana claim eligible (USD 120 ≥ 100)
  const P = new ethers.NonceManager(c.player);   // the player sends several in a row (ethers' 250 ms nonce cache)
  const amt = 120n * DEC6, sig = await makeSigner(c.signer.privateKey, chainId, c.addrs.sale).sign(c.player.address);
  await (await c.usdt.connect(P).approve(c.addrs.sale, amt)).wait();
  await (await c.sale.connect(P).buyWithStable(c.addrs.usdt, amt, sig, "")).wait();
  const nft = await F("AccessNFT").deploy(owner, "ipfs://torana/"); await nft.waitForDeployment();
  const claim = await F("ToranaIcoClaim").deploy(c.addrs.sale, await nft.getAddress()); await claim.waitForDeployment();
  await (await nft.setMinter(await claim.getAddress(), true)).wait();
  // staking: the pool (150M from the treasury = the owner here), two of the player's positions, a day of rewards, collected
  const hs = await F("HolderStaking").deploy(c.addrs.dyc, c.addrs.vault, owner, owner); await hs.waitForDeployment();
  await (await c.dyc.mint(owner, 150000000n * DEC)).wait();
  await (await c.dyc.approve(await hs.getAddress(), 150000000n * DEC)).wait();
  await (await hs.initPool()).wait();
  await (await c.dyc.mint(owner, 2000n * DEC)).wait();
  await (await c.dyc.approve(await hs.getAddress(), 2000n * DEC)).wait();   // D8/B3: the owner (a debitor) credits rewards
  await (await c.dyc.mint(c.player.address, 50000n * DEC)).wait();
  await (await c.dyc.connect(P).approve(await hs.getAddress(), 20000n * DEC)).wait();
  await (await hs.connect(P).stake(10000n * DEC)).wait();
  await (await hs.connect(P).stake(10000n * DEC)).wait();
  await c.provider.send("evm_increaseTime", [86400 * 3]); await c.provider.send("evm_mine", []);
  await (await hs.connect(P).claim()).wait();                     // roi > 0 → the cash-out quote is read
  await c.provider.send("evm_increaseTime", [86400]); await c.provider.send("evm_mine", []);   // and a day more pending (Collect enabled)
  // the cash-out desk, funded
  const rd = await F("RoiRedemption").deploy(c.addrs.dyc, c.addrs.usdt, await hs.getAddress(), owner); await rd.waitForDeployment();
  await (await hs.setDebitor(await rd.getAddress(), true)).wait();
  await (await hs.setDebitor(owner, true)).wait();                       // D8: the owner credits rewards after the page loaded
  await (await c.usdt.mint(owner, 1000n * DEC6)).wait();
  await (await c.usdt.approve(await rd.getAddress(), 1000n * DEC6)).wait();
  await (await rd.fundDesk(1000n * DEC6)).wait();
  // the winnings desk, funded
  const wsigner = ethers.Wallet.createRandom();
  const wd = await F("WinningsDesk").deploy(c.addrs.dyc, c.addrs.usdt, owner, wsigner.address, owner); await wd.waitForDeployment();
  await (await c.usdt.mint(owner, 500n * DEC6)).wait();
  await (await c.usdt.approve(await wd.getAddress(), 500n * DEC6)).wait();
  await (await wd.fundDesk(500n * DEC6)).wait();
  // the drop desk and one live coupon for the player (its nonces are read; the coupon's signature is not checked by a read)
  const dsigner = ethers.Wallet.createRandom();
  const dd = await F("DropDesk").deploy(owner, dsigner.address, c.addrs.dyc); await dd.waitForDeployment();
  const now = Number((await c.provider.getBlock("latest")).timestamp);
  c.voucherSig = sig;
  c.coupon = { wallet: c.player.address, amount: (25n * DEC).toString(), deadline: now + 86400 * 5, nonce: "7", sig: "0x" + "11".repeat(65) };
  Object.assign(c, { hs, rd, wd, dd, nft, claim });
  Object.assign(c.addrs, { hs: await hs.getAddress(), rd: await rd.getAddress(), wd: await wd.getAddress(), dd: await dd.getAddress(), nft: await nft.getAddress(), claim: await claim.getAddress() });
  c.targets = [c.addrs.sale, c.addrs.vault, c.addrs.dyc, c.addrs.usdt, c.addrs.usdc, c.addrs.hs, c.addrs.rd, c.addrs.wd, c.addrs.dd, c.addrs.nft, c.addrs.claim];
  // a second wallet for the switch (D5): it holds DYC only
  c.second = new ethers.Wallet("0x" + "6".repeat(64), c.provider);
  await (await c.owner.sendTransaction({ to: c.second.address, value: 10n ** 18n })).wait();
  await (await c.dyc.mint(c.second.address, 10n * DEC)).wait();
  return c;
}
function svc(c) {
  return {
    "coupons.json": () => [c.coupon],
    "/winnings/policy": () => ({ capUsd: 50 }),
    "/presale/voucher": () => ({ wallet: c.player.address, sig: c.voucherSig }),
  };
}
async function page(c, opts) {
  return H.dashboardPage(c, c.player, Object.assign({
    shippedRoads: true, svc: svc(c), presaleVoucherUrl: "https://bot.test/presale/voucher", winnings: { desk: c.addrs.wd, service: "https://bot.test" },
    contracts: { dycoinSale: c.addrs.sale, vestingVault: c.addrs.vault, holderStaking: c.addrs.hs, roiRedemption: c.addrs.rd, dropDesk: c.addrs.dd, toranaClaim: c.addrs.claim, usdt: c.addrs.usdt, usdc: c.addrs.usdc },
    ls: { "dymf::config": JSON.stringify({ deployBlock: 1 }) },
  }, opts || {}));
}
const settled = async (w) => {
  await H.until(() => /\d/.test(T(w, "#liq-amt")) && !/Reading|Loading/i.test(T(w, "#tx-status")) && T(w, "#tx-body").length > 0, 25000, "the dashboard to settle");
  await H.sleep(2500);   // anything still in flight (the feed's backfill) lands inside the count
};
function watchWallet(h) {
  const real = h.eth.request.bind(h.eth);
  h.eth.request = (a) => { ORDER.push({ k: "wallet", m: a.method }); return real(a); };
}
// after a click: did a FULL fresh read (a multicall carrying the wallet-independent figures) land BEFORE the wallet's first request?
function freshBeforeWallet() {
  const firstWallet = ORDER.findIndex((e) => e.k === "wallet" && /^(eth_call|eth_estimateGas|eth_sendTransaction|personal_sign|eth_signTypedData_v4)$/.test(e.m));
  const fresh = ORDER.findIndex((e) => e.k === "read" && e.d.method === "multicall" && e.d.inner.indexOf("currentRound") >= 0 && e.d.inner.indexOf("balanceOf") >= 0);
  return { fresh, firstWallet, ok: fresh >= 0 && (firstWallet < 0 || fresh < firstWallet) };
}

async function run() {
  console.log("\n── DASH-READS-1 · the dashboard's read budget ──");
  await H.preflight();
  const B = await upstreamCounter();
  const c = await dashChain();
  const dy = await startDyRpc(B.url, c.targets);
  A.proxyTo = dy.url;

  // ═══ D1 · wallet-less ═══
  {
    resetA(); B.items = 0;
    const h = await page(c, { noEthereum: true });
    await H.until(() => /Connect your wallet/.test(T(h.w, "#vest-body")), 15000, "the wallet-less face");
    await H.sleep(5000);   // the wallet detector's grace period, and anything after it
    ok("D1 · WALLET-LESS: the dashboard's connect faces in " + A.items.length + " chain calls / " + A.http + " HTTP requests (budget " + BUDGET.anonCalls + ")",
       A.items.length === BUDGET.anonCalls && A.http === 0, shape());
    H.teardown(h);
  }

  // ═══ D2–D4 · a connected visit, every card live ═══
  {
    resetA(); B.items = 0;
    const h = await page(c, {});
    await settled(h.w);
    const calls = A.items.length, m = multis();
    // the feed's rows are dated by their blocks (one getBlock per history row) — counted apart, they are the scan's
    const rows = h.w.document.querySelectorAll("#tx-body tr").length;
    const feedBlocks = Math.max(0, A.items.filter((d) => d.method === "eth_getBlockByNumber").length - 1);
    const card = calls - A.items.filter(FEED).length - feedBlocks;
    const cardHttp = A.http - A.items.filter(FEED).length - feedBlocks;   // the feed's provider sends one call per request
    ok("D2 · CONNECTED (vesting, two staking positions, rewards + a cash-out quote, winnings, an eligible Torana, a live coupon): the cards in "
       + card + " chain calls / " + cardHttp + " HTTP requests (budget ≤ " + BUDGET.cardCalls + " / ≤ " + BUDGET.cardHttp + ") — was ~32 / ~32 on live",
       card <= BUDGET.cardCalls && cardHttp <= BUDGET.cardHttp, shape());
    ok("D2c · the feed (the history scan, untouched): " + A.items.filter((d) => d.method === "eth_getLogs").length + " getLogs (≤ " + BUDGET.feedLogs + "), and one block per history row for its date ("
       + feedBlocks + " for " + rows + " rows)", A.items.filter((d) => d.method === "eth_getLogs").length <= BUDGET.feedLogs && feedBlocks <= rows, shape());
    ok("D2b · and every card read: liquid, vesting, staking, rewards, winnings, the Torana line, the coupon card",
       /\d/.test(T(h.w, "#liq-amt")) && !/couldn't load/.test(T(h.w, "#vest-body") + T(h.w, "#stake-body") + T(h.w, "#reward-body") + T(h.w, "#winnings-body"))
       && /2/.test(T(h.w, "#stake-body")) && !!h.w.document.querySelector("#redeem-btn"),
       [T(h.w, "#vest-body"), T(h.w, "#stake-body"), T(h.w, "#reward-body")].map((x) => x.slice(0, 80)).join(" | "));
    ok("D3 · the cards' eth_calls rode " + m.length + " aggregate3 (" + m.map((d) => d.inner.length).join(" + ") + " inner) — the only single eth_call is the Torana self-claim simulation (" + singles().map((d) => d.fn).join(",") + ")",
       m.length >= 1 && m.length <= 2 && singles().length <= 1 && singles().every((d) => d.fn === "claimFor") && innerHas("getPosition") === 2 && innerHas("quote") === 1 && innerHas("nonceRedeemed") === 1,
       shape());
    ok("D4 · upstream == page: dy-rpc forwarded " + B.items + " calls for the page's " + calls + " (one aggregate3 = ONE billed call)", B.items === calls, "upstream " + B.items);
    H.teardown(h);
  }

  // ═══ D5 · a wallet SWITCH reads only that wallet's figures ═══
  {
    const h = await page(c, {});
    await settled(h.w);
    resetA();
    h.eth.__switchTo(c.second);                             // MetaMask: the account changes (accountsChanged)
    await H.until(() => /^10(\.0+)?\b/.test(T(h.w, "#liq-amt")), 15000, "the second wallet's balance").catch(() => {});
    await H.sleep(2500);
    const g = GLOBAL_FNS.filter((f) => innerHas(f) > 0);
    ok("D5 · A WALLET SWITCH reads only that wallet's figures: " + A.items.filter((d) => d.method !== "eth_getLogs" && d.method !== "eth_blockNumber").length
       + " calls (+ its own feed), and NONE of the wallet-independent figures re-read (" + (g.join(",") || "none") + ")",
       g.length === 0 && innerHas("balanceOf") >= 1 && /^10/.test(T(h.w, "#liq-amt")), shape() + " liq=" + T(h.w, "#liq-amt"));
    // D6 · a wallet event that changes nothing (Connect pressed again on the same wallet) reads nothing
    resetA();
    await h.w.DYWallet.connect();
    await H.sleep(3000);
    ok("D6 · A WALLET EVENT THAT CHANGES NOTHING (Connect again, same wallet) reads nothing: " + A.items.length + " chain calls", A.items.length === 0, shape());
    H.teardown(h);
  }

  // ═══ D7 · every action reads FRESH before the wallet opens ═══
  {
    const h = await page(c, {});
    await settled(h.w);
    watchWallet(h);
    const cases = [
      ["Collect rewards", "#act-rclaim"], ["Cash out", "#act-cashout"], ["Redeem the drop", "#redeem-btn"], ["Claim the Torana", "#torana-claim"],
    ];
    for (const [label, sel] of cases) {
      const btn = h.w.document.querySelector(sel);
      resetA();
      if (btn) btn.click();
      await H.until(() => h.w.document.getElementById("ov-confirm").classList.contains("show") || h.w.document.getElementById("ov-fail").classList.contains("show"), 15000, label).catch(() => {});
      const f = freshBeforeWallet();
      ok("D7 · " + label + ": a FRESH combined read before the wallet is asked anything", !!btn && f.ok, JSON.stringify({ btn: !!btn, f, order: ORDER.slice(0, 8).map((e) => e.k === "read" ? e.d.method + (e.d.inner ? "×" + e.d.inner.length : "") : "wallet:" + e.m) }));
      h.w.document.getElementById("ov-confirm").classList.remove("show"); h.w.document.getElementById("ov-fail").classList.remove("show");
      await H.sleep(1500);
    }
    // the buy: amount typed, Buy DYC — the fresh read lands before the wallet is asked for the coin balance
    resetA();
    const amt = h.w.document.getElementById("buy-amt");
    if (amt) { amt.value = "100"; amt.dispatchEvent(new h.w.Event("input")); }
    const go = h.w.document.getElementById("buy-go");
    if (go) go.click();
    await H.until(() => ORDER.some((e) => e.k === "wallet"), 15000, "the buy's wallet").catch(() => {});
    const fb = freshBeforeWallet();
    ok("D7 · Buy DYC: a FRESH combined read before the wallet is asked anything", !!go && fb.ok, JSON.stringify(fb));
    H.teardown(h);
  }

  // ═══ D8 · the action takes the FRESH amount (rewards credited after the page loaded) ═══
  {
    const h = await page(c, {});
    await settled(h.w);
    const before = await c.hs.roi(c.player.address);
    await (await c.hs.creditRoi(c.player.address, 500n * DEC)).wait();   // + 500 DYC to the cash-out balance, after load
    const now = await c.hs.roi(c.player.address);
    h.w.document.querySelector("#act-cashout").click();
    await H.until(() => h.w.document.getElementById("ov-confirm").classList.contains("show"), 15000, "the cash-out confirm").catch(() => {});
    const body = T(h.w, "#ov-confirm-body"), raw = T(h.w, "#ov-confirm-raw");
    ok("D8 · CASH OUT after 500 DYC more was credited post-load: the confirm offers the FRESH amount (" + ethers.formatUnits(now, 18) + " DYC, not " + ethers.formatUnits(before, 18) + ")",
       raw.indexOf(now.toString()) >= 0 && raw.indexOf(before.toString() + " ") < 0, body.slice(0, 160) + " | " + raw);
    h.w.document.getElementById("ov-confirm-cancel").click();
    H.teardown(h);
  }

  // ═══ D9 · the fresh read refused → the ruled sentence + Try again; nothing opens; Try again recovers ═══
  {
    const h = await page(c, {});
    await settled(h.w);
    watchWallet(h);
    const dyNo = await startDyRpc(B.url, c.targets.filter((a) => a !== c.addrs.hs));   // HolderStaking not served: the aggregate3 refused
    A.proxyTo = dyNo.url; resetA();
    h.w.document.querySelector("#act-cashout").click();
    await H.until(() => h.w.document.getElementById("ov-fail").classList.contains("show"), 15000, "the failure box").catch(() => {});
    const msg = T(h.w, "#ov-fail-msg"), btn = h.w.document.querySelector("#ov-fail-msg .try-again");
    ok("D9 · THE FRESH READ REFUSED: \"" + RR + "\" + Try again — the confirm never opens, the wallet is asked nothing, and no single calls (" + singles().length + ")",
       msg.indexOf(RR) >= 0 && !!btn && !h.w.document.getElementById("ov-confirm").classList.contains("show") && !ORDER.some((e) => e.k === "wallet") && singles().length === 0, msg);
    A.proxyTo = dy.url;
    if (btn) btn.click();
    await H.until(() => h.w.document.getElementById("ov-confirm").classList.contains("show"), 15000, "the confirm after Try again").catch(() => {});
    ok("D9b · road restored, Try again: the fresh read lands and the cash-out confirm opens", h.w.document.getElementById("ov-confirm").classList.contains("show"));
    h.w.document.getElementById("ov-confirm-cancel").click();
    H.teardown(h); dyNo.srv.close();
  }

  // ═══ D10 · the load's read refused → the ruled sentence on the cards, no single calls ═══
  {
    const dyNo = await startDyRpc(B.url, c.targets.filter((a) => a !== c.addrs.vault));
    A.proxyTo = dyNo.url; resetA();
    const h = await page(c, {});
    let shown = true;
    try { await H.until(() => T(h.w, "#vest-body").indexOf(RR) >= 0 && !!h.w.document.querySelector("#vest-body .try-again"), 20000, "the ruled line"); } catch (e) { shown = false; }
    await H.sleep(1500);
    ok("D10 · THE LOAD'S READ REFUSED: the cards show \"" + RR + "\" + Try again — and the page made NO single calls (" + singles().length + ")",
       shown && singles().length === 0, T(h.w, "#vest-body").slice(0, 160) + " " + shape());
    H.teardown(h); dyNo.srv.close(); A.proxyTo = dy.url;
  }

  // ═══ B · deliberate breakages (each must be caught) ═══
  const SRC = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8");
  const sub = (src, a, b) => { if (src.split(a).length !== 2) throw new Error("breakage target not found once: " + a.slice(0, 70)); return src.replace(a, b); };
  const SINGLES = "Promise.all(calls.map(function (x) { return new ethersRef.Contract(x.target, [x.iface.getFunction(x.fn).format(\"full\")], rp)[x.fn].apply(null, x.args).then(function (v) { return { ok: true, v: v }; }, function () { return { ok: false }; }); }))";
  {
    resetA();
    const h = await page(c, { dashSrc: sub(SRC, "rp.getBalance(addr).catch(function () { return null; }), W.multicall(calls),", "rp.getBalance(addr).catch(function () { return null; }), " + SINGLES + ",") });
    await settled(h.w);
    ok("B1 · SINGLE CALLS put back — CAUGHT: " + singles().length + " single eth_calls — the cards blow their budget of " + BUDGET.cardCalls + " (D2 goes red)", singles().length > BUDGET.cardCalls);
    H.teardown(h);
  }
  {
    const h = await page(c, { dashSrc: sub(SRC, "    W.onChange(function () { onWalletEvent(); });", "    W.onChange(function () { refresh(); });") });
    await settled(h.w);
    resetA();
    await h.w.DYWallet.connect();
    await H.sleep(3000);
    ok("B2 · A WALLET EVENT RE-READS EVERYTHING — CAUGHT: Connect again on the same wallet read " + A.items.length + " calls, the wallet-independent figures among them (D6 goes red)",
       A.items.length > 0 && innerHas("currentRound") > 0);
    H.teardown(h);
  }
  {
    const h = await page(c, { dashSrc: sub(SRC, '$("act-cashout").onclick = freshThen(actCashOut);', '$("act-cashout").onclick = actCashOut;') });
    await settled(h.w);
    const before = await c.hs.roi(c.player.address);
    await (await c.hs.creditRoi(c.player.address, 500n * DEC)).wait();
    h.w.document.querySelector("#act-cashout").click();
    await H.until(() => h.w.document.getElementById("ov-confirm").classList.contains("show"), 15000, "the confirm").catch(() => {});
    const raw = T(h.w, "#ov-confirm-raw");
    ok("B3 · THE FRESH READ removed — CAUGHT: the confirm offers the STALE amount (" + ethers.formatUnits(before, 18) + " DYC) after 500 more was credited (D8 goes red)", raw.indexOf(before.toString()) >= 0, raw);
    h.w.document.getElementById("ov-confirm-cancel").click();
    H.teardown(h);
  }
  {
    const dyNo = await startDyRpc(B.url, c.targets.filter((a) => a !== c.addrs.vault));
    A.proxyTo = dyNo.url; resetA();
    const h = await page(c, { dashSrc: sub(SRC, "rp.getBalance(addr).catch(function () { return null; }), W.multicall(calls),",
      "rp.getBalance(addr).catch(function () { return null; }), W.multicall(calls).catch(function () { return " + SINGLES + "; }),") });
    await H.sleep(9000);
    ok("B4 · A SINGLE-CALL FALLBACK when the read is refused — CAUGHT: " + singles().length + " single calls (D10 goes red)", singles().length > 0);
    H.teardown(h); dyNo.srv.close(); A.proxyTo = dy.url;
  }

  dy.srv.close(); B.srv.close();
  ethers.FetchRequest.registerGetUrl(baseGetUrl);
  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("dashreads suite crashed:", e); process.exit(1); });
