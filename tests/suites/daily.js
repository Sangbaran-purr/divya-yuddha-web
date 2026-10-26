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
// DAILY PUZZLE EFFECTS R2: the try is played in the real battle screen, framed in puzzle mode. Here the frame is a STUB that
// speaks the frame's exact words (ready / loaded / result) and scores each try with the site's own referee (PZ.run over the
// engine copy); the game repo's src/test_puzzlemode.js proves the real frame reports the same result for the same line.
// What the frame part must catch: a frame result that doesn't drive solved/streak exactly as before; a wrong try that
// doesn't reset; a reveal that doesn't play the solver's move in the frame or doesn't end the streak; a hidden-tab
// (fast-forwarded) result that scores wrongly; ANY answer sent to the frame before the reveal; a frame that can't start.
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
// EVERY DATE BELOW FOLLOWS THE DATA: day(0) is the first puzzle's UTC date, day(k) is k days after it. Nothing here is
// pinned to a calendar date except LAUNCH_RULED (the owner's ruling, 2026-10-15), checked once against the data.
const START = PUZZLES.map((p) => p.date).sort()[0];
const day = (k) => D.addDays(START, k);
const dm = (k) => { const d = new Date(day(k) + "T00:00:00Z"); return d.getUTCDate() + " " + d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }); };
// the page's own date words, re-derived INDEPENDENTLY here (the platform's formatter, not the page's tables)
const longDay = (date) => new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(",", "");
const launch = longDay(START);
const LAUNCH_RULED = "Thursday 15 October";
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
    + "window.fetch=function(u){if(/STAMP/.test(String(u)))return Promise.resolve({text:function(){return Promise.resolve(" + JSON.stringify(STAMP + "\n") + ");}});"
    + "return Promise.resolve({json:function(){return Promise.resolve(" + JSON.stringify(opts.puzzles || PUZZLES) + ");}});};</script>";
  html = html.replace("<head>", "<head>" + pre);
  const url = "https://divyayuddha.games/play/daily/" + (opts.q || "");
  const dom = new JSDOM(html, { url: url, runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(win) {
      if (opts.blocked) Object.defineProperty(win, "localStorage", { get() { throw new Error("SecurityError: storage blocked"); } });
      else if (opts.store) Object.keys(opts.store).forEach((k) => win.localStorage.setItem(k, opts.store[k]));
      win.setInterval = function () { return 0; };                              // no live countdown timers in a test
    } });
  DOMS.push(dom);
  return dom;
}
const DOMS = [];   // every page made here, closed at the end (their frame timers must not keep the run alive)
const STAMP = R("game/STAMP").trim();
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
// ── THE FRAME, STUBBED: the page reaches its battle frame only through postMessage; this stub answers as the frame's puzzle
// mode does, and scores a try with the site's own referee. `hold` keeps a reveal's result back until release().
const lineOf = (w) => ({ play: w.play, target: w.target || null, pos: w.line ? w.line.pos : null, before: w.line ? w.line.before : [], after: w.line ? w.line.after : [] });
const plainLine = (p) => (p && p.play ? { play: p.play, target: p.target || null, pos: null, before: [], after: [] } : { before: [], after: [] });
async function framed(dom, o) {
  o = o || {};
  const W = dom.window; let fr = null;
  for (let i = 0; i < 20 && !(fr = W.document.getElementById("dd-frame")); i++) await tick();
  if (!fr) throw new Error("the page built no battle frame");
  const cw = fr.contentWindow, got = [], held = [];
  let P = null;
  const send = (data, from) => W.dispatchEvent(new W.MessageEvent("message", { data: JSON.parse(JSON.stringify(data)), origin: (from && from.origin) || W.location.origin, source: (from && from.source) || cw }));
  const score = (line) => {
    const cand = line && line.play ? { play: line.play, target: line.target || null, pos: line.pos == null ? null : line.pos } : { pass: true };
    const r = PZ.run(P, E, PZ.SEEDS[0], cand, (line && line.before) || [], (line && line.after) || []);
    return { type: "puzzle:result", id: P.id, win: r.win, you: r.you, them: r.them, winner: r.win ? "you" : "them", events: [], steps: [{ kind: "end", ms: 0 }], choreoMs: 0, wallMs: 0, reducedMotion: false, cut: false };
  };
  cw.postMessage = (m) => { got.push(JSON.parse(JSON.stringify(m)));
    if (m.type === "puzzle:load") { P = m.puzzle; send({ type: "puzzle:loaded", id: P.id, sheets: [], clips: [], actors: [] }); }
    else if (m.type === "puzzle:reset") send({ type: "puzzle:loaded", id: P.id, sheets: [], clips: [], actors: [] });
    else if (m.type === "puzzle:perform") { const r = Object.assign(score(m.line), { performed: true }); if (o.hold) held.push(r); else send(r); } };
  if (!o.silent) { send({ type: "puzzle:ready" }); await tick(); }
  return { got, send, cw, try: (line, extra) => send(Object.assign(score(line), extra || {})), release: () => { held.splice(0).forEach((r) => send(r)); } };
}
async function fallback(dom) { const f = await framed(dom, { silent: true }); f.send({ type: "puzzle:error", code: "TEST", message: "the battle could not start" }); await tick(); return f; }
const covered = (dom) => { const c = doc(dom).getElementById("dd-cover"); return c && !c.hidden ? doc(dom).getElementById("dd-covertext").textContent : null; };
// what the page says now: the result panel when it is up (owner ruling 2026-10-16: a result is said ONCE, in the panel), else the line under the title
const said = (dom) => covered(dom) || msg(dom);
// the line appears exactly ONCE on the page, in the result panel — not under the title
const once = (dom, line) => !!line && msg(dom) === "" && covered(dom) === line && doc(dom).getElementById("dd-play").textContent.split(line).length === 2;
const stored = (dom) => { try { return JSON.parse(dom.window.localStorage.getItem(D.STORE_KEY) || "null"); } catch (e) { return null; } };
// the winning play for a puzzle, found by the solver here (this file names none)
const winnerOf = (P) => PZ.solve(P, E, null).winners[0];
const loserOf = (P) => PZ.solve(P, E, null).plays.find((p) => !p.win && p.play && !p.target);
const byDate = (d) => PUZZLES.find((p) => p.date === d);

