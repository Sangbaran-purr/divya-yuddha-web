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
    "function syncVested() returns (uint256)",
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
  // M-F2 — DYCoinSale (buy). Round enum: 0 NONE, 1 PRESALE, 2 PUBLIC. USDT is 6-dec (usdE18 = amount * 1e12).
  var SALE_ABI = [
    "function currentRound() view returns (uint8)",
    "function presalePriceE18() view returns (uint256)",
    "function publicPriceE18() view returns (uint256)",
    "function quoteDyc(uint256) view returns (uint256)",
    "function presaleMinUsdE18() view returns (uint256)",
    "function publicMinUsdE18() view returns (uint256)",
    "function allowlistSigner() view returns (address)",
    "function buyWithStable(address,uint256,bytes,string)",
  ];
  var ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];

  // ── ERROR DECODER (M-F4 defect 2) — every custom error the five user-facing contracts can throw,
  //    plus the shared OpenZeppelin base errors, gets a plain-words translation. "Unknown custom
  //    error" must never reach a customer. Keyed by error NAME (parsed by selector via ethers).
  var ERR_ABI = [
    // DYCoinSale
    "error ZeroAddress()", "error BadWindows()", "error PublicCheaperThanPresale()", "error SaleNotStarted()",
    "error InGap()", "error SaleEnded()", "error PresaleSoldOut()", "error PublicSoldOut()", "error RoundCapExceeded()",
    "error UnknownAsset()", "error ZeroPayment()", "error BelowMin()", "error AboveMax()", "error NotAllowlisted()",
    "error PolDisabled()", "error StaleOracle()", "error OraclePriceOutOfBounds()", "error AffiliateNotActive()",
    "error NotRegistrationEligible()", "error BadCodeLength()", "error CodeTaken()", "error WalletHasCode()",
    "error SelfReferral()", "error NothingToSweep()",
    // HolderStaking
    "error ZeroAmount()", "error PoolNotInitialized()", "error PoolAlreadyInitialized()", "error NotTreasury()",
    "error Barred()", "error StakingClosed()", "error TooManyPositions()", "error AlreadyRegistered()",
    "error NotRegistered()", "error NoVestedBalance()", "error NothingToSync()", "error NotDexDayYet()",
    "error ReleaseTooEarly()", "error NotDebitor()", "error NotAuthorizedPoolCredit()", "error InsufficientRoi()",
    // VestingVault
    "error SaleAlreadySet()", "error NotSale()", "error DexDayAlreadyDeclared()", "error NothingToClaim()",
    // RoiRedemption
    "error BadDecimals()", "error DustAmount()", "error ReserveInsufficient()",
    // DropDesk (M-F6)
    "error ExpiredCoupon(uint256 deadline)", "error CancelledCoupon(uint256 nonce)",
    "error AlreadyRedeemed(uint256 nonce)", "error DeskNeedsRefill(uint256 amount, uint256 balance)",
    "error BadSignature(address recovered)", "error ZeroSigner()", "error InsufficientBalance(uint256 amount, uint256 balance)",
    // DYCoin + OpenZeppelin base
    "error ERC20ExceededCap(uint256 increasedSupply, uint256 cap)",
    "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
    "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
    "error ERC20InvalidReceiver(address receiver)", "error ERC20InvalidSender(address sender)",
    "error ERC20InvalidApprover(address approver)", "error ERC20InvalidSpender(address spender)",
    "error OwnableUnauthorizedAccount(address account)", "error OwnableInvalidOwner(address owner)",
  ];
  var ERR_PLAIN = {
    // token / allowance (the M-F4 defect-2 root cause: an un-approved stake)
    ERC20InsufficientAllowance: "This needs your approval first. Approve the token for this contract, then try again.",
    ERC20InsufficientBalance: "You don't have enough of that token in your wallet for this.",
    ERC20ExceededCap: "This would exceed the token's fixed supply cap.",
    ERC20InvalidReceiver: "That recipient address can't receive the token.",
    ERC20InvalidSender: "That sender address is invalid.",
    OwnableUnauthorizedAccount: "Only the contract owner can do that — this isn't something a holder can call.",
    // sale
    SaleNotStarted: "The sale hasn't opened yet. Check back when the presale window starts.",
    InGap: "The sale is paused between rounds right now. It reopens for the public round.",
    SaleEnded: "The sale has ended.",
    PresaleSoldOut: "The presale is sold out.", PublicSoldOut: "The public sale is sold out.",
    RoundCapExceeded: "This purchase would exceed the amount left in this round. Try a smaller amount.",
    UnknownAsset: "That payment token isn't accepted — use USDT.",
    ZeroPayment: "Enter a purchase amount above zero.",
    BelowMin: "That's below the minimum purchase.",
    AboveMax: "That's above the per-wallet maximum for this round.",
    NotAllowlisted: "This wallet isn't approved for the presale yet. Register, then the owner approves you.",
    PolDisabled: "Paying with POL isn't enabled — use USDT.",
    NotRegistrationEligible: "This wallet can't register a referral code.",
    CodeTaken: "That referral code is already taken.", WalletHasCode: "This wallet already has a referral code.",
    SelfReferral: "You can't refer yourself.", BadCodeLength: "That referral code is the wrong length.",
    // staking
    ZeroAmount: "Enter an amount above zero.",
    PoolNotInitialized: "Staking isn't open yet — the reward pool hasn't been funded.",
    Barred: "This wallet isn't allowed to stake.",
    StakingClosed: "Staking has closed for this phase (the exchange listing has been declared).",
    TooManyPositions: "You've reached the maximum number of separate stakes for one wallet.",
    AlreadyRegistered: "Your vested DYC is already activated — use Top Up to add more.",
    NotRegistered: "Activate your vested DYC first before syncing.",
    NoVestedBalance: "You have no vested DYC to activate yet.",
    NothingToSync: "There's no new vested DYC to sync right now.",
    NotDexDayYet: "This unlocks after the exchange listing.", ReleaseTooEarly: "This unlocks after the listing + vesting period.",
    InsufficientRoi: "You don't have that much earned ROI to draw on.",
    // vesting
    NothingToClaim: "There's nothing to claim yet — vesting releases gradually after listing.",
    // desk
    ReserveInsufficient: "The cash-out desk's reserve can't cover this right now. Try a smaller amount or check back later.",
    DustAmount: "That amount is too small to cash out.",
    // drop desk (M-F6)
    ExpiredCoupon: "This drop coupon has expired. Coupons are valid for 90 days from when they're issued.",
    CancelledCoupon: "This drop coupon was cancelled and can no longer be redeemed.",
    AlreadyRedeemed: "This drop coupon has already been redeemed.",
    DeskNeedsRefill: "Desk refilling — your coupon is safe. The drop desk is topping up; try again shortly.",
    BadSignature: "This drop coupon couldn't be verified. It may be from an old signing key — ask for a fresh coupon.",
    InsufficientBalance: "The desk doesn't hold enough for this right now.",
    ZeroSigner: "The drop desk isn't configured with a signer yet.",
    // shared
    ZeroAddress: "An address in this request is invalid.",
  };
  var _errIface = null;
  function errIface() { if (!_errIface && ethersRef) _errIface = new ethersRef.Interface(ERR_ABI); return _errIface; }
  // dig the revert bytes out of ethers' nested error shapes
  function revertData(e) {
    if (!e) return null;
    if (typeof e.data === "string" && e.data.startsWith("0x")) return e.data;
    var cands = [e.info && e.info.error && e.info.error.data, e.error && e.error.data, e.revert && e.revert.data,
      e.data && e.data.data, e.cause && revertData(e.cause)];
    for (var i = 0; i < cands.length; i++) { var d = cands[i]; if (typeof d === "string" && d.startsWith("0x")) return d; }
    return null;
  }

  // ── S-CLAIM-2B (owner ruling 2026-08-07): self-claim UI OFF; rewards are admin-granted on request. One-flip
  //    restore (set CLAIM_UI_ON = true to bring the Claim button back — the Deva-hero-entry pattern; no deletion).
  //    The rewards FIGURE + history keep rendering regardless. Support contact is the live email; the community/social
  //    contact is DEFERRED until an invite exists (S-CONTACTS-1, owner-ruled) — no public page points at it until then.
  var CLAIM_UI_ON = false;
  var CLAIM_CONTACTS = { email: "divyayuddha@gmail.com" };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var DAY = 4n; var DAY_DEN = 1000n; // 0.4%/day (RATE is an internal constant; UI-stated per ratified flag)
  var POL_MIN = 20000000000000000n; // 0.02 POL — below this, show the fee banner
  var MIN_BUY_USDT = 100000000n; // M-F4 defect 1: page-side minimum purchase = 100 USDT (6-dec). Ruled 2026-08-06.
  // GAS floors (house law: explicit gas limit for every state-touching call). redeem cold-state floor: measured max
  // 140,296 (cold nonce SSTORE + cold recipient + funding reconcile) → 160,000 with margin.
  var GAS = { claimVest: 160000, activate: 320000, stake: 320000, claimRoi: 300000, cashout: 260000, approve: 90000, buy: 380000, redeem: 160000 };
  // DropDesk read/write ABI (M-F6)
  var DROP_ABI = [
    "function redeem(address wallet, uint256 amount, uint256 deadline, uint256 nonce, bytes sig)",
    "function nonceRedeemed(uint256) view returns (bool)",
    "function nonceCancelled(uint256) view returns (bool)",
    "function dropSigner() view returns (address)",
  ];
  var buyState = {}; // { round, price, voucher }
  var allowlist = null; // cached [{wallet, sig}]
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
      dycoinSale: oc.dycoinSale || fc.dycoinSale || null,
      dropDesk: oc.dropDesk || fc.dropDesk || null, // M-F6 — the Drop Desk (coupon redemption)
      usdt: oc.usdt || fc.usdt || null,
      readRpcUrl: o.readRpcUrl || FILE.readRpcUrl || null,
      readRpcUrlFallbacks: (o.readRpcUrlFallbacks || FILE.readRpcUrlFallbacks || []),
      logChunk: o.logChunk || FILE.logChunk || 3000,
      deployBlock: o.deployBlock != null ? o.deployBlock : FILE.deployBlock || 0,
    };
  }

  function withEthers() { return W.loadEthers().then(function (e) { ethersRef = e; return e; }); }
  // Resilient reads (M-F4/b/c). Two chains from ONE builder:
  //   • readProvider() — eth_call (the card reads): SITE KEY (domain-locked Alchemy) primary → free
  //     endpoints → connected wallet. batchMaxCount:1 (M-F4b) since public endpoints reject batches.
  //   • logProvider()  — eth_getLogs (feed / report event-counts): FREE endpoints only → wallet. The
  //     site key's free tier caps getLogs at 10 blocks (useless for multi-thousand-block scans), so
  //     logs deliberately skip it. The wallet stays the last-resort rescue for both.
  var _provCache = {};
  function walletInChain() { return !!(window.ethereum && isConnected() && W.state.chainOk); }
  function buildProvider(tag, urls, connected) {
    var net = { chainId: PLAYER.chain.id, name: "amoy" };
    urls = (urls || []).filter(Boolean);
    if (!urls.length) urls = [PLAYER.chain.rpcUrls[0]];
    var key = urls.join(",") + "|" + connected;
    if (_provCache[tag] && _provCache[tag].key === key) return _provCache[tag].prov;
    var configs = urls.map(function (u, i) {
      return { provider: new ethersRef.JsonRpcProvider(u, net, { staticNetwork: true, batchMaxCount: 1 }), priority: i + 1, stallTimeout: 2500, weight: 1 };
    });
    if (connected) {
      try { configs.push({ provider: new ethersRef.BrowserProvider(window.ethereum), priority: 99, stallTimeout: 5000, weight: 1 }); } catch (e) {}
    }
    var prov;
    try { prov = configs.length > 1 ? new ethersRef.FallbackProvider(configs, net, { quorum: 1 }) : configs[0].provider; }
    catch (e) { prov = configs[0].provider; }
    _provCache[tag] = { key: key, prov: prov };
    return prov;
  }
  function readProvider() { var c = cfg(); return buildProvider("read", [c.readRpcUrl].concat(c.readRpcUrlFallbacks || []), walletInChain()); }
  function logProvider() {
    var c = cfg(), free = (c.readRpcUrlFallbacks || []).filter(Boolean);
    return buildProvider("log", free.length ? free : [c.readRpcUrl], walletInChain());
  }
  function resetReadProvider() { _provCache = {}; }

  // M-F4b DIAGNOSTIC HONESTY: on a read failure the addresses are correct — the network line is moody. Say so,
  // auto-retry (rotating the provider), and offer a manual retry once exhausted. Never say "check the address."
  var readTrouble = false, readRetry = 0, readRetryTimer = null;
  var MAX_READ_RETRY = 5;
  function netMsg() {
    return readRetry < MAX_READ_RETRY
      ? "Network connection trouble — retrying…"
      : "Network connection trouble. <a href='#' class='read-retry' style='color:var(--gold-burnished)'>Tap to retry</a>";
  }
  function scheduleReadRetry() {
    readTrouble = true;
    if (readRetryTimer || readRetry >= MAX_READ_RETRY) return;
    readRetry++;
    readRetryTimer = setTimeout(function () { readRetryTimer = null; resetReadProvider(); refresh(); }, Math.min(1200 * readRetry, 5000));
  }
  function readSucceeded() { readTrouble = false; readRetry = 0; if (readRetryTimer) { clearTimeout(readRetryTimer); readRetryTimer = null; } }
  function wireReadRetry() {
    document.querySelectorAll(".read-retry").forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); readRetry = 0; readTrouble = false; resetReadProvider(); refresh(); };
    });
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
    if ($("buy-body")) { $("buy-body").innerHTML = "<div class='notlive'>Connect your wallet to buy DYC.</div>"; $("buy-round-chip").innerHTML = ""; }
  }

  function notLive(label) {
    return "<div class='notlive'><b>Not yet live</b>" + label +
      " lights up here the moment the contract goes live. Nothing is wrong — it simply isn't deployed yet.</div>";
  }

  function renderLiquid() {
    if (data.liqErr) { $("liq-amt").textContent = "—"; $("liq-note").innerHTML = "<span>" + netMsg() + "</span>"; return; }
    $("liq-amt").textContent = fmt(data.liquid, data.dycDec);
    $("liq-note").innerHTML = "";
  }

  function renderVesting() {
    var b = $("vest-body");
    if (!cfg().vestingVault) { b.innerHTML = notLive(" Your locked DYC and its release schedule"); return; }
    if (data.vestErr) { b.innerHTML = "<div class='notlive'>" + netMsg() + "</div>"; return; }
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
    if (data.stakeErr) { b.innerHTML = "<div class='notlive'>" + netMsg() + "</div>"; return; }
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
    if (data.rewardErr) { b.innerHTML = "<div class='notlive'>" + netMsg() + "</div>"; return; }
    var claimable = data.stake.pending, roiCol = data.stake.roi;
    var hasDesk = !!cfg().roiRedemption;
    var deskFunded = data.deskReserve != null && data.deskReserve > 0n;
    b.innerHTML =
      "<div class='stat-label'>Claimable Amount</div>" +
      "<div class='big-num' style='font-size:1.9rem'>" + fmt(claimable) + "<span class='u'>DYC</span></div>" +
      // S-CLAIM-2B: self-claim button only when CLAIM_UI_ON; otherwise the two ruled policy lines in its place.
      (CLAIM_UI_ON
        ? "<div class='card-actions'><button class='btn-g btn-purple btn-block' id='act-rclaim'" + (claimable > 0n ? "" : " disabled") + ">Claim</button></div>"
        : "<div class='note' style='margin-top:10px;line-height:1.5'>Rewards are credited by DY Animation on request — reach us by email at <a href='mailto:" + CLAIM_CONTACTS.email + "'>" + esc(CLAIM_CONTACTS.email) + "</a>.<br>Claims are processed in multiples of 1,000 DYC.</div>") +
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
        // DROP DESK coupon (M-F6): find the FIRST live coupon this wallet holds (unredeemed, uncancelled, unexpired).
        if (c.dropDesk) {
          var dd = new ethersRef.Contract(c.dropDesk, DROP_ABI, provider);
          jobs.push(loadCoupons().then(function (list) {
            var mine = list.filter(function (x) { return (x.wallet || "").toLowerCase() === addr.toLowerCase(); });
            var chain = Promise.resolve(null);
            mine.forEach(function (cp) {
              chain = chain.then(function (found) {
                if (found) return found;
                if (Number(cp.deadline) < data.now) return null; // expired
                return Promise.all([dd.nonceRedeemed(cp.nonce), dd.nonceCancelled(cp.nonce)]).then(function (r) {
                  return (r[0] || r[1]) ? null : cp; // redeemed or cancelled → not live
                }).catch(function () { return null; });
              });
            });
            return chain.then(function (found) { data.coupon = found; });
          }).catch(function () {}));
        }
        return Promise.all(jobs);
      }).then(function () {
        // cash-out quote needs roi + desk
        if (c.roiRedemption && data.stake && data.stake.roi > 0n) {
          var rd = new ethersRef.Contract(c.roiRedemption, DESK_ABI, provider);
          return rd.quote(data.stake.roi).then(function (q) { data.cashoutUsdt = q[0]; }).catch(function () {});
        }
      }).then(function () {
        // M-F4b: a configured read that threw is a NETWORK failure (not a bad address) → retry + honest message
        var failed = !!(data.liqErr || data.vestErr || data.stakeErr || data.rewardErr);
        if (failed) scheduleReadRetry(); else readSucceeded();
        renderLiquid(); renderVesting(); renderStaked(); renderRewards(); renderRunway();
        renderPolBanner();
        loadFeed();
        renderBuy();
        renderRedeem();
        wireReadRetry();
      });
    }).catch(function (e) {
      // the very first read (getBlock) failed → the whole line is down: retry + show the honest message
      dimCards(false);
      scheduleReadRetry();
      data.liqErr = data.vestErr = data.stakeErr = data.rewardErr = true;
      renderLiquid(); renderVesting(); renderStaked(); renderRewards();
      renderBuy();
      wireReadRetry();
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
    // 1) decode a custom error by its on-chain selector → plain words (never surface "unknown custom error")
    try {
      var data = revertData(e), ifc = errIface();
      if (data && ifc) {
        var parsed = ifc.parseError(data);
        if (parsed && parsed.name) {
          if (ERR_PLAIN[parsed.name]) return ERR_PLAIN[parsed.name];
          return "The contract stopped this (" + parsed.name + "). Please double-check the amount, or contact support.";
        }
      }
    } catch (_) {}
    // 2) ethers already named it (ABI-known errors)
    if (e && e.revert && e.revert.name && ERR_PLAIN[e.revert.name]) return ERR_PLAIN[e.revert.name];
    // 3) gas / funds
    var s = (e && (e.shortMessage || e.reason || e.message)) || "";
    if (/insufficient funds|gas required|out of gas/i.test(s)) return "You need a small amount of POL for network fees. Add a little POL and try again.";
    // 4) a raw selector we couldn't map — still name it, never say "unknown"
    var d2 = revertData(e);
    if (d2 && d2.length >= 10) return "The contract rejected this transaction (code " + d2.slice(0, 10) + "). Please check the amount or contact support.";
    return s ? String(s).slice(0, 140) : "The transaction could not be completed. Please try again.";
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
  // M-F4 defect 2: Top Up is now the SAME narrated multi-step flow as Buy — approve DYC (only if
  // needed) → stake — each step pre-simulated, plain-words prompts, POL-fee + custom-error decoding.
  function actTopUp() {
    var c = cfg();
    if (!c.holderStaking || !c.dycoin) { failBox("Staking isn't available yet."); return; }
    var raw = window.prompt("Top up staking — amount of DYC to stake:", data.liquid != null ? fmt(data.liquid) : "");
    if (raw == null) return;
    var amtWei;
    try { amtWei = ethersRef.parseUnits(String(raw).trim().replace(/,/g, ""), 18); if (amtWei <= 0n) throw 0; }
    catch (e) { failBox("Enter a positive DYC amount."); return; }
    var pg = polGuard(); if (pg) { failBox(pg); return; }
    confirmStep("Top up staking",
      "Stake <b>" + fmt(amtWei) + " DYC</b> — one-way, earns 0.40%/day toward the 2X cap. One tap runs approve (only if needed) then stake, with clear wallet prompts.",
      "raw: " + amtWei.toString() + " wei"
    ).then(function (go) {
      if (!go) return;
      withEthers().then(function () {
        var provider = new ethersRef.BrowserProvider(window.ethereum);
        return provider.getSigner().then(function (signer) {
          var dyc = new ethersRef.Contract(c.dycoin, DYCOIN_ABI, signer);
          var hs = new ethersRef.Contract(c.holderStaking, STAKE_ABI, signer);
          var me = W.state.address;
          return dyc.balanceOf(me).then(function (bal) {
            if (bal < amtWei) { failBox("You need " + fmt(amtWei) + " DYC but have " + fmt(bal) + " liquid. Lower the amount and try again."); throw "stop"; }
            return dyc.allowance(me, c.holderStaking);
          }).then(function (allow) {
            var needApprove = allow < amtWei;
            var nSteps = (needApprove ? 1 : 0) + 1, step = 0;
            return feeOverrides(provider).then(function (fo) {
              var chain = Promise.resolve();
              if (needApprove) {
                chain = chain.then(function () {
                  step++; pending(true, "Step " + step + " of " + nSteps + " — Approve DYC");
                  $("ov-pending-msg").textContent = "Your wallet will ask to approve " + fmt(amtWei) + " DYC so the staking contract can take it. Nothing stakes yet.";
                  return dyc.approve.staticCall(c.holderStaking, amtWei).then(function () {
                    return dyc.approve(c.holderStaking, amtWei, gasOv(fo, GAS.approve)).then(function (tx) { return tx.wait(WAIT_CONFIRMS, WAIT_TIMEOUT_MS); });
                  });
                });
              }
              chain = chain.then(function () {
                step++; pending(true, "Step " + step + " of " + nSteps + " — Stake DYC");
                $("ov-pending-msg").textContent = "Your wallet will ask to stake " + fmt(amtWei) + " DYC. It starts earning 0.40%/day right away.";
                return hs.stake.staticCall(amtWei).then(function () {
                  return hs.stake(amtWei, gasOv(fo, GAS.stake)).then(function (tx) { return tx.wait(WAIT_CONFIRMS, WAIT_TIMEOUT_MS); });
                });
              });
              return chain.then(function () { pending(false); refresh(); toast("Top up complete — " + fmt(amtWei) + " DYC now earning."); });
            });
          });
        });
      }).catch(function (e) { if (e === "stop") return; pending(false); failBox(decodeErr(e)); });
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
  function LOG_CHUNK_() { return cfg().logChunk || 3000; } // M-F4 defect 3 — sized to the public RPC's getLogs limit
  function loadFeed() {
    var c = cfg(), addr = W.state.address, body = $("tx-body"), status = $("tx-status");
    if (!c.holderStaking && !c.vestingVault && !c.roiRedemption) {
      body.innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--gold-aged);padding:20px'>Your activity appears here once the platform contracts are live.</td></tr>";
      return;
    }
    status.textContent = "Scanning recent activity…";
    var provider = logProvider(); // M-F4c: getLogs uses the free endpoints (the site key caps ranges to 10 blocks)
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
      body.innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--gold-aged);padding:20px'>" + netMsg() + "</td></tr>"; wireReadRetry();
      status.textContent = "";
    });
  }
  function scan(contract, filter, from, latest, push) {
    var start = from, out = [], chunk = LOG_CHUNK_();
    function step() {
      if (start > latest) return Promise.resolve(out);
      var end = Math.min(start + chunk - 1, latest);
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
    return "<img class='ic' src='assets/brand/mf/" + src + ".png?v=mf1c' alt=''>";
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
  //  BUY DYC (M-F2) — round display, USDT→DYC calculator, 15/85 split, and a
  //  single "Buy DYC & Activate Staking" button orchestrating up to three
  //  narrated confirmations (approve USDT → buy → activate/sync). Every step
  //  is pre-simulated (staticCall) before it is sent.
  // =========================================================================
  // ── DROP DESK (M-F6): the public coupon file (zero PII: [{wallet, amount, deadline, nonce, sig}]) ──
  function loadCoupons() {
    return fetch("coupons.json?nb=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (a) { return Array.isArray(a) ? a : []; })
      .catch(function () { return []; });
  }
  // The Redeem card is visible ONLY when the connected wallet holds a live coupon (unredeemed, unexpired, uncancelled).
  function renderRedeem() {
    var host = $("redeem-panel"); if (!host) return;
    var c = cfg();
    if (!c.dropDesk || !data || !data.coupon) { host.style.display = "none"; return; } // hidden unless a live coupon exists
    host.style.display = "";
    var cp = data.coupon;
    var amt = fmt(BigInt(cp.amount));
    var daysLeft = Math.max(0, Math.ceil((Number(cp.deadline) - data.now) / 86400));
    $("redeem-body").innerHTML =
      "<div class='redeem-amt'>" + amt + " <span class='redeem-unit'>DYC</span></div>"
      + "<div class='redeem-sub'>A drop is waiting for your wallet — <b>" + daysLeft + " day" + (daysLeft === 1 ? "" : "s") + "</b> left to claim.</div>"
      + "<button class='rite-btn' id='redeem-btn'>Redeem my drop</button>"
      + "<div class='redeem-note'>One tap sends it straight to your wallet — no approval, no fee token needed.</div>";
    $("redeem-btn").onclick = function () { actRedeem(cp); };
  }
  function actRedeem(cp) {
    var c = cfg();
    runAction({
      contractAddr: c.dropDesk, abi: DROP_ABI, gas: GAS.redeem,
      simFn: function (k) { return k.redeem.staticCall(cp.wallet, cp.amount, cp.deadline, cp.nonce, cp.sig); },
      sendFn: function (k, o) { return k.redeem(cp.wallet, cp.amount, cp.deadline, cp.nonce, cp.sig, o); },
      title: "Redeem your drop",
      body: "Redeem <b>" + fmt(BigInt(cp.amount)) + " DYC</b> to your wallet. One tap — the coupon proves it's yours; no approval needed.",
      raw: "raw: " + String(cp.amount) + " wei · nonce " + String(cp.nonce),
    });
  }

  function loadAllowlist() {
    return fetch("allowlist.json?nb=" + (buyState._nb || (buyState._nb = 1)))
      .then(function (r) { return r.json(); })
      .then(function (a) { allowlist = Array.isArray(a) ? a : []; return allowlist; })
      .catch(function () { allowlist = []; return allowlist; });
  }
  function voucherFor(addr) {
    if (!allowlist || !addr) return null;
    var a = addr.toLowerCase();
    for (var i = 0; i < allowlist.length; i++) {
      if ((allowlist[i].wallet || "").toLowerCase() === a) return allowlist[i];
    }
    return null;
  }

  function renderBuy() {
    var b = $("buy-body"), chip = $("buy-round-chip");
    if (!b) return;
    chip.innerHTML = "";
    if (!isConnected()) { b.innerHTML = "<div class='notlive'>Connect your wallet to buy DYC.</div>"; return; }
    var c = cfg();
    if (!c.dycoinSale || !c.usdt) { b.innerHTML = notLive(" Buying DYC"); return; }
    withEthers().then(function () {
      var p = readProvider();
      var sale = new ethersRef.Contract(c.dycoinSale, SALE_ABI, p);
      return Promise.all([sale.currentRound(), sale.presalePriceE18().catch(function () { return 0n; }), sale.publicPriceE18().catch(function () { return 0n; })])
        .then(function (r) {
          var round = Number(r[0]);
          buyState.round = round;
          return loadAllowlist().then(function () {
            var v = voucherFor(W.state.address);
            buyState.voucher = v;
            if (round === 0) {
              b.innerHTML = "<div class='notlive'><b>Sale not open</b>The sale is not open right now — it opens at the presale window and pauses between rounds.</div>";
              return;
            }
            var isPresale = round === 1;
            buyState.price = isPresale ? r[1] : r[2];
            chip.innerHTML = "<span class='buy-round " + (isPresale ? "presale" : "public") + "'>" + (isPresale ? "PRESALE @ $0.008" : "PUBLIC @ $0.010") + "</span>";
            if (isPresale && !v) { renderRegister(b); return; }
            renderCalculator(b, isPresale);
          });
        });
    }).catch(function () { scheduleReadRetry(); b.innerHTML = "<div class='notlive'>" + netMsg() + "</div>"; wireReadRetry(); });
  }

  function renderRegister(b) {
    b.innerHTML =
      "<div class='buy-reg'>" +
      "<div class='buy-reg-title'>Register to buy</div>" +
      "<p>Presale is allowlist-gated. Register once with the form below — then the owner approves your wallet <b>manually</b>, which can take a few hours. You do not need to do anything else after registering.</p>" +
      "<a class='btn-g btn-p' href='https://forms.gle/37pgo2ebYrDpME2w7' target='_blank' rel='noopener'>Open the registration form →</a>" +
      "<button class='btn-g' id='buy-recheck'>Check my status</button>" +
      "<div class='note'>Already registered? Approval is manual — check back in a few hours.</div>" +
      "</div>";
    $("buy-recheck").onclick = function () { allowlist = null; buyState._nb = (buyState._nb || 1) + 1; renderBuy(); };
  }

  function renderCalculator(b, isPresale) {
    b.innerHTML =
      (isPresale ? "<div class='buy-ok'>✓ Your wallet is approved to buy in the presale.</div>" : "") +
      "<label class='fld'>Amount in (USDT)</label>" +
      "<div class='buy-calc'><input class='txt' id='buy-amt' inputmode='decimal' placeholder='100' /><span class='buy-out'>You receive <b id='buy-dyc'>—</b> DYC</span></div>" +
      "<div class='split-preview'>" +
      "<div class='split liq'><div class='sl'>15% Liquid</div><div class='sv' id='split-liq'>—</div><div class='su'>DYC to your wallet now</div></div>" +
      "<div class='split ves'><div class='sl'>85% Vesting</div><div class='sv' id='split-ves'>—</div><div class='su'>DYC into vesting</div></div>" +
      "</div>" +
      "<div class='buy-min' id='buy-min'></div>" +
      "<button class='btn-g btn-p btn-block' id='buy-go'>⚡ Buy DYC &amp; Activate Staking</button>" +
      "<div class='buy-narrate'>One tap runs the whole flow with clear wallet prompts: approve USDT (only if needed) → buy (15% lands in your wallet, 85% into vesting) → activate that vesting so it starts earning 0.40%/day.</div>";
    $("buy-amt").oninput = updateCalc;
    $("buy-go").onclick = buyFlow;
    updateCalc();
  }
  function updateCalc() {
    var price = buyState.price || 0n, raw = $("buy-amt") ? $("buy-amt").value : "";
    var dyc = "—", liq = "—", ves = "—", usdt = 0n, ok = false;
    try {
      usdt = ethersRef.parseUnits((raw || "0").trim().replace(/,/g, ""), 6);
      var usdE18 = usdt * 1000000000000n;
      var d = price > 0n ? (usdE18 * 1000000000000000000n) / price : 0n;
      dyc = fmt(d); liq = fmt((d * 1500n) / 10000n); ves = fmt(d - (d * 1500n) / 10000n); ok = true;
    } catch (e) {}
    if ($("buy-dyc")) { $("buy-dyc").textContent = dyc; $("split-liq").textContent = liq; $("split-ves").textContent = ves; }
    // M-F4 defect 1: page-side minimum-purchase floor (100 USDT). The calculator still shows the math.
    var go = $("buy-go"), min = $("buy-min");
    if (go && min) {
      var below = !ok || usdt < MIN_BUY_USDT;
      var empty = !raw || !raw.trim();
      go.disabled = below;
      go.style.opacity = below ? "0.5" : "1";
      go.style.cursor = below ? "not-allowed" : "pointer";
      min.textContent = (below && !empty) ? "Minimum purchase is 100 USDT." : "";
    }
  }
  function gasOv(fo, gas) {
    var ov = { gasLimit: gas };
    if (fo && fo.maxFeePerGas != null) { ov.maxFeePerGas = fo.maxFeePerGas; ov.maxPriorityFeePerGas = fo.maxPriorityFeePerGas; }
    return ov;
  }

  function buyFlow() {
    var c = cfg(), amt;
    try { amt = ethersRef.parseUnits(($("buy-amt").value || "").trim().replace(/,/g, ""), 6); if (amt <= 0n) throw 0; }
    catch (e) { failBox("Enter a positive USDT amount."); return; }
    if (amt < MIN_BUY_USDT) { failBox("Minimum purchase is 100 USDT."); return; } // M-F4 defect 1 (defense-in-depth)
    var pg = polGuard(); if (pg) { failBox(pg); return; }
    var isPresale = buyState.round === 1;
    var sig = isPresale && buyState.voucher ? buyState.voucher.sig : "0x";
    withEthers().then(function () {
      var provider = new ethersRef.BrowserProvider(window.ethereum);
      return provider.getSigner().then(function (signer) {
        var usdt = new ethersRef.Contract(c.usdt, ERC20_ABI, signer);
        var sale = new ethersRef.Contract(c.dycoinSale, SALE_ABI, signer);
        var hs = c.holderStaking ? new ethersRef.Contract(c.holderStaking, STAKE_ABI, signer) : null;
        var me = W.state.address;
        return usdt.balanceOf(me).then(function (bal) {
          if (bal < amt) { failBox("You need " + fmt(amt, 6) + " USDT but have " + fmt(bal, 6) + ". Add USDT and try again."); throw "stop"; }
          return usdt.allowance(me, c.dycoinSale);
        }).then(function (allow) {
          var needApprove = allow < amt;
          return Promise.all([feeOverrides(provider), hs ? hs.vestedRegistered(me) : Promise.resolve(true)]).then(function (pre) {
            var fo = pre[0], alreadyReg = pre[1];
            var nSteps = (needApprove ? 1 : 0) + 1 + (hs ? 1 : 0);
            var step = 0;
            var chain = Promise.resolve();
            if (needApprove) {
              chain = chain.then(function () {
                step++; pending(true, "Step " + step + " of " + nSteps + " — Approve USDT");
                $("ov-pending-msg").textContent = "Your wallet will ask to approve " + fmt(amt, 6) + " USDT so the sale can take your payment. No DYC moves yet.";
                return usdt.approve.staticCall(c.dycoinSale, amt).then(function () {
                  return usdt.approve(c.dycoinSale, amt, gasOv(fo, GAS.approve)).then(function (tx) { return tx.wait(WAIT_CONFIRMS, WAIT_TIMEOUT_MS); });
                });
              });
            }
            chain = chain.then(function () {
              step++; pending(true, "Step " + step + " of " + nSteps + " — Buy DYC");
              $("ov-pending-msg").textContent = "Your wallet will ask to buy. You pay " + fmt(amt, 6) + " USDT and receive DYC — 15% to your wallet now, 85% into vesting.";
              return sale.buyWithStable.staticCall(c.usdt, amt, sig, "").then(function () {
                return sale.buyWithStable(c.usdt, amt, sig, "", gasOv(fo, GAS.buy)).then(function (tx) { return tx.wait(WAIT_CONFIRMS, WAIT_TIMEOUT_MS); });
              });
            });
            if (hs) {
              chain = chain.then(function () {
                step++;
                var fn = alreadyReg ? "syncVested" : "registerVested";
                var label = alreadyReg ? "Sync new vesting into earning" : "Activate vesting to start earning";
                pending(true, "Step " + step + " of " + nSteps + " — " + label);
                $("ov-pending-msg").textContent = alreadyReg
                  ? "Your wallet will ask to sync — it adds the DYC you just bought to your earning balance (0.40%/day)."
                  : "Your wallet will ask to activate — it starts your vested DYC earning 0.40%/day toward the 2X cap.";
                return hs[fn].staticCall().then(function () {
                  return hs[fn](gasOv(fo, GAS.activate)).then(function (tx) { return tx.wait(WAIT_CONFIRMS, WAIT_TIMEOUT_MS); });
                }).catch(function () { return null; }); // the BUY already succeeded — never fail the flow on a benign activate revert
              });
            }
            return chain.then(function () { pending(false); refresh(); toast("Purchase complete — DYC bought" + (hs ? " and activated" : "") + "."); });
          });
        });
      });
    }).catch(function (e) { if (e === "stop") return; pending(false); failBox(decodeErr(e)); });
  }

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

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  //  M-F4d DIAGNOSTIC PANEL — opens with ?diag=1. No console/terminal/DevTools: the owner opens one URL
  //  and screenshots one box; the root cause reads itself off the screen. Renders ONLY with ?diag=1;
  //  zero effect on live behaviour otherwise. Inline-styled (immune to a stale CSS cache).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  var DIAG_BUILD = "mf4d"; // the version this diagnostic ships in — compare against the LOADED stamp below
  function diagScriptVersion() {
    try {
      var s = [].slice.call(document.scripts).map(function (x) { return x.src || ""; }).filter(function (u) { return /js\/dashboard\.js/.test(u); })[0] || "";
      var m = s.match(/[?&]v=([^&]+)/);
      return m ? m[1] : "(no ?v= stamp)";
    } catch (e) { return "(unknown)"; }
  }
  function diagHost(u) { try { return String(u).replace(/^https?:\/\//, "").split("/")[0]; } catch (e) { return String(u); } }
  // one-shot live test of a single endpoint FROM THE PAGE CONTEXT: eth_chainId + one eth_call (currentRound),
  // as single (non-batched) requests. Verdict distinguishes OK / HTTP code / RPC-refusal / CORS block / timeout.
  function diagTest(url) {
    var c = cfg();
    var callData = c.dycoinSale ? { to: c.dycoinSale, data: "0x8a19c8bc" } // currentRound() — no args
      : (c.dycoin ? { to: c.dycoin, data: "0x70a08231" + "0".repeat(64) } : null); // balanceOf(0x0)
    var t0 = (window.performance && performance.now()) || Date.now();
    var ctrl = new AbortController();
    var killed = setTimeout(function () { ctrl.abort(); }, 8000);
    function ms() { return Math.round(((window.performance && performance.now()) || Date.now()) - t0); }
    function post(body) { return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal, body: JSON.stringify(body) }); }
    return post({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }).then(function (res) {
      return res.text().then(function (txt) {
        var j = null; try { j = JSON.parse(txt); } catch (e) {}
        if (!res.ok) { clearTimeout(killed); return "HTTP " + res.status + (j && j.error ? " — " + j.error.message : " — " + txt.slice(0, 90)) + " · " + ms() + "ms"; }
        if (j && j.error) { clearTimeout(killed); return "REFUSED — " + j.error.message + " · " + ms() + "ms"; }
        var chainId = j && j.result ? parseInt(j.result, 16) : "?";
        if (!callData) { clearTimeout(killed); return "OK · chainId=" + chainId + " · " + ms() + "ms"; }
        return post({ jsonrpc: "2.0", id: 2, method: "eth_call", params: [callData, "latest"] }).then(function (r2) {
          return r2.text().then(function (t2) {
            clearTimeout(killed);
            var j2 = null; try { j2 = JSON.parse(t2); } catch (e) {}
            if (!r2.ok) return "chainId=" + chainId + " · eth_call HTTP " + r2.status + " · " + ms() + "ms";
            if (j2 && j2.error) return "chainId=" + chainId + " · eth_call REFUSED — " + j2.error.message + " · " + ms() + "ms";
            return "OK · chainId=" + chainId + " · eth_call OK · " + ms() + "ms";
          });
        });
      });
    }).catch(function (e) {
      clearTimeout(killed);
      if (e && e.name === "AbortError") return "TIMEOUT >8s (endpoint unreachable/slow)";
      return "CORS/NETWORK BLOCK — " + ((e && (e.message || e.name)) || "fetch failed") + " · " + ms() + "ms";
    });
  }
  function runDiag() {
    var c = cfg();
    var callUrls = [c.readRpcUrl].concat(c.readRpcUrlFallbacks || []).filter(Boolean);
    var logUrls = (c.readRpcUrlFallbacks || []).filter(Boolean); if (!logUrls.length) logUrls = callUrls.slice();
    var uniq = []; callUrls.concat(logUrls).forEach(function (u) { if (uniq.indexOf(u) < 0) uniq.push(u); });

    var box = document.createElement("div");
    box.id = "diag-panel";
    box.setAttribute("style", "position:fixed;inset:0;z-index:99999;background:#0b0a08;color:#e8e2d2;overflow:auto;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:16px");
    document.body.appendChild(box);

    var loaded = diagScriptVersion();
    var stale = loaded !== DIAG_BUILD;
    var head = "";
    head += "<div style='font:600 15px/1.4 system-ui;color:#d9a84e;margin-bottom:6px'>DIVYA YUDDHA — READ DIAGNOSTICS</div>";
    head += "<div style='margin-bottom:10px'><button id='diag-copy' style='background:#d9a84e;color:#0b0a08;border:0;border-radius:6px;padding:6px 12px;font:600 13px system-ui;cursor:pointer'>Copy all</button> <button id='diag-close' style='background:#2a2620;color:#e8e2d2;border:0;border-radius:6px;padding:6px 12px;font:13px system-ui;cursor:pointer'>Close</button> <span style='color:#8a7f66'>screenshot the box below</span></div>";
    var pre = document.createElement("pre");
    pre.id = "diag-pre";
    pre.setAttribute("style", "white-space:pre-wrap;word-break:break-word;margin:0;padding:12px;background:#141210;border:1px solid #2a2620;border-radius:8px");
    box.innerHTML = head;
    box.appendChild(pre);

    var lines = [];
    function paint() { pre.textContent = lines.join("\n"); }
    lines.push("time:            " + new Date().toISOString());
    lines.push("page URL:        " + location.href.replace(/\/v2\/[A-Za-z0-9_-]+/g, "/v2/***"));
    lines.push("dashboard.js:    v=" + loaded + (stale ? "   ⚠️ STALE — expected v=" + DIAG_BUILD + " (hard-refresh / cache is serving an OLD build)" : "   ✓ current (" + DIAG_BUILD + ")"));
    lines.push("");
    lines.push("READ CHAIN (eth_call — the cards) in priority order:");
    callUrls.forEach(function (u, i) { lines.push("  " + (i + 1) + ". " + diagHost(u)); });
    lines.push("LOG CHAIN (eth_getLogs — the feed):");
    logUrls.forEach(function (u, i) { lines.push("  " + (i + 1) + ". " + diagHost(u)); });
    lines.push("");
    lines.push("WALLET:          " + (window.ethereum ? "injected present" : "ABSENT") + " · connected=" + !!W.state.connected + " · state.chainId=" + (W.state.chainId || "?"));
    lines.push("");
    lines.push("PER-ENDPOINT LIVE TEST (from THIS browser + network):");
    uniq.forEach(function (u) { lines.push("  " + diagHost(u) + " …testing"); });
    lines.push("");
    lines.push("FIRST CARD READ (dycoin.balanceOf via the real read chain): …testing");
    paint();

    // wallet chainId (ask the wallet directly)
    if (window.ethereum) {
      try {
        window.ethereum.request({ method: "eth_chainId" }).then(function (id) {
          lines[lines.indexOf(lines.filter(function (l) { return l.indexOf("WALLET:") === 0; })[0])] =
            "WALLET:          injected present · connected=" + !!W.state.connected + " · wallet.chainId=" + parseInt(id, 16) + " (0x13882=80002 Amoy)";
          paint();
        }).catch(function () {});
      } catch (e) {}
    }

    // per-endpoint tests (parallel; each updates its own line)
    uniq.forEach(function (u) {
      var idx = lines.indexOf("  " + diagHost(u) + " …testing");
      diagTest(u).then(function (verdict) { if (idx >= 0) { lines[idx] = "  " + diagHost(u) + "  →  " + verdict; paint(); } });
    });

    // the ACTUAL first card read through the page's real read chain
    withEthers().then(function () {
      var addr = W.state.address || "0x0000000000000000000000000000000000000000";
      if (!c.dycoin) throw new Error("dycoin not configured");
      var dy = new ethersRef.Contract(c.dycoin, DYCOIN_ABI, readProvider());
      return dy.balanceOf(addr);
    }).then(function (bal) {
      var i = lines.length - 1; lines[i] = "FIRST CARD READ: OK — balanceOf returned " + bal.toString();
      paint();
    }).catch(function (e) {
      var i = lines.length - 1;
      var detail = ((e && (e.shortMessage || e.message)) || String(e)).replace(/\/v2\/[A-Za-z0-9_-]+/g, "/v2/***");
      lines[i] = "FIRST CARD READ: FAILED — " + detail.slice(0, 200);
      paint();
    });

    document.getElementById("diag-close").onclick = function () { box.remove(); };
    document.getElementById("diag-copy").onclick = function () {
      try { navigator.clipboard.writeText(pre.textContent); this.textContent = "Copied ✓"; } catch (e) { this.textContent = "select + copy manually"; }
    };
  }

  function mount() {
    if (/[?&]diag=1/.test(location.search)) { try { runDiag(); } catch (e) {} } // M-F4d — diagnostic overlay
    // sidebar soft links
    document.querySelectorAll("[data-soon]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); toast("Coming soon."); }; });
    document.querySelectorAll("[data-referrals]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); toast("Referrals live on the separate rewards platform."); }; });
    document.querySelectorAll("[data-help]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); toast("Support: email divyayuddha@gmail.com"); }; });
    W.onChange(function () { refresh(); });
    W.init();
    refresh();
  }

  return { mount: mount, _cfg: cfg, _refresh: refresh, _decodeErr: decodeErr };
})();
