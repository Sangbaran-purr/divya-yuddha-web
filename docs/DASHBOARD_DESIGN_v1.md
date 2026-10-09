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
- The cash-out desk's reserve can't cover this right now. Try a smaller amount or check back later.
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

- You need a small amount of POL for network fees. Add a little POL to your wallet and try again.

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
USD. "Paid" is decided from the desk's own `invitePaid`: unlocked rewards are paid in unlock order.

⚠ **THE LIST NEEDS ONE BOT FIELD THAT DOES NOT EXIST YET.** The bot's `/invites/code` answers `{ code, existing }`
today. The card reads an optional `invites: [{ buyer, ts, unlockAt, status, rewardWei }]` beside the code (status =
the deriver's own `pending | unlocked | held`; buyer shortened server-side). Until the bot sends it the card shows the
code and link and says the purchases can't be shown right now - it never invents a list.

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

**The invite service's refusals** (`INV_SVC`)

- Invites are unavailable for a moment. Try again shortly.
- That signature has expired. Sign again.
- That signature couldn't be verified. Sign again.
- Invite codes are for Torana holders.
- Please sign once more to create your code.
- We can't check that right now - nothing is lost. Try again shortly.
- Invites are not open yet.
- Invites are unavailable right now.
