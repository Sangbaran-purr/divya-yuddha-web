"use strict";
// MINI-GAMES-1 · DAILY PUZZLE AUTOMATION — R1: THE GENERATOR (scripts/daily-gen). The generated batch as stored in the
// site (play/daily/puzzles.json from batch 2 on), checked against the real engine and the existing solver; the content
// rules; the explanation's own arithmetic, read back from its words; and the owner's named breakages applied to the
// generator's real source text, each of which must turn its check red (M·).
const path = require("path"), fs = require("fs"), Module = require("module"), { execFileSync } = require("child_process");
const H = require("../lib.js");
const SITE = H.SITE;
const LIB_PATH = path.join(SITE, "scripts", "daily-gen", "lib.js"), LIB_SRC = fs.readFileSync(LIB_PATH, "utf8");
const G = require(LIB_PATH), E = G.E, PZ = G.PZ;
const D = require(path.join(SITE, "play", "daily", "daily.js"));
const NOTES = require(path.join(SITE, "play", "daily", "notes.js"));
const PUZZLES = JSON.parse(fs.readFileSync(path.join(SITE, "play", "daily", "puzzles.json"), "utf8"));
const FP = JSON.parse(fs.readFileSync(path.join(SITE, "tests", "fixtures", "daily-answers.sha256.json"), "utf8"));
const { answerDigest } = require(path.join(SITE, "scripts", "puzzle-answer-digest.js"));
const B1 = PUZZLES.slice(0, 14), B2 = PUZZLES.filter((p) => p.date >= "2026-10-29" && p.date <= "2026-11-11");

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const J = (x) => JSON.stringify(x);
const clone = (o) => JSON.parse(JSON.stringify(o));
// the generator from (possibly mutated) source text, as Node would load it from its own folder
function libFrom(src) { const m = new Module(LIB_PATH, null); m.filename = LIB_PATH; m.paths = Module._nodeModulePaths(path.dirname(LIB_PATH)); m._compile(src, LIB_PATH); return m.exports; }
function mutant(from, to) { if (LIB_SRC.indexOf(from) < 0) throw new Error("mutant anchor gone: " + from.slice(0, 60)); return libFrom(LIB_SRC.split(from).join(to)); }

