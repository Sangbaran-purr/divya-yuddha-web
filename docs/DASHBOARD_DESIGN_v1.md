# DASHBOARD_DESIGN_v1 — the wallet dashboard, and its first copy law

Authority for `js/dashboard.js`. Written at WINNINGS-4 (2026-09-25), the rung that added the fifth card.
The desk is `contracts/src/WinningsDesk.sol` (web3 `2b1f106`); the service is `services/approval-bot/src/winnings/*`
(web3 `9d729fe`). Neither is deployed.

## 1. Owner rulings in force (2026-09-25)

- Only **won-liquid** winnings are withdrawable — DYC won from a match whose **loser** staked liquid DYC.
- **0.008 USDT per DYC**, fixed until DYC lists on a DEX.
- **Minimum 125 DYC (USD 1).**
- **One withdrawal per wallet per 24 hours.**
- Redeemed **DYC returns to the treasury**.
- A **facility while the reserve lasts**, never an entitlement.

## 2. The fifth card

It sits **beside** the four balances, not among them, and it is deliberately not a `.bcard`: winnings are a **tag on
liquid DYC the player already holds**, not a fifth column. Giving it the balance-card shape would say otherwise.

**It ships DORMANT.** `mf-config.js` carries `contracts.winningsDesk: null` and `winningsServiceUrl: null`. With
either missing the card renders its "not yet open" face and **no contract call is made, no coupon is requested and
nothing is signed** — a half-configured deploy cannot produce a card that asks a wallet to sign against a desk that
is not there.

**Every number shown was read.** A failed read renders `—` (the busy-sentinel law), never a zero that looks real.
The withdrawable figure is the signed cumulative minus the desk's own `redeemed(wallet)`; the cooldown comes from
`lastRedeem(wallet) + COOLDOWN`.

## 3. The ceremony

Two steps, and **the order is the safety**:

