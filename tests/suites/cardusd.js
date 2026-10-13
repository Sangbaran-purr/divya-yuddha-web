"use strict";
// CARD-STORE-1 C3 — THE USD CARD BUTTON, proven against the REAL WaveCardUsdSale.
//
// The chain is anvil carrying the REAL contracts the live page speaks to: WaveCardNFT, WaveCardSale (the DYC sale whose
// prices and caps the USD store reads) and WaveCardUsdSale — whose two payment tokens and owner are HARD-CODED Polygon
// addresses, so the tokens are planted there (USDT0 as the void-return token it really is, USDC as a standard one) and
// the master is impersonated to flip the switches, exactly as the forge suite does. The page is store.html's own
// markup running js/store.js in jsdom behind an EIP-1193 shim; its reads ride a COUNTING proxy on the read road.
//
//   node tests/suites/cardusd.js                 (the runner gives it its own anvil via DY_RPC)
//   DY_MUTANTS=1 node tests/suites/cardusd.js    (also runs every mutant of js/store.js below; each must turn red)
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { ethers } = require("ethers");
const H = require("../lib.js");
const DEC = 1000000000000000000n, DEC6 = 1000000n;
const RPC = process.env.DY_RPC || "http://127.0.0.1:8545";
const OUT = path.join(process.env.DY_WEB3 || path.resolve(H.SITE, "..", "divya-yuddha-web3"), "contracts", "out");
const MASTER = "0xbab57f595b80318A79006Cd1f6Fde11464AaF86e";
const USDT0 = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const STORE_JS = path.join(H.SITE, "js", "store.js");
// CARD-STORE-1 C5 — the bot's OWN code library: the stub bind route runs the bot's verifier on what the page signed
const botCodes = require(path.join(H.W3, "services", "approval-bot", "src", "invites", "codes.js"));
const P15 = "Invite recorded.";
const P16 = "The invite couldn't be recorded - your purchase goes ahead as normal.";
const P17 = "The invite signature is free and moves no money - please sign it to continue with your purchase.";

// ── the ruled lines (STORE_DESIGN §11 P19-P26, P8, P12), quoted so a drift shows here too ──
const P19 = (sum, sym) => "Buy for " + sum + " · " + sym;     // the button names the coin it will charge (review fix 1)
const P20 = "Pay with";
const P21 = (sym, sum) => "Not enough " + sym + " in this wallet - " + sum + " buys this card.";
const P22 = "Not enough POL in this wallet for the network fee - add a little POL and try again.";
const P23 = "This card is sold out.";
const P24 = "The card store is closed for now.";
const P25 = "Switch your wallet to Polygon to buy.";
const P26 = "Cancelled in your wallet.";
const P12 = "Couldn't check this wallet just now - try again in a moment. Nothing was signed.";
const DONE = "Bought — it is in your Treasury.";

function art(n, file) { const j = JSON.parse(fs.readFileSync(path.join(OUT, (file || n) + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object, runtime: j.deployedBytecode.object }; }

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : "")));
  if (!c && process.env.DY_STORE_MUTANT) process.exit(1);   // a mutant is killed by its first red check
};
const WD_MS = Number(process.env.DY_WD_MS || 25000);
async function waitFor(label, fn, ms) {
  const t0 = Date.now();
  for (;;) {
    let v = null; try { v = await fn(); } catch (e) { v = null; }
    if (v) return v;
    if (Date.now() - t0 > (ms || WD_MS)) throw new Error("WATCHDOG at: " + label);
    await H.sleep(60);
  }
}

// ── THE COUNTING READ PROXY: the page's read road (readRpcUrls) points here; every JSON-RPC call it forwards is
//    recorded (to, selector), so "no second full read of every card" is a count, not a claim. `fail` refuses all
//    reads; `delayMs` holds every reply (the pen-switch-under-the-read proof). ──
function readProxy() {
  const P = { calls: [], fail: false, delayMs: 0, srv: null, url: null };
  P.srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", async () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      (Array.isArray(j) ? j : [j]).forEach((m) => {
        if (!m) return;
        const p0 = (m.params && m.params[0]) || {};
        P.calls.push({ method: m.method, to: (p0.to || "").toLowerCase(), sel: (p0.data || p0.input || "").slice(0, 10) });
      });
      if (P.delayMs) await H.sleep(P.delayMs);
      if (P.fail) { res.writeHead(503); res.end("down"); return; }
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: b }).then((x) => x.text()).catch(() => null);
      if (r == null) { res.writeHead(502); res.end(); return; }
      res.writeHead(200, { "content-type": "application/json" }); res.end(r);
    });
  });
  return new Promise((r) => P.srv.listen(0, "127.0.0.1", () => { P.url = "http://127.0.0.1:" + P.srv.address().port; r(P); }));
}

// ── THE CHAIN: the bundle's chain (PlayStore etc., for the coin chips) + the three wave contracts + the two planted tokens ──
async function chainCards() {
  const c = await H.chainStore();
  const p = c.provider;
  await p.send("anvil_setCode", [USDT0, art("MockStableVoid", "PlayStoreMocks").runtime]);
  await p.send("anvil_setCode", [USDC, art("MockStable").runtime]);
  await p.send("anvil_impersonateAccount", [MASTER]);
  await p.send("anvil_setBalance", [MASTER, "0x" + (100n * DEC).toString(16)]);
  const master = await p.getSigner(MASTER);
  const F = (n, s) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, s || c.owner); };
  const nft = await F("WaveCardNFT").deploy(MASTER, "ipfs://base/"); await nft.waitForDeployment();
  const sale = await F("WaveCardSale").deploy(c.addrs.dyc, await nft.getAddress(), MASTER, MASTER); await sale.waitForDeployment();
  const store = await F("WaveCardUsdSale").deploy(await sale.getAddress()); await store.waitForDeployment();
  const saleM = sale.connect(master), nftM = nft.connect(master), storeM = store.connect(master);
  // 101 = 2,000 DYC (USD 20) · 102 = 3,800 DYC (USD 38) · 103 = 2,000 DYC + 1 wei (does not divide — no USD button) ·
  // 104 = 2,000 DYC with a cap of 1, sold out before the page opens
  await (await saleM.setPrices([101, 102, 103, 104], [2000n * DEC, 3800n * DEC, 2000n * DEC + 1n, 2000n * DEC])).wait();
  await (await saleM.setSupplyCaps([101, 102, 103, 104], [200, 70, 70, 1])).wait();
  await (await saleM.setSalesOpen(true)).wait();
  await (await nftM.setMinter(await sale.getAddress(), true)).wait();
  await (await nftM.setMinter(await store.getAddress(), true)).wait();
  await (await nftM.setMinter(MASTER, true)).wait();
  await (await nftM.mint(MASTER, 104)).wait();              // 104 sold out
  const tok = (a) => new ethers.Contract(a, art("MockStable").abi, c.owner);
  return Object.assign(c, { master, nft, sale, store, saleM, storeM, nftM, usdtT: tok(USDT0), usdcT: tok(USDC),
    wave: { sale: await sale.getAddress(), store: await store.getAddress(), nft: await nft.getAddress() } });
}

