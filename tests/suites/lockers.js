"use strict";
// VEST-100-1 PHASE 1, PART 1 (owner rulings 2026-11-27) — THE LOCKER ON THE DASHBOARD, proven on the REAL dashboard page
// (jsdom) against the REAL LockerFactory + Locker (web3 c28cf16c), DYCoinSale and VestingVault on a throwaway anvil chain.
//
//   O · OFF IS OFF — with the switch off (the shipped config, `on:false` with a factory, `on:true` with none) the page is
//       byte-identical to the COMMITTED sources (git HEAD: dashboard.html, mf-config.js, js/dashboard.js) for three
//       wallets — an earlier purchase only, a locker only, both: the DOM (?v= stamps aside), the ordered read requests
//       and the wallet's own requests, and localStorage.
//   L · ON — statusOf rides the one combined read; the Vested card's two parts in the ruled words; before listing, at
//       step 1 and at step 24; the Release button (simulated before the wallet opens, pays only the wallet, the ruled
//       after-release and nothing-due lines); a failed read is the busy face, never a 0; the feed's two ruled lines;
//       schedule only (no reward words, no Activate in the locker's part).
//   B · breakages — each guard put back wrong turns its check red.
// PART 2 (the proceeds report, report.html + js/report.js):
//   RO · OFF IS OFF — the report with the switch off (three variants) is byte-identical to the committed report.html,
//       mf-config.js and js/report.js: the DOM (?v= stamps aside), the ordered read requests and localStorage.
//   RL · ON — a separate block under the sale: the ruled line, the people and DYC delivered (Dropped), and the DYC held in
//       lockers (dropped in − paid out, checked against each Locker's own heldIn/released), all "from event logs"; buyers,
//       DYC sold and the raised figures unchanged; lockers opened by their owners (openLocker → LockerCreated) never counted;
//       a refused log read is "—", never 0, and the sale still shows.
//   RB · breakages.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = H.SITE, DEC = H.DEC, DEC6 = H.DEC6;
const { makeSigner } = require(path.join(H.W3, "services", "approval-bot", "src", "signer.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const T = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; };
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(H.OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
const HEAD = (f) => execSync("git show HEAD:" + f, { cwd: SITE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const STEP = 2628000;
const fmt = (wei) => Number(ethers.formatUnits(wei, 18)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = (ts) => new Date(ts * 1000).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
const COPY = {   // the ruled words, as docs/DASHBOARD_DESIGN_v1.md §16 states them (owner's wording change 2026-11-27 20:12)
  locked: "Locked. Released in 24 months from exchange listing.",
  label: "Locked Amount",
  subtitle: "Locked coin",
};
const RETIRED = ["Released in 24 monthly steps", "The listing date is not yet set", "one month after listing."];   // never on the card again
const SUB = (w) => T(w, "#card-vesting .bcard-sub");
const SUB_ORIG = "Presale purchase lockup (85%)";

// ── the read road: every request the PAGE sends to the shipped read host, recorded in order, then answered by anvil ──
const baseGetUrl = ethers.FetchRequest.createGetUrlFunc();
const REC = { items: [], http: 0 };
ethers.FetchRequest.registerGetUrl(async (req, signal) => {
  const u = new URL(req.url);
  if (u.hostname === "rpc.divyayuddha.games") {
    let j = null; try { j = JSON.parse(Buffer.from(req.body).toString("utf8")); } catch (e) {}
    // part 2: the read host may be told to refuse getLogs on one address (as the proxy does for an address it does not serve)
    if (REC.refuseLogsAt && j && !Array.isArray(j) && j.method === "eth_getLogs" && String(((j.params || [])[0] || {}).address || "").toLowerCase() === REC.refuseLogsAt.toLowerCase()) {
      REC.http++; REC.items.push(JSON.stringify({ m: j.method, p: j.params, refused: true }));
      const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: j.id, error: { code: -32602, message: "address not served" } }));
      return { statusCode: 200, statusMessage: "OK", headers: { "content-type": "application/json" }, body: new Uint8Array(body) };
    }
    REC.http++;
    for (const it of (Array.isArray(j) ? j : [j])) if (it) REC.items.push(JSON.stringify({ m: it.method, p: it.params }));
    const r2 = new ethers.FetchRequest(H.RPC); r2.method = req.method; r2.body = req.body; for (const [k, v] of req) r2.setHeader(k, v);
    return baseGetUrl(r2, signal);
  }
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return baseGetUrl(req, signal);
  throw new Error("refused by the suite: " + u.host);
});
const MC3 = new ethers.Interface(["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])"]);
const SEL_STATUS = ethers.id("statusOf(address)").slice(0, 10);
function innerSelectors() {
  const out = [];
  for (const s of REC.items) {
    const o = JSON.parse(s), d = String(((o.p || [])[0] || {}).data || "");
    if (o.m === "eth_call" && d.slice(0, 10) === "0x82ad56cb") MC3.decodeFunctionData("aggregate3", d)[0].forEach((c) => out.push(c.callData.slice(0, 10)));
  }
  return out;
}
const singleCalls = () => REC.items.map((s) => JSON.parse(s)).filter((o) => o.m === "eth_call" && String(((o.p || [])[0] || {}).data || "").slice(0, 10) !== "0x82ad56cb");

// ── the chain: the presale stack, the factory, and three wallets ──
async function lockChain() {
  const c = await H.chainPresale();
  const F = (n) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, c.owner); };
  const chainId = Number((await c.provider.getNetwork()).chainId);
  const factory = await F("LockerFactory").deploy(c.addrs.sale, c.addrs.owner); await factory.waitForDeployment();
  const fAddr = await factory.getAddress();
  const passFor = (a) => makeSigner(c.signer.privateKey, chainId, c.addrs.sale).sign(a);
  const A = c.player;                                                           // an earlier purchase only
  const B = new ethers.Wallet("0x" + "7".repeat(64), c.provider);               // a locker only
  const C = new ethers.Wallet("0x" + "8".repeat(64), c.provider);               // both
  for (const w of [B, C]) {
    await (await c.owner.sendTransaction({ to: w.address, value: 10n ** 18n })).wait();
    await c.provider.send("anvil_impersonateAccount", [w.address]);   // the page's wallet shim sends through anvil (eth_sendTransaction)
  }
  await (await c.usdt.mint(C.address, 1000n * DEC6)).wait();
  const buy = async (w, usd) => {
    const n = new ethers.NonceManager(w);
    await (await c.usdt.connect(n).approve(c.addrs.sale, usd * DEC6)).wait();
    await (await c.sale.connect(n).buyWithStable(c.addrs.usdt, usd * DEC6, await passFor(w.address), "")).wait();
  };
  await buy(A, 120n); await buy(C, 200n);
  // the master's drops (the master here is the deployer), each with a ruled reference id
  await (await c.dyc.mint(c.addrs.owner, 28800n * DEC)).wait();
  await (await c.dyc.approve(fAddr, 28800n * DEC)).wait();
  await (await factory.drop(B.address, 24000n * DEC, ethers.encodeBytes32String("VD-20261127-01"))).wait();
  await (await factory.drop(C.address, 4800n * DEC, ethers.encodeBytes32String("VD-20261127-02"))).wait();
  return Object.assign(c, { factory, fAddr, A, B, C });
}
function page(c, wallet, opts) {
  opts = opts || {};
  return H.dashboardPage(c, wallet, Object.assign({
    shippedRoads: true,
    contracts: { dycoinSale: c.addrs.sale, vestingVault: c.addrs.vault, usdt: c.addrs.usdt, usdc: c.addrs.usdc },
    ls: { "dymf::config": JSON.stringify({ deployBlock: 1 }) },
  }, opts));
}
const settled = async (w) => {
  await H.until(() => /\d/.test(T(w, "#liq-amt")) && !/Reading|Loading|Scanning/i.test(T(w, "#tx-status")) && T(w, "#tx-body").length > 0
    && !/Connect your wallet/.test(T(w, "#vest-body")), 25000, "the dashboard to settle");
  await H.sleep(2500);
};
// one visit: the DOM, the ordered read requests, the wallet's requests and localStorage
async function visit(c, wallet, opts) {
  REC.items = []; REC.http = 0;
  const h = await page(c, wallet, opts);
  const wcalls = [];
  const real = h.eth.request.bind(h.eth);
  h.eth.request = (a) => { wcalls.push(JSON.stringify({ m: a.method, p: a.params || [] })); return real(a); };
  let hung = false;
  if (opts && opts.__mayHang) { await settled(h.w).catch(() => { hung = true; }); } else await settled(h.w);
  const ls = {}; for (let i = 0; i < h.w.localStorage.length; i++) { const k = h.w.localStorage.key(i); ls[k] = h.w.localStorage.getItem(k); }
  const snap = { vest: h.w.document.querySelector("#vest-body").innerHTML, dom: h.w.document.body.innerHTML.replace(/\?v=[\w.-]+/g, "?v=*"), reads: REC.items.slice(), http: REC.http, wallet: wcalls, ls: JSON.stringify(ls, Object.keys(ls).sort()), hung: hung };
  return { h, snap };
}
const firstDiff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i + ": " + String(a[i]).slice(0, 160) + "  ≠  " + String(b[i]).slice(0, 160); return "none"; };

