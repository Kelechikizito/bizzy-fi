//! Bizzy-Fy policy contract: holds a company's funds and enforces its guardian's rules.

// ─── 1. Imports ────────────────────────────────────────────────────────────
use near_sdk::json_types::U64;
use near_sdk::{
    AccountId, NearToken, PanicOnDefault, Promise, assert_one_yocto, env, near, require,
};

// ─── 2. Status enum ────────────────────────────────────────────────────────
/// Whether the agent is allowed to act.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status {
    Active,
    Suspended,
}

// ─── 3. Limits struct ──────────────────────────────────────────────────────
/// The company's spending rules.
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct Limits {
    /// Most the agent may spend on one deal.
    pub per_deal_cap: NearToken,
    /// Most the agent may spend in one period.
    pub period_cap: NearToken,
    /// Length of a spending period, in nanoseconds.
    pub period_length_ns: U64,
}

// ─── 4. Contract state ─────────────────────────────────────────────────────
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// The accountable human.
    guardian: AccountId,
    /// The parent account that created this company.
    registry: AccountId,
    /// The escrow contract this company deals through.
    escrow: AccountId,
    limits: Limits,
    status: Status,
}

// ─── 5. Public methods (#[near] impl) ──────────────────────────────────────
#[near]
impl Contract {
    /// Sets up the policy. Only the parent account (the registry) may call it.
    #[init]
    pub fn new(guardian: AccountId, escrow: AccountId, limits: Limits) -> Self {
        let registry = env::predecessor_account_id();
        require!(
            env::current_account_id().is_sub_account_of(&registry),
            "Only the parent account can initialize"
        );
        Self::assert_valid_limits(&limits);

        Self {
            guardian,
            registry,
            escrow,
            limits,
            status: Status::Active,
        }
    }

    /// Changes the spending rules. Guardian only.
    #[payable]
    pub fn set_limits(&mut self, limits: Limits) {
        assert_one_yocto();
        self.assert_guardian();
        Self::assert_valid_limits(&limits);
        self.limits = limits;
    }

    /// Sends NEAR out of the company account. Guardian only.
    #[payable]
    pub fn withdraw(&mut self, amount: NearToken, to: AccountId) -> Promise {
        assert_one_yocto();
        self.assert_guardian();
        require!(!amount.is_zero(), "Amount must be above 0");
        require!(
            amount <= Self::available_balance(),
            "Not enough available balance"
        );
        Promise::new(to).transfer(amount)
    }

    // ── Views (read-only, free to call) ──

    /// The current spending rules.
    pub fn get_limits(&self) -> Limits {
        self.limits.clone()
    }

    /// Whether the agent may act.
    pub fn get_status(&self) -> Status {
        self.status
    }

    /// The accountable human.
    pub fn get_guardian(&self) -> AccountId {
        self.guardian.clone()
    }

    /// How much the guardian could withdraw right now.
    pub fn get_available_balance(&self) -> NearToken {
        Self::available_balance()
    }
}

// ─── 6. Private helpers (plain impl, no #[near]) ───────────────────────────
impl Contract {
    /// Panics unless the limits make sense.
    fn assert_valid_limits(limits: &Limits) {
        require!(
            !limits.per_deal_cap.is_zero(),
            "Per-deal cap must be above 0"
        );
        require!(
            limits.per_deal_cap <= limits.period_cap,
            "Per-deal cap can't exceed the period cap"
        );
        require!(
            limits.period_length_ns.0 > 0,
            "Period length must be above 0"
        );
    }

    /// Panics unless the caller is the guardian.
    fn assert_guardian(&self) {
        require!(
            env::predecessor_account_id() == self.guardian,
            "Only the guardian can do this"
        );
    }

    /// Balance minus the part locked to pay for storage.
    fn available_balance() -> NearToken {
        let locked = env::storage_byte_cost().saturating_mul(env::storage_usage() as u128);
        env::account_balance().saturating_sub(locked)
    }
}

