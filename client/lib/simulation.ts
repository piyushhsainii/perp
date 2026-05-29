'use client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimTrade {
  id: string
  side: 'Buy' | 'Sell'
  price: number
  qty: number
  timestamp: number
  pnl?: number          // realised PnL for closed trades
}

export interface SimPosition {
  side: 'Long' | 'Short'
  size: number          // contracts
  entryPrice: number
  margin: number        // collateral locked
  leverage: number
}

export interface DemoState {
  balance: number       // free cash
  position: SimPosition | null
  trades: SimTrade[]
  markPrice: number
  indexPrice: number
}

// ─── Price simulation ─────────────────────────────────────────────────────────

/** One tick of the random walk — returns new mark price. */
export function nextMarkPrice(
  current: number,
  volatility = 0.0008,   // ~0.08 % per tick
  trend = 0,             // slight upward / downward drift
): number {
  const shock = (Math.random() - 0.5) * 2 * volatility * current
  const drift = trend * current
  return Math.max(100, current + shock + drift)
}

/** Index tracks mark with slight lag + noise. */
export function nextIndexPrice(mark: number, prevIndex: number): number {
  const lag = 0.05
  const noise = (Math.random() - 0.5) * 4
  return prevIndex + (mark - prevIndex) * lag + noise
}

/** Build a synthetic orderbook around a mark price. */
export function buildSyntheticOrderbook(
  markPrice: number,
  depth = 14,
): { bids: { price: number; qty: number }[]; asks: { price: number; qty: number }[] } {
  const spread = Math.max(1, Math.round(markPrice * 0.0001))
  const bids = Array.from({ length: depth }, (_, i) => ({
    price: Math.round(markPrice - spread - i * spread * (1 + Math.random())),
    qty: Math.floor(Math.random() * 30 + 1),
  }))
  const asks = Array.from({ length: depth }, (_, i) => ({
    price: Math.round(markPrice + spread + i * spread * (1 + Math.random())),
    qty: Math.floor(Math.random() * 30 + 1),
  }))
  return { bids, asks }
}

// ─── Position maths ──────────────────────────────────────────────────────────

export function unrealisedPnl(pos: SimPosition, markPrice: number): number {
  if (!pos) return 0
  const sign = pos.side === 'Long' ? 1 : -1
  return sign * (markPrice - pos.entryPrice) * pos.size
}

export function marginRatio(pos: SimPosition, markPrice: number): number {
  const equity = pos.margin + unrealisedPnl(pos, markPrice)
  return equity / (pos.size * markPrice)
}

export function liquidationPrice(pos: SimPosition, mm = 0.05): number {
  const { size, entryPrice, margin } = pos
  if (pos.side === 'Long') {
    return (margin - entryPrice * size) / (mm * size - size)
  }
  return (margin + entryPrice * size) / (size * (1 + mm))
}

// ─── Order execution ─────────────────────────────────────────────────────────

export interface OrderParams {
  side: 'Buy' | 'Sell'
  qty: number
  price?: number     // limit; undefined = market
  leverage: number
}

export interface OrderResult {
  ok: boolean
  error?: string
  trade?: SimTrade
  newState?: Partial<DemoState>
}

export function executeOrder(
  state: DemoState,
  params: OrderParams,
  markPrice: number,
): OrderResult {
  const fillPrice = params.price ?? markPrice
  const margin = (fillPrice * params.qty) / params.leverage
  const positionSide: 'Long' | 'Short' = params.side === 'Buy' ? 'Long' : 'Short'

  if (margin > state.balance) {
    return { ok: false, error: `Insufficient balance. Need $${margin.toFixed(2)}, have $${state.balance.toFixed(2)}` }
  }
  if (params.qty <= 0) {
    return { ok: false, error: 'Quantity must be > 0' }
  }

  const trade: SimTrade = {
    id: crypto.randomUUID(),
    side: params.side,
    price: fillPrice,
    qty: params.qty,
    timestamp: Date.now(),
  }

  let newBalance = state.balance
  let newPosition = state.position
  let realisedPnl = 0

  if (!newPosition) {
    // Open fresh position
    newBalance -= margin
    newPosition = {
      side: positionSide,
      size: params.qty,
      entryPrice: fillPrice,
      margin,
      leverage: params.leverage,
    }
  } else if (newPosition.side === positionSide) {
    // Add to existing (VWAP entry)
    newBalance -= margin
    const totalSize = newPosition.size + params.qty
    const newEntry =
      (newPosition.entryPrice * newPosition.size + fillPrice * params.qty) / totalSize
    newPosition = {
      ...newPosition,
      size: totalSize,
      entryPrice: newEntry,
      margin: newPosition.margin + margin,
    }
  } else {
    // Reduce / close / flip
    const closeSize = Math.min(params.qty, newPosition.size)
    const sign = newPosition.side === 'Long' ? 1 : -1
    realisedPnl = sign * (fillPrice - newPosition.entryPrice) * closeSize
    const marginRelease = newPosition.margin * (closeSize / newPosition.size)
    newBalance += marginRelease + realisedPnl
    trade.pnl = realisedPnl

    if (closeSize === newPosition.size) {
      newPosition = null
      // Flip with remainder
      const remainder = params.qty - closeSize
      if (remainder > 0) {
        const flipMargin = (fillPrice * remainder) / params.leverage
        if (flipMargin <= newBalance) {
          newBalance -= flipMargin
          newPosition = {
            side: positionSide,
            size: remainder,
            entryPrice: fillPrice,
            margin: flipMargin,
            leverage: params.leverage,
          }
        }
      }
    } else {
      const newSize = newPosition.size - closeSize
      newPosition = {
        ...newPosition,
        size: newSize,
        margin: newPosition.margin - marginRelease,
      }
    }
  }

  return {
    ok: true,
    trade,
    newState: {
      balance: newBalance,
      position: newPosition,
      trades: [trade, ...state.trades].slice(0, 100),
    },
  }
}
