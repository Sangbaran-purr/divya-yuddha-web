"use strict";
// G3b — CAN A GHOST BE MANUFACTURED? A stale record at step:"openMatch" (hash known) is resumed AFTER the escrow
// has been matched. The step:"server" branch is escrow-state-gated; the openTxHash branch is not.
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
const ESC = ["function joinMatch(uint256,uint8)", "function matches(uint256) view returns (address playerA,address playerB,uint256 stake,uint8 srcA,uint8 srcB,address expectedOpponent,uint64 matchedAt,uint8 state)"];

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.NonceManager(new ethers.Wallet(K.owner, provider));
  const p1 = new ethers.Wallet(K.p1, provider);
  const p2w = new ethers.Wallet(K.p2, provider), p2 = new ethers.NonceManager(p2w);
  const referee = ethers.Wallet.createRandom();
  const dyc = await (new ethers.ContractFactory(art("MockDYC").abi, art("MockDYC").bytecode, owner)).deploy(); await dyc.waitForDeployment();
  const escC = await (new ethers.ContractFactory(art("StakeEscrow").abi, art("StakeEscrow").bytecode, owner)).deploy(await dyc.getAddress(), new ethers.Wallet(K.treasury).address, referee.address, 10n * DEC, 10000n * DEC, 24n * 3600n, await owner.getAddress());
  await escC.waitForDeployment();
  const escAddr = await escC.getAddress(), dycAddr = await dyc.getAddress();
  await (await dyc.mint(p1.address, 1000n * DEC)).wait(); await (await dyc.mint(p2w.address, 1000n * DEC)).wait();

  const { makeServer } = require(path.join(MS, "src/server")); const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby")); const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match")); const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow")); const rng = require(path.join(MS, "src/rng"));
  const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: true, NONCE_TTL_MS: 300000, TIERS: [10, 50, 200, 1000],
    TIER_STAKES: { 10: S, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC }, STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC,
    MATCH_RPC_URL: RPC, STAKE_ESCROW_ADDRESS: escAddr, DYC_ADDRESS: dycAddr, STAKING_ENABLED: true };
  const logLines = []; const srv = makeServer(cfg); const lobby = makeLobby(cfg.TIERS);
  makeHub(srv, cfg, lobby, (m) => logLines.push(String(m)),
    { E: loadGuardedEngine().engine, rng, createRoom, store: makeMatchStore({ file: "/tmp/g3b.jsonl" }), escrow: makeEscrowReader({ rpcUrl: RPC, escrowAddress: escAddr }) });
  await new Promise((r) => srv.listen(0, r));
  const url = "ws://127.0.0.1:" + srv.address().port;
  const say = (l) => console.log("  " + l.padEnd(52) + " lobby.size=" + lobby.size() + " " + JSON.stringify(lobby.list().map((t) => t.id + "/esc" + t.escrowMatchId)));

  // the REAL Hall opens a Bronze table
  const one = await H.hall(url, escAddr, dycAddr, p1, provider, {});
  const st1 = () => one.w.DYHall._state();
  await H.until(() => st1().signedInAs && st1().feedState === "live", 15000, "authed+live");
  let capturedSlot = null;
  const sampler = setInterval(() => { const r = st1().pending.filter((e) => e.rec.kind === "open")[0]; if (r && /^0x[0-9a-f]{64}$/i.test(r.slot)) capturedSlot = r.slot; }, 5);
  H.click(one.w, '[data-act="open-sheet"]'); H.click(one.w, '[data-tier-row="bronze"]');
  H.click(one.w, '[data-faction="devas"]'); H.click(one.w, "[data-open-do]");
  const t0 = await H.until(() => (st1().tables || [])[0], 30000, "table listed");
  clearInterval(sampler);
  say("STEP 1 · Hall opened a real table");
  console.log("    captured openMatch tx (record slot): " + capturedSlot);
  await H.until(() => st1().pending.filter((e) => e.rec.kind === "open").length === 0, 8000, "record cleared").catch(() => {});
  console.log("    record after the ack: " + JSON.stringify(st1().pending));

  // a second player joins on chain + lobby → the table is consumed, the match starts
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;
  const Bst = { v: null }; const B = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { Bst.v = v; } });
  B.connect(url); await H.sleep(700); B.authDev(p2w.address.toLowerCase());
  await H.until(() => Bst.v && Bst.v.me, 10000, "B authed");
  await (await new ethers.Contract(dycAddr, ERC20, p2).approve(escAddr, S)).wait();
  await (await new ethers.Contract(escAddr, ESC, p2).joinMatch(BigInt(t0.escrowMatchId), 0)).wait();
  B.join(t0.id, "asuras");
  await H.until(() => Bst.v && Bst.v.screen === "match", 20000, "match started");
  say("STEP 2 · joined — table consumed, match live");
  const mm = await new ethers.Contract(escAddr, ESC, provider).matches(BigInt(t0.escrowMatchId));
  console.log("    escrow state now: " + Number(mm.state) + " (2=MATCHED)");

  // PLANT the stale record: exactly what a ceremony that never reached step:"server" would leave behind.
  const carried = {};
  for (let i = 0; i < one.w.localStorage.length; i++) { const k = one.w.localStorage.key(i); carried[k] = one.w.localStorage.getItem(k); }
  carried["dyhall::pending::" + p1.address.toLowerCase() + "::" + capturedSlot] =
    JSON.stringify({ kind: "open", step: "openMatch", openTxHash: capturedSlot, tier: 10, faction: "devas", stake: S.toString(), at: Date.now() });
  console.log("\n  · planted a stale record at step:\"openMatch\" (hash known, escrow already MATCHED)");
  one.dom.window.close();

  // RELOAD
  const two = await H.hall(url, escAddr, dycAddr, p1, provider, { ls: carried });
  const st2 = () => two.w.DYHall._state();
  await H.until(() => st2().signedInAs, 15000, "reloaded + authed");
  await H.sleep(3500);
  say("STEP 3 · after the reload (resume ran)");
  const ghost = lobby.list().find((t) => String(t.escrowMatchId) === String(t0.escrowMatchId));
  console.log("\n  VERDICT: " + (ghost ? "GHOST MANUFACTURED — a table for an already-MATCHED escrow: " + ghost.id : "no ghost — the resume refused"));
  // ── does simply CLOSING THE TAB clear it? (closeBySession on disconnect) ──
  console.log("\n── the zero-cost remedy: disconnect the opener's session ──");
  console.log("    before: lobby.size=" + lobby.size());
  two.net.block(); two.net.sever();                       // the tab closes / the socket dies
  await H.sleep(2500);
  console.log("    after disconnect: lobby.size=" + lobby.size() + "  ghost gone: " + !lobby.list().some((t) => t.id === ghost.id));
  console.log("\nserver log tail:\n" + logLines.slice(-3).map((l) => "    " + l).join("\n"));
  process.exit(0);
})().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
