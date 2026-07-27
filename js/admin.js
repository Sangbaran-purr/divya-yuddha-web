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

  // Explicit gas floors (runbook law). Amoy mints measure ~90k–130k; ~2x floor.
  var ACCESS_MINT_GAS = 300000;
  var WAVE_MINT_GAS = 300000;
  var LOG_CHUNK = 45000; // getLogs block window (public-RPC range safety)
  var WAIT_CONFIRMS = 1;
  var WAIT_TIMEOUT_MS = 75000; // bound tx.wait — a never-mined/dropped tx must NEVER sit PENDING (S5a-FIX-2)
  var FEE_HEADROOM = 2n; // 2x headroom over the live base+priority fee signal (S5a-FIX-2); wallet override stays possible

  var owners = { access: null, wave: null }; // last-read on-chain owners
  var histLoaded = false;

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
      deployBlock: o.deployBlock != null ? o.deployBlock : FILE.deployBlock || 0,
      waveCards: o.waveCards && o.waveCards.length ? o.waveCards : FILE.waveCards || [],
      source: o.accessNFT || o.waveCardNFT ? "localStorage (this browser)" : "admin-config.js",
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

  // ---------- HISTORY (chunked getLogs, newest-first) ----------
  function loadHistory() {
    var c = cfg();
    var status = $("hist-status");
    var body = $("hist-body");
    if (!isConfigured(c)) {
      status.textContent = "Not configured.";
      return;
    }
    status.textContent = "Scanning mint events…";
    body.innerHTML = "";
    withEthers()
      .then(function (ethers) {
        var provider = readProvider();
        var access = new ethers.Contract(c.accessNFT, ACCESS_ABI, provider);
        var wave = new ethers.Contract(c.waveCardNFT, WAVE_ABI, provider);
        return provider.getBlockNumber().then(function (latest) {
          return scanChunked(ethers, access, wave, c.deployBlock || 0, latest).then(function (evs) {
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
        status.textContent = rows.length ? rows.length + " mint event(s)." : "No mints yet.";
      })
      .catch(function () {
        status.textContent = "Could not read events (RPC range/limit, or wrong addresses).";
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
    $("cfg-deploy").value = c.deployBlock || 0;
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
      var pa = a ? parseAddr(a) : null;
      var pw = w ? parseAddr(w) : null;
      if (a && !pa) return warn(msg, "AccessNFT address is not a valid checksummed address. Nothing saved.");
      if (w && !pw) return warn(msg, "WaveCardNFT address is not a valid checksummed address. Nothing saved.");

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

      var o = {
        accessNFT: pa,
        waveCardNFT: pw,
        deployBlock: Number($("cfg-deploy").value) || 0,
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

  // ---------- wire the page ----------
  function mount() {
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
    // History
    $("hist-refresh").onclick = function () {
      histLoaded = false;
      loadHistory();
    };
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
