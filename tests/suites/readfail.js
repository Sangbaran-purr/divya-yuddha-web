"use strict";
// RPC-CLEANUP-1 (owner ruling 2026-10-30, docs/READ_ROAD_v1.md §2) — THE FAILURE FACES. With no free public RPC behind
// our read proxy, a proxy that is down (or one read it refuses) is the page's plain, ruled sentence with a "Try again"
// button — never a silent hang, never a page reload. Each face below is driven on its REAL page, on its SHIPPED read
// endpoint (rpc.divyayuddha.games), which ethers' transport routes to a local stand-in proxy that forwards to anvil and
// can be switched DOWN (every call answers dy-rpc's own "upstream unavailable") or made to fail ONE function selector.
//
// For every face:  (1) the ruled sentence AND its Try again button appear within the face's time limit;
//                  (2) Try again RE-ATTEMPTS the read — the proxy is asked again — and, with the proxy back, the face
//                      recovers to its healthy content.
//   F1 dashboard · F2 store bundle tile · F3 Torana gate on the store tile · F4 card grid · F5 card market ·
//   F6 Treasury (your cards) · F7 Report · F8 Torana gate on the rite · F9 owner console (Torana claims)
//   (the Hall's staked-tier line is proven where its renderer lives: tests/suites/hallstake.js C1–C3 + E3)
const fs = require("fs");
const path = require("path");
const http = require("http");
const { ethers } = require("ethers");
const { JSDOM, VirtualConsole } = require("jsdom");
const H = require("../lib");

const SITE = H.SITE, RPC = H.RPC;
const DEC = 10n ** 18n, DEC6 = 10n ** 6n;
const S = {
  DASH: "We couldn't load this right now — try again.",
  STORE: "We couldn't load the store right now — try again.",
  MARKET: "We couldn't load the market right now — try again.",
  CARDS: "We couldn't load your cards right now — try again.",
  REPORT: "We couldn't load these figures right now — try again.",
  TORANA: "We couldn't check your Torana right now — try again.",
  CONSOLE: "The site's read proxy is busy or unreachable — try again in a moment.",
  TRY: "Try again",
};
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const T = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, " ") : ""; };
const sel = (sig) => ethers.id(sig).slice(0, 10);

// ── the stand-in proxy: forwards to anvil; DOWN answers dy-rpc's refusal to everything; failSel fails chosen eth_calls ──
function standIn() {
  const P = { calls: 0, down: false, failSel: new Set(), srv: null, url: null };
  const refuse = (m) => ({ jsonrpc: "2.0", id: m && m.id !== undefined ? m.id : null, error: { code: -32000, message: "upstream unavailable" } });
  P.srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", async () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      const items = Array.isArray(j) ? j : [j];
      P.calls += items.length;
      const failing = (m) => P.down || (m && m.method === "eth_call" && P.failSel.has(String(((m.params || [])[0] || {}).data || "").slice(0, 10)));
      if (items.every(failing)) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(Array.isArray(j) ? items.map(refuse) : refuse(j))); }
      const up = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: b }).then((x) => x.json()).catch(() => null);
      if (up == null) { res.writeHead(502); return res.end(); }
      const out = Array.isArray(j) ? up.map((a, i) => (failing(items[i]) ? refuse(items[i]) : a)) : up;
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out));
    });
  });
  return new Promise((r) => P.srv.listen(0, "127.0.0.1", () => { P.url = "http://127.0.0.1:" + P.srv.address().port; r(P); }));
}
// ethers' transport: the shipped proxy host → the stand-in; 127.0.0.1 passes; anything else is refused
const baseGetUrl = ethers.FetchRequest.createGetUrlFunc();
let PROXY_TO = null;
ethers.FetchRequest.registerGetUrl(async (req, signal) => {
  const u = new URL(req.url);
  if (u.hostname === "rpc.divyayuddha.games") {
    const r2 = new ethers.FetchRequest(PROXY_TO); r2.method = req.method; r2.body = req.body;
    for (const [k, v] of req) r2.setHeader(k, v);
    return baseGetUrl(r2, signal);
  }
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return baseGetUrl(req, signal);
  throw new Error("refused by the suite: " + u.host);
});

