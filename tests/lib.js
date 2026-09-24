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
    // S-BUNDLE-1 — the bundle suite deploys the REAL PlayStore behind a REAL ERC1967Proxy, against a REAL AccessNFT
    // and two MockStables. Each artifact is named: a guard that passes emptily is worse than no guard.
    [path.join(OUT, "PlayStore.sol", "PlayStore.json"), "the PlayStore artifact (same `forge build`)"],
    [path.join(OUT, "ERC1967Proxy.sol", "ERC1967Proxy.json"), "the ERC1967Proxy artifact (same `forge build`)"],
    [path.join(OUT, "AccessNFT.sol", "AccessNFT.json"), "the AccessNFT artifact (same `forge build`)"],
    [path.join(OUT, "MockStable.sol", "MockStable.json"), "the MockStable artifact (same `forge build`)"],
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

// ── S-BUNDLE-1 — THE STORE'S CHAIN. The REAL PlayStore (impl + ERC1967Proxy, its real initializer), the REAL
//    AccessNFT, two MockStables at 6 decimals, MockDYC as the inventory. The fork rehearsal's own sequence, on anvil:
//    deploy -> grant the minter -> fund -> (already open, since the harness has no 48h to wait out).
const DEC6 = 1000000n;
async function chainStore(opts) {
  opts = opts || {};
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.NonceManager(new ethers.Wallet(K.owner, provider));
  const player = new ethers.Wallet(K.p1, provider);
  const ownerAddr = await owner.getAddress();
  const F = (n) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, owner); };

  const dyc = await (F("MockDYC")).deploy(); await dyc.waitForDeployment();
  const usdc = await (F("MockStable")).deploy("USD Coin", "USDC", 6); await usdc.waitForDeployment();
  const usdt = await (F("MockStable")).deploy("Tether USD", "USDT", 6); await usdt.waitForDeployment();
  const nft = await (F("AccessNFT")).deploy(ownerAddr, "ipfs://torana/"); await nft.waitForDeployment();

  const impl = await (F("PlayStore")).deploy(); await impl.waitForDeployment();
  const psArt = art("PlayStore");
  const init = new ethers.Interface(psArt.abi).encodeFunctionData("initialize", [
    [ownerAddr, await dyc.getAddress(), await nft.getAddress(), ownerAddr,
     500n * DEC, 500n * DEC, 2000n * DEC, 604800n],
    [await usdc.getAddress(), await usdt.getAddress()],
    [20n * DEC6, 20n * DEC6],
    [5n * DEC6, 5n * DEC6],
  ]);
  const pxArt = art("ERC1967Proxy");
  const proxy = await (new ethers.ContractFactory(pxArt.abi, pxArt.bytecode, owner)).deploy(await impl.getAddress(), init);
  await proxy.waitForDeployment();
  const psAddr = await proxy.getAddress();
  const ps = new ethers.Contract(psAddr, psArt.abi, owner);

  await (await nft.setMinter(psAddr, true)).wait();                                  // the pre-open act
  await (await dyc.mint(psAddr, (opts.inventory != null ? opts.inventory : 5000n * DEC))).wait();  // the tranche
  if (opts.open !== false) await (await ps.setSaleOpen(true)).wait();

  return {
    provider, owner, player, ps, dyc, nft, usdc, usdt, impl,
    addrs: { ps: psAddr, dyc: await dyc.getAddress(), nft: await nft.getAddress(),
             usdc: await usdc.getAddress(), usdt: await usdt.getAddress(), owner: ownerAddr },
  };
}

