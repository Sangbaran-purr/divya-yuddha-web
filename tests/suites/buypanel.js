"use strict";
// ICO-SIMPLE-1 (owner rulings 2026-10-25) — THE DASHBOARD'S BUY PANEL, the presale without a form. The sale under test is
// the REAL DYCoinSale + VestingVault on anvil (opened to the presale round); only the approval bot's voucher door is
// stubbed, and its vouchers are signed exactly as the bot signs them (its own signer module, the sale's trusted key).
//   BP · connect → the panel prepares a pass → Buy DYC (approve → buy) → 15% liquid / 85% vesting; USDT or USDC; staking
//        offered AFTER as its own step; the door's refusal and its absence told in the owner's words; the pass kept
//   M  · breakages applied to the page's own source, each caught
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = path.resolve(__dirname, "..", "..");
const DEC = 1000000000000000000n, DEC6 = 1000000n;
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const txt = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent : ""; };
const body = (w) => txt(w, "#buy-body");
const PREP = "Preparing your presale pass…";
const DOWN = "We couldn't reach the presale service — please try again in a moment.";
const NO = "This wallet can't buy in the presale. If you think this is a mistake, contact us.";
const OLD = /Register to buy|allowlist-gated|approves your wallet|Open the registration form|Check my status now|Checking for your approval|isn't approved for the presale|approved to buy in the presale|Activate Staking|Buy without activating/;
const DOOR = "https://bot.test/presale/voucher";
const { makeSigner } = require(path.join(H.W3, "services", "approval-bot", "src", "signer.js"));

// the voucher door, as the approval bot answers it (mode: ok | refuse | down)
function door(c, mode, seen) {
  return { "/presale/voucher": async (init) => {
    seen.calls++;
    if (mode === "down") return { __throw: true };
    if (mode === "refuse") return { __status: 403, body: { refused: "NOT_ELIGIBLE" } };
    const wallet = JSON.parse(init.body).wallet;
    const chainId = Number((await c.provider.getNetwork()).chainId);
    return { wallet, sig: await makeSigner(c.signer.privateKey, chainId, c.addrs.sale).sign(wallet) };
  } };
}
async function page(c, opts) {
  const seen = { calls: 0 };
  const svc = Object.assign({}, door(c, opts.mode || "ok", seen), opts.allowlist ? { "allowlist": () => opts.allowlist } : {});
  const h = await H.dashboardPage(c, c.player, {
    svc, presaleVoucherUrl: opts.noDoor ? null : DOOR, ls: opts.ls, dashSrc: opts.dashSrc,
    contracts: { dycoinSale: c.addrs.sale, vestingVault: c.addrs.vault, usdt: c.addrs.usdt, usdc: c.addrs.usdc, holderStaking: opts.staking || null },
  });
  return { w: h.w, eth: h.eth, seen };
}
// each page polls the chain on its own timers; a block STOPS its pages' timers when done, so the next block's page is not
// starved. Deliberately NOT window.close() — a late callback on a closed window crashes the process (lib.js teardown).
const done = (...ws) => ws.forEach((w) => { for (let id = 1; id < 5000; id++) { try { w.clearInterval(id); w.clearTimeout(id); } catch (e) {} } });
async function connected(w) { await w.DYWallet.connect(); await H.until(() => !/Connect your wallet|^$/.test(body(w)) && body(w) !== PREP, 20000, "the buy panel"); }
async function buy(w, amount) {
  w.document.getElementById("buy-amt").value = amount;
  w.document.getElementById("buy-amt").dispatchEvent(new w.Event("input"));
  H.click(w, "#buy-go");
}
const dycOut = (usd6) => (usd6 * 10n ** 12n * DEC) / (8n * 10n ** 15n);   // the presale price: $0.008

