"use strict";
// WINNINGS-4 — the dashboard's fifth card: dormant by default, and honest when it is not.
// The desk under test is the REAL WinningsDesk bytecode on anvil; only the approval-bot's HTTP routes are stubbed.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = path.resolve(__dirname, "..", "..");
const DEC = 1000000000000000000n, DEC6 = 1000000n;
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const txt = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent : ""; };
const cardText = (w) => txt(w, "#winnings-body");
async function settle(w, ms) { await H.sleep(ms == null ? 400 : ms); }

// the coupon the stubbed service returns, signed by the desk's REAL winningsSigner key
async function couponFor(c, wallet, cumulative, ttl) {
  const deadline = Math.floor(Date.now() / 1000) + (ttl == null ? 4 * 3600 : ttl);
  const domain = { name: "WinningsDesk", version: "1", chainId: Number((await c.provider.getNetwork()).chainId), verifyingContract: c.addrs.desk };
  const types = { WinningsCoupon: [{ name: "wallet", type: "address" }, { name: "cumulativeWinningsWei", type: "uint256" }, { name: "deadline", type: "uint256" }] };
  const coupon = { wallet: ethers.getAddress(wallet), cumulativeWinningsWei: cumulative.toString(), deadline };
  return { coupon, signature: await c.signer.signTypedData(domain, types, coupon), cumulativeWinningsWei: cumulative.toString() };
}
// a service stub: the two routes, and a record of what the page actually sent
function svcStub(c, wallet, cumulative, opts) {
  opts = opts || {};
  const seen = { challenge: 0, coupon: 0, bodies: [] };
  const stub = {
    "/winnings/challenge": () => { seen.challenge++; return { nonce: "n-" + seen.challenge, message: "Divya Yuddha — winnings withdrawal\nnonce: n-" + seen.challenge }; },
    "/winnings/coupon": (init) => {
      seen.coupon++;
      seen.bodies.push(JSON.parse((init && init.body) || "{}"));
      if (opts.refuse) return { refused: opts.refuse, sentence: opts.sentence };
      return couponFor(c, wallet, cumulative, opts.ttl);
    },
  };
  return { stub, seen };
}
async function connect(w) { await w.DYWallet.connect(); await settle(w); }

