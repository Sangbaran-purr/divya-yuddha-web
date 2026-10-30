"use strict";
// WINNINGS-INSTANT-1 (owner rulings 2026-10-30) — the dashboard's withdraw card under the cap and the holds.
// The desk is the REAL WinningsDesk bytecode on anvil (H.chainWinnings); only the approval bot's routes are stubbed, and
// its coupons are signed by the bot's OWN signer module, as tests/suites/winnings.js does. Every sentence checked here is
// one the owner approved word for word (D8); the cap is the bot's (/winnings/policy), never a number in the page.
const fs = require("fs");
const path = require("path");
const H = require("../lib");

const SITE = path.resolve(__dirname, "..", "..");
const DEC = 1000000000000000000n, USD = 125n * DEC;
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const txt = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent : ""; };
const card = (w) => txt(w, "#winnings-body");
const S = {
  CAP: (n) => "Up to USD " + n + " of winnings per withdrawal.",
  LOW: "The cash-out desk is being refilled. Your winnings are safe; try again later.",
  RES: "The cash-out desk's reserve can't cover this right now. Your winnings are safe; check back later.",
};

const { makeCouponSigner } = require(path.join(H.W3, "services", "approval-bot", "src", "winnings", "coupon.js"));
async function couponFor(c, wallet, cumulative) {
  const signer = makeCouponSigner({ privateKey: c.signer.privateKey, chainId: Number((await c.provider.getNetwork()).chainId), deskAddress: c.addrs.desk });
  const s = await signer.sign(wallet, cumulative, 0n);
  return { coupon: s.coupon, signature: s.signature, cumulativeWinningsWei: s.coupon.cumulativeWinningsWei, cumulativeInviteWei: s.coupon.cumulativeInviteWei, deadline: s.coupon.deadline };
}
const view = (o) => Object.assign({ capUsd: 100, unpaidWei: "0", nowWei: "0", aboveCapWei: "0", heldWei: "0", nextAllowanceAt: 0 }, o);
// the bot's routes: the public cap, a challenge, and a coupon (or a refusal) that carries the wallet's cap/held view
function stub(c, wallet, o) {
  const seen = { policy: 0, coupon: 0 };
  return { seen, svc: {
    "/winnings/policy": () => { seen.policy++; return o.policyFails ? { __throw: true } : { capUsd: o.cap == null ? 100 : o.cap }; },
    "/winnings/challenge": () => ({ nonce: "n-1", message: "Divya Yuddha — winnings withdrawal\nnonce: n-1" }),
    "/winnings/coupon": async () => {
      seen.coupon++;
      if (o.refuse) return { refused: o.refuse, sentence: "the bot's own words", winnings: o.view };
      return Object.assign(await couponFor(c, wallet, o.cum), { winnings: o.view });
    },
  } };
}
async function open(o, dashSrc, chainOpts) {
  const c = await H.chainWinnings(chainOpts || {});
  const s = stub(c, c.player.address, o);
  const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.desk, service: "https://bot.test" }, svc: s.svc, dashSrc: dashSrc });
  await h.w.DYWallet.connect(); await H.sleep(500);
  return { c, h, w: h.w, s };
}
async function ask(w) { w.document.querySelector("#win-coupon").click(); await H.sleep(900); }

