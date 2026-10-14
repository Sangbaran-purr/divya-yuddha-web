"use strict";
// READ-PROXY-2 — our own read proxy (rpc.divyayuddha.games) first on the FAST read road; the scans never touch it.
//
// The endpoints are REAL local HTTP servers (the storeread idiom): a stand-in "proxy" that records what it is asked
// and forwards to anvil (or is dead), and stand-ins for the keyless endpoints. The shipped config is read from disk
// for the ordering laws; the behaviour is proven on the real store page, the real wallet read road and the real
// getLogs scan road.
const fs = require("fs");
const path = require("path");
const http = require("http");
const H = require("../lib");

const SITE = path.resolve(__dirname, "..", "..");
const PROXY = "https://rpc.divyayuddha.games";
const PUBLICNODE = "https://polygon-bor-rpc.publicnode.com", DRPC = "https://polygon.drpc.org", TENDERLY = "https://polygon.gateway.tenderly.co";
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } }
const bodyText = (w) => { const e = w.document.getElementById("bundle-body"); return e ? e.textContent.replace(/\s+/g, " ") : ""; };

function recorder(upstream, mode) {
  const hits = [];
  const srv = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", async () => {
      let p = null; try { p = JSON.parse(b); } catch (_) {}
      (Array.isArray(p) ? p : [p]).forEach((q) => hits.push(q && q.method));
      if (mode === "dead") { req.socket.destroy(); return; }
      // passes the once-per-visit chain check, then fails every read (a cold start / an upstream 502)
      if (mode === "deadAfterChain" && !(Array.isArray(p) ? p : [p]).every((q) => q && q.method === "eth_chainId")) { res.writeHead(502); return res.end("bad gateway"); }
      try {
        const r = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" }, body: b });
        res.writeHead(200, { "content-type": "application/json" }); res.end(await r.text());
      } catch (e) { res.writeHead(502); res.end("proxy failed"); }
    });
  });
  return new Promise((r) => srv.listen(0, () => r({ srv, hits, url: "http://127.0.0.1:" + srv.address().port })));
}
function loadConfigs() {
  const w = { location: { hostname: "divyayuddha.games" } };
  const f = new Function("window", "document", fs.readFileSync(path.join(SITE, "config.js"), "utf8") + "\n" + fs.readFileSync(path.join(SITE, "mf-config.js"), "utf8") + "\n;return window;");
  return f(w, {});
}

