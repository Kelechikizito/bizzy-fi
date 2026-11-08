# Checkpoint 7: Escrow: full lifecycle

**You write this one** (or ask Claude to write a step). File: `contracts/escrow/src/lib.rs`. It still holds the auction template: replace all of it.

## Goal

The escrow holds a deal's money until the deal ends, then sends it to **exactly one** place:

```
            create_deal (buyer locks NEAR)
                     │
                 Proposed ──cancel (buyer)──────────────► Refunded → buyer
                     │ accept_deal (seller, same terms hash)
                 Accepted ──refund_expired (anyone, after deadline)► Refunded → buyer
                     │ mark_delivered (seller)
                 Delivered
                     │ confirm (buyer)
                 Released → seller
```

(`Proposed` can also expire: `refund_expired` works there too.)

Checkpoint 8 adds milestones, auto-release when the buyer goes quiet, and disputes. Checkpoint 9 makes the policy contract the caller.

**Why custom, not a partner:** Agent Market has escrow, but for hiring agents by the job on its marketplace. Our deals are between company policy contracts and must write reputation to our registry (architecture §6), so no partner fits.

## Understand first

### 1. Receiving and sending NEAR

| Solidity | NEAR |
|---|---|
| `payable` + `msg.value` | `#[payable]` + `env::attached_deposit()` |
| `payable(to).transfer(x)` | `Promise::new(to).transfer(x)` |

