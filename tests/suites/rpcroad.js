"use strict";
// RPC-CLEANUP-1 (owner rulings 2026-10-30) — ONE ROAD. Every site read, history scans included, rides our own read proxy
// (rpc.divyayuddha.games → dy-rpc → a keyed provider). No page may contact a free public RPC, and a proxy that is down or
// refusing shows the page's plain error state — never a silent hang, never a fall-through to a free host.
//
// The proxy under test is the REAL dy-rpc (../dy-rpc/src/server.js), run locally with anvil as its upstream and the
// local contracts as its allow-list. The pages are the REAL pages (tests/lib.js harness) on their SHIPPED endpoints:
// ethers' transport (FetchRequest.registerGetUrl) routes rpc.divyayuddha.games to the local dy-rpc, lets 127.0.0.1
// through, and REFUSES and RECORDS every other host — so "no free public RPC" is measured, not asserted.
//
//   SRC  · the source scan: no free RPC hostname in any shipped page/script (the one sanctioned exception: config.js
//          rpcUrls — what MetaMask is offered when it adds Polygon, the wallet's own SEND road — owner ruling C)
//   DASH · the dashboard on the shipped road: the six feed filters as ONE getLogs over the whole history, decoded right
//   STORE· the store + the wallet.js scan road on the shipped road: the whole history in ONE getLogs
//   CON  · the owner console's Torana claims completes in ONE press on the fork, with no Read RPC URL set
//   ERR  · dy-rpc refusing (upstream down) / the proxy host answering 500 → the plain error state within the time limit
//   M    · deliberate breakages (drpc put back, the scan list put back, the error state removed), each caught
const fs = require("fs");
const path = require("path");
const http = require("http");
const { ethers } = require("ethers");
const { JSDOM, VirtualConsole } = require("jsdom");
const H = require("../lib");

const SITE = H.SITE;
const PROXY_HOST = "rpc.divyayuddha.games";
const DYRPC_SRC = path.resolve(SITE, "..", "dy-rpc", "src");
const DEC = 10n ** 18n, DEC6 = 10n ** 6n;
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const txt = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, " ") : ""; };
const FREE_HOSTS = /drpc\.org|publicnode\.com|tenderly\.co|1rpc\.io|polygon-rpc\.com|llamarpc\.com|ankr\.com|alchemy\.com|infura\.io|quiknode\.pro|blastapi\.io|chainstack\.com|thirdweb\.com|blockpi\.network|gateway\.fm|onfinality\.io|nodies\.app|meowrpc\.com|polygon\.api\.onfinality/i;

// ── the transport: rpc.divyayuddha.games → the local dy-rpc; 127.0.0.1 passes; EVERY other host is refused + recorded ──
const baseGetUrl = ethers.FetchRequest.createGetUrlFunc();
const T = { proxyTo: null, hosts: [], violations: [] };
ethers.FetchRequest.registerGetUrl(async (req, signal) => {
  const u = new URL(req.url);
  T.hosts.push(u.host);
  if (u.hostname === PROXY_HOST) {
    if (!T.proxyTo) throw new Error("the suite has no proxy routed");
    const r2 = new ethers.FetchRequest(T.proxyTo);
    r2.method = req.method; r2.body = req.body;
    for (const [k, v] of req) r2.setHeader(k, v);
    return baseGetUrl(r2, signal);
  }
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return baseGetUrl(req, signal);
  T.violations.push(u.host);
  throw new Error("refused by the suite: " + u.host);
});
const resetT = () => { T.hosts.length = 0; T.violations.length = 0; };

