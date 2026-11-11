# Bizzy-Fy: Guided Build Plan

Companion to [architecture.md](architecture.md). That document says what Bizzy-Fy is; this one says what gets built, in what order, and who writes each piece.

**You write the three Rust contracts. Claude explains, reviews and unblocks.** Claude writes everything else: scaffolding, tests, deploy and seed scripts, the backend, the agent layer, the frontend and the README.

Each checkpoint says:
- **Goal:** what gets built and why;
- **Understand first:** ideas to learn before starting;
- **Write:** what to write;
- **Check:** commands to run;
- **Verified at the stop:** what Claude checks before we move on.

A detailed guide for each checkpoint is written in `docs/checkpoints/` **when we reach it**, not ahead of time. We stop after every checkpoint.

Deadline: **2026-11-14 23:59 UTC**.

## How we test (as we build, never at the end)

- **You write unit tests for every method in the same checkpoint you write the method.** They live at the bottom of each `lib.rs` in `#[cfg(test)] mod tests` and use `testing_env!` to fake the caller, the time and attached NEAR (like `vm.prank`/`vm.warp`/`msg.value` in Foundry).
- **Unit tests can't run cross-contract calls, key changes or sub-account creation.** Those happen in a later step on a real chain. For checkpoints that use them (4, 5, 7, 9, 16, 17), Claude adds a **sandbox test** at that same checkpoint: a real local NEAR node, so you see it working before moving on.
- **Every checkpoint ends green:** build + `cargo test` pass, with no warnings from `cargo clippy`.
- Security practices, fuzzing, mutation testing, static analysis and staging: see [security-testing.md](security-testing.md).

---

## Progress

- [x] 1: Contracts workspace (Claude)
- [x] 2: Policy, part 1: state, guardian, withdraw
- [x] 3: Policy, part 2: spending checks and approvals
- [x] 4: Policy, part 3: agent key and freeze
- [x] 5: Registry, part 1: create a company
- [x] 6: Registry, part 2: attestations and reputation
- [x] 7: Escrow: full lifecycle
- [x] 8: Escrow: milestones, auto-release, disputes
- [x] 9: Wiring the three contracts together
- [x] 9b: Privacy and cost fixes: salted allowlist, shared policy code
- [x] 10: Sandbox tests (Claude)
- [x] 11: Testnet deploy and demo seed (Claude)
- [x] 12: Backend base (Claude)
- [ ] 13: Frontend shell, onboarding, dashboard, freeze (Claude)
- [x] 14: Agent layer: private negotiation (Claude)
- [x] 15: Deal pages end to end (Claude)
- [x] 16: Direct connections (contract already had it; Claude: UI)
- [ ] ~~17: Netting~~ skipped (README lists it as next)
- [ ] 18: Security audit pass
- [ ] 19: Profile, referral, share card, landing, hosted deploy (Claude)
- [ ] 20: README (Claude)
- [ ] 21: Demo video and X post
- [ ] 22: Submit

---

## Starting state

Checked in the repo on 2026-11-07:

- **No contract code yet.** Rust 1.96, the `wasm32-unknown-unknown` target, `cargo-near` 0.22 and NEAR CLI 0.30 are installed.
- **`frontend/`** is the stock create-next-app (Next.js 16.4.5, React 19.3, Tailwind v4), with `cacheComponents` turned on. There are no NEAR or AI packages yet.
- **Docs:** product design, architecture (with the open decisions resolved by the recommendations in §14), key questions, ecosystem guide, demo script.
- **NEAR skills** are installed (`near-smart-contracts`, `near-contract-audit`, `near-dapp`, `near-api-js`, `near-kit`, `near-ai-cloud`, `near-intents`, `near-cli-rs`).

---

## Decisions taken

