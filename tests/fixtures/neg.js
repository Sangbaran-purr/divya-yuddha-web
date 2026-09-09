"use strict";
// NEGATIVE CONTROL — the SAME P4a race driven against the PRE-FIX matchclient.js (mpa5, from /tmp/mc.bak).
const path = require("path"); const { ethers } = require("ethers"); const WS = require("ws");
const H = require("../lib.js");
const OLD = require("./matchclient_OLD.js");
(async () => {
  const c = await H.chain(); const s = await H.server(c.escAddr, c.dycAddr);
  global.WebSocket = function (u) { return new WS(u); }; global.WebSocket.prototype = WS.prototype;
  global.window = { ethereum: { async request({ method, params }) {
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [c.player.address];
    if (method === "personal_sign") return c.player.signMessage(ethers.getBytes(params[0]));
    return c.provider.send(method, params || []);
  }, on() {}, removeListener() {} } };
  let me = null;
  const cl = OLD.createClient({ E: {}, W: {}, ethers, log: () => {}, onUpdate: (v) => { if (v && v.me) me = v.me; } });
  cl.connect(s.url);
  cl.authConnected();                    // the exact race
  await H.sleep(6000);
  console.log("  OLD matchclient (mpa5), authConnected before challenge → authed? " + (me ? "YES " + me : "NO — session never authenticated"));
  console.log("  OLD stakedOpen() return value on a dead socket: " + JSON.stringify(cl.stakedOpen({ tier: 10, faction: "devas", escrowMatchId: "1" })));
  console.log("  server saw: " + (s.logLines.length ? s.logLines.join(" | ") : "(no auth ok — the session was never accepted)"));
  process.exit(0);
})().catch(e => { console.log("ERR", e.message); process.exit(1); });
