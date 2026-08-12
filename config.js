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

  // ✓ RE-FREEZE (2026-08-12) — the sealed G11 Phase-A NFTs (owner()==0x…bEEF, setMinter
  // permanently uncallable) were REDEPLOYED FRESH under the master and chain-verified
  // (owner()==0xbab5…F86e on both; see divya-yuddha-web3 DeployPhaseANFTs / RE-FREEZE legs).
  // The site reads accessNFT (holder gate) and waveCardNFT (the treasury Transfer-scan).
  // dycoin is now the CANONICAL money-stack DYC (owner-ruled) — read by the rite balance
  // panel and handed to the game conduit. The OLD sealed pair (0xd2Fc… / 0xF332…) and the
  // orphan Phase-A DYCoin (0x8573…) are ABANDONED.
  //
  // ⚠ COIN-PAIR FLAG (owner rules separately): `marketplace` (0x2b74…) is the FROZEN Phase-A
  // proxy, NOT LIVE (grep: zero site reads today). It was deployed against the frozen 0x8573
  // coin; `dycoin` here now points at the money-stack 0x39Da. If the future Phase-B marketplace
  // UI reads `contracts.dycoin`, it would trade the money-stack coin, not the frozen one — the
  // marketplace may need its OWN coin field then. Left untouched pending an owner ruling.
  contracts: {
    accessNFT: "0xA9D7b53598773D20dc78E19dE814f265924d7A51", // RE-FREEZE — fresh master-owned AccessNFT ("Divya Yuddha Access")
    waveCardNFT: "0x4A0717A7c3970daee6161367f80b10B71286A0fD", // RE-FREEZE — fresh master-owned WaveCardNFT ("Divya Yuddha Wave Card")
    dycoin: "0x39Daaf5f0729DC5604CeC6660b04c53fb181B694", // RE-FREEZE Leg 2 — CANONICAL money-stack DYC (rite balance read + game conduit)
    marketplace: "0x2b74C4C651Dd09D30275EF0dD1c14a699B8502cd", // FROZEN PHASE A (AMOY) — Marketplace proxy (NOT LIVE; see coin-pair flag)
  },

  // S-TREASURY-SHELF-1 — the fresh RE-FREEZE NFT-stack deploy block on Amoy (chain truth: AccessNFT landed here;
  // the full stack landed 44701099–44701101). Bounds the "Your Holdings" Transfer(*, owner) getLogs scan (from here
  // to latest) so public RPCs don't reject a full-chain range. UNSET/0 → the loader falls back to fromBlock 0 (a
  // full scan; if the RPC rejects it, the busy-sentinel renders "unavailable", never a silent empty shelf).
  deployBlock: 44701099,

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
