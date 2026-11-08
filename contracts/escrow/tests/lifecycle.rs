//! Sandbox test: real NEAR locks in the escrow, goes to the seller on confirm (per
//! milestone), back to the buyer when a deal expires, and to both on a split.

use near_api::{AccountId, Contract, NearToken, Signer, Tokens};
use near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY;
use near_sdk::json_types::Base58CryptoHash;
use near_sdk::serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

const ONE: NearToken = NearToken::from_near(1);
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
    let stranger: AccountId = "registry.sandbox".parse()?;
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
    // A 2 NEAR one-milestone deal due `secs` from now.
    let deal_due_in = |secs: u128| -> testresult::TestResult<_> {
        let due = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos() + secs * 1_000_000_000;
        Ok(
            json!({ "seller": seller, "terms_hash": terms, "deliver_by": due.to_string(), "milestones": [TWO] }),
        )
    };

    // 1. The buyer locks 2 NEAR: the escrow holds it.
    let escrow_before = balance(&escrow, &net).await?;
    call(&buyer, "create_deal", deal_due_in(86_400)?, TWO)
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
    call(&buyer, "create_deal", deal_due_in(60)?, TWO)
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

    // 4. Two milestones of 1 NEAR: confirm pays exactly the first. Inside the review
    //    window a stranger can't release the second. (Moving the sandbox clock an hour
    //    is too slow; unit tests 24-25 cover the window, and release_due pays through
    //    the same release_next as confirm.)
    let mut halves = deal_due_in(86_400)?;
    halves["milestones"] = json!([ONE, ONE]);
    call(&buyer, "create_deal", halves, TWO)
        .await?
        .assert_success();
    call(
        &seller,
        "accept_deal",
        json!({ "id": "2", "terms_hash": terms }),
        zero,
    )
    .await?
    .assert_success();
    call(&seller, "mark_delivered", json!({ "id": "2" }), zero)
        .await?
        .assert_success();
    let seller_before = balance(&seller, &net).await?;
    call(&buyer, "confirm", json!({ "id": "2" }), zero)
        .await?
        .assert_success();
    assert_eq!(
        balance(&seller, &net).await?,
        seller_before.saturating_add(ONE)
    );

    call(&seller, "mark_delivered", json!({ "id": "2" }), zero)
        .await?
        .assert_success();
    call(&stranger, "release_due", json!({ "id": "2" }), zero)
        .await?
        .assert_failure();

    // 5. A disputed 2 NEAR deal split 1.5 / 0.5. The buyer's matching offer settles it,
    //    so the seller's gain is exact; the buyer gets 0.5 minus the gas for that call.
    let one_and_half = NearToken::from_millinear(1_500);
    let half = NearToken::from_millinear(500);
    call(&buyer, "create_deal", deal_due_in(86_400)?, TWO)
        .await?
        .assert_success();
    call(
        &seller,
        "accept_deal",
        json!({ "id": "3", "terms_hash": terms }),
        zero,
    )
    .await?
    .assert_success();
    call(&buyer, "dispute", json!({ "id": "3" }), zero)
        .await?
        .assert_success();
    call(
        &seller,
        "propose_split",
        json!({ "id": "3", "seller_share": one_and_half }),
        zero,
    )
    .await?
    .assert_success();
    let seller_before = balance(&seller, &net).await?;
    let buyer_before = balance(&buyer, &net).await?;
    call(
        &buyer,
        "propose_split",
        json!({ "id": "3", "seller_share": one_and_half }),
        zero,
    )
    .await?
    .assert_success();
    assert_eq!(
        balance(&seller, &net).await?,
        seller_before.saturating_add(one_and_half)
    );
    let buyer_after = balance(&buyer, &net).await?;
    assert!(
        buyer_after < buyer_before.saturating_add(half),
        "buyer paid no gas?"
    );
    assert!(
        buyer_after
            > buyer_before
                .saturating_add(half)
                .saturating_sub(NearToken::from_millinear(10)),
        "buyer didn't get 0.5 back"
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
