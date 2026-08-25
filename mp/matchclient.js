/* Divya Yuddha — MATCH CLIENT (M-P3). The client half of the wire match: connects to the match server over WS,
 * authenticates (throwaway wallet or dev paste-address), drives the lobby (open/join a table), and runs a local
 * MIRROR of the byte-identical engine (owner ruling Q1 — MIRROR for the free era). The server is AUTHORITATIVE:
 * the client sends move INTENTS and applies moves only when the server RELAYS them (lockstep, seq-ordered), so the
 * mirror stays in step with the server's canonical instance. Hidden info is NOT redacted here (peekable) — accepted
 * for FREE matches; a redacted thin-client view is the M-P5 money-gate (on record).
 *
 * `E` = the engine adapter (window globals from the synced game/src/engine.js). `W` = the M-P2 wrapper (applyMove).
 * UMD: window.DYMatchClient.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.DYMatchClient = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // seeded PRNG — MUST be byte-identical to services/match-server/src/rng.js, or the mirror desyncs from the server.
  function seeded(seed) {
    var s = seed >>> 0;
    return function () { s |= 0; s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  var LOGIN = "Divya Yuddha — match server login\nnonce: ";

  function createClient(deps) {
    var E = deps.E, W = deps.W, ethers = deps.ethers, log = deps.log || function () {};
    var onUpdate = deps.onUpdate || function () {};
    var ws = null, nonce = null, devMode = false;
    var me = null;                 // my address
    var tables = [];
    var match = null;              // { matchId, seat, opponent, seed, factions, winTarget }
    var g = null;                  // the local mirror
    var phase = null, turn = null, lastSeq = 0, outcome = null, lastReject = null;

    function send(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) {} }

    function view() {
      if (!g || !match) return { screen: "lobby", me: me, tables: tables, connected: !!(ws && ws.readyState === 1) };
      var seat = match.seat, mine = g.players[seat], opp = g.players[1 - seat];
      var legal = (phase === "play" && turn === seat) ? E.playableIndices(g, seat) : [];
      return {
        screen: "match", me: me, matchId: match.matchId, seat: seat, phase: phase, turn: turn, myTurn: turn === seat,
        opponent: match.opponent, round: g.round, roundWins: [g.players[0].roundWins, g.players[1].roundWins], winTarget: g.winTarget,
        myName: mine.name, myFaction: mine.faction, oppName: opp.name, oppFaction: opp.faction,
        myHand: mine.hand.map(function (c, i) { return { i: i, uid: c.uid, n: c.n, t: c.t, p: c.p, playable: legal.indexOf(i) >= 0 }; }),
        myUnits: mine.units.filter(function (u) { return !u.ghost; }).map(function (u) { return { uid: u.uid, n: u.n, power: E.effPower ? E.effPower(g, seat, u) : u.power }; }),
        oppUnits: opp.units.filter(function (u) { return !u.ghost; }).map(function (u) { return { uid: u.uid, n: u.n, power: E.effPower ? E.effPower(g, 1 - seat, u) : u.power }; }),
        oppHandCount: opp.hand.length, // COUNT only in the UI (peekable in memory — the free-era cost, Q1)
        myMulliganed: mine.mulliganed, oppMulliganed: opp.mulliganed,
        outcome: outcome, lastReject: lastReject,
      };
    }
    function push() { try { onUpdate(view()); } catch (e) {} }

    function targetSpecFor(handIndex) {
      if (!g || !match) return null;
      var card = g.players[match.seat].hand[handIndex];
      return E.targetSpec ? E.targetSpec(g, match.seat, card) : null;
    }

    // apply a server-relayed move to the MIRROR — INDEX-BASED (re-resolve every index to THIS instance's uids).
    function applyRelayed(mv) {
      var pi = mv.seat, pl = g.players[pi];
      if (mv.type === "mulligan") { E.mulligan(g, pi, mv.indices.map(function (ix) { return pl.hand[ix].uid; })); return; }
      if (mv.type === "play") {
        var card = pl.hand[mv.handIndex], targetUid = null;
        if (mv.targetIndex != null) { var spec = E.targetSpec(g, pi, card); if (spec && spec.options) targetUid = spec.options[mv.targetIndex].uid; }
        E.playCard(g, pi, mv.handIndex, targetUid, mv.position != null ? mv.position : null, mv.movePosition != null ? mv.movePosition : null); return;
      }
      if (mv.type === "pass") { E.pass(g, pi); return; }
      if (mv.type === "shield") { E.designateShield(g, pi, pl.units[mv.unitIndex].uid); return; }
      if (mv.type === "leap") { E.doLeap(g, pi, pl.units[mv.leaperIndex], pl.units[mv.targetIndex], false); return; }
    }

    function handle(m) {
      if (m.type === "challenge") { nonce = m.nonce; devMode = !!m.devMode; log("challenge"); push(); return; }
      if (m.type === "authed") { me = m.address; log("authed " + (m.dev ? "(dev) " : "") + m.address); push(); return; }
      if (m.type === "auth-error") { lastReject = "auth: " + m.error; log("AUTH REJECTED " + m.error); push(); return; }
      if (m.type === "tables") { tables = m.tables; push(); return; }
      if (m.type === "opened") { log("opened table " + m.table.id); return; }
      if (m.type === "error") { lastReject = m.error; log("ERROR " + m.error); push(); return; }
      if (m.type === "match") {
        match = { matchId: m.matchId, seat: m.seat, opponent: m.opponent, seed: m.seed, winTarget: m.winTarget };
        // build the MIRROR — identical newGame args on both clients + the server → identical deterministic deal
        g = E.newGame({ p0: m.p0, p1: m.p1, p0Faction: m.p0Faction, p1Faction: m.p1Faction, rng: seeded(m.seed) });
        phase = "mulligan"; turn = g.turn; lastSeq = 0; outcome = null; lastReject = null;
        log("match " + m.matchId + " — you are seat " + m.seat + " (" + (m.seat === 0 ? m.p0Faction : m.p1Faction) + ")");
        push(); return;
      }
      if (m.type === "phase") { phase = m.phase; push(); return; }
      if (m.type === "turn") { turn = m.seat; phase = m.phase || phase; push(); return; }
      if (m.type === "apply") {
        // the server VALIDATED this move; replay it on the mirror in seq order (lockstep). INDEX-BASED — the mirror
        // re-resolves each index to ITS OWN uid (engine uids are a per-instance global counter — never relayed).
        if (m.seq !== lastSeq + 1) log("⚠ seq gap: got " + m.seq + " expected " + (lastSeq + 1));
        lastSeq = m.seq;
        try { applyRelayed(m.move); } catch (e) { log("mirror apply error: " + e.message); }
        turn = g.turn;
        push(); return;
      }
      if (m.type === "reject") { lastReject = m.reason; log("REJECTED: " + m.reason); push(); return; }
      if (m.type === "result") { outcome = { kind: "result", winner: m.winner, roundWins: m.roundWins }; phase = "over"; log("RESULT winner=" + m.winner + " " + m.roundWins.join("-")); push(); return; }
      if (m.type === "abandoned") { outcome = { kind: "abandoned", reason: m.reason }; phase = "over"; log("ABANDONED: " + m.reason); push(); return; }
    }

    return {
      connect: function (url) {
        ws = new WebSocket(url);
        ws.onopen = function () { log("ws open " + url); push(); };
        ws.onclose = function () { log("ws closed"); push(); };
        ws.onerror = function () { log("ws error"); };
        ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } handle(m); };
      },
      authWallet: function () {
        if (!nonce) return; var w = ethers.Wallet.createRandom();
        w.signMessage(LOGIN + nonce).then(function (sig) { send({ type: "auth", signature: sig }); });
      },
      authDev: function (addr) { send({ type: "auth-dev", address: addr }); },
      isDevMode: function () { return devMode; },
      open: function (tier, faction) { lastReject = null; send({ type: "open", tier: tier, faction: faction }); },
      close: function (tableId) { send({ type: "close", tableId: tableId }); },
      join: function (tableId, faction) { lastReject = null; send({ type: "join", tableId: tableId, faction: faction }); },
      mulligan: function (indices) { send({ type: "move", matchId: match && match.matchId, action: { type: "mulligan", indices: indices || [] } }); },
      play: function (handIndex, targetIndex) { send({ type: "move", matchId: match && match.matchId, action: { type: "play", handIndex: handIndex, targetIndex: targetIndex != null ? targetIndex : null } }); },
      pass: function () { send({ type: "move", matchId: match && match.matchId, action: { type: "pass" } }); },
      concede: function () { send({ type: "move", matchId: match && match.matchId, action: { type: "concede" } }); },
      targetSpecFor: targetSpecFor,
      view: view,
      raw: { disconnect: function () { try { ws.close(); } catch (e) {} } },
    };
  }

  return { createClient: createClient, seeded: seeded };
});
