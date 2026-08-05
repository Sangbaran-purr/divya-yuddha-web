/* ============================================================================
   DYDash — the M-F1 wallet dashboard. Reads DYC balances / vesting / staking /
   rewards live from the fresh contracts (addresses from DY_MF_CONFIG, S9 file+
   override pattern; LIQUID falls back to the frozen config.js dycoin). Every
   write action follows the S5a discipline: pre-check → staticCall pre-sim →
   confirm (human units + raw wei) → send with explicit gas → bounded wait →
   plain-words status. Network fees are POL, always.
   ========================================================================= */
window.DYDash = (function () {
  var PLAYER = window.DY_CONFIG;
  var FILE = window.DY_MF_CONFIG || { contracts: {} };
  var W = window.DYWallet;
  var LS_KEY = "dymf::config";

  // ---- ABIs (from the landed contract source) ----
  var DYCOIN_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ];
  var VEST_ABI = [
    "function grantedTo(address) view returns (uint256)",
    "function released(address) view returns (uint256)",
    "function vestedSoFar(address) view returns (uint256)",
    "function releasable(address) view returns (uint256)",
    "function dexDay() view returns (uint256)",
    "function VEST_DURATION() view returns (uint256)",
    "function claim()",
    "event Claimed(address indexed buyer, uint256 amount)",
  ];
  var STAKE_ABI = [
    "function positionCount(address) view returns (uint256)",
    "function getPosition(address,uint256) view returns (tuple(uint256 principal,uint256 startTime,uint256 rewardClaimed,bool staked,bool principalReleased))",
    "function pendingRoi(address) view returns (uint256)",
    "function roi(address) view returns (uint256)",
    "function vestedRegistered(address) view returns (bool)",
    "function CAP_MULTIPLE() view returns (uint256)",
    "function poolRemaining() view returns (uint256)",
    "function totalStakedPrincipal() view returns (uint256)",
    "function claim() returns (uint256)",
    "function stake(uint256) returns (uint256)",
    "function registerVested() returns (uint256)",
    "event Staked(address indexed staker, uint256 amount, uint256 positionId)",
    "event VestedRegistered(address indexed holder, uint256 principal, uint256 positionId)",
    "event RoiAccrued(address indexed staker, uint256 amount)",
  ];
  var DESK_ABI = [
    "function quote(uint256) view returns (uint256 usdtOut, uint256 dycUsed)",
    "function redeem(uint256) returns (uint256)",
    "function reserve() view returns (uint256)",
    "event Redeemed(address indexed user, uint256 dycAmount, uint256 usdtOut)",
  ];

  var DAY = 4n; var DAY_DEN = 1000n; // 0.4%/day (RATE is an internal constant; UI-stated per ratified flag)
  var POL_MIN = 20000000000000000n; // 0.02 POL — below this, show the fee banner
  var GAS = { claimVest: 160000, activate: 320000, stake: 320000, claimRoi: 300000, cashout: 260000, approve: 90000 };
  var WAIT_CONFIRMS = 1, WAIT_TIMEOUT_MS = 75000, FEE_HEADROOM = 2n;

  var ethersRef = null;
  var disconnected = false; // local "forget wallet" (EIP-1193 has no disconnect)
  var data = {}; // last-read chain data

  function $(id) { return document.getElementById(id); }
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function shortAddr(a) { return W.shortAddr(a); }
  function txUrl(h) { return PLAYER.chain.blockExplorerUrls[0] + "/tx/" + h; }

  // ---- config resolution: override > file; dycoin falls back to config.js frozen ----
  function ov() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function cfg() {
    var o = ov(), fc = FILE.contracts || {}, pc = PLAYER.contracts || {};
    var oc = o.contracts || {};
    return {
      dycoin: oc.dycoin || fc.dycoin || pc.dycoin || null,
      vestingVault: oc.vestingVault || fc.vestingVault || null,
      holderStaking: oc.holderStaking || fc.holderStaking || null,
      roiRedemption: oc.roiRedemption || fc.roiRedemption || null,
      readRpcUrl: o.readRpcUrl || FILE.readRpcUrl || null,
      deployBlock: o.deployBlock != null ? o.deployBlock : FILE.deployBlock || 0,
    };
  }

  function withEthers() { return W.loadEthers().then(function (e) { ethersRef = e; return e; }); }
  function readProvider() {
    var c = cfg();
    if (c.readRpcUrl) return new ethersRef.JsonRpcProvider(c.readRpcUrl);
    if (window.ethereum && W.state.connected) return new ethersRef.BrowserProvider(window.ethereum);
    return new ethersRef.JsonRpcProvider(PLAYER.chain.rpcUrls[0]);
  }

  // ---- number helpers ----
  function fmt(wei, dec, places) {
    try {
      var s = ethersRef.formatUnits(wei, dec == null ? 18 : dec);
      var n = Number(s);
      return n.toLocaleString("en-US", { minimumFractionDigits: places == null ? 2 : places, maximumFractionDigits: places == null ? 2 : places });
    } catch (e) { return "—"; }
  }
  function dateFmt(ts) {
    if (!ts) return "—";
    var d = new Date(ts * 1000);
    return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
  }

  // ---- connected? ----
  function isConnected() { return W.state.connected && !disconnected; }

  // =========================================================================
  //  RENDER
  // =========================================================================
  function renderWalletBar() {
    var s = W.state, st = $("wb-state"), net = $("wb-net"), act = $("wb-action");
    st.innerHTML = ""; net.innerHTML = "";
    if (!isConnected()) {
      act.textContent = "Connect Wallet";
      act.className = "btn-g btn-p";
      act.onclick = doConnect;
      return;
    }
    var chip = el("span", "addr-chip");
    chip.innerHTML = "<span>💠</span><span>" + shortAddr(s.address) + "</span>";
    var copy = el("button", "copy", "⧉");
    copy.title = "Copy address";
    copy.onclick = function () { try { navigator.clipboard.writeText(s.address); copy.textContent = "✓"; setTimeout(function () { copy.textContent = "⧉"; }, 1200); } catch (e) {} };
    chip.appendChild(copy);
    st.appendChild(chip);
    if (!s.chainOk) {
      var w = el("span", "net-warn");
      w.innerHTML = "<b>⚠ Wrong Network</b><button class='switch'>Switch to " + PLAYER.chain.name.replace(" Testnet", "") + "</button>";
      w.querySelector(".switch").onclick = function () { W.ensureChain().then(refresh).catch(function () {}); };
      st.appendChild(w);
    } else {
      net.innerHTML = "<span class='net-chip ok'>◈ " + PLAYER.chain.name.replace(" Testnet", "") + " ✓</span>";
    }
    act.textContent = "Disconnect";
    act.className = "btn-g";
    act.onclick = function () { disconnected = true; refresh(); };
  }

  function dimCards(on) {
    ["card-liquid", "card-vesting", "card-staked", "card-rewards"].forEach(function (id) {
      $(id).classList.toggle("dim", on);
    });
  }

  function preConnectCards() {
    $("liq-amt").textContent = "—";
    $("liq-note").textContent = "";
    var pc = "<div class='notlive'>Connect your wallet to view this balance.</div>";
    $("vest-body").innerHTML = pc;
    $("stake-body").innerHTML = pc;
    $("reward-body").innerHTML = pc;
    $("runway-days").textContent = "—";
    $("tx-body").innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--gold-aged);padding:22px'>Connect your wallet to see your activity.</td></tr>";
    $("tx-status").textContent = "";
  }

  function notLive(label) {
    return "<div class='notlive'><b>Not yet live</b>" + label +
      " lights up here the moment the contract goes live. Nothing is wrong — it simply isn't deployed yet.</div>";
  }

  function renderLiquid() {
    if (data.liqErr) { $("liq-amt").textContent = "—"; $("liq-note").innerHTML = "<span>Could not read the token.</span>"; return; }
    $("liq-amt").textContent = fmt(data.liquid, data.dycDec);
    $("liq-note").innerHTML = "";
  }

  function renderVesting() {
    var b = $("vest-body");
    if (!cfg().vestingVault) { b.innerHTML = notLive(" Your locked DYC and its release schedule"); return; }
    if (data.vestErr) { b.innerHTML = "<div class='notlive'>Could not read vesting. Check the address.</div>"; return; }
    var granted = data.vest.granted, vested = data.vest.vested, releasable = data.vest.releasable;
    var locked = granted > vested ? granted - vested : 0n;
    var pct = granted > 0n ? Number((vested * 10000n) / granted) / 100 : 0;
    var pre = data.vest.dexDay === 0n;
    var untilTs = pre ? 0 : Number(data.vest.dexDay + data.vest.dur);
    b.innerHTML =
      "<div class='stat-label'>Locked Amount</div>" +
      "<div class='stat-line'><span class='v'>" + fmt(locked) + "</span><span class='u'>DYC</span></div>" +
      "<div class='bar'><i style='width:" + pct.toFixed(0) + "%'></i></div>" +
      "<div class='bar-row'><span style='opacity:.7'>" + (pre ? "not started" : "Releasing until " + dateFmt(untilTs)) + "</span><span>" + pct.toFixed(0) + "%</span></div>" +
      "<div class='hair'></div>" +
      "<div class='stat-label'>Released but unclaimed</div>" +
      "<div class='stat-line'><span class='v' style='color:var(--gold-burnished)'>" + fmt(releasable) + "</span><span class='u'>DYC</span></div>" +
      "<div class='card-actions'><button class='btn-g btn-p' id='act-vclaim'" + (releasable > 0n ? "" : " disabled") + ">Claim</button></div>" +
      (pre ? "<div class='note pre'>⧗ Release begins at exchange listing</div>" : "");
    if ($("act-vclaim")) $("act-vclaim").onclick = actClaimVesting;
  }

  function renderStaked() {
    var b = $("stake-body");
    if (!cfg().holderStaking) { b.innerHTML = notLive(" Your staked DYC, daily earnings and progress to 2X"); return; }
    if (data.stakeErr) { b.innerHTML = "<div class='notlive'>Could not read staking. Check the address.</div>"; return; }
    var st = data.stake;
    var mult = st.principal > 0n ? Number(((st.rewardTotal) * 10000n) / st.principal) / 10000 : 0;
    var cap = Number(st.cap);
    var pct = cap > 0 ? Math.min(100, (mult / cap) * 100) : 0;
    var daysEl = st.earliest ? Math.floor((data.now - st.earliest) / 86400) : 0;
    var daysCap = Math.round(cap / (Number(DAY) / Number(DAY_DEN))); // 2 / 0.004 = 500
    b.innerHTML =
      "<div class='stat-label'>Staked Amount</div>" +
      "<div class='stat-line'><span class='v'>" + fmt(st.principal) + "</span><span class='u'>DYC</span></div>" +
      "<div class='bar-row' style='margin:8px 0'><span class='addr-chip' style='padding:5px 10px'>0.40% / day</span><span style='opacity:.7;font-size:.78rem'>Daily Rate</span></div>" +
      "<div class='bar'><i style='width:" + pct.toFixed(0) + "%'></i></div>" +
      "<div class='bar-row'><span style='opacity:.7'>Days " + daysEl + " / " + daysCap + "</span><span>" + mult.toFixed(2) + "X / " + cap + "X</span></div>" +
      "<div class='card-actions'>" +
      "<button class='btn-g btn-green' id='act-activate'" + (st.canActivate ? "" : " disabled") + ">Activate</button>" +
      "<button class='btn-g' id='act-topup'>Top Up</button></div>" +
      "<div class='note'>ⓘ You've earned " + mult.toFixed(2) + "X of the " + cap + "X lifetime cap</div>";
    if ($("act-activate")) $("act-activate").onclick = actActivate;
    if ($("act-topup")) $("act-topup").onclick = actTopUp;
  }

  function renderRewards() {
    var b = $("reward-body");
    if (!cfg().holderStaking) { b.innerHTML = notLive(" Your claimable rewards and USDT cash-out"); return; }
    if (data.rewardErr) { b.innerHTML = "<div class='notlive'>Could not read rewards.</div>"; return; }
    var claimable = data.stake.pending, roiCol = data.stake.roi;
    var hasDesk = !!cfg().roiRedemption;
    var deskFunded = data.deskReserve != null && data.deskReserve > 0n;
    b.innerHTML =
      "<div class='stat-label'>Claimable Amount</div>" +
      "<div class='big-num' style='font-size:1.9rem'>" + fmt(claimable) + "<span class='u'>DYC</span></div>" +
      "<div class='card-actions'><button class='btn-g btn-purple btn-block' id='act-rclaim'" + (claimable > 0n ? "" : " disabled") + ">Claim</button></div>" +
      (hasDesk
        ? "<button class='btn-g btn-block' id='act-cashout' style='margin-top:10px'" + (roiCol > 0n && deskFunded ? "" : " disabled") + ">Cash Out (USDT)<br><span style='font-size:.8rem;opacity:.85'>" +
          fmt(roiCol) + " DYC → " + (data.cashoutUsdt != null ? fmt(data.cashoutUsdt, 6) : "—") + " USDT</span></button>" +
          "<div class='desk-status " + (deskFunded ? "funded" : "empty") + "'><span class='dot'></span>" +
          (deskFunded ? "Desk Funded <span style='opacity:.7'>(sufficient USDT reserve)</span>" : "Desk Empty <span style='opacity:.7'>(cash-out paused; ROI stays fully in-game)</span>") + "</div>"
        : "<div class='note'>Cash-out desk not yet live.</div>");
    if ($("act-rclaim")) $("act-rclaim").onclick = actClaimRewards;
    if ($("act-cashout")) $("act-cashout").onclick = actCashOut;
  }

  function renderRunway() {
    if (!cfg().holderStaking || data.runwayDays == null) { $("runway-days").textContent = "—"; return; }
    $("runway-days").textContent = data.runwayDays + " Days";
  }

  // =========================================================================
  //  READ
  // =========================================================================
  function refresh() {
    renderWalletBar();
    if (!isConnected()) { dimCards(true); preConnectCards(); return; }
    dimCards(false);
    withEthers().then(function () {
      var c = cfg(), addr = W.state.address, provider = readProvider();
      data = {};
      return provider.getBlock("latest").then(function (blk) {
        data.now = blk ? Number(blk.timestamp) : Math.floor(Date.now() / 1000);
        var jobs = [];
        // POL balance → fee banner
        jobs.push(provider.getBalance(addr).then(function (p) { data.pol = p; }).catch(function () {}));
        // LIQUID
        if (c.dycoin) {
          var dy = new ethersRef.Contract(c.dycoin, DYCOIN_ABI, provider);
          jobs.push(Promise.all([dy.balanceOf(addr), dy.decimals().catch(function () { return 18; })])
            .then(function (r) { data.liquid = r[0]; data.dycDec = Number(r[1]); })
            .catch(function () { data.liqErr = true; }));
        } else { data.liqErr = true; }
        // VESTING
        if (c.vestingVault) {
          var vv = new ethersRef.Contract(c.vestingVault, VEST_ABI, provider);
          jobs.push(Promise.all([vv.grantedTo(addr), vv.vestedSoFar(addr), vv.releasable(addr), vv.dexDay(), vv.VEST_DURATION()])
            .then(function (r) { data.vest = { granted: r[0], vested: r[1], releasable: r[2], dexDay: r[3], dur: r[4] }; })
            .catch(function () { data.vestErr = true; }));
        }
        // STAKING + REWARDS
        if (c.holderStaking) {
          var hs = new ethersRef.Contract(c.holderStaking, STAKE_ABI, provider);
          jobs.push(hs.positionCount(addr).then(function (n) {
            var reads = [];
            for (var i = 0; i < Number(n); i++) reads.push(hs.getPosition(addr, i));
            return Promise.all(reads);
          }).then(function (ps) {
            var principal = 0n, rewardClaimed = 0n, earliest = 0;
            ps.forEach(function (p) {
              if (!p.principalReleased) principal += p.principal;
              rewardClaimed += p.rewardClaimed;
              var s = Number(p.startTime);
              if (s && (!earliest || s < earliest)) earliest = s;
            });
            return Promise.all([hs.pendingRoi(addr), hs.roi(addr), hs.CAP_MULTIPLE(), hs.vestedRegistered(addr), hs.poolRemaining(), hs.totalStakedPrincipal()])
              .then(function (r) {
                data.stake = {
                  principal: principal, rewardClaimed: rewardClaimed, earliest: earliest,
                  pending: r[0], roi: r[1], cap: r[2], canActivate: !r[3], rewardTotal: rewardClaimed + r[0],
                };
                data.pool = { remaining: r[4], staked: r[5] };
                // runway estimate: poolRemaining / (totalStakedPrincipal * 0.4%/day)  (disclosed)
                var daily = (r[5] * DAY) / DAY_DEN;
                data.runwayDays = daily > 0n ? Number(r[4] / daily) : null;
              });
          }).catch(function () { data.stakeErr = true; data.rewardErr = true; }));
        }
        // DESK reserve + cash-out quote
        if (c.roiRedemption) {
          var rd = new ethersRef.Contract(c.roiRedemption, DESK_ABI, provider);
          jobs.push(rd.reserve().then(function (res) { data.deskReserve = res; }).catch(function () {}));
        }
        return Promise.all(jobs);
      }).then(function () {
        // cash-out quote needs roi + desk
        if (c.roiRedemption && data.stake && data.stake.roi > 0n) {
          var rd = new ethersRef.Contract(c.roiRedemption, DESK_ABI, provider);
          return rd.quote(data.stake.roi).then(function (q) { data.cashoutUsdt = q[0]; }).catch(function () {});
        }
      }).then(function () {
        renderLiquid(); renderVesting(); renderStaked(); renderRewards(); renderRunway();
        renderPolBanner();
        loadFeed();
      });
    }).catch(function (e) {
      // read failed entirely
      dimCards(false);
    });
  }

  function renderPolBanner() {
    var show = isConnected() && W.state.chainOk && data.pol != null && data.pol < POL_MIN;
    $("pol-banner").classList.toggle("show", show);
  }

  // =========================================================================
  //  ACTIONS (pre-check → staticCall pre-sim → confirm → send → wait)
  // =========================================================================
  function feeOverrides(provider) {
    return provider.getFeeData().then(function (fd) {
      var gp = fd.gasPrice || 0n, mf = fd.maxFeePerGas || 0n, basis = gp > mf ? gp : mf;
      if (basis === 0n) return {};
      return { maxFeePerGas: basis * FEE_HEADROOM, maxPriorityFeePerGas: basis * FEE_HEADROOM };
    }).catch(function () { return {}; });
  }
  function polGuard() {
    // repeat the fee guidance in plain words when POL is low
    if (data.pol != null && data.pol < POL_MIN) {
      return "You need a small amount of POL for network fees. Add a little POL to your wallet and try again.";
    }
    return null;
  }
  function decodeErr(e) {
    if (e && e.code === "ACTION_REJECTED") return "You declined the signature in your wallet.";
    var s = (e && (e.shortMessage || e.reason || e.message)) || "";
    if (/insufficient funds|gas/i.test(s)) return "You need a small amount of POL for network fees. Add a little POL and try again.";
    if (e && e.revert && e.revert.name) return e.revert.name;
    return s ? String(s).slice(0, 120) : "The transaction could not be completed.";
  }

  function confirmStep(title, bodyHtml, rawText) {
    return new Promise(function (resolve) {
      $("ov-confirm-title").textContent = title;
      $("ov-confirm-body").innerHTML = bodyHtml;
      $("ov-confirm-raw").textContent = rawText || "";
      $("ov-confirm").classList.add("show");
      $("ov-confirm-cancel").onclick = function () { $("ov-confirm").classList.remove("show"); resolve(false); };
      $("ov-confirm-go").onclick = function () { $("ov-confirm").classList.remove("show"); resolve(true); };
    });
  }
  function pending(on, title) {
    $("ov-pending").classList.toggle("show", on);
    if (title) $("ov-pending-title").textContent = title;
  }
  function failBox(msg) {
    $("ov-fail-msg").textContent = msg;
    $("ov-fail").classList.add("show");
    $("ov-fail-close").onclick = function () { $("ov-fail").classList.remove("show"); };
  }

  // generic: pre-sim a write, confirm, send, wait
  function runAction(opts) {
    // opts: { contractAddr, abi, simFn(contract), sendFn(contract, ov), gas, title, body, raw, guardMsg }
    if (opts.guardMsg) { failBox(opts.guardMsg); return Promise.resolve(); }
    var pg = polGuard();
    if (pg) { failBox(pg); return Promise.resolve(); }
    return withEthers().then(function () {
      var provider = new ethersRef.BrowserProvider(window.ethereum);
      return provider.getSigner().then(function (signer) {
        var c = new ethersRef.Contract(opts.contractAddr, opts.abi, signer);
        // PRE-SIM (never send without it)
        return opts.simFn(c).then(function () {
          return confirmStep(opts.title, opts.body, opts.raw).then(function (go) {
            if (!go) return;
            pending(true, "Confirming…");
            return feeOverrides(provider).then(function (fo) {
              var ovr = { gasLimit: opts.gas };
              if (fo.maxFeePerGas != null) { ovr.maxFeePerGas = fo.maxFeePerGas; ovr.maxPriorityFeePerGas = fo.maxPriorityFeePerGas; }
              return opts.sendFn(c, ovr).then(function (tx) {
                return tx.wait(WAIT_CONFIRMS, WAIT_TIMEOUT_MS).then(function (rc) {
                  pending(false);
                  if (rc && rc.status === 1) { refresh(); }
                  else failBox("The transaction reverted on-chain. Nothing was changed.");
                }).catch(function () {
                  pending(false);
                  failBox("Your transaction was submitted but not confirmed in time. Check your wallet — it may still complete.");
                });
              });
            });
          });
        }).catch(function (e) {
          pending(false);
          failBox(decodeErr(e));
        });
      });
    });
  }

  function actClaimVesting() {
    var c = cfg(), amt = data.vest ? data.vest.releasable : 0n;
    runAction({
      contractAddr: c.vestingVault, abi: VEST_ABI, gas: GAS.claimVest,
      simFn: function (k) { return k.claim.staticCall(); },
      sendFn: function (k, o) { return k.claim(o); },
      title: "Claim vested DYC",
      body: "Claim <b>" + fmt(amt) + " DYC</b> of released vesting to your wallet.",
      raw: "raw: " + amt.toString() + " wei",
    });
  }
  function actActivate() {
    var c = cfg();
    runAction({
      contractAddr: c.holderStaking, abi: STAKE_ABI, gas: GAS.activate,
      simFn: function (k) { return k.registerVested.staticCall(); },
      sendFn: function (k, o) { return k.registerVested(o); },
      title: "Activate vested earning",
      body: "Activate your vested DYC so it earns 0.40%/day toward the 2X cap.",
    });
  }
  function actTopUp() {
    var c = cfg();
    var raw = window.prompt("Top up staking — amount of DYC to stake:", "");
    if (raw == null) return;
    var amtWei;
    try { amtWei = ethersRef.parseUnits(String(raw).trim(), 18); if (amtWei <= 0n) throw 0; }
    catch (e) { failBox("Enter a positive DYC amount."); return; }
    runAction({
      contractAddr: c.holderStaking, abi: STAKE_ABI, gas: GAS.stake,
      simFn: function (k) { return k.stake.staticCall(amtWei); }, // reverts plain-words if not approved / insufficient
      sendFn: function (k, o) { return k.stake(amtWei, o); },
      title: "Top up staking",
      body: "Stake <b>" + fmt(amtWei) + " DYC</b> (one-way; earns 0.40%/day). Requires DYC approved to the staking contract.",
      raw: "raw: " + amtWei.toString() + " wei",
    });
  }
  function actClaimRewards() {
    var c = cfg(), amt = data.stake ? data.stake.pending : 0n;
    runAction({
      contractAddr: c.holderStaking, abi: STAKE_ABI, gas: GAS.claimRoi,
      simFn: function (k) { return k.claim.staticCall(); },
      sendFn: function (k, o) { return k.claim(o); },
      title: "Claim rewards",
      body: "Move <b>" + fmt(amt) + " DYC</b> of accrued rewards into your claimable ROI balance.",
      raw: "raw: " + amt.toString() + " wei",
    });
  }
  function actCashOut() {
    var c = cfg(), amt = data.stake ? data.stake.roi : 0n, usdt = data.cashoutUsdt;
    runAction({
      contractAddr: c.roiRedemption, abi: DESK_ABI, gas: GAS.cashout,
      simFn: function (k) { return k.redeem.staticCall(amt); },
      sendFn: function (k, o) { return k.redeem(amt, o); },
      title: "Cash out to USDT",
      body: "Cash out <b>" + fmt(amt) + " DYC</b> for <b>" + (usdt != null ? fmt(usdt, 6) : "—") + " USDT</b> at the fixed 0.010 rate.",
      raw: "raw in: " + amt.toString() + " wei",
    });
  }

  // =========================================================================
  //  TRANSACTION FEED (chunked getLogs, S5a pattern)
  // =========================================================================
  var LOG_CHUNK = 9000;
  function loadFeed() {
    var c = cfg(), addr = W.state.address, body = $("tx-body"), status = $("tx-status");
    if (!c.holderStaking && !c.vestingVault && !c.roiRedemption) {
      body.innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--gold-aged);padding:20px'>Your activity appears here once the platform contracts are live.</td></tr>";
      return;
    }
    status.textContent = "Scanning recent activity…";
    var provider = readProvider();
    provider.getBlockNumber().then(function (latest) {
      var from = c.deployBlock || Math.max(0, latest - 45000);
      var evs = [];
      var jobs = [];
      if (c.vestingVault) {
        var vv = new ethersRef.Contract(c.vestingVault, VEST_ABI, provider);
        jobs.push(scan(vv, vv.filters.Claimed(addr), from, latest, function (e) {
          evs.push({ block: e.blockNumber, type: "Claimed", ic: "vesting", details: "Vesting claimed", amt: fmt(e.args.amount) + " DYC", hash: e.transactionHash });
        }));
      }
      if (c.holderStaking) {
        var hs = new ethersRef.Contract(c.holderStaking, STAKE_ABI, provider);
        jobs.push(scan(hs, hs.filters.Staked(addr), from, latest, function (e) {
          evs.push({ block: e.blockNumber, type: "Staked", ic: "staked", details: "Staked to earn", amt: fmt(e.args.amount) + " DYC", hash: e.transactionHash });
        }));
        jobs.push(scan(hs, hs.filters.VestedRegistered(addr), from, latest, function (e) {
          evs.push({ block: e.blockNumber, type: "Activated", ic: "staked", details: "Vesting activated to staked", amt: fmt(e.args.principal) + " DYC", hash: e.transactionHash });
        }));
        jobs.push(scan(hs, hs.filters.RoiAccrued(addr), from, latest, function (e) {
          evs.push({ block: e.blockNumber, type: "Claimed", ic: "rewards", details: "Reward claimed", amt: fmt(e.args.amount) + " DYC", hash: e.transactionHash });
        }));
      }
      if (c.roiRedemption) {
        var rd = new ethersRef.Contract(c.roiRedemption, DESK_ABI, provider);
        jobs.push(scan(rd, rd.filters.Redeemed(addr), from, latest, function (e) {
          evs.push({ block: e.blockNumber, type: "Cashed Out", ic: "rewards", details: "Cash out to USDT", amt: fmt(e.args.dycAmount) + " DYC → " + fmt(e.args.usdtOut, 6) + " USDT", hash: e.transactionHash });
        }));
      }
      return Promise.all(jobs).then(function () { return attachTimes(provider, evs); });
    }).then(function (evs) {
      evs.sort(function (a, b) { return b.block - a.block; });
      renderFeed(evs);
      status.textContent = evs.length ? "Showing " + evs.length + " recent event(s)." : "";
    }).catch(function () {
      body.innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--gold-aged);padding:20px'>Could not read recent activity.</td></tr>";
      status.textContent = "";
    });
  }
  function scan(contract, filter, from, latest, push) {
    var start = from, out = [];
    function step() {
      if (start > latest) return Promise.resolve(out);
      var end = Math.min(start + LOG_CHUNK - 1, latest);
      return contract.queryFilter(filter, start, end).then(function (r) {
        r.forEach(push); start = end + 1; return step();
      });
    }
    return step();
  }
  function attachTimes(provider, evs) {
    var blocks = {}; evs.forEach(function (e) { blocks[e.block] = true; });
    return Promise.all(Object.keys(blocks).map(function (b) {
      return provider.getBlock(Number(b)).then(function (blk) { blocks[b] = blk ? Number(blk.timestamp) : null; }).catch(function () { blocks[b] = null; });
    })).then(function () { evs.forEach(function (e) { e.ts = blocks[e.block]; }); return evs; });
  }
  function feedIcon(k) {
    var src = { vesting: "icon_vesting", staked: "icon_staked", rewards: "icon_rewards" }[k] || "icon_liquid";
    return "<img class='ic' src='assets/brand/mf/" + src + ".png?v=mf1b' alt=''>";
  }
  function renderFeed(evs) {
    var body = $("tx-body");
    if (!evs.length) { body.innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--gold-aged);padding:20px'>No activity yet.</td></tr>"; return; }
    body.innerHTML = "";
    evs.forEach(function (e) {
      var tr = el("tr");
      tr.innerHTML =
        "<td><div class='type'>" + feedIcon(e.ic) + e.type + "</div></td>" +
        "<td>" + e.details + "</td><td>" + e.amt + "</td>" +
        "<td class='tx-status'>Success</td>" +
        "<td style='white-space:nowrap'>" + (e.ts ? new Date(e.ts * 1000).toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—") + "</td>" +
        "<td><a class='txlink' target='_blank' rel='noopener' href='" + txUrl(e.hash) + "'>" + e.hash.slice(0, 8) + "…↗</a></td>";
      body.appendChild(tr);
    });
  }

  // =========================================================================
  function doConnect() {
    disconnected = false;
    W.connect().then(function (st) { if (!st.chainOk) return W.ensureChain(); }).then(refresh).catch(function () {});
  }

  function toast(msg) {
    var t = el("div", null, msg);
    t.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#171309;border:1px solid var(--gold-hairline);color:var(--parchment);padding:10px 16px;border-radius:10px;z-index:300;font-size:.9rem";
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function mount() {
    // sidebar soft links
    document.querySelectorAll("[data-soon]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); toast("Coming soon."); }; });
    document.querySelectorAll("[data-referrals]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); toast("Referrals live on the separate rewards platform."); }; });
    document.querySelectorAll("[data-help]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); toast("Support: open a ticket in Discord."); }; });
    W.onChange(function () { refresh(); });
    W.init();
    refresh();
  }

  return { mount: mount, _cfg: cfg, _refresh: refresh };
})();
