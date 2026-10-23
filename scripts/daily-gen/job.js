#!/usr/bin/env node
"use strict";
// MINI-GAMES-1 · DAILY PUZZLE AUTOMATION R4 — the job behind the three workflows (.github/workflows/daily-*.yml).
//
//   node scripts/daily-gen/job.js weekly                 keep puzzles ready 28 days ahead; generate, check, commit, push, email
//   node scripts/daily-gen/job.js watchdog               email the owner if any of the next 14 days has no puzzle
//   node scripts/daily-gen/job.js veto --date YYYY-MM-DD replace that day under every rule; commit, push, email the replacement
//   node scripts/daily-gen/job.js alert --what <job>     email the owner that a job failed (the workflows' failure step)
//   (--today YYYY-MM-DD fixes "today" for tests; otherwise today is the UTC date — the page's own day)
//
// THE LOG IS PUBLIC (a public repo's Actions log). Every line this job prints comes from MSG below, filled only with
// dates, counts, ids and commit hashes — never a card, a title, a position, an answer, an explanation or the address. The
// generator's own output is never echoed. The answers go only to the owner, by email (secrets RESEND_API_KEY and
// PREVIEW_EMAIL). Nothing plain is written into the repo: explanations are encoded (notes.js), answers are salted
// fingerprints. A push is NEVER forced: a rejected push is rebased onto the remote (the approval bot's digest commits)
// and tried again.
//
// Days come in 14-day BLOCKS (from 2026-10-15, the first puzzle) because every run rule — factions 4/4/3/3, opponents,
// mechanics, Hero traps — is a rule of 14 days. A block with missing days is filled whole, its existing days pinned.
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const SITE = path.resolve(__dirname, "..", "..");
const G = require("./lib.js");
const D = require(path.join(SITE, "play", "daily", "daily.js"));
const { answerDigest } = require(path.join(SITE, "scripts", "puzzle-answer-digest.js"));
const PUZ = path.join(SITE, "play", "daily", "puzzles.json"), NOTES = path.join(SITE, "play", "daily", "notes.js");
const FIX = path.join(SITE, "tests", "fixtures", "daily-answers.sha256.json"), HTML = path.join(SITE, "play", "daily", "index.html");
const FILES = ["play/daily/puzzles.json", "play/daily/notes.js", "play/daily/index.html", "tests/fixtures/daily-answers.sha256.json"];
const ANCHOR = "2026-10-15", BLOCK = 14, AHEAD = 28, WATCH = 14, DAY = 86400000;
const DEFAULT_FROM = "Divya Yuddha <noreply@divyayuddha.games>";

// ── the log: the ONLY printing in this file ──
const MSG = {
  start: (mode, today) => mode + " job, today " + today,
  window: (a, b) => "window " + a + " to " + b,
  missing: (n) => n + " day(s) missing",
  block: (a, b, n) => "block " + a + " to " + b + ": " + n + " day(s) to generate",
  attempt: (n) => "generator attempt " + n,
  genfail: (n) => "generator attempt " + n + " did not finish",
  checked: (id) => "checked " + id,
  wrote: (n) => "wrote " + n + " day(s)",
  suites: (n) => "daily suites green (" + n + " checks)",
  commit: (sha) => "committed " + sha,
  push: (n) => "pushed on attempt " + n,
  rebase: (n) => "push " + n + " rejected: rebased onto the remote",
  nopush: () => "push skipped (local run)",
  mail: (n) => "email sent for " + n + " day(s)",
  nothing: () => "nothing to do",
  gap: (n) => n + " of the next 14 days without a puzzle: owner emailed",
  ready: () => "all of the next 14 days have a puzzle",
  alert: () => "failure email sent",
  fail: (code) => "failed: " + code,
};
const say = (k, ...a) => console.log(MSG[k](...a));
class JobError extends Error { constructor(code) { super(code); this.code = String(code).replace(/[^a-z0-9-]/g, "-"); } }

// ── dates ──
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + "T00:00:00Z") + n * DAY);
const blockStart = (d) => addDays(ANCHOR, Math.floor((Date.parse(d + "T00:00:00Z") - Date.parse(ANCHOR + "T00:00:00Z")) / DAY / BLOCK) * BLOCK);
const blockDates = (start) => G.datesFrom(start, addDays(start, BLOCK - 1));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && iso(Date.parse(s + "T00:00:00Z")) === s;
const DAYN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (d) => { const t = new Date(d + "T00:00:00Z"); return DAYN[t.getUTCDay()] + " " + t.getUTCDate() + " " + MON[t.getUTCMonth()] + " " + t.getUTCFullYear(); };

