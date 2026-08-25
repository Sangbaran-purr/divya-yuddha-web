/* ============================================================
   DIVYA YUDDHA — Rules Engine (Devas + Asuras)
   Headless, UI-agnostic. Runs in browser and Node.
   Canonical source; inlined into index.html by src/build.js.
   ============================================================ */
const RARITY_COLOR = { L:'#C9A84C', M:'#E74C3C', E:'#9B59B6', R:'#3498DB', U:'#27AE60', C:'#888888' };
const RARITY_NAME  = { L:'Legendary', M:'Mythic', E:'Epic', R:'Rare', U:'Uncommon', C:'Common' };

const DEVA_DECK_DEF = [
  // ---- HEROES (3) ----
  { id:'indra',   n:'Indra',          sub:'King of Devas',        t:'hero', p:7, r:'L', txt:'PASSIVE: All Deva Units gain +1 power while Indra is on the board.' },
  { id:'agni',    n:'Agni',           sub:'Flame of Sacrifice',   t:'hero', p:5, r:'E', txt:'TRIGGERED: Whenever any Mantra is played, deal 1 damage to a random enemy Unit.' },
  { id:'varuna',  n:'Varuna',         sub:'Lord of Oceans',       t:'hero', p:6, r:'E', txt:'PASSIVE: Opponent cannot play more than 1 Astra per round.' },
  // ---- UNITS (12) ----
  { id:'surya',   n:'Chandra Dev',      sub:'Sovereign of Moonlight', t:'unit', p:6, r:'E', txt:'ON PLAY: All other friendly Units gain +1 power.' },
  { id:'brihaspati',n:'Brihaspati',   sub:'Guru of the Gods',     t:'unit', p:5, r:'E', txt:'ON PLAY: Copy the effect of the last Mantra played by either player.' },
  { id:'vayu',    n:'Vayu',           sub:'The Invisible Force',  t:'unit', p:5, r:'R', txt:'ON PLAY: Hurl the highest power enemy Unit out of formation; it loses 2 power.' },
  { id:'vishwakarma',n:'Vishwakarma', sub:'Divine Architect',     t:'unit', p:4, r:'R', txt:'ON PLAY: Destroy the opponent\u2019s Artifact. Gain +2 power for each Artifact destroyed this game.' },
  { id:'kubera',  n:'Kubera',         sub:'Lord of Wealth',       t:'unit', p:3, r:'R', txt:'ON PLAY: Draw 2 cards. If both are Units they gain +1 power each.' },
  { id:'urvashi', n:'Urvashi',        sub:'The Eternal Apsara',   t:'unit', p:4, r:'R', txt:'ON PLAY: Opponent discards their highest power card from hand.' },
  { id:'yama',    n:'Yama',           sub:'Lord of Dharma',       t:'unit', p:6, r:'E', txt:'PASSIVE: Destroyed friendly Units leave a 1-power ghost token behind.' },
  { id:'saraswati',n:'Narada',     sub:'The Celestial Messenger',    t:'unit', p:4, r:'R', txt:'ON PLAY: Look at opponent\u2019s hand. Lock one card \u2014 it cannot be played this round.' },
  { id:'ashwini', n:'Ashwini Kumars', sub:'Twin Healers',         t:'unit', p:3, r:'U', txt:'ON PLAY: Restore 2 power to the most wounded friendly Unit.' },
  { id:'marut',   n:'Marut',          sub:'Storm Soldier',        t:'unit', p:3, r:'C', txt:'ON PLAY: If Vayu is on your board, gain +3 power.' },
  { id:'gandharva',n:'Gandharva',     sub:'Celestial Warrior',    t:'unit', p:2, r:'C', txt:'ON PLAY: If 3+ friendly Units are on the board, gain +2 power.' },
  { id:'soldier', n:'Deva Soldier',   sub:'Keeper of Order',      t:'unit', p:2, r:'C', txt:'PASSIVE: While Indra is on the board, gains +1 power at the start of each of your turns.' },
  // ---- ASTRAS (3) ----
  { id:'vajra',   n:'Vajra',          sub:'Thunderbolt of Indra', t:'astra', p:0, r:'L', txt:'Destroy one enemy Unit with power 6+. If Indra is on your board: destroy ANY enemy Unit.' },
  { id:'brahmastra',n:'Brahmastra',   sub:'The Ultimate Weapon',  t:'astra', p:0, r:'M', txt:'Destroy ALL enemy Units. Overrides all shields and immunities.' },
  { id:'sudarshana',n:'Sudarshana Chakra',sub:'Disc of Vishnu',   t:'astra', p:0, r:'M', txt:'Remove one enemy Hero for this round. It returns next round at half power.' },
  // ---- MANTRAS (2) ----
  { id:'gayatri', n:'Gayatri Mantra', sub:'Light of All Worlds',  t:'mantra', p:0, r:'R', txt:'Revive the lowest power friendly Unit from your discard pile at full power, with Dharma Shield.' },
  { id:'pavamana',n:'Pavamana',       sub:'The Purifying Chant',  t:'mantra', p:0, r:'U', txt:'Heal all wounded friendly Units to full. Each healed unit gains +1 power.' },
  // ---- ARTIFACTS (2) ----
  { id:'amrita',  n:'Amrita Kalasha', sub:'Vessel of Immortality',t:'artifact', p:0, r:'M', txt:'ON PLAY: Your lowest power Unit gains +2. If that unit is destroyed this round, it revives at 1 power (once).' },
  { id:'kavacha', n:'Dharma Kavacha', sub:'Shield of Sacred Law', t:'artifact', p:0, r:'R', txt:'PASSIVE: Dharma Shield protects TWO Units instead of one.' },
  // ---- WAVE 1 (batch 1; gated by opts.wave1 — see mkPlayer) — WAVE1_ROSTER_v0.2.md ----
  { id:'devasainika',n:'Deva Sainika', sub:'Soldier of the Vigil',  t:'unit', p:3, r:'C', wave:1, txt:'A steadfast soldier of the celestial line.' },
  { id:'aruna',   n:'Aruna Charioteer',sub:'He Who Rides Before the Sun', t:'unit', p:4, r:'U', wave:1, txt:'ON PLAY: If it is Round 1, gain +2 power.' },
  { id:'agneyastra',n:'Agneyastra',   sub:'Dart of the Devouring Flame',      t:'astra', p:0, r:'R', wave:1, dmgAstra:true, txt:'Deal 3 damage to an enemy Unit.' },
  // ---- WAVE 1 (batch 3 — the Round End tier; roundEndCardEffects) ----
  { id:'dawnsentinel',n:'Dawn Sentinel',sub:'The Watch Before Dawn',t:'unit', p:2, r:'C', wave:1, txt:'ROUND END: If it survived the round, gain +1 power permanently.' },
  { id:'kamadhenu',n:'Kamadhenu',     sub:'Mother of All Plenty', t:'unit', p:4, r:'R', wave:1, txt:'ROUND END: Your lowest-power Unit gains +1.' },
  { id:'savitur', n:'Savitur Verse',  sub:'The Verse That Quickens',       t:'mantra', p:0, r:'U', wave:1, txt:'Choose a friendly Unit: it gains +1 at the end of every round, while it lives.' },
  // ---- WAVE 1 (batch 4 — the passive-aura tier; board-state-conditional, computed read-time in effPower) ----
  { id:'ushas',   n:'Ushas',sub:'Herald of the Dawn',t:'unit', p:3, r:'U', wave:1, txt:'PASSIVE: Your other Units with 2 or less power gain +1.' },
  { id:'vigilrakshak',n:'Vigil Rakshak', sub:'Shield Within the Shield', t:'unit', p:5, r:'R', wave:1, txt:'PASSIVE: While shielded, +2 power.' },
  // ---- WAVE 1 (batch 5 — the draw/discard tier) ----
  { id:'dawnsrebirth',n:"Dawn's Rebirth",sub:'The Light That Returns', t:'mantra', p:0, r:'E', wave:1, txt:"Return your highest-power Unit from the discard at its printed power. It cannot be shielded for the rest of the match." },
  // ---- WAVE 1 (batch 7 — the protection tier) ----
  { id:'vedikeeper',n:'Vedi Keeper',   sub:'Tender of the Holy Altar',   t:'unit', p:3, r:'C', wave:1, txt:'ON PLAY: Your next Dharma Shield this round is applied instantly (one extra shield this round).' },
  { id:'ribhu',    n:'Ribhu Craftsman',sub:'Artisan of the Immortals',      t:'unit', p:3, r:'U', wave:1, txt:'ON PLAY: Your Artifact cannot be targeted or destroyed this round.' },
  { id:'airavatacalf',n:"Airavata's Calf",sub:'Child of the White Elephant',t:'unit', p:4, r:'R', wave:1, txt:'Enters with a Dharma Shield (respects your shield limit).' },
  { id:'ratri',    n:'Ratri Hymn',     sub:'Song of the Sheltering Night',     t:'mantra', p:0, r:'R', wave:1, txt:'This round, prevent all Astra damage to your Units.' },
  // ---- WAVE 1 (batch 9 — the event-trigger tier) ----
  { id:'vanguard', n:"Kartikeya's Vanguard",sub:'First Spear of the War-God',t:'unit', p:5, r:'E', wave:1, txt:'PASSIVE: The first time a friendly Unit is destroyed each round, this gains +2 power.' },
  // ---- WAVE 1 (batch 12 — the cleanup tier) ----
  { id:'dhanvantari',n:'Dhanvantari',  sub:'Physician of the Gods',t:'unit', p:4, r:'R', wave:1, txt:'ON PLAY: Restore one friendly Unit to its printed power.' },
  { id:'shaktispear',n:'Shakti Spear', sub:'The Unerring Vel',   t:'astra', p:0, r:'E', wave:1, txt:'Destroy an enemy Unit with 4 or less power.' },
  { id:'dawnbanner',n:'Dawn Banner',   sub:'Standard of the Rising Light',   t:'artifact', p:0, r:'E', wave:1, txt:'PASSIVE: From the next round on, your Units have +1 power each round.' },
  // ---- WAVE 1 (batch 14 — the astra/utility tier) ----
  { id:'suryastra',n:'Suryastra',      sub:'The Sun Made Weapon',        t:'astra', p:0, r:'L', wave:1, dmgAstra:true, txt:'Deal 2 damage to ALL enemy Units.' },
  // ---- WAVE 1 (batch 15 — the leap-utility tier) ----
  { id:'saranyu',  n:'Saranyu',sub:'The Cloud Mare',  t:'unit', p:5, r:'E', wave:1, txt:'ON PLAY: Two friendly Units exchange current power.' },
  // ---- WAVE 1 (batch 16 — the artifact/counter tier) ----
  { id:'kalpavriksha',n:'Kalpavriksha', sub:'The Wish-Granting Tree',t:'artifact', p:0, r:'M', wave:1, txt:'ROUND END: your lowest-power Unit becomes equal to your highest-power Unit.' },
  // ---- WAVE 1 (batch 17 — heroes part 1) ----
  { id:'kartikeya',n:'Kartikeya',      sub:'Commander of the Deva Host',t:'hero', p:8, r:'L', wave:1, txt:'PASSIVE: When an enemy Astra resolves against your side, all your Units gain +1 power permanently.' },
  // ---- WAVE 1 (batch 19 — deferred heroes) ----
  { id:'garuda',   n:'Garuda',          sub:'King of All Birds',    t:'hero', p:7, r:'L', wave:1, txt:'ON PLAY: Remove all Venom from your Units; each gains +1 power per token removed.' },
];

// Asura roster — docs/ASURA_ROSTER.md (GDD v2.0 §6). Mechanic: Chaos Surge (see chaosSurge()).
const ASURA_DECK_DEF = [
  // ---- HEROES (3) ----
  { id:'mahabali', n:'Mahabali',      sub:'The Eternal Emperor',  t:'hero', p:8, r:'L', txt:'PASSIVE: After you Pass voluntarily, the first Unit you play next round grants an immediate extra turn. A forced Pass does not count.' },
  { id:'shukra',   n:'Shukracharya',  sub:'Master of Mritasanjivani', t:'hero', p:5, r:'E', txt:'ON PLAY: Once per game, revive a fallen friendly Unit from your discard at half its printed power.' },
  { id:'rahu',     n:'Rahu',          sub:'The Shadow That Devours', t:'hero', p:4, r:'E', txt:'PASSIVE: At the start of each round, the opponent discards 1 random card from their hand.' },
  // ---- UNITS (12) ----
  { id:'hiranya',  n:'Hiranyakashipu',sub:'The Immortal Tyrant',  t:'unit', p:7, r:'E', txt:'PASSIVE: Cannot be destroyed by any Astra except Brahmastra. Only a Mantra may remove it.' },
  { id:'ravana',   n:'Ravana',        sub:'The Ten Headed King',  t:'unit', p:7, r:'E', txt:'ON PLAY: Gains +1 power for each card in the opponent’s hand, up to +5.' },
  { id:'kumbha',   n:'Kumbhakarna',   sub:'The Sleeping Giant',   t:'unit', p:8, r:'E', txt:'ON PLAY: Its power counts at once. At the start of your next turn it wakes and deals 3 damage to all enemy Units.' },
  { id:'meghnad',  n:'Meghnad',       sub:'Son of Thunder',       t:'unit', p:6, r:'R', txt:'ON PLAY: If an enemy Hero is on the board, deal 2 damage to it directly. Hero immunity does not protect against this.' },
  { id:'kalanemi', n:'Kalanemi',      sub:'The False Saint',      t:'unit', p:5, r:'R', txt:'ON PLAY: Disguised until your next turn; when revealed, deal 2 damage to all enemy Units.' },
  { id:'bana',     n:'Bana Asura',    sub:'The Thousand Armed',   t:'unit', p:6, r:'E', txt:'PASSIVE: Gains +1 power for each Astra played this round; a doubled Astra counts twice. No limit.' },
  { id:'maricha',  n:'Maricha',       sub:'The Deceptive Demon',  t:'unit', p:3, r:'R', txt:'ON PLAY: Transform into a copy of any Unit on the board, inheriting its power.' },
  { id:'vibhishana',n:'Vibhishana',   sub:'The Righteous Asura',  t:'unit', p:4, r:'U', txt:'ON PLAY: Reveal the opponent’s hand to you for this round.' },
  { id:'tataka',   n:'Tataka',        sub:'The Forest Terror',    t:'unit', p:4, r:'U', txt:'ON PLAY: Destroy the lowest power Unit on the board — friendly or enemy.' },
  { id:'kali',     n:'Kali Asura',    sub:'Embodiment of Discord',t:'unit', p:3, r:'C', txt:'ON PLAY: If Chaos Surge triggered this round, gain +3 power.' },
  { id:'berserker',n:'Asura Berserker',sub:'Chaos Foot Soldier',  t:'unit', p:3, r:'C', txt:'PASSIVE: Gains +1 power each time any Astra is played this round by either player.' },
  { id:'naraka',   n:'Narakasura',    sub:'Lord of Darkness',     t:'unit', p:5, r:'R', txt:'ON PLAY: Steal 1 power from every enemy Unit and add it to this Unit.' },
  // ---- ASTRAS (3) ----
  { id:'pashupata',n:'Pashupatastra', sub:'Shiva’s Wrath',   t:'astra', p:0, r:'M', dmgAstra:true, txt:'Deal damage equal to your total board power to ALL enemy Units, split evenly, at least 1 each. Triggers Chaos Surge.' },
  { id:'nagastra', n:'Nagastra',      sub:'Serpent Weapon',       t:'astra', p:0, r:'R', txt:'Apply a Venom Token to ALL enemy Units. Venom deals -1 power at round end; at 0 power the Unit dies. Triggers Chaos Surge.' },
  { id:'tamasa',   n:'Tamasa',        sub:'The Darkness Weapon',  t:'astra', p:0, r:'R', txt:'The opponent skips their next turn. They may still Pass the round. Triggers Chaos Surge.' },
  // ---- MANTRAS (2) ----
  { id:'sanjivani',n:'Sanjivani Corruption',sub:'Dark Revival',   t:'mantra', p:0, r:'R', txt:'Steal the opponent’s last destroyed Unit this round; place it on your board at its printed power.' },
  { id:'ahamkara', n:'Ahamkara',      sub:'The Ego Weapon',       t:'mantra', p:0, r:'U', txt:'Choose a friendly Unit: double its current power until round end, then it is destroyed regardless.' },
  // ---- ARTIFACTS (2) ----
  { id:'tripura',  n:'Tripura',       sub:'The Three Demon Cities',t:'artifact', p:0, r:'M', txt:'PASSIVE: All your Units gain +1 power at the start of every turn. Ends the instant any Astra is played by either player.' },
  { id:'chandrahas',n:'Chandrahas',   sub:'Ravana’s Moon Blade',t:'artifact', p:0, r:'R', txt:'ON PLAY: trigger one Chaos Surge. PASSIVE: your first Astra each round deals double effect; Chaos Surge triggers twice while active.' },
  // ---- WAVE 1 (batch 1; gated by opts.wave1) — WAVE1_ROSTER_v0.2.md ----
  { id:'ashlegion',n:'Bhasma Sainika', sub:'Soldier of the Pyre',t:'unit', p:3, r:'C', wave:1, txt:'A rank-and-file soldier of the Asura host.' },
  // ---- WAVE 1 (batch 3 — the Round End tier; roundEndCardEffects) ----
  { id:'pisacha', n:'Pisacha Skirmisher',sub:'The Burning Ghoul', t:'unit', p:4, r:'C', wave:1, txt:'ROUND END: −1 power permanently.' },
  { id:'mahishasura',n:'Mahishasura', sub:'The Buffalo Demon',    t:'unit', p:7, r:'E', wave:1, txt:'ROUND END: −2 power unless an enemy Unit died this round.' },
  // ---- WAVE 1 (batch 4 — the passive-aura tier) ----
  { id:'shumbha', n:'Shumbha',          sub:'The Bonded Demon',     t:'unit', p:4, r:'R', wave:1, txt:'PASSIVE: +1 power while Nishumbha is on your board.' },
  { id:'nishumbha',n:'Nishumbha',       sub:'The Bonded Demon',     t:'unit', p:4, r:'R', wave:1, txt:'PASSIVE: +1 power while Shumbha is on your board.' },
  { id:'holika',  n:'Holika',           sub:'The Unburnt',          t:'unit', p:5, r:'R', wave:1, txt:'PASSIVE: Immune to Astra damage. Every other power loss costs it 1 more.' },
  // ---- WAVE 1 (batch 5 — the draw/discard tier) ----
  { id:'bloodoath',n:'Rudhira Bali',    sub:'Pact of the Pyre',     t:'mantra', p:0, r:'U', wave:1, txt:'Destroy your lowest-power Unit: draw 1 card.' },   // R67 (design round 1): draw 2→1 (card-engine haircut; +4.9 Δbase, nearly-free price). ART GATE: Asuras_Mantra_BloodOath_rUncommon.
  // ---- WAVE 1 (batch 6 — the debuff/price tier) ----
  { id:'mayashade',n:'Maya Shade',      sub:'The Mirror Wraith',    t:'unit', p:2, r:'C', wave:1, txt:'ON PLAY: Copy your lowest-power other Unit.' },
  { id:'dhumraksha',n:'Dhumraksha',     sub:'The Smoke-Eyed',       t:'unit', p:4, r:'U', wave:1, txt:'ON PLAY: Deal 1 damage to one of your Units.' },
  { id:'mohanastra',n:'Mohanastra',     sub:'Weapon of Beguiling',  t:'astra', p:0, r:'U', wave:1, dmgAstra:false, txt:'An enemy Unit loses 2 power this round.' },   // dmgAstra:false EXPLICIT (R22 — a debuff is not damage): stays OUT of ASTRA_DMG, so no Patala amplification and Holika sharpens (not immune)
  { id:'surpanakha',n:'Surpanakha',     sub:'The Vengeful Sister',  t:'unit', p:4, r:'R', wave:1, txt:'ON PLAY: An enemy Unit loses 1 power permanently.' },
  // ---- WAVE 1 (batch 7 — the protection tier) ----
  { id:'mayaveil', n:'Maya Veil',       sub:'Shroud of Illusion',   t:'mantra', p:0, r:'E', wave:1, txt:'This round, your Units cannot be targeted by Astras. Area Astras still strike.' },
  // ---- WAVE 1 (batch 8 — the turn-economy tier) ----
  { id:'blueprint',n:"Mayasura's Blueprint",sub:'The Architect’s Design',t:'artifact', p:0, r:'E', wave:1, txt:'PASSIVE: Once per round, playing an Astra does not consume your turn.' },
  { id:'atikaya',  n:'Atikaya',         sub:'The Colossus',         t:'unit', p:6, r:'E', wave:1, txt:'ON PLAY: Enters with −2 power if you have not passed this match, or +2 power if you have.' },
  // ---- WAVE 1 (batch 9 — the event-trigger tier) ----
  { id:'simhika',  n:'Simhika',          sub:'The Shadow-Grasper',   t:'unit', p:4, r:'U', wave:1, txt:'PASSIVE: When an enemy Unit is revived, this gains +2 power.' },
  { id:'raktabija',n:"Raktabija's Curse", sub:'Blood of the Demon',   t:'mantra', p:0, r:'E', wave:1, txt:'The next friendly Unit destroyed this round spawns two 2-power Rakta tokens.' },
  // ---- WAVE 1 (batch 12 — the cleanup tier) ----
  { id:'andhaka',  n:'Andhaka',         sub:'The Blind Demon',      t:'unit', p:6, r:'R', wave:1, txt:'PASSIVE: Cannot be targeted by Astras while another friendly Unit is on the board.' },
  { id:'vidyutastra',n:'Vidyutastra',   sub:'The Lightning Weapon', t:'astra', p:0, r:'R', wave:1, dmgAstra:true, txt:'Deal 2 damage to an enemy Unit. Triggers Chaos Surge twice.' },
  // ---- WAVE 1 (batch 16 — the artifact/counter tier) ----
  { id:'vritra',   n:'Vritra',          sub:'The Withholder',       t:'hero', p:6, r:'L', wave:1, txt:'ON PLAY: Bind an enemy Unit while Vritra remains: it contributes 0 power.' },   // R65 P8→P7; R80 (design round 3, CONDITIONAL — ARMED: Asura still +5.3 after rung one): P7→P6. Honestly labeled ladder insurance (he is +2.2, sub-noise). Ability unchanged. ART GATE: Asuras_Hero_Vritra_P6_rLegendary.
  { id:'brahmadanda',n:'Brahmadanda',   sub:'Staff of Brahma',      t:'astra', p:0, r:'E', wave:1, txt:'Negate the next enemy Astra this round.' },
  { id:'ironcrucible',n:'The Iron Crucible',sub:'Forge of the Price',t:'artifact', p:0, r:'M', wave:1, txt:'ROUND END: your Units that lost power this round regain 1.' },
  // ---- WAVE 1 (batch 19 — deferred heroes) ----
  { id:'mahishi',  n:'Mahishi',          sub:'The Buffalo Queen',    t:'hero', p:5, r:'L', wave:1, txt:'ROUND END, once per game: copy the power of your strongest Unit until round end.' },   // R64 P7→P6; R66 once-per-game gain-only; R72 THIS-ROUND-ONLY revert; R76 (design round 3, the closer): P6→P5 — with the carry dead her printed power is what she scores every non-spike round; the only above-noise Asura line. Ability unchanged. ART GATE (4th/final frame): Asuras_Hero_Mahishi_P5_rLegendary.
];

// Generic faction registry. Add factions here; mkPlayer selects by key.
// Vanara roster — docs/VANARA_ROSTER.md (GDD v2.0 §7). Mechanic: LEAP (see doLeap()). Units-only positions.
const VANARA_DECK_DEF = [
  // ---- HEROES (3) ----
  { id:'hanuman', n:'Bali',       sub:'The Unrivalled King',   t:'hero', p:9, r:'L', txt:'PASSIVE: Each Vanara Unit of printed power 4+ you play gains +1 on entry (+2 while Jambavan is on the board).' },
  { id:'sugriva', n:'Sugriva',       sub:'King of the Vanaras',  t:'hero', p:6, r:'E', txt:'ON PLAY: Draw 1 extra card immediately.' },
  { id:'angad',   n:'Angad',         sub:'The Unyielding Messenger', t:'hero', p:7, r:'E', txt:'PASSIVE: When the opponent plays an Astra, they forfeit their next turn.' },
  // ---- UNITS (12) ----
  { id:'nala',    n:'Nala',          sub:'The Bridge Builder',   t:'unit', p:5, r:'E', txt:'ON PLAY: Place a copy of the lowest-power Vanara Unit in your hand onto the row at half power.' },
  { id:'neela',   n:'Neela',         sub:'Commander of the Vanguard', t:'unit', p:5, r:'R', txt:'ON PLAY: All Vanara Units on the board gain +1 power.' },
  { id:'jambavan',n:'Jambavan',      sub:'The Ancient Bear King',t:'unit', p:6, r:'E', txt:'PASSIVE: Bali’s entry bonus becomes +2 per Unit while Jambavan is on the board.' },
  { id:'kesari',  n:'Kesari',        sub:'Father of Hanuman',    t:'unit', p:5, r:'R', txt:'ON PLAY: If Bali is on the board, gain power equal to Bali’s current power.' },
  { id:'tara',    n:'Tara',          sub:'Queen of the Vanaras', t:'unit', p:4, r:'R', txt:'ON PLAY: Look at the top 3 cards of your deck; keep one, return the rest.' },
  { id:'dwivida', n:'Dwivida',       sub:'The Rogue Vanara',     t:'unit', p:5, r:'R', txt:'ON PLAY: Destroy one random card in the opponent’s hand.' },
  { id:'mainda',  n:'Mainda',        sub:'The Swift Striker',    t:'unit', p:4, r:'U', txt:'ON PLAY: Immediately Leap onto an adjacent Unit — free, without spending your round’s Leap.' },
  { id:'sharabha',n:'Sharabha',      sub:'The Forest Sentinel',  t:'unit', p:3, r:'U', txt:'PASSIVE: The opponent cannot target your Vanara Units of power 3 or less with Astras.' },
  { id:'scout',   n:'Vanara Scout',  sub:'Eyes of the Jungle',   t:'unit', p:2, r:'C', txt:'ON PLAY: Reveal the opponent’s hand; gain +1 power for each Vanara Unit already on the board.' },
  { id:'warrior', n:'Vanara Warrior',sub:'Loyal to the Last',    t:'unit', p:3, r:'C', txt:'PASSIVE: +1 power for each other Vanara Unit on the board (max +4).' },
  { id:'dadhimukha',n:'Dadhimukha',  sub:'Guardian of Madhuvana',t:'unit', p:3, r:'U', txt:'ON PLAY: Draw 1 card. If Sugriva is on the board, also give all friendly Vanara Units +1 power.' },
  { id:'riksha',  n:'Riksha',        sub:'Son of the Wind',      t:'unit', p:4, r:'R', txt:'PASSIVE: Gains +3 power while Bali is on the board.' },
  // ---- ASTRAS (3) ----
  { id:'gandiva', n:'Gandiva Arrow', sub:'Blessed Shaft',        t:'astra', p:0, r:'R', txt:'Destroy one enemy Unit regardless of power. If a Vanara used Leap this round, destroy one more.' },
  { id:'lankadahan',n:'Lanka Dahan', sub:'Fire of Hanuman',      t:'astra', p:0, r:'L', dmgAstra:true, txt:'Deal 2 damage to ALL enemy Units. All friendly Vanara Units gain +1 power.' },
  { id:'sanjeevani',n:'Sanjeevani Call',sub:'Mountain of Life',  t:'astra', p:0, r:'U', txt:'Revive your last destroyed Unit at full power (plus Bali’s entry bonus if he is on board).' },
  // ---- MANTRAS (2) ----
  { id:'ramanaam',n:'Rama Naam',     sub:'The Name Above All',   t:'mantra', p:0, r:'R', txt:'All friendly Vanara Units gain +2 power.' },
  { id:'kishkindhaoath',n:'Kishkindha Oath',sub:'Bond of Warriors',t:'mantra', p:0, r:'U', txt:'Ward a friendly Vanara Unit: the next time it would be destroyed this round it survives at 1 power, and all other friendly Vanara Units gain +1.' },
  // ---- ARTIFACTS (2) ----
  { id:'ramasignet',n:'Rama’s Signet',sub:'Seal of Trust',       t:'artifact', p:0, r:'R', txt:'PASSIVE: Your Vanara Units cannot be reduced below 1 power by any effect; Venom on them is negated.' },
  { id:'kishkindhacrown',n:'Kishkindha Crown',sub:'Throne of Unity',t:'artifact', p:0, r:'M', txt:'PASSIVE: When a Vanara Unit Leaps, it and the copied Unit both gain +1. Leap limit becomes twice per round.' },
  // ---- WAVE 1 (batch 1; gated by opts.wave1) — WAVE1_ROSTER_v0.2.md ----
  { id:'kishrunner',n:'Kishkindha Runner',sub:'Swift Scout',    t:'unit', p:4, r:'C', wave:1, txt:'A fleet-footed runner of the vanara host.' },   // R73 (design round 2): P3→P4 stat lift (was −10.0 Δbase, the cheapest unconditional aggregate lever). ART GATE: filename re-numbers to Vanaras_Unit_KishkindhaRunner_P4_rCommon.
  // ---- WAVE 1 (batch 5 — the draw/discard tier) ----
  { id:'swayamprabha',n:'Swayamprabha', sub:'Keeper of the Hidden Vale',t:'unit', p:3, r:'R', wave:1, txt:'ON PLAY: Look at the top 3 cards of your deck; take one to your hand, return the rest.' },
  // ---- WAVE 1 (batch 10 — the positional tier; R27 move/place primitive) ----
  { id:'setumason',n:'Setu Mason',     sub:'Builder of the Bridge', t:'unit', p:2, r:'C', wave:1, txt:'PASSIVE: +2 power while adjacent to Vanaras on both sides.' },   // R68 (design round 1): +1→+2 (interior payoff; −7.2 Δbase). ART GATE: Vanaras_Unit_SetuMason_P2_rCommon.
  { id:'drummer',  n:'Drummer of the Host',sub:'Beat of the March', t:'unit', p:2, r:'C', wave:1, txt:'ON PLAY: Adjacent Units gain +1 power permanently.' },   // R69 (design round 1): this-round→permanent (R21 base+power; −5.0 Δbase, the temporary buffs evaporated). ART GATE: Vanaras_Unit_DrummeroftheHost_P2_rCommon.
  { id:'gavaksha', n:'Gavaksha',       sub:'The Nimble',            t:'unit', p:4, r:'U', wave:1, txt:'ON PLAY: You may swap places with another friendly Unit.' },   // R79 (design round 3): P3→P4 stat lift (was −9.2, swap functionally never taken — 6 fires/~460 plays; the Runner precedent). Swap unchanged. ART GATE: Vanaras_Unit_Gavaksha_P4_rUncommon.
  { id:'setustones',n:'The Setu Stones',sub:'Bridge of the Vanaras',t:'artifact', p:0, r:'E', wave:1, txt:'PASSIVE: Your Units enter adjacent to a friendly Unit you choose.' },
  { id:'vault',    n:'Vault of the Sky',sub:'Leap of the Heavens',   t:'mantra', p:0, r:'E', wave:1, txt:'Move a friendly Unit anywhere on your row; it and its new neighbours gain +2 power permanently.' },   // R70 permanent; R77 (design round 3): FORMATION-NATIVE rework — the moved Unit AND its non-ghost destination neighbours +2 permanent (R70's permanence alone didn't lift it, −6.9→−8.0; the move was the low-value half). ART GATE: Vanaras_Mantra_VaultoftheSky_rEpic.
  // ---- WAVE 1 (batch 11 — the Leap/round-end tier; Vanara wave core CLOSES here) ----
  { id:'gaja',     n:'Gaja',            sub:'The Mountain',          t:'unit', p:4, r:'U', wave:1, txt:'PASSIVE: +1 power while your board has more Units than the enemy.' },
  { id:'kumuda',   n:'Kumuda',          sub:'The Bright One',        t:'unit', p:3, r:'U', wave:1, txt:'When this Leaps or is Leapt to, it gains +2 power permanently.' },   // R75 (design round 2): +1→+2 (constant-only; the Matanga rework doubled leap volume 1.36→2.20/game, so the trigger has fuel). Permanence class unchanged (base+power). ART GATE: Vanaras_Unit_Kumuda_P3_rUncommon.
  { id:'sushena',  n:'Sushena the Healer',sub:'Physician of the Host',t:'unit', p:4, r:'R', wave:1, txt:'ROUND END: Restore 1 power to each adjacent damaged Unit.' },
  { id:'rambha',   n:'Rambha the Bold', sub:'Dancer of the Van',     t:'unit', p:5, r:'E', wave:1, txt:'When any friendly Unit Leaps, this gains +1 power permanently.' },
  { id:'livingbridge',n:'The Living Bridge',sub:'Span of the Ages', t:'artifact', p:0, r:'M', wave:1, txt:'When your Units first form an unbroken line of 4+ this round, that line gains +2 power permanently. Once per round.' },   // R63 re-text (formation-moment trigger) + R78 (design round 3): grant +1→+2 (mythic-grade; epicenter −16.8 at +1×4). ⚠ def txt was STALE since R63 (still read the old ROUND-END +1) — corrected here. ART GATE (NEW — missed in R63): Vanaras_Artifact_TheLivingBridge_rMythic.
  // ---- WAVE 1 (batch 14 — the astra/utility tier) ----
  { id:'sampati',  n:'Sampati',         sub:'Vulture of the Vale',  t:'unit', p:5, r:'R', wave:1, txt:"ON PLAY: Reveal the enemy's highest-power card in hand." },
  { id:'vinatastalon',n:"Vinata's Talon",sub:'Claw of the Mother',  t:'unit', p:4, r:'R', wave:1, txt:'ON PLAY: Deal 1 damage to an enemy Unit for every two friendly Vanaras.' },   // R74 (design round 2): UNCAPPED (was max 3) — the width payoff for the human swarm ceiling; R50 stands otherwise (self-inclusive floor(n/2), single target, non-astra, Holika sharpens per hit). ART GATE: Vanaras_Unit_VinatasTalon_P4_rRare.
  { id:'vayavyastra',n:'Vayavyastra',   sub:'The Wind Weapon',      t:'astra', p:0, r:'R', wave:1, txt:"Return an enemy Unit of 4 or less power to its owner's hand." },
  { id:'jatayu',   n:"Jatayu's Last Flight",sub:'The Final Dive',   t:'astra', p:0, r:'E', wave:1, txt:'Destroy an enemy Unit with more than 6 power.' },
  // ---- WAVE 1 (batch 15 — the leap-utility tier; Vanara wave FULLY CLOSES here) ----
  { id:'songcrossing',n:'Song of the Crossing',sub:'Hymn of the Bridge',t:'mantra', p:0, r:'U', wave:1, txt:'Your Units gain +1 power (+2 if you have 4 or more).' },
  { id:'matanga', n:"Matanga's Blessing",sub:'Grace of the Sage',   t:'mantra', p:0, r:'R', wave:1, txt:'Immediately Leap with one friendly Unit (does not count against the round’s Leap limit); both Units gain +2 power this round.' },   // R71 (design round 1): self-contained rework — the next-leap window was 92% dead (−9.4 Δbase). Now a REAL immediate free doLeap (Kumuda/Rambha fire, Gandhamadana widens) + both +2 this round. ART GATE: Vanaras_Mantra_MatangasBlessing_rRare.
  { id:'gandhamadana',n:'Gandhamadana',  sub:'The Fragrant Peak',    t:'unit', p:5, r:'E', wave:1, txt:'PASSIVE: Your Leaps may target this Unit from anywhere (ignores adjacency).' },
  { id:'anjaneyaroar',n:"Anjaneya's Roar",sub:'Cry of the Son of Wind',t:'astra', p:0, r:'L', wave:1, dmgAstra:false, txt:'All enemy Units −1 this round; your Units flanked on both sides gain +1.' },
  // ---- WAVE 1 (batch 17 — heroes part 1) ----
  { id:'makardhwaja',n:'Makardhwaja',  sub:'Son of Hanuman',       t:'hero', p:7, r:'L', wave:1, txt:'ON PLAY: Copy the power of Bali if he is on the board, otherwise of your strongest Unit.' },
  { id:'anjana',   n:'Anjana',          sub:'Mother of the Wind',   t:'hero', p:6, r:'L', wave:1, txt:'PASSIVE: Your Leap limit is increased by 1 each round.' },
];

