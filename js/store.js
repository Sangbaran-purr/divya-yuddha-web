/* ============================================================================
   THE STORE — player commerce (LEG3+5).
   Two surfaces, one grid:
     • BUY    — the primary sale (WaveCardSale). Buy a fresh edition outright:
                DYC price -> mint. approve(DYC)->buy, two steps, clearly labeled.
     • MARKET — the secondary market (WaveCardMarket). Buy another player's
                escrowed listing (95% seller / 5% treasury, W-PRICE-1 §6).
   And the two exports the TREASURY reuses (LIST originates from an owned card,
   the seller's escrowed tokens must remain visible to them):
     • openListDialog / delistToken — approve-for-all -> list, and delist.
     • scanMyListings — the seller's active listings via the EVENT-SCAN road
       (Listed from deployBlock, verified against listingOf), readGen + busy-sentinel.

   LAWS (owner-ruled, LEG3+5):
     • Player gasLIMIT = WALLET-ESTIMATED. Player FEE FIELDS = DYWallet.feeOverrides() (45/30 floor via the shared
       publicnode road, never {}) — RUNG4-FIX-6 (owner ruling 2026-08-13, supersedes the D2 no-player-feeOverrides
       rule in exactly this scope): a stale wallet RPC prices ~2 gwei, under Amoy's 25-gwei node floor, so every
       buy/approve/list/delist would die at broadcast. MetaMask still renders the fees as editable site-suggested.
     • Every write is staticCall-pre-simmed so a revert is shown BEFORE signing.
     • DARK on null addresses: waveCardSale null -> Buy is a register; waveCardMarket
       null -> Market + List + Your Listings are registers. No reads fire on null.
     • DELIST is NEVER gated by marketsOpen (contract law) — its enabled state
       depends only on market-configured + being the lister. LIST/BUY read the flag.
     • Reads use a public JSON-RPC provider (browse without a wallet); writes use
       the connected wallet's signer. Config-value indirection for every address.
   ========================================================================= */
