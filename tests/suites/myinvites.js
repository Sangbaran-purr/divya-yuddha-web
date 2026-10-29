"use strict";
// MY-INVITES-1 — the affiliate's own page (my-invites.html), proven against the REAL bot over a REAL chain.
//
// The chain is anvil carrying the REAL contracts the live page's numbers come from: PlayStore (bundles + top-ups) and
// AccessNFT, WaveCardNFT + WaveCardSale (DYC card buys) + WaveCardUsdSale (USD cards; its two tokens planted at their
// hard-coded Polygon addresses). The bot is the REAL web3 code — its store, its deriver (the ledger that signs desk
// coupons) and its service (/invites/mine) — run in-process; the page's fetch is routed to service.mine. On that chain
// the suite builds a tree: a root, a straight chain seven deep (each bound, then a bundle), USD cards at two depths, a
// TOP-UP, a DYC CARD BUY and a LATE JOIN. Then the page is read under v1 and v2 and every number on it is compared with
// the ledger the desk pays from.
//
//   node tests/suites/myinvites.js                (the runner gives it its own anvil via DY_RPC)
//   DY_MUTANTS=1 node tests/suites/myinvites.js   (also runs every mutant of js/myinvites.js; each must turn red)
//   DY_MI_SNAPSHOT=<dir>                          (writes the rendered v1 and v2 pages there, for a screenshot)
const fs = require("fs"), path = require("path"), os = require("os");
const { ethers } = require("ethers");
const H = require("../lib.js");
const DEC = 1000000000000000000n, DEC6 = 1000000n;
const RPC = process.env.DY_RPC || "http://127.0.0.1:8545";
const BOT = path.join(H.W3, "services", "approval-bot", "src");
const { makeInvitesStore, makeMemoryInvitesSource } = require(path.join(BOT, "invites", "store.js"));
const { makeInvitesService } = require(path.join(BOT, "invites", "service.js"));
const { makeInvitesDeriver } = require(path.join(BOT, "winnings", "invites.js"));
const { makeMemoryCheckpoint } = require(path.join(BOT, "winnings", "checkpoint.js"));
const codes = require(path.join(BOT, "invites", "codes.js"));
const MASTER = "0xbab57f595b80318A79006Cd1f6Fde11464AaF86e";
const USDT0 = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const PAGE_JS = path.join(H.SITE, "js", "myinvites.js");

