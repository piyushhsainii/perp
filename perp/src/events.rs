use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::position::Side;

/// Every mutation to the orderbook is expressed as one of these events.
/// They are persisted in order; replaying them deterministically
/// reproduces the full orderbook state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OrderbookEvent {
    OrderPlaced {
        event_id:          Uuid,
        user_id:           Uuid,
        original_order_id: Uuid,
        side:              Side,
        qty:               u32,
        /// None for market orders.
        price:             Option<u32>,
        /// Margin deposited for this order's position.
        margin:            f64,
    },
    OrderCancelled {
        event_id: Uuid,
        order_id: Uuid,
        price:    u32,
        side:     Side,
    },
    OrderMatched {
        event_id: Uuid,
        taker:    Uuid,
        maker:    Uuid,
        price:    u32,
        qty:      u32,
    },
    FundingApplied {
        event_id:    Uuid,
        mark_price:  u32,
        index_price: u32,
    },
    Liquidated {
        event_id:   Uuid,
        user_id:    Uuid,
        mark_price: u32,
    },
    /// Auto-deleveraging: a profitable opposing position is force-closed.
    Adl {
        event_id:   Uuid,
        user_id:    Uuid,
        mark_price: u32,
        qty:        u32,
    },
}

impl OrderbookEvent {
    /// Extract the unique event ID, used for idempotency checks.
    pub fn event_id(&self) -> Uuid {
        match self {
            Self::OrderPlaced    { event_id, .. } => *event_id,
            Self::OrderCancelled { event_id, .. } => *event_id,
            Self::OrderMatched   { event_id, .. } => *event_id,
            Self::FundingApplied { event_id, .. } => *event_id,
            Self::Liquidated     { event_id, .. } => *event_id,
            Self::Adl            { event_id, .. } => *event_id,
        }
    }
}