#!/usr/bin/env node
"use strict";
// MINI-GAMES-1 · DAILY PUZZLE AUTOMATION — write a generated run of puzzles into the site, the way batch 1 was written.
//
//   node scripts/daily-gen/batch.js --from 2026-10-29 --to 2026-11-11 [--plain <owner file>] [--dry] [--avoid-cards A,B]
//
// Into the REPO (all public): play/daily/puzzles.json gains the positions; tests/fixtures/daily-answers.sha256.json gains
// one salted fingerprint per winning play; play/daily/notes.js gains each explanation ENCODED (decoded only after a solve
// or a reveal). Into the OWNER's plain file OUTSIDE the repo (default ~/Desktop/DY_daily_answers_<from>.txt): every
// answer, position and explanation in plain words. THE LOG names no answer, no explanation and no position — only each
// date with what the page itself shows (difficulty, factions, realm, mechanic) — because a scheduled run's log is public.
const fs = require("fs"), path = require("path"), os = require("os");
const G = require("./lib.js");
const { answerDigest } = require(path.join(G.SITE, "scripts", "puzzle-answer-digest.js"));
const { encodeNote } = require(path.join(G.SITE, "play", "daily", "daily.js"));
const PUZ = path.join(G.SITE, "play", "daily", "puzzles.json"), FIX = path.join(G.SITE, "tests", "fixtures", "daily-answers.sha256.json");
const NOTES = path.join(G.SITE, "play", "daily", "notes.js");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const from = arg("--from"), to = arg("--to"), dry = process.argv.indexOf("--dry") >= 0;
// R4 (the weekly job): --quiet logs only dates and counts (a job's log is public: no faction, realm, mechanic, card or
// reason text); --out-json <file> writes the chosen NEW days' positions to a file OUTSIDE the repo and writes nothing else —
// the job re-judges them and writes the repo files itself
const quiet = process.argv.indexOf("--quiet") >= 0, outJson = arg("--out-json", "");
const say = (full, short) => console.log(quiet ? short : full);
if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) { console.error("usage: batch.js --from YYYY-MM-DD --to YYYY-MM-DD [--plain file] [--dry]"); process.exit(2); }
const plainPath = arg("--plain", path.join(os.homedir(), "Desktop", "DY_daily_answers_" + from + ".txt"));