`Promise::new(...).transfer(...)` runs **after** your method ends (it's a Promise). So: **change the status first, then create the transfer.** If the transfer is created first and something panics later, the whole call is undone anyway, but status-first is the habit that stops double payouts.

Return the Promise from the method (like `withdraw` in the policy) or `.detach()` it.

### 2. Who is a company? Check the account name

Only the registry (`bizzyfy.testnet`) can create `*.bizzyfy.testnet` accounts. So "the caller is a registered company" is just:

```rust
env::predecessor_account_id().is_sub_account_of(&self.registry)
```

No call to the registry needed. Check the seller the same way. (Our own `escrow.bizzyfy.testnet` also passes, but it never calls itself.)

At checkpoint 9 the buyer's **policy contract** calls `create_deal`, so the caller is the company account. The seller's agent will reach the escrow the same way, through its policy. Either way, `predecessor` is the company.

### 3. Agreeing on terms without revealing them

The terms stay encrypted off-chain; only their SHA-256 goes on chain (`terms_hash`). The buyer sends it in `create_deal`; the seller must send the **same** hash in `accept_deal`. A mismatch means they agreed to different things, so refuse.

Each side's call is signed by its own account, so on chain that *is* both signatures. NEP-413 signatures stay off-chain, in the negotiation.

### 4. Deadlines

`deliver_by` is a timestamp in nanoseconds (like `env::block_timestamp()`). In JSON it travels as `U64` (a string), because JavaScript can't hold a u64 exactly.

## Write

### State

```rust
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum DealStatus { Proposed, Accepted, Delivered, Released, Refunded }

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct Deal {
    pub buyer: AccountId,
    pub seller: AccountId,
    pub amount: NearToken,
    pub terms_hash: Base58CryptoHash,
    pub deliver_by: U64,
    pub status: DealStatus,
}
```

| Field | Type | Meaning |
|---|---|---|
| `registry` | `AccountId` | Parent of every company account |
| `deals` | `IterableMap<u64, Deal>` | All deals, by id |
| `next_deal_id` | `u64` | Starts at 0 |

`const MIN_DEAL: NearToken = NearToken::from_millinear(100);` (0.1 NEAR): every deal costs the escrow storage, so tiny spam deals are refused.

### Methods

| Method | Who | Rules → result |
|---|---|---|
| `new(registry)` | init | |
| `create_deal(seller, terms_hash, deliver_by) -> U64` | a company, payable | Caller is a company ("Only companies can do this"); seller is a company ("Seller is not a company"); seller ≠ buyer ("Can't deal with yourself"); deposit ≥ `MIN_DEAL` ("Deal amount too small"); `deliver_by` > now ("Deadline must be in the future"). Save as `Proposed`, return the id. |
| `accept_deal(id, terms_hash)` | seller | Status `Proposed`; hash matches ("Terms don't match") → `Accepted` |
| `mark_delivered(id)` | seller | Status `Accepted` → `Delivered` |
| `confirm(id) -> Promise` | buyer | Status `Delivered` → `Released`, pay the seller |
| `cancel(id) -> Promise` | buyer | Status `Proposed` (seller hasn't accepted yet) → `Refunded`, pay the buyer back |
| `refund_expired(id) -> Promise` | anyone | Status `Proposed` or `Accepted`, and now > `deliver_by` ("Not expired") → `Refunded`, pay the buyer back |
| `get_deal(id) -> Option<Deal>` | view | |
| `get_deals(from_index, limit) -> Vec<(U64, Deal)>` | view | Paged |

**Shared error messages:** "No such deal", "Only the buyer can do this", "Only the seller can do this", "Wrong status".

### Helpers (plain `impl`)

Most methods start the same way. Two helpers keep them short:

```rust
/// The deal, or panics "No such deal".
fn deal_mut(&mut self, id: U64) -> &mut Deal

/// Panics unless the deal has this status.
fn assert_status(deal: &Deal, status: DealStatus)
```

### Good to know

- **Why anyone can call `refund_expired`:** the money can only go back to the buyer, so letting anyone trigger it is safe, and it means a frozen or offline buyer still gets refunded.
- **A delivered deal the buyer never confirms** would stay stuck. Checkpoint 8's `release_due` fixes that (auto-release after a review window). Until then, don't demo that path.
- **Transfers can't bounce:** company accounts have no full-access key, so they can never be deleted, so a transfer to one always lands.
- **Amounts are public** on NEAR (architecture §7). Terms are not.

## Your unit tests

Delete the auction tests. Use companies `buyer.bizzyfy.testnet` and `seller.bizzyfy.testnet` with registry `bizzyfy.testnet`.

| # | Test | Expect |
|---|---|---|
| 1 | company creates a deal with 1 NEAR | id 0, `Proposed`, amount 1 NEAR |
| 2 | a non-company creates a deal | panics "Only companies can do this" |
| 3 | seller isn't a company | panics "Seller is not a company" |
| 4 | deal with yourself | panics "Can't deal with yourself" |
| 5 | 0.05 NEAR | panics "Deal amount too small" |
| 6 | deadline in the past | panics "Deadline must be in the future" |
| 7 | seller accepts with the same hash | `Accepted` |
| 8 | seller accepts with a different hash | panics "Terms don't match" |
| 9 | someone other than the seller accepts | panics "Only the seller can do this" |
| 10 | full path: accept → deliver → confirm | `Released` |
| 11 | confirm twice | second panics "Wrong status" (no double payout) |
| 12 | buyer confirms before delivery | panics "Wrong status" |
| 13 | buyer cancels before acceptance | `Refunded` |
| 14 | buyer cancels after acceptance | panics "Wrong status" |
| 15 | refund before the deadline | panics "Not expired" |
| 16 | refund after the deadline (Accepted) | `Refunded` |
| 17 | refund after `Delivered` | panics "Wrong status" |
| 18 | `get_deals` paging | right slice |

## Claude's sandbox test

`contracts/escrow/tests/lifecycle.rs` replaces the auction test. On a local node, with real NEAR moving:
1. Buyer locks 2 NEAR → the escrow's balance goes up by 2.
2. Accept → deliver → confirm → the seller's balance goes up by 2.
3. A second deal expires → `refund_expired` → the buyer gets 2 back.

## Check

From `contracts/`:

```bash
cargo test -p escrow
cargo clippy -p escrow --tests -- -D warnings
cargo fmt --check
cd escrow && cargo near build non-reproducible-wasm
```

## Verified at the stop

1. Every path ends with the money in exactly one place: seller (Released) or buyer (Refunded).
2. Status changes **before** each transfer; `Released` and `Refunded` are final.
3. Each method checks the right caller and status.
4. Companies are checked with `is_sub_account_of(registry)`, for buyer and seller.
5. Hashes must match to accept.
6. All tests pass, including the sandbox test; clippy is clean.

Tell me when you're done, or say "write step 1" and Claude will write it.
