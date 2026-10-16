#!/usr/bin/env node
"use strict";
// MINI-GAMES-1 · DAILY PUZZLE AUTOMATION — write a generated run of puzzles into the site, the way batch 1 was written.
//
//   node scripts/daily-gen/batch.js --from 2026-10-29 --to 2026-11-11 [--plain <owner file>] [--dry]
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
if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) { console.error("usage: batch.js --from YYYY-MM-DD --to YYYY-MM-DD [--plain file] [--dry]"); process.exit(2); }
const plainPath = arg("--plain", path.join(os.homedir(), "Desktop", "DY_daily_answers_" + from + ".txt"));

const existing = JSON.parse(fs.readFileSync(PUZ, "utf8"));
const dates = G.datesFrom(from, to);
if (existing.some((p) => dates.indexOf(p.date) >= 0)) { console.error("refused: some of these dates already have a puzzle"); process.exit(1); }
const t0 = Date.now();
const out = G.generate(dates, existing);
out.forEach((x) => console.log(x.puzzle.date + "  " + x.puzzle.difficulty.padEnd(6) + "  " + x.puzzle.you.faction + " vs " + x.puzzle.them.faction + "  " + x.puzzle.realm + "  " + x.mechanic));
console.log(out.length + " puzzles in " + ((Date.now() - t0) / 1000).toFixed(1) + "s" + (dry ? " (dry run: nothing written)" : ""));
if (dry) process.exit(0);

// the repo: positions, fingerprints, encoded explanations
const all = existing.concat(out.map((x) => x.puzzle)).sort((a, b) => (a.date < b.date ? -1 : 1));
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