// ── the REAL dy-rpc, fresh per scenario (its policy reads the environment at require time) ──
function startDyRpc(upstream, targets) {
  Object.assign(process.env, { UPSTREAM_RPC_URL: upstream, ALLOWED_TARGETS: targets.join(","), RATE_IP_PER_MIN: "100000",
    RATE_IP_PER_HOUR: "1000000", RATE_GLOBAL_PER_SEC: "100000", UPSTREAM_TIMEOUT_MS: "3000", UPSTREAM_LOGS_TIMEOUT_MS: "20000" });
  delete process.env.MAX_LOG_SPAN; delete process.env.UPSTREAM_RPC_URL_2;
  for (const f of ["policy.js", "server.js"]) delete require.cache[require.resolve(path.join(DYRPC_SRC, f))];
  const { create } = require(path.join(DYRPC_SRC, "server.js"));
  const logs = [];
  const srv = create({ log: (l) => logs.push(l) });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, logs, url: "http://127.0.0.1:" + srv.address().port })));
}
const getLogsServed = (logs) => logs.filter((l) => /^method=eth_getLogs status=200/.test(l) && !/refused|upstream=fail/.test(l)).length;
function http500() {
  const srv = http.createServer((req, res) => { req.resume(); req.on("end", () => { res.writeHead(500); res.end("render is down"); }); });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, url: "http://127.0.0.1:" + srv.address().port })));
}

// ── a presale chain with two buyers on the REAL DYCoinSale (vouchers signed by the bot's own signer module) ──
const { makeSigner } = require(path.join(H.W3, "services", "approval-bot", "src", "signer.js"));
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(H.OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
async function presaleChain() {
  const c = await H.chainPresale();
  const F = (n) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, c.owner); };
  const nft = await F("AccessNFT").deploy(c.addrs.owner, "ipfs://torana/"); await nft.waitForDeployment();
  const claim = await F("ToranaIcoClaim").deploy(c.addrs.sale, await nft.getAddress()); await claim.waitForDeployment();
  await (await nft.setMinter(await claim.getAddress(), true)).wait();
  c.addrs.nft = await nft.getAddress(); c.addrs.claim = await claim.getAddress();
  return c;
}
async function buy(c, who, usd) {
  const chainId = Number((await c.provider.getNetwork()).chainId);
  const sig = await makeSigner(c.signer.privateKey, chainId, c.addrs.sale).sign(who.address);
  const amt = BigInt(usd) * DEC6;
  if (who.address.toLowerCase() !== c.player.address.toLowerCase()) await (await c.usdt.connect(c.owner).mint(who.address, amt)).wait();
  const n = Number(await c.provider.send("eth_getTransactionCount", [who.address, "pending"]));
  await (await c.usdt.connect(who).approve(c.addrs.sale, amt, { nonce: n })).wait();
  await (await c.sale.connect(who).buyWithStable(c.addrs.usdt, amt, sig, "", { nonce: n + 1 })).wait();
}

