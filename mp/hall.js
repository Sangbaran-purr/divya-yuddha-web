/* ============================================================================
   S-HALL-L1 — THE HALL, THE BONES (function only; the dress is L1b).
   Gated-game-side room (mp/, sync-surviving). Reads live tables from the DY
   Match Server over the M-P1 lobby protocol. Every ACT control is present but
   INERT in L1 (a plain disabled state + one quiet line). No money act reaches a
   wallet here. The DOM carries stable hook classes so L1b reskins in place.
   Authority: docs/LOBBY_DESIGN.md v1.1 + MULTIPLAYER_DESIGN.md v1.1.
   ========================================================================== */
(function () {
  "use strict";
  var CFG = window.DY_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  function svgUse(id, cls) { return '<svg class="hall-glyph ' + (cls || "") + '" aria-hidden="true"><use href="#' + id + '"></use></svg>'; }

  // ── D3/D4/A7: THE ONE canonical tier config. id/label/stake(wei)/usd/open/medallion/sort. Table 0 (FREE) first-class.
  //    The M-P4 road (matchclient.openStaked) is called with `stake`. Retiring a door = flip `open` (no markup edit).
  var DEC = 1000000000000000000n;
  var TIERS = [
    { id: "free",    label: "FREE",    tier: 0,    stake: "0",                     usd: "no stake",  open: true, medallion: "dy-tier-free",    cls: "tier-free",    sort: 0 },
    { id: "bronze",  label: "BRONZE",  tier: 10,   stake: (10n * DEC).toString(),   usd: "$0.10",     open: true, medallion: "dy-tier-bronze",  cls: "tier-bronze",  sort: 1 },
    { id: "silver",  label: "SILVER",  tier: 50,   stake: (50n * DEC).toString(),   usd: "$0.50",     open: true, medallion: "dy-tier-silver",  cls: "tier-silver",  sort: 2 },
    { id: "gold",    label: "GOLD",    tier: 200,  stake: (200n * DEC).toString(),  usd: "$2",        open: true, medallion: "dy-tier-gold",    cls: "tier-gold",    sort: 3 },
    { id: "diamond", label: "DIAMOND", tier: 1000, stake: (1000n * DEC).toString(), usd: "$10",       open: true, medallion: "dy-tier-diamond", cls: "tier-diamond", sort: 4 },
    { id: "friend",  label: "FRIEND",  tier: null, stake: null,                     usd: "10-10,000", open: true, medallion: "dy-lock-escrow",  cls: "tier-friend",  sort: 5, friend: true },
  ];
  function shortAddr(a) { a = String(a || ""); return a.length >= 10 ? a.slice(0, 6) + "…" + a.slice(-4) : a; }
  var FACTION_SIGIL = { devas: "dy-devas", asuras: "dy-asuras", vanaras: "dy-vanaras", nagas: "dy-nagas" };

  // ── per-browser overrides (the store-proof anvil-vs-mainnet idiom): match-server URL + a dev identity/gate for the proof
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function matchServerUrl() { return lsGet("dyhall::matchServerUrl") || (CFG.matchServer && CFG.matchServer.url) || ""; }
  function devIdentity() { var q = new URLSearchParams(location.search).get("dev"); return q || lsGet("dyhall::devAddr") || null; }
  function devAccessBypass() { return lsGet("dyhall::devAccess") === "1"; }

  // ── STATE ────────────────────────────────────────────────────────────────
  var me = null;                 // the connected identity (address, lowercase)
  var accessState = "init";      // init | connect | busy | gateless | pass
  var selectedTier = "all";
  var feedState = "connecting";  // connecting | live | dead
  var tables = [];               // last whole-list snapshot (reconciled, never appended)
  var client = null;
  var gateGen = 0, feedGen = 0;  // read-generation guards (a stale read never clobbers a newer one)
  var lossLimit = null;          // { cap, netLossToday, remaining } | null
  var liquid = null;             // BigInt liquid DYC | null

  // ── ETHERS + the site read provider (for the gate + liquid reads) ─────────
  function loadEthers() {
    if (window.ethers) return Promise.resolve(window.ethers);
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = (CFG.ethers && CFG.ethers.cdn) || "https://cdn.jsdelivr.net/npm/ethers@6.17.0/dist/ethers.umd.min.js";
      s.onload = function () { res(window.ethers); }; s.onerror = function () { rej(new Error("ethers failed")); }; document.head.appendChild(s);
    });
  }
  function readRpcUrl() { return lsGet("dyhall::readRpcUrl") || ((CFG.chain && CFG.chain.readRpcUrls) || [])[0]; } // anvil override for the local proof; mainnet otherwise
  function readProvider(ethers) { return new ethers.JsonRpcProvider(readRpcUrl(), undefined, { staticNetwork: true }); }
  var ACCESS_ABI = ["function balanceOf(address) view returns (uint256)"];
  var DYC_ABI = ["function balanceOf(address) view returns (uint256)"];

  // ── THE GATE (D1) — lift the Access balanceOf read (not the admin panel). Three faces, busy-sentinel honesty. ──
  function runGate() {
    var gen = ++gateGen;
    var dev = devIdentity();
    if (dev) me = String(dev).toLowerCase();
    if (!me) { accessState = "connect"; return render(); } // no wallet = quiet connect card, no floor
    if (devAccessBypass()) { accessState = "pass"; startFeed(); loadEthers().then(function (e) { readLiquid(e); }).catch(function () {}); return render(); } // proof-only bypass (still reads liquid for affordability)
    accessState = "init"; render();
    loadEthers().then(function (ethers) {
      var acc = CFG.contracts && CFG.contracts.accessNFT;
      if (!acc) { accessState = "busy"; return render(); }
      return new ethers.Contract(acc, ACCESS_ABI, readProvider(ethers)).balanceOf(me).then(function (bal) {
        if (gen !== gateGen) return;                          // read-generation guard
        accessState = (bal && bal > 0n) ? "pass" : "gateless";
        if (accessState === "pass") {
          try { sessionStorage.setItem("dyw_pass", "1"); } catch (e) {} // G5 — a Hall holder carries the same site pass, so PRACTICE into the game copy isn't bounced to the rite
          readLiquid(ethers); startFeed();
        }
        render();
      });
    }).catch(function () {
      if (gen !== gateGen) return;
      accessState = "busy";                                   // dead/throttled RPC → busy, NEVER gateless, NEVER the Hall
      render();
    });
  }
  function readLiquid(ethers) {
    var dyc = dycAddr(); if (!dyc || !me) return; // dycAddr honors the dyhall::dycAddress anvil override
    new ethers.Contract(dyc, DYC_ABI, readProvider(ethers)).balanceOf(me).then(function (b) { liquid = b; render(); }).catch(function () {});
  }

  // ── THE LIVE FEED (M-P1) — matchclient's existing handshake; whole-list {tables} reconcile; three faces. ──
  function startFeed() {
    if (client) return;
    // S-HALL-L3 — ethers MUST be loaded before the client is created: matchclient captures deps.ethers, and the connected
    //   sign-in (authConnected → BrowserProvider) needs it. startFeed runs synchronously in the gate, so load ethers first.
    if (!window.ethers) { loadEthers().then(function () { startFeed(); }).catch(function () { feedState = "dead"; render(); }); return; }
    var url = matchServerUrl();
    if (!url) { feedState = "dead"; return render(); }
    var gen = ++feedGen;
    // the Hall READS the lobby AND plays the staked redacted match (server-authoritative; E/W stay stubbed — no client engine).
    client = window.DYMatchClient.createClient({
      E: {}, W: {}, ethers: window.ethers, log: function () {},
      onUpdate: function (v) {
        if (gen !== feedGen) return;                          // read-generation guard on the feed
        lastView = v || null;
        // L3 — the MATCH view (staked redacted road): render the battle in the browser. The matched-moment beat plays
        //   once per matchId, then the battle; the settlement strip rides the over state. A dismissed match falls to lobby.
        if (v && v.screen === "match" && v.matchId && !dismissedMatch[v.matchId]) {
          if (matchView == null || matchView.matchId !== v.matchId) { settleState = null; pendingPlay = null; mullPick = {}; }
          matchView = v; sheet = null; renderSheet(); startL3Tick();
          if (!dealtMatches[v.matchId]) { render(); setTimeout(function () { dealtMatches[v.matchId] = true; if (matchView && matchView.matchId === v.matchId) renderMatchScreen(); }, 2000); return; } // B2 matched moment
          renderMatchScreen(); return;
        }
        // LOBBY view (or a dismissed match)
        matchView = null;
        if (v && v.screen === "match" && v.settlement) settlementView = v.settlement; // keep the slip visible in the lobby after leaving
        // busy-sentinel honesty: a dropped/refused socket is DEAD (busy face), never a false empty room.
        if (v && v.connected === false) { feedState = "dead"; scheduleReconnect(); return render(); }
        if (v && Array.isArray(v.tables)) { tables = v.tables.slice(); feedState = "live"; reconnectTries = 0; } // whole-list reconcile
        if (v && v.lossLimit) lossLimit = v.lossLimit;
        if (v && v.settlement) settlementView = v.settlement; // a pending slip surfaced in the lobby (resume-after-reload)
        if (v && v.me && !signedInAs) signedInAs = v.me;      // B1 — the recovered connected-wallet identity
        // surface a server refusal honestly (FREE tier-0, join-not-locked, loss backstop) — de-duped so it shows once.
        if (v && v.lastReject && v.lastReject !== seenReject) { seenReject = v.lastReject; lastServerError = v.lastReject; if (sheet) renderSheet(); }
        // a friend "made" sheet shows the code once the new table arrives in the feed; refresh just that sheet.
        if (sheet && sheet.kind === "friend" && sheet.ctx && sheet.ctx.made) renderSheet();
        render();
      },
    });
    try {
      client.connect(url);
      // auth AS the connected identity so YOUR table pins (dev-address mode on the local proof server; L2 wires
      // connected-wallet-signature auth for the deployed server so it knows your address — the acts are inert in L1).
      // S-HALL-L3 (B1) — sign in as the CONNECTED wallet (personal_sign; the server recovers this address = the escrow player).
      //   Wait for the wallet to be present (production: injected at load; the staked road never uses a random session wallet).
      var poll = setInterval(function () { if (client && me && window.ethereum) { clearInterval(poll); client.authConnected(); client.getLossLimit && setTimeout(function () { try { client.getLossLimit(); } catch (e) {} }, 600); setTimeout(function () { try { if (client.resumeSettlement) client.resumeSettlement(); } catch (e) {} try { resumePendingTx(); } catch (e) {} }, 1100); } }, 120);
      setTimeout(function () { clearInterval(poll); }, 20000); // patient: a mobile in-app wallet can inject window.ethereum a beat late (DYWallet's 3s-detection reasoning)
    } catch (e) { feedState = "dead"; render(); }
    // bounded connect watchdog: no {tables} within 8s → dead face (never a false empty room)
    setTimeout(function () { if (gen === feedGen && feedState === "connecting") { feedState = "dead"; scheduleReconnect(); render(); } }, 8000);
  }
  // bounded auto-reconnect: on a dead feed, tear down and re-create the client on a backoff (recovers when the server
  // returns). Every wait is bounded; a fresh feedGen invalidates any stale in-flight onUpdate.
  var reconnectTimer = null, reconnectTries = 0;
  function scheduleReconnect() {
    if (reconnectTimer || reconnectTries >= 8) return;
    var delay = Math.min(1000 * Math.pow(1.7, reconnectTries), 10000);
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null; reconnectTries++;
      try { if (client && client.raw && client.raw.disconnect) client.raw.disconnect(); } catch (e) {}
      client = null; feedState = "connecting"; render(); startFeed();
    }, delay);
  }

  // ── the tables the floor renders (friend filtered out, belt-and-braces; selected tier filter) ──
  function visibleTables() { return tables.filter(function (t) { return !t.friend; }); }
  // OWNER RULING 2026-08-27: door membership reads the SERVER's own free/staked definition (lobby.js:18, staked =
  // !!escrowMatchId), NEVER the tier. free = staked===false; a staked table falls under the door whose tier matches.
  function stakedTierDef(t) { for (var i = 0; i < TIERS.length; i++) { if (!TIERS[i].friend && TIERS[i].tier != null && TIERS[i].tier === Number(t.tier)) return TIERS[i]; } return null; }
  function tableDoorId(t) { if (t.friend) return "friend"; if (!t.staked) return "free"; var d = stakedTierDef(t); return d ? d.id : null; }
  function tierCount(tierDef) {
    if (tierDef.friend) return null;                          // friend tables never appear on the floor → no count
    return visibleTables().filter(function (t) { return tableDoorId(t) === tierDef.id; }).length;
  }
  function floorTables() {
    var vis = visibleTables();
    var filtered = selectedTier === "all" ? vis : vis.filter(function (t) { return tableDoorId(t) === selectedTier; });
    // newest LAST (server order is oldest-first); YOUR table pinned FIRST regardless of filter
    var mine = vis.filter(function (t) { return me && String(t.opener).toLowerCase() === me; });
    var rest = filtered.filter(function (t) { return !(me && String(t.opener).toLowerCase() === me); });
    return { mine: mine, rest: rest };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  S-HALL-L2 — THE ACTS: faction, staked open, seat, cancel, friend, loss limit.
  //  The escrow ceremony casts from the PLAYER'S OWN wallet (store approve-then-act
  //  shape: signerRoad -> staticCall-safe -> feeOverrides -> wait) with persistPending;
  //  the server messages ride matchclient (join/close/loss-limit exist; stakedOpen added).
  //  No dress: neutral styling; every new element carries a hall-* hook class.
  // ════════════════════════════════════════════════════════════════════════

  // ── L2 STATE ──
  var selectedFaction = null;   // required before any open/join (the server demands it)
  var sheet = null;             // null | { kind, ctx }  — the active sheet overlay
  var ceremony = null;          // null | { kind, step, ctx, error } — the in-flight two-step cast
  var lastActCtx = null;        // facts of the table we last acted on (kept for logging/telemetry)
  var lastServerError = null;   // a server refusal to surface honestly (FREE tier-0, join-not-locked, loss backstop)
  var seenReject = null;        // de-dupe the surfaced reject

  // ── THE RULED MONEY COPY (docs/LOBBY_DESIGN.md section 11, VERBATIM — only the bracket slots are filled). ──
  var FACTIONS = ["devas", "asuras", "vanaras", "nagas"];
  function dycOf(wei) { try { return (BigInt(wei) / DEC).toString(); } catch (e) { return "0"; } }
  function COMMITMENT(stakeWei) {
    return "Your " + dycOf(stakeWei) + " DYC locks in escrow now. It returns in full if you cancel before anyone sits, or on a draw. The winner takes the pot minus the 5% platform fee. If a finished match is somehow never settled, the chain refunds both players automatically after 24 hours - locked stakes can never be stranded.";
  }
  var BOTH_STAKES = "Once both stakes lock, the match begins.";
  function FRIEND_LOCK(addr) { return "private table - visible only by this code, and only " + addr + " can take the seat."; }
  var LIMIT_SET_TEXT = "Once your net losses today reach this, the staked tables close for you until midnight UTC. Free tables and friend practice stay open. Only you can set or change this.";
  function LIMIT_BLOCK(headroomWei) { return "Your daily limit is reached - the staked tables reopen at midnight UTC. Remaining headroom today: " + dycOf(headroomWei) + " DYC."; }

  // ── THE ESCROW ROAD (browser signer; the store's signerRoad shape) ──
  function escrowAddr() { return lsGet("dyhall::stakeEscrowAddress") || (CFG.stakeEscrow && CFG.stakeEscrow.address) || ""; }
  function dycAddr() { return lsGet("dyhall::dycAddress") || (CFG.contracts && CFG.contracts.dycoin); } // anvil override for the local proof
  var DYC_FULL_ABI = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
  var ESC_ABI = [
    "function openMatch(uint256,address,uint8) returns (uint256)",
    "function joinMatch(uint256,uint8)",
    "function cancelMatch(uint256)",
    "function settle(uint256,uint8,bytes)",
    "function matches(uint256) view returns (address playerA, address playerB, uint256 stake, uint8 srcA, uint8 srcB, address expectedOpponent, uint64 matchedAt, uint8 state)",
    "event MatchOpened(uint256 indexed id, address indexed opener, uint256 stake, address expectedOpponent, uint8 source)",
  ];
  function signerRoad() {
    return loadEthers().then(function (ethers) {
      if (!window.ethereum) throw new Error("no wallet in this browser");
      var bp = new ethers.BrowserProvider(window.ethereum);
      return bp.getSigner().then(function (sg) { return { ethers: ethers, provider: bp, signer: sg }; });
    });
  }
  function feeOverrides() { try { return (window.DYWallet && window.DYWallet.feeOverrides) ? window.DYWallet.feeOverrides().catch(function () { return {}; }) : Promise.resolve({}); } catch (e) { return Promise.resolve({}); } }
  function escContract(r) { return new r.ethers.Contract(escrowAddr(), ESC_ABI, r.signer); }
  function dycContract(r) { return new r.ethers.Contract(dycAddr(), DYC_FULL_ABI, r.signer); }

  // ── persistPending / resumePendingTx (design-doc names) — a per-wallet record in the dyhall:: namespace, written at
  //    every tx hash + the escrowMatchId from the openMatch receipt, so a page death mid-ceremony resumes or abandons
  //    cleanly. Survives BOTH the approve→openMatch gap and the openMatch→server-open gap (the stated failure cases). ──
  function pendingKey() { return "dyhall::pending::" + (me || "anon"); }
  function persistPending(rec) { try { window.localStorage.setItem(pendingKey(), JSON.stringify(rec)); } catch (e) {} }
  function readPending() { try { var s = window.localStorage.getItem(pendingKey()); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function clearPending() { try { window.localStorage.removeItem(pendingKey()); } catch (e) {} }
  function mergePending(patch) { persistPending(Object.assign({}, readPending() || {}, patch)); }

  function parseMatchId(r, rc) {
    var esc = escContract(r), id = null;
    rc.logs.forEach(function (l) { try { var p = esc.interface.parseLog(l); if (p && p.name === "MatchOpened") id = p.args.id; } catch (e) {} });
    if (id == null) throw new Error("openMatch receipt carried no MatchOpened event");
    return id.toString();
  }
  // approve only when the standing allowance is short (store precedent — one tx when already approved)
  function ensureAllowance(r, stakeWei) {
    var dyc = dycContract(r);
    return dyc.allowance(me, escrowAddr()).then(function (a) {
      if (BigInt(a) >= BigInt(stakeWei)) return false; // already sufficient
      mergePending({ step: "approve" });
      return feeOverrides().then(function (fee) { return dyc.approve.staticCall(escrowAddr(), BigInt(stakeWei)).then(function () { return dyc.approve(escrowAddr(), BigInt(stakeWei), fee); }); })
        .then(function (tx) { mergePending({ approveTxHash: tx.hash }); return tx.wait(); }).then(function () { return true; });
    });
  }
  function castOpenMatch(r, ctx) {
    var esc = escContract(r);
    mergePending({ step: "openMatch" });
    return feeOverrides().then(function (fee) {
      return esc.openMatch.staticCall(BigInt(ctx.stakeWei), ctx.friendAddr || r.ethers.ZeroAddress, 0).then(function () {
        return esc.openMatch(BigInt(ctx.stakeWei), ctx.friendAddr || r.ethers.ZeroAddress, 0, fee);
      });
    }).then(function (tx) { mergePending({ openTxHash: tx.hash }); return tx.wait(); }).then(function (rc) { return parseMatchId(r, rc); });
  }
  function serverOpen(ctx, id) {
    mergePending({ step: "server", escrowMatchId: id });
    client.stakedOpen({ tier: ctx.tier, faction: ctx.faction, escrowMatchId: id, friend: !!ctx.friendAddr, stake: ctx.stakeWei });
    clearPending();
  }

  // THE OPEN CEREMONY — ctx = { tier, faction, stakeWei, friendAddr? }
  function ceremonyOpen(ctx) {
    lastActCtx = { tier: ctx.tier, faction: ctx.faction, stake: ctx.stakeWei, friend: !!ctx.friendAddr };
    ceremony = { kind: "open", step: "approve", ctx: ctx, error: null };
    persistPending({ kind: "open", step: "approve", tier: ctx.tier, faction: ctx.faction, stake: ctx.stakeWei, friend: !!ctx.friendAddr, friendAddr: ctx.friendAddr || null });
    renderSheet();
    return signerRoad().then(function (r) {
      return ensureAllowance(r, ctx.stakeWei).then(function () {
        ceremony.step = "lock"; renderSheet();
        return castOpenMatch(r, ctx);
      }).then(function (id) { serverOpen(ctx, id); ceremony = null; if (!ctx.friendAddr) { sheet = null; render(); } return id; });
    }).catch(function (e) { if (ceremony) { ceremony.step = "error"; ceremony.error = ceremonyMsg(e); } renderSheet(); });
  }

  // THE JOIN CEREMONY — approve -> joinMatch -> server join (server gates on both stakes locked)
  function ceremonyJoin(ctx) {
    // ctx = { tableId, faction, escrowMatchId, stakeWei, opponent }
    lastActCtx = { tier: ctx.tier, faction: ctx.faction, stake: ctx.stakeWei, opponent: ctx.opponent, friend: !!ctx.friend };
    ceremony = { kind: "join", step: "approve", ctx: ctx, error: null };
    persistPending({ kind: "join", step: "approve", tableId: ctx.tableId, faction: ctx.faction, escrowMatchId: ctx.escrowMatchId, stake: ctx.stakeWei });
    renderSheet();
    return signerRoad().then(function (r) {
      return ensureAllowance(r, ctx.stakeWei).then(function () {
        ceremony.step = "lock"; renderSheet();
        mergePending({ step: "joinMatch" });
        var esc = escContract(r);
        return feeOverrides().then(function (fee) { return esc.joinMatch.staticCall(BigInt(ctx.escrowMatchId), 0).then(function () { return esc.joinMatch(BigInt(ctx.escrowMatchId), 0, fee); }); }).then(function (tx) { mergePending({ joinTxHash: tx.hash }); return tx.wait(); });
      }).then(function () {
        mergePending({ step: "server" });
        client.join(ctx.tableId, ctx.faction);
        clearPending(); ceremony = null; sheet = null; render();
      });
    }).catch(function (e) { if (ceremony) { ceremony.step = "error"; ceremony.error = ceremonyMsg(e); } renderSheet(); });
  }

  // THE CANCEL — cancelMatch (full refund) then the server close. escrowMatchId from the table.
  function ceremonyCancel(t) {
    ceremony = { kind: "cancel", step: "cancel", ctx: { tableId: t.id, escrowMatchId: t.escrowMatchId }, error: null }; renderSheet();
    return signerRoad().then(function (r) {
      var esc = escContract(r);
      return feeOverrides().then(function (fee) { return esc.cancelMatch.staticCall(BigInt(t.escrowMatchId)).then(function () { return esc.cancelMatch(BigInt(t.escrowMatchId), fee); }); })
        .then(function (tx) { return tx.wait(); }).then(function () {
          client.close(t.id);
          ceremony = null; sheet = null; readLiquidAgain(); render();
        });
    }).catch(function (e) { if (ceremony) { ceremony.step = "error"; ceremony.error = ceremonyMsg(e); } renderSheet(); });
  }
  function readLiquidAgain() { loadEthers().then(function (ethers) { readLiquid(ethers); }).catch(function () {}); }

  function ceremonyMsg(e) {
    var m = (e && (e.shortMessage || e.reason || e.message)) || "the cast failed";
    if (/user rejected|denied/i.test(m)) return "you declined the wallet prompt";
    if (/insufficient/i.test(m)) return "insufficient DYC for this stake";
    return String(m).slice(0, 140);
  }

  // ── RESUME (on load, after the gate passes) — complete or abandon a pending ceremony cleanly. ──
  function resumePendingTx() {
    var rec = readPending(); if (!rec || !client) return;
    signerRoad().then(function (r) {
      if (rec.kind === "open") return resumeOpen(r, rec);
      if (rec.kind === "join") return resumeJoin(r, rec);
      if (rec.kind === "settle") return resumeSettle(r, rec); // L3 (P4) — a settle interrupted between cast and confirmation
      clearPending();
    }).catch(function () { /* no wallet/road — leave the record; the next visit retries. The stake (if locked) is refundable via cancel/abort. */ });
  }
  function resumeOpen(r, rec) {
    ceremony = { kind: "open", step: "resume", ctx: { tier: rec.tier, faction: rec.faction, stakeWei: rec.stake, friendAddr: rec.friendAddr }, error: null };
    sheet = { kind: rec.friend ? "friend" : "open" }; renderSheet();
    var ctx = { tier: rec.tier, faction: rec.faction, stakeWei: rec.stake, friendAddr: rec.friendAddr };
    if (rec.step === "server" && rec.escrowMatchId) {
      return verifyOpenOwned(r, rec.escrowMatchId).then(function (ok) { if (ok) { serverOpen(ctx, rec.escrowMatchId); ceremony = null; sheet = null; render(); } else { clearPending(); ceremony = null; sheet = null; render(); } });
    }
    if (rec.step === "openMatch" && rec.openTxHash) {
      return r.provider.getTransactionReceipt(rec.openTxHash).then(function (rc) {
        if (!rc) { ceremony = null; sheet = null; render(); return; }                 // not mined yet — leave it; a later visit resumes
        var id = parseMatchId(r, rc); serverOpen(ctx, id); ceremony = null; sheet = null; render();
      });
    }
    // approve done / openMatch un-sent (or unknown) — re-drive from where the allowance stands (no double-lock: openMatch hasn't run)
    return ceremonyOpen(ctx);
  }
  function resumeJoin(r, rec) {
    ceremony = { kind: "join", step: "resume", ctx: rec, error: null }; sheet = { kind: "seat" }; renderSheet();
    if (rec.step === "server" || rec.step === "joinMatch") {
      // joinMatch may have landed — check the escrow: MATCHED with me as playerB → just (re)send the server join
      return escContract(r).matches(BigInt(rec.escrowMatchId)).then(function (mm) {
        if (Number(mm.state) === 2 && String(mm.playerB).toLowerCase() === me) { client.join(rec.tableId, rec.faction); clearPending(); ceremony = null; sheet = null; render(); } // MATCHED=2
        else { return ceremonyJoin({ tableId: rec.tableId, faction: rec.faction, escrowMatchId: rec.escrowMatchId, stakeWei: rec.stake }); }
      }).catch(function () { return ceremonyJoin({ tableId: rec.tableId, faction: rec.faction, escrowMatchId: rec.escrowMatchId, stakeWei: rec.stake }); });
    }
    return ceremonyJoin({ tableId: rec.tableId, faction: rec.faction, escrowMatchId: rec.escrowMatchId, stakeWei: rec.stake });
  }
  function verifyOpenOwned(r, id) {
    // MatchState: NONE=0, OPEN=1, MATCHED=2, SETTLED=3, ABORTED=4
    return escContract(r).matches(BigInt(id)).then(function (mm) { return Number(mm.state) === 1 && String(mm.playerA).toLowerCase() === me; }).catch(function () { return false; });
  }

  // ── friend code lookup (F3: ONE function so a later server-side switch is one edit). Today: read the broadcast list. ──
  function lookupTableByCode(code) {
    code = String(code || "").trim();
    for (var i = 0; i < tables.length; i++) { if (String(tables[i].id) === code) return tables[i]; }
    return null;
  }

  // ── the affordability + headroom judgments ──
  function affordable(stakeWei) { return liquid != null && BigInt(liquid) >= BigInt(stakeWei); }
  function headroomWei() { return (lossLimit && lossLimit.cap != null) ? BigInt(lossLimit.remaining) : null; }
  function crossesLimit(stakeWei) { var h = headroomWei(); return h != null && h < BigInt(stakeWei); }

  // ════════════════════════════════════════════════════════════════════════
  //  SHEETS (plain stacked overlay views; hall-sheet-* hooks; no dress)
  // ════════════════════════════════════════════════════════════════════════
  function factionPicker(selected, cls) {
    var out = '<div class="hall-faction ' + (cls || "") + '" role="group" aria-label="Choose your faction">';
    FACTIONS.forEach(function (f) {
      out += '<button class="hall-faction-sigil' + (selected === f ? " on" : "") + '" data-faction="' + f + '" aria-pressed="' + (selected === f ? "true" : "false") + '">' + svgUse(FACTION_SIGIL[f], "hall-sigil") + '<span>' + f.charAt(0).toUpperCase() + f.slice(1) + '</span></button>';
    });
    return out + '</div>';
  }
  function ceremonyStrip(cer) {
    if (!cer) return "";
    if (cer.step === "error") return '<div class="hall-ceremony hall-ceremony-error state-line">' + cer.error + ' <button class="hall-retry" data-cer-retry="1">try again</button></div>';
    var one = cer.step === "approve" || cer.step === "resume";
    var two = cer.step === "lock";
    var label = cer.kind === "cancel" ? "cancelling - confirm the refund in your wallet…"
      : '<span class="hall-ceremony-step' + (one ? " on" : (two ? " done" : "")) + '">1. approve DYC</span> <span class="hall-ceremony-step' + (two ? " on" : "") + '">2. ' + (cer.kind === "join" ? "lock stake" : "lock stake") + '</span>';
    return '<div class="hall-ceremony state-line">' + label + '<div class="hall-ceremony-wait">confirm in your wallet…</div></div>';
  }

  function sheetOverlay(inner, titleCls) {
    return '<div class="hall-sheet-overlay" id="hall-sheet-overlay"><div class="hall-sheet ' + (titleCls || "") + '" role="dialog" aria-modal="true">' + inner +
      '<div class="hall-sheet-foot"><button class="hall-sheet-close" data-sheet-close="1">close</button></div></div></div>';
  }

  function openSheetHTML() {
    var rows = "";
    TIERS.forEach(function (t) {
      if (!t.open) return;
      if (t.friend) return; // FRIEND has its own door
      var isFree = t.id === "free";
      var aff = isFree || affordable(t.stake);
      var cls = "hall-tier-row" + (sheet.ctx && sheet.ctx.tierId === t.id ? " on" : "") + (aff ? "" : " unaffordable");
      var right = isFree ? '<span class="hall-tier-note">no stake - human opponent</span>'
        : (aff ? '<span class="hall-tier-usd">~' + t.usd + '</span>' : '<span class="hall-tier-note">insufficient liquid DYC</span>');
      rows += '<button class="' + cls + '" data-tier-row="' + t.id + '"' + (aff ? "" : " aria-disabled=\"true\"") + '>' +
        svgUse(t.medallion, "hall-medallion " + t.cls) + '<span class="hall-tier-label">' + t.label + '</span>' +
        '<span class="hall-tier-stake">' + (isFree ? "no stake" : (Number(BigInt(t.stake) / DEC)) + " DYC") + '</span>' + right + '</button>';
    });
    var ctx = sheet.ctx || {};
    var chosen = ctx.tierId ? TIERS.filter(function (x) { return x.id === ctx.tierId; })[0] : null;
    var commit = "";
    if (chosen && chosen.id !== "free") {
      commit = '<p class="hall-commit-text state-line">' + COMMITMENT(chosen.stake) + '</p>';
      if (crossesLimit(chosen.stake)) commit += '<p class="hall-limit-block state-line">' + LIMIT_BLOCK(headroomWei()) + '</p>';
    }
    var canAct = chosen && selectedFaction && (chosen.id === "free" || (affordable(chosen.stake) && !crossesLimit(chosen.stake)));
    var actLabel = !chosen ? "Choose a tier" : (chosen.id === "free" ? "OPEN FREE TABLE" : "OPEN TABLE");
    var act = ceremony ? ceremonyStrip(ceremony) :
      '<button class="hall-act hall-act-open-do" data-open-do="1"' + (canAct ? "" : " disabled") + '>' + actLabel + '</button>';
    var freeNote = (chosen && chosen.id === "free" && lastServerError) ? '<p class="hall-free-refusal state-line">' + lastServerError + '</p>' : "";
    return sheetOverlay(
      '<h2 class="hall-sheet-title">OPEN A TABLE</h2>' +
      '<div class="hall-tier-rows">' + rows + '</div>' +
      '<div class="hall-sheet-faction"><div class="hall-sheet-sub">Your faction</div>' + factionPicker(selectedFaction) + '</div>' +
      commit + freeNote + '<div class="hall-sheet-act">' + act + '</div>', "hall-sheet-open");
  }

  function seatSheetHTML() {
    var t = sheet.ctx.table;
    var td = t.staked ? stakedTierDef(t) : null;
    var pot = BigInt(t.stake) * 2n, fee = pot * 5n / 100n, win = pot - fee;
    var sigil = t.faction && FACTION_SIGIL[t.faction] ? svgUse(FACTION_SIGIL[t.faction], "hall-sigil") : "";
    var commit = '<p class="hall-commit-text state-line">' + COMMITMENT(t.stake) + '</p>';
    if (crossesLimit(t.stake)) commit += '<p class="hall-limit-block state-line">' + LIMIT_BLOCK(headroomWei()) + '</p>';
    var canAct = selectedFaction && affordable(t.stake) && !crossesLimit(t.stake);
    var act = ceremony ? ceremonyStrip(ceremony) : '<button class="hall-act hall-act-join" data-join-do="1"' + (canAct ? "" : " disabled") + '>TAKE THIS SEAT</button>';
    return sheetOverlay(
      '<h2 class="hall-sheet-title">TAKE THIS SEAT</h2>' +
      '<div class="hall-seat-opp">' + sigil + '<span class="hall-plaque-addr">' + shortAddr(t.opener) + '</span>' + (td ? svgUse(td.medallion, "hall-medallion " + td.cls) : "") + '<span class="hall-plaque-stake">' + dycOf(t.stake) + ' DYC</span></div>' +
      '<div class="hall-pot-line state-line">Pot ' + dycOf(pot) + ' DYC <span class="hall-fee-line">- ' + dycOf(fee) + ' fee -> winner takes ' + dycOf(win) + ' DYC</span></div>' +
      '<div class="hall-sheet-faction"><div class="hall-sheet-sub">Your faction</div>' + factionPicker(selectedFaction) + '</div>' +
      commit + '<p class="hall-seat-rule"><b>' + BOTH_STAKES + '</b></p>' +
      '<div class="hall-sheet-act">' + act + '</div>', "hall-sheet-seat");
  }

  function cancelSheetHTML() {
    var t = sheet.ctx.table;
    var act = ceremony ? ceremonyStrip(ceremony) : '<button class="hall-act hall-act-cancel" data-cancel-do="1">CANCEL - REFUND MY STAKE</button>';
    return sheetOverlay(
      '<h2 class="hall-sheet-title">CANCEL TABLE</h2>' +
      '<p class="state-line">Cancel your open table and refund your ' + dycOf(t.stake) + ' DYC in full. This works only while no one has taken the seat.</p>' +
      '<div class="hall-sheet-act">' + act + '</div>', "hall-sheet-cancel");
  }

  function friendCreateHTML() {
    var ctx = sheet.ctx || {};
    if (ctx.made) {
      var code = findMyFriendTableId();
      return sheetOverlay(
        '<h2 class="hall-sheet-title">FRIEND CHALLENGE</h2>' +
        '<div class="hall-code-chip" data-copy="' + code + '"><span class="hall-code-label">TABLE CODE</span><span class="hall-code-value">' + code + '</span><span class="hall-code-copy">tap to copy</span></div>' +
        '<p class="hall-friend-lock-line state-line">' + FRIEND_LOCK(ctx.opponent) + '</p>', "hall-sheet-friend");
    }
    var commit = ctx.stakeWei ? ('<p class="hall-commit-text state-line">' + COMMITMENT(ctx.stakeWei) + '</p>' + (crossesLimit(ctx.stakeWei) ? '<p class="hall-limit-block state-line">' + LIMIT_BLOCK(headroomWei()) + '</p>' : "")) : "";
    var act = ceremony ? ceremonyStrip(ceremony) : '<button class="hall-act hall-act-friend-create" data-friend-create="1">CREATE PRIVATE TABLE</button>';
    return sheetOverlay(
      '<h2 class="hall-sheet-title">FRIEND CHALLENGE</h2>' +
      '<div class="hall-sheet-sub">Stake (10 - 10,000 DYC)</div><input class="hall-friend-stake" id="hall-friend-stake" inputmode="numeric" placeholder="e.g. 50" value="' + (ctx.stakeInput || "") + '">' +
      '<div class="hall-sheet-sub">Your friend\'s wallet address</div><input class="hall-friend-opponent" id="hall-friend-opp" spellcheck="false" placeholder="0x…" value="' + (ctx.opponent || "") + '">' +
      '<div class="hall-sheet-faction"><div class="hall-sheet-sub">Your faction</div>' + factionPicker(selectedFaction) + '</div>' +
      commit + '<p class="state-line hall-friend-note">Friend tables never appear on the floor.</p>' +
      '<div class="hall-sheet-act">' + act + '</div>' +
      (ctx.err ? '<p class="state-line hall-sheet-err">' + ctx.err + '</p>' : "") +
      '<button class="hall-sheet-switch" data-sheet-switch="friendjoin">have a code? join a friend\'s table</button>', "hall-sheet-friend");
  }

  function friendJoinHTML() {
    var ctx = sheet.ctx || {};
    var t = ctx.table;
    if (!t) {
      return sheetOverlay(
        '<h2 class="hall-sheet-title">JOIN BY CODE</h2>' +
        '<div class="hall-sheet-sub">Table code</div><input class="hall-friend-code" id="hall-friend-code" spellcheck="false" placeholder="paste the code" value="' + (ctx.codeInput || "") + '">' +
        '<div class="hall-sheet-act"><button class="hall-act hall-act-friend-find" data-friend-find="1">FIND TABLE</button></div>' +
        (ctx.err ? '<p class="state-line hall-sheet-err">' + ctx.err + '</p>' : "") +
        '<button class="hall-sheet-switch" data-sheet-switch="friend">create a private table instead</button>', "hall-sheet-friendjoin");
    }
    var sigil = t.faction && FACTION_SIGIL[t.faction] ? svgUse(FACTION_SIGIL[t.faction], "hall-sigil") : "";
    var commit = '<p class="hall-commit-text state-line">' + COMMITMENT(t.stake) + '</p>';
    if (crossesLimit(t.stake)) commit += '<p class="hall-limit-block state-line">' + LIMIT_BLOCK(headroomWei()) + '</p>';
    var canAct = selectedFaction && affordable(t.stake) && !crossesLimit(t.stake);
    var act = ceremony ? ceremonyStrip(ceremony) : '<button class="hall-act hall-act-friend-join" data-friend-join="1"' + (canAct ? "" : " disabled") + '>YOU SIGN YOUR HALF OF THE POT</button>';
    return sheetOverlay(
      '<h2 class="hall-sheet-title">JOIN BY CODE</h2>' +
      '<div class="hall-seat-opp">' + sigil + '<span class="hall-plaque-addr">' + shortAddr(t.opener) + '</span><span class="hall-plaque-stake">' + dycOf(t.stake) + ' DYC</span></div>' +
      '<div class="hall-sheet-faction"><div class="hall-sheet-sub">Your faction</div>' + factionPicker(selectedFaction) + '</div>' +
      commit + '<p class="hall-seat-rule"><b>' + BOTH_STAKES + '</b></p>' +
      '<div class="hall-sheet-act">' + act + '</div>', "hall-sheet-friendjoin");
  }

  function limitSheetHTML() {
    var ctx = sheet.ctx || {};
    var has = lossLimit && lossLimit.cap != null;
    var cur = has ? '<p class="state-line">Today: ' + dycOf(lossLimit.remaining) + ' of ' + dycOf(lossLimit.cap) + ' DYC remaining.</p>' : "";
    return sheetOverlay(
      '<h2 class="hall-sheet-title">SET YOUR LIMIT</h2>' + cur +
      '<p class="hall-limit-copy state-line">' + LIMIT_SET_TEXT + '</p>' +
      '<div class="hall-sheet-sub">Daily loss cap (DYC)</div><input class="hall-limit-input" id="hall-limit-input" inputmode="numeric" placeholder="e.g. 100" value="' + (ctx.input || (has ? dycOf(lossLimit.cap) : "")) + '">' +
      '<div class="hall-sheet-act"><button class="hall-act hall-act-limit-set" data-limit-set="1">' + (has ? "CHANGE LIMIT" : "SET LIMIT") + '</button>' +
      (has ? '<button class="hall-door hall-act-limit-remove" data-limit-remove="1">REMOVE LIMIT</button>' : "") + '</div>' +
      (ctx.err ? '<p class="state-line hall-sheet-err">' + ctx.err + '</p>' : ""), "hall-sheet-limit");
  }

  function renderSheet() {
    var existing = $("hall-sheet-overlay");
    if (!sheet) { if (existing) existing.parentNode.removeChild(existing); return; }
    var html = "";
    if (sheet.kind === "open") html = openSheetHTML();
    else if (sheet.kind === "seat") html = seatSheetHTML();
    else if (sheet.kind === "cancel") html = cancelSheetHTML();
    else if (sheet.kind === "friend") html = friendCreateHTML();
    else if (sheet.kind === "friendjoin") html = friendJoinHTML();
    else if (sheet.kind === "limit") html = limitSheetHTML();
    var host = $("hall-sheet-host") || (function () { var h = el("div"); h.id = "hall-sheet-host"; document.body.appendChild(h); return h; })();
    host.innerHTML = html;
    wireSheet();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  S-HALL-L3 — THE BRIDGES: the match played in the browser on the STAKED
  //  REDACTED road (server-authoritative; no client engine). Rendering LOGIC
  //  ported from the frozen rig (mp/wire.html) onto neutral bones (hall-* hooks);
  //  the settlement copy is VERBATIM from docs/LOBBY_DESIGN.md section 8c (never
  //  the rig's rig-era text). Moves ride matchclient; the winner's SETTLE casts
  //  from the browser wallet (persistPending).
  // ════════════════════════════════════════════════════════════════════════
  var matchView = null;      // the latest {screen:"match"} view (null in the lobby)
  var lastView = null;       // the latest view of any kind (for the clock/vanish tick)
  var settleState = null;    // { casting } | { settled, terminalState } | { error } — the browser settle cast state
  var settlementView = null; // a pending slip surfaced in the lobby (resume-after-reload)
  var dealtMatches = {};      // matchId -> true once the "dealing…" beat has played
  var dismissedMatch = {};    // matchId -> true once the player leaves the over screen back to the Hall
  var signedInAs = null;      // the recovered connected-wallet identity (B1; shown in the header)
  var pendingPlay = null;     // { i, name, options } — the target picker
  var mullPick = {};          // mulligan toss selections

  // ── the RULED settlement copy (docs/LOBBY_DESIGN.md section 11 → 8c, VERBATIM; only the [slots] filled) ──
  var ABORT_LINE = "unclaimed pots refund both players automatically after 24 hours.";
  function WON_LINE(total, fee) { return "You won. Collect " + total + " DYC - " + fee + " to the treasury."; }
  function WON_SETTLED(total) { return "settled - " + total + " DYC in your wallet"; }
  var DRAW_LINE = "A draw - both stakes return in full.";
  function FORFEIT_LINE(total) { return "Your opponent left the table. The pot is yours - collect " + total + " DYC."; }
  var FREE_LINE = "no stakes at this table";

  // ── THE BROWSER SETTLE CAST (the winner casts from their OWN wallet; persistPending; resolves on the terminal read) ──
  function ceremonySettle(slip) {
    if (!slip || slip.escrowMatchId == null) return;
    settleState = { casting: true }; renderCurrent();
    persistPending({ kind: "settle", escrowMatchId: String(slip.escrowMatchId), result: slip.result, signature: slip.signature });
    return signerRoad().then(function (r) {
      var esc = escContract(r);
      return feeOverrides().then(function (fee) {
        return esc.settle.staticCall(BigInt(slip.escrowMatchId), slip.result, slip.signature).then(function () {
          return esc.settle(BigInt(slip.escrowMatchId), slip.result, slip.signature, fee);
        });
      }).then(function (tx) { mergePending({ settleTxHash: tx.hash }); return tx.wait(); })
        .then(function () { return esc.matches(BigInt(slip.escrowMatchId)); })
        .then(function (mm) { settleState = { settled: true, terminalState: Number(mm.state) }; clearPending(); markSlipSettled(String(slip.escrowMatchId)); readLiquidAgain(); renderCurrent(); });
    }).catch(function (e) { settleState = { casting: false, error: ceremonyMsg(e) }; renderCurrent(); });
  }
  // resume a settle interrupted between cast and confirmation (P4): if already SETTLED on chain, resolve; else re-offer.
  function resumeSettle(r, rec) {
    return escContract(r).matches(BigInt(rec.escrowMatchId)).then(function (mm) {
      if (Number(mm.state) === 3) { settleState = { settled: true, terminalState: 3 }; clearPending(); markSlipSettled(String(rec.escrowMatchId)); renderCurrent(); return; } // SETTLED=3
      // not settled — leave the slip's Cast button live (matchclient.resumeSettlement surfaced it); drop the stale pending
      clearPending();
    }).catch(function () { clearPending(); });
  }

  // ── THE MATCH SCREEN (ported from wire.html; neutral hall-* hooks) ──
  function factionSigilSmall(f) { return f && FACTION_SIGIL[f] ? svgUse(FACTION_SIGIL[f], "hall-sigil") : ""; }
  function mUnit(u) { return '<span class="hall-mini"><b>' + u.power + '</b> ' + u.n + '</span>'; }

  function statusStrip(v) {
    var h = "";
    if (v.reconnecting) h += '<div class="hall-mstatus warn">connection dropped - reconnecting to resume your match…</div>';
    if (v.vanish) h += '<div class="hall-mstatus warn">opponent reconnecting… <b id="hall-vanishcd">…</b></div>';
    if (v.clock && v.phase && v.phase !== "over" && !v.vanish) {
      var label = v.clock.kind === "mulligan" ? "mulligan clock" : (v.clock.seat === v.seat ? "your move" : "opponent's move");
      h += '<div class="hall-mclock"><span class="state-line">' + label + ':</span> <b id="hall-clockcd">…</b>s</div>';
    }
    return h;
  }

  function settlementStrip(s) {
    if (!s) return "";
    if (s.error) return '<div class="hall-settle warn"><div class="hall-settle-line">' + s.error + '</div><div class="hall-settle-abort state-line">' + ABORT_LINE + '</div></div>';
    if (s.stake == null) { // FREE (no stake) — result + the one ruled line
      return '<div class="hall-settle"><div class="hall-settle-line state-line">' + FREE_LINE + '</div></div>';
    }
    var stake = BigInt(s.stake), pot = stake * 2n, rake = pot * 5n / 100n, total = pot - rake;
    var settled = settleState && settleState.settled, casting = settleState && settleState.casting, castErr = settleState && settleState.error;
    var line, showCast = false;
    if (settled) {
      line = (s.result === 2) ? DRAW_LINE : (s.youWon ? WON_SETTLED(dycOf(total)) : "This match is settled.");
    } else if (s.result === 2) { line = DRAW_LINE; showCast = true; }
    else if (s.youWon) { line = s.forfeit ? FORFEIT_LINE(dycOf(total)) : WON_LINE(dycOf(total), dycOf(rake)); showCast = true; }
    else { line = "You lost this match - the winner collects the pot."; }
    var cast = showCast ? '<div class="hall-settle-act"><button class="hall-act hall-settle-cast" data-settle="1"' + (casting ? " disabled" : "") + '>' + (casting ? "casting…" : "CAST SETTLE") + '</button></div>' : "";
    var err = castErr ? '<div class="hall-settle-err state-line">' + castErr + '</div>' : "";
    return '<div class="hall-settle"><div class="hall-settle-line">' + line + '</div>' +
      '<div class="hall-settle-abort state-line">' + ABORT_LINE + '</div>' + cast + err + '</div>';
  }

  function matchScreenHTML(v) {
    // B2 — the matched moment: one beat before the battle, on first entry to a match.
    if (!dealtMatches[v.matchId]) {
      return '<div class="hall-dealing" role="status">' +
        '<div class="hall-dealing-opp">' + factionSigilSmall(v.oppFaction) + '<span class="hall-plaque-addr">' + shortAddr(v.opponent || v.oppName) + '</span></div>' +
        '<div class="hall-dealing-line">the stakes are locked - dealing…</div></div>';
    }
    var h = statusStrip(v) + settlementStrip(v.settlement);
    // header
    h += '<div class="hall-mhead"><div class="hall-mhead-row">you (' + (v.myFaction || "?") + ') vs ' + factionSigilSmall(v.oppFaction) + shortAddr(v.opponent || v.oppName) +
      '<span class="hall-mpill">round ' + v.round + '</span><span class="hall-mpill">wins ' + v.roundWins[0] + '-' + v.roundWins[1] + ' (to ' + v.winTarget + ')</span></div>';
    if (v.outcome) {
      h += '<div class="hall-mresult">' + (v.outcome.kind === "result"
        ? (v.outcome.winner == null ? "the match is a draw" : (v.outcome.winner === v.seat ? "you win the match" : "you lose the match")) + " - rounds " + v.outcome.roundWins.join("-")
        : "match abandoned - " + v.outcome.reason) + '</div>';
    } else {
      h += '<div class="hall-mphase state-line">' + (v.phase === "mulligan" ? "mulligan phase" : (v.myTurn ? "your turn" : "opponent's turn")) + '</div>';
    }
    h += '</div>';
    // boards
    h += '<div class="hall-board"><div class="hall-board-side"><div class="state-line">opponent · hand ' + v.oppHandCount + '</div>' + v.oppUnits.map(mUnit).join("") + '</div>' +
      '<div class="hall-board-side hall-board-me"><div class="state-line">you</div>' + v.myUnits.map(mUnit).join("") + '</div></div>';
    // controls
    if (v.phase === "mulligan" && !v.myMulliganed) {
      h += '<div class="hall-controls"><div class="state-line">Mulligan — tap cards to toss, then confirm</div>' +
        v.myHand.map(function (c) { return '<button class="hall-mull" data-i="' + c.i + '">' + c.n + '</button>'; }).join("") +
        '<div class="hall-controls-act"><button class="hall-act hall-mullconfirm" data-mullconfirm="1">Confirm mulligan</button> <span class="state-line">(toss nothing = keep)</span></div></div>';
    } else if (v.phase === "mulligan") {
      h += '<div class="hall-controls state-line">waiting for the opponent to mulligan…</div>';
    } else if (v.phase === "play") {
      h += '<div class="hall-controls">';
      if (pendingPlay) {
        h += '<div class="state-line">targets for <b>' + pendingPlay.name + '</b>:</div>' + pendingPlay.options.map(function (o) { return '<button class="hall-tgt" data-idx="' + o.idx + '">' + o.n + '</button>'; }).join("") + ' <button class="hall-cancelplay" data-cancelplay="1">cancel</button>';
      } else {
        h += v.myHand.map(function (c) { return '<button class="hall-hand' + (c.playable ? " playable" : "") + '" data-i="' + c.i + '"' + (c.playable ? "" : " disabled") + '>' + c.n + ' <span class="state-line">' + (c.p || "") + '</span></button>'; }).join("");
        h += '<div class="hall-controls-act"><button class="hall-act hall-pass" data-pass="1"' + (v.myTurn ? "" : " disabled") + '>Pass round</button> <button class="hall-concede" data-concede="1"' + (v.myTurn ? "" : " disabled") + '>Concede</button></div>';
      }
      h += '</div>';
    }
    if (v.lastReject) h += '<div class="hall-mreject warn">' + v.lastReject + '</div>';
    if (v.outcome) h += '<div class="hall-controls-act"><button class="hall-act hall-mleave" data-leave="1">back to the Hall</button></div>';
    return '<div class="hall-match">' + h + '</div>';
  }

  function renderMatchScreen() {
    var root = $("hall-root"); if (!root || !matchView) return;
    root.innerHTML = matchScreenHTML(matchView);
    wireMatchScreen(matchView);
  }
  function renderCurrent() { if (matchView) renderMatchScreen(); else render(); } // the settle strip lives in the match OR the lobby (resume)
  // mark matchclient's persisted slip settled so resumeSettlement won't re-surface it on the next reload (the strip still shows this session).
  function markSlipSettled(eid) { try { var k = "dy_mp_slip_" + eid; var s = JSON.parse(window.localStorage.getItem(k) || "null"); if (s) { s.settled = true; window.localStorage.setItem(k, JSON.stringify(s)); } } catch (e) {} }
  function wireMatchScreen(v) {
    Array.prototype.forEach.call(document.querySelectorAll(".hall-mull"), function (b) { b.onclick = function () { var i = b.getAttribute("data-i"); if (mullPick[i]) { delete mullPick[i]; b.classList.remove("on"); } else { mullPick[i] = 1; b.classList.add("on"); } }; });
    var mc = document.querySelector("[data-mullconfirm]"); if (mc) mc.onclick = function () { var idxs = Object.keys(mullPick).map(Number); mullPick = {}; client.mulligan(idxs); };
    Array.prototype.forEach.call(document.querySelectorAll(".hall-hand"), function (b) {
      if (b.disabled) return;
      b.onclick = function () {
        var i = Number(b.getAttribute("data-i"));
        var spec = client.targetSpecFor(i);
        if (spec && spec.options && spec.options.length) { pendingPlay = { i: i, name: v.myHand.filter(function (c) { return c.i === i; })[0].n, options: spec.options.map(function (o, ix) { return { idx: ix, n: o.n }; }) }; renderMatchScreen(); }
        else { client.play(i, null); }
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll(".hall-tgt"), function (b) { b.onclick = function () { var i = pendingPlay.i, idx = Number(b.getAttribute("data-idx")); pendingPlay = null; client.play(i, idx); }; });
    var cp = document.querySelector("[data-cancelplay]"); if (cp) cp.onclick = function () { pendingPlay = null; renderMatchScreen(); };
    var ps = document.querySelector("[data-pass]"); if (ps && !ps.disabled) ps.onclick = function () { client.pass(); };
    var cc = document.querySelector("[data-concede]"); if (cc && !cc.disabled) cc.onclick = function () { client.concede(); };
    var st = document.querySelector("[data-settle]"); if (st && !st.disabled) st.onclick = function () { var s = v.settlement || (settlementView); if (s && s.slip) ceremonySettle(s.slip); };
    var lv = document.querySelector("[data-leave]"); if (lv) lv.onclick = function () { dismissedMatch[v.matchId] = true; settlementView = v.settlement || settlementView; matchView = null; render(); };
  }

  // the live clock / vanish countdown tick (renders the numbers from the SERVER deadline; the client never decides).
  var l3TickStarted = false;
  function startL3Tick() {
    if (l3TickStarted) return; l3TickStarted = true;
    setInterval(function () {
      if (!lastView) return;
      var cc = $("hall-clockcd");
      if (cc && lastView.clock) { var rem = Math.max(0, lastView.clock.deadline - Date.now()); cc.textContent = Math.ceil(rem / 1000); cc.classList.toggle("warn", rem <= (lastView.clock.thinkMs - lastView.clock.warnMs)); }
      var vc = $("hall-vanishcd");
      if (vc && lastView.vanish) { vc.textContent = Math.max(0, Math.ceil((lastView.vanish.deadline - Date.now()) / 1000)) + "s left to reconnect"; }
    }, 250);
  }

  // ── RENDER ───────────────────────────────────────────────────────────────
  function render() {
    var root = $("hall-root"); if (!root) return;
    if (accessState === "init") { root.innerHTML = '<div class="hall-busy" role="status">reading the gate…</div>'; return; }
    if (accessState === "connect") { root.innerHTML = connectCard(); wireConnect(); return; }
    if (accessState === "busy") { root.innerHTML = '<div class="hall-gate hall-busy" role="status">The gate is not answering right now — <button class="hall-retry" id="hall-retry">refresh to retry</button>.</div>'; wireRetry(); return; }
    if (accessState === "gateless") { root.innerHTML = gateScreen(); return; }
    // accessState === "pass"
    if (matchView) { sheet = null; renderSheet(); renderMatchScreen(); return; } // L3 — a live match: the battle in the browser
    // the Hall (lobby). A settlement slip (resume-after-reload, or after leaving the over screen) rides on top — pre-settle
    //   (the Cast button) or resolved (the settled line).
    var pendingSlip = settlementView ? '<div class="hall-lobby-settle">' + settlementStrip(settlementView) + '</div>' : "";
    root.innerHTML = header() + '<div class="hall-covenant state-line">EVERY SEAT HERE IS HUMAN.</div>' + pendingSlip + rail() + doors() + floor();
    wireHall();
    var st = document.querySelector(".hall-lobby-settle [data-settle]"); if (st && !st.disabled) st.onclick = function () { if (settlementView && settlementView.slip) ceremonySettle(settlementView.slip); };
    // NOTE: the sheet lives in its OWN body element (#hall-sheet-host), independent of hall-root, so a floor re-render
    // never rebuilds it (which would wipe a half-typed input). renderSheet() is called only on sheet-state changes.
  }

  function connectCard() {
    return '<div class="hall-gate hall-connect"><p>Connect your wallet to enter the Hall.</p>' +
      '<button class="hall-act" id="hall-connect">Connect wallet</button></div>';
  }
  function gateScreen() {
    // S-GATE-1 (G4): the ruled door line, verbatim (docs/RULINGS_2026-08-27.md rule 3). The line ONLY; the rite door is the way in.
    return '<div class="hall-gate">' +
      '<p class="hall-gate-line">The Torana opens this door. It is dropped to every wallet that buys DYC in the presale. It admits you; it buys no advantage.</p>' +
      '<a class="hall-act hall-gate-door" href="../rite.html">To the presale — the Torana follows</a></div>';
  }

  function header() {
    var liq = liquid == null ? "—" : (liquid / DEC).toString() + " DYC";
    var lim;
    if (lossLimit && lossLimit.cap != null) {
      var rem = (BigInt(lossLimit.remaining) / DEC).toString(), cap = (BigInt(lossLimit.cap) / DEC).toString();
      lim = '<button class="hall-limit-set" data-act="limit-sheet">today: ' + rem + ' of ' + cap + ' DYC remaining</button>';
    } else {
      lim = '<button class="hall-limit-invite" data-act="limit-sheet">set a daily limit</button>';
    }
    var who = signedInAs ? '<div class="hall-signedin state-line">signed in as <span class="hall-signedin-addr">' + shortAddr(signedInAs) + '</span></div>' : '';
    return '<div class="hall-header">' +
      '<div class="hall-liquid"><span class="hall-liquid-label">Liquid</span> <b>' + liq + '</b>' + who + '</div>' +
      '<div class="hall-limit">' + lim + '</div></div>';
  }

  function rail() {
    var chips = '<button class="hall-rail-chip hall-chip-all' + (selectedTier === "all" ? " on" : "") + '" data-tier="all">ALL</button>';
    TIERS.slice().sort(function (a, b) { return a.sort - b.sort; }).forEach(function (t) {
      if (!t.open) return;
      var count = tierCount(t);
      var countTxt = t.friend ? "" : (feedState === "dead" ? '<span class="hall-chip-count blank">—</span>' : '<span class="hall-chip-count">' + count + '</span>');
      var usd = t.friend ? "10-10,000" : t.usd;
      chips += '<button class="hall-rail-chip ' + t.cls + (selectedTier === t.id ? " on" : "") + '" data-tier="' + t.id + '">' +
        svgUse(t.medallion, "hall-medallion") +
        '<span class="hall-chip-label">' + t.label + '</span>' +
        '<span class="hall-chip-usd">' + usd + '</span>' + countTxt + '</button>';
    });
    return '<div class="hall-rail" role="tablist">' + chips + '</div>';
  }

  function doors() {
    return '<div class="hall-doors">' +
      '<button class="hall-door hall-door-open" data-act="open-sheet">OPEN A TABLE</button>' +
      '<button class="hall-door hall-door-friend" data-act="friend-sheet">FRIEND CHALLENGE</button></div>';
  }

  function floor() {
    if (feedState === "connecting") return '<div class="hall-floor"><div class="hall-busy state-line" role="status">reading the floor…</div></div>';
    if (feedState === "dead") return '<div class="hall-floor"><div class="hall-busy state-line" role="status">the hall is not answering right now — <button class="hall-retry" id="hall-retry">retry</button></div></div>';
    // LIVE
    var ft = floorTables();
    var totalOpen = visibleTables().length;
    if (totalOpen === 0) return '<div class="hall-floor">' + emptyRoom() + '</div>';
    var html = "";
    ft.mine.forEach(function (t) { html += plaque(t, true); });                 // YOUR table pins first, regardless of filter
    ft.rest.forEach(function (t) { html += plaque(t, false); });
    // a SPECIFIC selected tier with no open seats in it renders its quiet empty state (YOUR pinned table above is a
    // different question — the selected tier is still seatless). "all" with zero tables is the empty room, handled above.
    if (selectedTier !== "all" && ft.rest.length === 0) {
      html += '<div class="hall-empty-tier state-line">no open seats at this tier - <button class="hall-open-one" data-act="open-sheet">open one</button></div>';
    }
    return '<div class="hall-floor">' + html + '</div>';
  }

  function plaque(t, isYou) {
    // RULING: the tier medallion + lock are drawn for STAKED tables only; a free table (staked===false) reads "Free
    // table", no medallion, no lock — keyed on staked, never on tier.
    var td = t.staked ? stakedTierDef(t) : null;
    var stakeTxt = t.staked ? (Number(BigInt(t.stake) / DEC)) + " DYC · ~" + (td ? td.usd : "") : "Free table";
    var medallion = (t.staked && td) ? svgUse(td.medallion, "hall-medallion " + td.cls) : "";
    var sigil = t.faction && FACTION_SIGIL[t.faction] ? svgUse(FACTION_SIGIL[t.faction], "hall-sigil") : '<span class="hall-sigil-empty" aria-hidden="true"></span>';
    var lock = t.staked ? svgUse("dy-lock-escrow", "hall-lock") : "";
    if (isYou) {
      var wait = t.staked ? "your stake is locked in escrow - waiting for an opponent" : "waiting for an opponent";
      var youActs = t.staked
        ? '<button class="hall-act-cancel-open" data-act="cancel" data-tid="' + t.id + '">CANCEL TABLE</button><button class="hall-share" data-act="share" data-tid="' + t.id + '">SHARE AS CODE</button>'
        : '<button class="hall-act-close-free" data-act="close-free" data-tid="' + t.id + '">CLOSE TABLE</button>';
      return '<div class="hall-plaque hall-plaque-you">' +
        '<div class="hall-plaque-head">' + medallion + '<span class="hall-plaque-stake">' + stakeTxt + '</span>' + lock + '<span class="hall-you-tag">(you)</span></div>' +
        '<div class="hall-plaque-opener">' + sigil + '<span class="hall-plaque-addr">' + shortAddr(t.opener) + '</span></div>' +
        '<div class="hall-plaque-wait state-line">' + wait + '</div>' +
        '<div class="hall-plaque-acts">' + youActs + '</div></div>';
    }
    return '<div class="hall-plaque">' +
      '<div class="hall-plaque-head">' + medallion + '<span class="hall-plaque-stake">' + stakeTxt + '</span>' + lock + '</div>' +
      '<div class="hall-plaque-opener">' + sigil + '<span class="hall-plaque-addr">' + shortAddr(t.opener) + '</span></div>' +
      // D2: patience line OFF in L1 (openedAt not in the feed; W3-LOBBY-OPENEDAT-1 queued). Slot reserved.
      '<div class="hall-plaque-acts"><button class="hall-act-seat" data-act="seat" data-tid="' + t.id + '">TAKE THIS SEAT</button></div></div>';
  }

  function emptyRoom() {
    // screen 3 — only when the feed is LIVE and reports zero tables anywhere.
    var board = (function () { var b = (CFG.chain && CFG.chain.readRpcUrls) ? "" : ""; return "https://sangbaran-purr.github.io/divya-yuddha/assets/img/board_bg.jpg"; })();
    return '<div class="hall-empty">' +
      '<div class="hall-empty-board"><img src="' + board + '" alt="" aria-hidden="true" loading="lazy" onerror="this.style.display=\'none\'"></div>' +
      '<div class="hall-empty-line state-line">No one is seated right now - because every opponent here is a real person.</div>' +
      '<div class="hall-empty-doors">' +
      '<button class="hall-act" data-act="friend-sheet">CHALLENGE A FRIEND</button>' +
      '<a class="hall-act hall-empty-practice" href="../game/index.html?v=33d0757">practice — no stakes, AI opponent</a>' +
      '<button class="hall-act" data-act="open-sheet">OPEN A TABLE AND WAIT</button></div></div>';
  }

  // ── WIRING (inert idiom: the one quiet line; the practice door is the only live door) ──
  function wireConnect() { var b = $("hall-connect"); if (b) b.onclick = connectWallet; }
  function wireRetry() { var b = $("hall-retry"); if (b) b.onclick = function () { location.reload(); }; }
  function tableById(id) { for (var i = 0; i < tables.length; i++) { if (String(tables[i].id) === String(id)) return tables[i]; } return null; }
  function wireHall() {
    Array.prototype.forEach.call(document.querySelectorAll(".hall-rail-chip"), function (c) {
      c.onclick = function () { selectedTier = c.getAttribute("data-tier"); render(); };
    });
    // the live acts: every control carries data-act; route it to a sheet or a cast.
    Array.prototype.forEach.call(document.querySelectorAll("[data-act]"), function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        var act = b.getAttribute("data-act"), tid = b.getAttribute("data-tid");
        if (act === "open-sheet") { lastServerError = null; sheet = { kind: "open", ctx: {} }; renderSheet(); }
        else if (act === "friend-sheet") { sheet = { kind: "friend", ctx: {} }; renderSheet(); }
        else if (act === "limit-sheet") { sheet = { kind: "limit", ctx: {} }; renderSheet(); }
        else if (act === "seat") { var t = tableById(tid); if (t) { sheet = { kind: "seat", ctx: { table: t } }; renderSheet(); } }
        else if (act === "cancel") { var tc = tableById(tid); if (tc) { sheet = { kind: "cancel", ctx: { table: tc } }; renderSheet(); } }
        else if (act === "close-free") { if (client) client.close(tid); }
        else if (act === "share") { shareCode(tid); }
      });
    });
    var r = $("hall-retry"); if (r) r.onclick = function () { location.reload(); };
  }
  function shareCode(tid) {
    try { if (navigator.clipboard) navigator.clipboard.writeText(String(tid)); } catch (e) {}
    var n = $("hall-inert-note"); if (!n) { n = el("div", "hall-inert-note state-line"); n.id = "hall-inert-note"; document.body.appendChild(n); }
    n.textContent = "table code copied - " + tid; n.classList.add("show");
    clearTimeout(shareCode._t); shareCode._t = setTimeout(function () { n.classList.remove("show"); }, 2600);
  }

  // ── the sheet's own wiring (faction picks, tier rows, the acts, close) ──
  function wireSheet() {
    var host = $("hall-sheet-host"); if (!host) return;
    var close = host.querySelector("[data-sheet-close]"); if (close) close.onclick = function () { if (ceremony && ceremony.step !== "error") return; sheet = null; ceremony = null; renderSheet(); };
    var ov = host.querySelector(".hall-sheet-overlay"); if (ov) ov.addEventListener("click", function (e) { if (e.target === ov && !(ceremony && ceremony.step !== "error")) { sheet = null; ceremony = null; renderSheet(); } });
    // live-capture input values into ctx so a re-render (e.g. a faction pick) never wipes a half-typed field
    Array.prototype.forEach.call(host.querySelectorAll("input"), function (inp) {
      inp.addEventListener("input", function () {
        sheet.ctx = sheet.ctx || {};
        if (inp.id === "hall-friend-stake") sheet.ctx.stakeInput = inp.value;
        else if (inp.id === "hall-friend-opp") sheet.ctx.opponent = inp.value;
        else if (inp.id === "hall-friend-code") sheet.ctx.codeInput = inp.value;
        else if (inp.id === "hall-limit-input") sheet.ctx.input = inp.value;
      });
    });
    // faction picks
    Array.prototype.forEach.call(host.querySelectorAll(".hall-faction-sigil"), function (b) { b.onclick = function () { selectedFaction = b.getAttribute("data-faction"); renderSheet(); }; });
    // tier rows (open sheet)
    Array.prototype.forEach.call(host.querySelectorAll("[data-tier-row]"), function (b) { b.onclick = function () { var id = b.getAttribute("data-tier-row"); sheet.ctx = sheet.ctx || {}; sheet.ctx.tierId = id; renderSheet(); }; });
    // ceremony retry
    var retry = host.querySelector("[data-cer-retry]"); if (retry) retry.onclick = function () { ceremony = null; renderSheet(); };
    // the acts
    var od = host.querySelector("[data-open-do]"); if (od) od.onclick = doOpen;
    var jd = host.querySelector("[data-join-do]"); if (jd) jd.onclick = doSeat;
    var cd = host.querySelector("[data-cancel-do]"); if (cd) cd.onclick = doCancel;
    var fc = host.querySelector("[data-friend-create]"); if (fc) fc.onclick = doFriendCreate;
    var ff = host.querySelector("[data-friend-find]"); if (ff) ff.onclick = doFriendFind;
    var fj = host.querySelector("[data-friend-join]"); if (fj) fj.onclick = doFriendJoin;
    var ls = host.querySelector("[data-limit-set]"); if (ls) ls.onclick = doLimitSet;
    var lr = host.querySelector("[data-limit-remove]"); if (lr) lr.onclick = doLimitRemove;
    var chip = host.querySelector(".hall-code-chip"); if (chip) chip.onclick = function () { shareCode(chip.getAttribute("data-copy")); };
    Array.prototype.forEach.call(host.querySelectorAll("[data-sheet-switch]"), function (b) { b.onclick = function () { sheet = { kind: b.getAttribute("data-sheet-switch"), ctx: {} }; renderSheet(); }; });
  }

  // ── the act handlers ──
  function doOpen() {
    var ctx = sheet.ctx || {}; var chosen = ctx.tierId ? TIERS.filter(function (x) { return x.id === ctx.tierId; })[0] : null;
    if (!chosen || !selectedFaction) return;
    if (chosen.id === "free") { lastServerError = null; if (client) client.open(0, selectedFaction); return; } // server refuses tier 0 today (W3-LOBBY-DOORS-1); the refusal surfaces via lastReject
    ceremonyOpen({ tier: chosen.tier, faction: selectedFaction, stakeWei: chosen.stake });
  }
  function doSeat() {
    var t = sheet.ctx.table; if (!t || !selectedFaction) return;
    if (!t.staked) { if (client) client.join(t.id, selectedFaction); return; } // FREE seat = one tap
    ceremonyJoin({ tableId: t.id, faction: selectedFaction, escrowMatchId: t.escrowMatchId, stakeWei: t.stake, opponent: t.opener, tier: t.tier, friend: t.friend });
  }
  function doCancel() { ceremonyCancel(sheet.ctx.table); }
  function doFriendCreate() {
    var host = $("hall-sheet-host");
    var stakeStr = (host.querySelector("#hall-friend-stake") || {}).value || "";
    var opp = ((host.querySelector("#hall-friend-opp") || {}).value || "").trim();
    sheet.ctx = sheet.ctx || {}; sheet.ctx.stakeInput = stakeStr; sheet.ctx.opponent = opp; sheet.ctx.err = null;
    var n; try { n = BigInt(Math.trunc(Number(stakeStr))); } catch (e) { n = 0n; }
    if (!(n >= 10n && n <= 10000n)) { sheet.ctx.err = "stake must be 10 - 10,000 DYC"; renderSheet(); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(opp)) { sheet.ctx.err = "enter your friend's full wallet address (0x…)"; renderSheet(); return; }
    if (!selectedFaction) { sheet.ctx.err = "choose your faction"; renderSheet(); return; }
    var stakeWei = (n * DEC).toString();
    sheet.ctx.stakeWei = stakeWei; renderSheet();
    ceremonyOpen({ tier: null, faction: selectedFaction, stakeWei: stakeWei, friendAddr: opp }).then(function (id) {
      if (id) { sheet = { kind: "friend", ctx: { made: true, opponent: opp } }; renderSheet(); } // the code (= the lobby tableId) populates from the feed
    });
  }
  // the friend table code = its lobby tableId; find the freshly-created one (mine + friend + this opponent)
  function findMyFriendTableId() {
    for (var i = 0; i < tables.length; i++) { var t = tables[i]; if (t.friend && me && String(t.opener).toLowerCase() === me) return t.id; }
    return "(opening…)";
  }
  function doFriendFind() {
    var host = $("hall-sheet-host");
    var code = ((host.querySelector("#hall-friend-code") || {}).value || "").trim();
    sheet.ctx = sheet.ctx || {}; sheet.ctx.codeInput = code; sheet.ctx.err = null;
    var t = lookupTableByCode(code);
    if (!t) { sheet.ctx.err = "no table found for that code - ask your friend to re-share it"; renderSheet(); return; }
    if (!t.staked) { sheet.ctx.err = "that code is not a staked table"; renderSheet(); return; }
    sheet.ctx.table = t; renderSheet();
  }
  function doFriendJoin() {
    var t = sheet.ctx.table; if (!t || !selectedFaction) return;
    ceremonyJoin({ tableId: t.id, faction: selectedFaction, escrowMatchId: t.escrowMatchId, stakeWei: t.stake, opponent: t.opener, tier: t.tier, friend: true });
  }
  function doLimitSet() {
    var host = $("hall-sheet-host");
    var v = ((host.querySelector("#hall-limit-input") || {}).value || "").trim();
    sheet.ctx = sheet.ctx || {}; sheet.ctx.input = v; sheet.ctx.err = null;
    var n; try { n = BigInt(Math.trunc(Number(v))); } catch (e) { n = -1n; }
    if (n < 0n || v === "") { sheet.ctx.err = "enter a whole DYC amount (0 or more)"; renderSheet(); return; }
    if (client) client.setLossLimit((n * DEC).toString());
    sheet = null; renderSheet();
  }
  function doLimitRemove() { if (client) client.clearLossLimit(); sheet = null; renderSheet(); }

  function connectWallet() {
    if (window.DYWallet && window.DYWallet.connect) {
      window.DYWallet.connect().then(function (r) { me = String((r && (r.address || r)) || "").toLowerCase() || me; runGate(); }).catch(function () {});
      return;
    }
    // minimal fallback: EIP-1193
    var eth = window.ethereum; if (!eth) return;
    eth.request({ method: "eth_requestAccounts" }).then(function (a) { me = String(a && a[0] || "").toLowerCase(); runGate(); }).catch(function () {});
  }

  // ── BOOT ─────────────────────────────────────────────────────────────────
  function boot() {
    // identity: a dev override (proof) or an already-connected wallet; else the connect card.
    var dev = devIdentity();
    if (dev) { me = String(dev).toLowerCase(); }
    else if (window.ethereum && window.ethereum.selectedAddress) { me = String(window.ethereum.selectedAddress).toLowerCase(); }
    runGate();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.DYHall = {
    TIERS: TIERS,
    _state: function () {
      return {
        accessState: accessState, feedState: feedState, selectedTier: selectedTier, tables: tables, me: me,
        selectedFaction: selectedFaction, sheet: sheet ? { kind: sheet.kind, ctx: sheet.ctx } : null,
        ceremony: ceremony ? { kind: ceremony.kind, step: ceremony.step, error: ceremony.error } : null,
        matchView: matchView ? { matchId: matchView.matchId, seat: matchView.seat, phase: matchView.phase, myTurn: matchView.myTurn, over: !!matchView.outcome } : null,
        signedInAs: signedInAs, settleState: settleState, settlement: settlementView || (matchView && matchView.settlement) || null,
        lossLimit: lossLimit, liquid: liquid == null ? null : liquid.toString(),
        pending: readPending(), lastServerError: lastServerError, escrow: escrowAddr(),
        matchReject: matchView ? matchView.lastReject : null,
      };
    },
  };
})();
