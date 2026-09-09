"use strict";
// P7 (DOM half) — the 8d line byte-identical DOC ↔ CODE ↔ RENDERED DOM, and a snapshot for the screenshot.
const fs = require("fs"), path = require("path"); const { ethers } = require("ethers"); const H = require("../lib.js");
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const SEL = ethers.id("openMatch(uint256,address,uint8)").slice(0, 10);

(async () => {
  const c = await H.chain(); const s = await H.server(c.escAddr, c.dycAddr);
  const { w, eth, net, dom } = await H.hall(s.url, c.escAddr, c.dycAddr, c.player, c.provider, {});
  const st = () => w.DYHall._state();
  await H.until(() => st().signedInAs && st().feedState === "live", 15000, "authed+live");
  const raw = eth.request.bind(eth);
  eth.request = async (a) => { const r = await raw(a); if (a.method === "eth_sendTransaction" && String((a.params[0] || {}).data || "").startsWith(SEL)) { net.block(); net.sever(); } return r; };
  H.click(w, '[data-act="open-sheet"]'); H.click(w, '[data-tier-row="bronze"]');
  H.click(w, '[data-faction="devas"]'); H.click(w, "[data-open-do]");
  await H.until(() => st().strand && w.document.querySelector(".hall-strand-line"), 30000, "affordance");

  // THE THREE FORMS
  const DOC_RAW = fs.readFileSync(path.join(H.SITE, "docs/LOBBY_DESIGN.md"), "utf8");
  const m = DOC_RAW.match(/"Your \[10\] DYC is locked in escrow, but the table has not\s+opened yet\."/);
  const DOC = m ? m[0].slice(1, -1).replace(/\s+/g, " ").replace("[10]", "10") : "(not found)";
  const HALL = fs.readFileSync(path.join(H.SITE, "mp/hall.js"), "utf8");
  const cm = HALL.match(/function STRAND_LOCKED\(stakeWei\)\s*\{\s*return "Your " \+ dycOf\(stakeWei\) \+ "([^"]+)";/);
  const CODE = cm ? ("Your 10" + cm[1]) : "(not found)";
  const DOM = w.document.querySelector(".hall-strand-line").textContent.replace(/\s+/g, " ").trim();

  console.log("  DOC : " + DOC);
  console.log("  CODE: " + CODE);
  console.log("  DOM : " + DOM);
  ok("DOC === CODE", DOC === CODE);
  ok("CODE === DOM", CODE === DOM);
  ok("DOC === DOM (byte-identical through all three)", DOC === DOM);
  ok("both ruled acts are present in the DOM", !!w.document.querySelector("[data-strand-finish]") && !!w.document.querySelector("[data-strand-cancel]"));

  // snapshot for the screenshot: the live sheet + the standing lobby line, with the real stylesheet
  const css = fs.readFileSync(path.join(H.SITE, "mp/hall.css"), "utf8");
  const sheetHTML = (w.document.getElementById("hall-sheet-host") || { innerHTML: "" }).innerHTML;
  const rootHTML = (w.document.getElementById("hall-root") || { innerHTML: "" }).innerHTML;
  fs.writeFileSync("/tmp/l3fix_affordance.html",
    "<!doctype html><meta charset=utf-8><title>S-HALL-L3-FIX-1 — the 8d affordance</title><style>" + css +
    "\nbody{background:#0b0906;margin:0;padding:18px;font-family:system-ui}</style><body>" + rootHTML + sheetHTML + "</body>");
  console.log("\n  snapshot → /tmp/l3fix_affordance.html");
  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR: " + e.stack); process.exit(1); });
