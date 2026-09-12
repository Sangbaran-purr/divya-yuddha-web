# STORE_DESIGN - THE BUNDLE ON THE STORE PAGE (S-BUNDLE-1)
# Standing authority for the store page's PlayStore surface: the Torana
# bundle, the holder top-up, and the copy both are allowed to speak.
# Read at the start of every session that touches the bundle tile.
# Amendments dated, never silent.
#
# Contract authority: MARKET_DESIGN_v1 §5 as amended 2026-09-12b (web3
# repo) and GATES_v1 12e (the eth_call pre-flight). This doc rules the
# SITE half: what the page reads, what it casts, and - §11 - the exact
# words. §11 is machine-proven by mp/copyproof.js; a line changed here
# and not in js/store.js turns that suite red, and the reverse.

=====================================================
## 0. THE CONTRACT IT SPEAKS TO
=====================================================
PlayStore (ERC1967 proxy) 0x3c7181a254ef9A8E77d8766694CeBA5ae103cb40,
implementation 0xABBA81403BdCfA8Dfa36C12991c920FcD49B5829, owned by the
48h Timelock, opened 2026-09-12 (W3-BUNDLE-3; every transaction is in
the web3 repo's MAINNET_STACK_2026-08-15 addendum).

  bundle   USD 20 -> a Torana (AccessNFT) + 500 DYC, LIQUID, one tx
  top-up   USD 5  -> 500 DYC, holders only, LIQUID
  cap      2,000 DYC per wallet per ROLLING 7 days (604800s)
  assets   USDC-native 0x3c499c54...359 and USDT0 0xc2132D05...e8F,
           both 6-decimal, both priced 20e6 / 5e6
  stock    ONE shared pool (inventory() == the store's own DYC balance)

THE SHARED POOL IS WHY NO COUNT IS PRINTED (owner ruling (b),
2026-09-12): a top-up eats the same DYC a bundle would, so "N bundles
left" is a fiction. The tile says In stock, Sold out, or - when a read
fails - stock unavailable. The number lives nowhere on the page.

=====================================================
## 1. THE TILE
=====================================================
First on the store page, in its own <section id="bundle"> above the
Buy/Market tabs (those are wave-card commerce against two other
contracts; the Torana is neither). #bundle is also the link target the
rite page and the Hall's gate screen point at (K4).

The Torana is drawn as the card it is: assets/tokens/Access_Torana_720.jpg
lazily at ~340px, with the existing .torana-ph text placeholder on
onerror. "+ 500 DYC" sits beside it; the price reads USD 20, and the
payment assets are named.

THE ASSET CHIP IS A CHOICE, NOT A PRICE (S-BUNDLE-2 F1, 2026-09-12): the chip
reads "Pay with USDC" with "balance 3.35" beneath in the muted voice. It used to
read "USDC · 3.35" and was read as a price, because it was shaped like one. A
chip the wallet cannot afford FOR THE FACE IT IS ON is dimmed, unselectable, and
says "not enough" - affordance text, unruled (owner ruling 3); P7 remains the
ruled refusal if a tap happens anyway.

THE PRICE IS THE FACE'S PRICE (the same rung's second bug): every balance was
compared against bundlePrice on BOTH faces, so a holder was judged against
USD 20 when the order was USD 5. The picker and the dim take bundlePrice on the
bundle face and packPrice x packs on the top-up face.

FOUR FACES, one tile:
  disconnected        P1 + "USD 20 - USDC or USDT" + Connect wallet (not yet
                      through the door, so the sales line is theirs - R4)
  connected, non-holder   the BUY road (§2) - P1 and "USD 20 - USDC or USDT"
  connected, holder       the TOP-UP road (§3) - NEITHER of those two; P3 prices
                          it, and the chips name the asset
  any read failed     the busy sentinel - never a false Sold out and
                      never a false "you hold no Torana"

=====================================================
## 2. THE BUY ROAD
=====================================================
asset picker (USDC / USDT, defaulting to whichever the wallet can
actually pay with - both balances are read) -> the commitment line ->
PRE-FLIGHT -> approve the EXACT price -> buyBundle -> bounded wait ->
the receipt.

THE PRE-FLIGHT RUNS BEFORE ANY APPROVE (GATES 12e; owner ruling on P5,
2026-09-12). It is buyBundle.staticCall - a free eth_call - and it
exercises _safeMint's ERC-721 receiver check against live state. A
MetaMask smart account (EIP-7702) HAS CODE, so _safeMint calls
onERC721Received on it and a delegate without that hook reverts the
whole purchase. Because the pre-flight precedes the approval, the
ruled smart-account line can say "Nothing was signed" and be literally
true. The balance is read in the same breath, so an insufficient-funds
refusal also lands before any approval.

=====================================================
## 3. THE TOP-UP ROAD
=====================================================
Holders only. 1-4 packs of 500 DYC at USD 5 each; the headroom comes
from topUpRemaining(me). Same pre-flight, same exact approve, same
bounded wait, same receipt shape.

THE WINDOW'S DATE (owner ruling (d), 2026-09-12): PlayStore exposes no
getter over the window's timestamps, so the date the cap frees is
recovered from the wallet's OWN ToppedUp logs (the scanLogsResumable
idiom) - earliest live entry + 7 days. On a busy or incomplete scan the
sentinel "within 7 days" is used instead. W3-BUNDLE-4 is queued to add
a topUpWindow(address) view so the page can stop scanning.

