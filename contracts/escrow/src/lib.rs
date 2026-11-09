//! Bizzy-Fy escrow: holds a deal's NEAR until it is released to the seller or refunded.

// ─── 1. Imports ────────────────────────────────────────────────────────────
use bizzy_types::{Outcome, ext_registry};
use near_sdk::json_types::{Base58CryptoHash, U64};
use near_sdk::store::IterableMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, env, near, require,
};

/// Smallest deal: each deal costs storage, so tiny spam deals are refused.
const MIN_DEAL: NearToken = NearToken::from_millinear(100);
const MAX_MILESTONES: usize = 10;
/// Gas for each reputation report to the registry.
const GAS_FOR_REPORT: Gas = Gas::from_tgas(10);
/// After a delivery, the buyer has this long to confirm or dispute (1 hour: short enough to demo).
const REVIEW_WINDOW_NS: u64 = 60 * 60 * 1_000_000_000;
/// After a dispute, the two sides have this long to agree a split; then the buyer is refunded.
const DISPUTE_WINDOW_NS: u64 = 60 * 60 * 1_000_000_000;

/// Storage prefixes, one per collection.
#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Deals,
}

// ─── 2. Deal types ─────────────────────────────────────────────────────────
/// Where a deal is. Released, Refunded and Split are final.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum DealStatus {
    Proposed,
    Accepted,
    Delivered,
    Released,
    Refunded,
    Disputed,
    Split,
}

/// One deal between two companies.
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct Deal {
    pub buyer: AccountId,
    pub seller: AccountId,
    pub amount: NearToken,
    /// SHA-256 of the terms, which stay encrypted off-chain.
    pub terms_hash: Base58CryptoHash,
    /// Delivery deadline (ns).
    pub deliver_by: U64,
    pub status: DealStatus,
    /// Amounts paid in order; they add up to `amount`.
    pub milestones: Vec<NearToken>,
    /// How many milestones are paid.
    pub paid: u32,
    /// Last status change (ns).
    pub updated_at: U64,
    /// Open split offer in a dispute: who offered, and the seller's share.
    pub split_offer: Option<(AccountId, NearToken)>,
}

// ─── 3. Contract state ─────────────────────────────────────────────────────
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// Parent of every company account, and the registry contract we report to.
    registry: AccountId,
    deals: IterableMap<u64, Deal>,
    next_deal_id: u64,
}

// ─── 4. Public methods ─────────────────────────────────────────────────────
#[near]
impl Contract {
    #[init]
    pub fn new(registry: AccountId) -> Self {
        Self {
            registry,
            deals: IterableMap::new(StorageKey::Deals),
            next_deal_id: 0,
        }
    }

    /// The buyer company locks the attached NEAR for a deal with `seller`.
    #[payable]
    pub fn create_deal(
        &mut self,
        seller: AccountId,
        terms_hash: Base58CryptoHash,
        deliver_by: U64,
        milestones: Vec<NearToken>,
    ) -> U64 {
        let buyer = env::predecessor_account_id();
        require!(
            buyer.is_sub_account_of(&self.registry),
            "Only companies can do this"
        );
        require!(
            seller.is_sub_account_of(&self.registry),
            "Seller is not a company"
        );
        require!(seller != buyer, "Can't deal with yourself");
        let amount = env::attached_deposit();
        require!(amount >= MIN_DEAL, "Deal amount too small");
        require!(
            (1..=MAX_MILESTONES).contains(&milestones.len()),
            "1 to 10 milestones"
        );
        require!(
            milestones.iter().all(|m| !m.is_zero()),
            "Milestone amount must be above 0"
        );
        require!(
            Self::sum(&milestones) == amount,
            "Milestones must add up to the amount"
        );
        require!(
            deliver_by.0 > env::block_timestamp(),
            "Deadline must be in the future"
        );

        let id = self.next_deal_id;
        self.next_deal_id += 1;
        let deal = Deal {
            buyer,
            seller,
            amount,
            terms_hash,
            deliver_by,
            status: DealStatus::Proposed,
            milestones,
            paid: 0,
            updated_at: U64(env::block_timestamp()),
            split_offer: None,
        };
        self.deals.insert(id, deal);
        U64(id)
    }