| Question | Decision |
|---|---|
| Who writes what | You: the 3 contracts. Claude: everything else |
| Network | NEAR testnet; native NEAR as the deal currency |
| Contract layout | `contracts/` Cargo workspace: `registry/`, `policy/`, `escrow/` |
| Who controls company funds | The **policy contract** on the company account. The account has no full-access key |
| Guardian powers | Contract methods that check the caller is the guardian |
| Agent key | A function-call key the policy contract adds to its own account |
| Freeze | The contract deletes the agent key, sets Suspended, cancels open escrows |
| Over-cap spending | Pending approval inside the policy contract; SputnikDAO/Trezu later |
| On-chain "signing" of a deal | Buyer policy creates the deal with the terms hash; seller policy accepts with the same hash |
| Deal terms | Encrypted in the backend database; only the hash goes on-chain |
| Disputes | Auto-release after the review window; in a dispute, both guardians agree a split, otherwise refund at timeout |
| Settlement | Full escrow, milestone escrow, netting for trusted connections |
| Connections | Stored as hashes in the policy contract |
| Login | HOT via `near-connect-hooks` (after a quick check for Google/social login) |
| AI | NEAR AI Cloud, attestation checked before showing "Verified private" |
| Identity | World ID (staging), checked by the backend, recorded by `registry.attest` |
| Demo | Event venue booking |
| If time runs out | Cut netting UI polish → share card → World ID (labeled mock) → milestone UI |

---

## Architecture sketch

```
Guardian (browser, HOT wallet)
   │ guardian calls: approve, freeze, withdraw, set policy
   ▼
acme.bizzy-fy.testnet ── policy contract (holds the company's funds)
   ▲                         │ open_deal / accept_deal / pay_net
   │ agent's function-call   ▼
   │ key (backend)       escrow.bizzy-fy.testnet ── escrow + milestones + netting
   │                         │ record_outcome
Agent runner ◀── NEAR AI      ▼
(backend)        Cloud    bizzy-fy.testnet ── registry: companies, attestations,
                 (TEE)                       reputation, creates company accounts
```

---

# Day 1 (Sat 7 Nov): foundations

## Checkpoint 1: Contracts workspace (Claude)

**Goal.** A Cargo workspace with three empty contracts that build.

**Understand first.**
- A **crate** is one Rust package (like one Foundry project). A **workspace** groups crates so they share one build folder and one `Cargo.lock`.
- Each contract crate builds to one `.wasm` file. NEAR runs WebAssembly, not EVM bytecode.
- `cargo near build` is the equivalent of `forge build`.

**Write.** Claude creates `contracts/` with `registry/`, `policy/` and `escrow/`, using `cargo near new`.

**Check.**
- `cd contracts/policy && cargo near build non-reproducible-wasm`
- the same command in `registry/` and `escrow/`

**Verified at the stop.** You can point to the contract struct, the `#[init]` method and one view method in the skeleton, and say what each does.

## Checkpoint 2: Policy, part 1: state, guardian, withdraw

**Goal.** The policy contract stores who the guardian is and the spending rules, and only the guardian can change them or take money out.

**Understand first.**
- `env::predecessor_account_id()` is NEAR's `msg.sender`. `env::signer_account_id()` is like `tx.origin`, and we don't use it for access checks.
- NEAR amounts are `NearToken` (1 NEAR = 10^24 yoctoNEAR, like wei).
- `require!(cond, "msg")` panics and undoes the call, like Solidity's `require`.

**Write.**
- **State:** `guardian`, `registry`, `escrow`, caps (`per_deal_cap`, `period_cap`, `period_length`), `status` (Active / Suspended / Cooldown).
- `#[init] new(...)`: only the parent account (the registry) may call it.
- `assert_guardian()` helper.
- `set_limits(...)` (guardian only, 1 yoctoNEAR; timelock comes later).
- `withdraw(amount, to)` (guardian only).
- Views: `get_limits`, `get_status`, `get_guardian`, `get_available_balance`.

**Check.** Build + your unit tests: the guardian can do each action, anyone else fails, `withdraw` can't exceed the balance.

