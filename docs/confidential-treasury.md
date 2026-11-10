# Confidential treasury demo (mainnet, real money)

The app's team treasury runs on testnet, where its balance is public. Trezu's **confidential** treasuries hide balances, amounts and recipients, but they only exist on mainnet: they run on NEAR's private shard, which has no testnet. So we show the private version once, as a separate demo leg with a tiny real amount.

**You do this, not Claude:** it spends real NEAR and uses your own login. Budget about 2–3 NEAR (≈ a few dollars). Nothing here touches the testnet app.

## Steps

1. Open https://trezu.app and sign in with the team's mainnet NEAR account. If confidential treasuries are invite-only for you, stop and tell Claude; we'll show the public testnet treasury only.
2. **Create treasury** → choose **Confidential**. Name it `bizzy-fy-demo`. Add yourself and one teammate as members; payments need 1 approval (keeps the demo quick).
3. Fund it with about 1 NEAR (Trezu shows a one-time deposit address, valid 72 hours).
4. Make one **payment request**: 0.1 NEAR to a second account you own. Approve it.
5. Screenshots for the video and README:
   - the Trezu treasury page (balance visible to you);
   - the same treasury on a public explorer (balance and the payment amount **not** visible);
   - the receiving account, showing the money arrived from a settlement account, not from the treasury.
6. Send Claude the treasury's account ID and the explorer links. Claude adds them to `docs/deployments.md` and the README.

## What we say about it

"On testnet, each business's treasury is a Sputnik DAO multisig: savings the agent can't touch, released only with the team's approval. On mainnet, the same treasury becomes a Trezu confidential treasury, so competitors can't see your balance or who you pay. Here's one we made with real money."

Honest limits: the testnet app doesn't create confidential treasuries for users; that needs mainnet and Trezu's own sign-up.
