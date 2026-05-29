// ─── Orderbook ────────────────────────────────────────────────────────────────

export interface PriceLevel {
  price: number
  qty: number
}

export interface OrderbookData {
  symbol: string
  bids: PriceLevel[]
  asks: PriceLevel[]
  best_bid: number | null
  best_ask: number | null
  mid_price?: number
  spread?: number
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export type TradeSide = 'Buy' | 'Sell'

export interface Trade {
  taker: string
  maker: string
  price: number
  qty: number
  side?: TradeSide
  timestamp?: number
}

// ─── Positions ────────────────────────────────────────────────────────────────

export type PositionSide = 'Long' | 'Short'

export interface Position {
  user_id: string
  side: PositionSide
  size: number
  entry_price: number
  margin: number
  unrealized_pnl: number
  margin_ratio: number
  liq_price: number
  leverage: number
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface PlaceOrderRequest {
  user_id?: string
  side: 'Buy' | 'Sell'
  qty: number
  price?: number
  margin: number
}

export interface PlaceOrderResponse {
  event_id: string
  original_order_id: string
  queued: boolean
}

// ─── Funding ─────────────────────────────────────────────────────────────────

export interface FundingData {
  funding_rate: number
  mark_price: number
  index_price: number
}

// ─── WebSocket messages ───────────────────────────────────────────────────────

export interface WsOrderbookMessage {
  type: 'orderbook'
  symbol: string
  bids: PriceLevel[]
  asks: PriceLevel[]
  best_bid: number | null
  best_ask: number | null
}

export interface WsTradesMessage {
  type: 'trades'
  trades: Trade[]
}

export type WsMessage = WsOrderbookMessage | WsTradesMessage

// ─── Chart ───────────────────────────────────────────────────────────────────

export interface CandlePoint {
  time: number
  price: number
  volume?: number
}