// ── the repo's Daily Puzzle files ──
function readState() {
  delete require.cache[require.resolve(NOTES)];
  return { puzzles: JSON.parse(fs.readFileSync(PUZ, "utf8")), notes: require(NOTES), fix: JSON.parse(fs.readFileSync(FIX, "utf8")) };
}
function writeState(st, fresh) {
  // fresh: [{ puzzle, text, winner }] — the explanation is ENCODED, the answer only as its salted fingerprint
  const byDate = {}; st.puzzles.forEach((p) => { byDate[p.date] = p; }); fresh.forEach((x) => { byDate[x.puzzle.date] = x.puzzle; });
  const all = Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1));
  fs.writeFileSync(PUZ, "[\n" + all.map((p) => "  " + JSON.stringify(p)).join(",\n") + "\n]\n");
  const notes = Object.assign({}, st.notes); fresh.forEach((x) => { notes[x.puzzle.id] = D.encodeNote(x.puzzle.id, x.text); });
  const src = fs.readFileSync(NOTES, "utf8"), head = src.slice(0, src.indexOf("(function (root) { var N = ")), tail = src.slice(src.indexOf(";\n", src.indexOf("var N = ")) + 2);
  fs.writeFileSync(NOTES, head + "(function (root) { var N = " + JSON.stringify(notes, null, 1) + ";\n" + tail);
  fresh.forEach((x) => { st.fix.digests[x.puzzle.id] = answerDigest(st.fix.salt, x.puzzle.id, x.winner.play, x.winner.target); });
  fs.writeFileSync(FIX, JSON.stringify(st.fix, null, 2) + "\n");
}
// the page fetches puzzles.json and notes.js by stamp: move both on (once per run), so no browser keeps a stale copy
function bumpStamps() {
  let h = fs.readFileSync(HTML, "utf8");
  h = h.replace(/notes\.js\?v=d(\d+)/, (m, n) => "notes.js?v=d" + (+n + 1)).replace(/DY_DAILY_V = "d(\d+)"/, (m, n) => 'DY_DAILY_V = "d' + (+n + 1) + '"');
  fs.writeFileSync(HTML, h);
}

