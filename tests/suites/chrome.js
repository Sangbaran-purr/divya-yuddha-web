"use strict";
// S-HALL-CHROME-1 — the Hall's manners. anvil + the real match server in-process + the real hall.js/matchclient.js.
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
const ERC20 = ["function approve(address,uint256) returns (bool)", "function mint(address,uint256)", "function balanceOf(address) view returns (uint256)"];
const ESCA = ["function openMatch(uint256,address,uint8) returns (uint256)", "function joinMatch(uint256,uint8)", "event MatchOpened(uint256 indexed id, address indexed opener, uint256 stake, address expectedOpponent, uint8 source)"];
const CARD = "connection lost - reconnect?";
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "  [" + d + "]" : ""))); };

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.NonceManager(new ethers.Wallet(K.owner, provider));
  const p1 = new ethers.Wallet(K.p1, provider);
  const p2w = new ethers.Wallet(K.p2, provider), p2 = new ethers.NonceManager(p2w);
  const referee = ethers.Wallet.createRandom();
  const dyc = await (new ethers.ContractFactory(art("MockDYC").abi, art("MockDYC").bytecode, owner)).deploy(); await dyc.waitForDeployment();
  const escC = await (new ethers.ContractFactory(art("StakeEscrow").abi, art("StakeEscrow").bytecode, owner)).deploy(await dyc.getAddress(), new ethers.Wallet(K.treasury).address, referee.address, 10n * DEC, 10000n * DEC, 24n * 3600n, await owner.getAddress()); await escC.waitForDeployment();
  const escAddr = await escC.getAddress(), dycAddr = await dyc.getAddress();
  await (await dyc.mint(p1.address, 1000n * DEC)).wait(); await (await dyc.mint(p2w.address, 1000n * DEC)).wait();

  const { makeServer } = require(path.join(MS, "src/server")); const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby")); const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match")); const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow")); const rng = require(path.join(MS, "src/rng"));
  function boot(over) {
    const cfg = Object.assign({ PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: true, NONCE_TTL_MS: 300000, TIERS: [0, 10, 50, 200, 1000],
      TIER_STAKES: { 10: S, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC }, STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC,
      MATCH_RPC_URL: RPC, STAKE_ESCROW_ADDRESS: escAddr, DYC_ADDRESS: dycAddr, STAKING_ENABLED: true,
      DARK_PAGE_ENABLED: false, FRIEND_TABLES_WITHHELD: false }, over || {});
    const logs = []; const srv = makeServer(cfg); const lobby = makeLobby(cfg.TIERS);
    makeHub(srv, cfg, lobby, (m) => logs.push(String(m)), { E: loadGuardedEngine().engine, rng, createRoom, store: makeMatchStore({ file: "/tmp/chrome.jsonl" }), escrow: makeEscrowReader({ rpcUrl: RPC, escrowAddress: escAddr }) });
    return { cfg, srv, lobby, logs };
  }
  async function listen(b) { await new Promise((r) => b.srv.listen(0, r)); b.url = "ws://127.0.0.1:" + b.srv.address().port; return b; }
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;
  const body = (w) => (w.document.body.textContent || "").replace(/\s+/g, " ").trim();

  // ═══ P1 · M1 — the FREE open's sheet ═══
  console.log("\n── P1 · M1 the sheet self-dismisses on OUR ack ──");
  {
    const B = await listen(boot());
    const { w, sent } = await H.hall(B.url, escAddr, dycAddr, p1, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed");
    H.click(w, '[data-act="open-sheet"]'); H.click(w, '[data-tier-row="free"]'); H.click(w, '[data-faction="devas"]');
    ok("P1 · the open sheet is up before the act", !!st().sheet && st().sheet.kind === "open");
    H.click(w, "[data-open-do]");
    ok("P1 · it does NOT close on the send (the ack has not arrived)", !!st().sheet);
    await H.until(() => st().sheet === null, 15000, "the sheet closing on the ack");
    ok("P1 · SUCCESS → the sheet closed itself", st().sheet === null);
    ok("P1 · and the floor is live with our table", (st().tables || []).some((t) => String(t.opener).toLowerCase() === p1.address.toLowerCase()));
    // FAILURE keeps today's behaviour: a second free open is refused (one table per address) and the sheet HOLDS
    H.click(w, '[data-act="open-sheet"]'); H.click(w, '[data-tier-row="free"]'); H.click(w, '[data-faction="devas"]');
    H.click(w, "[data-open-do]");
    await H.until(() => st().lastServerError, 15000, "the refusal");
    await H.sleep(400);
    ok("P1 · FAILURE → the sheet HOLDS (today's behaviour preserved)", !!st().sheet, JSON.stringify(st().sheet));
    ok("P1 · and the refusal is surfaced", /already ha(s|ve) an open table/.test(st().lastServerError), st().lastServerError);
    H.teardown(w); B.srv.close();
  }

  // ═══ P2 · M2 — the floor is live across the takeover ═══
  console.log("\n── P2 · M2 the 2026-09-08 strand replayed ──");
  {
    const B = await listen(boot());
    const { w } = await H.hall(B.url, escAddr, dycAddr, p1, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed");
    // p1 opens a staked table through the real ceremony
    H.click(w, '[data-act="open-sheet"]'); H.click(w, '[data-tier-row="bronze"]'); H.click(w, '[data-faction="devas"]');
    H.click(w, "[data-open-do]");
    const mine = await H.until(() => (st().tables || []).find((t) => t.staked), 40000, "our staked table");
    ok("P2 · the floor carries our table before the join", !!mine);
    // a second seat joins → the battle takes over
    const st2 = { v: null }; const C = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { st2.v = v; } });
    C.connect(B.url); await H.sleep(600); C.authDev(p2w.address.toLowerCase());
    await H.until(() => st2.v && st2.v.me, 10000, "joiner authed");
    await (await new ethers.Contract(dycAddr, ERC20, p2).approve(escAddr, S)).wait();
    await (await new ethers.Contract(escAddr, ESCA, p2).joinMatch(BigInt(mine.escrowMatchId), 0)).wait();
    C.join(mine.id, "asuras");
    await H.until(() => st().matchView, 30000, "the takeover");
    ok("P2 · the battle owns the screen", !!st().matchView);
    // MID-BATTLE: the table was consumed by the join — a {tables} frame reflecting that arrived DURING the takeover
    ok("P2 · a {tables} frame arriving MID-BATTLE is reflected (our table is gone from state)",
       !(st().tables || []).some((t) => t.id === mine.id), JSON.stringify((st().tables || []).map((t) => t.id)));
    // and a table opened by someone else mid-battle also lands
    const st3 = { v: null }; const D = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { st3.v = v; } });
    D.connect(B.url); await H.sleep(600); D.authDev("0x" + "d".repeat(40));
    await H.until(() => st3.v && st3.v.me, 10000, "D authed");
    D.open(50, "vanaras");
    await H.until(() => (st().tables || []).some((t) => t.tier === 50), 20000, "the new table reaches the Hall mid-battle");
    ok("P2 · a NEW table opened mid-battle reaches the Hall's state", (st().tables || []).some((t) => t.tier === 50));
    console.log("    floor state during the battle: " + JSON.stringify((st().tables || []).map((t) => t.id + "/" + t.tier)));
    H.teardown(w); B.srv.close();
  }

  // ═══ P3 · M3 — the header re-reads on money moves ═══
  console.log("\n── P3 · M3 the header re-reads ──");
  {
    const B = await listen(boot());
    const { w } = await H.hall(B.url, escAddr, dycAddr, p1, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed");
    await H.until(() => st().liquid != null, 15000, "first read");
    const before = BigInt(st().liquid);
    H.click(w, '[data-act="open-sheet"]'); H.click(w, '[data-tier-row="bronze"]'); H.click(w, '[data-faction="devas"]');
    H.click(w, "[data-open-do]");
    await H.until(() => st().liquid != null && BigInt(st().liquid) === before - S, 40000, "the header re-read after the OPEN LOCK");
    ok("P3 · OPEN LOCK → the header re-read and the number moved", BigInt(st().liquid) === before - S, before + " -> " + st().liquid);
    console.log("    liquid " + (before / DEC) + " DYC -> " + (BigInt(st().liquid) / DEC) + " DYC");
    // busy sentinel: force the read provider dead and re-read
    w.localStorage.setItem("dyhall::readRpcUrl", "http://127.0.0.1:1");
    const cancelBtn = w.document.querySelector('[data-act="cancel"]');
    if (cancelBtn) { cancelBtn.click(); await H.sleep(200); const d = w.document.querySelector("[data-cancel-do]"); if (d) d.click(); }
    await H.until(() => st().liquid == null, 40000, "the busy sentinel");
    ok("P3 · a DEAD RPC on the re-read → the busy idiom, never a stale number", st().liquid == null);
    ok("P3 · and the header renders the sentinel, not the old figure", /Liquid —/.test(body(w)), body(w).slice(0, 90));
    H.teardown(w); B.srv.close();
  }

  // ═══ P4 · M4 — no wallet call without a human act ═══
  console.log("\n── P4 · M4 reconnect manners ──");
  {
    const B = await listen(boot());
    const { w, eth, net } = await H.hall(B.url, escAddr, dycAddr, p1, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed");
    let signs = 0; const seen = [];
    const raw = eth.request.bind(eth);
    eth.request = async (a) => { seen.push(a.method); if (a.method === "personal_sign") signs++; return raw(a); };
    w.ethereum = eth;   // belt-and-braces: whatever BrowserProvider reads, it reads THIS
    net.sever();                                    // the idle tab loses its socket
    await H.until(() => body(w).indexOf(CARD) >= 0, 20000, "the card");
    ok("P4 · the ruled card renders verbatim", body(w).indexOf(CARD) >= 0);
    ok("P4 · RECONNECT is offered", !!w.document.querySelector("[data-reconnect]"));
    await H.sleep(6000);                            // the old road would have popped MetaMask by now, twice
    ok("P4 · ZERO wallet signatures while it sits there", signs === 0, "signs=" + signs);
    net.sever();                                    // a second drop before the click
    await H.sleep(1500);
    ok("P4 · a second drop stacks no cards", (body(w).match(/connection lost/g) || []).length === 1);
    ok("P4 · and still zero wallet calls", signs === 0, "signs=" + signs);
    const beforeClick = seen.length;
    w.document.querySelector("[data-reconnect]").click();
    await H.until(() => st().feedState === "live", 25000, "the click reconnecting");
    await H.sleep(800);
    ok("P4 · THE CLICK reconnects and re-auths", st().feedState === "live");
    ok("P4 · nothing touched the wallet BEFORE the click", beforeClick === 0, JSON.stringify(seen.slice(0, beforeClick)));
    ok("P4 · exactly one signature, and it follows the click", signs === 1, "signs=" + signs + " methods=" + JSON.stringify(seen));
    ok("P4 · the card is gone", body(w).indexOf(CARD) < 0);
    H.teardown(w); B.srv.close();
  }

  // ═══ P5 · M5 — the seats line ═══
  console.log("\n── P5 · M5 the seats line ──");
  {
    const B = await listen(boot());
    const { w } = await H.hall(B.url, escAddr, dycAddr, p1, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed");
    // another player holds a table at a DIFFERENT tier, so the floor is not empty (totalOpen===0 would return the
    // empty-room face and the per-tier line would never render at all — that is a different state, not this one).
    const other = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: () => {} });
    other.connect(B.url); await H.sleep(600); other.authDev(p2w.address.toLowerCase());
    await H.until(() => { try { return other.view().me; } catch (e) { return null; } }, 10000, "other authed");
    await (await new ethers.Contract(dycAddr, ERC20, p2).approve(escAddr, S)).wait();
    const rc2 = await (await new ethers.Contract(escAddr, ESCA, p2).openMatch(S, ethers.ZeroAddress, 0)).wait();
    const iface2 = new ethers.Interface(ESCA); let eid2 = null;
    rc2.logs.forEach((l) => { try { const pp = iface2.parseLog(l); if (pp && pp.name === "MatchOpened") eid2 = pp.args.id; } catch (e) {} });
    other.stakedOpen({ tier: 10, faction: "nagas", escrowMatchId: eid2.toString(), stake: S.toString() });
    await H.until(() => (st().tables || []).some((t) => t.staked), 20000, "the other's BRONZE table");
    // a genuinely empty tier (GOLD) still invites — the floor is not empty, so this is the per-tier line, not the empty room
    const gold = Array.from(w.document.querySelectorAll(".hall-rail-chip")).find((c) => c.getAttribute("data-tier") === "gold");
    gold.click(); await H.sleep(300);
    ok("P5 · a genuinely seatless tier KEEPS its invitation", /no open seats at this tier/.test(body(w)), body(w).slice(0, 140));
    const chip = Array.from(w.document.querySelectorAll(".hall-rail-chip")).find((c) => c.getAttribute("data-tier") === "free");
    // now open our own FREE table and look again
    H.click(w, '[data-act="open-sheet"]'); H.click(w, '[data-tier-row="free"]'); H.click(w, '[data-faction="devas"]');
    H.click(w, "[data-open-do]");
    await H.until(() => (st().tables || []).some((t) => String(t.opener).toLowerCase() === p1.address.toLowerCase()), 20000, "our table");
    chip.click(); await H.sleep(500);
    const seen = body(w);
    ok("P5 · with only YOUR table at the tier the line is SUPPRESSED", seen.indexOf("no open seats at this tier") < 0, seen.slice(0, 160));
    ok("P5 · and your plaque is still there saying it", /CANCEL TABLE|waiting for an opponent/i.test(seen), seen.slice(0, 200));
    H.teardown(w); B.srv.close();
  }

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
