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
}

const LEVERAGE_PRESETS = [2, 5, 10, 20, 50]

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: '8.5px',
      fontWeight: 700,
      letterSpacing: '0.1em',
      color: 'var(--text-dim)',
      textTransform: 'uppercase',
      display: 'block',
      marginBottom: '4px',
    }}>
      {children}
    </span>
  )
}

function NumericInput({
  value, onChange, placeholder, min, step, suffix,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  min?: string
  step?: string
  suffix?: string
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="number"
        min={min}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontFamily: 'var(--font-poppins)',
          fontSize: '12px',
          fontWeight: 400,
          padding: suffix ? '7px 28px 7px 10px' : '7px 10px',
          borderRadius: '4px',
          outline: 'none',
          appearance: 'textfield',
          WebkitAppearance: 'none',
          fontVariantNumeric: 'tabular-nums',
          transition: 'border-color 0.15s',
          boxSizing: 'border-box',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--acid)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
      />
      {suffix && (
        <span style={{
          position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)',
          fontSize: '9px', color: 'var(--text-dim)', pointerEvents: 'none', letterSpacing: '0.04em',
        }}>
          {suffix}
        </span>
      )}
    </div>
  )
}

function SummaryRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '10px', fontWeight: 600, color: color ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OrderForm({ markPrice, balance, onOrder, orderError, lastFlash, market = 'BTC-PERP' }: OrderFormProps) {
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

  // TP/SL PnL preview
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

  const marginColor = margin > balance ? 'var(--plasma)' : margin > balance * 0.8 ? 'var(--gold)' : 'var(--text)'

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '7px 12px',
        borderBottom: '1px solid var(--border)',
        fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
        color: 'var(--text-dim)', textTransform: 'uppercase',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Place Order</span>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 300 }}>{market}</span>
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
                padding: '8px 4px',
                borderRadius: '3px', border: 'none',
                cursor: 'pointer', fontSize: '11px',
                fontWeight: side === s ? 700 : 300,
                fontFamily: 'var(--font-poppins)', letterSpacing: '0.06em',
                transition: 'all 0.15s',
                background: side === s ? (s === 'Buy' ? 'var(--acid)' : 'var(--plasma)') : 'transparent',
                color: side === s ? (s === 'Buy' ? '#000' : '#fff') : 'var(--text-dim)',
                boxShadow: side === s ? (s === 'Buy' ? '0 0 12px rgba(0,255,136,0.2)' : '0 0 12px rgba(255,59,107,0.2)') : 'none',
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
              fontSize: '9.5px', fontWeight: orderType === t ? 600 : 300,
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
              <FieldLabel>Limit Price</FieldLabel>
              <NumericInput
                value={limitPrice}
                onChange={setLimitPrice}
                placeholder={markPrice.toFixed(1)}
                suffix="USD"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Size ── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <FieldLabel>Size</FieldLabel>
            {qtyNum > 0 && (
              <span style={{ fontSize: '8.5px', color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                ≈ ${notional.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
          <NumericInput
            value={qty}
            onChange={setQty}
            placeholder="1"
            min="1"
            step="1"
            suffix="CONT"
          />
          {/* Quick size buttons */}
          <div style={{ display: 'flex', gap: '3px', marginTop: '5px' }}>
            {[25, 50, 75, 100].map(pct => {
              const maxQty = balance * leverage / fillPrice
              const pctQty = Math.max(1, Math.round(maxQty * pct / 100)).toString()
              return (
                <button key={pct} onClick={() => setQty(pctQty)} style={{
                  flex: 1, padding: '3px 0', fontSize: '8px',
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
            <FieldLabel>Leverage</FieldLabel>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gold)', letterSpacing: '-0.02em' }}>
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
                fontWeight: leverage === l ? 700 : 300,
                background: leverage === l ? 'var(--muted)' : 'transparent',
                border: `1px solid ${leverage === l ? 'var(--text-dim)' : 'var(--border)'}`,
                color: leverage === l ? 'var(--text)' : 'var(--text-dim)',
                borderRadius: '3px', cursor: 'pointer',
                fontFamily: 'var(--font-poppins)', letterSpacing: '0.04em',
                transition: 'all 0.1s',
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
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              TP / SL
            </span>
            <span style={{ fontSize: '8px', color: 'var(--text-dim)', opacity: 0.5 }}>optional</span>
          </div>

          {/* Take Profit */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span style={{ fontSize: '8.5px', color: tpEnabled ? 'var(--acid)' : 'var(--text-dim)', letterSpacing: '0.06em', fontWeight: 600 }}>
                  Take Profit
                </span>
                {tpPnl != null && (
                  <span style={{ fontSize: '8px', color: tpPnl > 0 ? 'var(--acid)' : 'var(--plasma)', fontVariantNumeric: 'tabular-nums' }}>
                    {tpPnl > 0 ? '+' : ''}${tpPnl.toFixed(2)}
                  </span>
                )}
              </div>
              <NumericInput
                value={tpPrice}
                onChange={v => { setTpPrice(v); setTpEnabled(!!v) }}
                placeholder={isBuy ? (fillPrice * 1.02).toFixed(1) : (fillPrice * 0.98).toFixed(1)}
                suffix="USD"
              />
            </div>
            <div
              onClick={() => setTpEnabled(e => !e)}
              style={{
                width: '28px', height: '16px',
                background: tpEnabled ? 'var(--acid)' : 'var(--muted)',
                borderRadius: '8px', cursor: 'pointer',
                position: 'relative', transition: 'background 0.2s',
                flexShrink: 0, marginTop: '16px',
              }}
            >
              <div style={{
                position: 'absolute', top: '2px',
                left: tpEnabled ? '14px' : '2px',
                width: '12px', height: '12px',
                background: '#fff', borderRadius: '50%',
                transition: 'left 0.2s',
              }} />
            </div>
          </div>

          {/* Stop Loss */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span style={{ fontSize: '8.5px', color: slEnabled ? 'var(--plasma)' : 'var(--text-dim)', letterSpacing: '0.06em', fontWeight: 600 }}>
                  Stop Loss
                </span>
                {slPnl != null && (
                  <span style={{ fontSize: '8px', color: slPnl > 0 ? 'var(--acid)' : 'var(--plasma)', fontVariantNumeric: 'tabular-nums' }}>
                    {slPnl > 0 ? '+' : ''}${slPnl.toFixed(2)}
                  </span>
                )}
              </div>
              <NumericInput
                value={slPrice}
                onChange={v => { setSlPrice(v); setSlEnabled(!!v) }}
                placeholder={isBuy ? (fillPrice * 0.97).toFixed(1) : (fillPrice * 1.03).toFixed(1)}
                suffix="USD"
              />
            </div>
            <div
              onClick={() => setSlEnabled(e => !e)}
              style={{
                width: '28px', height: '16px',
                background: slEnabled ? 'var(--plasma)' : 'var(--muted)',
                borderRadius: '8px', cursor: 'pointer',
                position: 'relative', transition: 'background 0.2s',
                flexShrink: 0, marginTop: '16px',
              }}
            >
              <div style={{
                position: 'absolute', top: '2px',
                left: slEnabled ? '14px' : '2px',
                width: '12px', height: '12px',
                background: '#fff', borderRadius: '50%',
                transition: 'left 0.2s',
              }} />
            </div>
          </div>
        </div>

        {/* ── Options: Reduce-only / Post-only ── */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { label: 'Reduce Only', val: reduceOnly, set: setReduceOnly },
            { label: 'Post Only', val: postOnly, set: setPostOnly, disabled: orderType !== 'Limit' },
          ].map(({ label, val, set, disabled }) => (
            <label key={label} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.35 : 1,
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
              <span style={{ fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.05em', userSelect: 'none' }}>
                {label}
              </span>
            </label>
          ))}
        </div>

        {/* ── Order summary ── */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '4px', padding: '8px 10px',
          display: 'flex', flexDirection: 'column', gap: '5px',
        }}>
          <SummaryRow label="Notional" value={`$${notional.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
          <SummaryRow label="Req. Margin" value={`$${margin.toFixed(2)}`} color={marginColor} />
          <div style={{ height: '1px', background: 'var(--border)', margin: '1px 0' }} />
          <SummaryRow label="Available" value={`$${balance.toFixed(2)}`} color="var(--acid)" />
          {liqPrice != null && (
            <SummaryRow
              label="Est. Liq. Price"
              value={`$${liqPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}`}
              color="rgba(255,59,107,0.7)"
            />
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
            padding: '10px',
            borderRadius: '4px', border: 'none',
            cursor: 'pointer',
            fontSize: '11px', fontWeight: 700,
            fontFamily: 'var(--font-poppins)', letterSpacing: '0.06em',
            background: isBuy ? 'var(--acid)' : 'var(--plasma)',
            color: isBuy ? '#000' : '#fff',
            boxShadow: isBuy ? '0 0 18px rgba(0,255,136,0.15)' : '0 0 18px rgba(255,59,107,0.15)',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {isBuy ? '▲ LONG' : '▼ SHORT'} {qty || '0'} @ {leverage}×
        </motion.button>
      </div>
    </div>
  )
}