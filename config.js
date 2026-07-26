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

  // ✓ FROZEN PHASE A (AMOY) — recorded 2026-07-25. The live Polygon Amoy (80002)
  // deployment from the G11 broadcast (see divya-yuddha-web3/docs/G11_RUNBOOK.md).
  // The site reads accessNFT (holder gate) and waveCardNFT (the treasury
  // Transfer-scan); dycoin and marketplace are the frozen proxies, recorded here
  // for the Phase-B marketplace UI (not yet read by the site).
  contracts: {
    accessNFT: "0xd2FcFee0c1D0AD2959b04BB6Cdb9E0e92dF62C13", // FROZEN PHASE A (AMOY)
    waveCardNFT: "0xF3320378523413EdE0D874CfF80B780CD38cDe64", // FROZEN PHASE A (AMOY)
    dycoin: "0x85738Bb5176E0800c0e21FB0F424de7Cbbf306ca", // FROZEN PHASE A (AMOY) — DYCoin proxy
    marketplace: "0x2b74C4C651Dd09D30275EF0dD1c14a699B8502cd", // FROZEN PHASE A (AMOY) — Marketplace proxy
  },

  // ethers.js — pinned. UMD build, verified to expose BrowserProvider /
  // Contract / queryFilter (see S1 STEP-0 report). Loaded via CDN with SRI off
  // (jsDelivr immutable version path is the pin).
  ethers: {
    version: "6.17.0",
    cdn: "https://cdn.jsdelivr.net/npm/ethers@6.17.0/dist/ethers.umd.min.js",
  },

  // Access-NFT claim state. The site CANNOT mint (AccessNFT.mint is
  // onlyMinter). The claim ships FULLY BUILT but DORMANT ("THE RITE OPENS
  // SOON") until a Phase-A authorized-minter/sale module goes live. Flipping
  // this to true without a real minter wired would be dishonest — leave false.
  claimOpen: false,
};
