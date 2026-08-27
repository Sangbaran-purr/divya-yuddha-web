# LOBBY_DESIGN_v1 - The Hall (Staked DYC Boards, dressed lobby)
# Status: SEALED - owner "Ok" 2026-08-26. This is the build authority
# for the dressed-lobby task cluster L1-L4 (M-P7 era). Composition
# spec: no new visual language is invented - every element composes
# EXISTING site idioms (owner-ruled 2026-08-25: no mockup needed).
# Amendments dated, never silent. Authority above this doc:
# MULTIPLAYER_DESIGN.md v1.1 (the covenant rulings, A1-A8). Any
# conflict = that doc wins.
# Transcription record 2026-08-27 (in-repo copy, committed with
# S-HALL-L1): status stamped SEALED; the cross-reference in 2c
# corrected from "section 9" to "section 10" (where the sprite marks
# live); the arrows of the sealed source rendered as words for the
# heredoc law. Meaning unchanged; nothing else amended.

=====================================================
## 0. WHAT THIS ROOM IS
=====================================================
The Hall is the storefront of the money platform - the room where
a player decides to lock real DYC on their own skill. It must
read as the same temple as the treasury and the store (aged-gold
on near-black, hairline gold borders, Cinzel display / Spectral
body, the lotus watermark) but with the charge of stakes in the
air. Design intent in one line: a 10-DYC table should feel like
sitting down at a carved board in Kshetra, not clicking a button
on a dashboard.

Phone portrait is the PRIMARY canvas. Every screen below is
specified phone-first; the wide dress is the same composition
with room to breathe (grid columns where phone stacks).

House idioms this spec composes (the palette of parts):
- .state-line quiet text (treasury closing-line precedent)
- store listing cards (name / price / action - the plaque's
  ancestor)
