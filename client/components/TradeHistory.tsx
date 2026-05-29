'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { SimTrade } from '../lib/simulation'

interface TradeHistoryProps { trades: SimTrade[] }

export default function TradeHistory({ trades }: TradeHistoryProps) {
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}>
      <div style={{
        padding: '7px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
          Trade History
        </span>
        {trades.length > 0 && (
          <span style={{
            fontSize: '9px',
            fontWeight: 600,
            color: totalPnl >= 0 ? 'var(--acid)' : 'var(--plasma)',
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            Total PnL {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </span>
        )}
      </div>

      {trades.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '22% 14% 14% 22% 28%',
          padding: '3px 10px',
          fontSize: '9px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: 'var(--text-dim)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          textTransform: 'uppercase',
        }}>
          <span>Time</span>
          <span>Side</span>
          <span style={{ textAlign: 'right' }}>Qty</span>
          <span style={{ textAlign: 'right' }}>Price</span>
          <span style={{ textAlign: 'right' }}>PnL</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {trades.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text-dim)', fontSize: '11px', fontWeight: 300 }}>
              <div style={{ fontSize: '18px', marginBottom: '6px', opacity: 0.3 }}>⊘</div>
              No trades yet.
            </motion.div>
          ) : (
            trades.map(trade => {
              const isBuy = trade.side === 'Buy'
              const d = new Date(trade.timestamp)
              const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
              return (
                <motion.div
                  key={trade.id}
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '22% 14% 14% 22% 28%',
                    padding: '0 10px',
                    height: '24px',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.025)',
                    fontSize: '10px',
                  }}
                >
                  <span style={{ color: 'var(--text-dim)', fontWeight: 300 }}>{time}</span>
                  <span style={{ color: isBuy ? 'var(--acid)' : 'var(--plasma)', fontWeight: 600, fontSize: '9px', letterSpacing: '0.04em' }}>
                    {isBuy ? '▲' : '▼'}{isBuy ? 'BUY' : 'SELL'}
                  </span>
                  <span style={{ color: 'var(--text)', fontWeight: 300, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{trade.qty}</span>
                  <span style={{ color: 'var(--text)', fontWeight: 300, textAlign: 'right', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                    ${trade.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                  <span style={{
                    textAlign: 'right',
                    fontWeight: trade.pnl !== undefined ? 600 : 300,
                    color: trade.pnl === undefined ? 'var(--text-dim)' : trade.pnl >= 0 ? 'var(--acid)' : 'var(--plasma)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.01em',
                  }}>
                    {trade.pnl !== undefined ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '—'}
                  </span>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}