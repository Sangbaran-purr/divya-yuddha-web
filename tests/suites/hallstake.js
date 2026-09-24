"use strict";
// MP-FIX-3A — THE HALL TELLS THE TRUTH ABOUT STAKES.
//
// Player report, 2026-09-24, live: a wallet holding 500+ DYC was refused a staked seat with "insufficient DYC for
// this stake". STEP-0 found the Hall had TWO ways to say a wallet was poor and neither required it to be:
//   M2, the ceremony — one regex on the WORD "insufficient" collapsed four failures into a DYC shortage. Three had
//   nothing to do with DYC (no POL for gas, a node's raw -32000, a wallet on another network — the Hall never
//   checked the chain), and the fourth, a real DYC shortage, could not reach it at all: DYC is OpenZeppelin 5.x, so
//   a shortage reverts with a CUSTOM error that carries no such word and that the Hall's ABI could not decode.
//   M1, the tier rows — readLiquid's catch sets liquid = null, affordable() reads null as false, and every staked
//   tier then said "insufficient liquid DYC" and disabled itself. A dead endpoint and an empty wallet were the same
//   sentence; the read road had ONE endpoint and no retry. Reproduced on the live origin: identical rows either way.
//
// Every family here carries a MUTANT: the check is re-run against a deliberately broken copy and must go red.
const path = require("path"), fs = require("fs");
const H = require("../lib.js");
const SITE = H.SITE;
const { ethers } = require("ethers");   // 6.17.0 — the exact build mp/hall.html loads from the CDN

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };

const SRC = fs.readFileSync(path.join(SITE, "mp", "hall.js"), "utf8");
const grab = (re, what) => { const m = SRC.match(re); if (!m) throw new Error("hallstake could not lift " + what + " from mp/hall.js"); return m[0]; };

// ── lift the SHIPPED functions and run them; never a re-implementation ───────────────────────────────────────
const DEC_SRC = grab(/var DEC = [^\n]*/, "DEC");
const COPY_SRC = grab(/  var BALANCE_UNREAD[\s\S]*?var WRONG_CHAIN = [^\n]*/, "the ruled copy");
const MSG_SRC = grab(/  function errText\(e\)[\s\S]*?return String\(m\)\.slice\(0, 140\);   \/\/ \(c\)[^\n]*\n  \}/, "ceremonyMsg");
const PRE_SRC = grab(/  function preflightLine\(\) \{[\s\S]*?\n  \}/, "preflightLine");
const READ_SRC = grab(/  var HALL_READ_FALLBACKS = [\s\S]*?function readRpcUrls\(\) \{[\s\S]*?\n  \}/, "readRpcUrls");
const LIQ_SRC = grab(/  function readLiquid\(ethers\) \{[\s\S]*?\n  \}/, "readLiquid");
const DYCOF = 'function dycOf(wei){ try{ return (BigInt(wei)/DEC).toString(); }catch(e){ return "0"; } }';

// a fresh sandbox per case: the lifted source, the few globals it reads, and nothing else
function boot(over, msgSrc) {
  const code = [DEC_SRC, DYCOF, COPY_SRC, (msgSrc || MSG_SRC), PRE_SRC,
    "return { ceremonyMsg: ceremonyMsg, preflightLine: preflightLine, BALANCE_UNREAD: BALANCE_UNREAD, WRONG_CHAIN: WRONG_CHAIN };"].join("\n");
  const o = Object.assign({ CFG: { chain: { name: "Polygon", id: 137 } }, liquid: null, feeHint: null }, over || {});
  return new Function("CFG", "liquid", "feeHint", code)(o.CFG, o.liquid, o.feeHint);
}

// the exact error shapes measured on 2026-09-24 (ethers 6.17.0 / a Polygon node / MetaMask / OZ 5.6.1)
const E_ETHERS_GAS = { code: "INSUFFICIENT_FUNDS", shortMessage: "insufficient funds for intrinsic transaction cost" };
const E_NODE_GAS = { shortMessage: "could not coalesce error", info: { error: { code: -32000, message: "insufficient funds for gas * price + value: balance 0, tx cost 21000000000000" } } };
const E_MM_GAS = { error: { message: "Insufficient funds for gas" } };
const E_DYC_SHORT = { code: "CALL_EXCEPTION", shortMessage: "execution reverted", revert: { name: "ERC20InsufficientBalance", args: ["0xabc", 5000000000000000000n, 10000000000000000000n] } };
const E_ALLOWANCE = { code: "CALL_EXCEPTION", revert: { name: "ERC20InsufficientAllowance", args: [] } };
const E_REJECT = { shortMessage: "user rejected action" };
const E_OTHER = { message: "could not coalesce error" };

