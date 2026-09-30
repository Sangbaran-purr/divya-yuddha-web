"use strict";
// STORE-READ-1 — the store's read failover.
//
// WHAT THIS IS ABOUT: a buyer in the Philippines could not load the store. Every read to the single configured
// endpoint failed with ERR_NAME_NOT_RESOLVED, and the page answered "stock unavailable - refresh to retry" — a
// verdict it had not earned. The road now walks a list, and a verdict is only ever reached after all of it fails.
//
// The endpoints here are REAL local HTTP servers, each told how to misbehave, so the failure shapes are produced
// rather than mocked: a dead port, a body that is not JSON, a wrong chain id, a 500. The good one proxies anvil.
const fs = require("fs");
const path = require("path");
const http = require("http");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = path.resolve(__dirname, "..", "..");
const DEC = 1000000000000000000n;
const DEC6 = 1000000n;
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } }
const bodyText = (w) => { const e = w.document.getElementById("bundle-body"); return e ? e.textContent.replace(/\s+/g, " ") : ""; };
async function connect(w) { await w.DYWallet.connect(); await H.sleep(600); }

// a controllable JSON-RPC endpoint. `hits` counts what it was asked, so "did it fall through?" is observable.
function rpcServer(mode, upstream) {
  const hits = [];
  const srv = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", async () => {
      let payload = null;
      try { payload = JSON.parse(b); } catch (_) {}
      // ⚠ ETHERS BATCHES. A batch arrives as an ARRAY of payloads, so recording payload.method alone logged
      // `undefined` for every batched eth_call — which made "the bad endpoint was never asked" trivially true even
      // when it plainly had been. Record every method in either shape.
      if (Array.isArray(payload)) payload.forEach((q) => hits.push(q && q.method));
      else hits.push(payload && payload.method);
      if (mode === "garbage") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html>not json</html>"); }
      if (mode === "error500") { res.writeHead(500); return res.end("upstream unavailable"); }
      // ── THE RATE-LIMIT SHAPES. A busy public endpoint does not answer with a socket error; it answers with a
      //    perfectly well-formed JSON-RPC error, often HTTP 200, sometimes carrying a `data` field. ethers turns
      //    ANY json-rpc error on eth_call into CALL_EXCEPTION, so these look exactly like a revert unless the
      //    predicate inspects the data itself. ──
      const rlErr = (id, extra) => ({ jsonrpc: "2.0", id, error: Object.assign({ code: -32005, message: "You have exceeded the rate limit" }, extra || {}) });
      if (mode === "http429") { res.writeHead(429, { "content-type": "application/json" }); return res.end(JSON.stringify(rlErr(payload && payload.id))); }
      // ⚠ THE ONE THAT ACTUALLY REPRODUCES IT. The five shapes above are SHIELDED by the chain check: a busy
      //    endpoint fails eth_chainId and is skipped before eth_call ever reaches it. Production is not so tidy —
      //    an endpoint answers eth_chainId fine and then rate-limits partway through the bundle's burst of reads.
      //    That is the load that told a buyer "stock unavailable" while two healthy endpoints sat unused.
      if (mode === "rlAfterChain") {
        // eth_chainId is PROXIED (it must answer the harness's own chain, not a hardcoded 137 — a wrong id would
        // be rejected by the chain check and the endpoint skipped, which is not the case under test). Everything
        // else is rate-limited, so the endpoint passes the gate and then goes busy exactly as a real one does.
        const isChain = (q) => q && q.method === "eth_chainId";
        if ((Array.isArray(payload) ? payload : [payload]).every(isChain)) {
          try {
            const r = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" }, body: b });
            res.writeHead(200, { "content-type": "application/json" });
            return res.end(await r.text());
          } catch (e) { res.writeHead(502); return res.end("proxy failed"); }
        }
        res.writeHead(200, { "content-type": "application/json" });
        const one = (q) => rlErr(q && q.id, { data: "retry in 30s" });
        return res.end(JSON.stringify(Array.isArray(payload) ? payload.map(one) : one(payload)));
      }
      if (mode === "rlPlain" || mode === "rlDataStr" || mode === "rlDataObj") {
        const extra = mode === "rlDataStr" ? { data: "retry in 30s" } : (mode === "rlDataObj" ? { data: { retryAfter: 30 } } : null);
        const one = (q) => rlErr(q && q.id, extra);
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(Array.isArray(payload) ? payload.map(one) : one(payload)));
      }
      if (mode === "rlBatch") {
        // a BATCH where some items succeed and ONE is rate-limited — the shape a busy endpoint really returns
        try {
          const r = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" }, body: b });
          const arr = JSON.parse(await r.text());
          res.writeHead(200, { "content-type": "application/json" });
          if (Array.isArray(arr) && arr.length > 1) { arr[1] = rlErr(arr[1] && arr[1].id, { data: "retry in 30s" }); return res.end(JSON.stringify(arr)); }
          return res.end(JSON.stringify(Array.isArray(arr) ? arr.map((q) => rlErr(q && q.id)) : rlErr(arr && arr.id)));
        } catch (e) { res.writeHead(502); return res.end("proxy failed"); }
      }
      if (mode === "wrongchain" && payload && payload.method === "eth_chainId") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: "0x1" })); // mainnet, not ours
      }
      try {                                             // OK (and wrongchain's non-chainId calls): proxy to anvil
        const r = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" }, body: b });
        const t = await r.text();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(t);
      } catch (e) { res.writeHead(502); res.end("proxy failed"); }
    });
  });
  return new Promise((resolve) => srv.listen(0, () => resolve({ srv, hits, url: "http://127.0.0.1:" + srv.address().port })));
}
const DEAD = "http://127.0.0.1:1";                      // nothing listens: connection refused, instantly

