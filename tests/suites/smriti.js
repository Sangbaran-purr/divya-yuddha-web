"use strict";
// MINI-GAMES-2 · SMRITI (/play/smriti/) — the memory game. R1 the rules and data, R2 the animation player, R3 the page.
// The real files, in Node and in jsdom. The Hero packs are read from the game checkout (DY_GAME, or ../divya-yuddha beside
// this repo) exactly where the live site reads them on the free game's site; Meghnad from the site's pinned copy.
// Every breakage named by the owner is applied to the real source text and must turn its check red (M·).
const path = require("path"), fs = require("fs"), { execFileSync } = require("child_process");
const { JSDOM, VirtualConsole } = require("jsdom");
const H = require("../lib.js");
const SITE = H.SITE, DIR = path.join(SITE, "play", "smriti");
const GAME = process.env.DY_GAME || path.resolve(SITE, "..", "divya-yuddha");
const PIN = "ae56424";   // the game commit the Meghnad copy and the manifest reader are pinned to (GAME-HEADER-1, pushed 2026-10-15)
const E = require(path.join(SITE, "game", "src", "engine.js"));
const AM = require(path.join(DIR, "manifest.js"));
const R = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
const SRC = { rules: R("play/smriti/smriti.js"), player: R("play/smriti/player.js"), page: R("play/smriti/page.js") };
const MANIFEST_BASE = "https://sangbaran-purr.github.io/divya-yuddha/assets/manifest/";
const THUMBS = path.join(GAME, "assets", "thumbs");

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const J = (x) => JSON.stringify(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) { const t = Date.now(); while (!fn()) { if (Date.now() - t > (ms || 15000)) return false; await sleep(10); } return true; }
async function section(name, fn) { try { await fn(); } catch (e) { ok(name + " — ran to the end", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")); } }
// a module from (possibly mutated) source text, as Node would load it
function loadUMD(src) { const m = { exports: {} }; new Function("module", "exports", "require", src)(m, m.exports, require); return m.exports; }
const S = loadUMD(SRC.rules);
const CARDS = S.cardsFrom(E.DECKS);
const hasThumb = (c) => fs.existsSync(path.join(THUMBS, S.artName(c)));
const gameOK = fs.existsSync(path.join(GAME, "assets", "manifest", "registry.json")) && fs.existsSync(THUMBS);

// ═══ R1 · THE RULES (as functions over a rules module, so a mutant can be checked by the same code) ═══
function checkDeal(Sx, pool) {
  const bad = []; let sameSeed = true, differs = false;
  for (const lv of Sx.LEVEL_ORDER) for (let seed = 1; seed <= 300; seed++) {
    const d = Sx.deal(pool, lv, seed), count = {};
    d.forEach((t) => { count[t.id] = (count[t.id] || 0) + 1; });
    if (d.length !== 2 * Sx.LEVELS[lv] || Object.values(count).some((n) => n !== 2) || Object.keys(count).length !== Sx.LEVELS[lv]) bad.push("copies " + lv + " " + seed);
    if (!d.some((t) => Sx.isAnimated(t.card))) bad.push("no animated pair " + lv + " " + seed);
    if (J(Sx.deal(pool, lv, seed).map((t) => t.id)) !== J(d.map((t) => t.id))) sameSeed = false;
    if (J(Sx.deal(pool, lv, seed + 1000).map((t) => t.id)) !== J(d.map((t) => t.id))) differs = true;
  }
  return { bad, sameSeed, differs };
}
function checkTries(Sx) {
  const tiles = Sx.deal(Sx.poolOf(CARDS, hasThumbSafe), "easy", 7), g = Sx.start(tiles, "easy");
  const first = g.tiles[0], twin = g.tiles.find((t) => t !== first && t.id === first.id), other = g.tiles.find((t) => t.id !== first.id);
  const r = {};
  Sx.flip(g, first.i); r.oneCard = g.tries;                                  // a single card is not a try
  Sx.flip(g, other.i); r.miss = g.tries; r.twoUp = first.up && other.up;
  r.third = Sx.flip(g, g.tiles.find((t) => !t.up).i) === null;               // no third card while two wait
  Sx.turnBack(g); r.back = !first.up && !other.up && g.open.length === 0;
  Sx.flip(g, first.i); Sx.flip(g, twin.i); r.match = g.tries; r.locked = first.matched && twin.matched && Sx.flip(g, first.i) === null && Sx.turnBack(g) === false && first.up;
  return r;
}
function hasThumbSafe(c) { return gameOK ? hasThumb(c) : c.id !== "setustones"; }
function checkBest(Sx) {
  const rec = Sx.blank();
  const a = Sx.recordBest(rec, "easy", 14), b = Sx.recordBest(rec, "easy", 18), c = Sx.recordBest(rec, "easy", 11), d = Sx.recordBest(rec, "easy", 11);
  return { first: a, worse: b, better: c, equal: d, best: rec.best.easy };
}

(async function main() {
  console.log("── MINI-GAMES-2 · SMRITI ──");
  if (!gameOK) ok("the game checkout is present (" + GAME + ") — set DY_GAME; the pins and the pack checks need it", false);

  await section("R1", async () => {
    console.log("\n── R1 · the rules and the data ──");
    const pool = S.poolOf(CARDS, hasThumbSafe);
    ok("P1 · the pool is every card of the game with art: " + pool.length + " of " + CARDS.length + " (all but The Setu Stones, which has no art yet), current names from the engine (the Hero 'Bali')",
      CARDS.length === 176 && pool.length === 175 && !pool.some((c) => c.id === "setustones") && CARDS.find((c) => c.id === "hanuman").n === "Bali");
    const withArt = S.poolOf(CARDS, () => true);
    let seen = false; for (let seed = 1; seed < 4000 && !seen; seed++) seen = S.deal(withArt, "hard", seed).some((t) => t.id === "setustones");
    ok("P2 · the day its art exists The Setu Stones joins by itself: with its picture present the pool is 176 and it is dealt (nothing names it)", withArt.length === 176 && seen && SRC.rules.indexOf("setustones") < 0 && SRC.page.indexOf("setustones") < 0);
    const anim = CARDS.filter(S.isAnimated).map((c) => c.id).sort();
    ok("P3 · the animated cards are the 20 Heroes and Meghnad — 21, every one with art", anim.length === 21 && anim.indexOf("meghnad") >= 0 && CARDS.filter((c) => c.t === "hero").length === 20 && anim.every((id) => pool.some((c) => c.id === id)));
    const dc = checkDeal(S, pool);
    ok("D1 · 900 deals (300 seeds × Easy 6 / Medium 8 / Hard 12 pairs): two copies of each card, the right number of pairs, every board with an animated pair", dc.bad.length === 0, dc.bad.slice(0, 3).join(", "));
    ok("D2 · the same seed gives the same deal; another seed another", dc.sameSeed && dc.differs);
    const t = checkTries(S);
    ok("G1 · one card turned is not a try; two cards are one try", t.oneCard === 0 && t.miss === 1 && t.match === 2, J(t));
    ok("G2 · a mismatch: both stay up until they turn back, no third card meanwhile, then both face down", t.twoUp && t.third && t.back, J(t));
    ok("G3 · a match locks: both stay up and can't be turned again", t.locked, J(t));
    const g = S.start(S.deal(pool, "medium", 3), "medium"); const byId = {};
    g.tiles.forEach((x) => (byId[x.id] = byId[x.id] || []).push(x.i));
    Object.values(byId).forEach(([a, b]) => { S.flip(g, a); S.flip(g, b); });
    ok("G4 · finding every pair ends the game; a perfect game is exactly one try per pair", g.done && g.found === 8 && g.tries === 8 && S.flip(g, 0) === null);
    const b = checkBest(S);
    ok("B1 · best = fewest tries: the first game sets it, a worse one leaves it, a better one lowers it, an equal one is not 'new'", b.first && !b.worse && b.better && !b.equal && b.best === 11, J(b));
    const thrower = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
    const mem = (v) => ({ getItem: () => v, setItem() {} });
    ok("B2 · storage blocked: loading gives an empty record, saving reports false — never an error", J(S.load(thrower)) === J(S.blank()) && S.save(thrower, S.blank()) === false && J(S.load(null)) === J(S.blank()));
    ok("B3 · storage corrupt or the wrong shape is an empty record (and an impossible best is dropped)",
      J(S.load(mem("{nope"))) === J(S.blank()) && J(S.load(mem('{"best":[1,2]}'))) === J(S.blank()) && J(S.load(mem('{"v":1,"best":{"easy":3,"hard":"x","medium":9}}'))) === J({ v: 1, best: { medium: 9 } }));
    // the owner's R1 breakages
    const mut = (from, to) => { if (SRC.rules.indexOf(from) < 0) throw new Error("mutant anchor gone: " + from); return loadUMD(SRC.rules.split(from).join(to)); };
    const m1 = mut("var first = anim[Math.floor(rng() * anim.length)];", "var first = pool[Math.floor(rng() * pool.length)];");
    ok("M1 · breakage 'drop the animated-pair rule' is caught (D1 goes red)", checkDeal(m1, pool).bad.some((x) => /no animated pair/.test(x)));
    const m2 = mut("    if (s.open.length === 1) return { kind: \"first\", tile: t };\n    s.tries++;", "    s.tries++;\n    if (s.open.length === 1) return { kind: \"first\", tile: t };");
    ok("M2 · breakage 'count single cards' is caught (G1 goes red)", checkTries(m2).oneCard !== 0);
    const m3 = mut("    if (old != null && tries >= old) return false;\n", "");
    const b3 = checkBest(m3);
    ok("M3 · breakage 'let best get worse' is caught (B1 goes red)", b3.worse === true || b3.best !== 11, J(b3));
  });

  // ═══ R2 · THE ANIMATION PLAYER ═══
  // a fetch that serves the free game's packs from the game checkout, and the page-relative Meghnad copy from the site
  function makeFetch(o) {
    o = o || {};
    const log = [];
    const fetch = (u) => {
      log.push(u);
      let p = null;
      if (u.indexOf(MANIFEST_BASE) === 0) p = path.join(GAME, "assets", "manifest", u.slice(MANIFEST_BASE.length));
      else if (/\/play\/smriti\//.test(u)) p = path.join(DIR, u.replace(/^.*\/play\/smriti\//, ""));
      if (o.block && o.block(u)) p = null;
      if (!p || !fs.existsSync(p)) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error("404")) });
      const buf = fs.readFileSync(p);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(buf.toString("utf8"))) });
    };
    return { fetch, log };
  }
  function makeImage(o) {
    o = o || {};
    const made = [];
    function Img() { this.onload = null; this.onerror = null; this._src = ""; made.push(this); }
    Object.defineProperty(Img.prototype, "src", { get() { return this._src; }, set(v) { this._src = v; if (!v) return; const me = this; setTimeout(() => { if (me._src !== v) return; const bad = o.fail && o.fail(v); if (bad) { if (me.onerror) me.onerror(); } else if (me.onload) me.onload(); }, 1); } });
    return { Img, made };
  }
  const fakeCtx = () => { const calls = []; return { calls, canvas: { width: 400, height: 800 }, clearRect() {}, fillRect() {}, fillStyle: "", drawImage() { calls.push([].slice.call(arguments, 1, 5)); }, set globalAlpha(v) {}, get globalAlpha() { return 1; } }; };
  const nodeEnv = (PLx, o) => { const f = makeFetch(o), im = makeImage(o);
    return { f, im, p: PLx.create({ AM, fetch: f.fetch, Image: im.Img, raf: (fn) => setTimeout(fn, 4), now: () => Date.now(), pageUrl: "https://divyayuddha.games/play/smriti/" }) }; };

  await section("R2", async () => {
    console.log("\n── R2 · the animation player ──");
    const game = R("game/index.html");
    const block = (game.match(/\/\* ===== ACTOR MODULE VERBATIM BEGIN · manifest ===== \*\/\n([\s\S]*?)\/\* ===== ACTOR MODULE VERBATIM END · manifest ===== \*\//) || [])[1];
    ok("A1 · play/smriti/manifest.js is the game's own manifest reader, byte for byte (the verbatim block in the site's game copy)", !!block && block === R("play/smriti/manifest.js"));
    let atPin = null, mgPin = null, labClean = null;
    try {
      atPin = execFileSync("git", ["-C", GAME, "show", PIN + ":lab/vfx-manifestation/lib/manifest.js"], { maxBuffer: 1 << 26 });
      mgPin = ["manifest.json", "atlas_256.webp"].map((f) => [f, execFileSync("git", ["-C", GAME, "show", PIN + ":lab/vfx-manifestation/actors/meghnad/" + f], { maxBuffer: 1 << 26 })]);
      labClean = execFileSync("git", ["-C", GAME, "status", "--short", "--", "lab"], { encoding: "utf8" }).trim() === "";
    } catch (e) { atPin = null; }
    ok("A2 · …and the lab original at the recorded game commit " + PIN + ", byte for byte", !!atPin && Buffer.compare(atPin, fs.readFileSync(path.join(DIR, "manifest.js"))) === 0);
    ok("A3 · MEGHNAD: the site's fixed copy of his 256 px sheet and frame list is byte-for-byte the lab original at " + PIN + " (manifest.json + atlas_256.webp), and nothing under lab/ is modified",
      !!mgPin && mgPin.every(([f, b]) => Buffer.compare(b, fs.readFileSync(path.join(DIR, "actors", "meghnad", f))) === 0) && labClean === true && !fs.existsSync(path.join(DIR, "actors", "meghnad", "atlas.webp")));
    const PL = loadUMD(SRC.player);
    // own speed
    const mans = CARDS.filter(S.isAnimated).map((c) => c.id === "meghnad" ? JSON.parse(R("play/smriti/actors/meghnad/manifest.json")) : JSON.parse(fs.readFileSync(path.join(GAME, "assets", "manifest", "actors", c.id, "manifest.json"), "utf8")));
    const durs = mans.map((m) => PL.durationOf(m));
    ok("A4 · OWN SPEED: every clip plays at its own length (its phaseMs at tempo 1) plus a 400 ms wake-up and a 400 ms settle — " + Math.min(...durs) + "–" + Math.max(...durs) + " ms across the 21 (not the battle's 0.6 tempo, not fast mode)",
      Math.round(Math.min(...durs) / 100) / 10 === 2.6 && Math.round(Math.max(...durs) / 100) / 10 === 4.8 && mans.every((m) => PL.durationOf(m) === m.phaseMs.emerge + m.phaseMs.act + 800));   // the ruled "2.6–4.8 s", to the tenth
    PL.ANIMATION_SPEED = 2; const half = PL.durationOf(mans[0]); PL.ANIMATION_SPEED = 1;
    ok("A5 · ANIMATION_SPEED is the one setting: at 2 every play takes half as long; the page never sets a speed of its own", half === Math.round(PL.durationOf(mans[0]) / 2) && (SRC.player.match(/ANIMATION_SPEED/g) || []).length >= 3 && SRC.page.indexOf("ANIMATION_SPEED") < 0);
    // loading
    const { f, im, p } = nodeEnv(PL);
    await p.prepare(["indra", "meghnad", "indra", "notacard"]);
    ok("A6 · the registry is read once; a Hero from the free game's packs and Meghnad from the pinned copy are ready; a card with no pack is 'failed' (it will just turn over)",
      f.log.filter((u) => /registry\.json$/.test(u)).length === 1 && p.state("indra") === "ready" && p.state("meghnad") === "ready" && p.state("notacard") === "failed");
    const atlases = p.fetched.filter((u) => /atlas/.test(u));
    ok("A7 · only 256 px sheets are fetched — never a 512 px atlas", atlases.length === 2 && atlases.every((u) => /atlas_256\.webp$/.test(u)), J(atlases));
    ok("A8 · Meghnad comes from the pinned copy beside the page, not from the game's site", p.fetched.some((u) => u === "https://divyayuddha.games/play/smriti/actors/meghnad/manifest.json") && !p.fetched.some((u) => /actors\/meghnad/.test(u) && u.indexOf(MANIFEST_BASE) === 0));
    ok("A9 · each animation is fetched once (a card twice on the board is one fetch)", ["actors/indra/manifest.json", "actors/indra/atlas_256.webp"].every((s) => p.fetched.filter((u) => u.endsWith(s)).length === 1));
    const ctx = fakeCtx(); const t0 = Date.now();
    PL.ANIMATION_SPEED = 8;
    const played = await p.play("indra", ctx, { x: 100, y: 300, w: 80, h: 112 });
    const took = Date.now() - t0;
    const missed = await p.play("notacard", fakeCtx(), { x: 0, y: 0, w: 1, h: 1 });
    PL.ANIMATION_SPEED = 1;
    ok("A10 · a play draws the figure from the sheet, frame by frame, for its own length; a card with no pack plays nothing and returns at once (fallback)",
      played === true && ctx.calls.length > 10 && took >= PL.durationOf(p.manifestOf("indra")) / 8 - 30 && missed === false, J({ draws: ctx.calls.length, took }));
    const before = p.fetched.length; await p.play("meghnad", fakeCtx(), { x: 0, y: 0, w: 80, h: 112 }).catch(() => {});
    ok("A11 · playing again fetches nothing new", p.fetched.length === before);
    const imgs = im.made.slice();
    await p.prepare(["agni"]);
    ok("A12 · a new board lets the old packs go (their pictures cleared) and loads only the new board's", p.released.indexOf("indra") >= 0 && p.released.indexOf("meghnad") >= 0 && imgs.every((x) => x.src === "") && J(p.loaded) === J(["agni"]) && p.state("indra") === "none");
    const blocked = nodeEnv(PL, { block: (u) => /registry\.json$/.test(u) });
    await blocked.p.prepare(["indra"]);
    ok("A13 · no registry (offline, blocked): every card just turns over — 'failed', no error thrown", blocked.p.state("indra") === "failed" && (await blocked.p.play("indra", fakeCtx(), { x: 0, y: 0, w: 1, h: 1 })) === false);
    const brokenAtlas = nodeEnv(PL, { fail: (u) => /varuna/.test(u) });
    await brokenAtlas.p.prepare(["varuna", "indra"]);
    ok("A14 · a broken sheet fails only its own card", brokenAtlas.p.state("varuna") === "failed" && brokenAtlas.p.state("indra") === "ready");
    // the owner's R2 breakages
    const mutP = (from, to) => { if (SRC.player.indexOf(from) < 0) throw new Error("mutant anchor gone: " + from); return loadUMD(SRC.player.split(from).join(to)); };
    const k1 = nodeEnv(mutP('var m = AM.forRung(raw, OUT.RUNG);\n          if (m.rung !== OUT.RUNG) throw new Error("no " + OUT.RUNG + " px sheet for " + id);', "var m = raw;"));
    await k1.p.prepare(["indra"]);
    ok("M4 · breakage 'fetch 512 px' is caught (A7 goes red)", k1.p.fetched.some((u) => /atlas\.webp$/.test(u)));
    const k2 = nodeEnv(mutP("Object.keys(cache).forEach(function (id) { var s = cache[id]; if (s.img) { try { s.img.onload = s.img.onerror = null; s.img.src = \"\"; } catch (e) {} } released.push(id); });", ""));
    await k2.p.prepare(["indra"]); const k2imgs = k2.im.made.slice(); await k2.p.prepare(["agni"]);
    ok("M5 · breakage 'skip release' is caught (A12 goes red)", !(k2.p.released.indexOf("indra") >= 0 && k2imgs.every((x) => x.src === "")));
  });

  // ═══ R3 · THE PAGE ═══
  const HTML = R("play/smriti/index.html");
  function pageAt(o) {
    o = o || {};
    const srcs = Object.assign({}, SRC, o.src || {});
    let html = HTML.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
      const f = path.resolve(DIR, src.split("?")[0]), base = path.basename(f);
      const body = base === "page.js" ? srcs.page : base === "player.js" ? srcs.player : base === "smriti.js" ? srcs.rules : fs.readFileSync(f, "utf8");
      const extra = base === "page.js" ? "<script>DY_SMRITI_PLAYER.ANIMATION_SPEED = " + (o.speed || 6) + ";</script>" : "";
      return extra + "<script>" + body.replace(/<\/script/g, "<\\/script") + "</script>";
    });
    const f = makeFetch(o), im = makeImage({ fail: (u) => (o.artMissing || ["TheSetuStones"]).some((n) => u.indexOf("_" + n + "_") >= 0) });
    const draws = [];
    const navs = [], vcon = new VirtualConsole(); vcon.on("jsdomError", (e) => { if (/navigation/.test(e.message)) navs.push(e.message); });
    const dom = new JSDOM(html, { url: "https://divyayuddha.games/play/smriti/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vcon, referrer: o.referrer,
      beforeParse(w) {
        w.fetch = (u, x) => f.fetch(String(u), x);
        w.Image = im.Img;
        w.matchMedia = (q) => ({ matches: !!o.reduce && /reduce/.test(q), media: q, addListener() {}, removeListener() {} });
        w.HTMLCanvasElement.prototype.getContext = function () { const cv = this; return { canvas: cv, clearRect() {}, fillRect() {}, fillStyle: "", drawImage() { draws.push(1); }, set globalAlpha(v) {}, get globalAlpha() { return 1; } }; };
        if (o.vw) { Object.defineProperty(w, "innerWidth", { value: o.vw, configurable: true }); Object.defineProperty(w, "innerHeight", { value: o.vh, configurable: true }); Object.defineProperty(w, "devicePixelRatio", { value: o.dpr || 1, configurable: true }); }
        if (o.blocked) Object.defineProperty(w, "localStorage", { get() { throw new Error("SecurityError: storage blocked"); } });
        else if (o.store) Object.keys(o.store).forEach((k) => w.localStorage.setItem(k, o.store[k]));
        if (o.random) { const seq = o.random.slice(); w.Math.random = () => (seq.length ? seq.shift() : 0.5); }
      } });
    const w = dom.window, P = w.__DY_SMRITI_PAGE;
    const plays = [], bigs = [], asks = [], origPlay = P.player.play, origReady = P.player.whenReady;
    P.player.play = function (id, ctx, rect, onFrame, big) { plays.push(id); bigs.push(big || null); return origPlay.apply(this, arguments); };
    P.player.whenReady = function (id) { asks.push(id); return origReady.apply(this, arguments); };   // every animation the page ASKS for, played or not
    return { dom, w, P, f, plays, bigs, asks, draws, navs, $: (id) => w.document.getElementById(id) };
  }
  const startLevel = async (pg, lv) => { pg.w.document.querySelector('.sm-lv[data-level="' + lv + '"]').click(); await until(() => pg.P.game && !pg.P.busy && pg.P.game.level === lv, 15000); await sleep(30); };
  const card = (pg, i) => pg.w.document.querySelector('.sm-card[data-i="' + i + '"]');
  const tapT = (pg, i) => card(pg, i).click();
  const idle = (pg) => until(() => !pg.P.busy, 20000);
  async function solveAll(pg, wrongFirst) {   // play to the end: optional wrong tries, then every pair
    const g = pg.P.game, by = {};
    g.tiles.forEach((t) => (by[t.id] = by[t.id] || []).push(t.i));
    const ids = Object.keys(by);
    for (let k = 0; k < (wrongFirst || 0); k++) { tapT(pg, by[ids[0]][0]); await idle(pg); tapT(pg, by[ids[1]][0]); await idle(pg); }
    for (const id of ids) { if (g.tiles[by[id][0]].matched) continue; tapT(pg, by[id][0]); await idle(pg); tapT(pg, by[id][1]); await idle(pg); }
  }

  await section("R3", async () => {
    console.log("\n── R3 · the page ──");
    const pg = pageAt();
    ok("C1 · the level choice: Easy 6 pairs, Medium 8, Hard 12, each with its best ('No best yet')",
      [...pg.w.document.querySelectorAll(".sm-lv")].map((b) => b.textContent).join("|") === "Easy6 pairsNo best yet|Medium8 pairsNo best yet|Hard12 pairsNo best yet" && !pg.$("sm-choose").hidden && pg.$("sm-play").hidden);
    await startLevel(pg, "easy");
    const g = pg.P.game, animIds = [...new Set(g.tiles.filter((t) => S.isAnimated(t.card)).map((t) => t.id))];
    ok("C2 · an Easy board: 12 face-down cards, two of each, at least one animated pair", g.tiles.length === 12 && pg.w.document.querySelectorAll(".sm-card").length === 12 && pg.w.document.querySelectorAll(".sm-card.sm-up").length === 0 && animIds.length >= 1);
    await until(() => animIds.every((id) => pg.P.player.state(id) !== "loading"), 10000);
    ok("C3 · only the animated cards on THIS board are loaded, at 256 px", J(pg.P.player.loaded.slice().sort()) === J(animIds.slice().sort()) && pg.P.player.fetched.filter((u) => /atlas/.test(u)).every((u) => /atlas_256\.webp$/.test(u)), J({ loaded: pg.P.player.loaded, animIds }));
    // a Hero turn: the board waits, and takes no other turn meanwhile
    const hero = g.tiles.find((t) => S.isAnimated(t.card)), other = g.tiles.find((t) => !S.isAnimated(t.card) && t.id !== hero.id);
    tapT(pg, hero.i);
    await until(() => pg.P.playing === hero.i, 3000);
    const during = { busy: pg.P.busy, playing: pg.P.playing };
    tapT(pg, other.i); await sleep(40);
    const blocked = !g.tiles[other.i].up && g.tries === 0;
    await idle(pg);
    ok("W1 · turning a Hero plays its animation out of the card, and the board WAITS: no other card can be turned until it ends",
      during.busy === true && during.playing === hero.i && blocked && pg.plays[0] === hero.id && pg.draws.length > 5, J({ during, blocked, plays: pg.plays }));
    tapT(pg, other.i); await idle(pg);   // a miss (a Hero and a plain card): the plain card does not animate
    ok("W2 · after the animation the board takes turns again; a plain card turned never animates", g.tries === 1 && pg.plays.length === 1 && J(pg.asks) === J([hero.id]) && !g.tiles[hero.i].up);
    tapT(pg, hero.i); await idle(pg);
    ok("W3 · EVERY turn of a Hero animates — the second time too", pg.plays.length === 2 && pg.plays[1] === hero.id);
    const twin = g.tiles.find((t) => t.id === hero.id && t.i !== hero.i);
    tapT(pg, twin.i); await idle(pg);
    ok("W4 · the matching Hero animates as well, and the pair locks", pg.plays.length === 3 && g.tiles[hero.i].matched && g.tiles[twin.i].matched);
    await solveAll(pg);
    ok("W5 · through a whole game, only Heroes and Meghnad animated — never another card", pg.asks.every((id) => S.isAnimated(CARDS.find((c) => c.id === id))) && pg.plays.length >= 3 && pg.plays.length === pg.asks.length);
    const tries1 = g.tries;
    ok("F1 · the finished game: 'You found all 6 pairs in N tries.' and 'New best!' — the packs are let go",
      !pg.$("sm-done").hidden && pg.$("sm-result").textContent === "You found all 6 pairs in " + tries1 + " tries." && pg.$("sm-bestline").textContent === "New best!" && pg.P.player.loaded.length === 0);
    ok("F2 · the best is kept in this browser", JSON.parse(pg.w.localStorage.getItem("dy_smriti")).best.easy === tries1);
    pg.$("sm-again").click(); await until(() => pg.P.game && pg.P.game !== g && !pg.P.busy, 10000);
    await solveAll(pg, 2);
    ok("F3 · 'Play again' deals a new board; a worse game keeps the best: 'Your best: N tries.'", pg.P.game.tries === 8 && tries1 < 8 && pg.$("sm-bestline").textContent === "Your best: " + tries1 + " tries." && JSON.parse(pg.w.localStorage.getItem("dy_smriti")).best.easy === tries1);
    pg.$("sm-choose-again").click();
    ok("F4 · 'Choose a level' goes back to the choice, now showing 'Best: N tries' for Easy", !pg.$("sm-choose").hidden && pg.w.document.querySelector('.sm-lv[data-level="easy"] .sm-lvbest').textContent === "Best: " + tries1 + " tries");

    // reduced motion: no animation, no wait
    const rm = pageAt({ reduce: true });
    await startLevel(rm, "hard");
    const rg = rm.P.game, rh = rg.tiles.find((t) => S.isAnimated(t.card));
    tapT(rm, rh.i);
    const rmBusy = rm.P.busy;
    ok("RM1 · reduced motion: turning a Hero plays nothing and the board does not wait", rm.plays.length === 0 && rmBusy === false && rg.tiles[rh.i].up && rm.P.playing === null);
    // a missing pack: a plain turn, no wait
    const np = pageAt({ block: (u) => /registry\.json$/.test(u) });
    await startLevel(np, "medium");
    const nh = np.P.game.tiles.find((t) => S.isAnimated(t.card));
    tapT(np, nh.i); await idle(np);
    ok("FB1 · with no animation available the Hero just turns over and the board goes on (no error)", np.P.game.tiles[nh.i].up && np.draws.length === 0 && np.P.busy === false);
    // storage blocked and corrupt
    const sb = pageAt({ blocked: true });
    await startLevel(sb, "easy"); await solveAll(sb);
    ok("S1 · storage BLOCKED: the game plays to the end, and says plainly the best isn't saved", sb.$("sm-result").textContent.indexOf("You found all 6 pairs in ") === 0 && sb.$("sm-store").textContent === "This browser isn't saving your best scores.");
    const sc = pageAt({ store: { dy_smriti: "{not json" } });
    ok("S2 · a corrupt record is an empty one: the choice shows 'No best yet'", sc.w.document.querySelector('.sm-lv[data-level="easy"] .sm-lvbest').textContent === "No best yet");
    // the pool at run time: a card whose picture is missing is set aside and the board dealt again
    const full = S.poolOf(CARDS, () => true);
    let seed = 1; while (!S.deal(full, "hard", seed).some((t) => t.id === "setustones")) seed++;
    const rnd = [(seed + 0.5) / 4294967296];
    const withArt = pageAt({ artMissing: ["__none__"], random: rnd }); await startLevel(withArt, "hard");
    const noArt = pageAt({ random: rnd }); await startLevel(noArt, "hard");
    const expect175 = S.deal(S.poolOf(CARDS, (c) => c.id !== "setustones"), "hard", seed).map((t) => t.id);
    ok("P4 · ON THE PAGE, seed " + seed + ": with its picture published The Setu Stones is dealt like any card; with its picture missing it is set aside and the SAME seed is dealt again without it",
      withArt.P.game.tiles.some((t) => t.id === "setustones") && J(withArt.P.missing) === J([]) && !noArt.P.game.tiles.some((t) => t.id === "setustones")
        && J(noArt.P.missing) === J(["setustones"]) && J(noArt.P.game.tiles.map((t) => t.id)) === J(expect175));
    // layout: the rules live in layout.js (section B checks them at every size); here the page's own CSS guards
    const css = R("play/smriti/smriti.css");
    ok("L1 · the page never scrolls sideways; the animation canvas never takes a tap; in play the board's offset is PADDING (a margin collapses through <main>/<body> and scrolled the page 6–12 px) and the storage note steps aside so the whole board fits",
      /body\.smriti \{[^}]*overflow-x: hidden/.test(css) && /\.sm-stage \{[^}]*pointer-events: none/.test(css) && /body\.sm-playing \.sm \{[^}]*padding: var\(--sm-top, 0px\) 0 0;/.test(css)
        && /body\.sm-playing \.sm-store \{ display: none; \}/.test(css) && SRC.page.indexOf('art.style.marginTop = "0px"') >= 0 && !/\.sm-board\.sm-hard/.test(css));
    // the owner's R2/R3 breakages, on the page
    const k3 = pageAt({ src: { page: SRC.page.split("player.prepare(tiles.filter(function (t) { return S.isAnimated(t.card); }).map(function (t) { return t.id; }));").join("player.prepare(CARDS.filter(S.isAnimated).map(function (c) { return c.id; }));") } });
    await startLevel(k3, "easy");
    ok("M6 · breakage 'load an animation not on the board' is caught (C3 goes red)", k3.P.player.loaded.length > new Set(k3.P.game.tiles.filter((t) => S.isAnimated(t.card)).map((t) => t.id)).size);
    const k4 = pageAt({ src: { page: SRC.page.split("if (!game || busy || !S.canFlip(game, i)) return;").join("if (!game || !S.canFlip(game, i)) return;") } });
    await startLevel(k4, "easy");
    const kg = k4.P.game, kh = kg.tiles.find((t) => S.isAnimated(t.card)), ko = kg.tiles.find((t) => t.id !== kh.id);
    tapT(k4, kh.i); await until(() => k4.P.playing === kh.i, 3000); tapT(k4, ko.i); await sleep(40);
    ok("M7 · breakage 'allow flips during an animation' is caught (W1 goes red)", kg.tiles[ko.i].up === true);
    await idle(k4);
    const k5 = pageAt({ src: { page: SRC.page.split("if (S.isAnimated(r.tile.card) && !reduced())").join("if (!reduced())") } });
    await startLevel(k5, "easy");
    const plain = k5.P.game.tiles.find((t) => !S.isAnimated(t.card));
    tapT(k5, plain.i); await idle(k5);
    ok("M8 · breakage 'animate a non-Hero card' is caught (W2/W5 go red)", k5.asks.indexOf(plain.id) >= 0);
  });

  // ═══ B · THE BOARD ART (the owner's two originals, baked by scripts/smriti_art.py) and THE LAYOUT ═══
  await section("B", async () => {
    console.log("\n── B · the board art and the layout ──");
    const ART = require(path.join(DIR, "art", "geometry.js")), LY = require(path.join(DIR, "layout.js"));
    const crypto = require("crypto"), shaOf = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    const inside = (a, b, e) => { e = e || 0.01; return a.x >= b.x - e && a.y >= b.y - e && a.x + a.w <= b.x + b.w + e && a.y + a.h <= b.y + b.h + e; };
    const box = (q) => ({ x: q[0], y: q[1], w: q[2] - q[0], h: q[3] - q[1] });
    const files = Object.keys(ART.files), artDir = path.join(DIR, "art");
    ok("B1 · the art: six WebP files (landscape 960/1280/1672, portrait 480/720/941), each the bytes geometry.js records; no PNG original is in the site; both originals' sha256 recorded",
      J(files.slice().sort()) === J(["board-land-1280.webp", "board-land-1672.webp", "board-land-960.webp", "board-port-480.webp", "board-port-720.webp", "board-port-941.webp"])
        && files.every((f) => { const p = path.join(artDir, f); return fs.existsSync(p) && fs.statSync(p).size === ART.files[f].bytes && shaOf(p) === ART.files[f].sha256 && fs.readFileSync(p).slice(8, 12).toString() === "WEBP"; })
        && fs.readdirSync(artDir).every((f) => !/\.png$/i.test(f)) && /^[0-9a-f]{64}$/.test(ART.originals.land.sha256) && /^[0-9a-f]{64}$/.test(ART.originals.port.sha256)
        && J(ART.land.size) === J([1672, 941]) && J(ART.port.size) === J([941, 1672]));
    const geomOK = ["land", "port"].every((k) => { const G = ART[k], F = box(G.field), S0 = box(G.safe), A = { x: 0, y: 0, w: G.size[0], h: G.size[1] };
      return inside(S0, F) && inside(F, A) && ["Top", "Bottom"].every((t) => { const B = box(G["banner" + t]); return inside(B, A) && !(B.y < F.y + F.h && B.y + B.h > F.y) && G["zones" + t].every((z) => inside(box(z), B)); }); });
    ok("B2 · the measured geometry holds together: the safe card area inside the inner navy field, the field inside the art; each banner clear of the field, its two text zones inside it", geomOK);
    const E4 = ART.port.emblems, corners = ["tl", "tr", "bl", "br"];
    ok("B3 · PHONE EMBLEMS: each corner's emblem is cropped from the SAME corner of the desktop art (water, flame, leaf, serpent) and baked centred in its ring, its radius (" + ART.emblemR + ") inside the ring's inner edge",
      corners.every((k) => J(E4[k].from) === J(ART.land.emblems[k]) && J(E4[k].ring) === J(ART.port.rings[k]) && E4[k].to[0] === E4[k].ring[0] && E4[k].to[1] === E4[k].ring[1] && E4[k].to[2] === ART.emblemR && ART.emblemR < E4[k].ring[2]));
    // every screen the owner named (desktop 768 / 1280 / 1920; phone 360 / 390 / 430 and a short phone), every level
    const VIEWS = [[768, 600], [1280, 800], [1920, 1080], [360, 740], [390, 844], [430, 932], [360, 560], [390, 640]];
    const PAIRS = { easy: 6, medium: 8, hard: 12 }, bad = [], sizes = {};
    for (const [vw, vh] of VIEWS) for (const lv of Object.keys(PAIRS)) {
      const L = LY.layout({ vw, vh, pairs: PAIRS[lv] }), g = L.grid, tag = vw + "x" + vh + " " + lv;
      if (L.art !== (vw >= vh ? "land" : "port")) bad.push(tag + " art");
      if (!inside(g, L.safe) || !inside(L.safe, L.field)) bad.push(tag + " grid outside the field");
      if (g.cols * g.rows !== 2 * PAIRS[lv] || Math.abs(g.cardH / g.cardW - 1.4) > 1e-9 || g.cardW < 30) bad.push(tag + " cards");
      if (L.board.x < 0 || L.board.x + L.board.w > vw + 0.01 || L.board.y + L.board.h + LY.CHROME[L.art].below > vh + 0.01) bad.push(tag + " scroll");
      sizes[tag] = g.cols + "x" + g.rows + " " + g.cardW + "x" + Math.floor(g.cardH);
    }
    ok("B4 · at all 8 screens × 3 levels the cards sit inside the art's inner field (in its safe area), keep the frame's 5:7, and the whole board + the line + the button fit the screen (no scrolling); wide screens get the landscape art, tall ones the portrait", bad.length === 0, J(bad));
    const gridOf = (vw, vh, lv) => { const g = LY.layout({ vw, vh, pairs: PAIRS[lv] }).grid; return g.cols + "x" + g.rows; };
    ok("B5 · DESKTOP grids as ruled at 768, 1280 and 1920: Easy 6×2, Medium 8×2, Hard 8×3",
      [[768, 600], [1280, 800], [1920, 1080]].every(([w, h]) => gridOf(w, h, "easy") === "6x2" && gridOf(w, h, "medium") === "8x2" && gridOf(w, h, "hard") === "8x3"));
    const largest = [[360, 740], [390, 844], [430, 932], [360, 560], [390, 640]].every(([vw, vh]) => Object.keys(PAIRS).every((lv) => {
      const L = LY.layout({ vw, vh, pairs: PAIRS[lv] }), n = 2 * PAIRS[lv];
      for (let c = 1; c <= n; c++) { if (n % c) continue; const r = n / c, w = Math.floor(Math.min((L.safe.w - (c - 1) * L.grid.gap) / c, (L.safe.h - (r - 1) * L.grid.gap) / r / 1.4)); if (w > L.grid.cardW) return false; }
      return true; }));
    ok("B6 · PHONE grids are the largest cards that fit (no exact grid of any width gives bigger): Easy 3×4, Medium 4×4, Hard 4×6 at 360, 390 and 430 wide and on short screens (Hard is no longer 6×4)",
      largest && [[360, 740], [390, 844], [430, 932], [360, 560]].every(([w, h]) => gridOf(w, h, "easy") === "3x4" && gridOf(w, h, "medium") === "4x4" && gridOf(w, h, "hard") === "4x6"), J(sizes));
    const fontOK = VIEWS.every(([vw, vh]) => { const L = LY.layout({ vw, vh, pairs: 8 }), f = L.bannerFont, z = L.zonesBottom, t = L.zonesTop;
      return f >= 11 && f <= L.bannerTop.h * 0.55 && f <= L.bannerBottom.h * 0.55 && z.every((q) => "Tries: 99".length * 0.6 * f <= q.w && "Best: 99".length * 0.6 * f <= q.w) && "Smriti".length * 0.9 * f <= t[0].w
        && (!L.epithetInBanner || ("What is seen once is never lost.".length * 0.5 * L.epithetFont <= t[1].w && L.epithetFont <= L.bannerTop.h * 0.55)); });
    ok("B7 · BANNERS: 'Smriti' rides the top banner (with the epithet on desktop, below the board on phones), 'Tries: N' and 'Best: N' the bottom one — each in a zone inside its banner, the type sized to fit 'Tries: 99' (≥ 11 px at every size; 0.6 em a character — Chrome draws 'Tries: 99' at 0.55 em in Cinzel, 54 px in a 65 px zone on the shortest phone)", fontOK);
    ok("B8 · the art file is the narrowest that covers the drawn width at the screen's pixel density (≤ 3×): a phone never loads the landscape art, a desktop never the portrait",
      LY.artSrc("port", 160, 2) === "board-port-480.webp" && LY.artSrc("port", 300, 2) === "board-port-720.webp" && LY.artSrc("port", 378, 3) === "board-port-941.webp" && LY.artSrc("land", 900, 1) === "board-land-960.webp" && LY.artSrc("land", 1248, 2) === "board-land-1672.webp");
    // on the page (jsdom, a 390×844 phone and a 1280×800 desktop)
    const ph = pageAt({ vw: 390, vh: 844, dpr: 3 }); await startLevel(ph, "hard");
    const PLh = ph.P.layout, c0 = card(ph, 0);
    ok("B9 · ON THE PAGE (390×844, Hard): the portrait art, a 4×6 grid of " + PLh.grid.cardW + " px cards, the title in the top banner, the epithet below the board, the page head stepped aside",
      ph.$("sm-art").getAttribute("src") === "art/board-port-941.webp" && ph.$("sm-board").dataset.grid === "4x6" && c0.style.width === PLh.grid.cardW + "px" && ph.w.document.body.classList.contains("sm-playing")
        && !ph.$("sm-title").hidden && ph.$("sm-epi-in").hidden && !ph.$("sm-epi-out").hidden && ph.$("sm-tries").textContent === "0");
    const dk = pageAt({ vw: 1280, vh: 800, dpr: 2 }); await startLevel(dk, "medium");
    ok("B10 · ON THE PAGE (1280×800, Medium): the landscape art, 8×2, the epithet in the top banner",
      dk.$("sm-art").getAttribute("src") === "art/board-land-1672.webp" && dk.$("sm-board").dataset.grid === "8x2" && !dk.$("sm-epi-in").hidden && dk.$("sm-epi-out").hidden);
    dk.$("sm-back").click();
    ok("B11 · leaving play gives the page head back", !dk.w.document.body.classList.contains("sm-playing") && !dk.$("sm-choose").hidden);
  });

  // ═══ BF · THE LARGE HERO FIGURE ON PHONES ═══
  await section("BF", async () => {
    console.log("\n── BF · the large Hero figure on phones ──");
    const LY = require(path.join(DIR, "layout.js")), PL = loadUMD(SRC.player);
    const mans = CARDS.filter(S.isAnimated).map((c) => [c.id, AM.forRung(c.id === "meghnad" ? JSON.parse(R("play/smriti/actors/meghnad/manifest.json")) : JSON.parse(fs.readFileSync(path.join(GAME, "assets", "manifest", "actors", c.id, "manifest.json"), "utf8")), 256)]);
    const bad = [], fr = [];
    for (const [vw, vh] of [[360, 740], [390, 844], [430, 932], [360, 560]]) for (const lv of [6, 8, 12]) {
      const L = LY.layout({ vw, vh, pairs: lv }), board = { x: 0, y: 0, w: L.board.w, h: L.board.h }, maxH = L.board.h * PL.BIG_FRACTION;
      for (const [id, m] of mans) {
        const B = PL.bigFit(m, L.field, maxH, board), b = B.box, cardK = L.grid.cardH * 1.18 / m.refHeight;
        if (!(b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= board.w + 0.01 && b.y + b.h <= board.h + 0.01)) bad.push(vw + "x" + vh + " " + id + " outside the board");
        if (b.h > maxH + 0.01 || b.h > L.field.h + 0.01) bad.push(id + " too tall");
        if (B.k < cardK * 1.5) bad.push(vw + "x" + vh + "/" + lv + " " + id + " not large");
        if (vw === 390 && vh === 844 && lv === 12) fr.push(Math.round(100 * b.h / L.board.h));
      }
    }
    ok("BF1 · for all 21 animations at 360, 390 and 430 wide and a short phone, the large figure stays inside the board, is never taller than " + Math.round(PL.BIG_FRACTION * 100) + "% of it nor than the field, and plays at least 1.5× its in-card size (at 390×844: " + Math.min(...fr) + "–" + Math.max(...fr) + "% of the board's height)", bad.length === 0 && fr.length === 21, J(bad.slice(0, 5)));
    // the same clock for an old and a new player: the desktop draw (no `big`) is byte-for-byte the R2 build
    let old = null; try { old = execFileSync("git", ["-C", SITE, "show", "6feaaec:play/smriti/player.js"], { encoding: "utf8" }); } catch (e) { old = null; }
    async function trace(src, big) {
      const P2 = loadUMD(src); P2.ANIMATION_SPEED = 1; let t = 0; const f = makeFetch(), im = makeImage();
      const p = P2.create({ AM, fetch: f.fetch, Image: im.Img, raf: (fn) => { t += 16; setImmediate(fn); }, now: () => t, pageUrl: "https://divyayuddha.games/play/smriti/" });
      await p.prepare(["indra"]); const calls = [];
      const ctx = { canvas: { width: 400, height: 800 }, clearRect() {}, fillStyle: "", fillRect() { calls.push(["fill", this.fillStyle].concat([].slice.call(arguments))); }, drawImage() { calls.push([].slice.call(arguments, 1).map((v) => Math.round(v * 1000) / 1000)); }, globalAlpha: 1 };
      await p.play("indra", ctx, { x: 100, y: 300, w: 80, h: 112 }, null, big);
      return calls;
    }
    const tNew = await trace(SRC.player), tOld = old ? await trace(old) : null;
    ok("BF2 · DESKTOP UNCHANGED: with no large placement every frame the player draws is identical to the R2 build (6feaaec) — " + tNew.length + " draws", !!tOld && tNew.length > 20 && J(tNew) === J(tOld));
    const big = { x: 10, y: 60, w: 310, h: 500, maxH: 430, bound: { x: 0, y: 0, w: 378, h: 672 } };
    const tBig = await trace(SRC.player, big), dr = tBig.filter((c) => c[0] !== "fill"), fills = tBig.filter((c) => c[0] === "fill");
    const maxW = Math.max(...dr.map((c) => c[6])), firstW = dr[0][6];
    ok("BF3 · PHONE: the figure rises from the card size, grows LARGE (" + Math.round(firstW) + " → " + Math.round(maxW) + " px wide frame), and shrinks back as it settles; the board under it dims a little (veil ≤ 0.38) over the board's field only",
      maxW > firstW * 1.5 && dr[dr.length - 1][6] < maxW * 0.8 && fills.length > 10 && fills.every((c) => c[2] === 10 && c[3] === 60 && c[4] === 310 && c[5] === 500 && parseFloat(c[1].split(",")[3]) <= 0.38));
    // on the page: phones pass the large placement, desktops do not; reduced motion still skips
    const ph = pageAt({ vw: 390, vh: 844, dpr: 3 }); await startLevel(ph, "easy");
    const ht = ph.P.game.tiles.find((t) => S.isAnimated(t.card)); tapT(ph, ht.i); await idle(ph);
    const dk = pageAt({ vw: 1280, vh: 800, dpr: 2 }); await startLevel(dk, "easy");
    const dt = dk.P.game.tiles.find((t) => S.isAnimated(t.card)); tapT(dk, dt.i); await idle(dk);
    const pb = ph.bigs[0];
    ok("BF4 · ON THE PAGE a phone asks for the large figure (" + Math.round(PL.BIG_FRACTION * 100) + "% of the board's height, bounded by the board) and the board waits; a desktop plays it out of the card as built",
      ph.plays.length === 1 && !!pb && Math.abs(pb.maxH - ph.P.layout.board.h * PL.BIG_FRACTION * 2) < 0.01 && !!pb.bound && dk.plays.length === 1 && dk.bigs[0] === null, J({ php: ph.plays, pb: pb && { maxH: pb.maxH, bound: !!pb.bound }, want: ph.P.layout && ph.P.layout.board.h * PL.BIG_FRACTION * 2, dkp: dk.plays, dkb: dk.bigs }));
    const rm = pageAt({ vw: 390, vh: 844, reduce: true }); await startLevel(rm, "hard");
    const rh = rm.P.game.tiles.find((t) => S.isAnimated(t.card)); tapT(rm, rh.i);
    ok("BF5 · reduced motion on a phone: no figure, small or large, and no wait", rm.plays.length === 0 && rm.P.busy === false && rm.P.game.tiles[rh.i].up);
  });

  // ═══ G · THE MULLIGAN LOOK AND THE WAY BACK (owner rulings 2026-10-16) ═══
  await section("G", async () => {
    console.log("\n── G · the mulligan look and '← Back to the game' ──");
    const crypto = require("crypto"), shaB = (b) => crypto.createHash("sha256").update(b).digest("hex");
    const PLATE = JSON.parse(R("play/shared/plate.json")), SH = path.join(SITE, "play", "shared");
    let origOK = false;
    try { origOK = ["port", "wide"].every((k) => shaB(execFileSync("git", ["-C", GAME, "show", PLATE.gameCommit + ":" + PLATE.originals[k].path], { maxBuffer: 1 << 26 })) === PLATE.originals[k].sha256); } catch (e) { origOK = false; }
    ok("G1 · THE BACKGROUND is the game's own mulligan plate: both originals (" + PLATE.originals.port.path + ", " + PLATE.originals.wide.path + ") match the game at " + PLATE.gameCommit + " byte for byte, baked to four WebP files whose bytes plate.json records; no PNG copied",
      PLATE.gameCommit === "ad978f0" && origOK && J(Object.keys(PLATE.files).sort()) === J(["mull-port-480.webp", "mull-port-853.webp", "mull-wide-1024.webp", "mull-wide-1536.webp"])
        && Object.keys(PLATE.files).every((f) => { const b = fs.readFileSync(path.join(SH, f)); return b.length === PLATE.files[f].bytes && shaB(b) === PLATE.files[f].sha256 && b.slice(8, 12).toString() === "WEBP"; })
        && fs.readdirSync(SH).every((f) => !/\.png$/i.test(f)));
    let gameHtml = ""; try { gameHtml = execFileSync("git", ["-C", GAME, "show", PLATE.gameCommit + ":index.html"], { maxBuffer: 1 << 26, encoding: "utf8" }); } catch (e) {}
    const mini = R("play/shared/mini.css");
    const fromGame = [/\.ms-dim\{ background:(linear-gradient\([^;]*\)); \}/, /\.ms-vig\{ background:(radial-gradient\([^;]*\)); \}/, /#mullplate\{[^}]*filter:(brightness\(\.6\) saturate\(\.9\) contrast\(1\.02\));/,
      /\.fsel-start\{[^}]*background:(linear-gradient\(180deg,#e6c47a 0%,#a5813a 45%,#6e5526 100%\)); box-shadow:(0 6px 18px rgba\(0,0,0,\.55\));/, /\.fsel-start:hover\{ filter:(brightness\(1\.1\) drop-shadow\(0 0 12px rgba\(255,205,120,\.3\)\));/]
      .map((re) => (gameHtml.match(re) || []).slice(1)).flat();
    const norm = (t) => t.replace(/\s+/g, "").replace(/,/g, ",");
    ok("G2 · the scrim, vignette, plate filter and the plaque button's bevel, shadow and glow are the game mulligan's own values (read from the game at " + PLATE.gameCommit + ")",
      fromGame.length === 6 && fromGame.every((v) => norm(mini).indexOf(norm(v)) >= 0) && /\.mg-btn::before \{[^}]*linear-gradient\(180deg, #2b1c0a 0%, #160d05 52%, #221407 100%\)/.test(mini) && /min-height: 44px/.test(mini), J(fromGame));
    ok("G3 · like the game: the portrait plate below 1024 px wide, the wide plate from 1024 px, the smaller file on small low-density screens; if the plate fails the page stays on the mulligan's ink ground (#070402)",
      /\.mg-plate \{[^}]*#070402 url\("mull-port-480\.webp"\)/.test(mini) && /\(min-width: 600px\), \(min-resolution: 1\.5dppx\) \{ \.mg-plate \{ background-image: url\("mull-port-853\.webp"\)/.test(mini)
        && /\(min-width: 1024px\) \{ \.mg-plate \{ background-image: url\("mull-wide-1024\.webp"\)/.test(mini) && /\.mg-stage \{[^}]*background: #070402/.test(mini));
    // the rule
    const BK = require(path.join(SITE, "play", "shared", "back.js")), FREE = "https://sangbaran-purr.github.io/divya-yuddha/";
    const here = "https://divyayuddha.games/play/smriti/", T = (r) => BK.target(r, here);
    ok("G4 · THE WAY BACK: from the site's /game/ copy → that copy (its stamp kept); from the free game (a cross-site referrer is only its origin, or its full menu URL) → the free game's menu; from anywhere else, or nowhere (a direct link, a new tab) → the free game's menu",
      BK.FREE === FREE && J(T("https://divyayuddha.games/game/index.html?v=ad978f0")) === J({ url: "https://divyayuddha.games/game/index.html?v=ad978f0", from: "site" })
        && J(T("https://divyayuddha.games/game/")) === J({ url: "https://divyayuddha.games/game/", from: "site" })
        && J(T("https://sangbaran-purr.github.io/")) === J({ url: FREE, from: "free" }) && J(T("https://sangbaran-purr.github.io/divya-yuddha/index.html")) === J({ url: FREE, from: "free" })
        && J(T("")) === J({ url: FREE, from: null }) && J(T("https://www.google.com/")) === J({ url: FREE, from: null }) && J(T("https://divyayuddha.games/dashboard.html")) === J({ url: FREE, from: null })
        && J(T("https://divyayuddha.games/rite.html")) === J({ url: FREE, from: null }) && J(T("https://evil.example/game/index.html")) === J({ url: FREE, from: null }));
    const fakeWin = (ref, len, leaves) => { const w = { calls: [], location: { href: here }, history: { length: len, back() { w.calls.push("back"); if (leaves) w.hide && w.hide(); } },
      addEventListener(ev, fn) { if (ev === "pagehide") w.hide = fn; }, setTimeout(fn) { w.calls.push("timer"); fn(); } }; BK.go({ referrer: ref }, w); return w; };
    const a = fakeWin("https://divyayuddha.games/game/index.html?v=ad978f0", 3, true), b = fakeWin("https://sangbaran-purr.github.io/", 2, false), c = fakeWin("https://sangbaran-purr.github.io/", 1, false), d = fakeWin("", 4, false);
    ok("G5 · …in the SAME tab: with the game menu in this tab's history it goes back through history (the menu as it was); if history can't go back it follows the link; arrived any other way it opens the free game's menu — never a new window",
      J(a.calls) === J(["back", "timer"]) && a.location.href === here && J(b.calls) === J(["back", "timer"]) && b.location.href === FREE && J(c.calls) === J([]) && c.location.href === FREE
        && J(d.calls) === J([]) && d.location.href === FREE && !/window\.open|_blank/.test(R("play/shared/back.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")));
    // the Smriti page
    const pg = pageAt({ store: { dy_smriti: JSON.stringify({ v: 1, best: { easy: 7, hard: 15 } }) } });
    const lvs = [...pg.w.document.querySelectorAll(".sm-lv")];
    const backs = (sel) => [...pg.w.document.querySelectorAll(sel + " [data-back-to-game]")];
    ok("G6 · the level screen: the three levels are mulligan buttons, each with its name, pairs and best ('Best: 7 tries' / 'No best yet' / 'Best: 15 tries'); '← Back to the game' below them, a link to the free game's menu even without scripts; the mulligan background behind",
      lvs.length === 3 && lvs.every((b) => b.classList.contains("mg-btn")) && lvs.map((b) => b.querySelector(".sm-lvbest").textContent).join("|") === "Best: 7 tries|No best yet|Best: 15 tries"
        && backs("#sm-choose").length === 1 && backs("#sm-choose")[0].textContent === "← Back to the game" && backs("#sm-choose")[0].getAttribute("href") === FREE
        && !!pg.w.document.querySelector(".mg-stage .mg-plate") && /body\.sm-playing \.mg-stage \{ display: none; \}/.test(R("play/smriti/smriti.css")), J(lvs.map((b) => b.textContent)));
    const ev = new pg.w.MouseEvent("click", { bubbles: true, cancelable: true }); backs("#sm-choose")[0].dispatchEvent(ev);
    ok("G7 · tapping it is the shared rule (the click is taken by back.js, and the page navigates once)", ev.defaultPrevented === true && pg.navs.length === 1, J(pg.navs));
    lvs[1].click(); await until(() => pg.P.game && !pg.P.busy, 15000);
    ok("G8 · a level button starts its level: Medium deals 16 cards", pg.P.game.level === "medium" && pg.P.game.tiles.length === 16 && pg.$("sm-choose").hidden && !pg.$("sm-play").hidden);
    await solveAll(pg);
    const ends = ["sm-again", "sm-choose-again"].map((i) => pg.$(i));
    ok("G9 · the finished screen: 'Play again', 'Choose a level' and '← Back to the game' are mulligan buttons", ends.every((b) => b.classList.contains("mg-btn")) && ends.map((b) => b.textContent).join("|") === "Play again|Choose a level"
      && backs("#sm-done").length === 1 && backs("#sm-done")[0].classList.contains("mg-btn") && backs("#sm-done")[0].textContent === "← Back to the game" && !pg.$("sm-done").hidden);
    const sb = pageAt({ blocked: true });
    ok("G10 · storage blocked: the level screen still says 'This browser isn't saving your best scores.' (hidden only during play)", sb.$("sm-store").textContent === "This browser isn't saving your best scores." && !sb.w.document.body.classList.contains("sm-playing"));
    // the Daily Puzzle: ONLY the back button
    const dNow = R("play/daily/index.html");
    ok("G11 · THE DAILY PUZZLE carries the same '← Back to the game' (the mulligan button, under the logo, the shared rule and stylesheet) — the page's own mulligan restyle is checked in the daily suite (ML1–ML8)",
      /<header class="dd-top">[\s\S]*<a class="mg-btn mg-back dd-home" href="https:\/\/sangbaran-purr\.github\.io\/divya-yuddha\/" data-back-to-game>← Back to the game<\/a>\n    <\/header>/.test(dNow)
        && /<script src="\.\.\/shared\/back\.js\?v=g1"><\/script>/.test(dNow) && /<link rel="stylesheet" href="\.\.\/shared\/mini\.css\?v=g2" \/>/.test(dNow));
    const dvc = []; const vc = new VirtualConsole(); vc.on("jsdomError", (e) => { if (/navigation/.test(e.message)) dvc.push(1); });
    const dd = new JSDOM(dNow.replace(/<script src="[^"]*"><\/script>/g, "") + "<script>" + R("play/shared/back.js") + "</script>", { url: "https://divyayuddha.games/play/daily/", runScripts: "dangerously", virtualConsole: vc });
    const db = dd.window.document.querySelector("[data-back-to-game]"), dev = new dd.window.MouseEvent("click", { bubbles: true, cancelable: true }); db.dispatchEvent(dev);
    ok("G12 · …and on the Daily Puzzle page it is wired to the same rule (taken by back.js, one navigation)", dev.defaultPrevented === true && dvc.length === 1 && db.getAttribute("href") === FREE);
  });

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  if (fail) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})().catch((e) => { console.error(e); process.exitCode = 1; });
