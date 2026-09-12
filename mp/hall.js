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
  // S-HALL-DRESS-2 (U2) — the faction mark is the MASTER'S RASTER SIGIL, not the authored abstract sprite.
  // Owner-ruled 2026-09-09: ornament.js's veto is a SCRIPT veto over the authored SVG geometry; the raster art
  // is its carve-out, and the approved mockups compose on exactly these files. Markup only — no handler reads it.
  function sigilImg(stem, cls) { return '<img class="hall-glyph ' + (cls || "") + '" src="../assets/hall/' + stem + '.jpg" alt="" aria-hidden="true">'; }
  // S-HALL-DRESS-3 (M1) — the tier mark is the ROUND-TWO RASTER MEDALLION. The ornament sprite stays whole in
  // js/ornament.js and is untouched: wire.html and the other rooms still draw from it, and the ESCROW LOCK below
  // still does too. Only the Hall's tier emitters moved (the DRESS-2 pattern). Markup only.
  function medallionImg(stem, cls) { return '<img class="hall-glyph ' + (cls || "") + '" src="../assets/hall/' + stem + '.webp" alt="" aria-hidden="true">'; }

  // ── D3/D4/A7: THE ONE canonical tier config. id/label/stake(wei)/usd/open/medallion/sort. Table 0 (FREE) first-class.
  //    The M-P4 road (matchclient.openStaked) is called with `stake`. Retiring a door = flip `open` (no markup edit).
  var DEC = 1000000000000000000n;
  var TIERS = [
    { id: "free",    label: "FREE",    tier: 0,    stake: "0",                     usd: "no stake",  open: true, medallion: "tier_free",    cls: "tier-free",    sort: 0 },
    { id: "bronze",  label: "BRONZE",  tier: 10,   stake: (10n * DEC).toString(),   usd: "$0.10",     open: true, medallion: "tier_bronze",  cls: "tier-bronze",  sort: 1 },
    { id: "silver",  label: "SILVER",  tier: 50,   stake: (50n * DEC).toString(),   usd: "$0.50",     open: true, medallion: "tier_silver",  cls: "tier-silver",  sort: 2 },
    { id: "gold",    label: "GOLD",    tier: 200,  stake: (200n * DEC).toString(),  usd: "$2",        open: true, medallion: "tier_gold",    cls: "tier-gold",    sort: 3 },
    { id: "diamond", label: "DIAMOND", tier: 1000, stake: (1000n * DEC).toString(), usd: "$10",       open: true, medallion: "tier_diamond", cls: "tier-diamond", sort: 4 },
    { id: "friend",  label: "FRIEND",  tier: null, stake: null,                     usd: "10-10,000", open: true, medallion: "tier_friend",   cls: "tier-friend",  sort: 5, friend: true },
  ];
  function shortAddr(a) { a = String(a || ""); return a.length >= 10 ? a.slice(0, 6) + "…" + a.slice(-4) : a; }
  var FACTION_SIGIL = { devas: "sigil_devas", asuras: "sigil_asuras", vanaras: "sigil_vanaras", nagas: "sigil_nagas" };

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
  // ── S-HALL-FREE-1 (R1/R2) — THE ENGINE, LAZILY, AND ONLY IF IT IS THE RIGHT ONE ─────────────────────────────
  //  The Hall plays the STAKED road redacted: the server sends views, the client renders them, no engine needed.
  //  A FREE table rides the MIRROR road — the server sends a seed and each client runs the engine itself. The
  //  Hall's own FREE door opens tier-0 tables, so the Hall must be able to play one. It loads the site's
  //  sync-produced byte-identical copy (game/src/engine.js) — LOADED, never forked, never edited — plus the same
  //  wrapper wire.html uses, and only on the first mirror frame. A staked-only session loads neither.
  //  THE PIN (R2): scripts/sync_game.sh writes game/src/engine.sha256 beside the copy. The Hall hashes the source
  //  it actually fetched and compares BEFORE building E. Drift refuses and says so — it never plays a wrong engine.
  var HALL_E = {};                 // filled IN PLACE by ensureEngine(); matchclient captured this object at boot
  var enginePromise = null;
  //  MIRRORED BYTE-FOR-BYTE from mp/wire.html:99 — the twelve names the mirror road needs. There is ONE assembly
  //  list; the suite asserts the two are identical, so neither file can hold a second opinion of which twelve.
  var ENGINE_KEYS = ["newGame","playCard","pass","mulligan","doLeap","canLeap","bestLeap","designateShield","playableIndices","targetSpec","adjacentUnits","effPower"];
  function sha256Hex(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }
  function fetchText(src) {
    return fetch(src, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(src + " " + r.status); return r.text(); });
  }
  function ensureEngine() {
    if (enginePromise) return enginePromise;
    var base = "../game/src/";
    enginePromise = Promise.all([fetchText(base + "engine.js"), fetchText(base + "engine.sha256")])
      .then(function (out) {
        var src = out[0], pin = String(out[1]).trim().split(/\s+/)[0];
        if (!/^[0-9a-f]{64}$/.test(pin)) throw new Error("the engine pin is unreadable");
        return sha256Hex(src).then(function (got) {
          if (got !== pin) throw new Error("engine drift: the copy does not match its pin");
          //  We EXECUTE THE BYTES WE HASHED. A <script src> would re-fetch, and a re-fetch can serve something
          //  other than what the pin vouched for; indirect eval runs this exact string in global scope, which is
          //  what a <script> would have done to it. (If a Content-Security-Policy is ever added to the site, this
          //  line needs 'unsafe-eval' — named here so the choice is visible, not discovered.)
          (0, eval)(src);
          return fetchText("wrapper.js?v=mp3").then(function (wsrc) { (0, eval)(wsrc); });
        });
      })
      .then(function () {
        ENGINE_KEYS.forEach(function (k) { HALL_E[k] = window[k]; });
        if (typeof HALL_E.newGame !== "function") throw new Error("the engine loaded but exposes no newGame");
        engineNote = null; renderCurrent(); return HALL_E;
      })
      .catch(function (e) { enginePromise = null; engineNote = ENGINE_REFUSED; renderCurrent(); throw e; });
    return enginePromise;
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
    // R5 applies on BOTH pass roads — this bypass called startFeed() directly, which would have started (and so
    // signed) B's session without a click. The guard belongs wherever the session can start.
    if (devAccessBypass()) { accessState = "pass"; if (!signInNeeded) startFeed(); loadEthers().then(function (e) { readLiquid(e); }).catch(function () {}); return render(); } // proof-only bypass (still reads liquid for affordability)
    accessState = "init"; render();
    loadEthers().then(function (ethers) {
      var acc = CFG.contracts && CFG.contracts.accessNFT;
      if (!acc) { accessState = "busy"; return render(); }
      return new ethers.Contract(acc, ACCESS_ABI, readProvider(ethers)).balanceOf(me).then(function (bal) {
        if (gen !== gateGen) return;                          // read-generation guard
        accessState = (bal && bal > 0n) ? "pass" : "gateless";
        if (accessState === "pass") {
          try { sessionStorage.setItem("dyw_pass", "1"); } catch (e) {} // G5 — a Hall holder carries the same site pass, so PRACTICE into the game copy isn't bounced to the rite
          readLiquid(ethers);
          // S-HALL-ACCOUNT-1 (R5) — after an account switch the session waits for a click. accountsChanged is
          // broadcast to EVERY connected site, so a switch made for another tab reaches the Hall too, and the Hall
          // cannot tell a deliberate switch from a stray one. The CHROME-1 law therefore holds absolutely: no
          // prompt without a human act ON THE HALL. (The gate and the liquid read are chain reads — they prompt
          // nothing — so B's world is already true on screen while the pen stays untouched.)
          if (!signInNeeded) startFeed();
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
    // S-HALL-CHROME-1 (M3) — the catch used to be EMPTY, so a dead RPC left `liquid` at its previous value and the
    // header went on rendering a stale number. Busy-sentinel law: an unreadable balance is null, which the header
    // already draws as "—". Never a stale number silently.
    new ethers.Contract(dyc, DYC_ABI, readProvider(ethers)).balanceOf(me)
      .then(function (b) { liquid = b; render(); })
      .catch(function () { liquid = null; render(); });
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
      E: HALL_E, W: window.DYWrapper || {}, ethers: window.ethers, log: function () {}, ensureEngine: ensureEngine,
      onRelay: onWireRelay,   // S-HALL-WIRE-1 — the FREE road's ordered stream, for the battle frame
      onUpdate: function (v) {
        if (gen !== feedGen) return;                          // read-generation guard on the feed
        lastView = v || null;
        // L3 — the MATCH view (staked redacted road): render the battle in the browser. The matched-moment beat plays
        //   once per matchId, then the battle; the settlement strip rides the over state. A dismissed match falls to lobby.
        if (v && v.screen === "match" && v.matchId && !dismissedMatch[v.matchId]) {
          if (matchView == null || matchView.matchId !== v.matchId) { settleState = {}; pendingPlay = null; mullPick = {}; }
          // S-HALL-CHROME-1 (M2) — keep the lobby list CURRENT while the battle owns the screen. This branch
          // returns before the lobby reconcile below, which is why the floor used to come back frozen at its
          // pre-join frame (and re-expose a table the join had already consumed).
          if (Array.isArray(v.tables)) { tables = v.tables.slice(); reconcilePendingAgainstTables(tables); }
          matchView = v; sheet = null; renderSheet(); startL3Tick();
          if (!dealtMatches[v.matchId]) { render(); setTimeout(function () { dealtMatches[v.matchId] = true; if (matchView && matchView.matchId === v.matchId) renderMatchScreen(); }, 2000); return; } // B2 matched moment
          renderMatchScreen(); return;
        }
        // LOBBY view (or a dismissed match)
        matchView = null;
        // S-HALL-ACCOUNT-1 (R1) — THE DEFERRED RE-KEY. The battle held the switch off so a wallet click could not
        // cost a forfeit; the shield lifts the moment the battle clears, and the law resumes unprompted.
        if (maybeReKey()) return;
        if (v && v.screen === "match" && (v.settlement || v.pendingSlip)) settlementView = v.settlement || v.pendingSlip; // keep the slip visible in the lobby after leaving (S-HALL-SLIP-SCOPE-1: an off-match slip lands here too)
        // busy-sentinel honesty: a dropped/refused socket is DEAD (busy face), never a false empty room.
        // S-HALL-CHROME-1 (M4) — THE HALL NEVER PROMPTS THE WALLET WITHOUT A HUMAN ACT. The old road called
        // scheduleReconnect() here, which rebuilt the client and fired authConnected() → personal_sign: a MetaMask
        // popup in a tab nobody was looking at, every idle-timeout cycle. Now: a quiet state and a card; only the
        // click reconnects. Mid-battle is NOT governed here — matchclient keeps its own auto-reconnect, because a
        // silent forfeit is worse than a popup (owner ruling R3).
        if (v && v.connected === false) { feedState = "dead"; connectionLost = true; return render(); }
        seatedElsewhere = (v && v.seatedElsewhere) || null;   // S-HALL-ELSEWHERE-1 — never an `if`: absent means gone
        if (v && Array.isArray(v.tables)) { tables = v.tables.slice(); feedState = "live"; reconnectTries = 0; connectionLost = false; reconcilePendingAgainstTables(tables); } // whole-list reconcile (+ B2: our escrow appearing here is the server's own proof it learned the open)
        if (v && v.lossLimit) lossLimit = v.lossLimit;
        if (v && (v.settlement || v.pendingSlip)) settlementView = v.settlement || v.pendingSlip; // a pending slip surfaced in the lobby (resume-after-reload). S-HALL-SLIP-SCOPE-1 — THE HONEST HOME: an old unsettled slip surfaces here as its own affordance, never as a live match's outcome.
        // S-HALL-L3-FIX-1 (B2) — the {opened} ACK. It used to be log-only; it now clears the record that was
        //   waiting for it. Nothing else in the Hall may clear an open record.
        if (v && v.lastOpened && v.lastOpened.at !== seenOpenAck) {
          seenOpenAck = v.lastOpened.at; consumeOpenAck();
          // S-HALL-CHROME-1 (M1) — the FREE open is fire-and-forget, so only the server's ack can tell its sheet the
          // work is done. (The staked open already self-dismisses at its own success; its 2026-09-07 overstay was
          // the FIX-1 strand — a hung tx.wait() — and is healed there, not here.)
          if (freeOpenPending) { freeOpenPending = false; if (sheet && sheet.kind === "open") { sheet = null; renderSheet(); } }
        }
        // S-HALL-L3-FIX-1 (B3) — RESUME ON AUTHED. `v.me` is set only when the server accepted our signature, so
        //   a resume can no longer fire into a socket that would refuse it. Once per feed generation.
        if (v && v.me && resumedGen !== gen) {
          resumedGen = gen; signedInAs = signedInAs || v.me;
          try { if (client.resumeSettlement) client.resumeSettlement(); } catch (e) {}
          try { resumePendingTx(); } catch (e) {}
        }
        if (v && v.me && !signedInAs) signedInAs = v.me;      // B1 — the recovered connected-wallet identity
        // surface a server refusal honestly (FREE tier-0, join-not-locked, loss backstop) — de-duped so it shows once.
        if (v && v.lastReject && v.lastReject !== seenReject) {
          seenReject = v.lastReject; lastServerError = v.lastReject;
          freeOpenPending = false;              // M1 — a refusal ends the wait; the sheet HOLDS its error, as today
          // B2 — a refusal ({error}) arriving while an open record waits in step:"server" surfaces the ruled
          //   affordance. It NEVER clears the record: the stake is locked and still needs finishing or refunding.
          var awaiting = listPending().filter(function (e) { return e.rec && e.rec.kind === "open" && e.rec.step === "server"; });
          if (awaiting.length === 1 && !openStrand) { raiseStrand(awaiting[0].slot, awaiting[0].rec.escrowMatchId, awaiting[0].rec.stake); }
          if (sheet) renderSheet();
        }
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
      // S-HALL-L3-FIX-1 (B3) — the poll BOOTSTRAPS the sign-in and nothing else. The old road also scheduled the
      //   resume on a fixed 1100ms timer, which fired while the personal_sign prompt was still on screen: the send
      //   went into an unauthed socket the server would refuse, and the record was cleared anyway. Resume is now
      //   driven by the AUTHED signal in onUpdate. (authConnected is safe before the challenge: B3 sets the mode
      //   first, so the challenge handler signs when it lands.)
      var poll = setInterval(function () { if (client && me && window.ethereum) { clearInterval(poll); client.authConnected(); client.getLossLimit && setTimeout(function () { try { client.getLossLimit(); } catch (e) {} }, 600); } }, 120);
      setTimeout(function () { clearInterval(poll); }, 20000); // patient: a mobile in-app wallet can inject window.ethereum a beat late (DYWallet's 3s-detection reasoning)
    } catch (e) { feedState = "dead"; render(); }
    // bounded connect watchdog: no {tables} within 8s → dead face (never a false empty room)
    setTimeout(function () { if (gen === feedGen && feedState === "connecting") { feedState = "dead"; connectionLost = true; render(); } }, 8000); // M4 — no auto-reconnect; the card asks
  }
  // S-HALL-CHROME-1 (M4) — THE AUTO-RECONNECT IS GONE. `scheduleReconnect` used to rebuild the client on a
  // backoff; because startFeed's poll calls authConnected(), every one of those rebuilds fired a personal_sign —
  // a wallet popup in an idle tab. The road back is now the RECONNECT card's click and nothing else. The function
  // is DELETED rather than left unused, so no future edit can quietly re-arm it.
  var reconnectTries = 0;                   // kept: the click resets it; a live feed clears it
  var resumedGen = 0, seenOpenAck = null;   // B3: resume fires once per feed generation, on the authed signal

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
  // S-HALL-L3-FIX-1 (B4) — the lock-confirmed-but-server-untold state, and its unknown-receipt sibling.
  var openStrand = null;        // { slot, escrowMatchId, stake } — lock CONFIRMED, table not opened (the 8d affordance)
  var openUnknown = null;       // { slot, txHash, stake } — bounded wait elapsed, receipt not yet seen (no 8d claim)
  var resumeNote = null;        // B3 — resume never fails in silence; this line is rendered in the lobby
  // S-HALL-CHROME-1
  var freeOpenPending = false;  // M1 — a FREE open awaiting OUR {opened} ack, which is what closes its sheet
  var connectionLost = false;   // M4 — the lobby's quiet state: a dropped socket NEVER pokes the wallet
  // S-HALL-ACCOUNT-1 — THE HALL FOLLOWS THE WALLET.
  var walletSeen = null;        // the last address the WALLET itself reported (null until it reports one)
  var accountNote = null;       // the ordinary "account changed" line, shown as the Hall re-becomes itself
  var pendingReKey = null;      // R1 — a switch deferred because a battle is live; runs when matchView clears
  var signInNeeded = false;     // R5 — the visual re-key is immediate; the SESSION waits for a human act ON THE HALL
  var ackWatch = {};            // slot -> timer: a delivered send that never draws an ack raises the affordance
  var ACK_WAIT_MS = 8000;

  // ── THE RULED MONEY COPY (docs/LOBBY_DESIGN.md section 11, VERBATIM — only the bracket slots are filled). ──
  var FACTIONS = ["devas", "asuras", "vanaras", "nagas"];
  function dycOf(wei) { try { return (BigInt(wei) / DEC).toString(); } catch (e) { return "0"; } }
  function COMMITMENT(stakeWei) {
    return "Your " + dycOf(stakeWei) + " DYC locks in escrow now. It returns in full if you cancel before anyone sits, or on a draw. The winner takes the pot minus the 5% platform fee. If a finished match is somehow never settled, the chain refunds both players automatically after 24 hours - locked stakes can never be stranded.";
  }
  var BOTH_STAKES = "Once both stakes lock, the match begins.";
  // S-HALL-L3-FIX-2 (B2) — RULED 2026-09-08 (LOBBY_DESIGN amendment 2026-09-08b). A cancel act on a plaque whose
  // escrow is no longer OPEN must not report a raw revert string under a button that promised a refund. Shown ONLY
  // when the chain confirms the escrow has moved on; a genuinely unknown revert keeps the generic message.
  var CANCEL_MOVED_ON = "this table is no longer cancellable - the match has moved on";
  // S-HALL-ACCOUNT-1 (R2) — RULED 2026-09-08 (LOBBY_DESIGN amendment 2026-09-08d).
  //   ACCOUNT_CHANGED is ordinary copy: operational, no money claim, like the reconnect card.
  //   CROSS_ACCOUNT is §11 ruled copy: it stands between a player and locked money and must never be paraphrased
  //   into something that reads like a loss. The bracket slot is the address, filled the way every slot is.
  function ACCOUNT_CHANGED(addr) { return "account changed - the Hall is now following " + shortAddr(addr); }
  function CROSS_ACCOUNT(addr) { return "this was prepared for another account - switch back to " + shortAddr(addr) + " to finish it"; }
  // S-HALL-L3-FIX-1 (B4) — RULED 2026-09-08 as LOBBY_DESIGN.md section 8d (verbatim copy-block law). The bracket
  // slot is filled from the pending record, exactly as COMMITMENT fills its own. CC never paraphrases this line.
  function STRAND_LOCKED(stakeWei) { return "Your " + dycOf(stakeWei) + " DYC is locked in escrow, but the table has not opened yet."; }
  // S-HALL-CODE-LOOKUP-1 (R1) — RULED 2026-09-08 (LOBBY_DESIGN amendment 2026-09-08c, §11 enumerated). Shown ONLY
  // when the lookup got no answer at all — never when the server answered "no such code". It says whose fault it
  // is, clears the player of a typo, and invites the retry the code entry survives for.
  var FRIEND_UNREACHABLE = "could not reach the table server - your code is fine, try again in a moment";
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
  //  S-HALL-ACCOUNT-1 (L2) — NO CROSS-SIGNING, STRUCTURALLY. getSigner() follows the LIVE wallet while `me` is the
  //  identity everything else is keyed to (the gate, the session, the pending records, the escrow ownership reads).
  //  If those two ever disagree, the pen belongs to another account and NOTHING may be signed: every ceremony in the
  //  Hall — open, join, cancel, settle, the strand's finish — reaches the wallet through here and through nowhere
  //  else, so one guard covers them all. This also refuses a settle mid-battle while the wallet has wandered (R1),
  //  because `me` is still the seat's address until the deferred re-key runs.
  function signerRoad() {
    return loadEthers().then(function (ethers) {
      if (!window.ethereum) throw new Error("no wallet in this browser");
      var bp = new ethers.BrowserProvider(window.ethereum);
      return bp.getSigner().then(function (sg) {
        return sg.getAddress().then(function (a) {
          if (me && String(a).toLowerCase() !== me) { var e = new Error(CROSS_ACCOUNT(me)); e.crossAccount = true; throw e; }
          return { ethers: ethers, provider: bp, signer: sg };
        });
      });
    });
  }
  function feeOverrides() { try { return (window.DYWallet && window.DYWallet.feeOverrides) ? window.DYWallet.feeOverrides().catch(function () { return {}; }) : Promise.resolve({}); } catch (e) { return Promise.resolve({}); } }
  function escContract(r) { return new r.ethers.Contract(escrowAddr(), ESC_ABI, r.signer); }
  function dycContract(r) { return new r.ethers.Contract(dycAddr(), DYC_FULL_ABI, r.signer); }

  // ── persistPending / resumePendingTx (design-doc names) — a per-wallet record in the dyhall:: namespace, written at
  //    every tx hash + the escrowMatchId from the openMatch receipt, so a page death mid-ceremony resumes or abandons
  //    cleanly. Survives BOTH the approve→openMatch gap and the openMatch→server-open gap (the stated failure cases). ──
  //  S-HALL-L3-FIX-1 (B4) — PER-ATTEMPT RECORDS. The old road kept ONE slot per wallet and wrote it with a
  //  full setItem at ceremony start, so a second open ERASED the first attempt's tx hash — at most one of two
  //  locks could ever be recovered. Records now key per attempt: slot = the openMatch tx hash once known, with
  //  a single pre-hash "draft" slot per wallet. The draft is a distinct key, so it can never overwrite a
  //  hash-keyed record. A pre-FIX-1 single-slot record is adopted (never orphaned) by listPending.
  var PEND_ROOT = "dyhall::pending::";
  function pendWallet() { return (me || "anon"); }
  function pendPrefix() { return PEND_ROOT + pendWallet() + "::"; }
  function pendKey(slot) { return pendPrefix() + slot; }
  function writePending(slot, rec) { try { window.localStorage.setItem(pendKey(slot), JSON.stringify(rec)); } catch (e) {} }
  function readPendingSlot(slot) { try { var s = window.localStorage.getItem(pendKey(slot)); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function clearPendingSlot(slot) { try { window.localStorage.removeItem(pendKey(slot)); } catch (e) {} }
  function mergePendingSlot(slot, patch) { writePending(slot, Object.assign({}, readPendingSlot(slot) || {}, patch)); }
  function clearLegacyPending() { try { window.localStorage.removeItem(PEND_ROOT + pendWallet()); } catch (e) {} }
  function listPending() {
    var out = [];
    try {
      var pre = pendPrefix();
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i); if (!k || k.indexOf(pre) !== 0) continue;
        var rec = null; try { rec = JSON.parse(window.localStorage.getItem(k) || "null"); } catch (e) {}
        if (rec) out.push({ slot: k.slice(pre.length), rec: rec });
      }
      var legacy = window.localStorage.getItem(PEND_ROOT + pendWallet());   // pre-FIX-1 single slot — adopted, never orphaned
      if (legacy) { var lr = null; try { lr = JSON.parse(legacy); } catch (e) {} if (lr) out.push({ slot: "__legacy__", rec: lr, legacy: true }); }
    } catch (e) {}
    return out;
  }
  function dropRecord(e) { if (e && e.legacy) clearLegacyPending(); else if (e) clearPendingSlot(e.slot); }

  function parseMatchId(r, rc) {
    var esc = escContract(r), id = null;
    rc.logs.forEach(function (l) { try { var p = esc.interface.parseLog(l); if (p && p.name === "MatchOpened") id = p.args.id; } catch (e) {} });
    if (id == null) throw new Error("openMatch receipt carried no MatchOpened event");
    return id.toString();
  }
  // approve only when the standing allowance is short (store precedent — one tx when already approved)
  function ensureAllowance(r, stakeWei, slot) {
    var dyc = dycContract(r);
    return dyc.allowance(me, escrowAddr()).then(function (a) {
      if (BigInt(a) >= BigInt(stakeWei)) return false; // already sufficient
      mergePendingSlot(slot, { step: "approve" });
      return feeOverrides().then(function (fee) { return dyc.approve.staticCall(escrowAddr(), BigInt(stakeWei)).then(function () { return dyc.approve(escrowAddr(), BigInt(stakeWei), fee); }); })
        //  S-HALL-CEREMONY-1 (R2) — BOUNDED, like the lock. An unbounded tx.wait() here neither resolved nor threw
        //  on a wedged provider, freezing the sheet at "confirm in your wallet…" with the header never re-read.
        //  A bounded-out approve claims nothing: the approve moves NO DYC (it sets an allowance), so we go on to
        //  the lock, whose own staticCall is the truth-teller — a short allowance reverts there and the ruled
        //  error face is shown. Nothing was locked at that beat.
        .then(function (tx) { mergePendingSlot(slot, { approveTxHash: tx.hash }); return waitBounded(r, tx); }).then(function () { return true; });
    });
  }
  //  S-HALL-L3-FIX-1 (B4) — the wait is BOUNDED. An unbounded tx.wait() is what froze the sheet on the
  //  "confirm in your wallet…" line while the lock sat confirmed on chain: it neither resolved nor threw, so
  //  serverOpen was never reached and no error was ever shown. After OPEN_WAIT_MS we ask the provider for the
  //  receipt ourselves, once; a still-unknown receipt is reported honestly instead of hanging forever.
  var OPEN_WAIT_MS = 60000;
  function waitBounded(r, tx) {
    var timer = null;
    return Promise.race([
      Promise.resolve(tx.wait()).catch(function () { return null; }),
      new Promise(function (res) { timer = setTimeout(function () { res("timeout"); }, OPEN_WAIT_MS); }),
    ]).then(function (out) {
      if (timer) clearTimeout(timer);
      if (out && out !== "timeout") return out;
      return r.provider.getTransactionReceipt(tx.hash).catch(function () { return null; });
    });
  }
  function castOpenMatch(r, ctx) {
    var esc = escContract(r);
    mergePendingSlot("draft", { step: "openMatch" });
    return feeOverrides().then(function (fee) {
      return esc.openMatch.staticCall(BigInt(ctx.stakeWei), ctx.friendAddr || r.ethers.ZeroAddress, 0).then(function () {
        return esc.openMatch(BigInt(ctx.stakeWei), ctx.friendAddr || r.ethers.ZeroAddress, 0, fee);
      });
    }).then(function (tx) {
      // PROMOTE: this attempt now owns its own record, keyed by its tx hash. The draft is released so a second
      // ceremony cannot overwrite this one (the two-lock overwrite that lost the first escrow).
      var slot = String(tx.hash);
      writePending(slot, Object.assign({}, readPendingSlot("draft") || {}, { step: "openMatch", openTxHash: slot, at: Date.now() }));
      clearPendingSlot("draft");
      return waitBounded(r, tx).then(function (rc) { return { slot: slot, txHash: slot, rc: rc }; });
    });
  }
  //  S-HALL-L3-FIX-1 (B2) — THE ACKNOWLEDGED HANDOFF. clearPending() has LEFT this function. The record is
  //  journaled with the escrow id, the send is ATTEMPTED, and the record then STANDS until the server's
  //  {opened} ack (or our escrowMatchId appearing in {tables}) proves the server learned it. A send the socket
  //  did not carry now returns false instead of looking delivered.
  function serverOpen(ctx, id, slot) {
    mergePendingSlot(slot, { step: "server", escrowMatchId: String(id) });
    var delivered = !!(client && client.stakedOpen({ tier: ctx.tier, faction: ctx.faction, escrowMatchId: id, friend: !!ctx.friendAddr, stake: ctx.stakeWei }));
    if (delivered) armAckWatch(slot, ctx.stakeWei, id);
    else raiseStrand(slot, id, ctx.stakeWei);
    return delivered;
  }

  // THE OPEN CEREMONY — ctx = { tier, faction, stakeWei, friendAddr? }
  function ceremonyOpen(ctx) {
    lastActCtx = { tier: ctx.tier, faction: ctx.faction, stake: ctx.stakeWei, friend: !!ctx.friendAddr };
    ceremony = { kind: "open", step: "approve", ctx: ctx, error: null };
    writePending("draft", { kind: "open", step: "approve", tier: ctx.tier, faction: ctx.faction, stake: ctx.stakeWei, friend: !!ctx.friendAddr, friendAddr: ctx.friendAddr || null, at: Date.now() });
    renderSheet();
    return signerRoad().then(function (r) {
      return ensureAllowance(r, ctx.stakeWei, "draft").then(function () {
        ceremony.step = "lock"; renderSheet();
        return castOpenMatch(r, ctx);
      }).then(function (out) {
        if (!out.rc) {
          // bounded out with no receipt: we do NOT know the lock landed, so we do not claim it did (the 8d line
          // is only honest once the lock is confirmed). The record stands; a reload or CHECK AGAIN resumes it.
          ceremony = null; openUnknown = { slot: out.slot, txHash: out.txHash, stake: ctx.stakeWei };
          showSheet({ kind: "strand" }); return null;
        }
        var id = parseMatchId(r, out.rc);
        var delivered = serverOpen(ctx, id, out.slot);
        lockConfirmed();                                   // M3 + CEREMONY-1 — the lock moved DYC: beats end, header re-reads
        // raiseStrand has already set the 8d card; repaint NOW rather than leaving the stale wallet line up for a
        // tick until its own setTimeout lands. The strand's honest hold itself is untouched.
        if (!delivered) { renderCurrent(); renderSheet(); return id; }
        // the friend sheet STAYS — it carries the code to share — but it is repainted, never left on a stale beat.
        if (!ctx.friendAddr) closeSheet(); else renderSheet();
        return id;
      });
    }).catch(function (e) { if (ceremony) { ceremony.step = "error"; ceremony.error = ceremonyMsg(e); } renderSheet(); });
  }

  // THE JOIN CEREMONY — approve -> joinMatch -> server join (server gates on both stakes locked)
  function ceremonyJoin(ctx) {
    // ctx = { tableId, faction, escrowMatchId, stakeWei, opponent }
    lastActCtx = { tier: ctx.tier, faction: ctx.faction, stake: ctx.stakeWei, opponent: ctx.opponent, friend: !!ctx.friend };
    ceremony = { kind: "join", step: "approve", ctx: ctx, error: null };
    var jslot = "join-" + String(ctx.escrowMatchId);
    writePending(jslot, { kind: "join", step: "approve", tableId: ctx.tableId, faction: ctx.faction, escrowMatchId: ctx.escrowMatchId, stake: ctx.stakeWei, at: Date.now() });
    renderSheet();
    return signerRoad().then(function (r) {
      return ensureAllowance(r, ctx.stakeWei, jslot).then(function () {
        ceremony.step = "lock"; renderSheet();
        mergePendingSlot(jslot, { step: "joinMatch" });
        var esc = escContract(r);
        return feeOverrides().then(function (fee) { return esc.joinMatch.staticCall(BigInt(ctx.escrowMatchId), 0).then(function () { return esc.joinMatch(BigInt(ctx.escrowMatchId), 0, fee); }); }).then(function (tx) { mergePendingSlot(jslot, { joinTxHash: tx.hash }); return tx.wait(); });
      }).then(function () {
        // B1/B2 — the joiner's stake is money too: journal, attempt, and only clear when the socket carried it.
        mergePendingSlot(jslot, { step: "server" });
        var delivered = !!(client && client.join(ctx.tableId, ctx.faction));
        lockConfirmed();                                   // M3 + CEREMONY-1 — the lock moved DYC: beats end, header re-reads
        if (!delivered) { resumeNote = "your stake locked, but the table could not be told — reload to finish taking the seat."; renderCurrent(); renderSheet(); return; }
        clearPendingSlot(jslot); closeSheet(); render();
      });
    }).catch(function (e) { if (ceremony) { ceremony.step = "error"; ceremony.error = ceremonyMsg(e); } renderSheet(); });
  }

  // THE CANCEL — cancelMatch (full refund) then the server close. escrowMatchId from the table.
  //  S-HALL-L3-FIX-1 (B4) — the SAME cancel road now also serves a stranded escrow, which has no server table
  //  row (t.id null) to close. Nothing else about the refund changes.
  function ceremonyCancel(t) {
    ceremony = { kind: "cancel", step: "cancel", ctx: { tableId: t.id, escrowMatchId: t.escrowMatchId }, error: null }; renderSheet();
    var road = null;
    return signerRoad().then(function (r) {
      road = r;
      var esc = escContract(r);
      return feeOverrides().then(function (fee) { return esc.cancelMatch.staticCall(BigInt(t.escrowMatchId)).then(function () { return esc.cancelMatch(BigInt(t.escrowMatchId), fee); }); })
        .then(function (tx) { return tx.wait(); }).then(function () {
          if (t.id && client) client.close(t.id);            // a ghost has no table to close
          if (t.slot) settleStrand(t.slot);                  // the stake is refunded — the record has done its work
          ceremony = null; openStrand = null; openUnknown = null; readLiquidAgain(); closeSheet(); render();
        });
    }).catch(function (e) {
      // The staticCall rejects BEFORE any wallet prompt, so nothing was signed and no gas was spent. Report the
      // generic message at once, then — if the chain says the escrow simply moved on — replace it with the ruled
      // line. No custom-error ABI decode here (standing polish item); the state read is the honest signal.
      if (!ceremony) return;
      ceremony.step = "error"; ceremony.error = ceremonyMsg(e); renderSheet();
      if (!road || t.escrowMatchId == null) return;
      return readOpenState(road, t.escrowMatchId).then(function (st) {
        if (st.ok && st.state !== 1 && ceremony && ceremony.step === "error") { ceremony.error = CANCEL_MOVED_ON; renderSheet(); }
      });
    });
  }
  function readLiquidAgain() { loadEthers().then(function (ethers) { readLiquid(ethers); }).catch(function () {}); }

  //  S-HALL-L3-FIX-1 (B4) — raise the ruled affordance. Called when a lock is CONFIRMED but the server was not
  //  told: the send was refused by a closed socket, or it was carried but no ack ever came back (a refusal such
  //  as "not authed"). The record is NEVER cleared here — it is what FINISH OPENING and the reload road use.
  function raiseStrand(slot, escrowMatchId, stakeWei) {
    openUnknown = null;
    openStrand = { slot: slot, escrowMatchId: String(escrowMatchId), stake: String(stakeWei) };
    sheet = { kind: "strand" };
    // Paint on the next tick: a caller may still be inside its ceremony (ceremony not yet nulled), and the sheet
    // renders the ceremony strip in place of the two acts while one is in flight. render() does not draw the
    // sheet on the lobby road, so the affordance is drawn explicitly here — one place, every raising path.
    setTimeout(function () { renderCurrent(); renderSheet(); }, 0);
  }
  function armAckWatch(slot, stakeWei, id) {
    if (ackWatch[slot]) clearTimeout(ackWatch[slot]);
    ackWatch[slot] = setTimeout(function () {
      delete ackWatch[slot];
      var rec = readPendingSlot(slot);
      if (!rec || rec.step !== "server") return;            // the ack (or the {tables} reconcile) already cleared it
      raiseStrand(slot, rec.escrowMatchId || id, rec.stake || stakeWei); renderCurrent();
    }, ACK_WAIT_MS);
  }
  function settleStrand(slot) {                              // the server has confirmed this escrow — the record may go
    if (ackWatch[slot]) { clearTimeout(ackWatch[slot]); delete ackWatch[slot]; }
    clearPendingSlot(slot);
    //  S-HALL-CEREMONY-1 — the SIXTH omission site, found while proving P1: the ack settles the strand and clears
    //  the sheet STATE, but nothing repainted the host, so the 8d card outlived the truth it narrated exactly as
    //  the wallet line did. Routed through closeSheet(); guarded, so a settling that owns no sheet never wipes a
    //  half-typed friend code.
    if (openStrand && openStrand.slot === slot) { openStrand = null; if (sheet && sheet.kind === "strand") closeSheet(); }
    if (openUnknown && openUnknown.slot === slot) openUnknown = null;
  }
  //  B2 — the ONLY roads that clear an open record. (a) our escrowMatchId is now a table in the server's own
  //  broadcast — the strongest possible proof the server learned it; (b) the {opened} ack, when exactly one
  //  record is awaiting one (the ack frame carries no escrowMatchId, so the broadcast is the precise signal).
  function reconcilePendingAgainstTables(list) {
    listPending().forEach(function (e) {
      var r = e.rec; if (!r || r.kind !== "open" || r.step !== "server" || !r.escrowMatchId) return;
      var seen = list.some(function (t) { return t && String(t.escrowMatchId) === String(r.escrowMatchId); });
      if (seen) { if (e.legacy) { clearLegacyPending(); } else { settleStrand(e.slot); } }
    });
  }
  function consumeOpenAck() {
    var waiting = listPending().filter(function (e) { return e.rec && e.rec.kind === "open" && e.rec.step === "server"; });
    if (waiting.length === 1) { if (waiting[0].legacy) clearLegacyPending(); else settleStrand(waiting[0].slot); }
    //  S-HALL-CEREMONY-1 (R1) — the header's one-shot re-read at lock-confirm can race chain propagation on a
    //  public RPC and was never corrected. The {opened} ack is a LATER, SETTLED moment we already handle: read
    //  again here. Cheap, idempotent, and it makes the number right by the time the sheet is gone.
    readLiquidAgain();
  }

  function ceremonyMsg(e) {
    if (e && e.crossAccount) return e.message;   // S-HALL-ACCOUNT-1 — the §11 line passes through verbatim
    var m = (e && (e.shortMessage || e.reason || e.message)) || "the cast failed";
    if (/user rejected|denied/i.test(m)) return "you declined the wallet prompt";
    if (/insufficient/i.test(m)) return "insufficient DYC for this stake";
    return String(m).slice(0, 140);
  }

  // ── RESUME (on load, after the gate passes) — complete or abandon a pending ceremony cleanly. ──
  //  S-HALL-L3-FIX-1 (B3/B4) — resume walks ALL records for this wallet, one pass, sequentially. It is driven by
  //  the AUTHED signal (see startFeed/onUpdate), never by a fixed timer firing into a socket the server has not
  //  yet accepted. Every failure leaves the record standing and says so.
  function resumePendingTx() {
    var recs = listPending(); if (!recs.length || !client) return;
    resumeNote = null;
    signerRoad().then(function (r) {
      return recs.reduce(function (chain, e) {
        return chain.then(function () {
          if (e.rec.kind === "open") return resumeOpenRecord(r, e);
          if (e.rec.kind === "join") return resumeJoin(r, e.rec, e);
          if (e.rec.kind === "settle") return resumeSettle(r, e);
          return null;
        }).catch(function (err) { resumeNote = "a pending table could not be finished: " + ceremonyMsg(err) + " — your stake is safe."; });
      }, Promise.resolve());
    }).then(function () { if (resumeNote) renderCurrent(); })
      .catch(function (err) {
        // B3 — never a bare silence. The record is LEFT standing and the road is named.
        resumeNote = "could not reach your wallet to finish a pending table — your stake is safe; reload to retry.";
        renderCurrent();
      });
  }
  // tri-state escrow read: an UNREADABLE chain must never be mistaken for "not ours" (that would clear a record
  // that is protecting a real locked stake — the exact class of bug this task closes).
  function readOpenState(r, id) {
    return escContract(r).matches(BigInt(id))
      .then(function (mm) { return { ok: true, state: Number(mm.state), playerA: String(mm.playerA).toLowerCase() }; })
      .catch(function () { return { ok: false }; });
  }
  function resumeOpenRecord(r, e) {
    var rec = e.rec, slot = e.slot;
    if (e.legacy) {                                   // adopt a pre-FIX-1 single-slot record onto the new road
      slot = rec.openTxHash ? String(rec.openTxHash) : "draft";
      writePending(slot, rec); clearLegacyPending();
    }
    var ctx = { tier: rec.tier, faction: rec.faction, stakeWei: rec.stake, friendAddr: rec.friendAddr };
    if (rec.step === "server" && rec.escrowMatchId) {
      return readOpenState(r, rec.escrowMatchId).then(function (st) {
        if (!st.ok) { resumeNote = "could not read the escrow just now — a pending table is still waiting; your stake is safe."; return; }
        if (st.state !== 1 || st.playerA !== me) { settleStrand(slot); return; }   // no longer an OPEN escrow of ours
        if (serverOpen(ctx, rec.escrowMatchId, slot)) { sheet = null; }
        render();
      });
    }
    if (rec.openTxHash) {
      return r.provider.getTransactionReceipt(rec.openTxHash).then(function (rc) {
        if (!rc) { openUnknown = { slot: slot, txHash: rec.openTxHash, stake: rec.stake }; sheet = { kind: "strand" }; renderSheet(); return; }
        var id = parseMatchId(r, rc);
        // S-HALL-L3-FIX-2 (B1) — THE SAME GATE ITS SIBLING HAS. Without it this branch re-sent the open for an
        // escrow that had already been joined and settled, minting a table nobody could take: the ghost proven in
        // S-HALL-GHOST-TABLE-1. An escrow that is no longer OPEN-and-ours means the record is SPENT, not pending.
        return readOpenState(r, id).then(function (st) {
          if (!st.ok) { resumeNote = "could not read the escrow just now — a pending table is still waiting; your stake is safe."; return; }
          if (st.state !== 1 || st.playerA !== me) { settleStrand(slot); return; }   // the escrow moved on without us
          if (serverOpen(ctx, id, slot)) { sheet = null; }
          render();
        });
      });
    }
    // A draft with no tx hash: the lock was never cast, so NO stake is at risk. We deliberately do NOT auto-cast
    // money on page load (the old road re-drove ceremonyOpen here, which would now mean one wallet prompt per
    // stale record). The draft is simply left; it is overwritten by the next ceremony.
    return Promise.resolve();
  }
  function resumeJoin(r, rec, e) {
    var jslot = (e && e.slot) || ("join-" + String(rec.escrowMatchId));
    if (rec.step === "server" || rec.step === "joinMatch") {
      // joinMatch may have landed — check the escrow: MATCHED with me as playerB → just (re)send the server join
      return escContract(r).matches(BigInt(rec.escrowMatchId)).then(function (mm) {
        if (Number(mm.state) === 2 && String(mm.playerB).toLowerCase() === me) {   // MATCHED=2
          if (client && client.join(rec.tableId, rec.faction)) { clearPendingSlot(jslot); sheet = null; render(); }
          else { resumeNote = "your stake is locked at that table — reload to finish taking the seat."; }
          return;
        }
        resumeNote = "a seat you started is no longer joinable — your stake is refundable on chain.";
      }).catch(function () { resumeNote = "could not read the escrow for a seat you started; your stake is safe."; });
    }
    return Promise.resolve();   // pre-lock join draft: nothing cast, nothing at risk, no surprise wallet prompt
  }
  function verifyOpenOwned(r, id) {
    // MatchState: NONE=0, OPEN=1, MATCHED=2, SETTLED=3, ABORTED=4
    return escContract(r).matches(BigInt(id)).then(function (mm) { return Number(mm.state) === 1 && String(mm.playerA).toLowerCase() === me; }).catch(function () { return false; });
  }

  // ── friend code lookup — S-HALL-CODE-LOOKUP-1: RETIRED. The broadcast scan that used to live here is gone; the
  //    code road now asks the SERVER ({lookup} → {lookup-result}, matchclient.lookup). That is what lets the server
  //    withhold friend tables from the {tables} frame at all (W3-LOBBY-DOORS-1 FRIEND_TABLES_WITHHELD). No caller
  //    may scan `tables` for a code. ──

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
      out += '<button class="hall-faction-sigil' + (selected === f ? " on" : "") + '" data-faction="' + f + '" aria-pressed="' + (selected === f ? "true" : "false") + '">' + sigilImg(FACTION_SIGIL[f], "hall-sigil") + '<span>' + f.charAt(0).toUpperCase() + f.slice(1) + '</span></button>';
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
        medallionImg(t.medallion, "hall-medallion " + t.cls) + '<span class="hall-tier-label">' + t.label + '</span>' +
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
    //  S-HALL-FREE-1 (R3) — THE FREE SEAT. This sheet was written for a staked table only: `BigInt(t.stake)` THREW
    //  on a free table's null stake, inside a click handler, so the browser swallowed it and TAKE THIS SEAT simply
    //  read DEAD. A free seat also owes no money copy — no pot, no commitment, no both-stakes rule. It reuses
    //  FREE_LINE, which section 11 already rules (8c), so no new words ship.
    var free = !t.staked;
    var pot = free ? 0n : BigInt(t.stake) * 2n, fee = pot * 5n / 100n, win = pot - fee;
    var sigil = t.faction && FACTION_SIGIL[t.faction] ? sigilImg(FACTION_SIGIL[t.faction], "hall-sigil") : "";
    var commit = free ? "" : '<p class="hall-commit-text state-line">' + COMMITMENT(t.stake) + '</p>';
    if (!free && crossesLimit(t.stake)) commit += '<p class="hall-limit-block state-line">' + LIMIT_BLOCK(headroomWei()) + '</p>';
    var canAct = free ? !!selectedFaction : (selectedFaction && affordable(t.stake) && !crossesLimit(t.stake));
    var act = ceremony ? ceremonyStrip(ceremony) : '<button class="hall-act hall-act-join" data-join-do="1"' + (canAct ? "" : " disabled") + '>TAKE THIS SEAT</button>';
    return sheetOverlay(
      '<h2 class="hall-sheet-title">TAKE THIS SEAT</h2>' +
      '<div class="hall-seat-opp">' + sigil + '<span class="hall-plaque-addr">' + shortAddr(t.opener) + '</span>' + (td ? medallionImg(td.medallion, "hall-medallion " + td.cls) : "") + '<span class="hall-plaque-stake">' + dycOf(t.stake) + ' DYC</span></div>' +
      (free ? '<div class="hall-pot-line state-line">' + FREE_LINE + '</div>'
            : '<div class="hall-pot-line state-line">Pot ' + dycOf(pot) + ' DYC <span class="hall-fee-line">- ' + dycOf(fee) + ' fee -> winner takes ' + dycOf(win) + ' DYC</span></div>') +
      '<div class="hall-sheet-faction"><div class="hall-sheet-sub">Your faction</div>' + factionPicker(selectedFaction) + '</div>' +
      commit + (free ? "" : '<p class="hall-seat-rule"><b>' + BOTH_STAKES + '</b></p>') +
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
    var sigil = t.faction && FACTION_SIGIL[t.faction] ? sigilImg(FACTION_SIGIL[t.faction], "hall-sigil") : "";
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

  // ── S-HALL-CEREMONY-1 — THE CEREMONY FINISHES ITS OWN STORY ──────────────────────────────────────────────
  //  The sheet lives in its OWN host (#hall-sheet-host); render() deliberately does not touch it (see the note at
  //  the foot of render(), and raiseStrand's, which already said this law out loud for the strand road). So a bare
  //  `sheet = null; render()` cleared the STATE and left the OVERLAY standing, frozen on whatever renderSheet()
  //  last drew — beat 2's "confirm in your wallet…". Measured on a plain, fully successful staked open: no stall
  //  was needed. Every ceremony terminus now goes through these, so the state and the face move together.
  function closeSheet() { sheet = null; renderSheet(); }
  function showSheet(next) { sheet = next; renderSheet(); }
  //  THE MONEY MOMENT: the LOCK CONFIRMING ends the wallet beats and re-reads the header, whatever the delivery
  //  road then does. Nothing downstream of it may decide whether the header is honest.
  function lockConfirmed() { ceremony = null; readLiquidAgain(); }

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
    else if (sheet.kind === "strand") html = strandSheetHTML();
    var host = $("hall-sheet-host") || (function () { var h = el("div"); h.id = "hall-sheet-host"; document.body.appendChild(h); return h; })();
    host.innerHTML = html;
    wireSheet();
  }

  //  S-HALL-L3-FIX-1 (B4) — THE RULED AFFORDANCE (LOBBY_DESIGN.md 8d, amended 2026-09-08). Shown when a lock is
  //  CONFIRMED on chain but the table has not opened — the state that stranded 20 DYC on 2026-09-08. Two acts:
  //  FINISH OPENING (re-derive the escrow id and redo the server handoff) and CANCEL AND REFUND (the existing
  //  cancelMatch road, now ghost-safe). The copy line is verbatim law; only the stake slot is filled.
  function strandSheetHTML() {
    if (openStrand) {
      var line = STRAND_LOCKED(openStrand.stake);
      return sheetOverlay(
        '<h2 class="hall-sheet-title">THE TABLE HAS NOT OPENED</h2>' +
        '<p class="hall-strand-line state-line">' + line + '</p>' +
        (ceremony ? ceremonyStrip(ceremony) :
          '<div class="hall-strand-acts">' +
          '<button class="hall-act hall-strand-finish" data-strand-finish="1">FINISH OPENING</button> ' +
          '<button class="hall-act hall-strand-cancel" data-strand-cancel="1">CANCEL AND REFUND</button>' +
          '</div>'), "hall-sheet-strand");
    }
    // the bounded wait elapsed with no receipt yet: we do NOT claim the stake is locked (that would be the 8d
    // line asserting something unproven). Honest, resumable, one manual re-check — never an automatic retry loop.
    return sheetOverlay(
      '<h2 class="hall-sheet-title">STILL WAITING FOR THE NETWORK</h2>' +
      '<p class="state-line">Your lock has not confirmed yet. Nothing is lost — it finishes on its own, or check again.</p>' +
      (ceremony ? ceremonyStrip(ceremony) : '<div class="hall-strand-acts"><button class="hall-act hall-strand-check" data-strand-check="1">CHECK AGAIN</button></div>'),
      "hall-sheet-strand");
  }

  //  FINISH OPENING — re-derive the escrow id from the receipt (or reuse the journalled one) and redo the handoff.
  function strandFinish() {
    var st = openStrand || openUnknown; if (!st) return;
    var rec = readPendingSlot(st.slot) || {};
    ceremony = { kind: "open", step: "resume", ctx: { tier: rec.tier, faction: rec.faction, stakeWei: rec.stake }, error: null }; renderSheet();
    signerRoad().then(function (r) {
      return resumeOpenRecord(r, { slot: st.slot, rec: rec }).then(function () {
        ceremony = null;
        if (!readPendingSlot(st.slot)) { openStrand = null; openUnknown = null; sheet = null; }
        renderCurrent();
      });
    }).catch(function (e) { if (ceremony) { ceremony.step = "error"; ceremony.error = ceremonyMsg(e); } renderSheet(); });
  }
  //  CANCEL AND REFUND — the existing cancelMatch road, addressed by the journalled escrowMatchId.
  function strandCancel() {
    if (!openStrand) return;
    ceremonyCancel({ id: null, escrowMatchId: openStrand.escrowMatchId, slot: openStrand.slot });
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
  //  S-HALL-SLIP-LIST-1 (R1) — A MAP, keyed by escrowMatchId. It used to be ONE object for the whole page, which was
  //  honest while only one slip could ever render. With a LIST of pots that single object would drive every row: one
  //  row casting would disable them all, one row's error would print under them all, and — the serious one — one
  //  row's success would print "settled - N DYC in your wallet" on pots that were never cast. A money line claiming
  //  a pot is in the wallet when it is not. Per-row truth, or the list is not honest.
  var settleState = {};      // escrowMatchId -> { casting } | { settled, terminalState } | { casting:false, error }
  function settleStateFor(eid) { return (eid == null) ? null : (settleState[String(eid)] || null); }
  var engineNote = null;     // S-HALL-FREE-1 — set when the engine could not be loaded or failed its pin
  var settlementView = null; // a pending slip surfaced in the lobby (resume-after-reload)
  var castThisSession = {};  // S-HALL-SLIP-LIST-1 — escrowMatchId -> the slip record cast in THIS session. Storage
                             //   drops a settled slip at once, but its "settled - N DYC in your wallet" confirmation
                             //   must stay on screen, exactly as a lone slip's does today.
  var seatedElsewhere = null;// S-HALL-ELSEWHERE-1 — { matchId, seat } from the view. REFRESHED on every frame,
                             //   never remembered: the room-end broadcast drops the field and so must the Hall.
  var dealtMatches = {};      // matchId -> true once the "dealing…" beat has played
  var dismissedMatch = {};    // matchId -> true once the player leaves the over screen back to the Hall
  var signedInAs = null;      // the recovered connected-wallet identity (B1; shown in the header)
  var pendingPlay = null;     // { i, name, options } — the target picker
  var mullPick = {};          // mulligan toss selections

  // ── the RULED settlement copy (docs/LOBBY_DESIGN.md section 11 → 8c, VERBATIM; only the [slots] filled) ──
  var ABORT_LINE = "unclaimed pots refund both players automatically after 24 hours.";
  //  S-HALL-ELSEWHERE-1 — §11 amendment 2026-09-10a. Its reader holds a live stake in a battle they cannot see;
  //  what they are told here is what they believe about that stake. Verbatim from LOBBY_DESIGN.md.
  var SEATED_ELSEWHERE_LINE = "Your warrior is already seated - the battle is live in another window.";
  //  S-HALL-SLIP-LIST-1 — §11 amendment 2026-09-10b, by the 2026-09-10a criterion: a player owed a pot, told where
  //  to collect it. [N] is the live count. The header appears ONLY at two or more — at one, today's lone-slip
  //  markup stands byte-for-byte and no singular form is ever needed.
  function SLIPS_HEADER(n) { return "You have " + n + " unsettled pots waiting - each one can be collected here."; }
  function WON_LINE(total, fee) { return "You won. Collect " + total + " DYC - " + fee + " to the treasury."; }
  function WON_SETTLED(total) { return "settled - " + total + " DYC in your wallet"; }
  var DRAW_LINE = "A draw - both stakes return in full.";
  function FORFEIT_LINE(total) { return "Your opponent left the table. The pot is yours - collect " + total + " DYC."; }
  var FREE_LINE = "no stakes at this table";
  //  S-HALL-FREE-1 — the refusal when the engine cannot be vouched for. Ordinary copy, not §11: it makes no
  //  money claim (a free table has no stake), so it does not join the ruled block.
  var ENGINE_REFUSED = "this table needs the game engine, which could not be loaded - reload and try again";

  // ── THE BROWSER SETTLE CAST (the winner casts from their OWN wallet; persistPending; resolves on the terminal read) ──
  //  S-HALL-SLIP-LIST-1 (R2) — the pending slot is KEYED per escrow id. One shared "settle" slot was honest while
  //  only one cast could be in flight; with a list, two casts would overwrite each other's RESUME RECORD — and that
  //  record is the road back to a pot interrupted between cast and confirmation. A strand waiting to happen.
  function settleSlot(eid) { return "settle-" + String(eid); }
  function ceremonySettle(slip) {
    if (!slip || slip.escrowMatchId == null) return;
    var eid = String(slip.escrowMatchId), slot = settleSlot(eid);
    settleState[eid] = { casting: true };
    // keep the record: storage drops it the moment it settles, but its confirmation belongs on screen this session.
    var held = lobbySlips().filter(function (x) { return String(x.escrowMatchId) === eid; })[0];
    if (held) castThisSession[eid] = held;
    renderCurrent();
    writePending(slot, { kind: "settle", escrowMatchId: eid, result: slip.result, signature: slip.signature, at: Date.now() });
    return signerRoad().then(function (r) {
      var esc = escContract(r);
      return feeOverrides().then(function (fee) {
        return esc.settle.staticCall(BigInt(slip.escrowMatchId), slip.result, slip.signature).then(function () {
          return esc.settle(BigInt(slip.escrowMatchId), slip.result, slip.signature, fee);
        });
      }).then(function (tx) { mergePendingSlot(slot, { settleTxHash: tx.hash }); return tx.wait(); })
        .then(function () { return esc.matches(BigInt(slip.escrowMatchId)); })
        .then(function (mm) { settleState[eid] = { settled: true, terminalState: Number(mm.state) }; clearPendingSlot(slot); markSlipSettled(eid); readLiquidAgain(); renderCurrent(); });
    }).catch(function (e) { settleState[eid] = { casting: false, error: ceremonyMsg(e) }; renderCurrent(); });
  }
  // resume a settle interrupted between cast and confirmation (P4): if already SETTLED on chain, resolve; else re-offer.
  //  S-HALL-SLIP-LIST-1 (R2) — takes the ENTRY, so it clears the slot the record was actually found in. With keyed
  //  slots a hardcoded "settle" would clear the wrong pot's record (or none at all).
  function resumeSettle(r, e) {
    var rec = e.rec, slot = e.slot, eid = String(rec.escrowMatchId);
    return escContract(r).matches(BigInt(rec.escrowMatchId)).then(function (mm) {
      if (Number(mm.state) === 3) { settleState[eid] = { settled: true, terminalState: 3 }; clearPendingSlot(slot); markSlipSettled(eid); renderCurrent(); return; } // SETTLED=3
      // not settled — leave the slip's Cast button live (the list surfaced it); drop the stale pending
      clearPendingSlot(slot);
    }).catch(function () { clearPendingSlot(slot); });
  }

  // ── THE MATCH SCREEN (ported from wire.html; neutral hall-* hooks) ──
  function factionSigilSmall(f) { return f && FACTION_SIGIL[f] ? sigilImg(FACTION_SIGIL[f], "hall-sigil") : ""; }
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

  // S-HALL-SLIP-SCOPE-1 — THE RENDER-SITE LOCK. Inside a live match only a slip whose matchId is THAT match may
  //   render. matchclient already scopes what it files into `settlement`; this reads the slip's own word again at
  //   the point the strip is drawn, so the law is legible where the lie used to be printed. A slip with no matchId
  //   is an old record from before the client kept the word — ruled NOT this match, shown at the lobby home instead.
  function slipForMatch(v) {
    var s = v && v.settlement; if (!s) return null;
    if (s.matchId == null || v.matchId == null) return null;
    return String(s.matchId) === String(v.matchId) ? s : null;
  }

  // S-HALL-SLIP-LIST-1 — the lobby home's slips: the stored unsettled list unioned with settlementView, deduped by
  //   escrowMatchId, newest first. A slip with no escrowMatchId (an error slip) can never dedupe and always rides.
  function lobbySlips() {
    var out = [];
    try { if (client && client.unsettledSlips) out = client.unsettledSlips().slice(); } catch (e) { out = []; }
    var add = function (rec) {
      if (!rec) return;
      var eid = rec.escrowMatchId;
      if (eid != null && out.some(function (x) { return String(x.escrowMatchId) === String(eid); })) return;
      out.push(rec);
    };
    Object.keys(castThisSession).forEach(function (k) { add(castThisSession[k]); });
    add(settlementView);      // an ERROR slip carries no escrowMatchId and can never dedupe — it always rides
    return out.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }
  // what is still OWED: a row settled in this session is a confirmation, not a pot waiting. The header counts these.
  function owedCount(list) {
    return list.filter(function (x) { var ss = settleStateFor(x.escrowMatchId); return !(ss && ss.settled); }).length;
  }

  function settlementStrip(s) {
    if (!s) return "";
    if (s.error) return '<div class="hall-settle warn"><div class="hall-settle-line">' + s.error + '</div><div class="hall-settle-abort state-line">' + ABORT_LINE + '</div></div>';
    if (s.stake == null) { // FREE (no stake) — result + the one ruled line
      return '<div class="hall-settle"><div class="hall-settle-line state-line">' + FREE_LINE + '</div></div>';
    }
    var stake = BigInt(s.stake), pot = stake * 2n, rake = pot * 5n / 100n, total = pot - rake;
    var ss = settleStateFor(s.escrowMatchId);   // S-HALL-SLIP-LIST-1 — THIS row's state, never the page's
    var settled = ss && ss.settled, casting = ss && ss.casting, castErr = ss && ss.error;
    var line, showCast = false;
    if (settled) {
      line = (s.result === 2) ? DRAW_LINE : (s.youWon ? WON_SETTLED(dycOf(total)) : "This match is settled.");
    } else if (s.result === 2) { line = DRAW_LINE; showCast = true; }
    else if (s.youWon) { line = s.forfeit ? FORFEIT_LINE(dycOf(total)) : WON_LINE(dycOf(total), dycOf(rake)); showCast = true; }
    else { line = "You lost this match - the winner collects the pot."; }
    var cast = showCast ? '<div class="hall-settle-act"><button class="hall-act hall-settle-cast" data-settle="' + String(s.escrowMatchId) + '"' + (casting ? " disabled" : "") + '>' + (casting ? "casting…" : "CAST SETTLE") + '</button></div>' : "";
    var err = castErr ? '<div class="hall-settle-err state-line">' + castErr + '</div>' : "";
    return '<div class="hall-settle"><div class="hall-settle-line">' + line + '</div>' +
      '<div class="hall-settle-abort state-line">' + ABORT_LINE + '</div>' + cast + err + '</div>';
  }

  function outcomeLine(v) {
    return v.outcome.kind === "result"
      ? (v.outcome.winner == null ? "the match is a draw" : (v.outcome.winner === v.seat ? "you win the match" : "you lose the match")) + " - rounds " + v.outcome.roundWins.join("-")
      : "match abandoned - " + v.outcome.reason;
  }
  //  B2 — the matched moment: one beat before the battle. S-HALL-STRIPS-1 (C3): a FREE table never says stakes are
  //  locked — it shows "dealing…" alone, cut from the ruled line (no new words); the staked line is unchanged.
  function dealingHTML(v) {
    return '<div class="hall-dealing" role="status">' +
      '<div class="hall-dealing-opp">' + factionSigilSmall(v.oppFaction) + '<span class="hall-plaque-addr">' + shortAddr(v.opponent || v.oppName) + '</span></div>' +
      '<div class="hall-dealing-line">' + (v.redacted ? "the stakes are locked - dealing…" : "dealing…") + '</div></div>';
  }
  function matchScreenHTML(v) {
    // B2 — the matched moment: one beat before the battle, on first entry to a match.
    if (!dealtMatches[v.matchId]) return dealingHTML(v);
    var h = (wireF && wireF.fallback && wireF.matchId === String(v.matchId) ? '<div class="hall-mstatus warn">' + FRAME_FALLBACK_LINE + '</div>' : "") +
      statusStrip(v) + settlementStrip(slipForMatch(v));
    // header
    h += '<div class="hall-mhead"><div class="hall-mhead-row">you (' + (v.myFaction || "?") + ') vs ' + factionSigilSmall(v.oppFaction) + shortAddr(v.opponent || v.oppName) +
      '<span class="hall-mpill">round ' + v.round + '</span><span class="hall-mpill">wins ' + v.roundWins[0] + '-' + v.roundWins[1] + ' (to ' + v.winTarget + ')</span></div>';
    if (v.outcome) {
      h += '<div class="hall-mresult">' + outcomeLine(v) + '</div>';
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
    if (isFrameMatch(matchView)) {   // S-HALL-WIRE-1 — a FREE match plays in the game's own screen, beneath
      root.innerHTML = frameMatchHTML(matchView);
      var lv = document.querySelector("[data-leave]"); if (lv) lv.onclick = function () { leaveMatch(matchView); };
      var fst = document.querySelector("[data-settle]");   // S-HALL-STAKED-1 (K4) — the cast, from the strip above the frame
      if (fst && !fst.disabled) fst.onclick = function () { var sl = slipForMatch(matchView); if (sl && sl.slip) ceremonySettle(sl.slip); };
      paintClocks();                 // S-HALL-STRIPS-1 — the strip is rewritten on every update; paint it now, not a tick later
      syncFrameHost(); return;
    }
    root.innerHTML = matchScreenHTML(matchView);
    wireMatchScreen(matchView);
    syncFrameHost();
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
    var st = document.querySelector("[data-settle]"); if (st && !st.disabled) st.onclick = function () { var s = slipForMatch(v); if (s && s.slip) ceremonySettle(s.slip); }; // S-HALL-SLIP-SCOPE-1 — the match screen casts only its own match's slip
    var lv = document.querySelector("[data-leave]"); if (lv) lv.onclick = function () { leaveMatch(v); }; // S-HALL-SLIP-SCOPE-1 — only this match's own slip promotes on leave
  }
  //  THE LEAVE LAW — one road out of an ended match, whichever door the player used (the text battle's button, the
  //  free strip's, or the battle frame's RETURN TO THE HALL). S-HALL-SLIP-SCOPE-1: only this match's own slip promotes.
  function leaveMatch(v) {
    dismissedMatch[v.matchId] = true; settlementView = slipForMatch(v) || v.pendingSlip || settlementView; matchView = null;
    unmountFrame();
    if (maybeReKey()) return; render();
  }

  // ── S-HALL-WIRE-1 — THE BATTLE FRAME (BW1 site half; docs/BATTLE_WIRE_DESIGN_v1.md §2 as committed, 11a/11b/11c) ──
  //  A FREE match plays in the GAME'S OWN SCREEN: a same-origin iframe of ../game/index.html?wire=1 beneath the Hall's
  //  own lines. The Hall keeps the socket, the session and the mirror (R6: matchclient's mirror stays — the matchView
  //  law and the engine pin are untouched); the frame is a renderer that receives the match and sends acts.
  //  THE WALL: the frame never receives a key, an address, a stake or an escrow id. Every message to it is BUILT from
  //  a fixed field list per type and checked once more before it leaves; a message that fails is refused, not sent.
  //  The frame lives in its own host BESIDE #hall-root, because the match screen rewrites #hall-root on every update
  //  and an iframe there would be torn down and reloaded on every move.
  var WIRE_READY_MS = Number(lsGet("dyhall::wireReadyMs")) || 15000;   // R4 — no wire:ready in time: that match falls back to the Hall's text table (the override is proof-only, like dyhall::devAccess)
  var FRAME_FALLBACK_LINE = "The battle screen did not answer - this match plays on in the Hall's table.";
  var WIRE_SHAPES = {                 // §2, parent -> frame, exactly
    "wire:start": ["matchId", "seat", "seed", "p0Faction", "p1Faction"],          // FREE (11b)
    "wire:move": ["matchId", "seq", "move"],
    "wire:view": ["matchId", "seq", "view"],                                      // STAKED (11d) — events ride INSIDE view.events
    "wire:reject": ["matchId", "reason"],
    "wire:result": ["matchId", "winner", "roundWins", "forfeit"],
  };
  var WIRE_START_STAKED = ["matchId", "seat", "view", "p0Faction", "p1Faction"];  // STAKED (11d) — a view, and never a seed
  //  S-HALL-STAKED-1 (R3) — THE WALL WIDENS. The 40-hex form was blind to the server's own seat names, which are wallet
  //  SHORT forms (shortName: 0x7099…79C8). Four hex after 0x catches both, and matches nothing the frame legitimately
  //  carries: a matchId ("t2-15365fdf"), an escrow id ("12"), a card name — all measured in the suite.
  var WALL_RE = /0x[0-9a-fA-F]{4}|"(?:address|opponent|stake|escrow[A-Za-z]*|key|privateKey|signature|slip|p0|p1)"\s*:/;
  var wireF = null;                   // { matchId, road, deal, el, ready, started, moves{seq:move}, sent, views[], viewSeq, actPending, result, resultSent, fallback, readyTimer }
  //  S-HALL-STAKED-1 (R2) — the Hall strips the seat names (wallet short forms) from every view before it leaves. The
  //  frame refuses a view that still carries either key (BW3b R2) — the second lock, in the other repo.
  function hallView(v) { var c = {}, k; for (k in v) if (k !== "myName" && k !== "oppName") c[k] = v[k]; return c; }
  var wireRefused = [];               // every refusal, loud (the suites count them)
  function refuseWire(why, data) { wireRefused.push(why); try { console.warn("[hall wire] refused:", why, data == null ? "" : data); } catch (e) {} }
  function newWireF(mid, road, deal) {
    return { matchId: mid, road: road, deal: deal, el: null, ready: false, started: false, moves: {}, sent: 0, views: [], viewSeq: 0,
             actPending: false, result: null, resultSent: false, fallback: false, readyTimer: null };
  }
  function isFrameMatch(v) {          // S-HALL-STAKED-1 (R4) — road-aware: the staked road's view IS redacted
    if (!(v && wireF && !wireF.fallback && wireF.matchId === String(v.matchId))) return false;
    return wireF.road === "staked" ? !!v.redacted : !v.redacted;
  }
  function frameMatchHTML(v) {
    // R5 — the matched moment ends when BOTH its 2s and the frame's wire:ready have happened (it used to end at 2s
    //   regardless, and a slow frame then showed its own "waiting for the table…" plate in the battle's place). No
    //   wire:ready at all: the beat holds until WIRE-1's readiness fallback hands the match to the Hall's table.
    if (!dealtMatches[v.matchId] || !wireF.ready) return dealingHTML(v);
    // R4 — THE STRIP SLOT: the same statusStrip the text battle draws (one emitter — reconnecting, the vanish line,
    //   the thinking clock whose label says whose move it is), in a fixed one-line slot so a line coming or going
    //   never re-lays out the frame mid-turn. The frame road paints the clock by §8b (see paintClocks).
    if (!v.outcome) return '<div class="hall-frame-strip">' + statusStrip(v) + '</div>';
    // S-HALL-STAKED-1 (K4) — THE STAKED RESULT: the dressed settlement strip, re-homed from the text battle exactly as
    //   it is drawn there (the same outcome line, the same settlementStrip — every ruled variant, the cast button,
    //   §11 byte-identical). The frame's own result face sits beneath (N3); the Hall owns the cast and the exit.
    if (wireF.road === "staked") {
      return '<div class="hall-frame-settle"><div class="hall-mresult">' + outcomeLine(v) + '</div>' +
        settlementStrip(slipForMatch(v)) +
        '<div class="hall-controls-act"><button class="hall-act hall-mleave" data-leave="1">back to the Hall</button></div></div>';
    }
    // R3 — THE FREE RESULT: the result line + FREE_LINE (§11 8c), two existing strings in one strip; the frame's own
    //   face sits beneath (N3); the Hall owns the exit.
    return '<div class="hall-settle hall-free-result"><div class="hall-settle-line"><span class="hall-mresult">' + outcomeLine(v) +
      '</span> <span class="state-line">' + FREE_LINE + '</span></div>' +
      '<div class="hall-controls-act"><button class="hall-act hall-mleave" data-leave="1">back to the Hall</button></div></div>';
  }
  function frameHost() {
    var host = $("hall-frame-host");
    if (!host) {
      var root = $("hall-root"); if (!root || !root.parentNode) return null;
      host = document.createElement("div"); host.id = "hall-frame-host"; host.className = "hall-frame-host"; host.hidden = true;
      root.parentNode.insertBefore(host, root.nextSibling);
    }
    return host;
  }
  function readStamp() {               // R4 — game/STAMP, written by the sync beside the copy; never SNAPSHOT.md
    return fetchText("../game/STAMP").then(function (t) { var s = String(t).trim(); return /^[0-9a-f]{7,40}$/.test(s) ? s : null; }, function () { return null; });
  }
  function mountFrame() {
    var host = frameHost(); if (!host || !wireF || wireF.el) return;
    // seed-then-load, the demo's road: the gate preamble reads dyw_pass at load. Never dyw_demo — this is a battle.
    try { sessionStorage.setItem("dyw_pass", "1"); } catch (e) {}
    var f = document.createElement("iframe");
    f.className = "hall-frame"; f.title = "The battle"; f.setAttribute("allow", "autoplay");
    wireF.el = f; host.appendChild(f);
    var mine = wireF;
    readStamp().then(function (sha) { if (wireF === mine && mine.el === f) f.src = "../game/index.html?" + (sha ? "v=" + sha + "&" : "") + "wire=1"; });
    wireF.readyTimer = setTimeout(function () { if (wireF === mine && !mine.ready) frameFallback(); }, WIRE_READY_MS);
  }
  function unmountFrame() {
    if (!wireF) return;
    clearTimeout(wireF.readyTimer);
    if (wireF.el && wireF.el.parentNode) wireF.el.parentNode.removeChild(wireF.el);
    wireF = null;
    var host = $("hall-frame-host"); if (host) host.hidden = true;
  }
  function frameFallback() {           // R4 — the thin client plays THIS match; the mirror (R6) is already current
    if (!wireF) return;
    clearTimeout(wireF.readyTimer);
    if (wireF.el && wireF.el.parentNode) wireF.el.parentNode.removeChild(wireF.el);
    wireF.el = null; wireF.fallback = true;
    var host = $("hall-frame-host"); if (host) host.hidden = true;
    renderCurrent();
  }
  function syncFrameHost() {
    var host = $("hall-frame-host");
    if (!(matchView && isFrameMatch(matchView))) {
      //  S-HALL-STAKED-1 — ONLY A DIFFERENT MATCH TAKES THE FRAME DOWN. Two instants have no match on screen while one
      //  is very much alive: the staked deal reaches the host through the relay BEFORE matchclient pushes the view that
      //  makes it the match on screen (measured: the staked frame never mounted at all), and a dropped socket re-auths
      //  through a lobby-shaped frame before the server re-seats it (measured: the frame was torn down and REMOUNTED
      //  mid-match — in a browser that is the game reloading under the player). The frame now outlives both; the exits
      //  are explicit: leaveMatch on the way out, and the relay itself when a new match is dealt.
      if (wireF && matchView && wireF.matchId !== String(matchView.matchId)) unmountFrame();
      if (host) host.hidden = true;
      return;
    }
    if (!wireF.el) mountFrame();
    host = frameHost(); if (!host) return;
    host.hidden = false;
    host.classList.toggle("dealing", !dealtMatches[matchView.matchId] || !wireF.ready);   // loads, unseen, behind the matched moment (R5: until BOTH)
  }
  // every message to the frame: built from the ruled field list, walled, then posted to OUR origin only.
  function toFrame(type, fields, shape) {
    if (!wireF || !wireF.el || !wireF.el.contentWindow) return false;
    var msg = { type: type };
    (shape || WIRE_SHAPES[type]).forEach(function (k) { msg[k] = fields[k]; });
    if (WALL_RE.test(JSON.stringify(msg))) { refuseWire("the wall: a " + type + " would have carried money or identity", type); return false; }
    try { wireF.el.contentWindow.postMessage(msg, location.origin); } catch (e) { return false; }
    return true;
  }
  function startFrame() {
    if (!wireF || !wireF.ready || !wireF.deal) return;
    var d = wireF.deal;
    if (wireF.road === "staked") {     // S-HALL-STAKED-1 (R2) — wire:start needs the FIRST view; until one arrives, nothing is posted
      if (!wireF.views.length) return;
      if (!toFrame("wire:start", { matchId: wireF.matchId, seat: d.seat, view: hallView(wireF.views[0]), p0Faction: d.p0Faction, p1Faction: d.p1Faction }, WIRE_START_STAKED)) return;
      wireF.views.shift(); wireF.started = true; wireF.viewSeq = 0; wireF.resultSent = false;
      flushFrame(); return;
    }
    toFrame("wire:start", { matchId: wireF.matchId, seat: d.seat, seed: d.seed, p0Faction: d.p0Faction, p1Faction: d.p1Faction });
    wireF.started = true; wireF.sent = 0; wireF.resultSent = false;
    flushFrame();
  }
  function flushFrame() {              // the ordered stream: seq 1..N, each exactly once, never ahead of the deal
    if (!wireF || !wireF.ready) return;
    if (wireF.road === "staked") {     // one wire:view per server view, seq numbered HERE, monotonic (11d)
      if (!wireF.started) { startFrame(); return; }   // startFrame flushes what it does not send
      while (wireF.views.length) {
        var vseq = wireF.viewSeq + 1;
        if (!toFrame("wire:view", { matchId: wireF.matchId, seq: vseq, view: hallView(wireF.views[0]) })) break;   // refused (the wall): nothing leaves, nothing is counted
        wireF.views.shift(); wireF.viewSeq = vseq;
      }
    } else {
      if (!wireF.started) return;
      while (wireF.moves[wireF.sent + 1]) {
        var seq = wireF.sent + 1;
        toFrame("wire:move", { matchId: wireF.matchId, seq: seq, move: wireF.moves[seq] });
        wireF.sent = seq;
      }
    }
    if (wireF.result && !wireF.resultSent) {   // N3 — the frame's own result face, on BOTH roads
      toFrame("wire:result", { matchId: wireF.matchId, winner: wireF.result.winner, roundWins: wireF.result.roundWins, forfeit: wireF.result.forfeit });
      wireF.resultSent = true;
    }
  }
  // matchclient's relay (FREE road only): the deal, each applied move, the refusals, a resync, the end.
  function onWireRelay(e) {
    if (!e) return;
    if (e.kind === "match") {
      var mid = String(e.matchId);
      if (wireF && wireF.matchId !== mid) unmountFrame();
      var deal = { seat: e.seat, seed: e.seed, p0Faction: e.p0Faction, p1Faction: e.p1Faction };
      if (!wireF) { wireF = newWireF(mid, "free", deal); return; }
      // the same match dealt again (a reconnect or a re-seat): the frame starts over from the deal; the resync follows
      wireF.road = "free"; wireF.deal = deal; wireF.moves = {}; wireF.sent = 0; wireF.actPending = false; wireF.result = null;
      if (wireF.ready) startFrame();
      return;
    }
    if (e.kind === "match-redacted") {  // S-HALL-STAKED-1 (R1/R2) — the STAKED deal: no seed; the board rides the first view
      var smid = String(e.matchId);
      if (wireF && wireF.matchId !== smid) unmountFrame();
      var sdeal = { seat: e.seat, p0Faction: e.p0Faction, p1Faction: e.p1Faction };
      if (!wireF) { wireF = newWireF(smid, "staked", sdeal); return; }
      //  R2 — A RESYNC / RE-SEAT NEEDS NO SPECIAL CASE. The server re-seats by sending {match-redacted} and then its
      //  current view built with no events (events: [] — W3-VIEW-1 R5). Clearing `started` here makes the next view
      //  re-post wire:start with that resync view, which is exactly what 11d asks for; the queue is dropped so a stale
      //  view can never ride in front of it.
      wireF.road = "staked"; wireF.deal = sdeal; wireF.started = false; wireF.views = []; wireF.viewSeq = 0;
      wireF.actPending = false; wireF.result = null; wireF.resultSent = false;
      return;
    }
    if (!wireF || String(e.matchId) !== wireF.matchId) return;
    if (e.kind === "view") {           // S-HALL-STAKED-1 — one server view in, one wire:view out (the first becomes wire:start)
      if (!e.view) return;
      if (e.view.lastMove && e.view.lastMove.seat === wireF.deal.seat) wireF.actPending = false;   // our act (or the clock's, for us) landed
      wireF.views.push(e.view); flushFrame(); return;
    }
    if (e.kind === "apply") {
      wireF.moves[e.seq] = e.move;
      if (e.move && e.move.seat === wireF.deal.seat) wireF.actPending = false;   // our act (or the clock's, for us) landed
      flushFrame(); return;
    }
    if (e.kind === "resync") {
      if (wireF.sent > 0 && wireF.ready) startFrame();   // never replay on top of moves already shown
      wireF.moves = {}; (e.moves || []).forEach(function (mv, i) { wireF.moves[i + 1] = mv; });
      flushFrame(); return;
    }
    if (e.kind === "reject") {         // §2 (11c): only for the frame's OWN refused act
      if (!wireF.actPending) return;
      wireF.actPending = false;
      toFrame("wire:reject", { matchId: wireF.matchId, reason: e.reason });
      return;
    }
    if (e.kind === "result") { wireF.result = { winner: e.winner, roundWins: e.roundWins, forfeit: !!e.forfeit }; flushFrame(); return; }
    if (e.kind === "abandoned") {      // R2 — FREE abandonment: no winner on the server's record; the frame says so
      wireF.result = { winner: null, roundWins: e.roundWins || [0, 0], forfeit: true }; flushFrame(); return;
    }
  }
  // the frame's words: origin AND sender checked on every one; the matchId on every one after the ready.
  window.addEventListener("message", function (ev) {
    var m = ev.data;
    if (!m || typeof m.type !== "string" || m.type.indexOf("wire:") !== 0) return;   // not the bridge's word
    if (!wireF || !wireF.el || ev.source !== wireF.el.contentWindow) return refuseWire("wrong sender", m.type);
    if (ev.origin !== location.origin) return refuseWire("wrong origin", ev.origin);
    if (m.type === "wire:ready") { wireF.ready = true; clearTimeout(wireF.readyTimer); startFrame(); if (matchView && dealtMatches[matchView.matchId]) renderCurrent(); return; }   // R5 — the ready may be the second of the two
    if (String(m.matchId) !== wireF.matchId) return refuseWire("foreign matchId", m.matchId);
    if (m.type === "wire:act") {
      if (!m.action || typeof m.action.type !== "string") return refuseWire("malformed act", m.action);
      if (matchView && matchView.outcome) return refuseWire("the match is over", m.action.type);
      if (!client || !client.act) return refuseWire("no session", m.action.type);
      wireF.actPending = true;
      if (!client.act(m.action)) { wireF.actPending = false; toFrame("wire:reject", { matchId: wireF.matchId, reason: "not delivered" }); }
      return;
    }
    if (m.type === "wire:leave") {     // R8 — only after an outcome: a frame message can never forfeit
      if (!(matchView && matchView.outcome && String(matchView.matchId) === wireF.matchId)) return refuseWire("mid-match leave refused - a frame message can never forfeit", m.matchId);
      leaveMatch(matchView); return;
    }
    refuseWire("unknown word", m.type);
  });

  // the live clock / vanish countdown tick (renders the numbers from the SERVER deadline; the client never decides).
  var l3TickStarted = false;
  function startL3Tick() {
    if (l3TickStarted) return; l3TickStarted = true;
    setInterval(paintClocks, 250);
  }
  //  S-HALL-STRIPS-1 (C1) — the frame road paints the thinking clock by LOBBY_DESIGN §8b as written: the countdown
  //  is SHOWN from 30s remaining and turns AMBER at the server's warn (both on the .hall-mclock line itself). The
  //  S-HALL-STAKED-1 (K5) — and now the TEXT battle too. STRIPS-1 left it deviating from §8b in exactly two ways (the
  //  countdown showed for the whole turn; `warn` landed on the <b>, so it turned crimson, never amber) because the line
  //  lookup was scoped to .hall-frame-strip. The scope is dropped: one paint, one law, both roads. P4 is re-ruled to
  //  "the text battle's strip differs from HEAD in exactly these two ways".
  var CLOCK_SHOW_MS = Number(lsGet("dyhall::clockShowMs")) || 30000;   // §8b's 30s (the override is proof-only, like dyhall::devAccess)
  function paintClocks() {
    if (!lastView) return;
    var cc = $("hall-clockcd");
    if (cc && lastView.clock) {
      var rem = Math.max(0, lastView.clock.deadline - Date.now()), warn = rem <= (lastView.clock.thinkMs - lastView.clock.warnMs);
      cc.textContent = Math.ceil(rem / 1000);
      var line = cc.closest(".hall-mclock");
      if (line) { line.classList.toggle("show", rem <= CLOCK_SHOW_MS); line.classList.toggle("warn", warn); }
      else cc.classList.toggle("warn", warn);
    }
    var vc = $("hall-vanishcd");
    if (vc && lastView.vanish) { vc.textContent = Math.max(0, Math.ceil((lastView.vanish.deadline - Date.now()) / 1000)) + "s left to reconnect"; }
  }

  // ── RENDER ───────────────────────────────────────────────────────────────
  function render() {
    var root = $("hall-root"); if (!root) return;
    if (!matchView) syncFrameHost();   // S-HALL-WIRE-1 — no match on screen, no frame (every road out: leave, lobby, re-key, wallet gone)
    if (accessState === "init") { root.innerHTML = '<div class="hall-busy" role="status">reading the gate…</div>'; return; }
    if (accessState === "connect") { root.innerHTML = connectCard(); wireConnect(); return; }
    if (accessState === "busy") { root.innerHTML = '<div class="hall-gate hall-busy" role="status">The gate is not answering right now — <button class="hall-retry" id="hall-retry">refresh to retry</button>.</div>'; wireRetry(); return; }
    if (accessState === "gateless") { root.innerHTML = gateScreen(); return; }
    // accessState === "pass"
    if (matchView) { sheet = null; renderSheet(); renderMatchScreen(); return; } // L3 — a live match: the battle in the browser
    // the Hall (lobby). A settlement slip (resume-after-reload, or after leaving the over screen) rides on top — pre-settle
    //   (the Cast button) or resolved (the settled line).
    // S-HALL-SLIP-LIST-1 (R4) — THE UNION, deduped by escrowMatchId, newest first. The stored list alone is not
    //   enough: an ERROR slip carries no escrowMatchId and is never persisted (it lives only in settlementView), and
    //   a slip CAST THIS SESSION is marked settled in storage — it leaves the list, but its "settled - N DYC in your
    //   wallet" confirmation must stay on screen, exactly as it does today.
    var homeSlips = lobbySlips();
    var owed = owedCount(homeSlips);
    var slipsHead = owed >= 2 ? '<div class="hall-slips-head state-line">' + SLIPS_HEADER(owed) + '</div>' : "";
    var pendingSlip = homeSlips.length
      ? '<div class="hall-lobby-settle">' + slipsHead + homeSlips.map(settlementStrip).join("") + '</div>' : "";
    // S-HALL-ELSEWHERE-1 (R2, shape B) — a STANDING line, rendered whenever the view carries `seated`. Shape (A)
    //   (replace the empty-room line only) was refused: emptyRoom() renders solely when the floor is EMPTY, so on a
    //   busy floor the seated sibling would be told nothing and the incident would reproduce. Nothing is displaced —
    //   the arena, the doors, the plaques and the covenant all stand; emptyRoom() suppresses its own truth line
    //   while this one is up, so the two never coexist.
    var engineLine = engineNote ? '<div class="hall-empty-line state-line warn hall-engine-note">' + engineNote + '</div>' : "";
    var seatedLine = seatedElsewhere ? '<div class="hall-empty-line state-line hall-seated-elsewhere">' + SEATED_ELSEWHERE_LINE + '</div>' : "";
    root.innerHTML = header() + '<div class="hall-covenant state-line">EVERY SEAT HERE IS HUMAN.</div>' + engineLine + seatedLine + pendingSlip + rail() + doors() + floor();
    wireHall();
    // S-HALL-SLIP-LIST-1 — one wiring per row, each closed over ITS OWN slip. data-settle carries the escrow id, so
    //   N buttons never collide and a row's cast can only ever settle that row.
    Array.prototype.forEach.call(document.querySelectorAll(".hall-lobby-settle [data-settle]"), function (b) {
      if (b.disabled) return;
      var eid = b.getAttribute("data-settle");
      var row = homeSlips.filter(function (x) { return String(x.escrowMatchId) === eid; })[0];
      if (row && row.slip) b.onclick = function () { ceremonySettle(row.slip); };
    });
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
    // S-HALL-L3-FIX-1 (B4) — a locked-but-unopened stake is never hidden by dismissing the sheet: the lobby keeps
    //   a standing line (the ruled 8d text) that reopens the affordance. B3 — and resume never fails in silence.
    if (openStrand) who += '<div class="hall-strand-banner state-line">' + STRAND_LOCKED(openStrand.stake) + ' <button class="hall-act hall-strand-reopen" data-strand-reopen="1">FINISH OPENING</button></div>';
    if (resumeNote) who += '<div class="hall-resume-note state-line">' + resumeNote + '</div>';
    if (accountNote && !signInNeeded) who += '<div class="hall-account-note state-line">' + accountNote + '</div>';   // S-HALL-ACCOUNT-1 (R2; the card carries it while it is up)
    return '<div class="hall-header">' +
      '<div class="hall-liquid"><span class="hall-liquid-label">Liquid</span> <b>' + liq + '</b>' + who + '</div>' +
      '<div class="hall-limit">' + lim + '</div></div>';
  }

  function rail() {
    // S-HALL-DRESS-3 (R6) — THE ONE MARKUP ADDITION: the ALL door had no mark at all; round two gives it one,
    // so the rail reads as seven doors of one family rather than six marks and a word.
    var chips = '<button class="hall-rail-chip hall-chip-all' + (selectedTier === "all" ? " on" : "") + '" data-tier="all">' +
      medallionImg("tier_all", "hall-medallion") + '<span class="hall-chip-label">ALL</span></button>';
    TIERS.slice().sort(function (a, b) { return a.sort - b.sort; }).forEach(function (t) {
      if (!t.open) return;
      var count = tierCount(t);
      var countTxt = t.friend ? "" : (feedState === "dead" ? '<span class="hall-chip-count blank">—</span>' : '<span class="hall-chip-count">' + count + '</span>');
      var usd = t.friend ? "10-10,000" : t.usd;
      chips += '<button class="hall-rail-chip ' + t.cls + (selectedTier === t.id ? " on" : "") + '" data-tier="' + t.id + '">' +
        medallionImg(t.medallion, "hall-medallion") +
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
    // S-HALL-ACCOUNT-1 (R5) — the sign-in card. Same shape as the RECONNECT card; its words are the ruled account
    // line, so no new copy ships. Nothing reaches the wallet until this is clicked.
    if (signInNeeded) return '<div class="hall-floor hall-floor-lost"><div class="hall-lostcard state-line" role="status">' + (accountNote || "") + '<div class="hall-lostcard-act"><button class="hall-act hall-signin" data-signin="1">SIGN IN</button></div></div></div>';
    if (feedState === "connecting") return '<div class="hall-floor"><div class="hall-busy state-line" role="status">reading the floor…</div></div>';
    // S-HALL-CHROME-1 (M4) — the ruled card. It is the ONLY road back: nothing reconnects, and nothing touches the
    // wallet, until this button is clicked. (Ordinary copy, not §11 — it makes no money claim.)
    if (feedState === "dead") return '<div class="hall-floor hall-floor-lost"><div class="hall-lostcard state-line" role="status">connection lost - reconnect?<div class="hall-lostcard-act"><button class="hall-act hall-reconnect" data-reconnect="1">RECONNECT</button></div></div></div>';
    // LIVE
    var ft = floorTables();
    var totalOpen = visibleTables().length;
    if (totalOpen === 0) return '<div class="hall-floor">' + emptyRoom() + '</div>';
    var html = "";
    ft.mine.forEach(function (t) { html += plaque(t, true); });                 // YOUR table pins first, regardless of filter
    ft.rest.forEach(function (t) { html += plaque(t, false); });
    // a SPECIFIC selected tier with no open seats in it renders its quiet empty state (YOUR pinned table above is a
    // different question — the selected tier is still seatless). "all" with zero tables is the empty room, handled above.
    // S-HALL-CHROME-1 (M5) — if the only table at this tier is YOUR OWN, say nothing: the plaque above already
    // says it, and inviting you to "open one" is inviting a second table the server will refuse (one per address).
    // A genuinely seatless tier keeps its invitation.
    var mineAtThisTier = ft.mine.some(function (t) { return tableDoorId(t) === selectedTier; });
    if (selectedTier !== "all" && ft.rest.length === 0 && !mineAtThisTier) {
      html += '<div class="hall-empty-tier state-line">no open seats at this tier - <button class="hall-open-one" data-act="open-sheet">open one</button></div>';
    }
    return '<div class="hall-floor">' + html + '</div>';
  }

  function plaque(t, isYou) {
    // RULING: the tier medallion + lock are drawn for STAKED tables only; a free table (staked===false) reads "Free
    // table", no medallion, no lock — keyed on staked, never on tier.
    var td = t.staked ? stakedTierDef(t) : null;
    var stakeTxt = t.staked ? (Number(BigInt(t.stake) / DEC)) + " DYC · ~" + (td ? td.usd : "") : "Free table";
    var medallion = (t.staked && td) ? medallionImg(td.medallion, "hall-medallion " + td.cls) : "";
    var sigil = t.faction && FACTION_SIGIL[t.faction] ? sigilImg(FACTION_SIGIL[t.faction], "hall-sigil") : '<span class="hall-sigil-empty" aria-hidden="true"></span>';
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
    // S-HALL-DRESS-3 (M3) — S-HALL-BOARD-1 PAID. This src was hard-coded to an EXTERNAL PAGES HOST: a live
    // cross-origin dependency in a money room, on a host this repo does not control. The arena now comes from
    // THIS repo, and the <picture> hands the wide plate to wide viewports. (The IIFE it replaces carried a dead
    // line — `var b = (CFG.chain && CFG.chain.readRpcUrls) ? "" : ""` — both branches "" and b never read.)
    return '<div class="hall-empty">' +
      '<div class="hall-empty-board"><picture>' +
      '<source media="(min-width: 900px)" srcset="../assets/hall/arena_wide.webp">' +
      '<img src="../assets/hall/arena_tall.webp" alt="" aria-hidden="true" loading="lazy" onerror="this.style.display=\'none\'">' +
      '</picture></div>' +
      // S-HALL-ELSEWHERE-1 — the two never coexist: while the standing seated line is up, this one would be the
      //   lie it replaces ("No warrior is seated" to a player whose warrior IS seated). The doors stay.
      (seatedElsewhere ? "" : '<div class="hall-empty-line state-line">No warrior is seated - yet. Open the first table, or summon someone you already trust.</div>') +
      '<div class="hall-empty-doors">' +
      '<button class="hall-act" data-act="friend-sheet">CHALLENGE A FRIEND</button>' +
      '<a class="hall-act hall-empty-practice" href="../game/index.html">practice — no stakes, AI opponent</a>' +
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
    // S-HALL-CHROME-1 (M4) — the human act. This is the only place the lobby may rebuild the client (and so the
    // only place a sign-in prompt can follow), and it is idempotent: a second drop before the click never stacks.
    var rc = document.querySelector("[data-reconnect]");
    if (rc) rc.onclick = function () {
      if (!connectionLost) return;
      connectionLost = false; reconnectTries = 0; feedState = "connecting"; render();
      try { if (client && client.raw && client.raw.disconnect) client.raw.disconnect(); } catch (e) {}
      client = null; startFeed();
    };
    // S-HALL-L3-FIX-1 (B4) — reopen the ruled affordance from the standing lobby line.
    // S-HALL-ACCOUNT-1 (R5) — the ONE human act that starts B's session (and so the only road to a signature).
    var si = document.querySelector("[data-signin]");
    if (si) si.onclick = function () {
      if (!signInNeeded) return;
      signInNeeded = false; feedState = "connecting"; render(); startFeed();
    };
    var sr = document.querySelector("[data-strand-reopen]"); if (sr) sr.onclick = function () { sheet = { kind: "strand" }; renderSheet(); };
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
    // S-HALL-L3-FIX-1 (B4) — the ruled acts.
    var sf = host.querySelector("[data-strand-finish]"); if (sf) sf.onclick = function () { strandFinish(); };
    var sc = host.querySelector("[data-strand-cancel]"); if (sc) sc.onclick = function () { strandCancel(); };
    var sk = host.querySelector("[data-strand-check]"); if (sk) sk.onclick = function () { strandFinish(); };
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
    if (chosen.id === "free") { lastServerError = null; freeOpenPending = !!(client && client.open(0, selectedFaction)); renderSheet(); return; } // M1: the sheet closes on OUR {opened} ack, not on this send // server refuses tier 0 today (W3-LOBBY-DOORS-1); the refusal surfaces via lastReject
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
    sheet.ctx = sheet.ctx || {};
    if (sheet.ctx.finding) return;                    // R3 — one lookup at a time; a double-tap must not supersede itself
    sheet.ctx.codeInput = code; sheet.ctx.err = null; // the entry ALWAYS survives, whatever the outcome
    if (!client || !client.lookup) { sheet.ctx.err = FRIEND_UNREACHABLE; renderSheet(); return; }
    sheet.ctx.finding = true; renderSheet();
    client.lookup(code).then(function (r) {
      // the sheet may have been dismissed while we waited — never write into a sheet that moved on
      if (!sheet || sheet.kind !== "friendjoin") return;
      sheet.ctx.finding = false;
      if (!r || r.unreachable) { sheet.ctx.err = FRIEND_UNREACHABLE; renderSheet(); return; }   // no answer ≠ "no"
      var t = r.found;
      if (!t) { sheet.ctx.err = "no table found for that code - ask your friend to re-share it"; renderSheet(); return; }
      if (!t.staked) { sheet.ctx.err = "that code is not a staked table"; renderSheet(); return; }
      sheet.ctx.table = t; renderSheet();
    });
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

  // ════════════════════════════════════════════════════════════════════════
  //  S-HALL-ACCOUNT-1 — THE HALL FOLLOWS THE WALLET
  //  Identity (`me`) and the pen (getSigner) must never diverge on a money site. The Hall was structurally BLIND to
  //  account switches: js/wallet.js has listened to accountsChanged since it shipped, but its listener is wired
  //  inside onProviderReady, which only init()/retry() reach — and the Hall never called init(), while connect()
  //  takes a different path. So we WAKE THE SITE'S OWN ROAD (R3) rather than add a second listener to one event.
  // ════════════════════════════════════════════════════════════════════════
  function wireWallet() {
    if (!window.DYWallet || !window.DYWallet.onChange) return;
    try { window.DYWallet.init(); } catch (e) {}          // detection + the listener; prompts NOTHING (eth_accounts/eth_chainId only)
    window.DYWallet.onChange(function (st) {
      var addr = (st && st.address) ? String(st.address).toLowerCase() : null;
      if (addr === walletSeen) return;                    // no change (and onChange fires once immediately)
      var prev = walletSeen; walletSeen = addr;
      // NULL at boot is detection noise, not a disconnect — it must never bounce a working Hall to the connect
      // card. Only a wallet that HAD reported an address can report losing one.
      if (addr === null) { if (prev !== null) walletGone(); return; }
      if (!me) { me = addr; runGate(); return; }          // the wallet arrived where we had no identity
      if (addr !== me) switchAccount(addr);               // …and this is the switch
    });
  }

  //  L1 — re-become ourselves for the new account. L3 — the pending records on disk are NOT touched: they stay
  //  filed under A's key, invisible to B (pendWallet() follows `me`), and intact for A's return. A switch is not a
  //  forfeiture of the record.
  //  R1 — the deferral is consumed HERE, and this is called from both roads out of a battle: a lobby view arriving
  //  (the match ended under us) and the player leaving the over-screen. Missing the second road would leave the
  //  switch parked forever after a forfeit.
  function maybeReKey() {
    if (!pendingReKey || matchView) return false;
    var next = pendingReKey; pendingReKey = null; switchAccount(next); return true;
  }
  function switchAccount(addr) {
    if (matchView) { pendingReKey = addr; return; }       // R1 — a wallet click must never cost a forfeit
    // shutdown, not disconnect: a plain close lets matchclient's battle auto-reconnect reopen and re-sign with the
    // NEW wallet — a prompt nobody asked for, which is precisely what R5 forbids.
    try { if (client && client.raw && client.raw.shutdown) client.raw.shutdown(); else if (client && client.raw) client.raw.disconnect(); } catch (e) {}
    client = null; feedGen++; gateGen++;                  // invalidate every in-flight read of A's world
    tables = []; feedState = "connecting"; connectionLost = false; reconnectTries = 0;
    // A-keyed state leaves the screen (nothing here is persisted; the records are)
    sheet = null; ceremony = null; openStrand = null; openUnknown = null; resumeNote = null;
    settlementView = null; settleState = {}; castThisSession = {}; matchView = null; lossLimit = null; liquid = null;
    signedInAs = null; seenReject = null; lastServerError = null; freeOpenPending = false;
    resumedGen = 0; seenOpenAck = null; selectedFaction = null;
    me = addr; accountNote = ACCOUNT_CHANGED(addr);
    signInNeeded = true;                                  // R5 — visual re-key now; the sign-in waits for the click
    renderSheet();                                        // A's overlay must actually LEAVE the screen
    runGate();                                            // the gate runs for B; on a pass it starts B's session
  }

  //  L4 — the wallet is gone (accounts became []). Quietly back to the connect card: no wallet call, no dialog,
  //  and NO WORDS (a quiet return must stay quiet — the connect card already says what it means).
  function walletGone() {
    try { if (client && client.raw && client.raw.shutdown) client.raw.shutdown(); else if (client && client.raw) client.raw.disconnect(); } catch (e) {}
    client = null; feedGen++; gateGen++;
    tables = []; feedState = "connecting"; connectionLost = false;
    sheet = null; ceremony = null; openStrand = null; openUnknown = null; resumeNote = null;
    settlementView = null; settleState = {}; castThisSession = {}; matchView = null; lossLimit = null; liquid = null;
    signedInAs = null; accountNote = null; pendingReKey = null; signInNeeded = false;
    me = null; accessState = "connect"; renderSheet(); render();
  }

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
    wireWallet();   // S-HALL-ACCOUNT-1 — after the first gate, so the boot snapshot is in place when the road wakes
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
        pending: listPending(), strand: openStrand, unknownOpen: openUnknown, resumeNote: resumeNote,
        accountNote: accountNote, pendingReKey: pendingReKey, walletSeen: walletSeen, signInNeeded: signInNeeded,
        lastServerError: lastServerError, escrow: escrowAddr(),
        matchReject: matchView ? matchView.lastReject : null,
        wire: wireF ? { matchId: wireF.matchId, mounted: !!wireF.el, ready: wireF.ready, started: wireF.started, sent: wireF.sent, actPending: wireF.actPending, fallback: wireF.fallback, resultSent: wireF.resultSent } : null,
        wireRefused: wireRefused.slice(),
      };
    },
  };
})();
