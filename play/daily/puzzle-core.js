/* MINI-GAMES-1 · R1 — THE DAILY PUZZLE CORE (load · candidates · solve). UMD: browser `window.DY_PUZZLE`, Node `require`.
 *
 * THE LAW: this file never re-implements a rule. A puzzle position is BUILT by replaying a short setup script through the
 * site's copy of the real engine (game/src/engine.js — the game repo's engine, byte-identical, passed in as `E`), and every
 * candidate answer is judged by playing it through that same engine and letting the engine score the round. Shields,
 * Venom Tokens, Chaos Surges, Leaps and realm effects all arise the way they do in a real match — none is poked in.
 *
 * THE PUZZLE (one entry of play/daily/puzzles.json):
 *   { id, date:"YYYY-MM-DD", title, difficulty:"easy"|"medium"|"hard", mechanic, realm,
 *     first: 0|1,                         who takes the first turn of the setup (0 = you)
 *     you:  { faction, hand:[names], deck?:[names] },   deck = your draw pile, top first (optional)
 *     them: { faction, hand:[names], deck?:[names] },
 *     setup:[ { side:"you"|"them", play:"Name", target?:"Name" | "Name#2", pos?:n } | { side, pass:true } ] }
 *   After the setup the opponent must have PASSED and it must be your turn: you make ONE play, then pass, and the
 *   engine scores the round. A puzzle is valid only if EXACTLY ONE play wins that round (see solve()).
 *
 * NO ANSWER KEY is shipped or committed. solve() finds the one winning play itself; the tests compare its salted
 * fingerprint with tests/fixtures/daily-answers.sha256.json, and the page judges a play by replaying it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DY_PUZZLE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];            // every position and every outcome must be identical under all of them
  var DIFFS = ["easy", "medium", "hard"];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // newGame's FIRST rng draw is the coin flip (an explicit scenario deck and a fixed realm consume none before it), so
  // the flip is answered from `first` and everything after comes from the seeded stream.
  function puzzleRng(first, seed) {
    var flipped = false, r = mulberry32(seed);
    return function () { if (!flipped) { flipped = true; return first === 0 ? 0.25 : 0.75; } return r(); };
  }

  function fail(code, msg) { var e = new Error(code + ": " + msg); e.code = code; throw e; }
  function isNames(a) { return Array.isArray(a) && a.every(function (n) { return typeof n === "string" && n.length; }); }

  // ── VALIDATE: shape, real card names, the side's own faction, the launch pool only. Throws a coded error. ──
  function validate(P, E) {
    if (!P || typeof P !== "object") fail("MALFORMED", "the puzzle is not an object");
    if (typeof P.id !== "string" || !P.id) fail("MALFORMED", "id is missing");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(P.date))) fail("MALFORMED", "date must be YYYY-MM-DD");
    if (DIFFS.indexOf(P.difficulty) < 0) fail("MALFORMED", "difficulty must be easy, medium or hard");
    if (typeof P.mechanic !== "string" || !P.mechanic) fail("MALFORMED", "mechanic is missing");
    if (E.REALMS.indexOf(P.realm) < 0) fail("MALFORMED", "unknown realm '" + P.realm + "'");
    if (P.first !== 0 && P.first !== 1) fail("MALFORMED", "first must be 0 (you) or 1 (them)");
    ["you", "them"].forEach(function (s) {
      var side = P[s];
      if (!side || typeof side !== "object") fail("MALFORMED", s + " is missing");
      if (!E.DECKS[side.faction]) fail("MALFORMED", s + ": unknown faction '" + side.faction + "'");
      if (!isNames(side.hand) || !side.hand.length) fail("MALFORMED", s + ".hand must be a list of card names");
      if (side.deck != null && !isNames(side.deck)) fail("MALFORMED", s + ".deck must be a list of card names");
      side.hand.concat(side.deck || []).forEach(function (n) {
        var any = Object.keys(E.DECKS).some(function (f) { return E.DECKS[f].some(function (d) { return d.n === n; }); });
        if (!any) fail("UNKNOWN_CARD", "no card is named '" + n + "'");
        var def = E.DECKS[side.faction].filter(function (d) { return d.n === n; })[0];
        if (!def) fail("WRONG_FACTION", "'" + n + "' is not a " + side.faction + " card");
        if (def.wave) fail("NOT_LAUNCH", "'" + n + "' is a Wave-1 card (the puzzles use the launch pool)");
      });
    });
    if (!Array.isArray(P.setup)) fail("MALFORMED", "setup must be a list");
    P.setup.forEach(function (st, i) {
      if (!st || (st.side !== "you" && st.side !== "them")) fail("MALFORMED", "setup step " + (i + 1) + ": side must be you or them");
      if (!st.pass && typeof st.play !== "string") fail("MALFORMED", "setup step " + (i + 1) + ": needs play or pass");
    });
    return true;
  }

  function sideIdx(s) { return s === "you" ? 0 : 1; }
  // "Name" = the first option of that name; "Name#2" = the second
  function pickByName(list, ref) {
    var m = /^(.*)#(\d+)$/.exec(ref), name = m ? m[1] : ref, k = m ? Number(m[2]) : 1, seen = 0;
    for (var i = 0; i < list.length; i++) if (list[i].n === name && ++seen === k) return list[i];
    return null;
  }
  function refOf(list, card) {          // the stable name for a card among same-named options
    var k = 0;
    for (var i = 0; i < list.length; i++) { if (list[i].n === card.n) k++; if (list[i] === card) break; }
    var total = list.filter(function (c) { return c.n === card.n; }).length;
    return total > 1 ? card.n + "#" + k : card.n;
  }

  // one play through the engine's own legality: the card must be playable, a needed target must be a legal option
  function doPlay(E, g, pi, name, target, pos) {
    var pl = g.players[pi];
    var idx = -1, legal = E.playableIndices(g, pi);
    for (var i = 0; i < pl.hand.length; i++) if (pl.hand[i].n === name && legal.indexOf(i) >= 0) { idx = i; break; }
    if (idx < 0) fail("ILLEGAL", (pi ? "them" : "you") + ": '" + name + "' is not a legal play now");
    var spec = E.targetSpec(g, pi, pl.hand[idx]);
    var tUid = null;
    if (spec && spec.options && spec.options.length) {
      if (target == null) fail("ILLEGAL", "'" + name + "' needs a target");
      var t = pickByName(spec.options, target);
      if (!t) fail("ILLEGAL", "'" + target + "' is not a legal target for '" + name + "'");
      tUid = t.uid;
    } else if (target != null) fail("ILLEGAL", "'" + name + "' has no target to choose");
    E.playCard(g, pi, idx, tUid, pos == null ? null : pos);
  }

  // ── LOAD: the position after the setup, built by the engine. ──
  function load(P, E, seed) {
    validate(P, E);
    var g = E.newGame({
      p0: "You", p1: "Opponent", p0Faction: P.you.faction, p1Faction: P.them.faction, realm: P.realm,
      rng: puzzleRng(P.first, seed == null ? SEEDS[0] : seed),
      scenario: { p0Deck: P.you.hand.concat(P.you.deck || []), p1Deck: P.them.hand.concat(P.them.deck || []),
                  p0Hand: P.you.hand, p1Hand: P.them.hand, mulligan: 0 },
    });
    if (g.turn !== P.first) fail("MALFORMED", "the coin flip did not follow `first`");
    P.setup.forEach(function (st, i) {
      var pi = sideIdx(st.side);
      if (g.over) fail("ILLEGAL", "setup step " + (i + 1) + ": the match is already over");
      if (g.turn !== pi) fail("ILLEGAL", "setup step " + (i + 1) + ": it is not " + st.side + "'s turn");
      try {
        if (st.pass) E.pass(g, pi); else doPlay(E, g, pi, st.play, st.target, st.pos);
      } catch (e) { if (e.code) { e.message = "setup step " + (i + 1) + ": " + e.message; throw e; } throw e; }
    });
    if (g.over) fail("NOT_A_PUZZLE", "the match ended during the setup");
    if (!g.players[1].passed) fail("NOT_A_PUZZLE", "the opponent has not passed — the puzzle starts once they are out of the round");
    if (g.players[0].passed || g.turn !== 0) fail("NOT_A_PUZZLE", "it must be your turn, not passed");
    return g;
  }

  // what the player sees — used to prove the position does not depend on the seed
  function fingerprint(E, g) {
    function side(pi) {
      var p = g.players[pi];
      return {
        units: p.units.map(function (u) { return [u.n, E.effPower(g, pi, u), u.venom || 0, E.isShielded(g, pi, u) ? 1 : 0, u.ghost ? 1 : 0, u.bound ? 1 : 0]; }),
        heroes: p.heroes.map(function (h) { return [h.n, E.effPower(g, pi, h)]; }),
        artifact: p.artifact ? p.artifact.n : null, hand: p.hand.map(function (c) { return c.n; }).sort(),
        total: E.totalPower(g, pi), roundWins: p.roundWins, passed: p.passed,
      };
    }
    return JSON.stringify({ round: g.round, realm: g.realm, you: side(0), them: side(1) });
  }

  // ── CANDIDATES: every legal play from the position (card × legal target × slot), plus Pass. ──
  function candidates(E, g) {
    var pl = g.players[0], out = [{ key: "Pass", pass: true }];
    var legal = E.playableIndices(g, 0), seenCard = {};
    legal.forEach(function (i) {
      var c = pl.hand[i];
      if (seenCard[c.n]) return; seenCard[c.n] = true;                  // two copies of one card are one play
      var spec = E.targetSpec(g, 0, c);
      var targets = spec && spec.options && spec.options.length ? spec.options.map(function (t) { return refOf(spec.options, t); }) : [null];
      var slots = [null];
      if (c.t === "unit") { slots = []; for (var p = 0; p <= pl.units.length; p++) slots.push(p); }
      targets.forEach(function (t) {
        slots.forEach(function (s) { out.push({ key: c.n + (t ? " → " + t : ""), play: c.n, target: t, pos: s }); });
      });
    });
    return out;
  }

  // the player's free Leaps (Vanaras): every sequence the rules allow, before and/or after the card
  function leapPairs(E, g) {
    var pl = g.players[0], out = [];
    if (pl.faction !== "vanaras" || pl.leapsUsed >= E.leapLimit(pl)) return out;
    pl.units.forEach(function (u, i) {
      if (u.ghost) return;
      E.adjacentUnits(pl, u).forEach(function (t) { if (!t.ghost) out.push([i, pl.units.indexOf(t)]); });
    });
    return out;
  }
  function leapAt(E, g, pair) {
    var pl = g.players[0];
    E.doLeap(g, 0, pl.units[pair[0]], pl.units[pair[1]], false);
    E.sweepDeaths(g);
  }

  // play one candidate (with a given leap plan) from a fresh load; returns the round's scores
  function run(P, E, seed, cand, before, after) {
    var g = load(P, E, seed), round = g.round;
    before.forEach(function (pr) { leapAt(E, g, pr); });
    if (!cand.pass) {
      doPlay(E, g, 0, cand.play, cand.target, cand.pos);
      after.forEach(function (pr) { if (!g.over && g.round === round && g.turn === 0) leapAt(E, g, pr); });
    }
    if (!g.over && g.round === round && g.turn === 0 && !g.players[0].passed) E.pass(g, 0);
    var h = g.roundHistory.filter(function (x) { return x.round === round; })[0];
    if (!h) fail("ENGINE", "the round did not end after the pass");
    return { win: h.winner === 0, you: h.t0, them: h.t1, g: g, line: { pos: cand.pos == null ? null : cand.pos, before: before, after: after } };
  }
  // the best outcome of a candidate over every legal use of free Leaps (none, one before, one after, …up to the limit)
  function outcome(P, E, seed, cand) {
    var best = run(P, E, seed, cand, [], []);
    if (best.win) return best;
    var g0 = load(P, E, seed);
    if (g0.players[0].faction !== "vanaras") return best;
    var limit = E.leapLimit(g0.players[0]) - g0.players[0].leapsUsed;
    function better(r) { if (r.win || (!best.win && r.you - r.them > best.you - best.them)) best = r; }
    var pre = leapPairs(E, g0);
    pre.forEach(function (a) { try { better(run(P, E, seed, cand, [a], [])); } catch (e) { if (!e.code) throw e; } });
    if (!cand.pass) {
      var g1 = load(P, E, seed); doPlay(E, g1, 0, cand.play, cand.target, cand.pos);
      leapPairs(E, g1).forEach(function (b) { try { better(run(P, E, seed, cand, [], [b])); } catch (e) { if (!e.code) throw e; } });
      if (limit >= 2) pre.forEach(function (a) {
        leapPairs(E, g1).forEach(function (b) { try { better(run(P, E, seed, cand, [a], [b])); } catch (e) { if (!e.code) throw e; } });
      });
    }
    return best;
  }

  // ── SOLVE: valid only if EXACTLY ONE play wins the round, under every seed, and it is the stated answer. ──
  function solve(P, E, answer) {
    var res = { id: P && P.id, ok: false, reason: null, winners: [], plays: [] };
    try {
      validate(P, E);
      var g0 = load(P, E, SEEDS[0]), fp = fingerprint(E, g0);
      for (var s = 1; s < SEEDS.length; s++) {
        if (fingerprint(E, load(P, E, SEEDS[s])) !== fp) fail("LUCK", "the position changes with the dice (seed " + SEEDS[s] + ")");
      }
      res.position = JSON.parse(fp);
      var byKey = {};
      candidates(E, g0).forEach(function (c) {
        var o0 = outcome(P, E, SEEDS[0], c);
        for (var k = 1; k < SEEDS.length; k++) {
          var ok2 = outcome(P, E, SEEDS[k], c);
          if (ok2.win !== o0.win || ok2.you !== o0.you || ok2.them !== o0.them) fail("LUCK", "'" + c.key + "' depends on the dice");
        }
        var e = byKey[c.key] || (byKey[c.key] = { key: c.key, play: c.play || null, target: c.target || null, pass: !!c.pass, win: false, slots: [], you: o0.you, them: o0.them, line: null });
        if (o0.win) { if (!e.win) e.line = o0.line; e.win = true; e.you = o0.you; e.them = o0.them; if (c.pos != null) e.slots.push(c.pos); }
        else if (!e.win && (o0.you - o0.them > e.you - e.them)) { e.you = o0.you; e.them = o0.them; }
      });
      res.plays = Object.keys(byKey).map(function (k) { return byKey[k]; });
      res.winners = res.plays.filter(function (p) { return p.win; });
      if (res.winners.length === 0) fail("NO_WIN", "no play wins the round");
      if (res.winners.length > 1) fail("TWO_WINS", "more than one play wins: " + res.winners.map(function (w) { return w.key; }).join(" | "));
      var w = res.winners[0];
      if (answer) {
        if (w.play !== (answer.play || null) && !(answer.pass && w.key === "Pass")) fail("WRONG_ANSWER", "the one winning play is '" + w.key + "', not the stated answer");
        if ((answer.target || null) !== (w.target || null)) fail("WRONG_ANSWER", "the winning target is '" + w.target + "', not '" + answer.target + "'");
        if (answer.pos != null && !(w.slots.length === 1 && w.slots[0] === answer.pos)) fail("WRONG_ANSWER", "the winning slot(s) are " + JSON.stringify(w.slots) + ", not only " + answer.pos);
      }
      res.ok = true;
    } catch (e) {
      if (!e.code) throw e;
      res.reason = e.code; res.detail = e.message;
    }
    return res;
  }

  return { SEEDS: SEEDS, validate: validate, load: load, candidates: candidates, solve: solve, run: run, fingerprint: fingerprint, puzzleRng: puzzleRng };
});