// ── S-BUNDLE-1 — THE STORE'S PAGE, in jsdom: store.html's REAL markup plus the REAL scripts in page order, then the
//    two mounts its inline script makes. The chain is anvil; the harness declares anvil's own chain id in the config
//    it hands the page (it does not lie about eth_chainId), and points every read at anvil through dy::readRpcUrl.
async function storePage(c, player, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(SITE, "store.html"), "utf8");
  const body = (html.split(/<body[^>]*>/)[1] || "").split("</body>")[0];
  const dom = new JSDOM(`<!doctype html><body class="treasury">${body}</body>`,
    { url: "https://divyayuddha.games/store.html", pretendToBeVisual: true, runScripts: "outside-only" });
  const w = dom.window;
  w.ethers = ethers;
  const eth = makeEthereum(player, c.provider);
  w.ethereum = eth;
  w.TextEncoder = TextEncoder;
  w.fetch = function (u) { return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") }); };
  const chainId = Number((await c.provider.getNetwork()).chainId);
  w.localStorage.setItem("dy::readRpcUrl", RPC);
  w.localStorage.setItem("dystore::playStoreAddress", c.addrs.ps);
  w.localStorage.setItem("dystore::usdcAddress", c.addrs.usdc);
  w.localStorage.setItem("dystore::usdtAddress", c.addrs.usdt);
  w.localStorage.setItem("dystore::accessAddress", c.addrs.nft);
  w.localStorage.setItem("dystore::waitMs", String(opts.waitMs || 20000));
  for (const [k, v] of Object.entries(opts.ls || {})) w.localStorage.setItem(k, v);
  const run = (p) => w.eval(fs.readFileSync(p, "utf8"));
  run(path.join(SITE, "config.js"));
  w.DY_CONFIG.chain.id = chainId;                       // the harness's chain, declared not faked
  w.DY_CONFIG.chain.idHex = "0x" + chainId.toString(16);
  w.DY_CONFIG.contracts.dycoin = c.addrs.dyc;           // the inventory coin under test
  w.DY_CONFIG.contracts.waveCardSale = null;            // the wave-card tabs are OUT of scope here: dark, not busy
  w.DY_CONFIG.contracts.waveCardMarket = null;
  run(path.join(SITE, "js/wallet.js"));
  run(path.join(SITE, "js/cards.js"));
  run(path.join(SITE, "js/wave-registry.js"));
  run(path.join(SITE, "js/store.js"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  w.DYStore.mountStore();
  w.DYStore.mountBundle();
  w.DYWallet.init();
  return { dom, w, eth };
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
  // S-HALL-FREE-1 — jsdom exposes no fetch, no crypto.subtle and no TextEncoder; every browser does. The harness
  //   supplies the REAL node implementations (not fakes) and stands in for the web server on same-origin relative
  //   URLs, exactly as it already stands in for the socket, the wallet and the chain. Bytes come off disk, from the
  //   site repo, so the Hall's pin check runs against the real file it names.
  w.TextEncoder = TextEncoder;
  w.crypto = w.crypto || {}; try { w.crypto.subtle = require("crypto").webcrypto.subtle; } catch (e) {}
  w.fetch = function (u) {
    const rel = String(u).split("?")[0];
    const file = rel.indexOf("/") === 0 ? path.join(SITE, rel) : path.resolve(SITE, "mp", rel);
    return new Promise((res) => {
      let body = null; try { body = fs.readFileSync(file, "utf8"); } catch (e) { body = null; }
      res({ ok: body != null, status: body == null ? 404 : 200, text: () => Promise.resolve(body == null ? "" : body) });
    });
  };
  for (const [k, v] of Object.entries(opts.ls || {})) w.localStorage.setItem(k, v);
  w.localStorage.setItem("dyhall::matchServerUrl", url);
  w.localStorage.setItem("dyhall::stakeEscrowAddress", escAddr);
  w.localStorage.setItem("dyhall::dycAddress", dycAddr);
  w.localStorage.setItem("dyhall::readRpcUrl", RPC);
  w.localStorage.setItem("dyhall::devAccess", "1");     // the documented proof-only gate bypass
  const run = (p) => { const code = fs.readFileSync(p, "utf8"); w.eval(code); };
  // S-HALL-SLIP-SCOPE-1 — opts.srcDir points the two PRODUCT files at another checkout of them (a temp dir holding
  //   `git show HEAD:` bytes), so a suite can drive the pre-fix Hall beside the new one in the same flow. Default is
  //   the working tree, unchanged for every existing suite.
  const SRC = opts.srcDir || SITE;
  run(path.join(SITE, "config.js"));
  //  MP-FIX-3A — DECLARE THE HARNESS'S CHAIN, as storePage already does (lib.js:157, "the harness's chain, declared
  //  not faked"). The Hall page never did, so CFG.chain.id stayed at mainnet's 137 while the wallet shim forwarded
  //  eth_chainId to anvil's own id — a page that believed it was on Polygon while its wallet was demonstrably not.
  //  Nothing noticed until the Hall grew a chain guard; the guard is right, and this is the gap it found.
  w.DY_CONFIG.chain.id = await provider.getNetwork().then(function (n) { return Number(n.chainId); });
  w.DY_CONFIG.chain.idHex = "0x" + w.DY_CONFIG.chain.id.toString(16);
  if (!opts.noWallet) run(path.join(SITE, "js/wallet.js"));   // control: boot with DYWallet absent (init cannot run)
  run(path.join(SRC, "mp/matchclient.js"));
  run(path.join(SRC, "mp/hall.js"));
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

module.exports = { chain, chainStore, server, hall, storePage, click, text, until, sleep, teardown, preflight, DEC, DEC6, S10, RPC, SITE, W3, MS, OUT };
