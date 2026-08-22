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
  // W3-MAINNET-1 — Polygon mainnet full-stack deployment (2026-08). Chain 137. Addresses verbatim from the crossing.
  contracts: {
    accessNFT: "0xcADBA9d1f8B33567AcB7c0120c59Df306f92dd9d", // master-owned AccessNFT (TORANA slot; arms dark→lit)
    waveCardNFT: "0xfadAA859eE1d4e0c0eB2B5aBa9FC5E15dd37537A", // W3-REDEPLOY-WAVE — reborn master-owned WaveCardNFT (IPFS baseURI)
    dycoin: "0x10c29BC02A2c3587D0085B0d60E4D6024D25B611", // money-stack DYC (ERC1967 proxy)
    dycoinSale: "0x088233d79BD0Df395E364C180F790C2E655F648B", // DYCoinSale — Approve Buyers + Registry gate (allowlistSigner = robot)
    vestingVault: "0x4C5c5B3fd72618f2d53E4f131b24e58D65Bcd540", // VESTED column
    holderStaking: "0xbA73Fd021263b46F68eCe7aa0C7Bb9817701C21f", // STAKED + REWARDS
    dropDesk: "0x28813f882E3DaefC6329Adf85005Fbfd31CaB8fa", // Drop Desk (coupon sign/publish/cancel/figures; owner=timelock, signer=PROD_OWNER)
    waveCardSale: "0x89f477BEa193956a724f3222fF4DF0f5267F6E92", // W3-REDEPLOY-WAVE — reborn WaveCardSale (Price Desk gate owner()==connected + setPrice/setSupplyCap/setSalesOpen target)
    waveCardMarket: "0x5Ab2F48Eae60169A4028e7ba8bA3cA664Bea5Fe1", // W3-REDEPLOY-WAVE — reborn WaveCardMarket (Price Desk marketsOpen switch target)
  },

  // The block the contracts were deployed at — the mint-history scan starts here
  // (0 falls back to a full chunked scan). The mainnet money-stack deploy block keeps the getLogs range tiny.
  deployBlock: 92050143, // W3-MAINNET-1: the mainnet money-stack deploy block — bounds the ledger/history getLogs scan

  // Archive-capable Amoy RPC used ONLY for the Mint-History getLogs read (never a
  // signing path — all writes stay on the wallet). Public free RPCs reject
  // historical getLogs as archive requests; set an archive endpoint here for FULL
  // history. Null = recent-only scan (last N blocks) via the wallet's own RPC.
  readRpcUrl: null,

  // WAVE CARDS ONLY (see header). Empty until the metadata freeze / rehearsal.
  // Example (do not ship guessed ids): { cardId: 101, name: "Deva Sainika", faction: "devas" }
  waveCards: [],
};
