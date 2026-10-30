"use strict";
// SITE-AUDIT-1 batch 2 — "YOUR STAKES": the refund is a BUTTON, proven against the REAL StakeEscrow on anvil.
//
// Every Hall here points at a DEAD match-server url, so the whole road runs with the socket blocked: the panel
// finds the stakes on the CHAIN (no server, no logs, no local storage) and every action is the player's own wallet.
// The escrow is the shipped contract (settleTimeout 24h), the clock is anvil's, and "24 hours" is evm_increaseTime.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const H = require("../lib");

const DEC = 1000000000000000000n, S = 10n * DEC;
const DEAD = "ws://127.0.0.1:1";
const P2_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";   // anvil account #2
const HALL = fs.readFileSync(path.join(H.SITE, "mp", "hall.js"), "utf8");
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } }
const txt = (w) => (w.document.getElementById("hall-root") || {}).textContent || "";
const sends = (h) => h.eth.__calls.filter((m) => m === "eth_sendTransaction").length;
const btn = (w, kind, eid) => w.document.querySelector('[data-stake-act="' + kind + '"][data-eid="' + eid + '"]');
async function until(fn, ms, label) { return H.until(fn, ms || 20000, label).catch(() => null); }

// a fresh escrow + two funded players (A = the harness player, B = anvil #2)
async function world() {
  const c = await H.chain();
  // NonceManagers (the provider caches identical reads for ~250ms, so back-to-back sends need local nonces), RESYNCED
  //   from the chain before every burst: the Hall's own wallet shim also sends as these accounts, behind their backs.
  const Bw = new ethers.Wallet(P2_KEY, c.provider);
  const B = new ethers.NonceManager(Bw);
  await (await c.dyc.mint(Bw.address, 1000n * DEC)).wait();
  const esc = (who) => new ethers.Contract(c.escAddr, c.esc.interface, who);
  const dyc = (who) => new ethers.Contract(c.dycAddr, c.dyc.interface, who);
  const A = new ethers.NonceManager(c.player);
  const bal = async (a) => BigInt(await c.dyc.balanceOf(a));
  async function openBy(who, addr) { who.reset(); await (await dyc(who).approve(c.escAddr, S)).wait(); const tx = await esc(who).openMatch(S, ethers.ZeroAddress, 0); const rc = await tx.wait();
    return String(rc.logs.map((l) => { try { return c.esc.interface.parseLog(l); } catch (e) { return null; } }).filter((x) => x && x.name === "MatchOpened")[0].args.id); }
  async function joinBy(who, id) { who.reset(); await (await dyc(who).approve(c.escAddr, S)).wait(); await (await esc(who).joinMatch(BigInt(id), 0)).wait(); }
  const chainId = Number((await c.provider.getNetwork()).chainId);
  async function sign(id, result) {
    const m = await c.esc.matches(BigInt(id));
    return c.referee.signTypedData({ name: "StakeEscrow", version: "1", chainId, verifyingContract: c.escAddr },
      { Result: [{ name: "matchId", type: "uint256" }, { name: "playerA", type: "address" }, { name: "playerB", type: "address" }, { name: "stake", type: "uint256" }, { name: "result", type: "uint8" }] },
      { matchId: BigInt(id), playerA: m.playerA, playerB: m.playerB, stake: m.stake, result });
  }
  const state = async (id) => Number((await c.esc.matches(BigInt(id))).state);
  const warp = async (s) => { await c.provider.send("evm_increaseTime", [s]); await c.provider.send("evm_mine", []); };
  return { c, A, B, Aaddr: c.player.address, Baddr: Bw.address, Bw, openBy, joinBy, sign, state, warp, bal, esc };
}
async function hallFor(W, who, opts) {
  const h = await H.hall(DEAD, W.c.escAddr, W.c.dycAddr, who, W.c.provider, opts || {});
  await until(() => h.w.DYHall && h.w.DYHall._stakes().read === "ok", 20000, "the stakes read");
  return h;
}
const slip = (eid, stake, result, youWon, sig) => JSON.stringify({ matchId: "m" + eid, escrowMatchId: String(eid), stake: stake.toString(), result, youWon,
  slip: { escrowMatchId: String(eid), result, signature: sig }, settled: false, at: Date.now() });

