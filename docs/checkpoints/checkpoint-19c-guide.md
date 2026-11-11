# Checkpoint 19c: Direct deals, leaderboard, profile contacts and quests

Claude wrote this. No contract changes.

## Direct deals (for deals agreed in real life)

- Dashboard → **Already agreed a deal with a business? Lock the money here**.
- The buyer types the seller's name, the item, quantity, total price and days to deliver. There's no AI bargaining.
- The buyer's agent locks the money (`open_deal`), with the same limits, approvals and approved-business list as any deal.
- The seller opens the deal page and presses **Accept these terms**, which calls `accept_deal` through its guardian.
- The demo businesses (cups, cafe) accept at once, because nobody stands behind them.
- The terms are stored encrypted, like the AI's deals, and only their fingerprint goes on chain.
- Files: `lib/server/direct.ts`, `app/api/companies/[id]/direct-deal`, `components/direct-deal.tsx`.
- Tested live: an unknown seller is refused. cafe → cups for 0.1 NEAR was accepted by the contract, and waited for approval because cafe is over its weekly limit ([FSyQmv…](https://testnet.nearblocks.io/txns/FSyQmvUiskrPfNysAoZQeJizu2VWvhpE5L6bSaPpYFgz)).

## Leaderboard

- `/top`, linked as **Top businesses** in the header of every page.
- It ranks every business by its registry score (written only by the escrow), then by on-time deals.

## Profile: contacts and proof of reputation

- Dashboard → **Contact details on your public profile**: website, email, X, Telegram, phone, location. All optional; anything left blank stays hidden.
- These are stored on our server, not on chain. Links use only fixed prefixes (`https://`, `mailto:`, `tel:`), with a test for it.
- `/b/<name>` shows four quests from the registry:
  - Verified human (World ID);
  - Business check (KYB: shown as "coming next");
  - First deal paid;
  - Brought in a business.

## Not built (for the README roadmap)

- **Real AML/KYC:** needs an account with a provider (Sumsub, Persona). A sandbox hookup is under a day once you have a key.
- **Loans from trade history:** needs lending contracts, a default policy and legal review.

## Your checks

1. Dashboard → open **Already agreed a deal…**. Seller `cups`, item `compostable cups`, 30, 0.1 NEAR, 3 days → **Lock the money**. You land on the deal page, already accepted.
2. Open **Top businesses** from the header.
3. Fill in a contact detail or two, save, and open **Your public profile**.
