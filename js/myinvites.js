/* ============================================================================
   MY INVITES (MY-INVITES-1, owner rulings 2026-10-14) — the affiliate's own page, my-invites.html.

   ONE SOURCE: every number on this page is the approval bot's /invites/mine answer, which is computed from the SAME
   ledger the bot signs desk coupons from. The page adds nothing, guesses nothing and keeps nothing: "ready" is what the
   desk will pay, never more. A failed read is a plain sentence — never zeros that look real.

   PRIVACY (the bot shapes it, the page only shows it): your own data only (the bot filters by the wallet that SIGNED
   the request); your direct invitees (level 1) as shortened wallets; deeper levels as totals only; your inviter
   shortened. No full address, no email, nothing about anyone's other holdings.

   THE SIGNATURE: a free EIP-712 message ("View my Torana Invites", js/invite.js) — moves no money, valid 5 minutes,
   works once. It is asked only when the player taps Show (never on load).

   CHAIN READS: none. The page reads the bot only; card names come from the local wave registry.
   ========================================================================= */
window.DYMyInvites = (function () {
  var CFG = window.DY_CONFIG || {};
  // ── THE RULED LINES (DASHBOARD_DESIGN_v1 §12, machine-proven by mp/copyproof.js) ──
  var MI_TITLE = "My Invites";
  var MI_LEAD = "Everyone who joined through your invite link, what they bought, and what it earned you.";
  var MI_SIGN = "Sign a free message to show your invites. It moves no money and works once.";
  var MI_CONNECT = "Connect your wallet to see your invites.";
  var MI_NET = "Switch your wallet to Polygon to see your invites.";
  var MI_CLOSED = "My Invites is not open yet.";
  var MI_DOWN = "Your invites can't be read right now - nothing is lost. Try again in a moment.";
  var MI_DECLINED = "Nothing was shown - the message is free and moves no money. Tap Show my invites to try again.";
  var MI_NOCODE = "You don't have an invite code yet - get one on the dashboard.";
  var MI_COUNTS_V1 = "Counts only purchases that pay: a friend's first bundle, bought after they joined you. Top-ups and card buys never pay.";
  var MI_COUNTS_V2 = "Counts only purchases that pay: a first bundle or a USD card, bought after the buyer joined. Top-ups and DYC card buys never pay.";
  var MI_PRIVACY = "Friends of friends are shown as totals only.";
  var MI_LOCKED = "Locked until you own a Torana";
  var MI_WITHDRAW = "Withdraw on the dashboard";
  var MI_DYC_NOTE = "125 DYC = USD 1.";

  var data = null, dataFor = null, err = null, busy = false;
  var TIMEOUT_MS = 15000;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function svc() { var m = window.DY_MF_CONFIG; return m && m.inviteServiceUrl ? String(m.inviteServiceUrl).replace(/\/+$/, "") : null; }
  function ws() { return (window.DYWallet && window.DYWallet.state) || {}; }
  function big(x) { try { return BigInt(x || "0"); } catch (e) { return 0n; } }
  // USD from DYC wei at the desk's fixed 125 DYC per USD: 1 micro-USD = 125e12 wei
  function usdOfWei(w) { var m = big(w) / 125000000000000n; return "USD " + (Number(m) / 1e6).toFixed(2); }
  function usdOfE6(e6) { return "USD " + (Number(big(e6)) / 1e6).toFixed(2); }
  function dycOfWei(w) { var c = big(w) / 10000000000000000n; return (Number(c) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " DYC"; }
  function money(w) { return "<span class='mi-usd'>" + esc(usdOfWei(w)) + "</span> <span class='mi-dyc'>" + esc(dycOfWei(w)) + "</span>"; }
  function dateOf(ts) { try { return new Date(Number(ts) * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return "—"; } }
  function utcOf(ts) { try { return new Date(Number(ts) * 1000).toUTCString().replace(/:00 GMT$/, " UTC").replace(/ GMT$/, " UTC"); } catch (e) { return "—"; } }
  function localOf(ts) { try { return new Date(Number(ts) * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return "—"; } }
  function cardName(id) {
    var reg = window.DY_WAVE_REGISTRY, w = null;
    try { w = reg && reg.list ? reg.list().filter(function (x) { return String(x.cardId) === String(id); })[0] : null; } catch (e) { w = null; }
    return w && w.name ? w.name : "Card #" + id;
  }
  function statusOf(h) {
    if (h.status === "pending") return "pending until " + dateOf(h.unlockAt);
    if (h.status === "unlocked") return big(h.paidWei) > 0n ? "unlocked (" + usdOfWei(h.paidWei) + " withdrawn)" : "unlocked";
    if (h.status === "withdrawn") return "withdrawn";
    if (h.status === "accrued") return "locked";
    if (h.status === "held") return "held for review";
    return String(h.status || "");
  }

  // ── THE ROAD: sign the free view message, then ask the bot. Every failure becomes a sentence, never a number. ──
  function show() {
    var me = ws().address;
    if (busy || !me || !svc()) return;
    busy = true; err = null; render();
    window.DYWallet.loadEthers().then(function (ethers) {
      var bp = new ethers.BrowserProvider(window.ethereum);
      return bp.getSigner().then(function (sg) {
        return sg.getAddress().then(function (a) {
          if (String(a).toLowerCase() !== String(me).toLowerCase()) { var e = new Error("pen"); e.__pen = true; throw e; }
          var t = Math.floor(Date.now() / 1000);
          var td = window.DYInvite.viewRequestTypedData(CFG.chain.id, me, t, ethers);
          return sg.signTypedData(td.domain, td.types, td.message).then(function (sig) { return { wallet: me, issuedAt: t, signature: sig }; });
        });
      });
    }).then(function (body) {
      var post = fetch(svc() + "/invites/mine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); });
      var late = new Promise(function (res, rej) { setTimeout(function () { rej(new Error("timeout")); }, TIMEOUT_MS); });
      return Promise.race([post, late]);
    }).then(function (r) {
      busy = false;
      if (!r || !r.ok) { err = MI_DOWN; data = null; render(); return; }
      if (String(ws().address || "").toLowerCase() !== String(me).toLowerCase()) { data = null; render(); return; }   // the pen moved meanwhile
      data = r; dataFor = String(me).toLowerCase(); render();
    }, function (e) {
      busy = false;
      var s = (e && (e.shortMessage || e.message)) || "";
      err = (e && (e.code === 4001 || e.code === "ACTION_REJECTED")) || /user rejected|denied/i.test(s) ? MI_DECLINED : MI_DOWN;
      data = null; render();
    });
  }

  // ── THE PAGE ──
  function levelTable(d) {
    var h = "<table class='mi-table' id='mi-levels'><thead><tr><th>Level</th><th>People</th><th>Bundles</th><th>USD cards</th><th>Sales</th><th>My rate</th><th>I earned</th></tr></thead><tbody>";
    var tp = 0, tb = 0, tc = 0, ts = 0n, te = 0n;
    d.levels.forEach(function (L) {
      tp += L.people; tb += L.bundles; tc += L.cards; ts += big(L.salesUsdE6); te += big(L.earnedWei);
      h += "<tr data-level='" + L.level + "'><td>L" + L.level + "</td><td data-k='people'>" + L.people + "</td><td data-k='bundles'>" + L.bundles + "</td>"
        + "<td data-k='cards'>" + L.cards + "</td><td data-k='sales' data-e6='" + esc(L.salesUsdE6) + "'>" + esc(usdOfE6(L.salesUsdE6)) + "</td>"
        + "<td data-k='rate'>" + esc(L.ratePct) + "%</td><td data-k='earned' data-wei='" + esc(L.earnedWei) + "'>" + money(L.earnedWei) + "</td></tr>";
    });
    var bonus = big(d.money.bonusWei);
    if (d.scheme === "v2" && bonus > 0n) {
      te += bonus;
      h += "<tr data-level='bonus'><td colspan='6'>Weekly bonuses</td><td data-k='earned' data-wei='" + esc(d.money.bonusWei) + "'>" + money(d.money.bonusWei) + "</td></tr>";
    }
    h += "<tr class='mi-total' data-level='total'><td>Total</td><td data-k='people'>" + tp + "</td><td data-k='bundles'>" + tb + "</td><td data-k='cards'>" + tc + "</td>"
      + "<td data-k='sales' data-e6='" + ts + "'>" + esc(usdOfE6(String(ts))) + "</td><td></td><td data-k='earned' data-wei='" + te + "'>" + money(String(te)) + "</td></tr>";
    return h + "</tbody></table><p class='mi-note' id='mi-counts'>" + esc(d.scheme === "v2" ? MI_COUNTS_V2 : MI_COUNTS_V1) + "</p>";
  }
  function moneyBlock(d) {
    var m = d.money, v2 = d.scheme === "v2";
    var row = function (k, label, wei, extra) { return "<div class='mi-m' data-k='" + k + "' data-wei='" + esc(wei) + "'><span class='mi-m-k'>" + esc(label) + "</span><span class='mi-m-v'>" + money(wei) + "</span>" + (extra || "") + "</div>"; };
    var pend = (m.pending || []).slice().sort(function (a, b) { return a.unlockAt - b.unlockAt; })
      .map(function (p) { return "<li data-wei='" + esc(p.wei) + "'>" + esc(usdOfWei(p.wei)) + " unlocks " + esc(dateOf(p.unlockAt)) + "</li>"; }).join("");
    var h = "<div class='mi-money' id='mi-money'>"
      + row("earned", "Earned total", m.earnedWei)
      + row("ready", "Unlocked (ready)", m.readyWei)
      + row("pending", "Pending", m.pendingWei, pend ? "<ul class='mi-pend'>" + pend + "</ul>" : "")
      + row("withdrawn", "Withdrawn", m.withdrawnWei)
      + (v2 ? row("locked", MI_LOCKED, m.lockedWei) : "")
      + (big(m.heldWei) > 0n ? row("held", "Held for review", m.heldWei) : "")
      + "</div><p class='mi-note'>" + esc(MI_DYC_NOTE) + "</p>"
      + "<a class='rite-btn mi-withdraw' id='mi-withdraw' href='dashboard.html#winnings-panel'>" + esc(MI_WITHDRAW) + "</a>";
    return h;
  }
  function weekBlock(d) {
    if (d.scheme !== "v2" || !d.week) return "";
    var w = d.week, next = w.next;
    return "<div class='mi-week' id='mi-week' data-count='" + w.count + "'><p>Direct first bundles this week: <b>" + w.count + "</b>.</p>"
      + (next ? "<p>Next bonus at " + next.count + ": <b>USD " + next.usd + "</b> (" + (next.count - w.count) + " to go).</p>" : "<p>You have reached the top bonus this week.</p>")
      + "<p class='mi-note'>The week closes Monday 00:00 UTC — " + esc(utcOf(w.closesAt)) + " (" + esc(localOf(w.closesAt)) + " your time).</p></div>";
  }
  function directTable(d) {
    if (!d.direct.length) return "<p class='mi-note' id='mi-direct-none'>No one has joined through your link yet.</p>";
    var h = "<table class='mi-table' id='mi-direct'><thead><tr><th>Wallet</th><th>Joined</th><th>Bought (paying)</th><th>Earned me</th></tr></thead><tbody>";
    d.direct.forEach(function (x) {
      var bought = [];
      if (x.bundles) bought.push(x.bundles === 1 ? "bundle" : x.bundles + " bundles");
      if (x.cards.length) bought.push(x.cards.length + (x.cards.length === 1 ? " card" : " cards") + " (" + x.cards.map(cardName).join(", ") + ")");
      h += "<tr><td data-k='wallet'>" + esc(x.wallet) + "</td><td>" + esc(dateOf(x.joinedAt)) + "</td><td data-k='bought'>" + esc(bought.join(", ") || "nothing that pays yet")
        + "</td><td data-k='earned' data-wei='" + esc(x.earnedWei) + "'>" + money(x.earnedWei) + "</td></tr>";
    });
    return h + "</tbody></table><p class='mi-note'>" + esc(MI_PRIVACY) + "</p>";
  }
  function historyTable(d) {
    if (!d.history.length) return "<p class='mi-note'>No rewards yet.</p>";
    var h = "<table class='mi-table' id='mi-history'><thead><tr><th>Date</th><th>Level</th><th>What was bought</th><th>Amount</th><th>Status</th></tr></thead><tbody>";
    d.history.forEach(function (x) {
      var what = x.kind === "bonus" ? "weekly bonus (" + x.count + " first bundles)" : (x.kind === "card" ? cardName(x.cardId) : "bundle");
      h += "<tr data-kind='" + esc(x.kind) + "' data-level='" + x.level + "'><td>" + esc(dateOf(x.ts)) + "</td><td>" + (x.kind === "bonus" ? "Bonus" : "L" + x.level) + "</td>"
        + "<td>" + esc(what) + (x.buyer ? " <span class='mi-who'>" + esc(x.buyer) + "</span>" : "") + "</td>"
        + "<td data-k='amount' data-wei='" + esc(x.amountWei) + "'>" + money(x.amountWei) + "</td><td data-k='status'>" + esc(statusOf(x)) + "</td></tr>";
    });
    return h + "</tbody></table>";
  }
  function headerBlock(d) {
    var h = "";
    if (d.code) {
      var link = window.DYInvite.inviteLink(d.code);
      h += "<div class='inv-code'><span class='inv-code-k'>Your invite code</span><span class='inv-code-v' id='mi-code'>" + esc(d.code) + "</span></div>"
        + "<div class='inv-link'><input class='inv-link-in' id='mi-link' readonly value='" + esc(link) + "' /><button class='rite-btn' id='mi-copy'>Copy link</button></div>";
    } else h += "<p class='mi-note' id='mi-nocode'>" + esc(MI_NOCODE) + " <a href='dashboard.html#invites-panel'>Dashboard</a></p>";
    h += "<p class='mi-inviter' id='mi-inviter'>Invited by: <b>" + esc(d.inviter || "none") + "</b></p>";
    return h;
  }

  function render() {
    var root = $("mi-root");
    if (!root) return;
    var s = ws(), h = "<h1 class='mi-h1'>" + esc(MI_TITLE) + "</h1><p class='mi-lead'>" + esc(MI_LEAD) + "</p>";
    if (data && dataFor !== String(s.address || "").toLowerCase()) data = null;   // never show one wallet's page to another
    if (!svc()) h += "<p class='mi-note' id='mi-closed'>" + esc(MI_CLOSED) + "</p>";
    else if (!s.connected) h += "<p class='mi-note'>" + esc(MI_CONNECT) + "</p><button class='rite-btn' id='mi-connect'>Connect wallet</button>";
    else if (!s.chainOk) h += "<p class='mi-note' id='mi-net'>" + esc(MI_NET) + "</p>";
    else if (!data) {
      h += (err ? "<p class='mi-err' id='mi-err'>" + esc(err) + "</p>" : "")
        + "<p class='mi-note'>" + esc(MI_SIGN) + "</p><button class='rite-btn' id='mi-show'" + (busy ? " disabled" : "") + ">" + (busy ? "Reading…" : "Show my invites") + "</button>";
    } else {
      h += "<section class='mi-sec'>" + headerBlock(data) + "</section>"
        + "<section class='mi-sec'><h2>Your levels</h2>" + levelTable(data) + "</section>"
        + "<section class='mi-sec'><h2>My money</h2>" + moneyBlock(data) + "</section>"
        + (data.scheme === "v2" ? "<section class='mi-sec'><h2>This week's bonus</h2>" + weekBlock(data) + "</section>" : "")
        + "<section class='mi-sec'><h2>My direct invitees</h2>" + directTable(data) + "</section>"
        + "<section class='mi-sec'><h2>History</h2>" + historyTable(data) + "</section>";
    }
    root.innerHTML = h;
    if ($("mi-connect")) $("mi-connect").onclick = function () { window.DYWallet.connect(); };
    if ($("mi-show")) $("mi-show").onclick = show;
    if ($("mi-copy")) $("mi-copy").onclick = function () {
      var v = $("mi-link").value;
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(function () { $("mi-copy").textContent = "Copied"; }, function () { $("mi-link").select(); }); else $("mi-link").select(); }
      catch (e) { $("mi-link").select(); }
    };
  }

  function mount() {
    render();
    if (window.DYWallet) window.DYWallet.onChange(function () { render(); });
  }
  return { mount: mount, _show: show, _data: function () { return data; } };
})();
