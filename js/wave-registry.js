/* ============================================================================
   DY_WAVE_REGISTRY — the committed wave-card catalog (S-WAVE-REGISTRY).

   THIS FILE IS THE SOLE CATALOG AUTHORITY for wave cards. The admin Wave Drop
   picker sources its base list from here; the treasury shelf resolves wave-card
   identity + art from here. A `dyadmin::` localStorage `waveCards` entry is a
   TESTNET-ONLY OVERRIDE layered on top (per-cardId, loudly announced) — never a
   source of record. Launch cards (1-25) NEVER appear here; they live in
   js/cards.js (DY_CARDS) as the launch art map.

   cardId NUMBERING LAW (W-PRICE-1 basis):
     launch      = 1-25
     Wave 1      = 101-188
     season N    = N*100 + 1 onward
   Hundred-blocks; the season is readable from the id (Math.floor(cardId/100)).

   ENTRY FIELDS (nullable ones are HONEST-NULL until the wave's metadata freeze —
   never invented):
     cardId    number   the on-chain WaveCardNFT cardId (cardOf(tokenId))
     name      string   display name
     faction   string   devas | asuras | vanaras | nagas
     season    number   the wave/season (== Math.floor(cardId/100))
     rarity    string?  Common|Uncommon|Rare|Epic|Legendary|Mythic — null until frozen
     type      string?  Hero|Unit|Astra|Mantra|Artifact — null until frozen
     art       string?  frame stem+".png" on the canonical explore.js art road
                        (assets/cards/<faction>/<stem>_320.jpg), fed to the shelf
                        WITHOUT translation; null until the art plate lands
     supply    number?  W-PRICE-1 §1 edition cap authority (the sale contract is
                        SEEDED from this; the registry never enforces). null until set
     priceDYC  number?  W-PRICE-1 §3 primary-sale price in DYC. null until set
     status    string   "test" | "live"

   SEED: cardId 101 is a TEST TOKEN already minted to the master on
   WaveCardNFT 0x4A07…A0fD (immutable, on chain). It is carried here flagged
   status:"test" so the shelf renders it NAMED ("Wave Test Card") rather than an
   unknowing "Card #101" placeholder.
   ========================================================================= */
window.DY_WAVE_REGISTRY = {
  byId: {
    101: {
      cardId: 101,
      name: "Wave Test Card",
      faction: "vanaras",
      season: 1,
      rarity: null,
      type: null,
      art: null,
      supply: null,   // W-PRICE-1 §1 — honest-null (rarity undetermined; caps never invented)
      priceDYC: null, // W-PRICE-1 §3 — honest-null until priced
      status: "test",
    },
  },

  // cardId -> entry, or null if not a registered wave card.
  lookup: function (cardId) {
    var id = typeof cardId === "bigint" ? Number(cardId) : Number(cardId);
    return this.byId[id] || null;
  },

  // the full catalog as an array (the picker's base list).
  list: function () {
    var out = [];
    for (var k in this.byId) {
      if (Object.prototype.hasOwnProperty.call(this.byId, k)) out.push(this.byId[k]);
    }
    return out;
  },
};