const all0 = JSON.parse(fs.readFileSync(PUZ, "utf8"));
const dates = G.datesFrom(from, to);
// --recheck: re-judge the stored puzzles for these dates under today's rules (keeping those that pass); --veto d1,d2: those
// dates are replaced whatever happens (and their positions are never offered again)
const recheck = process.argv.indexOf("--recheck") >= 0, vetoed = (arg("--veto", "") || "").split(",").filter(Boolean);
const stored = all0.filter((p) => dates.indexOf(p.date) >= 0);
if (stored.length && !recheck) { console.error("refused: some of these dates already have a puzzle (use --recheck)"); process.exit(1); }
const existing = all0.filter((p) => dates.indexOf(p.date) < 0);
// --keep d1,d2: the owner kept these AS THEY ARE — copied unchanged (position, title, explanation), never re-judged
const kept = (arg("--keep", "") || "").split(",").filter(Boolean);
const { decodeNote } = require(path.join(G.SITE, "play", "daily", "daily.js"));
const notes0 = require(NOTES), pinned = {}, pinnedText = {};
stored.forEach((p) => { if (kept.indexOf(p.date) >= 0) { pinned[p.date] = p; pinnedText[p.date] = decodeNote(p.id, notes0[p.id]); } });
const keep = {}; stored.forEach((p) => { if (vetoed.indexOf(p.date) < 0 && kept.indexOf(p.date) < 0) keep[p.date] = p; });
const t0 = Date.now();
const genOpts = { keep, pinned, pinnedText, salt: arg("--salt", ""), avoid: stored.filter((p) => vetoed.indexOf(p.date) >= 0) };
// --parallel: each open day searched in its own process (workers), then one combination chosen for the whole run
async function parallel() {
  const { fork } = require("child_process");
  const slots = G.planSlots(dates);
  const ALL = ["mrityulok", "kalki", "kalki", "patala", "yaksha", "gandharva", "rishi", "swarga"];   // Kalki twice: it is the realm that separates plays
  // a RE-CHECKED day (not pinned, not vetoed): its stored position is re-judged under today's rules and, if it passes, is the
  // day's only candidate (its explanation rewritten by today's writer); if it fails, the day is searched like an open one
  const pools = {};
  slots.filter((s) => !pinned[s.date] && keep[s.date]).forEach((s) => {
    const P = keep[s.date], j = G.judge(P); if (!j.ok || j.gr.difficulty !== s.difficulty) return;
    pools[s.date] = [{ puzzle: Object.assign(JSON.parse(JSON.stringify(P)), { mechanic: j.mechanic }), mechanic: j.mechanic, play: j.winner.play, target: j.winner.target || null, isHero: false, traps: j.heroTraps.length, keptTitle: P.title, wrong: G.wrongCards(j.ex.text) }];
  });
  const open = slots.filter((s) => !pinned[s.date] && !pools[s.date]).map((s) => Object.assign(s, { you: null, them: null, realms: s.hero ? ["mrityulok", "kalki"] : ALL }));   // free pairs: the chooser balances
  const maxTries = +arg("--tries", "60000"), poolSize = +arg("--pool", "16"), limit = +arg("--workers", String(Math.min(8, require("os").cpus().length - 1)));
  let next = 0;
  await new Promise((done, fail) => {
    let running = 0;
    const launch = () => {
      while (running < limit && next < open.length) {
        const slot = open[next++], w = fork(path.join(__dirname, "worker.js"), [], { silent: true }); running++;
        w.on("message", (m) => { if (m.error) return fail(new Error(m.date + ": " + (quiet ? "worker failed" : m.error))); pools[m.date] = m.pool; console.log(m.date + "  " + m.pool.length + " candidates"); });
        w.on("exit", () => { running--; if (next >= open.length && running === 0) done(); else launch(); });
        w.send({ slot, opts: { maxTries, poolSize, salt: genOpts.salt } });
      }
    };
    if (!open.length) return done();   // nothing to search (every day kept or re-checked): resolve, or Node exits silently
    launch();
  });
  // --avoid-cards A,B: no NEW day may put these cards on your side — hand, board or Heroes (variety: a lesson another day
  // already carries)
  const avoidCards = (arg("--avoid-cards", "") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const yourSide = (P) => { const pl = G.PZ.load(P, G.E, G.PZ.SEEDS[0]).players[0]; return pl.hand.concat(pl.units, pl.heroes, pl.artifact ? [pl.artifact] : []); };
  if (avoidCards.length) open.forEach((s) => { pools[s.date] = (pools[s.date] || []).filter((c) => !yourSide(c.puzzle).some((h) => avoidCards.indexOf(h.n) >= 0)); console.log(s.date + "  " + pools[s.date].length + " candidates after avoiding"); });
  // a kept puzzle's Hero traps: a Hero in its hand that loses AND its stored explanation tells why
  const fixedTraps = {}; Object.values(pinned).forEach((p) => { const res = G.PZ.solve(p, G.E, null); fixedTraps[p.date] = G.heroTraps(p, res).filter((h) => (pinnedText[p.date] || "").indexOf(h + " falls short: ") >= 0).length; });
  // the variety rule's history (ruling 2026-10-25): every past and scheduled puzzle within 14 days of this run, with its winning
  // card and the cards its explanation tells as tempting-but-wrong
  const near = (d) => { const t = Date.parse(d), a = Date.parse(dates[0]), b = Date.parse(dates[dates.length - 1]); return t >= a - 14 * 864e5 && t <= b + 14 * 864e5; };
  const history = existing.concat(Object.values(pinned)).filter((p) => near(p.date)).map((p) => { let win = null; try { win = G.PZ.solve(p, G.E, null).winners[0].play; } catch (e) {}
    return { date: p.date, win, wrong: G.wrongCards(pinnedText[p.date] || decodeNote(p.id, notes0[p.id] || "")) }; });
  const c = G.choose(slots, pools, Object.values(pinned), existing, Object.assign({ fixedTraps, history }, genOpts));
  if (!c) throw new Error("no combination of the pools keeps every run rule — widen the search (--tries)");
  if (c.relaxed) console.log("variety rule relaxed for " + c.relaxed + " day(s)");   // a count only (the log may be public)
  return slots.map((s) => {
    if (pinned[s.date]) { const P = pinned[s.date], res = G.PZ.solve(P, G.E, null); return { puzzle: P, res, winner: res.winners[0], gr: G.grade(P, res), ex: { text: pinnedText[s.date] }, mechanic: P.mechanic, pinned: true }; }
    const P = c.pick[s.date], j = G.judge(P);
    if (!j.ok) throw new Error(s.date + ": the chosen puzzle no longer passes" + (quiet ? "" : " (" + j.reason + ")"));
    return Object.assign(j, { puzzle: P, mechanic: P.mechanic });
  });
}
(async () => {
const out = process.argv.indexOf("--parallel") >= 0 ? await parallel() : G.generate(dates, existing, genOpts);
if (dates.length === 14) {
  const ht = {}; out.forEach((x) => { const res = x.res || G.PZ.solve(x.puzzle, G.E, null); ht[x.puzzle.date] = G.heroTraps(x.puzzle, res).filter((h) => (x.ex.text || "").indexOf(h + " falls short: ") >= 0).length; });
  const errs = G.checkSpread(out.map((x) => x.puzzle), { heroTraps: ht }); if (errs.length) { console.error(quiet ? "refused: the run breaks " + errs.length + " spread rule(s)" : "refused: the run breaks a spread rule: " + errs.join("; ")); process.exit(1); }
}
if (!quiet) out.forEach((x) => console.log(x.puzzle.date + "  " + x.puzzle.difficulty.padEnd(6) + "  " + x.puzzle.you.faction + " vs " + x.puzzle.them.faction + "  " + x.puzzle.realm + "  " + x.mechanic + (recheck ? (x.pinned ? "  (kept by the owner)" : x.kept ? "  (kept)" : "  (new)") : "")));
console.log(out.length + " puzzles in " + ((Date.now() - t0) / 1000).toFixed(1) + "s" + (dry ? " (dry run: nothing written)" : ""));
if (outJson) {   // the job's road: the chosen new days only, positions as chosen (title, mechanic, difficulty set) — nothing else written
  fs.writeFileSync(outJson, JSON.stringify(out.filter((x) => !x.pinned).map((x) => x.puzzle)));
  console.log(out.filter((x) => !x.pinned).length + " new days handed to the job");
  process.exit(0);
}
if (dry) process.exit(0);

// the repo: positions, fingerprints, encoded explanations
const all = existing.concat(out.map((x) => x.puzzle)).sort((a, b) => (a.date < b.date ? -1 : 1));   // replaces this run's dates
fs.writeFileSync(PUZ, "[\n" + all.map((p) => "  " + JSON.stringify(p)).join(",\n") + "\n]\n");   // the file's own layout: one puzzle per line
const fx = JSON.parse(fs.readFileSync(FIX, "utf8"));
out.forEach((x) => { fx.digests[x.puzzle.id] = answerDigest(fx.salt, x.puzzle.id, x.winner.play, x.winner.target); });
fs.writeFileSync(FIX, JSON.stringify(fx, null, 2) + "\n");
const notesNow = require(NOTES);   // UMD: Node gets the encoded map
const merged = Object.assign({}, notesNow);
out.forEach((x) => { merged[x.puzzle.id] = encodeNote(x.puzzle.id, x.ex.text); });
const src = fs.readFileSync(NOTES, "utf8");
const head = src.slice(0, src.indexOf("(function (root) { var N = "));
const tail = src.slice(src.indexOf(";\n", src.indexOf("var N = ")) + 2);
fs.writeFileSync(NOTES, head + "(function (root) { var N = " + JSON.stringify(merged, null, 1) + ";\n" + tail);

// the owner's plain file, OUTSIDE the repo
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (d) => { const t = new Date(d + "T00:00:00Z"); return DAY[t.getUTCDay()] + " " + t.getUTCDate() + " " + MON[t.getUTCMonth()]; };
let txt = "DIVYA YUDDHA — DAILY PUZZLE, " + nice(from) + " – " + nice(to) + " " + from.slice(0, 4) + " — ANSWERS AND EXPLANATIONS (GENERATED)\n"
  + "Owner copy. Kept OUTSIDE both repos on purpose: the repos are public, so the answer key is never committed.\n"
  + "Built by scripts/daily-gen (the site's engine copy + the existing solver). Indented lines are notes for you; the\n"
  + "unindented paragraph under each puzzle is the explanation the page shows after a solve or a reveal.\n\n";
out.forEach((x, i) => {
  const w = x.winner, P = x.puzzle;
  txt += (i + 1) + ". " + nice(P.date) + " · " + P.title + " · " + P.difficulty + " · " + P.mechanic + " · " + (w.play || "PASS").toUpperCase() + (w.target ? " on " + G.clean(w.target).toUpperCase() : "") + "\n"
    + "    Position: " + G.describe(P) + "\n"
    + "    Graded " + P.difficulty + ": " + x.gr.plays + " plays, " + x.gr.near + " that lose by 3 or less, " + x.gr.bigger + " card(s) that look stronger than the answer.\n"
    + x.ex.text + "\n\n";
});
fs.writeFileSync(plainPath, txt);
console.log("wrote the repo files and the owner's plain file (outside the repo)");
})().catch((e) => { const m = String(e && e.message || e); console.error(quiet ? (/^\d{4}-\d{2}-\d{2}: /.test(m) ? m.slice(0, 12) + "failed" : /no combination/.test(m) ? "no combination keeps every run rule" : "generator failed") : m); process.exit(1); });