    /// The seller accepts, proving it agreed to the same terms.
    pub fn accept_deal(&mut self, id: U64, terms_hash: Base58CryptoHash) {
        let deal = self.deal_mut(id);
        Self::assert_caller(&deal.seller, "Only the seller can do this");
        Self::assert_status(deal, DealStatus::Proposed);
        require!(deal.terms_hash == terms_hash, "Terms don't match");
        deal.status = DealStatus::Accepted;
    }

    /// The seller says the next milestone was delivered.
    pub fn mark_delivered(&mut self, id: U64) {
        let deal = self.deal_mut(id);
        Self::assert_caller(&deal.seller, "Only the seller can do this");
        Self::assert_status(deal, DealStatus::Accepted);
        deal.status = DealStatus::Delivered;
        deal.updated_at = U64(env::block_timestamp());
    }

    /// The buyer confirms delivery; the seller is paid the next milestone.
    pub fn confirm(&mut self, id: U64) -> Promise {
        let registry = self.registry.clone();
        let deal = self.deal_mut(id);
        Self::assert_caller(&deal.buyer, "Only the buyer can do this");
        Self::assert_status(deal, DealStatus::Delivered);
        Self::release_next(&registry, deal)
    }

    /// Anyone may pay the next milestone once the buyer let the review window pass.
    pub fn release_due(&mut self, id: U64) -> Promise {
        let registry = self.registry.clone();
        let deal = self.deal_mut(id);
        Self::assert_status(deal, DealStatus::Delivered);
        require!(
            env::block_timestamp() >= deal.updated_at.0.saturating_add(REVIEW_WINDOW_NS),
            "Review window not over"
        );
        Self::release_next(&registry, deal)
    }

    /// The buyer withdraws an offer the seller hasn't accepted yet.
    pub fn cancel(&mut self, id: U64) -> Promise {
        let deal = self.deal_mut(id);
        Self::assert_caller(&deal.buyer, "Only the buyer can do this");
        Self::assert_status(deal, DealStatus::Proposed);
        Self::refund(deal)
    }

    /// Anyone may refund the buyer once an undelivered deal is past its deadline.
    pub fn refund_expired(&mut self, id: U64) -> Promise {
        let deal = self.deal_mut(id);
        require!(
            matches!(deal.status, DealStatus::Proposed | DealStatus::Accepted),
            "Wrong status"
        );
        require!(env::block_timestamp() > deal.deliver_by.0, "Not expired");
        Self::refund(deal)
    }

    /// Either side freezes the deal; release and refunds stop until it's settled.
    pub fn dispute(&mut self, id: U64) {
        let deal = self.deal_mut(id);
        Self::assert_party(deal);
        require!(
            matches!(deal.status, DealStatus::Accepted | DealStatus::Delivered),
            "Wrong status"
        );
        deal.status = DealStatus::Disputed;
        deal.updated_at = U64(env::block_timestamp());
    }

    /// Offers to give the seller `seller_share` of what's left. Pays out once both sides offer the same.
    pub fn propose_split(&mut self, id: U64, seller_share: NearToken) {
        let registry = self.registry.clone();
        let deal = self.deal_mut(id);
        Self::assert_party(deal);
        Self::assert_status(deal, DealStatus::Disputed);
        let remaining = Self::remaining(deal);
        require!(seller_share <= remaining, "Split is more than what's left");

        let caller = env::predecessor_account_id();
        if let Some((by, share)) = &deal.split_offer
            && *by != caller
            && *share == seller_share
        {
            deal.status = DealStatus::Split;
            deal.updated_at = U64(env::block_timestamp());
            for (to, amount) in [
                (&deal.seller, seller_share),
                (&deal.buyer, remaining.saturating_sub(seller_share)),
            ] {
                if !amount.is_zero() {
                    Promise::new(to.clone()).transfer(amount).detach();
                }
            }
            // Whoever got at least half of what was left counts as the winner.
            let (seller, buyer) = if seller_share.saturating_mul(2) >= remaining {
                (Outcome::DisputeWon, Outcome::DisputeLost)
            } else {
                (Outcome::DisputeLost, Outcome::DisputeWon)
            };
            Self::report(&registry, deal, seller, buyer);
        } else {
            deal.split_offer = Some((caller, seller_share));
        }
    }

