# Checkpoint 4: Policy, part 3: agent key and freeze

**You write this one** (or ask Claude to write a step). File: `contracts/policy/src/lib.rs`.

## Goal

The guardian gives the agent a **limited key** that can only call `request_spend` on the company account. One call to `freeze()` deletes that key and stops the agent. After a cooldown, the guardian can `unfreeze()` and give the agent a new key.

## Understand first

### 1. Access keys

A NEAR account can have many keys (Ethereum accounts have exactly one).

| Key | Can do |
|---|---|
| **Full-access** | Anything: send NEAR, deploy code, add keys |
| **Function-call** | Only call the listed methods on one contract. Can't send NEAR. Spends gas from a small **allowance** |

The company account has **no full-access key** (see CLAUDE.md, custody model). So the only way to add or delete a key is for the contract to do it **on its own account**, with a Promise sent to itself:

```rust
Promise::new(env::current_account_id())
    .delete_key(old_key)                       // optional, for rotation
    .add_access_key_allowance(
        new_key,
        Allowance::limited(AGENT_GAS_ALLOWANCE).unwrap(), // gas the key may burn
        env::current_account_id(),             // the only contract it may call
        AGENT_METHODS,                         // "request_spend" (comma-separated list)
    )
```

Both actions in one Promise run together: either both happen or neither does.

### 2. Why the methods list matters most

`AGENT_METHODS` is the whole security boundary. If it ever contained `withdraw`, `approve`, `set_limits`, `set_agent_key` or `freeze`, the agent could act as the guardian... except those methods check `predecessor == guardian`, and an agent call comes from the company account. So it's two locks, not one. Keep both.

Put it in one constant:

```rust
const AGENT_METHODS: &str = "request_spend";
const AGENT_GAS_ALLOWANCE: NearToken = NearToken::from_near(1);
const COOLDOWN_NS: u64 = 60 * 60 * 1_000_000_000; // 1 hour: short enough to demo
```

### 3. Promises you don't return

Since near-sdk 5.29, a `Promise` you neither return nor use is a warning (`#[must_use]`). If you create one inside an `if` and don't return it, call `.detach()` on it. It still runs.

### 4. Public keys in JSON

`near_sdk::PublicKey` travels as a string like `"ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"`. In tests: `"ed25519:...".parse().unwrap()`.

## Write

### New state

| Field | Type | Meaning |
|---|---|---|
| `agent_key` | `Option<PublicKey>` | The agent's current key (None = no agent) |
| `unfreeze_at` | `u64` | When `unfreeze` becomes allowed (ns). 0 in `new` |

### Methods

| Method | Who | Rules |
|---|---|---|
| `set_agent_key(public_key) -> Promise` | guardian, 1 yocto | Agent must be `Active` ("Agent is frozen"). Deletes the old key if there is one, adds the new one, stores it. Also how you **rotate** the key. |
| `freeze()` | guardian, 1 yocto | Deletes the key if there is one (`take()` it, `.detach()` the Promise). Sets `Suspended`, `unfreeze_at = now + COOLDOWN_NS`. |
| `unfreeze()` | guardian, 1 yocto | Must be `Suspended` ("Agent is not frozen") and `now >= unfreeze_at` ("Cooldown not over"). Sets `Active`. **Doesn't** add a key: the guardian calls `set_agent_key` next. |
| `get_agent_key() -> Option<PublicKey>` | view | |
| `get_unfreeze_at() -> U64` | view | For the dashboard countdown |

Freezing twice is fine: it just restarts the cooldown.

### Good to know

- **Open escrows aren't cancelled yet.** At checkpoint 9 `freeze` also cancels the agent's open deals.
- **Unit tests can't see keys.** `testing_env!` doesn't run Promises, so your unit tests check state (`agent_key`, `status`, `unfreeze_at`). Claude's sandbox test checks the real key on a real node.

## Your unit tests

Keep 1–26 and P1–P2. Add:

| # | Test | Expect |
|---|---|---|
| 27 | guardian sets a key | `get_agent_key()` is `Some(key)` |
| 28 | stranger sets a key | panics "Only the guardian can do this" |
| 29 | set a key while frozen | panics "Agent is frozen" |
| 30 | guardian freezes | `Suspended`, `agent_key` is None, `unfreeze_at` = now + cooldown |
| 31 | stranger freezes | panics |
| 32 | agent spends after freeze | panics "Agent is not active" |
| 33 | unfreeze before the cooldown | panics "Cooldown not over" |
| 34 | unfreeze after the cooldown | `Active` |
| 35 | unfreeze when not frozen | panics "Agent is not frozen" |

## Claude's sandbox test

Once your code passes, Claude adds `contracts/policy/tests/agent_key.rs`. On a local NEAR node it:
1. Deploys the policy on a company account and calls `set_agent_key`.
2. Signs with the agent key: `request_spend` **works**; `withdraw` and a plain NEAR transfer **fail**.
3. Calls `freeze`: the key is **gone** from the account, and the agent's next call fails.

## Check

From `contracts/`:

```bash
cargo test -p policy                       # 35 unit + 2 property tests (+ sandbox once Claude adds it)
cargo clippy -p policy --tests -- -D warnings
cargo fmt --check
cd policy && cargo near build non-reproducible-wasm
```

## Verified at the stop

1. `AGENT_METHODS` lists only agent methods: never `withdraw`, `set_limits`, `approve`, `reject`, the allowlist or the key methods.
2. Keys are added and deleted only on `env::current_account_id()`.
3. `set_agent_key` deletes the old key, so there's never more than one agent key.
4. All four guardian methods check guardian + 1 yocto.
5. Freeze works even with no key set; unfreeze respects the cooldown.
6. All tests pass, including the sandbox test; clippy is clean.

Tell me when you're done, or say "write step 1" and Claude will write it.
