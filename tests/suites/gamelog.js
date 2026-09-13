"use strict";
// SYNC-NARRATOR-1 — THE BATTLE LOG, THROUGH THE SYNCED COPY.   node tests/suites/gamelog.js
//
// The site's game/ copy, exactly as scripts/sync_game.sh leaves it — index.html with the gate preamble, the S3
// suppression and the cross-links; game/src/chapters.js; game/src/narrator.js — runs in jsdom as a Hall battle frame
// loads it: ?wire=1, every <script> in page order, the gate pass present. The stub frames in freedoor/stakedframe
// prove the Hall's half of the wire; this proves the FRAME's half of the battle log on the bytes Pages will serve:
// the recorder is on, the VIEW BATTLE LOG button and panel are on the real free face and the real staked face, and a
// forfeit and a vanish-and-return still close with the sealed lines. The server room and the redacted views are the
// web3 match server's own (H.MS), the source every Hall suite boots. No chain.
const path = require("path"), fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const H = require("../lib.js");

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const J = (x) => JSON.stringify(x);
const GAME = path.join(H.SITE, "game");

function need(p, what) { if (!fs.existsSync(p)) { console.log("  ✖ REFUSING TO RUN — " + what + " is missing at " + p + ". NOTHING WAS PROVEN."); process.exit(1); } }
need(path.join(GAME, "index.html"), "the synced game copy");
need(path.join(GAME, "src", "narrator.js"), "the synced narrator (run scripts/sync_game.sh)");
need(path.join(H.MS, "src", "match.js"), "the web3 match server");
const HTML = fs.readFileSync(path.join(GAME, "index.html"), "utf8");
const N = require(path.join(GAME, "src", "narrator.js"));   // the synced narrator itself: the lines the panel must show
const { createRoom } = require(path.join(H.MS, "src", "match.js"));
const { buildView } = require(path.join(H.MS, "src", "redactedview.js"));
const ES = require(path.join(H.MS, "src", "engineguard.js")).loadGuardedEngine().engine;

// ── the synced page, booted as the Hall's battle frame ──
function boot() {
  const errs = [], posted = [], external = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errs.push(String(e && e.message))); vc.on("error", (...a) => errs.push(a.join(" "))); vc.on("log", (...a) => errs.push("console.log: " + a.join(" ")));
  const scripts = [];
  const markup = HTML.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (m, attrs, body) => {
    const src = /\bsrc="([^"?]+)/.exec(attrs);
    if (!src) scripts.push(body);
    else if (/^https?:/.test(src[1])) external.push(src[1]);
    else scripts.push(fs.readFileSync(path.join(GAME, src[1]), "utf8"));
    return "";
  });
  const dom = new JSDOM(markup, { url: "https://divyayuddha.games/game/index.html?v=" + fs.readFileSync(path.join(GAME, "STAMP"), "utf8").trim() + "&wire=1", pretendToBeVisual: true, runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window;
  w.sessionStorage.setItem("dyw_pass", "1");   // the site pass the gate preamble checks (a courtesy door, not security)
  w.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => k === "measureText" ? () => ({ width: 10 }) : /^create(Linear|Radial)Gradient$|^createPattern$/.test(String(k)) ? () => ({ addColorStop() {} }) : k === "getImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : () => undefined, set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {}; w.HTMLMediaElement.prototype.load = () => {};
  w.fetch = () => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)), json: () => Promise.resolve({}), text: () => Promise.resolve("") });
  w.scrollTo = () => {};
  w.postMessage = (m) => posted.push(JSON.parse(JSON.stringify(m)));   // the frame's wirePost → the Hall
  w.eval(scripts.join("\n;\n") + "\n;window.__T = { get G(){ return G; }, get BLog(){ return BLog; }, get Wire(){ return Wire; }, get ME(){ return ME; } };");
  const say = (data) => w.onWireMessage({ origin: w.location.origin, source: w.parent, data: JSON.parse(JSON.stringify(data)) });
  return { w, T: w.__T, errs, posted, external, say, scripts: scripts.length };
}
const $ = (w, id) => w.document.getElementById(id);
const hidden = (w, id) => $(w, id).classList.contains("hidden");
const btnTexts = (w) => [...w.document.querySelectorAll("#gameover .go-btns button")].map((b) => b.textContent);
const expected = (T) => N.withRoundHeaders(T.BLog.lines).map((l) => [l.kind === "header" ? "bl-hdr" : l.kind === "gap" ? "bl-gap" : (l.side === "me" || l.side === "foe") ? l.side : "sys", l.text]);
const shown = (w) => [...$(w, "bl-body").children].map((d) => [d.className, d.textContent]);
const underHeaders = (T) => { let cur = null, good = true; const seen = [];
  N.withRoundHeaders(T.BLog.lines).forEach((l) => { if (l.kind === "header") { if (!/^— Round \d+ —$/.test(l.text)) good = false; cur = l.round; seen.push(cur); } else if (l.kind !== "gap" && l.round !== cur) good = false; });
  return good && J(seen) === J([...new Set(T.BLog.lines.filter((l) => l.kind !== "gap").map((l) => l.round))]); };
