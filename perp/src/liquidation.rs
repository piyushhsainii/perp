//! Liquidation and Auto-Deleveraging (ADL) engine.

use uuid::Uuid;
use crate::orderbook::Orderbook;
use crate::position::PositionSide;

pub fn check_and_liquidate(ob: &mut Orderbook) -> Vec<(Uuid, f64)> {
    let mark = ob.mark_price;
    let mm   = ob.maintenance_margin;

    let candidates: Vec<Uuid> = ob.positions
        .iter()
        .filter(|(_, p): &(&Uuid, &crate::position::Position)| p.margin_ratio(mark) <= mm)
        .map(|(id, _)| *id)
        .collect();

    let mut adl_needed: Vec<(Uuid, f64)> = Vec::new();

    for uid in candidates {
        log::warn!("[liquidation] liquidating user={uid} at mark={mark}");
        let shortfall = ob.liquidate(&uid, mark);
        if shortfall > 0.0 {
            log::warn!("[liquidation] ADL required, shortfall={shortfall:.2}");
            adl_needed.push((uid, shortfall));
        }
    }

    adl_needed
}

pub fn run_adl_for_shortfall(ob: &mut Orderbook, shortfall: f64, liquidated_side: PositionSide) {
    let mark = ob.mark_price;
    ob.run_adl(shortfall, liquidated_side, mark);
}

pub fn get_liquidation_price(ob: &Orderbook, user_id: &Uuid) -> Option<f64> {
    ob.positions.get(user_id).map(|p: &crate::position::Position| p.liquidation_price(ob.maintenance_margin))
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;
    use crate::orderbook::Orderbook;
    use crate::position::{Position, PositionSide};

    #[test]
    fn undercollateralised_position_is_liquidated() {
        let mut ob = Orderbook::new("BTC-PERP");
        ob.mark_price = 1;
        let user = Uuid::new_v4();
        ob.positions.insert(user, Position::new(user, PositionSide::Long, 10, 100, 5.0));
        let adl = check_and_liquidate(&mut ob);
        assert!(ob.positions.get(&user).is_none(), "position should be removed");
        let _ = adl;
    }

    #[test]
    fn healthy_position_is_not_liquidated() {
        let mut ob = Orderbook::new("BTC-PERP");
        ob.mark_price = 99;
        let user = Uuid::new_v4();
        ob.positions.insert(user, Position::new(user, PositionSide::Long, 1, 100, 500.0));
        check_and_liquidate(&mut ob);
        assert!(ob.positions.contains_key(&user), "healthy position should remain");
    }

    #[test]
    fn liquidation_price_long_is_below_entry() {
        let ob = Orderbook::new("BTC-PERP");
        let user = Uuid::new_v4();
        let pos = Position::new(user, PositionSide::Long, 10, 100, 50.0);
        let liq = pos.liquidation_price(ob.maintenance_margin);
        assert!(liq < 100.0, "long liq price should be below entry");
    }

    #[test]
    fn liquidation_price_short_is_above_entry() {
        let ob = Orderbook::new("BTC-PERP");
        let user = Uuid::new_v4();
        let pos = Position::new(user, PositionSide::Short, 10, 100, 50.0);
        let liq = pos.liquidation_price(ob.maintenance_margin);
        assert!(liq > 100.0, "short liq price should be above entry");
    }
}