/* MINI-GAMES-2 · "← Back to the game" (owner ruling 2026-10-16) — the same button on Smriti and the Daily Puzzle.
   UMD: browser `window.DY_BACK` (wires every [data-back-to-game] on load), Node `require` (the rule, for the tests).
   THE RULE: arrived from a game menu (the site's own /game/ copy, or the free game's site) → back to it in this tab —
   through the browser's history when it has the entry (the menu comes back as it was, often without reloading), else
   by link; arrived any other way (a direct link, a new tab) → the free game's menu. Never window.open, never a gate the
   player didn't come through (the /game/ copy is only ever the referrer when its pass is already in this tab). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.DY_BACK = factory(); root.DY_BACK.wire(root.document, root); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var FREE = "https://sangbaran-purr.github.io/divya-yuddha/";
  var FREE_ORIGIN = "https://sangbaran-purr.github.io";
  // → { url, from: "site" | "free" | null } — where the button goes, given the referrer and this page's URL
  function target(referrer, here) {
    try {
      var r = new URL(referrer), h = new URL(here);
      if (r.origin === h.origin && /^\/game\/(index\.html)?$/.test(r.pathname)) return { url: r.href, from: "site" };
      // a cross-site referrer carries only its origin ("https://sangbaran-purr.github.io/"); with the full URL, the game's paths
      if (r.origin === FREE_ORIGIN && (r.pathname === "/" || /^\/divya-yuddha\/(index\.html)?$/.test(r.pathname))) return { url: FREE, from: "free" };
    } catch (e) {}
    return { url: FREE, from: null };
  }
  function go(doc, win) {
    var t = target(doc.referrer, win.location.href);
    if (t.from && win.history && win.history.length > 1) {
      var left = false;
      win.addEventListener("pagehide", function () { left = true; });
      win.history.back();
      win.setTimeout(function () { if (!left) win.location.href = t.url; }, 900);   // history had no way back: go by link
    } else win.location.href = t.url;   // same tab
  }
  function wire(doc, win) {
    var bs = doc.querySelectorAll("[data-back-to-game]");
    for (var i = 0; i < bs.length; i++) bs[i].addEventListener("click", function (e) { e.preventDefault(); go(doc, win); });
  }
  return { FREE: FREE, target: target, go: go, wire: wire };
});
