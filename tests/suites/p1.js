"use strict";
// P1 — THE STRAND, REPLAYED AND HEALED. The real hall.js opens a Bronze table with the socket SEVERED at the
// moment the lock is broadcast, so serverOpen meets a dead socket — the 2026-09-08 shape exactly.
const { ethers } = require("ethers"); const H = require("../lib.js");
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "  [" + d + "]" : ""))); };
const RULED = (n) => "Your " + n + " DYC is locked in escrow, but the table has not opened yet.";

(async () => {
  const c = await H.chain(); const s = await H.server(c.escAddr, c.dycAddr);
  const { w, eth, net } = await H.hall(s.url, c.escAddr, c.dycAddr, c.player, c.provider, {});
  const st = () => w.DYHall._state();
  await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed + live");
  console.log("  · booted, authed as " + st().signedInAs + ", feed " + st().feedState);

  // SEVER at the lock: the instant openMatch is broadcast, the socket dies (and stays dead).
  const SEL = ethers.id("openMatch(uint256,address,uint8)").slice(0, 10);
  const raw = eth.request.bind(eth);
  eth.request = async (a) => {
    const r = await raw(a);
    if (a.method === "eth_sendTransaction" && a.params && a.params[0] && String(a.params[0].data || "").startsWith(SEL)) {
      net.block(); net.sever(); console.log("  · SOCKET SEVERED at the lock (tx " + String(r).slice(0, 12) + "…)");
    }
    return r;
  };

  console.log("\n── the ceremony, socket dying mid-flight ──");
  H.click(w, '[data-act="open-sheet"]');
  H.click(w, '[data-tier-row="bronze"]');
  H.click(w, '[data-faction="devas"]');
  H.click(w, "[data-open-do]");

  await H.until(() => st().strand, 30000, "the ruled affordance");
  const strand = st().strand;
  console.log("  · strand raised: escrowMatchId=" + strand.escrowMatchId + " stake=" + strand.stake);

  console.log("\n── B1/B2 · the record SURVIVES a send the socket did not carry ──");
  const recs = st().pending.filter((e) => e.rec.kind === "open");
  ok("a pending record survives (the old road cleared it here)", recs.length === 1, JSON.stringify(st().pending));
  ok("it is keyed by the openMatch tx hash", /^0x[0-9a-f]{64}$/i.test(recs[0].slot), recs[0].slot);
  ok("it carries the escrowMatchId", String(recs[0].rec.escrowMatchId) === String(strand.escrowMatchId));
  ok("it is parked at step:server (awaiting the ack)", recs[0].rec.step === "server");
  ok("the server has NO table (the send was never carried)", !s.logLines.some((l) => l.indexOf("[ws] open") === 0));

  console.log("\n── the chain agrees the stake is locked ──");
  const ESC = ["function matches(uint256) view returns (address playerA,address playerB,uint256 stake,uint8 srcA,uint8 srcB,address expectedOpponent,uint64 matchedAt,uint8 state)"];
  const mm = await new ethers.Contract(c.escAddr, ESC, c.provider).matches(BigInt(strand.escrowMatchId));
  ok("escrow state is OPEN(1)", Number(mm.state) === 1, "state=" + mm.state);
  ok("playerA is the connected wallet", String(mm.playerA).toLowerCase() === c.player.address.toLowerCase());
  ok("stake is 10 DYC", mm.stake === H.S10, String(mm.stake));

  console.log("\n── B4 · the ruled affordance renders ──");
  const body = H.text(w);
  ok("the 8d line renders VERBATIM", body.indexOf(RULED("10")) >= 0, body.slice(0, 200));
  ok("FINISH OPENING is offered", !!w.document.querySelector("[data-strand-finish]"));
  ok("CANCEL AND REFUND is offered", !!w.document.querySelector("[data-strand-cancel]"));

  console.log("\n── FINISH OPENING while the socket is STILL dead → honest failure, record kept ──");
  H.click(w, "[data-strand-finish]");
  await H.sleep(1200);
  ok("still stranded (no false success)", !!st().strand);
  ok("record still intact", st().pending.filter((e) => e.rec.kind === "open").length === 1);

  console.log("\n── heal the socket, then FINISH OPENING ──");
  net.allow();
  // S-HALL-CHROME-1 (M4) — the Hall no longer reconnects by itself (that auto-reconnect was what poked the wallet
  // in an idle tab). The road back is the RECONNECT card's click, so the strand proof now does what a user does.
  await H.until(() => w.document.querySelector("[data-reconnect]"), 20000, "the reconnect card");
  w.document.querySelector("[data-reconnect]").click();
  await H.until(() => st().feedState === "live" && st().signedInAs, 30000, "feed healed");
  console.log("  · feed healed");
  const btn = w.document.querySelector("[data-strand-finish]");
  if (btn) btn.click(); else console.log("  · (already completed by the authed-resume road before the click)");
  const tbl = await H.until(() => (st().tables || []).find((t) => String(t.escrowMatchId) === String(strand.escrowMatchId)), 30000, "our table on the server");
  console.log("  · table on the server: id=" + tbl.id + " tier=" + tbl.tier + " staked=" + tbl.staked);

  ok("the server now has OUR table (escrowMatchId matches)", !!tbl);
  ok("the opener is us — the plaque pins", String(tbl.opener).toLowerCase() === c.player.address.toLowerCase());
  await H.until(() => st().pending.filter((e) => e.rec.kind === "open").length === 0, 8000, "record cleared on the ack").catch(() => {});
  ok("the record is cleared — ONLY now, on the server's acknowledgement", st().pending.filter((e) => e.rec.kind === "open").length === 0, JSON.stringify(st().pending));
  ok("the affordance is gone", !st().strand);
  ok("exactly ONE table was opened (no double-open)", s.logLines.filter((l) => l.indexOf("[ws] open") === 0).length === 1);

  console.log("\nserver log:\n" + s.logLines.map((l) => "    " + l).join("\n"));
  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
