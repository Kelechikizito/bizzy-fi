# Checkpoint 1: Contracts workspace

**Status:** Claude set it up. Your job is to build it and read the skeleton.

## What was made

```
contracts/
  Cargo.toml            the workspace: lists the 3 contracts, shared release settings
  Cargo.lock            pinned dependency versions for all 3 (like foundry.lock)
  rust-toolchain.toml   pins Rust 1.93 + the wasm target, so builds match everywhere
  registry/  policy/  escrow/
    Cargo.toml          this contract's name and dependencies (near-sdk 5.29)
    src/lib.rs          the contract (right now: a sample auction contract)
    tests/test_basics.rs  a sandbox test (runs a real local NEAR node)
  target/               build output (ignored by git)
```

- Each folder was made with `cargo near new`. That command also creates a git repo and GitHub CI files inside each folder. They were removed, because a git repo inside our repo breaks GitHub (the same `frontend/` problem as before).
- The release settings (small, optimized wasm) moved to the workspace `Cargo.toml`. In a workspace, Cargo only reads them there.

## Understand first

| Foundry / Solidity | Cargo / NEAR |
|---|---|
| one Foundry project | one **crate** (a Rust package) |
| several projects sharing `lib/` | a **workspace**: several crates sharing one `target/` and one `Cargo.lock` |
| `forge build` → bytecode | `cargo near build` → a `.wasm` file (NEAR runs WebAssembly) |
| `forge test` | `cargo test` (unit tests) + sandbox tests (a local NEAR node) |
| ABI JSON | `*_abi.json`, made next to the wasm |

## Read the skeleton: `policy/src/lib.rs`

It's a sample auction. You'll delete it at checkpoint 2, but every idea in it is one you'll use. Find these:

1. **`#[near(contract_state)]` on `pub struct Contract`.** This is the contract's storage, like the state variables at the top of a Solidity contract. The whole struct is saved after every call that changes it.
2. **`#[derive(PanicOnDefault)]`.** The contract can't be used until it's set up with its `#[init]` method. Like a constructor that must be called.
3. **`#[near(serializers = [json, borsh])]` on `Bid`.** A struct that can be sent as JSON (to and from apps) and saved as Borsh (a compact binary format for storage).
4. **`#[init] pub fn init(...)`.** The setup method, like a constructor. On NEAR, deploying code and calling init are two separate steps, usually sent together.
5. **`#[payable] pub fn bid(&mut self)`.** Accepts NEAR. `env::attached_deposit()` is like `msg.value`.
6. **`env::predecessor_account_id()`.** The account that called this method: NEAR's `msg.sender`.
7. **`require!(cond, "message")`.** Same as Solidity's `require`: stops and undoes the call.
8. **`Promise::new(account).transfer(amount)`.** Sends NEAR. Note the warning comment in the code: the transfer happens **later**, not in this same step. That's the biggest difference from Solidity, and it's the whole topic of checkpoint 9.
9. **`&self` vs `&mut self`.** `&self` methods only read: they are **view** methods, free to call, like `view` functions. `&mut self` methods change state and need a transaction.
10. **`#[cfg(test)] mod tests`** at the bottom: unit tests. `testing_env!` fakes the caller, the time and the attached NEAR, like `vm.prank` and `vm.warp` in Foundry.

## Check

```bash
cd contracts/policy && cargo near build non-reproducible-wasm
cd ../registry && cargo near build non-reproducible-wasm
cd ../escrow && cargo near build non-reproducible-wasm
cd .. && cargo test -p policy --lib
```

Each build should end with `✓ Contract successfully built!`. The tests should show `7 passed`. (`non-reproducible-wasm` means a fast local build. The reproducible build, which anyone can repeat to get the exact same file, comes at the end.)

## Your testing toolkit (used at every checkpoint)

Run these from `contracts/`:

| Command | What it does | Foundry equivalent |
|---|---|---|
| `cargo test -p policy` | all tests for one contract | `forge test` |
| `cargo test -p policy withdraw` | only tests whose name contains `withdraw` | `forge test --mt withdraw` |
| `cargo test -p policy -- --nocapture` | also shows `println!` output | `forge test -vv` |
| `cargo clippy -p policy` | Rust's linter: catches mistakes and bad habits | `forge lint` / slither (lighter) |
| `cargo fmt` | formats the code | `forge fmt` |
| `cargo near build non-reproducible-wasm` (inside the contract folder) | builds the wasm | `forge build` |

How a unit test looks (from the sample; you'll write these for every method):

```rust
#[test]
#[should_panic(expected = "Auction has ended")]   // like vm.expectRevert("Auction has ended")
fn bid_after_auction_ended() {
    let mut contract = Contract::init(U64::from(1000), "auctioneer.near".parse().unwrap());
    let mut context = get_context("alice.near".parse().unwrap()); // like vm.prank(alice)
    context.block_timestamp(2000);                                  // like vm.warp(2000)
    context.attached_deposit(NearToken::from_near(2));              // like msg.value = 2 NEAR
    testing_env!(context.build());
    let _ = contract.bid();
}
```

**Optional, nice for "test as you build":** `cargo install bacon`, then run `bacon test` in `contracts/`. It reruns the tests every time you save a file.

## Verified at the stop

Point to these in `policy/src/lib.rs` and say in a few words what each does:
- the contract struct;
- the `#[init]` method;
- one view method;
- the line that reads `msg.sender`.

Then we start checkpoint 2: you write the real policy contract.
