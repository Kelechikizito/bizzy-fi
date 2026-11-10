# Checkpoint 12: Backend base

Claude wrote this. You only add two settings. No contract changes.

## What it does

| Part | Job |
|---|---|
| Sign-in | The wallet signs a one-time challenge; the server sets a login cookie |
| Agent keys | Made on the server, stored encrypted. On chain they can only call `open_deal` and `deal_action` |
| Deal terms | Stored encrypted, one key per deal. Only the buyer and seller can read them; only the fingerprint goes on chain |
| World ID | Checks the proof with World, then writes "a real human runs this" to the registry |
| Settlement job | Nothing on NEAR fires by itself, so this calls `release_due` and the refund methods when they're due |

The database is a local file (`bizzy.db`). For the hosted site, set `DATABASE_URL` and `DATABASE_TOKEN` to a hosted libSQL database; the code doesn't change.

## Settings (`frontend/.env.local`, never committed)

`MASTER_KEY` and `CRON_SECRET` are already there. **If `MASTER_KEY` is lost, the stored agent keys and terms can't be opened.**

### 1. The backend's key

Run this in your own terminal. It makes a key that can only call `attest` and spend at most 1 NEAR on fees:

```sh
near account add-key bizzy-fy-attester.testnet grant-function-call-access --allowance '1 NEAR' --contract-account-id bizzy-fy.testnet --function-names 'attest' autogenerate-new-keypair print-to-terminal network-config testnet sign-with-keychain send
```

Add the **private** key it prints (the long one, about 88 characters) to `frontend/.env.local`, and never paste it into a chat:

```
ATTESTER_KEY=ed25519:...
```

A key can only call one contract, so the settlement job needs a second key, limited to the escrow's settle methods:

```sh
near account add-key bizzy-fy-attester.testnet grant-function-call-access --allowance '1 NEAR' --contract-account-id escrow.bizzy-fy.testnet --function-names 'refund_expired,release_due,refund_on_timeout' autogenerate-new-keypair print-to-terminal network-config testnet sign-with-keychain send
```

Add its secret keypair as:

```
KEEPER_KEY=ed25519:...
```

### 2. World ID (sandbox)

At https://developer.world.org, create an app and an action named exactly `verify-guardian`. Then add:

```
WORLD_APP_ID=app_...
WORLD_RP_ID=rp_...
WORLD_SIGNING_KEY=...
WORLD_ENVIRONMENT=sandbox
```

Test with the simulator at https://simulator.worldcoin.org/.

## Check

From `frontend/`:

```sh
npm test
npm run build
```