// Naga roster — docs/NAGA_ROSTER.md (GDD v2.0 §8). Mechanic: VENOM (see venomTick / drainAmount). Rulings R10–R16.
const NAGA_DECK_DEF = [
  // ---- HEROES (3) ----
  { id:'vasuki',  n:'Vasuki',         sub:'The Cosmic Serpent',   t:'hero', p:8, r:'L', txt:'ON PLAY: All enemy Units lose 1 power. PASSIVE: In Round 3, the Venom drain is −2 per enemy Unit.' },
  { id:'takshaka',n:'Takshaka',       sub:'The Inevitable',       t:'hero', p:6, r:'E', txt:'PASSIVE: While Takshaka is on the board, enemy Heroes are NOT immune to your Naga Astras.' },
  { id:'shesha',  n:'Shesha',         sub:'The Infinite Serpent', t:'hero', p:7, r:'L', txt:'PASSIVE: If you lose a round, at the start of the next round a random friendly Unit returns from your discard at full power.' },
  // ---- UNITS (12) ----
  { id:'manasa',  n:'Manasa',         sub:'Goddess of Serpents',  t:'unit', p:5, r:'E', txt:'PASSIVE: The opponent’s Astras are cancelled (effect and Chaos Surge). ON PLAY: gain +1 power for each Naga Unit on the board.' },
  { id:'karkotaka',n:'Karkotaka',     sub:'The Venomous King',    t:'unit', p:6, r:'E', txt:'PASSIVE: Your Venom drain fires once, the moment either player first passes each round, instead of at round end.' },
  { id:'surasa',  n:'Surasa',         sub:'Mother of Nagas',      t:'unit', p:5, r:'E', txt:'ON PLAY: Trap the opponent’s next card — a Unit enters with −2 power and Surasa gains +2; an Astra is negated (its Chaos Surge still fires).' },
  { id:'ulupi',   n:'Ulupi',          sub:'The River Naga Princess', t:'unit', p:4, r:'R', txt:'ON PLAY: Revive a destroyed friendly Naga Unit from your discard at full power; it can’t be targeted by Astras this round.' },
  { id:'nagasadhu',n:'Naga Sadhu',    sub:'The Poison Ascetic',   t:'unit', p:3, r:'R', txt:'ON PLAY: Apply a Venom Token to ALL enemy Units.' },
  { id:'kaliya',  n:'Kaliya',         sub:'The Multi-Headed Terror', t:'unit', p:6, r:'E', txt:'ON PLAY: Enters with +1 power per round already completed (R1 +0, R2 +1, R3 +2).' },
  { id:'astika',  n:'Astika',         sub:'The Peacemaker',       t:'unit', p:4, r:'U', txt:'ON PLAY: Skip the next Venom tick; all friendly Units recover 1 power.' },
  { id:'nagaarcher',n:'Naga Archer',  sub:'Poison Arrow',         t:'unit', p:3, r:'U', txt:'ON PLAY: Deal 1 damage to an enemy Unit; if it survives, apply a Venom Token to it.' },
  { id:'nagaenchantress',n:'Naga Enchantress',sub:'The Luring Mist',t:'unit', p:3, r:'U', txt:'ON PLAY: The opponent’s next card must be a Unit — they cannot play an Astra or Mantra next turn.' },
  { id:'nagawarrior',n:'Naga Warrior',sub:'Scales of Darkness',   t:'unit', p:3, r:'C', txt:'PASSIVE: +1 power for each Venom Token on the board.' },
  { id:'nagahatchling',n:'Naga Hatchling',sub:'Born of Venom',    t:'unit', p:2, r:'C', txt:'ON PLAY: If any enemy Unit carries a Venom Token, gain +2 power.' },
  { id:'ashvatara',n:'Ashvatara',     sub:'The Naga Prince',      t:'unit', p:5, r:'R', txt:'ON PLAY: An enemy Unit loses power equal to the current round number (R1 −1, R2 −2, R3 −3).' },
  // ---- ASTRAS (3) ----
  { id:'nagapasha',n:'Nagapasha',     sub:'Serpent Noose',        t:'astra', p:0, r:'R', txt:'Bind an enemy Unit — it contributes 0 power until the opponent spends a turn to unbind it.' },
  { id:'venomstrike',n:'Vasuki Venom Strike',sub:'Cosmic Poison', t:'astra', p:0, r:'L', txt:'This round, your Venom drain is tripled (−3, or −4 while Vasuki is on the board).' },
  { id:'mohini',  n:'Mohini Trap',    sub:'The Illusion Snare',   t:'astra', p:0, r:'R', txt:'Steal an enemy Unit until round end; it fights for you (and is exempt from your Venom).' },
  // ---- MANTRAS (2) ----
  { id:'mrityunjaya',n:'Mrityunjaya', sub:'Conquest of Death',    t:'mantra', p:0, r:'R', txt:'Revive any destroyed Unit (either discard) onto your board at full power. It gains a Venom Token.' },
  { id:'sarpasatra',n:'Sarpa Satra',  sub:'The Serpent Sacrifice',t:'mantra', p:0, r:'U', txt:'Sacrifice a friendly Naga Unit: all enemy Units lose power equal to its current power. Venom Tokens deal double this round.' },
  // ---- ARTIFACTS (2) ----
  { id:'patala',  n:'Patala Throne',  sub:'Seat of Serpent Kings',t:'artifact', p:0, r:'M', txt:'PASSIVE: Your Venom drain becomes −(1 + current round number): R1 −2, R2 −3, R3 −4.' },
  { id:'anantacoil',n:'Ananta Coil',  sub:'The Endless Serpent',  t:'artifact', p:0, r:'R', txt:'PASSIVE: When a friendly Naga Unit is destroyed, leave a permanent Venom Coil that drains 1 from a random enemy Unit each Venom tick (persists all match).' },
  // ---- WAVE 1 (batch 1; gated by opts.wave1) — WAVE1_ROSTER_v0.2.md ----
  { id:'coilsentry',n:'Naga Dwarapala',  sub:'Watch of the Deep',    t:'unit', p:3, r:'C', wave:1, txt:'A silent sentinel of the serpent halls.' },
  // ---- WAVE 1 (batch 8 — the turn-economy tier) ----
  { id:'longpatience',n:'Visha Vayu',sub:'Vigil of the Deep',t:'mantra', p:0, r:'E', wave:1, txt:'Apply a Venom Token to every enemy Unit.' },
  // ---- WAVE 1 (batch 9 — the event-trigger tier) ----
  { id:'vishalakshi',n:'Vishalakshi the Pale',sub:'Eyes of the Deep',t:'unit', p:4, r:'R', wave:1, txt:'PASSIVE: When an enemy Unit dies with Venom on it, this gains +2 power permanently.' },
  // ---- WAVE 1 (batch 13 — the venom tier: bounce + mill) ----
  { id:'uraga',    n:'Uraga Colossus',  sub:'The Molting Titan',    t:'unit', p:7, r:'E', wave:1, txt:'ON PLAY: Enters with 2 Venom on itself. Sheds 1 Venom each round.' },
  { id:'mahapadma',n:'Mahapadma',       sub:'Lord of the Nine',     t:'unit', p:5, r:'R', wave:1, txt:'PASSIVE: Enemy Units with Venom cannot receive Dharma Shield.' },
  { id:'worldcoil',n:'Vishwapasha',sub:'The Endless Grip',t:'astra', p:0, r:'E', wave:1, txt:'Bind an enemy Unit until it loses a Venom token.' },
  { id:'shedskin', n:'Rite of Shed Skin',sub:'The Serpent Renews',  t:'mantra', p:0, r:'U', wave:1, txt:'Return a friendly Unit to your hand; it re-enters at its printed power.' },
  { id:'drownedaltar',n:'The Drowned Altar',sub:'Shrine of the Deep',t:'artifact', p:0, r:'E', wave:1, txt:'ROUND END: Mill the top card of your deck. If it is a Unit, your Units gain +1 power this round.' },
  // ---- WAVE 1 (batch 17 — heroes part 1) ----
  { id:'padmavati',n:'Padmavati',      sub:'The Serpent Queen',    t:'hero', p:7, r:'L', wave:1, txt:'ROUND END: Apply 1 Venom to the strongest enemy Unit.' },
  // ---- WAVE 1 (batch 18 — the Naga remainder, part 1) ----
  { id:'patalahatchling',n:'Patala Hatchling',sub:'Spawn of the Deep',t:'unit', p:2, r:'C', wave:1, txt:'ON PLAY: Apply 1 Venom to a random enemy Unit.' },
  { id:'moltingnaga',n:'Nirmoka', sub:'The Shedding',         t:'unit', p:2, r:'C', wave:1, txt:'When destroyed, apply 1 Venom to the highest-power enemy Unit.' },
  { id:'venomharvester',n:'Vishadhara',sub:'Reaper of Toxin', t:'unit', p:3, r:'U', wave:1, txt:"ON PLAY: Gain +1 power per Venom on the enemy's strongest Unit (max 3)." },
  { id:'shankhapala',n:'Shankhapala',  sub:'The Coil-Warden',      t:'unit', p:4, r:'U', wave:1, txt:'ROUND END: Move 1 Venom from one enemy Unit to another.' },
  { id:'depthcaller',n:'Avahani', sub:'Voice of the Abyss',   t:'unit', p:3, r:'U', wave:1, txt:'ON PLAY: Gain +2 power if a friendly Unit is in your discard.' },
  { id:'gravetide', n:'Vaitarani Naga',sub:'Tide of the Fallen',  t:'unit', p:4, r:'R', wave:1, txt:'ON PLAY: Gain +1 power per Unit in either discard (max 4).' },
  { id:'kalakuta',  n:'Kalakuta Vial', sub:'The Churned Poison',   t:'astra', p:0, r:'R', wave:1, dmgAstra:false, txt:'Apply 2 Venom to one enemy Unit.' },
  { id:'hymndepths',n:'Hymn of the Depths',sub:'Song of the Drowned',t:'mantra', p:0, r:'R', wave:1, txt:'All Venom drains trigger immediately, once.' },
  { id:'serpentskiss',n:"Serpent's Kiss",sub:'The Final Bite',     t:'astra', p:0, r:'E', wave:1, dmgAstra:false, txt:'Destroy an enemy Unit with 2 or more Venom.' },
  { id:'siltstrangler',n:'Ajagara',sub:'The Drowner',       t:'unit', p:4, r:'R', wave:1, txt:'ON PLAY: An enemy Unit loses power equal to its Venom count (the tokens remain).' },
  // ---- WAVE 1 (batch 19 — deferred heroes) ----
  { id:'kulika',   n:'Kulika',           sub:'Warden of the Nether-Naga',t:'hero', p:8, r:'L', wave:1, txt:'ON PLAY: Transfer all Venom from your Units to random enemy Units.' },
  // ---- WAVE 1 (batch 20 — the final two: closes the wave 88/88) ----
  { id:'nahusha',  n:'Nahusha, Fallen King',sub:'The Cursed Serpent',t:'unit', p:6, r:'E', wave:1, txt:"ON PLAY: This round, the Cosmic Realm's effect applies to your side only." },
  { id:'secondthrone',n:'Throne of the Second King',sub:'Seat of the Drowned Crown',t:'artifact', p:0, r:'M', wave:1, txt:'PASSIVE: When an enemy Unit loses power to Venom, your strongest Unit gains that much power.' },
];

const DECKS = { devas: DEVA_DECK_DEF, asuras: ASURA_DECK_DEF, vanaras: VANARA_DECK_DEF, nagas: NAGA_DECK_DEF };
// name → card DEF (for opts.scenario deck/hand injection; instances are minted via mkCard for uid safety). Built once; touches no rng/UID.
const CARD_BY_NAME = {}; for (const f in DECKS) for (const c of DECKS[f]) CARD_BY_NAME[c.n] = c;

/* THE 7 COSMIC REALMS (GDD §10). One is assigned per match (random by default; fixable via opts.realm for tests).
   Each is an engine-level modifier consulted at the relevant chokepoint — NOTE: realm key 'patala' is the REALM
   (astra damage +1); the Naga artifact is card.id 'patala' (Patala Throne). They never mix: realm is g.realm,
   artifact is card.id, always accessed distinctly. */
const REALMS = ['swarga','mrityulok','patala','gandharva','yaksha','rishi','kalki'];
const REALM_INFO = {
  swarga:    { name:'Swarga',        fx:'All Heroes have +1 power for the match.' },
  mrityulok: { name:'Mrityulok',     fx:'The mortal plane — no realm effect.' },
  patala:    { name:'Patala',        fx:'All Astra damage is increased by +1.' },
  gandharva: { name:'Gandharva Lok', fx:'Both players draw 1 extra card at the start of Round 2.' },
  yaksha:    { name:'Yaksha Lok',    fx:'Artifacts cannot be destroyed.' },
  rishi:     { name:'Rishi Mandala', fx:'Each Mantra can be used twice — it returns to your hand after its first cast.' },
  kalki:     { name:'Kalki Kshetra', fx:'The last card played each round gains +2 power (only if it is a Unit or Hero).' },
};
const realmIs = (g, key) => g.realm===key;
// WAVE 1 batch 20 — R61 Nahusha: the Cosmic Realm is per-side (default ON). realmActiveFor(side) is false only when Nahusha
// has SUPPRESSED that side's realm THIS round (round-stamp, auto-expires). Flag-off (no Nahusha) → stamp 0 → always true → every
// realm site behaves exactly as before (byte-identical). Six realm sites gate on realmActiveFor(<beneficiary side>) — see R61 map.
const realmActiveFor = (g, side) => g.players[side].realmSuppressedRound !== g.round;
// Damage-dealing Astras (Patala realm +1), DERIVED from the `dmgAstra:true` card tag (keyed by name — the `cause` string).
// A permanent invariant in test.js pins the expected members so a tag typo fails loudly. (Wave-1 dmgAstra cards tag in behind the wave1 flag.)
const ASTRA_DMG = new Set(Object.values(CARD_BY_NAME).filter(c => c.dmgAstra).map(c => c.n));

let UID = 1;
function mkCard(def){ return { ...def, uid: UID++, power: def.p, base: def.p, ghost:false, lockedRound:0, aegis:false, revivedShield:false, asleep:false, revealPending:false, venom:0, doomed:false, disguisedAs:null, ward:false, bound:false, astraImmuneRound:0, stolenBy:-1 }; }
function shuffle(a, rng){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function mkPlayer(name, rng, faction='devas', spec, wave1){
  const rawSrc = DECKS[faction] || DECKS.devas;
  // wave1 opt (additive, read ONLY when present — opts.realm/scenario precedent): the random pool EXCLUDES wave:1 defs unless enabled.
  // Filtered BEFORE .map(mkCard) so with the flag off the launch pool, its UID assignment, and the g.rng shuffle sequence are byte-identical to today.
  const src = wave1 ? rawSrc : rawSrc.filter(c => !c.wave);
  let deck, hand;
  if (spec && (spec.deck || spec.hand || spec.handSize!=null)){
    // opts.scenario injection (read ONLY when present — opts.realm precedent). Custom decklist → ordered, NO shuffle; else the normal shuffled faction deck.
    deck = spec.deck ? spec.deck.map(n=>{ const d=CARD_BY_NAME[n]; if (!d) throw new Error(`opts.scenario: unknown card name "${n}"`); return mkCard(d); }) : shuffle(src.map(mkCard), rng);   // hard error on a bad name (authoring safety, design ruling)
    if (spec.hand){ hand=[]; for (const n of spec.hand){ const i=deck.findIndex(c=>c.n===n); if (i<0) throw new Error(`opts.scenario: hand card "${n}" is not in the deck`); hand.push(deck.splice(i,1)[0]); } }   // opening hand = named cards pulled from the deck
    else hand = deck.splice(0, spec.handSize!=null ? spec.handSize : 10);
  } else {
    deck = shuffle(src.map(mkCard), rng);                              // ↓ absent/empty scenario: byte-identical to pre-scenario code
    hand = deck.splice(0,10);
  }
  return { name, faction, deck, hand, discard:[],
    units:[], heroes:[], artifact:null,
    passed:false, roundWins:0,
    heroPlayedThisRound:false, astrasThisRound:0,
    artifactsDestroyedByMe:0, removedHeroes:[],
    skipNext:false, mahabaliArm:-1, chaosThisRound:false, seesOppHand:false,
    shieldUids:[], leapsUsed:0,
    boardTokens:0, surasaTrap:false, astikaPause:false, sarpaDouble:false, venomStrike:0, mustPlayUnit:false,
    deathsThisRound:0, saviturUids:[],   // WAVE 1 batch 3: per-round enemy-death signal (Mahishasura) + Savitur Verse enchant list (match-long)
    vediShieldGrants:0, artifactShieldRound:0, ratriRound:0, mayaVeilRound:0,   // WAVE 1 batch 7 (protection tier): Vedi Keeper bonus-shield counter (reset each round) + Ribhu/Ratri/Maya-Veil round stamps (auto-expire, checked ===g.round)
    blueprintUsed:false, hasPassedThisMatch:false,   // WAVE 1 batch 8 (turn-economy): Blueprint once-per-round guard (reset each round) + Atikaya's match-long VOLUNTARY-pass flag (set only in pass(), never reset — Mahabali precedent)
    vanguardTriggered:false, raktabijaCurse:false,   // WAVE 1 batch 9 (event-trigger): Kartikeya's Vanguard once-per-round guard + Raktabija's Curse armed flag (both reset each round)
    bridgeFiredRound:0,   // R63 (balance round 1): The Living Bridge once-per-round lock (round-stamp; auto-invalidates as g.round advances). g.wave1-gated reads only — no-op flag-off.
    lostPowerUids:new Set(), brahmadandaArmed:0,   // WAVE 1 batch 16 (artifact/counter): per-round set of Unit uids that LOST power (Iron Crucible reads it; g.wave1-gated writes) + Brahmadanda arm round-stamp (negates the next enemy Astra's effect). Both reset each round.
    realmSuppressedRound:0,   // WAVE 1 batch 20 (R61 Nahusha): round-stamp — when === g.round, THIS side's Cosmic Realm effect is suppressed this round. Default 0 → realmActiveFor true → byte-identical flag-off.
    dawnBannerFrom:0,   // WAVE 1 batch 12: Dawn Banner — round # from which the +1 aura is active (set to g.round+1 on play; 0 = inactive). Match-long stamp (survives the artifact clear); the "next round start" + "compounding" reading.
    mulliganed:false, manualShield:false };
}

/* MULLIGAN (GDD §2.2): before Round 1, a player may swap up to 3 cards — returned to deck, reshuffled, redraw the
   same count. Consumes rng (reshuffle) only when cards are actually swapped. */
function mulligan(g, pi, uids){
  const pl=g.players[pi];
  const cap = g.mulliganCount!=null ? g.mulliganCount : 3;               // opts.scenario.mulligan (0 disables); default 3
  if (g.round!==1 || g.roundHistory.length || pl.mulliganed || cap<=0) return [];   // pre-Round-1, once
  const swap=(uids||[]).slice(0,cap).map(u=>pl.hand.find(c=>c.uid===u)).filter(Boolean);
  pl.mulliganed=true;
  if (!swap.length) return [];
  for (const c of swap){ pl.hand.splice(pl.hand.indexOf(c),1); pl.deck.push(c); }
  shuffle(pl.deck, g.rng);
  const redrawn=pl.deck.splice(0, swap.length); pl.hand.push(...redrawn);
  log(g, `${pl.name} mulligans ${swap.length} card(s).`);
  emit(g,'toast',{abilityName:'Mulligan',text:`${pl.name} redraws ${swap.length}`});
  return redrawn.map(c=>c.uid);
}
// AI mulligan heuristic: toss dead conditionals (Marut w/o Vayu, Kali, Riksha/Kesari w/o Bali) and low vanilla
// filler, keep the curve, never ditch your only Hero. Returns up to 3 uids.
function aiMulliganPlan(g, pi){
  const pl=g.players[pi], hand=pl.hand;
  if (pl.difficulty==='beginner') return [];   // TASK D1: beginner skips the mulligan entirely (driver-safe — even if called)
  const has=id=>hand.some(c=>c.id===id);
  const heroCount=hand.filter(c=>c.t==='hero').length;
  const bad=[];
  for (const c of hand){
    let b=0;
    if (c.id==='marut' && !has('vayu')) b+=3;                          // dead without Vayu
    if (c.id==='kali') b+=2;                                            // needs a prior Chaos Surge
    if (c.id==='riksha' && !has('hanuman')) b+=1.5;
    if (c.id==='kesari' && !has('hanuman')) b+=1.5;
    if (c.id==='marut' && has('vayu')) b-=1;
    if (c.id==='soldier') b+=1.2;                                      // 2-power vanilla unless Indra
    if (c.id==='gandharva') b+=1;                                     // needs a wide board
    if (c.id==='nagahatchling') b+=1;                                 // needs enemy Venom Tokens
    if (b>0 && !(c.t==='hero' && heroCount<=1)) bad.push([c,b]);      // keep your only Hero
  }
  bad.sort((a,b)=>b[1]-a[1]);
  const cap = g.mulliganCount!=null ? g.mulliganCount : 3;   // opts.scenario.mulligan (0 disables); default 3
  return bad.slice(0, cap).map(([c])=>c.uid);
}

function newGame(opts={}){
  const rng = opts.rng || Math.random;
  const sc = opts.scenario;                              // opts.scenario: additive, read ONLY when present (opts.realm precedent). Absent/empty → identical behavior + rng sequence.
  const g = {
    rng, round:1, over:false, winner:null,
    players:[ mkPlayer(opts.p0||'You', rng, opts.p0Faction||'devas', sc && {deck:sc.p0Deck, hand:sc.p0Hand, handSize:sc.handSize}, opts.wave1),
              mkPlayer(opts.p1||'Opponent', rng, opts.p1Faction||'devas', sc && {deck:sc.p1Deck, hand:sc.p1Hand, handSize:sc.handSize}, opts.wave1) ],
    turn: rng()<0.5?0:1, lastMantra:null, log:[], events:[],
    roundHistory:[],
    lastKillThisRound:null, astraPlays:0, astraBanaCount:0, grantExtraTurn:null,
    lastCardThisRound:null,                            // Kalki Kshetra: {uid, isBody}
  };
  // scenario knobs — each defaults to today's hardcoded value, so an absent/empty scenario is a full no-op (no rng consumed here).
  g.winTarget     = (sc && sc.winTarget!=null) ? sc.winTarget : 2;   // rounds needed to win the match (best-of-3 default)
  g.drawCount     = (sc && sc.draws!=null)     ? sc.draws     : 2;   // between-round draw count (realm bonus still added on top)
  g.mulliganCount = (sc && sc.mulligan!=null)  ? sc.mulligan  : 3;   // mulligan swaps allowed; 0 disables the phase
  g.wave1 = !!opts.wave1;   // WAVE 1 batch 9.5 (launch-repair): mirror the pool flag onto g so the Shukracharya revive branch can gate on it — DEAD flag-off (nothing else reads g.wave1; no rng consumed → byte-identical live game)
  // DIFFICULTY (TASK D1): per-player, additive. Absent/unknown → 'advanced' (the launch AI, byte-identical). No rng consumed here.
  { const _d = x => (DIFFICULTY[x] ? x : 'advanced');
    g.players[0].difficulty = _d(opts.p0Difficulty || opts.difficulty);
    g.players[1].difficulty = _d(opts.p1Difficulty || opts.difficulty); }
  // Realm: fixed via opts.realm consumes NO rng (so a fixed-realm test stays byte-identical); random default draws one.
  g.realm = opts.realm || REALMS[Math.floor(rng()*REALMS.length)];
  // DEATHMATCH setup buffs (TASK D1) — gated PER PLAYER on pl.difficulty, so absent/advanced/beginner consume NO
  // extra rng and are byte-identical. Mulligan is GUARANTEED here (driver-independent; a later driver re-call
  // no-ops via pl.mulliganed). The extra card is drawn AFTER the normal 10 (and after the mulligan), g.rng-ordered
  // (the deck is already shuffled). HONEST: aiMulliganPlan reads only the AI's own hand — no opponent info.
  for (const pi of [0,1]){ const pl=g.players[pi], d=difficultyOf(pl);
    if (d.autoMulligan) mulligan(g, pi, aiMulliganPlan(g, pi));
    if (d.extraCard>0)  pl.hand.push(...pl.deck.splice(0, d.extraCard)); }
  g.firstThisRound = g.turn;
  log(g, `Cosmic Realm: ${REALM_INFO[g.realm].name} — ${REALM_INFO[g.realm].fx}`);
  { const nm=g.players[g.turn].name; log(g, `Coin flip \u2014 ${nm} ${nm==='You'?'play':'plays'} first.`); }
  onTurnStart(g, g.turn);
  return g;
}

function log(g, msg){ g.log.push({ round:g.round, msg }); }
/* Structured event stream — the UI choreographs these SEQUENTIALLY. Purely OBSERVATIONAL:
   emit() never touches game state or g.rng, so outcomes are byte-identical whether or not g.events
   is consumed. Every damage / buff / destroy / revive / trigger / token / faction-passive emits one. */
function emit(g, type, o){
  o = o||{};
  if (!g.events) g.events = [];
  g.events.push({ round:g.round, seq:g.events.length, type,
    sourceUid: o.sourceUid==null?null:o.sourceUid,
    targetUids: o.targetUids||[], amount: o.amount==null?null:o.amount,
    abilityName: o.abilityName||null, text: o.text||null });
}

/* ---------- power & shields ---------- */
function indraOnBoard(pl){ return pl.heroes.some(h=>h.id==='indra'); }
function effPower(g, pi, c){
  if (c.t==='hero') return c.power + ((g.realm==='swarga' && realmActiveFor(g,pi))?1:0);   // Swarga realm: all Heroes +1 (R61: gated on the hero owner's realm-enabled state)
  // EXP-G (ruling revision): Kumbhakarna's power DOES count while asleep — 'asleep' now only defers his wake-sweep.
  let p = c.power;
  if (!c.ghost && indraOnBoard(g.players[pi])) p += 1;   // Indra aura (Deva)
  if (!c.ghost && c.id==='warrior'){                     // Vanara Warrior: +1 per other Vanara Unit (max +4)
    const n = g.players[pi].units.filter(u=>!u.ghost && u!==c).length;
    p += Math.min(4, n);
  }
  if (!c.ghost && c.id==='nagawarrior') p += venomTokenCount(g);   // Naga Warrior: +1 per Venom Token on the board
  // Setu Mason (Vanara, batch 10): +1 while adjacent to another friendly Unit (R27 adjacency = index neighbours). Read-time, non-recursive presence check; adjacentUnits already excludes self.
  if (!c.ghost && c.id==='setumason'){ const su=g.players[pi].units, si=su.indexOf(c), sl=su[si-1], sr=su[si+1]; if (sl && sr && !sl.ghost && !sr.ghost) p += 3; }   // R40(b)/R68/R81 (design round 3, CONDITIONAL — ARMED: Vanara still −6.5 after rung one): +3 (was +2, was +1) while flanked by non-ghost Vanaras on BOTH sides. Read-time, non-recursive.
  if (!c.ghost && c.id==='gaja'){ const mine=g.players[pi].units.filter(u=>!u.ghost).length, theirs=g.players[1-pi].units.filter(u=>!u.ghost).length; if (mine>theirs) p += 1; }   // WAVE 1 batch 11 — +1 while your board is WIDER (strict inequality; ghosts/tokens counted per R40 non-ghost reading). Read-time, re-evaluates.
  if (!c.ghost){ const bp=g.players[pi]; if (bp.dawnBannerFrom>0 && g.round>=bp.dawnBannerFrom) p += 1; }   // WAVE 1 batch 12 — Dawn Banner: +1 to ALL your non-ghost Units, active from the round AFTER it was played (no retroactive), every round thereafter (compounding, SIM-flagged). Read-time aura; the functional form of "round start: all friendly +1 this round" given the board is EMPTY at round start.
  // ---- WAVE 1 batch-4 passive auras (card-id-gated → these branches are unreachable unless a wave-1 card is on the board) ----
  const pl4 = g.players[pi];
  // Ushas, Dawn Herald: your OTHER Units at CURRENT (stored) power ≤2 gain +1. 'current' = c.power at eval (non-recursive: a mutation-buff to 3 exits the aura, a drain to ≤2 enters it). Ushas is p3, never self-buffs.
  if (!c.ghost && c.id!=='ushas' && c.power<=2 && pl4.units.some(u=>!u.ghost && u.id==='ushas')) p += 1;
  // Vigil Rakshak: +2 while shielded (real Dharma Shield state via isShielded).
  if (!c.ghost && c.id==='vigilrakshak' && isShielded(g,pi,c)) p += 2;
  // Shumbha / Nishumbha bonded pair: +1 while the partner is on your board (presence check → no feedback loop, no double-count).
  if (!c.ghost && c.id==='shumbha'   && pl4.units.some(u=>!u.ghost && u.id==='nishumbha')) p += 1;
  if (!c.ghost && c.id==='nishumbha' && pl4.units.some(u=>!u.ghost && u.id==='shumbha'))   p += 1;
  return p;
}
/* EXP-A (GDD-accurate Dharma Shield): the shield is a STICKY designation, not dynamic re-targeting.
   At each shield opportunity (a Deva Unit hitting the board) an open slot latches onto the highest-power
   unshielded Unit and STAYS there for the round — even if a bigger Unit arrives later or the shielded one
   dies (the shield dies with it). Dharma Kavacha = 2 sticky slots. */
function shieldCap(pl){ return (pl.artifact && pl.artifact.id==='kavacha' ? 2 : 1) + (pl.vediShieldGrants||0); }   // WAVE 1: Vedi Keeper adds +1 bonus Dharma Shield this round (R25 FALLBACK — shields are already action-free, so the grant = extra cap available/applied instantly this round; expires at round end)
function designateShields(g, pi){
  const pl = g.players[pi];
  if (pl.faction!=='devas') return;
  if (pl.manualShield) return;   // human designates Dharma Shield manually (see designateShield) — no auto-assignment
  const cap = shieldCap(pl);
  while (pl.shieldUids.length < cap){
    const oppMahapadma = g.players[1-pi].units.some(u=>!u.ghost && u.id==='mahapadma');   // WAVE 1 batch 13: Mahapadma — the enemy's venomed Units cannot receive Dharma Shield
    const cands = pl.units.filter(u=>!u.ghost && !u.noShield && !pl.shieldUids.includes(u.uid) && !(oppMahapadma && u.venom>0));   // WAVE 1: Dawn's Rebirth noShield + Mahapadma venom-block
    if (!cands.length) break;
    const pick = cands.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b);   // AI designates highest-power
    pl.shieldUids.push(pick.uid);
    emit(g,'toast',{abilityName:'Dharma Shield',text:'Dharma Shield'});
    emit(g,'shield',{targetUids:[pick.uid],abilityName:'Dharma Shield',text:`${pick.n} shielded`});
  }
}
// Manual Dharma Shield designation (human): sticky (EXP-A), one Unit per call, up to cap (Kavacha=2). No un-designate.
function designateShield(g, pi, uid){
  const pl = g.players[pi];
  if (pl.faction!=='devas' || pl.shieldUids.length >= shieldCap(pl)) return false;
  const u = pl.units.find(x=>!x.ghost && x.uid===uid && !x.noShield && !pl.shieldUids.includes(uid));   // WAVE 1: Dawn's Rebirth's returned Unit cannot be shielded this match
  if (!u) return false;
  if (u.venom>0 && g.players[1-pi].units.some(m=>!m.ghost && m.id==='mahapadma')) return false;   // WAVE 1 batch 13: Mahapadma — a venomed Unit cannot receive Dharma Shield
  pl.shieldUids.push(uid);
  log(g, `${pl.name} raises Dharma Shield over ${u.n}.`);
  emit(g,'toast',{abilityName:'Dharma Shield',text:'Dharma Shield'});
  emit(g,'shield',{targetUids:[uid],abilityName:'Dharma Shield',text:`${u.n} shielded`});
  return true;
}
function shieldedSet(g, pi){
  // Dharma Shield is the DEVA faction passive — Asura (and other) units never hold it.
  const pl = g.players[pi];
  if (pl.faction!=='devas') return new Set();
  const set = new Set(pl.shieldUids);                         // sticky designations (dead uids harmlessly ignored)
  for (const u of pl.units) if (!u.ghost && u.revivedShield) set.add(u.uid); // Gayatri revival shield
  for (const u of pl.units) if (u.noShield) set.delete(u.uid);  // WAVE 1: Dawn's Rebirth's returned Unit is unshieldable this match — beats any path (manual/auto/Gayatri revive)
  return set;
}
function isShielded(g, pi, c){ return shieldedSet(g, pi).has(c.uid); }

