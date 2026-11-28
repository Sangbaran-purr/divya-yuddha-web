"use strict";
// VEST-100-1 PHASE 1, PART 3 (owner rulings 2026-11-28) — THE ADMIN VESTED DROP PANEL, proven on the REAL admin page
// (jsdom: admin.html's markup and its scripts in page order, mounted as its inline boot does) against the REAL
// LockerFactory + Locker (web3), DYCoinSale and VestingVault on a throwaway anvil chain. The master is the deployer; its
// wallet is a shim that sends through anvil exactly what the page asks for, and records every request.
//
//   VO · OFF IS OFF — with admin-config's factory null, the admin page is byte-identical to the COMMITTED sources (git
//        HEAD: admin.html, admin-config.js, js/admin.js) for the master, a stranger and an unconnected wallet: the DOM
//        (?v= stamps aside), every wallet request in order with its params, every read-host request, and localStorage.
//   VG · THE GATE — factory.master() == the connected wallet, read on chain; anything else keeps it off, in plain words.
//   VR · REFUSALS — every refused kind, numbered per line, blocking the whole batch; the next id VD-YYYYMMDD-NN.
//   VW · THE CONTRACT WARNING — a tick per warned line before anything can be sent.
//   VC · THE CONFIRM SCREEN — person, locker (created now / exists), DYC and wei, reference id, total, a fresh balance;
//        blocked above the balance; a final tick.
//   VS · THE SIGNING ORDER — simulate approve(exact total) → sign → simulate drop → sign; the gas limits; the allowance 0
//        after a send; read-back of the Dropped events; the download record; nothing stored, nothing sent elsewhere; a drop
//        that cannot be simulated after the approval → "Reset allowance to 0"; a rejected approval sends nothing.
//   VL · THE BATCH LIMIT — 21 lines refused before any chain read; a full batch of 20 to new Lockers lands.
//   VB · breakages — each guard put back wrong turns its check red.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = H.SITE, DEC = H.DEC;
const { JSDOM, VirtualConsole } = require(path.join(SITE, "tests", "node_modules", "jsdom"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const T = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; };
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(H.OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
const HEAD = (f) => execSync("git show HEAD:" + f, { cwd: SITE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const READ = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
const TIMELOCK = "0xe684a6888F024C551DadEDAc193283174C2b828E";   // verbatim, web3 docs/MAINNET_STACK_2026-08-15.md #1
const WARN = "This address is a contract. Confirm it is the person's own wallet.";

// ── the read host: every request the page sends to rpc.divyayuddha.games, recorded in order, answered by anvil ──
const baseGetUrl = ethers.FetchRequest.createGetUrlFunc();
const REC = { items: [] };
ethers.FetchRequest.registerGetUrl(async (req, signal) => {
  const u = new URL(req.url);
  if (u.hostname === "rpc.divyayuddha.games") {
    let j = null; try { j = JSON.parse(Buffer.from(req.body).toString("utf8")); } catch (e) {}
    for (const it of (Array.isArray(j) ? j : [j])) if (it) REC.items.push(JSON.stringify({ m: it.method, p: it.params }));
    const r2 = new ethers.FetchRequest(H.RPC); r2.method = req.method; r2.body = req.body; for (const [k, v] of req) r2.setHeader(k, v);
    return baseGetUrl(r2, signal);
  }
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return baseGetUrl(req, signal);
  throw new Error("refused by the suite: " + u.host);
});

// ── the admin page in jsdom: admin.html's markup + its scripts in page order, then its inline mount() ──
async function adminPage(c, wallet, opts) {
  opts = opts || {};
  const errs = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", (e) => errs.push(String(e && e.message)));
  const html = opts.htmlSrc != null ? opts.htmlSrc : READ("admin.html");
  const order = [];
  const markup = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (m, attrs) => {
    const src = /\bsrc="([^"?]+)/.exec(attrs);
    if (src && !/^https?:/.test(src[1])) order.push(src[1]);
    return "";
  });
  const dom = new JSDOM(markup, { url: "https://divyayuddha.games/admin.html", pretendToBeVisual: true, runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.__fetches = [];
  w.fetch = (u) => { w.__fetches.push(String(u)); return Promise.reject(new Error("no fetch in the suite")); };
  w.ethers = ethers; w.TextEncoder = TextEncoder;
  // the download: capture what the page hands the browser to save (jsdom has no object URLs)
  w.__blobs = [];
  w.Blob = function (parts, o) { this.parts = parts; this.type = o && o.type; w.__blobs.push(this); };
  w.URL.createObjectURL = () => "blob:suite";
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { w.__saved = { name: this.download, href: this.href }; };
  const eth = H.makeEthereum(wallet || { address: ethers.ZeroAddress }, c.provider);
  if (!wallet) eth.__wallet = null;
  eth.__log = [];
  const real = eth.request.bind(eth);
  eth.request = (a) => {
    eth.__log.push(JSON.stringify({ m: a.method, p: a.params || [] }));
    if (eth.__reject && a.method === "eth_sendTransaction") { eth.__reject = false; const e = new Error("User rejected the request."); e.code = 4001; return Promise.reject(e); }
    return real(a);
  };
  w.ethereum = eth;
  const chainId = Number((await c.provider.getNetwork()).chainId);
  const src = { "admin-config.js": opts.cfgSrc, "js/admin.js": opts.adminSrc };
  for (const f of order) {
    w.eval(src[f] != null ? src[f] : READ(f));
    if (f === "config.js") { w.DY_CONFIG.chain.id = chainId; w.DY_CONFIG.chain.idHex = "0x" + chainId.toString(16); }
    if (f === "admin-config.js") {
      w.DY_ADMIN_CONFIG.contracts.dycoin = c.addrs.dyc;   // the console's DYC is the test chain's (as on mainnet: the factory's own)
      if (opts.factory !== undefined) w.DY_ADMIN_CONFIG.contracts.lockerFactory = opts.factory;
      if (opts.factory) w.DY_ADMIN_CONFIG.contracts.timelock = opts.timelock || TIMELOCK;
    }
    if (f === "js/wallet.js") w.DYWallet.loadEthers = () => Promise.resolve(ethers);
  }
  w.DYAdmin.mount();
  return { dom, w, eth, errs };
}
const settledAdmin = async (h) => {
  await H.until(() => !/Checking wallet/.test(T(h.w, "#admin-status")) && !/Reading ownership/.test(T(h.w, "#gate-banner")), 25000, "the admin page to settle");
  if (h.w.document.querySelector("#vd-gate")) await H.until(() => !/Checking|Reading/.test(T(h.w, "#vd-gate")), 25000, "the Vested Drop gate");
  await H.sleep(2500);
};
async function visitAdmin(c, wallet, opts) {
  REC.items = [];
  const h = await adminPage(c, wallet, opts);
  await settledAdmin(h);
  const ls = {}; for (let i = 0; i < h.w.localStorage.length; i++) { const k = h.w.localStorage.key(i); ls[k] = h.w.localStorage.getItem(k); }
  return { h, snap: { dom: h.w.document.body.innerHTML.replace(/\?v=[\w.-]+/g, "?v=*"), wallet: h.eth.__log.slice(), reads: REC.items.slice(), ls: JSON.stringify(ls, Object.keys(ls).sort()), fetches: h.w.__fetches.slice() } };
}
const firstDiff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i + ": " + String(a[i]).slice(0, 160) + "  ≠  " + String(b[i]).slice(0, 160); return "none"; };
const setVal = (w, sel, v) => { const e = w.document.querySelector(sel); e.value = v; };
const badLines = (w) => Array.from(w.document.querySelectorAll("#vd-confirm .vd-badline")).map((d) => ({ n: d.getAttribute("data-line"), t: d.textContent.replace(/\s+/g, " ").trim() }));
async function review(h, batch, single) {
  ["#vd-addr", "#vd-amt", "#vd-ref", "#vd-batch"].forEach((s) => setVal(h.w, s, ""));
  if (single) { setVal(h.w, "#vd-addr", single[0]); setVal(h.w, "#vd-amt", single[1]); setVal(h.w, "#vd-ref", single[2]); }
  if (batch) setVal(h.w, "#vd-batch", batch.join("\n"));
  H.click(h.w, "#vd-review");
  await H.until(() => !/Checking every line/.test(T(h.w, "#vd-confirm")) && T(h.w, "#vd-confirm").length > 0, 30000, "the review");
}
const tick = (w, sel) => { const e = w.document.querySelector(sel); e.checked = true; e.dispatchEvent(new w.Event("change")); };
const sends = (h) => h.eth.__log.map((s) => JSON.parse(s)).filter((o) => o.m === "eth_sendTransaction").map((o) => o.p[0]);
const calls = (h) => h.eth.__log.map((s) => JSON.parse(s)).filter((o) => o.m === "eth_call").map((o) => o.p[0]);
const today = () => { const d = new Date(); return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0"); };

async function run() {
  console.log("\n── VEST-100-1 · the admin Vested Drop panel (phase 1, part 3) ──");
  await H.preflight();
  for (const n of ["Locker", "LockerFactory"]) if (!fs.existsSync(path.join(H.OUT, n + ".sol", n + ".json"))) throw new Error("MISSING the " + n + " artifact (run `forge build` in the web3 contracts/) — NOTHING WAS PROVEN");
  const c = await H.chainPresale();
  const F = (n) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, c.owner); };
  const factory = await F("LockerFactory").deploy(c.addrs.sale, c.addrs.owner); await factory.waitForDeployment();
  const fAddr = await factory.getAddress();
  const MASTER = { address: c.addrs.owner };
  await c.provider.send("anvil_impersonateAccount", [c.addrs.owner]);   // the page's wallet shim sends through anvil
  await (await c.dyc.mint(c.addrs.owner, 1000000n * DEC)).wait();
  const stranger = ethers.Wallet.createRandom();
  const dycR = new ethers.Contract(c.addrs.dyc, ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"], c.provider);
  const IF = new ethers.Interface(art("LockerFactory").abi), IDYC = new ethers.Interface(["function approve(address,uint256)"]);
  const ON = { factory: fAddr };

  // ═══ VO · OFF IS OFF ═══
  console.log("\n── VO · the factory null: the admin page byte-identical to the committed sources ──");
  const OLD = { htmlSrc: HEAD("admin.html"), cfgSrc: HEAD("admin-config.js"), adminSrc: HEAD("js/admin.js") };
  ok("VO0 · the shipped admin-config.js names no LockerFactory (the panel's switch is off)", /lockerFactory: null,/.test(READ("admin-config.js")));
  for (const [who, wallet] of [["the master", MASTER], ["a stranger", stranger], ["no wallet connected", null]]) {
    const base = await visitAdmin(c, wallet, OLD); H.teardown(base.h);
    const now = await visitAdmin(c, wallet, {}); H.teardown(now.h);
    const same = base.snap.dom === now.snap.dom && JSON.stringify(base.snap.wallet) === JSON.stringify(now.snap.wallet)
      && JSON.stringify(base.snap.reads) === JSON.stringify(now.snap.reads) && base.snap.ls === now.snap.ls && JSON.stringify(base.snap.fetches) === JSON.stringify(now.snap.fetches);
    ok("VO · " + who + ": DOM, " + now.snap.wallet.length + " wallet requests in order (with params), " + now.snap.reads.length + " read-host requests and localStorage identical to HEAD; no Vested Drop panel",
       same && !now.h.w.document.querySelector("#panel-vested"),
       "dom " + (base.snap.dom === now.snap.dom) + " wallet " + firstDiff(base.snap.wallet, now.snap.wallet) + " reads " + firstDiff(base.snap.reads, now.snap.reads) + " ls " + (base.snap.ls === now.snap.ls));
  }

  // ═══ VG · THE GATE ═══
  console.log("\n── VG · the gate: factory.master() == the connected wallet, read on chain ──");
  let coinOff;
  { const v = await visitAdmin(c, MASTER, { factory: null }); coinOff = v.h.w.document.querySelector("#panel-coin").outerHTML; H.teardown(v.h); }
  const hm = await visitAdmin(c, MASTER, ON);
  const H1 = hm.h;
  {
    const p = H1.w.document.querySelector("#panel-vested");
    ok("VG1 · the master: the panel sits right after Coin Drops, enabled, and says so", !!p && p.previousElementSibling && p.previousElementSibling.id === "panel-coin"
       && !H1.w.document.querySelector("#vd-review").disabled && /master/.test(T(H1.w, "#vd-gate")) && /Your DYC balance: 1,000,000 DYC/.test(T(H1.w, "#vd-balance")), T(H1.w, "#vd-gate") + " | " + T(H1.w, "#vd-balance"));
    const mcalls = calls(H1).filter((x) => String(x.to).toLowerCase() === fAddr.toLowerCase()).map((x) => x.data.slice(0, 10));
    ok("VG1b · master() is read on chain from the factory (" + mcalls.length + " factory reads)", mcalls.indexOf(IF.getFunction("master").selector) >= 0);
    ok("VG2 · Coin Drops is byte-identical with the panel beside it", H1.w.document.querySelector("#panel-coin").outerHTML === coinOff);
  }
  {
    const { h } = await visitAdmin(c, stranger, ON);
    ok("VG3 · a stranger: the panel stays off and says why (\"" + T(h.w, "#vd-gate") + "\")",
       h.w.document.querySelector("#vd-review").disabled && /This wallet is not the factory's master \(/.test(T(h.w, "#vd-gate")));
    H.teardown(h);
  }
  {
    const { h } = await visitAdmin(c, null, ON);
    ok("VG4 · no wallet connected: off, \"" + T(h.w, "#vd-gate") + "\"", h.w.document.querySelector("#vd-review").disabled && T(h.w, "#vd-gate") === "Connect the master wallet to use this panel.");
    H.teardown(h);
  }
  {
    const { h } = await visitAdmin(c, MASTER, { factory: ethers.Wallet.createRandom().address });   // no factory there: the read fails
    ok("VG5 · a failed read keeps it off and says why in plain words", h.w.document.querySelector("#vd-review").disabled
       && T(h.w, "#vd-gate") === "Could not read the locker factory on chain, so this panel stays off. Check the connection and reload the page.", T(h.w, "#vd-gate"));
    H.teardown(h);
  }

  // ═══ VR · REFUSALS ═══
  console.log("\n── VR · refusals, per line, each with a plain reason; the whole batch blocked ──");
  const tpl = await factory.lockerImplementation();
  // a deployed locker: drop to someone first (the master, outside the page)
  const someone = ethers.Wallet.createRandom().address;
  await c.provider.send("eth_sendTransaction", [{ from: c.addrs.owner, to: c.addrs.dyc, data: IDYC.encodeFunctionData("approve", [fAddr, 10n * DEC]) }]);
  await c.provider.send("eth_sendTransaction", [{ from: c.addrs.owner, to: fAddr, data: IF.encodeFunctionData("drop", [someone, 10n * DEC, ethers.encodeBytes32String("VD-SETUP-01")]) }]);
  const deployedLocker = await factory.lockerOf(someone);
  const good = (i) => ethers.Wallet.createRandom().address + ", " + (i + 1) * 100 + ", VD-" + today() + "-" + String(i + 1).padStart(2, "0");
  const okA = ethers.Wallet.createRandom().address;
  const badCk = (() => { const a = ethers.Wallet.createRandom().address; const i = a.slice(2).search(/[a-f]/); const ch = a[2 + i].toUpperCase(); return a.slice(0, 2 + i) + ch + a.slice(3 + i); })();
  const cases = [
    ["bad checksum", badCk + ", 100, VD-A", /bad checksum/],
    ["not an address", "0x1234, 100, VD-B", /not a wallet address/],
    ["the zero address", ethers.ZeroAddress + ", 100, VD-C", /the zero address/],
    ["a deployed locker", deployedLocker + ", 100, VD-D", /this is a locker, not a wallet/],
    ["the factory", fAddr + ", 100, VD-E", /this is the locker factory, not a person's wallet/],
    ["the locker template", tpl + ", 100, VD-F", /this is the locker template/],
    ["the sale", c.addrs.sale + ", 100, VD-G", /this is the sale contract/],
    ["the vault", c.addrs.vault + ", 100, VD-H", /this is the vesting vault/],
    ["the DYC token", c.addrs.dyc + ", 100, VD-I", /this is the DYC token/],
    ["USDT", c.addrs.usdt + ", 100, VD-J", /this is USDT/],
    ["USDC", c.addrs.usdc + ", 100, VD-K", /this is USDC/],
    ["the timelock", TIMELOCK + ", 100, VD-L", /this is the timelock/],
    ["the master", c.addrs.owner + ", 100, VD-M", /this is the master wallet/],
    ["a duplicate address", okA + ", 100, VD-N", null],
    ["  …its repeat", okA + ", 200, VD-O", /repeats the address on line 14/],
    ["a zero amount", ethers.Wallet.createRandom().address + ", 0, VD-P", /the amount is zero/],
    ["a malformed amount", ethers.Wallet.createRandom().address + ", 12.5.1, VD-Q", /the amount is not a number of DYC/],
    ["a reference id with @", ethers.Wallet.createRandom().address + ", 100, ravi@example.com", /reference id must be at most 31/],
    ["a reference id with a space", ethers.Wallet.createRandom().address + ", 100, VD 2026", /reference id must be at most 31/],
    ["a reference id of 32 characters", ethers.Wallet.createRandom().address + ", 100, " + "A".repeat(32), /reference id must be at most 31/],
  ];
  await review(H1, cases.map((x) => x[1]));
  {
    const bl = badLines(H1.w), byN = {}; bl.forEach((b) => { byN[b.n] = b.t; });
    ok("VR0 · the batch is blocked: no confirm screen, no Sign button", !H1.w.document.querySelector("#vd-go") && /the whole batch is blocked/.test(T(H1.w, "#vd-confirm")));
    cases.forEach((x, i) => {
      if (!x[2]) { ok("VR · line " + (i + 1) + ", " + x[0] + ": the first one is not itself refused", !byN[String(i + 1)], byN[String(i + 1)]); return; }
      ok("VR · line " + (i + 1) + ", " + x[0] + ": refused, numbered, plain reason", !!byN[String(i + 1)] && x[2].test(byN[String(i + 1)]), byN[String(i + 1)] || "(not listed)");
    });
    const sug = (byN["18"] || "").match(/next free: (VD-\d{8}-\d{2})/);
    ok("VR21 · a refused reference id suggests the next id in the form VD-YYYYMMDD-NN (" + (sug && sug[1]) + ")", !!sug && new RegExp("^VD-" + today() + "-\\d{2}$").test(sug[1]));
    ok("VR22 · the panel shows the next id beside the input (\"" + T(H1.w, "#vd-next") + "\")", /^Next reference id: VD-\d{8}-\d{2} /.test(T(H1.w, "#vd-next")) && /^VD-\d{8}-\d{2}$/.test(H1.w.document.querySelector("#vd-ref").placeholder));
  }
  await review(H1, [good(0), "0xnot-an-address, 100, VD-" + today() + "-02", good(2), good(3).replace(/, \d+, /, ", 0, ")]);
  {
    const bl = badLines(H1.w);
    ok("VR23 · a batch with two bad lines: exactly lines 2 and 4 listed, numbered, and the batch blocked", bl.map((b) => b.n).join(",") === "2,4" && !H1.w.document.querySelector("#vd-go"), JSON.stringify(bl));
  }
  await review(H1, [good(0)], [okA, "5", "VD-" + today() + "-01"]);
  ok("VR24 · the single fields and the batch together are refused (one or the other)", T(H1.w, "#vd-confirm") === "Use either the single fields or the batch, not both.");

  // ═══ VW · THE CONTRACT WARNING ═══
  console.log("\n── VW · an address with contract code: warned, a tick before it can be sent ──");
  const contractAddr = H.MULTICALL3 || "0xcA11bde05977b3631167028862bE2a173976CA11";
  await review(H1, [contractAddr + ", 300, VD-" + today() + "-01", good(1)]);
  {
    const wr = H1.w.document.querySelector("#vd-confirm .vd-warnrow");
    ok("VW1 · warned, not refused: the ruled line, on the confirm screen", !!wr && wr.textContent.indexOf(WARN) >= 0 && badLines(H1.w).length === 0, wr ? wr.textContent : T(H1.w, "#vd-confirm"));
    tick(H1.w, "#vd-final");
    ok("VW2 · the final tick alone does not open Sign and send while the warned line is unticked", H1.w.document.querySelector("#vd-go").disabled === true);
    tick(H1.w, "#vd-confirm .vd-warntick");
    ok("VW3 · ticking the warned line (and the final tick) opens it", H1.w.document.querySelector("#vd-go").disabled === false);
    H.click(H1.w, "#vd-cancel");
  }

  // ═══ VC · THE CONFIRM SCREEN ═══
  console.log("\n── VC · the confirm screen ──");
  const p1 = ethers.Wallet.createRandom().address;
  await review(H1, null, [p1.toLowerCase(), "1500.25", "VD-" + today() + "-01"]);
  {
    const row = H1.w.document.querySelector("#vd-confirm .vd-line");
    const lk = await factory.lockerOf(p1);
    ok("VC1 · one line: the person (checksummed), their Locker (" + lk.slice(0, 8) + "…, created now), 1,500.25 DYC and its wei, and the reference id",
       !!row && T(H1.w, "#vd-confirm .vd-person") === p1 && T(H1.w, "#vd-confirm .vd-locker") === lk + "created now, by this drop"
       && T(H1.w, "#vd-confirm .vd-amt") === "1,500.25 DYC" + (150025n * DEC / 100n).toString() + " wei" && T(H1.w, "#vd-confirm .vd-ref") === "VD-" + today() + "-01",
       row ? row.textContent : "no row");
    const bal = await dycR.balanceOf(c.addrs.owner);
    ok("VC2 · the batch total and the master's DYC balance (read now)", /Batch total: 1,500\.25 DYC/.test(T(H1.w, "#vd-confirm .vd-sums")) && T(H1.w, "#vd-confirm .vd-bal") === Number(ethers.formatUnits(bal, 18)).toLocaleString("en-US", { maximumFractionDigits: 18 }) + " DYC", T(H1.w, "#vd-confirm .vd-sums"));
    ok("VC3 · Sign and send stays disabled until the final tick", H1.w.document.querySelector("#vd-go").disabled === true);
    H.click(H1.w, "#vd-cancel");
  }
  await review(H1, [someone + ", 5, VD-" + today() + "-01"]);
  ok("VC4 · a person who already has a Locker: \"already exists\"", /already exists/.test(T(H1.w, "#vd-confirm .vd-locker")));
  H.click(H1.w, "#vd-cancel");
  await review(H1, null, [ethers.Wallet.createRandom().address, "2000000", "VD-" + today() + "-01"]);
  ok("VC5 · a total above the balance is blocked: no Sign button", !H1.w.document.querySelector("#vd-go") && /The total is more than your DYC balance/.test(T(H1.w, "#vd-confirm")));

  // ═══ VS · THE SIGNING ORDER ═══
  console.log("\n── VS · simulate → sign → simulate → sign; the allowance back to 0 ──");
  const lsBefore = JSON.stringify(Object.assign({}, H1.w.localStorage));
  const people3 = [0, 1, 2].map(() => ethers.Wallet.createRandom().address);
  const amts3 = [1200n, 350n, 75n];
  await review(H1, people3.map((p, i) => p + ", " + amts3[i] + ", VD-" + today() + "-0" + (i + 1)));
  H1.eth.__log = [];
  tick(H1.w, "#vd-final");
  H.click(H1.w, "#vd-go");
  await H.until(() => /Drop landed|did not go through|could not be simulated|rejected|reverted/.test(T(H1.w, "#vd-results")), 60000, "the send").catch(() => {});
  await H.until(() => !!H1.w.document.querySelector("#vd-download"), 20000, "the read-back").catch(() => {});
  {
    const log = H1.eth.__log.map((s) => JSON.parse(s));
    const iSend = log.map((o, i) => o.m === "eth_sendTransaction" ? i : -1).filter((i) => i >= 0);
    const tot = (1200n + 350n + 75n) * DEC;
    const simApprove = log.findIndex((o) => o.m === "eth_call" && String(o.p[0].to).toLowerCase() === c.addrs.dyc.toLowerCase() && String(o.p[0].data).slice(0, 10) === IDYC.getFunction("approve").selector);
    const simDrop = log.findIndex((o) => o.m === "eth_call" && String(o.p[0].to).toLowerCase() === fAddr.toLowerCase() && String(o.p[0].data).slice(0, 10) === IF.getFunction("dropBatch").selector);
    const s = sends(H1);
    ok("VS1 · the approval is simulated before any signature (eth_call @" + simApprove + " < first send @" + iSend[0] + ")", simApprove >= 0 && iSend.length >= 1 && simApprove < iSend[0]);
    ok("VS2 · the drop is simulated after the approval landed and before its signature (@" + iSend[0] + " < " + simDrop + " < @" + iSend[1] + ")", simDrop > iSend[0] && simDrop < iSend[1]);
    const ap = s[0] ? IDYC.decodeFunctionData("approve", s[0].data) : null;
    ok("VS3 · the approval is for EXACTLY the total (" + ethers.formatUnits(tot, 18) + " DYC) to the factory — never more",
       !!ap && ap[0].toLowerCase() === fAddr.toLowerCase() && ap[1] === tot && s.every((x) => String(x.to).toLowerCase() !== c.addrs.dyc.toLowerCase() || IDYC.decodeFunctionData("approve", x.data)[1] <= tot));
    const R = H1.w.DYAdmin._road.vd;
    ok("VS4 · the gas limits: approve " + R.approveGas + ", dropBatch(3) " + R.dropGas(3) + " (from the fork run: (40,000 + 127,000 × n) × 1.5)",
       s.length === 2 && BigInt(s[0].gas) === BigInt(R.approveGas) && BigInt(s[1].gas) === BigInt(R.dropGas(3)) && R.dropGas(20) === 3870000 && R.dropGas(1) === 250500 && R.approveGas === 120000,
       s.map((x) => x.gas).join(","));
    const allow = await dycR.allowance(c.addrs.owner, fAddr);
    ok("VS5 · after a successful send the factory's allowance is 0 — on chain, and the page says so", allow === 0n && T(H1.w, "#vd-results .vd-allow") === "0 DYC", allow.toString());
    const held = await Promise.all(people3.map(async (p) => (await factory.statusOf(p))[1]));
    ok("VS6 · each Locker holds exactly its drop", held.every((v, i) => v === amts3[i] * DEC), held.join(","));
    const rb = Array.from(H1.w.document.querySelectorAll("#vd-results .vd-readback tbody tr")).map((tr) => tr.textContent.replace(/\s+/g, " ").trim());
    const lks = await Promise.all(people3.map((p) => factory.lockerOf(p)));
    ok("VS7 · the Dropped events read back from the chain, one per line, matching", /matching every line/.test(T(H1.w, "#vd-results")) && rb.length === 3
       && rb.every((r, i) => r.indexOf(people3[i]) >= 0 && r.indexOf(lks[i]) >= 0 && r.indexOf("VD-" + today() + "-0" + (i + 1)) >= 0), rb.join(" | "));
    const txh = (H1.w.document.querySelector("#vd-results .vd-tx") || { textContent: "" }).textContent.replace(/ ↗$/, "");
    ok("VS8 · the transaction is shown (" + txh.slice(0, 12) + "…)", /^0x[0-9a-f]{64}$/.test(txh));
    H.click(H1.w, "#vd-download");
    const blob = H1.w.__blobs[H1.w.__blobs.length - 1], csv = blob ? blob.parts.join("") : "";
    const want = "address,locker,amount_dyc,reference_id,transaction_hash\n" + people3.map((p, i) => [p, lks[i], amts3[i].toString(), "VD-" + today() + "-0" + (i + 1), txh].join(",")).join("\n") + "\n";
    ok("VS9 · Download record: a CSV of address, locker, amount, reference id and transaction hash (" + (H1.w.__saved && H1.w.__saved.name) + ")", csv === want && /^vested-drop-[0-9a-f]{8}\.csv$/.test(H1.w.__saved && H1.w.__saved.name), csv.slice(0, 300));
    const lsAfter = JSON.stringify(Object.assign({}, H1.w.localStorage));
    ok("VS10 · nothing stored and nothing sent anywhere: localStorage unchanged, no fetch, no host but the wallet and the read host", lsAfter === lsBefore && H1.w.__fetches.length === 0);
    ok("VS11 · the next id moves past what was sent (" + H1.w.document.querySelector("#vd-ref").placeholder + ")", H1.w.document.querySelector("#vd-ref").placeholder === "VD-" + today() + "-04");
  }
  // a drop that can no longer be simulated after the approval landed → Reset allowance to 0
  {
    const p = ethers.Wallet.createRandom().address;
    await review(H1, null, [p, "500", "VD-" + today() + "-04"]);
    tick(H1.w, "#vd-final");
    // between the confirm and the send, the master's DYC leaves (as if spent elsewhere): approve still simulates, the drop cannot
    const bal = await dycR.balanceOf(c.addrs.owner);
    const sink = ethers.Wallet.createRandom().address;
    await c.provider.send("eth_sendTransaction", [{ from: c.addrs.owner, to: c.addrs.dyc, data: new ethers.Interface(["function transfer(address,uint256)"]).encodeFunctionData("transfer", [sink, bal - 100n * DEC]) }]);
    H1.eth.__log = [];
    H.click(H1.w, "#vd-go");
    await H.until(() => !!H1.w.document.querySelector("#vd-reset"), 60000, "the reset offer").catch(() => {});
    const s = sends(H1);
    ok("VS12 · the approval landed, the drop could not be simulated → not signed, and \"Reset allowance to 0\" is offered",
       s.length === 1 && /the drop could not be simulated, so it was not signed: the wallet holds less DYC than the total/.test(T(H1.w, "#vd-results")) && !!H1.w.document.querySelector("#vd-reset"), T(H1.w, "#vd-results"));
    const a1 = await dycR.allowance(c.addrs.owner, fAddr);
    H.click(H1.w, "#vd-reset");
    await H.until(() => /now 0 DYC|Not reset/.test(T(H1.w, "#vd-reset-msg")), 60000, "the reset").catch(() => {});
    const a2 = await dycR.allowance(c.addrs.owner, fAddr);
    ok("VS13 · Reset allowance to 0: " + ethers.formatUnits(a1, 18) + " → " + ethers.formatUnits(a2, 18) + " DYC, simulated then signed, and the page says so",
       a1 === 500n * DEC && a2 === 0n && /Allowance to the factory is now 0 DYC\./.test(T(H1.w, "#vd-reset-msg")) && sends(H1).length === 2 && IDYC.decodeFunctionData("approve", sends(H1)[1].data)[1] === 0n);
    // put the DYC back for the rest
    await c.provider.send("anvil_impersonateAccount", [sink]);
    await c.provider.send("anvil_setBalance", [sink, "0xDE0B6B3A7640000"]);
    await c.provider.send("eth_sendTransaction", [{ from: sink, to: c.addrs.dyc, data: new ethers.Interface(["function transfer(address,uint256)"]).encodeFunctionData("transfer", [c.addrs.owner, bal - 100n * DEC]) }]);
  }
  // a rejected approval sends nothing and offers no reset (the allowance is 0)
  {
    await review(H1, null, [ethers.Wallet.createRandom().address, "10", "VD-" + today() + "-05"]);
    tick(H1.w, "#vd-final");
    H1.eth.__log = []; H1.eth.__reject = true;
    H.click(H1.w, "#vd-go");
    await H.until(() => /rejected/.test(T(H1.w, "#vd-results")), 30000, "the rejection").catch(() => {});
    await H.sleep(1500);
    ok("VS14 · the approval rejected in the wallet: nothing sent, the allowance 0, no reset offered", /The approval was rejected in your wallet; nothing was sent\./.test(T(H1.w, "#vd-results"))
       && (await dycR.allowance(c.addrs.owner, fAddr)) === 0n && !H1.w.document.querySelector("#vd-reset") && /Allowance to the factory: 0 DYC\./.test(T(H1.w, "#vd-results")), T(H1.w, "#vd-results"));
  }

  // ═══ VL · THE BATCH LIMIT ═══
  console.log("\n── VL · at most 20 lines per batch ──");
  {
    const lines = []; for (let i = 0; i < 21; i++) lines.push(good(i));
    H1.eth.__log = [];
    await review(H1, lines);
    ok("VL1 · 21 lines: refused before any chain read, with a plain reason", T(H1.w, "#vd-confirm") === "A batch takes at most 20 lines; this one has 21. Split it into batches of 20 or fewer." && calls(H1).length === 0, T(H1.w, "#vd-confirm"));
    const twenty = lines.slice(0, 20), who = twenty.map((l) => l.split(",")[0]);
    await review(H1, twenty);
    ok("VL2 · 20 lines: the confirm screen lists all 20", H1.w.document.querySelectorAll("#vd-confirm .vd-line").length === 20 && /created now/.test(T(H1.w, "#vd-confirm")));
    tick(H1.w, "#vd-final");
    H1.eth.__log = [];
    H.click(H1.w, "#vd-go");
    await H.until(() => !!H1.w.document.querySelector("#vd-download") || /did not go through|could not|rejected|reverted/.test(T(H1.w, "#vd-results")), 90000, "the batch of 20").catch(() => {});
    const held = await Promise.all(who.map(async (p) => (await factory.statusOf(p))[1]));
    const s = sends(H1);
    ok("VL3 · a full batch of 20 to new Lockers lands in one dropBatch (gas limit " + (s[1] ? Number(s[1].gas) : "—") + "), every Locker holds its drop, the allowance is 0, 20 events read back",
       s.length === 2 && Number(s[1].gas) === 3870000 && held.every((v, i) => v === BigInt((i + 1) * 100) * DEC) && (await dycR.allowance(c.addrs.owner, fAddr)) === 0n
       && H1.w.document.querySelectorAll("#vd-results .vd-readback tbody tr").length === 20, held.join(",") + " | " + T(H1.w, "#vd-results").slice(0, 200));
  }
  H.teardown(H1);

  // ═══ VB · BREAKAGES ═══
  console.log("\n── VB · breakages: each guard put back wrong turns its check red ──");
  const SRC = READ("js/admin.js");
  const mutant = async (label, from, to, probe) => {
    if (SRC.indexOf(from) < 0) { ok(label + " (mutation site missing!)", false); return; }
    const { h } = await visitAdmin(c, MASTER, Object.assign({ adminSrc: SRC.replace(from, to) }, ON));
    let caught = false;
    try { caught = await probe(h); } catch (e) { caught = true; }
    ok(label, caught);
    H.teardown(h);
  };
  await mutant("VB1 · an approval above the total is caught (VS3 goes red)",
    "return t.approve(VD_FACTORY, total, ov(VD_APPROVE_GAS));", "return t.approve(VD_FACTORY, total + 1n, ov(VD_APPROVE_GAS));",
    async (h) => {
      await review(h, null, [ethers.Wallet.createRandom().address, "3", "VD-" + today() + "-09"]);
      tick(h.w, "#vd-final"); h.eth.__log = []; H.click(h.w, "#vd-go");
      await H.until(() => sends(h).length >= 1, 30000, "a send").catch(() => {});
      await H.sleep(4000);
      const s = sends(h); const ap = s[0] ? IDYC.decodeFunctionData("approve", s[0].data) : null;
      const left = await dycR.allowance(c.addrs.owner, fAddr);
      if (left > 0n) await c.provider.send("eth_sendTransaction", [{ from: c.addrs.owner, to: c.addrs.dyc, data: IDYC.encodeFunctionData("approve", [fAddr, 0n]) }]);
      return !(ap && ap[1] === 3n * DEC) || left !== 0n;
    });
  await mutant("VB2 · skipping the drop's simulation is caught (VS2 goes red)",
    "return (batch ? f.dropBatch.staticCall(people, amounts, refs) : f.drop.staticCall(people[0], amounts[0], refs[0])).catch(",
    "return Promise.resolve().catch(",
    async (h) => {
      await review(h, null, [ethers.Wallet.createRandom().address, "3", "VD-" + today() + "-10"]);
      tick(h.w, "#vd-final"); h.eth.__log = []; H.click(h.w, "#vd-go");
      await H.until(() => sends(h).length >= 2 || /did not|could not/.test(T(h.w, "#vd-results")), 60000, "two sends").catch(() => {});
      await H.sleep(2000);
      const log = h.eth.__log.map((s) => JSON.parse(s));
      const iSend = log.map((o, i) => o.m === "eth_sendTransaction" ? i : -1).filter((i) => i >= 0);
      const simDrop = log.findIndex((o) => o.m === "eth_call" && String(o.p[0].to).toLowerCase() === fAddr.toLowerCase() && String(o.p[0].data).slice(0, 10) === IF.getFunction("drop").selector);
      return !(simDrop > iSend[0] && simDrop < iSend[1]);
    });
  await mutant("VB3 · dropping the locker check is caught (the deployed-locker line goes through, VR goes red)",
    "if (r[0]) { x.why.push(\"this is a locker, not a wallet — enter the person's own wallet\"); return; }", "",
    async (h) => {
      await review(h, [deployedLocker + ", 1, VD-X"]);
      return !badLines(h.w).some((b) => /this is a locker/.test(b.t));
    });
  await mutant("VB4 · a gate that ignores master() is caught (VG3 goes red)",
    "if (!eq(r[0], me)) {", "if (false) {",
    async () => {
      const { h } = await visitAdmin(c, stranger, Object.assign({ adminSrc: SRC.replace("if (!eq(r[0], me)) {", "if (false) {") }, ON));
      const open = !h.w.document.querySelector("#vd-review").disabled;
      H.teardown(h);
      return open;
    });

  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.error(e); process.exit(1); });