async function run() {
  // ═══ C · CANCEL — the opener's unjoined table ═══
  console.log("\n── C · cancel an OPEN table you opened (socket blocked) ──");
  {
    const W = await world();
    const id = await W.openBy(W.A);
    const before = await W.bal(W.Aaddr);
    const h = await hallFor(W, W.c.player);
    ok("C1 · the panel finds the table ON CHAIN (no server, no local record) with the ruled line and Cancel",
       txt(h.w).indexOf("Your 10 DYC table #" + id + " is waiting for an opponent.") >= 0 && !!btn(h.w, "cancel", id), txt(h.w).slice(0, 200));
    H.click(h.w, '[data-stake-act="cancel"][data-eid="' + id + '"]');
    await until(async () => (await W.state(id)) === 4, 30000, "cancelled");
    ok("C2 · Cancel and refund: the escrow is closed and the opener has the stake back", (await W.state(id)) === 4 && (await W.bal(W.Aaddr)) === before + S);
    await until(() => !btn(h.w, "cancel", id), 15000, "the row gone");
    ok("C3 · …and the row is gone from the panel after the re-read", !btn(h.w, "cancel", id) && txt(h.w).indexOf("table #" + id) < 0);
    H.teardown(h);
    // a non-opener is never offered someone else's cancel
    const id2 = await W.openBy(W.A);
    const hb = await hallFor(W, W.Bw);
    const sent0 = sends(hb);
    await hb.w.DYHall._stakeAction("cancel", id2);
    ok("C4 · a NON-opener sees no Cancel for that table, and a forced attempt sends nothing", !btn(hb.w, "cancel", id2) && sends(hb) === sent0 && (await W.state(id2)) === 1);
    H.teardown(hb);
  }

  // ═══ R · REFUND — a MATCHED match never settled ═══
  console.log("\n── R · refund both stakes: refused before 24h, open after (player A, then player B) ──");
  {
    const W = await world();
    const id = await W.openBy(W.A); await W.joinBy(W.B, id);
    const h = await hallFor(W, W.c.player);
    const b0 = btn(h.w, "refund", id);
    ok("R1 · before 24h: the countdown line and a DISABLED refund button", !!b0 && b0.disabled && /Your 10 DYC is locked in match #\d+\. Refund opens in 2\dh \d+m\./.test(txt(h.w)), txt(h.w).slice(0, 220));
    const sent0 = sends(h);
    await h.w.DYHall._stakeAction("refund", id);                         // forced through the disabled button
    ok("R2 · a refund forced early is REFUSED BY THE DRY RUN — no transaction sent — with the plain sentence",
       sends(h) === sent0 && /Refund opens 24 hours after the match started - in 2\dh \d+m\./.test(txt(h.w)) && (await W.state(id)) === 2, txt(h.w).slice(0, 260));
    H.teardown(h);
    await W.warp(86400 + 60);
    const a0 = await W.bal(W.Aaddr), b1 = await W.bal(W.Baddr);
    const h2 = await hallFor(W, W.c.player);
    const b = btn(h2.w, "refund", id);
    ok("R3 · after 24h: 'Match #N was never settled - either player can refund both stakes now.' and a live button",
       !!b && !b.disabled && txt(h2.w).indexOf("Match #" + id + " was never settled - either player can refund both stakes now.") >= 0);
    H.click(h2.w, '[data-stake-act="refund"][data-eid="' + id + '"]');
    await until(async () => (await W.state(id)) === 4, 30000, "aborted");
    ok("R4 · PLAYER A refunds: both stakes back in full", (await W.state(id)) === 4 && (await W.bal(W.Aaddr)) === a0 + S && (await W.bal(W.Baddr)) === b1 + S);
    H.teardown(h2);
  }
  {
    const W = await world();
    const id = await W.openBy(W.A); await W.joinBy(W.B, id);
    await W.warp(86400 + 60);
    const a0 = await W.bal(W.Aaddr), b0 = await W.bal(W.Baddr);
    const h = await hallFor(W, W.Bw);
    ok("R5 · PLAYER B (the joiner) is offered the same refund", !!btn(h.w, "refund", id) && !btn(h.w, "refund", id).disabled);
    H.click(h.w, '[data-stake-act="refund"][data-eid="' + id + '"]');
    await until(async () => (await W.state(id)) === 4, 30000, "aborted");
    ok("R6 · PLAYER B refunds: both stakes back in full", (await W.state(id)) === 4 && (await W.bal(W.Aaddr)) === a0 + S && (await W.bal(W.Baddr)) === b0 + S);
    H.teardown(h);
  }

  // ═══ S · RESULTS — settled, draw, win, loss ═══
  console.log("\n── S · what each stored result offers ──");
  {
    const W = await world();
    const id = await W.openBy(W.A); await W.joinBy(W.B, id);
    W.A.reset(); await (await W.esc(W.A).settle(BigInt(id), 0, await W.sign(id, 0))).wait();   // WIN_A, settled on chain
    await W.warp(86400 + 60);
    const h = await hallFor(W, W.c.player);
    ok("S1 · a SETTLED match offers nothing (it is not in the panel at all)", !h.w.document.querySelector('[data-eid="' + id + '"]') && txt(h.w).indexOf("#" + id) < 0);
    H.teardown(h);
  }
  {
    const W = await world();
    const id = await W.openBy(W.A); await W.joinBy(W.B, id);
    const sig = await W.sign(id, 2);
    const a0 = await W.bal(W.Aaddr), b0 = await W.bal(W.Baddr);
    const h = await hallFor(W, W.c.player, { ls: { ["dy_mp_slip_" + id]: slip(id, S, 2, false, sig) } });
    const collect = h.w.document.querySelector('[data-settle="' + id + '"], [data-stake-act="collect"][data-eid="' + id + '"]');
    ok("S2 · a stored DRAW: the ruled draw line, 'Either player can collect the refund now.' and REFUND BOTH STAKES",
       /A draw - both stakes return in full once either player collects the refund\./.test(txt(h.w)) && /Either player can collect the refund now\./.test(txt(h.w)) &&
       !!collect && collect.textContent === "REFUND BOTH STAKES", txt(h.w).slice(0, 260));
    collect.click();
    await until(async () => (await W.state(id)) === 3, 30000, "settled draw");
    ok("S3 · …and collecting it refunds BOTH stakes (settled as a draw)", (await W.state(id)) === 3 && (await W.bal(W.Aaddr)) === a0 + S && (await W.bal(W.Baddr)) === b0 + S);
    H.teardown(h);
  }
  {
    const W = await world();
    const id = await W.openBy(W.A); await W.joinBy(W.B, id);
    const sig = await W.sign(id, 0);
    await W.warp(86400 + 60);
    const h = await hallFor(W, W.c.player, { ls: { ["dy_mp_slip_" + id]: slip(id, S, 0, true, sig) } });
    const collect = h.w.document.querySelector('[data-settle="' + id + '"], [data-stake-act="collect"][data-eid="' + id + '"]');
    ok("S4 · a stored WIN after 24h: COLLECT 19 DYC + the 24-hour warning, and NO refund button",
       !!collect && collect.textContent === "COLLECT 19 DYC" && txt(h.w).indexOf("Collect within 24 hours of the match start - after that, either player can refund both stakes instead.") >= 0 &&
       !btn(h.w, "refund", id), txt(h.w).slice(0, 260));
    H.teardown(h);
  }
  {
    const W = await world();
    const id = await W.openBy(W.A); await W.joinBy(W.B, id);
    const sig = await W.sign(id, 1);                                      // WIN_B — A lost
    await W.warp(86400 + 60);
    const h = await hallFor(W, W.c.player, { ls: { ["dy_mp_slip_" + id]: slip(id, S, 1, false, sig) } });
    ok("S5 · a stored LOSS after 24h: no refund button anywhere — even though the contract would allow one",
       !btn(h.w, "refund", id) && !h.w.document.querySelector('[data-settle="' + id + '"]') && /You lost (match #\d+|this match) - the winner collects the pot\./.test(txt(h.w)), txt(h.w).slice(0, 260));
    H.teardown(h);
  }

  {
    // the same stored loss where the panel shows EVERY row (the gate screen has no result strips above it)
    const W = await world();
    const nftArt = JSON.parse(fs.readFileSync(path.join(H.OUT, "AccessNFT.sol", "AccessNFT.json"), "utf8"));
    const nft = await (new ethers.ContractFactory(nftArt.abi, nftArt.bytecode.object, W.c.owner)).deploy(await W.c.owner.getAddress(), "ipfs://t/"); await nft.waitForDeployment();
    const id = await W.openBy(W.A); await W.joinBy(W.B, id);
    const sig = await W.sign(id, 1);
    await W.warp(86400 + 60);
    const h = await hallFor(W, W.c.player, { realGate: true, accessNFT: await nft.getAddress(), ls: { ["dy_mp_slip_" + id]: slip(id, S, 1, false, sig) } });
    await until(() => h.w.document.querySelector('.hall-stake[data-eid="' + id + '"]'), 15000, "the panel row");
    ok("S6 · on the gate screen too, a stored LOSS row says so and offers no refund",
       !!h.w.document.querySelector('.hall-stake[data-eid="' + id + '"]') && txt(h.w).indexOf("You lost match #" + id + " - the winner collects the pot.") >= 0 && !btn(h.w, "refund", id), txt(h.w).slice(0, 260));
    H.teardown(h);
  }

  // ═══ D · DISCOVERY from the chain ═══
  console.log("\n── D · local storage cleared → the stakes are still found ──");
  {
    const W = await world();
    const id = await W.openBy(W.A); await W.joinBy(W.B, id);
    const h = await hallFor(W, W.c.player);
    // clear every PLAYER record (pending journals, stored results, anything else) — keep only the harness's own anvil
    //   config overrides (escrow/DYC address, read RPC, server url, the proof bypass), which a real browser never has
    const KEEP = /^dyhall::(stakeEscrowAddress|dycAddress|readRpcUrl|matchServerUrl|devAccess)$/;
    Object.keys(h.w.localStorage).filter((k) => !KEEP.test(k)).forEach((k) => h.w.localStorage.removeItem(k));
    const leftover = Object.keys(h.w.localStorage).filter((k) => !KEEP.test(k));
    await h.w.DYHall._readStakes();
    const rows = h.w.DYHall._stakes().rows || [];
    ok("D1 · with every player record CLEARED from local storage the panel still lists the stake (read from the chain)",
       leftover.length === 0 && rows.some((r) => r.id === String(id) && r.state === 2) && !!btn(h.w, "refund", id), JSON.stringify(rows));
    ok("D2 · …and the match server was never reached (the socket is dead)", h.net.live() === 0);
    H.teardown(h);
  }

  // ═══ G · THE GATE SCREEN ═══
  console.log("\n── G · the non-holder gate screen: the panel and the free road ──");
  {
    const W = await world();
    const nftArt = JSON.parse(fs.readFileSync(path.join(H.OUT, "AccessNFT.sol", "AccessNFT.json"), "utf8"));
    const nft = await (new ethers.ContractFactory(nftArt.abi, nftArt.bytecode.object, W.c.owner)).deploy(await W.c.owner.getAddress(), "ipfs://t/"); await nft.waitForDeployment();
    const id = await W.openBy(W.A);
    const h = await hallFor(W, W.c.player, { realGate: true, accessNFT: await nft.getAddress() });
    await until(() => h.w.document.querySelector(".hall-gate .hall-gate-line"), 15000, "the gate screen");
    ok("G1 · a non-holder's gate screen shows 'Your stakes' — recovering a stake is not playing", txt(h.w).indexOf("Tables against other players need a Torana") === 0 &&
       txt(h.w).indexOf("Your stakes") >= 0 && !!btn(h.w, "cancel", id), txt(h.w).slice(0, 200));
    const link = h.w.document.getElementById("hall-solo");
    // GUEST-PLAY-1 (owner ruling 2026-10-26): solo needs no wallet — the road goes to the GAME in every wallet state
    ok("G2 · and 'Play solo (free) →' (its plain href is the game — GUEST-PLAY-1; it was the rite)", !!link && link.textContent === "Play solo (free) →" && link.getAttribute("href") === "../game/index.html");
    h.w.sessionStorage.setItem("dyw_demo", "1");
    h.w.DYWallet.state.chainOk = true; h.w.DYWallet.state.connected = true;
    const ev = new h.w.MouseEvent("click", { bubbles: true, cancelable: true }); link.dispatchEvent(ev);
    ok("G3 · on Polygon it goes to the game bound to game/STAMP (the link's default stopped, dyw_demo cleared, no pass needed)",
       ev.defaultPrevented && h.w.sessionStorage.getItem("dyw_demo") === null);
    h.w.sessionStorage.clear(); h.w.sessionStorage.setItem("dyw_demo", "1");
    h.w.DYWallet.state.chainOk = false; h.w.DYWallet.state.connected = false;
    const ev2 = new h.w.MouseEvent("click", { bubbles: true, cancelable: true }); link.dispatchEvent(ev2);
    ok("G4 · NOT connected (or another network) it ALSO goes to the game — solo needs no wallet (GUEST-PLAY-1); no pass is set or needed",
       ev2.defaultPrevented && h.w.sessionStorage.getItem("dyw_demo") === null && h.w.sessionStorage.getItem("dyw_pass") === null);
    H.teardown(h);
  }

  // ═══ X · STATIC LAW ═══
  console.log("\n── X · Concede, the limit lines, the stamps ──");
  ok("X1 · Concede is gone from the Hall (the server plays it as a Pass)", !/data-concede|hall-concede|client\.concede\(/.test(HALL));
  ok("X2 · the limit lines follow the ledger (UTC day, net, friend challenges included, past the limit)",
     HALL.indexOf("Staked tables (friend challenges included) close for you whenever a stake would take today's net losses past this limit. Wins earlier in the day count against losses. The day resets at midnight UTC. Free tables stay open. Only you can set or change this.") >= 0 &&
     HALL.indexOf('"This stake would take you past your daily limit - you can still lose " + dycOf(headroomWei) + " DYC today. It resets at midnight UTC."') >= 0);
  ok("X4 · a JOINER is never promised a cancel: the two seat sheets use the joiner's commitment, the two open sheets the opener's",
     (HALL.match(/COMMITMENT_JOIN\(t\.stake\)/g) || []).length === 2 && (HALL.match(/[^_]COMMITMENT\((chosen\.stake|ctx\.stakeWei)\)/g) || []).length === 2 &&
     !/COMMITMENT\(t\.stake\)/.test(HALL));
  const hh = fs.readFileSync(path.join(H.SITE, "mp", "hall.html"), "utf8");
  ok("X3 · stamps: hall.js h38, hall.css h12", /hall\.js\?v=h38"/.test(hh) && /hall\.css\?v=h12"/.test(hh));

  console.log("\n" + (fail ? "✖ " + fail + " FAILED of " + (pass + fail) : "ALL GREEN — " + pass + "/" + pass));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("hallrefund suite crashed:", e); process.exit(1); });
