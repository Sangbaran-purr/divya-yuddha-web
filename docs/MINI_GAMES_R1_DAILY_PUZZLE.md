# MINI-GAMES-1 · R1 — The Daily Puzzle (data, solver, 14 puzzles)

Owner rulings in force: mini games are site pages under `/play/`; free, no Torana; no DYC, money, badges or public
leaderboards — personal streaks and bests only, kept in the browser. Order: Daily Puzzle → Smriti → Chakravyuha
(Matsya-bheda parked). **R1 is data + solver only; R2 (the `/play/` page) waits for the owner's approval of the 14.**

## Files
| File | What it is |
|---|---|
| `play/daily/puzzles.json` | the 14 puzzles, one per day from Monday 2026-10-19 — **no answers in it** |
| `tests/fixtures/daily-answers.sha256.json` | one salted SHA-256 fingerprint per puzzle of the approved winning play — **the only form the answers take in this repo** |
| `scripts/puzzle-answer-digest.js` | the fingerprint: `sha256(salt + "|" + id + "|" + play + "|" + target)` |
| `play/daily/puzzle-core.js` | load · candidates · solve (UMD: `window.DY_PUZZLE` in the browser, `require` in Node) |
| `scripts/puzzle-solve.js` | the offline solver: `node scripts/puzzle-solve.js` (all; names no answer) · `--plays` · `<id>` (every candidate and its score — spoilers) |
| `tests/suites/puzzles.js` | 47 checks, in `node tests/run.js` (no chain, no network) |

## The puzzle format
```
{ id, date:"YYYY-MM-DD", title, difficulty:"easy"|"medium"|"hard", mechanic, realm,
  first: 0|1,                                   who takes the first turn of the setup (0 = you)
  you:  { faction, hand:[names], deck?:[names] },   deck = draw pile, top first (needed for round-2 puzzles)
  them: { faction, hand:[names], deck?:[names] },
  setup:[ { side:"you"|"them", play:"Name", target?:"Name"|"Name#2", pos?:n } | { side, pass:true } ] }
```
A position is **built, not described**: the engine (`game/src/engine.js`, the site's byte-identical copy of the game's
engine) starts a match with these exact hands and realm (`opts.scenario`, mulligan off) and replays the setup through
its own `playCard`/`pass`, each step checked against the engine's own legality. Shields, Venom Tokens, Chaos Surges,
Leaps, realm effects and round transitions therefore arise exactly as in a real match. The coin flip is answered
from `first`; every later random draw comes from a seeded stream.

**The puzzle moment:** the opponent has passed and it is your turn. You make ONE play, then pass, and the engine scores
the round. A play is one card from hand × each legal target × each slot (Units), or Pass. For Vanaras, free Leaps are
folded in: a card counts as winning if it wins with any legal use of your Leaps before and/or after it.

## The solver's law (each a named refusal)
- **exactly one** play wins the round, or `TWO_WINS` / `NO_WIN`; that one play's fingerprint must equal the approved
  fingerprint (a stated answer, where a test passes one, must be that play — `WRONG_ANSWER`, target and slot included);
- **no luck**: the position is rebuilt under 8 seeds and must be identical, and every candidate's score must be
  identical under all 8 (`LUCK`) — e.g. Chaos Surge onto one of two Asura Units is refused;
- `MALFORMED` (shape), `UNKNOWN_CARD` (e.g. the old name "Hanuman" — the hero is **Bali**), `WRONG_FACTION`,
  `NOT_LAUNCH` (Wave-1 cards are out of the pool), `ILLEGAL` (a setup step the engine would refuse, or out of turn),
  `NOT_A_PUZZLE` (the opponent has not passed / it is not your turn).

## The answer key (none in this repo)
Both GitHub repos are PUBLIC and Pages serves the whole site repo (`.nojekyll`; `/tests/` and `/docs/` answer 200 on
divyayuddha.games), so no path here is unserved. The plain answers (with the explanations) live only in the owner's
copy outside both repos. The repo holds one salted fingerprint per puzzle; the suite and the solver find the ONE winning
play themselves, fingerprint it, and compare — so the tests still prove that exactly one play wins, that it wins when
its line is replayed by hand through the engine, and that it is the approved play. The R1 commits were rewritten before
any push so the plain file never appears in history. Honest limit: with a public salt and a handful of legal plays this
hides nothing from someone who runs the solver; it keeps the key out of plain sight and turns any drift red.

## Engine behaviours the explanations must state plainly (measured in this engine copy)
- Yama's 1-power ghosts count toward the round total.
- Karkotaka moves your WHOLE Venom drain from the end of the round to "the moment either player first passes". Played
  after the opponent has passed, that moment is already gone, so that round's drain does not happen at all.
- "ON PLAY" gains are one-time and stay: stealing or removing the card that gave them takes nothing back from the Units
  it already lifted.
- Vanara free Leaps are part of the puzzle: the solver counts a card as winning if it wins with any legal use of your
  Leaps, and one puzzle (2026-10-29) can only be won with one — so the page must offer the Leap.
