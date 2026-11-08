//! Bizzy-Fy policy contract: holds a company's funds and enforces its guardian's rules.

// ─── 1. Imports ────────────────────────────────────────────────────────────
use bizzy_types::{DealRequest, Limits, ext_escrow};
use near_sdk::json_types::{Base58CryptoHash, U64};
use near_sdk::serde_json::Value;
use near_sdk::store::{IterableMap, LookupSet};
use near_sdk::{
    AccountId, Allowance, BorshStorageKey, CryptoHash, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue, PublicKey, assert_one_yocto, env, near, require,
};

/// Most spends that may wait for the guardian at once.
const MAX_PENDING: u32 = 20;
/// The only methods the agent's key may call.
const AGENT_METHODS: &str = "open_deal,deal_action";
/// Escrow actions the agent may take through `deal_action`.
const AGENT_DEAL_METHODS: [&str; 4] = ["accept_deal", "mark_delivered", "confirm", "cancel"];
/// Escrow actions the guardian may take: the agent's, plus disputes and splits.
const GUARDIAN_DEAL_METHODS: [&str; 6] = [
    "accept_deal",
    "mark_delivered",
    "confirm",
    "cancel",
    "dispute",
    "propose_split",
];
/// Gas the agent's key may burn.
const AGENT_GAS_ALLOWANCE: NearToken = NearToken::from_near(1);
/// Wait after a freeze before unfreezing (1 hour, short enough to demo).
const COOLDOWN_NS: u64 = 60 * 60 * 1_000_000_000;
const GAS_FOR_ESCROW: Gas = Gas::from_tgas(20);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);
/// Enough for the escrow to pay out and report to the registry.
const GAS_FOR_DEAL_ACTION: Gas = Gas::from_tgas(50);

/// Storage prefixes, one per collection.
#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Allowlist,
    Approvals,
}

// ─── 2. Status enum ────────────────────────────────────────────────────────
/// Whether the agent is allowed to act.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status {
    Active,
    Suspended,
}

// ─── 3. Approval types (Limits lives in the shared `bizzy-types` crate) ──────
/// A deal over the caps, waiting for the guardian.
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct PendingApproval {
    pub deal: DealRequest,
    pub amount: NearToken,
    pub created_at: U64,
}

