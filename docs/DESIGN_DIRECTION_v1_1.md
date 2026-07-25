# THE THRESHOLD — SITE DESIGN DIRECTION v1.1
# Divya Yuddha companion site (Phase A). v1 authored 2026-07-25;
# v1.1 same day on MASTER ACCEPTANCE: the owner's Gate mockup is
# ACCEPTED AS DESIGN MASTER with the amendments recorded in §13.
# The mockup + this doc are TASK S1's twin authorities; where they
# conflict, the mockup wins on look, this doc wins on law. Rides
# in the repo as docs/DESIGN_DIRECTION_v1_1.md alongside the
# master mockup image (docs/design/gate_master.png).

═══════════════════════════════════════════
## 1. THE CONCEPT, IN ONE BREATH
═══════════════════════════════════════════
The site is not a website that looks like a temple. It is a
NIGHT-DARK TEMPLE GATEWAY that happens to respond to clicks.
The visitor stands outside; lamplight reveals carved stone; the
wallet is how you declare yourself at the gate; the Access NFT
is the rite that admits you; the game lies through the door; the
collection is the treasury hall beyond.

Every interface concept is renamed into the metaphor and the
metaphor is carried by LIGHT, STONE, and GOLD — never by
skeuomorphic clutter. Restraint is the luxury. If a screen feels
empty, it is working: the emptiness is the dark of the gateway,
and the eye goes where the lamp is.

THE ONE LAW: nothing on this site may look like it could appear
on any other website. Every border is carved, every glow is a
flame, every transition is light moving on stone. If a component
would survive being screenshotted into a SaaS landing page, it
is wrong and gets rebuilt.

═══════════════════════════════════════════
## 2. MATERIAL WORLD (what things are "made of")
═══════════════════════════════════════════
Three materials only. Every element must be one of them:

STONE — the world itself. Near-black basalt with the faintest
warm undertone (never blue-black — that is the Naga world, not
the gate). Carries texture: a barely-perceptible grain, visible
only where lamplight pools. Backgrounds, grounds, the void.

GOLD — the worked metal. Everything man-made and precious:
borders, thresholds, type, icons, the crest. Gold is CHROME
(the grounds-not-chrome law, ported): it outlines and crowns,
it never floods. Two finishes: burnished (bright, for the lit)
and aged (dark umber-gold, for the unlit — gold in shadow is
still gold, just asleep).

FLAME — the only light source and the only animation license.
Warm, slightly orange, alive. Everything visible is visible
because a lamp burns near it. No white light exists anywhere on
this site. No pure #FFFFFF, ever.

Forbidden materials: glass (no blur-panels, no frosted cards),
plastic (no flat bright fills), paper EXCEPT one sanctioned use
(the text-panel cream inherited from the card frames, used only
for reading surfaces — the same parchment the cards print
mechanics on).

═══════════════════════════════════════════
## 3. PALETTE TOKENS (the named set — mockup and build both)
═══════════════════════════════════════════
--stone-void      #0B0A08   the deep ground; page background
--stone-lit       #1A1611   stone inside a lamp pool
--stone-relief    #241E15   carved edges catching light
--gold-burnished  #D9A84E   lit gold: active borders, headings
--gold-aged       #6B5426   sleeping gold: inactive chrome
--gold-hairline   #8A6F3A   1px rules, carved seams
--flame-core      #FFC96B   lamp centers, focus states
--flame-halo      #E8933A   the warm falloff around any light
--parchment       #E9DCC2   reading panels ONLY (card lineage)
--ink             #2A2116   text on parchment
--jade            #1F5C46   Vanara chamber accent
--ember           #8E2F1B   Asura chamber accent + Mythic notes
--abyss           #14273D   Naga chamber accent
--duskgold        #B4762B   Deva chamber accent
--vermilion       #B33A1F   ONE ritual use only (see §8 Claim)

Faction accents appear ONLY in the Collection hall and faction-
specific moments — the gateway itself is stone/gold/flame,
faction-neutral, exactly like the game's landing.