**Verified at the stop.** Every method that changes state checks the guardian first; `withdraw` can't send more than the balance.

# Day 2 (Sun 8 Nov): policy + registry

## Checkpoint 3: Policy, part 2: spending checks and approvals

**Goal.** Every spend by the agent passes four checks in order. A spend that goes over a cap waits for the guardian.

**Understand first.**
- `near_sdk::store` collections (`LookupMap`, `IterableMap`) are like Solidity mappings, but each needs its own short prefix so their storage doesn't collide.
- Time: `env::block_timestamp()` is in **nanoseconds**.

**Write.**
- `check_spend(counterparty, amount)`, checking in order: active → allowed counterparty → per-deal cap → period cap.
- Track spending in the current period.
- `PendingApproval` records.
- `approve(id)` / `reject(id)` (guardian only).

**Check.** Build + unit tests for each check and for period reset.

**Verified at the stop.** The check order matches architecture.md §8, and the period resets correctly.

## Checkpoint 4: Policy, part 3: agent key and freeze

**Goal.** The guardian can give the agent a limited key, and freeze it in one call.

**Understand first.**
- NEAR accounts can have many **access keys**. A **full-access key** can do anything. A **function-call key** can only call named methods on one contract and can't send NEAR.
- A contract can add or delete keys **on its own account** using Promise actions.

**Write.**
- `set_agent_key(public_key)`: guardian only; adds a function-call key for the agent methods only.
- `freeze()`: guardian only; deletes the key, sets Suspended, starts the cooldown.
- `unfreeze()`: after the cooldown.

**Check.** Build + your unit tests (only the guardian can call these, status changes). Claude adds a sandbox test that the key really appears, really works only for agent methods, and really disappears on freeze.

**Verified at the stop.** The key's allowed methods list has only agent methods, never `withdraw`, `set_policy`, `approve` or the key methods.

## Checkpoint 5: Registry, part 1: create a company

**Goal.** One call creates `acme.bizzy-fy.testnet`, puts the policy contract on it and sets its guardian.

**Understand first.**
- **Sub-accounts:** only `bizzy-fy.testnet` can create `*.bizzy-fy.testnet`.
- **Storage staking:** a contract must hold NEAR to pay for the bytes it stores (about 1 NEAR per 100 KB). The caller attaches this deposit.
- One Promise can chain actions: create account → transfer → deploy code → call init.

**Write.**
- `set_policy_code(bytes)` (owner only).
- `create_company(name, profile, referrer)` (payable).
- `Company` record.

**Check.** Build + your unit tests for name checks and deposits. Claude adds a sandbox test that `acme.<registry>` really gets created with the policy contract on it.

**Verified at the stop.** A failed creation refunds the deposit, and no company record is saved until the creation succeeds (callback).

## Checkpoint 6: Registry, part 2: attestations and reputation

**Goal.** The registry records verified facts and reputation that nobody can fake.

**Write.**
- `attest(company, kind, hash)`: attester account only.
- `record_outcome(...)`: escrow contract only.
- Reputation fields (completed, on-time, disputes, distinct counterparties, volume tier).
- Views: `get_company`, `list_companies`.

**Verified at the stop.** Only the right callers can write. Reputation can't be changed any other way.

# Day 3 (Mon 9 Nov): escrow

## Checkpoint 7: Escrow: full lifecycle

**Goal.** Money locks when a deal is made and releases on delivery.

**Understand first.** `#[payable]` methods receive NEAR (`env::attached_deposit()`), like `msg.value`. `Promise::new(to).transfer(amount)` sends NEAR.

**Write.**
- `create_deal(seller, terms_hash, deadlines)` (payable, from a policy contract).
- `accept_deal(id, terms_hash)`.
- `mark_delivered`, `confirm`, `refund_expired`.

**Verified at the stop.** Every path ends with the money in exactly one place, and status checks stop double releases.

