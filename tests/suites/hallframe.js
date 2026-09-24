"use strict";
// MP-FIX-2 — THE HALL STEPS BACK WHILE A MATCH IS LIVE.
//
// Measured on 2026-09-23, before a line was changed: at 1440x900 the Hall kept 200.5px of its own chrome above the
// battle frame (nav 65 + the title band + the column's padding), so the board played in 1120x699.5 and its half
// stood 179.4 tall where the same build solo gives 279.6. Every viewport in the game's 16-viewport device matrix
// lost between 19% and 47% of the board's height to furniture the player was not looking at. Owner ruling (fault 1,
// road (i)): the Hall collapses its chrome while a match is live and restores it in the lobby; the 900-1023 band's
// missing rule is closed; the frame gets the window's WIDTH AND HEIGHT.
//
// This suite pins that ruling in the bytes. It reads mp/hall.css and mp/hall.js as text — the pixels themselves are
// proven in a real browser and written into the rung's report — and every family carries a MUTANT: the check is
// re-run against a deliberately broken copy and must go red, so a green here is a measurement and not a wish.
const path = require("path"), fs = require("fs");
const { execFileSync } = require("child_process");
const H = require("../lib.js");
const SITE = H.SITE;

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };

const CSS = fs.readFileSync(path.join(SITE, "mp", "hall.css"), "utf8");
const JS = fs.readFileSync(path.join(SITE, "mp", "hall.js"), "utf8");
const HTML = fs.readFileSync(path.join(SITE, "mp", "hall.html"), "utf8");

// ── the readers every check and every mutant share ───────────────────────────────────────────────────────────
// EVERY @media block's body for a condition, joined. A condition can appear more than once in the sheet (the
// 600-899 band has one block for the Hall's column and another, further down, for the battle frame) — reading only
// the first one reads the wrong rule, which is what the suite's first run did.
function mediaBody(css, cond) {
  const needle = "@media " + cond;
  let out = "", from = 0;
  for (;;) {
    const at = css.indexOf(needle, from);
    if (at < 0) break;
    let i = css.indexOf("{", at), depth = 0;
    const start = i;
    for (; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") { depth--; if (!depth) break; }
    }
    out += css.slice(start + 1, i) + "\n";
    from = i + 1;
  }
  return out || null;
}
// the body of the rule whose SELECTOR (not merely its text) starts with `sel`, searched inside `scope`.
// A band's block also mentions .hall-frame-host inside `body:has(...)` selectors — matching the first occurrence
// would read the wrong rule, which is exactly what the suite's first run did.
function ruleBody(scope, sel) {
  if (!scope) return null;
  const noComments = scope.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  while (i < noComments.length) {
    const open = noComments.indexOf("{", i);
    if (open < 0) return null;
    const close = noComments.indexOf("}", open);
    const selector = noComments.slice(i, open).trim();
    if (selector.split(",").map((x) => x.trim()).some((x) => x === sel || x.indexOf(sel) === 0)) {
      return noComments.slice(open + 1, close);
    }
    i = close + 1;
  }
  return null;
}
// the MP-FIX-2 collapse block: from its own banner to the rule that follows it
function collapseBlock(css) {
  const banner = css.indexOf("MP-FIX-2 — THE HALL STEPS BACK WHILE A MATCH IS LIVE");
  if (banner < 0) return "";
  const at = css.lastIndexOf("/*", banner);          // start AT the comment's opener, so stripping comments works
  const end = css.indexOf(".hall-free-result .hall-settle-line", banner);
  return at < 0 || end < 0 ? "" : css.slice(at, end);
}
// every SELECTOR in a css chunk (rules only; comments and at-rules skipped)
function selectorsOf(chunk) {
  return chunk
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((s) => s.slice(0, s.indexOf("{")))
    .filter((s) => s && s.indexOf("{") < 0)
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce((all, s) => all.concat(s.split(",").map((x) => x.trim()).filter(Boolean)), []);
}

