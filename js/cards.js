/* ============================================================================
   CARD MAP — cardId -> { name, epithet, frame }.
   SEED SET: the 22 accepted Vanara launch run (the plates this museum was built
   for, DESIGN §11.3). The keys 1..22 are a SEED convention for the accepted run;
   the real WaveCardNFT cardId <-> card mapping is an off-chain metadata
   convention fixed at the metadata freeze (WaveCardNFT.cardOf returns the id).
   Frame filenames follow the game's canonical pattern:
     powered:   Vanaras_{Type}_{NameStripped}_P{power}_r{Rarity}.png
     powerless: Vanaras_{Type}_{NameStripped}_r{Rarity}.png
   Frame IMAGE files are OWNER-SUPPLIED LATER; until they land the treasury
   renders a carved name-plate placeholder. `frameBase` is where they will live.

   EXTENSION POINT: add wave/other-faction entries below by cardId. Nothing here
   is authority for economics — it is a display map only.
   ========================================================================= */
window.DY_CARDS = {
  // where card-frame PNGs will be served from once the owner supplies them.
  frameBase: "assets/cards/",

  // cardId -> card. (Vanara launch run seed.)
  byId: {
    1: { name: "Hanuman", epithet: "Devotion Incarnate", frame: "Vanaras_Hero_Hanuman_P9_rLegendary.png" },
    2: { name: "Sugriva", epithet: "King of the Vanaras", frame: "Vanaras_Hero_Sugriva_P6_rEpic.png" },
    3: { name: "Angad", epithet: "The Unyielding Messenger", frame: "Vanaras_Hero_Angad_P7_rEpic.png" },
    4: { name: "Nala", epithet: "The Bridge Builder", frame: "Vanaras_Unit_Nala_P5_rEpic.png" },
    5: { name: "Neela", epithet: "Commander of the Vanguard", frame: "Vanaras_Unit_Neela_P5_rRare.png" },
    6: { name: "Jambavan", epithet: "The Ancient Bear King", frame: "Vanaras_Unit_Jambavan_P6_rEpic.png" },
    7: { name: "Kesari", epithet: "Father of Hanuman", frame: "Vanaras_Unit_Kesari_P5_rRare.png" },
    8: { name: "Tara", epithet: "Queen of the Vanaras", frame: "Vanaras_Unit_Tara_P4_rRare.png" },
    9: { name: "Dwivida", epithet: "The Rogue Vanara", frame: "Vanaras_Unit_Dwivida_P5_rRare.png" },
    10: { name: "Mainda", epithet: "The Swift Striker", frame: "Vanaras_Unit_Mainda_P4_rUncommon.png" },
    11: { name: "Sharabha", epithet: "The Forest Sentinel", frame: "Vanaras_Unit_Sharabha_P3_rUncommon.png" },
    12: { name: "Vanara Scout", epithet: "Eyes of the Jungle", frame: "Vanaras_Unit_VanaraScout_P2_rCommon.png" },
    13: { name: "Vanara Warrior", epithet: "Loyal to the Last", frame: "Vanaras_Unit_VanaraWarrior_P3_rCommon.png" },
    14: { name: "Dadhimukha", epithet: "Guardian of Madhuvana", frame: "Vanaras_Unit_Dadhimukha_P3_rUncommon.png" },
    15: { name: "Riksha", epithet: "Son of the Wind", frame: "Vanaras_Unit_Riksha_P4_rRare.png" },
    16: { name: "Gandiva Arrow", epithet: "Blessed Shaft", frame: "Vanaras_Astra_GandivaArrow_rRare.png" },
    17: { name: "Lanka Dahan", epithet: "Fire of Hanuman", frame: "Vanaras_Astra_LankaDahan_rLegendary.png" },
    18: { name: "Sanjeevani Call", epithet: "Mountain of Life", frame: "Vanaras_Astra_SanjeevaniCall_rUncommon.png" },
    19: { name: "Rama Naam", epithet: "The Name Above All", frame: "Vanaras_Mantra_RamaNaam_rRare.png" },
    20: { name: "Kishkindha Oath", epithet: "Bond of Warriors", frame: "Vanaras_Mantra_KishkindhaOath_rUncommon.png" },
    21: { name: "Rama's Signet", epithet: "Seal of Trust", frame: "Vanaras_Artifact_RamasSignet_rRare.png" },
    22: { name: "Kishkindha Crown", epithet: "Throne of Unity", frame: "Vanaras_Artifact_KishkindhaCrown_rMythic.png" },
    // --- extension point: add further cardId entries here (wave cards, other factions) ---
  },

  lookup: function (cardId) {
    var id = typeof cardId === "bigint" ? Number(cardId) : cardId;
    var c = this.byId[id] || { name: "Card #" + id, epithet: "Awaiting its plate", frame: null };
    // the seed run is entirely Vanara; extension-point entries should carry
    // their own `faction` (used by the treasury chamber filter).
    return { name: c.name, epithet: c.epithet, frame: c.frame, faction: c.faction || "vanaras" };
  },
};
