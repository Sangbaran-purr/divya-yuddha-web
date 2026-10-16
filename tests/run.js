#!/usr/bin/env node
"use strict";
// S-HALL-SUITE-1 — THE RUNNER. One command runs every suite and exits non-zero on any red.
//
//   node tests/run.js                 run everything
//   node tests/run.js account chrome  run named suites
//   node tests/run.js --allow-skip    downgrade a missing dependency to a loud SKIP (never the default)
//
// Each suite gets its OWN anvil on its own port (R1: independence, ~110ms each — measured, not assumed). The
// runner holds no timers of its own and calls no process.exit on the happy road: it must drain and exit by itself,
// the KEEPALIVE-1 no-leak law applied to the guard (see tests/README.md).
const { spawn, spawnSync } = require("child_process");
const path = require("path"), fs = require("fs"), net = require("net");
const H = require("./lib.js");

const ARGS = process.argv.slice(2);
const ALLOW_SKIP = ARGS.indexOf("--allow-skip") >= 0 || process.env.DY_ALLOW_SKIP === "1";
const PICK = ARGS.filter(function (a) { return a.indexOf("--") !== 0; });

// name → file. copyproof is already committed under mp/ and needs no chain; it runs first and fastest.
const SUITES = [
  { name: "copyproof",     file: path.join(H.SITE, "mp", "copyproof.js"), chain: false, expect: 401 },
  { name: "p4",            file: path.join(__dirname, "suites", "p4.js"), chain: true, expect: 7 },
  { name: "p8rig",         file: path.join(__dirname, "suites", "p8rig.js"), chain: true, expect: 7 },
  { name: "p7dom",         file: path.join(__dirname, "suites", "p7dom.js"), chain: true, expect: 4 },
  { name: "p1",            file: path.join(__dirname, "suites", "p1.js"), chain: true, expect: 18 },
  { name: "p2356",         file: path.join(__dirname, "suites", "p2356.js"), chain: true, expect: 23 },
  { name: "friendlookup",  file: path.join(__dirname, "suites", "friendlookup.js"), chain: true, expect: 21 },
  { name: "chrome",        file: path.join(__dirname, "suites", "chrome.js"), chain: true, expect: 32 },
  { name: "account",       file: path.join(__dirname, "suites", "account.js"), chain: true, expect: 43 },
  { name: "slipscope",     file: path.join(__dirname, "suites", "slipscope.js"), chain: true, expect: 34 },
  { name: "ceremony",      file: path.join(__dirname, "suites", "ceremony.js"), chain: true, expect: 19 },
  { name: "takeover",      file: path.join(__dirname, "suites", "takeover.js"), chain: true, expect: 25 },
  { name: "freedoor",      file: path.join(__dirname, "suites", "freedoor.js"), chain: true, expect: 57 },
  // GATE-FIX-1: the owner console's archive road. No chain and no network — the public RPCs' 2026-09-23 wire
  // shapes are FIXTURES (docs/ARCHIVE_ROAD_2026-09-23.md); a suite that dials out measures the weather.
  { name: "consoleroad",   file: path.join(__dirname, "suites", "consoleroad.js"), chain: false, expect: 102 },
  { name: "stakedframe",   file: path.join(__dirname, "suites", "stakedframe.js"), chain: true, expect: 29 },
  { name: "bundle",        file: path.join(__dirname, "suites", "bundle.js"), chain: true, expect: 95 },
  { name: "winnings",      file: path.join(__dirname, "suites", "winnings.js"), chain: true, expect: 41 },
  // AFFILIATE-1 rung 3 — Torana Invites (store + dashboard) and the ONE Withdraw card, against the REAL desk with
  // coupons signed by the bot's own signer and every invite signature checked by the bot's own verifier.
  { name: "invites",       file: path.join(__dirname, "suites", "invites.js"), chain: true, expect: 117, capMs: 600000 },
  // FEE-1 — the one player fee rule: the 7 measured mainnet blocks, the floor, read failure, the anvil compounding
  // control, real sends on two pages, and every write road reaching the one function.
  { name: "fees",          file: path.join(__dirname, "suites", "fees.js"), chain: true, expect: 26, capMs: 600000 },
  { name: "storeread",     file: path.join(__dirname, "suites", "storeread.js"), chain: true, expect: 44 },
  // STORE-READ-2 — the pre-cast read (the BUY road, not the read road: real buys, so its own anvil and its own cap)
  { name: "precast",       file: path.join(__dirname, "suites", "precast.js"), chain: true, expect: 31 },
  // FREE-PLAY-1 rung 2 — solo is free (the rite's Enter for any wallet on Polygon); the Torana opens the Hall
  { name: "freeplay",      file: path.join(__dirname, "suites", "freeplay.js"), chain: true, expect: 37 },
  // SITE-AUDIT-1 batch 1 — Explore's names, the Mint's live sale status + phone layout, the game copy's Store relink,
  // /mp/, the friend-stake parse, and the corrected copy (no chain)
  // SITE-AUDIT-1 batch 2 — "Your stakes": cancel / refund / collect against the REAL StakeEscrow, socket blocked
  { name: "hallrefund",    file: path.join(__dirname, "suites", "hallrefund.js"), chain: true, expect: 26, capMs: 600000 },
  // LIMIT-DISPLAY-1 — the stored daily limit reaches the screen after a reload, however slow the sign-in
  { name: "readproxy",     file: path.join(__dirname, "suites", "readproxy.js"), chain: true, expect: 17 },
  // CARD-STORE-1 C3 — the USD card button against the REAL WaveCardUsdSale (tokens planted at their Polygon addresses)
  { name: "cardusd",       file: path.join(__dirname, "suites", "cardusd.js"), chain: true, expect: 54, capMs: 600000 },
  // MY-INVITES-1 — the affiliate's own page against the REAL bot over a REAL chain (a 7-deep tree, both schemes)
  { name: "myinvites",     file: path.join(__dirname, "suites", "myinvites.js"), chain: true, expect: 58, capMs: 900000 },
  { name: "halllimit",     file: path.join(__dirname, "suites", "halllimit.js"), chain: true, expect: 8 },
  { name: "siteaudit",     file: path.join(__dirname, "suites", "siteaudit.js"), chain: false, expect: 34 },
  { name: "gamelog",       file: path.join(__dirname, "suites", "gamelog.js"), chain: false, expect: 12 },   // SYNC-NARRATOR-1: the battle log through the synced game copy (no chain)
  // MP-FIX-2: the Hall steps back while a match is live — the frame's bands, the collapse, and the lobby's safety
  // (source + mutants; no chain and no network — the pixels are proven in a browser and written into the rung).
  { name: "hallframe",     file: path.join(__dirname, "suites", "hallframe.js"), chain: false, expect: 32 },
  // MP-FIX-3A: the Hall's stake refusals — one sentence per truth, an unread balance that says so, the chain guard,
  // the read failover and the pre-flight line (source + real ethers decode + mutants; no chain, no network).
  { name: "hallstake",     file: path.join(__dirname, "suites", "hallstake.js"), chain: false, expect: 34 },
  // MINI-GAMES-1 R1: the Daily Puzzle — 14 puzzles, each solved to EXACTLY ONE winning play by the offline solver over the
  // site's copy of the real engine; the solver's refusals (two wins, none, malformed, unknown card, luck) and mutants.
  { name: "puzzles",       file: path.join(__dirname, "suites", "puzzles.js"), chain: false, expect: 48 },
  // MINI-GAMES-1 R2: the Daily Puzzle PAGE — the real page in jsdom (controlled clock and store): UTC dates incl. +5:30
  // and -8, win / wrong / draw / reveal / missed day, storage blocked, no future puzzle, in-page solver = offline solver,
  // no plain answer or explanation in any served file.
  { name: "daily",         file: path.join(__dirname, "suites", "daily.js"), chain: false, expect: 78 },   // Daily Puzzle Effects R2: +19 (the battle frame)
  // MINI-GAMES-2: SMRITI, the memory game — R1 rules (deal, animated-pair rule, tries, best, storage), R2 the animation player
  // (the game's manifest reader and Meghnad's pack pinned byte-for-byte; 256 px only; load/release), R3 the page (the board
  // waits on every Hero/Meghnad turn; reduced motion skips; layouts); every owner-named breakage applied and caught.
  { name: "smriti",        file: path.join(__dirname, "suites", "smriti.js"), chain: false, expect: 80 },
  // MINI-GAMES-1 · DAILY PUZZLE AUTOMATION R1: the generator (scripts/daily-gen) and the batch it wrote — exactly one winner
  // on 8 seeds, explanations from the engine with a named cause per change and arithmetic read back from the words, the
  // content rules, no near-duplicates, launch cards only, no answer in a run's log; five owner-named breakages, each caught.
  { name: "dailygen",      file: path.join(__dirname, "suites", "dailygen.js"), chain: false, expect: 26 },
];

