"use strict";
// GROWTH-1 (owner rulings 2026-11-06) — THE LANDING'S COPY LAW. The landing page, every share preview and every share text
// carry NO crypto, token, DYC, NFT, wallet, earn, prize or price words. Proven on the REAL tracked files (no chain):
//   · the landing page (index.html) — every byte of it, comments included: nothing on the front door may say them;
//   · the share previews (title, meta description, og:*, twitter:*) of the ruled public pages — home, the game copy,
//     the Daily Puzzle, Smriti, the store — and of world.html, the old home page one click deeper;
//   · each of those pages carries a whole preview: title, description, a 1200×630 image that exists, its own URL, a large card;
//   · the ruled landing wording is present verbatim, the Play-free button goes to the stamped copy on the play-free route,
//     the counter is loaded, and the Daily Puzzle and Smriti may be indexed (#14);
//   · the game copy's GROWTH-1 lines (#18, #19) are the owner's words verbatim, and live only inside their marked block.
// Breakages put a forbidden word back in each place (and the noindex back): each must go red.
const fs = require("fs");
const path = require("path");

const SITE = path.resolve(__dirname, "..", "..");
const R = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } }
const J = JSON.stringify;

// THE FORBIDDEN WORDS (whole words, any case, their plain forms): crypto*, token(s), DYC, NFT(s), wallet(s),
// earn/earns/earned/earning(s), prize(s), price/priced/prices/pricing
const BANNED = /\b(crypto\w*|tokens?|dyc|nfts?|wallets?|earn(?:s|ed|ings?)?|prizes?|pric(?:e|ed|es|ing))\b/gi;
const hits = (t) => (String(t).match(BANNED) || []);

// the preview of a page: its <title>, its description, every og:* and twitter:* value
function preview(html) {
  const out = [];
  const t = /<title>([^<]*)<\/title>/i.exec(html); if (t) out.push(["title", t[1]]);
  const re = /<meta\s+(?:name|property)="((?:og|twitter):[a-z:_]+|description)"\s+content="([^"]*)"/gi;
  let m; while ((m = re.exec(html))) out.push([m[1], m[2]]);
  return out;
}
const meta = (html, key) => { const p = preview(html).filter((x) => x[0] === key); return p.length ? p[0][1] : null; };
// a JPEG's pixel size, from its SOF marker
function jpegSize(file) {
  const b = fs.readFileSync(file); let i = 2;
  while (i < b.length) { if (b[i] !== 0xff) return null; const mk = b[i + 1], len = b.readUInt16BE(i + 2);
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + len; }
  return null;
}

// the pages, as shipped
const PAGES = { "index.html": R("index.html"), "game/index.html": R("game/index.html"), "play/daily/index.html": R("play/daily/index.html"),
                "play/smriti/index.html": R("play/smriti/index.html"), "store.html": R("store.html"), "world.html": R("world.html"),
                "challenge/index.html": R("challenge/index.html") };   // SHARE-2 (owner rulings 2026-11-09): the page a challenge link opens
