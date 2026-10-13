"use strict";
// S-HALL-L3-FIX-1 (P7) — THE COPY LAW, PROVEN. docs/LOBBY_DESIGN.md section 11 enumerates exactly which lines are
// money-adjacent ruled copy. THE LAW block below asserts each of those, verbatim, doc → hall.js. A second advisory
// sweep lists every other quoted doc line and whether hall.js carries it literally — informational only, because
// the doc also sketches dynamic chips ("today: X of Y DYC remaining") and button text the UI legitimately upcases.
//
//   node mp/copyproof.js        (run from the site repo root)
//
// NOTE: no committed copy proof existed before this task — prior verification was manual. This makes it permanent.
const fs = require("fs");
const path = require("path");
const DOC = fs.readFileSync(path.resolve(__dirname, "..", "docs", "LOBBY_DESIGN.md"), "utf8");
const HALL = fs.readFileSync(path.resolve(__dirname, "hall.js"), "utf8");
// S-BUNDLE-1 — THE SECOND PAIR. This prover now covers two (doc, source) pairs, not one: the Hall's
// (LOBBY_DESIGN.md section 11 -> mp/hall.js, unchanged below) and the Store's (STORE_DESIGN.md section 11 ->
// js/store.js). One prover, two laws; neither can drift from its doc without turning this suite red.
const SDOC = fs.readFileSync(path.resolve(__dirname, "..", "docs", "STORE_DESIGN.md"), "utf8");
const STORE = fs.readFileSync(path.resolve(__dirname, "..", "js", "store.js"), "utf8");
// WINNINGS-4 — THE THIRD PAIR. The dashboard had no copy law at all until this rung, which made the most
// money-adjacent surface on the site the only unruled one. DASHBOARD_DESIGN_v1.md section 11 -> js/dashboard.js.
const DDOC = fs.readFileSync(path.resolve(__dirname, "..", "docs", "DASHBOARD_DESIGN_v1.md"), "utf8");
const DASH = fs.readFileSync(path.resolve(__dirname, "..", "js", "dashboard.js"), "utf8");
const RITE = fs.readFileSync(path.resolve(__dirname, "..", "rite.html"), "utf8");
const RULINGS = fs.readFileSync(path.resolve(__dirname, "..", "docs", "RULINGS_2026-08-27.md"), "utf8");
const INDEX = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
const DEMO = fs.readFileSync(path.resolve(__dirname, "..", "demo", "index.html"), "utf8");   // FREE-PLAY-1

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }

const norm = (s) => String(s).replace(/\s+/g, " ").trim().replace(/…/g, "...");
const deslot = (s) => norm(s).replace(/\[[^\]]*\]/g, "§");
const SRC = norm(HALL);
// a bracket slot is a concatenation break in the source ("Your " + dycOf(x) + " DYC ..."), so a ruled line is
// carried when each of its non-slot fragments appears IN ORDER in the normalised source.
function carriesIn(src, line, ci) {
  const hay = ci ? norm(src).toLowerCase() : norm(src);
  const parts = deslot(line).split("§").map(norm).filter((x) => x.length > 2).map((x) => (ci ? x.toLowerCase() : x));
  if (!parts.length) return false;
  let at = 0;
  for (const p of parts) { const i = hay.indexOf(p, at); if (i < 0) return false; at = i + p.length; }
  return true;
}
function carries(line, ci) {
  const hay = ci ? SRC.toLowerCase() : SRC;
  const parts = deslot(line).split("§").map(norm).filter((x) => x.length > 2).map((x) => (ci ? x.toLowerCase() : x));
  if (!parts.length) return false;
  let at = 0;
  for (const p of parts) { const i = hay.indexOf(p, at); if (i < 0) return false; at = i + p.length; }
  return true;
}
function inDoc(line) { return norm(DOC).indexOf(norm(line)) >= 0; }

// ── THE LAW: section 11's enumerated set, each line quoted from the doc it is ruled in.
const LAW = [
  ["2b covenant",        "EVERY SEAT HERE IS HUMAN."],
  // SITE-AUDIT-1 batch 2 (LOBBY_DESIGN amendment 2026-10-11) — the refund is a BUTTON, never "automatic"
  ["5 commitment",       "Your [50] DYC locks in escrow now. It returns in full if you cancel before anyone sits, or on a draw. The winner takes the pot minus the 5% platform fee. If a match is never settled, either player can refund both stakes here, 24 hours after it started - locked stakes can never be stranded."],
  ["5 commitment joiner", "Your [50] DYC locks in escrow and the match begins. A draw returns it in full. The winner takes the pot minus the 5% platform fee. If a match is never settled, either player can refund both stakes here, 24 hours after it started."],
  ["6 both-stakes",      "Once both stakes lock, the match begins."],
  ["7 friend-lock",      "private table - visible only by this code, and only [0xFRIEND...] can take the seat."],
  ["8c won",             "You won. Collect [95] DYC - [5] to the treasury."],
  ["8c settled",         "settled - [95] DYC in your wallet"],
  ["8c draw",            "A draw - both stakes return in full once either player collects the refund."],
  ["8c forfeit",         "Your opponent left the table. The pot is yours - collect [95] DYC."],
  ["8c win warning",     "Collect within 24 hours of the match start - after that, either player can refund both stakes instead."],
  ["8c draw now",        "Either player can collect the refund now."],
  ["8c unconfirmed",     "The result could not be confirmed. 24 hours after the match started, either player can refund both stakes here."],
  ["stakes head",        "Your stakes"],
  ["stakes open",        "Your [10] DYC table #[27] is waiting for an opponent."],
  ["stakes wait",        "Your [10] DYC is locked in match #[31]. Refund opens in [3h 10m]."],
  ["stakes refundable",  "Match #[31] was never settled - either player can refund both stakes now."],
  ["stakes lost",        "You lost match #[31] - the winner collects the pot."],
  ["stakes too early",   "Refund opens 24 hours after the match started - in [3h 10m]."],
  ["stakes unread",      "Couldn't read your stakes from the chain"],
  ["resume nothing locked", "a seat you started was taken or closed - nothing was locked, your DYC is still in your wallet."],
  ["resume finished",    "that match has already finished - check your wallet."],
  ["gate solo",          "Play solo (free) →"],
  ["8c free",            "no stakes at this table"],
  ["8d unopened table",  "Your [10] DYC is locked in escrow, but the table has not opened yet."],
  ["cancel moved-on",    "this table is no longer cancellable - the match has moved on"],
  ["friend reachability", "could not reach the table server - your code is fine, try again in a moment"],
  ["cross-account",      "this was prepared for another account - switch back to [0xA...] to finish it"],
  ["seated elsewhere",   "Your warrior is already seated - the battle is live in another window."],
  ["unsettled pots",     "You have [N] unsettled pots waiting - each one can be collected here."],
  ["9 limit set",        "Staked tables (friend challenges included) close for you whenever a stake would take today's net losses past this limit. Wins earlier in the day count against losses. The day resets at midnight UTC. Free tables stay open. Only you can set or change this."],
  ["9 limit block",      "This stake would take you past your daily limit - you can still lose [X] DYC today. It resets at midnight UTC."],
];
console.log("── THE LAW · section 11 enumerated ruled copy (doc → code) ──");
for (const [tag, line] of LAW) {
  ok(tag + " — in the doc", inDoc(line), line);
  ok(tag + " — carried verbatim by hall.js", carries(line, false), line);
}

