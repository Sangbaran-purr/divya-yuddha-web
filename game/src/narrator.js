/* ============================================================================
   GL-1 (GAME-LOG-1) — THE BATTLE-LOG NARRATOR. Pure. One function for every road.

   narrate(batch, names) → lines. The same function narrates the solo engine's stream, the free wire's (the frame runs
   the same engine) and the staked wire's (web3 redactedview.js publicEvents: the SAME eight fields, seat names swapped
   for {p0}/{p1}). A line is { round, kind, side, text } — side is 'me' | 'foe' | 'sys', for GL-3's styling — and every
   text has passed through fixLogGrammar.

   OWNER RULINGS (2026-09-13, standing for all GL rungs):
     R1  round headers only — no turn numbers (none exists, and a derived one would restart on a staked resync)
     R2  the game's real vocabulary: plays, damage, destroys, buffs, shields, Venom, tokens, revives, blocks, wards,
         passes. There are no "attacks" — the mechanic does not exist.
     R3  PvAI and wire (free + staked); story mode is out of scope
     R4  staked resync: the log persists in sessionStorage by matchId (GL-2); an empty store on resume shows the gap
         line — never a silent hole
   PURPOSE: a player analysing a match after losing it. Completeness and truth outrank brevity — every event narrated,
   nothing invented.

   ONE JUDGMENT CALL BEYOND R2's EXAMPLE, measured before it was made: a target is named WITH ITS OWNER when the
   viewer can see whose it is ("Opponent's Karkotaka is destroyed (Gandiva)."). Across 1,600 AI matches in all 16
   pairings, 11.92% of target references (4,849 of 40,674) name a card that stood on BOTH sides at that moment — 4,261
   of them in mirror matches, where "Narada is destroyed (Vajra)." cannot tell a losing player whose Narada it was.
   When the owner is unknown the line is R2's exact shape.

   WHAT THIS FILE IS NOT: no recorder (GL-2 hooks runAction), no page wiring (GL-3), no engine read. It never sees a
   player's name or address — the caller hands it a stream and a card resolver, and it speaks only You / Opponent.
   Engine: 0 lines. Loaded in the browser as window.NARRATOR and in Node via module.exports (the chapters.js shape).
   ========================================================================= */