const q = (w, s) => w.document.querySelector(s);
const tileOf = (w, name) => Array.from(w.document.querySelectorAll("#st-buy-grid figure")).filter((f) => (f.querySelector("figcaption") || {}).textContent === name)[0] || null;
const usdBtn = (w, name) => { const t = tileOf(w, name); return t ? t.querySelector(".st-usd") : null; };
const msgOf = (w, name) => { const t = tileOf(w, name); const m = t && t.querySelector(".st-msg:not(.b-invite-note)"); return m ? m.textContent.replace(/\s+/g, " ").trim() : ""; };
const sends = (eth) => eth.__calls.filter((m) => m === "eth_sendTransaction").length;

async function page(c, P, opts) {
  opts = opts || {};
  const h = await H.storePage(c, opts.player || c.player, Object.assign({ readUrls: [P.url], waveCardSale: c.wave.sale, cardUsdStore: c.wave.store,
    ls: { "dystore::usdcAddress": USDC, "dystore::usdtAddress": USDT0 } }, opts));
  // record every wallet send's params (FEE-1 proof) and allow a rejection / foreign chain to be dialled in
  const eth = h.eth, orig = eth.request.bind(eth);
  eth.__sent = []; eth.__reject = false; eth.__chainId = null;
  eth.request = async function (a) {
    if (a.method === "eth_chainId" && eth.__chainId) { eth.__calls.push(a.method); return eth.__chainId; }
    if (a.method === "eth_sendTransaction") {
      eth.__sent.push(Object.assign({}, a.params[0]));
      if (eth.__reject) { eth.__calls.push(a.method); const e = new Error("User rejected the request."); e.code = 4001; throw e; }
    }
    return orig(a);
  };
  return h;
}
async function connected(h) {
  const w = h.w;
  await waitFor("provider", () => w.DYWallet.state.hasProvider);
  await w.DYWallet.connect();
  await waitFor("connected", () => w.DYWallet.state.connected && w.DYWallet.state.chainOk);
  await waitFor("the grid painted", () => tileOf(w, "Deva Sainika"));
}
async function fresh(c, P, opts) {
  const h = await page(c, P, opts);
  await connected(h);
  await waitFor("a USD button enabled", () => { const b = usdBtn(h.w, "Deva Sainika"); return b && !b.disabled; }).catch(() => null);
  return h;
}
// the road has SETTLED when its message turns ok or bad, or says it is still confirming — whatever the words; the
// check that follows compares them. (`want` is kept as documentation of the expected outcome at each call site.)
async function tapAndSettle(w, name, want) {
  usdBtn(w, name).click();
  return waitFor("the road settled on " + name, () => {
    const t = tileOf(w, name), e = t && t.querySelector(".st-msg:not(.b-invite-note)");
    if (!e) return null;
    const m = e.textContent.replace(/\s+/g, " ").trim();
    return (/\b(ok|bad)\b/.test(e.className) || /Still confirming/.test(m)) ? m : null;
  }, 60000).catch(() => "(never settled: " + msgOf(w, name) + ")");   // a road that stalls fails its check by name
}

