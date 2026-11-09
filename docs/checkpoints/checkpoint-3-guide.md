# Checkpoint 3: Policy, part 2: spending checks and approvals

**You write this one** (or ask Claude to write a step). File: `contracts/policy/src/lib.rs`.

## Goal

Every time the agent wants to spend, the policy contract runs four checks **in this order** (architecture.md §8):

1. Is the agent **active**?
2. Is the counterparty **allowed**?
3. Is the amount within the **per-deal cap**?
4. Is the amount within what's **left of the period cap**?

| Result | What happens |
|---|---|
| All 4 pass | The spend is approved and counted against this period |
| 1 or 2 fails | The call is refused (panics) |
| 3 or 4 fails | A **pending approval** is saved for the guardian to approve or reject |

At this checkpoint an approved spend is only *recorded*. At checkpoint 9 it becomes a real call to the escrow contract.

## Understand first

### 1. How the agent calls its own contract

At checkpoint 4 the agent gets a limited key **on the company account itself** (`acme.bizzy-fy.testnet`). When the agent uses it, the call comes *from* the company account *to* the company account. So:

```rust
env::predecessor_account_id() == env::current_account_id()   // "the caller is the agent"
```

Write this as an `assert_agent()` helper. Nobody else can make a call that comes from the company account, because the account has no full-access key. In unit tests, "being the agent" means `set_caller(COMPANY)`.

### 2. Storage collections (Solidity mappings)

A plain field like `limits` is loaded and saved in full on every call. For lists that can grow, use `near_sdk::store` collections, which load one entry at a time:

| Solidity | NEAR (`near_sdk::store`) | Can you loop over it? |
|---|---|---|
| `mapping(bytes32 => bool)` | `LookupSet<T>` | no (cheapest) |
| `mapping(uint => Approval)` + an array of keys | `IterableMap<K, V>` | yes |

**Every collection needs its own prefix**, a short byte string that tells its entries apart in storage. If two collections share a prefix they overwrite each other. Name the prefixes with an enum:

```rust
#[near]
#[derive(BorshStorageKey)]   // lets it be used as a prefix
enum StorageKey { Allowlist, Approvals }

// in new():
allowlist: LookupSet::new(StorageKey::Allowlist),
```

Collections can't `#[derive(Clone)]` or be compared, so they live only in `Contract`, never in structs you return.

### 3. Time and periods

