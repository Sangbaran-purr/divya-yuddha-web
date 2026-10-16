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

// the explanation's numbers, read back from its own words: before + every change = after the play; + the round end = final
function arithmetic(text) {
  const m = /^Before your play the round stands (\d+)–(\d+)(?: in [^.]+)?\. Play [^:]+: (.*?) — (\d+)–(\d+)\. (?:At the round's end (.*?)\. )?You win (\d+)–(\d+)\./.exec(text);
  if (!m) return { ok: false, why: "pattern" };
  const [A, B, C, Dd, E2, F] = [m[1], m[2], m[4], m[5], m[7], m[8]].map(Number);
  const sum = [0, 0], named = [];
  for (const it of m[3].split("; ")) {
    let x;
    const side = /^the opponent's /.test(it) || / joins the opponent's side/.test(it) ? 1 : 0;
    const ARR = / (?:enters|joins (?:your|the opponent's) side(?: through .+?)?) at (\d+)/;   // "enters at 5" / "joins your side through Nala at 2"
    if ((x = / and (gains|loses) (\d+) from ([^(]+) \(\d+\)$/.exec(it)) && ARR.test(it)) { sum[side] += +ARR.exec(it)[1] + (x[1] === "gains" ? 1 : -1) * +x[2]; named.push(true); }
    else if ((x = new RegExp(ARR.source + "$").exec(it))) sum[side] += +x[1];
    else if ((x = / Leaps onto .* and gains (\d+) \((\d+)→(\d+)\)$/.exec(it))) { sum[0] += +x[1]; named.push(+x[3] - +x[2] === +x[1]); }
    else if (/^(first|then) .* Leaps onto [^;]+$/.test(it)) { /* a Leap that changes nothing countable */ }
    else if ((x = / (gains|loses) (\d+) from ([^(]+) \((\d+)→(\d+)\)$/.exec(it))) { const d = (x[1] === "gains" ? 1 : -1) * +x[2]; sum[side] += d; named.push(+x[5] - +x[4] === d); }
    else if ((x = / is removed by (.+) \(−(\d+)\)$/.exec(it))) { sum[side] -= +x[2]; named.push(true); }
    else return { ok: false, why: "unread change: " + it };
  }
  const end = [0, 0];
  if (m[6]) for (const it of m[6].split("; ")) { const x = /^(your|the opponent's) .+ ([+−])(\d+) from (.+)$/.exec(it); if (!x) return { ok: false, why: "unread end change: " + it }; end[x[1] === "your" ? 0 : 1] += (x[2] === "+" ? 1 : -1) * +x[3]; named.push(!!x[4]); }
  const good = A + sum[0] === C && B + sum[1] === Dd && C + end[0] === E2 && Dd + end[1] === F && E2 > F && named.every(Boolean);
  return { ok: good, final: [E2, F], why: J({ A, B, C, D: Dd, E: E2, F, sum, end }) };
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
  ok("G3 · THE ARITHMETIC, read back from each explanation's own words: the position + every change = the score after the play; + the round end = the final score, which is the solver's",
    ar.every((a, i) => a.ok && a.final[0] === solved[B2[i].id].winners[0].you && a.final[1] === solved[B2[i].id].winners[0].them),
    ar.map((a, i) => (a.ok ? "" : B2[i].date + " " + a.why)).filter(Boolean).join(" | "));
  ok("G4 · ONE NAMED CAUSE per change: every gain, loss and removal names the ability behind it (\"from …\", \"by …\")",
    decoded.every((t) => { const play = t.split(" Tempting")[0].replace(/ Leaps onto [^;]*? and gains \d+ \(\d+→\d+\)/g, " Leaps");   // a Leaper's gain IS the Leap, told with it
      return !/(gains|loses) \d+ \(/.test(play) && !/ is removed \(/.test(play); }));
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
  ok("S5 · realm puzzles are labelled so only when the engine says the realm decides it (the same position in Mrityulok is not the same puzzle)",
    B2.filter((p) => /^realm: /.test(p.mechanic)).every((p) => G.realmMatters(p, solved[p.id])) && B2.filter((p) => p.realm !== "mrityulok" && !/^realm: /.test(p.mechanic)).every((p) => !G.realmMatters(p, solved[p.id])));
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
    sentences.every((s) => corpus.indexOf(s) < 0) && !/DAILY PUZZLE, .* — ANSWERS AND EXPLANATIONS \(GENERATED\)/.test(corpus));
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
