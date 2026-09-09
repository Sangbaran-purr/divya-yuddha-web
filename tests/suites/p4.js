"use strict";
// P4 — EITHER ORDERING (B3). Pure matchclient (UMD, no DOM) against the REAL match server.
const path = require("path"); const { ethers } = require("ethers"); const WS = require("ws");
const H = require("../lib.js");
const MC = require(path.join(H.SITE, "mp/matchclient.js"));
let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n)); };

(async () => {
  const c = await H.chain(); const s = await H.server(c.escAddr, c.dycAddr);
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;
  const eth = { async request({ method, params }) {
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [c.player.address];
    if (method === "personal_sign") return c.player.signMessage(ethers.getBytes(params[0]));
    return c.provider.send(method, params || []);
  }, on() {}, removeListener() {} };
  global.window = { ethereum: eth };

  console.log("── P4a · authConnected called BEFORE the challenge (the strand's auth race) ──");
  let me1 = null;
  const c1 = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { if (v && v.me) me1 = v.me; } });
  c1.connect(s.url);
  c1.authConnected();                       // fired IMMEDIATELY — the socket is not open, no challenge yet
  await H.until(() => me1, 12000, "authed after early authConnected").catch(() => {});
  ok("session authenticates even though authConnected preceded the challenge", !!me1);
  ok("it authenticates as the CONNECTED wallet", String(me1).toLowerCase() === c.player.address.toLowerCase());

  console.log("\n── P4b · the natural ordering (challenge first) ──");
  let me2 = null;
  const c2 = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { if (v && v.me) me2 = v.me; } });
  c2.connect(s.url);
  await H.sleep(700);                        // let the challenge land first
  c2.authConnected();
  await H.until(() => me2, 12000, "authed after normal ordering").catch(() => {});
  ok("session authenticates on the natural ordering", !!me2);

  console.log("\n── B1 · send REPORTS delivery ──");
  const c3 = MC.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: () => {} });
  ok("stakedOpen on a socket that was never opened returns FALSE", c3.stakedOpen({ tier: 10, faction: "devas", escrowMatchId: "1", stake: "1" }) === false);
  ok("join on a dead socket returns FALSE", c3.join("x", "devas") === false);
  ok("close on a dead socket returns FALSE", c3.close("x") === false);
  const okSend = c1.stakedOpen({ tier: 10, faction: "devas", escrowMatchId: "999999", stake: H.S10.toString() });
  ok("stakedOpen on the LIVE authed socket returns TRUE", okSend === true);

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  console.log("server log:\n" + s.logLines.map(l => "    " + l).join("\n"));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("HARNESS ERROR:", e.stack); process.exit(1); });
