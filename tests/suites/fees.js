"use strict";
// FEE-1 — THE ONE PLAYER FEE RULE (owner-adopted 2026-10-09).
//
//     tip    = max(the network's suggested tip, 30 gwei)
//     maxFee = max(2 × latest base fee + tip, 45 gwei)
//
// RUNG4-FIX-6 sent tip = maxFee = 2 × (network price): every send paid its whole cap. Measured on mainnet (FEE-1
// STEP-0): 7 player transactions sent through the site paid 3.0–3.3× the base fee — 0.550 POL where 0.230 was fair —
// and on anvil the doubled tip fed back into the next suggestion until a 10,000-ETH account ran dry.
//
// Proven here: the rule's numbers on the 7 recorded mainnet blocks; the tip never above the cap; the floor; a failed read
// is the floor and never a guess; an anvil run (the REAL js/wallet.js) where the tip no longer compounds, beside the
// committed old rule doing so; real writes on anvil carrying the rule's fields; and every player write road on the
// store, treasury, Hall and dashboard reaching the ONE function.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = H.SITE;
const G = 1000000000n, DEC = 10n ** 18n, DEC6 = 1000000n;
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }

// the REAL js/wallet.js, booted the way a page boots it (config.js first), with a read road we control
function bootWallet(src, readProvider, rpcUrl) {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://divyayuddha.games/store.html", runScripts: "outside-only" });
  const w = dom.window;
  w.ethers = ethers;
  // the page's OWN read road pointed at a chain (the harness's dy::readRpcUrl idiom) — a rule that reads through its
  // closure (the old one does) must read THIS chain too, or it prices a different network than it sends on
  if (rpcUrl) w.localStorage.setItem("dy::readRpcUrl", rpcUrl);
  w.eval(fs.readFileSync(path.join(SITE, "config.js"), "utf8"));
  w.eval(src || fs.readFileSync(path.join(SITE, "js", "wallet.js"), "utf8"));
  if (readProvider) w.DYWallet.readProvider = function () { return readProvider; };
  return w;
}

// THE 7 MEASURED MAINNET TRANSACTIONS (FEE-1 STEP-0, read from drpc on 2026-10-09). base = the block's base fee; sugg =
// that block's median tip (eth_feeHistory p50) standing in for the network's suggestion; paid = what was charged.
const MAINNET = [
  { tx: "bundle buy @94,709,007",       gas: 258414, base: 244.6, sugg: 78, paid: 773.9 },
  { tx: "bundle approve @94,708,999",   gas: 55850,  base: 246.0, sugg: 78, paid: 784.8 },
  { tx: "Hall join #29 @95,110,123",    gas: 100641, base: 245.0, sugg: 75, paid: 807.5 },
  { tx: "Hall approve #29 @95,110,115", gas: 55033,  base: 254.8, sugg: 75, paid: 779.2 },
  { tx: "Hall join #28 @95,097,493",    gas: 104601, base: 193.3, sugg: 75, paid: 624.3 },
  { tx: "Hall join #24 @94,639,808",    gas: 100641, base: 249.5, sugg: 75, paid: 751.4 },
  { tx: "Hall approve #24 @94,639,802", gas: 55033,  base: 242.3, sugg: 75, paid: 749.6 },
];
const gw = (x) => BigInt(Math.round(x * 1e9));

