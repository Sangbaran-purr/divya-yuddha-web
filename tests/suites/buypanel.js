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
// GAS-HELP-1 R3 — the bot's /gas/topup, as it answers (mode: ok | slow | never | refuse | down). On "ok" it does what the
// bot does: sends POL to the wallet (here anvil_setBalance adds 1 POL) and answers { txHash, amountWei }.
function gasDoor(c, mode, seen) {
  return { "/gas/topup": async (init) => {
    const b = JSON.parse(init.body); seen.gas.push(b);
    if (mode === "down") return { __throw: true };
    if (mode === "refuse") return { __status: 422, body: { refused: "NOT_HOLDING" } };
    const amount = DEC;   // 1 POL
    const send = async () => { const cur = await c.provider.getBalance(b.wallet); await c.provider.send("anvil_setBalance", [b.wallet, "0x" + (cur + amount).toString(16)]); };
    if (mode === "ok") await send();
    if (mode === "slow") setTimeout(send, 3000);
    return { txHash: "0x" + "ab".repeat(32), amountWei: amount.toString(), confirmed: mode === "ok" };
  } };
}
const GAS = "https://bot.test/gas/topup";
const G_WAIT = "Getting you a little POL for the network fee — free…";
const G_OK = "POL received — your wallet will now ask you to approve, then to buy.";
const G_FALL = "We couldn't send POL just now — you can still go ahead: MetaMask can pay the network fee in USDT or USDC if you hold a little extra.";
async function page(c, opts) {
  const seen = { calls: 0, gas: [] };
  const svc = Object.assign({}, door(c, opts.mode || "ok", seen), opts.allowlist ? { "allowlist": () => opts.allowlist } : {}, opts.gas ? gasDoor(c, opts.gas, seen) : {});
  const h = await H.dashboardPage(c, c.player, {
    svc, presaleVoucherUrl: opts.noDoor ? null : DOOR, ls: opts.ls, dashSrc: opts.dashSrc, walletSrc: opts.walletSrc, gasTopUpUrl: opts.gas ? GAS : null,
    contracts: { dycoinSale: c.addrs.sale, vestingVault: c.addrs.vault, usdt: c.addrs.usdt, usdc: c.addrs.usdc, holderStaking: opts.staking || null },
  });
  return { w: h.w, eth: h.eth, seen };
}
// each page polls the chain on its own timers; a block STOPS its pages' timers when done, so the next block's page is not
// starved. Deliberately NOT window.close() — a late callback on a closed window crashes the process (lib.js teardown).
const sends = (eth) => eth.__calls.filter((m) => m === "eth_sendTransaction").length;
const done = (...ws) => ws.forEach((w) => { for (let id = 1; id < 5000; id++) { try { w.clearInterval(id); w.clearTimeout(id); } catch (e) {} } });
async function connected(w) { await w.DYWallet.connect(); await H.until(() => !/Connect your wallet|^$/.test(body(w)) && body(w) !== PREP, 20000, "the buy panel"); }
async function buy(w, amount) {
  w.document.getElementById("buy-amt").value = amount;
  w.document.getElementById("buy-amt").dispatchEvent(new w.Event("input"));
  H.click(w, "#buy-go");
}
// GAS-HELP-1 R0 — the typed amount and coin must survive EVERY re-draw of the panel. Each trigger is the page's own:
//   wallet change (accountsChanged → refresh), a second connect, a failed read and the page's own retry (every RPC
//   refused for a moment through ethers' one HTTP hook), and after a purchase ("Buy more").
const POL_HELP = "You need a small amount of POL for network fees. Bridging to Polygon? Polygon Portal, Jumper and Relay can add a little POL to your bridge — look for the gas or Refuel option. Withdrawing from an exchange? Add a little POL on the Polygon network.";
async function typingSurvives(c, p) {
  const w = p.w, eth = p.eth, out = {};
  const amt = () => (w.document.getElementById("buy-amt") || {}).value;
  const usdcOn = () => { const e = w.document.querySelector(".buy-coin-chip[data-coin='usdc']"); return !!e && e.getAttribute("aria-pressed") === "true"; };
  const calc = () => H.until(() => !!w.document.getElementById("buy-go"), 20000, "the calculator");
  await connected(w);
  H.click(w, ".buy-coin-chip[data-coin='usdc']"); await H.sleep(150);
  const inp = w.document.getElementById("buy-amt");
  inp.focus(); inp.value = "250"; inp.setSelectionRange(3, 3); inp.dispatchEvent(new w.Event("input"));
  // a wallet change and back
  const other = ethers.Wallet.createRandom().connect(c.provider);
  eth.__switchTo(other); await H.sleep(600); eth.__switchTo(c.player); await H.sleep(300); await calc();
  out.walletChange = amt() === "250" && usdcOn();
  // a second connect (the panel re-draws while the buyer is typing): the focus and the caret come back too
  const i2 = w.document.getElementById("buy-amt"); i2.focus(); i2.setSelectionRange(2, 2);
  await w.DYWallet.connect(); await H.sleep(600); await calc();
  const a = w.document.activeElement;
  out.connect = amt() === "250" && usdcOn() && a && a.id === "buy-amt" && a.selectionStart === 2;
  // a failed read: every RPC refused → the page's own "We couldn't load this right now — try again" → its retry recovers the calculator
  const realGet = ethers.FetchRequest.createGetUrlFunc();
  ethers.FetchRequest.registerGetUrl(async () => { throw new Error("connect ECONNREFUSED (proof: the line is down)"); });
  eth.__switchTo(c.player);
  let sawTrouble = false;
  try { await H.until(() => /We couldn't load this right now — try again/.test(body(w)), 15000, "the network message"); sawTrouble = true; } catch (e) {}
  ethers.FetchRequest.registerGetUrl(realGet);
  await H.until(() => !!w.document.getElementById("buy-go"), 30000, "the retry").catch(() => {});
  out.failedRead = sawTrouble && amt() === "250" && usdcOn();
  // after a purchase: "Buy more" brings the calculator back with the same amount and coin
  H.click(w, "#buy-go");
  await H.until(() => !!w.document.getElementById("buy-again"), 40000, "the after-purchase panel").catch(() => {});
  if (w.document.getElementById("buy-again")) { H.click(w, "#buy-again"); await calc(); }
  out.afterBuy = amt() === "250" && usdcOn();
  return out;
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
  ok("BP11 · the GAS-HELP-1 step runs in the slot: buyFlow starts its chain at beforeApprove(…), ahead of the approve, and the buy no longer hard-stops on POL",
     /function beforeApprove\(ctx\)/.test(src) && flow.indexOf("var chain = beforeApprove({") >= 0 && flow.indexOf("var chain = beforeApprove({") < flow.indexOf("tok.approve(") && flow.indexOf("polGuard()") < 0);
  ok("BP12 · the old registration road is gone from the page code (no form link, no approval poll, no combined buy-and-stake)",
     !/forms\.gle|renderRegister|startBuyApprovalPoll|Activate Staking|buy-noact/.test(src));

  // ═══ BP13 — the typing fix (GAS-HELP-1 R0) ═══
  {
    const c = await H.chainPresale();
    const p = await page(c, {});
    const r = await typingSurvives(c, p);
    ok("BP13a · a wallet change (and back) keeps the typed amount (250) and the coin (USDC)", r.walletChange, JSON.stringify(r));
    ok("BP13b · a second connect re-draws the panel and keeps the amount, the coin, the focus and the caret", r.connect, JSON.stringify(r));
    ok("BP13c · a failed read shows the page's network message, and its retry brings the calculator back with the amount and the coin", r.failedRead, JSON.stringify(r));
    ok("BP13d · after a purchase, 'Buy more' brings the calculator back with the same amount and coin", r.afterBuy, JSON.stringify(r));
    done(p.w);
  }

  // ═══ BP14 — the POL line names where POL comes from (GAS-HELP-1 R0) ═══
  {
    const c = await H.chainPresale();
    const p = await page(c, {});
    await c.provider.send("anvil_setBalance", [c.player.address, "0x" + (10n ** 15n).toString(16)]);   // 0.001 POL: below the 0.02 line
    await connected(p.w);
    await H.until(() => p.w.document.getElementById("pol-banner").classList.contains("show"), 15000, "the fee banner").catch(() => {});
    const banner = (p.w.document.getElementById("pol-banner").textContent || "").replace(/\s+/g, " ");
    ok("BP14a · a wallet short of POL sees the fee banner naming the bridges (Polygon Portal, Jumper, Relay) and the exchange's Polygon network",
       p.w.document.getElementById("pol-banner").classList.contains("show") && banner.indexOf("Polygon Portal, Jumper and Relay can add a little POL to your bridge") >= 0 &&
       banner.indexOf("Withdrawing from an exchange? Add a little POL on the Polygon network.") >= 0, banner);
    await buy(p.w, "100");
    await H.until(() => p.w.document.getElementById("ov-fail").classList.contains("show"), 10000, "the POL refusal").catch(() => {});
    ok("BP14b · Buy with too little POL and no top-up service: the wallet is still asked (GAS-HELP-1 R3), and its failure says the POL line word for word",
       txt(p.w, "#ov-fail-msg") === POL_HELP && sends(p.eth) >= 1 && (await c.vault.grantedTo(c.player.address)) === 0n, txt(p.w, "#ov-fail-msg"));
    done(p.w);
    await c.provider.send("anvil_setBalance", [c.player.address, "0x" + (10000n * DEC).toString(16)]);   // the shared test account, restored
  }

  // ═══ BP15–BP20 — GAS-HELP-1 R3: POL for the network fee, before the approve (stub bot) ═══
  // every text the page shows (the pending overlay, the toasts) is recorded, so a line that came and went is still seen
  function lines(w) { const got = new Set(); new w.MutationObserver(() => { got.add((w.document.body.textContent || "").replace(/\s+/g, " ")); })
    .observe(w.document.body, { childList: true, subtree: true, characterData: true }); return { has: (t) => [...got].some((x) => x.indexOf(t) >= 0) }; }
  async function gasCase(mode, opts) {
    opts = opts || {};
    const c = await H.chainPresale();
    await c.provider.send("anvil_setBalance", [c.player.address, "0x" + (opts.pol != null ? opts.pol : 10n ** 15n).toString(16)]);   // 0.001 POL: short
    const p = await page(c, Object.assign({ gas: mode }, opts.page || {}));
    const L = lines(p.w);
    await connected(p.w);
    await buy(p.w, "100");
    const landed = await H.until(async () => (await c.vault.grantedTo(c.player.address)) > 0n, opts.waitMs || 30000, "the purchase").then(() => true, () => false);
    await H.until(() => p.w.document.getElementById("ov-fail").classList.contains("show") || !!p.w.document.getElementById("buy-done"), 8000, "the end").catch(() => {});
    const r = { p, L, landed, sends: sends(p.eth), fail: txt(p.w, "#ov-fail-msg"), asked: p.seen.gas };
    done(p.w);
    await c.provider.send("anvil_setBalance", [c.player.address, "0x" + (10000n * DEC).toString(16)]);   // the shared test account, restored
    return r;
  }
  {
    const r = await gasCase("ok");
    ok("BP15 · short of POL: the waiting line, the bot asked ONCE with the presale, the coin and the amount; the received line; then approve + buy (2 prompts) — the purchase lands",
       r.L.has(G_WAIT) && r.L.has(G_OK) && r.asked.length === 1 && r.asked[0].product === "presale" && r.asked[0].coin === "usdt" && r.asked[0].amount === "100000000" && r.landed && r.sends === 2,
       JSON.stringify({ asked: r.asked, landed: r.landed, sends: r.sends, fail: r.fail }));
  }
  {
    const r = await gasCase("refuse", { waitMs: 10000 });
    ok("BP16 · the bot refuses: the fallback line, and the wallet is STILL asked (never hard-blocked); its failure says the POL line",
       r.L.has(G_FALL) && r.sends >= 1 && !r.landed && r.fail === POL_HELP, JSON.stringify({ sends: r.sends, fail: r.fail }));
  }
  {
    const r = await gasCase("down", { waitMs: 10000 });
    ok("BP17 · the bot is unreachable: the fallback line, and the wallet is still asked", r.L.has(G_FALL) && r.sends >= 1 && !r.landed, JSON.stringify({ sends: r.sends, fail: r.fail }));
  }
  {
    const r = await gasCase("slow");
    ok("BP18 · the POL arrives slowly (3 s): the road WAITS for it, then approves and buys — no early approve", r.L.has(G_WAIT) && r.L.has(G_OK) && r.landed && r.sends === 2,
       JSON.stringify({ landed: r.landed, sends: r.sends, fail: r.fail }));
  }
  {
    const r = await gasCase("never", { page: { ls: { "dy::gasWaitMs": "2500" } }, waitMs: 10000 });
    ok("BP19 · the POL never arrives: after the wait, the fallback line and the wallet is asked anyway", r.L.has(G_FALL) && r.sends >= 1 && !r.landed, JSON.stringify({ sends: r.sends, fail: r.fail }));
  }
  {
    const r = await gasCase("ok", { pol: 10n * DEC });
    ok("BP20 · a wallet with enough POL never asks the bot, and buys as before", r.asked.length === 0 && r.landed && r.sends === 2 && !r.L.has(G_WAIT), JSON.stringify({ asked: r.asked, sends: r.sends }));
  }

  // ═══ BP21–BP22 — STORE-LOAD-1: a failed buy is explained from the chain, never in raw library words ═══
  const JUST = "A purchase from this wallet has just gone through — check your balances above before buying again.";
  const NOT_TAKEN = "Your purchase didn't go through, and nothing was taken from your wallet. Please try again.";
  const RAW = /could not coalesce|missing revert data|transaction already imported|CALL_EXCEPTION|execution reverted/i;
  async function twoTabs(opts) {
    const c = await H.chainPresale();
    const a = await page(c, opts || {}), b = await page(c, opts || {});
    await connected(a.w); await connected(b.w);
    for (const t of [a, b]) { t.w.document.getElementById("buy-amt").value = "100"; t.w.document.getElementById("buy-amt").dispatchEvent(new t.w.Event("input")); }
    H.click(a.w, "#buy-go"); H.click(b.w, "#buy-go");
    await H.until(() => [a, b].every((t) => t.w.document.getElementById("buy-done") || t.w.document.getElementById("ov-fail").classList.contains("show")), 60000, "both tabs settle").catch(() => {});
    await H.sleep(1500);   // the after-failure re-read
    const said = [a, b].map((t) => t.w.document.getElementById("buy-done") ? "bought" : txt(t.w, "#ov-fail-msg"));
    const granted = await c.vault.grantedTo(c.player.address);
    done(a.w, b.w);
    return { said, granted };
  }
  {
    const r = await twoTabs();
    ok("BP21 · one wallet, two tabs, both Buy 100 at once: ONE purchase; the other tab says '" + JUST + "' (never a raw library text)",
       r.granted === dycOut(100n * DEC6) - dycOut(100n * DEC6) * 15n / 100n && r.said.filter((x) => x === "bought").length === 1 && r.said.some((x) => x === JUST) && !r.said.some((x) => RAW.test(x)), JSON.stringify(r.said));
  }
  {
    const c = await H.chainPresale();
    const p = await page(c, {});
    await connected(p.w);
    // the wallet answers the buy with an error no page can parse (the shape the two-tab race produced on the fork bench)
    const orig = p.eth.request.bind(p.eth);
    p.eth.request = async (a) => { if (a.method === "eth_sendTransaction" && String(a.params[0].to).toLowerCase() === c.addrs.sale.toLowerCase()) { p.eth.__calls.push(a.method); throw Object.assign(new Error("could not coalesce error"), { code: -32603 }); } return orig(a); };
    const before = await c.usdt.balanceOf(c.player.address);
    await buy(p.w, "100");
    await H.until(() => p.w.document.getElementById("ov-fail").classList.contains("show") && txt(p.w, "#ov-fail-msg"), 30000, "the failure").catch(() => {});
    await H.sleep(1500);
    ok("BP22 · a buy that fails with a raw library error ('could not coalesce error'): the plain line '" + NOT_TAKEN + "' — the coin really was not taken",
       txt(p.w, "#ov-fail-msg") === NOT_TAKEN && (await c.usdt.balanceOf(c.player.address)) === before, txt(p.w, "#ov-fail-msg"));
    p.eth.request = orig;
    done(p.w);
  }

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

  {
    const c = await H.chainPresale();
    const p = await page(c, { dashSrc: mutate("    if (buyState.amt) inp.value = buyState.amt;\n", "") });
    const r = await typingSurvives(c, p);
    ok("M5 · breakage 'the re-draw clears the amount' (the old behaviour) is caught (BP13 goes red)", !r.walletChange && !r.connect, JSON.stringify(r));
    done(p.w);
  }

  {
    // M6 · hard-block on a refusal (the thing the owner ruled out): the wallet would never be asked
    const r = await gasCase("refuse", { waitMs: 10000, page: { dashSrc: mutate("        else if (r.state === \"fallback\") toast(W.GAS_COPY.fallback);", "        else if (r.state === \"fallback\") { toast(W.GAS_COPY.fallback); pending(false); throw \"stop\"; }") } });
    ok("M6 · breakage 'hard-block when the bot refuses' is caught (BP16 goes red: the wallet is never asked)", r.sends === 0, JSON.stringify({ sends: r.sends }));
  }
  {
    // M7 · do not wait for the POL to land: the approve is sent before it arrives and fails
    const wsrc = fs.readFileSync(path.join(SITE, "js", "wallet.js"), "utf8");
    const anchor = "          var sent = BigInt(j.amountWei), deadline = Date.now() + gasWaitMs();";
    if (wsrc.indexOf(anchor) < 0) throw new Error("breakage anchor gone: M7");
    const r = await gasCase("slow", { waitMs: 10000, page: { walletSrc: wsrc.split(anchor).join("          return { state: \"ok\" };\n" + anchor) } });
    ok("M7 · breakage 'do not wait for the POL to arrive' is caught (BP18 goes red: the purchase does not land)", !r.landed, JSON.stringify({ landed: r.landed, sends: r.sends, fail: r.fail }));
  }

  {
    const r = await twoTabs({ dashSrc: mutate("      if (r[0] != null && r[0] > snap.granted) { failBox(BUY_COPY.justBought); return; }\n", "") });
    ok("M8 · breakage 'no chain check after a failed buy' is caught (BP21 goes red: the losing tab does not say a purchase just went through)", !r.said.some((x) => x === JUST), JSON.stringify(r.said));
  }
  {
    const c = await H.chainPresale();
    const p = await page(c, { dashSrc: mutate("    if (ctx === \"buy\") return null;   // STORE-LOAD-1: the buy road never shows a raw library text — buyFailed() asks the chain instead\n", "") });
    await connected(p.w);
    const orig = p.eth.request.bind(p.eth);
    p.eth.request = async (a) => { if (a.method === "eth_sendTransaction" && String(a.params[0].to).toLowerCase() === c.addrs.sale.toLowerCase()) { p.eth.__calls.push(a.method); throw Object.assign(new Error("could not coalesce error"), { code: -32603 }); } return orig(a); };
    await buy(p.w, "100");
    await H.until(() => p.w.document.getElementById("ov-fail").classList.contains("show") && txt(p.w, "#ov-fail-msg"), 30000, "the failure").catch(() => {});
    await H.sleep(1500);
    ok("M9 · breakage 'the raw-text fallback' is caught (BP22 goes red: the buyer would read raw library words)", RAW.test(txt(p.w, "#ov-fail-msg")) || txt(p.w, "#ov-fail-msg") !== NOT_TAKEN, txt(p.w, "#ov-fail-msg"));
    p.eth.request = orig;
    done(p.w);
  }

  console.log("──\n" + (fail === 0 ? "ALL GREEN — " + pass + "/" + (pass + fail) : "FAILURES — " + fail + " of " + (pass + fail)));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("buypanel suite crashed:", e); process.exit(1); });