console.log("\n── 8d · the line ruled 2026-09-08 ──");
ok("8d enumerated in the section 11 copy block", /unopened-table line\s*\(8d, amended 2026-09-08\)/.test(norm(DOC)));
ok("8d built from the record's stake (slot filled, not hardcoded)",
   /function STRAND_LOCKED\(stakeWei\)[^]*?dycOf\(stakeWei\)[^]*?DYC is locked in escrow, but the table has not opened yet\./.test(HALL));
ok("the 2026-09-08 amendment note is recorded", /AMENDMENT 2026-09-08 \(S-HALL-L3-FIX-1\)/.test(DOC));

console.log("\n── the moved-on cancel line ruled 2026-09-08b ──");
ok("enumerated in the section 11 copy block", /moved-on cancel line \(amended\s+2026-09-08b\)/.test(norm(DOC)));
ok("the 2026-09-08b amendment note is recorded", /AMENDMENT 2026-09-08b \(S-HALL-L3-FIX-2\)/.test(DOC));
ok("shown only on a confirmed non-OPEN escrow (state read, not a decode)",
   /readOpenState\(road, t\.escrowMatchId\)[^]*?st\.ok && st\.state !== 1[^]*?CANCEL_MOVED_ON/.test(HALL));

// ── ADVISORY: every other quoted doc line. Never fails the run; surfaces drift for a human to rule on.
console.log("\n── the friend-code reachability line ruled 2026-09-08c ──");
ok("enumerated in the section 11 copy block", /friend-code reachability line \(amended\s+2026-09-08c\)/.test(norm(DOC)));
ok("the 2026-09-08c amendment note is recorded", /AMENDMENT 2026-09-08c \(S-HALL-CODE-LOOKUP-1\)/.test(DOC));
ok("shown only on NO ANSWER, never on a null result",
   /if \(!r \|\| r\.unreachable\) \{ sheet\.ctx\.err = FRIEND_UNREACHABLE;/.test(HALL));

console.log("\n── the cross-account line ruled 2026-09-08d ──");
ok("enumerated in the section 11 copy block", /cross-account line \(amended 2026-09-08d\)/.test(norm(DOC)));
ok("the 2026-09-08d amendment note is recorded", /AMENDMENT 2026-09-08d \(S-HALL-ACCOUNT-1\)/.test(DOC));
ok("built from the address it belongs to (slot filled, not hardcoded)",
   /function CROSS_ACCOUNT\(addr\)[^]*?shortAddr\(addr\)[^]*?to finish it/.test(HALL));
ok("it passes through ceremonyMsg VERBATIM (never truncated or re-mapped)",
   /if \(e && e\.crossAccount\) return e\.message;/.test(HALL));
ok("the companion account-changed line is NOT enumerated in section 11",
   !/account changed - the Hall is now following/.test(norm(DOC).split("HONESTY TEXT")[1].split("WHAT THE HALL NEVER SHOWS")[0] || ""));

console.log("\n── the seated-elsewhere line ruled 2026-09-10a ──");
ok("enumerated in the section 11 copy block", /seated-elsewhere line \(amended\s+2026-09-10a\)/.test(norm(DOC)));
ok("the 2026-09-10a amendment note is recorded", /AMENDMENT 2026-09-10a \(S-HALL-ELSEWHERE-1\)/.test(DOC));
// THE STRUCTURAL GUARD: the line may render only on the SERVER'S word. Never from a table count, never from a
// local flag, and never remembered — the client's assignment is unconditional so the room-end frame clears it.
ok("it renders ONLY on the server's field, and the Hall never remembers it",
   /seatedElsewhere = \(v && v\.seatedElsewhere\) \|\| null;/.test(HALL) &&
   /seatedElsewhere \? '<div class="hall-empty-line state-line hall-seated-elsewhere">' \+ SEATED_ELSEWHERE_LINE/.test(HALL));

console.log("\n── the unsettled-pots header ruled 2026-09-10b ──");
ok("enumerated in the section 11 copy block", /unsettled-pots\s+header \(amended 2026-09-10b\)/.test(norm(DOC)));
ok("the 2026-09-10b amendment note is recorded", /AMENDMENT 2026-09-10b \(S-HALL-SLIP-LIST-1\)/.test(DOC));
// THE STRUCTURAL GUARD: the header is built from the LIVE count (slot filled, not hardcoded) and renders ONLY at
// two or more — at one, the lone-slip markup is what it always was.
ok("built from the live count of what is still OWED, and shown only at TWO OR MORE",
   /function SLIPS_HEADER\(n\) \{ return "You have " \+ n \+ " unsettled pots waiting/.test(HALL) &&
   /owed >= 2 \? '<div class="hall-slips-head state-line">' \+ SLIPS_HEADER\(owed\)/.test(HALL) &&
   /function owedCount\(list\)[\s\S]{0,220}!\(ss && ss\.settled\)/.test(HALL));

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// S-BUNDLE-1 — THE STORE'S LAW: docs/STORE_DESIGN.md section 11 -> js/store.js
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function inSDoc(line) { return norm(SDOC).indexOf(norm(line)) >= 0; }
const STORE_LAW = [
  ["P1 tile",            "A Torana and 500 DYC - fifty Bronze tables' worth - for a wallet that came to play."],
  ["P2 commitment",      "USD 20 goes to the house now. Your Torana and 500 DYC land in the same transaction, or nothing moves."],
  ["P3 top-up",          "500 DYC for USD 5, up to 2,000 a week. Play money, delivered now."],
  ["P4 cap reached",     "You have topped up [2,000] DYC this week - the window frees [on 19 Sep 2026]."],
  ["P5 smart account",   "This wallet is a smart account and cannot receive the Torana yet. Switch to a standard account (MetaMask: 'switch back to regular account') and try again. Nothing was signed."],
  ["P6 closed",          "The store is closed for now."],
  ["P6b sold out",       "The store is sold out for now."],
  ["P7 insufficient",    "Not enough [USDC] in this wallet - [USD 20] buys the bundle."],
  ["P8 generic refusal", "The store could not take this order - refresh and try again."],
  ["P9 holder's face",   "The bundle - a Torana and 500 DYC - is USD 20. You already hold yours."],
  ["P10 reading",        "Reading the store..."],
  ["P11 kept reading",   "Couldn't refresh just now - showing the last reading."],
  ["P12 pre-cast stop",  "Couldn't check this wallet just now - try again in a moment. Nothing was signed."],
  // AFFILIATE-1 rung 3 — Torana Invites on the store
  ["P13 invited-by",     "Invited by [CODE]"],
  ["P15 recorded",       "Invite recorded."],
  ["P16 not recorded",   "The invite couldn't be recorded - your purchase goes ahead as normal."],
  // INVITE-STEP-2 — the signature is part of Buy (P14 and its box retired)
  ["P17 declined",       "The invite signature is free and moves no money - please sign it to continue with your purchase."],
  ["P18 signing",        "Sign the free invite in your wallet..."],
  // CARD-STORE-1 C3 — the USD card button and its refusals
  ["P19 usd button",     "Buy for [USD 20]"],
  ["P20 usd coin",       "Paid in [USDT] - pick the coin on the bundle above."],
  ["P21 usd short",      "Not enough [USDT] in this wallet - [USD 20] buys this card."],
  ["P22 usd pol",        "Not enough POL in this wallet for the network fee - add a little POL and try again."],
  ["P23 usd sold out",   "This card is sold out."],
  ["P24 usd closed",     "The card store is closed for now."],
  ["P25 usd network",    "Switch your wallet to Polygon to buy."],
  ["P26 usd cancelled",  "Cancelled in your wallet."],
];
console.log("\n── THE STORE'S LAW · STORE_DESIGN section 11 ruled copy (doc → js/store.js) ──");
for (const [tag, line] of STORE_LAW) {
  ok(tag + " — in the doc", inSDoc(line), line);
  ok(tag + " — carried verbatim by store.js", carriesIn(STORE, line, false), line);
}

console.log("\n── the store's structural guards ──");
// S-BUNDLE-3 — THE PRICE IS THE HERO NUMBER, on both faces, and the old body-text line is gone.
// S-BUNDLE-4 — the PICTURE carries the bundle (card + the site's own coin), the text column carries the price alone.
ok("the coin line is the site's own 96px DYC mark, the one rite.html serves",
   /"src", "assets\/dyc_coin_96\.png"/.test(STORE) && /"b-coinline"/.test(STORE) &&
   /"b-coin-plus", "\+"/.test(STORE) && !/dyc_coin_master/.test(STORE));
ok("the picture is card + coin, built once and used by every face",
   /function picture\(dycWei\)/.test(STORE) &&
   (STORE.match(/card\.appendChild\(picture\(/g) || []).length === 5);
ok("the DYC figure LEFT the text column: the hero is the price alone",
   /function priceHero\(priceText\)/.test(STORE) && !/b-hero-dyc/.test(STORE) &&
   /"b-hero-s", "USDC or USDT"/.test(STORE));
ok("the heading names the bundle (affordance text - §11's set is P1-P9)",
   /BUNDLE_HEADING = "TORANA \+ 500 DYC — THE BUNDLE"/.test(STORE) &&
   /txt\("div", "b-title", BUNDLE_HEADING\)/.test(STORE));
ok("the removed body-text price line is gone (it was never ruled copy)",
   !/"b-price"/.test(STORE) && !/USD 20 — USDC or USDT/.test(STORE));
ok("the bundle face's hero is USD 20; the holder's price AND its coin figure are LIVE",
   /priceHero\("USD 20"\)/.test(STORE) &&
   /card\.appendChild\(picture\(packSize \* BigInt\(packs\)\)\)/.test(STORE) &&
   /packPrice \* BigInt\(packs\)/.test(STORE));
ok("the holder's heading is TOP UP, and P9 is on that face alone",
   /txt\("div", "b-title", "TOP UP"\)/.test(STORE) &&
   (STORE.match(/B_P9/g) || []).length === 2);
// THE STOCK LINE prints no count: one shared pool makes any "N bundles" a fiction (owner ruling (b)).
ok("the stock line is In stock / Sold out / unavailable, and NEVER a count",
   /function stockLine\(st\)/.test(STORE) && /"In stock"/.test(STORE) &&
   !/bundles left|bundles' worth left|" bundles"/.test(STORE));
// THE PRE-FLIGHT PRECEDES THE APPROVE — the whole reason P5 may say "Nothing was signed" (GATES 12e).
const buyRoad = (STORE.split("function bundleBuy(")[1] || "").split("function bundleTopUp(")[0];
const topRoad = (STORE.split("function bundleTopUp(")[1] || "").split("function bundleReceipt(")[0];
// THE RECEIVER PROBE is the FIRST act of the buy road, and it is what makes P5's "Nothing was signed" true:
// buyBundle pulls the stablecoin before it mints, so a simulation with no allowance cannot see a receiver refusal.
ok("the receiver probe is allowance-free and runs before anything is signed",
   /function canReceiveTorana\(ethers, provider, me\)/.test(STORE) &&
   /onERC721Received\(address,address,uint256,bytes\)/.test(STORE) &&
   /ERC721_MAGIC = "0x150b7a02"/.test(STORE) &&
   buyRoad.indexOf("canReceiveTorana") < buyRoad.indexOf("stable.approve"));
ok("a read that FAILED is not treated as a refusal (the probe fails open)",
   /catch\(function \(\) \{ return true; \}\);   \/\/ a read that FAILED is not a refusal/.test(STORE));
ok("buyBundle.staticCall runs BEFORE stable.approve on the buy road",
   buyRoad.indexOf("buyBundle.staticCall") >= 0 && buyRoad.indexOf("stable.approve") >= 0 &&
   buyRoad.indexOf("buyBundle.staticCall") < buyRoad.indexOf("stable.approve"));
ok("a receiver refusal is the ONE pre-flight error that stops the road (P5)",
   /ERC721InvalidReceiver/.test(buyRoad) && /ERC721InvalidReceiver/.test(STORE.split("function bundleErr(")[1].split("function fmtCap")[0]));
// P7 IS A READ, not a revert decode — it lands before any approval is offered.
// STORE-READ-2 — P7 now refuses from the PRE-CAST read, and the read precedes the signer road, so no prompt can
// precede the refusal. (This guard used to pin `a.balance < a.bundlePrice`, the kept value; that shape is the defect.)
ok("P7 is reached from a FRESH BALANCE READ before any approve, on both roads",
   /F\.balance < F\.bundlePrice\) \{[\s\S]{0,120}__p7/.test(buyRoad) &&
   /F\.balance < total\) \{[\s\S]{0,120}__p7/.test(topRoad) &&
   /__p7\) \{ preCastStop\(host, bP7\(sym, sum\)\); return; \}/.test(buyRoad) &&
   buyRoad.indexOf("preCastRead(a, me, false)") < buyRoad.indexOf("signerRoad()") &&
   topRoad.indexOf("preCastRead(a, me, true)") < topRoad.indexOf("signerRoad()"));
// EXACT APPROVALS ONLY — never max, never unlimited. And the exact price is now the FRESHLY READ one.
ok("every approve is the exact FRESH price (no MaxUint256 anywhere in the bundle road)",
   /stable\.approve\(psAddr\(\), F\.bundlePrice, fee\)/.test(STORE) &&
   /stable\.approve\(psAddr\(\), total, fee\)/.test(STORE) &&
   /total = F\.packPrice \* BigInt\(packs\)/.test(STORE) &&
   !/MaxUint256|ethers\.MaxUint|0xffffffffffffffff/.test(STORE));
// THE RECEIPT reads the tokenId from the buy's OWN event, never nextTokenId()-1.
ok("the tokenId comes from the Bundled event and is verified by ownerOf",
   /d\.name === "Bundled"/.test(STORE) && /nft\.ownerOf\(tokenId\)/.test(STORE) && !/nextTokenId/.test(STORE));
// THE DOOR is unstamped — mp/ stays outside the entry-link ledger (S-HALL-ENTRY-1 R2).
ok('the "Sit at a table" door is UNSTAMPED',
   /door\.href = "mp\/hall\.html"/.test(STORE) && !/mp\/hall\.html\?v=/.test(STORE));
// P4's date is exact-or-sentinel, never invented.
ok('the cap date is scanned from ToppedUp, with "within 7 days" as the sentinel',
   /function windowFreesOn\(st\)/.test(STORE) && /var fallback = "within 7 days";/.test(STORE) &&
   /ps\.filters\.ToppedUp\(st\.me\)/.test(STORE));
ok("P4's fill carries its own preposition, so neither the date nor the sentinel breaks the sentence",
   /function bWhen\(exact\)/.test(STORE) && /"on " \+ exact/.test(STORE) &&
   !/frees on " \+ when/.test(STORE));

console.log("\n── the second door ruled 2026-09-12 (RULINGS_2026-08-27 amendment) ──");
const RULE3 = "The Torana opens this door. It is dropped to every wallet that buys DYC in the presale. It admits you; it buys no advantage.";
const SECOND_DOOR = "Or buy it now: a Torana and 500 DYC for USD 20.";
const RULE3_HALL = "The Torana opens the Hall. It is dropped to every wallet that buys DYC in the presale. It admits you; it buys no advantage.";   // FREE-PLAY-1
const detagFP = (h) => norm(String(h).replace(/<[^>]*>/g, " "));
ok("the amendment is recorded", /AMENDMENT 2026-09-12 \(S-BUNDLE-1\) - THE SECOND DOOR/.test(RULINGS));
ok("the second sentence is ruled in the amendment", norm(RULINGS).indexOf(norm(SECOND_DOOR)) >= 0);
ok("rule 3's sentence is UNCHANGED in the rulings doc", norm(RULINGS).indexOf(norm(RULE3)) >= 0);
// FREE-PLAY-1 (amendment 2026-10-11) — rule 3 is SCOPED TO THE HALL and leaves the rite and the Hall's gate screen;
// the old two pins ("untouched on the rite page / in the Hall's gate screen") are RETIRED and inverted here.
ok("FP · rule 3's ORIGINAL sentence is on NO page now - it survives only as the rulings doc's quotation",
   norm(RITE).indexOf(norm(RULE3)) < 0 && norm(HALL).indexOf(norm(RULE3)) < 0 && detagFP(INDEX).indexOf(norm(RULE3)) < 0);
ok("the second door is on the rite page, linking store.html#bundle",
   /<a href="store\.html#bundle">Or buy it now: a Torana and 500 DYC for USD 20\.<\/a>/.test(RITE));
ok("the second door is in the Hall's gate screen, linking ../store.html#bundle",
   /<a href="\.\.\/store\.html#bundle">Or buy it now: a Torana and 500 DYC for USD 20\.<\/a>/.test(HALL));
// THE SECOND DOOR FOLLOWS THE FIRST IN VISIBILITY TOO: a Torana holder is never invited to buy what they hold, and
// the sentence never stands orphaned without rule 3's above it (S-GATE-1 shows the ruled line to non-holders only).
// AND hidden actually hides: threshold.css's `p { display: block }` overrides the UA [hidden] rule, which is why the
// page carries per-class guards (.rite-dyc, .rite-register, #rite-action). The door lines were missing theirs.
ok("[hidden] really hides the door lines (the guard threshold.css makes necessary)",
   /\.rite-doorline\[hidden\] \{ display: none; \}/.test(RITE));
ok("the rite's second door is hidden by default and revealed with the ruled line",
   /<p id="rite-buyline" class="rite-doorline" hidden>/.test(RITE) &&
   /if \(door\) door\.hidden = true;[\s\S]{0,220}if \(buyline\) buyline\.hidden = true;/.test(RITE) &&
   /if \(door\) door\.hidden = false;[\s\S]{0,40}if \(buyline\) buyline\.hidden = false;/.test(RITE));
// R7 — THE LAW OF THE GATE. Its old closing clause became false the day the Torana went on sale; it is replaced by
// the smallest true words, rule 3's own two sentences untouched, and the false words must survive on no page.
const LAW_OF_GATE = "One per wallet, bound to you alone, yours to burn. It is dropped to presale buyers and sold in the store - a Torana and 500 DYC for USD 20.";
ok("R7 · the corrected Law of the Gate is ruled in the amendment", norm(RULINGS).indexOf(norm(LAW_OF_GATE)) >= 0);
// SITE-AUDIT-1 (amendment 2026-10-11b) — R7's clause now rides the MERGED Torana bullet; the old two-part carriage is
// RETIRED from the page (it survives as the doc's quotation), and the merged sentence is pinned below (SA1/SA2).
ok("R7 · the old two-part carriage is GONE from the page (merged by amendment 2026-10-11b)",
   detagFP(INDEX).indexOf(norm(LAW_OF_GATE).replace(" - ", " \u2014 ")) < 0);
ok('R7 · "never sold" appears NOWHERE on any page - it survives only as the quotation of what it replaced',
   !/never sold/.test(INDEX) && !/never sold/.test(RITE) && !/never sold/.test(HALL) &&
   (RULINGS.match(/never sold/g) || []).length === 1);
// the homepage sets the first sentence in <strong>, so the comparison is made on the TEXT, not the markup
const detag = (h) => norm(String(h).replace(/<[^>]*>/g, " "));
// FREE-PLAY-1 — the homepage carries rule 3 SCOPED TO THE HALL (its other two sentences and R7's clause unchanged)
const TORANA_MERGED = "The Torana opens the Hall. It is sold in the store - a Torana and 500 DYC for USD 20 - and dropped to every wallet that buys DYC in the presale. It admits you; it buys no advantage. One per wallet, bound to you alone, yours to burn.";
ok("SA1 · the merged Torana bullet is ruled (amendment 2026-10-11b)", /AMENDMENT 2026-10-11b \(SITE-AUDIT-1\) - THE TORANA BULLET, MERGED/.test(RULINGS) &&
   norm(RULINGS).indexOf(norm(TORANA_MERGED)) >= 0);
ok("SA2 · index.html's Law carries the merged bullet verbatim (the page sets the dashes as em dashes)",
   detag(INDEX).indexOf(norm(TORANA_MERGED).split(" - ").join(" \u2014 ")) >= 0);
ok("the rite's status line names the store (the claim stays shut)",
   norm(RITE).indexOf(norm("The Rite is not yet open. The Torana can be bought now in the store - a Torana and 500 DYC for USD 20.")) >= 0 &&
   /claimOpen/.test(RITE));

// ═══ FREE-PLAY-1 (RULINGS_2026-08-27 amendment 2026-10-11) — SOLO IS FREE; THE TORANA OPENS THE HALL ═══
console.log("\n── FREE-PLAY-1 · solo is free; the Torana opens the Hall (amendment 2026-10-11) ──");
ok("FP0 · the amendment is recorded", /AMENDMENT 2026-10-11 \(FREE-PLAY-1\) - SOLO IS FREE; THE TORANA OPENS THE HALL/.test(RULINGS));
const FP = [
  // [id, ruled sentence, where the code carries it, a matcher on that source]
  ["FP1 rule 1",      "The game is free to play solo for any wallet connected on Polygon. The Torana unlocks multiplayer: every Hall table, free and staked.", null, null],
  ["FP2 rule 3 hall", RULE3_HALL, null, null],   // carried on the page only inside the merged bullet since 2026-10-11b (SA2)
  ["FP3 hall gate",   "Tables against other players need a Torana - solo play stays free.", "mp/hall.js", (l) => norm(HALL).indexOf(norm(l)) >= 0],
  ["FP4 rite solo",   "Solo play is free - enter now. Tables against other players need a Torana.", "rite.html", (l) => norm(RITE).indexOf(norm(l)) >= 0],
  ["FP5 rite connect","Connect a Polygon wallet to play free.", "rite.html", (l) => norm(RITE).indexOf(norm(l)) >= 0],
  ["FP6 torana sub",  "One card. The Hall's tables, open to you.", "rite.html", (l) => norm(RITE).indexOf(norm(l)) >= 0],
  ["FP7 hero",        "The war is visible to all. Solo play is free; the Torana opens the Hall.", "index.html", (l) => detag(INDEX).indexOf(norm(l)) >= 0],
  ["FP8 promise",     "Own the cards. The game stays free.", "index.html", (l) => detag(INDEX).indexOf(norm(l)) >= 0],
  ["FP9 doorway",     "Connect a Polygon wallet and play solo, free. Declare yourself — your wallet is your name here.", "index.html", (l) => detag(INDEX).indexOf(norm(l)) >= 0],
  ["FP10 law opening","Solo play is free to every connected wallet. The Hall - play against people - is entered by the Torana.", "index.html", (l) => detag(INDEX).indexOf(norm(l)) >= 0],
  ["FP11 law rank",   "Player-versus-player tables and staking are live in the Hall, for Torana holders.", "index.html", (l) => detag(INDEX).indexOf(norm(l)) >= 0],
];
for (const [id, line, where, has] of FP) {
  ok(id + " — ruled in the amendment", norm(RULINGS).indexOf(norm(line)) >= 0);
  if (where) ok(id + " — carried verbatim by " + where, has(line));
}
ok("FP12 · the rite's Enter for a non-holder reads 'play solo — free', and the arena sub-line reads 'free · solo'",
   /setBtn\("Enter", "play solo — free", \{ onClick: enterSolo \}\)/.test(RITE) && /<span class="btn-sub">free · solo<\/span>/.test(INDEX) &&
   norm(RULINGS).indexOf('"play solo — free"') >= 0 && norm(RULINGS).indexOf('"free · solo"') >= 0);
ok("FP13 · the demo's button reads 'Play free' and goes to the rite", /<a class="demo-cta" href="\.\.\/rite\.html">Play free<\/a>/.test(DEMO) &&
   norm(RULINGS).indexOf('"Play free"') >= 0);
ok("FP14 · the Hall's gate screen is the new line + the second door, and the retired button is gone",
   /hall-gate-line">Tables against other players need a Torana - solo play stays free\.<\/p>' \+[\s\S]{0,400}?<a id="hall-solo" href="\.\.\/rite\.html">Play solo \(free\) →<\/a><\/p>' \+[\s\S]{0,300}?'<p class="hall-gate-line hall-gate-buy"><a href="\.\.\/store\.html#bundle">/.test(HALL) &&
   HALL.indexOf("To the presale — the Torana follows") < 0);
ok("FP15 · RETIRED words survive on no page: the bearer-only lines, the claim-only Torana line, 'Get Access', the Phase-B clause",
   [["The door opens only for bearers", INDEX], ["The gate opens only for bearers", INDEX], ["The game is built into this gate", INDEX],
    ["The gate is yours", INDEX], ["for bearers<", INDEX], ["arrive in Phase B", INDEX], ["The whole launch set, playable", RITE],
    ["The rite is spoken with a wallet. You carry none yet.", RITE], ["Declare yourself first — your wallet is your name at this gate.", RITE],
    [">Get Access<", DEMO], ["The Rite Opens Soon", RITE]].every(([w, src]) => src.indexOf(w) < 0));
ok("FP16 · the rite's solo line follows the same visibility law as the old door line (hidden by default, shown with the second door)",
   /<p id="rite-doorline" class="rite-doorline" hidden>Solo play is free - enter now\./.test(RITE));
ok("FP17 · the no-wallet guidance is the rite's own words on the Hall's connect card",
   ["Wallet not responding — pull down to refresh this tab, then Retry.", "No wallet in this browser. ", "Open in MetaMask →",
    "You carry no key. ", "— install a wallet, then Retry."].every((w) => RITE.indexOf(w) >= 0 && HALL.indexOf(w) >= 0));

// ═══ SITE-AUDIT-1 batch 1 (2026-10-11) — FALSE STATEMENTS, RETIRED FOR GOOD ═══
console.log("\n── SITE-AUDIT-1 · the false statements stay gone (every player page and its scripts) ──");
{
  const R = (f) => { try { return fs.readFileSync(path.resolve(__dirname, "..", f), "utf8"); } catch (e) { return ""; } };
  // player-visible text only: HTML comments are stripped, so a comment may quote what it replaced
  const visible = (f) => R(f).replace(/<!--[\s\S]*?-->/g, "");
  const PAGES = ["index.html", "rite.html", "store.html", "dashboard.html", "treasury.html", "report.html", "explore.html",
                 "mint.html", "register.html", "demo/index.html", "mp/hall.html"];
  const SCRIPTS = ["js/store.js", "js/dashboard.js", "js/treasury.js", "js/report.js", "js/explore.js", "js/mintstatus.js", "mp/hall.js"];
  const stripJsComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
  const ALL = PAGES.map((f) => [f, visible(f)]).concat(SCRIPTS.map((f) => [f, stripJsComments(R(f))]));
  const BANNED = ["free Access token", "Phase B", "PHASE B", "for this region", "no fee token needed", "Forge one at the rite",
                  "Forge your key at the rite", "announced at sale-open", "staking when it opens", "Claims are not yet open",
                  "DYC retired", "free card claim opens later", "faucet.polygon.technology", "One free Access token",
                  "Free, one per hand", "the contract address may be wrong"];
  for (const b of BANNED) {
    const hits = ALL.filter(([, t]) => t.indexOf(b) >= 0).map(([f]) => f);
    ok("SA3 · no page or page script says \"" + b + "\"", hits.length === 0, hits.join(", "));
  }
  // owner decision 1 (2026-10-11) — the rite's quiet presale road: a plain LINK (never a .rite-btn) to register.html
  const RITE_V = visible("rite.html");
  ok("SA5 · the rite carries 'Register for the presale →' as a quiet text link to register.html (not a button)",
     /<a id="rite-presale" class="rite-presale" href="register\.html" hidden>Register for the presale →<\/a>/.test(RITE_V) &&
     !/class="[^"]*rite-btn[^"]*"[^>]*>Register for the presale/.test(RITE_V) && !/<button[^>]*>Register for the presale/.test(RITE_V));
  // owner ruling A (2026-10-11) — the wording follows the CONTRACT: VestingVault VEST_DURATION = 730 days (two years)
  ok("SA6 · the Mint's vesting line states the contract's two years, exactly",
     visible("mint.html").indexOf("15% of each purchase arrives liquid; 85% vests linearly across the two years after exchange listing.") >= 0);
  const DASH_HTML = visible("dashboard.html");
  ok("SA4 · the dashboard's Buy DYC link goes to the Buy panel (the presale is open — never 'Coming soon')",
     /<a href="#buy-panel"><svg[^>]*>[\s\S]*?<\/svg>Buy DYC<\/a>/.test(DASH_HTML) && !/data-soon[^>]*>[\s\S]{0,400}?Buy DYC/.test(DASH_HTML));
}

// ═══ SITE-AUDIT-1 batch 2 (LOBBY_DESIGN amendment 2026-10-11) — the Hall's plain words, structurally ═══
console.log("\n── SITE-AUDIT-1 batch 2 · the Hall's plain words ──");
ok("SB1 · the amendment is recorded", /AMENDMENT 2026-10-11 \(SITE-AUDIT-1 batch 2\) - THE REFUND IS A BUTTON; PLAIN WORDS/.test(DOC));
ok("SB2 · nothing on the Hall promises an AUTOMATIC refund any more", !/refund[^"\n]{0,40}automatically|automatically after 24/.test(HALL.replace(/\/\/[^\n]*/g, "")));
ok("SB3 · the header and pre-flight say 'Your DYC', the tier note 'not enough DYC' (no 'Liquid' / 'insufficient liquid DYC' left)",
   /hall-liquid-label">Your DYC</.test(HALL) && /Your DYC: <b>/.test(HALL) && /hall-tier-note">not enough DYC</.test(HALL) &&
   !/>Liquid</.test(HALL) && !/Liquid DYC:/.test(HALL) && !/hall-tier-note">insufficient liquid DYC/.test(HALL));
ok("SB4 · the gate's busy and reading lines name the Torana check in plain words",
   HALL.indexOf("Checking your Torana…") >= 0 && HALL.indexOf("Couldn\\'t check your Torana just now") >= 0 &&
   HALL.indexOf("reading the gate…") < 0 && HALL.indexOf("The gate is not answering") < 0);
ok("SB5 · the escrow's errors map to the ruled plain sentences, and anything else to the one fallback",
   ["NotOpen: \"this table is no longer open\"", "SelfMatch: \"you can't join your own table\"", "NotExpectedOpponent: \"this private table is for another wallet\"",
    "BadStake: \"that stake isn't allowed\"", "TimeoutNotReached: \"refund opens 24 hours after the match started\"",
    "NotMatched: \"this match is already settled or refunded\"", "NotOpener: \"only the player who opened this table can cancel it\""].every((l) => HALL.indexOf(l) >= 0) &&
   HALL.indexOf('var WALLET_FALLBACK = "the wallet step didn\'t go through - nothing moved; try again";') >= 0 && HALL.indexOf('"the cast failed"') < 0);
ok("SB6 · the match server's words are translated in the Hall (unsigned result → the ruled line; chain read → plain)",
   /function plainServer\(t\)[\s\S]{0,300}referee could not sign[\s\S]{0,80}RESULT_UNCONFIRMED[\s\S]{0,200}The table server couldn't check the chain - try again in a moment\./.test(HALL) &&
   /lastServerError = plainServer\(v\.lastReject\)/.test(HALL) && /plainServer\(s\.error\)/.test(HALL));
ok("SB7 · the act reads COLLECT [N] DYC / REFUND BOTH STAKES / confirm in your wallet… (no CAST SETTLE, no casting…)",
   /var COLLECT_BTN = function \(total\) \{ return "COLLECT " \+ total \+ " DYC"; \};/.test(HALL) && /var REFUND_BTN = "REFUND BOTH STAKES";/.test(HALL) &&
   /var CONFIRM_WALLET = "confirm in your wallet…";/.test(HALL) && HALL.indexOf('"CAST SETTLE"') < 0 && HALL.indexOf('"casting…"') < 0);
ok("SB8 · Concede is gone (the server plays it as a Pass)", !/data-concede|hall-concede|client\.concede\(/.test(HALL));
ok("SB9 · the room-left line follows the ledger ('left before your limit'), never 'remaining headroom'",
   /function LIMIT_ROOM\(remWei, capWei\) \{ return dycOf\(remWei\) \+ " of " \+ dycOf\(capWei\) \+ " DYC left before your limit"; \}/.test(HALL) &&
   HALL.indexOf("Remaining headroom") < 0 && !/DYC remaining/.test(HALL));

console.log("\n── advisory · other quoted doc lines (not section-11 ruled copy) ──");
const lawSet = new Set(LAW.map(([, l]) => norm(l)));
const re = /"([^"]+)"/g; let m; const seen = new Set(); let lit = 0, diff = 0;
while ((m = re.exec(DOC))) {
  const q = norm(m[1]);
  if (q.length < 13 || seen.has(q) || lawSet.has(q)) continue; seen.add(q);
  if (!/DYC|escrow|stake|seat|pot|table|opponent|limit|human/i.test(q)) continue;
  if (carries(q, true)) { lit++; } else { diff++; console.log("    · rendered differently (dynamic/split/cased): \"" + q + "\""); }
}
console.log("    " + lit + " carried literally, " + diff + " rendered differently — advisory only.");

const RULED_N = LAW.length + STORE_LAW.length;
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// WINNINGS-4 — THE DASHBOARD'S LAW: docs/DASHBOARD_DESIGN_v1.md section 11 -> js/dashboard.js
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function inDDoc(line) { return norm(DDOC).indexOf(norm(line)) >= 0; }
const DASH_LAW = [
  ["W1 lead",            "Winnings are a tag on the DYC you already hold - not a separate balance. Only DYC won from a match where your opponent staked liquid DYC can be withdrawn."],
  ["W2 rate",            "0.008 USDT per DYC - fixed until DYC lists on an exchange."],
  ["W3 floor",           "Minimum withdrawal 125 DYC (USD 1)."],
  ["W4 cadence",         "One withdrawal per wallet every 24 hours."],
  ["W5 treasury",        "The DYC you withdraw returns to the treasury."],
  ["W6 facility",        "Withdrawals are available while the desk's USDT reserve lasts. This is a facility, not an entitlement."],
  ["W7 dormant",         "Withdrawals are not yet open. The desk opens when the reserve is funded."],
  ["W8 fresh win",       "A win needs a few minutes on chain before it can be withdrawn."],
  ["W9 confirm",         "Withdraw [900] DYC and receive [7.200000] USDT. The DYC returns to the treasury."],
  ["W10 reopens",        "Your next withdrawal opens at [time]."],
  ["E1 cooldown",        "You have already withdrawn today. Only one withdrawal per wallet every 24 hours."],
  ["E2 below minimum",   "The minimum withdrawal is 125 DYC (USD 1)."],
  ["E3 exhausted",       "You have withdrawn all of your winnings so far."],
  ["E4 expired",         "This withdrawal approval has expired. Approvals last 4 hours - ask for a fresh one."],
  ["E5 paused",          "Withdrawals are paused for a moment."],
  ["E6 reserve short",   "The cash-out desk's reserve can't cover this right now. Try a smaller amount or check back later."],
  ["E7 bad signature",   "This withdrawal approval couldn't be verified. It may be from an old signing key - ask for a fresh one."],
  ["S1 deriver refusal", "We can't confirm your winnings right now - nothing is lost. Try again shortly."],
  ["S2 rate limited",    "You've just asked for one - give it a minute and try again."],
  ["S3 nothing yet",     "You have nothing to withdraw yet."],   // amended at AFFILIATE-1 rung 3: two parts now
  ["S4 bad challenge",   "That sign-in couldn't be verified. Start again."],
  ["S5 geo",             "Withdrawals aren't available from your location."],
  ["S6 kyc",             "Withdrawals need identity verification first."],
  ["S7 not served",      "This wallet can't be served."],
  ["G1 gas",             "You need a small amount of POL for network fees. Add a little POL to your wallet and try again."],
  // AFFILIATE-1 rung 3 — the combined Withdraw card
  ["V1 lead",            "Withdraw your winnings and your Torana Invites rewards here, as USDT."],
  ["V2 invite note",     "Invite rewards are paid in USDT - no DYC leaves your wallet for them."],
  ["V3 confirm both",    "Withdraw [900] DYC of winnings and [250] DYC of invite rewards, and receive [9.200000] USDT. The winnings DYC returns to the treasury."],
  ["V4 confirm invite",  "Withdraw [250] DYC of invite rewards and receive [2.000000] USDT. No DYC leaves your wallet."],
  ["V5 connect",         "Connect your wallet to see what you can withdraw."],
  ["E8 invite exhausted", "You have withdrawn all of your invite rewards so far."],
  // AFFILIATE-1 rung 3 — the Torana Invites card
  ["I1 lead",            "Share your invite link. When a friend buys their first bundle through it, you earn 10% of what they paid."],
  ["I2 paid as",         "Rewards are counted in DYC at 0.008 and paid as USDT from the Withdraw card."],
  ["I3 unlock",          "A reward unlocks 7 days after your friend's purchase."],
  ["I4 first bundle",    "Only a friend's first bundle counts, and only if they have never held a Torana."],
  ["I5 free",            "Your friend signs a free invite before they buy - it costs them nothing."],
  ["I6 review",          "More than 25 rewards in one month are checked by hand before they unlock."],
  ["I7 none",            "No invited purchases yet."],
  ["I8 unshown",         "Your invited purchases can't be shown right now."],
  ["I9 copied",          "Link copied."],
  ["I10 unlocks on",     "Unlocks on [date]"],
  ["I11 ready",          "Ready to withdraw"],
  ["I12 paid",           "Paid"],
  ["I13 held",           "Held for review"],
  ["I14 desk not open",  "Unlocked - withdrawals open when the desk does."],
  // INVITES-2 — the v2 card (shown only while the digest's scheme is v2)
  ["J1 lead",            "Share your invite link. When a friend buys their first bundle through it, you earn 5% of what they paid."],
  ["J2 steps",           "When the friends they invite buy their first bundle, you earn 1% more - and so on, up to five steps beyond your own friends."],
  ["J3 weekly bonus",    "Weekly bonus: when 20 of your own friends buy their first bundle in one week (Monday to Monday, UTC), you earn $20 more. 50 earns $50, 100 earns $200 and 200 earns $400 - only the highest step counts."],
  ["J4 bonus unlock",    "A weekly bonus unlocks 7 days after its week ends."],
  ["J5 this week",       "This week: [12] of [20] - reach [20] for a $[20] bonus."],
  ["J6 top step",        "This week: [210] - the top bonus of $400 is reached."],
  ["J7 your friends",    "Your friends"],
  ["J8 step n",          "Step [2]"],
  ["J9 step note",       "Step 2 is the friends your friends invite, and so on up to step 6."],
  ["J10 bonus row",      "Weekly bonus - week of [date]"],
  ["J11 cards",          "When they buy a card in the store with USDT or USDC, you earn the same shares of its price."],
  ["J12 cards dyc",      "Cards bought with DYC earn nothing."],
  // INVITES-2 amendment — earned but not yet released (A2/A8)
  ["J13 accrued",        "You have earned [X] USDT in invite rewards. They unlock when you own a Torana — buy the bundle to release them."],
  ["J14 waiting",        "Unlocks when you own a Torana"],
  ["N1 unavailable",     "Invites are unavailable for a moment. Try again shortly."],
  ["N2 stale",           "That signature has expired. Sign again."],
  ["N3 bad signature",   "That signature couldn't be verified. Sign again."],
  ["N4 no torana",       "Invite codes are for Torana holders."],
  ["N5 collision",       "Please sign once more to create your code."],
  ["N6 try again",       "We can't check that right now - nothing is lost. Try again shortly."],
  ["N7 not open",        "Invites are not open yet."],
  ["N8 fallback",        "Invites are unavailable right now."],
];
console.log("\n── THE DASHBOARD'S LAW · DASHBOARD_DESIGN_v1 section 11 ruled copy (doc → js/dashboard.js) ──");
for (const [tag, line] of DASH_LAW) {
  ok(tag + " — in the doc", inDDoc(line), line);
  ok(tag + " — carried verbatim by dashboard.js", carriesIn(DASH, line, false), line);
}
// THE TRAP THIS LAW EXISTS TO CATCH: the DropDesk's 90-day wording must never answer a WINNINGS expiry. The
// winnings sentence says 4 hours; the drop sentence says 90 days; both must be present and distinct.
ok("W-TRAP — the winnings expiry does NOT use the DropDesk's 90-day wording",
   DASH.indexOf("Approvals last 4 hours") >= 0
   && DASH.indexOf("Coupons are valid for 90 days") >= 0
   && DASH.indexOf("ExpiredCoupon: \"This withdrawal approval has expired") >= 0);

// AFFILIATE-1 rung 3 — THE NEW SCHEME NEVER SAYS "affiliate" OR "referral". The words belong to the older, separate
// Referrals link (left untouched); the invite scheme's own copy must not borrow them. Checked over every ruled line
// this rung added AND over the two source blocks that render them, so a stray sentence outside the law is caught too.
{
  const NEW_LINES = STORE_LAW.filter((r) => /^P1[3-8] /.test(r[0])).concat(DASH_LAW.filter((r) => /^(V\d|E8|I\d|N\d|J\d)/.test(r[0])));
  ok("AF0 · the new-scheme line set was located (5 store + 28 dashboard + 14 v2)", NEW_LINES.length === 47, String(NEW_LINES.length));
  // INVITE-STEP-2: the retired box and its sentence are gone from the source and the doc's ruled set
  ok("AF5 · the retired invite box is gone: no Skip, no Sign button, no P14 sentence in store.js",
     !/b-invite-ask|b-invite-skip|b-invite-sign|Sign a free invite before you buy/.test(STORE));
  ok("AF1 · no ruled invite line says affiliate or referral", NEW_LINES.every((r) => !/affiliat|referr/i.test(r[1])),
     NEW_LINES.filter((r) => /affiliat|referr/i.test(r[1])).map((r) => r[0]).join(", "));
  const storeBlock = (STORE.split("AFFILIATE-1 rung 3 · TORANA INVITES (the store's half)")[1] || "").split("function bLs(")[0];
  const dashBlock = (DASH.split("AFFILIATE-1 rung 3 · THE WITHDRAW CARD'S NEW LINES")[1] || "").split("var INV_FALLBACK")[0]
    + (DASH.split("AFFILIATE-1 rung 3 — THE TORANA INVITES CARD")[1] || "").split("function renderRedeem()")[0];
  const strings = (src) => (src.match(/"(?:[^"\\]|\\.)*"/g) || []).join(" ");
  ok("AF2 · the source blocks were located", storeBlock.length > 1500 && dashBlock.length > 3000, storeBlock.length + " / " + dashBlock.length);
  ok("AF3 · and no string literal in either block says affiliate or referral",
     !/affiliat|referr/i.test(strings(storeBlock)) && !/affiliat|referr/i.test(strings(dashBlock)));
  ok("AF4 · the Referrals link is untouched (its toast still names the separate rewards platform)",
     DASH.indexOf('toast("Referrals live on the separate rewards platform.")') >= 0);
}

// WINNINGS-4: THREE pairs now (Hall, Store, Dashboard). RULED_N counts the first two; DASH_LAW is the third and
// is added here so the arithmetic printed below is the true one, not an inherited one.
const RULED_ALL = RULED_N + DASH_LAW.length;
console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail) + " (" + RULED_ALL + " ruled lines × doc+code across THREE pairs, + " + (pass + fail - RULED_ALL * 2) + " structural)");
process.exit(fail === 0 ? 0 : 1);
