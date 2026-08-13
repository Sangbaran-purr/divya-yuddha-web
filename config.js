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
    // RUNG4-FIX-3 — WALLET-REGISTRATION list (fed to wallet_addEthereumChain): what MetaMask registers for NEW users.
    // The old rpc-amoy.polygon.technology is DNS-dead (ERR_NAME_NOT_RESOLVED). publicnode first (CORS-clean, full node,
    // serves eth_maxPriorityFeePerGas + eth_sendRawTransaction), drpc as a redundant second. Existing users keep
    // whatever they already registered — the site READ road below is wallet-independent, so their reads still work.
    rpcUrls: ["https://polygon-amoy-bor-rpc.publicnode.com", "https://polygon-amoy.drpc.org"],
    // RUNG4-FIX-3 — the SITE READ endpoint (DYWallet.readProvider). Every site read rides this tamed publicnode
    // provider (staticNetwork, fail-fast) regardless of the user's wallet RPC. Writes stay on the wallet signer.
    readRpcUrls: ["https://polygon-amoy-bor-rpc.publicnode.com"],
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
    dycoin: "0x39Daaf5f0729DC5604CeC6660b04c53fb181B694", // RE-FREEZE Leg 2 — CANONICAL money-stack DYC (rite balance read + game conduit + wave-card price coin)
    marketplace: "0x2b74C4C651Dd09D30275EF0dD1c14a699B8502cd", // FROZEN PHASE A (AMOY) — Marketplace proxy (NOT LIVE; see coin-pair flag)

    // LEG3+5 — the player commerce contracts (WaveCardSale = the primary storefront;
    // WaveCardMarket = the secondary escrow marketplace). RUNG-4 LIVE (2026-08-13,
    // chain-verified master-owned, both shipped CLOSED). The store's Buy grid, the
    // Market tab, and the treasury LIST + Your Listings wake now that these carry
    // live addresses. Prices are DYC-native (the `dycoin` money-stack coin above), W-PRICE-1.
    waveCardSale: "0xE9FF07bF0E0fd43E56EDee958a8F40E10090628C", // LEG3/RUNG-4 — WaveCardSale (priceOf/remainingOf/buy); deploy block 44799211 [RUNG4-FIX-1C: canonical EIP-55, was a hand-fabricated bad-checksum mixed-case]
    waveCardMarket: "0xB7d09A514AE054Aa4beedea027059Fb91DA4576E", // LEG5/RUNG-4 — WaveCardMarket (listedIds/listingOf/list/buy/delist); deploy block 44799212 [RUNG4-FIX-1C: canonical EIP-55]
  },

  // S-TREASURY-SHELF-1 — the fresh RE-FREEZE NFT-stack deploy block on Amoy (chain truth: AccessNFT landed here;
  // the full stack landed 44701099–44701101). Bounds the "Your Holdings" Transfer(*, owner) getLogs scan (from here
  // to latest) so public RPCs don't reject a full-chain range. UNSET/0 → the loader falls back to fromBlock 0 (a
  // full scan; if the RPC rejects it, the busy-sentinel renders "unavailable", never a silent empty shelf).
  deployBlock: 44701099,

  // LEG5/RUNG-4 — the WaveCardMarket deploy block. The Your Listings event-scan
  // (js/store.js scanMyListings) queries Listed(*, owner) from HERE, not the NFT's
  // 44701099 — the market's events cannot predate its own deploy, so scanning from
  // the NFT block would waste ~98k blocks. store.js reads marketDeployBlock, falling
  // back to deployBlock, then 0 (full scan). Sale landed 44799211, market 44799212;
  // this is the batch's first block (a safe 1-block floor below the market's events).
  marketDeployBlock: 44799211,

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
