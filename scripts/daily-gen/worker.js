"use strict";
// MINI-GAMES-1 · DAILY PUZZLE AUTOMATION — one day's search, run in its own process by batch.js (parallel days). It
// receives the day over the IPC channel and sends its pool back the same way: nothing is printed (a run's log is public).
const G = require("./lib.js");
process.on("message", (m) => {
  let msg;
  try { msg = { date: m.slot.date, pool: G.poolFor(m.slot, m.opts) }; }
  catch (e) { msg = { date: m.slot.date, error: String(e && e.message || e) }; }
  process.send(msg, () => process.exit(0));   // exit only once the (possibly large) pool is delivered
});