/* ---------- Vanara: faction helpers, positioning, LEAP ---------- */
function heroOnBoard(pl, id){ return pl.heroes.some(h=>h.id===id); }
function hasUnit(pl, id){ return pl.units.some(u=>!u.ghost && u.id===id); }
// Bali's on-entry bonus: +1, or +2 while Jambavan is on the board; 0 without Bali.
function hanumanEntryBonus(pl){ return heroOnBoard(pl,'hanuman') ? (hasUnit(pl,'jambavan')?2:1) : 0; }
// Rama's Signet active for a Vanara player.
function signetActive(pl){ return pl.faction==='vanaras' && pl.artifact && pl.artifact.id==='ramasignet'; }
// Positioning: Units occupy ordered slots in pl.units (index = position). Adjacency = array neighbours.
function adjacentUnits(pl, unit){
  const i = pl.units.indexOf(unit); if (i<0) return [];
  return [pl.units[i-1], pl.units[i+1]].filter(Boolean);
}
// R40/R49 INTERIOR predicate: non-ghost friendly Units on BOTH adjacent sides (the Setu Mason pattern). Edges/lone/ghost-flanked → false.
function flankedBothSides(pl, unit){ const a=pl.units, i=a.indexOf(unit); const l=a[i-1], r=a[i+1]; return !!(l && r && !l.ghost && !r.ghost); }
// WAVE 1 batch 10 (positional tier) — R27 move/place primitive. "Row" = the ordered units array; position = index; adjacency = index neighbours (adjacentUnits). No new spatial model.
function moveUnit(g, pi, unit, toIndex){        // relocate a Unit to a bounded index: splice-out + clamped splice-in. uid/power/state UNTOUCHED (same object reference). Adjacency passives re-evaluate at read-time (effPower). Ghost-safe.
  const pl=g.players[pi]; const i=pl.units.indexOf(unit); if (i<0) return false;
  pl.units.splice(i,1);
  const j=Math.max(0, Math.min(toIndex, pl.units.length));   // clamp into the post-removal array (bounds-safe)
  pl.units.splice(j,0,unit); return true;
}
function swapUnits(pl, a, b){                    // exchange two Units' POSITIONS only (Gavaksha) — indices move, everything else untouched.
  const ia=pl.units.indexOf(a), ib=pl.units.indexOf(b); if (ia<0||ib<0||ia===ib) return false;
  [pl.units[ia], pl.units[ib]] = [pl.units[ib], pl.units[ia]]; return true;
}
function boardEff(g, pi){ return g.players[pi].units.filter(u=>!u.ghost).reduce((s,u)=>s+effPower(g,pi,u),0); }   // total friendly board power (Gavaksha's AI swap heuristic)
function leapLimit(pl){ return 1 + ((pl.artifact && pl.artifact.id==='kishkindhacrown')?1:0) + (pl.heroes.some(h=>h.id==='anjana')?1:0); }   // TASK 17 — ADDITIVE composition (R-log): base 1 + Crown +1 + Anjana +1 → up to 3. Read-time (Anjana leaves → reverts same round, like Crown). Flag-off (no Anjana) = crown?2:1, byte-identical.
// LEAP: `leaper` copies `target`'s current power (§9: power only — not the shield). Crown → both +2. free = Mainda's bonus.
function doLeap(g, pi, leaper, target, free){
  const pl = g.players[pi];
  leaper.power = effPower(g, pi, target);
  log(g, `Leap! ${leaper.n} copies ${target.n} → ${leaper.power}.`);
  emit(g,'toast',{abilityName:'Leap',text:'Leap!'});
  emit(g,'buff',{sourceUid:leaper.uid,targetUids:[leaper.uid],amount:null,abilityName:'Leap',text:`copies ${target.n}`});
  if (pl.artifact && pl.artifact.id==='kishkindhacrown'){ leaper.power += 1; target.power += 1; log(g, `Kishkindha Crown: ${leaper.n} and ${target.n} both +1.`); emit(g,'buff',{targetUids:[leaper.uid,target.uid],amount:1,abilityName:'Kishkindha Crown',text:'+1'}); }   // EXP-E: +1/+1 (was +2/+2)
  if (!free) pl.leapsUsed++;   // R71 (design round 1): the Matanga next-leap arm/consume was REMOVED — Matanga now performs its own immediate free doLeap (see castMantra) and applies its +2 there. Crown still applies above on any real leap.
  onLeap(g, pi, leaper, target);   // WAVE 1 batch 11 — leap-event listeners (Kumuda / Rambha). id-gated → no-op flag-off, so launch Leaps (Mainda/Crown/standard) are byte-identical.
}
// WAVE 1 batch 11 (Leap/round-end tier) — PURE leap-event listener. Fires once per doLeap (every leap: standard, Mainda-free, and each Crown leap). id-gated → no state change unless Kumuda/Rambha is present.
function onLeap(g, pi, leaper, target){
  const pl=g.players[pi];
  // Kumuda: when it Leaps OR is Leapt to → +1 PERMANENTLY (base AND power, R21). One trigger per leap (it is leaper XOR target, never both).
  for (const u of [leaper, target]) if (u && !u.ghost && u.id==='kumuda'){ u.base+=2; u.power+=2; log(g,`Kumuda swells with the Leap: +2 (permanent) → ${u.power}.`); emit(g,'buff',{sourceUid:u.uid,targetUids:[u.uid],amount:2,abilityName:'Kumuda',text:'+2'}); }   // R75 (design round 2): +1→+2 constant-only; permanence class unchanged (base+power)
  // Rambha the Bold: ANY friendly (same-side) Leap → +1 PERMANENTLY. Her own leap counts (she is a friendly Unit leaping); this fires only on side pi so enemy leaps never touch her.
  for (const r of pl.units) if (!r.ghost && r.id==='rambha'){ r.base+=1; r.power+=1; log(g,`Rambha the Bold rises with the Leap: +1 (permanent) → ${r.power}.`); emit(g,'buff',{sourceUid:r.uid,targetUids:[r.uid],amount:1,abilityName:'Rambha the Bold',text:'+1'}); }
}
// AI helper: best beneficial (leaper, adjacent target) pair by power gain.
function bestLeap(g, pi){
  const pl = g.players[pi]; let best=null;
  // WAVE 1 batch 15 — Gandhamadana: your Leaps may TARGET him from ANYWHERE (ignores adjacency). Leaping FROM him is unchanged (uses his own adjacentUnits). flag-off `gandh` is empty → the target set is exactly adjacentUnits, so launch leaps are byte-identical.
  const gandh = pl.units.filter(u=>!u.ghost && u.id==='gandhamadana');
  for (const u of pl.units){
    if (u.ghost) continue;
    const targets = gandh.length ? adjacentUnits(pl, u).concat(gandh.filter(gm=>gm!==u)) : adjacentUnits(pl, u);
    const seen = new Set();
    for (const t of targets){
      if (t.ghost || t===u || seen.has(t.uid)) continue; seen.add(t.uid);   // dedup a Gandhamadana that is ALSO adjacent (no double-consider)
      const gain = effPower(g,pi,t) - effPower(g,pi,u);
      if (gain>0 && (!best || gain>best.gain)) best={ leaper:u, target:t, gain };
    }
  }
  return best;
}
function canLeap(g, pi){
  const pl = g.players[pi];
  return pl.faction==='vanaras' && pl.leapsUsed < leapLimit(pl) && !!bestLeap(g, pi);
}
function totalPower(g, pi){
  const pl = g.players[pi];
  let t = 0;
  for (const h of pl.heroes) if (!h.bound) t += effPower(g, pi, h);   // Takshaka+Nagapasha can bind a Hero (§9)
  for (const u of pl.units)  if (!u.bound) t += effPower(g, pi, u);   // Nagapasha-bound Units contribute 0
  return t;
}

/* ================= VENOM PIPELINE (Naga) — one ordered system =================
   Base drain (faction passive: enemy Units −N at each tick) + Venom Tokens (per-unit).
   Order per tick: pause check → passive drain → token drain → Ananta board-tokens → sweep.
   Amount is ADDITIVE (R11 Patala + Vasuki-R3 + Venom Strike); timing is round-end, or
   per-opponent-turn while Karkotaka is on the Naga board (R10). Signet/Pavamana counter tokens. */
function isNaga(pl){ return pl.faction==='nagas'; }
function nagaHasUnit(pl, id){ return pl.units.some(u=>!u.ghost && u.id===id); }
// Total Venom Tokens visible on the board (per-unit stacks both sides + Ananta board-coils). Naga Warrior scales on this.
function venomTokenCount(g){
  let n=0;
  for (let s=0;s<2;s++){ for (const u of g.players[s].units) if (!u.ghost) n+=(u.venom||0); n+=g.players[s].boardTokens; }
  return n;
}
// Per-Unit passive drain for Naga np this round (additive; ruling: Patala + Vasuki-R3 + Strike stack).
function drainAmount(g, np){
  const pl=g.players[np]; let amt=1;
  if (pl.artifact && pl.artifact.id==='patala') amt += g.round;            // R11: −(1+round)
  if (heroOnBoard(pl,'vasuki') && g.round===3) amt += 1;                   // Vasuki R3 passive → −2 base
  if (pl.venomStrike===g.round) amt += (heroOnBoard(pl,'vasuki')?3:2);     // Venom Strike this round → +2 (+3 w/Vasuki)
  return amt;
}
// A Venom power loss to unit u (owner pi). §9: Signet FLOORS friendly Vanara Units at 1 (the drain still applies,
// grinding them down — but never below 1, never destroyed). Token negation is handled separately in venomTokens (b).
// WAVE 1 batch 20 (R62) — Throne of the Second King: when an ENEMY unit loses power to Venom, the Throne owner's highest-effPower
// friendly (heroes eligible) GAINS the actual power removed. R62c overkill excluded; R62d recipient re-evaluated per event, POWER-ONLY
// (base untouched); R62e no friendly presence → steal LOST; R62f uncapped. Own/Uraga self-drains fall out for free: for the owner's own
// drain the victim's owner IS the Throne owner, so 1-victimPi is the other side (no Throne) → no steal.
function secondThroneSteal(g, victimPi, before, u){
  const own = 1-victimPi; const art = g.players[own].artifact;
  if (!art || art.id!=='secondthrone') return;
  const actual = before - Math.max(0, u.power);                    // R62c: what venom actually removed (overkill on a dying unit does not transfer)
  if (actual <= 0) return;
  const pool = g.players[own].units.filter(x=>!x.ghost).concat(g.players[own].heroes.filter(h=>!h.ghost));
  if (!pool.length) return;                                        // R62e: no friendly presence at the event → the steal is lost, not banked
  const r = pool.reduce((a,b)=>effPower(g,own,a)>=effPower(g,own,b)?a:b);   // R62d: highest-effPower friendly (heroes eligible), per-event
  r.power += actual;                                               // R62d: POWER-ONLY (base untouched); R62f: uncapped
  log(g, `Throne of the Second King — ${r.n} drinks the stolen venom (+${actual}).`);
  emit(g,'buff',{targetUids:[r.uid],amount:actual,abilityName:'Throne of the Second King',text:`+${actual}`});
}
function venomLoss(g, pi, u, amt){
  const before=u.power;
  if (u.id==='holika') amt += 1;                             // WAVE1 R22: Holika suffers +1 from every non-Astra loss — venom included.
  if (signetActive(g.players[pi]) && u.t==='unit'){ u.power = Math.max(1, u.power - amt); if (g.wave1 && u.power<before) g.players[pi].lostPowerUids.add(u.uid); emit(g,'venom',{targetUids:[u.uid],amount:u.power-before,abilityName:'Venom',text:'☠'}); if (g.wave1) secondThroneSteal(g, pi, before, u); return; }   // §9 Signet: floor, not immunity
  u.power -= amt;
  if (u.power<1 && u.id==='hiranya') u.power=1;                            // Hiranyakashipu endures venom
  if (g.wave1 && u.power<before) g.players[pi].lostPowerUids.add(u.uid);   // WAVE 1 batch 16 — Iron Crucible: venom drain counts as a power loss (g.wave1-gated)
  emit(g,'venom',{targetUids:[u.uid],amount:u.power-before,abilityName:'Venom',text:'☠'});
  if (g.wave1) secondThroneSteal(g, pi, before, u);   // WAVE 1 batch 20 (R62) — the Throne of the Second King steal (g.wave1-gated → hot path pristine flag-off)
  // WAVE 1 batch 13 — Vishwapasha: the bind releases when the unit LOSES a Venom token (= suffers a venom drain while venomed). id-gated by the marker → no-op flag-off.
  if (u.bound && u.worldCoilBound && u.venom>0){ u.bound=false; u.worldCoilBound=false; log(g,`Vishwapasha's grip slips as the venom bites ${u.n} — it is freed.`); emit(g,'passive',{targetUids:[u.uid],abilityName:'Vishwapasha',text:'released'}); }
}
// PASSIVE drain: Naga np drains its opponent's surviving Units. Skips Astika-paused / Mohini-stolen Units.
function venomPassive(g, np, amtOverride){
  const opp=1-np, o=g.players[opp];
  if (o.astikaPause) return;
  const amt = amtOverride!=null ? amtOverride : drainAmount(g, np);   // EXP-L: Karkotaka per-turn tick passes a flat 1
  const foes=o.units.filter(u=>!u.ghost && u.stolenBy!==np);
  if (!foes.length) return;
  emit(g,'toast',{abilityName:'Venom',text:`Venom drains ${o.name}’s Units −${amt}`});
  for (const u of foes) venomLoss(g, opp, u, amt);
  log(g, `Venom drains ${o.name}’s Units −${amt} each.`);
}
// TOKEN drain (R13: drains bearer on any side) + Ananta board-tokens. Sarpa Satra doubles tokens on the caster's foes.
function venomTokens(g){
  for (let pi=0;pi<2;pi++){
    if (g.players[pi].astikaPause) continue;
    const dbl=g.players[1-pi].sarpaDouble ? 2 : 1;
    for (const u of g.players[pi].units){
      if (u.ghost || !u.venom) continue;
      if (signetActive(g.players[pi]) && u.t==='unit') continue;          // §9 (b): Venom Tokens are NEGATED on friendly Vanara Units
      venomLoss(g, pi, u, u.venom*dbl);
    }
  }
  for (let np=0;np<2;np++){                                                 // R14: Ananta Coil board-tokens (persist all match)
    const pl=g.players[np], opp=1-np;
    if (pl.boardTokens>0 && !g.players[opp].astikaPause){
      for (let k=0;k<pl.boardTokens;k++){
        const foes=g.players[opp].units.filter(u=>!u.ghost && u.stolenBy!==np);
        if (foes.length) venomLoss(g, opp, foes[Math.floor(g.rng()*foes.length)], 1);
      }
    }
  }
}
// EXP-L2 (R10 revision): while a Karkotaka Naga is on board, the drain is a SINGLE flat −1 tick fired the
// moment the first player passes each round (early snipe) — no longer per-opponent-turn. Escalation modifiers
// ride only the (non-Karkotaka) round-end tick. Called once, from pass(), on the first pass of the round.
function venomKarkotakaEarly(g){
  for (let np=0;np<2;np++){
    if (!isNaga(g.players[np]) || !nagaHasUnit(g.players[np],'karkotaka')) continue;
    const opp=1-np;
    if (g.players[opp].astikaPause){ g.players[opp].astikaPause=false; log(g, `Astika’s calm holds the venom back.`); continue; }
    venomPassive(g, np, 1);
  }
  sweepDeaths(g);
}
// The round-end tick (before scoring): non-Karkotaka Naga passives + all tokens. R1 death-at-0 via sweep.
function venomRoundEnd(g){
  for (let np=0;np<2;np++) if (isNaga(g.players[np]) && !nagaHasUnit(g.players[np],'karkotaka')) venomPassive(g, np);
  venomTokens(g);
  // WAVE 1 batch 13 — Uraga Colossus sheds 1 self-Venom each round (AFTER its tokens drained it; R13 self-drain already applied). id-gated → no-op flag-off.
  for (let s=0;s<2;s++) for (const u of g.players[s].units) if (!u.ghost && u.id==='uraga' && u.venom>0){ u.venom-=1; log(g,`Uraga Colossus sheds a coil of venom (→ ${u.venom} left).`); }
  g.players[0].astikaPause=false; g.players[1].astikaPause=false;
  sweepDeaths(g);
}

/* ---------- destruction / damage ---------- */
// \u00a79: Hiranyakashipu cannot be destroyed by any Astra \u2014 EXCEPT Brahmastra (which overrides immunity).
const ASTRA_KILL = new Set(['Vajra','Brahmastra','Pashupatastra']);
function isAstraImmune(unit, cause){ return unit.id==='hiranya' && ASTRA_KILL.has(cause) && cause!=='Brahmastra'; }

// WAVE 1 batch 9 (event-trigger tier) — PURE LISTENERS. Each is id-gated on wave-1 cards / flag-gated on new fields, so with wave1 off (none in the pool, no Curse armed) both are no-ops → destroyUnit and every revival site behave byte-identically.
function onUnitDeath(g, ownerPi, unit, cause){
  if (unit.ghost) return;                                       // Yama ghosts are not real Units (filtered by !u.ghost everywhere) — they don't feed these listeners; a Rakta token (ghost:false) does
  const owner=g.players[ownerPi], foe=g.players[1-ownerPi];
  // Kartikeya's Vanguard (Deva): the FIRST friendly (same-side) Unit destroyed each round → +2. Its own death cannot trigger it (it's already spliced off the board here, so find() won't see it — must survive to witness).
  if (!owner.vanguardTriggered){
    const v = owner.units.find(u=>!u.ghost && u.id==='vanguard' && u!==unit);
    if (v){ v.power+=2; owner.vanguardTriggered=true; log(g,`Kartikeya's Vanguard steels at ${unit.n}'s fall: +2 → ${v.power}.`); emit(g,'buff',{sourceUid:v.uid,targetUids:[v.uid],amount:2,abilityName:"Kartikeya's Vanguard",text:'+2'}); }
  }
  // WAVE 1 batch 18 — Nirmoka (Naga): when THIS Unit is destroyed → 1 Venom to the highest-power ENEMY Unit (effPower; tie first-found R31). A death listener (Vishalakshi precedent); `unit` is already spliced off, so `foe` = the enemy of Nirmoka's owner. Venom application (not damage).
  if (unit.id==='moltingnaga'){ const foes=foe.units.filter(u=>!u.ghost);
    if (foes.length){ const t=foes.reduce((a,b)=>effPower(g,1-ownerPi,a)>=effPower(g,1-ownerPi,b)?a:b); t.venom=(t.venom||0)+1; log(g,`Nirmoka's death-throes spit venom at ${t.n}.`); emit(g,'token',{targetUids:[t.uid],abilityName:'Nirmoka',text:'Venom Token'}); } }
  // Vishalakshi the Pale (Naga): an ENEMY Unit dying WITH Venom on it → +2 PERMANENTLY (R21: base AND power). Cause-agnostic; venom read here at the death choke point, still intact (destroyUnit never strips it). Stacks per qualifying death.
  if ((unit.venom||0) > 0){
    for (const p of foe.units) if (!p.ghost && p.id==='vishalakshi'){ p.base+=2; p.power+=2; log(g,`Vishalakshi feeds on ${unit.n}'s venom-death: +2 (permanent) → ${p.power}.`); emit(g,'buff',{sourceUid:p.uid,targetUids:[p.uid],amount:2,abilityName:'Vishalakshi the Pale',text:'+2'}); }
  }
  // Raktabija's Curse (Asura): the NEXT friendly (caster-side) destruction this round → spawn two REAL 2-power Rakta tokens (ghost:false, uid-safe via mkCard), then disarm. Tokens bypass playCard so on-ENTRY auras (Bali) do NOT apply; read-time effPower auras do.
  if (owner.raktabijaCurse){
    owner.raktabijaCurse=false;
    for (let i=0;i<2;i++){ const tok=mkCard({id:'rakta',n:'Rakta',sub:'Blood-born',t:'unit',p:2,r:'C',txt:'A blood-born token.',token:true}); owner.units.push(tok); }
    log(g,`Raktabija's Curse — ${unit.n}'s blood rises as two Rakta tokens.`);
    emit(g,'token',{abilityName:"Raktabija's Curse",text:'Two Rakta tokens rise'});
  }
}
function onUnitRevive(g, toPi, unit){
  // Simhika (Asura): an ENEMY Unit revived (returned to the OPPOSITE side from Simhika) → +2. Stacks (no once/round in the text). A revival to Simhika's OWN side does not trigger it.
  const foe=g.players[1-toPi];
  for (const s of foe.units) if (!s.ghost && s.id==='simhika'){ s.power+=2; log(g,`Simhika seizes the returning ${unit.n}: +2 → ${s.power}.`); emit(g,'buff',{sourceUid:s.uid,targetUids:[s.uid],amount:2,abilityName:'Simhika',text:'+2'}); }
}
function destroyUnit(g, pi, unit, cause){
  const pl = g.players[pi];
  if (isAstraImmune(unit, cause)){ log(g, `${unit.n} shrugs off the Astra \u2014 immune.`); emit(g,'block',{targetUids:[unit.uid],abilityName:cause,text:`${unit.n} immune`}); return; }
  // R8: Kishkindha Oath ward \u2014 the next destruction is prevented; unit survives at 1, others rally +1.
  if (unit.ward && !unit.ghost){
    unit.ward=false; unit.power=1;
    if (g.wave1) g.players[pi].lostPowerUids.add(unit.uid);   // WAVE 1 batch 16 \u2014 a warded survivor dropped to 1 = lost power this round (Iron Crucible regains it)
    log(g, `Kishkindha Oath \u2014 ${unit.n} refuses to fall, surviving at 1 power!`);
    emit(g,'ward',{targetUids:[unit.uid],abilityName:'Kishkindha Oath',text:`${unit.n} survives at 1`});
    for (const u of pl.units) if (!u.ghost && u!==unit) u.power+=1;
    return;
  }
  const ix = pl.units.indexOf(unit); if (ix<0) return;
  pl.units.splice(ix,1);
  pl.deathsThisRound = (pl.deathsThisRound||0) + 1;   // WAVE 1 batch 3: per-round death count (any cause; read only by Mahishasura when wave1 on — inert otherwise). Reset in endRound.
  log(g, `${unit.n} is destroyed (${cause}).`);
  emit(g,'destroy',{targetUids:[unit.uid],abilityName:cause,text:`${unit.n} destroyed`});
  onUnitDeath(g, pi, unit, cause);   // WAVE 1 batch 9 — fire death-listeners at the choke point (after the death, BEFORE the aegis revive): venom still intact for Vishalakshi; consistent with deathsThisRound (which counts an aegis death too)
  if (unit.aegis && !unit.ghost){
    unit.aegis=false; unit.power=1;
    pl.units.push(unit);
    log(g, `Amrita Kalasha revives ${unit.n} at 1 power!`);
    emit(g,'revive',{targetUids:[unit.uid],abilityName:'Amrita Kalasha',text:`${unit.n} revives at 1`});
    onUnitRevive(g, pi, unit);   // WAVE 1 batch 9 — revival choke #1 (Amrita aegis): an enemy Simhika sees this revival
    return;
  }
  if (!unit.ghost){
    pl.discard.push(unit);
    g.lastKillThisRound = { owner: pi, unit };            // for Sanjivani Corruption
    // R14: Ananta Coil — a destroyed friendly Naga Unit leaves a permanent Venom Coil (persists all match).
    if (pl.faction==='nagas' && pl.artifact && pl.artifact.id==='anantacoil'){ pl.boardTokens++; log(g, `Ananta Coil: ${unit.n}’s venom lingers on the field.`); emit(g,'passive',{abilityName:'Ananta Coil',text:'A Venom Coil lingers'}); }
    if (pl.units.some(u=>u.id==='yama')){
      pl.units.push({ uid:UID++, id:'ghost', n:`Ghost of ${unit.n}`, sub:'Yama\u2019s token', t:'unit', p:1, r:'C', power:1, base:1, ghost:true, txt:'' });
      log(g, `Yama binds a 1-power ghost of ${unit.n} to the row.`);
    }
  }
}
function damageUnit(g, pi, unit, amt, cause){
  if (ASTRA_DMG.has(cause) && g.players[pi].ratriRound===g.round){   // WAVE1 R22: Ratri Hymn — prevent ALL Astra DAMAGE (dmgAstra causes) to the caster's Units this round → 0. FIRST, so it beats Patala's +1 sharpening; only dmgAstra causes route here, so destroys/debuffs (Mohanastra)/venom/binds are untouched.
    log(g, `Ratri Hymn shrouds ${unit.n} — ${cause} deals no damage.`);
    emit(g,'block',{targetUids:[unit.uid],abilityName:'Ratri Hymn',text:`${unit.n} shielded from ${cause}`});
    return;
  }
  if (unit.id==='holika'){                                    // WAVE1 R22: Holika — immune to Astra damage; +1 from every other reduction.
    if (ASTRA_DMG.has(cause)){                                // dmgAstra source → 0 damage. Evaluated BEFORE the Patala +1, so immunity beats the realm sharpening.
      log(g, `${unit.n} walks unburnt through ${cause}.`);
      emit(g,'block',{targetUids:[unit.uid],abilityName:cause,text:`${unit.n} unburnt`});
      return;
    }
    amt += 1;                                                 // any non-Astra loss sharpened +1
  }
  if (g.realm==='patala' && ASTRA_DMG.has(cause) && realmActiveFor(g,1-pi)) amt += 1;   // Patala realm: all Astra damage +1 (R61: gated on the astra CASTER's realm-enabled state; for every ASTRA_DMG cause the victim pi is the caster's enemy → caster = 1-pi)
  unit.power -= amt;
  if (g.wave1) g.players[pi].lostPowerUids.add(unit.uid);     // WAVE 1 batch 16 \u2014 Iron Crucible: this Unit lost power this round (g.wave1-gated \u2192 hot damage path pristine flag-off)
  log(g, `${unit.n} takes ${amt} damage (${cause}) \u2192 ${Math.max(unit.power,0)}.`);
  emit(g,'damage',{targetUids:[unit.uid],amount:-amt,abilityName:cause,text:`\u2212${amt}`});
  if (unit.power<=0){
    if (isAstraImmune(unit, cause)){ unit.power=1; log(g, `${unit.n} endures the Astra \u2014 floors at 1.`); emit(g,'block',{targetUids:[unit.uid],abilityName:cause,text:`${unit.n} floors at 1`}); return; }
    // Rama's Signet: friendly Vanara Units cannot be reduced below 1 by any effect (damage floors, no death).
    if (!unit.ghost && signetActive(g.players[pi])){ unit.power=1; log(g, `Rama's Signet holds ${unit.n} at 1.`); emit(g,'block',{targetUids:[unit.uid],abilityName:"Rama's Signet",text:`held at 1`}); return; }
    destroyUnit(g, pi, unit, cause);
  }
}

/* R1 (RESOLVED): any Unit at 0 or less power is DESTROYED \u2014 generic enforcement so
   non-damage reductions (e.g. Venom Token round-end ticks) also trigger death effects. */
function sweepDeaths(g){
  for (let pi=0; pi<2; pi++){
    const pl=g.players[pi];
    for (const u of [...pl.units]) if (!u.ghost && u.power<=0) destroyUnit(g, pi, u, 'reduced to 0');
  }
}

/* Fires when player pi begins a turn. Home for start-of-turn passives and status ticks. */
function onTurnStart(g, pi){
  const pl=g.players[pi];
  if (g.over || pl.passed) return;

  // R3: Deva Soldier steels +1 each of your turns under Indra.
  if (indraOnBoard(pl)){
    for (const u of pl.units) if (!u.ghost && u.id==='soldier'){ u.power+=1; log(g, `${u.n} steels under Indra\u2019s banner (+1 \u2192 ${u.power}).`); }
  }
  // Tripura: any owner's Units gain +1 at the start of every turn (ends when an Astra is played).
  for (let s=0;s<2;s++){
    const p=g.players[s];
    if (p.artifact && p.artifact.id==='tripura'){
      const real=p.units.filter(u=>!u.ghost);
      if (real.length){ for (const u of real) u.power+=1; log(g, `Tripura\u2019s cities blaze \u2014 ${p.name}\u2019s host +1 (\u00d7${real.length}).`); emit(g,'buff',{targetUids:real.map(u=>u.uid),amount:1,abilityName:'Tripura',text:'+1'}); }   // Crown-precedent turn-start pulse emit \u2014 SHIPPED per STEP-0 check 4: onTurnStart runs inside afterAction (playCard/pass mutate) \u2192 evs-carried \u2192 the +1 floaters ride the existing buff machinery. Behavior-neutral (rule #7): no engine 'buff' consumer; quest readers abilityName-gated ('Leap'/'Chaos Surge'), never 'Tripura'.
    }
  }
  // Kumbhakarna wakes at the start of its owner's next turn: 3 damage to all enemy Units.
  for (const u of [...pl.units]){
    if (!u.ghost && u.id==='kumbha' && u.asleep){
      u.asleep=false;
      log(g, `Kumbhakarna wakes \u2014 3 damage to all enemy Units!`);
      for (const f of [...g.players[1-pi].units]) if (!f.ghost) damageUnit(g, 1-pi, f, 3, 'Kumbhakarna');
    }
  }
  // Kalanemi reveal at the start of your next turn: 2 damage to all enemy Units.
  for (const u of [...pl.units]){
    if (!u.ghost && u.id==='kalanemi' && u.revealPending){
      u.revealPending=false;
      log(g, `Kalanemi is unmasked \u2014 2 damage to all enemy Units!`);
      for (const f of [...g.players[1-pi].units]) if (!f.ghost) damageUnit(g, 1-pi, f, 2, 'Kalanemi');
    }
  }
  sweepDeaths(g);
}

/* CHAOS SURGE \u2014 Asura faction passive. Fires when the Asura player plays an Astra OR a Mantra (EXP-H):
   one random friendly Unit gains +3 (EXP-C). Chandrahas makes it fire twice while active. */
function chaosSurge(g, pi, times, amount=3){
  const pl=g.players[pi];
  if (pl.faction!=='asuras') return;
  for (let k=0;k<times;k++){
    const real=pl.units.filter(u=>!u.ghost);
    if (!real.length) continue;
    const u=real[Math.floor(g.rng()*real.length)];
    u.power+=amount;                                        // EXP-C: +3 from spells; EXP-I: +2 from Unit plays
    log(g, `Chaos Surge! ${u.n} +${amount} \u2192 ${u.power}.`);
    emit(g,'toast',{abilityName:'Chaos Surge',text: amount===1 ? 'Chaos finds a way\u2026' : 'Chaos Surge!'});
    emit(g,'buff',{sourceUid:u.uid,targetUids:[u.uid],amount,abilityName:'Chaos Surge',text:`+${amount}`});
  }
  pl.chaosThisRound=true;                                 // for Kali Asura
}

