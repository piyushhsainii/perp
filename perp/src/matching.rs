//! Helper utilities for the matching layer.

use uuid::Uuid;
use crate::orderbook::{Match, OrderResponse, Orderbook};
use crate::position::Side;

pub fn place_order(
    ob: &mut Orderbook,
    user_id: Option<Uuid>,
    side: Side,
    qty: u32,
    price: Option<u32>,
    margin: f64,
) -> (Uuid, OrderResponse) {
    let uid = user_id.unwrap_or_else(Uuid::new_v4);
    let resp = ob.create_order(uid, side, qty, price, margin);
    (uid, resp)
}

pub fn format_match_summary(resp: &OrderResponse) -> String {
    if resp.matches.is_empty() {
        return "No matches".to_owned();
    }
    let total: u32 = resp.matches.iter().map(|m| m.qty).sum();
    let avg_price: f64 = resp.matches.iter()
        .map(|m| m.price as f64 * m.qty as f64)
        .sum::<f64>() / total as f64;
    format!(
        "Filled {} contracts @ avg price {:.2} ({} match(es))",
        total,
        avg_price,
        resp.matches.len()
    )
}

pub fn validate_matches(matches: &[Match]) -> Option<&Match> {
    matches.iter().find(|m| m.price == 0 || m.qty == 0)
}