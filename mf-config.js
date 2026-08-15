/* ============================================================================
   DY_MF_CONFIG — the M-F1 wallet-dashboard contract surface (S9 pattern:
   file + localStorage override, NO hardcoded addresses).

   FRESH-FIRST (owner ruling 2026-08-05): the vesting/staking/redemption stack
   is not yet deployed. Its address slots stay null; the dashboard renders those
   cards in a graceful "not yet live" state (dimmed, plain words) — never an
   error. LIQUID reads the frozen config.js dycoin (real balances today).
   When the fresh stack deploys, set the four addresses here (they are PUBLIC
   on-chain) and every card lights up with zero rebuild. Any edit bumps this
   file's ?v= stamp (bytes-not-tasks).

   OVERRIDE (dev/local): window.localStorage["dymf::config"] — a JSON blob with
   the same shape — wins over this file for this browser (used to point the
   dashboard at a local anvil deployment for verification; nothing committed).
   ========================================================================= */
window.DY_MF_CONFIG = {
  // W3-MAINNET-1 — Polygon mainnet full-stack deployment (2026-08). Chain 137. Addresses verbatim from the crossing.
  contracts: {
    dycoin: "0x10c29BC02A2c3587D0085B0d60E4D6024D25B611", // DYC (ERC1967 proxy) — the money-stack token
    vestingVault: "0x4C5c5B3fd72618f2d53E4f131b24e58D65Bcd540",
    holderStaking: "0xbA73Fd021263b46F68eCe7aa0C7Bb9817701C21f",
    roiRedemption: "0x60ceb6FEBD8f976c02Cee8123631CcD420489891",
    dycoinSale: "0x088233d79BD0Df395E364C180F790C2E655F648B",
    dropDesk: "0x28813f882E3DaefC6329Adf85005Fbfd31CaB8fa", // Drop Desk (coupon redemption; owner=timelock, signer=PROD_OWNER)
    usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // Tether USD on Polygon PoS (6-dec; on-chain symbol reads "USDT0")
  },

  // ── Polygon mainnet read endpoints (W3-MAINNET-1) ──
  // The verified primary is publicnode (CORS-clean, full node, reliable eth_call), drpc a redundant fallback; the
  // connected wallet remains the last-resort rescue. Tried in order (FallbackProvider, quorum 1). No API key needed.
  // (A domain-locked mainnet Alchemy key can be dropped in later for eth_call headroom — small pile, not required.)
  readRpcUrl: "https://polygon-bor-rpc.publicnode.com",
  readRpcUrlFallbacks: [
    "https://polygon.drpc.org",
  ],
  // ⚠ eth_getLogs SPLIT: the domain-locked key's free tier caps eth_getLogs at a 10-block range —
  // useless for the feed/report scans (thousands of blocks). So getLogs runs on the FREE endpoints
  // (drpc/publicnode/thirdweb — large ranges OK); only eth_call (the card reads that failed the
  // owner) uses the reliable site key. logChunk sizes that free-endpoint getLogs line.
  logChunk: 3000,

  // The block the mainnet stack deployed at — the getLogs scans start here.
  deployBlock: 92050143,
};
