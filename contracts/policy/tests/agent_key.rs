//! Sandbox test: the agent key works only for agent methods, and freeze deletes it.

use near_api::types::AccessKeyPermission;
use near_api::{Account, AccountId, Contract, NearToken, Signer, Tokens, signer};
use near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY;
use near_sdk::serde_json::json;

const PAYMENT: NearToken = NearToken::from_yoctonear(1);

#[tokio::test]
async fn agent_key_lifecycle() -> testresult::TestResult {
    let wasm = std::fs::read(cargo_near_build::build_with_cli(Default::default())?)?;
    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);

    // Every sandbox account starts with the same full-access key.
    let root = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
    let registry: AccountId = "registry.sandbox".parse()?;
    let company: AccountId = "acme.registry.sandbox".parse()?;
    let guardian: AccountId = "guardian.sandbox".parse()?;
    let seller: AccountId = "seller.sandbox".parse()?;
    for id in [&registry, &company, &guardian, &seller] {
        sandbox
            .create_account(id.clone())
            .initial_balance(NearToken::from_near(10))
            .send()
            .await?;
    }

    // The registry deploys and sets up the policy on the company account.
    Contract::deploy(company.clone())
        .use_code(wasm)
        .without_init_call()
        .with_signer(root.clone())
        .send_to(&net)
        .await?
        .assert_success();
    let policy = Contract(company.clone());
    let limits = json!({ "per_deal_cap": "5", "period_cap": "20", "period_length_ns": "1000000000000", "allowlist_only": false });
    policy
        .call_function(
            "new",
            json!({ "guardian": guardian, "escrow": seller, "limits": limits }),
        )
        .transaction()
        .with_signer(registry.clone(), root.clone())
        .send_to(&net)
        .await?
        .assert_success();

    // The guardian gives the agent a fresh key.
    let agent_secret = signer::generate_secret_key()?;
    let agent_public = agent_secret.public_key();
    let agent = Signer::from_secret_key(agent_secret)?;
    policy
        .call_function(
            "set_agent_key",
            json!({ "public_key": agent_public.to_string() }),
        )
        .transaction()
        .deposit(PAYMENT)
        .with_signer(guardian.clone(), root.clone())
        .send_to(&net)
        .await?
        .assert_success();
    // On chain, the key may call only open_deal and deal_action, only on the company account.
    let Some(AccessKeyPermission::FunctionCall(permission)) =
        key_permission(&company, &agent_public.to_string(), &net).await?
    else {
        panic!("agent key missing or full-access");
    };
    assert_eq!(permission.receiver_id, company.to_string());
    assert_eq!(permission.method_names, vec!["open_deal", "deal_action"]);

    // The agent key can call open_deal (no escrow is deployed here, so the deal itself
    // fails and the callback undoes it, but the call is allowed)...
    let deal = json!({ "deal": { "seller": seller, "terms_hash": "11111111111111111111111111111111", "deliver_by": "1", "milestones": ["1"] } });
    policy
        .call_function("open_deal", deal.clone())
        .transaction()
        .with_signer(company.clone(), agent.clone())
        .send_to(&net)
        .await?
        .assert_success();

    // ...but not withdraw, and it can't send NEAR. An Err means the chain refused the
    // transaction before it ran, so the key's methods list stopped it, not the guardian check.
    let withdraw = policy
        .call_function("withdraw", json!({ "amount": "1", "to": seller }))
        .transaction()
        .with_signer(company.clone(), agent.clone())
        .send_to(&net)
        .await;
    assert!(withdraw.is_err());
    let transfer = Tokens::account(company.clone())
        .send_to(seller.clone())
        .near(NearToken::from_near(1))
        .with_signer(agent.clone())
        .send_to(&net)
        .await;
    assert!(transfer.is_err());

    // Freeze deletes the key, so the agent is locked out.
    policy
        .call_function("freeze", ())
        .transaction()
        .deposit(PAYMENT)
        .with_signer(guardian.clone(), root.clone())
        .send_to(&net)
        .await?
        .assert_success();
    assert!(
        key_permission(&company, &agent_public.to_string(), &net)
            .await?
            .is_none()
    );
    let after_freeze = policy
        .call_function("open_deal", deal)
        .transaction()
        .with_signer(company.clone(), agent)
        .send_to(&net)
        .await;
    assert!(after_freeze.is_err());

    Ok(())
}

/// The permission of `account`'s key with this public key, if it exists.
async fn key_permission(
    account: &AccountId,
    public_key: &str,
    net: &near_api::NetworkConfig,
) -> testresult::TestResult<Option<AccessKeyPermission>> {
    let keys = Account(account.clone()).list_keys().fetch_from(net).await?;
    Ok(keys
        .data
        .into_iter()
        .find(|(key, _)| key.to_string() == public_key)
        .map(|(_, access)| access.permission))
}
