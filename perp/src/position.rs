use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PositionSide {
    Long,
    Short,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub user_id:     Uuid,
    pub side:        PositionSide,
    pub size:        u32,
    pub entry_price: u32,
    pub margin:      f64,
}

impl Position {
    pub fn new(user_id: Uuid, side: PositionSide, size: u32, entry_price: u32, margin: f64) -> Self {
        Self { user_id, side, size, entry_price, margin }
    }

    pub fn unrealized_pnl(&self, mark_price: u32) -> f64 {
        let mark  = mark_price as f64;
        let entry = self.entry_price as f64;
        let size  = self.size as f64;
        match self.side {
            PositionSide::Long  => (mark - entry) * size,
            PositionSide::Short => (entry - mark) * size,
        }
    }

    pub fn margin_ratio(&self, mark_price: u32) -> f64 {
        if self.size == 0 { return 0.0; }
        let equity   = self.margin + self.unrealized_pnl(mark_price);
        let notional = self.size as f64 * mark_price as f64;
        equity / notional
    }

    pub fn leverage(&self) -> f64 {
        if self.margin == 0.0 { return 0.0; }
        (self.size as f64 * self.entry_price as f64) / self.margin
    }

    pub fn adl_rank(&self, mark_price: u32) -> f64 {
        self.unrealized_pnl(mark_price) * self.leverage()
    }

    pub fn liquidation_price(&self, maintenance_margin: f64) -> f64 {
        let size   = self.size as f64;
        let entry  = self.entry_price as f64;
        let margin = self.margin;
        let mm     = maintenance_margin;

        match self.side {
            PositionSide::Long => {
                let numerator   = margin - entry * size;
                let denominator = mm * size - size;
                if denominator == 0.0 { return 0.0; }
                numerator / denominator
            }
            PositionSide::Short => {
                let numerator   = margin + entry * size;
                let denominator = size * (1.0 + mm);
                numerator / denominator
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Side {
    Buy,
    Sell,
}