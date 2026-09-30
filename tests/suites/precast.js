"use strict";
// STORE-READ-2 — THE PRE-CAST READ: nothing signed against a kept value.
//
// WHAT THIS IS ABOUT: STORE-READ-2 stopped a failed refresh from erasing the tile's good numbers, which is right for
// a TILE and wrong for a WALLET PROMPT. Three of those kept numbers DECIDE — the balance that refuses (P7), the
// allowance that decides whether approve is asked for at all, and the price that sets the approve AMOUNT. This suite
// stales the tile ON PURPOSE and then taps buy, on both roads, and watches the wallet's own signature count.
//
// The observable throughout is `eth_sendTransaction` on the page's wallet: approve+buy is TWO signatures, skip+buy
// is ONE, a refusal before any prompt is ZERO. Nothing else tells those apart from outside.
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
  const RPC = process.env.DY_RPC || "http://127.0.0.1:8545";
  console.log("\n── STORE-READ-2 · the pre-cast read ──");
  const deadList = ["http://127.0.0.1:1"];
  // ════════ STORE-READ-2 · NOTHING SIGNED AGAINST A KEPT VALUE (the pre-cast read) ════════
  // The condition the owner set before the commit word: the buy flow must never ACT on a last-known-good value.
  // It did — worse than before, because the old all-null wipe turned the `!= null` guards into no-ops, while a KEPT
  // allowance actively decides to SKIP approve. These cases stale the tile on purpose and then tap buy.
  //
  // THE OBSERVABLE for approve-or-skip is the wallet's own transaction count: approve+buy is TWO signatures,
  // skip+buy is ONE. Nothing else distinguishes them from outside.
  const sends = (h) => h.eth.__calls.filter((m) => m === "eth_sendTransaction").length;
  // ⚠ THE PLAYER HAS TWO PENS. This wallet is both the harness's signer and the page's, and ethers caches
  // eth_getTransactionCount for a beat — so two awaited sends in a row are handed the SAME nonce (reproduced in
  // isolation: t1.nonce === t2.nonce === 1, second send "nonce too low"). Every direct send below therefore reads
  // its nonce through a FRESH provider, past that cache. Nothing about the page is being worked around here.
  let c0 = null;   // the block's current chain, so the helper below always reads the right wallet
  const pNonce = async () => await new ethers.JsonRpcProvider(RPC).getTransactionCount(c0.player.address, "pending");
  {
    console.log("\n── K15-K17 · a KEPT allowance never skips approve ──");
    const c = await H.chainStore(); c0 = c;
    const good = await rpcServer("ok", RPC);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the first read");

    // (1) the wallet really does approve 100 USDC, and the tile really does read it
    const pu = c.usdc.connect(c.player);
    await (await pu.approve(c.addrs.ps, 100n * DEC6, { nonce: await pNonce() })).wait();
    await w.DYStore._bundleRefresh();
    ok("K15 · the tile holds a HIGH allowance, read from chain",
       w.DYStore._bundleSnapshot().asset.usdc.allowance === String(100n * DEC6),
       JSON.stringify(w.DYStore._bundleSnapshot().asset.usdc));

    // (2) it is revoked on chain, and the tile is NOT refreshed — so its number is now a lie
    await (await pu.approve(c.addrs.ps, 0n, { nonce: await pNonce() })).wait();
    ok("K16 · the chain now says ZERO while the tile still says 100 (the stale state the buyer taps in)",
       (await c.usdc.allowance(c.player.address, c.addrs.ps)) === 0n &&
       w.DYStore._bundleSnapshot().asset.usdc.allowance === String(100n * DEC6));

    const before = sends(h);
    H.click(w, ".b-buy");
    await H.until(() => /is yours/.test(bodyText(w)), 30000, "the receipt");
    ok("K17 · APPROVE WAS REQUESTED ANYWAY — two signatures, not one: the fresh read decided, not the kept value",
       sends(h) - before === 2, "sent " + (sends(h) - before));
    // and the write-back left the tile holding what the chain said
    ok("K17b · the fresh values were written back into the tile's own state",
       w.DYStore._bundleSnapshot().asset.usdc.allowance !== String(100n * DEC6),
       JSON.stringify(w.DYStore._bundleSnapshot().asset.usdc));
    good.srv.close(); H.teardown(h);
  }
  {
    // THE CONTROL for K17: with a genuinely sufficient allowance on chain, approve IS skipped — so K17 proves the
    // fresh read, not merely "this page always approves".
    console.log("\n── K18 · the control: a REAL allowance is still honoured ──");
    const c = await H.chainStore(); c0 = c;
    const good = await rpcServer("ok", RPC);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    await (await c.usdc.connect(c.player).approve(c.addrs.ps, 100n * DEC6, { nonce: await pNonce() })).wait();
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the first read");
    const before = sends(h);
    H.click(w, ".b-buy");
    await H.until(() => /is yours/.test(bodyText(w)), 30000, "the receipt");
    ok("K18 · ONE signature — a sufficient allowance is still skipped, so K17 measured freshness",
       sends(h) - before === 1, "sent " + (sends(h) - before));
    good.srv.close(); H.teardown(h);
  }
  {
    console.log("\n── K19-K21 · a KEPT balance never refuses or permits on its own ──");
    const c = await H.chainStore(); c0 = c;
    const good = await rpcServer("ok", RPC);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the first read");
    ok("K19 · the tile holds a fundable balance", w.DYStore._bundleSnapshot().asset.usdc.balance === String(25n * DEC6));

    // the money leaves the wallet, the tile is never told
    await (await c.usdc.connect(c.player).transfer(c.addrs.owner, 25n * DEC6, { nonce: await pNonce() })).wait();
    const before = sends(h);
    H.click(w, ".b-buy");
    await H.until(() => /Not enough USDC/.test(bodyText(w)), 20000, "the refusal");
    ok("K20 · P7 refuses from the FRESH balance, verbatim",
       bodyText(w).indexOf("Not enough USDC in this wallet - USD 20 buys the bundle.") >= 0, bodyText(w).slice(0, 220));
    ok("K21 · and NOTHING was signed — the refusal happened before any prompt", sends(h) - before === 0);
    ok("K21b · the tile now holds the fresh zero, not the kept 25",
       w.DYStore._bundleSnapshot().asset.usdc.balance === "0",
       JSON.stringify(w.DYStore._bundleSnapshot().asset.usdc));
    good.srv.close(); H.teardown(h);
  }
  {
    console.log("\n── K22-K25 · a failed pre-cast read STOPS, it does not guess ──");
    const c = await H.chainStore(); c0 = c;
    const good = await rpcServer("ok", RPC);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    await (await c.usdc.connect(c.player).approve(c.addrs.ps, 100n * DEC6, { nonce: await pNonce() })).wait(); // a REAL allowance,
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });               // would sail straight through
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the first read");

    // every endpoint dies AFTER the tile is good: the kept state is perfectly buyable, the chain unreachable
    w.DY_CONFIG.chain.readRpcUrls = deadList.slice();
    w.DYWallet._resetReadRoad();
    let before = sends(h);
    H.click(w, ".b-buy");
    await H.until(() => /Couldn't check this wallet just now/.test(bodyText(w)), 30000, "the P12 stop");
    ok("K22 · P12 renders VERBATIM",
       bodyText(w).indexOf("Couldn't check this wallet just now - try again in a moment. Nothing was signed.") >= 0,
       bodyText(w).slice(0, 260));
    ok("K23 · NOTHING was signed, though the kept state said the buy was fine", sends(h) - before === 0);

    // the ROAD-level failure too (readProvider itself throws before a job exists) — the S2-class mutant
    w.DY_CONFIG.chain.readRpcUrls = [good.url];
    w.DYWallet._resetReadRoad();
    const realRP = w.DYWallet.readProvider;
    w.DYWallet.readProvider = function () { throw new Error("no read road"); };
    await w.DYStore._bundleRefresh();                      // clear the P12 flash off the tile
    before = sends(h);
    H.click(w, ".b-buy");
    await H.until(() => /Couldn't check this wallet just now/.test(bodyText(w)), 30000, "the P12 stop, road-level");
    ok("K24 · a road that throws before any job also stops at P12", true);
    ok("K25 · and still nothing was signed", sends(h) - before === 0);
    w.DYWallet.readProvider = realRP;
    good.srv.close(); H.teardown(h);
  }
  {
    // ── THE TOP-UP PATH · the same three, plus the headroom the tile was holding ──
    console.log("\n── K26-K31 · the top-up path: the same three stops ──");
    const c = await H.chainStore(); c0 = c;
    const good = await rpcServer("ok", RPC);
    await (await c.nft.setMinter(c.addrs.owner, true)).wait();
    await (await c.nft.mint(c.player.address)).wait();                    // a holder: the top-up face
    await (await c.usdc.mint(c.player.address, 100n * DEC6)).wait();
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /top up 2,000 more DYC/.test(bodyText(w)), 20000, "the holder's face");

    // (1) a kept allowance must not skip approve here either
    const pu = c.usdc.connect(c.player);
    await (await pu.approve(c.addrs.ps, 100n * DEC6, { nonce: await pNonce() })).wait();
    await w.DYStore._bundleRefresh();
    await (await pu.approve(c.addrs.ps, 0n, { nonce: await pNonce() })).wait();
    let before = sends(h);
    H.click(w, ".b-topup");
    await H.until(() => /Topped up/.test(bodyText(w)), 30000, "the top-up");
    ok("K26 · top-up: APPROVE WAS REQUESTED despite the kept allowance", sends(h) - before === 2,
       "sent " + (sends(h) - before));

    // (2) the headroom the tile shows is now stale by one pack — the pre-cast must have re-read it
    ok("K27 · the tile's headroom came back fresh from the pre-cast read",
       w.DYStore._bundleSnapshot().headroom === String(1500n * DEC), w.DYStore._bundleSnapshot().headroom);

    // (3) the balance leaves; the refusal must come from the fresh read, with nothing signed
    const left = await c.usdc.balanceOf(c.player.address);
    await (await pu.transfer(c.addrs.owner, left, { nonce: await pNonce() })).wait();
    before = sends(h);
    H.click(w, ".b-topup");
    await H.until(() => /Not enough USDC/.test(bodyText(w)), 20000, "the top-up refusal");
    ok("K28 · top-up: P7 refuses from the FRESH balance",
       bodyText(w).indexOf("Not enough USDC in this wallet - USD 5 buys the bundle.") >= 0, bodyText(w).slice(0, 240));
    ok("K29 · top-up: nothing was signed", sends(h) - before === 0);

    // (4) and a failed pre-cast read stops the top-up too
    await (await c.usdc.mint(c.player.address, 100n * DEC6)).wait();
    await w.DYStore._bundleRefresh();
    w.DY_CONFIG.chain.readRpcUrls = deadList.slice();
    w.DYWallet._resetReadRoad();
    before = sends(h);
    H.click(w, ".b-topup");
    await H.until(() => /Couldn't check this wallet just now/.test(bodyText(w)), 30000, "the top-up P12");
    ok("K30 · top-up: P12 stops the road", true);
    ok("K31 · top-up: nothing was signed", sends(h) - before === 0);
    good.srv.close(); H.teardown(h);
  }

  {
    // ── THE PEN CHANGED UNDER THE READ ──
    // `me` is read at the tap and the pre-cast read is a round trip. If MetaMask switches accounts during it, F holds
    // the OLD wallet's numbers while signerRoad() would hand back the NEW wallet's signer — wallet B asked to approve
    // against wallet A's balance, allowance and price. The switch is forced DURING the read, not around it.
    console.log("\n── K32-K33 · the wallet switched under the pre-cast read ──");
    const c = await H.chainStore(); c0 = c;
    const good = await rpcServer("ok", RPC);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    const h = await H.storePage(c, c.player, { readUrls: [good.url] });
    const w = h.w;
    await connect(w);
    await H.until(() => /In stock/.test(bodyText(w)), 20000, "the first read");

    const realRP = w.DYWallet.readProvider, wasAddr = w.DYWallet.state.address;
    let flipped = false;
    w.DYWallet.readProvider = function () {
      const p = realRP();
      const send = p.send.bind(p);
      p.send = function (m, a) {
        if (!flipped && m === "eth_call") { flipped = true; w.DYWallet.state.address = "0x000000000000000000000000000000000000dEaD"; }
        return send(m, a);
      };
      return p;
    };
    const before = sends(h);
    H.click(w, ".b-buy");
    await H.until(() => /Couldn't check this wallet just now/.test(bodyText(w)), 30000, "the P12 stop after the switch");
    ok("K32 · the switch was really forced mid-read (not before it, not after)", flipped === true);
    ok("K33 · the road stopped at P12 and NOTHING was signed for the wallet that arrived",
       sends(h) - before === 0);
    w.DYWallet.readProvider = realRP; w.DYWallet.state.address = wasAddr;
    good.srv.close(); H.teardown(h);
  }

  // ════════ THE SOURCE LAWS ════════
  {
    // STORE-READ-2 · THE PRE-CAST LAWS. The behavioural cases above can be satisfied by a page that happens to be
    // fresh; these pin the SHAPE, so re-introducing the defect fails here even if a test chain hides it.
    const st = fs.readFileSync(path.join(SITE, "js", "store.js"), "utf8");
    const fn = (name, end) => st.slice(st.indexOf("function " + name), st.indexOf("function " + end));

    // (1) NO DECISION MAY READ THE KEPT ASSET NUMBERS. This is the mutant guard: put `a.allowance` back into either
    //     road and this fails, whatever the chain says.
    const KEPT = /\ba\.(balance|allowance|bundlePrice|packPrice)\b/;
    const buyFn = fn("bundleBuy", "bundleTopUp");
    const topFn = fn("bundleTopUp", "bundleReceipt");
    ok("L1 · bundleBuy reads NO kept balance/allowance/price", !KEPT.test(buyFn),
       (buyFn.match(KEPT) || [""])[0]);
    ok("L2 · bundleTopUp reads NO kept balance/allowance/price", !KEPT.test(topFn),
       (topFn.match(KEPT) || [""])[0]);
    ok("L3 · both roads take their decisions from the pre-cast read instead",
       /preCastRead\(a, me, false\)/.test(buyFn) && /F\.allowance >= F\.bundlePrice/.test(buyFn) &&
       /preCastRead\(a, me, true\)/.test(topFn) && /F\.allowance >= total/.test(topFn));
    ok("L4 · and the approve AMOUNT is a fresh number on both roads",
       /approve\(psAddr\(\), F\.bundlePrice, fee\)/.test(buyFn) && /total = F\.packPrice \* BigInt\(packs\)/.test(topFn));

    // (2) ALL OR NOTHING. A per-job catch here would turn a failed read back into a guess (`undefined`), which is
    //     exactly the class of bug STORE-READ-2 shipped on the tile.
    const pre = fn("preCastRead", "writeBackFresh");
    ok("L5 · preCastRead has NO per-job catch — a failed read propagates, it never becomes a value",
       pre.indexOf("catch") < 0 && /Promise\.all\(jobs\)/.test(pre), pre.slice(0, 120));
    ok("L6 · the pre-cast rides the WALKING road, not a pinned endpoint",
       /readProvider\(\)/.test(pre) && !/scanProvider|JsonRpcProvider/.test(pre));

    // (3) the write-back may never cross a wallet or a chain (carryForward's law, applied to the fresh values)
    const wb = fn("writeBackFresh", "preCastStop");
    ok("L7 · writeBackFresh refuses once the identity has moved",
       /bIdent/.test(wb) && /identOf\(\)/.test(wb) && /bState\.me \|\| null\) !== \(me \|\| null\)/.test(wb));
    ok("L8 · and it does NOT clear the kept-reading line, which other fields still earn",
       !/bStale\s*=\s*false/.test(wb));

    // (4) the pen may not change under the read: the decisions refuse a wallet they did not read for
    ok("L10 · both roads re-check the connected wallet after the pre-cast read, before the signer road",
       /function sameWallet\(me\)/.test(st) &&
       (buyFn.match(/if \(!sameWallet\(me\)\)/g) || []).length === 1 &&
       (topFn.match(/if \(!sameWallet\(me\)\)/g) || []).length === 1 &&
       buyFn.indexOf("sameWallet(me)") < buyFn.indexOf("signerRoad()") &&
       topFn.indexOf("sameWallet(me)") < topFn.indexOf("signerRoad()"));

    // (5) P12 is ruled copy: the page's constant and the doc must agree, and copyproof must hold it
    const design = fs.readFileSync(path.join(SITE, "docs", "STORE_DESIGN.md"), "utf8");
    const P12 = "Couldn't check this wallet just now - try again in a moment. Nothing was signed.";
    ok("L9 · P12 is in the page, the doc and the copy prover",
       st.indexOf('var B_P12 = "' + P12 + '"') >= 0 && design.indexOf(P12) >= 0 &&
       fs.readFileSync(path.join(SITE, "mp", "copyproof.js"), "utf8").indexOf(P12) >= 0);
  }

  console.log("──\n" + (fail === 0 ? "ALL GREEN — " + pass + "/" + (pass + fail) : "FAILURES — " + fail + " of " + (pass + fail)));
  if (fail) process.exitCode = 1;
}

run().catch((e) => { console.log("precast suite crashed: " + (e && e.stack || e)); process.exitCode = 1; });
