/* =========================================================================
   js/mintstatus.js — SITE-AUDIT-1: the Mint's sale status, READ FROM CHAIN.
   The Mint page used to say "announced at sale-open" while the presale was
   open. Nothing about the round or the price is hard-coded here: one raw
   eth_call each (no wallet, no ethers) to DYCoinSale — currentRound(),
   presalePriceE18(), publicPriceE18() — over the site's public read list.
   A read that fails leaves the honest static fallback ("see your dashboard").
   Fills: #mint-status, #mint-price, #mint-dates, #mint-foot-title, #mint-foot-copy.
   ========================================================================= */
window.DYMintStatus = (function () {
  var SEL = { round: "0x8a19c8bc", presale: "0xa624c6dc", pub: "0x43331cb4" };

  function cfg() { return window.DY_CONFIG || {}; }
  function mf() { return window.DY_MF_CONFIG || {}; }
  function saleAddr() { return (mf().contracts && mf().contracts.dycoinSale) || null; }
  function rpcList() {
    var out = [];
    try { var o = window.localStorage.getItem("dy::readRpcUrl"); if (o) out.push(o); } catch (e) {}
    (((cfg().chain || {}).readRpcUrls) || []).forEach(function (u) { if (out.indexOf(u) < 0) out.push(u); });
    return out;
  }
  function call(url, to, data) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 6000) : null;
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: to, data: data }, "latest"] }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (t) clearTimeout(t); if (!j || typeof j.result !== "string" || j.result.length < 3) throw new Error("no result"); return BigInt(j.result); });
  }
  // walk the read list until one endpoint answers all three
  function readSale() {
    var to = saleAddr(), urls = rpcList();
    if (!to || !urls.length) return Promise.reject(new Error("no sale configured"));
    var i = 0;
    function next() {
      if (i >= urls.length) return Promise.reject(new Error("no endpoint answered"));
      var u = urls[i++];
      return Promise.all([call(u, to, SEL.round), call(u, to, SEL.presale), call(u, to, SEL.pub)])
        .then(function (r) { return { round: Number(r[0]), presale: r[1], pub: r[2] }; }, next);
    }
    return next();
  }
  // $0.008 from 8e15 (USD with 18 decimals): trailing zeros trimmed, but never below three decimals — the site
  // writes the public price as $0.010 everywhere, so the Mint does too
  function usd(e18) {
    var s = (Number(e18) / 1e18).toFixed(6).replace(/0+$/, "");
    var dec = (s.split(".")[1] || "");
    while (dec.length < 3) dec += "0";
    return "$" + s.split(".")[0] + "." + dec;
  }
  function set(id, html) { var e = document.getElementById(id); if (e) e.innerHTML = html; }

  function paint(s) {
    var pre = usd(s.presale), pub = usd(s.pub);
    if (s.round === 1) {
      set("mint-status", "sale status: <b>presale open</b> · " + pre + " per DYC (public round " + pub + ") · open worldwide · sold by DY&nbsp;Animation");
      set("mint-price", "Presale <b>" + pre + "</b> per DYC · public round <b>" + pub + "</b> per DYC");
      set("mint-dates", "The presale round is open now. Buy DYC in your dashboard.");
      set("mint-foot-title", "The Mint Is Open");
      set("mint-foot-copy", "The presale is open at " + pre + " per DYC — buy DYC in your dashboard. The Store already trades in the coin.");
    } else if (s.round === 2) {
      set("mint-status", "sale status: <b>public sale open</b> · " + pub + " per DYC · open worldwide · sold by DY&nbsp;Animation");
      set("mint-price", "Public round <b>" + pub + "</b> per DYC (the presale round was " + pre + ")");
      set("mint-dates", "The public round is open now. Buy DYC in your dashboard.");
      set("mint-foot-title", "The Mint Is Open");
      set("mint-foot-copy", "The public sale is open at " + pub + " per DYC — buy DYC in your dashboard. The Store already trades in the coin.");
    } else {
      set("mint-status", "sale status: <b>not open right now</b> · the sale opens in rounds · open worldwide · sold by DY&nbsp;Animation");
      set("mint-price", "Presale <b>" + pre + "</b> per DYC · public round <b>" + pub + "</b> per DYC");
      set("mint-dates", "No sale round is open right now. This page shows the next round when it opens.");
      set("mint-foot-title", "The Mint Awaits Its Hour");
      set("mint-foot-copy", "No sale round is open right now. The Store already trades in the coin — the world it moves is live.");
    }
  }

  function mount() {
    return readSale().then(paint, function () { /* the static fallback stands */ });
  }
  return { mount: mount, _paint: paint, _usd: usd, SEL: SEL };
})();
