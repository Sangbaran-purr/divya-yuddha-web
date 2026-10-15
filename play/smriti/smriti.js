/* MINI-GAMES-2 · SMRITI — R1: THE RULES AND THE DATA (pool · deal · matching · tries · best · storage).
 * UMD: browser `window.DY_SMRITI`, Node `require`. No DOM, no network, no randomness except a seeded generator.
 *
 * Memory match. Turn two cards at a time; a pair stays face up, two different cards turn back. One TRY = turning two cards.
 * BEST = the fewest tries per level, kept only in this browser.
 *
 * THE POOL is every card of the game (the engine's DECKS — current names only) that has art. "Has art" is a predicate the
 * caller supplies: the page learns it from the thumbnails themselves (a card whose picture fails to load is set aside and
 * the board is dealt again), so a card joins the pool by itself the day its art is published — nothing here names it.
 * THE ANIMATED CARDS are the Heroes and Meghnad (an Asura Unit): flipping one plays its animation. Every board holds at
 * least one animated pair.
 * Free: no wallet, no Torana, no DYC, no badges, no public leaderboard.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DY_SMRITI = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LEVELS = { easy: 6, medium: 8, hard: 12 };          // pairs per board (12, 16, 24 cards)
  var LEVEL_ORDER = ["easy", "medium", "hard"];
  var ANIMATED_UNITS = ["meghnad"];                        // the one non-Hero card that animates
  var STORE_KEY = "dy_smriti";
  var FACTIONS = { devas: "Devas", asuras: "Asuras", vanaras: "Vanaras", nagas: "Nagas" };
  var RARITY = { L: "Legendary", M: "Mythic", E: "Epic", R: "Rare", U: "Uncommon", C: "Common" };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rng) { var a = list.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function isAnimated(card) { return !!card && (card.t === "hero" || ANIMATED_UNITS.indexOf(card.id) >= 0); }

  // every card of the game, with the facts the board needs (the engine's DECKS, never a copied list)
  function cardsFrom(DECKS) {
    var out = [];
    Object.keys(DECKS).forEach(function (f) { DECKS[f].forEach(function (c) { out.push({ id: c.id, n: c.n, sub: c.sub || "", t: c.t, p: c.p, r: c.r, f: f }); }); });
    return out;
  }
  // the thumbnail's file name — the game's own art naming law (CLAUDE.md: Faction_Type_Name[_P{power}]_r{Rarity}.png)
  function artName(c) {
    return FACTIONS[c.f] + "_" + c.t.charAt(0).toUpperCase() + c.t.slice(1) + "_" + c.n.replace(/[^A-Za-z0-9]/g, "") + (c.p > 0 ? "_P" + c.p : "") + "_r" + RARITY[c.r] + ".png";
  }
  function poolOf(cards, hasArt) { return cards.filter(function (c) { return !hasArt || hasArt(c); }); }

  // THE DEAL: one animated card first (the rule), then the other pairs from the rest of the pool; two copies of each,
  // shuffled. The same pool, level and seed always give the same board.
  function deal(pool, level, seed) {
    var n = LEVELS[level];
    if (!n) throw new Error("unknown level " + level);
    var anim = pool.filter(isAnimated);
    if (!anim.length) throw new Error("no animated card in the pool");
    if (pool.length < n) throw new Error("the pool is too small for " + level);
    var rng = mulberry32(seed >>> 0);
    var first = anim[Math.floor(rng() * anim.length)];
    var rest = shuffle(pool.filter(function (c) { return c !== first; }), rng).slice(0, n - 1);
    var chosen = [first].concat(rest);
    var tiles = [];
    chosen.forEach(function (c) { tiles.push(c, c); });
    return shuffle(tiles, rng).map(function (c, i) { return { i: i, id: c.id, card: c }; });
  }

  // THE GAME: tiles face down; flip one, flip a second (that is one try), a pair stays up, two different cards wait to turn back
  function start(tiles, level) {
    return { level: level, pairs: tiles.length / 2, tiles: tiles.map(function (t) { return { i: t.i, id: t.id, card: t.card, up: false, matched: false }; }),
             open: [], tries: 0, found: 0, done: false };
  }
  function canFlip(s, i) {
    var t = s.tiles[i];
    return !!t && !s.done && !t.up && !t.matched && s.open.length < 2;
  }
  // → null when the flip is not allowed; else { kind: "first" | "match" | "miss", tile }
  function flip(s, i) {
    if (!canFlip(s, i)) return null;
    var t = s.tiles[i];
    t.up = true; s.open.push(i);
    if (s.open.length === 1) return { kind: "first", tile: t };
    s.tries++;
    var a = s.tiles[s.open[0]], b = s.tiles[s.open[1]];
    if (a.id === b.id) {
      a.matched = b.matched = true; s.open = []; s.found++;
      if (s.found === s.pairs) s.done = true;
      return { kind: "match", tile: t };
    }
    return { kind: "miss", tile: t };
  }
  // two different cards turn back face down
  function turnBack(s) {
    if (s.open.length !== 2) return false;
    s.open.forEach(function (i) { s.tiles[i].up = false; });
    s.open = [];
    return true;
  }

  // BEST, in this browser only. Every read and write is guarded: blocked or corrupt storage is an empty record, never an error.
  function blank() { return { v: 1, best: {} }; }
  function clean(r) {
    var out = blank();
    if (r && typeof r === "object" && r.best && typeof r.best === "object" && !Array.isArray(r.best)) {
      LEVEL_ORDER.forEach(function (lv) { var v = r.best[lv]; if (Number.isInteger(v) && v >= LEVELS[lv] && v < 100000) out.best[lv] = v; });
    }
    return out;
  }
  function load(store) { try { if (!store) return blank(); var raw = store.getItem(STORE_KEY); return raw ? clean(JSON.parse(raw)) : blank(); } catch (e) { return blank(); } }
  function save(store, rec) { try { if (!store) return false; store.setItem(STORE_KEY, JSON.stringify(clean(rec))); return true; } catch (e) { return false; } }
  // a finished game: the best only ever improves (fewer tries). → true when this game set a new best
  function recordBest(rec, level, tries) {
    if (!LEVELS[level] || !Number.isInteger(tries) || tries < LEVELS[level]) return false;
    var old = rec.best[level];
    if (old != null && tries >= old) return false;
    rec.best[level] = tries;
    return true;
  }

  return { LEVELS: LEVELS, LEVEL_ORDER: LEVEL_ORDER, ANIMATED_UNITS: ANIMATED_UNITS, STORE_KEY: STORE_KEY, mulberry32: mulberry32,
           isAnimated: isAnimated, cardsFrom: cardsFrom, artName: artName, poolOf: poolOf, deal: deal,
           start: start, canFlip: canFlip, flip: flip, turnBack: turnBack, blank: blank, load: load, save: save, recordBest: recordBest };
});
