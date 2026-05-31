'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { OrderParams } from '../lib/simulation'

interface OrderFormProps {
  markPrice: number
  balance: number
  onOrder: (params: OrderParams) => void
  orderError: string | null
  lastFlash: 'buy' | 'sell' | null
  market?: string
  walletConnected?: boolean
  onConnectWallet?: () => void
}

// ─── Predefined contract sizes per market base ────────────────────────────────

const PRESET_SIZES: Record<string, number[]> = {
  'BTC-PERP': [0.1, 0.5, 1, 5, 10],
  'ETH-PERP': [1, 5, 10, 50, 100],
  'SOL-PERP': [10, 50, 100, 500, 1000],
  'BNB-PERP': [1, 5, 10, 50, 100],
  'ARB-PERP': [100, 500, 1000, 5000, 10000],
  'DOGE-PERP': [100, 500, 1000, 5000, 10000],
}
const DEFAULT_PRESETS = [1, 5, 10, 25, 50]

const LEVERAGE_PRESETS = [2, 5, 10, 20, 50]

// ─── Small helpers ────────────────────────────────────────────────────────────

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: '4px' }}>
      <span style={{
        fontSize: '9px', fontWeight: 400, letterSpacing: '0.09em',
        color: 'var(--text-dim)', textTransform: 'uppercase',
      }}>
        {children}
      </span>
      {hint && (
        <span style={{
          fontSize: '8px', fontWeight: 300, color: 'rgba(107,114,128,0.7)',
          marginLeft: '5px', letterSpacing: '0.04em', textTransform: 'none',
        }}>
          {hint}
        </span>
      )}
    </div>
  )
}