1. **Request approval** — `GET /winnings/challenge`, sign the message as the connected wallet (`signMessage`, the
   Hall's idiom), `POST /winnings/coupon` with `{nonce, signature}` and **no wallet field**. The service recovers
   the address, so nothing this page claims is trusted.
2. **Withdraw** — approve DYC if needed, then `redeem(amount, cumulative, deadline, sig)`, in the dashboard's own
   multi-step shape (`actTopUp`): pre-simulate every leg, narrate each wallet prompt, decode in the winnings context.

Step 2's handler is **only attached when a coupon is actually held**, so there is no path that sends a transaction
without one. A spent approval clears `winCoupon`, which makes step 2 unreachable again until step 1 is repeated.

## 4. ⚠ The shared-selector trap

`ExpiredCoupon(uint256)` and `BadSignature(address)` are **the same selectors** on WinningsDesk and DropDesk. A
name-keyed sentence therefore answers a winnings failure in the DropDesk's words — and a drop coupon lives **90
days** while a withdrawal approval lives **4 hours**. Saying the wrong one is a lie, so `decodeErr(e, ctx)` takes a
context and consults `ERR_WINNINGS` first. `ReserveInsufficient(uint256,uint256)` is a *different* selector from
RoiRedemption's no-arg one; both are in the ABI and ethers resolves the overload.

## 5. Zero-PII

The card shows the connected wallet's own figures only. **Nothing leaves the page but the signed challenge.** No
analytics event is attached to this card — it is a money path, and the tag stays out of it.

## 11. RULED COPY (doc → `js/dashboard.js`, pinned by `mp/copyproof.js`)

This is the dashboard's first copy law and copyproof's **third pair**, after the Hall's §11 and the Store's §11.
Every line below is asserted verbatim against the source.

**The card**

- Winnings are a tag on the DYC you already hold - not a separate balance. Only DYC won from a match where your opponent staked liquid DYC can be withdrawn.
- 0.008 USDT per DYC - fixed until DYC lists on an exchange.
- Minimum withdrawal 125 DYC (USD 1).
- One withdrawal per wallet every 24 hours.
- The DYC you withdraw returns to the treasury.
- Withdrawals are available while the desk's USDT reserve lasts. This is a facility, not an entitlement.
- Withdrawals are not yet open. The desk opens when the reserve is funded.
- A win needs a few minutes on chain before it can be withdrawn.
- Withdraw [900] DYC and receive [7.200000] USDT. The DYC returns to the treasury.
- Your next withdrawal opens at [time].

**The desk's failures** (`ERR_WINNINGS`)

- You have already withdrawn today. Only one withdrawal per wallet every 24 hours.
- The minimum withdrawal is 125 DYC (USD 1).
- You have withdrawn all of your winnings so far.
- This withdrawal approval has expired. Approvals last 4 hours - ask for a fresh one.
- Withdrawals are paused for a moment.
- The cash-out desk's reserve can't cover this right now. Your winnings are safe; check back later. *(amended WINNINGS-INSTANT-1, 2026-10-30 - was "...Try a smaller amount or check back later."; the card has no amount to make smaller. The staking cash-out's own line in `ERR_PLAIN` is unchanged - see §15.)*
- This withdrawal approval couldn't be verified. It may be from an old signing key - ask for a fresh one.

**The service's refusals** (`SVC_PLAIN`)

- We can't confirm your winnings right now - nothing is lost. Try again shortly.
- You've just asked for one - give it a minute and try again.
- You have nothing to withdraw yet. *(S3, amended at AFFILIATE-1 rung 3 - was "You have no winnings to withdraw yet."; the card now withdraws two things)*
- That sign-in couldn't be verified. Start again.
- Withdrawals aren't available from your location.
- Withdrawals need identity verification first.
- This wallet can't be served.

**The gas sentence** (MP-FIX-3A shape — a gas-short wallet hears about POL, never about DYC)

- You need a small amount of POL for network fees. Bridging to Polygon? Polygon Portal, Jumper and Relay can add a little POL to your bridge — look for the gas or Refuel option. Withdrawing from an exchange? Add a little POL on the Polygon network.

> AMENDMENT 2026-10-25 (GAS-HELP-1 R0, owner rulings): the gas sentence now says WHERE the POL comes from — the bridges
> that can add POL on arrival (Polygon Portal, Jumper, Relay; each verified from its own docs) and the exchange's Polygon
> network. It replaces "Add a little POL to your wallet and try again." The fee banner's second line carries the same
> guidance (it said "Buy a little POL on an exchange that supports Polygon, or swap for it in your wallet.").

> AMENDMENT 2026-10-25b (GAS-HELP-1 R3, owner rulings): POL FOR THE NETWORK FEE. A buyer who holds the coin but whose
> POL cannot cover the sends' fee cap is topped up by the approval bot (POST /gas/topup) just before the approve —
> on the dashboard's presale buy and on both store roads (after the invite step). The three owner-approved lines live
> ONCE, in js/wallet.js (DYWallet.GAS_COPY), shared by every road:
>
> - waiting: Getting you a little POL for the network fee — free…
> - received: POL received — your wallet will now ask you to approve, then to buy.
> - fallback: We couldn't send POL just now — you can still go ahead: MetaMask can pay the network fee in USDT or USDC if you hold a little extra.
>
> It never hard-blocks: a refusal, an unreachable bot or POL slow to arrive shows the fallback line and the wallet is
> asked anyway (the store roads then pass their own gas budget as the gas limit, so the wallet opens instead of the
> page's estimate failing first). The presale buy no longer stops on the gas sentence; the other dashboard actions do.

> AMENDMENT 2026-10-29 (BOT-COLDSCAN-1, owner rulings): THE WARMING SENTENCES. After a restart the approval bot's first
> count takes a while; until it finishes, a request waits up to 20 s and then gets the named answer WARMING - never a
> smaller or partial number. The dashboard's withdraw and invite-code requests now give up after 30 s with the same
> sentence. Ruled word for word:
>
> - Withdrawals are waking up - try again in a minute. Nothing is lost.
> - Your code is ready. Who used it is still being counted - check again in a minute.
> - Your invite code is still being prepared - try again in a minute. Nothing is lost.

## 12. AFFILIATE-1 rung 3 (2026-10-09) - ONE WITHDRAW CARD, AND THE TORANA INVITES CARD

The desk is web3 `fc5d117`: one `DeskCoupon(wallet, cumulativeWinningsWei, cumulativeInviteWei, deadline)` carries two
lifetime ceilings, and `redeem(winningsAmount, inviteAmount, cumW, cumI, deadline, sig)` draws from either or both. The
service is the approval bot at `aa53ae7` (`/winnings/coupon` now returns `cumulativeInviteWei`; `/invites/code` and
`/invites/bind`).

**The Withdraw card** replaces the Winnings card in place (same panel, same two-step ceremony, same guards). It shows
a winnings line and an invite-rewards line, each the signed cumulative minus the desk's own ledger for that part
(`redeemed`, `invitePaid`) - never netted against each other. Minimum 125 DYC across both, one withdrawal per 24
hours (the desk's shared cooldown). **Only the winnings part needs a DYC approval.** With no winnings part the
allowance is not even read, so an invite-only withdrawal can never ask for an approval.

**The Torana Invites card** is shown only when `inviteServiceUrl` is set AND the connected wallet holds a Torana. Its
Torana read runs only when the service is configured. "Get my invite code" signs the bot's `InviteCodeRequest`
(`js/invite.js`, proven equal to the bot's struct) and posts it; the bot recovers the wallet. The card shows the code,
the share link `https://divyayuddha.games/store.html?invite=CODE&utm_source=invite&utm_medium=torana&utm_campaign=invite`
with a copy button, the invited purchases (buyer SHORTENED, date, reward, status in plain words) and totals in DYC and
USD. **Statuses are the bot's, taken as-is (rung 3b):** the bot lays the desk's own `invitePaid` over the unlocked
rewards oldest first and says `paid` per reward; the page maps `paid` → "Paid", `unlocked` → "Ready to withdraw" (or
the desk-not-open line while the desk is dormant), `pending` → "Unlocks on [date]", `held` → "Held for review". A partly
paid reward is `unlocked`; the totals split it by the bot's `paidWei` (Paid = what the desk paid, Ready = the rest).
The page used to redo the split itself and, given the bot's list, put "Paid" on the wrong purchase - one source now.

**The list comes from the bot** (web3 rung 2b, `0cfa3fc`): `/invites/code` answers `{ code, existing, invites }`
with `invites: [{ buyer, ts, unlockAt, status, rewardWei, paidWei }]`, buyers shortened by the bot - the full address
never leaves it. When the bot omits the list (a failed read on its side) the card says the purchases can't be shown
right now - it never invents one.

**Never "affiliate", never "referral"** in this scheme's copy. The sidebar's "Referrals" link is a different, older
thing and is untouched.

### Ruled copy (pinned by `mp/copyproof.js`)

**The Withdraw card**

- Withdraw your winnings and your Torana Invites rewards here, as USDT.
- Invite rewards are paid in USDT - no DYC leaves your wallet for them.
- Withdraw [900] DYC of winnings and [250] DYC of invite rewards, and receive [9.200000] USDT. The winnings DYC returns to the treasury.
- Withdraw [250] DYC of invite rewards and receive [2.000000] USDT. No DYC leaves your wallet.
- Connect your wallet to see what you can withdraw.
- You have withdrawn all of your invite rewards so far.

(A winnings-only withdrawal keeps W9 above, word for word.)

**The Torana Invites card**

- Share your invite link. When a friend buys their first bundle through it, you earn 10% of what they paid.
- Rewards are counted in DYC at 0.008 and paid as USDT from the Withdraw card.
- A reward unlocks 7 days after your friend's purchase.
- Only a friend's first bundle counts, and only if they have never held a Torana.
- Your friend signs a free invite before they buy - it costs them nothing.
- More than 25 rewards in one month are checked by hand before they unlock.
- No invited purchases yet.
- Your invited purchases can't be shown right now.
- Link copied.
- Unlocks on [date]
- Ready to withdraw
- Paid
- Held for review
- Unlocked - withdrawals open when the desk does.

**The Torana Invites card - v2** (INVITES-2, owner rulings 2026-10-12). Shown ONLY while the bot's daily digest
(`invites-digest.json`, latest entry) says `"scheme": "v2"` - the owner flips the bot's `INVITES_SCHEME` after counsel
confirms the multi-level structure. Until then, and whenever the digest can't be read, the card is exactly the v1 card
above. Under v2 the lead, steps, bonus and card lines replace the v1 lead and the review line (v2 has no review brake);
the paid-as, unlock, first-bundle and free-invite lines stay. A deeper step's buyer is never shown - only its step. The
card-store lines appear only once the USDT/USDC card store is configured (CARD-STORE-1); DYC card purchases earn nothing.

- Share your invite link. When a friend buys their first bundle through it, you earn 5% of what they paid.
- When the friends they invite buy their first bundle, you earn 1% more - and so on, up to five steps beyond your own friends.
- Weekly bonus: when 20 of your own friends buy their first bundle in one week (Monday to Monday, UTC), you earn $40 more. 50 earns $100, 100 earns $200 and 200 earns $400 - only the highest step counts.
- A weekly bonus unlocks 7 days after its week ends.
- This week: [12] of [20] - reach [20] for a $[20] bonus.
- This week: [210] - the top bonus of $400 is reached.
- Your friends
- Step [2]
- Step 2 is the friends your friends invite, and so on up to step 6.
- Weekly bonus - week of [date]
- When they buy a card in the store with USDT or USDC, you earn the same shares of its price.
- Cards bought with DYC earn nothing.

**The v2 amendment** (INVITES-2 amendment, owner rulings final): under v2 the card shows for ANY connected wallet (open
codes - no Torana needed to get a code). Rewards accrue for every wallet and are released once it owns a Torana (its own
bundle, or a presale Torana); until then the card says so, with the accrued amount in USDT, and each accrued row says
what it waits for. The step rows show all six levels with the count at each.

- You have earned [X] USDT in invite rewards. They unlock when you own a Torana — buy the bundle to release them.
- Unlocks when you own a Torana

**The invite service's refusals** (`INV_SVC`)

- Invites are unavailable for a moment. Try again shortly.
- That signature has expired. Sign again.
- That signature couldn't be verified. Sign again.
- Invite codes are for Torana holders.
- Please sign once more to create your code.
- We can't check that right now - nothing is lost. Try again shortly.
- Invites are not open yet.
- Invites are unavailable right now.

## 13. MY INVITES (MY-INVITES-1, owner rulings 2026-10-14) - the affiliate's own page, `my-invites.html`

A separate page (not in the main nav), linked from the Torana Invites card. Every number is the approval bot's
`/invites/mine` answer, computed from the SAME ledger that signs the desk's coupons: the page can never show more than
the desk will pay ("Unlocked (ready)" = the ledger's unlocked entitlement minus what the desk has paid). A failed read
is a sentence, never zeros. Privacy is shaped by the bot: your own data only (the request is SIGNED by your wallet, a
free EIP-712 message valid 5 minutes and usable once), level 1 as shortened wallets, levels 2-6 as totals only, your
inviter shortened; no full address, no email, nothing about anyone's other holdings. Under v1 the page shows level 1
at 10% on first bundles and no bonus section; the v2 sections (six levels, the weekly bonus, "Locked until you own a
Torana") appear only when the bot answers scheme v2. Withdrawals stay on the dashboard's one Withdraw card (the page's
button links there). The page makes no chain reads (card names come from the local wave registry).

### Ruled copy (pinned by `mp/copyproof.js`, doc → `js/myinvites.js`, and the dashboard's one link line → `js/dashboard.js`)
- See my invites →
- My Invites
- Everyone who joined through your invite link, what they bought, and what it earned you.
- Sign a free message to show your invites. It moves no money and works once.
- Connect your wallet to see your invites.
- Switch your wallet to Polygon to see your invites.
- My Invites is not open yet.
- Your invites can't be read right now - nothing is lost. Try again in a moment.
- Nothing was shown - the message is free and moves no money. Tap Show my invites to try again.
- You don't have an invite code yet - get one on the dashboard.
- Counts only purchases that pay: a friend's first bundle, bought after they joined you. Top-ups and card buys never pay.
- Counts only purchases that pay: a first bundle or a USD card, bought after the buyer joined. Top-ups and DYC card buys never pay.
- Friends of friends are shown as totals only.
- Locked until you own a Torana
- Withdraw on the dashboard
- 125 DYC = USD 1.
- What they bought
- (highest tier reached only)
- Your invites are still being counted - try again in a minute. Nothing is lost. *(BOT-COLDSCAN-1, ruled 2026-10-29: the bot is still counting after a restart)*

Review fixes (owner, 2026-10-14): the direct-invitees column is "What they bought"; the weekly bonus (v2) shows the whole
ladder under the count - "20 bundles → USD 40 · 50 → USD 100 · 100 → USD 200 · 200 → USD 400 (highest tier reached only)" -
from the bot's own tiers, the step reached highlighted; "Withdraw on the dashboard" is the site's normal gold button
whenever Unlocked (ready) > 0, and dimmed only at 0. Card names come from the store page's own lookup (the launch list,
then the wave registry); a suite check holds every live id to the store's resolveCard, and on 2026-10-14 all 87 live
ids were checked against their on-chain metadata (WaveCardNFT tokenURI base) and priceOf/1e14 - 0 mismatches.

## 14. YOUR TORANA (TORANA-AUTO-1, owner rulings 2026-10-29) - the automatic Torana for ICO buyers of USD 100+

ToranaIcoClaim (`0xc92dc5dfbda2b70F20286Bc5A0E69DD0832Be4e7`, no owner, nothing changeable) mints ONE Torana to any wallet
whose ICO spend - the presale and the public sale added together, read live from the sale - is USD 100 or more. The
approval bot sends the claim within minutes (TORANA_AUTO); anyone may call it, and the Torana always goes to the buyer.
The panel reads `status(me)` (and, only when eligible, simulates `claimFor(me)` from the wallet itself, which is how
"can't receive" is known before any fee is asked). It is hidden unless it has something to say; a wallet that already
holds a Torana another way, has bought nothing, or whose read failed sees no panel (a failed read is never a guess).
After a purchase on this page, the buy panel carries the S1 or S2 line under "Purchase complete".

### Ruled copy (pinned by `mp/copyproof.js`, doc → `js/dashboard.js`)
- Your Torana is on its way - it arrives in your wallet within a few minutes.
- Buy USD [X] more in the sale and a Torana comes with it.
- Your Torana hasn't arrived yet. You can claim it yourself - it's free; you pay only the network fee.
- Claim my Torana
- Your wallet can't receive the Torana right now. Nothing is lost - it stays yours to claim.
- Your Torana has arrived.

"On its way" shows for 10 minutes after a buy made on this page (a timestamp in this browser); after that, an eligible
wallet that still has no Torana is offered the self-claim. The Treasury's second road ("Or buy USD 100 or more of DYC in
the sale - a Torana comes with it.") and the homepage's corrected Torana bullet are ruled in RULINGS_2026-08-27,
amendment 2026-10-29.

## 15. INSTANT WINNINGS, CAPPED (WINNINGS-INSTANT-1, owner rulings 2026-10-30)

Game winnings stay instant (a win is withdrawable a few minutes after it settles). New: the approval bot signs at most
USD [CAP] of WINNINGS per withdrawal - the bot's setting `WINNINGS_DAILY_CAP_USD` (100 at go-live), read by this page from
`/winnings/policy`, never written into it. The desk allows one withdrawal per wallet per 24 hours, so the per-withdrawal
cap IS the daily cap, and "a day" is 24 hours after the last withdrawal (the desk's rule, not the UTC day). What is above
the cap carries over to the next withdrawal by itself. Invite rewards are not capped and keep their 7-day wait. Winnings
from matches held for review (same pair, fast forfeit, new player) are shown apart and released by the owner in the
"Winnings Holds" tab. A withdrawal the desk's reserve can't cover is refused before anything is signed - never part-paid,
and the player's one withdrawal in 24 hours is not used up.

### Ruled copy (pinned by `mp/copyproof.js`, doc → `js/dashboard.js`)
- Up to USD [CAP] of winnings per withdrawal.
- You've won [TOTAL] DYC. You can withdraw up to USD [CAP] now; the rest becomes available with your next withdrawal, 24 hours after this one.
- [HELD] DYC of your winnings is under a routine check before it can be withdrawn. Nothing is lost: it stays yours and is released after the check.
- The cash-out desk is being refilled. Your winnings are safe; try again later.
- The cash-out desk's reserve can't cover this right now. Your winnings are safe; check back later.

[TOTAL] is the winnings still to be withdrawn (not held); [HELD] the held winnings not yet paid. The desk-unreadable and
holds-unreadable refusals reuse the existing "We can't confirm your winnings right now - nothing is lost. Try again
shortly." The staking cash-out's reserve line ("...Try a smaller amount or check back later.") is NOT part of this ruling:
its wording is open (that panel also has no amount field - flagged to the owner 2026-10-30).
