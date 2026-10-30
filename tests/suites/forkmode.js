"use strict";
// STORE-LOAD-1 — THE FORK MODE CANNOT SWITCH ON FOR THE LIVE SITE. config.js carries a local test-bench switch that
// re-points the page's requests (read proxy, keyless scan roads, the approval bot) at a local fork stack. This suite
// evaluates the REAL config.js in jsdom at many addresses, with and without the switch, and asserts:
//   FM1–FM5 · on divyayuddha.games, www, a lookalike host, an http copy, or a local-NAMED subdomain — even with
//             ?fork=1 AND the localStorage flag — nothing changes: window.fetch is the browser's own, no DY_FORK
//   FM6–FM7 · on 127.0.0.1 / localhost WITHOUT the ask — nothing changes either
//   FM8–FM11 · on 127.0.0.1 WITH the ask: every live host is re-pointed (read proxy → dy-rpc, keyless roads → the fork,
//             the bot → the local bot, path and query kept); other hosts (the CDN, the analytics) are left alone
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SITE = path.resolve(__dirname, "..", "..");
const CONFIG = fs.readFileSync(path.join(SITE, "config.js"), "utf8");
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } }

function at(url, flag) {
  const dom = new JSDOM("<!doctype html><body></body>", { url, runScripts: "outside-only" });
  const w = dom.window;
  const seen = [];
  const own = function (u) { seen.push(String(u)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(null) }); };
  w.fetch = own;
  if (flag) w.localStorage.setItem("dy::fork", "1");
  w.eval(CONFIG);
  return { w, own, seen, untouched: w.fetch === own && !w.DY_FORK };
}

function run() {
  console.log("\n── STORE-LOAD-1 · the fork mode is local-only ──");
  const live = [
    ["FM1", "https://divyayuddha.games/store.html?fork=1"],
    ["FM2", "https://www.divyayuddha.games/dashboard.html?fork=1"],
    ["FM3", "https://127.0.0.1.divyayuddha.games/store.html?fork=1"],          // a host that merely CONTAINS 127.0.0.1
    ["FM4", "http://divyayuddha.games/store.html?fork=1"],
    ["FM5", "https://localhost.example.com/store.html?fork=1"],                 // a host that merely STARTS with localhost
  ];
  for (const [tag, url] of live) {
    const r = at(url, true);
    ok(tag + " · " + url + " with ?fork=1 AND the localStorage flag: nothing changes (the browser's own fetch, no DY_FORK)", r.untouched);
  }
  ok("FM6 · http://127.0.0.1:8562 WITHOUT the ask: nothing changes", at("http://127.0.0.1:8562/store.html").untouched);
  ok("FM7 · http://localhost:8562 WITHOUT the ask: nothing changes", at("http://localhost:8562/dashboard.html").untouched);

  const f = at("http://127.0.0.1:8562/store.html?fork=1", false);
  ok("FM8 · http://127.0.0.1:8562 with ?fork=1: the fork mode is on", !f.untouched && f.w.DY_FORK && f.w.DY_FORK.on === true);
  const rp = f.w.DY_FORK.repoint;
  ok("FM9 · the ONE read road (the proxy, scans included) → the local dy-rpc; the free hosts are no longer mapped (RPC-CLEANUP-1: no page asks them)",
     rp("https://rpc.divyayuddha.games") === "http://127.0.0.1:8561" && rp("https://polygon-bor-rpc.publicnode.com") === null
     && rp("https://polygon.drpc.org") === null && rp("https://polygon.gateway.tenderly.co") === null);
  ok("FM10 · the approval bot → the local bot, path and query kept (/gas/topup, /allowlist?cb=1, /presale/voucher)",
     rp("https://approval-bot-cxa2.onrender.com/gas/topup") === "http://127.0.0.1:8563/gas/topup"
     && rp("https://approval-bot-cxa2.onrender.com/allowlist?cb=1") === "http://127.0.0.1:8563/allowlist?cb=1"
     && rp("https://approval-bot-cxa2.onrender.com/presale/voucher") === "http://127.0.0.1:8563/presale/voucher");
  f.w.fetch("https://approval-bot-cxa2.onrender.com/presale/voucher", {}); f.w.fetch("https://cdn.jsdelivr.net/npm/ethers@6.17.0/dist/ethers.umd.min.js");
  ok("FM11 · a fetch through the page really goes to the local bot; other hosts (the CDN) are left exactly as asked",
     f.seen[0] === "http://127.0.0.1:8563/presale/voucher" && f.seen[1] === "https://cdn.jsdelivr.net/npm/ethers@6.17.0/dist/ethers.umd.min.js", JSON.stringify(f.seen));
  const g = at("http://localhost:9000/dashboard.html", true);
  g.w.localStorage.setItem("dy::forkBot", "http://127.0.0.1:9999");
  ok("FM12 · localhost with the localStorage flag also switches it on (the bench's second way in)", !g.untouched && g.w.DY_FORK.on === true);

  console.log("──\n" + (fail === 0 ? "ALL GREEN — " + pass + "/" + (pass + fail) : "FAILURES — " + fail + " of " + (pass + fail)));
  process.exit(fail ? 1 : 0);
}
try { run(); } catch (e) { console.error("forkmode suite crashed:", e); process.exit(1); }
