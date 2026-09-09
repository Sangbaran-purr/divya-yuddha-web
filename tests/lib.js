"use strict";
// S-HALL-L3-FIX-1 — the L3 harness: anvil + the REAL match server in-process + the REAL mp/hall.js and
// mp/matchclient.js driven in jsdom behind an EIP-1193 shim backed by an anvil key. No repo file is modified.
const path = require("path"), fs = require("fs");
const { JSDOM } = require("jsdom");
const { ethers } = require("ethers");
const WS = require("ws");

// S-HALL-SUITE-1 (R3) — no absolute path is hardcoded anywhere. SITE is derived from this file's location; the
// match-server repo comes from DY_WEB3 and defaults to a sibling checkout; the chain comes from DY_RPC so the
// runner can hand every suite its OWN anvil (see run.js).
const SITE = path.resolve(__dirname, "..");
const W3 = process.env.DY_WEB3 || path.resolve(SITE, "..", "divya-yuddha-web3");
const MS = path.join(W3, "services/match-server");
const RPC = process.env.DY_RPC || "http://127.0.0.1:8545";
const OUT = path.join(W3, "contracts", "out");
const DEC = 1000000000000000000n, S10 = 10n * DEC;
const K = {
  owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  p1: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  treasury: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
};
function art(n) { const j = JSON.parse(fs.readFileSync(path.join(OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// S-HALL-SUITE-1 (R3) — THE PREFLIGHT. The suite boots the REAL match server, whose source, its own node_modules,
// and the forge build artifacts all live in the OTHER repo. A guard that passes emptily when they are missing is
// worse than no guard, so every dependency is named and the default is a non-zero exit. `--allow-skip` (or
// DY_ALLOW_SKIP=1) downgrades to a loud skip; it is never the default.
function preflight() {
  const miss = [];
  const need = [
    [W3, "the web3 checkout (set DY_WEB3, or clone it beside this repo as ../divya-yuddha-web3)"],
    [path.join(MS, "src", "wshub.js"), "the match-server source"],
    [path.join(MS, "node_modules", "ws"), "the match-server's own node_modules (run `npm install` in services/match-server)"],
    [path.join(OUT, "StakeEscrow.sol", "StakeEscrow.json"), "the forge build artifacts (run `forge build` in contracts/)"],
    [path.join(OUT, "MockDYC.sol", "MockDYC.json"), "the MockDYC artifact (same `forge build`)"],
  ];
  need.forEach(function (n) { if (!fs.existsSync(n[0])) miss.push("  MISSING: " + n[1] + "\n           expected at " + n[0]); });
  let anvil = false;
  try { require("child_process").execSync("command -v anvil", { stdio: "ignore" }); anvil = true; } catch (e) {}
  if (!anvil) miss.push("  MISSING: anvil on PATH (install foundry: https://getfoundry.sh)");
  return miss;
}

async function chain() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.NonceManager(new ethers.Wallet(K.owner, provider));
  const player = new ethers.Wallet(K.p1, provider);
  const treasuryAddr = new ethers.Wallet(K.treasury).address;
  const referee = ethers.Wallet.createRandom();
  const dycArt = art("MockDYC"), escArt = art("StakeEscrow");
  const dyc = await (new ethers.ContractFactory(dycArt.abi, dycArt.bytecode, owner)).deploy(); await dyc.waitForDeployment();
  const esc = await (new ethers.ContractFactory(escArt.abi, escArt.bytecode, owner)).deploy(
    await dyc.getAddress(), treasuryAddr, referee.address, 10n * DEC, 10000n * DEC, 24n * 3600n, await owner.getAddress());
  await esc.waitForDeployment();
  const escAddr = await esc.getAddress(), dycAddr = await dyc.getAddress();
  await (await dyc.mint(player.address, 1000n * DEC)).wait();
  return { provider, player, escAddr, dycAddr, esc, dyc };
}

async function server(escAddr, dycAddr) {
  const { makeServer } = require(path.join(MS, "src/server"));
  const { makeHub } = require(path.join(MS, "src/wshub"));
  const { makeLobby } = require(path.join(MS, "src/lobby"));
  const { loadGuardedEngine } = require(path.join(MS, "src/engineguard"));
  const { createRoom } = require(path.join(MS, "src/match"));
  const { makeMatchStore } = require(path.join(MS, "src/matchstore"));
  const { makeEscrowReader } = require(path.join(MS, "src/escrow"));
  const rng = require(path.join(MS, "src/rng"));
  const cfg = { PORT: 0, ALLOW_ORIGIN: "*", DEV_ADDRESS_MODE: false, NONCE_TTL_MS: 300000,
    TIERS: [10, 50, 200, 1000], TIER_STAKES: { 10: S10, 50: 50n * DEC, 200: 200n * DEC, 1000: 1000n * DEC },
    STAKE_MIN: 10n * DEC, STAKE_MAX: 10000n * DEC, MATCH_RPC_URL: RPC,
    STAKE_ESCROW_ADDRESS: escAddr, DYC_ADDRESS: dycAddr, STAKING_ENABLED: true };
  const logLines = [];
  const srv = makeServer(cfg);
  makeHub(srv, cfg, makeLobby(cfg.TIERS), function (m) { logLines.push(String(m)); },
    { E: loadGuardedEngine().engine, rng, createRoom, store: makeMatchStore({ file: "/tmp/l3fix_store.jsonl" }), escrow: makeEscrowReader({ rpcUrl: RPC, escrowAddress: escAddr }) });
  await new Promise((r) => srv.listen(0, r));
  return { srv, url: "ws://127.0.0.1:" + srv.address().port, logLines };
}

// an EIP-1193 shim: reads/writes forwarded to anvil (the account is unlocked), personal_sign signed locally.
function makeEthereum(player, provider) {
  const listeners = {};
  const eth = {
    isMetaMask: true,
    selectedAddress: player.address.toLowerCase(),
    __wallet: player,                       // the CURRENT pen
    __calls: [],                            // every method the wallet was asked for (prompt auditing)
    // switch the wallet the way MetaMask does: the pen changes AND accountsChanged fires
    __switchTo(w) {
      eth.__wallet = w;
      eth.selectedAddress = w ? w.address.toLowerCase() : null;
      (listeners["accountsChanged"] || []).forEach((fn) => fn(w ? [w.address] : []));
    },
    async request({ method, params }) {
      eth.__calls.push(method);
      if (method === "eth_accounts" || method === "eth_requestAccounts") return eth.__wallet ? [eth.__wallet.address] : [];
      if (method === "personal_sign") return eth.__wallet.signMessage(ethers.getBytes(params[0]));
      if (method === "eth_sendTransaction" && params && params[0]) params[0].from = eth.__wallet.address;
      return provider.send(method, params || []);
    },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
  };
  return eth;
}

// jsdom window carrying the REAL site scripts, in hall.html's order.
async function hall(url, escAddr, dycAddr, player, provider, opts) {
  opts = opts || {};
  const dom = new JSDOM(`<!doctype html><body><div id="hall-root"></div></body>`, { url: "https://divyayuddha.games/mp/hall.html", pretendToBeVisual: true, runScripts: "outside-only" });
  const w = dom.window;
  w.ethers = ethers;
  const eth = makeEthereum(player, provider);
  w.ethereum = eth;
  // the socket the Hall uses; wrapped so a proof can SEVER it mid-ceremony (the strand's closed socket).
  const sockets = []; let blocked = false;
  // "offline" = the connection FAILS ASYNCHRONOUSLY (an unreachable port), exactly as a browser socket does.
  // Throwing here would be unrealistic and would kill the Hall's own reconnect chain.
  const sent = [];   // every frame the Hall puts ON THE WIRE (so a proof can show the server was ASKED)
  w.WebSocket = function (u) {
    const s = new WS(blocked ? "ws://127.0.0.1:1" : u);
    const realSend = s.send.bind(s);
    s.send = function (d) { try { sent.push(JSON.parse(String(d))); } catch (e) {} return realSend(d); };
    sockets.push(s); return s;
  };
  w.WebSocket.prototype = WS.prototype;
  const net = {
    sever() { sockets.forEach((s) => { try { s.close(); } catch (e) {} }); },
    block() { blocked = true; }, allow() { blocked = false; },
    live() { return sockets.filter((s) => s.readyState === 1).length; },
    sent() { return sent; },
  };
  for (const [k, v] of Object.entries(opts.ls || {})) w.localStorage.setItem(k, v);
  w.localStorage.setItem("dyhall::matchServerUrl", url);
  w.localStorage.setItem("dyhall::stakeEscrowAddress", escAddr);
  w.localStorage.setItem("dyhall::dycAddress", dycAddr);
  w.localStorage.setItem("dyhall::readRpcUrl", RPC);
  w.localStorage.setItem("dyhall::devAccess", "1");     // the documented proof-only gate bypass
  const run = (p) => { const code = fs.readFileSync(p, "utf8"); w.eval(code); };
  run(path.join(SITE, "config.js"));
  if (!opts.noWallet) run(path.join(SITE, "js/wallet.js"));   // control: boot with DYWallet absent (init cannot run)
  run(path.join(SITE, "mp/matchclient.js"));
  run(path.join(SITE, "mp/hall.js"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  w.__net = net;   // so a suite holding only `w` can still tear down safely (see teardown)
  return { dom, w, eth, sockets, net, sent };
}

function click(w, sel) { const e = w.document.querySelector(sel); if (!e) throw new Error("no element " + sel); e.click(); return e; }
function text(w) { return (w.document.body.textContent || "").replace(/\s+/g, " ").trim(); }
async function until(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 15000)) { let v; try { v = await fn(); } catch (e) { v = false; } if (v) return v; await sleep(120); }
  throw new Error("timed out waiting for " + (label || "condition"));
}
// S-HALL-SUITE-1 (R1) — SAFE TEARDOWN, the fix for the flake ACCOUNT-1 misattributed. Closing a jsdom window while
// its socket still has frames in flight kills the process: the next frame runs the Hall's onUpdate → render() →
// document.getElementById on a window whose `document` is gone. Sever FIRST so a late frame finds a dead client,
// then let the window be. (Windows die with the process; each suite is its own process.)
function teardown(h) {
  if (!h) return;
  var net = h.net || h.__net || (h.w && h.w.__net);   // accepts a hall object OR a bare window
  try { if (net) { net.block(); net.sever(); } } catch (e) {}
  // deliberately NOT window.close() — closing is the race itself. The window dies with the process.
}

module.exports = { chain, server, hall, click, text, until, sleep, teardown, preflight, DEC, S10, RPC, SITE, W3, MS, OUT };
