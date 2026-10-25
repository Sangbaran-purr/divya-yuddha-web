"use strict";
// MINI-GAMES-1 · DAILY PUZZLE AUTOMATION — R4: THE JOB (scripts/daily-gen/job.js, run by .github/workflows/daily-*.yml).
// Every case runs the REAL job in a throwaway sparse clone of this repo, pushing to a throwaway bare repo standing in for
// GitHub. No network: the mailer writes to a file, and the generator is a stand-in serving tests/fixtures/
// daily-job-fixture.json (two 14-day blocks in 2099 + one replacement day, positions only — never served). The job's own
// GATE still judges every day under every generator rule, so "all generator rules in the job path" is tested for real.
// The owner's breakages (an answer in the log, a plain explanation committed, the buffer short, a forced push) are applied
// to the job's source text in a clone; each must turn its check red.
const path = require("path"), fs = require("fs"), os = require("os"), { spawnSync, execFileSync } = require("child_process");
const H = require("../lib.js");
const SITE = H.SITE;
const G = require(path.join(SITE, "scripts", "daily-gen", "lib.js"));
const D = require(path.join(SITE, "play", "daily", "daily.js"));
const JOB = require(path.join(SITE, "scripts", "daily-gen", "job.js"));
const FIXTURE = path.join(SITE, "tests", "fixtures", "daily-job-fixture.json");
const FX = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const ADDR = "owner-test@example.invalid";   // a stand-in address: it must never reach a log
const T0 = FX.blockA;                         // "today" for the weekly cases: the first fixture day

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✖ " + n + (d ? "\n      " + d : ""))); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "dy-dailyjob-"));
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 << 20 });
const ID = ["-c", "user.name=test", "-c", "user.email=test@example.invalid"];
// only what the job reads and writes (the full checkout is hundreds of MB of art)
const SPARSE = ["/scripts/", "/play/daily/", "/tests/fixtures/", "/tests/suites/", "/docs/", "/game/src/", "/invites-digest.json", "/.github/"];

// THE BASE: this repo as committed, with the working tree's job files copied over (so the suite tests what is on disk),
// its puzzles cut to the frozen part (to 11 Nov 2026) so later real weeks never collide with the 2099 fixture
let base, n = 0;
function makeBase() {
  base = path.join(TMP, "base");
  git(TMP, ["clone", "-q", "--no-checkout", SITE, base]);
  git(base, ["sparse-checkout", "set", "--no-cone"].concat(SPARSE));
  git(base, ["checkout", "-q", "main"]);
  const copy = ["scripts/daily-gen/job.js", "scripts/daily-gen/batch.js", "scripts/daily-gen/lib.js", "scripts/daily-gen/worker.js", "scripts/puzzle-answer-digest.js",
    "play/daily/daily.js", "play/daily/notes.js", "play/daily/puzzles.json", "play/daily/index.html", "play/daily/puzzle-core.js", "game/src/engine.js",
    "tests/fixtures/daily-answers.sha256.json", "tests/fixtures/daily-job-fixture.json"];
  copy.forEach((f) => { fs.mkdirSync(path.dirname(path.join(base, f)), { recursive: true }); fs.copyFileSync(path.join(SITE, f), path.join(base, f)); });
  const P = path.join(base, "play", "daily", "puzzles.json"), all = JSON.parse(fs.readFileSync(P, "utf8")).filter((p) => p.date <= "2026-11-11");
  fs.writeFileSync(P, "[\n" + all.map((p) => "  " + JSON.stringify(p)).join(",\n") + "\n]\n");
  git(base, ["add", "-A"]); git(base, ID.concat(["commit", "-q", "--allow-empty", "-m", "test base"]));
}
// a fresh "GitHub" (bare) and a fresh checkout of it — optionally with the job's source changed (a breakage)
function fresh(mutate) {
  const k = ++n, remote = path.join(TMP, "remote" + k + ".git"), work = path.join(TMP, "work" + k);
  git(TMP, ["clone", "-q", "--bare", base, remote]);
  git(TMP, ["clone", "-q", "--no-checkout", remote, work]);
  git(work, ["sparse-checkout", "set", "--no-cone"].concat(SPARSE)); git(work, ["checkout", "-q", "main"]);
  if (mutate) {
    const f = path.join(work, "scripts", "daily-gen", "job.js"); let s = fs.readFileSync(f, "utf8");
    mutate.forEach(([a, b]) => { if (s.indexOf(a) < 0) throw new Error("breakage anchor gone: " + a.slice(0, 60)); s = s.split(a).join(b); });
    fs.writeFileSync(f, s);
  }
  return { remote, work };
}
function breakJob(w, pairs) {
  const f = path.join(w.work, "scripts", "daily-gen", "job.js"); let s = fs.readFileSync(f, "utf8");
  pairs.forEach(([a, b]) => { if (s.indexOf(a) < 0) throw new Error("breakage anchor gone: " + a.slice(0, 60)); s = s.split(a).join(b); });
  fs.writeFileSync(f, s);
}
// the stand-in generator: the fixture's day for each date asked for (the replacement for a vetoed one)
const GEN = path.join(TMP, "gen.js");
fs.writeFileSync(GEN, 'module.exports = ({ dates, pinned, veto }) => {\n' +
  '  const fs = require("fs"), F = JSON.parse(fs.readFileSync(process.env.DY_JOB_FIXTURE, "utf8"));\n' +
  '  const bad = process.env.DY_JOB_BAD ? JSON.parse(fs.readFileSync(process.env.DY_JOB_BAD, "utf8")) : {};\n' +
  '  const out = [];\n' +
  '  for (const d of dates.filter((x) => pinned.indexOf(x) < 0)) { const P = bad[d] || (veto.indexOf(d) >= 0 ? F.alt[d] : F.days.find((p) => p.date === d)); if (!P) return null; out.push(JSON.parse(JSON.stringify(P))); }\n' +
  '  return out;\n};\n');
