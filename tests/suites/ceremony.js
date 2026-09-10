"use strict";
// S-HALL-CEREMONY-1 — THE CEREMONY FINISHES ITS OWN STORY. Finding 4 of INCIDENT-2026-09-10 (absorbs CHROME-2).
//
// WHY THE OLD CHECK LIED POLITELY: CHROME-1's only "the sheet closed" assertions live on the FREE road and read
// `st().sheet === null` — the STATE, not the SCREEN. The sheet lives in its own host (#hall-sheet-host) and
// render() deliberately never touches it, so on the STAKED road the state went null while the overlay stood there
// frozen on "confirm in your wallet…". A state-only check cannot see that. This suite looks where the player looks:
// the DOM, and the literal line, on the staked road, at every terminal moment.
//
// P1 lock confirms + ack HELD, P2 plain success, P3 the strand's honest hold, P4 the stall-before-lock face,
// R1 the ack's corrective header read, R2 the bounded approve leg, and the pre-fix bytes reproduced beside.
const path = require("path"), fs = require("fs"), os = require("os");
const { execFileSync } = require("child_process");
const { ethers } = require("ethers");
const H = require("../lib.js");
const DEC = 1000000000000000000n;
const WALLET_LINE = "confirm in your wallet…";
const STRAND_LOCKED = (n) => "Your " + n + " DYC is locked in escrow, but the table has not opened yet.";

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const overlay = (w) => w.document.getElementById("hall-sheet-overlay");
const body = (w) => (w.document.body.textContent || "").replace(/\s+/g, " ").trim();
const wallet = (w) => body(w).indexOf(WALLET_LINE) >= 0;
const openStaked = (w) => { H.click(w, '[data-act="open-sheet"]'); H.click(w, '[data-tier-row="bronze"]'); H.click(w, '[data-faction="devas"]'); };

// hold the {open} frame on the wire: the socket CARRIES it as far as the client can tell (send returns true, so
// `delivered` is true and the ack watch arms), but the server never hears it until we release. This is the
// "carried, no ack" road — the one the plain stall and the strand both pass through.
function holdOpenFrame(sock) {
  const real = sock.send.bind(sock);
  const held = [];
  sock.send = function (d) {
    let m = null; try { m = JSON.parse(String(d)); } catch (e) {}
    if (m && m.type === "open") { held.push(d); return true; }   // swallowed, but reported delivered
    return real(d);
  };
  return { release() { sock.send = real; held.forEach((d) => real(d)); held.length = 0; }, count: () => held.length };
}

