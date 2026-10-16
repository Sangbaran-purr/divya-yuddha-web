/* MINI-GAMES-2 · SMRITI — R2: THE ANIMATION PLAYER. UMD: browser `window.DY_SMRITI_PLAYER`, Node `require`.
 *
 * A small canvas player that draws a Hero (or Meghnad) coming out of the card just turned over. It reads the game's own
 * actor packs with the game's own manifest reader (play/smriti/manifest.js — a byte-for-byte copy, pinned by the tests):
 *   - the 20 Heroes: the game's registry and packs on the free game's site (the same base the gated game copy uses);
 *   - Meghnad: the fixed copy of his 256 px pack in play/smriti/actors/meghnad/ (pinned to the lab original).
 * Phones get the 256 px sheets ONLY (no 512 px atlas is ever fetched). Only the animated cards on the current board are
 * loaded; every one is let go when the game ends. A card whose pack is missing or broken simply turns over — the board
 * never breaks.
 *
 * OWN SPEED: a clip plays at its own length (the pack's phaseMs at tempo 1 — not the battle's 0.6 tempo, not fast mode),
 * with a short wake-up before and a settle after: 2.6–4.8 s across the 21 cards. ANIMATION_SPEED is the ONE setting
 * (1 = the clip's own speed; 2 = twice as fast); every duration below divides by it, nothing else does.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DY_SMRITI_PLAYER = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OUT = {
    ANIMATION_SPEED: 1,                 // ← THE ONE SETTING: 1 = each clip at its own speed
    RUNG: 256,                          // phones and desktops alike: the 256 px sheets only
    WAKE_MS: 400,                       // the card wakes before the figure rises
    SETTLE_MS: 400,                     // the figure settles back into the card
    BIG_FRACTION: 0.64,                 // PHONES: the large figure's height, as a share of the board's height (clamped to the field)
    MANIFEST_BASE: "https://sangbaran-purr.github.io/divya-yuddha/assets/manifest/",   // the free game's packs (CORS open)
    LOCAL: { meghnad: "actors/meghnad/manifest.json" },                                 // relative to the page: the pinned copy
  };

  // the length of one play at the current speed, in ms (wake-up + emerge + act + settle)
  OUT.durationOf = function (m) {
    var sp = OUT.ANIMATION_SPEED > 0 ? OUT.ANIMATION_SPEED : 1, ph = m && m.phaseMs;
    if (!ph) return 0;
    return Math.round((OUT.WAKE_MS + ph.emerge + ph.act + OUT.SETTLE_MS) / sp);
  };

  // PHONES — the large placement: the clip's own bounding box over every frame it draws (emerge + act), scaled so it is
  // `maxH` tall at most, no wider than `bound` (the whole board, frame included — most figures are wider than tall, so the
  // phone board's WIDTH is what limits them) and no taller than the field; centred in the field, kept inside `bound`.
  // → { k, footX, footY, box }
  OUT.bigFit = function (m, field, maxH, bound) {
    var B = bound || field;
    var ix = m.phases.emerge.concat(m.phases.act), x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    ix.forEach(function (i) { var c = m.cells[i]; x0 = Math.min(x0, -c.pivot.x); x1 = Math.max(x1, c.w - c.pivot.x); y0 = Math.min(y0, -c.pivot.y); y1 = Math.max(y1, c.h - c.pivot.y); });
    var bw = x1 - x0, bh = y1 - y0, k = Math.min(maxH / bh, B.w * 0.98 / bw, field.h * 0.96 / bh);
    var bx = field.x + field.w / 2 - bw * k / 2, by = field.y + field.h / 2 - bh * k / 2;
    bx = Math.max(B.x + B.w * 0.01, Math.min(bx, B.x + B.w * 0.99 - bw * k));
    var footX = bx - x0 * k, footY = by - y0 * k;
    return { k: k, footX: footX, footY: footY, box: { x: bx, y: by, w: bw * k, h: bh * k } };
  };

  OUT.create = function (env) {
    // env = { AM (the manifest reader), fetch, Image, raf, now, pageUrl, onFetch?(url) }
    var AM = env.AM, cache = {}, registry = null, regP = null, fetched = [], released = [];
    var abs = function (rel, base) { try { return new URL(rel, base).href; } catch (e) { return null; } };
    var note = function (u) { fetched.push(u); if (env.onFetch) env.onFetch(u); };
    function getJSON(u) { note(u); return env.fetch(u, { cache: "force-cache" }).then(function (r) { if (!r || !r.ok) throw new Error("http " + (r && r.status)); return r.json(); }); }
    function loadRegistry() {
      if (regP) return regP;
      regP = getJSON(OUT.MANIFEST_BASE + "registry.json").then(function (j) { registry = (j && j.actors) || {}; return registry; }, function () { registry = {}; return registry; });
      return regP;
    }
    function specUrl(id) {
      if (OUT.LOCAL[id]) return abs(OUT.LOCAL[id], env.pageUrl);
      var e = registry && registry[id];
      if (!e || !e.manifest || (Array.isArray(e.rungs) && e.rungs.indexOf(OUT.RUNG) < 0)) return null;
      return abs(e.manifest, OUT.MANIFEST_BASE);
    }
    // load ONE card's pack at the 256 px rung; a failure leaves it 'failed' (the card will just turn over)
    function loadOne(id) {
      var slot = cache[id] = { id: id, state: "loading", m: null, img: null };
      slot.p = loadRegistry().then(function () {
        var u = specUrl(id); if (!u) throw new Error("no pack for " + id);
        return getJSON(u).then(function (raw) {
          var v = AM.validate(raw); if (!v.ok) throw new Error(v.errors[0]);
          var m = AM.forRung(raw, OUT.RUNG);
          if (m.rung !== OUT.RUNG) throw new Error("no " + OUT.RUNG + " px sheet for " + id);   // never fall up to the 512 px atlas
          var src = abs(m.atlas, u);
          return new Promise(function (res, rej) {
            var img = new env.Image();
            img.onload = function () { res({ m: m, img: img }); };
            img.onerror = function () { rej(new Error("atlas failed for " + id)); };
            note(src); img.src = src;
          });
        });
      }).then(function (x) { if (cache[id] !== slot) { x.img.src = ""; return; } slot.m = x.m; slot.img = x.img; slot.state = "ready"; },
               function (e) { if (cache[id] === slot) { slot.state = "failed"; slot.error = String(e && e.message || e); } });
      return slot.p;
    }
    // a new board: let the previous board's packs go, then load only the animated cards now on the board
    function prepare(ids) {
      release();
      var uniq = []; ids.forEach(function (id) { if (uniq.indexOf(id) < 0) uniq.push(id); });
      return Promise.all(uniq.map(loadOne));
    }
    function release() {
      Object.keys(cache).forEach(function (id) { var s = cache[id]; if (s.img) { try { s.img.onload = s.img.onerror = null; s.img.src = ""; } catch (e) {} } released.push(id); });
      cache = {};
    }
    function state(id) { return cache[id] ? cache[id].state : "none"; }
    // wait (briefly) for a pack still loading; → true when it can play
    function whenReady(id, maxMs) {
      var s = cache[id]; if (!s) return Promise.resolve(false);
      if (s.state !== "loading") return Promise.resolve(s.state === "ready");
      return Promise.race([s.p.then(function () { return cache[id] === s && s.state === "ready"; }), new Promise(function (r) { setTimeout(function () { r(false); }, maxMs || 0); })]);
    }

    // PLAY: draw the figure out of the card. rect = the card on the canvas (canvas pixels): {x, y, w, h}.
    // → a Promise that resolves (true) when the play has ended, or (false) at once when the card has no ready pack.
    function play(id, ctx, rect, onFrame, big) {
      var s = cache[id];
      if (!s || s.state !== "ready" || !ctx) return Promise.resolve(false);
      var m = s.m, img = s.img, sp = OUT.ANIMATION_SPEED > 0 ? OUT.ANIMATION_SPEED : 1;
      var wake = OUT.WAKE_MS / sp, em = m.phaseMs.emerge / sp, act = m.phaseMs.act / sp, settle = OUT.SETTLE_MS / sp, total = wake + em + act + settle;
      var E = m.phases.emerge, A = m.phases.act;
      var H = rect.h * 1.18, k = H / m.refHeight, footX = rect.x + rect.w / 2, footY = rect.y + rect.h * 0.94;
      // PHONES (big given): rise from the card over the emerge phase, play LARGE and centred, and shrink back into the card
      // as it settles; the board under it dims a little while it is large. Without `big` nothing below changes (desktop).
      var BF = big ? OUT.bigFit(m, big, big.maxH, big.bound) : null, k0 = k, fx0 = footX, fy0 = footY;
      var ease = function (u) { u = Math.max(0, Math.min(1, u)); return 1 - Math.pow(1 - u, 3); };
      function placeAt(t) {
        if (!BF) return 0;
        var g = t < wake ? 0 : t < wake + em ? ease((t - wake) / em) : t < total - settle ? 1 : 1 - ease((t - (total - settle)) / settle);
        k = k0 + (BF.k - k0) * g; footX = fx0 + (BF.footX - fx0) * g; footY = fy0 + (BF.footY - fy0) * g;
        return g;
      }
      function cellAt(t) {
        if (t < wake) return null;
        var u = t - wake;
        if (u < em) return E[Math.min(E.length - 1, Math.floor(u / em * E.length))];
        u -= em;
        if (u < act) return A[Math.min(A.length - 1, Math.floor(u / act * A.length))];
        return A[A.length - 1];
      }
      return new Promise(function (resolve) {
        var t0 = env.now(), ended = false;
        function finish() { if (ended) return; ended = true; clearTimeout(guard); try { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); } catch (e) {} resolve(true); }
        var guard = setTimeout(finish, total + 1500);   // a starved frame loop (a hidden tab) never holds the board
        (function frame() {
          if (ended) return;
          var t = env.now() - t0;
          if (t >= total) { finish(); return; }
          try {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            var ix = cellAt(t), g = placeAt(t);
            if (BF && g > 0) { ctx.fillStyle = "rgba(6,8,16," + (0.38 * g).toFixed(3) + ")"; ctx.fillRect(big.x, big.y, big.w, big.h); }
            if (ix != null) {
              var c = m.cells[ix], a = 1;
              if (t < wake + 160 / sp) a = Math.max(0, (t - wake) / (160 / sp));
              if (t > total - settle) a = Math.max(0, (total - t) / settle);
              ctx.globalAlpha = a;
              ctx.drawImage(img, c.x, c.y, c.w, c.h, footX - c.pivot.x * k, footY - c.pivot.y * k, c.w * k, c.h * k);
              ctx.globalAlpha = 1;
            }
            if (onFrame) onFrame(t, ix);
          } catch (e) { finish(); return; }
          env.raf(frame);
        })();
      });
    }
    return { prepare: prepare, release: release, play: play, state: state, whenReady: whenReady, loadRegistry: loadRegistry,
             get fetched() { return fetched.slice(); }, get released() { return released.slice(); }, get loaded() { return Object.keys(cache); },
             manifestOf: function (id) { return cache[id] && cache[id].m; } };
  };
  return OUT;
});