async function main() {
  const miss = H.preflight();
  ["WaveCardNFT", "WaveCardSale", "WaveCardUsdSale"].forEach((n) => { if (!fs.existsSync(path.join(OUT, n + ".sol", n + ".json"))) miss.push("  MISSING: " + n + " artifact (forge build in contracts/)"); });
  if (!fs.existsSync(path.join(OUT, "PlayStoreMocks.sol", "MockStableVoid.json"))) miss.push("  MISSING: MockStableVoid artifact");
  if (miss.length) { console.log("PREFLIGHT FAILED:\n" + miss.join("\n")); process.exit(1); }
  await new ethers.JsonRpcProvider(RPC).send("anvil_reset", []);   // every run (and every mutant) starts on a clean chain
  const P = await readProxy();
  const c = await chainCards();
  const storeLc = c.wave.store.toLowerCase();
  const fund = async (who, amt) => { await (await c.usdcT.mint(who, amt)).wait(); await (await c.usdtT.mint(who, amt)).wait(); };
  await fund(c.player.address, 1000n * DEC6);

  // ══════════════ G · THE GATE: both switches, read fresh — closed until BOTH are true ══════════════
  console.log("\n── G · the gate ──");
  {
    const h = await page(c, P); await connected(h); await H.sleep(400);
    ok("G1 · store closed (open=false), DYC sale open: NO USD button anywhere, the DYC buttons stand",
       !h.w.document.querySelector(".st-usd") && !!tileOf(h.w, "Deva Sainika").querySelector(".st-btn"));
    H.teardown(h);
  }
  await (await c.storeM.setOpen(true)).wait();
  await (await c.saleM.setSalesOpen(false)).wait();
  {
    const h = await page(c, P); await connected(h); await H.sleep(400);
    ok("G2 · store open, DYC sale CLOSED: NO USD button (the store refuses a buy unless both are on)", !h.w.document.querySelector(".st-usd"));
    H.teardown(h);
  }
  await (await c.saleM.setSalesOpen(true)).wait();

  // ══════════════ T · THE TILES: price, coin line, the non-exact and sold-out cards, the read count ══════════════
  console.log("\n── T · the tiles ──");
  let h = null;
  {
    P.calls = [];
    h = await fresh(c, P);
    const w = h.w;
    const b1 = usdBtn(w, "Deva Sainika"), b2 = usdBtn(w, "Agneyastra");
    ok("T1 · both switches true: card 101 reads 'Buy for USD 20 · USDC', card 102 'Buy for USD 38 · USDC' — the coin is NAMED",
       b1 && b1.textContent === P19("USD 20", "USDC") && b2 && b2.textContent === P19("USD 38", "USDC"), (b1 && b1.textContent) + " / " + (b2 && b2.textContent));
    ok("T2 · the DYC button is unchanged beside it (Approve DYC / Buy, same row)",
       /Approve DYC|^Buy$/.test(tileOf(w, "Deva Sainika").querySelector(".st-btn:not(.st-usd)").textContent));
    ok("T3 · a price that does not divide by 1e14 (2,000 DYC + 1 wei) gets NO USD button (the contract refuses it)", !usdBtn(w, "Airavata's Calf"));
    ok("T4 · a sold-out card gets NO USD button", !usdBtn(w, "Aruna Charioteer"));
    const sw = tileOf(w, "Deva Sainika").querySelector(".st-usd-coin");
    const chips = sw ? Array.from(sw.querySelectorAll(".st-usd-chip")).map((x) => x.textContent + (x.classList.contains("on") ? "*" : "")) : [];
    ok("T5 · the card carries its own switch: 'Pay with' USDT / USDC, USDC on (the bundle's chip, auto by balance)",
       !!sw && sw.querySelector(".st-usd-pay").textContent === P20 && chips.join(",") === "USDT,USDC*", chips.join(","));
    // the grid loads more than once (on mount, on connect); each load is one salesOpen() on the DYC sale. Count only once
    // the read road has gone QUIET (no new call for 1.5 s) — a stray per-card read lands after the buttons paint.
    for (let n = -1, t0 = Date.now(); n !== P.calls.length && Date.now() - t0 < 20000;) { n = P.calls.length; await H.sleep(1500); }
    const storeReads = P.calls.filter((x) => x.to === storeLc);
    const loads = P.calls.filter((x) => x.to === c.wave.sale.toLowerCase() && x.sel === ethers.id("salesOpen()").slice(0, 10)).length;
    const perCard = P.calls.filter((x) => x.to === c.wave.sale.toLowerCase() && x.sel === ethers.id("priceOf(uint256)").slice(0, 10)).length;
    ok("T6 · THE BATCH: ONE store read per grid load (open()), against " + perCard + " per-card DYC-sale reads — no card is read twice",
       loads > 0 && storeReads.length === loads && storeReads.every((x) => x.sel === ethers.id("open()").slice(0, 10)) && perCard >= 87 * loads,
       loads + " loads / " + JSON.stringify(storeReads.map((x) => x.sel)));
    ok("T7 · and it rode the read road (the proxy), not the wallet", P.calls.length > 0 && !h.eth.__calls.some((m) => m === "eth_call"));
  }

  // ══════════════ B · THE BUY ROAD ══════════════
  console.log("\n── B · the buy ──");
  {
    const w = h.w;
    const before = await c.usdcT.balanceOf(MASTER), nBefore = await c.nft.balanceOf(c.player.address);
    P.calls = [];
    const m = await tapAndSettle(w, "Deva Sainika", [DONE, "Cancelled", "Not enough", "Couldn't"]);
    ok("B1 · the buy lands: '" + DONE + "'", m === DONE, m);
    ok("B2 · the master received exactly USD 20 in USDC", (await c.usdcT.balanceOf(MASTER)) - before === 20n * DEC6);
    ok("B3 · the player owns one more wave card, and it is card 101", (await c.nft.balanceOf(c.player.address)) === nBefore + 1n && (await c.nft.mintedOfCard(101)) === 1n);
    ok("B4 · two sends: approve, then buy", h.eth.__sent.length === 2, String(h.eth.__sent.length));
    const iface = new ethers.Interface(["function approve(address,uint256)", "function buy(uint256,address)"]);
    const ap = h.eth.__sent[0], by = h.eth.__sent[1];
    const apD = iface.parseTransaction({ data: ap.data }), byD = iface.parseTransaction({ data: by.data });
    ok("B5 · the approve is EXACT (20 USDC to the store, never max)", apD.name === "approve" && apD.args[0].toLowerCase() === storeLc && apD.args[1] === 20n * DEC6 && ap.to.toLowerCase() === USDC.toLowerCase());
    ok("B6 · the buy is buy(101, USDC) on the store", byD.name === "buy" && byD.args[0] === 101n && byD.args[1].toLowerCase() === USDC.toLowerCase() && by.to.toLowerCase() === storeLc);
    ok("B7 · FEE-1: both sends carry the fee FIELDS (cap ≥ 45 gwei floor, tip ≥ 30 gwei floor)",
       [ap, by].every((t) => t.maxFeePerGas != null && t.maxPriorityFeePerGas != null && BigInt(t.maxFeePerGas) >= 45000000000n && BigInt(t.maxPriorityFeePerGas) >= 30000000000n),
       JSON.stringify([ap, by].map((t) => [t.maxFeePerGas, t.maxPriorityFeePerGas, t.gas])));
    ok("B8 · the allowance left behind is 0 (exact)", (await c.usdcT.allowance(c.player.address, c.wave.store)) === 0n);
    const fr = P.calls.filter((x) => x.to === storeLc).map((x) => x.sel);
    const sel = (s) => ethers.id(s).slice(0, 10);
    ok("B9 · the tap RE-READ, on the read road: open + remainingOf of the store, and the coin's balance + allowance",
       fr.indexOf(sel("open()")) >= 0 && fr.indexOf(sel("remainingOf(uint256)")) >= 0
       && P.calls.some((x) => x.to === USDC.toLowerCase() && x.sel === sel("balanceOf(address)"))
       && P.calls.some((x) => x.to === USDC.toLowerCase() && x.sel === sel("allowance(address,address)"))
       && P.calls.some((x) => x.method === "eth_getBalance"));
    const st = await waitFor("the tile refreshed after the buy", () => { const t = tileOf(w, "Deva Sainika"); const r = t && t.querySelector(".st-remaining"); return r && /199 of 200/.test(r.textContent) ? r.textContent : null; }).catch(() => null);
    ok("B10 · the tile re-reads after the buy (199 of 200 left — the shared cap moved)", !!st);
  }
  {
    // a standing allowance is honoured: no approve
    await (await c.usdcT.connect(c.player).approve(c.wave.store, 38n * DEC6)).wait();
    const w = h.w; h.eth.__sent = [];
    await waitFor("the button re-enabled", () => { const b = usdBtn(w, "Agneyastra"); return b && !b.disabled; });
    const m = await tapAndSettle(w, "Agneyastra", [DONE, "Cancelled", "Not enough", "Couldn't"]);
    ok("B11 · a sufficient FRESH allowance skips the approve: one send (buy) only", m === DONE && h.eth.__sent.length === 1, m + " sends=" + h.eth.__sent.length);
  }
  H.teardown(h);

  // ══════════════ C · THE CHIP: the bundle's choice is the card's coin ══════════════
  console.log("\n── C · the coin: named on the button, one switch for the page ──");
  const btnText = (w, n) => { const b = usdBtn(w, n); return b ? b.textContent : ""; };
  const cardOn = (w, n) => { const t = tileOf(w, n); const o = t && t.querySelector(".st-usd-chip.on"); return o ? o.textContent : ""; };
  const bundleOn = (w) => { const o = w.document.querySelector(".b-asset.on .b-asset-l"); return o ? o.textContent : ""; };
  {
    h = await fresh(c, P);
    const w = h.w;
    await waitFor("the bundle's chips", () => Array.from(w.document.querySelectorAll(".b-asset")).length === 2);
    Array.from(w.document.querySelectorAll(".b-asset")).filter((b) => /USDT/.test(b.textContent))[0].click();
    const moved = await waitFor("the cards follow the bundle", () => bundleOn(w) === "Pay with USDT" && btnText(w, "Deva Sainika") === P19("USD 20", "USDT") && btnText(w, "Agneyastra") === P19("USD 38", "USDT")
      && cardOn(w, "Deva Sainika") === "USDT" && cardOn(w, "Agneyastra") === "USDT").catch(() => null);
    ok("C1 · USDT on the BUNDLE: the bundle shows USDT, every card button now reads '· USDT' and every card switch shows USDT", !!moved, bundleOn(w) + " / " + btnText(w, "Deva Sainika") + " / " + cardOn(w, "Agneyastra"));
    const before = await c.usdtT.balanceOf(MASTER);
    const m = await tapAndSettle(w, "Deva Sainika", [DONE]);
    ok("C2 · and the buy pays USDT0 (the void-return token): the master +20 USDT", m === DONE && (await c.usdtT.balanceOf(MASTER)) - before === 20n * DEC6, m);
    // the switch on a CARD moves the bundle and every other card
    ok("C3a · (precondition) before the card switch the bundle still shows USDT", bundleOn(w) === "Pay with USDT", bundleOn(w));
    Array.from(tileOf(w, "Agneyastra").querySelectorAll(".st-usd-chip")).filter((x) => x.textContent === "USDC")[0].click();
    const back = await waitFor("the bundle follows the card", () => bundleOn(w) === "Pay with USDC" && btnText(w, "Agneyastra") === P19("USD 38", "USDC")
      && cardOn(w, "Deva Sainika") === "USDC", 300).catch(() => null);   // IMMEDIATE: the switch repaints the bundle itself, not a later refresh
    ok("C3 · USDC on a CARD's switch: the bundle's chip moves to USDC, and every card reads '· USDC'", !!back, bundleOn(w) + " / " + btnText(w, "Agneyastra"));
    H.teardown(h);
  }
  {
    // THE NAMED COIN IS THE CHARGED COIN, even when the switch moves while the road is in flight
    h = await fresh(c, P);
    const w = h.w;
    await waitFor("USDC named", () => btnText(w, "Deva Sainika") === P19("USD 20", "USDC"));
    const usdcB = await c.usdcT.balanceOf(MASTER), usdtB = await c.usdtT.balanceOf(MASTER);
    P.delayMs = 500;
    usdBtn(w, "Deva Sainika").click();
    await H.sleep(150);
    Array.from(tileOf(w, "Agneyastra").querySelectorAll(".st-usd-chip")).filter((x) => x.textContent === "USDT")[0].click();   // switch mid-road
    await H.sleep(50);
    const midLabel = btnText(w, "Deva Sainika");
    const m = await waitFor("settled", () => { const t = tileOf(w, "Deva Sainika"), e = t && t.querySelector(".st-msg:not(.b-invite-note)"); return e && /\b(ok|bad)\b/.test(e.className) ? e.textContent.trim() : null; }, 60000)
      .catch(() => "(never settled)");
    P.delayMs = 0;
    const dUsdc = (await c.usdcT.balanceOf(MASTER)) - usdcB, dUsdt = (await c.usdtT.balanceOf(MASTER)) - usdtB;
    ok("C4 · a switch DURING the buy does not change the coin: the tap that named USDC charged USDC (+20) and no USDT",
       m === DONE && dUsdc === 20n * DEC6 && dUsdt === 0n, m + " usdc+" + dUsdc + " usdt+" + dUsdt);
    ok("C4b · and while it was in flight its button still named USDC (the label never shows a coin the road isn't charging)",
       midLabel === P19("USD 20", "USDC"), midLabel);
    ok("C5 · every token the wallet was asked to approve or spend was the coin named at the tap",
       h.eth.__sent.every((t) => [USDC.toLowerCase(), c.wave.store.toLowerCase()].indexOf(t.to.toLowerCase()) >= 0)
       && h.eth.__sent.filter((t) => t.to.toLowerCase() === c.wave.store.toLowerCase()).every((t) => t.data.toLowerCase().indexOf(USDC.slice(2).toLowerCase()) >= 0));
    ok("C6 · and afterwards the other cards name the new coin (USDT) — the page choice did move", btnText(w, "Agneyastra") === P19("USD 38", "USDT"), btnText(w, "Agneyastra"));
    H.teardown(h);
  }

  // ══════════════ V · THE INVITE STEP ON THE USD CARD BUY (CARD-STORE-1 C5) ══════════════
  console.log("\n── V · the invite step on the USD card buy ──");
  const chainId = Number((await c.provider.getNetwork()).chainId);
  const realCode = async () => { const wl = ethers.Wallet.createRandom(), td = botCodes.codeRequestTypedData(chainId, wl.address, Math.floor(Date.now() / 1000));
    return botCodes.codeFromSignature(await wl.signTypedData(td.domain, td.types, td.message)); };
  // the stub /invites/bind: verifies the page's signature with the BOT'S verifier; `refuse` answers a named refusal
  const bindStub = (opts) => { const seen = { calls: 0, verified: [] }; return { seen, stub: { "/invites/bind": (init) => {
    seen.calls++; const b = JSON.parse(init.body); const v = botCodes.verifyBinding(chainId, b); seen.verified.push(v);
    if (!v.ok) return { refused: "BAD_SIGNATURE" }; if (opts && opts.refuse) return { refused: opts.refuse, sentence: "x" }; return { code: v.code, existing: false }; } } }; };
  const typed = (eth) => eth.__calls.filter((m) => m === "eth_signTypedData_v4").length;
  const note = (w, n) => { const t = tileOf(w, n), e = t && t.querySelector(".b-invite-note"); return e ? e.textContent.trim() : ""; };
  const inviteLs = (code, done) => ({ "dystore::invite": JSON.stringify(Object.assign({ code: code, at: Date.now() }, done ? { done: done } : {})) });
  const vPage = async (who, ls, extra) => fresh(c, P, Object.assign({ player: who, invite: "https://bot.test", ls: Object.assign({ "dystore::usdcAddress": USDC, "dystore::usdtAddress": USDT0 }, ls) }, extra || {}));
  const newBuyer = async () => { const wl = ethers.Wallet.createRandom().connect(c.provider);
    await c.provider.send("anvil_setBalance", [wl.address, "0x" + (10n * DEC).toString(16)]); await fund(wl.address, 200n * DEC6);
    await c.provider.send("anvil_impersonateAccount", [wl.address]);   // the shim forwards sends to anvil, which must be able to send as K
    return wl; };
  {
    const K = await newBuyer(), code = await realCode(), s1 = bindStub();
    h = await vPage(K, inviteLs(code), { svc: s1.stub });
    const before = await c.usdcT.balanceOf(MASTER);
    const m = await tapAndSettle(h.w, "Deva Sainika", [DONE]);
    const v = s1.seen.verified[0] || {};
    ok("V1 · a card-only buyer from an invite link (no Torana): the FREE signature comes FIRST, then the buy lands",
       m === DONE && typed(h.eth) === 1 && h.eth.__calls.indexOf("eth_signTypedData_v4") < h.eth.__calls.indexOf("eth_sendTransaction")
       && (await c.usdcT.balanceOf(MASTER)) - before === 20n * DEC6, m + " typed=" + typed(h.eth));
    ok("V2 · the bot's own verifier accepts what was signed: THIS buyer, THIS code; the page says '" + P15 + "'",
       s1.seen.calls === 1 && v.ok && v.buyer.toLowerCase() === K.address.toLowerCase() && v.code === code && note(h.w, "Deva Sainika") === P15, JSON.stringify(v) + " / " + note(h.w, "Deva Sainika"));
    await waitFor("the next card ready", () => { const b = usdBtn(h.w, "Agneyastra"); return b && !b.disabled; });
    const m2 = await tapAndSettle(h.w, "Agneyastra", [DONE]);
    ok("V3 · ALREADY BOUND (recorded here): the next card buy asks NOTHING and goes straight to the buy", m2 === DONE && typed(h.eth) === 1 && s1.seen.calls === 1, m2);
    H.teardown(h);
  }
  {
    const K = await newBuyer(), code = await realCode(), s1 = bindStub();
    h = await vPage(K, inviteLs(code), { svc: s1.stub });
    h.eth.__declineTyped = true;
    usdBtn(h.w, "Deva Sainika").click();
    await waitFor("the declined sentence", () => note(h.w, "Deva Sainika") === P17, 20000).catch(() => null);
    await H.sleep(400);
    ok("V4 · the buyer REJECTS the free signature: '" + P17 + "' — no purchase, nothing approved or sent, the bind never called",
       note(h.w, "Deva Sainika") === P17 && sends(h.eth) === 0 && s1.seen.calls === 0 && !usdBtn(h.w, "Deva Sainika").disabled, note(h.w, "Deva Sainika"));
    h.eth.__declineTyped = false;
    const m = await tapAndSettle(h.w, "Deva Sainika", [DONE]);
    ok("V5 · …and the next tap ASKS AGAIN; signed this time, the buy lands", m === DONE && typed(h.eth) === 2 && s1.seen.calls === 1, m + " typed=" + typed(h.eth));
    H.teardown(h);
  }
  {
    const K = await newBuyer(), code = await realCode();
    h = await vPage(K, inviteLs(code), { svcDown: true });
    const m = await tapAndSettle(h.w, "Deva Sainika", [DONE]);
    ok("V6 · the BOT IS DOWN: signed, the bind fails — '" + P16 + "' — and the purchase goes ahead and lands",
       m === DONE && typed(h.eth) === 1 && note(h.w, "Deva Sainika") === P16, m + " / " + note(h.w, "Deva Sainika"));
    H.teardown(h);
  }
  {
    const K = await newBuyer(), code = await realCode(), s1 = bindStub({ refuse: "ALREADY_BOUND" });
    h = await vPage(K, inviteLs(code), { svc: s1.stub });
    const m = await tapAndSettle(h.w, "Deva Sainika", [DONE]);
    ok("V7 · a CAN'T-APPLY refusal (already bound elsewhere; the same for LOOP / CODE_KILLED): '" + P16 + "', the buy lands",
       m === DONE && note(h.w, "Deva Sainika") === P16, m);
    await waitFor("the next card ready", () => { const b = usdBtn(h.w, "Agneyastra"); return b && !b.disabled; });
    const m2 = await tapAndSettle(h.w, "Agneyastra", [DONE]);
    ok("V8 · …and that wallet is remembered: never asked again", m2 === DONE && typed(h.eth) === 1 && s1.seen.calls === 1);
    H.teardown(h);
  }
  {
    const K = await newBuyer(), code = await realCode(), s1 = bindStub();
    // K holds a Torana: minted by the PlayStore (already an AccessNFT minter), impersonated on this local chain
    await c.provider.send("anvil_impersonateAccount", [c.addrs.ps]); await c.provider.send("anvil_setBalance", [c.addrs.ps, "0x" + (1n * DEC).toString(16)]);
    await (await new ethers.Contract(c.addrs.nft, ["function mint(address) returns (uint256)"], await c.provider.getSigner(c.addrs.ps)).mint(K.address)).wait();
    h = await vPage(K, inviteLs(code), { svc: s1.stub });
    const m = await tapAndSettle(h.w, "Deva Sainika", [DONE]);
    ok("V9 · a TORANA HOLDER (the bot can never bind it): no prompt, straight to the buy", m === DONE && typed(h.eth) === 0 && s1.seen.calls === 0, m);
    H.teardown(h);
  }
  {
    const K = await newBuyer(), code = await realCode(), s1 = bindStub();
    h = await vPage(K, inviteLs(code, [K.address.toLowerCase()]), { svc: s1.stub });
    const m = await tapAndSettle(h.w, "Deva Sainika", [DONE]);
    ok("V10 · a wallet this browser already settled (bound or can't apply, INVITE-STEP-2's memory): no prompt", m === DONE && typed(h.eth) === 0 && s1.seen.calls === 0, m);
    H.teardown(h);
  }
  {
    const K = await newBuyer(), s1 = bindStub();
    h = await vPage(K, {}, { svc: s1.stub });
    const m = await tapAndSettle(h.w, "Deva Sainika", [DONE]);
    ok("V11 · no invite remembered: no prompt (control)", m === DONE && typed(h.eth) === 0 && s1.seen.calls === 0, m);
    H.teardown(h);
  }
  {
    const K = await newBuyer(), code = await realCode(), s1 = bindStub();
    h = await vPage(K, inviteLs(code), { svc: s1.stub });
    h.w.DYWallet.state.chainOk = false;
    const m = await tapAndSettle(h.w, "Deva Sainika", [P25]);
    ok("V13 · WRONG NETWORK with a remembered invite: no signature prompt — the buy stops at '" + P25 + "'", m === P25 && typed(h.eth) === 0 && s1.seen.calls === 0, m);
    H.teardown(h);
  }
  {
    const K = await newBuyer(), other = await newBuyer(), code = await realCode(), s1 = bindStub();
    h = await vPage(K, inviteLs(code), { svc: s1.stub });
    P.delayMs = 600;
    usdBtn(h.w, "Deva Sainika").click();
    await H.sleep(200);
    h.eth.__switchTo(other);                                                   // the pen moves under the step's Torana read
    await H.sleep(2500);
    P.delayMs = 0;
    ok("V14 · the wallet switched under the step's read: NO signature is asked for either pen", typed(h.eth) === 0 && s1.seen.calls === 0, "typed=" + typed(h.eth));
    H.teardown(h);
  }
  {
    // a DYC card buy never takes the invite step (no commission on DYC sales — unchanged ruling)
    const K = await newBuyer(), code = await realCode(), s1 = bindStub();
    await (await c.dyc.mint(K.address, 10000n * DEC)).wait();
    h = await vPage(K, inviteLs(code), { svc: s1.stub });
    const dycBtn = () => tileOf(h.w, "Deva Sainika").querySelector(".st-btn:not(.st-usd)");
    await waitFor("the DYC button", () => dycBtn() && !dycBtn().disabled);
    dycBtn().click();
    await waitFor("the DYC approve settled", () => { const e = tileOf(h.w, "Deva Sainika").querySelector(".st-msg:not(.b-invite-note)"); return e && /ok|bad/.test(e.className); }, 60000).catch(() => null);
    ok("V12 · a DYC card buy with a remembered invite: NO signature asked, the bind never called", typed(h.eth) === 0 && s1.seen.calls === 0 && sends(h.eth) >= 1,
       "typed=" + typed(h.eth) + " sends=" + sends(h.eth));
    H.teardown(h);
  }

  // ══════════════ R · THE REFUSALS — plain words, nothing sent ══════════════
  console.log("\n── R · the refusals ──");
  const poor = ethers.Wallet.createRandom().connect(c.provider);
  await c.provider.send("anvil_setBalance", [poor.address, "0x" + (10n * DEC).toString(16)]);
  await (await c.usdcT.mint(poor.address, 5n * DEC6)).wait();
  {
    h = await fresh(c, P, { player: poor });
    const m = await tapAndSettle(h.w, "Deva Sainika", [P21("USDC", "USD 20"), DONE, "Couldn't", "POL"]);
    ok("R1 · not enough USDC: '" + P21("USDC", "USD 20") + "' and nothing sent", m === P21("USDC", "USD 20") && sends(h.eth) === 0, m);
    H.teardown(h);
  }
  const dry = ethers.Wallet.createRandom().connect(c.provider);
  await c.provider.send("anvil_setBalance", [dry.address, "0x" + (1000000000000000n).toString(16)]);   // 0.001 POL
  await fund(dry.address, 100n * DEC6);
  {
    h = await fresh(c, P, { player: dry });
    const m = await tapAndSettle(h.w, "Deva Sainika", [P22, DONE, "Couldn't", "Not enough USDC"]);
    ok("R2 · not enough POL for the fee cap: '" + P22 + "' and nothing sent", m === P22 && sends(h.eth) === 0, m);
    H.teardown(h);
  }
  {
    h = await fresh(c, P);
    await (await c.saleM.setSupplyCap(102, Number(await c.nft.mintedOfCard(102)))).wait();   // sold out AFTER the tile painted
    const m = await tapAndSettle(h.w, "Agneyastra", [P23, DONE, "Couldn't"]);
    ok("R3 · sold out at the tap (the tile was stale): '" + P23 + "', nothing sent", m === P23 && sends(h.eth) === 0, m);
    await (await c.saleM.setSupplyCap(102, 70)).wait();
    await (await c.storeM.setOpen(false)).wait();                                              // the store closes under the tile
    const m2 = await tapAndSettle(h.w, "Deva Sainika", [P24, DONE, "Couldn't"]);
    ok("R4 · the store closed at the tap: '" + P24 + "', nothing sent", m2 === P24 && sends(h.eth) === 0, m2);
    await (await c.storeM.setOpen(true)).wait();
    await (await c.saleM.setSalesOpen(false)).wait();
    usdBtn(h.w, "Deva Sainika").disabled = false;
    const m3 = await tapAndSettle(h.w, "Deva Sainika", [P24 + "x", DONE, "Couldn't"].concat([P24]));
    ok("R5 · the DYC sale closed at the tap: the same '" + P24 + "', nothing sent", m3 === P24 && sends(h.eth) === 0, m3);
    await (await c.saleM.setSalesOpen(true)).wait();
    H.teardown(h);
  }
  {
    h = await fresh(c, P);
    h.eth.__reject = true;
    const m = await tapAndSettle(h.w, "Deva Sainika", [P26, DONE, "Couldn't"]);
    ok("R6 · rejected in the wallet: '" + P26 + "', the button is ready again", m === P26 && !usdBtn(h.w, "Deva Sainika").disabled, m);
    ok("R7 · and the master was paid nothing for it (the approve was the rejected send)", h.eth.__sent.length === 1);
    h.eth.__reject = false;
    h.eth.__chainId = "0x1";                                                                   // the wallet moved to Ethereum
    const m2 = await tapAndSettle(h.w, "Deva Sainika", [P25, DONE, "Couldn't"]);
    ok("R8 · wrong network at the tap: '" + P25 + "', nothing sent", m2 === P25 && h.eth.__sent.length === 1, m2);
    H.teardown(h);
  }
  {
    h = await fresh(c, P);
    h.w.DYWallet.state.chainOk = false;                                                       // the page already knows
    const m = await tapAndSettle(h.w, "Deva Sainika", [P25, DONE, "Couldn't"]);
    ok("R9 · a page that already knows the chain is wrong stops at once: '" + P25 + "'", m === P25 && sends(h.eth) === 0, m);
    H.teardown(h);
  }
  {
    h = await fresh(c, P);
    P.fail = true;
    const m = await tapAndSettle(h.w, "Deva Sainika", [P12, DONE, "Not enough"]);
    P.fail = false;
    ok("R10 · the fresh read FAILED: P12, nothing signed (a failed read is no answer)", m === P12 && sends(h.eth) === 0, m);
    H.teardown(h);
  }
  {
    h = await fresh(c, P);
    const other = ethers.Wallet.createRandom().connect(c.provider);
    P.delayMs = 700;
    usdBtn(h.w, "Deva Sainika").click();
    await H.sleep(250);
    h.eth.__switchTo(other);                                                                   // the pen moves under the read
    const m = await waitFor("settled", () => { const t = tileOf(h.w, "Deva Sainika"), e = t && t.querySelector(".st-msg:not(.b-invite-note)"); return e && /\b(ok|bad)\b/.test(e.className) ? e.textContent.trim() : null; }, 60000)
      .catch(() => "(never settled: " + msgOf(h.w, "Deva Sainika") + " / sends " + sends(h.eth) + ")");
    P.delayMs = 0;
    ok("R11 · the wallet switched under the read (sameWallet): P12, nothing signed for either pen", m === P12 && sends(h.eth) === 0, m);
    H.teardown(h);
  }
  {
    const h2 = await page(c, P); await connected(h2);
    h2.eth.__switchTo(null);                                                                   // the wallet disconnects
    await waitFor("disconnected", () => !h2.w.DYWallet.state.connected);
    await waitFor("the grid repainted", () => { const b = usdBtn(h2.w, "Deva Sainika"); return b && b.disabled; }).catch(() => null);
    const b = usdBtn(h2.w, "Deva Sainika");
    ok("R12 · disconnected: the USD button shows, disabled (the DYC button says to connect)", !!b && b.disabled);
    H.teardown(h2);
  }

  P.srv.close();
  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail));
  return fail;
}