## Checkpoint 8: Escrow: milestones, auto-release, disputes

**Write.**
- Milestones (amount + status each).
- `release_due` (anyone can call it after the review window).
- `dispute`, `propose_split` (both guardians), `refund_on_timeout`.

**Verified at the stop.** Milestone amounts add up to the deal amount. A dispute blocks auto-release.

## Checkpoint 9: Wiring the three contracts together

**Goal.** policy → escrow → registry calls work, and failures roll back cleanly.

**Understand first.** A NEAR call to another contract is **not** done in the same step. It runs later, and you learn the result in a **callback**. So: never assume success; change state in the callback; mark callbacks `#[private]` so only the contract itself can call them.

**Write.**
- `policy.open_deal` → `escrow.create_deal` + callback.
- `escrow` → `registry.record_outcome`.
- `freeze` cancels open escrows.

**Verified at the stop.** For each call between contracts: what happens if it fails?

## Checkpoint 9b: Privacy and cost fixes

**Goal.** Close two gaps found after checkpoint 8.

**Write.**
- **Salted allowlist (policy).** Store `hash(salt + account)`, not `hash(account)`. The salt is a random secret per company, kept off-chain by the app; `open_deal` takes it as an argument. Today anyone can hash every name in the public directory and match the allowlist; with a salt they can't.
- **Shared policy code (registry).** Upload the policy code once as a NEAR **global contract** and have each new company point to it, instead of storing its own 170 KB copy. Each company then locks far less NEAR, so the 3 NEAR minimum can drop. Check global-contract support on testnet and in the sandbox first, and its one-time upload price, in the NEAR docs.

**Verified at the stop.** No allowlist hash can be recomputed from public data alone. A new company still runs the exact policy code, can't be changed afterwards, and needs a smaller deposit.

## Checkpoint 10: Full-path sandbox tests (Claude)

The per-checkpoint sandbox tests joined into end-to-end runs of the full path: create companies → set agent key → open deal → accept → milestone release → reputation; over-cap approval; freeze cancels escrow; dispute split and timeout. **You run them and fix any bugs they find.**

# Day 4 (Tue 10 Nov): testnet + app shell

- **Checkpoint 11 (Claude):** deploy to testnet, `scripts/seed-demo.ts` (two funded demo companies), `docs/deployments.md` with tx links. You run the deploy.
- **Checkpoint 12 (Claude):** backend base: database, terms encryption, server signer for agent keys, World ID check → `registry.attest`.
- **Checkpoint 13 (Claude):** frontend shell, onboarding wizard, dashboard, **Freeze** button. A quick check first of whether HOT gives Google/social login.

# Day 5 (Wed 11 Nov): agents

- **Checkpoint 14 (Claude):** private negotiation on NEAR AI Cloud (two agents, structured offers), terms hash, attestation check, "Verified private" badge.
- **Checkpoint 15 (Claude):** deal pages end to end.

# Day 6 (Thu 12 Nov): standout features

- **Checkpoint 16:** you write direct connections (hashed allowlist) in the policy contract; Claude writes the invite link/QR pages.
- **Checkpoint 17 (skipped 2026-11-11):** you write netting in escrow (balances, limits, deposits, `settle`, `claim_default`); Claude writes the tests and the UI.
- **Checkpoint 18:** the `near-contract-audit` skill on all three contracts; you fix the findings.

# Day 7 (Fri 13 Nov): polish + ship

- **Checkpoint 19 (Claude):** profile, referral link, share-to-X card, landing + FAQ, hosted deploy. Making the repo public needs your yes.
- **Checkpoint 20 (Claude):** README via the hackathon-readme skill.

# Day 8 (Sat 14 Nov): demo + submit

- **Checkpoint 21:** you record the video (`docs/demo-script.md`) and post on X; Claude drafts the post.
- **Checkpoint 22:** Claude prints the submission payload; you confirm before it's sent. Aim to submit by ~18:00 UTC.
