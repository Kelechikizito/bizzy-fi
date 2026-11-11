# Checkpoint 16: Direct connections (invite links)

No new contract code: your policy contract already had it (`allow_counterparty`, `remove_counterparty`, `is_allowed`, and the salt check in `open_deal`, covered by your tests 16, 17 and 45). Claude wrote the website part.

## How it works

1. Every business gets one invite link and QR code (dashboard → **Businesses you trade with**).
2. Someone opens the link:
   - not signed up yet → they sign up first (you're saved as their referrer), then come back to the link;
   - signed up → **Connect with you** adds you to their approved list in one click.
3. You see them listed: "Connected with you. Approve them". **Approve** adds them to your list.
4. With **Only businesses I approve** on, your agent shops only among businesses you approved, and sends the secret salt so the contract can check it.

## Why the chain can't see who you trade with

- Each approved-list entry on chain is `sha256(salt + their address)`, where the salt is 32 random bytes.
- Each side has its own salt, so your entry and theirs look unrelated.
- The salts are kept encrypted on the server. The agent sends a salt only when it opens a deal.

## Files

- `lib/server/connections.ts`: invite codes, salts and fingerprints.
- `app/api/companies/[id]/connections` and `app/api/invites/[code]`: the two routes.
- `components/connections.tsx`: the dashboard box.
- `app/invite/[code]/page.tsx`: the invite page.
- The agent change is in `negotiate()`.

## Tested live (testnet)

cafe connected with cups, and cafe's guardian approved cups and switched to "Only businesses I approve". cafe's agent then bargained (0.3 NEAR), and the contract accepted the salt. The deal waited for approval only because cafe is over its weekly limit ([DbhSW1…](https://testnet.nearblocks.io/txns/DbhSW1BUh4QsM28mLPrZAKFmCdkxi7cBMVBcjtNysMYa)). cafe was then set back to "Any business".

In the browser: hh connected with cups, switched to "Only businesses I approve", and bought 50 cups for 0.16 NEAR (money locked, seller agreed, Verified private). cups's notes now say "Minimum order 20", so small demo orders work.

## Your checks (browser)

1. Dashboard → **Businesses you trade with**. You should see your link and a QR code.
2. Press **Connect with cups**, then approve in your wallet. cups shows "Approved".
3. Settings → **Only businesses I approve**.
4. **Ask your agent** for "50 compostable cups" up to 0.3. It should still make a deal with cups.
5. Optional: open your invite link in a private window. You should see "hh wants to trade with you".

## Known limits

- The server keeps the salts. Someone who had both the server's database and its encryption key could rebuild who trades with whom.
- Removing a business deletes your on-chain entry, but the connection stays listed so you can approve it again.
