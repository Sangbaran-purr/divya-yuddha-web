"use strict";
// MINI-GAMES-1 · DAILY PUZZLE AUTOMATION — R1: THE GENERATOR (owner rulings 2026-10-16).
//
// THE LAW (the same as the hand-authored batch): nothing here re-implements a rule. A candidate position is BUILT by
// playing random LEGAL plays through the site's pinned copy of the real engine (game/src/engine.js, checksum-pinned by
// the puzzles suite); it is ACCEPTED only by the existing solver (play/daily/puzzle-core.js solve(): EXACTLY ONE winning
// play, identical under all 8 seeds); its EXPLANATION is written from what the engine itself did — every card's power
// before and after, and the engine's own events naming the ability behind each change. A draft whose changes cannot
// each be tied to exactly one named ability, or whose numbers do not add up to the engine's own round score, is thrown
// away (and another position tried) — the generator never guesses a cause.
//
// THE CARD POOL is the launch pool only (88 cards) — the validator refuses Wave-1 cards (NOT_LAUNCH).
// SECRECY: this module returns answers and explanations IN MEMORY only; the batch writer encodes them before anything
// touches the repo, and prints no answer, no explanation and no position to its log (both repos are public).
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const E = require(path.join(SITE, "game", "src", "engine.js"));
const PZ = require(path.join(SITE, "play", "daily", "puzzle-core.js"));

const FACTIONS = ["devas", "asuras", "vanaras", "nagas"];
const FAC_NAME = { devas: "Devas", asuras: "Asuras", vanaras: "Vanaras", nagas: "Nagas" };
const REALM_NAME = { mrityulok: "Mrityulok", swarga: "Swarga", patala: "Patala", kalki: "Kalki Kshetra", yaksha: "Yaksha", rishi: "Rishi", gandharva: "Gandharva" };
// difficulty by weekday (owner ruling: easier early in the week, harder later; weeks run Monday to Sunday)
const DIFF_BY_DAY = { 1: "easy", 2: "easy", 3: "medium", 4: "medium", 5: "medium", 6: "hard", 0: "hard" };