// ══════════════ THE MUTANTS: each is a real defect in js/store.js; the suite must turn RED on every one ══════════════
const MUTANTS = [
  ["gate ignores the DYC sale's switch", "var usdLive = usdOpen === true && open === true;", "var usdLive = usdOpen === true;"],
  ["approve max, not exact", "return stable.approve(cusAddr(), F.usd, fee); });", "return stable.approve(cusAddr(), (1n << 255n), fee); });"],
  ["the approve is skipped on a kept answer", "F.needApprove = F.allowance < F.usd;", "F.needApprove = false;"],
  // the pen is checked twice (after the read, and at the signer); either alone catches a switch under the read, so
  // removing one is an EQUIVALENT mutant — the defect is removing both, and that is the mutant
  ["no pen check (sameWallet after the read AND the signer's address)", [
    ["if (!sameWallet(me)) throw usdStop(\"precast\");          // the pen moved under the read", ""],
    ["if (!eqAddr(x[1], me) || !sameWallet(me)) throw usdStop(\"precast\");", ""]]],
  ["no FEE-1 on the buy", "return window.DYWallet.feeOverrides().then(function (fee) { return store.buy(cardId, coinAddr, fee); });", "return store.buy(cardId, coinAddr);"],
  ["no POL check", "if (F.pol < gas * BigInt(fee.maxFeePerGas)) throw usdStop(\"pol\");", ""],
  ["no balance check", "if (F.balance < F.usd) throw usdStop(\"short\");", ""],
  ["no closed check at the tap", "if (!F.open || !F.salesOpen) throw usdStop(\"closed\");", ""],
  ["no sold-out check at the tap", "if (F.remaining === 0n) throw usdStop(\"sold\");", ""],
  ["price not required to divide", "if (price == null || price <= 0n || price % DYC_WEI_PER_USD !== 0n) return null;", "if (price == null || price <= 0n) return null;"],
  ["the coin ignores the bundle's chip", "function usdCoinKey() { return bChosen || bShown || \"usdc\"; }", "function usdCoinKey() { return \"usdc\"; }"],
  ["the button does not name the coin", "var U_BTN = function (sum, sym) { return \"Buy for \" + sum + \" · \" + sym; };", "var U_BTN = function (sum, sym) { return \"Buy for \" + sum; };"],
  ["the label is not repainted on a switch (it names a coin the tap won't charge)", "if (b.getAttribute(\"data-done\") !== \"1\") b.textContent = U_BTN(b.getAttribute(\"data-sum\"), c.label);", ""],
  // (NOT a mutant: "the tap charges the page's coin instead of data-coin" is EQUIVALENT — every switch repaints each
  //  idle button's label and data-coin in the same pass, so at the moment of a tap the two cannot differ. C4/C4b pin
  //  the only window where they could: a road in flight.)
  ["a card's switch does not move the bundle", "if (bHost) paintBundle(bHost);   // the bundle's chips follow (paintBundle calls usdCoinRepaint itself)", ""],
  ["a road in flight is repainted to the new coin", "if (b.getAttribute(\"data-busy\") === \"1\") continue;          // a road in flight keeps the coin it named", ""],
  ["the network is not checked at the signer", "if (Number(x[0].chainId) !== Number(CFG.chain.id)) throw usdStop(\"net\");", ""],
  ["a per-card store read on render", "if (!usdLive || !cusAddr() || soldOut) return;", "if (cusAddr()) loadE().then(function (E) { new E.Contract(cusAddr(), CUS_ABI, readProvider()).remainingOf(row.card.cardId).catch(function () {}); }); if (!usdLive || !cusAddr() || soldOut) return;"],
  // CARD-STORE-1 C5 — the invite step on the USD card road
  ["C5: the card road skips the invite step", "cardInviteGate(msg, btn).then(function (go) {", "Promise.resolve(true).then(function (go) {"],
  ["C5: a declined signature still buys", "if (go) { doUsdBuy(btn, msg, row, refresh); return; }", "{ doUsdBuy(btn, msg, row, refresh); return; }"],
  ["C5: a dead bot BLOCKS the purchase", "inviteSettled[key] = true; inviteNote(msg, B_INV_SOFT); msg.textContent = \"\";   // the service is down: buy on\n        return true;", "inviteSettled[key] = true; inviteNote(msg, B_INV_SOFT); msg.textContent = \"\";   // the service is down: buy on\n        return false;"],
  ["C5: a can't-apply refusal BLOCKS the purchase", "        msg.textContent = \"\";\n        return true;\n      }, function () {", "        msg.textContent = \"\";\n        return !(res && res.refused);\n      }, function () {"],
  ["C5: a Torana holder is prompted", "if (bal !== 0n) return true;                        // a Torana holder can't be bound: no prompt", ""],
  ["C5: the browser's memory ignored (already-bound wallets asked again)", "if (!r || r.done.indexOf(w) >= 0) return Promise.resolve(true);", "if (!r) return Promise.resolve(true);"],
  ["C5: prompts on the wrong network", "if (ws.connected && !ws.chainOk) return Promise.resolve(true);   // wrong network: never prompt — the buy stops at P25", ""],
  ["C5: no pen check before the prompt", "if (!sameWallet(me)) return true;                   // the pen moved under the read: don't sign for the wrong wallet", ""],
  ["C5: the DYC road takes the invite step", "  function doApproveThenSwap(ethers, btn, msg, row) {\n", "  function doApproveThenSwap(ethers, btn, msg, row) {\n    cardInviteGate(msg, btn);\n"],
  ["a rejection worded as a generic refusal", "if (/user rejected|denied|ACTION_REJECTED/i.test(s) || (e && e.code === 4001)) return U_CANCEL;", ""],
];

