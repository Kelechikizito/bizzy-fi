//! Sandbox test: create_company really creates a keyless company running the policy.

use near_api::{Account, AccountId, Contract, NearGas, NearToken, Signer, Tokens};
use near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY;
use near_sdk::serde_json::{Value, json};

#[tokio::test]
async fn create_company_works_and_refunds() -> testresult::TestResult {
    let registry_wasm = std::fs::read(cargo_near_build::build_with_cli(Default::default())?)?;
    let policy_opts = cargo_near_build::BuildOpts::builder()
        .manifest_path("../policy/Cargo.toml")
        .build();
    let policy_wasm = std::fs::read(cargo_near_build::build_with_cli(policy_opts)?)?;

    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let root = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
    let registry: AccountId = "registry.sandbox".parse()?;
    let alice: AccountId = "alice.sandbox".parse()?;
    let bob: AccountId = "bob.sandbox".parse()?;
    for id in [&registry, &alice, &bob] {
        sandbox
            .create_account(id.clone())
            .initial_balance(NearToken::from_near(10))
            .send()
            .await?;
    }

    // Deploy the registry (owned by itself) and upload the policy code.
    Contract::deploy(registry.clone())
        .use_code(registry_wasm)
        .with_init_call(
            "new",
            json!({ "owner": registry, "escrow": "escrow.sandbox", "attester": registry }),
        )?
        .with_signer(root.clone())
        .send_to(&net)
        .await?
        .assert_success();
    let reg = Contract(registry.clone());
    reg.call_function_raw("set_policy_code", policy_wasm)
        .transaction()
        .gas(NearGas::from_tgas(300))
        .with_signer(registry.clone(), root.clone())
        .send_to(&net)
        .await?
        .assert_success();

    // Creates `name` with 3 NEAR and 100 TGas; the policy rejects a per-deal cap above the period cap.
    let create = |caller: &AccountId, name: &str, per_deal_cap: &str| {
        let limits = json!({ "per_deal_cap": per_deal_cap, "period_cap": "2", "period_length_ns": "1000", "allowlist_only": false });
        reg.call_function(
            "create_company",
            json!({ "name": name, "about": "We sell chairs", "referrer": null, "limits": limits }),
        )
        .transaction()
        .deposit(NearToken::from_near(3))
        .gas(NearGas::from_tgas(100))
        .with_signer(caller.clone(), root.clone())
        .send_to(&net)
    };
    create(&alice, "acme", "1").await?.assert_success();

    // acme exists, runs the policy with alice as guardian, and has no keys.
    let acme: AccountId = "acme.registry.sandbox".parse()?;
    let guardian: AccountId = Contract(acme.clone())
        .call_function("get_guardian", ())
        .read_only()
        .fetch_from(&net)
        .await?
        .data;
    assert_eq!(guardian, alice);
    let keys = Account(acme.clone()).list_keys().fetch_from(&net).await?;
    assert!(keys.data.is_empty(), "company account has keys");
    assert_eq!(
        company(&reg, &acme, &net).await?["guardian"],
        alice.to_string()
    );

    // Bob's creation passes the registry's checks but the policy's `new` fails on chain.
    // The batch is undone, so only the callback can send his 3 NEAR back (he pays only gas).
    let before = balance(&bob, &net).await?;
    let _ = create(&bob, "beta", "5").await?;
    let after = balance(&bob, &net).await?;
    assert!(
        after > before.saturating_sub(NearToken::from_millinear(100)),
        "bob not refunded"
    );
    let beta: AccountId = "beta.registry.sandbox".parse()?;
    assert!(company(&reg, &beta, &net).await?.is_null(), "record saved");
    assert!(
        Account(beta).view().fetch_from(&net).await.is_err(),
        "beta account exists"
    );

    Ok(())
}

/// The registry's record for `account` as JSON.
async fn company(
    reg: &Contract,
    account: &AccountId,
    net: &near_api::NetworkConfig,
) -> testresult::TestResult<Value> {
    Ok(reg
        .call_function("get_company", json!({ "account_id": account }))
        .read_only()
        .fetch_from(net)
        .await?
        .data)
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
