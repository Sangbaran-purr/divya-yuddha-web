"use strict";
// MINI-GAMES-1 · R1 — THE DAILY PUZZLE. The 14 puzzles, the offline solver's law and its refusals, against the site's
// copy of the REAL engine (game/src/engine.js). No chain and no network: a puzzle is a position plus the engine.
//
// What this suite must catch, each by name:
//   - a puzzle with TWO winning plays, or NONE, or a one winner that is not the approved play (salted fingerprint)
//   - a malformed puzzle, an unknown card, a card of the wrong faction, a Wave-1 card, an illegal setup step
//   - a position (or an outcome) that depends on the dice
//   - a solver whose answer differs from what the engine does when that play is replayed by hand
//   - the engine copy changed underneath the puzzles
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const H = require("../lib.js");
const SITE = H.SITE;
const E = require(path.join(SITE, "game", "src", "engine.js"));
const PZ = require(path.join(SITE, "play", "daily", "puzzle-core.js"));
const PUZZLES = JSON.parse(fs.readFileSync(path.join(SITE, "play", "daily", "puzzles.json"), "utf8"));
// NO answer key exists in this repo (both repos are public): each approved winning play is a salted fingerprint
const FP = JSON.parse(fs.readFileSync(path.join(SITE, "tests", "fixtures", "daily-answers.sha256.json"), "utf8"));
const { answerDigest } = require(path.join(SITE, "scripts", "puzzle-answer-digest.js"));
const approved = (P, w) => !!w && FP.digests[P.id] === answerDigest(FP.salt, P.id, w.play, w.target);

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const byId = (id) => clone(PUZZLES.find((p) => p.id === id));
// a solver that THROWS is a named failure here, never a crash that hides every check after it
const solve = (P, ans) => { try { return PZ.solve(P, E, ans); } catch (e) { return { ok: false, reason: "THREW", detail: String(e && e.message), winners: [], plays: [] }; } };

console.log("── MINI-GAMES-1 · R1 · the Daily Puzzle ──");

// ── the engine underneath is the shipped copy ──
{
  const src = fs.readFileSync(path.join(SITE, "game", "src", "engine.js"));
  const want = fs.readFileSync(path.join(SITE, "game", "src", "engine.sha256"), "utf8").trim().split(/\s+/)[0];
  ok("E1 · the puzzles run on the site's engine copy, unchanged (sha256 = game/src/engine.sha256)", crypto.createHash("sha256").update(src).digest("hex") === want);
  const core = fs.readFileSync(path.join(SITE, "play", "daily", "puzzle-core.js"), "utf8");
  ok("E2 · the core re-implements no rule: it defines none of the engine's scoring or play functions",
    !/function\s+(effPower|totalPower|playCard|endRound|damageUnit|destroyUnit|venom\w*)\s*\(/.test(core));
}

// ── the 14 puzzles ──
const solved = {};
for (const P of PUZZLES) {
  const r = solve(P, null);
  solved[P.id] = r;
  ok("P · " + P.date + " " + P.title + " — exactly one winning play, and it is the approved one (fingerprint)", r.ok && approved(P, r.winners[0]), r.ok ? "fingerprint differs" : r.detail);
}
{
  const dates = PUZZLES.map((p) => p.date);
  const want = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10));
  ok("D1 · fourteen puzzles, one per day, Monday 2026-10-19 → Sunday 2026-11-01, ids unique",
    JSON.stringify(dates) === JSON.stringify(want) && new Date(Date.UTC(2026, 9, 19)).getUTCDay() === 1 && new Set(PUZZLES.map((p) => p.id)).size === 14);
  const ladder = ["easy", "easy", "medium", "medium", "medium", "hard", "hard"];
  ok("D2 · easier early in the week, harder later (Mon–Tue easy · Wed–Fri medium · Sat–Sun hard, both weeks)",
    PUZZLES.every((p, i) => p.difficulty === ladder[i % 7]), PUZZLES.map((p) => p.difficulty).join(","));
  const mine = new Set(PUZZLES.map((p) => p.you.faction)), all = new Set(PUZZLES.map((p) => p.you.faction).concat(PUZZLES.map((p) => p.them.faction)));
  ok("D3 · all four factions are played (and all four are faced)", mine.size === 4 && all.size === 4, [...mine].join(","));
  const mech = PUZZLES.map((p) => p.mechanic).join(" | ");
  ok("D4 · the spread covers Dharma Shield, Chaos Surge, Leap, Venom, realms and Astras",
    ["dharma shield", "chaos surge", "leap", "venom", "realm", "astra"].every((m) => mech.indexOf(m) >= 0), mech);
  ok("D5 · at least four different realms are in play", new Set(PUZZLES.map((p) => p.realm)).size >= 4);
  const text = fs.readFileSync(path.join(SITE, "play", "daily", "puzzles.json"), "utf8") + fs.readFileSync(path.join(SITE, "tests", "fixtures", "daily-answers.sha256.json"), "utf8");
  // every file git tracks in this (public) repo, for the no-answer-key check below
  const tracked = require("child_process").execFileSync("git", ["ls-files"], { cwd: SITE, encoding: "utf8" }).split("\n").filter(Boolean)
    .filter((f) => /\.(js|json|html|md|txt|css)$/.test(f) && f.indexOf("node_modules") < 0 && f !== "tests/suites/puzzles.js");
  const trackedText = tracked.map((f) => { try { return fs.readFileSync(path.join(SITE, f), "utf8"); } catch (e) { return ""; } }).join("\n");
  ok("D6 · today's names only: no 'Hanuman' card anywhere (the hero is Bali)", !/hanuman/i.test(text));
  ok("D7 · every puzzle has an approved fingerprint, and no fingerprint without a puzzle", PUZZLES.every((p) => /^[0-9a-f]{64}$/.test(FP.digests[p.id] || "")) && Object.keys(FP.digests).length === PUZZLES.length);
  ok("D8 · NO plain answer key in the repo: play/daily/answers.json is gone, and no tracked file carries an \"answer\" object",
    !fs.existsSync(path.join(SITE, "play", "daily", "answers.json")) && !/"answer"\s*:\s*\{/.test(trackedText), tracked.length + " files scanned");
}