Contrast law: body text on stone uses --gold-burnished or
--parchment tints, never gray. Gray does not exist in a world
lit by fire.

═══════════════════════════════════════════
## 4. TYPOGRAPHY (the card lineage, enforced)
═══════════════════════════════════════════
DISPLAY — carved small-caps serif in the register of the card
name-plates (the RAMA'S SIGNET plate is the reference artifact).
Web: Cinzel (Google Fonts) — Trajan-class, reads as chiseled.
Usage: page title, section thresholds, all "rite" language.
Always letterspaced (+0.08em to +0.14em), always small-caps or
caps, never bold-weight above 600 (carving is precise, not fat).

TEXT — a humanist old-style serif for prose: EB Garamond.
On parchment panels it mimics the card mechanics text; on stone
it runs in gold tints, kept short (this site says little).

EPITHET STYLE — every heading may carry a sub-line in the card
epithet register: smaller, wider-tracked small caps under the
display line. Example:
        THE  GATE
    OWN THE CARDS. THE GAME STAYS FREE.

FORBIDDEN: Inter, Roboto, Helvetica, system-ui as a visible
face, any geometric sans, any rounded sans. If a sans is ever
truly needed (it should not be), it does not ship without an
owner word.

Numerals: old-style figures where Garamond provides them.

═══════════════════════════════════════════
## 5. THE LIGHT SYSTEM (the site's one interaction signature)
═══════════════════════════════════════════
This is the centerpiece — the thing no template has.

THE STANDING LAMPS: each screen has 2-4 fixed "lamp" points —
radial warm gradients (--flame-core → --flame-halo → transparent
over ~600px) that illuminate their region of stone. Content
inside a pool is fully lit; content outside sits at ~35%
luminance with gold gone --gold-aged. The page is therefore
readable but DIRECTED: the lamps say where to look.

THE CARRIED LAMP (desktop): a subtle additional pool, ~340px,
follows the cursor at 60% the intensity of standing lamps —
the visitor carries a small flame through the dark. It reveals
texture and wakes aged gold to burnished as it passes. It must
be SUBTLE: discovered, not announced. Performance law: pure
CSS radial-gradient repositioned via transform on a single
overlay node; no canvas, no shaders, no per-frame layout.

THE SCROLL DAWN (mobile, no cursor): standing lamps brighten
section-by-section as each threshold crosses mid-viewport —
walking deeper, lamps lighting ahead of you.

FLAME LIFE: all lamp pools breathe — a 4-6s luminance sine of
±4%, desynchronized per lamp. Barely visible. This is the only
ambient animation on the site.

REDUCED MOTION: prefers-reduced-motion = all lamps at full,
static, no breathing, no carried lamp, no scroll dawn. The
site becomes a fully-lit hall — dignified, complete, equal.

═══════════════════════════════════════════
## 6. CARVED ANATOMY (layout language)
═══════════════════════════════════════════
NO CARDS-IN-CARDS. NO PANELS. NO DROP SHADOWS AS DEPTH.
Structure is expressed as THRESHOLDS: a section begins with a
carved lintel — a horizontal composition of hairline gold rules
with a center ornament (diamond gem-mark in the card-frame
divider register) and the section's display title carved into
it. Content then sits directly on stone beneath its lintel.

Borders, where truly needed (the parchment reading panel, the
collection plinths), are the card-frame corner language:
leaf-sprig / coil-fan gold corners + hairline edges — drawn
once as SVG, reused, never a CSS border-radius box. Corner
radius on anything: 0-2px. Carving is square.

Ornament budget: ONE ornament concept per screen region.
Restraint law: when in doubt, remove the ornament and add dark.

Spacing: monumental. Section padding ≥ 12vh. The gate is not
crowded; density is for the treasury hall only.

THE CREST: the game's profile crest tradition continues — a
single gold profile mark (proposed: the four-faction sigils
interlocked in one roundel, or simply the Divya Yuddha
title-mark) at the gate's crown. Script veto applies to all
ornament: geometry, flora, flame, and scale motifs only;
nothing character-like, no pseudo-Devanagari, anywhere.

═══════════════════════════════════════════
## 7. VOICE (the words are part of the design)
═══════════════════════════════════════════
The site speaks in the flavor-line register: short, declarative,
mythic-plain. Never marketing-speak, never crypto-speak.
- Not "Connect Wallet" → "DECLARE YOURSELF" (sub: connect your
  wallet)
- Not "Mint your free NFT" → "TAKE THE RITE" (sub: claim your
  Access token — free, one per hand, yours alone)
- Not "Play Now" → "ENTER" (sub: the door opens for bearers)
- Not "My NFTs" → "THE TREASURY" (sub: your cards, held in your
  name)
- Honesty riders always present in the sub-line: the metaphor
  crowns the words, plain meaning rides beneath. Nobody should
  ever be confused about what a button does.
- The one promise, verbatim, on the gate: "Own the cards. The
  game stays free."

═══════════════════════════════════════════
## 8. SCREEN BY SCREEN (mockup targets)
═══════════════════════════════════════════

### 8.1 THE GATE (landing) — MOCKUP PRIORITY 1
Full-viewport night scene. Structure top to bottom:
- The crest, small, at the crown, lamp-lit.
- The title carved large: DIVYA YUDDHA in display caps,
  --gold-burnished, with the epithet line beneath: BATTLE OF
  THE CELESTIALS.
- Below, the gate itself: a tall carved doorway suggested by
  two vertical gold hairline pillars and a lintel — through
  its opening, pure --stone-void darkness (the game beyond,
  unlit until you may enter).
- Two standing lamps flank the doorway — the screen's light
  sources, visibly "hanging" as small flame roundels.
- The promise line under the doorway: "Own the cards. The game
  stays free." in Garamond gold.
- One action at the threshold: DECLARE YOURSELF (connect).
  The button is not a pill: it is a carved lintel-stone —
  rectangular, hairline gold border, aged gold text that wakes
  to burnished + flame halo on hover (the carried lamp reaching
  it). Sub-line beneath in small Garamond: "connect your
  wallet".
- Scroll cue: a single gem-diamond mark, breathing with the
  lamps.
Below the fold: three short carved-lintel sections — THE RITE
(what the Access token is, three sentences), THE TREASURY (what
ownership means; "money buys ownership, never win-rate" belongs
here in plain words), THE LAW (the honesty block: free game
link, chain, one-per-hand, soulbound — stated plainly on a
parchment reading panel, the site's only parchment above the
treasury).

### 8.2 THE DECLARATION (connect states)
Same gate scene, the doorway now the stage:
- No wallet installed: the lamps dim slightly; a parchment slip
  under the button: "You carry no key. Forge one." linking to
  wallet install — plain sub-text explains MetaMask.
- Wrong network: "You stand at the wrong gate." + one carved
  button: CROSS TO AMOY (network switch/add).
- Connected: the visitor's address appears as a NAMEPLATE —
  a small carved stone at top right: 0x50A5…8df30 in Garamond,
  with a tiny flame dot indicating live connection. Never a
  green circle; a flame.

### 8.3 THE RITE (claim) — MOCKUP PRIORITY 2
The emotional center. The doorway from the Gate, closer now,
filling more of the frame:
- Holder-not-yet: centered above the door hangs the RITE MARK —
  a gold roundel token render (the Access NFT's visual: propose
  the interlocked-faction crest on stone ground). One button on
  the threshold stone: TAKE THE RITE. Sub: "free · one per
  hand · bound to you alone".
- THE ONE VERMILION MOMENT: on claim confirmation, a single
  vermilion thread of light draws itself across the lintel
  (the Signet's devotion-thread, quoted once site-wide), and
  the doorway's darkness begins to glow faintly warm from
  within: the door will now open. This is the site's single
  ceremonial animation; reduced-motion renders the completed
  state instantly.
- Claims-not-yet-open state (Phase-A interim): the button
  sleeps in aged gold: THE RITE OPENS SOON — honest sub-line
  beneath. The mark hangs unlit above.
- Holder: the mark burns steadily above the door; the button
  becomes ENTER.

### 8.4 THE DOOR (play)
Minimal by design: bearer clicks ENTER, the doorway's warm
interior light rises to fill the viewport (a light-wipe, not a
page-flip; ~600ms; reduced-motion: cut), and the gated game
copy loads within. The site chrome falls away entirely — the
game owns the screen; a single small gold gem-mark top-left
returns to the gate.

### 8.5 THE TREASURY (collection) — MOCKUP PRIORITY 3
The one dense screen — a treasury hall:
- Carved lintel: THE TREASURY + the address nameplate.
- Cards stand on PLINTHS: each owned wave-card NFT rendered as
  its card image on a low carved stone plinth with a hairline
  gold edge, name + epithet carved beneath in tiny display
  caps. Grid of plinths, generous dark between them; standing
  lamps at hall-ends, so plinths nearer lamps sit brighter
  (rows feel PLACED in a hall, not listed).
- Faction chambers: an optional filter row as four small
  ground-color gem-marks (jade/ember/abyss/duskgold roundels —
  grounds-not-chrome, literally); selecting one warms the
  hall's ambient toward that ground.
- Empty state: a single empty plinth, lamp-lit, with carved
  text: "The hall awaits its first card." + sub-line linking
  the marketplace-to-come (aged gold, sleeping).
- Every plinth links its token on amoy.polygonscan (sub-text:
  "view on chain") — honesty rider.

═══════════════════════════════════════════
## 9. MOTION BUDGET (total, site-wide)
═══════════════════════════════════════════
1. Lamp breathing (ambient, ±4%).
2. Carried lamp / scroll dawn (navigation light).
3. Aged→burnished gold wake on hover/focus (150ms).
4. The vermilion rite-thread (once, on claim).
5. The door light-wipe (once, on enter).
NOTHING ELSE MOVES. No parallax layers, no scroll-jacking, no
floating particles, no marquees, no skeleton shimmer. Loading
states are a flame that simply breathes a little deeper.
All five honor prefers-reduced-motion as specified in §5/§8.

═══════════════════════════════════════════
## 10. THE VETO LIST (instant-reject at audit)
═══════════════════════════════════════════
- Glassmorphism, blur panels, frosted anything
- Purple/cyan, any neon, any gradient not flame-warm
- Rounded-corner cards, pill buttons, floating 3D card heroes
- Pure #FFF or #000; gray text; drop-shadow depth
- Inter/Roboto/geometric sans anywhere visible
- Emoji, icon-font metaphors (hamburgers excepted if carved)
- Confetti, toasts sliding in, skeleton loaders
- Crypto-brand visual clichés: hexagons, circuit lines, coin
  spins, rocket/moon language
- Any script-like ornament (the veto, ported at full strength)
- Any element that would survive in a SaaS template

═══════════════════════════════════════════
## 11. MOCKUP GUIDANCE (your generation session)
═══════════════════════════════════════════
Mock three frames, desktop 1440×900, in priority order:
1. THE GATE (8.1) — this is the master: it locks stone texture,
   lamp behavior, gold register, type scale, and the doorway.
   Audit criteria on arrival: squint test (gold reads as chrome
   on dark, lamps read as the only light), type reads carved
   not printed, doorway darkness feels like depth not empty
   div.
2. THE RITE (8.3) in holder-not-yet state, with the rite mark
   and the sleeping vs woken button both visible if you like
   (two variants welcome).
3. THE TREASURY (8.5) with 6-8 real card frames from the
   accepted Vanara run on plinths — the run's frames are the
   plates this museum was built for.
Optional MJ seed for texture/mood boards (not for UI):
"ancient basalt temple gateway at night, carved stone doorway,
two hanging oil lamps, warm firelight pools on dark stone,
gold leaf inlay details, monumental darkness, no text,
cinematic, photoreal" — use for material reference; the UI
itself is better mocked in Canva/Figma over a dark ground with
the real card assets and Cinzel/EB Garamond.
Mode-check remains step zero at intake; the accepted Gate
mockup locks the run, Hanuman-precedent.

═══════════════════════════════════════════
## 12. RULED AT MASTER ACCEPTANCE (2026-07-25)
═══════════════════════════════════════════
- Voice lines (§7): RULED AS WRITTEN (the mockup carries them).
- Vermilion moment (§8.3): STANDS (the mockup's red banner is
  banner-cloth, not the rite thread; the thread stays reserved
  for the claim ceremony).
- Crest: the mockup's sun-roundel title-mark IS the crest —
  ruled by the master. The interlocked-faction roundel concept
  is retired for the gateway; the four faction sigils live in
  the landing band (§13.C).
- Mockup acceptance = design authority: LOCKED.

═══════════════════════════════════════════
## 13. v1.1 AMENDMENTS — THE MASTER'S DEVIATIONS, RATIFIED
═══════════════════════════════════════════
A. THE VISIBLE WAR: the doorway is not void — through the gate
   the war's world is visible (distant lit temple-city under a
   storm sky). The meaning amends to: the war is visible to
   all; the DOOR opens only for bearers. §8.1 and §8.4 read
   accordingly (the enter light-wipe now rises from the
   already-glowing horizon).
B. NAV LAW: navigation ships only what exists. Phase A nav:
   THE GATE · THE RITE · THE TREASURY · THE FREE GAME (external
   link to the Pages game). The master's six labels (LORE,
   FACTIONS, GAMEPLAY, CARDS, ROADMAP) may return as anchors
   into landing sections or as later phases — no dead links at
   the temple, ever.