window.DYStore = (function () {
  var CFG = window.DY_CONFIG;

  var SALE_ABI = [
    "function salesOpen() view returns (bool)",
    "function priceOf(uint256) view returns (uint256)",
    "function supplyCap(uint256) view returns (uint256)",
    "function remainingOf(uint256) view returns (uint256)",
    "function buy(uint256 cardId)",
  ];
  var MARKET_ABI = [
    "function marketsOpen() view returns (bool)",
    "function totalListed() view returns (uint256)",
    "function listedIds(uint256 from, uint256 count) view returns (uint256[])",
    "function listingOf(uint256 tokenId) view returns (address seller, uint256 price, bool active)",
    "function list(uint256 tokenId, uint256 priceDYC)",
    "function delist(uint256 tokenId)",
    "function buy(uint256 tokenId)",
    "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
  ];
  var DYC_ABI = [
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount)",
  ];
  var WAVE_ABI = [
    "function ownerOf(uint256) view returns (address)",
    "function cardOf(uint256) view returns (uint256)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function setApprovalForAll(address operator, bool approved)",
  ];

  var _dec = null; // DYC decimals cache

  // ------------------------------------------------------------ small helpers
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function txt(tag, cls, s) {
    var e = el(tag, cls);
    e.textContent = s;
    return e;
  }
  function saleAddr() { return CFG.contracts && CFG.contracts.waveCardSale; }
  function marketAddr() { return CFG.contracts && CFG.contracts.waveCardMarket; }
  function saleConfigured() { return !!saleAddr(); }
  function marketConfigured() { return !!marketAddr(); }
  function connectedOk() {
    var s = window.DYWallet.state;
    return s.connected && s.chainOk;
  }
  function eqAddr(a, b) { return a && b && a.toLowerCase() === b.toLowerCase(); }

  function loadE() { return window.DYWallet.loadEthers(); }
  // RUNG4-FIX-3 — reads ride the shared tamed publicnode road (staticNetwork, fail-fast), NOT the dead rpcUrls[0]
  // JsonRpcProvider that spun the "failed to detect network, retry in 1s" loop. Writes still use signerRoad (wallet).
  function readProvider() { return window.DYWallet.readProvider(); }
  // the signing road: BrowserProvider -> signer (wallet-estimated gasLIMIT; fee FIELDS from DYWallet.feeOverrides, RUNG4-FIX-6)
  function signerRoad() {
    return loadE().then(function (ethers) {
      var bp = new ethers.BrowserProvider(window.ethereum);
      return bp.getSigner().then(function (sg) { return { ethers: ethers, provider: bp, signer: sg }; });
    });
  }

  function dycDecimals(ethers, provider) {
    if (_dec != null) return Promise.resolve(_dec);
    var dyc = new ethers.Contract(CFG.contracts.dycoin, DYC_ABI, provider);
    return dyc.decimals().then(function (d) { _dec = Number(d); return _dec; }).catch(function () { _dec = 18; return 18; });
  }
  function fmtPrice(ethers, wei) {
    // integer DYC render (prices are whole DYC by convention; show up to the decimals)
    try {
      var s = ethers.formatUnits(wei, _dec == null ? 18 : _dec);
      return s.replace(/\.0+$/, ""); // trim a trailing .000…
    } catch (e) { return "?"; }
  }

  // ------------------------------------------------------------ card identity + art
  // Order: launch DY_CARDS (1-25) -> DY_WAVE_REGISTRY -> generic placeholder.
  function resolveCard(cardId) {
    var id = Number(cardId);
    if (window.DY_CARDS && DY_CARDS.byId && DY_CARDS.byId[id]) return DY_CARDS.lookup(id);
    var w = window.DY_WAVE_REGISTRY && DY_WAVE_REGISTRY.lookup ? DY_WAVE_REGISTRY.lookup(id) : null;
    if (w) return { name: w.name, epithet: "Wave " + (w.season != null ? w.season : ""), frame: w.art || null, faction: w.faction || "vanaras", rarity: w.rarity, type: w.type };
    return window.DY_CARDS ? DY_CARDS.lookup(id) : { name: "Card #" + id, frame: null, faction: "vanaras" };
  }
  function artThumb(frame) {
    if (!frame) return null;
    var stem = frame.replace(/\.png$/i, "");
    var fac = stem.split("_")[0].toLowerCase();
    return "assets/cards/" + fac + "/" + stem + "_320.jpg";
  }
  // S-STORE-UX-1 — the ZOOM art: the 720 display JPG (the same size the card page uses;
  // NOT the masters — deploy-weight law). The frame carries the power roundel + text, so
  // the large art IS the card's powers.
  function artDisplay(frame) {
    if (!frame) return null;
    var stem = frame.replace(/\.png$/i, "");
    var fac = stem.split("_")[0].toLowerCase();
    return "assets/cards/" + fac + "/" + stem + "_720.jpg";
  }
  // a card figure with art (or the explore-style placeholder), reused by Buy + Market
  function cardFigure(card) {
    var fig = el("figure", "ex-card");
    var wrap = el("div", "st-frame-wrap");
    var frame = el("div", "ex-frame");
    var thumb = artThumb(card.frame);
    var placed = false;
    if (thumb) {
      var img = new Image();
      img.className = "ex-img";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = card.name;
      img.onerror = function () { if (!placed) frame.appendChild(placeholder(card)); };
      img.onload = function () { placed = true; };
      img.src = thumb;
      frame.appendChild(img);
    } else {
      frame.appendChild(placeholder(card));
    }
    wrap.appendChild(frame);
    fig.appendChild(wrap);
    fig.appendChild(txt("figcaption", "ex-cap", card.name));
    fig.appendChild(txt("div", "ex-cap-sub", (card.type || "") + (card.rarity && card.rarity !== card.type ? " · " + card.rarity : "")));
    return { fig: fig, frameWrap: wrap };
  }
  function placeholder(card) {
    var d = el("div", "ex-ph");
    d.appendChild(txt("span", "ex-ph-name", card.name));
    d.appendChild(txt("span", "ex-ph-sub", card.type || ""));
    return d;
  }
  function register(host, title, body, bad) {
    host.className = "";
    host.innerHTML = "";
    var r = el("div", "st-register" + (bad ? " bad" : ""));
    r.appendChild(txt("b", null, title));
    r.appendChild(txt("div", null, body));
    host.appendChild(r);
  }

  // =========================================================================
  // S-STORE-UX-1 — faction filter + card ZOOM (buy-in-zoom). The buy wire is
  // UNCHANGED — the zoom reuses buildBuyAction / buildMarketBuy via a wireAction
  // closure; it is a second door onto the same flow, not a reimplementation.
  // =========================================================================
  var FILTER_FACS = ["all", "devas", "asuras", "vanaras", "nagas"];
  var FILTER_LABEL = { all: "All", devas: "Devas", asuras: "Asuras", vanaras: "Vanaras", nagas: "Nagas" };
  var storeFilter = "all"; // survives tab switches; resets to All on reload (module default)
  var buyCache = null, mktCache = null; // last render args → filter clicks repaint without re-reading chain
  var _reRender = null;

  function passesFilter(card) { return storeFilter === "all" || (card && card.faction || "").toLowerCase() === storeFilter; }

  function renderFilter(host, reRender) {
    _reRender = reRender;
    host.innerHTML = "";
    FILTER_FACS.forEach(function (f) {
      var b = el("button", "st-filter-chip" + (f === storeFilter ? " on" : ""), FILTER_LABEL[f]);
      b.setAttribute("aria-pressed", f === storeFilter ? "true" : "false");
      b.onclick = function () {
        if (storeFilter === f) return;
        storeFilter = f;
        renderFilter(host, reRender); // repaint chip state
        reRender();
      };
      host.appendChild(b);
    });
  }

  // ---- the zoom: large 720 art (the powers) + name/rarity/price/supply + BUY ----
  var _zoomWired = false;
  function zoomEls() {
    return {
      ov: document.getElementById("st-zoom"), art: document.getElementById("st-zoom-art"),
      name: document.getElementById("st-zoom-name"), sub: document.getElementById("st-zoom-sub"),
      price: document.getElementById("st-zoom-price"), supply: document.getElementById("st-zoom-supply"),
      actions: document.getElementById("st-zoom-actions"), msg: document.getElementById("st-zoom-msg"),
    };
  }
  function closeZoom() {
    var z = zoomEls(); if (!z.ov) return;
    z.ov.hidden = true; z.ov.setAttribute("aria-hidden", "true"); z.ov.classList.remove("show");
    document.body.style.overflow = "";
  }
  function wireZoomOnce() {
    if (_zoomWired) return; _zoomWired = true;
    var z = zoomEls(); if (!z.ov) return;
    var closeBtn = document.getElementById("st-zoom-close");
    if (closeBtn) closeBtn.onclick = closeZoom;
    z.ov.addEventListener("click", function (e) { if (e.target === z.ov) closeZoom(); }); // backdrop
    document.addEventListener("keydown", function (e) { if (!z.ov.hidden && e.key === "Escape") closeZoom(); }); // Escape
  }
  // opts: { card, priceText, supplyText, wireAction(actionsEl,msgEl) }
  function openZoom(opts) {
    wireZoomOnce();
    var z = zoomEls(); if (!z.ov) return;
    var card = opts.card;
    z.art.innerHTML = "";
    var url = artDisplay(card.frame);
    if (url) {
      var img = new Image();
      img.className = "st-zoom-img"; img.alt = card.name; img.decoding = "async";
      img.onerror = function () { z.art.innerHTML = ""; z.art.appendChild(placeholder(card)); };
      img.src = url;
      z.art.appendChild(img);
    } else { z.art.appendChild(placeholder(card)); }
    z.name.textContent = card.name || "";
    z.sub.textContent = (card.type || "") + (card.rarity && card.rarity !== card.type ? " · " + card.rarity : "");
    z.price.innerHTML = opts.priceText || "";
    z.supply.textContent = opts.supplyText || "";
    z.actions.innerHTML = ""; z.msg.className = "st-msg"; z.msg.textContent = "";
    if (opts.wireAction) opts.wireAction(z.actions, z.msg);
    z.ov.hidden = false; z.ov.setAttribute("aria-hidden", "false"); z.ov.classList.add("show");
    document.body.style.overflow = "hidden";
  }
  // make a card's art the zoom trigger (keyboard-accessible), leaving grid buttons untouched
  function makeZoomTrigger(frameWrap, opts) {
    frameWrap.classList.add("st-zoomable");
    frameWrap.setAttribute("role", "button");
    frameWrap.setAttribute("tabindex", "0");
    frameWrap.setAttribute("aria-label", "Zoom " + (opts.card.name || "card"));
    frameWrap.addEventListener("click", function () { openZoom(opts); });
    frameWrap.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openZoom(opts); }
    });
  }

  // =========================================================================
  // BUY — the primary sale
  // =========================================================================
  var buyGen = 0;
  var buyAllowance = null; // BigInt allowance(me, sale), read once per session/refresh

  function liveCards() {
    var reg = window.DY_WAVE_REGISTRY;
    if (!reg || !reg.list) return [];
    return reg.list().filter(function (w) { return w.status === "live"; }).sort(function (a, b) { return a.cardId - b.cardId; });
  }

  function loadBuy(statusEl, grid) {
    grid.className = "ex-grid";
    if (!saleConfigured()) {
      register(grid, "The Store is not yet open", "Wave cards go on sale when the owner opens the Store. Its prices wake here on that word. Until then, meet every card in The Cards.");
      statusEl.textContent = "";
      return;
    }
    var gen = ++buyGen;
    statusEl.textContent = "Reading the Store…";
    loadE().then(function (ethers) {
      var provider = readProvider(ethers);
      var sale = new ethers.Contract(saleAddr(), SALE_ABI, provider);
      var cards = liveCards();
      var s = window.DYWallet.state;
      var allowanceP = connectedOk()
        ? dycDecimals(ethers, provider).then(function () {
            var dyc = new ethers.Contract(CFG.contracts.dycoin, DYC_ABI, provider);
            return dyc.allowance(s.address, saleAddr()).catch(function () { return null; });
          })
        : Promise.resolve(null);
      return Promise.all([
        sale.salesOpen().catch(function () { return null; }),
        dycDecimals(ethers, provider),
        allowanceP,
        Promise.all(cards.map(function (w) {
          return Promise.all([
            sale.priceOf(w.cardId).catch(function () { return null; }),
            sale.remainingOf(w.cardId).catch(function () { return null; }),
          ]).then(function (r) { return { card: w, price: r[0], remaining: r[1] }; });
        })),
      ]).then(function (all) { return { ethers: ethers, open: all[0], rows: all[3], allowance: all[2] }; });
    }).then(function (res) {
      if (gen !== buyGen) return; // superseded
      buyAllowance = res.allowance;
      renderBuy(res.ethers, statusEl, grid, res.open, res.rows);
    }).catch(function () {
      if (gen !== buyGen) return;
      statusEl.textContent = "";
      register(grid, "The Store could not be read", "The chain is busy or unreachable — nothing was bought or changed. Refresh to retry.", true);
    });
  }

  function renderBuy(ethers, statusEl, grid, open, rows) {
    buyCache = { ethers: ethers, statusEl: statusEl, grid: grid, open: open, rows: rows }; // for filter re-render
    grid.className = "ex-grid";
    grid.innerHTML = "";
    var openState = open === null ? "busy" : (open ? "open" : "closed");
    // faction filter (S-STORE-UX-1): render only the selected faction; All shows every live card
    var shown = rows.filter(function (row) { return passesFilter(resolveCard(row.card.cardId)); });
    var facWord = storeFilter === "all" ? "" : " " + FILTER_LABEL[storeFilter];
    statusEl.innerHTML = openState === "open"
      ? shown.length + facWord + " cards for sale."
      : (openState === "closed"
        ? shown.length + facWord + " cards — the Store is configured but <b>not yet open</b> — prices show; buying wakes when the owner opens sales."
        : "<span class='bad'>The Store is busy — refresh to retry.</span>");
    shown.forEach(function (row) {
      var card = resolveCard(row.card.cardId);
      var cf = cardFigure(card);
      var priceBusy = row.price === null;
      var remBusy = row.remaining === null;
      // price chip
      var priceText = priceBusy ? "busy" : (row.price === 0n ? "unpriced" : fmtPrice(ethers, row.price) + " DYC");
      var chip = el("span", "st-chip" + (priceBusy ? " bad" : "") + (!priceBusy && row.price === 0n ? " muted" : ""));
      chip.textContent = priceText;
      cf.frameWrap.appendChild(chip);
      // remaining
      var supplyText;
      var rem = el("div", "st-remaining");
      if (remBusy) { supplyText = "supply: busy"; rem.textContent = supplyText; }
      else if (row.remaining === 0n) { supplyText = "sold out"; rem.className = "st-remaining soldout"; rem.textContent = supplyText; }
      else { supplyText = row.remaining.toString() + " of " + row.card.supply + " left"; rem.textContent = supplyText; }
      cf.fig.appendChild(rem);
      // action (grid door)
      var actions = el("div", "st-card-actions");
      var msg = el("div", "st-msg");
      var soldOut = row.remaining === 0n;
      var priced = !priceBusy && row.price != null && row.price > 0n;
      buildBuyAction(ethers, actions, msg, row, card, openState, soldOut, priced, function () { loadBuy(statusEl, grid); });
      cf.fig.appendChild(actions);
      cf.fig.appendChild(msg);
      // ZOOM (second door): the art opens the lightbox; the SAME buy flow is wired inside it
      makeZoomTrigger(cf.frameWrap, {
        card: card,
        priceText: priceBusy ? "<span class='bad'>price busy</span>" : (row.price === 0n ? "unpriced" : "<b>" + fmtPrice(ethers, row.price) + " DYC</b>"),
        supplyText: supplyText,
        wireAction: function (aEl, mEl) {
          buildBuyAction(ethers, aEl, mEl, row, card, openState, soldOut, priced, function () { closeZoom(); loadBuy(statusEl, grid); });
        },
      });
      grid.appendChild(cf.fig);
    });
  }

  function buildBuyAction(ethers, actions, msg, row, card, openState, soldOut, priced, refresh) {
    var btn = el("button", "st-btn");
    actions.appendChild(btn);
    function disabled(label, why) { btn.textContent = label; btn.disabled = true; if (why) msg.textContent = why; }
    if (openState !== "open") { disabled("Buy", ""); return; }
    if (!priced) { disabled("Buy", ""); return; }
    if (soldOut) { disabled("Sold out", ""); return; }
    if (!connectedOk()) { disabled("Buy", "Connect your wallet to buy."); return; }
    // approve->buy two-step: show APPROVE when the standing allowance is short, else BUY
    var needApprove = !(buyAllowance != null && buyAllowance >= row.price);
    if (needApprove) {
      btn.textContent = "Approve DYC";
      btn.title = "Step 1 of 2 — approve exactly " + fmtPrice(ethers, row.price) + " DYC for this purchase";
      btn.onclick = function () { doApproveThenSwap(ethers, btn, msg, row); };
    } else {
      btn.textContent = "Buy";
      btn.onclick = function () { doBuy(ethers, btn, msg, row, refresh); };
    }
  }

  function doApproveThenSwap(ethers, btn, msg, row) {
    btn.disabled = true; msg.className = "st-msg"; msg.textContent = "Approving DYC — confirm in your wallet…";
    signerRoad().then(function (r) {
      var dyc = new r.ethers.Contract(CFG.contracts.dycoin, DYC_ABI, r.signer);
      return dyc.approve.staticCall(saleAddr(), row.price).then(function () {
        return window.DYWallet.feeOverrides().then(function (fee) { return dyc.approve(saleAddr(), row.price, fee); }); // RUNG4-FIX-6: fee-field floor (45/30), gasLimit stays wallet
      }).then(function (tx) { msg.textContent = "Approving… waiting for confirmation."; return tx.wait(); });
    }).then(function () {
      buyAllowance = row.price; // now sufficient for this card
      msg.className = "st-msg ok"; msg.textContent = "Approved. Tap Buy to complete.";
      btn.disabled = false; btn.textContent = "Buy";
      btn.onclick = function () { doBuy(ethers, btn, msg, row, function () {}); };
    }).catch(function (e) {
      btn.disabled = false; msg.className = "st-msg bad"; msg.textContent = revertMsg(e, "Approval failed or was rejected.");
    });
  }

  function doBuy(ethers, btn, msg, row, refresh) {
    btn.disabled = true; msg.className = "st-msg"; msg.textContent = "Simulating the purchase…";
    signerRoad().then(function (r) {
      var sale = new r.ethers.Contract(saleAddr(), SALE_ABI, r.signer);
      return sale.buy.staticCall(row.card.cardId).then(function () {
        msg.textContent = "Confirm the purchase in your wallet…";
        return window.DYWallet.feeOverrides().then(function (fee) { return sale.buy(row.card.cardId, fee); }); // RUNG4-FIX-6: fee-field floor (45/30), gasLimit stays wallet
      }).then(function (tx) { msg.textContent = "Buying… waiting for confirmation."; return tx.wait(); });
    }).then(function () {
      msg.className = "st-msg ok"; msg.textContent = "Bought — it is in your Treasury.";
      btn.textContent = "Bought"; buyAllowance = 0n;
      if (refresh) setTimeout(refresh, 1200);
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = "Buy"; msg.className = "st-msg bad"; msg.textContent = revertMsg(e, "Purchase failed or was rejected.");
    });
  }

  // =========================================================================
  // MARKET — the secondary listings
  // =========================================================================
  var mktGen = 0;
  var MARKET_PAGE = 200; // wave-1 volume fits one page; paging is trivial to extend

  function loadMarket(statusEl, grid) {
    grid.className = "ex-grid";
    if (!marketConfigured()) {
      register(grid, "The Market is not yet open", "The player market opens with the Store. Cards listed by other players will trade here — 95% to the seller, 5% to the treasury.");
      statusEl.textContent = "";
      return;
    }
    var gen = ++mktGen;
    statusEl.textContent = "Reading the market…";
    loadE().then(function (ethers) {
      var provider = readProvider(ethers);
      var market = new ethers.Contract(marketAddr(), MARKET_ABI, provider);
      var nft = new ethers.Contract(CFG.contracts.waveCardNFT, WAVE_ABI, provider);
      return Promise.all([
        market.marketsOpen().catch(function () { return null; }),
        dycDecimals(ethers, provider),
        market.totalListed().then(function (n) {
          if (n === 0n) return [];
          return market.listedIds(0, MARKET_PAGE);
        }).catch(function () { return null; }),
      ]).then(function (top) {
        var ids = top[2];
        if (ids === null) throw new Error("busy");
        return Promise.all(ids.map(function (tid) {
          return Promise.all([
            market.listingOf(tid).catch(function () { return null; }),
            nft.cardOf(tid).catch(function () { return null; }),
          ]).then(function (r) { return { tokenId: tid, listing: r[0], cardId: r[1] }; });
        })).then(function (rows) { return { ethers: ethers, open: top[0], rows: rows }; });
      });
    }).then(function (res) {
      if (gen !== mktGen) return;
      renderMarket(res.ethers, statusEl, grid, res.open, res.rows);
    }).catch(function () {
      if (gen !== mktGen) return;
      statusEl.textContent = "";
      register(grid, "The market could not be read", "The chain is busy or unreachable — nothing was bought or changed. Refresh to retry.", true);
    });
  }

  function renderMarket(ethers, statusEl, grid, open, rows) {
    mktCache = { ethers: ethers, statusEl: statusEl, grid: grid, open: open, rows: rows }; // for filter re-render
    grid.className = "ex-grid";
    grid.innerHTML = "";
    var me = window.DYWallet.state.address;
    var openState = open === null ? "busy" : (open ? "open" : "closed");
    var active = rows.filter(function (r) { return r.listing && r.listing[2]; })
      .filter(function (r) { return passesFilter(resolveCard(r.cardId)); }); // S-STORE-UX-1 faction filter
    if (!active.length) {
      var facWord = storeFilter === "all" ? "" : FILTER_LABEL[storeFilter] + " ";
      register(grid, "No " + facWord + "listings yet", openState === "closed"
        ? "The market is open for viewing but trading is paused by the owner. Listed cards will appear here."
        : (storeFilter === "all" ? "No cards are listed right now. List one from your Treasury to be the first." : "No " + FILTER_LABEL[storeFilter] + " cards are listed right now."));
      statusEl.textContent = "";
      return;
    }
    statusEl.innerHTML = openState === "open"
      ? active.length + " cards listed."
      : (openState === "closed"
        ? "Trading is <b>paused</b> — listings show; buying wakes when the owner reopens the market."
        : "<span class='bad'>The market is busy — refresh to retry.</span>");
    // one action-builder reused by the grid door AND the zoom door (identical market flow)
    function wireMarketAction(r, price, seller, mine, actionsEl, msgEl, refresh) {
      if (mine) {
        var d = el("button", "st-btn danger"); d.textContent = "Delist";
        if (!connectedOk()) { d.disabled = true; msgEl.textContent = "Connect your wallet."; }
        else d.onclick = function () { doDelist(r.tokenId, d, msgEl, refresh); };
        actionsEl.appendChild(d);
      } else {
        var b = el("button", "st-btn"); b.textContent = "Buy";
        if (openState !== "open") { b.disabled = true; }
        else if (!connectedOk()) { b.disabled = true; msgEl.textContent = "Connect your wallet to buy."; }
        else buildMarketBuy(ethers, b, msgEl, r.tokenId, price, seller, refresh);
        actionsEl.appendChild(b);
      }
    }
    active.forEach(function (r) {
      var card = resolveCard(r.cardId);
      var cf = cardFigure(card);
      var price = r.listing[1];
      var seller = r.listing[0];
      var mine = eqAddr(seller, me);
      var chip = el("span", "st-chip");
      chip.textContent = fmtPrice(ethers, price) + " DYC";
      cf.frameWrap.appendChild(chip);
      cf.fig.appendChild(txt("div", "st-seller", "listed by " + window.DYWallet.shortAddr(seller)));
      var actions = el("div", "st-card-actions");
      var msg = el("div", "st-msg");
      wireMarketAction(r, price, seller, mine, actions, msg, function () { loadMarket(statusEl, grid); });
      cf.fig.appendChild(actions);
      cf.fig.appendChild(msg);
      // ZOOM (second door) — same listing price + buy/delist road inside the lightbox
      makeZoomTrigger(cf.frameWrap, {
        card: card,
        priceText: "<b>" + fmtPrice(ethers, price) + " DYC</b>",
        supplyText: "listed by " + window.DYWallet.shortAddr(seller),
        wireAction: function (aEl, mEl) {
          wireMarketAction(r, price, seller, mine, aEl, mEl, function () { closeZoom(); loadMarket(statusEl, grid); });
        },
      });
      grid.appendChild(cf.fig);
    });
  }

  function buildMarketBuy(ethers, btn, msg, tokenId, price, seller, refresh) {
    // read this buyer's market allowance lazily on click (avoids N reads on render)
    btn.onclick = function () {
      btn.disabled = true; msg.className = "st-msg"; msg.textContent = "Checking approval…";
      signerRoad().then(function (r) {
        var dyc = new r.ethers.Contract(CFG.contracts.dycoin, DYC_ABI, r.signer);
        var me = window.DYWallet.state.address;
        return dyc.allowance(me, marketAddr()).then(function (al) {
          if (al >= price) return null; // already approved enough
          msg.textContent = "Approve DYC — confirm in your wallet…";
          return dyc.approve.staticCall(marketAddr(), price).then(function () {
            return window.DYWallet.feeOverrides().then(function (fee) { return dyc.approve(marketAddr(), price, fee); }); // RUNG4-FIX-6: fee-field floor (45/30), gasLimit stays wallet
          }).then(function (tx) { msg.textContent = "Approving… waiting."; return tx.wait(); });
        });
      }).then(function () {
        return signerRoad().then(function (r) {
          var market = new r.ethers.Contract(marketAddr(), MARKET_ABI, r.signer);
          msg.textContent = "Simulating the purchase…";
          return market.buy.staticCall(tokenId).then(function () {
            msg.textContent = "Confirm the purchase in your wallet…";
            return window.DYWallet.feeOverrides().then(function (fee) { return market.buy(tokenId, fee); }); // RUNG4-FIX-6: fee-field floor (45/30), gasLimit stays wallet
          }).then(function (tx) { msg.textContent = "Buying… waiting for confirmation."; return tx.wait(); });
        });
      }).then(function () {
        msg.className = "st-msg ok"; msg.textContent = "Bought — it is in your Treasury.";
        btn.textContent = "Bought";
        if (refresh) setTimeout(refresh, 1200);
      }).catch(function (e) {
        btn.disabled = false; msg.className = "st-msg bad"; msg.textContent = revertMsg(e, "Purchase failed or was rejected.");
      });
    };
  }

  function doDelist(tokenId, btn, msg, refresh) {
    btn.disabled = true; msg.className = "st-msg"; msg.textContent = "Simulating…";
    signerRoad().then(function (r) {
      var market = new r.ethers.Contract(marketAddr(), MARKET_ABI, r.signer);
      return market.delist.staticCall(tokenId).then(function () {
        msg.textContent = "Confirm the delist in your wallet…";
        return window.DYWallet.feeOverrides().then(function (fee) { return market.delist(tokenId, fee); }); // RUNG4-FIX-6: fee-field floor (45/30), gasLimit stays wallet
      }).then(function (tx) { msg.textContent = "Delisting… waiting for confirmation."; return tx.wait(); });
    }).then(function () {
      msg.className = "st-msg ok"; msg.textContent = "Delisted — the card is back in your Treasury.";
      if (refresh) setTimeout(refresh, 1200);
    }).catch(function (e) {
      btn.disabled = false; msg.className = "st-msg bad"; msg.textContent = revertMsg(e, "Delist failed or was rejected.");
    });
  }

  // =========================================================================
  // LIST — the dialog reused by the Treasury (approve-for-all -> list)
  // =========================================================================
  var dialogEl = null;
  function ensureDialog() {
    if (dialogEl) return dialogEl;
    var back = el("div", "st-dialog-back");
    back.id = "st-list-dialog";
    back.hidden = true;
    back.innerHTML =
      '<div class="st-dialog" role="dialog" aria-modal="true" aria-labelledby="st-ld-title">' +
      '<h3 id="st-ld-title">List for sale</h3>' +
      '<p class="st-dsub" id="st-ld-sub"></p>' +
      '<label for="st-ld-price">Your price (DYC)</label>' +
      '<input id="st-ld-price" type="text" inputmode="decimal" placeholder="e.g. 100" />' +
      '<div class="st-fee" id="st-ld-fee"></div>' +
      '<div class="st-msg" id="st-ld-msg"></div>' +
      '<div class="st-dialog-actions">' +
      '<button type="button" class="st-btn" id="st-ld-cancel">Cancel</button>' +
      '<button type="button" class="st-btn" id="st-ld-confirm">List it</button>' +
      "</div></div>";
    document.body.appendChild(back);
    back.addEventListener("click", function (e) { if (e.target === back) back.hidden = true; });
    dialogEl = back;
    return back;
  }
  // verbatim W-PRICE-1 §6 disclosure + the live split preview
  var FEE_DISCLOSURE = "Seller sets the listing price. On sale, seller receives price minus 5 percent; the 5 percent goes to the treasury.";
  function renderFee(ethers, feeEl, priceStr) {
    var dec = _dec == null ? 18 : _dec;
    var wei;
    try { wei = ethers.parseUnits((priceStr || "0").trim(), dec); } catch (e) { wei = null; }
    var line = '<span>' + FEE_DISCLOSURE + '</span>';
    if (wei && wei > 0n) {
      var sellerAmt = (wei * 9500n) / 10000n;
      var fee = wei - sellerAmt;
      line += '<span class="st-fee-note">At this price you receive <b>' + fmtPrice(ethers, sellerAmt) +
        " DYC</b> · treasury fee <b>" + fmtPrice(ethers, fee) + " DYC</b>.</span>";
    }
    feeEl.innerHTML = line;
  }

  // openListDialog(tokenId, card, onListed) — approve-for-all (if needed) then list.
  function openListDialog(tokenId, card, onListed) {
    if (!marketConfigured()) return;
    var back = ensureDialog();
    var sub = document.getElementById("st-ld-sub");
    var priceIn = document.getElementById("st-ld-price");
    var feeEl = document.getElementById("st-ld-fee");
    var msg = document.getElementById("st-ld-msg");
    var cancel = document.getElementById("st-ld-cancel");
    var confirm = document.getElementById("st-ld-confirm");
    sub.textContent = card.name + " — token " + tokenId.toString();
    priceIn.value = ""; msg.textContent = ""; msg.className = "st-msg"; confirm.disabled = false; confirm.textContent = "List it";
    back.hidden = false;
    loadE().then(function (ethers) {
      renderFee(ethers, feeEl, "");
      priceIn.oninput = function () { renderFee(ethers, feeEl, priceIn.value); };
      priceIn.focus();
      cancel.onclick = function () { back.hidden = true; };
      confirm.onclick = function () { doList(ethers, tokenId, card, priceIn, msg, confirm, back, onListed); };
    });
  }

  function doList(ethers, tokenId, card, priceIn, msg, confirm, back, onListed) {
    var dec = _dec == null ? 18 : _dec;
    var wei;
    try { wei = ethers.parseUnits((priceIn.value || "").trim(), dec); } catch (e) { wei = null; }
    if (wei == null || wei <= 0n) { msg.className = "st-msg bad"; msg.textContent = "Enter a price greater than zero."; return; }
    confirm.disabled = true; msg.className = "st-msg"; msg.textContent = "Checking approval…";
    signerRoad().then(function (r) {
      var me = window.DYWallet.state.address;
      var nft = new r.ethers.Contract(CFG.contracts.waveCardNFT, WAVE_ABI, r.signer);
      return nft.isApprovedForAll(me, marketAddr()).then(function (ok) {
        if (ok) return null;
        msg.textContent = "Approve the market to escrow your cards — confirm in your wallet…";
        return nft.setApprovalForAll.staticCall(marketAddr(), true).then(function () {
          return window.DYWallet.feeOverrides().then(function (fee) { return nft.setApprovalForAll(marketAddr(), true, fee); }); // RUNG4-FIX-6: fee-field floor (45/30), gasLimit stays wallet
        }).then(function (tx) { msg.textContent = "Approving… waiting."; return tx.wait(); });
      });
    }).then(function () {
      return signerRoad().then(function (r) {
        var market = new r.ethers.Contract(marketAddr(), MARKET_ABI, r.signer);
        msg.textContent = "Simulating the listing…";
        return market.list.staticCall(tokenId, wei).then(function () {
          msg.textContent = "Confirm the listing in your wallet…";
          return window.DYWallet.feeOverrides().then(function (fee) { return market.list(tokenId, wei, fee); }); // RUNG4-FIX-6: fee-field floor (45/30), gasLimit stays wallet
        }).then(function (tx) { msg.textContent = "Listing… waiting for confirmation."; return tx.wait(); });
      });
    }).then(function () {
      msg.className = "st-msg ok"; msg.textContent = "Listed. It now stands in Your Listings.";
      confirm.textContent = "Listed";
      setTimeout(function () { back.hidden = true; if (onListed) onListed(); }, 1100);
    }).catch(function (e) {
      confirm.disabled = false; msg.className = "st-msg bad"; msg.textContent = revertMsg(e, "Listing failed or was rejected.");
    });
  }

  // delistToken(tokenId, onDone) — reused by the Treasury Your-Listings section
  function delistTokenFromTreasury(tokenId, btn, msg, onDone) {
    doDelist(tokenId, btn, msg, onDone);
  }

  // scanMyListings(owner, deadlineAt) — the EVENT-SCAN road (ruling #3):
  // Listed(*, owner) from deployBlock -> candidate tokenIds -> verify each against
  // listingOf (active && seller==owner) to drop delisted/sold. readGen guard is the
  // caller's; a dead RPC REJECTS so the caller renders busy (never a silent empty).
  function scanMyListings(owner, deadlineAt, onProgress) {
    if (!marketConfigured()) return Promise.resolve([]);
    return loadE().then(function (ethers) {
      var provider = readProvider(ethers);
      var market = new ethers.Contract(marketAddr(), MARKET_ABI, provider);
      var nft = new ethers.Contract(CFG.contracts.waveCardNFT, WAVE_ABI, provider);
      var fromBlock = CFG.marketDeployBlock || CFG.deployBlock || 0; // market events cannot predate the market's own deploy
      // S-TREASURY-SCAN-FIX-1 FIX 3 — namespace the listings checkpoint by the MARKET address (the scanned contract), so
      // a market swap can never resume from a prior market's scan state. Old un-namespaced key is dead; delete it once.
      var ownerLc = owner.toLowerCase();
      var key = "dyw::listings::" + CFG.chain.id + "::" + marketAddr().toLowerCase() + "::" + ownerLc;
      try { window.localStorage.removeItem("dyw::listings::" + CFG.chain.id + "::" + ownerLc); } catch (e) {}
      return dycDecimals(ethers, provider).then(function () {
        // RUNG4-FIX-7B — RESUMABLE checkpointed scan (dyw:: per-wallet), O(delta) on repeat visits. Candidates are the
        // tokenIds owner has ever Listed; re-verify each via listingOf (active && seller==owner) to drop delisted/sold.
        return window.DYWallet.scanLogsResumable(market, market.filters.Listed(null, owner), fromBlock, 18000, key, onProgress);
      }).then(function (scan) {
        return Promise.all(scan.candidates.map(function (tidStr) {
          var tid = BigInt(tidStr);
          return market.listingOf(tid).then(function (l) {
            if (!l[2] || !eqAddr(l[0], owner)) return null; // not active, or resold/relisted by another
            return nft.cardOf(tid).then(function (cid) { return { tokenId: tid, price: l[1], cardId: cid }; })
              .catch(function () { return { tokenId: tid, price: l[1], cardId: null }; });
          }).catch(function () { return null; });
        })).then(function (rows) {
          var active = rows.filter(Boolean);
          // No per-seller listing count exists on-chain (only totalListed), so there is no balanceOf-style early gate:
          // if the scan is incomplete, render BUSY — the checkpoint advanced, the next refresh continues (owner ruling).
          if (!scan.complete) { var e = new Error("listings-incomplete"); e.__incomplete = true; throw e; }
          return { ethers: ethers, rows: active };
        });
      });
    });
  }

  // ------------------------------------------------------------ revert -> message
  function revertMsg(e, fallback) {
    var s = (e && (e.shortMessage || e.reason || e.message)) || "";
    if (/user rejected|denied|ACTION_REJECTED/i.test(s)) return "Cancelled in your wallet.";
    // surface the named contract error where present
    var m = s.match(/(SalesClosed|Unpriced|Uncapped|SoldOut|MarketsClosed|NotListed|NotLister|NotOwner|AlreadyListed|BuyOwnListing|ZeroPrice|ERC20InsufficientBalance|ERC20InsufficientAllowance)/);
    if (m) {
      var map = {
        SalesClosed: "The Store is not open.",
        Unpriced: "This card has no price set yet.",
        Uncapped: "This card has no supply cap set yet.",
        SoldOut: "This edition is sold out.",
        MarketsClosed: "Trading is paused.",
        NotListed: "That listing is no longer active.",
        NotLister: "Only the lister can delist this.",
        NotOwner: "You do not own that card.",
        AlreadyListed: "That card is already listed.",
        BuyOwnListing: "You cannot buy your own listing — delist it instead.",
        ZeroPrice: "Enter a price greater than zero.",
        ERC20InsufficientBalance: "Not enough DYC in your wallet.",
        ERC20InsufficientAllowance: "DYC approval is too low — approve again.",
      };
      return map[m[1]] || fallback;
    }
    return fallback;
  }

  // =========================================================================
  // MOUNT — the store page
  // =========================================================================
  function mountStore() {
    var actions = document.getElementById("st-actions");
    var connectBtn = document.getElementById("st-connect");
    var refreshBtn = document.getElementById("st-refresh");
    var walletEl = document.getElementById("st-wallet");
    var tabBuy = document.getElementById("st-tab-buy");
    var tabMkt = document.getElementById("st-tab-market");
    var panelBuy = document.getElementById("st-buy");
    var panelMkt = document.getElementById("st-market");
    var buyStatus = document.getElementById("st-buy-status");
    var buyGrid = document.getElementById("st-buy-grid");
    var mktStatus = document.getElementById("st-market-status");
    var mktGrid = document.getElementById("st-market-grid");
    var filterHost = document.getElementById("st-filter");

    // S-STORE-UX-1 — a filter chip click repaints the ACTIVE tab from its cache (no chain re-read);
    // falls back to a load if nothing is cached yet.
    function reRenderActive() {
      var mkt = tabMkt.getAttribute("aria-selected") === "true";
      if (mkt) { if (mktCache) renderMarket(mktCache.ethers, mktCache.statusEl, mktCache.grid, mktCache.open, mktCache.rows); else loadMarket(mktStatus, mktGrid); }
      else { if (buyCache) renderBuy(buyCache.ethers, buyCache.statusEl, buyCache.grid, buyCache.open, buyCache.rows); else loadBuy(buyStatus, buyGrid); }
    }
    if (filterHost) renderFilter(filterHost, reRenderActive);

    function selectTab(which) {
      var buy = which === "buy";
      tabBuy.setAttribute("aria-selected", buy ? "true" : "false");
      tabMkt.setAttribute("aria-selected", buy ? "false" : "true");
      panelBuy.hidden = !buy;
      panelMkt.hidden = buy;
      if (buy) loadBuy(buyStatus, buyGrid); else loadMarket(mktStatus, mktGrid);
    }
    tabBuy.addEventListener("click", function () { selectTab("buy"); });
    tabMkt.addEventListener("click", function () { selectTab("market"); });

    if (connectBtn) connectBtn.addEventListener("click", function () {
      connectBtn.disabled = true;
      window.DYWallet.connect().catch(function () {}).then(function () { connectBtn.disabled = false; });
    });
    if (refreshBtn) refreshBtn.addEventListener("click", function () {
      if (tabMkt.getAttribute("aria-selected") === "true") loadMarket(mktStatus, mktGrid);
      else loadBuy(buyStatus, buyGrid);
    });

    var lastConnected = null;
    window.DYWallet.onChange(function (s) {
      actions.hidden = false;
      if (!s.hasProvider) {
        connectBtn.hidden = true; refreshBtn.hidden = true; walletEl.hidden = false;
        walletEl.innerHTML = 'You carry no wallet — you may still browse. <a href="rite.html">Forge your key at the rite.</a>';
      } else if (!s.connected) {
        connectBtn.hidden = false; refreshBtn.hidden = true; walletEl.hidden = true;
      } else if (!s.chainOk) {
        connectBtn.hidden = true; refreshBtn.hidden = false; walletEl.hidden = false;
        walletEl.innerHTML = "Wrong network — cross to " + CFG.chain.name + " to buy or trade.";
      } else {
        connectBtn.hidden = true; refreshBtn.hidden = false; walletEl.hidden = false;
        walletEl.innerHTML = "Connected as <b>" + window.DYWallet.shortAddr(s.address) + "</b>";
      }
      // re-render the active tab when the connection state changes (enables buttons)
      var key = (s.connected && s.chainOk) ? s.address : (s.hasProvider ? "anon" : "none");
      if (key !== lastConnected) {
        lastConnected = key;
        buyAllowance = null;
        if (tabMkt.getAttribute("aria-selected") === "true") loadMarket(mktStatus, mktGrid);
        else loadBuy(buyStatus, buyGrid);
      }
    });

    // initial paint (Buy tab). onChange also fires once from init and will re-paint.
    selectTab("buy");
  }

  // =========================================================================
  // S-BUNDLE-1 — THE BUNDLE (PlayStore): the Torana + 500 DYC for USD 20, and
  // the holder top-up. Authority: docs/STORE_DESIGN.md (its §11 IS the copy,
  // machine-proven by mp/copyproof.js) + MARKET_DESIGN_v1 §5 (12b) + GATES 12e.
  //
  // THE CEREMONY (owner ruling (a), 2026-09-12): this file's own inline road —
  // signerRoad -> staticCall -> DYWallet.feeOverrides() -> send -> BOUNDED wait —
  // plus resume-by-read. NO pending ledger, and the reason matters: the Hall
  // persists pending records because a stake locks in escrow and the table may
  // fail to open, so money can strand between two transactions. Here buyBundle
  // and topUp are ATOMIC (the Torana and the DYC land together or nothing moves)
  // and the store never custodies a stablecoin, so the only survivor of a page
  // death is a standing ALLOWANCE: not stranded money, readable in one call, and
  // resumed by re-rendering the tile. S-CEREMONY-1 is queued to make one module
  // of the copies.
  //
  // THE PRE-FLIGHT RUNS BEFORE ANY APPROVE (GATES 12e). A MetaMask smart account
  // (EIP-7702) HAS CODE, so AccessNFT's _safeMint calls onERC721Received on it and
  // a delegate without that hook reverts the whole purchase. Simulating first —
  // free, an eth_call — is what lets P5 say "Nothing was signed" and be true.
  // =========================================================================
  var PS_ABI = [
    "function quote(address wallet) view returns (bool canBundle, uint256 topUpHeadroom, uint256 stock)",
    "function inventory() view returns (uint256)",
    "function topUpUsed(address) view returns (uint256)",
    "function topUpRemaining(address) view returns (uint256)",
    "function capPerWallet() view returns (uint256)",
    "function capWindow() view returns (uint256)",
    "function packSize() view returns (uint256)",
    "function dycPerBundle() view returns (uint256)",
    "function saleOpen() view returns (bool)",
    "function allowedAsset(address) view returns (bool)",
    "function bundlePrice(address) view returns (uint256)",
    "function packPrice(address) view returns (uint256)",
    "function buyBundle(address payAsset) returns (uint256)",
    "function topUp(address payAsset, uint256 packs)",
    "event Bundled(address indexed buyer, address indexed payAsset, uint256 price, uint256 dyc, uint256 tokenId)",
    "event ToppedUp(address indexed buyer, address indexed payAsset, uint256 packs, uint256 dyc, uint256 paid)",
  ];
  var STABLE_ABI = [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount)",
  ];
  var BNFT_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
  ];

  // ── §11, VERBATIM. A [slot] in the doc is a concatenation break here; nothing else differs. ──
  var B_P1 = "A Torana and 500 DYC - fifty Bronze tables' worth - for a wallet that came to play.";
  var B_P2 = "USD 20 goes to the house now. Your Torana and 500 DYC land in the same transaction, or nothing moves.";
  var B_P3 = "500 DYC for USD 5, up to 2,000 a week. Play money, delivered now.";
  var B_P5 = "This wallet is a smart account and cannot receive the Torana yet. Switch to a standard account (MetaMask: 'switch back to regular account') and try again. Nothing was signed.";
  var B_P6 = "The store is closed for now.";
  var B_P6B = "The store is sold out for now.";
  var B_P8 = "The store could not take this order - refresh and try again.";
  var B_P9 = "The bundle - a Torana and 500 DYC - is USD 20. You already hold yours.";
  // P4's fill carries its own preposition. With an exact date the sentence is the ruled one word for word ("...the
  // window frees on 19 Sep 2026."); with the sentinel it reads "...the window frees within 7 days." Keeping "on" in
  // the frame produced "frees on within 7 days" — the ruling's two halves did not compose (reported at S-BUNDLE-1).
  function bP4(cap, when) { return "You have topped up " + cap + " DYC this week - the window frees " + when + "."; }
  function bWhen(exact) { return exact && !/^within /.test(exact) ? "on " + exact : (exact || "within 7 days"); }
  function bP7(sym, sum) { return "Not enough " + sym + " in this wallet - " + sum + " buys the bundle."; }

  function bLs(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function psAddr() { return bLs("dystore::playStoreAddress") || (CFG.contracts && CFG.contracts.playStore); }
  function usdcAddr() { return bLs("dystore::usdcAddress") || (CFG.contracts && CFG.contracts.usdc); }
  function usdtAddr() { return bLs("dystore::usdtAddress") || (CFG.contracts && CFG.contracts.usdt); }
  function accessAddr() { return bLs("dystore::accessAddress") || (CFG.contracts && CFG.contracts.accessNFT); }
  function bundleConfigured() { return !!(psAddr() && usdcAddr() && usdtAddr() && accessAddr()); }
  var BUNDLE_WAIT_MS = Number(bLs("dystore::waitMs")) || 60000;   // the bounded wait (the Hall's OPEN_WAIT_MS shape)
  var TORANA_ART = "assets/tokens/Access_Torana_720.jpg";
  var ASSETS = [{ key: "usdc", label: "USDC", addr: usdcAddr }, { key: "usdt", label: "USDT", addr: usdtAddr }];

  var bState = null;      // the last read; null until the first read lands
  var bChosen = null;     // the asset key the player picked (null = auto by balance)
  var bPacks = 1;         // the top-up's pack count, 1..4
  var bReceipt = null;    // the receipt card, once a road completes
  // THE FLASH (defect found by tests/suites/bundle.js): a road's closing line was written into #b-msg and then
  // destroyed a beat later by the repaint that follows the re-read — the top-up succeeded in SILENCE, the headroom
  // quietly dropping with no word to the player. A flash is carried THROUGH the repaint and cleared when the player
  // next acts.
  var bFlash = null;      // { kind: "ok" | "bad", text }
  var bGen = 0;           // read generation — a stale read never paints over a newer one

  // ── THE READS. Every one catches to null; null means BUSY and is rendered as
  //    "unavailable", never as a false Sold out and never as a false non-holder. ──
  function readBundle() {
    var gen = ++bGen;
    if (!bundleConfigured()) return Promise.resolve(null);
    return loadE().then(function (ethers) {
      var p = readProvider();
      var ps = new ethers.Contract(psAddr(), PS_ABI, p);
      var nft = new ethers.Contract(accessAddr(), BNFT_ABI, p);
      var me = (window.DYWallet.state && window.DYWallet.state.address) || null;
      var nul = function () { return null; };
      var jobs = [
        ps.saleOpen().catch(nul),
        ps.inventory().catch(nul),
        ps.capPerWallet().catch(nul),
        ps.packSize().catch(nul),
        me ? nft.balanceOf(me).catch(nul) : Promise.resolve(null),
        me ? ps.topUpRemaining(me).catch(nul) : Promise.resolve(null),
      ];
      ASSETS.forEach(function (a) {
        var t = new ethers.Contract(a.addr(), STABLE_ABI, p);
        jobs.push(ps.bundlePrice(a.addr()).catch(nul));
        jobs.push(ps.packPrice(a.addr()).catch(nul));
        jobs.push(me ? t.balanceOf(me).catch(nul) : Promise.resolve(null));
        jobs.push(me ? t.allowance(me, psAddr()).catch(nul) : Promise.resolve(null));
      });
      return Promise.all(jobs).then(function (r) {
        if (gen !== bGen) return null;    // a newer read won
        var st = { ethers: ethers, me: me, open: r[0], stock: r[1], cap: r[2], packSize: r[3], torana: r[4], headroom: r[5], asset: {} };
        var i = 6;
        ASSETS.forEach(function (a) {
          st.asset[a.key] = { label: a.label, addr: a.addr(), bundlePrice: r[i], packPrice: r[i + 1], balance: r[i + 2], allowance: r[i + 3] };
          i += 4;
        });
        bState = st;
        return st;
      });
    }).catch(function () { return null; });
  }

  // ── THE WINDOW'S DATE (owner ruling (d)) — exact from the wallet's OWN ToppedUp
  //    logs; "within 7 days" whenever the scan is busy or incomplete. ──
  function windowFreesOn(st) {
    var fallback = "within 7 days";
    if (!st || !st.me) return Promise.resolve(fallback);
    return loadE().then(function (ethers) {
      var p = readProvider();
      var ps = new ethers.Contract(psAddr(), PS_ABI, p);
      var from = Number(CFG.bundleDeployBlock || CFG.marketDeployBlock || CFG.deployBlock || 0);
      return p.getBlockNumber().then(function (tip) {
        var span = Number(bLs("dystore::scanSpan")) || 18000;
        var start = Math.max(from, tip - 6 * 24 * 60 * 30);   // 7 days of Polygon blocks, generously bounded
        return ps.queryFilter(ps.filters.ToppedUp(st.me), start, tip).then(function (evs) {
          if (!evs || !evs.length) return fallback;
          var win = st.cap && st.packSize ? 604800 : 604800;
          return Promise.all(evs.slice(-8).map(function (e) { return p.getBlock(e.blockNumber).catch(function () { return null; }); }))
            .then(function (blocks) {
              var now = Math.floor(Date.now() / 1000), live = [];
              blocks.forEach(function (b) { if (b && b.timestamp > now - win) live.push(b.timestamp); });
              if (!live.length) return fallback;
              var frees = new Date((Math.min.apply(null, live) + win) * 1000);
              return frees.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
            });
        }).catch(function () { return fallback; });
      }).catch(function () { return fallback; });
    }).catch(function () { return fallback; });
  }

  // ── the ruled refusal lines, from a revert ──
  function bundleErr(e, ctx) {
    var s = (e && (e.shortMessage || e.reason || e.message)) || "";
    if (/user rejected|denied|ACTION_REJECTED/i.test(s)) return "Cancelled in your wallet.";
    if (/ERC721InvalidReceiver/.test(s)) return B_P5;
    if (/\bClosed\b/.test(s)) return B_P6;
    if (/InventoryShort/.test(s)) return B_P6B;
    if (/CapExceeded/.test(s)) return bP4(fmtCap(), bWhen(ctx && ctx.when));
    if (/AlreadyHoldsTorana/.test(s)) return "This wallet already holds a Torana - the top-up is yours instead.";
    if (/NotToranaHolder/.test(s)) return "The top-up is for Torana holders - buy the bundle first.";
    if (/ERC20InsufficientBalance|transfer amount exceeds balance/.test(s)) return bP7((ctx && ctx.sym) || "USDC", (ctx && ctx.sum) || "USD 20");
    if (/AssetNotAllowed|PriceUnset|ZeroPacks|BadParams/.test(s)) return B_P8;
    return B_P8;
  }
  function fmtCap() {
    var c = bState && bState.cap;
    if (c == null) return "2,000";
    return Number(c / 1000000000000000000n).toLocaleString("en-US");
  }
  function usd6(v) { return "USD " + String(Number(v) / 1000000); }

  // ── CAN THIS WALLET EVEN HOLD A TORANA? (GATES 12e; the defect P2 found)
  //    buyBundle pulls the stablecoin BEFORE it mints, so a staticCall with no allowance reverts on the ERC20 leg and
  //    hides the receiver problem entirely — the wallet would be asked to approve first, which would break P5's
  //    "Nothing was signed" in the very case P5 exists for. So the hook is probed DIRECTLY, allowance-free, exactly
  //    as OpenZeppelin's _checkOnERC721Received does it: call onERC721Received on the wallet and require the magic
  //    value. A plain EOA has no code and is served without a probe; an EIP-7702 smart account has code and answers
  //    for itself. No approval exists at this point, and none is offered if the answer is no.
  var ERC721_MAGIC = "0x150b7a02";
  function canReceiveTorana(ethers, provider, me) {
    return provider.getCode(me).then(function (code) {
      if (!code || code === "0x") return true;                       // a plain EOA — nothing to ask
      var i = new ethers.Interface(["function onERC721Received(address,address,uint256,bytes) returns (bytes4)"]);
      var data = i.encodeFunctionData("onERC721Received", [psAddr(), ethers.ZeroAddress, 0, "0x"]);
      return provider.call({ to: me, data: data })
        .then(function (ret) { return typeof ret === "string" && ret.slice(0, 10).toLowerCase() === ERC721_MAGIC; })
        .catch(function () { return false; });
    }).catch(function () { return true; });   // a read that FAILED is not a refusal — the road's own gates still stand
  }

  // ── the bounded wait: a confirmation that never hangs the tile ──
  function boundedWait(tx) {
    var done = false, timer = null;
    return Promise.race([
      tx.wait().then(function (r) { done = true; return { receipt: r }; }),
      new Promise(function (res) { timer = setTimeout(function () { if (!done) res({ slow: true }); }, BUNDLE_WAIT_MS); }),
    ]).then(function (o) { if (timer) clearTimeout(timer); return o; });
  }

  // =========================== THE ROADS ===========================
  // approve is EXACT (never max); the pre-flight precedes it; the receipt is read from chain.
  function bundleBuy(assetKey, host, msg, btn) {
    var a = bState && bState.asset[assetKey];
    if (!a) return;
    var sym = a.label, sum = usd6(a.bundlePrice);
    bFlash = null;
    btn.disabled = true; msg.className = "st-msg"; msg.textContent = "Checking this wallet can be served…";
    // P7 lands here, from a READ, before any approval is offered
    if (a.balance != null && a.bundlePrice != null && a.balance < a.bundlePrice) {
      btn.disabled = false; msg.className = "st-msg bad"; msg.textContent = bP7(sym, sum); return;
    }
    var dycBefore = null;
    signerRoad().then(function (r) {
      var ps = new r.ethers.Contract(psAddr(), PS_ABI, r.signer);
      var stable = new r.ethers.Contract(a.addr, STABLE_ABI, r.signer);
      // THE RECEIVER PROBE — first, free, and before any approval exists
      return canReceiveTorana(r.ethers, r.provider, bState.me).then(function (canHold) {
        if (!canHold) { var e = new Error("ERC721InvalidReceiver"); e.__receiver = true; throw e; }
        return r;
      }).then(function () { return { r: r, ps: ps, stable: stable }; });
    }).then(function (k) {
      var r = k.r, ps = k.ps, stable = k.stable;
      // ── THE SECOND GATE, still before any approve: a full simulation. With no
      //    allowance yet it CANNOT see the receiver problem (buyBundle pulls the
      //    stablecoin before it mints — that is what the probe above is for), but it
      //    does catch Closed, InventoryShort and AlreadyHoldsTorana for free.
      return ps.buyBundle.staticCall(a.addr).catch(function (e) {
        var s = (e && (e.shortMessage || e.reason || e.message)) || "";
        if (/ERC721InvalidReceiver/.test(s)) throw e;                 // P5 — stop, nothing signed
        if (/\bClosed\b|InventoryShort|AlreadyHoldsTorana/.test(s)) throw e;
        return null;                                                   // allowance-short: expected here, continue
      }).then(function () {
        var need = a.allowance != null && a.allowance >= a.bundlePrice;
        if (need) return null;
        msg.textContent = "Approve exactly " + sum + " in your wallet…";
        return window.DYWallet.feeOverrides().then(function (fee) { return stable.approve(psAddr(), a.bundlePrice, fee); })
          .then(function (tx) { msg.textContent = "Approving… waiting for confirmation."; return boundedWait(tx); });
      }).then(function () {
        msg.textContent = "Simulating the purchase…";
        return ps.buyBundle.staticCall(a.addr);                        // the real pre-flight, allowance in place
      }).then(function () {
        var dyc = new r.ethers.Contract(CFG.contracts.dycoin, ["function balanceOf(address) view returns (uint256)"], r.provider);
        return dyc.balanceOf(bState.me).catch(function () { return null; }).then(function (b) {
          dycBefore = b;
          msg.textContent = "Confirm the purchase in your wallet…";
          return window.DYWallet.feeOverrides().then(function (fee) { return ps.buyBundle(a.addr, fee); });
        });
      }).then(function (tx) {
        msg.textContent = "Buying… waiting for confirmation.";
        return boundedWait(tx).then(function (o) { return { r: r, o: o, tx: tx }; });
      });
    }).then(function (w) {
      if (w.o.slow) { msg.className = "st-msg"; msg.textContent = "Still confirming on chain. Nothing is lost — refresh when it lands."; btn.disabled = false; return; }
      return bundleReceipt(w.r, w.o.receipt, dycBefore, host);
    }).catch(function (e) {
      btn.disabled = false; msg.className = "st-msg bad"; msg.textContent = bundleErr(e, { sym: sym, sum: sum });
    });
  }

  function bundleTopUp(assetKey, packs, host, msg, btn) {
    var a = bState && bState.asset[assetKey];
    if (!a) return;
    var sym = a.label, total = a.packPrice == null ? null : a.packPrice * BigInt(packs);
    var sum = total == null ? "USD 5" : usd6(total);
    bFlash = null;
    btn.disabled = true; msg.className = "st-msg"; msg.textContent = "Checking this wallet can be served…";
    if (a.balance != null && total != null && a.balance < total) {
      btn.disabled = false; msg.className = "st-msg bad"; msg.textContent = bP7(sym, sum); return;
    }
    signerRoad().then(function (r) {
      var ps = new r.ethers.Contract(psAddr(), PS_ABI, r.signer);
      var stable = new r.ethers.Contract(a.addr, STABLE_ABI, r.signer);
      return ps.topUp.staticCall(a.addr, BigInt(packs)).catch(function (e) {
        var s = (e && (e.shortMessage || e.reason || e.message)) || "";
        if (/\bClosed\b|InventoryShort|CapExceeded|NotToranaHolder/.test(s)) throw e;
        return null;                                                   // allowance-short: expected
      }).then(function () {
        var have = a.allowance != null && total != null && a.allowance >= total;
        if (have) return null;
        msg.textContent = "Approve exactly " + sum + " in your wallet…";
        return window.DYWallet.feeOverrides().then(function (fee) { return stable.approve(psAddr(), total, fee); })
          .then(function (tx) { msg.textContent = "Approving… waiting for confirmation."; return boundedWait(tx); });
      }).then(function () {
        msg.textContent = "Simulating the top-up…";
        return ps.topUp.staticCall(a.addr, BigInt(packs));
      }).then(function () {
        msg.textContent = "Confirm the top-up in your wallet…";
        return window.DYWallet.feeOverrides().then(function (fee) { return ps.topUp(a.addr, BigInt(packs), fee); });
      }).then(function (tx) {
        msg.textContent = "Topping up… waiting for confirmation.";
        return boundedWait(tx).then(function (o) { return { r: r, o: o }; });
      });
    }).then(function (w) {
      if (w.o.slow) { msg.className = "st-msg"; msg.textContent = "Still confirming on chain. Nothing is lost — refresh when it lands."; btn.disabled = false; return; }
      bFlash = { kind: "ok", text: "Topped up — the DYC is in your wallet." };   // survives the repaint below
      return readBundle().then(function () { paintBundle(host); });
    }).catch(function (e) {
      btn.disabled = false; msg.className = "st-msg bad";
      windowFreesOn(bState).then(function (when) {
        bFlash = { kind: "bad", text: bundleErr(e, { sym: sym, sum: sum, when: when }) };   // `when` already carries its preposition via bWhen
        msg.textContent = bFlash.text;
      });
    });
  }

  // ── THE RECEIPT: the tokenId from the buy's OWN Bundled event, verified by ownerOf ──
  function bundleReceipt(r, receipt, dycBefore, host) {
    var ethers = r.ethers, iface = new ethers.Interface(PS_ABI), tokenId = null, dyc = null;
    (receipt && receipt.logs ? receipt.logs : []).forEach(function (l) {
      try { var d = iface.parseLog({ topics: l.topics, data: l.data }); if (d && d.name === "Bundled") { tokenId = d.args.tokenId; dyc = d.args.dyc; } } catch (e) {}
    });
    var nft = new ethers.Contract(accessAddr(), BNFT_ABI, r.provider);
    var dycC = new ethers.Contract(CFG.contracts.dycoin, ["function balanceOf(address) view returns (uint256)"], r.provider);
    return Promise.all([
      tokenId == null ? Promise.resolve(null) : nft.ownerOf(tokenId).catch(function () { return null; }),
      dycC.balanceOf(bState.me).catch(function () { return null; }),
    ]).then(function (x) {
      bReceipt = {
        tokenId: tokenId, owner: x[0], mine: !!(x[0] && bState.me && x[0].toLowerCase() === bState.me.toLowerCase()),
        dyc: dyc, delta: (x[1] != null && dycBefore != null) ? x[1] - dycBefore : null,
        hash: receipt && receipt.hash,
      };
      return readBundle().then(function () { paintBundle(host); });
    });
  }

  // =========================== THE TILE ===========================
  function toranaFigure() {
    var wrap = el("div", "b-art");
    var img = document.createElement("img");
    img.setAttribute("src", TORANA_ART); img.setAttribute("width", "340"); img.setAttribute("height", "510");
    img.setAttribute("loading", "lazy"); img.setAttribute("decoding", "async");
    img.setAttribute("alt", "TORANA — The Access Card");
    var ph = el("div", "torana-ph", '<span class="torana-ph-t">TORANA</span><span class="torana-ph-s">The Access Card</span>');
    ph.style.display = "none";
    img.onerror = function () { img.style.display = "none"; ph.style.display = "flex"; };
    wrap.appendChild(img); wrap.appendChild(ph);
    return wrap;
  }

  // S-BUNDLE-3 — THE PRICE IS THE HERO NUMBER. It was a line of body text under the sales line, in the muted voice,
  //   while "+ 500 DYC" carried the heading size — so the tile shouted what you GET and whispered what it COSTS.
  //   Now the two stand together at the same weight: the DYC figure and the price, the payment assets in the muted
  //   voice beneath the price. On a narrow screen they stack PRICE FIRST (css column-reverse).
  //   BOTH NUMBERS FOLLOW THE PACK PICKER on the holder's face: a fixed "+ 500 DYC" beside "USD 10" at x2 would be
  //   a fresh misread of exactly the kind this rung exists to kill.
  function heroes(dycText, priceText) {
    var row = el("div", "b-heroes");
    row.appendChild(txt("div", "b-hero b-hero-dyc", dycText));
    if (priceText) {
      var pr = el("div", "b-hero b-hero-price");
      pr.appendChild(txt("div", "b-hero-n", priceText));
      pr.appendChild(txt("div", "b-hero-s", "USDC or USDT"));
      row.appendChild(pr);
    }
    return row;
  }
  function dycFig(wei) { return "+ " + Number(wei / 1000000000000000000n).toLocaleString("en-US") + " DYC"; }

  // THE STOCK LINE (owner ruling (b)) — no count, ever: one shared pool makes any
  // "N bundles" a fiction. In stock / Sold out / unavailable, nothing more.
  function stockLine(st) {
    if (!st || st.stock == null || st.open == null) return { cls: "b-stock busy", text: "stock unavailable - refresh to retry" };
    if (st.open === false) return { cls: "b-stock bad", text: B_P6 };
    if (st.packSize != null && st.stock < st.packSize) return { cls: "b-stock bad", text: B_P6B };
    return { cls: "b-stock ok", text: "In stock" };
  }

  // S-BUNDLE-2 (F1) — THE CHIP IS THE CHOICE, THE BALANCE IS THE SMALL PRINT. It used to read "USDC · 3.35" — a
  //   label, a middot and a number, in a gold pill beside a price line — and the owner read it as a price, because it
  //   was shaped like one. Now: "Pay with USDC" as the label, "balance 3.35" beneath in the muted voice, and a chip
  //   the wallet cannot afford is DIMMED, unselectable, and says "not enough" — P7's reason shown BEFORE the tap
  //   (P7 itself stays the ruled refusal if a tap happens anyway).
  //   AND THE PRICE IS THE FACE'S PRICE (the second bug, fixed with the first): this compared every balance against
  //   bundlePrice on BOTH faces, so a holder was judged against USD 20 when the order was USD 5. `unit` is the price
  //   of the face being drawn — bundlePrice on the bundle face, packPrice x packs on the top-up face.
  function assetPicker(st, unitOf, onPick) {
    var row = el("div", "b-assets");
    var afford = function (k) {
      var s = st.asset[k], u = unitOf(k);
      return !(s && s.balance != null && u != null && s.balance < u);   // an unread balance is never a refusal
    };
    var auto = bChosen && afford(bChosen) ? bChosen : null;
    if (!auto) {
      ASSETS.forEach(function (a) { if (!auto && afford(a.key)) auto = a.key; });
      auto = auto || bChosen || "usdc";   // nothing affordable: keep a choice so the tap can render P7
    }
    ASSETS.forEach(function (a) {
      var s = st.asset[a.key], ok = afford(a.key);
      var b = el("button", "b-asset" + (auto === a.key ? " on" : "") + (ok ? "" : " short"));
      b.type = "button";
      b.appendChild(txt("span", "b-asset-l", "Pay with " + a.label));
      var bal = s && s.balance != null ? "balance " + (Number(s.balance) / 1000000).toFixed(2) : "balance unavailable";
      b.appendChild(txt("span", "b-asset-b", ok ? bal : bal + " · not enough"));
      if (ok) b.onclick = function () { bChosen = a.key; onPick(); };
      else { b.disabled = true; b.title = "not enough " + a.label + " in this wallet"; }
      row.appendChild(b);
    });
    return { row: row, chosen: auto };
  }

  function paintBundle(host) {
    var st = bState;
    host.innerHTML = "";
    if (!bundleConfigured()) { register(host, "The bundle is not yet open", "The Torana bundle opens with the store's own contract. Nothing is for sale here yet."); return; }
    var card = el("div", "b-card");
    card.appendChild(toranaFigure());
    var body = el("div", "b-body");
    // S-BUNDLE-2 (F2 + rulings 2 and R4, 2026-09-12): P1 belongs to anyone NOT YET THROUGH THE DOOR (disconnected and
    //   connected non-holder); only the HOLDER's face drops it, and that face is priced by P3 + its own hero, never by
    //   a second price line — §11 says it once.
    var stk = stockLine(st);
    var stockEl = txt("div", stk.cls, stk.text);   // appended by each face, UNDER its own price (S-BUNDLE-2)
    var msg = el("div", "st-msg"); msg.id = "b-msg";
    if (bFlash) { msg.className = "st-msg " + (bFlash.kind || ""); msg.textContent = bFlash.text; }

    // the receipt wins the tile once a buy lands
    if (bReceipt) {
      body.appendChild(txt("div", "b-title", "TORANA — The Access Card"));
      body.appendChild(heroes(bReceipt.dyc != null ? dycFig(bReceipt.dyc) : "+ 500 DYC", null));
      body.appendChild(stockEl);
      var rc = el("div", "b-receipt");
      rc.appendChild(txt("div", "b-rc-h", bReceipt.mine ? "Torana #" + bReceipt.tokenId + " is yours." : "The purchase landed."));
      rc.appendChild(txt("div", "b-rc-l", bReceipt.dyc != null ? "+ " + (bReceipt.dyc / 1000000000000000000n).toString() + " DYC, liquid, in your wallet." : "+ 500 DYC, liquid, in your wallet."));
      if (bReceipt.hash) {
        var lk = el("a", "b-rc-tx"); lk.href = ((CFG.chain.blockExplorerUrls || [])[0] || "https://polygonscan.com") + "/tx/" + bReceipt.hash;
        lk.target = "_blank"; lk.rel = "noopener noreferrer"; lk.textContent = "the transaction";
        rc.appendChild(lk);
      }
      var door = el("a", "st-btn b-door"); door.href = "mp/hall.html"; door.textContent = "Sit at a table";  // UNSTAMPED (ENTRY-1 R2)
      rc.appendChild(door);
      body.appendChild(rc); body.appendChild(msg);
      card.appendChild(body); host.appendChild(card); return;
    }

    if (!st || !connectedOk() || !st.me) {
      // P1 IS FOR ANYONE NOT YET THROUGH THE DOOR (owner ruling 2, corrected by R4 2026-09-12): the disconnected face
      //   and the connected non-holder face both carry it; ONLY the holder's face drops it.
      body.appendChild(txt("div", "b-title", "TORANA — The Access Card"));
      body.appendChild(heroes("+ 500 DYC", "USD 20"));
      body.appendChild(txt("p", "b-line", B_P1));
      body.appendChild(stockEl);
      var cta = el("button", "st-btn b-connect"); cta.type = "button"; cta.textContent = "Connect wallet";
      cta.onclick = function () { cta.disabled = true; window.DYWallet.connect().catch(function () {}).then(function () { cta.disabled = false; }); };
      body.appendChild(cta); body.appendChild(msg);
      card.appendChild(body); host.appendChild(card); return;
    }

    var holder = st.torana == null ? null : st.torana > 0n;
    if (holder === null) {
      body.appendChild(txt("div", "b-title", "TORANA — The Access Card"));
      body.appendChild(heroes("+ 500 DYC", "USD 20"));
      body.appendChild(stockEl);
      body.appendChild(txt("div", "b-stock busy", "your Torana could not be read - refresh to retry"));
      body.appendChild(msg); card.appendChild(body); host.appendChild(card); return;
    }

    // the face is known before the picker is drawn, because the picker prices itself by the face
    var packSize = st.packSize || 500000000000000000000n;
    var headNow = st.headroom;
    var maxPacksNow = headNow == null ? 4 : Number(headNow / packSize);
    if (maxPacksNow > 4) maxPacksNow = 4;
    if (holder && maxPacksNow >= 1 && bPacks > maxPacksNow) bPacks = 1;
    var unitOf = holder
      ? function (k) { var a = st.asset[k]; return a && a.packPrice != null ? a.packPrice * BigInt(bPacks) : null; }
      : function (k) { var a = st.asset[k]; return a && a.bundlePrice != null ? a.bundlePrice : null; };
    var pick = assetPicker(st, unitOf, function () { paintBundle(host); });

    if (!holder) {
      body.appendChild(txt("div", "b-title", "TORANA — The Access Card"));
      body.appendChild(heroes("+ 500 DYC", "USD 20"));
      body.appendChild(txt("p", "b-line", B_P1));
      body.appendChild(stockEl);
      body.appendChild(pick.row);
      body.appendChild(txt("p", "b-commit", B_P2));
      var buy = el("button", "st-btn b-buy"); buy.type = "button"; buy.textContent = "Buy the bundle";
      var closed = st.open === false || (st.packSize != null && st.stock != null && st.stock < st.packSize) || st.stock == null;
      buy.disabled = !!closed;
      buy.onclick = function () { bundleBuy(pick.chosen, host, msg, buy); };
      body.appendChild(buy);
    } else {
      var packs = Math.max(1, Math.min(bPacks, maxPacksNow >= 1 ? maxPacksNow : 1));
      var unitUsd = st.asset[pick.chosen] && st.asset[pick.chosen].packPrice != null
        ? "USD " + String(Number(st.asset[pick.chosen].packPrice * BigInt(packs)) / 1000000) : null;
      body.appendChild(txt("div", "b-title", "TOP UP"));
      body.appendChild(heroes(dycFig(packSize * BigInt(packs)), unitUsd));
      body.appendChild(txt("p", "b-line b-p9", B_P9));
      body.appendChild(txt("p", "b-commit", B_P3));
      body.appendChild(stockEl);
      body.appendChild(pick.row);
      var head = st.headroom;
      if (head == null) {
        body.appendChild(txt("div", "b-stock busy", "your weekly headroom could not be read - refresh to retry"));
      } else if (head === 0n) {
        var capped = txt("p", "b-cap", bP4(fmtCap(), bWhen(null)));
        body.appendChild(capped);
        windowFreesOn(st).then(function (when) { capped.textContent = bP4(fmtCap(), bWhen(when)); });
      } else {
        // the separator matches P4's own [2,000] — the two numbers sit inches apart on the same tile
        body.appendChild(txt("div", "b-head", "you can top up " + Number(head / 1000000000000000000n).toLocaleString("en-US") + " more DYC this week"));
        var maxPacks = maxPacksNow;
        var pk = el("div", "b-packs");
        for (var n = 1; n <= Math.max(1, maxPacks); n++) {
          (function (n) {
            var b = el("button", "b-pack" + (bPacks === n ? " on" : "")); b.type = "button"; b.textContent = "×" + n;
            b.onclick = function () { bPacks = n; paintBundle(host); };
            pk.appendChild(b);
          })(n);
        }
        body.appendChild(pk);
        var tu = el("button", "st-btn b-topup"); tu.type = "button";
        tu.textContent = "Top up " + Number((st.packSize || 500000000000000000000n) / 1000000000000000000n * BigInt(bPacks)).toLocaleString("en-US") + " DYC";
        tu.disabled = st.open === false;
        tu.onclick = function () { bundleTopUp(pick.chosen, bPacks, host, msg, tu); };
        body.appendChild(tu);
      }
    }
    body.appendChild(msg);
    card.appendChild(body);
    host.appendChild(card);
  }

  // ── MOUNT. Resume-by-read: every mount, wallet change and refresh re-reads the
  //    chain, so a standing allowance from a dead page simply reappears as state. ──
  function mountBundle() {
    var host = document.getElementById("bundle-body");
    if (!host) return;
    function refresh() { return readBundle().then(function () { paintBundle(host); }); }
    window.DYWallet.onChange(function () { bReceipt = null; bFlash = null; refresh(); });
    var rb = document.getElementById("b-refresh");
    if (rb) rb.addEventListener("click", function () { bReceipt = null; bFlash = null; refresh(); });
    paintBundle(host);
    refresh();
    return refresh;
  }

  return {
    mountStore: mountStore,
    mountBundle: mountBundle,
    bundleConfigured: bundleConfigured,
    saleConfigured: saleConfigured,
    marketConfigured: marketConfigured,
    openListDialog: openListDialog,
    delistToken: delistTokenFromTreasury,
    scanMyListings: scanMyListings,
    fmtPrice: fmtPrice,
    resolveCard: resolveCard,
    artThumb: artThumb,
  };
})();
