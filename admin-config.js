/* ============================================================================
   DY_ADMIN_CONFIG — the admin dashboard's OWN address set (S5a).
   SEPARATE from the player config.js on purpose: the player site reads the
   FROZEN Phase-A contracts (0x…bEEF-owned, bricked, display-only). The admin
   dashboard must point at G12's FRESH rehearsal contracts (later the RE-FREEZE
   production addresses). Chain + the ethers CDN still come from config.js.

   THE OWNERSHIP-ENV LAW, IN THE SITE (translated from G12):
     NO placeholder addresses are baked here. Unconfigured = null. When the
     addresses are null the dashboard shows NOT CONFIGURED and DISABLES every
     control — the same posture as the on-chain `_forbidPlaceholder` guard.

   HOW TO CONFIGURE (two ways, override wins):
     1. IN-PAGE (recommended for the rehearsal): open admin.html → the Configure
        panel → paste the G12 AccessNFT + WaveCardNFT addresses + the wave-card
        list. Stored in this browser's localStorage; NOTHING is committed. This
        is how the owner drops on the throwaway G12 contracts without pushing
        rehearsal addresses. Clearing localStorage returns to NOT CONFIGURED.
     2. IN-FILE (for the RE-FREEZE production posture): fill the nulls below with
        the real addresses + waveCards and commit (they are PUBLIC on-chain). Any
        edit bumps this file's ?v= stamp (bytes-not-tasks law).

   WAVECARDS is the wave picker's source of truth. It contains WAVE CARDS ONLY —
   launch-88 cards are NEVER individually minted and MUST NOT appear here (the
   launch set lives in js/cards.js as a display map, never a mint target). Each
   entry: { cardId, name, faction }. cardId is the on-chain WaveCardNFT cardId
   (the off-chain metadata-freeze convention); faction ∈ devas|asuras|vanaras|nagas.
   ========================================================================= */
window.DY_ADMIN_CONFIG = {
  contracts: {
    accessNFT: null, // G12 fresh AccessNFT (owner-configured; null = NOT CONFIGURED)
    waveCardNFT: null, // G12 fresh WaveCardNFT (owner-configured; null = NOT CONFIGURED)
    dycoin: null, // S9 — the DYC token for COIN DROPS (fresh deployment; NOT config.js's frozen Phase-A proxy; null = coin panel disabled)
    dycoinSale: null, // M-F2 — the DYCoinSale (for the Approve Buyers EIP-712 domain + allowlistSigner gate; null = panel disabled)
  },

  // The block the contracts were deployed at — the mint-history scan starts here
  // (0 falls back to a full chunked scan). Set to the G12 deploy block to keep
  // the getLogs range tiny.
  deployBlock: 0,

  // Archive-capable Amoy RPC used ONLY for the Mint-History getLogs read (never a
  // signing path — all writes stay on the wallet). Public free RPCs reject
  // historical getLogs as archive requests; set an archive endpoint here for FULL
  // history. Null = recent-only scan (last N blocks) via the wallet's own RPC.
  readRpcUrl: null,

  // WAVE CARDS ONLY (see header). Empty until the metadata freeze / rehearsal.
  // Example (do not ship guessed ids): { cardId: 101, name: "Deva Sainika", faction: "devas" }
  waveCards: [],
};
