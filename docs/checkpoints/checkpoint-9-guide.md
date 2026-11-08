# Checkpoint 9: Wiring the three contracts together

**You write this one** (or ask Claude to write a step). Files: a new `contracts/types/` crate (step 0), `contracts/policy/src/lib.rs` (steps 1–2), `contracts/escrow/src/lib.rs` (step 3), and small switches in all three contracts to use the shared types.

## Goal

Until now each contract worked alone. After this checkpoint:

```
agent ──open_deal──► POLICY ──create_deal (+ NEAR)──► ESCROW ──record_outcome──► REGISTRY
                       │ checks the caps                 │ holds the money          (reputation)
                       └─ over a cap? waits for the guardian, who approves → same path
```

0. **Shared types and interfaces.** One small library crate holds the types two contracts both use, and typed descriptions of the escrow and registry methods others call.
1. **Policy → escrow.** An approved spend becomes a real escrow deal, with the money sent along.
2. **Agent and guardian act on deals through the policy.** The escrow only ever sees the company account.
3. **Escrow → registry.** When a deal ends, the escrow reports how it went for both sides.

## Understand first

### 1. Cross-contract calls run later

You know this from the registry (checkpoint 5): a call to another contract is a Promise, and you learn the result in a callback. The new part: **the callback must undo what you did if the call failed.**

`open_deal` adds the amount to `spent_this_period` *before* the escrow call. If the escrow refuses (say, the deadline already passed), the callback subtracts it again. The NEAR attached to the failed call comes back to the policy account by itself.

**Never panic in a callback** to "undo": a panic undoes the callback's own changes, including your fix. Return a result instead.

### 2. Reading the callback's result

```rust
#[private]
pub fn on_deal_opened(
    &mut self,
    amount: NearToken,
    period_start: u64,
    #[callback_result] result: Result<U64, PromiseError>,  // escrow's create_deal returns the deal id
) -> SpendDecision
```

**Only undo in the same period.** If the period rolled over between the call and the callback, `spent_this_period` already restarted at 0, so there's nothing to subtract. Pass `period_start` to the callback and compare.

### 3. Returning "a Promise or a value"

`open_deal` either starts a Promise (approved) or saves a pending approval (over a cap). `PromiseOrValue<SpendDecision>` covers both:

```rust
PromiseOrValue::Promise(self.start_deal(deal, amount))     // result = the callback's SpendDecision
PromiseOrValue::Value(SpendDecision::NeedsApproval { id }) // result right away
```

### 4. A shared types crate and typed calls

Rust's version of Solidity's shared `interface` files and imported structs:

| Solidity | Here |
|---|---|
| `struct` imported from a shared file | a type in the `types` crate, used by every contract |
| `interface IEscrow { function createDeal(...) }` | `#[ext_contract(ext_escrow)] trait Escrow { fn create_deal(...); }` |

**Why a separate crate:** a contract crate can't be imported into another. Both would export the same entry points and clash. A plain library crate has no entry points, so all three contracts can use it.

```
contracts/types/
├── Cargo.toml     # [package] name = "bizzy-types"; [dependencies] near-sdk = "5.29"
└── src/lib.rs     # Limits, DealRequest, Outcome + ext_escrow, ext_registry
```

Add `"types"` to the workspace `members`, and to each contract: `bizzy-types = { path = "../types" }`.

**Typed call** (the compiler checks the method name and every argument):

```rust
#[ext_contract(ext_escrow)]
pub trait Escrow {
    fn create_deal(&mut self, seller: AccountId, terms_hash: Base58CryptoHash, deliver_by: U64, milestones: Vec<NearToken>) -> U64;
}

// in the policy:
ext_escrow::ext(self.escrow.clone())
    .with_attached_deposit(amount)
    .with_static_gas(GAS_FOR_ESCROW)
    .create_deal(deal.seller, deal.terms_hash, deal.deliver_by, deal.milestones)
```

`Outcome` moves here from the registry, so the escrow sends `Outcome::OnTime`, not the string `"OnTime"`. `Limits` moves here from the policy, so the registry's `create_company` takes a real `Limits`, not untyped JSON.

**Nothing on chain changes:** moving a type to another crate keeps its stored bytes and its JSON exactly the same.

### 5. One struct for the deal

The agent describes the deal once:

