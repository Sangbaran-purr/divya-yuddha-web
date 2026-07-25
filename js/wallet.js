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

  // --- holder check: AccessNFT.balanceOf > 0. Fails GRACEFULLY (placeholder
  //     addresses / undeployed rehearsal contract) -> treated as non-holder. ---
  function checkHolder() {
    if (!state.connected || !state.chainOk) {
      state.isHolder = null;
      return Promise.resolve(null);
    }
    return loadEthers()
      .then(function (ethers) {
        var provider = new ethers.BrowserProvider(window.ethereum);
        var c = new ethers.Contract(CFG.contracts.accessNFT, ACCESS_ABI, provider);
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
    shortAddr: shortAddr,
  };
})();