const openLog = (w) => { const b = $(w, "go-log"); if (!b) return false; b.click(); return !hidden(w, "battlelog"); };
const SEATISH = /0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}|\{p[01]\}|0x1{4,}|0x2{4,}/;
const wallHits = [];

// ── a server match: the room's relayed moves, and each seat's redacted view (the Hall's strip applied) after every action ──
function serverMatch(opts) {
  const mid = opts.mid, room = createRoom(ES, { seed: opts.seed, seats: [{ address: "0x" + "1".repeat(40), faction: opts.f0 }, { address: "0x" + "2".repeat(40), faction: opts.f1 }] });
  const sg = room.state, hall = (v) => { const c = JSON.parse(JSON.stringify(v)); delete c.myName; delete c.oppName; return c; };
  const out = { mid, f0: opts.f0, f1: opts.f1, seed: opts.seed, moves: [], views: [[], []], start: [0, 1].map((s) => hall(buildView({ E: ES }, room, mid, s, null, []))), resync: null };
  let cursor = sg.events.length;
  const step = (s, a) => {
    const hc = a.type === "play" ? sg.players[s].hand[a.handIndex] : null;
    const r = room.apply(s, a); out.moves.push(r);
    const lm = hc ? { seat: s, type: "play", id: hc.id, n: hc.n } : { seat: s, type: a.type };
    const slice = sg.events.slice(cursor); cursor = sg.events.length;
    for (const v of [0, 1]) out.views[v].push(hall(buildView({ E: ES }, room, mid, v, lm, slice)));
    if (out.moves.length === opts.K) out.resync = [0, 1].map((v) => hall(buildView({ E: ES }, room, mid, v, null, [])));
  };
  step(0, { type: "mulligan", indices: [0, 1] }); step(1, { type: "mulligan", indices: [] });
  let guard = 0;
  while (!sg.over && guard++ < 500 && out.moves.length < (opts.limit || 1e9)) {
    const s = room.turn, pl = sg.players[s];
    if (ES.canLeap(sg, s) && guard % 4 === 0) { const bl = ES.bestLeap(sg, s); if (bl) { const a = { type: "leap", leaperIndex: pl.units.indexOf(bl.leaper), targetIndex: pl.units.indexOf(bl.target) }; if (room.validate(s, a).ok) step(s, a); } }
    const d = ES.aiMove(sg, s);
    let a = (d && d.play != null && guard % 11 !== 5) ? { type: "play", handIndex: d.play, targetIndex: null } : { type: "pass" };
    if (a.type === "play") { const sp = ES.targetSpec(sg, s, pl.hand[d.play]); if (sp && sp.options && sp.options.length) a.targetIndex = 0; }
    if (!room.validate(s, a).ok) a = { type: "pass" };
    step(s, a);
  }
  out.over = !!sg.over; out.winner = sg.winner; out.roundWins = [sg.players[0].roundWins, sg.players[1].roundWins];
  return out;
}
const freeStart = (P, M, seat) => P.say({ type: "wire:start", matchId: M.mid, seat, seed: M.seed, p0Faction: M.f0, p1Faction: M.f1 });
const freeMoves = (P, M) => M.moves.forEach((r) => P.say({ type: "wire:move", matchId: M.mid, seq: r.seq, move: r.move }));
const stakedViews = (P, M, seat, from, upto) => { let seq = 0; M.views[seat].slice(from, upto).forEach((v) => P.say({ type: "wire:view", matchId: M.mid, seq: ++seq, view: v })); };

