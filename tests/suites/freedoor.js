"use strict";
// S-HALL-FREE-1 — CAN THE HALL PLAY THE DOOR IT ADVERTISES?
//
// It could not. The FREE door had never worked from the Hall — ADVERTISED, DRESSED, AND DEAD since W3-LOBBY-DOORS-1
// landed tier 0 — because no suite ever sat at one. Two traps, in the order a player meets them:
//   TRAP 1  seatSheetHTML did `BigInt(t.stake)` on a free table's NULL stake, inside a click handler. The browser
//           swallows the throw, so TAKE THIS SEAT simply read DEAD and the player never reached trap 2.
//   TRAP 2  the {match} MIRROR frame calls E.newGame, and the Hall stubs E (its staked road is redacted). It threw
//           inside ws.onmessage — in node fatal, in a browser swallowed, the frame lost, the tab left in the lobby.
// This suite sits at the door, permanently.
const path = require("path"), fs = require("fs"), os = require("os");
const { execFileSync } = require("child_process");
const H = require("../lib.js");
const { ethers } = require("ethers"); const WS = require("ws");
const K2 = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const FREE_LINE = "no stakes at this table";
const PRE_FIX_REF = "8af29e6";      // the last commit before S-HALL-FREE-1 — a pin names a COMMIT, never a ref

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const body = (w) => (w.document.body.textContent || "").replace(/\s+/g, " ").trim();
const st = (w) => w.DYHall._state();
const battle = (w) => !!w.document.querySelector(".hall-mhead, .hall-dealing");

