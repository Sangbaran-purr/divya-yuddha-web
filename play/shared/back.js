/* MINI-GAMES-2 · "← Back to the game" (owner ruling 2026-10-16) — the same button on Smriti and the Daily Puzzle.
   UMD: browser `window.DY_BACK` (wires every [data-back-to-game] on load), Node `require` (the rule, for the tests).
   LINK-HOME-1 (2026-11-02): the game is OUR game — the site's free /game/ copy (GUEST-PLAY-1: no wallet, no gate). The
   button never sends a player to a *.github.io address. Its home is the link's own href (../../game/index.html?v=<copy
   id>, stamped by scripts/sync_game.sh like every site->game link), so this file carries no address of its own.
   THE RULE: arrived from the site's /game/ menu → back to it in this tab, through the browser's history when it has the
   entry (the menu comes back as it was, often without reloading), else by link; arrived any other way (a direct link, a
   new tab, the old github.io game) → the link's home, the site's /game/ menu. Never window.open. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.DY_BACK = factory(); root.DY_BACK.wire(root.document, root); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var HOME = "/game/index.html";   // only if a button carries no href: the site's game, on this page's own origin
  // → { url, from: "site" | null } — where the button goes, given the referrer, this page's URL and the link's home
  function target(referrer, here, home) {
    var url;
    try { url = new URL(home || HOME, here).href; } catch (e) { url = HOME; }
    try {
      var r = new URL(referrer), h = new URL(here);
      if (r.origin === h.origin && /^\/game\/(index\.html)?$/.test(r.pathname)) return { url: r.href, from: "site" };
    } catch (e) {}
    return { url: url, from: null };
  }
  function go(doc, win, home) {
    var t = target(doc.referrer, win.location.href, home);
    if (t.from && win.history && win.history.length > 1) {
      var left = false;
      win.addEventListener("pagehide", function () { left = true; });
      win.history.back();
      win.setTimeout(function () { if (!left) win.location.href = t.url; }, 900);   // history had no way back: go by link
    } else win.location.href = t.url;   // same tab
  }
  function wire(doc, win) {
    var bs = doc.querySelectorAll("[data-back-to-game]");
    for (var i = 0; i < bs.length; i++) bs[i].addEventListener("click", function (e) { e.preventDefault(); go(doc, win, this.getAttribute("href")); });
  }
  return { HOME: HOME, target: target, go: go, wire: wire };
});