async function section(name, fn) { try { await fn(); } catch (e) { ok(name + " — ran to the end", false, String(e && e.message)); } }
async function main() {
  console.log("── MINI-GAMES-1 · R2 · the Daily Puzzle page ──");

  // ═══ THE DATE: UTC, for everyone ═══
  ok(`T1 · 23:59:59 UTC on ${dm(0)} is still ${dm(0)}'s puzzle; 00:00:00 UTC on ${dm(1)} is the next one`,
    D.visible(PUZZLES, Date.parse(`${day(0)}T23:59:59Z`)).puzzle.date === `${day(0)}` && D.visible(PUZZLES, Date.parse(`${day(1)}T00:00:00Z`)).puzzle.date === `${day(1)}`);
  const inZone = (tz, local) => execFileSync(process.execPath, ["-e",
    "const D=require(" + JSON.stringify(path.join(DIR, "daily.js")) + ");const L=require(" + JSON.stringify(path.join(DIR, "puzzles.json")) + ");"
    + "const ms=new Date(" + JSON.stringify(local) + ").getTime();process.stdout.write(D.visible(L,ms).puzzle.date+' '+new Date(ms).toISOString())"],
    { env: Object.assign({}, process.env, { TZ: tz }), encoding: "utf8" });
  const ist = inZone("Asia/Kolkata", `${day(1)}T05:00:00`);        // 05:00 local on day 1 in India = 23:30 UTC on day 0
  const pst = inZone("America/Los_Angeles", `${day(0)}T17:30:00`);  // 17:30 local on day 0 in California = 00:30 UTC on day 1
  ok(`T2 · a player in UTC+5:30 at 05:00 local on ${dm(1)} still gets ${dm(0)}'s puzzle (it is 23:30 UTC the day before)`, new RegExp("^" + day(0) + " " + day(0) + "T23:30").test(ist), ist);
  ok(`T3 · a player in UTC-8 at 17:30 local on ${dm(0)} already gets ${dm(1)}'s puzzle (it is 00:30 UTC the day after)`, new RegExp("^" + day(1) + " " + day(1) + "T00:30").test(pst), pst);
  {
    const a = pageAt(`${day(0)}T23:59:59Z`); await tick();
    const b = pageAt(`${day(1)}T00:00:00Z`); await tick();
    ok(`T4 · the PAGE shows ${dm(0)}'s puzzle at 23:59:59 UTC and ${dm(1)}'s at 00:00:00 UTC`,
      doc(a).getElementById("dd-date").textContent === `${day(0)}` && doc(b).getElementById("dd-date").textContent === `${day(1)}` && doc(a).getElementById("dd-ptitle").textContent === byDate(`${day(0)}`).title);
    ok("T5 · the countdown runs to the next 00:00 UTC (1 second left shows 0h 00m; 09:00 UTC shows 15h 00m)",
      D.countdown(Date.parse(`${day(0)}T23:59:59Z`)) === "0h 00m" && D.countdown(Date.parse(`${day(0)}T09:00:00Z`)) === "15h 00m");
  }

  // ═══ NO FUTURE PUZZLE, BY ANY ROAD ═══
  await section('NO FUTURE PUZZLE, BY ANY ROAD', async () => {
    const fut = pageAt(`${day(2)}T10:00:00Z`, { q: `?d=${day(12)}` }); await tick();
    const pastLinks = [...doc(fut).querySelectorAll("#dd-pastlist a")].map((a) => a.getAttribute("href"));
    ok(`F1 · asking for a FUTURE date (?d=${day(12)}) shows today's puzzle instead`, doc(fut).getElementById("dd-date").textContent === `${day(2)}`, doc(fut).getElementById("dd-date").textContent);
    ok(`F2 · the earlier-puzzles list holds only earlier dates (${dm(0)} and ${dm(1)}), never today's or a later one`,
      JSON.stringify(pastLinks) === JSON.stringify([`?d=${day(1)}`, `?d=${day(0)}`]), JSON.stringify(pastLinks));
    let leak = false;
    for (let n = 0; n < 20; n++) {
      const ms = Date.parse(`${day(-2)}T12:00:00Z`) + n * 86400000, v = D.visible(PUZZLES, ms);
      if ((v.puzzle && v.puzzle.date > v.today) || v.past.some((p) => p.date >= v.today)) leak = true;
      [`${day(42)}`, "2027-01-01", v.today, "garbage", "2026-10-1"].forEach((w) => { const pk = D.pick(PUZZLES, ms, w); if (pk.puzzle && pk.puzzle.date > v.today) leak = true; });
    }
    ok(`F3 · on every day from ${dm(-2)} to ${dm(17)}, no road (today, the list, any ?d=) reaches a puzzle dated after today`, !leak);
    const noneLine = (dom) => { const n = doc(dom).getElementById("dd-none"); return n.hidden ? null : n.textContent; };
    const before = pageAt(`${day(-5)}T10:00:00Z`); await tick();
    ok(`F4 · before the first puzzle (${dm(-5)}): 'The first Daily Puzzle arrives on ${launch}.' (the ruled launch: ${LAUNCH_RULED}) — no puzzle, no list yet`,
      launch === LAUNCH_RULED && noneLine(before) === "The first Daily Puzzle arrives on " + launch + "." && doc(before).getElementById("dd-play").hidden && doc(before).getElementById("dd-past").hidden, noneLine(before));
    const eve = pageAt(`${day(-1)}T23:59:59Z`); await tick();
    const dawn = pageAt(`${day(0)}T00:00:00Z`); await tick();
    ok(`F4b · THE UNLOCK: at 23:59:59 UTC on ${dm(-1)} the message still shows; at 00:00:00 UTC on ${dm(0)} the first puzzle is there`,
      noneLine(eve) === "The first Daily Puzzle arrives on " + launch + "." && noneLine(dawn) === null && doc(dawn).getElementById("dd-date").textContent === `${day(0)}`);
    const shifted = PUZZLES.filter((p) => p.date >= `${day(2)}`);
    const early = pageAt(`${day(-5)}T10:00:00Z`, { puzzles: shifted }); await tick();
    ok(`F4c · the date is READ FROM THE DATA, not hard-coded: a batch starting ${dm(2)} says '${longDay(day(2))}'`,
      noneLine(early) === "The first Daily Puzzle arrives on " + longDay(day(2)) + ".", noneLine(early));
    const after = pageAt(`${day(PUZZLES.length)}T10:00:00Z`); await tick();
    const arch = D.archiveFor(PUZZLES, day(PUZZLES.length));
    ok(`F5 · after the puzzles run out (${dm(PUZZLES.length)}): never "no puzzle" — the ARCHIVE's puzzle for the day, 'From the archive' beside its date and 'Today's puzzle is on its way. Here is one from the archive.' under its title; the other earlier puzzles listed (owner ruling 2026-10-16)`,
      noneLine(after) === null && !doc(after).getElementById("dd-play").hidden && doc(after).getElementById("dd-date").textContent === arch.date + " · From the archive"
        && doc(after).getElementById("dd-ptitle").textContent === arch.title && doc(after).getElementById("dd-archive").textContent === "Today's puzzle is on its way. Here is one from the archive."
        && doc(after).querySelectorAll("#dd-pastlist li").length === PUZZLES.length - 1 && R("play/daily/page.js").indexOf("A new puzzle is on its way") < 0, doc(after).getElementById("dd-date").textContent);
  });

  // ═══ THE ARCHIVE DAY AND THE STREAK (owner rulings 2026-10-16) ═══
  await section("THE ARCHIVE", async () => {
    const last = PUZZLES.map((p) => p.date).sort().pop(), a1 = D.addDays(last, 1), a2 = D.addDays(last, 2);
    const one = pageAt(`${a1}T01:00:00Z`), two = pageAt(`${a1}T23:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify({ v: 1, solved: {}, revealed: {}, best: 3 }) } }); await tick();
    const pickd = (dom) => doc(dom).getElementById("dd-ptitle").textContent;
    const days = Array.from({ length: 30 }, (_, i) => D.addDays(last, i + 1)), picks = days.map((d) => D.archiveFor(PUZZLES, d).date);
    ok("AR1 · an archive day shows the SAME earlier puzzle for every player all day (two players, 01:00 and 23:00 UTC), chosen from the date alone — and it is always an EARLIER puzzle",
      pickd(one) === pickd(two) && pickd(one) === D.archiveFor(PUZZLES, a1).title && picks.every((d) => d <= last) && new Set(picks).size > 5, pickd(one) + " / " + pickd(two));
    ok("AR2 · the archive's day line: 'From the archive' beside the date, and under the title 'Today's puzzle is on its way. Here is one from the archive.'",
      / · From the archive$/.test(doc(one).getElementById("dd-date").textContent) && doc(one).getElementById("dd-archive").textContent === "Today's puzzle is on its way. Here is one from the archive." && !doc(one).getElementById("dd-archive").hidden);
    {
      const css = R("play/daily/daily.css"), meta = (css.match(/\.dd-meta \{[^}]*\}/) || [""])[0];
      ok("AR2b · the tag reads 'From the archive' as written: the date line is never capitalised — only the difficulty is",
        meta && !/text-transform/.test(meta) && /#dd-diff \{ text-transform: capitalize; \}/.test(css) && !/#dd-date[^{]*\{[^}]*text-transform/.test(css), meta);
    }
    const P = D.archiveFor(PUZZLES, a1), w = winnerOf(P);
    const s0 = { v: 1, solved: { [D.addDays(last, -1)]: true, [last]: true }, revealed: {}, best: 2 };
    const sv = pageAt(`${a1}T10:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify(s0) } }); await tick();
    (await framed(sv)).try(lineOf(w)); await tick();
    ok("AR3 · SOLVING the archive puzzle wins the round but does NOT extend the streak (still 2) and stores nothing for the day", /^You win the round/.test(said(sv)) && doc(sv).getElementById("dd-streak").textContent === "2"
      && !stored(sv).solved[a1] && JSON.stringify(stored(sv).solved) === JSON.stringify(s0.solved), said(sv) + " | streak " + doc(sv).getElementById("dd-streak").textContent);
    ok("AR4 · an archive day does NOT BREAK the streak: solved the last two puzzle days → still 2 on the first archive day, and on the second", D.streak(s0, a1, PUZZLES) === 2 && D.streak(s0, a2, PUZZLES) === 2);
    const more = PUZZLES.concat([{ id: "dp-" + D.addDays(last, 3), date: D.addDays(last, 3) }]);
    ok("AR5 · …but a day that HAD a puzzle and was missed still ENDS it (two archive days, then a puzzle day missed → 0 the day after)",
      D.streak(s0, D.addDays(last, 3), more) === 2 && D.streak(s0, D.addDays(last, 4), more) === 0 && D.streak({ v: 1, solved: { [last]: true }, revealed: {}, best: 1 }, D.addDays(last, 2), PUZZLES.filter((p) => p.date !== last).concat([{ date: last }, { date: D.addDays(last, 1) }])) === 0);
    const solvedOnArchive = { v: 1, solved: { [last]: true }, revealed: {}, best: 1 };
    ok("AR6 · and an archive day then a new puzzle solved continues the streak (archive days neither break nor add): 1 → 2", D.streak(Object.assign({}, solvedOnArchive, { solved: { [last]: true, [D.addDays(last, 3)]: true } }), D.addDays(last, 3), more) === 2);
  });

  // ═══ PLAYING (in the battle frame): a win, a wrong play, a reveal, a missed day ═══
  await section('PLAYING: a win, a wrong play, a reveal, a missed day', async () => {
    const P = byDate(`${day(0)}`), w = winnerOf(P), l = loserOf(P);
    const d1 = pageAt(`${day(0)}T08:00:00Z`); await tick();
    ok("G1 · today's position is shown with one plain instruction", msg(d1) === "Your opponent has passed. Find the one play that wins this round.");
    const fr = doc(d1).getElementById("dd-frame");
    ok("G1b · the try is played in the REAL battle screen: a frame of ../../game/index.html in puzzle mode, stamped from game/STAMP (" + STAMP + "), titled 'The battle'",
      !!fr && fr.getAttribute("src") === "../../game/index.html?v=" + STAMP + "&puzzle=1" && fr.title === "The battle", fr && fr.getAttribute("src"));
    const f1 = await framed(d1);
    ok("G1c · on the frame's word 'ready' the page hands it the day's puzzle — the puzzle only, exactly as published", f1.got.length === 1 && f1.got[0].type === "puzzle:load"
      && JSON.stringify(Object.keys(f1.got[0]).sort()) === JSON.stringify(["puzzle", "type"]) && JSON.stringify(f1.got[0].puzzle) === JSON.stringify(P));
    ok("G2 · no answer button before a wrong try", ![...doc(d1).querySelectorAll("#dd-actions .dd-btn")].some((b) => /Show me the answer/.test(b.textContent)));
    f1.try(plainLine(l)); await tick();
    ok("G3 · a WRONG try (reported by the frame): 'Not this one. Try again.' with the round's score, NOT solved, nothing stored as solved",
      /^Not this one\. Try again\. The round ended \d+–\d+\.$/.test(said(d1)) && !(stored(d1) && stored(d1).solved[`${day(0)}`]), said(d1));
    ok("G3b · …the page COVERS the battle with those words — ONCE, in the result panel, not under the title (owner ruling 2026-10-16) — (its banners and round 2 are never seen), with a 'Try again' button",
      once(d1, covered(d1)) && /^Not this one\. Try again\./.test(covered(d1)) && [...doc(d1).querySelectorAll("#dd-coveracts .dd-btn")].map((b) => b.textContent).join() === "Try again");
    click(d1, "#dd-coveracts .dd-btn", "Try again");
    ok("G4 · 'Try again' resets the position in the frame (puzzle:reset), uncovers it, and the answer button is there",
      f1.got[f1.got.length - 1].type === "puzzle:reset" && covered(d1) === null && msg(d1) === "Your opponent has passed. Find the one play that wins this round."
        && [...doc(d1).querySelectorAll("#dd-actions .dd-btn")].some((b) => b.textContent === "Show me the answer"));
    f1.try(lineOf(w)); await tick();
    const s1 = stored(d1);
    ok("G5 · the WINNING try (reported by the frame): 'You win the round', the day is solved, streak 1, best 1, and the explanation is shown",
      /^You win the round, \d+–\d+\.$/.test(said(d1)) && once(d1, "You win the round, " + w.you + "–" + w.them + ".") && s1.solved[`${day(0)}`] && doc(d1).getElementById("dd-streak").textContent === "1"
        && doc(d1).getElementById("dd-best").textContent === "1" && doc(d1).getElementById("dd-explain").textContent.length > 60, said(d1) + " | under the title: " + msg(d1));
    ok("G5b · after the win the cover holds the result and the battle is put away (the stage settles to a panel)",
      once(d1, covered(d1)) && doc(d1).getElementById("dd-game").classList.contains("dd-stage-done"));
    const keep = { [D.STORE_KEY]: JSON.stringify(s1) };
    const P2 = byDate(`${day(1)}`), w2 = winnerOf(P2);
    const d2 = pageAt(`${day(1)}T21:00:00Z`, { store: keep }); await tick();
    (await framed(d2)).try(lineOf(w2)); await tick();
    ok("G6 · solving the next day too extends the streak to 2 (best 2)", doc(d2).getElementById("dd-streak").textContent === "2" && stored(d2).best === 2);
    const reload = pageAt(`${day(1)}T22:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify(stored(d2)) } }); await tick();
    ok("G7 · coming back the same day: 'You've solved today's puzzle.' ONCE, in the result panel (owner ruling 2026-10-16: no second line under the title), with the explanation, no replay needed — and no battle is loaded for it",
      msg(reload) === "" && (doc(reload).getElementById("dd-play").textContent.split("You've solved today's puzzle.").length - 1) === 1 && !doc(reload).getElementById("dd-after").hidden && !doc(reload).getElementById("dd-frame") && covered(reload) === "You've solved today's puzzle.");

    // the reveal on day 2: a wrong try, the confirm, then the answer played in the battle — not solved, the streak ends
    const P3 = byDate(`${day(2)}`), l3 = loserOf(P3), w3 = winnerOf(P3);
    const d3 = pageAt(`${day(2)}T10:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify(stored(d2)) } }); await tick();
    const f3 = await framed(d3, { hold: true });
    ok("R1 · before the reveal the streak stands at 2 (yesterday solved, today still open)", D.streak(stored(d3), `${day(2)}`) === 2);
    f3.try(plainLine(l3)); await tick();
    click(d3, "#dd-actions .dd-btn", "Show me the answer");
    ok("R2 · 'Show me the answer' asks first: 'This ends your streak. Show the answer?'",
      !doc(d3).getElementById("dd-confirm").hidden && doc(d3).getElementById("dd-confirm-q").textContent === "This ends your streak. Show the answer?");
    click(d3, "#dd-confirm-no");
    ok("R3 · 'Keep trying' closes it and changes nothing", doc(d3).getElementById("dd-confirm").hidden && !stored(d3).revealed[`${day(2)}`]);
    ok("K1 · NO ANSWER BEFORE THE REVEAL: everything the page has sent the frame is the puzzle and a reset — never a play, a line or a result",
      f3.got.every((m) => (m.type === "puzzle:load" && Object.keys(m).sort().join() === "puzzle,type") || (m.type === "puzzle:reset" && Object.keys(m).length === 1))
        && !f3.got.some((m) => m.type === "puzzle:perform") && JSON.stringify(f3.got).indexOf('"line"') < 0, JSON.stringify(f3.got.map((m) => m.type)));
    click(d3, "#dd-actions .dd-btn", "Show me the answer"); click(d3, "#dd-confirm-yes");
    await new Promise((r) => setTimeout(r, 120));
    const perf = f3.got.filter((m) => m.type === "puzzle:perform");
    ok("R4 · the REVEAL plays the solver's own winning move IN THE BATTLE (one puzzle:perform carrying the approved line), and says it in words",
      perf.length === 1 && JSON.stringify(perf[0].line) === JSON.stringify(lineOf(w3)) && FP.digests[P3.id] === answerDigest(FP.salt, P3.id, perf[0].line.play, perf[0].line.target)
        && msg(d3).indexOf("The winning play: " + w3.play) === 0 && covered(d3) === null, msg(d3));
    ok("R4b · …the explanation waits for the move to finish playing (nothing after it yet)", doc(d3).getElementById("dd-after").hidden);
    f3.release(); await tick();
    const s3 = stored(d3);
    ok("R4c · when the frame reports the move played, the cover shows the winning play — ONCE, in the panel, no longer under the title — and the explanation follows", !!covered(d3) && covered(d3).indexOf("The winning play: " + w3.play) === 0 && once(d3, covered(d3)) && doc(d3).getElementById("dd-explain").textContent.length > 60);
    ok("R5 · …the day is NOT solved, the streak is over (0), best is kept (2), and it says so",
      s3.revealed[`${day(2)}`] && !s3.solved[`${day(2)}`] && doc(d3).getElementById("dd-streak").textContent === "0" && s3.best === 2
        && doc(d3).getElementById("dd-afternote").textContent === "Today doesn't count as solved, and your streak is over.");
    // a reveal can't be undone by solving afterwards — not by the rules, nor by a late frame result
    f3.try(lineOf(w3)); await tick();
    ok("R6 · a revealed day can never become solved, even with the right play afterwards (the rules, and a late frame result)", D.markSolved(s3, `${day(2)}`, `${day(2)}`) === false && !s3.solved[`${day(2)}`] && !stored(d3).solved[`${day(2)}`]);
    const back3 = pageAt(`${day(2)}T11:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify(stored(d3)) } }); await tick();
    ok("R6b · coming back after a reveal: the winning play in words and the explanation, no battle loaded — the winning play said ONCE, in the panel", said(back3).indexOf("The winning play: " + w3.play) === 0 && once(back3, covered(back3)) && !doc(back3).getElementById("dd-frame") && !doc(back3).getElementById("dd-after").hidden);
    // the next day after a reveal starts again from 1
    const P4 = byDate(`${day(3)}`), w4 = winnerOf(P4);
    const d4 = pageAt(`${day(3)}T10:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify(s3) } }); await tick();
    (await framed(d4)).try(lineOf(w4)); await tick();
    ok("R7 · the day after a reveal, a solve starts the streak again at 1 (best stays 2)", doc(d4).getElementById("dd-streak").textContent === "1" && stored(d4).best === 2);

    // a missed day: nothing on day 4, solved day 5 → 1
    const P6 = byDate(`${day(5)}`), w6 = winnerOf(P6);
    const d6 = pageAt(`${day(5)}T10:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify(stored(d4)) } }); await tick();
    ok(`M1 · a MISSED day ends the streak: with ${dm(4)} unplayed, on ${dm(5)} the open streak is 0`, D.streak(stored(d6), `${day(5)}`) === 0);
    (await framed(d6)).try(lineOf(w6)); await tick();
    ok(`M2 · …and solving ${dm(5)} starts again at 1`, doc(d6).getElementById("dd-streak").textContent === "1");

    // the reveal on an EARLIER puzzle: no confirm, and never the today-only line
    const P8 = byDate(`${day(1)}`), l8 = loserOf(P8);
    const d8 = pageAt(`${day(5)}T09:00:00Z`, { q: `?d=${day(1)}`, store: { [D.STORE_KEY]: JSON.stringify(stored(d6)) } }); await tick();
    const f8 = await framed(d8);
    const keep8 = JSON.stringify(stored(d8));
    f8.try(plainLine(l8)); await tick();
    click(d8, "#dd-actions .dd-btn", "Show me the answer");
    await new Promise((r) => setTimeout(r, 120));
    ok("R8 · revealing an EARLIER puzzle: no streak warning, the move plays in the battle, and the note never says 'Today doesn't count…' — only 'Earlier puzzles don't count toward your streak.'",
      doc(d8).getElementById("dd-confirm").hidden && said(d8).indexOf("The winning play: ") === 0 && f8.got.some((m) => m.type === "puzzle:perform")
        && doc(d8).getElementById("dd-afternote").textContent === "Earlier puzzles don't count toward your streak."
        && doc(d8).querySelector("main").textContent.indexOf("Today doesn't count as solved") < 0 && JSON.stringify(stored(d8)) === keep8);

    // an earlier puzzle: playable for fun, never touches the streak
    const before = JSON.stringify(stored(d6));
    const P7 = byDate(`${day(4)}`), w7 = winnerOf(P7);
    const d7 = pageAt(`${day(6)}T11:00:00Z`, { q: `?d=${day(4)}`, store: { [D.STORE_KEY]: before } }); await tick();   // day 6 still OPEN
    ok(`E1 · an earlier puzzle opens from the list (${dm(4)}, marked as earlier)`, doc(d7).getElementById("dd-date").textContent === `${day(4)} · an earlier puzzle`);
    (await framed(d7)).try(lineOf(w7)); await tick();
    ok("E2 · solving an EARLIER puzzle wins the round but does NOT mark it solved or change the streak, and says so",
      /^You win the round/.test(said(d7)) && once(d7, covered(d7)) && JSON.stringify(stored(d7)) === before && doc(d7).getElementById("dd-afternote").textContent === "Earlier puzzles don't count toward your streak.");

    // the hidden-tab fast-forward: the frame flags the result (cut) — the engine still scored the round, so it counts
    const dc = pageAt(`${day(0)}T09:00:00Z`); await tick();
    const fc = await framed(dc);
    fc.try(plainLine(l), { cut: true }); await tick();
    const wrongCut = said(dc);
    const again = [...doc(dc).querySelectorAll("#dd-coveracts .dd-btn")].find((x) => x.textContent === "Try again"); if (again) again.click();
    fc.try(lineOf(w), { cut: true }); await tick();
    ok("H1 · a try cut short by a hidden tab (flagged cut by the frame) still scores exactly: the wrong one is 'Not this one', the winning one solves the day",
      /^Not this one/.test(wrongCut) && said(dc) === "You win the round, " + w.you + "–" + w.them + "." && stored(dc).solved[`${day(0)}`] && doc(dc).getElementById("dd-streak").textContent === "1", wrongCut + " | " + said(dc));
    // the frame's words are believed only from the page's own frame, same origin
    const dx = pageAt(`${day(0)}T09:30:00Z`); await tick();
    const fx = await framed(dx);
    fx.send({ type: "puzzle:result", id: P.id, win: true, you: 99, them: 0 }, { origin: "https://evil.example" });
    fx.send({ type: "puzzle:result", id: P.id, win: true, you: 99, them: 0 }, { source: dx.window });
    await tick();
    ok("H2 · a result from another origin, or from any window but the page's own frame, is ignored", msg(dx) === "Your opponent has passed. Find the one play that wins this round." && !(stored(dx) && stored(dx).solved[`${day(0)}`]));
  });

  // ═══ A DRAW IS NOT A WIN ═══
  await section("a draw", async () => {
    const P = byDate(`${day(7)}`), draw = PZ.solve(P, E, null).plays.find((p) => !p.win && p.play && p.you === p.them);
    const d = pageAt(`${day(7)}T10:00:00Z`); await tick();
    (await framed(d)).try(plainLine(draw)); await tick();
    ok("W1 · a play that only DRAWS the round (" + draw.you + "–" + draw.them + ") is 'Not this one', not solved", /^Not this one/.test(said(d)) && !(stored(d) && stored(d).solved[`${day(7)}`]), said(d));
  });

  // ═══ THE FALLBACK: the battle can't start → the page's own board (and the Leap through it) ═══
  await section('THE FALLBACK BOARD (and the Leap, the one puzzle that needs it)', async () => {
    const P0 = byDate(`${day(0)}`), w0 = winnerOf(P0);
    const d0 = pageAt(`${day(0)}T10:00:00Z`); await tick();
    await fallback(d0);
    ok("FB1 · the frame reports an error → the frame is removed and the page's own board takes over, nothing lost",
      !doc(d0).getElementById("dd-frame") && doc(d0).querySelectorAll(".dd-hand .dd-card").length > 0 && msg(d0) === "Your opponent has passed. Find the one play that wins this round.");
    play(d0, w0.play, w0.target ? { target: w0.target } : {});
    ok("FB2 · …on the fallback board the winning play still wins and solves the day, the board shown as your play left it",
      /^You win the round/.test(msg(d0)) && stored(d0).solved[`${day(0)}`] && doc(d0).querySelector(".dd-boardnote").textContent === "The board after your play, before the round is scored.");
    ok("FB3 · the page waits 20 s for the battle's first word before it falls back", /var FRAME_WAIT_MS = 20000,/.test(R("play/daily/page.js")));
    const P = byDate(`${day(10)}`), w = winnerOf(P), L = w.line;
    const d = pageAt(`${day(10)}T10:00:00Z`); await tick();
    await fallback(d);
    click(d, ".dd-hand .dd-card", w.play); click(d, "#dd-actions .dd-btn", "Play " + w.play);
    const slots = [...doc(d).querySelectorAll(".dd-slot")];
    ok("L0 · placing a Unit: each slot button says 'Place it here'", slots.length > 0 && slots.every((b) => b.textContent === "Place it here" && b.getAttribute("aria-label") === "Place it here"));
    slots[L.pos == null ? 0 : L.pos].click();
    click(d, "#dd-actions .dd-btn", "End my turn");
    ok(`L1 · ${dm(10)}: the right card WITHOUT the Leap loses ('Not this one')`, /^Not this one/.test(msg(d)), msg(d));
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
    const dl = pageAt(`${day(10)}T11:00:00Z`); await tick();
    (await framed(dl)).try(lineOf(w)); await tick();
    ok("L4 · in the battle frame, the try reported with the solver's Leap wins it too (the frame plays the Leap itself)", /^You win the round/.test(said(dl)), said(dl));
  });

  // ═══ STORAGE BLOCKED ═══
  await section('STORAGE BLOCKED', async () => {
    const P = byDate(`${day(0)}`), w = winnerOf(P);
    let threw = null;
    let d;
    try { d = pageAt(`${day(0)}T10:00:00Z`, { blocked: true }); await tick(); (await framed(d)).try(lineOf(w)); await tick(); } catch (e) { threw = e; }
    ok("S1 · storage BLOCKED: the page still loads, the battle plays and the round is won", !threw && /^You win the round/.test(said(d)), threw && threw.message);
    ok("S2 · …and says plainly that progress isn't being saved", doc(d).getElementById("dd-store").textContent === "This browser isn't saving your progress, so your streak won't be kept.");
    const junk = pageAt(`${day(0)}T10:00:00Z`, { store: { [D.STORE_KEY]: "{not json" } }); await tick();
    ok("S3 · a corrupt store is treated as empty, never as an error", msg(junk) === "Your opponent has passed. Find the one play that wins this round.");
    const odd = pageAt(`${day(0)}T10:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify({ v: 1, solved: null, revealed: [], best: "x" }) } }); await tick();
    ok("S4 · a record of the wrong SHAPE (valid JSON, solved: null) is treated as empty too — the puzzle still shows",
      msg(odd) === "Your opponent has passed. Find the one play that wins this round.", msg(odd));
  });

  // ═══ THE FRAME ITSELF (the synced copy): what it says, how it is reached ═══
  await section('THE FRAME ITSELF (the synced game copy)', async () => {
    const G = R("game/index.html");
    const blk = G.slice(G.indexOf("const PUZZLE_MODE ="), G.indexOf("\nfunction pump(){"));
    const ALLOWED = ["type", "id", "tries", "sheets", "clips", "actors", "performed", "win", "you", "them", "winner", "events", "steps", "choreoMs", "wallMs", "reducedMotion", "cut", "code", "message"];
    const posts = blk.match(/pzPost\(\{[\s\S]*?\}\);/g) || [];
    const keys = [...new Set(posts.flatMap((p) => (p.match(/[{,]\s*([A-Za-z]+)\s*:/g) || []).map((k) => k.replace(/[{,:\s]/g, ""))))];
    ok("K2 · the frame's own words carry only results: every message it posts uses only " + ALLOWED.length + " named fields (result, score, events, timings, what loaded) — no line, no play, no answer",
      posts.length >= 4 && keys.every((k) => ALLOWED.indexOf(k) >= 0) && /type:'puzzle:error', code: String/.test(blk), JSON.stringify(keys.filter((k) => ALLOWED.indexOf(k) < 0)));
    ok("K2b · the frame plays the answer only when it is handed one: its one road to a played line is puzzle:perform, and nothing in it solves the puzzle",
      /m\.type === 'puzzle:perform'\) pzPerform\(m\.line\)/.test(blk) && !/\.solve\(|solve\(/.test(blk));
    ok("FR1 · the copy is the game's puzzle mode (game/STAMP " + STAMP + "): no tap-to-skip, no AI, battle music never fetched",
      /layer\.onclick=PUZZLE_MODE \? null : skipChoreo;/.test(G) && /if \(PUZZLE_MODE\)\{ pzPump\(\); return; \}/.test(G) && /filter\(\(\[k\]\)=>!\(PUZZLE_MODE && \(k==='menu'\|\|k==='battle'\)\)\)/.test(G));
    // GUEST-PLAY-1 (2026-10-26): there is no pass and no redirect for ANY road now — the frame is still recognised (same
    //   origin, parent under /play/daily/, ?puzzle=1) so the gem and the solo tag stay out of it
    ok("FR2 · the copy recognises ONLY the Daily Puzzle's own frame (framed, same origin, parent under /play/daily/, ?puzzle=1): no road is redirected any more (GUEST-PLAY-1), and the gem and the solo tag stay out of that frame",
      /dailyFrame = window\.top !== window && \/\[\?&\]puzzle=1\(&\|\$\)\/\.test\(location\.search\) && window\.parent\.location\.origin === location\.origin && \/\^\\\/play\\\/daily\\\/\/\.test\(window\.parent\.location\.pathname\);/.test(G)
        && G.indexOf('location.replace("../rite.html")') < 0 && /if \(dailyFrame\) return;/.test(G) && /if \(dailyFrame \|\| wireFrame \|\| !SOLO_TAG\.enabled\) return;/.test(G));
    ok("FR3 · the frame loads the site's own puzzle code, from the page's folder (../play/daily/puzzle-core.js)", /const PZ_CORE_URL = '\.\.\/play\/daily\/puzzle-core\.js';/.test(G));
  });

  // ═══ THE IN-BROWSER SOLVER = THE OFFLINE SOLVER ═══
  await section('THE IN-BROWSER SOLVER = THE OFFLINE SOLVER', async () => {
    const dom = pageAt(`${day(0)}T10:00:00Z`); await tick();
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
    // N2b — the leak that slipped past N2 (2026-10-23): a test pinned a CLAUSE of a batch-2 explanation inside a longer
    // sentence, and a code comment used a phrase from another as its example. So also check every clause (split at . ; : — , →)
    // that names a card or a number, and every 5-word run holding both a number and a name — in every served file except notes.js
    const corpusX = tracked.filter((f) => f !== "play/daily/notes.js").map((f) => { try { return fs.readFileSync(path.join(SITE, f), "utf8"); } catch (e) { return ""; } }).join("\n");
    const frags = new Set();
    decoded.forEach((t) => t.split(/[.;:—,→]\s+|\s+—\s+/).map((c) => c.trim()).forEach((c) => {
      if (c.length >= 22 && (/\d/.test(c) || /\s[A-Z][a-z]/.test(c))) frags.add(c);
      const w = c.split(/\s+/);
      for (let i = 0; i + 5 <= w.length; i++) { const g = w.slice(i, i + 5).join(" "); if (/\d/.test(g) && /(^|\s)[A-Z][a-z]{2,}/.test(g.replace(/^\S+/, ""))) frags.add(g); }
    }));
    const fragHits = [...frags].filter((f) => corpusX.indexOf(f) >= 0);
    ok("N2b · not one explanation CLAUSE or name-and-number phrase (" + frags.size + " checked) appears in any served file but the encoded notes", frags.size > 300 && fragHits.length === 0, fragHits.length + " found (not printed: the log is public)");
    ok("N3 · no answer key: no answers.json, no \"answer\" object anywhere", !fs.existsSync(path.join(DIR, "answers.json")) && !/"answer"\s*:\s*\{/.test(corpus));
    const page = R("play/daily/page.js") + R("play/daily/index.html") + R("play/daily/daily.js");
    const winningNames = PUZZLES.map((P) => winnerOf(P).play);
    const inPage = winningNames.filter((n) => page.indexOf('"' + n + '"') >= 0 || page.indexOf("'" + n + "'") >= 0);
    ok("N4 · the page's own code names no winning card", inPage.length === 0, inPage.join(", "));
    // N5 — the leak that slipped past N1–N4 once (a test comment naming puzzle 1's winner beside "wins"): no Daily Puzzle
    // file may carry a line that names a winning card (or its target) together with a win/answer word
    const dpFiles = ["play/daily/index.html", "play/daily/page.js", "play/daily/daily.js", "play/daily/notes.js", "play/daily/puzzle-core.js",
      "tests/suites/puzzles.js", "tests/suites/daily.js", "scripts/puzzle-solve.js", "scripts/daily-notes-encode.js",
      "scripts/puzzle-answer-digest.js", "docs/MINI_GAMES_R1_DAILY_PUZZLE.md", "tests/fixtures/daily-answers.sha256.json",
      "scripts/daily-gen/lib.js", "scripts/daily-gen/batch.js", "tests/suites/dailygen.js",
      "scripts/daily-gen/job.js", "tests/suites/dailyjob.js"];   // + the generator (R1, 2026-10-16)
    const wnames = [...new Set(PUZZLES.flatMap((P) => { const w = winnerOf(P); return [w.play, w.target && w.target.replace(/#\d+$/, "")].filter(Boolean); }))].map((n) => n.toLowerCase());
    const WORD = /\b(win|wins|won|winning|winner|answer|solution|solves|correct)\b/i;
    const leaks = [];
    dpFiles.forEach((f) => R(f).split("\n").forEach((l, i) => { const low = l.toLowerCase(); if (wnames.some((n) => low.indexOf(n) >= 0) && WORD.test(l)) leaks.push(f + ":" + (i + 1)); }));
    ok("N5 · no Daily Puzzle file has a line naming a winning card beside a win/answer word (" + dpFiles.length + " files, " + wnames.length + " names)", leaks.length === 0, leaks.join(" "));
    // Daily Puzzle Effects R2: the frame's code in the game copy, and the sync's gate road, are Daily Puzzle files too
    const G = R("game/index.html"), gblk = G.slice(G.indexOf("const PUZZLE_MODE ="), G.indexOf("\nfunction pump(){")).split("\n");
    const gleaks = gblk.concat(R("scripts/sync_game.sh").split("\n").filter((l) => /dailyFrame|Daily Puzzle/.test(l)))
      .filter((l) => { const low = l.toLowerCase(); return wnames.some((n) => low.indexOf(n) >= 0) && WORD.test(l); });
    ok("N6 · nor does the battle frame's puzzle code in the game copy (" + gblk.length + " lines), nor the sync's Daily Puzzle lines", gblk.length > 100 && gleaks.length === 0, gleaks.join(" | "));
  });

  // ═══ THE RULES, DIRECTLY ═══
  // ═══ MINI-GAMES-2 (owner ruling 2026-10-16): THE MULLIGAN LOOK, IN EVERY STATE ═══
  await section("THE MULLIGAN LOOK", async () => {
    const plaques = (dom, sel) => [...doc(dom).querySelectorAll(sel)];
    const allPlaque = (dom, sel) => { const b = plaques(dom, sel); return b.length > 0 && b.every((x) => x.classList.contains("mg-btn")); };
    const stageOK = (dom) => !!doc(dom).querySelector("body > .mg-stage .mg-plate");
    const back = (dom) => doc(dom).querySelector(".dd-top [data-back-to-game]");
    // ready (today open; two earlier puzzles)
    const r = pageAt(`${day(2)}T08:00:00Z`); await tick(); const fr = await framed(r);
    ok("ML1 · PUZZLE READY: the mulligan background behind the page (dimmed behind the battle), '← Back to the game' and every earlier puzzle as plaque buttons",
      stageOK(r) && doc(r).body.classList.contains("dd-framing") && back(r).classList.contains("mg-btn") && back(r).textContent === "← Back to the game"
        && allPlaque(r, "#dd-pastlist a") && plaques(r, "#dd-pastlist a").length === 2 && plaques(r, "#dd-pastlist a").every((a) => /^\?d=\d{4}-\d{2}-\d{2}$/.test(a.getAttribute("href"))));
    // a wrong try, then the confirm
    fr.try(plainLine(loserOf(byDate(day(2))))); await tick();
    const box = doc(r).querySelector("#dd-cover .dd-coverbox");
    ok("ML2 · A WRONG TRY: the result in a framed mulligan panel over the dimmed battle, 'Try again' and 'Show me the answer' as plaque buttons",
      !!box && box.classList.contains("mg-panel") && box.contains(doc(r).getElementById("dd-covertext")) && allPlaque(r, "#dd-coveracts button") && allPlaque(r, "#dd-actions button")
        && plaques(r, "#dd-actions button").some((b) => b.textContent === "Show me the answer"));
    click(r, "#dd-actions .dd-btn", "Show me the answer");
    ok("ML3 · THE REVEAL CONFIRM: a framed panel; 'Show the answer' and 'Keep trying' as plaque buttons",
      !doc(r).getElementById("dd-confirm").hidden && doc(r).querySelector("#dd-confirm .dd-modalbox").classList.contains("mg-panel") && allPlaque(r, "#dd-confirm button")
        && plaques(r, "#dd-confirm button").map((b) => b.textContent).join("|") === "Show the answer|Keep trying");
    click(r, "#dd-confirm-no");
    // solved (coming back the same day)
    const sv = pageAt(`${day(2)}T09:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify({ v: 1, solved: { [day(1)]: true, [day(2)]: true }, revealed: {}, best: 2 }) } }); await tick();
    const svText = doc(sv).getElementById("dd-play").textContent;
    ok("ML4 · SOLVED: 'You've solved today's puzzle.' ONCE — in the framed result panel, not under the title; the panel is compact (no empty button row); 'How it was won' framed; Streak / Best streak / Next puzzle in as three framed stat boxes; the background no longer dimmed",
      msg(sv) === "" && svText.split("You've solved today's puzzle.").length === 2 && covered(sv) === "You've solved today's puzzle." && doc(sv).getElementById("dd-coveracts").children.length === 0
        && doc(sv).getElementById("dd-after").classList.contains("mg-panel") && [...doc(sv).querySelectorAll(".dd-stats .mg-stat dt")].map((x) => x.textContent).join("|") === "Streak|Best streak|Next puzzle in"
        && !doc(sv).body.classList.contains("dd-framing") && /\.dd-coverbox \.dd-actions:empty \{ display: none; \}/.test(R("play/daily/daily.css")));
    // revealed
    const rv = pageAt(`${day(2)}T09:00:00Z`, { store: { [D.STORE_KEY]: JSON.stringify({ v: 1, solved: {}, revealed: { [day(2)]: true }, best: 0 }) } }); await tick();
    ok("ML5 · REVEALED: the answer in the framed result panel, the explanation framed below it", !!covered(rv) && doc(rv).querySelector("#dd-cover .dd-coverbox").classList.contains("mg-panel")
      && !doc(rv).getElementById("dd-after").hidden && doc(rv).getElementById("dd-after").classList.contains("mg-panel"));
    // an archive day, after the batch
    const last = PUZZLES.map((p) => p.date).sort().pop();
    const np = pageAt(`${D.addDays(last, 3)}T08:00:00Z`); await tick();
    ok("ML6 · AN ARCHIVE DAY: the background, the archive line, and every other earlier puzzle as a plaque button", stageOK(np) && doc(np).getElementById("dd-archive").textContent === "Today's puzzle is on its way. Here is one from the archive."
      && allPlaque(np, "#dd-pastlist a") && plaques(np, "#dd-pastlist a").length === PUZZLES.length - 1 && back(np).classList.contains("mg-btn"));
    // the page's own fallback board: its buttons too
    const fb = pageAt(`${day(0)}T08:00:00Z`); await tick(); await fallback(fb);
    click(fb, ".dd-hand .dd-card");
    ok("ML7 · THE FALLBACK BOARD: its buttons ('Play …', 'End my turn', 'Leap', 'Show me the answer') are plaque buttons too", allPlaque(fb, "#dd-actions button") && plaques(fb, "#dd-actions button").some((b) => /^Play /.test(b.textContent))
      && /function btn\(text, cls, fn\) \{ var b = el\("button", "dd-btn mg-btn "/.test(R("play/daily/page.js")));
    const css = R("play/daily/daily.css"), html = R("play/daily/index.html");
    ok("ML8 · the plaque wins every button (the page's old button paint is gone), the page never scrolls sideways, and the stamps moved (daily.css d6, page.js d7, mini.css g2 — on both mini games)",
      !/\.dd-btn \{/.test(css) && !/\.dd-btn\.dd-go/.test(css) && /body\.daily \{[^}]*overflow-x: hidden/.test(css) && /body\.dd-framing \.mg-stage \{ opacity: \.35; \}/.test(css)
        && /daily\.css\?v=d6/.test(html) && /page\.js\?v=d7/.test(html) && /shared\/mini\.css\?v=g2/.test(html) && /shared\/mini\.css\?v=g2/.test(R("play/smriti/index.html")));
  });

  await section('THE RULES, DIRECTLY', async () => {
    const s = D.blank();
    ok("U1 · solving a day that is not today never counts", D.markSolved(s, `${day(0)}`, `${day(1)}`) === false && !s.solved[`${day(0)}`]);
    ok("U2 · revealing an earlier day never counts against you", D.markRevealed(s, `${day(0)}`, `${day(1)}`) === false && !s.revealed[`${day(0)}`]);
    D.markSolved(s, `${day(1)}`, `${day(1)}`);
    ok("U3 · after solving today, 'Show me the answer' costs nothing (the explanation is free)", D.markRevealed(s, `${day(1)}`, `${day(1)}`) === false && D.streak(s, `${day(1)}`) === 1);
    const bad = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
    ok("U4 · a store that throws on read and write: load gives an empty record, save reports false", JSON.stringify(D.load(bad)) === JSON.stringify(D.blank()) && D.save(bad, s) === false);
  });

  DOMS.forEach((d) => { try { d.window.close(); } catch (e) {} });
  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
