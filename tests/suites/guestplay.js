"use strict";
// GUEST-PLAY-1 (owner rulings 2026-10-26) — FREE PLAY NEEDS NO WALLET. The REAL synced game copy (game/index.html), the
// REAL Hall (mp/hall.js) and the site's free mini-games, in jsdom:
//   GP1–GP3 · the game opens in an EMPTY tab (no pass, no wallet): no redirect, the menu and the gem are there
//   GP4–GP5 · free progress saves without a wallet, and survives a reload (the game's own save + load, under dyw::)
//   GP6–GP8 · the solo_start tag: ONCE, at the first battle (quick battle or story), utm values only, config.js's script
//   GP9–GP11 · the Hall is UNCHANGED: a walletless visitor gets the connect card, a Torana-less wallet the gate (and its
//              "Play solo (free) →" goes to the game); no socket for either
//   GP12–GP13 · the Daily Puzzle frame and Smriti still work without a wallet (their own suites prove the rest)
//   B1–B2 · breakages: the redirect restored; the Hall's Torana gate removed — each caught
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM, VirtualConsole } = require("jsdom");
const H = require("../lib");

const SITE = path.resolve(__dirname, "..", "..");
const R = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✖ " + name + (detail ? "\n      " + detail : "")); } }
const txt = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
const COPY = R("game/index.html");
const STAMP = R("game/STAMP").trim();

// the real game copy, in an empty tab: no sessionStorage pass, no window.ethereum. `seed` pre-fills the browser's
// storage (a later visit); `realLS` is captured BEFORE the page's scripts replace window.localStorage with the shim.
function openGame(opts) {
  opts = opts || {};
  const vc = new VirtualConsole(), errors = [];
  vc.on("jsdomError", (e) => errors.push(String(e && e.message)));
  const url = "https://divyayuddha.games/game/index.html?v=" + STAMP + (opts.query || "");
  let realLS = null;
  const dom = new JSDOM(opts.html || COPY, { url, runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      realLS = w.localStorage;
      for (const [k, v] of Object.entries(opts.seed || {})) w.localStorage.setItem(k, v);
      if (opts.utmSession) w.sessionStorage.setItem("dystore::utm", JSON.stringify(opts.utmSession));
    } });
  return { w: dom.window, errors, realLS, url, navTried: () => errors.some((e) => /navigation/i.test(e)) };
}
const raw = (ls) => { const o = {}; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); o[k] = ls.getItem(k); } return o; };