/// What happened to a deal the agent asked for.
#[near(serializers = [json])]
#[derive(PartialEq, Debug)]
pub enum SpendDecision {
    /// The escrow holds the money.
    Opened { deal_id: U64 },
    /// Over a cap: waiting for the guardian.
    NeedsApproval { id: U64 },
    /// The escrow refused; the money and the spent total are back.
    Failed,
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
    /// Hashes of allowed counterparties (names stay private).
    allowlist: LookupSet<CryptoHash>,
    /// When the current period began (ns).
    period_start: u64,
    spent_this_period: NearToken,
    /// Spends waiting for the guardian.
    approvals: IterableMap<u64, PendingApproval>,
    next_approval_id: u64,
    /// The agent's current key (None = no agent).
    agent_key: Option<PublicKey>,
    /// When unfreeze becomes allowed (ns).
    unfreeze_at: u64,
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
            allowlist: LookupSet::new(StorageKey::Allowlist),
            period_start: env::block_timestamp(),
            spent_this_period: NearToken::from_yoctonear(0),
            approvals: IterableMap::new(StorageKey::Approvals),
            next_approval_id: 0,
            agent_key: None,
            unfreeze_at: 0,
        }
    }

    /// The agent asks to open a deal. Within the caps it goes to the escrow;
    /// over a cap it waits for the guardian.
    pub fn open_deal(&mut self, deal: DealRequest) -> PromiseOrValue<SpendDecision> {
        self.assert_agent();
        let amount = deal
            .milestones
            .iter()
            .fold(NearToken::from_near(0), |total, m| total.saturating_add(*m));
        require!(!amount.is_zero(), "Amount must be above 0");
        require!(
            deal.seller != env::current_account_id(),
            "Can't pay yourself"
        );
        self.roll_period();

        // Checks 1 and 2 refuse outright.
        require!(self.status == Status::Active, "Agent is not active");
        require!(
            !self.limits.allowlist_only
                || self.allowlist.contains(&Self::hash_account(&deal.seller)),
            "Counterparty is not allowed"
        );

        // Checks 3 and 4 send the spend to the guardian instead.
        let within_deal = amount <= self.limits.per_deal_cap;
        let left = self
            .limits
            .period_cap
            .saturating_sub(self.spent_this_period);
        if within_deal && amount <= left {
            return PromiseOrValue::Promise(self.start_deal(deal, amount));
        }

        require!(
            self.approvals.len() < MAX_PENDING,
            "Too many pending approvals"
        );
        let id = self.next_approval_id;
        self.next_approval_id += 1;
        self.approvals.insert(
            id,
            PendingApproval {
                deal,
                amount,
                created_at: U64(env::block_timestamp()),
            },
        );
        PromiseOrValue::Value(SpendDecision::NeedsApproval { id: U64(id) })
    }

    /// Learns whether the escrow opened the deal; if not, takes the amount off this period.
    #[private]
    pub fn on_deal_opened(
        &mut self,
        amount: NearToken,
        period_start: U64,
        #[callback_result] result: Result<U64, PromiseError>,
    ) -> SpendDecision {
        match result {
            Ok(deal_id) => SpendDecision::Opened { deal_id },
            Err(_) => {
                // Same period only: a new period already started from 0.
                if period_start.0 == self.period_start {
                    self.spent_this_period = self.spent_this_period.saturating_sub(amount);
                }
                SpendDecision::Failed
            }
        }
    }

    /// Forwards a deal action to the escrow, which sees this company as the caller.
    /// The agent may use AGENT_DEAL_METHODS; the guardian (1 yocto) GUARDIAN_DEAL_METHODS.
    #[payable]
    pub fn deal_action(&mut self, method: String, args: Value) -> Promise {
        let caller = env::predecessor_account_id();
        let allowed = if caller == env::current_account_id() {
            self.status == Status::Active && AGENT_DEAL_METHODS.contains(&method.as_str())
        } else if caller == self.guardian {
            assert_one_yocto();
            GUARDIAN_DEAL_METHODS.contains(&method.as_str())
        } else {
            false
        };
        require!(allowed, "Not allowed");
        Promise::new(self.escrow.clone()).function_call(
            method,
            args.to_string().into_bytes(),
            NearToken::from_yoctonear(0),
            GAS_FOR_DEAL_ACTION,
        )
    }

    /// Adds a counterparty hash to the allowlist. Guardian only.
    #[payable]
    pub fn allow_counterparty(&mut self, hash: Base58CryptoHash) {
        assert_one_yocto();
        self.assert_guardian();
        self.allowlist.insert(CryptoHash::from(hash));
    }

    /// Removes a counterparty hash from the allowlist. Guardian only.
    #[payable]
    pub fn remove_counterparty(&mut self, hash: Base58CryptoHash) {
        assert_one_yocto();
        self.assert_guardian();
        self.allowlist.remove(&CryptoHash::from(hash));
    }

    /// Gives the agent a key that can only call AGENT_METHODS; replaces any old key. Guardian only.
    #[payable]
    pub fn set_agent_key(&mut self, public_key: PublicKey) -> Promise {
        assert_one_yocto();
        self.assert_guardian();
        require!(self.status == Status::Active, "Agent is frozen");
        let me = env::current_account_id();
        let mut promise = Promise::new(me.clone());
        if let Some(old) = self.agent_key.replace(public_key.clone()) {
            promise = promise.delete_key(old);
        }
        promise.add_access_key_allowance(
            public_key,
            Allowance::limited(AGENT_GAS_ALLOWANCE).unwrap(),
            me,
            AGENT_METHODS,
        )
    }

    /// Stops the agent at once: deletes its key and starts the cooldown. Guardian only.
    #[payable]
    pub fn freeze(&mut self) {
        assert_one_yocto();
        self.assert_guardian();
        if let Some(key) = self.agent_key.take() {
            Promise::new(env::current_account_id())
                .delete_key(key)
                .detach();
        }
        self.status = Status::Suspended;
        self.unfreeze_at = env::block_timestamp().saturating_add(COOLDOWN_NS);
    }

    /// Lets the agent act again after the cooldown. Guardian only.
    #[payable]
    pub fn unfreeze(&mut self) {
        assert_one_yocto();
        self.assert_guardian();
        require!(self.status == Status::Suspended, "Agent is not frozen");
        require!(
            env::block_timestamp() >= self.unfreeze_at,
            "Cooldown not over"
        );
        self.status = Status::Active;
    }

    /// Approves a pending deal, even past the caps, and opens it. Guardian only.
    #[payable]
    pub fn approve(&mut self, id: U64) -> Promise {
        assert_one_yocto();
        self.assert_guardian();
        let approval = self
            .approvals
            .remove(&id.0)
            .unwrap_or_else(|| env::panic_str("No such approval"));
        self.roll_period();
        self.start_deal(approval.deal, approval.amount)
    }

    /// Rejects a pending spend. Guardian only.
    #[payable]
    pub fn reject(&mut self, id: U64) {
        assert_one_yocto();
        self.assert_guardian();
        require!(self.approvals.remove(&id.0).is_some(), "No such approval");
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

    /// The agent's current key.
    pub fn get_agent_key(&self) -> Option<PublicKey> {
        self.agent_key.clone()
    }

    /// When the guardian may unfreeze (ns).
    pub fn get_unfreeze_at(&self) -> U64 {
        U64(self.unfreeze_at)
    }

    /// The accountable human.
    pub fn get_guardian(&self) -> AccountId {
        self.guardian.clone()
    }

    /// How much the guardian could withdraw right now.
    pub fn get_available_balance(&self) -> NearToken {
        Self::available_balance()
    }

    /// Spent so far this period (0 if the period has ended).
    pub fn get_spent_this_period(&self) -> NearToken {
        if self.period_ended() {
            NearToken::from_yoctonear(0)
        } else {
            self.spent_this_period
        }
    }

    /// One page of spends waiting for the guardian.
    pub fn get_pending_approvals(
        &self,
        from_index: u32,
        limit: u32,
    ) -> Vec<(U64, PendingApproval)> {
        self.approvals
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(|(id, approval)| (U64(*id), approval.clone()))
            .collect()
    }

    /// Whether a counterparty hash is on the allowlist.
    pub fn is_allowed(&self, hash: Base58CryptoHash) -> bool {
        self.allowlist.contains(&CryptoHash::from(hash))
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

    /// Panics unless the caller is the agent (its key lives on this account).
    fn assert_agent(&self) {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Only the agent can do this"
        );
    }

    /// SHA-256 of an account ID, so the allowlist never stores names.
    fn hash_account(account: &AccountId) -> CryptoHash {
        env::sha256_array(account.as_bytes())
    }

    /// True once the current period is over.
    fn period_ended(&self) -> bool {
        env::block_timestamp()
            >= self
                .period_start
                .saturating_add(self.limits.period_length_ns.0)
    }

    /// Starts a new period if the old one is over.
    fn roll_period(&mut self) {
        if self.period_ended() {
            self.period_start = env::block_timestamp();
            self.spent_this_period = NearToken::from_yoctonear(0);
        }
    }

    /// Counts `amount` this period and sends it to the escrow for `deal`, with a callback.
    fn start_deal(&mut self, deal: DealRequest, amount: NearToken) -> Promise {
        require!(amount <= Self::available_balance(), "Not enough balance");
        self.spent_this_period = self.spent_this_period.saturating_add(amount);
        ext_escrow::ext(self.escrow.clone())
            .with_attached_deposit(amount)
            .with_static_gas(GAS_FOR_ESCROW)
            .create_deal(
                deal.seller,
                deal.terms_hash,
                deal.deliver_by,
                deal.milestones,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_deal_opened(amount, U64(self.period_start)),
            )
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
    use proptest::prelude::*;

    const COMPANY: &str = "acme.bizzyfy.testnet";
    const REGISTRY: &str = "bizzyfy.testnet";
    const GUARDIAN: &str = "guardian.testnet";
    const ESCROW: &str = "escrow.bizzyfy.testnet";
    const ONE_WEEK_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
    const SELLER: &str = "beta.bizzyfy.testnet";

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
        set_caller_at(caller, deposit, 0);
    }

    /// Fakes a call at a given time in ns (like vm.prank + vm.warp).
    fn set_caller_at(caller: &str, deposit: NearToken, timestamp: u64) {
        let mut context = VMContextBuilder::new();
        context
            .current_account_id(account(COMPANY))
            .predecessor_account_id(account(caller))
            .attached_deposit(deposit)
            .block_timestamp(timestamp)
            .account_balance(NearToken::from_near(100));
        testing_env!(context.build());
    }

    fn near(amount: u128) -> NearToken {
        NearToken::from_near(amount)
    }

    /// What an agent's deal request did, for asserts.
    #[derive(PartialEq, Debug)]
    enum Spend {
        /// Sent to the escrow (a Promise).
        Opened,
        /// Waiting for the guardian.
        Pending(U64),
    }

    /// A one-milestone deal of `amount` NEAR with SELLER.
    fn deal(amount: u128) -> DealRequest {
        DealRequest {
            seller: account(SELLER),
            terms_hash: [1; 32].into(),
            deliver_by: U64(1),
            milestones: vec![near(amount)],
        }
    }

    /// The agent asks for a deal of `amount` NEAR with SELLER.
    fn agent_spends(contract: &mut Contract, amount: u128) -> Spend {
        set_caller(COMPANY);
        match contract.open_deal(deal(amount)) {
            PromiseOrValue::Promise(_) => Spend::Opened,
            PromiseOrValue::Value(SpendDecision::NeedsApproval { id }) => Spend::Pending(id),
            PromiseOrValue::Value(other) => panic!("unexpected {other:?}"),
        }
    }

    /// Runs the deal callback as the contract itself.
    fn callback(
        contract: &mut Contract,
        amount: u128,
        period_start: u64,
        result: Result<U64, PromiseError>,
    ) -> SpendDecision {
        set_caller(COMPANY);
        contract.on_deal_opened(near(amount), U64(period_start), result)
    }

    /// Fills the queue with one spend over the per-deal cap; returns its id.
    fn pending_spend(contract: &mut Contract) -> U64 {
        match agent_spends(contract, 6) {
            Spend::Pending(id) => id,
            other => panic!("expected NeedsApproval, got {other:?}"),
        }
    }

    /// The hash the app would send for SELLER.
    fn seller_hash() -> Base58CryptoHash {
        Contract::hash_account(&account(SELLER)).into()
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
            allowlist_only: false,
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
        let _ = contract.withdraw(NearToken::from_near(100), account(GUARDIAN));
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
        assert!(available < NearToken::from_near(100));
        assert!(!available.is_zero());
    }

    /// Test 12: a spend within both caps is approved and counted.
    #[test]
    fn spend_within_caps_is_approved() {
        let mut contract = setup();
        assert_eq!(agent_spends(&mut contract, 3), Spend::Opened);
        assert_eq!(contract.get_spent_this_period(), near(3));
    }

    /// Test 13: only the agent can ask to spend.
    #[test]
    #[should_panic(expected = "Only the agent can do this")]
    fn stranger_cannot_open_deal() {
        let mut contract = setup();
        set_caller("stranger.testnet");
        let _ = contract.open_deal(deal(3));
    }

    /// Test 14: spending 0 is refused.
    #[test]
    #[should_panic(expected = "Amount must be above 0")]
    fn spend_zero_fails() {
        let mut contract = setup();
        agent_spends(&mut contract, 0);
    }

    /// Test 15: a suspended agent can't spend.
    #[test]
    #[should_panic(expected = "Agent is not active")]
    fn suspended_agent_cannot_spend() {
        let mut contract = setup();
        contract.status = Status::Suspended;
        agent_spends(&mut contract, 3);
    }

    /// Test 16: with allowlist_only, an unknown counterparty is refused.
    #[test]
    #[should_panic(expected = "Counterparty is not allowed")]
    fn unlisted_counterparty_fails() {
        let mut contract = setup();
        contract.limits.allowlist_only = true;
        agent_spends(&mut contract, 3);
    }

    /// Test 17: with allowlist_only, a counterparty the guardian allowed is fine.
    #[test]
    fn allowed_counterparty_is_approved() {
        let mut contract = setup();
        contract.limits.allowlist_only = true;
        set_caller_with_deposit(GUARDIAN, one_yocto());
        contract.allow_counterparty(seller_hash());
        assert!(contract.is_allowed(seller_hash()));

        assert_eq!(agent_spends(&mut contract, 3), Spend::Opened);
    }

    /// Test 18: over the per-deal cap goes to the guardian; nothing counted.
    #[test]
    fn over_per_deal_cap_needs_approval() {
        let mut contract = setup();
        assert_eq!(agent_spends(&mut contract, 6), Spend::Pending(U64(0)));
        assert!(contract.get_spent_this_period().is_zero());
    }

    /// Test 19: spends that together pass the period cap; the last one waits.
    #[test]
    fn over_period_cap_needs_approval() {
        let mut contract = setup();
        for _ in 0..4 {
            assert_eq!(agent_spends(&mut contract, 5), Spend::Opened);
        }
        assert_eq!(agent_spends(&mut contract, 1), Spend::Pending(U64(0)));
        assert_eq!(contract.get_spent_this_period(), near(20));
    }

    /// Test 20: once a period passes, the agent can spend again.
    #[test]
    fn period_rolls_over() {
        let mut contract = setup();
        for _ in 0..4 {
            agent_spends(&mut contract, 5);
        }
        set_caller_at(COMPANY, NearToken::from_yoctonear(0), ONE_WEEK_NS);
        assert!(contract.get_spent_this_period().is_zero());
        assert!(matches!(
            contract.open_deal(deal(5)),
            PromiseOrValue::Promise(_)
        ));
        assert_eq!(contract.get_spent_this_period(), near(5));
    }

    /// Test 21: the guardian approves; the spend is counted.
    #[test]
    fn guardian_approves() {
        let mut contract = setup();
        let id = pending_spend(&mut contract);
        set_caller_with_deposit(GUARDIAN, one_yocto());
        let _ = contract.approve(id);

        assert!(contract.get_pending_approvals(0, 10).is_empty());
        assert_eq!(contract.get_spent_this_period(), near(6));
    }

    /// Test 22: the guardian rejects; nothing is counted.
    #[test]
    fn guardian_rejects() {
        let mut contract = setup();
        let id = pending_spend(&mut contract);
        set_caller_with_deposit(GUARDIAN, one_yocto());
        contract.reject(id);

        assert!(contract.get_pending_approvals(0, 10).is_empty());
        assert!(contract.get_spent_this_period().is_zero());
    }

    /// Test 23: a stranger can't approve.
    #[test]
    #[should_panic(expected = "Only the guardian can do this")]
    fn stranger_cannot_approve() {
        let mut contract = setup();
        let id = pending_spend(&mut contract);
        set_caller_with_deposit("stranger.testnet", one_yocto());
        let _ = contract.approve(id);
    }

    /// Test 24: approving an unknown id fails.
    #[test]
    #[should_panic(expected = "No such approval")]
    fn approve_unknown_id_fails() {
        let mut contract = setup();
        set_caller_with_deposit(GUARDIAN, one_yocto());
        let _ = contract.approve(U64(7));
    }

    /// Test 25: the 21st pending approval is refused.
    #[test]
    #[should_panic(expected = "Too many pending approvals")]
    fn too_many_pending_fails() {
        let mut contract = setup();
        for _ in 0..MAX_PENDING {
            pending_spend(&mut contract);
        }
        pending_spend(&mut contract);
    }

    /// Test 26: paging returns the right slice.
    #[test]
    fn pending_approvals_paging() {
        let mut contract = setup();
        for _ in 0..5 {
            pending_spend(&mut contract);
        }
        let page = contract.get_pending_approvals(1, 2);
        let ids: Vec<u64> = page.iter().map(|(id, _)| id.0).collect();
        assert_eq!(ids, vec![1, 2]);
        assert_eq!(page[0].1.amount, near(6));
        assert_eq!(contract.get_pending_approvals(4, 10).len(), 1);
        assert!(contract.get_pending_approvals(5, 10).is_empty());
    }

    fn agent_key() -> PublicKey {
        "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
            .parse()
            .unwrap()
    }

    /// Test 27: the guardian gives the agent a key.
    #[test]
    fn guardian_sets_agent_key() {
        let mut contract = setup();
        set_caller_with_deposit(GUARDIAN, one_yocto());
        let _ = contract.set_agent_key(agent_key());
        assert_eq!(contract.get_agent_key(), Some(agent_key()));
    }

    /// Test 28: a stranger can't set the agent key.
    #[test]
    #[should_panic(expected = "Only the guardian can do this")]
    fn stranger_cannot_set_agent_key() {
        let mut contract = setup();
        set_caller_with_deposit("stranger.testnet", one_yocto());
        let _ = contract.set_agent_key(agent_key());
    }

    /// Test 29: no new key while the agent is frozen.
    #[test]
    #[should_panic(expected = "Agent is frozen")]
    fn set_agent_key_while_frozen_fails() {
        let mut contract = setup();
        contract.status = Status::Suspended;
        set_caller_with_deposit(GUARDIAN, one_yocto());
        let _ = contract.set_agent_key(agent_key());
    }

    /// Freezes the policy as the guardian at time 0.
    fn freeze(contract: &mut Contract) {
        set_caller_with_deposit(GUARDIAN, one_yocto());
        contract.freeze();
    }

    /// Test 30: freeze removes the key, suspends, and starts the cooldown.
    #[test]
    fn guardian_freezes() {
        let mut contract = setup();
        set_caller_with_deposit(GUARDIAN, one_yocto());
        let _ = contract.set_agent_key(agent_key());
        freeze(&mut contract);

        assert_eq!(contract.get_status(), Status::Suspended);
        assert_eq!(contract.get_agent_key(), None);
        assert_eq!(contract.get_unfreeze_at(), U64(COOLDOWN_NS));
    }

    /// Test 31: a stranger can't freeze.
    #[test]
    #[should_panic(expected = "Only the guardian can do this")]
    fn stranger_cannot_freeze() {
        let mut contract = setup();
        set_caller_with_deposit("stranger.testnet", one_yocto());
        contract.freeze();
    }

    /// Test 32: a frozen agent can't spend.
    #[test]
    #[should_panic(expected = "Agent is not active")]
    fn agent_cannot_spend_after_freeze() {
        let mut contract = setup();
        freeze(&mut contract);
        agent_spends(&mut contract, 3);
    }

    /// Test 33: unfreeze before the cooldown fails.
    #[test]
    #[should_panic(expected = "Cooldown not over")]
    fn unfreeze_before_cooldown_fails() {
        let mut contract = setup();
        freeze(&mut contract);
        set_caller_at(GUARDIAN, one_yocto(), COOLDOWN_NS - 1);
        contract.unfreeze();
    }

    /// Test 34: unfreeze after the cooldown makes the agent active.
    #[test]
    fn unfreeze_after_cooldown_works() {
        let mut contract = setup();
        freeze(&mut contract);
        set_caller_at(GUARDIAN, one_yocto(), COOLDOWN_NS);
        contract.unfreeze();
        assert_eq!(contract.get_status(), Status::Active);
    }

    /// Test 35: unfreeze when not frozen fails.
    #[test]
    #[should_panic(expected = "Agent is not frozen")]
    fn unfreeze_when_active_fails() {
        let mut contract = setup();
        set_caller_with_deposit(GUARDIAN, one_yocto());
        contract.unfreeze();
    }

    /// Test 36: a pending approval keeps the whole deal, so approve opens that exact deal.
    #[test]
    fn pending_approval_keeps_deal() {
        let mut contract = setup();
        let id = pending_spend(&mut contract);
        let (_, approval) = contract.get_pending_approvals(0, 1).remove(0);
        assert_eq!(approval.deal, deal(6));
        assert_eq!(approval.amount, near(6));
        assert_eq!(id, U64(0));
    }

    /// Test 37: the agent can't open a deal bigger than the balance.
    #[test]
    #[should_panic(expected = "Not enough balance")]
    fn deal_above_balance_fails() {
        let mut contract = setup();
        contract.limits = limits(200, 400);
        agent_spends(&mut contract, 150);
    }

    /// Test 38: the escrow opened the deal; the spent total stays.
    #[test]
    fn callback_ok_opens() {
        let mut contract = setup();
        agent_spends(&mut contract, 3);
        assert_eq!(
            callback(&mut contract, 3, 0, Ok(U64(5))),
            SpendDecision::Opened { deal_id: U64(5) }
        );
        assert_eq!(contract.get_spent_this_period(), near(3));
    }

    /// Test 39: the escrow refused; the spent total goes back down.
    #[test]
    fn callback_err_undoes_spend() {
        let mut contract = setup();
        agent_spends(&mut contract, 3);
        assert_eq!(
            callback(&mut contract, 3, 0, Err(PromiseError::Failed)),
            SpendDecision::Failed
        );
        assert!(contract.get_spent_this_period().is_zero());
    }

    /// Test 40: a refusal from an old period doesn't touch the new period's total.
    #[test]
    fn callback_err_after_roll_keeps_new_period() {
        let mut contract = setup();
        agent_spends(&mut contract, 3);
        set_caller_at(COMPANY, NearToken::from_yoctonear(0), ONE_WEEK_NS);
        let _ = contract.open_deal(deal(2));
        assert_eq!(
            callback(&mut contract, 3, 0, Err(PromiseError::Failed)),
            SpendDecision::Failed
        );
        assert_eq!(contract.spent_this_period, near(2));
    }

    /// Runs `deal_action(method)` as `caller` with `deposit`.
    fn act(contract: &mut Contract, caller: &str, deposit: NearToken, method: &str) -> Promise {
        set_caller_with_deposit(caller, deposit);
        contract.deal_action(method.into(), near_sdk::serde_json::json!({ "id": "0" }))
    }

    /// Test 41: the agent confirms a delivery through the policy.
    #[test]
    fn agent_confirms() {
        let mut contract = setup();
        let _ = act(
            &mut contract,
            COMPANY,
            NearToken::from_yoctonear(0),
            "confirm",
        );
    }

    /// Test 42: the agent can't start a dispute.
    #[test]
    #[should_panic(expected = "Not allowed")]
    fn agent_cannot_dispute() {
        let mut contract = setup();
        let _ = act(
            &mut contract,
            COMPANY,
            NearToken::from_yoctonear(0),
            "dispute",
        );
    }

    /// Test 43: the guardian disputes with 1 yocto.
    #[test]
    fn guardian_disputes() {
        let mut contract = setup();
        let _ = act(&mut contract, GUARDIAN, one_yocto(), "dispute");
    }

    /// Test 44: a stranger can't act on deals.
    #[test]
    #[should_panic(expected = "Not allowed")]
    fn stranger_cannot_act() {
        let mut contract = setup();
        let _ = act(&mut contract, "stranger.testnet", one_yocto(), "confirm");
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(32))]

        /// P1: within one period, spent never passes the period cap.
        #[test]
        fn never_spends_past_period_cap(amounts in prop::collection::vec(1u128..=10, 0..20)) {
            let mut contract = setup();
            for amount in amounts {
                agent_spends(&mut contract, amount);
                prop_assert!(contract.spent_this_period <= contract.limits.period_cap);
            }
        }

        /// P2: every approved spend is within the per-deal cap.
        #[test]
        fn approved_spends_within_per_deal_cap(amounts in prop::collection::vec(1u128..=10, 0..20)) {
            let mut contract = setup();
            for amount in amounts {
                if agent_spends(&mut contract, amount) == Spend::Opened {
                    prop_assert!(near(amount) <= contract.limits.per_deal_cap);
                }
            }
        }
    }
}
