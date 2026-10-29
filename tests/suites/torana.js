"use strict";
// TORANA-AUTO-1 (owner rulings 2026-10-29) — THE DASHBOARD'S TORANA PANEL and the after-buy line. The chain under test is
// the REAL DYCoinSale + VestingVault (opened to the presale round), the REAL AccessNFT and the REAL ToranaIcoClaim on
// anvil, the claim contract authorised by the AccessNFT's owner exactly as the master did on mainnet. Only the approval
// bot's voucher door is stubbed (signed by the bot's own signer module).
//   TP · never bought → no panel; USD 60 → "Buy USD 40.00 more…"; USD 100 → "hasn't arrived yet" + Claim my Torana; the
//        click claims (one prompt) → "has arrived"; right after a buy here → "on its way"; a holder → no panel; a wallet
//        that refuses NFTs → "can't receive", no button; claims switched off → no button; the after-buy line (S1; the page's
//        own USD 100 minimum means every buy made here qualifies — S2 is for wallets that bought less elsewhere)
//   M  · breakages applied to the page's own source, each caught
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const H = require("../lib");

const SITE = path.resolve(__dirname, "..", "..");
const DEC = 1000000000000000000n, DEC6 = 1000000n;
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const txt = (w, sel) => { const e = w.document.querySelector(sel); return e ? e.textContent : ""; };
const DOOR = "https://bot.test/presale/voucher";
const { makeSigner } = require(path.join(H.W3, "services", "approval-bot", "src", "signer.js"));
const S1 = "Your Torana is on its way - it arrives in your wallet within a few minutes.";
const S2_40 = "Buy USD 40.00 more in the sale and a Torana comes with it.";
const S3 = "Your Torana hasn't arrived yet. You can claim it yourself - it's free; you pay only the network fee.";
const S4 = "Claim my Torana";
const S5 = "Your wallet can't receive the Torana right now. Nothing is lost - it stays yours to claim.";
const S6 = "Your Torana has arrived.";
const DASH = fs.readFileSync(path.join(SITE, "js", "dashboard.js"), "utf8");

function art(n) { const j = JSON.parse(fs.readFileSync(path.join(H.OUT, n + ".sol", n + ".json"), "utf8")); return { abi: j.abi, bytecode: j.bytecode.object }; }
async function chain() {
  const c = await H.chainPresale();
  const F = (n) => { const a = art(n); return new ethers.ContractFactory(a.abi, a.bytecode, c.owner); };
  const nft = await F("AccessNFT").deploy(c.addrs.owner, "ipfs://torana/"); await nft.waitForDeployment();
  const claim = await F("ToranaIcoClaim").deploy(c.addrs.sale, await nft.getAddress()); await claim.waitForDeployment();
  await (await nft.setMinter(await claim.getAddress(), true)).wait();          // the master's one cast, here the NFT's owner
  c.nft = nft; c.claim = claim; c.addrs.nft = await nft.getAddress(); c.addrs.claim = await claim.getAddress();
  return c;
}
// a purchase straight on chain (the player's own key), for the states the panel is read in
async function buyOnChain(c, usd) {
  const chainId = Number((await c.provider.getNetwork()).chainId);
  const sig = await makeSigner(c.signer.privateKey, chainId, c.addrs.sale).sign(c.player.address);
  const amt = BigInt(usd) * DEC6;
  // the nonce from a RAW call: the provider caches its own reads for a moment, and back-to-back buys must not share a nonce
  const n = Number(await c.provider.send("eth_getTransactionCount", [c.player.address, "pending"]));
  await (await c.usdt.connect(c.player).approve(c.addrs.sale, amt, { nonce: n })).wait();
  await (await c.sale.connect(c.player).buyWithStable(c.addrs.usdt, amt, sig, "", { nonce: n + 1 })).wait();
}
function door(c) {
  return { "/presale/voucher": async (init) => {
    const wallet = JSON.parse(init.body).wallet;
    const chainId = Number((await c.provider.getNetwork()).chainId);
    return { wallet, sig: await makeSigner(c.signer.privateKey, chainId, c.addrs.sale).sign(wallet) };
  } };
}
async function page(c, opts) {
  opts = opts || {};
  const h = await H.dashboardPage(c, c.player, { svc: door(c), presaleVoucherUrl: DOOR, ls: opts.ls, dashSrc: opts.dashSrc,
    contracts: { dycoinSale: c.addrs.sale, vestingVault: c.addrs.vault, usdt: c.addrs.usdt, usdc: c.addrs.usdc, toranaClaim: c.addrs.claim } });
  await h.w.DYWallet.connect();
  return h;
}
const done = (...ws) => ws.forEach((w) => { for (let id = 1; id < 5000; id++) { try { w.clearInterval(id); w.clearTimeout(id); } catch (e) {} } });
const panelShown = (w) => { const p = w.document.getElementById("torana-panel"); return !!p && p.style.display !== "none"; };
async function settled(w) { await H.until(() => w.document.getElementById("card-liquid") && !/Connect/.test(txt(w, "#buy-body")), 20000, "the dashboard").catch(() => {}); await H.sleep(2500); }
const recentLs = (c) => ({ ["dyt::boughtAt::" + c.player.address.toLowerCase()]: String(Date.now()) });

