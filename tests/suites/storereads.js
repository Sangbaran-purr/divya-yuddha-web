"use strict";
// STORE-READS-1 (owner rulings 2026-10-30) — THE STORE'S READ BUDGET. A store visit was ~380 chain calls wallet-less and
// ~580 connected (the 87-card grid read two or three times; every call billed upstream). Now the catalog is ONE
// Multicall3.aggregate3, a wallet change re-reads only that wallet's figures, and every purchase starts with a fresh read.
//
// Measured on the REAL store page (shipped endpoints) through the REAL dy-rpc, at two points:
//   A · what the page sends the proxy (HTTP requests, chain calls, and the inner calls of every aggregate3)
//   B · what dy-rpc forwards upstream (the calls the provider bills)
// with all 87 live cards priced on a local WaveCardSale and the canonical Multicall3 bytecode at 0xcA11…CA11.
//
//   V1 wallet-less visit ≤ 3 chain calls in ≤ 3 HTTP requests · V2 connected visit ≤ 6 · V3 a wallet connect re-reads no
//   grid · V4 upstream calls == page calls (one multicall = one billed call) · V5 a purchase reads fresh BEFORE the wallet
//   opens · V6 a moved price stops the purchase with the ruled sentence, nothing signed · V7 sold out after load → "This card
//   is sold out." · V9/V10 the USD card and the bundle stop on a moved price with the same sentence · V8 the multicall refused → the ruled store line + Try again, and NO per-card single calls
//   B1–B3 · breakages: the old wallet-change grid re-read put back · the purchase's fresh read removed · per-card singles put back
const fs = require("fs");
const path = require("path");
const http = require("http");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = H.SITE, RPC = H.RPC, DEC = 10n ** 18n;
const DYRPC_SRC = path.resolve(SITE, "..", "dy-rpc", "src");
const S = { STORE: "We couldn't load the store right now — try again.", CHANGED: "The price just changed. Check the new price and try again.", SOLD: "This card is sold out." };
const BUDGET = { anonCalls: 3, anonHttp: 3, connCalls: 6 };
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const T = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, " ") : ""; };

// ── decoding: an aggregate3's inner calls, by function name ──
const MC3 = new ethers.Interface(["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])"]);
const NAMES = {};
for (const sig of ["priceOf(uint256)", "remainingOf(uint256)", "salesOpen()", "open()", "decimals()", "allowance(address,address)", "balanceOf(address)",
  "saleOpen()", "inventory()", "capPerWallet()", "packSize()", "bundlePrice(address)", "packPrice(address)", "topUpRemaining(address)"]) NAMES[ethers.id(sig).slice(0, 10)] = sig.split("(")[0];
function describe(item) {
  const p = (item.params || [])[0] || {};
  const d = String(p.data || p.input || "");
  if (item.method === "eth_call" && d.slice(0, 10) === "0x82ad56cb") {
    const inner = MC3.decodeFunctionData("aggregate3", d)[0].map((c) => NAMES[c.callData.slice(0, 10)] || c.callData.slice(0, 10));
    return { method: "multicall", inner };
  }
  return { method: item.method, fn: item.method === "eth_call" ? (NAMES[d.slice(0, 10)] || d.slice(0, 10)) : null };
}

// ── A · the page → proxy counter (ethers' transport) ──
const baseGetUrl = ethers.FetchRequest.createGetUrlFunc();
const A = { proxyTo: null, http: 0, items: [], log: [] };
ethers.FetchRequest.registerGetUrl(async (req, signal) => {
  const u = new URL(req.url);
  if (u.hostname === "rpc.divyayuddha.games") {
    let j = null; try { j = JSON.parse(Buffer.from(req.body).toString("utf8")); } catch (e) {}
    A.http++;
    for (const it of (Array.isArray(j) ? j : [j])) { const d = describe(it); A.items.push(d); A.log.push(d); }
    const r2 = new ethers.FetchRequest(A.proxyTo); r2.method = req.method; r2.body = req.body; for (const [k, v] of req) r2.setHeader(k, v);
    return baseGetUrl(r2, signal);
  }
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return baseGetUrl(req, signal);
  throw new Error("refused by the suite: " + u.host);
});
const resetA = () => { A.http = 0; A.items = []; };

