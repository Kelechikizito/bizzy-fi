//! Bizzy-Fy escrow: holds a deal's NEAR until it is released to the seller or refunded.

// ─── 1. Imports ────────────────────────────────────────────────────────────
use near_sdk::json_types::{Base58CryptoHash, U64};
use near_sdk::store::IterableMap;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, env, near, require,
};

/// Smallest deal: each deal costs storage, so tiny spam deals are refused.
const MIN_DEAL: NearToken = NearToken::from_millinear(100);

/// Storage prefixes, one per collection.
#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Deals,
}

// ─── 2. Deal types ─────────────────────────────────────────────────────────
/// Where a deal is. Released and Refunded are final.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum DealStatus {
    Proposed,
    Accepted,
    Delivered,
    Released,
    Refunded,
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
}

// ─── 3. Contract state ─────────────────────────────────────────────────────
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// Parent of every company account.
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

    /// The seller says the goods or service were delivered.
    pub fn mark_delivered(&mut self, id: U64) {
        let deal = self.deal_mut(id);
        Self::assert_caller(&deal.seller, "Only the seller can do this");
        Self::assert_status(deal, DealStatus::Accepted);
        deal.status = DealStatus::Delivered;
    }

    /// The buyer confirms delivery; the seller is paid.
    pub fn confirm(&mut self, id: U64) -> Promise {
        let deal = self.deal_mut(id);
        Self::assert_caller(&deal.buyer, "Only the buyer can do this");
        Self::assert_status(deal, DealStatus::Delivered);
        deal.status = DealStatus::Released;
        Promise::new(deal.seller.clone()).transfer(deal.amount)
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

    /// Marks the deal Refunded and sends the money back to the buyer.
    fn refund(deal: &mut Deal) -> Promise {
        deal.status = DealStatus::Refunded;
        Promise::new(deal.buyer.clone()).transfer(deal.amount)
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
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const REGISTRY: &str = "bizzyfy.testnet";
    const BUYER: &str = "buyer.bizzyfy.testnet";
    const SELLER: &str = "seller.bizzyfy.testnet";
    const DEADLINE: u64 = 1_000;

    fn account(id: &str) -> AccountId {
        id.parse().unwrap()
    }

    /// Fakes a call from `caller` with `deposit` at time `now` (like vm.prank + vm.warp).
    fn set_caller(caller: &str, deposit: NearToken, now: u64) {
        let context = VMContextBuilder::new()
            .current_account_id(account("escrow.bizzyfy.testnet"))
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

    /// `buyer` locks `millinear` for a deal with `seller`, due at DEADLINE.
    fn create(contract: &mut Contract, buyer: &str, seller: &str, millinear: u128) -> U64 {
        set_caller(buyer, NearToken::from_millinear(millinear), 0);
        contract.create_deal(account(seller), hash(1), U64(DEADLINE))
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
        contract.create_deal(account(SELLER), hash(1), U64(DEADLINE));
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
}