// ─── 7. Unit tests ─────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const COMPANY: &str = "acme.bizzyfy.testnet";
    const REGISTRY: &str = "bizzyfy.testnet";
    const GUARDIAN: &str = "guardian.testnet";
    const ESCROW: &str = "escrow.bizzyfy.testnet";
    const ONE_WEEK_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;

    /// Turns a string into an AccountId.
    fn account(id: &str) -> AccountId {
        id.parse().unwrap()
    }

    /// Fakes a call from `caller` to the company account (like vm.prank).
    fn set_caller(caller: &str) {
        set_caller_with_deposit(caller, NearToken::from_yoctonear(0));
    }

    /// Fakes a call from `caller` with NEAR attached (like vm.prank + msg.value).
    fn set_caller_with_deposit(caller: &str, deposit: NearToken) {
        let mut context = VMContextBuilder::new();
        context
            .current_account_id(account(COMPANY))
            .predecessor_account_id(account(caller))
            .attached_deposit(deposit)
            .account_balance(NearToken::from_near(10));
        testing_env!(context.build());
    }

    /// A policy created by the registry, ready to use.
    fn setup() -> Contract {
        set_caller(REGISTRY);
        Contract::new(account(GUARDIAN), account(ESCROW), limits(5, 20))
    }

    fn one_yocto() -> NearToken {
        NearToken::from_yoctonear(1)
    }

    /// Limits with caps in whole NEAR and a one-week period.
    fn limits(per_deal: u128, period: u128) -> Limits {
        Limits {
            per_deal_cap: NearToken::from_near(per_deal),
            period_cap: NearToken::from_near(period),
            period_length_ns: U64(ONE_WEEK_NS),
        }
    }

    /// Test 1: the registry sets up the policy.
    #[test]
    fn new_by_parent_works() {
        set_caller(REGISTRY);
        let contract = Contract::new(account(GUARDIAN), account(ESCROW), limits(5, 20));

        assert_eq!(contract.guardian, account(GUARDIAN));
        assert_eq!(contract.registry, account(REGISTRY));
        assert_eq!(contract.escrow, account(ESCROW));
        assert_eq!(contract.limits, limits(5, 20));
        assert_eq!(contract.status, Status::Active);
    }

    /// Test 2: a stranger can't make themselves guardian.
    #[test]
    #[should_panic(expected = "Only the parent account can initialize")]
    fn new_by_stranger_fails() {
        set_caller("stranger.testnet");
        Contract::new(account("stranger.testnet"), account(ESCROW), limits(5, 20));
    }

    /// Test 3: per-deal cap above the period cap is rejected.
    #[test]
    #[should_panic(expected = "Per-deal cap can't exceed the period cap")]
    fn new_with_per_deal_above_period_fails() {
        set_caller(REGISTRY);
        Contract::new(account(GUARDIAN), account(ESCROW), limits(30, 20));
    }

    /// Test 4: the guardian changes the limits.
    #[test]
    fn guardian_sets_limits() {
        let mut contract = setup();
        set_caller_with_deposit(GUARDIAN, one_yocto());
        contract.set_limits(limits(8, 40));

        assert_eq!(contract.limits, limits(8, 40));
    }

    /// Test 5: a stranger can't change the limits.
    #[test]
    #[should_panic(expected = "Only the guardian can do this")]
    fn stranger_cannot_set_limits() {
        let mut contract = setup();
        set_caller_with_deposit("stranger.testnet", one_yocto());
        contract.set_limits(limits(8, 40));
    }

    /// Test 6: without 1 yoctoNEAR, even the guardian is refused.
    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn set_limits_without_one_yocto_fails() {
        let mut contract = setup();
        set_caller(GUARDIAN);
        contract.set_limits(limits(8, 40));
    }

    /// Test 7: the guardian withdraws part of the balance (10 NEAR in tests).
    #[test]
    fn guardian_withdraws() {
        let mut contract = setup();
        set_caller_with_deposit(GUARDIAN, one_yocto());
        let _ = contract.withdraw(NearToken::from_near(2), account(GUARDIAN));
    }

    /// Test 8: can't withdraw more than is available.
    #[test]
    #[should_panic(expected = "Not enough available balance")]
    fn withdraw_more_than_available_fails() {
        let mut contract = setup();
        set_caller_with_deposit(GUARDIAN, one_yocto());
        let _ = contract.withdraw(NearToken::from_near(10), account(GUARDIAN));
    }

    /// Test 9: withdrawing 0 is refused.
    #[test]
    #[should_panic(expected = "Amount must be above 0")]
    fn withdraw_zero_fails() {
        let mut contract = setup();
        set_caller_with_deposit(GUARDIAN, one_yocto());
        let _ = contract.withdraw(NearToken::from_near(0), account(GUARDIAN));
    }

    /// Test 10: a stranger can't withdraw.
    #[test]
    #[should_panic(expected = "Only the guardian can do this")]
    fn stranger_cannot_withdraw() {
        let mut contract = setup();
        set_caller_with_deposit("stranger.testnet", one_yocto());
        let _ = contract.withdraw(NearToken::from_near(2), account("stranger.testnet"));
    }

    /// Test 11: views return the stored values; part of the balance is locked for storage.
    #[test]
    fn views_return_state() {
        let contract = setup();

        assert_eq!(contract.get_limits(), limits(5, 20));
        assert_eq!(contract.get_status(), Status::Active);
        assert_eq!(contract.get_guardian(), account(GUARDIAN));

        let available = contract.get_available_balance();
        assert!(available < NearToken::from_near(10));
        assert!(!available.is_zero());
    }
}
