/* GROW-COUNT-1 · the owner's player view (owner rulings 3–5, 2026-11-03). Everything shown is the counter's own report
   (dy-count GET /owner/summary), drawn with textContent only; every table downloads as the counter's CSV. Days are UTC. */
(function () {
  "use strict";
  var O = window.DY_OWNER, $ = function (id) { return document.getElementById(id); };
  var token = function () { var t = O.saved(); return t ? t.token : ""; };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  var pct = function (r) { return r == null ? "—" : (Math.round(r * 1000) / 10) + "%"; };
  var day = function (ms) { return new Date(ms).toISOString().slice(0, 10); };

  function table(head, rows, sumRow) {
    var w = el("div", "ow-tablewrap"), t = el("table", "ow-table"), th = el("thead"), tr = el("tr");
    head.forEach(function (h) { tr.appendChild(el("th", null, h)); }); th.appendChild(tr); t.appendChild(th);
    var tb = el("tbody");
    rows.forEach(function (r) { var x = el("tr"); r.forEach(function (c) { var td = el("td", c && c.cls, c && c.t != null ? c.t : c); x.appendChild(td); }); tb.appendChild(x); });
    if (sumRow) { var s = el("tr", "ow-sum"); sumRow.forEach(function (c) { s.appendChild(el("td", null, c)); }); tb.appendChild(s); }
    t.appendChild(tb); w.appendChild(t); return w;
  }
  // rows of {key, s, n} → a pivot: one row per key, one column per source, a total column and a total row
  function pivot(list, keyName, label) {
    if (!list.length) return el("p", "ow-empty", "Nothing yet in this range.");
    var keys = [], srcs = [], m = {};
    list.forEach(function (x) { var k = x[keyName]; if (keys.indexOf(k) < 0) keys.push(k); if (srcs.indexOf(x.s) < 0) srcs.push(x.s); m[k + "|" + x.s] = (m[k + "|" + x.s] || 0) + x.n; });
    keys.sort(); srcs.sort();
    var rows = keys.map(function (k) { var tot = 0; var r = [k].concat(srcs.map(function (s) { var v = m[k + "|" + s] || 0; tot += v; return String(v); })); r.push(String(tot)); return r; });
    var sum = ["Total"].concat(srcs.map(function (s) { return String(keys.reduce(function (a, k) { return a + (m[k + "|" + s] || 0); }, 0)); }));
    sum.push(String(list.reduce(function (a, x) { return a + x.n; }, 0)));
    return table([label].concat(srcs, ["All"]), rows, sum);
  }
  function section(id, title, csvTable, body, note) {
    var box = $(id); box.innerHTML = "";
    var h = el("h2", null, title); box.appendChild(h);
    if (note) box.appendChild(el("p", "hint", note));
    box.appendChild(body);
    if (csvTable) { var b = el("button", "btn ow-csv", "Download CSV"); b.type = "button"; b.addEventListener("click", function () { csv(csvTable); }); box.appendChild(b); }
  }
  function range() { return "from=" + encodeURIComponent($("ow-from").value) + "&to=" + encodeURIComponent($("ow-to").value); }
  function csv(name) {
    O.api("/owner/csv?table=" + name + "&" + range()).then(function (r) {
      if (r.status === 401) { O.expired(); return; }
      if (!r.ok) throw new Error(String(r.status));
      return r.blob().then(function (b) { var a = el("a"); a.href = URL.createObjectURL(b); a.download = "dy-count-" + name + "-" + $("ow-from").value + "-to-" + $("ow-to").value + ".csv"; document.body.appendChild(a); a.click(); a.remove(); });
    }).catch(function (e) { O.status("st-err", "The CSV did not download (" + e.message + ")."); });
  }
  function draw(R) {
    $("ow-lifetime").textContent = String(R.lifetime_players);
    $("ow-asof").textContent = "Players counted, all time (UTC days; this range " + R.from + " to " + R.to + ").";
    section("ow-day", "New players by day", "players_by_day", pivot(R.players_by_day, "day", "Day"), "A player is a browser that finished its first match, story chapter, Hall match, Daily Puzzle or Smriti board. Columns are first-touch sources.");
    section("ow-week", "New players by week", "players_by_week", pivot(R.players_by_week, "week", "Week of (Mon)"));
    section("ow-conv", "Visits → players, by source", "conversion", R.conversion.length ? table(["Source", "First visits", "Became players", "Rate"],
      R.conversion.map(function (x) { return [x.s, String(x.visits), String(x.players), pct(x.rate)]; })) : el("p", "ow-empty", "No first visits in this range."),
      "Of the browsers that first arrived in this range, how many went on to finish a game.");
    section("ow-ret", "Return, by source", "returns", R.returns.length ? table(["Source", "Players", "Day 1", "Exactly day 7", "Any day 7–13"],
      R.returns.map(function (x) { return [x.s, String(x.players), pct(x.d1_rate) + " (" + x.d1 + "/" + x.d1_base + ")", pct(x.d7_rate) + " (" + x.d7 + "/" + x.d7_base + ")", pct(x.d7_13_rate) + " (" + x.d7_13 + "/" + x.d7_13_base + ")"]; })) : el("p", "ow-empty", "No players in this range."),
      "Counted over players old enough to have had the chance (a player from yesterday is not in the day-7 figures yet).");
    section("ow-share", "Shares by day", "shares_by_day", pivot(R.shares_by_day, "day", "Day"));
    section("ow-wallet", "Wallet connects by day", "wallets_by_day", pivot(R.wallets_by_day, "day", "Day"), "Once per player. The counter never sees the address.");
    section("ow-flags", "Sources to look at", "flags", R.flags.length ? table(["Source", "Players", "Day 1", "Median secs to first finish", "Players with no visit", "Why"],
      R.flags.map(function (x) { return [x.s, String(x.players), pct(x.d1_rate), x.median_secs == null ? "—" : String(Math.round(x.median_secs)), String(x.no_visit), { t: x.why.join(", "), cls: "ow-flag" }]; })) : el("p", "ow-empty", "No source looks like bot traffic in this range."),
      "no-return: under 2% back the next day · too-fast: first finish under 20 s after arriving · no-visit: most of its players never sent a first visit (sent by hand). Judged once a source has 20 players.");
  }
  function load() {
    O.status("st-info", "Reading the counter…");
    O.api("/owner/summary?" + range()).then(function (r) {
      if (r.status === 401) { O.expired(); return null; }
      if (!r.ok) throw new Error("the counter answered " + r.status);
      return r.json();
    }).then(function (R) { if (R) { draw(R); O.status("st-ok", "Signed in as the owner. Read " + new Date().toISOString().slice(11, 16) + " UTC."); } })
      .catch(function (e) { O.status("st-err", /fetch|Network|Load failed/i.test(e.message) ? "Can't reach the counter at " + O.BASE + "." : "The report did not load (" + e.message + ")."); });
  }
  O.gate(function () {
    var now = Date.now();
    $("ow-to").value = day(now); $("ow-from").value = day(now - 59 * 86400000);
    $("ow-reload").addEventListener("click", load);
    load();
  });
})();