    /// Anyone may refund the buyer if a dispute wasn't settled in time.
    pub fn refund_on_timeout(&mut self, id: U64) -> Promise {
        let registry = self.registry.clone();
        let deal = self.deal_mut(id);
        Self::assert_status(deal, DealStatus::Disputed);
        require!(
            env::block_timestamp() >= deal.updated_at.0.saturating_add(DISPUTE_WINDOW_NS),
            "Dispute window not over"
        );
        Self::report(&registry, deal, Outcome::DisputeLost, Outcome::DisputeWon);
        Self::refund(deal)
    }

    // ── Views ──

    /// One deal.
    pub fn get_deal(&self, id: U64) -> Option<Deal> {
        self.deals.get(&id.0).cloned()
    }

    /// One page of deals.
    pub fn get_deals(&self, from_index: u32, limit: u32) -> Vec<(U64, Deal)> {
        self.deals
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(|(id, deal)| (U64(*id), deal.clone()))
            .collect()
    }
}

// ─── 5. Private helpers ────────────────────────────────────────────────────
impl Contract {
    /// The deal, or panics "No such deal".
    fn deal_mut(&mut self, id: U64) -> &mut Deal {
        self.deals
            .get_mut(&id.0)
            .unwrap_or_else(|| env::panic_str("No such deal"))
    }

    /// Panics unless the deal has this status.
    fn assert_status(deal: &Deal, status: DealStatus) {
        require!(deal.status == status, "Wrong status");
    }

    /// Pays the next milestone. Released if it was the last, else back to Accepted.
    /// When the last milestone is paid, reports the deal to the registry.
    fn release_next(registry: &AccountId, deal: &mut Deal) -> Promise {
        let amount = deal.milestones[deal.paid as usize];
        let delivered_at = deal.updated_at.0;
        deal.paid += 1;
        deal.status = if deal.paid as usize == deal.milestones.len() {
            DealStatus::Released
        } else {
            DealStatus::Accepted
        };
        deal.updated_at = U64(env::block_timestamp());
        if deal.status == DealStatus::Released {
            let seller = if delivered_at <= deal.deliver_by.0 {
                Outcome::OnTime
            } else {
                Outcome::Late
            };
            Self::report(registry, deal, seller, Outcome::OnTime);
        }
        Promise::new(deal.seller.clone()).transfer(amount)
    }

    /// Tells the registry how the deal went for each side. Fire and forget:
    /// the money is already settled, so a failed report loses only that update.
    fn report(registry: &AccountId, deal: &Deal, seller: Outcome, buyer: Outcome) {
        for (company, counterparty, outcome) in [
            (&deal.seller, &deal.buyer, seller),
            (&deal.buyer, &deal.seller, buyer),
        ] {
            ext_registry::ext(registry.clone())
                .with_static_gas(GAS_FOR_REPORT)
                .record_outcome(company.clone(), counterparty.clone(), outcome, deal.amount)
                .detach();
        }
    }

    /// Marks the deal Refunded and sends what's left back to the buyer.
    fn refund(deal: &mut Deal) -> Promise {
        deal.status = DealStatus::Refunded;
        deal.updated_at = U64(env::block_timestamp());
        Promise::new(deal.buyer.clone()).transfer(Self::remaining(deal))
    }

    /// What's still in escrow for this deal.
    fn remaining(deal: &Deal) -> NearToken {
        Self::sum(&deal.milestones[deal.paid as usize..])
    }

    fn sum(amounts: &[NearToken]) -> NearToken {
        amounts
            .iter()
            .fold(NearToken::from_near(0), |total, m| total.saturating_add(*m))
    }

    /// Panics unless the caller is the buyer or the seller.
    fn assert_party(deal: &Deal) {
        let caller = env::predecessor_account_id();
        require!(
            caller == deal.buyer || caller == deal.seller,
            "Only the buyer or seller can do this"
        );
    }

