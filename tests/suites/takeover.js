"use strict";
// S-HALL-TAKEOVER-1 — THE SCREEN ALWAYS COMES. Finding 3 of INCIDENT-2026-09-10, closed as VERIFICATION.
//
// The Mac (seat 0) never rendered its battle at 11:12:37. The triage named two conditions; this suite records what
// measurement did to them:
//   (1) the frozen ceremony sheet was NEVER the mechanism — a takeover CURES it (D3, on the pre-fix bytes).
//   (2) the mechanism was seat-binds-to-SESSION-not-ADDRESS (wshub `byId.get(t.table.sessionId)`). Its AFTERMATH —
//       the seat vanishing when that session died — is what W3-PRESENCE-1 fixed; its LIVE-coexistence case is the
//       road queued as S-HALL-ELSEWHERE-1 (the second tab's silence, evidenced in D2 below).
//
// This suite is the permanent guard that the seat's own client always gets its screen: D1 the baseline takeover,
// D3 the old bytes still taking over, D2 the two-session pair (the seat's client takes over; a dead seat-socket
// re-seats onto the living tab). It touches NO product file.
const path = require("path"), fs = require("fs"), os = require("os");
const { execFileSync } = require("child_process");
const H = require("../lib.js");
const { ethers } = require("ethers"); const WS = require("ws");
const MC = require(path.join(H.SITE, "mp/matchclient.js"));
const DEC = 1000000000000000000n, S = 10n * DEC;
const ERC20 = ["function approve(address,uint256) returns (bool)", "function mint(address,uint256)"];
const ESC = ["function joinMatch(uint256,uint8)"];
const P2K = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const WALLET_LINE = "confirm in your wallet…";

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const body = (w) => (w.document.body.textContent || "").replace(/\s+/g, " ").trim();
const battleOnScreen = (w) => !!w.document.querySelector(".hall-mhead, .hall-dealing");
const overlay = (w) => w.document.getElementById("hall-sheet-overlay");

