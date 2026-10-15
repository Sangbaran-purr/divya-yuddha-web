"use strict";
// FREE-PLAY-1 (rung 2) — SOLO IS FREE; THE TORANA OPENS THE HALL.
//
// Owner rulings 2026-10-11: any wallet connected on Polygon plays solo (the rite's Enter, the same pass a holder
// gets); multiplayer needs a Torana (the Hall's page gate here, and the match server's own check — web3 FP1, live).
// The rite and the Hall run their REAL markup and scripts in jsdom against anvil, where the harness deploys a real
// AccessNFT; "holder" means a Torana actually minted to the wallet, never a flag.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = H.SITE;
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } }
const $ = (w, id) => w.document.getElementById(id);
const txt = (e) => (e ? e.textContent.replace(/\s+/g, " ").trim() : "");
const btnText = (w) => txt($(w, "rite-action"));
const shown = (e) => !!e && !e.hidden;

// the plausible calls the page made: the queue shim records every call (the real script never loads in jsdom)
function plausibleCalls(w) { return ((w.plausible && w.plausible.q) || []).map((a) => Array.prototype.slice.call(a)); }

async function settle(w, pred, ms, label) { return H.until(() => pred(), ms || 15000, label).catch(() => null); }

async function run() {
  // ═══════════════ RT · THE RITE ═══════════════
  console.log("\n── RT · the rite: a connected wallet on Polygon plays solo, free ──");
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { url: "https://divyayuddha.games/rite.html?utm_source=ig&utm_medium=bio&utm_campaign=free" });
    const w = r.w;
    await settle(w, () => /play solo/.test(btnText(w)), 15000, "the solo Enter");
    ok("RT1 · a connected NON-holder on Polygon gets Enter, sub-line 'play solo — free'",
       btnText(w) === "Enterplay solo — free" && !$(w, "rite-action").disabled && shown($(w, "rite-action")), btnText(w));
    ok("RT2 · the ruled solo line and the second door are shown",
       shown($(w, "rite-doorline")) && txt($(w, "rite-doorline")) === "Solo play is free - enter now. Tables against other players need a Torana." &&
       shown($(w, "rite-buyline")) && /store\.html#bundle/.test($(w, "rite-buyline").innerHTML));
    ok("RT3 · nothing is fired before Enter: the tag is mounted with pageviews OFF, and no event is queued",
       plausibleCalls(w).length === 0 && w.plausible && w.plausible.o && w.plausible.o.autoCapturePageviews === false, JSON.stringify(plausibleCalls(w)));
    w.sessionStorage.setItem("dyw_demo", "1");             // a demo visitor arriving in the same tab
    H.click(w, "#rite-action");
    ok("RT4 · Enter sets the SAME session pass a holder's Enter sets (dyw_pass), and the demo mark dies with it",
       w.sessionStorage.getItem("dyw_pass") === "1" && w.sessionStorage.getItem("dyw_demo") === null);
    await H.sleep(1200);                                   // the door-wipe (≤900ms) then the navigation to the game
    ok("RT4b · …and Enter takes the player through the door (one navigation, to the game copy)", w.__navs.length === 1, "navs " + w.__navs.length);
    H.click(w, "#rite-action");                             // a second tap (the door is still swinging)
    const calls = plausibleCalls(w);
    const blob = JSON.stringify(calls).toLowerCase();
    ok("RT5 · solo_start fires ONCE, on Enter", calls.length === 1 && calls[0][0] === "solo_start", JSON.stringify(calls));
    ok("RT6 · …carrying the utm tags ONLY — no address, no holder flag, nothing else",
       calls.length === 1 && JSON.stringify(calls[0][1]) === JSON.stringify({ props: { utm_source: "ig", utm_medium: "bio", utm_campaign: "free" } }) &&
       blob.indexOf(c.player.address.toLowerCase()) < 0 && blob.indexOf(c.player.address.toLowerCase().slice(2, 10)) < 0 && !/holder|torana|0x[0-9a-f]{8}/.test(blob), JSON.stringify(calls));
    ok("RT7 · the tags rode the store's own sessionStorage key (a visit tagged on either page carries through)",
       JSON.parse(w.sessionStorage.getItem("dystore::utm")).utm_source === "ig");
  }
  {
    // a tagged value shaped like an address never travels
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { url: "https://divyayuddha.games/rite.html?utm_source=0x" + "ab".repeat(20) + "&utm_medium=x" });
    await settle(r.w, () => /play solo/.test(btnText(r.w)), 15000, "the solo Enter");
    H.click(r.w, "#rite-action");
    const calls = plausibleCalls(r.w);
    ok("RT8 · an address smuggled into a utm tag is dropped (only utm_medium travels)",
       calls.length === 1 && JSON.stringify(calls[0][1].props) === JSON.stringify({ utm_medium: "x" }), JSON.stringify(calls));
  }
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { analytics: false });
    await settle(r.w, () => /play solo/.test(btnText(r.w)), 15000, "the solo Enter");
    H.click(r.w, "#rite-action");
    ok("RT9 · analytics OFF in config: no tag, no call — and Enter still works", typeof r.w.plausible === "undefined" && r.w.sessionStorage.getItem("dyw_pass") === "1");
  }
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { wrongChain: true });
    const w = r.w;
    await settle(w, () => /Cross to Polygon/.test(btnText(w)), 15000, "the switch");
    await H.sleep(800);
    ok("RT10 · WRONG CHAIN: 'Cross to Polygon' first — no Enter, no solo line, no pass",
       /Cross to Polygon/.test(btnText(w)) && !/Enter/.test(btnText(w)) && !shown($(w, "rite-doorline")) && w.sessionStorage.getItem("dyw_pass") === null, btnText(w));
  }
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { notConnected: true });
    const w = r.w;
    await settle(w, () => /Declare Yourself/.test(btnText(w)), 15000, "the connect button");
    ok("RT11 · NOT CONNECTED: 'Connect a Polygon wallet to play free.' and the connect button — no Enter, no pass",
       txt($(w, "rite-msg")) === "Connect a Polygon wallet to play free." && /Declare Yourself/.test(btnText(w)) && !/Enter/.test(btnText(w)) &&
       w.sessionStorage.getItem("dyw_pass") === null, txt($(w, "rite-msg")));
  }
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { noEthereum: true });
    const w = r.w;
    await settle(w, () => /Retry/.test(btnText(w)), 15000, "absence concluded");
    ok("RT12 · NO WALLET: the connect prompt, the install guidance and Retry — no Enter",
       txt($(w, "rite-msg")) === "Connect a Polygon wallet to play free." && /You carry no key\. Forge one — install a wallet, then Retry\./.test(txt($(w, "rite-line"))) &&
       /Retry/.test(btnText(w)) && w.sessionStorage.getItem("dyw_pass") === null, txt($(w, "rite-msg")) + " | " + txt($(w, "rite-line")));
  }
  {
    const c = await H.chainStore();
    await (await c.nft.mint(c.player.address)).wait();
    const r = await H.ritePage(c, c.player, { url: "https://divyayuddha.games/rite.html?utm_source=ig" });
    const w = r.w;
    await settle(w, () => /the hall of war/.test(btnText(w)), 15000, "the holder's Enter");
    ok("RT13 · a HOLDER is unchanged: 'You bear the mark. The door is yours.' + Enter 'the hall of war', no solo line, no second door, no presale link",
       txt($(w, "rite-msg")) === "You bear the mark. The door is yours." && btnText(w) === "Enterthe hall of war" && !shown($(w, "rite-doorline")) && !shown($(w, "rite-buyline")) &&
       !shown($(w, "rite-presale")));
    H.click(w, "#rite-action");
    ok("RT14 · …the holder's Enter sets the pass and fires NO solo_start", w.sessionStorage.getItem("dyw_pass") === "1" && plausibleCalls(w).length === 0, JSON.stringify(plausibleCalls(w)));
  }
  {
    // a non-holder whose presale voucher is live keeps Enter beside BUY YOUR COIN
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { allowlist: [{ wallet: c.player.address }] });
    const w = r.w;
    await settle(w, () => shown($(w, "rite-buy")), 15000, "the buy door");
    ok("RT15 · a live voucher shows BUY YOUR COIN and KEEPS the solo Enter", shown($(w, "rite-buy")) && shown($(w, "rite-action")) && /play solo/.test(btnText(w)));
  }

  // ── ruling 1: the seal cannot be READ (busy) — solo stands anyway ──
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { url: "https://divyayuddha.games/rite.html?utm_source=ig", ls: { "dy::readRpcUrl": "http://127.0.0.1:1" } });
    const w = r.w;
    await settle(w, () => /could not read your seal/.test(txt($(w, "rite-msg"))), 20000, "the busy state");
    ok("RT16 · Torana read FAILING on Polygon (busy): the busy line stays AND Enter 'play solo — free' stands",
       txt($(w, "rite-msg")) === "The gate could not read your seal." && btnText(w) === "Enterplay solo — free" && shown($(w, "rite-action")) &&
       /Read the seal again/.test(txt($(w, "rite-line"))) && !shown($(w, "rite-doorline")), btnText(w) + " | " + txt($(w, "rite-line")));
    H.click(w, "#rite-action"); H.click(w, "#rite-action");
    const calls = plausibleCalls(w);
    ok("RT17 · …Enter sets the pass and solo_start fires ONCE, tags only",
       w.sessionStorage.getItem("dyw_pass") === "1" && calls.length === 1 && calls[0][0] === "solo_start" &&
       JSON.stringify(calls[0][1]) === JSON.stringify({ props: { utm_source: "ig" } }), JSON.stringify(calls));
  }
  // ── ruling 2: the free claim switched on — it stands BESIDE Enter ──
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { claimOpen: true });
    const w = r.w;
    await settle(w, () => shown($(w, "rite-claim")), 15000, "the claim button");
    ok("RT18 · claimOpen on: a non-holder on Polygon sees BOTH the free-claim button and Enter",
       shown($(w, "rite-claim")) && /Take the Rite/.test(txt($(w, "rite-claim"))) && shown($(w, "rite-action")) && btnText(w) === "Enterplay solo — free",
       txt($(w, "rite-claim")) + " | " + btnText(w));
    H.click(w, "#rite-action");
    ok("RT19 · …and Enter still plays solo (the pass is set)", w.sessionStorage.getItem("dyw_pass") === "1");
  }
  {
    const c = await H.chainStore();
    const r1 = await H.ritePage(c, c.player, { claimOpen: true, wrongChain: true });
    await settle(r1.w, () => /Cross to Polygon/.test(btnText(r1.w)), 15000, "the switch");
    const r2 = await H.ritePage(c, c.player, { claimOpen: true, notConnected: true });
    await settle(r2.w, () => /Declare Yourself/.test(btnText(r2.w)), 15000, "the connect button");
    await H.sleep(600);
    ok("RT20 · claimOpen on + wrong chain / not connected: unchanged — no Enter, no claim button, no pass",
       /Cross to Polygon/.test(btnText(r1.w)) && !shown($(r1.w, "rite-claim")) && /Declare Yourself/.test(btnText(r2.w)) && !shown($(r2.w, "rite-claim")) &&
       r1.w.sessionStorage.getItem("dyw_pass") === null && r2.w.sessionStorage.getItem("dyw_pass") === null);
  }
  {
    // a holder with claimOpen on: the claim is never offered to someone who holds one
    const c = await H.chainStore();
    await (await c.nft.mint(c.player.address)).wait();
    const r = await H.ritePage(c, c.player, { claimOpen: true });
    await settle(r.w, () => /the hall of war/.test(btnText(r.w)), 15000, "the holder's Enter");
    ok("RT21 · claimOpen on + a HOLDER: the holder's Enter only, no claim button", !shown($(r.w, "rite-claim")));
  }

  // ── SITE-AUDIT-1 part 3: the approval copy is for REGISTERED wallets only ──
  const APPROVAL = /Checking for your approval|Approval usually appears|No mark on this wallet|begin at the register/;
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, {});
    const w = r.w;
    await settle(w, () => /play solo/.test(btnText(w)), 15000, "the solo Enter");
    await H.sleep(2500);                                    // the allowlist read lands and two would-be countdown ticks pass
    const page = txt($(w, "rite-msg")) + " | " + txt($(w, "rite-line"));
    ok("RT22 · an UNREGISTERED non-holder sees the solo line and Enter — no approval copy, no register door, no countdown",
       !APPROVAL.test(page) && txt($(w, "rite-msg")) === "" && !shown($(w, "rite-register")) && !$(w, "rite-countdown") &&
       ![...w.__timers.values()].includes(1000) &&            // and NO approval-countdown ticker is running at all
       shown($(w, "rite-presale")) && $(w, "rite-presale").getAttribute("href") === "register.html" &&
       $(w, "rite-presale").tagName === "A" && !$(w, "rite-presale").classList.contains("rite-btn") &&   // the quiet presale road
       /Register for the presale/.test(txt($(w, "rite-presale"))) && shown($(w, "rite-action")) &&
       shown($(w, "rite-doorline")) && /play solo/.test(btnText(w)), page);
  }
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { ls: { ["dy::presaleRegistered:" + c.player.address.toLowerCase()]: String(Date.now()) } });
    const w = r.w;
    await settle(w, () => /Checking for your approval/.test(txt($(w, "rite-line"))), 15000, "the approval countdown");
    await H.sleep(2200);
    ok("RT23 · a REGISTERED non-holder still sees the approval countdown (and the solo Enter beside it)",
       /Checking for your approval/.test(txt($(w, "rite-line"))) && /next check in 4[0-4]s/.test(txt($(w, "rite-line"))) && /play solo/.test(btnText(w)) &&
       [...w.__timers.values()].includes(1000) && !shown($(w, "rite-presale")),
       txt($(w, "rite-line")));
  }
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { allowlist: [{ wallet: c.player.address }] });
    const w = r.w;
    await settle(w, () => shown($(w, "rite-buy")), 15000, "the buy door");
    ok("RT24 · an APPROVED wallet: 'Your presale approval is live — buy DYC in your dashboard.' and no free-claim line",
       txt($(w, "rite-msg")) === "Your presale approval is live — buy DYC in your dashboard." && txt($(w, "rite-line")) === "" && shown($(w, "rite-buy")) &&
       !shown($(w, "rite-presale")),
       txt($(w, "rite-msg")) + " | " + txt($(w, "rite-line")));
  }
  ok("RT25 · the rite's no-script default line is 'Connect a Polygon wallet to play free.'",
     /<p id="rite-msg" class="rite-state-msg">Connect a Polygon wallet to play free\.<\/p>/.test(fs.readFileSync(path.join(SITE, "rite.html"), "utf8")));
  ok("RT26 · register.html records the wallet it puts into the form (the rite's registered signal)",
     /function markFilled\(addr\) \{[\s\S]{0,600}localStorage\.setItem\("dy::presaleRegistered:" \+ String\(addr\)\.toLowerCase\(\)/.test(fs.readFileSync(path.join(SITE, "register.html"), "utf8")));

  // ═══════════════ HT · THE HALL ═══════════════
  console.log("\n── HT · the Hall: the Torana still opens it ──");
  const c = await H.chainStore();
  const DEAD = "ws://127.0.0.1:1";
  {
    const h = await H.hall(DEAD, c.addrs.dyc, c.addrs.dyc, c.player, c.provider, { realGate: true, accessNFT: c.addrs.nft });
    const w = h.w;
    await settle(w, () => w.document.querySelector(".hall-gate .hall-gate-line"), 15000, "the gate screen");
    await H.sleep(1500);
    const root = txt($(w, "hall-root"));
    ok("HT1 · a connected NON-holder stops at the gate: the ruled sentence, then the second door to ../store.html#bundle",
       root.indexOf("Tables against other players need a Torana - solo play stays free.") === 0 &&
       /<a href="\.\.\/store\.html#bundle">Or buy it now: a Torana and 500 DYC for USD 20\.<\/a>/.test($(w, "hall-root").innerHTML), root);
    ok("HT2 · the retired 'To the presale' button is gone", root.indexOf("To the presale") < 0 && !w.document.querySelector(".hall-gate-door"));
    ok("HT3 · NO SOCKET is opened for a non-holder, and no pass is set", h.sockets.length === 0 && w.sessionStorage.getItem("dyw_pass") === null, "sockets " + h.sockets.length);
    H.teardown(h);
  }
  {
    const hc = await H.chainStore();
    await (await hc.nft.mint(hc.player.address)).wait();
    const h = await H.hall(DEAD, hc.addrs.dyc, hc.addrs.dyc, hc.player, hc.provider, { realGate: true, accessNFT: hc.addrs.nft });
    const w = h.w;
    await settle(w, () => /EVERY SEAT HERE IS HUMAN/.test(txt($(w, "hall-root"))), 15000, "the floor");
    ok("HT4 · a HOLDER is unchanged: the floor, the covenant, and the site pass", /EVERY SEAT HERE IS HUMAN/.test(txt($(w, "hall-root"))) &&
       !w.document.querySelector(".hall-gate") && w.sessionStorage.getItem("dyw_pass") === "1");
    H.teardown(h);
  }
  {
    const h = await H.hall(DEAD, c.addrs.dyc, c.addrs.dyc, c.player, c.provider, { realGate: true, accessNFT: c.addrs.nft, noEthereum: true });
    const w = h.w;
    await settle(w, () => w.document.querySelector(".hall-nowallet"), 15000, "the no-wallet card");
    const card = txt(w.document.querySelector(".hall-connect"));
    ok("HT5 · NO WALLET in the Hall: the rite's install guidance and Retry, not a dead Connect button",
       /Connect your wallet to enter the Hall\./.test(card) && /You carry no key\. Forge one — install a wallet, then Retry\./.test(card) &&
       txt($(w, "hall-connect")) === "Retry" && h.sockets.length === 0, card);
    H.teardown(h);
  }

  // ═══════════════ DG · WHAT DOES NOT MOVE ═══════════════
  console.log("\n── DG · the game redirect, the sync script and the demo are unchanged ──");
  // the BASE is the commit just before FREE-PLAY-1 rung 2 (found by its subject, so it stays right as commits land)
  const base = execFileSync("git", ["log", "-1", "--format=%H", "--grep=^FREE-PLAY-1 (rung 2)"], { cwd: SITE }).toString().trim();
  const ref = base ? base + "~1" : "HEAD";
  const head = (f) => execFileSync("git", ["show", ref + ":" + f], { cwd: SITE, maxBuffer: 64 * 1024 * 1024 }).toString();
  // SITE-AUDIT-1 re-applied the injected S3 block (the Store roundel relink), so the copy is compared OUTSIDE that
  // block: the game itself, the gate preamble and the stamp are unchanged since before FREE-PLAY-1.
  const outsideS3 = (t) => t.replace(/<!-- DYW-S3-SUPPRESS-START[\s\S]*?<!-- DYW-S3-SUPPRESS-END -->/, "<S3/>");
  // MINI-GAMES-1 (owner ruling 2026-10-14) re-synced the copy from game 49555c0: its ONLY change is the main-menu Daily
  // Puzzle plaque + its door, and the stamp 07c3530 -> 49555c0. Those exact pieces are taken out before comparing, so
  // ANY other drift in the copy still turns this red.
  const withoutDoor = (t) => t.replace(/      <button class="mode plaque-lg active" id="mode-daily">[^\n]*<\/button>\n/, "")
    .replace(/\/\* MINI-GAMES-1 R2 — THE DAILY PUZZLE DOOR[\s\S]*?\n\}\)\(\);\n/, "");
  // MINI-GAMES-1 Daily Puzzle Effects R2 (2026-10-15) re-synced from game 1fad925, then 6b8d0ea (the owner's two changes): the battle screen's puzzle mode (?puzzle=1) —
  // ONE guarded block above pump() + nine one-line guards, each undone here EXACTLY (any other drift still turns red).
  const withoutPuzzleMode = (t) => {
    const a = t.indexOf("\n/* ══ MINI-GAMES-1 · DAILY PUZZLE EFFECTS (R1)"), b = t.indexOf("\nfunction pump(){", a);
    let u = (a >= 0 && b > a) ? t.slice(0, a) + t.slice(b) : t;
    [["body.puzzle #gearbtn, body.puzzle #unbindbtn, body.puzzle #shieldbtn, body.puzzle header .title, body.puzzle header .roundbox{ display:none !important; }   /* MINI-GAMES-1 puzzle mode: no settings (speed is fixed), no shield/unbind (not puzzle moves), no header line or round label (owner ruling 2026-10-15) — the realm chip stays */\n", ""],
     [".filter(([k])=>!(PUZZLE_MODE && (k==='menu'||k==='battle')))", ""],
     [" loadSheets:(keys)=>(keys||[]).forEach(loadSheet) /* MINI-GAMES-1: the puzzle's own list */,", ""],
     ["  if (PUZZLE_MODE) pzActionStart(evStart);   // MINI-GAMES-1: time this action (start → its choreography released)\n", ""],
     ["layer.onclick=PUZZLE_MODE ? null : skipChoreo;   // MINI-GAMES-1: no tap-to-skip in a puzzle — every try plays in full", "layer.onclick=skipChoreo;"],
     ["  if (PUZZLE_MODE && !pzMay('card')) return;   // MINI-GAMES-1: one card play per try\n", ""],
     ["  if (PUZZLE_MODE){ pzPump(); return; }   // MINI-GAMES-1 puzzle mode: no AI, no conch, no relay — close the action, drive the reveal or report\n", ""],
     ["  if(PUZZLE_MODE) return;                   // MINI-GAMES-1: the puzzle page owns the result — no rewards, no result face\n", ""],
     ["else if (PUZZLE_MODE) puzzleBoot(); ", ""]].forEach(([x, y]) => { u = u.split(x).join(y); });
    return u;
  };
  // the gate's ONE new road (the Daily Puzzle's own frame), undone exactly — in the sync script and in the copy
  const withoutDailyFrame = (t) => t
    .replace(/\n  var dailyFrame = false; \/\* MINI-GAMES-1 Daily Puzzle Effects R2:[^\n]*\n  try \{ dailyFrame = [^\n]*\n/, "\n")
    .replace('if (!dailyFrame && !sessionStorage.getItem("dyw_pass")) {', 'if (!sessionStorage.getItem("dyw_pass")) {')
    .replace('} catch (e) { if (!dailyFrame) { location.replace("../rite.html"); return; } }', '} catch (e) { location.replace("../rite.html"); return; }')
    .replace(/\n    if \(dailyFrame\) return; \/\* MINI-GAMES-1: nor inside the Daily Puzzle's frame[^\n]*/, "");
  const nowCopy = withoutDailyFrame(withoutPuzzleMode(fs.readFileSync(path.join(SITE, "game/index.html"), "utf8")));
  ok("DG1 · game/ is unchanged since before FREE-PLAY-1 outside the injected S3 block — except the ruled Daily Puzzle door, the Daily Puzzle's battle mode (?puzzle=1) and its gate road (MINI-GAMES-1), and the stamp",
     outsideS3(head("game/index.html")) === outsideS3(withoutDoor(nowCopy)) && withoutDoor(nowCopy) !== nowCopy &&
     withoutPuzzleMode(fs.readFileSync(path.join(SITE, "game/index.html"), "utf8")).indexOf("PUZZLE_MODE") < 0 &&
     head("game/STAMP").trim() === "07c3530" && fs.readFileSync(path.join(SITE, "game/STAMP"), "utf8").trim() === "6b8d0ea");
  // SITE-AUDIT-1 grew the sync script (GAME_REF + the Store relink); the GATE it injects must not have moved
  const gateBlock = (t) => (t.match(/<!-- DYW-GATE-START[\s\S]*?<!-- DYW-S3-SUPPRESS-START/) || [""])[0];
  const shNow = fs.readFileSync(path.join(SITE, "scripts/sync_game.sh"), "utf8"), copyNow = fs.readFileSync(path.join(SITE, "game/index.html"), "utf8");
  ok("DG2 · the sync script's gate preamble is unchanged since before FREE-PLAY-1 except ONE ruled road (the Daily Puzzle's own frame skips the pass and the gem); a passless visit still goes to the rite",
     gateBlock(head("scripts/sync_game.sh")) === withoutDailyFrame(gateBlock(shNow)) && gateBlock(shNow) !== withoutDailyFrame(gateBlock(shNow)) && gateBlock(head("scripts/sync_game.sh")).length > 200 &&
     /if \(!dailyFrame && !sessionStorage\.getItem\("dyw_pass"\)\) \{ location\.replace\("\.\.\/rite\.html"\); return; \}/.test(copyNow) &&
     /dailyFrame = window\.top !== window && \/\[\?&\]puzzle=1\(&\|\$\)\/\.test\(location\.search\) && window\.parent\.location\.origin === location\.origin && \/\^\\\/play\\\/daily\\\/\/\.test\(window\.parent\.location\.pathname\)/.test(copyNow));
  const demo = fs.readFileSync(path.join(SITE, "demo/index.html"), "utf8"), demoHead = head("demo/index.html");
  ok("DG3 · the demo still seeds the pass and its mark the same way; ONLY its button changed ('Play free' → the rite)",
     demo.replace('<a class="demo-cta" href="../rite.html">Play free</a>', '<a class="demo-cta" href="../index.html">Get Access</a>')
       .replace("../game/index.html?v=6b8d0ea", "../game/index.html?v=07c3530") === demoHead &&   // the stamp follows the MINI-GAMES-1 re-syncs
     /sessionStorage\.setItem\("dyw_pass", "1"\)/.test(demo) && /sessionStorage\.setItem\("dyw_demo", "1"\)/.test(demo));

  // ═══════════════ ST · THE STAMPS ═══════════════
  console.log("\n── ST · the stamps ──");
  const rite = fs.readFileSync(path.join(SITE, "rite.html"), "utf8"), hallHtml = fs.readFileSync(path.join(SITE, "mp/hall.html"), "utf8");
  ok("ST1 · rite.html loads js/solotrack.js?v=t1 (after wallet.js, before the page's own script)",
     /<script src="js\/wallet\.js\?v=s1r"><\/script>\s*<script src="js\/solotrack\.js\?v=t1"><\/script>\s*<script>/.test(rite));
  ok("ST2 · mp/hall.html loads hall.js?v=h35 (the gate screen moved, then the stake parse)", /<script src="hall\.js\?v=h35"><\/script>/.test(hallHtml));

  console.log("\n" + (fail ? "✖ " + fail + " FAILED of " + (pass + fail) : "ALL GREEN — " + pass + "/" + pass));   // the runner's own format
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("freeplay suite crashed:", e); process.exit(1); });
