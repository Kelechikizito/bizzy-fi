# Checkpoint 9b: Privacy and cost fixes

**You write this one** (or ask Claude to write a step). Files: `contracts/policy/src/lib.rs` (step 1) and `contracts/registry/src/lib.rs` (step 2).

## Goal

Two gaps found after checkpoint 8:

1. **The allowlist can be read.** It stores `hash(name)`. The registry lists every company name, so anyone can hash each name and match.
2. **Companies are expensive.** Each company stores its own 201 KB copy of the policy code, which locks about 2 NEAR.

## Understand first

### 1. A salt per allowlist entry

A **salt** is a random value mixed in before hashing: `hash(salt + name)`. Without the salt, you can't recompute the hash, so matching names stops working.

**Why one salt per entry, not one per company:** the agent has to send the salt when it pays that partner (the contract must recompute the hash to check it). A transaction is public. If one salt covered the whole list, the first payment would leak it, and then every entry could be matched. With a salt per entry, a payment reveals only that one partner, and the deal already shows who's paying whom anyway.

The app does the bookkeeping off-chain:
1. Guardian adds beta → the app makes a random 32-byte salt, keeps it, and sends `allow_counterparty(sha256(salt + "beta.bizzy-fy.testnet"))`.
2. The agent pays beta → it sends that salt with `open_deal`.

So `allow_counterparty`, `remove_counterparty` and `is_allowed` **don't change**: they already take a hash. Only the check in `open_deal` changes.

```rust
fn hash_account(salt: &CryptoHash, account: &AccountId) -> CryptoHash {
    env::sha256_array([salt.as_slice(), account.as_bytes()].concat())
}
```

The salt travels as `Option<Base58CryptoHash>` (a 32-byte value, the same JSON form as other hashes). It's `None` when `allowlist_only` is off; JSON callers can just leave it out.

### 2. Global contracts: one copy for everyone

NEAR lets you upload code **once** as a *global contract*. Accounts then **point to it** instead of storing it. We measured it in the sandbox:

| | Own copy (today) | Shared global copy |
|---|---|---|
| Storage per company | 201,496 bytes ≈ **2.01 NEAR locked** | **32 bytes** ≈ 0.0003 NEAR |
| One-time cost | none | ≈ **20.15 NEAR, burned** (10× the normal price, never refunded) |

From about the 10th company on, the shared copy is cheaper, and every new user pays about 2 NEAR less. For one-click onboarding, that matters more.

**By hash, never by account.** A global contract can be shared two ways:
- **By hash:** the code is fixed forever. ✅ We use this.
- **By account:** the owner can change the code later, and every company using it changes too. ❌ That would let whoever runs the registry rewrite the code that holds every company's money. It breaks the custody promise.

Companies created later can use a newer hash. Existing ones keep the code they started with.

### 3. Who uploads the code

The owner uploads it once, outside the contract, from any account (near-cli `deploy-global` "as hash", or the `near-api` call in Claude's test). Then they tell the registry which hash to use:

```rust
pub fn set_policy_hash(&mut self, hash: Base58CryptoHash)   // owner only
```

That replaces `set_policy_code` and the 201 KB `LazyOption`. The registry no longer stores the code at all, so it no longer locks 2 NEAR either.

In `create_company`, the batch changes one line:

```rust
.deploy_contract(code)            // before
.use_global_contract(hash)        // after
```

If the hash was never uploaded, the batch fails and the callback refunds, as with any failed creation.

## Write

### Step 1: salted allowlist (policy)

| Item | Change |
|---|---|
| `open_deal(deal, salt: Option<Base58CryptoHash>)` | New argument |
| Check 2 | `!allowlist_only` **or** (a salt was given **and** `hash_account(&salt, &deal.seller)` is in the allowlist). No salt with `allowlist_only` → "Counterparty is not allowed" |
| `hash_account` | Takes the salt (above) |

### Step 2: shared policy code (registry)

| Item | Change |
|---|---|
| `policy_code: LazyOption<Vec<u8>>` | Becomes `policy_hash: Option<CryptoHash>` (plain field) |
| `set_policy_code()` | Becomes `set_policy_hash(hash)`, owner only |
| `create_company` | "No policy code yet" if no hash; `.use_global_contract(hash)` |
| `MIN_DEPOSIT` | 3 NEAR → **0.5 NEAR** (state + the agent's gas; the rest the guardian adds when needed) |
| `StorageKey::PolicyCode` | Remove |

**No migration needed:** the registry isn't deployed yet (that's checkpoint 11), so its stored layout can still change.

### Good to know

- **The uploader pays the 20 NEAR.** On testnet that's faucet NEAR. On mainnet it's a real one-time cost, worth it once there are more than about 10 companies.
- **Anyone can check the code** a company runs: its account points to the hash, and the hash is of the published wasm.
- **The salts live in our backend**, alongside the encrypted terms. If they're lost, the guardian re-adds partners (new salts). Nothing on chain breaks.

## Your unit tests

Policy: update the `seller_hash()` helper to use a salt, and pass `None` / `Some(salt)` to `open_deal`. Keep everything passing. Add:

| # | Test | Expect |
|---|---|---|
| 45 | `allowlist_only`, right salt | `Opened` |
| 46 | `allowlist_only`, wrong salt | panics "Counterparty is not allowed" |
| 47 | `allowlist_only`, no salt | panics "Counterparty is not allowed" |

Registry: tests 2–3 become `set_policy_hash` (owner yes, stranger no). Test 4 is unchanged ("No policy code yet"). Test 5 changes to 0.4 NEAR, with the message "Attach at least 0.5 NEAR".

## Claude's sandbox tests

- `create_company.rs` and `full_path.rs`: upload the policy as a global contract (by hash), call `set_policy_hash`, then check that a new company really runs the policy and stores only a few hundred bytes (`storage_usage`), and that creation works with 0.5 NEAR.
- `full_path.rs`: a buyer with `allowlist_only` pays an allowlisted seller with the right salt; the wrong salt is refused.

## Check

From `contracts/`:

```bash
cargo test
cargo clippy --tests -- -D warnings
cargo fmt --check
```

## Verified at the stop

1. No allowlist entry can be matched from public data alone. A payment reveals only the partner being paid.
2. Companies use the policy **by hash**: fixed code, nobody can change it.
3. The registry stores a 32-byte hash, not 201 KB of code.
4. A company account's storage is a few hundred bytes, and 0.5 NEAR is enough to create one.
5. All tests pass; clippy is clean.

Tell me when you're done, or say "write step 1" and Claude will write it.