function SummaryRow({
  label, hint, value, color,
}: {
  label: string; hint?: string; value: string; color?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px' }}>
      <div>
        <span style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: '7.5px', fontWeight: 300, color: 'rgba(107,114,128,0.55)', marginLeft: '4px' }}>
            {hint}
          </span>
        )}
      </div>
      <span style={{
        fontSize: '10px', fontWeight: 500,
        color: color ?? 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OrderForm({
  markPrice, balance, onOrder, orderError, lastFlash,
  market = 'BTC-PERP', walletConnected = false, onConnectWallet,
}: OrderFormProps) {
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy')
  const [orderType, setOrderType] = useState<'Market' | 'Limit'>('Market')
  const [qty, setQty] = useState('1')
  const [limitPrice, setLimitPrice] = useState('')
  const [leverage, setLeverage] = useState(5)
  const [tpEnabled, setTpEnabled] = useState(false)
  const [slEnabled, setSlEnabled] = useState(false)
  const [tpPrice, setTpPrice] = useState('')
  const [slPrice, setSlPrice] = useState('')
  const [reduceOnly, setReduceOnly] = useState(false)
  const [postOnly, setPostOnly] = useState(false)

  const fillPrice = orderType === 'Limit' && limitPrice ? parseFloat(limitPrice) : markPrice
  const qtyNum = parseFloat(qty || '0')
  const margin = (fillPrice * qtyNum) / leverage
  const notional = fillPrice * qtyNum
  const isBuy = side === 'Buy'

  const presets = PRESET_SIZES[market] ?? DEFAULT_PRESETS

  const tpPnl = useMemo(() => {
    if (!tpEnabled || !tpPrice || !qtyNum) return null
    const tp = parseFloat(tpPrice)
    return isBuy ? (tp - fillPrice) * qtyNum : (fillPrice - tp) * qtyNum
  }, [tpEnabled, tpPrice, qtyNum, fillPrice, isBuy])

  const slPnl = useMemo(() => {
    if (!slEnabled || !slPrice || !qtyNum) return null
    const sl = parseFloat(slPrice)
    return isBuy ? (sl - fillPrice) * qtyNum : (fillPrice - sl) * qtyNum
  }, [slEnabled, slPrice, qtyNum, fillPrice, isBuy])

  const liqPrice = useMemo(() => {
    if (!qtyNum || !leverage) return null
    const mmr = 0.005
    return isBuy
      ? fillPrice * (1 - 1 / leverage + mmr)
      : fillPrice * (1 + 1 / leverage - mmr)
  }, [fillPrice, leverage, qtyNum, isBuy])

  const handleSubmit = useCallback(() => {
    const q = parseFloat(qty)
    if (!q || q <= 0) return
    onOrder({
      side,
      qty: q,
      price: orderType === 'Limit' && limitPrice ? parseFloat(limitPrice) : undefined,
      leverage,
    })
  }, [side, orderType, qty, limitPrice, leverage, onOrder])

  const marginColor = margin > balance
    ? 'var(--plasma)'
    : margin > balance * 0.8
      ? 'var(--gold)'
      : 'var(--text)'

  // ── Input style ──────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontFamily: 'var(--font-poppins)',
    fontSize: '12px', fontWeight: 300,
    padding: '7px 36px 7px 10px',
    borderRadius: '4px', outline: 'none',
    appearance: 'textfield' as const,
    WebkitAppearance: 'none' as const,
    fontVariantNumeric: 'tabular-nums',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '7px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: '9px', fontWeight: 400, letterSpacing: '0.12em',
        color: 'var(--text-dim)', textTransform: 'uppercase',
      }}>
        <span>Place Order</span>
        <span style={{ color: 'rgba(255,255,255,0.15)', fontWeight: 300 }}>{market}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', padding: '10px 12px' }}>

        {/* ── Long / Short ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          background: 'var(--surface)', borderRadius: '5px',
          padding: '3px', gap: '3px',
        }}>
          {(['Buy', 'Sell'] as const).map(s => (
            <motion.button
              key={s}
              onClick={() => setSide(s)}
              whileTap={{ scale: 0.96 }}
              style={{
                padding: '8px 4px', borderRadius: '3px', border: 'none',
                cursor: 'pointer', fontSize: '11px',
                fontWeight: side === s ? 600 : 300,
                fontFamily: 'var(--font-poppins)', letterSpacing: '0.06em',
                transition: 'all 0.15s',
                background: side === s ? (s === 'Buy' ? 'var(--acid)' : 'var(--plasma)') : 'transparent',
                color: side === s ? (s === 'Buy' ? '#000' : '#fff') : 'var(--text-dim)',
                boxShadow: side === s
                  ? (s === 'Buy' ? '0 0 12px rgba(0,255,136,0.18)' : '0 0 12px rgba(255,59,107,0.18)')
                  : 'none',
              }}
            >
              {s === 'Buy' ? '▲ LONG' : '▼ SHORT'}
            </motion.button>
          ))}
        </div>

        {/* ── Order type ── */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['Market', 'Limit'] as const).map(t => (
            <button key={t} onClick={() => setOrderType(t)} style={{
              flex: 1, padding: '5px 4px',
              fontSize: '9.5px', fontWeight: orderType === t ? 500 : 300,
              fontFamily: 'var(--font-poppins)', letterSpacing: '0.06em',
              background: orderType === t ? 'var(--surface)' : 'transparent',
              border: `1px solid ${orderType === t ? 'var(--text-dim)' : 'var(--border)'}`,
              color: orderType === t ? 'var(--text)' : 'var(--text-dim)',
              borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Limit price ── */}
        <AnimatePresence>
          {orderType === 'Limit' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
              style={{ overflow: 'hidden' }}
            >
              <Label hint="trigger price">Limit Price</Label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number" style={inputStyle}
                  placeholder={markPrice.toFixed(1)} value={limitPrice}
                  onChange={e => setLimitPrice(e.target.value)}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--acid)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
                <span style={{ position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: 'var(--text-dim)', pointerEvents: 'none' }}>USD</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Size ── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <Label hint="number of contracts">Size</Label>
            {qtyNum > 0 && (
              <span style={{ fontSize: '8.5px', fontWeight: 300, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                ≈ ${notional.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type="number" min="0.001" step="1"
              placeholder="1" value={qty}
              onChange={e => setQty(e.target.value)}
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--acid)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <span style={{ position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: 'var(--text-dim)', pointerEvents: 'none' }}>CONT</span>
          </div>

          {/* Predefined contract sizes */}
          <div style={{ display: 'flex', gap: '3px', marginTop: '5px' }}>
            {presets.map(p => (
              <button
                key={p}
                onClick={() => setQty(String(p))}
                style={{
                  flex: 1, padding: '3px 0',
                  fontSize: '8px', fontWeight: parseFloat(qty) === p ? 600 : 300,
                  background: parseFloat(qty) === p ? 'var(--muted)' : 'transparent',
                  border: `1px solid ${parseFloat(qty) === p ? 'var(--text-dim)' : 'var(--border)'}`,
                  color: parseFloat(qty) === p ? 'var(--text)' : 'var(--text-dim)',
                  borderRadius: '3px', cursor: 'pointer',
                  fontFamily: 'var(--font-poppins)', letterSpacing: '0.04em',
                  transition: 'all 0.1s',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* % of max size */}
          <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
            {[25, 50, 75, 100].map(pct => {
              const maxQty = balance * leverage / fillPrice
              const pctQty = (maxQty * pct / 100).toFixed(3)
              return (
                <button
                  key={pct}
                  onClick={() => setQty(pctQty)}
                  style={{
                    flex: 1, padding: '3px 0', fontSize: '8px', fontWeight: 300,
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-dim)', borderRadius: '3px',
                    cursor: 'pointer', fontFamily: 'var(--font-poppins)',
                    letterSpacing: '0.04em', transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-dim)'; e.currentTarget.style.color = 'var(--text)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                >
                  {pct}%
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Leverage ── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <Label hint="amplifies gains and losses">Leverage</Label>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gold)', letterSpacing: '-0.02em' }}>
              {leverage}×
            </span>
          </div>
          <input
            type="range" min="1" max="50" step="1" value={leverage}
            onChange={e => setLeverage(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--acid)', cursor: 'pointer', marginBottom: '5px', height: '3px' }}
          />
          <div style={{ display: 'flex', gap: '3px' }}>
            {LEVERAGE_PRESETS.map(l => (
              <button key={l} onClick={() => setLeverage(l)} style={{
                flex: 1, fontSize: '8.5px', padding: '3px 0',
                fontWeight: leverage === l ? 600 : 300,
                background: leverage === l ? 'var(--muted)' : 'transparent',
                border: `1px solid ${leverage === l ? 'var(--text-dim)' : 'var(--border)'}`,
                color: leverage === l ? 'var(--text)' : 'var(--text-dim)',
                borderRadius: '3px', cursor: 'pointer',
                fontFamily: 'var(--font-poppins)', letterSpacing: '0.04em', transition: 'all 0.1s',
              }}>
                {l}×
              </button>
            ))}
          </div>
        </div>

        {/* ── TP / SL ── */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '4px', padding: '8px 10px',
          display: 'flex', flexDirection: 'column', gap: '7px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', fontWeight: 400, letterSpacing: '0.08em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              TP / SL
            </span>
            <span style={{ fontSize: '7.5px', fontWeight: 300, color: 'rgba(107,114,128,0.5)' }}>take profit &amp; stop loss — optional</span>
          </div>

          {/* Take Profit */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span style={{ fontSize: '8.5px', fontWeight: 300, color: tpEnabled ? 'var(--acid)' : 'var(--text-dim)', letterSpacing: '0.04em' }}>
                  Take Profit
                </span>
                {tpPnl != null && (
                  <span style={{ fontSize: '8px', fontWeight: 300, color: tpPnl > 0 ? 'var(--acid)' : 'var(--plasma)', fontVariantNumeric: 'tabular-nums' }}>
                    {tpPnl > 0 ? '+' : ''}${tpPnl.toFixed(2)}
                  </span>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="number" style={inputStyle}
                  placeholder={isBuy ? (fillPrice * 1.02).toFixed(1) : (fillPrice * 0.98).toFixed(1)}
                  value={tpPrice}
                  onChange={e => { setTpPrice(e.target.value); setTpEnabled(!!e.target.value) }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--acid)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
                <span style={{ position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: 'var(--text-dim)', pointerEvents: 'none' }}>USD</span>
              </div>
            </div>
            <Toggle active={tpEnabled} color="var(--acid)" onChange={setTpEnabled} topOffset="16px" />
          </div>

          {/* Stop Loss */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span style={{ fontSize: '8.5px', fontWeight: 300, color: slEnabled ? 'var(--plasma)' : 'var(--text-dim)', letterSpacing: '0.04em' }}>
                  Stop Loss
                </span>
                {slPnl != null && (
                  <span style={{ fontSize: '8px', fontWeight: 300, color: slPnl > 0 ? 'var(--acid)' : 'var(--plasma)', fontVariantNumeric: 'tabular-nums' }}>
                    {slPnl > 0 ? '+' : ''}${slPnl.toFixed(2)}
                  </span>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="number" style={inputStyle}
                  placeholder={isBuy ? (fillPrice * 0.97).toFixed(1) : (fillPrice * 1.03).toFixed(1)}
                  value={slPrice}
                  onChange={e => { setSlPrice(e.target.value); setSlEnabled(!!e.target.value) }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--plasma)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
                <span style={{ position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: 'var(--text-dim)', pointerEvents: 'none' }}>USD</span>
              </div>
            </div>
            <Toggle active={slEnabled} color="var(--plasma)" onChange={setSlEnabled} topOffset="16px" />
          </div>
        </div>

        {/* ── Options ── */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { label: 'Reduce Only', hint: 'only closes existing position', val: reduceOnly, set: setReduceOnly, disabled: false },
            { label: 'Post Only', hint: 'maker order — no taker fee', val: postOnly, set: setPostOnly, disabled: orderType !== 'Limit' },
          ].map(({ label, hint, val, set, disabled }) => (
            <label key={label} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.3 : 1,
            }}>
              <div
                onClick={() => !disabled && set((v: boolean) => !v)}
                style={{
                  width: '12px', height: '12px',
                  border: `1.5px solid ${val ? 'var(--acid)' : 'var(--border)'}`,
                  borderRadius: '2px',
                  background: val ? 'var(--acid)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s', flexShrink: 0,
                }}
              >
                {val && <span style={{ fontSize: '8px', color: '#000', lineHeight: 1, fontWeight: 900 }}>✓</span>}
              </div>
              <span style={{ fontSize: '8px', fontWeight: 300, color: 'var(--text-dim)', userSelect: 'none' }}>
                {label}
                {hint && <span style={{ color: 'rgba(107,114,128,0.5)', marginLeft: '3px' }}>— {hint}</span>}
              </span>
            </label>
          ))}
        </div>

        {/* ── Summary ── */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '4px', padding: '8px 10px',
          display: 'flex', flexDirection: 'column', gap: '5px',
        }}>
          <SummaryRow label="Notional" hint="position value" value={`$${notional.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
          <SummaryRow label="Req. Margin" hint="collateral locked" value={`$${margin.toFixed(2)}`} color={marginColor} />
          <div style={{ height: '1px', background: 'var(--border)', margin: '1px 0' }} />
          <SummaryRow label="Available" hint="free balance" value={`$${balance.toFixed(2)}`} color="var(--acid)" />
          {liqPrice != null && (
            <SummaryRow label="Est. Liq. Price" hint="forced close below/above" value={`$${liqPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}`} color="rgba(255,59,107,0.65)" />
          )}
        </div>

        {/* ── Error ── */}
        <AnimatePresence>
          {orderError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{
                fontSize: '9.5px', fontWeight: 300, color: 'var(--plasma)',
                padding: '7px 9px', lineHeight: 1.45,
                background: 'rgba(255,59,107,0.07)',
                border: '1px solid rgba(255,59,107,0.2)',
                borderRadius: '4px',
              }}
            >
              {orderError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Submit ── */}
        <motion.button
          onClick={handleSubmit}
          whileTap={{ scale: 0.97 }}
          style={{
            padding: '10px', borderRadius: '4px', border: 'none',
            cursor: 'pointer',
            fontSize: '11px', fontWeight: 600,
            fontFamily: 'var(--font-poppins)', letterSpacing: '0.06em',
            background: isBuy ? 'var(--acid)' : 'var(--plasma)',
            color: isBuy ? '#000' : '#fff',
            boxShadow: isBuy ? '0 0 18px rgba(0,255,136,0.12)' : '0 0 18px rgba(255,59,107,0.12)',
            transition: 'opacity 0.15s',
          }}
        >
          {isBuy ? '▲ LONG' : '▼ SHORT'} {qty || '0'} @ {leverage}×
        </motion.button>
      </div>

      {/* ── Wallet gate overlay ── */}
      <AnimatePresence>
        {!walletConnected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(8,10,15,0.82)',
              backdropFilter: 'blur(3px)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '12px', zIndex: 10,
              borderRadius: '2px',
            }}
          >
            {/* Phantom logo-ish icon */}
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #9945FF, #6C3EC2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', boxShadow: '0 0 24px rgba(153,69,255,0.35)',
            }}>
              👻
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.04em', marginBottom: '4px' }}>
                Connect Wallet to Trade
              </div>
              <div style={{ fontSize: '9px', fontWeight: 300, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                You're in view-only mode.<br />Connect Phantom to place orders.
              </div>
            </div>
            <button
              onClick={onConnectWallet}
              style={{
                padding: '9px 24px',
                background: 'linear-gradient(135deg, #9945FF, #6C3EC2)',
                border: 'none', borderRadius: '6px',
                color: '#fff', fontSize: '11px', fontWeight: 600,
                fontFamily: 'var(--font-poppins)', letterSpacing: '0.06em',
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(153,69,255,0.3)',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              Connect Phantom
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  active, color, onChange, topOffset = '0px',
}: {
  active: boolean; color: string; onChange: (v: boolean) => void; topOffset?: string
}) {
  return (
    <div
      onClick={() => onChange(!active)}
      style={{
        width: '28px', height: '16px',
        background: active ? color : 'var(--muted)',
        borderRadius: '8px', cursor: 'pointer',
        position: 'relative', transition: 'background 0.2s',
        flexShrink: 0, marginTop: topOffset,
      }}
    >
      <div style={{
        position: 'absolute', top: '2px',
        left: active ? '14px' : '2px',
        width: '12px', height: '12px',
        background: '#fff', borderRadius: '50%',
        transition: 'left 0.2s',
      }} />
    </div>
  )
}