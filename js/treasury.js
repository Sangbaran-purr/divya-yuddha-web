/* ============================================================================
   YOUR HOLDINGS — the treasury shelf (S-TREASURY-SHELF-1).
   Connect a wallet -> read that wallet's own holdings from chain, read-only:
     • the Access mark   — AccessNFT.balanceOf(wallet) ∈ {0,1} (soulbound). Any
       bearer (incl. TORANA-released) lights the mark; release mints this NFT.
     • the Wave Cards    — WaveCardNFT is NOT ERC721Enumerable (no
       tokenOfOwnerByIndex), so discover by scanning Transfer(*, owner) for
       candidate tokenIds, verify each with ownerOf == owner (drops ones later
       transferred away), then cardOf(tokenId) -> cardId -> the card map + art.
   ROADS (per S-TREASURY-SHELF-1):
     • Scan is BOUNDED (S-REGISTRY-HIST lineage): fromBlock = CFG.deployBlock
       (0 -> full scan), withRetry on a busy RPC, an overall deadline.
     • Art rides the canonical explore.js pattern:
       assets/cards/<faction>/<stem>_320.jpg — references existing assets only.
     • BUSY-SENTINEL: a dead/failed read renders "busy / unavailable", DISTINCT
       from a real zero ("No cards yet"). Never a silent empty shelf on a dead RPC.
     • Read-once on connect + an explicit refresh tap (S-CONSOLE-DYC-1 pattern).
   No writes, no admin. Config-value indirection for every address (never hardcode).
   ========================================================================= */