/* Runs after any Astra resolves (either player). Bana Asura / Asura Berserker counters,
   and Tripura's break condition. */
function onAstraResolved(g, astraPi, doubled){
  g.astraPlays += 1;                       // Berserker counter (per Astra card)
  g.astraBanaCount += doubled?2:1;         // Bana counter (doubled Astra counts twice \u2014 \u00a79)
  for (let s=0;s<2;s++){
    for (const u of g.players[s].units){
      if (u.ghost) continue;
      if (u.id==='bana'){ const inc=doubled?2:1; u.power+=inc; log(g, `Bana Asura\u2019s arms multiply (+${inc} \u2192 ${u.power}).`); emit(g,'buff',{sourceUid:u.uid,targetUids:[u.uid],amount:inc,abilityName:'Bana Asura',text:`+${inc}`}); }
      else if (u.id==='berserker'){ u.power+=1; log(g, `Asura Berserker rages (+1 \u2192 ${u.power}).`); emit(g,'buff',{sourceUid:u.uid,targetUids:[u.uid],amount:1,abilityName:'Asura Berserker',text:`+1`}); }
    }
  }
  for (let s=0;s<2;s++){
    const pl=g.players[s];
    if (pl.artifact && pl.artifact.id==='tripura'){ log(g, `An Astra shatters Tripura \u2014 the three cities fall.`); emit(g,'passive',{sourceUid:pl.artifact.uid,abilityName:'Tripura',text:'the three cities fall'}); pl.discard.push(pl.artifact); pl.artifact=null; }   // NINTH sibling-emit (Sanjivani Corruption/Vishwapasha/Vritra/Nagapasha/Ahamkara/Mrityunjaya/Sanjeevani Call/Mohini Trap) \u2014 observational (rule #7). Emitted BEFORE the discard push so pl.artifact.uid resolves; at choreo time the shattered Tripura is in the OWNER's discard, so ownerPiOfUid(sourceUid) anchors THE FALL on the owner's half (check 3). Either player's astra can shatter either side's Tripura \u2014 the uid carries the honesty.
  }
}

/* ---------- mantra effects (shared for Brihaspati copy) ---------- */
function castMantra(g, pi, id, targetUid=null){
  const pl=g.players[pi], opp=g.players[1-pi];
  if (id==='gayatri'){
    const units = pl.discard.filter(c=>c.t==='unit');
    if (!units.length){ log(g,'Gayatri Mantra: no fallen Unit to revive.'); return; }
    const lowest = units.reduce((a,b)=>a.base<=b.base?a:b);
    pl.discard.splice(pl.discard.indexOf(lowest),1);
    lowest.power = lowest.base; lowest.revivedShield = true;
    pl.units.push(lowest);
    onUnitRevive(g, pi, lowest);   // WAVE 1 batch 9 — revival choke #2 (Gayatri)
    log(g, `Gayatri Mantra revives ${lowest.n} at full power, shielded.`);
  } else if (id==='pavamana'){
    // GDD fidelity: (a) remove ALL debuffs (net power loss) AND Venom Tokens from ALL friendly Units;
    // (b) grant +1 power PER effect removed — one for the power-debuff, one per Venom Token. v0.1 dropped (b) for tokens.
    let cleansed=0, effects=0;
    for (const u of pl.units){
      if (u.ghost) continue;
      const deb = u.power < u.base ? 1 : 0;              // engine represents a debuff as net power below base
      const tok = u.venom||0;                            // each Venom Token is a removable effect
      if (deb+tok===0) continue;                         // nothing to cleanse — don't disturb clean / buffed Units
      if (deb) u.power = u.base;                          // (a) heal the net debuff (preserve any buff above base)
      u.venom = 0;                                        // (a) strip Venom Tokens
      u.power += deb + tok;                               // (b) +1 power PER effect removed
      effects += deb + tok; cleansed++;
    }
    log(g, cleansed ? `Pavamana purifies ${cleansed} Unit(s) — ${effects} effect(s) lifted, +1 power each.` : 'Pavamana: nothing to purify.');
  } else if (id==='mrityunjaya'){
    // R13: revive ANY destroyed Unit (either discard) onto your board at full power; it takes a Venom Token.
    const pool=[]; for (let s=0;s<2;s++) for (const u of g.players[s].discard) if (u.t==='unit' && !u.ghost) pool.push([s,u]);
    if (pool.length){ const [s,t] = targetUid!=null ? (pool.find(x=>x[1].uid===targetUid)||pool.reduce((a,b)=>a[1].base>=b[1].base?a:b)) : pool.reduce((a,b)=>a[1].base>=b[1].base?a:b);
      g.players[s].discard.splice(g.players[s].discard.indexOf(t),1);
      t.power=t.base; t.venom=1; t.bound=false; t.stolenBy=-1; t.aegis=false; t.revivedShield=false; t.ward=false; t.asleep=false; t.doomed=false; t.revealPending=false; t.astraImmuneRound=0;
      pl.units.push(t); emit(g,'passive',{targetUids:[t.uid],abilityName:'Mrityunjaya',text:'reborn'});   // observational emit (rule #7 — no state/rng touch) — SIXTH of the sibling family (Sanjivani Corruption/Vishwapasha/Vritra/Nagapasha/Ahamkara), carries the REVIVED unit's uid so the deathless-revival arrival VFX anchors at its cell. Behavior-neutral (no engine/story/quest consumer branches on 'passive'); the type field disambiguates from the mantra's own 'play' event of the same abilityName.
      onUnitRevive(g, pi, t);   /* WAVE 1 batch 9 — revival choke #3 (Mrityunjaya) */ log(g, `Mrityunjaya wrests ${t.n} from death — it rises venom-marked (Token).`);
    } else log(g, 'Mrityunjaya: no fallen Unit to reclaim.');
  } else if (id==='sarpasatra'){
    const real=pl.units.filter(u=>!u.ghost);
    if (real.length){
      let sac = targetUid!=null ? real.find(u=>u.uid===targetUid) : null;
      if (!sac) sac = real.reduce((a,b)=>effPower(g,pi,a)<=effPower(g,pi,b)?a:b);   // default: offer the weakest
      const dmg = effPower(g,pi,sac);
      destroyUnit(g, pi, sac, 'Sarpa Satra');                                        // triggers Ananta Coil hook
      const foes=opp.units.filter(u=>!u.ghost);
      for (const f of [...foes]) damageUnit(g, 1-pi, f, dmg, 'Sarpa Satra');
      pl.sarpaDouble=true;                                                           // Venom Tokens deal double this round
      log(g, `Sarpa Satra — ${sac.n} is offered; the enemy line withers −${dmg}, and Venom runs double this round.`);
    } else log(g, 'Sarpa Satra: no Naga Unit to sacrifice.');
  } else if (id==='sanjivani'){
    // Steal the opponent's last destroyed Unit this round; place it at original power for the Asura player.
    const lk=g.lastKillThisRound;
    if (lk && lk.owner===1-pi && opp.discard.includes(lk.unit)){
      const u=lk.unit; opp.discard.splice(opp.discard.indexOf(u),1);
      u.power=u.base; u.aegis=false; u.revivedShield=false; u.venom=0; u.asleep=false; u.doomed=false; u.revealPending=false;
      pl.units.push(u); g.lastKillThisRound=null;
      emit(g,'passive',{targetUids:[u.uid],abilityName:'Sanjivani Corruption',text:'stolen'});   // T98: observational emit (rule #7 — no state/rng touch) — fifth of the sibling family (Vishwapasha/Vritra/Nagapasha/Ahamkara), carries the ENTERING unit's uid so the dark-revival arrival VFX anchors at its cell. Behavior-neutral (no engine/story/quest consumer branches on 'passive'); the type field disambiguates from the mantra's own 'play' event of the same abilityName.
      onUnitRevive(g, pi, u);   // WAVE 1 batch 9 — revival choke #4 (Sanjivani Corruption: the stolen enemy corpse returns to the CASTER's side → an enemy Simhika on the other side sees it)
      log(g, `Sanjivani Corruption drags ${u.n} back to fight for ${pl.name}.`);
    } else log(g, 'Sanjivani Corruption: no fallen enemy Unit to steal.');
  } else if (id==='ahamkara'){
    const real=pl.units.filter(u=>!u.ghost);
    if (!real.length){ log(g, 'Ahamkara: no friendly Unit to inflame.'); }
    else {
      let t = targetUid!=null ? real.find(u=>u.uid===targetUid) : null;
      if (!t) t = real.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b);
      t.power*=2; t.doomed=true;
      emit(g,'passive',{targetUids:[t.uid],abilityName:'Ahamkara',text:'doomed'});   // T96: observational emit (rule #7 — no state/rng touch) — fourth of the sibling family (Vishwapasha/Vritra/Nagapasha), carries the chosen target's uid so the ego-arrival VFX can anchor. Behavior-neutral (no engine/story/quest consumer branches on 'passive').
      log(g, `Ahamkara doubles ${t.n} to ${t.power} — doomed to shatter at round end.`);
    }
  } else if (id==='ramanaam'){
    const buff = 2;   // EXP-D: flat +2 (dropped Bali upgrade)
    for (const u of pl.units) if (!u.ghost) u.power+=buff;
    log(g, `Rama Naam resounds — all Vanara Units +${buff}.`);
  } else if (id==='kishkindhaoath'){
    const real=pl.units.filter(u=>!u.ghost);
    if (!real.length){ log(g, 'Kishkindha Oath: no Vanara Unit to ward.'); }
    else {
      let t = targetUid!=null ? real.find(u=>u.uid===targetUid) : null;
      if (!t) t = real.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b);   // AI wards the strongest
      t.ward=true;
      log(g, `Kishkindha Oath wards ${t.n} — it will survive its next fall this round.`);
    }
  } else if (id==='savitur'){
    // WAVE 1 — Savitur Verse. A match-long enchant tracking ONE friendly Unit by uid (weakest reading, R21+): it buffs that
    // exact unit at each round end while it lives; if the unit is gone at a round end, nothing happens and it does NOT retarget.
    const real=pl.units.filter(u=>!u.ghost);
    if (!real.length){ log(g,'Savitur Verse: no Unit to bless.'); }
    else {
      let t = targetUid!=null ? real.find(u=>u.uid===targetUid) : null;
      if (!t) t = real.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b);   // AI enchants the strongest
      pl.saviturUids.push(t.uid);
      log(g, `Savitur Verse enchants ${t.n} — +1 at the end of every round.`);
    }
  } else if (id==='bloodoath'){
    // WAVE 1 batch 5 — Rudhira Bali (R84: was 'Blood Oath'). Destroy your lowest-EFFECTIVE-power Unit (tie: first-found, R31 symmetry), then draw up to 2.
    // Gated in playableIndices (needs a friendly non-ghost Unit); the guard here is defensive.
    const real=pl.units.filter(u=>!u.ghost);
    if (!real.length){ log(g,'Rudhira Bali: no Unit to offer.'); }
    else {
      const sac = real.reduce((a,b)=>effPower(g,pi,a)<=effPower(g,pi,b)?a:b);   // lowest effPower, tie → first-found (<=)
      destroyUnit(g, pi, sac, 'Rudhira Bali');                                    // REAL destroy → increments the CASTER's deathsThisRound; composes with every death hook (Ananta Coil, Vishalakshi, etc.)
      const drawn = pl.deck.splice(0, 1); pl.hand.push(...drawn);               // R67 (design round 1): draw UP TO 1 (was 2 — card-engine haircut; deck-permitting, empty → 0, no crash)
      log(g, `Rudhira Bali — ${sac.n} is offered to the pyre; ${pl.name} draws ${drawn.length}.`);
    }
  } else if (id==='dawnsrebirth'){
    // WAVE 1 batch 5 — Dawn's Rebirth (the wave's first Ratna; engine treats it identically to any mantra def — Ratna is a meta/ownership layer, not an engine gate).
    // Return the highest-PRINTED-power (base; R21 grown-is-grown) Unit from your discard at printed power; it can NEVER be shielded this match (noShield flag on the CARD object, persists through discard/revive).
    const units = pl.discard.filter(c=>c.t==='unit' && !c.ghost);
    if (!units.length){ log(g,'Dawn’s Rebirth: no fallen Unit to return.'); }   // empty discard → logged no-op (Gayatri/Sanjeevani precedent)
    else {
      const best = units.reduce((a,b)=>a.base>=b.base?a:b);   // highest printed power (base), tie → first-found (>=)
      pl.discard.splice(pl.discard.indexOf(best),1);
      best.power = best.base; best.revivedShield=false; best.venom=0; best.aegis=false; best.asleep=false; best.doomed=false; best.ward=false; best.bound=false; best.stolenBy=-1; best.astraImmuneRound=0;
      best.noShield = true;                                    // cannot be shielded for the REST OF THE MATCH — never cleared
      pl.units.push(best);
      onUnitRevive(g, pi, best);   // WAVE 1 batch 9 — revival choke #6 (Dawn's Rebirth)
      log(g, `Dawn’s Rebirth returns ${best.n} at its printed power — unshielded, undimmed.`);
    }
  } else if (id==='ratri'){
    pl.ratriRound = g.round;   // WAVE 1 batch 7 — round stamp; checked at the damageUnit choke point (dmgAstra causes → 0). Auto-expires next round.
    log(g, `Ratri Hymn falls like night — Astra fire cannot burn ${pl.name}’s Units this round.`);
  } else if (id==='mayaveil'){
    pl.mayaVeilRound = g.round;   // WAVE 1 batch 7 (RATNA) — round stamp; read by astraProtected → the owner's Units drop out of every targeted Astra's targetSpec this round (AoE still strikes). Auto-expires next round.
    log(g, `Maya Veil shrouds ${pl.name}’s Units — no Astra can single them out this round.`);
  } else if (id==='longpatience'){
    // WAVE 1 batch 8 (RATNA) — "skip your turn" simplified to normal Mantra turn economy (v0.2 note). Effect = the Nagastra
    // application pattern via the REAL venom pipeline: +1 Venom Token to EVERY enemy Unit. NOT Astra damage (no damageUnit):
    // Patala does not amplify it, Ratri Hymn does not stop it; Holika's venomLoss +1 sharpens the eventual DRAIN, not this application.
    const foes = opp.units.filter(u=>!u.ghost);
    for (const u of foes) u.venom=(u.venom||0)+1;
    if (foes.length){ emit(g,'token',{targetUids:foes.map(u=>u.uid),abilityName:'Visha Vayu',text:'Venom Token'}); log(g, `Visha Vayu settles over ${opp.name}’s ${foes.length} Unit(s) — Venom on each.`); }
    else log(g, 'Visha Vayu waits — no enemy Unit to envenom.');
  } else if (id==='hymndepths'){
    // WAVE 1 batch 18 — "All Venom drains trigger immediately, once." Fires the DRAIN half of the venom pipeline NOW (Karkotaka timing
    // precedent): each Naga player's passive drain (unless they run Karkotaka) + every token-bearer's token drain + a death sweep. Reuses
    // venomPassive/venomTokens/sweepDeaths (NOT the round-end shed/reset). Respects Astika's pause. Can cause venom-deaths mid-round.
    log(g, 'Hymn of the Depths rises — the deep drinks, and all venom bites at once.');
    for (let np=0;np<2;np++) if (isNaga(g.players[np]) && !nagaHasUnit(g.players[np],'karkotaka')) venomPassive(g, np);
    venomTokens(g);
    sweepDeaths(g);
  } else if (id==='raktabija'){
    pl.raktabijaCurse=true;   // WAVE 1 batch 9 — arm the listener: the NEXT friendly (caster-side) destruction this round spawns two Rakta tokens (in onUnitDeath). Unconsumed → expires at round end.
    log(g, `Raktabija's Curse is spoken — the next of ${pl.name}'s fallen will spill into two.`);
  } else if (id==='vault'){
    // WAVE 1 batch 10 (RATNA) — move a friendly Unit + it gains +2 this round (R34 current-power buff). Gated in playableIndices (needs a friendly Unit).
    const real=pl.units.filter(u=>!u.ghost);
    if (!real.length){ log(g,'Vault of the Sky: no Unit to lift.'); }   // defensive (gated)
    else {
      let t = targetUid!=null ? real.find(u=>u.uid===targetUid) : null;
      if (!t) t = real.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b);   // AI: lift the strongest
      // AI destination heuristic: move the buffed (strong) t adjacent to the WEAKEST ally — sets up a Leap where the weak unit copies the buffed strong one. Routes through the shared moveUnit primitive. Human free-"anywhere" destination is UI-DEFERRED (logged).
      const allies = pl.units.filter(u=>!u.ghost && u!==t);
      if (allies.length){ const weak=allies.reduce((a,b)=>effPower(g,pi,a)<=effPower(g,pi,b)?a:b); if (!adjacentUnits(pl,t).includes(weak)) moveUnit(g, pi, t, pl.units.indexOf(weak)); }
      // R77 (design round 3): AFTER the move resolves, the moved Unit AND its non-ghost DESTINATION neighbours each +2 PERMANENT (base+power, R21). Edge destination → one neighbour; lone → itself only. (adjacentUnits does NOT filter ghosts → filter here.)
      const recips = [t, ...adjacentUnits(pl, t).filter(u=>!u.ghost)];
      for (const u of recips){ u.base+=2; u.power+=2; }
      log(g,`Vault of the Sky lifts ${t.n}${recips.length>1?` and ${recips.length-1} neighbour(s)`:''} — +2 (permanent).`);
      emit(g,'buff',{sourceUid:t.uid,targetUids:recips.map(u=>u.uid),amount:2,abilityName:'Vault of the Sky',text:'+2'});
      // R77d composition: if the move completed a line-of-4, the R63 Bridge fires via afterAction/checkBridgeLine after this play resolves (no code here — automatic).
    }
  } else if (id==='shedskin'){
    // WAVE 1 batch 13 — bounce a friendly Unit to hand as a FRESH mkCard (v0.2 bounce ruling): printed base, no Venom/buffs/flags, new uid. R21 growth AND cut BOTH reset to printed. Tokens (no deck def) are gated out.
    const real=pl.units.filter(u=>!u.ghost && !u.token && CARD_BY_NAME[u.n]);
    if (!real.length){ log(g,'Rite of Shed Skin: no Unit to return.'); }   // gated in playableIndices; defensive
    else {
      let t = targetUid!=null ? real.find(u=>u.uid===targetUid) : null;
      if (!t) t = real.reduce((a,b)=>(effPower(g,pi,b)-b.p) < (effPower(g,pi,a)-a.p) ? b : a);   // AI: bounce the Unit furthest BELOW its printed power (the reset recovers the most)
      pl.units.splice(pl.units.indexOf(t),1);
      const fresh=mkCard(CARD_BY_NAME[t.n]); fresh.lockedRound=g.round;   // FRESH from the printed def; LOCKED this round (re-enters NEXT round) — prevents bounce-replay infinite loops (e.g. Brihaspati copying a bounce mantra to self-bounce)
      pl.hand.push(fresh);
      log(g,`Rite of Shed Skin — ${t.n} sheds its skin and returns to ${pl.name}'s hand, whole and new.`);
      emit(g,'passive',{sourceUid:fresh.uid,abilityName:'Rite of Shed Skin',text:`${t.n} returns to hand`});
    }
  } else if (id==='songcrossing'){
    // WAVE 1 batch 15 — R27-RESOLVED reading: there is exactly ONE row per player (the ordered units array), so the GDD "Units in one row" simplifies to ALL your non-ghost Units. +1 each; +2 each if you have 4+ Units. Current-power buff (R34, round-scoped emergent). Logged as the R27 resolution.
    const real=pl.units.filter(u=>!u.ghost);
    const amt = real.length>=4 ? 2 : 1;
    for (const u of real) u.power+=amt;
    if (real.length){ emit(g,'buff',{targetUids:real.map(u=>u.uid),amount:amt,abilityName:'Song of the Crossing',text:`+${amt}`}); log(g,`Song of the Crossing lifts ${real.length} Unit(s) — +${amt} this round.`); }
    else log(g,'Song of the Crossing echoes over an empty row.');
  } else if (id==='matanga'){
    // R71 (design round 1) — self-contained rework: an IMMEDIATE real doLeap (free=true → does NOT consume the round's leap limit,
    // R71e), then the leaper AND target each +2 THIS ROUND (current power, R34 — no permanence, R71d). onLeap listeners fire on this
    // leap (Kumuda/Rambha, R71a); Gandhamadana's anywhere-widening applies (bestLeap already includes it). Pair selection = the AI
    // bestLeap heuristic (R71b; human picker on the R50 deferral list). No beneficial leap pair → logged no-op (weakest reading, R71c).
    const bl = bestLeap(g, pi);
    if (bl){
      doLeap(g, pi, bl.leaper, bl.target, true);
      bl.leaper.power += 2; bl.target.power += 2;
      log(g, `Matanga's Blessing empowers the Leap — ${bl.leaper.n} and ${bl.target.n} both +2 this round.`);
      emit(g,'buff',{targetUids:[bl.leaper.uid,bl.target.uid],amount:2,abilityName:"Matanga's Blessing",text:'+2'});
    } else log(g,"Matanga's Blessing finds no Leap to bless.");
  }
  // Agni trigger — any mantra, either player
  for (let s=0;s<2;s++){
    if (g.players[s].heroes.some(h=>h.id==='agni')){
      const foes = g.players[1-s].units.filter(u=>!u.ghost);
      if (foes.length){
        const t = foes[Math.floor(g.rng()*foes.length)];
        log(g, `Agni (${g.players[s].name}) flares at the mantra!`);
        damageUnit(g, 1-s, t, 1, 'Agni');
      }
    }
  }
  g.lastMantra = id;
}

/* ---------- legality ---------- */
// Sharabha: the opponent cannot target the Vanara player's Units of power ≤3 with Astras.
function sharabhaProtected(g, ownerPi, unit){
  const pl=g.players[ownerPi];
  return !unit.ghost && pl.units.some(u=>!u.ghost && u.id==='sharabha') && effPower(g,ownerPi,unit)<=3;
}
// Any reason unit (owned by ownerPi) is an illegal Astra target: Dharma Shield, Sharabha, or Ulupi's round immunity.
function astraProtected(g, ownerPi, unit){
  return isShielded(g,ownerPi,unit) || sharabhaProtected(g,ownerPi,unit) || unit.astraImmuneRound===g.round
    || g.players[ownerPi].mayaVeilRound===g.round   // WAVE 1: Maya Veil — the owner's Units are untargetable by Astras this round (targeting layer). AoE resolutions iterate opp.units directly (never consult targetSpec/astraProtected) so they still strike.
    || (unit.id==='andhaka' && g.players[ownerPi].units.some(u=>!u.ghost && u!==unit));   // WAVE 1 batch 12: Andhaka — untargetable while ANY OTHER friendly Unit is on the board (targeting layer only; AoE pierces). Alone → targetable.
}

function playableIndices(g, pi){
  const pl=g.players[pi], opp=g.players[1-pi], res=[];
  pl.hand.forEach((c,i)=>{
    if (c.lockedRound===g.round) return;
    if (pl.mustPlayUnit && (c.t==='astra'||c.t==='mantra')) return;   // Naga Enchantress: next card must be a Unit
    if (c.t==='hero' && pl.heroPlayedThisRound) return;
    if (c.t==='astra'){
      if (opp.heroes.some(h=>h.id==='varuna') && pl.astrasThisRound>=1) return;
      if (c.id==='vajra'){
        const indra = indraOnBoard(pl);
        const targets = opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u) && (indra || effPower(g,1-pi,u)>=6));
        if (!targets.length) return;
      }
      if (c.id==='sudarshana' && !opp.heroes.length) return;
      if (c.id==='brahmastra' && !opp.units.some(u=>!u.ghost)) return;
      if ((c.id==='pashupata'||c.id==='nagastra'||c.id==='lankadahan'||c.id==='suryastra') && !opp.units.some(u=>!u.ghost)) return;   // WAVE 1 batch 14 — Suryastra is AoE: needs any enemy Unit (pierces protection, so no astraProtected filter)
      if (c.id==='gandiva' && !opp.units.some(u=>!u.ghost && !astraProtected(g,1-pi,u))) return;
      if (c.id==='agneyastra' && !opp.units.some(u=>!u.ghost && !astraProtected(g,1-pi,u))) return;   // WAVE 1 — illegal with no unprotected enemy Unit
      if (c.id==='shaktispear' && !opp.units.some(u=>!u.ghost && !astraProtected(g,1-pi,u) && effPower(g,1-pi,u)<=4)) return;   // WAVE 1 batch 12 — no enemy ≤4 → illegal
      if (c.id==='vayavyastra' && !opp.units.some(u=>!u.ghost && !u.token && CARD_BY_NAME[u.n] && !astraProtected(g,1-pi,u) && effPower(g,1-pi,u)<=4)) return;   // WAVE 1 batch 14 — no bounceable ≤4 → illegal
      if (c.id==='jatayu' && !opp.units.some(u=>!u.ghost && !astraProtected(g,1-pi,u) && effPower(g,1-pi,u)>6)) return;   // WAVE 1 batch 14 — no enemy >6 → illegal
      if (c.id==='vidyutastra' && !opp.units.some(u=>!u.ghost && !astraProtected(g,1-pi,u))) return;   // WAVE 1 batch 12 — no unprotected enemy → illegal
      if (c.id==='mohanastra' && !opp.units.some(u=>!u.ghost && !astraProtected(g,1-pi,u))) return;   // WAVE 1 — same: illegal with no unprotected enemy Unit
      if (c.id==='anjaneyaroar' && !opp.units.some(u=>!u.ghost) && !pl.units.some(u=>!u.ghost && flankedBothSides(pl,u))) return;   // WAVE 1 batch 15 / R49(a) — AoE −1 pierces protection (no astraProtected filter); illegal ONLY if BOTH effects whiff (no enemy Unit AND no INTERIOR friendly Unit)
      if (c.id==='sanjeevani'){ const lk=g.lastKillThisRound; if (!(lk && lk.owner===pi && pl.discard.includes(lk.unit))) return; }
      // ---- Naga astras ----
      if (c.id==='nagapasha'){
        const bindUnit = opp.units.some(u=>!u.ghost && !u.bound && !astraProtected(g,1-pi,u));
        const bindHero = heroOnBoard(pl,'takshaka') && opp.heroes.some(h=>!h.bound);   // §9 Takshaka
        if (!bindUnit && !bindHero) return;
      }
      if (c.id==='worldcoil' && !opp.units.some(u=>!u.ghost && !u.bound && !astraProtected(g,1-pi,u))) return;   // WAVE 1 batch 13 — no bindable enemy → illegal
      if (c.id==='kalakuta' && !opp.units.some(u=>!u.ghost && !astraProtected(g,1-pi,u))) return;   // WAVE 1 batch 18 — no unprotected enemy to envenom → illegal
      if (c.id==='serpentskiss' && !opp.units.some(u=>!u.ghost && (u.venom||0)>=2 && !astraProtected(g,1-pi,u))) return;   // WAVE 1 batch 18 — no enemy with 2+ Venom → illegal
      if (c.id==='mohini' && !opp.units.some(u=>!u.ghost && !u.bound && !astraProtected(g,1-pi,u))) return;
      // venomstrike is always legal (self-buff, useful even pre-emptively)
    }
    if (c.t==='mantra'){
      if (c.id==='gayatri' && !pl.discard.some(x=>x.t==='unit')) return;
      if ((c.id==='ahamkara'||c.id==='kishkindhaoath'||c.id==='savitur') && !pl.units.some(u=>!u.ghost)) return;   // WAVE 1 — Savitur needs a friendly Unit to enchant
      if (c.id==='sanjivani'){ const lk=g.lastKillThisRound; if (!(lk && lk.owner===1-pi && opp.discard.includes(lk.unit))) return; }
      if (c.id==='sarpasatra' && !pl.units.some(u=>!u.ghost)) return;
      if (c.id==='bloodoath' && !pl.units.some(u=>!u.ghost)) return;   // WAVE 1 — needs a friendly Unit to sacrifice (illegal otherwise). Dawn's Rebirth is intentionally NOT gated: it logs a no-op on an empty discard.
      if (c.id==='longpatience' && !opp.units.some(u=>!u.ghost)) return;   // WAVE 1 — no enemy Unit to envenom (Nagastra precedent)
      if (c.id==='hymndepths' && !(g.players[0].units.concat(g.players[1].units).some(u=>!u.ghost && (u.venom||0)>0) || (isNaga(pl) && opp.units.some(u=>!u.ghost)))) return;   // WAVE 1 batch 18 — legal only if a drain would land: some venomed Unit anywhere, OR a Naga caster with enemy Units (passive drain)
      if (c.id==='vault' && !pl.units.some(u=>!u.ghost)) return;   // WAVE 1 — needs a friendly Unit to move/buff
      if (c.id==='songcrossing' && !pl.units.some(u=>!u.ghost)) return;   // WAVE 1 batch 15 — buff-all-Units mantra: needs a friendly Unit (Matanga stays ungated — it arms a round flag that expires if unused, raktabija/ratri precedent)
      if (c.id==='shedskin' && !pl.units.some(u=>!u.ghost && !u.token && CARD_BY_NAME[u.n])) return;   // WAVE 1 batch 13 — needs a bounce-eligible friendly Unit (non-token, has a deck def)
      if (c.id==='mrityunjaya' && !g.players[0].discard.concat(g.players[1].discard).some(u=>u.t==='unit' && !u.ghost)) return;
    }
    res.push(i);
  });
  return res;
}

/* Targets a card needs (for UI): returns {kind, options} or null */
function targetSpec(g, pi, card){
  const opp=g.players[1-pi];
  if (card.id==='vajra'){
    const indra = indraOnBoard(g.players[pi]);
    return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u) && (indra||effPower(g,1-pi,u)>=6)) };
  }
  if (card.id==='gandiva') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u)) };
  if (card.id==='agneyastra') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u)) };   // WAVE 1 — same shield/immunity respect as Gandiva
  if (card.id==='shaktispear') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u) && effPower(g,1-pi,u)<=4) };   // WAVE 1 batch 12 — destroy-class, ≤4 CURRENT effPower (R32)
  if (card.id==='vayavyastra') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !u.token && CARD_BY_NAME[u.n] && !astraProtected(g,1-pi,u) && effPower(g,1-pi,u)<=4) };   // WAVE 1 batch 14 — bounce ≤4 (R32); token/ghost gated (no def to re-mint)
  if (card.id==='jatayu') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u) && effPower(g,1-pi,u)>6) };   // WAVE 1 batch 14 — destroy-class, >6 CURRENT effPower (inverse of Shakti Spear)
  if (card.id==='vinatastalon') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost) };   // WAVE 1 batch 14 — a Unit's on-play damage does NOT respect the astra-targeting layer (astraProtected is astra-only)
  if (card.id==='vidyutastra') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u)) };   // WAVE 1 batch 12 — deal-2, shield/immunity respect
  if (card.id==='dhanvantari') return { kind:'friendlyUnit', options: g.players[pi].units.filter(u=>!u.ghost && u.power<u.base) };   // WAVE 1 batch 12 — restore a damaged friendly
  if (card.id==='mohanastra') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u)) };   // WAVE 1 — single-target astra respects shield/immunity like Agneyastra
  if (card.id==='dhumraksha') return { kind:'friendlyUnit', options: g.players[pi].units.filter(u=>!u.ghost) };   // WAVE 1 — deal 1 to one of YOUR Units (self-targetable)
  if (card.id==='sudarshana') return { kind:'enemyHero', options:[...opp.heroes] };
  if (card.id==='saraswati' && opp.hand.length) return { kind:'oppHandCard', options:[...opp.hand] };
  if (card.id==='ahamkara' || card.id==='kishkindhaoath' || card.id==='sarpasatra' || card.id==='savitur') return { kind:'friendlyUnit', options: g.players[pi].units.filter(u=>!u.ghost) };
  // ---- Naga targeted cards ----
  if (card.id==='nagapasha'){
    let opts = opp.units.filter(u=>!u.ghost && !u.bound && !astraProtected(g,1-pi,u));
    if (heroOnBoard(g.players[pi],'takshaka')) opts = opts.concat(opp.heroes.filter(h=>!h.bound));   // §9 Takshaka breaks Hero immunity
    return { kind:'enemyUnit', options:opts };
  }
  if (card.id==='worldcoil') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !u.bound && !astraProtected(g,1-pi,u)) };   // WAVE 1 batch 13 — bind an unbound, unprotected enemy (Nagapasha pattern)
  if (card.id==='kalakuta') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u)) };   // WAVE 1 batch 18 — single-target venom, shield/immunity respect (Mohanastra pattern)
  if (card.id==='serpentskiss') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && (u.venom||0)>=2 && !astraProtected(g,1-pi,u)) };   // WAVE 1 batch 18 — destroy an enemy with 2+ Venom; respects astraProtected
  if (card.id==='mohini') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost && !u.bound && !astraProtected(g,1-pi,u)) };
  if (card.id==='ashvatara' || card.id==='nagaarcher' || card.id==='surpanakha') return { kind:'enemyUnit', options: opp.units.filter(u=>!u.ghost) };   // WAVE 1 — Surpanakha is a unit on-play debuff (NOT an astra) → does not respect Dharma Shield, like Ashvatara
  return null;
}

