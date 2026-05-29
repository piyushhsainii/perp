'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { SimPosition } from '../lib/simulation'

interface PositionPanelProps {
  position: SimPosition | null
  positionStats: { upnl: number; mr: number; liqPrice: number } | null
  markPrice: number
  balance: number
  onClose: () => void
  liquidated: boolean
}

export default function PositionPanel({ position, positionStats, markPrice, balance, onClose, liquidated }: PositionPanelProps) {
  const equity = balance + (positionStats?.upnl ?? 0) + (position?.margin ?? 0)
  const totalPnlPct = position && positionStats ? (positionStats.upnl / position.margin) * 100 : 0

  const labelStyle = {
    fontSize: '8px',
    fontWeight: 300 as const,
    color: 'var(--text-dim)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  }
  const valueStyle = {
    fontSize: '10px',
    fontWeight: 600 as const,
    color: 'var(--text)',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.01em',
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '7px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Position</span>
        <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--acid)', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
          Equity ${equity.toFixed(2)}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        <AnimatePresence mode="wait">
          {liquidated ? (
            <motion.div key="liq"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--plasma)' }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>⚡</div>
              <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em' }}>LIQUIDATED</div>
              <div style={{ fontSize: '10px', fontWeight: 300, color: 'var(--text-dim)', marginTop: '6px' }}>
                Position force-closed.
              </div>
            </motion.div>

          ) : position && positionStats ? (
            <motion.div key="pos"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {/* Side + leverage */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
                  padding: '3px 10px', borderRadius: '3px',
                  background: position.side === 'Long' ? 'rgba(0,255,136,0.1)' : 'rgba(255,59,107,0.1)',
                  color: position.side === 'Long' ? 'var(--acid)' : 'var(--plasma)',
                  border: `1px solid ${position.side === 'Long' ? 'rgba(0,255,136,0.2)' : 'rgba(255,59,107,0.2)'}`,
                }}>
                  {position.side === 'Long' ? '▲' : '▼'} {position.side.toUpperCase()}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gold)', letterSpacing: '-0.01em' }}>
                  {position.leverage}× Leverage
                </span>
              </div>

              {/* PnL card */}
              <motion.div
                key={Math.round(positionStats.upnl * 10)}
                animate={{ opacity: [0.8, 1] }}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${positionStats.upnl >= 0 ? 'rgba(0,255,136,0.12)' : 'rgba(255,59,107,0.12)'}`,
                  borderRadius: '4px',
                  padding: '10px',
                  textAlign: 'center',
                }}
              >
                <div style={labelStyle}>Unrealised PnL</div>
                <motion.div
                  key={positionStats.upnl.toFixed(1)}
                  animate={{ scale: [1.03, 1] }} transition={{ duration: 0.12 }}
                  style={{ fontSize: '18px', fontWeight: 600, color: positionStats.upnl >= 0 ? 'var(--acid)' : 'var(--plasma)', letterSpacing: '-0.02em', marginTop: '3px' }}
                >
                  {positionStats.upnl >= 0 ? '+' : ''}${positionStats.upnl.toFixed(2)}
                </motion.div>
                <div style={{ fontSize: '10px', fontWeight: 300, color: positionStats.upnl >= 0 ? 'var(--acid)' : 'var(--plasma)', opacity: 0.75, marginTop: '2px' }}>
                  {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}% on margin
                </div>
              </motion.div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {[
                  { label: 'Size', value: `${position.size} ct` },
                  { label: 'Entry', value: `$${position.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
                  { label: 'Mark', value: `$${markPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
                  { label: 'Margin', value: `$${position.margin.toFixed(2)}` },
                  { label: 'Margin Ratio', value: `${(positionStats.mr * 100).toFixed(2)}%`, warn: positionStats.mr < 0.08 },
                  { label: 'Liq. Price', value: `$${Math.max(0, positionStats.liqPrice).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, warn: true },
                ].map(({ label, value, warn }) => (
                  <div key={label} style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    padding: '5px 8px',
                  }}>
                    <div style={labelStyle}>{label}</div>
                    <div style={{ ...valueStyle, color: warn ? 'var(--plasma)' : 'var(--text)', marginTop: '2px' }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Health bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', ...labelStyle, marginBottom: '4px' }}>
                  <span>Margin Health</span>
                  <span style={{ fontWeight: 600, color: positionStats.mr > 0.1 ? 'var(--acid)' : positionStats.mr > 0.07 ? 'var(--gold)' : 'var(--plasma)' }}>
                    {(positionStats.mr * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <motion.div
                    animate={{ width: `${Math.min(100, positionStats.mr * 500)}%` }}
                    transition={{ duration: 0.3 }}
                    style={{
                      height: '100%',
                      background: positionStats.mr > 0.1 ? 'var(--acid)' : positionStats.mr > 0.07 ? 'var(--gold)' : 'var(--plasma)',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              </div>

              <button className="btn-sell" onClick={onClose} style={{ fontSize: '10px', fontWeight: 600, marginTop: '2px' }}>
                Close Position
              </button>
            </motion.div>

          ) : (
            <motion.div key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text-dim)' }}
            >
              <div style={{ fontSize: '20px', marginBottom: '8px', opacity: 0.3 }}>◈</div>
              <div style={{ fontSize: '11px', fontWeight: 300 }}>No open position.</div>
              <div style={{ fontSize: '9px', fontWeight: 300, opacity: 0.6, marginTop: '4px' }}>Place an order to open one.</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}