// ── part 2: the REPORT page in jsdom — report.html's real markup and the real scripts in page order (no wallet) ──
async function reportPage(c, opts) {
  opts = opts || {};
  const { JSDOM } = require(path.join(SITE, "tests", "node_modules", "jsdom"));
  const html = opts.htmlSrc != null ? opts.htmlSrc : fs.readFileSync(path.join(SITE, "report.html"), "utf8");
  const body = (html.split(/<body[^>]*>/)[1] || "").split("</body>")[0];
  const dom = new JSDOM(`<!doctype html><body class="dash report">${body}</body>`, { url: "https://divyayuddha.games/report.html", pretendToBeVisual: true, runScripts: "outside-only" });
  const w = dom.window;
  w.ethers = ethers; w.TextEncoder = TextEncoder;
  w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null), text: () => Promise.resolve("") });
  w.localStorage.setItem("dymf::config", JSON.stringify({ deployBlock: 1 }));
  const run = (p) => w.eval(fs.readFileSync(path.join(SITE, p), "utf8"));
  run("config.js");
  if (opts.mfSrc != null) w.eval(opts.mfSrc); else run("mf-config.js");
  if (opts.lockers) w.DY_MF_CONFIG.lockers = opts.lockers;
  const chainId = Number((await c.provider.getNetwork()).chainId);
  w.DY_CONFIG.chain.id = chainId; w.DY_CONFIG.chain.idHex = "0x" + chainId.toString(16);
  w.DY_MF_CONFIG.contracts.dycoin = c.addrs.dyc;
  for (const k of ["holderStaking", "roiRedemption"]) w.DY_MF_CONFIG.contracts[k] = null;
  w.DY_MF_CONFIG.contracts.dycoinSale = c.addrs.sale; w.DY_MF_CONFIG.contracts.vestingVault = c.addrs.vault;
  run("js/wallet.js");
  if (opts.repSrc != null) w.eval(opts.repSrc); else run("js/report.js");
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  w.DYReport.mount();   // report.html's inline boot
  return { dom, w };
}
async function visitReport(c, opts) {
  REC.items = []; REC.http = 0;
  const h = await reportPage(c, opts);
  await H.until(() => /Total DYC sold/.test(T(h.w, "#sale-body")) && /Currently vesting/.test(T(h.w, "#vault-body")) && /read just now/.test(T(h.w, "#rep-updated")), 25000, "the report to settle");
  await H.sleep(1500);
  const ls = {}; for (let i = 0; i < h.w.localStorage.length; i++) { const k = h.w.localStorage.key(i); ls[k] = h.w.localStorage.getItem(k); }
  return { h, snap: { dom: h.w.document.body.innerHTML.replace(/\?v=[\w.-]+/g, "?v=*"), reads: REC.items.slice(), http: REC.http, ls: JSON.stringify(ls, Object.keys(ls).sort()) } };
}