window.DYTreasury = (function () {
  var CFG = window.DY_CONFIG;
  var ACCESS_ABI = ["function balanceOf(address) view returns (uint256)"];
  var WAVE_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
    "function cardOf(uint256) view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ];

  var activeFilter = null; // faction key or null
  // read-once cache (per connected address): reset on address change / manual refresh
  var cacheAddr = null;
  var cacheMark = undefined; // true | false | undefined (unread)
  var cacheRows = null; // array | null (unread)
  var readGen = 0; // generation token: a stale in-flight read never clobbers a newer one (rapid refresh)

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // --- scan-road helpers (S-REGISTRY-HIST lineage): withRetry + deadline ------
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  // Retry a read a few times on a transient/busy RPC; give up loudly (reject) so the
  // caller can render the busy-sentinel — NEVER swallow into an empty result.
  function withRetry(fn, tries, deadlineAt) {
    return fn().catch(function (e) {
      if (tries <= 1 || Date.now() > deadlineAt) throw e;
      return sleep(400).then(function () {
        return withRetry(fn, tries - 1, deadlineAt);
      });
    });
  }

  // --- ART ROAD (canonical explore.js pattern) -------------------------------
  // card.frame is the frame stem + ".png" (e.g. "Vanaras_Hero_Bali_P9_rLegendary.png").
  // The served art is assets/cards/<faction>/<stem>_320.jpg (thumb) / _720.jpg (large),
  // faction parsed from the stem's first segment — exactly how js/explore.js resolves art.
  function artUrls(frame) {
    if (!frame) return null;
    var stem = frame.replace(/\.png$/i, "");
    var fac = stem.split("_")[0].toLowerCase(); // Vanaras -> vanaras
    var base = "assets/cards/" + fac + "/" + stem;
    return { thumb: base + "_320.jpg", large: base + "_720.jpg" };
  }

  // --- CHAIN READS -----------------------------------------------------------
  function readMark(owner, deadlineAt) {
    return window.DYWallet.loadEthers().then(function (ethers) {
      var provider = new ethers.BrowserProvider(window.ethereum);
      var acc = new ethers.Contract(CFG.contracts.accessNFT, ACCESS_ABI, provider);
      return withRetry(
        function () {
          return acc.balanceOf(owner);
        },
        3,
        deadlineAt
      ).then(function (bal) {
        return bal > 0n; // soulbound one-per-wallet -> 0 or 1
      });
    });
  }

  function discover(owner, deadlineAt) {
    return window.DYWallet.loadEthers().then(function (ethers) {
      var provider = new ethers.BrowserProvider(window.ethereum);
      var c = new ethers.Contract(CFG.contracts.waveCardNFT, WAVE_ABI, provider);
      var fromBlock = CFG.deployBlock || 0; // bounded scan; 0 -> full scan (S-LEDGER-FIX-4 law)
      // incoming transfers to owner (includes mints: Transfer(0, owner, id)), from the deploy block.
      return withRetry(
        function () {
          return provider.getBlockNumber().then(function (latest) {
            return c.queryFilter(c.filters.Transfer(null, owner), fromBlock, latest);
          });
        },
        3,
        deadlineAt
      ).then(function (evs) {
        var ids = {};
        evs.forEach(function (e) {
          ids[e.args.tokenId.toString()] = e.args.tokenId;
        });
        var uniq = Object.keys(ids).map(function (k) {
          return ids[k];
        });
        // verify CURRENT ownership + resolve cardId, in parallel. A per-token read failure
        // drops THAT token (best-effort) — the top-level busy-sentinel covers a dead RPC.
        return Promise.all(
          uniq.map(function (tid) {
            return c
              .ownerOf(tid)
              .then(function (cur) {
                if (cur.toLowerCase() !== owner.toLowerCase()) return null;
                return c.cardOf(tid).then(function (cardId) {
                  return { tokenId: tid, cardId: cardId };
                });
              })
              .catch(function () {
                return null;
              });
          })
        ).then(function (rows) {
          return rows.filter(Boolean);
        });
      });
    });
  }

  function polygonscanUrl(tokenId) {
    return CFG.chain.blockExplorerUrls[0] + "/token/" + CFG.contracts.waveCardNFT + "?a=" + tokenId.toString();
  }

  // --- RENDER: Access mark ---------------------------------------------------
  // status: "held" | "none" | "busy"
  function renderMark(markEl, status) {
    markEl.className = "tre-mark tre-mark-" + status;
    if (status === "busy") {
      markEl.innerHTML =
        '<div class="tre-mark-coin tre-mark-dim" aria-hidden="true"></div>' +
        '<div class="tre-mark-text"><b>Access mark</b>' +
        '<span class="tre-mark-sub bad">unavailable — the chain is busy. Refresh to retry.</span></div>';
      return;
    }
    var held = status === "held";
    var coin =
      '<img class="tre-mark-coin' +
      (held ? "" : " tre-mark-dim") +
      '" src="assets/tokens/access_mark.webp" width="56" height="56" alt="" aria-hidden="true" />';
    markEl.innerHTML =
      coin +
      '<div class="tre-mark-text"><b>Access Card</b>' +
      (held
        ? '<span class="tre-mark-sub held">held in your name — the mark is lit.</span>'
        : '<span class="tre-mark-sub">not yet held. <a href="rite.html">Forge one at the rite.</a></span>') +
      "</div>";
  }

  // S-WAVE-REGISTRY: resolve a cardId's display identity + art frame.
  // Order: DY_CARDS launch map (1-25, UNTOUCHED) -> DY_WAVE_REGISTRY (always NAMED; art->frame when
  // non-null, else a named placeholder) -> the generic DY_CARDS.lookup fallback ("Card #N").
  function waveEpithet(w) { return w.status === "test" ? "Test card" : "Wave " + (w.season != null ? w.season : ""); }
  function resolveCard(cardId) {
    var id = Number(cardId);
    if (window.DY_CARDS && DY_CARDS.byId && DY_CARDS.byId[id]) return DY_CARDS.lookup(id); // launch 1-25, untouched
    var w = (window.DY_WAVE_REGISTRY && DY_WAVE_REGISTRY.lookup) ? DY_WAVE_REGISTRY.lookup(id) : null;
    if (w) return { name: w.name, epithet: waveEpithet(w), frame: w.art || null, faction: w.faction || "vanaras" };
    return window.DY_CARDS.lookup(id); // generic placeholder ("Card #N / Awaiting its plate")
  }

  // --- RENDER: one Wave Card plinth (full art via the canonical road) --------
  function renderPlinth(row) {
    var card = resolveCard(row.cardId);
    var art = artUrls(card.frame);
    var p = el("figure", "plinth");
    var frame = el("div", "frame");
    var ph = el(
      "div",
      "placeholder",
      '<svg aria-hidden="true"><use href="#dy-gem"/></svg><div class="pep">art pending</div>'
    );
    frame.appendChild(ph);
    if (art) {
      var img = new Image();
      img.alt = card.name + " — " + card.epithet;
      img.loading = "lazy";
      img.onload = function () {
        frame.innerHTML = "";
        frame.appendChild(img);
      };
      img.onerror = function () {
        /* keep the carved placeholder — an absent frame is not an error */
      };
      img.src = art.thumb; // assets/cards/<faction>/<stem>_320.jpg
    }
    p.appendChild(frame);
    p.appendChild(el("div", "stand"));
    p.appendChild(el("figcaption", "pname", card.name));
    // name + ID under each (cardId · token) — the S-TREASURY-SHELF-1 ask
    p.appendChild(el("div", "pep", "Card #" + row.cardId.toString() + " · token " + row.tokenId.toString()));
    var link = el(
      "a",
      "chain-link",
      '<svg aria-hidden="true" style="width:11px;height:11px;display:inline;vertical-align:-1px"><use href="#dy-chain"/></svg> view on chain'
    );
    link.href = polygonscanUrl(row.tokenId);
    link.target = "_blank";
    link.rel = "noopener";
    p.appendChild(link);
    return p;
  }

  // filter rows to the active faction chamber
  function filtered(rows) {
    if (!activeFilter) return rows;
    return rows.filter(function (r) {
      return (resolveCard(r.cardId).faction || "vanaras") === activeFilter;
    });
  }

  // --- RENDER: the cards hall ------------------------------------------------
  // mode: "cards" | "empty" | "busy"
  function renderHall(hall, mode, rows) {
    if (mode === "busy") {
      hall.className = "hall-empty";
      hall.innerHTML =
        '<div class="empty-plinth" aria-hidden="true"></div>' +
        '<div class="display" style="font-size:1rem">The hall could not be read.</div>' +
        '<div class="state-line bad">The chain is busy or unreachable — your cards are safe on-chain. Refresh to retry.</div>';
      return;
    }
    if (mode === "empty" || !rows || !rows.length) {
      hall.className = "hall-empty";
      hall.innerHTML =
        '<div class="empty-plinth" aria-hidden="true"></div>' +
        '<div class="display" style="font-size:1rem">No cards yet.</div>' +
        '<div class="state-line">Wave cards you own will stand here.</div>';
      return;
    }
    hall.className = "hall";
    hall.innerHTML = "";
    rows.forEach(function (r) {
      hall.appendChild(renderPlinth(r));
    });
  }

  // --- the connected read: mark + cards, read-once + refresh ------------------
  function readHoldings(addr, statusEl, markEl, hall, force) {
    if (!force && cacheAddr === addr && cacheRows !== null && cacheMark !== undefined) {
      renderMark(markEl, cacheMark ? "held" : "none");
      renderHall(hall, "cards", filtered(cacheRows));
      statusEl.textContent = cacheRows.length ? statusLine(cacheRows.length) : "";
      return;
    }
    cacheAddr = addr;
    cacheMark = undefined;
    cacheRows = null;
    var gen = ++readGen; // this read's generation; a later read supersedes it
    statusEl.textContent = "Reading your holdings…";
    var deadlineAt = Date.now() + 20000; // overall deadline for the read

    // The mark and the cards are INDEPENDENT reads — each renders its own state (held/none/busy),
    // so one failing never blanks the other, and neither failure looks like a real zero.
    readMark(addr, deadlineAt)
      .then(function (held) {
        if (gen !== readGen) return; // superseded by a newer read — do not clobber
        cacheMark = held;
        renderMark(markEl, held ? "held" : "none");
      })
      .catch(function () {
        if (gen !== readGen) return;
        renderMark(markEl, "busy"); // busy-sentinel, NOT "none"
      });

    discover(addr, deadlineAt)
      .then(function (rows) {
        if (gen !== readGen) return; // superseded — a stale card read never clobbers a newer state
        cacheRows = rows;
        statusEl.textContent = rows.length ? statusLine(rows.length) : "";
        renderHall(hall, "cards", filtered(rows));
      })
      .catch(function () {
        if (gen !== readGen) return;
        statusEl.textContent = ""; // the hall carries the busy message
        renderHall(hall, "busy"); // busy-sentinel, NOT the empty shelf
      });
  }

  function statusLine(n) {
    return n + (n === 1 ? " card, held in your name." : " cards, held in your name.");
  }

  // --- mount: wire the page to wallet state ----------------------------------
  function mount() {
    var statusEl = document.getElementById("tre-status");
    var hall = document.getElementById("tre-hall");
    var markEl = document.getElementById("tre-mark");
    var actions = document.getElementById("tre-actions");
    var connectBtn = document.getElementById("tre-connect");
    var refreshBtn = document.getElementById("tre-refresh");
    var chambers = document.getElementById("tre-chambers");

    // faction filter gems warm the hall ambient toward that ground
    if (chambers) {
      chambers.querySelectorAll(".chamber-gem").forEach(function (g) {
        g.addEventListener("click", function () {
          var f = g.getAttribute("data-f");
          var on = g.getAttribute("aria-pressed") === "true";
          chambers.querySelectorAll(".chamber-gem").forEach(function (o) {
            o.setAttribute("aria-pressed", "false");
          });
          activeFilter = on ? null : f;
          g.setAttribute("aria-pressed", on ? "false" : "true");
          if (on) delete document.body.dataset.chamber;
          else document.body.dataset.chamber = f;
          if (cacheRows) renderHall(hall, "cards", filtered(cacheRows));
        });
      });
    }

    if (connectBtn) {
      connectBtn.addEventListener("click", function () {
        connectBtn.disabled = true;
        window.DYWallet.connect()
          .catch(function () {})
          .then(function () {
            connectBtn.disabled = false;
          });
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        var s = window.DYWallet.state;
        if (s.connected && s.chainOk) readHoldings(s.address, statusEl, markEl, hall, true);
      });
    }

    // hide the mark row + refresh unless we're in the connected-and-read state
    function setChrome(showMark, showRefresh, showConnect, showChambers) {
      if (markEl) markEl.hidden = !showMark;
      if (refreshBtn) refreshBtn.hidden = !showRefresh;
      if (connectBtn) connectBtn.hidden = !showConnect;
      if (actions) actions.hidden = !(showRefresh || showConnect);
      if (chambers) chambers.hidden = !showChambers;
    }

    window.DYWallet.onChange(function (s) {
      if (!s.hasProvider) {
        setChrome(false, false, false, false);
        statusEl.innerHTML =
          'You carry no wallet. <a href="rite.html">Forge your key at the rite.</a>';
        renderHall(hall, "empty");
        cacheAddr = null;
        return;
      }
      if (!s.connected) {
        setChrome(false, false, true, false);
        statusEl.textContent = "Connect your wallet to see your holdings.";
        renderHall(hall, "empty");
        cacheAddr = null;
        return;
      }
      if (!s.chainOk) {
        setChrome(false, false, false, false);
        statusEl.innerHTML =
          "You stand at the wrong gate — cross to " + CFG.chain.name + " to read your hall.";
        renderHall(hall, "empty");
        cacheAddr = null;
        return;
      }
      // connected + right chain -> the holdings road
      setChrome(true, true, false, true);
      readHoldings(s.address, statusEl, markEl, hall, false);
    });
  }

  return { discover: discover, readMark: readMark, artUrls: artUrls, mount: mount };
})();
