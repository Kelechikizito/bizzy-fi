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

Run this in your own terminal, and copy the private key it prints:

```sh
near account export-account bizzy-fy-attester.testnet using-private-key network-config testnet
```

Add it to `frontend/.env.local`, and never paste it into a chat:

```
ATTESTER_KEY=ed25519:...
```

### 2. World ID (staging)

At https://developer.world.org, create an app and an action named exactly `verify-guardian`. Then add:

```
WORLD_APP_ID=app_...
WORLD_RP_ID=rp_...
WORLD_SIGNING_KEY=...
WORLD_ENVIRONMENT=staging
```

Test with the simulator at https://simulator.worldcoin.org/.

## Check

From `frontend/`:

```sh
npm test
npm run build
```
