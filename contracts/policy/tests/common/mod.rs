//! Shared setup for the end-to-end sandbox tests: all three contracts deployed on a
//! local NEAR node, plus helpers to create companies and act as agents and guardians.

use near_api::errors::ExecuteTransactionError;
use near_api::types::transaction::result::TransactionResult;
use near_api::{
    AccountId, Contract, NearGas, NearToken, NetworkConfig, Signer, Tokens, signer,
    types::CryptoHash,
};
use near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY;
use near_sdk::serde_json::{Value, json};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

pub type Sent = Result<TransactionResult, ExecuteTransactionError>;
pub const YOCTO: NearToken = NearToken::from_yoctonear(1);
pub const ZERO: NearToken = NearToken::from_yoctonear(0);
pub const TERMS: &str = "11111111111111111111111111111111";

pub fn near(n: u128) -> NearToken {
    NearToken::from_near(n)
}

/// A company: its account, its human guardian, and its agent's limited key.
pub struct Company {
    pub account: AccountId,
    pub guardian: AccountId,
    pub agent: Arc<Signer>,
}

pub struct World {
    pub sandbox: near_sandbox::Sandbox,
    pub net: NetworkConfig,
    pub root: Arc<Signer>,
    pub registry: AccountId,
    pub escrow: AccountId,
}

impl World {
    /// Builds and deploys the registry and escrow, and uploads the policy as shared code.
    pub async fn start() -> testresult::TestResult<Self> {
        let build = |path: &str| -> testresult::TestResult<Vec<u8>> {
            let opts = cargo_near_build::BuildOpts::builder()
                .manifest_path(path)
                .build();
            Ok(std::fs::read(cargo_near_build::build_with_cli(opts)?)?)
        };
        let (policy_wasm, registry_wasm, escrow_wasm) = (
            build("Cargo.toml")?,
            build("../registry/Cargo.toml")?,
            build("../escrow/Cargo.toml")?,
        );
        let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
        let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
        let root = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
        let (registry, escrow): (AccountId, AccountId) =
            ("registry.sandbox".parse()?, "escrow.sandbox".parse()?);
        let world = Self {
            sandbox,
            net,
            root,
            registry,
            escrow,
        };
        world.fund(&world.registry).await?;
        world.fund(&world.escrow).await?;

        for (account, wasm, init) in [
            (
                &world.registry,
                registry_wasm,
                json!({ "owner": world.registry, "escrow": world.escrow, "attester": world.registry }),
            ),
            (
                &world.escrow,
                escrow_wasm,
                json!({ "registry": world.registry }),
            ),
        ] {
            Contract::deploy(account.clone())
                .use_code(wasm)
                .with_init_call("new", init)?
                .with_signer(world.root.clone())
                .send_to(&world.net)
                .await?
                .assert_success();
        }
        let hash = CryptoHash::hash(&policy_wasm).to_string();
        Contract::deploy_global_contract_code(policy_wasm)
            .as_hash()
            .with_signer(world.registry.clone(), world.root.clone())
            .send_to(&world.net)
            .await?
            .assert_success();
        let (registry, root) = (world.registry.clone(), world.root.clone());
        world
            .call(
                &registry,
                &registry,
                &root,
                "set_policy_hash",
                json!({ "hash": hash }),
                ZERO,
            )
            .await?
            .assert_success();
        Ok(world)
    }

    /// Creates a sandbox account with 50 NEAR.
    async fn fund(&self, account: &AccountId) -> testresult::TestResult {
        self.sandbox
            .create_account(account.clone())
            .initial_balance(near(50))
            .send()
            .await?;
        Ok(())
    }

