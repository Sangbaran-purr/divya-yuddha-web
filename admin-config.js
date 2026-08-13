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
  // M-G1 — live Amoy full-stack deployment (2026-08-06). See divya-yuddha-web3/docs/AMOY_STACK_2026-08-06.md.
  contracts: {
    accessNFT: "0xA9D7b53598773D20dc78E19dE814f265924d7A51", // RE-FREEZE (2026-08-12) — fresh master-owned AccessNFT (TORANA slot; arms dark→lit)
    waveCardNFT: "0x4A0717A7c3970daee6161367f80b10B71286A0fD", // RE-FREEZE (2026-08-12) — fresh master-owned WaveCardNFT
    dycoin: "0x39Daaf5f0729DC5604CeC6660b04c53fb181B694", // S9 COIN DROPS — the live money-stack DYC (proxy)
    dycoinSale: "0x89c758e200B49DC367b0e1f0674F722A20530e3D", // M-F2 Approve Buyers + M-F3 Registry gate (allowlistSigner = PROD_OWNER)
    vestingVault: "0x7c7da4FFA7E32018912c18AffE9902969e0a5972", // M-F3 Registry — VESTED column
    holderStaking: "0xE9A16394c6E78c3ea9B79e757a12C2A64D76C7bf", // M-F3 Registry — STAKED + REWARDS
    dropDesk: "0x6EC80e9BE34038329291077E126906359e86916a", // M-F6-G3 — Drop Desk (coupon sign/publish/cancel/figures; owner=timelock, signer=PROD_OWNER)
    waveCardSale: "0xE9FF07bF0E0fd43E56EDee958a8F40E10090628C", // LEG2/RUNG-4 — WaveCardSale (Price Desk gate owner()==connected + setPrice/setSupplyCap/setSalesOpen target). LIVE 2026-08-13 [RUNG4-FIX-1C: canonical EIP-55]
    waveCardMarket: "0xB7d09A514AE054Aa4beedea027059Fb91DA4576E", // LEG4/RUNG-4 — WaveCardMarket (Price Desk marketsOpen switch target). LIVE 2026-08-13 [RUNG4-FIX-1C: canonical EIP-55]
  },

  // The block the contracts were deployed at — the mint-history scan starts here
  // (0 falls back to a full chunked scan). Set to the G12 deploy block to keep
  // the getLogs range tiny.
  deployBlock: 44185626, // S-LEDGER-FIX: the M-G1 Amoy stack deploy block — bounds the ledger/history getLogs scan to ~38 chunks (was 0 = full-chain scan)

  // Archive-capable Amoy RPC used ONLY for the Mint-History getLogs read (never a
  // signing path — all writes stay on the wallet). Public free RPCs reject
  // historical getLogs as archive requests; set an archive endpoint here for FULL
  // history. Null = recent-only scan (last N blocks) via the wallet's own RPC.
  readRpcUrl: null,

  // WAVE CARDS ONLY (see header). Empty until the metadata freeze / rehearsal.
  // Example (do not ship guessed ids): { cardId: 101, name: "Deva Sainika", faction: "devas" }
  waveCards: [],
};