// ── the ruled lines (DASHBOARD_DESIGN_v1 §13), quoted so a drift shows here too ──
const MI_SIGN = "Sign a free message to show your invites. It moves no money and works once.";
const MI_DOWN = "Your invites can't be read right now - nothing is lost. Try again in a moment.";
const MI_DECLINED = "Nothing was shown - the message is free and moves no money. Tap Show my invites to try again.";
const MI_CLOSED = "My Invites is not open yet.";
const MI_COUNTS_V1 = "Counts only purchases that pay: a friend's first bundle, bought after they joined you. Top-ups and card buys never pay.";
const MI_COUNTS_V2 = "Counts only purchases that pay: a first bundle or a USD card, bought after the buyer joined. Top-ups and DYC card buys never pay.";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : "")));
  if (!c && process.env.DY_PAGE_MUTANT) process.exit(1);   // a mutant is killed by its first red check
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
function art(n, file) { const j = JSON.parse(fs.readFileSync(path.join(H.OUT, (file || n) + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object, runtime: j.deployedBytecode.object }; }
const short = (a) => { const s = ethers.getAddress(a); return s.slice(0, 6) + "…" + s.slice(-4); };
const usd = (wei) => "USD " + (Number(BigInt(wei) / 125000000000000n) / 1e6).toFixed(2);

async function main() {
  const miss = H.preflight();
  ["WaveCardNFT", "WaveCardSale", "WaveCardUsdSale"].forEach((n) => { if (!fs.existsSync(path.join(H.OUT, n + ".sol", n + ".json"))) miss.push("  MISSING: " + n + " artifact"); });
  if (miss.length) { console.log("PREFLIGHT FAILED:\n" + miss.join("\n")); process.exit(1); }
  // ── the site's view message is the bot's, byte for byte (js/invite.js is the ONE place the site builds it) ──
  console.log("\n── F · the view message ──");
  {
    const sandbox = { window: { ethers: ethers }, Date: Date };
    require("vm").createContext(sandbox);
    require("vm").runInContext(fs.readFileSync(path.join(H.SITE, "js", "invite.js"), "utf8"), sandbox);
    const S = sandbox.window.DYInvite, wl = ethers.Wallet.createRandom(), T = 1760000000;
    const norm = (td) => JSON.stringify({ d: Object.assign({}, td.domain, { chainId: String(td.domain.chainId) }), t: td.types, p: td.primaryType, m: Object.assign({}, td.message, { wallet: String(td.message.wallet).toLowerCase(), issuedAt: String(td.message.issuedAt) }) });
    ok("F1 · the site's MyInvitesView typed data EQUALS the bot's (domain, types, primary type, message)",
       S.VIEW_STATEMENT === codes.VIEW_STATEMENT && norm(S.viewRequestTypedData(137, wl.address.toLowerCase(), T, ethers)) === norm(codes.viewRequestTypedData(137, wl.address, T)));
    const td = S.viewRequestTypedData(137, wl.address, T, ethers);
    const v = codes.verifyViewRequest(137, { wallet: wl.address, issuedAt: T, signature: await wl.signTypedData(td.domain, td.types, td.message) });
    ok("F2 · a view signed from the SITE's typed data passes the BOT's verifier", v.ok && v.wallet === wl.address);
  }
  const provider0 = new ethers.JsonRpcProvider(RPC);
  await provider0.send("anvil_reset", []);

  // ══════════ THE CHAIN ══════════
  const c = await H.chainStore();
  const p = c.provider;
  await p.send("anvil_setCode", [USDT0, art("MockStableVoid", "PlayStoreMocks").runtime]);
  await p.send("anvil_setCode", [USDC, art("MockStable").runtime]);
  await p.send("anvil_impersonateAccount", [MASTER]);
  await p.send("anvil_setBalance", [MASTER, "0x" + (100n * DEC).toString(16)]);
  const master = await p.getSigner(MASTER);
  const F = (n) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, c.owner); };
  const wnft = await F("WaveCardNFT").deploy(MASTER, "ipfs://base/"); await wnft.waitForDeployment();
  const sale = await F("WaveCardSale").deploy(c.addrs.dyc, await wnft.getAddress(), MASTER, MASTER); await sale.waitForDeployment();
  const store = await F("WaveCardUsdSale").deploy(await sale.getAddress()); await store.waitForDeployment();
  // the LIVE mainnet prices for these ids (101 Deva Sainika 2,000 · 102 Agneyastra 3,800 · 103 Airavata's Calf 3,800 DYC)
  await (await sale.connect(master).setPrices([101, 102, 103], [2000n * DEC, 3800n * DEC, 3800n * DEC])).wait();
  await (await sale.connect(master).setSupplyCaps([101, 102, 103], [100, 100, 100])).wait();
  await (await sale.connect(master).setSalesOpen(true)).wait();
  await (await wnft.connect(master).setMinter(await sale.getAddress(), true)).wait();
  await (await wnft.connect(master).setMinter(await store.getAddress(), true)).wait();
  await (await store.connect(master).setOpen(true)).wait();
  const storeAddr = await store.getAddress(), saleAddr = await sale.getAddress();
  const stable = new ethers.Contract(USDC, art("MockStable").abi, c.owner);

  // ══════════ THE REAL BOT ══════════
  let chainMs = Number((await p.getBlock("latest")).timestamp) * 1000;
  const sync = async () => { chainMs = Number((await p.getBlock("latest")).timestamp) * 1000; };
  const mine = async (n, secs) => { if (secs) await p.send("evm_increaseTime", [secs]); await p.send("anvil_mine", ["0x" + n.toString(16)]); await sync(); };
  const invStore = makeInvitesStore({ chainId: Number((await p.getNetwork()).chainId), source: makeMemoryInvitesSource({}), clock: { now: () => chainMs }, log: () => {} });
  await invStore.load();
  const CHAIN = Number((await p.getNetwork()).chainId);
  const deriver = (scheme) => makeInvitesDeriver({ playStore: { address: c.addrs.ps, deployBlock: 0 }, accessNft: { address: c.addrs.nft, deployBlock: 0 },
    stateProvider: p, archive: p, checkpoint: makeMemoryCheckpoint({}), clock: { now: () => chainMs }, maxRetries: 0, log: () => {},
    scheme, v2FromBlock: scheme === "v2" ? 1 : undefined, presaleIds: [], cardStore: { address: storeAddr, deployBlock: 0 } });
  const deskPaid = new Map();
  // the page's service: freshness/replay on REAL time (the page signs with Date.now()); the ledger on CHAIN time
  const svcFor = (scheme, realClock) => makeInvitesService({ store: invStore, deriver: deriver(scheme), chainId: CHAIN,
    clock: realClock ? { now: () => Date.now() } : { now: () => chainMs }, log: () => {},
    toranaBalanceOf: (w) => c.nft.balanceOf(w), headNumber: () => p.getBlockNumber(), deskInvitePaid: async (w) => deskPaid.get(w.toLowerCase()) || 0n });

  // ══════════ THE TREE ══════════
  const pW = new ethers.JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });   // no nonce cache: back-to-back sends
  const wallet = async () => { const w = ethers.Wallet.createRandom().connect(pW); await p.send("anvil_setBalance", [w.address, "0x" + (100n * DEC).toString(16)]);
    await (await c.usdc.mint(w.address, 200n * DEC6)).wait(); await (await stable.mint(w.address, 200n * DEC6)).wait();
    await (await c.usdc.connect(w).approve(c.addrs.ps, ethers.MaxUint256)).wait(); await (await stable.connect(w).approve(storeAddr, ethers.MaxUint256)).wait(); return w; };
  const bundle = async (w) => (await c.ps.connect(w).buyBundle(c.addrs.usdc)).wait();
  const card = async (w, id) => (await store.connect(w).buy(id, USDC)).wait();
  const codeOf = {};
  const issue = async (w) => { const t = Math.floor(chainMs / 1000), td = codes.codeRequestTypedData(CHAIN, w.address, t);
    const r = await svcFor("v1").issueCode({ wallet: w.address, issuedAt: t, signature: await w.signTypedData(td.domain, td.types, td.message) }); codeOf[w.address] = r.code; return r; };
  const bind = async (w, code) => { const t = Math.floor(chainMs / 1000), td = codes.bindingTypedData(CHAIN, w.address, code, t);
    return svcFor("v1").bind({ buyer: w.address, code, signedAt: t, signature: await w.signTypedData(td.domain, td.types, td.message) }); };
  const W = [];
  for (let i = 0; i < 8; i++) W.push(await wallet());
  await sync(); await bundle(W[0]); await mine(1, 2); const i0 = await issue(W[0]);
  let bindsOk = !!i0.ok;
  for (let i = 1; i < 8; i++) {
    await mine(1, 2); const b = await bind(W[i], codeOf[W[i - 1].address]); bindsOk = bindsOk && b.ok;
    await mine(1, 2); await bundle(W[i]); await mine(1, 2); bindsOk = bindsOk && (await issue(W[i])).ok;
  }
  await mine(1, 2); await card(W[1], 101);                                   // W1: USD 20 card
  await mine(1, 8 * 86400);                                                    // a week+ passes: everything so far unlocks
  await (await c.ps.connect(W[2]).topUp(c.addrs.usdc, 1)).wait();            // W2: a TOP-UP (never pays)
  await (await c.dyc.mint(W[3].address, 2000n * DEC)).wait();
  await (await c.dyc.connect(W[3]).approve(saleAddr, ethers.MaxUint256)).wait();
  await (await sale.connect(W[3]).buy(101)).wait();                          // W3: a DYC CARD BUY (never pays)
  await mine(1, 2); await card(W[4], 102);                                   // W4: USD 38 card (pending)
  const LJ = await wallet();
  await mine(1, 2); await bundle(LJ);                                          // LJ bought a bundle UNBOUND…
  await mine(1, 2); const bLJ = await bind(LJ, codeOf[W[0].address]);         // …then joined W0 LATE…
  await mine(1, 2); await card(LJ, 101);                                     // …then a USD 20 card, Deva Sainika (pending)
  await mine(140, 2);                                                          // past the deriver's head buffer
  deskPaid.set(W[0].address.toLowerCase(), 100n * DEC);                       // the desk has paid W0 100 DYC

  console.log("\n── T · the tree on chain ──");
  ok("T1 · the tree was built through the REAL bind road: W1..W7 bound in a line under W0, LJ late-joined W0", bindsOk && bLJ.ok, JSON.stringify(bLJ));

  // ══════════ THE PAGE ══════════
  const responses = [];
  const page = async (who, scheme, opts) => {
    opts = opts || {};
    const svc = svcFor(scheme, true);
    const h = await H.myInvitesPage(c, who, Object.assign({ svc: { "/invites/mine": (init) => svc.mine(JSON.parse(init.body)).then((r) => { responses.push({ scheme, r, body: JSON.parse(init.body), svc }); return r; }) } },
      opts, process.env.DY_PAGE_MUTANT ? { pageSrc: process.env.DY_PAGE_MUTANT } : {}));
    await waitFor("wallet provider", () => h.w.DYWallet.state.hasProvider);
    await h.w.DYWallet.connect();
    await waitFor("connected", () => h.w.DYWallet.state.connected && h.w.DYWallet.state.chainOk);
    return h;
  };
  const q = (w, sel) => w.document.querySelector(sel);
  const cell = (w, lv, k) => { const e = q(w, "#mi-levels tr[data-level='" + lv + "'] td[data-k='" + k + "']"); return e ? (e.getAttribute("data-wei") || e.getAttribute("data-e6") || e.textContent.trim()) : null; };
  const mval = (w, k) => { const e = q(w, "#mi-money .mi-m[data-k='" + k + "']"); return e ? e.getAttribute("data-wei") : null; };
  const show = async (h) => { await waitFor("the Show button", () => q(h.w, "#mi-show")); q(h.w, "#mi-show").click(); await waitFor("the page drawn", () => q(h.w, "#mi-levels") || q(h.w, "#mi-err"), 30000); };
  const typed = (eth) => eth.__calls.filter((m) => m === "eth_signTypedData_v4").length;
  const HEX40 = /0x[0-9a-fA-F]{40}/;
  const deeper = W.slice(2);

  for (const scheme of ["v1", "v2"]) {
    console.log("\n── " + scheme.toUpperCase() + " · W0's page against the ledger ──");
    const h = await page(W[0], scheme);
    const w = h.w;
    await waitFor("the sign prompt", () => q(w, "#mi-show"));
    ok("P1-" + scheme + " · the page asks NOTHING on load: one plain sign line and a Show button, no wallet prompt yet",
       typed(h.eth) === 0 && w.document.body.textContent.indexOf(MI_SIGN) >= 0 && !q(w, "#mi-levels"));
    await show(h);
    const resp = responses[responses.length - 1];
    const led = await deriver(scheme).derive(invStore.snapshot());
    const me = W[0].address.toLowerCase();
    const mineL = led.items.filter((x) => x.affiliate === me);
    const sum = (f) => mineL.filter(f).reduce((s2, x) => s2 + BigInt(x.reward), 0n);
    ok("P2-" + scheme + " · one signature, one bot call, the bot's scheme on the page", typed(h.eth) === 1 && resp && resp.r.ok && resp.r.scheme === scheme);
    // ── the levels, exactly the ledger ──
    const levels = scheme === "v1" ? [1] : [1, 2, 3, 4, 5, 6];
    const rows = Array.from(w.document.querySelectorAll("#mi-levels tbody tr[data-level]")).map((r) => r.getAttribute("data-level"));
    ok("L1-" + scheme + " · the level table has exactly the levels " + scheme + " pays (" + levels.join(",") + ") + a total", JSON.stringify(rows) === JSON.stringify(levels.map(String).concat(["total"])), JSON.stringify(rows));
    let allMatch = true, detail = [];
    for (const lv of levels) {
      const mineLv = mineL.filter((x) => (scheme === "v1" ? 1 : x.level) === lv && x.kind !== "bonus");
      const want = { bundles: String(mineLv.filter((x) => x.kind !== "card").length), cards: String(mineLv.filter((x) => x.kind === "card").length),
        earned: String(mineLv.reduce((s2, x) => s2 + BigInt(x.reward), 0n)) };
      const got = { bundles: cell(w, lv, "bundles"), cards: cell(w, lv, "cards"), earned: cell(w, lv, "earned") };
      if (JSON.stringify(want) !== JSON.stringify(got)) { allMatch = false; detail.push(lv + ":" + JSON.stringify([want, got])); }
    }
    ok("L2-" + scheme + " · EVERY level's bundles, cards and earnings are the ledger's own rows for W0", allMatch, detail.join(" | "));
    if (scheme === "v1") {
      ok("L3-v1 · by hand: L1 = W1 and LJ (2 people), ONE paying bundle (W1's; LJ's came before it joined), 0 cards, USD 20 sold, 10%, USD 2.00 earned",
         cell(w, 1, "people") === "2" && cell(w, 1, "bundles") === "1" && cell(w, 1, "cards") === "0" && cell(w, 1, "sales") === "20000000"
           && cell(w, 1, "rate") === "10%" && cell(w, 1, "earned") === String(250n * DEC), JSON.stringify([1, "people", "bundles", "cards", "sales", "rate", "earned"].map((k) => k === 1 ? 1 : cell(w, 1, k))));
    } else {
      ok("L3-v2 · by hand: L1 2 people · 1 bundle + 2 cards (W1's USD 20, LJ's USD 20 after joining) · USD 60 · 5% · 375 DYC; L4 = W4's bundle 25 + its USD 38 card at 1% = 47.5 (USD 58, 72.5 DYC); L2/L3/L5/L6 one bundle each at 1%",
         cell(w, 1, "people") === "2" && cell(w, 1, "bundles") === "1" && cell(w, 1, "cards") === "2" && cell(w, 1, "sales") === "60000000" && cell(w, 1, "rate") === "5%" && cell(w, 1, "earned") === String(375n * DEC)
           && cell(w, 4, "bundles") === "1" && cell(w, 4, "cards") === "1" && cell(w, 4, "sales") === "58000000" && cell(w, 4, "earned") === String(725n * DEC / 10n)
           && [2, 3, 5, 6].every((lv) => cell(w, lv, "people") === "1" && cell(w, lv, "bundles") === "1" && cell(w, lv, "cards") === "0" && cell(w, lv, "rate") === "1%" && cell(w, lv, "earned") === String(25n * DEC)),
         JSON.stringify([1, 2, 3, 4, 5, 6].map((lv) => [lv, cell(w, lv, "people"), cell(w, lv, "bundles"), cell(w, lv, "cards"), cell(w, lv, "sales"), cell(w, lv, "earned")])));
    }
    ok("L4-" + scheme + " · the TOP-UP and the DYC CARD BUY appear nowhere (W2 still 1 bundle at its level, W3's card is not a card row), and the 7th level's bundle is not on the page",
       !mineL.some((x) => x.kind === "card" && x.buyer === W[3].address.toLowerCase()) && (scheme === "v1" || (cell(w, 2, "bundles") === "1" && cell(w, 3, "cards") === "0")) && !q(w, "#mi-levels tr[data-level='7']"));
    ok("L5-" + scheme + " · the total row adds up the rows; the one-line 'counts only…' rule sits under the table",
       cell(w, "total", "earned") === String(sum((x) => x.kind !== "bonus") + sum((x) => x.kind === "bonus")) && !!q(w, "#mi-counts") && q(w, "#mi-counts").textContent === (scheme === "v1" ? MI_COUNTS_V1 : MI_COUNTS_V2));
    // ── the money, exactly the ledger and the desk ──
    const cum = led.cumulative.get(me) || 0n;
    ok("M1-" + scheme + " · Earned total = Σ the ledger's rewards for W0; Unlocked (ready) = the ledger's unlocked entitlement − the desk's 100 DYC; Withdrawn = 100 DYC",
       mval(w, "earned") === String(sum(() => true)) && mval(w, "ready") === String(cum - 100n * DEC) && mval(w, "withdrawn") === String(100n * DEC),
       JSON.stringify([mval(w, "earned"), mval(w, "ready"), String(cum)]));
    ok("M2-" + scheme + " · Pending = the ledger's pending rows, each listed with its unlock date",
       mval(w, "pending") === String(sum((x) => x.status === "pending")) && w.document.querySelectorAll("#mi-money .mi-pend li").length === mineL.filter((x) => x.status === "pending").length);
    if (scheme === "v1") {
      ok("M3-v1 · v1 by hand: earned USD 2.00, ready USD 1.20, withdrawn USD 0.80, nothing pending; NO 'locked' line and NO bonus section under v1",
         mval(w, "earned") === String(250n * DEC) && mval(w, "ready") === String(150n * DEC) && mval(w, "pending") === "0" && !q(w, ".mi-m[data-k='locked']") && !q(w, "#mi-week") && w.document.body.textContent.indexOf("This week's bonus") < 0);
    } else {
      ok("M3-v2 · v2 by hand: earned 547.5 DYC (USD 4.38), pending 172.5 (LJ's card 125 + W4's card 47.5), ready 375 − 100 = 275; the 'Locked until you own a Torana' line and the bonus section are shown",
         mval(w, "earned") === String(5475n * DEC / 10n) && mval(w, "pending") === String(1725n * DEC / 10n) && mval(w, "ready") === String(275n * DEC)
           && !!q(w, ".mi-m[data-k='locked']") && !!q(w, "#mi-week") && q(w, "#mi-week").getAttribute("data-count") === String(led.week.progress.get(me) || 0),
         JSON.stringify([mval(w, "earned"), mval(w, "pending"), mval(w, "ready")]));
    }
    const shownUsd = (sel) => { const e = q(w, sel + " .mi-usd"); return e ? e.textContent : null; };
    ok("M6-" + scheme + " · the USD a player READS is the ledger's amount at 125 DYC per USD (earned, ready, withdrawn, and the L1 row)",
       shownUsd("#mi-money .mi-m[data-k='earned']") === usd(sum(() => true)) && shownUsd("#mi-money .mi-m[data-k='ready']") === usd(cum - 100n * DEC)
         && shownUsd("#mi-money .mi-m[data-k='withdrawn']") === "USD 0.80" && shownUsd("#mi-levels tr[data-level='1'] td[data-k='earned']") === usd(cell(w, 1, "earned")),
       JSON.stringify([shownUsd("#mi-money .mi-m[data-k='earned']"), usd(sum(() => true))]));
    ok("M4-" + scheme + " · the page can never show more than the desk will pay: ready ≤ the ledger's unlocked entitlement", BigInt(mval(w, "ready")) <= cum);
    ok("M5-" + scheme + " · the Withdraw button is the dashboard's one Withdraw card", q(w, "#mi-withdraw") && q(w, "#mi-withdraw").getAttribute("href") === "dashboard.html#winnings-panel");
    ok("M7-" + scheme + " · something is ready, so the Withdraw button is the site's normal ACTIVE primary button (btn-g btn-p, as the dashboard's Claim), not dimmed",
       q(w, "#mi-withdraw").classList.contains("btn-g") && q(w, "#mi-withdraw").classList.contains("btn-p") && !q(w, "#mi-withdraw").classList.contains("mi-off") && !q(w, "#mi-withdraw").getAttribute("aria-disabled"));
    ok("C1-" + scheme + " · the invitees column reads 'What they bought'", Array.from(w.document.querySelectorAll("#mi-direct thead th")).map((x) => x.textContent).indexOf("What they bought") >= 0);
    if (scheme === "v2") ok("B1-v2 · the whole bonus ladder sits under the count, word for word; nothing highlighted at " + (led.week.progress.get(me) || 0) + " this week",
       q(w, "#mi-ladder") && q(w, "#mi-ladder").textContent === "20 bundles → USD 40 · 50 → USD 100 · 100 → USD 200 · 200 → USD 400 (highest tier reached only)" && !q(w, "#mi-ladder .mi-tier.on"),
       q(w, "#mi-ladder") && q(w, "#mi-ladder").textContent);
    // ── invitees and history ──
    const direct = Array.from(w.document.querySelectorAll("#mi-direct tbody tr")).map((r) => r.querySelector("td[data-k='wallet']").textContent);
    ok("D1-" + scheme + " · My direct invitees = W1 and LJ, SHORTENED (0xAbCd…1234), oldest first", JSON.stringify(direct) === JSON.stringify([short(W[1].address), short(LJ.address)]), JSON.stringify(direct));
    const ljRow = Array.from(w.document.querySelectorAll("#mi-direct tbody tr"))[1];
    ok("D2-" + scheme + " · LJ (late join) shows what PAYS: " + (scheme === "v1" ? "nothing (its bundle came before joining; v1 never pays cards)" : "its card only, by name, 125 DYC"),
       scheme === "v1" ? /nothing that pays yet/.test(ljRow.textContent) && ljRow.querySelector("td[data-k='earned']").getAttribute("data-wei") === "0"
         : /1 card \(/.test(ljRow.textContent) && !/bundle/.test(ljRow.querySelector("td[data-k='bought']").textContent) && ljRow.querySelector("td[data-k='earned']").getAttribute("data-wei") === String(125n * DEC), ljRow.textContent);
    const hist = Array.from(w.document.querySelectorAll("#mi-history tbody tr"));
    ok("H1-" + scheme + " · History has one row per ledger reward for W0 (" + mineL.length + "), amounts summing to the earned total",
       hist.length === mineL.length && hist.reduce((s2, r) => s2 + BigInt(r.querySelector("td[data-k='amount']").getAttribute("data-wei")), 0n) === sum(() => true));
    ok("H2-" + scheme + " · statuses read in words: 'withdrawn' / 'unlocked' / 'pending until <date>'",
       hist.every((r) => /^(withdrawn|unlocked( \(USD [0-9.]+ withdrawn\))?|pending until .+|locked|held for review)$/.test(r.querySelector("td[data-k='status']").textContent))
         && (scheme === "v1" || hist.some((r) => /^pending until /.test(r.querySelector("td[data-k='status']").textContent))));
    // ── privacy ──
    const html = w.document.body.innerHTML, json = JSON.stringify(resp.r);
    ok("X1-" + scheme + " · PRIVACY: no full wallet address anywhere — not in the bot's answer, not in the page", !HEX40.test(json) && !HEX40.test(html.replace(/https:\/\/divyayuddha\.games\/store\.html\?invite=[^"' ]+/, "")));
    ok("X2-" + scheme + " · PRIVACY: no level-2..7 wallet in ANY form (not even shortened) in the answer or the page",
       deeper.every((d) => json.indexOf(d.address.slice(0, 6)) < 0 && html.indexOf(d.address.slice(0, 6)) < 0 && html.indexOf(short(d.address)) < 0));
    ok("X3-" + scheme + " · NO REPLAY: the exact request the page sent, presented again, is refused", (await resp.svc.mine(resp.body)).refused === "REPLAYED");
    if (process.env.DY_MI_SNAPSHOT) {
      const dir = process.env.DY_MI_SNAPSHOT; fs.mkdirSync(dir, { recursive: true });
      const src = fs.readFileSync(path.join(H.SITE, "my-invites.html"), "utf8");
      const out = src.replace(/<div class="panel-box mi-panel" id="mi-root"><\/div>/, "<div class=\"panel-box mi-panel\" id=\"mi-root\">" + q(w, "#mi-root").innerHTML + "</div>")
        .replace(/<script src="js\/[^"]+"><\/script>/g, "").replace(/<script>\s*window\.DYMyInvites[\s\S]*?<\/script>/, "");
      fs.writeFileSync(path.join(dir, "myinvites-" + scheme + ".html"), out);
    }
    H.teardown(h);
  }

  console.log("\n── N · card names are the store's ──");
  {
    // every live card id: the page's name for it IS the store page's name for it (its own resolveCard)
    const hs = await H.storePage(c, c.player, { waveCardSale: null });
    const hp = await page(W[0], "v1");
    const live = hs.w.DY_WAVE_REGISTRY.list().filter((x) => x.status === "live");
    const off = live.filter((x) => hp.w.DYMyInvites._cardName(x.cardId) !== hs.w.DYStore.resolveCard(x.cardId).name).map((x) => x.cardId + ":" + hp.w.DYMyInvites._cardName(x.cardId) + "≠" + hs.w.DYStore.resolveCard(x.cardId).name);
    ok("N1 · all " + live.length + " live card ids: the page's name for the id = the store page's resolveCard name for it", live.length >= 87 && off.length === 0, off.join(" | "));
    ok("N2 · and an unknown id never borrows a neighbour's name ('Card #999')", hp.w.DYMyInvites._cardName(999) === "Card #999");
    H.teardown(hs); H.teardown(hp);
  }
  {
    // the bot's answer drives the ladder's highlight: step 50 reached → that step, and only it, is highlighted
    const ans = { ok: true, scheme: "v2", code: "ABCDEFGH", inviter: null, levels: [1, 2, 3, 4, 5, 6].map((lv) => ({ level: lv, people: 0, bundles: 0, cards: 0, salesUsdE6: "0", ratePct: lv === 1 ? 5 : 1, earnedWei: "0" })),
      money: { earnedWei: "0", readyWei: "0", withdrawnWei: "0", pendingWei: "0", pending: [], lockedWei: "0", heldWei: "0", bonusWei: "0" }, direct: [], history: [],
      week: { start: 1760918400, closesAt: 1761523200, count: 57, next: { count: 100, usd: 200 }, reached: 50, tiers: [{ count: 20, usd: 40 }, { count: 50, usd: 100 }, { count: 100, usd: 200 }, { count: 200, usd: 400 }] } };
    const h = await H.myInvitesPage(c, W[0], Object.assign({ svc: { "/invites/mine": () => ans } }, process.env.DY_PAGE_MUTANT ? { pageSrc: process.env.DY_PAGE_MUTANT } : {}));
    await waitFor("provider", () => h.w.DYWallet.state.hasProvider); await h.w.DYWallet.connect(); await waitFor("connected", () => h.w.DYWallet.state.connected);
    await show(h);
    const on = Array.from(h.w.document.querySelectorAll("#mi-ladder .mi-tier.on")).map((x) => x.getAttribute("data-tier"));
    ok("B2 · 57 this week, step 50 reached: exactly the '50 → USD 100' step is highlighted", JSON.stringify(on) === JSON.stringify(["50"]), JSON.stringify(on));
    ok("W1 · nothing ready (ready = 0): the Withdraw button is DIMMED (and not clickable)", q(h.w, "#mi-withdraw").classList.contains("mi-off") && q(h.w, "#mi-withdraw").getAttribute("aria-disabled") === "true");
    H.teardown(h);
  }

  console.log("\n── A · whose page, and when things go wrong ──");
  {
    const h = await page(W[1], "v2"); await show(h);
    ok("A1 · W1's page is W1's own: inviter W0 shortened, W1's direct invitee W2 only — W0's other invitee (LJ) never appears",
       q(h.w, "#mi-inviter").textContent === "Invited by: " + short(W[0].address) && h.w.document.querySelectorAll("#mi-direct tbody tr").length === 1
         && h.w.document.body.innerHTML.indexOf(short(LJ.address)) < 0);
    h.eth.__switchTo(W[2]);
    await waitFor("the page cleared on a wallet switch", () => !q(h.w, "#mi-levels"), 5000).catch(() => null);
    ok("A2 · the wallet switches: W1's page is cleared at once, never shown to W2", !q(h.w, "#mi-levels") && h.w.document.body.innerHTML.indexOf(short(W[2].address) + "</td>") < 0);
    H.teardown(h);
  }
  {
    const h = await page(W[0], "v1", { svcDown: true }); await show(h);
    ok("A3 · the bot is DOWN: one plain sentence — no table, no money, no zeros", q(h.w, "#mi-err") && q(h.w, "#mi-err").textContent === MI_DOWN && !q(h.w, "#mi-levels") && !q(h.w, "#mi-money"));
    H.teardown(h);
  }
  {
    const h = await page(W[0], "v1"); h.eth.__declineTyped = true; await show(h);
    ok("A4 · the player declines the free message: nothing is asked of the bot, a plain sentence, Show is ready again",
       q(h.w, "#mi-err").textContent === MI_DECLINED && h.w.__fetches.filter((u) => /invites\/mine/.test(u)).length === 0 && !q(h.w, "#mi-show").disabled);
    H.teardown(h);
  }
  {
    const h = await page(W[0], "v1", { invite: null }); await H.sleep(300);
    ok("A5 · the invite service not configured: 'My Invites is not open yet.' and no call", q(h.w, "#mi-closed") && q(h.w, "#mi-closed").textContent === MI_CLOSED && h.w.__fetches.length === 0);
    H.teardown(h);
  }
  {
    // a refusal from the bot (here: the ledger cannot be read) is the same plain sentence — never a page of zeros
    const h = await H.myInvitesPage(c, W[0], Object.assign({ svc: { "/invites/mine": () => ({ ok: false, refused: "TRY_AGAIN", sentence: "x" }) } }, process.env.DY_PAGE_MUTANT ? { pageSrc: process.env.DY_PAGE_MUTANT } : {}));
    await waitFor("provider", () => h.w.DYWallet.state.hasProvider); await h.w.DYWallet.connect(); await waitFor("connected", () => h.w.DYWallet.state.connected);
    await show(h);
    ok("A6 · a bot REFUSAL renders the plain sentence, never zeros", q(h.w, "#mi-err") && q(h.w, "#mi-err").textContent === MI_DOWN && !q(h.w, "#mi-levels"));
    H.teardown(h);
  }
  {
    // BOT-COLDSCAN-1 — the bot has just restarted and is still counting: its own sentence, never zeros
    const h = await H.myInvitesPage(c, W[0], Object.assign({ svc: { "/invites/mine": () => ({ ok: false, refused: "WARMING", sentence: "x" }) } }, process.env.DY_PAGE_MUTANT ? { pageSrc: process.env.DY_PAGE_MUTANT } : {}));
    await waitFor("provider", () => h.w.DYWallet.state.hasProvider); await h.w.DYWallet.connect(); await waitFor("connected", () => h.w.DYWallet.state.connected);
    await show(h);
    ok("A7 · WARMING renders 'still being counted' (proposed wording) — no table, no money, no zeros",
       q(h.w, "#mi-err") && q(h.w, "#mi-err").textContent === "Your invites are still being counted - try again in a minute. Nothing is lost." && !q(h.w, "#mi-levels") && !q(h.w, "#mi-money"),
       q(h.w, "#mi-err") && q(h.w, "#mi-err").textContent);
    const src = fs.readFileSync(PAGE_JS, "utf8");
    ok("A8 · the My Invites time limit is 30 s (the bot answers within 20 s while warming; 15 s cut that answer off)", /var TIMEOUT_MS = 30000;/.test(src));
    H.teardown(h);
  }

  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail));
  return fail;
}

// ══════════ THE MUTANTS: each a real defect in js/myinvites.js; the suite must turn RED on every one ══════════
const MUTANTS = [
  ["the page signs on load (asks before the player taps)", "  function mount() {\n    render();", "  function mount() {\n    render(); setTimeout(function () { if (ws().connected) show(); }, 300);"],
  // (the week block is gated twice — at render and inside weekBlock; removing only the inner gate is EQUIVALENT, so the
  //  mutant removes the render gate, which is the one a v1 page would actually show)
  ["the bonus section under v1", "        + (data.scheme === \"v2\" ? \"<section class='mi-sec'><h2>This week's bonus</h2>\" + weekBlock(data) + \"</section>\" : \"\")", "        + \"<section class='mi-sec'><h2>This week's bonus</h2>\" + weekBlock(data) + \"</section>\""],
  ["the locked line under v1", "      + (v2 ? row(\"locked\", MI_LOCKED, m.lockedWei) : \"\")", "      + row(\"locked\", MI_LOCKED, m.lockedWei)"],
  ["a failed read shows zeros", "      if (!r || !r.ok) { err = MI_DOWN; data = null; render(); return; }", "      if (!r || !r.ok) { data = { scheme: \"v1\", code: null, inviter: null, levels: [{ level: 1, people: 0, bundles: 0, cards: 0, salesUsdE6: \"0\", ratePct: 10, earnedWei: \"0\" }], money: { earnedWei: \"0\", readyWei: \"0\", withdrawnWei: \"0\", pendingWei: \"0\", pending: [], lockedWei: \"0\", heldWei: \"0\", bonusWei: \"0\" }, direct: [], history: [] }; dataFor = String(me).toLowerCase(); render(); return; }"],
  ["a wallet switch keeps the old wallet's page", "    if (data && dataFor !== String(s.address || \"\").toLowerCase()) data = null;   // never show one wallet's page to another", ""],
  ["the total row drops a level", "      tp += L.people; tb += L.bundles; tc += L.cards; ts += big(L.salesUsdE6); te += big(L.earnedWei);", "      if (L.level < 6) { tp += L.people; tb += L.bundles; tc += L.cards; ts += big(L.salesUsdE6); te += big(L.earnedWei); }"],
  ["USD at the wrong rate (100 DYC per USD)", "  function usdOfWei(w) { var m = big(w) / 125000000000000n;", "  function usdOfWei(w) { var m = big(w) / 100000000000000n;"],
  ["the withdraw button goes somewhere else", "href='dashboard.html#winnings-panel'", "href='dashboard.html'"],
  ["the pending dates are dropped", "      + row(\"pending\", \"Pending\", m.pendingWei, pend ? \"<ul class='mi-pend'>\" + pend + \"</ul>\" : \"\")", "      + row(\"pending\", \"Pending\", m.pendingWei)"],
  ["a declined signature is shown as 'down'", "      err = (e && (e.code === 4001 || e.code === \"ACTION_REJECTED\")) || /user rejected|denied/i.test(s) ? MI_DECLINED : MI_DOWN;", "      err = MI_DOWN;"],
  ["the active withdraw button is the plain (non-primary) style", "        ? \"<a class='btn-g btn-p mi-withdraw' id='mi-withdraw'", "        ? \"<a class='btn-g mi-withdraw' id='mi-withdraw'"],
  ["the withdraw button is always dimmed", "      + (big(m.readyWei) > 0n\n", "      + (false\n"],
  ["the withdraw button is never dimmed", "        : \"<a class='btn-g btn-p mi-withdraw mi-off' id='mi-withdraw' aria-disabled='true' href='dashboard.html#winnings-panel'>\"", "        : \"<a class='btn-g btn-p mi-withdraw' id='mi-withdraw' href='dashboard.html#winnings-panel'>\""],
  ["the ladder highlights the next step, not the reached one", "      var on = w.reached != null && Number(w.reached) === Number(t.count);", "      var on = w.next != null && Number(w.next.count) === Number(t.count);"],
  ["the ladder is missing", "      + ladderLine(w)", ""],
  ["names from the registry by list position, not by id", "      var w = window.DY_WAVE_REGISTRY && window.DY_WAVE_REGISTRY.lookup ? window.DY_WAVE_REGISTRY.lookup(n) : null;", "      var w = window.DY_WAVE_REGISTRY && window.DY_WAVE_REGISTRY.list ? window.DY_WAVE_REGISTRY.list()[n - 100] : null;"],
  ["the old column name", "<th>What they bought</th>", "<th>Bought (paying)</th>"],
  ["the counts-only rule line is missing", "    return h + \"</tbody></table><p class='mi-note' id='mi-counts'>\" + esc(d.scheme === \"v2\" ? MI_COUNTS_V2 : MI_COUNTS_V1) + \"</p>\";", "    return h + \"</tbody></table>\";"],
];

async function runMutants() {
  const src = fs.readFileSync(PAGE_JS, "utf8");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myinvites-mut-"));
  let killed = 0;
  for (const [name, from, to] of MUTANTS) {
    if (src.indexOf(from) < 0) { console.log("  ✖ MUTANT NOT APPLIED (source drifted): " + name); continue; }
    const f = path.join(dir, "myinvites.js");
    fs.writeFileSync(f, src.replace(from, to));
    const r = require("child_process").spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { DY_PAGE_MUTANT: f, DY_MUTANTS: "", DY_MI_SNAPSHOT: "" }), encoding: "utf8", timeout: 900000 });
    const red = r.status !== 0;
    if (red) killed++;
    console.log("  " + (red ? "✓ killed " : "✖ SURVIVED ") + name + (red ? "  (" + ((r.stdout || "").match(/✖ [^\n]+/) || ["exit " + r.status])[0].slice(0, 100) + ")" : ""));
  }
  console.log("\nMUTANTS — " + killed + "/" + MUTANTS.length + " killed");
  return killed === MUTANTS.length;
}

main().then(async (f) => {
  let good = f === 0;
  if (good && process.env.DY_MUTANTS) { console.log("\n── the mutants ──"); good = await runMutants(); }
  process.exitCode = good ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}).catch((e) => { console.log("CRASH: " + (e && e.stack || e)); process.exitCode = 1; setTimeout(() => process.exit(1), 200); });
