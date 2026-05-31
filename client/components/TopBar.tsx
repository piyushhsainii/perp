'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarketTick {
  id: string
  price: number
  change24: number   // percentage
}

interface TopBarProps {
  markPrice: number
  indexPrice: number
  fundingRate: number
  balance: number
  connected: boolean
  onReset: () => void
}

// ─── Spot ticker config ───────────────────────────────────────────────────────

const TICKER_MARKETS: { id: string; base: number; vol: number }[] = [
  { id: 'BTC', base: 65_000, vol: 0.0008 },
  { id: 'ETH', base: 3_200, vol: 0.001 },
  { id: 'SOL', base: 180, vol: 0.0015 },
  { id: 'BNB', base: 580, vol: 0.001 },
  { id: 'ARB', base: 1.20, vol: 0.002 },
  { id: 'DOGE', base: 0.18, vol: 0.002 },
  { id: 'AVAX', base: 38, vol: 0.0015 },
  { id: 'LINK', base: 18, vol: 0.0015 },
]

const TICK_MS = 1_200

function fmtSpot(price: number): string {
  if (price >= 1_000) return price.toLocaleString('en-US', { maximumFractionDigits: 1 })
  if (price >= 10) return price.toFixed(2)
  if (price >= 1) return price.toFixed(3)
  return price.toFixed(4)
}

// ─── Spot ticker hook (lives inside TopBar) ───────────────────────────────────