function freePort() {
  return new Promise(function (res, rej) {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", function () { const p = s.address().port; s.close(function () { res(p); }); });
    s.on("error", rej);
  });
}
function waitFor(fn, ms) {
  return new Promise(function (res, rej) {
    const t0 = Date.now();
    (function tick() {
      if (fn()) return res(true);
      if (Date.now() - t0 > ms) return rej(new Error("timeout"));
      setTimeout(tick, 40);
    })();
  });
}
function anvilUp(port) {
  const r = spawnSync("cast", ["block-number", "--rpc-url", "http://127.0.0.1:" + port], { stdio: "ignore" });
  return r.status === 0;
}
// S-HALL-STAKED-1 (R6) — THE WATCHDOG LAW, AT THE RUNNER. A suite's own waits are bounded (tests/lib.js until()
//   carries a budget and names what it awaited), but bounded waits CHAIN: a condition that can never become true —
//   S-HALL-STAKED-1 waited on state.matchView.outcome, a field _state() does not publish (its matchView is a five-key
//   summary) — burns every budget in turn and the runner waits for all of them. No suite may hang the runner again:
//   each one gets a hard cap, is killed at it, and is reported RED with the last line it printed.
const SUITE_CAP_MS = Number(process.env.DY_SUITE_CAP_MS || 240000);
function runOne(suite, rpc) {
  return new Promise(function (res) {
    const env = Object.assign({}, process.env, rpc ? { DY_RPC: rpc } : {});
    const p = spawn(process.execPath, [suite.file], { env: env });
    const capMs = suite.capMs || SUITE_CAP_MS;
    let out = "", capped = false;
    const cap = setTimeout(function () { capped = true; try { p.kill("SIGKILL"); } catch (e) {} }, capMs);
    p.stdout.on("data", function (d) { out += d; });
    p.stderr.on("data", function (d) { out += d; });
    p.on("close", function (code) {
      clearTimeout(cap);
      if (capped) {
        const lines = out.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
        out += "\n✖ SUITE CAP (" + (capMs / 1000) + "s): KILLED — it hung. Last line: " + (lines[lines.length - 1] || "(no output at all)");
      }
      res({ code: capped ? 124 : code, out: out, capped: capped });
    });
  });
}
function countOf(out) {
  const m = out.match(/ALL GREEN — (\d+)\/(\d+)/) || out.match(/ALL (\d+) CHECKS PASS/);
  if (!m) return null;
  return m[2] ? Number(m[1]) : Number(m[1]);
}

