"use strict";
// S-HALL-ACCOUNT-1 — the Hall follows the wallet.
const path = require("path"), fs = require("fs");
const { ethers } = require("ethers"); const WS = require("ws");
const H = require("../lib.js");
const W3 = H.W3, MS = H.MS;
const OUT = H.OUT, DEC = 1000000000000000000n, S = 10n * DEC, RPC = H.RPC;
const K = { owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            A: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
            B: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
            C: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" };
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
const ERC20 = ["function approve(address,uint256) returns (bool)", "function mint(address,uint256)", "function balanceOf(address) view returns (uint256)"];
const ESCA = ["function openMatch(uint256,address,uint8) returns (uint256)", "function joinMatch(uint256,uint8)", "event MatchOpened(uint256 indexed id, address indexed opener, uint256 stake, address expectedOpponent, uint8 source)"];
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "  [" + d + "]" : ""))); };
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const prompts = (eth) => eth.__calls.filter((m) => m === "personal_sign" || m === "eth_requestAccounts" || m === "eth_sendTransaction");

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.NonceManager(new ethers.Wallet(K.owner, provider));
  const A = new ethers.Wallet(K.A, provider), Bw = new ethers.Wallet(K.B, provider);
  const referee = ethers.Wallet.createRandom();
  const dyc = await (new ethers.ContractFactory(art("MockDYC").abi, art("MockDYC").bytecode, owner)).deploy(); await dyc.waitForDeployment();
  const escC = await (new ethers.ContractFactory(art("StakeEscrow").abi, art("StakeEscrow").bytecode, owner)).deploy(await dyc.getAddress(), new ethers.Wallet(K.C).address, referee.address, 10n * DEC, 10000n * DEC, 24n * 3600n, await owner.getAddress()); await escC.waitForDeployment();
  const escAddr = await escC.getAddress(), dycAddr = await dyc.getAddress();
  await (await dyc.mint(A.address, 1000n * DEC)).wait(); await (await dyc.mint(Bw.address, 500n * DEC)).wait();

  const { makeServer } = require(path.join(MS, "src/server")); const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby")); const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match")); const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow")); const rng = require(path.join(MS, "src/rng"));
  function boot() {
    const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: true, NONCE_TTL_MS: 300000, TIERS: [0, 10, 50, 200, 1000],
      TIER_STAKES: { 10: S, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC }, STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC,
      MATCH_RPC_URL: RPC, STAKE_ESCROW_ADDRESS: escAddr, DYC_ADDRESS: dycAddr, STAKING_ENABLED: true,
      DARK_PAGE_ENABLED: false, FRIEND_TABLES_WITHHELD: false, KEEPALIVE_MS: 25000, THINK_MS: 120000, THINK_WARN_MS: 90000, VANISH_MS: 3000 };
    const logs = []; const srv = makeServer(cfg); const lobby = makeLobby(cfg.TIERS);
    makeHub(srv, cfg, lobby, (m) => logs.push(String(m)), { E: loadGuardedEngine().engine, rng, createRoom, store: makeMatchStore({ file: "/tmp/acct.jsonl" }), escrow: makeEscrowReader({ rpcUrl: RPC, escrowAddress: escAddr }) });
    return { cfg, srv, lobby, logs };
  }
  async function listen(b) { await new Promise((r) => b.srv.listen(0, r)); b.url = "ws://127.0.0.1:" + b.srv.address().port; return b; }
  const body = (w) => (w.document.body.textContent || "").replace(/\s+/g, " ").trim();
  const openSheet = (w, tier) => { w.document.querySelector('[data-act="open-sheet"]').click(); w.document.querySelector('[data-tier-row="' + tier + '"]').click(); w.document.querySelector('[data-faction="devas"]').click(); w.document.querySelector("[data-open-do]").click(); };

  // ═══ P1 · a mid-lobby switch, and R3's attribution ═══
  console.log("\n── P1 · mid-lobby switch A→B ──");
  {
    const S1 = await listen(boot());
    const { w, eth } = await H.hall(S1.url, escAddr, dycAddr, A, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "A authed");
    ok("P1 · the Hall is A's", st().me === A.address.toLowerCase() && st().signedInAs === A.address.toLowerCase());

    // R3 · ATTRIBUTION BY CONTROL: a second Hall booted with DYWallet ABSENT (init() cannot run).
    const ctlS = await listen(boot());
    const ctl = await H.hall(ctlS.url, escAddr, dycAddr, A, provider, { noWallet: true });
    await H.until(() => ctl.w.DYHall._state().signedInAs, 15000, "control authed");
    const ctlPrompts = prompts(ctl.eth);
    ok("R3 · init() asks for NO accounts (0 eth_requestAccounts)", eth.__calls.indexOf("eth_requestAccounts") < 0);
    ok("R3 · init() adds NO wallet prompt — identical to a boot with DYWallet absent",
       JSON.stringify(prompts(eth)) === JSON.stringify(ctlPrompts), "with=" + JSON.stringify(prompts(eth)) + " without=" + JSON.stringify(ctlPrompts));
    console.log("    boot prompts WITH DYWallet: " + JSON.stringify(prompts(eth)) + "  ·  WITHOUT: " + JSON.stringify(ctlPrompts));
    ctlS.srv.close();

    openSheet(w, "free");
    await H.until(() => (st().tables || []).find((x) => String(x.opener).toLowerCase() === A.address.toLowerCase()), 20000, "A's table");
    ok("P1 · A's table pins as A's (an owner-only act is offered)", !!w.document.querySelector('[data-act="close-free"],[data-act="cancel"]'));
    const before = prompts(eth).length;
    eth.__switchTo(Bw);
    await H.until(() => st().me === Bw.address.toLowerCase(), 20000, "the Hall re-keys to B");
    ok("P1 · the VISUAL re-key is immediate", st().me === Bw.address.toLowerCase());
    ok("P1 · the ruled account line renders", body(w).indexOf("account changed - the Hall is now following " + short(Bw.address.toLowerCase())) >= 0, body(w).slice(0, 130));
    await H.until(() => st().liquid != null && BigInt(st().liquid) === 500n * DEC, 25000, "B's liquid");
    ok("P1 · the header shows B's liquid, not A's (a chain read — no pen needed)", BigInt(st().liquid) === 500n * DEC, (BigInt(st().liquid) / DEC) + " DYC");
    ok("P1 · A's plaque lost its owner act", !w.document.querySelector('[data-act="close-free"],[data-act="cancel"]'));
    // R5 — the SESSION waits for a human act ON THE HALL
    await H.sleep(3000);
    ok("R5 · the session did NOT start itself", st().signedInAs !== Bw.address.toLowerCase() && st().signInNeeded === true);
    ok("R5 · ZERO wallet calls across the switch", prompts(eth).slice(before).length === 0, JSON.stringify(prompts(eth).slice(before)));
    ok("R5 · the sign-in card is up, carrying the ruled line and the SIGN IN act", !!w.document.querySelector("[data-signin]") && body(w).indexOf("account changed - the Hall is now following") >= 0);
    w.document.querySelector("[data-signin]").click();
    await H.until(() => st().signedInAs === Bw.address.toLowerCase(), 30000, "B's session after the click");
    const after = prompts(eth).slice(before);
    ok("R5 · exactly ONE signature, and it follows the click", after.length === 1 && after[0] === "personal_sign", JSON.stringify(after));
    ok("P1 · the SESSION is now B's", st().signedInAs === Bw.address.toLowerCase());
    ok("P1 · the server saw B authenticate", S1.logs.some((l) => l.toLowerCase().indexOf(Bw.address.toLowerCase()) > 0));
    ok("P1 · nothing was CAST — no transaction crossed the switch", after.indexOf("eth_sendTransaction") < 0);
    console.log("    liquid " + (BigInt(st().liquid) / DEC) + " DYC (B's) · calls before the click: [] · after: " + JSON.stringify(after));
    S1.srv.close();
  }

  // ═══ P2 · L2 — the ceremony prepared for A cannot follow B ═══
  console.log("\n── P2 · a ceremony prepared for A, then the switch ──");
  {
    const S2 = await listen(boot());
    const { w, eth } = await H.hall(S2.url, escAddr, dycAddr, A, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "A authed");
    w.document.querySelector('[data-act="open-sheet"]').click();
    w.document.querySelector('[data-tier-row="bronze"]').click();
    w.document.querySelector('[data-faction="devas"]').click();
    ok("P2 · a sheet is prepared for A", !!st().sheet && st().sheet.kind === "open");
    const meA = st().me, casts = eth.__calls.filter((m) => m === "eth_sendTransaction").length;
    eth.__switchTo(Bw);
    await H.until(() => st().me === Bw.address.toLowerCase(), 20000, "re-key");
    ok("P2 · the ceremony prepared for A is GONE from the screen (B cannot resume it)", !st().sheet && !st().ceremony);
    ok("P2 · no transaction was cast across the switch", eth.__calls.filter((m) => m === "eth_sendTransaction").length === casts);
    ok("P2 · A's identity no longer keys anything on screen", st().me !== meA);
    console.log("    (the §11 refusal line needs a HELD me≠pen state, which exists by design only under R1's deferral — P5)");
    S2.srv.close();
  }

  // ═══ P3 · L3 — hide, never delete ═══
  console.log("\n── P3 · A's records: invisible to B, intact for A ──");
  {
    const S3 = await listen(boot());
    const { w, eth, net } = await H.hall(S3.url, escAddr, dycAddr, A, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "A authed");
    const SEL = ethers.id("openMatch(uint256,address,uint8)").slice(0, 10);
    const raw = eth.request.bind(eth);
    eth.request = async (a) => { const r = await raw(a); if (a.method === "eth_sendTransaction" && String((a.params[0] || {}).data || "").startsWith(SEL)) { net.block(); net.sever(); } return r; };
    openSheet(w, "bronze");
    await H.until(() => st().strand, 60000, "A's strand");
    const aRec = st().pending.filter((e) => e.rec.kind === "open");
    ok("P3 · A holds a pending record", aRec.length === 1, JSON.stringify(st().pending));
    const aSlot = aRec[0].slot;
    net.allow();
    eth.__switchTo(Bw);
    await H.until(() => st().me === Bw.address.toLowerCase(), 25000, "re-key to B");
    if (w.document.querySelector("[data-signin]")) w.document.querySelector("[data-signin]").click();
    ok("P3 · B sees NO pending records (A's are invisible)", st().pending.filter((e) => e.rec.kind === "open").length === 0, JSON.stringify(st().pending));
    ok("P3 · B is offered no strand affordance", !st().strand && !w.document.querySelector("[data-strand-finish]") && !w.document.querySelector("[data-strand-cancel]"));
    const onDisk = w.localStorage.getItem("dyhall::pending::" + A.address.toLowerCase() + "::" + aSlot);
    ok("P3 · A's record is INTACT on disk under A's key (hidden, never deleted)", !!onDisk && JSON.parse(onDisk).escrowMatchId != null, String(onDisk).slice(0, 70));
    eth.__switchTo(A);
    await H.until(() => st().me === A.address.toLowerCase(), 25000, "re-key back to A");
    await H.sleep(300); if (w.document.querySelector("[data-signin]")) w.document.querySelector("[data-signin]").click();
    await H.until(() => st().pending.filter((e) => e.rec.kind === "open").length === 1 || st().strand || (st().tables || []).some((t) => t.staked), 40000, "A's record found again");
    ok("P3 · switching back to A finds A's record again", st().pending.filter((e) => e.rec.kind === "open").length === 1 || !!st().strand || (st().tables || []).some((t) => t.staked));
    console.log("    A's slot " + aSlot.slice(0, 16) + "…  · visible to B: no  · intact for A: yes");
    S3.srv.close();
  }

  // ═══ P4 · L4 — the quiet return ═══
  console.log("\n── P4 · the wallet goes away ──");
  {
    const S4 = await listen(boot());
    const { w, eth } = await H.hall(S4.url, escAddr, dycAddr, A, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "A authed");
    const before = prompts(eth).length;
    eth.__switchTo(null);
    await H.until(() => st().accessState === "connect", 20000, "the connect card");
    ok("P4 · the Hall returned to its connect card", st().accessState === "connect");
    ok("P4 · quietly — no words were added", !st().accountNote, String(st().accountNote));
    ok("P4 · identity is cleared", st().me === null);
    ok("P4 · and NO wallet call was made", prompts(eth).length === before, JSON.stringify(prompts(eth).slice(before)));
    eth.__switchTo(A);
    await H.until(() => st().me === A.address.toLowerCase(), 20000, "the wallet returns");
    ok("P4 · reconnecting the wallet runs the normal road", st().me === A.address.toLowerCase());
    ok("P4 · and still no wallet call was made without a click", prompts(eth).length === before, JSON.stringify(prompts(eth).slice(before)));
    S4.srv.close();
  }

  // ═══ P5 · R1 — the battle survives, the re-key defers, then runs ═══
  console.log("\n── P5 · a switch mid-battle ──");
  {
    const S5 = await listen(boot());
    const { w, eth } = await H.hall(S5.url, escAddr, dycAddr, A, provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "A authed");
    openSheet(w, "bronze");
    const t = await H.until(() => (st().tables || []).find((x) => x.staked), 60000, "A's staked table");
    const C = new ethers.Wallet(K.C, provider);
    await (await new ethers.Contract(dycAddr, ERC20, owner).mint(C.address, 100n * DEC)).wait();
    const Cn = new ethers.NonceManager(C);
    await (await new ethers.Contract(dycAddr, ERC20, Cn).approve(escAddr, S)).wait();
    await (await new ethers.Contract(escAddr, ESCA, Cn).joinMatch(BigInt(t.escrowMatchId), 0)).wait();
    const opp = new WS(S5.url); const oppSeen = {};
    opp.on("message", (d) => { let m; try { m = JSON.parse(String(d)); } catch (e) { return; } oppSeen[m.type] = m; });
    await H.until(() => oppSeen.challenge, 8000, "opp challenge");
    opp.send(JSON.stringify({ type: "auth-dev", address: C.address.toLowerCase() }));
    await H.until(() => oppSeen.authed, 8000, "opp authed");
    opp.send(JSON.stringify({ type: "join", tableId: t.id, faction: "asuras" }));
    await H.until(() => st().matchView, 40000, "the battle");
    ok("P5 · a battle is live", !!st().matchView);
    const sockBefore = st().signedInAs, castsBefore = eth.__calls.filter((m) => m === "eth_sendTransaction").length;
    eth.__switchTo(Bw);
    await H.sleep(2500);
    ok("P5 · the battle SURVIVED (a wallet click cost no forfeit)", !!st().matchView);
    ok("P5 · the session was NOT torn down", st().signedInAs === sockBefore);
    ok("P5 · the identity is still the seat's — the re-key is DEFERRED", st().me === A.address.toLowerCase());
    ok("P5 · and the deferral is recorded", st().pendingReKey === Bw.address.toLowerCase(), String(st().pendingReKey));
    ok("P5 · NO cast crossed accounts while the pen was wrong", eth.__calls.filter((m) => m === "eth_sendTransaction").length === castsBefore);
    opp.close();
    // the opponent vanished → the grace expires → the match ends. The player then LEAVES the over-screen, which is
    // one of the two roads out of a battle (the other is a lobby view arriving); both must consume the deferral.
    await H.until(() => w.document.querySelector("[data-leave]"), 60000, "the leave control on the over-screen");
    w.document.querySelector("[data-leave]").click();
    const promptsAtLeave = prompts(eth).length;
    await H.until(() => st().me === Bw.address.toLowerCase(), 60000, "the deferred re-key");
    ok("P5 · the moment the battle cleared, the switch ran UNPROMPTED", st().me === Bw.address.toLowerCase());
    ok("P5 · the deferral was consumed", st().pendingReKey === null);
    ok("P5 · the ruled account line follows", body(w).indexOf("account changed - the Hall is now following") >= 0);
    await H.sleep(2500);
    ok("R5 · the deferred re-key lands on the CARD, not an auto-prompt", st().signInNeeded === true && !!w.document.querySelector("[data-signin]"));
    ok("R5 · and it fired NO signature on its own", prompts(eth).length === promptsAtLeave, JSON.stringify(prompts(eth).slice(promptsAtLeave)));
    w.document.querySelector("[data-signin]").click();
    await H.until(() => st().signedInAs === Bw.address.toLowerCase(), 30000, "B's session after the click");
    ok("R5 · the click starts B's session", st().signedInAs === Bw.address.toLowerCase());
    ok("R5 · with exactly one signature", prompts(eth).length === promptsAtLeave + 1, JSON.stringify(prompts(eth).slice(promptsAtLeave)));
    console.log("    deferred through the battle, then re-keyed to " + short(Bw.address.toLowerCase()));
    S5.srv.close();
  }

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