async function run() {
  console.log("\n── VEST-100-1 · the locker on the dashboard (phase 1, part 1) ──");
  await H.preflight();
  for (const n of ["Locker", "LockerFactory"]) if (!fs.existsSync(path.join(H.OUT, n + ".sol", n + ".json"))) throw new Error("MISSING the " + n + " artifact (run `forge build` in the web3 contracts/) — NOTHING WAS PROVEN");
  const c = await lockChain();
  const OLD = { htmlSrc: HEAD("dashboard.html"), mfSrc: HEAD("mf-config.js"), dashSrc: HEAD("js/dashboard.js") };
  const tpl = new ethers.Contract(await c.factory.lockerImplementation(), ["function STEP() view returns (uint256)", "function STEPS() view returns (uint256)"], c.provider);
  ok("C0 · the page's step constants are the Locker's own (STEP 2,628,000 s, STEPS 24)",
     Number(await tpl.STEP()) === STEP && Number(await tpl.STEPS()) === 24 && /var LOCKER_STEP = 2628000, LOCKER_STEPS = 24;/.test(fs.readFileSync(path.join(SITE, "js/dashboard.js"), "utf8")));

  // ═══ O · OFF IS OFF ═══
  console.log("\n── O · the switch off: byte-identical to the committed sources ──");
  const VARIANTS = [["the shipped config", null], ["on:false with a factory", { on: false, factory: c.fAddr, deployBlock: 1 }], ["on:true with no factory", { on: true, factory: null, deployBlock: 1 }]];
  const offSnaps = {};
  for (const [who, wallet] of [["A (earlier purchase only)", c.A], ["B (locker only)", c.B], ["C (both)", c.C]]) {
    const base = await visit(c, wallet, OLD); H.teardown(base.h);
    for (const [vname, lk] of VARIANTS) {
      const now = await visit(c, wallet, lk ? { lockers: lk } : {}); H.teardown(now.h);
      const same = base.snap.dom === now.snap.dom && JSON.stringify(base.snap.reads) === JSON.stringify(now.snap.reads) && base.snap.http === now.snap.http
        && JSON.stringify(base.snap.wallet) === JSON.stringify(now.snap.wallet) && base.snap.ls === now.snap.ls;
      ok("O · " + who + ", " + vname + ": DOM, " + now.snap.reads.length + " read requests in order (" + now.snap.http + " HTTP), " + now.snap.wallet.length + " wallet requests and localStorage identical to HEAD",
         same, "dom " + (base.snap.dom === now.snap.dom) + " reads " + firstDiff(base.snap.reads, now.snap.reads) + " wallet " + firstDiff(base.snap.wallet, now.snap.wallet) + " ls " + (base.snap.ls === now.snap.ls));
      if (!lk) offSnaps[wallet.address] = now.snap;
    }
  }

  // ═══ L · ON ═══
  const ON = { lockers: { on: true, factory: c.fAddr, deployBlock: 1 } };
  console.log("\n── L · the switch on, before listing ──");
  {
    const { h, snap } = await visit(c, c.A, ON);
    const off = offSnaps[c.A.address];
    const vOn = h.w.document.querySelector("#vest-body").innerHTML;
    ok("L1 · statusOf rides the one combined read (" + innerSelectors().filter((s) => s === SEL_STATUS).length + " inner call), no single eth_call for it, and no extra HTTP request (" + snap.http + " vs " + off.http + " off)",
       innerSelectors().filter((s) => s === SEL_STATUS).length >= 1 && !singleCalls().some((o) => String(o.p[0].data).slice(0, 10) === SEL_STATUS) && snap.http === off.http);
    ok("L2 · A, an earlier purchase only: the Vested card is exactly the card without lockers, subtitle \"" + SUB_ORIG + "\" as today", vOn === off.vest && !/Locker|Earlier purchase/.test(T(h.w, "#vest-body")) && SUB(h.w) === SUB_ORIG, T(h.w, "#vest-body").slice(0, 160) + " | " + SUB(h.w));
    H.teardown(h);
  }
  let bPre;
  {
    const { h } = await visit(c, c.B, ON);
    const v = T(h.w, "#vest-body"), rel = h.w.document.querySelector("#act-lrelease");
    bPre = v;
    const note = h.w.document.querySelector("#vest-body .lock-note");
    ok("L3 · B, a locker only: subtitle \"" + COPY.subtitle + "\"; the Locker part alone — \"" + COPY.label + "\" 24,000.00 DYC, \"" + COPY.locked + "\" and nothing more (no listing-date words, no step line, no Ready line), Release disabled, no Earlier purchase, no Claim",
       /^Locker/.test(v) && v.indexOf(COPY.label) >= 0 && v.indexOf("24,000.00") > v.indexOf(COPY.label) && v.indexOf(COPY.locked) >= 0 && !!note && note.textContent === COPY.locked
       && !RETIRED.some((r) => v.indexOf(r) >= 0) && !/first release|Step |Ready to release/.test(v) && !!rel && rel.disabled && rel.textContent === "Release"
       && !/Earlier purchase/.test(v) && !h.w.document.querySelector("#act-vclaim") && SUB(h.w) === COPY.subtitle, v + " | " + SUB(h.w));
    ok("L3b · readability: the locker's lines take the card's body-text colour (parchment, as \"Released but unclaimed\"), not the dim note gold",
       /color:var\(--parchment\)/.test(note.getAttribute("style") || "") && !note.classList.contains("note"), note.getAttribute("style"));
    ok("L4 · schedule only: the locker's part says nothing of rewards and offers no Activate (ruling 7)",
       !/reward|earn|ROI|stak|per day|\/day|Activate|%/i.test(v.replace(/^Locker/, "")) && !h.w.document.querySelector("#vest-body #act-activate"), v);
    const rows = Array.from(h.w.document.querySelectorAll("#tx-body tr")).map((tr) => tr.textContent.replace(/\s+/g, " "));
    ok("L5 · the feed: \"Received 24,000.00 DYC into your locker\"", rows.some((r) => r.indexOf("Received 24,000.00 DYC into your locker") >= 0), rows.join(" | "));
    ok("L6 · the empty-holdings line stays hidden for a wallet whose only holding is a locker", h.w.document.querySelector("#empty-mint") ? h.w.document.querySelector("#empty-mint").classList.contains("hidden") : true);
    H.teardown(h);
  }
  {
    const { h } = await visit(c, c.C, ON);
    const v = T(h.w, "#vest-body");
    ok("L7 · C, both: \"Earlier purchase\" then \"Locker\", the earlier part with its Claim, the locker part with 4,800.00 DYC and its Release",
       /^Earlier purchase/.test(v) && v.indexOf("Locker") > v.indexOf("Earlier purchase") && v.indexOf("4,800.00") > v.indexOf("Locker")
       && !!h.w.document.querySelector("#act-vclaim") && !!h.w.document.querySelector("#act-lrelease") && SUB(h.w) === COPY.subtitle, v + " | " + SUB(h.w));
    H.teardown(h);
  }
  {
    const { h } = await visit(c, c.B, { lockers: { on: true, factory: c.addrs.sale, deployBlock: 1 } });   // statusOf at a contract without it → the read fails
    const v = T(h.w, "#vest-body");
    ok("L8 · a failed locker read is the busy face, never a 0", /couldn't load|try again/i.test(v) && !/0\.00/.test(v) && !h.w.document.querySelector("#act-lrelease"), v);
    H.teardown(h);
  }

  // ── listing, then before step 1 ──
  console.log("\n── L · listed, step 1 not yet reached ──");
  await (await c.vault.declareDexDay()).wait();
  const dex = Number(await c.vault.dexDay());
  {
    const { h } = await visit(c, c.B, ON);
    const v = T(h.w, "#vest-body"), want = "The first release is on " + dateFmt(dex + STEP) + ".";
    ok("L9a · listed, before step 1: \"" + want + "\" in place of a \"Step 0 of 24\" line, no Ready line",
       v.indexOf(want) >= 0 && v.indexOf(COPY.locked) >= 0 && !/Step \d/.test(v) && !/Ready to release/.test(v), v);
    const sent = [];
    const real = h.eth.request.bind(h.eth);
    h.eth.request = (a) => { if (a.method === "eth_sendTransaction") sent.push(a.method); return real(a); };
    H.click(h.w, "#act-lrelease");
    const nothing = "Nothing to release yet. Next release: " + dateFmt(dex + STEP) + ".";
    await H.until(() => H.text(h.w).indexOf(nothing) >= 0, 15000, "the nothing-due line").catch(() => {});
    ok("L9b · Release pressed before step 1: \"" + nothing + "\", and the wallet is asked for nothing", H.text(h.w).indexOf(nothing) >= 0 && sent.length === 0, sent.join(","));
    H.teardown(h);
  }
  console.log("\n── L · step 1 ──");
  await c.provider.send("evm_setNextBlockTimestamp", [dex + STEP + 120]); await c.provider.send("evm_mine", []);
  {
    const { h } = await visit(c, c.B, ON);
    const v = T(h.w, "#vest-body"), want = "Step 1 of 24. 0.00 of 24,000.00 DYC released. Next release: " + dateFmt(dex + 2 * STEP) + ".";
    ok("L9 · step 1: \"" + want + "\", the locked line, and \"Ready to release: 1,000.00 DYC\" with the weight of \"Released but unclaimed\" (a label over the gold figure)",
       v.indexOf(want) >= 0 && v.indexOf(COPY.locked) >= 0 && !RETIRED.some((r) => v.indexOf(r) >= 0) && /Ready to release:\s*1,000\.00\s*DYC/.test(v)
       && !!h.w.document.querySelector("#vest-body .stat-label.lock-ready") && /gold-burnished/.test((h.w.document.querySelector("#vest-body .stat-label.lock-ready").nextElementSibling.querySelector(".v") || { getAttribute: () => "" }).getAttribute("style") || ""), v);
    const bal0 = await c.dyc.balanceOf(c.B.address);
    const sent = [];
    const real = h.eth.request.bind(h.eth);
    h.eth.request = (a) => { if (/^eth_(call|estimateGas|sendTransaction)$/.test(a.method)) sent.push(a.method); return real(a); };
    H.click(h.w, "#act-lrelease");
    await H.until(() => h.w.document.querySelector("#ov-confirm").classList.contains("show"), 15000, "the Release confirm");
    ok("L10 · Release simulates BEFORE the wallet is asked to send (" + sent.join(",") + "), the confirm reads \"Release\" for 1,000.00 DYC",
       sent.indexOf("eth_call") >= 0 && sent.indexOf("eth_sendTransaction") < 0 && T(h.w, "#ov-confirm-title") === "Release" && T(h.w, "#ov-confirm-body") === "1,000.00 DYC", T(h.w, "#ov-confirm-title") + " | " + T(h.w, "#ov-confirm-body"));
    H.click(h.w, "#ov-confirm-go");
    await H.until(() => /Released 1,000\.00 DYC to your wallet\./.test(H.text(h.w)) || T(h.w, "#ov-fail-msg").length > 0, 30000, "the after-release line").catch(() => {});
    if (T(h.w, "#ov-fail-msg")) console.log("      fail box: " + T(h.w, "#ov-fail-msg"));
    const bal1 = await c.dyc.balanceOf(c.B.address);
    ok("L11 · \"Released 1,000.00 DYC to your wallet.\" — and the wallet holds exactly 1,000 DYC more", bal1 - bal0 === 1000n * DEC, (bal1 - bal0).toString());
    await H.until(() => Array.from(h.w.document.querySelectorAll("#tx-body tr")).some((tr) => /Released 1,000\.00 DYC from your locker/.test(tr.textContent)), 20000, "the release in the feed").catch(() => {});
    ok("L12 · the feed: \"Released 1,000.00 DYC from your locker\"", Array.from(h.w.document.querySelectorAll("#tx-body tr")).some((tr) => /Released 1,000\.00 DYC from your locker/.test(tr.textContent)));
    await H.until(() => /Step 1 of 24\. 1,000\.00 of 24,000\.00 DYC released\./.test(T(h.w, "#vest-body")), 20000, "the card after the release").catch(() => {});
    ok("L12b · after the release nothing is collectable, so the Ready line is gone", !/Ready to release/.test(T(h.w, "#vest-body")), T(h.w, "#vest-body"));
    sent.length = 0;
    H.click(h.w, "#act-lrelease");
    const nothing = "Nothing to release yet. Next release: " + dateFmt(dex + 2 * STEP) + ".";
    await H.until(() => H.text(h.w).indexOf(nothing) >= 0, 15000, "the nothing-due line").catch(() => {});
    ok("L13 · pressed again with nothing due: \"" + nothing + "\", and the wallet is asked for nothing", H.text(h.w).indexOf(nothing) >= 0 && sent.indexOf("eth_sendTransaction") < 0, sent.join(","));
    H.teardown(h);
  }
  {
    const { h } = await visit(c, c.B, ON);   // a fresh visit reads the release from the chain, not from the page's memory
    const rows = Array.from(h.w.document.querySelectorAll("#tx-body tr")).map((tr) => tr.textContent.replace(/\s+/g, " "));
    ok("L14 · a fresh visit: the feed carries both locker lines from the chain", rows.some((r) => /Released 1,000\.00 DYC from your locker/.test(r)) && rows.some((r) => /Received 24,000\.00 DYC into your locker/.test(r)), rows.join(" | "));
    H.teardown(h);
  }

  // ── step 24 ──
  console.log("\n── L · step 24 ──");
  await c.provider.send("evm_setNextBlockTimestamp", [dex + 24 * STEP + 120]); await c.provider.send("evm_mine", []);
  {
    const { h } = await visit(c, c.B, ON);
    const v = T(h.w, "#vest-body"), want = "Step 24 of 24. 1,000.00 of 24,000.00 DYC released.";
    ok("L15 · step 24: \"" + want + "\" and no next release", v.indexOf(want) >= 0 && v.indexOf("Next release") < 0, v);
    H.click(h.w, "#act-lrelease");
    await H.until(() => h.w.document.querySelector("#ov-confirm").classList.contains("show"), 15000, "the Release confirm");
    H.click(h.w, "#ov-confirm-go");
    await H.until(() => /Released 23,000\.00 DYC to your wallet\./.test(H.text(h.w)), 20000, "the final release").catch(() => {});
    ok("L16 · the final step pays the rest: \"Released 23,000.00 DYC to your wallet.\"", /Released 23,000\.00 DYC to your wallet\./.test(H.text(h.w)));
    await H.until(() => /Step 24 of 24\. 24,000\.00 of 24,000\.00 DYC released\./.test(T(h.w, "#vest-body")), 20000, "the card after the final release").catch(() => {});
    const rel = h.w.document.querySelector("#act-lrelease");
    ok("L17 · all released: \"Step 24 of 24. 24,000.00 of 24,000.00 DYC released.\", 0.00 locked, Release disabled",
       /Step 24 of 24\. 24,000\.00 of 24,000\.00 DYC released\./.test(T(h.w, "#vest-body")) && !!rel && rel.disabled, T(h.w, "#vest-body"));
    H.teardown(h);
  }

  // ═══ B · breakages ═══
  console.log("\n── B · breakages (each must turn its check red) ──");
  const NEW = fs.readFileSync(path.join(SITE, "js/dashboard.js"), "utf8");
  const mutate = (from, to) => { if (NEW.indexOf(from) < 0) throw new Error("mutation anchor missing: " + from.slice(0, 60)); return NEW.replace(from, to); };
  {
    const src = mutate("return !!(L && L.on === true && L.factory);", "return !!(L && L.on === true);");
    const base = await visit(c, c.B, OLD); H.teardown(base.h);
    const now = await visit(c, c.B, { lockers: { on: true, factory: null, deployBlock: 1 }, dashSrc: src, __mayHang: true }); H.teardown(now.h);
    ok("B1 · a switch that ignores the missing factory is caught by the off check (" + (now.snap.hung ? "the page never settles" : "the reads or DOM differ") + ")",
       now.snap.hung || JSON.stringify(base.snap.reads) !== JSON.stringify(now.snap.reads) || base.snap.dom !== now.snap.dom);
  }
  {
    const src = mutate("        else d.lockErr = true;\n", "        else d.lock = { addr: ethers.ZeroAddress, total: 0n, released: 0n, collectable: 0n, next: 0, dexDay: 1n };\n".replace("ethers.ZeroAddress", "\"0x0000000000000000000000000000000000000000\""));
    const { h } = await visit(c, c.B, { lockers: { on: true, factory: c.addrs.sale, deployBlock: 1 }, dashSrc: src });
    ok("B2 · a failed read shown as an empty locker is caught (L8's test goes red)", !/couldn't load|try again/i.test(T(h.w, "#vest-body")));
    H.teardown(h);
  }
  // ═══════════════════ PART 2 · THE PROCEEDS REPORT ═══════════════════
  console.log("\n── RO · the report with the switch off: byte-identical to the committed sources ──");
  const ROLD = { htmlSrc: HEAD("report.html"), mfSrc: HEAD("mf-config.js"), repSrc: HEAD("js/report.js") };
  {
    const base = await visitReport(c, ROLD); H.teardown(base.h);
    for (const [vname, lk] of VARIANTS) {
      const now = await visitReport(c, lk ? { lockers: lk } : {}); H.teardown(now.h);
      ok("RO · " + vname + ": DOM, ordered reads (" + now.snap.reads.length + "), HTTP count and localStorage identical",
         base.snap.dom === now.snap.dom && JSON.stringify(base.snap.reads) === JSON.stringify(now.snap.reads) && base.snap.http === now.snap.http && base.snap.ls === now.snap.ls,
         base.snap.dom !== now.snap.dom ? "DOM differs" : firstDiff(base.snap.reads, now.snap.reads));
    }
  }

  console.log("\n── RL · the report with the switch on ──");
  const RON = { lockers: { on: true, factory: c.fAddr, deployBlock: 1 } };
  const LK = new ethers.Interface(["function heldIn() view returns (uint256)", "function released() view returns (uint256)"]);
  const expectHeld = async () => {   // independent of the logs: each Locker's own books, never below 0
    let held = 0n;
    const logs = await c.factory.queryFilter(c.factory.filters.Dropped(), 0, "latest");
    const lockers = Array.from(new Set(logs.map((l) => l.args.locker.toLowerCase())));
    for (const l of lockers) {
      const k = new ethers.Contract(l, LK, c.provider), v = (await k.heldIn()) - (await k.released());
      if (v > 0n) held += v;
    }
    return { held, people: new Set(logs.map((l) => l.args.person.toLowerCase())).size, dropped: logs.reduce((a, l) => a + l.args.amount, 0n) };
  };
  const dyc0 = (v) => Number(ethers.formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const saleTop = (w) => { const b = w.document.querySelector("#sale-body"); const x = b.cloneNode(true); const l = x.querySelector(".rep-lockers"); if (l) l.remove(); return x.textContent.replace(/\s+/g, " ").trim(); };
  const rows = (w) => Array.from(w.document.querySelectorAll("#sale-body .rep-lockers .rep-figrow")).map((r) => r.textContent.replace(/\s+/g, " ").trim());
  {
    const off = await visitReport(c, {}); const offTop = saleTop(off.h.w); H.teardown(off.h);
    const { h } = await visitReport(c, RON);
    const e = await expectHeld(), r = rows(h.w);
    const blk = h.w.document.querySelector("#sale-body .rep-lockers");
    ok("RL1 · a separate block under the sale carries the ruled line verbatim",
       !!blk && T(h.w, "#sale-body .rep-lockers .rep-note") === "Coins delivered for payments made outside the portal are listed separately. They come from the treasury allocation and are locked, released in 24 months from exchange listing.");
    ok("RL2 · delivered outside the portal: " + e.people + " people and " + dyc0(e.dropped) + " DYC (the factory's Dropped)",
       r[0] === "Delivered outside the portal — people from event logs" + e.people && r[1] === "Delivered outside the portal — DYC from event logs" + dyc0(e.dropped) + " DYC", r.join(" | "));
    ok("RL3 · held in lockers = " + dyc0(e.held) + " DYC, equal to the Lockers' own heldIn − released (after L's releases)",
       r[2] === "Held in lockers from event logs" + dyc0(e.held) + " DYC", r[2]);
    ok("RL4 · all three figures are marked \"from event logs\"", blk && blk.querySelectorAll(".rep-src").length === 3);
    ok("RL5 · buyers, DYC sold and the raised figures are exactly the switch-off report's (nothing added)", saleTop(h.w) === offTop, saleTop(h.w).slice(0, 200) + " ≠ " + offTop.slice(0, 200));
    ok("RL6 · schedule only: the block speaks of no rewards, earning, staking or ROI", !/reward|earn|stak|ROI|Activate/i.test(blk ? blk.textContent : "x"));
    H.teardown(h);
  }
  // more drops (a batch of 12 incl. one repeat person) and two lockers opened by their owners — no purchase, no drop
  {
    const people = []; for (let i = 0; i < 12; i++) people.push(ethers.Wallet.createRandom().address);
    people[11] = people[0];
    const amounts = people.map((_, i) => BigInt(i + 1) * 100n * DEC), refs = people.map((_, i) => ethers.encodeBytes32String("VD-20261128-" + String(i + 1).padStart(2, "0")));
    const tot = amounts.reduce((a, b) => a + b, 0n);
    await (await c.dyc.mint(c.addrs.owner, tot)).wait(); await (await c.dyc.approve(c.fAddr, tot)).wait();
    await (await c.factory.dropBatch(people, amounts, refs)).wait();
    const off = await visitReport(c, {}); const offTop = saleTop(off.h.w); H.teardown(off.h);
    const before = await visitReport(c, RON); const rb = rows(before.h.w); H.teardown(before.h);
    const e = await expectHeld();
    ok("RL7 · after a batch of 12 (one person twice): " + e.people + " people, " + dyc0(e.dropped) + " DYC, held " + dyc0(e.held) + " DYC",
       rb[0] === "Delivered outside the portal — people from event logs" + e.people && rb[1].endsWith("logs" + dyc0(e.dropped) + " DYC") && rb[2].endsWith("logs" + dyc0(e.held) + " DYC") && e.people === 2 + 11, rb.join(" | "));
    for (const pk of ["0x" + "9".repeat(64), "0x" + "a".repeat(64)]) {
      const wlt = new ethers.Wallet(pk, c.provider);
      await (await c.owner.sendTransaction({ to: wlt.address, value: 10n ** 17n })).wait();
      await (await c.factory.connect(wlt).openLocker()).wait();
    }
    const created = await c.factory.queryFilter(c.factory.filters.LockerCreated(), 0, "latest");
    const after = await visitReport(c, RON); const ra = rows(after.h.w);
    ok("RL8 · two lockers opened by their owners (" + created.length + " LockerCreated in all) change nothing: same people, DYC and held; buyers unchanged",
       JSON.stringify(ra) === JSON.stringify(rb) && saleTop(after.h.w) === offTop, ra.join(" | "));
    H.teardown(after.h);
  }
  {
    REC.refuseLogsAt = c.fAddr;
    const { h } = await visitReport(c, RON);
    REC.refuseLogsAt = null;
    const r = rows(h.w);
    ok("RL9 · the factory's logs refused: every locker figure is \"—\" (never 0) and the sale still shows",
       r.length === 3 && r.every((x) => /—$/.test(x)) && /Total DYC sold/.test(T(h.w, "#sale-body")), r.join(" | "));
    H.teardown(h);
  }

  console.log("\n── RB · report breakages (each must turn its check red) ──");
  const RNEW = fs.readFileSync(path.join(SITE, "js/report.js"), "utf8");
  const rmut = (from, to) => { if (RNEW.indexOf(from) < 0) throw new Error("mutation anchor missing: " + from.slice(0, 60)); return RNEW.replace(from, to); };
  {
    const src = rmut("function lockersOn() { var L = FILE.lockers; return !!(L && L.on === true && L.factory); }", "function lockersOn() { var L = FILE.lockers; return !!(L && L.on === true); }");
    const base = await visitReport(c, ROLD); H.teardown(base.h);
    let now = null, hung = false;
    try { now = await visitReport(c, { lockers: { on: true, factory: null, deployBlock: 1 }, repSrc: src }); H.teardown(now.h); } catch (e) { hung = true; }
    ok("RB1 · a switch that ignores the missing factory is caught by the off check", hung || base.snap.dom !== now.snap.dom || JSON.stringify(base.snap.reads) !== JSON.stringify(now.snap.reads));
  }
  {
    const src = rmut("Total DYC sold</span><span class='rep-bigval'>\" + fmtDyc(totalSold)", "Total DYC sold</span><span class='rep-bigval'>\" + fmtDyc(totalSold + ((rr[1] && rr[1].dropped) || 0n))");
    const off = await visitReport(c, {}); const offTop = saleTop(off.h.w); H.teardown(off.h);
    const { h } = await visitReport(c, Object.assign({ repSrc: src }, RON));
    ok("RB2 · drops added into DYC sold are caught (RL5 goes red)", saleTop(h.w) !== offTop);
    H.teardown(h);
  }
  {
    const src = rmut("people[a.person.toLowerCase()] = 1;", "people[a.person.toLowerCase()] = 1; people[a.locker.toLowerCase() + ':l'] = 1;");
    const { h } = await visitReport(c, Object.assign({ repSrc: src }, RON));
    const e = await expectHeld();
    ok("RB3 · counting lockers instead of people is caught (RL2/RL7 go red)", rows(h.w)[0] !== "Delivered outside the portal — people from event logs" + e.people);
    H.teardown(h);
  }

  console.log(fail ? "\n  " + fail + " FAILED, " + pass + " passed" : "\n  ALL GREEN — " + pass + "/" + pass);
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