// ruling A6 (2026-11-06): the pages whose search text carries wallet/crypto wording stay out of search
const NOINDEX = ["dashboard.html", "mint.html", "my-invites.html", "register.html", "rite.html"];
NOINDEX.forEach((f) => { PAGES[f] = R(f); });
// GROWTH-1 Stage 2: the share texts and their labels live in these sources
const SHARE_SRC = ["play/daily/page.js", "play/smriti/page.js"];
SHARE_SRC.forEach((f) => { PAGES[f] = R(f); });
// every share-text and share-label line: the Daily/Smriti T entries (share/shareBtn/copied) and the game's challenge lines
function shareLines(P) {
  const out = [];
  SHARE_SRC.forEach((f) => P[f].split("\n").forEach((l) => { if (/^\s+(share|shareBtn|copied):/.test(l)) out.push(f + ": " + l.trim()); }));
  P["game/index.html"].split("\n").forEach((l) => { if (/const CHALLENGE_(TEXT|HEADING|CAPTION|ALT|WAYS) = |tt\.textContent='|toastMute\('Link copied'/.test(l)) out.push("game: " + l.trim().slice(0, 160)); });
  return out;
}
const URLS = { "index.html": "https://divyayuddha.games/", "game/index.html": "https://divyayuddha.games/game/", "play/daily/index.html": "https://divyayuddha.games/play/daily/",
               "play/smriti/index.html": "https://divyayuddha.games/play/smriti/", "store.html": "https://divyayuddha.games/store.html",
               "challenge/index.html": "https://divyayuddha.games/challenge/" };
// the checks, as a function of the files — so each breakage can be run against a mutated copy
function law(P) {
  const landing = hits(P["index.html"]);
  const prev = {}; for (const f in P) if (NOINDEX.indexOf(f) < 0) prev[f] = preview(P[f]).filter((x) => hits(x[1]).length).map((x) => x[0] + ": " + x[1]);
  return { landing, prev, previewsClean: Object.values(prev).every((a) => a.length === 0),
           noindex: ["play/daily/index.html", "play/smriti/index.html"].filter((f) => /<meta name="robots" content="[^"]*noindex/i.test(P[f])),
           share: shareLines(P).filter((l) => hits(l.replace(/^[^:]+: /, "").replace(/\/\/.*$/, "")).length),
           indexed: NOINDEX.filter((f) => !/<meta name="robots" content="noindex[^"]*"/i.test(P[f])) };
}

console.log("── GROWTH-1 · the landing's copy law ──");
const L = law(PAGES);
ok("LC1 · the landing page carries none of the forbidden words, comments included (" + L.landing.length + " found)", L.landing.length === 0, J(L.landing));
ok("LC2 · no share preview carries them — home, the game copy, the Daily Puzzle, Smriti, the store, and world.html", L.previewsClean, J(L.prev));
{
  const bad = [];
  for (const f in URLS) {
    const h = PAGES[f], img = meta(h, "og:image") || "", local = img.replace("https://divyayuddha.games/", "");
    const size = /^assets\/og\/og_[a-z]+\.jpg$/.test(local) && fs.existsSync(path.join(SITE, local)) ? jpegSize(path.join(SITE, local)) : null;
    const whole = meta(h, "title") && meta(h, "description") && meta(h, "og:title") && meta(h, "og:description") && meta(h, "og:url") === URLS[f]
      && meta(h, "twitter:card") === "summary_large_image" && size && size.w === 1200 && size.h === 630 && meta(h, "og:image:width") === "1200" && meta(h, "og:image:height") === "630";
    if (!whole) bad.push(f + " " + J({ img: local, size }));
  }
  ok("LC3 · each ruled public page has a whole preview: title, description, og title/description/url, a large card, and its own 1200×630 image that exists", bad.length === 0, bad.join(" · "));
  const imgs = Object.keys(URLS).map((f) => meta(PAGES[f], "og:image"));
  ok("LC4 · six pages, six images — no two share one (SHARE-2 added /challenge/)", new Set(imgs).size === 6, J(imgs));
}
{
  const h = PAGES["index.html"], text = h.replace(/<!--[\s\S]*?-->/g, "");
  const RULED = ["A free card battle game inspired by Indian mythology. Play in your browser.", "Play free — no download", "Explore the world of Divya Yuddha →", ">Store<",
                 'alt="Divya Yuddha — Battle of the Celestials"'];
  ok("LC5 · the ruled landing words are there verbatim: the sub-line, the button, the Explore link, the Store link, the logo's alt", RULED.every((s) => text.indexOf(s) >= 0), J(RULED.filter((s) => text.indexOf(s) < 0)));
  const stamp = R("game/STAMP").trim();
  ok("LC6 · Play free goes to the stamped game copy on the play-free route; Explore goes to world.html (the old home page); Store goes to the store",
    new RegExp('<a class="play" id="land-play" href="game/index\\.html\\?v=' + stamp + '&amp;play=free">').test(h) && /<a class="explore" href="world\.html">/.test(h) && /<a class="store" id="land-store" href="store\.html">/.test(h));
  ok("LC7 · the landing loads the player counter (#9), one stamp with the rest of the site", /<script src="play\/shared\/count\.js\?v=c3" defer><\/script>/.test(h));
}
ok("LC8 · the Daily Puzzle and Smriti may be indexed — no noindex left (#14)", L.noindex.length === 0, J(L.noindex));
ok("LC17 · ruling A6: dashboard, mint, my-invites, register and rite stay out of search (noindex)", L.indexed.length === 0, J(L.indexed));
{
  // the approved share texts, verbatim (the Daily and Smriti ones rendered from their own T functions)
  const tOf = (f) => { const m = /var T = (\{[\s\S]*?\n  \});/.exec(PAGES[f]); return m ? new Function("return " + m[1])() : {}; };
  const D = tOf("play/daily/page.js"), Sm = tOf("play/smriti/page.js");
  const game = PAGES["game/index.html"], ct = /const CHALLENGE_TEXT = "([^"]*)";/.exec(game);
  const texts = [D.share && D.share(23, 3), Sm.share && Sm.share("Easy", 14), ct && ct[1]];
  ok("LC18 · the three approved share texts, verbatim, and no forbidden word in any share text or label (" + shareLines(PAGES).length + " lines)",
    texts[0] === "Divya Yuddha Daily Puzzle #23 — solved in 3 tries. Can you find the winning play?" && texts[1] === "I cleared Smriti (Easy) in 14 tries. Beat me?"
      && texts[2] === "I beat the AI {score} in Divya Yuddha. Can you? Play free:" && L.share.length === 0 && texts.every((t) => t && hits(t).length === 0), J({ texts, bad: L.share }));
}
{
  const g = PAGES["game/index.html"], a = g.indexOf("<!-- DYW-GROWTH1-START"), b = g.indexOf("<!-- DYW-GROWTH1-END -->"), blk = a >= 0 && b > a ? g.slice(a, b) : "";
  const LINES = ["Ready for real opponents? Multiplayer opens with the Torana: USD 20, once.", ">See the Torana<", ">Not now<", '"unlock with the Torana"', '"Multiplayer: unlock with the Torana"'];
  ok("LC9 · the game copy's GROWTH-1 block carries the owner's words verbatim (#18 the door, #19 the nudge) — once, and only inside the block",
    LINES.every((s) => blk.indexOf(s) >= 0 && g.split(s).length === 2) && g.split("<!-- DYW-GROWTH1-START").length === 2);
}

{
  // SHARE-2 (owner rulings 2026-11-09) — /challenge/: the ruled preview words, kept out of search (followed), no counter, the
  // ruled fallback line; and the game copy's row: the heading and the five plain-text buttons, verbatim
  const c = PAGES["challenge/index.html"], ALT = 'Indra raising the Vajra beneath the Divya Yuddha logo, with the words &quot;Can you beat the AI?&quot;';
  ok("LC21 · /challenge/ carries the ruled words: title 'Can you beat the AI? — Divya Yuddha', og:title 'Can you beat the AI?', the ruled description, the image's alt, the fallback 'Continue to Divya Yuddha'; noindex, follow; no counter",
    meta(c, "title") === "Can you beat the AI? — Divya Yuddha" && meta(c, "og:title") === "Can you beat the AI?"
      && meta(c, "og:description") === "A free card battle game inspired by Indian mythology. Play in your browser." && meta(c, "description") === meta(c, "og:description")
      && meta(c, "og:image") === "https://divyayuddha.games/assets/og/og_challenge.jpg" && meta(c, "og:image:alt") === ALT && meta(c, "twitter:image:alt") === ALT
      && />Continue to Divya Yuddha<\/a>/.test(c) && /<meta name="robots" content="noindex, follow" \/>/.test(c) && c.indexOf("count.js") < 0 && !/http-equiv="refresh"/i.test(c));
  // the forward, run against a stand-in location: every tag of the visit kept, on to the landing page (../)
  const scripts = [...c.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const Q = "?utm_source=cc_test&utm_medium=share&utm_campaign=challenge";
  let went = null; const loc = { search: Q, hash: "", replace: (u) => { went = u; } };
  try { new Function("location", scripts[0])(loc); } catch (e) {}
  const a = { href: "../" }; try { new Function("location", "document", scripts[1])(loc, { getElementById: (id) => id === "ch-go" ? a : null }); } catch (e) {}
  ok("LC22 · /challenge/ forwards to the landing page keeping every tag (" + went + "), and its fallback link carries them too", scripts.length === 2 && went === "../" + Q && a.href === "../" + Q);
  const g = PAGES["game/index.html"];
  // SHARE-3 (owner rulings 2026-11-09): Option B — the approved heading (with the score), caption, preview alt, the official logos
  // (cross-linked to the free game's Pages by the sync), no names beside them, Messenger out
  // the logos are served by the site itself (assets/share/, byte-identical to the game's files) — never the free game's Pages
  const LOGO = "../assets/share/", GAME = path.join(process.env.HOME, "Projects", "divya-yuddha");
  const sameAsGame = ["facebook_logo_primary.png", "whatsapp_glyph_green.svg", "x_logo_white.svg"].every((f) => fs.existsSync(path.join(SITE, "assets/share", f))
    && (!fs.existsSync(path.join(GAME, "assets/img/brand", f)) || fs.readFileSync(path.join(SITE, "assets/share", f)).equals(fs.readFileSync(path.join(GAME, "assets/img/brand", f)))));
  ok("LC23 · the game copy's share panel: the approved heading and caption, the og_challenge preview with its approved alt, the three official logos served by the site (Facebook · WhatsApp · X, screen-reader labels only), Copy link and More, no Messenger; the link goes to /challenge/",
    g.indexOf('const CHALLENGE_HEADING = "You won {score}! Dare a friend to beat it.";') > 0 && g.indexOf('const CHALLENGE_CAPTION = "Your friend will see this";') > 0
      && g.indexOf("const CHALLENGE_ALT = 'Indra raising the Vajra beneath the Divya Yuddha logo, with the words \"Can you beat the AI?\"';") > 0
      && g.indexOf("const CHALLENGE_IMG = 'https://divyayuddha.games/assets/og/og_challenge.jpg';") > 0
      && g.indexOf("const CHALLENGE_WAYS = [['facebook','Facebook'], ['whatsapp','WhatsApp'], ['x','X'], ['copy','Copy link'], ['more','More']];") > 0
      && g.indexOf("const CHALLENGE_LOGOS = { facebook:'" + LOGO + "facebook_logo_primary.png', whatsapp:'" + LOGO + "whatsapp_glyph_green.svg', x:'" + LOGO + "x_logo_white.svg' };") > 0
      && g.indexOf("k.setAttribute('aria-label', label);") > 0 && !/messenger/i.test(g.slice(g.indexOf("const CHALLENGE_TEXT"), g.indexOf("function syncChallengeButton(")))
      && g.indexOf("https://divyayuddha.games/challenge/?utm_source=direct&utm_medium=share&utm_campaign=challenge") > 0
      && sameAsGame && g.indexOf("sangbaran-purr.github.io/divya-yuddha/assets/img/brand/facebook") < 0);
}

// ═══ THE GROWTH-1 BLOCK IN A REAL DOM (#7, #18, #19, #20) — the copy's injected block, its counter tag replaced by the source ═══
async function behaviour() {
  const { JSDOM } = require(path.join(SITE, "tests", "node_modules", "jsdom"));
  const g = PAGES["game/index.html"], gate = g.slice(g.indexOf("<!-- DYW-GATE-START"), g.indexOf("<!-- DYW-GATE-END -->"));
  const COUNT = R("play/shared/count.js").replace('var ENDPOINT = "https://count.divyayuddha.games/v1/events";', 'var ENDPOINT = "";');   // no network from the guard
  const head = gate.replace('<script src="../play/shared/count.js?v=c3"></script>', "<script>" + COUNT.replace(/<\/script/g, "<\\/script") + "</script>");
  const body = '<div id="landing"><button class="mode plaque-lg active" id="mode-mp"><div class="frame"><div class="face">Multiplayer<small class="cap">The Hall</small></div></div></button></div>'
             + '<div id="quests"><div class="q-intro">intro</div><div class="q-reward">reward</div></div>'
             + '<div id="diffdisclose"></div><script>function renderDiffSelector(){ document.getElementById("diffdisclose").textContent = "The AI plays loosely — a gentler fight to learn the war. Rewards ×0.8."; }<\/script>';
  function open(search, seed) {
    const dom = new JSDOM("<!doctype html><html><head><meta charset=\"utf-8\">" + head + "</head><body>" + body + "</body></html>",
      { url: "https://divyayuddha.games/game/index.html" + search, runScripts: "dangerously", pretendToBeVisual: true,
        beforeParse(w) { if (seed) w.localStorage.setItem("dy_player", JSON.stringify(seed)); } });
    return new Promise((res) => dom.window.addEventListener("load", () => res(dom.window)));
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  // a stranger who arrived from a creator's link
  const w = await open("?utm_source=cc_test&utm_medium=qa&utm_campaign=growth1");
  const mp = w.document.getElementById("mode-mp");
  w.renderDiffSelector();
  out.picker = w.document.getElementById("diffdisclose").textContent === "The AI plays loosely — a gentler fight to learn the war.";
  out.stranger = w.document.body.classList.contains("dyw-stranger") && w.getComputedStyle(w.document.querySelector(".q-reward")).display === "none" && w.getComputedStyle(w.document.querySelector(".q-intro")).display === "none";
  out.door = mp.querySelector(".cap").textContent === "unlock with the Torana" && mp.getAttribute("aria-label") === "Multiplayer: unlock with the Torana"
    && mp.dataset.href === "https://divyayuddha.games/store.html?utm_source=cc_test&utm_medium=qa&utm_campaign=growth1#bundle";
  w.DY_COUNT.finished("match"); w.DY_COUNT.finished("story"); w.DY_COUNT.finished("match"); await wait(1900);
  out.notYet = !w.document.getElementById("dyw-nudge");
  w.DY_COUNT.finished("match"); await wait(1900);
  const n = w.document.getElementById("dyw-nudge");
  out.third = !!n && n.querySelector("p").textContent === "Ready for real opponents? Multiplayer opens with the Torana: USD 20, once."
    && n.querySelector("#dyw-nudge-go").getAttribute("href") === "https://divyayuddha.games/store.html?utm_source=cc_test&utm_medium=qa&utm_campaign=growth1#bundle";
  if (n) n.querySelector("#dyw-nudge-no").click();
  w.DY_COUNT.finished("match"); await wait(1900);
  out.once = out.third && !w.document.getElementById("dyw-nudge");
  w.close();
  // a browser that has connected a wallet on the site: today's Hall door, the full Quests
  const seed = { v: 1, id: "AAAAAAAAAAAAAAAAAAAAAA", src: { s: "direct", m: null, c: null }, visitAt: Date.now(), visitDay: "2026-11-06", firstPlayDay: null, lastReturnDay: null, wallet: true, shares: { day: null, n: 0 } };
  const w2 = await open("", seed), mp2 = w2.document.getElementById("mode-mp");
  w2.renderDiffSelector();
  out.connected = w2.document.getElementById("diffdisclose").textContent === "The AI plays loosely — a gentler fight to learn the war. Rewards ×0.8." && !w2.document.body.classList.contains("dyw-stranger") && mp2.querySelector(".cap").textContent === "The Hall" && !mp2.dataset.href;
  w2.close();
  return out;
}

// ═══ THE SHARE LINK AND THE SHARE ITSELF (play/shared/share.js) ═══
async function shareRoad() {
  const SH = require(path.join(SITE, "play", "shared", "share.js"));
  const counter = (src) => ({ state: () => ({ id: "AbCdEfGhIjKlMnOpQrStUv", src: src }) });
  const tagged = counter({ s: "cc_test", m: "qa", c: "growth1" }), direct = counter({ s: "direct", m: null, c: null });
  const links = ["daily", "smriti", "challenge"].map((k) => SH.link(k, tagged));
  const out = {};
  out.links = J(links) === J(["https://divyayuddha.games/play/daily/?utm_source=cc_test&utm_medium=share&utm_campaign=daily",
                               "https://divyayuddha.games/play/smriti/?utm_source=cc_test&utm_medium=share&utm_campaign=smriti",
                               "https://divyayuddha.games/challenge/?utm_source=cc_test&utm_medium=share&utm_campaign=challenge"])
    && SH.link("daily", direct) === "https://divyayuddha.games/play/daily/?utm_source=direct&utm_medium=share&utm_campaign=daily"
    && SH.link("challenge", null) === "https://divyayuddha.games/challenge/?utm_source=direct&utm_medium=share&utm_campaign=challenge"
    && links.every((u) => u.indexOf("AbCdEfGhIjKlMnOpQrStUv") < 0 && !/[?&](id|player|uid)=/.test(u));
  const o = { text: "t", url: "u" }, copied = [];
  const sheet = { share: () => Promise.resolve() }, cancel = { share: () => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })) };
  const clip = { clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve(); } } };
  out.road = (await SH.share(o, { navigator: sheet })) === "shared" && (await SH.share(o, { navigator: cancel })) === "cancelled"
    && (await SH.share(o, { navigator: clip })) === "copied" && copied[0] === "t u"
    && (await SH.copy("t u", { navigator: clip })) === "copied" && copied[1] === "t u";   // SHARE-2: the game's Copy link road
  return out;
}

