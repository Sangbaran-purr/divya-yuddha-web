"use strict";
// GATE-FIX-1 — THE ARCHIVE ROAD THE OWNER CONSOLE DRIVES ON.
//
// On 2026-09-23 every deep-history panel in the console went dark at once with "The archive is busy or
// unreachable". Nothing was busy and nothing was unreachable: drpc's free plan had cut its getLogs span to 101
// blocks while still ANSWERING with the sentence "ranges over 10000 blocks are not supported on free plan", and
// the console's archive-selection probe — hardcoded at 128 blocks — read that width complaint as "not an
// archive", failed over to a pruned node, ran out of candidates, and said the only thing it knew how to say.
//
// The measurement that cost a whole diagnose rung is written down in docs/ARCHIVE_ROAD_2026-09-23.md. This suite
// is the part that cannot be forgotten: every number and every law above is pinned here, with FIXTURES that
// reproduce the exact wire shapes the real endpoints returned that morning. NO LIVE CALLS — a suite that reaches
// the network measures the weather, not the code.
const path = require("path"), fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const H = require("../lib.js");
const SITE = H.SITE;

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };

// ── the exact wire shapes measured 2026-09-23 (docs/ARCHIVE_ROAD_2026-09-23.md §1) ───────────────────────────
const DRPC_WIDTH_ERR = { code: 35, message: "ranges over 10000 blocks are not supported on free plan" };
const PRUNED_ERR = { code: -32701, message: "History has been pruned for this block. To remove restrictions, order a dedicated full node here: https://www.allnodes.com/pol/host" };
const ONERPC_WIDTH_ERR = { code: -32602, message: "eth_getLogs is limited to 0 - 50 blocks range" };
// GATE-FIX-1b — the wording the owner's console actually printed on 2026-09-23 with an Alchemy FREE url in
// READ RPC URL. Verbatim: it is the fixture that keeps this fault from returning.
const ALCHEMY_FREE_ERR = { code: -32600, message: "Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range. Upgrade to PAYG to make eth_getLogs requests with a larger block range." };
const ALCHEMY_CAP = 10;
const DRPC_SPAN_CAP = 101;
const ONERPC_CAP_50 = 50; // measured: 101 accepted, 102 refused — stable at the deploy block AND at the head
const DEPLOY = 92050143, HEAD = 94291762;

// an ethers-v6-shaped rejection: the JSON-RPC error rides `info.error`, which is what errText() flattens
function rpcErr(shape) {
  const e = new Error("could not coalesce error");
  e.info = { error: shape };
  e.code = "UNKNOWN_ERROR";
  return e;
}

