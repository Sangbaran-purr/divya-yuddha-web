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
    isHolder: null, // null = unknown/unchecked OR read failed (see holderReadFailed)
    holderReadFailed: false, // S-GATE-1 (P5): true when a checkHolder READ threw (dead/throttled RPC) — distinct from a real zero; the gate shows "busy - refresh to retry", never the non-holder door
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

  // --- RUNG4-FIX-3 / STORE-READ-1 — THE SITE READ ROAD. ONE road, shared by the store, the treasury, the rite and
  //     the holder gate. Reads only — NEVER the wallet's BrowserProvider (which rides whatever RPC the wallet
  //     registered). Writes stay on the wallet signer, untouched.
  //
  //     WHY THIS EXISTS (STORE-READ-1, 2026-09-29): the road had ONE endpoint. A buyer in the Philippines whose DNS
  //     never resolved polygon-bor-rpc.publicnode.com saw every read fail with ERR_NAME_NOT_RESOLVED, and the store
  //     told him "stock unavailable" — a verdict, from a page that had simply never reached the chain. The list in
  //     config.chain.readRpcUrls was already plural; only [0] was ever used. Now the road WALKS it.
  //
  //     THE FALL-THROUGH RULE IS AN ALLOW-LIST, NOT A DENY-LIST. Measured: a genuine revert is CALL_EXCEPTION in
  //     node, but a browser-blocked host is a bare `TypeError: Failed to fetch` carrying no ethers code at all. Any
  //     enumeration of "network errors" is therefore wrong on one of the two runtimes. So the rule is inverted: we
  //     fall through on ANYTHING that is not a contract answer or a contract revert. A revert — CALL_EXCEPTION, or
  //     any error carrying revert data — is a real answer from a real chain and NEVER moves to the next endpoint.
  //
  //     CHAIN CHECK (owner ruling 5): staticNetwork:true skips ethers' own network detection, which is what keeps a
  //     dead endpoint from spinning the "failed to detect network" loop — but it also means nobody checks the chain.
  //     So each endpoint is asked eth_chainId ONCE per page visit before its first use; anything but 137 counts as a
  //     network failure and falls through. Cached in memory for the visit only — never localStorage, so a wrong
  //     answer can never outlive the tab.
  var READ_TIMEOUT = 4000;   // per endpoint. ~4x the slowest measured (1032 ms); DNS failures return in ~50 ms.
  var SCAN_TIMEOUT = 10000;  // the getLogs scan road keeps its tuned budget (owner ruling 3) — scans are legitimately slow.
  var readPool = {};         // url -> tamed provider (built once per visit)
  var chainSeen = {};        // url -> true | false   (the once-per-visit eth_chainId verdict)
  var chainPending = {};     // url -> in-flight verdict promise (single-flight; see chainOk)
  var lastGood = null;       // the endpoint that last answered; tried first for the rest of the visit

  function readUrls() {
    // the anvil/proof override still wins, and collapses the road to exactly that one endpoint
    var over = null; try { over = window.localStorage.getItem("dy::readRpcUrl"); } catch (x) {}
    if (over) return [over];
    var list = (CFG.chain.readRpcUrls || []).slice();
    if (!list.length) list = [CFG.chain.rpcUrls[0]];
    return list;
  }
  function mkTamed(url, timeoutMs) {
    var e = window.ethers;
    var req = new e.FetchRequest(url);
    req.timeout = timeoutMs;
    req.setThrottleParams({ maxAttempts: 1 }); // fail fast; the NEXT endpoint is the retry
    return new e.JsonRpcProvider(req, CFG.chain.id, { staticNetwork: true });
  }
  function poolFor(url) {
    if (!readPool[url]) readPool[url] = mkTamed(url, READ_TIMEOUT);
    return readPool[url];
  }
  // A CONTRACT REVERT — the ONLY thing that stops the walk.
  //
  // ⚠ CALL_EXCEPTION IS NOT THE DISCRIMINATOR, and believing it was is what sent a buyer away. MEASURED: ethers
  //   raises CALL_EXCEPTION for ANY json-rpc error returned on eth_call — a rate limit included. A busy public
  //   endpoint does not fail like a dead one; it answers HTTP 200 with a well-formed JSON-RPC error (-32005 /
  //   -32029 / -32090, "rate limit", "too many requests"), sometimes carrying a `data` field. Treating that as
  //   "the chain has spoken" stopped the walk on a server that was merely busy, and the page rendered a verdict
  //   while two healthy endpoints sat unused.
  //
  //   THE REAL SIGNAL IS THE DATA. Measured across every shape: a genuine revert carries `err.data` as 0x-prefixed
  //   hex ("0x08c379a0…" for Error(string) or a custom-error selector, and "0x" for a bare require(false)); every
  //   rate-limit shape carries `err.data === null`, whatever its code, message or own `data` field. So: revert hex
  //   stops the walk, and NOTHING else does.
  //
  //   The deliberate trade: a node that reverts with no data field at all also reads as null and will be walked
  //   past. The cost is that the remaining endpoints are asked and return the same revert, so the caller still
  //   gets a revert — extra calls, never a wrong answer. The opposite mistake takes the store off the air.
  var REVERT_HEX = /^0x([0-9a-fA-F][0-9a-fA-F])*$/;
  function isRevertData(d) { return typeof d === "string" && REVERT_HEX.test(d); }
  function isContractVerdict(err) {
    if (!err) return false;
    if (err.revert) return true;                                   // ethers already decoded a revert reason
    if (isRevertData(err.data)) return true;                       // revert bytes (including a bare "0x")
    if (err.error && isRevertData(err.error.data)) return true;    // same, one level down, still hex-gated
    return false;
  }
  // SINGLE-FLIGHT. The bundle fires ~14 reads at once; caching only the VERDICT let all fourteen race past an
  // unset entry and each ask eth_chainId for itself. The in-flight PROMISE is cached, so the question is asked
  // exactly once per endpoint per visit no matter how many reads start together.
  function chainOk(url) {
    if (chainSeen[url] === true) return Promise.resolve(true);
    if (chainSeen[url] === false) return Promise.resolve(false);
    if (chainPending[url]) return chainPending[url];
    chainPending[url] = poolFor(url).send("eth_chainId", []).then(function (id) {
      var ok = parseInt(id, 16) === Number(CFG.chain.id);
      chainSeen[url] = ok; chainPending[url] = null;
      return ok;
    }, function () { chainSeen[url] = false; chainPending[url] = null; return false; });
    return chainPending[url];
  }
  // Walk the list. Resolves with the first real answer; rejects with a contract revert immediately; rejects with the
  // last network error only once EVERY endpoint has failed.
  function sendWalking(method, params) {
    var urls = readUrls();
    if (lastGood && urls.indexOf(lastGood) > 0) {               // session pick first (ruling 6)
      urls = [lastGood].concat(urls.filter(function (u) { return u !== lastGood; }));
    }
    var lastErr = null;
    function step(i) {
      if (i >= urls.length) {
        return Promise.reject(lastErr || new Error("every read endpoint failed"));
      }
      var url = urls[i];
      return chainOk(url).then(function (ok) {
        if (!ok) {                                              // wrong chain id == a network failure (ruling 5)
          lastErr = lastErr || new Error("wrong chain id at " + url);
          return step(i + 1);
        }
        return poolFor(url).send(method, params).then(function (res) {
          lastGood = url;
          return res;
        }, function (err) {
          if (isContractVerdict(err)) throw err;                // a real answer from a real chain — never fall through
          lastErr = err;
          return step(i + 1);
        });
      });
    }
    return step(0);
  }
  function readProvider() {
    var e = window.ethers;
    var urls = readUrls();
    // The FRONT provider is a handle, not a transport: its own `send` is replaced, so it never opens a socket of its
    // own. Every read a Contract makes (eth_call, eth_blockNumber, eth_getLogs) routes through _perform -> send.
    var front = mkTamed(urls[0], READ_TIMEOUT);
    front.send = function (method, params) { return sendWalking(method, params); };
    return front;
  }
  // THE SCAN ROAD, UNCHANGED (owner ruling 3): a single tamed endpoint at the tuned 10 s with maxAttempts 2, and the
  // existing tamedOn(drpc) chunk failover. The 4 s load-read budget must never govern a getLogs walk.
  function scanProvider() {
    var e = window.ethers;
    var over = null; try { over = window.localStorage.getItem("dy::readRpcUrl"); } catch (x) {}
    var url = over || (CFG.chain.readRpcUrls && CFG.chain.readRpcUrls[0]) || CFG.chain.rpcUrls[0];
    var req = new e.FetchRequest(url);
    req.timeout = SCAN_TIMEOUT;
    req.setThrottleParams({ maxAttempts: 2 });
    return new e.JsonRpcProvider(req, CFG.chain.id, { staticNetwork: true });
  }
  // tests only: forget the visit's pool, chain verdicts and session pick
  function _resetReadRoad() { readPool = {}; chainSeen = {}; chainPending = {}; lastGood = null; }

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
    // STORE-READ-1: rebuild the caller's contract on the SCAN road. Callers build their contracts with
    // readProvider() (now the 4 s failover road); a getLogs walk must keep the tuned 10 s budget instead, and its
    // own drpc chunk failover below. Done here so no caller changes and the tuning cannot drift apart.
    contract = new window.ethers.Contract(contract.target, contract.interface, scanProvider());
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
      return scanProvider().getBlockNumber().then(function (latest) {
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
      state.holderReadFailed = false;
      return Promise.resolve(null);
    }
    return loadEthers()
      .then(function (ethers) {
        var c = new ethers.Contract(CFG.contracts.accessNFT, ACCESS_ABI, readProvider());
        return c.balanceOf(state.address);
      })
      .then(function (bal) {
        state.isHolder = bal > 0n;
        state.holderReadFailed = false; // a clean read
        emit();
        return state.isHolder;
      })
      .catch(function () {
        // S-GATE-1 (P5): the AccessNFT is LIVE on mainnet, so a throw here is a READ
        // FAILURE (dead/throttled RPC), NOT a real zero. Keep it distinct — isHolder=null
        // + holderReadFailed — so the gate shows "busy - refresh to retry", never the
        // non-holder door and never a silent 0. (Was isHolder=false in the rehearsal era.)
        state.isHolder = null;
        state.holderReadFailed = true;
        emit();
        return null;
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
    readProvider: readProvider, // RUNG4-FIX-3 / STORE-READ-1 — the shared read road, now WALKING readRpcUrls
    scanProvider: scanProvider, // STORE-READ-1 — the getLogs road, unchanged at 10 s
    _resetReadRoad: _resetReadRoad, // tests only
    feeOverrides: feeOverrides, // RUNG4-FIX-6 — player-send fee-field floor (45/30 via publicnode); gasLimit stays wallet
    scanLogsResumable: scanLogsResumable, // RUNG4-FIX-7B — resumable checkpointed getLogs scan (treasury discover + store scanMyListings)
    shortAddr: shortAddr,
  };
})();