// ── the console, booted headless as admin.html loads it (consoleroad's boot), with REAL ethers and a wallet ──
function bootConsole(c) {
  const errs = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", (e) => errs.push(String(e && e.message)));
  const html = fs.readFileSync(path.join(SITE, "admin.html"), "utf8");
  const scripts = [];
  const markup = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (m, attrs) => {
    const src = /\bsrc="([^"?]+)/.exec(attrs);
    if (!src || /^https?:/.test(src[1])) return "";
    scripts.push(fs.readFileSync(path.join(SITE, src[1]), "utf8"));
    return "";
  });
  const dom = new JSDOM(markup, { url: "https://divyayuddha.games/admin.html", runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.fetch = (u) => { T.hosts.push(new URL(String(u)).host); if (FREE_HOSTS.test(String(u))) T.violations.push(new URL(String(u)).host); return Promise.reject(new Error("no fetch in the suite")); };
  w.ethers = ethers;
  w.ethereum = H.makeEthereum(c.player, c.provider);
  w.eval(scripts.join("\n;\n"));
  w.DYWallet.loadEthers = () => Promise.resolve(ethers);
  return { w, road: w.DYAdmin && w.DYAdmin._road, errs, dom };
}

// ── the SOURCE scan: every shipped page/script, comments stripped; the ONE sanctioned line is config.js rpcUrls ──
function stripComments(src) {
  let out = "", i = 0, n = src.length, line = false, block = false, q = null;
  while (i < n) {
    const ch = src[i], d = src[i + 1];
    if (line) { if (ch === "\n") { line = false; out += ch; } i++; continue; }
    if (block) { if (ch === "*" && d === "/") { block = false; i += 2; continue; } if (ch === "\n") out += ch; i++; continue; }
    if (q) { out += ch; if (ch === "\\") { out += d || ""; i += 2; continue; } if (ch === q) q = null; i++; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; out += ch; i++; continue; }
    if (ch === "/" && d === "/") { line = true; i += 2; continue; }
    if (ch === "/" && d === "*") { block = true; i += 2; continue; }
    out += ch; i++;
  }
  return out;
}
function shippedFiles() {
  const tracked = require("child_process").execFileSync("git", ["ls-files"], { cwd: SITE, encoding: "utf8" }).split("\n").filter(Boolean);
  return tracked.filter((f) => /\.(js|html)$/.test(f) && !/^(tests|docs|tmp|scripts|node_modules)\//.test(f) && !/\/node_modules\//.test(f) && !/^game\/assets\/vendor\//.test(f));
}
function sourceViolations(override) {
  const hits = [];
  for (const f of shippedFiles()) {
    let t = (override && override[f] != null) ? override[f] : fs.readFileSync(path.join(SITE, f), "utf8");
    t = stripComments(t);
    if (f === "config.js") t = t.replace(/\n\s*rpcUrls:\s*\[[^\]]*\],/, "\n");   // owner ruling C: MetaMask's suggested network, never a site read
    const m = FREE_HOSTS.exec(t);
    if (m) hits.push(f + " :: " + m[0]);
  }
  return hits;
}

async function run() {
  console.log("\n── RPC-CLEANUP-1 · one road: no free public RPC, plain error states ──");
  await H.preflight();
  if (!fs.existsSync(path.join(DYRPC_SRC, "server.js"))) { ok("the dy-rpc checkout is beside this repo (../dy-rpc)", false, DYRPC_SRC); process.exit(1); }

  // ════════ SRC · no free public RPC anywhere in the shipped site ════════
  {
    const hits = sourceViolations();
    ok("SRC1 · no free public RPC hostname in ANY shipped page or script (" + shippedFiles().length + " files; the one exception is config.js rpcUrls, owner ruling C)",
       hits.length === 0, hits.join(" | "));
    const cfg = fs.readFileSync(path.join(SITE, "config.js"), "utf8");
    ok("SRC2 · and that exception is exactly MetaMask's suggested network (rpcUrls) — the READ road names only the proxy",
       /rpcUrls: \["https:\/\/polygon-bor-rpc\.publicnode\.com", "https:\/\/polygon\.drpc\.org"\]/.test(cfg) && /readRpcUrls: \["https:\/\/rpc\.divyayuddha\.games"\]/.test(cfg));
    const wallet = fs.readFileSync(path.join(SITE, "js", "wallet.js"), "utf8"), dash = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8"), rep = fs.readFileSync(path.join(SITE, "js", "report.js"), "utf8");
    ok("SRC3 · no page builds a read from MetaMask's rpcUrls (the hidden fallbacks dashboard.js:463, wallet.js:362/:479 and report.js are gone)",
       !/rpcUrls\[\d\]/.test(stripComments(wallet)) && !/rpcUrls\[\d\]/.test(stripComments(dash)) && !/rpcUrls\[\d\]/.test(stripComments(rep)));
  }

  // ════════ DASH · the dashboard on the shipped road ════════
  {
    const c = await presaleChain();
    await buy(c, c.player, 120);
    const dy = await startDyRpc(H.RPC, [c.addrs.sale, c.addrs.vault, c.addrs.dyc, c.addrs.usdt, c.addrs.usdc, c.addrs.claim, c.addrs.nft]);
    T.proxyTo = dy.url; resetT();
    const h = await H.dashboardPage(c, c.player, { shippedRoads: true, contracts: { dycoinSale: c.addrs.sale, vestingVault: c.addrs.vault },
      ls: { "dymf::config": JSON.stringify({ deployBlock: 1 }) } });
    await h.w.DYWallet.connect();
    let landed = true;
    try { await H.until(() => /Bought DYC/.test(txt(h.w, "#tx-body")), 25000, "the buy in the feed"); } catch (e) { landed = false; }
    ok("DASH1 · the dashboard's feed shows the buy — the ONE combined getLogs decodes the right row (Purchased → 'Bought DYC')",
       landed && /Bought DYC/.test(txt(h.w, "#tx-body")), txt(h.w, "#tx-body").slice(0, 200));
    ok("DASH2 · the whole history (block 1 → head) took at most 2 getLogs on the proxy (the forward pass + the backfill), not hundreds",
       getLogsServed(dy.logs) >= 1 && getLogsServed(dy.logs) <= 2, "getLogs=" + getLogsServed(dy.logs));
    ok("DASH3 · NO host but the proxy (and the local wallet) was contacted — 0 requests to drpc/publicnode/tenderly or any other",
       T.violations.length === 0 && T.hosts.some((x) => x === PROXY_HOST) && !h.w.__fetches.some((u) => FREE_HOSTS.test(u)),
       JSON.stringify({ violations: T.violations, hosts: Array.from(new Set(T.hosts)) }));
    ok("DASH4 · control: on the healthy road the dashboard shows NO error line (so ERR1/ERR2 below are failure-specific)",
       !/Network connection trouble/.test(txt(h.w, "#liq-note")) && txt(h.w, "#liq-amt") !== "—", txt(h.w, "#liq-note") + " / " + txt(h.w, "#liq-amt"));
    H.teardown(h); dy.srv.close();
  }

  // ════════ STORE · the store + the wallet.js scan road ════════
  {
    const c = await H.chainStore();
    const dy = await startDyRpc(H.RPC, [c.addrs.ps, c.addrs.usdc, c.addrs.usdt, c.addrs.nft, c.addrs.dyc]);
    T.proxyTo = dy.url; resetT();
    const h = await H.storePage(c, c.player, { shippedRoads: true });
    let landed = true;
    try { await H.until(() => /In stock/.test(txt(h.w, "#bundle-body")), 20000, "In stock on the proxy"); } catch (e) { landed = false; }
    ok("STORE1 · the store's tile reads 'In stock' over the shipped road (the proxy)", landed, txt(h.w, "#bundle-body").slice(0, 160) + " || dy-rpc: " + dy.logs.slice(-8).join(" | ") + " || hosts: " + JSON.stringify(Array.from(new Set(T.hosts))));
    const before = getLogsServed(dy.logs);
    const nft = new ethers.Contract(c.addrs.nft, ["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"], h.w.DYWallet.readProvider());
    const r = await h.w.DYWallet.scanLogsResumable(nft, nft.filters.Transfer(), 1, 15000, "dyrr::scan");
    ok("STORE2 · the wallet.js scan road (treasury holdings / listings) reads the WHOLE history in ONE getLogs on the proxy",
       r && r.complete === true && getLogsServed(dy.logs) - before === 1, "getLogs=" + (getLogsServed(dy.logs) - before));
    ok("STORE3 · and nothing but the proxy was contacted", T.violations.length === 0, JSON.stringify(T.violations));
    H.teardown(h); dy.srv.close();
  }

  // ════════ CON · the owner console: Torana claims in ONE press, no Read RPC URL ════════
  {
    const c = await presaleChain();
    await buy(c, c.player, 120);                                   // eligible (USD 100+)
    const second = new ethers.Wallet("0x" + "5".repeat(64), c.provider);
    await (await c.owner.sendTransaction({ to: second.address, value: 10n ** 18n })).wait();
    await buy(c, second, 60);                                      // below USD 100
    const dy = await startDyRpc(H.RPC, [c.addrs.sale, c.addrs.claim, c.addrs.nft]);
    T.proxyTo = dy.url; resetT();
    const B = bootConsole(c);
    const chainId = Number((await c.provider.getNetwork()).chainId);
    B.w.DY_CONFIG.chain.id = chainId; B.w.DY_CONFIG.chain.idHex = "0x" + chainId.toString(16);
    B.w.localStorage.setItem("dyadmin::config", JSON.stringify({ deployBlock: 1, dycoinSale: c.addrs.sale, toranaClaim: c.addrs.claim }));
    const t0 = Date.now();
    B.road.toranaFindEligible();                                   // the button's own onclick — ONE press
    let done = true;
    try { await H.until(() => /Read complete/.test(txt(B.w, "#torana-status")), 30000, "the Torana claims read"); } catch (e) { done = false; }
    const secs = (Date.now() - t0) / 1000;
    ok("CON1 · ONE press of 'Find eligible' completes the Torana claims read — no Read RPC URL set, " + secs.toFixed(1) + " s",
       done, txt(B.w, "#torana-status"));
    const count = txt(B.w, "#torana-count");
    ok("CON2 · it reads the right standings from the chain: 1 eligible (USD 120), 1 below USD 100 (USD 60)",
       /^1 eligible/.test(count) && /1 below USD 100/.test(count), count);
    ok("CON3 · the whole sale history was ONE getLogs on the proxy — no width discovery, no depth probe, no chunk walk",
       getLogsServed(dy.logs) === 1, "getLogs=" + getLogsServed(dy.logs) + " · " + dy.logs.filter((l) => /getLogs/.test(l)).join(" | "));
    ok("CON4 · and the console contacted no free public RPC", T.violations.length === 0, JSON.stringify(T.violations));
    B.dom.window.close(); dy.srv.close();
  }

  // ════════ ERR · the plain error state, within the time limit ════════
  async function dashboardFailing(proxyTo, dashSrc) {
    const c = await presaleChain();
    T.proxyTo = proxyTo; resetT();
    const h = await H.dashboardPage(c, c.player, { shippedRoads: true, contracts: { dycoinSale: c.addrs.sale, vestingVault: c.addrs.vault },
      ls: { "dymf::config": JSON.stringify({ deployBlock: 1 }) }, dashSrc });
    await h.w.DYWallet.connect();
    const t0 = Date.now();
    let shown = true;
    try { await H.until(() => /Network connection trouble/.test(txt(h.w, "#liq-note")), 15000, "the plain error state"); } catch (e) { shown = false; }
    const out = { shown, secs: (Date.now() - t0) / 1000, note: txt(h.w, "#liq-note"), violations: T.violations.slice() };
    H.teardown(h);
    return out;
  }
  {
    const dy = await startDyRpc("http://127.0.0.1:1", ["0x0000000000000000000000000000000000000001"]);   // the proxy is UP, its upstream is DOWN
    const r = await dashboardFailing(dy.url);
    ok("ERR1 · dy-rpc REFUSING (its provider unreachable): the dashboard shows its plain error state within 15 s (" + r.secs.toFixed(1) + " s) — never a silent hang",
       r.shown, r.note);
    ok("ERR1b · and it fell through to NO free public RPC", r.violations.length === 0, JSON.stringify(r.violations));
    dy.srv.close();
  }
  {
    const down = await http500();                                   // the proxy HOST itself answers 500 (Render down)
    const r = await dashboardFailing(down.url);
    ok("ERR2 · the proxy host answering HTTP 500: the plain error state within 15 s (" + r.secs.toFixed(1) + " s)", r.shown, r.note);
    ok("ERR2b · and no free public RPC was asked instead", r.violations.length === 0, JSON.stringify(r.violations));
    down.srv.close();
  }
  {
    const c = await H.chainStore();
    const dy = await startDyRpc("http://127.0.0.1:1", [c.addrs.ps]);
    T.proxyTo = dy.url; resetT();
    const h = await H.storePage(c, c.player, { shippedRoads: true });
    const t0 = Date.now();
    let shown = true;
    try { await H.until(() => /unavailable - refresh to retry/.test(txt(h.w, "#bundle-body")), 20000, "the store's plain error state"); } catch (e) { shown = false; }
    ok("ERR3 · dy-rpc refusing: the store's tile shows its plain 'unavailable - refresh to retry' within 20 s (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)",
       shown && T.violations.length === 0, txt(h.w, "#bundle-body").slice(0, 160) + " " + JSON.stringify(T.violations));
    H.teardown(h); dy.srv.close();
  }
  {
    const c = await presaleChain();
    const dy = await startDyRpc("http://127.0.0.1:1", [c.addrs.sale, c.addrs.claim]);
    T.proxyTo = dy.url; resetT();
    const B = bootConsole(c);
    const chainId = Number((await c.provider.getNetwork()).chainId);
    B.w.DY_CONFIG.chain.id = chainId;
    B.w.localStorage.setItem("dyadmin::config", JSON.stringify({ deployBlock: 1, dycoinSale: c.addrs.sale, toranaClaim: c.addrs.claim }));
    const t0 = Date.now();
    B.road.toranaFindEligible();
    let shown = true;
    try { await H.until(() => /busy or unreachable/.test(txt(B.w, "#torana-status")), 30000, "the console's plain error state"); } catch (e) { shown = false; }
    ok("ERR4 · dy-rpc refusing: the console's Torana claims shows its plain 'busy or unreachable — try again' within 30 s (" + ((Date.now() - t0) / 1000).toFixed(1) + " s), the button re-enabled",
       shown && B.w.document.getElementById("torana-find").disabled === false && T.violations.length === 0, txt(B.w, "#torana-status"));
    B.dom.window.close(); dy.srv.close();
  }

  // ════════ M · deliberate breakages, each caught ════════
  {
    const cfg = fs.readFileSync(path.join(SITE, "config.js"), "utf8");
    const back = cfg.replace('readRpcUrls: ["https://rpc.divyayuddha.games"],', 'readRpcUrls: ["https://rpc.divyayuddha.games", "https://polygon.drpc.org"],');
    ok("M1 · DRPC PUT BACK on the read road (config.js) — CAUGHT by the source scan",
       back !== cfg && sourceViolations({ "config.js": back }).some((x) => /config\.js :: drpc\.org/.test(x)));
    const hall = fs.readFileSync(path.join(SITE, "mp", "hall.js"), "utf8");
    const hallBack = hall.replace("  var READ_BACKOFF_MS = 400;", '  var HALL_READ_FALLBACKS = ["https://polygon.drpc.org"];\n  var READ_BACKOFF_MS = 400;');
    ok("M1b · …and the Hall's drpc fallback put back — CAUGHT", hallBack !== hall && sourceViolations({ "mp/hall.js": hallBack }).length > 0);
  }
  {
    // the scan list put back: wallet.js's scan road pointed at a keyless list again — caught at RUNTIME by the transport
    const wsrc = fs.readFileSync(path.join(SITE, "js", "wallet.js"), "utf8");
    const from = "    var url = readUrls()[0];\n";
    const mut = wsrc.replace(from, '    var url = (CFG.chain.scanRpcUrls && CFG.chain.scanRpcUrls[0]) || readUrls()[0];\n');
    let caught = false;
    if (mut === wsrc) ok("M2 · the scan road's line was found", false);
    else {
      const c = await presaleChain();
      const dy = await startDyRpc(H.RPC, [c.addrs.sale, c.addrs.vault, c.addrs.dyc, c.addrs.nft]);
      T.proxyTo = dy.url; resetT();
      const h = await H.dashboardPage(c, c.player, { shippedRoads: true, walletSrc: mut });
      h.w.DY_CONFIG.chain.scanRpcUrls = ["https://polygon-bor-rpc.publicnode.com"];
      const nft = new ethers.Contract(c.addrs.sale, ["event Purchased(address indexed buyer, uint8 round, address asset, uint256 paid, uint256 usdE18, uint256 dycOut, uint256 liquid)"], h.w.DYWallet.readProvider());
      await h.w.DYWallet.scanLogsResumable(nft, nft.filters.Purchased(), 1, 8000, "dyrr::m2").catch(() => null);
      caught = T.violations.some((x) => /publicnode/.test(x));   // the RUNTIME transport saw the page reach for it
      H.teardown(h); dy.srv.close();
    }
    ok("M2 · THE SCAN LIST PUT BACK (wallet.js scans a keyless list again) — CAUGHT: the page reached for publicnode", caught);
  }
  {
    // the error state removed: the dashboard's plain line blanked — ERR1's check goes red
    const dsrc = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8");
    const a = '      ? "Network connection trouble — retrying…"\n      : "Network connection trouble. <a href=\'#\' class=\'read-retry\' style=\'color:var(--gold-burnished)\'>Tap to retry</a>";';
    if (dsrc.split(a).length !== 2) ok("M3 · the error line was found exactly once", false);
    else {
      const mut = dsrc.replace(a, '      ? ""\n      : "";');
      const dy = await startDyRpc("http://127.0.0.1:1", ["0x0000000000000000000000000000000000000001"]);
      const r = await dashboardFailing(dy.url, mut);
      ok("M3 · THE ERROR STATE REMOVED (the dashboard's plain line blanked) — CAUGHT: ERR1 goes red", !r.shown, r.note);
      dy.srv.close();
    }
  }

  ethers.FetchRequest.registerGetUrl(baseGetUrl);
  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("rpcroad suite crashed:", e); process.exit(1); });
