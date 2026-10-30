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
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // ICO-SIMPLE-1: USDC (native, 6-dec) — the Sale takes it as well as USDT

    // WINNINGS-5 (2026-10-10) — THE LIVE WinningsDesk: won-liquid DYC + Torana Invite rewards -> USDT0 at a fixed 0.008.
    // Deployed by the master at block 95,283,175 (tx 0x8373f100…), Polygonscan-verified, owned by the master, funded
    // 50 USDT0, unpaused. Setting it (with the two service URLs below) is what lights the Withdraw card.
    winningsDesk: "0x2F424C37937160E646138392CE986aF1C0e65947",
    // TORANA-AUTO-1 (2026-10-29) — ToranaIcoClaim: a Torana for every ICO buyer of USD 100+ (no owner, nothing changeable;
    // switched on by the master's setMinter). The dashboard reads status(me) and offers the self-claim. Served by dy-rpc.
    toranaClaim: "0xc92dc5dfbda2b70F20286Bc5A0E69DD0832Be4e7",
  },

  // WINNINGS-4 — the approval-bot's winnings endpoints (challenge + coupon). NULL until the service is deployed
  // with its keyed archive and its own signer key; null keeps the card dormant exactly as a null desk does.
  // Nothing but the signed challenge ever leaves the page, and no analytics event is attached to this card.
  winningsServiceUrl: "https://approval-bot-cxa2.onrender.com",   // WINNINGS-5: the approval bot, live at web3 1c1dddc

  // AFFILIATE-1 rung 3 — the approval-bot's Torana Invites endpoints (/invites/code, /invites/bind). NULL until the
  // service runs them: null keeps the store's "Invited by" line, its invite step and the dashboard's Torana Invites
  // card INVISIBLE, and makes ZERO calls. (The store still strips a ?invite= code from the address bar either way,
  // so a code can never reach the analytics tag.) Loaded by store.html AND dashboard.html.
  inviteServiceUrl: "https://approval-bot-cxa2.onrender.com",     // WINNINGS-5: Torana Invites live (/invites/code, /invites/bind)

  // ICO-SIMPLE-1 (owner rulings 2026-10-25) — the approval bot's INSTANT presale voucher door (POST, OFAC-screened). The buy
  // panel asks it when a wallet connects in the presale round; on any failure it falls back to the published allowlist.
  // NULL => only the allowlist is read (the old behaviour, minus the form).
  presaleVoucherUrl: "https://approval-bot-cxa2.onrender.com/presale/voucher",
  gasTopUpUrl: "https://approval-bot-cxa2.onrender.com/gas/topup",  // GAS-HELP-1 R3: POL for the network fee (dormant until the bot's GAS_TOPUP=on — until then it answers 503 and the roads show the fallback line)

  // ── Polygon mainnet read endpoint ──
  // RPC-CLEANUP-1 (owner rulings 2026-10-30) — ONE ROAD: our own read proxy (dy-rpc → a keyed provider, server-side)
  // serves every dashboard/report read, the getLogs history scans included. No free public RPC and no wallet rescue
  // (ruling D) sits behind it: if it is down the page shows its plain "couldn't load — try again" state.
  readRpcUrl: "https://rpc.divyayuddha.games",
  readRpcUrlFallbacks: [],
  // the getLogs scan width: dy-rpc serves an addressed scan up to 10,000,000 blocks (MAX_LOG_SPAN, ruling E), so the
  // whole history is ONE call. The halving safety net in the pages still narrows on a range refusal.
  logChunk: 10000000,

  // The block the mainnet stack deployed at — the getLogs scans start here.
  deployBlock: 92050143,
};
