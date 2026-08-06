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
  // M-G1 — live Amoy full-stack deployment (2026-08-06). See divya-yuddha-web3/docs/AMOY_STACK_2026-08-06.md.
  contracts: {
    dycoin: "0x39Daaf5f0729DC5604CeC6660b04c53fb181B694", // DYC (ERC1967 proxy) — the money-stack token
    vestingVault: "0x7c7da4FFA7E32018912c18AffE9902969e0a5972",
    holderStaking: "0xE9A16394c6E78c3ea9B79e757a12C2A64D76C7bf",
    roiRedemption: "0xEdB8D51a4887A46FDd2669DC5C1eAeb8917D1f32",
    dycoinSale: "0x89c758e200B49DC367b0e1f0674F722A20530e3D",
    usdt: "0x28D92502Fcf4BeEC2d3d1d6F55F4AED9fd6408Ec", // Mock USDT (Amoy practice, 6-dec)
  },

  // Optional read-only RPC for chain reads + the transaction feed (archive-capable,
  // or a local anvil node for verification). Null = read through the connected wallet.
  // NOTE (M-G1): the public report reads wallet-free — set this to a working Amoy read
  // endpoint (config.js's rpc-amoy.polygon.technology is unreliable). The owner's Alchemy
  // key must NOT be committed here; use a keyless public Amoy RPC or a read-only key.
  readRpcUrl: null,

  // The block the live Amoy stack deployed at — the getLogs scans start here.
  deployBlock: 44185626,
};
