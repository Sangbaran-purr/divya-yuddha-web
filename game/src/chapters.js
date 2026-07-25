/* chapters.js — DIVYA YATRA / Book of Order data (schema per BOOK1_DESIGN §4).
   Prose (Brihaspati lines, plate text) verbatim from the design doc. Deck lists are
   ROLE-resolved against engine DECKS (selections logged in the build report).
   Loaded in the browser (window.CHAPTERS / window.STORY_PREDICATES) and in Node (module.exports). */
(function(root){

// Bonus/win predicates — pure functions of the FINAL game state g (roundHistory / players / winner / events).
// Named so they can be unit-tested against a synthetic stream (BOOK1_DESIGN §4).
// g.events accumulates across the WHOLE match (never cleared) — event-stream predicates see everything.
function _uidsIn(g, side, keys){ const p=(g.players&&g.players[side])||{}; const s=new Set();
  keys.forEach(k=>(p[k]||[]).forEach(c=>{ if(c) s.add(c.uid); })); return s; }
function _side0Uids(g){ return _uidsIn(g,0,['units','discard','hand','deck','heroes','removedHeroes']); }
function _side0HeroUids(g){ const s=_uidsIn(g,0,['heroes','removedHeroes']);
  ((g.players&&g.players[0]&&g.players[0].discard)||[]).forEach(c=>{ if(c&&c.t==='hero') s.add(c.uid); }); return s; }
// Astra names that emit a `destroy` event carrying the astra as the CAUSE (direct-kill / damage astras). Venom astras
// (Nagastra) kill via sweepDeaths→'reduced to 0', and Sudarshana REMOVES a Hero (no destroy) — so neither is here.
const ASTRA_DESTROY_CAUSES = new Set(['Vajra','Brahmastra','Pashupatastra','Gandiva Arrow','Lanka Dahan']);

const STORY_PREDICATES = {
  // CH1 bonus: win the single round by 5+ total power.
  ch1_margin5: g => { const h=g.roundHistory && g.roundHistory[0]; return !!h && h.winner===0 && (h.t0 - h.t1) >= 5; },
  // CH2 win.extra (structural): the match was won AFTER deliberately losing round 1.
  ch2_lostR1:  g => { const h=g.roundHistory && g.roundHistory[0]; return !!h && h.winner===1; },
  // CH2 bonus: win round 3 with 2+ cards still in hand.
  ch2_bonus_r3_hand2: g => (g.roundHistory||[]).length===3 && g.roundHistory[2].winner===0 && (g.players[0].hand||[]).length >= 2,
  // CH3 bonus: win with no friendly Unit destroyed by an enemy Astra — i.e. the shield lesson worked. VALIDATED
  // against real streams (see test_story): the ch3 opponent's telegraphed strike is Vajra (single-target, and unlike
  // AoE Pashupatastra it RESPECTS Dharma Shield). Shielding the champion (and not over-exposing a second big Unit to
  // the round-1 strike) fizzles Vajra → no astra death → EARNED; careless play (no shield) → Vajra kills → FAILED.
  ch3_no_astra_death: g => { const evs=g.events||[], s0=_side0Uids(g);
    return !evs.some(e=> e.type==='destroy' && ASTRA_DESTROY_CAUSES.has(e.abilityName) && (e.targetUids||[]).some(u=>s0.has(u))); },
  // CH4 bonus: revive at least one Unit with the revival Mantra. VALIDATED: Gayatri emits NO 'revive' event
  // (only Amrita Kalasha does) — so we detect the side-0 'play' of Gayatri Mantra (a Deva-only card, so any such
  // play event is the player's) AND that a side-0 Unit had actually fallen (a discard target existed).
  ch4_revived: g => { const evs=g.events||[], s0=_side0Uids(g);
    const playedGayatri = evs.some(e=> e.type==='play' && e.abilityName==='Gayatri Mantra');
    const anyDeath = evs.some(e=> e.type==='destroy' && (e.targetUids||[]).some(u=>s0.has(u)));
    return playedGayatri && anyDeath; },
  // CH5 bonus: no friendly Unit destroyed BY VENOM. VALIDATED: venom drains via venomLoss (emits a 'venom' event),
  // and the kill fires in sweepDeaths → destroyUnit(..., 'reduced to 0') — a GENERIC cause shared with any other
  // power-to-0 reduction. So we require a side-0 'destroy' with cause 'reduced to 0' on a uid that ALSO carried a
  // 'venom' event (the poison brought it down), not just any sweep death.
  ch5_no_venom_death: g => { const evs=g.events||[], s0=_side0Uids(g);
    const venomed=new Set(); evs.forEach(e=>{ if(e.type==='venom') (e.targetUids||[]).forEach(u=>venomed.add(u)); });
    return !evs.some(e=> e.type==='destroy' && e.abilityName==='reduced to 0' && (e.targetUids||[]).some(u=> s0.has(u) && venomed.has(u))); },
  // CH6 bonus: win with your Artifact on the board at match end. VALIDATED: endRound RETURNS at match-over BEFORE the
  // per-round board reset that clears artifacts — so the FINAL round's artifact persists into g.over. NO Asura card
  // removes an enemy Artifact (only Deva Vishwakarma can), so this fails only by CHOICE (never playing Amrita in the
  // deciding round). Star text must not imply protection.
  ch6_artifact_kept: g => g.winner===0 && !!(g.players && g.players[0] && g.players[0].artifact),
  // CH7 bonus: win with the boss's Chandrahas UNMADE — the taught graduation play (Vishwakarma unmakes the stolen
  // blade). VALIDATED: enemy-artifact destruction is STATE-ONLY (no event) — Vishwakarma sets opp.artifact=null and
  // increments the DESTROYER's counter players[0].artifactsDestroyedByMe (Yaksha Lok is the one realm that blocks it).
  // So: won AND the player destroyed ≥1 enemy Artifact (the boss's only Artifact is Chandrahas).
  ch7_unmake: g => g.winner===0 && !!g.players && (g.players[0].artifactsDestroyedByMe||0) > 0,
};

const CHAPTERS = {
  b1c1: {
    id:'b1c1', book:1, title:'The Throne Besieged', order:1,
    realm:'mrityulok', playerFaction:'devas', opponentFaction:'asuras',
    mode:'LOCKED',
    scenario:{
      p0Deck:['Yama','Surya Dev','Marut','Ashwini Kumars','Deva Soldier','Gandharva'],
      p0Hand:['Yama','Marut','Ashwini Kumars','Surya Dev','Deva Soldier'],
      p1Deck:['Vibhishana','Kali Asura','Asura Berserker','Maricha','Narakasura','Tataka'],
      winTarget:1, handSize:5, mulligan:0
    },
    // opponent: fully scripted, plays three weak Units then yields (BOOK1_DESIGN §3 CH1)
    opponentScript:[ {action:'play', cardName:'Vibhishana'}, {action:'play', cardName:'Kali Asura'}, {action:'play', cardName:'Asura Berserker'}, {action:'pass'} ],
    guidance:[
      { highlight:{card:'Yama'},           line:'The gate holds only if someone stands at it. Send the guard.', instruct:'Tap the glowing card: Yama — put a defender on the field.' },
      { highlight:{card:'Marut'},          line:'See their number rise? Power against power — the greater total holds the field.', instruct:'Tap the glowing card: Marut — add another unit to raise your total.' },
      { highlight:{card:'Ashwini Kumars'}, line:'Again. The wall is built one warrior at a time.', instruct:'Tap the glowing card: Ashwini Kumars — one more warrior on the wall.' },
      { highlight:{card:'Surya Dev'},      line:'They yield the field. One more — make the count beyond dispute — then rest your hand.', instruct:'Tap the glowing card: Surya Dev — a strong unit to seal the lead.' },
      { highlight:{action:'pass'},         line:'Rest your hand. Strength held in reserve is still strength.', instruct:'Tap PASS ROUND — you are ahead; stop here and win the round.' },
    ],
    // panels: { id, speaker?, plate, ambience? } — plate/speaker VERBATIM from BOOK1_CUTSCENE_BIBLE §3; ambience is a STUB slot
    cutscenes:{
      intro:[
        { id:'b1c1_i1', plate:"Swarga. The high seat of the gods, whose gates have not closed in a thousand years — because no one has ever dared approach them. Tonight, watch-fires burn along walls that were built as ornament. Tonight, the city is holding its breath.", ambience:null },
        { id:'b1c1_i2', plate:"They appear at dusk on the far ridge: raiders of the Asura lord Shukracharya, banners the color of dried blood. Too few to take the city. Too many to be ignored. This is not an invasion — it is a question, asked with spears: IS ANYONE STANDING AT THE GATE?", ambience:null },
        { id:'b1c1_i3', plate:"In the torchlit hall, the old guru Brihaspati sets a steadying hand on his king's shoulder. 'The gate holds only if someone stands at it, Indra. Come — I will show you how walls are made. Not from stone. From the living.'", ambience:null },
      ],
      victory:[ { id:'b1c1_v1', plate:"By morning the ridge is empty. The raiders melt back into the dark with their question answered: the wall of Swarga is not stone — it is warriors, standing shoulder to shoulder, and it does not break. Brihaspati smiles for the first time in days. 'They asked. We answered.'", ambience:null } ],
      defeat:[],
    },
    win:{ type:'matchWin' },
    bonus:{ predicateId:'ch1_margin5', label:'Win the round by 5 or more power', rewardId:'wave1-stub-b1c1' },
    rewards:{ xp:null, coins:null },
    unlocks:'b1c2',
  },

  b1c2: {
    id:'b1c2', book:1, title:'The Art of Yielding', order:2,
    realm:'mrityulok', playerFaction:'devas', opponentFaction:'asuras',
    mode:'LOCKED',
    scenario:{
      p0Deck:['Deva Soldier','Surya Dev','Yama','Vayu','Kubera','Urvashi','Marut','Ashwini Kumars','Gandharva','Vishwakarma'],
      p0Hand:['Deva Soldier','Surya Dev','Yama','Vayu','Kubera','Urvashi','Marut','Ashwini Kumars'],
      p1Deck:['Kumbhakarna','Ravana','Hiranyakashipu','Meghnad','Bana Asura','Vibhishana','Tataka','Maricha','Kali Asura','Asura Berserker'],
      winTarget:2, handSize:8, mulligan:0
    },
    // opponent overcommits round 1 (five Units), then hands off to the default AI for rounds 2-3
    opponentScript:[
      {action:'play', cardName:'Kumbhakarna'}, {action:'play', cardName:'Ravana'}, {action:'play', cardName:'Hiranyakashipu'},
      {action:'play', cardName:'Meghnad'}, {action:'play', cardName:'Bana Asura'}, {action:'pass'},
      {handoff:'ai'}
    ],
    guidance:[
      { highlight:{card:'Deva Soldier'}, line:'The raiders return in force. Do not meet fury with fury — send one soldier, no more.', instruct:'Tap the glowing card: Deva Soldier — play just one cheap unit, then stop.' },
      { highlight:{action:'pass'},       line:'Now yield the field. Every card they burn on an empty gate is a card they will not have when it matters.', instruct:'Tap PASS ROUND — let them win this one; you keep your cards for later.' },
      // sticky beat — rounds 2 & 3, guided by superior hand count (auto-highlight best; pass when ahead & thin)
      { highlight:{auto:'bestOrPass'},   line:'Six against three. Now the mathematics of patience — spend your advantage, and hold the last word.', instruct:'Tap the glowing card to play your best, or PASS ROUND when you lead — you have more cards than they do.' },
    ],
    cutscenes:{
      intro:[
        { id:'b1c2_i1', plate:"Seven days later the question returns — with an army behind it. The valley fills from ridge to ridge with crimson banners; the earth itself seems to march. On the walls, young warriors count the enemy and stop counting. There are numbers beyond which courage needs a plan.", ambience:null },
        { id:'b1c2_i2', plate:"Only the old guru is calm. He watches the horde the way a farmer watches a monsoon: something vast, arriving on schedule. 'Fury is a fire,' he says quietly. 'It burns hottest at first light — and everything it burns, it loses. Let them have the morning. We will own the afternoon.'", ambience:null },
      ],
      // mid-match: b1c2_i3 fires ONCE after round 1 resolves (the scripted loss), before round 2 — PULL-OUT per the motion manifest
      mid:[ { afterRound:1, panels:[ { id:'b1c2_i3', plate:"The field lies abandoned — banners still planted, positions swept away. The young warriors burn with the shame of it. Brihaspati does not. 'Look at them spending their strength on empty ground,' he says. 'We do not lose the morning. We LEND it. And every debt is collected.'", ambience:null } ] } ],
      victory:[ { id:'b1c2_v1', plate:"Noon. The Asura charge has spent itself against nothing, and now the Deva host sweeps down the slope with the sun behind it — fresh, whole, and owed a morning. What follows is not a battle. It is arithmetic. 'Six against three,' murmurs Brihaspati. 'Patience is also a weapon.'", ambience:null } ],
      defeat:[],
    },
    win:{ type:'matchWin', extra:'ch2_lostR1' },
    bonus:{ predicateId:'ch2_bonus_r3_hand2', label:'Win round 3 with 2+ cards in hand', rewardId:'wave1-stub-b1c2' },
    rewards:{ xp:null, coins:null },
    unlocks:'b1c3',
  },

  // ============================ CH.3 — THE WEAPONS OF HEAVEN ============================
  // SUGGESTED mode debuts. Teaches Astras (yours + theirs), Dharma Shield, the realm chip.
  b1c3: {
    id:'b1c3', book:1, title:'The Weapons of Heaven', order:3,
    realm:'swarga', playerFaction:'devas', opponentFaction:'asuras',
    mode:'SUGGESTED',
    // p0: Indra + 2 big Units (Surya/Yama, the "champions") + Vayu + low Units + Vajra (the answer) + Sudarshana.
    // p1: the telegraphed strike is VAJRA (single-target, and unlike AoE Pashupatastra it RESPECTS Dharma Shield —
    // this is what makes the shield lesson mechanically real; see the ch3 bonus). handSize 9 applies to BOTH (p1
    // draws 9 of 10); Vajra sits in p1's opening hand. BOOK1_DESIGN §3: "The Asuras unveil a true Astra."
    scenario:{
      p0Deck:['Indra','Surya Dev','Yama','Vayu','Marut','Ashwini Kumars','Gandharva','Vajra','Sudarshana Chakra'],
      p1Deck:['Ravana','Bana Asura','Meghnad','Vajra','Narakasura','Kali Asura','Asura Berserker','Vibhishana','Shukracharya','Tamasa'],
      handSize:9, mulligan:0
    },
    // T1–T3 Units, [MID PANEL before T4], T4 = Vajra at the player's strongest 6+ Unit — DEFLECTED if that Unit is
    // Dharma-Shielded (it then finds no mark and fizzles), then AI.
    opponentScript:[ {action:'play', cardName:'Ravana'}, {action:'play', cardName:'Bana Asura'}, {action:'play', cardName:'Meghnad'}, {action:'play', cardName:'Vajra'}, {handoff:'ai'} ],
    introLine:'The realm itself takes sides evenly — read the sky before you read your hand.',
    // Beats steer the winning DEFENSIVE line: play the champion, SHIELD it before the strike, develop small Units
    // (hold your other great Unit back so the blade finds no second mark), survive Vajra, then answer + deploy.
    guidance:[
      { highlight:{card:'Surya Dev'},                    line:'Send your radiance first — the champion the blade will seek.', instruct:"Tap Surya Dev — he is your champion this battle. The enemy's blade will come for him." },
      { highlight:{shield:'strongest'},                  line:'The blade seeks your champion. Shield first; strike after.', instruct:"Tap SHIELD, then tap Surya Dev. The shield will make the enemy's Vajra fizzle." },
      { highlight:{card:'Marut'},                        line:'Hold your greater warriors in reserve — give the blade no second mark.', instruct:"Tap Marut — play small for now. Save your strong cards." },
      { highlight:{card:'Vajra', target:'largestEnemy'}, line:'The strike is spent. Now answer — Heaven’s weapons answer only when heaven is ready.', instruct:"Tap Vajra, then tap the enemy's biggest unit — destroy it." },
      { highlight:{auto:'bestOrPass'},                   line:'The sky is yours. Bring your host to bear.', instruct:"Play your best card, or tap PASS ROUND if you are ahead." },
    ],
    // b1c3_i1/i3/v1 all ship dedicated art in assets/story (T56: the b1c3_i3 board-reuse override was retired — it now resolves through cutImgUrl like every other panel).
    cutscenes:{
      intro:[
        { id:'b1c3_i1', plate:"Shukracharya has stopped asking questions. On a ridge above the battlefield he raises a blade that should not exist — white fire along its edge, and a light that every Deva recognizes with a chill: the light of their OWN heaven. A stolen spark of Indra's thunderbolt, in an enemy's hand. The age of raids is over. The age of weapons has begun.", ambience:null },
        { id:'b1c3_i3', m:{ from:'scale(1.18)', to:'scale(1.06)', origin:'50% 50%', dur:8, ease:'ease-out', vfx:'none' }, plate:"The armies meet in Swarga itself, before the thousand-petal throne. Here even the realm takes a side — every hero stands taller on home ground. Brihaspati's counsel is one line: 'Read the sky before you read your hand.'", ambience:null },
      ],
      // MID: after the opponent's 3rd turn resolves, before the Astra turn (VAJRA). Two panels over the blade image
      // (b1c3_i1): the softened telegraph, then a Brihaspati aside making the Asuras' BORROWED Vajra diegetic — both
      // play before the strike resolves (the whole mid cutscene runs, then pump() → the player's turn → the Astra turn).
      mid:[ { afterTurn:{ side:1, count:3 }, panels:[
        { id:'b1c3_i1', m:{ from:'scale(1.05)', to:'scale(1.12)', origin:'50% 40%', dur:4, ease:'ease-out', vfx:'none' }, dim:true, plate:"The stolen blade rises. It is aimed at your champion.", ambience:null },
        { id:'b1c3_i1', m:{ from:'scale(1.12)', to:'scale(1.17)', origin:'50% 40%', dur:5, ease:'ease-out', vfx:'none' }, dim:true, speaker:'Brihaspati', plate:"That light is not his. He carries a stolen spark of heaven — and mark me, Indra: a man who steals a weapon will steal greater things before this war ends. Shield your champion. NOW.", ambience:null },
      ] } ],
      victory:[ { id:'b1c3_v1', plate:"The stolen fire breaks against the Dharma Shield like a wave against the mountain — and then heaven answers with the true bolt, from the true hand. Shukracharya withdraws, studying his scorched blade with those cold eyes. He has learned what he came to learn. So have you: heaven's weapons answer only when heaven is ready.", ambience:null } ],
      defeat:[],
    },
    win:{ type:'matchWin' },
    bonus:{ predicateId:'ch3_no_astra_death', label:'Win with no Unit lost to an enemy Astra', rewardId:'wave1-stub-b1c3' },
    rewards:{ xp:null, coins:null },
    unlocks:'b1c4',
  },

  // ============================ CH.4 — THE CHURNING BEGINS ============================
  // Teaches Mantras (revival) + the MULLIGAN (first time in story). Gandharva realm (Mantra plane).
  b1c4: {
    id:'b1c4', book:1, title:'The Churning Begins', order:4,
    realm:'gandharva', playerFaction:'devas', opponentFaction:'asuras',
    mode:'SUGGESTED',
    // p0Deck 12 (10 Units + Gayatri revival Mantra + Pavamana cleanse Mantra) — DELIBERATELY >handSize so the
    // mulligan can draw NEW cards (a 10-card deck fully drawn leaves an empty deck → mulligan is a no-op) and so
    // rounds 2–3 have draws. p1Deck 12 with Pashupatastra ordered into the opening hand (the guaranteed casualty).
    // Indra is included (a Hero) — the pack's "8 Units + 2 Mantras" (no Hero) loses every headless seed even with
    // competent play; ch4 teaches Mantras and carries NO removal Astra, so it needs the Indra aura AND a de-fanged
    // opponent (Ravana / Kumbhakarna / Hiranyakashipu excluded) to be winnable. Both deviations reported to the owner.
    scenario:{
      p0Deck:['Indra','Surya Dev','Yama','Vayu','Marut','Ashwini Kumars','Gandharva','Deva Soldier','Kubera','Urvashi','Gayatri Mantra','Pavamana'],
      p1Deck:['Bana Asura','Meghnad','Narakasura','Pashupatastra','Kali Asura','Asura Berserker','Vibhishana','Tataka','Maricha','Kalanemi','Tamasa'],
      handSize:10, mulligan:3
    },
    mulliganLine:'Three of your ten may return to the deck. A wise hand is chosen twice.',
    opponentScript:[ {action:'play', cardName:'Bana Asura'}, {action:'play', cardName:'Meghnad'}, {action:'play', cardName:'Narakasura'}, {action:'play', cardName:'Pashupatastra'}, {handoff:'ai'} ],
    guidance:[
      { highlight:{card:'Surya Dev'},   line:'The churning has begun. Build your line — the sea gives to the steady.', instruct:'Tap the glowing card: Surya Dev — start your line of units.' },
      { highlight:{card:'Yama'},        line:'Another. What the ocean raises, it can also take.', instruct:'Tap the glowing card: Yama — add another unit to the field.' },
      { highlight:{card:'Gayatri Mantra'}, holdForCard:true, line:'What the churning takes, the sacred word returns.', instruct:'You lost a warrior — tap Gayatri Mantra to raise them back from the discard.' },   // holdForCard: waits at this beat until a unit is in discard (the scripted Pashupatastra kill) so Gayatri is legal
      { highlight:{auto:'bestOrPass'},  line:'Now play the tide — spend when you lead, hold when you must.', instruct:'Tap the glowing card to play your best, or PASS ROUND when you lead.' },
    ],
    cutscenes:{
      intro:[
        { id:'b1c4_i1', plate:"The war stops — not for peace, but for a prize. Deep beneath the ocean of milk sleep treasures that neither heaven nor the underworld can raise alone, and so, for one impossible season, Deva and Asura share a rope. The serpent king Vasuki offers his own body as the cord; the mountain Mandara becomes the churn. A truce, of a kind.", ambience:null },
        { id:'b1c4_i2', plate:"Hand over hand, in opposite rhythm, the two armies pull. Gods haul beside the demons they fought yesterday; demons match the pull of gods they will fight tomorrow. The ocean turns. The world holds its breath.", ambience:null },
        { id:'b1c4_i3', plate:"And the deep begins to give. Lights rise beneath the silver water — the first treasures of the churning, older than the gods' remembering. But Brihaspati watches the glow with narrowed eyes. 'The sea gives to the steady,' he murmurs. 'And it takes from everyone.'", ambience:null },
      ],
      victory:[ { id:'b1c4_v1', plate:"The churning's first price was paid in warriors — and answered in words. Where the sacred syllables fall, a column of golden light stands a fallen Deva back on his feet, whole, blinking at the sky. The young soldiers stare. Brihaspati only nods. 'What the churning takes, the sacred word returns.'", ambience:null } ],
      defeat:[],
    },
    win:{ type:'matchWin' },
    bonus:{ predicateId:'ch4_revived', label:'Revive at least one Unit', rewardId:'wave1-stub-b1c4' },
    rewards:{ xp:null, coins:null },
    unlocks:'b1c5',
  },

  // ============================ CH.5 — THE POISON RISES ============================
  // First fight vs NAGAS. Teaches Venom from the receiving end + cleansing. Patala realm (boosts Astra dmg, NOT venom).
  b1c5: {
    id:'b1c5', book:1, title:'The Poison Rises', order:5,
    realm:'patala', playerFaction:'devas', opponentFaction:'nagas',
    mode:'SUGGESTED',
    // p0Deck = ch4's list; p0Hand guarantees Pavamana (the cleanse) in the opening hand (handSize 10 of 12 could
    // otherwise leave it in the deck). p1Deck 12 Naga with on-entry Venom appliers foregrounded (Naga Sadhu venoms
    // ALL, Naga Archer venoms one). Karkotaka intentionally EXCLUDED so ticks stay at round-end (cleaner lesson).
    // Indra included (same rationale as ch4 — no-Hero loses every seed; ch5 also has no removal Astra, only the
    // cleanse). p1 is a LIGHT Naga list (Vasuki / Kaliya / Ashvatara excluded) so the poison is a lesson, not a rout:
    // with these the player wins 12/12 AND the cleanse holds venom deaths to zero (bonus achievable). Reported.
    scenario:{
      p0Deck:['Indra','Surya Dev','Yama','Vayu','Marut','Ashwini Kumars','Gandharva','Deva Soldier','Kubera','Urvashi','Gayatri Mantra','Pavamana'],
      p0Hand:['Indra','Surya Dev','Yama','Vayu','Marut','Ashwini Kumars','Gandharva','Deva Soldier','Kubera','Pavamana'],
      p1Deck:['Naga Sadhu','Nagastra','Naga Archer','Naga Warrior','Naga Hatchling','Astika','Ulupi','Naga Warrior','Naga Hatchling','Naga Enchantress','Astika','Naga Enchantress'],
      handSize:10, mulligan:3
    },
    introLine:'Their kingdom sharpens blades, not fangs. Small mercies.',
    round2Line:'A short battle starves a slow poison — end rounds quickly.',
    // Naga Sadhu venoms ALL, Nagastra venoms ALL again (2 tokens board-wide), Naga Archer stacks one more — the player
    // FEELS the drain (tokens visible, power bleeding), but Deva boards clear between rounds so venom rarely KILLS
    // (reported): the bonus reflects power-pressure, earned by cleansing, not a routine unit-death gate.
    opponentScript:[ {action:'play', cardName:'Naga Sadhu'}, {action:'play', cardName:'Nagastra'}, {action:'play', cardName:'Naga Archer'}, {handoff:'ai'} ],
    guidance:[
      { highlight:{card:'Surya Dev'},  line:'They open with poison, not steel. Stand your line and watch the marks.', instruct:'Tap the glowing card: Surya Dev — hold your line against the poison.' },
      { highlight:{concept:true},      line:'Poison does not duel. It waits.', instruct:'The green marks are Venom — poisoned warriors lose power when the round ends.' },   // T60b R4: concept beat — teaches the Venom marks, no card glow
      { highlight:{card:'Pavamana'},   line:'What the poison stains, the sacred breath washes.', instruct:'Tap Pavamana — it cleanses the Venom from your warriors.' },
      { highlight:{auto:'bestOrPass'}, line:'A short battle starves a slow poison.', instruct:'If you are ahead, tap PASS ROUND — a quick end gives the poison no time to feed.' },
    ],
    cutscenes:{
      intro:[
        { id:'b1c5_i1', plate:"Before the nectar — the price. The glow beneath the ocean curdles; silver water turns black-green from the churn point outward, and every living thing on both shores feels it at once, like a held note gone wrong. The ocean's first true gift is rising. Its name is Halahala.", ambience:null },
        { id:'b1c5_i2', plate:"It does not attack. It simply IS — a column of world-poison climbing the sky, and everything near it lessens: color, breath, courage. Gods and demons alike shield their faces. One drinks it down so the worlds will not — and the churning survives its own firstborn.", ambience:null },
        { id:'b1c5_i3', plate:"But poison remembers. What spilled ran down into the dark water, and the serpents drank deep — and turned. In the blackness beneath the waves, pairs of teal eyes are opening. The Nagas remember whose churning spilled it.", ambience:null },
      ],
      // MID: on the FIRST Venom tick against the player — b1c5_i2 reused (RISE, faster 5s). The Brihaspati venom
      // line BECOMES the plate (suppress the duplicate dialogue bubble — handled by the driver via ctx 'mid').
      mid:[ { afterEvent:{ type:'venom', side:0 }, panels:[ { id:'b1c5_i2', m:{ from:'scale(1.12) translateY(5%)', to:'scale(1.12) translateY(-5%)', origin:'50% 50%', dur:5, ease:'linear', vfx:'smoke-heavy-green' }, plate:'Poison does not duel. It waits.', ambience:null } ] } ],
      victory:[ { id:'b1c5_v1', plate:"The black mist burns off your warriors' armor in threads of white-gold light, and breath returns to the line like dawn returning to water. The serpents sink back into the deep — patient, unbeaten, remembering. Brihaspati exhales at last. 'Poison does not duel. But it can be answered.'", ambience:null } ],
      defeat:[],
    },
    win:{ type:'matchWin' },
    bonus:{ predicateId:'ch5_no_venom_death', label:'Lose no Unit to Venom', rewardId:'wave1-stub-b1c5' },
    rewards:{ xp:null, coins:null },
    unlocks:'b1c6',
  },

  // ============================ CH.6 — THE NECTAR AND THE NET ============================
  // FREE mode debuts (no guidance mask/glow). Teaches Artifacts (Amrita Kalasha) + RANDOM realm. First fully honest match.
  b1c6: {
    id:'b1c6', book:1, title:'The Nectar and the Net', order:6,
    realm:null, playerFaction:'devas', opponentFaction:'asuras',   // realm null → RANDOM (first unforced realm in story)
    mode:'FREE',
    // NEAR-REAL Deva graduation deck. NOTE (reported): the pack's "8 Units + Amrita + Gayatri + Pavamana" (no removal)
    // cannot hit the acceptance bands — an honest heavy-Asura match is a hard cliff (0% vs 100%). Two removals are added
    // so the deck can ANSWER the opponent's threats (and the ch7 boss's Chandrahas): VAJRA (unit removal) + VISHWAKARMA
    // (the "Divine Architect" — unmakes the enemy Artifact, the diegetic answer to the stolen moon-blade). p1 = de-fanged
    // Asura tier, NO Kumbhakarna/Ravana (either makes the go-wide Deva board un-winnable) → the honest match is ~9-12/12.
    scenario:{
      p0Deck:['Indra','Surya Dev','Yama','Vayu','Vishwakarma','Brihaspati','Marut','Ashwini Kumars','Kubera','Amrita Kalasha','Vajra','Pavamana'],
      p1Deck:['Bana Asura','Meghnad','Narakasura','Kali Asura','Asura Berserker','Vibhishana','Tataka','Maricha','Kalanemi','Kali Asura','Pashupatastra','Tamasa'],
      handSize:10, mulligan:3
    },
    opponentScript:[ {handoff:'ai'} ],   // FREE: the default AI plays from turn 1 — no script
    introLine:'Some treasures do not strike. They simply refuse to stop giving.',   // Artifact line, once at match start (a pointer, not a beat)
    introInstruct:'Play Amrita Kalasha when you choose — Artifacts add no power, but stay on the field and keep working.',   // plain-language dual-line under the aphorism
    artifactShimmer:'Amrita Kalasha',    // the Artifact card gets a one-time shimmer highlight in hand
    cutscenes:{
      intro:[
        { id:'b1c6_i1', plate:"Last of all — after the poison, after every treasure the deep had tested them with — the ocean parts around a vessel of gold. Amrita. The undying draught. Water sheets off the Kalasha like the sea itself bowing out of the way, and for one heartbeat, both armies forget to breathe.", ambience:null },
        { id:'b1c6_i2', plate:"Then the heartbeat ends. Every hand with a claim reaches at once — godly gold and demon crimson, tendons taut around one prize that cannot be shared. The rope that held the truce is fraying, strand by strand. Truces, too, are mortal.", ambience:null },
      ],
      victory:[ { id:'b1c6_v1', plate:"The Kalasha rests on a Deva altar, pouring soft light that never diminishes — a treasure that wins no battles and never stops mattering. Brihaspati stands back from your victory and says nothing at all, and that is his highest praise. Some treasures do not strike. They simply refuse to stop giving.", ambience:null } ],
      defeat:[],   // shared b1_defeat (DEFEAT_PANELS) played by the driver
    },
    win:{ type:'matchWin' },
    // No Asura card removes an enemy Artifact (only Deva Vishwakarma) → this fails only by CHOICE (play Amrita in the
    // deciding round). Star text avoids any protection claim.
    bonus:{ predicateId:'ch6_artifact_kept', label:'The Kalasha never left the field', rewardId:'wave1-stub-b1c6' },
    rewards:{ xp:null, coins:null },
    unlocks:'b1c7',
  },

  // ============================ CH.7 — THE BETRAYAL (BOSS) ============================
  // Graduation: FULL rules, real opponent, no guidance. Boss plate on the VS screen; Brihaspati silent except on loss.
  b1c7: {
    id:'b1c7', book:1, title:'The Betrayal', order:7,
    realm:null, playerFaction:'devas', opponentFaction:'asuras',   // RANDOM realm
    mode:'FREE', boss:true, bossName:'Shukracharya', bossEpithet:'Master of Mritasanjivani',
    // p0 = the ch6 graduation deck UNCHANGED (familiarity is the point). p1 = BOSS list TUNED to the 6–10 band: ONE heavy
    // (Kumbhakarna) + Chandrahas + Pashupatastra. Adding a second heavy (Ravana/Hiranyakashipu) OR the Mahabali Hero
    // pushes it to 0% — so they are EXCLUDED (reported; Mahabali works across the handoff, he is just too strong). p1Hand
    // GUARANTEES Chandrahas + the two scripted opener Units. Measured ≈6.6/12 (49–59% over 4×96-seed samples) — in band.
    scenario:{
      p0Deck:['Indra','Surya Dev','Yama','Vayu','Vishwakarma','Brihaspati','Marut','Ashwini Kumars','Kubera','Amrita Kalasha','Vajra','Pavamana'],
      p1Deck:['Kumbhakarna','Bana Asura','Chandrahas','Meghnad','Narakasura','Kalanemi','Maricha','Kali Asura','Pashupatastra','Tamasa','Asura Berserker','Vibhishana'],
      p1Hand:['Kumbhakarna','Bana Asura','Chandrahas','Meghnad','Narakasura','Kalanemi','Pashupatastra','Tamasa','Kali Asura','Maricha'],
      handSize:10, mulligan:3
    },
    // LIVE_GAME_DESIGN boss pattern: two Units, then Chandrahas online by T3 (amplified Astra threat), then default AI.
    opponentScript:[ {action:'play', cardName:'Kumbhakarna'}, {action:'play', cardName:'Bana Asura'}, {action:'play', cardName:'Chandrahas'}, {handoff:'ai'} ],
    cutscenes:{
      intro:[
        { id:'b1c7_i1', plate:"It happens between one breath and the next. Shukracharya — one-eyed, unhurried, cold as his stolen blade — walks out of the truce with the Amrita in his hands, and the truce dies where it stands. Brihaspati's old warning walks the earth at last: a man who steals a weapon will steal greater things.", ambience:null },
        { id:'b1c7_i2', plate:"No councils. No demands. Two armies wheel to face each other beneath a splitting sky, gold against crimson, everything the churning built balanced on the edge of one blade. And the last battle of the churning begins.", ambience:null },
      ],
      // MID at boss T3 (Chandrahas resolves): b1c7_i2 reused, fast PULL-OUT + THE LIGHTNING FLASH (book's single use) +
      // dim. The BOSS speaks (his one line of the chapter), plate-style.
      mid:[ { afterTurn:{ side:1, count:3 }, panels:[ { id:'b1c7_i2', m:{ from:'scale(1.16)', to:'scale(1.08)', origin:'50% 55%', dur:4, ease:'ease-out', vfx:'none' }, dim:true, flash:true, speaker:'Shukracharya', plate:"The old man taught you patience. I have been patient longer than your heaven has stood. The moon-blade is drawn — everything I have, at once. Answer it, if heaven still can.", ambience:null } ] } ],
      // VICTORY: the two-phase MOHINI DRIFT (keyframed) — RISE to the vessel, hold, then a slow lateral drift toward the
      // right-edge silhouette (the Book 2 hook, delivered by the camera).
      victory:[ { id:'b1c7_v1', mohini:true, plate:"The Amrita comes home under a clearing sky, held high in Deva hands while crimson banners fall away into the distance. The churning is over; the war is not — Shukracharya escapes with his cold eye already measuring the next theft. And as for how the nectar STAYED home... that is another book.", ambience:null } ],
      defeat:[],
    },
    win:{ type:'matchWin' },
    bonus:{ predicateId:'ch7_unmake', label:'The stolen blade, unmade', rewardId:'wave1-stub-b1c7' },
    rewards:{ xp:null, coins:null },
    unlocks:null,
  },
};

// Shared DEFEAT cutscene (bible §3 b1_defeat) — the driver plays it on a loss for ALL seven chapters, replacing the
// text-only defeat plate, before the retry panel. Motion: very-slow PUSH-IN on Brihaspati's face (spec §ch6–7 pack).
const DEFEAT_PANELS = [ { id:'b1_defeat', m:{ from:'scale(1.04)', to:'scale(1.10)', origin:'50% 38%', dur:9, ease:'linear', vfx:'none' }, speaker:'Brihaspati', plate:'Defeat is a teacher with poor manners. Sit with the lesson; then stand.', ambience:null } ];

// Book 1 has no more locked chapters (ch6–7 shipped).
const LOCKED_STUBS = [];

const OUT = { CHAPTERS, STORY_PREDICATES, LOCKED_STUBS, DEFEAT_PANELS };
if (typeof module!=='undefined' && module.exports) module.exports = OUT;
else { root.CHAPTERS=CHAPTERS; root.STORY_PREDICATES=STORY_PREDICATES; root.LOCKED_STUBS=LOCKED_STUBS; root.DEFEAT_PANELS=DEFEAT_PANELS; }

})(typeof window!=='undefined'?window:this);
