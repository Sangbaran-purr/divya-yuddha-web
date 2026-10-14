"use strict";
// MINI-GAMES-1 R2 — THE DAILY PUZZLE PAGE (/play/daily/). The real page, run in jsdom with its real scripts (the site's
// engine copy, puzzle-core, the day rules, the encoded notes, the page), a controlled clock and a controlled store.
// No chain, no network. What it must catch, by name:
//   - the wrong puzzle for the UTC date (around 00:00 UTC, and for players in UTC+5:30 and UTC-8)
//   - a win that doesn't mark the day solved or extend the streak; a wrong play that does
//   - a reveal that counts as solved or keeps the streak; a missed day that keeps it
//   - a page that breaks when storage is blocked
//   - a future puzzle reachable by any road
//   - an in-browser solver that disagrees with the offline one
//   - a plain answer or a plain explanation anywhere in the served files
const path = require("path"), fs = require("fs"), { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");
const H = require("../lib.js");
const SITE = H.SITE, DIR = path.join(SITE, "play", "daily");
const E = require(path.join(SITE, "game", "src", "engine.js"));
const PZ = require(path.join(DIR, "puzzle-core.js"));
const D = require(path.join(DIR, "daily.js"));
const NOTES = require(path.join(DIR, "notes.js"));
const PUZZLES = JSON.parse(fs.readFileSync(path.join(DIR, "puzzles.json"), "utf8"));
const FP = JSON.parse(fs.readFileSync(path.join(SITE, "tests", "fixtures", "daily-answers.sha256.json"), "utf8"));
const { answerDigest } = require(path.join(SITE, "scripts", "puzzle-answer-digest.js"));

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const R = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── the real page, scripts inlined in order (classic scripts share one global scope, as in a browser) ──
const HTML = R("play/daily/index.html");
function pageAt(iso, opts) {
  opts = opts || {};
  let html = HTML.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.resolve(DIR, src.split("?")[0]);
    return "<script>" + fs.readFileSync(f, "utf8").replace(/<\/script/g, "<\\/script") + "</script>";
  });
  const fixed = Date.parse(iso);
  const pre = "<script>(function(){var t=" + fixed + ";Date.now=function(){return t;};})();"
    + "window.fetch=function(){return Promise.resolve({json:function(){return Promise.resolve(" + JSON.stringify(opts.puzzles || PUZZLES) + ");}});};</script>";
  html = html.replace("<head>", "<head>" + pre);
  const url = "https://divyayuddha.games/play/daily/" + (opts.q || "");
  const dom = new JSDOM(html, { url: url, runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(win) {
      if (opts.blocked) Object.defineProperty(win, "localStorage", { get() { throw new Error("SecurityError: storage blocked"); } });
      else if (opts.store) Object.keys(opts.store).forEach((k) => win.localStorage.setItem(k, opts.store[k]));
      win.setInterval = function () { return 0; };                              // no live countdown timers in a test
    } });
  return dom;
}
const doc = (dom) => dom.window.document;
const msg = (dom) => doc(dom).getElementById("dd-msg").textContent;
function click(dom, sel, txt) {
  const b = [...doc(dom).querySelectorAll(sel)].find((x) => !txt || x.textContent.indexOf(txt) >= 0);
  if (!b) throw new Error("nothing to click: " + sel + " " + (txt || ""));
  b.click();
}
function play(dom, card, opts) {
  opts = opts || {};
  click(dom, ".dd-hand .dd-card", card); click(dom, "#dd-actions .dd-btn", "Play " + card);
  if (opts.target) click(dom, ".dd-pick", opts.target);
  if (opts.slot != null) doc(dom).querySelectorAll(".dd-slot")[opts.slot].click();
}
const stored = (dom) => { try { return JSON.parse(dom.window.localStorage.getItem(D.STORE_KEY) || "null"); } catch (e) { return null; } };
// the winning play for a puzzle, found by the solver here (this file names none)
const winnerOf = (P) => PZ.solve(P, E, null).winners[0];
const loserOf = (P) => PZ.solve(P, E, null).plays.find((p) => !p.win && p.play && !p.target);
const byDate = (d) => PUZZLES.find((p) => p.date === d);

