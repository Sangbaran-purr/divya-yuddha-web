"use strict";
// LIMIT-DISPLAY-1 — the daily limit reaches the screen after a reload, however long the sign-in takes.
//
// The REAL Hall (jsdom) against a REAL hub whose loss ledger is a file under a data folder holding a 500 DYC cap —
// the owner's live /var/data/lossledger.json, same shape. The sign-in is SLOWED on purpose (the server's Torana read
// is a stub that answers after 900 ms, then 3 s): the old 600 ms timer request lost exactly this race.
const fs = require("fs");
const os = require("os");
const path = require("path");
const H = require("../lib");

const MS = H.MS;
const { makeServer } = require(path.join(MS, "src/server"));
const { makeHub } = require(path.join(MS, "src/wshub"));
const { makeLobby } = require(path.join(MS, "src/lobby"));
const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
const { createRoom } = require(path.join(MS, "src/match"));
const { makeLossLedger } = require(path.join(MS, "src/lossledger"));
const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
const rng = require(path.join(MS, "src/rng"));

const DEC = 10n ** 18n;
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } }
const HEADER = "today: 500 of 500 DYC left before your limit";

async function hub(c, signInMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dy-limit-"));
  fs.writeFileSync(path.join(dir, "lossledger.json"), JSON.stringify({ caps: { [c.player.address.toLowerCase()]: (500n * DEC).toString() }, pnl: {} }));
  const ledger = makeLossLedger({ file: path.join(dir, "lossledger.json") });
  const reads = { status: 0 };
  const gs = ledger.getStatus; ledger.getStatus = function (a) { reads.status++; return gs(a); };
  const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: false, NONCE_TTL_MS: 300000, TIERS: [0, 10, 50, 200, 1000],
    TIER_STAKES: { 10: 10n * DEC, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC }, STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC };
  const logs = [];
  const srv = makeServer(cfg);
  makeHub(srv, cfg, makeLobby(cfg.TIERS), (m) => logs.push(String(m)), { E: loadGuardedEngine().engine, rng, createRoom,
    store: makeMatchStore({ file: path.join(dir, "m.jsonl") }), lossLedger: ledger,
    access: { check: () => new Promise((r) => setTimeout(() => r({ ok: true, holder: true }), signInMs)) } });   // the slow sign-in
  await new Promise((r) => srv.listen(0, r));
  return { srv, url: "ws://127.0.0.1:" + srv.address().port, reads, logs, dir };
}
// the Hall, with every frame it RECEIVES recorded (so an early "not authed" refusal is visible)
async function hall(c, B) {
  const h = await H.hall(B.url, c.escAddr, c.dycAddr, c.player, c.provider, {});
  h.got = [];
  const hook = () => h.sockets.forEach((s) => { if (!s.__hooked) { s.__hooked = true; s.on("message", (d) => { try { h.got.push(JSON.parse(String(d))); } catch (e) {} }); } });
  hook(); h.hookIv = setInterval(hook, 20);
  return h;
}
const header = (w) => (w.document.querySelector(".hall-limit-set") || {}).textContent || "";

async function run() {
  console.log("\n── L · a slow sign-in still paints the stored limit ──");
  const c = await H.chain();
  for (const ms of [900, 3000]) {
    const B = await hub(c, ms);
    const h = await hall(c, B);
    await H.until(() => header(h.w).indexOf("left before your limit") >= 0, ms + 12000, "the limit header").catch(() => null);
    const sent = h.net.sent().map((f) => f.type);
    const notAuthed = h.got.filter((m) => m.type === "error" && /not authed/.test(m.error || ""));
    ok("L" + (ms === 900 ? "1" : "2") + " · sign-in taking " + ms + " ms → the header reads '" + HEADER + "'", header(h.w) === HEADER, header(h.w) || "(empty)");
    ok("L" + (ms === 900 ? "3" : "4") + " · …and get-loss-limit went out only AFTER sign-in (no 'not authed' reply, one read, after 'auth')",
       notAuthed.length === 0 && B.reads.status >= 1 && sent.indexOf("get-loss-limit") > sent.indexOf("auth") && sent.filter((t) => t === "get-loss-limit").length === 1,
       JSON.stringify({ sent, notAuthed: notAuthed.length, reads: B.reads.status }));
    clearInterval(h.hookIv); H.teardown(h); B.srv.close();
  }

  console.log("\n── P · after a reload the over-limit pre-check blocks BEFORE any wallet prompt ──");
  {
    const B = await hub(c, 900);
    const h = await hall(c, B);
    await H.until(() => header(h.w).indexOf("left before your limit") >= 0, 15000, "the limit").catch(() => null);
    await H.until(() => h.w.DYHall._state().liquid != null, 10000, "the balance").catch(() => null);
    h.w.DYHall._state();
    const calls0 = h.eth.__calls.length;
    H.click(h.w, '[data-act="open-sheet"]');
    await H.sleep(150);
    const fac = h.w.document.querySelector("[data-faction]"); if (fac) fac.click();
    await H.sleep(100);
    const row = [...h.w.document.querySelectorAll("[data-tier-row]")].find((r) => /DIAMOND/.test(r.textContent));
    if (row) row.click();
    await H.sleep(200);
    const sheet = (h.w.document.getElementById("hall-sheet-host") || {}).textContent || "";
    const act = [...h.w.document.querySelectorAll("#hall-sheet-host button")].find((b) => /OPEN TABLE/.test(b.textContent));
    if (act && !act.disabled) act.click();
    await H.sleep(300);
    const walletCalls = h.eth.__calls.slice(calls0).filter((m) => /send|sign|approve/i.test(m));
    ok("P1 · a 1,000 DYC table with 500 left: the limit block shows and OPEN TABLE is disabled",
       /This stake would take you past your daily limit - you can still lose 500 DYC today\. It resets at midnight UTC\./.test(sheet) && !!act && act.disabled,
       sheet.replace(/\s+/g, " ").slice(0, 300));
    ok("P2 · …so the wallet is never prompted (no send, no signature)", walletCalls.length === 0, walletCalls.join(","));
    clearInterval(h.hookIv); H.teardown(h); B.srv.close();
  }

  console.log("\n── S · the source ──");
  const HALL = fs.readFileSync(path.join(H.SITE, "mp", "hall.js"), "utf8");
  ok("S1 · no timer asks for the limit any more (the request rides the authed step only)",
     !/getLossLimit\(\); \} catch \(e\) \{\} \}, \d+\)/.test(HALL) && (HALL.match(/client\.getLossLimit\(\)/g) || []).length === 1 &&
     /resumedGen = gen; signedInAs = signedInAs \|\| v\.me;\s*try \{ if \(client\.getLossLimit\) client\.getLossLimit\(\); \} catch \(e\) \{\}/.test(HALL));
  ok("S2 · hall.js is stamped h38", /hall\.js\?v=h38"/.test(fs.readFileSync(path.join(H.SITE, "mp", "hall.html"), "utf8")));

  console.log("\n" + (fail ? "✖ " + fail + " FAILED of " + (pass + fail) : "ALL GREEN — " + pass + "/" + pass));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("halllimit suite crashed:", e); process.exit(1); });
