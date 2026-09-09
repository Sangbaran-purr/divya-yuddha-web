"use strict";
// G3 — TABLE LIFECYCLE, REPRODUCED. anvil + the REAL match server in-process + the REAL matchclient.js.
// open (staked) → join → match → concede → settlement slip. list() sampled at every step.
const path = require("path"), fs = require("fs");
const { ethers } = require("ethers"); const WS = require("ws");
const H = require("../lib.js");
const MC = require(path.join(H.SITE, "mp/matchclient.js"));
const W3 = H.W3, MS = H.MS;
const OUT = H.OUT;
const DEC = 1000000000000000000n, S = 10n * DEC, RPC = H.RPC;
const K = { owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            p1: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
            p2: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
            treasury: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" };
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
const ERC20 = ["function approve(address,uint256) returns (bool)", "function mint(address,uint256)", "function balanceOf(address) view returns (uint256)"];
const ESC = ["function openMatch(uint256,address,uint8) returns (uint256)", "function joinMatch(uint256,uint8)",
             "function matches(uint256) view returns (address playerA,address playerB,uint256 stake,uint8 srcA,uint8 srcB,address expectedOpponent,uint64 matchedAt,uint8 state)",
             "event MatchOpened(uint256 indexed id, address indexed opener, uint256 stake, address expectedOpponent, uint8 source)"];

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.NonceManager(new ethers.Wallet(K.owner, provider));
  const p1w = new ethers.Wallet(K.p1, provider), p2w = new ethers.Wallet(K.p2, provider);
  const p1 = new ethers.NonceManager(p1w), p2 = new ethers.NonceManager(p2w);
  p1.address = p1w.address; p2.address = p2w.address;
  const referee = ethers.Wallet.createRandom();
  const dycArt = art("MockDYC"), escArt = art("StakeEscrow");
  const dyc = await (new ethers.ContractFactory(dycArt.abi, dycArt.bytecode, owner)).deploy(); await dyc.waitForDeployment();
  const esc = await (new ethers.ContractFactory(escArt.abi, escArt.bytecode, owner)).deploy(await dyc.getAddress(), new ethers.Wallet(K.treasury).address, referee.address, 10n * DEC, 10000n * DEC, 24n * 3600n, await owner.getAddress());
  await esc.waitForDeployment();
  const escAddr = await esc.getAddress(), dycAddr = await dyc.getAddress();
  await (await dyc.mint(p1.address, 1000n * DEC)).wait(); await (await dyc.mint(p2.address, 1000n * DEC)).wait();

  const { makeServer } = require(path.join(MS, "src/server")); const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby")); const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match")); const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow")); const rng = require(path.join(MS, "src/rng"));
  const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: true, NONCE_TTL_MS: 300000, TIERS: [10, 50, 200, 1000],
    TIER_STAKES: { 10: S, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC }, STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC,
    MATCH_RPC_URL: RPC, STAKE_ESCROW_ADDRESS: escAddr, DYC_ADDRESS: dycAddr, STAKING_ENABLED: true, REFEREE_PRIVATE_KEY: referee.privateKey };
  const logLines = []; const srv = makeServer(cfg);
  const lobby = makeLobby(cfg.TIERS);                       // OUR handle on the very map the frame is built from
  makeHub(srv, cfg, lobby, (m) => logLines.push(String(m)),
    { E: loadGuardedEngine().engine, rng, createRoom, store: makeMatchStore({ file: "/tmp/g3_store.jsonl" }), escrow: makeEscrowReader({ rpcUrl: RPC, escrowAddress: escAddr }), signer: require(path.join(MS, "src/signer")).makeSigner ? undefined : undefined });
  await new Promise((r) => srv.listen(0, r));
  const url = "ws://127.0.0.1:" + srv.address().port;
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;

  const say = (label) => console.log("  " + label.padEnd(46) + " lobby.size=" + lobby.size() + "  list=" + JSON.stringify(lobby.list().map((t) => t.id + "/" + t.tier + "/esc" + t.escrowMatchId)));

  // two clients on the dev-address road (the sanctioned road for a two-seat server test)
  const mk = (addr) => { const st = { v: null }; const c = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { st.v = v; } }); c.connect(url); return { c, st }; };
  const A = mk(), B = mk();
  await H.sleep(700); A.c.authDev(p1.address.toLowerCase()); B.c.authDev(p2.address.toLowerCase());
  await H.until(() => A.st.v && A.st.v.me && B.st.v && B.st.v.me, 10000, "both authed");
  say("after auth (no tables yet)");

  // A: approve + openMatch on chain, then the staked open
  await (await new ethers.Contract(dycAddr, ERC20, p1).approve(escAddr, S)).wait();
  const rc = await (await new ethers.Contract(escAddr, ESC, p1).openMatch(S, ethers.ZeroAddress, 0)).wait();
  const iface = new ethers.Interface(ESC); let eid = null;
  rc.logs.forEach((l) => { try { const p = iface.parseLog(l); if (p && p.name === "MatchOpened") eid = p.args.id; } catch (e) {} });
  A.c.stakedOpen({ tier: 10, faction: "devas", escrowMatchId: eid.toString(), stake: S.toString() });
  await H.until(() => (A.st.v.tables || []).length === 1, 10000, "table listed");
  const tid = A.st.v.tables[0].id;
  say("STEP 1 · after the staked open");

  // B: approve + joinMatch on chain, then the lobby join
  await (await new ethers.Contract(dycAddr, ERC20, p2).approve(escAddr, S)).wait();
  await (await new ethers.Contract(escAddr, ESC, p2).joinMatch(eid, 0)).wait();
  B.c.join(tid, "asuras");
  await H.until(() => (A.st.v && A.st.v.screen === "match") || (B.st.v && B.st.v.screen === "match"), 20000, "match started");
  say("STEP 2 · after the join (match started)");

  // end it: A concedes → result + settlement slip
  A.c.concede();
  await H.until(() => (A.st.v && A.st.v.settlement) || (B.st.v && B.st.v.settlement), 20000, "settlement slip").catch(() => console.log("  (no slip — continuing)"));
  await H.sleep(1200);
  say("STEP 3 · after the match ended + slip signed");

  const mm = await new ethers.Contract(escAddr, ESC, provider).matches(eid);
  console.log("\n  escrow state after the match: " + Number(mm.state) + " (2=MATCHED, 3=SETTLED)");
  console.log("\n  VERDICT: table still in the lobby after the match? " + (lobby.list().some((t) => t.id === tid) ? "YES — GHOST" : "NO — removed at the join"));
  console.log("\nserver log:\n" + logLines.map((l) => "    " + l).join("\n"));
  process.exit(0);
})().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