/* ---------- astra resolution (shared by normal + Chandrahas double) ---------- */
function resolveAstra(g, pi, c, targetUid){
  const pl=g.players[pi], opp=g.players[1-pi];
  switch(c.id){
    case 'vajra': {
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Vajra finds no mark.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      log(g,'Vajra falls!'); destroyUnit(g, 1-pi, t, 'Vajra'); break;
    }
    case 'agneyastra': {   // WAVE 1 — targeted deal-3. Respects astra targeting (shield/immunity) via targetSpec, like Gandiva.
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Agneyastra finds no mark.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      log(g,'Agneyastra erupts in fire!'); damageUnit(g, 1-pi, t, 3, 'Agneyastra'); break;   // cause='Agneyastra' → Patala +1 routes through the dmgAstra tag
    }
    case 'suryastra':   // WAVE 1 batch 14 — dmgAstra:true AoE: deal 2 to ALL enemy Units (Lanka Dahan pattern). Iterates opp.units directly → NEVER consults targetSpec, so Maya Veil / Dharma Shield / Andhaka DO NOT protect (AoE pierces). cause 'Suryastra' per unit → Patala +1, Holika 0, Ratri prevents.
      log(g,'Suryastra blazes — the sun scours the field.');
      for (const u of [...opp.units]) if (!u.ghost) damageUnit(g, 1-pi, u, 2, 'Suryastra'); break;
    case 'vayavyastra': {   // WAVE 1 batch 14 — bounce an enemy ≤4 CURRENT effPower to its OWNER's hand as a FRESH mkCard (v0.2 bounce ruling). NOT damage (no dmgAstra). Respects astraProtected + token/ghost gate.
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Vayavyastra finds no mark.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      opp.units.splice(opp.units.indexOf(t),1);
      const fresh=mkCard(CARD_BY_NAME[t.n]); fresh.lockedRound=g.round; opp.hand.push(fresh);   // lands in the OWNER's hand (no hand limit); LOCKED this round (re-enters NEXT round) — anti-loop + stronger tempo denial; fresh = printed base, no venom/buffs/flags, new uid
      log(g,`Vayavyastra hurls ${t.n} back to ${opp.name}'s hand.`); emit(g,'passive',{targetUids:[t.uid],abilityName:'Vayavyastra',text:'bounced'}); break; }
    case 'jatayu': {   // WAVE 1 batch 14 — DESTROY-class (NOT dmgAstra, R22): destroy an enemy Unit >6 CURRENT effPower (the inverse boundary of Shakti Spear ≤4). Respects astraProtected.
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Jatayu finds no mark.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      log(g,"Jatayu's last dive strikes true!"); destroyUnit(g, 1-pi, t, "Jatayu's Last Flight"); break; }
    case 'shaktispear': {   // WAVE 1 batch 12 — DESTROY-class (like Vajra/Gandiva, NOT dmgAstra): destroy an enemy Unit ≤4 CURRENT effPower (R32 symmetry). Respects astraProtected. Immunity-agnostic (destroys Holika, R22).
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Shakti Spear finds no mark.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);   // AI: the strongest legal (≤4) target
      log(g,'Shakti Spear flies true!'); destroyUnit(g, 1-pi, t, 'Shakti Spear'); break;
    }
    case 'vidyutastra': {   // WAVE 1 batch 12 — dmgAstra:true, deal 2 (cause 'Vidyutastra' → Patala +1, Holika immune-0, Ratri prevents). The DOUBLE Chaos Surge is in the astra branch (surge-count math), not here.
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Vidyutastra finds no mark.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      log(g,'Vidyutastra cracks like thunder!'); damageUnit(g, 1-pi, t, 2, 'Vidyutastra'); break;
    }
    case 'mohanastra': {   // WAVE 1 — targeted enemy −2 "this round". cause='Mohanastra' is NOT in ASTRA_DMG → NO Patala amplification; Holika sharpens it (+1, not immune). Chandrahas-doubled → resolveAstra runs twice → −4.
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Mohanastra finds no mind to cloud.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);   // AI: cloud the strongest
      log(g,'Mohanastra clouds the foe’s mind.'); damageUnit(g, 1-pi, t, 2, 'Mohanastra'); break;   // current-power −2 = round-scoped (units clear at round end; a revival restores base → the dent is wiped; NO separate restore mechanism, per the STEP-0 reading)
    }
    case 'anjaneyaroar': {   // WAVE 1 batch 15 / R49(a) — dmgAstra:FALSE (debuff, not damage → NOT in ASTRA_DMG, invariant unchanged): all enemy Units −1 this round + your INTERIOR Units +1. The −1 routes through damageUnit(cause "Anjaneya's Roar") so Holika SHARPENS it (+1 → −2, R22); Patala does NOT amplify (not in ASTRA_DMG); Ratri does NOT prevent (not dmgAstra). AoE iterates opp.units directly → pierces shield/Maya Veil (AoE convention, like Suryastra).
      log(g,"Anjaneya's Roar shakes the field — the son of the wind cries out.");
      for (const u of [...opp.units]) if (!u.ghost) damageUnit(g, 1-pi, u, 1, "Anjaneya's Roar");
      // R49(a) — "your Units flanked on both sides gain +1": INTERIOR only (R40 Mason pattern) — non-ghost friendly Units on BOTH adjacent sides. Edge/lone/ghost-flanked → nothing. Current-power (round-scoped).
      const paired = pl.units.filter(u=>!u.ghost && flankedBothSides(pl,u));
      for (const u of paired) u.power+=1;
      if (paired.length){ emit(g,'buff',{targetUids:paired.map(u=>u.uid),amount:1,abilityName:"Anjaneya's Roar",text:'+1'}); log(g,`Anjaneya's Roar rallies ${paired.length} flanked Unit(s): +1 this round.`); }
      break; }
    case 'brahmadanda':   // WAVE 1 batch 16 (RATNA) — arm a round-scoped negation on the CASTER (pi). Consumed by the opponent's NEXT Astra cast (its EFFECT is cancelled; per R37 erratum the enemy's Chaos Surge STILL procs and R37 Blueprint still acts — distinct source from Manasa, does NOT set surgeNegated). Expires unused at round end. No target; always castable (subject to Varuna/Angad like any Astra).
      pl.brahmadandaArmed = g.round;
      log(g,'Brahmadanda is raised — the next enemy Astra will be struck from the sky.'); break;
    case 'brahmastra':
      log(g,'BRAHMASTRA. The earth remembers, and trembles.');
      for (const u of [...opp.units]) destroyUnit(g, 1-pi, u, 'Brahmastra'); break;
    case 'sudarshana': {
      if (!opp.heroes.length){ log(g,'Sudarshana finds no Hero.'); break; }
      let t = targetUid!=null ? opp.heroes.find(h=>h.uid===targetUid) : null;
      if (!t) t = opp.heroes.reduce((a,b)=>a.power>=b.power?a:b);
      opp.heroes.splice(opp.heroes.indexOf(t),1); opp.removedHeroes.push(t);
      emit(g,'passive',{targetUids:[t.uid],abilityName:'Sudarshana',text:'removed'});   // T92: observational emit (rule #7 — no state/rng touch) so the temporary hero-removal is attributable + choreographable; behavior-neutral (no engine/story/quest consumer branches on 'passive')
      if (t.id==='vritra'){ for (const u of pl.units) if (u.vritraBound){ u.bound=false; u.vritraBound=false; log(g,`With Vritra gone, ${u.n} slips its bonds.`); emit(g,'passive',{targetUids:[u.uid],abilityName:'Vritra',text:'released'}); } }   // WAVE 1 batch 16 — "while Vritra remains": Vritra removed (the only hero-removal path, Sudarshana) → free its binds on the removing side's Units
      log(g,`Sudarshana Chakra removes ${t.n} for this round.`); break;
    }
    case 'pashupata': {
      const foes=opp.units.filter(u=>!u.ghost);
      if (!foes.length){ log(g,'Pashupatastra finds no target.'); break; }
      const total=totalPower(g,pi);
      const per=Math.max(1, Math.floor(total/foes.length));
      log(g,`Pashupatastra rains ${per} on each enemy Unit (board power ${total}).`);
      for (const u of [...foes]) damageUnit(g, 1-pi, u, per, 'Pashupatastra'); break;
    }
    case 'nagastra': {
      const foes=opp.units.filter(u=>!u.ghost);
      for (const u of foes) u.venom=(u.venom||0)+1;
      if (foes.length) emit(g,'token',{targetUids:foes.map(u=>u.uid),abilityName:'Nagastra',text:'Venom Token'});
      log(g, foes.length?`Nagastra envenoms ${foes.length} enemy Unit(s).`:'Nagastra hisses at empty air.'); break;
    }
    case 'tamasa':
      opp.skipNext=true;
      log(g, `Tamasa smothers ${opp.name}’s next turn.`); break;
    case 'gandiva': {
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Gandiva Arrow finds no mark.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      log(g,'Gandiva Arrow flies true!'); destroyUnit(g, 1-pi, t, 'Gandiva');
      if (pl.leapsUsed>0){                                    // a Vanara Leaped this round → a second shaft
        const more=opp.units.filter(u=>!u.ghost && !astraProtected(g,1-pi,u));
        if (more.length){ const t2=more.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b); log(g,'The Leap empowers a second shaft!'); destroyUnit(g, 1-pi, t2, 'Gandiva'); }
      }
      break; }
    case 'lankadahan':
      log(g,'Lanka Dahan blazes across the field.');
      for (const u of [...opp.units]) if (!u.ghost) damageUnit(g, 1-pi, u, 2, 'Lanka Dahan');
      for (const u of pl.units) if (!u.ghost) u.power+=1;
      log(g,'The fire inspires the host: all Vanara Units +1.'); break;
    case 'sanjeevani': {
      const lk=g.lastKillThisRound;
      if (lk && lk.owner===pi && pl.discard.includes(lk.unit)){
        const u=lk.unit; pl.discard.splice(pl.discard.indexOf(u),1);
        u.power=u.base; u.aegis=false; u.revivedShield=false; u.venom=0; u.asleep=false; u.doomed=false; u.ward=false;
        const hb = u.base>=4 ? hanumanEntryBonus(pl) : 0; if (hb) u.power+=hb;   // EXP-F: entry bonus only for printed ≥4
        pl.units.push(u); g.lastKillThisRound=null;
        emit(g,'passive',{targetUids:[u.uid],abilityName:'Sanjeevani Call',text: hb? `reborn +${hb}` : 'reborn'});   // observational emit (rule #7 — no state/rng touch) — SEVENTH of the sibling family (Sanjivani Corruption/Vishwapasha/Vritra/Nagapasha/Ahamkara/Mrityunjaya), carries the REVIVED unit's uid so the revival-arrival VFX anchors at its cell. FOLD RULING on record: the Bali entry bonus (EXP-F, printed >=4 gate; +1, +2 with Jambavan) is folded into u.power BEFORE the push — the unit arrives whole (no separate buff emit); text carries the folded amount so the arrival beat's floater can report it in the ripple window. Ordering: this emit precedes onUnitRevive so the arrival beat lands before any Simhika reaction emit in the same evs list. Behavior-neutral (STEP-0 consumer audit: nothing branches on 'passive').
        onUnitRevive(g, pi, u);   // WAVE 1 batch 9 — revival choke #5 (Sanjeevani Call)
        log(g,`Sanjeevani Call revives ${u.n} at full power${hb?` (+${hb} Bali)`:''}.`);
      } else log(g,'Sanjeevani Call: no fallen ally to revive.'); break; }
    // ---- Naga astras ----
    case 'nagapasha': {
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Nagapasha finds nothing to bind.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      t.bound=true;
      emit(g,'passive',{targetUids:[t.uid],abilityName:'Nagapasha',text:'bound'});   // T94: observational emit (rule #7 — no state/rng touch) — sibling-symmetry repair with Vishwapasha/Vritra bind emits; carries the bound target's uid so the bind-arrival VFX can anchor. Behavior-neutral (no engine/story/quest consumer branches on 'passive').
      log(g, `Nagapasha nooses ${t.n} — it cannot fight until ${opp.name} spends a turn to free it.`); break; }
    case 'worldcoil': {   // WAVE 1 batch 13 — bind an enemy Unit; releases when it LOSES a Venom token (venomLoss hook), NOT by the opponent spending a turn.
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Vishwapasha finds nothing to bind.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      t.bound=true; t.worldCoilBound=true;
      log(g, `Vishwapasha coils around ${t.n} — bound until the venom bites it.`); emit(g,'passive',{targetUids:[t.uid],abilityName:'Vishwapasha',text:'bound'}); break; }
    case 'kalakuta': {   // WAVE 1 batch 18 — dmgAstra:FALSE (venom application, NOT damage): apply 2 Venom to ONE enemy. Single-target → respects astraProtected (targetSpec, like Mohanastra). Patala does NOT amplify (not ASTRA_DMG), Ratri does not stop it (not damage), Holika's venomLoss sharpen hits the eventual DRAIN not the application.
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Kalakuta Vial finds no mark.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      t.venom=(t.venom||0)+2; log(g,`Kalakuta Vial shatters over ${t.n} — 2 Venom.`); emit(g,'token',{targetUids:[t.uid],amount:2,abilityName:'Kalakuta Vial',text:'2 Venom'}); break; }
    case 'serpentskiss': {   // WAVE 1 batch 18 — DESTROY-class (dmgAstra:FALSE, NOT damage — like Shakti Spear/Jatayu): destroy an enemy Unit with 2+ Venom. Immunity-agnostic (destroys Holika). Respects astraProtected.
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,"Serpent's Kiss finds no venom-ripe prey."); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);   // AI: the strongest legal (2+ venom) target
      log(g,"Serpent's Kiss sinks home!"); destroyUnit(g, 1-pi, t, "Serpent's Kiss"); break; }
    case 'venomstrike':
      pl.venomStrike=g.round;
      log(g, `Vasuki Venom Strike — the Venom runs ${heroOnBoard(pl,'vasuki')?'quadruple':'triple'} this round.`); break;
    case 'mohini': {
      const spec=targetSpec(g,pi,c);
      if (!spec.options.length){ log(g,'Mohini finds no mind to snare.'); break; }
      let t = targetUid!=null ? spec.options.find(u=>u.uid===targetUid) : null;
      if (!t) t = spec.options.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
      const ti=opp.units.indexOf(t);
      if (ti>=0){ opp.units.splice(ti,1); t.stolenBy=pi; t.origOwner=1-pi; pl.units.push(t);
        emit(g,'passive',{targetUids:[t.uid],abilityName:'Mohini Trap',text:'snared'});   // observational emit (rule #7 — no state/rng touch) — EIGHTH of the sibling family (Sanjivani Corruption/Vishwapasha/Vritra/Nagapasha/Ahamkara/Mrityunjaya/Sanjeevani Call), carries the SNARED unit's uid so the illusion-arrival VFX anchors at its NEW cell on the captor's board. Behavior-neutral (no engine/story/quest consumer branches on 'passive'). A live steal is NOT a revival: the case deliberately does NOT call onUnitRevive, so Simhika never triggers — the emit likewise carries no revival semantics.
        log(g, `Mohini’s illusion turns ${t.n} to ${pl.name}’s side (exempt from your Venom).`); }
      break; }
  }
}