async function run() {
  console.log("\n── ICO-SIMPLE-1 · the buy panel ──");
  await H.preflight();

  // ═══ BP1–BP3 — connect, the pass prepared, Buy DYC with USDT ═══
  {
    const c = await H.chainPresale();
    const p = await page(c, { staking: c.addrs.owner });   // any address: the after-step only has to be OFFERED
    const w = p.w;
    let sawPrep = false;
    const obs = new w.MutationObserver(() => { if (body(w).indexOf(PREP) >= 0) sawPrep = true; });
    obs.observe(w.document.getElementById("buy-body"), { childList: true, subtree: true, characterData: true });
    await connected(w);
    ok("BP1 · a wallet that never registered connects: '" + PREP + "', then the calculator — no form, no approval wait, none of the old copy",
       sawPrep && !!w.document.getElementById("buy-go") && txt(w, "#buy-go") === "Buy DYC" && p.seen.calls === 1 && !OLD.test(body(w)), body(w).slice(0, 200));
    const chips = [...w.document.querySelectorAll(".buy-coin-chip")].map((e) => e.textContent + (e.getAttribute("aria-pressed") === "true" ? "*" : ""));
    ok("BP2 · the coin switch offers USDT and USDC (USDT first, chosen); the narration says approve → buy and nothing about staking",
       chips.join(",") === "USDT*,USDC" && /Amount in \(USDT\)/.test(body(w)) &&
       /Your wallet will ask you to approve USDT \(only if needed\), then to buy — 15% lands in your wallet, 85% into vesting\./.test(body(w)), chips.join(",") + " | " + body(w).slice(0, 220));
    const before = await c.usdt.balanceOf(c.player.address);
    await buy(w, "100");
    await H.until(async () => (await c.vault.grantedTo(c.player.address)) > 0n, 30000, "the purchase to land");
    await H.until(() => !!w.document.getElementById("buy-done"), 20000, "the after-purchase panel");
    const out = dycOut(100n * DEC6), liquid = await c.dyc.balanceOf(c.player.address), vested = await c.vault.grantedTo(c.player.address);
    const sent = p.eth.__calls.filter((m) => m === "eth_sendTransaction").length;
    ok("BP3 · Buy DYC with USD 100 in USDT: exactly two wallet prompts (approve, buy) — 12,500 DYC, 1,875 liquid + 10,625 vesting; USDT −100",
       sent === 2 && liquid === out * 15n / 100n && vested === out - out * 15n / 100n && before - (await c.usdt.balanceOf(c.player.address)) === 100n * DEC6,
       "prompts " + sent + " liquid " + ethers.formatUnits(liquid, 18) + " vested " + ethers.formatUnits(vested, 18));
    ok("BP4 · AFTER the purchase, staking is offered as its own optional step (not run): 'Purchase complete — DYC bought.', 'Activate staking', 'Buy more'",
       txt(w, "#buy-done") === "Purchase complete — DYC bought." && /Optional: activate staking — your vesting DYC starts earning 0\.40%\/day\./.test(body(w)) &&
       txt(w, "#buy-stake") === "Activate staking" && txt(w, "#buy-again") === "Buy more", body(w));   // (not run: BP3 counted exactly two prompts)
    // the pass is kept for this wallet: a later visit makes no call
    const ls = { ["dy::presaleVoucher:" + c.player.address.toLowerCase()]: w.localStorage.getItem("dy::presaleVoucher:" + c.player.address.toLowerCase()) };
    const p2 = await page(c, { ls });
    await connected(p2.w);
    ok("BP5 · the pass is kept for its wallet: the next visit shows the calculator with NO call to the door", !!p2.w.document.getElementById("buy-go") && p2.seen.calls === 0 && !!ls[Object.keys(ls)[0]]);
    done(w, p2.w);
  }

  // ═══ BP6 — USDC ═══
  {
    const c = await H.chainPresale();
    const p = await page(c, {});
    const w = p.w;
    await connected(w);
    H.click(w, ".buy-coin-chip[data-coin='usdc']");
    await H.sleep(200);
    const label = /Amount in \(USDC\)/.test(body(w)), t0 = await c.usdt.balanceOf(c.player.address), c0 = await c.usdc.balanceOf(c.player.address);
    await buy(w, "150");
    await H.until(async () => (await c.vault.grantedTo(c.player.address)) > 0n, 30000, "the USDC purchase to land");
    ok("BP6 · switched to USDC, the buy pays USDC (−150) and leaves USDT untouched; 18,750 DYC delivered 15/85",
       label && c0 - (await c.usdc.balanceOf(c.player.address)) === 150n * DEC6 && (await c.usdt.balanceOf(c.player.address)) === t0 &&
       (await c.dyc.balanceOf(c.player.address)) + (await c.vault.grantedTo(c.player.address)) === dycOut(150n * DEC6));
    done(w);
  }

  // ═══ BP7–BP9 — the door refuses, the door is down, the minimum ═══
  {
    const c = await H.chainPresale();
    const r = await page(c, { mode: "refuse", allowlist: [{ wallet: c.player.address, sig: "0x00" }] });
    await r.w.DYWallet.connect(); await H.until(() => body(r.w) !== PREP && !/Connect your wallet/.test(body(r.w)), 20000, "the refusal");
    ok("BP7 · an OFAC refusal (403) says, in the owner's words, '" + NO + "' — no Buy button, and NO fallback to the allowlist",
       txt(r.w, "#buy-refused") === NO && !r.w.document.getElementById("buy-go") && !r.w.__fetches.some((u) => /allowlist/.test(u)), body(r.w));
    done(r.w);
    const d = await page(c, { mode: "down" });
    await d.w.DYWallet.connect(); await H.until(() => body(d.w) !== PREP && !/Connect your wallet/.test(body(d.w)), 20000, "the outage");
    ok("BP8 · the door unreachable and no published voucher: '" + DOWN + "' with 'Try again'", txt(d.w, "#buy-unreachable") === DOWN && txt(d.w, "#buy-retry") === "Try again", body(d.w));
    done(d.w);
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const held = { wallet: c.player.address, sig: await makeSigner(c.signer.privateKey, chainId, c.addrs.sale).sign(c.player.address) };
    const f = await page(c, { mode: "down", allowlist: [held] });
    await connected(f.w);
    ok("BP9 · the door unreachable but the wallet already holds a published voucher: it still buys (the allowlist fallback)", !!f.w.document.getElementById("buy-go"), body(f.w).slice(0, 160));
    const m = f.w;
    m.document.getElementById("buy-amt").value = "99"; m.document.getElementById("buy-amt").dispatchEvent(new m.Event("input"));
    ok("BP10 · the site minimum stays 100: 99 disables Buy and says 'Minimum purchase is 100 USDT.'", m.document.getElementById("buy-go").disabled && txt(m, "#buy-min") === "Minimum purchase is 100 USDT.");
    done(m);
  }

  // ═══ BP11 — the GAS-HELP-1 slot ═══
  const src = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8");
  const flow = src.slice(src.indexOf("function buyFlow("), src.indexOf("function renderAfterBuy("));
  ok("BP11 · a clean slot for GAS-HELP-1: buyFlow starts its chain at beforeApprove(), ahead of the approve (not built: it resolves at once)",
     /function beforeApprove\(\) \{ return Promise\.resolve\(\); \}/.test(src) && flow.indexOf("var chain = beforeApprove();") >= 0 && flow.indexOf("var chain = beforeApprove();") < flow.indexOf("tok.approve("));
  ok("BP12 · the old registration road is gone from the page code (no form link, no approval poll, no combined buy-and-stake)",
     !/forms\.gle|renderRegister|startBuyApprovalPoll|Activate Staking|buy-noact/.test(src));

  // ═══ M — breakages applied to the page's own source ═══
  const mutate = (a, b) => { if (src.indexOf(a) < 0) throw new Error("breakage anchor gone: " + a.slice(0, 60)); return src.split(a).join(b); };
  {
    const c = await H.chainPresale();
    const p = await page(c, { dashSrc: mutate('var sig = isPresale && buyState.voucher ? buyState.voucher.sig : "0x";', 'var sig = "0x";') });
    await connected(p.w);
    await buy(p.w, "100");
    await H.sleep(4000);
    ok("M1 · breakage 'buy without the voucher' is caught (BP3 goes red: nothing is bought; the sale refuses)", (await c.vault.grantedTo(c.player.address)) === 0n);
    done(p.w);
  }
  {
    const c = await H.chainPresale();
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const held = { wallet: c.player.address, sig: await makeSigner(c.signer.privateKey, chainId, c.addrs.sale).sign(c.player.address) };
    const p = await page(c, { mode: "down", allowlist: [held], dashSrc: mutate("    return ask.catch(function () {", "    return ask.then(null, function () { return { state: \"unavailable\" }; }).catch(function () {") });
    await p.w.DYWallet.connect(); await H.until(() => body(p.w) !== PREP && !/Connect your wallet/.test(body(p.w)), 20000, "the panel");
    ok("M2 · breakage 'no allowlist fallback' is caught (BP9 goes red: a published holder is told the service is down)", !p.w.document.getElementById("buy-go"));
    done(p.w);
  }
  {
    const c = await H.chainPresale();
    const p = await page(c, { dashSrc: mutate("return coin ? { key: coin.key, label: coin.label, addr: c[coin.key] } : null;", "return coin ? { key: coin.key, label: coin.label, addr: c.usdt } : null;") });
    await connected(p.w);
    H.click(p.w, ".buy-coin-chip[data-coin='usdc']"); await H.sleep(200);
    const c0 = await c.usdc.balanceOf(c.player.address);
    await buy(p.w, "100");
    await H.until(async () => (await c.vault.grantedTo(c.player.address)) > 0n, 30000, "the purchase");
    ok("M3 · breakage 'the switch names USDC but pays USDT' is caught (BP6 goes red)", (await c.usdc.balanceOf(c.player.address)) === c0);
    done(p.w);
  }
  {
    const c = await H.chainPresale();
    const p = await page(c, { mode: "refuse", allowlist: [{ wallet: c.player.address, sig: "0x00" }], dashSrc: mutate('if (r.status === 403) return { state: "refused" };', "") });
    await p.w.DYWallet.connect(); await H.until(() => body(p.w) !== PREP && !/Connect your wallet/.test(body(p.w)), 20000, "the panel");
    ok("M4 · breakage 'treat a refusal like an outage' is caught (BP7 goes red: the allowlist is read and the refusal is not told)",
       txt(p.w, "#buy-refused") !== NO && p.w.__fetches.some((u) => /allowlist/.test(u)));
  }

  console.log("──\n" + (fail === 0 ? "ALL GREEN — " + pass + "/" + (pass + fail) : "FAILURES — " + fail + " of " + (pass + fail)));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("buypanel suite crashed:", e); process.exit(1); });
