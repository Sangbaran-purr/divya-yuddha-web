"use strict";
// S-HALL-CODE-LOOKUP-1 — the friend code rides the SERVER lookup. anvil + the real match server in-process + the
// real hall.js/matchclient.js in jsdom. P1 flag OFF, P2 flag ON (the proof the withholding flag can flip), P3
// unknown code, P4 the bound, P5 the roads beside this one.
const path = require("path"), fs = require("fs");
const { ethers } = require("ethers"); const WS = require("ws");
const H = require("../lib.js");
const MC = require(path.join(H.SITE, "mp/matchclient.js"));
const W3 = H.W3, MS = H.MS;
const OUT = H.OUT, DEC = 1000000000000000000n, S = 10n * DEC, RPC = H.RPC;
const K = { owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            p1: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
            p2: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
            treasury: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" };
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
const ERC20 = ["function approve(address,uint256) returns (bool)", "function mint(address,uint256)"];
const ESCA = ["function openMatch(uint256,address,uint8) returns (uint256)", "event MatchOpened(uint256 indexed id, address indexed opener, uint256 stake, address expectedOpponent, uint8 source)"];
const RULED_UNREACHABLE = "could not reach the table server - your code is fine, try again in a moment";
const RULED_NOCODE = "no table found for that code - ask your friend to re-share it";
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "  [" + d + "]" : ""))); };

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.NonceManager(new ethers.Wallet(K.owner, provider));
  const p1 = new ethers.Wallet(K.p1, provider);                      // the Hall (joins by code)
  const p2w = new ethers.Wallet(K.p2, provider), p2 = new ethers.NonceManager(p2w);   // the friend (opens)
  const referee = ethers.Wallet.createRandom();
  const dyc = await (new ethers.ContractFactory(art("MockDYC").abi, art("MockDYC").bytecode, owner)).deploy(); await dyc.waitForDeployment();
  const escC = await (new ethers.ContractFactory(art("StakeEscrow").abi, art("StakeEscrow").bytecode, owner)).deploy(await dyc.getAddress(), new ethers.Wallet(K.treasury).address, referee.address, 10n * DEC, 10000n * DEC, 24n * 3600n, await owner.getAddress()); await escC.waitForDeployment();
  const escAddr = await escC.getAddress(), dycAddr = await dyc.getAddress();
  await (await dyc.mint(p1.address, 1000n * DEC)).wait(); await (await dyc.mint(p2w.address, 1000n * DEC)).wait();

  const { makeServer } = require(path.join(MS, "src/server")); const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby")); const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match")); const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow")); const rng = require(path.join(MS, "src/rng"));
  function boot(withheld) {
    const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: true, NONCE_TTL_MS: 300000, TIERS: [0, 10, 50, 200, 1000],
      TIER_STAKES: { 10: S, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC }, STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC,
      MATCH_RPC_URL: RPC, STAKE_ESCROW_ADDRESS: escAddr, DYC_ADDRESS: dycAddr, STAKING_ENABLED: true,
      DARK_PAGE_ENABLED: false, FRIEND_TABLES_WITHHELD: !!withheld };
    const logs = []; const srv = makeServer(cfg); const lobby = makeLobby(cfg.TIERS);
    makeHub(srv, cfg, lobby, (m) => logs.push(String(m)), { E: loadGuardedEngine().engine, rng, createRoom, store: makeMatchStore({ file: "/tmp/fl.jsonl" }), escrow: makeEscrowReader({ rpcUrl: RPC, escrowAddress: escAddr }) });
    return { cfg, srv, lobby, logs };
  }
  async function listen(b) { await new Promise((r) => b.srv.listen(0, r)); b.url = "ws://127.0.0.1:" + b.srv.address().port; return b; }
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;

  // the friend opens a private table locked to p1 (a raw client on the dev road; the Hall is p1's)
  async function friendOpens(url) {
    await (await new ethers.Contract(dycAddr, ERC20, p2).approve(escAddr, S)).wait();
    const rc = await (await new ethers.Contract(escAddr, ESCA, p2).openMatch(S, p1.address, 0)).wait();
    const iface = new ethers.Interface(ESCA); let eid = null;
    rc.logs.forEach((l) => { try { const p = iface.parseLog(l); if (p && p.name === "MatchOpened") eid = p.args.id; } catch (e) {} });
    const st = { v: null }; const c = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { st.v = v; } });
    c.connect(url); await H.sleep(600); c.authDev(p2w.address.toLowerCase());
    await H.until(() => st.v && st.v.me, 10000, "friend authed");
    c.stakedOpen({ tier: 0, faction: "nagas", escrowMatchId: eid.toString(), friend: true, stake: S.toString() });
    // take the code from the {opened} ACK, not the broadcast — with the withholding flag ON the friend table is
    // (correctly) absent from every {tables} frame, including its own opener's.
    const ack = await H.until(() => st.v && st.v.lastOpened && st.v.lastOpened.table, 15000, "friend table {opened} ack");
    return { code: ack.id, eid, c };
  }
  const openFriendSheet = (w) => { H.click(w, '[data-act="friend-sheet"]'); H.click(w, '[data-sheet-switch="friendjoin"]'); };
  const typeCode = (w, code) => { const i = w.document.querySelector("#hall-friend-code"); i.value = code; return i; };
  const errText = (w) => { const e = w.document.querySelector(".hall-sheet-err"); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; };

  for (const withheld of [false, true]) {
    const tag = withheld ? "P2 · flag ON (withheld)" : "P1 · flag OFF (today's posture)";
    console.log("\n── " + tag + " ──");
    const B = await listen(boot(withheld));
    const fr = await friendOpens(B.url);
    const { w, sent } = await H.hall(B.url, escAddr, dycAddr, p1, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "hall authed");

    const inBroadcast = (st().tables || []).some((t) => t.id === fr.code);
    ok(tag + " · the friend table is " + (withheld ? "ABSENT from" : "present in") + " the {tables} frame", inBroadcast === !withheld,
       JSON.stringify((st().tables || []).map((t) => t.id + (t.friend ? "/friend" : ""))));

    openFriendSheet(w); typeCode(w, fr.code);
    const before = sent.filter((f) => f.type === "lookup").length;
    H.click(w, "[data-friend-find]");
    await H.until(() => st().sheet && st().sheet.ctx && st().sheet.ctx.table, 20000, "table found by code");
    ok(tag + " · the code FINDS the table", st().sheet.ctx.table.id === fr.code);
    const lookups = sent.filter((f) => f.type === "lookup");
    ok(tag + " · a {lookup} frame went out ON THE WIRE (the server was asked, not the array)",
       lookups.length === before + 1 && lookups[lookups.length - 1].code === fr.code, JSON.stringify(lookups));

    // and the join still starts a match
    H.click(w, "[data-friend-join]");
    await H.sleep(200);
    const fac = w.document.querySelector('[data-faction="devas"]'); if (fac) fac.click();
    H.click(w, "[data-friend-join]");
    await H.until(() => st().matchView || (st().sheet === null && !st().ceremony), 60000, "join resolved").catch(() => {});
    await H.until(() => st().matchView, 60000, "match started");
    ok(tag + " · the join starts the match", !!st().matchView);
    fr.c.raw && fr.c.raw.disconnect(); H.teardown(w); B.srv.close();
  }

  // ═══ P3 · an unknown code ═══
  console.log("\n── P3 · an unknown code ──");
  {
    const B = await listen(boot(false));
    const { w, sent } = await H.hall(B.url, escAddr, dycAddr, p1, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed");
    openFriendSheet(w); typeCode(w, "t9-doesnotexist");
    H.click(w, "[data-friend-find]");
    await H.until(() => errText(w), 20000, "the refusal");
    ok("P3 · the no-such-code line (unchanged, unruled)", errText(w) === RULED_NOCODE, errText(w));
    ok("P3 · it is NOT the reachability line (an answer is not silence)", errText(w) !== RULED_UNREACHABLE);
    ok("P3 · nothing was sent beyond the lookup", sent.filter((f) => f.type === "join" || f.type === "open").length === 0, JSON.stringify(sent.map((f) => f.type)));
    ok("P3 · the code entry survives for retry", w.document.querySelector("#hall-friend-code").value === "t9-doesnotexist");
    ok("P3 · no table was selected", !(st().sheet && st().sheet.ctx && st().sheet.ctx.table));
    H.teardown(w); B.srv.close();
  }

  // ═══ P4 · forced past the bound ═══
  console.log("\n── P4 · the lookup forced past the bound ──");
  {
    const B = await listen(boot(false));
    const { w, sent, net } = await H.hall(B.url, escAddr, dycAddr, p1, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed");
    openFriendSheet(w); typeCode(w, "t1-whatever");
    net.block(); net.sever();                       // the socket dies: no answer can ever come
    const t0 = Date.now();
    H.click(w, "[data-friend-find]");
    await H.until(() => errText(w), 15000, "the reachability line");
    const took = Date.now() - t0;
    ok("P4 · the RULED reachability line renders verbatim", errText(w) === RULED_UNREACHABLE, errText(w));
    ok("P4 · within the bound (~5s)", took <= 7000, took + "ms");
    ok("P4 · the code entry survives", w.document.querySelector("#hall-friend-code").value === "t1-whatever");
    ok("P4 · nothing was mutated (no join/open sent, no table selected)",
       sent.filter((f) => f.type === "join" || f.type === "open").length === 0 && !(st().sheet && st().sheet.ctx && st().sheet.ctx.table));
    console.log("    resolved in " + took + "ms: \"" + errText(w) + "\"");
    H.teardown(w); B.srv.close();
  }

  // ═══ P4b · THE TIMER ITSELF (P4 above proved the fail-fast on a dead socket; this proves the ~5s bound) ═══
  console.log("\n── P4b · a socket that is OPEN but never answers ──");
  {
    // a stub server that completes the handshake and then ignores {lookup} forever
    const { WebSocketServer } = require("ws");
    const httpSrv = require("http").createServer();
    const wss = new WebSocketServer({ server: httpSrv });
    wss.on("connection", function (sock) {
      sock.send(JSON.stringify({ type: "challenge", nonce: "deadbeef", devMode: false }));
      sock.on("message", function (d) {
        let m; try { m = JSON.parse(String(d)); } catch (e) { return; }
        if (m.type === "auth") { sock.send(JSON.stringify({ type: "authed", address: p1.address.toLowerCase() })); sock.send(JSON.stringify({ type: "tables", tables: [] })); }
        // every other word — {lookup} included — is met with SILENCE
      });
    });
    await new Promise((r) => httpSrv.listen(0, r));
    const url = "ws://127.0.0.1:" + httpSrv.address().port;
    const { w, sent } = await H.hall(url, escAddr, dycAddr, p1, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed against the silent server");
    openFriendSheet(w); typeCode(w, "t1-silence");
    const t0 = Date.now();
    H.click(w, "[data-friend-find]");
    ok("P4b · the lookup DID go out (the socket is open)", sent.filter((f) => f.type === "lookup").length === 1);
    await H.until(() => errText(w), 15000, "the bound firing");
    const took = Date.now() - t0;
    ok("P4b · the ~5s TIMER fires (not the fail-fast: the socket was open)", took >= 4000 && took <= 7000, took + "ms");
    ok("P4b · and it is the RULED reachability line", errText(w) === RULED_UNREACHABLE, errText(w));
    ok("P4b · the code entry survives", w.document.querySelector("#hall-friend-code").value === "t1-silence");
    console.log("    silence answered in " + took + "ms: \"" + errText(w) + "\"");
    H.teardown(w); wss.close(); httpSrv.close();
  }

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