/* ---------- play a card ---------- */
function playCard(g, pi, handIndex, targetUid=null, position=null, movePosition=null){   // movePosition (batch 10.5): Riksha's move-destination channel — additive, defaults null (position = ENTRY slot; movePosition = post-entry MOVE index). No launch caller passes it → byte-identical flag-off.
  const pl=g.players[pi], opp=g.players[1-pi];
  const c = pl.hand[handIndex];
  if (!c) throw new Error('bad hand index');
  pl.hand.splice(handIndex,1);
  pl.mustPlayUnit=false;                                   // consume Naga Enchantress restriction (this card satisfies it)
  log(g, `${pl.name} plays ${c.n}${c.sub?' \u2014 '+c.sub:''}.`);
  emit(g,'play',{sourceUid:c.uid,abilityName:c.n,text:`${pl.name} plays ${c.n}`});

  // R12: Surasa's trap on the opponent's next card \u2014 a Unit is sapped (\u22122) and feeds Surasa (+2); an Astra is negated.
  let surasaNegateAstra=false;
  if (opp.surasaTrap){
    const sur = opp.units.find(u=>u.uid===opp.surasaTrap && !u.ghost);
    if (c.t==='unit'){ c.power-=2; emit(g,'damage',{targetUids:[c.uid],amount:-2,abilityName:'Surasa'}); if (sur) sur.power+=2; opp.surasaTrap=false;   // T88b: observational emit (rule #7 \u2014 no state/rng touch) AFTER the play event so the story reads exists\u2192hurt; the trap's -2 is now attributable + choreographable (kill-on-entry legibility)
      log(g, `Surasa\u2019s trap saps ${c.n} (\u22122)${sur?` and feeds Surasa (+2 \u2192 ${sur.power})`:''}.`); }
    else if (c.t==='astra'){ surasaNegateAstra=true; opp.surasaTrap=false;
      log(g, `Surasa\u2019s trap swallows ${c.n} \u2014 its effect is negated (Chaos Surge still churns, \u00a79).`); }
    else { opp.surasaTrap=false; }                         // any other card springs and expires the trap harmlessly
  }

  if (c.t==='hero'){
    pl.heroes.push(c); pl.heroPlayedThisRound=true;
    if (c.id==='sugriva'){ const d=pl.deck.splice(0,1); pl.hand.push(...d); if(d.length) log(g,`Sugriva rallies: ${pl.name} draws a card.`); }   // Sugriva TRIGGERED
    if (c.id==='vasuki'){                                   // ON PLAY: all enemy Units lose 1 power
      const foes=opp.units.filter(u=>!u.ghost);
      for (const f of [...foes]) damageUnit(g, 1-pi, f, 1, 'Vasuki');
      log(g, foes.length?`Vasuki uncoils — the enemy line recoils (−1 each).`:`Vasuki uncoils over an empty field.`);
    }
    if (c.id==='shukra' && g.wave1){   // WAVE 1 batch 9.5 (LAUNCH-REPAIR — DEAD flag-off via g.wave1; the launch Shukracharya stays the vanilla-5 hero testers play). ON PLAY: revive a fallen friendly Unit at half its PRINTED power. "Once per game" is structural (a Hero enters once per match, persists, is never re-drawn).
      const units = pl.discard.filter(u=>u.t==='unit' && !u.ghost);
      if (units.length){
        // Hero plays are UNTARGETED in the engine (no Hero has a targetSpec case) → AI-style auto-pick the highest-base fallen friendly; targetUid honored defensively for future UI wiring. The PLAYER-CHOICE reading is DEFERRED (logged for the rulings queue).
        let t = targetUid!=null ? units.find(u=>u.uid===targetUid) : null;
        if (!t) t = units.reduce((a,b)=>a.base>=b.base?a:b);
        pl.discard.splice(pl.discard.indexOf(t),1);
        t.power = Math.max(1, Math.ceil(t.base/2));   // half PRINTED power, ceil (Nala precedent). base UNTOUCHED — a revival is not a permanence effect, so R21 does not apply to the revive amount (an R21-grown base revives at half the grown value).
        t.venom=0; t.aegis=false; t.revivedShield=false; t.ward=false; t.bound=false; t.stolenBy=-1; t.asleep=false; t.doomed=false; t.astraImmuneRound=0;
        pl.units.push(t);
        onUnitRevive(g, pi, t);   // WAVE 1 batch 9 — revival choke #9 (Shukracharya): an enemy Simhika sees this revival
        log(g, `Shukracharya's Mritasanjivani raises ${t.n} at half power (${t.power}).`);
      } else log(g, 'Shukracharya: no fallen Unit to revive.');
    }
    if (c.id==='vritra'){   // WAVE 1 batch 16 (THE FIRST WAVE HERO) — ON PLAY: bind an enemy Unit (0 contribution, totalPower skips bound). Uses the Nagapasha t.bound precedent + a distinct t.vritraBound marker (NOT worldCoilBound → venom-drain does NOT free it). R47: a HERO on-play is NOT an astra, so it IGNORES astraProtected (binds shielded/Andhaka/Maya-Veil units). AI: bind the strongest enemy Unit. FINDING: nothing DESTROYS a hero in current pools (only Sudarshana temporarily removes one → the bind lifts then); the bound Unit clears at round end regardless (units don't persist), so the bind is round-bound in practice. R20 manual unbind frees it (R45 flag-agnostic).
      const foes=opp.units.filter(u=>!u.ghost && !u.bound);
      if (foes.length){ let t = targetUid!=null ? foes.find(u=>u.uid===targetUid) : null;
        if (!t) t = foes.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
        t.bound=true; t.vritraBound=true;
        log(g,`Vritra the Withholder binds ${t.n} — it holds no power while Vritra endures.`);
        emit(g,'passive',{sourceUid:c.uid,targetUids:[t.uid],abilityName:'Vritra',text:'bound'}); }
      else log(g,'Vritra reaches out, but the enemy line is empty (or already bound).');
    }
    if (c.id==='makardhwaja'){   // WAVE 1 batch 17 (STEP 0b) — ON PLAY: copy strength (§9 rule: power = source's current effPower). Implemented DIRECTLY, NOT through doLeap (heroes live outside pl.units). Source = Bali if on board, else the strongest friendly UNIT. effPower copy folds in read-time auras (Dawn Banner, R43). READINGS (logged): this is NOT a formal Leap action → does NOT consume the leap limit (FREE, Mainda precedent), does NOT fire onLeap (Kumuda/Rambha read "friendly UNIT Leaps"; he is a hero) and the source is NOT "Leapt to", and does NOT consume Matanga's arm nor take Crown's +1. Pure copy.
      const hanuman = pl.heroes.find(h=>h.id==='hanuman');
      let source = hanuman || null;
      if (!source){ const units=pl.units.filter(u=>!u.ghost); source = units.length ? units.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b) : null; }
      if (source){ c.power = effPower(g, pi, source); log(g,`Makardhwaja leaps in ${source.n}'s shadow — his strength becomes ${c.power}.`); emit(g,'buff',{sourceUid:c.uid,targetUids:[c.uid],abilityName:'Makardhwaja',text:`copies ${source.n}`}); }
      else log(g,'Makardhwaja finds no strength to borrow — he enters at his printed power.');
    }
    if (c.id==='garuda'){   // WAVE 1 batch 19 (Deva hero) — ON PLAY: remove ALL Venom from your Units; each cleansed Unit gains +1 power PER token removed FROM IT (Pavamana venom-clause precedent — restore what venom took; NOT the debuff-heal, this is venom-only). A Garuda-himself-buff reading was rejected in favour of the per-unit Pavamana model (logged). Structural once/match (a Hero enters once).
      let removed=0;
      for (const u of pl.units){ if (u.ghost) continue; const t=u.venom||0; if (t>0){ u.venom=0; u.power+=t; removed+=t; if (t) emit(g,'buff',{sourceUid:c.uid,targetUids:[u.uid],amount:t,abilityName:'Garuda',text:`+${t}`}); } }
      log(g, removed ? `Garuda devours ${removed} Venom — his host rises +1 per token cleansed.` : 'Garuda spreads his wings — no venom to devour.');
    }
    if (c.id==='kulika'){   // WAVE 1 batch 19 (Naga hero) — ON PLAY: TRANSFER all your Units' Venom to RANDOM enemy Units (venom strip [Pavamana surface] + application [Nagastra] + g.rng). Weakest reading (logged): a "transfer" needs a destination — with NO enemy Units nothing happens (the venom stays on your side). Each transferred token → a random enemy (independent g.rng draws).
      const total = pl.units.reduce((n,u)=>n+(u.ghost?0:(u.venom||0)), 0);
      const foes = opp.units.filter(u=>!u.ghost);
      if (total>0 && foes.length){
        for (const u of pl.units) if (!u.ghost) u.venom=0;
        for (let i=0;i<total;i++){ const t=foes[Math.floor(g.rng()*foes.length)]; t.venom=(t.venom||0)+1; }
        log(g, `Kulika hurls ${total} Venom back upon ${opp.name}.`); emit(g,'token',{sourceUid:c.uid,targetUids:foes.map(u=>u.uid),abilityName:'Kulika',text:`${total} Venom transferred`});
      } else log(g, total>0 ? 'Kulika gathers the venom, but there is no enemy to curse (it stays).' : 'Kulika finds no friendly Venom to transfer.');
    }
  }
  else if (c.t==='unit'){
    // Mahabali (§9): the first Unit played the round after a VOLUNTARY Pass grants an extra turn.
    const mahaBonus = pl.mahabaliArm===g.round-1 && pl.heroes.some(h=>h.id==='mahabali');
    if (mahaBonus) pl.mahabaliArm=0;
    // The Setu Stones (batch 10): with the artifact active, a Unit ENTERS adjacent to a chosen anchor (targetUid → right after it). Overrides the position param; the AI/default path (aiPlacement, after-strongest) already places adjacent to a friendly, so no targetUid → no change. HUMAN anchor-picker is UI-deferred (engine honors targetUid; story/AI/sim live).
    if (pl.artifact && pl.artifact.id==='setustones' && targetUid!=null){
      const anchor=pl.units.find(u=>!u.ghost && u.uid===targetUid);
      if (anchor) position = pl.units.indexOf(anchor)+1;   // adjacent = right after the anchor (index-clamped by the check below)
    }
    // Positioning: insert at the chosen slot (Vanaras leverage adjacency; others just append).
    if (position!=null && position>=0 && position<=pl.units.length) pl.units.splice(position, 0, c);
    else pl.units.push(c);
    // Bali: every Unit the Vanara player plays gains +1 (or +2 with Jambavan) on entry.
    // EXP-F: Bali's entry bonus only applies to Vanara Units of printed power ≥4.
    if (pl.faction==='vanaras' && c.base>=4){ const hb=hanumanEntryBonus(pl); if (hb){ c.power+=hb; log(g,`Bali blesses ${c.n}: +${hb} on entry.`); } }
    switch(c.id){
      case 'surya': { const tgt=pl.units.filter(u=>u!==c && !u.ghost); for (const u of tgt) u.power+=1;
        if (tgt.length) emit(g,'buff',{sourceUid:c.uid,targetUids:tgt.map(u=>u.uid),amount:1,abilityName:'Chandra Dev',text:'+1'});
        log(g,'Chandra Dev: all other friendly Units +1.'); break; }
      // WAVE 1 — Aruna Charioteer. Weakest-defensible reading (R21+): "if Round 1" = the match's FIRST round (g.round===1) at play time; played R2+, no bonus.
      case 'aruna': if (g.round===1){ c.power+=2; log(g,'Aruna Charioteer rides the dawn: +2 (Round 1).'); emit(g,'buff',{sourceUid:c.uid,targetUids:[c.uid],amount:2,abilityName:'Aruna Charioteer',text:'+2'}); } break;
      case 'vedikeeper': pl.vediShieldGrants=(pl.vediShieldGrants||0)+1; log(g,'Vedi Keeper tends the altar — an extra Dharma Shield may be raised this round.'); break;   // WAVE 1 batch 7 (R25 fallback): +1 shield cap this round; the designateShields call at the end of this play (AI) or the human SHIELD button applies it instantly
      case 'dhanvantari': {   // WAVE 1 batch 12 — restore one friendly DAMAGED Unit to its PRINTED power (power=base; R21 grown base restores to the GROWN value). AI: most-damaged. None damaged → no-op.
        const dmg=pl.units.filter(u=>!u.ghost && u.power<u.base);
        if (dmg.length){ let t = targetUid!=null ? dmg.find(u=>u.uid===targetUid) : null; if (!t) t = dmg.reduce((a,b)=>(a.base-a.power)>=(b.base-b.power)?a:b);
          t.power=t.base; log(g,`Dhanvantari restores ${t.n} to full (${t.power}).`); emit(g,'buff',{sourceUid:c.uid,targetUids:[t.uid],amount:null,abilityName:'Dhanvantari',text:'restored'}); }
        else log(g,'Dhanvantari: no wounded Unit to mend.'); break; }
      case 'ribhu': pl.artifactShieldRound=g.round; log(g, pl.artifact ? `Ribhu Craftsman wards ${pl.artifact.n} — untargetable this round.` : 'Ribhu Craftsman readies a ward for your Artifact this round.'); break;   // WAVE 1 batch 7 — round-scoped Artifact protection (wired to Vishwakarma). Logs even with no Artifact yet (the ward is on the player for the round).
      case 'airavatacalf': if (designateShield(g, pi, c.uid)) log(g,'Airavata’s Calf enters wreathed in a Dharma Shield.'); else log(g,'Airavata’s Calf enters — no Dharma Shield available.'); break;   // WAVE 1 batch 7 (RATNA) — real shield-grant mechanism; respects the cap AND the noShield flag (a Dawn's-Rebirth Calf → designateShield refuses)

      case 'vayu': {
        const foes=opp.units.filter(u=>!u.ghost);
        if (foes.length){
          const t=foes.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
          // GDD Vayu (positioning now real): "swap positions with the highest enemy Unit" — adapted to
          // per-player rows as a DISPLACE that hurls it out of formation (breaks Vanara Leap adjacency), then -2.
          const ti=opp.units.indexOf(t);
          if (ti>=0){ opp.units.splice(ti,1); opp.units.push(t); log(g,'Vayu’s gale hurls it out of formation.'); }
          damageUnit(g,1-pi,t,2,'Vayu');
        }
        break; }
      case 'vishwakarma':
        // Yaksha Lok: Artifacts cannot be destroyed → Vishwakarma whiffs (no destroy, no +2 scaling all match).
        if (opp.artifact && g.realm==='yaksha' && realmActiveFor(g,1-pi)){ log(g,`Yaksha Lok shields ${opp.artifact.n} — Vishwakarma cannot unmake it.`); }   // R61: Yaksha protection is gated on the DEFENDER's (opp = 1-pi) realm-enabled state
        else if (opp.artifact && opp.artifactShieldRound===g.round){ log(g,`Ribhu Craftsman’s work shields ${opp.artifact.n} — Vishwakarma cannot unmake it.`); }   // WAVE 1: Ribhu Craftsman — Artifact untargetable this round (wired to the only artifact-destroyer in the pools)
        else if (opp.artifact){ log(g,`Vishwakarma unmakes ${opp.artifact.n}.`); opp.discard.push(opp.artifact); opp.artifact=null; pl.artifactsDestroyedByMe++; }
        if (pl.artifactsDestroyedByMe>0){ c.power += 2*pl.artifactsDestroyedByMe; log(g,`Vishwakarma stands at ${c.power}.`); }
        break;
      case 'kubera': {
        const drawn = pl.deck.splice(0,2); pl.hand.push(...drawn);
        log(g, `Kubera draws ${drawn.length} card(s).`);
        if (drawn.length===2 && drawn.every(d=>d.t==='unit')){ drawn.forEach(d=>d.power+=1); log(g,'Both were Units \u2014 each gains +1.'); }
        break; }
      case 'urvashi': {
        const withP = opp.hand.filter(h=>h.p>0);
        if (withP.length){ const t=withP.reduce((a,b)=>a.p>=b.p?a:b); opp.hand.splice(opp.hand.indexOf(t),1); opp.discard.push(t);
          log(g,`Urvashi\u2019s glance \u2014 ${opp.name} discards ${t.n}.`); }
        break; }
      case 'saraswati': {
        let t = targetUid!=null ? opp.hand.find(h=>h.uid===targetUid) : null;
        if (!t && opp.hand.length) t = opp.hand.reduce((a,b)=>a.p>=b.p?a:b);
        if (t){ t.lockedRound=g.round; log(g,`Narada locks ${t.n} for this round.`); }
        break; }
      case 'ashwini': {
        const wounded = pl.units.filter(u=>!u.ghost && u.power<u.base);
        if (wounded.length){ const t=wounded.reduce((a,b)=>(a.base-a.power)>=(b.base-b.power)?a:b);
          t.power=Math.min(t.base, t.power+2); log(g,`Ashwini Kumars heal ${t.n} \u2192 ${t.power}.`); }
        else log(g,'Ashwini Kumars: no wounds to heal.');
        break; }
      case 'marut': if (pl.units.some(u=>u.id==='vayu')){ c.power+=3; log(g,'Marut rides Vayu\u2019s wind: +3.'); } break;
      case 'gandharva': if (pl.units.filter(u=>!u.ghost).length>=4){ c.power+=2; log(g,'Gandharva\u2019s harmony: +2.'); } break; // itself + 3 others
      case 'brihaspati':
        if (g.lastMantra){ log(g,`Brihaspati repeats ${g.lastMantra==='gayatri'?'Gayatri Mantra':'Pavamana'}.`); castMantra(g, pi, g.lastMantra); }
        else log(g,'Brihaspati: no Mantra has been spoken yet.');
        break;
      // ---- Asura units ----
      case 'ravana': { const b=Math.min(5, opp.hand.length); c.power+=b; log(g,`Ravana feeds on the enemy hand: +${b}.`); break; }
      case 'kumbha': c.asleep=true; log(g,'Kumbhakarna slumbers — it will wake next turn.'); break;
      case 'meghnad':
        if (opp.heroes.length){ const t=opp.heroes.reduce((a,b)=>a.power>=b.power?a:b); t.power=Math.max(0,t.power-2); log(g,`Meghnad’s bolt strikes ${t.n} for 2 → ${t.power}.`); }
        else log(g,'Meghnad: no enemy Hero to strike.');
        break;
      case 'kalanemi': {
        c.revealPending=true;
        if (opp.hand.length) c.disguisedAs = opp.hand[Math.floor(g.rng()*opp.hand.length)].n;   // cosmetic disguise (UI)
        log(g,'Kalanemi slips into disguise.'); break; }
      case 'maricha': {
        const pool=[]; for (let s=0;s<2;s++) for (const u of g.players[s].units) if (!u.ghost && u!==c) pool.push([s,u]);
        if (pool.length){ const [,t]=pool.reduce((a,b)=>effPower(g,a[0],a[1])>=effPower(g,b[0],b[1])?a:b);
          c.id=t.id; c.n=t.n; c.sub=t.sub; c.r=t.r; c.txt=t.txt; c.base=t.base; c.power=t.power;
          log(g,`Maricha becomes ${t.n} (power ${t.power}).`); }
        else log(g,'Maricha finds no form to mimic.'); break; }
      case 'mayashade': {   // WAVE 1 batch 6 — copy your lowest-effPower OTHER Unit (Maricha FULL-OVERWRITE precedent). No other Unit → stays a vanilla P2 (logged no-op). Tie → first-found.
        const others=pl.units.filter(u=>!u.ghost && u!==c);
        if (others.length){ const t=others.reduce((a,b)=>effPower(g,pi,a)<=effPower(g,pi,b)?a:b);
          c.id=t.id; c.n=t.n; c.sub=t.sub; c.r=t.r; c.txt=t.txt; c.base=t.base; c.power=t.power;
          log(g,`Maya Shade takes the form of ${t.n} (power ${t.power}).`); }
        else log(g,'Maya Shade finds no Unit to mirror.'); break; }
      case 'dhumraksha': {   // WAVE 1 batch 6 — deal 1 to one of YOUR Units (doc: "your Units", self-targetable → always a target). Routes through damageUnit (non-astra cause 'Dhumraksha') so Holika sharpens it (+1).
        const friends=pl.units.filter(u=>!u.ghost);
        let t = targetUid!=null ? friends.find(u=>u.uid===targetUid) : null;
        if (!t){ const others=friends.filter(u=>u!==c); t = (others.length?others:friends).reduce((a,b)=>effPower(g,pi,a)<=effPower(g,pi,b)?a:b); }   // AI: lowest-effPower friendly OTHER than itself, else itself
        if (t){ log(g,`Dhumraksha's smoke gnaws at ${t.n}.`); damageUnit(g, pi, t, 1, 'Dhumraksha'); }
        break; }
      case 'surpanakha': {   // WAVE 1 batch 6 (RATNA) — enemy Unit −1 PERMANENTLY (R21: base AND power; shrunk is shrunk). No enemy → logged no-op. Tie → first-found.
        const foes=opp.units.filter(u=>!u.ghost);
        if (foes.length){ let t = targetUid!=null ? foes.find(u=>u.uid===targetUid) : null;
          if (!t) t = foes.reduce((a,b)=>effPower(g,1-pi,a)<=effPower(g,1-pi,b)?a:b);   // AI: lowest-effPower enemy (kill-potential via R21-down to 0)
          t.base-=1; t.power-=1;
          if (g.wave1) g.players[1-pi].lostPowerUids.add(t.uid);   // WAVE 1 batch 16 — Iron Crucible: a permanent cut is still a power loss this round (broad "lost power" reading)
          log(g,`Surpanakha's spite shrinks ${t.n} by 1 — permanently.`);
          emit(g,'damage',{sourceUid:c.uid,targetUids:[t.uid],amount:-1,abilityName:'Surpanakha',text:'−1'});
          sweepDeaths(g);   // R1 death-at-0: a permanent cut to ≤0 dies properly (destroyUnit → deathsThisRound++). Direct base/power mutation bypasses the damageUnit choke point → Holika sharpening does NOT apply to a base reduction (logged for rulings queue).
        } else log(g,'Surpanakha finds no enemy to scorn.'); break; }
      case 'vibhishana': pl.seesOppHand=g.round; log(g,`Vibhishana lays bare ${opp.name}’s hand.`); break;
      case 'tataka': {
        // R5 (RESOLVED): "lowest power Unit on the board — friendly or enemy" EXCLUDES Tataka herself
        // (a removal Unit shouldn't primarily suicide); can still hit your OTHER Units.
        const pool=[]; for (let s=0;s<2;s++) for (const u of g.players[s].units) if (!u.ghost && u!==c) pool.push([s,u]);
        if (pool.length){ let mn=Math.min(...pool.map(([s,u])=>effPower(g,s,u)));
          const cands=pool.filter(([s,u])=>effPower(g,s,u)===mn);
          const pick=cands.find(([s])=>s===1-pi)||cands[0];   // tie → prefer enemy
          log(g,`Tataka rends the weakest — ${pick[1].n}.`); destroyUnit(g, pick[0], pick[1], 'Tataka'); }
        break; }
      case 'kali': if (pl.chaosThisRound){ c.power+=3; log(g,'Kali Asura drinks the discord: +3.'); } break;
      case 'atikaya': { const d = pl.hasPassedThisMatch ? 2 : -2; c.power+=d;   // WAVE 1 batch 8 — entry-power modifier (power only, Aruna/Kaliya precedent; a revival restores base 6). "passed" = a VOLUNTARY match-long pass.
        log(g, pl.hasPassedThisMatch ? `Atikaya rises patient and vast: +2 → ${c.power}.` : `Atikaya rises restless: −2 → ${c.power}.`);
        emit(g,'buff',{sourceUid:c.uid,targetUids:[c.uid],amount:d,abilityName:'Atikaya',text:(d>0?'+2':'−2')}); break; }
      case 'berserker': if (g.astraPlays>0){ c.power+=g.astraPlays; log(g,`Asura Berserker enters raging (+${g.astraPlays}).`); } break;
      case 'bana': if (g.astraBanaCount>0){ c.power+=g.astraBanaCount; log(g,`Bana Asura enters many-armed (+${g.astraBanaCount}).`); } break;
      case 'naraka': {
        const foes=opp.units.filter(u=>!u.ghost);
        if (foes.length){ let stolen=0; for (const f of foes){ f.power-=1; stolen++; } c.power+=stolen;
          log(g,`Narakasura drains ${stolen} power from the enemy line (→ ${c.power}).`); }
        else log(g,'Narakasura: no enemy Units to drain.'); break; }
      // ---- Vanara units (passives — jambavan / sharabha / warrior — handled in helpers/effPower) ----
      case 'neela': { const buff = 1; const tgt=pl.units.filter(u=>!u.ghost); for (const u of tgt) u.power+=buff; emit(g,'buff',{sourceUid:c.uid,targetUids:tgt.map(u=>u.uid),amount:buff,abilityName:'Neela',text:`+${buff}`}); log(g,`Neela rallies the host: +${buff} to all Vanara Units.`); break; }   // EXP-D: flat +1 (dropped Sugriva upgrade)
      case 'kesari': { const h=pl.heroes.find(x=>x.id==='hanuman'); if (h){ c.power+=h.power; log(g,`Kesari swells with Bali’s might: +${h.power}.`); } break; }
      case 'tara': { const top=pl.deck.splice(0,3);
        if (top.length){ const keep=top.reduce((a,b)=>a.p>=b.p?a:b); pl.hand.push(keep); pl.deck.unshift(...top.filter(x=>x!==keep)); log(g,`Tara scouts the deck and keeps ${keep.n}.`); } break; }
      case 'swayamprabha': { const top=pl.deck.splice(0,3);   // WAVE 1 batch 5 — "take one to hand" = the Tara pattern (engine takes the highest-printed one, tie first-found; returns the rest to the top of the deck; a <3-card deck takes what's there, empty → nothing)
        if (top.length){ const keep=top.reduce((a,b)=>a.p>=b.p?a:b); pl.hand.push(keep); pl.deck.unshift(...top.filter(x=>x!==keep)); log(g,`Swayamprabha searches the hidden vale and takes ${keep.n}.`); } break; }
      case 'dwivida': { if (opp.hand.length){ const i=Math.floor(g.rng()*opp.hand.length); const d=opp.hand.splice(i,1)[0]; opp.discard.push(d); log(g,`Dwivida’s blade takes a card from ${opp.name}.`); } else log(g,'Dwivida: the enemy hand is empty.'); break; }
      case 'scout': { const others=pl.units.filter(u=>!u.ghost && u!==c).length; if (others) c.power+=others; pl.seesOppHand=g.round; log(g,`Vanara Scout eyes the foe (+${others}).`); break; }
      case 'sampati': { const oh=opp.hand;   // WAVE 1 batch 14 — narrower than Scout's full-hand seesOppHand: reveal ONE card (the highest-printed). Minimal honest info surface = a log line (no single-card reveal UI exists; the log is the info channel).
        if (oh.length){ const hi=oh.reduce((a,b)=>a.p>=b.p?a:b); log(g,`Sampati's sight reveals ${opp.name}'s strongest card: ${hi.n} (power ${hi.p}).`); }
        else log(g,'Sampati peers — the enemy hand is empty.'); break; }
      case 'vinatastalon': {   // WAVE 1 batch 14 — deal N hits of 1 to ONE enemy (N = floor(non-ghost friendlies/2), capped 3; SELF-INCLUSIVE — Talon is already on the board). N separate damageUnit hits → Holika sharpens EACH (+1/hit). Cause 'Vinata's Talon' (non-astra). Does NOT respect astraProtected (a Unit's on-play damage is NOT the astra-targeting layer — R22/Maya-Veil logic).
        const n=Math.floor(pl.units.filter(u=>!u.ghost).length/2);   // R74 (design round 2): UNCAPPED (was min(3,…)) — self-inclusive count, floor(n/2) hits, single target; Holika sharpens EACH hit at the new widths.
        const foes=opp.units.filter(u=>!u.ghost);
        if (n>0 && foes.length){ let t = targetUid!=null ? foes.find(u=>u.uid===targetUid) : null; if (!t) t=foes.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
          for (let k=0;k<n;k++) if (opp.units.includes(t) && !t.ghost) damageUnit(g, 1-pi, t, 1, "Vinata's Talon");
          log(g,`Vinata's Talon rakes ${t.n} — ${n} strike(s).`); }
        else log(g,`Vinata's Talon finds no purchase (${n} strikes, ${foes.length} foes).`); break; }
      case 'saranyu': {   // WAVE 1 batch 15 (Deva RATNA) — two OTHER friendly Units EXCHANGE current power (u.power↔u.power). BASES untouched → an R21-grown base does NOT move, only current values trade; Venom Tokens stay with the UNIT (only power swaps). Board-total-neutral (invariant preserved — the "positional cut"). Needs 2+ other friendly Units.
        const others=pl.units.filter(u=>!u.ghost && u!==c);
        if (others.length<2){ log(g,'Saranyu: not enough Units to exchange power.'); break; }
        // AI/auto pairing: exchange the highest- and lowest-CURRENT-power OTHER Units (board-neutral, like Gavaksha's AI swap). The HUMAN two-target picker is UI-DEFERRED (targetUid carries ONE target; a two-target flow is not built — logged).
        let hi=others[0], lo=others[0];
        for (const u of others){ if (u.power>hi.power) hi=u; if (u.power<lo.power) lo=u; }
        if (hi!==lo){ const hv=hi.power, lv=lo.power; hi.power=lv; lo.power=hv; log(g,`Saranyu — ${hi.n} and ${lo.n} exchange power (${hv}↔${lv}).`); emit(g,'buff',{targetUids:[hi.uid,lo.uid],abilityName:'Saranyu',text:'power exchanged'}); }
        else log(g,'Saranyu: the Units already share equal power — nothing to trade.'); break; }
      case 'drummer': { const adj=adjacentUnits(pl, c).filter(u=>!u.ghost); for (const u of adj){ u.base+=1; u.power+=1; }   // R69 (design round 1): PERMANENT +1 (base AND power, R21) to his non-ghost immediate neighbours at entry (was this-round current-power). 0 adjacent → no-op.
        if (adj.length){ emit(g,'buff',{sourceUid:c.uid,targetUids:adj.map(u=>u.uid),amount:1,abilityName:'Drummer of the Host',text:'+1'}); log(g,`Drummer of the Host rouses ${adj.length} adjacent Unit(s): +1 this round.`); }
        else log(g,'Drummer of the Host beats to an empty flank.'); break; }
      case 'gavaksha': {   // WAVE 1 batch 10 — MAY swap places with another friendly Unit. targetUid names the partner; AI swaps only if it raises total board effPower (e.g. next to a Setu Mason); else no-op.
        const others=pl.units.filter(u=>!u.ghost && u!==c);
        if (!others.length){ log(g,'Gavaksha finds no ally to trade places with.'); break; }
        let partner = targetUid!=null ? others.find(u=>u.uid===targetUid) : null;
        if (!partner && targetUid==null){   // AI heuristic (only when no explicit partner): try each swap, keep the best improvement
          const base=boardEff(g,pi); let best=null;
          for (const o of others){ swapUnits(pl, c, o); const e=boardEff(g,pi); if (e>base && (!best||e>best.e)) best={o,e}; swapUnits(pl, c, o); }
          if (best) partner=best.o;
        }
        if (partner){ swapUnits(pl, c, partner); log(g,`Gavaksha trades places with ${partner.n}.`); emit(g,'passive',{sourceUid:c.uid,abilityName:'Gavaksha',text:`swaps with ${partner.n}`}); }
        else log(g,'Gavaksha holds its ground.'); break; }
      case 'dadhimukha': { const d=pl.deck.splice(0,1); pl.hand.push(...d);
        if (pl.heroes.some(h=>h.id==='sugriva')){ for (const u of pl.units) if(!u.ghost) u.power+=1; log(g,'Dadhimukha draws; under Sugriva the host swells +1.'); }
        else log(g,'Dadhimukha draws a card.'); break; }
      case 'riksha': {
        if (pl.heroes.some(h=>h.id==='hanuman')){ c.power+=3; log(g,'Riksha fights beside Bali: +3.'); }   // EXISTING launch behavior (entry-time +3), UNCHANGED — NOT gated on wave1.
        if (g.wave1){   // WAVE 1 batch 10.5 (LAUNCH-REPAIR — DEAD flag-off via g.wave1): the printed "Move to any position on the row". Riksha has already entered at his played (or Stones-overridden) slot; now he relocates ONCE via the batch-10 moveUnit primitive (no parallel path).
          const allies = pl.units.filter(u=>!u.ghost && u!==c);
          if (allies.length){   // single Unit on board (only Riksha) → nowhere to go → structural no-op
            let dest;
            if (movePosition!=null) dest = movePosition;   // explicit index (its own channel: playCard's new movePosition param) — honored, moveUnit clamps it
            else { const strong=allies.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b); dest = pl.units.indexOf(strong); }   // AI destination = batch-10 Leap-setup heuristic: relocate adjacent to the highest-effPower friendly (Riksha becomes a leaper beside a strong target). Human free-choice picker = UI-DEFERRED (logged), engine live.
            moveUnit(g, pi, c, dest);
            log(g,'Riksha bounds to a new position on the row.');
          }
        }
        break; }
      case 'nala': {
        const inHand=pl.hand.filter(x=>x.t==='unit');
        if (inHand.length){ const low=inHand.reduce((a,b)=>a.base<=b.base?a:b);
          const tok=mkCard(low); tok.power=Math.max(1, Math.ceil(low.base/2)); tok.base=tok.power;
          const idx=pl.units.indexOf(c); pl.units.splice(idx+1, 0, tok);
          log(g,`Nala builds a bridge — a copy of ${low.n} joins at ${tok.power} power.`); }
        else log(g,'Nala: no Unit in hand to copy.'); break; }
      case 'mainda': { const adj=adjacentUnits(pl, c).filter(u=>!u.ghost);
        if (adj.length){ const t=adj.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b);
          if (effPower(g,pi,t)>effPower(g,pi,c)) doLeap(g, pi, c, t, true); else log(g,'Mainda: no stronger neighbour to vault from.'); }
        else log(g,'Mainda finds no adjacent ally.'); break; }
      // ---- Naga units ----
      case 'manasa': { const n=pl.units.filter(u=>!u.ghost).length; if (n){ c.power+=n; } log(g,`Manasa coils forth (+${n} for the serpent host); the opponent’s Astras now fizzle.`); break; }   // PASSIVE negation handled in astra branch
      case 'karkotaka': log(g,'Karkotaka takes the field — Venom bites the moment the first pass falls.'); break;   // R10 timing handled in venomKarkotakaTick
      case 'surasa': pl.surasaTrap=c.uid; log(g,`Surasa coils to strike — the opponent’s next card is trapped.`); break;   // R12
      case 'ulupi': {
        const units=pl.discard.filter(x=>x.t==='unit' && !x.ghost);
        if (units.length){ const t=units.reduce((a,b)=>a.base>=b.base?a:b);   // recall the strongest fallen Naga
          pl.discard.splice(pl.discard.indexOf(t),1);
          t.power=t.base; t.venom=0; t.bound=false; t.stolenBy=-1; t.aegis=false; t.ward=false; t.astraImmuneRound=g.round;
          pl.units.push(t); onUnitRevive(g, pi, t); /* WAVE 1 batch 9 — revival choke #7 (Ulupi) */ log(g,`Ulupi calls ${t.n} back from the deep — untouchable by Astras this round.`); }
        else log(g,'Ulupi: no fallen Naga to revive.'); break; }
      case 'nagasadhu': { const foes=opp.units.filter(u=>!u.ghost); for (const f of foes) f.venom=(f.venom||0)+1;
        if (foes.length) emit(g,'token',{sourceUid:c.uid,targetUids:foes.map(u=>u.uid),abilityName:'Naga Sadhu',text:'Venom Token'});
        log(g, foes.length?`Naga Sadhu envenoms all ${foes.length} enemy Unit(s).`:'Naga Sadhu: no enemy to poison.'); break; }
      case 'kaliya': { const b=g.round-1; if (b>0){ c.power+=b; log(g,`Kaliya rises many-headed (+${b}).`); } break; }   // R16
      case 'astika': pl.astikaPause=true; for (const u of pl.units) if (!u.ghost) u.power+=1;
        log(g,`Astika calls a truce — the next Venom tick is stayed and friendly Units recover +1.`); break;   // R19
      case 'nagaarcher': { const foes=opp.units.filter(u=>!u.ghost);
        if (foes.length){ let t = targetUid!=null ? foes.find(u=>u.uid===targetUid) : null; if (!t) t=foes.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
          damageUnit(g, 1-pi, t, 1, 'Naga Archer');
          if (opp.units.includes(t) && !t.ghost){ t.venom=(t.venom||0)+1; log(g,`The poison arrow festers in ${t.n}.`); emit(g,'token',{sourceUid:c.uid,targetUids:[t.uid],abilityName:'Naga Archer',text:'Venom Token'}); } }
        else log(g,'Naga Archer: no target.'); break; }
      case 'nagaenchantress': opp.mustPlayUnit=true; log(g,`Naga Enchantress lures — ${opp.name}’s next card must be a Unit.`); break;
      case 'nagawarrior': break;   // PASSIVE handled in effPower (venomTokenCount)
      case 'nagahatchling': if (opp.units.some(u=>!u.ghost && u.venom>0)){ c.power+=2; log(g,'Naga Hatchling feeds on the venom in the air (+2).'); } break;
      case 'nahusha':   // WAVE 1 batch 20 (R61) — ON PLAY: apply the Cosmic Realm to YOUR side only this round = SUPPRESS it on the ENEMY side (subtraction). Round-bound stamp (=== g.round, auto-expires next round). No active realm (Mrityulok) = no-op. Single realm → automatic, no picker. Re-entry via bounce re-triggers normally (R46 lock is the loop guard). Mirror: both Nahusha → each suppresses the other → realm dead both sides (R61e).
        if (g.realm && g.realm!=='mrityulok'){ opp.realmSuppressedRound = g.round; log(g,`Nahusha, Fallen King bends ${REALM_INFO[g.realm].name} to his side alone — ${opp.name} loses its blessing this round.`); emit(g,'passive',{sourceUid:c.uid,abilityName:'Nahusha, Fallen King',text:'realm suppressed'}); }
        else log(g,'Nahusha, Fallen King finds no realm-power to bend (Mrityulok).'); break;
      case 'patalahatchling': { const foes=opp.units.filter(u=>!u.ghost);   // WAVE 1 batch 18 — ON PLAY: 1 Venom to a RANDOM enemy (g.rng). Nagastra application precedent; not damage. No enemy → no-op.
        if (foes.length){ const t=foes[Math.floor(g.rng()*foes.length)]; t.venom=(t.venom||0)+1; log(g,`Patala Hatchling spits venom at ${t.n}.`); emit(g,'token',{sourceUid:c.uid,targetUids:[t.uid],abilityName:'Patala Hatchling',text:'Venom Token'}); }
        else log(g,'Patala Hatchling hisses at empty air.'); break; }
      case 'venomharvester': { const foes=opp.units.filter(u=>!u.ghost);   // WAVE 1 batch 18 — ON PLAY: +1 per Venom on the enemy's STRONGEST Unit (effPower; tie first-found R31), max 3. Reads current venom (public).
        if (foes.length){ const strong=foes.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b); const g2=Math.min(3, strong.venom||0); if (g2){ c.power+=g2; log(g,`Vishadhara reaps ${g2} from ${strong.n}'s corruption (+${g2}).`); emit(g,'buff',{sourceUid:c.uid,targetUids:[c.uid],amount:g2,abilityName:'Vishadhara',text:`+${g2}`}); } }
        break; }
      case 'depthcaller': if (pl.discard.some(u=>u.t==='unit' && !u.ghost)){ c.power+=2; log(g,'Avahani answers the fallen (+2).'); emit(g,'buff',{sourceUid:c.uid,targetUids:[c.uid],amount:2,abilityName:'Avahani',text:'+2'}); } break;   // WAVE 1 batch 18 — +2 if a friendly Unit is in YOUR discard
      case 'gravetide': { const n=Math.min(4, g.players[0].discard.concat(g.players[1].discard).filter(u=>u.t==='unit' && !u.ghost).length);   // WAVE 1 batch 18 — +1 per Unit in EITHER discard, max 4
        if (n){ c.power+=n; log(g,`Vaitarani Naga swells with the drowned dead (+${n}).`); emit(g,'buff',{sourceUid:c.uid,targetUids:[c.uid],amount:n,abilityName:'Vaitarani Naga',text:`+${n}`}); } break; }
      case 'siltstrangler': { const foes=opp.units.filter(u=>!u.ghost);   // WAVE 1 batch 18 — ON PLAY: enemy loses power = its Venom count (tokens REMAIN). Routes through damageUnit (cause 'Ajagara', NOT dmgAstra → Holika sharpens +1, Patala does NOT amplify; counts for lostPowerUids). R47: a unit on-play ignores astraProtected. AI: the most-venomed enemy.
        const venomed=foes.filter(u=>(u.venom||0)>0);
        if (venomed.length){ let t = targetUid!=null ? venomed.find(u=>u.uid===targetUid) : null; if (!t) t=venomed.reduce((a,b)=>(b.venom||0)>(a.venom||0)?b:a);
          const amt=t.venom||0; log(g,`Ajagara drowns ${t.n} under its own venom (−${amt}).`); damageUnit(g, 1-pi, t, amt, 'Ajagara'); }   // tokens remain (damageUnit never strips venom)
        else log(g,'Ajagara finds no venom to turn.'); break; }
      case 'uraga': c.venom=2; log(g,'Uraga Colossus rises, wreathed in its own venom (2).'); emit(g,'token',{sourceUid:c.uid,targetUids:[c.uid],abilityName:'Uraga Colossus',text:'2 Venom'}); break;   // WAVE 1 batch 13 — self-Venom (R13 drains it at round end); sheds 1/round in venomRoundEnd
      case 'ashvatara': { const foes=opp.units.filter(u=>!u.ghost);
        if (foes.length){ let t = targetUid!=null ? foes.find(u=>u.uid===targetUid) : null; if (!t) t=foes.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b);
          damageUnit(g, 1-pi, t, g.round, 'Ashvatara'); }   // R16: −current round number
        else log(g,'Ashvatara: no target.'); break; }
    }
    if (mahaBonus){ g.grantExtraTurn=pi; log(g,`Mahabali’s decree — ${c.n} is played free; ${pl.name} takes another turn.`); }
    // EXP-J — "Chaos always finds a way": if no Chaos Surge has fired this round, the Asura player's
    // first Unit play triggers exactly one. Guaranteed floor; can't be stacked or engineered beyond that.
    if (pl.faction==='asuras' && !pl.chaosThisRound) chaosSurge(g, pi, 1, 1);   // floor surge is +1 (spell surges stay +3)
    designateShields(g, pi);   // EXP-A: a shield opportunity — latch an open slot onto the strongest Unit
  }
  else if (c.t==='astra'){
    const firstAstra = pl.astrasThisRound===0;
    pl.astrasThisRound++;
    const chandrahasActive = pl.faction==='asuras' && pl.artifact && pl.artifact.id==='chandrahas';
    // §9 negation (Naga): Manasa (on board) cancels the Astra AND its Chaos Surge; Surasa's armed trap
    // (surasaNegateAstra, resolved at the top of playCard) cancels the effect but the Chaos Surge STILL fires.
    const manasa = opp.units.find(u=>!u.ghost && u.id==='manasa');
    let effectNegated=false, surgeNegated=false;
    if (manasa){ effectNegated=true; surgeNegated=true;
      log(g, `Manasa negates ${c.n} — its Chaos Surge fizzles too (§9).`); }
    else if (opp.brahmadandaArmed===g.round){ effectNegated=true; opp.brahmadandaArmed=0;   // WAVE 1 batch 16 (R24 + R37 erratum) — Brahmadanda cancels the EFFECT only: does NOT set surgeNegated (the caster's Chaos Surge still procs) and Blueprint below still fires. Distinct source from Manasa. Consumes the arm (one Astra). R24 sim fallback ("deals no damage" instead of full negate) is PREPARED, not implemented.
      log(g, `Brahmadanda strikes ${c.n} from the sky — its effect is undone (the cast still echoes).`); }
    else if (surasaNegateAstra){ effectNegated=true; /* R12: Surge still churns (logged at trap spring) */ }
    const doubled = chandrahasActive && firstAstra && !effectNegated;
    // TASK 17 — Kartikeya (Deva hero, R23): an ENEMY Astra that RESOLVES vs the Kartikeya-owner's side → ALL their Units +1 PERMANENT.
    // DETECTION (weakest-defensible, STATE-based — NOT the observational event stream): snapshot the owner's (opp = 1-pi) Units
    // BEFORE resolveAstra; "resolved vs your side" = ≥1 of those Units was REMOVED (destroyed/bounced) OR lost power OR gained venom
    // OR became bound BY this astra. Once per Astra (all surviving Units +1 once). A negated Astra skips resolveAstra → no change → NO
    // trigger (R23 negated≠resolved); an Astra that whiffs (no targets) → no change → no trigger; your OWN Astra hits opp, not you → never triggers your Kartikeya.
    const hasKart = opp.heroes.some(h=>h.id==='kartikeya');
    const kSnap = hasKart ? { n:opp.units.length, u:opp.units.map(u=>({uid:u.uid,power:u.power,venom:u.venom||0,bound:!!u.bound})) } : null;
    if (!effectNegated){
      resolveAstra(g, pi, c, targetUid);
      if (doubled){ log(g,`Chandrahas doubles ${c.n}!`); resolveAstra(g, pi, c, targetUid); }
    }
    if (hasKart){
      let affected = opp.units.length < kSnap.n;   // a Unit removed (destroyed OR bounced)
      if (!affected) for (const s of kSnap.u){ const u=opp.units.find(x=>x.uid===s.uid);
        if (!u){ affected=true; break; }                                              // this Unit is gone
        if (u.power<s.power || (u.venom||0)>s.venom || (!!u.bound && !s.bound)){ affected=true; break; } }   // lost power / venomed / bound
      if (affected){ const mine=opp.units.filter(u=>!u.ghost); for (const u of mine){ u.base+=1; u.power+=1; }
        if (mine.length){ log(g,`Kartikeya answers the Astra — all ${mine.length} of ${opp.name}'s Units +1 (permanent).`); emit(g,'buff',{targetUids:mine.map(u=>u.uid),amount:1,abilityName:'Kartikeya',text:'+1'}); } }
    }
    if (pl.faction==='asuras' && !surgeNegated) chaosSurge(g, pi, (chandrahasActive?2:1) * (c.id==='vidyutastra'?2:1));   // WAVE 1 batch 12 — Vidyutastra fires Chaos Surge TWICE; with Chandrahas (already ×2) it composes to 2×2=4 surges (logged for rulings).
    onAstraResolved(g, pi, doubled);
    // R7: Angad — playing an Astra while the opponent has Angad forfeits your next turn (stacks with Varuna).
    if (opp.heroes.some(h=>h.id==='angad')){ pl.skipNext=true; log(g,`Angad exacts the cost — ${pl.name} forfeits their next turn.`); }
    // WAVE 1 batch 8 — Mayasura's Blueprint (R26): once/round, the Astra does NOT consume the turn. Reuses the EXISTING
    // grantExtraTurn mechanism (Mahabali precedent, already in the LAUNCH BASELINE → AI-safe; afterAction UNCHANGED).
    // R26 "everything else stands": Angad's forfeit already fired above (punishes the play, not the turn — both compose:
    // extra action now, next natural turn forfeited); Chaos Surge already fired; onAstraResolved/astrasThisRound already
    // ran (so Varuna's per-round cap still gates a 2nd Astra in playableIndices). Placed AFTER the negation branch and
    // NOT gated on effectNegated: a negated Astra still grants the extra turn — the cast happened (R24 logic; logged).
    if (pl.artifact && pl.artifact.id==='blueprint' && !pl.blueprintUsed){
      g.grantExtraTurn=pi; pl.blueprintUsed=true;
      log(g,`Mayasura’s Blueprint — the Astra costs no turn; ${pl.name} acts again.`);
    }
    pl.discard.push(c);
  }
  else if (c.t==='mantra'){
    castMantra(g, pi, c.id, targetUid);
    // EXP-H: Chaos Surge also triggers on the Asura player's Mantras (5 spell-triggers in deck, not 3).
    // Still spell-gated; Chandrahas's "twice while active" applies, but Bana/Berserker/Tripura (Astra-only) do not.
    if (pl.faction==='asuras'){ const chandra = pl.artifact && pl.artifact.id==='chandrahas'; chaosSurge(g, pi, chandra?2:1); }
    // Rishi Mandala: each Mantra is usable twice — after its FIRST cast it returns to hand (once) instead of the discard.
    if (g.realm==='rishi' && !c.rishiUsed && realmActiveFor(g,pi)){ c.rishiUsed=true; c.lockedRound=0; pl.hand.push(c);   // R61: Rishi's mantra-echo gated on the mantra CASTER's realm-enabled state
      log(g,`Rishi Mandala returns ${c.n} to ${pl.name}'s hand — it may be cast once more.`);
      emit(g,'passive',{sourceUid:c.uid,abilityName:'Rishi Mandala',text:`${c.n} returns to hand`}); }
    else pl.discard.push(c);
  }
  else if (c.t==='artifact'){
    if (pl.artifact){ pl.discard.push(pl.artifact); log(g,`${pl.artifact.n} is replaced.`); }
    pl.artifact = c;
    if (c.id==='amrita'){
      // R4 (RESOLVED): your lowest power Unit gains +2; if destroyed this round it revives once at 1 power (aegis).
      const real=pl.units.filter(u=>!u.ghost);
      if (real.length){ const t=real.reduce((a,b)=>effPower(g,pi,a)<=effPower(g,pi,b)?a:b);
        t.power+=2; t.aegis=true; log(g,`Amrita Kalasha blesses ${t.n}: +2, revives once if destroyed.`);
        emit(g,'buff',{targetUids:[t.uid],amount:2,abilityName:'Amrita Kalasha',text:'+2'}); }   // Crown-precedent artifact-family buff emit (Kishkindha Crown ~2859 emits a real 'buff' for its +1s); Amrita's blessing was emit-blind — an omission against the family pattern, not design. Behavior-neutral (rule #7): STEP-0 check-2 audit found NO engine-side consumer; quest readers are abilityName-gated ('Leap'/'Chaos Surge'), which this never matches.
      else log(g,'Amrita Kalasha: no Unit to bless.');
    }
    else if (c.id==='kavacha'){ designateShields(g, pi); log(g,'Dharma Kavacha raised \u2014 two Units now shielded.'); }
    else if (c.id==='tripura')  log(g,'Tripura rises \u2014 the three cities empower the host each turn.');
    else if (c.id==='chandrahas'){ log(g,'Chandrahas gleams \u2014 Astras redouble.'); chaosSurge(g, pi, 1); }   // R9-candidate (EXP-B): ON PLAY one Chaos Surge
    else if (c.id==='ramasignet') log(g,'Rama\u2019s Signet seals the host \u2014 none may be ground below 1.');
    else if (c.id==='kishkindhacrown') log(g,'Kishkindha Crown shines \u2014 Leaps empower, and may be twice this round.');
    else if (c.id==='patala') log(g, `Patala Throne rises \u2014 Venom deepens to \u2212${1+g.round} this round.`);   // R11
    else if (c.id==='anantacoil') log(g,'Ananta Coil uncoils \u2014 every fallen Naga will leave its venom on the field.');   // R14
    else if (c.id==='blueprint') log(g,'Mayasura\u2019s Blueprint unfurls \u2014 once each round, an Astra will cost no turn.');   // WAVE 1 batch 8
    else if (c.id==='dawnbanner'){ pl.dawnBannerFrom=g.round+1; log(g,'Dawn Banner is raised \u2014 from next round, your host marches +1.'); }   // WAVE 1 batch 12 \u2014 active from the NEXT round (no retroactive buff this round); the stamp is match-long (survives the artifact clear).
  }
  // Kalki Kshetra tracks the round's last-played card (the +2 lands at round end, only if it's a Unit/Hero).
  g.lastCardThisRound = { uid:c.uid, isBody:(c.t==='unit'||c.t==='hero') };
  afterAction(g, pi);
}

