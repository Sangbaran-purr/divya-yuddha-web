/* MINI-GAMES-1 R2 — THE DAILY PUZZLE PAGE (/play/daily/). Free, no wallet, no Torana, no DYC.
 *
 * The page never looks up an answer. It builds today's position with puzzle-core.js over the site's copy of the REAL
 * engine (game/src/engine.js, loaded as a plain script: its top-level declarations are page globals), lets the player
 * make their one play on that live engine (card, target, slot, and — for Vanaras — their free Leaps), passes, and
 * reads the engine's own round result. The offline solver proved exactly one play wins, so "you won the round" means
 * "you found it". "Show me the answer" runs the same solver here in the browser; no answer key is shipped.
 * Plain words in every instruction; the mythic voice stays in the headings.
 */
(function () {
  "use strict";
  var D = window.DY_DAILY, PZ = window.DY_PUZZLE, NOTES = window.DY_DAILY_NOTES || {};
  /* the engine's own functions and tables, as the solver uses them */
  var E = { newGame: newGame, playCard: playCard, pass: pass, playableIndices: playableIndices, targetSpec: targetSpec,
    effPower: effPower, isShielded: isShielded, totalPower: totalPower, adjacentUnits: adjacentUnits, doLeap: doLeap,
    leapLimit: leapLimit, sweepDeaths: sweepDeaths, REALMS: REALMS, REALM_INFO: REALM_INFO, DECKS: DECKS };

  var ART = "https://sangbaran-purr.github.io/divya-yuddha/assets/thumbs/", ART_V = "?v=t65";
  var FAC = { devas: "Devas", asuras: "Asuras", vanaras: "Vanaras", nagas: "Nagas" };

  // ── the words the player sees (every sentence is listed for the owner's ruling) ──
  var T = {
    instruction: "Your opponent has passed. Find the one play that wins this round.",
    chooseTarget: "Choose a target.",
    chooseSlot: "Choose where it goes on your row.",
    leapFrom: "Choose the Unit that will Leap.",
    leapTo: "Choose the Unit next to it to copy.",
    afterCard: "You can still Leap, or end your turn.",
    endNow: "Now end your turn.",
    wrong: "Not this one. Try again.",
    roundEnded: function (a, b) { return "The round ended " + a + "–" + b + "."; },
    win: function (a, b) { return "You win the round, " + a + "–" + b + "."; },
    working: "Working it out…",
    confirm: "This ends your streak. Show the answer?",
    revealToday: "Today doesn't count as solved, and your streak is over.",
    pastNote: "Earlier puzzles don't count toward your streak.",
    noStore: "This browser isn't saving your progress, so your streak won't be kept.",
    cantPlay: "Can't be played now.",
    solvedAlready: "You've solved today's puzzle.",
    boardAfter: "The board after your play, before the round is scored.",
    // no puzzle today (owner ruling 2026-10-14): before the first puzzle, and after a batch runs out
    firstArrives: function (when) { return "The first Daily Puzzle arrives on " + when + "."; },
    onItsWay: "A new puzzle is on its way. Try an earlier one below.",
  };

  var $ = function (id) { return document.getElementById(id); };
  var store = null;
  try { store = window.localStorage; store.getItem("dy_probe"); } catch (e) { store = null; }

  var state = D.load(store), now = Date.now();
  var list = [], P = null, isToday = false, today = D.utcDate(now);
  var g = null, mode = "idle", sel = null, cardPlayed = false, leapA = null, tries = 0, done = false;
  var actions = [];   // this try's moves (Leaps and the card), replayed to show the board as it stood before scoring

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function homeFaction(c) { for (var f in E.DECKS) if (E.DECKS[f].some(function (d) { return d.n === c.n; })) return f; return null; }
  function thumb(c) {
    var f = homeFaction(c); if (!f || c.ghost) return null;
    var type = c.t.charAt(0).toUpperCase() + c.t.slice(1), name = c.n.replace(/[^A-Za-z0-9]/g, ""), rar = RARITY_NAME[c.r];
    return ART + FAC[f] + "_" + type + "_" + name + (c.base > 0 ? "_P" + c.base : "") + "_r" + rar + ".png" + ART_V;
  }

  // ── one card tile: art, name, power, and its state in plain words ──
  function tile(c, pi, opts) {
    opts = opts || {};
    var b = el(opts.button ? "button" : "div", "dd-card" + (opts.cls ? " " + opts.cls : ""));
    if (opts.button) b.type = "button";
    b.setAttribute("data-uid", c.uid);
    var src = thumb(c);
    if (src) { var im = el("img"); im.src = src; im.alt = ""; im.onerror = function () { im.remove(); b.classList.add("dd-noart"); }; b.appendChild(im); }
    else b.classList.add("dd-noart");
    b.appendChild(el("span", "dd-name", c.n));
    if (pi != null) b.appendChild(el("span", "dd-pow", String(c.t === "unit" || c.t === "hero" ? E.effPower(g, pi, c) : "")));
    var tags = [];
    if (pi != null && c.t === "unit" && E.isShielded(g, pi, c)) tags.push("Shield");
    if (c.venom) tags.push("Venom " + c.venom);
    if (c.bound) tags.push("Bound");
    if (c.ghost) tags.push("Ghost");
    if (tags.length) b.appendChild(el("span", "dd-tags", tags.join(" · ")));
    if (opts.aria) b.setAttribute("aria-label", opts.aria);
    return b;
  }

  function sideBlock(pi) {
    var pl = g.players[pi], wrap = el("section", "dd-side " + (pi ? "dd-them" : "dd-you"));
    var head = el("div", "dd-sidehead");
    head.appendChild(el("span", "dd-who", pi ? "Opponent" : "You"));
    head.appendChild(el("span", "dd-total", String(E.totalPower(g, pi))));
    if (pl.passed) head.appendChild(el("span", "dd-passed", "Passed"));
    wrap.appendChild(head);
    if (pl.heroes.length || pl.artifact) {
      var top = el("div", "dd-row dd-heroes");
      pl.heroes.forEach(function (h) { top.appendChild(tile(h, pi, { cls: "dd-hero" })); });
      if (pl.artifact) top.appendChild(tile(pl.artifact, null, { cls: "dd-art" }));
      wrap.appendChild(top);
    }
    var row = el("div", "dd-row dd-units");
    var spec = (mode === "target" && sel != null) ? E.targetSpec(g, 0, g.players[0].hand[sel]) : null;
    var opts = spec ? spec.options : [];
    pl.units.forEach(function (u, i) {
      if (pi === 0 && mode === "slot") row.appendChild(slotBtn(i));
      var pickable = (mode === "target" && opts.indexOf(u) >= 0)
        || (pi === 0 && mode === "leapFrom" && !u.ghost && leapTargets(u).length)
        || (pi === 0 && mode === "leapTo" && leapA && leapTargets(leapA).indexOf(u) >= 0);
      var t = tile(u, pi, { button: pickable, cls: pickable ? "dd-pick" : (pi === 0 && mode === "leapTo" && u === leapA ? "dd-chosen" : "") });
      if (pickable) t.addEventListener("click", function () { onBoardPick(u); });
      row.appendChild(t);
    });
    if (pi === 0 && mode === "slot") row.appendChild(slotBtn(pl.units.length));
    if (!pl.units.length && !(pi === 0 && mode === "slot")) row.appendChild(el("span", "dd-empty", "No Units"));
    wrap.appendChild(row);
    // heroes can be targets too (Sudarshana Chakra)
    if (mode === "target") wrap.querySelectorAll(".dd-hero").forEach(function (n) {
      var h = pl.heroes.filter(function (x) { return String(x.uid) === n.getAttribute("data-uid"); })[0];
      if (h && opts.indexOf(h) >= 0) { var b = tile(h, pi, { button: true, cls: "dd-hero dd-pick" }); b.addEventListener("click", function () { onBoardPick(h); }); n.replaceWith(b); }
    });
    return wrap;
  }
  function slotBtn(i) { var b = el("button", "dd-slot", "Place it here"); b.type = "button"; b.setAttribute("aria-label", "Place it here"); b.addEventListener("click", function () { commitPlay(null, i); }); return b; }

  function leapTargets(u) {
    var pl = g.players[0];
    if (pl.faction !== "vanaras" || pl.leapsUsed >= E.leapLimit(pl) || u.ghost) return [];
    return E.adjacentUnits(pl, u).filter(function (t) { return !t.ghost; });
  }
  function canLeapNow() { var pl = g.players[0]; return pl.faction === "vanaras" && pl.units.some(function (u) { return leapTargets(u).length; }); }

  function render() {
    var game = $("dd-game"); game.innerHTML = "";
    var info = E.REALM_INFO[g.realm];
    var top = el("div", "dd-realm");
    top.appendChild(el("span", "dd-realmname", info.name));
    top.appendChild(el("span", "dd-realmfx", info.fx));
    game.appendChild(top);
    game.appendChild(el("p", "dd-round", "Round " + g.round + " · Rounds won: you " + g.players[0].roundWins + ", opponent " + g.players[1].roundWins));
    game.appendChild(sideBlock(1));
    game.appendChild(sideBlock(0));
    // your hand
    var hand = el("section", "dd-hand"), legal = E.playableIndices(g, 0);
    hand.appendChild(el("div", "dd-sidehead", null)).appendChild(el("span", "dd-who", "Your hand"));
    var row = el("div", "dd-row");
    g.players[0].hand.forEach(function (c, i) {
      var ok = !done && !cardPlayed && legal.indexOf(i) >= 0;
      var t = tile(c, null, { button: true, cls: (ok ? "" : "dd-off") + (sel === i ? " dd-chosen" : "") });
      if (!ok) { t.disabled = true; if (!cardPlayed && !done) t.appendChild(el("span", "dd-tags", T.cantPlay)); }
      else t.addEventListener("click", function () { onHandPick(i); });
      row.appendChild(t);
    });
    hand.appendChild(row);
    game.appendChild(hand);
    renderActions();
  }

  function btn(text, cls, fn) { var b = el("button", "dd-btn " + (cls || ""), text); b.type = "button"; b.addEventListener("click", fn); return b; }
  function renderActions() {
    var a = $("dd-actions"); a.innerHTML = "";
    var d = $("dd-detail"); d.innerHTML = ""; d.hidden = true;
    if (done) return;
    if (sel != null && mode === "card") {
      var c = g.players[0].hand[sel];
      d.hidden = false;
      d.appendChild(el("p", "dd-detname", c.n));
      d.appendChild(el("p", "dd-dettext", c.txt));
      a.appendChild(btn("Play " + c.n, "dd-go", function () { startPlay(); }));
      a.appendChild(btn("Cancel", "", reset0));
      return;
    }
    if (mode === "target" || mode === "slot" || mode === "leapFrom" || mode === "leapTo") { a.appendChild(btn("Cancel", "", cancelStep)); return; }
    if (!cardPlayed) {
      if (canLeapNow()) a.appendChild(btn("Leap", "", function () { mode = "leapFrom"; say(T.leapFrom); render(); }));
      a.appendChild(btn("Pass without playing", "", function () { finish(); }));
    } else {
      if (canLeapNow()) a.appendChild(btn("Leap", "", function () { mode = "leapFrom"; say(T.leapFrom); render(); }));
      a.appendChild(btn("End my turn", "dd-go", function () { finish(); }));
    }
    if (tries > 0 && !revealed()) a.appendChild(btn("Show me the answer", "dd-reveal", askReveal));
  }

  function say(t, cls) { var m = $("dd-msg"); m.textContent = t; m.className = cls || ""; }
  function onHandPick(i) { if (done || cardPlayed) return; sel = i; mode = "card"; say(T.instruction); render(); }
  function startPlay() {
    var c = g.players[0].hand[sel], spec = E.targetSpec(g, 0, c);
    if (spec && spec.options && spec.options.length) { mode = "target"; say(T.chooseTarget); render(); return; }
    if (c.t === "unit" && g.players[0].faction === "vanaras" && g.players[0].units.length) { mode = "slot"; say(T.chooseSlot); render(); return; }
    commitPlay(null, null);
  }
  function onBoardPick(u) {
    if (mode === "target") { commitPlay(u.uid, null); return; }
    if (mode === "leapFrom") { leapA = u; mode = "leapTo"; say(T.leapTo); render(); return; }
    if (mode === "leapTo") { actions.push({ leap: [g.players[0].units.indexOf(leapA), g.players[0].units.indexOf(u)] });
      E.doLeap(g, 0, leapA, u, false); E.sweepDeaths(g); leapA = null; mode = "idle"; say(cardPlayed ? (canLeapNow() ? T.afterCard : T.endNow) : T.instruction); render(); }
  }
  function commitPlay(targetUid, pos) {
    var idx = sel;
    var c = g.players[0].hand[idx];
    var after = c.t === "unit" && g.players[0].faction === "vanaras" && g.players[0].units.length && pos == null ? g.players[0].units.length : pos;
    actions.push({ play: idx, target: targetUid == null ? null : ownerIndex(targetUid), pos: after });
    E.playCard(g, 0, idx, targetUid, after);
    cardPlayed = true; sel = null; mode = "idle";
    if (canLeapNow()) { say(T.afterCard); render(); } else finish();
  }
  function cancelStep() { leapA = null; mode = sel != null ? "card" : "idle"; say(T.instruction); render(); }
  function reset0() { sel = null; mode = "idle"; say(T.instruction); render(); }

  // ── the engine scores the round ──
  function finish() {
    var round = g.round;
    if (!g.over && g.round === round && g.turn === 0 && !g.players[0].passed) E.pass(g, 0);
    var h = g.roundHistory.filter(function (x) { return x.round === round; })[0];
    if (h && h.winner === 0) return onWin(h);
    tries++;
    say(T.wrong + " " + T.roundEnded(h ? h.t0 : 0, h ? h.t1 : 0), "dd-bad");
    fresh();
    render();
  }
  function fresh() { g = PZ.load(P, E, 1); mode = "idle"; sel = null; cardPlayed = false; leapA = null; actions = []; }
  // a target as (side, zone, index) so the same move can be replayed on a freshly built position
  function ownerIndex(uid) {
    for (var s = 0; s < 2; s++) { var p = g.players[s];
      var i = p.units.findIndex(function (u) { return u.uid === uid; }); if (i >= 0) return [s, "units", i];
      var h = p.heroes.findIndex(function (u) { return u.uid === uid; }); if (h >= 0) return [s, "heroes", h]; }
    return null;
  }
  function replay(list) {
    var gg = PZ.load(P, E, 1);
    list.forEach(function (a) {
      if (a.leap) { var u = gg.players[0].units; E.doLeap(gg, 0, u[a.leap[0]], u[a.leap[1]], false); E.sweepDeaths(gg); return; }
      var t = a.target ? gg.players[a.target[0]][a.target[1]][a.target[2]].uid : null;
      E.playCard(gg, 0, a.play, t, a.pos);
    });
    return gg;
  }

  function onWin(h) {
    done = true;
    say(T.win(h.t0, h.t1), "dd-good");
    if (isToday) { D.markSolved(state, P.date, today); D.save(store, state); }
    g = replay(actions);                        // show the board as your play left it, not the next round's empty field
    render();
    var note = el("p", "dd-boardnote", T.boardAfter); $("dd-game").insertBefore(note, $("dd-game").firstChild);
    showAfter(false);
  }

  function revealed() { return isToday && !!state.revealed[today]; }
  function askReveal() {
    if (!isToday || state.solved[today]) { doReveal(); return; }
    var m = $("dd-confirm"); m.hidden = false; $("dd-confirm-yes").focus();
  }
  function doReveal() {
    $("dd-confirm").hidden = true;
    say(T.working);
    setTimeout(function () {
      var r = PZ.solve(P, E, null);
      var w = r.ok ? r.winners[0] : null;
      if (isToday) { D.markRevealed(state, P.date, today); D.save(store, state); }
      done = true; fresh(); render();
      say(w ? winningLine(w) : "", "dd-good");
      showAfter(true);
    }, 30);
  }
  // the winning play in plain words, from the solver's line (card, target, and any Leap with the Units' names)
  function winningLine(w) {
    var s = "The winning play: " + w.play + (w.target ? " on " + w.target.replace(/#\d+$/, "") : "") + ".";
    var L = w.line, leaps = [];
    if (L && (L.before.length || L.after.length)) {
      var gg = PZ.load(P, E, 1), u = gg.players[0].units;
      L.before.forEach(function (pr) { leaps.push("before it, " + u[pr[0]].n + " Leaps onto " + u[pr[1]].n); });
      if (L.after.length) {
        var i = gg.players[0].hand.findIndex(function (c) { return c.n === w.play; });
        E.playCard(gg, 0, i, null, L.pos); u = gg.players[0].units;
        L.after.forEach(function (pr) { leaps.push("after it, " + u[pr[0]].n + " Leaps onto " + u[pr[1]].n); });
      }
      s += " Then use your free Leap: " + leaps.join("; ") + ".";
    }
    return s;
  }

  function showAfter(byReveal) {
    var a = $("dd-after"); a.hidden = false;
    var note = NOTES[P.id] ? D.decodeNote(P.id, NOTES[P.id]) : "";
    $("dd-explain").textContent = note;
    var lines = [];
    if (byReveal && isToday) lines.push(T.revealToday);
    if (!isToday) lines.push(T.pastNote);
    $("dd-afternote").textContent = lines.join(" ");
    renderStreak();
  }
  function renderStreak() {
    $("dd-streak").textContent = String(D.streak(state, today));
    $("dd-best").textContent = String(state.best || 0);
    $("dd-next").textContent = D.countdown(Date.now());
  }

  function renderPast(past) {
    var box = $("dd-past"), ul = $("dd-pastlist"); ul.innerHTML = "";
    box.hidden = !past.length;
    past.forEach(function (p) {
      var li = el("li"), a = el("a", null, p.date + " · " + p.title);
      a.href = "?d=" + p.date;
      if (state.solved[p.date] && !state.revealed[p.date]) li.appendChild(el("span", "dd-tick", "Solved on the day"));
      li.insertBefore(a, li.firstChild);
      ul.appendChild(li);
    });
  }

  // no puzzle today: before the first one, say when it arrives (from the data, never hard-coded); otherwise point to
  // the earlier puzzles. The day name and date are read in UTC, the puzzle's own calendar.
  function noPuzzle(v) {
    var first = list.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    var none = $("dd-none"); none.innerHTML = "";
    var line = (first && v.today < first.date) ? T.firstArrives(dayName(first.date)) : T.onItsWay;
    none.appendChild(el("p", "dd-noneline", line));
    none.hidden = false; $("dd-play").hidden = true;
  }
  function dayName(date) {
    var d = new Date(date + "T00:00:00Z");
    var W = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return W[d.getUTCDay()] + " " + d.getUTCDate() + " " + M[d.getUTCMonth()];
  }

  function start(puzzles) {
    list = puzzles;
    var q = null; try { q = new URLSearchParams(location.search).get("d"); } catch (e) {}
    var v = D.visible(list, now), pk = D.pick(list, now, q);
    P = pk.puzzle; isToday = pk.isToday;
    renderPast(v.past.filter(function (p) { return !P || p.date !== P.date; }));
    if (!store) $("dd-store").textContent = T.noStore;
    if (!P) { noPuzzle(v); return; }
    $("dd-play").hidden = false;
    $("dd-date").textContent = P.date + (isToday ? "" : " · an earlier puzzle");
    $("dd-ptitle").textContent = P.title;
    $("dd-diff").textContent = P.difficulty;
    g = PZ.load(P, E, 1);
    if (isToday && state.solved[today]) { done = true; say(T.solvedAlready, "dd-good"); render(); showAfter(false); return; }
    if (isToday && state.revealed[today]) { done = true; render(); var r = PZ.solve(P, E, null); say(r.ok ? winningLine(r.winners[0]) : "", "dd-good"); showAfter(true); return; }
    say(T.instruction);
    render();
  }

  $("dd-confirm-yes").addEventListener("click", doReveal);
  $("dd-confirm-no").addEventListener("click", function () { $("dd-confirm").hidden = true; });
  setInterval(function () { if (!$("dd-after").hidden) renderStreak(); }, 30000);

  // the batch is shipped as data next to the page
  fetch("puzzles.json?v=" + (window.DY_DAILY_V || "1"), { cache: "no-cache" }).then(function (r) { return r.json(); }).then(start)
    .catch(function () { $("dd-none").hidden = false; $("dd-play").hidden = true; });

  window.__DY_DAILY_PAGE = { get g() { return g; }, E: E };   // read-only handle for the page tests
})();
