"use strict";
// AFFILIATE-1 rung 3 — TORANA INVITES on the site, and the ONE Withdraw card.
//
// Real everything that matters: the REAL PlayStore/AccessNFT for the store's buy road, the REAL WinningsDesk (web3
// fc5d117) for the withdrawals, coupons signed by the approval bot's OWN signer module (web3 aa53ae7,
// services/approval-bot/src/winnings/coupon.js), and every invite signature verified by the bot's OWN verifier
// (src/invites/codes.js). Only the bot's HTTP routes are stubbed — and the stubs answer by running the bot's code.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = H.SITE;
const BOT = path.join(H.W3, "services", "approval-bot", "src");
const botCodes = require(path.join(BOT, "invites", "codes.js"));
const { makeCouponSigner } = require(path.join(BOT, "winnings", "coupon.js"));
const { makeInvitesStore, makeMemoryInvitesSource } = require(path.join(BOT, "invites", "store.js"));
const { makeInvitesService } = require(path.join(BOT, "invites", "service.js"));
const DEC = 1000000000000000000n, DEC6 = 1000000n;

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const q = (w, sel) => w.document.querySelector(sel);
const txt = (w, sel) => { const e = q(w, sel); return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; };
const tile = (w) => txt(w, "#bundle-body");
const sends = (h) => h.eth.__calls.filter((m) => m === "eth_sendTransaction").length;
const toBot = (w) => w.__fetches.filter((u) => /bot\.test/.test(u));
async function waitFor(label, fn, ms) {
  const t0 = Date.now();
  for (;;) {
    let v = null; try { v = await fn(); } catch (e) { v = null; }
    if (v) return v;
    if (Date.now() - t0 > (ms || 25000)) throw new Error("WATCHDOG at: " + label);
    await H.sleep(60);
  }
}

// ── the site's js/invite.js, loaded the way a page loads it (a window global), with ethers present
function siteInvite() {
  const sandbox = { window: { ethers: ethers }, Date: Date };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(SITE, "js", "invite.js"), "utf8"), sandbox);
  return sandbox.window.DYInvite;
}
// ethers' BrowserProvider sends the payload JSON-encoded, uint as decimal strings: normalise for comparison
function canon(td) {
  const types = Object.assign({}, td.types); delete types.EIP712Domain;
  // the same NUMBER either way: ethers sends the domain chainId as a hex quantity ("0x7a69"), the bot keeps a number
  const domain = Object.assign({}, td.domain, { chainId: BigInt(td.domain.chainId).toString() });
  return JSON.stringify({ domain: domain, types: types, primaryType: td.primaryType,
    message: JSON.parse(JSON.stringify(td.message, (k, v) => (typeof v === "bigint" ? v.toString() : v))) },
    (k, v) => (typeof v === "number" ? String(v) : (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) ? v.toLowerCase() : v)));
}

// a REAL code: what the bot derives from a real request signature
async function realCode(wallet, chainId) {
  const td = botCodes.codeRequestTypedData(chainId, wallet.address, Math.floor(Date.now() / 1000));
  return botCodes.codeFromSignature(await wallet.signTypedData(td.domain, td.types, td.message));
}

// ── the store's stub for /invites/bind: it RUNS the bot's verifier on what the page actually sent
function bindStub(chainId, opts) {
  opts = opts || {};
  const seen = { calls: 0, results: [] };
  const stub = {
    "/invites/bind": (init) => {
      seen.calls++;
      const b = JSON.parse(init.body);
      const v = botCodes.verifyBinding(chainId, b);
      seen.results.push(v);
      if (!v.ok) return { refused: "BAD_SIGNATURE", sentence: "That signature couldn't be verified. Sign again." };
      if (opts.refuse) return { refused: opts.refuse, sentence: "refused by name" };
      return { code: v.code, existing: false };
    },
  };
  return { stub, seen };
}

async function storeConnect(w) {
  await waitFor("wallet provider", () => w.DYWallet.state.hasProvider);
  await w.DYWallet.connect();
  await waitFor("connected", () => w.DYWallet.state.connected && w.DYWallet.state.chainOk);
  await waitFor("the connected tile", () => !!q(w, ".b-buy") || !!q(w, ".b-topup"));
}
async function boughtBundle(c) { return (await c.nft.balanceOf(c.player.address)) > 0n; }

// THE HARNESS'S FEE RESET. Written when the pages set maxPriorityFeePerGas = maxFee × 2 (RUNG4-FIX-6, since replaced by
// FEE-1's one rule, which no longer amplifies — tests/suites/fees.js C1/C2). Kept: it costs nothing and isolates cases. On anvil the suggested tip is read from RECENT blocks' tips, so
// every page transaction raises the next suggestion: a dozen real buys on one chain compound the tip to ~1e6 gwei and
// drain even the 10,000-ETH owner (measured: 3 → 61 → 244 → 976 → … → 999,911 gwei). The suites before this one never
// ran that many page transactions on one anvil. Each case here starts from empty blocks (the tip history forgets) and
// full balances, so no case pays for the one before it.
async function freshFees(provider) {
  await provider.send("anvil_mine", ["0x40"]);
  for (const a of ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"]) {
    await provider.send("anvil_setBalance", [a, "0x" + (10000n * DEC).toString(16)]);
  }
}
const _chainStore = H.chainStore, _chainWinnings = H.chainWinnings;
H.chainStore = async (o) => { await freshFees(new ethers.JsonRpcProvider(H.RPC)); return _chainStore(o); };
H.chainWinnings = async (o) => { await freshFees(new ethers.JsonRpcProvider(H.RPC)); return _chainWinnings(o); };