function pass(g, pi){
  const pl=g.players[pi];
  const firstPass = !g.players[1-pi].passed;   // EXP-L2: Karkotaka's single early drain fires the moment the first player passes
  pl.passed=true;
  log(g, `${pl.name} passes.`);
  if (firstPass) venomKarkotakaEarly(g);
  if (pl.heroes.some(h=>h.id==='mahabali')) pl.mahabaliArm=g.round;   // §9: voluntary Pass arms Mahabali
  pl.hasPassedThisMatch=true;   // WAVE 1 batch 8 — Atikaya reads this; set ONLY here (a voluntary Pass), never by Tamasa/Angad forced skips (which never call pass()) — the Mahabali/Tamasa precedent
  afterAction(g, pi);
}

// R63 (balance round 1) — The Living Bridge is a FORMATION-MOMENT trigger, not a round-end effect. Fires the FIRST time the
// owner's row holds an unbroken adjacent run of 4+ non-ghost Units this round (ghosts BREAK the run, R63f; Rakta tokens count).
// Every unit in that run gains +1 base+power (R63e, permanent). Once per round (round-stamp lock; auto-invalidates as g.round
// advances → resets at round start, R63c). WAVE-GATED (livingbridge is wave:1) → structurally unreachable / no-op flag-off:
// the two afterAction calls read pl.artifact and return before any state/rng touch. Evaluated at afterAction (after sweepDeaths)
// so it sees the settled post-action row — subsumes every unit-add/reorder site (play, moveUnit, swapUnits, doLeap, all 9
// revival choke sites, Rakta spawn), each of which occurs inside a turn action that ends here. Shesha's round-start revival is
// moot (artifacts clear at round end → no Bridge is active at round start). NO rng.
function checkBridgeLine(g, pi){
  const pl=g.players[pi];
  if (!(pl.artifact && pl.artifact.id==='livingbridge')) return;   // wave-gated: no-op flag-off
  if (pl.bridgeFiredRound === g.round) return;                     // R63c: once per round
  let run=[], qual=null;                                            // first unbroken run of 4+ non-ghost Units (R63a/f)
  for (const u of pl.units){
    if (u.ghost){ if (run.length>=4){ qual=run; break; } run=[]; }
    else run.push(u);
  }
  if (!qual && run.length>=4) qual=run;
  if (!qual) return;
  pl.bridgeFiredRound = g.round;                                    // lock (R63c)
  for (const u of qual){ u.base+=2; u.power+=2; }                   // R63d/e + R78 (design round 3): the WHOLE run, +2 base+power (permanent; was +1 — mythic-grade payoff)
  log(g,`The Living Bridge spans — the ${qual.length}-Unit line rises +2 (permanent).`);
  emit(g,'buff',{targetUids:qual.map(u=>u.uid),amount:2,abilityName:'The Living Bridge',text:'+2'});
}
function afterAction(g, pi){
  sweepDeaths(g);                                    // R1: enforce death-at-0 generically
  checkBridgeLine(g,0); checkBridgeLine(g,1);         // R63: fire the Living Bridge the moment a 4+ line first forms (both sides; no-op without the wave artifact)
  const a=g.players[0], b=g.players[1];
  if (a.passed && b.passed){ endRound(g); return; }
  // Mahabali free-play extra turn — the acting player keeps the turn once.
  if (g.grantExtraTurn===pi && !g.players[pi].passed){ g.grantExtraTurn=null; g.turn=pi; onTurnStart(g, pi); return; }
  let next = g.players[1-pi].passed ? pi : 1-pi;
  // Tamasa forced single-turn skip (one-shot, does not leave the round).
  let guard=0;
  while (g.players[next].skipNext && guard++<4){
    g.players[next].skipNext=false;
    log(g, `${g.players[next].name} is forced to skip a turn (Tamasa).`);
    next = g.players[1-next].passed ? next : 1-next;
  }
  g.turn = next;
  onTurnStart(g, g.turn);
}

/* ---------- round / match resolution ---------- */
// WAVE 1 batch 3 — the Round End tier. Called in endRound AFTER venomRoundEnd (venom deaths are already counted) and BEFORE
// scoring (so the power changes count toward the round — the Kalki precedent). Structurally UNREACHABLE flag-off: an explicit
// fast-out returns immediately unless a batch-3 card is on a board or a Savitur enchant is active → no state/rng/sweep, byte-identical.
function roundEndCardEffects(g){
  const RE_IDS = new Set(['dawnsentinel','kamadhenu','pisacha','mahishasura','sushena']);   // WAVE 1 batch 11 adds sushena
  let active=false;
  for (let s=0;s<2 && !active;s++){ const pl=g.players[s];
    if ((pl.saviturUids && pl.saviturUids.length) || pl.units.some(u=>!u.ghost && RE_IDS.has(u.id)) || (pl.artifact && (pl.artifact.id==='drownedaltar' || pl.artifact.id==='ironcrucible' || pl.artifact.id==='kalpavriksha')) || pl.heroes.some(h=>h.id==='mahishi')) active=true; }   // + Drowned Altar / Iron Crucible / Kalpavriksha (batch-16) + Mahishi (batch-19 hero). R63: Living Bridge LEFT this hook (now a formation-moment trigger, see checkBridgeLine). Padmavati MOVED OUT (R54: pre-drain slot, before venomRoundEnd).
  if (!active) return;   // no round-end subscriber on the board → no-op
  // Snapshot "an enemy Unit died this round" BEFORE this hook's own decay-kills, so Mahishasura is independent of intra-hook order (R21+).
  const enemyDied = [ g.players[1].deathsThisRound>0, g.players[0].deathsThisRound>0 ];
  for (let pi=0; pi<2; pi++){
    const pl=g.players[pi];
    // Savitur Verse enchant: +1 to each tracked unit still on the board; if gone, nothing + no retarget.
    for (const uid of pl.saviturUids){ const u=pl.units.find(x=>x.uid===uid && !x.ghost);
      if (u){ u.power+=1; log(g,`Savitur Verse sustains ${u.n}: +1.`); emit(g,'buff',{sourceUid:uid,targetUids:[uid],amount:1,abilityName:'Savitur Verse',text:'+1'}); } }
    // per-unit self effects (survivors only — "survived" = still on the board after venom)
    for (const u of pl.units){ if (u.ghost) continue;
      if (u.id==='dawnsentinel'){ u.base+=1; u.power+=1; log(g,`Dawn Sentinel endures the round: +1 (permanent).`); emit(g,'buff',{sourceUid:u.uid,targetUids:[u.uid],amount:1,abilityName:'Dawn Sentinel',text:'+1'}); }
      else if (u.id==='pisacha'){ u.base-=1; u.power-=1; if (g.wave1) pl.lostPowerUids.add(u.uid); log(g,`Pisacha Skirmisher burns lower: −1 (permanent).`); emit(g,'damage',{targetUids:[u.uid],amount:-1,abilityName:'Pisacha Skirmisher',text:'−1'}); }   // batch-16: decay is a loss (Crucible, later in this hook, regains 1)
      else if (u.id==='mahishasura' && !enemyDied[pi]){ u.power-=2; if (g.wave1) pl.lostPowerUids.add(u.uid); log(g,`Mahishasura’s hunger goes unfed: −2.`); emit(g,'damage',{targetUids:[u.uid],amount:-2,abilityName:'Mahishasura',text:'−2'}); }   // batch-16: decay is a loss
    }
    // Kamadhenu: lowest-power friendly Unit +1 (one buff per Kamadhenu on board). TIE → first-found (reduce keeps the first; deterministic, no rng). R21+.
    const kamCount = pl.units.filter(u=>!u.ghost && u.id==='kamadhenu').length;
    for (let ki=0; ki<kamCount; ki++){ const alive=pl.units.filter(u=>!u.ghost); if (!alive.length) break;
      const lowest=alive.reduce((a,b)=> effPower(g,pi,a)<=effPower(g,pi,b)?a:b);
      lowest.power+=1; log(g,`Kamadhenu blesses ${lowest.n}: +1.`); emit(g,'buff',{sourceUid:lowest.uid,targetUids:[lowest.uid],amount:1,abilityName:'Kamadhenu',text:'+1'}); }
    // WAVE 1 batch 11 — Sushena the Healer runs BEFORE The Living Bridge (deterministic hook order): restore 1 (current power, capped at base) to each ADJACENT DAMAGED (power<base) Unit. Sushena excluded (adjacency = neighbours, not self). A permanent base-cut (Surpanakha/Pisacha) leaves power==base → NOT damaged → no restore.
    for (const s of pl.units){ if (s.ghost || s.id!=='sushena') continue;
      for (const u of adjacentUnits(pl, s)) if (!u.ghost && u.power < u.base){ u.power=Math.min(u.base, u.power+1); log(g,`Sushena the Healer mends ${u.n}: +1.`); emit(g,'buff',{sourceUid:s.uid,targetUids:[u.uid],amount:1,abilityName:'Sushena the Healer',text:'+1'}); } }
    // WAVE 1 batch 16 — The Iron Crucible (R42 slot: adjacent to Sushena, a restore): each of your Units that LOST power this round regains 1 (+1 CURRENT power, NOT capped at base — a permanent-cut/decay unit whose power==base must still regain, the anti-decay intent). Reads the per-round lostPowerUids set (populated at damageUnit/venomLoss/Surpanakha/Pisacha/Mahishasura). Runs AFTER Pisacha/Mahishasura decay (same hook, earlier) so decayed units are counted.
    if (pl.artifact && pl.artifact.id==='ironcrucible'){ const regained=pl.units.filter(u=>!u.ghost && pl.lostPowerUids.has(u.uid)); for (const u of regained) u.power+=1;
      if (regained.length){ log(g,`The Iron Crucible reforges ${regained.length} Unit(s) that paid the price: +1 each.`); emit(g,'buff',{targetUids:regained.map(u=>u.uid),amount:1,abilityName:'The Iron Crucible',text:'+1'}); } }
    // R63 (balance round 1): The Living Bridge is NO LONGER a round-end effect — it is a formation-moment trigger (see checkBridgeLine, fired from afterAction). This slot is intentionally empty.
    // WAVE 1 batch 13 — The Drowned Altar (deterministic hook order, R42): mill the top deck card → discard; if it is a Unit, all your Units +1 CURRENT power this round (counts for scoring). Empty deck → nothing.
    if (pl.artifact && pl.artifact.id==='drownedaltar'){ const milled=pl.deck.shift();
      if (milled){ pl.discard.push(milled);
        if (milled.t==='unit'){ const line=pl.units.filter(u=>!u.ghost); for (const u of line) u.power+=1; log(g,`The Drowned Altar drowns ${milled.n} — a Unit! ${pl.name}'s host swells +1 this round.`); if (line.length) emit(g,'buff',{targetUids:line.map(u=>u.uid),amount:1,abilityName:'The Drowned Altar',text:'+1'}); }
        else log(g,`The Drowned Altar drowns ${milled.n} — no Unit, no surge.`); }
      else log(g,'The Drowned Altar laps at an empty deck.'); }
    // WAVE 1 batch 16 — Kalpavriksha (RATNA, R42 slot: LAST, so it equalises to the SETTLED highest after all other round-end changes): your lowest-power Unit's CURRENT power rises to equal your highest-power Unit's (effPower, so Dawn Banner's read-time +1 is already folded in → the SIM-flagged pairing composes automatically). Needs 2+ Units; no-op if lowest already equals highest.
    if (pl.artifact && pl.artifact.id==='kalpavriksha'){ const real=pl.units.filter(u=>!u.ghost);
      if (real.length>=2){ const hi=real.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b); const lo=real.reduce((a,b)=>effPower(g,pi,a)<=effPower(g,pi,b)?a:b);
        const gap=effPower(g,pi,hi)-effPower(g,pi,lo);
        if (lo!==hi && gap>0){ lo.power+=gap; log(g,`Kalpavriksha grants the wish — ${lo.n} rises to match ${hi.n} (${effPower(g,pi,lo)}).`); emit(g,'buff',{sourceUid:lo.uid,targetUids:[lo.uid],amount:gap,abilityName:'Kalpavriksha',text:`+${gap}`}); } } }
    // WAVE 1 batch 19 — Mahishi (Asura hero, R42 slot: LAST in the per-player loop, so it reads the SETTLED strongest friendly Unit after all round-end buffs). Copies POWER ONLY (h.power = the strongest friendly Unit's effPower; no abilities); stays a hero. Heroes PERSIST → recurs every round. Strongest = own-side (Makardhwaja "your strongest" precedent; logged). No friendly Unit → keeps its current power.
    // R66 (design round 1): ONCE PER GAME — fires at the FIRST round end where the copy would INCREASE her power (sp > h.power);
    // a round end where it would not is a HOLD, not a spend (the charge h.mahishiSpent is consumed only on a gain). Deterministic,
    // no picker. All R59 semantics stand (friendly-only, last in the hook so sp is settled, counts toward this round's score, power-only,
    // hero row kept, persists). h.mahishiSpent is per-match state on the hero (undefined→falsy until spent; a new match mints a new hero).
    for (const h of pl.heroes){ if (h.id!=='mahishi' || h.mahishiSpent) continue; const real=pl.units.filter(u=>!u.ghost);
      if (real.length){ const strong=real.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b); const sp=effPower(g,pi,strong);
        if (sp > h.power){ h.mahishiPreCopy=h.power; h.power=sp; h.mahishiSpent=true; log(g,`Mahishi takes the shape of ${strong.n}'s might (${sp}).`); emit(g,'buff',{sourceUid:h.uid,targetUids:[h.uid],abilityName:'Mahishi',text:`copies ${sp}`}); } } }   // R72: stash the PRE-copy power (accrued gains included) before the spike; reverted at the board clear (this round only). mahishiSpent stays set (consumed at fire, not refunded by the revert).
  }
  sweepDeaths(g);   // Pisacha/Mahishasura decayed to ≤0 die here, before scoring (the death-at-0 rule)
}
// R54 — PRE-DRAIN TOKEN APPLICATIONS: round-end token appliers/movers that must TICK THE SAME round end. Runs immediately BEFORE
// venomRoundEnd, so the fresh/moved token drains this round (deepened in Patala, doubled under Vasuki-class, per the pipeline).
// Order per side: Padmavati APPLIES (so her fresh token is in the pool), then Shankhapala MOVES (batch-18). All presence-gated → absent flag-off.
function preDrainTokens(g){
  for (let pi=0; pi<2; pi++){ const pl=g.players[pi], opp=g.players[1-pi];
    // Padmavati (Naga hero): 1 Venom to the STRONGEST enemy Unit (effPower; tie → first-found, R31). Heroes PERSIST → recurs every round.
    if (pl.heroes.some(h=>h.id==='padmavati')){ const foes=opp.units.filter(u=>!u.ghost);
      if (foes.length){ const t=foes.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b); t.venom=(t.venom||0)+1;
        log(g,`Padmavati’s venom seeps into ${t.n} (Token).`); emit(g,'token',{targetUids:[t.uid],abilityName:'Padmavati',text:'Venom Token'}); }
      else log(g,'Padmavati’s gaze finds no enemy to poison.'); }
    // WAVE 1 batch 18 — Shankhapala (Naga unit, R54 pre-drain slot so the moved token drains THIS round): move 1 Venom from the MOST-venomed
    // enemy to the highest-effPower OTHER enemy (concentrate corruption on the biggest threat — weakest-defensible; needs 2+ enemy Units and a venomed source). One move per Shankhapala.
    const shanks=pl.units.filter(u=>!u.ghost && u.id==='shankhapala').length;
    for (let si=0; si<shanks; si++){ const foes=opp.units.filter(u=>!u.ghost); const venomed=foes.filter(u=>(u.venom||0)>0);
      if (!venomed.length || foes.length<2) break;
      const src=venomed.reduce((a,b)=>(b.venom||0)>(a.venom||0)?b:a);
      const others=foes.filter(u=>u!==src); const dst=others.reduce((a,b)=>effPower(g,1-pi,b)>=effPower(g,1-pi,a)?b:a);
      src.venom-=1; dst.venom=(dst.venom||0)+1;
      log(g,`Shankhapala coils the venom from ${src.n} onto ${dst.n}.`); emit(g,'token',{targetUids:[dst.uid],abilityName:'Shankhapala',text:'Venom moved'}); }
  }
}
function endRound(g){
  // Kalki Kshetra: the round's last-played card — if a Unit/Hero still on the board — gains +2 (before venom & scoring).
  if (g.realm==='kalki' && g.lastCardThisRound && g.lastCardThisRound.isBody){
    const uid=g.lastCardThisRound.uid;
    for (let s=0;s<2;s++){ const c=[...g.players[s].units, ...g.players[s].heroes].find(u=>u.uid===uid && !u.ghost);
      if (c){ if (realmActiveFor(g,s)){ c.power+=2; log(g,`Kalki Kshetra blesses the last-played ${c.n}: +2.`); emit(g,'buff',{sourceUid:c.uid,targetUids:[c.uid],amount:2,abilityName:'Kalki Kshetra',text:'+2'}); } break; } }   // R61: Kalki's +2 gated on the last-card OWNER's (side s) realm-enabled state
  }
  preDrainTokens(g);                                 // R54 — pre-drain token applications (Padmavati) land BEFORE the drain, so they tick THIS round end
  venomRoundEnd(g);                                  // Venom pipeline ticks BEFORE scoring (R1 death-at-0 via sweep)
  roundEndCardEffects(g);                            // WAVE 1 batch 3 — Round End tier (after venom, before scoring; no-op flag-off)
  const t0=totalPower(g,0), t1=totalPower(g,1);
  log(g, `Round ${g.round} ends \u2014 ${g.players[0].name} ${t0} vs ${g.players[1].name} ${t1}.`);
  let winner=null;
  if (t0>t1) winner=0; else if (t1>t0) winner=1;
  if (winner!=null){ g.players[winner].roundWins++; log(g, `${g.players[winner].name} wins Round ${g.round}!`); }
  else log(g, 'The round is a draw \u2014 both sides bleed.');
  g.roundHistory.push({ round:g.round, t0, t1, winner });

  if (g.players[0].roundWins>=g.winTarget || g.players[1].roundWins>=g.winTarget || g.round>=3){   // g.winTarget default 2
    g.over=true;
    if (g.players[0].roundWins>g.players[1].roundWins) g.winner=0;
    else if (g.players[1].roundWins>g.players[0].roundWins) g.winner=1;
    else g.winner=null;
    log(g, g.winner==null ? 'The match ends in a cosmic stalemate.' : `\u2694 ${g.players[g.winner].name} WINS THE MATCH ${g.players[g.winner].roundWins}\u2013${g.players[1-(g.winner)].roundWins}!`);
    return;
  }

  // board reset
  for (let s=0;s<2;s++){
    const pl=g.players[s];
    for (const u of pl.units) if (!u.ghost){ u.revivedShield=false; u.aegis=false; u.venom=0; u.asleep=false; u.doomed=false; u.revealPending=false; u.ward=false; u.bound=false; u.stolenBy=-1; u.astraImmuneRound=0; pl.discard.push(u); }
    pl.units=[];
    if (pl.artifact){ pl.discard.push(pl.artifact); pl.artifact=null; }
    // removed heroes return at half power
    for (const h of pl.removedHeroes){ h.power=Math.max(1, Math.ceil(h.power/2)); pl.heroes.push(h); log(g,`${h.n} returns at ${h.power} power.`); }
    pl.removedHeroes=[];
    // R72 (design round 2): Mahishi's copy is THIS ROUND ONLY — at the board clear (after scoring), she sheds the borrowed shape and returns to her PRE-copy power (any separately-accrued gains preserved; the once-flag mahishiSpent stays set). Reached only when the match continues (endRound returns before the reset at match-over → the deciding-round spike persists into g.over). Wave-gated: mahishiPreCopy is only ever set by the wave card → no-op flag-off.
    for (const h of pl.heroes) if (h.id==='mahishi' && h.mahishiPreCopy!=null){ h.power=h.mahishiPreCopy; h.mahishiPreCopy=null; log(g,`Mahishi sheds the borrowed shape — she returns to ${h.power}.`); }
    pl.passed=false; pl.heroPlayedThisRound=false; pl.astrasThisRound=0;
    pl.skipNext=false; pl.chaosThisRound=false; pl.seesOppHand=false; pl.shieldUids=[]; pl.leapsUsed=0; pl.vediShieldGrants=0; pl.blueprintUsed=false;   // shields + Leaps re-designate each round (Vedi bonus-grants expire); Blueprint re-arms each round; mahabaliArm persists. artifactShieldRound/ratriRound/mayaVeilRound are ===g.round stamps → auto-expire, no reset needed. hasPassedThisMatch is MATCH-LONG → never reset here.
    pl.surasaTrap=false; pl.astikaPause=false; pl.venomStrike=0; pl.sarpaDouble=false; pl.mustPlayUnit=false;   // Naga per-round flags reset; boardTokens PERSIST all match
    pl.lostPowerUids=new Set(); pl.brahmadandaArmed=0;   // WAVE 1 batch 16 — clear the per-round lost-power set; an unconsumed Brahmadanda arm expires at round end
    pl.deathsThisRound=0;   // WAVE 1 batch 3: per-round death count resets; saviturUids PERSIST all match (enchant)
    pl.vanguardTriggered=false; pl.raktabijaCurse=false;   // WAVE 1 batch 9: Vanguard once/round re-arms; an unconsumed Raktabija's Curse expires at round end
    // Gandharva Lok: both players draw 1 extra at the START of Round 2 (g.round is still 1 here, pre-increment).
    const extra = (g.realm==='gandharva' && g.round===1 && realmActiveFor(g,s)) ? 1 : 0;   // R61: Gandharva's extra draw gated per drawing side (s)
    const dmDraw = difficultyOf(pl).extraDraw || 0;   // TASK D3 structural edge: a DEATHMATCH AI draws +1 at the start of rounds 2 & 3 (deck-permitting; splice consumes no rng → advanced/absent byte-identical). Visible in the deck counter (self-documenting like the 11th card).
    const drawn = pl.deck.splice(0, g.drawCount+extra+dmDraw); pl.hand.push(...drawn);   // g.drawCount default 2
    if (dmDraw && drawn.length>g.drawCount+extra) log(g,`${pl.name} draws deeper (Death Match).`);
    if (extra) log(g,`Gandharva Lok: ${pl.name} draws an extra card for Round 2.`);
    for (const c of pl.hand) c.lockedRound=0;
  }
  g.lastKillThisRound=null; g.astraPlays=0; g.astraBanaCount=0; g.grantExtraTurn=null; g.lastCardThisRound=null;
  g.round++;
  const prev = g.roundHistory[g.roundHistory.length-1];
  // R2 (RESOLVED): previous round's WINNER plays first; on a drawn round, the same leader as before.
  g.turn = prev.winner!=null ? prev.winner : g.firstThisRound;
  g.firstThisRound = g.turn;
  // Rahu: at the start of each round the opponent discards 1 random card.
  for (let s=0;s<2;s++){
    if (g.players[s].heroes.some(h=>h.id==='rahu')){
      const foe=g.players[1-s];
      if (foe.hand.length){ const i=Math.floor(g.rng()*foe.hand.length); const d=foe.hand.splice(i,1)[0]; foe.discard.push(d);
        log(g, `Rahu devours a card from ${foe.name}\u2019s hand (${d.n}).`); }
    }
  }
  // R15: Shesha \u2014 if the Naga player LOST the round just ended, a random friendly Unit returns to the board.
  for (let s=0;s<2;s++){
    const pl=g.players[s];
    if (pl.heroes.some(h=>h.id==='shesha') && prev.winner!=null && prev.winner===1-s){
      const units=pl.discard.filter(u=>u.t==='unit' && !u.ghost);
      if (units.length){ const t=units[Math.floor(g.rng()*units.length)];
        pl.discard.splice(pl.discard.indexOf(t),1);
        t.power=t.base; t.venom=0; t.bound=false; t.stolenBy=-1; t.aegis=false; t.ward=false; t.astraImmuneRound=0;
        pl.units.push(t); onUnitRevive(g, s, t); /* WAVE 1 batch 9 \u2014 revival choke #8 (Shesha, round-start) */ log(g, `Shesha\u2019s coils stir \u2014 ${t.n} rises to fight again for ${pl.name}.`); }
    }
  }
  log(g, `\u2014\u2014 Round ${g.round} begins. Each side draws 2. ${g.players[g.turn].name} leads. \u2014\u2014`);
  onTurnStart(g, g.turn);                            // start-of-turn hooks for the new round
}