(function (root) {
'use strict';

// ── THE GRAMMAR — VERBATIM from index.html. src/test_narrator.js extracts both copies and asserts they are
//    byte-identical, so they cannot drift apart before GL-3 points the page at this file.
function _baseVerb(v){
  if(/(?:ss|sh|ch|x|z|o)es$/i.test(v)) return v.slice(0,-2);   // passes→pass · wrenches→wrench · goes→go
  if(/[^aeiou]ies$/i.test(v))          return v.slice(0,-3)+'y'; // carries→carry (safety)
  if(/s$/i.test(v))                    return v.slice(0,-1);    // plays→play · raises→raise · wins→win
  return v;
}
function fixLogGrammar(msg){
  // The subject "You" (2nd person) takes the BASE verb, but the engine interpolates the 3rd-person -s form (built for
  // named subjects). Fix the verb right after a SUBJECT-position "You " (line start, or after the "⚔ " match prefix).
  // 3rd-person subjects (Opponent / card names) and mid-sentence "You" (e.g. the "… — You 21 vs …" score line) are untouched.
  return msg.replace(/(^|⚔ )You ([A-Za-z]+)/, (m, pre, verb)=> pre+'You '+_baseVerb(verb));
}

var GAP_TEXT = '… the match resumed here …';   // R4 — the visible mark where a staked resync left history behind
var FORFEIT_WON = 'Your opponent left the table.';      // GAME-LOG-1 ruling, word for word
var FORFEIT_LOST = 'You left the table.';               // the same fact from the seat that left (the ruling named the winner's view)
var UNSEEN = 'an unseen card';                          // a card in a zone this viewer cannot see — never a raw uid, never a leak
var APOS = '’';                                    // the engine's own apostrophe ("Opponent’s Units")
var EVENT_TYPES = ['play', 'damage', 'destroy', 'buff', 'shield', 'venom', 'token', 'revive', 'block', 'ward', 'passive', 'toast'];

function who(seat, me) { return seat === me ? 'You' : 'Opponent'; }
function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function endStop(s) { return /[.!?…]$/.test(s) ? s : s + '.'; }
function list(parts) { return parts.length <= 1 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]; }

// THE STREAM'S SEAT NAMES → THE VIEWER'S WORDS, in ONE pass. A stream names its seats with {p0}/{p1} tokens (the staked
// road) or with the seat-absolute names it was played under (names.players — the solo engine's ['You','Opponent']).
// A sequential swap would turn 'You'→'Opponent'→'You'; one regex cannot. No lookbehind (older mobile Safari lacks it):
// the character before a real name is captured and put back.
function seatWords(names) {
  var real = [];
  if (names.players) [0, 1].forEach(function (s) { if (names.players[s]) real.push([String(names.players[s]), s]); });
  real.sort(function (a, b) { return b[0].length - a[0].length; });   // the longer first, so neither eats the other
  var seatOf = {};
  real.forEach(function (r) { seatOf[r[0]] = r[1]; });
  var alt = real.map(function (r) { return reEsc(r[0]); }).join('|');
  var re = new RegExp('\\{p([01])\\}' + (alt ? '|(^|[^A-Za-z0-9])(' + alt + ')(?![A-Za-z0-9])' : ''), 'g');
  return {
    map: function (t) {
      return String(t).replace(re, function (m, tok, pre, name) {
        if (tok != null) return who(Number(tok), names.me);
        return pre + who(seatOf[name], names.me);
      });
    },
    seatOf: function (w) {
      var mt = /^\{p([01])\}$/.exec(w);
      if (mt) return Number(mt[1]);
      return Object.prototype.hasOwnProperty.call(seatOf, w) ? seatOf[w] : null;
    }
  };
}
function possessive(s) { return s.replace(/\bYou[’']s\b/g, 'your'); }   // the engine writes "You’s Units"

// ── cards, named by what the viewer can see ──
function ref(uid, names) {
  if (uid == null || !names.card) return null;
  var c = names.card(uid);
  if (!c || c.n == null) return null;
  return { n: String(c.n), seat: (c.seat === 0 || c.seat === 1) ? c.seat : null };
}
function ownerWord(seat, me) { return seat === me ? 'your ' : 'Opponent' + APOS + 's '; }
function owned(r, me) { return r ? (r.seat == null ? r.n : ownerWord(r.seat, me) + r.n) : UNSEEN; }
function group(refs, me) {
  if (!refs.length) return UNSEEN;
  var s0 = refs[0] && refs[0].seat;
  var same = refs.every(function (r) { return r && r.seat != null && r.seat === s0; });
  if (same) return ownerWord(s0, me) + list(refs.map(function (r) { return r.n; }));   // "your Dwivida and Neela"
  return list(refs.map(function (r) { return owned(r, me); }));
}
function nameFromText(t, suffix) {   // 'Karkotaka destroyed' → 'Karkotaka' — public stream text, used when the resolver cannot see the uid
  if (typeof t !== 'string') return null;
  var i = t.lastIndexOf(suffix);
  return (i > 0 && i + suffix.length === t.length) ? t.slice(0, i) : null;
}
function sideOf(refs, me) {
  for (var i = 0; i < refs.length; i++) if (refs[i] && refs[i].seat != null) return refs[i].seat === me ? 'me' : 'foe';
  return 'sys';
}

// ── ONE RECORD → its line(s). Events (the 12 engine types) plus the records the stream does not carry: a pass (no
//    event on any road), a round that ended, the result, a forfeit, and the resync gap. ──
function linesFor(rec, names, sw) {
  var me = names.me, k = rec.kind || rec.type, ab = rec.abilityName != null ? String(rec.abilityName) : null;
  var t = rec.text == null ? null : possessive(sw.map(rec.text));
  var tail = ab ? ' (' + ab + ')' : '';
  var tg = rec.targetUids || [], refs = tg.map(function (u) { return ref(u, names); });
  var plural = tg.length > 1, side = 'sys', text = null, fallback = false, extra = null;
  var subj = function () { return cap(group(refs, me)); };

  switch (k) {
    case 'play': {
      var mt = /^(.+?) plays /.exec(rec.text == null ? '' : String(rec.text));
      var seat = mt ? sw.seatOf(mt[1]) : null;
      var sr = ref(rec.sourceUid, names);
      if (seat == null && sr) seat = sr.seat;
      var card = ab || (sr && sr.n) || UNSEEN;
      text = (seat == null ? 'A card is played: ' + card : who(seat, me) + ' plays ' + card) + '.';
      side = seat == null ? 'sys' : (seat === me ? 'me' : 'foe');
      break;
    }
    case 'shield': {
      if (tg.length === 1 && !refs[0]) { var ns = nameFromText(rec.text, ' shielded'); if (ns) refs = [{ n: ns, seat: null }]; }
      text = subj() + ' is shielded' + tail + '.'; side = sideOf(refs, me); break;
    }
    case 'damage': {
      var a = rec.amount == null ? null : Math.abs(Number(rec.amount));
      text = subj() + (a == null ? ' is damaged' : a ? ' takes ' + a + ' damage' : ' takes no damage') + tail + '.';
      side = sideOf(refs, me); break;
    }
    case 'destroy': {
      if (tg.length === 1 && !refs[0]) { var nd = nameFromText(rec.text, ' destroyed'); if (nd) refs = [{ n: nd, seat: null }]; }
      text = subj() + ' is destroyed' + tail + '.'; side = sideOf(refs, me); break;
    }
    case 'buff': {
      var vb = function (one, many) { return plural ? many : one; };
      if (rec.amount == null) text = subj() + ' ' + (t || vb('is strengthened', 'are strengthened')) + tail + '.';   // Leap: "copies Neela"
      else {
        var b = Number(rec.amount);
        text = subj() + ' ' + (b > 0 ? vb('gains', 'gain') + ' +' + b : b < 0 ? vb('loses', 'lose') + ' ' + Math.abs(b) : vb('gains', 'gain') + ' nothing') + tail + '.';
      }
      side = sideOf(refs, me); break;
    }
    case 'toast': {   // a banner: "Chaos Surge!", "Leap!", "Venom drains your Units −3"
      text = endStop(cap(t || ab || k)); break;
    }
    case 'passive': {
      if (tg.length) { text = subj() + (plural ? ' are ' : ' is ') + (t || 'affected') + tail + '.'; side = sideOf(refs, me); }
      else {
        var sp = ref(rec.sourceUid, names);
        var body = (sp && t && t.indexOf(sp.n) === 0) ? owned(sp, me) + t.slice(sp.n.length) : (t || ab || k);
        text = endStop(cap(body) + (t && ab ? tail : ''));
        side = sp && sp.seat != null ? (sp.seat === me ? 'me' : 'foe') : 'sys';
      }
      break;
    }
    case 'venom': {
      var v = rec.amount == null ? null : Math.abs(Number(rec.amount));
      var vt = ab && ab !== 'Venom' ? tail : '';
      text = subj() + (v == null ? (plural ? ' suffer Venom' : ' suffers Venom') : v ? (plural ? ' lose ' : ' loses ') + v + ' to Venom' : (plural ? ' lose' : ' loses') + ' nothing to Venom') + vt + '.';
      side = sideOf(refs, me); break;
    }
    case 'token': {
      var what = t && t !== 'Venom Token' ? t : 'a Venom Token';
      text = subj() + (plural ? ' receive ' : ' receives ') + what + tail + '.'; side = sideOf(refs, me); break;
    }
    case 'revive': case 'ward': {   // the text names the card: "Narada revives at 1", "Nala survives at 1"
      var rw = refs[0] || null, tw = t || (k === 'revive' ? 'revives' : 'survives');
      var bw = (rw && tw.indexOf(rw.n) === 0) ? owned(rw, me) + tw.slice(rw.n.length) : rw ? owned(rw, me) + ' ' + tw : tw;
      text = endStop(cap(bw) + tail); side = sideOf(refs, me); break;
    }
    case 'block': {   // "Hiranyakashipu floors at 1" · "Hiranyakashipu immune" · "held at 1"
      var rb = refs[0] || null, tb = t || 'is protected', bb;
      if (rb && tb.indexOf(rb.n) === 0) { var rest = tb.slice(rb.n.length); if (rest === ' immune') rest = ' is immune'; bb = owned(rb, me) + rest; }
      else if (rb) bb = owned(rb, me) + ' is ' + tb;
      else bb = tb;
      text = endStop(cap(bb) + tail); side = sideOf(refs, me); break;
    }
    case 'pass': {
      text = who(rec.seat, me) + ' passes.'; side = rec.seat === me ? 'me' : 'foe'; break;
    }
    case 'roundEnd': {
      var mine = me === 0 ? rec.t0 : rec.t1, theirs = me === 0 ? rec.t1 : rec.t0;
      text = 'Round ' + rec.round + ' ends — You ' + mine + ' vs Opponent ' + theirs + '.';
      extra = (rec.winner === 0 || rec.winner === 1) ? who(rec.winner, me) + ' wins Round ' + rec.round + '.' : 'Round ' + rec.round + ' is a draw.';
      break;
    }
    case 'result': {
      text = (rec.winner === 0 || rec.winner === 1) ? '⚔ ' + who(rec.winner, me) + ' WINS THE MATCH' : 'The match is a stalemate.';
      break;
    }
    case 'forfeit': {
      text = rec.winner === me ? FORFEIT_WON : rec.winner === 1 - me ? FORFEIT_LOST : 'A seat left the table.';
      break;
    }
    case 'gap': { text = GAP_TEXT; break; }
    default: {   // a type this narrator has never seen: still narrated, still true, flagged so a suite can find it
      text = endStop(cap((ab ? ab + ': ' : '') + (t || String(k)))); fallback = true;
    }
  }

  var out = [text].concat(extra ? [extra] : []).map(function (x) {
    var l = { round: rec.round == null ? null : rec.round, kind: k, side: side, text: fixLogGrammar(x) };
    if (l.text.indexOf(UNSEEN) >= 0) l.unseen = true;
    if (fallback) l.fallback = true;
    return l;
  });
  return out;
}

function narrate(batch, names) {
  names = names || {};
  var nm = { me: names.me === 1 ? 1 : 0, players: names.players || null, card: typeof names.card === 'function' ? names.card : null };
  var sw = seatWords(nm), out = [];
  (batch || []).forEach(function (rec) { if (rec) linesFor(rec, nm, sw).forEach(function (l) { out.push(l); }); });
  return out;
}

// ── THE ORDER WITHIN ONE ACTION — GL-2 calls this; it is defined here so the line set's order is proven with it. A pass
//    comes first, then the action's events, then any round that ended, then the result or the forfeit; records are kept
//    in round order within that. Measured: 0 of 50,074 AI actions carry events from two rounds, so today this is the
//    plain order — and it stays correct if that ever changes.
function assemble(parts) {
  parts = parts || {};
  var seq = [];
  (parts.passes || []).forEach(function (p) { seq.push([p.round, 0, { kind: 'pass', round: p.round, seat: p.seat }]); });
  (parts.events || []).forEach(function (e) { seq.push([e.round, 1, e]); });
  (parts.roundEnds || []).forEach(function (h) { seq.push([h.round, 2, { kind: 'roundEnd', round: h.round, t0: h.t0, t1: h.t1, winner: h.winner }]); });
  var idx = seq.map(function (x, i) { return [x[0] == null ? Infinity : x[0], x[1], i, x[2]]; });
  idx.sort(function (a, b) { return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]); });
  var recs = idx.map(function (x) { return x[3]; });
  if (parts.result) recs.push({ kind: 'result', round: parts.result.round, winner: parts.result.winner });
  if (parts.forfeit) recs.push({ kind: 'forfeit', round: parts.forfeit.round, winner: parts.forfeit.winner });
  return recs;
}

// ── R1 — "— Round N —" above the first line of each round. The gap line carries no header of its own. ──
function withRoundHeaders(lines) {
  var out = [], cur;
  (lines || []).forEach(function (l) {
    if (l && l.kind !== 'header' && l.kind !== 'gap' && l.round != null && l.round !== cur) {
      cur = l.round;
      out.push({ round: cur, kind: 'header', side: 'sys', text: '— Round ' + cur + ' —' });
    }
    out.push(l);
  });
  return out;
}

// ── R4 — THE RESUME. A staked resync hands the page a fresh view with no history (events: [], by R5). The recorder
//    (GL-2) keeps the log in sessionStorage by matchId; this decides what the viewer is shown:
//      · nothing restored (empty or unreadable storage)          → the gap line, and the log goes on from there
//      · restored, continuity NOT proven by the caller           → the restored lines, THEN the gap line
//      · restored, and the caller proves nothing was missed      → the restored lines, no gap
//    The middle case is why this is not simply "restore or gap": moves made while the page was away reach no event
//    stream, so a restored log that is not proven continuous has a hole in it — and R4's own law is never a silent hole.
function resume(persisted, opts) {
  opts = opts || {};
  var gap = { round: opts.round == null ? null : opts.round, kind: 'gap', side: 'sys', text: GAP_TEXT };
  if (!Array.isArray(persisted) || !persisted.length) return [gap];
  var restored = persisted.slice();
  return opts.continuous === true ? restored : restored.concat([gap]);
}

var OUT = {
  narrate: narrate, assemble: assemble, withRoundHeaders: withRoundHeaders, resume: resume, fixLogGrammar: fixLogGrammar,
  GAP_TEXT: GAP_TEXT, FORFEIT_WON: FORFEIT_WON, FORFEIT_LOST: FORFEIT_LOST, UNSEEN: UNSEEN, EVENT_TYPES: EVENT_TYPES
};
root.NARRATOR = OUT;
if (typeof module !== 'undefined' && module.exports) module.exports = OUT;
})(typeof window !== 'undefined' ? window : this);
