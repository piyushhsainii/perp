'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { UsePhantomReturn } from '../hooks/usePhantom'

// ─── Spot ticker ──────────────────────────────────────────────────────────────

const TICKER_MARKETS = [
  { id: 'BTC', base: 65_000, vol: 0.0008 },
  { id: 'ETH', base: 3_200, vol: 0.001 },
  { id: 'SOL', base: 180, vol: 0.0015 },
  { id: 'BNB', base: 580, vol: 0.001 },
  { id: 'ARB', base: 1.20, vol: 0.002 },
  { id: 'DOGE', base: 0.18, vol: 0.002 },
  { id: 'AVAX', base: 38, vol: 0.0015 },
  { id: 'LINK', base: 18, vol: 0.0015 },
]

interface MarketTick { id: string; price: number; change24: number }

function fmtSpot(p: number) {
  if (p >= 1_000) return p.toLocaleString('en-US', { maximumFractionDigits: 1 })
  if (p >= 10) return p.toFixed(2)
  if (p >= 1) return p.toFixed(3)
  return p.toFixed(4)
}

function useSpotTicker(): MarketTick[] {
  const prices = useRef(Object.fromEntries(TICKER_MARKETS.map(m => [m.id, m.base])))
  const changes = useRef(Object.fromEntries(TICKER_MARKETS.map(m => [m.id, (Math.random() - 0.48) * 8])))
  const [ticks, setTicks] = useState<MarketTick[]>(
    TICKER_MARKETS.map(m => ({ id: m.id, price: m.base, change24: changes.current[m.id] }))
  )
  useEffect(() => {
    const id = setInterval(() => {
      setTicks(TICKER_MARKETS.map(m => {
        const prev = prices.current[m.id]
        const next = Math.max(0.0001, prev + (Math.random() - 0.5) * 2 * m.vol * prev)
        const c24 = Math.max(-15, Math.min(15, changes.current[m.id] + (Math.random() - 0.5) * 0.05))
        prices.current[m.id] = next
        changes.current[m.id] = c24
        return { id: m.id, price: next, change24: c24 }
      }))
    }, 1_200)
    return () => clearInterval(id)
  }, [])
  return ticks
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TopBarProps {
  markPrice: number
  indexPrice: number
  fundingRate: number
  balance: number
  connected: boolean   // WS/backend connection
  onReset: () => void
  wallet: UsePhantomReturn
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TopBar({
  markPrice, indexPrice, fundingRate, balance, connected, onReset, wallet,
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
        padding: '0 14px', height: '44px',
        display: 'flex', alignItems: 'center', gap: 0,
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
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            BTC-PERP
          </div>
          <div style={{ fontSize: '8px', fontWeight: 300, color: 'rgba(107,114,128,0.7)', letterSpacing: '0.08em' }}>
            Perpetual Futures
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
            fontSize: '15px', fontWeight: 600, color: 'var(--acid)',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          }}>
            ${markPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}
          </div>
          <div style={{ fontSize: '8px', fontWeight: 300, color: 'rgba(107,114,128,0.7)', letterSpacing: '0.06em' }}>
            Mark Price
          </div>
        </motion.div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: '18px', flex: 1, overflow: 'hidden' }}>
          <Stat label="Index Price" hint="spot reference" value={`$${Math.round(indexPrice).toLocaleString()}`} color="var(--ice)" />
          <Stat label="Funding (8H)" hint={frPos ? 'longs pay shorts' : 'shorts pay longs'}
            value={`${frPos ? '+' : ''}${frPct}%`} color={frPos ? 'var(--plasma)' : 'var(--acid)'} />
          <Stat label="24H High" value={`$${Math.round(markPrice * 1.021).toLocaleString()}`} color="var(--acid)" />
          <Stat label="24H Low" value={`$${Math.round(markPrice * 0.979).toLocaleString()}`} color="var(--plasma)" />
          <Stat label="24H Volume" value="$2.41B" color="var(--text)" />
        </div>

        {/* Right section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {/* Balance */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              ${balance.toFixed(2)}
            </div>
            <div style={{ fontSize: '8px', fontWeight: 300, color: 'rgba(107,114,128,0.7)', letterSpacing: '0.06em' }}>
              Demo Balance
            </div>
          </div>

          {/* Reset */}
          <GhostButton onClick={onReset}>Reset</GhostButton>

          {/* WS status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '8px', fontWeight: connected ? 500 : 300,
            color: connected ? 'var(--acid)' : 'var(--text-dim)',
            letterSpacing: '0.08em',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: connected ? 'var(--acid)' : 'var(--muted)',
              boxShadow: connected ? '0 0 6px var(--acid)' : 'none',
              flexShrink: 0,
            }} />
            {connected ? 'Live' : 'Sim'}
          </div>

          {/* Phantom wallet button */}
          {wallet?.connected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: 'rgba(153,69,255,0.12)',
                border: '1px solid rgba(153,69,255,0.3)',
                borderRadius: '5px', padding: '4px 8px',
              }}>
                <span style={{ fontSize: '10px' }}>👻</span>
                <span style={{ fontSize: '9px', fontWeight: 400, color: '#B57BFF', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
                  {wallet.shortAddress}
                </span>
              </div>
              <GhostButton onClick={wallet.disconnect}>Disconnect</GhostButton>
            </div>
          ) : (
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              style={{
                padding: '5px 12px',
                background: wallet.connecting ? 'rgba(153,69,255,0.2)' : 'linear-gradient(135deg, #9945FF, #6C3EC2)',
                border: 'none', borderRadius: '5px',
                color: '#fff', fontSize: '9px', fontWeight: 600,
                fontFamily: 'var(--font-poppins)', letterSpacing: '0.06em',
                cursor: wallet.connecting ? 'wait' : 'pointer',
                boxShadow: '0 0 14px rgba(153,69,255,0.25)',
                transition: 'opacity 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {wallet.connecting ? 'Connecting…' : '👻 Connect Wallet'}
            </button>
          )}
        </div>
      </div>

      {/* ── Spot ticker strip ── */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid var(--border)',
        height: '26px', overflow: 'hidden', position: 'relative',
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40px', zIndex: 2, background: 'linear-gradient(to right, rgba(0,0,0,0.3), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px', zIndex: 2, background: 'linear-gradient(to left, rgba(0,0,0,0.3), transparent)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', animation: 'tickerScroll 28s linear infinite', width: 'max-content' }}>
          {[...ticks, ...ticks].map((t, i) => (
            <TickerItem key={`${t.id}-${i}`} tick={t} />
          ))}
        </div>
        <style>{`@keyframes tickerScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ label, hint, value, color }: { label: string; hint?: string; value: string; color: string }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: '11px', fontWeight: 500, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
        {value}
      </div>
      <div style={{ fontSize: '8px', fontWeight: 300, color: 'rgba(107,114,128,0.65)', letterSpacing: '0.04em' }}>
        {label}{hint ? <span style={{ opacity: 0.6 }}> — {hint}</span> : null}
      </div>
    </div>
  )
}

function TickerItem({ tick }: { tick: MarketTick }) {
  const up = tick.change24 >= 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '0 16px', borderRight: '1px solid var(--border)',
      height: '100%', flexShrink: 0,
    }}>
      <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>{tick.id}</span>
      <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${fmtSpot(tick.price)}</span>
      <span style={{ fontSize: '8.5px', fontWeight: 400, color: up ? 'var(--acid)' : 'var(--plasma)', fontVariantNumeric: 'tabular-nums' }}>
        {up ? '▲' : '▼'} {Math.abs(tick.change24).toFixed(2)}%
      </span>
    </div>
  )
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: '1px solid var(--border)',
        color: 'var(--text-dim)', fontSize: '9px', fontWeight: 300,
        letterSpacing: '0.06em', padding: '4px 10px', borderRadius: '4px',
        cursor: 'pointer', fontFamily: 'var(--font-poppins)',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-dim)'; e.currentTarget.style.color = 'var(--text)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
    >
      {children}
    </button>
  )
}