async function run() {
  console.log("\n── TORANA-AUTO-1 · the dashboard's Torana panel ──");
  await H.preflight();

  // TP1 · never bought
  { const c = await chain(); const h = await page(c); await settled(h.w);
    ok("TP1 · a wallet that never bought sees NO Torana panel", !panelShown(h.w), txt(h.w, "#torana-body")); done(h.w); }

  // TP2 · USD 60
  { const c = await chain(); await buyOnChain(c, 60); const h = await page(c); await settled(h.w);
    ok("TP2 · USD 60 bought: the panel says how much more — '" + S2_40 + "'", panelShown(h.w) && txt(h.w, "#torana-more") === S2_40 && !h.w.document.getElementById("torana-claim"), txt(h.w, "#torana-body")); done(h.w); }

  // TP3 + TP4 · USD 100, no recent buy here → S3 + S4; the click claims
  { const c = await chain(); await buyOnChain(c, 60); await buyOnChain(c, 40); const h = await page(c); await settled(h.w);
    ok("TP3 · USD 60 + 40: '" + S3 + "' and the button '" + S4 + "'", panelShown(h.w) && txt(h.w, "#torana-notyet") === S3 && txt(h.w, "#torana-claim") === S4, txt(h.w, "#torana-body"));
    const before = h.eth.__calls.filter((m) => m === "eth_sendTransaction").length;
    H.click(h.w, "#torana-claim");
    await H.until(() => h.w.document.getElementById("ov-confirm").classList.contains("show"), 10000, "the confirm step");
    ok("TP3b · the confirm step names the claim and the network fee", /Claim my Torana/.test(txt(h.w, "#ov-confirm-title")) && /network fee/.test(txt(h.w, "#ov-confirm-body")));
    H.click(h.w, "#ov-confirm-go");
    await H.until(async () => (await c.nft.balanceOf(c.player.address)) === 1n, 30000, "the Torana to land");
    await H.until(() => txt(h.w, "#torana-arrived") === S6, 20000, "the arrived line").catch(() => {});
    const sent = h.eth.__calls.filter((m) => m === "eth_sendTransaction").length - before;
    const [st] = await c.claim.status(c.player.address);
    ok("TP4 · the click claims with ONE wallet prompt; the Torana is the buyer's; the panel then says '" + S6 + "'",
      sent === 1 && Number(st) === 2 && txt(h.w, "#torana-arrived") === S6, "prompts " + sent + " status " + st + " | " + txt(h.w, "#torana-body"));
    done(h.w); }

  // TP5 · right after a buy here → S1
  { const c = await chain(); await buyOnChain(c, 100); const h = await page(c, { ls: recentLs(c) }); await settled(h.w);
    ok("TP5 · within 10 minutes of a buy on this page: '" + S1 + "', and no button yet", txt(h.w, "#torana-onway") === S1 && !h.w.document.getElementById("torana-claim"), txt(h.w, "#torana-body")); done(h.w); }

  // TP6 · a holder
  { const c = await chain(); await buyOnChain(c, 100); await (await c.nft.mint(c.player.address)).wait(); const h = await page(c); await settled(h.w);
    ok("TP6 · a wallet that already holds a Torana (another road) sees NO panel", !panelShown(h.w), txt(h.w, "#torana-body")); done(h.w); }

  // TP7 · a wallet that refuses NFTs
  { const c = await chain(); await buyOnChain(c, 100);
    await c.provider.send("anvil_setCode", [c.player.address, "0x60006000fd"]);
    const h = await page(c); await settled(h.w);
    ok("TP7 · a wallet that would refuse the NFT (the simulation says so): '" + S5 + "', and NO button", txt(h.w, "#torana-cant") === S5 && !h.w.document.getElementById("torana-claim"), txt(h.w, "#torana-body"));
    done(h.w); await c.provider.send("anvil_setCode", [c.player.address, "0x"]); }

  // TP8 · claims switched off
  { const c = await chain(); await buyOnChain(c, 100); await (await c.nft.setMinter(c.addrs.claim, false)).wait(); const h = await page(c); await settled(h.w);
    ok("TP8 · claims switched OFF (setMinter(claim, false)): no button is offered (the click could only fail)", !h.w.document.getElementById("torana-claim") && !panelShown(h.w), txt(h.w, "#torana-body")); done(h.w); }

  // TP9 · the after-buy line, through the real buy panel
  async function afterBuy(usd, dashSrc) {
    const c = await chain(); const h = await page(c, { dashSrc });
    await H.until(() => !!h.w.document.getElementById("buy-go"), 20000, "the buy panel");
    h.w.document.getElementById("buy-amt").value = String(usd); h.w.document.getElementById("buy-amt").dispatchEvent(new h.w.Event("input"));
    H.click(h.w, "#buy-go");
    await H.until(() => !!h.w.document.getElementById("buy-done"), 40000, "the after-purchase panel");
    await H.until(() => !!h.w.document.getElementById("buy-torana"), 10000, "the Torana line").catch(() => {});
    const line = txt(h.w, "#buy-torana"); done(h.w); return line;
  }
  { const a = await afterBuy(100);
    ok("TP9 · a USD 100 buy through the panel: under 'Purchase complete' — '" + S1 + "'", a === S1, a);
    // the page's own minimum (MIN_BUY_USDT, ruled 2026-08-06) is USD 100, so every purchase made HERE qualifies and the
    // after-buy line is always S1; S2 is for wallets that bought less elsewhere (the contract's minimum is USD 1) — TP2
    const c = await chain(); const h = await page(c);
    await H.until(() => !!h.w.document.getElementById("buy-go"), 20000, "the buy panel");
    h.w.document.getElementById("buy-amt").value = "60"; h.w.document.getElementById("buy-amt").dispatchEvent(new h.w.Event("input"));
    const before = h.eth.__calls.filter((m) => m === "eth_sendTransaction").length;
    H.click(h.w, "#buy-go"); await H.sleep(1500);
    ok("TP9b · the page's USD 100 minimum: a USD 60 entry is refused before any prompt — so every buy made here earns 'on its way'",
      h.eth.__calls.filter((m) => m === "eth_sendTransaction").length === before && !h.w.document.getElementById("buy-done") && (await c.sale.presaleSpentUsdE18(c.player.address)) === 0n);
    done(h.w); }

  // ── M · breakages, each caught ──
  async function mutant(name, from, to, check) {
    if (DASH.split(from).length !== 2) { ok("M " + name + " — the target text was not found exactly once", false); return; }
    let caught; try { caught = await check(DASH.replace(from, to)); } catch (e) { caught = true; }
    ok("M " + name + " — caught", caught);
  }
  await mutant("1 · the 'can't receive' line dropped (the button offered to a wallet that refuses NFTs)",
    "if (data.toranaCant) h = \"<p class='win-note' id='torana-cant'>\" + esc(T_CANT) + \"</p>\";\n        else ", "",
    async (src) => { const c = await chain(); await buyOnChain(c, 100); await c.provider.send("anvil_setCode", [c.player.address, "0x60006000fd"]);
      const h = await page(c, { dashSrc: src }); await settled(h.w); const bad = !!h.w.document.getElementById("torana-claim"); done(h.w);
      await c.provider.send("anvil_setCode", [c.player.address, "0x"]); return bad; });
  await mutant("2 · the 'on its way' window dropped (a fresh buyer is told it hasn't arrived)", "else if (toranaRecent(me)) h = ", "else if (false) h = ",
    async (src) => { const c = await chain(); await buyOnChain(c, 100); const h = await page(c, { dashSrc: src, ls: recentLs(c) }); await settled(h.w);
      const bad = txt(h.w, "#torana-onway") !== S1; done(h.w); return bad; });
  await mutant("3 · the off-switch guard dropped (a button that can only fail)", "if (st.s === 0 && !data.toranaOff) {", "if (st.s === 0) {",
    async (src) => { const c = await chain(); await buyOnChain(c, 100); await (await c.nft.setMinter(c.addrs.claim, false)).wait();
      const h = await page(c, { dashSrc: src }); await settled(h.w); const bad = !!h.w.document.getElementById("torana-claim"); done(h.w); return bad; });
  await mutant("4 · the after-buy Torana line dropped", "if (line && done && !$(\"buy-torana\")) {", "if (false) {",
    async (src) => (await afterBuy(100, src)) !== S1);

  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("torana suite crashed:", e); process.exit(1); });