(async function main() {
  console.log("── S-HALL-SUITE-1 · the Hall's guard ──");
  const miss = H.preflight();
  if (miss.length) {
    console.log((ALLOW_SKIP ? "SKIPPING — dependencies are missing:" : "REFUSING TO RUN — dependencies are missing:"));
    miss.forEach(function (m) { console.log(m); });
    console.log(ALLOW_SKIP
      ? "\n  --allow-skip was given, so this is a SKIP, not a pass. NOTHING WAS PROVEN."
      : "\n  Fix the above, or pass --allow-skip to downgrade this to a loud skip (never do that in CI).");
    process.exitCode = ALLOW_SKIP ? 0 : 1;
    return;
  }

  const picked = PICK.length ? SUITES.filter(function (s) { return PICK.indexOf(s.name) >= 0; }) : SUITES;
  if (!picked.length) { console.log("no suite matched " + JSON.stringify(PICK)); process.exitCode = 1; return; }

  let total = 0, red = 0;
  const t0 = Date.now();
  for (const suite of picked) {
    let anvil = null, rpc = null;
    if (suite.chain) {
      // a FRESH chain per suite: independence at ~110ms, so one suite can never colour another
      const port = await freePort();
      anvil = spawn("anvil", ["--silent", "--port", String(port)], { stdio: "ignore", detached: false });
      try { await waitFor(function () { return anvilUp(port); }, 15000); }
      catch (e) { console.log("  ✖ " + suite.name.padEnd(14) + " anvil did not come up on " + port); red++; try { anvil.kill(); } catch (_) {} continue; }
      rpc = "http://127.0.0.1:" + port;
    }
    const s0 = Date.now();
    const r = await runOne(suite, rpc);
    const secs = ((Date.now() - s0) / 1000).toFixed(1);
    if (anvil) { try { anvil.kill("SIGKILL"); } catch (e) {} }
    const n = countOf(r.out);
    if (r.code === 0 && n !== null) {
      total += n;
      const note = suite.expect && n !== suite.expect ? "  (expected " + suite.expect + ")" : "";
      console.log("  ✓ " + suite.name.padEnd(14) + String(n).padStart(3) + " checks   " + secs + "s" + note);
    } else {
      red++;
      console.log("  ✖ " + suite.name.padEnd(14) + (r.capped ? " CAPPED (killed at " + (SUITE_CAP_MS / 1000) + "s)   " : " FAILED (exit " + r.code + ")   ") + secs + "s");
      r.out.split("\n").filter(function (l) { return /✖|Error|FAILURES|REFUS/.test(l); }).slice(0, 6)
        .forEach(function (l) { console.log("      " + l.trim()); });
    }
  }
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("──");
  console.log((red ? "  " + red + " SUITE(S) RED" : "  ALL SUITES GREEN") + " — " + total + " checks measured across " + picked.length + " suites, " + wall + "s");
  process.exitCode = red ? 1 : 0;   // exitCode, never process.exit(): the runner must drain and leave on its own
})();
