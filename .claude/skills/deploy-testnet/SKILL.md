---
name: deploy-testnet
description: Build the Rust contract in contract/ with cargo-near and deploy it to a NEAR testnet account.
disable-model-invocation: true
---

Deploy the bizzy-fi contract to testnet. Target account: `$ARGUMENTS` (must end in `.testnet`; if empty, ask the user — never invent one).

1. Refuse if the account is not a `.testnet` account. Mainnet deploys need the user's explicit confirmation and are out of scope here.
2. Check the account exists and has balance:
   `near account view-account-summary <account> network-config testnet now`
   If it doesn't exist, tell the user to create it (`near account create-account sponsor-by-faucet-service <account> autogenerate-new-keypair save-to-keychain network-config testnet create`) and stop.
3. Build from `contract/`: `cargo near build non-reproducible-wasm`. Fix build errors before continuing.
4. Deploy from `contract/`. If the contract has an `#[init]` method that hasn't run on this account yet, deploy with init; otherwise without:
   - `cargo near deploy build-non-reproducible-wasm <account> without-init-call network-config testnet sign-with-keychain send`
   - or `... with-init-call <method> json-args '<args>' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send`
   Ask the user for init args rather than guessing.
5. Smoke test with a view call: `near contract call-function as-read-only <account> <view_method> json-args '{}' network-config testnet now`.
6. Report the account, the transaction hash, and the explorer link `https://testnet.nearblocks.io/txns/<hash>`. These are evidence for the README.