async function main() {
  const c = await H.chain();
  const MS = H.MS;
  const { makeServer } = require(path.join(MS, "src/server")); const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby")); const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match")); const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow")); const rng = require(path.join(MS, "src/rng"));
  const servers = [];
  async function server(over) {   // S-HALL-STRIPS-1 — `over` shortens the server's own clocks for the strip proofs
    const D = 10n ** 18n;
    const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: true, NONCE_TTL_MS: 300000, TIERS: [0, 10, 50, 200, 1000],
      TIER_STAKES: { 10: 10n * D, 50: 50n * D, 200: 200n * D, 1000: 1000n * D }, STAKE_MIN: 10n * D, STAKE_MAX: 10000n * D,
      MATCH_RPC_URL: H.RPC, STAKE_ESCROW_ADDRESS: c.escAddr, DYC_ADDRESS: c.dycAddr, STAKING_ENABLED: true, FRIEND_TABLES_WITHHELD: false };
    Object.assign(cfg, over || {});
    const srv = makeServer(cfg);
    makeHub(srv, cfg, makeLobby(cfg.TIERS), () => {}, { E: loadGuardedEngine().engine, rng, createRoom,
      store: makeMatchStore({ file: path.join(os.tmpdir(), "dy_freedoor.jsonl") }),
      escrow: makeEscrowReader({ rpcUrl: H.RPC, escrowAddress: c.escAddr }) });
    await new Promise((r) => srv.listen(0, r));
    const b = { srv, url: "ws://127.0.0.1:" + srv.address().port }; servers.push(b); return b;
  }
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;
  const p2 = new ethers.Wallet(K2, c.provider);

  async function twoHalls(url, opts) {
    const A = await H.hall(url, c.escAddr, c.dycAddr, c.player, c.provider, opts || {});
    const B = await H.hall(url, c.escAddr, c.dycAddr, p2, c.provider, opts || {});
    await H.until(() => st(A.w).signedInAs && st(A.w).feedState === "live", 15000, "A live");
    await H.until(() => st(B.w).signedInAs && st(B.w).feedState === "live", 15000, "B live");
    return { A, B };
  }
  async function openFree(A, B) {
    H.click(A.w, '[data-act="open-sheet"]'); H.click(A.w, '[data-tier-row="free"]'); H.click(A.w, '[data-faction="devas"]');
    H.click(A.w, "[data-open-do]");
    return await H.until(() => (st(B.w).tables || []).filter((x) => !x.staked)[0], 25000, "the free table on the floor");
  }

  // ═══ the PRE-FIX bytes: the door is dead at the plaque ═══
  console.log("\n── the door as it stood ──");
  {
    const preHall = execFileSync("git", ["show", PRE_FIX_REF + ":mp/hall.js"], { cwd: H.SITE, maxBuffer: 8 << 20 }).toString();
    const preMC = execFileSync("git", ["show", PRE_FIX_REF + ":mp/matchclient.js"], { cwd: H.SITE, maxBuffer: 8 << 20 }).toString();
    if (preHall.indexOf("ensureEngine") >= 0) { console.log("  ✖ the pre-fix pin " + PRE_FIX_REF + " already contains the fix"); process.exit(1); }
    ok("F1 · PRE-FIX source: the Hall stubbed the engine and had no way to get one",
       /E: \{\}, W: \{\}, ethers: window\.ethers/.test(preHall) && preMC.indexOf("ensureEngine") < 0);
    ok("F2 · PRE-FIX source: the seat sheet took BigInt of the stake unconditionally — a free table's stake is null",
       /var pot = BigInt\(t\.stake\) \* 2n/.test(preHall));
    const pre = path.join(os.tmpdir(), "dy_freedoor_pre_" + process.pid, "mp");
    fs.mkdirSync(pre, { recursive: true });
    fs.writeFileSync(path.join(pre, "hall.js"), preHall); fs.writeFileSync(path.join(pre, "matchclient.js"), preMC);
    const s0 = await server();
    const { A, B } = await twoHalls(s0.url, { srcDir: path.dirname(pre) });
    const t = await openFree(A, B);
    B.w.document.querySelector('[data-act="seat"][data-tid="' + t.id + '"]').click();
    await H.sleep(400);
    ok("F3 · PRE-FIX behaviour: TAKE THIS SEAT opened NOTHING — the door was dead at the plaque",
       B.w.document.getElementById("hall-sheet-overlay") === null);
    H.teardown(A); H.teardown(B);
  }

  // ═══ NOW: the door plays — in the GAME'S OWN SCREEN (S-HALL-WIRE-1) ═══
  // jsdom cannot run the game (Pixi), so each tab's battle frame is a STUB standing where the game would: it answers
  // wire:ready, reads what the Hall posts it, and sends acts back. What is proven is the HALL'S half of the §2
  // contract. jsdom's postMessage fills neither origin nor source (its own TODO), so the stub speaks through
  // constructed MessageEvents that carry both, and the frame's postMessage is replaced by a recorder.
  console.log("\n── the door, opened: the battle frame ──");
  const WIRE_KEYS = { "wire:start": "matchId,p0Faction,p1Faction,seat,seed,type", "wire:move": "matchId,move,seq,type",
    "wire:reject": "matchId,reason,type", "wire:result": "forfeit,matchId,roundWins,type,winner" };
  const WALL = /0x[0-9a-fA-F]{40}|"(address|opponent|stake|escrow\w*|key|privateKey|signature|slip|p0|p1)"\s*:/;
  function stubFrame(h) {
    const w = h.w, el = w.document.querySelector("#hall-frame-host iframe.hall-frame"), fw = el.contentWindow;
    const rec = [];
    fw.postMessage = (m, o) => rec.push({ m: JSON.parse(JSON.stringify(m)), o });
    const say = (data, over) => w.dispatchEvent(new w.MessageEvent("message", Object.assign({ data, origin: w.location.origin, source: fw }, over || {})));
    const tap = [];   // the server's own {apply} stream on this tab's socket
    const sock = h.sockets[h.sockets.length - 1];
    sock.on("message", (d) => { try { const m = JSON.parse(String(d)); if (m.type === "apply" || m.type === "result" || m.type === "reject") tap.push(m); } catch (e) {} });
    return { el, fw, rec, say, tap, sock, sent: (t) => rec.filter((r) => r.m.type === t) };
  }
  {
    const s1 = await server();
    const { A, B } = await twoHalls(s1.url);
    ok("F4 · a staked-only session has loaded NO engine — the staked road pays nothing for this",
       typeof B.w.newGame !== "function");
    const t = await openFree(A, B);
    B.w.document.querySelector('[data-act="seat"][data-tid="' + t.id + '"]').click();
    await H.sleep(300);
    const ov = B.w.document.getElementById("hall-sheet-overlay");
    ok("F5 · the seat sheet OPENS on a free table", !!ov);
    const sheetTxt = ov.textContent.replace(/\s+/g, " ").trim();
    ok("F6 · and it carries the ruled free line, with NO money copy on a free seat",
       sheetTxt.indexOf(FREE_LINE) >= 0 && sheetTxt.indexOf("Pot ") < 0 &&
       sheetTxt.indexOf("locks in escrow") < 0 && sheetTxt.indexOf("Once both stakes lock") < 0, sheetTxt.slice(0, 180));
    B.w.document.querySelector('[data-faction="nagas"]').click(); await H.sleep(120);
    const go = B.w.document.querySelector("[data-join-do]");
    ok("F7 · TAKE THIS SEAT is live (a free seat needs only a faction)", !!go && !go.disabled);
    go.click();
    await H.until(() => st(A.w).matchView && st(B.w).matchView, 30000, "both tabs in the match");
    ok("F8 · BOTH Hall tabs enter the match", !!st(A.w).matchView && !!st(B.w).matchView);
    await H.until(() => (st(A.w).wire || {}).mounted && (st(B.w).wire || {}).mounted, 20000, "the frame mounted on both screens");
    ok("F38 · the matched moment on a FREE table says \"dealing…\" alone — a free table never says stakes are locked (C3)",
       (A.w.document.querySelector(".hall-dealing-line") || {}).textContent === "dealing…", (A.w.document.querySelector(".hall-dealing-line") || {}).textContent);
    await H.sleep(2600);   // past the 2s beat; the frames have NOT said wire:ready
    ok("F39 · the beat HOLDS past its 2s while the frame is not ready — the frame loads full-size but unseen beneath it (R5)",
       !!A.w.document.querySelector(".hall-dealing") && A.w.document.getElementById("hall-frame-host").classList.contains("dealing") &&
       !A.w.document.getElementById("hall-frame-host").hidden);
    ok("F10 · the engine is loaded now — and it is the site's own copy (R6: the Hall's mirror stays beside the frame)",
       typeof A.w.newGame === "function" && typeof B.w.newGame === "function");
    const stamp = fs.readFileSync(path.join(H.SITE, "game/STAMP"), "utf8").trim();
    await H.until(() => (A.w.document.querySelector("#hall-frame-host iframe.hall-frame").getAttribute("src") || "").indexOf("wire=1") >= 0, 5000, "the frame src");
    ok("F18 · the frame loads the SYNCED bytes: ../game/index.html?v=<game/STAMP>&wire=1 (R4 — never SNAPSHOT.md)",
       A.w.document.querySelector("#hall-frame-host iframe.hall-frame").getAttribute("src") === "../game/index.html?v=" + stamp + "&wire=1", stamp);
    ok("F19 · the pass is seeded before the frame loads, and never the demo key (the frame is a battle, not a demo)",
       A.w.sessionStorage.getItem("dyw_pass") === "1" && A.w.sessionStorage.getItem("dyw_demo") === null);

    const FA = stubFrame(A), FB = stubFrame(B);
    const mid = String(st(A.w).matchView.matchId);
    ok("F20 · nothing reaches a frame before it says it is ready", FA.rec.length === 0 && FB.rec.length === 0);
    FA.say({ type: "wire:ready" }); FB.say({ type: "wire:ready" });
    await H.until(() => !A.w.document.querySelector(".hall-dealing") && !B.w.document.querySelector(".hall-dealing"), 3000, "the beat ends on wire:ready");
    ok("F9 · the beat ends on wire:ready: the battle FRAME shows on BOTH screens — and the text battle is not drawn for a free match",
       !!A.w.document.querySelector("#hall-frame-host iframe.hall-frame") && !!B.w.document.querySelector("#hall-frame-host iframe.hall-frame") &&
       !A.w.document.querySelector(".hall-mhead, .hall-board") && !B.w.document.querySelector(".hall-mhead, .hall-board") &&
       !A.w.document.getElementById("hall-frame-host").hidden && !A.w.document.getElementById("hall-frame-host").classList.contains("dealing"));
    const startA = FA.sent("wire:start")[0], startB = FB.sent("wire:start")[0];
    ok("F21 · wire:start carries EXACTLY { matchId, seat, seed, p0Faction, p1Faction } — no names, no address",
       !!startA && !!startB && Object.keys(startA.m).sort().join(",") === WIRE_KEYS["wire:start"] && Object.keys(startB.m).sort().join(",") === WIRE_KEYS["wire:start"] &&
       startA.m.seat === st(A.w).matchView.seat && startB.m.seat === st(B.w).matchView.seat && startA.m.seed === startB.m.seed && startA.m.matchId === mid,
       JSON.stringify(startA && startA.m));
    // THE STRIP SLOT (R4): statusStrip's clock line from the SERVER's own {clock}, above the frame, in the Hall's root
    await H.until(() => A.w.document.querySelector(".hall-frame-strip .hall-mclock"), 5000, "the clock line on the frame road");
    const slot = A.w.document.querySelector("#hall-root .hall-frame-strip"), line = slot && slot.querySelector(".hall-mclock");
    ok("F40 · the strip slot sits in #hall-root ABOVE the frame host, carrying statusStrip's clock line: \"mulligan clock\" from the server's {clock}",
       !!slot && !!line && /^mulligan clock:/.test(line.querySelector(".state-line").textContent) && /^\d+$/.test(line.querySelector("#hall-clockcd").textContent) &&
       !!(slot.compareDocumentPosition(A.w.document.getElementById("hall-frame-host")) & A.w.Node.DOCUMENT_POSITION_FOLLOWING), slot && slot.textContent);
    ok("F41 · §8b on the frame road: with ~" + line.querySelector("#hall-clockcd").textContent + "s left the countdown is NOT shown — its line holds its space, hidden (C1)",
       !line.classList.contains("show") && Number(line.querySelector("#hall-clockcd").textContent) > 30);
    ok("F22 · posted to THIS origin only — never '*'", FA.rec.concat(FB.rec).every((r) => r.o === "https://divyayuddha.games"));

    // THE BRIDGE REFUSES: three forged deliveries into A's Hall, none of which may reach the socket
    const sentBefore = A.sent.length, refBefore = st(A.w).wireRefused.length;
    FA.say({ type: "wire:act", matchId: mid, action: { type: "pass" } }, { origin: "https://evil.example" });
    FA.say({ type: "wire:act", matchId: mid, action: { type: "pass" } }, { source: A.w });
    FA.say({ type: "wire:act", matchId: "another-table", action: { type: "pass" } });
    await H.sleep(150);
    const refused = st(A.w).wireRefused.slice(refBefore);
    ok("F23 · wrong origin, wrong sender and a foreign matchId are REFUSED loudly — and none reaches the server",
       refused.join("|") === "wrong origin|wrong sender|foreign matchId" && A.sent.length === sentBefore, refused.join("|"));
    FA.say({ type: "wire:leave", matchId: mid });
    await H.sleep(120);
    ok("F24 · a mid-match wire:leave is REFUSED - a frame message can never forfeit (R8)",
       !!st(A.w).matchView && st(A.w).wireRefused.slice(-1)[0].indexOf("mid-match leave refused") === 0);

    // a rich act crosses UNCHANGED; the server refuses it; the refusal goes back to THAT frame only
    const rich = { type: "play", handIndex: 99, targetIndex: null, position: 2, movePosition: null };
    FB.say({ type: "wire:act", matchId: mid, action: rich });
    await H.until(() => FB.sent("wire:reject").length === 1, 8000, "the server's refusal relayed to the frame");
    const onWire = B.sent.filter((f) => f.type === "move").slice(-1)[0];
    ok("F25 · wire:act is relayed to the server BYTE-IDENTICAL: { type:'move', matchId, action } with the frame's action unchanged",
       !!onWire && JSON.stringify(onWire.action) === JSON.stringify(rich) && String(onWire.matchId) === mid, JSON.stringify(onWire));
    const rj = FB.sent("wire:reject")[0].m;
    ok("F26 · the server's {reject} comes back as wire:reject { matchId, reason } (§2 11c)",
       Object.keys(rj).sort().join(",") === WIRE_KEYS["wire:reject"] && rj.matchId === mid &&
       rj.reason === (FB.tap.filter((m) => m.type === "reject").slice(-1)[0] || {}).reason, JSON.stringify(rj));
    FB.sock.onmessage({ data: JSON.stringify({ type: "reject", reason: "a refusal the frame did not cause" }) });
    await H.sleep(150);
    ok("F27 · a {reject} the frame did not cause is NOT relayed to it", FB.sent("wire:reject").length === 1 && FA.sent("wire:reject").length === 0);

    // A REAL VANISH AND RETURN (C2): B's socket dies; matchclient's own auto-reconnect brings the seat back
    //   (W3-PRESENCE-1 / M-P6 resync). A's strip must show the vanish line, then clear it; A's frame is told nothing.
    const seen = [];
    const mo = new A.w.MutationObserver(() => { const t = (A.w.document.getElementById("hall-root").textContent || ""); if (seen[seen.length - 1] !== t) seen.push(t); });
    mo.observe(A.w.document.getElementById("hall-root"), { childList: true, subtree: true, characterData: true });
    const aRecBefore = FA.rec.length;
    B.net.sever();
    await H.until(() => seen.some((t) => t.indexOf("opponent reconnecting…") >= 0), 10000, "the vanish line on A's strip");
    await H.until(() => { const t = A.w.document.getElementById("hall-root").textContent; return t.indexOf("opponent reconnecting") < 0 && /mulligan clock:|your move:|opponent's move:/.test(t); }, 15000, "the vanish line clears and the clock resumes");
    mo.disconnect();
    ok("F42 · a REAL vanish: \"opponent reconnecting…\" rose in A's strip above the frame, with its countdown, while B's socket was gone",
       seen.some((t) => /opponent reconnecting… \d+s left to reconnect/.test(t)), seen.filter((t) => t.indexOf("reconnecting") >= 0).slice(0, 2).join(" | "));
    ok("F43 · the return: the vanish line CLEARS and the clock resumes — no new line (C2)",
       A.w.document.getElementById("hall-root").textContent.indexOf("opponent reconnecting") < 0 && !!A.w.document.querySelector(".hall-frame-strip .hall-mclock"));
    ok("F44 · A's frame was told NOTHING through the vanish and the return (the reserved words stay unsent)", FA.rec.length === aRecBefore, FA.rec.slice(aRecBefore).map((r) => r.m.type).join(","));
    await H.until(() => (st(B.w).wire || {}).started && (FB.sent("wire:start").length >= 2), 10000, "B's frame re-dealt on its return");

    // play it to a result THROUGH THE FRAMES: each stub acts only on its own turn, the way the game does
    for (let i = 0; i < 200; i++) {
      for (const [h, F] of [[A, FA], [B, FB]]) {
        const v = st(h.w).matchView, wr = st(h.w).wire; if (!v || v.over || !wr || wr.actPending) continue;
        if (v.phase === "mulligan" && !F.__mull) { F.__mull = 1; F.say({ type: "wire:act", matchId: mid, action: { type: "mulligan", indices: [] } }); }
        else if (v.phase === "play" && v.myTurn) F.say({ type: "wire:act", matchId: mid, action: { type: "pass" } });
      }
      await H.sleep(120);
      if ((st(A.w).matchView || {}).over && (st(B.w).matchView || {}).over) break;
    }
    ok("F11 · the match is PLAYED TO A RESULT through the battle frame's acts", !!(st(A.w).matchView || {}).over && !!(st(B.w).matchView || {}).over,
       JSON.stringify(st(A.w).matchView));
    await H.sleep(300);
    const applies = FA.tap.filter((m) => m.type === "apply");
    const afterLastStart = (F) => { const i = F.rec.map((r) => r.m.type).lastIndexOf("wire:start"); return F.rec.slice(i + 1).filter((r) => r.m.type === "wire:move").map((r) => r.m); };
    const movesA = FA.sent("wire:move").map((r) => r.m), movesB = afterLastStart(FB);   // B's frame was re-dealt on its return (R6): count from its last wire:start
    ok("F28 · the move stream: seq 1..N, monotonic, each once — EQUAL to the server's {apply} seq and move, on BOTH frames",
       applies.length > 0 && movesA.length === applies.length && movesB.length === applies.length &&
       movesA.every((m, i) => m.seq === i + 1 && m.seq === applies[i].seq && JSON.stringify(m.move) === JSON.stringify(applies[i].move)) &&
       JSON.stringify(movesA) === JSON.stringify(movesB), movesA.length + " sent vs " + applies.length + " applied");
    const res = FA.tap.filter((m) => m.type === "result")[0], wrA = FA.sent("wire:result"), wrB = FB.sent("wire:result");
    ok("F29 · wire:result { matchId, winner, roundWins, forfeit } — once per frame, the server's winner",
       !!res && wrA.length === 1 && wrB.length === 1 && Object.keys(wrA[0].m).sort().join(",") === WIRE_KEYS["wire:result"] &&
       wrA[0].m.winner === res.winner && JSON.stringify(wrA[0].m.roundWins) === JSON.stringify(res.roundWins) && wrA[0].m.forfeit === false,
       JSON.stringify(wrA[0] && wrA[0].m));
    const every = FA.rec.concat(FB.rec);
    ok("F30 · EXACT keys on every message the Hall sent a frame (" + every.length + " messages)",
       every.every((r) => WIRE_KEYS[r.m.type] && Object.keys(r.m).sort().join(",") === WIRE_KEYS[r.m.type]));
    ok("F31 · THE WALL: no address, key, stake or escrow id in any of them", every.every((r) => !WALL.test(JSON.stringify(r.m))),
       (every.find((r) => WALL.test(JSON.stringify(r.m))) || {}).m);
    ok("F45 · and no RESERVED word ever reached a frame: only wire:start / move / reject / result (BW2 draws; the frame does not mirror)",
       every.every((r) => ["wire:start", "wire:move", "wire:reject", "wire:result"].indexOf(r.m.type) >= 0), [...new Set(every.map((r) => r.m.type))].join(","));
    // the send road, read as code: every toFrame(...) builds its message from the deal, the stream or a reason — never
    // from identity or money. Comments stripped first: count code, never prose.
    const hallCode = fs.readFileSync(path.join(H.SITE, "mp/hall.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
    const road = hallCode.slice(hallCode.indexOf("var WIRE_SHAPES"), hallCode.indexOf('refuseWire("unknown word"'));
    const calls = road.match(/toFrame\("wire:[a-z]+", \{[^}]*\}\)/g) || [];
    ok("F32 · the send road (" + calls.length + " toFrame calls) names no identity or money: me / signedInAs / opponent / address / stake / escrow / slip / liquid",
       calls.length >= 5 && calls.every((c) => !/\b(me|signedInAs|opponent|address|stake|escrow\w*|slip|liquid|settlement\w*)\b/.test(c)), calls.join(" | "));
    // R3 — the free result: the result line + FREE_LINE, two existing strings, one strip
    const strip = A.w.document.querySelector(".hall-free-result");
    const spans = strip ? strip.querySelectorAll(".hall-settle-line > span") : [];
    ok("F12 · the FREE RESULT strip: the result line + '" + FREE_LINE + "' (§11 8c), above the frame; the Hall owns the exit",
       !!strip && spans.length === 2 && /^you (win|lose) the match - rounds \d-\d$|^the match is a draw - rounds \d-\d$/.test(spans[0].textContent) &&
       spans[1].textContent === FREE_LINE && !!strip.querySelector("[data-leave]") &&
       !!(strip.compareDocumentPosition(A.w.document.getElementById("hall-frame-host")) & A.w.Node.DOCUMENT_POSITION_FOLLOWING),
       strip && strip.textContent);
    // R8 — the leave law, through the frame's own door, after the outcome
    FB.say({ type: "wire:leave", matchId: mid });
    await H.sleep(200);
    ok("F33 · wire:leave after the outcome runs the LEAVE LAW: out of the match, frame unmounted, the lobby on screen",
       st(B.w).matchView == null && st(B.w).wire == null && !B.w.document.querySelector("#hall-frame-host iframe") &&
       B.w.document.getElementById("hall-frame-host").hidden);
    H.teardown(A); H.teardown(B);
  }

  // ═══ §8b ON THE FRAME ROAD, AND A REAL ABANDONMENT (S-HALL-STRIPS-1) ═══
  // The server's own clocks, shortened: a 12s turn warning at 6s left, a 2.5s vanish grace. The proof-only
  // dyhall::clockShowMs stands in for §8b's 30s so the "shown from N left" edge is reachable in seconds.
  console.log("\n── the strips: the clock by §8b, and an abandonment ──");
  {
    const s4 = await server({ THINK_MS: 12000, THINK_WARN_MS: 6000, VANISH_MS: 2500 });
    const { A, B } = await twoHalls(s4.url, { ls: { "dyhall::clockShowMs": "9000" } });
    const t = await openFree(A, B);
    B.w.document.querySelector('[data-act="seat"][data-tid="' + t.id + '"]').click(); await H.sleep(250);
    B.w.document.querySelector('[data-faction="nagas"]').click(); await H.sleep(100);
    B.w.document.querySelector("[data-join-do]").click();
    await H.until(() => (st(A.w).wire || {}).mounted && (st(B.w).wire || {}).mounted, 20000, "frames mounted");
    const FA = stubFrame(A), FB = stubFrame(B);
    FA.say({ type: "wire:ready" }); FB.say({ type: "wire:ready" });
    await H.until(() => A.w.document.querySelector(".hall-frame-strip .hall-mclock"), 8000, "the strip");
    const L = () => A.w.document.querySelector(".hall-frame-strip .hall-mclock"), secs = () => Number((L().querySelector("#hall-clockcd") || {}).textContent);
    const hiddenAt = secs(), wasHidden = !L().classList.contains("show");
    await H.until(() => L() && L().classList.contains("show"), 8000, "the countdown shown");
    const shownAt = secs(), shownNotWarn = !L().classList.contains("warn");
    await H.until(() => L() && L().classList.contains("warn"), 8000, "amber at the warn");
    const warnAt = secs();
    ok("F46 · §8b: the countdown is HIDDEN with more than the show-mark left (" + hiddenAt + "s), SHOWN inside it (" + shownAt + "s), not yet amber",
       wasHidden && hiddenAt > 9 && shownAt <= 9 && shownNotWarn);
    ok("F47 · §8b: AMBER at the server's warn (" + warnAt + "s left of a 12s turn, warn at 6) — the class on the LINE, where .hall-mclock.warn reaches it",
       warnAt <= 6 && L().classList.contains("warn") && !L().querySelector("#hall-clockcd").classList.contains("warn"));
    // the REAL abandonment: B's socket dies and cannot come back; the grace runs out; the server says {abandoned}
    B.net.block(); B.net.sever();
    await H.until(() => (st(A.w).matchView || {}).over, 15000, "the abandonment");
    await H.sleep(300);
    const strip = A.w.document.querySelector(".hall-free-result"), spans = strip ? strip.querySelectorAll(".hall-settle-line > span") : [];
    ok("F48 · a REAL abandonment lands in the FREE RESULT strip above the frame: \"match abandoned - opponent did not return\" + the free line",
       !!strip && spans.length === 2 && spans[0].textContent === "match abandoned - opponent did not return" && spans[1].textContent === FREE_LINE, strip && strip.textContent);
    const wr = FA.sent("wire:result");
    ok("F49 · and the frame is told as ruled (WIRE-1 R2): wire:result { winner: null, roundWins, forfeit: true }, once",
       wr.length === 1 && wr[0].m.winner === null && wr[0].m.forfeit === true && Array.isArray(wr[0].m.roundWins), JSON.stringify(wr[0] && wr[0].m));
    A.w.document.querySelector(".hall-free-result [data-leave]").click(); await H.sleep(200);
    ok("F50 · the leave law from the strip's own door: out of the match, the frame unmounted", st(A.w).matchView == null && st(A.w).wire == null);
    H.teardown(A); H.teardown(B);
  }
  // P4 — the staked text battle is untouched: statusStrip is byte-identical to the commit before this rung, and the
  //   staked matched-moment line is the ruled one. A pin names a COMMIT, never a ref.
  {
    const PRE_STRIPS = "0476c74";
    const fnOf = (src, name) => { const i = src.indexOf("function " + name + "("); if (i < 0) return null; let d = 0; for (let k = src.indexOf("{", i); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } return null; };
    const pre = execFileSync("git", ["show", PRE_STRIPS + ":mp/hall.js"], { cwd: H.SITE, maxBuffer: 8 << 20 }).toString();
    const now = fs.readFileSync(path.join(H.SITE, "mp/hall.js"), "utf8");
    if (fnOf(pre, "statusStrip") == null) { console.log("  ✖ the pin " + PRE_STRIPS + " has no statusStrip"); process.exit(1); }
    ok("F51 · the staked text battle's strip is BYTE-IDENTICAL: statusStrip unchanged since " + PRE_STRIPS + ", the staked beat still \"the stakes are locked - dealing…\"",
       fnOf(pre, "statusStrip") === fnOf(now, "statusStrip") && now.indexOf('v.redacted ? "the stakes are locked - dealing…" : "dealing…"') >= 0 &&
       /else cc\.classList\.toggle\("warn", warn\);/.test(now));
  }

  // ═══ THE READINESS GUARD (R4): a frame that never answers — that match plays on in the Hall's table ═══
  console.log("\n── the readiness guard ──");
  {
    const s3 = await server();
    const { A, B } = await twoHalls(s3.url, { ls: { "dyhall::wireReadyMs": "1500" } });
    const t = await openFree(A, B);
    B.w.document.querySelector('[data-act="seat"][data-tid="' + t.id + '"]').click(); await H.sleep(250);
    B.w.document.querySelector('[data-faction="nagas"]').click(); await H.sleep(100);
    B.w.document.querySelector("[data-join-do]").click();
    await H.until(() => (st(A.w).wire || {}).fallback && (st(B.w).wire || {}).fallback, 20000, "the fallback on both");
    await H.until(() => battle(A.w) && battle(B.w) && !A.w.document.querySelector(".hall-dealing"), 8000, "the text battle");
    ok("F34 · no wire:ready in time: the frame is withdrawn, an honest line says so, and the Hall's table takes THAT match",
       !A.w.document.querySelector("#hall-frame-host iframe") && body(A.w).indexOf("The battle screen did not answer") >= 0 && !!A.w.document.querySelector(".hall-mhead"));
    for (let i = 0; i < 120; i++) {
      for (const w of [A.w, B.w]) {
        const mc = w.document.querySelector("[data-mullconfirm]"); if (mc && !mc.disabled) { mc.click(); continue; }
        const pb = w.document.querySelector("[data-pass]"); if (pb && !pb.disabled) pb.click();
      }
      await H.sleep(120);
      if ((st(A.w).matchView || {}).over) break;
    }
    ok("F35 · and that match is PLAYED TO A RESULT through the Hall's own table (the mirror kept it current — R6)",
       !!(st(A.w).matchView || {}).over && /wins the match|win the match|lose the match|a draw/i.test(body(A.w)), JSON.stringify(st(A.w).matchView));
    H.teardown(A); H.teardown(B);
  }

  // ═══ the synced copy carries what the frame needs (R4 STAMP · R5 the gem skip) ═══
  {
    const snap = fs.readFileSync(path.join(H.SITE, "game/SNAPSHOT.md"), "utf8");
    const short = ((snap.match(/Source commit: `[0-9a-f]+` \(([0-9a-f]+)\)/) || [])[1]) || null;
    ok("F36 · game/STAMP names the synced commit — the SNAPSHOT's own short sha",
       fs.readFileSync(path.join(H.SITE, "game/STAMP"), "utf8").trim() === short, short);
    const gi = fs.readFileSync(path.join(H.SITE, "game/index.html"), "utf8");
    // HALL-SYNC-1 — the exports reach the hosted game: every manifest URL (registry, faction effects, effect + actor specs and
    //   atlases) resolves against the game's ONE FX.base, cross-linked to the free game's Pages origin — never a relative base
    //   that 404s on this site and falls every Hero and premium effect back to the classic sprite in silence.
    const MBASE = "base:'https://sangbaran-purr.github.io/divya-yuddha/assets/manifest/'";
    ok("F55 · the synced copy's manifest base is absolute to the free game's origin, exactly one, and no relative assets/manifest/ remains (HALL-SYNC-1)",
       gi.split(MBASE).length === 2 && !/(^|[^\/])assets\/manifest\//.test(gi.split("https://sangbaran-purr.github.io/divya-yuddha/assets/manifest/").join("")),
       gi.split(MBASE).length - 1);
    // HALL-SYNC-2 — Vasuki Venom Strike (game EXPORT-6) reaches the hosted game THROUGH that one base: the synced page carries the export's
    //   glue (the nested "venomstrike:drain" route, the flood's cast and its side-checked drain pick), and both packs' manifests and atlases,
    //   resolved the way the page resolves them (new URL against the base), land on the free game's Pages origin. Reachability over HTTP is
    //   proven live at each sync (the suite runs offline); this proves the page asks the right origin for them.
    const ORIGIN = "https://sangbaran-purr.github.io/divya-yuddha/assets/manifest/";
    const vsUrls = ["effects/venomstrike_rise/manifest.json", "effects/venomstrike_rise/atlas.webp", "effects/venomstrike_flood/manifest.json", "effects/venomstrike_flood/atlas.webp"].map((rel) => new URL(rel, ORIGIN).href);
    ok("F56 · the synced copy carries Vasuki Venom Strike's glue (fxRoute, the nested venomstrike:drain route, fxCastDrain, vsDrainPick) and both packs resolve through the ONE absolute base to the free game's origin (HALL-SYNC-2)",
       /function fxRoute\(key\)/.test(gi) && gi.indexOf("const key='venomstrike:drain'") >= 0 && /function fxCastDrain\(/.test(gi) && /function vsDrainPick\(/.test(gi) &&
       gi.split(MBASE).length === 2 && vsUrls.every((u) => u.indexOf(ORIGIN + "effects/venomstrike_") === 0), vsUrls.join(" · "));
    ok("F37 · the gate gem skips the Hall's battle frame (R5): the skip rides the injected preamble exactly once",
       (gi.match(/window\.top !== window && \/\[\?&\]wire=1\(&\|\$\)\/\.test\(location\.search\)\) return;/g) || []).length === 1);
    // SYNC-NARRATOR-1 — the battle log reaches the Hall's wire frames: the narrator file beside the copy, the three
    //   markers in the synced page, and the injected gate preamble leaving the narrator's script tag intact.
    const narr = path.join(H.SITE, "game/src/narrator.js"), nsrc = fs.existsSync(narr) ? fs.readFileSync(narr, "utf8") : "";
    ok("F52 · the sync carries the battle-log narrator: game/src/narrator.js is present (the UMD NARRATOR) and the SNAPSHOT names it",
       nsrc.indexOf("root.NARRATOR = OUT;") >= 0 && snap.indexOf("- src/narrator.js (SYNC-NARRATOR-1") >= 0);
    const fnBody = (src, name) => { const i = src.indexOf("function " + name + "("); if (i < 0) return ""; let d = 0;
      for (let k = src.indexOf("{", src.indexOf(")", i)); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); } } return ""; };
    const NTAG = '<script src="src/narrator.js?v=1"></script>';
    ok("F53 · the synced page carries the battle log: the narrator script tag (once), the #battlelog panel (once), syncBattleLogButton() inside showWireResult",
       gi.split(NTAG).length === 2 && (gi.match(/id="battlelog"/g) || []).length === 1 && fnBody(gi, "showWireResult").indexOf("syncBattleLogButton();") >= 0);
    const gS = gi.indexOf("<!-- DYW-GATE-START"), gE = gi.indexOf("<!-- DYW-GATE-END -->");
    ok("F54 · the injected gate preamble leaves the narrator tag intact: byte-for-byte after DYW-GATE-END, between chapters.js and the battle script, never touched by the preamble",
       gS >= 0 && gE > gS && gi.indexOf(NTAG) > gE && gi.slice(gS, gE).indexOf("narrator") < 0 && gi.indexOf('<script src="src/chapters.js?v=1"></script>\n' + NTAG + "\n<script>") >= 0);
  }

  // ═══ the pin, and the handler guard ═══
  console.log("\n── the pin, and the guard ──");
  {
    const onDisk = execFileSync("shasum", ["-a", "256", path.join(H.SITE, "game/src/engine.js")]).toString().split(/\s+/)[0];
    const pinned = fs.readFileSync(path.join(H.SITE, "game/src/engine.sha256"), "utf8").trim();
    ok("F13 · the site now carries an engine pin, and it names the bytes beside it (the web3 engineguard law, here)",
       /^[0-9a-f]{64}$/.test(pinned) && onDisk === pinned, onDisk + " vs " + pinned);
    const hallSrc = fs.readFileSync(path.join(H.SITE, "mp/hall.js"), "utf8");
    const wireSrc = fs.readFileSync(path.join(H.SITE, "mp/wire.html"), "utf8");
    const list = (t) => (t.match(/\["newGame","playCard","pass","mulligan","doLeap","canLeap","bestLeap","designateShield","playableIndices","targetSpec","adjacentUnits","effPower"\]/) || [])[0];
    ok("F14 · ONE assembly list: the Hall's twelve are wire.html's twelve, byte for byte",
       !!list(hallSrc) && list(hallSrc) === list(wireSrc));

    // DRIFT — the pin says one thing, the bytes say another
    const s2 = await server();
    const { A, B } = await twoHalls(s2.url);
    B.w.fetch = ((real) => (u) => String(u).indexOf("engine.sha256") >= 0
      ? Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("f".repeat(64)) })
      : real(u))(B.w.fetch);
    const t = await openFree(A, B);
    B.w.document.querySelector('[data-act="seat"][data-tid="' + t.id + '"]').click(); await H.sleep(250);
    B.w.document.querySelector('[data-faction="nagas"]').click(); await H.sleep(100);
    B.w.document.querySelector("[data-join-do]").click();
    await H.until(() => body(B.w).indexOf("could not be loaded") >= 0, 20000, "the refusal");
    ok("F15 · PIN DRIFT: the Hall REFUSES and says so — it never plays an engine it cannot vouch for",
       body(B.w).indexOf("could not be loaded") >= 0 && typeof B.w.newGame !== "function");
    ok("F16 · and the session is still alive after the refusal", st(B.w).feedState === "live");

    // THE HANDLER GUARD — a frame that throws must not take the socket down
    const sock = B.sockets[B.sockets.length - 1];
    const before = sock.readyState;
    // a REAL frame whose handling throws: an {apply} relay arriving at a session with no match — the handler
    // reaches `g.turn` on a null mirror. Before the guard this escaped ws.onmessage; now it is refused.
    sock.onmessage({ data: JSON.stringify({ type: "apply", seq: 1, move: { type: "pass", seat: 0 } }) });
    await H.sleep(200);
    sock.onmessage({ data: JSON.stringify({ type: "tables", tables: [] }) });
    await H.sleep(400);
    ok("F17 · a frame that THROWS is refused, not fatal — the socket lives and the next frame is handled",
       sock.readyState === before && Array.isArray(st(B.w).tables));
    H.teardown(A); H.teardown(B);
  }

  servers.forEach((b) => { try { b.srv.close(); } catch (e) {} });
  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
