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
    // GUEST-PLAY-1 (owner ruling 2026-10-26): solo_start moved to the player's FIRST BATTLE (the game copy's injected block,
    //   tests/suites/guestplay.js) — the rite's Enter fires nothing now, so it can never count twice
    ok("RT5 · Enter fires NO solo_start any more (it moved to the first battle, in the game copy)", calls.length === 0, JSON.stringify(calls));
    ok("RT6 · …the tags the game's tag will read are the utm values ONLY — no address, no holder flag, nothing else",
       JSON.stringify(w.DYSoloTrack._tags()) === JSON.stringify({ utm_source: "ig", utm_medium: "bio", utm_campaign: "free" }) &&
       blob.indexOf(c.player.address.toLowerCase()) < 0 && !/holder|torana|0x[0-9a-f]{8}/.test(JSON.stringify(w.DYSoloTrack._tags())), JSON.stringify(w.DYSoloTrack._tags()));
    ok("RT7 · the tags rode the store's own sessionStorage key (a visit tagged on either page carries through)",
       JSON.parse(w.sessionStorage.getItem("dystore::utm")).utm_source === "ig");
  }
  {
    // a tagged value shaped like an address never travels
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { url: "https://divyayuddha.games/rite.html?utm_source=0x" + "ab".repeat(20) + "&utm_medium=x" });
    await settle(r.w, () => /play solo/.test(btnText(r.w)), 15000, "the solo Enter");
    H.click(r.w, "#rite-action");
    ok("RT8 · an address smuggled into a utm tag is dropped (only utm_medium would travel)",
       JSON.stringify(r.w.DYSoloTrack._tags()) === JSON.stringify({ utm_medium: "x" }) && plausibleCalls(r.w).length === 0, JSON.stringify(r.w.DYSoloTrack._tags()));
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
    ok("RT11 · NOT CONNECTED (GUEST-PLAY-1): '" + "Play free — no wallet needed. Connect a Polygon wallet only to sit at the Hall's tables." + "', the connect button AND 'Play free / no wallet needed' to the game — no Enter",
       txt($(w, "rite-msg")) === "Play free — no wallet needed. Connect a Polygon wallet only to sit at the Hall's tables." && /Declare Yourself/.test(btnText(w)) && !/Enter/.test(btnText(w)) &&
       shown($(w, "rite-play")) && txt($(w, "rite-play")) === "Play freeno wallet needed" && /^game\/index\.html\?v=[0-9a-f]{7}$/.test($(w, "rite-play").getAttribute("href")), txt($(w, "rite-msg")));
  }
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { noEthereum: true });
    const w = r.w;
    await settle(w, () => /Retry/.test(btnText(w)), 15000, "absence concluded");
    ok("RT12 · NO WALLET (GUEST-PLAY-1): the new line, the install guidance and Retry — AND 'Play free' to the game; no Enter",
       txt($(w, "rite-msg")) === "Play free — no wallet needed. Connect a Polygon wallet only to sit at the Hall's tables." && /You carry no key\. Forge one — install a wallet, then Retry\./.test(txt($(w, "rite-line"))) &&
       /Retry/.test(btnText(w)) && shown($(w, "rite-play")), txt($(w, "rite-msg")) + " | " + txt($(w, "rite-line")));
  }
  {
    const c = await H.chainStore();
    await (await c.nft.mint(c.player.address)).wait();
    const r = await H.ritePage(c, c.player, { url: "https://divyayuddha.games/rite.html?utm_source=ig" });
    const w = r.w;
    await settle(w, () => /the hall of war/.test(btnText(w)), 15000, "the holder's Enter");
    ok("RT13 · a HOLDER is unchanged: 'You bear the mark. The door is yours.' + Enter 'the hall of war', no solo line, no second door, no presale buy door",
       txt($(w, "rite-msg")) === "You bear the mark. The door is yours." && btnText(w) === "Enterthe hall of war" && !shown($(w, "rite-doorline")) && !shown($(w, "rite-buyline")) &&
       !shown($(w, "rite-buy")));
    H.click(w, "#rite-action");
    ok("RT14 · …the holder's Enter sets the pass and fires NO solo_start", w.sessionStorage.getItem("dyw_pass") === "1" && plausibleCalls(w).length === 0, JSON.stringify(plausibleCalls(w)));
  }
  {
    // ICO-SIMPLE-1 — the presale needs no form and no approval: EVERY non-holder keeps Enter beside BUY DYC
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, {});
    const w = r.w;
    await settle(w, () => shown($(w, "rite-buy")), 15000, "the buy door");
    ok("RT15 · a non-holder (no voucher, never registered) sees BUY DYC → the dashboard's buy panel, and KEEPS the solo Enter",
       shown($(w, "rite-buy")) && txt($(w, "rite-buy")) === "BUY DYC" && $(w, "rite-buy").getAttribute("href") === "dashboard.html#buy-panel" &&
       shown($(w, "rite-action")) && /play solo/.test(btnText(w)));
  }

  // ── ruling 1: the seal cannot be READ (busy) — solo stands anyway ──
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { url: "https://divyayuddha.games/rite.html?utm_source=ig", ls: { "dy::readRpcUrl": "http://127.0.0.1:1" } });
    const w = r.w;
    await settle(w, () => /could not read your seal/.test(txt($(w, "rite-msg"))), 20000, "the busy state");
    ok("RT16 · Torana read FAILING on Polygon (busy): the busy line stays AND Enter 'play solo — free' stands",
       txt($(w, "rite-msg")) === "We couldn't check your Torana right now — try again." && btnText(w) === "Enterplay solo — free" && shown($(w, "rite-action")) &&
       /Try again/.test(txt($(w, "rite-line"))) && !shown($(w, "rite-doorline")), btnText(w) + " | " + txt($(w, "rite-line")));
    H.click(w, "#rite-action"); H.click(w, "#rite-action");
    const calls = plausibleCalls(w);
    ok("RT17 · …Enter takes the player in and fires NO solo_start (GUEST-PLAY-1: the first battle fires it); the visit's tags stay in the session",
       calls.length === 0 && JSON.stringify(w.DYSoloTrack._tags()) === JSON.stringify({ utm_source: "ig" }), JSON.stringify(calls));
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

  // ── ICO-SIMPLE-1 (owner rulings 2026-10-25): no form, no approval — the old register road is gone for everyone ──
  const APPROVAL = /Checking for your approval|Approval usually appears|No mark on this wallet|begin at the register|presale approval is live|Register for the presale|REGISTER FOR THE PRESALE/;
  const OPEN = "The presale is open to every wallet — buy DYC in your dashboard.";
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, {});
    const w = r.w;
    await settle(w, () => shown($(w, "rite-buy")), 15000, "the buy door");
    await H.sleep(2500);                                    // any would-be read or countdown tick would land in this time
    const page = txt($(w, "rite-msg")) + " | " + txt($(w, "rite-line"));
    ok("RT22 · a non-holder sees '" + OPEN + "' with BUY DYC — no approval copy, no register door, no countdown, no allowlist read",
       txt($(w, "rite-msg")) === OPEN && txt($(w, "rite-line")) === "" && !APPROVAL.test(page) && !$(w, "rite-register") && !$(w, "rite-presale") &&
       !$(w, "rite-countdown") && ![...w.__timers.values()].includes(1000) && !w.__fetches.some((u) => /allowlist/.test(u)) &&
       shown($(w, "rite-buy")) && shown($(w, "rite-doorline")) && /play solo/.test(btnText(w)), page);
  }
  {
    const c = await H.chainStore();
    const r = await H.ritePage(c, c.player, { ls: { ["dy::presaleRegistered:" + c.player.address.toLowerCase()]: String(Date.now()) } });
    const w = r.w;
    await settle(w, () => shown($(w, "rite-buy")), 15000, "the buy door");
    await H.sleep(2200);
    ok("RT23 · a wallet that registered under the OLD form is treated like everyone: the same buy door and line, no countdown",
       txt($(w, "rite-msg")) === OPEN && !APPROVAL.test(txt($(w, "rite-line"))) && ![...w.__timers.values()].includes(1000) && shown($(w, "rite-buy")),
       txt($(w, "rite-msg")) + " | " + txt($(w, "rite-line")));
  }
  const riteSrc = fs.readFileSync(path.join(SITE, "rite.html"), "utf8");
  ok("RT24 · none of the old registration/approval sentences survive anywhere in rite.html (and it never reads the allowlist)",
     !APPROVAL.test(riteSrc) && riteSrc.indexOf("BUY YOUR COIN") < 0 && riteSrc.indexOf("register.html") < 0 && !/allowlist\.json|\/allowlist"/.test(riteSrc));
  ok("RT25 · the rite's no-script default line is the GUEST-PLAY-1 line ('Play free — no wallet needed. …')",
     /<p id="rite-msg" class="rite-state-msg">Play free — no wallet needed\. Connect a Polygon wallet only to sit at the Hall's tables\.<\/p>/.test(riteSrc));
  const regSrc = fs.readFileSync(path.join(SITE, "register.html"), "utf8");
  ok("RT26 · register.html is a REDIRECT to the dashboard's buy panel (meta refresh + location.replace), with no form and no Google Form link",
     /http-equiv="refresh" content="0; url=dashboard\.html#buy-panel"/.test(regSrc) && /location\.replace\("dashboard\.html#buy-panel"\)/.test(regSrc) &&
     !/forms\.gle|docs\.google\.com\/forms|<iframe|<form/.test(regSrc));

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
  // GUEST-PLAY-1 (owner ruling 2026-10-26) removed the courtesy redirect and added the solo_start tag to the injected
  // preamble. Both are undone here EXACTLY (any other drift in the preamble still turns red).
  const withoutGuestPlay = (t) => t
    .replace('  /* GUEST-PLAY-1 (owner ruling 2026-10-26): free play needs no wallet and no pass - the courtesy redirect to the rite is\n     GONE. The Hall keeps its own gate (wallet + Torana) and the match server its own check; neither lives here. */\n',
      '  try {\n    if (!dailyFrame && !sessionStorage.getItem("dyw_pass")) { location.replace("../rite.html"); return; }\n  } catch (e) { if (!dailyFrame) { location.replace("../rite.html"); return; } }\n')
    .replace(/\n  \/\* GUEST-PLAY-1 — THE solo_start TAG[\s\S]*?  else wrapStarts\(\);/, "");
  const copyId = () => require("crypto").createHash("sha256").update(fs.readFileSync(path.join(SITE, "game/index.html"))).digest("hex").slice(0, 7);
  const outsideS3 = (t) => t.replace(/<!-- DYW-S3-SUPPRESS-START[\s\S]*?<!-- DYW-S3-SUPPRESS-END -->/, "<S3/>");
  // MINI-GAMES-1 (owner ruling 2026-10-14) re-synced the copy from game 49555c0: its ONLY change is the main-menu Daily
  // Puzzle plaque + its door, and the stamp 07c3530 -> 49555c0. Those exact pieces are taken out before comparing, so
  // ANY other drift in the copy still turns this red.
  const withoutDoor = (t) => t.replace(/      <button class="mode plaque-lg active" id="mode-daily">[^\n]*<\/button>\n/, "")
    .replace(/\/\* MINI-GAMES-1 R2 — THE DAILY PUZZLE DOOR[\s\S]*?\n\}\)\(\);\n/, "")
    // MINI-GAMES-2 (owner ruling 2026-10-16) re-synced from game ad978f0: the Smriti plaque right after Daily Puzzle + its door, undone exactly
    .replace(/      <button class="mode plaque-lg active" id="mode-smriti">[^\n]*<\/button>\n/, "")
    .replace(/\/\* MINI-GAMES-2 — THE SMRITI DOOR[\s\S]*?\n\}\)\(\);\n/, "");
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
     ["else if (PUZZLE_MODE) puzzleBoot(); ", ""],
     // GAME-HEADER-1 (owner ruling 2026-10-15): the live game is no longer a prototype — the title and the header line, undone exactly
     ["<title>Divya Yuddha — Battle of the Celestials</title>", "<title>Divya Yuddha — Prototype v0.1</title>"],
     ['<small id="facline">DEVA vs DEVA</small>', '<small id="facline">PROTOTYPE · DEVA vs DEVA</small>'],
     ["fl.textContent=`${FAC_LABEL(currentFactions.p0)} vs ${FAC_LABEL(currentFactions.p1)}`;   // GAME-HEADER-1 (owner ruling 2026-10-15): no longer a prototype", "fl.textContent=`PROTOTYPE · ${FAC_LABEL(currentFactions.p0)} vs ${FAC_LABEL(currentFactions.p1)}`;"]].forEach(([x, y]) => { u = u.split(x).join(y); });
    return u;
  };
  // the gate's ONE new road (the Daily Puzzle's own frame), undone exactly — in the sync script and in the copy
  const withoutDailyFrame = (t) => t
    .replace(/\n  var dailyFrame = false; \/\* MINI-GAMES-1 Daily Puzzle Effects R2:[^\n]*\n  try \{ dailyFrame = [^\n]*\n/, "\n")
    .replace('if (!dailyFrame && !sessionStorage.getItem("dyw_pass")) {', 'if (!sessionStorage.getItem("dyw_pass")) {')
    .replace('} catch (e) { if (!dailyFrame) { location.replace("../rite.html"); return; } }', '} catch (e) { location.replace("../rite.html"); return; }')
    .replace(/\n    if \(dailyFrame\) return; \/\* MINI-GAMES-1: nor inside the Daily Puzzle's frame[^\n]*/, "");
  // GROW-COUNT-1 (owner rulings 2026-11-03): the player counter's tag, first in the injected block, and the game's three
  // guarded hooks (game 6b946e0) — each undone exactly (any other drift still turns red)
  const withoutCounter = (t) => t
    .replace(/<!-- GROW-COUNT-1 \(owner rulings 2026-11-03\): the site's player counter, loaded FIRST[^\n]*\n[^\n]*-->\n<script src="\.\.\/play\/shared\/count\.js\?v=\w+"><\/script>\n/, "")
    .replace(/\n  try\{ window\.DY_COUNT && window\.DY_COUNT\.finished\('(match|story|hall)'\); \}catch\(e\)\{\}   \/\/ GROW-COUNT-1[^\n]*/g, "");
  // GROWTH-1 (owner rulings 2026-11-06): the game's play-free route (#5/#6), its deferred VFX preload (#16) and Stage 2's CHALLENGE A FRIEND (#10/#11) — the hunks of
  // the game diff, generated from it and undone EXACTLY — and the GROWTH-1 block of the injected preamble (any other drift still turns red)
  const GROWTH1_GAME = [["  VFX.init(); VFX.resize();      // size the impact-VFX canvas to the now-visible board\n  applyVfxQuality();   // T90: resolve the player's VFX-quality rung before the fetch\n  armVfxPreload();     // GROWTH-1 #16 (owner ruling 2026-11-06): the painted kit loads AFTER the first playable turn (pump), never ahead of it — the first match must be playable fast on 4G; the procedural fallback covers the gap (T67's own law)\n  VFX.loadMatchSheets(currentFactions.p0, currentFactions.p1);   // T81: lazy — only THIS match's factions' landing sheets (+ the Deva row plates if a Deva is in the match). Loads during the mulligan window.\n", "  VFX.init(); VFX.resize();      // size the impact-VFX canvas to the now-visible board\n  VFX.preloadSprites();          // T67: load + tint the painted VFX kit at MATCH START (async, non-blocking; mulligan proceeds; procedural fallback covers the load gap)\n  applyVfxQuality();   // T90: resolve the player's VFX-quality rung before the fetch\n  VFX.loadMatchSheets(currentFactions.p0, currentFactions.p1);   // T81: lazy — only THIS match's factions' landing sheets (+ the Deva row plates if a Deva is in the match). Loads during the mulligan window.\n"], ["  Audio2.musicDuck(false); Audio2.playTrack('battle'); conchPending=true;   // release the intro duck INTO the menu→battle crossfade (the crossfade + conch stay the hinge)\n  showRealmIntro(); render(); VFX.init(); VFX.resize(); applyVfxQuality(); armVfxPreload(); VFX.loadMatchSheets(currentFactions.p0, currentFactions.p1);   // T81 lazy match sheets at story-match start; the T67 sprite kit — GROWTH-1 #16: deferred to the first playable turn, as quick play\n  if (G.mulliganCount>0) storyBeginMulligan();   // ch4/ch5: run the mulligan phase (teaches it) with the pre-match Brihaspati line\n", "  Audio2.musicDuck(false); Audio2.playTrack('battle'); conchPending=true;   // release the intro duck INTO the menu→battle crossfade (the crossfade + conch stay the hinge)\n  showRealmIntro(); render(); VFX.init(); VFX.resize(); VFX.preloadSprites(); applyVfxQuality(); VFX.loadMatchSheets(currentFactions.p0, currentFactions.p1);   // T67 sprite kit + T81 lazy match sheets at story-match start too\n  if (G.mulliganCount>0) storyBeginMulligan();   // ch4/ch5: run the mulligan phase (teaches it) with the pre-match Brihaspati line\n"], ["\n/* GROWTH-1 #16 — ONE deferred VFX preload per match: the painted kit (~1.75 MB) is armed at match start (quick play + story) and\n   fired by pump the first time the human may act (their first playable turn). The match's own lazy sheets (T81) still load at\n   match start. preloadSprites is idempotent (sprLoadN), so a re-arm costs nothing. */\nlet vfxPreloadArmed=false;\nfunction armVfxPreload(){ vfxPreloadArmed=true; }\nfunction fireVfxPreload(){ if(!vfxPreloadArmed) return; vfxPreloadArmed=false; VFX.preloadSprites(); }\nfunction pump(){\n", "\nfunction pump(){\n"], ["  if (Wire){ wireDrain(); return; }               // BW1 — the relay drives every move; the AI is NEVER entered for a wire seat\n  if (G.turn===ME && !G.players[ME].passed) fireVfxPreload();   // GROWTH-1 #16: the first playable turn → now the painted kit loads\n  if (Story && storyMidPending()){ storyShowMid(); return; }   // mid-round story panel (e.g. ch2 after R1) — pause, then re-pump\n", "  if (Wire){ wireDrain(); return; }               // BW1 — the relay drives every move; the AI is NEVER entered for a wire seat\n  if (Story && storyMidPending()){ storyShowMid(); return; }   // mid-round story panel (e.g. ch2 after R1) — pause, then re-pump\n"], ["  syncBattleLogButton();   // GL-3 — VIEW BATTLE LOG on the vs-AI face (story never reaches here: R3)\n  syncChallengeButton();   // GROWTH-1 Stage 2 — CHALLENGE A FRIEND, on a win vs AI only\n  $('gameover').classList.remove('hidden');\n", "  syncBattleLogButton();   // GL-3 — VIEW BATTLE LOG on the vs-AI face (story never reaches here: R3)\n  $('gameover').classList.remove('hidden');\n"], ["\n/* GROWTH-1 Stage 2 (owner rulings 2026-11-06, #10/#11) — CHALLENGE A FRIEND after a win vs AI. The approved text and a link\n   to the site's home page carrying the sharer's own first-touch source (the site's share helper, DY_SHARE, in its copy of this\n   game) + utm_medium=share + utm_campaign=challenge — no personal id. Standalone (github.io) there is no helper and no counter:\n   the link still goes to the site, tagged as an untracked (\"direct\") share. The phone's share sheet, else the clipboard; a\n   cancelled share is not a share. Created once and re-synced, because render() re-runs showGameOver while the match is over. */\nconst CHALLENGE_TEXT = \"I just won a battle in Divya Yuddha. Think you can beat the AI? Play free:\";\nfunction challengeLink(){ try{ if(window.DY_SHARE) return window.DY_SHARE.link('challenge'); }catch(e){}\n  return 'https://divyayuddha.games/?utm_source=direct&utm_medium=share&utm_campaign=challenge'; }\nfunction challengeShare(text, url){\n  if(window.DY_SHARE) return window.DY_SHARE.share({ text, url });\n  const both = text+' '+url, nav = navigator;\n  const copy = ()=> (nav.clipboard && nav.clipboard.writeText) ? nav.clipboard.writeText(both).then(()=>'copied', ()=>'failed') : Promise.resolve('failed');\n  if(typeof nav.share==='function') return nav.share({ text, url }).then(()=>'shared', e=> (e && e.name==='AbortError') ? 'cancelled' : copy());\n  return copy();\n}\nfunction challengeFriend(){\n  challengeShare(CHALLENGE_TEXT, challengeLink()).then(r=>{\n    if(r!=='shared' && r!=='copied') return;\n  try{ window.DY_COUNT && window.DY_COUNT.shared('challenge'); }catch(e){}   // GROWTH-1 #11 (owner ruling 2026-11-06): the fourth counter line — a share the player made (DY_COUNT exists only in the site's copy)\n    if(r==='copied') toastMute('Link copied');\n  });\n}\nfunction syncChallengeButton(){\n  let b=$('go-challenge');\n  if(!b){ b=document.createElement('button'); b.id='go-challenge'; b.type='button'; b.className='go-alt'; b.textContent='CHALLENGE A FRIEND'; b.onclick=challengeFriend;\n    const row=document.querySelector('#gameover .go-btns'); if(row) row.insertBefore(b, row.children[1]||null); }\n  b.classList.toggle('hidden', !(G && G.winner===ME));\n}\n\n/* ── T62 — INTRO TRAILER (R-A..R-E) ─────────────────────────────────────────────────────────────\n", "\n/* ── T62 — INTRO TRAILER (R-A..R-E) ─────────────────────────────────────────────────────────────\n"], ["const INTRO_STALL_MS = 4000;\n/* GROWTH-1 #5/#6 (owner rulings 2026-11-06) — THE PLAY-FREE ROUTE. The site's landing button opens /game/ with ?play=free:\n   no trailer (R-A/R-B re-ruled for THIS route only — every other launch still meets it), straight to the faction pick,\n   the easiest level preselected (Beginner) for this visit only — the player's saved choice is not overwritten. The\n   faction pick's back arrow still leads to the game's home, so nothing else is hidden from them. */\nconst PLAY_FREE = /[?&]play=free(&|$)/.test(location.search);\nfunction playFreeEntry(){\n  showFactionSelect();\n  selectedDifficulty='beginner'; renderDiffSelector();\n}\nfunction introLaunchCount(){ let n=0; try{ n=parseInt(localStorage.getItem('dy_intro_launches')||'0',10)||0; }catch(e){ n=0; }\n", "const INTRO_STALL_MS = 4000;\nfunction introLaunchCount(){ let n=0; try{ n=parseInt(localStorage.getItem('dy_intro_launches')||'0',10)||0; }catch(e){ n=0; }\n"], ["  const ov=$('introv'); if(!ov){ done(); return; }                       // no overlay in the DOM → straight to home\n  if(PLAY_FREE){ ov.classList.add('hidden'); playFreeEntry(); return; }   // GROWTH-1 #5/#6: the play-free route skips the trailer → the faction pick\n  let finished=false, vid=null, stall=null;\n", "  const ov=$('introv'); if(!ov){ done(); return; }                       // no overlay in the DOM → straight to home\n  let finished=false, vid=null, stall=null;\n"], ["VFX.init();\n/* GROWTH-1 #16 (owner ruling 2026-11-06) retired T67b's page-load preload: ~1.75 MB of painted kit no longer competes with the\n   first match on 4G. It loads after the first playable turn (armVfxPreload / pump); the wire and puzzle roads keep their own calls.\n   T67b's note, kept for the record: preload the painted kit at PAGE LOAD (not match start) — sprites get the whole intro→landing→faction-select→mulligan window to load, so they're ready before the first play even on slow device connections (fixes the match-start race that made effects fire \"occasionally/never\" cold). Async, non-blocking; idempotent so the startGame call no-ops. */\nif (WIRE_MODE) wireBoot(); else if (PUZZLE_MODE) puzzleBoot(); else playIntro(showLanding);   // R-A: the intro gates every launch; showLanding is the single home entry. BW1 (R5): ?wire=1 skips intro + landing and waits for the Hall\n", "VFX.init();\nVFX.preloadSprites();   // T67b: preload the painted kit at PAGE LOAD (not match start) — sprites get the whole intro→landing→faction-select→mulligan window to load, so they're ready before the first play even on slow device connections (fixes the match-start race that made effects fire \"occasionally/never\" cold). Async, non-blocking; idempotent so the startGame call no-ops.\nif (WIRE_MODE) wireBoot(); else if (PUZZLE_MODE) puzzleBoot(); else playIntro(showLanding);   // R-A: the intro gates every launch; showLanding is the single home entry. BW1 (R5): ?wire=1 skips intro + landing and waits for the Hall\n"]];
  const withoutGrowth1 = (t) => { let u = t.replace(/<!-- DYW-GROWTH1-START[\s\S]*?<!-- DYW-GROWTH1-END -->\n/, ""); GROWTH1_GAME.forEach(([n, o]) => { u = u.split(n).join(o); }); return u; };
  const nowCopy = withoutCounter(withoutDailyFrame(withoutPuzzleMode(withoutGuestPlay(withoutGrowth1(fs.readFileSync(path.join(SITE, "game/index.html"), "utf8"))))));   // GROWTH-1 first: its hunks carry the raw boot line as context
  ok("DG1 · game/ is unchanged since before FREE-PLAY-1 outside the injected S3 block — except the ruled Daily Puzzle and Smriti doors (MINI-GAMES-1/-2), the Daily Puzzle's battle mode (?puzzle=1) and its gate road (MINI-GAMES-1), GUEST-PLAY-1's preamble (no redirect, the solo tag), the player counter's tag and three hooks (GROW-COUNT-1), and the stamp (now the copy id)",
     outsideS3(head("game/index.html")) === outsideS3(withoutDoor(nowCopy)) && withoutDoor(nowCopy) !== nowCopy &&
     withoutPuzzleMode(fs.readFileSync(path.join(SITE, "game/index.html"), "utf8")).indexOf("PUZZLE_MODE") < 0 &&
     head("game/STAMP").trim() === "07c3530" && fs.readFileSync(path.join(SITE, "game/STAMP"), "utf8").trim() === copyId());
  // SITE-AUDIT-1 grew the sync script (GAME_REF + the Store relink); the GATE it injects must not have moved
  const gateBlock = (t) => (t.match(/<!-- DYW-GATE-START[\s\S]*?<!-- DYW-S3-SUPPRESS-START/) || [""])[0];
  const shNow = fs.readFileSync(path.join(SITE, "scripts/sync_game.sh"), "utf8"), copyNow = fs.readFileSync(path.join(SITE, "game/index.html"), "utf8");
  ok("DG2 · the sync script's gate preamble is unchanged since before FREE-PLAY-1 except the ruled roads (the Daily Puzzle's own frame; GUEST-PLAY-1: no redirect for anyone, the solo tag; GROW-COUNT-1: the player counter's tag); a passless visit is NOT sent to the rite",
     gateBlock(head("scripts/sync_game.sh")) === withoutCounter(withoutDailyFrame(withoutGuestPlay(withoutGrowth1(gateBlock(shNow))))) && gateBlock(shNow) !== withoutGuestPlay(gateBlock(shNow)) && gateBlock(head("scripts/sync_game.sh")).length > 200 &&
     copyNow.indexOf('location.replace("../rite.html")') < 0 && copyNow.indexOf('sessionStorage.getItem("dyw_pass")') < 0 &&
     /dailyFrame = window\.top !== window && \/\[\?&\]puzzle=1\(&\|\$\)\/\.test\(location\.search\) && window\.parent\.location\.origin === location\.origin && \/\^\\\/play\\\/daily\\\/\/\.test\(window\.parent\.location\.pathname\)/.test(copyNow));
  const demo = fs.readFileSync(path.join(SITE, "demo/index.html"), "utf8"), demoHead = head("demo/index.html");
  ok("DG3 · the demo still seeds the pass and its mark the same way; ONLY its button changed ('Play free' → the game since GUEST-PLAY-1; it went to the rite)",
     demo.replace(/<a class="demo-cta" href="\.\.\/game\/index\.html\?v=[0-9a-f]{7}">Play free<\/a>/, '<a class="demo-cta" href="../index.html">Get Access</a>')
       .replace(/\.\.\/game\/index\.html\?v=[0-9a-f]{7}/, "../game/index.html?v=07c3530") === demoHead &&   // the stamp follows every re-sync
     /sessionStorage\.setItem\("dyw_pass", "1"\)/.test(demo) && /sessionStorage\.setItem\("dyw_demo", "1"\)/.test(demo));

  // ═══════════════ ST · THE STAMPS ═══════════════
  console.log("\n── ST · the stamps ──");
  const rite = fs.readFileSync(path.join(SITE, "rite.html"), "utf8"), hallHtml = fs.readFileSync(path.join(SITE, "mp/hall.html"), "utf8");
  ok("ST1 · rite.html loads js/solotrack.js?v=t1 (after wallet.js, before the page's own script)",
     /<script src="js\/wallet\.js\?v=s1x"><\/script>\s*<script src="js\/solotrack\.js\?v=t1"><\/script>\s*<script>/.test(rite));
  ok("ST2 · mp/hall.html loads hall.js?v=h38 (the gate screen moved, then the stake parse)", /<script src="hall\.js\?v=h38"><\/script>/.test(hallHtml));

  console.log("\n" + (fail ? "✖ " + fail + " FAILED of " + (pass + fail) : "ALL GREEN — " + pass + "/" + pass));   // the runner's own format
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("freeplay suite crashed:", e); process.exit(1); });