DESIGN NOTE, QUEUED (R2, owner, 2026-09-12) - THE HOLDER FACE'S IMAGE. The tile
serves one image on every face: the Torana card. On the TOP UP face that card is
the thing the holder already owns, under a heading that no longer names it, so
the art is doing no work there. THE CARD IS THE BUNDLE'S IMAGE; whether the
top-up wants an image of its own, or none at all, is the owner's call and is not
decided here. Nothing is changed until it is.

THE ART CARRIES TWO FALSE LINES - ART-TORANA-1, QUEUED (2026-09-12). The card
image assets/tokens/Access_Torana_720.jpg has its text BAKED IN, and prints:

  One per hand, bound to the bearer, never sold, yours to burn. It admits you. It buys no advantage.
  The door is free. What lies beyond is earned.

The first carries the "never sold" clause that R7 corrected on the homepage the
same day. The SECOND is the line RULINGS_2026-08-27 rule 3 RETIRED as false in
August ("that line is false and retired") - so the card the store now sells, and
the rite page displays, still carries a sentence the rulings killed. No code can
fix either: it is pixels. ART-TORANA-1 is a regeneration item for the art
pipeline; until it lands, both pages serve the file as it is.

=====================================================
## 4. THE RECEIPT
=====================================================
The tokenId comes from the buy's OWN Bundled(buyer, payAsset, price,
dyc, tokenId) event, never from nextTokenId()-1, and is verified by
AccessNFT.ownerOf(tokenId) == me. The DYC figure is a balanceOf delta
across the wait. The tx links to polygonscan. One door out: "Sit at a
table" -> mp/hall.html, UNSTAMPED (S-HALL-ENTRY-1 R2 - mp/ stays
outside the entry-link ledger).

=====================================================
## 5. THE CEREMONY (owner ruling (a), 2026-09-12)
=====================================================
store.js's existing inline road - signerRoad -> staticCall ->
DYWallet.feeOverrides() -> send -> BOUNDED wait - plus resume-by-read.
NO pending ledger, and the reason is recorded: the Hall persists
pending records because a stake locks in escrow and the table may fail
to open, so money can strand between two transactions. Here buyBundle
and topUp are ATOMIC (the Torana and the DYC land together or nothing
moves) and the store never custodies a stablecoin, so the only thing
that survives a page death is a standing ALLOWANCE - not stranded
money, readable in one call, and resumed by re-rendering the tile.
S-CEREMONY-1 is queued to make one module of the four copies.

