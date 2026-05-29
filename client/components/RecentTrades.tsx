'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SimTrade } from '../lib/simulation'

const MAX = 40

function generateTrade(price: number): SimTrade {
  const delta = (Math.random() - 0.495) * price * 0.0015
  return {
    id: crypto.randomUUID(),
    side: delta > 0 ? 'Buy' : 'Sell',
    price: Math.max(100, Math.round(price + delta)),
    qty: Math.floor(Math.random() * 18) + 1,
    timestamp: Date.now(),
  }
}

export default function RecentTrades({ markPrice }: { markPrice: number }) {
  const [trades, setTrades] = useState<SimTrade[]>([])
  const priceRef = useRef(markPrice)

  useEffect(() => { priceRef.current = markPrice }, [markPrice])

  useEffect(() => {
    // seed
    setTrades(Array.from({ length: 20 }, () => generateTrade(priceRef.current)))
    const id = setInterval(() => {
      const t = generateTrade(priceRef.current)
      setTrades(prev => [t, ...prev].slice(0, MAX))
    }, 500 + Math.random() * 900)
    return () => clearInterval(id)
  }, [])

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
          Recent Trades
        </span>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--acid)', display: 'inline-block', boxShadow: '0 0 5px var(--acid)' }} />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '40% 28% 32%',
        padding: '3px 10px',
        fontSize: '9px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: 'var(--text-dim)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        textTransform: 'uppercase',
      }}>
        <span>Price</span>
        <span style={{ textAlign: 'right' }}>Size</span>
        <span style={{ textAlign: 'right' }}>Time</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {trades.map(t => {
            const isBuy = t.side === 'Buy'
            const d = new Date(t.timestamp)
            const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, backgroundColor: isBuy ? 'rgba(0,255,136,0.18)' : 'rgba(255,59,107,0.18)' }}
                animate={{ opacity: 1, backgroundColor: 'transparent' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40% 28% 32%',
                  padding: '0 10px',
                  height: '20px',
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.02)',
                }}
              >
                <span style={{ color: isBuy ? 'var(--acid)' : 'var(--plasma)', fontSize: '10px', fontWeight: 300, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                  {t.price.toLocaleString()}
                </span>
                <span style={{ color: 'var(--text)', fontSize: '10px', fontWeight: 300, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {t.qty}
                </span>
                <span style={{ color: 'var(--text-dim)', fontSize: '9px', fontWeight: 300, textAlign: 'right' }}>
                  {time}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}