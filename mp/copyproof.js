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

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }

const norm = (s) => String(s).replace(/\s+/g, " ").trim().replace(/…/g, "...");
const deslot = (s) => norm(s).replace(/\[[^\]]*\]/g, "§");
const SRC = norm(HALL);
// a bracket slot is a concatenation break in the source ("Your " + dycOf(x) + " DYC ..."), so a ruled line is
// carried when each of its non-slot fragments appears IN ORDER in the normalised source.
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

console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail) + " (" + LAW.length + " ruled lines × doc+code, + " + (pass + fail - LAW.length * 2) + " structural)");
process.exit(fail === 0 ? 0 : 1);