function useSpotTicker(): MarketTick[] {
  const pricesRef = useRef<Record<string, number>>(
    Object.fromEntries(TICKER_MARKETS.map(m => [m.id, m.base]))
  )
  const change24Ref = useRef<Record<string, number>>(
    Object.fromEntries(TICKER_MARKETS.map(m => [m.id, 0]))
  )
  const [mounted, setMounted] = useState(false)

  // Deterministic initial ticks — same on server and client
  const [ticks, setTicks] = useState<MarketTick[]>(
    TICKER_MARKETS.map(m => ({ id: m.id, price: m.base, change24: 0 }))
  )

  // Seed random values only after hydration completes
  useEffect(() => {
    change24Ref.current = Object.fromEntries(
      TICKER_MARKETS.map(m => [m.id, (Math.random() - 0.48) * 8])
    )
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const id = setInterval(() => {
      const next: MarketTick[] = TICKER_MARKETS.map(m => {
        const prev = pricesRef.current[m.id]
        const shock = (Math.random() - 0.5) * 2 * m.vol * prev
        const price = Math.max(0.0001, prev + shock)
        pricesRef.current[m.id] = price
        // Drift 24h change slightly
        const c24 = change24Ref.current[m.id] + (Math.random() - 0.5) * 0.05
        change24Ref.current[m.id] = Math.max(-15, Math.min(15, c24))
        return { id: m.id, price, change24: change24Ref.current[m.id] }
      })
      setTicks(next)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [mounted])

  return ticks
}

// ─── TopBar ────────────────────────────────────────────────────────────────────

export default function TopBar({
  markPrice, indexPrice, fundingRate, balance, connected, onReset,
}: TopBarProps) {
  const frPct = (fundingRate * 100).toFixed(4)
  const frPos = fundingRate >= 0
  const ticks = useSpotTicker()

  return (
    <div style={{ flexShrink: 0 }}>
      {/* ── Main bar ── */}
      <div style={{
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
        padding: '0 14px',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
      }}>
        {/* Logo */}
        <div style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em',
          color: 'var(--acid)', marginRight: '20px', whiteSpace: 'nowrap',
        }} className="text-glow-acid">
          PERP/DEX
        </div>

        {/* Symbol */}
        <div style={{ marginRight: '20px', borderRight: '1px solid var(--border)', paddingRight: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            BTC-PERP
          </div>
          <div style={{ fontSize: '8px', fontWeight: 300, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            PERPETUAL
          </div>
        </div>

        {/* Mark price */}
        <motion.div
          key={Math.round(markPrice)}
          animate={{ opacity: [0.7, 1] }}
          transition={{ duration: 0.12 }}
          style={{ marginRight: '20px' }}
        >
          <div style={{
            fontSize: '15px', fontWeight: 700, color: 'var(--acid)',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          }}>
            ${markPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}
          </div>
          <div style={{ fontSize: '8px', fontWeight: 300, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            MARK PRICE
          </div>
        </motion.div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: '18px', flex: 1, overflow: 'hidden' }}>
          <Stat label="Index" value={`$${Math.round(indexPrice).toLocaleString()}`} color="var(--ice)" />
          <Stat label="Funding 8H" value={`${frPos ? '+' : ''}${frPct}%`} color={frPos ? 'var(--plasma)' : 'var(--acid)'} />
          <Stat label="24H High" value={`$${Math.round(markPrice * 1.021).toLocaleString()}`} color="var(--acid)" />
          <Stat label="24H Low" value={`$${Math.round(markPrice * 0.979).toLocaleString()}`} color="var(--plasma)" />
          <Stat label="24H Vol" value="$2.41B" color="var(--text)" />
        </div>

        {/* Balance + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: '13px', fontWeight: 700, color: 'var(--gold)',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
            }}>
              ${balance.toFixed(2)}
            </div>
            <div style={{ fontSize: '8px', fontWeight: 300, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              DEMO BALANCE
            </div>
          </div>

          <button
            onClick={onReset}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-dim)', fontSize: '9px', letterSpacing: '0.08em',
              padding: '5px 10px', borderRadius: '4px', cursor: 'pointer',
              fontFamily: 'var(--font-poppins)', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-dim)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            RESET
          </button>

          {/* Connection indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '8px', fontWeight: connected ? 600 : 300,
            color: connected ? 'var(--acid)' : 'var(--text-dim)',
            letterSpacing: '0.08em',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: connected ? 'var(--acid)' : 'var(--muted)',
              boxShadow: connected ? '0 0 6px var(--acid)' : 'none',
              flexShrink: 0,
            }} />
            {connected ? 'LIVE' : 'SIM'}
          </div>
        </div>
      </div>

      {/* ── Spot ticker strip ── */}
      <div style={{
        background: 'rgba(0,0,0,0.35)',
        borderBottom: '1px solid var(--border)',
        height: '26px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Fade edges */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '40px', zIndex: 2,
          background: 'linear-gradient(to right, rgba(0,0,0,0.35), transparent)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px', zIndex: 2,
          background: 'linear-gradient(to left, rgba(0,0,0,0.35), transparent)',
          pointerEvents: 'none',
        }} />

        {/* Scrolling content — duplicated for seamless loop */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          animation: 'tickerScroll 28s linear infinite',
          width: 'max-content',
        }}>
          {[...ticks, ...ticks].map((t, i) => (
            <TickerItem key={`${t.id}-${i}`} tick={t} />
          ))}
        </div>

        <style>{`
          @keyframes tickerScroll {
            from { transform: translateX(0); }
            to   { transform: translateX(-50%); }
          }
        `}</style>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{
        fontSize: '11px', fontWeight: 600, color,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
      }}>
        {value}
      </div>
      <div style={{ fontSize: '8px', fontWeight: 300, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
        {label.toUpperCase()}
      </div>
    </div>
  )
}

function TickerItem({ tick }: { tick: MarketTick }) {
  const up = tick.change24 >= 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '0 18px',
      borderRight: '1px solid var(--border)',
      height: '100%',
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)',
        letterSpacing: '0.06em',
      }}>
        {tick.id}
      </span>
      <span style={{
        fontSize: '10px', fontWeight: 500, color: 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        ${fmtSpot(tick.price)}
      </span>
      <span style={{
        fontSize: '9px', fontWeight: 500,
        color: up ? 'var(--acid)' : 'var(--plasma)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {up ? '▲' : '▼'} {Math.abs(tick.change24).toFixed(2)}%
      </span>
    </div>
  )
}