console.log("── SYNC-NARRATOR-1 · the battle log through the synced copy (game/ at " + fs.readFileSync(path.join(GAME, "STAMP"), "utf8").trim() + ") ──");

// ═══ the page boots as the Hall's frame, the recorder on ═══
{
  const P = boot();
  ok("G1 · the synced page boots as a Hall battle frame (?wire=1, " + P.scripts + " scripts in page order — the gate preamble first) with no script error and nothing loaded from off-site",
     P.errs.length === 0 && P.external.length === 0 && P.scripts >= 5 && P.posted.some((m) => m.type === "wire:ready"), P.errs.slice(0, 2).concat(P.external).join(" | "));
  ok("G2 · the page reads game/src/narrator.js: window.NARRATOR is the synced narrator (the same gap line, the same forfeit line)",
     !!P.w.NARRATOR && P.w.NARRATOR.GAP_TEXT === N.GAP_TEXT && P.w.NARRATOR.FORFEIT_WON === "Your opponent left the table." && typeof P.w.NARRATOR.withRoundHeaders === "function");
}

// ═══ the free face ═══
{
  const M = serverMatch({ mid: "m-sync-free", seed: 90913001, f0: "devas", f1: "asuras" });
  const F = boot(); const { w, T } = F;
  freeStart(F, M, 0);
  ok("G3 · the recorder is ON in the synced frame (it was off before this sync: no narrator file, no log)", !!T.BLog && T.BLog.road === "free");
  freeMoves(F, M); F.say({ type: "wire:result", matchId: M.mid, winner: M.winner, roundWins: M.roundWins, forfeit: false });
  ok("G4 · a full relayed match (" + M.moves.length + " moves) ends on the real free face, and VIEW BATTLE LOG is on it beside RETURN TO THE HALL",
     M.over && T.G.over && !hidden(w, "gameover") && T.Wire.refused.length === 0 && J(btnTexts(w)) === J(["RETURN TO THE HALL", "VIEW BATTLE LOG"]), J(btnTexts(w)) + " " + J(T.Wire.refused));
  const up = openLog(w), got = shown(w), want = expected(T);
  ok("G5 · the panel opens and shows every recorded line in order under its round header, ending in the result (" + got.length + " rows), recorder errors 0",
     up && J(got) === J(want) && underHeaders(T) && T.BLog.lines[T.BLog.lines.length - 1].kind === "result" && T.BLog.errors === 0 && !$(w, "bl-body").querySelector(".bl-err"));
  ok("G6 · each line shown AS RECORDED — no second grammar pass (no \"You pas.\"; every row equal to its recorded text)",
     !got.some((r) => /\bYou pas\./.test(r[1])) && T.BLog.lines.every((l) => got.some((r) => r[1] === l.text)));
  wallHits.push(...got.filter((r) => SEATISH.test(r[1])).map((r) => r[1]));
  $(w, "bl-close").click(); F.posted.length = 0; $(w, "wire-leave").click();
  ok("G7 · close returns to the free face intact, and RETURN TO THE HALL still posts wire:leave",
     hidden(w, "battlelog") && !hidden(w, "gameover") && F.posted.length === 1 && J(F.posted[0]) === J({ type: "wire:leave", matchId: M.mid }), J(F.posted));
  // the forfeit: seat 0 wins, seat 1 left
  const MF = serverMatch({ mid: "m-sync-forfeit", seed: 90913002, f0: "vanaras", f1: "nagas", limit: 12 });   // cut early: a forfeit needs a live board (at 24 this seed has already ended 2–0)
  const last = [];
  for (const seat of [0, 1]) {
    const X = boot();
    freeStart(X, MF, seat); freeMoves(X, MF); X.say({ type: "wire:result", matchId: MF.mid, winner: 0, roundWins: [0, 0], forfeit: true });
    const rows = !X.T.G.over && !hidden(X.w, "gameover") && J(btnTexts(X.w)) === J(["RETURN TO THE HALL", "VIEW BATTLE LOG"]) && openLog(X.w) ? shown(X.w) : [];
    last.push(rows.length && J(rows) === J(expected(X.T)) ? rows[rows.length - 1][1] : "face/rows mismatch");
    wallHits.push(...rows.filter((r) => SEATISH.test(r[1])).map((r) => r[1]));
  }
  ok("G8 · a FORFEIT through the synced copy (" + MF.moves.length + " moves, the board still live): the panel opens on both seats' faces, closing \"" + last[0] + "\" / \"" + last[1] + "\"",
     !MF.over && last[0] === "Your opponent left the table." && last[1] === "You left the table.", MF.over ? "fixture: the match had already ended - no forfeit to show" : "");
}

