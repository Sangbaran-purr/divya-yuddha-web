/* GROW-COUNT-1 · THE PLAYER COUNTER (owner rulings 2026-11-03). UMD: browser `window.DY_COUNT`, Node `require` (tests).
   A PLAYER is one browser that FINISHES at least one match vs AI, story chapter, Hall match, Daily Puzzle (solved or
   revealed, any date) or Smriti board — counted once, for life.
   · THE ID: a random 128-bit id made on the first visit, kept in this origin's storage under "dy_player". Nothing else
     goes with it — no name, email, IP or wallet. The same id on /game/, /play/daily/ and /play/smriti/: the site's game
     copy loads this file AHEAD of its storage namespace shim (scripts/sync_game.sh), so it reads the real storage.
   · THE SOURCE: utm_source / utm_medium / utm_campaign from the FIRST visit (first touch wins, never overwritten);
     untagged = "direct". A portal edition sets window.DY_COUNT_PORTAL before this file → source "portal:<name>".
   · THE EVENTS (UTC days): first_visit (once per id) · first_play (once per id, ever — the count) · return_play (once per
     id per UTC day after the first, with days since the first play) · wallet_connect (once per id; never the address) ·
     share (capped per day) · ONBOARD-1 (owner ruling 2026-11-10): fsel_seen (the game's faction screen opened) and battle_start
     (BEGIN BATTLE tapped), once per id each. Each is written to the OUTBOX first and leaves only when the server takes it.
   · THE SERVER: ENDPOINT below (switched on 2026-11-03). EMPTY = not switched on: events wait in the outbox. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else if (root && !root.DY_COUNT) {
    var st = null; try { st = root.localStorage; st.getItem("dy_probe"); } catch (e) { st = null; }   // captured NOW: before any shim
    var loc = root.location, top = null; try { if (root.top !== root && root.top.location.origin === loc.origin) top = root.top.location; } catch (e) { top = null; }
    root.DY_COUNT = factory().create({ storage: st, search: (top || loc).search, portal: root.DY_COUNT_PORTAL || null,
      fetch: root.fetch ? root.fetch.bind(root) : null, now: function () { return Date.now(); }, random: root.crypto && root.crypto.getRandomValues ? function (n) { return root.crypto.getRandomValues(new Uint8Array(n)); } : null });
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ENDPOINT = "https://count.divyayuddha.games/v1/events";   // SWITCHED ON by the owner 2026-11-03 (GROW-COUNT-1 · SWITCH-ON); "" = events wait in the outbox
  var KEY = "dy_player", BOX = "dy_player_outbox", BOX_MAX = 60, SHARES_PER_DAY = 5;
  var KINDS = { match: 1, story: 1, hall: 1, daily: 1, smriti: 1 };
  var STEPS = { fsel_seen: 1, battle_start: 1 };   // ONBOARD-1: the faction screen → battle funnel, once per id each
  var ID_RE = /^[A-Za-z0-9_-]{22}$/;

  function utcDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
  function cleanTag(v) { v = String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48); return v || null; }
  // the first-touch source from a URL's query (and the portal name, which wins) → { s, m, c }
  function sourceOf(search, portal) {
    var q = {}; String(search || "").replace(/^\?/, "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) { try { q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " ")); } catch (e) {} } });
    var p = cleanTag(portal);
    if (p) return { s: "portal:" + p, m: "portal", c: cleanTag(q.utm_campaign) };
    var s = cleanTag(q.utm_source);
    return s ? { s: s, m: cleanTag(q.utm_medium), c: cleanTag(q.utm_campaign) } : { s: "direct", m: null, c: null };
  }
  function b64url(bytes) { var s = "", A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"; for (var i = 0; i < bytes.length; i++) s += A[bytes[i] & 63]; return s; }

  function create(env) {
    var S = env.storage, now = env.now || Date.now, endpoint = env.endpoint != null ? env.endpoint : ENDPOINT;
    var rnd = env.random || function (n) { var a = []; for (var i = 0; i < n; i++) a.push(Math.floor(Math.random() * 256)); return a; };
    var inflight = false;
    function read(k) { try { var v = S.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function write(k, v) { try { S.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    // no storage → no counting at all (a browser we cannot remember could not be counted once)
    if (!S) return { finished: noop, walletConnected: noop, shared: noop, step: noop, flush: function () { return Promise.resolve(0); }, state: function () { return null; }, outbox: function () { return []; }, ENDPOINT: endpoint };
    function noop() {}
    var st = read(KEY);
    if (!st || !ID_RE.test(st.id || "")) {
      // THE FIRST VISIT: the id and the first-touch source, once
      st = { v: 1, id: b64url(rnd(22)), src: sourceOf(env.search, env.portal), visitAt: now(), visitDay: utcDay(now()), firstPlayDay: null, lastReturnDay: null, wallet: false, shares: { day: null, n: 0 } };
      write(KEY, st);
      queue({ ev: "first_visit", day: st.visitDay });
    }
    function queue(e) {
      var box = read(BOX) || [];
      e.k = b64url(rnd(8)); e.id = st.id; e.s = st.src.s; e.m = st.src.m; e.c = st.src.c;
      box.push(e);
      while (box.length > BOX_MAX) { var i = box.findIndex(function (x) { return x.ev === "share"; }); box.splice(i >= 0 ? i : 0, 1); }   // shares go first if the box overflows
      write(BOX, box);
    }
    function save() { write(KEY, st); }
    function fresh() { var x = read(KEY); if (x && x.id === st.id) st = x; }   // another tab may have moved it on
    // a FINISH: the first ever → first_play; later, the first finish of a UTC day → return_play
    function finished(kind) {
      if (!KINDS[kind]) return;
      fresh();
      var day = utcDay(now());
      if (!st.firstPlayDay) {
        st.firstPlayDay = day; save();
        queue({ ev: "first_play", day: day, kind: kind, secs: Math.max(0, Math.min(86400 * 365, Math.round((now() - (st.visitAt || now())) / 1000))) });
      } else if (day !== st.firstPlayDay && day !== st.lastReturnDay && day > st.firstPlayDay) {
        st.lastReturnDay = day; save();
        queue({ ev: "return_play", day: day, kind: kind, days: daysBetween(st.firstPlayDay, day), first: st.firstPlayDay });
      }
      flush();
    }
    function walletConnected() { fresh(); if (st.wallet) return; st.wallet = true; save(); queue({ ev: "wallet_connect", day: utcDay(now()) }); flush(); }
    function shared(kind) {
      fresh(); var day = utcDay(now()); if (st.shares.day !== day) st.shares = { day: day, n: 0 };
      if (st.shares.n >= SHARES_PER_DAY) return;
      st.shares.n++; save(); queue({ ev: "share", day: day, kind: cleanTag(kind) || "link" }); flush();
    }
    // ONBOARD-1: a funnel step, once per id ever (the event carries only the day, like every other)
    function step(name) {
      if (!STEPS[name]) return;
      fresh(); st.steps = st.steps || {};
      if (st.steps[name]) return;
      st.steps[name] = utcDay(now()); save(); queue({ ev: name, day: st.steps[name] }); flush();
    }
    // send what waits; a sent batch leaves the box only when the server took it (2xx) or refused it for good (400)
    function flush() {
      if (!endpoint || !env.fetch || inflight) return Promise.resolve(0);
      var box = read(BOX) || []; if (!box.length) return Promise.resolve(0);
      var batch = box.slice(0, 20), keys = batch.map(function (e) { return e.k; });
      inflight = true;
      return env.fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ v: 1, events: batch }), keepalive: true, credentials: "omit", mode: "cors" })
        .then(function (r) {
          inflight = false;
          if ((r.status >= 200 && r.status < 300) || r.status === 400) { var left = (read(BOX) || []).filter(function (e) { return keys.indexOf(e.k) < 0; }); write(BOX, left); return batch.length; }
          return 0;   // 429 / 5xx: kept for the next finish or the next page
        }, function () { inflight = false; return 0; });
    }
    if (endpoint) flush();
    return { finished: finished, walletConnected: walletConnected, shared: shared, step: step, flush: flush, state: function () { return JSON.parse(JSON.stringify(st)); }, outbox: function () { return read(BOX) || []; }, ENDPOINT: endpoint };
  }
  return { create: create, sourceOf: sourceOf, utcDay: utcDay, daysBetween: daysBetween, cleanTag: cleanTag, ENDPOINT: ENDPOINT, KEY: KEY, BOX: BOX, ID_RE: ID_RE };
});
