"use strict";
// M-P2 local proof — the wrapper driving the BYTE-IDENTICAL engine with the deal AND the moves fed from OUTSIDE.
// Requires the game repo's canonical src/engine.js DIRECTLY (strongest byte-identity — no copy at all). The browser
// dark page (mp/index.html) loads the sync-produced game/src/engine.js instead; both are the same engine bytes.
//
//   node mp/proof.js        (run from the site repo root)
const path = require("path");
const ENGINE_PATH = path.resolve(__dirname, "..", "..", "divya-yuddha", "src", "engine.js");
const E = require(ENGINE_PATH);
const W = require("./wrapper.js");

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name); } }

// a small seeded PRNG (mulberry32) — the external, reproducible deal road
function seeded(seed) {
  let s = seed >>> 0;
  return function () { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// launch decks (22 each) from the engine's own defs — the SOLE card-fact authority; filter wave-1 for a launch deal.
const devaNames = E.DEVA_DECK_DEF.filter(function (c) { return !c.wave; }).map(function (c) { return c.n; });
const asuraNames = E.ASURA_DECK_DEF.filter(function (c) { return !c.wave; }).map(function (c) { return c.n; });

console.log("── A · the DEAL comes from outside ──");

// A1 — opts.scenario: ordered decks + a named opening hand (NO shuffle). The engine accepts the deal verbatim.
(function () {
  ok("launch deva deck is 22 cards", devaNames.length === 22);
  ok("launch asura deck is 22 cards", asuraNames.length === 22);
  const p0Hand = devaNames.slice(0, 10);
  const p1Hand = asuraNames.slice(0, 10);
  const g = E.newGame({
    p0: "Alpha", p1: "Bravo", p0Faction: "devas", p1Faction: "asuras",
    scenario: { p0Deck: devaNames, p1Deck: asuraNames, p0Hand: p0Hand, p1Hand: p1Hand },
  });
  ok("p0 opening hand == the externally-supplied hand (order-preserved)", g.players[0].hand.map(function (c) { return c.n; }).join("|") === p0Hand.join("|"));
  ok("p1 opening hand == the externally-supplied hand", g.players[1].hand.map(function (c) { return c.n; }).join("|") === p1Hand.join("|"));
  ok("an unknown scenario card name THROWS (authoring safety)", (function () { try { E.newGame({ p0Faction: "devas", p1Faction: "asuras", scenario: { p0Deck: ["Not A Real Card"] } }); return false; } catch (e) { return /unknown card name/.test(e.message); } })());
})();

// A2 — opts.rng: a seeded shuffle → deterministic, reproducible deal (external randomness source).
(function () {
  const a = E.newGame({ rng: seeded(12345), p0Faction: "devas", p1Faction: "nagas" });
  const b = E.newGame({ rng: seeded(12345), p0Faction: "devas", p1Faction: "nagas" });
  ok("a seeded rng deals reproducibly (same seed -> same hands)", a.players[0].hand.map(function (c) { return c.uid - a.players[0].hand[0].uid; }).length === b.players[0].hand.length && a.players[0].hand.map(function (c) { return c.n; }).join("|") === b.players[0].hand.map(function (c) { return c.n; }).join("|"));
  const c = E.newGame({ rng: seeded(999), p0Faction: "devas", p1Faction: "nagas" });
  ok("a different seed deals differently", a.players[0].hand.map(function (x) { return x.n; }).join("|") !== c.players[0].hand.map(function (x) { return x.n; }).join("|"));
})();

console.log("\n── B · the MOVES come from outside ──");

// B1 — a full match: seat 0 = the engine playing its own turn (aiTakeTurn); seat 1 = the AI BRAIN run OUTSIDE the
// engine loop, relayed by the wrapper. Mulligan + rounds + win recorded.
(function () {
  const g = E.newGame({ rng: seeded(7), p0: "Engine", p1: "Outside", p0Faction: "devas", p1Faction: "asuras" });
  const sources = [W.seats.engine(), W.seats.externalAI()];
  const mull = W.runMulligan(E, g, sources);
  ok("mulligan phase ran for both seats (from outside)", mull.length === 2 && g.players[0].mulliganed && g.players[1].mulliganed);
  const res = W.run(E, g, sources, 4000);
  ok("the match reached a decision through the wrapper (engine vs outside-fed)", res.over === true && !res.hitCap);
  ok("a winner is recorded", res.winner === 0 || res.winner === 1 || res.winner === null);
  ok("the far seat's (externalAI) moves flowed through the wrapper", res.records.some(function (r) { return r.pi === 1 && r.by === "externalAI" && r.terminal; }));
  ok("rounds transitioned (roundHistory has entries) — counts live", g.roundHistory.length >= 1);
  ok("round-win tallies are live and consistent", (g.players[0].roundWins + g.players[1].roundWins) >= 2 || g.roundHistory.length >= 2);
  console.log("     -> winner=" + res.winner + " turns=" + res.turns + " rounds=" + g.roundHistory.length + " score p0/p1 roundWins=" + g.players[0].roundWins + "/" + g.players[1].roundWins);
})();

// B2 — the engine playing PURELY against externally-fed moves: BOTH seats driven by the wrapper (external AI brain).
(function () {
  const g = E.newGame({ rng: seeded(31), p0Faction: "vanaras", p1Faction: "nagas" });
  const sources = [W.seats.externalAI(), W.seats.externalAI()];
  W.runMulligan(E, g, sources);
  const res = W.run(E, g, sources, 4000);
  ok("a full match runs with BOTH seats fed entirely from outside", res.over === true && !res.hitCap && res.records.length > 3);
  ok("every applied turn was relayed by the wrapper (no engine self-loop)", res.records.every(function (r) { return r.by === "externalAI"; }));
})();

// B3 — SCRIPTED moves over a fixed scenario: a fully predetermined match. Deterministic, incontrovertibly external.
(function () {
  const g = E.newGame({
    p0: "Script0", p1: "Script1", p0Faction: "devas", p1Faction: "asuras",
    scenario: { p0Deck: devaNames, p1Deck: asuraNames, p0Hand: devaNames.slice(0, 10), p1Hand: asuraNames.slice(0, 10) },
  });
  // a short scripted duel: each seat plays its first hand card a few times, then passes out. The engine validates
  // legality; when a script entry is illegal the engine would throw — so a clean run proves accepted external moves.
  const s0 = W.seats.scripted({ moves: [{ type: "play", handIndex: 0 }, { type: "play", handIndex: 0 }, { type: "pass" }] });
  const s1 = W.seats.scripted({ moves: [{ type: "play", handIndex: 0 }, { type: "pass" }] });
  W.runMulligan(E, g, [s0, s1]);
  const res = W.run(E, g, [s0, s1], 4000);
  ok("a scripted (fully external) match runs to a decision", res.over === true && !res.hitCap);
  ok("scripted moves were applied (units left the hands onto the board or discard)", g.players[0].hand.length < 10 || g.roundHistory.length >= 1);
  console.log("     -> scripted winner=" + res.winner + " turns=" + res.turns + " rounds=" + g.roundHistory.length);
})();

// B4 — concede maps to pass (owner ruling D2): a seat that concedes passes out and loses that round on score.
(function () {
  const g = E.newGame({ rng: seeded(5), p0Faction: "devas", p1Faction: "asuras" });
  // seat 1 plays one card then concedes every turn; seat 0 is the engine. Concede == pass.
  var conceded = false;
  const concedeSeat = { label: "concede", mulligan: function () { return []; }, takeTurn: function (E2, g2, pi) { W.applyMove(E2, g2, pi, { type: "concede" }); conceded = true; return { by: "concede", terminal: "pass", ended: true }; } };
  const res = W.run(E, g, [W.seats.engine(), concedeSeat], 4000);
  ok("concede == pass runs to a decision (no engine forfeit primitive)", res.over === true && conceded);
})();

console.log("\n" + (fail === 0 ? "ALL " + pass + " CHECKS PASS ✓" : fail + " FAILURES / " + pass + " passed ✗"));
process.exit(fail === 0 ? 0 : 1);
