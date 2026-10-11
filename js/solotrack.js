/* =========================================================================
   js/solotrack.js — FREE-PLAY-1 (rung 2): the rite's ONE analytics event.
   Owner ruling 2026-10-11: load Plausible on rite.html and fire ONE tag-only
   event, solo_start, when a connected wallet WITHOUT a Torana takes Enter.
   THE LAW (the store's zero-PII law, js/store.js STORE-TRACK-1): what travels
   is the three utm values from the link the visitor followed — nothing else.
   No address, no holder flag, no props of our own. The tags live in
   sessionStorage only (the store's own key, so a visit tagged on either page
   carries through), and a blocked/failed/disabled tag is a silent no-op that
   can never stand between the visitor and the game.
   The page is NOT counted on load: autoCapturePageviews is off, so the one
   event this page sends is solo_start.
   ========================================================================= */
window.DYSoloTrack = (function () {
  var TRACK_KEY = "dystore::utm";               // shared with js/store.js — sessionStorage ONLY
  var UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign"];
  var mounted = false, fired = false;

  function cfg() { return (window.DY_CONFIG && window.DY_CONFIG.analytics) || {}; }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* untagged, never broken */ } }

  // a tagged link REPLACES the stored set wholesale; an untagged visit keeps what the session already had
  function captureUtm() {
    var q = String((window.location && window.location.search) || "");
    var found = {}, any = false;
    UTM_FIELDS.forEach(function (k) {
      var m = q.match(new RegExp("[?&]" + k + "=([^&#]*)"));
      if (m) { any = true; try { found[k] = decodeURIComponent(m[1].replace(/\+/g, " ")); } catch (e) { found[k] = m[1]; } }
    });
    if (!any) return;
    UTM_FIELDS.forEach(function (k) { if (found[k] == null) found[k] = ""; });
    ssSet(TRACK_KEY, JSON.stringify(found));
  }
  // ONLY the three tags, only as strings, never anything shaped like an address or a hash
  function tags() {
    var raw = ssGet(TRACK_KEY), o = null, out = {};
    if (!raw) return out;
    try { o = JSON.parse(raw); } catch (e) { return out; }
    if (!o || typeof o !== "object") return out;
    UTM_FIELDS.forEach(function (k) {
      var v = o[k];
      if (typeof v === "string" && v !== "" && !/0x[0-9a-fA-F]{40}/.test(v)) out[k] = v;
    });
    return out;
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    captureUtm();
    var a = cfg();
    if (!(a.enabled && a.script) || typeof document === "undefined" || !document.head) return;
    try {
      var w = window;
      w.plausible = w.plausible || function () { (w.plausible.q = w.plausible.q || []).push(arguments); };
      w.plausible.init = w.plausible.init || function (i) { w.plausible.o = i || {}; };
      w.plausible.init({ autoCapturePageviews: false });   // the rite sends solo_start and nothing else
      var s = document.createElement("script");
      s.async = true;
      s.src = a.script;
      document.head.appendChild(s);
    } catch (e) { /* a refused injection is a no-op */ }
  }

  // solo_start — once per page load, the utm tags only
  function soloStart() {
    if (fired) return;
    fired = true;
    try { if (typeof window.plausible === "function") window.plausible("solo_start", { props: tags() }); } catch (e) {}
  }

  return { mount: mount, soloStart: soloStart, _tags: tags };
})();
