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
  const itself = played && changes.some((c) => c.text.indexOf(played.n + " enters at") === 0 || c.text.indexOf("from " + played.n + " ") >= 0 || c.text.indexOf("by " + played.n + " ") >= 0 || c.text.indexOf(played.n + " puts a Venom Token") === 0);
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
  return { T0, T1, T2, changes, endChanges, leaps, noPower, win: h.winner === 0, names };
}

// ── 3. THE EXPLANATION — one fixed plain pattern ──
// a Leap is told as a Leap: "then Vanara Warrior Leaps onto Dwivida and gains 3 (4→7)"; a card's own free Leap (Mainda's)
// names what it copies: "Mainda makes a free Leap onto Jambavan and gains 2 (4→6)"
function sentenceOf(n) {
  const used = new Set();
  const gainOf = (name) => { const c = n.changes.find((x) => !used.has(x) && x.leap && x.leap.who === name); if (!c) return ""; used.add(c); return " and gains " + c.d + c.text.slice(c.text.lastIndexOf(" (")); };
  const before = n.leaps.filter((l) => l.when === "before").map((l) => "first " + l.names[0] + " Leaps onto " + l.names[1] + gainOf(l.names[0]));
  const after = n.leaps.filter((l) => l.when === "after").map((l) => "then " + l.names[0] + " Leaps onto " + l.names[1] + gainOf(l.names[0]));
  const mid = n.changes.filter((c) => !used.has(c)).map((c) => (c.leap ? whose(c.side) + c.leap.who + " makes a free Leap onto " + c.leap.onto + " and gains " + c.d + c.text.slice(c.text.lastIndexOf(" (")) : c.text));
  if (n.noPower) mid.push(n.noPower);
  return before.concat(mid, after);
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
  const realm = P.realm !== "mrityulok" ? " in " + REALM_NAME[P.realm] : "";
  let s = "Before your play the round stands " + nw.T0[0] + "–" + nw.T0[1] + realm + ". ";
  s += "Play " + (w.play ? w.play + (w.target ? " on " + clean(w.target) : "") : "nothing") + ": " + sentenceOf(nw).join("; ") + " — " + nw.T1[0] + "–" + nw.T1[1] + ". ";
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
  const pick = [strongest, closest].filter(Boolean).filter((p, i, a) => a.indexOf(p) === i);
  const wrong = [];
  for (const p of pick.concat(lose.filter((p) => pick.indexOf(p) < 0))) {
    if (wrong.length >= 2 && !(cardOf(p.play).t === "astra")) continue;
    const L = lineFor(P, p); if (!L) return null;
    const nl = narrate(P, p, { line: L }); if (!nl || nl.T2[0] !== p.you || nl.T2[1] !== p.them) return null;
    if (!realmCheck(P, p, nl, L).ok) return null;
    if (wrong.length >= 2 && !nl.noPower) continue;   // a third entry only for an Astra that is cancelled
    const gap = p.them - p.you;
    wrong.push(clean(p.key) + " falls short: " + sentenceOf(nl).join("; ") + (nl.endChanges.length ? "; at the round's end " + endText(nl) : "")
      + "; the round ends " + p.you + "–" + p.them + (gap === 0 ? ", a draw, and a draw is not a win" : ", " + gap + " short"));
    if (wrong.length >= 3) break;
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
  "hero": ["A Hero's Hour", "The Champion Waits", "One Hero Enough", "The Crowned Answer"],
  "leap": ["The Long Jump", "Borrowed Strength", "A Leap of Faith"],
  "venom": ["The Slow Poison", "Venom Keeps Count", "A Bitter Cup"],
  "chaos surge": ["Chaos Pays", "The Surge Decides", "Disorder in the Ranks"],
  "astras": ["The Right Weapon", "One Shot Only", "A Weapon from Heaven"],
  "mantras": ["The Spoken Word", "A Chant Turns It"],
  "artifacts": ["The Relic's Due", "An Old Treasure"],
  "removal": ["Clear the Field", "One Less Rival", "Cut the Strongest"],
  "read the card": ["Count Carefully", "The Quiet Answer", "Every Point Matters", "Weigh the Hand"],
  "realm": ["Under a Strange Sky", "The Land Decides", "The Realm's Favour", "Where the Ground Helps"],
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
  const mech = mechanicOf(P, res, ex.narration, ex.realm);
  return { ok: true, res, gr, ex, mechanic: mech, winner: res.winners[0] };
}

// ── 7. THE PLAN FOR A RUN OF DATES: difficulty by weekday, factions 4/4/3/3, Heroes, realms spread ──
function planSlots(dates, opts) {
  opts = opts || {};
  const facOrder = opts.factions || ["asuras", "vanaras", "nagas", "devas"];
  // FOUR Hero slots per 14 days (the ruling asks for at least 3), on four DIFFERENT factions (slots 2, 7, 12, 13 fall on
  // Vanaras, Nagas, Devas, Asuras in the rotation) — and they stand in Mrityulok: a realm's Hero bonus (Swarga's +1) is
  // read live, with no engine event to name it, so a Hero's arrival there could never be explained with a named cause
  const realmCycle = opts.realms || ["kalki", "mrityulok", "swarga", "patala", "mrityulok", "yaksha", "mrityulok", "mrityulok", "gandharva", "mrityulok", "rishi", "mrityulok", "mrityulok", "mrityulok"];
  const heroAt = opts.heroAt || [1, 6, 11, 12];
  return dates.map((d, i) => ({ date: d, you: facOrder[i % facOrder.length], realm: realmCycle[i % realmCycle.length],
    difficulty: DIFF_BY_DAY[new Date(d + "T00:00:00Z").getUTCDay()], hero: heroAt.indexOf(i % 14) >= 0 }));
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
      const P = candidate(r, slot); if (!P) continue;
      const j = judge(P, opts); if (!j.ok) continue;
      if (j.gr.difficulty !== slot.difficulty) continue;
      const def = defOf(P.you.faction, j.winner.play) || {};
      if (slot.hero !== (def.t === "hero")) continue;                       // Hero slots get a Hero; the others do not
      if (j.mechanic !== "hero" && (mechCount[j.mechanic] || 0) >= 3) continue;   // mechanics spread: no more than 3 of a kind (the Hero count is set by the slots)
      if (winCards.has(j.winner.play)) continue;                            // no winning card twice in a run
      if (leaks(leakLines, [j.winner.play, j.winner.target && clean(j.winner.target)])) continue;   // the leak guard (N5)
      const sig = signature(P);
      if (sigs.some((s) => similarity(s, sig) >= NEAR_DUP)) continue;       // no near-duplicates (this run and earlier)
      const title = titleFor(j.mechanic, usedTitles, [j.winner.play].concat(j.winner.target ? [clean(j.winner.target)] : []));
      if (!title) continue;
      P.title = title; P.mechanic = j.mechanic; P.difficulty = slot.difficulty;
      return Object.assign(j, { puzzle: P, tries, sig });
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
    if (slot.hero !== (def.t === "hero") || (j.mechanic !== "hero" && (mechCount[j.mechanic] || 0) >= 3) || winCards.has(j.winner.play)) return null;
    if (leaks(leakLines, [j.winner.play, j.winner.target && clean(j.winner.target)])) return null;
    const sig = signature(P); if (sigs.some((x) => similarity(x, sig) >= NEAR_DUP)) return null;
    const K = JSON.parse(JSON.stringify(P));
    const pool = TITLES[j.mechanic] || TITLES[j.mechanic.indexOf("realm") === 0 ? "realm" : "read the card"];
    if (pool.indexOf(K.title) < 0 || usedTitles.has(K.title)) { const t = titleFor(j.mechanic, usedTitles, [j.winner.play].concat(j.winner.target ? [clean(j.winner.target)] : [])); if (!t) return null; K.title = t; }
    K.mechanic = j.mechanic;
    return Object.assign(j, { puzzle: K, tries: 0, sig, kept: true });
  }
  for (const slot of slots) {
    let got = keep[slot.date] ? keepOne(slot, keep[slot.date]) : null;
    if (!got) got = search(slot);
    // a realm that yields nothing within the budget gives way to Mrityulok (the realm-spread rule is checked afterwards)
    if (!got && slot.realm !== "mrityulok") { slot.realm = "mrityulok"; slot.fellBack = true; got = search(slot); }
    if (!got) throw new Error("no puzzle found for " + slot.date + " after " + maxTries + " tries");
    chosen.push(got); sigs.push(got.sig); usedTitles.add(got.puzzle.title); mechCount[got.mechanic] = (mechCount[got.mechanic] || 0) + 1; winCards.add(got.winner.play);
  }
  return chosen;
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

module.exports = { factionsTrue, venomSources, lineFor, realmCheck, noPowerReason, DP_FILES, WIN_WORD, leakyLines, realmMatters, E, PZ, SITE, FACTIONS, REALM_NAME, DIFF_BY_DAY, NEAR_DUP, hashStr, mulberry32, candidate, narrate, explain, grade, mechanicOf, titleFor, signature, similarity,
  judge, planSlots, datesFrom, generate, describe, clean, defOf };
