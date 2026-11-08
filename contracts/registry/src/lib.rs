//! Bizzy-Fy registry: creates company accounts and keeps the company directory.

// ─── 1. Imports ────────────────────────────────────────────────────────────
use near_sdk::json_types::{Base58CryptoHash, U64};
use near_sdk::serde_json::{Value, json};
use near_sdk::store::{IterableMap, LazyOption, LookupMap, LookupSet};
use near_sdk::{
    AccountId, BorshStorageKey, CryptoHash, Gas, NearToken, PanicOnDefault, Promise, env, near,
    require,
};

/// Least NEAR to attach: ~1.7 for the policy code, the rest is the starting treasury.
const MIN_DEPOSIT: NearToken = NearToken::from_near(3);
const GAS_FOR_INIT: Gas = Gas::from_tgas(30);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(15);
/// Most companies one World ID human may verify (sybil resistance).
const MAX_COMPANIES_PER_HUMAN: u32 = 3;

/// Storage prefixes, one per collection.
#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    PolicyCode,
    Companies,
    Humans,
    SeenPairs,
}

/// How a deal ended for one side, as reported by the escrow.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Outcome {
    OnTime,
    Late,
    DisputeWon,
    DisputeLost,
}

/// Counts written only by the escrow contract.
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug, Default)]
pub struct Reputation {
    pub on_time: u32,
    pub late: u32,
    pub disputes_won: u32,
    pub disputes_lost: u32,
    /// Distinct companies dealt with.
    pub counterparties: u32,
    pub volume: NearToken,
}

/// A fact the attester checked off-chain.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum AttestationKind {
    /// World ID; the hash is the nullifier.
    Human,
    /// KYB passed (labeled mock for the hackathon).
    Kyb,
    /// The hash is the operating agreement's.
    Agreement,
}

// ─── 2. Company record ─────────────────────────────────────────────────────
/// A company in the directory.
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct Company {
    pub guardian: AccountId,
    /// Public one-liner, max 280 chars (fits an X post).
    pub about: String,
    pub referrer: Option<AccountId>,
    pub created_at: U64,
    pub human: bool,
    pub kyb: bool,
    pub agreement_hash: Option<Base58CryptoHash>,
    /// Companies created with this one as referrer.
    pub referrals: u32,
    pub reputation: Reputation,
}

// ─── 3. Contract state ─────────────────────────────────────────────────────
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// May upload the policy code.
    owner: AccountId,
    /// Passed to every new policy.
    escrow: AccountId,
    /// Our backend: checks World ID and KYB off-chain, then attests.
    attester: AccountId,
    /// The policy wasm, loaded only when a company is created.
    policy_code: LazyOption<Vec<u8>>,
    /// The directory, keyed by company account.
    companies: IterableMap<AccountId, Company>,
    /// Companies verified per World ID nullifier.
    humans: LookupMap<CryptoHash, u32>,
    /// Hashes of company–counterparty pairs already counted.
    seen_pairs: LookupSet<CryptoHash>,
}