/* ---------- AI ---------- */
function aiScoreCard(g, pi, c){
  const pl=g.players[pi], opp=g.players[1-pi];
  const astrasInHand = pl.hand.filter(x=>x.t==='astra').length;
  const unitsInHand  = pl.hand.filter(x=>x.t==='unit').length;
  const chandrahasActive = pl.artifact && pl.artifact.id==='chandrahas';
  let s = c.p;
  switch(c.id){
    case 'indra': s += Math.min(pl.units.filter(u=>!u.ghost).length, 5) + 2; break;
    case 'varuna': s += 2; break;
    case 'agni': s += 1; break;
    case 'surya': s += pl.units.filter(u=>!u.ghost).length; break;
    case 'marut': if (pl.units.some(u=>u.id==='vayu')) s += 3; break;
    case 'gandharva': if (pl.units.filter(u=>!u.ghost).length>=3) s += 2; break;
    case 'kubera': s += 2.5; break;
    case 'urvashi': s += 2; break;
    case 'saraswati': s += opp.hand.length? 2:0; break;
    case 'vayu': s += opp.units.some(u=>!u.ghost)? 2:0; break;
    case 'vishwakarma': s += opp.artifact? 3:0; break;
    case 'yama': s += 1.5; break;
    case 'brihaspati': s += g.lastMantra? 2:0; break;
    case 'vajra': { const spec=targetSpec(g,pi,c); s = spec.options.length? 1+Math.max(...spec.options.map(u=>effPower(g,1-pi,u))) : -99; break; }
    case 'aruna': s += (g.round===1 ? 2 : 0); break;   // WAVE 1 — value the Round-1 bonus (only reached when wave1 pool is on)
    case 'agneyastra': { const spec=targetSpec(g,pi,c); s = spec.options.length ? 3 : -99; break; }   // WAVE 1 — deal 3 when a legal target exists
    // ---- WAVE 1 batch 3 (Round End tier) — only reached when wave1 pool is on ----
    case 'dawnsentinel': s += 1; break;                                   // grows if it survives
    case 'kamadhenu': s += pl.units.some(u=>!u.ghost)?1:0; break;         // round-end buff to the lowest
    case 'savitur': s = pl.units.some(u=>!u.ghost)?2:-99; break;          // needs a friendly Unit to enchant
    case 'mahishasura': s += 1; break;                                    // a strong P7 body
    // ---- WAVE 1 batch 5 (draw/discard tier) — only reached when wave1 pool is on ----
    case 'bloodoath': { const real=pl.units.filter(u=>!u.ghost); s = real.length ? 2 + Math.min(2,pl.deck.length) - Math.min(...real.map(u=>effPower(g,pi,u))) : -99; break; }   // card advantage, worth it when the lowest Unit is cheap
    case 'dawnsrebirth': { const u=pl.discard.filter(x=>x.t==='unit' && !x.ghost); s = u.length ? 1 + Math.max(...u.map(x=>x.base)) : -99; break; }   // returns the best fallen Unit; dead with an empty discard
    case 'swayamprabha': s += 1.5; break;                                 // deck dig (Tara value)
    // ---- WAVE 1 batch 6 (debuff/price tier) — only reached when wave1 pool is on ----
    case 'mayashade': s += pl.units.some(u=>!u.ghost)? 1 : 0; break;      // copies the lowest other Unit (modest; a P2 body either way)
    case 'dhumraksha': s -= 0.5; break;                                   // P4 body; mild discount for the self-inflicted −1 price
    case 'surpanakha': s += opp.units.some(u=>!u.ghost)? 1.5 : 0; break;  // permanent enemy shrink when there is a target
    case 'mohanastra': { const spec=targetSpec(g,pi,c); s = spec.options.length ? 2 : -99; break; }   // −2 debuff when a legal target exists
    // ---- WAVE 1 batch 7 (protection tier) — only reached when wave1 pool is on ----
    case 'vedikeeper': s += 1; break;                                     // P3 body + a bonus shield
    case 'ribhu': s += pl.artifact ? 0.5 : 0; break;                      // P3 body; the ward only matters with an Artifact + an enemy Vishwakarma
    case 'airavatacalf': s += 1; break;                                   // P4 body that enters shielded (durable)
    case 'ratri': s = g.astraPlays>0 ? 2 : 1; break;     // prevent Astra damage — worth more once Astras have appeared (public info; no hand peek)
    case 'mayaveil': s = g.astraPlays>0 ? 2 : 1; break;  // untargetable by Astras — same (public astra-play count)
    // ---- WAVE 1 batch 8 (turn-economy tier) — only reached when wave1 pool is on ----
    case 'blueprint': s = astrasInHand>0 ? 3 : 1; break;                  // an extra Astra-turn each round — worth most with Astras in hand
    case 'atikaya': s += pl.hasPassedThisMatch ? 2 : -2; break;           // P6 body ± the entry modifier (mirror the on-play)
    case 'longpatience': { const foes=opp.units.filter(u=>!u.ghost); s = foes.length ? 1+foes.length : -99; break; }   // Venom to all enemies (Nagastra value)
    // ---- WAVE 1 batch 9 (event-trigger tier) — only reached when wave1 pool is on ----
    case 'simhika': s += 1; break;                                       // P4 body that grows on enemy revivals
    case 'vanguard': s += 1; break;                                      // P5 body that grows on a friendly death
    case 'vishalakshi': s += 1; break;                                   // P4 body that grows on enemy venom-deaths
    case 'raktabija': s = pl.units.some(u=>!u.ghost) ? 1.5 : 0.5; break; // spawns 2 tokens on the next friendly death
    // ---- WAVE 1 batch 10 (positional tier) — only reached when wave1 pool is on ----
    case 'setumason': s += pl.units.some(u=>!u.ghost) ? 1 : 0; break;    // +1 when it can land adjacent to an ally
    case 'drummer': s += Math.min(2, pl.units.filter(u=>!u.ghost).length); break;   // buffs up to 2 neighbours
    case 'gavaksha': s += 0.5; break;                                    // a P3 body; the swap is situational upside
    case 'setustones': s += pl.faction==='vanaras' ? 1 : 0; break;       // positional artifact
    case 'vault': s = pl.units.some(u=>!u.ghost) ? 2 : -99; break;       // move + a +2 buff when there is a Unit
    // ---- WAVE 1 batch 11 (Leap/round-end tier) — only reached when wave1 pool is on ----
    case 'gaja': s += (pl.units.filter(u=>!u.ghost).length >= opp.units.filter(u=>!u.ghost).length) ? 1 : 0; break;   // +1 while wider
    case 'kumuda': s += 0.5; break;                                     // grows on leaps (situational)
    case 'sushena': s += 1; break;                                      // round-end healer
    case 'rambha': s += 1; break;                                       // grows per friendly leap
    case 'livingbridge': s += pl.units.filter(u=>!u.ghost).length >= 3 ? 3 : 1; break;   // mythic go-wide payoff
    // ---- WAVE 1 batch 12 (cleanup tier) — only reached when wave1 pool is on ----
    case 'dhanvantari': s += pl.units.some(u=>!u.ghost && u.power<u.base) ? 1.5 : 0; break;   // restores a wounded ally
    case 'shaktispear': { const spec=targetSpec(g,pi,c); s = spec.options.length ? 2+Math.max(...spec.options.map(u=>effPower(g,1-pi,u))) : -99; break; }   // destroy ≤4 (Gandiva-style value)
    case 'dawnbanner': s += pl.units.filter(u=>!u.ghost).length + 1; break;   // wider board = more value from the per-round +1
    case 'andhaka': s += 1; break;                                            // durable P6, hard to remove
    case 'vidyutastra': { const spec=targetSpec(g,pi,c); s = spec.options.length ? 3 : -99; break; }   // deal 2 + double surge
    // ---- WAVE 1 batch 13 (venom tier: bounce + mill) — only reached when wave1 pool is on ----
    case 'uraga': s += 3; break;                                         // a big P7 body; the self-venom is the price
    case 'mahapadma': s += 2; break;                                     // anti-shield tech (Deva counter)
    case 'worldcoil': { const spec=targetSpec(g,pi,c); s = spec.options.length ? 1+Math.max(...spec.options.map(u=>effPower(g,1-pi,u))) : -99; break; }   // bind the strongest enemy
    case 'shedskin': s += pl.units.some(u=>!u.ghost && !u.token && CARD_BY_NAME[u.n] && effPower(g,pi,u)<u.p) ? 1 : -1; break;   // value only when a Unit is below printed
    case 'drownedaltar': s += 1; break;                                  // mill + a conditional +1
    // ---- WAVE 1 batch 14 (astra/utility tier) — only reached when wave1 pool is on ----
    case 'suryastra': { const foes=opp.units.filter(u=>!u.ghost); s = foes.length ? 2+foes.length : -99; break; }   // AoE deal-2
    case 'sampati': s += 0.5; break;                                     // info reveal
    case 'vinatastalon': { const n=Math.floor(pl.units.filter(u=>!u.ghost).length/2); s += opp.units.some(u=>!u.ghost)? n : 0; break; }   // R74: N chip damage (uncapped, matches the mechanic)
    case 'vayavyastra': { const spec=targetSpec(g,pi,c); s = spec.options.length ? 2+Math.max(...spec.options.map(u=>effPower(g,1-pi,u))) : -99; break; }   // tempo bounce
    case 'jatayu': { const spec=targetSpec(g,pi,c); s = spec.options.length ? 3+Math.max(...spec.options.map(u=>effPower(g,1-pi,u)))/2 : -99; break; }   // destroy a big threat
    // ---- WAVE 1 batch 15 (leap-utility tier) — only reached when wave1 pool is on ----
    case 'songcrossing': { const n=pl.units.filter(u=>!u.ghost).length; s = n ? n*(n>=4?2:1) : -99; break; }   // buff-all: value scales with board width (and the 4+ threshold)
    case 'matanga': s = (pl.faction==='vanaras' && bestLeap(g,pi)) ? 3 : -1; break;   // R71: an immediate free leap +2/+2 — worth playing only when a beneficial leap pair exists (bestLeap side-effect-free)
    case 'gandhamadana': s += 1; break;                          // P5 body + leap-anywhere target utility
    case 'anjaneyaroar': { const foes=opp.units.filter(u=>!u.ghost).length; const paired=pl.units.filter(u=>!u.ghost && flankedBothSides(pl,u)).length; s = (foes||paired) ? foes+paired : -99; break; }   // R49(a): −1 to each enemy + +1 to each INTERIOR friendly
    case 'saranyu': s += 0.5; break;                             // P5 body; the power-exchange is board-total-neutral (situational upside, Gavaksha precedent)
    // ---- WAVE 1 batch 16 (artifact/counter tier) — only reached when wave1 pool is on ----
    case 'kalpavriksha': s += pl.units.filter(u=>!u.ghost).length>=2 ? 3 : 0.5; break;   // raises the lowest to the highest at round end (bigger gap = bigger swing)
    case 'ironcrucible': s += 1; break;                          // round-end anti-decay/anti-price restore
    case 'brahmadanda': s = 1.5; break;                          // reactive Astra counter (arms a round-scoped negate; modest fixed value)
    case 'vritra': s += opp.units.some(u=>!u.ghost) ? 2 : 0; break;   // P8 body (base counts) + a bind when there is an enemy Unit to lock down
    // ---- WAVE 1 batch 17 (heroes part 1) — only reached when wave1 pool is on ----
    case 'kartikeya': s += 1; break;                                 // big P8 body + a passive that punishes enemy Astras (situational upside)
    case 'makardhwaja': { const hn=pl.heroes.some(h=>h.id==='hanuman'); const us=pl.units.filter(u=>!u.ghost); const best = hn ? Math.max(...pl.heroes.filter(h=>h.id==='hanuman').map(h=>effPower(g,pi,h))) : (us.length?Math.max(...us.map(u=>effPower(g,pi,u))):0); s = Math.max(c.p, best); break; }   // enters copying the strongest source (value = that power, floored at printed 7)
    case 'anjana': s += pl.faction==='vanaras' ? 1.5 : 0; break;      // P6 body + an extra Leap each round (only matters for Vanaras)
    case 'padmavati': s += opp.units.some(u=>!u.ghost) ? 1.5 : 0.5; break;   // P7 body + a recurring round-end Venom engine
    // ---- WAVE 1 batch 18 (Naga remainder, part 1) — only reached when wave1 pool is on ----
    case 'patalahatchling': s += opp.units.some(u=>!u.ghost) ? 0.5 : 0; break;   // small body + a venom
    case 'moltingnaga': s += 0.5; break;                                        // small body that spits venom on death
    case 'venomharvester': { const foes=opp.units.filter(u=>!u.ghost); s += foes.length ? Math.min(3, foes.reduce((a,b)=>effPower(g,1-pi,a)>=effPower(g,1-pi,b)?a:b).venom||0) : 0; break; }   // +1 per venom on the strongest enemy
    case 'shankhapala': s += 0.5; break;                                        // P4 body + round-end venom shuffle
    case 'depthcaller': s += pl.discard.some(u=>u.t==='unit' && !u.ghost) ? 2 : 0; break;   // +2 with a fallen ally
    case 'gravetide': s += Math.min(4, g.players[0].discard.concat(g.players[1].discard).filter(u=>u.t==='unit' && !u.ghost).length); break;   // grows with the graveyards
    case 'kalakuta': { const spec=targetSpec(g,pi,c); s = spec.options.length ? 2 : -99; break; }   // 2 venom on one enemy
    case 'hymndepths': { const venomed=opp.units.filter(u=>!u.ghost && (u.venom||0)>0); s = (venomed.length || (isNaga(pl) && opp.units.some(u=>!u.ghost))) ? 1+venomed.length : -99; break; }   // trigger all drains now
    case 'serpentskiss': { const spec=targetSpec(g,pi,c); s = spec.options.length ? 3 + Math.max(...spec.options.map(u=>effPower(g,1-pi,u)))/2 : -99; break; }   // destroy a venom-ripe threat
    case 'siltstrangler': { const foes=opp.units.filter(u=>!u.ghost && (u.venom||0)>0); s += foes.length ? Math.max(...foes.map(u=>u.venom||0)) : 0; break; }   // power off the most-venomed enemy
    // ---- WAVE 1 batch 19 (deferred heroes) — only reached when wave1 pool is on ----
    case 'garuda': { const fv=pl.units.reduce((n,u)=>n+(u.ghost?0:(u.venom||0)),0); s += fv;   // P7 body + a friendly-Venom cleanse/buff (anti-Naga tech)
      if (fv===0 && isNaga(opp) && g.round<3) s -= 3;   // TASK 22 GARUDA HOLD — no friendly venom to cleanse + a live enemy venom source (Naga) → wait for cleanse value. BOUNDED: released in the final round (g.round>=3 → always deploys by then) and a modest penalty so a clearly-best P7 body still plays. No infinite hold.
      break; }
    case 'kulika': { const fv=pl.units.reduce((n,u)=>n+(u.ghost?0:(u.venom||0)),0); s += fv*0.5; break; }   // P8 body + transfer friendly Venom to the foe
    case 'mahishi': { const real=pl.units.filter(u=>!u.ghost); s += real.length ? Math.max(0, Math.max(...real.map(u=>effPower(g,pi,u))) - c.p)/2 : 0; break; }   // P7 body that copies the strongest each round
    // ---- WAVE 1 batch 20 (the final two) — only reached when wave1 pool is on ----
    case 'nahusha': s += (g.realm && g.realm!=='mrityulok') ? 1.5 : 0; break;   // P6 body + one-sided realm value when a realm is active
    case 'secondthrone': s += isNaga(pl) ? 2 : 1; break;                        // venom-payoff artifact (steals enemy drains)
    case 'brahmastra': s = opp.units.filter(u=>!u.ghost).reduce((k,u)=>k+effPower(g,1-pi,u),0); break;
    case 'sudarshana': s = opp.heroes.length? 2+Math.max(...opp.heroes.map(h=>h.power))/2 : -99; break;
    case 'gayatri': { const u=pl.discard.filter(x=>x.t==='unit'); s = u.length? 1+Math.min(...u.map(x=>x.base))+2 : -99; break; }
    case 'pavamana': {
      const wounded = pl.units.filter(u=>!u.ghost&&u.power<u.base).length;
      if (isNaga(opp)){   // EXP-M: hold Pavamana until 2+ friendly Venom Tokens, or the round is ending
        const ftok = pl.units.filter(u=>!u.ghost).reduce((n,u)=>n+(u.venom||0),0);
        s = (ftok>=2 || opp.passed) ? 3 + wounded + ftok*2 : -6;
      } else s = wounded*2 - 1;
      break; }
    case 'amrita': s = pl.units.some(u=>!u.ghost)? 2.5 : -1; break;
    case 'kavacha': s = pl.units.filter(u=>!u.ghost).length>=2? 2 : 0; break;
    // ---- Asura ----
    case 'mahabali': s += 3; break;                                 // (d) get it down early to arm free plays
    case 'shukra': s += pl.discard.some(x=>x.t==='unit')? 2.5 : 0; break;
    case 'rahu': s += 2; break;
    case 'hiranya': s += 2; break;                                   // durable body
    case 'ravana': s += Math.min(5, opp.hand.length); break;
    case 'kumbha': s += 1; break;                                    // EXP-G: P8 that counts now AND detonates next turn
    case 'meghnad': s += opp.heroes.length? 2 : 0; break;
    case 'kalanemi': s += opp.units.filter(u=>!u.ghost).length>=2? 2 : 0; break;
    case 'bana': s += 1 + Math.min(4, g.astraBanaCount) + (astrasInHand>0 ? 2+Math.min(3,astrasInHand) : 0); break;   // (c) play BEFORE the round's Astras
    case 'maricha': { const pool=[]; for (let t=0;t<2;t++) for (const u of g.players[t].units) if (!u.ghost && u.id!=='maricha') pool.push(effPower(g,t,u));
      s = pool.length? Math.max(...pool) : 3; break; }
    case 'vibhishana': s += 0.5; break;
    case 'tataka': s += 1.5; break;
    case 'kali': if (pl.chaosThisRound) s += 3; else if (astrasInHand>0) s -= 2; break;   // (e) hold Kali until after a Surge
    case 'berserker': s += Math.min(3, g.astraPlays); break;
    case 'naraka': s += opp.units.filter(u=>!u.ghost).length; break;
    case 'pashupata': { const foes=opp.units.filter(u=>!u.ghost); s = foes.length? 2+Math.min(foes.length*2, totalPower(g,pi)) : -99; break; }
    case 'nagastra': { const foes=opp.units.filter(u=>!u.ghost); s = foes.length? 1+foes.length : -99; break; }
    case 'tamasa': s = 2; break;
    case 'sanjivani': { const lk=g.lastKillThisRound; s = (lk && lk.owner===1-pi && opp.discard.includes(lk.unit))? 1+lk.unit.base : -99; break; }
    case 'ahamkara': { const real=pl.units.filter(u=>!u.ghost); s = real.length? Math.max(...real.map(u=>effPower(g,pi,u))) : -99; break; }
    case 'tripura': s = unitsInHand>=2 ? (astrasInHand ? 0.5 : 3) : -99; break;   // (a) only with a Unit-heavy hand; own Astras break it
    case 'chandrahas': s = astrasInHand>=2 ? 4 : -99; break;                       // (a) only worth playing holding 2+ Astras
    // ---- Vanara ----
    case 'hanuman': s += 3; break;                                  // build engine early
    case 'sugriva': s += 2; break;                                  // card advantage + enables others
    case 'angad': s += 2; break;
    case 'jambavan': s += pl.heroes.some(h=>h.id==='hanuman')? 3 : 1.5; break;
    case 'neela': s += 1 + pl.units.filter(u=>!u.ghost).length; break;
    case 'kesari': { const h=pl.heroes.find(x=>x.id==='hanuman'); s += h? h.power : 0; break; }
    case 'tara': s += 1.5; break;
    case 'dwivida': s += opp.hand.length? 2:0; break;
    case 'mainda': { const best=Math.max(0,...pl.units.filter(u=>!u.ghost).map(u=>effPower(g,pi,u))); s += Math.max(0, best-4)*0.5 + 1; break; }
    case 'sharabha': s += 1; break;
    case 'scout': s += pl.units.filter(u=>!u.ghost).length*0.5 + 0.5; break;
    case 'warrior': s += Math.min(4, pl.units.filter(u=>!u.ghost).length); break;
    case 'dadhimukha': s += pl.heroes.some(h=>h.id==='sugriva')? 2.5 : 1; break;
    case 'riksha': s += pl.heroes.some(h=>h.id==='hanuman')? 3 : 0; break;
    case 'nala': s += pl.hand.some(x=>x.t==='unit')? 1.5 : 0; break;
    case 'gandiva': { const spec=targetSpec(g,pi,c); s = spec.options.length? 2+Math.max(...spec.options.map(u=>effPower(g,1-pi,u))) : -99; break; }
    case 'lankadahan': { const foes=opp.units.filter(u=>!u.ghost); s = foes.length? 2+foes.length : -99; break; }
    case 'sanjeevani': { const lk=g.lastKillThisRound; s = (lk && lk.owner===pi && pl.discard.includes(lk.unit))? 1+lk.unit.base : -99; break; }
    case 'ramanaam': s = pl.units.filter(u=>!u.ghost).length ? 1+pl.units.filter(u=>!u.ghost).length*2 : -99; break;
    case 'kishkindhaoath': s = pl.units.some(u=>!u.ghost)? 1.5 : -99; break;
    case 'ramasignet': s += isNaga(opp) ? 5 : 1.5; break;   // EXP-M: Vanara AI prioritises Signet vs Nagas (floors venom)
    case 'kishkindhacrown': s += 2; break;
    // ---- Naga ----
    case 'vasuki': s += 2 + opp.units.filter(u=>!u.ghost).length; break;                 // body + on-play sweep + R3 venom
    case 'takshaka': s += opp.heroes.length? 2 : 1; break;
    case 'shesha': s += 2; break;
    case 'manasa': s += pl.units.filter(u=>!u.ghost).length + (opp.hand.some(x=>x.t==='astra')||opp.astrasThisRound>0? 2 : 0); break;
    case 'karkotaka': s += 2; break;
    case 'surasa': s += 1.5; break;
    case 'ulupi': s += pl.discard.some(x=>x.t==='unit'&&!x.ghost)? 2 : 0; break;
    case 'nagasadhu': s += opp.units.filter(u=>!u.ghost).length*0.7; break;
    case 'kaliya': s += g.round-1; break;
    case 'astika': s += (isNaga(opp)||opp.units.some(u=>!u.ghost&&u.venom>0))? 1.5 : 0.3; break;
    case 'nagaarcher': s += opp.units.some(u=>!u.ghost)? 1 : 0; break;
    case 'nagaenchantress': s += 1; break;
    case 'nagawarrior': s += venomTokenCount(g); break;
    case 'nagahatchling': s += opp.units.some(u=>!u.ghost && u.venom>0)? 2 : 0; break;
    case 'ashvatara': s += opp.units.some(u=>!u.ghost)? g.round : 0; break;
    case 'nagapasha': { const spec=targetSpec(g,pi,c); s = spec.options.length? 2+Math.max(...spec.options.map(u=>effPower(g,1-pi,u))) : -99; break; }
    case 'venomstrike': { const foes=opp.units.filter(u=>!u.ghost).length; s = foes>=2? 2+foes : (foes?1:-2); break; }
    case 'mohini': { const spec=targetSpec(g,pi,c); s = spec.options.length? 3+Math.max(...spec.options.map(u=>effPower(g,1-pi,u))) : -99; break; }
    case 'mrityunjaya': { const pool=[...pl.discard,...opp.discard].filter(u=>u.t==='unit'&&!u.ghost); s = pool.length? 2+Math.max(...pool.map(u=>u.base)) : -99; break; }
    case 'sarpasatra': { const real=pl.units.filter(u=>!u.ghost); const foes=opp.units.filter(u=>!u.ghost).length; s = real.length? 1+foes : -99; break; }
    case 'patala': s += 2.5; break;
    case 'anantacoil': s += 1.5; break;
  }
  // Chaos Surge upside: Asuras value Astras more with Units to buff, and much more once Chandrahas is down.
  if (c.t==='astra' && pl.faction==='asuras'){
    if (pl.units.some(u=>!u.ghost)) s += 1;
    if (chandrahasActive) s += (pl.astrasThisRound===0 ? 5 : 3);   // (b) prefer Astras; grab the doubled first one
  }
  // EXP-F: Bali's entry bonus only helps printed power ≥4 — value those Units up, nudge go-wide chaff down under Bali.
  if (c.t==='unit' && pl.faction==='vanaras' && pl.heroes.some(h=>h.id==='hanuman')){
    s += c.base>=4 ? (pl.units.some(u=>!u.ghost && u.id==='jambavan')?2:1) : -0.75;
  }
  // EXP-M: facing Nagas, each extra small body is just another Venom target — devalue go-wide chaff slightly (tall > wide).
  if (c.t==='unit' && isNaga(opp) && c.base<=3){
    const mine=pl.units.filter(u=>!u.ghost).length;
    s -= 0.5 + mine*0.15;
  }
  // TASK 22 BRIDGE SEQUENCING — while our OWN Living Bridge is on board and we are below the 4-Unit line, value playing
  // a Unit to build toward the round-end line-of-4 payoff. Bounded; play-selection weight ONLY (no pass/hold change).
  // Gated on the wave artifact → structurally unreachable flag-off (livingbridge is wave:1, never the launch artifact).
  if (c.t==='unit' && pl.artifact && pl.artifact.id==='livingbridge' && pl.units.filter(u=>!u.ghost).length < 4) s += 2;
  // ---- TASK D3: DEATHMATCH SCORING OVERLAY (id-gated on difficulty → advanced/beginner path byte-untouched) ----
  if (pl.difficulty==='deathmatch'){
    const O = DIFFICULTY.deathmatch.overlay;
    const foes = opp.units.filter(u=>!u.ghost);
    const bestEnemy = foes.length ? Math.max(...foes.map(u=>effPower(g,1-pi,u))) : 0;   // (b/c) PUBLIC best enemy threat
    if (DM_ANSWERS.has(c.id)){
      s += O.threatScale * bestEnemy;                       // (b) THREAT ANSWERS: scale removal/debuff with the real threat
      if (bestEnemy < O.holdThreshold) s -= O.holdPenalty;  // (c) HOLD DISCIPLINE: no real threat → keep the answer
    }
    if (DM_ENABLERS.has(c.id) && astrasInHand>0) s += O.seqEnabler;   // (a) SEQUENCING: enabler before the payoff Astras
    if (c.id==='kali' && !pl.chaosThisRound && (astrasInHand>0 || (pl.artifact && DM_ENABLERS.has(pl.artifact.id)))) s -= O.seqSurgeHold;   // (a) hold the surge-payoff one beat while enablers/Astras queue
  }
  return s;
}

/* ---------- DIFFICULTY (TASK D1) — one tuning block, adjust here ----------
   opts.difficulty ∈ {beginner, advanced, deathmatch}; ABSENT or 'advanced' = the launch AI, byte-identical.
   Per-player override for AI-vs-AI sims: opts.p0Difficulty / opts.p1Difficulty (default = opts.difficulty).
   Stored as pl.difficulty; ALL difficulty randomness draws from g.rng (seed discipline preserved).
   HONEST-AI RULE (unchanged at every tier): no difficulty path reads hidden information — the AI never inspects
   the opponent's hand/deck order; it decides only from public board/round state, exactly as the launch AI does. */
// TASK D3 — the deathmatch SCORING OVERLAY (active ONLY at 'deathmatch'; every constant lives here). All levers use
// PUBLIC board/hand-count state only — NO hidden-information read (the honest-AI rule: the AI never inspects the
// opponent's hand contents or deck order, at any difficulty). The overlay is applied at the tail of aiScoreCard
// under an explicit pl.difficulty==='deathmatch' gate, so the advanced/beginner scoring path is byte-untouched.
const DM_ANSWERS  = new Set(['vajra','gandiva','agneyastra','shaktispear','jatayu','mohanastra','sudarshana','vayavyastra','surpanakha','meghnad','tataka','vayu','ashvatara','nagapasha','worldcoil','vinatastalon','anjaneyaroar','naraka','sarpasatra']);   // single-target/removal/debuff "answers" — value scales with the real threat, held when there is none
const DM_ENABLERS = new Set(['chandrahas','blueprint']);   // engine-pieces that must land BEFORE the payoff Astras
const DIFFICULTY = {
  beginner:   { randomPlayP:0.5, autoMulligan:false, extraCard:0, extraDraw:0, concession:false },   // 50% uniformly-random legal play (else argmax); ALSO misaims (random legal target) + misplaces (random slot); NO mulligan; NO strategic early-pass — passes only when out of legal cards
  advanced:   { randomPlayP:0,    autoMulligan:false, extraCard:0, extraDraw:0, concession:false },  // the launch AI — zero code-path deviation
  deathmatch: { randomPlayP:0,    autoMulligan:true,  extraCard:1, extraDraw:1, concession:true,     // 11th setup card + extraDraw:1 at rounds 2&3 (deck-permitting) + the sharper concession + the scoring overlay
    overlay: {
      threatScale:   0.6,   // (b) THREAT ANSWERS: an answer's score += threatScale × best-enemy effPower (public board)
      holdThreshold: 5,     // (c) HOLD DISCIPLINE: if NO enemy Unit's effPower reaches this, devalue answers (keep them for real threats)
      holdPenalty:   3,     // (c) how much to devalue a held answer
      seqEnabler:    4,     // (a) SEQUENCING: land Chandrahas/Blueprint before spending Astras (+bonus while Astras are in hand)
      seqSurgeHold:  2,     // (a) SEQUENCING: nudge a lone surge-payoff (Kali) to wait one beat when Astras/enablers are queued
      concedeAt:    -10,    // (d) ROUND ECONOMY: concede a lost non-final round EARLIER than launch's −14 (bank the surplus)
      bleedLead:     8,     // (d) ROUND ECONOMY (the bleed): when comfortably ahead on BOARD and holding MORE cards, pass to bank cards
    } },
};
function difficultyOf(pl){ return DIFFICULTY[pl && pl.difficulty] || DIFFICULTY.advanced; }

function aiMove(g, pi){
  const pl=g.players[pi], opp=g.players[1-pi];
  const diff = difficultyOf(pl);
  const idxs = playableIndices(g, pi);
  const my=totalPower(g,pi), their=totalPower(g,1-pi);
  const lead = my-their;
  const mustWin = opp.roundWins===1;               // losing this round loses the match
  const wantWin = pl.roundWins===1;                // winning this round wins the match

  // BEGINNER (TASK D1): no strategy at all. With p=randomPlayP (g.rng) play a uniformly-random legal card,
  // else the argmax. NEVER strategically passes (no bluff/concede/coast) — passes ONLY when out of legal cards.
  if (diff.randomPlayP > 0){
    if (!idxs.length) return { pass:true };
    if (g.rng() < diff.randomPlayP) return { play: idxs[Math.floor(g.rng()*idxs.length)] };
    return { play: idxs.reduce((a,b)=> aiScoreCard(g,pi,pl.hand[a])>=aiScoreCard(g,pi,pl.hand[b])?a:b) };
  }

  // R20: a Nagapasha-bound Unit costs the owner a whole turn to free. Unbind if freeing it is worth more
  // than the best card play this turn (and it actually matters — contested round, not already coasting ahead).
  const bound = pl.units.filter(u=>u.bound && !u.ghost);
  if (bound.length && !(opp.passed && lead>0)){
    const t = bound.reduce((a,b)=>effPower(g,pi,a)>=effPower(g,pi,b)?a:b);
    const freeVal = effPower(g,pi,t);
    const bestScore = idxs.length ? Math.max(...idxs.map(i=>aiScoreCard(g,pi,pl.hand[i]))) : -Infinity;
    if (freeVal>=4 && freeVal>=bestScore) return { unbind:t.uid };
  }

  if (!idxs.length) return { pass:true };

  if (opp.passed){
    if (lead>0) return { pass:true };
    // find cheapest single play that flips the round
    let best=null;
    for (const i of idxs){
      const c=pl.hand[i];
      const gain = c.t==='unit'||c.t==='hero' ? c.p + (indraOnBoard(pl)&&c.t==='unit'?1:0) : aiScoreCard(g,pi,c)-c.p;
      if (gain > -lead){ if (!best || pl.hand[best].p>c.p) best=i; }
    }
    if (best!=null) return { play:best };
    // can't flip with one card: fight on if the match is at stake, else concede the round
    if (mustWin){ const i = idxs.reduce((a,b)=> aiScoreCard(g,pi,pl.hand[a])>=aiScoreCard(g,pi,pl.hand[b])?a:b); return { play:i }; }
    return { pass:true };
  }

  // opponent still active
  if (!mustWin && !wantWin && g.round===1 && lead>=10 && pl.hand.length<=opp.hand.length-1) return { pass:true }; // card-advantage bluff
  // (d) if behind and Mahabali is on our board, concede sooner — the Pass arms a free Unit + extra turn next round.
  const mahaOnBoard = pl.faction==='asuras' && pl.heroes.some(h=>h.id==='mahabali');
  const dmO = diff.overlay;   // deathmatch-only ROUND-ECONOMY knobs (undefined for advanced/beginner → the two branches below are inert on the shared path)
  let concedeAt = (mahaOnBoard && g.round<3) ? -8 : -14;
  if (dmO) concedeAt = Math.max(concedeAt, dmO.concedeAt);   // (d) DEATHMATCH concedes a lost non-final round EARLIER (−10) — banks the surplus for a winnable round
  if (!mustWin && lead<=concedeAt && g.round<3) return { pass:true };  // concede a lost round, preserve cards
  // (d) DEATHMATCH THE BLEED: comfortably ahead on BOARD and holding MORE cards in a non-final round → pass now and
  // bank the surplus (force the opponent to over-spend to reclaim the round, or concede it cheaply). Public counts only.
  if (dmO && !mustWin && !wantWin && g.round<3 && lead>=dmO.bleedLead && pl.hand.length>opp.hand.length) return { pass:true };

  // DEATHMATCH round-concession (TASK D1) — a SHARPER concede on top of the launch heuristics above.
  // RULE (verbatim): in a non-final round we do not need to win, pass when the round deficit exceeds the AI's
  // MAX remaining single-play swing (no one card can flip it) AND we hold ≥2 FEWER committed cards than the
  // opponent (banking the surplus for a later round). Uses only public state (board + visible card counts).
  if (diff.concession && !mustWin && g.round<3 && lead<0){
    const maxSwing = Math.max(...idxs.map(i=>{ const c=pl.hand[i]; return c.t==='unit'||c.t==='hero' ? c.p + (indraOnBoard(pl)&&c.t==='unit'?1:0) : aiScoreCard(g,pi,c)-c.p; }));
    const committed = pl.units.filter(u=>!u.ghost).length + pl.heroes.length + (pl.artifact?1:0);
    const oppCommitted = opp.units.filter(u=>!u.ghost).length + opp.heroes.length + (opp.artifact?1:0);
    if (-lead > maxSwing && committed <= oppCommitted-2) return { pass:true };
  }

  const i = idxs.reduce((a,b)=> aiScoreCard(g,pi,pl.hand[a])>=aiScoreCard(g,pi,pl.hand[b])?a:b);
  return { play:i };
}

// TASK 22 — Setu Stones AI anchor (advanced/deathmatch): pick the anchor Unit (the entering Unit is inserted right
// AFTER it) that maximizes interior formation value — units with BOTH neighbours non-ghost, Setu Mason double-weighted
// (the one position-dependent power in the pool, R40b). Tie-break: strongest ally, then lowest index (deterministic
// engine order, NO rng). Returns the anchor uid, or null when there is no friendly Unit (default placement stands).
function stonesAnchor(g, pi, card){
  const pl=g.players[pi];
  if (!pl.units.some(u=>!u.ghost)) return null;
  const wt=u=>(u.id==='setumason'?2:1);
  const interiorVal=order=>{ let v=0; for (let i=1;i<order.length-1;i++){ const u=order[i]; if(!u.ghost) v+=wt(u); } return v; };
  let best=null, bestV=-Infinity, bestPow=-Infinity;
  pl.units.forEach((a,idx)=>{ if (a.ghost) return;
    const order=pl.units.slice(); order.splice(idx+1,0,card);
    const v=interiorVal(order), pw=effPower(g,pi,a);
    if (v>bestV || (v===bestV && pw>bestPow)){ bestV=v; bestPow=pw; best=a.uid; } });
  return best;
}
// AI placement (Vanara Units only): slot the new Unit beside the strongest ally so Leap pairs form
// and Leap-enabled Units aren't edge-isolated. Non-Vanara / non-Unit → append (position irrelevant).
function aiPlacement(g, pi, card){
  const pl=g.players[pi];
  if (pl.faction!=='vanaras' || card.t!=='unit') return null;
  if (!pl.units.length) return 0;
  let bestIdx=0, bestP=-1;
  pl.units.forEach((u,idx)=>{ const p=effPower(g,pi,u); if (p>bestP){ bestP=p; bestIdx=idx; } });
  return bestIdx+1;                                   // immediately after the strongest ally
}
function aiTakeTurn(g, pi){
  const pl=g.players[pi];
  // LEAP is a FREE action (reverted from the costs-a-turn experiment): take the best beneficial Leap(s) before playing.
  // BEGINNER (TASK D1): skips beneficial Leaps too — a novice doesn't exploit the free Vanara tempo (honest: forgoes a good action).
  if (pl.faction==='vanaras' && difficultyOf(pl).randomPlayP===0){
    let guard=0;
    while (canLeap(g, pi) && guard++<4){
      const bl=bestLeap(g, pi);
      if (!bl || bl.gain < 3) break;                 // only spend a Leap on a meaningful gain
      doLeap(g, pi, bl.leaper, bl.target, false);
    }
  }
  const mv = aiMove(g, pi);
  if (mv.unbind!=null){                                    // R20: spend the turn to free a bound Unit
    const u=pl.units.find(x=>x.uid===mv.unbind);
    if (u){ u.bound=false; log(g, `${pl.name} wrenches ${u.n} free of the Nagapasha noose.`); }
    afterAction(g, pi); return;
  }
  if (mv.pass){ pass(g, pi); return; }
  // BEGINNER (TASK D1): also MISAIMS and MISPLACES — a random legal target + a random slot, instead of the
  // engine's null→optimal auto-pick. Uses ONLY targetSpec's public legal options (the same surface the advanced
  // AI reduces over) — no NEW hidden-information read. Advanced/deathmatch keep null (optimal auto-target) + aiPlacement.
  let tgt=null, pos=aiPlacement(g, pi, pl.hand[mv.play]);
  // TASK 22 STONES ANCHOR (advanced/deathmatch only; beginner keeps its random misplacement). When our OWN Setu Stones
  // is active and we play a Unit, set the anchor targetUid to the densest-cluster placement (playCard's setustones
  // branch turns targetUid → the adjacent entry slot). Structurally unreachable flag-off: Setu Stones is wave:1 →
  // never our artifact → block skipped, tgt stays null (byte-identical). No rng consumed.
  if (difficultyOf(pl).randomPlayP===0 && pl.hand[mv.play].t==='unit' && pl.artifact && pl.artifact.id==='setustones'){
    const anchor=stonesAnchor(g, pi, pl.hand[mv.play]);
    if (anchor!=null) tgt=anchor;
  }
  if (difficultyOf(pl).randomPlayP > 0){
    const spec = targetSpec(g, pi, pl.hand[mv.play]);
    if (spec && spec.options && spec.options.length) tgt = spec.options[Math.floor(g.rng()*spec.options.length)].uid;
    if (pl.faction==='vanaras' && pl.hand[mv.play].t==='unit') pos = Math.floor(g.rng()*(pl.units.filter(u=>!u.ghost).length+1));
  }
  playCard(g, pi, mv.play, tgt, pos);
}

/* ---------- Node export & simulation harness ---------- */
if (typeof module!=='undefined'){
  module.exports = { newGame, playCard, pass, aiMove, aiTakeTurn, totalPower, playableIndices, targetSpec, effPower, isShielded,
    canLeap, bestLeap, doLeap, adjacentUnits, leapLimit, sharabhaProtected,
    drainAmount, venomPassive, venomTokens, venomRoundEnd, venomKarkotakaEarly, sweepDeaths,
    mulligan, aiMulliganPlan, REALMS, REALM_INFO, designateShield, shieldCap,
    DECKS, DEVA_DECK_DEF, ASURA_DECK_DEF, VANARA_DECK_DEF, NAGA_DECK_DEF, RARITY_COLOR, RARITY_NAME, ASTRA_DMG,
    endRound, roundEndCardEffects, preDrainTokens, castMantra, moveUnit, swapUnits, adjacentUnits, destroyUnit, damageUnit,
    aiScoreCard, stonesAnchor, checkBridgeLine };   // moveUnit/swapUnits/adjacentUnits/preDrainTokens/destroyUnit/damageUnit exported for tests (benign; venomRoundEnd already exported above). TASK 22: aiScoreCard/stonesAnchor. TASK 23 (R63): checkBridgeLine for the behavioral matrix (benign, test-only).
}