=====================================================
## 11. THE COPY (RULED - machine-proven by mp/copyproof.js)
=====================================================
Every line below is money-adjacent and is rendered VERBATIM. A
[bracket] is a substitution slot filled from chain, never a paraphrase.
CC never rewords these.

P1  tile
A Torana and 500 DYC - fifty Bronze tables' worth - for a wallet that came to play.

P2  commitment (shown before the first signature of the buy road)
USD 20 goes to the house now. Your Torana and 500 DYC land in the same transaction, or nothing moves.

P3  top-up
500 DYC for USD 5, up to 2,000 a week. Play money, delivered now.

P4  cap reached
You have topped up [2,000] DYC this week - the window frees [on 19 Sep 2026].

P5  smart-account refusal (from the pre-flight, before any approval)
This wallet is a smart account and cannot receive the Torana yet. Switch to a standard account (MetaMask: 'switch back to regular account') and try again. Nothing was signed.

P6  closed
The store is closed for now.

P6b sold out
The store is sold out for now.

P7  insufficient funds (caught by the balance read, before any approval)
Not enough [USDC] in this wallet - [USD 20] buys the bundle.

P9  the holder's face, above P3 (ruled 2026-09-12, S-BUNDLE-3 F2/F3)
The bundle - a Torana and 500 DYC - is USD 20. You already hold yours.

P8  the generic refusal (AssetNotAllowed / PriceUnset / ZeroPacks - all
    unreachable from the UI, and rendered rather than left a bare revert)
The store could not take this order - refresh and try again.

THE PRICE IS THE HERO NUMBER (S-BUNDLE-3, dated 2026-09-12): each face carries a
hero pair - the DYC figure and the price, same size, same gold, the payment assets
in the muted voice beneath the price. The old body-text line "USD 20 - USDC or
USDT" is GONE; it was never ruled copy (§11's set is P1-P9), and its words now
live in the hero block. The bundle face's hero says USD 20; THE HOLDER'S FACE
HERO IS LIVE - both its numbers follow the pack picker (x1 "+ 500 DYC / USD 5",
x2 "+ 1,000 DYC / USD 10"), because a fixed DYC figure beside a doubled price
would be a fresh misread. The holder's heading is TOP UP, not the card's name.
"USD 20" therefore appears TWICE on the bundle face - the hero and ruled P2's own
first words - and exactly once on the holder's face, inside ruled P9.

SUBSTITUTIONS, exhaustively:
  P4 [2,000]   capPerWallet(), read from chain
  P4 [on ...]  THE FILL CARRIES ITS OWN PREPOSITION, and this is a correction to
               the 2026-09-12 ruling, recorded rather than smoothed over: with an
               exact date the sentence is the ruled one word for word ("...the
               window frees ON 19 Sep 2026."), and with the sentinel it reads
               "...the window frees WITHIN 7 DAYS." Holding "on" in the frame, as
               the ruling's two halves literally did, rendered "the window frees
               on within 7 days" on a real screen. One line, one slot, both fills
               grammatical. The date is the earliest live ToppedUp + 7 days.
  P7 [USDC]    the chosen asset's symbol - USDC or USDT
  P7 [USD 20]  the sum this order needs - USD 20 for a bundle,
               USD 5 x packs for a top-up
  P9           no slots; it is the holder's face only, and it names the bundle's
               price so a holder knows what they already own

P1 IS THE LINE FOR ANYONE NOT YET THROUGH THE DOOR (owner ruling 2 of
2026-09-12, corrected by R4 the same day) - a SCOPE ruling, not a copy change:
the words are untouched and copyproof is unchanged. P1 stands on the
DISCONNECTED face and on the connected NON-HOLDER face, because both are people
the sales line is for. ONLY THE HOLDER'S FACE DROPS IT: a holder has already
walked through the door, and their face opens with P3.

FIFTY BRONZE TABLES IS ARITHMETIC, not flourish: the Hall's BRONZE tier
stakes 10 DYC a table, so 500 DYC is fifty of them. If the tier moves,
P1 moves with it.