async function run() {
  console.log("\n── WINNINGS-INSTANT-1 · the capped, instant withdraw card ──");
  await H.preflight();
  const DASH = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8");

  // WI1/WI2 — the cap line comes from the bot
  {
    const a = await open({ cap: 100, cum: 100n * USD, view: view({}) });
    ok("WI1 · the cap line reads the bot's setting: \"" + S.CAP(100) + "\"", card(a.w).indexOf(S.CAP(100)) >= 0 && a.s.seen.policy >= 1, card(a.w).slice(0, 300));
    H.teardown(a.h);
    const b = await open({ cap: 150, cum: 100n * USD, view: view({ capUsd: 150 }) });
    ok("WI2 · raised to 150 on the bot, the page says 150 — nothing to change on the site", card(b.w).indexOf(S.CAP(150)) >= 0 && card(b.w).indexOf(S.CAP(100)) < 0, card(b.w).slice(0, 300));
    H.teardown(b.h);
    const d = await open({ policyFails: true, cum: 100n * USD, view: view({}) });
    ok("WI3 · the bot's cap unreadable: no cap line at all (never a guessed number), and the card still works", !/Up to USD/.test(card(d.w)) && !!d.w.document.querySelector("#win-coupon"));
    H.teardown(d.h);
  }

  // WI4/WI5 — over the cap: W-OVER, then a real withdrawal of exactly the capped amount on the real desk
  {
    const a = await open({ cum: 100n * USD, view: view({ unpaidWei: String(250n * USD), nowWei: String(100n * USD), aboveCapWei: String(150n * USD) }) });
    await ask(a.w);
    const t = card(a.w);
    ok("WI4 · OVER THE CAP: \"You've won 31,250.00 DYC. You can withdraw up to USD 100 now; the rest becomes available with your next withdrawal, 24 hours after this one.\"",
       t.indexOf("You've won 31,250.00 DYC. You can withdraw up to USD 100 now; the rest becomes available with your next withdrawal, 24 hours after this one.") >= 0 && /12,500\.00/.test(t), t.slice(0, 500));
    a.w.document.querySelector("#win-redeem").click(); await H.sleep(600);
    a.w.document.querySelector("#ov-confirm-go").click();
    await H.until(async () => (await a.c.desk.redeemed(a.c.player.address)) > 0n, 25000, "the redemption to land");
    ok("WI5 · and the withdrawal pays exactly the capped USD 100 on the real desk", (await a.c.usdt.balanceOf(a.c.player.address)) === 100000000n, String(await a.c.usdt.balanceOf(a.c.player.address)));
    ok("WI5b · after it lands, the over-the-cap line is gone (its view is spent with the approval)", !a.w.document.querySelector("#win-over"));
    H.teardown(a.h);
  }

  // WI6 — held for review: W-H on a refusal
  {
    const a = await open({ refuse: "NOTHING_TO_WITHDRAW", view: view({ heldWei: String(8100n * DEC) }) });
    await ask(a.w);
    const t = card(a.w);
    ok("WI6 · HELD: \"8,100.00 DYC of your winnings is under a routine check before it can be withdrawn. Nothing is lost: it stays yours and is released after the check.\"",
       t.indexOf("8,100.00 DYC of your winnings is under a routine check before it can be withdrawn. Nothing is lost: it stays yours and is released after the check.") >= 0, t.slice(0, 500));
    ok("WI6b · and no approval is held, so step 2 stays shut", a.w.document.querySelector("#win-redeem").disabled === true);
    H.teardown(a.h);
  }

  // WI7 — DESK_LOW: the approved sentence, nothing signed
  {
    const a = await open({ refuse: "DESK_LOW", view: view({ unpaidWei: String(100n * USD), nowWei: String(100n * USD) }) });
    await ask(a.w);
    ok("WI7 · DESK SHORT: the page says \"" + S.LOW + "\" (the site's ruled sentence, not the bot's words) and step 2 stays shut",
       txt(a.w, "#ov-fail-msg").indexOf(S.LOW) >= 0 || a.w.document.body.textContent.indexOf(S.LOW) >= 0, txt(a.w, "#ov-fail-msg"));
    ok("WI7b · step 2 stays shut", a.w.document.querySelector("#win-redeem").disabled === true);
    H.teardown(a.h);
  }

  // WI8 — the desk's own refusal, decoded in the winnings context, is the corrected line
  {
    const a = await open({ cum: 100n * USD, view: view({ unpaidWei: String(100n * USD), nowWei: String(100n * USD) }) }, null, { reserve: 30n * 1000000n });
    await ask(a.w);
    a.w.document.querySelector("#win-redeem").click(); await H.sleep(600);
    const go = a.w.document.querySelector("#ov-confirm-go"); if (go) go.click();
    await H.sleep(2500);
    const body = a.w.document.body.textContent;
    ok("WI8 · THE DESK SHORT ON CHAIN (reserve 30, approval 100): \"" + S.RES + "\" — and no \"smaller amount\" on a card without one",
       body.indexOf(S.RES) >= 0 && body.indexOf("Try a smaller amount") < 0 && (await a.c.desk.redeemed(a.c.player.address)) === 0n, body.slice(body.indexOf("cash-out") - 40, body.indexOf("cash-out") + 160));
    H.teardown(a.h);
  }

  // M — breakages applied to the page's own source, each caught
  async function mutant(name, from, to, check) {
    if (DASH.split(from).length !== 2) { ok("M " + name + " — the target text was not found exactly once", false); return; }
    let caught; try { caught = await check(DASH.replace(from, to)); } catch (e) { caught = true; }
    ok("M " + name + " — caught", caught);
  }
  await mutant("1 · the cap written into the page (the bot's 150 ignored)", "esc(W_CAP(capText(winPolicy.capUsd)))", "esc(W_CAP(\"100\"))",
    async (src) => { const b = await open({ cap: 150, cum: 100n * USD, view: view({ capUsd: 150 }) }, src); const bad = card(b.w).indexOf(S.CAP(150)) < 0; H.teardown(b.h); return bad; });
  await mutant("2 · the view dropped from refusals (a held player is told nothing about the hold)", "winView = res && res.winnings ? res.winnings : null;", "winView = null;",
    async (src) => { const b = await open({ refuse: "NOTHING_TO_WITHDRAW", view: view({ heldWei: String(8100n * DEC) }) }, src); await ask(b.w);
      const bad = card(b.w).indexOf("under a routine check") < 0; H.teardown(b.h); return bad; });
  await mutant("3 · DESK_LOW unknown to the page (the bot's own words shown instead of the ruled sentence)",
    "DESK_LOW: \"The cash-out desk is being refilled. Your winnings are safe; try again later.\",", "",
    async (src) => { const b = await open({ refuse: "DESK_LOW", view: view({}) }, src); await ask(b.w);
      const bad = b.w.document.body.textContent.indexOf(S.LOW) < 0; H.teardown(b.h); return bad; });

  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("winst suite crashed:", e); process.exit(1); });