// ═══ BREAKAGES — each must turn the law red ═══
console.log("\n── the breakages (each must go red) ──");
const BREAK = [
  ["B1 · the landing says 'connect wallet'", "index.html", (s) => s.replace("Play free — no download", "Play free — connect wallet")],
  ["B2 · a comment on the landing names the coin (DYC)", "index.html", (s) => s.replace("</body>", "<!-- buy DYC --></body>")],
  ["B3 · the store's preview goes back to 'priced in DYC'", "store.html", (s) => s.replace(/(og:description" content=")[^"]*/, "$1Wave cards — priced in DYC")],
  ["B4 · the Daily Puzzle's preview promises a prize", "play/daily/index.html", (s) => s.replace(/(og:description" content=")[^"]*/, "$1Win a prize every day")],
  ["B5 · the game copy's preview says 'play to earn'", "game/index.html", (s) => s.replace(/(og:description" content=")[^"]*/, "$1Play to earn")],
  ["B6 · Smriti's title names an NFT", "play/smriti/index.html", (s) => s.replace(/<title>[^<]*<\/title>/, "<title>Smriti — NFT cards</title>")],
  ["B7 · world.html's preview says 'token'", "world.html", (s) => s.replace(/(og:title" content=")[^"]*/, "$1The token gate")],
  ["B8 · Smriti is hidden from search again", "play/smriti/index.html", (s) => s.replace("<title>", '<meta name="robots" content="noindex, nofollow" />\n    <title>')],
  ["B9 · the rite goes back into search", "rite.html", (s) => s.replace(/<meta name="robots" content="noindex" \/>[^\n]*\n/, "")],
  ["B10 · the Smriti share text promises to earn something", "play/smriti/page.js", (s) => s.replace('". Beat me?"', '". Beat me and earn more?"')],
  ["B11 · the game's challenge heading says 'prize'", "game/index.html", (s) => s.replace('"You won {score}! Dare a friend to beat it."', '"You won {score}! Dare a friend to beat it for a prize."')],
  ["B12 · a share-row button says 'earn'", "game/index.html", (s) => s.replace("['copy','Copy link']", "['copy','Copy link and earn']")],
  ["B13 · the /challenge/ preview promises a prize", "challenge/index.html", (s) => s.replace('og:title" content="Can you beat the AI?"', 'og:title" content="Can you beat the AI? Win a prize"')],
  ["B15 · the game's share text promises to earn", "game/index.html", (s) => s.replace('Can you? Play free:"', 'Can you? Play free and earn:"')],
  ["B14 · the /challenge/ image alt names the coin", "challenge/index.html", (s) => s.replace('og:image:alt" content="Indra', 'og:image:alt" content="DYC and Indra')],
];
for (const [name, file, mut] of BREAK) {
  const P2 = Object.assign({}, PAGES); P2[file] = mut(PAGES[file]);
  const m = law(P2), red = m.landing.length > 0 || !m.previewsClean || m.noindex.length > 0 || m.indexed.length > 0 || m.share.length > 0;
  ok(name + " → red", P2[file] !== PAGES[file] && red);
}

(async () => {
console.log("\n── the GROWTH-1 block in a real DOM ──");
const B = await behaviour();
ok("LC10 · #7 a stranger (no wallet ever connected) sees the Quests without their intro and reward lines", B.stranger);
ok("LC11 · #18/#20 a stranger's Multiplayer door reads 'unlock with the Torana' and goes to the store's bundle with the first-touch tags", B.door);
ok("LC12 · #19 two finished matches vs AI (and a story chapter) bring no nudge", B.notYet);
ok("LC13 · #19/#20 the 3rd finished match vs AI brings the ruled card, its button to the bundle with the first-touch tags", B.third);
ok("LC14 · #19 once per browser: dismissed, a 4th finish brings no second card", B.once);
ok("LC15 · a browser that has connected a wallet keeps today's Hall door, the full Quests and the picker's full line", B.connected);
ok("LC16 · ruling A5: a stranger's difficulty picker drops the reward multiplier ('Rewards ×0.8') and keeps the rest of the line", B.picker);
console.log("\n── GROWTH-1 Stage 2 · the share road ──");
const SR = await shareRoad();
ok("LC19 · #10 every shared link carries the sharer's first-touch source + utm_medium=share + its campaign (daily, smriti, challenge → /challenge/, SHARE-2); untagged = direct; no personal id", SR.links);
ok("LC20 · the share: the phone's sheet → shared; a cancelled sheet → cancelled (not counted); no sheet → the clipboard gets the text and the link; Copy link → the clipboard", SR.road);
console.log("\n" + (fail ? "✖ " + fail + " FAILED / " + pass + " passed" : "✓ ALL " + pass + " CHECKS PASS (the landing copy law)"));
process.exitCode = fail ? 1 : 0;
})();