// ── the face law: the sentence + its button within `ms`; the button re-reads; the face recovers ──
async function face(name, P, w, o) {
  const t0 = Date.now();
  let shown = true;
  try { await H.until(() => o.text().indexOf(o.sentence) >= 0 && !!o.button(), o.ms, name + " sentence"); } catch (e) { shown = false; }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  ok(name + " · the ruled sentence \"" + o.sentence + "\" + its Try again button appear within " + o.ms / 1000 + " s (" + secs + " s)",
     shown && o.button() && /Try again/.test(o.button().textContent), o.text().slice(0, 240));
  if (!shown || !o.button()) { ok(name + " · Try again re-reads", false, "no button"); return; }
  P.down = false; P.failSel.clear();
  const before = P.calls;
  o.button().click();
  let healed = true;
  try { await H.until(() => P.calls > before && o.healthy(), o.healMs || 20000, name + " recovery"); } catch (e) { healed = false; }
  ok(name + " · Try again RE-ATTEMPTS the read (the proxy is asked again: " + (P.calls - before) + " calls) and the face recovers",
     healed && P.calls > before && o.text().indexOf(o.sentence) < 0, o.text().slice(0, 240));
}

function art(n, file) { const j = JSON.parse(fs.readFileSync(path.join(H.OUT, (file || n) + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
const F = (c, n) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, c.owner); };

// a page booted from its own html: the body markup, the listed scripts in order, then its inline boot
function bootPage(file, scripts, setup, inlineBoot) {
  const html = fs.readFileSync(path.join(SITE, file), "utf8");
  const body = (html.split(/<body[^>]*>/)[1] || "").split("</body>")[0].replace(/<script[\s\S]*?<\/script>/g, "");
  const vc = new VirtualConsole();
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url: "https://divyayuddha.games/" + file, pretendToBeVisual: true, runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window;
  w.ethers = ethers; w.TextEncoder = TextEncoder;
  w.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null), text: () => Promise.resolve("") });
  const run = (p) => w.eval(fs.readFileSync(path.join(SITE, p), "utf8"));
  run("config.js");
  setup(w, run);
  for (const s of scripts) run(s);
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  inlineBoot(w);
  return { dom, w };
}

