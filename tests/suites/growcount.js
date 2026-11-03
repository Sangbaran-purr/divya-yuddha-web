"use strict";
// GROW-COUNT-1 (owner rulings 2026-11-03) — THE PLAYER COUNTER, SITE SIDE. No chain, no network. Proven on the REAL
// files: play/shared/count.js (the id, the first-touch source, the events and the outbox), the hooks that report a
// finish (Daily, Smriti, the game copy's three, the wallet), the copy's load order (the counter BEFORE the storage
// shim — one id across /game/, /play/daily/ and /play/smriti/), the owner pages and the tagged-link builder.
// Breakages put each fault back in memory; each must go red. The server side (dedupe, rate limits, the report) is
// divya-yuddha-web3/services/dy-count/test/proof.js.
const fs = require("fs"), path = require("path"), Module = require("module");
const { JSDOM } = require("jsdom");

const SITE = path.resolve(__dirname, "..", "..");
const R = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✖ " + n + (d ? "\n      " + d : "")); } };
const J = JSON.stringify;

const COUNT_PATH = path.join(SITE, "play", "shared", "count.js"), COUNT_SRC = R("play/shared/count.js");
function countFrom(src) { const m = new Module(COUNT_PATH, null); m.filename = COUNT_PATH; m._compile(src, COUNT_PATH); return m.exports; }
function mutate(src, from, to) { if (src.split(from).length !== 2) throw new Error("mutant anchor not unique: " + from.slice(0, 60)); return src.split(from).join(to); }
function memStore() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; }
const DAY = 86400000, T0 = Date.parse("2026-11-03T08:00:00Z");
let rn = 0; const rand = (n) => { const a = []; for (let i = 0; i < n; i++) a.push((++rn * 37 + i * 11) & 255); return a; };
function counter(C, o) { o = o || {}; const clock = o.clock || { t: T0 }; return { clock, c: C.create({ storage: o.storage || memStore(), search: o.search || "", portal: o.portal || null, now: () => clock.t, random: rand, fetch: o.fetch || null, endpoint: o.endpoint }) }; }
const evs = (c, name) => c.outbox().filter((e) => e.ev === name);

// the behaviours, as checks over one counter module (the real one, or a broken one)
function firstTouch(C) {   // G1
  const s = memStore();
  const a = counter(C, { storage: s, search: "?utm_source=Pinoy%20Gamer&utm_medium=creator&utm_campaign=sea-launch" }).c;
  const b = counter(C, { storage: s, search: "?utm_source=other-ad&utm_medium=ad" }).c;
  return a.state().id === b.state().id && /^[A-Za-z0-9_-]{22}$/.test(a.state().id) && b.state().src.s === "pinoy-gamer" && b.state().src.m === "creator" && b.state().src.c === "sea-launch" && evs(b, "first_visit").length === 1;
}
function untagged(C) { const c = counter(C, {}).c; const e = evs(c, "first_visit")[0]; return c.state().src.s === "direct" && e && e.s === "direct" && e.m === null && e.c === null; }   // G2
function onceRules(C) {   // G4
  const x = counter(C, {}); const c = x.c;
  c.finished("daily"); c.finished("match"); c.finished("smriti");
  const sameDay = evs(c, "first_play").length === 1 && evs(c, "return_play").length === 0 && evs(c, "first_play")[0].kind === "daily";
  x.clock.t = T0 + DAY; c.finished("smriti"); c.finished("match");
  const d1 = evs(c, "return_play"); const day1 = d1.length === 1 && d1[0].days === 1;
  x.clock.t = T0 + 7 * DAY; c.finished("hall");
  const d7 = evs(c, "return_play"); const day7 = d7.length === 2 && d7[1].days === 7 && d7[1].kind === "hall";
  c.finished("nonsense");
  return sameDay && day1 && day7 && evs(c, "first_play").length === 1;
}

