/* ============================================================================
   THE THRESHOLD — config (Divya Yuddha companion site, Phase A)
   No secrets exist client-side by design. Addresses are PUBLIC. There is no
   private key, seed, or API secret anywhere in this repo (grep-gated).
   ========================================================================= */
window.DY_CONFIG = {
  // Polygon MAINNET (chain 137). W3-MAINNET-1 — the crossing (2026-08).
  chain: {
    id: 137,
    idHex: "0x89", // 137
    name: "Polygon",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    // WALLET-REGISTRATION list (fed to wallet_addEthereumChain): what MetaMask registers for NEW users. Polygon
    // mainnet is well-known to MetaMask, so this is largely a no-op for existing users. publicnode first (CORS-clean,
    // full node, serves eth_maxPriorityFeePerGas + eth_sendRawTransaction), drpc a redundant second. Existing users
    // keep whatever they already registered — the site READ road below is wallet-independent, so their reads still work.
    rpcUrls: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"],
    // the SITE READ endpoint (DYWallet.readProvider). Every site read rides this tamed publicnode provider
    // (staticNetwork, fail-fast) regardless of the user's wallet RPC. Writes stay on the wallet signer.
    readRpcUrls: ["https://polygon-bor-rpc.publicnode.com"],
    blockExplorerUrls: ["https://polygonscan.com"],
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
    accessNFT: "0xcADBA9d1f8B33567AcB7c0120c59Df306f92dd9d", // W3-MAINNET-1 — master-owned AccessNFT (mainnet)
    waveCardNFT: "0x029D047A30127f73b85a083B462b94A4a12C99bb", // W3-MAINNET-1 — master-owned WaveCardNFT (mainnet)
    dycoin: "0x10c29BC02A2c3587D0085B0d60E4D6024D25B611", // W3-MAINNET-1 — CANONICAL money-stack DYC (ERC1967 proxy, mainnet)
    marketplace: null, // no mainnet deploy — the frozen Phase-A Marketplace was Amoy-only (NOT LIVE, zero site reads)

    // W3-MAINNET-1 — the player commerce contracts (WaveCardSale = the primary storefront;
    // WaveCardMarket = the secondary escrow marketplace). LIVE on mainnet, both shipped CLOSED
    // (seeds deferred to W3-MAINNET-SEED). Prices are DYC-native (the `dycoin` money-stack coin above), W-PRICE-1.
    waveCardSale: "0x64038319d254C04743D308bD002C87C1Ad0cB268", // W3-MAINNET-1 — WaveCardSale (priceOf/remainingOf/buy); deploy block 92050734
    waveCardMarket: "0x1D1a2430d3990Df45eCc43569647C3F94bb7c3DD", // W3-MAINNET-1 — WaveCardMarket (listedIds/listingOf/list/buy/delist); deploy block 92050734
  },

  // S-TREASURY-SHELF-1 — the fresh RE-FREEZE NFT-stack deploy block on Amoy (chain truth: AccessNFT landed here;
  // the full stack landed 44701099–44701101). Bounds the "Your Holdings" Transfer(*, owner) getLogs scan (from here
  // to latest) so public RPCs don't reject a full-chain range. UNSET/0 → the loader falls back to fromBlock 0 (a
  // full scan; if the RPC rejects it, the busy-sentinel renders "unavailable", never a silent empty shelf).
  deployBlock: 92050659,

  // LEG5/RUNG-4 — the WaveCardMarket deploy block. The Your Listings event-scan
  // (js/store.js scanMyListings) queries Listed(*, owner) from HERE, not the NFT's
  // 44701099 — the market's events cannot predate its own deploy, so scanning from
  // the NFT block would waste ~98k blocks. store.js reads marketDeployBlock, falling
  // back to deployBlock, then 0 (full scan). Sale landed 44799211, market 44799212;
  // this is the batch's first block (a safe 1-block floor below the market's events).
  marketDeployBlock: 92050734,

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