- store faction chips (the filter row - the tier rail's ancestor)
- admin review-then-confirm pattern (every money act)
- P2P send panel (validate, then confirm, then act; reveal-state
  form)
- ornament.js sprite symbols (social-glyph road - new medallions
  ride the same sprite)
- dashboard card panels (balance strips, banners)
- the house nav + chip (the Hall joins the nav like the dashboard
  did)
- persistPending / resumePendingTx wallet road (store buy
  precedent - every cast in the Hall uses it)

=====================================================
## 1. THE DOOR AND THE GATE
=====================================================
- Entry: the Hall is a gated-game-side room. Reached from inside
  the game area (the gated copy's chrome) and joins the house
  nav. Never linked in the public footer.
- The Access gate: no TORANA, no Hall. The gate screen reuses the
  rite's existing language ("the door is free; what lies beyond
  is earned") with a door to the claim rite.
- Wallet: the Hall inherits the site's patient provider detection
  (3s, EIP-6963) and the connected-wallet identity. No wallet =
  a quiet connect card, same idiom as treasury/store.

=====================================================
## 2. SCREEN 1 - THE HALL (main view)
=====================================================
Answers three questions in one glance: what tables exist, where
do I belong, what does it cost.

LAYOUT (phone, top to bottom):
a. HEADER STRIP (dashboard card idiom): Liquid balance (what you
   can actually stake) + the loss-limit presence - if set:
   "today: X of Y DYC remaining"; if unset: a quiet one-line
   invitation ("set a daily limit") opening Screen 8. This strip
   is a whitepaper promise made visible; it lives in the room,
   never buried in settings.
b. THE COVENANT LINE (.state-line idiom, centered, small caps):
   "EVERY SEAT HERE IS HUMAN." The room states the promise the
   whitepaper makes. One line, always present.
c. THE SIX-DOOR TIER RAIL (faction-chip idiom, horizontally
   scrollable on phone): FREE - BRONZE 10 - SILVER 50 - GOLD 200
   - DIAMOND 1000 - FRIEND. Each chip: the tier medallion (new
   ornament-sprite symbols, see section 10), the DYC stake, the
   approx dollar (whitepaper pairing: 10 = $0.10 ... 1000 = $10;
   FREE shows "no stake"), and a live count of open seats in that
   tier. Selected chip filters the floor below (ALL default).
   FREE is a first-class door, not an afterthought (A7: Table 0
   opens with the hall; it retires later on the owner word - the
   rail is built so removing a door is a config change, not a
   redesign).
d. THE FLOOR: the open tables of the selected tier(s), as plaques
   (Screen 2), newest last, YOUR table (if any) pinned first. A
   tier with no open seats shows its quiet empty state ("no open
   seats at this tier - open one") - never a blank.
e. TWO STANDING DOORS (always visible, regardless of how full):
   OPEN A TABLE (primary act, gold-filled button idiom) and
   FRIEND CHALLENGE (secondary, outline idiom). These are
   fixtures of the hall, not fallbacks.

WIDE: header + covenant full-width; the rail becomes a fixed row;
the floor becomes a 2-3 column plaque grid; the standing doors
right-align in the header region.

=====================================================
## 3. SCREEN 2 - THE PLAQUE (one open table)
=====================================================
The repeated unit; the store listing card is the ancestor.
- Tier medallion + stake ("50 DYC - ~$0.50"; FREE: "Free table").
- The opener: shortened address (0xE43A...DEab) + their chosen
  faction sigil (the four faction marks already exist in the
  house art; the sigil gives the plaque life with no profile
  system).
- Patience line: "open 4 min" (honesty reads as life).
- Action: TAKE THIS SEAT (leads to Screen 5).
- YOUR-TABLE VARIANT (pinned first, gold-edged like the store's
  "(you)" convention): "your stake is locked in escrow - waiting
  for an opponent" + two actions: CANCEL TABLE (full refund road
  - cancelMatch, review-confirm) and SHARE AS CODE (surfaces the
  table id as a friend-code chip, copy-chip idiom).
- Staked plaques carry the escrow mark (a small lock glyph) -
  the visible difference between a promise and locked money.

=====================================================
## 4. SCREEN 3 - THE EMPTY ROOM (covenant state)
=====================================================
Zero open tables anywhere. Designed as a promise kept, not a
failure.
- Centerpiece: the Kshetra board at rest with a lit lamp (an
  existing board/story render crop - no new art).
- The truth line (.state-line): "No one is seated right now -
  because every opponent here is a real person."
- Three generous doors, ruled order: CHALLENGE A FRIEND (Screen
  6) - PRACTICE FREE VS AI (opens the normal AI game; the label
  says plainly "practice - no stakes, AI opponent") - OPEN A
  TABLE AND WAIT (opens Screen 4; the plaque then pins with its
  waiting state). Notify-on-sit is NOT in v1 (no push
  infrastructure; revisit as polish).

=====================================================
## 5. SCREEN 4 - OPEN A TABLE (the flow)
=====================================================
P2P-send-panel idiom: reveal-form, then validate, then confirm,
then act.
- Tier picker: the six doors as rows; each row stake + approx $ +
  the player's balance judged against it (unaffordable tiers
  visible but dimmed with "insufficient liquid DYC" - never
  hidden). FREE row shows "no stake - human opponent".
- Faction picker: the four sigils (store chip idiom).
- THE COMMITMENT TEXT (plain-language block, .state-line body -
  verbatim copy ruled here):
  "Your [50] DYC locks in escrow now. It returns in full if you
  cancel before anyone sits, or on a draw. The winner takes the
  pot minus the 5% platform fee. If a finished match is somehow
  never settled, the chain refunds both players automatically
  after 24 hours - locked stakes can never be stranded."
- Loss-limit gate: if this stake would cross remaining headroom,
  the kind block (Screen 8 wording), firm and unshaming.
- The act: staked tables run the two-step wallet ceremony
  surfaced honestly as two steps ("1. approve DYC - 2. lock
  stake"), persistPending at each hash, resume on refresh (store
  buy precedent). FREE is one tap, table opens.
- After: return to the Hall with your plaque pinned, waiting.

=====================================================
## 6. SCREEN 5 - TAKE A SEAT (accepting)
=====================================================
Review-confirm idiom (admin precedent):
- The sheet: opponent (address + faction sigil), tier, stake,
  YOUR faction picker, the same commitment text, and the one
  fact that matters, bold in the house voice: "Once both stakes
  lock, the match begins."
- Same loss-limit gate as Screen 4.
- The act: approve + join (two-step ceremony as above; FREE =
  one tap). On lock, the bridge moment (Screen 7a).

=====================================================
## 7. SCREEN 6 - FRIEND CHALLENGE (the private road)
=====================================================
- CREATE: negotiated stake, free input 10-10,000 DYC (validated
  to the contract bounds), expected-opponent address field
  (paste; the lock means ONLY they can sit), faction picker, the
  commitment text, the act. Produces the TABLE CODE presented as
  a sealed-scroll chip (copy-chip idiom + the house ornament) -
  "private table - visible only by this code, and only
  [0xFRIEND...] can take the seat."
- JOIN: enter a code; the sheet shows the friend's terms (their
  address, sigil, the negotiated stake); "you sign your half
  of the pot"; approve + join.
- Friend tables never appear on the floor; the create screen
  says so.

=====================================================
## 8. SCREEN 7 - THE BRIDGE MOMENTS
=====================================================
a. MATCHED: the instant both stakes lock / a free seat fills.
   One beat of ceremony: opponent revealed (address + sigil),
   "the stakes are locked - dealing..." then the battle screen.
   The handshake before the war; two seconds, not a cutscene.
b. IN-MATCH CHROME (the match runs in the existing battle
   dress; the Hall adds only a thin strip): the two clocks
   rendered from server deadlines - the thinking clock (visible
   countdown from 30s remaining; amber at the 90s warn) and, on
   an opponent vanish, "opponent reconnecting... 90s" with the
   countdown. Your own vanish shows the same to them; on your
   return, "resuming" while the mirror replays.
