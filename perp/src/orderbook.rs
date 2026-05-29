use std::collections::{BTreeMap, HashMap, HashSet};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::events::OrderbookEvent;
use crate::position::{Position, PositionSide, Side};
use crate::snapshot::OrderbookSnapshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenOrder {
    pub user_id:           Uuid,
    pub qty:               u32,
    pub filled_qty:        u32,
    pub original_order_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bid {
    pub total_qty: u32,
    pub orders:    Vec<OpenOrder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ask {
    pub total_qty: u32,
    pub orders:    Vec<OpenOrder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Match {
    pub taker: Uuid,
    pub maker: Uuid,
    pub price: u32,
    pub qty:   u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderResponse {
    pub filled_qty: u32,
    pub on_book:    u32,
    pub left_qty:   u32,
    pub matches:    Vec<Match>,
}

pub struct Orderbook {
    pub bids:                BTreeMap<u32, Bid>,
    pub asks:                BTreeMap<u32, Ask>,
    pub positions:           HashMap<Uuid, Position>,
    pub current_order_index: u32,
    pub last_event_index:    u32,
    pub symbol:              String,
    pub maintenance_margin:  f64,
    pub taker_fee:           f64,
    pub maker_fee:           f64,
    pub insurance_fund:      f64,
    pub processed_event_ids: HashSet<Uuid>,
    pub mark_price:          u32,
    pub index_price:         u32,
}

impl Orderbook {
    pub fn new(symbol: impl Into<String>) -> Self {
        Self {
            bids:                BTreeMap::new(),
            asks:                BTreeMap::new(),
            positions:           HashMap::new(),
            current_order_index: 0,
            last_event_index:    0,
            symbol:              symbol.into(),
            maintenance_margin:  0.05,
            taker_fee:           0.0006,
            maker_fee:           -0.0001,
            insurance_fund:      10_000.0,
            processed_event_ids: HashSet::new(),
            mark_price:          0,
            index_price:         0,
        }
    }

    pub fn get_best_bid(&self) -> Option<u32> { self.bids.keys().next_back().copied() }
    pub fn get_best_ask(&self) -> Option<u32> { self.asks.keys().next().copied() }

    pub fn create_order(
        &mut self,
        user_id: Uuid,
        side:    Side,
        qty:     u32,
        price:   Option<u32>,
        margin:  f64,
    ) -> OrderResponse {
        let order_id   = Uuid::new_v4();
        let mut remaining  = qty;
        let mut filled_qty = 0u32;
        let mut matches: Vec<Match> = Vec::new();

        // Collected position updates applied after we release the book borrow.
        // (taker_user, taker_side, maker_user, maker_side, fill, fill_price, taker_margin_share)
        struct PosUpdate {
            taker:              Uuid,
            taker_side:         PositionSide,
            maker:              Uuid,
            maker_side:         PositionSide,
            fill:               u32,
            fill_price:         u32,
            taker_margin_share: f64,
        }
        let mut pos_updates: Vec<PosUpdate> = Vec::new();

        match side {
            Side::Buy => {
                let mut prices_to_remove: Vec<u32> = Vec::new();

                for (&ask_price, ask_level) in self.asks.iter_mut() {
                    if let Some(lim) = price { if ask_price > lim { break; } }
                    if remaining == 0 { break; }

                    let mut level_remaining = remaining;
                    let mut orders_to_remove: Vec<usize> = Vec::new();

                    for (i, maker_order) in ask_level.orders.iter_mut().enumerate() {
                        if level_remaining == 0 { break; }
                        let available = maker_order.qty - maker_order.filled_qty;
                        let fill = available.min(level_remaining);

                        maker_order.filled_qty += fill;
                        level_remaining -= fill;
                        filled_qty += fill;

                        pos_updates.push(PosUpdate {
                            taker:              user_id,
                            taker_side:         PositionSide::Long,
                            maker:              maker_order.user_id,
                            maker_side:         PositionSide::Short,
                            fill,
                            fill_price:         ask_price,
                            taker_margin_share: margin * (fill as f64 / qty as f64),
                        });

                        matches.push(Match { taker: user_id, maker: maker_order.user_id, price: ask_price, qty: fill });

                        if maker_order.filled_qty == maker_order.qty {
                            orders_to_remove.push(i);
                        }
                    }

                    for &i in orders_to_remove.iter().rev() {
                        let filled_order = ask_level.orders.remove(i);
                        ask_level.total_qty = ask_level.total_qty.saturating_sub(filled_order.qty);
                    }

                    remaining = level_remaining;
                    if ask_level.orders.is_empty() { prices_to_remove.push(ask_price); }
                }

                for p in prices_to_remove { self.asks.remove(&p); }
            }

            Side::Sell => {
                let mut prices_to_remove: Vec<u32> = Vec::new();
                let bid_prices: Vec<u32> = self.bids.keys().rev().copied().collect();

                for bid_price in bid_prices {
                    if let Some(lim) = price { if bid_price < lim { break; } }
                    if remaining == 0 { break; }

                    let bid_level = match self.bids.get_mut(&bid_price) {
                        Some(l) => l,
                        None    => continue,
                    };

                    let mut level_remaining = remaining;
                    let mut orders_to_remove: Vec<usize> = Vec::new();

                    for (i, maker_order) in bid_level.orders.iter_mut().enumerate() {
                        if level_remaining == 0 { break; }
                        let available = maker_order.qty - maker_order.filled_qty;
                        let fill = available.min(level_remaining);

                        maker_order.filled_qty += fill;
                        level_remaining -= fill;
                        filled_qty += fill;

                        pos_updates.push(PosUpdate {
                            taker:              user_id,
                            taker_side:         PositionSide::Short,
                            maker:              maker_order.user_id,
                            maker_side:         PositionSide::Long,
                            fill,
                            fill_price:         bid_price,
                            taker_margin_share: margin * (fill as f64 / qty as f64),
                        });

                        matches.push(Match { taker: user_id, maker: maker_order.user_id, price: bid_price, qty: fill });

                        if maker_order.filled_qty == maker_order.qty {
                            orders_to_remove.push(i);
                        }
                    }

                    for &i in orders_to_remove.iter().rev() {
                        let filled = bid_level.orders.remove(i);
                        bid_level.total_qty = bid_level.total_qty.saturating_sub(filled.qty);
                    }

                    remaining = level_remaining;
                    if bid_level.orders.is_empty() { prices_to_remove.push(bid_price); }
                }

                for p in prices_to_remove { self.bids.remove(&p); }
            }
        }

        // Apply position updates now that the book borrow is fully released.
        for u in pos_updates {
            self.open_position(u.taker, u.taker_side, u.fill, u.fill_price, u.taker_margin_share);
            self.open_position(u.maker, u.maker_side, u.fill, u.fill_price, 0.0);
        }

        // Rest unmatched limit qty on the book.
        let on_book = if price.is_some() && remaining > 0 {
            let p = price.unwrap();
            let open_order = OpenOrder { user_id, qty: remaining, filled_qty: 0, original_order_id: order_id };
            match side {
                Side::Buy => {
                    let level = self.bids.entry(p).or_insert(Bid { total_qty: 0, orders: Vec::new() });
                    level.total_qty += remaining;
                    level.orders.push(open_order);
                }
                Side::Sell => {
                    let level = self.asks.entry(p).or_insert(Ask { total_qty: 0, orders: Vec::new() });
                    level.total_qty += remaining;
                    level.orders.push(open_order);
                }
            }
            self.current_order_index += 1;
            remaining
        } else {
            0
        };

        let left_qty = if price.is_none() { remaining } else { 0 };
        OrderResponse { filled_qty, on_book, left_qty, matches }
    }

    pub fn cancel_order(&mut self, order_id: Uuid, price: u32, side: Side) -> bool {
        match side {
            Side::Buy => {
                if let Some(level) = self.bids.get_mut(&price) {
                    if let Some(pos) = level.orders.iter().position(|o| o.original_order_id == order_id) {
                        let removed = level.orders.remove(pos);
                        level.total_qty = level.total_qty.saturating_sub(removed.qty - removed.filled_qty);
                        if level.orders.is_empty() { self.bids.remove(&price); }
                        return true;
                    }
                }
            }
            Side::Sell => {
                if let Some(level) = self.asks.get_mut(&price) {
                    if let Some(pos) = level.orders.iter().position(|o| o.original_order_id == order_id) {
                        let removed = level.orders.remove(pos);
                        level.total_qty = level.total_qty.saturating_sub(removed.qty - removed.filled_qty);
                        if level.orders.is_empty() { self.asks.remove(&price); }
                        return true;
                    }
                }
            }
        }
        false
    }

    pub fn open_position(&mut self, user_id: Uuid, side: PositionSide, size: u32, price: u32, margin: f64) {
        if let Some(pos) = self.positions.get_mut(&user_id) {
            if pos.side == side {
                let total_size = pos.size + size;
                let new_entry  = ((pos.entry_price as f64 * pos.size as f64)
                    + (price as f64 * size as f64)) / total_size as f64;
                pos.entry_price = new_entry as u32;
                pos.size        = total_size;
                pos.margin     += margin;
                return;
            }
            if pos.size >= size {
                let pnl = match pos.side {
                    PositionSide::Long  => (price as f64 - pos.entry_price as f64) * size as f64,
                    PositionSide::Short => (pos.entry_price as f64 - price as f64) * size as f64,
                };
                pos.margin += pnl;
                pos.size   -= size;
                if pos.size == 0 { self.positions.remove(&user_id); }
            } else {
                let remaining = size - pos.size;
                self.positions.remove(&user_id);
                self.positions.insert(user_id, Position::new(user_id, side, remaining, price, margin));
            }
            return;
        }
        self.positions.insert(user_id, Position::new(user_id, side, size, price, margin));
    }

    pub fn close_position(&mut self, user_id: &Uuid, size: u32, mark_price: u32) -> f64 {
        let (realised, should_remove) = if let Some(pos) = self.positions.get_mut(user_id) {
            let close_size     = size.min(pos.size) as f64;
            let pnl            = match pos.side {
                PositionSide::Long  => (mark_price as f64 - pos.entry_price as f64) * close_size,
                PositionSide::Short => (pos.entry_price as f64 - mark_price as f64) * close_size,
            };
            let margin_release = pos.margin * (close_size / pos.size as f64);
            pos.margin -= margin_release;
            pos.size   -= close_size as u32;
            (pnl, pos.size == 0)
        } else {
            return 0.0;
        };
        if should_remove { self.positions.remove(user_id); }
        realised
    }

    pub fn calculate_funding_rate(&self) -> f64 {
        if self.index_price == 0 { return 0.0; }
        (self.mark_price as f64 - self.index_price as f64) / self.index_price as f64
    }

    pub fn update_funding(&mut self) {
        let rate = self.calculate_funding_rate();
        let mark = self.mark_price as f64;
        for pos in self.positions.values_mut() {
            let payment = pos.size as f64 * mark * rate;
            match pos.side {
                PositionSide::Long  => pos.margin -= payment,
                PositionSide::Short => pos.margin += payment,
            }
        }
    }

    pub fn liquidate(&mut self, user_id: &Uuid, mark_price: u32) -> f64 {
        let shortfall = if let Some(pos) = self.positions.get(user_id) {
            let pnl  = pos.unrealized_pnl(mark_price);
            let loss = -(pos.margin + pnl);
            loss.max(0.0)
        } else {
            return 0.0;
        };
        self.positions.remove(user_id);
        if shortfall <= self.insurance_fund {
            self.insurance_fund -= shortfall;
            0.0
        } else {
            let remaining = shortfall - self.insurance_fund;
            self.insurance_fund = 0.0;
            remaining
        }
    }

    pub fn run_adl(&mut self, shortfall: f64, liquidated_side: PositionSide, mark_price: u32) {
        let opposing = match liquidated_side {
            PositionSide::Long  => PositionSide::Short,
            PositionSide::Short => PositionSide::Long,
        };

        let mut ranked: Vec<(Uuid, f64)> = self.positions
            .iter()
            .filter(|(_, p)| p.side == opposing)
            .map(|(&id, p): (&Uuid, &Position)| (id, p.adl_rank(mark_price)))
            .collect();

        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        let mut remaining_shortfall = shortfall;
        for (uid, _) in ranked {
            if remaining_shortfall <= 0.0 { break; }
            if let Some(pos) = self.positions.get(&uid) {
                let notional = pos.size as f64 * mark_price as f64;
                if notional <= remaining_shortfall {
                    remaining_shortfall -= notional;
                    self.positions.remove(&uid);
                } else {
                    let close_size = (remaining_shortfall / mark_price as f64).ceil() as u32;
                    if let Some(pos) = self.positions.get_mut(&uid) {
                        let close_size       = close_size.min(pos.size);
                        let margin_fraction  = close_size as f64 / (close_size as f64 + pos.size as f64);
                        pos.size            -= close_size;
                        pos.margin          -= pos.margin * margin_fraction;
                    }
                    remaining_shortfall = 0.0;
                }
            }
        }
    }

    pub fn save_snapshot(&self) -> OrderbookSnapshot {
        OrderbookSnapshot {
            bids:                self.bids.clone(),
            asks:                self.asks.clone(),
            positions:           self.positions.clone(),
            current_order_index: self.current_order_index,
            last_event_index:    self.last_event_index,
            symbol:              self.symbol.clone(),
            processed_event_ids: self.processed_event_ids.clone(),
            insurance_fund:      self.insurance_fund,
        }
    }

    pub fn load_snapshot(&mut self, snap: OrderbookSnapshot) {
        self.bids                = snap.bids;
        self.asks                = snap.asks;
        self.positions           = snap.positions;
        self.current_order_index = snap.current_order_index;
        self.last_event_index    = snap.last_event_index;
        self.symbol              = snap.symbol;
        self.processed_event_ids = snap.processed_event_ids;
        self.insurance_fund      = snap.insurance_fund;
    }

    pub fn apply_event(&mut self, event: OrderbookEvent) {
        match event {
            OrderbookEvent::OrderPlaced { user_id, side, qty, price, margin, .. } => {
                self.create_order(user_id, side, qty, price, margin);
            }
            OrderbookEvent::OrderCancelled { order_id, price, side, .. } => {
                self.cancel_order(order_id, price, side);
            }
            OrderbookEvent::OrderMatched { .. } => {}
            OrderbookEvent::FundingApplied { mark_price, index_price, .. } => {
                self.mark_price  = mark_price;
                self.index_price = index_price;
                self.update_funding();
            }
            OrderbookEvent::Liquidated { user_id, mark_price, .. } => {
                let shortfall = self.liquidate(&user_id, mark_price);
                if shortfall > 0.0 {
                    self.run_adl(shortfall, PositionSide::Long, mark_price);
                }
            }
            OrderbookEvent::Adl { user_id, mark_price, qty, .. } => {
                self.close_position(&user_id, qty, mark_price);
            }
        }
        self.last_event_index += 1;
    }

    pub fn apply_event_idempotent(&mut self, event: OrderbookEvent) {
        let id = event.event_id();
        if self.processed_event_ids.contains(&id) { return; }
        self.processed_event_ids.insert(id);
        self.apply_event(event);
    }

    pub fn replay_from(&mut self, snap: OrderbookSnapshot, events: Vec<OrderbookEvent>) {
        self.load_snapshot(snap);
        for event in events { self.apply_event_idempotent(event); }
    }

    pub fn mid_price(&self) -> Option<f64> {
        match (self.get_best_bid(), self.get_best_ask()) {
            (Some(b), Some(a)) => Some((b as f64 + a as f64) / 2.0),
            _ => None,
        }
    }

    pub fn spread(&self) -> Option<u32> {
        match (self.get_best_bid(), self.get_best_ask()) {
            (Some(b), Some(a)) if a > b => Some(a - b),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn uid() -> Uuid { Uuid::new_v4() }

    #[test]
    fn test_limit_buy_matches_ask() {
        let mut ob = Orderbook::new("BTC-PERP");
        let seller = uid(); let buyer = uid();
        ob.create_order(seller, Side::Sell, 10, Some(100), 50.0);
        let resp = ob.create_order(buyer, Side::Buy, 10, Some(100), 50.0);
        assert_eq!(resp.filled_qty, 10);
        assert_eq!(resp.on_book, 0);
        assert_eq!(resp.matches.len(), 1);
        assert_eq!(resp.matches[0].price, 100);
    }

    #[test]
    fn test_partial_fill_remainder_on_book() {
        let mut ob = Orderbook::new("BTC-PERP");
        let seller = uid(); let buyer = uid();
        ob.create_order(seller, Side::Sell, 5, Some(100), 25.0);
        let resp = ob.create_order(buyer, Side::Buy, 10, Some(100), 50.0);
        assert_eq!(resp.filled_qty, 5);
        assert_eq!(resp.on_book, 5);
    }

    #[test]
    fn test_market_order_partial_fill_when_illiquid() {
        let mut ob = Orderbook::new("BTC-PERP");
        let seller = uid(); let buyer = uid();
        ob.create_order(seller, Side::Sell, 3, Some(100), 15.0);
        let resp = ob.create_order(buyer, Side::Buy, 10, None, 50.0);
        assert_eq!(resp.filled_qty, 3);
        assert_eq!(resp.left_qty, 7);
        assert_eq!(resp.on_book, 0);
    }

    #[test]
    fn test_cancel_removes_from_book() {
        let mut ob = Orderbook::new("BTC-PERP");
        let seller   = uid();
        let order_id = Uuid::new_v4();
        let level    = ob.asks.entry(200).or_insert(Ask { total_qty: 0, orders: Vec::new() });
        level.orders.push(OpenOrder { user_id: seller, qty: 5, filled_qty: 0, original_order_id: order_id });
        level.total_qty = 5;
        let removed = ob.cancel_order(order_id, 200, Side::Sell);
        assert!(removed);
        assert!(ob.asks.get(&200).is_none());
    }

    #[test]
    fn test_funding_rate_formula() {
        let mut ob = Orderbook::new("BTC-PERP");
        ob.mark_price = 110; ob.index_price = 100;
        assert!((ob.calculate_funding_rate() - 0.1).abs() < 1e-9);
    }

    #[test]
    fn test_funding_longs_pay_shorts_receive() {
        let mut ob = Orderbook::new("BTC-PERP");
        ob.mark_price = 110; ob.index_price = 100;
        let long_id = uid(); let short_id = uid();
        ob.positions.insert(long_id,  Position::new(long_id,  PositionSide::Long,  10, 100, 1000.0));
        ob.positions.insert(short_id, Position::new(short_id, PositionSide::Short, 10, 100, 1000.0));
        let lm = ob.positions[&long_id].margin;
        let sm = ob.positions[&short_id].margin;
        ob.update_funding();
        assert!(ob.positions[&long_id].margin  < lm);
        assert!(ob.positions[&short_id].margin > sm);
    }

    #[test]
    fn test_liquidation_removes_position() {
        let mut ob = Orderbook::new("BTC-PERP");
        let user = uid();
        ob.positions.insert(user, Position::new(user, PositionSide::Long, 10, 100, 50.0));
        ob.liquidate(&user, 1);
        assert!(ob.positions.get(&user).is_none());
    }

    #[test]
    fn test_insurance_fund_absorbs_loss() {
        let mut ob = Orderbook::new("BTC-PERP");
        ob.insurance_fund = 5000.0;
        let user = uid();
        ob.positions.insert(user, Position::new(user, PositionSide::Long, 1, 100, 10.0));
        let shortfall = ob.liquidate(&user, 80);
        assert_eq!(shortfall, 0.0);
        assert!(ob.insurance_fund < 5000.0);
    }

    #[test]
    fn test_open_position_averages_entry_price() {
        let mut ob = Orderbook::new("BTC-PERP");
        let user = uid();
        ob.open_position(user, PositionSide::Long, 10, 100, 500.0);
        ob.open_position(user, PositionSide::Long, 10, 200, 500.0);
        let pos = &ob.positions[&user];
        assert_eq!(pos.size, 20);
        assert_eq!(pos.entry_price, 150);
    }

    #[test]
    fn test_snapshot_round_trip() {
        let mut ob = Orderbook::new("BTC-PERP");
        let user = uid();
        ob.open_position(user, PositionSide::Long, 5, 100, 250.0);
        ob.insurance_fund = 1234.0;
        let snap = ob.save_snapshot();
        let mut ob2 = Orderbook::new("BTC-PERP");
        ob2.load_snapshot(snap);
        assert!(ob2.positions.contains_key(&user));
        assert_eq!(ob2.insurance_fund, 1234.0);
    }

    #[test]
    fn test_idempotent_replay_does_not_double_apply() {
        let mut ob   = Orderbook::new("BTC-PERP");
        let user     = uid();
        let event    = OrderbookEvent::FundingApplied { event_id: Uuid::new_v4(), mark_price: 110, index_price: 100 };
        ob.positions.insert(user, Position::new(user, PositionSide::Long, 10, 100, 1000.0));
        let margin_before = ob.positions[&user].margin;
        ob.apply_event_idempotent(event.clone());
        let margin_after_first = ob.positions[&user].margin;
        assert_ne!(margin_after_first, margin_before);
        ob.apply_event_idempotent(event);
        assert_eq!(ob.positions[&user].margin, margin_after_first);
    }
}