(async () => {
  const C = countFrom(COUNT_SRC);
  console.log("── GROW-COUNT-1 · the counter (play/shared/count.js) ──");
  ok("G1 · FIRST TOUCH WINS: the first visit's utm tags (cleaned: 'Pinoy Gamer' → pinoy-gamer) stay with the id; a later tagged visit changes nothing; one first_visit", firstTouch(C));
  ok("G2 · UNTAGGED = 'direct' (medium and campaign empty), on the id and on every event", untagged(C));
  { const c = counter(C, { portal: "CrazyGames", search: "?utm_source=x&utm_campaign=jan" }).c;
    ok("G3 · a portal edition reports its portal as the source: portal:crazygames (its campaign kept)", c.state().src.s === "portal:crazygames" && c.state().src.m === "portal" && c.state().src.c === "jan"); }
  ok("G4 · first_play ONCE ever (the first finish's kind); return_play once per UTC day after it, with days since the first play (1, then 7); an unknown kind counts nothing", onceRules(C));
  { const x = counter(C, {}); x.c.walletConnected(); x.c.walletConnected(); for (let i = 0; i < 8; i++) x.c.shared("card");
    ok("G5 · wallet_connect once per id; shares at most 5 a day from a browser", evs(x.c, "wallet_connect").length === 1 && evs(x.c, "share").length === 5); }
  { const a = counter(C, {}); a.c.walletConnected(); a.c.finished("match"); a.c.shared("card");
    const allowed = ["k", "id", "s", "m", "c", "ev", "day", "kind", "secs", "days", "first"];
    const keys = new Set(); a.c.outbox().forEach((e) => Object.keys(e).forEach((k) => keys.add(k)));
    ok("G6 · NOTHING PERSONAL leaves: every event carries only " + allowed.join(", ") + " — no address, no name, no email", [...keys].every((k) => allowed.indexOf(k) >= 0) && !/0x[0-9a-fA-F]{40}/.test(J(a.c.outbox())), [...keys].join(",")); }
  {
    ok("G7 · SHIPPED SWITCHED OFF (owner ruling): ENDPOINT is empty — events wait in the outbox, nothing is sent", C.ENDPOINT === "" && /var ENDPOINT = "";/.test(COUNT_SRC));
    const sent = []; const f = (code) => (u, o) => { sent.push(JSON.parse(o.body)); return code === "net" ? Promise.reject(new Error("offline")) : Promise.resolve({ status: code }); };
    const off = counter(C, { fetch: f(200) }); off.c.finished("match");
    const s = memStore();
    const on = counter(C, { storage: s, fetch: f(503), endpoint: "https://count.example/v1/events" }); on.c.finished("match"); await on.c.flush();
    const kept503 = on.c.outbox().length === 2;
    const net = counter(C, { storage: s, fetch: f("net"), endpoint: "https://count.example/v1/events" }); await net.c.flush();
    const keptNet = net.c.outbox().length === 2;
    const good = counter(C, { storage: s, fetch: f(200), endpoint: "https://count.example/v1/events" }); await good.c.flush();
    const sentOnce = good.c.outbox().length === 0;
    const bad = counter(C, { fetch: f(400), endpoint: "https://count.example/v1/events" }); await bad.c.flush();
    ok("G8 · THE OUTBOX: with no endpoint nothing is sent; switched on, a 503 or no network keeps the events, a 200 clears them, a 400 drops a batch the server will never take",
      off.c.outbox().length === 2 && kept503 && keptNet && sentOnce && bad.c.outbox().length === 0 && sent.every((b) => b.v === 1 && Array.isArray(b.events)));
  }
  { const s = memStore(), clk = { t: T0 }; const a = counter(C, { storage: s, clock: clk }).c, b = counter(C, { storage: s, clock: clk }).c;
    a.finished("match"); b.finished("daily");
    ok("G9 · TWO TABS at once: one id, one first_play (each call re-reads the stored state)", a.state().id === b.state().id && evs(b, "first_play").length === 1); }
  { const c = C.create({ storage: null, search: "" }); let threw = false; try { c.finished("match"); c.walletConnected(); } catch (e) { threw = true; }
    ok("G10 · storage blocked: the counter stays silent (a browser it cannot remember could not be counted once) and never throws", !threw && c.state() === null); }

  console.log("\n── GROW-COUNT-1 · one id across /game/, /play/daily/ and /play/smriti/ ──");
  const GAME = R("game/index.html"), STAMP = R("game/STAMP").trim();
  const gate = (src) => src.slice(src.indexOf("<!-- DYW-GATE-START"), src.indexOf("<!-- DYW-GATE-END -->"));
  const TAG = '<script src="../play/shared/count.js?v=c1"></script>';
  function copyId(gameSrc, seeded) {
    // the site's game copy's injected block, in a real DOM at /game/: the counter's tag replaced by its source
    const html = "<!doctype html><html><head><meta charset=\"utf-8\">" + gate(gameSrc).replace(TAG, "<script>" + COUNT_SRC.replace(/<\/script/g, "<\\/script") + "</script>") + "</head><body></body></html>";
    const dom = new JSDOM(html, { url: "https://divyayuddha.games/game/index.html?v=" + STAMP, runScripts: "dangerously", beforeParse(w) { if (seeded) w.localStorage.setItem("dy_player", seeded); } });
    const w = dom.window, id = w.DY_COUNT && w.DY_COUNT.state() && w.DY_COUNT.state().id; const shimSees = w.localStorage.getItem("dy_player"); dom.window.close();
    return { id, shimSees };
  }
  const daily = counter(C, { search: "?utm_source=creator-a" }).c, seeded = JSON.stringify(daily.state());
  const inCopy = copyId(GAME, seeded);
  ok("G11 · the game copy loads the counter FIRST in its injected block, ahead of the storage shim (and the shim is still there)",
    gate(GAME).indexOf(TAG) >= 0 && gate(GAME).indexOf(TAG) < gate(GAME).indexOf('var NS = "dyw::"') && GAME.split(TAG).length === 2);
  ok("G12 · ONE ID: an id made on /play/daily/ is the id the game copy reports — though the copy's own storage (behind the shim) cannot see it", inCopy.id === daily.state().id && inCopy.shimSees === null, J(inCopy));
  const stamps = { daily: /count\.js\?v=(\w+)/.exec(R("play/daily/index.html")), smriti: /count\.js\?v=(\w+)/.exec(R("play/smriti/index.html")), game: /count\.js\?v=(\w+)/.exec(GAME), sync: /count\.js\?v=(\w+)/.exec(R("scripts/sync_game.sh")), wallet: /count\.js\?v=(\w+)/.exec(R("js/wallet.js")) };
  ok("G13 · the counter is loaded before anything that can finish on Daily and Smriti, and ONE stamp (" + (stamps.daily || [])[1] + ") everywhere it is named (Daily, Smriti, the game copy, the sync, the wallet)",
    Object.values(stamps).every((m) => m && m[1] === stamps.daily[1]) && ["play/daily/index.html", "play/smriti/index.html"].every((f) => { const h = R(f); return h.indexOf("count.js?v=") < h.indexOf("page.js?v="); }));

  console.log("\n── GROW-COUNT-1 · the hooks that report a finish ──");
  const hooks = (src) => ({
    daily: (src.daily.match(/countFinish\(\);/g) || []).length === 3 && /function onWin\(h\) \{\n    done = true;\n    countFinish\(\);/.test(src.daily) && /if \(m\.win === true\) \{\n      done = true;\n      countFinish\(\);/.test(src.daily) && /D\.markRevealed\(state, P\.date, today\); D\.save\(store, state\); \}\n      countFinish\(\);/.test(src.daily) && /DY_COUNT\.finished\("daily"\)/.test(src.daily),
    smriti: /function finish\(\) \{\n    try \{ if \(window\.DY_COUNT\) window\.DY_COUNT\.finished\("smriti"\); \} catch \(e\) \{\}/.test(src.smriti),
    game: ["match", "story", "hall"].every((k) => src.game.split("try{ window.DY_COUNT && window.DY_COUNT.finished('" + k + "'); }catch(e){}").length === 2),
    wallet: /emit\(\);\n        countWallet\(\);\n        return state;/.test(src.wallet) && /window\.DY_COUNT\.walletConnected\(\)/.test(src.wallet) && !/walletConnected\([^)]/.test(src.wallet),
  });
  const SRC = { daily: R("play/daily/page.js"), smriti: R("play/smriti/page.js"), game: GAME, wallet: R("js/wallet.js") };
  const h0 = hooks(SRC);
  ok("G14 · a finished Daily Puzzle reports 'daily' from all three ways to finish: solved in the battle, solved on the fallback board, revealed (any date)", h0.daily);
  ok("G15 · a finished Smriti board reports 'smriti'; the game copy carries its three hooks (match, story, hall) exactly once each", h0.smriti && h0.game);
  ok("G16 · a wallet connect reports once, with no argument (never the address)", h0.wallet);
  { const w = new JSDOM("<!doctype html><body></body>", { url: "https://divyayuddha.games/owner/growth.html" }).window, skip = /(^|\/)(admin|treasury)\.html$|\/owner\//;
    ok("G17 · owner instruments are not players: a wallet connect on admin, treasury or owner/ is never counted", /\(\^\|\\\/\)\(admin\|treasury\)\\\.html\$\|\\\/owner\\\/\//.test(SRC.wallet) && skip.test(w.location.pathname) && skip.test("/admin.html") && skip.test("/treasury.html") && !skip.test("/store.html")); }

  console.log("\n── GROW-COUNT-1 · the owner pages and the tagged links ──");
  const L = require(path.join(SITE, "owner", "links.js"));
  const sea = L.build({ name: "Pinoy Gamer TV", medium: "creator", market: "sea", campaign: "", stamp: STAMP });
  ok("G18 · SEA: three links (the game stamped with the copy id " + STAMP + ", Daily, Smriti), each tagged pinoy-gamer-tv / creator / sea-launch",
    !sea.error && sea.links.game === "https://divyayuddha.games/game/index.html?v=" + STAMP + "&utm_source=pinoy-gamer-tv&utm_medium=creator&utm_campaign=sea-launch"
      && sea.links.daily === "https://divyayuddha.games/play/daily/?utm_source=pinoy-gamer-tv&utm_medium=creator&utm_campaign=sea-launch" && /\/play\/smriti\/\?utm_source=pinoy-gamer-tv&/.test(sea.links.smriti), J(sea));
  const india = L.build({ name: "Desi Gaming", medium: "ad", market: "india", campaign: "crypto-push", stamp: STAMP });
  const badIndia = ["Crypto Kings", "Earn Daily", "Wallet Warrior", "NFT Hub"].map((n) => L.build({ name: n, medium: "creator", market: "india", stamp: STAMP }));
  ok("G19 · INDIA: the slug and the game's name only (campaign divya-yuddha, whatever was typed); a name carrying crypto / earn / wallet / NFT is refused",
    !india.error && india.campaign === "divya-yuddha" && Object.values(india.links).every((u) => L.bannedIn(u.replace(/^https?:\/\/[^/]+/, "").replace(/\?v=[0-9a-f]+/, "")).length === 0) && badIndia.every((r) => !!r.error), J(badIndia.map((r) => r.error)));
  // the counter reads a link the builder made exactly as it was meant
  const viaLink = counter(C, { search: new URL(sea.links.daily).search }).c.state().src;
  ok("G20 · round trip: a visit through a built link is counted under exactly that source, kind and campaign", viaLink.s === "pinoy-gamer-tv" && viaLink.m === "creator" && viaLink.c === "sea-launch");
  const pages = ["owner/growth.html", "owner/links.html"].map((f) => R(f));
  ok("G21 · the owner pages: not indexed, locked until the owner's wallet signs (their content hidden at load), no data of their own; the door asks dy-count at count.divyayuddha.games",
    pages.every((h) => /<meta name="robots" content="noindex, nofollow"/.test(h) && /<section id="owner-locked"/.test(h) && /id="owner-open"[^>]* hidden/.test(h) && /owner\.js\?v=o1/.test(h) && /js\/wallet\.js\?v=s1w/.test(h))
      && /var BASE = "https:\/\/count\.divyayuddha\.games";/.test(R("owner/owner.js")) && /personal_sign/.test(R("owner/owner.js")) && /Authorization|authorization/.test(R("owner/owner.js")));
  const tracked = require("child_process").execFileSync("git", ["ls-files", "-co", "--exclude-standard", "*.html"], { cwd: SITE, encoding: "utf8" }).split("\n").filter((f) => f && !/^tmp\//.test(f));
  ok("G22 · the draft Privacy sentence is on NO page yet (owner ruling 8: it waits for the owner's wording)", tracked.every((f) => R(f).indexOf("random anonymous ID") < 0));

  console.log("\n── GROW-COUNT-1 · breakages: each must go red ──");
  const red = (name, cond) => ok(name + " → red", cond);
  red("B1 · DOUBLE FIRST_PLAY: the 'only the first finish' guard dropped (G4 goes red)", !onceRules(countFrom(mutate(COUNT_SRC, "      if (!st.firstPlayDay) {", "      if (true) {"))));
  red("B2 · UNTAGGED saved as an empty source instead of 'direct' (G2 goes red)", !untagged(countFrom(mutate(COUNT_SRC, '{ s: "direct", m: null, c: null }', '{ s: "", m: null, c: null }'))));
  red("B3 · FIRST TOUCH overwritten by the next tagged visit (G1 goes red)", !firstTouch(countFrom(mutate(COUNT_SRC, "    function queue(e) {", "    st.src = sourceOf(env.search, env.portal); write(KEY, st);\n    function queue(e) {"))));
  { const moved = GAME.replace(TAG + "\n", "").replace("<!-- DYW-GATE-END -->", TAG + "\n<!-- DYW-GATE-END -->"); const r = copyId(moved, seeded);
    red("B4 · the counter loaded AFTER the storage shim in the game copy — two ids for one player (G12 goes red)", moved !== GAME && r.id !== daily.state().id); }
  { const on = mutate(COUNT_SRC, 'var ENDPOINT = "";', 'var ENDPOINT = "https://count.divyayuddha.games/v1/events";');
    red("B5 · the endpoint switched on before the owner says so (G7 goes red)", countFrom(on).ENDPOINT !== ""); }
  red("B6 · the Daily reveal hook removed (G14 goes red)", !hooks(Object.assign({}, SRC, { daily: mutate(SRC.daily, "D.markRevealed(state, P.date, today); D.save(store, state); }\n      countFinish();", "D.markRevealed(state, P.date, today); D.save(store, state); }") })).daily);
  red("B7 · the wallet event made to carry the address (G6 goes red)", (() => { const M = countFrom(mutate(COUNT_SRC, 'queue({ ev: "wallet_connect", day: utcDay(now()) });', 'queue({ ev: "wallet_connect", day: utcDay(now()), addr: "0x" + "ab".repeat(20) });')); const a = counter(M, {}); a.c.walletConnected(); return /0x[0-9a-fA-F]{40}/.test(J(a.c.outbox())); })());
  red("B8 · the India word check emptied — a crypto name gets its links (G19 goes red)", (() => { const lsrc = R("owner/links.js"), lp = path.join(SITE, "owner", "links.js"); const m = new Module(lp, null); m.filename = lp; m._compile(mutate(lsrc, "function bannedIn(s) { var parts", "function bannedIn(s) { return []; var parts"), lp);
    const r = m.exports.build({ name: "Crypto Kings", medium: "creator", market: "india", stamp: STAMP }); return !r.error; })());

  console.log("\n" + (fail ? "✖ " + fail + " FAILED of " + (pass + fail) : "ALL GREEN — " + pass + "/" + pass));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("growcount suite crashed:", e); process.exit(1); });