// the job, as a workflow runs it — the log captured whole
function run(w, args, extra) {
  const mail = path.join(TMP, "mail" + (++n) + ".jsonl");
  const env = Object.assign({ PATH: process.env.PATH, HOME: process.env.HOME, DY_JOB_GENERATOR: GEN, DY_JOB_FIXTURE: FIXTURE, DY_JOB_SUITES: "skip",
    DY_JOB_MAILER: "file:" + mail, PREVIEW_EMAIL: ADDR, RESEND_API_KEY: "test-key-never-sent", GITHUB_REPOSITORY: "Sangbaran-purr/divya-yuddha-web" }, extra || {});
  const r = spawnSync(process.execPath, [path.join(w.work, "scripts", "daily-gen", "job.js")].concat(args), { cwd: w.work, env, encoding: "utf8" });
  return { status: r.status, log: (r.stdout || "") + (r.stderr || ""), mails: fs.existsSync(mail) ? fs.readFileSync(mail, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [] };
}
const onRemote = (w, f) => git(w.remote, ["show", "main:" + f]);
const remotePuzzles = (w) => JSON.parse(onRemote(w, "play/daily/puzzles.json"));
const remoteNotes = (w) => { const f = path.join(TMP, "notes" + (++n) + ".js"); fs.writeFileSync(f, onRemote(w, "play/daily/notes.js")); return require(f); };   // UMD: Node gets the map
const subjects = (w) => git(w.remote, ["log", "--format=%s", "main"]).trim().split("\n");
// a digest commit by "the approval bot", landing on the remote while the job runs (its first push is then rejected)
function clashHook(w) {
  const bot = path.join(TMP, "bot" + (++n));
  return "git clone -q --no-checkout '" + w.remote + "' '" + bot + "' && cd '" + bot + "' && git sparse-checkout set --no-cone /invites-digest.json && git checkout -q main"
    + " && printf ' ' >> invites-digest.json && git -c user.name=bot -c user.email=bot@example.invalid commit -qam 'chore(invites): daily record digest (test)' && git push -q origin main";
}

// ── THE LOG IS PUBLIC: every line must be one of the job's own messages, filled only with dates, counts, ids and hashes;
// and no card, title, explanation clause or address may appear anywhere in it ──
const ARG = "(?:RESEND_API_KEY|PREVIEW_EMAIL|\\d{4}-\\d{2}-\\d{2}|dp-\\d{4}-\\d{2}-\\d{2}|\\d+|[0-9a-f]{7,40}|weekly|veto|watchdog|[a-z0-9-]{2,40})";
const TEMPLATES = Object.values(JOB.MSG).map((f) => { const parts = f.apply(null, Array(f.length).fill("\u0000")).split("\u0000"); return new RegExp("^" + parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(ARG) + "$"); });
const CARDS = [...new Set(Object.values(G.E.DECKS).flatMap((d) => d.map((c) => c.n)))];
function logLeaks(log, texts) {
  const lines = log.split("\n").filter((l) => l.trim());
  const bad = lines.filter((l) => !TEMPLATES.some((re) => re.test(l)));
  const names = CARDS.filter((c) => log.indexOf(c) >= 0);
  const titles = FX.days.concat(Object.values(FX.alt)).map((p) => p.title).filter((t) => log.indexOf(t) >= 0);
  const clauses = (texts || []).flatMap((t) => t.split(/[.;:—,→]\s+/)).filter((c) => c.length >= 22 && log.indexOf(c) >= 0);
  return { bad: bad.length, names: names.length, titles: titles.length, clauses: clauses.length, addr: log.indexOf(ADDR) >= 0, lines: lines.length };
}
const clean = (L) => L.bad === 0 && L.names === 0 && L.titles === 0 && L.clauses === 0 && !L.addr && L.lines > 0;
// no plain explanation in ANY committed file (notes.js included — it must hold only the encoded form)
function committedLeaks(w, texts) {
  const files = git(w.remote, ["ls-tree", "-r", "--name-only", "main"]).trim().split("\n").filter((f) => /\.(js|json|html|md|txt|css|yml)$/.test(f));
  const corpus = files.map((f) => onRemote(w, f)).join("\n");
  return texts.flatMap((t) => t.split(/[.;:—,→]\s+/)).filter((c) => c.length >= 22 && (/\d/.test(c) || /\s[A-Z][a-z]/.test(c)) && corpus.indexOf(c) >= 0).length;
}
const textsOf = (w, dates) => { const N = remoteNotes(w); return remotePuzzles(w).filter((p) => dates.indexOf(p.date) >= 0).map((p) => D.decodeNote(p.id, N[p.id] || "")); };
const window28 = (t) => G.datesFrom(t, JOB.addDays(t, JOB.AHEAD - 1));

(async () => {
  console.log("── MINI-GAMES-1 · DAILY PUZZLE AUTOMATION R4 · the job ──");
  makeBase();
  const fxDates = FX.days.map((p) => p.date), VETO = Object.keys(FX.alt)[0];
  ok("J0 · the fixture is two whole blocks in 2099 (" + FX.days.length + " days from " + T0 + ") and one replacement day, positions only",
    FX.days.length === 28 && JOB.blockStart(T0) === T0 && fxDates.every((d) => d.slice(0, 4) === "2099") && !!VETO && FX.days.concat(Object.values(FX.alt)).every((p) => !p.explanation && !p.answer));

  // ═══ WEEKLY — 28 days ready, the clash retried, the preview, a public log ═══
  const A = fresh();
  const wk = run(A, ["weekly", "--today", T0], { DY_JOB_BEFORE_PUSH: clashHook(A) });
  const ready = new Set(remotePuzzles(A).map((p) => p.date));
  ok("J1 · WEEKLY: every one of the next 28 days has a puzzle on the remote afterwards", wk.status === 0 && window28(T0).every((d) => ready.has(d)), "exit " + wk.status + " · " + wk.log.split("\n").slice(-3).join(" | "));
  const subs = subjects(A);
  ok("J2 · a digest commit landing mid-run REJECTS the first push; the job rebases onto it and pushes again — the digest commit survives, the job's commit sits on top (never forced)",
    /rejected: rebased onto the remote/.test(wk.log) && /pushed on attempt 2/.test(wk.log) && /^chore\(daily\)/.test(subs[0]) && subs[1] === "chore(invites): daily record digest (test)");
  const m = wk.mails[0] || {}, days = (m.text || "").split("\n\n— — —\n\n");
  ok("J3 · ONE preview email, to the owner's address (from the secret), with every new day: date, title, difficulty, mechanic, position, winning play, explanation and a veto link with the date",
    wk.mails.length === 1 && m.to === ADDR && days.length === 28 && days.every((b, i) => b.indexOf(fxDates[i]) >= 0 && /\nTitle: .+/.test(b) && /\nDifficulty: (easy|medium|hard)/.test(b)
      && /\nMechanic: .+/.test(b) && /\nPosition: You \(/.test(b) && /\nWinning play: .+/.test(b) && /\nExplanation: Before your play/.test(b)
      && b.indexOf("Veto this puzzle: https://github.com/Sangbaran-purr/divya-yuddha-web/actions/workflows/daily-veto.yml") >= 0 && b.indexOf("enter the date " + fxDates[i]) >= 0));
  const newTexts = textsOf(A, fxDates);
  const L1 = logLeaks(wk.log, newTexts);
  ok("J4 · THE PUBLIC LOG: every line is one of the job's messages (dates, counts, ids, hashes); no card, title, explanation or address (" + L1.lines + " lines)", clean(L1), JSON.stringify(L1));
  ok("J5 · nothing plain is committed: the explanations are encoded, the answers only fingerprints (no explanation clause in any committed file, notes.js included)",
    newTexts.length === 28 && newTexts.every((t) => /^Before your play/.test(t)) && committedLeaks(A, newTexts) === 0);
  const FP = JSON.parse(onRemote(A, "tests/fixtures/daily-answers.sha256.json")), { answerDigest } = require(path.join(SITE, "scripts", "puzzle-answer-digest.js"));
  ok("J6 · each new day's fingerprint is the solver's one winning play; the page's stamps moved on by one",
    remotePuzzles(A).filter((p) => fxDates.indexOf(p.date) >= 0).every((P) => { const w = G.PZ.solve(P, G.E, null).winners[0]; return FP.digests[P.id] === answerDigest(FP.salt, P.id, w.play, w.target); })
      && /notes\.js\?v=d(\d+)/.exec(onRemote(A, "play/daily/index.html"))[1] - /notes\.js\?v=d(\d+)/.exec(fs.readFileSync(path.join(base, "play", "daily", "index.html"), "utf8"))[1] === 1);
  const again = run(A, ["weekly", "--today", T0]);
  ok("J7 · run again with 28 days ready: nothing to do — no commit, no email", again.status === 0 && /nothing to do/.test(again.log) && again.mails.length === 0 && subjects(A)[0] === subs[0]);

  // ═══ VETO — exactly that day replaced ═══
  const before = remotePuzzles(A), nBefore = remoteNotes(A), fBefore = JSON.parse(onRemote(A, "tests/fixtures/daily-answers.sha256.json")).digests;
  const vt = run(A, ["veto", "--date", VETO, "--today", T0]);
  const after = remotePuzzles(A), nAfter = remoteNotes(A), fAfter = JSON.parse(onRemote(A, "tests/fixtures/daily-answers.sha256.json")).digests;
  const changed = after.filter((p) => JSON.stringify(p) !== JSON.stringify(before.find((b) => b.date === p.date))).map((p) => p.date);
  const nChanged = Object.keys(nAfter).filter((k) => nAfter[k] !== nBefore[k]), fChanged = Object.keys(fAfter).filter((k) => fAfter[k] !== fBefore[k]);
  ok("J8 · VETO: exactly that day is replaced — its position and explanation (its fingerprint is the new answer's); every other day byte-identical; committed and pushed",
    vt.status === 0 && after.length === before.length && changed.join() === VETO && nChanged.join() === "dp-" + VETO && fChanged.every((k) => k === "dp-" + VETO)
      && (() => { const P = after.find((p) => p.date === VETO), w = G.PZ.solve(P, G.E, null).winners[0], F = JSON.parse(onRemote(A, "tests/fixtures/daily-answers.sha256.json")); return F.digests[P.id] === answerDigest(F.salt, P.id, w.play, w.target); })()
      && /owner veto/.test(subjects(A)[0]),
    "exit " + vt.status + " · changed " + changed.join() + " · notes " + nChanged.join() + " · prints " + fChanged.join() + " · " + vt.log.trim().split("\n").slice(-2).join(" | "));
  ok("J9 · …and the owner gets a fresh preview of the replacement, with its own veto link", vt.mails.length === 1 && vt.mails[0].subject.indexOf(VETO) >= 0 && vt.mails[0].text.indexOf("enter the date " + VETO) >= 0 && /Explanation: Before your play/.test(vt.mails[0].text));
  const L2 = logLeaks(vt.log, textsOf(A, [VETO]));
  ok("J10 · the veto's log is as public-safe as the weekly's", clean(L2), JSON.stringify(L2));
  const past = run(A, ["veto", "--date", "2026-10-20", "--today", T0]), junk = run(A, ["veto", "--date", "2099-13-45; echo hi", "--today", T0]);
  ok("J11 · a past date or a malformed one is REFUSED — nothing committed, no email", past.status !== 0 && /date-in-the-past/.test(past.log) && junk.status !== 0 && /bad-date/.test(junk.log) && past.mails.length + junk.mails.length === 0 && /owner veto/.test(subjects(A)[0]));

  // ═══ WATCHDOG — a gap in the next 14 days emails the owner ═══
  const gapDay = JOB.addDays(fxDates[27], 1);   // 2099-01-29: the day after the fixture
  const wd = run(A, ["watchdog", "--today", JOB.addDays(gapDay, -10)]), quiet = run(A, ["watchdog", "--today", T0]);
  ok("J12 · WATCHDOG: with days missing in the next 14 it emails the owner the missing dates; with all 14 ready it stays silent",
    wd.status === 0 && wd.mails.length === 1 && /4 days without a puzzle/.test(wd.mails[0].subject) && wd.mails[0].text.indexOf(gapDay) >= 0 && /archive/.test(wd.mails[0].text)
      && quiet.status === 0 && quiet.mails.length === 0 && /all of the next 14 days have a puzzle/.test(quiet.log));
  ok("J13 · …and its log is public-safe too", clean(logLeaks(wd.log)) && clean(logLeaks(quiet.log)));

  // ═══ THE GENERATOR'S RULES IN THE JOB PATH — the job's own gate refuses what a generator should never have produced ═══
  const refused = JSON.parse(fs.readFileSync(path.join(SITE, "tests", "fixtures", "daily-gen-refused.json"), "utf8")).drainSpentOnBoard;
  const bad1 = path.join(TMP, "bad1.json"), dupDay = FX.days[5];
  const dup = Object.assign(JSON.parse(JSON.stringify(dupDay)), { date: FX.days[12].date, id: "dp-" + FX.days[12].date, title: "A Second Copy", difficulty: FX.days[12].difficulty });
  fs.writeFileSync(bad1, JSON.stringify({ [FX.days[3].date]: Object.assign(JSON.parse(JSON.stringify(refused)), { date: FX.days[3].date, id: "dp-" + FX.days[3].date, difficulty: FX.days[3].difficulty }) }));
  const B = fresh(), g1 = run(B, ["weekly", "--today", T0], { DY_JOB_BAD: bad1 });
  const bad2 = path.join(TMP, "bad2.json"); fs.writeFileSync(bad2, JSON.stringify({ [dup.date]: dup }));
  const B2 = fresh(), g2 = run(B2, ["weekly", "--today", T0], { DY_JOB_BAD: bad2 });
  ok("J14 · RULES IN THE JOB PATH: a position the generator must refuse (an untold effect), or a near-duplicate, is REFUSED by the job's gate — nothing committed, no email",
    g1.status !== 0 && /failed: gate-rules/.test(g1.log) && g2.status !== 0 && /failed: gate-near-duplicate/.test(g2.log)
      && subjects(B)[0] === "test base" && subjects(B2)[0] === "test base" && g1.mails.length + g2.mails.length === 0);
  const wf = ["daily-weekly.yml", "daily-watchdog.yml", "daily-veto.yml"].map((f) => fs.readFileSync(path.join(SITE, ".github", "workflows", f), "utf8"));
  const src = fs.readFileSync(path.join(SITE, "scripts", "daily-gen", "job.js"), "utf8");
  ok("J15 · NEVER FORCED: no force flag in the job's push or the workflows, and the job's git refuses one outright",
    !/--force|push -f\b|\+refs|\+main/.test(wf.join("\n")) && /git\(\["push", "origin", "HEAD:main"\], true\)/.test(src) && !/\["push", "--force/.test(src) && /throw new JobError\("force-refused"\)/.test(src));
  ok("J16 · THE WORKFLOWS: weekly Mondays 03:30 UTC (09:00 IST) and by hand; watchdog daily; veto by hand with a date input passed as data; secrets RESEND_API_KEY + PREVIEW_EMAIL; a failure step emails the owner",
    /cron: "30 3 \* \* 1"/.test(wf[0]) && /workflow_dispatch/.test(wf[0]) && /cron: "0 4 \* \* \*"/.test(wf[1]) && /inputs:\s+date:/.test(wf[2]) && /DY_JOB_DATE: \$\{\{ inputs\.date \}\}/.test(wf[2])
      && !/run:.*inputs\.date/.test(wf[2]) && wf.every((w) => /secrets\.RESEND_API_KEY/.test(w) && /secrets\.PREVIEW_EMAIL/.test(w) && /if: failure\(\)[\s\S]*job\.js alert/.test(w))
      && /contents: write/.test(wf[0]) && /contents: read/.test(wf[1]) && /contents: write/.test(wf[2]));

  // ═══ THE FIRST CI RUN (2026-10-23) failed on `npm ci`: tests/package-lock.json is git-ignored (S-HALL-SUITE-1), so a fresh
  // checkout has none. No workflow may use `npm ci` while that lockfile is ignored; the install is `npm install --no-save` ═══
  const lockIgnored = spawnSync("git", ["check-ignore", "-q", "tests/package-lock.json"], { cwd: SITE }).status === 0;
  const wfAll = fs.readdirSync(path.join(SITE, ".github", "workflows")).filter((f) => /\.ya?ml$/.test(f)).map((f) => [f, fs.readFileSync(path.join(SITE, ".github", "workflows", f), "utf8")]);
  const usesCi = wfAll.filter(([, t]) => /\bnpm ci\b|\bnpm clean-install\b|\bnpm install-clean\b/.test(t)).map(([f]) => f);
  ok("J18 · NO `npm ci` WHILE THE LOCKFILE IS IGNORED: no workflow (" + wfAll.length + ") runs npm ci; the weekly and veto install with `npm install --no-save` in tests/",
    !(lockIgnored && usesCi.length) && ["daily-weekly.yml", "daily-veto.yml"].every((f) => /npm install --no-save --prefix tests/.test((wfAll.find((w) => w[0] === f) || ["", ""])[1])),
    "lockfile ignored: " + lockIgnored + " · npm ci in: " + usesCi.join(", "));

  // ═══ SECRETS FIRST (owner ruling 2026-10-23): a missing secret stops the weekly or veto job before anything is generated ═══
  const S1 = fresh(), noMail = run(S1, ["weekly", "--today", T0], { PREVIEW_EMAIL: "" }), noKey = run(S1, ["veto", "--date", "2026-11-05", "--today", "2026-10-23"], { RESEND_API_KEY: " " });
  ok("J17 · SECRETS FIRST: with PREVIEW_EMAIL or RESEND_API_KEY missing, the weekly and veto jobs stop at once — no generation, no commit, no push, no email; the log names only the missing secret",
    noMail.status !== 0 && /missing secret: PREVIEW_EMAIL/.test(noMail.log) && !/missing secret: RESEND_API_KEY/.test(noMail.log) && !/block |generator|checked|wrote/.test(noMail.log)
      && noKey.status !== 0 && /missing secret: RESEND_API_KEY/.test(noKey.log) && !/block |generator|checked|wrote/.test(noKey.log)
      && subjects(S1)[0] === "test base" && noMail.mails.length + noKey.mails.length === 0 && noMail.log.indexOf("test-key-never-sent") < 0 && noKey.log.indexOf(ADDR) < 0
      && clean(logLeaks(noMail.log)) && clean(logLeaks(noKey.log)), noMail.log.trim().split("\n").join(" | ") + " // " + noKey.log.trim().split("\n").join(" | "));

  // ═══ THE OWNER'S BREAKAGES — each applied to the job's source, each caught ═══
  const M1 = fresh([['    say("checked", P.id);', '    say("checked", P.id); console.log(j.winner.play);']]), r1 = run(M1, ["weekly", "--today", T0]);
  ok("B1 · breakage 'print an answer to the log' is caught (J4 goes red)", !clean(logLeaks(r1.log, [])));
  // (on the weekly road the job's own leak gate already refuses it — the plain notes of the first block trip the second's —
  // so it is shown on the one-day veto road, where it would otherwise be committed)
  const M2 = fresh(); run(M2, ["weekly", "--today", T0]);
  breakJob(M2, [["notes[x.puzzle.id] = D.encodeNote(x.puzzle.id, x.text);", "notes[x.puzzle.id] = x.text;"]]);
  const r2 = run(M2, ["veto", "--date", VETO, "--today", T0]);
  const told2 = r2.mails.length ? r2.mails[0].text.split("\nExplanation: ").slice(1).map((s) => s.split("\n")[0]) : [];
  ok("B2 · breakage 'write a plain explanation into a committed file' is caught (J5 goes red)", r2.status === 0 && told2.length === 1 && committedLeaks(M2, told2) > 0, "exit " + r2.status + " · told " + told2.length + " · " + r2.log.trim().split("\n").slice(-1));
  const M3 = fresh([["AHEAD = 28", "AHEAD = 14"]]), r3 = run(M3, ["weekly", "--today", T0]), got3 = new Set(remotePuzzles(M3).map((p) => p.date));
  ok("B3 · breakage 'let the buffer fall short' (14 days, not 28) is caught (J1 goes red)", !window28(T0).every((d) => got3.has(d)));
  const M4 = fresh([['  if (args.some((a) => /^--force/.test(a)', '  if (false && args.some((a) => /^--force/.test(a)'], ['["push", "origin", "HEAD:main"]', '["push", "--force", "origin", "HEAD:main"]']]);
  const r4 = run(M4, ["weekly", "--today", T0], { DY_JOB_BEFORE_PUSH: clashHook(M4) });
  ok("B4 · breakage 'force-push' is caught (J2 goes red: the approval bot's digest commit is wiped off the remote)", !subjects(M4).some((s) => s === "chore(invites): daily record digest (test)"), "exit " + r4.status + " · " + r4.log.trim().split("\n").slice(-3).join(" | ") + " · " + subjects(M4).slice(0, 3).join(" / "));

  const M5 = fresh([['  say("start", "weekly", t);\n  requireSecrets();', '  say("start", "weekly", t);']]), r5 = run(M5, ["weekly", "--today", T0], { PREVIEW_EMAIL: "" });
  ok("B5 · breakage 'generate before checking the secrets' is caught (J17 goes red: the job generates, commits and pushes with no address to preview to)", subjects(M5)[0] !== "test base" && /wrote 14 day/.test(r5.log), r5.log.trim().split("\n").slice(-3).join(" | "));

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("\n" + (fail ? "FAILURES" : "ALL GREEN") + " — " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(String(e && e.message || e).slice(0, 400)); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (x) {} process.exit(1); });
