"use strict";
// S-HALL-STAKED-1 — THE STAKED ROAD ENTERS THE FRAME (BW3b site tail).
//
// The staked road used to end at the Hall's text table: matchclient's relay was gated on `redacted`, so the server's
// views never reached the battle frame at all. Now they do — as wire:start (a view, never a seed) and a stream of
// wire:view, numbered here, with the seat names STRIPPED before anything leaves (BW3b R2; the frame refuses a view
// that still carries them — the second lock, in the game repo). Above the real board the Hall draws its own strips:
// the clock and the vanish line while it plays, and on the result the DRESSED SETTLEMENT STRIP — the text battle's
// own strip, re-homed — with the cast that settles on chain.
//
//   P1 two Halls, a Bronze table, a staked match played through the frames; the winner's cast reaches state 3
//   P2 the §2 contract, and both deliberate breakages red
//   P3 a re-seat re-posts wire:start with the resync view
//   P4 the text battle still plays a staked match on the fallback road; its strip differs in exactly the two K5 ways
//   P5 every settlement variant, above the frame
const path = require("path"), fs = require("fs"), os = require("os");
const { execFileSync } = require("child_process");
const { ethers } = require("ethers"); const WS = require("ws");
const H = require("../lib.js");
const MS = H.MS, OUT = H.OUT, RPC = H.RPC, DEC = 1000000000000000000n, S = 10n * DEC;
const K = { owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            p1: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
            p2: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
            p3: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
            p4: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
            treasury: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" };
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
const ERC20 = ["function approve(address,uint256) returns (bool)", "function mint(address,uint256)", "function balanceOf(address) view returns (uint256)"];
const ESCA = ["function matches(uint256) view returns (address,address,uint256,uint8,uint8,address,uint64,uint8)"];

// the ruled lines this suite reads out of the DOM (docs/LOBBY_DESIGN.md §11 → hall.js, verbatim)
const LOST_LINE = "You lost this match - the winner collects the pot.";
const DRAW_LINE = "A draw - both stakes return in full.";
const net = (stakeWei) => { const pot = BigInt(stakeWei) * 2n, rake = pot * 5n / 100n; return { total: (pot - rake) / DEC, fee: rake / DEC }; };
const wonLine = (stakeWei) => { const n2 = net(stakeWei); return "You won. Collect " + n2.total + " DYC - " + n2.fee + " to the treasury."; };
const settledLine = (stakeWei) => "settled - " + net(stakeWei).total + " DYC in your wallet";
const forfeitLine = (stakeWei) => "Your opponent left the table. The pot is yours - collect " + net(stakeWei).total + " DYC.";

// THE WATCHDOG LAW — every wait is bounded (H.until carries its own budget and NAMES what it awaited), and the whole
//   suite is bounded too: a step recorder + a hard cap that fails LOUDLY with the last step named, never hangs.
const WD_MS = Number(process.env.DY_WD_MS || 210000);
let STEP = "boot";
const step = (s) => { STEP = s; };
const WATCHDOG = setTimeout(() => {
  console.log("  ✖ WATCHDOG (" + (WD_MS / 1000) + "s): the suite STALLED at step [" + STEP + "] — a condition never became true. Failing loudly.");
  process.exit(2);
}, WD_MS);
WATCHDOG.unref ? null : null;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
// THE WIDENED WALL (R3) — the scan the Hall now runs before a message leaves, read here as the suite's own check.
const WALL = /0x[0-9a-fA-F]{4}|"(?:address|opponent|stake|escrow[A-Za-z]*|key|privateKey|signature|slip|p0|p1)"\s*:/;

async function main() {
  // ═══ K0 · SYNC-NARRATOR-1 — the synced copy the staked frame loads carries the battle log (mirrors freedoor F52–F54) ═══
  {
    const snap = fs.readFileSync(path.join(H.SITE, "game/SNAPSHOT.md"), "utf8"), gi = fs.readFileSync(path.join(H.SITE, "game/index.html"), "utf8");
    const narr = path.join(H.SITE, "game/src/narrator.js"), nsrc = fs.existsSync(narr) ? fs.readFileSync(narr, "utf8") : "";
    ok("K0a · the staked frame's copy carries the battle-log narrator: game/src/narrator.js present (the UMD NARRATOR), named in the SNAPSHOT",
       nsrc.indexOf("root.NARRATOR = OUT;") >= 0 && snap.indexOf("- src/narrator.js (SYNC-NARRATOR-1") >= 0);
    const fnBody = (src, name) => { const i = src.indexOf("function " + name + "("); if (i < 0) return ""; let d = 0;
      for (let k = src.indexOf("{", src.indexOf(")", i)); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); } } return ""; };
    const NTAG = '<script src="src/narrator.js?v=1"></script>';
    ok("K0b · the three markers on the staked road: the narrator tag (once), the #battlelog panel (once), syncBattleLogButton() inside showWireResult — the face a staked result (and a staked forfeit) is drawn on",
       gi.split(NTAG).length === 2 && (gi.match(/id="battlelog"/g) || []).length === 1 && fnBody(gi, "showWireResult").indexOf("syncBattleLogButton();") >= 0 &&
       /function showGameOver\(\)\{\s*if\(Wire\)\{ showWireResult\(\); return; \}/.test(gi) && fnBody(gi, "blogStart").indexOf("road === 'staked'") >= 0);
    const gS = gi.indexOf("<!-- DYW-GATE-START"), gE = gi.indexOf("<!-- DYW-GATE-END -->");
    ok("K0c · the injected gate preamble leaves the narrator tag intact: byte-for-byte after DYW-GATE-END, between chapters.js and the battle script, never touched by the preamble",
       gS >= 0 && gE > gS && gi.indexOf(NTAG) > gE && gi.slice(gS, gE).indexOf("narrator") < 0 && gi.indexOf('<script src="src/chapters.js?v=1"></script>\n' + NTAG + "\n<script>") >= 0);
  }
  // ── chain: our own referee, so the server signs REAL slips and a cast can reach the escrow ──
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.NonceManager(new ethers.Wallet(K.owner, provider));
  const p1 = new ethers.Wallet(K.p1, provider), p2 = new ethers.Wallet(K.p2, provider);
  const p3 = new ethers.Wallet(K.p3, provider), p4 = new ethers.Wallet(K.p4, provider);
  const referee = ethers.Wallet.createRandom();
  const dyc = await (new ethers.ContractFactory(art("MockDYC").abi, art("MockDYC").bytecode, owner)).deploy(); await dyc.waitForDeployment();
  const escC = await (new ethers.ContractFactory(art("StakeEscrow").abi, art("StakeEscrow").bytecode, owner)).deploy(
    await dyc.getAddress(), new ethers.Wallet(K.treasury).address, referee.address, 10n * DEC, 10000n * DEC, 24n * 3600n, await owner.getAddress());
  await escC.waitForDeployment();
  const escAddr = await escC.getAddress(), dycAddr = await dyc.getAddress();
  for (const w of [p1, p2, p3, p4]) await (await dyc.mint(w.address, 1000n * DEC)).wait();
  const esc = new ethers.Contract(escAddr, ESCA, provider);

  const { makeServer } = require(path.join(MS, "src/server")); const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby")); const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match")); const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow")); const { makeRefereeSigner } = require(path.join(MS, "src/signer"));
  const rng = require(path.join(MS, "src/rng"));
  const servers = [], s_logs = [];
  async function boot(over) {
    const cfg = Object.assign({ PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: false, NONCE_TTL_MS: 300000,
      TIERS: [10, 50, 200, 1000], TIER_STAKES: { 10: S, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC },
      STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC, MATCH_RPC_URL: RPC, STAKE_ESCROW_ADDRESS: escAddr,
      DYC_ADDRESS: dycAddr, STAKING_ENABLED: true, THINK_MS: 25000, THINK_WARN_MS: 20000, VANISH_MS: 90000 }, over || {});
    const srv = makeServer(cfg);
    const logs = []; s_logs.push(logs);
    makeHub(srv, cfg, makeLobby(cfg.TIERS), (m) => logs.push(String(m)), { E: loadGuardedEngine().engine, rng, createRoom,
      store: makeMatchStore({ file: path.join(os.tmpdir(), "dy_stakedframe_" + process.pid + ".jsonl") }),
      escrow: makeEscrowReader({ rpcUrl: RPC, escrowAddress: escAddr }),
      signer: makeRefereeSigner({ privateKey: referee.privateKey, escrowAddress: escAddr, chainId: 31337 }) });
    await new Promise((r) => srv.listen(0, r));
    const s = { srv, url: "ws://127.0.0.1:" + srv.address().port, logs: s_logs[s_logs.length - 1] }; servers.push(s); return s;
  }
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;

  const st = (w) => w.DYHall._state();
  async function hallFor(url, wallet, opts) {
    const h = await H.hall(url, escAddr, dycAddr, wallet, provider, opts || {});
    await H.until(() => st(h.w).signedInAs && st(h.w).feedState === "live", 20000, "hall live");
    return h;
  }
  // A opens a BRONZE staked table through the UI (the escrow lock rides its own wallet); B takes the seat.
  async function bronzeMatch(url, wa, wb, optsA, optsB) {
    const A = await hallFor(url, wa, optsA), B = await hallFor(url, wb, optsB);
    H.click(A.w, '[data-act="open-sheet"]'); H.click(A.w, '[data-tier-row="bronze"]'); H.click(A.w, '[data-faction="devas"]');
    H.click(A.w, "[data-open-do]");
    await H.until(() => (st(A.w).tables || []).some((t) => t.staked), 60000, "the staked table on the floor");
    const tid = (st(B.w).tables || []).filter((t) => t.staked)[0] ? null : null;
    await H.until(() => (st(B.w).tables || []).some((t) => t.staked), 30000, "B sees the table");
    const t = (st(B.w).tables || []).filter((x) => x.staked)[0];
    B.w.document.querySelector('[data-act="seat"][data-tid="' + t.id + '"]').click(); await H.sleep(200);
    const f = B.w.document.querySelector('[data-faction="nagas"]'); if (f) f.click(); await H.sleep(120);
    B.w.document.querySelector("[data-join-do]").click();
    step("the staked match dealt");
    await H.until(() => st(A.w).matchView && st(B.w).matchView, 90000, "both seats in the staked match");
    return { A, B };
  }
  // the STUB frame (freedoor's pattern): jsdom cannot run the game, so a stub stands where it would — it answers
  //   wire:ready, records what the Hall posts it, and sends acts back through a constructed MessageEvent (jsdom's own
  //   postMessage fills neither origin nor source). What is proven is the HALL'S half of the §2 contract.
  function stubFrame(h, mode) {
    const w = h.w, el = w.document.querySelector("#hall-frame-host iframe.hall-frame"), fw = el.contentWindow;
    const rec = [], F = { el, fw, rec, mid: null, auto: mode || null };
    F.say = (data) => w.dispatchEvent(new w.MessageEvent("message", { data, origin: w.location.origin, source: fw }));
    F.sent = (t) => rec.filter((r) => r.type === t);
    F.act = (action) => F.say({ type: "wire:act", matchId: F.mid, action: action });
    function respond(v) {
      if (!v || !F.auto) return;
      if (v.phase === "mulligan" && !v.myMulliganed) return F.act({ type: "mulligan", indices: [] });
      if (F.auto === "mull") return;                       // mulligan only: the match stays live and still
      if (!v.myTurn || !v.legal) return;
      if (F.auto === "pass") return F.act({ type: "pass" });
      const pl = v.legal.playable || [];
      const pick = pl.filter((p) => { const c = (v.myHand || []).filter((x) => x.i === p.i)[0]; return c && (c.t === "unit" || c.t === "hero"); })[0] || pl[0];
      if (!pick) return F.act({ type: "pass" });
      F.act({ type: "play", handIndex: pick.i, targetIndex: (pick.needsTarget && pick.targets && pick.targets.length) ? 0 : null });
    }
    fw.postMessage = (m) => {
      const c = JSON.parse(JSON.stringify(m)); rec.push(c);
      if (c.matchId) F.mid = c.matchId;
      if (c.type === "wire:start" || c.type === "wire:view") { F.lastView = c.view; setTimeout(() => respond(c.view), 0); }
      // a refused act produces no new view (nothing was applied — the lockstep law), so the stub takes its turn again
      if (c.type === "wire:reject") setTimeout(() => respond(F.lastView), 0);
    };
    F.nudge = () => respond(F.lastView);   // a stub speaks only when spoken to: this is how a paused one takes its turn again
    F.say({ type: "wire:ready" });
    return F;
  }
  const views = (F) => F.sent("wire:view");
  const allPosted = (F) => JSON.stringify(F.rec);

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n── P1/P2 · the staked road IN THE FRAME: two Halls, a Bronze table, the contract ──");
  const s1 = await boot();
  const { A, B } = await bronzeMatch(s1.url, p1, p2);
  step("the frames mounted");
  await H.until(() => (st(A.w).wire || {}).mounted && (st(B.w).wire || {}).mounted, 30000, "the frame mounted on both staked screens");
  ok("K1 · the STAKED deal mounts the battle frame on both screens — the road the relay gate used to close",
     (st(A.w).wire || {}).mounted && (st(B.w).wire || {}).mounted && !(st(A.w).wire || {}).fallback);
  const tapA = []; A.sockets[A.sockets.length - 1].on("message", (d) => { try { tapA.push(JSON.parse(String(d)).type); } catch (e) {} });
  const FA = stubFrame(A, "play"), FB = stubFrame(B, "pass");
  await H.until(() => FA.sent("wire:start").length && FB.sent("wire:start").length, 20000, "wire:start on both frames");
  const startA = FA.sent("wire:start")[0];
  ok("K1b · wire:start carries a VIEW and never a seed — exactly { matchId, seat, view, p0Faction, p1Faction } (11d)",
     Object.keys(startA).sort().join(",") === "matchId,p0Faction,p1Faction,seat,type,view" && startA.seed === undefined && !!startA.view,
     Object.keys(startA).sort().join(","));
  ok("K1c · that view is the SERVER's own — the board, the legal block and the W3-VIEW-2 fields the staked screen needs",
     Array.isArray(startA.view.myHand) && !!startA.view.oppHand && Array.isArray(startA.view.passed) &&
     !!startA.view.flags && Array.isArray(startA.view.myHandLocked) && Array.isArray(startA.view.events),
     Object.keys(startA.view).join(" "));
  ok("K2a · the seat NAMES are stripped before the view leaves — neither key rides wire:start",
     startA.view.myName === undefined && startA.view.oppName === undefined);
  // the refusal road, taken EARLY: this match is decided in seconds (A's frame plays, B's passes), and an act after
  //   the last card is refused by the Hall itself ("the match is over"), never by the server.
  step("the refusal road");
  const refusedBefore = (st(A.w).wireRefused || []).length, aRej = FA.sent("wire:reject").length, bRej = FB.sent("wire:reject").length;
  FB.auto = null;   // B's own acts are silenced across the window: any reject reaching B's frame here could only be A's
  FA.act({ type: "play", handIndex: 99, targetIndex: null });   // an illegal act of OUR OWN
  await H.until(() => FA.sent("wire:reject").length > aRej, 20000, "the reject for our own act");
  ok("K3b · the server's refusal of the frame's OWN act comes back as wire:reject on THAT frame alone — the other seat's frame hears nothing of it",
     FA.sent("wire:reject").length === aRej + 1 && FB.sent("wire:reject").length === bRej && (st(A.w).wireRefused || []).length === refusedBefore,
     "A +" + (FA.sent("wire:reject").length - aRej) + " B +" + (FB.sent("wire:reject").length - bRej));
  FB.auto = "pass"; FB.nudge();   // B takes its turn again
  step("the view stream");
  await H.until(() => views(FA).length >= 3 && views(FB).length >= 3, 40000, "the view stream");
  const seqs = views(FA).map((m) => m.seq);
  ok("K2b · every wire:view is { matchId, seq, view }, seq 1..N and monotonic — numbered by the Hall",
     views(FA).every((m) => Object.keys(m).sort().join(",") === "matchId,seq,type,view") &&
     seqs.every((s, i) => s === i + 1), seqs.slice(0, 8).join(","));
  ok("K2c · no seat name, and no 0x token at all, in ANY message posted to either frame (the widened wall)",
     !/"(myName|oppName)"/.test(allPosted(FA) + allPosted(FB)) && !WALL.test(allPosted(FA)) && !WALL.test(allPosted(FB)));
  // the acts road: the frame's act reaches the server, and comes back as a view whose lastMove is ours
  const mine = () => views(FA).filter((m) => m.view.lastMove && m.view.lastMove.seat === startA.seat).length;
  await H.until(() => mine() > 0, 30000, "our own act, relayed back as a view");
  ok("K3a · wire:act is relayed unchanged — the server applied our act and the view came back with it as lastMove", mine() > 0);
  // to the result
  step("the match result");
  try { await H.until(() => st(A.w).matchView && st(A.w).matchView.over, 60000, "the match result (state.matchView.over — the summary's own flag)"); }
  catch (e) { const lv = FA.lastView || {}; console.log("      DBG stall: viewsA=" + views(FA).length + " viewsB=" + views(FB).length +
    " round=" + lv.round + " phase=" + lv.phase + " turn=" + lv.turn + " myTurn=" + lv.myTurn + " legal=" + JSON.stringify(lv.legal && lv.legal.playable && lv.legal.playable.length) +
    " lastB=" + JSON.stringify((FB.lastView || {}).phase) + "/" + JSON.stringify((FB.lastView || {}).myTurn) + " rejA=" + FA.sent("wire:reject").length + " rejB=" + FB.sent("wire:reject").length + " socketA=" + JSON.stringify(tapA.slice(-8)) + " mv=" + JSON.stringify(Object.keys(st(A.w).matchView || {})) + " out=" + JSON.stringify((st(A.w).matchView || {}).outcome)); throw e; }
  await H.until(() => FA.sent("wire:result").length > 0, 20000, "wire:result");
  const overViews = views(FA).filter((m) => m.view.over === true);
  ok("K3c · the match plays to a result THROUGH the frames: one wire:result, and a final view (over: true) before it",
     FA.sent("wire:result").length === 1 && overViews.length > 0 &&
     FA.rec.indexOf(overViews[overViews.length - 1]) < FA.rec.indexOf(FA.sent("wire:result")[0]));
  const resultMsg = FA.sent("wire:result")[0];
  ok("K3d · seat A won the match it played (its frame played cards; B's passed) — the winner the Hall posted to the frame",
     resultMsg.winner === startA.seat, "winner " + resultMsg.winner + " seat " + startA.seat);

  console.log("\n── P1/P5 · the dressed settlement strip, above the real board ──");
  step("the settlement strip");
  await H.until(() => A.w.document.querySelector(".hall-frame-settle .hall-settle"), 30000, "the settlement strip above the frame");
  const stripA = A.w.document.querySelector(".hall-frame-settle");
  ok("K4a · the strip renders ABOVE the frame, and the frame is still mounted beneath it (N3)",
     !!stripA && !!A.w.document.querySelector("#hall-frame-host iframe.hall-frame") &&
     !A.w.document.getElementById("hall-frame-host").hidden);
  ok("K4b · the WINNER's strip carries the ruled won line and a live CAST SETTLE",
     txt(stripA).indexOf(wonLine(S)) >= 0 && !!stripA.querySelector("[data-settle]") && !stripA.querySelector("[data-settle]").disabled, txt(stripA).slice(0, 160));
  await H.until(() => B.w.document.querySelector(".hall-frame-settle"), 20000, "the loser's strip");
  ok("K4c · the LOSER's strip is honest — the ruled line, and no cast",
     txt(B.w.document.querySelector(".hall-frame-settle")).indexOf(LOST_LINE) >= 0 &&
     !B.w.document.querySelector(".hall-frame-settle [data-settle]"), txt(B.w.document.querySelector(".hall-frame-settle")).slice(0, 160));
  const eidA = st(A.w).settlement.escrowMatchId;
  stripA.querySelector("[data-settle]").click();
  step("the cast");
  await H.until(async () => Number((await esc.matches(BigInt(eidA)))[7]) === 3, 60000, "the escrow settled from the Hall");
  ok("K4d · the winner's cast — from the strip above the frame — SETTLES on chain (terminal state 3)",
     Number((await esc.matches(BigInt(eidA)))[7]) === 3);
  await H.until(() => txt(A.w.document.querySelector(".hall-frame-settle")).indexOf(settledLine(S)) >= 0, 20000, "the settled face above the frame");
  ok("K4e · and the strip turns to its settled face, above the frame — the ruled settled line",
     txt(A.w.document.querySelector(".hall-frame-settle")).indexOf(settledLine(S)) >= 0, txt(A.w.document.querySelector(".hall-frame-settle")).slice(0, 160));

  console.log("\n── P3 · a re-seat re-posts wire:start with the resync view ──");
  H.teardown(B); H.teardown(A);
  {
    // a LIVE match is needed here: matchclient only auto-reconnects while `phase !== "over"`, and the matches above
    //   are decided in seconds. So this server's clock is generous and both stubs stay SILENT — nothing moves until
    //   this proof moves it.
    const s2 = await boot({ THINK_MS: 120000, THINK_WARN_MS: 30000 });
    step("P3 the deal");
    const m2 = await bronzeMatch(s2.url, p3, p4);
    const A2 = m2.A, B2 = m2.B;
    await H.until(() => (st(A2.w).wire || {}).mounted && (st(B2.w).wire || {}).mounted, 30000, "the frames mounted");
    const F2 = stubFrame(A2, null), G2 = stubFrame(B2, null);
    await H.until(() => F2.sent("wire:start").length > 0, 20000, "the first wire:start");
    // one applied move each, so the stream has really advanced before the socket dies
    step("P3 the stream running");
    F2.auto = "mull"; G2.auto = "mull"; F2.nudge(); G2.nudge();
    await H.until(() => views(F2).length >= 2, 40000, "two views on the stream");
    F2.auto = null; G2.auto = null;
    const seqBefore = views(F2).map((m) => m.seq), startsB = F2.sent("wire:start").length;
    step("P3 the re-seat");
    A2.net.sever();                                   // the seat's socket dies; matchclient reconnects and is re-seated
    try { await H.until(() => F2.sent("wire:start").length > startsB, 45000, "the re-seat's wire:start"); }
    catch (e) { console.log("      DBG P3: wire=" + JSON.stringify(st(A2.w).wire) + " mv=" + JSON.stringify(st(A2.w).matchView) +
      " starts=" + F2.sent("wire:start").length + " views=" + views(F2).length + " live=" + A2.net.live() +
      " srvlog=" + JSON.stringify(s2.logs.slice(-6))); throw e; }
    const re = F2.sent("wire:start")[F2.sent("wire:start").length - 1], reAt = F2.rec.lastIndexOf(re);
    ok("P3a · the re-seated staked session gets wire:start AGAIN, carrying the RESYNC view (events: []) — no special case was needed",
       !!re.view && Array.isArray(re.view.events) && re.view.events.length === 0 && re.seed === undefined &&
       re.view.myName === undefined && re.view.oppName === undefined,
       "events " + (re.view && re.view.events && re.view.events.length));
    step("P3 the stream resumed");
    F2.auto = "play"; G2.auto = "pass"; F2.nudge(); G2.nudge();
    await H.until(() => F2.rec.slice(reAt).filter((m) => m.type === "wire:view").length >= 2, 60000, "the stream after the re-seat");
    const after = F2.rec.slice(reAt).filter((m) => m.type === "wire:view").map((m) => m.seq);
    ok("P3b · …and the numbering starts over with it: the views after the resync are seq 1..N again (before: " + seqBefore.join(",") + ")",
       after.every((q, i) => q === i + 1), after.join(","));
    H.teardown(A2); H.teardown(B2);
  }

  console.log("\n── P4 · the fallback road, and the text battle's strip ──");
  {
    const s3 = await boot();
    const m3 = await bronzeMatch(s3.url, p1, p2, { ls: { "dyhall::wireReadyMs": "1200" } }, { ls: { "dyhall::wireReadyMs": "1200" } });
    const A3 = m3.A, B3 = m3.B;   // NO stub: no frame ever says wire:ready
    step("P4 the fallback");
    await H.until(() => (st(A3.w).wire || {}).fallback, 30000, "the readiness fallback");
    await H.until(() => A3.w.document.querySelector(".hall-mhead"), 30000, "the text battle");
    ok("P4a · N4 STANDS: with no frame answering, a STAKED match still plays in the Hall's text battle",
       (st(A3.w).wire || {}).fallback === true && !!A3.w.document.querySelector(".hall-mhead") && !!A3.w.document.querySelector(".hall-board"));
    await H.until(() => A3.w.document.querySelector(".hall-mclock") || A3.w.document.querySelector(".hall-hand"), 30000, "the text battle's controls");
    const clock = A3.w.document.querySelector(".hall-mclock");
    ok("P4b · K5, change one: the text battle's clock line carries the §8b `show` class (from 30s), not a countdown for the whole turn",
       !!clock && clock.className.indexOf("hall-mclock") >= 0, clock ? clock.className : "(no clock line)");
    ok("P4c · K5, change two: `warn` lands on the LINE (amber), never on the <b> (crimson)",
       !!clock && !(clock.querySelector("b") && clock.querySelector("b").classList.contains("warn")),
       clock ? clock.outerHTML.slice(0, 120) : "");
    H.teardown(A3); H.teardown(B3);
  }
  // the strip diff against HEAD's bytes: statusStrip itself is UNTOUCHED; only paintClocks' line lookup moved.
  // A PIN NAMES A COMMIT, NEVER A MOVING REF (the slipscope lesson, learned twice now). This read was written as
  //   "HEAD:mp/hall.js" while S-HALL-STAKED-1 was still uncommitted — and DEFEATED ITSELF the moment the rung landed,
  //   because HEAD then carried the K5 fix and the "differs from HEAD" check went red. a296f68 is the last commit
  //   before S-HALL-STAKED-1 (1415a21).
  const PRE_K5_REF = "a296f68";
  const HEAD_HALL = execFileSync("git", ["show", PRE_K5_REF + ":mp/hall.js"], { cwd: H.SITE, maxBuffer: 8 << 20 }).toString();
  if (HEAD_HALL.indexOf('cc.closest(".hall-frame-strip .hall-mclock")') < 0) {
    console.log("  ✖ the pre-K5 pin " + PRE_K5_REF + " does not carry the pre-fix paint — the comparison would pass emptily"); process.exit(1);
  }
  const NOW_HALL = fs.readFileSync(path.join(H.SITE, "mp/hall.js"), "utf8");
  const fn = (src, name) => { const i = src.indexOf("function " + name + "("); let d = 0; for (let k = src.indexOf("{", i); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); } } return ""; };
  ok("P4d · the text battle's strip differs from the pre-K5 pin (a296f68) in EXACTLY the two K5 ways: statusStrip is byte-identical, and paintClocks' line lookup lost its .hall-frame-strip scope",
     fn(HEAD_HALL, "statusStrip") === fn(NOW_HALL, "statusStrip") &&
     HEAD_HALL.indexOf('cc.closest(".hall-frame-strip .hall-mclock")') >= 0 &&
     NOW_HALL.indexOf('cc.closest(".hall-frame-strip .hall-mclock")') < 0 &&
     NOW_HALL.indexOf('cc.closest(".hall-mclock")') >= 0);

  console.log("\n── P2 · the two deliberate breakages ──");
  // Both are the PRODUCT FILE, mutated, driven through the same flow (the slipscope pattern): a Hall that does not
  //   strip, once with the widened wall (it must REFUSE the post) and once with HEAD's 40-hex wall (the blind spot).
  async function mutantHall(label, edit) {
    const dir = path.join(os.tmpdir(), "dy_stakedframe_" + label + "_" + process.pid, "mp");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "matchclient.js"), fs.readFileSync(path.join(H.SITE, "mp/matchclient.js")));
    fs.writeFileSync(path.join(dir, "hall.js"), edit(NOW_HALL));
    return path.dirname(dir);
  }
  const noStrip = (src) => src.replace('function hallView(v) { var c = {}, k; for (k in v) if (k !== "myName" && k !== "oppName") c[k] = v[k]; return c; }',
                                       "function hallView(v) { return v; }");
  {
    const s4 = await boot();
    const srcA = await mutantHall("nostrip", noStrip);
    const m4 = await bronzeMatch(s4.url, p3, p4, { srcDir: srcA }, {});
    await H.until(() => (st(m4.A.w).wire || {}).mounted, 30000, "the mutant's frame");
    const F4 = stubFrame(m4.A, null);
    await H.sleep(2500);
    ok("P2-M1 · MUTATION (the Hall stops stripping): the WALL refuses the post — the view never leaves, and the refusal is loud",
       F4.sent("wire:start").length === 0 && (st(m4.A.w).wireRefused || []).some((r) => /wall/.test(r)),
       "posted " + F4.rec.length + " refused " + JSON.stringify((st(m4.A.w).wireRefused || []).slice(0, 2)));
    H.teardown(m4.A); H.teardown(m4.B);

    const s5 = await boot();
    const srcB = await mutantHall("oldwall", (src) => noStrip(src).replace("var WALL_RE = /0x[0-9a-fA-F]{4}|", "var WALL_RE = /0x[0-9a-fA-F]{40}|"));
    const m5 = await bronzeMatch(s5.url, p1, p2, { srcDir: srcB }, {});
    await H.until(() => (st(m5.A.w).wire || {}).mounted, 30000, "the second mutant's frame");
    const F5 = stubFrame(m5.A, null);
    await H.until(() => F5.sent("wire:start").length > 0, 20000, "the unstripped view posted");
    const bad = F5.sent("wire:start")[0];
    ok("P2-M2 · MUTATION (no strip + HEAD's 40-hex wall): the seat names RIDE — the blind spot this rung closed, reproduced",
       bad.view.myName !== undefined && /0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/.test(JSON.stringify(bad.view)),
       JSON.stringify([bad.view.myName, bad.view.oppName]));
    H.teardown(m5.A); H.teardown(m5.B);
  }

  console.log("\n── P5 · the other settlement variants, above the frame ──");
  {
    const s6 = await boot();
    const m6 = await bronzeMatch(s6.url, p3, p4);
    await H.until(() => (st(m6.A.w).wire || {}).mounted && (st(m6.B.w).wire || {}).mounted, 30000, "the frames");
    stubFrame(m6.A, "pass"); stubFrame(m6.B, "pass");            // both pass every round → the server signs a DRAW
    step("P5 the draw");
    await H.until(() => m6.A.w.document.querySelector(".hall-frame-settle .hall-settle"), 120000, "the draw strip");
    const d = txt(m6.A.w.document.querySelector(".hall-frame-settle"));
    ok("P5a · DRAW, above the frame: the ruled draw line with its own cast", d.indexOf(DRAW_LINE) >= 0 &&
       !!m6.A.w.document.querySelector(".hall-frame-settle [data-settle]"), d.slice(0, 160));
    H.teardown(m6.A); H.teardown(m6.B);
  }
  {
    const s7 = await boot({ VANISH_MS: 1500 });
    const m7 = await bronzeMatch(s7.url, p1, p2);
    await H.until(() => (st(m7.A.w).wire || {}).mounted, 30000, "the frames");
    stubFrame(m7.A, "play"); stubFrame(m7.B, null);
    m7.B.net.block(); m7.B.net.sever();                          // the opponent leaves the field and never returns
    step("P5 the forfeit");
    await H.until(() => m7.A.w.document.querySelector(".hall-frame-settle .hall-settle"), 60000, "the forfeit strip");
    const f = txt(m7.A.w.document.querySelector(".hall-frame-settle"));
    ok("P5b · FORFEIT, above the frame: the survivor's ruled line and a live cast", f.indexOf(forfeitLine(S)) >= 0 &&
       !!m7.A.w.document.querySelector(".hall-frame-settle [data-settle]"), f.slice(0, 160));
    H.teardown(m7.A); H.teardown(m7.B);
  }
  ok("P5c · every variant above the frame comes from the text battle's OWN settlementStrip — re-homed, not re-written (§11 untouched)",
     NOW_HALL.indexOf('settlementStrip(slipForMatch(v)) +') >= 0 && fn(HEAD_HALL, "settlementStrip") === fn(NOW_HALL, "settlementStrip"));

  clearTimeout(WATCHDOG);
  servers.forEach((s) => { try { s.srv.close(); } catch (e) {} });
  console.log("\n" + (fail === 0 ? "✓ ALL " + pass + " CHECKS PASS" : "✖ " + fail + " FAILED / " + pass + " passed"));
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.log("  ✖ HARNESS ERROR: " + (e && e.stack ? e.stack : e)); process.exit(1); });
