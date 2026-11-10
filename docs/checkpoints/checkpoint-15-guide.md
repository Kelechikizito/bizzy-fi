# Checkpoint 15: Deal pages

Claude writes this. No contract changes.

## What's new

- Every row under **Deals** on the dashboard opens `/deals/[id]`.
- The page shows:
  - a timeline: agreed in private → money locked → seller accepted → delivered → seller paid (or refunded, in dispute, split);
  - one box with what happens next, its deadline, and only the buttons the escrow allows for your side right now;
  - the private terms (only the buyer and seller can open the page) and the chain's fingerprint of them;
  - the agents' negotiation and the **Verified private** badge.
- Buttons, each sent by you (the guardian) through your company's `deal_action`:

| You are | Deal is | Buttons |
|---|---|---|
| Buyer | Waiting for seller | Cancel and get money back |
| Buyer | Accepted | Report a problem; for demo sellers, **Have cups deliver now (demo)** |
| Seller | Accepted | Mark delivered |
| Buyer | Delivered (1-hour review) | It arrived: pay the seller; Report a problem |
| Seller | Delivered (1-hour review) | Report a problem |
| Either | In dispute | Offer a split; Agree to the other side's offer |

- **Nothing on NEAR fires by itself.** When the page opens, the server checks if the deal is due (deadline passed, review over, dispute over) and settles it with the keeper key. The cron route does the same for every deal.
- cups and cafe have no person behind them, so the buyer can make them deliver. The button says "(demo)".

## Your checks (browser)

1. Dashboard → **Deals** → open your 0.35 NEAR deal with cups.
2. Press **Have cups deliver now (demo)**. The timeline reaches "Delivered".
3. Press **It arrived: pay cups**. Approve in your wallet. The timeline reaches "Seller paid", with a receipt.
4. Optional, with a new small deal: **Report a problem**, then offer a split and watch it wait for the other side.

Tested live: you bought 100 cups from cups (deal 5) and paid after the demo delivery; the page reached "Seller paid". cups's agent also marked deal 2 delivered through its limited key ([5zx7c2…](https://testnet.nearblocks.io/txns/5zx7c26LFGRx1pABhud3PgL91LXp26jfwZHhkYHEpHZw)).

## Known limits

- "Delivered" is the seller's word; the buyer's protection is the review hour and disputes.
- In a dispute against a demo seller, nobody answers your split offer, so it ends by the timeout rule.
