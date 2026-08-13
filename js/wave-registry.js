/* ============================================================================
   DY_WAVE_REGISTRY — the committed wave-card catalog (S-WAVE-REGISTRY / LEG1.5).

   THIS FILE IS THE SOLE CATALOG AUTHORITY for wave cards. The admin Wave Drop
   picker sources its base list from here (status "held" cards are NOT droppable);
   the treasury shelf resolves wave-card identity + art from here. A dyadmin::
   localStorage waveCards entry is a TESTNET-ONLY per-cardId OVERRIDE on top.
   Launch cards (1-25) NEVER appear here; they live in js/cards.js (DY_CARDS).

   cardId NUMBERING LAW (W-PRICE-1): launch 1-25 | Wave 1 = 101-188 | season N =
   N*100+1 onward. Hundred-blocks; season == Math.floor(cardId/100).

   THE SETU STONES is HELD for wave-1.1 (R82): seat 188 reserved, status "held",
   art/supply null — a reserved seat, not a missing card.
   cardId 101 = Deva Sainika: the fresh-contract test token minted as cardId 101 is
   ABSORBED as Deva Sainika edition #1 (owner-ruled); the test-card name dies.

   FIELDS (nullable = honest-null until determined, never invented): cardId, name
   (canonical engine display name — never the art stem), faction, season, rarity,
   type, art (frame stem+".png" on the explore.js road, or null), supply (W-PRICE-1
   edition cap by rarity: M10/L20/E50/R70/U100/C200), priceDYC (null until priced),
   status ("live" | "held"). ⚠ Ushas / Saranyu carry the engine's short names though
   their art frames title them fuller (an art-vs-engine naming divergence).
   ========================================================================= */