// ═══ A. ONE SENTENCE PER TRUTH ═══
{
  const B = boot({ feeHint: "0.069", liquid: 500000000000000000000n });
  const POL = /You need a little POL for the network fee/;
  ok("A1 · ethers INSUFFICIENT_FUNDS (a wallet with no POL) asks for POL, and names what the seat costs",
     POL.test(B.ceremonyMsg(E_ETHERS_GAS)) && /~0\.069 POL/.test(B.ceremonyMsg(E_ETHERS_GAS)), B.ceremonyMsg(E_ETHERS_GAS));
  ok("A2 · a node's raw -32000, wrapped at e.info.error, reaches the same truth", POL.test(B.ceremonyMsg(E_NODE_GAS)), B.ceremonyMsg(E_NODE_GAS));
  ok("A3 · MetaMask's own wording, wrapped at e.error, reaches it too", POL.test(B.ceremonyMsg(E_MM_GAS)), B.ceremonyMsg(E_MM_GAS));
  ok("A4 · a DECODED DYC shortage quotes the wallet's own numbers — the one case the old sentence could never reach",
     B.ceremonyMsg(E_DYC_SHORT) === "Not enough DYC for this stake - you hold 5, the table needs 10 DYC.", B.ceremonyMsg(E_DYC_SHORT));
  ok("A5 · an allowance that came up short is NOT called a DYC shortage (that would repeat the fault)",
     B.ceremonyMsg(E_ALLOWANCE) === "The approval did not land - try the table again.", B.ceremonyMsg(E_ALLOWANCE));
  ok("A6 · the wrong-network refusal passes through as its own plain sentence",
     B.ceremonyMsg(Object.assign(new Error(B.WRONG_CHAIN), { wrongChain: true })) === B.WRONG_CHAIN);
  ok("A7 · a declined prompt is still a declined prompt", B.ceremonyMsg(E_REJECT) === "you declined the wallet prompt");
  ok("A8 · everything else passes through UNCOLLAPSED — never dressed as money",
     B.ceremonyMsg(E_OTHER) === "could not coalesce error", B.ceremonyMsg(E_OTHER));
  ok("A9 · with the fee unread the POL sentence still tells the truth, without inventing a figure",
     !/~/.test(boot({ feeHint: null }).ceremonyMsg(E_ETHERS_GAS)) && POL.test(boot({ feeHint: null }).ceremonyMsg(E_ETHERS_GAS)),
     boot({ feeHint: null }).ceremonyMsg(E_ETHERS_GAS));
  // MUTANT — put the old word-match back and the gas case is swallowed by the DYC sentence again
  const broadened = MSG_SRC.replace(/if \(isGasShort\(e\)\)[^\n]*\n/, "").replace(
    'var rv = revertOf(e);', 'if (/insufficient/i.test(m)) return "insufficient DYC for this stake";\n    var rv = revertOf(e);');
  const M = boot({ feeHint: "0.069" }, broadened);
  ok("A10 · MUTANT — re-broaden the match to the WORD insufficient and the gas case goes red",
     M.ceremonyMsg(E_ETHERS_GAS) === "insufficient DYC for this stake", M.ceremonyMsg(E_ETHERS_GAS));
}

