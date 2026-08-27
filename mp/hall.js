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
  function readProvider(ethers) { var urls = (CFG.chain && CFG.chain.readRpcUrls) || []; return new ethers.JsonRpcProvider(urls[0], undefined, { staticNetwork: true }); }
  var ACCESS_ABI = ["function balanceOf(address) view returns (uint256)"];
  var DYC_ABI = ["function balanceOf(address) view returns (uint256)"];

  // ── THE GATE (D1) — lift the Access balanceOf read (not the admin panel). Three faces, busy-sentinel honesty. ──
  function runGate() {
    var gen = ++gateGen;
    var dev = devIdentity();
    if (dev) me = String(dev).toLowerCase();
    if (!me) { accessState = "connect"; return render(); } // no wallet = quiet connect card, no floor
    if (devAccessBypass()) { accessState = "pass"; startFeed(); return render(); } // proof-only bypass
    accessState = "init"; render();
    loadEthers().then(function (ethers) {
      var acc = CFG.contracts && CFG.contracts.accessNFT;
      if (!acc) { accessState = "busy"; return render(); }
      return new ethers.Contract(acc, ACCESS_ABI, readProvider(ethers)).balanceOf(me).then(function (bal) {
        if (gen !== gateGen) return;                          // read-generation guard
        accessState = (bal && bal > 0n) ? "pass" : "gateless";
        if (accessState === "pass") { readLiquid(ethers); startFeed(); }
        render();
      });
    }).catch(function () {
      if (gen !== gateGen) return;
      accessState = "busy";                                   // dead/throttled RPC → busy, NEVER gateless, NEVER the Hall
      render();
    });
  }
  function readLiquid(ethers) {
    var dyc = CFG.contracts && CFG.contracts.dycoin; if (!dyc || !me) return;
    new ethers.Contract(dyc, DYC_ABI, readProvider(ethers)).balanceOf(me).then(function (b) { liquid = b; render(); }).catch(function () {});
  }

  // ── THE LIVE FEED (M-P1) — matchclient's existing handshake; whole-list {tables} reconcile; three faces. ──
  function startFeed() {
    if (client) return;
    var url = matchServerUrl();
    if (!url) { feedState = "dead"; return render(); }
    var gen = ++feedGen;
    // the Hall only READS the lobby — E/W are unused on the lobby view; stub them (no match is entered in L1).
    client = window.DYMatchClient.createClient({
      E: {}, W: {}, ethers: window.ethers || {}, log: function () {},
      onUpdate: function (v) {
        if (gen !== feedGen) return;                          // read-generation guard on the feed
        // busy-sentinel honesty: a dropped/refused socket is DEAD (busy face), never a false empty room.
        if (v && v.connected === false) { feedState = "dead"; scheduleReconnect(); return render(); }
        if (v && Array.isArray(v.tables)) { tables = v.tables.slice(); feedState = "live"; reconnectTries = 0; } // whole-list reconcile
        if (v && v.lossLimit) lossLimit = v.lossLimit;
        render();
      },
    });
    try {
      client.connect(url);
      // auth AS the connected identity so YOUR table pins (dev-address mode on the local proof server; L2 wires
      // connected-wallet-signature auth for the deployed server so it knows your address — the acts are inert in L1).
      var poll = setInterval(function () { if (client && me) { clearInterval(poll); client.authDev(me); client.getLossLimit && setTimeout(function () { try { client.getLossLimit(); } catch (e) {} }, 400); } }, 120);
      setTimeout(function () { clearInterval(poll); }, 6000);
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

  // ── RENDER ───────────────────────────────────────────────────────────────
  function render() {
    var root = $("hall-root"); if (!root) return;
    if (accessState === "init") { root.innerHTML = '<div class="hall-busy" role="status">reading the gate…</div>'; return; }
    if (accessState === "connect") { root.innerHTML = connectCard(); wireConnect(); return; }
    if (accessState === "busy") { root.innerHTML = '<div class="hall-gate hall-busy" role="status">The gate is not answering right now — <button class="hall-retry" id="hall-retry">refresh to retry</button>.</div>'; wireRetry(); return; }
    if (accessState === "gateless") { root.innerHTML = gateScreen(); return; }
    // accessState === "pass" → the Hall
    root.innerHTML = header() + '<div class="hall-covenant state-line">EVERY SEAT HERE IS HUMAN.</div>' + rail() + doors() + floor();
    wireHall();
  }

  function connectCard() {
    return '<div class="hall-gate hall-connect"><p>Connect your wallet to enter the Hall.</p>' +
      '<button class="hall-act" id="hall-connect">Connect wallet</button></div>';
  }
  function gateScreen() {
    // D1: the rite's own gate language, quoted from index.html:136 exactly as it stands.
    return '<div class="hall-gate">' +
      '<p class="hall-gate-line"><strong>The door is free.</strong> The Access token is claimed once at launch, one per hand, bound to you alone — never sold, yours to burn. It admits you; it buys no advantage.</p>' +
      '<a class="hall-act hall-gate-door" href="../rite.html">Claim access — take the rite</a></div>';
  }

  function header() {
    var liq = liquid == null ? "—" : (liquid / DEC).toString() + " DYC";
    var lim;
    if (lossLimit && lossLimit.cap != null) {
      var rem = (BigInt(lossLimit.remaining) / DEC).toString(), cap = (BigInt(lossLimit.cap) / DEC).toString();
      lim = '<span class="hall-limit-set">today: ' + rem + ' of ' + cap + ' DYC remaining</span>';
    } else {
      lim = '<button class="hall-limit-invite hall-act-inert" data-inert="1">set a daily limit</button>';
    }
    return '<div class="hall-header">' +
      '<div class="hall-liquid"><span class="hall-liquid-label">Liquid</span> <b>' + liq + '</b></div>' +
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
      '<button class="hall-door hall-door-open hall-act-inert" data-inert="1">OPEN A TABLE</button>' +
      '<button class="hall-door hall-door-friend hall-act-inert" data-inert="1">FRIEND CHALLENGE</button></div>';
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
      html += '<div class="hall-empty-tier state-line">no open seats at this tier - <button class="hall-act-inert" data-inert="1">open one</button></div>';
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
      return '<div class="hall-plaque hall-plaque-you">' +
        '<div class="hall-plaque-head">' + medallion + '<span class="hall-plaque-stake">' + stakeTxt + '</span>' + lock + '<span class="hall-you-tag">(you)</span></div>' +
        '<div class="hall-plaque-opener">' + sigil + '<span class="hall-plaque-addr">' + shortAddr(t.opener) + '</span></div>' +
        '<div class="hall-plaque-wait state-line">' + wait + '</div>' +
        '<div class="hall-plaque-acts"><button class="hall-act-inert" data-inert="1">CANCEL TABLE</button><button class="hall-act-inert" data-inert="1">SHARE AS CODE</button></div></div>';
    }
    return '<div class="hall-plaque">' +
      '<div class="hall-plaque-head">' + medallion + '<span class="hall-plaque-stake">' + stakeTxt + '</span>' + lock + '</div>' +
      '<div class="hall-plaque-opener">' + sigil + '<span class="hall-plaque-addr">' + shortAddr(t.opener) + '</span></div>' +
      // D2: patience line OFF in L1 (openedAt not in the feed; W3-LOBBY-OPENEDAT-1 queued). Slot reserved.
      '<div class="hall-plaque-acts"><button class="hall-act-inert" data-inert="1">TAKE THIS SEAT</button></div></div>';
  }

  function emptyRoom() {
    // screen 3 — only when the feed is LIVE and reports zero tables anywhere.
    var board = (function () { var b = (CFG.chain && CFG.chain.readRpcUrls) ? "" : ""; return "https://sangbaran-purr.github.io/divya-yuddha/assets/img/board_bg.jpg"; })();
    return '<div class="hall-empty">' +
      '<div class="hall-empty-board"><img src="' + board + '" alt="" aria-hidden="true" loading="lazy" onerror="this.style.display=\'none\'"></div>' +
      '<div class="hall-empty-line state-line">No one is seated right now - because every opponent here is a real person.</div>' +
      '<div class="hall-empty-doors">' +
      '<button class="hall-act-inert" data-inert="1">CHALLENGE A FRIEND</button>' +
      '<a class="hall-act hall-empty-practice" href="../game/index.html?v=33d0757">practice — no stakes, AI opponent</a>' +
      '<button class="hall-act-inert" data-inert="1">OPEN A TABLE AND WAIT</button></div></div>';
  }

  // ── WIRING (inert idiom: the one quiet line; the practice door is the only live door) ──
  function wireConnect() { var b = $("hall-connect"); if (b) b.onclick = connectWallet; }
  function wireRetry() { var b = $("hall-retry"); if (b) b.onclick = function () { location.reload(); }; }
  function wireHall() {
    Array.prototype.forEach.call(document.querySelectorAll(".hall-rail-chip"), function (c) {
      c.onclick = function () { selectedTier = c.getAttribute("data-tier"); render(); };
    });
    // inert idiom: the disabled LOOK (class) + aria-disabled, but stays TAPPABLE so the one quiet line can show
    // (a real `disabled` attribute would suppress the click and swallow the line).
    Array.prototype.forEach.call(document.querySelectorAll("[data-inert]"), function (b) {
      b.classList.add("hall-inert"); b.setAttribute("aria-disabled", "true");
      b.addEventListener("click", function (e) { e.preventDefault(); showInert(); }, true);
    });
    var r = $("hall-retry"); if (r) r.onclick = function () { location.reload(); };
  }
  function showInert() {
    var n = $("hall-inert-note"); if (!n) { n = el("div", "hall-inert-note state-line"); document.body.appendChild(n); }
    n.textContent = "the tables are not open yet"; n.classList.add("show");
    clearTimeout(showInert._t); showInert._t = setTimeout(function () { n.classList.remove("show"); }, 2400);
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
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.DYHall = { TIERS: TIERS, _state: function () { return { accessState: accessState, feedState: feedState, selectedTier: selectedTier, tables: tables, me: me }; } };
})();
