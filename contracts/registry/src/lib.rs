//! Bizzy-Fy registry: creates company accounts and keeps the company directory.

// ─── 1. Imports ────────────────────────────────────────────────────────────
use near_sdk::json_types::U64;
use near_sdk::serde_json::{Value, json};
use near_sdk::store::{IterableMap, LazyOption};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, env, near, require,
};

/// Least NEAR to attach: ~1.7 for the policy code, the rest is the starting treasury.
const MIN_DEPOSIT: NearToken = NearToken::from_near(3);
const GAS_FOR_INIT: Gas = Gas::from_tgas(30);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(15);

/// Storage prefixes, one per collection.
#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    PolicyCode,
    Companies,
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
}

// ─── 3. Contract state ─────────────────────────────────────────────────────
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// May upload the policy code.
    owner: AccountId,
    /// Passed to every new policy.
    escrow: AccountId,
    /// The policy wasm, loaded only when a company is created.
    policy_code: LazyOption<Vec<u8>>,
    /// The directory, keyed by company account.
    companies: IterableMap<AccountId, Company>,
}

// ─── 4. Public methods ─────────────────────────────────────────────────────
#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, escrow: AccountId) -> Self {
        Self {
            owner,
            escrow,
            policy_code: LazyOption::new(StorageKey::PolicyCode, None),
            companies: IterableMap::new(StorageKey::Companies),
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
            let record = Company {
                guardian,
                about,
                referrer,
                created_at: U64(env::block_timestamp()),
            };
            self.companies.insert(company, record);
        } else {
            Promise::new(guardian).transfer(deposit).detach();
        }
        created
    }

    // ── Views ──

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

// ─── 5. Unit tests ─────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{PromiseResult, RuntimeFeesConfig, VMContext, test_vm_config, testing_env};
    use std::panic::{AssertUnwindSafe, catch_unwind};

    const REGISTRY: &str = "bizzyfy.testnet";
    const OWNER: &str = "owner.testnet";
    const ESCROW: &str = "escrow.bizzyfy.testnet";

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
        let record = Company {
            guardian: account(GUARDIAN),
            about: String::new(),
            referrer: None,
            created_at: U64(0),
        };
        contract.companies.insert(company_id(name), record);
    }

    fn company_id(name: &str) -> AccountId {
        account(&format!("{name}.{REGISTRY}"))
    }

    /// Runs the callback for `acme` with a faked result.
    fn callback(contract: &mut Contract, result: PromiseResult) -> bool {
        set_callback_result(result);
        contract.on_company_created(
            company_id("acme"),
            account(GUARDIAN),
            "We sell chairs".into(),
            None,
            NearToken::from_near(3),
        )
    }

    fn setup() -> Contract {
        set_caller_with_input(OWNER, vec![]);
        Contract::new(account(OWNER), account(ESCROW))
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
        assert!(callback(&mut contract, PromiseResult::Successful(vec![])));
        let record = contract.get_company(company_id("acme")).unwrap();
        assert_eq!(record.guardian, account(GUARDIAN));
        assert_eq!(record.about, "We sell chairs");
    }

    /// Test 12: the callback saves nothing when creation failed.
    #[test]
    fn callback_failure_saves_nothing() {
        let mut contract = ready();
        assert!(!callback(&mut contract, PromiseResult::Failed));
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
}
