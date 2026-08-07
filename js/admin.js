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
  var LOG_CHUNK = 9000; // getLogs block window — MUST stay under archive-RPC caps (drpc/others reject >10000) (S5a-FIX-3)
  var WAIT_CONFIRMS = 1;
  var WAIT_TIMEOUT_MS = 75000; // bound tx.wait — a never-mined/dropped tx must NEVER sit PENDING (S5a-FIX-2)
  var FEE_HEADROOM = 2n; // 2x headroom over the live base+priority fee signal (S5a-FIX-2); wallet override stays possible
  var RECENT_WINDOW = 500; // recent-only history fallback span (no readRpcUrl) — last N blocks, dodges archive gating (S5a-FIX-3)

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
  function cfg() {
    var o = override();
    var fc = FILE.contracts || {};
    return {
      accessNFT: o.accessNFT || fc.accessNFT || null,
      waveCardNFT: o.waveCardNFT || fc.waveCardNFT || null,
      dycoin: o.dycoin || fc.dycoin || null, // S9 — the DYC token for COIN DROPS (admin config, never config.js's frozen proxy)
      dycoinSale: o.dycoinSale || fc.dycoinSale || null, // M-F2 — the DYCoinSale (Approve Buyers EIP-712 domain + signer gate)
      dropDesk: o.dropDesk || fc.dropDesk || null, // M-F6 — the Drop Desk (coupon signing + cancel + figures)
      vestingVault: o.vestingVault || fc.vestingVault || null, // M-F3 — Purchase Registry VESTED column
      holderStaking: o.holderStaking || fc.holderStaking || null, // M-F3 — Purchase Registry STAKED + REWARDS
      deployBlock: o.deployBlock != null ? o.deployBlock : FILE.deployBlock || 0,
      readRpcUrl: o.readRpcUrl || FILE.readRpcUrl || null, // archive-capable RPC for HISTORY READS only (S5a-FIX-3)
      waveCards: o.waveCards && o.waveCards.length ? o.waveCards : FILE.waveCards || [],
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
  function txUrl(hash) {
    return PLAYER.chain.blockExplorerUrls[0] + "/tx/" + hash;
  }
  function shortAddr(a) {
    return window.DYWallet.shortAddr(a);
  }
  function eq(a, b) {
    return a && b && a.toLowerCase() === b.toLowerCase();
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

  // (scope 2) size EIP-1559 fees from live base+priority with FEE_HEADROOM so a send isn't dropped under Amoy's
  // volatile gas floor. maxFeePerGas is a refundable ceiling; the wallet still shows + can override these.
  function feeOverrides(provider) {
    return provider
      .getFeeData()
      .then(function (fd) {
        var gp = fd.gasPrice || 0n; // legacy signal (≈ base+priority; on Amoy base≈0 so this is the real floor)
        var mf = fd.maxFeePerGas || 0n;
        var basis = gp > mf ? gp : mf; // whichever price signal is higher
        if (basis === 0n) return {}; // no signal → let the wallet decide
        var ceil = basis * FEE_HEADROOM;
        var prio = basis * FEE_HEADROOM;
        if (prio > ceil) prio = ceil;
        return { maxFeePerGas: ceil, maxPriorityFeePerGas: prio };
      })
      .catch(function () {
        return {}; // fee read failed → let the wallet decide (never block the send)
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
    if (!isConfigured(c)) {
      banner.className = "banner warn";
      banner.innerHTML = "<strong>NOT CONFIGURED.</strong> No contract addresses set. " +
        "Open Configuration below and paste the G12 AccessNFT + WaveCardNFT addresses. " +
        "All controls stay disabled until then.";
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
        // S9 COIN DROPS — same owner gate (the recognized admin owns a collection) + a DYC address configured.
        var coinAdmin = accMine || wavMine;
        var bal = $("coin-balance");
        if (coinAdmin && cfg().dycoin) {
          setPanelEnabled("coin", true);
          loadCoinMeta();
        } else {
          setPanelEnabled("coin", false);
          coinMeta = null;
          if (bal) {
            bal.innerHTML = coinAdmin
              ? "<span class='bad'>DYC address NOT CONFIGURED</span> — set it in Configuration to enable coin drops."
              : "";
          }
        }
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
      .then(refreshGate)
      .catch(function () {});
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
    var useArchive = !!c.readRpcUrl;
    status.textContent = useArchive ? "Scanning full history (archive RPC)…" : "Scanning recent mints…";
    body.innerHTML = "";
    withEthers()
      .then(function (ethers) {
        // READ-ONLY provider. With a Read RPC URL → a dedicated JsonRpcProvider (NEVER a signer). Else the wallet
        // provider, restricted to a recent window so a non-archive node is not asked for historical logs.
        var provider = useArchive ? new ethers.JsonRpcProvider(c.readRpcUrl) : readProvider();
        var access = new ethers.Contract(c.accessNFT, ACCESS_ABI, provider);
        var wave = new ethers.Contract(c.waveCardNFT, WAVE_ABI, provider);
        return provider.getBlockNumber().then(function (latest) {
          var from = useArchive ? c.deployBlock || 0 : Math.max(0, latest - RECENT_WINDOW);
          return scanChunked(ethers, access, wave, from, latest).then(function (evs) {
            return attachTimes(provider, evs);
          });
        });
      })
      .then(function (rows) {
        histLoaded = true;
        rows.sort(function (a, b) {
          return b.block - a.block || b.logIndex - a.logIndex;
        });
        renderHistory(rows);
        if (useArchive) {
          status.textContent = rows.length ? rows.length + " mint event(s) (full history)." : "No mints yet.";
        } else {
          status.innerHTML =
            (rows.length ? rows.length + " recent mint(s). " : "No mints in the last " + RECENT_WINDOW + " blocks. ") +
            "<span style='color:var(--ember)'>Recent only — set Read RPC URL in Configuration for full history.</span>";
        }
      })
      .catch(function (e) {
        histLoaded = false;
        if (isArchiveError(e)) {
          status.innerHTML =
            "<span style='color:var(--ember)'>History needs an archive RPC — set Read RPC URL in Configuration.</span>";
        } else {
          status.textContent = "Could not read events (" + ((e && e.shortMessage) || "RPC error") + ").";
        }
      });
  }

  function scanChunked(ethers, access, wave, from, latest) {
    var out = [];
    var start = from;
    function step() {
      if (start > latest) return Promise.resolve(out);
      var end = Math.min(start + LOG_CHUNK - 1, latest);
      return Promise.all([
        access.queryFilter(access.filters.Transfer(ethers.ZeroAddress, null), start, end),
        wave.queryFilter(wave.filters.CardMinted(), start, end),
      ]).then(function (res) {
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
          o.textContent = w.name + "  (#" + w.cardId + ")";
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
  // sum this wallet's dycOut across its Purchased logs (chunked queryFilter — S5a pattern)
  function boughtOf(sale, wallet, from, latest) {
    var total = 0n, start = from;
    function step() {
      if (start > latest) return Promise.resolve(total);
      var end = Math.min(start + LOG_CHUNK - 1, latest);
      return sale.queryFilter(sale.filters.Purchased(wallet), start, end).then(function (evs) {
        evs.forEach(function (ev) { total += ev.args.dycOut; });
        start = end + 1;
        return sleep(80).then(step);
      });
    }
    return step();
  }
  function readRegistryRow(c, provider, latest, wallet) {
    var sale = new ethersRef.Contract(c.dycoinSale, SALE_ABI, provider);
    var reads = [
      boughtOf(sale, wallet, c.deployBlock || 0, latest).catch(function () { return null; }),
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
        // sequential — gentle on the RPC, and order-stable for the table
        var i = 0;
        function next() {
          if (i >= wallets.length) return Promise.resolve();
          return readRegistryRow(c, provider, latest, wallets[i]).then(function (row) {
            registryRows.push(row); i++;
            out.innerHTML = renderRegistryTable(registryRows, wallets.length);
            return next();
          });
        }
        return next();
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
        if (r[k] != null) { tot[k] += r[k]; any[k] = true; }
      });
    });
    function cell(v) { return "<td class='num'>" + fmtDyc18(v) + "</td>"; }
    var body = rows.map(function (r) {
      return "<tr><td class='mono'>" + shortAddr(r.wallet) + "</td>" +
        cell(r.bought) + cell(r.liquid) + cell(r.vested) + cell(r.staked) + cell(r.rewards) + "</tr>";
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
      lines.push([r.wallet, n(r.bought), n(r.liquid), n(r.vested), n(r.staked), n(r.rewards)].join(","));
    });
    var blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "purchase-registry.csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
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
  function robotSaveInputs() {
    try { localStorage.setItem(ROBOT_LS, JSON.stringify({ url: $("robot-url").value.trim(), token: $("robot-token").value })); } catch (e) {}
  }
  function robotFillInputs() {
    try {
      var o = JSON.parse(localStorage.getItem(ROBOT_LS) || "{}");
      if (o.url && $("robot-url")) $("robot-url").value = o.url;
      if (o.token && $("robot-token")) $("robot-token").value = o.token;
    } catch (e) {}
  }
  function fmtTs(ms) { return ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—"; }
  async function loadRobotRegistry() {
    var st = $("robot-status"), body = $("robot-body"), sum = $("robot-summary");
    var base = $("robot-url").value.trim().replace(/\/+$/, ""), token = $("robot-token").value;
    if (!base || !token) { st.textContent = "Enter the service URL and view token first."; return; }
    robotSaveInputs();
    st.textContent = "Loading…"; body.innerHTML = ""; sum.textContent = "";
    try {
      var res = await fetch(base + "/registry", { headers: { authorization: "Bearer " + token }, cache: "no-store" });
      if (res.status === 401) { st.textContent = "Unauthorized — check the view token."; return; }
      if (!res.ok) { st.textContent = "HTTP " + res.status; return; }
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
          + "<td>" + escHtml(r.status) + "</td>"
          + "<td>" + (flags.join(" ") || "—") + "</td>"
          + "<td class='mono' style='font-size:0.72rem'>" + escHtml(r.email || "—") + "</td>"
          + "<td class='mono' style='font-size:0.72rem'>" + fmtTs(r.receivedAt) + "</td>"
          + "<td class='mono' style='font-size:0.72rem'>" + fmtTs(r.signedAt) + "</td>"
          + "</tr>";
      }).join("") || "<tr><td colspan='6' class='mono'>No registrants yet.</td></tr>";
      st.textContent = rows.length + " registrant(s) · read-only";
    } catch (e) {
      st.textContent = "Fetch failed: " + (e && e.message ? e.message : e);
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
    out.innerHTML = "<div class='q'>Reading chain…</div>";
    withEthers().then(function () {
      var provider = new ethersRef.BrowserProvider(window.ethereum);
      return provider.getSigner().then(function (signer) {
        return signer.getAddress().then(function (adminAddr) {
          var p = readProvider();
          var hs = new ethersRef.Contract(c.holderStaking, STAKE_GRANT_ABI, p);
          return p.getBlockNumber().then(function (latest) {
            var start = cfg().deployBlock || 0;
            var filter = hs.filters.RoiCredited(wallet, null, adminAddr);
            var granted = 0n, jobs = Promise.resolve();
            for (var from = start; from <= latest; from += LOG_CHUNK) {
              (function (a, b) {
                jobs = jobs.then(function () {
                  return hs.queryFilter(filter, a, b).then(function (evs) {
                    evs.forEach(function (ev) { granted += ev.args.amount; });
                  });
                });
              })(from, Math.min(from + LOG_CHUNK - 1, latest));
            }
            return jobs.then(function () {
              return Promise.all([hs.pendingRoi(wallet), hs.roi(wallet)]).then(function (r) {
                var f = function (x) { return ethersRef.formatUnits(x, 18); };
                out.innerHTML =
                  "<table class='grid'><tbody>"
                  + "<tr><th>Granted so far (this admin)</th><td>" + escHtml(f(granted)) + " DYC</td></tr>"
                  + "<tr><th>Chain accrual — pending</th><td>" + escHtml(f(r[0])) + " DYC</td></tr>"
                  + "<tr><th>Chain accrual — ROI column</th><td>" + escHtml(f(r[1])) + " DYC</td></tr>"
                  + "</tbody></table>"
                  + "<div class='mono' style='font-size:.72rem;margin-top:.4rem;color:var(--gold-aged)'>The 2X lifetime cap is a POLICY guide, not enforced on-chain here — check granted-so-far against the wallet's staked principal before granting.</div>";
              });
            });
          });
        });
      });
    }).catch(function (e) { out.innerHTML = "<div class='q'>Couldn't read the ledger: " + escHtml(decodeErr(e)) + "</div>"; });
  }

  function mount() {
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
    if ($("robot-load")) { $("robot-load").onclick = loadRobotRegistry; robotFillInputs(); }
    // Drop Desk (M-F6)
    if ($("drop-sign")) {
      loadDeskCoupons(); renderDeskCoupons();
      $("drop-sign").onclick = runDropSign;
      $("drop-download").onclick = downloadDeskCoupons;
      $("drop-merge").onclick = mergePublishedCoupons;
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
    fillCfgForm();
    window.DYWallet.onChange(function () {
      refreshGate();
    });
    window.DYWallet.init();
  }

  return { mount: mount };
})();