C. FACTION BAND: the four-faction "FOUR FACTIONS. FOUR
   DESTINIES." band is RATIFIED for the landing — the accent
   law amends to: faction grounds may appear in the landing
   band and the Treasury; all other gateway chrome stays
   stone/gold/flame neutral. The band's four sigil panels use
   grounds-not-chrome literally (duskgold/ember/jade/abyss
   grounds, gold sigils). EXPLORE buttons on the band anchor to
   faction lore sections when those exist; until then the band
   is presentational (no dead buttons — they ship disabled-
   sleeping in aged gold or not at all, CC's STEP-0 call).
D. FACADE REGISTER: the Gate's density is ratified as the
   FACADE register; inner surfaces (Rite, Treasury) step down
   toward §6's monumental restraint so the claim lands in
   relative quiet. Density gradient is law: loudest at the
   facade, quietest at the rite.
E. BUTTON HIERARCHY: metaphor over plain everywhere (the
   master's top-right button inverts this — build corrects it:
   CONNECT WALLET sub-line under DECLARE YOURSELF).
F. STATUES + RELIEFS: the master's guardian statues and carved
   reliefs are ratified as facade art. Script veto held at
   audit and continues to apply to any new facade art.

═══════════════════════════════════════════
## 14. REMAINING OPEN WORDS (carried, non-blocking for S1)
═══════════════════════════════════════════
1. EMAIL CAPTURE ("JOIN THE SAGA"): keep (requires a list
   provider scoped in S1 — wallet-is-identity is unaffected;
   an email list is marketing surface, not an account) or cut
   for Phase A. S1 builds the section either way; the form
   ships dormant until ruled.
2. SOCIAL CHANNELS: only channels that exist ship. Owner to
   name the live set; unnamed icons are cut at build.
3. THE RITE MARK (Access NFT visual + metadata image, one
   asset two duties): still to generate — direction stands
   (crest on stone ground, card-frame corner language, no
   rarity rung). Needed before the claim flow's visual is
   final; not needed for S1 scaffolding.
