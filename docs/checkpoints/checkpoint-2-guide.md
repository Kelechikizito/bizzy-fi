# Checkpoint 2: Policy, part 1: state, guardian, withdraw

**You write this one.** File: `contracts/policy/src/lib.rs`.

## Goal

The policy contract lives on each company's account (e.g. `acme.bizzyfy.testnet`) and holds the company's money. In this checkpoint it learns:
- **who the guardian is** (the accountable human);
- **the spending rules** (caps);
- **that only the guardian** can change the rules or take money out.

Spending checks come at checkpoint 3, and the agent key and freeze at checkpoint 4. Keep this one small and solid.

## Before you start

1. Keep a copy of the auction sample if you want it for reference (e.g. `cp policy/src/lib.rs ~/auction-sample.rs`), then clear `policy/src/lib.rs`.
2. **Delete `policy/tests/test_basics.rs`.** It's a sandbox test for the auction and will fail once the auction is gone. Claude adds real sandbox tests for the policy contract at checkpoint 4.

## Understand first

### 1. Who is calling?

| Solidity | NEAR | Use it for access checks? |
|---|---|---|
| `msg.sender` | `env::predecessor_account_id()` | ✅ yes |
| `tx.origin` | `env::signer_account_id()` | ❌ never |
| `address(this)` | `env::current_account_id()` | (the contract's own account) |

### 2. Money

- NEAR amounts use the type **`NearToken`**. 1 NEAR = 10²⁴ yoctoNEAR (like 1 ETH = 10¹⁸ wei).
- Make them with `NearToken::from_near(5)` or `NearToken::from_yoctonear(1)`.
- Do math with `checked_sub`, `saturating_sub` or `saturating_mul`. Plain `-` works too but panics with an unclear message on underflow.
- In JSON (from apps), `NearToken` is written as a **string** of yoctoNEAR, e.g. `"1000000000000000000000000"` for 1 NEAR. That's because JavaScript can't hold numbers this big.

### 3. Part of the balance is locked for storage

A NEAR contract must keep some NEAR to pay for the bytes it stores (**storage staking**, about 1 NEAR per 100 KB). If `withdraw` sends out too much, the call fails. So the amount the guardian can withdraw is:

```
available = env::account_balance() − env::storage_byte_cost() × env::storage_usage()
```

- `storage_usage()` is the number of bytes the contract uses.
- `storage_byte_cost()` is the price per byte.

### 4. Proving the guardian really signed: one yoctoNEAR

The guardian will use a wallet. Wallets often add a **limited key** (a "function-call key") for an app, so the app can call methods without a popup each time. A limited key **can't attach any NEAR**. So if a method requires exactly **1 yoctoNEAR** attached, only the guardian's full wallet key can call it, and the wallet always asks for confirmation.

- Use `near_sdk::assert_one_yocto()` at the top of every guardian method that **changes something**.
- Mark those methods `#[payable]`, otherwise they reject any attached NEAR.

### 5. Who may call `init`?

Later (checkpoint 5), the **registry** (`bizzyfy.testnet`) creates `acme.bizzyfy.testnet`, puts this contract on it, and calls `init`, all in one transaction. So inside `init`:
- `env::predecessor_account_id()` is the registry;
- `env::current_account_id()` is `acme.bizzyfy.testnet`.

**Rule to enforce:** only the **parent account** may call init. `acme.bizzyfy.testnet` must end with `.` + the caller's account ID. This stops a stranger setting themselves as guardian, and it means you don't need a `registry` argument: the caller *is* the registry.

`#[derive(PanicOnDefault)]` plus `#[init]` already stop init running twice.

### 6. Enums and structs that are stored and returned

Anything stored in state **and** returned to apps needs both formats:

```rust
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status { Active, Suspended }
```

`borsh` is the compact binary format used for storage. `json` is for apps. `PartialEq` lets you compare with `==`, and `Debug` lets tests print it.

## Write

### State

| Field | Type | Meaning |
|---|---|---|
| `guardian` | `AccountId` | The accountable human |
| `registry` | `AccountId` | The parent that created this company (set from the caller in `init`) |
| `escrow` | `AccountId` | The escrow contract this company deals through |
| `limits` | `Limits` (your struct) | `per_deal_cap: NearToken`, `period_cap: NearToken`, `period_length_ns: u64` |
| `status` | `Status` | `Active` or `Suspended` (more states at checkpoint 4) |

### Methods

| Method | Who | Rules |
|---|---|---|
| `#[init] new(guardian, escrow, limits)` | the parent account only | Check the parent rule (§5) and the limits rule below. Status starts `Active`. |
| `set_limits(limits)` | guardian, 1 yocto | Check the limits rule. |
| `withdraw(amount: NearToken, to: AccountId) -> Promise` | guardian, 1 yocto | `amount` > 0 and ≤ `available`. Send with `Promise::new(to).transfer(amount)`. |
| `get_limits() -> Limits` | anyone (view) | |
| `get_status() -> Status` | anyone (view) | |
| `get_guardian() -> AccountId` | anyone (view) | |
| `get_available_balance() -> NearToken` | anyone (view) | The formula in §3. |

**Limits rule:** `per_deal_cap` > 0, `per_deal_cap` ≤ `period_cap`, `period_length_ns` > 0.

### Helpers (not public methods)

Put helpers in a separate `impl Contract { ... }` block **without** `#[near]`. Methods inside a `#[near]` block become public contract methods; helpers must not.
- `assert_guardian(&self)`: `require!` the caller is the guardian.
- `assert_valid_limits(limits: &Limits)`.
- `available_balance(&self) -> NearToken`.

### Good to know

- **If `to` doesn't exist,** the transfer fails and NEAR automatically returns the money to the contract. Nothing is lost, but `withdraw` will look successful from the outside. That's acceptable here; checkpoint 9 covers handling call results properly.
- **A timelock on `set_limits`** (rule changes waiting before they apply) comes later. Keep it immediate for now.
- **Doc comments:** one line each (`/// Sends NEAR to the guardian's chosen account.`).

## Your unit tests

Write them in `#[cfg(test)] mod tests` at the bottom. Reuse the `get_context` idea from the auction sample, but set:
- `.current_account_id("acme.bizzyfy.testnet")`
- `.predecessor_account_id(...)` (whoever is calling)
- `.attached_deposit(NearToken::from_yoctonear(1))` for guardian methods
- `.account_balance(NearToken::from_near(10))` so there's money to withdraw

Use `#[should_panic(expected = "...")]` for the failure cases (like `vm.expectRevert`).

| # | Test | Expect |
|---|---|---|
| 1 | `new` called by `bizzyfy.testnet` | works; views return what you passed; status `Active` |
| 2 | `new` called by `stranger.testnet` | panics (not the parent) |
| 3 | `new` with `per_deal_cap` > `period_cap` | panics |
| 4 | guardian `set_limits` with 1 yocto | limits updated |
| 5 | stranger `set_limits` | panics |
| 6 | guardian `set_limits` **without** 1 yocto | panics |
| 7 | guardian `withdraw` 2 NEAR (balance 10) | works |
| 8 | guardian `withdraw` more than available | panics |
| 9 | guardian `withdraw` 0 | panics |
| 10 | stranger `withdraw` | panics |
| 11 | `get_available_balance` | less than `account_balance` (storage is locked) |

## Check

From `contracts/`:

```bash
cargo test -p policy                 # all 11 tests pass
cargo clippy -p policy -- -D warnings
cargo fmt --check
cd policy && cargo near build non-reproducible-wasm
```

## Verified at the stop

Claude reviews your code for:
1. Every method that changes state checks the guardian **and** 1 yocto first, before anything else.
2. `init` can only be called by the parent account.
3. `withdraw` can never send more than the available balance, and never 0.
4. Helpers are outside the `#[near]` block, so they aren't public methods.
5. All 11 tests pass, clippy is clean, and doc comments are one line.

Tell me when you're done, or paste an error if you get stuck.