async function run() {
  console.log("\n── WINNINGS-4 · the fifth card ──");
  await H.preflight();

  // ════════ THE DORMANT FACE — what the site actually ships ════════
  {
    const c = await H.chainWinnings();
    const h = await H.dashboardPage(c, c.player, {});          // no winnings config at all
    const w = h.w;
    // BEFORE CONNECTING: the dormant face is static copy and a visitor with no wallet must still see it. A browser
    // run found this empty, because refresh() returns early when disconnected and the paint sat after the return.
    ok("D0 · the dormant face renders for a visitor who has not connected", /not yet open/i.test(cardText(w)), cardText(w).slice(0, 120));
    await connect(w);
    const t = cardText(w);
    ok("D1 · the card is present and names itself", !!w.document.querySelector("#winnings-panel") && /WINNINGS/i.test(txt(w, "#winnings-panel")));
    ok("D2 · it says withdrawals are not yet open", /not yet open/i.test(t), t.slice(0, 120));
    ok("D3 · the rate, floor and cadence are stated even while dormant",
       /0\.008 USDT per DYC/.test(t) && /Minimum withdrawal 125 DYC/.test(t) && /every 24 hours/.test(t));
    ok("D4 · and it says winnings are a TAG on liquid DYC, not a fifth balance",
       /a tag on the DYC you already hold/.test(t) && /not a separate balance/.test(t));
    ok("D5 · THE CARD IS NOT A BALANCE CARD (it must not wear .bcard)",
       !w.document.querySelector("#winnings-panel.bcard") && !w.document.querySelector("#winnings-panel .bcard"));
    // THE MUTANT THIS CATCHES: a contract call firing while dormant.
    ok("D6 · DORMANT MEANS SILENT — no request to the service was made",
       w.__fetches.filter((u) => /winnings/.test(u)).length === 0, JSON.stringify(w.__fetches));
    ok("D7 · and no withdraw button is offered at all",
       !w.document.querySelector("#win-coupon") && !w.document.querySelector("#win-redeem"));
    ok("D8 · the four balances are untouched by the new card",
       !!w.document.querySelector("#card-liquid") && !!w.document.querySelector("#card-vesting")
       && !!w.document.querySelector("#card-staked") && !!w.document.querySelector("#card-rewards"));
    H.teardown(h);
  }

  // ════════ THE LIVE FACE ════════
  {
    const c = await H.chainWinnings();
    const s = svcStub(c, c.player.address, 900n * DEC);
    const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.desk, service: "https://bot.test" }, svc: s.stub });
    const w = h.w;
    await connect(w);
    ok("L1 · live, the card offers step 1 and keeps step 2 shut", !!w.document.querySelector("#win-coupon") && w.document.querySelector("#win-redeem").disabled === true);
    ok("L2 · nothing is asked of the service until the player asks", s.seen.challenge === 0 && s.seen.coupon === 0);

    // THE ORDER IS THE SAFETY: step 2 has no handler until a coupon exists.
    // THE ORDER HAS TWO GUARDS AND BOTH ARE PROVEN. (a) the handler is only attached when a coupon is held;
    // (b) the function itself returns early without one. Testing only (a) lets a mutant that removes it survive,
    // because (b) silently covers for it - which is exactly what happened to an earlier version of this check.
    const before = await c.desk.redeemed(c.player.address);
    const btn = w.document.querySelector("#win-redeem");
    ok("L3a · step 2 is disabled before an approval exists", btn.disabled === true);
    btn.removeAttribute("disabled");        // force it open: the in-function guard must still refuse
    btn.click();
    await settle(w);
    ok("L3b · CEREMONY ORDER — even a force-enabled withdraw does nothing on chain without an approval",
       (await c.desk.redeemed(c.player.address)) === before);
    const dashSrc = fs.readFileSync(path.join(SITE, "js/dashboard.js"), "utf8");
    ok("L3c · and the handler is only wired when a coupon is actually held",
       /if \(\$\("win-redeem"\) && winCoupon\)/.test(dashSrc));
    // The SECOND guard is defence-in-depth and its behaviour is unobservable from the page, precisely because the
    // first guard shields it: with no handler attached, a click never reaches the function. So it is pinned in
    // source rather than claimed to be exercised - stated plainly instead of dressed up as a behavioural check.
    ok("L3d · the redeem function ALSO refuses on its own, without a coupon (pinned, not exercised)",
       /function actWinningsRedeem\(\) \{\s*\n\s*if \(!winCoupon\) return;/.test(dashSrc));

    w.document.querySelector("#win-coupon").click();
    await settle(w, 900);
    ok("L4 · step 1 asked for a challenge and posted a signature", s.seen.challenge === 1 && s.seen.coupon === 1);
    ok("L5 · THE REQUEST CARRIES NO WALLET FIELD — the service recovers it",
       s.seen.bodies.length === 1 && s.seen.bodies[0].wallet === undefined && !!s.seen.bodies[0].signature,
       JSON.stringify(s.seen.bodies[0]));
    const sigOk = ethers.verifyMessage("Divya Yuddha — winnings withdrawal\nnonce: n-1", s.seen.bodies[0].signature);
    ok("L6 · and the signature recovers to the CONNECTED wallet", sigOk.toLowerCase() === c.player.address.toLowerCase(), sigOk);

    const t2 = cardText(w);
    ok("L7 · the withdrawable figure and its USDT value are shown", /900\.00/.test(t2) && /7\.200000/.test(t2), t2.slice(0, 200));
    ok("L8 · step 2 is now open", w.document.querySelector("#win-redeem").disabled === false);

    // the whole ceremony, to a confirmed redeem on the real desk
    w.document.querySelector("#win-redeem").click();
    await settle(w, 600);
    const go = w.document.querySelector("#ov-confirm-go");
    ok("L9 · the confirm states DYC out, USDT in, and the treasury",
       /Withdraw/.test(txt(w, "#ov-confirm-body")) && /900\.00/.test(txt(w, "#ov-confirm-body"))
       && /7\.200000/.test(txt(w, "#ov-confirm-body")) && /returns to the treasury/.test(txt(w, "#ov-confirm-body")),
       txt(w, "#ov-confirm-body"));
    go.click();
    await H.until(async () => (await c.desk.redeemed(c.player.address)) > 0n, 25000, "the redemption to land");
    ok("L10 · THE WITHDRAWAL LANDED on the real desk", (await c.desk.redeemed(c.player.address)) === 900n * DEC);
    ok("L11 · the USDT reached the wallet at exactly 0.008", (await c.usdt.balanceOf(c.player.address)) === 7200000n);
    ok("L12 · and the DYC reached the TREASURY, not the desk",
       (await c.dyc.balanceOf(c.addrs.treasury)) === 900n * DEC && (await c.dyc.balanceOf(c.addrs.desk)) === 0n);
    H.teardown(h);
  }

  // ════════ THE BUSY SENTINEL — a number is never invented ════════
  {
    const c = await H.chainWinnings();
    const s = svcStub(c, c.player.address, 900n * DEC);
    const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.owner, service: "https://bot.test" }, svc: s.stub }); // an EOA: every read fails
    const w = h.w;
    await connect(w);
    const t = cardText(w);
    // read the AMOUNT SLOT, not the whole card: an earlier version grepped the card text for /\b0\.00\b/, and the
    // trailing \b cannot match "0.00DYC" because the number abuts the unit. The mutant walked straight through it.
    const amt = txt(w, ".win-amt"), usd = txt(w, ".win-usdt");
    ok("B1 · an unreadable desk renders the SENTINEL in the amount slot, never a zero",
       amt.indexOf("—") >= 0 && amt.indexOf("0.00") < 0 && usd.indexOf("—") >= 0, JSON.stringify(amt + " | " + usd));
    ok("B1b · and it says why", /busy or unreachable/i.test(t), t.slice(0, 160));
    H.teardown(h);
  }

  // ════════ THE SENTENCES ════════
  {
    // (a) the service's refusals, each rendered as its own sentence
    const cases = [
      ["DERIVER_SHORT_READ", "We can't confirm your winnings right now"],
      ["ISSUANCE_PAUSED", "Withdrawals are paused for a moment."],
      ["GEO_DENIED", "Withdrawals aren't available from your location."],
      ["KYC_REQUIRED", "Withdrawals need identity verification first."],
      ["NOTHING_TO_WITHDRAW", "You have no winnings to withdraw yet."],
    ];
    for (const [reason, sentence] of cases) {
      const c = await H.chainWinnings();
      const s = svcStub(c, c.player.address, 900n * DEC, { refuse: reason, sentence: sentence });
      const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.desk, service: "https://bot.test" }, svc: s.stub });
      const w = h.w;
      await connect(w);
      w.document.querySelector("#win-coupon").click();
      await settle(w, 800);
      ok("S · " + reason + " reaches the player as its ruled sentence", txt(w, "#ov-fail-msg").indexOf(sentence) >= 0, txt(w, "#ov-fail-msg"));
      H.teardown(h);
    }
  }
  {
    // (b) the desk's own reverts — driven for real, not simulated
    const c = await H.chainWinnings({ reserve: 1n });                 // a reserve that cannot cover USD 1
    const s = svcStub(c, c.player.address, 900n * DEC);
    const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.desk, service: "https://bot.test" }, svc: s.stub });
    const w = h.w;
    await connect(w);
    w.document.querySelector("#win-coupon").click();
    await settle(w, 900);
    w.document.querySelector("#win-redeem").click();
    await settle(w, 600);
    if (w.document.querySelector("#ov-confirm-go")) { w.document.querySelector("#ov-confirm-go").click(); await settle(w, 1500); }
    ok("S · ReserveInsufficient reaches the player as the desk's sentence",
       /reserve can't cover this right now/.test(txt(w, "#ov-fail-msg")), txt(w, "#ov-fail-msg"));
    H.teardown(h);
  }
  {
    // (c) an EXPIRED approval — the trap this whole context exists for
    const c = await H.chainWinnings();
    const s = svcStub(c, c.player.address, 900n * DEC, { ttl: -60 }); // already dead
    const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.desk, service: "https://bot.test" }, svc: s.stub });
    const w = h.w;
    await connect(w);
    w.document.querySelector("#win-coupon").click();
    await settle(w, 900);
    w.document.querySelector("#win-redeem").click();
    await settle(w, 600);
    if (w.document.querySelector("#ov-confirm-go")) { w.document.querySelector("#ov-confirm-go").click(); await settle(w, 1500); }
    const msg = txt(w, "#ov-fail-msg");
    ok("S · AN EXPIRED APPROVAL SAYS 4 HOURS", /Approvals last 4 hours/.test(msg), msg);
    ok("S · AND NEVER THE DROPDESK'S 90 DAYS — the shared-selector trap", !/90 days/.test(msg), msg);
    H.teardown(h);
  }
  {
    // (d) a paused desk
    const c = await H.chainWinnings({ paused: true });
    const s = svcStub(c, c.player.address, 900n * DEC);
    const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.desk, service: "https://bot.test" }, svc: s.stub });
    const w = h.w;
    await connect(w);
    ok("S · a paused desk says so on the card, before anything is asked of it",
       /paused for a moment/.test(cardText(w)), cardText(w).slice(0, 200));
    H.teardown(h);
  }

  // ════════ THE SOURCE LAWS ════════
  {
    const dash = fs.readFileSync(path.join(SITE, "js/dashboard.js"), "utf8");
    const html = fs.readFileSync(path.join(SITE, "dashboard.html"), "utf8");
    // scoped to the winnings block, and to REAL calls: an earlier version searched the whole tail of the file for
    // /plausible/ and matched the English word in a comment.
    const winBlock = dash.slice(dash.indexOf("WINNINGS-4 — the fifth card, and its two-step ceremony"), dash.indexOf("function renderRedeem()"));
    ok("X0 · the winnings block was located (the slice is not empty)", winBlock.length > 2000, "len " + winBlock.length);
    ok("X1 · no analytics event is attached to the money card",
       !/window\.plausible|plausible\(|dystore::utm|DYStore\.track|\btrack\(/.test(winBlock));
    ok("X2 · the desk read is gated on the desk existing", /if \(c\.winningsDesk\) \{/.test(dash));
    ok("X3 · the coupon POST sends nonce + signature and nothing else",
       /JSON\.stringify\(\{ nonce: ch\.nonce, signature: sig \}\)/.test(dash));
    ok("X4 · STAMPS BUMPED — dashboard.js, dashboard.css and mf-config.js all carry a new ?v=",
       /js\/dashboard\.js\?v=mf30/.test(html) && /css\/dashboard\.css\?v=mf6/.test(html) && /mf-config\.js\?v=mf6/.test(html));
    ok("X5 · the shipped config keeps BOTH switches null (the card ships dormant)",
       /winningsDesk: null/.test(fs.readFileSync(path.join(SITE, "mf-config.js"), "utf8"))
       && /winningsServiceUrl: null/.test(fs.readFileSync(path.join(SITE, "mf-config.js"), "utf8")));
  }

  console.log("──\n" + (fail === 0 ? "ALL GREEN — " + pass + "/" + (pass + fail) : "FAILURES — " + fail + " of " + (pass + fail)));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("winnings suite crashed:", e); process.exit(1); });
