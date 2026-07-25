# The Threshold — Divya Yuddha companion site (Phase A)

A night-dark temple gateway that happens to respond to clicks. This is the
**LANE-W companion surface**: wallet-is-identity, a free soulbound Access token,
and the treasury hall of owned cards. It **never touches the game repo's
`index.html`** — the free game elsewhere stays free and untouched.

- **Stack:** vanilla HTML/CSS/JS. No framework, no build step, no bundler.
  `ethers` is loaded from a pinned CDN, lazily, only on the first chain action.
- **Design authority:** `docs/DESIGN_DIRECTION_v1_1.md` (law) + the accepted
  master mockup `docs/design/gate_master.png` (look).
- **Product authority:** `WEB3_PRODUCT_v1` + `GATES_v1` in the contracts repo
  (`divya-yuddha-web3`).

## Pages
- `index.html` — **The Gate** (facade: crest, doorway with the visible war,
  DECLARE YOURSELF, the four-faction band, the Law parchment).
- `rite.html` — **The Rite** (claim states; the free claim ships **dormant** —
  "THE RITE OPENS SOON" — because the site cannot mint; `AccessNFT.mint` is
  `onlyMinter`. A later authorized-minter module opens it).
- `treasury.html` — **The Treasury** (owned WaveCardNFT cards on plinths; empty
  hall until cards are held; per-token Polygonscan links).

## Config
`config.js` — chain (Amoy 80002), contract address slots (⚠ **rehearsal
placeholders, replaced at Phase-A freeze**), and the pinned `ethers` version.
**No secrets exist client-side** — addresses only, never keys.

## Phase A scope
Connect · claim shell (dormant) · play-gate · collection. **Not** in Phase A:
staking, matchmaking, token-to-NFT claim paths, XP/earning. The gated game copy
is a later task (S2); this repo ships the gate logic against a placeholder.
