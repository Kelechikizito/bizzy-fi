# Checkpoint 11: Testnet deploy and demo companies

**You run the deploy** (it signs with your key). Claude writes the demo script and `docs/deployments.md` once part 1 is done. No contract code changes.

## Goal

Put all three contracts on NEAR testnet, then create two demo companies and run one real deal, so judges have links they can click.

| Account | What goes there |
|---|---|
| `bizzy-fy.testnet` | Registry (you already made this account in Meteor) |
| `escrow.bizzy-fy.testnet` | Escrow |
| One shared copy of the policy code | Every company points to it |
| `bizzy-fy-attester.testnet` | No contract. The key our backend will use to write "verified" facts |

## Understand first

### 1. Deploying on NEAR versus Foundry

In Foundry, `forge create` makes a new address each time. On NEAR the address comes first: you deploy code **onto an account that already exists**. Deploying again replaces the code but keeps the saved data, like an upgrade with no proxy.

### 2. The three contracts point at each other

The registry needs the escrow's name, and the escrow needs the registry's. That's easy on NEAR: names are known before anything is deployed, so the order doesn't matter.

### 3. The attester can't be changed later

The registry has `set_policy_hash`, but nothing to change `attester`. Whatever we pass to `new` stays. So we create the backend's own account now, and a leak of the backend's key can't touch the registry.

It's deliberately **not** `attester.bizzy-fy.testnet`. Escrow treats every direct sub-account of the registry as a company (it only checks the name), so nothing except real companies and the escrow itself should live under `bizzy-fy.testnet`. **Never create other sub-accounts there.**

### 4. What it costs

Your balance is 45 NEAR.

| Step | NEAR | |
|---|---|---|
| Upload shared policy code (203 KB) | about 20.3 | **Burned, never comes back** |
| Registry code (196 KB) | about 2 | Locked while the code is there |
| Escrow account | 3 | Sent to the account; covers its code and deals |
| Attester account | 0 | Free, from the testnet faucet |
| Fees | under 0.1 | |
| **Left over** | **about 19.5** | Enough for the demo companies |

### 5. Be honest about the keys

Company accounts have no master key. But `bizzy-fy.testnet` and `escrow.bizzy-fy.testnet` **do**: you hold them, so we can redeploy while we build. That means whoever holds the escrow key could take the money in open deals. It's fine on testnet. For real money the keys must be deleted first, and the README should say so.

## Do

Run everything from `contracts/`. Testnet only: every command says `network-config testnet`.

### Step 1: Give the CLI your key

In Meteor, open the account's security settings and reveal the private key or recovery phrase. Then run one of these and paste it **at the prompt**, so it stays out of your shell history. Never paste it into this chat or the repo.

```sh
near account import-account using-private-key
near account import-account using-seed-phrase
```

Choose `testnet` and save to the keychain. If a later step says "Access key not found", add `KEYCHAIN=sign-with-legacy-keychain` to the `make` command.

### Step 2: Build and test

```sh
make build
make test
```

`make test` takes about 4 minutes. Don't deploy unless it's green. Run `make` on its own any time to list the commands.

### Step 3: Create the two accounts

```sh
make accounts
```

### Step 4: Deploy the registry and escrow

```sh
make deploy
```

This runs each contract's setup, so it only works the first time.

### Step 5: Upload the shared policy code

**This burns about 20 NEAR.** Check step 4 worked first. The command stops and asks you to type `burn`.

```sh
make upload-policy
```

It uploads with `as-global-hash`, never `as-global-account-id`: the second lets the code be changed later, which would break the promise that nobody can rewrite the code holding a company's money.

### Step 6: Tell the registry which code to use

```sh
make set-hash
```

Step 5 saved the code's hash (its fingerprint), and this step reads that saved copy. So running a build or the tests in between can't cause a mismatch.

### Step 7: Send Claude the results

Paste the **transaction hashes** from steps 4, 5 and 6, plus the output of `make hash`. These are public, so they're safe to share. Never send a private key.

Claude then writes:

- `docs/deployments.md`, with explorer links for every deploy.
- `scripts/seed-demo.ts`, which creates two guardian accounts from the faucet, makes `cafe.bizzy-fy.testnet` and `cups.bizzy-fy.testnet`, gives each an agent key (saved to a gitignored `.env` file), and runs one deal from start to finish.

You run the script, and its links go into `docs/deployments.md`.

## Check

```sh
make check
```

This lists each contract's methods, then the companies: `[]` before the demo script runs, and two companies after.

## Verified at the stop

- All three contracts are live on testnet, and every deploy has an explorer link.
- `cafe` and `cups` exist, and neither has a full-access key (`near account list-keys cafe.bizzy-fy.testnet network-config testnet now` shows only limited keys).
- One demo deal ran on testnet: money locked, seller paid, reputation up on both sides.

## If something changes later

Checkpoints 16 to 18 will change the contracts. Plan for it:

- **New policy code means another upload, and another 20 NEAR or so.** Companies already created keep the old code, so re-run the demo script afterwards. Top up at near-faucet.io when needed, and upload as few times as possible.
- **If a redeploy changes what a contract saves, the old data can't be read and the contract breaks.** On testnet the simple fix is a fresh start: delete and recreate `escrow.bizzy-fy.testnet`, and put the registry on a new account. Sort out the names before you record the demo video.
