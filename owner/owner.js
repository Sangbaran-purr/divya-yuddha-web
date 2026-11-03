/* GROW-COUNT-1 · the owner pages' door (owner ruling 5, 2026-11-03): a wallet signature, the admin page's way in — the
   owner connects with the site's wallet module (js/wallet.js), the counter (dy-count) hands out a single-use nonce, the
   owner signs it (personal_sign), and the counter admits only its OWNER_ADDRESSES. The session is a 30-minute token kept
   in this tab only (sessionStorage), shared by growth.html and links.html. These pages hold no secret and no data of
   their own: everything they show comes from the counter, after the signature. */
window.DY_OWNER = (function () {
  "use strict";
  var BASE = "https://count.divyayuddha.games";
  var KEY = "dy_owner_count";
  var $ = function (id) { return document.getElementById(id); };
  function status(cls, text) { var s = $("admin-status"); if (!s) return; s.className = "admin-status " + cls; s.textContent = text; }
  function saved() { try { var t = JSON.parse(sessionStorage.getItem(KEY) || "null"); return t && t.token && t.expires > Date.now() ? t : null; } catch (e) { return null; } }
  function hex(str) { var b = new TextEncoder().encode(str), h = "0x"; for (var i = 0; i < b.length; i++) h += (b[i] < 16 ? "0" : "") + b[i].toString(16); return h; }
  function api(path, opts) {
    var t = saved(); opts = opts || {};
    var h = { "content-type": "application/json" }; if (t) h.authorization = "Bearer " + t.token;
    return fetch(BASE + path, { method: opts.method || "GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "omit", cache: "no-store" });
  }
  // connect → nonce → sign → session. → Promise<true>; any failure says why in the status strip
  function signIn() {
    if (!window.ethereum || !window.DYWallet) { status("st-err", "No wallet in this browser. Open this page in the browser that holds the owner wallet."); return Promise.resolve(false); }
    status("st-info", "Connecting the wallet…");
    return window.DYWallet.connect().then(function (s) {
      var addr = s && s.address; if (!addr) throw new Error("no account");
      status("st-info", "Asking the counter for a sign-in code…");
      return api("/owner/challenge").then(function (r) { if (!r.ok) throw new Error("the counter did not answer (" + r.status + ")"); return r.json(); })
        .then(function (ch) {
          status("st-info", "Sign the message in your wallet (it costs nothing and sends nothing).");
          return window.ethereum.request({ method: "personal_sign", params: [hex(ch.message), addr] }).then(function (sig) { return { ch: ch, sig: sig }; });
        });
    }).then(function (x) {
      return api("/owner/session", { method: "POST", body: { nonce: x.ch.nonce, signature: x.sig } }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); });
    }).then(function (y) {
      if (!y.r.ok) { status("st-err", y.j && y.j.error === "not-owner" ? "That wallet is not the owner's. Switch to the owner wallet and sign again." : "Sign-in refused (" + ((y.j && y.j.error) || y.r.status) + ")."); return false; }
      try { sessionStorage.setItem(KEY, JSON.stringify({ token: y.j.token, expires: y.j.expires })); } catch (e) {}
      status("st-ok", "Signed in as the owner. The session lasts 30 minutes in this tab.");
      return true;
    }).catch(function (e) {
      var m = String((e && e.message) || e);
      status("st-err", /Failed to fetch|NetworkError|Load failed/.test(m) ? "Can't reach the counter at " + BASE + " — is dy-count deployed?" : "Sign-in stopped: " + m);
      return false;
    });
  }
  // the page's start: a live session → show; else the sign-in button
  function gate(onOpen) {
    try { window.DYWallet && window.DYWallet.init && window.DYWallet.init(); } catch (e) {}
    var open = function () { $("owner-locked").hidden = true; $("owner-open").hidden = false; onOpen(); };
    if (saved()) { status("st-ok", "Signed in as the owner (this tab)."); open(); return; }
    status("st-info", "Owner only. Sign in with the owner wallet to open this page.");
    $("owner-signin").addEventListener("click", function () { signIn().then(function (okk) { if (okk) open(); }); });
  }
  function expired() { try { sessionStorage.removeItem(KEY); } catch (e) {} status("st-warn", "The session ended. Reload the page and sign in again."); }
  return { BASE: BASE, api: api, gate: gate, signIn: signIn, saved: saved, expired: expired, status: status };
})();
