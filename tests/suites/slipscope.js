"use strict";
// S-HALL-SLIP-SCOPE-1 — THE SETTLEMENT NET. Finding 2 of INCIDENT-2026-09-10: an old, unsettled slip from a past
// match rendered as the CURRENT match's outcome, so a player mid-battle read "You lost this match".
//
// THE LAW THIS SUITE GUARDS: a slip renders only in the context of the match it names — inside a live match, only a
// slip whose matchId is THAT match; everywhere else, an old unsettled slip surfaces at the lobby home as its own
// honest affordance, never as the current match's outcome.
//
// P1 the lie dead (the pre-fix bytes driven beside the new ones, and a REAL staked match on screen with the old slip
//    resumed), P2 both honest roads live, P3 one-at-a-time proven.
const path = require("path"), fs = require("fs"), os = require("os");
const { execFileSync } = require("child_process");
const { ethers } = require("ethers"); const WS = require("ws");
const H = require("../lib.js");
const MC = require(path.join(H.SITE, "mp/matchclient.js"));
const OUT = H.OUT, MS = H.MS, DEC = 1000000000000000000n, S = 10n * DEC, RPC = H.RPC;
const K = { owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            p1: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
            p2: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
            p3: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",   // the pre-fix reproduction's own seat
            treasury: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" };
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
const ERC20 = ["function approve(address,uint256) returns (bool)", "function mint(address,uint256)"];
const ESCA = ["function openMatch(uint256,address,uint8) returns (uint256)", "event MatchOpened(uint256 indexed id, address indexed opener, uint256 stake, address expectedOpponent, uint8 source)"];

// the ruled lines this suite reads out of the DOM (docs/LOBBY_DESIGN.md §11 → hall.js, verbatim)
const LIE_LOSS   = "You lost this match - the winner collects the pot.";   // the incident's invented outcome
const dycLine = (stakeWei) => { const pot = BigInt(stakeWei) * 2n, rake = pot * 5n / 100n; return "You won. Collect " + ((pot - rake) / DEC) + " DYC - " + (rake / DEC) + " to the treasury."; };

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const bodyText = (w) => (w.document.body.textContent || "").replace(/\s+/g, " ").trim();

// ── an old slip as it sits in localStorage. `matchId` is the word this task made the client keep; the OLDEST records
//    (written before the fix) have none at all — ruled NOT this match, the safe reading.
function slip(o) {
  return JSON.stringify(Object.assign({
    escrowMatchId: "777", stake: S.toString(), result: 1, resultName: "WIN_B", youWon: false, winnerSeat: 0,
    slip: { escrowMatchId: "777", matchId: "777", stake: S.toString(), result: 1, signature: "0x" + "11".repeat(65) },
    refereeAddress: "0x000000000000000000000000000000000000dEaD", forfeit: false, settled: false, at: Date.now(),
  }, o));
}

// ── the pre-fix bytes, driven. `git show HEAD:mp/matchclient.js` is the client as it stood when the incident happened.
function driveClient(src, tag) {
  const f = path.join(os.tmpdir(), "dy_slipscope_" + tag + "_" + process.pid + ".js");
  fs.writeFileSync(f, src);
  delete require.cache[f];
  const M = require(f);
  const store = {};
  const ls = {
    get length() { return Object.keys(store).length; },
    key(i) { return Object.keys(store)[i]; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
  };
  const prevLs = global.localStorage, prevWS = global.WebSocket;
  global.localStorage = ls;
  let sock = null;
  global.WebSocket = function () { sock = { readyState: 1, send() {}, close() {} }; return sock; };
  let v = null;
  const c = M.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (nv) => { v = nv; } });
  c.connect("ws://127.0.0.1:1");
  const feed = (m) => sock.onmessage({ data: JSON.stringify(m) });
  const done = () => { global.localStorage = prevLs; global.WebSocket = prevWS; try { fs.unlinkSync(f); } catch (e) {} };
  return { c, ls, feed, view: () => v || c.view(), done };
}

