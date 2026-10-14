/* MINI-GAMES-1 R2 — THE DAILY PUZZLE'S RULES OF THE DAY (no DOM). UMD: browser `window.DY_DAILY`, Node `require`.
 *
 * Owner rulings (2026-10-14):
 *  - One puzzle per UTC day: the new puzzle arrives at 00:00 UTC, the same puzzle on the same date worldwide.
 *  - Unlimited tries. Solving TODAY's puzzle on its own date counts; the streak is consecutive days solved.
 *  - "Show me the answer" on today's puzzle: that day is NOT solved and the streak ENDS (same as missing a day).
 *  - Earlier puzzles of the batch may be played for fun; they never touch the streak. Future puzzles are never reachable.
 *  - Streak and best streak live in this browser only; every storage read/write is wrapped, and the page works with
 *    storage blocked (progress simply isn't kept).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DY_DAILY = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAY_MS = 86400000;
  var STORE_KEY = "dy_daily_v1";

  // the UTC calendar date of a moment, as YYYY-MM-DD — never the player's local date
  function utcDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(date, n) { return utcDate(Date.parse(date + "T00:00:00Z") + n * DAY_MS); }
  function nextUtcMidnight(ms) { return (Math.floor(ms / DAY_MS) + 1) * DAY_MS; }

  // what the page may show at `ms`: today's puzzle (or none) and the earlier ones — never a later one
  function visible(list, ms) {
    var today = utcDate(ms);
    var past = list.filter(function (p) { return p.date < today; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return { today: today, puzzle: list.filter(function (p) { return p.date === today; })[0] || null, past: past };
  }
  // the puzzle a request asks for (?d=YYYY-MM-DD): today's, or an EARLIER one of the batch; anything else → today's
  function pick(list, ms, wanted) {
    var v = visible(list, ms);
    if (wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) && wanted < v.today) {
      var p = list.filter(function (x) { return x.date === wanted; })[0];
      if (p) return { puzzle: p, isToday: false, today: v.today };
    }
    return { puzzle: v.puzzle, isToday: !!v.puzzle, today: v.today };
  }

  // ── storage: every touch wrapped — a blocked or broken store means "nothing remembered", never an error ──
  function blank() { return { v: 1, solved: {}, revealed: {}, best: 0 }; }
  function load(storage) {
    try {
      var raw = storage && storage.getItem(STORE_KEY);
      if (!raw) return blank();
      var s = JSON.parse(raw);
      var obj = function (x) { return !!x && typeof x === "object" && !Array.isArray(x); };   // typeof null is "object": check for real
      if (!obj(s) || !obj(s.solved) || !obj(s.revealed)) return blank();
      s.best = Number(s.best) || 0;
      return s;
    } catch (e) { return blank(); }
  }
  function save(storage, s) {
    try { if (storage) { storage.setItem(STORE_KEY, JSON.stringify(s)); return true; } } catch (e) {}
    return false;
  }

  // ── the streak: consecutive UTC days solved on their own date, counted back from today (or from yesterday while
  //    today is still open). A revealed day or a missed day ends it. ──
  function streak(s, today) {
    var d = s.solved[today] && !s.revealed[today] ? today : addDays(today, -1);
    if (s.revealed[today]) return 0;
    var n = 0;
    while (s.solved[d] && !s.revealed[d]) { n++; d = addDays(d, -1); }
    return n;
  }
  // a winning play — only today's puzzle on today's date counts, and never once revealed
  function markSolved(s, date, today) {
    if (date !== today || s.revealed[today]) return false;
    s.solved[today] = true;
    s.best = Math.max(s.best || 0, streak(s, today));
    return true;
  }
  // "Show me the answer" — today's puzzle: the day is not solved and the streak ends; an earlier puzzle: no effect
  function markRevealed(s, date, today) {
    if (date !== today) return false;
    if (s.solved[today]) return false;          // already solved today: showing the explanation costs nothing
    s.revealed[today] = true;
    return true;
  }

  // ── explanations: XOR-masked + base64. Stops ACCIDENTAL spoilers only — the decoder ships with the page. ──
  function keyBytes(id) { var k = "dy·" + id + "·daily"; var b = []; for (var i = 0; i < k.length; i++) b.push(k.charCodeAt(i) & 255); return b; }
  // UTF-8 by hand (no TextEncoder/TextDecoder/Buffer needed — works in every browser and in Node alike)
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.codePointAt(i);
      if (c > 0xffff) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function fromUtf8(b) {
    var s = "";
    for (var i = 0; i < b.length;) {
      var c = b[i++];
      if (c >= 0xf0) c = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
      else if (c >= 0xe0) c = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
      else if (c >= 0xc0) c = ((c & 31) << 6) | (b[i++] & 63);
      s += String.fromCodePoint(c);
    }
    return s;
  }
  function b64(bytes) {
    if (typeof btoa !== "undefined") { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
    return Buffer.from(bytes).toString("base64");
  }
  function unb64(str) {
    if (typeof atob !== "undefined") { var s = atob(str), out = []; for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); return out; }
    return Array.prototype.slice.call(Buffer.from(str, "base64"));
  }
  function mask(bytes, id) { var k = keyBytes(id); return bytes.map(function (b, i) { return b ^ k[i % k.length]; }); }
  function encodeNote(id, text) { return b64(mask(utf8(text), id)); }
  function decodeNote(id, blob) { try { return fromUtf8(mask(unb64(blob), id)); } catch (e) { return ""; } }

  // "7h 12m" until the next puzzle
  function countdown(ms) {
    var left = Math.max(0, nextUtcMidnight(ms) - ms);
    var h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000);
    return h + "h " + (m < 10 ? "0" : "") + m + "m";
  }

  return { STORE_KEY: STORE_KEY, utcDate: utcDate, addDays: addDays, nextUtcMidnight: nextUtcMidnight, visible: visible, pick: pick,
    load: load, save: save, blank: blank, streak: streak, markSolved: markSolved, markRevealed: markRevealed,
    encodeNote: encodeNote, decodeNote: decodeNote, countdown: countdown };
});