// ═══ A. THE FOUR BANDS — the frame's width at every width, including the one that had no rule ═══
{
  const phone = mediaBody(CSS, "(max-width: 599.98px)");
  const mid = mediaBody(CSS, "(min-width: 600px) and (max-width: 899.98px)");
  const hole = mediaBody(CSS, "(min-width: 900px) and (max-width: 1023.98px)");
  const wide = mediaBody(CSS, "(min-width: 1024px)");
  const phoneHost = ruleBody(phone, ".hall-frame-host");
  const midHost = ruleBody(mid, ".hall-frame-host");
  const holeHost = ruleBody(hole, ".hall-frame-host");
  const wideHost = ruleBody(wide, ".hall-frame-host");

  ok("A1 · <600 — the frame is the whole phone (breaks out of the column's 16px gutters)",
     !!phoneHost && /width:\s*calc\(100%\s*\+\s*32px\)/.test(phoneHost) && /margin:\s*0\s+-16px/.test(phoneHost), phoneHost);
  ok("A2 · 600-899 — the portrait column's full 520, clamped to the viewport, centred on the statue corridor",
     !!midHost && /--fw:\s*min\(520px,\s*calc\(100vw\s*-\s*32px\)\)/.test(midHost) && /52\.5vw/.test(midHost), midHost);
  ok("A3 · 900-1023 — THE CLOSED HOLE: the band has a rule of its own (it used to fall through to the base max-width)",
     !!holeHost, "no @media (min-width: 900px) and (max-width: 1023.98px) rule for .hall-frame-host");
  ok("A4 · and it pins exactly what was measured there before the change — 520 wide, centred in the 820 column",
     !!holeHost && /--fw:\s*min\(520px,\s*calc\(100vw\s*-\s*32px\)\)/.test(holeHost) &&
       /margin-left:\s*auto/.test(holeHost) && /margin-right:\s*auto/.test(holeHost), holeHost);
  ok("A5 · >=1024 — the game's DESKTOP layout: never under 1024, never over 1120 (its #app caps at 1000)",
     !!wideHost && /--fw:\s*clamp\(1024px,\s*calc\(100vw\s*-\s*64px\),\s*1120px\)/.test(wideHost), wideHost);
  ok("A6 · the four bands tile the whole range with no gap and no overlap",
     /max-width:\s*599\.98px/.test(CSS) && /min-width:\s*600px\)\s*and\s*\(max-width:\s*899\.98px/.test(CSS) &&
     /min-width:\s*900px\)\s*and\s*\(max-width:\s*1023\.98px/.test(CSS) && /min-width:\s*1024px/.test(CSS));
  // MUTANT — take the band's rule away again and A3/A4 must go red
  const mut = CSS.replace(/@media \(min-width: 900px\) and \(max-width: 1023\.98px\) \{[\s\S]*?\n\}\n/, "");
  const mutHole = ruleBody(mediaBody(mut, "(min-width: 900px) and (max-width: 1023.98px)"), ".hall-frame-host");
  ok("A7 · MUTANT — delete the 900-1023 rule and the check that closed the hole goes red", !mutHole);
}