async function run() {
  console.log("\n── FEE-1 · the one player fee rule ──");
  const miss = H.preflight();
  if (miss.length) { console.log("PREFLIGHT FAILED:\n" + miss.join("\n")); process.exit(1); }

  // ═══════════ R · THE RULE ═══════════
  const W = bootWallet();
  const rule = W.DYWallet._feeFromNetwork;
  {
    const table = [];
    let allOk = true, beforePOL = 0, afterPOL = 0;
    for (const m of MAINNET) {
      const f = rule(gw(m.base), gw(m.sugg));
      const tip = gw(m.sugg) > 30n * G ? gw(m.sugg) : 30n * G;
      const wantCap = 2n * gw(m.base) + tip;
      if (f.maxPriorityFeePerGas !== tip || f.maxFeePerGas !== wantCap) allOk = false;
      const after = Number(gw(m.base) + f.maxPriorityFeePerGas) / 1e9;                // what EIP-1559 charges: base + tip (< cap)
      beforePOL += m.paid * m.gas / 1e9; afterPOL += after * m.gas / 1e9;
      table.push(m.tx + ": paid " + m.paid + " → " + after.toFixed(1) + " gwei (cap " + (Number(f.maxFeePerGas) / 1e9).toFixed(1) + ")");
    }
    ok("R1 · THE 7 MEASURED MAINNET BLOCKS: tip = max(suggestion, 30), maxFee = 2×base + tip, exactly", allOk);
    ok("R2 · predicted: the same 7 sends cost " + afterPOL.toFixed(5) + " POL instead of " + beforePOL.toFixed(5) + " (−" + (100 * (1 - afterPOL / beforePOL)).toFixed(0) + "%)",
       afterPOL < beforePOL * 0.5, table.join(" | "));
    console.log("      " + table.join("\n      "));
    // the tip can never exceed the cap — a sweep over every shape, including absurd ones
    const shapes = [];
    for (const b of [0n, 1n, 10n * G, 250n * G, 5000n * G]) for (const t of [0n, 1n, 29n * G, 30n * G, 31n * G, 800n * G, 10n ** 15n]) shapes.push([b, t]);
    ok("R3 · THE TIP NEVER EXCEEDS maxFee (35 shapes, zero to absurd)",
       shapes.every(([b, t]) => { const f = rule(b, t); return f.maxPriorityFeePerGas <= f.maxFeePerGas; }));
    const low = rule(1n * G, 1n * G);
    ok("R4 · THE FLOOR HOLDS when the network suggests less: 1 gwei base, 1 gwei tip → tip 30, cap 45",
       low.maxPriorityFeePerGas === 30n * G && low.maxFeePerGas === 45n * G, JSON.stringify({ t: String(low.maxPriorityFeePerGas), c: String(low.maxFeePerGas) }));
    const none = rule(null, null);
    ok("R5 · no base fee and no suggestion → the floor (45/30), never zero", none.maxPriorityFeePerGas === 30n * G && none.maxFeePerGas === 45n * G);
    const hi = rule(250n * G, 80n * G);
    ok("R6 · above the floor the suggestion is taken AS-IS (80 → 80, never doubled)", hi.maxPriorityFeePerGas === 80n * G && hi.maxFeePerGas === 580n * G);
  }
  {
    // the send path itself, against a read road that fails, and one that answers
    const failing = { getBlock: () => Promise.reject(new Error("down")), send: () => Promise.reject(new Error("down")) };
    const w1 = bootWallet(null, failing);
    const f1 = await w1.DYWallet.feeOverrides();
    ok("R7 · A FAILED READ IS THE FLOOR — 45/30, never {} and never a doubled guess",
       f1.maxFeePerGas === 45n * G && f1.maxPriorityFeePerGas === 30n * G, JSON.stringify({ c: String(f1.maxFeePerGas), t: String(f1.maxPriorityFeePerGas) }));
    const half = { getBlock: () => Promise.resolve({ baseFeePerGas: 250n * G }), send: () => Promise.reject(new Error("method not found")) };
    const f2 = await bootWallet(null, half).DYWallet.feeOverrides();
    ok("R8 · half a read (no suggestion) is also the floor — no guess from the half that answered", f2.maxPriorityFeePerGas === 30n * G && f2.maxFeePerGas === 45n * G);
    const answering = { getBlock: () => Promise.resolve({ baseFeePerGas: 244600000000n }), send: (m) => Promise.resolve(m === "eth_maxPriorityFeePerGas" ? "0x" + (78n * G).toString(16) : null) };
    const w3 = bootWallet(null, answering);
    const f3 = await w3.DYWallet.feeOverrides();
    ok("R9 · a live read sends exactly the rule (block 94,709,007's numbers: tip 78, cap 567.2 gwei)",
       f3.maxPriorityFeePerGas === 78n * G && f3.maxFeePerGas === 2n * 244600000000n + 78n * G && Object.keys(f3).sort().join(",") === "maxFeePerGas,maxPriorityFeePerGas");
    const e3 = await w3.DYWallet.feeEstimate();
    ok("R10 · the estimate is base + tip (322.6 gwei), not the cap", e3 && e3.perGas === 244600000000n + 78n * G);
    const e1 = await w1.DYWallet.feeEstimate();
    ok("R11 · an unread estimate is null (the Hall draws its sentinel), never the floor dressed as a price", e1 === null);
  }

  // ═══════════ C · THE TIP NO LONGER COMPOUNDS (anvil, the REAL wallet.js, beside the committed old one) ═══════════
  async function compound(src) {
    const provider = new ethers.JsonRpcProvider(H.RPC);
    await provider.send("anvil_mine", ["0x40"]);
    const key = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";   // anvil account #4
    const sender = new ethers.NonceManager(new ethers.Wallet(key, provider));
    await provider.send("anvil_setBalance", [await sender.getAddress(), "0x" + (10n ** 24n).toString(16)]);
    const w = bootWallet(src, null, H.RPC);
    w.DY_CONFIG.chain.id = Number((await provider.getNetwork()).chainId);
    const tips = [], ratios = [];
    for (let i = 0; i < 15; i++) {
      const sugg = BigInt(await provider.send("eth_maxPriorityFeePerGas", []));   // what the network suggests NOW
      const fee = await w.DYWallet.feeOverrides();
      const tx = await sender.sendTransaction(Object.assign({ to: await sender.getAddress(), value: 0n }, fee));
      await tx.wait();
      tips.push(Number(fee.maxPriorityFeePerGas / G));
      ratios.push(sugg > 0n ? Number(fee.maxPriorityFeePerGas * 100n / sugg) / 100 : null);
    }
    return { tips, ratios };
  }
  {
    const oldSrc = execSync("git show e531a6f:js/wallet.js", { cwd: SITE }).toString();     // the rule before FEE-1
    // THE MECHANISM: a rule compounds when its tip AMPLIFIES the network's suggestion, wherever that suggestion is
    // learned from recent tips (anvil; measured in the invites suite at 3 -> 999,911 gwei over a dozen page sends).
    const oldR = await compound(oldSrc);
    const newR = await compound(null);
    ok("C1 · the OLD rule amplifies: every one of 15 sends tipped at least 2× what the network suggested (control)",
       oldR.ratios.every((r) => r === null || r >= 2), "ratios " + oldR.ratios.join(", ") + " · tips " + oldR.tips.join(" → "));
    ok("C2 · THE NEW RULE DOES NOT: 15 sends, every tip exactly max(suggestion, 30 gwei) — here the 30-gwei floor, flat",
       newR.tips.every((t) => t === 30) && newR.ratios.every((r) => r === null || r <= 1 || newR.tips.every((t) => t === 30)), newR.tips.join(" → "));
  }

  // ═══════════ L · REAL WRITE ROADS ON ANVIL CARRY THE RULE'S FIELDS ═══════════
  const sentTxs = async (c, h, n) => {
    const out = [];
    const head = await c.provider.getBlockNumber();
    for (let b = head; b > head - 12 && out.length < n; b--) {
      const B = await c.provider.getBlock(b, true);
      for (const t of B.prefetchedTransactions) if (t.from.toLowerCase() === c.player.address.toLowerCase()) out.push(t);
    }
    return out;
  };
  {
    // the store: a real bundle approve + buy through the page
    const c = await H.chainStore();
    await c.provider.send("anvil_mine", ["0x40"]);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    const h = await H.storePage(c, c.player);
    const w = h.w;
    const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { try { if (await fn()) return true; } catch (e) {} await H.sleep(80); } return false; };
    await until(() => w.DYWallet.state.hasProvider);
    await w.DYWallet.connect();
    await until(() => !!w.document.querySelector(".b-buy"));
    H.click(w, ".b-buy");
    await until(async () => (await c.nft.balanceOf(c.player.address)) > 0n, 40000);
    const txs = await sentTxs(c, h, 2);
    ok("L1 · THE BUNDLE ROAD: approve + buy both sent with tip 30 gwei and cap 45 gwei (anvil's base ≈ 0, so the floor)",
       txs.length === 2 && txs.every((t) => t.maxPriorityFeePerGas === 30n * G && t.maxFeePerGas === 45n * G),
       txs.map((t) => String(t.maxPriorityFeePerGas / G) + "/" + String(t.maxFeePerGas / G)).join(" "));
    ok("L2 · and neither send set tip = cap (the old shape)", txs.every((t) => t.maxPriorityFeePerGas < t.maxFeePerGas));
    H.teardown(h);
  }
  {
    // the dashboard: a real withdrawal (approve + redeem) on the real desk
    const { makeCouponSigner } = require(path.join(H.W3, "services", "approval-bot", "src", "winnings", "coupon.js"));
    const c = await H.chainWinnings();
    await c.provider.send("anvil_mine", ["0x40"]);
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const signer = makeCouponSigner({ privateKey: c.signer.privateKey, chainId, deskAddress: c.addrs.desk });
    const stub = {
      "/winnings/challenge": () => ({ nonce: "n1", message: "Divya Yuddha — winnings withdrawal\nnonce: n1" }),
      "/winnings/coupon": async () => { const s = await signer.sign(c.player.address, 900n * DEC, 0n); return { coupon: s.coupon, signature: s.signature, cumulativeWinningsWei: s.coupon.cumulativeWinningsWei, cumulativeInviteWei: "0", deadline: s.coupon.deadline }; },
    };
    const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.desk, service: "https://bot.test" }, svc: stub });
    const w = h.w;
    await w.DYWallet.connect(); await H.sleep(600);
    H.click(w, "#win-coupon");
    const t0 = Date.now(); while (!(w.document.querySelector("#win-redeem") && !w.document.querySelector("#win-redeem").disabled) && Date.now() - t0 < 15000) await H.sleep(100);
    H.click(w, "#win-redeem");
    const t1 = Date.now(); while (!w.document.querySelector("#ov-confirm-go") && Date.now() - t1 < 10000) await H.sleep(100);
    H.click(w, "#ov-confirm-go");
    const t2 = Date.now(); while ((await c.desk.redeemed(c.player.address)) === 0n && Date.now() - t2 < 30000) await H.sleep(150);
    const txs = await sentTxs(c, h, 2);
    ok("L3 · THE DASHBOARD ROAD: approve + redeem sent with the ONE rule's fields (30/45) and its own fixed gas limits",
       txs.length === 2 && txs.every((t) => t.maxPriorityFeePerGas === 30n * G && t.maxFeePerGas === 45n * G)
       && txs.some((t) => t.gasLimit === 90000n) && txs.some((t) => t.gasLimit === 260000n),
       txs.map((t) => String(t.maxPriorityFeePerGas / G) + "/" + String(t.maxFeePerGas / G) + " gas " + t.gasLimit).join(" | "));
    H.teardown(h);
  }

  // ═══════════ S · EVERY PLAYER WRITE ROAD REACHES THE ONE FUNCTION ═══════════
  {
    const src = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
    const wallet = src("js/wallet.js"), store = src("js/store.js"), hall = src("mp/hall.js"), dash = src("js/dashboard.js");
    ok("S1 · ONE rule: js/wallet.js holds feeFromNetwork, and no player page computes fees itself (no getFeeData, no FEE_HEADROOM)",
       /function feeFromNetwork\(baseFee, suggestedTip\)/.test(wallet)
       && [store, hall, dash].every((s) => !/getFeeData|FEE_HEADROOM/.test(s)) && !/FEE_HEADROOM/.test(wallet));
    ok("S2 · the dashboard's copy is gone: its feeOverrides IS the site rule", /function feeOverrides\(provider\) \{ return W\.feeOverrides\(\); \}/.test(dash));
    // every store/treasury send: the write call's LAST argument is `fee`, taken from DYWallet.feeOverrides()
    const storeWrites = [...store.matchAll(/\b(\w+)\.(approve|buy|buyBundle|topUp|list|delist|setApprovalForAll)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)]
      .filter((m) => !/staticCall/.test(m[0]) && m[1] !== "staticCall" && m[1] !== "reg");   // reg.list() is the wave registry, a read
    const badStore = storeWrites.filter((m) => !/,\s*fee$/.test(m[3].trim()));
    ok("S3 · STORE + TREASURY: all " + storeWrites.length + " write calls (card buy, approve, list, delist, market buy, bundle approve+buy, top-up) end in `fee`",
       storeWrites.length >= 11 && badStore.length === 0, badStore.map((m) => m[0]).join(" | "));
    // (GAS-HELP-1 R3: a store send may pass the fee through fallbackGas(…) first — it only ADDS a gasLimit on the top-up's
    //  fallback; the fee fields are still DYWallet.feeOverrides()'s, untouched)
    const FEE_ROAD = /window\.DYWallet\.feeOverrides\(\)(?:\.then\(fallbackGas\([^()]*\)\))?\.then\(function \(fee\)/g;
    ok("S4 · and every `fee` there comes from DYWallet.feeOverrides()",
       (store.match(FEE_ROAD) || []).length === storeWrites.length && /function fallbackGas\(on, gas\) \{ return function \(fee\) \{ return on \? Object\.assign\(\{\}, fee, \{ gasLimit: gas \}\) : fee; \}; \}/.test(store),
       (store.match(FEE_ROAD) || []).length + " vs " + storeWrites.length);
    const hallWrites = [...hall.matchAll(/\b(esc|dyc)\.(approve|openMatch|joinMatch|cancelMatch|settle)\(([^;]*?)\)(?=[;)\s.])/g)]
      .filter((m) => !/staticCall/.test(m[0]));
    const badHall = hallWrites.filter((m) => !/,\s*fee\)?$/.test(m[3].trim()));
    ok("S5 · HALL: every write (approve, open, join, cancel, settle) ends in `fee`, from the Hall's wrapper over DYWallet.feeOverrides",
       hallWrites.length >= 5 && badHall.length === 0 && /function feeOverrides\(\) \{ try \{ return \(window\.DYWallet && window\.DYWallet\.feeOverrides\)/.test(hall),
       hallWrites.length + " writes; bad: " + badHall.map((m) => m[0]).join(" | "));
    const dashWrites = (dash.match(/feeOverrides\(provider\)/g) || []).length;
    ok("S6 · DASHBOARD: every action (claim, stake, cash-out, drop redeem, buy, withdraw) takes its fees from feeOverrides(provider)",
       dashWrites >= 4 && /if \(fo\.maxFeePerGas != null\) \{ ovr\.maxFeePerGas = fo\.maxFeePerGas;/.test(dash), String(dashWrites));
    ok("S7 · THE HALL'S HINT is the estimate (base + tip) × SIT_GAS, labelled as one",
       /window\.DYWallet\.feeEstimate\(\)/.test(hall) && /var per = fe && fe\.perGas;/.test(hall) && /network fee \(estimate\): <b>/.test(hall));
    // the hint, driven: a stubbed estimate of 322.6 gwei × 260,000 gas = 0.0839 POL
    const hintSrc = hall.slice(hall.indexOf("function readFeeHint(ethers) {"), hall.indexOf("function raiseStrand("));
    let feeHint = null, painted = 0;
    const sandbox = { window: { DYWallet: { feeEstimate: () => Promise.resolve({ perGas: 322600000000n, maxFeePerGas: 567200000000n }) } }, SIT_GAS: 260000n,
      afterRead: () => { painted++; }, BigInt, Number, Promise };
    vm.createContext(sandbox);
    vm.runInContext("var feeHint = null;" + hintSrc + "; this.__go = function(){ return readFeeHint(null).then(function(){ return feeHint; }); };", sandbox);
    feeHint = await sandbox.__go();
    ok("S8 · the hint, driven: 322.6 gwei × 260,000 gas reads ~0.084 POL (the old hint priced the cap)", feeHint === "0.084" && painted === 1, String(feeHint));
  }

  // ═══════════ X · STAMPS ═══════════
  {
    // (ICO-SIMPLE-1: register.html is now a redirect to the dashboard's buy panel and loads no script)
    const pages = ["index.html", "admin.html", "store.html", "treasury.html", "dashboard.html", "report.html", "rite.html", "mp/hall.html"];
    const carrying = pages.filter((p) => fs.readFileSync(path.join(SITE, p), "utf8").indexOf("wallet.js?v=") >= 0);
    ok("X1 · wallet.js is stamped s1t on every page that loads it (" + carrying.length + ")",
       carrying.length === 8 && carrying.every((p) => /wallet\.js\?v=s1t/.test(fs.readFileSync(path.join(SITE, p), "utf8"))));
    ok("X2 · dashboard.js mf49 and hall.js h38",
       /js\/dashboard\.js\?v=mf49/.test(fs.readFileSync(path.join(SITE, "dashboard.html"), "utf8")) && /hall\.js\?v=h38/.test(fs.readFileSync(path.join(SITE, "mp/hall.html"), "utf8")));
  }

  console.log("──\n" + (fail === 0 ? "ALL GREEN — " + pass + "/" + (pass + fail) : "FAILURES — " + fail + " of " + (pass + fail)));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("fees suite crashed:", e); process.exit(1); });
