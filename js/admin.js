/* ============================================================================
   DYAdmin — the Admin Drops dashboard (S5a). Owner-only minting instrument.
   Reuses DYWallet (connect/chain/ethers) + the treasury read idiom. Targets
   come from DY_ADMIN_CONFIG (NOT the player config.js). Runbook-law UI: every
   send carries an explicit gasLimit; every send is behind a confirm that states
   the count + destinations; a reverting row is surfaced human-readable and never
   halts a batch. The CHAIN enforces owner-only — this UI only reflects it.
   ========================================================================= */
window.DYAdmin = (function () {
  var PLAYER = window.DY_CONFIG; // chain + ethers CDN (shared infra)
  var FILE = window.DY_ADMIN_CONFIG || {};
  var LS_KEY = "dyadmin::config"; // distinct namespace; never collides with the game copy's dyw:: door-wipe (S5a follow-up)

  var ACCESS_ABI = [
    "function owner() view returns (address)",
    "function mint(address to) returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function authorizedMinters(address) view returns (bool)", // S-TORANA-1: the minter gate (owner-managed via setMinter)
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "error AlreadyHolds(address holder)",
    "error NotAuthorizedMinter(address caller)",
  ];
  var WAVE_ABI = [
    "function owner() view returns (address)",
    "function mint(address to, uint256 cardId) returns (uint256)",
    "event CardMinted(uint256 indexed tokenId, uint256 indexed cardId, address indexed to)",
    "error NotAuthorizedMinter(address caller)",
  ];
  // S9 — plain ERC-20 surface for the COIN DROPS panel (DYC sends from the connected admin wallet).
  var COIN_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ];

  // Explicit gas floors (runbook law). Amoy mints measure ~90k–130k; ~2x floor.
  var ACCESS_MINT_GAS = 300000;
  var WAVE_MINT_GAS = 300000;
  var COIN_XFER_GAS = 120000; // ERC-20 transfer ~51k–66k (fresh recipient); ~2x floor
  var LOG_CHUNK = 9999; // getLogs block window — MUST stay under archive-RPC caps (drpc + publicnode reject >10000). S-LEDGER-FIX-2: 9000→9999 (still <10000) shaves the request count on the deep scan (fewer browser-origin hits at drpc).
  var WAIT_CONFIRMS = 1;
  var WAIT_TIMEOUT_MS = 75000; // bound tx.wait — a never-mined/dropped tx must NEVER sit PENDING (S5a-FIX-2)
  var FEE_HEADROOM = 2n; // 2x headroom over the live base+priority fee signal (S5a-FIX-2); wallet override stays possible
  var RECENT_WINDOW = 500; // recent-only history fallback span (no readRpcUrl) — last N blocks, dodges archive gating (S5a-FIX-3)
  // S-LEDGER-FIX — shared archive-capable getLogs endpoints (drpc FIRST, publicnode next). The wallet node PRUNES deep
  // history and the domain-locked readRpcUrl (Alchemy) caps eth_getLogs at 10 blocks; drpc is proven archive-capable at
  // the deploy block (S-LEDGER-FIX STEP-0). Alchemy (10-blk cap) + thirdweb (1000-blk cap < LOG_CHUNK) are EXCLUDED from
  // getLogs duty. NOTE: admin.js reads DY_ADMIN_CONFIG (admin-config.js), which does NOT carry mf-config's
  // readRpcUrlFallbacks — so the documented drpc-first list is mirrored here to keep admin self-contained.
  var HISTORY_RPCS = ["https://polygon-amoy.drpc.org", "https://polygon-amoy-bor-rpc.publicnode.com"];

  var owners = { access: null, wave: null }; // last-read on-chain owners
  var histLoaded = false;
  var coinMeta = null; // { decimals, symbol, balance } for the configured DYC token; null until read

  // ---------- config resolution: localStorage override > file ----------
  function override() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  // S-WAVE-REGISTRY: the committed DY_WAVE_REGISTRY is the SOLE catalog base. A dyadmin::
  // localStorage `waveCards` entry is a TESTNET-ONLY override, layered per-cardId (stored wins);
  // when active it is announced LOUDLY (no-silent-defaults law). admin-config.js waveCards is
  // superseded and no longer read here.
  function mergeWaveCatalog(stored) {
    var base = (window.DY_WAVE_REGISTRY && DY_WAVE_REGISTRY.list) ? DY_WAVE_REGISTRY.list() : [];
    if (!stored || !stored.length) return base;
    var byId = {};
    base.forEach(function (w) { byId[Number(w.cardId)] = w; });
    stored.forEach(function (w) { if (w && w.cardId != null) byId[Number(w.cardId)] = w; }); // per-cardId override
    console.log("[DY admin] wave catalog: localStorage override ACTIVE — " + stored.length +
      " stored entr" + (stored.length === 1 ? "y" : "ies") + " layered over " + base.length +
      " registry card" + (base.length === 1 ? "" : "s") + " (testnet only).");
    var out = [];
    for (var k in byId) { if (Object.prototype.hasOwnProperty.call(byId, k)) out.push(byId[k]); }
    return out;
  }
  function cfg() {
    var o = override();
    var fc = FILE.contracts || {};
    return {
      accessNFT: o.accessNFT || fc.accessNFT || null,
      waveCardNFT: o.waveCardNFT || fc.waveCardNFT || null,
      dycoin: o.dycoin || fc.dycoin || null, // S9 — the DYC token for COIN DROPS (admin config, never config.js's frozen proxy)
      dycoinSale: o.dycoinSale || fc.dycoinSale || null, // M-F2 — the DYCoinSale (Approve Buyers EIP-712 domain + signer gate)
      dropDesk: o.dropDesk || fc.dropDesk || null, // M-F6 — the Drop Desk (coupon signing + cancel + figures)
      waveCardSale: o.waveCardSale || fc.waveCardSale || null, // LEG2 — WaveCardSale (Price Desk)
      waveCardMarket: o.waveCardMarket || fc.waveCardMarket || null, // LEG4 — WaveCardMarket (marketsOpen switch)
      vestingVault: o.vestingVault || fc.vestingVault || null, // M-F3 — Purchase Registry VESTED column
      holderStaking: o.holderStaking || fc.holderStaking || null, // M-F3 — Purchase Registry STAKED + REWARDS
      // S-LEDGER-FIX-4: a stored 0 / "" / null / undefined / non-numeric deployBlock counts as UNSET → file default rules; only a genuine positive integer wins (a stored 0 used to win and force a genesis full-chain scan).
      deployBlock: (function (v) { v = Number(v); return (Number.isFinite(v) && v > 0) ? v : (FILE.deployBlock || 0); })(o.deployBlock),
      readRpcUrl: o.readRpcUrl || FILE.readRpcUrl || null, // archive-capable RPC for HISTORY READS only (S5a-FIX-3)
      // S-ROBOT-COUPON-1: robot base URL + admin bearer for "Publish via robot" (coupon publishing). Token is
      // localStorage-only (this browser), NEVER admin-config.js / never committed. Full registry wiring stays its own task.
      robotUrl: o.robotUrl || FILE.robotUrl || null,
      robotToken: o.robotToken || null,
      // S-TORANA-1: two USD eligibility bands (positive; definite ≥ discretion enforced in saveCfg). Defaults 500 / 100.
      toranaDefiniteUsd: (function (v) { v = Number(v); return (Number.isFinite(v) && v > 0) ? v : (FILE.toranaDefiniteUsd || 500); })(o.toranaDefiniteUsd),
      toranaDiscretionUsd: (function (v) { v = Number(v); return (Number.isFinite(v) && v > 0) ? v : (FILE.toranaDiscretionUsd || 100); })(o.toranaDiscretionUsd),
      waveCards: mergeWaveCatalog(o.waveCards), // S-WAVE-REGISTRY: registry base + per-cardId localStorage testnet override
      source: o.accessNFT || o.waveCardNFT || o.dycoin ? "localStorage (this browser)" : "admin-config.js",
    };
  }
  function isConfigured(c) {
    return !!(c.accessNFT && c.waveCardNFT);
  }

  // ---------- helpers ----------
  function $(id) {
    return document.getElementById(id);
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  // S-LEDGER-FIX-2 — a rate-limit / server-class error (distinct from isArchiveError's pruned/range class). drpc throttles
  // browser-origin traffic: a single labeled request can 429, and under the deep scan's burst it returns HTTP 5xx, which
  // ethers v6 surfaces as code "SERVER_ERROR" / shortMessage "server response 500". This class RETRIES the SAME endpoint
  // (the endpoint is fine, just busy) — it must NOT demote drpc to a pruned node.
  function isRateLimited(e) {
    if (!e) return false;
    if (e.code === "SERVER_ERROR") return true; // ethers v6 wraps an HTTP 5xx as SERVER_ERROR
    var s = ((e.shortMessage || "") + " " + (e.message || "")).toLowerCase();
    return (
      s.indexOf("server response 5") >= 0 || // HTTP 5xx (the observed "server response 500 Internal Server Error")
      s.indexOf("429") >= 0 || // Too Many Requests
      s.indexOf("too many requests") >= 0 // worded rate-limit (note: isArchiveError also matches bare "too many" → catch isRateLimited FIRST)
    );
  }
  // S-LEDGER-FIX-2 — retry a history read against the SAME endpoint on a rate-limit-class error, with exponential backoff
  // + jitter (~500ms, ~1200ms, ~2500ms → 4 attempts total). A NON-rate-limit error (archive/range/pruned) is thrown
  // immediately (no retry) so the caller can fail over or surface the archive message. Exhausted retries throw the last
  // rate-limit error → the caller's plain-words "busy" message (never the raw "server response 500").
  function withRetry(fn, onRetry) {
    // S-LEDGER-FIX-3: TRIMMED to 2 attempts (1 short retry). ethers' now-capped internal throttle (tamedProvider →
    // maxAttempts 2) handles the fast 429 retries; a fat outer budget compounds past the 75s scan deadline (S-LEDGER-FIX-3).
    var delays = [400];
    var i = 0;
    function go() {
      return fn().catch(function (e) {
        if (i < delays.length && isRateLimited(e)) {
          var base = delays[i++];
          if (onRetry) { try { onRetry(); } catch (x) {} } // progress voice: "chunk N/M, retrying"
          return sleep(base + Math.floor(Math.random() * base * 0.3)).then(go); // + up to 30% jitter
        }
        throw e;
      });
    }
    return go();
  }
  var SCAN_DEADLINE_MS = 75000; // S-LEDGER-FIX-3: hard cap on the WHOLE history scan → busy message; nothing on the road runs unbounded.
  // S-LEDGER-FIX-3 — a JsonRpcProvider whose transport is TAMED: 12s per-request timeout (ethers' default is 300s) and the
  // internal 429 throttle capped at 2 attempts (ethers' default is 12, exponential-backoff to the 300s cap — the root cause
  // of the >5-min freeze, S-LEDGER-FIX-3 STEP-0). So a single history request can never grind past ~12s or silently retry 12×.
  function tamedProvider(url) {
    var req = new ethersRef.FetchRequest(url);
    req.timeout = 12000;
    req.setThrottleParams({ maxAttempts: 2 });
    return new ethersRef.JsonRpcProvider(req, 80002, { staticNetwork: true });
  }
  // S-LEDGER-FIX-3 — race a scan promise against a wall-clock deadline. On expiry, reject with a __deadline error (routed to
  // the busy message). The scan's own per-chunk `Date.now() > deadlineAt` guard stops issuing further chunks, so no orphaned
  // requests keep firing after expiry — at most the one in-flight request finishes (bounded by the 12s tamed timeout). A late
  // scan rejection after the deadline won is swallowed (no unhandled rejection).
  function raceDeadline(promise, deadlineAt) {
    var timer;
    var dl = new Promise(function (_res, rej) {
      timer = setTimeout(function () { var e = new Error("scan deadline"); e.__deadline = true; rej(e); }, Math.max(0, deadlineAt - Date.now()));
    });
    promise.catch(function () {});
    return Promise.race([promise.then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; }), dl]);
  }
  function txUrl(hash) {
    return PLAYER.chain.blockExplorerUrls[0] + "/tx/" + hash;
  }
  function shortAddr(a) {
    return window.DYWallet.shortAddr(a);
  }
  function eq(a, b) {
    return a && b && a.toLowerCase() === b.toLowerCase();
  }
  // RUNG4-FIX-1C — canonical-address guard. ethers.getAddress accepts a valid EIP-55 (or all-lower/all-upper)
  // address and RETURNS the checksummed form; it THROWS on a bad mixed-case checksum. A malformed address is a
  // CONFIG error, not a chain-busy or a wrong-wallet — never launder it into either. Returns the usable checksummed
  // address, or null (caller renders "address is malformed"). Requires ethersRef (call inside withEthers()).
  function validAddr(a) {
    if (!a) return null;
    try { return ethersRef.getAddress(a); } catch (e) { return null; }
  }

  function decodeErr(e) {
    if (e && e.code === "ACTION_REJECTED") return "signature rejected";
    if (e && e.revert && e.revert.name) {
      var n = e.revert.name;
      var args = e.revert.args || [];
      if (n === "AlreadyHolds") return "already holds an Access NFT (one per wallet)";
      if (n === "NotAuthorizedMinter") return "caller is not an authorized minter";
      // S-CLAIM-2B — creditRoi grant path
      if (n === "NotDebitor") return "this wallet isn't a registered debitor yet — the owner must call setDebitor(adminWallet) via the timelock before grants work (go-live step)";
      if (n === "ERC20InsufficientAllowance") return "approve DYC to the staking contract first (the approve step below)";
      if (n === "ERC20InsufficientBalance") return "this admin wallet doesn't hold enough DYC to fund this grant";
      if (n === "ZeroAmount") return "enter an amount above zero";
      return n + (args.length ? "(" + args.join(", ") + ")" : "");
    }
    if (e && e.reason) return e.reason;
    if (e && e.shortMessage) return e.shortMessage;
    return e && e.message ? String(e.message).slice(0, 90) : "reverted";
  }

  var ethersRef = null;
  function withEthers() {
    return window.DYWallet.loadEthers().then(function (ethers) {
      ethersRef = ethers;
      return ethers;
    });
  }
  function readProvider() {
    return new ethersRef.BrowserProvider(window.ethereum);
  }

  // S-LEDGER-FIX — pick an ARCHIVE-CAPABLE getLogs provider for deep-history reads (ledger + drop-history both ride
  // this). Candidate order: an owner-set Read RPC URL FIRST (honored ONLY if a deep-history probe at the deploy block
  // succeeds), then HISTORY_RPCS (drpc archive-capable, publicnode next). Each candidate is probed with a small
  // getLogs AT the deploy block whose span (128 blocks) exceeds the Alchemy 10-block cap and lands on possibly-pruned
  // history — so a range-capped or pruned endpoint is REJECTED here, before the real scan, and we fail over. Exhausting
  // every candidate rejects with an archive-class error so the caller surfaces isArchiveError's plain-words message,
  // never the raw ethers "could not coalesce error". Returns Promise<{ provider, url, fellBack }>. probeAddress bounds
  // the probe's result size (each surface passes its own contract).
  function historyProvider(probeAddress) {
    var c = cfg();
    var probeFrom = c.deployBlock || 0;
    var probeTo = probeFrom + 127; // >10 → catches the Alchemy 10-block getLogs cap; at the deploy block → catches pruning
    var cands = [];
    if (c.readRpcUrl) cands.push(c.readRpcUrl);
    HISTORY_RPCS.forEach(function (u) { if (u !== c.readRpcUrl) cands.push(u); });
    var i = 0, fellBack = false;
    function attempt() {
      if (i >= cands.length) {
        var e = new Error("archive: no getLogs endpoint served the deploy-block range probe");
        e.__archive = true; // marks the exhaustion so callers/ isArchiveError surface the plain-words message
        return Promise.reject(e);
      }
      var url = cands[i++];
      // S-LEDGER-FIX-3: TAMED transport (12s timeout, throttle maxAttempts 2) + static network (Amoy 80002, skips ethers'
      // chainId-detection round-trip that can flake into "could not coalesce error"). Covers the probe AND every chunk (the
      // scan rides this same provider), on both panels.
      var p = tamedProvider(url);
      var probe = { fromBlock: probeFrom, toBlock: probeTo };
      if (probeAddress) probe.address = probeAddress;
      // S-LEDGER-FIX-2: a rate-limited probe RETRIES this same endpoint (withRetry) — drpc is busy, not incapable. If it is
      // STILL rate-limited after the retries, THROW (surface the plain-words "busy" message) — do NOT demote drpc to a
      // pruned node. Only a NON-rate-limit (archive/range/pruned) probe error means "can't serve deep history" → fail over.
      return withRetry(function () { return p.getLogs(probe); }).then(
        function () { return { provider: p, url: url, fellBack: fellBack }; },
        function (err) {
          if (isRateLimited(err)) throw err; // busy after retries → don't fail over to a pruned node; caller shows the busy message
          if (c.readRpcUrl && i === 1) fellBack = true; // owner URL can't serve deep history → note the fall-back to drpc
          return attempt();
        }
      );
    }
    return attempt();
  }

  // (scope 2) size EIP-1559 fees from live base+priority with FEE_HEADROOM so a send isn't dropped under Amoy's
  // volatile gas floor. maxFeePerGas is a refundable ceiling; the wallet still shows + can override these.
  // RUNG4-FIX-4 — Amoy's node floor is 25 gwei on the priority tip; the wallet's Amoy RPC serves weak/absent
  // priority-fee data, so getFeeData through it (and the old {} fallback) let MetaMask default to 1.5 gwei →
  // rejected under the floor ("gas tip cap 1500000000, minimum needed 25000000000"). So: (1) read the fee signal
  // through the reliable publicnode provider, and (2) FLOOR both fees at the 45/30 ceremony pattern on EVERY path
  // (normal, zero-basis, catch) — never return {} on Amoy. This is a SHARED helper → it fixes every admin send.
  var FEE_FLOOR_MAX = 45_000_000_000n; // 45 gwei — maxFeePerGas floor (ceremony ceiling)
  var FEE_FLOOR_TIP = 30_000_000_000n; // 30 gwei — maxPriorityFeePerGas floor (> Amoy's 25 gwei node minimum)
  function feeFloor(ceil, prio) {
    if (ceil < FEE_FLOOR_MAX) ceil = FEE_FLOOR_MAX;
    if (prio < FEE_FLOOR_TIP) prio = FEE_FLOOR_TIP;
    if (ceil < prio) ceil = prio; // maxFee must be ≥ priority
    return { maxFeePerGas: ceil, maxPriorityFeePerGas: prio };
  }
  function feeOverrides(provider) {
    // signal from publicnode (the wallet RPC lacks reliable priority-fee data); the `provider` arg is kept for
    // call-site compatibility but the fee READ no longer rides it — the FLOOR guarantees a valid tip regardless.
    return tamedProvider(PD_RPC)
      .getFeeData()
      .then(function (fd) {
        var gp = fd.gasPrice || 0n;
        var mf = fd.maxFeePerGas || 0n;
        var basis = gp > mf ? gp : mf; // whichever price signal is higher
        return feeFloor(basis * FEE_HEADROOM, basis * FEE_HEADROOM); // basis 0n → the explicit floor applies
      })
      .catch(function () {
        return feeFloor(0n, 0n); // fee read failed → the explicit 45/30 floor, NEVER {} (Amoy rejects sub-floor tips)
      });
  }

  // parse a checksummed address; returns normalized or null (invalid)
  function parseAddr(raw) {
    try {
      return ethersRef.getAddress(raw.trim());
    } catch (e) {
      return null;
    }
  }

  // ---------- GATE ----------
  function refreshGate() {
    var s = window.DYWallet.state;
    var banner = $("gate-banner");
    var c = cfg();
    setPanelsEnabled(false); // default locked; re-enabled only when proven owner
    // S-TORANA-1: run the TORANA gate FIRST so its dark/connect/minter state shows in ALL wallet states (accessNFT-unset
    // is a config fact independent of connection). refreshToranaPanel handles !accessNFT / !connected / !chainOk / minter.
    refreshToranaPanel();
    refreshPriceDeskGate(); // LEG2 — like TORANA: runs in ALL wallet states (dark on null address, connect prompt, owner check)

    if (!s.hasProvider) {
      banner.className = "banner warn";
      banner.innerHTML = "No wallet detected. This instrument needs a browser wallet (the owner key) to sign drops.";
      return;
    }
    if (!s.connected) {
      banner.className = "banner info";
      banner.innerHTML = 'Viewing is free; minting is owner-only, enforced by the chain. ' +
        '<button class="btn tiny" id="gate-connect">Connect wallet</button>';
      $("gate-connect").onclick = doConnect;
      return;
    }
    if (!s.chainOk) {
      banner.className = "banner warn";
      banner.innerHTML = "Wrong network. Cross to " + PLAYER.chain.name + " to drop. " +
        '<button class="btn tiny" id="gate-chain">Switch network</button>';
      $("gate-chain").onclick = function () {
        window.DYWallet.ensureChain().then(refreshGate).catch(function () {});
      };
      return;
    }
    // M-F2 Approve Buyers — INDEPENDENT gate (connected == sale.allowlistSigner), evaluated even if the NFT
    // collections are NOT CONFIGURED (the owner may approve buyers without touching the drop panels).
    refreshApprovePanel();

    // S-ADMIN-FIX1 — the money-stack panels (Coin Drops, Drop Desk, Grant Rewards) are governed by the connected
    // OWNER wallet on the right chain, NOT by the G12 NFT-address config (which only governs the Access/Wave drop
    // panels). Before this fix, drop/grant had NO enable path at all (only ever set false at line ~279) and coin was
    // reachable only inside the isConfigured() success branch — so the NOT-CONFIGURED short-circuit below left every
    // money button dead under a green "connected as owner" strip. The contract still enforces real authority on send.
    // RE-FREEZE Leg 2 (TORANA standard): the money-stack panels gate on ON-CHAIN authority read live from chain, NOT
    // the OWNER_WALLET constant (which now serves display/labels only — never a gate anywhere). Each panel is an
    // independent read; a failed/absent read leaves it DISABLED (never enable on a silent failure — busy-sentinel
    // principle). Coin Drops → connected holds the money-stack DYC; Drop Desk → DropDesk.dropSigner()==connected;
    // Grant → HolderStaking.isDebitor(connected). The contract still enforces real authority on every send.
    setPanelEnabled("drop", false);
    setPanelEnabled("grant", false);
    setPanelEnabled("coin", false);
    coinMeta = null;
    gateMoneyPanels(cfg(), s.address);

    if (!isConfigured(c)) {
      // Only the Access/Wave NFT drop panels need the G12 addresses; the money-stack panels above are already gated.
      banner.className = "banner info";
      banner.innerHTML = "<strong>Access/Wave drops:</strong> set the G12 AccessNFT + WaveCardNFT addresses in " +
        "Configuration to enable those two panels. Your money-stack panels (Approve, Registry, Coin, Drop Desk, " +
        "Grant) are governed by the connected wallet shown in the status strip above.";
      return;
    }

    // configured + connected + right chain → read owners, enable per-panel
    banner.className = "banner info";
    banner.innerHTML = "Reading ownership from chain…";
    withEthers()
      .then(function (ethers) {
        var provider = readProvider();
        var acc = new ethers.Contract(c.accessNFT, ACCESS_ABI, provider);
        var wav = new ethers.Contract(c.waveCardNFT, WAVE_ABI, provider);
        return Promise.all([
          acc.owner().catch(function () {
            return null;
          }),
          wav.owner().catch(function () {
            return null;
          }),
        ]);
      })
      .then(function (res) {
        owners.access = res[0];
        owners.wave = res[1];
        var me = s.address;
        var accMine = eq(owners.access, me);
        var wavMine = eq(owners.wave, me);
        renderGateTruth(me, accMine, wavMine);
        setPanelEnabled("access", accMine);
        setPanelEnabled("wave", wavMine);
        // Coin Drops is gated by the owner-wallet check above (S-ADMIN-FIX1), not NFT ownership — leave it as set.
        if ((accMine || wavMine) && !histLoaded) loadHistory();
      })
      .catch(function () {
        banner.className = "banner warn";
        banner.innerHTML = "Could not read owner() from the configured contracts. " +
          "Check the addresses in Configuration (are they on " + PLAYER.chain.name + "?).";
      });
  }

  function renderGateTruth(me, accMine, wavMine) {
    var banner = $("gate-banner");
    if (accMine && wavMine) {
      banner.className = "banner ok";
      banner.innerHTML = "You are the owner of both collections. Drops are enabled. " +
        '<span class="mono">' + shortAddr(me) + "</span>";
      return;
    }
    if (accMine || wavMine) {
      banner.className = "banner ok";
      banner.innerHTML = "You own " + (accMine ? "the Access collection" : "the Wave collection") +
        "; that panel is enabled. The other is owner-only.";
      return;
    }
    banner.className = "banner info";
    banner.innerHTML = "Connected as <span class='mono'>" + shortAddr(me) + "</span>, but not the owner of either " +
      "collection. Viewing is free; minting is owner-only, and the chain enforces it. " +
      "Owner (Access): <span class='mono'>" + (owners.access ? shortAddr(owners.access) : "—") + "</span>, " +
      "Owner (Wave): <span class='mono'>" + (owners.wave ? shortAddr(owners.wave) : "—") + "</span>.";
  }

  function setPanelsEnabled(on) {
    setPanelEnabled("access", on);
    setPanelEnabled("wave", on);
    setPanelEnabled("coin", on);
    setPanelEnabled("approve", on);
    setPanelEnabled("registry", on);
    setPanelEnabled("drop", on);
    setPanelEnabled("grant", on); // S-CLAIM-2B — grant panel gated like siblings (owner-connect)
  }
  function setPanelEnabled(kind, on) {
    var p = $("panel-" + kind);
    if (!p) return;
    p.querySelectorAll("input,textarea,select,button").forEach(function (n) {
      if (n.dataset.always === "1") return; // e.g. history refresh
      n.disabled = !on;
    });
    p.style.opacity = on ? "1" : "0.55";
  }

  function doConnect() {
    window.DYWallet
      .connect()
      .then(function (st) {
        if (!st.chainOk) return window.DYWallet.ensureChain();
      })
      .then(function () { renderStatusStrip(); refreshGate(); })
      .catch(function () { renderStatusStrip(); });
  }

  // S-ADMIN-CONNECT — pinned, always-visible status strip (independent of the per-collection gate banner). It is the
  // one control that is NEVER hidden: it always shows the connection state in plain words + a Connect button when
  // not connected, so the owner never faces dark panels with no explanation and no button.
  var OWNER_WALLET = "0xbab57f595b80318A79006Cd1f6Fde11464AaF86e"; // PROD_OWNER admin wallet (public)
  function renderStatusStrip() {
    var el = $("admin-status");
    if (!el) return;
    var s = window.DYWallet.state;
    if (!s.hasProvider) {
      el.className = "admin-status st-warn";
      el.textContent = "MetaMask not detected in this browser.";
      return;
    }
    if (!s.connected) {
      el.className = "admin-status st-info";
      el.innerHTML = "<span>Not connected.</span> <button id='status-connect'>Connect</button>";
      var b = $("status-connect");
      if (b) b.onclick = doConnect;
      return;
    }
    var me = s.address || "";
    if (me.toLowerCase() !== OWNER_WALLET.toLowerCase()) {
      el.className = "admin-status st-warn";
      el.innerHTML = "Connected as <span class='mono'>" + shortAddr(me) + "</span> — this is not the owner wallet. Panels stay locked.";
      return;
    }
    // owner connected — surface the network; wrong network is called out in red with the expected name.
    if (!s.chainOk) {
      el.className = "admin-status st-err";
      el.innerHTML = "Connected as owner <span class='mono'>" + shortAddr(me) + "</span> — <span class='st-red'>wrong network. Switch to "
        + PLAYER.chain.name + " (80002).</span>";
      return;
    }
    el.className = "admin-status st-ok";
    el.innerHTML = "Connected as owner <span class='mono'>" + shortAddr(me) + "</span>. Network: " + PLAYER.chain.name + ".";
  }

  // ---------- the DROP engine (shared by single + batch, both panels) ----------
  // collect addresses from a single field + a textarea; validate; return {valid:[], invalid:[]}
  function collectAddrs(singleVal, batchVal) {
    var lines = [];
    if (singleVal && singleVal.trim()) lines.push(singleVal);
    if (batchVal) {
      batchVal.split(/\r?\n/).forEach(function (l) {
        if (l.trim()) lines.push(l);
      });
    }
    var valid = [];
    var invalid = [];
    var seen = {};
    lines.forEach(function (l) {
      var a = parseAddr(l);
      if (!a) {
        invalid.push(l.trim());
      } else if (seen[a.toLowerCase()]) {
        /* dedupe silently */
      } else {
        seen[a.toLowerCase()] = true;
        valid.push(a);
      }
    });
    return { valid: valid, invalid: invalid };
  }

  // build the confirm box; on confirm run sequential drops
  function prepareDrop(kind, opts) {
    // opts: { confirmEl, resultsEl, singleEl, batchEl, cardId, cardLabel }
    return withEthers().then(function () {
      var set = collectAddrs(opts.singleEl.value, opts.batchEl.value);
      var confirm = opts.confirmEl;
      confirm.innerHTML = "";
      if (!set.valid.length) {
        confirm.appendChild(el("div", "q", "No valid addresses to drop to." +
          (set.invalid.length ? " (" + set.invalid.length + " invalid line(s).)" : "")));
        return;
      }
      var dest = kind === "wave" ? "wave card " + opts.cardLabel : "an Access NFT";
      var q = el("div", "q", "Drop " + dest + " to <b>" + set.valid.length + "</b> address" +
        (set.valid.length === 1 ? "" : "es") +
        (set.invalid.length ? " — <b>" + set.invalid.length + "</b> invalid line(s) will be skipped" : "") + ":");
      confirm.appendChild(q);
      var list = el("div", "mono");
      list.style.margin = "0.4rem 0 0.2rem";
      list.innerHTML = set.valid
        .map(function (a) {
          return a;
        })
        .join("<br>");
      confirm.appendChild(list);
      if (set.invalid.length) {
        var inv = el("div", null, "Skipped (invalid): " + set.invalid.map(function (x) {
          return "<span class='pill invalid'>" + (x.length > 18 ? x.slice(0, 18) + "…" : x) + "</span>";
        }).join(" "));
        inv.style.margin = "0.4rem 0";
        inv.style.fontSize = "0.78rem";
        confirm.appendChild(inv);
      }
      var actions = el("div", "row-actions");
      var go = el("button", "btn primary", "Sign &amp; send " + set.valid.length);
      var cancel = el("button", "btn", "Cancel");
      actions.appendChild(go);
      actions.appendChild(cancel);
      confirm.appendChild(actions);
      cancel.onclick = function () {
        confirm.innerHTML = "";
      };
      go.onclick = function () {
        go.disabled = true;
        cancel.disabled = true;
        runDrop(kind, opts.cardId, set.valid, opts.resultsEl).then(function () {
          confirm.innerHTML = "";
          histLoaded = false;
          loadHistory();
        });
      };
    });
  }

  function runDrop(kind, cardId, addrs, resultsEl) {
    var c = cfg();
    var provider = readProvider();
    return provider.getSigner().then(function (signer) {
      var addr = kind === "access" ? c.accessNFT : c.waveCardNFT;
      var abi = kind === "access" ? ACCESS_ABI : WAVE_ABI;
      var contract = new ethersRef.Contract(addr, abi, signer);

      // build the live results table
      resultsEl.innerHTML = "";
      var table = el("table", "grid");
      table.innerHTML = "<thead><tr><th>#</th><th>To</th><th>Status</th><th>Detail / Tx</th></tr></thead>";
      var tb = el("tbody");
      table.appendChild(tb);
      resultsEl.appendChild(table);
      var summary = el("div", "summary");
      resultsEl.appendChild(summary);

      var rows = addrs.map(function (a, i) {
        var tr = el("tr");
        tr.innerHTML = "<td>" + (i + 1) + "</td><td class='addr'>" + shortAddr(a) + "</td>" +
          "<td><span class='pill pending'>pending</span></td><td class='detail'>—</td>";
        tb.appendChild(tr);
        return tr;
      });

      // size fees once from live gas (scope 2) — a stale-priced send is what got dropped before
      return feeOverrides(provider).then(function (feeOv) {
        var ok = 0;
        var bad = 0;
        // sequential — a failed row never halts the batch
        var chain = Promise.resolve();
        addrs.forEach(function (a, i) {
          chain = chain.then(function () {
            return dropOne(contract, kind, a, cardId, feeOv).then(function (r) {
              var stCell = rows[i].querySelector(".pill").parentNode;
              var dCell = rows[i].querySelector(".detail");
              if (r.status === "success") {
                ok++;
                stCell.innerHTML = "<span class='pill success'>success</span>";
                dCell.innerHTML = "<a class='txlink' target='_blank' rel='noopener' href='" + txUrl(r.hash) + "'>" +
                  r.hash.slice(0, 10) + "… ↗</a>";
              } else {
                bad++;
                // r.status ∈ revert | dropped | fail — each has its own pill (no more silent PENDING)
                stCell.innerHTML = "<span class='pill " + r.status + "'>" + r.status + "</span>";
                dCell.innerHTML = r.detail +
                  (r.hash ? " · <a class='txlink' target='_blank' rel='noopener' href='" + txUrl(r.hash) +
                    "'>tx ↗</a>" : "");
              }
              summary.innerHTML = "Progress: <b class='good'>" + ok + "</b> success · <b class='bad'>" + bad +
                "</b> unresolved · " + (addrs.length - ok - bad) + " remaining.";
            });
          });
        });
        return chain.then(function () {
          summary.innerHTML = "Done: <b class='good'>" + ok + "</b> success · <b class='bad'>" + bad +
            "</b> failed/unconfirmed, of " + addrs.length + ".";
        });
      });
    });
  }

  // one mint: pre-simulate (surface revert reason without spending), then send with explicit gas.
  function dropOne(contract, kind, to, cardId, feeOv) {
    var sim = kind === "access" ? contract.mint.staticCall(to) : contract.mint.staticCall(to, cardId);
    return sim
      .then(function () {
        var ov = { gasLimit: kind === "access" ? ACCESS_MINT_GAS : WAVE_MINT_GAS };
        if (feeOv && feeOv.maxFeePerGas != null) {
          ov.maxFeePerGas = feeOv.maxFeePerGas;
          ov.maxPriorityFeePerGas = feeOv.maxPriorityFeePerGas;
        }
        var send = kind === "access" ? contract.mint(to, ov) : contract.mint(to, cardId, ov);
        // `send` resolves once the WALLET submits the tx; then wait for it to mine — BOUNDED (no PENDING-forever).
        return send.then(function (tx) {
          return tx
            .wait(WAIT_CONFIRMS, WAIT_TIMEOUT_MS)
            .then(function (rc) {
              if (rc && rc.status === 1) return { status: "success", hash: tx.hash };
              return { status: "revert", detail: "reverted on-chain", hash: tx.hash }; // mined, status 0
            })
            .catch(function (we) {
              // wait-phase: replaced/cancelled, or timed out (never mined). MUST resolve, never hang on PENDING.
              if (we && we.code === "TRANSACTION_REPLACED") {
                if (we.receipt && we.receipt.status === 1) {
                  return { status: "success", hash: (we.replacement && we.replacement.hash) || tx.hash };
                }
                if (we.reason === "cancelled") return { status: "dropped", detail: "cancelled in wallet", hash: tx.hash };
                return {
                  status: "dropped",
                  detail: "replaced (" + (we.reason || "repriced") + ") — check wallet",
                  hash: (we.replacement && we.replacement.hash) || tx.hash,
                };
              }
              return {
                status: "dropped",
                detail: "not mined in " + Math.round(WAIT_TIMEOUT_MS / 1000) +
                  "s (gas too low or dropped) — speed up / resubmit in your wallet",
                hash: tx.hash,
              };
            });
        });
      })
      .catch(function (e) {
        // pre-sim staticCall revert (AlreadyHolds etc.) or the wallet rejected the signature
        if (e && e.code === "ACTION_REJECTED") return { status: "fail", detail: "signature rejected in wallet" };
        return { status: "revert", detail: decodeErr(e), hash: e && e.transactionHash };
      });
  }

  // ---------- COIN DROPS (S9) — plain ERC-20 DYC sends from the connected admin wallet ----------
  function trimNum(s) {
    // trim trailing zeros from a formatUnits string for display (150.0 -> 150, 1.500 -> 1.5)
    if (s.indexOf(".") < 0) return s;
    return s.replace(/\.?0+$/, "");
  }

  // RE-FREEZE Leg 2 — gate the three money-stack panels on LIVE on-chain authority (replaces the OWNER_WALLET-constant
  // gate). Three independent reads; each defaults the panel OFF and only enables on a positive chain answer. A read
  // failure/absent-config leaves the panel disabled — we never enable on a silent failure (busy-sentinel principle).
  // DROP_DESK_ABI / STAKE_GRANT_ABI / COIN_ABI are module-level and assigned before this ever runs (call-time only).
  function gateMoneyPanels(c, me) {
    if (!me) return;
    // Coin Drops (3): the real precondition to a DYC transfer is HOLDING the money-stack DYC — a live balance read.
    // balance 0 or an unreadable token → off. On a positive balance, loadCoinMeta fills decimals/symbol/balance.
    if (c.dycoin) {
      withEthers().then(function () {
        return new ethersRef.Contract(c.dycoin, COIN_ABI, readProvider()).balanceOf(me);
      }).then(function (bal) {
        if (bal && bal > 0n) { setPanelEnabled("coin", true); withEthers().then(loadCoinMeta).catch(function () {}); }
        else { setPanelEnabled("coin", false); coinMeta = null; }
      }).catch(function () { setPanelEnabled("coin", false); coinMeta = null; });
    }
    // Drop Desk (8): DropDesk.dropSigner() == connected — the on-chain EIP-712 coupon-signing authority.
    if (c.dropDesk) {
      withEthers().then(function () {
        return new ethersRef.Contract(c.dropDesk, DROP_DESK_ABI, readProvider()).dropSigner();
      }).then(function (signer) {
        setPanelEnabled("drop", eq(signer, me));
      }).catch(function () { setPanelEnabled("drop", false); });
    }
    // Grant (9): HolderStaking.isDebitor(connected) — the on-chain grant authority (owner registers it via the timelock).
    if (c.holderStaking) {
      withEthers().then(function () {
        return new ethersRef.Contract(c.holderStaking, STAKE_GRANT_ABI, readProvider()).isDebitor(me);
      }).then(function (ok) {
        setPanelEnabled("grant", !!ok);
      }).catch(function () { setPanelEnabled("grant", false); });
    }
  }

  // read the DYC token's decimals/symbol/balance once the panel is enabled (never hardcode decimals blindly)
  function loadCoinMeta() {
    var c = cfg();
    var me = window.DYWallet.state.address;
    var bal = $("coin-balance");
    var token = new ethersRef.Contract(c.dycoin, COIN_ABI, readProvider());
    return Promise.all([
      token.decimals().catch(function () { return null; }),
      token.symbol().catch(function () { return "DYC"; }),
      token.balanceOf(me).catch(function () { return null; }),
    ]).then(function (r) {
      if (r[0] == null || r[2] == null) {
        // token unreadable at this address → keep the panel disabled rather than risk a wrong-decimals send
        coinMeta = null;
        setPanelEnabled("coin", false);
        if (bal) bal.innerHTML = "<span class='bad'>Could not read a DYC token at " + shortAddr(c.dycoin) +
          " — check the DYC address in Configuration.</span>";
        return;
      }
      coinMeta = { decimals: Number(r[0]), symbol: r[1] || "DYC", balance: r[2] };
      if (bal) bal.innerHTML = "Your balance: <b>" + trimNum(ethersRef.formatUnits(r[2], coinMeta.decimals)) +
        " " + coinMeta.symbol + "</b>";
    });
  }

  function refreshCoinBalance() {
    if (!coinMeta) return loadCoinMeta();
    var c = cfg();
    var me = window.DYWallet.state.address;
    var token = new ethersRef.Contract(c.dycoin, COIN_ABI, readProvider());
    return token.balanceOf(me).then(function (b) {
      coinMeta.balance = b;
      var bal = $("coin-balance");
      if (bal) bal.innerHTML = "Your balance: <b>" + trimNum(ethersRef.formatUnits(b, coinMeta.decimals)) +
        " " + coinMeta.symbol + "</b>";
    }).catch(function () {});
  }

  // parse a human amount ("150", "1.5") to wei via coinMeta.decimals; null if malformed or <= 0
  function parseAmt(raw) {
    var s = (raw == null ? "" : String(raw)).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    try {
      var wei = ethersRef.parseUnits(s, coinMeta.decimals);
      if (wei <= 0n) return null;
      return { wei: wei, human: trimNum(s) };
    } catch (e) {
      return null;
    }
  }

  // collect sends from the single fields + the CSV batch; validate every one, tag bad lines with numbers
  function collectSends(singleAddr, singleAmt, batchVal) {
    var rows = [];
    if ((singleAddr && singleAddr.trim()) || (singleAmt && singleAmt.trim())) {
      rows.push({ n: "single", rawAddr: singleAddr, rawAmt: singleAmt, raw: (singleAddr || "") + ", " + (singleAmt || "") });
    }
    if (batchVal) {
      batchVal.split(/\r?\n/).forEach(function (l, i) {
        if (!l.trim()) return;
        var parts = l.split(/[,\t]/);
        rows.push({ n: i + 1, rawAddr: parts[0], rawAmt: parts[1], raw: l.trim() });
      });
    }
    var valid = [];
    var invalid = [];
    rows.forEach(function (r) {
      var a = r.rawAddr != null ? parseAddr(r.rawAddr) : null;
      var amt = parseAmt(r.rawAmt);
      if (!a || !amt) {
        var why = !a && !amt ? "bad address & amount" : !a ? "bad address" : "bad amount";
        invalid.push({ n: r.n, text: r.raw, why: why });
      } else {
        valid.push({ to: a, wei: amt.wei, human: amt.human });
      }
    });
    return { valid: valid, invalid: invalid };
  }

  // build the coin confirm box: block on ANY bad line (money — stricter than the NFT skip); show total + balance
  function prepareCoinDrop() {
    return withEthers().then(function () {
      var confirm = $("coin-confirm");
      confirm.innerHTML = "";
      if (!coinMeta) {
        confirm.appendChild(el("div", "q", "DYC token not read yet — refresh balance or check the address in Configuration."));
        return;
      }
      var set = collectSends($("coin-addr").value, $("coin-amt").value, $("coin-batch").value);

      // BLOCK: every line must be clean before any send is offered
      if (set.invalid.length) {
        confirm.appendChild(el("div", "q", "<b>" + set.invalid.length + "</b> line(s) need fixing — the batch is blocked " +
          "until every line is clean (fix or remove them):"));
        var ul = el("div", "mono");
        ul.style.margin = "0.4rem 0";
        ul.innerHTML = set.invalid.map(function (x) {
          var t = x.text.length > 42 ? x.text.slice(0, 42) + "…" : x.text;
          return "line " + x.n + " — <span class='pill invalid'>" + x.why + "</span> " + t;
        }).join("<br>");
        confirm.appendChild(ul);
        return;
      }
      if (!set.valid.length) {
        confirm.appendChild(el("div", "q", "Nothing to send — enter a recipient + amount, or batch lines."));
        return;
      }

      var total = set.valid.reduce(function (s, r) { return s + r.wei; }, 0n);
      var totalHuman = trimNum(ethersRef.formatUnits(total, coinMeta.decimals));
      var balWei = coinMeta.balance != null ? coinMeta.balance : 0n;
      var balHuman = trimNum(ethersRef.formatUnits(balWei, coinMeta.decimals));

      confirm.appendChild(el("div", "q", "Send DYC to <b>" + set.valid.length + "</b> address" +
        (set.valid.length === 1 ? "" : "es") + " — total <b>" + totalHuman + " " + coinMeta.symbol + "</b>:"));
      var list = el("div", "mono");
      list.style.margin = "0.4rem 0";
      list.innerHTML = set.valid.map(function (r) {
        return "Send <b>" + r.human + " " + coinMeta.symbol + "</b> to " + r.to +
          "<br><span style='color:var(--gold-aged)'>&nbsp;&nbsp;raw: " + r.wei.toString() + " wei</span>";
      }).join("<br>");
      confirm.appendChild(list);

      var balLine = el("div", null, "Your balance: <b>" + balHuman + " " + coinMeta.symbol + "</b>");
      balLine.style.margin = "0.35rem 0";
      balLine.style.fontSize = "0.82rem";
      confirm.appendChild(balLine);

      // insufficient balance blocks BEFORE any pre-sim/send
      if (total > balWei) {
        confirm.appendChild(el("div", "q", "<span class='bad'>Insufficient balance</span> — need " + totalHuman +
          ", have " + balHuman + " " + coinMeta.symbol + ". Reduce the amount or top up the wallet."));
        return;
      }

      var actions = el("div", "row-actions");
      var go = el("button", "btn primary", "Sign &amp; send " + set.valid.length);
      var cancel = el("button", "btn", "Cancel");
      actions.appendChild(go);
      actions.appendChild(cancel);
      confirm.appendChild(actions);
      cancel.onclick = function () {
        confirm.innerHTML = "";
      };
      go.onclick = function () {
        go.disabled = true;
        cancel.disabled = true;
        runCoinDrop(set.valid, $("coin-results")).then(function () {
          confirm.innerHTML = "";
          refreshCoinBalance();
        });
      };
    });
  }

  function runCoinDrop(sends, resultsEl) {
    var c = cfg();
    var provider = readProvider();
    return provider.getSigner().then(function (signer) {
      var token = new ethersRef.Contract(c.dycoin, COIN_ABI, signer);

      resultsEl.innerHTML = "";
      var table = el("table", "grid");
      table.innerHTML = "<thead><tr><th>#</th><th>To</th><th>Amount</th><th>Status</th><th>Detail / Tx</th></tr></thead>";
      var tb = el("tbody");
      table.appendChild(tb);
      resultsEl.appendChild(table);
      var summary = el("div", "summary");
      resultsEl.appendChild(summary);

      var rows = sends.map(function (r, i) {
        var tr = el("tr");
        tr.innerHTML = "<td>" + (i + 1) + "</td><td class='addr'>" + shortAddr(r.to) + "</td>" +
          "<td>" + r.human + " " + coinMeta.symbol + "</td>" +
          "<td><span class='pill pending'>pending</span></td><td class='detail'>—</td>";
        tb.appendChild(tr);
        return tr;
      });

      return feeOverrides(provider).then(function (feeOv) {
        var ok = 0;
        var bad = 0;
        var chain = Promise.resolve();
        sends.forEach(function (r, i) {
          chain = chain.then(function () {
            return sendCoinOne(token, r.to, r.wei, feeOv).then(function (res) {
              var stCell = rows[i].querySelector(".pill").parentNode;
              var dCell = rows[i].querySelector(".detail");
              if (res.status === "success") {
                ok++;
                stCell.innerHTML = "<span class='pill success'>success</span>";
                dCell.innerHTML = "<a class='txlink' target='_blank' rel='noopener' href='" + txUrl(res.hash) + "'>" +
                  res.hash.slice(0, 10) + "… ↗</a>";
              } else {
                bad++;
                stCell.innerHTML = "<span class='pill " + res.status + "'>" + res.status + "</span>";
                dCell.innerHTML = res.detail +
                  (res.hash ? " · <a class='txlink' target='_blank' rel='noopener' href='" + txUrl(res.hash) +
                    "'>tx ↗</a>" : "");
              }
              summary.innerHTML = "Progress: <b class='good'>" + ok + "</b> success · <b class='bad'>" + bad +
                "</b> unresolved · " + (sends.length - ok - bad) + " remaining.";
            });
          });
        });
        return chain.then(function () {
          summary.innerHTML = "Done: <b class='good'>" + ok + "</b> success · <b class='bad'>" + bad +
            "</b> failed/unconfirmed, of " + sends.length + ".";
        });
      });
    });
  }

  // one send: pre-simulate the transfer (surfaces revert without spending), then send with explicit gas.
  function sendCoinOne(token, to, wei, feeOv) {
    return token.transfer.staticCall(to, wei)
      .then(function () {
        var ov = { gasLimit: COIN_XFER_GAS };
        if (feeOv && feeOv.maxFeePerGas != null) {
          ov.maxFeePerGas = feeOv.maxFeePerGas;
          ov.maxPriorityFeePerGas = feeOv.maxPriorityFeePerGas;
        }
        return token.transfer(to, wei, ov).then(function (tx) {
          return tx
            .wait(WAIT_CONFIRMS, WAIT_TIMEOUT_MS)
            .then(function (rc) {
              if (rc && rc.status === 1) return { status: "success", hash: tx.hash };
              return { status: "revert", detail: "reverted on-chain", hash: tx.hash };
            })
            .catch(function (we) {
              if (we && we.code === "TRANSACTION_REPLACED") {
                if (we.receipt && we.receipt.status === 1) {
                  return { status: "success", hash: (we.replacement && we.replacement.hash) || tx.hash };
                }
                if (we.reason === "cancelled") return { status: "dropped", detail: "cancelled in wallet", hash: tx.hash };
                return {
                  status: "dropped",
                  detail: "replaced (" + (we.reason || "repriced") + ") — check wallet",
                  hash: (we.replacement && we.replacement.hash) || tx.hash,
                };
              }
              return {
                status: "dropped",
                detail: "not mined in " + Math.round(WAIT_TIMEOUT_MS / 1000) +
                  "s (gas too low or dropped) — speed up / resubmit in your wallet",
                hash: tx.hash,
              };
            });
        });
      })
      .catch(function (e) {
        if (e && e.code === "ACTION_REJECTED") return { status: "fail", detail: "signature rejected in wallet" };
        return { status: "revert", detail: decodeErr(e), hash: e && e.transactionHash };
      });
  }

  // ---------- HISTORY (chunked getLogs, newest-first) ----------
  // detect an archive/range rejection so we tell the owner to set a Read RPC URL (vs a generic "could not read")
  function isArchiveError(e) {
    if (e && e.__archive) return true; // S-LEDGER-FIX: historyProvider exhausted every getLogs endpoint (all pruned/capped)
    var s = "";
    try {
      s = JSON.stringify(e && (e.info || e.error || {})) + " " + ((e && e.message) || "") + " " + ((e && e.shortMessage) || "");
    } catch (x) {
      s = (e && e.message) || "";
    }
    s = s.toLowerCase();
    return (
      s.indexOf("archive") >= 0 ||
      s.indexOf("personal token") >= 0 ||
      s.indexOf("block range") >= 0 ||
      s.indexOf("range is too") >= 0 ||
      s.indexOf("-32602") >= 0 ||
      s.indexOf("-32701") >= 0 || // S-LEDGER-FIX: "History has been pruned for this block" (non-archive node, deep history)
      s.indexOf("pruned") >= 0 || // S-LEDGER-FIX: same, message-worded
      s.indexOf("coalesce") >= 0 || // S-LEDGER-FIX: the ethers-v6 wrap of an undigestable getLogs error → route to the plain-words message, never surface it raw
      s.indexOf("too many") >= 0 ||
      (s.indexOf("range") >= 0 && s.indexOf("limit") >= 0)
    );
  }

  function loadHistory() {
    var c = cfg();
    var status = $("hist-status");
    var body = $("hist-body");
    if (!isConfigured(c)) {
      status.textContent = "Not configured.";
      return;
    }
    // S-LEDGER-FIX-3: bounded (75s deadline) + voiced (live chunk counter) + settled guard, matching the ledger panel.
    var settled = false;
    function progress(msg) { if (!settled) status.textContent = msg; }
    function finishHtml(html) { settled = true; status.innerHTML = html; }
    function finishText(msg) { settled = true; status.textContent = msg; }
    progress("Scanning full history (archive RPC)…");
    body.innerHTML = "";
    var deadlineAt = Date.now() + SCAN_DEADLINE_MS;
    // S-LEDGER-FIX: run a chunked mint scan over a READ-ONLY provider, then attach block times → resolve rows.
    function scanOn(ethers, provider, from) {
      var access = new ethers.Contract(c.accessNFT, ACCESS_ABI, provider);
      var wave = new ethers.Contract(c.waveCardNFT, WAVE_ABI, provider);
      return provider.getBlockNumber().then(function (latest) {
        var f = from != null ? from : Math.max(0, latest - RECENT_WINDOW);
        return scanChunked(ethers, access, wave, f, latest, function (label) { progress("Scanning history… " + label); }, deadlineAt).then(function (evs) {
          return attachTimes(provider, evs);
        });
      });
    }
    var scan = withEthers()
      .then(function (ethers) {
        // S-LEDGER-FIX: deep history rides the shared ARCHIVE-capable provider (drpc-first, TAMED) — NOT the Alchemy readRpcUrl
        // (10-block getLogs cap) and NOT the wallet's pruned node.
        return historyProvider(c.accessNFT).then(function (h) {
          return scanOn(ethers, h.provider, c.deployBlock || 0).then(function (rows) {
            return { rows: rows, mode: "archive", fellBack: h.fellBack };
          });
        }).catch(function (e) {
          if (e && e.__deadline) throw e; // S-LEDGER-FIX-3: deadline → busy message, do NOT drop to the recent window
          if (!isArchiveError(e)) throw e; // a genuine (non-archive) error → surface it below
          // LAST RESORT — every history endpoint failed: recent window on the wallet node (dodges archive gating).
          return scanOn(ethers, readProvider(), null).then(function (rows) {
            return { rows: rows, mode: "recent", fellBack: false };
          });
        });
      });
    raceDeadline(scan, deadlineAt)
      .then(function (res) {
        histLoaded = true;
        var rows = res.rows;
        rows.sort(function (a, b) {
          return b.block - a.block || b.logIndex - a.logIndex;
        });
        renderHistory(rows);
        if (res.mode === "archive") {
          finishHtml(
            (rows.length ? rows.length + " mint event(s) (full history)." : "No mints yet.") +
            (res.fellBack ? " <span style='color:var(--ember)'>Configured Read RPC URL couldn't serve deep history — used drpc.</span>" : "")
          );
        } else {
          finishHtml(
            (rows.length ? rows.length + " recent mint(s). " : "No mints in the last " + RECENT_WINDOW + " blocks. ") +
            "<span style='color:var(--ember)'>Recent only — no archive RPC reachable; set Read RPC URL in Configuration for full history.</span>"
          );
        }
      })
      .catch(function (e) {
        histLoaded = false;
        // S-LEDGER-FIX-3: deadline + rate-limit FIRST (busy). Then archive (the "too many" overlap → order prevents shadowing). Else generic.
        if ((e && e.__deadline) || isRateLimited(e)) {
          finishHtml("<span style='color:var(--ember)'>The public archive RPC is busy — retry in a minute, or set a dedicated Read RPC URL in Configuration.</span>");
        } else if (isArchiveError(e)) {
          finishHtml("<span style='color:var(--ember)'>History needs an archive RPC — set Read RPC URL in Configuration.</span>");
        } else {
          finishText("Could not read events (" + ((e && e.shortMessage) || "RPC error") + ").");
        }
      });
  }

  function scanChunked(ethers, access, wave, from, latest, onProgress, deadlineAt) {
    var out = [];
    var start = from;
    var total = Math.max(1, Math.ceil((latest - from + 1) / LOG_CHUNK)), idx = 0; // S-LEDGER-FIX-3: for the progress voice
    function step() {
      if (start > latest) return Promise.resolve(out);
      if (deadlineAt && Date.now() > deadlineAt) { var de = new Error("scan deadline"); de.__deadline = true; return Promise.reject(de); } // S-LEDGER-FIX-3: stop issuing chunks past the deadline
      var end = Math.min(start + LOG_CHUNK - 1, latest);
      idx++;
      var label = "chunk " + idx + "/" + total;
      if (onProgress) onProgress(label);
      // S-LEDGER-FIX-2: retry-with-backoff on drpc's browser-origin rate-limits (the 120ms throttle below already spaces chunks).
      return withRetry(function () {
        return Promise.all([
          access.queryFilter(access.filters.Transfer(ethers.ZeroAddress, null), start, end),
          wave.queryFilter(wave.filters.CardMinted(), start, end),
        ]);
      }, function () { if (onProgress) onProgress(label + ", retrying"); }).then(function (res) {
        res[0].forEach(function (ev) {
          out.push({ block: ev.blockNumber, logIndex: ev.index, type: "Access", to: ev.args.to, cardId: null, hash: ev.transactionHash });
        });
        res[1].forEach(function (ev) {
          out.push({ block: ev.blockNumber, logIndex: ev.index, type: "Wave", to: ev.args.to, cardId: Number(ev.args.cardId), hash: ev.transactionHash });
        });
        start = end + 1;
        return sleep(120).then(step); // gentle on the public RPC
      });
    }
    return step();
  }

  function attachTimes(provider, rows) {
    var blocks = {};
    rows.forEach(function (r) {
      blocks[r.block] = true;
    });
    return Promise.all(
      Object.keys(blocks).map(function (b) {
        return provider
          .getBlock(Number(b))
          .then(function (blk) {
            blocks[b] = blk ? Number(blk.timestamp) : null;
          })
          .catch(function () {
            blocks[b] = null;
          });
      })
    ).then(function () {
      rows.forEach(function (r) {
        r.ts = blocks[r.block];
      });
      return rows;
    });
  }

  function fmtTime(ts) {
    if (!ts) return "—";
    var d = new Date(ts * 1000);
    return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
  }

  function cardName(cardId) {
    var c = cfg();
    for (var i = 0; i < c.waveCards.length; i++) {
      if (Number(c.waveCards[i].cardId) === Number(cardId)) return c.waveCards[i].name;
    }
    return "#" + cardId;
  }

  function renderHistory(rows) {
    var body = $("hist-body");
    body.innerHTML = "";
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.innerHTML =
        "<td>" + fmtTime(r.ts) + "</td>" +
        "<td>" + r.type + "</td>" +
        "<td class='addr'>" + shortAddr(r.to) + "</td>" +
        "<td>" + (r.type === "Wave" ? cardName(r.cardId) + " <span style='color:var(--gold-aged)'>#" + r.cardId + "</span>" : "—") + "</td>" +
        "<td><a class='txlink' target='_blank' rel='noopener' href='" + txUrl(r.hash) + "'>" + r.hash.slice(0, 10) + "… ↗</a></td>";
      body.appendChild(tr);
    });
  }

  // ---------- WAVE PICKER ----------
  function buildPicker() {
    var sel = $("wave-pick");
    var c = cfg();
    sel.innerHTML = "";
    if (!c.waveCards.length) {
      sel.innerHTML = "<option value=''>— wave metadata NOT CONFIGURED —</option>";
      sel.disabled = true;
      return;
    }
    // group by faction
    var groups = { devas: [], asuras: [], vanaras: [], nagas: [], other: [] };
    c.waveCards.forEach(function (w) {
      (groups[w.faction] || groups.other).push(w);
    });
    Object.keys(groups).forEach(function (f) {
      if (!groups[f].length) return;
      var og = el("optgroup");
      og.label = f.charAt(0).toUpperCase() + f.slice(1);
      groups[f]
        .sort(function (a, b) {
          return Number(a.cardId) - Number(b.cardId);
        })
        .forEach(function (w) {
          var o = el("option");
          o.value = w.cardId;
          // LEG1.5: a "held" seat (e.g. The Setu Stones, reserved for wave-1.1) is shown but NOT droppable.
          if (w.status === "held") {
            o.textContent = w.name + "  (#" + w.cardId + ") — HELD";
            o.disabled = true;
          } else {
            o.textContent = w.name + "  (#" + w.cardId + ")";
          }
          og.appendChild(o);
        });
      sel.appendChild(og);
    });
  }

  // ---------- CONFIGURATION panel (localStorage override) ----------
  function fillCfgForm() {
    var c = cfg();
    $("cfg-access").value = c.accessNFT || "";
    $("cfg-wave").value = c.waveCardNFT || "";
    if ($("cfg-dyc")) $("cfg-dyc").value = c.dycoin || ""; // S9
    if ($("cfg-sale")) $("cfg-sale").value = c.dycoinSale || ""; // M-F2
    if ($("cfg-vault")) $("cfg-vault").value = c.vestingVault || ""; // M-F3
    if ($("cfg-staking")) $("cfg-staking").value = c.holderStaking || ""; // M-F3
    if ($("cfg-dropdesk")) $("cfg-dropdesk").value = c.dropDesk || ""; // M-F6
    $("cfg-deploy").value = c.deployBlock || 0;
    $("cfg-readrpc").value = c.readRpcUrl || "";
    if ($("cfg-roburl")) $("cfg-roburl").value = c.robotUrl || ""; // S-ROBOT-COUPON-1
    if ($("cfg-robtoken")) $("cfg-robtoken").value = c.robotToken || "";
    if ($("cfg-torana-definite")) $("cfg-torana-definite").value = c.toranaDefiniteUsd; // S-TORANA-1
    if ($("cfg-torana-discretion")) $("cfg-torana-discretion").value = c.toranaDiscretionUsd;
    $("cfg-cards").value = c.waveCards.length ? JSON.stringify(c.waveCards, null, 2) : "";
    // (4) persistent readout: what the picker actually got, always visible in the config panel
    var n = c.waveCards.length;
    var src = $("cfg-source");
    src.textContent = "Active source: " + c.source + " · wave cards loaded: " + (n || "NONE — picker disabled");
    src.style.color = n ? "var(--gold-aged)" : "var(--ember)";
  }

  // (1) Tolerant JSON: copy-paste from a doc/chat brings smart quotes + trailing commas.
  function sanitizeJson(s) {
    return s
      .replace(/[“”]/g, '"') // “ ” curly double quotes -> "
      .replace(/[‘’]/g, "'") // ‘ ’ curly single quotes -> '
      .replace(/,(\s*[}\]])/g, "$1") // trailing comma before } or ]
      .trim();
  }

  function warn(msg, txt) {
    msg.textContent = txt;
    msg.style.color = "var(--ember)";
  }

  function saveCfg() {
    var msg = $("cfg-msg");
    withEthers().then(function () {
      var a = $("cfg-access").value.trim();
      var w = $("cfg-wave").value.trim();
      var d = $("cfg-dyc") ? $("cfg-dyc").value.trim() : ""; // S9 DYC token
      var sl = $("cfg-sale") ? $("cfg-sale").value.trim() : ""; // M-F2 DYCoinSale
      var vv = $("cfg-vault") ? $("cfg-vault").value.trim() : ""; // M-F3 VestingVault
      var hs = $("cfg-staking") ? $("cfg-staking").value.trim() : ""; // M-F3 HolderStaking
      var dk = $("cfg-dropdesk") ? $("cfg-dropdesk").value.trim() : ""; // M-F6 DropDesk
      var pa = a ? parseAddr(a) : null;
      var pw = w ? parseAddr(w) : null;
      var pd = d ? parseAddr(d) : null;
      var ps = sl ? parseAddr(sl) : null;
      var pvv = vv ? parseAddr(vv) : null;
      var phs = hs ? parseAddr(hs) : null;
      var pdd = dk ? parseAddr(dk) : null;
      if (a && !pa) return warn(msg, "AccessNFT address is not a valid checksummed address. Nothing saved.");
      if (w && !pw) return warn(msg, "WaveCardNFT address is not a valid checksummed address. Nothing saved.");
      if (d && !pd) return warn(msg, "DYC token address is not a valid checksummed address. Nothing saved.");
      if (sl && !ps) return warn(msg, "DYCoinSale address is not a valid checksummed address. Nothing saved.");
      if (vv && !pvv) return warn(msg, "VestingVault address is not a valid checksummed address. Nothing saved.");
      if (hs && !phs) return warn(msg, "HolderStaking address is not a valid checksummed address. Nothing saved.");
      if (dk && !pdd) return warn(msg, "DropDesk address is not a valid checksummed address. Nothing saved.");

      var rawCards = $("cfg-cards").value.trim();
      var cards;
      if (rawCards) {
        try {
          cards = JSON.parse(sanitizeJson(rawCards));
        } catch (e) {
          return warn(msg, "Wave cards are not valid JSON (check quotes/commas). Nothing saved.");
        }
        if (!Array.isArray(cards)) return warn(msg, "Wave cards must be a JSON array [ … ]. Nothing saved.");
        var factions = { devas: 1, asuras: 1, vanaras: 1, nagas: 1 };
        for (var i = 0; i < cards.length; i++) {
          var cd = cards[i];
          if (cd == null || cd.cardId == null || isNaN(Number(cd.cardId)) || !cd.name || !factions[cd.faction]) {
            return warn(
              msg,
              "Card #" + (i + 1) + " needs {cardId:number, name, faction ∈ devas|asuras|vanaras|nagas}. Nothing saved."
            );
          }
          cd.cardId = Number(cd.cardId);
        }
      } else {
        // (2 — RULED) empty textarea: PRESERVE the previously-stored wave cards; never blank a prior valid list.
        cards = override().waveCards || [];
      }

      var readRpc = $("cfg-readrpc").value.trim();
      if (readRpc && !/^https?:\/\//i.test(readRpc)) {
        return warn(msg, "Read RPC URL must be an http(s) URL. Nothing saved.");
      }
      var robUrl = $("cfg-roburl") ? $("cfg-roburl").value.trim() : ""; // S-ROBOT-COUPON-1
      if (robUrl && !/^https?:\/\//i.test(robUrl)) {
        return warn(msg, "Robot base URL must be an http(s) URL. Nothing saved.");
      }
      var robTok = $("cfg-robtoken") ? $("cfg-robtoken").value.trim() : "";
      // S-TORANA-1: two USD bands — positive numbers, definite ≥ discretion floor
      var tDef = Number($("cfg-torana-definite") ? $("cfg-torana-definite").value : "");
      var tDis = Number($("cfg-torana-discretion") ? $("cfg-torana-discretion").value : "");
      if (!(Number.isFinite(tDef) && tDef > 0) || !(Number.isFinite(tDis) && tDis > 0)) {
        return warn(msg, "TORANA bands must be positive USD numbers. Nothing saved.");
      }
      if (tDef < tDis) {
        return warn(msg, "TORANA definite band must be ≥ the discretion floor. Nothing saved.");
      }
      var o = {
        accessNFT: pa,
        waveCardNFT: pw,
        dycoin: pd, // S9
        dycoinSale: ps, // M-F2
        vestingVault: pvv, // M-F3
        holderStaking: phs, // M-F3
        dropDesk: pdd, // M-F6
        deployBlock: Number($("cfg-deploy").value) || 0,
        readRpcUrl: readRpc || null,
        robotUrl: robUrl || null, // S-ROBOT-COUPON-1 — robot base URL
        robotToken: robTok || null, // S-ROBOT-COUPON-1 — admin bearer, localStorage-only
        toranaDefiniteUsd: tDef, // S-TORANA-1
        toranaDiscretionUsd: tDis,
        waveCards: cards,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(o));

      // (3) accurate per-save message; (2) persistent notice when the stored list is empty
      var n = cards.length;
      if (n > 0) {
        msg.textContent = "Saved · " + n + " wave card" + (n === 1 ? "" : "s") + " loaded. Nothing was committed.";
        msg.style.color = "var(--flame-core)";
      } else {
        warn(msg, "Saved addresses · WAVE CARDS NOT SET — the picker stays disabled. Paste the wave-card JSON and Save again.");
      }
      histLoaded = false;
      buildPicker();
      fillCfgForm();
      refreshGate();
    });
  }

  function clearCfg() {
    localStorage.removeItem(LS_KEY);
    $("cfg-msg").textContent = "Cleared. Reverted to admin-config.js.";
    $("cfg-msg").style.color = "var(--flame-core)";
    histLoaded = false;
    buildPicker();
    fillCfgForm();
    refreshGate();
  }

  // ---------- APPROVE BUYERS (M-F2) — EIP-712 allowlist vouchers, no-server ----------
  var SALE_ABI = [
    "function allowlistSigner() view returns (address)",
    "event Purchased(address indexed buyer, uint8 round, address asset, uint256 paid, uint256 usdE18, uint256 dycOut, uint256 liquid)",
  ];
  var REG_VAULT_ABI = ["function vestedBalanceOf(address) view returns (uint256)"];
  var REG_STAKE_ABI = [
    "function positionCount(address) view returns (uint256)",
    "function getPosition(address,uint256) view returns (tuple(uint256 principal,uint256 startTime,uint256 rewardClaimed,bool staked,bool principalReleased))",
    "function pendingRoi(address) view returns (uint256)",
  ];
  // staked = Σ live position principal (matches the M-F1 dashboard; vested-registered ROI positions are NOT
  // counted by stakedPrincipalOf, so we sum positions the same way the holder's own dashboard does)
  function stakedOf(stake, wallet) {
    return stake.positionCount(wallet).then(function (n) {
      var reads = [];
      for (var i = 0; i < Number(n); i++) reads.push(stake.getPosition(wallet, i));
      return Promise.all(reads).then(function (ps) {
        var total = 0n;
        ps.forEach(function (p) { if (!p.principalReleased) total += p.principal; });
        return total;
      });
    });
  }
  var registryRows = []; // last-loaded rows, for CSV export
  var approvedList = []; // merged {wallet, sig} (existing allowlist.json + this session's signs)
  var saleSigner = null; // last-read sale.allowlistSigner()

  function refreshApprovePanel() {
    var st = $("approve-status");
    var c = cfg();
    setPanelEnabled("approve", false);
    setPanelEnabled("registry", false);
    var rst = $("registry-status");
    if (!c.dycoinSale) {
      if (st) st.innerHTML = "<span class='mono'>DYCoinSale NOT CONFIGURED</span> — set the sale address in Configuration to approve buyers.";
      if (rst) rst.innerHTML = "<span class='mono'>DYCoinSale NOT CONFIGURED</span> — set the sale address to read the registry.";
      return;
    }
    withEthers().then(function () {
      var sale = new ethersRef.Contract(c.dycoinSale, SALE_ABI, readProvider());
      return sale.allowlistSigner();
    }).then(function (signer) {
      saleSigner = signer;
      var me = window.DYWallet.state.address;
      var isSigner = eq(signer, me);
      if (isSigner) {
        setPanelEnabled("approve", true);
        setPanelEnabled("registry", true);
        st.innerHTML = "You are the sale's allowlist signer — your signatures count. " +
          "<span class='mono'>" + shortAddr(me) + "</span>";
        st.style.color = "var(--flame-core)";
        if (rst) { rst.innerHTML = "Registry unlocked — you are the sale's allowlist signer. Reads on-chain only; nothing is signed."; rst.style.color = "var(--flame-core)"; }
        loadExistingAllowlist();
      } else {
        setPanelEnabled("approve", false);
        setPanelEnabled("registry", false);
        st.innerHTML = "<span class='bad'>This wallet is not the sale's allowlist signer</span>, so its signatures would be rejected on-chain. " +
          "Connect the approving wallet. Expected: <span class='mono'>" + shortAddr(signer) + "</span>.";
        st.style.color = "var(--gold-aged)";
        if (rst) { rst.innerHTML = "<span class='bad'>Registry locked</span> — connect the sale's allowlist signer wallet to view purchases. Expected: <span class='mono'>" + shortAddr(signer) + "</span>."; rst.style.color = "var(--gold-aged)"; }
      }
    }).catch(function () {
      st.innerHTML = "<span class='bad'>Could not read the sale</span> — check the DYCoinSale address in Configuration.";
    });
  }

  // load the currently-published allowlist so signs MERGE (never blow away prior approvals)
  function loadExistingAllowlist() {
    fetch("allowlist.json?nb=" + Date.now()).then(function (r) { return r.json(); }).then(function (a) {
      if (Array.isArray(a) && !approvedList.length) approvedList = a.slice();
      renderAllowlistCount();
    }).catch(function () {});
  }
  function renderAllowlistCount() {
    var n = $("approve-count");
    if (n) n.textContent = approvedList.length ? approvedList.length + " wallet(s) in the list" : "list empty";
  }

  // ---------- PURCHASE REGISTRY (M-F3) — per-wallet chain truth, read-only, zero PII ----------
  function fmtDyc18(v) {
    if (v == null) return "—";
    try { return Number(ethersRef.formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
    catch (e) { return "—"; }
  }
  // merge allowlist.json wallets + pasted extras; dedupe (lowercase); keep only valid addresses
  function registryWallets() {
    var raw = ($("registry-input") ? $("registry-input").value : "").split(/[\s,]+/);
    var seen = {}, out = [];
    function add(a) {
      if (!a || !ethersRef.isAddress(a)) return;
      var k = a.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1; out.push(ethersRef.getAddress(a));
    }
    approvedList.forEach(function (e) { add(e.wallet); });
    raw.forEach(add);
    return out;
  }
  // S-REGISTRY-HIST: a "busy" sentinel for the Bought column — distinct from a genuine 0n and from a null (other-column
  // read failure). Compared by reference. renders as "busy", never as a bare dash, so throttle/deadline ≠ a real zero.
  var BOUGHT_BUSY = { busy: true };
  // Sum this wallet's dycOut across its Purchased logs on the SHARED archive history road (S-REGISTRY-HIST): the
  // drpc-first tamed `historyProvider` (built once by loadRegistry, passed in as `saleArchive`), chunked getLogs with
  // withRetry + retry voice, a PER-WALLET raceDeadline(SCAN_DEADLINE_MS), sleep(120) throttle, and isRateLimited/
  // isArchiveError → the "busy" sentinel. Own loop (per-wallet total), but every discipline is a shared primitive — no
  // third copy of retry/deadline logic. Returns a BigInt total, or BOUGHT_BUSY on deadline/rate-limit/archive-exhaustion.
  function boughtOf(saleArchive, wallet, from, latest, onProgress) {
    if (!saleArchive) return Promise.resolve(BOUGHT_BUSY); // the archive road was unavailable this load → busy, not "—"
    var total = 0n, start = from;
    var totalChunks = Math.max(1, Math.ceil((latest - from + 1) / LOG_CHUNK)), idx = 0;
    var deadlineAt = Date.now() + SCAN_DEADLINE_MS; // PER-WALLET deadline (owner ruling): a slow wallet → busy, next proceeds
    function step() {
      if (start > latest) return Promise.resolve(total);
      if (Date.now() > deadlineAt) { var de = new Error("scan deadline"); de.__deadline = true; return Promise.reject(de); } // stop issuing chunks past the deadline
      var end = Math.min(start + LOG_CHUNK - 1, latest);
      idx++;
      var label = "chunk " + idx + "/" + totalChunks;
      if (onProgress) onProgress(label);
      return withRetry(function () {
        return saleArchive.queryFilter(saleArchive.filters.Purchased(wallet), start, end);
      }, function () { if (onProgress) onProgress(label + ", retrying"); }).then(function (evs) {
        evs.forEach(function (ev) { total += ev.args.dycOut; });
        start = end + 1;
        return sleep(120).then(step); // gentle on the public RPC (matches the shared road)
      });
    }
    return raceDeadline(step(), deadlineAt).catch(function (e) {
      if ((e && e.__deadline) || isRateLimited(e) || isArchiveError(e)) return BOUGHT_BUSY; // plain-words busy, not a bare dash
      throw e; // a genuinely unexpected error still propagates (readRegistryRow's .catch → null → "—")
    });
  }
  function readRegistryRow(c, provider, saleArchive, latest, wallet, onChunk) {
    var reads = [
      boughtOf(saleArchive, wallet, c.deployBlock || 0, latest, onChunk).catch(function () { return null; }),
      c.dycoin ? new ethersRef.Contract(c.dycoin, COIN_ABI, provider).balanceOf(wallet).catch(function () { return null; }) : Promise.resolve(null),
      c.vestingVault ? new ethersRef.Contract(c.vestingVault, REG_VAULT_ABI, provider).vestedBalanceOf(wallet).catch(function () { return null; }) : Promise.resolve(null),
      c.holderStaking ? stakedOf(new ethersRef.Contract(c.holderStaking, REG_STAKE_ABI, provider), wallet).catch(function () { return null; }) : Promise.resolve(null),
      c.holderStaking ? new ethersRef.Contract(c.holderStaking, REG_STAKE_ABI, provider).pendingRoi(wallet).catch(function () { return null; }) : Promise.resolve(null),
    ];
    return Promise.all(reads).then(function (r) {
      return { wallet: wallet, bought: r[0], liquid: r[1], vested: r[2], staked: r[3], rewards: r[4] };
    });
  }
  function loadRegistry() {
    var c = cfg(), out = $("registry-results"), cnt = $("registry-count");
    if (!c.dycoinSale) { out.innerHTML = "<div class='q'>Configure the DYCoinSale address first.</div>"; return; }
    var wallets = registryWallets();
    if (!wallets.length) { out.innerHTML = "<div class='q'>No wallets — the allowlist is empty and no extra wallets were pasted.</div>"; cnt.textContent = ""; return; }
    out.innerHTML = "<div class='q'>Reading " + wallets.length + " wallet(s) from chain…</div>";
    cnt.textContent = "";
    registryRows = [];
    withEthers().then(function () {
      var provider = readProvider();
      return provider.getBlockNumber().then(function (latest) {
        // S-REGISTRY-HIST: build the ARCHIVE getLogs provider ONCE (drpc-first, tamed) for the deep Purchased scan; the
        // other columns stay on readProvider (eth_call). If the archive road is unavailable, saleArchive=null → every
        // Bought cell renders "busy" while the eth_call columns still load.
        return historyProvider(c.dycoinSale).then(function (h) { return h.provider; }, function () { return null; }).then(function (archiveProv) {
          var saleArchive = archiveProv ? new ethersRef.Contract(c.dycoinSale, SALE_ABI, archiveProv) : null;
          // sequential — gentle on the RPC, and order-stable for the table
          var i = 0;
          function next() {
            if (i >= wallets.length) return Promise.resolve();
            var wi = i + 1;
            function onChunk(label) { cnt.textContent = "wallet " + wi + "/" + wallets.length + " · " + label; } // "wallet i/N · chunk j/M"
            return readRegistryRow(c, provider, saleArchive, latest, wallets[i], onChunk).then(function (row) {
              registryRows.push(row); i++;
              out.innerHTML = renderRegistryTable(registryRows, wallets.length);
              return next();
            });
          }
          return next();
        });
      });
    }).then(function () {
      cnt.textContent = registryRows.length + " wallet(s) read";
      out.innerHTML = renderRegistryTable(registryRows, wallets.length);
    }).catch(function () {
      out.innerHTML = "<div class='q bad'>Could not read the registry — check the contract addresses and network.</div>";
    });
  }
  function renderRegistryTable(rows, expected) {
    var tot = { bought: 0n, liquid: 0n, vested: 0n, staked: 0n, rewards: 0n };
    var any = { bought: false, liquid: false, vested: false, staked: false, rewards: false };
    rows.forEach(function (r) {
      ["bought", "liquid", "vested", "staked", "rewards"].forEach(function (k) {
        if (typeof r[k] === "bigint") { tot[k] += r[k]; any[k] = true; } // skips null AND the BOUGHT_BUSY sentinel (never sum a busy read)
      });
    });
    function cell(v) { return "<td class='num'>" + fmtDyc18(v) + "</td>"; }
    // S-REGISTRY-HIST: the Bought cell shows "busy" for a throttled/deadline-hit read — muted italic, visually distinct
    // from BOTH a real 0 (a plain numeral) and a "—" (a genuine null read). Explicit inline style (the .bad class is unstyled here).
    function boughtCell(v) { return v === BOUGHT_BUSY ? "<td class='num'><span style=\"color:var(--gold-aged);font-style:italic\">busy</span></td>" : cell(v); }
    var body = rows.map(function (r) {
      return "<tr><td class='mono'>" + shortAddr(r.wallet) + "</td>" +
        boughtCell(r.bought) + cell(r.liquid) + cell(r.vested) + cell(r.staked) + cell(r.rewards) + "</tr>";
    }).join("");
    var totalRow = "<tr class='tot'><td class='mono'>TOTAL · " + rows.length + " wallet(s)</td>" +
      "<td class='num'>" + (any.bought ? fmtDyc18(tot.bought) : "—") + "</td>" +
      "<td class='num'>" + (any.liquid ? fmtDyc18(tot.liquid) : "—") + "</td>" +
      "<td class='num'>" + (any.vested ? fmtDyc18(tot.vested) : "—") + "</td>" +
      "<td class='num'>" + (any.staked ? fmtDyc18(tot.staked) : "—") + "</td>" +
      "<td class='num'>" + (any.rewards ? fmtDyc18(tot.rewards) : "—") + "</td></tr>";
    return "<div class='reg-note'>All amounts in DYC. Bought = Σ dycOut from the sale's <span class='mono'>Purchased</span> logs. " +
      "Liquid/Vested/Staked/Rewards are live contract reads. Wallets only — no names.</div>" +
      "<div class='reg-tablewrap'><table class='grid reg-table'><thead><tr>" +
      "<th>Wallet</th><th class='num'>Bought</th><th class='num'>Liquid</th><th class='num'>Vested</th><th class='num'>Staked</th><th class='num'>Rewards</th>" +
      "</tr></thead><tbody>" + body + totalRow + "</tbody></table></div>";
  }
  function downloadRegistryCsv() {
    if (!registryRows.length) return;
    function n(v) { if (v == null) return ""; try { return ethersRef.formatUnits(v, 18); } catch (e) { return ""; } }
    var lines = ["wallet,bought_dyc,liquid_dyc,vested_dyc,staked_dyc,rewards_dyc"];
    registryRows.forEach(function (r) {
      var bought = r.bought === BOUGHT_BUSY ? "busy" : n(r.bought); // S-REGISTRY-HIST: don't emit an empty cell for a busy read
      lines.push([r.wallet, bought, n(r.liquid), n(r.vested), n(r.staked), n(r.rewards)].join(","));
    });
    var blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "purchase-registry.csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ---------- TORANA RELEASE (S-TORANA-1) — admin-push AccessNFT.mint(to) to buyers past the USD threshold ----------
  // Chain truth end-to-end: eligibility from a single UNFILTERED Purchased() scan (usdE18 summed per buyer) on the shared
  // archive road (S-REGISTRY-HIST discipline), current holders excluded via balanceOf, and the release fires the CHECKED
  // set through the proven runDrop mint lineage (owner wallet casts each mint). Two bands: DEFINITE (pre-ticked) /
  // DISCRETION (unticked). No robot, no new contract, no history view — the chain register is the record.
  var toranaGateToken = 0, toranaEligible = [];
  function toranaUsd2dp(e18) { try { return Number(ethersRef.formatUnits(e18, 18)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { return "?"; } }
  function toranaDim(on) { var p = $("panel-torana"); if (p) p.style.opacity = on ? "1" : "0.7"; }

  // INDEPENDENT async gate: DARK if accessNFT unset; else lit only when the connected wallet is the AccessNFT owner or an
  // authorized minter (read on-chain). Failing wallet → plain "not a minter". A token guards against stale async results.
  function refreshToranaPanel() {
    var st = $("torana-status"); if (!st) return;
    var c = cfg(), s = window.DYWallet.state;
    var find = $("torana-find"), release = $("torana-release");
    function lock(html, lit) { st.innerHTML = html; if (find) find.disabled = true; if (release) release.disabled = true; toranaDim(!!lit); }
    if ($("torana-list")) $("torana-list").innerHTML = "";
    if ($("torana-count")) $("torana-count").textContent = "";
    if ($("torana-results")) $("torana-results").innerHTML = "";
    if (!c.accessNFT) { st.style.color = "var(--gold-aged)"; lock("<span class='mono'>AccessNFT not configured</span> — set the address in Configuration after the redeploy.", false); return; }
    if (!s.hasProvider || !s.connected) { st.style.color = "var(--gold-aged)"; lock("Connect the minter wallet to release TORANA.", false); return; }
    if (!s.chainOk) { st.style.color = "var(--gold-aged)"; lock("Wrong network — cross to " + PLAYER.chain.name + " to release.", false); return; }
    var myToken = ++toranaGateToken;
    st.style.color = "var(--gold-aged)"; st.innerHTML = "Checking minter authority…"; toranaDim(true);
    withEthers().then(function () {
      var acc = new ethersRef.Contract(c.accessNFT, ACCESS_ABI, readProvider());
      var me = s.address || "";
      return Promise.all([acc.owner().catch(function () { return null; }), acc.authorizedMinters(me).catch(function () { return false; })]).then(function (r) {
        if (myToken !== toranaGateToken) return; // superseded by a newer refresh
        var isMinter = (r[0] && eq(r[0], me)) || r[1] === true;
        if (!isMinter) { st.style.color = "var(--gold-aged)"; lock("<span class='bad'>Connected wallet is not a minter</span> — connect the AccessNFT owner or an authorized minter.", false); return; }
        st.style.color = "var(--flame-core)";
        st.innerHTML = "Minter authority confirmed — bands: definite ≥ $" + c.toranaDefiniteUsd + ", discretion ≥ $" + c.toranaDiscretionUsd + ". Find eligible buyers, then release the ticked set.";
        if (find) find.disabled = false;
        if (release) release.disabled = true;
        toranaDim(true);
      });
    }).catch(function () { if (myToken === toranaGateToken) { st.style.color = "var(--gold-aged)"; lock("<span class='bad'>Could not read minter authority</span> — check the AccessNFT address + network.", false); } });
  }

  // single UNFILTERED Purchased() scan, usdE18 summed per buyer — the shared archive road primitives (no third copy).
  function scanPurchasedByBuyer(sale, from, latest, onProgress, deadlineAt) {
    var byBuyer = {}, start = from;
    var totalChunks = Math.max(1, Math.ceil((latest - from + 1) / LOG_CHUNK)), idx = 0;
    function stepp() {
      if (start > latest) return Promise.resolve(byBuyer);
      if (Date.now() > deadlineAt) { var de = new Error("scan deadline"); de.__deadline = true; return Promise.reject(de); }
      var end = Math.min(start + LOG_CHUNK - 1, latest);
      idx++;
      var label = "chunk " + idx + "/" + totalChunks;
      if (onProgress) onProgress(label);
      return withRetry(function () { return sale.queryFilter(sale.filters.Purchased(), start, end); },
        function () { if (onProgress) onProgress(label + ", retrying"); }).then(function (evs) {
        evs.forEach(function (ev) { var b = (ev.args.buyer || "").toLowerCase(); byBuyer[b] = (byBuyer[b] || 0n) + ev.args.usdE18; });
        start = end + 1;
        return sleep(120).then(stepp);
      });
    }
    return stepp();
  }

  function toranaFindEligible() {
    var c = cfg(), st = $("torana-status"), listEl = $("torana-list"), cntEl = $("torana-count"), release = $("torana-release"), find = $("torana-find");
    if (!c.dycoinSale) { st.style.color = "var(--gold-aged)"; st.innerHTML = "<span class='bad'>DYCoinSale not configured</span> — needed to read purchases."; return; }
    if (!c.accessNFT) { refreshToranaPanel(); return; }
    var defE18 = 0n, disE18 = 0n;
    try { defE18 = ethersRef.parseUnits(String(c.toranaDefiniteUsd), 18); disE18 = ethersRef.parseUnits(String(c.toranaDiscretionUsd), 18); } catch (e) {}
    if (find) find.disabled = true;
    if (release) release.disabled = true;
    listEl.innerHTML = ""; cntEl.textContent = "";
    st.style.color = "var(--gold-aged)"; st.innerHTML = "Waking the archive — this can take ~30 seconds on first contact…";
    withEthers().then(function () {
      var provider = readProvider();
      return provider.getBlockNumber().then(function (latest) {
        return historyProvider(c.dycoinSale).then(function (h) {
          var sale = new ethersRef.Contract(c.dycoinSale, SALE_ABI, h.provider);
          var deadlineAt = Date.now() + SCAN_DEADLINE_MS;
          return raceDeadline(scanPurchasedByBuyer(sale, c.deployBlock || 0, latest, function (lbl) { cntEl.textContent = lbl; }, deadlineAt), deadlineAt);
        });
      });
    }).then(function (byBuyer) {
      var cands = Object.keys(byBuyer).filter(function (a) { return byBuyer[a] >= disE18; });
      var acc = new ethersRef.Contract(c.accessNFT, ACCESS_ABI, readProvider());
      cntEl.textContent = "checking " + cands.length + " candidate(s) for existing holdings…";
      return Promise.all(cands.map(function (a) {
        return acc.balanceOf(a).then(function (b) { return { addr: a, usd: byBuyer[a], holds: b !== 0n }; }, function () { return { addr: a, usd: byBuyer[a], holds: false }; });
      })).then(function (rows) {
        var excluded = rows.filter(function (r) { return r.holds; }).length;
        var elig = rows.filter(function (r) { return !r.holds; }).map(function (r) { return { addr: r.addr, usd: r.usd, band: r.usd >= defE18 ? "definite" : "discretion" }; });
        elig.sort(function (a, b) { return (b.usd > a.usd) ? 1 : (b.usd < a.usd ? -1 : 0); });
        toranaEligible = elig;
        renderToranaList(elig, excluded);
      });
    }).catch(function (e) {
      if (find) find.disabled = false;
      if ((e && e.__deadline) || isRateLimited(e) || isArchiveError(e)) { st.style.color = "var(--gold-aged)"; st.innerHTML = "<span class='bad'>The archive is busy or unreachable</span> — try again in a moment."; }
      else { st.style.color = "var(--gold-aged)"; st.innerHTML = "<span class='bad'>Could not read purchases</span> — check the DYCoinSale address + network."; }
    });
  }

  function renderToranaList(elig, excluded) {
    var st = $("torana-status"), listEl = $("torana-list"), cntEl = $("torana-count"), release = $("torana-release"), find = $("torana-find");
    if (find) find.disabled = false;
    var nDef = elig.filter(function (e) { return e.band === "definite"; }).length, nDis = elig.length - nDef;
    cntEl.textContent = nDef + " definite, " + nDis + " discretion, " + excluded + " holder(s) excluded.";
    if (!elig.length) {
      listEl.innerHTML = "<div class='q'>No buyers at or above the discretion floor ($" + cfg().toranaDiscretionUsd + ").</div>";
      if (release) release.disabled = true;
      st.style.color = "var(--flame-core)"; st.innerHTML = "Scan complete — no eligible buyers.";
      return;
    }
    var body = elig.map(function (e) {
      var badge = e.band === "definite" ? "<span style=\"color:var(--flame-core)\">definite</span>" : "<span style=\"color:var(--gold-aged);font-style:italic\">discretion</span>";
      return "<tr><td><input type='checkbox' class='torana-tick' data-addr='" + e.addr + "'" + (e.band === "definite" ? " checked" : "") + "></td>" +
        "<td class='mono'>" + shortAddr(e.addr) + "</td><td class='num'>$" + toranaUsd2dp(e.usd) + "</td><td>" + badge + "</td></tr>";
    }).join("");
    listEl.innerHTML = "<table class='grid'><thead><tr><th>✓</th><th>Wallet</th><th>USD</th><th>Band</th></tr></thead><tbody>" + body + "</tbody></table>";
    Array.prototype.forEach.call(listEl.querySelectorAll(".torana-tick"), function (cb) { cb.onchange = updateToranaRelease; });
    updateToranaRelease();
    st.style.color = "var(--flame-core)"; st.innerHTML = "Scan complete — review the list and Release the ticked wallets.";
  }

  function updateToranaRelease() {
    var release = $("torana-release"), listEl = $("torana-list"); if (!release || !listEl) return;
    var n = listEl.querySelectorAll(".torana-tick:checked").length;
    release.disabled = n === 0;
    release.textContent = n ? "Release TORANA to " + n + " wallet(s)" : "Release TORANA (none ticked)";
  }

  function toranaRelease() {
    var listEl = $("torana-list"), resultsEl = $("torana-results"), st = $("torana-status");
    var checks = listEl.querySelectorAll(".torana-tick:checked");
    var addrs = Array.prototype.map.call(checks, function (cb) { return ethersRef.getAddress(cb.getAttribute("data-addr")); });
    if (!addrs.length) return;
    if (!confirm("Release TORANA to " + addrs.length + " wallet(s)? Each is a separate AccessNFT mint you'll confirm in your wallet.")) return;
    if ($("torana-release")) $("torana-release").disabled = true;
    if ($("torana-find")) $("torana-find").disabled = true;
    runDrop("access", null, addrs, resultsEl).then(function () {
      st.style.color = "var(--flame-core)"; st.innerHTML = "Release batch complete. Re-run <b>Find eligible</b> to refresh — freshly-minted holders drop off automatically.";
      if ($("torana-find")) $("torana-find").disabled = false;
    }).catch(function () {
      st.style.color = "var(--gold-aged)"; st.innerHTML = "<span class='bad'>Release could not start</span> — check your wallet connection.";
      if ($("torana-find")) $("torana-find").disabled = false;
    });
  }

  // EIP-712 sign the Allowlisted(wallet) voucher with the connected (signer) wallet
  function signVoucher(wallet) {
    var c = cfg();
    var provider = new ethersRef.BrowserProvider(window.ethereum);
    return provider.getSigner().then(function (signer) {
      var domain = { name: "DYCoinSale", version: "1", chainId: PLAYER.chain.id, verifyingContract: c.dycoinSale };
      var types = { Allowlisted: [{ name: "wallet", type: "address" }] };
      return signer.signTypedData(domain, types, { wallet: wallet });
    });
  }

  function upsert(wallet, sig) {
    var lo = wallet.toLowerCase();
    for (var i = 0; i < approvedList.length; i++) {
      if ((approvedList[i].wallet || "").toLowerCase() === lo) { approvedList[i] = { wallet: wallet, sig: sig }; return; }
    }
    approvedList.push({ wallet: wallet, sig: sig });
  }

  // parse + validate the batch, then sign each (fail-never-halts, per-row status)
  function runApprove() {
    withEthers().then(function () {
      var raw = $("approve-input").value || "";
      var results = $("approve-results");
      results.innerHTML = "";
      var lines = raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) { results.innerHTML = "<div class='q'>Paste one wallet address per line.</div>"; return; }
      var table = el("table", "grid");
      table.innerHTML = "<thead><tr><th>#</th><th>Wallet</th><th>Status</th></tr></thead>";
      var tb = el("tbody"); table.appendChild(tb); results.appendChild(table);
      var rows = lines.map(function (l, i) {
        var a = parseAddr(l);
        var tr = el("tr");
        tr.innerHTML = "<td>" + (i + 1) + "</td><td class='addr'>" + (a ? shortAddr(a) : (l.slice(0, 16) + "…")) +
          "</td><td>" + (a ? "<span class='pill pending'>pending</span>" : "<span class='pill invalid'>bad address</span>") + "</td>";
        tb.appendChild(tr);
        return { addr: a, tr: tr };
      });
      var chain = Promise.resolve(), ok = 0, bad = 0;
      rows.forEach(function (r) {
        chain = chain.then(function () {
          if (!r.addr) { bad++; return; }
          var cell = r.tr.querySelector("td:last-child");
          return signVoucher(r.addr).then(function (sig) {
            upsert(r.addr, sig);
            ok++;
            cell.innerHTML = "<span class='pill success'>signed &amp; added</span>";
          }).catch(function (e) {
            bad++;
            cell.innerHTML = "<span class='pill fail'>" + (e && e.code === "ACTION_REJECTED" ? "rejected in wallet" : "sign failed") + "</span>";
          });
        });
      });
      chain.then(function () {
        renderAllowlistCount();
        var sum = el("div", "summary", "Done: <b class='good'>" + ok + "</b> signed · <b class='bad'>" + bad + "</b> skipped. " +
          "The list now has <b>" + approvedList.length + "</b> wallet(s). Download it and commit allowlist.json to publish.");
        results.appendChild(sum);
      });
    });
  }

  function downloadAllowlist() {
    var blob = new Blob([JSON.stringify(approvedList, null, 2) + "\n"], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "allowlist.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- wire the page ----------
  // ---------- Robot Registry (M-F5) — read-only view of the approval-bot ----------
  // Fetches the service's /registry projection (bearer-gated). NEVER signs/sends/publishes. The projection holds
  // no signatures and no verify tokens. Service URL + view token persist in THIS BROWSER only.
  var ROBOT_LS = "dyadmin::robot_view"; // registry namespace law: dyadmin:: = admin surface
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // S-ROBOT-ADMIN-1: ONE config, two consumers. The registry now rides cfg().robotUrl/robotToken (the same pair the
  // Drop Desk "Publish via robot" button uses). One-time silent migration lifts any legacy dyadmin::robot_view creds
  // into dyadmin::config when the config fields are empty; the old key is LEFT untouched (no needless storage deletes).
  function migrateRobotCreds() {
    try {
      var legacy = JSON.parse(localStorage.getItem(ROBOT_LS) || "{}");
      if (!legacy || (!legacy.url && !legacy.token)) return;
      var o = override(), changed = false;
      if (legacy.url && !o.robotUrl) { o.robotUrl = legacy.url; changed = true; }
      if (legacy.token && !o.robotToken) { o.robotToken = legacy.token; changed = true; }
      if (changed) { localStorage.setItem(LS_KEY, JSON.stringify(o)); fillCfgForm(); }
    } catch (e) {}
  }
  // plain-words state labels for the registry table; an unknown state renders raw (never hide a state the map misses).
  var ROBOT_STATE_LABELS = {
    "received": "Received", "email-sent": "Email sent", "verified": "Verified",
    "signed-pending": "Signed (publishing)", "signed-published": "Published",
    "rejected": "Rejected", "ofac-hold": "OFAC hold", "expired": "Expired",
  };
  function robotStateLabel(s) { return ROBOT_STATE_LABELS[s] || (s || "—"); }
  function fmtTs(ms) { return ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—"; }
  async function loadRobotRegistry() {
    var st = $("robot-status"), body = $("robot-body"), sum = $("robot-summary");
    var c = cfg();
    var base = (c.robotUrl || "").replace(/\/+$/, ""), token = c.robotToken || "";
    if (!base || !token) { st.textContent = "Set the Robot base URL + admin token in Configuration first."; return; }
    st.textContent = "Waking the robot — this can take ~30 seconds on first contact…"; body.innerHTML = ""; sum.textContent = "";
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 38000); // > 35s free-tier cold-start budget
    try {
      var res = await fetch(base + "/registry", { headers: { authorization: "Bearer " + token }, cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
      clearTimeout(timer);
      if (res.status === 401) { st.textContent = "Unauthorized — check the admin token in Configuration."; return; }
      if (res.status === 502 || res.status === 503 || res.status === 504) { st.textContent = "The robot may be asleep or unreachable — try again in a moment."; return; }
      if (!res.ok) { st.textContent = "The robot returned HTTP " + res.status + " — try again in a moment."; return; }
      var data = await res.json();
      var rows = data.registrants || [];
      var counts = data.counts || {};
      var alertHtml = data.alert
        ? "<div style='margin:0 0 0.5rem;padding:0.6rem 0.8rem;border:1px solid var(--flame-core);border-radius:6px;"
          + "background:rgba(200,60,30,0.12);color:var(--flame-core);font-weight:600'>⚠ INTAKE PAUSED — "
          + escHtml(data.alert) + "</div>"
        : "";
      sum.innerHTML = alertHtml
        + "Last publish: <b>" + fmtTs(data.lastPublishAt) + "</b> &nbsp; · &nbsp; "
        + Object.keys(counts).sort().map(function (k) { return escHtml(k) + ": " + counts[k]; }).join(" &nbsp; ");
      // sort: OFAC holds first, then clustered, then most-recent
      rows.sort(function (a, b) {
        var ap = (a.ofacHit ? 0 : a.clusterId ? 1 : 2), bp = (b.ofacHit ? 0 : b.clusterId ? 1 : 2);
        return ap - bp || (b.receivedAt || 0) - (a.receivedAt || 0);
      });
      body.innerHTML = rows.map(function (r) {
        var flags = [];
        if (r.ofacHit) flags.push("<b style='color:var(--flame-core)'>OFAC HIT</b>");
        if (r.clusterId) flags.push("<span style='color:var(--gold-aged)'>" + escHtml(r.clusterId) + "</span>");
        if (r.reason) flags.push("<span title='" + escHtml(r.reason) + "'>reason ⓘ</span>");
        return "<tr>"
          + "<td class='mono'>" + escHtml(r.wallet ? shortAddr(r.wallet) : "—") + "</td>"
          + "<td>" + escHtml(robotStateLabel(r.status)) + "</td>"
          + "<td>" + (flags.join(" ") || "—") + "</td>"
          + "<td class='mono' style='font-size:0.72rem'>" + escHtml(r.email || "—") + "</td>"
          + "<td class='mono' style='font-size:0.72rem'>" + fmtTs(r.receivedAt) + "</td>"
          + "<td class='mono' style='font-size:0.72rem'>" + fmtTs(r.signedAt) + "</td>"
          + "</tr>";
      }).join("") || "<tr><td colspan='6' class='mono'>No registrants yet.</td></tr>";
      st.textContent = rows.length + " registrant(s) · read-only";
    } catch (e) {
      clearTimeout(timer);
      st.textContent = "The robot may be asleep or unreachable — try again in a moment.";
    }
  }

  // ================= DROP DESK (M-F6) — sign coupons, publish the coupon file, cancel, read desk figures =========
  // The owner's admin wallet hand-signs EIP-712 DropCoupons (the Approve-Buyers pattern). The coupon file is public
  // and zero-PII: [{wallet, amount, deadline, nonce, sig}]. Working set persists under the dyadmin:: namespace.
  var DROP_DESK_ABI = [
    "function cancel(uint256 nonce)",
    "function nonceRedeemed(uint256) view returns (bool)",
    "function nonceCancelled(uint256) view returns (bool)",
    "function dropSigner() view returns (address)",
    "function totalFunded() view returns (uint256)",
    "function totalRedeemed() view returns (uint256)",
    "function totalWithdrawn() view returns (uint256)",
    "function dyc() view returns (address)",
  ];
  var DROP_COIN_ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
  var DROP_LS = "dyadmin::dropdesk_coupons"; // namespace law: dyadmin:: = admin surface
  var COUPON_TTL_DAYS = 90; // owner ruling: FIXED 90-day coupon lifetime, baked into the signed deadline
  var deskCoupons = [];

  function loadDeskCoupons() {
    try { deskCoupons = JSON.parse(localStorage.getItem(DROP_LS)) || []; } catch (e) { deskCoupons = []; }
    if (!Array.isArray(deskCoupons)) deskCoupons = [];
  }
  function saveDeskCoupons() { try { localStorage.setItem(DROP_LS, JSON.stringify(deskCoupons)); } catch (e) {} }
  function randNonce() {
    var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(b) : b;
    var h = "0x"; for (var i = 0; i < b.length; i++) h += ("0" + b[i].toString(16)).slice(-2);
    return BigInt(h).toString(); // 128-bit decimal nonce string
  }
  function couponUpsert(cp) {
    for (var i = 0; i < deskCoupons.length; i++) { if (String(deskCoupons[i].nonce) === String(cp.nonce)) { deskCoupons[i] = cp; return; } }
    deskCoupons.push(cp);
  }
  function signDropCoupon(wallet, amountWei, deadline, nonce) {
    var c = cfg();
    var provider = new ethersRef.BrowserProvider(window.ethereum);
    return provider.getSigner().then(function (signer) {
      var domain = { name: "DropDesk", version: "1", chainId: PLAYER.chain.id, verifyingContract: c.dropDesk };
      var types = { DropCoupon: [{ name: "wallet", type: "address" }, { name: "amount", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "nonce", type: "uint256" }] };
      return signer.signTypedData(domain, types, { wallet: wallet, amount: amountWei, deadline: deadline, nonce: nonce });
    });
  }

  function renderDeskCoupons() {
    var out = $("drop-coupons"); if (!out) return;
    if (!deskCoupons.length) { out.innerHTML = "<div class='q'>No coupons in this batch yet. Sign some above, or load the published file.</div>"; return; }
    var now = Math.floor(Date.now() / 1000);
    var rows = deskCoupons.map(function (cp) {
      var days = Math.max(0, Math.ceil((Number(cp.deadline) - now) / 86400));
      var dyc = ethersRef ? ethersRef.formatUnits(cp.amount, 18) : cp.amount;
      return "<tr><td class='addr'>" + shortAddr(cp.wallet) + "</td><td>" + dyc + " DYC</td><td class='mono' style='font-size:.72rem'>"
        + String(cp.nonce).slice(0, 10) + "…</td><td>" + days + "d</td></tr>";
    }).join("");
    out.innerHTML = "<table class='grid'><thead><tr><th>Wallet</th><th>Amount</th><th>Nonce</th><th>Expires</th></tr></thead><tbody>"
      + rows + "</tbody></table><div class='mono' style='font-size:.78rem;margin-top:.4rem'>" + deskCoupons.length + " coupon(s) in this batch.</div>";
  }

  function runDropSign() {
    var msg = $("drop-msg"); msg.textContent = "";
    var c = cfg();
    if (!c.dropDesk) { msg.textContent = "Set the DropDesk address in Configuration first."; return; }
    withEthers().then(function () {
      var raw = $("drop-input").value || "";
      var lines = raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) { msg.textContent = "Enter one \"wallet, amount\" per line."; return; }
      var deadline = Math.floor(Date.now() / 1000) + COUPON_TTL_DAYS * 86400; // 90 days, baked into the signature
      var parsed = [];
      for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].split(/[,\s]+/).filter(Boolean);
        var addr = parseAddr(parts[0] || "");
        var amtWei = null;
        try { amtWei = ethersRef.parseUnits(String(parts[1] || "").replace(/,/g, ""), 18); } catch (e) { amtWei = null; }
        parsed.push({ addr: addr, amtWei: amtWei, ok: !!(addr && amtWei && amtWei > 0n), raw: lines[i] });
      }
      var good = parsed.filter(function (p) { return p.ok; });
      if (!good.length) { msg.textContent = "No valid rows — each line needs a checksummed wallet and a positive DYC amount."; return; }
      msg.textContent = "Signing " + good.length + " coupon(s) — approve each in your wallet…";
      var chain = Promise.resolve(), signed = 0, failed = 0;
      good.forEach(function (p) {
        chain = chain.then(function () {
          var nonce = randNonce();
          return signDropCoupon(p.addr, p.amtWei.toString(), deadline, nonce).then(function (sig) {
            couponUpsert({ wallet: p.addr, amount: p.amtWei.toString(), deadline: deadline, nonce: nonce, sig: sig });
            signed++; saveDeskCoupons(); renderDeskCoupons();
          }).catch(function () { failed++; });
        });
      });
      chain.then(function () {
        msg.textContent = "Signed " + signed + " coupon(s)" + (failed ? ", " + failed + " skipped" : "") + ". Download the file and commit coupons.json to publish.";
        msg.style.color = "var(--flame-core)";
      });
    });
  }

  function downloadDeskCoupons() {
    // publish shape: zero-PII [{wallet, amount, deadline, nonce, sig}] — amounts as wei strings
    var pub = deskCoupons.map(function (cp) { return { wallet: cp.wallet, amount: String(cp.amount), deadline: Number(cp.deadline), nonce: String(cp.nonce), sig: cp.sig }; });
    var blob = new Blob([JSON.stringify(pub, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "coupons.json"; a.click(); URL.revokeObjectURL(url);
  }

  function mergePublishedCoupons() {
    var msg = $("drop-msg");
    fetch("coupons.json?nb=" + Date.now()).then(function (r) { return r.json(); }).then(function (list) {
      if (!Array.isArray(list)) return;
      var added = 0;
      list.forEach(function (cp) { if (cp && cp.nonce != null) { var seen = deskCoupons.some(function (x) { return String(x.nonce) === String(cp.nonce); }); if (!seen) { deskCoupons.push(cp); added++; } } });
      saveDeskCoupons(); renderDeskCoupons();
      msg.textContent = "Merged the published file (+" + added + " new). Total " + deskCoupons.length + ".";
    }).catch(function () { msg.textContent = "No published coupons.json found yet (that's fine before the first publish)."; });
  }

  // S-ROBOT-COUPON-1 — POST the working coupon batch (zero-PII publish shape) to the robot; it verifies each
  // signature + deadline and commits coupons.json. Download/commit-by-hand stays as the fallback (unchanged).
  function publishViaRobot() {
    var msg = $("drop-msg"); msg.textContent = ""; var out = $("drop-robot-out"); if (out) out.innerHTML = "";
    var c = cfg();
    if (!c.robotUrl || !c.robotToken) { return warn(msg, "Set the Robot base URL + admin token in Configuration first."); }
    if (!deskCoupons.length) { return warn(msg, "No coupons in this batch to publish. Sign some (or Load the published file) first."); }
    var pub = deskCoupons.map(function (cp) { return { wallet: cp.wallet, amount: String(cp.amount), deadline: Number(cp.deadline), nonce: String(cp.nonce), sig: cp.sig }; });
    var base = c.robotUrl.replace(/\/+$/, "");
    msg.textContent = "Publishing " + pub.length + " coupon(s) via the robot…";
    fetch(base + "/admin/coupons/publish", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + c.robotToken },
      body: JSON.stringify(pub),
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: null }; }); })
      .then(function (res) {
        if (res.status === 401) { return warn(msg, "Robot rejected the token (401). Check the admin token in Configuration."); }
        if (res.status === 503) { return warn(msg, "Robot says coupon publishing is not configured on the service yet."); }
        renderRobotVerdicts(res.j || {});
      }).catch(function (e) { warn(msg, "Could not reach the robot: " + (e && e.message ? e.message : e)); });
  }

  function renderRobotVerdicts(j) {
    var msg = $("drop-msg"), out = $("drop-robot-out");
    var acc = j.accepted || [], rej = j.rejected || [];
    if (j.ok && j.committed) { msg.textContent = "Robot published " + j.added + " new coupon(s) — " + acc.length + " accepted, " + rej.length + " rejected."; msg.style.color = "var(--flame-core)"; }
    else if (j.ok && !j.committed) { msg.textContent = "Robot accepted " + acc.length + ", committed 0 (nothing new — nonce dedup)" + (rej.length ? "; " + rej.length + " rejected." : "."); msg.style.color = "var(--flame-core)"; }
    else { warn(msg, "Robot did not commit" + (j.error ? " (" + j.error + ")" : "") + (rej.length ? "; " + rej.length + " rejected." : ".")); }
    if (!out) return;
    var rows = "";
    acc.forEach(function (a) { rows += "<tr><td style='color:var(--flame-core)'>✓ accepted</td><td class='addr'>" + shortAddr(a.wallet) + "</td><td class='mono' style='font-size:.72rem'>" + String(a.nonce).slice(0, 10) + "…</td><td>—</td></tr>"; });
    rej.forEach(function (r) { rows += "<tr><td style='color:var(--gold-aged)'>✗ rejected</td><td class='addr'>" + (r.wallet ? shortAddr(r.wallet) : "—") + "</td><td class='mono' style='font-size:.72rem'>" + (r.nonce ? String(r.nonce).slice(0, 10) + "…" : "—") + "</td><td>" + (r.reason || "") + "</td></tr>"; });
    out.innerHTML = rows ? "<table class='grid'><thead><tr><th>Verdict</th><th>Wallet</th><th>Nonce</th><th>Reason</th></tr></thead><tbody>" + rows + "</tbody></table>" : "";
  }

  function runDropCancel() {
    var msg = $("drop-cancel-msg"); msg.textContent = "";
    var c = cfg();
    if (!c.dropDesk) { msg.textContent = "Set the DropDesk address first."; return; }
    var nonce = ($("drop-cancel-nonce").value || "").trim();
    if (!nonce) { msg.textContent = "Enter the coupon nonce to void."; return; }
    withEthers().then(function () {
      var provider = new ethersRef.BrowserProvider(window.ethereum);
      return provider.getSigner().then(function (signer) {
        var desk = new ethersRef.Contract(c.dropDesk, DROP_DESK_ABI, signer);
        msg.textContent = "Simulating…";
        return desk.cancel.staticCall(nonce).then(function () {
          msg.textContent = "Confirm in your wallet…";
          return desk.cancel(nonce, { gasLimit: 60000 }).then(function (tx) { return tx.wait(); }).then(function () {
            msg.textContent = "Coupon " + nonce.slice(0, 10) + "… voided. It can never be redeemed."; msg.style.color = "var(--flame-core)";
          });
        });
      });
    }).catch(function (e) { msg.textContent = "Could not cancel: " + decodeErr(e); });
  }

  function loadDeskFigures() {
    var out = $("drop-figures"); if (!out) return;
    var c = cfg();
    if (!c.dropDesk) { out.innerHTML = "<div class='q'>Set the DropDesk address to read desk figures.</div>"; return; }
    out.innerHTML = "<div class='q'>Reading chain…</div>";
    withEthers().then(function () {
      var p = readProvider();
      var desk = new ethersRef.Contract(c.dropDesk, DROP_DESK_ABI, p);
      return desk.dyc().then(function (dycAddr) {
        var token = new ethersRef.Contract(dycAddr, DROP_COIN_ABI, p);
        return Promise.all([token.balanceOf(c.dropDesk), desk.totalFunded(), desk.totalRedeemed(), desk.totalWithdrawn(), desk.dropSigner()]);
      }).then(function (r) {
        var f = function (x) { return ethersRef.formatUnits(x, 18); };
        out.innerHTML =
          "<table class='grid'><tbody>"
          + "<tr><th>Desk balance</th><td>" + f(r[0]) + " DYC</td></tr>"
          + "<tr><th>Total funded</th><td>" + f(r[1]) + " DYC</td></tr>"
          + "<tr><th>Total redeemed</th><td>" + f(r[2]) + " DYC</td></tr>"
          + "<tr><th>Total withdrawn</th><td>" + f(r[3]) + " DYC</td></tr>"
          + "<tr><th>Coupon signer</th><td class='addr'>" + shortAddr(r[4]) + "</td></tr>"
          + "</tbody></table>";
      });
    }).catch(function (e) { out.innerHTML = "<div class='q'>Couldn't read the desk: " + escHtml(decodeErr ? decodeErr(e) : String(e && e.message || e)) + "</div>"; });
  }

  // ─────────────── Process Claim / Grant Rewards (S-CLAIM-2B) ───────────────
  // Owner ruling: rewards are ADMIN GRANTS via HolderStaking.creditRoi (the admin wallet is a debitor — registered
  // by the owner via setDebitor at go-live, NOT here). creditRoi pulls DYC from the admin's own balance
  // (safeTransferFrom) → so the admin must APPROVE DYC to HolderStaking first (the approve-then-act Top Up pattern).
  // Grants are in MULTIPLES OF 1,000 DYC (client-side refusal before any send). The 2X lifetime cap is POLICY here,
  // not contract code — the ledger shows granted-so-far beside chain accrual so the owner can eyeball it.
  var STAKE_GRANT_ABI = [
    "function creditRoi(address player, uint256 amount)",
    "function isDebitor(address) view returns (bool)", // RE-FREEZE Leg 2 — Grant-panel authority gate (TORANA standard)
    "function pendingRoi(address) view returns (uint256)",
    "function roi(address) view returns (uint256)",
    "event RoiCredited(address indexed player, uint256 amount, address indexed from)",
    "error NotDebitor()", "error ZeroAddress()",
  ];
  var GRANT_COIN_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
    "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  ];
  // gas floors (house law). approve ~46k → 90k. creditRoi cold-state = roi[player] cold SSTORE (~20k) +
  // DYC safeTransferFrom (~50k, warm contract recipient) + event → ~120k measured band; 160k with margin.
  var GRANT_APPROVE_GAS = 90000, CREDIT_ROI_GAS = 160000;
  var GRANT_MULTIPLE = 1000n; // DYC, whole units

  // client-side 1,000-multiple check on a human DYC string → { ok, wei?, err? }. Refuses BEFORE any chain touch.
  function parseGrantAmount(str) {
    var s = String(str || "").replace(/,/g, "").trim();
    if (!s) return { ok: false, err: "Enter a DYC amount." };
    var whole;
    try { whole = ethersRef.parseUnits(s, 18); } catch (e) { return { ok: false, err: "That's not a valid DYC amount." }; }
    if (whole <= 0n) return { ok: false, err: "Enter an amount above zero." };
    var oneK = GRANT_MULTIPLE * 1000000000000000000n; // 1,000 DYC in wei
    if (whole % oneK !== 0n) return { ok: false, err: "Grants must be in multiples of 1,000 DYC (e.g. 1,000 / 2,000 / 5,000)." };
    return { ok: true, wei: whole };
  }

  function processClaimGrant() {
    var msg = $("grant-msg"); msg.style.color = ""; msg.textContent = "";
    var c = cfg();
    if (!c.holderStaking || !c.dycoin) { msg.textContent = "Set the HolderStaking and DYC token addresses in Configuration first."; return; }
    var wallet = parseAddr(($("grant-wallet").value || "").trim());
    if (!wallet) { msg.textContent = "Enter a valid user wallet address (checksummed 0x…)."; return; }
    withEthers().then(function () {
      var amt = parseGrantAmount($("grant-amount").value);
      if (!amt.ok) { msg.textContent = amt.err; return; } // 1,000-multiple refusal — BEFORE any send
      var amtWei = amt.wei, dycStr = ethersRef.formatUnits(amtWei, 18);
      var provider = new ethersRef.BrowserProvider(window.ethereum);
      provider.getSigner().then(function (signer) {
        return signer.getAddress().then(function (adminAddr) {
          var dyc = new ethersRef.Contract(c.dycoin, GRANT_COIN_ABI, signer);
          var hs = new ethersRef.Contract(c.holderStaking, STAKE_GRANT_ABI, signer);
          // step 1 — approve DYC to HolderStaking if allowance is short
          return dyc.allowance(adminAddr, c.holderStaking).then(function (allow) {
            var needApprove = allow < amtWei;
            var pre = needApprove
              ? (function () {
                  msg.textContent = "Step 1/2 — simulating approve…";
                  return dyc.approve.staticCall(c.holderStaking, amtWei).then(function () {
                    msg.textContent = "Step 1/2 — confirm the DYC approval in your wallet…";
                    return dyc.approve(c.holderStaking, amtWei, { gasLimit: GRANT_APPROVE_GAS }).then(function (tx) { return tx.wait(); }).then(function () {
                      msg.textContent = "Approved. Step 2/2 — granting…";
                    });
                  });
                })()
              : Promise.resolve();
            // step 2 — creditRoi(wallet, amount): pre-sim, then send with the cold-state gas floor
            return pre.then(function () {
              msg.textContent = "Step 2/2 — simulating grant…";
              return hs.creditRoi.staticCall(wallet, amtWei).then(function () {
                msg.textContent = "Step 2/2 — confirm the grant in your wallet…";
                return hs.creditRoi(wallet, amtWei, { gasLimit: CREDIT_ROI_GAS }).then(function (tx) {
                  return tx.wait().then(function (rc) {
                    // chain-truth confirmation: re-read the user's ROI column
                    var hsRead = new ethersRef.Contract(c.holderStaking, STAKE_GRANT_ABI, readProvider());
                    return hsRead.roi(wallet).then(function (roiNow) {
                      msg.style.color = "var(--flame-core)";
                      msg.innerHTML = "Granted <b>" + escHtml(dycStr) + " DYC</b> to " + escHtml(shortAddr(wallet))
                        + ". Their ROI column now reads <b>" + escHtml(ethersRef.formatUnits(roiNow, 18)) + " DYC</b> (chain truth). Tx "
                        + escHtml(String(tx.hash).slice(0, 12)) + "…";
                      loadGrantLedger(); // refresh the per-wallet ledger
                    });
                  });
                });
              });
            });
          });
        });
      }).catch(function (e) { msg.style.color = ""; msg.textContent = "Grant failed: " + decodeErr(e); });
    });
  }

  // per-wallet grant ledger: sum RoiCredited(player=wallet, from=this admin) via chunked getLogs, shown beside the
  // wallet's chain-visible accrual (pending + roi) so the owner can eyeball the 2X policy cap before granting.
  function loadGrantLedger() {
    var out = $("grant-ledger"); if (!out) return;
    var c = cfg();
    var wallet = parseAddr(($("grant-wallet").value || "").trim());
    if (!c.holderStaking) { out.innerHTML = "<div class='q'>Set the HolderStaking address first.</div>"; return; }
    if (!wallet) { out.innerHTML = "<div class='q'>Enter a user wallet above to see its grant ledger + accrual.</div>"; return; }
    // S-LEDGER-FIX-3: bounded + voiced. A 75s deadline caps the WHOLE scan; a live progress line replaces "Reading chain…";
    // a `settled` guard means a late background settle (after the deadline won) can never overwrite the terminal state.
    var settled = false;
    var busy = "<div class='q' style='color:var(--ember)'>The public archive RPC is busy — retry in a minute, or set a dedicated Read RPC URL in Configuration.</div>";
    function progress(msg) { if (!settled) out.innerHTML = "<div class='q'>" + escHtml(msg) + "</div>"; }
    function finish(html) { settled = true; out.innerHTML = html; }
    progress("Reading chain…");
    var deadlineAt = Date.now() + SCAN_DEADLINE_MS;
    var scan = withEthers().then(function () {
      return new ethersRef.BrowserProvider(window.ethereum).getSigner().then(function (signer) {
        return signer.getAddress().then(function (adminAddr) {
          // S-LEDGER-FIX: the deep-history RoiCredited scan rides an ARCHIVE-capable getLogs endpoint (drpc-first, TAMED),
          // NOT the wallet's pruned node. Current-state accrual reads stay on the wallet.
          progress("Reading chain… selecting archive RPC");
          return historyProvider(c.holderStaking).then(function (h) {
            var hs = new ethersRef.Contract(c.holderStaking, STAKE_GRANT_ABI, h.provider);
            return h.provider.getBlockNumber().then(function (latest) {
              var start = c.deployBlock || 0;
              var total = Math.max(1, Math.ceil((latest - start + 1) / LOG_CHUNK));
              var filter = hs.filters.RoiCredited(wallet, null, adminAddr);
              var granted = 0n, jobs = Promise.resolve(), idx = 0;
              for (var from = start; from <= latest; from += LOG_CHUNK) {
                (function (a, b) {
                  jobs = jobs.then(function () {
                    if (Date.now() > deadlineAt) { var de = new Error("scan deadline"); de.__deadline = true; throw de; } // stop issuing chunks past the deadline
                    idx++;
                    var label = "Reading chain… chunk " + idx + "/" + total;
                    progress(label);
                    // S-LEDGER-FIX-2/3: retry-with-backoff (trimmed) + 120ms inter-chunk throttle; onRetry voices "…, retrying".
                    return withRetry(function () { return hs.queryFilter(filter, a, b); }, function () { progress(label + ", retrying"); }).then(function (evs) {
                      evs.forEach(function (ev) { granted += ev.args.amount; });
                      return sleep(120);
                    });
                  });
                })(from, Math.min(from + LOG_CHUNK - 1, latest));
              }
              return jobs.then(function () {
                var hsRead = new ethersRef.Contract(c.holderStaking, STAKE_GRANT_ABI, readProvider()); // eth_calls on the wallet (current-state)
                return Promise.all([hsRead.pendingRoi(wallet), hsRead.roi(wallet)]).then(function (r) {
                  return { granted: granted, r: r, fellBack: h.fellBack };
                });
              });
            });
          });
        });
      });
    });
    raceDeadline(scan, deadlineAt).then(function (res) {
      var f = function (x) { return ethersRef.formatUnits(x, 18); };
      finish(
        "<table class='grid'><tbody>"
        + "<tr><th>Granted so far (this admin)</th><td>" + escHtml(f(res.granted)) + " DYC</td></tr>"
        + "<tr><th>Chain accrual — pending</th><td>" + escHtml(f(res.r[0])) + " DYC</td></tr>"
        + "<tr><th>Chain accrual — ROI column</th><td>" + escHtml(f(res.r[1])) + " DYC</td></tr>"
        + "</tbody></table>"
        + (res.fellBack ? "<div class='q' style='color:var(--ember)'>Configured Read RPC URL couldn't serve deep history — used drpc.</div>" : "")
        + "<div class='mono' style='font-size:.72rem;margin-top:.4rem;color:var(--gold-aged)'>The 2X lifetime cap is a POLICY guide, not enforced on-chain here — check granted-so-far against the wallet's staked principal before granting.</div>"
      );
    }).catch(function (e) {
      // S-LEDGER-FIX-3 catch-order: deadline-expiry + rate-limit → the busy message (the raw "server response 500" must never
      // show); then S-LEDGER-FIX-2/1: archive → plain archive message (checked after rate-limit because a "429 too many
      // requests" also matches isArchiveError's bare "too many" — order, not exclusivity, prevents shadowing); else generic.
      if ((e && e.__deadline) || isRateLimited(e)) { finish(busy); }
      else if (isArchiveError(e)) { finish("<div class='q' style='color:var(--ember)'>History needs an archive RPC — set Read RPC URL in Configuration.</div>"); }
      else { finish("<div class='q'>Couldn't read the ledger: " + escHtml(decodeErr(e)) + "</div>"); }
    });
  }

  // ═══════════════════ PRICE DESK (LEG2) — WaveCardSale prices/caps + live-fire switches ═══════════════════
  // RUNG4-FIX-2 — the WaveCardSale ABI. Renamed from the colliding `SALE_ABI` (the M-F dycoinSale ABI at ~1346
  // shares scope; `var` redeclaration made the wave ABI overwrite it, breaking the M-F dycoinSale panel).
  var WAVESALE_ABI = [
    "function owner() view returns (address)",
    "function salesOpen() view returns (bool)",
    "function priceOf(uint256) view returns (uint256)",
    "function supplyCap(uint256) view returns (uint256)",
    "function remainingOf(uint256) view returns (uint256)",
    "function setPrice(uint256 cardId, uint256 price)",
    "function setPrices(uint256[] cardIds, uint256[] prices)",
    "function setSupplyCap(uint256 cardId, uint256 cap)",
    "function setSupplyCaps(uint256[] cardIds, uint256[] caps)",
    "function setSalesOpen(bool open)",
  ];
  var MARKET_ABI = [
    "function owner() view returns (address)",
    "function marketsOpen() view returns (bool)",
    "function setMarketsOpen(bool open)",
  ];
  // RUNG4-FIX-1 (Fix A) — the Price Desk owner-gate READS through this tamed PUBLIC endpoint (publicnode,
  // cast-verified), NEVER the wallet's BrowserProvider. The wallet's registered Amoy RPC
  // (rpc-amoy.polygon.technology, from config.js chain.rpcUrls) is dead, so a BrowserProvider owner() read
  // returns null and the gate would falsely accuse the master. Writes still ride the wallet signer.
  var PD_RPC = "https://polygon-amoy-bor-rpc.publicnode.com";
  var PD_RARITIES = ["Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"];
  var pdReadGen = 0; // read-generation guard — a stale LOAD never clobbers a newer one
  var pdChain = {}; // cardId -> { price, cap, remaining } (BigInt) | "busy"
  var pdCatalog = []; // the live registry rows (held #188 excluded)
  var pdSaleOwnerOk = false;

  function pdLiveCards() {
    var reg = window.DY_WAVE_REGISTRY;
    if (!reg || !reg.list) return [];
    return reg.list().filter(function (w) { return w.status !== "held"; }).sort(function (a, b) { return a.cardId - b.cardId; });
  }

  // registry-driven table (renders always; chain columns are "—" until LOAD)
  function buildPriceDesk() {
    pdCatalog = pdLiveCards();
    var host = $("pd-catalog");
    if (!host) return;
    var body = pdCatalog.map(function (w) {
      return "<tr data-card='" + w.cardId + "'><td>" + escHtml(w.name) + "</td><td>" + w.faction +
        "</td><td>" + w.rarity + "</td><td class='mono'>" + w.supply + "</td>" +
        "<td class='pd-price mono'>—</td><td class='pd-cap mono'>—</td><td class='pd-remaining mono'>—</td>" +
        "<td><input class='txt pd-override' data-card='" + w.cardId + "' data-rarity='" + w.rarity +
        "' type='text' inputmode='decimal' style='width:6rem' placeholder='—' disabled /></td></tr>";
    }).join("");
    host.innerHTML =
      "<div style='font-size:0.78rem;color:var(--gold-aged);margin:0.3rem 0'>" + pdCatalog.length +
      " live cards (held seat #188 excluded). Chain columns blank until <b>LOAD CHAIN STATE</b>.</div>" +
      "<table class='pd-table' style='width:100%;border-collapse:collapse;font-size:0.82rem'><thead><tr style='text-align:left'>" +
      "<th>Card</th><th>Faction</th><th>Rarity</th><th>Supply</th><th>Price (DYC)</th><th>Cap</th><th>Remaining</th><th>Override</th>" +
      "</tr></thead><tbody>" + body + "</tbody></table>";
  }

  function pdSetControls(on) {
    PD_RARITIES.forEach(function (r) { var e = $("pd-def-" + r); if (e) e.disabled = !on; });
    ["pd-apply-unpriced", "pd-seed-caps", "pd-load", "pd-refresh", "pd-salesopen-word", "pd-salesopen-open", "pd-salesopen-close"].forEach(function (id) {
      var e = $(id); if (e) e.disabled = !on;
    });
    document.querySelectorAll(".pd-override").forEach(function (e) { e.disabled = !on; });
  }
  function pdSetMarketsSwitch(on) {
    ["pd-marketsopen-word", "pd-marketsopen-open", "pd-marketsopen-close"].forEach(function (id) { var e = $(id); if (e) e.disabled = !on; });
  }

  function refreshPriceDeskGate() {
    var c = cfg();
    var st = $("pd-status");
    if (!st) return;
    var s = window.DYWallet.state;
    if (!c.waveCardSale) {
      st.innerHTML = "<span class='bad'>PRICE DESK NOT CONFIGURED</span> — set the WaveCardSale address in Configuration after deploy (RUNG-4). The catalog is the registry; chain columns wake when configured.";
      pdSetControls(false); pdSetMarketsSwitch(false);
      if ($("pd-marketsopen-state")) $("pd-marketsopen-state").textContent = "—";
      return;
    }
    if (!s.hasProvider || !s.connected || !s.chainOk) {
      st.textContent = "Connect the owner wallet on " + window.DY_CONFIG.chain.name + " to operate the Price Desk.";
      pdSetControls(false); pdSetMarketsSwitch(false);
      return;
    }
    st.textContent = "Reading owner() from chain…";
    withEthers().then(function () {
      // RUNG4-FIX-1C — a malformed (bad-checksum) address is a CONFIG error: name it, never read (ethers would
      // throw "bad address checksum" and the failure would masquerade as busy). This was the actual RUNG4 defect.
      var addr = validAddr(c.waveCardSale);
      if (!addr) {
        pdSaleOwnerOk = false;
        st.innerHTML = "<span class='bad'>WaveCardSale address is malformed (bad checksum)</span> — fix the address in config.";
        pdSetControls(false); pdSetMarketsSwitch(false);
        if ($("pd-salesopen-state")) $("pd-salesopen-state").textContent = "—";
        return null; // short-circuit: do NOT read
      }
      var sale = new ethersRef.Contract(addr, WAVESALE_ABI, tamedProvider(PD_RPC)); // Fix A: tamed publicnode, not the wallet
      return Promise.all([sale.owner().catch(function () { return null; }), sale.salesOpen().catch(function () { return null; })]);
    }).then(function (r) {
      if (r === null) return; // malformed-address short-circuit (already rendered)
      if ($("pd-salesopen-state")) $("pd-salesopen-state").textContent = r[1] === null ? "busy" : (r[1] ? "OPEN" : "closed");
      // RUNG4-FIX-1 (Fix B) — busy is busy, never an accusation. A null owner() is a FAILED read (busy-sentinel),
      // NOT a definitive "not the owner". Three states: busy / genuine-mismatch / owner-ok.
      if (r[0] === null) {
        pdSaleOwnerOk = false;
        st.innerHTML = "<span class='bad'>Could not read owner() — the chain is busy.</span> Refresh to retry.";
        pdSetControls(false);
      } else if (eq(r[0], s.address)) {
        pdSaleOwnerOk = true;
        st.innerHTML = "<span class='ok'>Owner connected.</span> Press <b>LOAD CHAIN STATE</b> to read prices / caps / remaining.";
        pdSetControls(true);
      } else {
        pdSaleOwnerOk = false;
        st.innerHTML = "<span class='bad'>Connected wallet is not the WaveCardSale owner</span> — connect the master.";
        pdSetControls(false);
      }
      refreshMarketsSwitchGate();
    }).catch(function () {
      pdSaleOwnerOk = false;
      st.innerHTML = "<span class='bad'>Could not read owner() — the chain is busy.</span> Refresh to retry.";
      pdSetControls(false); pdSetMarketsSwitch(false);
    });
  }

  // marketsOpen switch is INDEPENDENTLY gated on WaveCardMarket (flag 1): dark on null address, else market.owner()==connected
  function refreshMarketsSwitchGate() {
    var c = cfg();
    var s = window.DYWallet.state;
    var stEl = $("pd-marketsopen-state");
    if (!c.waveCardMarket) { if (stEl) stEl.textContent = "NOT CONFIGURED"; pdSetMarketsSwitch(false); return; }
    if (!s.connected || !s.chainOk) { pdSetMarketsSwitch(false); return; }
    withEthers().then(function () {
      var addr = validAddr(c.waveCardMarket); // RUNG4-FIX-1C — malformed address is a config error, never read/busy
      if (!addr) { if (stEl) stEl.textContent = "malformed addr"; pdSetMarketsSwitch(false); return null; }
      var m = new ethersRef.Contract(addr, MARKET_ABI, tamedProvider(PD_RPC)); // Fix A: tamed publicnode, not the wallet
      return Promise.all([m.owner().catch(function () { return null; }), m.marketsOpen().catch(function () { return null; })]);
    }).then(function (r) {
      if (r === null) return; // malformed-address short-circuit (already rendered)
      if (stEl) stEl.textContent = r[1] === null ? "busy" : (r[1] ? "OPEN" : "closed");
      // Fix B: a null owner() read is busy, never a definitive not-owner → disable the switch, no false verdict.
      pdSetMarketsSwitch(r[0] !== null && eq(r[0], s.address));
    }).catch(function () { if (stEl) stEl.textContent = "busy"; pdSetMarketsSwitch(false); });
  }

  // the 261 live reads — ONLY on explicit LOAD/refresh (never auto), read-gen guarded, busy-sentinel per card
  function pdLoadChainState() {
    var c = cfg();
    if (!c.waveCardSale) return;
    var stEl = $("pd-load-status");
    var gen = ++pdReadGen;
    if (stEl) { stEl.textContent = "Reading chain (" + pdCatalog.length + " cards)…"; stEl.style.color = "var(--gold-aged)"; }
    withEthers().then(function () {
      var sale = new ethersRef.Contract(c.waveCardSale, WAVESALE_ABI, tamedProvider(PD_RPC)); // RUNG4-FIX-4: publicnode, not the wallet's weak RPC → prices load as numeric 0n, no busy-sentinel exclusion in APPLY
      return Promise.all(pdCatalog.map(function (w) {
        return Promise.all([
          sale.priceOf(w.cardId).catch(function () { return null; }),
          sale.supplyCap(w.cardId).catch(function () { return null; }),
          sale.remainingOf(w.cardId).catch(function () { return null; }),
        ]).then(function (r) { return { id: w.cardId, price: r[0], cap: r[1], remaining: r[2], busy: r[0] === null || r[1] === null || r[2] === null }; });
      }));
    }).then(function (results) {
      if (gen !== pdReadGen) return; // superseded by a newer LOAD
      var busyN = 0;
      results.forEach(function (r) {
        var tr = document.querySelector("#pd-catalog tr[data-card='" + r.id + "']");
        if (!tr) return;
        if (r.busy) {
          busyN++;
          tr.querySelector(".pd-price").innerHTML = "<span class='bad'>busy</span>";
          tr.querySelector(".pd-cap").innerHTML = "<span class='bad'>busy</span>";
          tr.querySelector(".pd-remaining").innerHTML = "<span class='bad'>busy</span>";
          pdChain[r.id] = "busy";
        } else {
          tr.querySelector(".pd-price").textContent = ethersRef.formatUnits(r.price, 18);
          tr.querySelector(".pd-cap").textContent = r.cap.toString();
          tr.querySelector(".pd-remaining").textContent = r.remaining.toString();
          pdChain[r.id] = { price: r.price, cap: r.cap, remaining: r.remaining };
        }
      });
      if (stEl) {
        stEl.textContent = busyN ? busyN + " card(s) unavailable — the chain is busy. Refresh to retry." : "Loaded " + results.length + " cards.";
        stEl.style.color = busyN ? "var(--vermilion)" : "var(--gold-aged)";
      }
    }).catch(function () {
      if (gen !== pdReadGen) return;
      if (stEl) { stEl.textContent = "Could not read the chain — busy or unreachable. Refresh to retry."; stEl.style.color = "var(--vermilion)"; }
    });
  }

  function pdReviewMsg(t) { var r = $("pd-review"); if (r) r.innerHTML = "<div class='q'>" + escHtml(t) + "</div>"; }

  // Apply per-rarity defaults to UNPRICED cards (+ any per-card override, which always applies); stage a setPrices batch
  function pdApplyUnpriced() {
    if (!Object.keys(pdChain).length) { pdReviewMsg("Load chain state first — the desk must know which cards are unpriced."); return; }
    withEthers().then(function () {
      var defaults = {};
      PD_RARITIES.forEach(function (r) { var v = (($("pd-def-" + r) || {}).value || "").trim(); if (v) defaults[r] = v; });
      var anyDefault = Object.keys(defaults).length > 0;
      var ids = [], prices = [], rows = [];
      // RUNG4-FIX-4 — tally WHY a card was not staged so a 0-row result is NEVER silent (busy-sentinel: an unread
      // card's price is UNKNOWN, never treated as "priced"). Reasons: unread(busy/unloaded) / alreadyPriced /
      // noValue(no default+no override) / unparseable(parseUnits threw or resolved 0).
      var ex = { unread: 0, alreadyPriced: 0, noValue: 0, unparseable: 0 };
      pdCatalog.forEach(function (w) {
        var ch = pdChain[w.cardId];
        var ovEl = document.querySelector(".pd-override[data-card='" + w.cardId + "']");
        var override = (ovEl && ovEl.value || "").trim();
        var human = override || defaults[w.rarity];
        if (!human) { if (!override) ex.noValue++; return; }
        if (!override) {
          // the DEFAULT path touches ONLY on-chain-unpriced cards — and needs a KNOWN price to decide that.
          if (!ch || ch === "busy") { ex.unread++; return; } // UNKNOWN, not "priced" — surfaced, never staged silently
          if (ch.price !== 0n) { ex.alreadyPriced++; return; }
        }
        var wei;
        try { wei = ethersRef.parseUnits(human, 18); } catch (e) { ex.unparseable++; return; }
        if (wei === 0n) { ex.unparseable++; return; } // zero-price law: never stage a 0
        ids.push(w.cardId); prices.push(wei);
        rows.push("<tr><td>" + escHtml(w.name) + " <span style='color:var(--gold-aged)'>#" + w.cardId + "</span></td><td class='mono'>" + escHtml(human) + " DYC</td><td>" + (override ? "override" : "default " + w.rarity) + "</td></tr>");
      });
      if (!ids.length) {
        var reasons = [];
        if (!anyDefault) reasons.push("no rarity defaults entered (and no per-card overrides)");
        if (ex.unread) reasons.push(ex.unread + " unread — refresh LOAD CHAIN STATE (chain busy)");
        if (ex.alreadyPriced) reasons.push(ex.alreadyPriced + " already priced");
        if (ex.unparseable) reasons.push(ex.unparseable + " with an unparseable value (check the numbers — no commas)");
        if (anyDefault && ex.noValue) reasons.push(ex.noValue + " with no default for their rarity");
        if (!reasons.length) reasons.push("no cards matched");
        pdReviewMsg("0 cards staged: " + reasons.join("; ") + ".");
        return;
      }
      pdRenderBatchReview("prices", "setPrices", ids, prices, rows, ["Card", "Price", "Source"]);
    }).catch(function (e) { pdReviewMsg("Could not stage: " + decodeErr(e)); });
  }

  // Seed caps from the registry supply for cards whose ON-CHAIN cap is 0 — NEVER overwrites a nonzero cap
  function pdSeedCaps() {
    if (!Object.keys(pdChain).length) { pdReviewMsg("Load chain state first."); return; }
    var ids = [], caps = [], rows = [], mismatched = 0;
    pdCatalog.forEach(function (w) {
      var ch = pdChain[w.cardId];
      if (!ch || ch === "busy") return;
      if (ch.cap === 0n) {
        ids.push(w.cardId); caps.push(BigInt(w.supply));
        rows.push("<tr><td>" + escHtml(w.name) + " <span style='color:var(--gold-aged)'>#" + w.cardId + "</span></td><td class='mono'>" + w.supply + "</td><td>" + w.rarity + "</td></tr>");
      } else if (ch.cap !== BigInt(w.supply)) { mismatched++; }
    });
    if (!ids.length) {
      pdReviewMsg("No unset caps to seed" + (mismatched ? " — " + mismatched + " card(s) have a different nonzero cap (the seed NEVER overwrites; change those per-card if intended)." : "."));
      return;
    }
    pdRenderBatchReview("caps", "setSupplyCaps", ids, caps, rows, ["Card", "Cap", "Rarity"]);
  }

  function pdRenderBatchReview(kind, fnLabel, ids, values, rows, heads) {
    var r = $("pd-review");
    if (!r) return;
    r.innerHTML = "<div class='confirm' style='margin-top:0.6rem'><b>Review — " + fnLabel + " (" + ids.length + " card" + (ids.length === 1 ? "" : "s") + "):</b>" +
      "<table class='pd-table' style='width:100%;border-collapse:collapse;font-size:0.82rem'><thead><tr style='text-align:left'><th>" + heads.join("</th><th>") + "</th></tr></thead><tbody>" +
      rows.join("") + "</tbody></table><div class='row-actions'><button class='btn' id='pd-send-batch'>Send " + fnLabel + "</button> " +
      "<button class='btn' id='pd-cancel-batch'>Cancel</button> <span id='pd-review-msg' class='mono' style='font-size:0.78rem;color:var(--gold-aged)'></span></div></div>";
    $("pd-cancel-batch").onclick = function () { r.innerHTML = ""; };
    $("pd-send-batch").onclick = function () { $("pd-send-batch").disabled = true; pdSendBatch(kind, ids, values); };
  }

  function pdSendBatch(kind, ids, values) {
    var c = cfg();
    var msg = $("pd-review-msg");
    withEthers().then(function () {
      var provider = new ethersRef.BrowserProvider(window.ethereum);
      return provider.getSigner().then(function (signer) {
        var sale = new ethersRef.Contract(c.waveCardSale, WAVESALE_ABI, signer);
        var call = kind === "prices" ? sale.setPrices : sale.setSupplyCaps;
        if (msg) msg.textContent = "Simulating…";
        return call.staticCall(ids, values).then(function () {
          if (msg) msg.textContent = "Confirm in your wallet…";
          return feeOverrides(provider).then(function (fee) {
            return call(ids, values, Object.assign({ gasLimit: 120000 + 45000 * ids.length }, fee)).then(function (tx) { return tx.wait(); });
          });
        });
      });
    }).then(function () {
      if (msg) { msg.textContent = ids.length + " " + (kind === "prices" ? "price" : "cap") + "(s) set."; msg.style.color = "var(--flame-core)"; }
      pdLoadChainState();
    }).catch(function (e) {
      if (msg) { msg.textContent = "Could not send: " + decodeErr(e); msg.style.color = "var(--vermilion)"; }
      var b = $("pd-send-batch"); if (b) b.disabled = false;
    });
  }

  // the live-fire switches — OPENING requires the typed word OPEN (a misclick cannot go live); closing is unguarded (safe)
  function pdToggle(which, open) {
    var c = cfg();
    var isSale = which === "sales";
    var addr = isSale ? c.waveCardSale : c.waveCardMarket;
    var abi = isSale ? WAVESALE_ABI : MARKET_ABI;
    var wordEl = $(isSale ? "pd-salesopen-word" : "pd-marketsopen-word");
    var msg = $(isSale ? "pd-salesopen-msg" : "pd-marketsopen-msg");
    if (open && (wordEl.value || "").trim() !== "OPEN") { msg.textContent = "Type OPEN to arm the open switch."; msg.style.color = "var(--vermilion)"; return; }
    withEthers().then(function () {
      var provider = new ethersRef.BrowserProvider(window.ethereum);
      return provider.getSigner().then(function (signer) {
        var ct = new ethersRef.Contract(addr, abi, signer);
        var call = isSale ? ct.setSalesOpen : ct.setMarketsOpen;
        msg.textContent = "Simulating…";
        return call.staticCall(open).then(function () {
          msg.textContent = "Confirm in your wallet…";
          return feeOverrides(provider).then(function (fee) {
            return call(open, Object.assign({ gasLimit: 60000 }, fee)).then(function (tx) { return tx.wait(); });
          });
        });
      });
    }).then(function () {
      msg.textContent = (isSale ? "salesOpen" : "marketsOpen") + " = " + open + "."; msg.style.color = "var(--flame-core)";
      wordEl.value = "";
      if (isSale) refreshPriceDeskGate(); else refreshMarketsSwitchGate();
    }).catch(function (e) { msg.textContent = "Could not set: " + decodeErr(e); msg.style.color = "var(--vermilion)"; });
  }

  function wirePriceDesk() {
    if ($("pd-load")) $("pd-load").onclick = function () { pdLoadChainState(); };
    if ($("pd-refresh")) $("pd-refresh").onclick = function () { pdLoadChainState(); };
    if ($("pd-apply-unpriced")) $("pd-apply-unpriced").onclick = pdApplyUnpriced;
    if ($("pd-seed-caps")) $("pd-seed-caps").onclick = pdSeedCaps;
    if ($("pd-salesopen-open")) $("pd-salesopen-open").onclick = function () { pdToggle("sales", true); };
    if ($("pd-salesopen-close")) $("pd-salesopen-close").onclick = function () { pdToggle("sales", false); };
    if ($("pd-marketsopen-open")) $("pd-marketsopen-open").onclick = function () { pdToggle("markets", true); };
    if ($("pd-marketsopen-close")) $("pd-marketsopen-close").onclick = function () { pdToggle("markets", false); };
  }

  function mount() {
    // S-ADMIN-CONNECT — bring the status strip + wallet up FIRST, before any panel wiring can throw, so the owner
    // always has a visible connection state + a Connect button no matter what happens below.
    window.DYWallet.onChange(function () { renderStatusStrip(); refreshGate(); });
    window.DYWallet.init(); // sets hasProvider synchronously, then a silent eth_accounts (no prompt) → onChange
    renderStatusStrip();

    // Approve Buyers (M-F2)
    if ($("approve-sign")) $("approve-sign").onclick = runApprove;
    if ($("approve-download")) $("approve-download").onclick = downloadAllowlist;
    if ($("registry-load")) $("registry-load").onclick = loadRegistry;
    if ($("registry-csv")) $("registry-csv").onclick = downloadRegistryCsv;
    // Access panel
    $("acc-review").onclick = function () {
      prepareDrop("access", {
        confirmEl: $("acc-confirm"),
        resultsEl: $("acc-results"),
        singleEl: $("acc-addr"),
        batchEl: $("acc-batch"),
        cardId: null,
        cardLabel: null,
      });
    };
    // Wave panel
    $("wave-review").onclick = function () {
      var sel = $("wave-pick");
      if (!sel.value) {
        $("wave-confirm").innerHTML = "<div class='q'>Choose a wave card first.</div>";
        return;
      }
      prepareDrop("wave", {
        confirmEl: $("wave-confirm"),
        resultsEl: $("wave-results"),
        singleEl: $("wave-addr"),
        batchEl: $("wave-batch"),
        cardId: Number(sel.value),
        cardLabel: sel.options[sel.selectedIndex].text.trim(),
      });
    };
    // Coin panel (S9)
    if ($("coin-review")) $("coin-review").onclick = prepareCoinDrop;
    if ($("coin-refresh-bal")) $("coin-refresh-bal").onclick = refreshCoinBalance;
    // History
    $("hist-refresh").onclick = function () {
      histLoaded = false;
      loadHistory();
    };
    // Robot Registry (M-F5) — read-only; independent of the wallet gate
    if ($("robot-load")) { $("robot-load").onclick = loadRobotRegistry; migrateRobotCreds(); }
    // TORANA Release (S-TORANA-1) — independent minter gate (refreshToranaPanel runs inside refreshGate)
    if ($("torana-find")) $("torana-find").onclick = toranaFindEligible;
    if ($("torana-release")) $("torana-release").onclick = toranaRelease;
    // Drop Desk (M-F6)
    if ($("drop-sign")) {
      loadDeskCoupons(); renderDeskCoupons();
      $("drop-sign").onclick = runDropSign;
      $("drop-download").onclick = downloadDeskCoupons;
      $("drop-merge").onclick = mergePublishedCoupons;
      if ($("drop-robot")) $("drop-robot").onclick = publishViaRobot; // S-ROBOT-COUPON-1
      $("drop-clear").onclick = function () { if (confirm("Clear this local coupon batch? (The published file is not affected.)")) { deskCoupons = []; saveDeskCoupons(); renderDeskCoupons(); } };
      $("drop-cancel-btn").onclick = runDropCancel;
      $("drop-figures-load").onclick = loadDeskFigures;
    }
    // Process Claim / Grant Rewards (S-CLAIM-2B)
    if ($("grant-btn")) {
      $("grant-btn").onclick = processClaimGrant;
      $("grant-ledger-load").onclick = loadGrantLedger;
    }
    // Configuration
    $("cfg-save").onclick = saveCfg;
    $("cfg-clear").onclick = clearCfg;

    buildPicker();
    buildPriceDesk(); // LEG2 — registry-driven catalog table (renders always; chain columns wake on LOAD)
    wirePriceDesk();
    fillCfgForm();
    // wallet init + onChange are registered at the TOP of mount (S-ADMIN-CONNECT), so the status strip is live first.
  }

  return { mount: mount };
})();
