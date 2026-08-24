/* ============================================================================
   DYWallet — wallet-is-identity for The Threshold (Phase A).
   Laws: NO wallet popup on load; every chain action is behind an explicit
   click; every state is sensible with no wallet installed (read-only + a
   "forge one" prompt). No accounts, no email, no passwords. No client mint
   path exists (AccessNFT.mint is onlyMinter) — the claim is dormant by design.
   ========================================================================= */
window.DYWallet = (function () {
  var CFG = window.DY_CONFIG;
  var ACCESS_ABI = ["function balanceOf(address owner) view returns (uint256)"];

  var state = {
    hasProvider: false,
    connected: false,
    address: null,
    chainId: null,
    chainOk: false,
    isHolder: null, // null = unknown/unchecked
    ethersReady: false,
    // S-WALLET-DETECT — patient-detection context. A provider (esp. a mobile in-app wallet browser) can inject
    // window.ethereum a beat AFTER our scripts run, so surfaces must NOT render a "no wallet" message until
    // absenceConcluded flips true (grace window expired with nothing found).
    inApp: false, // mobile in-app wallet browser (MetaMask/Trust/Coinbase)
    isMobile: false, // coarse UA
    absenceConcluded: false, // true only once detection finishes with no provider
  };
  var listeners = [];
  function emit() {
    listeners.forEach(function (fn) {
      try {
        fn(state);
      } catch (e) {
        /* a subscriber error must not break the gate */
      }
    });
  }
  function onChange(fn) {
    listeners.push(fn);
    fn(state);
  }

  function shortAddr(a) {
    return a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
  }

  // --- lazy-load ethers only when a chain action is first requested ---
  var ethersPromise = null;
  function loadEthers() {
    if (window.ethers) {
      state.ethersReady = true;
      return Promise.resolve(window.ethers);
    }
    if (ethersPromise) return ethersPromise;
    ethersPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = CFG.ethers.cdn;
      s.async = true;
      s.onload = function () {
        state.ethersReady = !!window.ethers;
        resolve(window.ethers);
      };
      s.onerror = function () {
        reject(new Error("ethers failed to load"));
      };
      document.head.appendChild(s);
    });
    return ethersPromise;
  }

  // --- S-WALLET-DETECT: PATIENT provider detection ---
  //     Root cause of the owner's phone walk: init() sampled window.ethereum ONCE, synchronously, and concluded
  //     absence on that instant check — but a mobile in-app wallet browser (MetaMask et al.) injects the provider a
  //     beat AFTER our scripts run. Now we listen for the EIP-6963 announce AND the legacy 'ethereum#initialized'
  //     signal AND poll window.ethereum over a grace window; FIRST success wins, and absence is concluded only when
  //     the grace expires with nothing found (state.absenceConcluded). Surfaces render "no wallet" only after that.
  var DETECT_GRACE_MS = 3000, DETECT_STEP_MS = 250;
  var wired = false; // wire the provider's event listeners exactly once (retry-safe)
  function isMobileUA() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ""); }
  function detectContext(eth) {
    var ua = navigator.userAgent || "";
    state.isMobile = isMobileUA();
    // in-app wallet browser = a MOBILE context whose UA marks a wallet, or whose injected provider self-IDs as one.
    // (A desktop MetaMask extension is NOT an in-app browser → inApp stays false there.)
    state.inApp = state.isMobile && (/MetaMask|Trust|Coinbase/i.test(ua) || !!(eth && (eth.isMetaMask || eth.isTrust || eth.isCoinbaseWallet)));
  }
  function waitForProvider() {
    return new Promise(function (resolve) {
      if (window.ethereum) { resolve(window.ethereum); return; }
      var done = false, timer = null;
      function finish(eth) { if (done) return; done = true; cleanup(); resolve(eth || null); }
      function on6963(ev) { try { var p = ev && ev.detail && ev.detail.provider; if (p) { if (!window.ethereum) window.ethereum = p; finish(p); } } catch (e) {} }
      function onInit() { if (window.ethereum) finish(window.ethereum); }
      function cleanup() {
        if (timer) clearInterval(timer);
        window.removeEventListener("eip6963:announceProvider", on6963);
        window.removeEventListener("ethereum#initialized", onInit);
      }
      window.addEventListener("eip6963:announceProvider", on6963);
      try { window.dispatchEvent(new Event("eip6963:requestProvider")); } catch (e) {}
      window.addEventListener("ethereum#initialized", onInit);
      var elapsed = 0;
      timer = setInterval(function () {
        if (window.ethereum) { finish(window.ethereum); return; }
        elapsed += DETECT_STEP_MS;
        if (elapsed >= DETECT_GRACE_MS) finish(null);
      }, DETECT_STEP_MS);
    });
  }
  function onProviderReady(eth) {
    state.hasProvider = true;
    state.absenceConcluded = false;
    detectContext(eth);
    // eth_accounts does NOT prompt — it returns [] unless already authorized.
    eth
      .request({ method: "eth_accounts" })
      .then(function (accts) {
        if (accts && accts.length) {
          state.connected = true;
          state.address = accts[0];
          return refreshChain().then(afterConnect);
        }
      })
      .catch(function () {})
      .finally(emit);

    if (!wired) {
      wired = true;
      eth.on &&
        eth.on("accountsChanged", function (accts) {
          if (!accts || !accts.length) {
            state.connected = false;
            state.address = null;
            state.isHolder = null;
          } else {
            state.address = accts[0];
            state.isHolder = null;
            afterConnect();
          }
          emit();
        });
      eth.on &&
        eth.on("chainChanged", function () {
          refreshChain().then(emit);
        });
    }
  }
  function concludeAbsence() {
    state.hasProvider = false;
    state.absenceConcluded = true;
    detectContext(null);
    emit();
  }
  function init() {
    if (window.ethereum) { onProviderReady(window.ethereum); return; }
    // not present YET — set the UA context for any interim render, but do NOT conclude absence until the grace ends.
    detectContext(null);
    state.absenceConcluded = false;
    waitForProvider().then(function (eth) { if (eth) onProviderReady(eth); else concludeAbsence(); });
  }
  // S-WALLET-DETECT: the Retry button re-runs detection. Idempotent — listeners wire once (the `wired` guard).
  function retry() { init(); }
  // S-WALLET-DETECT: mobile deep link into MetaMask's in-app browser for a given page (no-wallet, non-in-app path).
  function mmDeepLink(pagePath) { return "https://metamask.app.link/dapp/divyayuddha.games/" + String(pagePath || "").replace(/^\/+/, ""); }

  function refreshChain() {
    return window.ethereum
      .request({ method: "eth_chainId" })
      .then(function (idHex) {
        state.chainId = parseInt(idHex, 16);
        state.chainOk = state.chainId === CFG.chain.id;
      })
      .catch(function () {});
  }

  // --- connect: explicit click only (eth_requestAccounts DOES prompt) ---
  function connect() {
    if (!window.ethereum) return Promise.reject(new Error("no-provider"));
    return window.ethereum
      .request({ method: "eth_requestAccounts" })
      .then(function (accts) {
        state.connected = true;
        state.address = accts[0];
        return refreshChain();
      })
      .then(afterConnect)
      .then(function () {
        emit();
        return state;
      });
  }

  // --- cross to Amoy: switch, and add on 4902 (unknown chain) ---
  function ensureChain() {
    if (!window.ethereum) return Promise.reject(new Error("no-provider"));
    return window.ethereum
      .request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CFG.chain.idHex }],
      })
      .catch(function (err) {
        if (err && (err.code === 4902 || err.code === -32603)) {
          return window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: CFG.chain.idHex,
                chainName: CFG.chain.name,
                nativeCurrency: CFG.chain.nativeCurrency,
                rpcUrls: CFG.chain.rpcUrls,
                blockExplorerUrls: CFG.chain.blockExplorerUrls,
              },
            ],
          });
        }
        throw err;
      })
      .then(refreshChain)
      .then(function () {
        emit();
        return state;
      });
  }

  // --- RUNG4-FIX-3 — THE SITE READ ROAD. A tamed public JSON-RPC provider (publicnode via chain.readRpcUrls[0]),
  //     shared by every read surface (store / treasury / rite / this holder gate). staticNetwork:true means NO
  //     eth_chainId auto-detection → NO "failed to detect network, retry in 1s" loop against a dead endpoint; the
  //     FetchRequest timeout + maxAttempts 2 fail FAST so a caller renders its busy-sentinel instead of spinning.
  //     Reads only — NEVER the wallet's BrowserProvider (which rides whatever RPC the wallet registered; dead for
  //     users on the old rpcUrls). Writes stay on the wallet signer, untouched. Requires ethers loaded (callers
  //     invoke this inside loadEthers().then). ---
  function readProvider() {
    var e = window.ethers;
    var url = (CFG.chain.readRpcUrls && CFG.chain.readRpcUrls[0]) || CFG.chain.rpcUrls[0];
    var req = new e.FetchRequest(url);
    req.timeout = 10000; // 10s hard cap per request (ethers default is 300s)
    req.setThrottleParams({ maxAttempts: 2 }); // fail fast — no exponential-backoff retry storm
    return new e.JsonRpcProvider(req, CFG.chain.id, { staticNetwork: true });
  }

  // --- RUNG4-FIX-6 — PLAYER SEND FEE FLOOR (owner ruling 2026-08-13; supersedes the D2 no-player-feeOverrides rule
  //     in exactly this scope). Amoy's node floor is 25 gwei on the priority tip; a stale wallet RPC prices ~2 gwei
  //     → eth_sendRawTransaction rejects. So player writes carry FEE-FIELD-ONLY overrides: maxFeePerGas /
  //     maxPriorityFeePerGas read from the PUBLICNODE signal (readProvider, not the wallet's weak RPC) and floored at
  //     the 45/30 ceremony pattern on EVERY path (normal / zero-basis / catch) — NEVER {}. gasLimit stays
  //     wallet-estimated; MetaMask renders these as editable site-suggested fees. Returns {maxFeePerGas,
  //     maxPriorityFeePerGas}. ---
  var FEE_FLOOR_MAX = 45000000000n; // 45 gwei — maxFeePerGas floor (ceremony ceiling)
  var FEE_FLOOR_TIP = 30000000000n; // 30 gwei — maxPriorityFeePerGas floor (> Amoy's 25 gwei node minimum)
  var FEE_HEADROOM = 2n; // 2x over the live signal
  function feeFloor(ceil, prio) {
    if (ceil < FEE_FLOOR_MAX) ceil = FEE_FLOOR_MAX;
    if (prio < FEE_FLOOR_TIP) prio = FEE_FLOOR_TIP;
    if (ceil < prio) ceil = prio; // maxFee must be ≥ priority
    return { maxFeePerGas: ceil, maxPriorityFeePerGas: prio };
  }
  function feeOverrides() {
    return readProvider()
      .getFeeData()
      .then(function (fd) {
        var gp = fd.gasPrice || 0n;
        var mf = fd.maxFeePerGas || 0n;
        var basis = gp > mf ? gp : mf;
        return feeFloor(basis * FEE_HEADROOM, basis * FEE_HEADROOM); // basis 0n → the explicit floor applies
      })
      .catch(function () {
        return feeFloor(0n, 0n); // fee read failed → the explicit 45/30 floor, NEVER {} (Amoy rejects sub-floor tips)
      });
  }

  // --- RUNG4-FIX-7B — THE RESUMABLE, CHECKPOINTED getLogs SCAN LAW. publicnode/drpc hang on a single getLogs > ~10k
  //     blocks, and the deployBlock→latest range grows ~40k blocks/day forever, so a fresh O(history) scan every
  //     refresh (12 chunks today, more tomorrow) is structurally fragile: on a variable network ONE stalled chunk
  //     (10s FetchRequest timeout) can eat the whole deadline and fail the load. So:
  //       • persist a per-wallet checkpoint in localStorage (dyw::<key>) = { scannedTo, candidates:[tokenId strings] };
  //       • RESUME from scannedTo+1 (deployBlock on first visit), chunk forward <=LOG_CHUNK, and PERSIST after EACH
  //         successful chunk — a stall/deadline keeps its progress, so the next refresh continues, not restarts;
  //       • O(delta) on repeat visits (usually 1 chunk), O(history) only on the never-completed first pass.
  //     Returns { candidates:[tokenId string], complete:bool } — the caller re-verifies each candidate (ownerOf /
  //     listingOf) and applies its completeness gate; an incomplete scan renders BUSY while the checkpoint advances
  //     behind the busy face (owner ruling). SEQUENTIAL — no parallel chunks (gentle on the free-tier getLogs class). ---
  //     RUNG4-FIX-7C hardening (owner ruling): (1) a SHARED SINGLE-FLIGHT QUEUE — getLogs scans run ONE at a time,
  //     so the shelf's deep chunk 1 is no longer starved by the concurrent near-head listings scan (both fired on
  //     connect); the shelf is enqueued first (readHoldings before renderListings). (2) an onProgress(scannedTo,
  //     from, latest) callback drives the busy face's "walked N of M blocks" register. (3) a per-chunk ARCHIVE
  //     FAILOVER — publicnode primary, drpc (chain.rpcUrls[1], archive-capable) on a chunk failure (admin
  //     historyProvider precedent). (4) the deadline is a DURATION computed at RUN-start, so a scan queued behind
  //     another gets a fresh budget, not a clock that ran down while it waited.
  // S-TREASURY-SCAN-FIX-1 (owner-folded fix): a chunk spans start..start+LOG_CHUNK INCLUSIVE, so 9999 → 10000 blocks.
  // publicnode accepts a 10000-block range, but the drpc free-plan ARCHIVE FAILOVER rejects it (-32701 "ranges over
  // 10000 blocks are not supported on free plan"), which left the failover effectively dead for full chunks. 9998 → a
  // 9999-block span, under BOTH caps, so the archive failover actually works when publicnode drops a chunk.
  var LOG_CHUNK = 9998; // 9999-block inclusive span — under publicnode's 10000 cap AND drpc free-plan's <10000 cap
  // S-TREASURY-SCAN-FIX-1 FIX 2 — HEAD BUFFER: the freshest window is never PERSISTED as scanned, so it is re-scanned
  // every visit. Replica lag on load-balanced public RPCs lives in the most recent blocks; a successful-but-empty
  // getLogs there previously advanced scannedTo past a just-landed mint (candidates empty) and bookmarked it away
  // forever. 128 blocks ≈ 4–5 min on Polygon (~2.1–2.3s/block) — comfortably beyond typical replica lag and shallow
  // reorg depth, while keeping the re-scanned delta tiny. Candidates found INSIDE the buffer still render immediately;
  // the buffer caps only what is PERSISTED as scanned, never the scan extent (which still reaches latest).
  var HEAD_BUFFER = 128;
  var scanQueue = Promise.resolve(); // single-flight: one getLogs scan at a time (shelf then listings)
  function ckptGet(key) {
    try { var v = window.localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function ckptSet(key, obj) {
    try { window.localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* private mode / quota — scan still works, just not O(delta) */ }
  }
  function tamedOn(url) { // tamed provider on an explicit endpoint (drpc archive failover; publicnode is readProvider())
    var e = window.ethers;
    var req = new e.FetchRequest(url);
    req.timeout = 10000; req.setThrottleParams({ maxAttempts: 2 });
    return new e.JsonRpcProvider(req, CFG.chain.id, { staticNetwork: true });
  }
  // deadlineMs is a DURATION (run-start budget); onProgress(scannedTo, deployBlock, latest) is optional.
  function scanLogsResumable(contract, filter, deployBlock, deadlineMs, ckptKey, onProgress) {
    function run() {
      var deadlineAt = Date.now() + (deadlineMs || 18000);
      var ck = ckptGet(ckptKey) || {};
      var candSet = {};
      (ck.candidates || []).forEach(function (t) { candSet[t] = true; });
      var resumeFrom = ck.scannedTo && ck.scannedTo >= deployBlock ? ck.scannedTo + 1 : deployBlock;
      var archiveUrl = CFG.chain.rpcUrls && CFG.chain.rpcUrls[1]; // drpc — the archive failover endpoint
      var archiveContract = null;
      function readChunk(start, end) {
        return withRetry(function () { return contract.queryFilter(filter, start, end); }, 2, deadlineAt)
          .catch(function (e) {
            if (!archiveUrl || !contract.target) throw e; // no failover available → surface the failure
            if (!archiveContract) archiveContract = new window.ethers.Contract(contract.target, contract.interface, tamedOn(archiveUrl));
            return archiveContract.queryFilter(filter, start, end); // FAILOVER: this chunk on drpc archive
          });
      }
      return readProvider().getBlockNumber().then(function (latest) {
        if (onProgress) { try { onProgress(Math.min(resumeFrom, latest), deployBlock, latest); } catch (e) {} }
        function scanFrom(start) {
          if (start > latest) return Promise.resolve(true); // reached latest → complete
          var end = Math.min(start + LOG_CHUNK, latest);
          return readChunk(start, end).then(function (evs) {
            evs.forEach(function (ev) { candSet[ev.args.tokenId.toString()] = true; });
            // FIX 2 — persist scannedTo no higher than latest-HEAD_BUFFER (never bookmark the freshest window). A chunk
            // whose whole extent sits inside the buffer (contract younger than HEAD_BUFFER) writes nothing → full
            // re-scan next visit, which is correct for a brand-new contract. Candidates already captured above.
            var persistTo = Math.min(end, latest - HEAD_BUFFER);
            if (persistTo >= deployBlock) ckptSet(ckptKey, { scannedTo: persistTo, candidates: Object.keys(candSet) }); // persist progress per chunk
            if (onProgress) { try { onProgress(end, deployBlock, latest); } catch (e) {} }
            if (Date.now() > deadlineAt) return false; // incomplete — but the checkpoint advanced
            return scanFrom(end + 1);
          });
        }
        return scanFrom(resumeFrom).then(function (complete) {
          return { candidates: Object.keys(candSet), complete: complete };
        });
      });
    }
    var p = scanQueue.then(run, run); // run regardless of the prior scan's outcome (shelf then listings)
    scanQueue = p.catch(function () {}); // keep the queue alive even if this scan rejects
    return p;
  }

  // --- scan-road helpers (S-REGISTRY-HIST lineage): withRetry + sleep, for the chunked scan above ---
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function withRetry(fn, tries, deadlineAt) {
    return fn().catch(function (e) {
      if (tries <= 1 || Date.now() > deadlineAt) throw e;
      return sleep(400).then(function () { return withRetry(fn, tries - 1, deadlineAt); });
    });
  }

  // --- holder check: AccessNFT.balanceOf > 0. Fails GRACEFULLY (placeholder
  //     addresses / undeployed rehearsal contract) -> treated as non-holder. ---
  function checkHolder() {
    if (!state.connected || !state.chainOk) {
      state.isHolder = null;
      return Promise.resolve(null);
    }
    return loadEthers()
      .then(function (ethers) {
        var c = new ethers.Contract(CFG.contracts.accessNFT, ACCESS_ABI, readProvider());
        return c.balanceOf(state.address);
      })
      .then(function (bal) {
        state.isHolder = bal > 0n;
        emit();
        return state.isHolder;
      })
      .catch(function () {
        // no live contract at the placeholder address -> honestly "not yet a holder"
        state.isHolder = false;
        emit();
        return false;
      });
  }

  function afterConnect() {
    // warm ethers in the background once a session exists; never blocks the UI
    loadEthers().catch(function () {});
    return refreshChain();
  }

  return {
    state: state,
    onChange: onChange,
    init: init,
    retry: retry, // S-WALLET-DETECT — re-run patient detection (the Retry button)
    mmDeepLink: mmDeepLink, // S-WALLET-DETECT — mobile "Open in MetaMask" deep link for a page path
    connect: connect,
    ensureChain: ensureChain,
    checkHolder: checkHolder,
    loadEthers: loadEthers,
    readProvider: readProvider, // RUNG4-FIX-3 — the shared tamed publicnode read road (store/treasury/rite reuse this)
    feeOverrides: feeOverrides, // RUNG4-FIX-6 — player-send fee-field floor (45/30 via publicnode); gasLimit stays wallet
    scanLogsResumable: scanLogsResumable, // RUNG4-FIX-7B — resumable checkpointed getLogs scan (treasury discover + store scanMyListings)
    shortAddr: shortAddr,
  };
})();
