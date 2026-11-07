# Bizzy-Fy: Security & Testing Plan

How we keep the contracts safe while building them. Each practice you know from EVM, mapped to its Rust/NEAR version, and **when** in the build plan it happens.

---

## 1. Safe-coding patterns for NEAR

The biggest difference from Solidity: **a call to another contract doesn't happen in the same step.** It runs in a later block, and your contract learns the result in a callback. Most NEAR bugs come from forgetting this.

| Pattern | What to do | Solidity equivalent |
|---|---|---|
| **Callbacks are `#[private]`** | Only the contract itself may call its callbacks. Without `#[private]`, anyone can call `on_deal_created` and fake a result. | `onlySelf` |
| **Handle every callback result** | Use `#[callback_result] r: Result<T, PromiseError>` and roll back state on `Err`. Never assume the other call worked. | checking `success` of a low-level call |
| **Lock or mark state before a cross-contract call** | Set e.g. `status = Pending` before calling out, then finish or undo it in the callback. Stops two calls using the same funds while the first is in flight. | checks-effects-interactions + reentrancy guard |
| **Money moves once** | Every path (release, refund, cancel, dispute) checks and changes `status` first, so funds can never be paid twice. | same |
| **Use `require!` with clear messages** | Avoid `unwrap()` and `expect()` on user input. Use `require!` or return errors. | `require(cond, "msg")` |
| **Overflow checks on** | `overflow-checks = true` is already set in `contracts/Cargo.toml`. Use `checked_add`/`saturating_sub` for money math anyway, so the error message is clear. | Solidity ≥0.8 default |
| **Big numbers as strings in JSON** | Use `U128`/`U64` from `near_sdk::json_types` in method arguments and returns. JavaScript can't hold numbers this big. | (no equivalent) |
| **Guardian methods need 1 yoctoNEAR** | Add `assert_one_yocto()` to `withdraw`, `set_policy`, `set_agent_key`, `freeze`. Function-call keys **can't attach NEAR**, so this proves the guardian signed with their wallet's full-access key, not a limited app key. | (NEAR-specific) |
| **Storage costs NEAR** | Every byte stored needs NEAR held by the contract (about 1 NEAR per 100 KB). Make callers pay for what they add (`env::storage_usage()` before and after), or anyone can drain the contract by spamming storage. | gas griefing / unbounded storage |
| **Unique prefixes for collections** | Each `LookupMap`/`IterableMap` gets its own prefix. Use an enum (`StorageKey`) so they can't collide. | separate mappings |
| **Watch gas on cross-contract calls** | Give callbacks enough gas (about 10–30 TGas) and keep loops bounded. A transaction can use 300 TGas at most. | block gas limit |
| **Time is in nanoseconds** | `env::block_timestamp()` is nanoseconds, not seconds. Easy off-by-10⁹ bug. | `block.timestamp` (seconds) |
| **Check who's calling, not who signed** | Use `env::predecessor_account_id()`, never `signer_account_id()`, for access checks. | `msg.sender`, not `tx.origin` |

The `near-contract-audit` skill lists the known NEAR bug types by severity. Claude uses it when reviewing your code.

## 2. Manual review (every checkpoint)

At each "Verified at the stop", Claude reviews your code against:
1. **Access:** who can call each method, and is that checked first?
2. **Money:** can funds leave twice, get stuck, or go to the wrong account?
3. **Callbacks:** `#[private]`? Every `Err` handled? State undone on failure?
4. **Storage:** who pays for new data?
5. **Edge cases:** zero amounts, the same account on both sides, expired deadlines, a frozen agent.

You do the same pass on your own first. It's a good habit, and it's how you get faster.

## 3. Testing layers

| Layer | Tool | What it catches | When |
|---|---|---|---|
| **Unit tests** | `cargo test` + `testing_env!` | Logic in one method: checks, math, status changes | You, every checkpoint |
| **Fuzz / property tests** | `proptest` crate | Random inputs breaking a rule that must always hold (e.g. "escrow balance = sum of open deals") | You write the rule; Claude helps with the setup. From checkpoint 3 (spending caps) |
| **Stateful fuzz (invariants)** | `proptest` with random sequences of calls | A run of create/accept/release/refund/dispute calls in random order never pays out twice or loses funds | Checkpoints 8 and 17 (escrow, netting) |
| **Integration tests** | `near-sandbox` + `near-api` (real local NEAR node) | Calls between contracts, keys, sub-accounts, callbacks, gas | Claude, at checkpoints 4, 5, 7, 9, 16, 17; full path at 10 |
| **Mutation testing** | `cargo-mutants` | Tests that pass even when the code is broken: it changes your code and checks a test fails | After checkpoint 9 and 17 |
| **Coverage** | `cargo-llvm-cov` | Code no test ever runs | With mutation testing |
| **Staging (testnet)** | Separate staging accounts (`staging-bizzyfy.testnet`) + smoke script | Real network behavior: real gas, real wallets, real timing | Checkpoint 11, and before every demo-account deploy |
| **Fork testing** | Not needed for now | We don't depend on existing on-chain contracts in the must-have path. If we add SputnikDAO or Trezu, test against their real testnet contracts | Only if we add those integrations |

**About fuzzing:** Foundry's fuzzer is built in. In Rust, `proptest` gives the same thing inside normal `cargo test`. (`cargo-fuzz` exists too, but it needs the nightly compiler and works on raw bytes; it's overkill for us.)

## 4. Static analysis

| Tool | What it does | When |
|---|---|---|
| `cargo clippy -- -D warnings` | Rust's linter; treats warnings as errors | Every checkpoint |
| `cargo clippy -- -W clippy::pedantic` | Stricter extra checks (read the advice, don't follow it blindly) | Checkpoint 18 |
| `cargo audit` | Checks our dependencies against the RustSec database of known vulnerabilities | Checkpoint 18, and after adding any dependency |
| `cargo fmt --check` | Consistent formatting | Every checkpoint |
| Rustle (BlockSec's NEAR analyzer) | NEAR-specific bug detection | Optional at checkpoint 18. It hasn't been updated in a while and may not work with our toolchain, so try it but don't depend on it |
| `near-contract-audit` skill | Full NEAR security review with findings by severity | Checkpoint 18 |

## 5. Rules that must always hold (invariants)

Each of these gets a property or sandbox test:

1. **Escrow:** the contract's balance ≥ the sum of all unsettled deal amounts + netting deposits.
2. **Escrow:** each deal's money is paid out at most once, to the buyer or seller (or split), never both in full.
3. **Escrow:** milestone amounts add up exactly to the deal amount.
4. **Policy:** the agent can never spend more than the per-deal cap, or more than the period cap within one period, without a guardian approval.
5. **Policy:** after `freeze`, the agent's key no longer exists and every agent method fails.
6. **Policy:** only the guardian can move funds out, change rules, or change keys.
7. **Registry:** reputation changes only through `record_outcome` called by the escrow contract.
8. **Netting:** a pair's balance never exceeds the exposure limit; a default is always covered by the deposit.

## 6. Tools to install

```bash
cargo install cargo-audit cargo-mutants cargo-llvm-cov bacon
```

`proptest` is added to each contract's `[dev-dependencies]` when we first need it (checkpoint 3).
