/* ============================================================================
   THE THRESHOLD — config (Divya Yuddha companion site, Phase A)
   No secrets exist client-side by design. Addresses are PUBLIC. There is no
   private key, seed, or API secret anywhere in this repo (grep-gated).
   ========================================================================= */
window.DY_CONFIG = {
  // Polygon Amoy testnet.
  chain: {
    id: 80002,
    idHex: "0x13882", // 80002
    name: "Polygon Amoy Testnet",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: ["https://rpc-amoy.polygon.technology"],
    blockExplorerUrls: ["https://amoy.polygonscan.com"],
  },

  // ⚠ REHEARSAL PLACEHOLDERS — REPLACED AT PHASE-A FREEZE.
  // These are the deterministic addresses from the G11 LOCAL DRY-RUN (never
  // broadcast to Amoy), used only so the read paths have a shape to call. They
  // are NOT live deployments; on-chain reads against them fail gracefully
  // (read-only hall, non-holder). The live Amoy addresses land at the freeze,
  // after the G11 broadcast (see divya-yuddha-web3/docs/G11_RUNBOOK.md).
  contracts: {
    accessNFT: "0x1a4f38B8A89ffbe21Ef07D0c85E71A1dA5afD2B6", // REHEARSAL
    waveCardNFT: "0x4e2958b9682A516020581D381a776ee0232Ffe8a", // REHEARSAL
  },

  // ethers.js — pinned. UMD build, verified to expose BrowserProvider /
  // Contract / queryFilter (see S1 STEP-0 report). Loaded via CDN with SRI off
  // (jsDelivr immutable version path is the pin).
  ethers: {
    version: "6.17.0",
    cdn: "https://cdn.jsdelivr.net/npm/ethers@6.17.0/dist/ethers.umd.min.js",
  },

  // The free game (external link — the live Pages game; stays free, untouched).
  freeGameUrl: "https://sangbaran-purr.github.io/divya-yuddha/",

  // Access-NFT claim state. The site CANNOT mint (AccessNFT.mint is
  // onlyMinter). The claim ships FULLY BUILT but DORMANT ("THE RITE OPENS
  // SOON") until a Phase-A authorized-minter/sale module goes live. Flipping
  // this to true without a real minter wired would be dishonest — leave false.
  claimOpen: false,
};
