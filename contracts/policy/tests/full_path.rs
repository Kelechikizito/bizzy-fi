//! Sandbox test: all three contracts wired together. Agents act only through their
//! company's policy; the escrow holds and pays; the registry records reputation.

use near_api::{
    AccountId, Contract, NearGas, NearToken, Signer, Tokens, signer, types::CryptoHash,
};
use near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY;
use near_sdk::serde_json::{Value, json};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

const YOCTO: NearToken = NearToken::from_yoctonear(1);
const ZERO: NearToken = NearToken::from_yoctonear(0);
const TERMS: &str = "11111111111111111111111111111111";

#[tokio::test]
async fn deal_runs_through_all_three_contracts() -> testresult::TestResult {
    let build = |path: &str| -> testresult::TestResult<Vec<u8>> {
        let opts = cargo_near_build::BuildOpts::builder()
            .manifest_path(path)
            .build();
        Ok(std::fs::read(cargo_near_build::build_with_cli(opts)?)?)
    };
    let policy_wasm = std::fs::read(cargo_near_build::build_with_cli(Default::default())?)?;
    let registry_wasm = build("../registry/Cargo.toml")?;
    let escrow_wasm = build("../escrow/Cargo.toml")?;

    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let root = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
    let id = |s: &str| -> AccountId { s.parse().unwrap() };
    let (registry, escrow) = (id("registry.sandbox"), id("escrow.sandbox"));
    let (buyer_guardian, seller_guardian) = (id("bg.sandbox"), id("sg.sandbox"));
    for account in [&registry, &escrow, &buyer_guardian, &seller_guardian] {
        sandbox
            .create_account(account.clone())
            .initial_balance(NearToken::from_near(50))
            .send()
            .await?;
    }

    // Calls `method` on `contract`, signed as `caller` with `signer`.
    let call = |contract: &AccountId,
                caller: &AccountId,
                signer: &Arc<Signer>,
                method: &str,
                args: Value,
                deposit: NearToken| {
        Contract(contract.clone())
            .call_function(method, args)
            .transaction()
            .deposit(deposit)
            .gas(NearGas::from_tgas(200))
            .with_signer(caller.clone(), signer.clone())
            .send_to(&net)
    };
    let view = |contract: &AccountId, method: &str, args: Value| {
        Contract(contract.clone())
            .call_function(method, args)
            .read_only::<Value>()
            .fetch_from(&net)
    };

    // Deploy the registry and the escrow; upload the policy as a global contract.
    for (account, wasm, init) in [
        (
            &registry,
            registry_wasm,
            json!({ "owner": registry, "escrow": escrow, "attester": registry }),
        ),
        (&escrow, escrow_wasm, json!({ "registry": registry })),
    ] {
        Contract::deploy(account.clone())
            .use_code(wasm)
            .with_init_call("new", init)?
            .with_signer(root.clone())
            .send_to(&net)
            .await?
            .assert_success();
    }
    let policy_hash = CryptoHash::hash(&policy_wasm).to_string();
    Contract::deploy_global_contract_code(policy_wasm)
        .as_hash()
        .with_signer(registry.clone(), root.clone())
        .send_to(&net)
        .await?
        .assert_success();
    call(
        &registry,
        &registry,
        &root,
        "set_policy_hash",
        json!({ "hash": policy_hash }),
        ZERO,
    )
    .await?
    .assert_success();

    // Each guardian creates a company and gives its agent a key.
    let limits = json!({ "per_deal_cap": NearToken::from_near(3), "period_cap": NearToken::from_near(10), "period_length_ns": "86400000000000", "allowlist_only": false });
    let mut companies = vec![];
    for (name, guardian, deposit) in [
        ("buyer", &buyer_guardian, 12),
        ("seller", &seller_guardian, 3),
    ] {
        let args = json!({ "name": name, "about": "", "referrer": null, "limits": limits });
        call(
            &registry,
            guardian,
            &root,
            "create_company",
            args,
            NearToken::from_near(deposit),
        )
        .await?
        .assert_success();
        let company = id(&format!("{name}.registry.sandbox"));
        let agent_secret = signer::generate_secret_key()?;
        let key = json!({ "public_key": agent_secret.public_key().to_string() });
        call(&company, guardian, &root, "set_agent_key", key, YOCTO)
            .await?
            .assert_success();
        companies.push((company, Signer::from_secret_key(agent_secret)?));
    }
    let (seller, seller_agent) = companies.pop().unwrap();
    let (buyer, buyer_agent) = companies.pop().unwrap();

    // An agent call: from the company account, signed with its agent key.
    let agent = |company: &AccountId, agent: &Arc<Signer>, method: &str, args: Value| {
        call(company, company, agent, method, args, ZERO)
    };
    let in_a_day = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos() + 86_400_000_000_000;
    let deal = |near: u128, deliver_by: String| json!({ "deal": { "seller": seller, "terms_hash": TERMS, "deliver_by": deliver_by, "milestones": [NearToken::from_near(near)] } });

    // 1. Within the caps, the buyer's agent opens a 2 NEAR deal: the escrow holds it.
    let opened = agent(
        &buyer,
        &buyer_agent,
        "open_deal",
        deal(2, in_a_day.to_string()),
    )
    .await?
    .assert_success()
    .json::<Value>()?;
    assert_eq!(opened, json!({ "Opened": { "deal_id": "0" } }));
    let escrow_deal = view(&escrow, "get_deal", json!({ "id": "0" })).await?.data;
    assert_eq!(escrow_deal["buyer"], buyer.to_string());
    assert_eq!(
        escrow_deal["amount"],
        NearToken::from_near(2).as_yoctonear().to_string()
    );

    // 2. The seller's agent accepts and delivers through its own policy.
    let id0 = json!({ "id": "0" });
    let accept = json!({ "method": "accept_deal", "args": { "id": "0", "terms_hash": TERMS } });
    agent(&seller, &seller_agent, "deal_action", accept)
        .await?
        .assert_success();
    let deliver = json!({ "method": "mark_delivered", "args": id0 });
    agent(&seller, &seller_agent, "deal_action", deliver)
        .await?
        .assert_success();

    // 3. The buyer's agent confirms: the seller company gets 2 NEAR, and the
    //    registry records an on-time deal for both sides.
    let seller_before = balance(&seller, &net).await?;
    let confirm = json!({ "method": "confirm", "args": id0 });
    agent(&buyer, &buyer_agent, "deal_action", confirm)
        .await?
        .assert_success();
    let seller_after = balance(&seller, &net).await?;
    assert!(seller_after >= seller_before.saturating_add(NearToken::from_near(2)));
    for company in [&buyer, &seller] {
        let record = view(&registry, "get_company", json!({ "account_id": company }))
            .await?
            .data;
        assert_eq!(record["reputation"]["on_time"], 1, "{company}");
        assert_eq!(record["reputation"]["counterparties"], 1, "{company}");
    }

    // 4. Over the per-deal cap: waits for the guardian, who approves → the escrow opens it.
    let pending = agent(
        &buyer,
        &buyer_agent,
        "open_deal",
        deal(5, in_a_day.to_string()),
    )
    .await?
    .assert_success()
    .json::<Value>()?;
    assert_eq!(pending, json!({ "NeedsApproval": { "id": "0" } }));
    call(&buyer, &buyer_guardian, &root, "approve", id0, YOCTO)
        .await?
        .assert_success();
    let approved = view(&escrow, "get_deal", json!({ "id": "1" })).await?.data;
    assert_eq!(
        approved["amount"],
        NearToken::from_near(5).as_yoctonear().to_string()
    );

    // 5. The escrow refuses a deal (deadline already passed): the callback reports
    //    Failed, and the spent total and the money are back.
    let spent_before = view(&buyer, "get_spent_this_period", json!({})).await?.data;
    let buyer_before = balance(&buyer, &net).await?;
    let failed = agent(&buyer, &buyer_agent, "open_deal", deal(1, "1".into()))
        .await?
        .assert_success()
        .json::<Value>()?;
    assert_eq!(failed, json!("Failed"));
    assert_eq!(
        view(&buyer, "get_spent_this_period", json!({})).await?.data,
        spent_before
    );
    let buyer_after = balance(&buyer, &net).await?;
    assert!(
        buyer_after > buyer_before.saturating_sub(NearToken::from_millinear(50)),
        "1 NEAR not returned"
    );

    // 6. After the seller accepts deal 1, the buyer's agent can't dispute it; the guardian can.
    let accept1 = json!({ "method": "accept_deal", "args": { "id": "1", "terms_hash": TERMS } });
    agent(&seller, &seller_agent, "deal_action", accept1)
        .await?
        .assert_success();
    let dispute = json!({ "method": "dispute", "args": { "id": "1" } });
    agent(&buyer, &buyer_agent, "deal_action", dispute.clone())
        .await?
        .assert_failure();
    call(
        &buyer,
        &buyer_guardian,
        &root,
        "deal_action",
        dispute,
        YOCTO,
    )
    .await?
    .assert_success();
    let disputed = view(&escrow, "get_deal", json!({ "id": "1" })).await?.data;
    assert_eq!(disputed["status"], "Disputed");

    // 7. Salted allowlist: the guardian lists the seller under a secret salt (only the
    //    hash goes on chain); the agent can pay them with that salt and no other.
    let mut only_listed = limits.clone();
    only_listed["allowlist_only"] = json!(true);
    let set_limits = json!({ "limits": only_listed });
    call(
        &buyer,
        &buyer_guardian,
        &root,
        "set_limits",
        set_limits,
        YOCTO,
    )
    .await?
    .assert_success();
    let salt = [7u8; 32];
    let entry = CryptoHash::hash(&[&salt[..], seller.as_str().as_bytes()].concat()).to_string();
    let allow = json!({ "hash": entry });
    call(
        &buyer,
        &buyer_guardian,
        &root,
        "allow_counterparty",
        allow,
        YOCTO,
    )
    .await?
    .assert_success();
    let salted = |salt: [u8; 32]| -> testresult::TestResult<Value> {
        let mut args = deal(1, in_a_day.to_string());
        args["salt"] = json!(CryptoHash::try_from(&salt[..])?.to_string());
        Ok(args)
    };
    agent(&buyer, &buyer_agent, "open_deal", salted([8u8; 32])?)
        .await?
        .assert_failure();
    let paid = agent(&buyer, &buyer_agent, "open_deal", salted(salt)?)
        .await?
        .assert_success()
        .json::<Value>()?;
    assert_eq!(paid, json!({ "Opened": { "deal_id": "2" } }));

    Ok(())
}

async fn balance(
    account: &AccountId,
    net: &near_api::NetworkConfig,
) -> testresult::TestResult<NearToken> {
    Ok(Tokens::account(account.clone())
        .near_balance()
        .fetch_from(net)
        .await?
        .total)
}
