# Checkpoint 6: Registry, part 2: attestations and reputation

**You write this one** (or ask Claude to write a step). File: `contracts/registry/src/lib.rs`.

## Goal

The registry keeps facts about each company that **nobody can fake**:

| Fact | Written by | Example |
|---|---|---|
| **Attestations** | the `attester` account (our backend) | "a real human runs this" (World ID), "KYB passed" (labeled mock), the operating agreement's hash |
| **Reputation** | the `escrow` contract only | deals completed, on time, disputes, counterparties, volume |
| **Referrals** | the registry itself | +1 for the referrer when a referred company is created |

From these, two views compute a **score** and a **trust tier** (0–4) with a published formula.

## Understand first

### 1. Who may write: the caller is the proof

Same idea as `assert_guardian`: compare `env::predecessor_account_id()` with a stored account.

- `attest` → caller must be `attester`. The backend checks the World ID proof off-chain (World ID isn't on NEAR), then calls `attest`.
- `record_outcome` → caller must be `escrow`. Only the escrow contract knows how a deal ended, and since its code is public, everyone can check it reports honestly.

There is **no other way** to change reputation: no owner override, no setter. That's what makes it worth something.

### 2. World ID nullifiers (sybil resistance)

When someone proves they're human with World ID, our app gets a **nullifier**: an anonymous ID that is the same every time **that person** verifies for our app, but tells you nothing about who they are. The backend hashes it to 32 bytes and sends it as `hash`.

Store how many companies each nullifier has verified, and cap it: `MAX_COMPANIES_PER_HUMAN = 3`. Without the cap, one person could make 100 "verified" companies that do fake deals with each other to inflate their scores.

**Privacy limit (say it in the README):** the nullifier hash is visible in the `attest` transaction, so someone who looks could tell that two companies were verified by the same person. Not who it is.

### 3. Counting distinct counterparties

"Did acme already deal with beta?" needs a set of pairs. Store a hash of the pair in a `LookupSet<CryptoHash>`:

```rust
let pair = env::sha256_array(format!("{company}:{counterparty}").as_bytes());
if self.seen_pairs.insert(pair) {   // insert returns true if it was new
    reputation.counterparties += 1;
}
```

### 4. Score in a view, not in state

Store only the raw counts. Compute the score in a view, so we can change the formula later without migrating any data. Published formula (architecture §14.9):

```
score = 10 × on_time + 5 × late + 3 × counterparties − 20 × disputes_lost     (never below 0)
tier  = number of quests done: human, KYB, first completed deal, referred a company  (0–4)
```

Use `saturating_sub` for the minus so it stops at 0 instead of underflowing.

### 5. Editing a record in a map

`IterableMap::get_mut` gives you a mutable reference, saved automatically:

```rust
let company = self.companies.get_mut(&account).unwrap_or_else(|| env::panic_str("Unknown company"));
company.reputation.completed += 1;
```

## Write

### Changes to `new`

`new(owner, escrow, attester)`: add the `attester` account. (Claude updates the sandbox test's init call.)

### New types

```rust
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum AttestationKind { Human, Kyb, Agreement }

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Outcome { OnTime, Late, DisputeWon, DisputeLost }

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug, Default)]
pub struct Reputation {
    pub on_time: u32,
    pub late: u32,
    pub disputes_won: u32,
    pub disputes_lost: u32,
    pub counterparties: u32,
    pub volume: NearToken,
}
```

### New fields in `Company`

| Field | Type | Set by |
|---|---|---|
| `human` | `bool` | `attest(Human)` |
| `kyb` | `bool` | `attest(Kyb)` |
| `agreement_hash` | `Option<Base58CryptoHash>` | `attest(Agreement)` |
| `referrals` | `u32` | the callback, on the referrer |
| `reputation` | `Reputation` | `record_outcome` |

New companies start with `false` / `None` / `0` / `Reputation::default()`.

### New contract state

| Field | Type | Meaning |
|---|---|---|
| `attester` | `AccountId` | Our backend's account |
| `humans` | `LookupMap<CryptoHash, u32>` | Companies verified per nullifier |
| `seen_pairs` | `LookupSet<CryptoHash>` | Company–counterparty pairs already counted |

Each collection gets its own `StorageKey` variant.

### Methods

| Method | Who | Rules |
|---|---|---|
| `attest(company, kind, hash: Base58CryptoHash)` | attester | "Only the attester can do this". Company must exist ("Unknown company"). **Human:** not already human ("Already verified"); nullifier used < 3 times ("Too many companies for this human"); count +1; `human = true`. **Kyb:** `kyb = true`. **Agreement:** `agreement_hash = Some(hash)`. |
| `record_outcome(company, counterparty, outcome, amount: NearToken)` | escrow | "Only the escrow can do this". Company must exist. Count the outcome. `OnTime`/`Late`: add `amount` to `volume` and count the pair if new. Disputes: just the count. |
| `get_score(account_id) -> u32` | view | The formula above. 0 for unknown companies. |
| `get_tier(account_id) -> u8` | view | Quests done (0–4). 0 for unknown companies. |

### Change to `on_company_created`

On success, if there's a referrer, add 1 to its `referrals`. (`get_mut` returns `None` if the referrer disappeared; then just skip.)

### Good to know

- **The escrow calls `record_outcome` once per side** of a deal: once for the buyer, once for the seller. That's checkpoint 9. Here, only the method.
- **Volume is public.** NEAR transfers are public anyway, so storing the total adds nothing an observer couldn't add up. The UI shows it as a tier (e.g. "1–10k").
- **Freeze lowering the score** (architecture §9) comes at checkpoint 9, when the policy can report to the registry.
- **No sandbox test this time:** nothing here uses Promises, so unit tests cover it all.

## Your unit tests

Update `setup()` for the new `new`. Keep 1–13. Add:

| # | Test | Expect |
|---|---|---|
| 14 | attester attests Human | `human` is true |
| 15 | stranger attests | panics "Only the attester can do this" |
| 16 | attest an unknown company | panics "Unknown company" |
| 17 | Human twice on one company | panics "Already verified" |
| 18 | same nullifier on a 4th company | panics "Too many companies for this human" |
| 19 | Kyb and Agreement | `kyb` true, `agreement_hash` stored |
| 20 | escrow records OnTime | `on_time` 1, volume up, counterparties 1 |
| 21 | two OnTime with the same counterparty | counterparties still 1 |
| 22 | stranger records an outcome | panics "Only the escrow can do this" |
| 23 | score: 2 on time, 1 late, 2 counterparties, 1 lost dispute | 10·2 + 5·1 + 3·2 − 20 = 11 |
| 24 | score never goes below 0 | 1 lost dispute only → 0 |
| 25 | tier: human + KYB + one deal + one referral | 4 |
| 26 | callback with a referrer | referrer's `referrals` is 1 |

## Check

From `contracts/`:

```bash
cargo test -p registry
cargo clippy -p registry --tests -- -D warnings
cargo fmt --check
cd registry && cargo near build non-reproducible-wasm
```

## Verified at the stop

1. `attest` checks the attester; `record_outcome` checks the escrow. Nothing else writes attestations or reputation.
2. The per-human cap is enforced, and a company can't be verified Human twice.
3. Distinct counterparties are counted once per pair.
4. Score and tier are computed in views, with `saturating_sub`.
5. Referrals count only after a company is really created (in the callback).
6. All tests pass; clippy is clean.

Tell me when you're done, or say "write step 1" and Claude will write it.