async function run() {
  console.log("\n── READ-PROXY-2 · the read proxy first; the scans keyless ──");
  await H.preflight();
  const RPC = process.env.DY_RPC || "http://127.0.0.1:8545";

  // ════════ THE SHIPPED CONFIG ════════
  {
    const w = loadConfigs();
    const chain = w.DY_CONFIG.chain, mf = w.DY_MF_CONFIG;
    ok("C1 · config.js: the read road is the proxy FIRST, then publicnode, drpc, tenderly",
       JSON.stringify(chain.readRpcUrls) === JSON.stringify([PROXY, PUBLICNODE, DRPC, TENDERLY]), JSON.stringify(chain.readRpcUrls));
    ok("C2 · the scan road's keyless list carries NO proxy (publicnode, drpc, tenderly)",
       JSON.stringify(chain.scanRpcUrls) === JSON.stringify([PUBLICNODE, DRPC, TENDERLY]));
    ok("C3 · mf-config.js: the proxy is the primary read endpoint, publicnode moved into the fallbacks (dashboard + report)",
       mf.readRpcUrl === PROXY && JSON.stringify(mf.readRpcUrlFallbacks) === JSON.stringify([PUBLICNODE, DRPC]), mf.readRpcUrl + " " + JSON.stringify(mf.readRpcUrlFallbacks));
    const shipped = ["config.js", "mf-config.js", "admin-config.js"].concat(fs.readdirSync(path.join(SITE, "js")).filter((f) => /\.js$/.test(f)).map((f) => "js/" + f))
      .concat(["index.html", "store.html", "dashboard.html", "report.html", "rite.html", "treasury.html", "mint.html", "register.html", "admin.html", "mp/hall.js"]);
    const with1rpc = shipped.filter((f) => { try { return /1rpc\.io/.test(fs.readFileSync(path.join(SITE, f), "utf8")); } catch (e) { return false; } });
    ok("C4 · 1rpc.io is GONE from every shipped file (it sends no CORS header — it could never serve the browser)", with1rpc.length === 0, with1rpc.join(", "));
  }

  // ════════ THE SCAN ROADS ARE PINNED (source) ════════
  {
    const dash = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8"), rep = fs.readFileSync(path.join(SITE, "js", "report.js"), "utf8");
    // the function's CODE, comments stripped (a comment may name readRpcUrl to say it is NOT used)
    const body = (src, name) => { const i = src.indexOf("function " + name + "("); return i < 0 ? "" : src.slice(i, src.indexOf("\n  }", i) + 4).replace(/(^|[^:])\/\/[^\n]*/g, "$1"); };   // a URL's "://" is not a comment
    const dl = body(dash, "logProvider"), rl = (rep.match(/function logProvider\(\) \{[^\n]*\}/) || [""])[0];
    ok("S1 · the dashboard's logProvider rides chain.scanRpcUrls and never readRpcUrl", /scanRpcUrls/.test(dl) && !/readRpcUrl\b/.test(dl) && !/readRpcUrlFallbacks/.test(dl), dl.slice(0, 300));
    ok("S2 · the report's logProvider rides chain.scanRpcUrls and never readRpcUrl", /scanRpcUrls/.test(rl) && !/readRpcUrl\b|readRpcUrlFallbacks/.test(rl), rl);
    ok("S3 · the dashboard's diagnostics list the scan road as the keyless list", /var logUrls = \(\(PLAYER\.chain && PLAYER\.chain\.scanRpcUrls\) \|\| \[\]\)/.test(dash));
  }

  // ════════ THE BUYER'S STORE: the proxy answers first ════════
  {
    const c = await H.chainStore();
    const proxy = await recorder(RPC), pn = await recorder(RPC);
    // the proxy stand-in carries a PATH and a QUERY, so the console line is proven to print the hostname alone
    // (the query is deliberately NOT a keyed-URL shape — consoleroad G2 scans every tracked file for those)
    const h = await H.storePage(c, c.player, { readUrls: [proxy.url + "/node/v1?k=SECRETVALUE", pn.url], captureConsole: true });
    await H.until(() => /In stock/.test(bodyText(h.w)), 20000, "In stock via the proxy");
    ok("P1 · a clean store load reads 'In stock' — served by the PROXY (first on the road); publicnode never asked",
       /In stock/.test(bodyText(h.w)) && proxy.hits.indexOf("eth_call") >= 0 && pn.hits.length === 0, JSON.stringify({ proxy: proxy.hits.slice(0, 5), pn: pn.hits }));
    const lines = h.w.__console.filter((l) => /^\[read\] served by /.test(l));
    ok("P2 · ONE console line names the endpoint that answered — the hostname ONLY (no port, no path, no key)",
       lines.length === 1 && lines[0] === "[read] served by 127.0.0.1", JSON.stringify(h.w.__console));
    proxy.srv.close(); pn.srv.close(); H.teardown(h);
  }
  {
    const c = await H.chainStore();
    const proxy = await recorder(RPC, "dead"), pn = await recorder(RPC);
    const pnHost = new URL(pn.url).hostname;
    const h = await H.storePage(c, c.player, { readUrls: [proxy.url, pn.url], captureConsole: true });
    let landed = true;
    try { await H.until(() => /In stock/.test(bodyText(h.w)), 25000, "In stock after the proxy dies"); } catch (e) { landed = false; }
    ok("F1 · A DEAD PROXY falls through to publicnode — the tile still reads 'In stock'", landed && /In stock/.test(bodyText(h.w)) && proxy.hits.length > 0 && pn.hits.indexOf("eth_call") >= 0,
       bodyText(h.w).slice(0, 140) + " " + JSON.stringify({ proxy: proxy.hits.slice(0, 3), pn: pn.hits.slice(0, 3) }));
    ok("F2 · and the console line names the endpoint that DID answer", h.w.__console.filter((l) => l === "[read] served by " + pnHost).length === 1, JSON.stringify(h.w.__console));
    ok("F3 · no failure sentence on the tile", !/unavailable - refresh to retry/.test(bodyText(h.w)));
    proxy.srv.close(); pn.srv.close(); H.teardown(h);
  }

  {
    const c = await H.chainStore();
    const proxy = await recorder(RPC, "deadAfterChain"), pn = await recorder(RPC);
    const h = await H.storePage(c, c.player, { readUrls: [proxy.url, pn.url] });
    let landed = true;
    try { await H.until(() => /In stock/.test(bodyText(h.w)), 25000, "In stock after the proxy 502s"); } catch (e) { landed = false; }
    ok("F4 · a proxy that passes the chain check and then FAILS EVERY READ (502) still falls through — 'In stock'",
       landed && proxy.hits.indexOf("eth_chainId") >= 0 && proxy.hits.indexOf("eth_call") >= 0 && pn.hits.indexOf("eth_call") >= 0, JSON.stringify({ proxy: proxy.hits.slice(0, 4), pn: pn.hits.slice(0, 4) }));
    proxy.srv.close(); pn.srv.close(); H.teardown(h);
  }

  // ════════ THE SCAN ROAD NEVER TOUCHES THE PROXY ════════
  {
    const c = await H.chainStore();
    const proxy = await recorder(RPC), scan = await recorder(RPC);
    const h = await H.storePage(c, c.player, { readUrls: [proxy.url], scanUrls: [scan.url] });
    const w = h.w;
    ok("G1 · scanProvider() is built on the keyless list's first endpoint — not the proxy", w.DYWallet.scanProvider()._getConnection().url === scan.url, w.DYWallet.scanProvider()._getConnection().url);
    const nft = new w.ethers.Contract(c.addrs.nft, ["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"], w.DYWallet.readProvider());
    const before = proxy.hits.filter((m) => m === "eth_getLogs").length;
    const r = await w.DYWallet.scanLogsResumable(nft, nft.filters.Transfer(), 0, 15000, "dyrp::test");
    ok("G2 · a real getLogs walk (the treasury/listing scan road) asks the KEYLESS endpoint and never the proxy",
       r && r.complete === true && scan.hits.indexOf("eth_getLogs") >= 0 && proxy.hits.filter((m) => m === "eth_getLogs").length === before && before === 0,
       JSON.stringify({ proxy: proxy.hits, scan: scan.hits.slice(0, 6) }));
    proxy.srv.close(); scan.srv.close(); H.teardown(h);
  }

  // ════════ STAMPS ════════
  {
    const pages = ["index.html", "admin.html", "register.html", "store.html", "treasury.html", "dashboard.html", "report.html", "rite.html", "mp/hall.html", "mint.html", "my-invites.html"];
    const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
    ok("X1 · config.js is stamped s20 on every page that loads it (11; CARD-STORE-1 C3 moved it; my-invites.html joined)", pages.every((p) => /config\.js\?v=s20"/.test(read(p))) && pages.every((p) => !/config\.js\?v=s19"/.test(read(p))));
    ok("X2 · wallet.js s1r, mf-config.js mf9, dashboard.js mf39, report.js mf4f",
       pages.filter((p) => /js\/wallet\.js\?v=/.test(read(p))).every((p) => /js\/wallet\.js\?v=s1r"/.test(read(p)))
         && ["dashboard.html", "report.html", "store.html", "mint.html"].every((p) => /mf-config\.js\?v=mf9"/.test(read(p)))
         && /js\/dashboard\.js\?v=mf39"/.test(read("dashboard.html")) && /js\/report\.js\?v=mf4f"/.test(read("report.html")));
  }

  console.log("\n" + (fail ? "✖ " + fail + " FAILED of " + (pass + fail) : "ALL GREEN — " + pass + "/" + pass));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("readproxy suite crashed:", e); process.exit(1); });
