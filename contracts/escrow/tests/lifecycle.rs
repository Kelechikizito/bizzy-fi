//! Sandbox test: real NEAR locks in the escrow, goes to the seller on confirm,
//! and back to the buyer when a deal expires.

use near_api::{AccountId, Contract, NearToken, Signer, Tokens};
use near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY;
use near_sdk::json_types::Base58CryptoHash;
use near_sdk::serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

const TWO: NearToken = NearToken::from_near(2);

#[tokio::test]
async fn money_ends_in_exactly_one_place() -> testresult::TestResult {
    let wasm = std::fs::read(cargo_near_build::build_with_cli(Default::default())?)?;
    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let root = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;

    // Companies are sub-accounts of the registry; the escrow lives beside it.
    let escrow: AccountId = "escrow.sandbox".parse()?;
    let buyer: AccountId = "buyer.registry.sandbox".parse()?;
    let seller: AccountId = "seller.registry.sandbox".parse()?;
    for id in [
        "registry.sandbox",
        "escrow.sandbox",
        buyer.as_str(),
        seller.as_str(),
    ] {
        sandbox
            .create_account(id.parse()?)
            .initial_balance(NearToken::from_near(10))
            .send()
            .await?;
    }
    Contract::deploy(escrow.clone())
        .use_code(wasm)
        .with_init_call("new", json!({ "registry": "registry.sandbox" }))?
        .with_signer(root.clone())
        .send_to(&net)
        .await?
        .assert_success();
    let esc = Contract(escrow.clone());
    let terms = Base58CryptoHash::from([1u8; 32]);

    // Calls `method` on the escrow as `caller` with `deposit` attached.
    let call = |caller: &AccountId, method: &str, args: near_sdk::serde_json::Value, deposit| {
        esc.call_function(method, args)
            .transaction()
            .deposit(deposit)
            .with_signer(caller.clone(), root.clone())
            .send_to(&net)
    };
    let zero = NearToken::from_near(0);
    let in_a_minute = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos() + 60_000_000_000;
    let new_deal =
        json!({ "seller": seller, "terms_hash": terms, "deliver_by": in_a_minute.to_string() });

    // 1. The buyer locks 2 NEAR: the escrow holds it.
    let escrow_before = balance(&escrow, &net).await?;
    call(&buyer, "create_deal", new_deal.clone(), TWO)
        .await?
        .assert_success();
    let escrow_after = balance(&escrow, &net).await?;
    assert!(
        escrow_after >= escrow_before.saturating_add(TWO),
        "escrow didn't lock 2 NEAR"
    );

    // 2. Accept → deliver → confirm: the seller gets exactly 2 NEAR.
    call(
        &seller,
        "accept_deal",
        json!({ "id": "0", "terms_hash": terms }),
        zero,
    )
    .await?
    .assert_success();
    call(&seller, "mark_delivered", json!({ "id": "0" }), zero)
        .await?
        .assert_success();
    let seller_before = balance(&seller, &net).await?;
    call(&buyer, "confirm", json!({ "id": "0" }), zero)
        .await?
        .assert_success();
    assert_eq!(
        balance(&seller, &net).await?,
        seller_before.saturating_add(TWO)
    );

    // A second confirm can't pay again.
    call(&buyer, "confirm", json!({ "id": "0" }), zero)
        .await?
        .assert_failure();

    // 3. A second deal expires: anyone refunds, the buyer gets exactly 2 NEAR back.
    call(&buyer, "create_deal", new_deal, TWO)
        .await?
        .assert_success();
    sandbox.fast_forward(200).await?;
    let buyer_before = balance(&buyer, &net).await?;
    call(&seller, "refund_expired", json!({ "id": "1" }), zero)
        .await?
        .assert_success();
    assert_eq!(
        balance(&buyer, &net).await?,
        buyer_before.saturating_add(TWO)
    );

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