async function run() {
  console.log("\n── GUEST-PLAY-1 · free play needs no wallet ──");

  // ═══ GP1–GP3 · the game opens in an empty tab ═══
  const g = openGame({ query: "&utm_source=yt&utm_medium=short&utm_campaign=guest" });
  await H.sleep(1500);
  ok("GP1 · the game copy opens in an EMPTY tab (no pass, no wallet): no navigation attempted, still on the game",
     !g.navTried() && g.w.location.href === g.url && g.w.sessionStorage.getItem("dyw_pass") === null && typeof g.w.ethereum === "undefined");
  ok("GP2 · …the main menu is there (play vs AI, story, the Daily Puzzle and Smriti doors) and the gate gem (back to the site)",
     !!g.w.document.getElementById("mode-daily") && !!g.w.document.getElementById("mode-smriti") && g.w.document.querySelectorAll(".mode").length >= 4 && !!g.w.document.getElementById("dyw-gate-return"));
  ok("GP3 · the copy carries no pass check and no bounce to the rite at all (the courtesy redirect is gone)",
     COPY.indexOf('location.replace("../rite.html")') < 0 && COPY.indexOf('sessionStorage.getItem("dyw_pass")') < 0);

  // ═══ GP4–GP5 · free progress saves, and survives a reload ═══
  const P = g.w.loadProfile();
  P.name = "Guest Tester"; P.matches = (P.matches || 0) + 3; P.wins = (P.wins || 0) + 2;
  g.w.saveProfile(P);
  g.w.saveStoryProg({ b1c1: { done: true, bonus: true } });
  const saved = raw(g.realLS);
  ok("GP4 · the game's own save works with no wallet: the profile and the story are in the browser, under the copy's dyw:: prefix",
     JSON.parse(saved["dyw::dy_profile"] || "{}").name === "Guest Tester" && JSON.parse(saved["dyw::dy_story"] || "{}").b1c1.done === true &&
     !Object.keys(saved).some((k) => /^dy_profile$|^dy_story$/.test(k)), JSON.stringify(Object.keys(saved)));
  const g2 = openGame({ seed: saved });
  await H.sleep(800);
  const P2 = g2.w.loadProfile();
  ok("GP5 · …and a later visit (a reload) loads it back: the same name, matches and wins, the story chapter done",
     P2.name === "Guest Tester" && P2.wins === P.wins && P2.matches === P.matches && g2.w.loadStoryProg().b1c1.bonus === true, JSON.stringify(P2));

  // ═══ GP6–GP8 · the solo_start tag ═══
  const tagged = () => ((g.w.plausible && g.w.plausible.q) || []).map((a) => Array.from(a)).filter((a) => a[0] === "solo_start");
  ok("GP6 · nothing is sent on load: no solo_start before a battle", tagged().length === 0);
  try { g.w.startGame("devas", "asuras"); } catch (e) { /* jsdom has no canvas: the battle itself cannot render here */ }
  try { g.w.startStoryChapter("b1c1"); } catch (e) {}
  try { g.w.startGame("nagas", "vanaras"); } catch (e) {}
  const calls = tagged();
  ok("GP7 · the FIRST battle sends solo_start ONCE (a quick battle, then a story chapter, then another battle: still one), carrying the utm values ONLY",
     calls.length === 1 && JSON.stringify(calls[0][1]) === JSON.stringify({ props: { utm_source: "yt", utm_medium: "short", utm_campaign: "guest" } }) &&
     raw(g.realLS)["dyw::dy_solo_started"] === "1", JSON.stringify(calls));
  const g3 = openGame({ seed: raw(g.realLS) });
  await H.sleep(500);
  try { g3.w.startGame("devas", "asuras"); } catch (e) {}
  const again = ((g3.w.plausible && g3.w.plausible.q) || []).filter((a) => a[0] === "solo_start");
  const cfg = R("config.js"), m = COPY.match(/var SOLO_TAG = \{ enabled: (true|false), script: "([^"]+)" \};/);
  ok("GP8 · it is once per BROWSER (a later visit's battle sends nothing), and its script + switch are exactly config.js's analytics block",
     again.length === 0 && !!m && cfg.indexOf('script: "' + m[2] + '"') >= 0 && /analytics: \{\s*enabled: true,/.test(cfg) && m[1] === "true", JSON.stringify(again));
  const smuggle = openGame({ utmSession: { utm_source: "0x" + "ab".repeat(20), utm_medium: "x" } });
  await H.sleep(500);
  try { smuggle.w.startGame("devas", "asuras"); } catch (e) {}
  const sm = ((smuggle.w.plausible && smuggle.w.plausible.q) || []).filter((a) => a[0] === "solo_start");
  ok("GP8b · tags from the site's own session key travel too, and an address smuggled into one is dropped (only utm_medium)",
     sm.length === 1 && JSON.stringify(sm[0][1].props) === JSON.stringify({ utm_medium: "x" }), JSON.stringify(sm));

  // ═══ GP9–GP11 · the Hall is unchanged ═══
  const c = await H.chainStore();
  const DEAD = "ws://127.0.0.1:1";
  async function hallFor(opts) {
    const h = await H.hall(DEAD, c.addrs.dyc, c.addrs.dyc, c.player, c.provider, Object.assign({ realGate: true, accessNFT: c.addrs.nft }, opts || {}));
    await H.until(() => h.w.document.querySelector(".hall-nowallet, .hall-gate .hall-gate-line, .hall-floor") || /EVERY SEAT HERE IS HUMAN/.test(txt(h.w.document.getElementById("hall-root"))), 15000, "the Hall").catch(() => null);
    await H.sleep(1200);
    return h;
  }
  {
    const h = await hallFor({ noEthereum: true });
    const card = txt(h.w.document.querySelector(".hall-connect"));
    ok("GP9 · a WALLETLESS visitor still cannot enter the Hall: 'Connect your wallet to enter the Hall.' with the install guidance — no socket opened",
       /Connect your wallet to enter the Hall\./.test(card) && h.sockets.length === 0 && !/EVERY SEAT HERE IS HUMAN/.test(txt(h.w.document.getElementById("hall-root"))), card);
    H.teardown(h);
  }
  let toranaLess;
  {
    const h = await hallFor({});
    const root = txt(h.w.document.getElementById("hall-root")), link = h.w.document.getElementById("hall-solo");
    toranaLess = { gated: root.indexOf("Tables against other players need a Torana - solo play stays free.") === 0 && h.sockets.length === 0 && !/EVERY SEAT HERE IS HUMAN/.test(root) };
    ok("GP10 · a wallet WITHOUT a Torana still stops at the Hall's gate: the ruled sentence, no socket, no floor", toranaLess.gated, root.slice(0, 160));
    ok("GP11 · …and its 'Play solo (free) →' goes to the GAME now (not the rite)", !!link && link.getAttribute("href") === "../game/index.html" && txt(link) === "Play solo (free) →");
    H.teardown(h);
  }

  // ═══ GP12–GP13 · the free mini-games ═══
  ok("GP12 · the Daily Puzzle's frame is still recognised by the copy (same origin, parent under /play/daily/, ?puzzle=1) and keeps the gem and the solo tag out",
     /dailyFrame = window\.top !== window && \/\[\?&\]puzzle=1\(&\|\$\)\/\.test\(location\.search\) && window\.parent\.location\.origin === location\.origin/.test(COPY) &&
     /if \(dailyFrame\) return;/.test(COPY) && /if \(dailyFrame \|\| wireFrame \|\| !SOLO_TAG\.enabled\) return;/.test(COPY) && /const PUZZLE_MODE =/.test(COPY));
  const freePages = ["play/daily/index.html", "play/daily/page.js", "play/smriti/index.html", "play/smriti/page.js"].map(R).join("\n");
  ok("GP13 · the Daily Puzzle and Smriti pages need no wallet: no wallet script, no provider, no rite bounce (their own suites play them)",
     !/js\/wallet\.js|window\.ethereum|DYWallet|rite\.html/.test(freePages));

  // GP14 · the rite's "Play free" is a bare .rite-btn (display:inline-block beats the UA [hidden] rule): it needs its own
  // id+[hidden] guard or it would still show to a CONNECTED wallet; and the phone pair layout is toggled with it.
  const RITE = R("rite.html");
  ok("GP14 · the rite hides 'Play free' for real once a wallet connects (#rite-play[hidden] guard) and pairs it with the action on a phone",
     /#rite-play\[hidden\] \{ display: none; \}/.test(RITE) && /thr\.classList\.toggle\("rite-pair", !!play && !play\.hidden\)/.test(RITE) &&
     /\.rite-threshold\.rite-pair #rite-play \{/.test(RITE));

  // ═══ B · breakages, each caught ═══
  {
    const restored = COPY.replace('  /* GUEST-PLAY-1 (owner ruling 2026-10-26): free play needs no wallet and no pass - the courtesy redirect to the rite is\n     GONE. The Hall keeps its own gate (wallet + Torana) and the match server its own check; neither lives here. */\n',
      '  try {\n    if (!dailyFrame && !sessionStorage.getItem("dyw_pass")) { location.replace("../rite.html"); return; }\n  } catch (e) { if (!dailyFrame) { location.replace("../rite.html"); return; } }\n');
    const b = openGame({ html: restored });
    await H.sleep(1200);
    ok("B1 · breakage 'the redirect restored' is caught (GP1 goes red: the empty tab is sent away to the rite)", restored !== COPY && b.navTried());
  }
  {
    const src = R("mp/hall.js"), a = 'accessState = (bal && bal > 0n) ? "pass" : "gateless";';
    if (src.indexOf(a) < 0) throw new Error("breakage anchor gone: the Hall's Torana check");
    const h = await hallFor({ hallSrc: src.replace(a, 'accessState = "pass";') });
    const root = txt(h.w.document.getElementById("hall-root"));
    const gated = root.indexOf("Tables against other players need a Torana - solo play stays free.") === 0 && !/EVERY SEAT HERE IS HUMAN/.test(root);
    ok("B2 · breakage 'the Hall's Torana gate removed' is caught (GP10 goes red: a Torana-less wallet would reach the floor)", toranaLess.gated && !gated, root.slice(0, 120));
    H.teardown(h);
  }

  console.log("──\n" + (fail === 0 ? "ALL GREEN — " + pass + "/" + (pass + fail) : "FAILURES — " + fail + " of " + (pass + fail)));
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("guestplay suite crashed:", e); process.exit(1); });