    /// Creates `<name>.registry.sandbox` with `deposit` NEAR, then gives its agent a key.
    pub async fn company(
        &self,
        name: &str,
        deposit: u128,
        referrer: Option<&Company>,
        limits: Value,
    ) -> testresult::TestResult<Company> {
        let guardian: AccountId = format!("{name}-guardian.sandbox").parse()?;
        self.fund(&guardian).await?;
        let args = json!({ "name": name, "about": "", "referrer": referrer.map(|r| &r.account), "limits": limits });
        self.call(
            &self.registry,
            &guardian,
            &self.root,
            "create_company",
            args,
            near(deposit),
        )
        .await?
        .assert_success();
        let account: AccountId = format!("{name}.{}", self.registry).parse()?;
        let secret = signer::generate_secret_key()?;
        let key = json!({ "public_key": secret.public_key().to_string() });
        self.call(&account, &guardian, &self.root, "set_agent_key", key, YOCTO)
            .await?
            .assert_success();
        Ok(Company {
            account,
            guardian,
            agent: Signer::from_secret_key(secret)?,
        })
    }

    /// Calls `method` on `contract`, signed as `caller` with `signer`.
    pub async fn call(
        &self,
        contract: &AccountId,
        caller: &AccountId,
        signer: &Arc<Signer>,
        method: &str,
        args: Value,
        deposit: NearToken,
    ) -> Sent {
        Contract(contract.clone())
            .call_function(method, args)
            .transaction()
            .deposit(deposit)
            .gas(NearGas::from_tgas(200))
            .with_signer(caller.clone(), signer.clone())
            .send_to(&self.net)
            .await
    }

    /// The company's agent calls its own policy (no NEAR can be attached).
    pub async fn agent(&self, c: &Company, method: &str, args: Value) -> Sent {
        self.call(&c.account, &c.account, &c.agent, method, args, ZERO)
            .await
    }

    /// The company's guardian calls its policy with 1 yoctoNEAR.
    pub async fn guardian(&self, c: &Company, method: &str, args: Value) -> Sent {
        self.call(&c.account, &c.guardian, &self.root, method, args, YOCTO)
            .await
    }

    pub async fn view(
        &self,
        contract: &AccountId,
        method: &str,
        args: Value,
    ) -> testresult::TestResult<Value> {
        Ok(Contract(contract.clone())
            .call_function(method, args)
            .read_only::<Value>()
            .fetch_from(&self.net)
            .await?
            .data)
    }

    pub async fn balance(&self, account: &AccountId) -> testresult::TestResult<NearToken> {
        Ok(Tokens::account(account.clone())
            .near_balance()
            .fetch_from(&self.net)
            .await?
            .total)
    }

    /// The escrow's record of deal `id`.
    pub async fn deal(&self, id: u64) -> testresult::TestResult<Value> {
        self.view(&self.escrow, "get_deal", json!({ "id": id.to_string() }))
            .await
    }

    /// The registry's reputation for `c`.
    pub async fn reputation(&self, c: &Company) -> testresult::TestResult<Value> {
        let record = self
            .view(
                &self.registry,
                "get_company",
                json!({ "account_id": c.account }),
            )
            .await?;
        Ok(record["reputation"].clone())
    }
}

/// Spending limits in whole NEAR, one-day period.
pub fn limits(per_deal: u128, period: u128, allowlist_only: bool) -> Value {
    json!({ "per_deal_cap": near(per_deal), "period_cap": near(period), "period_length_ns": "86400000000000", "allowlist_only": allowlist_only })
}

/// `open_deal` arguments: pay `seller` these milestones (whole NEAR), due in a day.
pub fn deal(seller: &Company, milestones: &[u128]) -> Value {
    let due = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
        + 86_400_000_000_000;
    let milestones: Vec<NearToken> = milestones.iter().map(|m| near(*m)).collect();
    json!({ "deal": { "seller": seller.account, "terms_hash": TERMS, "deliver_by": due.to_string(), "milestones": milestones } })
}

/// `deal_action` arguments: forward `method` on deal `id` to the escrow.
pub fn action(method: &str, id: u64, extra: Value) -> Value {
    let mut args = json!({ "id": id.to_string() });
    if let (Some(args), Some(extra)) = (args.as_object_mut(), extra.as_object()) {
        args.extend(extra.clone());
    }
    json!({ "method": method, "args": args })
}

/// The JSON a transaction returned.
pub fn returned(sent: Sent) -> testresult::TestResult<Value> {
    Ok(sent?.assert_success().json::<Value>()?)
}
