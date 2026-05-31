'use client'

import { useMemo, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  price?: number
}

interface PriceChartProps {
  history: Candle[]
  markPrice: number
  liquidated?: boolean
  market?: string
}

const W = 900
const H = 240
const PAD = { top: 16, right: 68, bottom: 24, left: 4 }

const ZOOM_LEVELS = [20, 40, 60, 80, 120, 180, 260]
const DEFAULT_ZOOM = 3  // index → 80 candles

function lerp(v: number, iMin: number, iMax: number, oMin: number, oMax: number) {
  // FIX: artificial padding when all prices identical — prevents flat chart
  if (iMax <= iMin) return (oMin + oMax) / 2
  return oMin + ((v - iMin) / (iMax - iMin)) * (oMax - oMin)
}

export default function PriceChart({ history, markPrice, liquidated, market = 'BTC-PERP' }: PriceChartProps) {
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM)
  const svgRef = useRef<SVGSVGElement>(null)

  const zoomIn = useCallback(() => setZoomIdx(i => Math.max(0, i - 1)), [])
  const zoomOut = useCallback(() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1)), [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else zoomOut()
  }, [zoomIn, zoomOut])

  const visibleCount = ZOOM_LEVELS[zoomIdx]

  const { candles, latestX, latestY, gridLines, timeLabels, priceDir } = useMemo(() => {
    if (history.length < 2) {
      return { candles: [], latestX: 0, latestY: H / 2, gridLines: [], timeLabels: [], priceDir: 'flat' as const }
    }

    const chartW = W - PAD.left - PAD.right
    const visible = history.slice(-Math.min(history.length, visibleCount))
    const n = visible.length

    const candleW = Math.max(2, Math.min(12, Math.floor(chartW / n) - 1))
    const gap = Math.max(1, Math.floor(chartW / n) - candleW)
    const totalW = n * (candleW + gap) - gap
    const startX = W - PAD.right - totalW

    const allLows = visible.map(h => h.low ?? h.price ?? markPrice)
    const allHighs = visible.map(h => h.high ?? h.price ?? markPrice)
    const rawMin = Math.min(...allLows)
    const rawMax = Math.max(...allHighs)

    // FIX: if range is zero or near-zero, add artificial padding so chart isn't flat
    const range = rawMax - rawMin
    const pad = range > 0 ? range * 0.12 : Math.max(markPrice * 0.005, 1)
    const minP = rawMin - pad
    const maxP = rawMax + pad

    const toY = (p: number) => lerp(p, minP, maxP, H - PAD.bottom, PAD.top)

    const candles = visible.map((c, i) => {
      const x = startX + i * (candleW + gap)
      const open = c.open ?? c.price ?? markPrice
      const close = c.close ?? c.price ?? markPrice
      const high = c.high ?? Math.max(open, close)
      const low = c.low ?? Math.min(open, close)
      const isBull = close >= open
      const bodyTop = toY(Math.max(open, close))
      const bodyBottom = toY(Math.min(open, close))
      return {
        x, cx: x + candleW / 2, candleW,
        open, close, high, low,
        wickTop: toY(high), wickBottom: toY(low),
        bodyTop,
        bodyH: Math.max(1.5, bodyBottom - bodyTop), // FIX: min 1.5px body
        isBull,
      }
    })

    const last = candles[candles.length - 1]
    const latestX = last?.cx ?? W - PAD.right
    const latestY = last ? toY(last.close) : H / 2

    // 5 horizontal grid lines
    const gridLines = Array.from({ length: 5 }, (_, i) => {
      const t = i / 4
      const price = minP + t * (maxP - minP)
      return { y: toY(price), price: Math.round(price) }
    })

    // ~5 time labels
    const step = Math.max(1, Math.floor(n / 5))
    const timeLabels = visible
      .filter((_, i) => i % step === 0)
      .map((h, idx) => {
        const d = new Date(h.time)
        const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
        return { x: startX + (idx * step) * (candleW + gap) + candleW / 2, label }
      })

    const last2 = history.slice(-2)
    const priceDir = last2.length === 2
      ? last2[1].close > last2[0].close ? 'up'
        : last2[1].close < last2[0].close ? 'down'
          : 'flat'
      : 'flat'

    return { candles, latestX, latestY, gridLines, timeLabels, priceDir }
  }, [history, markPrice, visibleCount])

  const lineColor = priceDir === 'up' ? '#00FF88' : priceDir === 'down' ? '#FF3B6B' : '#38BDF8'

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: '8px',
      }}>
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
          Price Chart — {market}
        </span>

        {/* Zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.06em', marginRight: '2px' }}>
            {visibleCount}C
          </span>
          <button
            onClick={zoomIn}
            disabled={zoomIdx === 0}
            title="Zoom in"
            style={{
              width: '18px', height: '18px',
              background: zoomIdx === 0 ? 'transparent' : 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              color: zoomIdx === 0 ? 'var(--muted)' : 'var(--text)',
              fontSize: '12px', lineHeight: 1,
              cursor: zoomIdx === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.1s, border-color 0.1s',
              fontFamily: 'monospace',
            }}
          >+</button>
          <button
            onClick={zoomOut}
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            title="Zoom out"
            style={{
              width: '18px', height: '18px',
              background: zoomIdx === ZOOM_LEVELS.length - 1 ? 'transparent' : 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              color: zoomIdx === ZOOM_LEVELS.length - 1 ? 'var(--muted)' : 'var(--text)',
              fontSize: '12px', lineHeight: 1,
              cursor: zoomIdx === ZOOM_LEVELS.length - 1 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.1s, border-color 0.1s',
              fontFamily: 'monospace',
            }}
          >−</button>

          {/* Zoom bar dots */}
          <div style={{ display: 'flex', gap: '2px', alignItems: 'center', marginLeft: '2px' }}>
            {ZOOM_LEVELS.map((_, i) => (
              <div
                key={i}
                onClick={() => setZoomIdx(i)}
                style={{
                  width: i === zoomIdx ? '8px' : '4px',
                  height: '4px',
                  borderRadius: '2px',
                  background: i === zoomIdx ? 'var(--acid)' : 'var(--muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              />
            ))}
          </div>
        </div>

        {/* Right: liquidation tag + price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {liquidated && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: 4, duration: 0.35 }}
              style={{ fontSize: '9px', fontWeight: 700, color: 'var(--plasma)', letterSpacing: '0.1em' }}
            >
              ⚡ LIQUIDATED
            </motion.span>
          )}
          <motion.span
            key={Math.round(markPrice)}
            animate={{ opacity: [0.7, 1] }}
            style={{
              fontSize: '14px', fontWeight: 700,
              color: lineColor,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ${markPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}
          </motion.span>
        </div>
      </div>

      {/* ── SVG canvas ── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }} onWheel={onWheel}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          width="100%"
          height="100%"
          style={{ display: 'block', cursor: 'crosshair' }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Grid lines */}
          {gridLines.map(({ y, price }) => (
            <g key={`grid-${price}`}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              <text x={W - PAD.right + 5} y={y + 4}
                fill="rgba(255,255,255,0.25)" fontSize="8.5" fontFamily="var(--font-poppins)">
                {price.toLocaleString()}
              </text>
            </g>
          ))}

          {/* Candlesticks */}
          {candles.map((c, i) => (
            <g key={`c-${i}-${c.close}`}>
              <line
                x1={c.cx} y1={c.wickTop}
                x2={c.cx} y2={c.wickBottom}
                stroke={c.isBull ? '#00C870' : '#CC2F56'}
                strokeWidth={c.candleW <= 4 ? '0.8' : '1'}
                opacity="0.75"
              />
              <rect
                x={c.x} y={c.bodyTop}
                width={c.candleW} height={c.bodyH}
                fill={c.isBull ? '#00FF88' : '#FF3B6B'}
                opacity={c.isBull ? 0.85 : 0.78}
              />
            </g>
          ))}

          {/* Current price dashed line */}
          {candles.length > 0 && (
            <motion.line
              x1={PAD.left + 4} x2={W - PAD.right}
              animate={{ y1: latestY, y2: latestY }}
              transition={{ type: 'spring', stiffness: 180, damping: 22 }}
              stroke={lineColor} strokeWidth="0.6"
              strokeDasharray="3 4" opacity={0.55}
            />
          )}

          {/* Latest price dot */}
          {candles.length > 0 && (
            <motion.circle
              cx={latestX}
              animate={{ cy: latestY }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
              r={3.5} fill={lineColor}
              filter="url(#glow)"
            />
          )}

          {/* Floating price label on right axis */}
          {candles.length > 0 && (
            <>
              <motion.rect
                x={W - PAD.right + 1} width={PAD.right - 2} height={14}
                animate={{ y: latestY - 7 }}
                transition={{ type: 'spring', stiffness: 180, damping: 22 }}
                fill={lineColor} rx="2" opacity="0.9"
              />
              <motion.text
                x={W - PAD.right + 4}
                animate={{ y: latestY + 4 }}
                transition={{ type: 'spring', stiffness: 180, damping: 22 }}
                fill="#000" fontSize="8" fontWeight="700"
                fontFamily="var(--font-poppins)"
              >
                {markPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </motion.text>
            </>
          )}

          {/* Liquidation flash */}
          {liquidated && (
            <motion.rect x={0} y={0} width={W} height={H}
              fill="rgba(255,59,107,0.12)"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0, 1, 0] }}
              transition={{ duration: 0.7 }}
            />
          )}

          {/* Time axis labels */}
          {timeLabels.map(({ x, label }) => (
            <text key={`t-${label}`} x={x} y={H - 4}
              fill="rgba(255,255,255,0.18)" fontSize="7.5"
              textAnchor="middle" fontFamily="var(--font-poppins)">
              {label}
            </text>
          ))}
        </svg>

        {/* Scroll hint */}
        <div style={{
          position: 'absolute', bottom: '28px', right: '74px',
          fontSize: '7.5px', color: 'var(--text-dim)',
          opacity: 0.4, pointerEvents: 'none', letterSpacing: '0.06em',
        }}>
          scroll to zoom
        </div>
      </div>
    </div>
  )
}