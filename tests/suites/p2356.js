"use strict";
const { ethers } = require("ethers"); const H = require("../lib.js");
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "  [" + d + "]" : ""))); };
const RULED = (n) => "Your " + n + " DYC is locked in escrow, but the table has not opened yet.";
const ESC = ["function matches(uint256) view returns (address playerA,address playerB,uint256 stake,uint8 srcA,uint8 srcB,address expectedOpponent,uint64 matchedAt,uint8 state)"];
const ERC = ["function balanceOf(address) view returns (uint256)"];
const SEL = ethers.id("openMatch(uint256,address,uint8)").slice(0, 10);
function armSever(eth, net, label) {
  const raw = eth.request.bind(eth);
  eth.request = async (a) => {
    const r = await raw(a);
    if (a.method === "eth_sendTransaction" && a.params && a.params[0] && String(a.params[0].data || "").startsWith(SEL)) { net.block(); net.sever(); if (label) console.log("  · " + label); }
    return r;
  };
}
const snapLS = (w) => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };
async function openBronze(w) {
  H.click(w, '[data-act="open-sheet"]'); H.click(w, '[data-tier-row="bronze"]');
  H.click(w, '[data-faction="devas"]'); H.click(w, "[data-open-do]");
}

(async () => {
  // ═══ P3 · THE ACK CLEAR (normal open; the record must exist, then clear exactly on {opened}) ═══
  console.log("── P3 · THE ACK CLEAR ──");
  {
    const c = await H.chain(); const s = await H.server(c.escAddr, c.dycAddr);
    const { w } = await H.hall(s.url, c.escAddr, c.dycAddr, c.player, c.provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed+live");
    // sample localStorage continuously so we can SEE the record exist before the ack clears it
    let sawServerStep = false, sawEscrowId = null;
    const sampler = setInterval(() => {
      const r = st().pending.filter((e) => e.rec.kind === "open" && e.rec.step === "server")[0];
      if (r) { sawServerStep = true; sawEscrowId = r.rec.escrowMatchId; }
    }, 5);
    await openBronze(w);
    const tbl = await H.until(() => (st().tables || []).find((t) => t.staked), 30000, "table on server");
    await H.sleep(400); clearInterval(sampler);
    ok("a pending record EXISTED at step:server during the handoff", sawServerStep);
    ok("it carried the escrowMatchId the server received", String(sawEscrowId) === String(tbl.escrowMatchId), sawEscrowId + " vs " + tbl.escrowMatchId);
    ok("after the {opened} ack the record is cleared", st().pending.filter((e) => e.rec.kind === "open").length === 0, JSON.stringify(st().pending));
    ok("the server logged the open", s.logLines.some((l) => l.indexOf("[ws] open") === 0));
    ok("no affordance was ever raised on the happy road", !st().strand);
    s.srv.close();
  }

  // ═══ P2 · THE RELOAD ROAD (resume fires only after auth; the old failure is dead) ═══
  console.log("\n── P2 · THE RELOAD ROAD ──");
  {
    const c = await H.chain(); const s = await H.server(c.escAddr, c.dycAddr);
    const one = await H.hall(s.url, c.escAddr, c.dycAddr, c.player, c.provider, {});
    const st1 = () => one.w.DYHall._state();
    await H.until(() => st1().signedInAs && st1().feedState === "live", 15000, "authed+live");
    armSever(one.eth, one.net, "SOCKET SEVERED at the lock");
    await openBronze(one.w);
    await H.until(() => st1().strand, 30000, "strand");
    const eid = st1().strand.escrowMatchId;
    const carried = snapLS(one.w);                       // what survives a reload
    ok("the record is on disk before the reload", Object.keys(carried).some((k) => k.indexOf("dyhall::pending::") === 0), Object.keys(carried).join(","));
    one.net.block();                                     // the reloaded page must heal on its own
    H.teardown(one);

    // RELOAD: a fresh window carrying the same localStorage
    const two = await H.hall(s.url, c.escAddr, c.dycAddr, c.player, c.provider, { ls: carried });
    const st2 = () => two.w.DYHall._state();
    ok("the reloaded page still holds the record", st2().pending.filter((e) => e.rec.kind === "open").length === 1);
    const tbl = await H.until(() => (st2().tables || []).find((t) => String(t.escrowMatchId) === String(eid)), 40000, "resumed table");
    ok("resume finished the server open after the reload", !!tbl);
    ok("the plaque pins (opener is us)", String(tbl.opener).toLowerCase() === c.player.address.toLowerCase());
    await H.until(() => st2().pending.filter((e) => e.rec.kind === "open").length === 0, 8000, "cleared").catch(() => {});
    ok("the record cleared only after the server acknowledged", st2().pending.filter((e) => e.rec.kind === "open").length === 0);
    // ORDERING: no open may precede an auth in the server's own log — resume never fires into an unauthed socket
    const log = s.logLines.join("\n");
    const firstAuth = s.logLines.findIndex((l) => l.indexOf("[ws] auth ok") === 0);
    const firstOpen = s.logLines.findIndex((l) => l.indexOf("[ws] open") === 0);
    ok("the server saw AUTH before OPEN (resume is auth-driven, not timer-driven)", firstAuth >= 0 && firstOpen > firstAuth, "auth@" + firstAuth + " open@" + firstOpen);
    ok("exactly one table (resume did not double-open)", s.logLines.filter((l) => l.indexOf("[ws] open") === 0).length === 1);
    console.log("    server log:\n" + s.logLines.map((l) => "      " + l).join("\n"));
    s.srv.close();
  }

  // ═══ P5 + P6 · THE OVERWRITE IS DEAD, AND THE CANCEL REFUNDS ═══
  console.log("\n── P5 · TWO ATTEMPTS, TWO RECORDS ──");
  {
    const c = await H.chain(); const s = await H.server(c.escAddr, c.dycAddr);
    const { w, eth, net } = await H.hall(s.url, c.escAddr, c.dycAddr, c.player, c.provider, {});
    const st = () => w.DYHall._state();
    await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed+live");
    armSever(eth, net, "socket severed at lock #1");
    await openBronze(w);
    await H.until(() => st().strand, 30000, "strand #1");
    const eid1 = st().strand.escrowMatchId;
    // second attempt, still offline — the old road would OVERWRITE the first record here
    net.block();
    await openBronze(w);
    await H.until(() => st().pending.filter((e) => e.rec.kind === "open" && e.rec.step === "server").length === 2, 40000, "two settled records");
    const recs = st().pending.filter((e) => e.rec.kind === "open" && e.rec.step === "server");
    ok("BOTH attempts kept their own record (the overwrite is dead)", recs.length === 2, JSON.stringify(recs.map((r) => r.slot)));
    const ids = recs.map((r) => String(r.rec.escrowMatchId)).sort();
    ok("the two records carry DIFFERENT escrow ids", ids.length === 2 && ids[0] !== ids[1], ids.join(","));
    ok("each is keyed by its own tx hash", recs.every((r) => /^0x[0-9a-f]{64}$/i.test(r.slot)));
    const esc = new ethers.Contract(c.escAddr, ESC, c.provider);
    for (const id of ids) { const mm = await esc.matches(BigInt(id)); ok("escrow " + id + " is OPEN and ours", Number(mm.state) === 1 && String(mm.playerA).toLowerCase() === c.player.address.toLowerCase()); }

    console.log("\n── P6 · CANCEL AND REFUND (from the ruled affordance) ──");
    const dyc = new ethers.Contract(c.dycAddr, ERC, c.provider);
    const before = await dyc.balanceOf(c.player.address);
    const strandId = st().strand.escrowMatchId;
    ok("the affordance is showing the ruled line", H.text(w).indexOf(RULED("10")) >= 0);
    const cbtn = w.document.querySelector("[data-strand-cancel]");
    ok("CANCEL AND REFUND is offered", !!cbtn);
    cbtn.click();
    await H.until(async () => Number((await esc.matches(BigInt(strandId))).state) === 4, 40000, "escrow ABORTED");
    const after = await dyc.balanceOf(c.player.address);
    ok("the escrow is ABORTED(4)", Number((await esc.matches(BigInt(strandId))).state) === 4);
    ok("the 10 DYC is back in the wallet", after - before === H.S10, "Δ=" + (after - before).toString());
    await H.sleep(600);
    ok("the cancelled attempt's record is gone", !st().pending.some((e) => String(e.rec.escrowMatchId) === String(strandId)));
    ok("the OTHER attempt's record still stands (it is still locked)", st().pending.some((e) => e.rec.kind === "open" && String(e.rec.escrowMatchId) !== String(strandId)));
    s.srv.close();
  }

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
