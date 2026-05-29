'use client'

import { motion } from 'framer-motion'

interface FundingRateProps { rate: number; markPrice: number; indexPrice: number }

export default function FundingRate({ rate, markPrice, indexPrice }: FundingRateProps) {
  const pct = (rate * 100).toFixed(4)
  const positive = rate >= 0

  return (
    <div style={{
      background: 'var(--panel)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '5px 14px',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: '8px', fontWeight: 300, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>FUNDING RATE (8H)</span>
      <motion.span
        key={pct}
        animate={{ opacity: [0.5, 1] }}
        transition={{ duration: 0.25 }}
        style={{ fontSize: '11px', fontWeight: 600, color: positive ? 'var(--plasma)' : 'var(--acid)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}
      >
        {positive ? '+' : ''}{pct}%
      </motion.span>
      <span style={{ fontSize: '8px', fontWeight: 300, color: 'var(--text-dim)' }}>
        {positive ? 'Shorts pay longs' : 'Longs pay shorts'}
      </span>
      <span style={{ fontSize: '8px', fontWeight: 300, color: 'var(--text-dim)' }}>
        Spread <span style={{ color: 'var(--gold)', fontWeight: 600 }}>${Math.abs(markPrice - indexPrice).toFixed(0)}</span>
      </span>
    </div>
  )
}