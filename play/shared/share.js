/* GROWTH-1 Stage 2 · THE SHARE LOOPS (owner rulings 2026-11-06, #10). UMD: browser `window.DY_SHARE`, Node `require` (tests).
   · THE LINK: a public page of the site + utm_source = the SHARER's own first-touch source (the player counter's memory;
     untagged = "direct") + utm_medium=share + utm_campaign=daily|smriti|challenge. NOTHING personal: no id, no name, no score
     beyond what the sharer's own text says. A friend who opens it is credited to the sharer's source as a share.
   · THE SHARE: the phone's share sheet when there is one; otherwise the text and the link go to the clipboard. A share the
     player cancels is not a share. This file does not count: the caller reports a share it made (DY_COUNT.shared(kind)). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else if (root && !root.DY_SHARE) root.DY_SHARE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var BASE = "https://divyayuddha.games/";
  var PATHS = { daily: "play/daily/", smriti: "play/smriti/", challenge: "" };   // the challenge lands on the home page: its Play free button carries the tags on
  function cleanTag(v) { v = String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48); return v || null; }
  // the sharer's first-touch source, as the counter remembers it (a portal edition keeps its "portal:<name>")
  function source(counter) {
    try { var c = counter || (typeof window !== "undefined" ? window.DY_COUNT : null), s = c && c.state(); return cleanTag(s && s.src && s.src.s) || "direct"; }
    catch (e) { return "direct"; }
  }
  function link(campaign, counter) {
    if (!Object.prototype.hasOwnProperty.call(PATHS, campaign)) throw new Error("unknown share campaign: " + campaign);
    return BASE + PATHS[campaign] + "?utm_source=" + encodeURIComponent(source(counter)) + "&utm_medium=share&utm_campaign=" + campaign;
  }
  function copyText(t, nav, doc) {
    function legacy() {
      try { var ta = doc.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        doc.body.appendChild(ta); ta.select(); var ok = doc.execCommand && doc.execCommand("copy"); ta.remove(); return ok ? "copied" : "failed"; }
      catch (e) { return "failed"; }
    }
    if (nav && nav.clipboard && nav.clipboard.writeText) return nav.clipboard.writeText(t).then(function () { return "copied"; }, legacy);
    return Promise.resolve(legacy());
  }
  // → Promise of "shared" | "copied" | "cancelled" | "failed"
  function share(o, env) {
    env = env || {}; var nav = env.navigator || (typeof navigator !== "undefined" ? navigator : null), doc = env.document || (typeof document !== "undefined" ? document : null);
    var data = { text: o.text, url: o.url }, both = o.text + " " + o.url;
    if (nav && typeof nav.share === "function" && (!nav.canShare || nav.canShare(data))) {
      return nav.share(data).then(function () { return "shared"; }, function (e) { return e && e.name === "AbortError" ? "cancelled" : copyText(both, nav, doc); });
    }
    return copyText(both, nav, doc);
  }
  return { link: link, share: share, source: source, BASE: BASE, PATHS: PATHS };
});
