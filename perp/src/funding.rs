//! Funding rate calculation and application helpers.

use crate::orderbook::Orderbook;

pub fn calculate_funding_rate(mark_price: u32, index_price: u32) -> f64 {
    if index_price == 0 { return 0.0; }
    (mark_price as f64 - index_price as f64) / index_price as f64
}

pub fn calculate_funding_payment(size: u32, mark_price: u32, funding_rate: f64) -> f64 {
    size as f64 * mark_price as f64 * funding_rate
}

pub fn apply_funding(ob: &mut Orderbook, mark_price: u32, index_price: u32) {
    ob.mark_price  = mark_price;
    ob.index_price = index_price;
    ob.update_funding();
    log::info!(
        "[funding] mark={} index={} rate={:.6}",
        mark_price,
        index_price,
        calculate_funding_rate(mark_price, index_price)
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_is_zero_when_prices_equal() {
        assert_eq!(calculate_funding_rate(100, 100), 0.0);
    }

    #[test]
    fn rate_positive_when_mark_above_index() {
        let rate = calculate_funding_rate(110, 100);
        assert!((rate - 0.1).abs() < 1e-9);
    }

    #[test]
    fn rate_negative_when_mark_below_index() {
        let rate = calculate_funding_rate(90, 100);
        assert!((rate + 0.1).abs() < 1e-9);
    }

    #[test]
    fn payment_scales_with_position_size() {
        let p1 = calculate_funding_payment(10, 100, 0.01);
        let p2 = calculate_funding_payment(20, 100, 0.01);
        assert!((p2 - 2.0 * p1).abs() < 1e-9);
    }
}