`env::block_timestamp()` is **nanoseconds** since 1970, a `u64` (Solidity's `block.timestamp` is seconds).

Track the period with two fields:
- `period_start: u64`, set to now in `new`.
- `spent_this_period: NearToken`, starting at 0.

Before every spend, **roll the period**: if `now >= period_start + period_length_ns`, set `period_start = now` and `spent_this_period = 0`. Use `saturating_add` so a huge period length can't overflow.

In tests, move time forward with `.block_timestamp(...)` in the context (Foundry's `vm.warp`).

### 4. A private allowlist: store hashes, not names

Storing `acme ↔ beta` in plain text would show anyone who works with whom, which goes against "private by default". So the allowlist stores the **SHA-256 hash** of each counterparty's account ID (architecture.md §14.12):

```rust
fn hash_account(account: &AccountId) -> CryptoHash {      // CryptoHash = [u8; 32]
    env::sha256_array(account.as_bytes())
}
```

- The guardian adds the **hash** (`allow_counterparty(hash)`), so the account name never appears in the transaction either. The app computes the hash.
- In JSON, a hash travels as `Base58CryptoHash` (from `near_sdk::json_types`). Convert with `CryptoHash::from(h)`.
- **Limit of this privacy:** names are guessable, so someone could hash `beta.bizzy-fy.testnet` and check. It hides relationships from casual readers, not from a determined one. That's fine for the hackathon; say so in the README.

Not every company wants an allowlist (some find partners in the directory). Add **`allowlist_only: bool`** to `Limits`. When it's `false`, check 2 lets any counterparty through.

### 5. Returning a result instead of panicking

`request_spend` has two "success" outcomes, so it returns an enum (like returning a status code in Solidity):

```rust
#[near(serializers = [json])]
#[derive(PartialEq, Debug)]
pub enum SpendDecision {
    Approved,
    NeedsApproval { id: U64 },
}
```

Why not panic on a cap failure? A panic **undoes everything**, including saving the pending approval. Only checks 1 and 2 panic.

### 6. Don't let the agent spam storage

Every pending approval costs the company storage NEAR. A buggy or hacked agent could fill the contract with them. Cap it: `const MAX_PENDING: u32 = 20;` and refuse new ones once full.

### 7. Property tests (fuzzing) with proptest

Foundry fuzzes a test by running it with random inputs. `proptest` does the same in Rust:

```rust
proptest! {
    #[test]
    fn never_spends_past_period_cap(amounts in prop::collection::vec(1u128..=10, 0..30)) {
        // set up, call request_spend for each amount (in NEAR)
        // then: prop_assert!(spent_this_period <= period_cap);
    }
}
```

If it finds a failing input, it **shrinks** it to the smallest example and prints it. Add it with:

```bash
cargo add --dev proptest -p policy
```

## Write

### New state

| Field | Type | Meaning |
|---|---|---|
| `limits.allowlist_only` | `bool` (new field in `Limits`) | Only allowlisted counterparties may be paid |
| `allowlist` | `LookupSet<CryptoHash>` | Hashes of allowed counterparties |
| `period_start` | `u64` | When the current period began (ns) |
| `spent_this_period` | `NearToken` | Spent so far this period |
| `approvals` | `IterableMap<u64, PendingApproval>` | Spends waiting for the guardian |
| `next_approval_id` | `u64` | Next id to hand out (starts at 0) |

```rust
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct PendingApproval {
    pub counterparty: AccountId,
    pub amount: NearToken,
    pub created_at: U64,
}
```

### Methods

| Method | Who | Rules |
|---|---|---|
| `request_spend(counterparty, amount) -> SpendDecision` | agent | First: `amount > 0` and counterparty isn't the company itself. Then roll the period, then checks 1→4. All pass: add to `spent_this_period`, return `Approved`. Check 3 or 4 fails: save a `PendingApproval`, return `NeedsApproval { id }`. |
| `allow_counterparty(hash: Base58CryptoHash)` | guardian, 1 yocto | Add the hash |
| `remove_counterparty(hash: Base58CryptoHash)` | guardian, 1 yocto | Remove the hash |
| `approve(id: U64)` | guardian, 1 yocto | Must exist. Remove it, add its amount to `spent_this_period` (the guardian may go past the caps; that's the point). |
| `reject(id: U64)` | guardian, 1 yocto | Must exist. Remove it. |
| `get_spent_this_period() -> NearToken` | view | Return 0 if the period has already ended (a view can't change state, so compute it, don't roll) |
| `get_pending_approvals(from_index: u32, limit: u32) -> Vec<(U64, PendingApproval)>` | view | Use `.iter().skip(..).take(..)`. Paged so it can never run out of gas |
| `is_allowed(hash: Base58CryptoHash) -> bool` | view | |

**Error messages** (tests match on them):
- "Amount must be above 0"
- "Can't pay yourself"
- "Agent is not active"
- "Counterparty is not allowed"
- "Too many pending approvals"
- "No such approval"
- "Only the agent can do this"

### Helpers (plain `impl`, not public)

- `assert_agent(&self)`
- `hash_account(account: &AccountId) -> CryptoHash`
- `roll_period(&mut self)`

### Good to know

- **Approve doesn't spend money yet.** At checkpoint 9, `approve` and an `Approved` result will both call `escrow.create_deal`.
- **Changing `set_limits` mid-period** keeps `spent_this_period`. A lower cap applies right away. That's the safe direction.
- **Checks only count spends, not refunds.** If a deal is refunded later, the period total doesn't go back down. Simple and safe.

## Your unit tests

Keep tests 1–11 (update the `limits()` helper for `allowlist_only`). Add:

| # | Test | Expect |
|---|---|---|
| 12 | agent spends within both caps | `Approved`; `spent_this_period` goes up |
| 13 | a stranger calls `request_spend` | panics "Only the agent can do this" |
| 14 | spend 0 | panics |
| 15 | agent spends while `Suspended` | panics "Agent is not active" (set `contract.status` directly in the test) |
| 16 | `allowlist_only`, counterparty not on it | panics "Counterparty is not allowed" |
| 17 | `allowlist_only`, counterparty allowed by the guardian | `Approved` |
| 18 | amount over the per-deal cap | `NeedsApproval { id: 0 }`; nothing added to spent |
| 19 | spends that together pass the period cap | the last one is `NeedsApproval` |
| 20 | period cap reached, then time passes one period | `Approved` again (period rolled) |
| 21 | guardian approves | approval gone; spent goes up by its amount |
| 22 | guardian rejects | approval gone; spent unchanged |
| 23 | stranger approves | panics |
| 24 | approve an id that doesn't exist | panics "No such approval" |
| 25 | 21st pending approval | panics "Too many pending approvals" |
| 26 | `get_pending_approvals` paging | `from_index` and `limit` return the right slice |

**Property tests** (in the same `tests` module):

| # | Property | Random input |
|---|---|---|
| P1 | Within one period, `spent_this_period` never exceeds `period_cap` | a list of spend amounts |
| P2 | Every `Approved` spend is ≤ `per_deal_cap` | a list of spend amounts |

Together these are invariant 4 in `docs/security-testing.md`.

## Check

From `contracts/`:

```bash
cargo test -p policy                       # 26 tests + 2 property tests pass
cargo clippy -p policy --tests -- -D warnings
cargo fmt --check
cd policy && cargo near build non-reproducible-wasm
```

## Verified at the stop

Claude reviews your code for:
1. The checks run in the order active → allowed → per-deal → period, and only after the input checks.
2. Checks 1–2 panic; checks 3–4 save an approval and **don't** panic.
3. The period rolls before the checks, and the view doesn't change state.
4. Each collection has its own prefix from the `StorageKey` enum.
5. The allowlist stores hashes only; no account name is stored for it.
6. Pending approvals are capped, and approve/reject are guardian + 1 yocto.
7. All tests pass, including the property tests; clippy is clean.

Tell me when you're done, or say "write step 1" and Claude will write it.