// ═══ B. THE ERRORS ACTUALLY DECODE (real ethers, real revert bytes) ═══
{
  const abi = eval("(" + grab(/var DYC_FULL_ABI = \[[\s\S]*?\]\.concat\(ERC20_ERRORS\);/, "DYC_FULL_ABI")
    .replace("var DYC_FULL_ABI = ", "").replace(/;$/, "").replace(".concat(ERC20_ERRORS)",
      ".concat(" + JSON.stringify(eval("(" + grab(/var ERC20_ERRORS = \[[\s\S]*?\];/, "ERC20_ERRORS").replace("var ERC20_ERRORS = ", "").replace(/;$/, "") + ")")) + ")") + ")");
  const iface = new ethers.Interface(abi);
  const data = iface.encodeErrorResult("ERC20InsufficientBalance", ["0x" + "ab".repeat(20), 5n, 10n]);
  const parsed = iface.parseError(data);
  ok("B1 · the ABI now decodes OZ5's ERC20InsufficientBalance, with its numbers",
     !!parsed && parsed.name === "ERC20InsufficientBalance" && parsed.args[1] === 5n && parsed.args[2] === 10n, String(parsed && parsed.name));
  ok("B2 · and ERC20InsufficientAllowance", !!iface.getError("ERC20InsufficientAllowance"));
  // MUTANT — the ABI as it shipped BEFORE this rung: the same bytes are undecodable, which is what the player saw
  const bare = new ethers.Interface(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
  ok("B3 · MUTANT — without the error declarations those exact bytes do not decode (the old 'unknown custom error')",
     bare.parseError(data) === null);
}

// ═══ C. AN UNREAD BALANCE IS NOT AN EMPTY ONE ═══
{
  const rowSrc = grab(/      var isFree = t\.id === "free";[\s\S]*?\+ '<\/button>';/, "the tier row");
  const renderRow = (liquidVal, stakeWei) => {
    const code = [DEC_SRC, DYCOF, COPY_SRC,
      'function affordable(s){ return liquid != null && BigInt(liquid) >= BigInt(s); }',
      'function balanceUnread(){ return liquid == null; }',
      'var rows="", sheet={ctx:{}}, t={id:"bronze",stake:stakeWei,usd:"$0.10",medallion:"m",cls:"c",label:"BRONZE"};',
      'function medallionImg(){ return ""; }',
      rowSrc, "return rows;"].join("\n");
    return new Function("CFG", "liquid", "stakeWei", code)({ chain: { name: "Polygon", id: 137 } }, liquidVal, stakeWei);
  };
  const STAKE = (10n * 10n ** 18n).toString();
  const unread = renderRow(null, STAKE), poor = renderRow(0n, STAKE), rich = renderRow(500n * 10n ** 18n, STAKE);
  ok("C1 · an UNREAD balance says so, and offers the retry", /Couldn't read your balance/.test(unread), unread.slice(0, 160));
  ok("C2 · and never says insufficient", !/insufficient/i.test(unread), unread.slice(0, 160));
  ok("C3 · and the row stays ACTIONABLE — no aria-disabled, and it carries the retry hook",
     !/aria-disabled/.test(unread) && /data-liquid-retry="1"/.test(unread), unread.slice(0, 200));
  ok("C4 · a balance we READ and that is short still says insufficient, and still disables",
     /insufficient liquid DYC/.test(poor) && /aria-disabled/.test(poor), poor.slice(0, 160));
  ok("C5 · a wallet that can afford it is offered the table", !/insufficient/i.test(rich) && !/aria-disabled/.test(rich));
  // MUTANT — collapse unknown back into short and C1/C3 go red
  const collapsed = rowSrc.replace("var unread = !isFree && balanceUnread();", "var unread = false;");
  const mut = new Function("CFG", "liquid", "stakeWei", [DEC_SRC, DYCOF, COPY_SRC,
    'function affordable(s){ return liquid != null && BigInt(liquid) >= BigInt(s); }',
    'function balanceUnread(){ return liquid == null; }',
    'var rows="", sheet={ctx:{}}, t={id:"bronze",stake:stakeWei,usd:"$0.10",medallion:"m",cls:"c",label:"BRONZE"};',
    'function medallionImg(){ return ""; }', collapsed, "return rows;"].join("\n"))({ chain: {} }, null, STAKE);
  ok("C6 · MUTANT — treat an unknown balance as a short one and the unread row goes red",
     /insufficient liquid DYC/.test(mut) && /aria-disabled/.test(mut));
}

// ═══ D. THE CAST IS CHAIN-GUARDED ═══
{
  const road = grab(/  function signerRoad\(\) \{[\s\S]*?\n  \}/, "signerRoad");
  const guard = grab(/  function ensurePolygon\(bp\) \{[\s\S]*?\n  \}/, "ensurePolygon");
  ok("D1 · signerRoad — the one door every ceremony passes through — guards the chain",
     /ensurePolygon\(bp\)/.test(road), road.slice(0, 200));
  ok("D2 · and it guards BEFORE the signer is asked for anything",
     road.indexOf("ensurePolygon(bp)") < road.indexOf("bp.getSigner()"), road.slice(0, 200));
  ok("D3 · the guard prompts the switch with the site's own ensureChain, and refuses in words if the wallet stays",
     /DYWallet/.test(guard) && /ensureChain\(\)/.test(guard) && /wrongChain = true/.test(guard), guard.slice(0, 200));
  ok("D4 · an unreadable network is not a refusal (we do not refuse what we cannot know)", /got == null\) return;/.test(guard));
  ok("D5 · MUTANT — remove the guard from signerRoad and the chain check goes red",
     !/ensurePolygon\(bp\)/.test(road.replace(/return ensurePolygon\(bp\)\.then\(function \(\) \{/, "return (function () {")));
}

// ═══ E. THE READ ROAD FAILS OVER ═══
{
  const urls = new Function("CFG", "lsGet", READ_SRC + "\nreturn readRpcUrls;")(
    { chain: { readRpcUrls: ["https://polygon-bor-rpc.publicnode.com"] } }, () => null)();
  ok("E1 · the Hall's read road carries a SECOND endpoint (one url and no retry is how the balance went unread)",
     urls.length >= 2 && urls[0] === "https://polygon-bor-rpc.publicnode.com", JSON.stringify(urls));
  const soleOverride = new Function("CFG", "lsGet", READ_SRC + "\nreturn readRpcUrls;")(
    { chain: { readRpcUrls: ["https://polygon-bor-rpc.publicnode.com"] } }, () => "http://127.0.0.1:8545")();
  ok("E2 · a local-proof override stays SOLE — an anvil run never falls through to mainnet",
     soleOverride.length === 1 && soleOverride[0] === "http://127.0.0.1:8545", JSON.stringify(soleOverride));

  // drive the SHIPPED readLiquid with a stub whose FIRST endpoint throws
  function drive(failing) {
    const seen = [];
    const st = { liquid: undefined, liquidRead: null, renders: 0 };
    const fakeEthers = { Contract: function (a, b, prov) { return { balanceOf: () => { seen.push(prov.__url); return prov.__fail ? Promise.reject(new Error("dead")) : Promise.resolve(7n); } }; } };
    const code = [READ_SRC, LIQ_SRC, "return readLiquid(ethers);"].join("\n");
    const p = new Function("CFG", "lsGet", "ethers", "dycAddr", "me", "DYC_ABI", "readProvider", "afterRead",
      "liquid", "liquidRead", "__set", code.replace(/liquid = /g, "__set('liquid', ").replace(/liquidRead = /g, "__set('liquidRead', ")
        .replace(/__set\('liquid', (b|null);/g, "__set('liquid', $1);").replace(/__set\('liquidRead', ("[a-z]+");/g, "__set('liquidRead', $1);"))(
      { chain: { readRpcUrls: ["https://polygon-bor-rpc.publicnode.com"] } }, () => null, fakeEthers,
      () => "0xdyc", "0xme", [], (e, i) => ({ __url: urls[i || 0], __fail: failing.indexOf(i || 0) >= 0 }),
      () => { st.renders++; }, undefined, null, (k, v) => { st[k] = v; });
    return p.then(() => ({ seen, st }));
  }
  return drive([0]).then((r) => {
    ok("E3 · the FIRST endpoint failing no longer surrenders — the read walks on to the second",
       r.seen.length === 2 && r.seen[0] === urls[0] && r.seen[1] === urls[1], JSON.stringify(r.seen));
    ok("E4 · and the balance is then READ, not null", r.st.liquid === 7n && r.st.liquidRead === "ok", JSON.stringify({ l: String(r.st.liquid), s: r.st.liquidRead }));
    return drive([0, 1]);
  }).then((r) => {
    ok("E5 · only when EVERY endpoint fails does it surrender — and it records WHY, so the rows can say so",
       r.st.liquid === null && r.st.liquidRead === "failed", JSON.stringify({ l: String(r.st.liquid), s: r.st.liquidRead }));

    // ═══ F. THE PRE-FLIGHT NEVER SHOWS AN UNREAD NUMBER ═══
    const both = boot({ liquid: 500n * 10n ** 18n, feeHint: "0.069" }).preflightLine();
    const neither = boot({ liquid: null, feeHint: null }).preflightLine();
    const halfKnown = boot({ liquid: null, feeHint: "0.069" }).preflightLine();
    ok("F1 · both numbers known — both shown", /500 DYC/.test(both) && /~0\.069 POL/.test(both), both);
    ok("F2 · neither known — two sentinels, and no digit anywhere", /—/.test(neither) && !/\d/.test(neither.replace(/<[^>]+>/g, "")), neither);
    ok("F3 · one known — the unknown one is still a sentinel, never a stale or invented figure",
       /Liquid DYC: <b>—<\/b>/.test(halfKnown) && /~0\.069 POL/.test(halfKnown), halfKnown);
    ok("F4 · a zero balance is a READ zero and prints as one (the sentinel means unknown, not empty)",
       /Liquid DYC: <b>0 DYC<\/b>/.test(boot({ liquid: 0n }).preflightLine()));

    console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
    if (fail) process.exitCode = 1;
  });
}
