'use client'

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PriceLevel } from '../lib/types'

interface OrderbookProps {
  bids: PriceLevel[]
  asks: PriceLevel[]
  bestBid: number | null
  bestAsk: number | null
  bidDir: 'up' | 'down' | null
  askDir: 'up' | 'down' | null
  market?: string
}

const ROW_COUNT = 14

// Fixed-width number formatter — always same character count so columns don't jump
function fmtPrice(p: number, decimals = 1) {
  return p.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtQty(q: number) {
  return q.toFixed(3)
}
function fmtTotal(p: number, q: number) {
  const v = p * q
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(0)
}

export default function Orderbook({ bids, asks, bestBid, bestAsk, bidDir, askDir, market = 'BTC-PERP' }: OrderbookProps) {
  const topAsks = useMemo(
    () => [...asks].sort((a, b) => a.price - b.price).slice(0, ROW_COUNT).reverse(),
    [asks],
  )
  const topBids = useMemo(
    () => [...bids].sort((a, b) => b.price - a.price).slice(0, ROW_COUNT),
    [bids],
  )

  // Cumulative totals for depth bar
  const asksWithDepth = useMemo(() => {
    let cum = 0
    return [...topAsks].reverse().map(l => { cum += l.qty; return { ...l, cum } }).reverse()
  }, [topAsks])

  const bidsWithDepth = useMemo(() => {
    let cum = 0
    return topBids.map(l => { cum += l.qty; return { ...l, cum } })
  }, [topBids])

  const maxAskCum = asksWithDepth[asksWithDepth.length - 1]?.cum ?? 1
  const maxBidCum = bidsWithDepth[bidsWithDepth.length - 1]?.cum ?? 1

  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null
  const spreadPct = spread != null && bestAsk ? ((spread / bestAsk) * 100).toFixed(3) : null
  const midPrice = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '7px 10px 6px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
          Order Book
        </span>
        {spread != null && (
          <span style={{ fontSize: '8.5px', color: 'var(--gold)', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
            Spread {spread.toFixed(1)} <span style={{ opacity: 0.6 }}>({spreadPct}%)</span>
          </span>
        )}
      </div>

      {/* ── Column headers ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '44% 28% 28%',
        padding: '3px 10px',
        fontSize: '8px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: 'var(--text-dim)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        flexShrink: 0,
        textTransform: 'uppercase',
      }}>
        <span>Price</span>
        <span style={{ textAlign: 'right' }}>Size</span>
        <span style={{ textAlign: 'right' }}>Total</span>
      </div>

      {/* ── ASKS (sell side) — best ask at bottom ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {asksWithDepth.map(level => (
            <BookRow
              key={`ask-${level.price}`}
              level={level}
              maxCum={maxAskCum}
              side="ask"
              fmtPrice={fmtPrice}
              fmtQty={fmtQty}
              fmtTotal={fmtTotal}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* ── Spread / Mid price divider ── */}
      <div style={{
        padding: '5px 10px',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.25)',
        gap: '4px',
      }}>
        {/* Best ask */}
        <motion.span
          key={`ba-${Math.round((bestAsk ?? 0) * 10)}`}
          initial={{ color: 'var(--plasma)' }}
          animate={{ color: 'var(--plasma)' }}
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--plasma)',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 0,
          }}
        >
          {bestAsk ? fmtPrice(bestAsk) : '—'}
          {askDir === 'up' && <span style={{ fontSize: '8px', marginLeft: '3px', color: 'var(--acid)' }}>▲</span>}
          {askDir === 'down' && <span style={{ fontSize: '8px', marginLeft: '3px', color: 'var(--plasma)' }}>▼</span>}
        </motion.span>

        {/* Mid */}
        {midPrice != null && (
          <span style={{ fontSize: '8px', color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            mid {fmtPrice(midPrice)}
          </span>
        )}

        {/* Best bid */}
        <motion.span
          key={`bb-${Math.round((bestBid ?? 0) * 10)}`}
          initial={{ color: 'var(--acid)' }}
          animate={{ color: 'var(--acid)' }}
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--acid)',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 0,
            textAlign: 'right',
          }}
        >
          {bidDir === 'up' && <span style={{ fontSize: '8px', marginRight: '3px' }}>▲</span>}
          {bidDir === 'down' && <span style={{ fontSize: '8px', marginRight: '3px', color: 'var(--plasma)' }}>▼</span>}
          {bestBid ? fmtPrice(bestBid) : '—'}
        </motion.span>
      </div>

      {/* ── BIDS (buy side) ── */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {bidsWithDepth.map(level => (
            <BookRow
              key={`bid-${level.price}`}
              level={level}
              maxCum={maxBidCum}
              side="bid"
              fmtPrice={fmtPrice}
              fmtQty={fmtQty}
              fmtTotal={fmtTotal}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function BookRow({
  level,
  maxCum,
  side,
  fmtPrice,
  fmtQty,
  fmtTotal,
}: {
  level: PriceLevel & { cum: number }
  maxCum: number
  side: 'bid' | 'ask'
  fmtPrice: (p: number) => string
  fmtQty: (q: number) => string
  fmtTotal: (p: number, q: number) => string
}) {
  const depthPct = Math.min(100, (level.cum / maxCum) * 100)
  const isBid = side === 'bid'

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '44% 28% 28%',
        padding: '0 10px',
        height: '19px',
        alignItems: 'center',
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      {/* Depth bar — anchored right, cumulative */}
      <motion.div
        animate={{ width: `${depthPct}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          insetBlock: '1px',
          right: 0,
          background: isBid ? 'rgba(0,255,136,0.08)' : 'rgba(255,59,107,0.09)',
          pointerEvents: 'none',
        }}
      />

      {/* Price */}
      <span style={{
        color: isBid ? 'var(--acid)' : 'var(--plasma)',
        fontSize: '10.5px',
        fontWeight: 400,
        letterSpacing: '-0.01em',
        position: 'relative',
        zIndex: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {fmtPrice(level.price)}
      </span>

      {/* Size */}
      <span style={{
        color: 'var(--text)',
        fontSize: '10px',
        fontWeight: 300,
        textAlign: 'right',
        position: 'relative',
        zIndex: 1,
        fontVariantNumeric: 'tabular-nums',
        opacity: 0.85,
      }}>
        {fmtQty(level.qty)}
      </span>

      {/* Total (notional) */}
      <span style={{
        color: 'var(--text-dim)',
        fontSize: '9.5px',
        fontWeight: 300,
        textAlign: 'right',
        position: 'relative',
        zIndex: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {fmtTotal(level.price, level.qty)}
      </span>
    </motion.div>
  )
}