// ── the generator: batch.js (every generator rule), its output never echoed; a test may hand in its own source ──
function generate(dates, pinned, veto, salt, attempt) {
  if (process.env.DY_JOB_GENERATOR) return require(path.resolve(process.env.DY_JOB_GENERATOR))({ site: SITE, dates, pinned, veto, salt, attempt });
  const out = path.join(os.tmpdir(), "dy-daily-job-" + process.pid + "-" + Date.now() + ".json");
  const sizes = [[20000, 40], [60000, 120], [120000, 200]][Math.min(attempt, 2)];
  const args = [path.join(__dirname, "batch.js"), "--from", dates[0], "--to", dates[dates.length - 1], "--recheck", "--parallel", "--quiet",
    "--tries", String(sizes[0]), "--pool", String(sizes[1]), "--salt", salt, "--out-json", out];
  if (pinned.length) args.push("--keep", pinned.join(","));
  if (veto.length) args.push("--veto", veto.join(","));
  const r = spawnSync(process.execPath, args, { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
  if (r.status !== 0 || !fs.existsSync(out)) return null;
  const list = JSON.parse(fs.readFileSync(out, "utf8")); fs.unlinkSync(out);
  return list;
}

// ── THE GATE: every new day is judged again here, under every rule, before anything is written ──
function gate(st, block, fresh) {
  const leakLines = G.leakyLines();
  const others = st.puzzles.filter((p) => block.indexOf(p.date) < 0);
  const checked = [];
  for (const P of fresh) {
    if (!P || block.indexOf(P.date) < 0) throw new JobError("gate-date");
    P.id = "dp-" + P.date;
    const j = G.judge(P);
    if (!j.ok) throw new JobError("gate-rules");
    if (P.difficulty !== G.DIFF_BY_DAY[new Date(P.date + "T00:00:00Z").getUTCDay()] || j.gr.difficulty !== P.difficulty) throw new JobError("gate-difficulty");
    const sig = G.signature(P);
    if (others.concat(checked.map((x) => x.puzzle)).some((o) => G.similarity(G.signature(o), sig) >= G.NEAR_DUP)) throw new JobError("gate-near-duplicate");
    if (G.leaks(leakLines, [j.winner.play, j.winner.target && G.clean(j.winner.target)])) throw new JobError("gate-leak-line");
    checked.push({ puzzle: P, text: j.ex.text, winner: j.winner, judged: j });
    say("checked", P.id);
  }
  // the block's run rules (14 days): the pinned days as stored, the new ones as just judged
  const all = block.map((d) => checked.find((x) => x.puzzle.date === d) || { puzzle: st.puzzles.find((p) => p.date === d), text: null });
  if (all.some((x) => !x.puzzle)) throw new JobError("gate-incomplete-block");
  const ht = {};
  all.forEach((x) => { const P = x.puzzle, t = x.text != null ? x.text : D.decodeNote(P.id, st.notes[P.id] || ""); ht[P.date] = G.heroTraps(P, G.PZ.solve(P, G.E, null)).filter((h) => t.indexOf(h + " falls short: ") >= 0).length; });
  if (G.checkSpread(all.map((x) => x.puzzle), { heroTraps: ht }).length) throw new JobError("gate-spread");
  // the 90-day title rule (2026-10-23): no title within 90 days of the same title, before or after
  const used = others.map((p) => [p.title, p.date]);
  all.forEach((x) => { if (G.titleClash(used, x.puzzle.title, x.puzzle.date)) throw new JobError("gate-title"); used.push([x.puzzle.title, x.puzzle.date]); });
  return checked;
}

function fillBlock(st, start, veto, saltBase) {
  const block = blockDates(start), have = new Set(st.puzzles.map((p) => p.date));
  const todo = block.filter((d) => !have.has(d) || veto.indexOf(d) >= 0), pinned = block.filter((d) => have.has(d) && veto.indexOf(d) < 0);
  say("block", block[0], block[block.length - 1], todo.length);
  for (let attempt = 0; attempt < 3; attempt++) {
    say("attempt", attempt + 1);
    const got = generate(block, pinned, veto, saltBase + "-" + attempt, attempt);
    if (!got) { say("genfail", attempt + 1); continue; }
    const dates = got.map((p) => p.date).sort();
    if (dates.length !== todo.length || dates.some((d, i) => d !== todo.slice().sort()[i])) throw new JobError("generator-wrong-days");
    return gate(st, block, got);
  }
  throw new JobError("generator-exhausted");
}

// ── the suites that guard the Daily Puzzle, run on the written files before anything is committed ──
// (the suite FILES are run directly: tests/run.js first checks for the whole stack — the web3 repo, forge artifacts — which a
// job's checkout of this repo alone does not have; these three suites need only Node and tests/node_modules)
function runSuites() {
  if (process.env.DY_JOB_SUITES === "skip") return;
  let total = 0;
  for (const name of ["daily", "puzzles", "dailygen"]) {
    const r = spawnSync(process.execPath, [path.join(SITE, "tests", "suites", name + ".js")], { cwd: path.join(SITE, "tests"), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
    const m = /ALL GREEN — (\d+)\/(\d+)\s*$/.exec(r.stdout || "");
    if (r.status !== 0 || !m || m[1] !== m[2]) throw new JobError("suites-red");   // their labels are never echoed here
    total += +m[1];
  }
  say("suites", total);
}

// ── git: commit, then push with rebase-and-retry. NEVER forced. ──
function git(args, allowFail) {
  if (args.some((a) => /^--force/.test(a) || a === "-f" || /^\+/.test(a) || a === "--mirror" || a === "--delete" || a === "-d")) throw new JobError("force-refused");
  const r = spawnSync("git", args, { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0 && !allowFail) throw new JobError("git-" + args[0]);
  return r;
}
const ID = ["-c", "user.name=Divya Yuddha daily job", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com"];
function commitAndPush(message) {
  git(["add"].concat(FILES));
  if (git(["diff", "--cached", "--quiet"], true).status === 0) return false;
  git(ID.concat(["commit", "-m", message]));
  say("commit", git(["rev-parse", "--short", "HEAD"]).stdout.trim());
  if (process.env.DY_JOB_NO_PUSH === "1") { say("nopush"); return true; }
  for (let n = 1; n <= 5; n++) {
    if (n === 1 && process.env.DY_JOB_BEFORE_PUSH) spawnSync(process.env.DY_JOB_BEFORE_PUSH, { shell: true, stdio: "ignore" });   // tests: a digest commit lands mid-run
    if (git(["push", "origin", "HEAD:main"], true).status === 0) { say("push", n); return true; }
    say("rebase", n);
    if (git(ID.concat(["pull", "--rebase", "origin", "main"]), true).status !== 0) { git(["rebase", "--abort"], true); throw new JobError("rebase-conflict"); }
  }
  throw new JobError("push-failed");
}

// ── email: to the owner only (PREVIEW_EMAIL), through Resend; the address is never printed ──
function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const u = (git(["remote", "get-url", "origin"], true).stdout || "").trim(), m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(u);
  return m ? m[1] : "Sangbaran-purr/divya-yuddha-web";
}
const actionsUrl = (file) => (process.env.GITHUB_SERVER_URL || "https://github.com") + "/" + repoSlug() + "/actions/workflows/" + file;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function previewMail(days, kind) {
  const veto = actionsUrl("daily-veto.yml");
  const blocks = days.map((x) => {
    const P = x.puzzle, w = x.winner;
    return [
      ["", nice(P.date) + " (" + P.date + ")"],
      ["Title", P.title],
      ["Difficulty", P.difficulty], ["Mechanic", P.mechanic],
      ["Position", G.describe(P)],
      ["Winning play", (w.play || "Pass") + (w.target ? " on " + G.clean(w.target) : "")],
      ["Explanation", x.text],
      ["Veto this puzzle", veto + "  — press \"Run workflow\" and enter the date " + P.date],
    ];
  });
  const first = days[0].puzzle.date, last = days[days.length - 1].puzzle.date;
  const subject = kind === "veto" ? "Daily Puzzle — the replacement for " + first : "Daily Puzzle preview — " + (days.length === 1 ? "1 new day, " + first : days.length + " new days, " + first + " to " + last);
  const intro = kind === "veto" ? "The vetoed day has a new puzzle. It is committed and live on its date." : "These days were generated, checked under every rule, committed and pushed. Veto any of them before its date.";
  const text = intro + "\n\n" + blocks.map((b) => b.map(([k, v]) => (k ? k + ": " : "") + v).join("\n")).join("\n\n— — —\n\n") + "\n";
  const html = '<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;max-width:640px">' + "<p>" + esc(intro) + "</p>"
    + blocks.map((b) => '<div style="border-top:1px solid #ccc;padding:12px 0">' + b.map(([k, v]) => k === "Veto this puzzle"
      ? '<p><a href="' + esc(veto) + '">Veto this puzzle</a> — press “Run workflow” and enter the date <b>' + esc(b[0][1].slice(-11, -1)) + "</b></p>"
      : k ? "<p><b>" + esc(k) + ":</b> " + esc(v) + "</p>" : "<h3 style=\"margin:0 0 6px\">" + esc(v) + "</h3>").join("") + "</div>").join("") + "</div>";
  return { subject, text, html };
}
async function sendMail(m) {
  const sink = process.env.DY_JOB_MAILER || "";
  if (sink.indexOf("file:") === 0) { fs.appendFileSync(sink.slice(5), JSON.stringify({ to: process.env.PREVIEW_EMAIL || "", from: process.env.MAIL_FROM || DEFAULT_FROM, subject: m.subject, text: m.text, html: m.html }) + "\n"); return; }
  const key = process.env.RESEND_API_KEY, to = process.env.PREVIEW_EMAIL;
  if (!key || !to) throw new JobError("mail-secrets-missing");
  let r;
  try { r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || DEFAULT_FROM, to: [to], subject: m.subject, text: m.text, html: m.html }) }); }
  catch (e) { throw new JobError("mail-network"); }
  if (!r.ok) throw new JobError("mail-http-" + r.status);
}

// ── the three jobs ──
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
function today() { const t = arg("--today") || process.env.DY_JOB_TODAY; if (t && !isDate(t)) throw new JobError("bad-today"); return t || iso(Date.now()); }

async function weekly() {
  const t = today(), win = G.datesFrom(t, addDays(t, AHEAD - 1));
  say("start", "weekly", t); say("window", win[0], win[win.length - 1]);
  let st = readState();
  const have = new Set(st.puzzles.map((p) => p.date)), missing = win.filter((d) => !have.has(d));
  say("missing", missing.length);
  if (!missing.length) { say("nothing"); return; }
  const fresh = [];
  for (const start of [...new Set(missing.map(blockStart))].sort()) {
    const got = fillBlock(st, start, [], "wk-" + start);
    // written at once (not committed yet): the next block's generator must SEE these days — their titles, their positions
    writeState(readState(), got); say("wrote", got.length);
    fresh.push(...got);
    st = readState();
  }
  bumpStamps();
  runSuites();
  const days = fresh.map((x) => x.puzzle.date).sort();
  commitAndPush("chore(daily): puzzles ready to " + days[days.length - 1] + " (" + fresh.length + " new)");
  await sendMail(previewMail(fresh.sort((a, b) => (a.puzzle.date < b.puzzle.date ? -1 : 1)), "weekly")); say("mail", fresh.length);
}

async function veto() {
  const t = today(), d = arg("--date") || process.env.DY_JOB_DATE;
  say("start", "veto", t);
  if (!isDate(d)) throw new JobError("bad-date");
  if (d < t) throw new JobError("date-in-the-past");
  const st = readState(), old = st.puzzles.find((p) => p.date === d);
  if (!old) throw new JobError("no-puzzle-on-that-date");
  const salt = "veto-" + d + "-" + G.hashStr(JSON.stringify(old)).toString(36);
  const got = fillBlock(st, blockStart(d), [d], salt);
  writeState(readState(), got); say("wrote", got.length);
  bumpStamps();
  runSuites();
  commitAndPush("chore(daily): " + d + " replaced (owner veto)");
  const mine = got.filter((x) => x.puzzle.date === d).concat(got.filter((x) => x.puzzle.date !== d));
  await sendMail(previewMail(mine, "veto")); say("mail", got.length);
}

async function watchdog() {
  const t = today(), win = G.datesFrom(t, addDays(t, WATCH - 1));
  say("start", "watchdog", t); say("window", win[0], win[win.length - 1]);
  const have = new Set(readState().puzzles.map((p) => p.date)), gap = win.filter((d) => !have.has(d));
  if (!gap.length) { say("ready"); return; }
  const text = "These days in the next 14 have no Daily Puzzle yet:\n\n" + gap.map((d) => nice(d) + " (" + d + ")").join("\n")
    + "\n\nPlayers see a puzzle from the archive on those days meanwhile. To fill them now, run the weekly job:\n" + actionsUrl("daily-weekly.yml") + "\n";
  await sendMail({ subject: "Daily Puzzle watchdog — " + gap.length + (gap.length === 1 ? " day" : " days") + " without a puzzle", text, html: "<pre style=\"font-family:Georgia,serif;white-space:pre-wrap\">" + esc(text) + "</pre>" });
  say("gap", gap.length);
}

async function alert() {
  const what = (arg("--what") || "").replace(/[^a-z]/g, "") || "daily";
  const run = process.env.GITHUB_RUN_ID ? (process.env.GITHUB_SERVER_URL || "https://github.com") + "/" + repoSlug() + "/actions/runs/" + process.env.GITHUB_RUN_ID : actionsUrl("daily-" + what + ".yml");
  const text = "The Daily Puzzle " + what + " job failed. Nothing was pushed past the point of failure.\nThe run (its log shows only dates, counts and ids): " + run + "\n";
  await sendMail({ subject: "Daily Puzzle — the " + what + " job failed", text, html: "<p>" + esc(text).replace(/\n/g, "<br>") + "</p>" });
  say("alert");
}

const MODES = { weekly, veto, watchdog, alert };
if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (!MODES[mode]) throw new JobError("unknown-mode");
    await MODES[mode]();
  })().catch((e) => { say("fail", e instanceof JobError ? e.code : "unexpected"); process.exitCode = 1; });
}
module.exports = { MSG, blockStart, blockDates, addDays, previewMail, ANCHOR, BLOCK, AHEAD, WATCH, FILES };
