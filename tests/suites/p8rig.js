"use strict";
// P8 — THE FROZEN RIG. wire.html is byte-identical and pinned at ?v=mpa3, but it loads the SAME matchclient.js
// file this task edited. So the B1/B3 edits must be invisible to the rig's authWallet (random session wallet) road.
const path = require("path"); const { ethers } = require("ethers"); const WS = require("ws");
const H = require("../lib.js");
const MC = require(path.join(H.SITE, "mp/matchclient.js"));
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? " [" + d + "]" : ""))); };

(async () => {
  const c = await H.chain(); const s = await H.server(c.escAddr, c.dycAddr);
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;

  // the rig's road, exactly: createClient → connect → authWallet() (a RANDOM throwaway wallet, no browser wallet)
  let meA = null, tablesA = null;
  const A = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { if (v) { if (v.me) meA = v.me; if (v.tables) tablesA = v.tables; } } });
  A.connect(s.url);
  await H.until(() => A.isDevMode() !== undefined && meA === null, 3000).catch(() => {});
  await H.sleep(800);                       // the rig calls authWallet from a button, i.e. after the challenge
  A.authWallet();
  await H.until(() => meA, 15000, "rig authed");
  ok("the rig still authenticates on the authWallet (random) road", !!meA);
  ok("it is NOT the browser wallet — a throwaway session address", String(meA).toLowerCase() !== c.player.address.toLowerCase());
  ok("the server accepted it", s.logLines.some((l) => l.indexOf("[ws] auth ok") === 0 && l.toLowerCase().indexOf(String(meA).toLowerCase()) > 0));

  // the rig opens a FREE table and a second rig client joins → a match starts (the rig's whole reason to exist)
  let meB = null, matchB = null;
  const B = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: () => {} });
  const rawHandleB = [];
  B.connect(s.url); await H.sleep(800); B.authWallet();
  await H.until(() => { try { return B.view().me; } catch (e) { return null; } }, 15000, "rig B authed");
  meB = B.view().me;
  ok("a second rig client authenticates independently", !!meB && meB !== meA);

  const opened = A.open(50, "devas");        // B1 additive: the rig ignores the return; it must still WORK
  ok("open() still sends on the rig road (and now reports true)", opened === true);
  await H.until(() => (tablesA || []).length === 1, 15000, "table listed");
  ok("the rig's table is listed by the server", (tablesA || []).length === 1 && String(tablesA[0].opener).toLowerCase() === String(meA).toLowerCase());
  ok("the server logged a FREE open (rig road unchanged)", s.logLines.some((l) => l.indexOf("[ws] open") === 0 && l.indexOf("(free)") > 0));

  console.log("\nserver log:\n" + s.logLines.map((l) => "    " + l).join("\n"));
  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