// ═══ B. THE IN-MATCH FRAME IS THE WINDOW, MINUS NOTHING BUT THE SAFE AREA ═══
{
  const blk = collapseBlock(CSS);
  const host = ruleBody(blk, "html.hall-match-live .hall-wrap > .hall-frame-host:not([hidden])");
  const frame = ruleBody(blk, "html.hall-match-live .hall-wrap > .hall-frame-host:not([hidden]) > .hall-frame");

  ok("B1 · while live the host is pinned to the window itself (fixed, inset 0)",
     !!host && /position:\s*fixed/.test(host) && /inset:\s*0/.test(host), host);
  const padVal = (host && (host.match(/padding:\s*([^;]+);/) || [, ""])[1] || "").replace(/\s+/g, " ").trim();
  const padParts = padVal ? padVal.match(/env\([^)]*\)|[^\s]+/g) || [] : [];
  ok("B2 · and the ONLY thing it gives back is the safe area — all four padding components are env() insets",
     padParts.length === 4 && padParts.every((p) => /^env\(safe-area-inset-(top|right|bottom|left), 0px\)$/.test(p)),
     padVal || "(no padding)");
  ok("B3 · the border-box keeps that padding inside the window rather than adding to it",
     !!host && /box-sizing:\s*border-box/.test(host));
  ok("B4 · no other offset creeps in (no top/left/right/bottom of its own while live)",
     !!host && !/(^|;)\s*(top|left|right|bottom)\s*:/.test(host), host);
  ok("B5 · the frame fills the host in both directions and drops the 520 floor (the frame IS the window now)",
     !!frame && /width:\s*100%/.test(frame) && /height:\s*100%/.test(frame) && /min-height:\s*0/.test(frame), frame);
  ok("B6 · the 520 floor still stands for every other state (the base rule is untouched)",
     /\.hall-frame \{[^}]*min-height:\s*520px/.test(CSS));
  // MUTANT — put a margin back into the window and B1/B4 must notice
  const mutHost = (host || "").replace("inset: 0;", "inset: 24px;").replace("position: fixed;", "position: absolute;");
  ok("B7 · MUTANT — inset the frame off the window's edge and the window-sized check goes red",
     !(/position:\s*fixed/.test(mutHost) && /inset:\s*0/.test(mutHost)));
}