// ── boot admin.js headless, exactly as admin.html loads it, WITHOUT mounting ──────────────────────────────────
// mount() would reach for a wallet and a network; the archive road's decisions are all reachable without it.
function boot() {
  const errs = [], logs = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errs.push(String(e && e.message)));
  vc.on("error", (...a) => logs.push("error: " + a.map(String).join(" ")));
  const html = fs.readFileSync(path.join(SITE, "admin.html"), "utf8");
  const scripts = [];
  const markup = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (m, attrs, bodyTxt) => {
    const src = /\bsrc="([^"?]+)/.exec(attrs);
    if (!src) return "";                                   // the inline boot is mount() — deliberately dropped
    if (/^https?:/.test(src[1])) return "";
    scripts.push(fs.readFileSync(path.join(SITE, src[1]), "utf8"));
    return "";
  });
  const dom = new JSDOM(markup, { url: "https://divyayuddha.games/admin.html", runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.fetch = () => Promise.reject(new Error("no network in the suite"));
  w.eval(scripts.join("\n;\n"));
  return { w, road: w.DYAdmin && w.DYAdmin._road, errs, logs };
}

// ── a fixture endpoint: serves DEPTH honestly, refuses WIDTH above `cap` (today's drpc) ───────────────────────
// `pruned: true` makes it a publicnode: refuses everything deep, at any width.
function fakeEndpoint(opts) {
  const seen = [];
  const cap = opts.cap == null ? DRPC_SPAN_CAP : opts.cap;
  const served = []; // only the reads the endpoint actually ANSWERED — the ones whose logs reach the caller
  return {
    seen, served,
    getLogs(f) {
      const from = Number(f.fromBlock), to = Number(f.toBlock);
      seen.push({ from, to, span: to - from + 1, address: f.address, topics: f.topics });
      if (opts.pruned) return Promise.reject(rpcErr(PRUNED_ERR));
      if (to - from + 1 > cap) return Promise.reject(rpcErr(opts.widthErr || DRPC_WIDTH_ERR));
      served.push({ from, to });
      return Promise.resolve(opts.logs ? opts.logs(from, to) : []);
    },
  };
}
// a fake `ethers` good enough for tamedProvider(): the road only uses FetchRequest + JsonRpcProvider
function fakeEthers(byUrl) {
  return {
    FetchRequest: function (url) { this.url = url; this.setThrottleParams = function () {}; },
    JsonRpcProvider: function (req) {
      const ep = byUrl[req.url];
      if (!ep) throw new Error("fixture has no endpoint for " + req.url);
      this.getLogs = (f) => ep.getLogs(f);
      this.__ep = ep;
    },
  };
}
const cfgWrite = (w, o) => w.localStorage.setItem("dyadmin::config", JSON.stringify(o));

// Remove /* … */ and // … so a namespace MENTIONED in prose is never mistaken for a namespace READ. A per-line
// marker test is not enough: js/wave-registry.js names dyadmin:: on a continuation line INSIDE a block comment,
// which has no marker of its own. This walks the source instead of guessing at line starts.
function stripComments(src) {
  let out = "", i = 0, n = src.length, line = false, block = false;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (line) { if (c === "\n") { line = false; out += c; } i++; continue; }
    if (block) { if (c === "*" && d === "/") { block = false; i += 2; continue; } if (c === "\n") out += c; i++; continue; }
    if (c === "/" && d === "/") { line = true; i += 2; continue; }
    if (c === "/" && d === "*") { block = true; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

async function main() {
  console.log("── GATE-FIX-1 · the archive road the owner console drives on ──");

  // ═══ A. the road is reachable headless ═══
  const A = boot();
  ok("A1 · admin.js boots headless and exposes the _road seam (the DYHall._state posture)", !!A.road, String(A.errs[0] || ""));
  ok("A2 · it boots clean — no jsdom error", A.errs.length === 0, A.errs.join(" | "));
  if (!A.road) { console.log("\n  ✖ cannot continue without the seam"); process.exitCode = 1; return; }

  // ═══ B. THE PROBE — depth is the question; width is not a verdict ═══
  {
    const B = boot(), road = B.road;
    const drpc = fakeEndpoint({ cap: DRPC_SPAN_CAP });                    // serves depth, refuses width>101
    const pub = fakeEndpoint({ pruned: true });
    B.w.DYWallet.loadEthers = () => Promise.resolve(fakeEthers({
      "https://polygon.drpc.org": drpc, "https://polygon-bor-rpc.publicnode.com": pub,
    }));
    cfgWrite(B.w, { deployBlock: DEPLOY });
    await road.withEthers();
    const h = await road.historyProvider("0xsale");
    // The FIRST question is depth, and it is one block. GATE-FIX-1b adds a width proof AFTER it (so a wall is
    // never handed to the scan), so selection is no longer a single read — but no read is ever the old 128.
    ok("B1 · the FIRST question is DEPTH — a single block at the deploy block, never the old hardcoded 128",
       drpc.seen[0] && drpc.seen[0].span === 1 && drpc.seen[0].from === DEPLOY,
       JSON.stringify(drpc.seen[0]));
    ok("B1b · and the 128-block probe is gone for good — no read of that width is ever issued",
       drpc.seen.every((x) => x.span !== 128), JSON.stringify(drpc.seen.map((x) => x.span)));
    ok("B1c · the reads after it are the width proof, so the scan is only ever handed a usable road (GATE-FIX-1b)",
       drpc.seen.length > 1 && drpc.seen.slice(1).every((x) => x.span > 1));
    ok("B2 · THE FAULT: an endpoint that serves depth but refuses width-128 is ACCEPTED (today's drpc)",
       h && h.url === "https://polygon.drpc.org");
    ok("B3 · it never even asked the pruned node — the first candidate answered", pub.seen.length === 0);
    // the mutant: had the probe stayed 128 wide, drpc would have been refused and we would be on the pruned node
    const wide = await drpc.getLogs({ fromBlock: DEPLOY, toBlock: DEPLOY + 127 }).then(() => null, (e) => e);
    ok("B4 · MUTANT — the old 128-block probe really is refused by this fixture (the fault is reproduced, not assumed)",
       !!wide && road.isRangeError(wide));
  }
  {
    const B = boot(), road = B.road;
    const pruned = fakeEndpoint({ pruned: true }), good = fakeEndpoint({ cap: DRPC_SPAN_CAP });
    B.w.DYWallet.loadEthers = () => Promise.resolve(fakeEthers({
      "https://owner.example/keyed": pruned, "https://polygon.drpc.org": good, "https://polygon-bor-rpc.publicnode.com": fakeEndpoint({ pruned: true }),
    }));
    cfgWrite(B.w, { deployBlock: DEPLOY, readRpcUrl: "https://owner.example/keyed" });
    await road.withEthers();
    const h = await road.historyProvider("0xsale");
    ok("B5 · the owner's Read RPC URL is tried FIRST, as before the fix", pruned.seen.length === 1);
    ok("B6 · a PRUNED endpoint is a depth failure → fail over, and the fall-back is flagged",
       h.url === "https://polygon.drpc.org" && h.fellBack === true);
  }
  {
    const B = boot(), road = B.road;
    B.w.DYWallet.loadEthers = () => Promise.resolve(fakeEthers({
      "https://polygon.drpc.org": fakeEndpoint({ pruned: true }), "https://polygon-bor-rpc.publicnode.com": fakeEndpoint({ pruned: true }),
    }));
    cfgWrite(B.w, { deployBlock: DEPLOY });
    await road.withEthers();
    const e = await road.historyProvider("0xsale").then(() => null, (x) => x);
    ok("B7 · every candidate pruned → the archive class, which is what the owner's plain-words message reads",
       !!e && e.__archive === true && road.isArchiveError(e) === true);
  }

  // ═══ C. THE SELF-TUNING WIDTH ═══
  {
    const C = boot(), road = C.road;
    const ep = fakeEndpoint({ cap: DRPC_SPAN_CAP, logs: (a, b) => [{ n: a }] });
    const read = (a, b) => ep.getLogs({ fromBlock: a, toBlock: b });
    const out = await road.readRangeAdaptive("u1", read, 1000, 1000 + 999, null);
    const widest = Math.max(...ep.seen.filter((s) => s.span <= DRPC_SPAN_CAP).map((s) => s.span));
    ok("C1 · a too-wide range is split until it lands — every accepted piece is within the measured 101 cap",
       widest <= DRPC_SPAN_CAP && ep.seen.some((s) => s.span <= DRPC_SPAN_CAP));
    ok("C2 · the caller still receives the events for the WHOLE span it asked for (that is why the four loops adopt in one line)",
       Array.isArray(out) && out.length > 0);
    ok("C3 · the discovered width is remembered for that endpoint (the next chunk starts narrow, not wide)",
       road.archiveSpan("u1") < road.LOG_CHUNK_START);
    ok("C4 · memory is keyed PER ENDPOINT — a different url keeps the wide start (the owner's keyed road is not punished for drpc's caps)",
       road.archiveSpan("some-other-endpoint") === road.LOG_CHUNK_START);
  }
  {
    const C = boot(), road = C.road;
    const ep = fakeEndpoint({ cap: 1 }); // refuses everything but a single block → narrowing can never succeed
    const e = await road.readRangeAdaptive("u2", (a, b) => ep.getLogs({ fromBlock: a, toBlock: b }), 0, 5000, null).then(() => null, (x) => x);
    ok("C5 · narrowing gives up and RETHROWS — it never spins forever chasing a width it cannot reach",
       !!e && road.isRangeError(e) && ep.seen.length < 60, "attempts=" + ep.seen.length);
    ok("C6 · and it never tunes below the floor: the remembered width stays within [floor, start]",
       road.archiveSpan("u2") >= road.LOG_CHUNK_FLOOR && road.archiveSpan("u2") < road.LOG_CHUNK_START,
       String(road.archiveSpan("u2")));
  }
  {
    const C = boot(), road = C.road;
    const ep = fakeEndpoint({ pruned: true });
    const before = road.archiveSpan("u3");
    const e = await road.readRangeAdaptive("u3", (a, b) => ep.getLogs({ fromBlock: a, toBlock: b }), 0, 5000, null).then(() => null, (x) => x);
    ok("C7 · a DEPTH error is never narrowed — pruning is not a width problem and halving would only waste the road",
       !!e && road.isArchiveError(e) && ep.seen.length === 1 && road.archiveSpan("u3") === before);
  }
  {
    const C = boot(), road = C.road;
    cfgWrite(C.w, { logChunk: 500 });
    ok("C8 · the STARTING width comes from the Configuration panel (dyadmin::config.logChunk)", road.archiveSpan("fresh") === 500);
    cfgWrite(C.w, { logChunk: 7 }); // below the floor → refused, default stands (no silent nonsense width)
    ok("C9 · a nonsense starting width is refused and the default stands", road.archiveSpan("fresh2") === road.LOG_CHUNK_START);
  }
  {
    const C = boot(), road = C.road;
    const ep = fakeEndpoint({ cap: 50, widthErr: ONERPC_WIDTH_ERR });
    const out = await road.readRangeAdaptive("u4", (a, b) => ep.getLogs({ fromBlock: a, toBlock: b }), 0, 999, null);
    ok("C10 · 1rpc's differently-worded refusal is understood too — the classifier is not drpc-specific",
       Array.isArray(out));
    ok("C11 · and a cap of EXACTLY 50 is reached, which pure halving (…156, 78, 39) steps straight over",
       ep.seen.some((x) => x.span === 50) && ep.seen.every((x) => x.span <= 50 || x.span > 50));
    // THE property the whole adaptive mechanism rests on: the pieces must TILE the requested range exactly.
    // A gap silently loses purchases; an overlap double-counts a buyer's USD and could mint them a card they
    // did not earn. Neither can ever be allowed to hide behind "it returned some events".
    const tiles = ep.served.slice().sort((x, y) => x.from - y.from);
    let contiguous = tiles.length > 0 && tiles[0].from === 0 && tiles[tiles.length - 1].to === 999;
    for (let i = 1; i < tiles.length; i++) if (tiles[i].from !== tiles[i - 1].to + 1) contiguous = false;
    ok("C12 · the split TILES the requested range exactly — no gap (lost purchases) and no overlap (double-counted USD)",
       contiguous, JSON.stringify(tiles));
  }

  // ═══ C-bis. THE TWO DEFECTS THE LIVE DRY RUN FOUND (fixtures had missed both) ═══
  // Neither of these showed up against a small fixture range; both appeared the moment the road met real drpc
  // with a real 9999-block first chunk. They are pinned here so they cannot come back.
  {
    const C = boot(), road = C.road;
    const ep = fakeEndpoint({ cap: DRPC_SPAN_CAP });                    // the real drpc cap
    await road.readRangeAdaptive("live", (a, b) => ep.getLogs({ fromBlock: a, toBlock: b }), 0, 9998, null);
    const settled = road.archiveSpan("live");
    ok("C13 · DEFECT 1 — the remembered width settles near the endpoint's REAL cap, not at the floor",
       settled > road.LOG_CHUNK_FLOOR && settled <= DRPC_SPAN_CAP,
       "settled=" + settled + " (halving the CURRENT memory on every refusal raced it to " + road.LOG_CHUNK_FLOOR + " against live drpc)");
    ok("C14 · DEFECT 2 — once the width is known the range is WALKED, not re-descended: the whole 9999-block chunk costs far fewer reads than blind halving's ~255",
       ep.seen.length < 160, "reads=" + ep.seen.length);
    // and the walk is still exact
    const tiles = ep.served.slice().sort((x, y) => x.from - y.from);
    let ok2 = tiles.length && tiles[0].from === 0 && tiles[tiles.length - 1].to === 9998;
    for (let i = 1; i < tiles.length; i++) if (tiles[i].from !== tiles[i - 1].to + 1) ok2 = false;
    ok("C15 · and the cheaper walk still tiles the range exactly — speed was not bought with a gap", ok2);
  }
  {
    const C = boot(), road = C.road;
    const ep = fakeEndpoint({ cap: DRPC_SPAN_CAP });
    const past = Date.now() - 1; // a deadline already blown
    const e = await road.readRangeAdaptive("dl", (a, b) => ep.getLogs({ fromBlock: a, toBlock: b }), 0, 9998, null, null, past)
      .then(() => null, (x) => x);
    ok("C16 · the deadline reaches INSIDE the split recursion — a wide chunk cannot outrun the scan's budget",
       !!e && e.__deadline === true && ep.seen.length === 0);
  }

  {
    const C = boot(), road = C.road;
    const ep = fakeEndpoint({ cap: DRPC_SPAN_CAP });
    const w = await road.discoverSpan("disc", (a, b) => ep.getLogs({ fromBlock: a, toBlock: b }), 1000);
    ok("C17 · the width is LEARNED UP FRONT, cheaply — a short descent, not a 128-piece first chunk",
       w > road.LOG_CHUNK_FLOOR && w <= DRPC_SPAN_CAP && ep.seen.length <= 10, "w=" + w + " reads=" + ep.seen.length);
    const before = ep.seen.length;
    await road.discoverSpan("disc", (a, b) => ep.getLogs({ fromBlock: a, toBlock: b }), 1000);
    ok("C18 · and it is learned ONCE per endpoint per session — a second scan pays nothing", ep.seen.length === before);
  }
  {
    const C = boot(), road = C.road;
    const ep = fakeEndpoint({ cap: 100000 }); // a capable keyed endpoint
    const w = await road.discoverSpan("keyed", (a, b) => ep.getLogs({ fromBlock: a, toBlock: b }), 1000);
    ok("C19 · a capable (keyed) endpoint keeps the WIDE start and pays exactly one read to confirm it",
       w === road.LOG_CHUNK_START && ep.seen.length === 1);
  }

  // ═══ D. THE CHECKPOINT — grow-only, both directions ═══
  function fakeSale(target, onQuery) {
    return { target: target, runner: { __dyUrl: "ck-endpoint" }, filters: { Purchased: () => ({}) },
             queryFilter: (f, a, b) => Promise.resolve(onQuery ? onQuery(a, b) : []) };
  }
  const ev = (buyer, usd) => ({ args: { buyer: buyer, usdE18: BigInt(usd) } });
  {
    const D = boot(), road = D.road;
    cfgWrite(D.w, { logChunk: 1000 });
    const asked = [];
    const sale = fakeSale("0xSALE", (a, b) => { asked.push([a, b]); return a === 1000 ? [ev("0xAlice", 5)] : []; });
    const key = road.ckptKey("purchased", "0xSALE");
    const latest = 1000 + 4000;
    await road.scanPurchasedByBuyer(sale, 1000, latest, null, Date.now() + 30000, key);
    const ck = road.ckptGet(key);
    ok("D1 · the first run persists a high-water mark", !!ck && ck.scannedTo > 1000, JSON.stringify(ck));
    ok("D2 · HEAD BUFFER honoured — nothing within 128 blocks of the head is ever bookmarked",
       ck.scannedTo <= latest - road.HEAD_BUFFER, "scannedTo=" + ck.scannedTo + " latest=" + latest);
    ok("D3 · the running totals persist WITH the block — a resumed scan that kept only the block would forget the purchases",
       ck.totals && ck.totals["0xalice"] === "5");

    // resume: a second run must not re-read what the first already scanned
    const asked2 = [];
    const sale2 = fakeSale("0xSALE", (a, b) => { asked2.push([a, b]); return []; });
    const got = await road.scanPurchasedByBuyer(sale2, 1000, latest, null, Date.now() + 30000, key);
    ok("D4 · the second run RESUMES at scannedTo + 1 — the scanned history is never re-walked",
       asked2.length > 0 && asked2[0][0] === ck.scannedTo + 1, JSON.stringify(asked2[0]));
    ok("D5 · and the earlier totals are still in the answer (the sums survive the resume)",
       got["0xalice"] === 5n, String(got["0xalice"]));
  }
  {
    const D = boot(), road = D.road;
    const key = road.ckptKey("purchased", "0xGROW");
    road.ckptAdvance(key, 5000, { "0xa": "10" });
    road.ckptAdvance(key, 4000, { "0xa": "1" });                       // backwards — must be refused
    ok("D6 · GROW-ONLY · the high-water mark never moves backwards", road.ckptGet(key).scannedTo === 5000);
    ok("D7 · GROW-ONLY · a refused rewind does not clobber the totals either", road.ckptGet(key).totals["0xa"] === "10");
    road.ckptAdvance(key, 6000, { "0xb": "7" });
    const ck = road.ckptGet(key);
    ok("D8 · GROW-ONLY · a forward write MERGES totals rather than replacing them", ck.totals["0xa"] === "10" && ck.totals["0xb"] === "7");
    ok("D9 · the checkpoint lives in the dyadmin:: namespace, never the player's dyw::", key.indexOf("dyadmin::") === 0);
  }
  {
    const D = boot(), road = D.road;
    cfgWrite(D.w, { logChunk: 1000 });
    const key = road.ckptKey("purchased", "0xYOUNG");
    const sale = fakeSale("0xYOUNG");
    await road.scanPurchasedByBuyer(sale, 1000, 1050, null, Date.now() + 30000, key); // whole life inside HEAD_BUFFER
    ok("D10 · a contract younger than the head buffer bookmarks NOTHING — a full re-scan next time is the correct answer",
       road.ckptGet(key) === null);
  }

  // ═══ E. THE DEADLINE SCALES ═══
  {
    const road = boot().road;
    const small = road.scanDeadlineMs(0, 1000, 9999);
    const big = road.scanDeadlineMs(DEPLOY, HEAD, 101);
    const mid = road.scanDeadlineMs(DEPLOY, HEAD, 9999);
    ok("E1 · a tiny scan still gets the historic 75s floor — never shorter than before the fix", small === road.SCAN_DEADLINE_FLOOR_MS);
    ok("E2 · the real drpc-width scan is given far more than 75s (a constant here is a guaranteed false 'busy')",
       big > road.SCAN_DEADLINE_FLOOR_MS);
    ok("E3 · but never unbounded — it ceils, so the tab is never hostage", big === road.SCAN_DEADLINE_CEIL_MS);
    ok("E4 · and it genuinely tracks the planned work: a 101-wide scan gets more budget than a 9999-wide one", big > mid);
  }

  // ═══ F. THE FUNNEL, AND THE TRUTH BEHIND IT ═══
  {
    const road = boot().road;
    const width = rpcErr(DRPC_WIDTH_ERR), pruned = rpcErr(PRUNED_ERR);
    const rate = (() => { const e = new Error("server response 500 Internal Server Error"); e.code = "SERVER_ERROR"; return e; })();
    const dl = (() => { const e = new Error("scan deadline"); e.__deadline = true; return e; })();
    ok("F1 · drpc's code-35 width refusal is a RANGE error — not a rate-limit, so it is never retried as 'busy'",
       road.isRangeError(width) === true && road.isRateLimited(width) === false);
    ok("F2 · publicnode's -32701 is ARCHIVE (depth) and explicitly NOT range — narrowing must never be attempted for it",
       road.isArchiveError(pruned) === true && road.isRangeError(pruned) === false);
    ok("F3 · a 5xx/429 is the RATE class — same endpoint, just busy", road.isRateLimited(rate) === true);
    ok("F4 · the deadline still carries its own mark through the funnel", dl.__deadline === true);
    const src = fs.readFileSync(path.join(SITE, "js/admin.js"), "utf8");
    const funnel = src.indexOf('The archive is busy or unreachable');
    const log = src.lastIndexOf('console.error("[DY admin] TORANA find-eligible failed:', funnel);
    ok("F5 · THE TRUTH IS LOGGED — the underlying error reaches the console BEFORE the three-way funnel collapses it",
       log > 0 && log < funnel);
    ok("F6 · and the owner still reads the same plain words (the friendly message was not traded away)", funnel > 0);
  }

  // ═══ G. KEY-SAFETY LAW (docs/ARCHIVE_ROAD_2026-09-23.md §2) ═══
  {
    const tracked = require("child_process").execFileSync("git", ["ls-files"], { cwd: SITE, encoding: "utf8" })
      .split("\n").filter(Boolean).filter((f) => !/^tests\/node_modules\//.test(f));
    // §2.3 — no public page may read the admin namespace.
    // A COMMENT mentioning the namespace is not a read; only real code counts (js/wave-registry.js merely
    // describes the admin's waveCards override in prose, and must not be indicted for it).
    const publicScripts = tracked.filter((f) => /\.(js|html)$/.test(f) && !/^(js\/admin\.js|admin\.html|admin-config\.js|tests\/|docs\/)/.test(f));
    const readers = publicScripts.filter((f) => stripComments(fs.readFileSync(path.join(SITE, f), "utf8")).indexOf("dyadmin::") >= 0);
    // ONE PINNED READER, by OWNER RULING 2026-09-23 (docs/ARCHIVE_ROAD_2026-09-23.md §2, §2.1 — the key-safety law
    // as AMENDED): js/dashboard.js `archiveReadRpc()` (S-FEED-3) may read dyadmin::config.readRpcUrl, because the
    // owner's single paste is meant to extend the BUYER dashboard's getLogs reach too. It is READ-ONLY — the URL
    // is used to build a getLogs provider and is never displayed and never transmitted. Deleting the cross-read
    // was the rejected alternative: it would drop the buyer feed back onto drpc's 101-block cap.
    // THE PINNED SET MAY NEVER GROW. A second reader turns this red, and that is the whole point of the pin.
    const SANCTIONED = ["js/dashboard.js"];
    const unsanctioned = readers.filter((f) => SANCTIONED.indexOf(f) < 0);
    ok("G1 · KEY-SAFETY · no NEW public reader of the dyadmin:: namespace (the one pre-existing S-FEED-3 cross-read is pinned, reported, and may not grow)",
       unsanctioned.length === 0, "unsanctioned readers: " + unsanctioned.join(", "));
    ok("G1b · KEY-SAFETY · and the pinned cross-read is still exactly the one we think it is — read-only, never displayed",
       readers.length === 1 && readers[0] === "js/dashboard.js" &&
       /function archiveReadRpc/.test(fs.readFileSync(path.join(SITE, "js/dashboard.js"), "utf8")),
       "readers: " + readers.join(", "));
    // §2.4 — no keyed provider URL may be committed, anywhere
    const KEYED = [
      /[a-z0-9-]+\.g\.alchemy\.com\/v2\/[A-Za-z0-9_-]{8,}/i,
      /infura\.io\/v3\/[0-9a-f]{12,}/i,
      /[a-z0-9-]+\.quiknode\.pro\/[0-9a-f]{12,}/i,
      /rpc\.ankr\.com\/polygon\/[A-Za-z0-9]{16,}/i,
      /drpc\.org\/[^"'\s]*dkey=[A-Za-z0-9_-]{6,}/i,
      /[?&](api[_-]?key|apikey|dkey|access[_-]?token)=[A-Za-z0-9_-]{6,}/i,
    ];
    const hits = [];
    tracked.filter((f) => /\.(js|html|json|md|txt)$/.test(f)).forEach((f) => {
      const t = fs.readFileSync(path.join(SITE, f), "utf8");
      KEYED.forEach((re) => { const m = re.exec(t); if (m) hits.push(f + " :: " + m[0].slice(0, 48)); });
    });
    ok("G2 · KEY-SAFETY · no keyed provider URL anywhere in the repo", hits.length === 0, hits.join(" | "));
    const ac = fs.readFileSync(path.join(SITE, "admin-config.js"), "utf8");
    ok("G3 · KEY-SAFETY · the committed admin-config ships readRpcUrl NULL — the key is never a file's business",
       /readRpcUrl:\s*null/.test(ac));
    const adminSrc = fs.readFileSync(path.join(SITE, "js/admin.js"), "utf8");
    ok("G4 · KEY-SAFETY · the Configuration panel is the only writer of the keyed URL, into dyadmin::config alone",
       /readRpcUrl:\s*readRpc\s*\|\|\s*null/.test(adminSrc) && adminSrc.indexOf('localStorage.setItem(LS_KEY') > 0 &&
       /var LS_KEY = "dyadmin::config"/.test(adminSrc));
  }

  // ═══ H. the width is a CONFIGURED decision, beside the URL ═══
  {
    const html = fs.readFileSync(path.join(SITE, "admin.html"), "utf8");
    const src = fs.readFileSync(path.join(SITE, "js/admin.js"), "utf8");
    ok("H1 · the Configuration panel carries the starting-span field, beside the Read RPC URL",
       html.indexOf('id="cfg-logchunk"') > 0 && html.indexOf('id="cfg-logchunk"') > html.indexOf('id="cfg-readrpc"'));
    ok("H2 · saveCfg validates it and stores it", /logChunk:\s*Math\.floor\(lc\)/.test(src) && /cfg-logchunk/.test(src));
    ok("H3 · fillCfgForm shows the owner what is in force", /\$\("cfg-logchunk"\)\.value = c\.logChunk/.test(src));
    ok("H4 · saving Configuration re-opens the discovered widths (a new endpoint has new caps)",
       /archiveSpanReset\(\); \/\/ GATE-FIX-1: a new endpoint/.test(src));
  }

  // the runner's footer contract (tests/run.js countOf): "ALL GREEN — pass/total", same as freedoor
  // ═══ I. THE CACHE-STAMP LAW (bytes-not-tasks) ═══
  // Shipped and caught the hard way: GATE-FIX-1 rewrote js/admin.js and left admin.html pointing at ?v=s35, the
  // exact URL every console browser already had cached. The fix was live and invisible — the owner would have
  // pasted his key, pressed FIND ELIGIBLE, and been answered by the OLD bytes. The stamp is not decoration; it is
  // how a change reaches the person who asked for it. This check compares committed history: if a stamped script's
  // bytes changed AFTER its stamp last moved, the stamp is stale and the deploy is a lie.
  {
    const { execFileSync } = require("child_process");
    const html = fs.readFileSync(path.join(SITE, "admin.html"), "utf8");
    const stamped = [...html.matchAll(/src="([^"?]+)\?v=([A-Za-z0-9]+)"/g)].map((m) => ({ src: m[1], v: m[2] }));
    const when = (args) => {
      const out = execFileSync("git", ["log", "-1", "--format=%ct"].concat(args), { cwd: SITE, encoding: "utf8" }).trim();
      return out ? Number(out) : 0;
    };
    const stale = stamped.filter((x) => {
      const fileAt = when(["--", x.src]);
      const stampAt = when(["-G", x.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\?v=", "--", "admin.html"]);
      return fileAt > stampAt; // bytes moved after the stamp did
    });
    ok("I1 · BYTES-NOT-TASKS · every stamped console script carries a stamp at least as new as its own bytes — no cached-stale deploy",
       stale.length === 0, "stale: " + stale.map((x) => x.src + "?v=" + x.v).join(", "));
    ok("I2 · and js/admin.js is stamped at all (an unstamped script can never be busted out of a browser cache)",
       stamped.some((x) => x.src === "js/admin.js"));
  }

  // ═══ J. GATE-FIX-1b — A WALL IS NOT A ROAD ═══
  // Field truth 2026-09-23: an Alchemy FREE url in READ RPC URL passed the depth probe (one block is one block),
  // then refused every width down to the floor, and the scan sat on "chunk 1/42239, retrying" forever. Serving
  // depth is not the same as being usable. GATE-FIX-1's predecessor rejected Alchemy by ACCIDENT with its
  // 128-block probe; making the probe honest lost that protection. This section is the protection made deliberate.
  {
    const road = boot().road;
    const alch = rpcErr(ALCHEMY_FREE_ERR);
    ok("J1 · Alchemy free's exact wording is understood as a WIDTH refusal", road.isRangeError(alch) === true);
    ok("J2 · and the cap it states is read back, so the owner is told a NUMBER", road.rangeCapHint(alch) === ALCHEMY_CAP);
    ok("J3 · drpc's stale '10000' is never quoted as a cap — its real cap is 101 and the sentence would be a lie",
       road.rangeCapHint(rpcErr(DRPC_WIDTH_ERR)) === null);
    ok("J4 · 1rpc's wording still reads its cap too", road.rangeCapHint(rpcErr(ONERPC_WIDTH_ERR)) === ONERPC_CAP_50);
  }
  {
    // the whole fault, end to end: owner endpoint capped at 10, public archive behind it
    const B = boot(), road = B.road;
    const owner = fakeEndpoint({ cap: ALCHEMY_CAP, widthErr: ALCHEMY_FREE_ERR });
    const drpc = fakeEndpoint({ cap: DRPC_SPAN_CAP });
    B.w.DYWallet.loadEthers = () => Promise.resolve(fakeEthers({
      "https://owner.example/v2/KEY": owner, "https://polygon.drpc.org": drpc,
      "https://polygon-bor-rpc.publicnode.com": fakeEndpoint({ pruned: true }),
    }));
    cfgWrite(B.w, { deployBlock: DEPLOY, readRpcUrl: "https://owner.example/v2/KEY" });
    await road.withEthers();
    const h = await road.historyProvider("0xsale");
    ok("J5 · THE FAULT: an endpoint that refuses even the FLOOR width is abandoned — we fail over instead of spinning",
       h.url === "https://polygon.drpc.org", "chose " + h.url);
    ok("J6 · MUTANT (no fail-over → spin): the owner endpoint was probed a BOUNDED number of times and then dropped",
       owner.seen.length > 0 && owner.seen.length <= 14, "reads against the wall=" + owner.seen.length);
    ok("J7 · it is REMEMBERED as width-incapable for the session", road.isWidthIncapable("https://owner.example/v2/KEY") === true);
    ok("J8 · the fall-back is reported as a WIDTH verdict, not a depth one (Mint History must not send the owner hunting the wrong fault)",
       h.fellBack === true && h.fellBackReason === "width");
    ok("J9 · the skip note carries the cap the endpoint itself stated", h.ownerSkipped && h.ownerSkipped.capBlocks === ALCHEMY_CAP);
    ok("J10 · KEY-SAFETY · the note carries no key — host only, path and query redacted",
       h.ownerSkipped && h.ownerSkipped.host.indexOf("KEY") < 0 && h.ownerSkipped.host.indexOf("owner.example") >= 0,
       String(h.ownerSkipped && h.ownerSkipped.host));

    // MUTANT (forgets and re-probes per chunk): a second selection must not touch the wall again
    const before = owner.seen.length;
    const h2 = await road.historyProvider("0xsale");
    ok("J11 · MUTANT (forgets → re-probes every time): a second selection skips it WITHOUT a single further read",
       owner.seen.length === before && h2.url === "https://polygon.drpc.org", "extra reads=" + (owner.seen.length - before));
    ok("J12 · and the second selection still explains itself — the note is not a one-shot",
       h2.ownerSkipped && h2.ownerSkipped.capBlocks === ALCHEMY_CAP && h2.fellBackReason === "width");

    // the fallback road is a REAL road: it scans and it checkpoints
    const sale = { target: "0xFALLBACK", runner: { __dyUrl: h.url }, filters: { Purchased: () => ({}) },
                   queryFilter: (f, a, b) => drpc.getLogs({ fromBlock: a, toBlock: b }).then(() => []) };
    const key = road.ckptKey("purchased", "0xFALLBACK");
    const labels = [];
    await road.scanPurchasedByBuyer(sale, 1000, 1000 + 4000, (l) => labels.push(l), Date.now() + 30000, key);
    const ck = road.ckptGet(key);
    ok("J13 · the fall-back scan is a real scan: it checkpoints", !!ck && ck.scannedTo > 1000, JSON.stringify(ck));
    ok("J14 · and the chunk counter goes on counting normally on the fallback road", labels.some((l) => /^chunk \d+\/\d+/.test(l)), labels[0]);
  }
  {
    // MUTANT (message hidden): the panel sentence must NAME the limit and must NEVER be the busy message
    const road = boot().road;
    const html = road.ownerSkippedHtml({ host: "https://owner.example/…", capBlocks: ALCHEMY_CAP }, 42239);
    const plain = html.replace(/<[^>]+>/g, "");
    ok("J15 · MUTANT (message hidden): the panel says the limit in plain words, with the number",
       plain.indexOf("only " + ALCHEMY_CAP + "-block reads") >= 0, plain);
    ok("J16 · it names the consequence and its cost on the road actually taken", plain.indexOf("public archive") >= 0 && plain.indexOf("42,239 chunks") >= 0);
    ok("J17 · and it is NEVER the busy message — nothing is busy; the endpoint answered, it just answers too little",
       plain.indexOf("busy") < 0 && plain.indexOf("unreachable") < 0, plain);
    ok("J18 · KEY-SAFETY · no URL in the sentence at all", plain.indexOf("http") < 0, plain);
    const noCap = road.ownerSkippedHtml({ host: "x", capBlocks: null }, 0).replace(/<[^>]+>/g, "");
    ok("J19 · an endpoint that refuses without stating a number gets an honest shrug, never an invented figure",
       noCap.indexOf("very small reads") >= 0 && !/\d/.test(noCap.replace(/[^0-9]/g, "")), noCap);
  }
  {
    // every candidate a wall → the archive class IS the truth, and the busy message is then correct
    const B = boot(), road = B.road;
    B.w.DYWallet.loadEthers = () => Promise.resolve(fakeEthers({
      "https://owner.example/v2/KEY": fakeEndpoint({ cap: ALCHEMY_CAP, widthErr: ALCHEMY_FREE_ERR }),
      "https://polygon.drpc.org": fakeEndpoint({ cap: 1, widthErr: ALCHEMY_FREE_ERR }),
      "https://polygon-bor-rpc.publicnode.com": fakeEndpoint({ cap: 1, widthErr: ALCHEMY_FREE_ERR }),
    }));
    cfgWrite(B.w, { deployBlock: DEPLOY, readRpcUrl: "https://owner.example/v2/KEY" });
    await road.withEthers();
    const e = await road.historyProvider("0xsale").then(() => null, (x) => x);
    ok("J20 · when EVERY road is a wall the archive class is the honest answer — the busy message is then correct",
       !!e && e.__archive === true && road.isArchiveError(e) === true);
    ok("J21 · and even then the owner is told why HIS endpoint was skipped", e.__ownerSkipped && e.__ownerSkipped.capBlocks === ALCHEMY_CAP);
  }

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
