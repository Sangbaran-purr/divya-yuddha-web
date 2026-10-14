"use strict";
// MINI-GAMES-1 — THE ANSWER FINGERPRINT. Both repos are public and Pages serves the whole site repo, so the answer key
// is never committed: each puzzle's approved winning play is kept only as a salted SHA-256 fingerprint
// (tests/fixtures/daily-answers.sha256.json). The solver finds the ONE winning play itself, fingerprints it, and compares.
// Honest limit: with a public salt and a handful of legal plays this hides nothing from someone who runs the solver —
// it keeps the answer out of plain sight (and turns any drift in the engine or the data into a red check).
const crypto = require("crypto");
function answerDigest(salt, id, play, target) {
  return crypto.createHash("sha256").update(String(salt) + "|" + id + "|" + play + "|" + (target || "")).digest("hex");
}
module.exports = { answerDigest };