```rust
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct DealRequest {
    pub seller: AccountId,
    pub terms_hash: Base58CryptoHash,
    pub deliver_by: U64,
    pub milestones: Vec<NearToken>,
}
```

It lives in the `types` crate. The amount is the sum of the milestones. `PendingApproval` stores the whole `DealRequest`, so `approve` can open the exact deal later.

### 6. One forwarding method for every other deal action

The agent and guardian also need to accept, deliver, confirm, cancel, dispute and split. Instead of six methods, one forwards to the escrow, with an allowed list per role:

```rust
const AGENT_DEAL_METHODS: [&str; 4] = ["accept_deal", "mark_delivered", "confirm", "cancel"];
const GUARDIAN_DEAL_METHODS: [&str; 6] = ["accept_deal", "mark_delivered", "confirm", "cancel", "dispute", "propose_split"];
```

**Disputes and splits are guardian-only.** An agent can't start a fight or give money away in a settlement.

This one stays **untyped** (`method: String, args: Value`): it forwards six different methods, and a typed version would need six policy methods. The allowed lists keep it safe; a wrong argument just makes the escrow call fail, with nothing to undo.

The agent's key now allows `"open_deal,deal_action"` (it no longer has `request_spend`).

### 7. Freeze cancels open deals, with no new contract code

The guardian's wallet can send **one transaction with several calls** to the policy account. The freeze button sends:

```
[ freeze(),  deal_action("cancel", {id: 4}),  deal_action("cancel", {id: 7}), ... ]
```

One click, one signature. The app finds the open deal ids from the escrow. `cancel` only works on deals the seller hasn't accepted yet. Accepted ones continue; the guardian can dispute them. That's fair to the seller, who may already be working.

### 8. Escrow → registry: fire and forget

When a deal ends, the escrow calls `ext_registry::ext(registry).record_outcome(...)` twice, once per side, and `.detach()`es both. **No callback:** if the registry call fails, the money is already where it belongs, and only one reputation update is lost. The registry is the escrow's `registry` account (the parent of all companies).

| Deal ends as | Seller | Buyer |
|---|---|---|
| `Released`, last milestone delivered by `deliver_by` | `OnTime` | `OnTime` |
| `Released`, delivered after `deliver_by` | `Late` | `OnTime` |
| `Split`, seller got at least half of what was left | `DisputeWon` | `DisputeLost` |
| `Split`, seller got less than half | `DisputeLost` | `DisputeWon` |
| `Refunded` by `refund_on_timeout` | `DisputeLost` | `DisputeWon` |
| `Refunded` by `cancel` or `refund_expired` | nothing | nothing |

"Delivered" time: in `release_next`, before overwriting `updated_at`, it still holds when the last milestone was delivered.

## Write

### Step 0: the shared `types` crate

| Item | Where it comes from |
|---|---|
| `Limits` | moved from the policy |
| `Outcome` | moved from the registry |
| `DealRequest` | new (above) |
| `ext_escrow` with `create_deal` | new: same arguments as the escrow's method |
| `ext_registry` with `record_outcome` | new: same arguments as the registry's method |

Then:
- the policy and registry `use bizzy_types::{...}` instead of defining their own;
- the registry's `create_company` takes `limits: Limits` (update test 10's helper to pass a real `Limits`).

All existing tests must still pass: nothing behaves differently yet.

### Step 1: policy opens real deals

| Item | Change |
|---|---|
| `PendingApproval` | `{ deal: DealRequest, amount: NearToken, created_at: U64 }` |
| `SpendDecision` | `Opened { deal_id: U64 }`, `NeedsApproval { id: U64 }`, `Failed` |
| `request_spend` | Becomes `open_deal(deal: DealRequest) -> PromiseOrValue<SpendDecision>`. Same checks; the amount is the milestones' sum. All pass → `start_deal`. |
| `approve(id) -> Promise` | Remove the approval, then `start_deal` (no cap checks: the guardian decided) |
| `start_deal(deal, amount) -> Promise` (helper) | "Not enough balance" if `amount > available_balance()`. Add to `spent_this_period`. `ext_escrow::...create_deal(...)` with `amount` attached, then `.then(on_deal_opened(amount, period_start))` |
| `on_deal_opened` | `#[private]`. `Ok(id)` → `Opened { deal_id: id }`. `Err` → subtract `amount` if the period is unchanged; return `Failed` |