// ═══ the staked face ═══
{
  const K = 18, M = serverMatch({ mid: "m-sync-staked", seed: 90913003, f0: "nagas", f1: "devas", K });
  const key = "dy_blog:" + M.mid;
  const A = boot();
  A.say({ type: "wire:start", matchId: M.mid, seat: 0, view: M.start[0], p0Faction: M.f0, p1Faction: M.f1 });
  stakedViews(A, M, 0, 0, K);
  const kept = A.w.sessionStorage.getItem(key), keptLines = kept ? JSON.parse(kept).lines : [];
  ok("G9 · the staked frame keeps its log in sessionStorage under dy_blog:<matchId> (" + keptLines.length + " lines) — beside the gate's own dyw_pass, untouched by the localStorage namespace shim",
     keptLines.length > 5 && J(keptLines) === J(A.T.BLog.lines) && A.w.sessionStorage.getItem("dyw_pass") === "1" && A.T.Wire.refused.length === 0, J(A.T.Wire.refused));
  A.say({ type: "wire:result", matchId: M.mid, winner: 0, roundWins: [0, 0], forfeit: true });
  const aRows = !A.T.G.over && !hidden(A.w, "gameover") && J(btnTexts(A.w)) === J(["RETURN TO THE HALL", "VIEW BATTLE LOG"]) && openLog(A.w) ? shown(A.w) : [];
  ok("G10 · the real STAKED face after a forfeit: the button, the panel, the log closing \"Your opponent left the table.\"",
     aRows.length > 0 && J(aRows) === J(expected(A.T)) && aRows[aRows.length - 1][1] === "Your opponent left the table.");
  wallHits.push(...aRows.filter((r) => SEATISH.test(r[1])).map((r) => r[1]));
  const B = boot();
  B.w.sessionStorage.setItem(key, kept); B.w.sessionStorage.setItem("dyw_pass", "1");
  B.say({ type: "wire:start", matchId: M.mid, seat: 0, view: M.resync[0], p0Faction: M.f0, p1Faction: M.f1 });
  stakedViews(B, M, 0, K, M.views[0].length);
  B.say({ type: "wire:result", matchId: M.mid, winner: M.winner, roundWins: M.roundWins, forfeit: false });
  const bUp = M.over && B.T.G.over && !hidden(B.w, "gameover") && J(btnTexts(B.w)) === J(["RETURN TO THE HALL", "VIEW BATTLE LOG"]) && B.T.Wire.refused.length === 0 && openLog(B.w);
  const bRows = bUp ? shown(B.w) : [], bLines = B.T.BLog ? B.T.BLog.lines : [], gapAt = bLines.findIndex((l) => l.kind === "gap");
  ok("G11 · VANISH AND RETURN through the synced copy: the resumed staked match ends on its face with the button, and the panel shows the kept lines, \"… the match resumed here …\", then every later line to the result",
     bUp && J(bRows) === J(expected(B.T)) && gapAt === keptLines.length && J(bLines.slice(0, gapAt)) === J(keptLines) &&
     bRows.some((r) => r[0] === "bl-gap" && r[1] === "… the match resumed here …") && bLines[bLines.length - 1].kind === "result" && underHeaders(B.T),
     "gapAt " + gapAt + " kept " + keptLines.length + " refused " + J(B.T.Wire.refused));
  wallHits.push(...bRows.filter((r) => SEATISH.test(r[1])).map((r) => r[1]));
}

ok("G12 · THE WALL through the synced copy: no wallet short form, address or {p} token in any panel row (" + wallHits.length + ")", wallHits.length === 0, wallHits.slice(0, 2).join(" | "));

console.log("\n" + (fail === 0 ? "✓ ALL " + pass + " CHECKS PASS" : "✖ " + fail + " FAILED / " + pass + " passed"));
process.exit(fail === 0 ? 0 : 1);   // the page's own intervals would keep node alive
