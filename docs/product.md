# Bizzy-Fy: Product Design

**Bizzy-Fy is a privacy-by-default agentic B2B commerce platform on NEAR.** Each company is run day to day by an AI agent, backed by an accountable human guardian, and holds a governed on-chain treasury. Agents negotiate deals privately and settle them through escrow.

All on-chain logic is native Rust on NEAR. We use partner tools wherever they fit (see `docs/ecosystem.md`).

---

## Inspiration: Novi Corpus

Novi Corpus (https://www.novicorpus.com/, https://ethglobal.com/showcase/novi-corpus-0qdc8, https://github.com/MBarralDevs/Project-Alpha) gives an AI agent a company. That means a Wyoming DAO LLC, a human guardian verified with World ID, and a USDC treasury on Arc (Circle's chain) with spending caps, a payee allowlist, timelocked policy changes, pause and clawback.

We borrow only what makes these features work in practice, not for show, and rebuild it NEAR-native.

**Originality:** Novi Corpus won a prize at ETHGlobal Lisbon, so judges may know it. Pitch what's different: **companies negotiating with each other privately**, plus NEAR's protocol-level key permissions. Don't pitch "Novi Corpus on NEAR".

---

## 1. Company = legal entity + human guardian + governed treasury

| Novi Corpus (EVM) | Bizzy-Fy (NEAR-native) |
|---|---|
| Wyoming DAO LLC, agent is managing member | Same legal idea. For the hackathon we generate the operating agreement and store its **hash on-chain** (a "policy fingerprint"), so the legal document and on-chain rules are provably the same. We don't claim to file real LLCs. |
| Guardian verified with World ID | Guardian proves personhood. World ID works on any chain: verify the proof on our server and store only the nullifier, an anonymous ID that limits one human to a set number of companies. |
| Agent wallet with a delegated key | Each company gets a named NEAR account (e.g. `acme.bizzyfy.testnet`). The **guardian holds the full-access key**. The **agent gets a function-call key**, a NEAR feature that can only call specific methods on one contract and can never transfer funds directly. |
| Treasury with caps, allowlist, timelock | Our Rust **policy contract** enforces a cap per transaction, a cap per period, a recipient allowlist, and timelocked policy changes. Anything over the cap becomes a **Trezu/SputnikDAO proposal** the guardian approves. Trezu's confidential treasuries keep balances private. |

## 2. How agents sign contracts and transact

1. **Negotiate privately.** Agents negotiate inside **NEAR AI Cloud**, which runs models in sealed hardware (TEEs), so deal terms never leak to the AI provider.
2. **Sign the deal.** Each agent signs the agreed terms with a NEP-413 signed message. Only the **hash** of the terms and both signatures go on-chain; the full terms stay encrypted off-chain.
3. **Escrow.** The buyer's funds lock in our escrow contract, routed through the policy contract and within caps. Funds release when delivery is confirmed.
4. **Cross-chain payment.** If the buyer pays in another token or chain, **NEAR Intents** settles it. Intents has no testnet, so use tiny mainnet amounts or mocked quotes.
5. **Optional extra security.** **OutLayer** can keep the agent's key inside a TEE so it can't leak, and produces verifiable receipts of agent actions.

## 3. Rogue agent: freeze, recover, consequences

**Freeze:** the guardian makes one call that:
- deletes the agent's key from the company account (instant, and the agent can't block it);
- marks the agent **Suspended** in the policy contract, which the public profile shows immediately.

**Recover:** the agent never held the funds; the company account and contracts did. The guardian cancels unsettled escrows the agent opened, and the funds return to the treasury.

**Consequences:**
- **Bond slashing:** each agent posts a bond on activation. If a dispute goes against it, part of the bond compensates the counterparty.
- **Reputation hit:** a freeze or a lost dispute lowers the score and the spending tier.
- **Cooldown:** a frozen agent can only be reactivated after a delay, and the reason stays in the company's history.
- **Counterparty protection:** escrow means a rogue agent can never take unearned money.

## 4. Reputation and ranking

"High-performing" is scored only on outcomes the escrow contract records, so they're hard to fake:
- deals completed
- on-time delivery rate
- dispute rate and how disputes were resolved
- distinct repeat counterparties
- account age
- volume as **tiers**, not exact amounts

A World ID–verified guardian is required, which stops fake companies from inflating scores.

## 5. Company profiles vs privacy

NEAR named accounts already work like ENS names: `acme.bizzyfy.near` is the profile. Privacy is kept with **selective disclosure**:
- **Public, by the company's choice:** name, contact details, reputation score and tier, verification badges.
- **Private by default:** deal history, counterparties, amounts.
- **Auditors:** the company grants a time-limited, read-only viewing key. Lighter option: a TEE program (OutLayer or NEAR AI) reads private data and publishes a signed statement such as "revenue above $X, zero disputes" without revealing individual deals.

## 6. Proof-of-Reputation quests and AML

Quests have real effects. Each one raises the company's **trust tier**, and the tier unlocks **higher agent spending caps and smaller required bonds**. Example quests:
- I'm human (World ID)
- Guardian set
- Treasury funded
- First deal completed
- Invited a company (covers the referral-link requirement)
- KYB/AML verified

Store only attestations, never documents. Real KYB/AML needs a commercial agreement with a verification provider, so for the hackathon use a provider sandbox or a clearly labeled mock.

Reference: Meta Pool's quests used NEAR's "I-Am-Human" credential. Check that it's still live before relying on it; World ID is the safer default.

---

## Contracts to build

Three Rust contracts:

1. **Registry**, at `bizzyfy.testnet`:
   - Creates each company's named account (`acme.bizzyfy.testnet`).
   - Stores the public profile, guardian verification (World ID nullifier, KYB attestations), the operating agreement hash, referrals, and quest/trust tier.
   - Holds reputation, updated automatically when escrow deals settle.
2. **Agent policy**, one deployed on each company account:
   - The only contract the agent's function-call key can call.
   - Enforces per-deal and per-period caps, the counterparty allowlist, and time-locked policy changes.
   - Sends anything over the cap to the guardian for approval.
   - Handles **freeze** (Suspended status, cancelling the agent's open escrows) and the agent's bond and slashing.
3. **Escrow**:
   - Records each deal as a terms hash plus both agents' signatures.
   - Locks funds and releases them on delivery or after the deadline.
   - Handles milestones, holdbacks, refunds and disputes.
   - Reports each outcome to the registry for reputation.

**Not built by us (partners):** multisig treasury (Trezu/SputnikDAO), cross-chain payments (NEAR Intents), private AI (NEAR AI Cloud), agent key custody (OutLayer), proof of personhood (World ID, verified off-chain).

---

## Scope (deadline 2026-11-14T23:59:00Z)

1. **Core loop (must-have):** company onboarding (social login, guardian, named account) → agent with function-call key and caps → private negotiation (NEAR AI) → escrow deal → freeze button.
2. **Next:** reputation computed from escrow outcomes, plus a profile with public and private sections.
3. **Stretch:** quests and trust tiers, leaderboard, auditor views, operating-agreement document, bonds and slashing.
