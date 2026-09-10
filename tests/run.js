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
  { name: "copyproof",     file: path.join(H.SITE, "mp", "copyproof.js"), chain: false, expect: 46 },
  { name: "p4",            file: path.join(__dirname, "suites", "p4.js"), chain: true, expect: 7 },
  { name: "p8rig",         file: path.join(__dirname, "suites", "p8rig.js"), chain: true, expect: 7 },
  { name: "p7dom",         file: path.join(__dirname, "suites", "p7dom.js"), chain: true, expect: 4 },
  { name: "p1",            file: path.join(__dirname, "suites", "p1.js"), chain: true, expect: 18 },
  { name: "p2356",         file: path.join(__dirname, "suites", "p2356.js"), chain: true, expect: 23 },
  { name: "friendlookup",  file: path.join(__dirname, "suites", "friendlookup.js"), chain: true, expect: 21 },
  { name: "chrome",        file: path.join(__dirname, "suites", "chrome.js"), chain: true, expect: 25 },
  { name: "account",       file: path.join(__dirname, "suites", "account.js"), chain: true, expect: 43 },
  { name: "slipscope",     file: path.join(__dirname, "suites", "slipscope.js"), chain: true, expect: 19 },
  { name: "ceremony",      file: path.join(__dirname, "suites", "ceremony.js"), chain: true, expect: 19 },
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
function runOne(suite, rpc) {
  return new Promise(function (res) {
    const env = Object.assign({}, process.env, rpc ? { DY_RPC: rpc } : {});
    const p = spawn(process.execPath, [suite.file], { env: env });
    let out = "";
    p.stdout.on("data", function (d) { out += d; });
    p.stderr.on("data", function (d) { out += d; });
    p.on("close", function (code) { res({ code: code, out: out }); });
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
      console.log("  ✖ " + suite.name.padEnd(14) + " FAILED (exit " + r.code + ")   " + secs + "s");
      r.out.split("\n").filter(function (l) { return /✖|Error|FAILURES|REFUS/.test(l); }).slice(0, 6)
        .forEach(function (l) { console.log("      " + l.trim()); });
    }
  }
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("──");
  console.log((red ? "  " + red + " SUITE(S) RED" : "  ALL SUITES GREEN") + " — " + total + " checks measured across " + picked.length + " suites, " + wall + "s");
  process.exitCode = red ? 1 : 0;   // exitCode, never process.exit(): the runner must drain and leave on its own
})();
