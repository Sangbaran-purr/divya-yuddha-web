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
  var listGen = 0; // LEG5 — Your Listings read-generation guard (independent of the holdings read)
  var pageRefresh = function () {}; // set in mount(): re-read holdings + listings after a list/delist

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
      var provider = window.DYWallet.readProvider(); // RUNG4-FIX-3 — tamed publicnode read road, not the wallet's dead RPC
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

  function discover(owner, deadlineAt, onProgress) {
    return window.DYWallet.loadEthers().then(function (ethers) {
      var provider = window.DYWallet.readProvider(); // RUNG4-FIX-3 — tamed publicnode read road, not the wallet's dead RPC
      var c = new ethers.Contract(CFG.contracts.waveCardNFT, WAVE_ABI, provider);
      var fromBlock = CFG.deployBlock || 0; // bounded scan; 0 -> full scan (S-LEDGER-FIX-4 law)
      // RUNG4-FIX-7B — RESUMABLE checkpointed scan (dyw:: per-wallet), O(delta) on repeat visits. Candidates are the
      // tokenIds ever transferred TO owner (mints: Transfer(0, owner, id); + any incoming). We re-verify CURRENT
      // ownership each load (a token may have been sent away), so candidates only ever grow — held is a re-check.
      var key = "dyw::shelf::" + CFG.chain.id + "::" + owner.toLowerCase();
      // 18000ms run-start budget (single-flight queue gives each scan a fresh budget); onProgress → busy-face register.
      return window.DYWallet.scanLogsResumable(c, c.filters.Transfer(null, owner), fromBlock, 18000, key, onProgress).then(function (scan) {
        // verify CURRENT ownership + resolve cardId, in parallel. A per-token read failure drops THAT token.
        return Promise.all(
          scan.candidates.map(function (tidStr) {
            var tid = BigInt(tidStr);
            return c
              .ownerOf(tid)
              .then(function (cur) {
                if (cur.toLowerCase() !== owner.toLowerCase()) return null; // transferred away since received
                return c.cardOf(tid).then(function (cardId) {
                  return { tokenId: tid, cardId: cardId };
                });
              })
              .catch(function () {
                return null;
              });
          })
        ).then(function (rows) {
          var held = rows.filter(Boolean);
          // COMPLETENESS GATE — balanceOf is the truth. Render as soon as we've found ALL held tokens (even before
          // the scan reaches latest); else if the scan is incomplete, render BUSY — the checkpoint advanced, the
          // next refresh continues behind the busy face (owner ruling). balanceOf failure falls back to scan.complete.
          return c.balanceOf(owner).then(function (bal) {
            if (held.length >= Number(bal) || scan.complete) return held;
            var e = new Error("shelf-incomplete"); e.__incomplete = true; throw e;
          }).catch(function (e) {
            if (e && e.__incomplete) throw e;
            if (scan.complete) return held;
            var e2 = new Error("shelf-incomplete"); e2.__incomplete = true; throw e2;
          });
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
      img.decoding = "async"; // RUNG4-FIX-7B — decode off the main thread; drop loading="lazy" (it deprioritized the
      //                          first uncached thumb fetch → "art pending until refresh"). These are the user's own
      //                          few held cards — load them eagerly.
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

    // LEG5 — LIST for sale. Only when the market is configured (dark on null address).
    // A listed card escrows into the market and leaves this hall for Your Listings below.
    if (window.DYStore && DYStore.marketConfigured()) {
      var s = window.DYWallet.state;
      var actions = el("div", "st-card-actions");
      var listBtn = el("button", "st-btn");
      listBtn.type = "button";
      listBtn.textContent = "List for sale";
      if (!(s.connected && s.chainOk)) listBtn.disabled = true;
      else listBtn.onclick = function () { DYStore.openListDialog(row.tokenId, card, pageRefresh); };
      actions.appendChild(listBtn);
      p.appendChild(actions);
    }
    return p;
  }

  // LEG5 — one Your-Listings plinth (escrowed token: art + price + DELIST).
  function renderListingPlinth(ethers, r) {
    var card = resolveCard(r.cardId != null ? r.cardId : 0);
    var art = artUrls(card.frame);
    var p = el("figure", "plinth");
    var frame = el("div", "frame");
    var ph = el("div", "placeholder", '<svg aria-hidden="true"><use href="#dy-gem"/></svg><div class="pep">art pending</div>');
    frame.appendChild(ph);
    if (art) {
      var img = new Image();
      img.alt = card.name;
      img.decoding = "async"; // RUNG4-FIX-7B — eager decode; no lazy (see renderPlinth note)
      img.onload = function () { frame.innerHTML = ""; frame.appendChild(img); };
      img.onerror = function () {};
      img.src = art.thumb;
    }
    p.appendChild(frame);
    p.appendChild(el("div", "stand"));
    p.appendChild(el("figcaption", "pname", card.name));
    p.appendChild(el("div", "pep", DYStore.fmtPrice(ethers, r.price) + " DYC · listed · token " + r.tokenId.toString()));
    var actions = el("div", "st-card-actions");
    var msg = el("div", "st-msg");
    var del = el("button", "st-btn danger");
    del.type = "button";
    del.textContent = "Delist";
    // DELIST is NEVER gated by marketsOpen (contract law) — enabled whenever connected.
    del.onclick = function () { DYStore.delistToken(r.tokenId, del, msg, pageRefresh); };
    actions.appendChild(del);
    p.appendChild(actions);
    p.appendChild(msg);
    return p;
  }

  // LEG5 — Your Listings: the event-scan road via DYStore.scanMyListings, readGen + busy-sentinel.
  function renderListings(section, statusEl, host, addr, force) {
    if (!(window.DYStore && DYStore.marketConfigured())) { if (section) section.hidden = true; return; }
    section.hidden = false;
    var gen = ++listGen;
    statusEl.textContent = "Reading your listings…";
    var deadlineAt = Date.now() + 20000;
    // RUNG4-FIX-7C — progress line while the (single-flight, runs after the shelf) listings scan walks the range.
    function listingsProgress(scannedTo, from, latest) {
      if (gen !== listGen) return;
      var walked = Math.max(0, scannedTo - from), total = Math.max(1, latest - from);
      statusEl.textContent = "Reading your listings — walked " + Math.min(walked, total).toLocaleString() + " of " + total.toLocaleString() + " blocks…";
    }
    DYStore.scanMyListings(addr, deadlineAt, listingsProgress).then(function (res) {
      if (gen !== listGen) return; // superseded
      var rows = res.rows;
      if (!rows.length) {
        statusEl.textContent = "";
        host.className = "hall-empty";
        host.innerHTML =
          '<div class="empty-plinth" aria-hidden="true"></div>' +
          '<div class="state-line">Cards you list in the Market will stand here.</div>';
        return;
      }
      statusEl.textContent = rows.length + (rows.length === 1 ? " card listed for sale." : " cards listed for sale.");
      host.className = "hall";
      host.innerHTML = "";
      rows.forEach(function (r) { host.appendChild(renderListingPlinth(res.ethers, r)); });
    }).catch(function () {
      if (gen !== listGen) return;
      statusEl.textContent = "";
      host.className = "hall-empty";
      host.innerHTML =
        '<div class="empty-plinth" aria-hidden="true"></div>' +
        '<div class="state-line bad">The market could not be read — your listings are safe on-chain. Refresh to retry.</div>';
    });
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

    // RUNG4-FIX-7C — progress line on the busy face while the (single-flight, shelf-first) scan walks the range.
    function shelfProgress(scannedTo, from, latest) {
      if (gen !== readGen) return;
      var walked = Math.max(0, scannedTo - from), total = Math.max(1, latest - from);
      statusEl.textContent = "Reading your hall — walked " + Math.min(walked, total).toLocaleString() + " of " + total.toLocaleString() + " blocks…";
    }
    discover(addr, deadlineAt, shelfProgress)
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
    var listSection = document.getElementById("tre-listings-section");
    var listStatus = document.getElementById("tre-listings-status");
    var listHall = document.getElementById("tre-listings");

    // re-read BOTH shelves after a list/delist (owned card escrows out of the hall into listings).
    pageRefresh = function () {
      var s = window.DYWallet.state;
      if (s.connected && s.chainOk) {
        readHoldings(s.address, statusEl, markEl, hall, true);
        renderListings(listSection, listStatus, listHall, s.address, true);
      }
    };

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
        pageRefresh();
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
      // the listings section only stands in the connected-and-right-chain state
      if (listSection && !(s.connected && s.chainOk)) listSection.hidden = true;
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
      // connected + right chain -> the holdings road + Your Listings
      setChrome(true, true, false, true);
      readHoldings(s.address, statusEl, markEl, hall, false);
      renderListings(listSection, listStatus, listHall, s.address, false);
    });
  }

  return { discover: discover, readMark: readMark, artUrls: artUrls, mount: mount };
})();