// ─── 4. Public methods ─────────────────────────────────────────────────────
#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, escrow: AccountId, attester: AccountId) -> Self {
        Self {
            owner,
            escrow,
            attester,
            policy_code: LazyOption::new(StorageKey::PolicyCode, None),
            companies: IterableMap::new(StorageKey::Companies),
            humans: LookupMap::new(StorageKey::Humans),
            seen_pairs: LookupSet::new(StorageKey::SeenPairs),
        }
    }

    /// Stores the policy wasm, sent as the raw call input. Owner only.
    pub fn set_policy_code(&mut self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only the owner can do this"
        );
        self.policy_code.set(Some(env::input().expect("No code")));
    }

    /// Creates `<name>.<registry>` with the policy on it and the caller as guardian.
    /// The account gets no full-access key. Refunds the deposit if creation fails.
    #[payable]
    pub fn create_company(
        &mut self,
        name: String,
        about: String,
        referrer: Option<AccountId>,
        limits: Value,
    ) -> Promise {
        let code = self
            .policy_code
            .get()
            .clone()
            .unwrap_or_else(|| env::panic_str("No policy code yet"));
        let deposit = env::attached_deposit();
        require!(deposit >= MIN_DEPOSIT, "Attach at least 3 NEAR");
        require!(
            (2..=32).contains(&name.len())
                && name
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'),
            "Invalid name"
        );
        let company: AccountId = format!("{name}.{}", env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("Invalid name"));
        require!(!self.companies.contains_key(&company), "Name taken");
        require!(about.len() <= 280, "About is too long");
        if let Some(referrer) = &referrer {
            require!(self.companies.contains_key(referrer), "Unknown referrer");
        }

        let guardian = env::predecessor_account_id();
        let args = json!({ "guardian": guardian, "escrow": self.escrow, "limits": limits });
        Promise::new(company.clone())
            .create_account()
            .transfer(deposit)
            .deploy_contract(code)
            .function_call(
                "new",
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_FOR_INIT,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_company_created(company, guardian, about, referrer, deposit),
            )
    }

    /// Saves the record if creation worked; otherwise refunds the guardian.
    #[private]
    pub fn on_company_created(
        &mut self,
        company: AccountId,
        guardian: AccountId,
        about: String,
        referrer: Option<AccountId>,
        deposit: NearToken,
    ) -> bool {
        let created = near_sdk::is_promise_success();
        if created {
            if let Some(r) = referrer.as_ref().and_then(|r| self.companies.get_mut(r)) {
                r.referrals += 1;
            }
            let record = Self::new_company(guardian, about, referrer, env::block_timestamp());
            self.companies.insert(company, record);
        } else {
            Promise::new(guardian).transfer(deposit).detach();
        }
        created
    }

    /// Records a fact our backend checked off-chain. Attester only.
    pub fn attest(&mut self, company: AccountId, kind: AttestationKind, hash: Base58CryptoHash) {
        require!(
            env::predecessor_account_id() == self.attester,
            "Only the attester can do this"
        );
        let record = self
            .companies
            .get_mut(&company)
            .unwrap_or_else(|| env::panic_str("Unknown company"));
        match kind {
            AttestationKind::Human => {
                require!(!record.human, "Already verified");
                let nullifier = CryptoHash::from(hash);
                let uses = self.humans.get(&nullifier).copied().unwrap_or(0);
                require!(
                    uses < MAX_COMPANIES_PER_HUMAN,
                    "Too many companies for this human"
                );
                self.humans.insert(nullifier, uses + 1);
                record.human = true;
            }
            AttestationKind::Kyb => record.kyb = true,
            AttestationKind::Agreement => record.agreement_hash = Some(hash),
        }
    }

    /// Counts how a deal ended for `company`. Escrow only.
    pub fn record_outcome(
        &mut self,
        company: AccountId,
        counterparty: AccountId,
        outcome: Outcome,
        amount: NearToken,
    ) {
        require!(
            env::predecessor_account_id() == self.escrow,
            "Only the escrow can do this"
        );
        let rep = &mut self
            .companies
            .get_mut(&company)
            .unwrap_or_else(|| env::panic_str("Unknown company"))
            .reputation;
        match outcome {
            Outcome::OnTime => rep.on_time += 1,
            Outcome::Late => rep.late += 1,
            Outcome::DisputeWon => rep.disputes_won += 1,
            Outcome::DisputeLost => rep.disputes_lost += 1,
        }
        if matches!(outcome, Outcome::OnTime | Outcome::Late) {
            rep.volume = rep.volume.saturating_add(amount);
            let pair = env::sha256_array(format!("{company}:{counterparty}").as_bytes());
            if self.seen_pairs.insert(pair) {
                rep.counterparties += 1;
            }
        }
    }

    // ── Views ──

    /// 10 × on time + 5 × late + 3 × counterparties − 20 × disputes lost (min 0).
    pub fn get_score(&self, account_id: AccountId) -> u32 {
        self.companies.get(&account_id).map_or(0, |c| {
            let r = &c.reputation;
            (10 * r.on_time + 5 * r.late + 3 * r.counterparties)
                .saturating_sub(20 * r.disputes_lost)
        })
    }

    /// Quests done (0–4): human, KYB, first deal, referred a company.
    pub fn get_tier(&self, account_id: AccountId) -> u8 {
        self.companies.get(&account_id).map_or(0, |c| {
            let first_deal = c.reputation.on_time + c.reputation.late > 0;
            [c.human, c.kyb, first_deal, c.referrals > 0]
                .iter()
                .filter(|done| **done)
                .count() as u8
        })
    }

    /// One company's record.
    pub fn get_company(&self, account_id: AccountId) -> Option<Company> {
        self.companies.get(&account_id).cloned()
    }

    /// One page of the directory.
    pub fn get_companies(&self, from_index: u32, limit: u32) -> Vec<(AccountId, Company)> {
        self.companies
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(|(id, company)| (id.clone(), company.clone()))
            .collect()
    }
}