async function section(name, fn) { try { await fn(); } catch (e) { ok(name + " — ran to the end", false, String(e && e.message)); } }
async function main() {
  console.log("── MINI-GAMES-1 · R2 · the Daily Puzzle page ──");

  // ═══ THE DATE: UTC, for everyone ═══
  ok("T1 · 23:59:59 UTC on 19 Oct is still 19 Oct's puzzle; 00:00:00 UTC on 20 Oct is the next one",
    D.visible(PUZZLES, Date.parse("2026-10-19T23:59:59Z")).puzzle.date === "2026-10-19" && D.visible(PUZZLES, Date.parse("2026-10-20T00:00:00Z")).puzzle.date === "2026-10-20");
  const inZone = (tz, local) => execFileSync(process.execPath, ["-e",
    "const D=require(" + JSON.stringify(path.join(DIR, "daily.js")) + ");const L=require(" + JSON.stringify(path.join(DIR, "puzzles.json")) + ");"
    + "const ms=new Date(" + JSON.stringify(local) + ").getTime();process.stdout.write(D.visible(L,ms).puzzle.date+' '+new Date(ms).toISOString())"],
    { env: Object.assign({}, process.env, { TZ: tz }), encoding: "utf8" });
  const ist = inZone("Asia/Kolkata", "2026-10-20T05:00:00");        // 05:00 on the 20th in India = 23:30 UTC on the 19th
  const pst = inZone("America/Los_Angeles", "2026-10-19T17:30:00");  // 17:30 on the 19th in California = 00:30 UTC on the 20th
  ok("T2 · a player in UTC+5:30 at 05:00 local on 20 Oct still gets 19 Oct's puzzle (it is 23:30 UTC on the 19th)", /^2026-10-19 2026-10-19T23:30/.test(ist), ist);
  ok("T3 · a player in UTC-8 at 17:30 local on 19 Oct already gets 20 Oct's puzzle (it is 00:30 UTC on the 20th)", /^2026-10-20 2026-10-20T00:30/.test(pst), pst);
  {
    const a = pageAt("2026-10-19T23:59:59Z"); await tick();
    const b = pageAt("2026-10-20T00:00:00Z"); await tick();
    ok("T4 · the PAGE shows 19 Oct's puzzle at 23:59:59 UTC and 20 Oct's at 00:00:00 UTC",
      doc(a).getElementById("dd-date").textContent === "2026-10-19" && doc(b).getElementById("dd-date").textContent === "2026-10-20" && doc(a).getElementById("dd-ptitle").textContent === byDate("2026-10-19").title);
    ok("T5 · the countdown runs to the next 00:00 UTC (1 second left shows 0h 00m; 09:00 UTC shows 15h 00m)",
      D.countdown(Date.parse("2026-10-19T23:59:59Z")) === "0h 00m" && D.countdown(Date.parse("2026-10-19T09:00:00Z")) === "15h 00m");
  }

  // ═══ NO FUTURE PUZZLE, BY ANY ROAD ═══
  await section('NO FUTURE PUZZLE, BY ANY ROAD', async () => {
    const fut = pageAt("2026-10-21T10:00:00Z", { q: "?d=2026-10-31" }); await tick();
    const pastLinks = [...doc(fut).querySelectorAll("#dd-pastlist a")].map((a) => a.getAttribute("href"));
    ok("F1 · asking for a FUTURE date (?d=2026-10-31) shows today's puzzle instead", doc(fut).getElementById("dd-date").textContent === "2026-10-21", doc(fut).getElementById("dd-date").textContent);
    ok("F2 · the earlier-puzzles list holds only earlier dates (19 and 20 Oct), never today's or a later one",
      JSON.stringify(pastLinks) === JSON.stringify(["?d=2026-10-20", "?d=2026-10-19"]), JSON.stringify(pastLinks));
    let leak = false;
    for (let day = 0; day < 20; day++) {
      const ms = Date.parse("2026-10-17T12:00:00Z") + day * 86400000, v = D.visible(PUZZLES, ms);
      if ((v.puzzle && v.puzzle.date > v.today) || v.past.some((p) => p.date >= v.today)) leak = true;
      ["2026-11-30", "2027-01-01", v.today, "garbage", "2026-10-1"].forEach((w) => { const pk = D.pick(PUZZLES, ms, w); if (pk.puzzle && pk.puzzle.date > v.today) leak = true; });
    }
    ok("F3 · on every day from 17 Oct to 5 Nov, no road (today, the list, any ?d=) reaches a puzzle dated after today", !leak);
    const noneLine = (dom) => { const n = doc(dom).getElementById("dd-none"); return n.hidden ? null : n.textContent; };
    const before = pageAt("2026-10-14T10:00:00Z"); await tick();
    ok("F4 · before the first puzzle (14 Oct): 'The first Daily Puzzle arrives on Monday 19 October.' — no puzzle, no list yet",
      noneLine(before) === "The first Daily Puzzle arrives on Monday 19 October." && doc(before).getElementById("dd-play").hidden && doc(before).getElementById("dd-past").hidden, noneLine(before));
    const eve = pageAt("2026-10-18T23:59:59Z"); await tick();
    const dawn = pageAt("2026-10-19T00:00:00Z"); await tick();
    ok("F4b · THE UNLOCK: at 23:59:59 UTC on 18 Oct the message still shows; at 00:00:00 UTC on 19 Oct the first puzzle is there",
      noneLine(eve) === "The first Daily Puzzle arrives on Monday 19 October." && noneLine(dawn) === null && doc(dawn).getElementById("dd-date").textContent === "2026-10-19");
    const shifted = PUZZLES.filter((p) => p.date >= "2026-10-21");
    const early = pageAt("2026-10-14T10:00:00Z", { puzzles: shifted }); await tick();
    ok("F4c · the date is READ FROM THE DATA, not hard-coded: a batch starting 21 Oct says 'Wednesday 21 October'",
      noneLine(early) === "The first Daily Puzzle arrives on Wednesday 21 October.", noneLine(early));
    const after = pageAt("2026-11-02T10:00:00Z"); await tick();
    ok("F5 · after the batch runs out (2 Nov): 'A new puzzle is on its way. Try an earlier one below.' and all 14 earlier puzzles listed",
      noneLine(after) === "A new puzzle is on its way. Try an earlier one below." && doc(after).getElementById("dd-play").hidden && doc(after).querySelectorAll("#dd-pastlist li").length === 14, noneLine(after));
  });

  // ═══ PLAYING: a win, a wrong play, a reveal, a missed day ═══
  await section('PLAYING: a win, a wrong play, a reveal, a missed day', async () => {
    const P = byDate("2026-10-19"), w = winnerOf(P), l = loserOf(P);
    const d1 = pageAt("2026-10-19T08:00:00Z"); await tick();
    ok("G1 · today's position is shown with one plain instruction", msg(d1) === "Your opponent has passed. Find the one play that wins this round.");
    ok("G2 · no answer button before a wrong try", ![...doc(d1).querySelectorAll("#dd-actions .dd-btn")].some((b) => /Show me the answer/.test(b.textContent)));
    play(d1, l.play);
    ok("G3 · a WRONG play: 'Not this one. Try again.' with the round's score, NOT solved, nothing stored as solved",
      /^Not this one\. Try again\. The round ended \d+–\d+\.$/.test(msg(d1)) && !(stored(d1) && stored(d1).solved["2026-10-19"]), msg(d1));
    ok("G4 · …the position resets (the card is back in hand) and the answer button appears",
      doc(d1).querySelectorAll(".dd-hand .dd-card").length === P.you.hand.length - P.setup.filter((s) => s.side === "you" && s.play).length
        && [...doc(d1).querySelectorAll("#dd-actions .dd-btn")].some((b) => b.textContent === "Show me the answer"));
    play(d1, w.play, w.target ? { target: w.target } : {});
    const s1 = stored(d1);
    ok("G5 · the WINNING play: 'You win the round', the day is solved, streak 1, best 1, and the explanation is shown",
      /^You win the round, \d+–\d+\.$/.test(msg(d1)) && s1.solved["2026-10-19"] && doc(d1).getElementById("dd-streak").textContent === "1"
        && doc(d1).getElementById("dd-best").textContent === "1" && doc(d1).getElementById("dd-explain").textContent.length > 60, msg(d1));
    ok("G5b · after the win the board shows the field as your play left it (round 1, your total = your winning score), with a line saying so",
      doc(d1).querySelector(".dd-boardnote").textContent === "The board after your play, before the round is scored."
        && /^Round 1 /.test(doc(d1).querySelector(".dd-round").textContent) && doc(d1).querySelector(".dd-you .dd-total").textContent === String(w.you));
    const keep = { [D.STORE_KEY]: JSON.stringify(s1) };
    const P2 = byDate("2026-10-20"), w2 = winnerOf(P2);
    const d2 = pageAt("2026-10-20T21:00:00Z", { store: keep }); await tick();
    play(d2, w2.play, w2.target ? { target: w2.target } : {});
    ok("G6 · solving the next day too extends the streak to 2 (best 2)", doc(d2).getElementById("dd-streak").textContent === "2" && stored(d2).best === 2);
    const reload = pageAt("2026-10-20T22:00:00Z", { store: { [D.STORE_KEY]: JSON.stringify(stored(d2)) } }); await tick();
    ok("G7 · coming back the same day: 'You've solved today's puzzle.' with the explanation, no replay needed",
      msg(reload) === "You've solved today's puzzle." && !doc(reload).getElementById("dd-after").hidden);

    // the reveal on 21 Oct: a wrong try, the confirm, then the answer — the day is not solved and the streak ends
    const P3 = byDate("2026-10-21"), l3 = loserOf(P3);
    const d3 = pageAt("2026-10-21T10:00:00Z", { store: { [D.STORE_KEY]: JSON.stringify(stored(d2)) } }); await tick();
    ok("R1 · before the reveal the streak stands at 2 (yesterday solved, today still open)", D.streak(stored(d3), "2026-10-21") === 2);
    play(d3, l3.play);
    click(d3, "#dd-actions .dd-btn", "Show me the answer");
    ok("R2 · 'Show me the answer' asks first: 'This ends your streak. Show the answer?'",
      !doc(d3).getElementById("dd-confirm").hidden && doc(d3).getElementById("dd-confirm-q").textContent === "This ends your streak. Show the answer?");
    click(d3, "#dd-confirm-no");
    ok("R3 · 'Keep trying' closes it and changes nothing", doc(d3).getElementById("dd-confirm").hidden && !stored(d3).revealed["2026-10-21"]);
    click(d3, "#dd-actions .dd-btn", "Show me the answer"); click(d3, "#dd-confirm-yes");
    await new Promise((r) => setTimeout(r, 120));
    const s3 = stored(d3), w3 = winnerOf(P3);
    ok("R4 · the REVEAL shows the winning play found in the browser, and the explanation",
      msg(d3).indexOf("The winning play: " + w3.play) === 0 && doc(d3).getElementById("dd-explain").textContent.length > 60, msg(d3));
    ok("R5 · …the day is NOT solved, the streak is over (0), best is kept (2), and it says so",
      s3.revealed["2026-10-21"] && !s3.solved["2026-10-21"] && doc(d3).getElementById("dd-streak").textContent === "0" && s3.best === 2
        && doc(d3).getElementById("dd-afternote").textContent === "Today doesn't count as solved, and your streak is over.");
    // a reveal can't be undone by solving afterwards
    ok("R6 · a revealed day can never become solved, even with the right play afterwards", D.markSolved(s3, "2026-10-21", "2026-10-21") === false && !s3.solved["2026-10-21"]);
    // the next day after a reveal starts again from 1
    const P4 = byDate("2026-10-22"), w4 = winnerOf(P4);
    const d4 = pageAt("2026-10-22T10:00:00Z", { store: { [D.STORE_KEY]: JSON.stringify(s3) } }); await tick();
    play(d4, w4.play, w4.target ? { target: w4.target } : {});
    ok("R7 · the day after a reveal, a solve starts the streak again at 1 (best stays 2)", doc(d4).getElementById("dd-streak").textContent === "1" && stored(d4).best === 2);

    // a missed day: solved 22, nothing on 23, solved 24 → 1
    const P6 = byDate("2026-10-24"), w6 = winnerOf(P6);
    const d6 = pageAt("2026-10-24T10:00:00Z", { store: { [D.STORE_KEY]: JSON.stringify(stored(d4)) } }); await tick();
    ok("M1 · a MISSED day ends the streak: with 23 Oct unplayed, on 24 Oct the open streak is 0", D.streak(stored(d6), "2026-10-24") === 0);
    play(d6, w6.play, w6.target ? { target: w6.target } : {});
    ok("M2 · …and solving 24 Oct starts again at 1", doc(d6).getElementById("dd-streak").textContent === "1");

    // the reveal on an EARLIER puzzle: no confirm, and never the today-only line
    const P8 = byDate("2026-10-20"), l8 = loserOf(P8);
    const d8 = pageAt("2026-10-24T09:00:00Z", { q: "?d=2026-10-20", store: { [D.STORE_KEY]: JSON.stringify(stored(d6)) } }); await tick();
    const keep8 = JSON.stringify(stored(d8));
    play(d8, l8.play);
    click(d8, "#dd-actions .dd-btn", "Show me the answer");
    await new Promise((r) => setTimeout(r, 120));
    ok("R8 · revealing an EARLIER puzzle: no streak warning, and the note never says 'Today doesn't count…' — only 'Earlier puzzles don't count toward your streak.'",
      doc(d8).getElementById("dd-confirm").hidden && msg(d8).indexOf("The winning play: ") === 0
        && doc(d8).getElementById("dd-afternote").textContent === "Earlier puzzles don't count toward your streak."
        && doc(d8).querySelector("main").textContent.indexOf("Today doesn't count as solved") < 0 && JSON.stringify(stored(d8)) === keep8, JSON.stringify([doc(d8).getElementById("dd-confirm").hidden, msg(d8).slice(0,40), doc(d8).getElementById("dd-afternote").textContent, doc(d8).body.textContent.indexOf("Today doesn"), JSON.stringify(stored(d8)) === keep8]));

    // an earlier puzzle: playable for fun, never touches the streak
    const before = JSON.stringify(stored(d6));
    const P7 = byDate("2026-10-23"), w7 = winnerOf(P7);
    const d7 = pageAt("2026-10-25T11:00:00Z", { q: "?d=2026-10-23", store: { [D.STORE_KEY]: before } }); await tick();   // 25 Oct still OPEN
    ok("E1 · an earlier puzzle opens from the list (23 Oct, marked as earlier)", doc(d7).getElementById("dd-date").textContent === "2026-10-23 · an earlier puzzle");
    play(d7, w7.play, w7.target ? { target: w7.target } : {});
    ok("E2 · solving an EARLIER puzzle wins the round but does NOT mark it solved or change the streak, and says so",
      /^You win the round/.test(msg(d7)) && JSON.stringify(stored(d7)) === before && doc(d7).getElementById("dd-afternote").textContent === "Earlier puzzles don't count toward your streak.");
  });

  // ═══ A DRAW IS NOT A WIN ═══
  await section("a draw", async () => {
    const P = byDate("2026-10-26"), draw = PZ.solve(P, E, null).plays.find((p) => !p.win && p.play && p.you === p.them);
    const d = pageAt("2026-10-26T10:00:00Z"); await tick();
    play(d, draw.play, draw.target ? { target: draw.target } : {});
    ok("W1 · a play that only DRAWS the round (" + draw.you + "–" + draw.them + ") is 'Not this one', not solved", /^Not this one/.test(msg(d)) && !(stored(d) && stored(d).solved["2026-10-26"]), msg(d));
  });

  // ═══ THE LEAP, THROUGH THE PAGE (the one puzzle that needs it) ═══
  await section('THE LEAP, THROUGH THE PAGE (the one puzzle that needs it)', async () => {
    const P = byDate("2026-10-29"), w = winnerOf(P), L = w.line;
    const d = pageAt("2026-10-29T10:00:00Z"); await tick();
    // the card alone, no Leap: the solver's own slot, then end the turn
    click(d, ".dd-hand .dd-card", w.play); click(d, "#dd-actions .dd-btn", "Play " + w.play);
    const slots = [...doc(d).querySelectorAll(".dd-slot")];
    ok("L0 · placing a Unit: each slot button says 'Place it here'", slots.length > 0 && slots.every((b) => b.textContent === "Place it here" && b.getAttribute("aria-label") === "Place it here"));
    slots[L.pos == null ? 0 : L.pos].click();
    click(d, "#dd-actions .dd-btn", "End my turn");
    ok("L1 · 29 Oct: the right card WITHOUT the Leap loses ('Not this one')", /^Not this one/.test(msg(d)), msg(d));
    // with the solver's own Leap
    const g0 = PZ.load(P, E, 1), names = (gg) => gg.players[0].units.map((u) => u.n);
    if (L.before.length) { const n = names(g0); click(d, "#dd-actions .dd-btn", "Leap"); click(d, ".dd-you .dd-pick", n[L.before[0][0]]); click(d, ".dd-you .dd-pick", n[L.before[0][1]]); }
    play(d, w.play, { slot: L.pos == null ? 0 : L.pos });
    if (L.after.length) {
      const g1 = PZ.load(P, E, 1); const hi = g1.players[0].hand.findIndex((c) => c.n === w.play); E.playCard(g1, 0, hi, null, L.pos); const n = names(g1);
      click(d, "#dd-actions .dd-btn", "Leap"); click(d, ".dd-you .dd-pick", n[L.after[0][0]]); click(d, ".dd-you .dd-pick", n[L.after[0][1]]);
      ok("L2 · after the only Leap is used, the prompt says 'Now end your turn.'", msg(d) === "Now end your turn.", msg(d));
    }
    click(d, "#dd-actions .dd-btn", "End my turn");
    ok("L3 · …WITH the free Leap (chosen on the page: the Unit, then the neighbour to copy) the same card wins the round", /^You win the round/.test(msg(d)), msg(d));
  });

  // ═══ STORAGE BLOCKED ═══
  await section('STORAGE BLOCKED', async () => {
    const P = byDate("2026-10-19"), w = winnerOf(P);
    let threw = null;
    let d;
    try { d = pageAt("2026-10-19T10:00:00Z", { blocked: true }); await tick(); play(d, w.play); } catch (e) { threw = e; }
    ok("S1 · storage BLOCKED: the page still loads, plays and wins the round", !threw && /^You win the round/.test(msg(d)), threw && threw.message);
    ok("S2 · …and says plainly that progress isn't being saved", doc(d).getElementById("dd-store").textContent === "This browser isn't saving your progress, so your streak won't be kept.");
    const junk = pageAt("2026-10-19T10:00:00Z", { store: { [D.STORE_KEY]: "{not json" } }); await tick();
    ok("S3 · a corrupt store is treated as empty, never as an error", msg(junk) === "Your opponent has passed. Find the one play that wins this round.");
    const odd = pageAt("2026-10-19T10:00:00Z", { store: { [D.STORE_KEY]: JSON.stringify({ v: 1, solved: null, revealed: [], best: "x" }) } }); await tick();
    ok("S4 · a record of the wrong SHAPE (valid JSON, solved: null) is treated as empty too — the puzzle still shows",
      msg(odd) === "Your opponent has passed. Find the one play that wins this round.", msg(odd));
  });

  // ═══ THE IN-BROWSER SOLVER = THE OFFLINE SOLVER ═══
  await section('THE IN-BROWSER SOLVER = THE OFFLINE SOLVER', async () => {
    const dom = pageAt("2026-10-19T10:00:00Z"); await tick();
    const W = dom.window, pageE = W.__DY_DAILY_PAGE.E;
    let all = true, why = "";
    for (const P of PUZZLES) {
      const inPage = W.DY_PUZZLE.solve(JSON.parse(JSON.stringify(P)), pageE, null);
      const off = PZ.solve(P, E, null);
      const w = inPage.ok && inPage.winners[0];
      if (!(inPage.ok && off.ok && w.key === off.winners[0].key && w.you === off.winners[0].you && w.them === off.winners[0].them
        && FP.digests[P.id] === answerDigest(FP.salt, P.id, w.play, w.target))) { all = false; why = P.date; }
    }
    ok("B1 · for all 14, the solver running INSIDE the page (its engine globals) finds the same one play, at the same score, as the offline solver — and it is the approved one", all, why);
  });

  // ═══ NO PLAIN ANSWER, NO PLAIN EXPLANATION, IN ANY SERVED FILE ═══
  await section('NO PLAIN ANSWER, NO PLAIN EXPLANATION, IN ANY SERVED FILE', async () => {
    const tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: SITE, encoding: "utf8" }).split("\n").filter(Boolean)
      .filter((f) => !/node_modules|^tmp\//.test(f) && /\.(js|json|html|md|txt|css)$/.test(f));
    const corpus = tracked.map((f) => { try { return fs.readFileSync(path.join(SITE, f), "utf8"); } catch (e) { return ""; } }).join("\n");
    const decoded = PUZZLES.map((P) => D.decodeNote(P.id, NOTES[P.id]));
    ok("N1 · all 14 explanations ship ENCODED, and each decodes to real text", decoded.every((t) => t.length > 80 && /\./.test(t)));
    const sentences = [];
    decoded.forEach((t) => t.split(/(?<=\.)\s+/).forEach((s) => { if (s.length >= 30) sentences.push(s); }));
    const found = sentences.filter((s) => corpus.indexOf(s) >= 0);
    ok("N2 · not one explanation sentence (" + sentences.length + " checked) appears in plain text in any served file (" + tracked.length + " files)", found.length === 0, found.slice(0, 2).join(" | "));
    ok("N3 · no answer key: no answers.json, no \"answer\" object anywhere", !fs.existsSync(path.join(DIR, "answers.json")) && !/"answer"\s*:\s*\{/.test(corpus));
    const page = R("play/daily/page.js") + R("play/daily/index.html") + R("play/daily/daily.js");
    const winningNames = PUZZLES.map((P) => winnerOf(P).play);
    const inPage = winningNames.filter((n) => page.indexOf('"' + n + '"') >= 0 || page.indexOf("'" + n + "'") >= 0);
    ok("N4 · the page's own code names no winning card", inPage.length === 0, inPage.join(", "));
  });

  // ═══ THE RULES, DIRECTLY ═══
  await section('THE RULES, DIRECTLY', async () => {
    const s = D.blank();
    ok("U1 · solving a day that is not today never counts", D.markSolved(s, "2026-10-19", "2026-10-20") === false && !s.solved["2026-10-19"]);
    ok("U2 · revealing an earlier day never counts against you", D.markRevealed(s, "2026-10-19", "2026-10-20") === false && !s.revealed["2026-10-19"]);
    D.markSolved(s, "2026-10-20", "2026-10-20");
    ok("U3 · after solving today, 'Show me the answer' costs nothing (the explanation is free)", D.markRevealed(s, "2026-10-20", "2026-10-20") === false && D.streak(s, "2026-10-20") === 1);
    const bad = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
    ok("U4 · a store that throws on read and write: load gives an empty record, save reports false", JSON.stringify(D.load(bad)) === JSON.stringify(D.blank()) && D.save(bad, s) === false);
  });

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
