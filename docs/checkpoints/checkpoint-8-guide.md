# Checkpoint 8: Escrow: milestones, auto-release, disputes

**You write this one** (or ask Claude to write a step). File: `contracts/escrow/src/lib.rs`.

## Goal

Three things real B2B deals need (product.md "Settlement methods", architecture §14.3):

1. **Milestones:** pay in stages, e.g. 30% / 40% / 30%. A deposit up front is a first milestone; a holdback is a last one.
2. **Auto-release:** if the buyer goes quiet after a delivery, **anyone** can release the money once a review window passes. This fixes checkpoint 7's stuck case.
3. **Disputes:** either side can freeze the deal. Both sides then agree a split, or after a timeout the buyer gets back what's left.

```
Accepted ──mark_delivered──► Delivered ──confirm / release_due──► pay next milestone
   ▲                             │                                   │
   └──── more milestones left ◄──┴───────────────────────────────────┘
                                                      none left → Released

Accepted or Delivered ──dispute──► Disputed ──both propose the same split──► Split
                                       └──refund_on_timeout (after the window)──► Refunded
```

## Understand first

### 1. Milestones are paid in order

Store the amounts as `milestones: Vec<NearToken>` and how many are paid as `paid: u32`. The next milestone is always `milestones[paid]`. In-order milestones mean no per-milestone status to track: one counter does it.

What's left in escrow at any time:

```rust
fn remaining(deal: &Deal) -> NearToken {
    deal.milestones[deal.paid as usize..].iter().fold(NearToken::from_near(0), |a, m| a.saturating_add(*m))
}
```

Refunds and splits always use `remaining`, never `amount`, so a milestone already paid can't be paid again.

### 2. Milestones must add up

In `create_deal`, the milestones must sum to exactly the attached deposit. Otherwise money is either missing or stuck forever. Also cap them (`MAX_MILESTONES = 10`) and refuse zero amounts.

### 3. One timestamp for every window

Add `updated_at: U64`: the time of the last status change. The status tells you what it means:
- `Delivered`: when it was delivered → `release_due` after `REVIEW_WINDOW_NS`.
- `Disputed`: when the dispute began → `refund_on_timeout` after `DISPUTE_WINDOW_NS`.

```rust
const REVIEW_WINDOW_NS: u64 = 60 * 60 * 1_000_000_000;  // 1 hour: short enough to demo
const DISPUTE_WINDOW_NS: u64 = 60 * 60 * 1_000_000_000;
```

In production these would be days. Say so in the README.

### 4. A split needs both sides to agree

Store at most one open offer: `split_offer: Option<(AccountId, NearToken)>`: who offered, and how much goes to the seller.

`propose_split(id, seller_share)`:
- If the **other** side already offered the **same** amount → settle: pay `seller_share` to the seller, the rest of `remaining` to the buyer, status `Split`.
- Otherwise → save this as the open offer (replacing any older one).

No one can force a split alone, and no third party decides. If they never agree, the timeout refunds the buyer. That gives the seller a reason to agree to something fair.

### 5. A dispute blocks everything else

`dispute` sets the status to `Disputed`. Because `release_due`, `confirm` and `refund_expired` all check the status, none of them work on a disputed deal. No extra code needed.

### 6. Who's calling at checkpoint 9

Disputes and splits are **guardian decisions**. The agent's key can't call them (it can only call `request_spend`). At checkpoint 9 each company's policy contract gets guardian-only methods that forward to the escrow, so the escrow still sees the company account as the caller.

## Write

### Changes to `Deal`

| Field | Type | Meaning |
|---|---|---|
| `milestones` | `Vec<NearToken>` | Amounts, paid in order |
| `paid` | `u32` | How many are paid |
| `updated_at` | `U64` | Last status change (ns) |
| `split_offer` | `Option<(AccountId, NearToken)>` | Open split offer: who, and the seller's share |

`DealStatus` gets `Disputed` and `Split`. Final statuses: `Released`, `Refunded`, `Split`.

### Changed methods

| Method | Change |
|---|---|
| `create_deal(seller, terms_hash, deliver_by, milestones)` | 1–10 milestones ("1 to 10 milestones"); none zero ("Milestone amount must be above 0"); sum = deposit ("Milestones must add up to the amount"). Set `updated_at` and `paid = 0`. |
| `mark_delivered` | Also sets `updated_at = now`. Delivers the **next** milestone. |
| `confirm` | Pays the next milestone (helper below). |
| `cancel`, `refund_expired` | Refund `remaining`, not `amount`. |