// ── deterministic randomness (a batch is reproducible from its dates) ──
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const launch = (f) => E.DECKS[f].filter((d) => !d.wave);
const defOf = (fac, name) => E.DECKS[fac].find((d) => d.n === name) || null;
function pickN(r, arr, n) { const a = arr.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(r() * a.length), 1)[0]); return out; }
function refIn(list, card) { let k = 0; for (const c of list) { if (c.n === card.n) k++; if (c === card) break; } return list.filter((c) => c.n === card.n).length > 1 ? card.n + "#" + k : card.n; }
const clean = (ref) => String(ref).replace(/#\d+$/, "");

// ── 1. A CANDIDATE: hands from the launch pool, a random legal setup through the engine, the opponent passes ──
function candidate(r, slot) {
  // the opponent is one of the OTHER three factions (no mirror matches: variety across the week)
  const others = FACTIONS.filter((f) => f !== slot.you);
  const you = slot.you, them = slot.them || others[Math.floor(r() * others.length)], realm = slot.realm || "mrityulok";
  let yh = pickN(r, launch(you), 6 + Math.floor(r() * 4)).map((d) => d.n);
  const th = pickN(r, launch(them), 4 + Math.floor(r() * 4)).map((d) => d.n);
  // a HERO slot: one Hero may be played per round, so keep one in your hand and never spend it in the setup
  const heroes = launch(you).filter((d) => d.t === "hero").map((d) => d.n);
  if (slot.hero && !yh.some((n) => heroes.indexOf(n) >= 0)) yh = yh.slice(0, -1).concat([heroes[Math.floor(r() * heroes.length)]]);
  const first = r() < 0.5 ? 0 : 1;
  const P = { id: "dp-" + slot.date, date: slot.date, title: "", difficulty: slot.difficulty || "easy", mechanic: "pending", realm, first,
    you: { faction: you, hand: yh }, them: { faction: them, hand: th }, setup: [] };
  let g;
  try { g = E.newGame({ p0: "You", p1: "Opponent", p0Faction: you, p1Faction: them, realm, rng: PZ.puzzleRng(first, PZ.SEEDS[0]),
    scenario: { p0Deck: yh, p1Deck: th, p0Hand: yh, p1Hand: th, mulligan: 0 } }); } catch (e) { return null; }
  const yourPlays = 2 + Math.floor(r() * 3), theirPlays = 2 + Math.floor(r() * 3); let yp = 0, tp = 0;
  for (let guard = 0; guard < 24; guard++) {
    if (g.over) return null;
    const pi = g.turn, pl = g.players[pi];
    if (pi === 1 && tp >= theirPlays) { E.pass(g, 1); P.setup.push({ side: "them", pass: true }); break; }
    if (pi === 0 && yp >= yourPlays) return null;
    let legal = E.playableIndices(g, pi);
    if (slot.hero && pi === 0) legal = legal.filter((i) => pl.hand[i].t !== "hero");
    if (!legal.length) return null;
    const idx = legal[Math.floor(r() * legal.length)], c = pl.hand[idx], spec = E.targetSpec(g, pi, c);
    let t = null, tref = null;
    if (spec && spec.options && spec.options.length) { t = spec.options[Math.floor(r() * spec.options.length)]; tref = refIn(spec.options, t); }
    const step = { side: pi ? "them" : "you", play: c.n }; if (t) step.target = tref;
    try { E.playCard(g, pi, idx, t ? t.uid : null, null); } catch (e) { return null; }
    P.setup.push(step); pi ? tp++ : yp++;
  }
  if (g.over || !g.players[1].passed || g.turn !== 0 || g.players[0].passed || g.players[0].hand.length < 3) return null;
  // cards left in your hand that the engine will not let you play (a second Hero, a revive with no one to revive, a card
  // locked by Narada) are taken out of the hand; the position is then rebuilt and re-judged from scratch like any other
  const legal = E.playableIndices(g, 0), drop = g.players[0].hand.filter((c, i) => legal.indexOf(i) < 0).map((c) => c.n);
  drop.forEach((n) => { const k = P.you.hand.lastIndexOf(n); if (k >= 0) P.you.hand.splice(k, 1); });
  if (P.you.hand.length - P.setup.filter((st) => st.side === "you" && !st.pass).length < 3) return null;
  return P;
}

// ── 2. WHAT THE ENGINE DID: every card counting on the field, before and after, and the events in between ──
function board(g) {
  const m = {};
  for (const pi of [0, 1]) {
    const pl = g.players[pi];
    pl.units.filter((u) => !u.ghost).forEach((u) => { m[u.uid] = { n: u.n, side: pi, p: u.bound ? 0 : E.effPower(g, pi, u), base: u.base, venom: u.venom || 0 }; });
    pl.heroes.forEach((h) => { m[h.uid] = { n: h.n, side: pi, p: h.bound ? 0 : E.effPower(g, pi, h), base: h.base, venom: 0 }; });
  }
  return m;
}
const totals = (g) => [E.totalPower(g, 0), E.totalPower(g, 1)];
const POWER_EVENTS = { buff: 1, damage: 1, venom: 1 };
// the causes behind one card's change: each event touching it (by ability name, with the engine's own amount and words)
function causesFor(events, uid) {
  const by = {};
  events.forEach((e) => {
    if (!POWER_EVENTS[e.type] || !(e.targetUids || []).some((t) => t === +uid)) return;
    const k = e.abilityName || "?";
    if (!by[k]) by[k] = { name: k, amount: 0, unknown: false, texts: [] };
    if (typeof e.amount === "number") by[k].amount += e.amount; else by[k].unknown = true;
    by[k].texts.push(e.text || "");
  });
  return Object.values(by).filter((c) => c.unknown || c.amount !== 0);
}
function removalCause(events, uid) {
  const d = events.find((e) => (e.type === "destroy" || e.type === "passive") && (e.targetUids || []).some((t) => t === +uid));
  return d ? (d.abilityName || null) : null;
}
// (owner ruling 2026-10-23) a cause is told by the CARD'S FULL NAME: the engine names some abilities short ("Sudarshana" for
// Sudarshana Chakra) — when a cause is the start of a card in play's name, the card's own name is used
function fullName(name, cards) {
  if (!name) return name;
  const hit = cards.filter((n) => n && n !== name && n.indexOf(name + " ") === 0);
  return hit.length === 1 ? hit[0] : name;
}
const whose = (side) => (side ? "the opponent's " : "your ");
// RULE A (owner ruling 2026-10-16): every card on each side's field belongs to that side's own faction — no stolen cards
function factionsTrue(g, P) {
  return [0, 1].every((pi) => { const pl = g.players[pi], fac = pi ? P.them.faction : P.you.faction;
    const own = (c) => !(c.stolenBy >= 0) && E.DECKS[fac].some((d) => d.n === c.n);   // the engine marks an unstolen card stolenBy −1
    return pl.units.filter((u) => !u.ghost).every(own) && pl.heroes.every(own) && (!pl.artifact || own(pl.artifact)); });
}
// the reason a play changed no power, in the engine's own record (never guessed): an Astra a card cancels, or an Artifact
function noPowerReason(g, logFrom, card) {
  const lines = (g.log || []).slice(logFrom).map((x) => (typeof x === "string" ? x : (x && (x.msg || x.text)) || ""));
  for (const l of lines) {
    let m;
    if ((m = /^([A-Z][\w' ]+?) negates (.+?) —/.exec(l))) return m[1] + " cancels " + m[2];
    if ((m = /^(.+?)’s trap swallows (.+?) —/.exec(l))) return m[1] + "'s trap cancels " + m[2];
  }
  if (card && card.t === "artifact") return card.n + " is an Artifact: it adds no power";
  return null;   // the caller then says, as the engine shows, that the card adds no power
}
// the Venom at a round's end, SPLIT BY SOURCE from the engine's own order of events: the Naga drain (one toast, then −1 on
// each enemy Unit) and each Unit's own Venom Tokens. Anything deeper (a drain of more than 1, doubled tokens) has more than
// one source folded into one number — it cannot be split, so it is refused.
function venomSources(evEnd, b1) {
  // the drain's toast names the side it drains ("Venom drains You’s Units −1"); it then strikes each of that side's Units
  // ONCE — every other Venom event is a Unit's own Tokens
  const out = []; let pending = new Set(), drainAmt = 0;
  for (const e of evEnd) {
    if (e.type === "toast" && e.abilityName === "Venom") {
      const m = /drains (.+?)’s Units −(\d+)/.exec(e.text || ""); if (!m) return null;
      const side = m[1] === "You" ? 0 : 1; drainAmt = +m[2];
      pending = new Set(Object.keys(b1).filter((u) => b1[u].side === side && b1[u].base != null).map(Number));
      continue;
    }
    if (e.type !== "venom") continue;
    const uid = (e.targetUids || [])[0], who = b1[uid]; if (!who || !e.amount) continue;
    if (pending.has(uid)) { pending.delete(uid); if (drainAmt !== 1 || e.amount !== -1) return null; out.push({ side: who.side, n: who.n, amount: -1, name: "the Naga Venom drain" }); }
    else { if (!who.venom || e.amount !== -who.venom) return null; out.push({ side: who.side, n: who.n, amount: e.amount, name: who.venom === 1 ? "its Venom Token" : "its " + who.venom + " Venom Tokens" }); }
  }
  return out;
}
// the best line for a play, as the solver scores it: no Leap, or one free Leap before or after (Vanaras), whichever reaches
// the solver's own score for that play
function lineFor(P, p) {
  if (p.line) return p.line;
  const tries = [{ before: [], after: [], pos: null }];
  if (P.you.faction === "vanaras") {
    const g = PZ.load(P, E, PZ.SEEDS[0]), pairs = (gg) => { const pl = gg.players[0], out = []; pl.units.forEach((u, i) => { if (u.ghost) return; E.adjacentUnits(pl, u).forEach((t) => { if (!t.ghost) out.push([i, pl.units.indexOf(t)]); }); }); return out; };
    pairs(g).forEach((a) => tries.push({ before: [a], after: [], pos: null }));
    try { const g1 = PZ.load(P, E, PZ.SEEDS[0]); const idx = g1.players[0].hand.findIndex((c) => c.n === p.play); const spec = E.targetSpec(g1, 0, g1.players[0].hand[idx]);
      const t = p.target && spec ? spec.options.find((o) => o.n === clean(p.target)) : null; E.playCard(g1, 0, idx, t ? t.uid : null, null);
      pairs(g1).forEach((b) => tries.push({ before: [], after: [b], pos: null })); } catch (e) { /* no after-Leaps */ }
  }
  for (const L of tries) {
    try { const r = PZ.run(P, E, PZ.SEEDS[0], { play: p.play, target: p.target, pos: L.pos }, L.before, L.after); if (r.you === p.you && r.them === p.them) return L; } catch (e) { /* not legal */ }
  }
  return null;
}

// play a candidate (its line: card, target, slot, Leaps) and describe it from the engine. → null when ANY change has no
// single named cause, any number does not add up, or a stolen card appears (Rules A and B, owner ruling 2026-10-16).
function narrate(P, play, opts) {
  opts = opts || {};
  const g = PZ.load(P, E, PZ.SEEDS[0]);
  if (!factionsTrue(g, P)) return null;
  const T0 = totals(g), b0 = board(g), ev0 = (g.events || []).length, log0 = (g.log || []).length;
  const line = opts.line || play.line || { before: [], after: [], pos: null };
  const leapNames = (pr) => [g.players[0].units[pr[0]].n, g.players[0].units[pr[1]].n];
  const leaps = [];
  (line.before || []).forEach((pr) => { leaps.push({ when: "before", names: leapNames(pr) }); E.doLeap(g, 0, g.players[0].units[pr[0]], g.players[0].units[pr[1]], false); E.sweepDeaths(g); });
  let played = null;
  if (play.play) {
    const pl = g.players[0], legal = E.playableIndices(g, 0);
    const idx = pl.hand.findIndex((c, i) => c.n === play.play && legal.indexOf(i) >= 0);
    if (idx < 0) return null;
    played = pl.hand[idx];
    const spec = E.targetSpec(g, 0, played);
    let tu = null;
    if (play.target) { const m = /^(.*)#(\d+)$/.exec(play.target), nm = m ? m[1] : play.target, k = m ? +m[2] : 1; let seen = 0; const t = (spec && spec.options || []).find((o) => o.n === nm && ++seen === k); if (!t) return null; tu = t.uid; }
    E.playCard(g, 0, idx, tu, line.pos == null ? null : line.pos);
    (line.after || []).forEach((pr) => { if (!g.over && g.turn === 0) { leaps.push({ when: "after", names: leapNames(pr) }); E.doLeap(g, 0, g.players[0].units[pr[0]], g.players[0].units[pr[1]], false); E.sweepDeaths(g); } });
  }
  if (!factionsTrue(g, P)) return null;
  const T1 = totals(g), b1 = board(g), evPlay = (g.events || []).slice(ev0), ev1 = (g.events || []).length;
  const inPlay = [played && played.n].concat(Object.values(b0).map((x) => x.n), Object.values(b1).map((x) => x.n));
  evPlay.forEach((e) => { if (e.abilityName) e.abilityName = fullName(e.abilityName, inPlay); });   // this throwaway game's record, named in full
  const changes = [];
  const leapText = (c) => { const m = /copies (.+)$/.exec(c.texts.find((t) => /^copies /.test(t)) || ""); return m ? m[1] : null; };
  for (const uid of Object.keys(b1)) {
    const a = b0[uid], b = b1[uid], cs = causesFor(evPlay, uid);
    if (!a) {
      // a card arriving: the card you played "enters"; any other "joins" a side through the ability the engine names
      const via = evPlay.find((e) => !POWER_EVENTS[e.type] && e.type !== "play" && (e.targetUids || []).some((t) => t === +uid) && e.abilityName);
      const isPlayed = played && +uid === played.uid;
      if (!isPlayed && !via) return null;
      const arrives = isPlayed ? b.n + " enters at " : b.n + " joins " + whose(b.side) + "side through " + via.abilityName + " at ";
      const extra = b.p - b.base;
      if (extra === 0 && !cs.length) { changes.push({ side: b.side, d: b.p, text: arrives + b.p }); continue; }
      if (cs.length !== 1 || (!cs[0].unknown && cs[0].amount !== extra)) return null;
      if (cs[0].name === "Leap") {
        const onto = leapText(cs[0]); if (!onto) return null;
        changes.push({ side: b.side, d: b.base, text: arrives + b.base });
        changes.push({ side: b.side, d: extra, leap: { who: b.n, onto }, text: whose(b.side) + b.n + " gains " + extra + " from Leap (" + b.base + "→" + b.p + ")" });
        continue;
      }
      changes.push({ side: b.side, d: b.p, text: arrives + b.base + " and " + (extra > 0 ? "gains " + extra : "loses " + (-extra)) + " from " + (cs[0].name === b.n ? "its own ability" : cs[0].name) + " (" + b.p + ")" });
      continue;
    }
    if (a.p === b.p) continue;
    const d = b.p - a.p;
    if (cs.length !== 1 || (!cs[0].unknown && cs[0].amount !== d)) return null;   // ONE named cause per change, or the draft is refused
    if (cs[0].name === "Leap") { const onto = leapText(cs[0]); if (!onto) return null;
      changes.push({ side: b.side, d, leap: { who: b.n, onto }, text: whose(b.side) + b.n + " gains " + d + " from Leap (" + a.p + "→" + b.p + ")" }); continue; }
    changes.push({ side: b.side, d, text: whose(b.side) + b.n + " " + (d > 0 ? "gains " + d : "loses " + (-d)) + " from " + cs[0].name + " (" + a.p + "→" + b.p + ")" });
  }
  for (const uid of Object.keys(b0)) if (!b1[uid]) {
    const why = removalCause(evPlay, uid); if (!why) return null;
    changes.push({ side: b0[uid].side, d: -b0[uid].p, text: whose(b0[uid].side) + b0[uid].n + " is removed by " + why + " (−" + b0[uid].p + ")" });
  }
  const sum = [0, 1].map((s) => changes.filter((c) => c.side === s).reduce((t, c) => t + c.d, 0));
  if (T0[0] + sum[0] !== T1[0] || T0[1] + sum[1] !== T1[1]) return null;
  // Venom Tokens a play puts on Units (they drain at the round's end) are told, named by the ability that placed them
  evPlay.filter((e) => e.type === "token" && e.abilityName && (e.targetUids || []).length).forEach((e) => {
    const hit = e.targetUids.map((t) => b1[t]).filter(Boolean); if (!hit.length) return;
    const sides = [...new Set(hit.map((x) => x.side))];
    changes.push({ side: sides[0], d: 0, token: true, text: e.abilityName + " puts a Venom Token on " + sides.map((sd) => whose(sd) + hit.filter((x) => x.side === sd).map((x) => x.n).join(" and ")).join(" and ") });
  });
  // the card you played must account for itself: it enters, or a change names it, or the engine's record says why it did
  // nothing (an Astra a card cancels) — else, verified by the absence of any change it caused, "<card> adds no power"
  const itself = played && changes.some((c) => c.text.indexOf(played.n + " enters at") === 0 || c.text.indexOf("from " + played.n + " ") >= 0 || c.text.indexOf("by " + played.n + " ") >= 0 || c.text.indexOf(played.n + " puts a Venom Token") === 0 || c.text.indexOf(" through " + played.n + " at ") >= 0);
  const noPower = played && !itself ? (noPowerReason(g, log0, played) || played.n + " adds no power") : null;
  // the round end: Venom split by source, every other change one named event
  const round = g.round;
  if (!g.over && g.turn === 0 && !g.players[0].passed) E.pass(g, 0);
  const h = g.roundHistory.find((x) => x.round === round); if (!h) return null;
  const T2 = [h.t0, h.t1];
  const evEnd = (g.events || []).slice(ev1).filter((e) => e.round === round);
  const venom = venomSources(evEnd, b1); if (!venom) return null;
  const others = [];
  for (const e of evEnd) {
    if (!POWER_EVENTS[e.type] || e.type === "venom" || typeof e.amount !== "number" || !e.amount) continue;
    for (const t of (e.targetUids || [])) { const who = b1[t]; if (!who) return null; others.push({ side: who.side, n: who.n, amount: e.amount, name: e.abilityName || null }); }
  }
  if (others.some((c) => !c.name)) return null;
  const endChanges = others.concat(venom);
  const endSum = [0, 1].map((s) => endChanges.filter((c) => c.side === s).reduce((t, c) => t + c.amount, 0));
  if (T1[0] + endSum[0] !== T2[0] || T1[1] + endSum[1] !== T2[1]) return null;
  const names = changes.map((c) => c.text).join(" | ") + " | " + endChanges.map((c) => c.name).join(" | ");
  return { T0, T1, T2, changes, endChanges, leaps, noPower, win: h.winner === 0, names, after: b1 };
}

// ── 3. THE EXPLANATION — one fixed plain pattern ──
// a Leap is told as a Leap: "then <Leaper> Leaps onto <Unit> and gains <n> (<a>→<b>)"; a card's own free Leap (Mainda's)
// names what it copies: "<Leaper> makes a free Leap onto <Unit> and gains <n> (<a>→<b>)"
function sentenceOf(n) {
  const used = new Set();
  const gainOf = (name) => { const c = n.changes.find((x) => !used.has(x) && x.leap && x.leap.who === name); if (!c) return ""; used.add(c); return " and gains " + c.d + c.text.slice(c.text.lastIndexOf(" (")); };
  const before = n.leaps.filter((l) => l.when === "before").map((l) => "first " + l.names[0] + " Leaps onto " + l.names[1] + gainOf(l.names[0]));
  const after = n.leaps.filter((l) => l.when === "after").map((l) => "then " + l.names[0] + " Leaps onto " + l.names[1] + gainOf(l.names[0]));
  const mid = n.changes.filter((c) => !used.has(c)).map((c) => (c.leap ? whose(c.side) + c.leap.who + " makes a free Leap onto " + c.leap.onto + " and gains " + c.d + c.text.slice(c.text.lastIndexOf(" (")) : c.text));
  if (n.noPower) mid.push(n.noPower);
  return before.concat(mid, after);
}
// (owner ruling 2026-10-23) A ROUND-END EFFECT THAT DOES NOT HAPPEN must say why. Every told play is compared with simply
// passing: if a Venom drain that passing would bring does not fire — and the side it drains still has Units — the line names
// the reason. The one the engine has: a card whose printed text moves the drain to the moment a player first passes, when the
// opponent has already passed (Karkotaka). Any other missing effect has no reason the writer can name: the puzzle is refused.
function missingEnd(P, base, n, playName) {
  if (!base) return "";
  const has = (x, side) => x.endChanges.some((c) => c.side === side && c.name === "the Naga Venom drain");
  const out = [];
  for (const side of [0, 1]) {
    if (!has(base, side) || has(n, side)) continue;
    if (!Object.values(n.after || {}).some((u) => u.side === side)) continue;   // nothing left there to drain
    const def = playName ? (defOf(P.you.faction, playName) || {}) : {};
    if (/first passes/i.test(def.txt || "") && side === 1) { out.push(playName + " moves your Venom drain to the moment either player first passes; the opponent has already passed, so your drain does not fire this round"); continue; }
    return null;
  }
  // (owner ruling 2026-10-23, made general) a Naga side's Venom drain that does not fire at this round's end while the drained
  // side still has Units is a cause the player would count on — absent before ANY play (e.g. a Karkotaka already on the board
  // spent it at the first pass) it must be told too; there is no writer for that, so the position is refused
  const facOf = (side) => (side === 0 ? P.you.faction : P.them.faction);
  for (const side of [0, 1]) {
    if (facOf(1 - side) !== "nagas" || has(n, side)) continue;
    if (has(base, side)) continue;   // the play itself stops it: told above (or already refused)
    const units = Object.values(n.after || {}).filter((u) => u.side === side && (defOf(facOf(side), u.n) || {}).t !== "hero");
    if (units.length) return null;
  }
  // (same ruling) a Unit that keeps a Venom Token to the round's end but takes no token tick: the reason is told — Rama's
  // Signet negates Venom on Vanara Units (the engine skips the tick with no event, so the reader would count it) — or the
  // position is refused
  let g0 = null;
  for (const u of Object.values(n.after || {})) {
    if (!u.venom || n.endChanges.some((c) => c.side === u.side && c.n === u.n && /Venom Token/.test(c.name))) continue;
    g0 = g0 || PZ.load(P, E, PZ.SEEDS[0]);
    const pl = g0.players[u.side], art = pl.artifact;
    if (facOf(u.side) === "vanaras" && art && art.id === "ramasignet") {
      const said = (u.side === 1 ? "the opponent's " : "your ") + art.n + " negates Venom on " + (u.side === 1 ? "their" : "your") + " Vanara Units, so the Venom Token on " + u.n + " does not drain it";
      if (out.indexOf(said) < 0) out.push(said);
      continue;
    }
    return null;
  }
  return out.join("; ");
}
const endText = (n) => n.endChanges.map((c) => whose(c.side) + c.n + " " + (c.amount > 0 ? "+" + c.amount : "−" + Math.abs(c.amount)) + " from " + c.name).join("; ");
// a realm's hand in it: the same play in Mrityulok. A realm that changes any number must name itself in the engine's own
// events (Kalki Kshetra, Rishi Mandala do); a realm that changes numbers silently is a hidden cause — refused.
function realmCheck(P, play, n, line) {
  if (P.realm === "mrityulok") return { ok: true };
  const M = JSON.parse(JSON.stringify(P)); M.realm = "mrityulok";
  let nm = null; try { nm = narrate(M, play, { line }); } catch (e) { nm = null; }
  const same = nm && J(nm.T0) === J(n.T0) && J(nm.T1) === J(n.T1) && J(nm.T2) === J(n.T2) && J(nm.changes.map((c) => c.text)) === J(n.changes.map((c) => c.text));
  if (same) return { ok: true, matters: false };
  const name = REALM_NAME[P.realm];
  if (n.names.indexOf(name) < 0) return { ok: false };
  return { ok: true, matters: true, without: nm ? nm.T2 : null, name };
}
const J = (x) => JSON.stringify(x);
function explain(P, res) {
  const w = res.winners[0];
  const nw = narrate(P, w);
  if (!nw || !nw.win) return null;
  const rw = realmCheck(P, w, nw, w.line); if (!rw.ok) return null;
  let base = null; try { base = narrate(P, { play: null }); } catch (e) { base = null; }
  const wMiss = missingEnd(P, base, nw, w.play); if (wMiss === null) return null;
  const realm = P.realm !== "mrityulok" ? " in " + REALM_NAME[P.realm] : "";
  let s = "Before your play the round stands " + nw.T0[0] + "–" + nw.T0[1] + realm + ". ";
  s += "Play " + (w.play ? w.play + (w.target ? " on " + clean(w.target) : "") : "nothing") + ": " + sentenceOf(nw).concat(wMiss ? [wMiss] : []).join("; ") + " — " + nw.T1[0] + "–" + nw.T1[1] + ". ";
  if (nw.endChanges.length) s += "At the round's end " + endText(nw) + ". ";
  s += "You win " + nw.T2[0] + "–" + nw.T2[1] + ".";
  if (rw.matters) s += " " + rw.name + " decides it: " + (rw.without ? "in Mrityulok the same play ends " + rw.without[0] + "–" + rw.without[1] + "." : "without it this play is not the answer.");
  // THE MOST TEMPTING WRONG PLAYS: the strongest-looking card, the closest score, and any Astra that is cancelled — each
  // told with every change named and the solver's own score. One that cannot be told that way refuses the puzzle.
  const g0 = PZ.load(P, E, PZ.SEEDS[0]), hand = g0.players[0].hand, cardOf = (n) => hand.find((c) => c.n === n) || {};
  const lose = [], seen = new Set();
  res.plays.filter((p) => !p.win && p.play).forEach((p) => { if (!seen.has(p.play)) { seen.add(p.play); lose.push(p); } });
  const strongest = lose.slice().sort((a, b) => (cardOf(b.play).base || 0) - (cardOf(a.play).base || 0))[0];
  const closest = lose.slice().sort((a, b) => (b.you - b.them) - (a.you - a.them))[0];
  // always told: the strongest-looking card, the closest score, and EVERY Hero in your hand that loses (a Hero trap)
  const heroes = lose.filter((p) => cardOf(p.play).t === "hero");
  const pick = [strongest, closest].concat(heroes).filter(Boolean).filter((p, i, a) => a.indexOf(p) === i);
  const wrong = [];
  for (const p of pick.concat(lose.filter((p) => pick.indexOf(p) < 0))) {
    const must = pick.indexOf(p) >= 0;
    if (!must && wrong.length >= 2 && !(cardOf(p.play).t === "astra")) continue;
    const L = lineFor(P, p); if (!L) return null;
    const nl = narrate(P, p, { line: L }); if (!nl || nl.T2[0] !== p.you || nl.T2[1] !== p.them) return null;
    if (!realmCheck(P, p, nl, L).ok) return null;
    const miss = missingEnd(P, base, nl, p.play); if (miss === null) return null;
    if (!must && wrong.length >= 2 && !nl.noPower) continue;   // an extra entry only for an Astra that is cancelled
    const gap = p.them - p.you;
    wrong.push(clean(p.key) + " falls short: " + sentenceOf(nl).concat(miss ? [miss] : []).join("; ") + (nl.endChanges.length ? "; at the round's end " + endText(nl) : "")
      + "; the round ends " + p.you + "–" + p.them + (gap === 0 ? ", a draw, and a draw is not a win" : ", " + gap + " short"));
    if (!must && wrong.length >= 3) break;
  }
  if (!wrong.length || pick.some((p) => wrong.every((t) => t.indexOf(clean(p.key) + " falls short") !== 0))) return null;
  s += " Tempting but wrong: " + wrong.join(". ") + ".";
  return { text: s, narration: nw, realm: rw };
}

// ── 4. GRADE, MECHANIC, OBVIOUS ──
function grade(P, res) {
  const g = PZ.load(P, E, PZ.SEEDS[0]), hand = g.players[0].hand, w = res.winners[0];
  const plays = res.plays.filter((p) => p.play), near = plays.filter((p) => !p.win && p.them - p.you <= 3).length;
  const wc = hand.find((h) => h.n === w.play);
  const bigger = hand.filter((c) => c.base > ((wc && wc.base) || 0)).length;
  const obvious = bigger === 0 && !w.target && near === 0;
  const score = plays.length + 2 * near + 2 * bigger + (w.target ? 2 : 0) + (P.realm !== "mrityulok" ? 1 : 0);
  return { plays: plays.length, near, bigger, obvious, score, difficulty: score <= 7 ? "easy" : score <= 13 ? "medium" : "hard" };
}
// the realm is the lesson only if the engine says so: the SAME position in Mrityulok is not the same puzzle
function realmMatters(P, res) {
  const M = JSON.parse(JSON.stringify(P)); M.realm = "mrityulok";
  let r; try { r = PZ.solve(M, E, null); } catch (e) { return true; }
  const w = res.winners[0];
  return !(r.ok && r.winners[0].play === w.play && (r.winners[0].target || null) === (w.target || null));
}
function mechanicOf(P, res, nw, realm) {
  const w = res.winners[0], def = defOf(P.you.faction, w.play) || {};
  const names = new Set(nw.changes.map((c) => c.text).concat(nw.endChanges.map((c) => c.name)).join(" | ").match(/(?:from|by) ([A-Za-z' ]+)/g) || []);
  const has = (re) => [...names].some((x) => re.test(x)) || (re.test(nw.endChanges.map((c) => c.name).join(" ")));
  if (nw.leaps.length) return "leap";
  if (def.t === "hero") return "hero";
  if (realm && realm.matters) return "realm: " + REALM_NAME[P.realm].toLowerCase();   // named by the engine AND it decides the round
  if (has(/Chaos Surge/)) return "chaos surge";
  if (has(/Venom/)) return "venom";
  if (def.t === "astra") return "astras";
  if (def.t === "mantra") return "mantras";
  if (def.t === "artifact") return "artifacts";
  if (nw.changes.some((c) => / is removed by /.test(c.text))) return "removal";
  return "read the card";
}

// ── 5. TITLES (never name the winning card) and NEAR-DUPLICATES ──
const TITLES = {
  "hero": ["A Hero's Hour", "The Champion Waits", "One Hero Enough", "The Crowned Answer", "Not Every Crown", "The Hero's Price"],
  "leap": ["The Long Jump", "Borrowed Strength", "A Leap of Faith", "Across the Line", "The Second Body"],
  "venom": ["The Slow Poison", "Venom Keeps Count", "A Bitter Cup", "The Quiet Fang", "Poison Takes Its Time", "What the Venom Owes"],
  "chaos surge": ["Chaos Pays", "The Surge Decides", "Disorder in the Ranks", "Fortune of the Fallen", "Chaos at the Last"],
  "astras": ["The Right Weapon", "One Shot Only", "A Weapon from Heaven", "Not the Loudest Weapon", "The Weapon You Need", "Aim Before You Strike"],
  "mantras": ["The Spoken Word", "A Chant Turns It", "The Word Before the Blow", "A Quiet Verse"],
  "artifacts": ["The Relic's Due", "An Old Treasure", "What the Relic Gives"],
  "removal": ["Clear the Field", "One Less Rival", "Cut the Strongest", "Make Room"],
  "read the card": ["Count Carefully", "The Quiet Answer", "Every Point Matters", "Weigh the Hand", "Read Before You Play", "The Small Card", "Not the Biggest", "Measure Twice", "The Patient Choice", "Less Is More"],
  "realm": ["Under a Strange Sky", "The Land Decides", "The Realm's Favour", "Where the Ground Helps", "The Field Remembers", "Ground Rules"],
};
function titleFor(mech, used, avoid) {
  const pool = TITLES[mech] || TITLES[mech.indexOf("realm") === 0 ? "realm" : "read the card"];
  return pool.concat(TITLES["read the card"]).find((t) => !used.has(t) && !avoid.filter(Boolean).some((a) => t.toLowerCase().indexOf(a.toLowerCase()) >= 0)) || null;
}
// what the player looks at: the faction pair, and every card name in your hand and on both sides of the field
function signature(P) {
  const g = PZ.load(P, E, PZ.SEEDS[0]), names = [];
  for (const pi of [0, 1]) { const pl = g.players[pi]; pl.units.concat(pl.heroes).forEach((c) => names.push(pi + ":" + c.n)); }
  g.players[0].hand.forEach((c) => names.push("h:" + c.n));
  return { pair: P.you.faction + ">" + P.them.faction, names };
}
function similarity(a, b) {
  if (a.pair !== b.pair) return 0;
  const A = new Set(a.names), B = new Set(b.names); let i = 0; A.forEach((x) => { if (B.has(x)) i++; });
  return i / (A.size + B.size - i || 1);
}
const NEAR_DUP = 0.5;

// ── 6. JUDGE ONE CANDIDATE against the rules ──
// returns { ok, reason, puzzle, res, gr, ex } — `reason` names the first rule it fails
// ── 6a. RULE C (owner ruling 2026-10-16): the answer is never the obvious pick, at every difficulty. Measured by the engine:
// (1) the winning card is NOT your highest-power playable card — or a highest-power card loses; (2) some wrong play shows an
// equal or bigger IMMEDIATE swing (the score after the play, before the round end) than the winning play; (3) a single
// removal of an enemy Unit worth half or more of the opponent's total is the obvious pick too. → null, or the reason it fails
function swingOf(P, p, line) {
  const g = PZ.load(P, E, PZ.SEEDS[0]), T0 = totals(g), L = line || { before: [], after: [], pos: null };
  const pl = g.players[0], leap = (pr) => { E.doLeap(g, 0, pl.units[pr[0]], pl.units[pr[1]], false); E.sweepDeaths(g); };
  (L.before || []).forEach(leap);
  const idx = pl.hand.findIndex((c, i) => c.n === p.play && E.playableIndices(g, 0).indexOf(i) >= 0); if (idx < 0) return null;
  const spec = E.targetSpec(g, 0, pl.hand[idx]);
  const t = p.target && spec ? spec.options.find((o) => o.n === clean(p.target)) : null;
  E.playCard(g, 0, idx, t ? t.uid : null, L.pos == null ? null : L.pos);
  (L.after || []).forEach((pr) => { if (!g.over && g.turn === 0) leap(pr); });
  const T1 = totals(g);
  return (T1[0] - T1[1]) - (T0[0] - T0[1]);
}
// (owner ruling 2026-10-19, the LOOKS-AS-STRONG reading): a position passes only if some LOSING card in your hand looks at
// least as strong as the answer; the answer is never the single highest-printed-power card in your hand unless its win needs
// a round-end or realm effect the explanation names; and removals adding up to half the opponent's total or more (one Unit
// or a sweep, ruling 2026-10-23) are the obvious pick. → null, or why it fails
// (owner ruling 2026-10-23, THE ASTRA LOOPHOLE) how strong a card LOOKS: a Unit or Hero by its printed power; a removal or
// damage Astra by what it removes or deals to the opponent at the moment of play (an Astra removing an 8-power Unit looks like 8, not
// 0) — the answer by its winning target, a losing Astra by its strongest target (what the player sees it could do); any
// other card looks like 0
const REMOVAL = /destroy|deal \d|damage|remov/i;
function astraHit(P, play, target) {
  const nw = narrate(P, { play, target: target || null });
  if (!nw) return -1;   // not narratable: a losing Astra then looks like nothing, an answer fails Rule C
  return nw.changes.filter((c) => c.side === 1 && c.d < 0 && (c.text.indexOf(" by " + play + " (") >= 0 || c.text.indexOf(" from " + play + " (") >= 0)).reduce((t, c) => t - c.d, 0);
}
function looksOf(P, res, c, target) {
  if (c.t === "unit" || c.t === "hero") return c.base;
  if (c.t !== "astra") return 0;
  if (target !== undefined) return astraHit(P, c.n, target);
  return res.plays.filter((p) => p.play === c.n).reduce((m, p) => Math.max(m, astraHit(P, c.n, p.target)), 0);
}
function looksList(P, res, hand, wc, w) {
  const aw = looksOf(P, res, wc, w.target || null);
  const loses = (c) => res.plays.some((p) => p.play === c.n) && !res.plays.some((p) => p.play === c.n && p.win);
  if (aw < 0) return { aw, looks: [] };
  return { aw, looks: hand.filter((c) => c !== wc && loses(c) && looksOf(P, res, c) >= aw && looksOf(P, res, c) > 0) };
}
function ruleC(P, res, nw, realm) {
  const g0 = PZ.load(P, E, PZ.SEEDS[0]), hand = g0.players[0].hand, w = res.winners[0];
  const printed = (c) => (c.t === "unit" || c.t === "hero" ? c.base : 0);
  const wc = hand.find((c) => c.n === w.play) || { t: "pass", base: 0 }, wp = printed(wc);
  // (owner ruling 2026-10-23) SWEEPS too: everything the answer removes from the opponent, added up across any number of Units
  const removed = nw.changes.filter((c) => c.side === 1 && / is removed by /.test(c.text)).reduce((t, c) => t - c.d, 0);
  if (removed > 0 && removed * 2 >= nw.T0[1]) return "OBVIOUS_REMOVAL";
  const single = wp > 0 && hand.every((c) => c === wc || printed(c) < wp);
  const needsEnd = nw.T1[0] <= nw.T1[1] || (realm && realm.matters);   // it would not win before the round end, or the realm decides it
  if (single && !needsEnd) return "STRONGEST_CARD";
  if (!looksList(P, res, hand, wc, w).looks.length) return "NOTHING_LOOKS_AS_STRONG";
  return null;
}
// the cards that make Rule C hold (named in the owner's preview), and the HERO TRAPS (a Hero in your hand that loses)
function looksAsStrong(P, res) {
  const hand = PZ.load(P, E, PZ.SEEDS[0]).players[0].hand, w = res.winners[0];
  const wc = hand.find((c) => c.n === w.play) || { t: "pass", base: 0 };
  return looksList(P, res, hand, wc, w).looks.map((c) => c.n);
}
function heroTraps(P, res) {
  const hand = PZ.load(P, E, PZ.SEEDS[0]).players[0].hand;
  return hand.filter((c) => c.t === "hero" && res.plays.some((p) => p.play === c.n) && !res.plays.some((p) => p.play === c.n && p.win)).map((c) => c.n);
}
function judge(P, opts) {
  opts = opts || {};
  const solve = opts.solve || ((p) => PZ.solve(p, E, null));
  let res;
  try { res = solve(P); } catch (e) { return { ok: false, reason: "THREW" }; }
  if (!res.ok) return { ok: false, reason: res.reason, res };
  const gr = grade(P, res);
  if (gr.obvious) return { ok: false, reason: "OBVIOUS", res, gr };
  // every card in your hand can be played (a card the engine forbids — locked by Narada, a second Hero, a revive with no one
  // to revive — would need a reason the engine only logs; such positions are refused rather than half-explained)
  const g0 = PZ.load(P, E, PZ.SEEDS[0]);
  if (E.playableIndices(g0, 0).length !== g0.players[0].hand.length) return { ok: false, reason: "UNPLAYABLE_CARD", res, gr };
  if (!factionsTrue(g0, P)) return { ok: false, reason: "STOLEN_CARD", res, gr };
  const ex = explain(P, res);
  if (!ex) return { ok: false, reason: "EXPLANATION", res, gr };
  // the winning LINE must replay to exactly the solver's score (when several board slots win, solve() keeps the first
  // slot's line but the last slot's score — a puzzle where those differ is refused, so the reveal and the page agree)
  const w0 = res.winners[0];
  if (ex.narration.T2[0] !== w0.you || ex.narration.T2[1] !== w0.them) return { ok: false, reason: "LINE_SCORE", res, gr };
  const why = (opts.ruleC || ruleC)(P, res, ex.narration, ex.realm);
  if (why) return { ok: false, reason: "RULE_C", detail: why, res, gr };
  // a HERO TRAP must be told: every Hero in your hand that loses is listed with exactly why (explain() always picks it)
  const traps = heroTraps(P, res);
  if (traps.some((h) => ex.text.indexOf(" " + h + " falls short: ") < 0 && ex.text.indexOf("wrong: " + h + " falls short: ") < 0)) return { ok: false, reason: "HERO_TRAP_UNTOLD", res, gr };
  const mech = mechanicOf(P, res, ex.narration, ex.realm);
  return { ok: true, res, gr, ex, mechanic: mech, winner: res.winners[0], heroTraps: traps, looks: looksAsStrong(P, res) };
}

// ── 7. THE PLAN FOR A RUN OF DATES: difficulty by weekday, factions 4/4/3/3, Heroes, realms spread ──
function planSlots(dates, opts) {
  opts = opts || {};
  const facOrder = opts.factions || ["asuras", "vanaras", "nagas", "devas"];
  // FOUR Hero slots per 14 days (the ruling asks for at least 3), on four DIFFERENT factions (slots 2, 7, 12, 13 fall on
  // Vanaras, Nagas, Devas, Asuras in the rotation) — and they stand in Mrityulok: a realm's Hero bonus (Swarga's +1) is
  // read live, with no engine event to name it, so a Hero's arrival there could never be explained with a named cause
  const realmCycle = opts.realms || ["kalki", "mrityulok", "swarga", "patala", "mrityulok", "yaksha", "mrityulok", "mrityulok", "gandharva", "mrityulok", "rishi", "mrityulok", "mrityulok", "mrityulok"];
  // (owner ruling 2026-10-19) Hero ANSWERS are allowed but no longer required — Heroes appear as TRAPS (a Hero in your hand
  // that loses); so no day is reserved for a Hero answer unless a caller asks for one
  const heroAt = opts.heroAt || [];
  return dates.map((d, i) => ({ date: d, you: facOrder[i % facOrder.length], realm: realmCycle[i % realmCycle.length],
    difficulty: DIFF_BY_DAY[new Date(d + "T00:00:00Z").getUTCDay()], hero: heroAt.indexOf(i % 14) >= 0 }));
}
// OPPONENT BALANCE (owner ruling 2026-10-16): across a 14-day run each faction is the opponent 3–4 times, never a mirror.
// The opponents still free are dealt so the run ends balanced, counting the days already fixed (kept by the owner).
function planOpponents(slots, fixed, runLength) {
  const n = runLength || slots.length + fixed.length;
  const count = { devas: 0, asuras: 0, vanaras: 0, nagas: 0 };
  fixed.forEach((p) => { count[p.them.faction]++; });
  const open = slots.filter((s) => !s.them), cap = Math.ceil(n / 4);
  function go(i) {
    if (i === open.length) return FACTIONS.every((f) => count[f] >= Math.floor(n / 4) && count[f] <= cap);
    const s = open[i], opts = FACTIONS.filter((f) => f !== s.you && count[f] < cap).sort((a, b) => count[a] - count[b] || FACTIONS.indexOf(a) - FACTIONS.indexOf(b));
    for (const f of opts) { count[f]++; s.them = f; if (go(i + 1)) return true; count[f]--; s.them = null; }
    return false;
  }
  if (!go(0)) throw new Error("no balanced set of opponents exists for this run");
}
// THE WHOLE-RUN RULES, checked on the finished 14 (a run that breaks one is refused, never written)
const MECH_CAP = (k) => (k === "venom" ? 5 : 3);   // owner ruling 2026-10-19: up to 5 Venom puzzles per 14; 3 of any other
// opts2.heroTraps: { date: number of Hero traps } — a run needs at least 3 days with one (owner ruling 2026-10-19)
function checkSpread(list, opts2) {
  const n = list.length, quarter = Math.floor(n / 4), cap = Math.ceil(n / 4);
  const by = (k) => list.reduce((a, p) => (a[k(p)] = (a[k(p)] || 0) + 1, a), {});
  const you = by((p) => p.you.faction), them = by((p) => p.them.faction), mech = by((p) => p.mechanic);
  const errs = [];
  if (!FACTIONS.every((f) => (you[f] || 0) >= quarter && (you[f] || 0) <= cap)) errs.push("factions played " + JSON.stringify(you));
  if (!FACTIONS.every((f) => (them[f] || 0) >= quarter && (them[f] || 0) <= cap)) errs.push("opponents " + JSON.stringify(them));
  if (list.some((p) => p.you.faction === p.them.faction)) errs.push("a mirror match");
  if (Object.keys(mech).some((k) => k !== "hero" && mech[k] > MECH_CAP(k))) errs.push("mechanics " + JSON.stringify(mech));   // one cap, shared with the search
  const traps = list.filter((p) => (opts2 && opts2.heroTraps ? opts2.heroTraps[p.date] : 0) > 0).length;
  if (opts2 && opts2.heroTraps && traps < 3) errs.push("Hero traps " + traps);
  if (new Set(list.map((p) => p.realm)).size < 4) errs.push("realms");
  return errs;
}
function datesFrom(from, to) {
  const out = []; for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10)); return out;
}

// ── 7b. THE LEAK GUARD (the Daily suite's N5, applied before a puzzle is chosen): a card already named in a Daily Puzzle
// file on a line with a win/answer word may not become a winning card — that line would read as a spoiler ──
const fs = require("fs");
const DP_FILES = ["play/daily/index.html", "play/daily/page.js", "play/daily/daily.js", "play/daily/notes.js", "play/daily/puzzle-core.js",
  "tests/suites/puzzles.js", "tests/suites/daily.js", "tests/suites/dailygen.js", "scripts/puzzle-solve.js", "scripts/daily-notes-encode.js",
  "scripts/puzzle-answer-digest.js", "docs/MINI_GAMES_R1_DAILY_PUZZLE.md", "tests/fixtures/daily-answers.sha256.json", "scripts/daily-gen/lib.js", "scripts/daily-gen/batch.js"];
const WIN_WORD = /\b(win|wins|won|winning|winner|answer|solution|solves|correct)\b/i;
function leakyLines() {
  const lines = [];
  DP_FILES.forEach((f) => { let t = ""; try { t = fs.readFileSync(path.join(SITE, f), "utf8"); } catch (e) { return; } t.split("\n").forEach((l) => { if (WIN_WORD.test(l)) lines.push(l.toLowerCase()); }); });
  return lines;
}
const leaks = (lines, names) => names.filter(Boolean).some((n) => lines.some((l) => l.indexOf(n.toLowerCase()) >= 0));

// ── 8. FILL A RUN: for each slot, try seeded candidates until one passes every rule ──
// existing = puzzles already published (for near-duplicates and titles). Returns the chosen entries (in memory).
function generate(dates, existing, opts) {
  opts = opts || {};
  const maxTries = opts.maxTries || 20000;
  const slots = planSlots(dates, opts);
  const chosen = [], sigs = existing.map(signature), usedTitles = new Set(existing.map((p) => p.title));
  const mechCount = {}, winCards = new Set(), leakLines = opts.leakLines || leakyLines();
  function search(slot) {
    const r = mulberry32(hashStr("dy-daily|" + slot.date + "|" + slot.realm + "|" + (opts.salt || "") + (keep[slot.date] ? "|r2" : "")));
    for (let tries = 1; tries <= maxTries; tries++) {
      const P0 = candidate(r, slot); if (!P0) continue;
      // the hand is CONSTRUCTED for Rule C (see construct()); each assembled position is judged from scratch
      for (const { P, j } of construct(P0, Object.assign({}, slot, { trap: r() < 0.6 }), r, opts)) {
      if (j.gr.difficulty !== slot.difficulty) continue;
      if (j.mechanic !== "hero" && (mechCount[j.mechanic] || 0) >= MECH_CAP(j.mechanic)) continue;   // mechanics spread
      if (winCards.has(j.winner.play)) continue;                            // no winning card twice in a run
      if (leaks(leakLines, [j.winner.play, j.winner.target && clean(j.winner.target)])) continue;   // the leak guard (N5)
      const sig = signature(P);
      if (sigs.some((s) => similarity(s, sig) >= NEAR_DUP)) continue;       // no near-duplicates (this run and earlier)
      const title = titleFor(j.mechanic, usedTitles, [j.winner.play].concat(j.winner.target ? [clean(j.winner.target)] : []));
      if (!title) continue;
      P.title = title; P.mechanic = j.mechanic; P.difficulty = slot.difficulty;
      return Object.assign(j, { puzzle: P, tries, sig });
      }
    }
    return null;
  }
  // RE-CHECK (R2, owner ruling 2026-10-16): a stored puzzle for the date is KEPT only if it still passes every rule today
  // (and is not vetoed); otherwise the date is generated afresh. Vetoed positions count as "earlier" for near-duplicates.
  const keep = opts.keep || {};
  (opts.avoid || []).forEach((p) => sigs.push(signature(p)));
  function keepOne(slot, P) {
    const j = judge(P, opts); if (!j.ok || j.gr.difficulty !== slot.difficulty) return null;
    const def = defOf(P.you.faction, j.winner.play) || {};
    if (slot.hero !== (def.t === "hero") || (j.mechanic !== "hero" && (mechCount[j.mechanic] || 0) >= MECH_CAP(j.mechanic)) || winCards.has(j.winner.play)) return null;
    if (leaks(leakLines, [j.winner.play, j.winner.target && clean(j.winner.target)])) return null;
    const sig = signature(P); if (sigs.some((x) => similarity(x, sig) >= NEAR_DUP)) return null;
    const K = JSON.parse(JSON.stringify(P));
    const pool = TITLES[j.mechanic] || TITLES[j.mechanic.indexOf("realm") === 0 ? "realm" : "read the card"];
    if (pool.indexOf(K.title) < 0 || usedTitles.has(K.title)) { const t = titleFor(j.mechanic, usedTitles, [j.winner.play].concat(j.winner.target ? [clean(j.winner.target)] : [])); if (!t) return null; K.title = t; }
    K.mechanic = j.mechanic;
    return Object.assign(j, { puzzle: K, tries: 0, sig, kept: true });
  }
  // PINNED days (kept by the owner as they are): copied unchanged, explanation included; they count toward every spread rule
  const pinned = opts.pinned || {};
  planOpponents(slots.filter((s) => !pinned[s.date]), Object.values(pinned), slots.length);
  let heroWins = 0;
  for (const slot of slots) {
    if (pinned[slot.date]) {
      const P = pinned[slot.date], res = PZ.solve(P, E, null);
      const got = { puzzle: P, res, winner: res.winners[0], gr: grade(P, res), ex: { text: opts.pinnedText[slot.date] }, mechanic: P.mechanic, kept: true, pinned: true, sig: signature(P) };
      chosen.push(got); sigs.push(got.sig); usedTitles.add(P.title); mechCount[P.mechanic] = (mechCount[P.mechanic] || 0) + 1; winCards.add(got.winner.play);
      if (P.mechanic === "hero") heroWins++;
      continue;
    }
    let got = keep[slot.date] ? keepOne(slot, keep[slot.date]) : null;
    if (!got) got = search(slot);
    // a Hero slot whose Hero cannot pass Rule C gives way to a non-Hero answer (the run needs at least 2 Hero wins)
    if (!got && slot.hero) { slot.hero = false; slot.heroFellBack = true; got = search(slot); }
    // a realm that yields nothing within the budget gives way to Mrityulok (the realm-spread rule is checked afterwards)
    if (!got && slot.realm !== "mrityulok") { slot.realm = "mrityulok"; slot.fellBack = true; got = search(slot); }
    if (!got) throw new Error("no puzzle found for " + slot.date + " after " + maxTries + " tries");
    chosen.push(got); sigs.push(got.sig); usedTitles.add(got.puzzle.title); mechCount[got.mechanic] = (mechCount[got.mechanic] || 0) + 1; winCards.add(got.winner.play);
    if (got.mechanic === "hero") heroWins++;
  }
  if (dates.length === 14) { const errs = checkSpread(chosen.map((x) => x.puzzle)); if (errs.length) throw new Error("the run breaks a spread rule: " + errs.join("; ")); }
  return chosen;
}

// ── 9. THE PARALLEL SEARCH (a weekly run fills many days): each open day is searched on its own (in a worker), collecting
// every position that passes the per-position rules; then a combination is chosen that keeps every run rule. ──
// one day's pool: the realm may be any of slot.realms (Kalki Kshetra separates a Unit from an Astra at the round's end — the
// kind of difference Rule C needs); a Hero day mixes Hero builds with others, so a non-Hero answer can stand in
function poolFor(slot, opts) {
  opts = opts || {};
  const r = mulberry32(hashStr("dy-daily|pool|" + slot.date + "|" + (opts.salt || "")));
  const realms = slot.realms || [slot.realm], out = [], seen = new Set();
  const max = opts.maxTries || 60000, size = opts.poolSize || 16;
  for (let tries = 1; tries <= max && out.length < size; tries++) {
    // FREE PAIRS: the day may be any faction against any other (Nagas weighted up — Venom is where Rule C lives); the
    // chooser balances the factions played and faced across the run
    const W = ["nagas", "nagas", "devas", "asuras", "vanaras"];
    const you = slot.you || W[Math.floor(r() * W.length)], others = FACTIONS.filter((f) => f !== you);
    const them = slot.them || others[Math.floor(r() * others.length)];
    const s2 = Object.assign({}, slot, { you, them, realm: realms[Math.floor(r() * realms.length)], hero: r() < 0.15, trap: r() < 0.6 });
    const P0 = candidate(r, s2); if (!P0) continue;
    for (const { P, j } of construct(P0, s2, r, opts)) {
      const key = J(signature(P)); if (seen.has(key)) continue; seen.add(key);
      P.mechanic = j.mechanic; P.difficulty = slot.difficulty;
      out.push({ puzzle: P, mechanic: j.mechanic, play: j.winner.play, target: j.winner.target || null, isHero: (defOf(P.you.faction, j.winner.play) || {}).t === "hero", traps: j.heroTraps.length, tries });
    }
  }
  return out;
}
// CONSTRUCTING A HAND FOR RULE C. A random hand almost always makes the strongest card the answer. So, from a random setup,
// the engine is asked how EACH launch card of your faction would do if it were the card you hold: win or lose, and the swing
// it shows at the moment it is played. A hand is then assembled — ONE card that wins (on exactly one target), a BIGGER card
// that loses, and others that lose — and the assembled position is judged by every rule from scratch (the solver decides).
function construct(P0, slot, r, opts) {
  const setupCards = P0.setup.filter((s) => s.side === "you" && !s.pass).map((s) => s.play);
  const base = setupCards.slice(), seen = new Set(base), rows = [];
  for (const d of launch(P0.you.faction)) {
    if (seen.has(d.n)) continue;
    const T = JSON.parse(JSON.stringify(P0)); T.you.hand = base.concat([d.n]);
    let res; try { res = PZ.solve(T, E, null); } catch (e) { continue; }
    if (!res.plays || !res.plays.length || res.reason === "LUCK" || res.reason === "MALFORMED" || res.reason === "ILLEGAL" || res.reason === "NOT_A_PUZZLE") continue;
    let g; try { g = PZ.load(T, E, PZ.SEEDS[0]); } catch (e) { continue; }
    if (g.players[0].hand.length !== 1 || g.players[0].hand[0].n !== d.n || E.playableIndices(g, 0).length !== 1) continue;   // the card is still in hand and playable
    const mine = res.plays.filter((p) => p.play === d.n);
    if (!mine.length) continue;
    const wins = mine.filter((p) => p.win);
    const sw = Math.max(...mine.map((p) => { const v = swingOf(T, p, p.win ? p.line : lineFor(T, p)); return v == null ? -99 : v; }));
    rows.push({ n: d.n, t: d.t, base: d.p || 0, wins: wins.length, lose: !wins.length, swing: sw, hero: d.t === "hero" });
  }
  const winners = rows.filter((x) => x.wins === 1 && (!slot.hero || x.hero) && (slot.hero || !x.hero)), losers = rows.filter((x) => x.lose);
  const out = [];
  // a loose PRE-FILTER only (the corrected Rule C, ruling 2026-10-23, is enforced by judge → ruleC on every candidate)
  const looksRow = (l, w) => ((l.t === "unit" || l.t === "hero") && l.base >= (w.t === "unit" || w.t === "hero" ? w.base : 0)) || (l.t === "astra" && REMOVAL.test((defOf(P0.you.faction, l.n) || {}).txt || ""));
  for (const w of winners) {
    const traps = losers.filter((l) => looksRow(l, w) && !(l.hero && w.hero));
    if (!traps.length) continue;
    const heroLosers = losers.filter((l) => l.hero && !w.hero);
    for (let k = 0; k < 4; k++) {
      // a HERO TRAP when one is on offer (and the day wants one): a Hero in your hand that loses
      const first = slot.trap && heroLosers.length ? heroLosers[Math.floor(r() * heroLosers.length)] : traps[Math.floor(r() * traps.length)];
      const pick = new Set([first.n, traps[Math.floor(r() * traps.length)].n]);
      const extra = losers.filter((l) => !pick.has(l.n) && !(l.hero && (w.hero || [...pick].some((n) => (rows.find((x) => x.n === n) || {}).hero))));
      const more = Math.floor(r() * 3);
      for (let m = 0; m < more && extra.length; m++) pick.add(extra.splice(Math.floor(r() * extra.length), 1)[0].n);
      const P = JSON.parse(JSON.stringify(P0)); P.you.hand = base.concat([w.n], [...pick]);
      const j = judge(P, opts);
      if (j.ok && j.winner.play === w.n && (!slot.difficulty || j.gr.difficulty === slot.difficulty)) { out.push({ P, j }); break; }
    }
  }
  return out;
}
// choose one entry per open day so the whole run keeps its rules (backtracking over the pools)
function choose(slots, pools, fixed, existing, opts) {
  opts = opts || {};
  const leakLines = opts.leakLines || leakyLines();
  const sigs0 = existing.map(signature).concat((opts.avoid || []).map(signature)).concat(fixed.map(signature));
  const titles0 = new Set(existing.map((p) => p.title).concat(fixed.map((p) => p.title)));
  const pick = {}, open = slots.filter((s) => pools[s.date]);
  const TRAPS = 3;   // owner ruling 2026-10-19: at least 3 days of 14 carry a Hero trap
  const n = slots.length, cap = Math.ceil(n / 4), floor = Math.floor(n / 4);
  function ok(list, final) {
    const all = fixed.concat(list), mech = {}, you = {}, them = {};
    all.forEach((p) => { mech[p.mechanic] = (mech[p.mechanic] || 0) + 1; you[p.you.faction] = (you[p.you.faction] || 0) + 1; them[p.them.faction] = (them[p.them.faction] || 0) + 1; });
    if (!Object.keys(mech).every((k) => k === "hero" || mech[k] <= MECH_CAP(k))) return false;
    if (FACTIONS.some((f) => (you[f] || 0) > cap || (them[f] || 0) > cap)) return false;
    // still reachable: what is missing from the floor must fit in the days left
    const left = n - all.length, needYou = FACTIONS.reduce((t, f) => t + Math.max(0, floor - (you[f] || 0)), 0), needThem = FACTIONS.reduce((t, f) => t + Math.max(0, floor - (them[f] || 0)), 0);
    return needYou <= left && needThem <= left;
  }
  function go(i, list, sigs, titles, cards, traps) {
    if (i === open.length) return traps >= TRAPS;
    if (traps + (open.length - i) < TRAPS) return false;   // not enough days left to reach 3 Hero traps
    const s = open[i];
    const pool = pools[s.date].slice().sort((a, b) => ((b.traps > 0) - (a.traps > 0)));   // Hero traps first
    for (const c of pool) {
      if (cards.has(c.play) || leaks(leakLines, [c.play, c.target && clean(c.target)])) continue;
      const sig = signature(c.puzzle); if (sigs.some((x) => similarity(x, sig) >= NEAR_DUP)) continue;
      const P = JSON.parse(JSON.stringify(c.puzzle));
      const t = c.keptTitle && !titles.has(c.keptTitle) ? c.keptTitle : titleFor(c.mechanic, titles, [c.play].concat(c.target ? [clean(c.target)] : [])); if (!t) continue;
      P.title = t;
      if (!ok(list.concat([P]))) continue;
      pick[s.date] = P;
      if (go(i + 1, list.concat([P]), sigs.concat([sig]), new Set([...titles, t]), new Set([...cards, c.play]), traps + (c.traps > 0 ? 1 : 0))) return true;
      delete pick[s.date];
    }
    return false;
  }
  const fixedTraps = fixed.filter((p) => (opts.fixedTraps || {})[p.date] > 0).length;
  const fixedCards = new Set(fixed.map((p) => PZ.solve(p, E, null).winners[0].play));
  return go(0, [], sigs0, titles0, fixedCards, fixedTraps) ? { pick } : null;
}

// the position in plain words (for the owner's private preview — never written into the repo)
function describe(P) {
  const g = PZ.load(P, E, PZ.SEEDS[0]);
  const tok = (u) => (u.venom ? " (" + u.venom + " Venom Token" + (u.venom > 1 ? "s" : "") + ")" : "");
  const side = (pi) => { const pl = g.players[pi], items = pl.heroes.map((h) => h.n + " " + E.effPower(g, pi, h) + " (Hero)").concat(pl.units.filter((u) => !u.ghost).map((u) => u.n + " " + E.effPower(g, pi, u) + tok(u)));
    return (items.join(", ") || "nothing") + (pl.artifact ? "; Artifact: " + pl.artifact.n : ""); };
  const t = totals(g);
  return "You (" + FAC_NAME[P.you.faction] + ") " + t[0] + " vs the opponent (" + FAC_NAME[P.them.faction] + ") " + t[1] + ", realm " + REALM_NAME[P.realm] + ", the opponent has passed. "
    + "Your side: " + side(0) + ". Their side: " + side(1) + ". Your hand: " + g.players[0].hand.map((c) => c.n).join(", ") + ".";
}

module.exports = { looksOf, astraHit, missingEnd, fullName, heroTraps, looksAsStrong, MECH_CAP, construct, poolFor, choose, ruleC, swingOf, planOpponents, checkSpread, factionsTrue, venomSources, lineFor, realmCheck, noPowerReason, DP_FILES, WIN_WORD, leakyLines, realmMatters, E, PZ, SITE, FACTIONS, REALM_NAME, DIFF_BY_DAY, NEAR_DUP, hashStr, mulberry32, candidate, narrate, explain, grade, mechanicOf, titleFor, signature, similarity,
  judge, planSlots, datesFrom, generate, describe, clean, defOf };