async function run() {
  console.log("\n── AFFILIATE-1 rung 3 · Torana Invites + the Withdraw card ──");
  const miss = H.preflight();
  if (!fs.existsSync(path.join(BOT, "invites", "codes.js"))) miss.push("  MISSING: the approval bot's invites module at " + BOT);
  if (miss.length) { console.log("PREFLIGHT FAILED:\n" + miss.join("\n")); process.exit(1); }

  // ═══════════════ F · THE SHARED FIXTURE — the site's struct IS the bot's ═══════════════
  {
    const S = siteInvite();
    const wallet = ethers.Wallet.createRandom();
    const CH = 137, T = 1760000000;
    ok("F1 · alphabet, length and the request statement are the bot's, byte for byte",
       S.ALPHABET === botCodes.ALPHABET && S.CODE_LENGTH === botCodes.CODE_LENGTH && S.CODE_STATEMENT === botCodes.CODE_STATEMENT);
    ok("F2 · the code-request typed data EQUALS the bot's (domain, types, primary type, message)",
       canon(S.codeRequestTypedData(CH, wallet.address.toLowerCase(), T, ethers)) === canon(botCodes.codeRequestTypedData(CH, wallet.address, T)));
    ok("F3 · the binding typed data EQUALS the bot's",
       canon(S.bindingTypedData(CH, wallet.address.toLowerCase(), "ABCDEFGH", T, ethers)) === canon(botCodes.bindingTypedData(CH, wallet.address, "ABCDEFGH", T)));
    const tdB = S.bindingTypedData(CH, wallet.address, "HJKMNPQR", T, ethers);
    const sigB = await wallet.signTypedData(tdB.domain, tdB.types, tdB.message);
    const vB = botCodes.verifyBinding(CH, { buyer: wallet.address, code: "HJKMNPQR", signedAt: T, signature: sigB });
    ok("F4 · a binding signed from the SITE's typed data passes the BOT's verifier", vB.ok && vB.buyer === wallet.address, JSON.stringify(vB));
    const tdC = S.codeRequestTypedData(CH, wallet.address, T, ethers);
    const sigC = await wallet.signTypedData(tdC.domain, tdC.types, tdC.message);
    const vC = botCodes.verifyCodeRequest(CH, { wallet: wallet.address, issuedAt: T, signature: sigC });
    ok("F5 · and so does a code request, yielding the code the bot derives", vC.ok && vC.code === botCodes.codeFromSignature(sigC));
    const probes = ["abcdefgh", " HJKMNPQR ", "ABCDEFG0", "ABCDEFGO", "ABCDEFG1", "ABCDEFGI", "ABCDEFGL", "ABCDEFG", "ABCDEFGHJ", "", null, "HJKM-NPQ"];
    ok("F6 · the code check agrees with the bot's on every probe (case, spaces, 0/O/1/I/L, length)",
       probes.every((p) => S.normCode(p) === botCodes.normCode(p)), probes.map((p) => S.normCode(p) + "|" + botCodes.normCode(p)).join(" "));
    ok("F7 · the share link is exactly the ruled one",
       S.inviteLink("HJKMNPQR") === "https://divyayuddha.games/store.html?invite=HJKMNPQR&utm_source=invite&utm_medium=torana&utm_campaign=invite");
  }

  // ═══════════════ SD · THE DORMANT STORE (inviteServiceUrl null — what ships) ═══════════════
  {
    const c = await H.chainStore();
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const code = await realCode(ethers.Wallet.createRandom(), chainId);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    const h = await H.storePage(c, c.player, { url: "https://divyayuddha.games/store.html?invite=" + code + "&utm_source=invite" });
    const w = h.w;
    await waitFor("the tile", () => tile(w).indexOf("A Torana and 500 DYC") >= 0);
    ok("SD1 · dormant: no 'Invited by' line, no change to the tile", tile(w).indexOf("Invited by") < 0);
    let stored = null; try { stored = w.localStorage.getItem("dystore::invite"); } catch (e) {}
    ok("SD2 · dormant: the code is NOT remembered", stored === null);
    ok("SD3 · dormant: but it IS stripped from the address bar (it can never reach the tag)",
       w.location.search.indexOf("invite=") < 0 && w.location.search.indexOf("utm_source=invite") >= 0, w.location.search);
    await storeConnect(w);
    H.click(w, ".b-buy");
    await waitFor("the bundle bought", () => boughtBundle(c), 30000);
    ok("SD4 · dormant: Buy goes straight down the normal road (no invite step) and the bundle lands",
       await boughtBundle(c) && !q(w, ".b-invite-ask") && !q(w, ".b-invite-note") && h.eth.__typed.length === 0);
    ok("SD5 · DORMANT MEANS SILENT — not one request to the invite service", toBot(w).length === 0, JSON.stringify(toBot(w)));
    H.teardown(h);
  }

  // ═══════════════ SL · THE LIVE STORE: capture, memory, the line ═══════════════
  {
    const c = await H.chainStore();
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const A = await realCode(ethers.Wallet.createRandom(), chainId);
    const B = await realCode(ethers.Wallet.createRandom(), chainId);
    const live = { invite: "https://bot.test" };
    {
      const h = await H.storePage(c, c.player, Object.assign({ url: "https://divyayuddha.games/store.html?invite=" + A.toLowerCase() + "&utm_source=invite&utm_medium=torana" }, live));
      const w = h.w;
      await waitFor("the tile", () => tile(w).indexOf("A Torana and 500 DYC") >= 0);
      const rec = JSON.parse(w.localStorage.getItem("dystore::invite") || "null");
      ok("SL1 · a valid code (any case) is remembered, upper-cased, with a time — and nothing else",
         rec && rec.code === A && Number.isFinite(rec.at) && Object.keys(rec).sort().join(",") === "at,code", JSON.stringify(rec));
      ok("SL2 · the disconnected face shows ONE quiet line: Invited by CODE", tile(w).indexOf("Invited by " + A) >= 0 && w.document.querySelectorAll(".b-invited").length === 1);
      ok("SL3 · the code is off the address bar; the utm tags stay", w.location.search.indexOf("invite=") < 0 && /utm_medium=torana/.test(w.location.search), w.location.search);
      await storeConnect(w);
      ok("SL4 · and the non-holder face carries the line too", tile(w).indexOf("Invited by " + A) >= 0);
      ok("SL5 · nothing was asked of the service just by visiting", toBot(w).length === 0);
      H.teardown(h);
    }
    {
      const h = await H.storePage(c, c.player, Object.assign({ url: "https://divyayuddha.games/store.html?invite=ABCDEFG0" }, live));
      await waitFor("the tile", () => tile(h.w).indexOf("A Torana and 500 DYC") >= 0);
      ok("SL6 · an invalid code (0/O/1/I/L or wrong length) is ignored: not stored, no line",
         h.w.localStorage.getItem("dystore::invite") === null && tile(h.w).indexOf("Invited by") < 0);
      H.teardown(h);
    }
    {
      const fresh = JSON.stringify({ code: A, at: Date.now() - 5 * 86400000 });
      const h = await H.storePage(c, c.player, Object.assign({ url: "https://divyayuddha.games/store.html?invite=" + B, ls: { "dystore::invite": fresh } }, live));
      await waitFor("the tile", () => tile(h.w).indexOf("A Torana and 500 DYC") >= 0);
      ok("SL7 · FIRST CODE WINS: a later link does not replace a code still inside its 30 days",
         JSON.parse(h.w.localStorage.getItem("dystore::invite")).code === A && tile(h.w).indexOf("Invited by " + A) >= 0);
      H.teardown(h);
    }
    {
      const old = JSON.stringify({ code: A, at: Date.now() - 31 * 86400000 });
      const h = await H.storePage(c, c.player, Object.assign({ url: "https://divyayuddha.games/store.html?invite=" + B, ls: { "dystore::invite": old } }, live));
      await waitFor("the tile", () => tile(h.w).indexOf("A Torana and 500 DYC") >= 0);
      ok("SL8 · after 30 days the old code is gone and the new link's code is remembered",
         JSON.parse(h.w.localStorage.getItem("dystore::invite")).code === B && tile(h.w).indexOf("Invited by " + B) >= 0);
      H.teardown(h);
    }
    {
      const nearly = JSON.stringify({ code: A, at: Date.now() - 29 * 86400000 });
      const h1 = await H.storePage(c, c.player, Object.assign({ ls: { "dystore::invite": nearly } }, live));
      await waitFor("the tile", () => tile(h1.w).indexOf("A Torana and 500 DYC") >= 0);
      const old = JSON.stringify({ code: A, at: Date.now() - 31 * 86400000 });
      const h2 = await H.storePage(c, c.player, Object.assign({ ls: { "dystore::invite": old } }, live));
      await waitFor("the tile", () => tile(h2.w).indexOf("A Torana and 500 DYC") >= 0);
      ok("SL9 · THE 30-DAY EDGE: day 29 still shows the line, day 31 does not",
         tile(h1.w).indexOf("Invited by " + A) >= 0 && tile(h2.w).indexOf("Invited by") < 0);
      H.teardown(h1); H.teardown(h2);
    }
    {
      // storage refused outright: the page must still work, and Buy must still buy
      await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
      const h = await H.storePage(c, c.player, Object.assign({ url: "https://divyayuddha.games/store.html?invite=" + A, lsThrowFor: /^dystore::invite/ }, live));
      const w = h.w;
      await waitFor("the tile", () => tile(w).indexOf("A Torana and 500 DYC") >= 0);
      let threw = false; try { w.localStorage.getItem("dystore::invite"); } catch (e) { threw = true; }
      ok("SL10 · with storage refused (the injection proven armed) the page renders: no line, no crash",
         threw && tile(w).indexOf("Invited by") < 0);
      await storeConnect(w);
      H.click(w, ".b-buy");
      await waitFor("the bundle bought", () => boughtBundle(c), 30000);
      ok("SL11 · and Buy still buys", await boughtBundle(c));
      H.teardown(h);
    }
  }

  // ═══════════════ SB · INVITE-STEP-2 — the free signature is PART OF BUY ═══════════════
  // One tap on Buy: the wallet is asked for the free InviteBinding FIRST, then the normal buy road runs in the same tap.
  // Only the buyer declining stops the purchase; every failure of ours and every "can't apply" answer lets it run.
  const P15 = "Invite recorded.";
  const P16 = "The invite couldn't be recorded - your purchase goes ahead as normal.";
  const P17 = "The invite signature is free and moves no money - please sign it to continue with your purchase.";
  const firstIdx = (h, m) => h.eth.__calls.indexOf(m);
  const noBox = (w) => !q(w, ".b-invite-ask") && !q(w, ".b-invite-skip") && !q(w, ".b-invite-sign");
  async function buyCase(label, opts) {
    opts = opts || {};
    const c = await H.chainStore();
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const code = await realCode(ethers.Wallet.createRandom(), chainId);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    const s = bindStub(chainId, { refuse: opts.refuse });
    if (opts.hang) s.stub["/invites/bind"] = () => new Promise(() => {});             // a service that never answers
    const rec = { code: code, at: Date.now() };
    if (opts.doneFor) rec.done = [opts.doneFor.toLowerCase()];
    const ls = Object.assign({ "dystore::invite": JSON.stringify(rec) }, opts.noInvite ? { "dystore::invite": "" } : {}, opts.ls || {});
    if (opts.noInvite) delete ls["dystore::invite"];
    const h = await H.storePage(c, c.player, { invite: "https://bot.test", svc: s.stub, svcDown: !!opts.down, ls });
    const w = h.w;
    if (opts.decline) h.eth.__declineTyped = true;
    await storeConnect(w);
    H.click(w, ".b-buy");
    if (opts.stopAtDecline) {
      await waitFor("the declined sentence", () => txt(w, ".b-invite-note") === P17, 15000);
      return { c, h, w, s, code, chainId };
    }
    let notes = [];
    const t0 = Date.now();
    while (!(await boughtBundle(c)) && Date.now() - t0 < 40000) { const n = txt(w, ".b-invite-note"); if (n && notes.indexOf(n) < 0) notes.push(n); if (!noBox(w)) notes.push("BOX!"); await H.sleep(80); }
    return { c, h, w, s, code, chainId, notes, bought: await boughtBundle(c) };
  }
  {
    const r = await buyCase("sign");
    ok("SB1 · ONE TAP: the wallet is asked for the free signature FIRST, before any transaction, and the buy follows in the same tap",
       r.bought && firstIdx(r.h, "eth_signTypedData_v4") >= 0 && firstIdx(r.h, "eth_signTypedData_v4") < firstIdx(r.h, "eth_sendTransaction"),
       r.h.eth.__calls.filter((m) => /sign|send/i.test(m)).join(","));
    ok("SB2 · NO BOX: no invite panel, no Sign button, no Skip ever renders", r.notes.indexOf("BOX!") < 0 && noBox(r.w));
    ok("SB3 · ONE typed-data signature, and its payload EQUALS the bot's binding struct",
       r.h.eth.__typed.length === 1 && canon(r.h.eth.__typed[0]) === canon(botCodes.bindingTypedData(r.chainId, r.c.player.address, r.code, Number(r.h.eth.__typed[0].message.signedAt))),
       JSON.stringify(r.h.eth.__typed[0] && r.h.eth.__typed[0].message));
    ok("SB4 · the bot's verifier ACCEPTS what the page posted (buyer recovered = the connected wallet)",
       r.s.seen.calls === 1 && r.s.seen.results[0].ok && r.s.seen.results[0].buyer === r.c.player.address, JSON.stringify(r.s.seen.results));
    const body = r.w.__fetchBodies.find((x) => /invites\/bind/.test(x.url)).body;
    ok("SB5 · the bind carries buyer, code, signedAt, signature — nothing else", Object.keys(body).sort().join(",") === "buyer,code,signature,signedAt");
    ok("SB6 · recorded: 'Invite recorded.' on its own line, and the wallet is REMEMBERED beside the code",
       r.notes.indexOf(P15) >= 0 && (JSON.parse(r.w.localStorage.getItem("dystore::invite")).done || []).indexOf(r.c.player.address.toLowerCase()) >= 0, JSON.stringify(r.notes));
    H.teardown(r.h);
  }
  {
    // THE BUYER DECLINES: no purchase; the ruled sentence; Buy ready; the retry signs and buys
    const r = await buyCase("declined", { decline: true, stopAtDecline: true });
    await H.sleep(800);
    ok("SB7 · A DECLINED SIGNATURE STOPS THE PURCHASE: no transaction, no call to the service, no Torana",
       firstIdx(r.h, "eth_sendTransaction") < 0 && r.s.seen.calls === 0 && !(await boughtBundle(r.c)), r.h.eth.__calls.join(","));
    ok("SB8 · it says so in the ruled words (P17), and Buy is ready to try again",
       txt(r.w, ".b-invite-note") === P17 && q(r.w, ".b-buy") && q(r.w, ".b-buy").disabled === false, txt(r.w, ".b-invite-note"));
    r.h.eth.__declineTyped = false;
    H.click(r.w, ".b-buy");
    await waitFor("the retry bought", () => boughtBundle(r.c), 40000);
    ok("SB9 · THE RETRY asks again, records the invite, and buys", r.h.eth.__typed.length === 2 && r.s.seen.calls === 1 && await boughtBundle(r.c));
    H.teardown(r.h);
  }
  // OUR failures, and every answer that the invite CAN'T APPLY: the buy proceeds with at most P16
  for (const [label, opts, remembered] of [
    ["the service is DOWN", { down: true }, false],
    ["the service is SLOW (no answer within the timeout)", { hang: true, ls: { "dystore::inviteTimeoutMs": "1500" } }, false],
    ["NOT_CONFIGURED", { refuse: "NOT_CONFIGURED" }, false],
    ["ALREADY_BOUND (to another code)", { refuse: "ALREADY_BOUND" }, true],
    ["HELD_TORANA (not eligible)", { refuse: "HELD_TORANA" }, true],
    ["ALREADY_BOUGHT (not eligible)", { refuse: "ALREADY_BOUGHT" }, true],
    ["CODE_UNKNOWN", { refuse: "CODE_UNKNOWN" }, true],
    ["CODE_KILLED", { refuse: "CODE_KILLED" }, true],
    ["SELF_BINDING (the buyer owns the code)", { refuse: "SELF_BINDING" }, true],
  ]) {
    const r = await buyCase(label, opts);
    const done = (JSON.parse(r.w.localStorage.getItem("dystore::invite") || "{}").done || []).indexOf(r.c.player.address.toLowerCase()) >= 0;
    ok("SB10 · " + label + " → the buy PROCEEDS, P16 shown" + (remembered ? ", and this wallet is not asked again" : ", and the next visit may try again"),
       r.bought && r.h.eth.__typed.length === 1 && r.notes.indexOf(P16) >= 0 && done === remembered, JSON.stringify({ bought: r.bought, notes: r.notes, done }));
    H.teardown(r.h);
  }
  {
    // a wallet whose invite is already settled (recorded or can't apply) skips straight to the buy, on a fresh load
    const c0 = await H.chainStore();   // only to learn the player address the harness uses
    const r = await buyCase("already settled", { doneFor: c0.player.address });
    ok("SB11 · ALREADY SETTLED WALLET: no signature asked, no call to the service, straight to the buy",
       r.bought && r.h.eth.__typed.length === 0 && r.s.seen.calls === 0);
    H.teardown(r.h);
  }
  {
    // asked at most once per wallet per page load: a service failure settles this page, so the next Buy goes straight on
    const c = await H.chainStore();
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const code = await realCode(ethers.Wallet.createRandom(), chainId);
    const s = bindStub(chainId);
    const h = await H.storePage(c, c.player, { invite: "https://bot.test", svc: s.stub, svcDown: true,
      ls: { "dystore::invite": JSON.stringify({ code: code, at: Date.now() }) } });
    await storeConnect(h.w);
    H.click(h.w, ".b-buy");
    await waitFor("P7 (no USDC)", () => tile(h.w).indexOf("Not enough") >= 0, 20000);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    await h.w.DYStore._bundleRefresh();
    await waitFor("the buy button back", () => q(h.w, ".b-buy") && !q(h.w, ".b-buy").disabled);
    H.click(h.w, ".b-buy");
    await waitFor("the bundle bought", () => boughtBundle(c), 30000);
    ok("SB12 · ASKED ONCE PER PAGE: after a failure of ours, the next Buy on the page goes straight down the road",
       h.eth.__typed.length === 1 && await boughtBundle(c));
    H.teardown(h);
  }
  {
    const r = await buyCase("no invite", { noInvite: true });
    ok("SB13 · NO INVITE REMEMBERED: Buy is today's Buy — no signature, no call to the service, the bundle lands",
       r.bought && r.h.eth.__typed.length === 0 && r.s.seen.calls === 0 && r.notes.length === 0);
    H.teardown(r.h);
  }
  {
    // a HOLDER never sees any of it: their face has no Buy at all
    const c = await H.chainStore();
    await (await c.nft.mint(c.player.address)).wait();
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const code = await realCode(ethers.Wallet.createRandom(), chainId);
    const h = await H.storePage(c, c.player, { invite: "https://bot.test", ls: { "dystore::invite": JSON.stringify({ code: code, at: Date.now() }) } });
    await storeConnect(h.w);
    ok("SB14 · a Torana holder is never asked (no Buy, no line)", !q(h.w, ".b-buy") && noBox(h.w) && tile(h.w).indexOf("Invited by") < 0);
    H.teardown(h);
  }
  {
    // the refusal's sentence stays READABLE while the buy road runs (its own line beside #b-msg)
    const c = await H.chainStore();
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const code = await realCode(ethers.Wallet.createRandom(), chainId);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    const s = bindStub(chainId, { refuse: "HELD_TORANA" });
    const h = await H.storePage(c, c.player, { invite: "https://bot.test", svc: s.stub,
      ls: { "dystore::invite": JSON.stringify({ code: code, at: Date.now() }) } });
    await storeConnect(h.w);
    H.click(h.w, ".b-buy");
    const both = await waitFor("P16 on its own line WHILE the road writes its progress",
      () => (txt(h.w, ".b-invite-note") === P16 && txt(h.w, "#b-msg").length > 0) ? { msg: txt(h.w, "#b-msg") } : null, 15000).catch(() => null);
    await waitFor("the bundle bought", () => boughtBundle(c), 40000);
    ok("SB15 · P16 is ONE plain sentence on its own line, readable while the buy road runs — and the buy lands",
       !!both && await boughtBundle(c) && s.seen.calls === 1, JSON.stringify(both));
    H.teardown(h);
  }

  // ═══════════════ SP · THE CODE NEVER REACHES PLAUSIBLE ═══════════════
  {
    const c = await H.chainStore();
    const chainId = Number((await c.provider.getNetwork()).chainId);
    const code = await realCode(ethers.Wallet.createRandom(), chainId);
    await (await c.usdc.mint(c.player.address, 25n * DEC6)).wait();
    const s = bindStub(chainId);
    const h = await H.storePage(c, c.player, { invite: "https://bot.test", svc: s.stub,
      url: "https://divyayuddha.games/store.html?invite=" + code + "&utm_source=invite&utm_medium=torana&utm_campaign=invite" });
    const w = h.w;
    // the tag as the page injects it: record the address bar AT injection, and every event payload
    w.DY_CONFIG.analytics = { enabled: true, script: "https://plausible.test/js/script.js" };
    const events = []; let hrefAtInject = null;
    const realAppend = w.document.head.appendChild.bind(w.document.head);
    w.document.head.appendChild = function (n) { if (n && n.tagName === "SCRIPT") hrefAtInject = w.location.href; return realAppend(n); };
    w.DYStore.mountTracking();
    const realQ = w.plausible;
    w.plausible = function (name, o) { events.push({ name, o: JSON.parse(JSON.stringify(o || {})) }); };
    await storeConnect(w);
    H.click(w, ".b-buy");                                      // INVITE-STEP-2: the signature is part of this tap
    await waitFor("the bundle bought", () => boughtBundle(c), 40000);
    await waitFor("the purchase event", () => events.some((e) => e.name === "bundle_purchased"), 15000).catch(() => null);
    const queued = (realQ && realQ.q ? Array.from(realQ.q).map((a) => JSON.stringify(Array.from(a))) : []).join(" ");
    const all = JSON.stringify(events) + " " + queued;
    ok("SP1 · the address bar held NO code when the tag was injected", hrefAtInject !== null && hrefAtInject.indexOf(code) < 0 && hrefAtInject.indexOf("invite=") < 0, hrefAtInject);
    ok("SP2 · events were sent — store_view, bundle_buy_click, bundle_purchased (the law is not vacuous) — with the utm tags",
       /store_view/.test(all) && events.some((e) => e.name === "bundle_buy_click") && events.some((e) => e.name === "bundle_purchased") && /"utm_campaign":"invite"/.test(all), all.slice(0, 300));
    ok("SP3 · NO EVENT CARRIES THE CODE", all.indexOf(code) < 0);
    const st = fs.readFileSync(path.join(SITE, "store.html"), "utf8");
    ok("SP4 · store.html strips BEFORE it tags (mountInvite precedes mountTracking)",
       st.indexOf("DYStore.mountInvite()") > 0 && st.indexOf("DYStore.mountInvite()") < st.indexOf("DYStore.mountTracking()"));
    H.teardown(h);
  }

  // ═══════════════ SX · THE BUY ROAD ITSELF IS UNCHANGED ═══════════════
  {
    const head = execSync("git show HEAD:js/store.js", { cwd: SITE }).toString();
    const now = fs.readFileSync(path.join(SITE, "js", "store.js"), "utf8");
    const road = (src) => (src.split("function bundleBuy(")[1] || "").split("function bundleTopUp(")[0];
    const pre = (src) => (src.split("function preCastRead(")[1] || "").split("function sameWallet(")[0];
    ok("SX1 · bundleBuy is byte-identical to the committed road", road(head).length > 1000 && road(head) === road(now));
    ok("SX2 · and so is the pre-cast read", pre(head).length > 200 && pre(head) === pre(now));
  }

  // ═══════════════ D · THE DASHBOARD: the invites card and the ONE Withdraw card ═══════════════
  const chainIdOf = async (c) => Number((await c.provider.getNetwork()).chainId);
  async function dashConnect(w) { await w.DYWallet.connect(); await H.sleep(500); }
  // the bot's /invites/code: RUNS the bot's verifier; answers with the code the bot derives, plus an optional list
  function codeStub(chainId, opts) {
    opts = opts || {};
    const seen = { calls: 0, results: [] };
    const stub = {
      "/invites/code": (init) => {
        seen.calls++;
        const v = botCodes.verifyCodeRequest(chainId, JSON.parse(init.body));
        seen.results.push(v);
        if (!v.ok) return { refused: "BAD_SIGNATURE", sentence: "x" };
        if (opts.refuse) return { refused: opts.refuse, sentence: "x" };
        const out = { code: v.code, existing: false };
        if (opts.invites) out.invites = opts.invites;
        if (opts.extra) Object.assign(out, opts.extra);     // INVITES-2: the v2 fields (scheme, week) ride beside the list
        return out;
      },
    };
    return { stub, seen };
  }
  // rung 3b — /invites/code answered by the BOT'S OWN SERVICE (web3 0cfa3fc): real signed code and binding records in
  // its store, its list builder, its "paid" read from the REAL desk's invitePaid. Only the deriver's verdict (the
  // chain scan, proven in the bot's own suites) is given: these purchases, in chain order, with these statuses.
  async function botCodeStub(c, chainId, plan) {
    const nowS = Math.floor(Date.now() / 1000);
    const tdC = botCodes.codeRequestTypedData(chainId, c.player.address, nowS - 86400 * 30);
    const sigC = await c.player.signTypedData(tdC.domain, tdC.types, tdC.message);
    const code = botCodes.codeFromSignature(sigC);
    const binds = [], items = [];
    for (const it of plan) {
      const b = ethers.Wallet.createRandom();
      const td = botCodes.bindingTypedData(chainId, b.address, code, nowS - 86400 * 29);
      binds.push([b.address, code, String(nowS - 86400 * 29), "5", await b.signTypedData(td.domain, td.types, td.message), ""]);
      items.push({ affiliate: c.player.address.toLowerCase(), buyer: b.address.toLowerCase(), ts: nowS - 86400 * it.daysAgo,
                   unlockAt: nowS - 86400 * it.daysAgo + 7 * 86400, reward: 250n * DEC, status: it.status });
    }
    const store = makeInvitesStore({ chainId, source: makeMemoryInvitesSource({ codes: [[code, c.player.address, String(nowS - 86400 * 30), "4", sigC, ""]], bindings: binds }), log: () => {} });
    await store.load();
    const svc = makeInvitesService({ store, deriver: { derive: async () => ({ ok: true, items }) }, chainId, clock: { now: () => Date.now() },
      toranaBalanceOf: async () => 1n, headNumber: async () => 1, deskInvitePaid: (w) => c.desk.invitePaid(w) });
    const short = items.map((x) => x.buyer.slice(0, 6) + "…" + x.buyer.slice(-4));
    return { short, stub: { "/invites/code": async (init) => {
      const r = await svc.issueCode(JSON.parse(init.body));
      return r.ok ? Object.assign({ code: r.code, existing: !!r.existing }, Array.isArray(r.invites) ? { invites: r.invites } : {}) : { refused: r.refused };
    } } };
  }

  // the bot's /winnings/* routes, the coupon signed by the BOT'S OWN SIGNER MODULE
  function deskStub(c, chainId, cumW, cumI, extra) {
    const signer = makeCouponSigner({ privateKey: c.signer.privateKey, chainId: chainId, deskAddress: c.addrs.desk });
    const seen = { coupon: 0 };
    return { seen, stub: Object.assign({
      "/winnings/challenge": () => ({ nonce: "n1", message: "Divya Yuddha — winnings withdrawal\nnonce: n1" }),
      "/winnings/coupon": async () => {
        seen.coupon++;
        const s = await signer.sign(c.player.address, cumW, cumI);
        return { coupon: s.coupon, signature: s.signature, cumulativeWinningsWei: s.coupon.cumulativeWinningsWei,
                 cumulativeInviteWei: s.coupon.cumulativeInviteWei, deadline: s.coupon.deadline };
      },
    }, extra || {}) };
  }

  {
    // DD · dormant: no invite service, no desk — what ships
    const c = await H.chainWinnings({ torana: true });
    const h = await H.dashboardPage(c, c.player, {});
    const w = h.w;
    await dashConnect(w);
    ok("DD1 · DORMANT: the invites card is not shown", q(w, "#invites-panel").style.display === "none" && txt(w, "#invites-body") === "");
    ok("DD2 · DORMANT MEANS SILENT: no request to any invite route", w.__fetches.filter((u) => /invites/.test(u)).length === 0, JSON.stringify(w.__fetches));
    ok("DD3 · and the Withdraw card shows its dormant face (not yet open) with the new lead",
       /Withdraw your winnings and your Torana Invites rewards here, as USDT\./.test(txt(w, "#winnings-body")) && /not yet open/.test(txt(w, "#winnings-body")));
    const dash = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8");
    ok("DD4 · the Torana read is gated on the invite service being configured (no read while dormant)",
       /if \(c\.inviteServiceUrl && c\.accessNFT\) \{/.test(dash));
    ok("DD5 · the shipped config carries the LIVE invite service (WINNINGS-5 switch-on); the dormant face above is the harness with it unset",
       /inviteServiceUrl: "https:\/\/approval-bot-cxa2\.onrender\.com",/.test(fs.readFileSync(path.join(SITE, "mf-config.js"), "utf8")));
    H.teardown(h);
  }
  {
    // DN · live service, but the wallet holds no Torana: still hidden
    const c = await H.chainWinnings({ torana: false });
    const s = codeStub(await chainIdOf(c));
    const h = await H.dashboardPage(c, c.player, { invite: "https://bot.test", svc: s.stub });
    await dashConnect(h.w);
    ok("DN1 · HOLDERS ONLY: a wallet without a Torana never sees the card", q(h.w, "#invites-panel").style.display === "none" && s.seen.calls === 0);
    H.teardown(h);
  }
  {
    // DH · a holder, the desk dormant: get the code, see the list in plain words
    const c = await H.chainWinnings({ torana: true });
    const chainId = await chainIdOf(c);
    const now = Math.floor(Date.now() / 1000);
    const B1 = "0x1234567890abcdef1234567890abcdef1234abcd";
    const items = [
      { buyer: B1, ts: now - 2 * 86400, unlockAt: now + 5 * 86400, status: "pending", rewardWei: (250n * DEC).toString() },
      { buyer: "0xabcd00000000000000000000000000000000ef01", ts: now - 9 * 86400, unlockAt: now - 2 * 86400, status: "unlocked", rewardWei: (250n * DEC).toString() },
      { buyer: "0x9999000000000000000000000000000000008888", ts: now - 3 * 86400, unlockAt: now + 4 * 86400, status: "held", rewardWei: (187n * DEC + 5n * DEC / 10n).toString() },
    ];
    const s = codeStub(chainId, { invites: items });
    const h = await H.dashboardPage(c, c.player, { invite: "https://bot.test", svc: s.stub });
    const w = h.w;
    await dashConnect(w);
    ok("DH1 · a holder sees the card, the ruled lead, and one button", q(w, "#invites-panel").style.display === "" &&
       txt(w, "#invites-body").indexOf("Share your invite link. When a friend buys their first bundle through it, you earn 10% of what they paid.") >= 0 && !!q(w, "#inv-get"));
    ok("DH2 · nothing is asked of the service until the holder asks", s.seen.calls === 0);
    H.click(w, "#inv-get");
    await waitFor("the code", () => !!q(w, "#inv-code"));
    ok("DH3 · ONE typed-data signature, and its payload EQUALS the bot's code-request struct",
       h.eth.__typed.length === 1 && canon(h.eth.__typed[0]) === canon(botCodes.codeRequestTypedData(chainId, c.player.address, Number(h.eth.__typed[0].message.issuedAt))));
    ok("DH4 · the bot's verifier accepts it, and the card shows the code the bot derived",
       s.seen.results[0].ok && txt(w, "#inv-code") === s.seen.results[0].code);
    ok("DH5 · the share link is exactly the ruled one",
       q(w, "#inv-link").value === "https://divyayuddha.games/store.html?invite=" + s.seen.results[0].code + "&utm_source=invite&utm_medium=torana&utm_campaign=invite", q(w, "#inv-link").value);
    const rows = Array.from(w.document.querySelectorAll(".inv-row")).map((r) => r.textContent.replace(/\s+/g, " ").trim());
    ok("DH6 · buyers are SHORTENED (0x1234…abcd), never in full", rows.some((r) => r.indexOf("0x1234…abcd") >= 0) && rows.every((r) => !/0x[0-9a-fA-F]{40}/.test(r)), rows.join(" | "));
    ok("DH7 · pending reads 'Unlocks on <date>'", rows.some((r) => /Unlocks on \w{3} \d{2}, \d{4}/.test(r)), rows.join(" | "));
    ok("DH8 · held reads 'Held for review'", rows.some((r) => /Held for review/.test(r)));
    ok("DH9 · unlocked, with the desk not open, says so in plain words", rows.some((r) => r.indexOf("Unlocked - withdrawals open when the desk does.") >= 0), rows.join(" | "));
    const tot = txt(w, "#inv-totals");
    ok("DH10 · totals in DYC AND USD (687.50 DYC earned ≈ USD 5.50; ready, unlocking, held, paid each stated)",
       /Earned\s*687\.50 DYC ≈ USD 5\.50/.test(tot) && /Ready\s*250\.00 DYC ≈ USD 2\.00/.test(tot) && /Unlocking\s*250\.00 DYC/.test(tot)
       && /Held\s*187\.50 DYC ≈ USD 1\.50/.test(tot) && /Paid\s*0\.00 DYC/.test(tot), tot);
    ok("DH11 · the card never says affiliate or referral", !/affiliat|referr/i.test(txt(w, "#invites-panel")));
    H.click(w, "#inv-copy");
    await H.sleep(200);
    ok("DH12 · Copy link answers 'Link copied.'", /Link copied\./.test(w.document.body.textContent));
    H.teardown(h);
  }
  {
    // DL · the bot does not send a list (today's bot): the card says so, never invents one
    const c = await H.chainWinnings({ torana: true });
    const s = codeStub(await chainIdOf(c));
    const h = await H.dashboardPage(c, c.player, { invite: "https://bot.test", svc: s.stub });
    await dashConnect(h.w);
    H.click(h.w, "#inv-get");
    await waitFor("the code", () => !!q(h.w, "#inv-code"));
    ok("DL1 · no list from the service → 'Your invited purchases can't be shown right now.', and no rows",
       txt(h.w, "#inv-list-note") === "Your invited purchases can't be shown right now." && !q(h.w, ".inv-row"));
    H.teardown(h);
    const s2 = codeStub(await chainIdOf(c), { invites: [] });
    const h2 = await H.dashboardPage(c, c.player, { invite: "https://bot.test", svc: s2.stub });
    await dashConnect(h2.w);
    H.click(h2.w, "#inv-get");
    await waitFor("the code", () => !!q(h2.w, "#inv-code"));
    ok("DL2 · an empty list → 'No invited purchases yet.'", txt(h2.w, "#inv-list-note") === "No invited purchases yet.");
    H.teardown(h2);
    const s3 = codeStub(await chainIdOf(c), { refuse: "NO_TORANA" });
    const h3 = await H.dashboardPage(c, c.player, { invite: "https://bot.test", svc: s3.stub });
    await dashConnect(h3.w);
    H.click(h3.w, "#inv-get");
    await waitFor("the refusal", () => txt(h3.w, "#ov-fail-msg").length > 0);
    ok("DL3 · a refusal answers in the ruled words (NO_TORANA)", txt(h3.w, "#ov-fail-msg") === "Invite codes are for Torana holders.", txt(h3.w, "#ov-fail-msg"));
    H.teardown(h3);
  }

  // ═══════════════ DV · INVITES-2 — THE v2 CARD, ONLY WHILE THE DIGEST SAYS v2 ═══════════════
  {
    const c = await H.chainWinnings({ torana: true });
    const chainId = await chainIdOf(c);
    const now = Math.floor(Date.now() / 1000);
    const mon = now - ((new Date(now * 1000).getUTCDay() + 6) % 7) * 86400 - (now % 86400);
    const L1B = "0x1234567890abcdef1234567890abcdef1234abcd";
    // a v2-shaped list: an L1 friend, a step-2 reward (no buyer — the bot never sends one), a weekly bonus
    const v2items = [
      { kind: "invite", level: 1, buyer: "0x1234…abcd", ts: now - 9 * 86400, unlockAt: now - 2 * 86400, status: "unlocked", rewardWei: (125n * DEC).toString(), paidWei: "0" },
      { kind: "invite", level: 2, buyer: null, ts: now - 3 * 86400, unlockAt: now + 4 * 86400, status: "pending", rewardWei: (25n * DEC).toString(), paidWei: "0" },
      { kind: "bonus", level: 0, buyer: null, week: mon - 7 * 86400, count: 21, ts: mon, unlockAt: mon + 7 * 86400, status: "pending", rewardWei: (2500n * DEC).toString(), paidWei: "0" },
    ];
    const LEAD_V1 = "Share your invite link. When a friend buys their first bundle through it, you earn 10% of what they paid.";
    const LEAD_V2 = "Share your invite link. When a friend buys their first bundle through it, you earn 5% of what they paid.";
    const V2_ONLY = [LEAD_V2, "you earn 1% more", "Weekly bonus:", "This week:", "Step 2", "Weekly bonus - week of"];
    async function cardWith(digest, week, opts2) {
      opts2 = opts2 || {};
      const s = codeStub(chainId, { invites: opts2.items || v2items, extra: week == null ? {} : { scheme: "v2", week: { start: mon, count: week } } });
      if (digest !== undefined) s.stub["invites-digest.json"] = () => digest;
      // the card store lives where the live site keeps it: config.js contracts.cardUsdStore (the store page's own key)
      const h = await H.dashboardPage(c, c.player, { invite: "https://bot.test", svc: s.stub, cardUsdStore: opts2.cardStore ? "0x00000000000000000000000000000000000000c5" : null });
      await dashConnect(h.w);
      H.click(h.w, "#inv-get");
      await waitFor("the code", () => !!q(h.w, "#inv-code"));
      await H.sleep(150);
      return { h, w: h.w, card: txt(h.w, "#invites-panel") };
    }
    {
      // CARD-STORE-1 / v2 go-live fix: the store is configured (config.js cardUsdStore, as on mainnet) but the scheme is v1
      const r = await cardWith([{ date: "2026-10-12", scheme: "v1" }], 12, { cardStore: true });
      ok("DV1b · v1 with the card store configured: the card lines NEVER show (v1 pays no cards)",
         r.card.indexOf("buy a card in the store") < 0 && r.card.indexOf("Cards bought with DYC") < 0 && r.card.indexOf(LEAD_V1) >= 0);
      H.teardown(r.h);
    }
    {
      const r = await cardWith([{ date: "2026-10-12", codes: 1, bindings: 0, sha256: "x", scheme: "v1" }], 12);
      ok("DV1 · DIGEST SAYS v1: the card is the v1 card — 10% lead, the review line, and NOT ONE v2 line (even with a v2-shaped list)",
         r.card.indexOf(LEAD_V1) >= 0 && r.card.indexOf("More than 25 rewards in one month are checked by hand before they unlock.") >= 0
           && V2_ONLY.every((t) => r.card.indexOf(t) < 0), V2_ONLY.filter((t) => r.card.indexOf(t) >= 0).join(" | "));
      ok("DV2 · the digest was read once, from the site itself (same origin)", r.w.__fetches.filter((u) => u === "invites-digest.json").length === 1, JSON.stringify(r.w.__fetches));
      H.teardown(r.h);
    }
    {
      const r = await cardWith(undefined, 12);
      ok("DV3 · NO DIGEST (unreadable): v1, never v2", r.card.indexOf(LEAD_V1) >= 0 && V2_ONLY.every((t) => r.card.indexOf(t) < 0));
      H.teardown(r.h);
    }
    {
      const r = await cardWith([{ date: "2026-10-11", scheme: "v1" }, { date: "2026-10-12", scheme: "v2" }], 12);
      ok("DV4 · DIGEST SAYS v2 (latest entry): the 5% lead and the steps line replace the 10% lead",
         r.card.indexOf(LEAD_V2) >= 0 && r.card.indexOf(LEAD_V1) < 0
           && r.card.indexOf("When the friends they invite buy their first bundle, you earn 1% more - and so on, up to five steps beyond your own friends.") >= 0);
      ok("DV5 · the weekly bonus and its unlock are stated; the review line is gone (v2 has no brake)",
         r.card.indexOf("Weekly bonus: when 20 of your own friends buy their first bundle in one week (Monday to Monday, UTC), you earn $40 more. 50 earns $100, 100 earns $200 and 200 earns $400 - only the highest step counts.") >= 0
           && r.card.indexOf("A weekly bonus unlocks 7 days after its week ends.") >= 0 && r.card.indexOf("More than 25 rewards") < 0);
      ok("DV6 · this week's progress, in the ruled words: 'This week: 12 of 20 - reach 20 for a $40 bonus.'", txt(r.w, "#inv-week") === "This week: 12 of 20 - reach 20 for a $40 bonus.", txt(r.w, "#inv-week"));
      // the row's FIRST cell — who it is for (cells concatenate with no space, so read the cell, not the row)
      const who = Array.from(r.w.document.querySelectorAll(".inv-row .inv-buyer")).map((x) => x.textContent.trim());
      const rows = Array.from(r.w.document.querySelectorAll(".inv-row")).map((x) => x.textContent);
      ok("DV7 · rows: your friend shortened; a step-2 reward shows 'Step 2' and NO address; the bonus row names its week",
         who.length === 3 && who.indexOf("0x1234…abcd") >= 0 && who.indexOf("Step 2") >= 0 && rows.filter((x) => /0x/.test(x)).length === 1
           && who.some((x) => /^Weekly bonus - week of \w{3} \d{2}, \d{4}$/.test(x)), who.join(" | "));
      const lv = txt(r.w, "#inv-levels");
      ok("DV8 · earnings per step: Your friends 125, Step 2 25, Weekly bonus 2,500 (DYC) — with the step note",
         /Your friends\s*(\d+\s*)?125\.00 DYC/.test(lv) && /Step 2\s*(\d+\s*)?25\.00 DYC/.test(lv) && /Weekly bonus\s*2,500\.00 DYC/.test(lv)
           && r.card.indexOf("Step 2 is the friends your friends invite, and so on up to step 6.") >= 0, lv);
      ok("DV9 · the card-store lines stay HIDDEN while no card store is configured", r.card.indexOf("buy a card in the store") < 0 && r.card.indexOf("Cards bought with DYC") < 0);
      ok("DV10 · the v2 card never says affiliate or referral", !/affiliat|referr/i.test(r.card));
      H.teardown(r.h);
    }
    {
      const r = await cardWith([{ scheme: "v2" }], 25, { cardStore: true });
      ok("DV11 · v2 with the card store configured WHERE THE LIVE SITE KEEPS IT (config.js cardUsdStore): its two lines appear (DYC card purchases earn nothing)",
         r.card.indexOf("When they buy a card in the store with USDT or USDC, you earn the same shares of its price.") >= 0 && r.card.indexOf("Cards bought with DYC earn nothing.") >= 0);
      ok("DV12 · between steps the NEXT step is named: 25 → 'This week: 25 of 50 - reach 50 for a $100 bonus.'", txt(r.w, "#inv-week") === "This week: 25 of 50 - reach 50 for a $100 bonus.", txt(r.w, "#inv-week"));
      H.teardown(r.h);
      const t = await cardWith([{ scheme: "v2" }], 230);
      ok("DV13 · past the top step: 'This week: 230 - the top bonus of $400 is reached.'", txt(t.w, "#inv-week") === "This week: 230 - the top bonus of $400 is reached.", txt(t.w, "#inv-week"));
      H.teardown(t.h);
      // the shipped config, unmodified: config.js as it is in the repo carries the mainnet cardUsdStore, and the dashboard reads it
      const cfgSrc = require("fs").readFileSync(require("path").join(H.SITE, "config.js"), "utf8");
      ok("DV14 · the SHIPPED config.js carries cardUsdStore (the mainnet store), and dashboard.js reads exactly that key",
         /cardUsdStore: "0xb6535aCB1FFF2eBe527C0a5682E1814A342B02B6"/.test(cfgSrc)
           && /cardStore: oc\.cardStore \|\| fc\.cardStore \|\| pc\.cardUsdStore \|\| null/.test(require("fs").readFileSync(require("path").join(H.SITE, "js", "dashboard.js"), "utf8")));
    }
    // ── the AMENDMENT (A1/A2/A8): open codes, accrued-not-released, the six level counts ──
    {
      const nh = await H.chainWinnings({ torana: false });
      const accrued = [{ kind: "invite", level: 1, buyer: "0x1234…abcd", ts: now - 9 * 86400, unlockAt: now - 2 * 86400, status: "accrued", rewardWei: (125n * DEC).toString(), paidWei: "0" },
                       { kind: "invite", level: 3, buyer: null, ts: now - 3 * 86400, unlockAt: now + 4 * 86400, status: "accrued", rewardWei: (25n * DEC).toString(), paidWei: "0" }];
      const s = codeStub(await chainIdOf(nh), { invites: accrued, extra: { scheme: "v2", week: { start: mon, count: 3 },
        levels: { 1: 1, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0 }, release: { released: false, accruedWei: (150n * DEC).toString() } } });
      s.stub["invites-digest.json"] = () => [{ scheme: "v2" }];
      const h = await H.dashboardPage(nh, nh.player, { invite: "https://bot.test", svc: s.stub });
      await dashConnect(h.w);
      await H.sleep(200);
      ok("DV15 · OPEN CODES (A1): under v2 a wallet with NO Torana sees the card and its one button", q(h.w, "#invites-panel").style.display === "" && !!q(h.w, "#inv-get"));
      H.click(h.w, "#inv-get");
      await waitFor("the code", () => !!q(h.w, "#inv-code"));
      await H.sleep(100);
      ok("DV16 · A8: earned but not released — 'You have earned 1.20 USDT in invite rewards. They unlock when you own a Torana — buy the bundle to release them.'",
         txt(h.w, "#inv-accrued") === "You have earned 1.20 USDT in invite rewards. They unlock when you own a Torana — buy the bundle to release them.", txt(h.w, "#inv-accrued"));
      const rows = Array.from(h.w.document.querySelectorAll(".inv-row .inv-status")).map((x) => x.textContent.trim());
      ok("DV17 · each accrued row says what it waits for: 'Unlocks when you own a Torana'", rows.length === 2 && rows.every((r) => r === "Unlocks when you own a Torana"), rows.join(" | "));
      const lv = Array.from(h.w.document.querySelectorAll("#inv-levels .win-part")).map((x) => x.getAttribute("data-level") + "=" + (x.querySelector(".inv-level-n") || {}).textContent);
      ok("DV18 · all six levels are shown with their counts (L1 1, L3 1, the rest 0)", lv.join(",") === "1=1,2=0,3=1,4=0,5=0,6=0", lv.join(","));
      ok("DV19 · and this week's direct count toward the next step", txt(h.w, "#inv-week") === "This week: 3 of 20 - reach 20 for a $40 bonus.");
      H.teardown(h);
      const s1 = codeStub(await chainIdOf(nh));
      s1.stub["invites-digest.json"] = () => [{ scheme: "v1" }];
      const h1 = await H.dashboardPage(nh, nh.player, { invite: "https://bot.test", svc: s1.stub });
      await dashConnect(h1.w); await H.sleep(300);
      ok("DV20 · under v1 a wallet with no Torana still never sees the card (and asks the service nothing)", q(h1.w, "#invites-panel").style.display === "none" && s1.seen.calls === 0);
      H.teardown(h1);
      const s2 = codeStub(await chainIdOf(c), { invites: v2items, extra: { scheme: "v2", week: { start: mon, count: 0 }, levels: { 1: 1, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 }, release: { released: true, accruedWei: (150n * DEC).toString() } } });   // the RELEASE flag decides, not the amount
      s2.stub["invites-digest.json"] = () => [{ scheme: "v2" }];
      const h2 = await H.dashboardPage(c, c.player, { invite: "https://bot.test", svc: s2.stub });
      await dashConnect(h2.w); H.click(h2.w, "#inv-get"); await waitFor("the code", () => !!q(h2.w, "#inv-code")); await H.sleep(100);
      ok("DV21 · a RELEASED wallet sees no 'You have earned' line", !q(h2.w, "#inv-accrued") && txt(h2.w, "#invites-panel").indexOf("You have earned") < 0);
      H.teardown(h2);
    }
    {
      // a v1 list under a v2 digest (the flip landed before the bot's list caught up): no step labels, no crash
      const v1items = [{ buyer: L1B, ts: now - 9 * 86400, unlockAt: now - 2 * 86400, status: "unlocked", rewardWei: (250n * DEC).toString() }];
      const r = await cardWith([{ scheme: "v2" }], null, { items: v1items });
      ok("DV14 · v2 copy over a v1-shaped list: the friend shows shortened, no week line is invented", r.card.indexOf("0x1234…abcd") >= 0 && !q(r.w, "#inv-week"));
      H.teardown(r.h);
    }
  }

  // ═══════════════ WD · THE WITHDRAW CARD, END TO END ON THE REAL DESK ═══════════════
  async function withdraw(label, cumW, cumI, opts) {
    opts = opts || {};
    const c = await H.chainWinnings({ torana: true });
    const chainId = await chainIdOf(c);
    const bot = opts.botPlan ? await botCodeStub(c, chainId, opts.botPlan) : null;
    const d = deskStub(c, chainId, cumW, cumI, bot ? bot.stub : (opts.invites ? codeStub(chainId, { invites: opts.invites }).stub : null));
    const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.desk, service: "https://bot.test" }, invite: (opts.invites || bot) ? "https://bot.test" : null, svc: d.stub });
    const w = h.w;
    await dashConnect(w);
    const pre = { dyc: await c.dyc.balanceOf(c.player.address), usdt: await c.usdt.balanceOf(c.player.address),
                  allow: await c.dyc.allowance(c.player.address, c.addrs.desk), sends: sends(h) };
    H.click(w, "#win-coupon");
    await waitFor("the approval", () => q(w, "#win-redeem") && q(w, "#win-redeem").disabled === false);
    const card = txt(w, "#winnings-body");
    H.click(w, "#win-redeem");
    await waitFor("the confirm", () => !!q(w, "#ov-confirm-go") && txt(w, "#ov-confirm-body").length > 0);
    const confirm = txt(w, "#ov-confirm-body");
    H.click(w, "#ov-confirm-go");
    await waitFor("the redemption (" + label + ")", async () => (await c.desk.lastRedeem(c.player.address)) > 0n, 30000);
    await H.sleep(400);
    return { c, h, w, pre, card, confirm, bot,
             post: { dyc: await c.dyc.balanceOf(c.player.address), usdt: await c.usdt.balanceOf(c.player.address),
                     allow: await c.dyc.allowance(c.player.address, c.addrs.desk), sends: sends(h),
                     redeemed: await c.desk.redeemed(c.player.address), invitePaid: await c.desk.invitePaid(c.player.address) } };
  }
  {
    const r = await withdraw("winnings only", 900n * DEC, 0n);
    ok("WD1 · WINNINGS ONLY: the card (with the approval held) shows both lines — 900.00 winnings, 0.00 invite rewards",
       /Winnings\s*900\.00 DYC/.test(r.card) && /Invite rewards\s*0\.00 DYC/.test(r.card), r.card.slice(0, 200));
    ok("WD2 · the confirm is W9, word for word", r.confirm.indexOf("Withdraw 900.00 DYC and receive 7.200000 USDT. The DYC returns to the treasury.") >= 0, r.confirm);
    ok("WD3 · the real desk paid: redeemed 900, USDT +7.2, DYC −900 (approval asked: 2 transactions)",
       r.post.redeemed === 900n * DEC && r.post.usdt - r.pre.usdt === 7200000n && r.pre.dyc - r.post.dyc === 900n * DEC && r.post.sends - r.pre.sends === 2,
       JSON.stringify({ s: r.post.sends - r.pre.sends }));
    H.teardown(r.h);
  }
  {
    const r = await withdraw("invite only", 0n, 250n * DEC);
    ok("WD4 · INVITE ONLY: the confirm is the ruled invite sentence",
       r.confirm.indexOf("Withdraw 250.00 DYC of invite rewards and receive 2.000000 USDT. No DYC leaves your wallet.") >= 0, r.confirm);
    ok("WD5 · NO APPROVAL WAS ASKED: exactly ONE transaction, and the allowance never moved",
       r.post.sends - r.pre.sends === 1 && r.post.allow === r.pre.allow && r.post.allow === 0n, JSON.stringify({ s: r.post.sends - r.pre.sends, a: String(r.post.allow) }));
    ok("WD6 · and no DYC left the wallet; USDT +2.0; invitePaid 250 on the real desk",
       r.post.dyc === r.pre.dyc && r.post.usdt - r.pre.usdt === 2000000n && r.post.invitePaid === 250n * DEC && r.post.redeemed === 0n);
    H.teardown(r.h);
  }
  {
    const r = await withdraw("combined", 900n * DEC, 250n * DEC);
    ok("WD7 · COMBINED: the confirm names both parts and the total",
       r.confirm.indexOf("Withdraw 900.00 DYC of winnings and 250.00 DYC of invite rewards, and receive 9.200000 USDT. The winnings DYC returns to the treasury.") >= 0, r.confirm);
    ok("WD8 · the real desk paid both in ONE redeem: redeemed 900, invitePaid 250, USDT +9.2, DYC −900 only",
       r.post.redeemed === 900n * DEC && r.post.invitePaid === 250n * DEC && r.post.usdt - r.pre.usdt === 9200000n && r.pre.dyc - r.post.dyc === 900n * DEC);
    ok("WD9 · the approval asked was for the WINNINGS part only (exactly 900, spent to 0)",
       r.post.sends - r.pre.sends === 2 && r.post.allow === 0n);
    H.teardown(r.h);
  }
  {
    // after a real invite-only withdrawal, the BOT'S list (its own service, its "paid" from the REAL desk) marks the
    // OLDEST unlocked reward "Paid" — and the page shows exactly what the bot says
    const r = await withdraw("pay one, then read the list", 0n, 250n * DEC,
      { botPlan: [{ daysAgo: 20, status: "unlocked" }, { daysAgo: 12, status: "unlocked" }, { daysAgo: 2, status: "pending" }] });
    await r.w.DYDash._refresh(); await H.sleep(800);
    H.click(r.w, "#inv-get");
    await waitFor("the code", () => !!q(r.w, "#inv-code"));
    const rows = Array.from(r.w.document.querySelectorAll(".inv-row")).map((x) => x.textContent.replace(/\s+/g, " ").trim());
    const [oldest, next, pend] = r.bot.short;
    ok("WD10 · THE BOT'S LIST, AS-IS: 'Paid' lands on the OLDEST unlocked reward, the next is Ready to withdraw, the pending one waits",
       rows.some((x) => x.indexOf(oldest) >= 0 && /Paid$/.test(x)) && rows.some((x) => x.indexOf(next) >= 0 && /Ready to withdraw$/.test(x))
       && rows.some((x) => x.indexOf(pend) >= 0 && /Unlocks on/.test(x)), rows.join(" | ") + " :: oldest " + oldest);
    // the SAME lifetime ceiling asked for again: the card subtracts what the desk has already paid, so nothing is left
    H.click(r.w, "#win-coupon");
    await waitFor("the second approval", () => /Approval received/.test(txt(r.w, "#win-coupon")));
    ok("WD11 · after paying, a fresh approval at the same ceiling shows 0.00 invite rewards — the desk's invitePaid is subtracted",
       /Invite rewards\s*0\.00 DYC/.test(txt(r.w, "#winnings-body")), txt(r.w, "#winnings-body").slice(0, 220));
    H.teardown(r.h);
  }
  {
    // the SITE's ruled sentence wins for a reason it knows, even when the service sends other words
    const c = await H.chainWinnings();
    const stub = {
      "/winnings/challenge": () => ({ nonce: "n1", message: "Divya Yuddha — winnings withdrawal\nnonce: n1" }),
      "/winnings/coupon": () => ({ refused: "NOTHING_TO_WITHDRAW", sentence: "You have no winnings to withdraw yet." }),
    };
    const h = await H.dashboardPage(c, c.player, { winnings: { desk: c.addrs.desk, service: "https://bot.test" }, svc: stub });
    await dashConnect(h.w);
    H.click(h.w, "#win-coupon");
    await waitFor("the refusal", () => txt(h.w, "#ov-fail-msg").length > 0);
    ok("WS1 · a known refusal is answered in the SITE's ruled words, not the service's (S3: 'You have nothing to withdraw yet.')",
       txt(h.w, "#ov-fail-msg") === "You have nothing to withdraw yet.", txt(h.w, "#ov-fail-msg"));
    H.teardown(h);
  }

  {
    const r = await withdraw("pay one and a half", 0n, 375n * DEC,
      { botPlan: [{ daysAgo: 20, status: "unlocked" }, { daysAgo: 12, status: "unlocked" }] });
    await r.w.DYDash._refresh(); await H.sleep(800);
    H.click(r.w, "#inv-get");
    await waitFor("the code", () => !!q(r.w, "#inv-code"));
    const rows = Array.from(r.w.document.querySelectorAll(".inv-row")).map((x) => x.textContent.replace(/\s+/g, " ").trim());
    const tot = txt(r.w, "#inv-totals");
    ok("WD12 · A PARTLY PAID REWARD stays unlocked (Ready), and the totals split it by the bot's paidWei: Paid 375, Ready 125",
       rows.some((x) => x.indexOf(r.bot.short[0]) >= 0 && /Paid$/.test(x)) && rows.some((x) => x.indexOf(r.bot.short[1]) >= 0 && /Ready to withdraw$/.test(x))
       && /Paid\s*375\.00 DYC/.test(tot) && /Ready\s*125\.00 DYC/.test(tot) && /Earned\s*500\.00 DYC/.test(tot), rows.join(" | ") + " :: " + tot);
    H.teardown(r.h);
  }
  {
    const dash = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8");
    ok("WD13 · the site no longer re-derives the payout split (one source: the bot)", !/function invStatuses|covered\[x\.key\]|run \+= BigInt\(x\.rewardWei\)/.test(dash));
  }

  // ═══════════════ X · SOURCE LAWS AND STAMPS ═══════════════
  {
    const dash = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8");
    const store = fs.readFileSync(path.join(SITE, "js", "store.js"), "utf8");
    const dh = fs.readFileSync(path.join(SITE, "dashboard.html"), "utf8");
    const sh = fs.readFileSync(path.join(SITE, "store.html"), "utf8");
    const th = fs.readFileSync(path.join(SITE, "treasury.html"), "utf8");
    const rh = fs.readFileSync(path.join(SITE, "report.html"), "utf8");
    ok("X1 · the approval is read only when there IS a winnings part",
       /var allowP = parts\.w > 0n \? dyc\.allowance\(me, c\.winningsDesk\) : Promise\.resolve\(null\);/.test(dash));
    ok("X2 · the invite block carries no analytics call",
       !/plausible|track\(/.test((dash.split("AFFILIATE-1 rung 3 — THE TORANA INVITES CARD")[1] || "").split("function renderRedeem()")[0]));
    ok("X3 · the store's invite step carries no analytics call either",
       !/plausible|track\(/.test((store.split("AFFILIATE-1 rung 3 · TORANA INVITES (the store's half)")[1] || "").split("function bLs(")[0]));
    ok("X4 · STAMPS: store.js s27, store.css s10 (CARD-STORE-1 C3 + review fix + C5 + C5-A), invite.js i2, mf-config mf11 on store.html",
       /js\/store\.js\?v=s27/.test(sh) && /css\/store\.css\?v=s10/.test(sh) && /js\/invite\.js\?v=i2/.test(sh) && /mf-config\.js\?v=mf11/.test(sh));
    ok("X5 · STAMPS: dashboard.js mf43, dashboard.css mf7, invite.js i2, mf-config mf11 on dashboard.html",
       /js\/dashboard\.js\?v=mf43/.test(dh) && /css\/dashboard\.css\?v=mf7/.test(dh) && /js\/invite\.js\?v=i2/.test(dh) && /mf-config\.js\?v=mf11/.test(dh));
    ok("X6 · STAMPS: every other page carrying a moved file moved with it (treasury store.js s27, report mf-config mf11)",
       /js\/store\.js\?v=s27/.test(th) && /mf-config\.js\?v=mf11/.test(rh));
    ok("X7 · the Referrals link is untouched", /data-referrals>/.test(dh) && /Referrals<\/a>/.test(dh));
  }

  console.log("──\n" + (fail === 0 ? "ALL GREEN — " + pass + "/" + (pass + fail) : "FAILURES — " + fail + " of " + (pass + fail)));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("invites suite crashed:", e); process.exit(1); });
