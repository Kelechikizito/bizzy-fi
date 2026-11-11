# Bizzy-Fy

> Your business's AI agent haggles with suppliers' agents inside sealed hardware, then locks the payment on NEAR until delivery, under rules the AI cannot override.

**NEAR Hackathon 2026** · Tracks: Agent Economy, Privacy & Private AI, AI Security & Defense, Autonomous Business · Built on NEAR (Rust contracts, function-call keys, global contracts), NEAR AI Cloud, Privy, World ID

[Deployed contracts](#deployments) · [Proof it ran](#proof-it-ran) · [Try it](#try-it)

---

## The problem

A café owner in Lagos needs 500 compostable cups every week. Ordering from a new supplier means paying a deposit up front and hoping the cups arrive, or the supplier delivering first and hoping to get paid. Haggling takes phone calls. Handing that to an AI agent is worse: today an agent with a wallet can spend everything in it, and its negotiation runs on someone else's servers where prices and margins leak.

Bizzy-Fy gives the café an agent that bargains in private, cannot spend past the owner's limits, and never hands money to a seller until the goods arrive.

## How it works

hh, a small café, asks its agent for "100 compostable cups, delivered this week, up to 0.4 NEAR". This happened on testnet on 10 November; every step below has a receipt.

1. **The agents bargain in private.** hh's agent and cups's agent make 7 moves on NEAR AI Cloud, inside an Intel TDX + NVIDIA TEE: 0.05 → 0.4 → 0.15 → 0.35 → 0.25 → 0.35 → accept. Code, not the AI, stops hh's agent from ever offering over 0.4 NEAR.
2. **The privacy is checked, not claimed.** The server sends a fresh nonce, checks NVIDIA's signed GPU verdict, checks that the TDX quote binds the model's signing key to that nonce, and checks every reply's signature. All three pass, so the deal shows **Verified private**.
3. **The money is locked.** The terms (100 cups, 0.35 NEAR, 5 days) are stored encrypted. Only their SHA-256 fingerprint goes on chain. hh's agent calls `open_deal` on hh's own policy contract, which checks the limits and moves 0.35 NEAR into escrow.
4. **The seller agrees to the same terms.** cups's agent calls `accept_deal` with the same fingerprint. A different fingerprint is refused.
5. **Delivery, then payment.** cups marks it delivered. hh's owner presses "It arrived: pay cups". The escrow pays 0.35 NEAR to cups and tells the registry. Both businesses' scores go up.

If the price had been over hh's per-deal limit, step 3 would have parked the deal until the owner pressed **Approve**. If cups had never delivered, anyone could have refunded hh after the deadline.

```mermaid
sequenceDiagram
    participant O as Owner (guardian)
    participant B as Buyer agent
    participant AI as NEAR AI Cloud (TEE)
    participant S as Seller agent
    participant P as Buyer's policy contract
    participant E as Escrow
    participant R as Registry
    O->>B: "100 cups, up to 0.4 NEAR"
    B->>AI: offers and counter-offers (signed replies)
    S->>AI: offers and counter-offers
    B->>B: check NVIDIA + TDX attestation, every signature
    B->>P: open_deal(terms fingerprint)
    P->>P: limits, approved list, freeze
    P->>E: create_deal + 0.35 NEAR
    S->>E: accept_deal(same fingerprint)
    S->>E: mark_delivered
    O->>P: deal_action(confirm)
    E->>S: 0.35 NEAR
    E->>R: record_outcome (both sides)
```

## What makes this different

- **The AI holds a key, not the money.** Each business is its own NEAR account with **no full-access key**. Its funds sit in a policy contract. The agent gets a function-call key that can only call `open_deal` and `deal_action`, with a 1 NEAR gas allowance. Spending caps, weekly limits, approvals and freeze are enforced on chain. A prompt injection can make the agent say anything; it cannot make the contract pay more.
- **Private negotiation you can verify.** Other agent marketplaces run the negotiation on their own servers. Here it runs in NEAR AI Cloud's TEE, and every negotiation stores its own proof: NVIDIA's verdict for our nonce, the key binding, and a signature check on each reply.
- **Private terms, public guarantees.** Prices and items never touch the chain. The escrow holds only the amount and a salted fingerprint, so either side can later prove what was agreed without publishing it.
- **Private trade graph.** Approved trading partners are stored as `sha256(secret salt + account)`, a different salt per direction, so nobody can read on chain who trades with whom.
- **Reputation that only real deals can write.** Scores come from the escrow contract when a deal settles. A business cannot edit its own record.

## Architecture

Three Rust contracts on testnet, a Next.js 16 app, and a small server that hosts the agents.

### Registry ([contracts/registry/src/lib.rs](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/contracts/registry/src/lib.rs#L120-L191))

`bizzy-fy.testnet`. `create_company` creates `<name>.bizzy-fy.testnet` in one batch: create account, fund it, deploy the policy from a NEAR **global contract** by hash, and initialise it with the caller as guardian. The new account never gets a full-access key. It also holds the directory, World ID attestations (at most 3 companies per human), and reputation, which only the escrow may write ([`record_outcome`, L221](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/contracts/registry/src/lib.rs#L221-L250)).

### Policy ([contracts/policy/src/lib.rs](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/contracts/policy/src/lib.rs#L131-L192))

One per business, holding its money. `open_deal` runs four checks in order: frozen, approved-partner salt, per-deal cap, weekly cap. The first two refuse; the last two park the deal for the guardian. `deal_action` forwards escrow calls so the escrow sees the company as the caller. The agent may only use `accept_deal`, `mark_delivered` and `cancel` ([L17-L19](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/contracts/policy/src/lib.rs#L17-L19)). `freeze` deletes the agent's key at once and starts a one-hour cooldown ([L271-L283](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/contracts/policy/src/lib.rs#L271-L283)).

### Escrow ([contracts/escrow/src/lib.rs](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/contracts/escrow/src/lib.rs#L92-L292))

`escrow.bizzy-fy.testnet`. Deals move Proposed → Accepted → Delivered → Released, with up to 10 milestones. Timers run without a trusted party:
- the buyer has one hour to review a delivery, after which anyone can call `release_due`;
- an undelivered deal can be refunded by anyone after its deadline (`refund_expired`);
- a dispute that isn't settled by an agreed split within an hour ends by a fixed rule (`refund_on_timeout`).

Our keeper calls these with a key limited to exactly those methods. Every payout updates state before moving money.

### Private negotiation ([frontend/lib/server/ai.ts](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/frontend/lib/server/ai.ts#L43-L96))

- **Model:** `Qwen/Qwen3.6-35B-A3B-FP8`, a private model on NEAR AI Cloud. Each move is fixed JSON: offer, accept or walk away.
- **Attestation:** `attest()` sends a fresh nonce. `gpuPasses()` checks NVIDIA NRAS's JWT against NVIDIA's keys and confirms the nonce. `quoteBinds()` reads the TDX report data (signing address + nonce). `signedBy()` recovers each reply's ECDSA signer over `sha256(request):sha256(response)`.
- **Rules in code** ([negotiate.ts](frontend/lib/server/negotiate.ts)): the buyer is capped at its maximum, an "accept" that quotes a different price counts as a counter-offer, and anything that isn't valid JSON counts as walking away.

### The app ([frontend/](frontend))

- **Sign-in:** any NEAR wallet through NEAR Connect (HOT, Meteor, MyNearWallet and others), proved by one signed message; a sponsor sends new testnet accounts 1 test NEAR.
- **Dashboard:** limits, approvals, a freeze button, private seller notes, and a Sputnik DAO team treasury.
- **Pages:** deal pages with a timeline, disputes and split offers; invite links and QR codes for approved partners; direct deals for terms agreed offline; public profiles at `/b/<name>` with share cards for X; a leaderboard at `/top`.
- **Bring your own agent:** an MCP endpoint (`/api/mcp`) lets Claude, Cursor or any MCP client act as a business's agent, with exactly the agent's powers.

## Deployments

NEAR testnet.

| What | Account |
|---|---|
| Registry (company factory, directory, reputation) | [`bizzy-fy.testnet`](https://testnet.nearblocks.io/address/bizzy-fy.testnet) |
| Escrow | [`escrow.bizzy-fy.testnet`](https://testnet.nearblocks.io/address/escrow.bizzy-fy.testnet) |
| Policy code (global contract, by hash) | `Ah9j86UuAV6fqyP1yzPVKSw8SWDGgaDpkTwiuxbvfvx6` |
| Attester and keeper (World ID facts, settling due deals) | [`bizzy-fy-attester.testnet`](https://testnet.nearblocks.io/address/bizzy-fy-attester.testnet) |
| Demo businesses | [`cafe.bizzy-fy.testnet`](https://testnet.nearblocks.io/address/cafe.bizzy-fy.testnet), [`cups.bizzy-fy.testnet`](https://testnet.nearblocks.io/address/cups.bizzy-fy.testnet), [`hh.bizzy-fy.testnet`](https://testnet.nearblocks.io/address/hh.bizzy-fy.testnet) |

## Proof it ran

hh's first deal, end to end (deal 5):

| Step | Transaction |
|---|---|
| hh signs up: account and policy created, no full-access key | [`FHTzsB…`](https://testnet.nearblocks.io/txns/FHTzsBZkNKxvEssPiHhqiD6dcTqNeHExX2FJTJTb2PnD) |
| Guardian gives the agent its limited key | [`Bi87Ka…`](https://testnet.nearblocks.io/txns/Bi87KaMK7hr342QWFQ23PgEKfZCBm1ADbfgBgBQJH7DB) |
| After 7 private moves, hh's agent locks 0.35 NEAR | [`BpiGHY…`](https://testnet.nearblocks.io/txns/BpiGHYAMrJfUXs2Q4x8jnNk5FvLEbUR9r6rMMqAZoqgh) |
| cups's agent accepts the same fingerprint | [`BrdHCN…`](https://testnet.nearblocks.io/txns/BrdHCN1eYgt9a1YhHAhSfHSKbBa96FXFVKjANT5xc5Tw) |
| cups marks it delivered | [`DTshU6…`](https://testnet.nearblocks.io/txns/DTshU6udfsvWTjXG5ttrPYsUTTqSEWgbj2zm9Y7GrHU4) |
| hh's guardian confirms; cups is paid; scores updated | [`91ZichC…`](https://testnet.nearblocks.io/txns/91ZichCGAwS2PMU8C4DbbE1ppANVMoCfs1PivHa3rMj4) |

The other paths:

| What it shows | Transaction |
|---|---|
| Over the weekly limit: deal parked, then the guardian approves | [`441Ath…`](https://testnet.nearblocks.io/txns/441AthiUrUK7EMhXxQK1S43T2XH1hxnPEUgLY8eztafY) → accepted [`DZ66x2…`](https://testnet.nearblocks.io/txns/DZ66x2WqEi1SQFPGmFNxcgUdQU2KQUbpz3K5is8mN6HB) |
| Guardian approves cups by salted fingerprint | [`HcKzwD…`](https://testnet.nearblocks.io/txns/HcKzwD6uFPDmFrLZmvShaaYU7jXcj4xr9L6UA9uyC9Uj) |
| On "only businesses I approve", the agent proves cups with the salt and locks 0.16 NEAR | [`5V8vFN…`](https://testnet.nearblocks.io/txns/5V8vFNNAbd9EUF9gTXfHgGqWihWfxLURjaJrRnXhXNPr) |
| The keeper refunds a deal past its deadline | [`DRNLQG…`](https://testnet.nearblocks.io/txns/DRNLQGKnKFzoCau2RM3GeLvt1yaVkJxBuChsGiv7RZYd) |
| A company is marked verified human after World ID | [`674UXL…`](https://testnet.nearblocks.io/txns/674UXLrSBFiLwEKD6kBjdn4Phhmamn247yjPuKmaQDVj) |
| A test call to the MCP endpoint with cafe's connection key buys 50 cups: verified private, parked for approval | [`4RChg8…`](https://testnet.nearblocks.io/txns/4RChg87kNaJrKRGdBC5hsGWmGLxrSTXJj4tL6Qrocf7K) |

## Try it

Do these on the hosted site or locally (see Quick start):

1. **Sign in** with a NEAR testnet wallet (Meteor or HOT make one free), then name your business. You get a business account that holds its own money.
2. **Add money** (Settings → Add money), for example 0.5 test NEAR.
3. **Ask your agent:** `100 compostable cups, delivered this week`, up to `0.4`. In about 30 seconds you see "Bought 100 × compostable cups from cups", the **Verified private** badge (open it for the three checks), the moves, and two receipts.
4. **Open the deal** under Deals. Press **Have cups deliver now (demo)**, then **It arrived: pay cups**. The timeline reaches "Seller paid".
5. **Try the limits:** ask for something above your per-deal limit. It lands under **Waiting for your OK**.
6. **Press Freeze agent.** Asking again now fails, because the agent's key is gone from the chain.
7. **Approved businesses only:** Businesses you trade with → **Connect with cups**, then Settings → **Only businesses I approve**. Your agent still buys from cups and refuses anyone else.
8. **Your own AI:** "Use your own AI as your agent" → make a key → run the Claude Code line. Then ask Claude to buy cups on Bizzy-Fy.
9. Open **Top businesses** and your public profile at `/b/<your name>`.

## Quick start

Needs Node 20+, and Rust with `cargo-near` for the contracts.

```sh
git clone https://github.com/Kelechikizito/bizzy-fy && cd bizzy-fy/frontend
npm install
cp .env.example .env.local   # fill in the values; names and purposes are in the file
npm run dev                  # http://localhost:3000
```

> The site uses the testnet contracts listed above, so you don't need to deploy anything. To let the demo businesses negotiate, load their agent keys once: `node --conditions=react-server --env-file=.env.local --env-file=../scripts/.env.demo scripts/import-demo-agents.ts`.

Contracts: `cd contracts && make test` (all tests and clippy), `make build`. `make help` lists deploy steps (testnet only).

## Testing

- **126 contract tests pass** (`cargo test --workspace`), and `cargo clippy -D warnings` is clean:
  - 118 unit tests: escrow 42, policy 49, registry 27;
  - 8 sandbox tests on a real local NEAR node, including the full deal path through all three contracts.
- **10 server tests** (`npm test`): offer parsing, the buyer's price cap, the TDX quote binding, NEP-413 login signatures, World ID nullifiers, sessions, encryption, who can read terms, settle timing, and contact-link safety.

What must never break, and is tested:
- An agent can never open a deal above its per-deal or weekly cap without the guardian's approval.
- A frozen agent has no key on chain, so it cannot act at all.
- The escrow pays out at most what was locked for each deal, and only once.
- Only the escrow can change a company's reputation.
- With "only approved businesses" on, a wrong salt is refused.

## Security review

The three contracts were reviewed against the `near-contract-audit` checklist ([report](docs/checkpoints/checkpoint-18-audit.md)):
- **No high-severity issues.** All callbacks are `#[private]`, state changes before money moves, and guardian methods need 1 yoctoNEAR.
- **Two fixes made in code:**
  - the agent can no longer confirm its own purchases, so a stolen key can't pay out at once;
  - `set_policy_hash` now needs 1 yoctoNEAR.

## Known issues

- **The policy fix isn't on testnet yet.** Uploading new policy code as a global contract burns about 20 test NEAR. Existing testnet companies run the earlier version, where the agent may also call `confirm`. New code applies to companies created after the upload.
- **The escrow pays for deal storage.** A company could open and cancel many 0.1 NEAR deals to use up the escrow's spare NEAR and block new deals. Fix: keep a small fee per deal, or delete finished deals. For now the escrow is kept funded.
- **A buyer can back out of an accepted deal by disputing before delivery.** The refund comes after an hour, and the seller can't mark delivery while disputed. A fix is to let the seller still deliver during that dispute.
- **The seller's lowest price is kept by the AI, not code.** In one run it went 0.015 NEAR under its notes. A per-unit floor field would let code enforce it, as it already does for the buyer.
- **The attestation is fetched from one NEAR AI node,** and Intel's signature on the TDX quote isn't checked in-app (it needs Intel's certificate chain). If a different node answers, the signatures don't match and the badge stays off. Anyone can check the quote at [proof.t16z.com](https://proof.t16z.com).
- **"Delivered" is the seller's word.** The buyer's protection is the review hour and disputes. Deal amounts are public; only the terms are private.

## Track alignment

| Track | Where |
|---|---|
| **Agent Economy**: "agents that earn, spend, negotiate" | Two agents negotiate and settle a purchase: [`negotiate()`](frontend/lib/server/negotiate.ts), [escrow](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/contracts/escrow/src/lib.rs#L92-L292), MCP for outside agents ([`app/api/mcp`](frontend/app/api/mcp/route.ts)) |
| **Privacy & Private AI**: "private AI, TEE, NEAR AI Cloud" | Negotiation in NEAR AI Cloud's TEE with in-app attestation checks ([`ai.ts` L43-L96](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/frontend/lib/server/ai.ts#L43-L96)); encrypted terms with on-chain fingerprints; salted partner list |
| **AI Security & Defense**: "spending limits, policy engines, sandboxed wallets, reputation… function call keys, TEE attestation" | [Policy contract](https://github.com/Kelechikizito/bizzy-fy/blob/d2190f0b7b97d16015287b1feadb2effe269c254/contracts/policy/src/lib.rs#L131-L283): caps, approvals, freeze, function-call key with gas allowance, no full-access key; reputation only the escrow writes |
| **Autonomous Business**: "procurement… humans only set the constraints" | The owner sets limits and approves exceptions; the agent buys, the escrow settles, the keeper ends timeouts |

## What I'd build next

- **Credit from trade history.** Every settled deal is already an on-chain, unforgeable payment record. A lender could extend working capital to a business with a strong record, which matters most where banks don't serve small traders.
- **Real KYB/AML.** The registry already has a `Kyb` attestation slot. Hooking it to a provider such as Sumsub or Persona turns the "business check" quest from coming-next to real.
- **Netting.** Businesses that trade both ways would settle only the difference each period, with deposits as collateral.
- **Stablecoin deals and NEAR Intents.** Price in USDC and let the buyer pay from any chain.
- **List agents on NEAR's Agent Market,** so a business's agent can also be hired by others.

## Team · License

Built by [@Kelechikizito](https://github.com/Kelechikizito) during the NEAR hackathon, with Claude Code. MIT licensed (see [LICENSE](LICENSE)). The design notes and every build step are in [`docs/`](docs).