async function main() {
  const c = await H.chain();
  const p2w = new ethers.Wallet(P2K, c.provider), p2 = new ethers.NonceManager(p2w);
  // MockDYC.mint is open in the harness contract — mint from p2's OWN key, so we never race H.chain's owner
  // NonceManager (whose cache we cannot see).
  await (await new ethers.Contract(c.dycAddr, ERC20, p2).mint(p2w.address, 1000n * DEC)).wait();
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;

  // our own hub: DEV_ADDRESS_MODE so the raw joiner can auth as its real (escrow-locking) address.
  const MS = H.MS;
  const { makeServer } = require(path.join(MS, "src/server")); const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby")); const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match")); const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow")); const rng = require(path.join(MS, "src/rng"));
  const servers = [];
  async function server() {
    const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: true, NONCE_TTL_MS: 300000, TIERS: [0, 10, 50, 200, 1000],
      TIER_STAKES: { 10: S, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC }, STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC,
      MATCH_RPC_URL: H.RPC, STAKE_ESCROW_ADDRESS: c.escAddr, DYC_ADDRESS: c.dycAddr, STAKING_ENABLED: true,
      DARK_PAGE_ENABLED: false, FRIEND_TABLES_WITHHELD: false };
    const srv = makeServer(cfg);
    makeHub(srv, cfg, makeLobby(cfg.TIERS), () => {}, { E: loadGuardedEngine().engine, rng, createRoom,
      store: makeMatchStore({ file: path.join(os.tmpdir(), "dy_takeover.jsonl") }),
      escrow: makeEscrowReader({ rpcUrl: H.RPC, escrowAddress: c.escAddr }) });
    await new Promise((r) => srv.listen(0, r));
    const b = { srv: srv, url: "ws://127.0.0.1:" + srv.address().port };
    servers.push(b); return b;
  }

  // a Hall that opens a STAKED table (the Mac's act)
  async function hallOpens(url, srcDir) {
    const h = await H.hall(url, c.escAddr, c.dycAddr, c.player, c.provider, srcDir ? { srcDir: srcDir } : {});
    const w = h.w, st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed+live");
    H.click(w, '[data-act="open-sheet"]'); H.click(w, '[data-tier-row="bronze"]'); H.click(w, '[data-faction="devas"]');
    H.click(w, "[data-open-do]");
    const t = await H.until(() => (st().tables || []).filter((x) => x.escrowMatchId)[0], 40000, "our table on the floor");
    return { h: h, w: w, st: st, table: t };
  }
  // the opponent: chain first (its own stake), then the lobby join — the road that starts the room
  async function opponentJoins(url, tableId, escrowMatchId) {
    let v = null;
    const cl = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (nv) => { v = nv; } });
    cl.connect(url); await H.sleep(600); cl.authDev(p2w.address.toLowerCase());
    await H.until(() => v && v.me, 10000, "the opponent authed");
    await (await new ethers.Contract(c.dycAddr, ERC20, p2).approve(c.escAddr, S)).wait();
    await (await new ethers.Contract(c.escAddr, ESC, p2).joinMatch(BigInt(escrowMatchId), 0)).wait();
    cl.join(tableId, "nagas");
    return cl;
  }

  // ═══ D1 · the baseline: the seat's own client takes over ═══
  console.log("\n── D1 · baseline: the screen comes ──");
  {
    const s = await server();
    const A = await hallOpens(s.url);
    const opp = await opponentJoins(s.url, A.table.id, A.table.escrowMatchId);
    await H.until(() => A.st().matchView, 60000, "the takeover");
    ok("D1a · the seat's client takes over — the match owns its state", !!A.st().matchView);
    ok("D1b · the battle is ON THE SCREEN, not merely in state", battleOnScreen(A.w));
    ok("D1c · nothing covers it — no sheet overlay stands", overlay(A.w) === null);
    try { opp.disconnect && opp.disconnect(); } catch (e) {}
    H.teardown(A.h);
  }

  // ═══ D3 · the pre-fix bytes: the frozen sheet was NEVER the mechanism ═══
  console.log("\n── D3 · the frozen sheet, disproven as the mechanism ──");
  {
    // A pre-fix pin names a COMMIT, never a moving ref (the standing law of 5e57b0e), with a loud guard.
    const PRE_FIX_REF = "dca23ab";
    const preHall = execFileSync("git", ["show", PRE_FIX_REF + ":mp/hall.js"], { cwd: H.SITE, maxBuffer: 8 << 20 }).toString();
    if (preHall.indexOf("function closeSheet()") >= 0) {
      console.log("  ✖ the pre-fix pin " + PRE_FIX_REF + " already contains the ceremony fix — this drive would prove nothing"); process.exit(1);
    }
    const pre = path.join(os.tmpdir(), "dy_takeover_pre_" + process.pid, "mp");
    fs.mkdirSync(pre, { recursive: true });
    fs.writeFileSync(path.join(pre, "hall.js"), preHall);
    fs.writeFileSync(path.join(pre, "matchclient.js"), fs.readFileSync(path.join(H.SITE, "mp/matchclient.js")));

    const s = await server();
    const A = await hallOpens(s.url, path.dirname(pre));
    ok("D3a · the incident's condition (a) is really standing: the frozen sheet, on the wallet line",
       overlay(A.w) !== null && body(A.w).indexOf(WALLET_LINE) >= 0,
       "overlay=" + (overlay(A.w) !== null) + " walletLine=" + (body(A.w).indexOf(WALLET_LINE) >= 0));
    const opp = await opponentJoins(s.url, A.table.id, A.table.escrowMatchId);
    await H.until(() => A.st().matchView, 60000, "the takeover on old bytes");
    await H.until(() => battleOnScreen(A.w), 20000, "the battle on screen (old bytes)");
    ok("D3b · the takeover fires ANYWAY — the frozen sheet never stopped the screen coming", battleOnScreen(A.w));
    ok("D3c · and the takeover CURES it: the frozen overlay and its wallet line are gone",
       overlay(A.w) === null && body(A.w).indexOf(WALLET_LINE) < 0,
       "overlay=" + (overlay(A.w) !== null) + " walletLine=" + (body(A.w).indexOf(WALLET_LINE) >= 0));
    try { opp.disconnect && opp.disconnect(); } catch (e) {}
    H.teardown(A.h);
  }

  // ═══ D2 · two live sessions of one address — the real mechanism, and PRESENCE-1's answer ═══
  console.log("\n── D2 · two sessions: the seat's client, and the sibling ──");
  {
    const s = await server();
    const A = await hallOpens(s.url);                    // opened the table: the session the seat binds to
    const B = await H.hall(s.url, c.escAddr, c.dycAddr, c.player, c.provider, {});   // the same address, idle
    const bst = () => B.w.DYHall._state();
    await H.until(() => bst().signedInAs && bst().feedState === "live", 15000, "the sibling authed+live");
    const opp = await opponentJoins(s.url, A.table.id, A.table.escrowMatchId);
    await H.until(() => A.st().matchView, 60000, "the takeover");
    await H.until(() => battleOnScreen(A.w), 20000, "the battle on screen");
    ok("D2a · the SEAT'S client takes over — the screen comes to the session that holds the seat",
       !!A.st().matchView && battleOnScreen(A.w));
    await H.sleep(1500);
    ok("D2b · the sibling of the SAME address is not the seat and gets no match (wshub binds the seat to a SESSION)",
       bst().matchView == null, "sibling matchView=" + JSON.stringify(bst().matchView));
    // the evidence the queued S-HALL-ELSEWHERE-1 stands on: what the sibling is told while its address is in a battle
    const face = body(B.w);
    ok("D2c · EVIDENCE for S-HALL-ELSEWHERE-1: the sibling is shown the EMPTY ROOM while its own address is seated",
       face.indexOf("No warrior is seated") >= 0 && (bst().tables || []).length === 0,
       "tables=" + (bst().tables || []).length + " | face: " + face.slice(face.indexOf("EVERY SEAT"), face.indexOf("EVERY SEAT") + 200));
    // and the composed law: when the seat's socket dies, the living tab is re-seated (W3-PRESENCE-1)
    A.h.net.block(); A.h.net.sever();
    await H.until(() => bst().matchView, 40000, "the sibling re-seated");
    ok("D2d · the seat's socket dies → the living tab is RE-SEATED (W3-PRESENCE-1, composed)", !!bst().matchView);
    await H.until(() => battleOnScreen(B.w), 20000, "the battle on the sibling's screen");
    ok("D2e · …and the screen comes there too — the player never loses the battle to a dead tab", battleOnScreen(B.w));
    try { opp.disconnect && opp.disconnect(); } catch (e) {}
    H.teardown(A.h); H.teardown(B);
  }

  // ═══ the enumerated roads, PINNED — so a future edit that re-opens one is noticed here ═══
  console.log("\n── the audited roads, pinned ──");
  {
    const hall = fs.readFileSync(path.join(H.SITE, "mp/hall.js"), "utf8");
    const hub = fs.readFileSync(path.join(MS, "src/wshub.js"), "utf8");
    const dismissWrites = hall.split("\n").filter((l) => l.indexOf("dismissedMatch[") >= 0 && l.indexOf("] = true") >= 0);
    ok("road 2 · `dismissedMatch` is written at exactly ONE place — the player's own leave act",
       dismissWrites.length === 1 && dismissWrites[0].indexOf("data-leave") >= 0, dismissWrites.join(" | ").trim());
    ok("road 6 · a join is REFUSED when the seat's socket is not open — no room is created into the void",
       hub.indexOf('openerWs.readyState !== 1') >= 0);
    ok("road 8 · the live-sibling refusal is still PRESENCE-1's line (a seat on a LIVE socket is never taken)",
       hub.indexOf("if (!(R.vanished === seat || !bound || bound.readyState !== 1)) return false;") >= 0);
  }

  servers.forEach((b) => { try { b.srv.close(); } catch (e) {} });
  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
