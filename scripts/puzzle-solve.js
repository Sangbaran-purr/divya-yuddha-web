#!/usr/bin/env node
"use strict";
// MINI-GAMES-1 · R1 — THE OFFLINE SOLVER. Runs every Daily Puzzle through the site's copy of the REAL engine
// (game/src/engine.js) and passes a puzzle only if EXACTLY ONE play wins the round, under every seed, and that play's
// salted fingerprint matches the approved one (tests/fixtures/daily-answers.sha256.json — no plain answer key exists
// in this repo).
//
//   node scripts/puzzle-solve.js            all puzzles, one line each (exit 1 on any failure) — NAMES NO ANSWER
//   node scripts/puzzle-solve.js --plays    …plus every candidate play and the round score it reaches (spoilers)
//   node scripts/puzzle-solve.js <id>       one puzzle, with every candidate play (spoilers)
const path = require("path"), fs = require("fs");
const SITE = path.resolve(__dirname, "..");
const E = require(path.join(SITE, "game", "src", "engine.js"));
const PZ = require(path.join(SITE, "play", "daily", "puzzle-core.js"));
const { answerDigest } = require(path.join(__dirname, "puzzle-answer-digest.js"));
const puzzles = JSON.parse(fs.readFileSync(path.join(SITE, "play", "daily", "puzzles.json"), "utf8"));
const FP = JSON.parse(fs.readFileSync(path.join(SITE, "tests", "fixtures", "daily-answers.sha256.json"), "utf8"));

const args = process.argv.slice(2);
const showPlays = args.indexOf("--plays") >= 0;
const pick = args.filter((a) => a.indexOf("--") !== 0);
let bad = 0;
for (const P of puzzles) {
  if (pick.length && pick.indexOf(P.id) < 0) continue;
  const r = PZ.solve(P, E, null);
  const w = r.ok ? r.winners[0] : null;
  const fpOk = !!w && FP.digests[P.id] === answerDigest(FP.salt, P.id, w.play, w.target);
  const ok = r.ok && fpOk;
  if (!ok) bad++;
  const spoil = showPlays || pick.length;
  console.log((ok ? "PASS " : "FAIL ") + P.id + " " + P.date + " [" + P.difficulty + " · " + P.mechanic + "] "
    + (!r.ok ? r.detail : !fpOk ? "the one winning play is NOT the approved one (fingerprint differs)"
      : "one winning play, matches the approved fingerprint" + (spoil ? " — " + w.key + " (" + w.you + "–" + w.them + ")" : "") + ", " + r.plays.length + " plays tried"));
  if (spoil) for (const p of r.plays || []) console.log("    " + (p.win ? "WIN " : "lose") + "  " + p.key + "  " + p.you + "–" + p.them);
}
console.log(bad ? bad + " PUZZLE(S) FAILED" : "ALL " + (pick.length || puzzles.length) + " PUZZLES SOLVE TO EXACTLY ONE WINNING PLAY — THE APPROVED ONE");
if (bad) process.exitCode = 1;
