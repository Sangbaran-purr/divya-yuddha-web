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
    var ws = null, nonce = null, devMode = false, chain = null;
    var me = null;                 // my address
    var tables = [];
    var match = null;              // { matchId, seat, opponent, seed, factions, winTarget }
    var g = null;                  // the local mirror
    var phase = null, turn = null, lastSeq = 0, outcome = null, lastReject = null;
    var settlement = null;         // M-P5 — the signed slip + settle state (persisted, resume-able)
    var clock = null;              // M-P6 — { kind, seat, deadline, thinkMs, warnMs } (server-broadcast; client draws only)
    var vanish = null;             // M-P6 — { deadline } while the opponent is in the 90s grace
    var lossLimit = null;          // M-P6 — { cap, netLossToday, remaining }
    var authMode = null, authAddr = null; // for auto-reconnect: replay the same auth on a dropped socket
    var reconnecting = false;
    var redacted = false, serverView = null; // M-A3 — staked road: pure view renderer (no mirror `g`)

    // M-P5 slip persistence (persist-before-wait, resume): a received slip is saved locally so a dropped socket or a
    // reload never loses the winner's ability to cast settle. Keyed by escrowMatchId.
    function slipKey(eid) { return "dy_mp_slip_" + eid; }
    function persistSlip(s) { try { if (typeof localStorage !== "undefined" && s && s.escrowMatchId) localStorage.setItem(slipKey(s.escrowMatchId), JSON.stringify(s)); } catch (e) {} }
    function loadLatestUnsettledSlip() {
      try {
        if (typeof localStorage === "undefined") return null;
        var best = null;
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i); if (k.indexOf("dy_mp_slip_") !== 0) continue;
          var s = JSON.parse(localStorage.getItem(k) || "null");
          if (s && !s.settled && (!best || (s.at || 0) > (best.at || 0))) best = s;
        }
        return best;
      } catch (e) { return null; }
    }

    function send(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) {} }

    // M-A3 — normalize a server {view} to the same render shape the mirror `view()` produces (so wire.html renders both).
    function normalizeServerView(v) {
      return {
        screen: "match", me: me, matchId: v.matchId, seat: v.seat, phase: v.phase, turn: v.turn, myTurn: v.myTurn,
        opponent: match ? match.opponent : v.oppName, round: v.round, roundWins: v.roundWins, winTarget: v.winTarget,
        myName: v.myName, myFaction: v.myFaction, oppName: v.oppName, oppFaction: v.oppFaction,
        myHand: v.myHand.map(function (c) { return { i: c.i, n: c.n, t: c.t, p: c.p, playable: c.playable }; }),
        // board DISPLAY folds heroes in (targeting uses the server legal block, so conflation is display-only)
        myUnits: v.myUnits.concat(v.myHeroes || []).map(function (u) { return { uid: u.uid, n: u.n, power: u.power }; }),
        oppUnits: v.oppUnits.concat(v.oppHeroes || []).map(function (u) { return { uid: u.uid, n: u.n, power: u.power }; }),
        oppHandCount: v.oppHand.count, oppHandRevealed: !!v.oppHand.revealed, oppHandCards: v.oppHand.cards || null,
        myMulliganed: v.myMulliganed, oppMulliganed: v.oppMulliganed,
        outcome: outcome, lastReject: lastReject, settlement: settlement,
        clock: clock, vanish: vanish, lossLimit: lossLimit, reconnecting: reconnecting,
        redacted: true, legal: v.legal, lastMove: v.lastMove, deckCounts: v.deckCounts,
      };
    }
    function view() {
      if (redacted && serverView && match) return normalizeServerView(serverView);
      if (!g || !match) return { screen: "lobby", me: me, tables: tables, connected: !!(ws && ws.readyState === 1), settlement: settlement, lossLimit: lossLimit, reconnecting: reconnecting, lastReject: lastReject }; // S-HALL-L2: lastReject surfaces server refusals (FREE tier-0, join-not-locked, loss backstop) to the Hall
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
        outcome: outcome, lastReject: lastReject, settlement: settlement,
        clock: clock, vanish: vanish, lossLimit: lossLimit, reconnecting: reconnecting,
      };
    }
    function push() { try { onUpdate(view()); } catch (e) {} }

    function targetSpecFor(handIndex) {
      if (redacted) {
        // M-A3 — targets come FROM THE SERVER view (the client has no engine). Shape like E.targetSpec's return.
        if (!serverView || !serverView.legal) return null;
        var entry = serverView.legal.playable.find(function (p) { return p.i === handIndex; });
        if (!entry || !entry.needsTarget || !entry.targets) return null;
        return { kind: "server", options: entry.targets.map(function (t) { return { idx: t.idx, uid: t.uid, n: t.label }; }) };
      }
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
      if (m.type === "challenge") { nonce = m.nonce; devMode = !!m.devMode; log("challenge"); if (reconnecting && authMode) doAuth(); push(); return; }
      if (m.type === "authed") { me = m.address; log("authed " + (m.dev ? "(dev) " : "") + m.address); push(); return; }
      if (m.type === "auth-error") { lastReject = "auth: " + m.error; log("AUTH REJECTED " + m.error); push(); return; }
      if (m.type === "tables") { tables = m.tables; push(); return; }
      if (m.type === "opened") { log("opened table " + m.table.id); return; }
      if (m.type === "error") { lastReject = m.error; log("ERROR " + m.error); push(); return; }
      if (m.type === "match") {
        match = { matchId: m.matchId, seat: m.seat, opponent: m.opponent, seed: m.seed, winTarget: m.winTarget };
        // build the MIRROR — identical newGame args on both clients + the server → identical deterministic deal
        g = E.newGame({ p0: m.p0, p1: m.p1, p0Faction: m.p0Faction, p1Faction: m.p1Faction, rng: seeded(m.seed) });
        phase = "mulligan"; turn = g.turn; lastSeq = 0; outcome = null; lastReject = null; clock = null; vanish = null; reconnecting = false; redacted = false; serverView = null;
        log("match " + m.matchId + " — you are seat " + m.seat + " (" + (m.seat === 0 ? m.p0Faction : m.p1Faction) + ")");
        push(); return;
      }
      if (m.type === "match-redacted") {
        // M-A3 STAKED road — NO seed, NO mirror. The client is a pure view renderer; state arrives as {view}s.
        match = { matchId: m.matchId, seat: m.seat, opponent: m.opponent, winTarget: m.winTarget };
        redacted = true; g = null; serverView = null; outcome = null; lastReject = null; clock = null; vanish = null; reconnecting = false;
        log("staked match " + m.matchId + " (redacted) — you are seat " + m.seat + " (" + (m.seat === 0 ? m.p0Faction : m.p1Faction) + ")");
        push(); return;
      }
      if (m.type === "view") { serverView = m; redacted = true; reconnecting = false; if (m.over && !outcome) { /* {result} carries the canonical outcome */ } push(); return; }
      if (m.type === "phase") { phase = m.phase; push(); return; }
      if (m.type === "turn") { turn = m.seat; phase = m.phase || phase; push(); return; }
      if (m.type === "resync") {
        // M-P6 reconnect: the fresh {match} already rebuilt the mirror; replay the authoritative move log to catch up.
        lastSeq = 0; (m.moves || []).forEach(function (mv) { try { applyRelayed(mv); lastSeq++; } catch (e) { log("resync apply error: " + e.message); } });
        phase = m.phase; turn = (m.turn != null ? m.turn : g.turn); vanish = null; reconnecting = false;
        log("resynced " + (m.moves ? m.moves.length : 0) + " moves — back in the match"); push(); return;
      }
      if (m.type === "clock") { clock = { kind: m.kind, seat: m.seat, deadline: m.deadline, thinkMs: m.thinkMs, warnMs: m.warnMs }; push(); return; }
      if (m.type === "opponent-vanished") { vanish = { deadline: m.deadline, graceMs: m.graceMs }; clock = null; log("opponent disconnected — " + Math.round((m.graceMs || 90000) / 1000) + "s to reconnect"); push(); return; }
      if (m.type === "opponent-returned") { vanish = null; log("opponent reconnected — play resumes"); push(); return; }
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
      if (m.type === "result") { outcome = { kind: "result", winner: m.winner, roundWins: m.roundWins, forfeit: !!m.forfeit, reason: m.reason }; phase = "over"; clock = null; vanish = null; log("RESULT winner=" + m.winner + " " + m.roundWins.join("-") + (m.forfeit ? " (forfeit)" : "")); push(); return; }
      if (m.type === "abandoned") { outcome = { kind: "abandoned", reason: m.reason }; phase = "over"; clock = null; vanish = null; log("ABANDONED: " + m.reason); push(); return; }
      if (m.type === "settlement") {
        // the referee-signed slip. The WINNER casts settle from their own wallet (Q3); the loser gets it for
        // transparency; a draw lets either cast. Persist immediately (resume) BEFORE any wait.
        settlement = { escrowMatchId: m.escrowMatchId, stake: m.stake, result: m.result, resultName: m.resultName, youWon: !!m.youWon, winnerSeat: m.winnerSeat, slip: m.slip, refereeAddress: m.refereeAddress, forfeit: !!m.forfeit, settled: false, at: Date.now() };
        clock = null; vanish = null;
        persistSlip(settlement);
        log("settlement slip: " + m.resultName + (m.youWon ? " — you WON, cast settle to collect" : (m.result === 2 ? " — draw, cast to refund both" : " — opponent settles")));
        push(); return;
      }
      if (m.type === "settlement-error") { settlement = { error: m.error, at: Date.now() }; clock = null; vanish = null; log("settlement error: " + m.error); push(); return; }
      if (m.type === "loss-limit") { lossLimit = { cap: m.cap, netLossToday: m.netLossToday, remaining: m.remaining }; log("loss limit: " + (m.cap == null ? "none" : (BigInt(m.cap) / 1000000000000000000n) + " DYC/day, " + (BigInt(m.remaining) / 1000000000000000000n) + " left")); push(); return; }
    }

    // M-P6 — a STABLE session wallet (reused across auto-reconnects, so the server re-seats the SAME address). Replays
    // the stored auth on a fresh challenge.
    var sessionWallet = null, connectUrl = null;
    function doAuth() {
      if (authMode === "dev") { send({ type: "auth-dev", address: authAddr }); }
      else if (authMode === "wallet" && sessionWallet && nonce) { sessionWallet.signMessage(LOGIN + nonce).then(function (sig) { send({ type: "auth", signature: sig }); }); }
    }
    function openSocket() {
      ws = new WebSocket(connectUrl);
      ws.onopen = function () { log(reconnecting ? "ws reopened (resuming)" : ("ws open " + connectUrl)); push(); };
      ws.onclose = function () {
        // M-P6 — if a live match dropped, auto-reconnect once to land inside the vanish grace and resync.
        if (match && phase !== "over" && authMode && !reconnecting) { reconnecting = true; log("ws dropped — reconnecting to resume…"); push(); setTimeout(openSocket, 800); }
        else { log("ws closed"); push(); }
      };
      ws.onerror = function () { log("ws error"); };
      ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } handle(m); };
    }

    return {
      connect: function (url) { connectUrl = url; reconnecting = false; openSocket(); },
      authWallet: function () {
        if (!nonce) return; if (!sessionWallet) sessionWallet = ethers.Wallet.createRandom(); authMode = "wallet"; doAuth();
      },
      authDev: function (addr) { authMode = "dev"; authAddr = addr; send({ type: "auth-dev", address: addr }); },
      // M-P6 loss limits + slip re-request over the wire
      setLossLimit: function (amountWei) { send({ type: "set-loss-limit", amount: String(amountWei) }); },
      clearLossLimit: function () { send({ type: "clear-loss-limit" }); },
      getLossLimit: function () { send({ type: "get-loss-limit" }); },
      isDevMode: function () { return devMode; },
      open: function (tier, faction) { lastReject = null; send({ type: "open", tier: tier, faction: faction }); }, // FREE
      close: function (tableId) { send({ type: "close", tableId: tableId }); },
      join: function (tableId, faction) { lastReject = null; send({ type: "join", tableId: tableId, faction: faction }); }, // FREE (and STAKED — the server looks up the table's escrow itself and gates on verifyLocked)
      // S-HALL-L2 — SEND-ONLY staked open. The Hall casts approve+openMatch from the player's BROWSER wallet (its own
      //   persistPending road, not the private-key chain below), then hands the minted escrow matchId to the server here.
      //   Mirrors openStaked's server message exactly; the private-key openStaked stays the rig's road, untouched.
      stakedOpen: function (o) { lastReject = null; send({ type: "open", tier: o.friend ? 0 : o.tier, faction: o.faction, escrowMatchId: String(o.escrowMatchId), friend: !!o.friend, stake: o.friend ? String(o.stake) : undefined }); },
      // ---- M-P4 STAKED: users cast approve/open/join from THEIR OWN wallet (chain-first), then open/join the lobby
      //      table carrying the escrow matchId. The store buy flow is the precedent. LIQUID source only this rung. ----
      setChain: function (o) {
        var provider = new deps.ethers.JsonRpcProvider(o.rpcUrl);
        var wallet = new deps.ethers.Wallet(o.privateKey, provider);
        var ERC20 = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"];
        var ESC = ["function openMatch(uint256,address,uint8) returns (uint256)", "function joinMatch(uint256,uint8)", "function settle(uint256,uint8,bytes)", "function matches(uint256) view returns (address playerA, address playerB, uint256 stake, uint8 srcA, uint8 srcB, address expectedOpponent, uint64 matchedAt, uint8 state)", "event MatchOpened(uint256 indexed id, address indexed opener, uint256 stake, address expectedOpponent, uint8 source)"];
        chain = { wallet: wallet, escrowAddr: o.escrowAddr, dycAddr: o.dycAddr, dyc: new deps.ethers.Contract(o.dycAddr, ERC20, wallet), escrow: new deps.ethers.Contract(o.escrowAddr, ESC, wallet), ZERO: deps.ethers.ZeroAddress };
        return wallet.address;
      },
      // openStaked(tier, faction, stakeWei[, friendAddr]) — approve → openMatch → open the lobby table with the escrow id
      openStaked: function (tier, faction, stakeWei, friendAddr) {
        lastReject = null; if (!chain) return Promise.reject(new Error("setChain first"));
        var stake = BigInt(stakeWei);
        // M-P6 client-side pre-cast loss gate (the real UX guard; the server backstops after the cast).
        if (lossLimit && lossLimit.cap != null && BigInt(lossLimit.remaining) < stake) return Promise.reject(new Error("daily loss limit — this stake exceeds your remaining headroom (" + (BigInt(lossLimit.remaining) / 1000000000000000000n) + " DYC). Raise or clear the limit first."));
        return chain.dyc.approve(chain.escrowAddr, stake).then(function (t) { return t.wait(); }).then(function () {
          return chain.escrow.openMatch(stake, friendAddr || chain.ZERO, 0).then(function (t) { return t.wait(); });
        }).then(function (rc) {
          var id = null; rc.logs.forEach(function (l) { try { var p = chain.escrow.interface.parseLog(l); if (p && p.name === "MatchOpened") id = p.args.id; } catch (e) {} });
          send({ type: "open", tier: friendAddr ? 0 : tier, faction: faction, escrowMatchId: id.toString(), friend: !!friendAddr, stake: friendAddr ? stake.toString() : undefined });
          return id.toString();
        });
      },
      // joinStaked(tableId, faction, escrowMatchId, stakeWei) — approve → joinMatch → join the lobby table
      joinStaked: function (tableId, faction, escrowMatchId, stakeWei) {
        lastReject = null; if (!chain) return Promise.reject(new Error("setChain first"));
        var stake = BigInt(stakeWei);
        if (lossLimit && lossLimit.cap != null && BigInt(lossLimit.remaining) < stake) return Promise.reject(new Error("daily loss limit — this stake exceeds your remaining headroom (" + (BigInt(lossLimit.remaining) / 1000000000000000000n) + " DYC)."));
        return chain.dyc.approve(chain.escrowAddr, stake).then(function (t) { return t.wait(); }).then(function () {
          return chain.escrow.joinMatch(BigInt(escrowMatchId), 0).then(function (t) { return t.wait(); });
        }).then(function () { send({ type: "join", tableId: tableId, faction: faction }); });
      },
      // ---- M-P5 SETTLEMENT: the winner casts settle() from their OWN wallet with the referee-signed slip. The server
      //      never casts. Reads the escrow terminal state after, so the UI can show the money line. Persist-before-wait.
      settle: function () {
        if (!chain) return Promise.reject(new Error("setChain first"));
        if (!settlement || !settlement.slip) return Promise.reject(new Error("no settlement slip"));
        var sl = settlement.slip;
        settlement.casting = true; push();
        return chain.escrow.settle(BigInt(sl.escrowMatchId), sl.result, sl.signature).then(function (t) { return t.wait(); }).then(function (rc) {
          return chain.escrow.matches(BigInt(sl.escrowMatchId)).then(function (mm) {
            settlement.casting = false; settlement.settled = true; settlement.terminalState = Number(mm.state); settlement.txHash = rc && rc.hash;
            persistSlip(settlement);
            log("settle cast — escrow match " + sl.escrowMatchId + " state=" + settlement.terminalState + " (3=SETTLED)");
            push();
            return settlement;
          });
        }).catch(function (e) { settlement.casting = false; settlement.castError = e.message; push(); throw e; });
      },
      requestSlip: function (escrowMatchId) { send({ type: "get-slip", escrowMatchId: escrowMatchId || (settlement && settlement.escrowMatchId) }); },
      resumeSettlement: function () { var s = loadLatestUnsettledSlip(); if (s) { settlement = s; push(); } return s; },
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
