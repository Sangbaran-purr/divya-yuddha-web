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

  // Vetted KEYLESS Amoy read endpoints (M-F4 defect 3). All chain reads — the wallet-free
  // report AND the wallet-connected dashboard — go through these instead of MetaMask's RPC,
  // so a customer's misconfigured wallet RPC can never blank the page. Tried in order with
  // automatic fallback (ethers FallbackProvider, quorum 1). Vetted 2026-08-06 against the
  // live stack for BOTH eth_call and eth_getLogs:
  //   1. drpc      — eth_call OK, eth_getLogs OK (primary)
  //   2. publicnode — eth_call OK, eth_getLogs OK (fallback)
  //   3. thirdweb  — eth_call OK, eth_getLogs OK for small block ranges (last resort)
  // (rejected: zan.top + ankr need API keys; 1rpc.io unreliable.)
  // The owner's KEYED Alchemy URL is NEVER committed here — keyless public only.
  readRpcUrl: "https://polygon-amoy.drpc.org",
  readRpcUrlFallbacks: [
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://80002.rpc.thirdweb.com",
  ],
  // getLogs chunk sized to the public line's limit (thirdweb caps ~small; drpc/publicnode
  // handle more — 3000 is safe across all three).
  logChunk: 3000,

  // The block the live Amoy stack deployed at — the getLogs scans start here.
  deployBlock: 44185626,
};
