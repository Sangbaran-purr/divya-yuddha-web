"use strict";
// SITE-AUDIT-1 batch 1 — the mechanical fixes and the false statements, proven on the REAL files (no chain).
//   Explore's names come from the game's registries · the Mint reads the sale from chain (stubbed here) and wraps on a
//   phone · the game copy's Store roundel is relinked · /mp/ goes to the Hall · "1,000" parses · the copy is true.
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = path.resolve(__dirname, "..", "..");
const R = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const body = (html) => (html.split(/<body[^>]*>/)[1] || "").split("</body>")[0].replace(/<script[\s\S]*?<\/script>/g, "");

async function run() {
  // ═══ EX · EXPLORE — the game's own names ═══
  console.log("\n── EX · Explore's card names come from the game's registries ──");
  {
    const ctx = {}; ["js/cards-manifest.js", "js/cards.js", "js/wave-registry.js"].forEach((f) => new Function("window", R(f))(ctx));
    const want = {};
    for (const id in ctx.DY_WAVE_REGISTRY.byId) { const r = ctx.DY_WAVE_REGISTRY.byId[id]; if (r && r.art) want[r.art.replace(/\.png$/, "")] = r.name; }
    for (const id in ctx.DY_CARDS.byId) { const c = ctx.DY_CARDS.byId[id]; if (c && c.frame) want[c.frame.replace(/\.png$/, "")] = c.name; }
    const shown = {}; let figs = 0;
    for (const fac of ["devas", "asuras", "nagas", "vanaras"]) {
      const dom = new JSDOM(`<!doctype html><body>${body(R("explore.html"))}</body>`, { url: "https://divyayuddha.games/explore.html?f=" + fac, runScripts: "outside-only", pretendToBeVisual: true });
      const w = dom.window;
      ["js/cards-manifest.js", "js/cards.js", "js/wave-registry.js", "js/explore.js"].forEach((f) => w.eval(R(f)));
      w.DYExplore.mount();
      await sleep(50);
      w.document.querySelectorAll("figure").forEach((fig) => {
        figs++;
        const img = fig.querySelector("img"), cap = fig.querySelector("figcaption");
        const stem = img ? decodeURIComponent(img.getAttribute("src") || "").split("/").pop().replace(/_(320|720)\.jpg$/, "") : "";
        if (stem && cap) shown[stem] = cap.textContent;
      });
    }
    const wrong = Object.keys(shown).filter((st) => want[st] && shown[st] !== want[st]).map((st) => shown[st] + " ≠ " + want[st]);
    const covered = Object.keys(shown).filter((st) => want[st]).length;
    ok("EX1 · every card the registries know is captioned with the registry's name (" + covered + " of " + figs + " figures)",
       figs > 150 && covered >= 108 && wrong.length === 0, wrong.slice(0, 6).join(" | "));
    const caps = Object.values(shown);
    ok("EX2 · the 21 file-name misspellings are gone, and the game's short names stand",
       ["Drummer of the Host", "Throne of the Second King", "Rama's Signet", "Nahusha, Fallen King", "Dawn's Rebirth", "Ushas", "Saranyu", "Vishalakshi the Pale"]
         .every((n) => caps.indexOf(n) >= 0) &&
       !caps.some((c) => /Drummerofthe|Throneofthe|Ramas Signet|Dawns Rebirth|Ushas Dawn Herald|Saranyu Cloud Mare|Vishalakshithe/.test(c)));
    const ex = R("js/explore.js");
    ok("EX3 · the launch line no longer ties play to the Torana; the wave line names the Store; the badge reads LAUNCH SET",
       /"The founding cards — the full launch set, free to play solo\."/.test(ex) &&
       /Buy them in the Store or trade them in the Market, priced in DYC\./.test(ex) && /launch: "LAUNCH SET"/.test(ex) && !/"ACCESS"/.test(ex));
  }

  // ═══ MN · THE MINT — the sale read from chain, the phone layout, the live Hall card ═══
  console.log("\n── MN · the Mint reads the sale and fits a phone ──");
  const mintPage = async (answer) => {
    const dom = new JSDOM(`<!doctype html><body>${body(R("mint.html"))}</body>`, { url: "https://divyayuddha.games/mint.html", runScripts: "outside-only" });
    const w = dom.window;
    w.fetch = function (u, init) {
      const q = JSON.parse(init.body), d = q.params[0].data;
      if (answer === "down") return Promise.reject(new TypeError("Failed to fetch"));
      const v = d === "0x8a19c8bc" ? BigInt(answer.round) : d === "0xa624c6dc" ? 8000000000000000n : 10000000000000000n;
      return Promise.resolve({ json: () => Promise.resolve({ jsonrpc: "2.0", id: 1, result: "0x" + v.toString(16).padStart(64, "0") }) });
    };
    ["config.js", "mf-config.js", "js/mintstatus.js"].forEach((f) => w.eval(R(f)));
    await w.DYMintStatus.mount();
    const t = (id) => (w.document.getElementById(id) || {}).textContent || "";
    return { status: t("mint-status"), price: t("mint-price"), dates: t("mint-dates"), foot: t("mint-foot-title") + " | " + t("mint-foot-copy") };
  };
  {
    const r1 = await mintPage({ round: 1 });
    ok("MN1 · round 1 on chain → 'presale open · $0.008 per DYC (public round $0.010)', and the foot points to the dashboard",
       /presale open · \$0\.008 per DYC \(public round \$0\.010\)/.test(r1.status) && /Presale \$0\.008 per DYC · public round \$0\.010 per DYC/.test(r1.price) &&
       /The Mint Is Open/.test(r1.foot) && /buy DYC in your dashboard/.test(r1.foot), JSON.stringify(r1));
    const r2 = await mintPage({ round: 2 });
    ok("MN2 · round 2 → 'public sale open · $0.010 per DYC'", /public sale open · \$0\.010 per DYC/.test(r2.status), r2.status);
    const r0 = await mintPage({ round: 0 });
    ok("MN3 · round 0 → 'not open right now' (never a fake open)", /not open right now/.test(r0.status) && /The Mint Awaits Its Hour/.test(r0.foot), r0.status);
    const rd = await mintPage("down");
    ok("MN4 · the chain unreadable → the honest fallback stands ('see your dashboard'), nothing invented",
       /see your dashboard/.test(rd.status) && /Read live from the sale contract/.test(rd.price), rd.status);
    ok("MN5 · nothing about the sale round or its price is hard-coded in the Mint's HTML (the cash-out desk's own 0.010 is a different rate)",
       !/\$0\.0|presale open|public sale open|announced at sale-open/i.test(R("mint.html").replace(/<!--[\s\S]*?-->/g, "")));
  }
  {
    const m = R("mint.html");
    ok("MN6 · on a phone (≤560px) the section titles WRAP — no nowrap heading pushes the page past 375px",
       /@media \(max-width:560px\)\{\.mint-body \.rule-title\{gap:10px\}\.mint-body \.rule-title h2\{white-space:normal;[^}]*\}\}/.test(m));
    ok("MN7 · the tables card is live ('It Sits at the Tables' / LIVE NOW), ACTIVATE TO EARN → dashboard, the internal kicker is gone",
       /<h3>It Sits at the Tables<\/h3>/.test(m) && /<span class="phase">LIVE NOW<\/span>/.test(m) && /href="dashboard\.html">ACTIVATE TO EARN</.test(m) &&
       m.indexOf("numbers awaiting the owner's word") < 0);
    // owner ruling A (2026-10-11): the vesting duration on the Mint is the contract's — two years (730 days) — and no other
    const mv = R("mint.html").replace(/<!--[\s\S]*?-->/g, "");
    const durations = (mv.match(/\b(\d+|one|two|three|eighteen|twenty|twenty-four)[ -](months?|years?|days?)\b/gi) || []).filter((d) => !/^two years?$/i.test(d));
    ok("MN9 · the Mint states vesting as the contract's two years — no '20 months' and no other duration on the page",
       mv.indexOf("85% vests linearly across the two years after exchange listing.") >= 0 && !/20 months/i.test(mv) && durations.length === 0, durations.join(", "));
    ok("MN8 · Station I asks for what the form asks (name, email, wallet address); the nav reads 'Play free / connect wallet'",
       /<h3>Register <small>three details, kept off the chain<\/small><\/h3>/.test(m) && /<b>name, email and wallet address<\/b>/.test(m) &&
       /<a class="rite-btn" href="rite\.html">Play free<span class="sub">connect wallet<\/span><\/a>/.test(m) && m.indexOf("phone, address") < 0);
  }

  // ═══ GM · THE GAME COPY'S STORE ROUNDEL ═══
  console.log("\n── GM · the game copy's Store roundel goes to the live Store ──");
  {
    const g = R("game/index.html");
    const s3 = (g.match(/<!-- DYW-S3-SUPPRESS-START[\s\S]*?<!-- DYW-S3-SUPPRESS-END -->/) || [""])[0];
    const code = (s3.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
    const navs = []; const vc = new VirtualConsole(); vc.on("jsdomError", (e) => { if (/navigation/.test(e.message)) navs.push(1); });
    const dom = new JSDOM(`<!doctype html><body><div class="roundels"><button class="roundel locked" data-soon title="Store — coming soon"><svg></svg><span class="rlock">🔒</span></button>
      <button class="roundel locked" data-soon title="Decks — coming soon"><span class="rlock">🔒</span></button></div></body>`,
      { url: "https://divyayuddha.games/game/index.html?v=1fad925", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window; let toasts = 0;
    w.eval(code);
    w.document.querySelectorAll("[data-soon]").forEach((b) => { b.onclick = () => toasts++; });   // the game's own "Coming soon" handler
    await sleep(60);
    const store = w.document.querySelector('.roundel[title^="Store"]'), decks = w.document.querySelector('.roundel[title^="Decks"]');
    ok("GM1 · the Store roundel is unlocked and titled 'Store' (the Decks roundel is untouched)",
       store && store.title === "Store" && !store.classList.contains("locked") && !store.querySelector(".rlock") && decks.classList.contains("locked"));
    store.querySelector("svg").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await sleep(30);
    ok("GM2 · tapping it NAVIGATES (to the store) and the game's 'Coming soon' toast never fires", navs.length === 1 && toasts === 0, "navs " + navs.length + " toasts " + toasts);
    const block = (t) => (t.match(/<!-- DYW-S3-SUPPRESS-START[\s\S]*?<!-- DYW-S3-SUPPRESS-END -->/) || [""])[0];
    ok("GM3 · the copy's S3 block is BYTE-IDENTICAL to what the sync script injects (re-applied every sync, never hand-edited)",
       block(R("scripts/sync_game.sh")).length > 500 && block(R("scripts/sync_game.sh")) === block(g) && block(g).indexOf("(6) SITE-AUDIT-1") >= 0 &&
       R("game/STAMP").trim() === "1fad925");
    // MINI-GAMES-1 — the Daily Puzzle door on the game's main menu (owner ruling 2026-10-14: found from the game only)
    const btn = (g.match(/<button class="mode plaque-lg active" id="mode-daily">[\s\S]*?<\/button>/) || [""])[0];
    const door = (g.match(/\(function\(\)\{\n  var dp = document\.getElementById\('mode-daily'\);[\s\S]*?\n\}\)\(\);/) || [""])[0];
    const run = (demo) => {
      const navs = []; const vc2 = new VirtualConsole(); vc2.on("jsdomError", (e) => { if (/navigation/.test(e.message)) navs.push(e.message); });
      const d = new JSDOM("<!doctype html><body><div id='landing'>" + btn + "</div></body>", { url: "https://divyayuddha.games/game/index.html?v=1fad925", runScripts: "outside-only", virtualConsole: vc2 });
      if (demo) d.window.sessionStorage.setItem("dyw_demo", "1");
      d.window.eval(door);
      const b = d.window.document.getElementById("mode-daily");
      if (b) b.click();
      return { b: b, navs: navs };
    };
    const live = run(false), demoRun = run(true);
    ok("GM4 · the game copy's main menu carries the Daily Puzzle plaque ('Daily Puzzle' / 'A new puzzle every day'), and tapping it opens https://divyayuddha.games/play/daily/ in the SAME tab",
       /Daily Puzzle<small class="cap">A new puzzle every day<\/small>/.test(btn) && live.b && live.b.dataset.href === "https://divyayuddha.games/play/daily/"
         && live.navs.length === 1 && /location\.href = dp\.dataset\.href/.test(door) && !/window\.open|_blank/.test(door), JSON.stringify(live.navs));
    ok("GM5 · inside the site's demo the Daily Puzzle plaque is not shown (the demo keeps its face, like Multiplayer)", !demoRun.b && demoRun.navs.length === 0);
  }

  // ═══ SY · THE SYNC'S ENTRY-LINK LEDGER COVERS EVERY PAGE THAT LINKS THE GAME (owner ruling 2026-10-15) ═══
  console.log("\n── SY · every page that links the game is re-stamped by the sync ──");
  {
    const sh = R("scripts/sync_game.sh");
    const listed = ((sh.match(/^ENTRY_FILES="([^"]*)"/m) || [])[1] || "").split(/\s+/).filter(Boolean).map((f) => f.replace("$SITE_REPO/", "")).sort();
    // every tracked page/script OUTSIDE the game copy, the tests and mp/ (the Hall reads game/STAMP — no stamped link of its own)
    const tracked = require("child_process").execFileSync("git", ["ls-files"], { cwd: SITE, encoding: "utf8" }).split("\n")
      .filter((f) => /\.(html|js)$/.test(f) && !/^(game|tests|mp|tmp)\/|node_modules/.test(f) && f !== "play/daily/page.js");   // the Daily Puzzle frames the copy reading game/STAMP, as the Hall does — no stamped link of its own
    const linking = tracked.filter((f) => R(f).indexOf("game/index.html") >= 0).sort();
    const missing = linking.filter((f) => listed.indexOf(f) < 0), stale = listed.filter((f) => linking.indexOf(f) < 0);
    ok("SY1 · every site page that links the game (" + linking.length + ") is in sync_game.sh's ENTRY_FILES, and the list names no page that doesn't — a new page can't be left behind",
       linking.length >= 10 && missing.length === 0 && stale.length === 0, "missing: " + missing.join(",") + " stale: " + stale.join(","));
    const count = listed.reduce((n, f) => n + (R(f).match(/game\/index\.html/g) || []).length, 0);
    const guard = Number((sh.match(/if \[ "\$LINKS_BEFORE" != "(\d+)" \]/) || [])[1]);
    ok("SY2 · the sync's guarded link count (" + guard + ") equals the links those pages really carry, all stamped to the current copy (" + R("game/STAMP").trim() + ")",
       count === guard && listed.every((f) => (R(f).match(/game\/index\.html(\?v=[0-9a-f]+)?/g) || []).every((m) => m === "game/index.html?v=" + R("game/STAMP").trim())), count + " vs " + guard);
  }

  // ═══ MP · /mp/ GOES TO THE HALL ═══
  console.log("\n── MP · /mp/ ──");
  {
    const m = R("mp/index.html");
    ok("MP1 · /mp/ redirects to the Hall (meta refresh for scripts-off, location.replace otherwise)",
       /<meta http-equiv="refresh" content="0; url=hall\.html">/.test(m) && /location\.replace\("hall\.html"\)/.test(m) && m.indexOf("dark test") < 0);
    ok("MP2 · the developer rig still lives, at mp/rig.html", /dark test/i.test(R("mp/rig.html")));
  }

  // ═══ HS · THE HALL'S FRIEND STAKE ═══
  console.log("\n── HS · the friend stake reads digit grouping ──");
  {
    const h = R("mp/hall.js");
    const fn = new Function((h.match(/function parseStakeInput\(str\) \{[\s\S]*?\n  \}/) || [""])[0] + "; return parseStakeInput;")();
    ok("HS1 · '1,000', '1 000', '10000' and '50' parse; 'abc' and '' do not",
       fn("1,000") === 1000n && fn("1 000") === 1000n && fn("10000") === 10000n && fn("50") === 50n && fn("abc") === 0n && fn("") === 0n && fn("1,0x0") === 0n);
    ok("HS2 · the friend-table road uses it", /var n = parseStakeInput\(stakeStr\);/.test(h));
  }

  // ═══ TX · THE PAGES SAY TRUE THINGS ═══
  console.log("\n── TX · the corrected copy ──");
  const vis = (f) => R(f).replace(/<!--[\s\S]*?-->/g, "");
  {
    const d = vis("dashboard.html"), dj = R("js/dashboard.js");
    ok("TX1 · dashboard: no faucet link — a plain POL line instead", d.indexOf("faucet.polygon") < 0 &&
       d.indexOf("Buy a little POL on an exchange that supports Polygon, or swap for it in your wallet.") >= 0);
    ok("TX2 · dashboard: the drop says POL pays the fee; no 'affiliate' cash-out lines; the two rates are explained",
       dj.indexOf("no approval needed, just a little POL for the network fee.") >= 0 && dj.indexOf("for this region") < 0 &&
       dj.indexOf("Cash payouts are made through the affiliate platform") < 0 &&
       dj.indexOf("Cash-out is closed for now — the USDT reserve is empty. Your collected rewards stay safe and playable.") >= 0 &&
       dj.indexOf("the fixed rate for staking rewards. (Game winnings and invite rewards withdraw at 0.008 on the Withdraw card.)") >= 0);
    const t = R("treasury.html"), tj = R("js/treasury.js");
    ok("TX3 · treasury: the Torana is named, sold in the store (not forged at the rite); the filters are labelled",
       ["Devas", "Asuras", "Vanaras", "Nagas"].every((f) => t.indexOf('title="Show ' + f + ' cards" aria-label="Show ' + f + ' cards"') >= 0) &&
       tj.indexOf("Torana — your Access Card") >= 0 && tj.indexOf('href="store.html#bundle">Get it in the store: a Torana and 500 DYC for USD 20.') >= 0 &&
       tj.indexOf("Forge") < 0 && tj.indexOf("the mark is lit") < 0);
    ok("TX4 · store: no wallet → install a wallet (never 'forge your key at the rite')",
       R("js/store.js").indexOf("No wallet in this browser — you may still browse. Install a wallet to buy.") >= 0);
    const rj = R("js/report.js");
    ok("TX5 · report: redeemed DYC 'returned to the pool'; a failed read says refresh, not 'the contract address may be wrong'",
       rj.indexOf("Total redeemed — DYC returned to the pool") >= 0 && rj.indexOf("Could not read the sale right now — refresh to retry.") >= 0);
    const g = R("register.html");
    ok("TX6 · register: name/email/wallet required (the live form's three); 'your presale approval shows on The Rite'; presale buyers get a Torana",
       g.indexOf("(your <b>name</b>, <b>email</b> and <b>wallet address</b> are required)") >= 0 &&
       g.indexOf("your presale approval shows on <a href=\"rite.html\">The Rite →</a>") >= 0 && g.indexOf("Presale buyers also receive a Torana.") >= 0);
    const ix = vis("index.html");
    ok("TX7 · index: 'Get a Torana' → the store bundle; the Rite card and meta no longer call it free; staking and cards are told true",
       /<h2 class="doorway-title">Get a Torana<\/h2>/.test(ix) && /href="store\.html#bundle"[^>]*>Get a Torana/.test(ix) &&
       ix.indexOf("Free, one per hand") < 0 && ix.indexOf("One free Access token") < 0 && ix.indexOf("staking when it opens") < 0 &&
       ix.indexOf("earn them at the table") < 0 && ix.indexOf("The play-token is reward alone") < 0 &&
       /content="Play Divya Yuddha free, solo\. Own the cards\. The Torana opens multiplayer\."/.test(ix));
    ok("TX8 · index: connected → 'Connected' + 'play solo — free' to the rite (no dead end)",
       /<span class="declared">Connected<\/span>/.test(R("index.html")) && /doorwaySub\.innerHTML = '<a href="rite\.html">play solo — free<\/a>'/.test(R("index.html")));
    const rt = vis("rite.html");
    ok("TX9 · rite meta/og: free solo + the Torana opens multiplayer (no 'free Access token')", rt.indexOf("free Access token") < 0 &&
       /<meta name="description" content="Connect a Polygon wallet to play Divya Yuddha free\./.test(rt) && /<meta property="og:description" content="Play free, solo\. The Torana opens multiplayer\."/.test(rt));
  }

  console.log("\n" + (fail ? "✖ " + fail + " FAILED of " + (pass + fail) : "ALL GREEN — " + pass + "/" + pass));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("siteaudit suite crashed:", e); process.exit(1); });
