/* MINI-GAMES-2 · SMRITI — R3: THE PAGE (/play/smriti/). Free, no wallet, no Torana, no DYC, no badges, no leaderboard.
 *
 * Choose a level → a board of face-down cards → turn two at a time → a pair stays up, two different cards turn back →
 * every pair found → the finished screen with the tries and the best for that level ("Play again").
 * THE WAIT: turning a Hero (or Meghnad) plays its animation out of the card, and the board takes no taps until it ends —
 * on every such turn, the first time and every time after. With reduced motion turned on there is no animation and no wait.
 * THE ART: the card thumbnails of the free game. A card whose picture fails to load is set aside and the board is dealt
 * again from the same seed — so a card joins by itself once its art is published.
 * Plain words in every instruction; the mythic voice stays in the headings.
 */
(function () {
  "use strict";
  var S = window.DY_SMRITI, PL = window.DY_SMRITI_PLAYER, AM = window.ActorManifest, LY = window.DY_SMRITI_LAYOUT;
  var ART = "https://sangbaran-purr.github.io/divya-yuddha/assets/thumbs/", ART_V = "?v=t65";
  var MISS_MS = 900, THUMB_WAIT_MS = 6000, PACK_WAIT_MS = 1500;

  var T = {
    level: { easy: "Easy", medium: "Medium", hard: "Hard" },
    pairs: function (n) { return n + " pairs"; },
    bestTries: function (n) { return "Best: " + n + " tries"; },
    noBest: "No best yet",
    result: function (pairs, tries) { return "You found all " + pairs + " pairs in " + tries + " tries."; },
    newBest: "New best!",
    yourBest: function (n) { return "Your best: " + n + " tries."; },
    noStore: "This browser isn't saving your best scores.",
    faceDown: "Face-down card",
  };

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  var reduced = function () { try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } };

  var store = null;
  try { store = window.localStorage; store.getItem("dy_probe"); } catch (e) { store = null; }
  var rec = S.load(store);

  var CARDS = S.cardsFrom(DECKS), missing = {}, level = null, game = null, busy = false, playing = null, gen = 0;
  var player = PL.create({ AM: AM, fetch: function (u, o) { return window.fetch(u, o); }, Image: window.Image,
    raf: function (f) { return window.requestAnimationFrame(f); }, now: function () { return window.performance.now(); }, pageUrl: location.href });

  function thumb(c) { return ART + S.artName(c) + ART_V; }
  function bestText(lv) { var b = rec.best[lv]; return b != null ? T.bestTries(b) : T.noBest; }

  // ── level choice ──
  function renderLevels() {
    var box = $("sm-levels"); box.innerHTML = "";
    S.LEVEL_ORDER.forEach(function (lv) {
      var b = el("button", "sm-lv mg-btn"); b.type = "button";   // the mulligan plaque button (play/shared/mini.css)
      b.setAttribute("data-level", lv);
      b.appendChild(el("span", "sm-lvname", T.level[lv]));
      b.appendChild(el("span", "sm-lvpairs", T.pairs(S.LEVELS[lv])));
      b.appendChild(el("span", "sm-lvbest", bestText(lv)));
      b.addEventListener("click", function () { begin(lv); });
      box.appendChild(b);
    });
  }
  function show(which) { ["sm-choose", "sm-play", "sm-done"].forEach(function (id) { $(id).hidden = id !== which; });
    document.body.classList.toggle("sm-playing", which === "sm-play");   // in play the board art carries the title: the page head steps aside so the whole board fits
    if (which === "sm-play") applyLayout(); }
  function choose() { gen++; endPlay(); player.release(); game = null; busy = false; renderLevels(); show("sm-choose"); }

  // ── a new board: deal, check the pictures, deal again without any card whose picture is missing ──
  function begin(lv) {
    level = lv; var my = ++gen, seed = (Math.random() * 4294967296) >>> 0;
    endPlay(); busy = true;
    (function attempt(k) {
      var tiles = S.deal(S.poolOf(CARDS, function (c) { return !missing[c.id]; }), lv, seed);
      var uniq = []; tiles.forEach(function (t) { if (uniq.indexOf(t.card) < 0) uniq.push(t.card); });
      Promise.all(uniq.map(function (c) {
        return new Promise(function (res) {
          var im = new Image(), done = function (okk) { clearTimeout(tm); res(okk); }, tm = setTimeout(function () { done(true); }, THUMB_WAIT_MS);
          im.onload = function () { done(true); }; im.onerror = function () { done(false); }; im.src = thumb(c);
        }).then(function (okk) { if (!okk) missing[c.id] = true; return okk; });
      })).then(function (oks) {
        if (my !== gen) return;
        if (oks.indexOf(false) >= 0 && k < 4) { attempt(k + 1); return; }
        game = S.start(tiles, lv);
        busy = false;
        player.prepare(tiles.filter(function (t) { return S.isAnimated(t.card); }).map(function (t) { return t.id; }));
        renderBoard(); show("sm-play");
      });
    })(0);
  }

  // ── the board ──
  function renderBoard() {
    var b = $("sm-board"); b.innerHTML = ""; b.className = "sm-board sm-" + level;
    game.tiles.forEach(function (t) {
      var d = el("button", "sm-card"); d.type = "button"; d.setAttribute("data-i", t.i); d.setAttribute("data-id", t.id);
      if (S.isAnimated(t.card)) d.setAttribute("data-animated", "1");
      var inner = el("span", "sm-inner"), back = el("span", "sm-back"), face = el("span", "sm-face");
      back.appendChild(el("span", "sm-mark", "॥"));
      var im = el("img"); im.alt = ""; im.src = thumb(t.card); im.draggable = false;
      im.onerror = function () { im.remove(); face.classList.add("sm-noart"); };
      face.appendChild(im); face.appendChild(el("span", "sm-name", t.card.n));
      inner.appendChild(back); inner.appendChild(face); d.appendChild(inner);
      d.addEventListener("click", function () { tap(t.i); });
      b.appendChild(d);
    });
    applyLayout();
    paint();
  }
  // ── the board art and every position on it (layout.js: the art's measured edges, the screen's size) ──
  var lastLayout = null;
  function px(n) { return Math.round(n * 100) / 100 + "px"; }
  function place(node, r) { node.style.left = px(r.x); node.style.top = px(r.y); node.style.width = px(r.w); node.style.height = px(r.h); }
  function applyLayout() {
    if (!game || $("sm-play").hidden) return;
    var L = LY.layout({ vw: window.innerWidth, vh: window.innerHeight, pairs: game.pairs }); lastLayout = L;
    var art = $("sm-boardart"), g = L.grid;
    art.className = "sm-boardart sm-art-" + L.art;
    art.style.width = px(L.board.w); art.style.height = px(L.board.h); art.style.marginTop = "0px"; $("sm-board").closest("main").style.setProperty("--sm-top", px(L.board.y));   // padding, not margin: a margin would collapse through <main>/<body> and scroll the page
    var src = "art/" + LY.artSrc(L.art, L.board.w, window.devicePixelRatio || 1);
    if ($("sm-art").getAttribute("src") !== src) $("sm-art").setAttribute("src", src);
    var b = $("sm-board");
    b.style.left = px(g.x); b.style.top = px(g.y); b.style.width = px(g.w); b.style.height = px(g.h);
    b.style.gridTemplateColumns = "repeat(" + g.cols + ", " + px(g.cardW) + ")"; b.style.gap = px(g.gap);
    b.setAttribute("data-grid", g.cols + "x" + g.rows);
    [].forEach.call(b.querySelectorAll(".sm-card"), function (c) { c.style.width = px(g.cardW); c.style.height = px(g.cardH); });
    b.style.setProperty("--sm-name", px(Math.max(8, Math.min(12, g.cardW * 0.12))));
    var top = $("sm-btop").children, bot = $("sm-bbot").children;
    place(top[0], L.zonesTop[0]); place(top[1], L.zonesTop[1]); place(bot[0], L.zonesBottom[0]); place(bot[1], L.zonesBottom[1]);
    [top[0], bot[0], bot[1]].forEach(function (n) { n.style.fontSize = px(L.bannerFont); });
    top[1].style.fontSize = px(L.epithetFont);
    top[1].hidden = !L.epithetInBanner; $("sm-epi-out").hidden = L.epithetInBanner;
  }
  window.addEventListener("resize", function () { applyLayout(); });
  function paint() {
    if (!game) return;
    game.tiles.forEach(function (t) {
      var d = document.querySelector('.sm-card[data-i="' + t.i + '"]'); if (!d) return;
      d.classList.toggle("sm-up", t.up || t.matched);
      d.classList.toggle("sm-matched", t.matched);
      d.setAttribute("aria-label", t.up || t.matched ? t.card.n : T.faceDown);
    });
    $("sm-tries").textContent = String(game.tries);
    $("sm-best").textContent = rec.best[level] != null ? String(rec.best[level]) : "—";
    $("sm-board").classList.toggle("sm-busy", busy);
  }

  // ── a turn ──
  function tap(i) {
    if (!game || busy || !S.canFlip(game, i)) return;   // no turns while an animation plays (or two cards wait to turn back)
    var r = S.flip(game, i); if (!r) return;
    var my = gen;
    paint();
    var after = function () {
      if (my !== gen || !game) return;
      if (r.kind === "miss") {
        busy = true; paint();
        setTimeout(function () { if (my !== gen || !game) return; S.turnBack(game); busy = false; paint(); }, MISS_MS);
        return;
      }
      busy = false; paint();
      if (game.done) finish();
    };
    if (S.isAnimated(r.tile.card) && !reduced()) { busy = true; paint(); animate(r.tile).then(after); }
    else after();
  }
  // the figure comes out of the card at its own speed; a missing or broken pack is just a plain turn (no wait)
  function animate(tile) {
    var my = gen;
    return player.whenReady(tile.id, PACK_WAIT_MS).then(function (ready) {
      if (!ready || my !== gen) return false;
      var card = document.querySelector('.sm-card[data-i="' + tile.i + '"]'), cv = $("sm-stage");
      if (!card || !cv) return false;
      var dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      var ctx = cv.getContext("2d"); if (!ctx) return false;
      var r = card.getBoundingClientRect(), big = null;
      // PHONES: the figure rises from the card, plays LARGE and centred over the board, and fades back into the card.
      // DESKTOP: as built — it plays out of the card.
      if (lastLayout && lastLayout.art === "port") {
        var a = $("sm-boardart").getBoundingClientRect(), f = lastLayout.field;
        big = { x: (a.left + f.x) * dpr, y: (a.top + f.y) * dpr, w: f.w * dpr, h: f.h * dpr, maxH: lastLayout.board.h * PL.BIG_FRACTION * dpr,
                bound: { x: a.left * dpr, y: a.top * dpr, w: a.width * dpr, h: a.height * dpr } };   // the whole board: the figure may cross the frame, never leave the art
      }
      playing = tile.i; card.classList.add("sm-waking");
      return player.play(tile.id, ctx, { x: r.left * dpr, y: r.top * dpr, w: r.width * dpr, h: r.height * dpr }, null, big).then(function (played) {
        playing = null; card.classList.remove("sm-waking"); return played;
      });
    });
  }
  function endPlay() { playing = null; try { var cv = $("sm-stage"), c = cv.getContext && cv.getContext("2d"); if (c) c.clearRect(0, 0, cv.width, cv.height); } catch (e) {} }

  // ── the end of a game: the best only improves, and the packs are let go ──
  function finish() {
    var improved = S.recordBest(rec, level, game.tries);
    if (improved) S.save(store, rec);
    player.release();
    $("sm-result").textContent = T.result(game.pairs, game.tries);
    $("sm-bestline").textContent = improved ? T.newBest : T.yourBest(rec.best[level]);
    show("sm-done");
  }

  $("sm-back").addEventListener("click", choose);
  $("sm-choose-again").addEventListener("click", choose);
  $("sm-again").addEventListener("click", function () { begin(level); });
  if (!store) $("sm-store").textContent = T.noStore;
  renderLevels(); show("sm-choose");

  // a read-only handle for the page tests
  window.__DY_SMRITI_PAGE = { get layout() { return lastLayout; }, get game() { return game; }, get busy() { return busy; }, get playing() { return playing; }, player: player, get missing() { return Object.keys(missing); }, get rec() { return rec; } };
})();