async function run() {
  console.log("\n── STORE-READ-1 · the store's read failover ──");
  await H.preflight();
  const RPC = process.env.DY_RPC || "http://127.0.0.1:8545";

  // ════════ THE BUYER'S CASE ════════
  {
    const c = await H.chainStore();
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [DEAD, good.url] });
    const w = h.w;
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the tile to read stock from the SECOND endpoint");
    ok("A1 · THE BUYER'S CASE — endpoint 1 unreachable, the store still reads stock from endpoint 2",
       /In stock/.test(bodyText(w)), bodyText(w).slice(0, 140));
    ok("A2 · and the failure sentence is nowhere on the tile", !/unavailable - refresh to retry/.test(bodyText(w)));
    ok("A3 · the working endpoint really was the one asked", good.hits.length > 0, JSON.stringify(good.hits.slice(0, 4)));
    good.srv.close(); H.teardown(h);
  }
  {
    // ownership too, not just stock: the connected wallet's Torana read must survive the same fall-through
    const c = await H.chainStore();
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [DEAD, good.url] });
    const w = h.w;
    await w.DYWallet.connect();
    await H.until(() => !/your Torana could not be read/.test(bodyText(w)) && /In stock/.test(bodyText(w)), 20000, "the connected tile");
    ok("A4 · OWNERSHIP survives the fall-through too — the Torana line is not a failure",
       !/your Torana could not be read/.test(bodyText(w)), bodyText(w).slice(0, 160));
    good.srv.close(); H.teardown(h);
  }

  // ════════ THE SHAPES THAT MUST FALL THROUGH ════════
  for (const [mode, label] of [["garbage", "a body that is not JSON (the browser's bare 'Failed to fetch' class — NO ethers code at all)"],
                               ["error500", "an HTTP 500"],
                               ["wrongchain", "a WRONG CHAIN ID (137 expected, 1 answered)"]]) {
    const c = await H.chainStore();
    const bad = await rpcServer(mode, RPC);
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [bad.url, good.url] });
    const w = h.w;
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the tile after falling through " + mode);
    ok("B · " + label + " falls through to the next endpoint", /In stock/.test(bodyText(w)), bodyText(w).slice(0, 120));
    if (mode === "wrongchain") {
      ok("B2 · and the wrong-chain endpoint was asked for eth_chainId ONCE, then abandoned",
         bad.hits.filter((m) => m === "eth_chainId").length === 1 && bad.hits.filter((m) => m === "eth_call").length === 0,
         JSON.stringify(bad.hits));
    }
    bad.srv.close(); good.srv.close(); H.teardown(h);
  }

  // ════════ A BUSY SERVER IS NOT A VERDICT ════════
  // This is the case that broke a real load: drpc and tenderly were healthy, yet the tile said "unavailable".
  // A rate-limited endpoint answers with a JSON-RPC error, and ethers raises CALL_EXCEPTION for ANY json-rpc error
  // on eth_call — so "CALL_EXCEPTION means the chain spoke" stopped the walk on a server that was merely busy.
  for (const [mode, label] of [["http429", "an HTTP 429"],
                               ["rlPlain", "a JSON-RPC rate-limit error with NO data"],
                               ["rlDataStr", "a rate-limit error carrying a STRING data field"],
                               ["rlDataObj", "a rate-limit error carrying an OBJECT data field"],
                               ["rlBatch", "a BATCHED reply where one item is rate-limited and the others succeed"],
                               ["rlAfterChain", "AN ENDPOINT THAT PASSES THE CHAIN CHECK AND THEN RATE-LIMITS (the real load)"]]) {
    const c = await H.chainStore();
    const busy = await rpcServer(mode, RPC);
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [busy.url, good.url] });
    const w = h.w;
    let landed = true;
    try { await H.until(() => /In stock/.test(bodyText(w)), 20000, "the tile after a busy endpoint"); }
    catch (e) { landed = false; }
    ok("R · " + label + " falls through to the healthy endpoint", landed && /In stock/.test(bodyText(w)), bodyText(w).slice(0, 130));
    busy.srv.close(); good.srv.close(); H.teardown(h);
  }

  // ════════ A CONTRACT REVERT IS AN ANSWER, NOT A FAILURE ════════
  {
    const c = await H.chainStore();
    const first = await rpcServer("ok", RPC);
    const second = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [first.url, second.url] });
    const w = h.w;
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the tile");
    const beforeSecond = second.hits.length;
    // a selector that exists on no contract: the chain answers "execution reverted" — a real answer
    let code = null;
    try {
      await w.DYWallet.readProvider().call({ to: c.addrs.ps, data: "0xdeadbeef" });
    } catch (e) { code = e && e.code; }
    ok("C1 · A CONTRACT REVERT IS RAISED, NOT WALKED PAST", code === "CALL_EXCEPTION", String(code));
    ok("C2 · and the SECOND endpoint was never asked to repeat it (a revert never falls through)",
       second.hits.length === beforeSecond, "second saw " + (second.hits.length - beforeSecond) + " extra call(s)");
    first.srv.close(); second.srv.close(); H.teardown(h);
  }

  // ════════ ONLY AFTER EVERYTHING HAS FAILED ════════
  {
    const c = await H.chainStore();
    const h = await H.storePage(c, c.player, { readUrls: [DEAD, "http://127.0.0.1:2", "http://127.0.0.1:3"] });
    const w = h.w;
    await H.until(() => /refresh to retry/.test(bodyText(w)), 20000, "the honest verdict, after every endpoint failed");
    ok("D1 · with EVERY endpoint dead the tile does say 'refresh to retry' — the verdict is still reachable",
       /stock unavailable - refresh to retry/.test(bodyText(w)), bodyText(w).slice(0, 140));
    H.teardown(h);
  }

  // ════════ BUSY IS NEVER A VERDICT ════════
  {
    const c = await H.chainStore();
    const slow = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [slow.url] });
    const w = h.w;
    const first = bodyText(w);          // read the very first paint, before any read can have settled
    ok("E1 · THE FIRST PAINT IS A READING STATE, NOT A VERDICT",
       /Reading the store/.test(first) && !/unavailable - refresh to retry/.test(first), first.slice(0, 140));
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the tile to settle");
    ok("E2 · and it resolves to the real answer once the read lands", /In stock/.test(bodyText(w)));
    slow.srv.close(); H.teardown(h);
  }

  // ════════ STORE-READ-2 · A FAILED REFRESH NEVER ERASES WHAT THE PAGE KNEW ════════
  // The generation guard already protected the WRITE; what it never protected was the QUALITY. Every field caught
  // to null and the all-null result was assigned over the tile's state, so one bad refresh erased good numbers —
  // reproduced with no concurrency at all. These drive the real tile against real contracts.
  const deadList = ["http://127.0.0.1:1"];
  {
    const c = await H.chainStore();
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the good first read");
    ok("K1 · a good read shows the real numbers", /In stock/.test(bodyText(w)) && !/unavailable/.test(bodyText(w)));

    // now every endpoint dies and the tile is refreshed again
    w.DY_CONFIG.chain.readRpcUrls = deadList.slice();
    w.DYWallet._resetReadRoad();
    await w.DYStore._bundleRefresh();
    ok("K2 · A FAILED REFRESH KEEPS THE NUMBERS — 'In stock' is still there",
       /In stock/.test(bodyText(w)) && !/stock unavailable/.test(bodyText(w)), bodyText(w).slice(0, 150));
    ok("K3 · and it says so, quietly, instead of pretending they are fresh",
       /Couldn't refresh just now - showing the last reading\./.test(bodyText(w)), bodyText(w).slice(0, 200));
    ok("K4 · the Torana line is kept too, not replaced by its retry sentence",
       !/your Torana could not be read/.test(bodyText(w)));

    // and the line clears on the next fully successful read
    w.DY_CONFIG.chain.readRpcUrls = [good.url];
    w.DYWallet._resetReadRoad();
    await w.DYStore._bundleRefresh();
    ok("K5 · the quiet line CLEARS on the next fully successful refresh",
       /In stock/.test(bodyText(w)) && !/Couldn't refresh just now/.test(bodyText(w)), bodyText(w).slice(0, 150));
    good.srv.close(); H.teardown(h);
  }
  {
    // THE ROAD ITSELF never answers (not the individual reads): readProvider throws before a single job is made.
    // The per-field merge cannot help here — there are no fields — so the outer catch must keep the last state.
    const c = await H.chainStore();
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the good first read");
    const realRP = w.DYWallet.readProvider;
    w.DYWallet.readProvider = function () { throw new Error("no read road"); };
    await w.DYStore._bundleRefresh();
    ok("K5a · when the ROAD ITSELF fails, the numbers are still kept",
       /In stock/.test(bodyText(w)) && !/stock unavailable/.test(bodyText(w)), bodyText(w).slice(0, 150));
    ok("K5b · and the quiet line says so", /Couldn't refresh just now/.test(bodyText(w)), bodyText(w).slice(0, 200));
    w.DYWallet.readProvider = realRP;
    good.srv.close(); H.teardown(h);
  }
  {
    // PARTIAL failure: only the wallet-specific reads die. The contract's own numbers must refresh normally.
    const c = await H.chainStore();
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the good first read");
    // make ONLY balanceOf fail, by pointing the AccessNFT at an address with no code
    w.DY_CONFIG.contracts.accessNFT = c.addrs.owner;
    w.localStorage.setItem("dystore::accessAddress", c.addrs.owner);
    await w.DYStore._bundleRefresh();
    ok("K6 · a PARTIAL failure keeps only the failed field — stock still reads fresh",
       /In stock/.test(bodyText(w)), bodyText(w).slice(0, 150));
    ok("K7 · and the quiet line is shown because something on screen is a kept value",
       /Couldn't refresh just now/.test(bodyText(w)), bodyText(w).slice(0, 200));
    good.srv.close(); H.teardown(h);
  }
  {
    // RULING 4 — last-known-good may never cross a WALLET.
    const c = await H.chainStore();
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the first wallet's read");
    const other = ethers.Wallet.createRandom().connect(c.provider);
    h.eth.__switchTo(other);                       // the account changes, exactly as MetaMask does
    w.DY_CONFIG.chain.readRpcUrls = deadList.slice();   // and the new wallet's read fails
    w.DYWallet._resetReadRoad();
    await w.DYStore._bundleRefresh();
    const t = bodyText(w);
    ok("K8 · after an ACCOUNT SWITCH a failed read never shows the previous wallet's Torana",
       /your Torana could not be read/.test(t), t.slice(0, 220));
    ok("K9 · but the contract's OWN numbers may carry across the switch", /In stock/.test(t), t.slice(0, 150));
    good.srv.close(); H.teardown(h);
  }
  {
    // RULING 4 — a CHAIN change drops everything.
    const c = await H.chainStore();
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the first chain's read");
    w.DYWallet.state.chainId = 999;                // the wallet moved to another chain
    w.DY_CONFIG.chain.readRpcUrls = deadList.slice();
    w.DYWallet._resetReadRoad();
    await w.DYStore._bundleRefresh();
    ok("K10 · a CHAIN CHANGE drops everything — no number survives to be shown on another chain",
       /stock unavailable/.test(bodyText(w)), bodyText(w).slice(0, 180));
    good.srv.close(); H.teardown(h);
  }
  {
    // PART 1 — two overlapping refreshes; the OLDER finishing last must change nothing and must not clear P10.
    const c = await H.chainStore();
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the first read");
    const slow = w.DYStore._bundleRefresh();       // A starts
    const fast = w.DYStore._bundleRefresh();       // B starts and supersedes it
    await Promise.all([slow, fast]);
    ok("K11 · two overlapping refreshes settle on the newest, with nothing broken on screen",
       /In stock/.test(bodyText(w)), bodyText(w).slice(0, 150));
    const src = fs.readFileSync(path.join(SITE, "js/store.js"), "utf8");
    ok("K12 · and the PAINT is generation-guarded, so an older finish cannot clear the reading state",
       /var myGen = bGen \+ 1;/.test(src) && (src.match(/if \(myGen !== bGen\) return;/g) || []).length === 2);
    good.srv.close(); H.teardown(h);
  }
  {
    // PART 3 — the tile's own refresh button is shut while a read runs.
    const c = await H.chainStore();
    const good = await rpcServer("ok", RPC);
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the first read");
    const btn = w.document.getElementById("b-refresh");
    const p = w.DYStore._bundleRefresh();
    ok("K13 · the tile's refresh is DISABLED while a read is in flight", btn.disabled === true);
    await p;
    ok("K14 · and re-enabled when it settles", btn.disabled === false);
    good.srv.close(); H.teardown(h);
  }

  // ════════ THE SOURCE LAWS ════════
  {
    const cfg = fs.readFileSync(path.join(SITE, "config.js"), "utf8");
    const wal = fs.readFileSync(path.join(SITE, "js/wallet.js"), "utf8");
    const list = (cfg.match(/readRpcUrls:\s*\[([\s\S]*?)\]/) || [])[1] || "";
    const urls = (list.match(/"https:\/\/[^"]+"/g) || []);
    ok("X1 · the read road is a LIST of four verified endpoints", urls.length === 4, urls.join(", "));
    ok("X2 · and every one of them is KEYLESS (no key may enter a page)",
       urls.every((u) => !/[?&](apikey|key|token)=/i.test(u) && !/\/v2\/|\/v3\//.test(u)), urls.join(", "));
    ok("X3 · the fall-through rule is an ALLOW-LIST — only revert DATA stops the walk",
       /function isContractVerdict/.test(wal) && /function isRevertData/.test(wal));
    // ⚠ CALL_EXCEPTION must NOT be the discriminator: ethers raises it for any json-rpc error on eth_call,
    //   a rate limit included. Its presence as a stop condition is the defect this rung removed.
    const verdictFn = wal.slice(wal.indexOf("function isContractVerdict"), wal.indexOf("function chainOk"));
    ok("X3b · and CALL_EXCEPTION alone no longer stops it", verdictFn.length > 60 && !/CALL_EXCEPTION/.test(verdictFn),
       verdictFn.slice(0, 160));
    // both data reads are hex-gated. The nested one is defensive and UNEXERCISED by the suite — ethers normalises
    // err.error.data away on this path — so it is pinned in source rather than claimed to be tested.
    ok("X3c · BOTH data reads are hex-gated (the nested one is pinned, not exercised: ethers normalises it away)",
       /isRevertData\(err\.data\)/.test(verdictFn) && /isRevertData\(err\.error\.data\)/.test(verdictFn)
       && /\^0x\(\[0-9a-fA-F\]\[0-9a-fA-F\]\)\*\$/.test(wal));
    // ⚠ assert the constants are USED, not merely declared: a mutant that pointed scanProvider at the 4s budget
    // left both declarations intact and walked past an earlier version of this check.
    const scanFn = wal.slice(wal.indexOf("function scanProvider"), wal.indexOf("function _resetReadRoad"));
    const poolFn = wal.slice(wal.indexOf("function mkTamed"), wal.indexOf("function poolFor"));
    ok("X4 · the load-read budget is 4s with ONE attempt (the next endpoint is the retry)",
       /READ_TIMEOUT = 4000/.test(wal) && /maxAttempts: 1/.test(poolFn) && /READ_TIMEOUT\)/.test(wal));
    ok("X4b · and the SCAN road keeps its tuned 10s and its 2 attempts — scanProvider USES SCAN_TIMEOUT",
       scanFn.length > 100 && /req\.timeout = SCAN_TIMEOUT/.test(scanFn) && /maxAttempts: 2/.test(scanFn)
       && /SCAN_TIMEOUT = 10000/.test(wal), "len " + scanFn.length);
    ok("X5 · writes are untouched — the failover road is reads only, never the signer",
       !/sendWalking[\s\S]{0,400}getSigner/.test(wal));
    const treasury = fs.readFileSync(path.join(SITE, "treasury.html"), "utf8");
    const store = fs.readFileSync(path.join(SITE, "store.html"), "utf8");
    const stampOf = (h, src) => (h.match(new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\?v=([A-Za-z0-9]+)")) || [])[1];
    // the INTENT is agreement, not a literal version: pinning "s15" here would break on every future bump and
    // teach the next person to edit the test rather than read it.
    ok("X6 · treasury.html and store.html agree on the js/store.js stamp (treasury lagged a month at s9)",
       !!stampOf(store, "js/store.js") && stampOf(treasury, "js/store.js") === stampOf(store, "js/store.js")
       && stampOf(treasury, "js/store.js") !== "s9",
       stampOf(treasury, "js/store.js") + " vs " + stampOf(store, "js/store.js"));
  }

  console.log("──\n" + (fail === 0 ? "ALL GREEN — " + pass + "/" + (pass + fail) : "FAILURES — " + fail + " of " + (pass + fail)));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("storeread suite crashed:", e); process.exit(1); });
