//! End-to-end sandbox tests: all three contracts wired together on a local NEAR node.
//! Agents act only through their company's policy; the escrow holds and pays; the
//! registry records reputation.

mod common;

use common::*;
use near_api::types::transaction::actions::{Action, FunctionCallAction};
use near_api::{Account, NearGas, NearToken, Transaction, types::CryptoHash};
use near_sdk::serde_json::json;

/// A. A 2-milestone deal runs from start to finish through both agents.
#[tokio::test]
async fn milestone_deal_from_start_to_finish() -> testresult::TestResult {
    let w = World::start().await?;
    let buyer = w.company("buyer", 12, None, limits(3, 10, false)).await?;
    let seller = w
        .company("seller", 1, Some(&buyer), limits(3, 10, false))
        .await?;

    // The buyer's agent opens a 1 + 1 NEAR deal; the escrow holds it.
    let opened = returned(w.agent(&buyer, "open_deal", deal(&seller, &[1, 1])).await)?;
    assert_eq!(opened, json!({ "Opened": { "deal_id": "0" } }));
    assert_eq!(w.deal(0).await?["buyer"], buyer.account.to_string());

    // The seller's agent accepts; each milestone is delivered, confirmed and paid.
    let accept = action("accept_deal", 0, json!({ "terms_hash": TERMS }));
    w.agent(&seller, "deal_action", accept)
        .await?
        .assert_success();
    for _ in 0..2 {
        w.agent(
            &seller,
            "deal_action",
            action("mark_delivered", 0, json!({})),
        )
        .await?
        .assert_success();
        let before = w.balance(&seller.account).await?;
        w.agent(&buyer, "deal_action", action("confirm", 0, json!({})))
            .await?
            .assert_success();
        assert!(w.balance(&seller.account).await? >= before.saturating_add(near(1)));
    }
    assert_eq!(w.deal(0).await?["status"], "Released");

    // The registry recorded it for both sides, and the buyer's referral.
    for c in [&buyer, &seller] {
        let rep = w.reputation(c).await?;
        assert_eq!(rep["on_time"], 1, "{}", c.account);
        assert_eq!(rep["counterparties"], 1, "{}", c.account);
        assert_eq!(
            rep["volume"],
            near(2).as_yoctonear().to_string(),
            "{}",
            c.account
        );
    }
    let buyer_record = w
        .view(
            &w.registry,
            "get_company",
            json!({ "account_id": buyer.account }),
        )
        .await?;
    assert_eq!(buyer_record["referrals"], 1);
    Ok(())
}

/// B. The guardian's rules hold: approvals, undo on refusal, salted allowlist, no agent disputes.
#[tokio::test]
async fn guardian_rules_hold() -> testresult::TestResult {
    let w = World::start().await?;
    let buyer = w.company("buyer", 12, None, limits(3, 10, false)).await?;
    let seller = w.company("seller", 1, None, limits(3, 10, false)).await?;

    // Over the per-deal cap: waits; the guardian approves; the escrow opens it.
    let pending = returned(w.agent(&buyer, "open_deal", deal(&seller, &[5])).await)?;
    assert_eq!(pending, json!({ "NeedsApproval": { "id": "0" } }));
    w.guardian(&buyer, "approve", json!({ "id": "0" }))
        .await?
        .assert_success();
    assert_eq!(
        w.deal(0).await?["amount"],
        near(5).as_yoctonear().to_string()
    );

    // The escrow refuses (deadline passed): Failed, and the spent total is back.
    let spent = w
        .view(&buyer.account, "get_spent_this_period", json!({}))
        .await?;
    let mut late = deal(&seller, &[1]);
    late["deal"]["deliver_by"] = json!("1");
    assert_eq!(
        returned(w.agent(&buyer, "open_deal", late).await)?,
        json!("Failed")
    );
    assert_eq!(
        w.view(&buyer.account, "get_spent_this_period", json!({}))
            .await?,
        spent
    );

    // The agent can't dispute (the guardian can: see test D).
    let accept = action("accept_deal", 0, json!({ "terms_hash": TERMS }));
    w.agent(&seller, "deal_action", accept)
        .await?
        .assert_success();
    w.agent(&buyer, "deal_action", action("dispute", 0, json!({})))
        .await?
        .assert_failure();

    // Salted allowlist: only the hash goes on chain; only the right salt pays.
    let only_listed = json!({ "limits": limits(3, 10, true) });
    w.guardian(&buyer, "set_limits", only_listed)
        .await?
        .assert_success();
    let salt = [7u8; 32];
    let entry = CryptoHash::hash(&[&salt[..], seller.account.as_str().as_bytes()].concat());
    w.guardian(
        &buyer,
        "allow_counterparty",
        json!({ "hash": entry.to_string() }),
    )
    .await?
    .assert_success();
    let salted = |salt: [u8; 32]| -> testresult::TestResult<_> {
        let mut args = deal(&seller, &[1]);
        args["salt"] = json!(CryptoHash::try_from(&salt[..])?.to_string());
        Ok(args)
    };
    w.agent(&buyer, "open_deal", salted([8; 32])?)
        .await?
        .assert_failure();
    let paid = returned(w.agent(&buyer, "open_deal", salted(salt)?).await)?;
    assert_eq!(paid, json!({ "Opened": { "deal_id": "1" } }));
    Ok(())
}

