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
const RITE = fs.readFileSync(path.resolve(__dirname, "..", "rite.html"), "utf8");
const RULINGS = fs.readFileSync(path.resolve(__dirname, "..", "docs", "RULINGS_2026-08-27.md"), "utf8");
const INDEX = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

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
  ["5 commitment",       "Your [50] DYC locks in escrow now. It returns in full if you cancel before anyone sits, or on a draw. The winner takes the pot minus the 5% platform fee. If a finished match is somehow never settled, the chain refunds both players automatically after 24 hours - locked stakes can never be stranded."],
  ["6 both-stakes",      "Once both stakes lock, the match begins."],
  ["7 friend-lock",      "private table - visible only by this code, and only [0xFRIEND...] can take the seat."],
  ["8c won",             "You won. Collect [95] DYC - [5] to the treasury."],
  ["8c settled",         "settled - [95] DYC in your wallet"],
  ["8c draw",            "A draw - both stakes return in full."],
  ["8c forfeit",         "Your opponent left the table. The pot is yours - collect [95] DYC."],
  ["8c abort",           "unclaimed pots refund both players automatically after 24 hours."],
  ["8c free",            "no stakes at this table"],
  ["8d unopened table",  "Your [10] DYC is locked in escrow, but the table has not opened yet."],
  ["cancel moved-on",    "this table is no longer cancellable - the match has moved on"],
  ["friend reachability", "could not reach the table server - your code is fine, try again in a moment"],
  ["cross-account",      "this was prepared for another account - switch back to [0xA...] to finish it"],
  ["seated elsewhere",   "Your warrior is already seated - the battle is live in another window."],
  ["unsettled pots",     "You have [N] unsettled pots waiting - each one can be collected here."],
  ["9 limit set",        "Once your net losses today reach this, the staked tables close for you until midnight UTC. Free tables and friend practice stay open. Only you can set or change this."],
  ["9 limit block",      "Your daily limit is reached - the staked tables reopen at midnight UTC. Remaining headroom today: [X] DYC."],
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
ok("P7 is reached from a BALANCE READ before any approve",
   /a\.balance < a\.bundlePrice\) \{[\s\S]{0,160}bP7\(sym, sum\)/.test(buyRoad));
// EXACT APPROVALS ONLY — never max, never unlimited.
ok("every approve is the exact price (no MaxUint256 anywhere in the bundle road)",
   /stable\.approve\(psAddr\(\), a\.bundlePrice, fee\)/.test(STORE) &&
   /stable\.approve\(psAddr\(\), total, fee\)/.test(STORE) &&
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
ok("the amendment is recorded", /AMENDMENT 2026-09-12 \(S-BUNDLE-1\) - THE SECOND DOOR/.test(RULINGS));
ok("the second sentence is ruled in the amendment", norm(RULINGS).indexOf(norm(SECOND_DOOR)) >= 0);
ok("rule 3's sentence is UNCHANGED in the rulings doc", norm(RULINGS).indexOf(norm(RULE3)) >= 0);
ok("rule 3's sentence is untouched on the rite page", norm(RITE).indexOf(norm(RULE3)) >= 0);
ok("rule 3's sentence is untouched in the Hall's gate screen", norm(HALL).indexOf(norm(RULE3)) >= 0);
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
ok("R7 · index.html carries it verbatim (only the em dash differs, as the page's typography does)",
   norm(INDEX).indexOf(norm(LAW_OF_GATE).replace(" - ", " \u2014 ")) >= 0);   // the page's own em dash
ok('R7 · "never sold" appears NOWHERE on any page - it survives only as the quotation of what it replaced',
   !/never sold/.test(INDEX) && !/never sold/.test(RITE) && !/never sold/.test(HALL) &&
   (RULINGS.match(/never sold/g) || []).length === 1);
// the homepage sets the first sentence in <strong>, so the comparison is made on the TEXT, not the markup
const detag = (h) => norm(String(h).replace(/<[^>]*>/g, " "));
ok("R7 · rule 3's own two sentences are untouched on the homepage", detag(INDEX).indexOf(norm(RULE3)) >= 0);
ok("the rite's status line names the store (the claim stays shut)",
   norm(RITE).indexOf(norm("The Rite is not yet open. The Torana can be bought now in the store - a Torana and 500 DYC for USD 20.")) >= 0 &&
   /claimOpen/.test(RITE));

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
console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail) + " (" + RULED_N + " ruled lines × doc+code across TWO pairs, + " + (pass + fail - RULED_N * 2) + " structural)");
process.exit(fail === 0 ? 0 : 1);
