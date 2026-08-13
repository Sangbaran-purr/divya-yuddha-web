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

  // --- init: detect provider, read already-authorized accounts WITHOUT a popup ---
  function init() {
    var eth = window.ethereum;
    state.hasProvider = !!eth;
    if (!eth) {
      emit();
      return;
    }
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
  var LOG_CHUNK = 9999; // < 10000 — the archive-RPC cap (admin.js LOG_CHUNK precedent)
  function ckptGet(key) {
    try { var v = window.localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function ckptSet(key, obj) {
    try { window.localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* private mode / quota — scan still works, just not O(delta) */ }
  }
  function scanLogsResumable(contract, filter, deployBlock, deadlineAt, ckptKey) {
    var ck = ckptGet(ckptKey) || {};
    var candSet = {};
    (ck.candidates || []).forEach(function (t) { candSet[t] = true; });
    var resumeFrom = ck.scannedTo && ck.scannedTo >= deployBlock ? ck.scannedTo + 1 : deployBlock;
    return readProvider().getBlockNumber().then(function (latest) {
      function scanFrom(start) {
        if (start > latest) return Promise.resolve(true); // reached latest → complete
        var end = Math.min(start + LOG_CHUNK, latest);
        return withRetry(function () { return contract.queryFilter(filter, start, end); }, 3, deadlineAt)
          .then(function (evs) {
            evs.forEach(function (e) { candSet[e.args.tokenId.toString()] = true; });
            ckptSet(ckptKey, { scannedTo: end, candidates: Object.keys(candSet) }); // persist progress per chunk
            if (Date.now() > deadlineAt) return false; // incomplete — but the checkpoint advanced
            return scanFrom(end + 1);
          });
      }
      return scanFrom(resumeFrom).then(function (complete) {
        return { candidates: Object.keys(candSet), complete: complete };
      });
    });
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