// ── the solver's answer IS what the engine does: replay each winning LINE by hand, without the solver ──
{
  let all = true, why = "";
  for (const P of PUZZLES) {
    const r = solved[P.id];
    if (!r.ok) { all = false; why = P.id + " did not solve"; continue; }
    const w = r.winners[0], L = w.line;
    const g = PZ.load(P, E, 1), pl = g.players[0], round = g.round;
    const leap = (pr) => { E.doLeap(g, 0, pl.units[pr[0]], pl.units[pr[1]], false); E.sweepDeaths(g); };
    L.before.forEach(leap);
    const idx = pl.hand.findIndex((c, i) => c.n === w.play && E.playableIndices(g, 0).indexOf(i) >= 0);
    const spec = E.targetSpec(g, 0, pl.hand[idx]);
    const t = w.target && spec ? spec.options.find((o) => o.n === w.target.replace(/#\d+$/, "")) : null;
    E.playCard(g, 0, idx, t ? t.uid : null, L.pos);
    L.after.forEach(leap);
    if (!g.over && g.round === round && g.turn === 0) E.pass(g, 0);
    const h = g.roundHistory.find((x) => x.round === round);
    if (!(h && h.winner === 0 && h.t0 === w.you && h.t1 === w.them)) { all = false; why = P.id + ": engine " + (h && h.t0) + "–" + (h && h.t1) + " vs solver " + w.you + "–" + w.them; }
  }
  ok("R1 · every winning line (card, target, slot, Leaps), replayed by hand through the engine, WINS the round at the solver's exact score", all, why);
  // the page must offer the free Leap: exactly one puzzle cannot be won without one (named by date, not by play)
  const needLeap = PUZZLES.filter((P) => solved[P.id].ok && (solved[P.id].winners[0].line.before.length + solved[P.id].winners[0].line.after.length) > 0).map((P) => P.date);
  ok("R2 · the page needs Leap control: 2026-10-29 is won only with a free Leap (and every other puzzle without one)",
    JSON.stringify(needLeap) === JSON.stringify(["2026-10-29"]), needLeap.join(","));
}

// ── the solver's refusals ──
{
  const base = "dp-2026-10-19";                                     // Chandra Dev wins 20–19
  const two = byId(base); two.them.hand = two.them.hand.filter((n) => n !== "Ravana"); two.setup = two.setup.filter((s) => s.play !== "Ravana");
  // without Ravana the opponent cannot answer the second turn — rebuild the turn order honestly
  two.setup = [{ side: "you", play: "Ashwini Kumars" }, { side: "them", play: "Narakasura" }, { side: "you", play: "Marut" }, { side: "them", pass: true }, { side: "you", play: "Gandharva" }, { side: "you", play: "Kubera" }];
  const r2 = solve(two, null);
  ok("S1 · a position with TWO winning plays is REJECTED (TWO_WINS), naming both", !r2.ok && r2.reason === "TWO_WINS" && r2.winners.length >= 2, r2.detail);

  const none = byId(base); none.them.hand.push("Kumbhakarna");
  none.setup = [{ side: "you", play: "Ashwini Kumars" }, { side: "them", play: "Narakasura" }, { side: "you", play: "Marut" }, { side: "them", play: "Ravana" },
    { side: "you", play: "Gandharva" }, { side: "them", play: "Kali Asura" }, { side: "you", play: "Kubera" }, { side: "them", pass: true }];
  const r0 = solve(none, null);
  ok("S2 · a position with NO winning play is REJECTED (NO_WIN)", !r0.ok && r0.reason === "NO_WIN", r0.detail);

  // S3/S4 build their wrong answers from the solver's own lists, so this file names no winning play
  const all10 = solve(byId(base), null);
  const loser = all10.plays.find((p) => !p.win && p.play);
  const wrong = solve(byId(base), { play: loser.play, target: loser.target });
  ok("S3 · a stated answer that is not the one winner is REJECTED (WRONG_ANSWER)", !wrong.ok && wrong.reason === "WRONG_ANSWER", wrong.detail);
  const tp = byId("dp-2026-10-28"), tw = solve(tp, null).winners[0];
  const sameCardOtherTarget = solve(tp, null).plays.find((p) => p.play === tw.play && p.target && p.target !== tw.target);
  const wrongT = solve(byId("dp-2026-10-28"), { play: tw.play, target: sameCardOtherTarget.target });
  ok("S4 · …and so is the right card on a wrong target", !wrongT.ok && wrongT.reason === "WRONG_ANSWER", wrongT.detail);

  const mal = [
    ["no date", (p) => { delete p.date; }],
    ["a bad difficulty", (p) => { p.difficulty = "brutal"; }],
    ["an unknown realm", (p) => { p.realm = "vaikuntha"; }],
    ["no hand", (p) => { p.you.hand = []; }],
    ["a setup step with no play and no pass", (p) => { p.setup.push({ side: "you" }); }],
    ["first not 0 or 1", (p) => { p.first = 2; }],
  ];
  for (const [what, f] of mal) { const p = byId(base); f(p); const r = solve(p, null); ok("S5 · a MALFORMED puzzle is rejected — " + what, !r.ok && r.reason === "MALFORMED", r.detail); }

  const unk = byId(base); unk.you.hand.push("Hanuman");
  const ru = solve(unk, null);
  ok("S6 · a card that does not exist is REJECTED (UNKNOWN_CARD) — even the old name 'Hanuman'", !ru.ok && ru.reason === "UNKNOWN_CARD" && /Hanuman/.test(ru.detail), ru.detail);
  const wf = byId(base); wf.you.hand.push("Ravana");
  const rw = solve(wf, null);
  ok("S7 · another faction's card in your hand is REJECTED (WRONG_FACTION)", !rw.ok && rw.reason === "WRONG_FACTION", rw.detail);
  const wv = byId(base); wv.you.hand.push("Suryastra");
  const rv = solve(wv, null);
  ok("S8 · a Wave-1 card is REJECTED (NOT_LAUNCH) — the puzzles use the launch pool", !rv.ok && rv.reason === "NOT_LAUNCH", rv.detail);

  // the setup stops right after the opponent's Ravana: it is YOUR turn and they have NOT passed
  const notPassed = byId(base); notPassed.setup = notPassed.setup.slice(0, 4);
  const rn = solve(notPassed, null);
  ok("S9 · a position where the opponent has NOT passed is not a puzzle (NOT_A_PUZZLE)", !rn.ok && rn.reason === "NOT_A_PUZZLE", rn.detail);
  const ill = byId(base); ill.setup[0] = { side: "you", play: "Vajra", target: "Narakasura" }; ill.you.hand.push("Vajra");
  const ri = solve(ill, null);
  ok("S10 · an ILLEGAL setup step is rejected through the engine's own legality (Vajra with no target on the board)", !ri.ok && ri.reason === "ILLEGAL", ri.detail);
  const turn = byId(base); turn.setup[0].side = "them"; turn.setup[0].play = "Narakasura";
  const rt = solve(turn, null);
  ok("S11 · a setup step out of turn is rejected (ILLEGAL)", !rt.ok && rt.reason === "ILLEGAL" && /turn/.test(rt.detail), rt.detail);

  // the dice: Ahamkara's Chaos Surge lands on a RANDOM Asura Unit — with two on the board the position is luck
  const luck = byId("dp-2026-10-30");
  luck.setup = [{ side: "you", play: "Chandra Dev" }, { side: "them", play: "Bana Asura" }, { side: "you", play: "Marut" }, { side: "them", play: "Kali Asura" },
    { side: "you", play: "Gandharva" }, { side: "them", play: "Ahamkara", target: "Kali Asura" }, { side: "you", play: "Gandharva" }, { side: "them", pass: true }];
  const rl = solve(luck, null);
  ok("S12 · a position that depends on the dice is REJECTED (LUCK) — every puzzle is re-built under 8 seeds", !rl.ok && rl.reason === "LUCK", rl.detail);
}

// ── the free Leaps: a card that wins only through a Leap AFTER it lands, or BEFORE it, is found ──
{
  const after = { id: "leap-after", date: "2026-01-01", difficulty: "easy", mechanic: "leap", realm: "mrityulok", first: 1,
    you: { faction: "vanaras", hand: ["Jambavan", "Rama’s Signet", "Vanara Scout"] }, them: { faction: "devas", hand: ["Yama", "Marut", "Gandharva"] },
    setup: [{ side: "them", play: "Yama" }, { side: "you", play: "Jambavan" }, { side: "them", play: "Marut" }, { side: "you", play: "Rama’s Signet" }, { side: "them", pass: true }] };
  const ra = solve(after, { play: "Vanara Scout" });
  ok("L1 · a Scout that wins only by Leaping onto Jambavan AFTER it lands is found (12–9); without the Leap it would draw",
    ra.ok && ra.winners[0].play === "Vanara Scout" && ra.winners[0].you === 12 && ra.winners[0].them === 9, ra.detail);
  const before = { id: "leap-before", date: "2026-01-01", difficulty: "easy", mechanic: "leap", realm: "mrityulok", first: 1,
    you: { faction: "vanaras", hand: ["Jambavan", "Riksha", "Dadhimukha", "Vanara Scout", "Gandiva Arrow"] }, them: { faction: "devas", hand: ["Indra", "Yama", "Marut", "Deva Soldier"] },
    setup: [{ side: "them", play: "Indra" }, { side: "you", play: "Jambavan", pos: 0 }, { side: "them", play: "Yama" }, { side: "you", play: "Riksha", pos: 1 },
      { side: "them", play: "Marut" }, { side: "you", play: "Dadhimukha", pos: 2 }, { side: "them", play: "Deva Soldier" }, { side: "you", play: "Vanara Scout", pos: 1 }, { side: "them", pass: true }] };
  const rb = solve(before, null);
  ok("L2 · Gandiva Arrow wins only with a Leap BEFORE it (the Leap arms its second shaft) — the solver finds it; Pass loses",
    rb.plays.some((p) => p.play === "Gandiva Arrow" && p.win) && rb.plays.some((p) => p.key === "Pass" && !p.win), JSON.stringify(rb.plays.map((p) => [p.key, p.win])));
  ok("L3 · …and because its second shaft picks its own mark, two Gandiva targets win the same way: that position is (rightly) not a puzzle",
    !rb.ok && rb.reason === "TWO_WINS");
}

// ── the realm is the lesson, not decoration (named by date — no winning play named) ──
{
  const y = byId("dp-2026-11-01"); y.realm = "mrityulok";
  const ry = solve(y, null);
  ok("M1 · Yaksha is the lesson: the same 2026-11-01 position outside Yaksha has TWO winners", !ry.ok && ry.reason === "TWO_WINS", ry.detail);
  const k = byId("dp-2026-10-24"); k.realm = "mrityulok";
  const rk = solve(k, null);
  ok("M2 · Kalki is the lesson: outside Kalki the approved 2026-10-24 play is no longer the one winner", !(rk.ok && approved(k, rk.winners[0])));
}

console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
if (fail) process.exitCode = 1;