### New methods

| Method | Who | Rules |
|---|---|---|
| `release_due(id) -> Promise` | anyone | Status `Delivered`; now ≥ `updated_at + REVIEW_WINDOW_NS` ("Review window not over"). Pays the next milestone. |
| `dispute(id)` | buyer or seller ("Only the buyer or seller can do this") | Status `Accepted` or `Delivered` → `Disputed`, `updated_at = now` |
| `propose_split(id, seller_share)` | buyer or seller | Status `Disputed`; `seller_share ≤ remaining` ("Split is more than what's left"). Match → status `Split`, send both payouts (`.detach()` them); else save the offer. |
| `refund_on_timeout(id) -> Promise` | anyone | Status `Disputed`; now ≥ `updated_at + DISPUTE_WINDOW_NS` ("Dispute window not over") → refund `remaining` |

### Helpers

```rust
/// Pays the next milestone to the seller. Released if it was the last, else back to Accepted.
fn release_next(deal: &mut Deal) -> Promise

/// What's still in escrow for this deal.
fn remaining(deal: &Deal) -> NearToken

/// Panics unless the caller is the buyer or the seller.
fn assert_party(deal: &Deal)
```

`refund` (from checkpoint 7) now sends `remaining`. Set the status **before** computing the Promise, as before. For `release_next`, take the amount *before* bumping `paid`.

### Good to know

- **A split pays two accounts:** two separate `Promise::new(..).transfer(..).detach()` calls. If one side's share is 0, skip its transfer: it would only waste gas.
- **Reputation:** at checkpoint 9 the escrow reports each final status to the registry (`OnTime`/`Late` on release, `DisputeWon`/`DisputeLost` on split or timeout).
- **The deadline** (`deliver_by`) still covers the whole deal: `refund_expired` returns whatever is left if the seller stops delivering.

## Your unit tests

Update the `create` helper to pass `vec![amount]` (one milestone = checkpoint 7's behaviour). Keep 1–18. Add:

| # | Test | Expect |
|---|---|---|
| 19 | milestones don't add up | panics "Milestones must add up to the amount" |
| 20 | 11 milestones | panics "1 to 10 milestones" |
| 21 | a zero milestone | panics "Milestone amount must be above 0" |
| 22 | 2 milestones: deliver + confirm once | `paid` 1, status `Accepted` |
| 23 | 2 milestones: both confirmed | `Released` |
| 24 | `release_due` inside the review window | panics "Review window not over" |
| 25 | `release_due` after the window, by anyone | milestone paid |
| 26 | stranger disputes | panics "Only the buyer or seller can do this" |
| 27 | dispute, then `release_due` | panics "Wrong status" |
| 28 | both propose the same split | `Split` |
| 29 | different offers | still `Disputed`; the latest offer is saved |
| 30 | split above `remaining` | panics "Split is more than what's left" |
| 31 | `refund_on_timeout` too early | panics "Dispute window not over" |
| 32 | `refund_on_timeout` after the window | `Refunded` |

## Claude's sandbox test

Claude extends `contracts/escrow/tests/lifecycle.rs`, checking exact balances:
1. A 2-milestone deal (1 + 1 NEAR): confirm pays the seller exactly 1; inside the review window a stranger's `release_due` fails. (Moving the sandbox clock a full hour is too slow, so unit tests 24–25 cover the window; `release_due` pays through the same `release_next` as `confirm`.)
2. A disputed 2 NEAR deal split 1.5 / 0.5: the seller gets exactly 1.5, the buyer 0.5 minus the gas for the call that settled it.

## Check

From `contracts/`:

```bash
cargo test -p escrow
cargo clippy -p escrow --tests -- -D warnings
cargo fmt --check
cd escrow && cargo near build non-reproducible-wasm
```

## Verified at the stop

1. Milestones add up to the deposit; refunds and splits use `remaining`.
2. A dispute blocks release, confirm and refund_expired.
3. A split needs both sides to propose the same amount.
4. Every final state (`Released`, `Refunded`, `Split`) has paid out exactly `remaining`, once.
5. Status (and `paid`) change before each Promise.
6. All tests pass, including the sandbox test; clippy is clean.

Tell me when you're done, or say "write step 1" and Claude will write it.
