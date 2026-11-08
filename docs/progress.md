# Progress so far (checkpoints 1–8)

## The big picture

Bizzy-Fy has three smart contracts (programs that live on the NEAR blockchain):

| Contract | Lives at | Job in one line |
|---|---|---|
| **Policy** | each company's account, e.g. `acme.bizzyfy.testnet` | Holds the company's money and the rules for its AI agent |
| **Registry** | `bizzyfy.testnet` | Creates companies and keeps their public record and reputation |
| **Escrow** | `escrow.bizzyfy.testnet` | Holds a deal's money until the deal ends, then pays the right side |

All three work **on their own** now. Checkpoint 9 connects them.

## What each contract can do

### Policy (checkpoints 2–4)

- **A guardian (the human in charge)** sets spending limits: most per deal, most per week.
- **The agent asks to spend.** The contract checks, in order:
  1. Is the agent active?
  2. Is this partner allowed?
  3. Is the amount under the per-deal limit?
  4. Is there room left in this week's limit?
- If 1 or 2 fail → **refused**. If 3 or 4 fail → **sent to the guardian** to approve or reject.
- **The allowlist** stores a fingerprint (hash) of each partner's name, not the name. Today that's weak (see Known limits); checkpoint 9b fixes it.
- **Agent key:** the guardian gives the agent a key that can call **only** "ask to spend". It can't send money or change rules.
- **Freeze button:** one click deletes the agent's key. After a 1-hour cooldown the guardian can switch the agent back on.
- **The company account has no master key.** Only the contract's rules can move its money. Not even we can.

### Registry (checkpoints 5–6)

- **Create a company in one click:** makes `acme.bizzyfy.testnet`, puts the policy on it, and moves in the starting money (at least 3 NEAR). If anything fails, the money comes back.
  - Why 3 NEAR: ~1.7 NEAR stays locked to pay for storing the policy code; the rest is the company's own wallet (not a fee) and pays the agent's transaction fees.
  - Checkpoint 9b shares one copy of the policy code between all companies, so the minimum can drop.
- **Company record:** guardian, a short public "about" line (fits an X post), who referred them.
- **Verified facts** (written only by our backend): "a real human runs this" (World ID, at most 3 companies per person), "business verified", and the agreement's fingerprint.
  - World ID isn't checked on NEAR itself: our backend checks the proof with World's servers, then writes the result. You trust our backend for that step.
  - Login uses passkeys or Google. A passkey proves you own a device, not that you're one unique person, so it can't replace World ID.
- **Reputation** (written only by the escrow): deals on time, late, disputes won and lost, number of partners, total volume.
- **Score and tier:** worked out from those numbers with a public formula. Nobody can edit them by hand.
- **Referrals:** the inviting company gets credit when the new company is really created.

### Escrow (checkpoints 7–8)

- **A deal's path:** buyer locks money → seller accepts (must agree to the same terms) → seller delivers → buyer confirms → seller is paid.
- **The terms stay private:** only their fingerprint (hash) is on the blockchain.
- **Pay in stages (milestones):** e.g. 30% / 40% / 30%. They must add up to the full amount.
- **The buyer goes quiet?** After a 1-hour review window, anyone can release the payment.
- **Seller never delivers?** After the deadline, anyone can send the money back to the buyer.
- **Disagreement?** Either side can dispute. Both must offer the **same** split to settle it. If they don't agree within 1 hour, the buyer gets back what's left.
- **Golden rule:** every path ends with the money in exactly one place, and it can never be paid twice.

## Words worth knowing

| Word | Meaning |
|---|---|
| **Rust** | The language NEAR contracts are written in. Strict: it catches many mistakes before the code runs. |
| **Account** | A named address like `acme.bizzyfy.testnet`. Can hold money and one contract. |
| **Sub-account** | `acme.bizzyfy.testnet` is under `bizzyfy.testnet`. Only the parent can create it. |
| **Access key** | Lets someone act for an account. A *limited* key can only call named methods. |
| **Promise** | A note to the blockchain: "after this call, do X" (send money, create an account). It runs later. |
| **Callback** | A follow-up call that tells you if a Promise worked, so you can save or undo. |
| **Hash** | A fixed-length fingerprint of data. Proves what was agreed without showing it. |
| **yoctoNEAR** | The smallest NEAR unit. Attaching 1 to a call proves a real person signed it. |
| **Storage cost** | Data on NEAR locks some NEAR (about 1 NEAR per 100 KB). |

## How we know it works

| Kind of test | What it does | Count |
|---|---|---|
| **Unit tests** | Run the contract on your computer with a fake blockchain. Fast. | Policy 37 · Registry 26 · Escrow 32 |
| **Property tests** | Throw random amounts at the spending checks to look for any way past the limits. | 2 |
| **Sandbox tests** | Run the contracts on a real NEAR node on your computer, with real money moving. | 1 per contract |
| **Clippy** | Rust's code checker: flags risky or messy code. | Clean |

We also broke the code **on purpose** (wrong payee, missing refund, extra agent permission) to prove the tests catch those bugs. They did.

## What's private, what isn't

| Private | Public (anyone can read the blockchain) |
|---|---|
| Full deal terms (only their fingerprint is on chain) | Deal **amounts**, and **who dealt with whom** |
| The agents' negotiation (planned: NEAR AI secure hardware) | Deal status, dates, milestones |
| The person behind World ID | Company names, "about", guardian, referrer |
| KYB documents (only a "passed" flag) | Spending limits, pending approvals, balances |
| | Reputation numbers and volume |

In short: **what** was agreed is private; **that** acme paid beta 2 NEAR is public. Netting (checkpoint 17) reduces how many payments show up.

## Known limits (to say honestly in the README)

- **The allowlist can be matched today.** The same name always gives the same fingerprint, and the registry lists every company name, so anyone can hash each name and compare. Checkpoint 9b adds a secret salt so they can't.
- Someone could tell that two companies were verified by the **same** person (the World ID scrambled ID is the same), though not who it is.
- World ID is checked by our backend, not on chain.
- Review, dispute and freeze windows are **1 hour** for the demo. In real life they'd be days.

## What's next

| # | Checkpoint | Who |
|---|---|---|
| 9 | Connect the contracts: an approved spend opens a real escrow deal; the escrow updates reputation; freeze cancels open deals | you (Claude guides) |
| 9b | Salted allowlist; one shared copy of the policy code (cheaper companies) | you (Claude guides) |
| 10 | Full end-to-end tests | Claude |
| 11 | Deploy to testnet + demo companies | Claude |
| 12–15 | Backend, website, AI agents, deal pages | Claude |
| 16–17 | Direct connections, netting | you + Claude |
| 18–22 | Security review, profile and sharing, README, demo video, submit | both |

Deadline: **2026-11-14, 23:59 UTC**.