async function runMutants() {
  const src = fs.readFileSync(STORE_JS, "utf8");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cardusd-mut-"));
  let killed = 0;
  for (const m of MUTANTS) {
    const name = m[0], edits = Array.isArray(m[1]) ? m[1] : [[m[1], m[2]]];
    if (edits.some((e) => src.indexOf(e[0]) < 0)) { console.log("  ✖ MUTANT NOT APPLIED (source drifted): " + name); continue; }
    const f = path.join(dir, "store.js");
    fs.writeFileSync(f, edits.reduce((acc, e) => acc.replace(e[0], e[1]), src));
    const r = require("child_process").spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { DY_STORE_MUTANT: f, DY_MUTANTS: "" }), encoding: "utf8", timeout: 600000 });
    const red = r.status !== 0;
    if (red) killed++;
    console.log("  " + (red ? "✓ killed " : "✖ SURVIVED ") + name + (red ? "  (" + ((r.stdout || "").match(/✖ [^\n]+/) || ["exit " + r.status])[0].slice(0, 90) + ")" : ""));
  }
  console.log("\nMUTANTS — " + killed + "/" + MUTANTS.length + " killed");
  return killed === MUTANTS.length;
}

if (process.env.DY_STORE_MUTANT) {
  const orig = H.storePage;
  H.storePage = (c, p, o) => orig(c, p, Object.assign({}, o, { storeSrc: process.env.DY_STORE_MUTANT }));
}
main().then(async (f) => {
  let good = f === 0;
  if (good && process.env.DY_MUTANTS) { console.log("\n── the mutants ──"); good = await runMutants(); }
  process.exitCode = good ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}).catch((e) => { console.log("CRASH: " + (e && e.stack || e)); process.exitCode = 1; setTimeout(() => process.exit(1), 200); });
