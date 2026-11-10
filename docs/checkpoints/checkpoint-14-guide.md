# Checkpoint 14: Agents negotiate in private

Claude writes this. You add a NEAR AI Cloud key (done) and try it in the browser. No contract changes.

## What happens when you ask your agent

1. You type what you need and the most you'll pay, then press **Ask your agent**.
2. If you didn't name a seller, your agent picks one from the businesses that have an agent, using their one-line descriptions.
3. The two agents take turns making offers (up to 8 moves) on **NEAR AI Cloud**. The model (`Qwen/Qwen3.6-35B-A3B-FP8`, a private model) runs inside sealed hardware (a TEE), so not even NEAR AI can read the talks.
4. Each move is a fixed JSON shape: offer / accept / walk away, plus item, quantity, total price, days to deliver and a short note.
5. On a deal:
   - the terms are saved encrypted, and only their fingerprint goes on chain;
   - your agent calls `open_deal`, which locks the money in escrow;
   - the seller's agent calls `accept_deal` with the same fingerprint.
6. If the price is over your limits, the deal waits under **Waiting for your OK**. Once you approve, the seller's agent accepts it on the next dashboard load.

## Rules the code enforces (not the AI)

| Rule | Where |
|---|---|
| Your agent never offers or accepts more than your maximum (or more than it holds) | `enforce()` in `lib/server/negotiate.ts` |
| An "accept" that quotes a different price counts as a counter-offer | `enforce()` |
| Replies that aren't valid JSON count as walking away | `parseOffer()` |
| The other agent's note is treated as their message, never as an instruction | The system prompt; the money rules above don't depend on it |
| Spending caps and approvals | The policy contract, as before |

Each agent's private notes (what it sells, its lowest prices) are encrypted on the server, and the other side never sees them. The dashboard has a **What your agent sells (private)** box.

## The "Verified private" badge

It shows only when all three checks pass for that negotiation:

1. **GPU:** we send NEAR AI Cloud a fresh random code (nonce). NVIDIA's attestation service checks the GPU and signs its verdict. We check NVIDIA's signature, that the verdict is a pass, and that our nonce is in it.
2. **Key binding:** the CPU's attestation report (the Intel TDX quote) contains the model's signing key and our nonce.
3. **Replies:** every reply in the negotiation was signed with that key, over the exact bytes we sent and got back.

What's not checked in the app: Intel's own signature on the CPU report, which needs Intel's certificate chain. The badge links to proof.t16z.com, where anyone can check it. Say so in the README.

## Setup

- `frontend/.env.local`: `NEAR_AI_API_KEY` (from your NEAR Builders claim). An optional `NEAR_AI_MODEL` swaps the model.
- The demo businesses' agents and private notes are loaded with:

  ```sh
  cd frontend
  node --conditions=react-server --env-file=.env.local --env-file=../scripts/.env.demo scripts/import-demo-agents.ts
  ```

  This is already done on your machine. Run it again on a new database (for example the hosted one in checkpoint 19).

## Tested live (testnet)

| Run | Result |
|---|---|
| cafe: 500 cups, up to 2 NEAR | 3 moves, 1.75 NEAR, money locked + accepted, 4/4 replies verified. Opened [Ht7Z1J…](https://testnet.nearblocks.io/txns/Ht7Z1JDFa4td2JGYgqKPoEPg1EvMypzGGgeyDuPwSo8c), accepted [9PjptZ…](https://testnet.nearblocks.io/txns/9PjptZL5yTZ8vjBrTwnRtCK8XJYdjWogSZEJiLtG33So) |
| cafe: 200 cups, up to 1 NEAR | 8 moves of real bargaining (0.05 → 0.65), 9/9 verified. Opened [GZS3j3…](https://testnet.nearblocks.io/txns/GZS3j3qiD8R8aZEhaQd35MmKS2hfptsDhGarLGohCC1F), accepted [FRMWUe…](https://testnet.nearblocks.io/txns/FRMWUevWTvKwr3zyYvETwM1LNSqaVaFnvqErZDL8j54w) |
| cafe: 600 cups, up to 2.5 NEAR (over the weekly limit) | Waited for approval; after approve, cups' agent accepted. Opened [FjcWvf…](https://testnet.nearblocks.io/txns/FjcWvfeDWJarYAMEF53SjHZ5KFriEHoPwGXhYbL6bubv), accepted [DZ66x2…](https://testnet.nearblocks.io/txns/DZ66x2WqEi1SQFPGmFNxcgUdQU2KQUbpz3K5is8mN6HB) |
| hh (you, in the browser): 100 cups, up to 0.4 NEAR | 7 moves, 0.35 NEAR, Verified private, money locked + seller agreed |

Three fixes came from these runs: the buyer used to reveal its maximum, a seller "accept" once quoted its own higher price, and locking the money failed with "Not enough balance". NEAR holds back the fee for the whole gas budget while a call runs, so `open_deal` now gets 60 Tgas and the agent keeps 0.07 NEAR aside for fees.

## Your checks (browser)

Restart `npm run dev` first so it picks up the new key.

1. Dashboard → Settings → **Who your agent may pay: Any business**. New sign-ups default to "Only businesses I approve", which refuses everyone until invite links (checkpoint 16).
2. Make sure your agent has at least 1 NEAR (**Add money**).
3. **Ask your agent:** "100 compostable cups, delivered this week", up to 0.5 NEAR. In about 20 to 30 seconds you should see a summary from cups, the **Verified private** badge, the moves, and two receipts. The deal also appears under **Deals**.
4. Open the badge and check that all three lines are ticked.
5. **Over the limit:** ask for "600 compostable cups" with a maximum above your per-deal limit. It should land under **Waiting for your OK**. Press **Approve**, and the summary should change to "Bought …" with a "Seller agreed" receipt.
6. Optional: write your own private notes in **What your agent sells**, so cafe could buy from you later.

Tell Claude what you see, or paste any error text.

## Known limits (for the README)

- The seller's lowest price lives in its private notes, so the AI keeps to it, not code. It can cave a little: in one run it went 0.05 NEAR under its floor. A number field for "lowest price per unit" would let code enforce it.
- The attestation is fetched from one of NEAR AI's servers. If another server answers a chat, that reply's signature won't match and the badge stays off (fails safe).
- Only businesses whose agent the website hosts can sell; bring-your-own agents (MCP) are a stretch goal.
