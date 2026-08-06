// THE PROCEEDS REPORT — public, wallet-free, chain-truth aggregates (M-F3).
// Reads DYCoinSale / VestingVault / HolderStaking / RoiRedemption. Every headline figure is a direct
// contract view; a few counts (buyers, total claimed, total redeemed) are tallied from event logs via the
// S5a chunked-getLogs pattern and are LABELLED as such. No wallet is ever required to view this page.
window.DYReport = (function () {
  var W = window.DYWallet;
  var FILE = window.DY_MF_CONFIG || { contracts: {}, readRpcUrl: null, deployBlock: 0 };
  var PLAYER = window.DY_CONFIG;
  var LS_KEY = "dymf::config"; // shared with the dashboard, so one override configures both
  var ethersRef = null;

  // ---- config (mirrors dashboard.js cfg(); report reads the same four contracts) ----
  function ov() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function cfg() {
    var o = ov(), fc = FILE.contracts || {}, oc = o.contracts || {};
    return {
      dycoin: oc.dycoin || fc.dycoin || (PLAYER.contracts && PLAYER.contracts.dycoin) || null,
      vestingVault: oc.vestingVault || fc.vestingVault || null,
      holderStaking: oc.holderStaking || fc.holderStaking || null,
      roiRedemption: oc.roiRedemption || fc.roiRedemption || null,
      dycoinSale: oc.dycoinSale || fc.dycoinSale || null,
      readRpcUrl: o.readRpcUrl || FILE.readRpcUrl || null,
      readRpcUrlFallbacks: (o.readRpcUrlFallbacks || FILE.readRpcUrlFallbacks || []),
      logChunk: o.logChunk || FILE.logChunk || 3000,
      deployBlock: o.deployBlock != null ? o.deployBlock : FILE.deployBlock || 0,
    };
  }

  var SALE_ABI = [
    "function currentRound() view returns (uint8)",
    "function presalePriceE18() view returns (uint256)",
    "function publicPriceE18() view returns (uint256)",
    "function presaleSold() view returns (uint256)",
    "function publicSold() view returns (uint256)",
    "function presaleCap() view returns (uint256)",
    "function publicCap() view returns (uint256)",
    "function usdtReceived() view returns (uint256)",
    "function usdcReceived() view returns (uint256)",
    "function polReceived() view returns (uint256)",
    "event Purchased(address indexed buyer, uint8 round, address asset, uint256 paid, uint256 usdE18, uint256 dycOut, uint256 liquid)",
  ];
  var VAULT_ABI = [
    "function totalVested() view returns (uint256)",
    "event Claimed(address indexed buyer, uint256 amount)",
  ];
  var POOL_ABI = [
    "function poolRemaining() view returns (uint256)",
    "function totalPoolIn() view returns (uint256)",
    "function totalAccrualOut() view returns (uint256)",
    "function totalCapacity() view returns (uint256)",
    "function POOL_AMOUNT() view returns (uint256)",
  ];
  var DESK_ABI = [
    "function reserve() view returns (uint256)",
    "event Redeemed(address indexed user, uint256 dycAmount, uint256 usdtOut)",
  ];

  // ---- formatting ----
  function $(id) { return document.getElementById(id); }
  function fmtUnits(v, dec, maxfrac) {
    if (v == null) return "—";
    try {
      var s = ethersRef.formatUnits(v, dec == null ? 18 : dec);
      var n = Number(s);
      return n.toLocaleString(undefined, { maximumFractionDigits: maxfrac == null ? 2 : maxfrac });
    } catch (e) { return "—"; }
  }
  function fmtDyc(v) { return fmtUnits(v, 18, 0); }
  function fmtUsd(v) { return fmtUnits(v, 6, 2); } // USDT/USDC 6-dec
  function fmtPol(v) { return fmtUnits(v, 18, 4); }
  function pctOf(part, whole) { return whole > 0n ? Number((part * 10000n) / whole) / 100 : 0; }
  function explorer() { return (PLAYER.chain.blockExplorerUrls && PLAYER.chain.blockExplorerUrls[0]) || ""; }
  function verify(addr, label) {
    if (!addr) return "";
    return "<a class='rep-verify' target='_blank' rel='noopener' href='" + explorer() + "/address/" + addr + "'>" +
      (label || "verify on-chain") + " ↗</a>";
  }
  function notLive(label) {
    return "<div class='notlive'><b>Not yet live</b>" + label +
      " will appear here the moment the contract is deployed. Nothing is wrong — the raise simply hasn't opened yet.</div>";
  }

  // Resilient wallet-free reads (M-F4 defect 3): the vetted public endpoints (drpc → publicnode →
  // thirdweb) with automatic fallback (FallbackProvider, quorum 1). NEVER a wallet — public page.
  var _readProv = null;
  function readProvider() {
    if (_readProv) return _readProv;
    var c = cfg();
    var urls = [c.readRpcUrl].concat(c.readRpcUrlFallbacks || []).filter(Boolean);
    if (!urls.length) urls = [PLAYER.chain.rpcUrls[0]];
    var net = { chainId: PLAYER.chain.id, name: "amoy" };
    if (urls.length === 1) { _readProv = new ethersRef.JsonRpcProvider(urls[0], net, { staticNetwork: true }); return _readProv; }
    var configs = urls.map(function (u, i) {
      return { provider: new ethersRef.JsonRpcProvider(u, net, { staticNetwork: true }), priority: i + 1, stallTimeout: 1800, weight: 1 };
    });
    try { _readProv = new ethersRef.FallbackProvider(configs, net, { quorum: 1 }); }
    catch (e) { _readProv = configs[0].provider; }
    return _readProv;
  }

  // ---- chunked getLogs (S5a pattern): returns [] on any failure so a figure degrades to "—", never throws ----
  function scanLogs(provider, address, topics, fromBlock, toBlock) {
    var CHUNK = cfg().logChunk || 3000, out = [], from = fromBlock;
    function step() {
      if (from > toBlock) return Promise.resolve(out);
      var to = Math.min(from + CHUNK - 1, toBlock);
      return provider.getLogs({ address: address, topics: topics, fromBlock: from, toBlock: to })
        .then(function (logs) { out = out.concat(logs); from = to + 1; return step(); })
        .catch(function () { return null; }); // an unsupported/limited RPC → give up cleanly
    }
    return step();
  }

  // ============================ SECTIONS ============================
  function renderSale(provider) {
    var c = cfg(), b = $("sale-body"), chip = $("sale-chip");
    if (!c.dycoinSale) { b.innerHTML = notLive(" The token sale — round, price, DYC sold and total raised"); chip.textContent = ""; return Promise.resolve(); }
    var sale = new ethersRef.Contract(c.dycoinSale, SALE_ABI, provider);
    return Promise.all([
      sale.currentRound(), sale.presalePriceE18(), sale.publicPriceE18(),
      sale.presaleSold(), sale.publicSold(), sale.presaleCap(), sale.publicCap(),
      sale.usdtReceived(), sale.usdcReceived(), sale.polReceived(),
    ]).then(function (r) {
      var round = Number(r[0]), pPrice = r[1], qPrice = r[2];
      var pSold = r[3], qSold = r[4], pCap = r[5], qCap = r[6];
      var usdt = r[7], usdc = r[8], pol = r[9];
      var roundTxt = round === 1 ? "PRESALE OPEN" : round === 2 ? "PUBLIC OPEN" : "BETWEEN ROUNDS";
      chip.innerHTML = "<span class='buy-round " + (round === 2 ? "public" : "presale") + "'>" + roundTxt + "</span>";
      var totalSold = pSold + qSold;
      return countBuyers(provider, c).then(function (buyers) {
        b.innerHTML =
          "<div class='rep-figrow'><span>Current round</span><b>" + roundTxt + "</b></div>" +
          roundBlock("Presale", "$" + fmtUnits(pPrice, 18, 3), pSold, pCap) +
          roundBlock("Public", "$" + fmtUnits(qPrice, 18, 3), qSold, qCap) +
          "<div class='rep-big'><span class='rep-biglabel'>Total DYC sold</span><span class='rep-bigval'>" + fmtDyc(totalSold) + " <em>DYC</em></span></div>" +
          "<div class='rep-raised'>" +
            "<div class='rep-figrow'><span>Raised — USDT</span><b>" + fmtUsd(usdt) + "</b></div>" +
            "<div class='rep-figrow'><span>Raised — USDC</span><b>" + fmtUsd(usdc) + "</b></div>" +
            "<div class='rep-figrow'><span>Raised — POL</span><b>" + fmtPol(pol) + "</b></div>" +
          "</div>" +
          "<div class='rep-figrow'><span>Buyers <span class='rep-src'>from event logs</span></span><b>" + (buyers == null ? "—" : buyers) + "</b></div>" +
          "<div class='rep-verifyrow'>" + verify(c.dycoinSale, "Verify the sale contract") + "</div>";
      });
    }).catch(function () { b.innerHTML = "<div class='notlive'>Could not read the sale — the contract address may be wrong for this network.</div>"; });
  }
  function roundBlock(name, price, sold, cap) {
    var pct = pctOf(sold, cap);
    return "<div class='rep-round'>" +
      "<div class='rep-figrow'><span>" + name + " @ " + price + "</span><b>" + fmtDyc(sold) + " / " + fmtDyc(cap) + " DYC</b></div>" +
      "<div class='rep-bar'><span style='width:" + Math.min(100, pct).toFixed(2) + "%'></span></div>" +
      "<div class='rep-barpct'>" + pct.toFixed(2) + "% of cap sold</div>" +
      "</div>";
  }

  function countBuyers(provider, c) {
    return provider.getBlockNumber().then(function (latest) {
      var topic = ethersRef.id("Purchased(address,uint8,address,uint256,uint256,uint256,uint256)");
      return scanLogs(provider, c.dycoinSale, [topic], c.deployBlock || 0, latest).then(function (logs) {
        if (!logs) return null;
        var set = {};
        logs.forEach(function (l) { set[l.topics[1]] = 1; }); // topic1 = indexed buyer
        return Object.keys(set).length;
      });
    }).catch(function () { return null; });
  }

  function renderVault(provider) {
    var c = cfg(), b = $("vault-body");
    if (!c.vestingVault) { b.innerHTML = notLive(" The vesting vault — DYC locked over the two years after listing"); return Promise.resolve(); }
    var vault = new ethersRef.Contract(c.vestingVault, VAULT_ABI, provider);
    return Promise.all([vault.totalVested(), sumClaimed(provider, c)]).then(function (r) {
      var vesting = r[0], claimed = r[1];
      b.innerHTML =
        "<div class='rep-big'><span class='rep-biglabel'>Currently vesting</span><span class='rep-bigval'>" + fmtDyc(vesting) + " <em>DYC</em></span></div>" +
        "<div class='rep-figrow'><span>Released &amp; claimed <span class='rep-src'>from event logs</span></span><b>" + (claimed == null ? "—" : fmtDyc(claimed) + " DYC") + "</b></div>" +
        "<div class='rep-note'>85% of every purchase vests linearly across the two years after exchange listing. Before listing, nothing has matured — released stays at zero.</div>" +
        "<div class='rep-verifyrow'>" + verify(c.vestingVault, "Verify the vault contract") + "</div>";
    }).catch(function () { b.innerHTML = "<div class='notlive'>Could not read the vault.</div>"; });
  }
  function sumClaimed(provider, c) {
    return provider.getBlockNumber().then(function (latest) {
      var topic = ethersRef.id("Claimed(address,uint256)");
      return scanLogs(provider, c.vestingVault, [topic], c.deployBlock || 0, latest).then(function (logs) {
        if (!logs) return null;
        var iface = new ethersRef.Interface(VAULT_ABI), tot = 0n;
        logs.forEach(function (l) { try { tot += iface.parseLog(l).args[1]; } catch (e) {} });
        return tot;
      });
    }).catch(function () { return null; });
  }

  function renderPool(provider) {
    var c = cfg(), b = $("pool-body");
    if (!c.holderStaking) { b.innerHTML = notLive(" The 150M reward pool — what remains and what it has paid"); return Promise.resolve(); }
    var pool = new ethersRef.Contract(c.holderStaking, POOL_ABI, provider);
    return Promise.all([pool.poolRemaining(), pool.totalAccrualOut(), pool.totalCapacity(), pool.POOL_AMOUNT()])
      .then(function (r) {
        var remaining = r[0], paid = r[1], capacity = r[2], size = r[3];
        var earning = capacity / 2n; // Σ live position principal (direct stakes + vested-registered ROI positions)
        var dailyOut = (earning * 4n) / 1000n; // 0.4%/day on every ROI-earning position — the M-F1 estimate basis
        var runway = dailyOut > 0n ? (remaining / dailyOut) : null;
        b.innerHTML =
          "<div class='rep-big'><span class='rep-biglabel'>Reward pool remaining</span><span class='rep-bigval'>" + fmtDyc(remaining) + " <em>DYC</em></span></div>" +
          "<div class='rep-bar'><span style='width:" + pctOf(remaining, size).toFixed(2) + "%'></span></div>" +
          "<div class='rep-barpct'>" + pctOf(remaining, size).toFixed(2) + "% of the 150,000,000 DYC pool</div>" +
          "<div class='rep-figrow'><span>Paid out as ROI so far</span><b>" + fmtDyc(paid) + " DYC</b></div>" +
          "<div class='rep-figrow'><span>Principal earning ROI</span><b>" + fmtDyc(earning) + " DYC</b></div>" +
          "<div class='rep-figrow'><span>Runway at the current pace</span><b>" + (runway == null ? "— (nothing earning yet)" : (runway.toString() + " days")) + "</b></div>" +
          "<div class='rep-note'>Runway is an estimate: pool remaining ÷ (0.4%/day on every ROI-earning position — direct stakes and vested-registered positions alike). It lengthens as ROI is redeemed back into the pool and shortens as more DYC starts earning.</div>" +
          "<div class='rep-verifyrow'>" + verify(c.holderStaking, "Verify the staking contract") + "</div>";
      }).catch(function () { b.innerHTML = "<div class='notlive'>Could not read the reward pool.</div>"; });
  }

  function renderDesk(provider) {
    var c = cfg(), b = $("desk-body");
    if (!c.roiRedemption) { b.innerHTML = notLive(" The redemption desk — the USDT reserve that cashes ROI out"); return Promise.resolve(); }
    var desk = new ethersRef.Contract(c.roiRedemption, DESK_ABI, provider);
    return Promise.all([desk.reserve(), sumRedeemed(provider, c)]).then(function (r) {
      var reserve = r[0], red = r[1];
      b.innerHTML =
        "<div class='rep-big'><span class='rep-biglabel'>USDT reserve backing redemptions</span><span class='rep-bigval'>" + fmtUsd(reserve) + " <em>USDT</em></span></div>" +
        "<div class='rep-figrow'><span>Total redeemed — USDT paid <span class='rep-src'>from event logs</span></span><b>" + (red == null ? "—" : fmtUsd(red.usdt) + " USDT") + "</b></div>" +
        "<div class='rep-figrow'><span>Total redeemed — DYC retired <span class='rep-src'>from event logs</span></span><b>" + (red == null ? "—" : fmtDyc(red.dyc) + " DYC") + "</b></div>" +
        "<div class='rep-note'>The desk holds only USDT and moves no DYC. Redeeming ROI returns that DYC to the reward pool, so redemptions extend the pool's runway rather than draining it.</div>" +
        "<div class='rep-verifyrow'>" + verify(c.roiRedemption, "Verify the desk contract") + "</div>";
    }).catch(function () { b.innerHTML = "<div class='notlive'>Could not read the desk.</div>"; });
  }
  function sumRedeemed(provider, c) {
    return provider.getBlockNumber().then(function (latest) {
      var topic = ethersRef.id("Redeemed(address,uint256,uint256)");
      return scanLogs(provider, c.roiRedemption, [topic], c.deployBlock || 0, latest).then(function (logs) {
        if (!logs) return null;
        var iface = new ethersRef.Interface(DESK_ABI), dyc = 0n, usdt = 0n;
        logs.forEach(function (l) { try { var a = iface.parseLog(l).args; dyc += a[1]; usdt += a[2]; } catch (e) {} });
        return { dyc: dyc, usdt: usdt };
      });
    }).catch(function () { return null; });
  }

  // ============================ ORCHESTRATION ============================
  function refresh() {
    return W.loadEthers().then(function (e) {
      ethersRef = e;
      var provider = readProvider();
      var net = $("rep-net");
      return provider.getNetwork().then(function (n) {
        net.className = "net-chip ok";
        net.innerHTML = "◈ " + PLAYER.chain.name.replace(" Testnet", "") + " · block reads live";
      }).catch(function () {
        net.className = "net-chip";
        net.textContent = "◈ chain unreachable";
      }).then(function () {
        return Promise.all([renderSale(provider), renderVault(provider), renderPool(provider), renderDesk(provider)]);
      }).then(function () {
        $("rep-updated").textContent = "read just now";
      });
    }).catch(function () {
      ["sale-body", "vault-body", "pool-body", "desk-body"].forEach(function (id) {
        $(id).innerHTML = "<div class='notlive'>Could not reach the network to read this.</div>";
      });
    });
  }

  function mount() { refresh(); }
  return { mount: mount, _refresh: refresh, _cfg: cfg };
})();
