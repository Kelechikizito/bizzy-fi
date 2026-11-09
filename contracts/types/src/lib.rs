//! Types and contract interfaces shared by the Bizzy-Fy contracts.
//! A plain library: no contract entry points, so every contract can use it.

use near_sdk::json_types::{Base58CryptoHash, U64};
use near_sdk::{AccountId, NearToken, ext_contract, near};

/// Most payment stages one deal may have.
pub const MAX_MILESTONES: usize = 10;

/// A company's spending rules (stored by the policy, passed in by the registry).
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct Limits {
    /// Most the agent may spend on one deal.
    pub per_deal_cap: NearToken,
    /// Most the agent may spend in one period.
    pub period_cap: NearToken,
    /// Length of a spending period, in nanoseconds.
    pub period_length_ns: U64,
    /// Only allowlisted counterparties may be paid.
    pub allowlist_only: bool,
}

/// How a deal ended for one side (sent by the escrow, counted by the registry).
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Outcome {
    OnTime,
    Late,
    DisputeWon,
    DisputeLost,
}

/// A deal the agent wants to open; its fields match the escrow's `create_deal`.
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct DealRequest {
    pub seller: AccountId,
    pub terms_hash: Base58CryptoHash,
    pub deliver_by: U64,
    pub milestones: Vec<NearToken>,
}

/// The escrow methods other contracts call.
#[ext_contract(ext_escrow)]
pub trait Escrow {
    fn create_deal(
        &mut self,
        seller: AccountId,
        terms_hash: Base58CryptoHash,
        deliver_by: U64,
        milestones: Vec<NearToken>,
    ) -> U64;
}

/// The registry methods other contracts call.
#[ext_contract(ext_registry)]
pub trait Registry {
    fn record_outcome(
        &mut self,
        company: AccountId,
        counterparty: AccountId,
        outcome: Outcome,
        amount: NearToken,
    );
}