async function main() {
  const c = await H.chain();
  // Each block gets its OWN server: the lobby keeps one table per address, and a block that deliberately abandons a
  // ceremony mid-flight would otherwise poison the next block's open. The chain is shared (escrow ids just advance).
  const servers = [];
  const boot = async () => { const b = await H.server(c.escAddr, c.dycAddr); servers.push(b); return b; };
  const esc = new ethers.Contract(c.escAddr, ["function matches(uint256) view returns (address playerA,address playerB,uint256 stake,uint8 srcA,uint8 srcB,address expectedOpponent,uint64 matchedAt,uint8 state)"], c.provider);
  const dyc = new ethers.Contract(c.dycAddr, ["function mint(address,uint256)", "function balanceOf(address) view returns (uint256)"], new ethers.NonceManager(new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", c.provider)));

  // ═══ P2 · the plain success path, at the DOM ═══
  console.log("\n── P2 · plain success: the sheet does not outlive its truth ──");
  {
    const h = await H.hall((await boot()).url, c.escAddr, c.dycAddr, c.player, c.provider, {});
    const w = h.w, st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed+live");
    openStaked(w);
    ok("P2a · the sheet overlay is up before the act", !!overlay(w) && !!st().sheet);
    H.click(w, "[data-open-do]");
    await H.until(() => st().sheet === null, 40000, "state.sheet null (all the old check ever asserted)");
    ok("P2b · SUCCESS → the OVERLAY is gone from the DOM (not merely the state)", overlay(w) === null);
    ok("P2c · …and the wallet line is nowhere on the screen", !wallet(w), body(w).slice(0, 160));
    ok("P2d · the old state-only assertion still holds — it simply never proved P2b/P2c", st().sheet === null);
    await H.until(() => (st().tables || []).length > 0, 20000, "our table on the floor");
    ok("P2e · the floor is live: the plaque stands", (st().tables || []).length > 0);
    H.teardown(h);
  }

  // ═══ P1 · the owner's 11:09: the lock confirms, delivery is held ═══
  console.log("\n── P1 · lock confirmed, ack HELD ──");
  {
    const h = await H.hall((await boot()).url, c.escAddr, c.dycAddr, c.player, c.provider, {});
    const w = h.w, st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed+live");
    const before = BigInt(st().liquid);
    const hold = holdOpenFrame(h.sockets[h.sockets.length - 1]);
    openStaked(w);
    H.click(w, "[data-open-do]");
    await H.until(() => hold.count() > 0, 40000, "the {open} frame reaching the wire (held)");
    await H.until(() => st().ceremony === null, 20000, "the wallet beats ending");

    const rec = (st().pending || []).filter((e) => e.rec && e.rec.kind === "open" && e.rec.escrowMatchId)[0];
    const m = await esc.matches(BigInt(rec.rec.escrowMatchId));
    ok("P1a · the LOCK is confirmed on chain while the server has not been told",
       Number(m.state) === 1 && BigInt(m.stake) === 10n * DEC,
       "escrow state=" + Number(m.state) + " (1=OPEN) stake=" + m.stake);
    ok("P1b · the wallet beats ENDED though delivery is unresolved", st().ceremony === null);
    await H.until(() => BigInt(st().liquid) < before, 15000, "the header re-read at lock-confirm");
    const afterLock = BigInt(st().liquid);
    ok("P1c · the header re-read FIRED at lock-confirm — the stake left the wallet", afterLock === before - 10n * DEC,
       before + " -> " + afterLock);
    ok("P1d · the face is NOT the wallet line", !wallet(w), body(w).slice(0, 200));

    // the honest face for THIS state is the 8d family — reached when the ack never comes (ACK_WAIT_MS)
    await H.until(() => st().strand, 15000, "the ack watch raising the affordance");
    const card = w.document.querySelector(".hall-strand-line");
    ok("P1e · the honest face for a held delivery is the 8d card, not an invented one",
       !!card && card.textContent.replace(/\s+/g, " ").trim() === STRAND_LOCKED("10") &&
       !!w.document.querySelector("[data-strand-finish]") && !!w.document.querySelector("[data-strand-cancel]"),
       card ? card.textContent.replace(/\s+/g, " ").trim() : "(no card)");

    // R1 — the ack is a LATER, SETTLED moment: it reads the header again and corrects a number the one-shot missed
    await (await dyc.mint(c.player.address, 100n * DEC)).wait();
    hold.release();
    await H.until(() => BigInt(st().liquid) === afterLock + 100n * DEC, 20000, "the ack's corrective header read");
    ok("R1 · the ack fires a SECOND header read — a number the lock-confirm read raced is corrected",
       BigInt(st().liquid) === afterLock + 100n * DEC, afterLock + " -> " + st().liquid);
    await H.until(() => st().sheet === null, 20000, "the sheet closing on the ack");
    ok("P1f · the ack lands → the OVERLAY is gone", overlay(w) === null && !wallet(w));
    await H.until(() => (st().tables || []).length > 0, 20000, "the plaque");
    ok("P1g · …and the plaque stands", (st().tables || []).length > 0);
    H.teardown(h);
  }

  // ═══ P3 · the strand's honest hold, untouched ═══
  console.log("\n── P3 · the strand's honest hold ──");
  {
    const h = await H.hall((await boot()).url, c.escAddr, c.dycAddr, c.player, c.provider, {});
    const w = h.w, st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed+live");
    const SEL = ethers.id("openMatch(uint256,address,uint8)").slice(0, 10);
    const raw = h.eth.request.bind(h.eth);
    h.eth.request = async (a) => { const r = await raw(a); if (a.method === "eth_sendTransaction" && String((a.params[0] || {}).data || "").startsWith(SEL)) { h.net.block(); h.net.sever(); } return r; };
    openStaked(w); H.click(w, "[data-open-do]");
    await H.until(() => st().strand && w.document.querySelector(".hall-strand-line"), 40000, "the affordance");
    const card = w.document.querySelector(".hall-strand-line").textContent.replace(/\s+/g, " ").trim();
    ok("P3a · a severed socket still raises the ruled 8d card with both acts",
       card === STRAND_LOCKED("10") && !!w.document.querySelector("[data-strand-finish]") && !!w.document.querySelector("[data-strand-cancel]"), card);
    ok("P3b · and no stale wallet line stands behind it — the one-tick overlay is repainted at the terminus", !wallet(w), body(w).slice(0, 200));
    H.teardown(h);
  }

  // ═══ R2 · the approve leg is bounded (source pin — the 60s bound cannot be waited out in a suite) ═══
  console.log("\n── R2 · the last road to a frozen ceremony ──");
  {
    const src = fs.readFileSync(path.join(H.SITE, "mp/hall.js"), "utf8");
    const fn = src.slice(src.indexOf("function ensureAllowance("), src.indexOf("var OPEN_WAIT_MS"));
    ok("R2 · the approve leg waits BOUNDED, like the lock", fn.indexOf("waitBounded(r, tx)") >= 0 && fn.indexOf("return tx.wait()") < 0,
       fn.split("\n").filter((l) => l.indexOf("waitBounded") >= 0 || l.indexOf("tx.wait()") >= 0).join(" | ").trim());
  }

  // ═══ THE REPRODUCTION: the pre-fix bytes, same flow ═══
  console.log("\n── the pre-fix bytes, driven beside ──");
  {
    const pre = path.join(os.tmpdir(), "dy_ceremony_prefix_" + process.pid, "mp");
    fs.mkdirSync(pre, { recursive: true });
    // A pre-fix pin names a COMMIT, never a moving ref: `HEAD:` would contain this very fix the moment it lands
    //   (the lesson slipscope taught by going red). dca23ab is the last commit before S-HALL-CEREMONY-1.
    const PRE_FIX_REF = "dca23ab";
    const preHall = execFileSync("git", ["show", PRE_FIX_REF + ":mp/hall.js"], { cwd: H.SITE, maxBuffer: 8 << 20 }).toString();
    if (preHall.indexOf("function closeSheet()") >= 0) {
      console.log("  ✖ the pre-fix pin " + PRE_FIX_REF + " already CONTAINS the fix — the reproduction would pass emptily"); process.exit(1);
    }
    fs.writeFileSync(path.join(pre, "hall.js"), preHall);
    fs.writeFileSync(path.join(pre, "matchclient.js"), fs.readFileSync(path.join(H.SITE, "mp/matchclient.js")));
    const h = await H.hall((await boot()).url, c.escAddr, c.dycAddr, c.player, c.provider, { srcDir: path.dirname(pre) });
    const w = h.w, st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "pre-fix hall authed");
    openStaked(w); H.click(w, "[data-open-do]");
    await H.until(() => st().sheet === null, 40000, "state.sheet null");
    await H.sleep(2500);
    ok("PRE-FIX bytes, plain SUCCESS: the overlay SURVIVES and still says the wallet line — the incident, reproduced",
       overlay(w) !== null && wallet(w),
       "overlay=" + (overlay(w) !== null) + " walletLine=" + wallet(w));
    H.teardown(h);
  }

  // ═══ P4 · the stall-before-lock face ═══
  console.log("\n── P4 · the face before the lock: nothing charged, nothing claimed ──");
  {
    const h = await H.hall((await boot()).url, c.escAddr, c.dycAddr, c.player, c.provider, {});
    const w = h.w, st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed+live");
    const before = st().liquid;
    openStaked(w);
    H.click(w, "[data-open-do]");                              // renderSheet() runs synchronously on the approve beat
    const face = w.document.querySelector(".hall-ceremony-wait");
    ok("P4a · the face at the approve beat is exactly the ruled wallet line",
       !!face && face.textContent.trim() === WALLET_LINE, face ? JSON.stringify(face.textContent.trim()) : "(no face)");
    const draft = (st().pending || []).filter((e) => e.rec && e.rec.kind === "open")[0];
    ok("P4b · nothing charged, nothing claimed: the record sits at `approve` with no lock tx, and the header has not moved",
       !!draft && draft.rec.step === "approve" && !draft.rec.openTxHash && st().liquid === before,
       "step=" + (draft && draft.rec.step) + " openTxHash=" + (draft && draft.rec.openTxHash) + " liquid " + before + " -> " + st().liquid);
    H.teardown(h);
  }

  servers.forEach((b) => { try { b.srv.close(); } catch (e) {} });
  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