async function main() {
  // ── chain + the real match server, with a REAL referee signer (so a signed slip is a real object here) ──
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.NonceManager(new ethers.Wallet(K.owner, provider));
  const p1 = new ethers.Wallet(K.p1, provider);                                     // the Hall (joins)
  const p2w = new ethers.Wallet(K.p2, provider), p2 = new ethers.NonceManager(p2w); // the friend (opens)
  const p3 = new ethers.Wallet(K.p3, provider);                                     // the PRE-FIX Hall — its own seat,
  //   so the reproduction's battle never ties up p1's address (a severed socket leaves a live room in its vanish grace,
  //   and the W3-PRESENCE-1 law would re-seat p1 into it instead of the lobby).
  const referee = ethers.Wallet.createRandom();
  const dyc = await (new ethers.ContractFactory(art("MockDYC").abi, art("MockDYC").bytecode, owner)).deploy(); await dyc.waitForDeployment();
  const escC = await (new ethers.ContractFactory(art("StakeEscrow").abi, art("StakeEscrow").bytecode, owner)).deploy(
    await dyc.getAddress(), new ethers.Wallet(K.treasury).address, referee.address, 10n * DEC, 10000n * DEC, 24n * 3600n, await owner.getAddress()); await escC.waitForDeployment();
  const escAddr = await escC.getAddress(), dycAddr = await dyc.getAddress();
  await (await dyc.mint(p1.address, 1000n * DEC)).wait(); await (await dyc.mint(p2w.address, 1000n * DEC)).wait();
  await (await dyc.mint(p3.address, 1000n * DEC)).wait();

  const { makeServer } = require(path.join(MS, "src/server")); const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby")); const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match")); const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow")); const rng = require(path.join(MS, "src/rng"));
  const { makeRefereeSigner } = require(path.join(MS, "src/signer"));
  const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: true, NONCE_TTL_MS: 300000, TIERS: [0, 10, 50, 200, 1000],
    TIER_STAKES: { 10: S, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC }, STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC,
    MATCH_RPC_URL: RPC, STAKE_ESCROW_ADDRESS: escAddr, DYC_ADDRESS: dycAddr, STAKING_ENABLED: true,
    DARK_PAGE_ENABLED: false, FRIEND_TABLES_WITHHELD: false };
  const srv = makeServer(cfg);
  makeHub(srv, cfg, makeLobby(cfg.TIERS), () => {}, { E: loadGuardedEngine().engine, rng, createRoom,
    store: makeMatchStore({ file: path.join(os.tmpdir(), "dy_slipscope.jsonl") }),
    escrow: makeEscrowReader({ rpcUrl: RPC, escrowAddress: escAddr }),
    signer: makeRefereeSigner({ privateKey: referee.privateKey, escrowAddress: escAddr, chainId: 31337 }) });
  await new Promise((r) => srv.listen(0, r));
  const url = "ws://127.0.0.1:" + srv.address().port;
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;

  // ── THE SEED: two old, unsettled slips, neither naming any match the Hall is about to play ──
  const NEWER_LOSS = slip({ escrowMatchId: "777", matchId: "m-OLD-777", stake: S.toString(), result: 1, youWon: false, at: Date.now() - 60000 });
  const OLDER_WIN  = slip({ escrowMatchId: "555", matchId: "m-OLD-555", stake: (50n * DEC).toString(), result: 0, resultName: "WIN_A", youWon: true, winnerSeat: 1, at: Date.now() - 600000 });
  const SEED = { "dy_mp_slip_777": NEWER_LOSS, "dy_mp_slip_555": OLDER_WIN };
  const OLD_WIN_LINE = dycLine(50n * DEC);

  console.log("\n── P1 · the incident's lie, dead ──");
  ok("P1a · the seed is real: two old unsettled slips, neither naming the live match",
     JSON.parse(NEWER_LOSS).settled === false && JSON.parse(OLDER_WIN).settled === false &&
     JSON.parse(NEWER_LOSS).matchId === "m-OLD-777" && JSON.parse(OLDER_WIN).matchId === "m-OLD-555");

  // ═══ the PRE-FIX bytes, driven beside the new ones ═══
  // S-HALL-CEREMONY-1 correction: this used to read `HEAD:`, which DEFEATED ITSELF the moment the slip-scope fix
  //   landed — HEAD then contained the fix and the reproduction went red. A pre-fix pin must name the commit, not a
  //   moving ref. 8d1d423 is the last commit before S-HALL-SLIP-SCOPE-1 (dca23ab).
  const PRE_FIX_REF = "8d1d423";
  const at = (f) => execFileSync("git", ["show", PRE_FIX_REF + ":" + f], { cwd: H.SITE, maxBuffer: 8 << 20 }).toString();
  const HEAD_MC = at("mp/matchclient.js"), HEAD_HALL = at("mp/hall.js");
  if (HEAD_MC.indexOf("pendingSlip") >= 0 || HEAD_HALL.indexOf("slipForMatch") >= 0) {
    console.log("  ✖ the pre-fix pin " + PRE_FIX_REF + " already CONTAINS the fix — the reproduction would pass emptily"); process.exit(1);
  }
  {
    const d = driveClient(HEAD_MC, "pre");
    d.ls.setItem("dy_mp_slip_777", NEWER_LOSS);
    d.c.resumeSettlement();
    const afterResume = d.view();
    ok("P1b · PRE-FIX bytes: resumeSettlement wrote the old slip into the MATCH slot (`settlement`)",
       !!(afterResume && afterResume.settlement && afterResume.settlement.escrowMatchId === "777"),
       "settlement=" + JSON.stringify(afterResume && afterResume.settlement && afterResume.settlement.escrowMatchId));
    d.feed({ type: "match-redacted", matchId: "m-NEW", seat: 1, opponent: p2w.address, winTarget: 2, p0Faction: "devas", p1Faction: "nagas" });
    const afterMatch = d.view();
    ok("P1c · PRE-FIX bytes: a NEW match did not clear it — `settlement` still held the foreign slip",
       !!(afterMatch && afterMatch.settlement && afterMatch.settlement.escrowMatchId === "777"),
       "settlement=" + JSON.stringify(afterMatch && afterMatch.settlement && afterMatch.settlement.escrowMatchId));
    d.done();
  }
  ok("P1d0 · PRE-FIX bytes: the render site read exactly that field — `settlementStrip(v.settlement)` (quoted from HEAD)",
     HEAD_HALL.indexOf("statusStrip(v) + settlementStrip(v.settlement)") >= 0,
     "at HEAD: var h = statusStrip(v) + settlementStrip(v.settlement);   NOW: var h = statusStrip(v) + settlementStrip(slipForMatch(v));");

  // ═══ the NEW bytes, same drive ═══
  {
    const d = driveClient(fs.readFileSync(path.join(H.SITE, "mp/matchclient.js"), "utf8"), "post");
    d.ls.setItem("dy_mp_slip_777", NEWER_LOSS);
    d.c.resumeSettlement();
    const v1 = d.view();
    d.feed({ type: "match-redacted", matchId: "m-NEW", seat: 1, opponent: p2w.address, winTarget: 2, p0Faction: "devas", p1Faction: "nagas" });
    const v2 = d.view();
    ok("P1e · NOW: the resume files the old slip to the LOBBY home (`pendingSlip`), never the match slot",
       !!(v1 && v1.pendingSlip && v1.pendingSlip.escrowMatchId === "777") && v1.settlement == null,
       "settlement=" + JSON.stringify(v1 && v1.settlement) + " pendingSlip=" + JSON.stringify(v1 && v1.pendingSlip && v1.pendingSlip.escrowMatchId));
    ok("P1f · NOW: a new match starts with an EMPTY strip by law — `settlement` is null",
       v2 != null && v2.settlement == null,
       "settlement=" + JSON.stringify(v2 && v2.settlement));
    d.done();
  }

  // ═══ the DOM: a REAL staked match on screen, with the old slips resumed ═══
  // the friend opens a private table locked to the Hall's address (one per battle this suite drives)
  const iface = new ethers.Interface(ESCA);
  async function friendOpens(forAddr) {
    await (await new ethers.Contract(dycAddr, ERC20, p2).approve(escAddr, S)).wait();
    const rc = await (await new ethers.Contract(escAddr, ESCA, p2).openMatch(S, forAddr || p1.address, 0)).wait();
    let id = null;
    rc.logs.forEach((l) => { try { const pp = iface.parseLog(l); if (pp && pp.name === "MatchOpened") id = pp.args.id; } catch (e) {} });
    let fv = null;
    const c = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { fv = v; } });
    c.connect(url); await H.sleep(600); c.authDev(p2w.address.toLowerCase());
    await H.until(() => fv && fv.me, 10000, "friend authed");
    c.stakedOpen({ tier: 0, faction: "nagas", escrowMatchId: id.toString(), friend: true, stake: S.toString() });
    const a = await H.until(() => fv && fv.lastOpened && fv.lastOpened.table, 15000, "friend table ack");
    return { code: a.id, eid: id, c: c };
  }
  // the Hall joins by code and lands in the battle
  async function joinByCode(win, code) {
    const s = () => win.DYHall._state();
    H.click(win, '[data-act="friend-sheet"]'); H.click(win, '[data-sheet-switch="friendjoin"]');
    win.document.querySelector("#hall-friend-code").value = code;
    H.click(win, "[data-friend-find]");
    await H.until(() => s().sheet && s().sheet.ctx && s().sheet.ctx.table, 20000, "table found");
    H.click(win, "[data-friend-join]"); await H.sleep(200);
    const f = win.document.querySelector('[data-faction="devas"]'); if (f) f.click();
    H.click(win, "[data-friend-join]");
    await H.until(() => s().matchView, 60000, "the battle");
    await H.until(() => win.document.querySelector(".hall-mhead"), 20000, "the match screen (past the dealing beat)");
    return s().matchView.matchId;
  }

  // ═══ THE REPRODUCTION: the PRE-FIX product files, driven through the SAME flow ═══
  //     `git show HEAD:` bytes in a temp checkout, one option on the harness (opts.srcDir). This is the incident.
  {
    const pre = path.join(os.tmpdir(), "dy_slipscope_prefix_" + process.pid, "mp");
    fs.mkdirSync(pre, { recursive: true });
    fs.writeFileSync(path.join(pre, "matchclient.js"), HEAD_MC);
    fs.writeFileSync(path.join(pre, "hall.js"), HEAD_HALL);
    const fr0 = await friendOpens(p3.address);
    const h0 = await H.hall(url, escAddr, dycAddr, p3, provider, { ls: SEED, srcDir: path.dirname(pre) });
    const w0 = h0.w;
    await H.until(() => w0.DYHall._state().signedInAs && w0.DYHall._state().feedState === "live", 15000, "pre-fix hall authed");
    await joinByCode(w0, fr0.code);
    const strip0 = w0.document.querySelector(".hall-settle");
    const t0 = strip0 ? strip0.textContent.replace(/\s+/g, " ").trim() : "";
    ok("P1d · PRE-FIX bytes in the SAME flow: the old slip printed INSIDE the live match — the incident, reproduced",
       !!strip0 && t0.indexOf(LIE_LOSS) >= 0, t0 || "(no strip — the reproduction did not fire)");
    H.teardown(h0);
    try { fr0.c.disconnect && fr0.c.disconnect(); } catch (e) {}
  }

  const fr = await friendOpens();
  const eid = fr.eid, ack = { id: fr.code };

  const h = await H.hall(url, escAddr, dycAddr, p1, provider, { ls: SEED });
  const w = h.w, st = () => w.DYHall._state();
  await H.until(() => st().signedInAs && st().feedState === "live", 15000, "hall authed");
  await H.until(() => w.document.querySelector(".hall-lobby-settle"), 15000, "the lobby home");

  console.log("\n── P3 · one slip at a time (the lobby home) ──");
  const lobbyStrips = w.document.querySelectorAll(".hall-lobby-settle .hall-settle");
  const lobbyText = w.document.querySelector(".hall-lobby-settle").textContent.replace(/\s+/g, " ").trim();
  ok("P3a · exactly ONE slip renders at the lobby home", lobbyStrips.length === 1, "found " + lobbyStrips.length);
  ok("P3b · it is the NEWER slip (by `at`) — the older one is not shown",
     lobbyText.indexOf(LIE_LOSS) >= 0 && lobbyText.indexOf(OLD_WIN_LINE) < 0, lobbyText);
  ok("P3c · the older slip is still stored and unsettled — hidden, not lost (evidence for S-HALL-SLIP-LIST-1)",
     JSON.parse(w.localStorage.getItem("dy_mp_slip_555")).settled === false);

  console.log("\n── P2 · the honest home (lobby) ──");
  ok("P2a · the lobby home renders the old slip as its own affordance", lobbyText.indexOf(LIE_LOSS) >= 0, lobbyText);
  {
    const h2 = await H.hall(url, escAddr, dycAddr, p1, provider, { ls: { "dy_mp_slip_555": OLDER_WIN } });
    const w2 = h2.w;
    await H.until(() => w2.DYHall._state().signedInAs, 15000, "second hall authed");
    await H.until(() => w2.document.querySelector(".hall-lobby-settle"), 15000, "the lobby home (win slip)");
    const t2 = w2.document.querySelector(".hall-lobby-settle").textContent.replace(/\s+/g, " ").trim();
    const cast2 = w2.document.querySelector(".hall-lobby-settle [data-settle]");
    ok("P2b · an old WIN slip at the lobby home carries a live CAST SETTLE act", !!cast2 && !cast2.disabled && t2.indexOf(OLD_WIN_LINE) >= 0, t2);
    H.teardown(h2);
  }

  console.log("\n── P1 (DOM) · a live staked match, with the old slip resumed ──");
  const MID = await joinByCode(w, ack.id);
  ok("P1g · a live STAKED match owns the screen", !!st().matchView && !!w.document.querySelector(".hall-mhead"));
  ok("P1h · the Hall still HOLDS the old slip (it was resumed, not discarded)",
     !!st().settlement && st().settlement.escrowMatchId === "777");
  ok("P1i · nothing settlement-shaped renders in the match screen — the lie is dead",
     w.document.querySelector(".hall-settle") === null && bodyText(w).indexOf(LIE_LOSS) < 0,
     "strip=" + (w.document.querySelector(".hall-settle") ? "PRESENT" : "absent"));

  console.log("\n── P2 · the live match's own slip ──");
  // the frame the server sends on a staked result (wshub finalizeOver, shape copied), addressed to THIS match
  const sock = h.sockets[h.sockets.length - 1];
  const liveFrame = { type: "settlement", matchId: MID, escrowMatchId: eid.toString(), stake: S.toString(), result: 0,
    resultName: "WIN_A", winnerSeat: 1, youWon: true, refereeAddress: referee.address,
    slip: { escrowMatchId: eid.toString(), matchId: eid.toString(), playerA: p2w.address, playerB: p1.address, stake: S.toString(), result: 0, signature: "0x" + "22".repeat(65) } };
  sock.onmessage({ data: JSON.stringify(liveFrame) });
  await H.until(() => w.document.querySelector(".hall-settle"), 10000, "the live slip renders");
  const liveText = w.document.querySelector(".hall-settle").textContent.replace(/\s+/g, " ").trim();
  ok("P2c · the live match's OWN slip renders inside the match", !!w.document.querySelector(".hall-settle"));
  ok("P2d · it carries this match's ruled money line", liveText.indexOf(dycLine(S)) >= 0, liveText);
  const castLive = w.document.querySelector(".hall-settle [data-settle]");
  ok("P2e · and a live CAST SETTLE act", !!castLive && !castLive.disabled);

  // and a slip naming ANOTHER match, arriving mid-battle, is refused into the lobby home
  sock.onmessage({ data: JSON.stringify(Object.assign({}, liveFrame, { matchId: "m-SOMEWHERE-ELSE", escrowMatchId: "555", stake: (50n * DEC).toString() })) });
  await H.sleep(300);
  const stillText = w.document.querySelector(".hall-settle") ? w.document.querySelector(".hall-settle").textContent.replace(/\s+/g, " ").trim() : "";
  ok("P1j · a slip naming ANOTHER match, arriving mid-battle, does NOT render here",
     stillText.indexOf(OLD_WIN_LINE) < 0 && stillText.indexOf(dycLine(S)) >= 0, stillText);

  H.teardown(h);
  try { fr.c.disconnect && fr.c.disconnect(); } catch (e) {}
  srv.close();
  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