// ── B · dy-rpc → upstream counter (forwards to anvil) ──
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
  Object.assign(process.env, { UPSTREAM_RPC_URL: upstream, ALLOWED_TARGETS: targets.join(","), RATE_IP_PER_MIN: "100000", RATE_IP_PER_HOUR: "1000000", RATE_GLOBAL_PER_SEC: "100000" });
  delete process.env.MAX_LOG_SPAN; delete process.env.UPSTREAM_RPC_URL_2; delete process.env.MAX_MULTICALL_INNER; delete process.env.MULTICALL3_ADDRESS;
  for (const f of ["policy.js", "server.js"]) delete require.cache[require.resolve(path.join(DYRPC_SRC, f))];
  const { create } = require(path.join(DYRPC_SRC, "server.js"));
  const srv = create({ log: () => {} });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, url: "http://127.0.0.1:" + srv.address().port })));
}

// ── the chain: the bundle's store + a WaveCardSale with EVERY live card priced + the USD card store ──
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(H.OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
async function storeChain() {
  const c = await H.chainStore();
  const owner = await c.owner.getAddress();
  const F = (n) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, c.owner); };
  const nft = await F("WaveCardNFT").deploy(owner, "ipfs://base/"); await nft.waitForDeployment();
  const sale = await F("WaveCardSale").deploy(c.addrs.dyc, await nft.getAddress(), owner, owner); await sale.waitForDeployment();
  const usd = await F("WaveCardUsdSale").deploy(await sale.getAddress()); await usd.waitForDeployment();
  global.window = {}; eval(fs.readFileSync(path.join(SITE, "js", "wave-registry.js"), "utf8"));
  const ids = global.window.DY_WAVE_REGISTRY.list().filter((x) => x.status === "live").map((x) => x.cardId);
  delete global.window;
  await (await sale.setPrices(ids, ids.map(() => 2000n * DEC))).wait();
  await (await sale.setSupplyCaps(ids, ids.map((id) => (id === ids[2] ? 1 : 200)))).wait();   // the third card: one left
  await (await sale.setSalesOpen(true)).wait();
  await (await nft.setMinter(await sale.getAddress(), true)).wait();
  await (await nft.setMinter(owner, true)).wait();
  c.wave = { nft, sale, usd, ids, addrs: { nft: await nft.getAddress(), sale: await sale.getAddress(), usd: await usd.getAddress() } };
  c.targets = [c.addrs.ps, c.addrs.usdc, c.addrs.usdt, c.addrs.nft, c.addrs.dyc, c.wave.addrs.nft, c.wave.addrs.sale, c.wave.addrs.usd];
  return c;
}
async function page(c, opts) {
  return H.storePage(c, c.player, Object.assign({ shippedRoads: true, waveCardSale: c.wave.addrs.sale, cardUsdStore: c.wave.addrs.usd }, opts || {}));
}
const settled = async (w, ms) => {
  await H.until(() => /cards for sale/.test(T(w, "#st-buy-status")) && /In stock|Sold out|closed/i.test(T(w, "#bundle-body")), ms || 20000, "the store to settle");
  await H.sleep(1500);   // anything still in flight lands inside the count
};
const innerOf = (name) => A.items.filter((d) => d.method === "multicall").reduce((n, d) => n + d.inner.filter((x) => x === name).length, 0);
const singles = (name) => A.items.filter((d) => d.method === "eth_call" && d.fn === name).length;
const tileOf = (w, idx) => w.document.querySelectorAll("#st-buy-grid figure")[idx];

