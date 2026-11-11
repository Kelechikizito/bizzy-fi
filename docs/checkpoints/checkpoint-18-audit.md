# Checkpoint 18: Security check of the contracts

Review of `registry`, `policy`, `escrow` and `types` (2026-11-11), following the `near-contract-audit` checklist. At your request, Claude then fixed M3 and L3 in the code. **They're not deployed yet** (see the last section).

**Result: no high-severity problems.** After the fixes, all 126 tests pass and `cargo clippy` reports nothing.

## Standard checks: all pass

| Check | Result |
|---|---|
| Callbacks marked `#[private]` | ✓ `on_deal_opened`, `on_company_created` |
| State saved before money moves (no reentrancy) | ✓ every payout updates status and `locked` first |
| Caller checks | ✓ guardian, agent, owner, attester, escrow, buyer and seller are each checked |
| 1 yoctoNEAR on guardian methods (stops limited keys) | ✓ (`set_policy_hash` added, see L3) |
| JSON number types | ✓ `U64` and `NearToken` strings, no raw `u64`/`u128` |
| Separate storage prefixes | ✓ |
| `#[init]` on constructors; policy init only from its parent | ✓ |
| Safe math | ✓ `overflow-checks = true`, saturating sums, no floats |
| Unbounded loops | ✓ milestones ≤ 10, pending approvals ≤ 20, views paginated |
| Failed deal creation | ✓ the policy gets the money back and un-counts it |

## Findings

### Medium

**M1. Anyone can slowly block new deals (escrow storage).**
- Every deal stays in the escrow forever, and the escrow, not the buyer, pays for its storage.
- A company can open 0.1 NEAR deals and cancel them straight away. It gets its money back and pays only fees.
- Each one uses up some of the escrow's spare NEAR. When the spare runs out, every new deal fails with "Escrow needs more NEAR for storage".
- Fix: keep a small storage fee (about 0.01 NEAR) from each deal, or delete deals once they're finished.
- For the demo: keep the escrow topped up.

**M2. A buyer can back out of any accepted deal for free.**
- Before delivery, the buyer can dispute. While a deal is disputed, the seller can't mark it delivered.
- After 1 hour, `refund_on_timeout` refunds the buyer in full, and neither side's score changes.
- The seller loses the sale and any work already done.
- Fix, any one of:
  - let the seller still mark it delivered during a before-delivery dispute;
  - make that refund wait until the delivery deadline;
  - count it as a lost dispute for the buyer.

**M3. The agent can pay out its own purchases straight away.** ✅ Fixed in code
- `confirm` is in `AGENT_DEAL_METHODS`, so the agent can release money without the 1-hour review.
- A stolen agent key plus a seller the thief controls could empty a full week's limit at once, before the guardian notices and freezes.
- Fix: remove `confirm` from `AGENT_DEAL_METHODS`. Payment then needs the guardian, or the review hour to pass, which leaves time to freeze or dispute.
- The website never uses the agent's `confirm` (the guardian presses "It arrived: pay"), so nothing else changes.

### Low

- **L1. Company spam costs the registry.** The registry pays to store each company record (about 0.005 NEAR). The creator can withdraw its 0.5 NEAR deposit afterwards. Fix: keep a small fee from the deposit.
- **L2. A buyer can force a 50/50 split on a delivered deal.** It disputes in the review hour and doesn't agree a split. Both sides lose score, which discourages it. Known trade-off: "delivered" is the seller's word.
- **L3. `set_policy_hash` has no 1 yoctoNEAR check.** ✅ Fixed in code: it now needs 1 yoctoNEAR (new test 3b; the Makefile's `set-hash` attaches it).
- **L4. A deal's seller can be any account under the registry,** including the escrow itself. Harmless: the deal just waits until the buyer cancels.

### Already known (for the README)

- The guardian can't be changed.
- Two companies with the same owner can trade with each other to raise their scores (wash trading).
- Deal amounts are public; only the terms are private.
- "Delivered" is the seller's word.
- The testnet treasury is public.

## Deploying the fixes (not done)

- **Policy:** new companies use the code saved in the registry by its hash, so a fix reaches only companies created after you upload the new code and call `set_policy_hash`. Existing companies (hh, cafe, cups) keep the old code.
- **Escrow:** can be redeployed in place. `Deal` doesn't change shape, so the existing deals stay readable.

- **What changed in the fix:** `confirm` was removed from `AGENT_DEAL_METHODS` (test 41 is now `agent_cannot_confirm`; the sandbox full-path test confirms as the guardian), and `set_policy_hash` became `#[payable]` with `assert_one_yocto()`.
- To ship: `make upload-policy` (burns about 20 test NEAR), then `make set-hash`. Redeploying the registry also needs your key. Ask Claude before either.