```rust
const GAS_FOR_ESCROW: Gas = Gas::from_tgas(20);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);
```

### Step 2: policy forwards deal actions

| Item | Change |
|---|---|
| `deal_action(method: String, args: serde_json::Value) -> Promise` | Agent (and `Active`) with a method in `AGENT_DEAL_METHODS`, **or** guardian with 1 yocto and a method in `GUARDIAN_DEAL_METHODS`. Else "Not allowed". Forwards to the escrow with 0 attached. |
| `AGENT_METHODS` | `"open_deal,deal_action"` |

Tip: check "is the agent?" without panicking: `env::predecessor_account_id() == env::current_account_id()`. Then the guardian branch: `assert_one_yocto()`.

### Step 3: escrow reports outcomes

| Item | Change |
|---|---|
| `report(registry, deal, seller: Outcome, buyer: Outcome)` (helper) | Two detached `ext_registry::...record_outcome(...)` calls, `amount = deal.amount`, ~10 TGas each |
| `release_next` | When the last milestone is paid: `OnTime`/`Late` for the seller, `OnTime` for the buyer |
| `propose_split` | On settling: the split row of the table |
| `refund_on_timeout` | Seller `DisputeLost`, buyer `DisputeWon` |

`deal_mut` borrows `self`, so read `self.registry.clone()` **before** calling it.

## Your unit tests

Unit tests can't run Promises, so they check the decisions and the state. Update the policy test helper: `agent_spends` now calls `open_deal` with a one-milestone `DealRequest`, and "approved" means `PromiseOrValue::Promise(_)`. Keep every existing test passing. Add:

| # | Test | Expect |
|---|---|---|
| P36 | `open_deal` within caps | returns a Promise; spent goes up |
| P37 | `open_deal` with more than the balance | panics "Not enough balance" |
| P38 | callback `Ok(5)` | `Opened { deal_id: 5 }`; spent unchanged |
| P39 | callback `Err` | `Failed`; spent goes back down |
| P40 | callback `Err` after the period rolled | `Failed`; new period's spent untouched |
| P41 | guardian approves | approval gone; spent goes up (Promise returned) |
| P42 | agent `deal_action("confirm")` | returns a Promise |
| P43 | agent `deal_action("dispute")` | panics "Not allowed" |
| P44 | guardian `deal_action("dispute")` with 1 yocto | returns a Promise |
| P45 | stranger `deal_action("confirm")` | panics "Not allowed" |

(P = policy test numbers.) Escrow: keep all 32 passing; the reporting is checked in the sandbox.

## Claude's sandbox test

`contracts/policy/tests/full_path.rs` deploys all three contracts and runs the real path:
1. The registry creates `buyer` and `seller` companies; guardians give each agent a key.
2. The buyer's agent `open_deal`s 2 NEAR → the escrow holds 2 NEAR, and the deal's buyer is the buyer company.
3. The seller's agent accepts and delivers; the buyer's agent confirms → the seller company gets 2 NEAR, and the registry shows `on_time: 1` for both.
4. An over-cap deal waits; the guardian approves → the escrow deal opens.
5. A deal with a past deadline → the escrow refuses → the callback returns `Failed`, and the spent total and balance are back where they were.
6. The buyer's agent tries `deal_action("dispute")` → refused.

## Check

From `contracts/`:

```bash
cargo test                                  # all three contracts
cargo clippy --tests -- -D warnings
cargo fmt --check
```

## Verified at the stop

For each cross-contract call, **what happens if it fails?**

0. Shared types live only in `types`; no contract defines its own copy. Policy → escrow and escrow → registry calls are typed (`ext_escrow`, `ext_registry`).
1. `create_deal` fails → NEAR returns to the policy account, and the callback undoes the spent amount (same period only). Nothing panics in the callback.
2. `deal_action` fails → nothing changed in the policy, so nothing to undo.
3. `record_outcome` fails → the money is already final; only that reputation update is lost.
4. The agent can't dispute, split, change limits, approve or withdraw. The key allows only `open_deal,deal_action`.
5. Freeze plus cancels go in one guardian transaction.
6. All tests pass, including the sandbox test; clippy is clean.

Tell me when you're done, or say "write step 1" and Claude will write it.