async function run() {
  console.log("\n── STORE-READS-1 · the store's read budget ──");
  await H.preflight();
  const B = await upstreamCounter();
  const c = await storeChain();
  const dy = await startDyRpc(B.url, c.targets);
  A.proxyTo = dy.url;
  const N = c.wave.ids.length;

  // ═══ V1 · a wallet-less visit ═══
  {
    resetA(); B.items = 0;
    const h = await page(c, { noEthereum: true });
    await settled(h.w);
    const calls = A.items.length;
    ok("V1 · WALLET-LESS: the store (" + N + " cards for sale + the bundle In stock) in " + calls + " chain calls / " + A.http + " HTTP requests (budget ≤ " + BUDGET.anonCalls + " / ≤ " + BUDGET.anonHttp + ")",
       calls <= BUDGET.anonCalls && A.http <= BUDGET.anonHttp && new RegExp(N + " cards for sale").test(T(h.w, "#st-buy-status")), JSON.stringify(A.items.map((d) => d.method + (d.inner ? "×" + d.inner.length : ""))));
    ok("V1b · and every card's price + stock rode the ONE multicall (" + innerOf("priceOf") + " + " + innerOf("remainingOf") + " inner, 0 singles)",
       innerOf("priceOf") === N && innerOf("remainingOf") === N && singles("priceOf") === 0 && singles("remainingOf") === 0);
    ok("V4 · upstream == page: dy-rpc forwarded " + B.items + " calls for the page's " + calls + " (one multicall = ONE billed call)", B.items === calls, "upstream " + B.items);
    H.teardown(h);
  }

  // ═══ V2 · a connected visit (the wallet already connected when the page opens) ═══
  {
    resetA(); B.items = 0;
    const h = await page(c, {});
    await settled(h.w);
    await H.until(() => h.w.DYWallet.state.connected, 10000, "connected");
    await H.sleep(2000);
    ok("V2 · CONNECTED: " + A.items.length + " chain calls / " + A.http + " HTTP requests (budget ≤ " + BUDGET.connCalls + ")", A.items.length <= BUDGET.connCalls,
       JSON.stringify(A.items.map((d) => d.method + (d.inner ? "×" + d.inner.length : "") + (d.fn ? "·" + d.fn : ""))));
    ok("V2b · upstream == page: " + B.items + " billed for " + A.items.length, B.items === A.items.length);
    H.teardown(h);
  }

  // ═══ V3 · a wallet connect re-reads no grid ═══
  {
    resetA();
    const h = await page(c, { notConnected: true });
    await settled(h.w);
    resetA();
    h.eth.__wallet = c.player; await h.w.DYWallet.connect();   // the visitor presses Connect
    await H.until(() => h.w.DYWallet.state.connected, 10000, "the connect");
    await H.sleep(3000);
    ok("V3 · A WALLET CONNECT re-reads NO grid: after the connect, " + innerOf("priceOf") + " price reads and " + singles("priceOf") + " single price calls (only the wallet's own figures: "
       + A.items.length + " calls)", innerOf("priceOf") === 0 && singles("priceOf") === 0 && innerOf("remainingOf") === 0 && A.items.length <= 3,
       JSON.stringify(A.items.map((d) => d.method + (d.inner ? ":" + Array.from(new Set(d.inner)).join("/") : "") + (d.fn ? "·" + d.fn : ""))));
    ok("V3b · and the bundle's catalog was not re-read either (no saleOpen / inventory / bundlePrice after the connect)",
       innerOf("saleOpen") === 0 && innerOf("inventory") === 0 && innerOf("bundlePrice") === 0);
    H.teardown(h);
  }

  // ═══ V5 + V6 · the purchase's fresh read ═══
  {
    // V5 — an unchanged price: the fresh read lands, then the wallet opens (the approve)
    const h = await page(c, {});
    await settled(h.w); await H.until(() => h.w.DYWallet.state.connected, 10000, "connected"); await H.sleep(1500);
    const order = []; const real = h.eth.request.bind(h.eth);
    h.eth.request = (a) => { if (a.method === "eth_sendTransaction" || a.method === "eth_signTransaction") order.push("prompt"); return real(a); };
    const mark = A.log.length;
    tileOf(h.w, 0).querySelector(".st-btn").click();
    await H.until(() => order.length > 0, 15000, "the wallet prompt").catch(() => {});
    const freshAt = A.log.slice(mark).findIndex((d) => d.method === "multicall" && d.inner.length === 3 && d.inner[1] === "priceOf" && d.inner[2] === "remainingOf");
    ok("V5 · a DYC card purchase reads the price + stock FRESH (one 3-call read) BEFORE the wallet opens", freshAt >= 0 && order.length > 0,
       JSON.stringify({ fresh: freshAt, prompts: order }));
    H.teardown(h);
  }
  {
    // V6 — the price moves after the page loaded: stopped, the ruled sentence, nothing signed, the tile shows the new price
    const h = await page(c, {});
    await settled(h.w); await H.until(() => h.w.DYWallet.state.connected, 10000, "connected"); await H.sleep(1500);
    await (await c.wave.sale.setPrices([c.wave.ids[1]], [2500n * DEC])).wait();
    const sends = () => h.eth.__calls.filter((m) => m === "eth_sendTransaction").length;
    const before = sends();
    tileOf(h.w, 1).querySelector(".st-btn").click();
    await H.until(() => T(tileOf(h.w, 1), ".st-msg").indexOf(S.CHANGED) >= 0, 15000, "the changed sentence").catch(() => {});
    const tile = (tileOf(h.w, 1).textContent || "").replace(/\s+/g, " ");
    ok("V6 · THE PRICE MOVED after load: \"" + S.CHANGED + "\" — nothing signed, and the tile now shows the new price (2,500 DYC)",
       tile.indexOf(S.CHANGED) >= 0 && sends() === before && /2,?500/.test(tile), tile.slice(0, 200));
    // V7 — sold out after load (the one-left card's last unit minted elsewhere)
    await (await c.wave.nft.mint(c.addrs.owner, c.wave.ids[2])).wait();
    tileOf(h.w, 2).querySelector(".st-btn").click();
    await H.until(() => (tileOf(h.w, 2).textContent || "").indexOf(S.SOLD) >= 0, 15000, "sold out").catch(() => {});
    ok("V7 · SOLD OUT after load: \"" + S.SOLD + "\" — nothing signed", (tileOf(h.w, 2).textContent || "").indexOf(S.SOLD) >= 0 && sends() === before,
       (tileOf(h.w, 2).textContent || "").replace(/\s+/g, " ").slice(0, 200));
    await (await c.wave.sale.setPrices([c.wave.ids[1]], [2000n * DEC])).wait();
    H.teardown(h);
  }

  // ═══ V9 + V10 · the USD card and the bundle stop on a moved price with the SAME ruled sentence (owner ruling) ═══
  {
    // the USD card store's owner is fixed in the contract (the master) — impersonated here, on anvil only, to open it
    const MASTER = await c.wave.usd.owner();
    await c.provider.send("anvil_impersonateAccount", [MASTER]);
    await c.provider.send("anvil_setBalance", [MASTER, "0x" + (10n * DEC).toString(16)]);
    const usdM = c.wave.usd.connect(await c.provider.getSigner(MASTER));
    await (await usdM.setOpen(true)).wait();                          // the USD card store open: the USD buttons appear
    const h = await page(c, {});
    await settled(h.w); await H.until(() => h.w.DYWallet.state.connected, 10000, "connected"); await H.sleep(1500);
    const sends = () => h.eth.__calls.filter((m) => m === "eth_sendTransaction").length;
    const before = sends();
    await H.until(() => tileOf(h.w, 4) && tileOf(h.w, 4).querySelector(".st-usd") && !tileOf(h.w, 4).querySelector(".st-usd").disabled, 15000, "a USD button").catch(() => {});
    await (await c.wave.sale.setPrices([c.wave.ids[4]], [2500n * DEC])).wait();          // USD 20 -> USD 25 after the page showed 20
    const usdBtn = tileOf(h.w, 4) && tileOf(h.w, 4).querySelector(".st-usd");
    if (usdBtn) usdBtn.click();
    await H.until(() => (tileOf(h.w, 4).textContent || "").indexOf(S.CHANGED) >= 0, 15000, "the USD price-changed stop").catch(() => {});
    const t9 = (tileOf(h.w, 4).textContent || "").replace(/\s+/g, " ");
    ok("V9 · a USD CARD whose price moved after load: \"" + S.CHANGED + "\" — nothing signed, the tile repaints the new price",
       !!usdBtn && t9.indexOf(S.CHANGED) >= 0 && sends() === before && /2,?500|USD 25/.test(t9), t9.slice(0, 220));
    await (await c.wave.sale.setPrices([c.wave.ids[4]], [2000n * DEC])).wait();
    // V10 — the bundle: its USDC price moves after the tile showed it
    const usdc = c.addrs.usdc, was = await c.ps.bundlePrice(usdc);
    await H.until(() => !!h.w.document.querySelector(".b-buy") && !h.w.document.querySelector(".b-buy").disabled, 15000, "the bundle buy button").catch(() => {});
    await (await c.ps.setBundlePrice(usdc, was + 1000000n)).wait();                        // + USD 1
    const bBtn = h.w.document.querySelector(".b-buy");
    if (bBtn) bBtn.click();
    await H.until(() => T(h.w, "#bundle-body").indexOf(S.CHANGED) >= 0, 15000, "the bundle price-changed stop").catch(() => {});
    ok("V10 · the BUNDLE whose price moved after load: \"" + S.CHANGED + "\" — nothing signed",
       !!bBtn && T(h.w, "#bundle-body").indexOf(S.CHANGED) >= 0 && sends() === before, T(h.w, "#bundle-body").slice(0, 220));
    await (await c.ps.setBundlePrice(usdc, was)).wait();
    await (await usdM.setOpen(false)).wait();
    H.teardown(h);
  }

  // ═══ V8 · the multicall refused → the ruled line, never single calls ═══
  {
    const dyNoSale = await startDyRpc(B.url, c.targets.filter((a) => a !== c.wave.addrs.sale));   // the sale not served: aggregate3 refused
    A.proxyTo = dyNoSale.url; resetA();
    const h = await page(c, { noEthereum: true });
    let shown = true;
    try { await H.until(() => T(h.w, "#st-buy-grid").indexOf(S.STORE) >= 0 && !!h.w.document.querySelector("#st-buy-grid .try-again"), 20000, "the ruled line"); } catch (e) { shown = false; }
    await H.sleep(1000);
    ok("V8 · THE MULTICALL REFUSED: the grid shows \"" + S.STORE + "\" + Try again — and the page made NO per-card single calls (" + singles("priceOf") + ")",
       shown && singles("priceOf") === 0 && singles("remainingOf") === 0, T(h.w, "#st-buy-grid").slice(0, 160));
    H.teardown(h); dyNoSale.srv.close(); A.proxyTo = dy.url;
  }

  // ═══ B · deliberate breakages (each must be caught) ═══
  const SRC = fs.readFileSync(path.join(SITE, "js", "store.js"), "utf8");
  const sub = (a, b) => { if (SRC.split(a).length !== 2) throw new Error("breakage target not found once: " + a.slice(0, 60)); return SRC.replace(a, b); };
  async function withMutant(src, fn) {
    const tmp = path.join(SITE, "tests", ".mut-store.js");
    fs.writeFileSync(tmp, src);
    try { return await fn(tmp); } finally { fs.unlinkSync(tmp); }
  }
  await withMutant(sub("        else if (buyCache) refreshBuyWallet();", "        else loadBuy(buyStatus, buyGrid);"), async (file) => {
    const h = await page(c, { notConnected: true, storeSrc: file });
    await settled(h.w); resetA();
    h.eth.__wallet = c.player; await h.w.DYWallet.connect();   // the visitor presses Connect
    await H.until(() => h.w.DYWallet.state.connected, 10000, "the connect"); await H.sleep(3000);
    ok("B1 · THE OLD WALLET-CHANGE GRID RE-READ put back — CAUGHT: the connect re-read " + innerOf("priceOf") + " prices (V3 goes red)", innerOf("priceOf") > 0);
    H.teardown(h);
  });
  {
    // B2 — the fresh read removed from BOTH DYC entry points (approve and buy): with the price moved after load, the
    // purchase never says the ruled sentence (it signs, or fails raw in the wallet's own simulation) — V6 goes red
    let src = SRC;
    for (const [x, y] of [["btn.onclick = function () { freshCardThen(btn, msg, row, function () { doApproveThenSwap(ethers, btn, msg, row); }); };", "btn.onclick = function () { doApproveThenSwap(ethers, btn, msg, row); };"],
                          ["btn.onclick = function () { freshCardThen(btn, msg, row, function () { doBuy(ethers, btn, msg, row, refresh); }); };", "btn.onclick = function () { doBuy(ethers, btn, msg, row, refresh); };"]]) {
      if (src.split(x).length !== 2) throw new Error("B2 target not found once"); src = src.replace(x, y);
    }
    await withMutant(src, async (file) => {
      const h = await page(c, { storeSrc: file });
      await settled(h.w); await H.until(() => h.w.DYWallet.state.connected, 10000, "connected"); await H.sleep(1500);
      await (await c.wave.sale.setPrices([c.wave.ids[3]], [2500n * DEC])).wait();
      tileOf(h.w, 3).querySelector(".st-btn").click();
      await H.until(() => /\b(ok|bad)\b/.test((tileOf(h.w, 3).querySelector(".st-msg") || {}).className || "") || h.eth.__calls.indexOf("eth_sendTransaction") >= 0, 15000, "the road settled").catch(() => {});
      const said = (tileOf(h.w, 3).textContent || "").indexOf(S.CHANGED) >= 0;
      ok("B2 · THE PURCHASE'S FRESH READ removed — CAUGHT: with the price moved, the buyer is never told \"" + S.CHANGED + "\" (V6 goes red)", !said,
         (tileOf(h.w, 3).textContent || "").replace(/\s+/g, " ").slice(0, 160));
      await (await c.wave.sale.setPrices([c.wave.ids[3]], [2000n * DEC])).wait();
      H.teardown(h);
    });
  }
  await withMutant(sub("      return window.DYWallet.multicall(calls).then(function (r) {\n        var val = function (i) { return i >= 0 && r[i].ok ? r[i].v : null; };",
    "      return Promise.all(calls.map(function (q) { return new ethers.Contract(q.target, [q.iface.getFunction(q.fn).format(\"full\")], readProvider(ethers))[q.fn].apply(null, q.args || []).then(function (v) { return { ok: true, v: v }; }, function () { return { ok: false }; }); })).then(function (r) {\n        var val = function (i) { return i >= 0 && r[i].ok ? r[i].v : null; };"), async (file) => {
    resetA();
    const h = await page(c, { noEthereum: true, storeSrc: file });
    await settled(h.w);
    ok("B3 · PER-CARD SINGLE CALLS put back — CAUGHT: " + A.items.length + " chain calls blows the budget of " + BUDGET.anonCalls + " (V1 goes red)", A.items.length > BUDGET.anonCalls && singles("priceOf") > 0);
    H.teardown(h);
  });

  dy.srv.close(); B.srv.close();
  ethers.FetchRequest.registerGetUrl(baseGetUrl);
  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("storereads suite crashed:", e); process.exit(1); });
