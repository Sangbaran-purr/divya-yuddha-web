#!/usr/bin/env node
"use strict";
// MINI-GAMES-1 R2 — build play/daily/notes.js from the owner's PLAIN answers file, which lives OUTSIDE both repos
// (default ~/Desktop/DY_daily_answers_batch1.txt). Each explanation is XOR-masked with a per-puzzle key and base64'd,
// so no explanation is plain text in this public repo. THIS STOPS ACCIDENTAL SPOILERS ONLY: the decoder ships with the
// page, so anyone who wants to can decode it. It is not secrecy.
//
//   node scripts/daily-notes-encode.js [path-to-plain-file]
const fs = require("fs"), path = require("path"), os = require("os");
const SITE = path.resolve(__dirname, "..");
const src = process.argv[2] || path.join(os.homedir(), "Desktop", "DY_daily_answers_batch1.txt");
const puzzles = JSON.parse(fs.readFileSync(path.join(SITE, "play", "daily", "puzzles.json"), "utf8"));
const plain = fs.readFileSync(src, "utf8");
const { encodeNote } = require(path.join(SITE, "play", "daily", "daily.js"));

// the file lists a batch in date order: "N. <Day> <d> <Mon> · <title> · …" then ONE explanation paragraph. Since the
// generator (scripts/daily-gen) the data holds more than one batch: each block is matched to its puzzle by its title
// (in date order, from the first title that matches) and merged into the explanations already encoded.
const blocks = plain.split(/\n(?=\d+\. )/).filter((b) => /^\d+\. /.test(b));
const titleIn = (line, P) => line.indexOf(" · " + P.title + " · ") >= 0 || line.indexOf(" · " + P.title.replace(/’/g, "'") + " · ") >= 0;
const startAt = puzzles.findIndex((P) => blocks.length && titleIn(blocks[0].split("\n")[0], P));
if (startAt < 0 || startAt + blocks.length > puzzles.length) throw new Error("the puzzles in " + src + " do not match a run of the data");
const out = Object.assign({}, require(path.join(SITE, "play", "daily", "notes.js")));
blocks.forEach((b, i) => {
  const P = puzzles[startAt + i], lines = b.split("\n");
  const text = lines.slice(1).filter((l) => l.trim() && !/^\s{2,}/.test(l)).join(" ").trim();   // indented lines are owner notes, never shipped
  if (!text) throw new Error("puzzle " + (i + 1) + " has no explanation");
  if (!titleIn(lines[0], P)) throw new Error("puzzle " + (i + 1) + " title does not match " + P.title);
  out[P.id] = encodeNote(P.id, text);
});
const body = "/* MINI-GAMES-1 R2 — Daily Puzzle explanations, ENCODED (scripts/daily-notes-encode.js builds this from the owner's\n"
  + "   plain file outside the repo). Decoded only after the puzzle is solved or the answer is shown. This stops ACCIDENTAL\n"
  + "   spoilers only — the decoder ships with the page. */\n"
  + "(function (root) { var N = " + JSON.stringify(out, null, 1) + ";\n"
  + "  if (typeof module === \"object\" && module.exports) module.exports = N; else root.DY_DAILY_NOTES = N;\n"
  + "})(typeof self !== \"undefined\" ? self : this);\n";
fs.writeFileSync(path.join(SITE, "play", "daily", "notes.js"), body);
console.log("wrote play/daily/notes.js — " + Object.keys(out).length + " encoded explanations");
