"use strict";
// LINK-HOME-1 (2026-11-02) — NO SHIPPED SITE PAGE SENDS A PLAYER TO *.github.io. The owner found "← Back to the game" on
// /play/daily/ landing on the raw GitHub Pages address (the owner's username, off our domain). The game is OUR game: the
// site's free /game/ copy (GUEST-PLAY-1). Proven on the REAL tracked files (no chain), the rule:
//   · no link to a *.github.io address — <a href>, <iframe src>, <form action>, a refresh meta, data-href / dataset.href,
//     a location change (location = / .href = / .assign / .replace), window.open — in any shipped page, script or style;
//   · any other *.github.io URL is an ASSET LOAD of the free game's store (sangbaran-purr.github.io/divya-yuddha/assets/,
//     which the site does not copy — game/SNAPSHOT.md M-F4e) and nothing else;
//   · the three "← Back to the game" buttons go to the site's /game/ copy, stamped to game/STAMP.
// Breakages put the old link (and its cousins) back in memory: each must go red.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SITE = path.resolve(__dirname, "..", "..");
const R = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } }
const J = JSON.stringify;

// the shipped files: every tracked page/script/style Pages serves, plus the puzzle generator (its mail reaches the owner)
const SHIPPED = execFileSync("git", ["ls-files"], { cwd: SITE, encoding: "utf8" }).split("\n")
  .filter((f) => /\.(html|js|css)$/.test(f) && !/^(tests|tmp)\/|node_modules|^contracts\//.test(f));
const GH = /https?:\/\/[a-z0-9-]+\.github\.io[^\s'"`)<>]*/gi;
const ASSET = /^https:\/\/sangbaran-purr\.github\.io\/divya-yuddha\/assets\//;
// a player link: the URL sits in one of these contexts (looked at on the text just before it, same statement/tag)
const LINKCTX = [
  /<a\b[^>]*\bhref\s*=\s*["']?$/i, /<iframe\b[^>]*\bsrc\s*=\s*["']?$/i, /<form\b[^>]*\baction\s*=\s*["']?$/i,
  /http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url=$/i, /data-href\s*=\s*["']?$/i,
  /\.dataset\.href\s*=\s*["'`]$/, /\blocation(\.href)?\s*=\s*["'`]$/, /\blocation\.(assign|replace)\(\s*["'`]$/,
  /\bwindow\.open\(\s*["'`]$/, /\.(href|src)\s*=\s*["'`]$/,
];
// → [{ file, line, url, kind: "link" | "foreign" }] — every *.github.io URL that is a player link or not a game asset
function scan(files) {
  const bad = [];
  for (const f in files) {
    const lines = files[f].split("\n");
    lines.forEach((ln, i) => {
      let m; GH.lastIndex = 0;
      while ((m = GH.exec(ln))) {
        const before = ln.slice(Math.max(0, m.index - 200), m.index), url = m[0];
        // an asset's .src = (an image) is a load, not a link — but a non-asset .src/.href is caught as foreign anyway
        const link = LINKCTX.some((re, k) => re.test(before) && !(k === LINKCTX.length - 1 && ASSET.test(url) && /\.src\s*=\s*["'`]$/.test(before)));
        if (link) bad.push({ file: f, line: i + 1, url, kind: "link" });
        else if (!ASSET.test(url)) bad.push({ file: f, line: i + 1, url, kind: "foreign" });
      }
    });
  }
  return bad;
}
const show = (b) => b.slice(0, 6).map((x) => x.file + ":" + x.line + " " + x.kind + " " + x.url).join(" | ");

function run() {
  const files = {}; SHIPPED.forEach((f) => { files[f] = R(f); });
  const STAMP = R("game/STAMP").trim(), HREF = "../../game/index.html?v=" + STAMP;

  console.log("\n── LH · no shipped page links a player to *.github.io ──");
  const bad = scan(files);
  const all = []; for (const f in files) { const m = files[f].match(GH); if (m) all.push(...m); }
  ok("LH1 · " + SHIPPED.length + " shipped files scanned: no *.github.io link (href, iframe, form, refresh, data-href, location, window.open)",
    SHIPPED.length > 60 && SHIPPED.indexOf("game/index.html") >= 0 && SHIPPED.indexOf("play/daily/index.html") >= 0 && bad.filter((b) => b.kind === "link").length === 0, show(bad.filter((b) => b.kind === "link")));
  ok("LH2 · every other *.github.io URL (" + all.length + ") is an asset load from the free game's store (/divya-yuddha/assets/ — not copied to the site), nothing else",
    all.length > 0 && bad.filter((b) => b.kind === "foreign").length === 0, show(bad.filter((b) => b.kind === "foreign")));

  console.log("\n── LH · the three '← Back to the game' buttons go to the site's /game/ copy ──");
  const backs = [["play/daily/index.html", 1], ["play/smriti/index.html", 2]].map(([f, n]) => {
    const hrefs = (files[f].match(/<a\b[^>]*data-back-to-game[^>]*>/g) || []).map((t) => (t.match(/href="([^"]*)"/) || [])[1]);
    return { f, n, hrefs };
  });
  ok("LH3 · Daily Puzzle ×1 and Smriti ×2: each href is " + HREF + " → https://divyayuddha.games/game/index.html?v=" + STAMP,
    backs.every((b) => b.hrefs.length === b.n && b.hrefs.every((h) => h === HREF && new URL(h, "https://divyayuddha.games/" + b.f).href === "https://divyayuddha.games/game/index.html?v=" + STAMP)), J(backs));
  const BK = require(path.join(SITE, "play", "shared", "back.js"));
  ok("LH4 · the shared rule follows the button's own href (never a *.github.io address — even arriving from the old github.io game)",
    BK.target("https://sangbaran-purr.github.io/", "https://divyayuddha.games/play/daily/", HREF).url === "https://divyayuddha.games/game/index.html?v=" + STAMP
      && BK.target("", "https://divyayuddha.games/play/smriti/").url === "https://divyayuddha.games/game/index.html");

  console.log("\n── LH · breakages: each must go red ──");
  const breaks = [
    ["B1 · the old Daily Puzzle href put back", "play/daily/index.html", (s) => s.replace('href="' + HREF + '" data-back-to-game', 'href="https://sangbaran-purr.github.io/divya-yuddha/" data-back-to-game')],
    ["B2 · the old Smriti href put back", "play/smriti/index.html", (s) => s.replace('href="' + HREF + '" data-back-to-game', 'href="https://sangbaran-purr.github.io/divya-yuddha/" data-back-to-game')],
    ["B3 · back.js sends the player there by script", "play/shared/back.js", (s) => s.replace('else win.location.href = t.url;', 'else win.location.href = "https://sangbaran-purr.github.io/divya-yuddha/";')],
    ["B4 · a footer link to a game asset (still a link, still off our domain)", "index.html", (s) => s.replace("</body>", '<a href="https://sangbaran-purr.github.io/divya-yuddha/assets/img/menu_bg.jpg">art</a></body>')],
    ["B5 · a frame of the github.io game", "play/daily/page.js", (s) => s + '\nvar f = document.createElement("iframe"); f.src = "https://sangbaran-purr.github.io/divya-yuddha/index.html";\n'],
    ["B6 · the game copy's menu door relinked to github.io", "game/index.html", (s) => s.replace("dp.dataset.href = 'https://divyayuddha.games/play/daily/'", "dp.dataset.href = 'https://sangbaran-purr.github.io/divya-yuddha/'")],
    ["B7 · any other github.io page fetched (not an asset)", "play/smriti/player.js", (s) => s + '\nfetch("https://someone.github.io/page.json");\n'],
  ];
  for (const [name, f, mut] of breaks) {
    const m = Object.assign({}, files); m[f] = mut(files[f]);
    ok(name + " → red (" + f + ")", m[f] !== files[f] && scan(m).length > 0, "mutation did not apply or was not caught");
  }

  console.log("\n" + (fail ? "✖ " + fail + " FAILED of " + (pass + fail) : "ALL GREEN — " + pass + "/" + pass));
  process.exit(fail ? 1 : 0);
}
try { run(); } catch (e) { console.error("linkhome suite crashed:", e); process.exit(1); }