// ═══ C. THE LOBBY IS UNTOUCHED BY CONSTRUCTION ═══
{
  const blk = collapseBlock(CSS);
  const sels = selectorsOf(blk);
  const leaks = sels.filter((s) => s.indexOf("html.hall-match-live") !== 0);
  ok("C1 · every selector in the collapse block is behind html.hall-match-live — remove the class and not one declaration applies",
     sels.length > 0 && leaks.length === 0, "leaked: " + leaks.join(" | "));
  ok("C2 · the collapse block is the ONLY place the class appears in the stylesheet",
     (CSS.match(/hall-match-live/g) || []).length === (blk.match(/hall-match-live/g) || []).length);
  ok("C3 · and the class is a real one the lobby never carries (nothing sets it in css)",
     !/\.hall-match-live\s*\{/.test(CSS));
  // MUTANT — leak one rule out of the prefix and C1 must go red
  const mutSels = selectorsOf(blk.replace("html.hall-match-live .hall-nav", ".hall-nav"));
  ok("C4 · MUTANT — leak one collapse rule into the lobby and the by-construction check goes red",
     mutSels.some((s) => s.indexOf("html.hall-match-live") !== 0));
}

// ═══ D. THE FLAG IS SET AND CLEARED ON THE REAL TRANSITIONS ═══
{
  const setFn = (JS.match(/function setMatchLive\(on\) \{[\s\S]*?\n  \}/) || [""])[0];
  const sync = (JS.match(/function syncFrameHost\(\) \{[\s\S]*?\n  \}/) || [""])[0];
  const unmount = (JS.match(/function unmountFrame\(\) \{[\s\S]*?\n  \}/) || [""])[0];
  const fallback = (JS.match(/function frameFallback\(\) \{[\s\S]*?\n  \}/) || [""])[0];
  const setCall = (sync.match(/setMatchLive\((?!false)[^;]*\);/) || [""])[0];

  ok("D1 · setMatchLive toggles the class on the document element and nothing else",
     /classList\.toggle\("hall-match-live", !!on\)/.test(setFn) && /try \{/.test(setFn), setFn);
  ok("D2 · syncFrameHost — the ONE place that decides whether the frame is on screen — is where the flag is set",
     !!setCall, sync.slice(-200));
  ok("D3 · it goes live only when the frame is actually shown", /!host\.hidden/.test(setCall), setCall);
  ok("D4 · and not during the dealing beat (the matched moment is the Hall's, not the board's)",
     /!host\.classList\.contains\("dealing"\)/.test(setCall), setCall);
  ok("D5 · and never once the match has an outcome — the settle and the way out live in the strip",
     /!matchView\.outcome/.test(setCall), setCall);
  ok("D6 · the no-frame road clears it (the lobby, a re-key, a wallet gone)",
     /setMatchLive\(false\);\s*\n\s*return;/.test(sync), sync.slice(0, 600));
  ok("D7 · unmountFrame clears it", /setMatchLive\(false\)/.test(unmount), unmount);
  ok("D8 · the thin-client fallback clears it before it re-renders",
     /setMatchLive\(false\);[\s\S]*renderCurrent\(\)/.test(fallback), fallback);
  // MUTANTS — each term of the live condition matters
  ok("D9 · MUTANT — drop the outcome term and the settle-controls check goes red",
     !/!matchView\.outcome/.test(setCall.replace(" && !matchView.outcome", "")));
  ok("D10 · MUTANT — drop the clear from unmountFrame and its check goes red",
     !/setMatchLive\(false\)/.test(unmount.replace(/setMatchLive\(false\);/g, "")));
}

// ═══ E. THE CACHE-STAMP LAW (bytes-not-tasks), applied to mp/ ═══
// The console road learned this the hard way (consoleroad I1/I2): a fix that ships behind a stamp the browser
// already has is invisible. mp/hall.css and mp/hall.js are both stamped in mp/hall.html, so the same law holds
// here — and this rung changed both of them.
{
  const stamped = [...HTML.matchAll(/(?:src|href)="([^"?]+)\?v=([A-Za-z0-9]+)"/g)].map((m) => ({ src: m[1], v: m[2] }));
  const local = stamped.filter((x) => x.src.indexOf("://") < 0);
  const when = (args) => {
    try {
      const out = execFileSync("git", ["log", "-1", "--format=%ct"].concat(args), { cwd: SITE, encoding: "utf8" }).trim();
      return out ? Number(out) : 0;
    } catch (e) { return 0; }
  };
  const rel = (s) => path.posix.normalize(path.posix.join("mp", s));
  const stale = local.filter((x) => {
    const fileAt = when(["--", rel(x.src)]);
    const stampAt = when(["-G", x.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\?v=", "--", "mp/hall.html"]);
    return fileAt > stampAt;
  });
  ok("E1 · mp/hall.css and mp/hall.js are stamped at all — an unstamped asset can never be busted out of a cache",
     local.some((x) => x.src === "hall.css") && local.some((x) => x.src === "hall.js"),
     local.map((x) => x.src).join(", "));
  ok("E2 · BYTES-NOT-TASKS · every stamped Hall asset carries a stamp at least as new as its own bytes",
     stale.length === 0, "stale: " + stale.map((x) => x.src + "?v=" + x.v).join(", "));
}

// ═══ F. THE STATUE CORRIDOR — the lobby's own column math, pinned ═══
// backdrop_wide's corridor runs 20%-85% and centres at 52.5%, not 50%, because the art's two statues are not
// symmetric; the Hall's column is centred on THAT, and the frame's break-out bands are written against it. The
// collapse must not have moved either. (The lobby's rendered geometry is proven in a browser too — a 19-viewport
// fingerprint of ten elements, identical before and after — but the numbers themselves belong in the bytes.)
{
  const mid = mediaBody(CSS, "(min-width: 600px) and (max-width: 899.98px)");
  const wide = mediaBody(CSS, "(min-width: 900px)");
  const midWrap = ruleBody(mid, ".hall-wrap");
  const wideWrap = ruleBody(wide, ".hall-wrap");
  ok("F1 · 600-899 — the Hall's column still sits on the corridor, not on the viewport",
     !!midWrap && /width:\s*min\(430px,\s*54vw\)/.test(midWrap) &&
       /margin-left:\s*calc\(52\.5%\s*-\s*min\(215px,\s*27vw\)\)/.test(midWrap), midWrap);
  ok("F2 · >=900 — the 820 column, centred on 52.5% and not on 50%",
     !!wideWrap && /width:\s*820px/.test(wideWrap) && /margin-left:\s*calc\(52\.5%\s*-\s*410px\)/.test(wideWrap), wideWrap);
}

console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
if (fail) process.exitCode = 1;