window.DY_WAVE_REGISTRY = {
  byId: {
    101: { cardId: 101, name: "Deva Sainika", faction: "devas", season: 1, rarity: "Common", type: "Unit", art: "Devas_Unit_DevaSainika_P3_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    102: { cardId: 102, name: "Agneyastra", faction: "devas", season: 1, rarity: "Rare", type: "Astra", art: "Devas_Astra_Agneyastra_rRare.png", supply: 70, priceDYC: null, status: "live" },
    103: { cardId: 103, name: "Airavata's Calf", faction: "devas", season: 1, rarity: "Rare", type: "Unit", art: "Devas_Unit_AiravatasCalf_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    104: { cardId: 104, name: "Aruna Charioteer", faction: "devas", season: 1, rarity: "Uncommon", type: "Unit", art: "Devas_Unit_ArunaCharioteer_P4_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    105: { cardId: 105, name: "Dawn Banner", faction: "devas", season: 1, rarity: "Epic", type: "Artifact", art: "Devas_Artifact_DawnBanner_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    106: { cardId: 106, name: "Dawn Sentinel", faction: "devas", season: 1, rarity: "Common", type: "Unit", art: "Devas_Unit_DawnSentinel_P2_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    107: { cardId: 107, name: "Dawn's Rebirth", faction: "devas", season: 1, rarity: "Epic", type: "Mantra", art: "Devas_Mantra_DawnsRebirth_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    108: { cardId: 108, name: "Dhanvantari", faction: "devas", season: 1, rarity: "Rare", type: "Unit", art: "Devas_Unit_Dhanvantari_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    109: { cardId: 109, name: "Garuda", faction: "devas", season: 1, rarity: "Legendary", type: "Hero", art: "Devas_Hero_Garuda_P7_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    110: { cardId: 110, name: "Kalpavriksha", faction: "devas", season: 1, rarity: "Mythic", type: "Artifact", art: "Devas_Artifact_Kalpavriksha_rMythic.png", supply: 10, priceDYC: null, status: "live" },
    111: { cardId: 111, name: "Kamadhenu", faction: "devas", season: 1, rarity: "Rare", type: "Unit", art: "Devas_Unit_Kamadhenu_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    112: { cardId: 112, name: "Kartikeya", faction: "devas", season: 1, rarity: "Legendary", type: "Hero", art: "Devas_Hero_Kartikeya_P8_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    113: { cardId: 113, name: "Kartikeya's Vanguard", faction: "devas", season: 1, rarity: "Epic", type: "Unit", art: "Devas_Unit_KartikeyasVanguard_P5_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    114: { cardId: 114, name: "Ratri Hymn", faction: "devas", season: 1, rarity: "Rare", type: "Mantra", art: "Devas_Mantra_RatriHymn_rRare.png", supply: 70, priceDYC: null, status: "live" },
    115: { cardId: 115, name: "Ribhu Craftsman", faction: "devas", season: 1, rarity: "Uncommon", type: "Unit", art: "Devas_Unit_RibhuCraftsman_P3_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    116: { cardId: 116, name: "Saranyu", faction: "devas", season: 1, rarity: "Epic", type: "Unit", art: "Devas_Unit_SaranyuCloudMare_P5_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    117: { cardId: 117, name: "Savitur Verse", faction: "devas", season: 1, rarity: "Uncommon", type: "Mantra", art: "Devas_Mantra_SaviturVerse_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    118: { cardId: 118, name: "Shakti Spear", faction: "devas", season: 1, rarity: "Epic", type: "Astra", art: "Devas_Astra_ShaktiSpear_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    119: { cardId: 119, name: "Suryastra", faction: "devas", season: 1, rarity: "Legendary", type: "Astra", art: "Devas_Astra_Suryastra_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    120: { cardId: 120, name: "Ushas", faction: "devas", season: 1, rarity: "Uncommon", type: "Unit", art: "Devas_Unit_UshasDawnHerald_P3_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    121: { cardId: 121, name: "Vedi Keeper", faction: "devas", season: 1, rarity: "Common", type: "Unit", art: "Devas_Unit_VediKeeper_P3_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    122: { cardId: 122, name: "Vigil Rakshak", faction: "devas", season: 1, rarity: "Rare", type: "Unit", art: "Devas_Unit_VigilRakshak_P5_rRare.png", supply: 70, priceDYC: null, status: "live" },
    123: { cardId: 123, name: "Andhaka", faction: "asuras", season: 1, rarity: "Rare", type: "Unit", art: "Asuras_Unit_Andhaka_P6_rRare.png", supply: 70, priceDYC: null, status: "live" },
    124: { cardId: 124, name: "Atikaya", faction: "asuras", season: 1, rarity: "Epic", type: "Unit", art: "Asuras_Unit_Atikaya_P6_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    125: { cardId: 125, name: "Bhasma Sainika", faction: "asuras", season: 1, rarity: "Common", type: "Unit", art: "Asuras_Unit_BhasmaSainika_P3_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    126: { cardId: 126, name: "Brahmadanda", faction: "asuras", season: 1, rarity: "Epic", type: "Astra", art: "Asuras_Astra_Brahmadanda_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    127: { cardId: 127, name: "Dhumraksha", faction: "asuras", season: 1, rarity: "Uncommon", type: "Unit", art: "Asuras_Unit_Dhumraksha_P4_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    128: { cardId: 128, name: "Holika", faction: "asuras", season: 1, rarity: "Rare", type: "Unit", art: "Asuras_Unit_Holika_P5_rRare.png", supply: 70, priceDYC: null, status: "live" },
    129: { cardId: 129, name: "Mahishasura", faction: "asuras", season: 1, rarity: "Epic", type: "Unit", art: "Asuras_Unit_Mahishasura_P7_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    130: { cardId: 130, name: "Mahishi", faction: "asuras", season: 1, rarity: "Legendary", type: "Hero", art: "Asuras_Hero_Mahishi_P5_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    131: { cardId: 131, name: "Maya Shade", faction: "asuras", season: 1, rarity: "Common", type: "Unit", art: "Asuras_Unit_MayaShade_P2_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    132: { cardId: 132, name: "Maya Veil", faction: "asuras", season: 1, rarity: "Epic", type: "Mantra", art: "Asuras_Mantra_MayaVeil_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    133: { cardId: 133, name: "Mayasura's Blueprint", faction: "asuras", season: 1, rarity: "Epic", type: "Artifact", art: "Asuras_Artifact_MayasurasBlueprint_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    134: { cardId: 134, name: "Mohanastra", faction: "asuras", season: 1, rarity: "Uncommon", type: "Astra", art: "Asuras_Astra_Mohanastra_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    135: { cardId: 135, name: "Nishumbha", faction: "asuras", season: 1, rarity: "Rare", type: "Unit", art: "Asuras_Unit_Nishumbha_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    136: { cardId: 136, name: "Pisacha Skirmisher", faction: "asuras", season: 1, rarity: "Common", type: "Unit", art: "Asuras_Unit_PisachaSkirmisher_P4_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    137: { cardId: 137, name: "Raktabija's Curse", faction: "asuras", season: 1, rarity: "Epic", type: "Mantra", art: "Asuras_Mantra_RaktabijasCurse_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    138: { cardId: 138, name: "Rudhira Bali", faction: "asuras", season: 1, rarity: "Uncommon", type: "Mantra", art: "Asuras_Mantra_RudhiraBali_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    139: { cardId: 139, name: "Shumbha", faction: "asuras", season: 1, rarity: "Rare", type: "Unit", art: "Asuras_Unit_Shumbha_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    140: { cardId: 140, name: "Simhika", faction: "asuras", season: 1, rarity: "Uncommon", type: "Unit", art: "Asuras_Unit_Simhika_P4_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    141: { cardId: 141, name: "Surpanakha", faction: "asuras", season: 1, rarity: "Rare", type: "Unit", art: "Asuras_Unit_Surpanakha_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    142: { cardId: 142, name: "The Iron Crucible", faction: "asuras", season: 1, rarity: "Mythic", type: "Artifact", art: "Asuras_Artifact_TheIronCrucible_rMythic.png", supply: 10, priceDYC: null, status: "live" },
    143: { cardId: 143, name: "Vidyutastra", faction: "asuras", season: 1, rarity: "Rare", type: "Astra", art: "Asuras_Astra_Vidyutastra_rRare.png", supply: 70, priceDYC: null, status: "live" },
    144: { cardId: 144, name: "Vritra", faction: "asuras", season: 1, rarity: "Legendary", type: "Hero", art: "Asuras_Hero_Vritra_P6_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    145: { cardId: 145, name: "Ajagara", faction: "nagas", season: 1, rarity: "Rare", type: "Unit", art: "Nagas_Unit_Ajagara_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    146: { cardId: 146, name: "Avahani", faction: "nagas", season: 1, rarity: "Uncommon", type: "Unit", art: "Nagas_Unit_Avahani_P3_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    147: { cardId: 147, name: "Hymn of the Depths", faction: "nagas", season: 1, rarity: "Rare", type: "Mantra", art: "Nagas_Mantra_HymnoftheDepths_rRare.png", supply: 70, priceDYC: null, status: "live" },
    148: { cardId: 148, name: "Kalakuta Vial", faction: "nagas", season: 1, rarity: "Rare", type: "Astra", art: "Nagas_Astra_KalakutaVial_rRare.png", supply: 70, priceDYC: null, status: "live" },
    149: { cardId: 149, name: "Kulika", faction: "nagas", season: 1, rarity: "Legendary", type: "Hero", art: "Nagas_Hero_Kulika_P8_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    150: { cardId: 150, name: "Mahapadma", faction: "nagas", season: 1, rarity: "Rare", type: "Unit", art: "Nagas_Unit_Mahapadma_P5_rRare.png", supply: 70, priceDYC: null, status: "live" },
    151: { cardId: 151, name: "Naga Dwarapala", faction: "nagas", season: 1, rarity: "Common", type: "Unit", art: "Nagas_Unit_NagaDwarapala_P3_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    152: { cardId: 152, name: "Nahusha, Fallen King", faction: "nagas", season: 1, rarity: "Epic", type: "Unit", art: "Nagas_Unit_NahushaFallenKing_P6_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    153: { cardId: 153, name: "Nirmoka", faction: "nagas", season: 1, rarity: "Common", type: "Unit", art: "Nagas_Unit_Nirmoka_P2_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    154: { cardId: 154, name: "Padmavati", faction: "nagas", season: 1, rarity: "Legendary", type: "Hero", art: "Nagas_Hero_Padmavati_P7_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    155: { cardId: 155, name: "Patala Hatchling", faction: "nagas", season: 1, rarity: "Common", type: "Unit", art: "Nagas_Unit_PatalaHatchling_P2_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    156: { cardId: 156, name: "Rite of Shed Skin", faction: "nagas", season: 1, rarity: "Uncommon", type: "Mantra", art: "Nagas_Mantra_RiteofShedSkin_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    157: { cardId: 157, name: "Serpent's Kiss", faction: "nagas", season: 1, rarity: "Epic", type: "Astra", art: "Nagas_Astra_SerpentsKiss_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    158: { cardId: 158, name: "Shankhapala", faction: "nagas", season: 1, rarity: "Uncommon", type: "Unit", art: "Nagas_Unit_Shankhapala_P4_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    159: { cardId: 159, name: "The Drowned Altar", faction: "nagas", season: 1, rarity: "Epic", type: "Artifact", art: "Nagas_Artifact_TheDrownedAltar_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    160: { cardId: 160, name: "Throne of the Second King", faction: "nagas", season: 1, rarity: "Mythic", type: "Artifact", art: "Nagas_Artifact_ThroneoftheSecondKing_rMythic.png", supply: 10, priceDYC: null, status: "live" },
    161: { cardId: 161, name: "Uraga Colossus", faction: "nagas", season: 1, rarity: "Epic", type: "Unit", art: "Nagas_Unit_UragaColossus_P7_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    162: { cardId: 162, name: "Vaitarani Naga", faction: "nagas", season: 1, rarity: "Rare", type: "Unit", art: "Nagas_Unit_VaitaraniNaga_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    163: { cardId: 163, name: "Visha Vayu", faction: "nagas", season: 1, rarity: "Epic", type: "Mantra", art: "Nagas_Mantra_VishaVayu_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    164: { cardId: 164, name: "Vishadhara", faction: "nagas", season: 1, rarity: "Uncommon", type: "Unit", art: "Nagas_Unit_Vishadhara_P3_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    165: { cardId: 165, name: "Vishalakshi the Pale", faction: "nagas", season: 1, rarity: "Rare", type: "Unit", art: "Nagas_Unit_VishalakshithePale_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    166: { cardId: 166, name: "Vishwapasha", faction: "nagas", season: 1, rarity: "Epic", type: "Astra", art: "Nagas_Astra_Vishwapasha_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    167: { cardId: 167, name: "Anjana", faction: "vanaras", season: 1, rarity: "Legendary", type: "Hero", art: "Vanaras_Hero_Anjana_P6_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    168: { cardId: 168, name: "Anjaneya's Roar", faction: "vanaras", season: 1, rarity: "Legendary", type: "Astra", art: "Vanaras_Astra_AnjaneyasRoar_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    169: { cardId: 169, name: "Drummer of the Host", faction: "vanaras", season: 1, rarity: "Common", type: "Unit", art: "Vanaras_Unit_DrummeroftheHost_P2_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    170: { cardId: 170, name: "Gaja", faction: "vanaras", season: 1, rarity: "Uncommon", type: "Unit", art: "Vanaras_Unit_Gaja_P4_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    171: { cardId: 171, name: "Gandhamadana", faction: "vanaras", season: 1, rarity: "Epic", type: "Unit", art: "Vanaras_Unit_Gandhamadana_P5_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    172: { cardId: 172, name: "Gavaksha", faction: "vanaras", season: 1, rarity: "Uncommon", type: "Unit", art: "Vanaras_Unit_Gavaksha_P4_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    173: { cardId: 173, name: "Jatayu's Last Flight", faction: "vanaras", season: 1, rarity: "Epic", type: "Astra", art: "Vanaras_Astra_JatayusLastFlight_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    174: { cardId: 174, name: "Kishkindha Runner", faction: "vanaras", season: 1, rarity: "Common", type: "Unit", art: "Vanaras_Unit_KishkindhaRunner_P4_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    175: { cardId: 175, name: "Kumuda", faction: "vanaras", season: 1, rarity: "Uncommon", type: "Unit", art: "Vanaras_Unit_Kumuda_P3_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    176: { cardId: 176, name: "Makardhwaja", faction: "vanaras", season: 1, rarity: "Legendary", type: "Hero", art: "Vanaras_Hero_Makardhwaja_P7_rLegendary.png", supply: 20, priceDYC: null, status: "live" },
    177: { cardId: 177, name: "Matanga's Blessing", faction: "vanaras", season: 1, rarity: "Rare", type: "Mantra", art: "Vanaras_Mantra_MatangasBlessing_rRare.png", supply: 70, priceDYC: null, status: "live" },
    178: { cardId: 178, name: "Rambha the Bold", faction: "vanaras", season: 1, rarity: "Epic", type: "Unit", art: "Vanaras_Unit_RambhatheBold_P5_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    179: { cardId: 179, name: "Sampati", faction: "vanaras", season: 1, rarity: "Rare", type: "Unit", art: "Vanaras_Unit_Sampati_P5_rRare.png", supply: 70, priceDYC: null, status: "live" },
    180: { cardId: 180, name: "Setu Mason", faction: "vanaras", season: 1, rarity: "Common", type: "Unit", art: "Vanaras_Unit_SetuMason_P2_rCommon.png", supply: 200, priceDYC: null, status: "live" },
    181: { cardId: 181, name: "Song of the Crossing", faction: "vanaras", season: 1, rarity: "Uncommon", type: "Mantra", art: "Vanaras_Mantra_SongoftheCrossing_rUncommon.png", supply: 100, priceDYC: null, status: "live" },
    182: { cardId: 182, name: "Sushena the Healer", faction: "vanaras", season: 1, rarity: "Rare", type: "Unit", art: "Vanaras_Unit_SushenatheHealer_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    183: { cardId: 183, name: "Swayamprabha", faction: "vanaras", season: 1, rarity: "Rare", type: "Unit", art: "Vanaras_Unit_Swayamprabha_P3_rRare.png", supply: 70, priceDYC: null, status: "live" },
    184: { cardId: 184, name: "The Living Bridge", faction: "vanaras", season: 1, rarity: "Mythic", type: "Artifact", art: "Vanaras_Artifact_TheLivingBridge_rMythic.png", supply: 10, priceDYC: null, status: "live" },
    185: { cardId: 185, name: "Vault of the Sky", faction: "vanaras", season: 1, rarity: "Epic", type: "Mantra", art: "Vanaras_Mantra_VaultoftheSky_rEpic.png", supply: 50, priceDYC: null, status: "live" },
    186: { cardId: 186, name: "Vayavyastra", faction: "vanaras", season: 1, rarity: "Rare", type: "Astra", art: "Vanaras_Astra_Vayavyastra_rRare.png", supply: 70, priceDYC: null, status: "live" },
    187: { cardId: 187, name: "Vinata's Talon", faction: "vanaras", season: 1, rarity: "Rare", type: "Unit", art: "Vanaras_Unit_VinatasTalon_P4_rRare.png", supply: 70, priceDYC: null, status: "live" },
    188: { cardId: 188, name: "The Setu Stones", faction: "vanaras", season: 1, rarity: null, type: "Artifact", art: null, supply: null, priceDYC: null, status: "held" },
  },

  // cardId -> entry, or null if not a registered wave card.
  lookup: function (cardId) {
    return this.byId[Number(cardId)] || null;
  },

  // the full catalog as an array (the picker base list; consumers must skip status "held").
  list: function () {
    var out = [];
    for (var k in this.byId) {
      if (Object.prototype.hasOwnProperty.call(this.byId, k)) out.push(this.byId[k]);
    }
    return out;
  },
};