c. SETTLEMENT STRIP (match over; wire.html's strip, dressed):
   three variants in the house voice -
   WON: "You won. Collect [95] DYC - [5] to the treasury." with
   the CAST SETTLE act (winner casts from their own wallet, A5;
   persistPending; the strip resolves to "settled - [95] DYC in
   your wallet" on the terminal read).
   DRAW: "A draw - both stakes return in full." (either seat may
   cast; same act.)
   FORFEIT (survivor): "Your opponent left the table. The pot is
   yours - collect [95] DYC." (same act; the forfeit slip rides
   the same road.)
   Every variant carries the quiet abort line: "unclaimed pots
   refund both players automatically after 24 hours."
   FREE matches: the strip is just the result + "no stakes at
   this table" - one line.

=====================================================
## 9. SCREEN 8 - SET YOUR LIMIT (loss-limit sheet)
=====================================================
P2P-send-panel form idiom, opened from the header strip.
- Set / change / remove a daily cap (DYC input).
- The plain text: "Once your net losses today reach this, the
  staked tables close for you until midnight UTC. Free tables
  and friend practice stay open. Only you can set or change
  this."
- The block state (when a stake would cross it), kind and firm:
  "Your daily limit is reached - the staked tables reopen at
  midnight UTC. Remaining headroom today: [X] DYC." Never
  shaming, never a workaround offer.

=====================================================
## 10. NEW SPRITE MARKS (the only new art, ornament.js road)
=====================================================
Six small single-color symbol elements as medallions, matching
the social-glyph weight: dy-tier-free (open lotus bud),
dy-tier-bronze / -silver / -gold / -diamond (the same laurel
medallion with I-IV notches; color carried by CSS tier classes,
never by the glyph), dy-lock-escrow (the small stake lock).
Faction sigils already exist. Rarity-ladder colors are the tier
color language (bronze/silver/gold/diamond map naturally).

=====================================================
## 11. HONESTY TEXT - THE RULED COPY BLOCK
=====================================================
All money-adjacent copy in the Hall comes from THIS spec (verbatim
copy-block law): the covenant line (2b), the commitment text (5),
the both-stakes line (6), the friend-lock line (7), the three
settlement variants + abort line (8c), the limit texts (9). CC
never paraphrases money copy; changes are ruled amendments here.

=====================================================
## 12. WHAT THE HALL NEVER SHOWS
=====================================================
No queue/matchmaking spinner (the lobby IS the matchmaking). No
AI presence inside the Hall (the practice door exits to the
labeled AI game). No chat. No leaderboards (season territory).
No order books/auctions. No opponent balance/history. No
notify-me push (v1). Nothing that implies the house plays.

=====================================================
## 13. BUILD SHAPE (the task cluster this spec governs)
=====================================================
L1 THE SHELL: hall page in the gated area behind the Access
   gate; header strip + covenant line + tier rail + floor +
   standing doors; sprite medallions; nav joined. Reads live
   tables from the match server (M-P1 protocol). Both widths.
L2 THE ACTS: open / take-a-seat / cancel flows wired to the
   M-P4/M-P5 client roads (approve+open, approve+join,
   cancelMatch, persistPending/resume); loss-limit sheet wired
   to the M-P6 ledger words; friend road.
L3 THE BRIDGES: matched moment, in-match clock strip, vanish/
   resume chrome, the dressed settlement strip on the real
   battle screen exit.
L4 THE WALK: owner two-phone ceremony through every door and
   every strip variant at phone width. Device verdict is the
   circulation gate.
Gates riding from MULTIPLAYER_DESIGN v1.1: the A3 redacted view
and the A8 always-on tier remain PRE-OPENING gates independent
of this spec; wire.html stays the dark rig and is never dressed.

=====================================================
## 14. OPEN INPUTS (rule during the pass)
=====================================================
L-N1 The tier rail on phone: horizontal chip scroll (proposed)
     vs a 2x3 door grid above the floor. Rule at L1 device walk.
L-N2 "Open N min" patience line: on (proposed) or off.
L-N3 The FREE door's dollar slot: "no stake" (proposed) vs
     showing "$0.00".
L-N4 Where the Hall's nav entry sits (game chrome + house nav
     chip proposed, mirroring the dashboard's road).

=====================================================
## AMENDMENT 2026-08-27 (v1.1) - THE HALL WEARS THE GAME'S DRESS
=====================================================
Owner-ruled 2026-08-27. Section 0's founding line is amended: the
Hall does NOT compose the website's treasury/store idioms. The Hall,
the lobby and the entire matchmaking flow are the main product; their
UI matches THE GAME, and the game's home and menu screens are the
Hall's ancestor. The bridges (screen 7) sit inside the battle dress
they interrupt. The UI/UX of this room is of extreme importance.
The 2026-08-25 "no mockup needed" ruling is reversed for this room: a
phone-first mockup pass on a design canvas precedes the dress and is
ruled by the owner on a device. Section 13's L1 splits into L1 THE
BONES (function: gate, feed, faces, config, glyphs, layout) and L1b
THE DRESS (the game's chrome on L1's DOM, reskin-in-place, after the
ruled mockups). The ruled copy of section 11 is unchanged. Sections
1-9 remain the FUNCTIONAL spec of every screen; their idiom
references ("store listing card", "faction-chip idiom", "dashboard
card idiom", "P2P-send-panel idiom") are read from v1.1 as the
SHAPE of the element (a repeated card, a filter row, a balance
strip, a reveal-validate-confirm form), not as a visual instruction.