async function run() {
  console.log("\n── RPC-CLEANUP-1 · the failure faces: the ruled sentence + Try again ──");
  await H.preflight();
  const P = await standIn();
  PROXY_TO = P.url;

  // ═══ F1 · the dashboard ═══
  {
    const c = await H.chainPresale();
    P.down = true;
    const h = await H.dashboardPage(c, c.player, { shippedRoads: true });
    await h.w.DYWallet.connect();
    await face("F1 dashboard", P, h.w, { sentence: S.DASH, ms: 15000,
      text: () => T(h.w, "#liq-note"), button: () => h.w.document.querySelector("#liq-note .try-again"),
      healthy: () => T(h.w, "#liq-note").indexOf(S.DASH) < 0 && T(h.w, "#liq-amt") !== "—" });
    H.teardown(h);
  }

  // ═══ F2 + F3 · the store's bundle tile: the stock line and the Torana gate ═══
  {
    const c = await H.chainStore();
    P.down = true;
    const h = await H.storePage(c, c.player, { shippedRoads: true });
    const tile = () => T(h.w, "#bundle-body");
    const btnAfter = (sentence) => () => Array.from(h.w.document.querySelectorAll("#bundle-body .try-again")).filter((b) => (b.parentNode.textContent || "").indexOf(sentence) >= 0)[0] || null;
    await face("F2 store bundle tile", P, h.w, { sentence: S.STORE, ms: 20000, text: tile, button: btnAfter(S.STORE),
      healthy: () => /In stock/.test(tile()) });
    H.teardown(h);
  }
  {
    // F3 — the Torana gate on the tile: a FRESH page where only the Torana read (balanceOf) is refused, the stock reads
    // land. (Once a tile has read, a failed refresh keeps the last reading — the never-read gate is this face.)
    const c = await H.chainStore();
    P.down = false; P.failSel = new Set([sel("balanceOf(address)")]);
    const h = await H.storePage(c, c.player, { shippedRoads: true });
    const tile = () => T(h.w, "#bundle-body");
    const btn = () => Array.from(h.w.document.querySelectorAll("#bundle-body .try-again")).filter((b) => (b.parentNode.textContent || "").indexOf(S.TORANA) >= 0)[0] || null;
    await face("F3 Torana gate (store)", P, h.w, { sentence: S.TORANA, ms: 20000, text: tile, button: btn,
      healthy: () => tile().indexOf(S.TORANA) < 0 && /In stock/.test(tile()) });
    H.teardown(h);
  }

  // ═══ F4 + F5 · the card grid and the market: ONE read refused (the store's / market's open flag) ═══
  {
    const c = await H.chainStore();
    const owner = await c.owner.getAddress();
    const nft = await F(c, "WaveCardNFT").deploy(owner, "ipfs://base/"); await nft.waitForDeployment();
    const sale = await F(c, "WaveCardSale").deploy(c.addrs.dyc, await nft.getAddress(), owner, owner); await sale.waitForDeployment();
    const market = await F(c, "WaveCardMarket").deploy(c.addrs.dyc, await nft.getAddress(), owner, owner); await market.waitForDeployment();
    await (await sale.setPrices([101, 102], [2000n * DEC, 3800n * DEC])).wait();
    await (await sale.setSupplyCaps([101, 102], [200, 70])).wait();
    await (await sale.setSalesOpen(true)).wait();
    await (await nft.setMinter(await sale.getAddress(), true)).wait();
    await (await nft.setMinter(owner, true)).wait();
    await (await market.setMarketsOpen(true)).wait();
    await (await nft.mint(c.player.address, 101)).wait();                       // the player's card #1 (card 101)
    const nP = nft.connect(c.player), mP = market.connect(c.player);
    const n0 = Number(await c.provider.send("eth_getTransactionCount", [c.player.address, "pending"]));   // raw: no cached nonce
    await (await nP.approve(await market.getAddress(), 1, { nonce: n0 })).wait();
    await (await mP.list(1, 1000n * DEC, { nonce: n0 + 1 })).wait();             // one live listing, so the market renders
    P.down = false; P.failSel = new Set([sel("salesOpen()")]);
    const h = await H.storePage(c, c.player, { shippedRoads: true, waveCardSale: await sale.getAddress(), waveCardMarket: await market.getAddress(), waveCardNFT: await nft.getAddress() });
    h.w.DY_CONFIG.marketDeployBlock = 1;
    await face("F4 card grid", P, h.w, { sentence: S.STORE, ms: 20000,
      text: () => T(h.w, "#st-buy-status"), button: () => h.w.document.querySelector("#st-buy-status .try-again"),
      healthy: () => /cards for sale/.test(T(h.w, "#st-buy-status")) });
    P.failSel = new Set([sel("marketsOpen()")]);
    h.w.document.getElementById("st-tab-market").click();
    await face("F5 card market", P, h.w, { sentence: S.MARKET, ms: 25000,
      text: () => T(h.w, "#st-market-status"), button: () => h.w.document.querySelector("#st-market-status .try-again"),
      healthy: () => /cards listed/.test(T(h.w, "#st-market-status")) });
    H.teardown(h);
  }

  // ═══ F6 · the Treasury: your cards ═══
  {
    const c = await H.chainStore();
    const owner = await c.owner.getAddress();
    const nft = await F(c, "WaveCardNFT").deploy(owner, "ipfs://base/"); await nft.waitForDeployment();
    await (await nft.setMinter(owner, true)).wait();
    await (await nft.mint(c.player.address, 102)).wait();
    P.down = true;
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const { w, dom } = bootPage("treasury.html", ["js/ornament.js", "js/light.js", "js/wallet.js", "js/cards.js", "js/wave-registry.js", "js/store.js", "js/treasury.js"],
      (w2) => {
        w2.ethereum = H.makeEthereum(c.player, c.provider);
        w2.DY_CONFIG.chain.id = chainId; w2.DY_CONFIG.chain.idHex = "0x" + chainId.toString(16);
        w2.DY_CONFIG.contracts.accessNFT = c.addrs.nft; w2.DY_CONFIG.contracts.waveCardNFT = nft.target; w2.DY_CONFIG.contracts.dycoin = c.addrs.dyc;
        w2.DY_CONFIG.contracts.waveCardSale = null; w2.DY_CONFIG.contracts.waveCardMarket = null; w2.DY_CONFIG.contracts.cardUsdStore = null;
        w2.DY_CONFIG.deployBlock = 1;
      },
      (w2) => { w2.DYTreasury.mount(); w2.DYWallet.init(); });
    await w.DYWallet.connect();
    const hallEl = () => w.document.querySelector(".hall-empty, #tre-hall, .tre-hall") || w.document.body;
    await face("F6 Treasury (your cards)", P, w, { sentence: S.CARDS, ms: 25000,
      text: () => (w.document.body.textContent || "").replace(/\s+/g, " "), button: () => w.document.getElementById("tre-try-again"),
      healthy: () => (w.document.body.textContent || "").indexOf(S.CARDS) < 0 && !/Reading your hall/.test(w.document.body.textContent || "") });
    void hallEl; dom.window.close();
  }

  // ═══ F7 · the Report ═══
  {
    const c = await H.chainPresale();
    P.down = true;
    const { w, dom } = bootPage("report.html", ["mf-config.js", "js/wallet.js", "js/report.js"],
      (w2) => { w2.DY_CONFIG.chain.id = 31337; },
      (w2) => {
        Object.assign(w2.DY_MF_CONFIG.contracts, { dycoinSale: c.addrs.sale, vestingVault: c.addrs.vault, holderStaking: null, roiRedemption: null, dycoin: c.addrs.dyc });
        w2.DYReport.mount();
      });
    await face("F7 Report", P, w, { sentence: S.REPORT, ms: 20000,
      text: () => T(w, "#sale-body"), button: () => w.document.querySelector("#sale-body .try-again"),
      healthy: () => T(w, "#sale-body").indexOf(S.REPORT) < 0 && /Raised|round|Round/.test(T(w, "#sale-body")) });
    dom.window.close();
  }

  // ═══ F8 · the Torana gate on the rite ═══
  {
    const c = await H.chainStore();
    P.down = true;
    const h = await H.ritePage(c, c.player, { shippedRoads: true });
    await face("F8 Torana gate (rite)", P, h.w, { sentence: S.TORANA, ms: 20000,
      text: () => T(h.w, "#rite-msg") + " " + T(h.w, "#rite-line"), button: () => h.w.document.getElementById("rite-reread"),
      healthy: () => T(h.w, "#rite-msg").indexOf(S.TORANA) < 0 });
    H.teardown(h);
  }

  // ═══ F9 · the owner console: Torana claims ═══
  {
    const c = await H.chainPresale();
    const nft = await F(c, "AccessNFT").deploy(c.addrs.owner, "ipfs://torana/"); await nft.waitForDeployment();
    const claim = await F(c, "ToranaIcoClaim").deploy(c.addrs.sale, await nft.getAddress()); await claim.waitForDeployment();
    P.down = true;
    const errs = [];
    const vc = new VirtualConsole(); vc.on("jsdomError", (e) => errs.push(String(e && e.message)));
    const html = fs.readFileSync(path.join(SITE, "admin.html"), "utf8");
    const scripts = [];
    const markup = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (m, attrs) => { const src = /\bsrc="([^"?]+)/.exec(attrs); if (src && !/^https?:/.test(src[1])) scripts.push(fs.readFileSync(path.join(SITE, src[1]), "utf8")); return ""; });
    const dom = new JSDOM(markup, { url: "https://divyayuddha.games/admin.html", runScripts: "outside-only", virtualConsole: vc });
    const w = dom.window;
    w.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.fetch = () => Promise.reject(new Error("no fetch"));
    w.ethers = ethers; w.ethereum = H.makeEthereum(c.player, c.provider);
    w.eval(scripts.join("\n;\n"));
    w.DYWallet.loadEthers = () => Promise.resolve(ethers);
    w.DY_CONFIG.chain.id = Number((await c.provider.getNetwork()).chainId);
    w.localStorage.setItem("dyadmin::config", JSON.stringify({ deployBlock: 1, dycoinSale: c.addrs.sale, toranaClaim: await claim.getAddress() }));
    w.DYAdmin._road.toranaFindEligible();
    await face("F9 console (Torana claims)", P, w, { sentence: S.CONSOLE, ms: 30000,
      text: () => T(w, "#torana-status"), button: () => w.document.getElementById("torana-try-again"),
      healthy: () => /Read complete/.test(T(w, "#torana-status")), healMs: 30000 });
    dom.window.close();
  }

  // ═══ M · deliberate breakage: Try again wired to nothing → the re-read check goes red ═══
  // Measured with the proxy still DOWN and only after the dashboard's own background retries are spent (~17 s), so the
  // only thing that can ask the proxy is the click. The control (the real code) asks; the mutant does not.
  async function clickReads(dashSrc) {
    const c = await H.chainPresale();
    P.down = true; P.failSel.clear();
    const h = await H.dashboardPage(c, c.player, { shippedRoads: true, dashSrc });
    await h.w.DYWallet.connect();
    let shown = true;
    try { await H.until(() => !!h.w.document.querySelector("#liq-note .try-again"), 15000, "button"); } catch (e) { shown = false; }
    await H.sleep(19000);                                   // the five background retries (1.2 → 5 s apart) are spent
    const before = P.calls;
    const b = h.w.document.querySelector("#liq-note .try-again");
    if (b) b.click();
    await H.sleep(2000);
    const n = P.calls - before;
    H.teardown(h);
    return { shown: shown && !!b, n };
  }
  {
    const src = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8");
    const a = "a.onclick = function (e) { e.preventDefault(); readRetry = 0; readTrouble = false; resetReadProvider(); refresh(); };";
    if (src.split(a).length !== 2) ok("M1 · the Try again wiring was found", false);
    else {
      const ctl = await clickReads(null);
      ok("M0 · control: with the real wiring, a click on Try again (proxy still down, background retries spent) asks the proxy (" + ctl.n + " calls)", ctl.shown && ctl.n > 0);
      const mut = await clickReads(src.replace(a, "a.onclick = function (e) { e.preventDefault(); };"));
      ok("M1 · Try again wired to NOTHING — CAUGHT: the click makes no read (" + mut.n + " calls)", mut.shown && mut.n === 0);
    }
  }

  P.srv.close();
  ethers.FetchRequest.registerGetUrl(baseGetUrl);
  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("readfail suite crashed:", e); process.exit(1); });