// ─── 5. Private helpers ────────────────────────────────────────────────────
impl Contract {
    /// A fresh record: nothing verified, no history.
    fn new_company(
        guardian: AccountId,
        about: String,
        referrer: Option<AccountId>,
        created_at: u64,
    ) -> Company {
        Company {
            guardian,
            about,
            referrer,
            created_at: U64(created_at),
            human: false,
            kyb: false,
            agreement_hash: None,
            referrals: 0,
            reputation: Reputation::default(),
        }
    }
}

// ─── 6. Unit tests ─────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{PromiseResult, RuntimeFeesConfig, VMContext, test_vm_config, testing_env};
    use std::panic::{AssertUnwindSafe, catch_unwind};

    const REGISTRY: &str = "bizzyfy.testnet";
    const OWNER: &str = "owner.testnet";
    const ESCROW: &str = "escrow.bizzyfy.testnet";
    const ATTESTER: &str = "attester.testnet";

    fn account(id: &str) -> AccountId {
        id.parse().unwrap()
    }

    const GUARDIAN: &str = "guardian.testnet";

    fn context(caller: &str, deposit: NearToken) -> VMContext {
        VMContextBuilder::new()
            .current_account_id(account(REGISTRY))
            .predecessor_account_id(account(caller))
            .attached_deposit(deposit)
            .build()
    }

    /// Fakes a call from `caller` with raw `input` (like vm.prank).
    fn set_caller_with_input(caller: &str, input: Vec<u8>) {
        let mut context = context(caller, NearToken::from_near(0));
        context.input = input.into();
        testing_env!(context);
    }

    /// Fakes the registry calling its own callback after `result`.
    fn set_callback_result(result: PromiseResult) {
        testing_env!(
            context(REGISTRY, NearToken::from_near(0)),
            test_vm_config(),
            RuntimeFeesConfig::test(),
            Default::default(),
            vec![result],
        );
    }

    /// A registry with policy code uploaded.
    fn ready() -> Contract {
        let mut contract = setup();
        set_caller_with_input(OWNER, vec![1, 2, 3]);
        contract.set_policy_code();
        contract
    }

    /// The guardian creates `name` with `deposit` NEAR.
    fn create(
        contract: &mut Contract,
        name: &str,
        deposit: u128,
        about: &str,
        referrer: Option<&str>,
    ) {
        testing_env!(context(GUARDIAN, NearToken::from_near(deposit)));
        let _ =
            contract.create_company(name.into(), about.into(), referrer.map(account), json!({}));
    }

    /// Puts a company straight into the directory.
    fn add_company(contract: &mut Contract, name: &str) {
        let record = Contract::new_company(account(GUARDIAN), String::new(), None, 0);
        contract.companies.insert(company_id(name), record);
    }

    fn company_id(name: &str) -> AccountId {
        account(&format!("{name}.{REGISTRY}"))
    }

    /// Runs the callback for `acme` with a faked result.
    fn callback(contract: &mut Contract, result: PromiseResult, referrer: Option<&str>) -> bool {
        set_callback_result(result);
        contract.on_company_created(
            company_id("acme"),
            account(GUARDIAN),
            "We sell chairs".into(),
            referrer.map(company_id),
            NearToken::from_near(3),
        )
    }

    /// The attester attests `kind` for `name`, with a hash made of `byte`.
    fn attest(contract: &mut Contract, name: &str, kind: AttestationKind, byte: u8) {
        set_caller_with_input(ATTESTER, vec![]);
        contract.attest(company_id(name), kind, [byte; 32].into());
    }

    /// The escrow reports `outcome` for `name` against `counterparty`.
    fn report(contract: &mut Contract, name: &str, counterparty: &str, outcome: Outcome) {
        set_caller_with_input(ESCROW, vec![]);
        contract.record_outcome(
            company_id(name),
            company_id(counterparty),
            outcome,
            NearToken::from_near(2),
        );
    }

    fn company(contract: &Contract, name: &str) -> Company {
        contract.get_company(company_id(name)).unwrap()
    }

    fn setup() -> Contract {
        set_caller_with_input(OWNER, vec![]);
        Contract::new(account(OWNER), account(ESCROW), account(ATTESTER))
    }

    /// Test 1: new stores owner and escrow, with an empty directory.
    #[test]
    fn new_works() {
        let contract = setup();
        assert_eq!(contract.owner, account(OWNER));
        assert_eq!(contract.escrow, account(ESCROW));
        assert!(contract.policy_code.get().is_none());
        assert!(contract.get_companies(0, 10).is_empty());
    }

    /// Test 2: the owner uploads the policy code.
    #[test]
    fn owner_sets_policy_code() {
        let mut contract = setup();
        set_caller_with_input(OWNER, vec![1, 2, 3]);
        contract.set_policy_code();
        assert_eq!(contract.policy_code.get(), &Some(vec![1, 2, 3]));
    }

    /// Test 3: a stranger can't upload code.
    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn stranger_cannot_set_policy_code() {
        let mut contract = setup();
        set_caller_with_input("stranger.testnet", vec![1, 2, 3]);
        contract.set_policy_code();
    }

    /// Test 4: no code uploaded yet.
    #[test]
    #[should_panic(expected = "No policy code yet")]
    fn create_without_code_fails() {
        let mut contract = setup();
        create(&mut contract, "acme", 3, "", None);
    }

    /// Test 5: less than 3 NEAR attached.
    #[test]
    #[should_panic(expected = "Attach at least 3 NEAR")]
    fn create_with_small_deposit_fails() {
        let mut contract = ready();
        create(&mut contract, "acme", 2, "", None);
    }

    /// Test 6: every bad name is refused.
    #[test]
    fn bad_names_fail() {
        let mut contract = ready();
        for name in ["a", "Acme", "ac.me", "ac_me", "-acme", &"a".repeat(33)] {
            let result = catch_unwind(AssertUnwindSafe(|| {
                create(&mut contract, name, 3, "", None)
            }));
            assert!(result.is_err(), "{name} was accepted");
        }
    }

    /// Test 7: a name already in the directory.
    #[test]
    #[should_panic(expected = "Name taken")]
    fn taken_name_fails() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        create(&mut contract, "acme", 3, "", None);
    }

    /// Test 8: about longer than 280 chars.
    #[test]
    #[should_panic(expected = "About is too long")]
    fn long_about_fails() {
        let mut contract = ready();
        create(&mut contract, "acme", 3, &"x".repeat(281), None);
    }

    /// Test 9: a referrer that isn't a company.
    #[test]
    #[should_panic(expected = "Unknown referrer")]
    fn unknown_referrer_fails() {
        let mut contract = ready();
        create(&mut contract, "acme", 3, "", Some("nobody.testnet"));
    }

    /// Test 10: a valid call goes through (the Promise itself runs only on chain).
    #[test]
    fn valid_create_works() {
        let mut contract = ready();
        add_company(&mut contract, "beta");
        let beta = company_id("beta").to_string();
        create(&mut contract, "acme", 3, "We sell chairs", Some(&beta));
    }

    /// Test 11: the callback saves the record when creation worked.
    #[test]
    fn callback_success_saves_record() {
        let mut contract = ready();
        assert!(callback(
            &mut contract,
            PromiseResult::Successful(vec![]),
            None
        ));
        let record = contract.get_company(company_id("acme")).unwrap();
        assert_eq!(record.guardian, account(GUARDIAN));
        assert_eq!(record.about, "We sell chairs");
    }

    /// Test 12: the callback saves nothing when creation failed.
    #[test]
    fn callback_failure_saves_nothing() {
        let mut contract = ready();
        assert!(!callback(&mut contract, PromiseResult::Failed, None));
        assert!(contract.get_company(company_id("acme")).is_none());
    }

    /// Test 13: paging returns the right slice.
    #[test]
    fn companies_paging() {
        let mut contract = ready();
        for name in ["aa", "bb", "cc"] {
            add_company(&mut contract, name);
        }
        let page = contract.get_companies(1, 1);
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].0, company_id("bb"));
        assert_eq!(contract.get_companies(2, 10).len(), 1);
    }

    /// Test 14: the attester verifies a human.
    #[test]
    fn attester_attests_human() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        attest(&mut contract, "acme", AttestationKind::Human, 1);
        assert!(company(&contract, "acme").human);
    }

    /// Test 15: only the attester can attest.
    #[test]
    #[should_panic(expected = "Only the attester can do this")]
    fn stranger_cannot_attest() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        set_caller_with_input("stranger.testnet", vec![]);
        contract.attest(company_id("acme"), AttestationKind::Kyb, [1; 32].into());
    }

    /// Test 16: unknown companies can't be attested.
    #[test]
    #[should_panic(expected = "Unknown company")]
    fn attest_unknown_company_fails() {
        let mut contract = ready();
        attest(&mut contract, "acme", AttestationKind::Kyb, 1);
    }

    /// Test 17: a company is verified human only once.
    #[test]
    #[should_panic(expected = "Already verified")]
    fn human_twice_fails() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        attest(&mut contract, "acme", AttestationKind::Human, 1);
        attest(&mut contract, "acme", AttestationKind::Human, 2);
    }

    /// Test 18: one human verifies at most 3 companies.
    #[test]
    #[should_panic(expected = "Too many companies for this human")]
    fn fourth_company_per_human_fails() {
        let mut contract = ready();
        for name in ["aa", "bb", "cc", "dd"] {
            add_company(&mut contract, name);
            attest(&mut contract, name, AttestationKind::Human, 7);
        }
    }

    /// Test 19: KYB and agreement hash are stored.
    #[test]
    fn kyb_and_agreement_stored() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        attest(&mut contract, "acme", AttestationKind::Kyb, 1);
        attest(&mut contract, "acme", AttestationKind::Agreement, 9);
        let record = company(&contract, "acme");
        assert!(record.kyb);
        assert_eq!(record.agreement_hash, Some([9; 32].into()));
    }

    /// Test 20: an on-time deal is counted with its volume and counterparty.
    #[test]
    fn escrow_records_on_time() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        report(&mut contract, "acme", "beta", Outcome::OnTime);
        let rep = company(&contract, "acme").reputation;
        assert_eq!(rep.on_time, 1);
        assert_eq!(rep.volume, NearToken::from_near(2));
        assert_eq!(rep.counterparties, 1);
    }

    /// Test 21: the same counterparty counts once.
    #[test]
    fn same_counterparty_counts_once() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        report(&mut contract, "acme", "beta", Outcome::OnTime);
        report(&mut contract, "acme", "beta", Outcome::OnTime);
        assert_eq!(company(&contract, "acme").reputation.counterparties, 1);
    }

    /// Test 22: only the escrow can record outcomes.
    #[test]
    #[should_panic(expected = "Only the escrow can do this")]
    fn stranger_cannot_record_outcome() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        set_caller_with_input("stranger.testnet", vec![]);
        contract.record_outcome(
            company_id("acme"),
            company_id("beta"),
            Outcome::OnTime,
            NearToken::from_near(2),
        );
    }

    /// Test 23: 10·2 + 5·1 + 3·2 − 20·1 = 11.
    #[test]
    fn score_follows_formula() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        report(&mut contract, "acme", "beta", Outcome::OnTime);
        report(&mut contract, "acme", "gamma", Outcome::OnTime);
        report(&mut contract, "acme", "beta", Outcome::Late);
        report(&mut contract, "acme", "beta", Outcome::DisputeLost);
        assert_eq!(contract.get_score(company_id("acme")), 11);
    }

    /// Test 24: the score stops at 0.
    #[test]
    fn score_never_below_zero() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        report(&mut contract, "acme", "beta", Outcome::DisputeLost);
        assert_eq!(contract.get_score(company_id("acme")), 0);
    }

    /// Test 25: all four quests give tier 4.
    #[test]
    fn tier_counts_quests() {
        let mut contract = ready();
        add_company(&mut contract, "acme");
        assert_eq!(contract.get_tier(company_id("acme")), 0);
        attest(&mut contract, "acme", AttestationKind::Human, 1);
        attest(&mut contract, "acme", AttestationKind::Kyb, 1);
        report(&mut contract, "acme", "beta", Outcome::OnTime);
        contract
            .companies
            .get_mut(&company_id("acme"))
            .unwrap()
            .referrals = 1;
        assert_eq!(contract.get_tier(company_id("acme")), 4);
    }

    /// Test 26: a successful creation counts for the referrer.
    #[test]
    fn callback_counts_referral() {
        let mut contract = ready();
        add_company(&mut contract, "beta");
        callback(
            &mut contract,
            PromiseResult::Successful(vec![]),
            Some("beta"),
        );
        assert_eq!(company(&contract, "beta").referrals, 1);
    }
}
