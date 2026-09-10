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
  async function server() {
    const D = 10n ** 18n;
    const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: true, NONCE_TTL_MS: 300000, TIERS: [0, 10, 50, 200, 1000],
      TIER_STAKES: { 10: 10n * D, 50: 50n * D, 200: 200n * D, 1000: 1000n * D }, STAKE_MIN: 10n * D, STAKE_MAX: 10000n * D,
      MATCH_RPC_URL: H.RPC, STAKE_ESCROW_ADDRESS: c.escAddr, DYC_ADDRESS: c.dycAddr, STAKING_ENABLED: true, FRIEND_TABLES_WITHHELD: false };
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

  // ═══ NOW: the door plays ═══
  console.log("\n── the door, opened ──");
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
    await H.until(() => battle(A.w) && battle(B.w), 20000, "the battle on both screens");
    ok("F9 · the battle is on BOTH screens", battle(A.w) && battle(B.w));
    ok("F10 · the engine is loaded now — and it is the site's own copy",
       typeof A.w.newGame === "function" && typeof B.w.newGame === "function");

    // play it to a result, through the Hall's own controls
    for (let i = 0; i < 120; i++) {
      for (const w of [A.w, B.w]) {
        const mc = w.document.querySelector("[data-mullconfirm]"); if (mc && !mc.disabled) { mc.click(); continue; }
        const pb = w.document.querySelector("[data-pass]"); if (pb && !pb.disabled) pb.click();
      }
      await H.sleep(120);
      if ((st(A.w).matchView || {}).over) break;
    }
    ok("F11 · the match is PLAYED TO A RESULT through the Hall's own UI", !!(st(A.w).matchView || {}).over,
       JSON.stringify(st(A.w).matchView));
    ok("F12 · and the result is on the screen", /wins the match|WINS|a draw|Draw/i.test(body(A.w)) || body(A.w).indexOf("LEAVE") >= 0);
    H.teardown(A); H.teardown(B);
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