    /// Panics with `message` unless the caller is `account`.
    fn assert_caller(account: &AccountId, message: &str) {
        require!(env::predecessor_account_id() == *account, message);
    }
}

// ─── 6. Unit tests ─────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, get_created_receipts};
    use near_sdk::testing_env;

    const REGISTRY: &str = "bizzy-fy.testnet";
    const BUYER: &str = "buyer.bizzy-fy.testnet";
    const SELLER: &str = "seller.bizzy-fy.testnet";
    const DEADLINE: u64 = 1_000;

    fn account(id: &str) -> AccountId {
        id.parse().unwrap()
    }

    /// Fakes a call from `caller` with `deposit` at time `now` (like vm.prank + vm.warp).
    fn set_caller(caller: &str, deposit: NearToken, now: u64) {
        let context = VMContextBuilder::new()
            .current_account_id(account("escrow.bizzy-fy.testnet"))
            .predecessor_account_id(account(caller))
            .attached_deposit(deposit)
            .block_timestamp(now)
            .build();
        testing_env!(context);
    }

    fn setup() -> Contract {
        set_caller(REGISTRY, NearToken::from_near(0), 0);
        Contract::new(account(REGISTRY))
    }

    fn hash(byte: u8) -> Base58CryptoHash {
        [byte; 32].into()
    }

    /// `buyer` locks `millinear` for a one-milestone deal with `seller`, due at DEADLINE.
    fn create(contract: &mut Contract, buyer: &str, seller: &str, millinear: u128) -> U64 {
        create_with(contract, buyer, seller, millinear, &[millinear])
    }

    /// Like `create`, with these milestones (in millinear).
    fn create_with(
        contract: &mut Contract,
        buyer: &str,
        seller: &str,
        millinear: u128,
        milestones: &[u128],
    ) -> U64 {
        set_caller(buyer, NearToken::from_millinear(millinear), 0);
        let milestones = milestones
            .iter()
            .map(|m| NearToken::from_millinear(*m))
            .collect();
        contract.create_deal(account(seller), hash(1), U64(DEADLINE), milestones)
    }

    /// A 1 NEAR deal from BUYER to SELLER.
    fn proposed() -> (Contract, U64) {
        let mut contract = setup();
        let id = create(&mut contract, BUYER, SELLER, 1_000);
        (contract, id)
    }

    /// A deal the seller has accepted.
    fn accepted() -> (Contract, U64) {
        let (mut contract, id) = proposed();
        set_caller(SELLER, NearToken::from_near(0), 0);
        contract.accept_deal(id, hash(1));
        (contract, id)
    }

    /// A deal the seller has delivered.
    fn delivered() -> (Contract, U64) {
        let (mut contract, id) = accepted();
        set_caller(SELLER, NearToken::from_near(0), 0);
        contract.mark_delivered(id);
        (contract, id)
    }

    /// An accepted 1 NEAR deal paid in two halves.
    fn two_milestones() -> (Contract, U64) {
        let mut contract = setup();
        let id = create_with(&mut contract, BUYER, SELLER, 1_000, &[500, 500]);
        set_caller(SELLER, NearToken::from_near(0), 0);
        contract.accept_deal(id, hash(1));
        (contract, id)
    }

    /// The seller delivers the next milestone and the buyer confirms it.
    fn deliver_and_confirm(contract: &mut Contract, id: U64) {
        set_caller(SELLER, NearToken::from_near(0), 0);
        contract.mark_delivered(id);
        set_caller(BUYER, NearToken::from_near(0), 0);
        let _ = contract.confirm(id);
    }

    /// An accepted 1 NEAR deal the buyer has disputed at time 0.
    fn disputed() -> (Contract, U64) {
        let (mut contract, id) = accepted();
        set_caller(BUYER, NearToken::from_near(0), 0);
        contract.dispute(id);
        (contract, id)
    }

    /// `who` offers the seller `millinear`.
    fn propose(contract: &mut Contract, id: U64, who: &str, millinear: u128) {
        set_caller(who, NearToken::from_near(0), 0);
        contract.propose_split(id, NearToken::from_millinear(millinear));
    }

    /// How many calls the last method sent to the registry.
    fn reports() -> usize {
        get_created_receipts()
            .iter()
            .filter(|r| r.receiver_id == account(REGISTRY))
            .count()
    }

    fn status(contract: &Contract, id: U64) -> DealStatus {
        contract.get_deal(id).unwrap().status
    }

    /// Test 1: a company locks 1 NEAR for a deal.
    #[test]
    fn create_deal_works() {
        let (contract, id) = proposed();
        assert_eq!(id, U64(0));
        let deal = contract.get_deal(id).unwrap();
        assert_eq!(deal.status, DealStatus::Proposed);
        assert_eq!(deal.amount, NearToken::from_near(1));
        assert_eq!(deal.buyer, account(BUYER));
    }

    /// Test 2: only companies can create deals.
    #[test]
    #[should_panic(expected = "Only companies can do this")]
    fn non_company_cannot_create() {
        let mut contract = setup();
        create(&mut contract, "stranger.testnet", SELLER, 1_000);
    }

    /// Test 3: the seller must be a company.
    #[test]
    #[should_panic(expected = "Seller is not a company")]
    fn seller_must_be_company() {
        let mut contract = setup();
        create(&mut contract, BUYER, "stranger.testnet", 1_000);
    }

    /// Test 4: no deals with yourself.
    #[test]
    #[should_panic(expected = "Can't deal with yourself")]
    fn self_deal_fails() {
        let mut contract = setup();
        create(&mut contract, BUYER, BUYER, 1_000);
    }

    /// Test 5: deals under 0.1 NEAR are refused.
    #[test]
    #[should_panic(expected = "Deal amount too small")]
    fn tiny_deal_fails() {
        let mut contract = setup();
        create(&mut contract, BUYER, SELLER, 50);
    }

    /// Test 6: the deadline must be in the future.
    #[test]
    #[should_panic(expected = "Deadline must be in the future")]
    fn past_deadline_fails() {
        let mut contract = setup();
        set_caller(BUYER, NearToken::from_near(1), DEADLINE);
        contract.create_deal(
            account(SELLER),
            hash(1),
            U64(DEADLINE),
            vec![NearToken::from_near(1)],
        );
    }

    /// Test 7: the seller accepts with the same terms.
    #[test]
    fn seller_accepts() {
        let (mut contract, id) = proposed();
        set_caller(SELLER, NearToken::from_near(0), 0);
        contract.accept_deal(id, hash(1));
        assert_eq!(status(&contract, id), DealStatus::Accepted);
    }

    /// Test 8: different terms can't be accepted.
    #[test]
    #[should_panic(expected = "Terms don't match")]
    fn accept_with_other_terms_fails() {
        let (mut contract, id) = proposed();
        set_caller(SELLER, NearToken::from_near(0), 0);
        contract.accept_deal(id, hash(2));
    }

    /// Test 9: only the seller can accept.
    #[test]
    #[should_panic(expected = "Only the seller can do this")]
    fn stranger_cannot_accept() {
        let (mut contract, id) = proposed();
        set_caller(BUYER, NearToken::from_near(0), 0);
        contract.accept_deal(id, hash(1));
    }

    /// Test 10: accept → deliver → confirm releases the deal.
    #[test]
    fn full_path_releases() {
        let (mut contract, id) = delivered();
        set_caller(BUYER, NearToken::from_near(0), 0);
        let _ = contract.confirm(id);
        assert_eq!(status(&contract, id), DealStatus::Released);
    }

    /// Test 11: a second confirm can't pay twice.
    #[test]
    #[should_panic(expected = "Wrong status")]
    fn confirm_twice_fails() {
        let (mut contract, id) = delivered();
        set_caller(BUYER, NearToken::from_near(0), 0);
        let _ = contract.confirm(id);
        let _ = contract.confirm(id);
    }

    /// Test 12: no confirm before delivery.
    #[test]
    #[should_panic(expected = "Wrong status")]
    fn confirm_before_delivery_fails() {
        let (mut contract, id) = accepted();
        set_caller(BUYER, NearToken::from_near(0), 0);
        let _ = contract.confirm(id);
    }

    /// Test 13: the buyer cancels before the seller accepts.
    #[test]
    fn buyer_cancels_proposed() {
        let (mut contract, id) = proposed();
        set_caller(BUYER, NearToken::from_near(0), 0);
        let _ = contract.cancel(id);
        assert_eq!(status(&contract, id), DealStatus::Refunded);
    }

    /// Test 14: no cancel once the seller accepted.
    #[test]
    #[should_panic(expected = "Wrong status")]
    fn cancel_after_accept_fails() {
        let (mut contract, id) = accepted();
        set_caller(BUYER, NearToken::from_near(0), 0);
        let _ = contract.cancel(id);
    }

    /// Test 15: no refund before the deadline.
    #[test]
    #[should_panic(expected = "Not expired")]
    fn refund_before_deadline_fails() {
        let (mut contract, id) = accepted();
        set_caller("anyone.testnet", NearToken::from_near(0), DEADLINE);
        let _ = contract.refund_expired(id);
    }

    /// Test 16: anyone refunds an accepted deal after the deadline.
    #[test]
    fn refund_after_deadline_works() {
        let (mut contract, id) = accepted();
        set_caller("anyone.testnet", NearToken::from_near(0), DEADLINE + 1);
        let _ = contract.refund_expired(id);
        assert_eq!(status(&contract, id), DealStatus::Refunded);
    }

    /// Test 17: a delivered deal can't be refunded.
    #[test]
    #[should_panic(expected = "Wrong status")]
    fn refund_after_delivery_fails() {
        let (mut contract, id) = delivered();
        set_caller("anyone.testnet", NearToken::from_near(0), DEADLINE + 1);
        let _ = contract.refund_expired(id);
    }

    /// Test 18: paging returns the right slice.
    #[test]
    fn deals_paging() {
        let mut contract = setup();
        for _ in 0..3 {
            create(&mut contract, BUYER, SELLER, 1_000);
        }
        let page = contract.get_deals(1, 1);
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].0, U64(1));
        assert_eq!(contract.get_deals(2, 10).len(), 1);
    }

    /// Test 19: milestones must add up to the deposit.
    #[test]
    #[should_panic(expected = "Milestones must add up to the amount")]
    fn milestones_must_add_up() {
        let mut contract = setup();
        create_with(&mut contract, BUYER, SELLER, 1_000, &[400, 500]);
    }

    /// Test 20: at most 10 milestones.
    #[test]
    #[should_panic(expected = "1 to 10 milestones")]
    fn too_many_milestones_fail() {
        let mut contract = setup();
        create_with(&mut contract, BUYER, SELLER, 1_100, &[100; 11]);
    }

    /// Test 21: no zero milestones.
    #[test]
    #[should_panic(expected = "Milestone amount must be above 0")]
    fn zero_milestone_fails() {
        let mut contract = setup();
        create_with(&mut contract, BUYER, SELLER, 1_000, &[1_000, 0]);
    }

    /// Test 22: confirming the first of two milestones pays it and reopens the deal.
    #[test]
    fn first_milestone_paid() {
        let (mut contract, id) = two_milestones();
        deliver_and_confirm(&mut contract, id);
        let deal = contract.get_deal(id).unwrap();
        assert_eq!(deal.paid, 1);
        assert_eq!(deal.status, DealStatus::Accepted);
    }

    /// Test 23: confirming both milestones releases the deal.
    #[test]
    fn both_milestones_release() {
        let (mut contract, id) = two_milestones();
        deliver_and_confirm(&mut contract, id);
        deliver_and_confirm(&mut contract, id);
        assert_eq!(status(&contract, id), DealStatus::Released);
    }

    /// Test 24: no auto-release inside the review window.
    #[test]
    #[should_panic(expected = "Review window not over")]
    fn release_due_too_early_fails() {
        let (mut contract, id) = delivered();
        set_caller(
            "anyone.testnet",
            NearToken::from_near(0),
            REVIEW_WINDOW_NS - 1,
        );
        let _ = contract.release_due(id);
    }

    /// Test 25: anyone releases once the buyer let the window pass.
    #[test]
    fn release_due_after_window_works() {
        let (mut contract, id) = delivered();
        set_caller("anyone.testnet", NearToken::from_near(0), REVIEW_WINDOW_NS);
        let _ = contract.release_due(id);
        let deal = contract.get_deal(id).unwrap();
        assert_eq!(deal.paid, 1);
        assert_eq!(deal.status, DealStatus::Released);
    }

    /// Test 26: only the two sides can dispute.
    #[test]
    #[should_panic(expected = "Only the buyer or seller can do this")]
    fn stranger_cannot_dispute() {
        let (mut contract, id) = accepted();
        set_caller("anyone.testnet", NearToken::from_near(0), 0);
        contract.dispute(id);
    }

    /// Test 27: a dispute blocks auto-release.
    #[test]
    #[should_panic(expected = "Wrong status")]
    fn dispute_blocks_release() {
        let (mut contract, id) = delivered();
        set_caller(BUYER, NearToken::from_near(0), 0);
        contract.dispute(id);
        set_caller("anyone.testnet", NearToken::from_near(0), REVIEW_WINDOW_NS);
        let _ = contract.release_due(id);
    }

    /// Test 28: the same offer from both sides settles the split.
    #[test]
    fn matching_offers_split() {
        let (mut contract, id) = disputed();
        propose(&mut contract, id, BUYER, 600);
        propose(&mut contract, id, SELLER, 600);
        assert_eq!(status(&contract, id), DealStatus::Split);
    }

    /// Test 29: different offers don't settle; the latest is kept.
    #[test]
    fn different_offers_wait() {
        let (mut contract, id) = disputed();
        propose(&mut contract, id, BUYER, 400);
        propose(&mut contract, id, SELLER, 800);
        let deal = contract.get_deal(id).unwrap();
        assert_eq!(deal.status, DealStatus::Disputed);
        assert_eq!(
            deal.split_offer,
            Some((account(SELLER), NearToken::from_millinear(800)))
        );
    }

    /// Test 30: a split can't give more than what's left.
    #[test]
    #[should_panic(expected = "Split is more than what's left")]
    fn split_above_remaining_fails() {
        let (mut contract, id) = disputed();
        propose(&mut contract, id, BUYER, 1_001);
    }

    /// Test 31: no timeout refund inside the dispute window.
    #[test]
    #[should_panic(expected = "Dispute window not over")]
    fn timeout_too_early_fails() {
        let (mut contract, id) = disputed();
        set_caller(
            "anyone.testnet",
            NearToken::from_near(0),
            DISPUTE_WINDOW_NS - 1,
        );
        let _ = contract.refund_on_timeout(id);
    }

    /// Test 32: anyone refunds the buyer after the dispute window.
    #[test]
    fn timeout_refunds_buyer() {
        let (mut contract, id) = disputed();
        set_caller("anyone.testnet", NearToken::from_near(0), DISPUTE_WINDOW_NS);
        let _ = contract.refund_on_timeout(id);
        assert_eq!(status(&contract, id), DealStatus::Refunded);
    }

    /// Test 33: a released deal is reported for both sides.
    #[test]
    fn release_reports_both_sides() {
        let (mut contract, id) = delivered();
        set_caller(BUYER, NearToken::from_near(0), 0);
        let _ = contract.confirm(id);
        assert_eq!(reports(), 2);
    }

    /// Test 34: paying a milestone that isn't the last reports nothing yet.
    #[test]
    fn first_milestone_reports_nothing() {
        let (mut contract, id) = two_milestones();
        deliver_and_confirm(&mut contract, id);
        assert_eq!(reports(), 0);
    }

    /// Test 35: a dispute that times out is reported for both sides.
    #[test]
    fn timeout_reports_both_sides() {
        let (mut contract, id) = disputed();
        set_caller("anyone.testnet", NearToken::from_near(0), DISPUTE_WINDOW_NS);
        let _ = contract.refund_on_timeout(id);
        assert_eq!(reports(), 2);
    }
}