/// C. One guardian transaction freezes the agent and cancels its open deal.
#[tokio::test]
async fn freeze_cancels_open_deals_in_one_click() -> testresult::TestResult {
    let w = World::start().await?;
    let buyer = w.company("buyer", 12, None, limits(3, 10, false)).await?;
    let seller = w.company("seller", 1, None, limits(3, 10, false)).await?;
    returned(w.agent(&buyer, "open_deal", deal(&seller, &[2])).await)?;
    let before = w.balance(&buyer.account).await?;

    // [freeze, cancel deal 0], signed once by the guardian.
    let call = |method: &str, args: near_sdk::serde_json::Value| {
        Action::FunctionCall(Box::new(FunctionCallAction {
            method_name: method.into(),
            args: args.to_string().into_bytes(),
            gas: NearGas::from_tgas(100),
            deposit: YOCTO,
        }))
    };
    Transaction::construct(buyer.guardian.clone(), buyer.account.clone())
        .add_action(call("freeze", json!({})))
        .add_action(call("deal_action", action("cancel", 0, json!({}))))
        .with_signer(w.root.clone())
        .send_to(&w.net)
        .await?
        .assert_success();

    // The money is back, the agent's key is gone, and the agent is locked out.
    assert_eq!(w.deal(0).await?["status"], "Refunded");
    assert!(w.balance(&buyer.account).await? >= before.saturating_add(near(2)));
    assert_eq!(
        w.view(&buyer.account, "get_status", json!({})).await?,
        "Suspended"
    );
    assert!(
        Account(buyer.account.clone())
            .list_keys()
            .fetch_from(&w.net)
            .await?
            .data
            .is_empty()
    );
    assert!(
        w.agent(&buyer, "open_deal", deal(&seller, &[1]))
            .await
            .is_err()
    );
    Ok(())
}

/// D. A dispute settled by both guardians: exact payouts and reputation for both sides.
#[tokio::test]
async fn dispute_settled_by_guardians() -> testresult::TestResult {
    let w = World::start().await?;
    let buyer = w.company("buyer", 12, None, limits(3, 10, false)).await?;
    let seller = w.company("seller", 1, None, limits(3, 10, false)).await?;
    returned(w.agent(&buyer, "open_deal", deal(&seller, &[2])).await)?;
    let accept = action("accept_deal", 0, json!({ "terms_hash": TERMS }));
    w.agent(&seller, "deal_action", accept)
        .await?
        .assert_success();

    // The buyer's guardian disputes; both guardians offer the seller 1.5 NEAR.
    w.guardian(&buyer, "deal_action", action("dispute", 0, json!({})))
        .await?
        .assert_success();
    let share = NearToken::from_millinear(1_500);
    let offer = action("propose_split", 0, json!({ "seller_share": share }));
    w.guardian(&seller, "deal_action", offer.clone())
        .await?
        .assert_success();
    let seller_before = w.balance(&seller.account).await?;
    let buyer_before = w.balance(&buyer.account).await?;
    w.guardian(&buyer, "deal_action", offer)
        .await?
        .assert_success();

    // The settling call ran on the buyer's side, so the seller's gain is exact.
    assert_eq!(w.deal(0).await?["status"], "Split");
    assert_eq!(
        w.balance(&seller.account).await?,
        seller_before.saturating_add(share)
    );
    assert!(
        w.balance(&buyer.account).await?
            >= buyer_before.saturating_add(NearToken::from_millinear(500))
    );
    assert_eq!(w.reputation(&seller).await?["disputes_won"], 1);
    assert_eq!(w.reputation(&buyer).await?["disputes_lost"], 1);
    Ok(())
}

/// E. Nobody settles a dispute: after the window, anyone can refund the buyer.
#[tokio::test]
async fn unsettled_dispute_refunds_the_buyer() -> testresult::TestResult {
    let w = World::start().await?;
    let buyer = w.company("buyer", 12, None, limits(3, 10, false)).await?;
    let seller = w.company("seller", 1, None, limits(3, 10, false)).await?;
    returned(w.agent(&buyer, "open_deal", deal(&seller, &[2])).await)?;
    let accept = action("accept_deal", 0, json!({ "terms_hash": TERMS }));
    w.agent(&seller, "deal_action", accept)
        .await?
        .assert_success();
    w.guardian(&buyer, "deal_action", action("dispute", 0, json!({})))
        .await?
        .assert_success();

    // Too early: the refund is refused and the deal stays disputed.
    let refund = json!({ "id": "0" });
    let (escrow, caller) = (&w.escrow, &seller.guardian);
    w.call(
        escrow,
        caller,
        &w.root,
        "refund_on_timeout",
        refund.clone(),
        ZERO,
    )
    .await?
    .assert_failure();
    assert_eq!(w.deal(0).await?["status"], "Disputed");

    // After the window, even the seller's side can trigger it; the buyer gets it all.
    w.sandbox.fast_forward(13_000).await?;
    let seller_before = w.balance(&seller.account).await?;
    let buyer_before = w.balance(&buyer.account).await?;
    w.call(escrow, caller, &w.root, "refund_on_timeout", refund, ZERO)
        .await?
        .assert_success();
    assert_eq!(w.deal(0).await?["status"], "Refunded");
    assert_eq!(
        w.balance(&buyer.account).await?,
        buyer_before.saturating_add(near(2))
    );
    assert_eq!(w.balance(&seller.account).await?, seller_before);
    assert_eq!(w.reputation(&buyer).await?["disputes_won"], 1);
    assert_eq!(w.reputation(&seller).await?["disputes_lost"], 1);
    Ok(())
}
