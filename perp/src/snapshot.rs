use std::collections::{BTreeMap, HashMap, HashSet};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::orderbook::{Bid, Ask};
use crate::position::Position;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderbookSnapshot {
    pub bids:                BTreeMap<u32, Bid>,
    pub asks:                BTreeMap<u32, Ask>,
    pub positions:           HashMap<Uuid, Position>,
    pub current_order_index: u32,
    pub last_event_index:    u32,
    pub symbol:              String,
    pub processed_event_ids: HashSet<Uuid>,
    pub insurance_fund:      f64,
}