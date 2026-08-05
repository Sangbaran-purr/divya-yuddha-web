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
  contracts: {
    dycoin: null, // null → falls back to config.js frozen dycoin (LIQUID, real balances)
    vestingVault: null, // fresh; null = "not yet live"
    holderStaking: null, // fresh; null = "not yet live"
    roiRedemption: null, // fresh; null = "not yet live"
  },

  // Optional read-only RPC for chain reads + the transaction feed (archive-capable,
  // or a local anvil node for verification). Null = read through the connected wallet.
  readRpcUrl: null,

  // The block the fresh stack deployed at — the transaction-feed getLogs scan starts here.
  deployBlock: 0,
};
