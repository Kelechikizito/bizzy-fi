# Checkpoint 5: Registry, part 1: create a company

**You write this one** (or ask Claude to write a step). File: `contracts/registry/src/lib.rs`. It still holds the auction template: replace all of it.

## Goal

One call, `create_company("acme", ...)`, with NEAR attached:

1. creates the account `acme.bizzyfy.testnet`,
2. moves the deposit into it (the company's starting treasury),
3. deploys the policy contract on it,
4. calls the policy's `new` with the caller as guardian.

The company account gets **no full-access key** (CLAUDE.md, custody model): the policy contract is the only thing that can ever move its funds.

When it works, a **callback** saves the company record. When it fails, the callback **refunds** the deposit.

## Understand first

### 1. Sub-accounts

Only `bizzyfy.testnet` can create `<name>.bizzyfy.testnet`, so the registry contract must live on `bizzyfy.testnet`. The policy's `new` already checks that its caller is the parent account (checkpoint 2), so only the registry can set up a company.

### 2. Storage costs NEAR

Every byte on chain locks 0.00001 NEAR (1 NEAR per 100 KB). The policy wasm is ~170 KB, so:
- the registry storing the code locks ~1.7 NEAR once;
- **each company** account holding the code locks ~1.7 NEAR.

So the caller must attach at least `MIN_DEPOSIT = 3 NEAR`: ~1.7 for the code, the rest is the company's starting treasury.

### 3. One batch Promise, all or nothing

```rust
Promise::new(company.clone())
    .create_account()
    .transfer(deposit)
    .deploy_contract(code)
    .function_call("new".into(), args, NearToken::from_yoctonear(0), GAS_FOR_INIT)
```

All four actions run in **one receipt**. If any of them fails (name taken, not enough NEAR for storage, `new` panics), **all of them are undone**, and the deposit stays in the registry. No half-made accounts.

Note what's missing: `.add_full_access_key(...)`. That's the custody model.

### 4. Callbacks (no Solidity equivalent)

A NEAR cross-contract call is **asynchronous**: `create_company` returns before the account exists. To learn how it went, chain a callback on yourself with `.then(...)`:

```rust
.then(
    Self::ext(env::current_account_id())
        .with_static_gas(GAS_FOR_CALLBACK)
        .on_company_created(name, env::predecessor_account_id(), about, referrer, deposit),
)
```

```rust
#[private]   // only the contract itself may call this
pub fn on_company_created(&mut self, name: String, guardian: AccountId, ...) -> bool {
    if near_sdk::is_promise_success() {
        // save the record
    } else {
        // refund: Promise::new(guardian).transfer(deposit).detach();
    }
}
```

**Save the record only in the callback**, never in `create_company`. If you saved it first and creation failed, the directory would list a company that doesn't exist.

### 5. Big input: read the raw bytes

`set_policy_code` takes the ~170 KB wasm. As JSON it would need base64 (bigger, costs more gas to decode). Read the raw input instead:

```rust
pub fn set_policy_code(&mut self) {
    // owner check
    self.policy_code.set(Some(env::input().expect("No code")));
}
```

Store it in a `LazyOption<Vec<u8>>` (`near_sdk::store`) so the 170 KB is loaded only by `create_company`, not on every call. It needs a prefix, like the collections in checkpoint 3. From near-cli you send it with `file-args policy.wasm`.

### 6. Limits are passed through

The registry can't import the policy's `Limits` type (both crates are contracts; linking one into the other would clash). So `create_company` takes `limits: serde_json::Value` and puts it into `new`'s arguments unchanged. If the limits are bad, the policy's `new` panics, the batch is undone and the callback refunds.

### 7. Testing callbacks

A unit test can call `on_company_created` directly. Give it the result you want to fake as the 5th argument of `testing_env!`:

```rust
use near_sdk::{PromiseResult, test_vm_config, RuntimeFeesConfig};

testing_env!(
    context.build(),
    test_vm_config(),
    RuntimeFeesConfig::test(),
    Default::default(),
    vec![PromiseResult::Failed],   // or PromiseResult::Successful(vec![])
);
```

## Write

### State

| Field | Type | Meaning |
|---|---|---|
| `owner` | `AccountId` | May upload the policy code |
| `escrow` | `AccountId` | Passed to every new policy |
| `policy_code` | `LazyOption<Vec<u8>>` | The policy wasm |
| `companies` | `IterableMap<AccountId, Company>` | The directory |

```rust
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct Company {
    pub guardian: AccountId,
    pub about: String,                 // public one-liner, max 280 chars (fits an X post)
    pub referrer: Option<AccountId>,
    pub created_at: U64,
}
```

### Methods

| Method | Who | Rules |
|---|---|---|
| `new(owner, escrow)` | init | |
| `set_policy_code()` | owner | Raw input = the wasm. "Only the owner can do this" |
| `create_company(name, about, referrer: Option<AccountId>, limits: Value) -> Promise` | anyone, payable | Checks below, then the batch + callback |
| `on_company_created(...) -> bool` | `#[private]` | Success: save the record, return true. Failure: refund the guardian, return false |
| `get_company(account_id) -> Option<Company>` | view | |
| `get_companies(from_index: u32, limit: u32) -> Vec<(AccountId, Company)>` | view | Paged, like `get_pending_approvals` |

**Checks in `create_company`** (in this order, with these messages):
- "No policy code yet": `policy_code` is set
- "Attach at least 3 NEAR": deposit ≥ `MIN_DEPOSIT`
- "Invalid name": 2–32 chars, only `a-z`, `0-9`, `-`. No dots, so nobody can make `x.acme.bizzyfy.testnet`
- "Name taken": not already in `companies`
- "About is too long": `about.len() <= 280`
- "Unknown referrer": if given, it must be in `companies`

Build the account ID with `format!("{name}.{}", env::current_account_id()).parse().unwrap()`. The name check guarantees it parses.

### Gas

```rust
const GAS_FOR_INIT: Gas = Gas::from_tgas(30);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(15);
```

Callers attach ~100 TGas to `create_company`.

### Good to know

- **Two people racing for the same name:** both pass "Name taken" (the record isn't saved yet). The second `create_account` fails, so the second person is refunded. No extra code needed.
- **Names that already exist** (like `escrow`) fail the same way and are refunded.
- **Referral rewards** (quests, tiers) come at checkpoint 6. Now we only record who referred whom.
- **The policy code can't be changed** on an existing company: it has no full-access key. A new `set_policy_code` only affects new companies. That's a feature: nobody, including us, can swap the code holding a company's money.

## Your unit tests

Delete the auction tests. Add:

| # | Test | Expect |
|---|---|---|
| 1 | `new` | owner and escrow stored, no companies |
| 2 | owner uploads code | `policy_code` is set |
| 3 | stranger uploads code | panics "Only the owner can do this" |
| 4 | create before code is uploaded | panics "No policy code yet" |
| 5 | deposit under 3 NEAR | panics "Attach at least 3 NEAR" |
| 6 | bad names: `"a"`, `"Acme"`, `"ac.me"`, `"ac_me"`, 33 chars | each panics "Invalid name" (one test per name, or a loop with `std::panic::catch_unwind`; one test per name is simpler) |
| 7 | name already in `companies` | panics "Name taken" |
| 8 | `about` of 281 chars | panics "About is too long" |
| 9 | referrer that isn't a company | panics "Unknown referrer" |
| 10 | valid call | returns without panicking (the Promise can't run in unit tests) |
| 11 | callback with `Successful` | returns true; `get_company` has the record |
| 12 | callback with `Failed` | returns false; no record |
| 13 | `get_companies` paging | right slice |

Tip for tests 7, 9, 13: insert into `contract.companies` directly to fake existing companies.

## Claude's sandbox test

Claude replaces `contracts/registry/tests/test_basics.rs` with `create_company.rs`. On a local node it:
1. Deploys the registry, uploads the real policy wasm.
2. `create_company("acme")` with 3 NEAR: `acme.<registry>` exists, its `get_guardian` is the caller, it has **no access keys**, and `get_company` has the record.
3. `create_company("acme")` again from someone else: their balance comes back (minus gas), and the record still shows the first guardian.

## Check

From `contracts/`:

```bash
cargo test -p registry
cargo clippy -p registry --tests -- -D warnings
cargo fmt --check
cd registry && cargo near build non-reproducible-wasm
```

## Verified at the stop

1. The record is saved **only** in the callback, and only on success.
2. A failed creation refunds the full deposit to the caller.
3. The callback is `#[private]`.
4. The batch has no `add_full_access_key`.
5. Name rules block dots, so no nested sub-accounts.
6. `set_policy_code` is owner-only and the code is a `LazyOption`.
7. All tests pass, including the sandbox test; clippy is clean.

Tell me when you're done, or say "write step 1" and Claude will write it.
