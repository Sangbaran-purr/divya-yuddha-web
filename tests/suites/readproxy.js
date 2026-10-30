"use strict";
// READ-PROXY-2 → RPC-CLEANUP-1 (owner rulings 2026-10-30) — ONE ROAD: our own read proxy (rpc.divyayuddha.games) serves
// every site read, the getLogs history scans included. No free public RPC behind it (publicnode/drpc/tenderly are gone
// from every read road), and no wallet rescue on the dashboard. A dead proxy is the plain error state (tests/suites/
// rpcroad.js proves those faces); this suite pins the shipped config, the source laws and the scan road's endpoint.
//
// The endpoints are REAL local HTTP servers (the storeread idiom): a stand-in "proxy" that records what it is asked
// and forwards to anvil. The behaviour is proven on the real store page, the real wallet read road and the real
// getLogs scan road.
const fs = require("fs");
const path = require("path");
const http = require("http");
const H = require("../lib");

const SITE = path.resolve(__dirname, "..", "..");
const PROXY = "https://rpc.divyayuddha.games";
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
  console.log("\n── RPC-CLEANUP-1 · one road: the proxy serves every read, scans included ──");
  await H.preflight();
  const RPC = process.env.DY_RPC || "http://127.0.0.1:8545";

  // ════════ THE SHIPPED CONFIG ════════
  {
    const w = loadConfigs();
    const chain = w.DY_CONFIG.chain, mf = w.DY_MF_CONFIG;
    ok("C1 · config.js: the read road is the proxy ALONE (no publicnode, drpc or tenderly behind it)",
       JSON.stringify(chain.readRpcUrls) === JSON.stringify([PROXY]), JSON.stringify(chain.readRpcUrls));
    ok("C2 · the keyless scan list (scanRpcUrls) is GONE — the scans ride the same proxy", !("scanRpcUrls" in chain), JSON.stringify(chain.scanRpcUrls));
    ok("C3 · mf-config.js: the proxy is the dashboard/report read endpoint, with NO fallbacks; the scan width is the proxy's 10,000,000",
       mf.readRpcUrl === PROXY && JSON.stringify(mf.readRpcUrlFallbacks) === "[]" && mf.logChunk === 10000000, mf.readRpcUrl + " " + JSON.stringify(mf.readRpcUrlFallbacks) + " " + mf.logChunk);
    ok("C3b · config.js rpcUrls (what MetaMask is offered when it adds Polygon — the wallet's own SEND road) is left as it was (owner ruling C)",
       JSON.stringify(chain.rpcUrls) === JSON.stringify(["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"]), JSON.stringify(chain.rpcUrls));
    const shipped = ["config.js", "mf-config.js", "admin-config.js"].concat(fs.readdirSync(path.join(SITE, "js")).filter((f) => /\.js$/.test(f)).map((f) => "js/" + f))
      .concat(["index.html", "store.html", "dashboard.html", "report.html", "rite.html", "treasury.html", "mint.html", "register.html", "admin.html", "mp/hall.js"]);
    const with1rpc = shipped.filter((f) => { try { return /1rpc\.io/.test(fs.readFileSync(path.join(SITE, f), "utf8")); } catch (e) { return false; } });
    ok("C4 · 1rpc.io is GONE from every shipped file (it sends no CORS header — it could never serve the browser)", with1rpc.length === 0, with1rpc.join(", "));
  }

  // ════════ THE SCAN ROADS RIDE THE PROXY (source) ════════
  {
    const dash = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8"), rep = fs.readFileSync(path.join(SITE, "js", "report.js"), "utf8");
    // the function's CODE, comments stripped (a comment may name a host to say it is NOT used)
    const body = (src, name) => { const i = src.indexOf("function " + name + "("); return i < 0 ? "" : src.slice(i, src.indexOf("\n  }", i) + 4).replace(/(^|[^:])\/\/[^\n]*/g, "$1"); };   // a URL's "://" is not a comment
    const dl = body(dash, "logProvider"), rl = (rep.match(/function logProvider\(\) \{[^\n]*\}/) || [""])[0];
    ok("S1 · the dashboard's logProvider: the owner's archive override, then the proxy (readRpcUrl) — no scan list, no free host",
       /archiveReadRpc\(\)/.test(dl) && /readRpcUrl/.test(dl) && !/scanRpcUrls|drpc|publicnode|tenderly/.test(dl), dl.slice(0, 300));
    ok("S2 · the report's logProvider rides readRpcUrl (the proxy)", /readRpcUrl/.test(rl) && !/scanRpcUrls|drpc|publicnode/.test(rl), rl);
    ok("S3 · the dashboard's diagnostics list the scan road as the override + the proxy", /var logUrls = \[archiveReadRpc\(\), c\.readRpcUrl \|\| PROXY_URL\]/.test(dash));
    ok("S4 · the dashboard builds NO last-resort read through the connected wallet (owner ruling D)",
       !/walletInChain/.test(dash) && !/priority: 99/.test(dash), "walletInChain/priority 99 still present");
    ok("S5 · the dashboard's six feed filters are ONE combined getLogs (four addresses, six topic0s, the wallet as topic1)",
       /provider\.getLogs\(\{ address: addresses, topics: \[topic0, who\]/.test(dash));
  }

  // ════════ THE BUYER'S STORE: the proxy answers ════════
  {
    const c = await H.chainStore();
    const proxy = await recorder(RPC);
    // the proxy stand-in carries a PATH and a QUERY, so the console line is proven to print the hostname alone
    // (the query is deliberately NOT a keyed-URL shape — consoleroad G2 scans every tracked file for those)
    const h = await H.storePage(c, c.player, { readUrls: [proxy.url + "/node/v1?k=SECRETVALUE"], captureConsole: true });
    await H.until(() => /In stock/.test(bodyText(h.w)), 20000, "In stock via the proxy");
    ok("P1 · a clean store load reads 'In stock' — served by the PROXY", /In stock/.test(bodyText(h.w)) && proxy.hits.indexOf("eth_call") >= 0, JSON.stringify({ proxy: proxy.hits.slice(0, 5) }));
    const lines = h.w.__console.filter((l) => /^\[read\] served by /.test(l));
    ok("P2 · ONE console line names the endpoint that answered — the hostname ONLY (no port, no path, no key)",
       lines.length === 1 && lines[0] === "[read] served by 127.0.0.1", JSON.stringify(h.w.__console));
    proxy.srv.close(); H.teardown(h);
  }

  // ════════ THE SCAN ROAD IS THE PROXY ════════
  {
    const c = await H.chainStore();
    const proxy = await recorder(RPC);
    const h = await H.storePage(c, c.player, { readUrls: [proxy.url] });
    const w = h.w;
    ok("G1 · scanProvider() is built on the read road's endpoint — the proxy", w.DYWallet.scanProvider()._getConnection().url === proxy.url, w.DYWallet.scanProvider()._getConnection().url);
    const nft = new w.ethers.Contract(c.addrs.nft, ["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"], w.DYWallet.readProvider());
    const before = proxy.hits.filter((m) => m === "eth_getLogs").length;
    const r = await w.DYWallet.scanLogsResumable(nft, nft.filters.Transfer(), 0, 15000, "dyrp::test");
    const scans = proxy.hits.filter((m) => m === "eth_getLogs").length - before;
    ok("G2 · a real getLogs walk (the treasury/listing scan road) asks the PROXY — and the whole history is ONE call",
       r && r.complete === true && scans === 1, JSON.stringify({ getLogs: scans, complete: r && r.complete }));
    proxy.srv.close(); H.teardown(h);
  }

  // ════════ STAMPS ════════
  {
    // (ICO-SIMPLE-1: register.html is now a redirect to the dashboard's buy panel and loads no script)
    const pages = ["index.html", "admin.html", "store.html", "treasury.html", "dashboard.html", "report.html", "rite.html", "mp/hall.html", "mint.html", "my-invites.html"];
    const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
    ok("X1 · config.js is stamped s23 on every page that loads it (10; RPC-CLEANUP-1)", pages.every((p) => /[" /]config\.js\?v=s23"/.test(read(p))) && pages.every((p) => !/[" /]config\.js\?v=s22"/.test(read(p))));
    ok("X2 · wallet.js s1t, mf-config.js mf13, dashboard.js mf48, report.js mf4g, admin.js s40, hall.js h37 (RPC-CLEANUP-1)",
       pages.filter((p) => /js\/wallet\.js\?v=/.test(read(p))).every((p) => /js\/wallet\.js\?v=s1t"/.test(read(p)))
         && ["dashboard.html", "report.html", "store.html", "mint.html", "my-invites.html"].every((p) => /mf-config\.js\?v=mf13"/.test(read(p)))
         && /js\/dashboard\.js\?v=mf48"/.test(read("dashboard.html")) && /js\/report\.js\?v=mf4g"/.test(read("report.html"))
         && /js\/admin\.js\?v=s40"/.test(read("admin.html")) && /hall\.js\?v=h37"/.test(read("mp/hall.html")));
  }

  console.log("\n" + (fail ? "✖ " + fail + " FAILED of " + (pass + fail) : "ALL GREEN — " + pass + "/" + pass));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("readproxy suite crashed:", e); process.exit(1); });
