/* Divya Yuddha — MULTIPLAYER WRAPPER (M-P2). MULTIPLAYER_DESIGN_v1 §2 ruling 4: the engine is byte-identical and the
 * SOLE card-fact authority; the wrapper is a SHELL that feeds it moves. This file NEVER edits the engine — it drives
 * the engine's PUBLIC API from OUTSIDE (Node module.exports / browser window function-declarations). The engine runs
 * no loop of its own; the wrapper IS the loop, presenting a second seat and relaying each seat's moves in.
 *
 * The deal comes from outside via newGame(opts) — opts.scenario (ordered decks/hands) and/or opts.rng (seeded shuffle).
 * A seat is driven by one of three sources:
 *   - engine   : the engine plays its own turn (E.aiTakeTurn) — "the engine playing".
 *   - externalAI: the AI BRAIN runs OUTSIDE the engine loop — the wrapper calls E.aiMove/E.bestLeap for the DECISION
 *                 and APPLIES it via E.doLeap/E.playCard/E.pass — "moves fed from outside itself".
 *   - scripted : a predetermined move list supplied entirely from outside.
 * Concede maps to pass (owner ruling D2) — no engine forfeit primitive.
 *
 * UMD: require() in Node, window.DYWrapper in the browser. `E` is the byte-identical engine module/global.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.DYWrapper = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- the PUBLIC-API router: turn a normalized move into an engine call. Free actions (leap/shield) do NOT end the
  //      turn; play/pass DO (they call the engine's internal afterAction, so the wrapper never needs afterAction). ----
  function applyMove(E, g, pi, mv) {
    if (mv.type === "leap") {
      var pl = g.players[pi];
      var leaper = pl.units.find(function (u) { return u.uid === mv.leaper; });
      var target = pl.units.find(function (u) { return u.uid === mv.target; });
      if (leaper && target) E.doLeap(g, pi, leaper, target, false);
      return { applied: "leap", ended: false };
    }
    if (mv.type === "shield") { E.designateShield(g, pi, mv.uid); return { applied: "shield", ended: false }; }
    if (mv.type === "pass" || mv.type === "concede") { E.pass(g, pi); return { applied: "pass", ended: true }; } // D2
    if (mv.type === "play") {
      E.playCard(g, pi, mv.handIndex,
        mv.targetUid != null ? mv.targetUid : null,
        mv.position != null ? mv.position : null,
        mv.movePosition != null ? mv.movePosition : null);
      return { applied: "play", ended: true };
    }
    throw new Error("wrapper: unknown move type '" + mv.type + "'");
  }

  // ---- SEAT SOURCES. Each is { mulligan(E,g,pi)->uids, takeTurn(E,g,pi)->record }. takeTurn MUST end the turn
  //      (apply exactly one play/pass) so g.turn advances or g.over trips. ----

  // engine seat — the engine plays its own turn (the reference AI, applied by the engine).
  function engineSeat() {
    return {
      label: "engine",
      mulligan: function (E, g, pi) { return E.aiMulliganPlan(g, pi); },
      takeTurn: function (E, g, pi) { E.aiTakeTurn(g, pi); return { by: "engine", ended: true }; },
    };
  }

  // externalAI seat — the AI brain runs OUTSIDE the engine loop: the wrapper takes the DECISION from E.aiMove /
  // E.bestLeap and APPLIES it through the public API. Mirrors aiTakeTurn's shape (free leaps, then one play/pass).
  // NOTE (M-P2 fidelity): placement is null (append) — E.aiPlacement is not exported; targets are null (engine
  // auto-picks, same as aiTakeTurn). An E.aiMove {unbind} decision is mapped to best-play/pass (no afterAction export),
  // a small, recorded AI simplification — the point is the engine ACCEPTS externally-supplied moves, not AI parity.
  function externalAISeat() {
    return {
      label: "externalAI",
      mulligan: function (E, g, pi) { return E.aiMulliganPlan(g, pi); },
      takeTurn: function (E, g, pi) {
        var rec = { by: "externalAI", frees: [], terminal: null, ended: true };
        var pl = g.players[pi];
        // free leaps first (advanced Vanara), exactly as aiTakeTurn orders them — decided by the engine, applied by us
        if (pl.faction === "vanaras") {
          var guard = 0;
          while (E.canLeap(g, pi) && guard++ < 4) {
            var bl = E.bestLeap(g, pi);
            if (!bl || bl.gain < 3) break;
            applyMove(E, g, pi, { type: "leap", leaper: bl.leaper.uid, target: bl.target.uid });
            rec.frees.push("leap");
          }
        }
        var mv = E.aiMove(g, pi); // the DECISION, taken outside the engine's own turn loop
        if (mv.pass) { applyMove(E, g, pi, { type: "pass" }); rec.terminal = "pass"; return rec; }
        if (mv.play != null) { applyMove(E, g, pi, { type: "play", handIndex: mv.play }); rec.terminal = "play"; return rec; }
        // {unbind} or anything else → play best legal, else pass (recorded simplification; keeps the turn valid)
        var idxs = E.playableIndices(g, pi);
        if (idxs.length) { applyMove(E, g, pi, { type: "play", handIndex: idxs[0] }); rec.terminal = "play*"; }
        else { applyMove(E, g, pi, { type: "pass" }); rec.terminal = "pass*"; }
        return rec;
      },
    };
  }

  // scripted seat — a predetermined move list supplied ENTIRELY from outside. Each entry is a normalized move
  // ({type:'play', handIndex,...} or {type:'pass'} ...); optional free actions can precede via {frees:[...]}.
  // When the script runs out, the seat passes (out for the round). Optional `mulliganUids` for the mulligan phase.
  function scriptedSeat(script) {
    var moves = (script && script.moves) ? script.moves.slice() : [];
    var mulliganUids = (script && script.mulliganUids) || [];
    return {
      label: "scripted",
      mulligan: function () { return mulliganUids; },
      takeTurn: function (E, g, pi) {
        var rec = { by: "scripted", frees: [], terminal: null, ended: true };
        var entry = moves.length ? moves.shift() : { type: "pass" };
        (entry.frees || []).forEach(function (f) { applyMove(E, g, pi, f); rec.frees.push(f.type); });
        var term = entry.frees ? entry : entry; // entry itself is the terminal (a play/pass)
        var r = applyMove(E, g, pi, { type: term.type, handIndex: term.handIndex, targetUid: term.targetUid, position: term.position, movePosition: term.movePosition });
        rec.terminal = term.type;
        return rec;
      },
    };
  }

  // ---- the mulligan phase (pre-Round-1) — each seat's uids come from OUTSIDE, the wrapper applies them. ----
  function runMulligan(E, g, sources) {
    var out = [];
    for (var pi = 0; pi < 2; pi++) {
      var uids = sources[pi].mulligan ? sources[pi].mulligan(E, g, pi) : [];
      var redrawn = E.mulligan(g, pi, uids || []);
      out.push({ pi: pi, tossed: (uids || []).length, redrawn: redrawn.length });
    }
    return out;
  }

  // ---- the loop: the wrapper drives turn by turn until the engine reports over. Asserts each turn actually ends
  //      (g.turn advances or g.over) so a broken source can't spin. ----
  function run(E, g, sources, maxTurns) {
    var records = [], guard = 0, cap = maxTurns || 4000;
    while (!g.over && guard++ < cap) {
      var pi = g.turn;
      var turnBefore = g.turn, logBefore = g.log.length;
      var rec = sources[pi].takeTurn(E, g, pi);
      rec.pi = pi;
      records.push(rec);
      // progress guard: the engine LOGS on every applied action. g.turn staying on `pi` is legitimate (an extra turn —
      // Mahabali/Blueprint grantExtraTurn), so we require PROGRESS (turn advanced OR the log grew OR the match ended),
      // never that the turn changed. A source that applied nothing makes no progress and is caught here, not at the cap.
      if (!g.over && g.turn === turnBefore && g.log.length === logBefore) {
        throw new Error("wrapper: seat " + pi + " (" + sources[pi].label + ") made no progress (no move applied)");
      }
    }
    return { over: g.over, winner: g.winner, turns: records.length, records: records, hitCap: guard >= cap };
  }

  return {
    applyMove: applyMove,
    runMulligan: runMulligan,
    run: run,
    seats: { engine: engineSeat, externalAI: externalAISeat, scripted: scriptedSeat },
  };
});