// the explanation's numbers, read back from its own words — for the winning play AND for every tempting wrong play:
// the position + every named change = the score after the play; + every named round-end change = the final score
function readChanges(list, start) {
  const sum = [0, 0], named = [];
  for (const it of list) {
    let x;
    const side = /^the opponent's /.test(it) || / joins the opponent's side/.test(it) ? 1 : 0;
    const ARR = / (?:enters|joins (?:your|the opponent's) side through .+?) at (\d+)/;
    if ((x = / and (gains|loses) (\d+) from ([^(]+) \(\d+\)$/.exec(it)) && ARR.test(it)) { sum[side] += +ARR.exec(it)[1] + (x[1] === "gains" ? 1 : -1) * +x[2]; named.push(true); }
    else if ((x = new RegExp(ARR.source + "$").exec(it))) sum[side] += +x[1];
    else if ((x = / (?:Leaps onto|makes a free Leap onto) .+ and gains (\d+) \((\d+)→(\d+)\)$/.exec(it))) { sum[side] += +x[1]; named.push(+x[3] - +x[2] === +x[1]); }
    else if (/^(first|then) .* Leaps onto [^;]+$/.test(it)) { /* a Leap that changes nothing */ }
    else if ((x = / (gains|loses) (\d+) from ([^(]+) \((\d+)→(\d+)\)$/.exec(it))) { const d = (x[1] === "gains" ? 1 : -1) * +x[2]; sum[side] += d; named.push(+x[5] - +x[4] === d && x[3].trim() !== "Leap"); }
    else if ((x = / is removed by (.+) \(−(\d+)\)$/.exec(it))) { sum[side] -= +x[2]; named.push(true); }
    else if (/ puts a Venom Token on /.test(it) || / adds no power$/.test(it) || / is an Artifact: it adds no power$/.test(it) || / cancels /.test(it)) { /* no power moves */ }
    else return { ok: false, why: "unread change: " + it };
  }
  return { ok: true, sum, named };
}
function readEnd(text) {
  const end = [0, 0], named = [];
  if (text) for (const it of text.split("; ")) { const x = /^(your|the opponent's) .+ ([+−])(\d+) from (.+)$/.exec(it); if (!x) return { ok: false, why: "unread end change: " + it };
    end[x[1] === "your" ? 0 : 1] += (x[2] === "+" ? 1 : -1) * +x[3]; named.push(!/^(Venom)$/.test(x[4])); }
  return { ok: true, end, named };
}
function arithmetic(text) {
  const m = /^Before your play the round stands (\d+)–(\d+)(?: in [^.]+)?\. Play [^:]+: (.*?) — (\d+)–(\d+)\. (?:At the round's end (.*?)\. )?You win (\d+)–(\d+)\.(?: ([^.]+) decides it: [^.]+\.)? Tempting but wrong: (.*)\.$/.exec(text);
  if (!m) return { ok: false, why: "pattern" };
  const [A, B, C, Dd, E2, F] = [m[1], m[2], m[4], m[5], m[7], m[8]].map(Number);
  const pc = readChanges(m[3].split("; ")), pe = readEnd(m[6]);
  if (!pc.ok) return pc; if (!pe.ok) return pe;
  let good = A + pc.sum[0] === C && B + pc.sum[1] === Dd && C + pe.end[0] === E2 && Dd + pe.end[1] === F && E2 > F && pc.named.concat(pe.named).every(Boolean);
  const wrongs = m[10].split(/\. (?=[A-Z][^:]* falls short: )/);
  for (const w of wrongs) {
    const x = /^(.+?) falls short: (.*?); the round ends (\d+)–(\d+), (?:a draw, and a draw is not a win|(\d+) short)$/.exec(w);
    if (!x) return { ok: false, why: "wrong-play pattern: " + w.slice(0, 80) };
    const parts = x[2].split("; "), at = parts.findIndex((q) => /^at the round's end /.test(q));
    const playParts = at < 0 ? parts : parts.slice(0, at), endPart = at < 0 ? "" : parts.slice(at).join("; ").replace(/^at the round's end /, "");
    const wc = readChanges(playParts), we = readEnd(endPart);
    if (!wc.ok) return wc; if (!we.ok) return we;
    const fy = A + wc.sum[0] + we.end[0], ft = B + wc.sum[1] + we.end[1];
    if (fy !== +x[3] || ft !== +x[4] || !wc.named.concat(we.named).every(Boolean) || (x[5] ? +x[4] - +x[3] !== +x[5] : +x[3] !== +x[4])) { good = false; return { ok: false, why: "wrong play " + x[1] + " does not add up: " + J({ fy, ft, said: [x[3], x[4]] }) }; }
  }
  return { ok: good, final: [E2, F], why: J({ A, B, C, D: Dd, E: E2, F, sum: pc.sum, end: pe.end }) };
}

(async () => {
  console.log("── R1 · the generated batch (scripts/daily-gen) ──");
  ok("B0 · batch 2 is in the data: 14 puzzles, Thu 29 Oct – Wed 11 Nov 2026", B2.length === 14 && B2[0].date === "2026-10-29" && B2[13].date === "2026-11-11");
  const solved = {};
  B2.forEach((P) => { solved[P.id] = PZ.solve(P, E, null); });
  ok("G1 · EXACTLY ONE winning play in every generated puzzle, identical under all 8 seeds (the existing solver), and it is the fingerprinted one",
    B2.every((P) => { const r = solved[P.id]; return r.ok && r.winners.length === 1 && FP.digests[P.id] === answerDigest(FP.salt, P.id, r.winners[0].play, r.winners[0].target); }),
    B2.filter((P) => !solved[P.id].ok).map((P) => P.date + " " + solved[P.id].reason).join(", "));
  const decoded = B2.map((P) => D.decodeNote(P.id, NOTES[P.id] || ""));
  const fresh = B2.map((P) => { const e = G.explain(P, solved[P.id]); return e ? e.text : null; });
  ok("G2 · every explanation is the one the engine writes today: the encoded note equals a fresh write-up from the engine's own numbers and events",
    decoded.every((t, i) => t && t === fresh[i]), B2.filter((P, i) => decoded[i] !== fresh[i]).map((P) => P.date).join(", "));
  const ar = decoded.map(arithmetic);
  ok("G3 · THE ARITHMETIC (Rule B), read back from each explanation's own words — for the winning play AND every tempting wrong play: the position + every named change = after the play; + every named round-end change = the final score (the winner's is the solver's)",
    ar.every((a, i) => a.ok && a.final[0] === solved[B2[i].id].winners[0].you && a.final[1] === solved[B2[i].id].winners[0].them),
    ar.map((a, i) => (a.ok ? "" : B2[i].date + " " + a.why)).filter(Boolean).join(" | "));
  ok("G4 · EVERY CAUSE NAMED (Rule B): every gain, loss and removal names its ability, realm or effect; a Leap names what it copies; Venom is split by source (the Naga drain, a Unit's own Tokens); no vague line ('lifts your side', a bare 'from Leap', a bare 'from Venom')",
    decoded.every((t) => !/(gains|loses) \d+ \(/.test(t.replace(/ (?:Leaps onto|makes a free Leap onto) [^;]*? and gains \d+ \(\d+→\d+\)/g, "")) && !/ is removed \(/.test(t)
      && !/lifts your side/.test(t) && !/ from Leap \(/.test(t) && !/ from Venom[;.]/.test(t)));
  ok("G5 · the explanation follows the fixed pattern: the position, the play and its changes, the round end, the final score, then the two most tempting wrong plays with the reason each falls short",
    decoded.every((t) => /^Before your play the round stands \d+–\d+/.test(t) && / You win \d+–\d+\./.test(t) && / Tempting but wrong: .+ falls short: .+(\d+ short|a draw is not a win)/.test(t)));
  // the content rules
  const facs = B2.reduce((a, p) => (a[p.you.faction] = (a[p.you.faction] || 0) + 1, a), {});
  ok("S1 · the factions you play rotate evenly: 4/4/3/3 across the 14 (" + J(facs) + ")", J(Object.values(facs).sort()) === J([3, 3, 4, 4]) && Object.keys(facs).length === 4);
  const heroes = B2.filter((P) => (G.defOf(P.you.faction, solved[P.id].winners[0].play) || {}).t === "hero");
  ok("S2 · at least 3 of the 14 winning plays are HEROES (" + heroes.length + "), on different factions", heroes.length >= 3 && new Set(heroes.map((p) => p.you.faction)).size === heroes.length);
  const realms = new Set(B2.map((p) => p.realm)), mech = B2.reduce((a, p) => (a[p.mechanic] = (a[p.mechanic] || 0) + 1, a), {});
  ok("S3 · realms and mechanics spread: " + realms.size + " realms; no mechanic but Hero more than 3 times (" + J(mech) + ")", realms.size >= 4 && Object.keys(mech).every((k) => k === "hero" || mech[k] <= 3) && Object.keys(mech).length >= 5);
  ok("S4 · difficulty rises Monday→Sunday (Mon–Tue easy, Wed–Fri medium, Sat–Sun hard), following the weekday from Thu 29 Oct",
    B2.every((p) => p.difficulty === G.DIFF_BY_DAY[new Date(p.date + "T00:00:00Z").getUTCDay()]));
  const rc = (p) => { const w = solved[p.id].winners[0], n = G.narrate(p, w); return n ? G.realmCheck(p, w, n, w.line) : { ok: false }; };
  ok("S5 · THE REALM RULE: a realm-labelled puzzle names its realm as the cause of a change AND says how it decides the round ('… decides it: in Mrityulok the same play ends …'); every other realm puzzle's numbers are exactly Mrityulok's (the realm changes nothing, so it is not the label)",
    B2.filter((p) => /^realm: /.test(p.mechanic)).every((p, i) => { const t = decoded[B2.indexOf(p)], r = rc(p); return r.ok && r.matters && t.indexOf("from " + r.name) >= 0 && t.indexOf(r.name + " decides it: ") >= 0; })
      && B2.filter((p) => p.realm !== "mrityulok" && !/^realm: /.test(p.mechanic)).every((p) => { const r = rc(p); return r.ok && !r.matters; }));
  ok("S10 · RULE A: no stolen or off-faction card on either side of any position — every card belongs to its side's own faction",
    B2.every((p) => G.factionsTrue(G.PZ.load(p, E, 1), p)));
  ok("S11 · every card left in your hand can be played (no card locked, no second Hero, no revive with no one to revive)",
    B2.every((p) => { const g = G.PZ.load(p, E, 1); return E.playableIndices(g, 0).length === g.players[0].hand.length; }));
  const sigs = B1.concat(B2).map(G.signature); let worst = 0;
  for (let i = 0; i < sigs.length; i++) for (let k = i + 1; k < sigs.length; k++) worst = Math.max(worst, G.similarity(sigs[i], sigs[k]));
  ok("S6 · NO NEAR-DUPLICATES across batches 1 and 2 (largest overlap " + worst.toFixed(2) + " < " + G.NEAR_DUP + ")", worst < G.NEAR_DUP);
  const allNames = Object.values(E.DECKS).flat();
  ok("S7 · LAUNCH CARDS ONLY and every name exists: each card in every hand is a launch card of that side's own faction",
    B2.every((p) => ["you", "them"].every((s) => p[s].hand.every((n) => { const d = E.DECKS[p[s].faction].find((x) => x.n === n); return d && !d.wave; }))) && B2.every((p) => p.setup.every((st) => st.pass || allNames.some((d) => d.n === st.play))));
  ok("S8 · titles are unique (with batch 1) and never name the winning card or its target",
    new Set(PUZZLES.map((p) => p.title)).size === PUZZLES.length && B2.every((p) => { const w = solved[p.id].winners[0]; return [w.play, w.target && G.clean(w.target)].filter(Boolean).every((n) => p.title.toLowerCase().indexOf(n.toLowerCase()) < 0); }));
  ok("S9 · the winning line replays to the solver's exact score in every generated puzzle (the reveal and the page agree)", B2.every((P) => { const n = G.narrate(P, solved[P.id].winners[0]); return n && n.T2[0] === solved[P.id].winners[0].you && n.T2[1] === solved[P.id].winners[0].them; }));
  // secrecy: nothing plain in the repo; the run's log names no answer
  const tracked = execFileSync("git", ["ls-files"], { cwd: SITE, encoding: "utf8" }).split("\n").filter((f) => /\.(js|json|html|md|txt|css)$/.test(f) && f.indexOf("node_modules") < 0);
  const corpus = tracked.map((f) => { try { return fs.readFileSync(path.join(SITE, f), "utf8"); } catch (e) { return ""; } }).join("\n");
  const sentences = decoded.flatMap((t) => t.split(/(?<=\.) /)).filter((x) => x.length > 30);
  ok("N1 · no generated explanation sentence appears in plain text in any tracked file (" + sentences.length + " sentences, " + tracked.length + " files); the owner's plain file is not in the repo",
    sentences.every((s) => corpus.indexOf(s) < 0) && !/DAILY PUZZLE, [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} – [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4} — ANSWERS AND EXPLANATIONS \(GENERATED\)/.test(corpus));   // a written file's dated heading (batch.js's own template line is not one)
  const runDates = ["2027-01-04", "2027-01-05"];
  const log = execFileSync(process.execPath, [path.join(SITE, "scripts", "daily-gen", "batch.js"), "--from", runDates[0], "--to", runDates[1], "--dry"], { cwd: SITE, encoding: "utf8" });
  const same = G.generate(runDates, PUZZLES);
  const secrets = same.flatMap((x) => [x.winner.play, x.winner.target && G.clean(x.winner.target)].filter(Boolean).concat(x.ex.text.split(/(?<=\.) /).filter((s) => s.length > 30)));
  ok("N2 · a run's LOG names no winning card, no target and no explanation — only each date with what the page shows anyway (a scheduled run's log is public)",
    /2027-01-04/.test(log) && secrets.every((s) => log.indexOf(s) < 0), log.split("\n").slice(0, 3).join(" / "));

  // ═══ the owner's named breakages, applied to the generator's real source ═══
  console.log("\n── the breakages ──");
  const base = clone(B1[0]);
  // a TWO-WINNER position (the puzzles suite's S1 construction)
  const two = clone(base); two.them.hand = two.them.hand.filter((n) => n !== "Ravana");
  two.setup = [{ side: "you", play: "Ashwini Kumars" }, { side: "them", play: "Narakasura" }, { side: "you", play: "Marut" }, { side: "them", pass: true }, { side: "you", play: "Gandharva" }, { side: "you", play: "Kubera" }];
  const luck = clone(B1[11]);   // the puzzles suite's S12 construction: Ahamkara's Chaos Surge lands on a random Asura Unit
  luck.setup = [{ side: "you", play: "Chandra Dev" }, { side: "them", play: "Bana Asura" }, { side: "you", play: "Marut" }, { side: "them", play: "Kali Asura" },
    { side: "you", play: "Gandharva" }, { side: "them", play: "Ahamkara", target: "Kali Asura" }, { side: "you", play: "Gandharva" }, { side: "them", pass: true }];
  const wave = clone(base); wave.you.hand.push("Suryastra");
  const rejects = (L, P, reason) => { const j = L.judge(P); return !j.ok && j.reason === reason; };
  ok("K1 · the generator REFUSES a two-winner position (TWO_WINS)", rejects(G, two, "TWO_WINS"));
  ok("K2 · …a position that depends on the dice (LUCK — the 8-seed check)", rejects(G, luck, "LUCK"));
  ok("K3 · …a Wave-1 card (NOT_LAUNCH), and never deals one: 2,000 candidates hold launch cards only",
    rejects(G, wave, "NOT_LAUNCH") && (() => { const r = G.mulberry32(9); for (let i = 0; i < 2000; i++) { const P = G.candidate(r, { date: "2027-01-04", you: G.FACTIONS[i % 4] }); if (P && P.you.hand.some((n) => E.DECKS[P.you.faction].find((d) => d.n === n).wave)) return false; } return true; })());
  const m1 = mutant('  if (!res.ok) return { ok: false, reason: res.reason, res };', '  if (!res.ok && res.reason !== "TWO_WINS") return { ok: false, reason: res.reason, res };');
  ok("M1 · breakage 'accept a two-winner position' is caught (K1 goes red)", !rejects(m1, two, "TWO_WINS"));
  const m2 = mutant('  if (!res.ok) return { ok: false, reason: res.reason, res };', '  if (!res.ok && res.reason !== "LUCK") return { ok: false, reason: res.reason, res };');
  ok("M2 · breakage 'skip the luck check' is caught (K2 goes red)", (() => { try { return !rejects(m2, luck, "LUCK"); } catch (e) { return true; } })());
  const m3 = mutant('const launch = (f) => E.DECKS[f].filter((d) => !d.wave);', 'const launch = (f) => E.DECKS[f];');
  ok("M3 · breakage 'deal Wave-1 cards' is caught (K3 goes red)", (() => { const r = m3.mulberry32(9); for (let i = 0; i < 2000; i++) { const P = m3.candidate(r, { date: "2027-01-04", you: G.FACTIONS[i % 4] }); if (P && P.you.hand.some((n) => E.DECKS[P.you.faction].find((d) => d.n === n).wave)) return true; } return false; })());
  const m4 = mutant('(d > 0 ? "gains " + d : "loses " + (-d)) + " from " + cs[0].name + " (" + a.p + "→" + b.p + ")"', '(d > 0 ? "gains " + (d + 1) : "loses " + (-d + 1)) + " from " + cs[0].name + " (" + a.p + "→" + b.p + ")"');
  const bad = B2.map((P) => { const e = m4.explain(P, solved[P.id]); return e ? arithmetic(e.text) : { ok: true }; });
  ok("M4 · breakage 'an explanation that doesn't add up' is caught (G3 goes red)", bad.some((a) => !a.ok));
  // R2 (owner rulings 2026-10-16): Rule A, Rule B and the realm rule — each on a real position, each with its breakage
  const R2P = JSON.parse(execFileSync("git", ["show", "b9bff27:play/daily/puzzles.json"], { cwd: SITE, encoding: "utf8" }));
  const old = (d) => clone(R2P.find((p) => p.date === d));
  let stolen = null; { const r = G.mulberry32(11); for (let i = 0; i < 20000 && !stolen; i++) { const P = G.candidate(r, { date: "2026-10-29", you: "asuras", realm: "mrityulok" }); if (P && G.judge(P).reason === "STOLEN_CARD") stolen = P; } }
  ok("K5 · RULE A: a position with a stolen card on the board is REFUSED (STOLEN_CARD)", !!stolen && rejects(G, stolen, "STOLEN_CARD"));
  const m6 = mutant("function factionsTrue(g, P) {", "function factionsTrue(g, P) { return true;");
  ok("M6 · breakage 'allow a stolen card' is caught (K5 goes red)", !!stolen && !rejects(m6, stolen, "STOLEN_CARD"));
  const vague = old("2026-10-30");   // the R2 preview's 30 Oct: its Vanara Scout line could only say "lifts your side"
  ok("K6 · RULE B: a puzzle whose tempting wrong play cannot be told with every cause named is REFUSED (EXPLANATION) — the R2 preview's 30 Oct", rejects(G, vague, "EXPLANATION"));
  // the breakage: a wrong play the writer cannot tell is printed anyway as a vague line, and the "most tempting must be
  // told" guard is dropped — the R2 preview's 30 Oct would then be ACCEPTED
  const STRICT = "    const L = lineFor(P, p); if (!L) return null;\n    const nl = narrate(P, p, { line: L }); if (!nl || nl.T2[0] !== p.you || nl.T2[1] !== p.them) return null;";
  const VAGUE = "    const L = lineFor(P, p); const nl = L && narrate(P, p, { line: L });\n    if (!nl || nl.T2[0] !== p.you || nl.T2[1] !== p.them) { wrong.push(clean(p.key) + \" falls short: it lifts your side to \" + p.you + \"; the round ends \" + p.you + \"–\" + p.them); continue; }";
  const GUARD = "  if (!wrong.length || pick.some((p) => wrong.every((t) => t.indexOf(clean(p.key) + \" falls short\") !== 0))) return null;";
  if (LIB_SRC.indexOf(STRICT) < 0 || LIB_SRC.indexOf(GUARD) < 0) throw new Error("mutant anchor gone: the wrong-play guard");
  const m7 = libFrom(LIB_SRC.split(STRICT).join(VAGUE).split(GUARD).join(""));
  ok("M7 · breakage 'a vague wrong-play line' is caught (K6 goes red)", !rejects(m7, vague, "EXPLANATION"));
  const m8 = mutant('  const mid = n.changes.filter((c) => !used.has(c)).map((c) => (c.leap ? whose(c.side) + c.leap.who + " makes a free Leap onto " + c.leap.onto + " and gains " + c.d + c.text.slice(c.text.lastIndexOf(" (")) : c.text));',
    '  const mid = n.changes.filter((c) => !used.has(c)).map((c) => c.text);');
  const leapy = B2.filter((p) => /makes a free Leap onto/.test(decoded[B2.indexOf(p)]));
  const m8txt = leapy.map((p) => (m8.explain(p, solved[p.id]) || {}).text || "");
  ok("K7 · RULE B: a Leap gain names what it copies — a card's own free Leap reads 'makes a free Leap onto …' (" + leapy.length + " puzzle(s) with one)", leapy.length >= 1);
  ok("M8 · breakage 'an unnamed Leap gain' is caught (G4 goes red)", m8txt.some((t) => / from Leap \(/.test(t)));
  const b1v = { 7: { side: 1, n: "Ravana", venom: 0, base: 12 } };
  const deep = [{ type: "toast", abilityName: "Venom", text: "Venom drains Opponent’s Units −2" }, { type: "venom", targetUids: [7], amount: -2, abilityName: "Venom" }];
  const tokens2 = [{ type: "venom", targetUids: [7], amount: -2, abilityName: "Venom" }];
  ok("K8 · RULE B: a multi-source Venom change cannot be split, so it is REFUSED — a −2 drain (base drain + its deepener) and Tokens that don't match the Unit's own count", G.venomSources(deep, b1v) === null && G.venomSources(tokens2, b1v) === null
    && J(G.venomSources([{ type: "toast", abilityName: "Venom", text: "Venom drains Opponent’s Units −1" }, { type: "venom", targetUids: [7], amount: -1 }], b1v)) === J([{ side: 1, n: "Ravana", amount: -1, name: "the Naga Venom drain" }]));
  const m9 = mutant("if (drainAmt !== 1 || e.amount !== -1) return null; out.push({ side: who.side, n: who.n, amount: -1, name: \"the Naga Venom drain\" });",
    "out.push({ side: who.side, n: who.n, amount: e.amount, name: \"the Naga Venom drain\" });");
  ok("M9 · breakage 'an unsplit multi-source change' is caught (K8 goes red)", m9.venomSources(deep, b1v) !== null);
  const yaksha = B2.find((p) => p.realm === "yaksha");
  ok("K9 · THE REALM RULE: a puzzle set in a realm that changes nothing is NOT labelled a realm puzzle (" + (yaksha ? yaksha.date + ": " + G.judge(yaksha).mechanic : "none") + ")", !!yaksha && !/^realm: /.test(G.judge(yaksha).mechanic));
  const m10 = mutant('  if (realm && realm.matters) return "realm: " + REALM_NAME[P.realm].toLowerCase();', '  if (P.realm !== "mrityulok") return "realm: " + REALM_NAME[P.realm].toLowerCase();');
  ok("M10 · breakage 'label any non-Mrityulok puzzle a realm puzzle' is caught (K9 goes red)", !!yaksha && /^realm: /.test(m10.judge(yaksha).mechanic));
  const locked = old("2026-11-03");   // the R2 preview's 3 Nov: Kesari locked by the opponent's Narada
  ok("K10 · a position with a card in your hand the engine forbids (Kesari, locked by Narada) is REFUSED (UNPLAYABLE_CARD)", rejects(G, locked, "UNPLAYABLE_CARD"));

  // a duplicate: the generator, offered the very puzzle it would make, must not make it again
  const d1 = G.generate(["2027-01-04"], B1, { maxTries: 20000 })[0];
  const again = G.generate(["2027-01-04"], B1.concat([d1.puzzle]), { maxTries: 20000 })[0];
  ok("K4 · the generator never repeats a position: offered its own first choice as an earlier puzzle, it picks another", G.similarity(G.signature(d1.puzzle), G.signature(again.puzzle)) < G.NEAR_DUP);
  const m5 = mutant('      if (sigs.some((s) => similarity(s, sig) >= NEAR_DUP)) continue;       // no near-duplicates (this run and earlier)', '');
  const dup = m5.generate(["2027-01-04"], B1.concat([d1.puzzle]), { maxTries: 20000 })[0];
  ok("M5 · breakage 'allow a duplicate' is caught (K4 goes red)", G.similarity(G.signature(d1.puzzle), G.signature(dup.puzzle)) >= G.NEAR_DUP);

  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
